// Real land-use context for grassland tiles.
//
// The meadow itself is derived from terrain. This module only answers how the
// surrounding realm uses that meadow: stables graze, farms mow, roads and
// buildings trample, and unmanaged ground slowly develops scrub. The result is
// cached in coarse buckets and rebuilt when the settlement or road network
// changes, so the terrain renderer never walks every building per tile.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { getHeightAt, getMoistureAt, getTemperatureAt } from "../world/world.js";
import { grasslandProfileAt, grasslandSummary } from "../world/grassland-ecology.js";
import { isSteppeSite, steppeProfileAt, steppeSummary } from "../world/steppe-ecology.js";
import { isDesertSite, desertProfileAt, desertSummary } from "../world/desert-ecology.js";
import { isTundraSite, tundraProfileAt, tundraSummary } from "../world/tundra-ecology.js";
import { isSavannaSite, savannaProfileAt, savannaSummary } from "../world/savanna-ecology.js";

const BUCKET = 8;
const CACHE_VERSION = 1;
let cached = null;

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = value => Math.max(0, Math.min(1, value));

function hash32(x, y) {
    let value = Math.imul((x | 0) + 1, 0x9e3779b1) ^ Math.imul((y | 0) + 1, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(x, y, salt = 0) {
    return (hash32(x, y) ^ Math.imul(salt, 0x9e3779b1)) / 0x100000000;
}

function isCompletedBuilding(entity) {
    return Boolean(entity && !entity.dead && typeof entity.isBuilding === "function" && entity.isBuilding()
        && !(entity.construction && Number(entity.construction.stage) < 3));
}

function buildingKind(type) {
    if (type === TYPE.STABLE) return "stable";
    if (type === TYPE.FARM) return "farm";
    if (type === TYPE.MILL || type === TYPE.BAKERY || type === TYPE.BREWERY) return "processing";
    return "settlement";
}

function buildIndex() {
    const buckets = new Map();
    for (const entity of state.entities || []) {
        if (!isCompletedBuilding(entity)) continue;
        const kind = buildingKind(entity.type);
        const x = Math.floor(number(entity.x));
        const y = Math.floor(number(entity.y));
        const key = Math.floor(x / BUCKET) + ":" + Math.floor(y / BUCKET);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ x, y, kind, type: entity.type, id: entity.id });
    }
    return buckets;
}

function indexKey() {
    return [
        CACHE_VERSION,
        (state.entities || []).length,
        Number(state.buildingCollisionVersion) || 0,
        Number(state.roads?.revision) || 0,
        Math.max(1, Math.floor(number(state.year, 1))),
        Math.max(0, Math.floor(number(state.tick, 0)) / 400 | 0),
    ].join("|");
}

function ensureIndex() {
    const key = indexKey();
    if (cached?.key === key) return cached;
    cached = { key, buckets: buildIndex(), roads: state.roads?.tiles || {} };
    return cached;
}

function nearbyBuildings(x, y) {
    const index = ensureIndex();
    const bx = Math.floor(x / BUCKET);
    const by = Math.floor(y / BUCKET);
    const found = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (const entry of index.buckets.get((bx + dx) + ":" + (by + dy)) || []) {
                const distance = Math.hypot(entry.x - x, entry.y - y);
                if (distance <= 7.5) found.push({ ...entry, distance });
            }
        }
    }
    return found.sort((a, b) => a.distance - b.distance);
}

function roadNear(x, y) {
    const tiles = state.roads?.tiles || {};
    if (tiles[x + ":" + y]) return { onRoad: true, adjacent: true };
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            if (tiles[(x + dx) + ":" + (y + dy)]) return { onRoad: false, adjacent: true };
        }
    }
    return { onRoad: false, adjacent: false };
}

/**
 * Return the real management state at a meadow tile.
 *
 * `overgrazed` is capped so a single stable cannot ruin an entire landscape:
 * two or more stables close together are needed for real soil damage.
 */
export function grasslandUseAt(x, y) {
    const tx = Math.floor(number(x));
    const ty = Math.floor(number(y));
    const buildings = nearbyBuildings(tx, ty);
    const road = roadNear(tx, ty);
    const stable = buildings.find(entry => entry.kind === "stable");
    const farm = buildings.find(entry => entry.kind === "farm");
    const settlement = buildings[0] || null;
    const stableCount = buildings.filter(entry => entry.kind === "stable" && entry.distance <= 6).length;
    const year = Math.max(1, Math.floor(number(state.year, 1)));
    const wildYears = Math.max(0, year - 1);
    const seedRoll = unit(tx, ty, 0x555345);
    const nearSettlement = settlement?.distance <= 3;
    const overgrazed = Boolean(stable && stable.distance <= 3.2 && stableCount >= 2);
    const grazed = Boolean(stable && stable.distance <= 6.2 && !overgrazed);
    const mowed = Boolean(farm && farm.distance <= 4.2 && unit(tx, ty, 0x4d4f57) > 0.28);
    const trampled = Boolean((settlement && settlement.distance <= 1.7) || road.onRoad || (road.adjacent && seedRoll > 0.7));
    const wild = !grazed && !mowed && !trampled && !overgrazed;
    const encroachment = Boolean(wild && wildYears >= 3 && seedRoll > 0.58);
    const reforestation = Boolean(wild && wildYears >= 9 && seedRoll > 0.72);
    const path = Boolean(road.adjacent || (settlement && settlement.distance <= 5 && seedRoll > 0.86));
    const intensity = overgrazed ? 1 : grazed ? 0.72 : mowed ? 0.58 : trampled ? 0.86 : clamp01(0.12 + (wildYears / 60));
    return {
        state: overgrazed ? "overgrazed" : grazed ? "grazed" : mowed ? "mowed" : trampled ? "trampled" : "wild",
        grazed, mowed, wild, trampled, path, overgrazed,
        bareSoil: overgrazed || trampled,
        encroachment,
        reforestation,
        intensity,
        yearsSinceUse: wild ? wildYears : 0,
        settlementPressure: settlement ? clamp01(1 - settlement.distance / 8) : 0,
        grazingPressure: clamp01(stableCount * 0.42 + (stable ? 0.3 : 0)),
        mowingPressure: farm ? clamp01(1 - farm.distance / 6) : 0,
        livestock: stable ? ["cattle", "sheep", "horse"] : farm ? ["sheep", "goat"] : [],
        label: overgrazed ? "overgrazed, damaged turf" : grazed ? "grazed pasture" : mowed ? "mown hay meadow"
            : trampled ? "trampled ground" : "unmanaged meadow",
        nearest: settlement ? { kind: settlement.kind, distance: settlement.distance } : null,
    };
}

function siteContextAt(x, y, overrides = {}) {
    const height = getHeightAt(x + 0.5, y + 0.5);
    const moisture = getMoistureAt(x + 0.5, y + 0.5);
    const temperature = getTemperatureAt(x + 0.5, y + 0.5);
    return {
        seed: Number(state.worldSeed) || 1,
        moisture, temperature, height,
        climate: state.worldOptions?.climate || "temperate",
        aridity: state.worldOptions?.aridity ?? 50,
        forests: state.worldOptions?.forests ?? 52,
        seaLevel: Number(state.seaLevel) || 0.33,
        dayOfYear: Number(state.dayOfYear) || 150,
        year: Number(state.year) || 1,
        hour: Number(state.timeOfDay) || 12,
        weather: state.weather || "clear",
        wind: String(state.weather || "").toLowerCase() === "storm" ? 2 : String(state.weather || "").toLowerCase() === "rain" ? 1.25 : 1,
        use: grasslandUseAt(x, y),
        ...overrides,
    };
}

export function grasslandSiteProfileAt(x, y, overrides = {}) {
    return grasslandProfileAt(x + 0.5, y + 0.5, siteContextAt(x, y, overrides));
}

export function steppeSiteProfileAt(x, y, overrides = {}) {
    return steppeProfileAt(x + 0.5, y + 0.5, siteContextAt(x, y, overrides));
}

export function desertSiteProfileAt(x, y, overrides = {}) {
    return desertProfileAt(x + 0.5, y + 0.5, siteContextAt(x, y, overrides));
}

export function tundraSiteProfileAt(x, y, overrides = {}) {
    return tundraProfileAt(x + 0.5, y + 0.5, siteContextAt(x, y, overrides));
}

export function savannaSiteProfileAt(x, y, overrides = {}) {
    return savannaProfileAt(x + 0.5, y + 0.5, siteContextAt(x, y, overrides));
}

export function savannaSiteSummaryAt(x, y) {
    try {
        const context = siteContextAt(x, y);
        return isSavannaSite(x + 0.5, y + 0.5, context)
            ? savannaSummary(savannaProfileAt(x + 0.5, y + 0.5, context)) : "";
    } catch {
        return "";
    }
}

export function tundraSiteSummaryAt(x, y) {
    try {
        const context = siteContextAt(x, y);
        return isTundraSite(x + 0.5, y + 0.5, context)
            ? tundraSummary(tundraProfileAt(x + 0.5, y + 0.5, context)) : "";
    } catch {
        return "";
    }
}

export function desertSiteSummaryAt(x, y) {
    try {
        const context = siteContextAt(x, y);
        return isDesertSite(x + 0.5, y + 0.5, context)
            ? desertSummary(desertProfileAt(x + 0.5, y + 0.5, context)) : "";
    } catch {
        return "";
    }
}

export function steppeSiteSummaryAt(x, y) {
    try {
        const context = siteContextAt(x, y);
        return isSteppeSite(x + 0.5, y + 0.5, context) ? steppeSummary(steppeProfileAt(x + 0.5, y + 0.5, context)) : "";
    } catch {
        return "";
    }
}

// Kept for the existing farm/stable panels. On a tundra, desert or steppe
// tile the same site query returns that ecosystem's survey, so the UI does not
// need a second button or a second resource model.
export function grasslandSiteSummaryAt(x, y) {
    try {
        const context = siteContextAt(x, y);
        if (isTundraSite(x + 0.5, y + 0.5, context)) {
            return tundraSummary(tundraProfileAt(x + 0.5, y + 0.5, context));
        }
        if (isSavannaSite(x + 0.5, y + 0.5, context)) {
            return savannaSummary(savannaProfileAt(x + 0.5, y + 0.5, context));
        }
        if (isDesertSite(x + 0.5, y + 0.5, context)) {
            return desertSummary(desertProfileAt(x + 0.5, y + 0.5, context));
        }
        if (isSteppeSite(x + 0.5, y + 0.5, context)) {
            return steppeSummary(steppeProfileAt(x + 0.5, y + 0.5, context));
        }
        return grasslandSummary(grasslandProfileAt(x + 0.5, y + 0.5, context));
    } catch {
        return "";
    }
}

export function resetGrasslandUseCache() {
    cached = null;
}

export const GRASSLAND_USE_LIMITS = Object.freeze({ bucket: BUCKET, version: CACHE_VERSION });
