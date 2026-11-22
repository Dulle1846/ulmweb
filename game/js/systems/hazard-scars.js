// 1.2.20 — spatial hazard scars and permanent terrain conversion.
//
// A scar is not a counter: it is the saved record of a tile the hazard changed.
// Lava and lost ground are permanent impassable basalt/rock; burnt ground has
// charred vegetation and reduced timber capacity; floodwater raises moisture,
// cuts roads and leaves a wet, weakened resource tile behind. The list is
// bounded, while the permanent kinds keep their oldest marks instead of
// silently deleting the map history when the cap is reached.
import { state } from "../core/state.js";
import { damageHazardNodeAt } from "./resource-geography.js";

export const HAZARD_SCAR_VERSION = 1;
export const HAZARD_SCAR_LIMIT = 48;
export const HAZARD_SCAR_KINDS = Object.freeze(["burnt", "flooded", "lava", "lost", "corruption"]);

// The map and the panel use the same labels. Keep a single style contract so a
// rendered tile, a map swatch and a legend never drift apart.
export const HAZARD_TERRAIN_STYLES = Object.freeze({
    burnt: Object.freeze({
        label: "Burnt woodland", short: "Burnt", note: "charred vegetation, timber capacity reduced",
        fill: "rgba(53, 42, 31, 0.52)", accent: "#9b633b", legend: "#6f432a"
    }),
    flooded: Object.freeze({
        label: "Flooded ground", short: "Flooded", note: "wet ground, moisture raised, roads cut",
        fill: "rgba(52, 93, 108, 0.48)", accent: "#8ab5be", legend: "#527f8b"
    }),
    lava: Object.freeze({
        label: "Lava field", short: "Lava", note: "permanent basalt, impassable",
        fill: "rgba(48, 27, 23, 0.78)", accent: "#d7653b", legend: "#6e2c24"
    }),
    lost: Object.freeze({
        label: "Lost ground", short: "Lost", note: "permanent broken ground, impassable",
        fill: "rgba(42, 38, 33, 0.72)", accent: "#887b68", legend: "#39332c"
    }),
    corruption: Object.freeze({
        label: "Corrupted ground", short: "Corrupt", note: "forage blocked, taint can spread",
        fill: "rgba(96, 59, 111, 0.46)", accent: "#b58bc7", legend: "#6f4b7f"
    })
});

const SCAR_LIMITS = Object.freeze({ burnt: 32, flooded: 32, lava: 48, lost: 48, corruption: 16 });
const PERMANENT = new Set(["lava", "lost"]);
const MOISTURE_OFFSETS = Object.freeze({ burnt: -0.12, flooded: 0.26, lava: -0.2, lost: -0.12, corruption: -0.04 });
const PRIORITY = Object.freeze({ lava: 5, lost: 4, flooded: 3, burnt: 2, corruption: 1 });

const int = (value, fallback = 0) => Math.trunc(Number.isFinite(Number(value)) ? Number(value) : fallback);
const positive = value => Math.max(0, int(value));

export function createHazardScars() {
    return {
        version: HAZARD_SCAR_VERSION,
        revision: 0,
        burnt: [],
        flooded: [],
        lava: [],
        lost: [],
        corruption: []
    };
}

function limitFor(kind) {
    return SCAR_LIMITS[kind] || 16;
}

function sanitizeMarks(value, kind) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    const marks = [];
    for (const item of list) {
        const x = int(item?.x, -1), y = int(item?.y, -1);
        if (x < 0 || y < 0) continue;
        const key = x + ":" + y;
        if (seen.has(key)) continue;
        seen.add(key);
        marks.push({ kind, x, y, year: Math.min(9999, positive(item?.year)) });
        if (marks.length >= limitFor(kind)) break;
    }
    return marks;
}

export function normalizeHazardScars(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        version: HAZARD_SCAR_VERSION,
        revision: positive(source.revision),
        burnt: sanitizeMarks(source.burnt, "burnt"),
        flooded: sanitizeMarks(source.flooded, "flooded"),
        lava: sanitizeMarks(source.lava, "lava"),
        lost: sanitizeMarks(source.lost, "lost"),
        corruption: sanitizeMarks(source.corruption, "corruption")
    };
}

export function ensureHazardScars(entry) {
    if (!entry || typeof entry !== "object") return createHazardScars();
    if (!entry.scars || typeof entry.scars !== "object" || Array.isArray(entry.scars)) entry.scars = createHazardScars();
    return entry.scars;
}

function tileKey(x, y) {
    return (int(y) * 4096) + int(x);
}

function tileIndex(x, y) {
    return (int(y) * (Number(state.worldW) || 4096)) + int(x);
}

let terrainCacheSource = null;
let terrainCacheRevision = -1;
let terrainCacheYear = -1;
let terrainByIndex = new Map();
let blockedByIndex = new Set();
let forageByIndex = new Set();

function ensureTerrainCache(scars) {
    const year = positive(state.year);
    if (terrainCacheSource === scars && terrainCacheRevision === positive(scars.revision) && terrainCacheYear === year) return;
    terrainByIndex = new Map();
    blockedByIndex = new Set();
    forageByIndex = new Set();
    const moisture = new Map();
    for (const kind of HAZARD_SCAR_KINDS) {
        const marks = Array.isArray(scars[kind]) ? scars[kind] : [];
        for (const mark of marks) {
            const index = tileIndex(mark.x, mark.y);
            const current = terrainByIndex.get(index);
            if (!current || (PRIORITY[kind] || 0) > (PRIORITY[current.kind] || 0)) {
                const moistureOffset = MOISTURE_OFFSETS[kind] || 0;
                terrainByIndex.set(index, {
                    kind, x: int(mark.x), y: int(mark.y), year: positive(mark.year),
                    permanentBlocked: kind === "lava" || kind === "lost",
                    floodActive: kind === "flooded" && positive(mark.year) >= year - 1,
                    moisture: moistureOffset
                });
                moisture.set(index, moistureOffset);
            }
            if (kind === "lava" || kind === "lost") blockedByIndex.add(index);
            if (kind === "flooded" && positive(mark.year) >= year - 1) blockedByIndex.add(index);
            if (kind === "corruption") forageByIndex.add(index);
        }
    }
    state.hazardMoisture = moisture;
    terrainCacheSource = scars;
    terrainCacheRevision = positive(scars.revision);
    terrainCacheYear = year;
}

function invalidateTerrainCache() {
    terrainCacheSource = null;
    terrainCacheRevision = -1;
    terrainCacheYear = -1;
}

/**
 * The terrain status at a real map tile. This is the single read path used by
 * the renderer, the resource survey and tests; it is not a second scar list.
 */
export function getHazardTerrainAt(x, y) {
    const scars = state.environmentalHazards?.scars;
    if (!scars || typeof scars !== "object") return null;
    ensureTerrainCache(scars);
    const status = terrainByIndex.get(tileIndex(x, y));
    if (!status) return null;
    return {
        ...status,
        label: HAZARD_TERRAIN_STYLES[status.kind]?.label || status.kind,
        note: HAZARD_TERRAIN_STYLES[status.kind]?.note || "",
        blocked: status.permanentBlocked || status.floodActive
    };
}

/** Moisture offset applied by the hazard terrain layer. */
export function getHazardMoistureOffsetAt(x, y) {
    const scars = state.environmentalHazards?.scars;
    if (!scars || typeof scars !== "object") return 0;
    ensureTerrainCache(scars);
    return Number(state.hazardMoisture?.get(tileIndex(x, y))) || 0;
}

function scatterTiles(kind, x, y, count) {
    const W = Math.max(1, Number(state.worldW) || 1);
    const H = Math.max(1, Number(state.worldH) || 1);
    const wanted = Math.max(0, Math.min(4, int(count)));
    if (!wanted) return [];
    const seed = Number(state.worldSeed) || 1;
    const salt = kind === "flooded" ? 0x464c4f44 : kind === "lava" ? 0x4c415641 : 0x57494c44;
    const roll = Math.abs((Math.imul(seed ^ salt, 0x9e3779b1) ^ Math.imul(positive(state.year) + 1, 0x85ebca6b)) >>> 0);
    const offsets = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const start = roll % offsets.length;
    const result = [];
    for (let step = 0; step < offsets.length && result.length < wanted; step++) {
        const [dx, dy] = offsets[(start + step) % offsets.length];
        const tx = int(x) + dx, ty = int(y) + dy;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        if (tx === int(x) && ty === int(y)) continue;
        result.push([tx, ty]);
    }
    return result;
}

function applyTerrainAt(entry, kind, x, y, { count = true } = {}) {
    const damage = damageHazardNodeAt(x, y, kind);
    if (entry?.chronic && count) {
        if (kind !== "corruption") entry.chronic.terrainTiles = Math.min(4096, positive(entry.chronic.terrainTiles) + 1);
        if (damage && (damage.forestCapacityLost > 0 || damage.stoneCapacityLost > 0)) {
            entry.chronic.nodesLost = Math.min(4096, positive(entry.chronic.nodesLost) + 1);
        }
    }
    invalidateTerrainCache();
    markHazardTerrainDirty();
    return damage;
}

/** Add one marked tile. Permanent marks are never evicted by newer lava/lost. */
export function addHazardScar(entry, kind, x, y, year = state.year, options = {}) {
    if (!HAZARD_SCAR_KINDS.includes(kind)) return null;
    const scars = ensureHazardScars(entry);
    const list = scars[kind] || (scars[kind] = []);
    const tx = int(x, -1), ty = int(y, -1);
    if (tx < 0 || ty < 0) return null;
    if (list.some(mark => mark.x === tx && mark.y === ty)) return null;
    if (list.length >= limitFor(kind)) {
        // Lava and lost ground are permanent map history. Once their bounded
        // cap is reached, further marks are ignored rather than deleting old
        // terrain that the player can still see and walk around.
        if (PERMANENT.has(kind)) return null;
        list.shift();
    }
    const mark = { kind, x: tx, y: ty, year: Math.min(9999, positive(year)) };
    list.push(mark);
    scars.revision = positive(scars.revision) + 1;
    applyTerrainAt(entry, kind, tx, ty);
    return mark;
}

export function recordWildfireScar(entry, x, y, options = {}) {
    const spread = Math.max(0, Math.min(4, int(options.spread, 0)));
    const mark = addHazardScar(entry, "burnt", x, y);
    const marks = mark ? [mark] : [];
    for (const [tx, ty] of scatterTiles("burnt", x, y, spread)) {
        const extra = addHazardScar(entry, "burnt", tx, ty);
        if (extra) marks.push(extra);
    }
    if (entry?.chronic) entry.chronic.burntTiles = Math.min(4096, positive(entry.chronic.burntTiles) + marks.length);
    return { mark, burnt: marks.length, marks };
}

export function recordFloodScar(entry, x, y, options = {}) {
    const spread = Math.max(0, Math.min(4, int(options.spread, 0)));
    const mark = addHazardScar(entry, "flooded", x, y);
    const marks = mark ? [mark] : [];
    for (const [tx, ty] of scatterTiles("flooded", x, y, spread)) {
        const extra = addHazardScar(entry, "flooded", tx, ty);
        if (extra) marks.push(extra);
    }
    return { mark, marks };
}

export function recordLavaScar(entry, x, y, options = {}) {
    const spread = Math.max(0, Math.min(4, int(options.spread, 0)));
    const mark = addHazardScar(entry, "lava", x, y);
    const marks = mark ? [mark] : [];
    for (const [tx, ty] of scatterTiles("lava", x, y, spread)) {
        const extra = addHazardScar(entry, "lava", tx, ty);
        if (extra) marks.push(extra);
    }
    if (entry?.chronic && marks.length) entry.chronic.lostGround = Math.min(4096, positive(entry.chronic.lostGround) + marks.length);
    return { mark, marks, status: getHazardTerrainAt(x, y) };
}

export function recordLostGround(entry, x, y) {
    const mark = addHazardScar(entry, "lost", x, y);
    if (mark && entry?.chronic) entry.chronic.lostGround = Math.min(4096, positive(entry.chronic.lostGround) + 1);
    return mark;
}

export function recordCorruptionScar(entry, x, y) {
    return addHazardScar(entry, "corruption", x, y);
}

/**
 * Corruption advances from the old ground. One new tile per year, chosen from
 * the keep or the last corrupted mark, so the burden is visible and bounded.
 */
export function spreadHazardCorruption(entry, amount = 1) {
    const scars = ensureHazardScars(entry);
    let added = 0;
    for (let step = 0; step < Math.max(0, Math.min(2, int(amount, 1))); step++) {
        if (scars.corruption.length >= limitFor("corruption")) break;
        const seed = Number(state.worldSeed) || 1;
        const keep = (state.entities || []).find(entity => !entity.dead && entity.type === 0);
        const cx = keep ? Math.floor(keep.x) : Math.floor((Number(state.worldW) || 2) / 2);
        const cy = keep ? Math.floor(keep.y) : Math.floor((Number(state.worldH) || 2) / 2);
        const last = scars.corruption[scars.corruption.length - 1];
        const anchorX = last ? last.x : cx;
        const anchorY = last ? last.y : cy;
        const roll = Math.abs((Math.imul(seed + step, 0x9e3779b1) ^ Math.imul(positive(state.year) + 1, 0x85ebca6b)) >>> 0);
        const dx = (roll % 3) - 1;
        const dy = (Math.floor(roll / 3) % 3) - 1;
        const mark = addHazardScar(entry, "corruption", anchorX + dx, anchorY + dy);
        if (mark) added++;
    }
    return added;
}

/** True for permanently lost ground, lava and fresh floodwater. */
export function isHazardTileBlocked(x, y) {
    const scars = state.environmentalHazards?.scars;
    if (!scars || typeof scars !== "object") return false;
    ensureTerrainCache(scars);
    return blockedByIndex.has(tileIndex(x, y));
}

/**
 * Forbidden growth and corrupted ground close a forage tile. The deterministic
 * roll means the same woodland grove is dangerous until the ground is cleansed.
 */
export function isHazardForageBlocked(x, y) {
    const entry = state.environmentalHazards;
    const scars = entry?.scars;
    const tx = Math.floor(Number(x) || 0), ty = Math.floor(Number(y) || 0);
    if (scars && typeof scars === "object") {
        ensureTerrainCache(scars);
        if (forageByIndex.has(tileIndex(tx, ty))) return true;
    }
    const forbidden = Number(entry?.magic?.forbidden) || 0;
    if (forbidden < 0.25) return false;
    const seed = Number(state.worldSeed) || 1;
    const roll = Math.abs((Math.imul(tx + 1, 0x27d4eb2d) ^ Math.imul(ty + 1, 0x165667b1) ^ seed) >>> 0) % 1000;
    return roll < forbidden * 360;
}

/** Clear one mark, used by cleansing and resettlement. */
export function clearHazardScar(entry, kind, x, y) {
    if (!HAZARD_SCAR_KINDS.includes(kind) || !entry?.scars) return false;
    const list = entry.scars[kind] || [];
    const index = list.findIndex(mark => mark.x === int(x) && mark.y === int(y));
    if (index < 0) return false;
    list.splice(index, 1);
    entry.scars.revision = positive(entry.scars.revision) + 1;
    invalidateTerrainCache();
    markHazardTerrainDirty();
    return true;
}

export function clearOneHazardScar(entry, kind) {
    if (!entry?.scars || !HAZARD_SCAR_KINDS.includes(kind)) return null;
    const list = entry.scars[kind] || [];
    if (!list.length) return null;
    const mark = list.shift();
    entry.scars.revision = positive(entry.scars.revision) + 1;
    invalidateTerrainCache();
    markHazardTerrainDirty();
    return mark;
}

/**
 * Re-apply saved scar effects to a freshly generated resource layer. New saves
 * already carry sparse capacity deltas, so `resources` is false there; the
 * visual cache and moisture map are always rebuilt. Older 3.39 saves have no
 * capacity deltas and are converted here without tile corruption.
 */
export function applyHazardTerrainScars(entry, { resources = true } = {}) {
    const scars = normalizeHazardScars(entry?.scars);
    entry.scars = scars;
    invalidateTerrainCache();
    if (resources) {
        const unique = new Set();
        let nodesLost = 0;
        for (const kind of HAZARD_SCAR_KINDS) {
            for (const mark of scars[kind]) {
                const damage = applyTerrainAt(entry, kind, mark.x, mark.y, { count: false });
                if (kind !== "corruption") unique.add(tileKey(mark.x, mark.y));
                if (damage && (damage.forestCapacityLost > 0 || damage.stoneCapacityLost > 0)) nodesLost++;
            }
        }
        if (entry?.chronic) {
            entry.chronic.terrainTiles = Math.max(positive(entry.chronic.terrainTiles), unique.size);
            entry.chronic.nodesLost = Math.max(positive(entry.chronic.nodesLost), nodesLost);
        }
    } else {
        ensureTerrainCache(scars);
    }
    markHazardTerrainDirty();
    return scars;
}

/** Lightweight snapshot for the player panel and tests. */
export function getHazardScarSnapshot() {
    const scars = normalizeHazardScars(state.environmentalHazards?.scars);
    const terrainCounts = Object.fromEntries(HAZARD_SCAR_KINDS.map(kind => [kind, 0]));
    const covered = new Set();
    for (const kind of HAZARD_SCAR_KINDS) {
        for (const mark of scars[kind]) {
            covered.add(tileKey(mark.x, mark.y));
            if (kind !== "corruption") terrainCounts[kind]++;
        }
    }
    return {
        version: scars.version,
        counts: Object.fromEntries(HAZARD_SCAR_KINDS.map(kind => [kind, scars[kind].length])),
        terrainCounts,
        terrainTiles: covered.size,
        burnt: scars.burnt.map(mark => ({ ...mark })),
        flooded: scars.flooded.map(mark => ({ ...mark })),
        lava: scars.lava.map(mark => ({ ...mark })),
        lost: scars.lost.map(mark => ({ ...mark })),
        corruption: scars.corruption.map(mark => ({ ...mark })),
        blocked: scars.lava.length + scars.lost.length,
        total: HAZARD_SCAR_KINDS.reduce((sum, kind) => sum + scars[kind].length, 0)
    };
}

// ── Baked terrain canvas ──────────────────────────────────────────
// The base canvas is rebuilt from the seed and rare-biome tint. We keep one
// clean copy in the world layer and overlay only the scar pixels when a mark
// changes; this avoids a full per-pixel terrain bake on every hazard year.
export function paintHazardTerrain(ctx, width, height) {
    if (!ctx || !width || !height || typeof ctx.fillRect !== "function") return 0;
    const scars = state.environmentalHazards?.scars;
    if (!scars || typeof scars !== "object") return 0;
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const size = Math.max(1, Math.ceil(resolution));
    let painted = 0;
    for (const kind of HAZARD_SCAR_KINDS) {
        if (kind === "corruption") continue;
        const style = HAZARD_TERRAIN_STYLES[kind];
        ctx.fillStyle = style.fill;
        for (const mark of Array.isArray(scars[kind]) ? scars[kind] : []) {
            const x = Math.floor(int(mark.x) * resolution);
            const y = Math.floor(int(mark.y) * resolution);
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            ctx.fillRect(x, y, Math.min(size, width - x), Math.min(size, height - y));
            painted++;
        }
    }
    // Lava gets a hot edge so it reads as fresh basalt rather than dark grass.
    const lava = Array.isArray(scars.lava) ? scars.lava : [];
    if (lava.length) {
        ctx.strokeStyle = HAZARD_TERRAIN_STYLES.lava.accent;
        ctx.lineWidth = Math.max(1, resolution * 0.2);
        for (const mark of lava) {
            const x = Math.floor(int(mark.x) * resolution) + 0.5;
            const y = Math.floor(int(mark.y) * resolution) + 0.5;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            ctx.strokeRect(x, y, Math.min(size - 1, width - x), Math.min(size - 1, height - y));
        }
    }
    return painted;
}

export function markHazardTerrainDirty() {
    state.hazardTerrainDirty = true;
}

/** Repaint the existing baked canvas from its clean base plus the saved scars. */
export function refreshHazardTerrainBake() {
    if (typeof document === "undefined") return false;
    const target = state.terrainCanvas;
    const clean = state.terrainCleanCanvas;
    if (!target || !clean || target.width !== clean.width || target.height !== clean.height) return false;
    const ctx = target.getContext?.("2d");
    if (!ctx) return false;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(clean, 0, 0);
    paintHazardTerrain(ctx, target.width, target.height);
    state.hazardTerrainDirty = false;
    return true;
}
