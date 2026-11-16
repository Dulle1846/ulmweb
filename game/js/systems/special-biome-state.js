// Persistent state, discovery and annual ecology for the 1.2.17 special biomes.
//
// The world atlas is generated once per realm. This module stores only the
// small region DTOs, rare goods and a bounded history; the tile lookup is a
// single Uint8Array rebuilt from the region centres. Discovery is checked on a
// 200-tick cadence (five in-game days), while yields and hazards settle once
// per year. No per-frame or per-tick all-tile scan is introduced.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import {
    RARE_GOODS, RARE_GOOD_IDS, SPECIAL_BIOME_FAMILIES, SPECIAL_BIOME_FAMILY_IDS,
    SPECIAL_BIOME_MAX_REGIONS, SPECIAL_BIOME_VERSION, buildSpecialBiomeMap,
    generateSpecialBiomeRegions, specialBiomeRegionAt, specialBiomeSummary
} from "../world/special-biomes.js";
import {
    createSpecialBiomeCouplingState, getBiomeQuestSnapshot, getBlightDecisionSnapshot,
    getSpecialBiomeInfluence, invalidateSpecialBiomeInfluence, normalizeSpecialBiomeCouplingState,
    onSpecialBiomeAttuned, onSpecialBiomeCleansed, onSpecialBiomeDiscovered,
    updateSpecialBiomeCouplings, validateSpecialBiomeCouplingState
} from "./special-biome-couplings.js";

export const SPECIAL_BIOME_HISTORY_LIMIT = 24;
const COUNT_LIMIT = 1_000_000;
const DISCOVERY_INTERVAL = 200;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positiveYear = value => Math.max(1, Math.floor(finite(value, 1)));
const nonNegative = value => Math.max(0, Math.floor(finite(value, 0)));

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function emptyGoods() {
    return Object.fromEntries(RARE_GOOD_IDS.map(id => [id, 0]));
}

function normalizeGoods(source) {
    const goods = emptyGoods();
    for (const id of RARE_GOOD_IDS) {
        goods[id] = Math.min(COUNT_LIMIT, nonNegative(source?.[id]));
    }
    return goods;
}

function normalizeFeature(feature, index) {
    if (!feature || typeof feature !== "object") return null;
    const kind = String(feature.kind || "").slice(0, 40);
    if (!kind) return null;
    return {
        kind,
        label: String(feature.label || kind).slice(0, 100),
        x: Math.round(finite(feature.x, 0) * 10) / 10,
        y: Math.round(finite(feature.y, 0) * 10) / 10,
        scale: clamp(finite(feature.scale, 1), 0.3, 2),
        featureId: String(feature.featureId || kind + "-" + (index + 1)).slice(0, 80)
    };
}

function normalizeRegion(region, index) {
    if (!region || typeof region !== "object") return null;
    const family = SPECIAL_BIOME_FAMILIES[region.family];
    if (!family) return null;
    const satellites = Array.isArray(region.satellites)
        ? region.satellites.slice(0, 3).map(satellite => ({
            x: Math.round(finite(satellite?.x, region.x) * 10) / 10,
            y: Math.round(finite(satellite?.y, region.y) * 10) / 10,
            radius: clamp(finite(satellite?.radius, 1), 0.5, 4)
        })).filter(satellite => Number.isFinite(satellite.x) && Number.isFinite(satellite.y))
        : [];
    return {
        id: String(region.id || "special-biome-" + (index + 1)).slice(0, 48),
        index,
        family: family.id,
        name: String(region.name || family.variants[0]).slice(0, 80),
        kicker: String(region.kicker || family.kicker).slice(0, 80),
        glyph: String(region.glyph || family.glyph).slice(0, 8),
        tint: [...family.tint],
        accent: family.accent,
        glow: family.glow,
        x: Math.round(finite(region.x, 0) * 10) / 10,
        y: Math.round(finite(region.y, 0) * 10) / 10,
        radius: clamp(finite(region.radius, 3), 1, 12),
        transition: clamp(finite(region.transition, 1.5), 0.5, 4),
        satellites,
        features: Array.isArray(region.features)
            ? region.features.slice(0, 10).map(normalizeFeature).filter(Boolean)
            : [],
        resource: family.resource,
        resourceLabel: family.resourceLabel,
        resourceValue: family.resourceValue,
        boon: String(region.boon || family.boon).slice(0, 220),
        hazard: String(region.hazard || family.hazard).slice(0, 220),
        climate: String(region.climate || "temperate").slice(0, 32),
        variant: Math.max(0, Math.floor(finite(region.variant, 0))),
        variantLabel: String(region.variantLabel || region.name || family.variants[0]).slice(0, 80),
        origin: String(region.origin || family.origins[0]).slice(0, 180),
        lore: String(region.lore || family.lore[0]).slice(0, 300),
        discovered: Boolean(region.discovered),
        discoveredYear: nonNegative(region.discoveredYear),
        attuned: Boolean(region.attuned),
        cleansed: Boolean(region.cleansed),
        spread: clamp(nonNegative(region.spread), 0, 6),
        lastYieldYear: nonNegative(region.lastYieldYear),
        richness: clamp(finite(region.richness, 1), 0.5, 2)
    };
}

function normalizeHistory(entry) {
    if (!entry || typeof entry !== "object") return null;
    const kind = ["discovery", "yield", "hazard", "attune", "cleanse", "trade"].includes(entry.kind)
        ? entry.kind : null;
    if (!kind) return null;
    return {
        kind,
        regionId: String(entry.regionId || "").slice(0, 48),
        text: String(entry.text || "").slice(0, 240),
        year: positiveYear(entry.year),
        tick: nonNegative(entry.tick)
    };
}

export function createSpecialBiomeState(source = {}, regions = []) {
    return {
        version: SPECIAL_BIOME_VERSION,
        seed: Math.max(1, Math.floor(finite(source.seed, state.worldSeed || 1))),
        regions: (Array.isArray(regions) ? regions : []).slice(0, SPECIAL_BIOME_MAX_REGIONS)
            .map(normalizeRegion).filter(Boolean),
        rareGoods: normalizeGoods(source.rareGoods),
        history: Array.isArray(source.history)
            ? source.history.map(normalizeHistory).filter(Boolean).slice(0, SPECIAL_BIOME_HISTORY_LIMIT)
            : [],
        lastYear: nonNegative(source.lastYear),
        lastDiscoveryTick: nonNegative(source.lastDiscoveryTick),
        totalDiscovered: Math.min(COUNT_LIMIT, nonNegative(source.totalDiscovered)),
        totalYield: Math.min(COUNT_LIMIT, nonNegative(source.totalYield)),
        totalHazards: Math.min(COUNT_LIMIT, nonNegative(source.totalHazards)),
        totalAttuned: Math.min(COUNT_LIMIT, nonNegative(source.totalAttuned)),
        totalTraded: Math.min(COUNT_LIMIT, nonNegative(source.totalTraded)),
        lastHazardYear: nonNegative(source.lastHazardYear),
        couplings: createSpecialBiomeCouplingState(source.couplings)
    };
}

function buildTintCanvas(regions, W, H, map) {
    if (typeof document === "undefined" || !document.createElement || !W || !H) return null;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(W, H);
    const pixels = image.data;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const index = map[y * W + x];
            if (!index) continue;
            const region = regions[index - 1];
            if (!region) continue;
            const dx = x + 0.5 - region.x;
            const dy = y + 0.5 - region.y;
            const distance = Math.hypot(dx, dy);
            const inner = Math.max(1, region.radius * 0.35);
            const strength = clamp(1 - (distance - inner) / Math.max(1, region.radius + region.transition - inner), 0.32, 1);
            const offset = (y * W + x) * 4;
            pixels[offset] = region.tint[0];
            pixels[offset + 1] = region.tint[1];
            pixels[offset + 2] = region.tint[2];
            pixels[offset + 3] = Math.round(255 * strength);
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

export function rebuildSpecialBiomeAtlas() {
    const current = state.specialBiomes;
    if (!current || !Array.isArray(current.regions)) {
        state.specialBiomeMap = null;
        state.specialBiomeTintCanvas = null;
        return;
    }
    const W = Math.max(1, Number(state.worldW) || 1);
    const H = Math.max(1, Number(state.worldH) || 1);
    for (let index = 0; index < current.regions.length; index++) current.regions[index].index = index;
    state.specialBiomeMap = buildSpecialBiomeMap(current.regions, W, H);
    state.specialBiomeTintCanvas = buildTintCanvas(current.regions, W, H, state.specialBiomeMap);
    invalidateSpecialBiomeInfluence();
}

export function generateSpecialBiomes(seed = state.worldSeed, options = state.worldOptions, world = {}) {
    const W = Math.max(1, Number(state.worldW) || Number(world.W) || 1);
    const H = Math.max(1, Number(state.worldH) || Number(world.H) || 1);
    const regions = generateSpecialBiomeRegions(seed, options, { ...world, W, H, sea: state.seaLevel });
    state.specialBiomes = createSpecialBiomeState({ seed }, regions);
    rebuildSpecialBiomeAtlas();
    return state.specialBiomes;
}

export function normalizeSpecialBiomeState(source, worldSeed = state.worldSeed, generatedRegions = null) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        const current = state.specialBiomes;
        if (current && Array.isArray(current.regions) && current.regions.length) return current;
        const regions = Array.isArray(generatedRegions) ? generatedRegions : [];
        const fallback = createSpecialBiomeState({ seed: worldSeed }, regions);
        state.specialBiomes = fallback;
        rebuildSpecialBiomeAtlas();
        return fallback;
    }
    const regions = Array.isArray(source.regions) && source.regions.length
        ? source.regions
        : (Array.isArray(generatedRegions) ? generatedRegions : state.specialBiomes?.regions || []);
    const normalized = createSpecialBiomeState(source, regions);
    state.specialBiomes = normalized;
    normalizeSpecialBiomeCouplingState(source.couplings);
    rebuildSpecialBiomeAtlas();
    return normalized;
}

export function restoreSpecialBiomeState(source) {
    const generated = state.specialBiomes?.regions || [];
    return normalizeSpecialBiomeState(source, state.worldSeed, generated);
}

export function serializeSpecialBiomeState() {
    const current = state.specialBiomes;
    if (!current || typeof current !== "object") return null;
    return JSON.parse(JSON.stringify(current));
}

export function validateSpecialBiomeState(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("special biomes must be an object");
    }
    if (snapshot.version !== undefined && Number(snapshot.version) !== SPECIAL_BIOME_VERSION) {
        throw new Error("unsupported special-biome version");
    }
    if (!Array.isArray(snapshot.regions) || snapshot.regions.length > SPECIAL_BIOME_MAX_REGIONS) {
        throw new Error("special-biome regions must be a bounded array");
    }
    for (const region of snapshot.regions) {
        if (!region || !SPECIAL_BIOME_FAMILIES[region.family]) throw new Error("unknown special-biome family");
        if (!Number.isFinite(Number(region.x)) || !Number.isFinite(Number(region.y))) {
            throw new Error("special-biome region must have finite coordinates");
        }
        if (Number(region.radius) < 1 || Number(region.radius) > 12) throw new Error("special-biome radius out of range");
    }
    validateSpecialBiomeCouplingState(snapshot.couplings);
    if (snapshot.rareGoods !== undefined) {
        if (!snapshot.rareGoods || typeof snapshot.rareGoods !== "object" || Array.isArray(snapshot.rareGoods)) {
            throw new Error("special-biome rare goods must be a map");
        }
        for (const key of Object.keys(snapshot.rareGoods)) {
            if (!RARE_GOODS[key]) throw new Error("unknown special-biome rare good");
            if (!Number.isFinite(Number(snapshot.rareGoods[key])) || Number(snapshot.rareGoods[key]) < 0) {
                throw new Error("special-biome rare good count is invalid");
            }
        }
    }
    return snapshot;
}

function pushHistory(kind, region, text) {
    const current = state.specialBiomes;
    if (!current) return;
    current.history.unshift({
        kind,
        regionId: region?.id || "",
        text: String(text || "").slice(0, 240),
        year: positiveYear(state.year),
        tick: nonNegative(state.tick)
    });
    if (current.history.length > SPECIAL_BIOME_HISTORY_LIMIT) current.history.length = SPECIAL_BIOME_HISTORY_LIMIT;
}

function ensureState() {
    if (!state.specialBiomes || typeof state.specialBiomes !== "object" || !Array.isArray(state.specialBiomes.regions)) {
        generateSpecialBiomes(state.worldSeed, state.worldOptions, {
            heights: state.heightMap, moistures: state.moistureMap, temperatures: state.temperatureMap,
            resolution: state.terrainResolution, pixW: state.terrainPixW, pixH: state.terrainPixH,
            W: state.worldW, H: state.worldH, sea: state.seaLevel
        });
    }
    return state.specialBiomes;
}

function regionAtTile(region, x, y) {
    return Math.hypot(x + 0.5 - region.x, y + 0.5 - region.y) <= region.radius + Math.max(0, region.spread) * 0.28;
}

function isExploredNear(region) {
    const probes = [
        [region.x, region.y],
        [region.x - region.radius * 0.6, region.y],
        [region.x + region.radius * 0.6, region.y],
        [region.x, region.y - region.radius * 0.6],
        [region.x, region.y + region.radius * 0.6]
    ];
    for (const feature of region.features.slice(0, 6)) probes.push([feature.x, feature.y]);
    for (const [x, y] of probes) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        if (state.explored?.[tx]?.[ty]) return true;
    }
    return false;
}

function discoverRegion(region) {
    const current = state.specialBiomes;
    if (!current || region.discovered) return false;
    region.discovered = true;
    region.discoveredYear = positiveYear(state.year);
    current.totalDiscovered = Math.min(COUNT_LIMIT, current.totalDiscovered + 1);
    const family = SPECIAL_BIOME_FAMILIES[region.family];
    addLog("A " + family.label.toUpperCase() + " ENTERS THE ROYAL SURVEY: " + region.name.toUpperCase(), family.accent, "exploration");
    pushHistory("discovery", region, "The crown charted " + region.name + ".");
    onSpecialBiomeDiscovered(region);
    return true;
}

function applyAttunement(region) {
    const family = region.family;
    if (family === "enchanted-wood") {
        state.morale = Math.min(100, finite(state.morale, 0) + 4);
    } else if (family === "crystal-land") {
        state.resources.gold = Math.max(0, finite(state.resources.gold, 0) + 15);
    } else if (family === "fungal-wilds") {
        state.resources.food = Math.max(0, finite(state.resources.food, 0) + 20);
    } else if (family === "blighted-land") {
        if (state.politics) state.politics.legitimacy = Math.min(100, finite(state.politics.legitimacy, 0) + 3);
    } else if (family === "glass-desert") {
        state.resources.stone = Math.max(0, finite(state.resources.stone, 0) + 15);
    } else if (family === "mist-moor") {
        state.morale = Math.min(100, finite(state.morale, 0) + 2);
    } else if (family === "ash-shadow") {
        state.resources.wood = Math.max(0, finite(state.resources.wood, 0) + 20);
    } else if (family === "hollow-depths") {
        state.resources.gold = Math.max(0, finite(state.resources.gold, 0) + 10);
    } else if (family === "magic-mountains") {
        if (state.politics) state.politics.legitimacy = Math.min(100, finite(state.politics.legitimacy, 0) + 3);
    }
}

function annualRegion(region) {
    if (!region.discovered) return;
    const current = state.specialBiomes;
    const year = positiveYear(state.year);
    if (region.lastYieldYear === year) return;
    region.lastYieldYear = year;
    const amount = Math.max(1, Math.round(region.richness * (region.attuned ? 2 : 1)));
    current.rareGoods[region.resource] = Math.min(COUNT_LIMIT, current.rareGoods[region.resource] + amount);
    current.totalYield = Math.min(COUNT_LIMIT, current.totalYield + amount);

    if (region.family === "blighted-land" && !region.cleansed) {
        region.spread = Math.min(6, region.spread + 1);
        const nearHeart = Math.hypot(region.x - state.worldW / 2, region.y - state.worldH / 2) < 20;
        if (nearHeart) state.morale = Math.max(0, finite(state.morale, 0) - 0.5);
        if (region.spread === 2 || region.spread === 4 || region.spread === 6) {
            addLog("THE BLIGHT OF " + region.name.toUpperCase() + " SPREADS · PRESSURE " + region.spread + " / 6", "#a7c86a", "nature");
            current.totalHazards = Math.min(COUNT_LIMIT, current.totalHazards + 1);
            pushHistory("hazard", region, "The blight spread to pressure " + region.spread + ".");
        }
    }
    // Hazards are deterministic and at most one per year across the whole
    // atlas. The player gets a warning, a small material cost and a route to
    // recovery through cleansing, attunement or trade.
    const hazardRoll = hash32(current.seed, year, region.index, 311) / 0x100000000;
    if (!region.cleansed && hazardRoll < 0.22 && current.lastHazardYear !== year) {
        current.lastHazardYear = year;
        current.totalHazards = Math.min(COUNT_LIMIT, current.totalHazards + 1);
        const family = SPECIAL_BIOME_FAMILIES[region.family];
        if (["fungal-wilds", "blighted-land", "ash-shadow"].includes(region.family)) {
            state.morale = Math.max(0, finite(state.morale, 0) - 1);
        } else if (["crystal-land", "glass-desert"].includes(region.family)) {
            state.resources.wood = Math.max(0, finite(state.resources.wood, 0) - 2);
        } else if (region.family === "mist-moor") {
            state.resources.gold = Math.max(0, finite(state.resources.gold, 0) - 2);
        }
        addLog("A HAZARD STIRS IN " + region.name.toUpperCase() + ": " + family.hazard.toUpperCase(), "#e0a080", "nature");
        pushHistory("hazard", region, family.hazard);
    }
    if (region.attuned && region.family === "mist-moor") {
        state.morale = Math.min(100, finite(state.morale, 0) + 0.25);
    }
}

export function updateSpecialBiomes() {
    const current = ensureState();
    const tick = nonNegative(state.tick);
    if (tick - current.lastDiscoveryTick >= DISCOVERY_INTERVAL) {
        current.lastDiscoveryTick = tick;
        for (const region of current.regions) {
            if (!region.discovered && isExploredNear(region)) discoverRegion(region);
        }
    }
    const year = positiveYear(state.year);
    if (current.lastYear === year) return null;
    current.lastYear = year;
    current.lastHazardYear = current.lastHazardYear || 0;
    for (const region of current.regions) annualRegion(region);
    invalidateSpecialBiomeInfluence();
    updateSpecialBiomeCouplings();
    return current;
}

export function attuneSpecialBiome(regionId) {
    const current = ensureState();
    const region = current.regions.find(entry => entry.id === regionId);
    if (!region) return { ok: false, reason: "unknown-special-biome" };
    if (!region.discovered) return { ok: false, reason: "special-biome-not-discovered" };
    if (region.attuned) return { ok: false, reason: "already-attuned" };
    if (region.family === "blighted-land" && !region.cleansed) return { ok: false, reason: "cleanse-first" };
    if (current.rareGoods[region.resource] < 3) return { ok: false, reason: "not-enough-rare-goods" };
    current.rareGoods[region.resource] -= 3;
    region.attuned = true;
    current.totalAttuned = Math.min(COUNT_LIMIT, current.totalAttuned + 1);
    applyAttunement(region);
    addLog("THE CROWN ATTUNES " + region.name.toUpperCase() + " — " + SPECIAL_BIOME_FAMILIES[region.family].label.toUpperCase(), "#d8bd82", "exploration");
    pushHistory("attune", region, "A permanent bond was made with " + region.name + ".");
    invalidateSpecialBiomeInfluence();
    onSpecialBiomeAttuned(region);
    return { ok: true, region: getSpecialBiomeSnapshot().regions.find(entry => entry.id === regionId) };
}

export function cleanseSpecialBiome(regionId) {
    const current = ensureState();
    const region = current.regions.find(entry => entry.id === regionId);
    if (!region) return { ok: false, reason: "unknown-special-biome" };
    if (region.family !== "blighted-land") return { ok: false, reason: "not-blighted" };
    if (!region.discovered) return { ok: false, reason: "special-biome-not-discovered" };
    if (region.cleansed) return { ok: false, reason: "already-cleansed" };
    if (current.rareGoods["blight-resin"] < 3 || finite(state.resources.gold, 0) < 12) {
        return { ok: false, reason: "not-enough-resources" };
    }
    current.rareGoods["blight-resin"] -= 3;
    state.resources.gold = Math.max(0, finite(state.resources.gold, 0) - 12);
    region.cleansed = true;
    region.spread = 0;
    state.morale = Math.min(100, finite(state.morale, 0) + 2);
    addLog("THE BLIGHT OF " + region.name.toUpperCase() + " IS CLEANSED · THE LAND BREATHES", "#a7c86a", "exploration");
    pushHistory("cleanse", region, "The rot was cut out and the ground salted with ash and prayer.");
    invalidateSpecialBiomeInfluence();
    onSpecialBiomeCleansed(region);
    return { ok: true, region: getSpecialBiomeSnapshot().regions.find(entry => entry.id === regionId) };
}

export function sellSpecialGood(goodId, quantity = 1) {
    const current = ensureState();
    const good = RARE_GOODS[goodId];
    if (!good) return { ok: false, reason: "unknown-rare-good" };
    const count = Math.max(1, Math.min(99, Math.floor(finite(quantity, 1))));
    if (current.rareGoods[goodId] < count) return { ok: false, reason: "not-enough-rare-goods" };
    current.rareGoods[goodId] -= count;
    state.resources.gold = Math.max(0, finite(state.resources.gold, 0) + good.value * count);
    current.totalTraded = Math.min(COUNT_LIMIT, current.totalTraded + count);
    addLog("RARE GOODS SOLD · " + count + " " + good.label.toUpperCase() + " FOR " + (good.value * count) + " GOLD", "#d8bd82", "economy");
    pushHistory("trade", null, count + " " + good.label + " sold for " + good.value * count + " gold.");
    invalidateSpecialBiomeInfluence();
    return { ok: true, gold: good.value * count, remaining: current.rareGoods[goodId] };
}

export function getSpecialBiomeAt(x, y) {
    const current = state.specialBiomes;
    if (!current?.regions?.length || !state.specialBiomeMap) return null;
    const index = specialBiomeRegionAt(state.specialBiomeMap, state.worldW, x, y);
    return index ? current.regions[index - 1] || null : null;
}

export function getSpecialBiomeSnapshot() {
    const current = ensureState();
    const W = Number(state.worldW) || 1;
    const H = Number(state.worldH) || 1;
    const centerX = W / 2;
    const centerY = H / 2;
    const regions = current.regions.map(region => ({
        ...region,
        distance: Math.round(Math.hypot(region.x - centerX, region.y - centerY)),
        familyLabel: SPECIAL_BIOME_FAMILIES[region.family].label,
        familyKicker: SPECIAL_BIOME_FAMILIES[region.family].kicker,
        rareGood: RARE_GOODS[region.resource],
        attuneCost: 3,
        cleanseCost: region.family === "blighted-land" && !region.cleansed ? { "blight-resin": 3, gold: 12 } : null
    }));
    const summary = specialBiomeSummary(current.regions);
    const rareGoods = RARE_GOOD_IDS.map(id => ({
        ...RARE_GOODS[id],
        count: current.rareGoods[id] || 0
    }));
    const knownFamilies = [...new Set(current.regions.filter(region => region.discovered).map(region => region.family))];
    return {
        version: current.version,
        seed: current.seed,
        regions,
        summary,
        rareGoods,
        knownFamilies,
        manifestCount: 100,
        history: current.history.map(entry => ({ ...entry })),
        lastYear: current.lastYear,
        totalYield: current.totalYield,
        totalHazards: current.totalHazards,
        totalAttuned: current.totalAttuned,
        totalTraded: current.totalTraded,
        influence: getSpecialBiomeInfluence(),
        couplings: { ...current.couplings },
        quests: getBiomeQuestSnapshot(),
        blightDecision: getBlightDecisionSnapshot()
    };
}

export function paintSpecialBiomeTint(ctx, pixW, pixH) {
    const tint = state.specialBiomeTintCanvas;
    if (!tint || !ctx || !pixW || !pixH) return false;
    // The campaign driver uses a deliberately tiny canvas stub. Rendering must
    // never make headless simulation depend on browser-only context methods.
    if (typeof ctx.save !== "function" || typeof ctx.drawImage !== "function") return false;
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tint, 0, 0, pixW, pixH);
    ctx.restore();
    return true;
}

export const __internals = { normalizeRegion, normalizeGoods, buildTintCanvas, regionAtTile, isExploredNear };
