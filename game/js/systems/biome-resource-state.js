// Persistent, deterministic 1.2.19 biome economy and ecology.
//
// One realm owns a 6×6 atlas of region records. Every region is a compact DTO:
// a dozen scalar readings, at most a dozen resource rows and a handful of
// wildlife populations. There is no per-tile object graph and no per-frame
// simulation. Discovery follows real explored tiles, extraction happens only
// through player actions, and the annual pass applies bounded regeneration,
// predation, pollination, soil and migration rules.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { classifyTerrain } from "../world/terrain-model.js";
import {
    BIOME_FOCUSES, BIOME_FOCUS_IDS, BIOME_POLICIES, BIOME_POLICY_IDS,
    BIOME_PROFILES, BIOME_REGION_GRID, BIOME_REGION_MAX, BIOME_RESOURCES,
    BIOME_RESOURCE_BY_ID, BIOME_RESOURCE_CATEGORIES, BIOME_RESOURCE_HISTORY_LIMIT, BIOME_RESOURCE_IDS,
    BIOME_RESOURCE_STORE_LIMIT, BIOME_RESOURCE_VERSION, BIOME_WILDLIFE,
    BIOME_WILDLIFE_BY_ID, BIOME_WILDLIFE_IDS, resourcesForBiome, wildlifeForBiome
} from "../world/biome-resource-data.js";

const VERSION = BIOME_RESOURCE_VERSION;
const GRID = BIOME_REGION_GRID;
const MAX_REGIONS = BIOME_REGION_MAX;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonNegative = value => Math.max(0, finite(value, 0));
const boundedInt = (value, min, max) => Math.round(clamp(nonNegative(value), min, max));
const text = (value, fallback = "", length = 80) => String(value ?? fallback).slice(0, length);

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}
const unit = (seed, x, y, salt = 0) => hash32(seed, x, y, salt) / 4294967296;

function stringHash(value) {
    let hash = 2166136261;
    const source = String(value || "");
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

const NAME_FIRST = ["Ash", "Briar", "Cedar", "Dun", "Elder", "Fen", "Gale", "Hollow", "Iron", "Juniper", "Kestrel", "Lark", "Moss", "North", "Oak", "Pine", "Rook", "Stone", "Thorn", "Willow"];
const NAME_SECOND = ["reach", "vale", "march", "fen", "wood", "crag", "mead", "strand", "hollow", "fell", "bourne", "watch"];

function regionBounds(index) {
    const column = index % GRID;
    const row = Math.floor(index / GRID);
    const width = Math.max(1, Number(state.worldW) || 160);
    const height = Math.max(1, Number(state.worldH) || 160);
    const x0 = Math.floor(column * width / GRID);
    const y0 = Math.floor(row * height / GRID);
    const x1 = Math.max(x0 + 1, Math.floor((column + 1) * width / GRID));
    const y1 = Math.max(y0 + 1, Math.floor((row + 1) * height / GRID));
    return { x0, y0, x1, y1, centerX: (x0 + x1) / 2, centerY: (y0 + y1) / 2 };
}

export function biomeRegionIndexAt(x, y) {
    const width = Math.max(1, Number(state.worldW) || 160);
    const height = Math.max(1, Number(state.worldH) || 160);
    const column = clamp(Math.floor(finite(x, 0) / width * GRID), 0, GRID - 1);
    const row = clamp(Math.floor(finite(y, 0) / height * GRID), 0, GRID - 1);
    return row * GRID + column;
}

export function biomeRegionAtTile(x, y) {
    const atlas = state.biomeAtlas;
    if (!atlas?.regions?.length) return null;
    return atlas.regions[biomeRegionIndexAt(x, y)] || null;
}

function sampleTerrain(context, wx, wy) {
    const resolution = Math.max(1, Number(context.resolution) || 1);
    const pixW = Math.max(1, Number(context.pixW) || 1);
    const pixH = Math.max(1, Number(context.pixH) || 1);
    const px = clamp(Math.floor(wx * resolution), 0, pixW - 1);
    const py = clamp(Math.floor(wy * resolution), 0, pixH - 1);
    const pixel = py * pixW + px;
    const height = finite(context.heights?.[pixel], 0.5);
    const moisture = finite(context.moistures?.[pixel], 0.5);
    const temperature = finite(context.temperatures?.[pixel], 0.55);
    const sea = finite(context.sea, 0.33);
    return {
        height, moisture, temperature, sea,
        rawBiome: classifyTerrain(height, moisture, temperature, sea)
    };
}

function standFor(rawBiome, moisture, temperature) {
    if (rawBiome === "dense-forest") return temperature > 0.66 ? "tropical" : moisture > 0.7 ? "mixed" : "broadleaf";
    if (rawBiome === "forest") return temperature < 0.4 ? "conifer" : moisture > 0.68 ? "mixed" : "broadleaf";
    if (rawBiome === "taiga") return "conifer";
    if (rawBiome === "swamp") return temperature > 0.62 ? "tropical" : "broadleaf";
    return null;
}

function regionQuality(sample, profile, index, seed) {
    const jitter = unit(seed, index, 0x5155414c) * 16 - 8;
    const soil = (sample.moisture * 0.35 + profile.soil * 0.65 - 0.5) * 44;
    const climate = (sample.temperature - 0.5) * 24;
    const elevation = sample.height > 0.82 ? -18 : sample.height < 0.36 ? 6 : 0;
    return Math.round(clamp(48 + soil + climate + elevation + jitter, 12, 98));
}

function resourceQuality(resource, region, index, seed) {
    const sample = region.sample;
    const weight = resource.quality || {};
    const score = 48
        + (sample.moisture - 0.5) * 46 * finite(weight.moisture, 0.2)
        + (sample.temperature - 0.5) * 46 * finite(weight.temperature, 0.2)
        + (sample.height - 0.5) * 42 * finite(weight.height, 0.1)
        + (region.soilHealth - 0.5) * 44 * finite(weight.soil, 0.3)
        + (unit(seed, index, stringHash(resource.id)) - 0.5) * 14;
    return Math.round(clamp(score + (region.quality - 50) * 0.28, 8, 100));
}

function resourceCapacity(resource, region, seed, index) {
    const profile = BIOME_PROFILES[region.rawBiome] || BIOME_PROFILES.meadow;
    const rarity = clamp(resource.rarity, 0.03, 1);
    const base = resource.renewable ? 95 : 135;
    const ecological = resource.kind === "fish" ? profile.water : profile.vegetation;
    return Math.round(base + 340 * rarity * (0.45 + ecological * 0.7) + unit(seed, index, stringHash(resource.id) ^ 0xcafe) * 70);
}

function makeResourceRow(resource, region, index, seed, discovered) {
    const capacity = resourceCapacity(resource, region, seed, index);
    const stockShare = resource.renewable ? 0.62 : 0.72;
    const stored = resource.rare ? 0 : 0;
    return {
        id: resource.id,
        stock: Math.round(capacity * (stockShare + unit(seed, index, stringHash(resource.id) ^ 0x53544f43) * 0.28)),
        capacity,
        quality: resourceQuality(resource, region, index, seed),
        stored,
        discovered: Boolean(discovered && !resource.surveyOnly),
        locallyExtinct: false,
        lastHarvestYear: 0
    };
}

function makeFaunaRow(species, region, index, seed, discovered) {
    const profile = BIOME_PROFILES[region.rawBiome] || BIOME_PROFILES.meadow;
    const habitat = species.role === "fish" ? profile.water : profile.vegetation;
    const waterFactor = species.water ? 0.58 + region.water * 0.42 : 1;
    const capacity = Math.max(3, Math.round(species.capacity * (0.38 + habitat * 0.78) * (0.72 + region.quality / 160) * waterFactor));
    return {
        id: species.id,
        population: Math.max(1, Math.round(capacity * (0.48 + unit(seed, index, stringHash(species.id)) * 0.38))),
        baseCapacity: capacity,
        capacity,
        health: Math.round(clamp(58 + region.quality * 0.34 + unit(seed, index, stringHash(species.id) ^ 0x4845414c) * 18, 25, 100)),
        breeding: species.breeding.includes(Number(state.seasonIndex) || 0),
        migrating: Boolean(species.migratory && !species.breeding.includes(Number(state.seasonIndex) || 0)),
        pressure: 0,
        refugeSites: 1 + Math.floor(unit(seed, index, stringHash(species.id) ^ 0x52454655) * 3),
        discovered: Boolean(discovered && !species.surveyOnly)
    };
}

function pickResources(region, seed, index) {
    const candidates = resourcesForBiome(region.rawBiome, region.stand)
        .filter(resource => !resource.fauna);
    const ranked = candidates.map(resource => {
        let chance = clamp(resource.rarity * (0.7 + region.quality / 240), 0, 1);
        if (resource.rare) chance *= 0.18 + region.rareBias * 0.7;
        if (resource.strategic) chance *= 0.8 + region.rareBias * 0.35;
        return { resource, chance, roll: unit(seed, index, stringHash(resource.id)) };
    }).filter(entry => entry.roll < entry.chance)
        .sort((a, b) => (a.roll / Math.max(0.02, a.chance)) - (b.roll / Math.max(0.02, b.chance)));
    const selected = ranked.slice(0, 10).map(entry => entry.resource);
    // A biome's identity includes one hidden rare site. Without this guarantee
    // a low rareBias roll can leave an entire surveyed region without any rare
    // deposit, which makes the rare-survey promise invisible in normal play.
    // The site is still hidden until the second survey and its stock is tiny.
    if (!selected.some(resource => resource.rare)) {
        const rare = candidates.filter(resource => resource.rare)
            .sort((a, b) => (b.rarity - a.rarity) || (stringHash(a.id) - stringHash(b.id)))[0];
        // Keep the rare site in the first slot so the later food rescue cannot
        // push it past the final resource cap.
        if (rare) selected.unshift(rare);
    }
    const hasFood = selected.some(resource => resource.yieldResource === "food" || resource.category === "fruit");
    if (!hasFood) {
        const food = candidates.filter(resource => resource.yieldResource === "food")
            .sort((a, b) => b.rarity - a.rarity)[0];
        if (food && !selected.includes(food)) selected.unshift(food);
    }
    return selected.slice(0, 11);
}

function regionPotentialYield(region, season = state.seasonIndex) {
    const policy = policyFor(region);
    if (policy.yield <= 0) return 0;
    let total = 0;
    for (const row of region.resources) {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        if (!resource || !row.discovered || row.locallyExtinct || !seasonFactor(resource, season)) continue;
        const share = resource.rare ? 0.002 : 0.006;
        total += Math.min(3, Math.round(row.capacity * share * policy.yield * (0.55 + row.quality / 120)));
    }
    return total;
}

// The map dots read the compact resource geography rather than rebuilding a
// full forest stand for every sampled tile. Visual forest biomes still get a
// cover baseline when a tile has no harvestable stand: otherwise the atlas
// showed holes across half of the woodland that the terrain renderer paints.
let forestCoverContext = null;
function forestBiomeShareAt(tx, ty) {
    const heights = state.heightMap;
    if (!heights || !state.moistureMap || !state.temperatureMap) return 0;
    if (!forestCoverContext || forestCoverContext.heights !== heights
        || forestCoverContext.moistures !== state.moistureMap
        || forestCoverContext.temperatures !== state.temperatureMap
        || forestCoverContext.resolution !== state.terrainResolution) {
        forestCoverContext = {
            heights,
            moistures: state.moistureMap,
            temperatures: state.temperatureMap,
            resolution: state.terrainResolution,
            pixW: state.terrainPixW,
            pixH: state.terrainPixH,
            sea: state.seaLevel
        };
    }
    const sample = sampleTerrain(forestCoverContext, tx + 0.5, ty + 0.5);
    if (sample.rawBiome === "dense-forest") return 1;
    if (sample.rawBiome === "forest") return 0.9;
    if (sample.rawBiome === "taiga") return 0.78;
    if (sample.rawBiome === "swamp") return 0.32;
    return 0;
}

export function forestCoverShareAt(x, y) {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    const tx = Math.floor(Number(x));
    const ty = Math.floor(Number(y));
    if (!geo || !geo.forestCapacity || tx < 0 || ty < 0 || tx >= width || ty >= height) return 0;
    const index = ty * width + tx;
    const capacity = Number(geo.forestCapacity[index]) || 0;
    const resourceShare = capacity > 0
        ? clamp((Number(geo.forestStock?.[index]) || 0) / capacity, 0, 1)
        : 0;
    // The layer marks the forest biome, not every isolated tree on a meadow.
    // Without this gate the whole island reads as woodland and the atlas loses
    // the contrast it needs against open, rocky and settled terrain.
    const visualShare = forestBiomeShareAt(tx, ty);
    if (visualShare <= 0) return 0;
    // A healthy stand keeps its own density; a logged or capacity-less forest
    // keeps a visible biome footprint so the atlas never invents bald patches.
    return clamp(Math.max(visualShare * 0.72, resourceShare), 0.18, 1);
}

export function estimateBiomePotentialYield() {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return 0;
    return atlas.regions.filter(region => region.discovered).reduce((sum, region) => sum + regionPotentialYield(region), 0);
}

function pickWildlife(region, seed, index) {
    const candidates = wildlifeForBiome(region.rawBiome);
    const ranked = candidates.map(species => {
        let chance = clamp(species.rarity * (0.78 + region.quality / 220), 0, 1);
        if (species.rare) chance *= 0.16 + region.rareBias * 0.8;
        return { species, chance, roll: unit(seed, index, stringHash(species.id)) };
    }).filter(entry => entry.roll < entry.chance)
        .sort((a, b) => (a.roll / Math.max(0.02, a.chance)) - (b.roll / Math.max(0.02, b.chance)))
        .map(entry => entry.species)
        .slice(0, 6);
    const hasPrimary = ranked.some(species => ["herbivore", "fish", "omnivore"].includes(species.role));
    if (!hasPrimary) {
        const grazer = candidates.filter(species => ["herbivore", "fish", "omnivore"].includes(species.role))
            .sort((a, b) => b.rarity - a.rarity)[0];
        if (grazer) ranked.unshift(grazer);
    }
    const hasPredator = ranked.some(species => species.role === "predator");
    if (!hasPredator) {
        const predator = candidates.filter(species => species.role === "predator").sort((a, b) => b.rarity - a.rarity)[0];
        if (predator) ranked.push(predator);
    }
    const selected = [...new Set(ranked)].slice(0, 7);
    for (const predator of selected.filter(species => species.role === "predator")) {
        if (predator.prey.some(prey => selected.some(species => species.id === prey))) continue;
        const prey = candidates.find(species => predator.prey.includes(species.id));
        if (prey && !selected.includes(prey)) selected.push(prey);
    }
    return [...new Set(selected)].slice(0, 8);
}

function addFaunaProducts(region, selectedSpecies, seed, index, discovered) {
    const present = new Set(selectedSpecies.map(species => species.id));
    const products = BIOME_RESOURCES.filter(resource => Array.isArray(resource.fauna)
        && resource.fauna.some(id => present.has(id))
        && resource.biomes.includes(region.rawBiome));
    for (const resource of products) {
        if (region.resources.some(row => row.id === resource.id)) continue;
        const row = makeResourceRow(resource, region, index, seed, discovered);
        const hosts = selectedSpecies.filter(species => resource.fauna.includes(species.id));
        const hostMass = hosts.reduce((sum, species) => {
            const fauna = region.fauna.find(entry => entry.id === species.id);
            return sum + (fauna?.population || 0);
        }, 0);
        row.capacity = Math.max(12, Math.round(hostMass * 0.65 + row.capacity * 0.24));
        row.stock = Math.round(row.capacity * clamp(hostMass / Math.max(1, row.capacity), 0.28, 0.9));
        region.resources.push(row);
    }
}

function makeRegion(index, seed, context) {
    const bounds = regionBounds(index);
    const sample = sampleTerrain(context, bounds.centerX, bounds.centerY);
    const profile = BIOME_PROFILES[sample.rawBiome] || BIOME_PROFILES.meadow;
    const stand = standFor(sample.rawBiome, sample.moisture, sample.temperature);
    const first = NAME_FIRST[hash32(seed, index, 0x4e414d45) % NAME_FIRST.length];
    const second = NAME_SECOND[hash32(seed, index, 0x53554646) % NAME_SECOND.length];
    const region = {
        id: "biome-" + String(index).padStart(2, "0"),
        index,
        name: first + second,
        x: bounds.x0,
        y: bounds.y0,
        width: bounds.x1 - bounds.x0,
        height: bounds.y1 - bounds.y0,
        centerX: Math.round(bounds.centerX * 10) / 10,
        centerY: Math.round(bounds.centerY * 10) / 10,
        rawBiome: sample.rawBiome in BIOME_PROFILES ? sample.rawBiome : "meadow",
        stand,
        sample,
        quality: 0,
        rareBias: unit(seed, index, 0x52415245),
        discovered: false,
        surveyLevel: 0,
        policy: "sustainable",
        focus: profile.production === "pastoralism" ? "pastoralism" : profile.production,
        vegetation: 0,
        soilHealth: 0,
        water: 0,
        diseasePressure: 0,
        carcassLoad: 0,
        engineered: false,
        ecologyTrend: 0,
        extractionPressure: 0,
        productionCost: 1,
        resources: [],
        fauna: []
    };
    region.quality = regionQuality(sample, profile, index, seed);
    region.vegetation = clamp(profile.vegetation * (0.78 + region.quality / 220) + unit(seed, index, 0x56454745) * 0.08, 0.02, 1);
    region.soilHealth = clamp(profile.soil * (0.72 + region.quality / 220), 0.04, 1);
    region.water = clamp(profile.water * (0.82 + sample.moisture * 0.18), 0.02, 1);
    region.resources = pickResources(region, seed, index).map(resource => makeResourceRow(resource, region, index, seed, false));
    const selectedFauna = pickWildlife(region, seed, index);
    region.fauna = selectedFauna.map(species => makeFaunaRow(species, region, index, seed, false));
    addFaunaProducts(region, selectedFauna, seed, index, false);
    return region;
}

export function generateBiomeAtlas(seed, context) {
    if (!context) return null;
    const worldSeed = Number.isSafeInteger(Number(seed)) && Number(seed) > 0 ? Number(seed) : 1;
    const regions = [];
    for (let index = 0; index < MAX_REGIONS; index++) regions.push(makeRegion(index, worldSeed, context));
    const capital = regions[biomeRegionIndexAt((Number(state.worldW) || 160) / 2, (Number(state.worldH) || 160) / 2)];
    if (capital) {
        capital.discovered = true;
        capital.surveyLevel = 0;
        for (const resource of capital.resources) {
            const definition = BIOME_RESOURCE_BY_ID[resource.id];
            resource.discovered = Boolean(definition && !definition.surveyOnly && !definition.rare);
        }
        for (const fauna of capital.fauna) {
            const definition = BIOME_WILDLIFE_BY_ID[fauna.id];
            fauna.discovered = Boolean(definition && !definition.surveyOnly && !definition.rare);
        }
    }
    state.biomeAtlas = {
        version: VERSION,
        seed: worldSeed,
        grid: GRID,
        regions,
        history: [],
        lastYear: Number(state.year) || 1,
        lastSeason: Number(state.seasonIndex) || 0,
        stats: { harvests: 0, hunts: 0, surveys: 0, rareSold: 0, goldFromTrade: 0, annualYields: 0, potentialYield: 0 },
        trade: { gold: 0, lastYear: 0, imported: [], exported: [] }
    };
    state.biomeAtlas.stats.potentialYield = estimateBiomePotentialYield();
    return state.biomeAtlas;
}

export function ensureBiomeAtlas() {
    const atlas = state.biomeAtlas;
    if (atlas?.version === VERSION && Array.isArray(atlas.regions) && atlas.regions.length === MAX_REGIONS) return atlas;
    return null;
}

function regionById(regionId) {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return null;
    return atlas.regions.find(region => region.id === String(regionId)) || null;
}

function resourceRow(region, resourceId) {
    return region?.resources?.find(row => row.id === String(resourceId)) || null;
}

function faunaRow(region, speciesId) {
    return region?.fauna?.find(row => row.id === String(speciesId)) || null;
}

function seasonFactor(resource, season = state.seasonIndex) {
    const index = clamp(Math.floor(Number(season) || 0), 0, 3);
    return resource.seasons.includes(index) ? 1 : 0;
}

function resourceLabel(resource) {
    return resource?.label || resource?.id || "resource";
}

function policyFor(region) {
    return BIOME_POLICIES[region?.policy] || BIOME_POLICIES.sustainable;
}

function focusFor(region) {
    return BIOME_FOCUSES[region?.focus] || BIOME_FOCUSES.forestry;
}

function addHistory(atlas, entry) {
    if (!Array.isArray(atlas.history)) atlas.history = [];
    atlas.history.push({
        year: Number(state.year) || 1,
        season: Number(state.seasonIndex) || 0,
        regionId: text(entry.regionId, "", 32),
        kind: text(entry.kind, "note", 24),
        text: text(entry.text, "", 160)
    });
    if (atlas.history.length > BIOME_RESOURCE_HISTORY_LIMIT) atlas.history.splice(0, atlas.history.length - BIOME_RESOURCE_HISTORY_LIMIT);
}

function revealRegion(region, level = 1) {
    if (!region) return;
    region.discovered = true;
    for (const row of region.resources) {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        if (!resource) continue;
        if (level >= 2 || (!resource.surveyOnly && !resource.rare)) row.discovered = true;
    }
    for (const row of region.fauna) {
        const species = BIOME_WILDLIFE_BY_ID[row.id];
        if (!species) continue;
        if (level >= 2 || (!species.surveyOnly && !species.rare)) row.discovered = true;
    }
    region.surveyLevel = Math.max(region.surveyLevel, level);
}

export function syncBiomeDiscovery({ silent = false } = {}) {
    const atlas = ensureBiomeAtlas();
    if (!atlas || !Array.isArray(state.explored)) return { discovered: 0, total: MAX_REGIONS };
    let discovered = 0;
    for (const region of atlas.regions) {
        if (region.discovered) {
            discovered++;
            continue;
        }
        let seen = 0;
        let total = 0;
        const stepX = Math.max(1, Math.floor(region.width / 8));
        const stepY = Math.max(1, Math.floor(region.height / 8));
        for (let y = region.y; y < region.y + region.height; y += stepY) {
            for (let x = region.x; x < region.x + region.width; x += stepX) {
                total++;
                if (state.explored?.[x]?.[y]) seen++;
            }
        }
        if (total > 0 && seen / total >= 0.24) {
            revealRegion(region, 0);
            discovered++;
            if (!silent) addHistory(atlas, {
                regionId: region.id, kind: "discovery",
                text: "Explorers entered " + region.name + " and recorded its " + (BIOME_PROFILES[region.rawBiome]?.label || region.rawBiome) + "."
            });
        }
    }
    return { discovered, total: MAX_REGIONS };
}

export function surveyBiomeRegion(regionId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    if (!atlas || !region) return { ok: false, reason: "unknown-region" };
    if (!region.discovered) return { ok: false, reason: "region-not-explored" };
    if (region.surveyLevel >= 2) return { ok: false, reason: "region-fully-surveyed" };
    if ((Number(state.resources.gold) || 0) < 10) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -10);
    region.surveyLevel += 1;
    revealRegion(region, region.surveyLevel);
    atlas.stats.surveys += 1;
    addHistory(atlas, {
        regionId: region.id, kind: "survey",
        text: region.surveyLevel >= 2
            ? "A full survey of " + region.name + " mapped its rare deposits and hidden species."
            : "Surveyors charted the common resources and habitats of " + region.name + "."
    });
    return {
        ok: true,
        message: "SURVEY COMPLETE · " + region.name + " · LEVEL " + region.surveyLevel,
        region: region.id, surveyLevel: region.surveyLevel
    };
}

export function setBiomePolicy(regionId, policyId) {
    const region = regionById(regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (!BIOME_POLICY_IDS.includes(String(policyId))) return { ok: false, reason: "unknown-policy" };
    if (region.policy === policyId) return { ok: false, reason: "policy-already-set" };
    region.policy = String(policyId);
    region.productionCost = policyFor(region).cost;
    return { ok: true, message: region.name + " · " + policyFor(region).label.toUpperCase() };
}

export function setBiomeFocus(regionId, focusId) {
    const region = regionById(regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (!BIOME_FOCUS_IDS.includes(String(focusId))) return { ok: false, reason: "unknown-focus" };
    if (region.focus === focusId) return { ok: false, reason: "focus-already-set" };
    region.focus = String(focusId);
    return { ok: true, message: region.name + " · " + focusFor(region).label.toUpperCase() };
}

export function harvestBiomeResource(regionId, resourceId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    const row = resourceRow(region, resourceId);
    const resource = BIOME_RESOURCE_BY_ID[String(resourceId)];
    if (!atlas || !region || !row || !resource) return { ok: false, reason: "unknown-resource" };
    if (!region.discovered || !row.discovered) return { ok: false, reason: "resource-not-discovered" };
    if (row.locallyExtinct || row.stock <= 0) return { ok: false, reason: "stock-exhausted" };
    if (!seasonFactor(resource)) return { ok: false, reason: "out-of-season" };
    const policy = policyFor(region);
    if (policy.yield <= 0) return { ok: false, reason: "region-is-fallow" };
    const actionCost = Math.max(1, Math.round(2 * policyFor(region).cost));
    if ((Number(state.resources.gold) || 0) < actionCost) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -actionCost);
    const qualityFactor = 0.55 + row.quality / 130;
    // Degraded vegetation and a negative ecological trend reduce the usable
    // share of a harvest. This is the link from long-term damage to real yield.
    const habitatFactor = clamp(0.55 + region.vegetation * 0.38 + region.ecologyTrend * 0.2, 0.35, 1.1);
    const amount = clamp(Math.round((5 + row.stock * 0.035) * policy.yield * qualityFactor * habitatFactor), 1, 26);
    const taken = Math.min(amount, Math.ceil(row.stock));
    row.stock = Math.max(0, row.stock - taken);
    row.lastHarvestYear = Number(state.year) || 1;
    region.extractionPressure = clamp(region.extractionPressure + policy.pressure * 0.08, 0, 1);
    region.vegetation = clamp(region.vegetation - (resource.kind === "wood" ? taken * 0.0017 : taken * 0.0004), 0, 1);
    if (row.stock <= 0) {
        row.locallyExtinct = Boolean(resource.rare);
        addHistory(atlas, {
            regionId: region.id, kind: "depletion",
            text: resourceLabel(resource) + " in " + region.name + (row.locallyExtinct ? " has been locally wiped out." : " is exhausted for now.")
        });
    }
    atlas.stats.harvests += 1;
    let ledger = null;
    let stored = 0;
    if (resource.yieldResource) {
        ledger = resource.yieldResource;
        addResource(ledger, taken);
    } else {
        stored = taken;
        row.stored = Math.min(BIOME_RESOURCE_STORE_LIMIT, (Number(row.stored) || 0) + taken);
    }
    return {
        ok: true,
        message: "HARVESTED " + taken + " " + resource.label.toUpperCase() + (ledger ? "" : " · STORED FOR TRADE"),
        amount: taken, ledger, stored, region: region.id, resource: resource.id
    };
}

export function huntBiomeSpecies(regionId, speciesId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    const row = faunaRow(region, speciesId);
    const species = BIOME_WILDLIFE_BY_ID[String(speciesId)];
    if (!atlas || !region || !row || !species) return { ok: false, reason: "unknown-species" };
    if (!region.discovered || !row.discovered) return { ok: false, reason: "species-not-discovered" };
    if (row.population <= 0) return { ok: false, reason: "no-population" };
    const cost = Math.max(1, Math.round((species.rare || species.fantastic ? 14 : 4) * policyFor(region).cost));
    if ((Number(state.resources.gold) || 0) < cost) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -cost);
    const policy = policyFor(region);
    const quota = species.rare || species.endangered ? 1 : Math.max(1, Math.round(row.population * 0.07 * policy.yield));
    const taken = Math.min(row.population, quota);
    row.population = Math.max(0, row.population - taken);
    row.pressure = clamp(row.pressure + 0.18 * policy.pressure, 0, 2);
    region.carcassLoad = clamp(region.carcassLoad + taken * 0.035, 0, 1);
    region.extractionPressure = clamp(region.extractionPressure + 0.045 * policy.pressure, 0, 1);
    atlas.stats.hunts += 1;
    const food = Math.max(1, Math.round(taken * (species.role === "predator" ? 5 : 3)));
    addResource("food", food);
    let rareStored = 0;
    for (const productId of species.products) {
        const resource = BIOME_RESOURCE_BY_ID[productId];
        const productRow = resourceRow(region, productId);
        if (!resource || !productRow) continue;
        if (resource.yieldResource === "food") continue;
        const gained = Math.max(1, Math.round(taken * (resource.rare ? 0.25 : 0.65)));
        productRow.stored = Math.min(BIOME_RESOURCE_STORE_LIMIT, (Number(productRow.stored) || 0) + gained);
        productRow.stock = Math.min(productRow.capacity, productRow.stock + gained);
        rareStored += gained;
    }
    if (row.population <= 0) {
        addHistory(atlas, { regionId: region.id, kind: "extinction", text: species.label + " vanished from " + region.name + " under hunting pressure." });
    }
    return {
        ok: true,
        message: "HUNTED " + taken + " " + species.label.toUpperCase() + " · +" + food + " FOOD" + (rareStored ? " · +" + rareStored + " GOODS" : ""),
        amount: taken, food, stored: rareStored, region: region.id, species: species.id
    };
}

export function restoreBiomeRegion(regionId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    if (!atlas || !region) return { ok: false, reason: "unknown-region" };
    if (!region.discovered) return { ok: false, reason: "region-not-explored" };
    if ((Number(state.resources.gold) || 0) < 12 || (Number(state.resources.wood) || 0) < 8) {
        return { ok: false, reason: "not-enough-gold-or-wood" };
    }
    addResource("gold", -12);
    addResource("wood", -8);
    region.vegetation = clamp(region.vegetation + 0.14, 0, 1);
    region.soilHealth = clamp(region.soilHealth + 0.09, 0, 1);
    region.water = clamp(region.water + 0.05, 0, 1);
    region.extractionPressure = clamp(region.extractionPressure * 0.35, 0, 1);
    region.carcassLoad = clamp(region.carcassLoad * 0.5, 0, 1);
    for (const row of region.resources) {
        if (row.locallyExtinct) {
            row.locallyExtinct = false;
            row.stock = Math.max(1, Math.round(row.capacity * 0.08));
        } else {
            row.stock = Math.min(row.capacity, row.stock + Math.round(row.capacity * 0.07));
        }
    }
    for (const row of region.fauna) {
        if (!row.population) row.population = 1;
        row.health = clamp(row.health + 8, 0, 100);
        row.pressure = clamp(row.pressure * 0.4, 0, 2);
    }
    addHistory(atlas, { regionId: region.id, kind: "restoration", text: "Crown works restored habitat and breeding cover in " + region.name + "." });
    return { ok: true, message: "HABITAT RESTORATION COMPLETE · " + region.name };
}

export function sellBiomeGoods(regionId, resourceId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    const row = resourceRow(region, resourceId);
    const resource = BIOME_RESOURCE_BY_ID[String(resourceId)];
    if (!atlas || !region || !row || !resource) return { ok: false, reason: "unknown-resource" };
    const stored = Math.floor(Number(row.stored) || 0);
    if (stored <= 0) return { ok: false, reason: "nothing-stored" };
    const value = Math.max(1, Math.round(stored * resource.tradeValue * (0.7 + region.quality / 180)));
    row.stored = 0;
    addResource("gold", value);
    if (resource.rare) atlas.stats.rareSold += stored;
    atlas.stats.goldFromTrade += value;
    atlas.trade.gold = (Number(atlas.trade.gold) || 0) + value;
    atlas.trade.lastYear = Number(state.year) || 1;
    if (!atlas.trade.exported.includes(resource.category)) atlas.trade.exported = [...atlas.trade.exported, resource.category].slice(-12);
    addHistory(atlas, { regionId: region.id, kind: "trade", text: stored + " " + resource.label + " from " + region.name + " sold for " + value + " gold." });
    return { ok: true, message: "SOLD " + stored + " " + resource.label.toUpperCase() + " · +" + value + " GOLD", gold: value, amount: stored };
}

function ecologyHealth(region) {
    const vegetation = clamp(region.vegetation, 0, 1);
    const soil = clamp(region.soilHealth, 0, 1);
    const water = clamp(region.water, 0, 1);
    const pressure = clamp(region.extractionPressure, 0, 1);
    const faunaScore = region.fauna.length
        ? region.fauna.reduce((sum, row) => sum + clamp(row.population / Math.max(1, row.capacity), 0, 1), 0) / region.fauna.length
        : 0.4;
    return Math.round(clamp((vegetation * 0.36 + soil * 0.24 + water * 0.14 + faunaScore * 0.26) * 100 - pressure * 12, 0, 100));
}

function regionEconomy(region) {
    const visible = region.resources.filter(row => row.discovered && BIOME_RESOURCE_BY_ID[row.id]);
    const exports = visible.filter(row => {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        return resource.tradeValue >= 3 || resource.rare || resource.strategic;
    }).map(row => BIOME_RESOURCE_BY_ID[row.id].label);
    const categories = new Set(visible.map(row => BIOME_RESOURCE_BY_ID[row.id].category));
    const imports = ["wood", "stone", "food", "ore", "fiber", "herb", "salt"].filter(category => !categories.has(category));
    const cost = policyFor(region).cost * (1.08 - region.quality / 900);
    const supplyBonus = Math.round((region.quality - 50) * 0.22 + region.vegetation * 12);
    return {
        exports,
        imports,
        productionCost: Math.round(cost * 100) / 100,
        supplyBonus,
        importDependency: Math.round(imports.length / 7 * 100),
        health: ecologyHealth(region),
        focusLabel: focusFor(region).label
    };
}

function snapshotResource(row, region) {
    const resource = BIOME_RESOURCE_BY_ID[row.id];
    if (!resource) return null;
    const factor = seasonFactor(resource);
    return {
        id: row.id,
        label: resource.label,
        category: resource.category,
        categoryLabel: BIOME_RESOURCE_CATEGORIES[resource.category] || resource.category,
        kind: resource.kind,
        stock: Math.round(row.stock),
        capacity: Math.round(row.capacity),
        quality: Math.round(row.quality),
        stored: Math.round(row.stored || 0),
        discovered: Boolean(row.discovered),
        rare: Boolean(resource.rare),
        strategic: Boolean(resource.strategic),
        renewable: Boolean(resource.renewable),
        seasons: [...resource.seasons],
        seasonal: factor > 0,
        locallyExtinct: Boolean(row.locallyExtinct),
        tradeValue: resource.tradeValue,
        yieldResource: resource.yieldResource,
        description: resource.description
    };
}

function snapshotFauna(row, region) {
    const species = BIOME_WILDLIFE_BY_ID[row.id];
    if (!species) return null;
    return {
        id: row.id,
        label: species.label,
        role: species.role,
        roleLabel: species.role,
        population: Math.round(row.population),
        capacity: Math.round(row.capacity),
        health: Math.round(row.health),
        breeding: Boolean(row.breeding),
        migrating: Boolean(row.migrating),
        pressure: Math.round(row.pressure * 100) / 100,
        refugeSites: row.refugeSites,
        discovered: Boolean(row.discovered),
        rare: Boolean(species.rare),
        fantastic: Boolean(species.fantastic),
        endangered: Boolean(species.endangered || (species.rare && row.population < row.capacity * 0.32)),
        products: [...species.products],
        refuge: species.refuge,
        description: species.description
    };
}

export function getBiomeRegionSnapshot(regionId) {
    const region = regionById(regionId);
    if (!region) return null;
    const profile = BIOME_PROFILES[region.rawBiome] || BIOME_PROFILES.meadow;
    return {
        id: region.id,
        name: region.name,
        index: region.index,
        biome: region.rawBiome,
        biomeLabel: profile.label,
        color: profile.color,
        x: region.centerX,
        y: region.centerY,
        discovered: Boolean(region.discovered),
        surveyLevel: region.surveyLevel,
        policy: region.policy,
        policyLabel: policyFor(region).label,
        policyDescription: policyFor(region).description,
        focus: region.focus,
        focusLabel: focusFor(region).label,
        focusDescription: focusFor(region).description,
        quality: region.quality,
        vegetation: Math.round(region.vegetation * 100),
        soilHealth: Math.round(region.soilHealth * 100),
        water: Math.round(region.water * 100),
        pressure: Math.round(region.extractionPressure * 100),
        diseasePressure: Math.round(region.diseasePressure * 100),
        carcassLoad: Math.round(region.carcassLoad * 100),
        engineered: Boolean(region.engineered),
        ecologyTrend: Math.round(region.ecologyTrend * 1000) / 10,
        productionLabel: profile.productionLabel,
        crafts: [...profile.crafts],
        resources: region.resources.map(row => snapshotResource(row, region)).filter(Boolean),
        fauna: region.fauna.map(row => snapshotFauna(row, region)).filter(Boolean),
        economy: regionEconomy(region)
    };
}

export function getBiomeAtlasSnapshot() {
    const atlas = ensureBiomeAtlas();
    if (!atlas) {
        return {
            available: false, version: VERSION, total: MAX_REGIONS, discovered: 0,
            regions: [], surveyed: 0, rareKnown: 0, speciesKnown: 0, rareSpecies: 0,
            history: [], stats: {}, trade: {}, imports: [], exports: [], specialisations: [], health: 0
        };
    }
    syncBiomeDiscovery({ silent: true });
    const regions = atlas.regions.filter(region => region.discovered).map(region => getBiomeRegionSnapshot(region.id)).filter(Boolean);
    const allRegions = atlas.regions.map(region => getBiomeRegionSnapshot(region.id)).filter(Boolean);
    const surveyed = allRegions.filter(region => region.surveyLevel > 0).length;
    const rareKnown = allRegions.reduce((sum, region) => sum + region.resources.filter(row => row.discovered && row.rare).length, 0);
    const speciesKnown = new Set();
    let rareSpecies = 0;
    for (const region of allRegions) {
        for (const row of region.fauna) {
            if (!row.discovered) continue;
            speciesKnown.add(row.id);
            if (row.rare) rareSpecies++;
        }
    }
    const discoveredRegions = allRegions.filter(region => region.discovered);
    const categories = new Set();
    for (const region of discoveredRegions) {
        for (const row of region.resources) if (row.discovered) categories.add(row.category);
    }
    const imports = ["wood", "stone", "food", "ore", "fiber", "herb", "salt"].filter(category => !categories.has(category));
    const exports = [...new Set(discoveredRegions.flatMap(region => region.economy.exports))].slice(0, 16);
    const specialisations = [...new Set(discoveredRegions.map(region => region.focusLabel))].slice(0, 8);
    const health = discoveredRegions.length
        ? Math.round(discoveredRegions.reduce((sum, region) => sum + region.economy.health, 0) / discoveredRegions.length)
        : 0;
    return {
        available: true,
        version: atlas.version,
        seed: atlas.seed,
        total: MAX_REGIONS,
        discovered: regions.length,
        surveyed,
        regions,
        rareKnown,
        speciesKnown: speciesKnown.size,
        rareSpecies,
        history: [...(atlas.history || [])].reverse().slice(0, 12),
        stats: { ...atlas.stats },
        trade: { ...atlas.trade },
        imports,
        exports,
        specialisations,
        health,
        stores: discoveredRegions.reduce((sum, region) => sum + region.resources.reduce((inner, row) => inner + (row.stored || 0), 0), 0)
    };
}

export function getBiomeEconomySnapshot() {
    const atlas = getBiomeAtlasSnapshot();
    if (!atlas.available) return atlas;
    const regions = atlas.regions;
    const focusCounts = {};
    for (const region of regions) focusCounts[region.focusLabel] = (focusCounts[region.focusLabel] || 0) + 1;
    const supplySecurity = Math.max(0, 100 - atlas.imports.length * 11);
    return {
        ...atlas,
        focusCounts,
        supplySecurity,
        tradeValue: atlas.trade.gold || 0,
        productionCost: regions.length
            ? Math.round(regions.reduce((sum, region) => sum + region.economy.productionCost, 0) / regions.length * 100) / 100
            : 1,
        specialisedRegions: regions.filter(region => region.focus !== region.biome).length
    };
}

// The exact third detail tier gates the condensed green forest dots. The atlas
// overlay also uses it so the dots remain a survey abstraction rather than
// painting over rooftops in the normal terrain view.
export function forestPointTier(zoomLevel) {
    const level = clamp(Math.round(Number(zoomLevel) || 3), 1, 4);
    return level >= 3 ? 3 : level === 2 ? 2 : 1;
}

export function shouldDrawForestPoints(zoomLevel, mapLayer = state.mapLayer) {
    return forestPointTier(zoomLevel) === 3 && mapLayer === "biomes";
}

export function getBiomeOverlayCells() {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return [];
    return atlas.regions.filter(region => region.discovered).map(region => {
        const profile = BIOME_PROFILES[region.rawBiome] || BIOME_PROFILES.meadow;
        const rare = region.resources.filter(row => row.discovered && row.rare).slice(0, 3).map(row => row.id);
        return {
            id: region.id, x: region.x, y: region.y, width: region.width, height: region.height,
            color: profile.color, label: profile.short, rare, quality: region.quality,
            health: ecologyHealth(region), rareCount: rare.length
        };
    });
}

export function updateBiomeAtlasAnnual() {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return { updated: false, reason: "atlas-missing" };
    const year = Number(state.year) || 1;
    if (atlas.lastYear === year) return { updated: false, reason: "already-settled", year };
    atlas.lastYear = year;
    atlas.lastSeason = Number(state.seasonIndex) || 0;
    syncBiomeDiscovery({ silent: true });
    const stats = { regions: 0, produced: 0, extinctions: 0, recoveries: 0, gold: 0 };
    // This field is a current-year productive capacity, not a lifetime total.
    atlas.stats.potentialYield = 0;
    for (const region of atlas.regions) {
        if (!region.discovered) continue;
        stats.regions++;
        const policy = policyFor(region);
        const season = Number(state.seasonIndex) || 0;
        const faunaById = new Map(region.fauna.map(row => [row.id, row]));
        const herbivores = region.fauna.filter(row => ["herbivore", "omnivore"].includes(BIOME_WILDLIFE_BY_ID[row.id]?.role));
        const predators = region.fauna.filter(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "predator");
        const pollinators = region.fauna.filter(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "pollinator");
        const pests = region.fauna.filter(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "pest");
        const scavengers = region.fauna.filter(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "scavenger");
        const engineers = region.fauna.filter(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "engineer");
        const soilLife = region.fauna.filter(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "soil");
        const grazerPressure = herbivores.reduce((sum, row) => sum + row.population / Math.max(1, row.capacity), 0);
        const pollinatorService = pollinators.reduce((sum, row) => sum + row.population / Math.max(1, row.capacity), 0);
        const pestPressure = pests.reduce((sum, row) => sum + row.population / Math.max(1, row.capacity), 0);
        const scavengerService = scavengers.reduce((sum, row) => sum + row.population / Math.max(1, row.capacity), 0);
        const engineerService = engineers.reduce((sum, row) => sum + row.population / Math.max(1, row.capacity), 0);
        const soilService = soilLife.reduce((sum, row) => sum + row.population / Math.max(1, row.capacity), 0);
        const fishRows = region.resources.filter(row => BIOME_RESOURCE_BY_ID[row.id]?.kind === "fish");
        const fishCapacity = fishRows.reduce((sum, row) => sum + row.capacity, 0);
        const fishStockRatio = fishCapacity > 0 ? fishRows.reduce((sum, row) => sum + row.stock, 0) / fishCapacity : 1;
        const pressure = policy.pressure * (0.45 + region.extractionPressure);
        // Vegetation: regrowth, browsing, pollination and pests are one balance.
        const vegetationDelta = 0.018 * (0.6 + region.water) * (1 + pollinatorService * 0.35)
            - grazerPressure * 0.0042 - pestPressure * 0.0055 - region.extractionPressure * 0.022;
        region.vegetation = clamp(region.vegetation + vegetationDelta, 0.005, 1);
        region.soilHealth = clamp(region.soilHealth
            + 0.012 * (1 + soilService) * (0.4 + region.vegetation)
            - region.extractionPressure * 0.018 + engineerService * 0.008, 0.02, 1);
        region.water = clamp(region.water + engineerService * 0.016 - region.extractionPressure * 0.006, 0.02, 1);
        region.diseasePressure = clamp(region.diseasePressure + region.carcassLoad * 0.06 - scavengerService * 0.08, 0, 1);
        region.carcassLoad = clamp(region.carcassLoad * 0.45, 0, 1);
        region.engineered = Boolean(engineerService > 0.18);
        for (const row of region.resources) {
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            if (!resource) continue;
            const seasonal = seasonFactor(resource, season);
            if (resource.renewable) {
                const ecosystem = 0.4 + region.vegetation * 0.45 + region.soilHealth * 0.25 + pollinatorService * 0.16;
                const regen = resource.regen * (resource.kind === "fish" ? region.water : ecosystem) * policy.regen
                    * (resource.rare ? 0.35 : 1);
                if (!row.locallyExtinct) row.stock = Math.min(row.capacity, row.stock + row.capacity * regen);
            }
        }
        // The annual pass reports productive capacity; it does not put free
        // goods into the royal ledger. The player harvests through a real
        // action, so regional ecology never silently perturbs the established
        // treasury, food or population systems.
        const potential = regionPotentialYield(region, season);
        stats.produced += potential;
        atlas.stats.potentialYield += potential;
        // Wildlife: prey availability caps predators, vegetation caps grazers,
        // hunting pressure suppresses recruitment, and refuges shelter recovery.
        for (const row of region.fauna) {
            const species = BIOME_WILDLIFE_BY_ID[row.id];
            if (!species) continue;
            // Capacity is derived from the species' habitat baseline every
            // year. Multiplying last year's capacity by a habitat factor would
            // compound into absurd populations over a long campaign.
            let capacity = Math.max(1, Math.round(row.baseCapacity || row.capacity));
            if (species.role === "predator") {
                const preyMass = species.prey.reduce((sum, preyId) => {
                    const prey = faunaById.get(preyId);
                    return sum + (prey ? prey.population : 0);
                }, 0);
                capacity = Math.max(2, Math.round(Math.min(capacity, preyMass * (species.fantastic ? 0.035 : 0.11))));
            } else if (species.role === "pollinator") {
                capacity = Math.round(capacity * (0.45 + region.vegetation * 0.8));
            } else if (species.role === "pest") {
                capacity = Math.round(capacity * (0.45 + region.vegetation * 0.65));
            } else if (species.role === "fish") {
                capacity = Math.round(capacity * (0.35 + region.water * 0.75) * (0.52 + fishStockRatio * 0.58));
            } else if (species.role === "herbivore" || species.role === "omnivore") {
                capacity = Math.round(capacity * (0.35 + region.vegetation * 0.72)
                    * (species.water ? 0.7 + region.water * 0.3 : 1));
            } else if (species.role === "scavenger") {
                capacity = Math.round(capacity * (0.4 + region.carcassLoad * 0.5 + 0.2));
            }
            capacity += Math.round(row.refugeSites * 1.8);
            row.capacity = Math.max(1, capacity);
            const breeding = species.breeding.includes(season);
            const migration = species.migratory ? (breeding ? 1 : 0.55) : 1;
            row.breeding = breeding;
            row.migrating = Boolean(species.migratory && !breeding);
            const density = row.population / Math.max(1, row.capacity);
            const recruitment = row.capacity * species.reproduction * (breeding ? 1.25 : 0.35)
                * (1 - density) * migration * (1 + region.vegetation * 0.24);
            const huntingLoss = row.population * row.pressure * 0.32;
            const habitatLoss = density > 1 ? (density - 1) * row.capacity * 0.35 : 0;
            row.population = clamp(row.population + recruitment - huntingLoss - habitatLoss, 0, row.capacity * 1.25);
            row.health = clamp(row.health + (region.vegetation - 0.5) * 3 - row.pressure * 2 + (row.refugeSites ? 0.3 : 0), 5, 100);
            row.pressure = clamp(row.pressure * 0.62, 0, 2);
            if (row.population <= 0.4) {
                row.population = 0;
                row.health = Math.min(row.health, 20);
                if (species.rare) {
                    stats.extinctions += 1;
                    addHistory(atlas, { regionId: region.id, kind: "extinction", text: species.label + " is locally extinct in " + region.name + "." });
                }
            } else if (density < 0.3 && species.rare) {
                stats.recoveries += 1;
            }
        }
        // Predation closes the food web: predators eat into the same prey
        // populations that cap their own capacity. The loss is bounded to a
        // small annual share so a stable web does not oscillate wildly.
        for (const predator of predators) {
            const species = BIOME_WILDLIFE_BY_ID[predator.id];
            if (!species) continue;
            const preyRows = species.prey.map(id => faunaById.get(id)).filter(Boolean);
            const preyMass = preyRows.reduce((sum, row) => sum + row.population, 0);
            if (preyMass <= 0) continue;
            const demand = predator.population * (species.fantastic ? 0.18 : 0.075);
            for (const prey of preyRows) {
                prey.population = Math.max(0, prey.population - demand * (prey.population / preyMass));
            }
        }
        for (const row of region.fauna) {
            if (row.population < 0.4) row.population = 0;
        }
        region.extractionPressure = clamp(region.extractionPressure * 0.72, 0, 1);
        region.ecologyTrend = clamp((region.vegetation - 0.5) * 0.6 + (region.soilHealth - 0.5) * 0.4 - region.extractionPressure * 0.4, -1, 1);
        region.productionCost = Math.round(policy.cost * (1.08 - region.quality / 900) * 100) / 100;
    }
    regionEcologyHistory(atlas, stats, year);
    return { updated: true, year, ...stats };
}

function regionEcologyHistory(atlas, stats, year) {
    if (!stats.regions) return;
    if (stats.extinctions > 0) {
        addLog("BIOME SURVEY · " + stats.extinctions + " LOCAL EXTINCTION(S) RECORDED", "#d19a7a", "ecology");
    }
    if (stats.recoveries > 0 && year % 3 === 0) {
        addLog("RARE WILDLIFE IS RECOVERING IN THE SURVEYED BIOMES", "#a3d6a7", "ecology");
    }
    if (stats.produced > 0) {
        addHistory(atlas, {
            regionId: "", kind: "harvest",
            text: "The surveyed regions could yield about " + stats.produced + " raw goods in year " + year + "."
        });
    }
}

// ── Save DTOs ──────────────────────────────────────────────────
function serializeResourceRow(row) {
    return {
        id: row.id,
        stock: Math.round(row.stock),
        capacity: Math.round(row.capacity),
        quality: Math.round(row.quality),
        stored: Math.round(row.stored),
        discovered: Boolean(row.discovered),
        locallyExtinct: Boolean(row.locallyExtinct),
        lastHarvestYear: Math.round(row.lastHarvestYear)
    };
}

function serializeFaunaRow(row) {
    return {
        id: row.id,
        population: Math.round(row.population * 10) / 10,
        baseCapacity: Math.round(row.baseCapacity || row.capacity),
        capacity: Math.round(row.capacity),
        health: Math.round(row.health),
        breeding: Boolean(row.breeding),
        migrating: Boolean(row.migrating),
        pressure: Math.round(row.pressure * 1000) / 1000,
        refugeSites: Math.round(row.refugeSites),
        discovered: Boolean(row.discovered)
    };
}

export function serializeBiomeAtlasState() {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return null;
    return {
        version: VERSION,
        seed: atlas.seed,
        lastYear: atlas.lastYear,
        lastSeason: atlas.lastSeason,
        stats: { ...atlas.stats },
        trade: { ...atlas.trade },
        history: (atlas.history || []).slice(-BIOME_RESOURCE_HISTORY_LIMIT).map(entry => ({ ...entry })),
        regions: atlas.regions.map(region => ({
            id: region.id,
            discovered: Boolean(region.discovered),
            surveyLevel: Math.round(region.surveyLevel),
            policy: region.policy,
            focus: region.focus,
            vegetation: Math.round(region.vegetation * 1000) / 1000,
            soilHealth: Math.round(region.soilHealth * 1000) / 1000,
            water: Math.round(region.water * 1000) / 1000,
            diseasePressure: Math.round(region.diseasePressure * 1000) / 1000,
            carcassLoad: Math.round(region.carcassLoad * 1000) / 1000,
            engineered: Boolean(region.engineered),
            ecologyTrend: Math.round(region.ecologyTrend * 1000) / 1000,
            extractionPressure: Math.round(region.extractionPressure * 1000) / 1000,
            productionCost: Math.round(region.productionCost * 100) / 100,
            resources: region.resources.map(serializeResourceRow),
            fauna: region.fauna.map(serializeFaunaRow)
        }))
    };
}

export function validateBiomeAtlasSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== VERSION) {
        throw new Error("Save data contains an invalid biome atlas state.");
    }
    if (!Array.isArray(snapshot.regions) || snapshot.regions.length > MAX_REGIONS) {
        throw new Error("Save data contains an invalid biome region list.");
    }
    const seen = new Set();
    for (const region of snapshot.regions) {
        if (!region || typeof region !== "object" || Array.isArray(region)) {
            throw new Error("Save data contains an invalid biome region.");
        }
        const id = String(region.id || "");
        if (!/^biome-\d{2}$/.test(id) || seen.has(id)) throw new Error("Save data contains an invalid biome region id.");
        seen.add(id);
        if (!BIOME_POLICY_IDS.includes(String(region.policy))) throw new Error("Save data contains an invalid biome policy.");
        if (!BIOME_FOCUS_IDS.includes(String(region.focus))) throw new Error("Save data contains an invalid biome focus.");
        if (!Array.isArray(region.resources) || region.resources.length > 24) throw new Error("Save data contains an invalid biome resource list.");
        if (!Array.isArray(region.fauna) || region.fauna.length > 12) throw new Error("Save data contains an invalid biome wildlife list.");
        for (const row of region.resources) {
            if (!row || typeof row !== "object" || !BIOME_RESOURCE_BY_ID[row.id]
                || !Number.isFinite(Number(row.stock)) || Number(row.stock) < 0 || Number(row.stock) > 1000000
                || !Number.isFinite(Number(row.capacity)) || Number(row.capacity) < 0 || Number(row.capacity) > 1000000
                || !Number.isFinite(Number(row.quality)) || Number(row.quality) < 0 || Number(row.quality) > 100
                || !Number.isFinite(Number(row.stored)) || Number(row.stored) < 0 || Number(row.stored) > BIOME_RESOURCE_STORE_LIMIT) {
                throw new Error("Save data contains an invalid biome resource row.");
            }
        }
        for (const row of region.fauna) {
            if (!row || typeof row !== "object" || !BIOME_WILDLIFE_BY_ID[row.id]
                || !Number.isFinite(Number(row.population)) || Number(row.population) < 0 || Number(row.population) > 100000
                || !Number.isFinite(Number(row.capacity)) || Number(row.capacity) < 0 || Number(row.capacity) > 100000
                || !Number.isFinite(Number(row.health)) || Number(row.health) < 0 || Number(row.health) > 100
                || !Number.isFinite(Number(row.pressure)) || Number(row.pressure) < 0 || Number(row.pressure) > 2) {
                throw new Error("Save data contains an invalid biome wildlife row: " + String(row?.id || "unknown")
                    + " pop=" + String(row?.population) + " cap=" + String(row?.capacity)
                    + " health=" + String(row?.health) + " pressure=" + String(row?.pressure));
            }
        }
    }
    return true;
}

export function normalizeBiomeAtlasState(snapshot) {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return null;
    if (!snapshot) return atlas;
    validateBiomeAtlasSnapshot(snapshot);
    const byId = new Map(snapshot.regions.map(region => [String(region.id), region]));
    for (const region of atlas.regions) {
        const saved = byId.get(region.id);
        if (!saved) continue;
        region.discovered = Boolean(saved.discovered) || region.discovered;
        region.surveyLevel = boundedInt(saved.surveyLevel, 0, 2);
        region.policy = BIOME_POLICY_IDS.includes(String(saved.policy)) ? String(saved.policy) : region.policy;
        region.focus = BIOME_FOCUS_IDS.includes(String(saved.focus)) ? String(saved.focus) : region.focus;
        region.vegetation = clamp(finite(saved.vegetation, region.vegetation), 0.005, 1);
        region.soilHealth = clamp(finite(saved.soilHealth, region.soilHealth), 0.02, 1);
        region.water = clamp(finite(saved.water, region.water), 0.02, 1);
        region.diseasePressure = clamp(finite(saved.diseasePressure, 0), 0, 1);
        region.carcassLoad = clamp(finite(saved.carcassLoad, 0), 0, 1);
        region.engineered = Boolean(saved.engineered);
        region.ecologyTrend = clamp(finite(saved.ecologyTrend, 0), -1, 1);
        region.extractionPressure = clamp(finite(saved.extractionPressure, 0), 0, 1);
        region.productionCost = clamp(finite(saved.productionCost, 1), 0.5, 2);
        const resourceMap = new Map((saved.resources || []).map(row => [String(row.id), row]));
        for (const row of region.resources) {
            const savedRow = resourceMap.get(row.id);
            if (!savedRow) continue;
            row.stock = clamp(nonNegative(savedRow.stock), 0, Math.max(row.capacity, 1000000));
            row.capacity = Math.max(1, Math.round(clamp(nonNegative(savedRow.capacity), 1, 1000000)));
            row.quality = Math.round(clamp(nonNegative(savedRow.quality), 0, 100));
            row.stored = Math.min(BIOME_RESOURCE_STORE_LIMIT, Math.round(nonNegative(savedRow.stored)));
            row.discovered = Boolean(savedRow.discovered);
            row.locallyExtinct = Boolean(savedRow.locallyExtinct);
            row.lastHarvestYear = Math.round(clamp(nonNegative(savedRow.lastHarvestYear), 0, 1000000));
        }
        const faunaMap = new Map((saved.fauna || []).map(row => [String(row.id), row]));
        for (const row of region.fauna) {
            const savedRow = faunaMap.get(row.id);
            if (!savedRow) continue;
            row.population = clamp(nonNegative(savedRow.population), 0, 100000);
            row.baseCapacity = Math.max(1, Math.round(clamp(nonNegative(savedRow.baseCapacity || savedRow.capacity), 1, 100000)));
            row.capacity = Math.max(1, Math.round(clamp(nonNegative(savedRow.capacity), 1, 100000)));
            row.health = Math.round(clamp(nonNegative(savedRow.health), 0, 100));
            row.breeding = Boolean(savedRow.breeding);
            row.migrating = Boolean(savedRow.migrating);
            row.pressure = clamp(nonNegative(savedRow.pressure), 0, 2);
            row.refugeSites = boundedInt(savedRow.refugeSites, 0, 8);
            row.discovered = Boolean(savedRow.discovered);
        }
    }
    atlas.lastYear = Math.round(clamp(nonNegative(snapshot.lastYear), 1, 1000000));
    atlas.lastSeason = boundedInt(snapshot.lastSeason, 0, 3);
    if (snapshot.stats && typeof snapshot.stats === "object") {
        atlas.stats = {
            harvests: boundedInt(snapshot.stats.harvests, 0, 1000000),
            hunts: boundedInt(snapshot.stats.hunts, 0, 1000000),
            surveys: boundedInt(snapshot.stats.surveys, 0, 1000000),
            rareSold: boundedInt(snapshot.stats.rareSold, 0, 1000000),
            goldFromTrade: boundedInt(snapshot.stats.goldFromTrade, 0, 100000000),
            annualYields: boundedInt(snapshot.stats.annualYields, 0, 100000000),
            potentialYield: boundedInt(snapshot.stats.potentialYield, 0, 100000000)
        };
    }
    if (snapshot.trade && typeof snapshot.trade === "object") {
        atlas.trade = {
            gold: boundedInt(snapshot.trade.gold, 0, 100000000),
            lastYear: boundedInt(snapshot.trade.lastYear, 0, 1000000),
            imported: Array.isArray(snapshot.trade.imported) ? snapshot.trade.imported.slice(0, 12).map(value => text(value, "", 32)) : [],
            exported: Array.isArray(snapshot.trade.exported) ? snapshot.trade.exported.slice(0, 12).map(value => text(value, "", 32)) : []
        };
    }
    if (Array.isArray(snapshot.history)) {
        atlas.history = snapshot.history.slice(-BIOME_RESOURCE_HISTORY_LIMIT).map(entry => ({
            year: boundedInt(entry?.year, 1, 1000000),
            season: boundedInt(entry?.season, 0, 3),
            regionId: text(entry?.regionId, "", 32),
            kind: text(entry?.kind, "note", 24),
            text: text(entry?.text, "", 160)
        }));
    }
    return atlas;
}

export function restoreBiomeAtlasState(snapshot) {
    if (snapshot === undefined || snapshot === null) return null;
    return normalizeBiomeAtlasState(snapshot);
}

export function resetBiomeAtlas() {
    state.biomeAtlas = null;
}

// Exposed for deterministic tests and diagnostics.
export const __internals = { hash32, unit, stringHash, regionBounds, seasonFactor, ecologyHealth };
