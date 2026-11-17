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
    BIOME_DIET_CATEGORIES, BIOME_FOCUSES, BIOME_FOCUS_IDS, BIOME_POLICIES, BIOME_POLICY_IDS,
    BIOME_PROFILES, BIOME_REGION_GRID, BIOME_REGION_MAX, BIOME_RESOURCES,
    BIOME_RESOURCE_BY_ID, BIOME_RESOURCE_CATEGORIES, BIOME_RESOURCE_FAMILY_BY_CATEGORY,
    BIOME_RESOURCE_HISTORY_LIMIT, BIOME_RESOURCE_IDS, BIOME_RESOURCE_MAP_FAMILIES,
    BIOME_RESOURCE_STORE_LIMIT, BIOME_RESOURCE_VERSION, BIOME_WILDLIFE,
    BIOME_WILDLIFE_BY_ID, BIOME_WILDLIFE_IDS, BIOME_CRAFT_GOOD_BY_ID,
    BIOME_CRAFT_RECIPE_BY_CRAFT, BIOME_CRAFT_RECIPE_BY_ID, resourcesForBiome, wildlifeForBiome
} from "../world/biome-resource-data.js";

const VERSION = BIOME_RESOURCE_VERSION;
const GRID = BIOME_REGION_GRID;
const MAX_REGIONS = BIOME_REGION_MAX;
// Tile samples are a bounded diagnostic/rendering layer, never a per-tile
// object graph. 25 points per region/resource are enough to expose local
// differences while the region remains the saved aggregate.
const TILE_SAMPLE_COLUMNS = 5;
const TILE_CACHE_LIMIT = 128;
const TILE_FRAME_BUDGET = 8;
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

let tileTerrainCache = null;
let tileTerrainEpoch = 0;
let tileSampleCache = new Map();
let tileCacheHits = 0;
let tileCacheMisses = 0;
let tileFrameKey = null;
let tileFrameBudget = TILE_FRAME_BUDGET;

function tileTerrainContext() {
    const heights = state.heightMap;
    const moistures = state.moistureMap;
    const temperatures = state.temperatureMap;
    const fertility = state.resourceGeography?.fertility || null;
    if (!heights || !moistures || !temperatures) return null;
    if (!tileTerrainCache || tileTerrainCache.heights !== heights
        || tileTerrainCache.moistures !== moistures
        || tileTerrainCache.temperatures !== temperatures
        || tileTerrainCache.fertility !== fertility
        || tileTerrainCache.resolution !== state.terrainResolution
        || tileTerrainCache.pixW !== state.terrainPixW
        || tileTerrainCache.pixH !== state.terrainPixH
        || tileTerrainCache.sea !== state.seaLevel) {
        tileTerrainCache = {
            heights, moistures, temperatures, fertility,
            resolution: Number(state.terrainResolution) || 1,
            pixW: Number(state.terrainPixW) || 1,
            pixH: Number(state.terrainPixH) || 1,
            sea: Number(state.seaLevel) || 0.33
        };
        tileTerrainEpoch += 1;
    }
    return tileTerrainCache;
}

function tileSoilAt(region, x, y) {
    const fertility = state.resourceGeography?.fertility;
    if (fertility) {
        const width = Math.max(1, Number(state.worldW) || 1);
        const index = (Number(y) || 0) * width + (Number(x) || 0);
        return clamp(finite(fertility[index], (Number(region.soilHealth) || 0.4) * 100) / 100, 0, 1);
    }
    return clamp(Number(region.soilHealth) || 0.4, 0, 1);
}

function tileSamplePoints(region) {
    const columns = TILE_SAMPLE_COLUMNS;
    const points = [];
    for (let row = 0; row < columns; row++) {
        for (let column = 0; column < columns; column++) {
            points.push({
                x: region.x + Math.min(region.width - 1, Math.floor((column + 0.5) * region.width / columns)),
                y: region.y + Math.min(region.height - 1, Math.floor((row + 0.5) * region.height / columns))
            });
        }
    }
    return points;
}

function tileSuitability(resource, region, sample, x, y, seed, tileSoil = null) {
    if (!resource?.biomes?.includes(sample.rawBiome)) return 0;
    const profile = BIOME_PROFILES[sample.rawBiome] || BIOME_PROFILES.meadow;
    const weight = resource.quality || {};
    const soil = clamp((tileSoil ?? (Number(region.soilHealth) || 0.4)) * 0.7 + profile.soil * 0.3, 0, 1);
    const jitter = unit(seed, x, y, stringHash(resource.id) ^ 0x54494c45) - 0.5;
    const score = 0.42
        + (Number(sample.moisture) - 0.5) * 0.78 * finite(weight.moisture, 0.2)
        + (Number(sample.temperature) - 0.5) * 0.7 * finite(weight.temperature, 0.2)
        + (Number(sample.height) - 0.5) * 0.55 * finite(weight.height, 0.1)
        + (soil - 0.5) * 0.72 * finite(weight.soil, 0.3)
        + profile.vegetation * (resource.kind === "fish" ? 0.04 : 0.2)
        + profile.water * (resource.kind === "fish" ? 0.34 : 0.04)
        + (sample.rawBiome === region.rawBiome ? 0.12 : 0)
        + jitter * 0.12;
    return clamp(score, 0, 1.3);
}

function tileQuality(resource, region, sample, seed, tileSoil = null) {
    const weight = resource.quality || {};
    const soil = tileSoil ?? (Number(region.soilHealth) || 0.4);
    const score = 48
        + (Number(sample.moisture) - 0.5) * 46 * finite(weight.moisture, 0.2)
        + (Number(sample.temperature) - 0.5) * 46 * finite(weight.temperature, 0.2)
        + (Number(sample.height) - 0.5) * 42 * finite(weight.height, 0.1)
        + (soil - 0.5) * 44 * finite(weight.soil, 0.3)
        + (unit(seed, sample.x, sample.y, stringHash(resource.id) ^ 0x5155414c) - 0.5) * 12;
    return clamp(score + (Number(region.quality) - 50) * 0.28, 8, 100);
}

function tileSignature(region, row, resource, atlas) {
    tileTerrainContext();
    return [
        atlas.seed, region.id, region.x, region.y, region.width, region.height,
        region.rawBiome, region.quality, region.soilHealth, region.vegetation, region.water,
        region.surveyLevel, region.discovered, row.id, row.capacity, row.quality,
        row.discovered, row.locallyExtinct, state.seasonIndex, tileTerrainEpoch
    ].join("|");
}

function computeTileSamples(region, row, resource, atlas) {
    const context = tileTerrainContext();
    const points = tileSamplePoints(region);
    const values = points.map(point => {
        const sample = context
            ? sampleTerrain(context, point.x + 0.5, point.y + 0.5)
            : (region.sample || { height: 0.5, moisture: 0.5, temperature: 0.55, rawBiome: region.rawBiome });
        const soil = tileSoilAt(region, point.x, point.y);
        return {
            x: point.x, y: point.y,
            biome: sample.rawBiome,
            height: Math.round(Number(sample.height) * 1000) / 1000,
            moisture: Math.round(Number(sample.moisture) * 1000) / 1000,
            temperature: Math.round(Number(sample.temperature) * 1000) / 1000,
            soil: Math.round(soil * 1000) / 1000,
            suitability: Math.round(tileSuitability(resource, region, sample, point.x, point.y, atlas.seed, soil) * 1000) / 1000,
            quality: Math.round(tileQuality(resource, region, sample, atlas.seed, soil) * 10) / 10
        };
    });
    const meanSuitability = values.reduce((sum, sample) => sum + sample.suitability, 0) / Math.max(1, values.length);
    const meanQuality = values.reduce((sum, sample) => sum + sample.quality, 0) / Math.max(1, values.length);
    const samples = values.map(sample => {
        const factor = meanSuitability > 0.0001 ? sample.suitability / meanSuitability : 0;
        return {
            ...sample,
            capacity: Math.max(0, Math.round(row.capacity * factor / Math.max(1, values.length))),
            quality: Math.round(clamp(row.quality + (sample.quality - meanQuality) * 0.55, 8, 100))
        };
    });
    const capacity = samples.reduce((sum, sample) => sum + sample.capacity, 0);
    const weightedQuality = capacity > 0
        ? samples.reduce((sum, sample) => sum + sample.quality * sample.capacity, 0) / capacity
        : row.quality;
    return {
        samples,
        suitability: Math.round(meanSuitability * 1000) / 1000,
        capacity,
        quality: Math.round(weightedQuality * 10) / 10
    };
}

function cachedTileSamples(region, row, resource, atlas, budgeted = false) {
    const key = region.id + ":" + row.id;
    const signature = tileSignature(region, row, resource, atlas);
    const cached = tileSampleCache.get(key);
    if (cached?.signature === signature) {
        tileCacheHits += 1;
        tileSampleCache.delete(key);
        tileSampleCache.set(key, cached);
        return { ...cached.result, cached: true };
    }
    if (budgeted && tileFrameBudget <= 0) return null;
    if (budgeted) tileFrameBudget -= 1;
    tileCacheMisses += 1;
    const result = computeTileSamples(region, row, resource, atlas);
    tileSampleCache.set(key, { signature, result });
    while (tileSampleCache.size > TILE_CACHE_LIMIT) {
        tileSampleCache.delete(tileSampleCache.keys().next().value);
    }
    return { ...result, cached: false };
}

export function beginBiomeDensityFrame(frameKey = state.renderedFrames || 0) {
    const key = String(frameKey);
    if (tileFrameKey !== key) {
        tileFrameKey = key;
        tileFrameBudget = TILE_FRAME_BUDGET;
    }
}

export function invalidateBiomeTileCache() {
    tileSampleCache = new Map();
    tileCacheHits = 0;
    tileCacheMisses = 0;
    tileFrameKey = null;
    tileFrameBudget = TILE_FRAME_BUDGET;
}

export function getBiomeTileSampleStats() {
    return {
        cacheSize: tileSampleCache.size, cacheHits: tileCacheHits, cacheMisses: tileCacheMisses,
        frameBudget: tileFrameBudget, frameSize: TILE_FRAME_BUDGET, frameKey: tileFrameKey
    };
}

export function getBiomeResourceTileSamples(regionId, resourceId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    const row = resourceRow(region, resourceId);
    const resource = BIOME_RESOURCE_BY_ID[resourceId];
    if (!atlas || !region || !row || !resource) return { ok: false, reason: "unknown-resource" };
    const result = cachedTileSamples(region, row, resource, atlas, false);
    return { ok: true, regionId: region.id, resourceId: resource.id, ...result };
}

export function getBiomeRegionTileSnapshot(regionId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    if (!atlas || !region) return { ok: false, reason: "unknown-region" };
    const resources = [];
    let capacity = 0;
    let qualityWeight = 0;
    let qualityUnits = 0;
    for (const row of region.resources) {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        if (!resource) continue;
        const result = cachedTileSamples(region, row, resource, atlas, false);
        resources.push({
            id: row.id, category: resource.category,
            tileCapacity: result.capacity, tileQuality: result.quality,
            samples: result.samples.length, sampleSuitability: result.suitability
        });
        capacity += result.capacity;
        const units = Math.max(1, result.capacity);
        qualityWeight += result.quality * units;
        qualityUnits += units;
    }
    return {
        ok: true, regionId: region.id, tileCapacity: capacity,
        tileQuality: Math.round((qualityWeight / Math.max(1, qualityUnits)) * 10) / 10,
        resources
    };
}

export function getBiomeDensityCells(frameKey = state.renderedFrames || 0) {
    beginBiomeDensityFrame(frameKey);
    const atlas = ensureBiomeAtlas();
    if (!atlas) return [];
    return atlas.regions.filter(region => region.discovered).map(region => {
        const families = new Map();
        for (const row of region.resources) {
            if (!row.discovered || row.locallyExtinct) continue;
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            if (!resource) continue;
            const result = cachedTileSamples(region, row, resource, atlas, true);
            if (!result) continue;
            const familyId = BIOME_RESOURCE_FAMILY_BY_CATEGORY[resource.category] || "flora";
            const family = BIOME_RESOURCE_MAP_FAMILIES[familyId] || BIOME_RESOURCE_MAP_FAMILIES.flora;
            const entry = families.get(familyId) || {
                id: family.id, label: family.label, color: family.color,
                suitabilitySum: 0, sampleCount: 0, capacity: 0, points: []
            };
            entry.suitabilitySum += result.suitability * result.samples.length;
            entry.sampleCount += result.samples.length;
            entry.capacity += result.capacity;
            for (const sample of result.samples) {
                if (sample.suitability <= 0.02) continue;
                entry.points.push({ x: sample.x, y: sample.y, value: Math.round(sample.suitability * 100) });
            }
            families.set(familyId, entry);
        }
        const visibleFamilies = [...families.values()].map(entry => ({
            id: entry.id, label: entry.label, color: entry.color,
            value: Math.round(100 * entry.suitabilitySum / Math.max(1, entry.sampleCount)),
            capacity: entry.capacity,
            points: entry.points.sort((a, b) => b.value - a.value || a.x - b.x || a.y - b.y).slice(0, 2)
        })).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
        return { id: region.id, x: region.x, y: region.y, width: region.width, height: region.height, families: visibleFamilies };
    });
}

function depositSites(resource, region, index, seed) {
    const count = resource.rare ? 1 : 2 + Math.floor(unit(seed, index, stringHash(resource.id) ^ 0x4445504f) * 2);
    const deposits = [];
    for (let site = 0; site < count; site++) {
        const salt = stringHash(resource.id) ^ Math.imul(site + 1, 0x9e3779b1);
        deposits.push({
            x: region.x + 1 + Math.floor(unit(seed, index, salt ^ 0x5829) * Math.max(1, region.width - 2)),
            y: region.y + 1 + Math.floor(unit(seed, index, salt ^ 0x5929) * Math.max(1, region.height - 2)),
            weight: Math.round((0.4 + unit(seed, index, salt ^ 0x5a29) * 0.6) * 100) / 100
        });
    }
    return deposits;
}

function refugeSitesFor(species, region, index, seed) {
    const count = 1 + Math.floor(unit(seed, index, stringHash(species.id) ^ 0x52454655) * 3);
    const kinds = species.role === "fish" ? ["spawn", "pool"]
        : species.role === "predator" ? ["den", "lair"]
        : species.role === "pollinator" ? ["hive", "hollow"]
        : species.role === "scavenger" ? ["roost", "cliff"]
        : ["burrow", "thicket", "ledge"];
    const refuges = [];
    for (let site = 0; site < count; site++) {
        const salt = stringHash(species.id) ^ Math.imul(site + 1, 0x85ebca6b);
        refuges.push({
            x: region.x + 1 + Math.floor(unit(seed, index, salt ^ 0x5829) * Math.max(1, region.width - 2)),
            y: region.y + 1 + Math.floor(unit(seed, index, salt ^ 0x5929) * Math.max(1, region.height - 2)),
            kind: kinds[Math.floor(unit(seed, index, salt ^ 0x5b29) * kinds.length)]
        });
    }
    return refuges;
}

function makeResourceRow(resource, region, index, seed, discovered) {
    const capacity = resourceCapacity(resource, region, seed, index);
    const stockShare = resource.renewable ? 0.62 : 0.72;
    const stored = resource.rare ? 0 : 0;
    return {
        id: resource.id,
        stock: Math.round(capacity * (stockShare + unit(seed, index, stringHash(resource.id) ^ 0x53544f43) * 0.28)),
        baseCapacity: capacity,
        capacity,
        quality: resourceQuality(resource, region, index, seed),
        stored,
        deposits: depositSites(resource, region, index, seed),
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
    const refuges = refugeSitesFor(species, region, index, seed);
    return {
        id: species.id,
        population: Math.max(1, Math.round(capacity * (0.48 + unit(seed, index, stringHash(species.id)) * 0.38))),
        baseCapacity: capacity,
        capacity,
        health: Math.round(clamp(58 + region.quality * 0.34 + unit(seed, index, stringHash(species.id) ^ 0x4845414c) * 18, 25, 100)),
        breeding: species.breeding.includes(Number(state.seasonIndex) || 0),
        migrating: Boolean(species.migratory && !species.breeding.includes(Number(state.seasonIndex) || 0)),
        pressure: 0,
        refugeSites: refuges.length,
        refuges,
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
        const base = Math.min(3, row.capacity * share * policy.yield * (0.55 + row.quality / 120));
        total += base * focusYieldFactor(region, resource) * supplyYieldFactor(region);
    }
    return Math.round(total);
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
        focus: defaultFocusForBiome(profile.id),
        vegetation: 0,
        soilHealth: 0,
        water: 0,
        diseasePressure: 0,
        carcassLoad: 0,
        engineered: false,
        protectedArea: false,
        clearCut: 0,
        erosion: 0,
        ecologyTrend: 0,
        extractionPressure: 0,
        productionCost: 1,
        importCoverage: [],
        caravanImports: 0,
        resources: [],
        fauna: [],
        crafted: {}
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
        capital.productionCost = productionCostFor(capital);
    }
    state.biomeAtlas = {
        version: VERSION,
        seed: worldSeed,
        grid: GRID,
        regions,
        history: [],
        migration: [],
        caravans: [],
        lastYear: Number(state.year) || 1,
        lastSeason: Number(state.seasonIndex) || 0,
        lastSeasonKey: (Number(state.year) || 1) * 4 + (Number(state.seasonIndex) || 0),
        stats: { harvests: 0, hunts: 0, surveys: 0, crafts: 0, craftsSold: 0, rareSold: 0, goldFromTrade: 0, annualYields: 0, potentialYield: 0 },
        trade: { gold: 0, lastYear: 0, imported: [], exported: [], caravanSpend: 0 }
    };
    state.biomeAtlas.stats.potentialYield = estimateBiomePotentialYield();
    invalidateBiomeTileCache();
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
function defaultFocusForBiome(biome) {
    const profile = BIOME_PROFILES[biome] || BIOME_PROFILES.meadow;
    return profile.production === "pastoralism" ? "pastoralism" : profile.production;
}

const CORE_CATEGORIES = freezeList(["wood", "stone", "food", "ore", "fiber", "herb", "salt"]);
const FOOD_CATEGORIES = freezeList(["fruit", "fish", "meat", "dairy", "egg", "honey", "fungus"]);
function freezeList(values) {
    return Object.freeze([...values]);
}
function hasCoreCategory(categories, category) {
    if (category === "food") return FOOD_CATEGORIES.some(food => categories.has(food));
    return categories.has(category);
}
function visibleCategories(region) {
    const categories = new Set();
    for (const row of region?.resources || []) {
        if (!row.discovered || row.locallyExtinct) continue;
        const definition = BIOME_RESOURCE_BY_ID[row.id];
        if (definition) categories.add(definition.category);
    }
    return categories;
}
function importCoverageFor(region, category, year = Number(state.year) || 1) {
    return (region?.importCoverage || []).find(entry => entry.category === category && entry.untilYear >= year) || null;
}
function importDependencyFor(region) {
    const categories = visibleCategories(region);
    const year = Number(state.year) || 1;
    const missing = CORE_CATEGORIES.filter(category => !hasCoreCategory(categories, category)
        && !importCoverageFor(region, category, year)).length;
    return Math.round(missing / CORE_CATEGORIES.length * 100);
}
function caravanSourceRows(region, category) {
    const wanted = category === "food" ? FOOD_CATEGORIES : [category];
    return (region.resources || []).filter(row => {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        return row.discovered && !row.locallyExtinct && resource && wanted.includes(resource.category);
    });
}
// One bounded caravan pass per year. A region with a missing core category
// buys a real stock transfer from a surveyed neighbour; the donor stock falls,
// the buyer pays gold and receives temporary import coverage. Coverage expires
// next year, so the dependency remains a recurring economic relationship.
function runBiomeCaravans(atlas, year) {
    const routes = [];
    let budget = Math.max(0, Number(state.resources.gold) || 0);
    const discovered = atlas.regions.filter(region => region.discovered);
    for (const region of discovered) {
        region.importCoverage = Array.isArray(region.importCoverage) ? region.importCoverage : [];
        region.importCoverage = region.importCoverage.filter(entry => entry.untilYear >= year);
        const categories = visibleCategories(region);
        const needs = CORE_CATEGORIES.filter(category => !hasCoreCategory(categories, category)
            && !importCoverageFor(region, category, year)).slice(0, 2);
        for (const need of needs) {
            let best = null;
            for (const donor of discovered) {
                if (donor === region) continue;
                const rows = caravanSourceRows(donor, need).filter(row => row.stock > Math.max(4, row.capacity * 0.2));
                if (!rows.length) continue;
                const row = rows.sort((a, b) => b.stock - a.stock)[0];
                const amount = Math.min(8, Math.floor(row.stock * 0.12));
                if (amount < 1) continue;
                const resource = BIOME_RESOURCE_BY_ID[row.id];
                const price = Math.max(1, Math.round(amount * Math.max(0.8, resource.tradeValue * 0.7)));
                if (!best || price < best.price) best = { donor, row, amount, price, resource };
            }
            if (!best || best.price > budget) continue;
            budget -= best.price;
            addResource("gold", -best.price);
            best.row.stock = Math.max(0, best.row.stock - best.amount);
            region.importCoverage.push({ category: need, untilYear: year + 1 });
            region.caravanImports = Math.round((Number(region.caravanImports) || 0) + best.amount);
            const route = {
                year, from: best.donor.id, to: region.id, category: need,
                resource: best.resource.id, amount: best.amount, price: best.price
            };
            routes.push(route);
            addHistory(atlas, {
                regionId: region.id, kind: "caravan",
                text: best.amount + " " + best.resource.label + " arrived in " + region.name
                    + " from " + best.donor.name + " by caravan for " + best.price + " gold."
            });
        }
        region.productionCost = productionCostFor(region);
    }
    atlas.caravans = [...(atlas.caravans || []), ...routes].slice(-24);
    if (routes.length) {
        atlas.trade.imported = [...new Set([...(atlas.trade.imported || []), ...routes.map(route => route.category)])].slice(-12);
        atlas.trade.caravanSpend = Math.round((Number(atlas.trade.caravanSpend) || 0) + routes.reduce((sum, route) => sum + route.price, 0));
        atlas.trade.lastYear = year;
    }
    return { routes: routes.length, gold: routes.reduce((sum, route) => sum + route.price, 0) };
}
function supplyBonusFor(region) {
    const quality = Number(region?.quality) || 50;
    return Math.round(clamp((quality - 50) * 0.22 + (Number(region?.vegetation) || 0) * 12, -20, 30));
}
function productionCostFor(region) {
    const policy = policyFor(region);
    const importPenalty = 1 + importDependencyFor(region) / 100 * 0.22;
    const pressure = 1 + clamp(Number(region?.extractionPressure) || 0, 0, 1) * 0.08;
    const sanitation = 1 + clamp(Number(region?.diseasePressure) || 0, 0, 1) * 0.12;
    return clamp(Math.round(policy.cost * (1.08 - (Number(region?.quality) || 50) / 900)
        * importPenalty * pressure * sanitation * 100) / 100, 0.5, 3);
}
function focusCategories(region) {
    return new Set(focusFor(region).resourceCategories || []);
}
function focusMatchesCategories(region, categories) {
    const focus = focusCategories(region);
    return categories.some(category => focus.has(category));
}
function focusYieldFactor(region, resource) {
    return focusMatchesCategories(region, [resource?.category]) ? 1.5 : 0.7;
}
function focusCostFactor(region, categories) {
    return focusMatchesCategories(region, categories) ? 0.8 : 1.2;
}
function supplyYieldFactor(region) {
    return clamp(1 + supplyBonusFor(region) / 200, 0.8, 1.2);
}
function supplyCostFactor(region) {
    return clamp(1 - supplyBonusFor(region) / 250, 0.85, 1.15);
}
function actionGoldCost(region, categories, base = 2) {
    return Math.max(1, Math.round(base * productionCostFor(region)
        * focusCostFactor(region, categories) * supplyCostFactor(region)));
}
function speciesCategories(species) {
    return [...new Set((species?.products || []).map(id => BIOME_RESOURCE_BY_ID[id]?.category).filter(Boolean))];
}
function dietCategories(species) {
    const categories = new Set();
    for (const token of species?.diet || []) {
        for (const category of BIOME_DIET_CATEGORIES[token] || []) categories.add(category);
    }
    return [...categories];
}
function forageRows(region, species) {
    const categories = new Set(dietCategories(species));
    if (!categories.size) return [];
    return region.resources.filter(row => {
        const definition = BIOME_RESOURCE_BY_ID[row.id];
        return definition && !definition.fauna && categories.has(definition.category)
            && !row.locallyExtinct && row.stock > 0;
    });
}
function forageRatio(region, species) {
    const rows = forageRows(region, species);
    if (!rows.length) return clamp(Number(region?.vegetation) || 0.4, 0, 1);
    const capacity = rows.reduce((sum, row) => sum + Math.max(1, row.capacity), 0);
    return clamp(rows.reduce((sum, row) => sum + row.stock, 0) / capacity, 0, 1);
}
function seasonalStockFactor(resource, season = state.seasonIndex) {
    const index = clamp(Math.floor(Number(season) || 0), 0, 3);
    if (!resource?.renewable) return 1;
    if (resource.kind === "fish") return [0.86, 1.04, 1.1, 0.9][index];
    if (resource.kind === "wood") return [0.94, 1, 1.04, 0.96][index];
    if (["fruit", "fungus", "herb", "spice", "dye"].includes(resource.category)) {
        return [0.74, 0.98, 1.12, 0.9][index];
    }
    return [0.9, 1.04, 1.06, 0.9][index];
}
function effectiveStock(row, resource, season = state.seasonIndex) {
    return Math.max(0, row.stock * seasonalStockFactor(resource, season));
}
function diseasePenalty(region) {
    return clamp(1 - (Number(region?.diseasePressure) || 0) * 0.18, 0.82, 1);
}
function refugeProtection(row) {
    return clamp(1 - (Number(row?.refugeSites) || 0) * 0.1, 0.55, 1);
}
function regionNeighbors(index) {
    const column = index % GRID, row = Math.floor(index / GRID);
    const neighbors = [];
    if (column > 0) neighbors.push(index - 1);
    if (column < GRID - 1) neighbors.push(index + 1);
    if (row > 0) neighbors.push(index - GRID);
    if (row < GRID - 1) neighbors.push(index + GRID);
    return neighbors;
}
function habitatScore(region, species) {
    const water = species.role === "fish" ? region.water : region.vegetation;
    return region.quality / 100 * 0.3 + water * 0.3 + forageRatio(region, species) * 0.3
        + (region.protectedArea ? 0.08 : 0) + Math.min(3, region.fauna.filter(row => row.id === species.id).length) * 0.01;
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
    region.productionCost = productionCostFor(region);
    invalidateBiomeTileCache();
}

export function syncBiomeDiscovery({ silent = false } = {}) {
    const atlas = ensureBiomeAtlas();
    if (!atlas || !Array.isArray(state.explored)) return { discovered: 0, total: MAX_REGIONS };
    let discovered = 0;
    for (const region of atlas.regions) {
        if (region.discovered) {
            region.productionCost = productionCostFor(region);
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
            region.productionCost = productionCostFor(region);
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
    region.productionCost = productionCostFor(region);
    return { ok: true, message: region.name + " · " + policyFor(region).label.toUpperCase() };
}

export function setBiomeFocus(regionId, focusId) {
    const region = regionById(regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (!BIOME_FOCUS_IDS.includes(String(focusId))) return { ok: false, reason: "unknown-focus" };
    if (region.focus === focusId) return { ok: false, reason: "focus-already-set" };
    region.focus = String(focusId);
    region.productionCost = productionCostFor(region);
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
    const actionCost = actionGoldCost(region, [resource.category], 3);
    if ((Number(state.resources.gold) || 0) < actionCost) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -actionCost);
    const qualityFactor = 0.55 + row.quality / 130;
    // Degraded vegetation and a negative ecological trend reduce the usable
    // share of a harvest. This is the link from long-term damage to real yield.
    const habitatFactor = clamp(0.55 + region.vegetation * 0.38 + region.ecologyTrend * 0.2, 0.35, 1.1);
    const available = effectiveStock(row, resource);
    // Local tile samples are not just a map decoration: a harvest is planned
    // around the best sampled patch of the region. The bounded 5x5 sample is
    // only requested for this explicit action, never per frame or tick.
    const tile = cachedTileSamples(region, row, resource, atlas, false);
    const bestTileQuality = tile.samples.reduce((best, sample) => Math.max(best, sample.quality), row.quality);
    const tileYieldFactor = clamp(0.88 + bestTileQuality / 100 * 0.12 + (tile.suitability - 0.5) * 0.08, 0.9, 1.08);
    const amount = clamp(Math.round((5 + available * 0.035) * policy.yield * qualityFactor * habitatFactor
        * focusYieldFactor(region, resource) * supplyYieldFactor(region) * diseasePenalty(region)
        * tileYieldFactor), 1, 26);
    const taken = Math.min(amount, Math.ceil(available));
    row.stock = Math.max(0, row.stock - taken);
    row.lastHarvestYear = Number(state.year) || 1;
    region.extractionPressure = clamp(region.extractionPressure + policy.pressure * 0.08, 0, 1);
    region.vegetation = clamp(region.vegetation - (resource.kind === "wood" ? taken * 0.0017 : taken * 0.0004), 0, 1);
    if (resource.kind === "wood") {
        region.clearCut = clamp(region.clearCut + taken * 0.0018, 0, 1);
        region.erosion = clamp(region.erosion + region.clearCut * 0.006 * policy.pressure, 0, 1);
    }
    if (row.stock <= 0) {
        row.locallyExtinct = Boolean(resource.rare);
        addHistory(atlas, {
            regionId: region.id, kind: "depletion",
            text: resourceLabel(resource) + " in " + region.name + (row.locallyExtinct ? " has been locally wiped out." : " is exhausted for now.")
        });
    }
    atlas.stats.harvests += 1;
    invalidateBiomeTileCache();
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
        message: "HARVESTED " + taken + " " + resource.label.toUpperCase() + (ledger ? "" : " · STORED FOR TRADE") + " · " + actionCost + "G",
        amount: taken, ledger, stored, region: region.id, resource: resource.id, cost: actionCost,
        seasonalStock: Math.round(available), clearCut: Math.round(region.clearCut * 100) / 100,
        diseasePressure: Math.round(region.diseasePressure * 100) / 100,
        tileQuality: tile.quality, tileSuitability: tile.suitability,
        focusMatch: focusMatchesCategories(region, [resource.category]), supplyBonus: supplyBonusFor(region)
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
    if (region.protectedArea) return { ok: false, reason: "protected-area" };
    const categories = speciesCategories(species);
    const cost = actionGoldCost(region, categories, species.rare || species.fantastic ? 14 : 4);
    if ((Number(state.resources.gold) || 0) < cost) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -cost);
    const policy = policyFor(region);
    const focusYield = focusMatchesCategories(region, categories) ? 1.15 : 0.87;
    const protection = refugeProtection(row);
    const quota = species.rare || species.endangered ? 1
        : Math.max(1, Math.round(row.population * 0.07 * policy.yield * focusYield * protection));
    const taken = Math.min(row.population, quota);
    row.population = Math.max(0, row.population - taken);
    row.pressure = clamp(row.pressure + 0.18 * policy.pressure * protection, 0, 2);
    region.carcassLoad = clamp(region.carcassLoad + taken * 0.035, 0, 1);
    region.extractionPressure = clamp(region.extractionPressure + 0.045 * policy.pressure, 0, 1);
    atlas.stats.hunts += 1;
    const food = Math.max(1, Math.round(taken * (species.role === "predator" ? 5 : 3) * diseasePenalty(region)));
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
        amount: taken, food, stored: rareStored, region: region.id, species: species.id, cost,
        refugeSites: row.refugeSites, protection: Math.round(protection * 100) / 100,
        focusMatch: focusMatchesCategories(region, categories), supplyBonus: supplyBonusFor(region)
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
    region.diseasePressure = clamp(region.diseasePressure * 0.55, 0, 1);
    region.clearCut = clamp(region.clearCut * 0.55, 0, 1);
    region.erosion = clamp(region.erosion * 0.6, 0, 1);
    region.protectedArea = true;
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
    invalidateBiomeTileCache();
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
    const stockShare = clamp(effectiveStock(row, resource) / Math.max(1, row.capacity), 0, 1);
    const scarcity = 1 + (1 - stockShare) * 0.32;
    const surplus = 1 - Math.max(0, stockShare - 0.55) * 0.35;
    const focusPremium = focusMatchesCategories(region, [resource.category]) ? 1.1 : 0.95;
    const importMargin = 1 - importDependencyFor(region) / 100 * 0.22;
    const supplyPremium = 1 + supplyBonusFor(region) / 300;
    const unitPrice = resource.tradeValue * (0.7 + region.quality / 180)
        * scarcity * surplus * focusPremium * importMargin * supplyPremium;
    const value = Math.max(1, Math.round(stored * unitPrice));
    row.stored = 0;
    addResource("gold", value);
    if (resource.rare) atlas.stats.rareSold += stored;
    atlas.stats.goldFromTrade += value;
    atlas.trade.gold = (Number(atlas.trade.gold) || 0) + value;
    atlas.trade.lastYear = Number(state.year) || 1;
    if (!atlas.trade.exported.includes(resource.category)) atlas.trade.exported = [...atlas.trade.exported, resource.category].slice(-12);
    addHistory(atlas, { regionId: region.id, kind: "trade", text: stored + " " + resource.label + " from " + region.name + " sold for " + value + " gold." });
    return { ok: true,         message: "SOLD " + stored + " " + resource.label.toUpperCase() + " · +" + value + " GOLD",
        gold: value, amount: stored,
        market: { scarcity: Math.round(scarcity * 100) / 100, surplus: Math.round(surplus * 100) / 100,
            focusPremium: Math.round(focusPremium * 100) / 100, importMargin: Math.round(importMargin * 100) / 100,
            supplyPremium: Math.round(supplyPremium * 100) / 100, unitPrice: Math.round(unitPrice * 100) / 100 }
    };
}

function recipeAvailability(region, recipe) {
    const missing = [];
    const rows = new Map();
    for (const input of recipe.inputs) {
        const candidates = region.resources
            .filter(row => row.discovered && !row.locallyExtinct && row.stock >= input.amount
                && BIOME_RESOURCE_BY_ID[row.id]?.category === input.category)
            .sort((a, b) => (b.stock - a.stock) || String(a.id).localeCompare(String(b.id)));
        if (!candidates.length) missing.push(input.category);
        else rows.set(input.category, candidates[0]);
    }
    return { available: missing.length === 0, missing, rows };
}

function craftCostFor(region, recipe) {
    return actionGoldCost(region, [recipe.focusCategory], 4);
}

export function craftBiomeGoods(regionId, recipeId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    const recipe = BIOME_CRAFT_RECIPE_BY_ID[String(recipeId)];
    if (!atlas || !region || !recipe) return { ok: false, reason: "unknown-recipe" };
    if (!region.discovered) return { ok: false, reason: "region-not-explored" };
    if (!region.crafted || typeof region.crafted !== "object") region.crafted = {};
    if (!BIOME_PROFILES[region.rawBiome]?.crafts.includes(recipe.craft)) {
        return { ok: false, reason: "craft-not-local" };
    }
    if (policyFor(region).yield <= 0) return { ok: false, reason: "region-is-fallow" };
    const availability = recipeAvailability(region, recipe);
    if (!availability.available) {
        return { ok: false, reason: "missing-local-input", missing: availability.missing };
    }
    const cost = craftCostFor(region, recipe);
    if ((Number(state.resources.gold) || 0) < cost) return { ok: false, reason: "not-enough-gold", cost };
    addResource("gold", -cost);
    for (const input of recipe.inputs) {
        const row = availability.rows.get(input.category);
        row.stock = Math.max(0, row.stock - input.amount);
        row.lastHarvestYear = Number(state.year) || 1;
    }
    const outputId = recipe.outputId;
    const amount = 1;
    region.crafted[outputId] = Math.min(BIOME_RESOURCE_STORE_LIMIT, (Number(region.crafted[outputId]) || 0) + amount);
    region.extractionPressure = clamp(region.extractionPressure + 0.025 * policyFor(region).pressure, 0, 1);
    atlas.stats.crafts = (Number(atlas.stats.crafts) || 0) + 1;
    addHistory(atlas, {
        regionId: region.id, kind: "craft",
        text: region.name + " produced " + amount + " " + recipe.outputLabel + " for " + cost + " gold."
    });
    return {
        ok: true,
        message: "CRAFTED " + amount + " " + recipe.outputLabel.toUpperCase() + " · " + cost + "G",
        amount, cost, output: outputId, region: region.id, recipe: recipe.id,
        focusMatch: focusMatchesCategories(region, [recipe.focusCategory]),
        supplyBonus: supplyBonusFor(region), importDependency: importDependencyFor(region)
    };
}

export function sellBiomeCraft(regionId, recipeId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    const recipe = BIOME_CRAFT_RECIPE_BY_ID[String(recipeId)];
    if (!atlas || !region || !recipe) return { ok: false, reason: "unknown-recipe" };
    if (!region.crafted || typeof region.crafted !== "object") region.crafted = {};
    const stored = Math.floor(Number(region.crafted?.[recipe.outputId]) || 0);
    if (stored <= 0) return { ok: false, reason: "nothing-stored" };
    const focusPremium = focusMatchesCategories(region, [recipe.focusCategory]) ? 1.1 : 0.95;
    const importMargin = 1 - importDependencyFor(region) / 100 * 0.15;
    const supplyPremium = 1 + supplyBonusFor(region) / 400;
    const unitPrice = recipe.value * recipe.demand * (0.8 + region.quality / 250)
        * focusPremium * importMargin * supplyPremium;
    const value = Math.max(1, Math.round(stored * unitPrice));
    region.crafted[recipe.outputId] = 0;
    addResource("gold", value);
    atlas.stats.craftsSold = (Number(atlas.stats.craftsSold) || 0) + stored;
    atlas.stats.goldFromTrade += value;
    atlas.trade.gold = (Number(atlas.trade.gold) || 0) + value;
    atlas.trade.lastYear = Number(state.year) || 1;
    if (!atlas.trade.exported.includes("craft")) atlas.trade.exported = [...atlas.trade.exported, "craft"].slice(-12);
    addHistory(atlas, {
        regionId: region.id, kind: "trade",
        text: stored + " " + recipe.outputLabel + " from " + region.name + " sold for " + value + " gold."
    });
    return {
        ok: true,
        message: "SOLD " + stored + " " + recipe.outputLabel.toUpperCase() + " · +" + value + " GOLD",
        gold: value, amount: stored, output: recipe.outputId, recipe: recipe.id,
        market: { unitPrice: Math.round(unitPrice * 100) / 100, focusPremium, importMargin, supplyPremium }
    };
}

// Active reintroduction: a depleted species can be brought back only from a
// real surviving population in another surveyed region. It costs gold, adds a
// concrete released cohort and immediately changes the local food web.
export function reintroduceBiomeSpecies(regionId, speciesId) {
    const atlas = ensureBiomeAtlas();
    const region = regionById(regionId);
    if (!atlas || !region) return { ok: false, reason: "unknown-region" };
    if (!region.discovered) return { ok: false, reason: "region-not-explored" };
    const species = BIOME_WILDLIFE_BY_ID[speciesId];
    if (!species || !species.biomes.includes(region.rawBiome)) return { ok: false, reason: "unsuitable-habitat" };
    const current = region.fauna.find(row => row.id === species.id);
    if (current?.population > 0) return { ok: false, reason: "already-present" };
    const source = atlas.regions.find(other => other !== region
        && other.fauna.some(row => row.id === species.id && row.population > Math.max(3, row.capacity * 0.12)));
    if (!source) return { ok: false, reason: "no-source-population" };
    const cost = 20;
    if ((Number(state.resources.gold) || 0) < cost) return { ok: false, reason: "not-enough-gold", cost };
    addResource("gold", -cost);
    let row = current;
    if (!row) {
        const sourceRow = source.fauna.find(entry => entry.id === species.id);
        const capacity = Math.max(4, Math.round(sourceRow.capacity * (0.55 + region.quality / 240)));
        row = {
            id: species.id, population: 0, baseCapacity: capacity, capacity,
            health: 55, breeding: species.breeding.includes(Number(state.seasonIndex) || 0),
            migrating: false, pressure: 0, refugeSites: 0, refuges: [], discovered: true
        };
        row.refuges = refugeSitesFor(species, region, region.index, atlas.seed);
        row.refugeSites = row.refuges.length;
        region.fauna.push(row);
        region.fauna = region.fauna.slice(0, 12);
    }
    row.population = Math.max(2, Math.round(row.capacity * 0.12));
    row.health = Math.max(50, Math.round(row.health));
    row.discovered = true;
    region.fauna = region.fauna.slice(0, 12);
    addHistory(atlas, {
        regionId: region.id, kind: "reintroduction",
        text: species.label + " was reintroduced to " + region.name + " from " + source.name + "."
    });
    return { ok: true, species: species.id, population: row.population, cost };
}

export function setBiomeProtection(regionId, protectedArea = true) {
    const region = regionById(regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (!region.discovered) return { ok: false, reason: "region-not-explored" };
    region.protectedArea = Boolean(protectedArea);
    addHistory(ensureBiomeAtlas(), {
        regionId: region.id, kind: "protection",
        text: region.name + (region.protectedArea ? " was declared a protected habitat." : " lost its protected-habitat status.")
    });
    return { ok: true, protectedArea: region.protectedArea,
        message: (region.protectedArea ? "PROTECTED HABITAT · " : "PROTECTION LIFTED · ") + region.name };
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
    const visible = region.resources.filter(row => row.discovered && !row.locallyExtinct && BIOME_RESOURCE_BY_ID[row.id]);
    const exports = visible.filter(row => {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        return resource.tradeValue >= 3 || resource.rare || resource.strategic;
    }).map(row => BIOME_RESOURCE_BY_ID[row.id].label);
    const categories = new Set(visible.map(row => BIOME_RESOURCE_BY_ID[row.id].category));
    const imports = CORE_CATEGORIES.filter(category => !hasCoreCategory(categories, category));
    const supplyBonus = supplyBonusFor(region);
    return {
        exports,
        imports,
        productionCost: productionCostFor(region),
        supplyBonus,
        importDependency: importDependencyFor(region),
        importCoverage: (region.importCoverage || []).map(entry => entry.category),
        caravanImports: Math.round(Number(region.caravanImports) || 0),
        diseasePressure: Math.round((Number(region.diseasePressure) || 0) * 100),
        protectedArea: Boolean(region.protectedArea),
        clearCut: Math.round((Number(region.clearCut) || 0) * 100),
        erosion: Math.round((Number(region.erosion) || 0) * 100),
        focusMatchCount: visible.filter(row => focusMatchesCategories(region, [BIOME_RESOURCE_BY_ID[row.id].category])).length,
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
        stock: Math.round(effectiveStock(row, resource)),
        baseStock: Math.round(row.stock),
        seasonalStock: Math.round((seasonalStockFactor(resource) - 1) * 100),
        capacity: Math.round(row.capacity),
        deposits: (row.deposits || []).map(site => ({ x: site.x, y: site.y, weight: site.weight })),
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
        description: resource.description,
        actionCost: actionGoldCost(region, [resource.category], 3),
        focusMatch: focusMatchesCategories(region, [resource.category])
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
        refuges: (row.refuges || []).map(site => ({ x: site.x, y: site.y, kind: site.kind })),
        diet: dietCategories(species),
        forage: Math.round(forageRatio(region, species) * 100) / 100,
        discovered: Boolean(row.discovered),
        rare: Boolean(species.rare),
        fantastic: Boolean(species.fantastic),
        endangered: Boolean(species.endangered || (species.rare && row.population < row.capacity * 0.32)),
        products: [...species.products],
        refuge: species.refuge,
        description: species.description,
        actionCost: actionGoldCost(region, speciesCategories(species), species.rare || species.fantastic ? 14 : 4),
        focusMatch: focusMatchesCategories(region, speciesCategories(species))
    };
}

function snapshotRecipes(region) {
    const profile = BIOME_PROFILES[region.rawBiome] || BIOME_PROFILES.meadow;
    return profile.crafts.map(craft => {
        const recipe = BIOME_CRAFT_RECIPE_BY_CRAFT[craft];
        if (!recipe) return null;
        const availability = recipeAvailability(region, recipe);
        return {
            id: recipe.id,
            craft,
            label: recipe.outputLabel,
            description: recipe.description,
            inputs: recipe.inputs.map(input => ({
                category: input.category, amount: input.amount,
                label: BIOME_RESOURCE_CATEGORIES[input.category] || input.category
            })),
            missing: availability.missing,
            available: availability.available,
            cost: craftCostFor(region, recipe),
            stored: Math.round(Number(region.crafted?.[recipe.outputId]) || 0),
            value: recipe.value,
            demand: recipe.demand,
            focusCategory: recipe.focusCategory,
            focusMatch: focusMatchesCategories(region, [recipe.focusCategory])
        };
    }).filter(Boolean);
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
        clearCut: Math.round(region.clearCut * 100),
        erosion: Math.round(region.erosion * 100),
        protectedArea: Boolean(region.protectedArea),
        engineered: Boolean(region.engineered),
        importCoverage: (region.importCoverage || []).map(entry => ({ category: entry.category, untilYear: entry.untilYear })),
        caravanImports: Math.round(Number(region.caravanImports) || 0),
        ecologyTrend: Math.round(region.ecologyTrend * 1000) / 10,
        productionLabel: profile.productionLabel,
        crafts: [...profile.crafts],
        recipes: snapshotRecipes(region),
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
        for (const row of region.resources) if (row.discovered && !row.locallyExtinct) categories.add(row.category);
    }
    const imports = CORE_CATEGORIES.filter(category => !hasCoreCategory(categories, category));
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
        migration: [...(atlas.migration || [])].slice(-8),
        caravans: [...(atlas.caravans || [])].slice(-8),
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
        specialisedRegions: regions.filter(region => region.focus !== defaultFocusForBiome(region.biome)).length
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
        const markers = [];
        for (const row of region.resources) {
            if (!row.discovered || row.locallyExtinct) continue;
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            if (!resource) continue;
            for (const site of (row.deposits || []).slice(0, 3)) {
                markers.push({ x: site.x, y: site.y, category: resource.category, rare: Boolean(resource.rare) });
            }
        }
        const refuges = [];
        for (const row of region.fauna) {
            if (!row.discovered || row.population <= 0) continue;
            for (const site of (row.refuges || []).slice(0, 3)) {
                refuges.push({ x: site.x, y: site.y, kind: site.kind, endangered: Boolean(BIOME_WILDLIFE_BY_ID[row.id]?.rare && row.population < row.capacity * 0.32) });
            }
        }
        return {
            id: region.id, x: region.x, y: region.y, width: region.width, height: region.height,
            color: profile.color, label: profile.short, rare, quality: region.quality,
            health: ecologyHealth(region), rareCount: rare.length, markers, refuges,
            protectedArea: Boolean(region.protectedArea)
        };
    });
}

// Seasonal change is a bounded pass over the 36-region atlas: stocks move
// toward a season-specific carrying level and a small share of migratory
// wildlife crosses into a better neighbouring region. Routes are recorded so
// the movement is visible in the atlas history instead of a hidden status bit.
export function updateBiomeAtlasSeason() {
    const atlas = ensureBiomeAtlas();
    if (!atlas) return { updated: false, reason: "atlas-missing" };
    const season = clamp(Math.floor(Number(state.seasonIndex) || 0), 0, 3);
    const key = (Number(state.year) || 1) * 4 + season;
    if (atlas.lastSeasonKey === key) return { updated: false, reason: "already-settled", season };
    atlas.lastSeasonKey = key;
    atlas.lastSeason = season;
    let moved = 0;
    const routes = [];
    for (const region of atlas.regions) {
        if (!region.discovered) continue;
        for (const row of region.resources) {
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            if (!resource?.renewable || row.locallyExtinct) continue;
            const target = row.capacity * clamp(seasonalStockFactor(resource, season), 0.55, 1.1);
            row.stock = clamp(row.stock + (target - row.stock) * 0.04, 0, row.capacity);
        }
        for (const row of region.fauna) {
            const species = BIOME_WILDLIFE_BY_ID[row.id];
            if (!species?.migratory || row.population < 3) continue;
            if (species.breeding.includes(season)) {
                // The breeding season reverses the most recent inbound route:
                // a share of the visiting herd returns to its home region.
                const previous = [...(atlas.migration || [])].reverse().find(route =>
                    route.species === species.id && route.to === region.id && route.season !== season);
                if (!previous) continue;
                const home = atlas.regions.find(entry => entry.id === previous.from);
                const homeRow = home?.fauna.find(entry => entry.id === species.id);
                if (!home || !home.discovered || !homeRow) continue;
                const amount = Math.min(row.population, Math.max(1,
                    Math.min(previous.amount, Math.round(row.population * 0.06))));
                row.population = Math.max(0, row.population - amount);
                homeRow.population = Math.min(homeRow.capacity * 1.25, homeRow.population + amount);
                row.migrating = false;
                homeRow.migrating = false;
                moved += amount;
                routes.push({
                    year: Number(state.year) || 1, season, species: species.id,
                    from: region.id, to: home.id, amount, returning: true
                });
                addHistory(atlas, {
                    regionId: region.id, kind: "migration",
                    text: species.label + " returned from " + region.name + " to " + home.name + " (" + amount + ")."
                });
                continue;
            }
            const sourceScore = habitatScore(region, species);
            let best = null;
            for (const neighborIndex of regionNeighbors(region.index)) {
                const targetRegion = atlas.regions[neighborIndex];
                const targetRow = targetRegion?.fauna.find(entry => entry.id === species.id);
                if (!targetRow || targetRow.population <= 0) continue;
                const score = habitatScore(targetRegion, species);
                if (score > sourceScore + 0.02 && (!best || score > best.score)) best = { region: targetRegion, row: targetRow, score };
            }
            if (!best) continue;
            const amount = Math.max(1, Math.round(row.population * 0.06));
            row.population = Math.max(0, row.population - amount);
            best.row.population = Math.min(best.row.capacity * 1.25, best.row.population + amount);
            row.migrating = true;
            best.row.migrating = false;
            moved += amount;
            routes.push({
                year: Number(state.year) || 1, season, species: species.id,
                from: region.id, to: best.region.id, amount
            });
            addHistory(atlas, {
                regionId: region.id, kind: "migration",
                text: species.label + " moved from " + region.name + " to " + best.region.name + " (" + amount + ")."
            });
        }
    }
    atlas.migration = [...(atlas.migration || []), ...routes].slice(-24);
    invalidateBiomeTileCache();
    return { updated: true, season, moved, routes: routes.length };
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
            - grazerPressure * 0.0042 - pestPressure * 0.0055 - region.extractionPressure * 0.022
            - region.erosion * 0.018;
        region.vegetation = clamp(region.vegetation + vegetationDelta, 0.005, 1);
        region.soilHealth = clamp(region.soilHealth
            + 0.012 * (1 + soilService) * (0.4 + region.vegetation)
            - region.extractionPressure * 0.018 - region.erosion * 0.022 + engineerService * 0.008, 0.02, 1);
        region.water = clamp(region.water + engineerService * 0.016 - region.extractionPressure * 0.006, 0.02, 1);
        region.diseasePressure = clamp(region.diseasePressure + region.carcassLoad * 0.06
            - scavengerService * (region.protectedArea ? 0.1 : 0.08) + region.clearCut * 0.006, 0, 1);
        region.carcassLoad = clamp(region.carcassLoad * 0.45, 0, 1);
        region.clearCut = clamp(region.clearCut - 0.004 - (region.protectedArea ? 0.004 : 0) - region.vegetation * 0.002, 0, 1);
        region.erosion = clamp(region.erosion + region.clearCut * 0.008 - region.vegetation * 0.004
            - (region.protectedArea ? 0.003 : 0), 0, 1);
        region.engineered = Boolean(engineerService > 0.18);
        for (const row of region.resources) {
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            if (!resource) continue;
            const seasonal = seasonFactor(resource, season);
            if (resource.kind === "wood") {
                const base = Math.max(12, Number(row.baseCapacity) || row.capacity);
                row.capacity = Math.max(12, Math.round(base * (1 - region.clearCut * 0.35)));
            }
            if (resource.renewable) {
                const ecosystem = 0.4 + region.vegetation * 0.45 + region.soilHealth * 0.25 + pollinatorService * 0.16;
                const regen = resource.regen * (resource.kind === "fish" ? region.water : ecosystem) * policy.regen
                    * (resource.rare ? 0.35 : 1) * focusYieldFactor(region, resource);
                if (!row.locallyExtinct) row.stock = Math.min(row.capacity, row.stock + row.capacity * regen);
            }
        }
        // Herbivores eat named local plant stocks, not an abstract vegetation
        // number. Demand is distributed by available stock and bounded so a
        // large herd cannot clear an entire region in one annual tick.
        const browseDemand = new Map();
        for (const grazer of herbivores) {
            const species = BIOME_WILDLIFE_BY_ID[grazer.id];
            if (!species) continue;
            const rows = forageRows(region, species);
            const mass = rows.reduce((sum, row) => sum + row.stock, 0);
            if (mass <= 0) continue;
            const demand = Math.min(region.vegetation * 8, grazer.population * 0.012 * policy.pressure);
            for (const row of rows) browseDemand.set(row, (browseDemand.get(row) || 0) + demand * row.stock / mass);
        }
        for (const [row, demand] of browseDemand) row.stock = Math.max(0, row.stock - demand);
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
                const forage = forageRatio(region, species);
                capacity = Math.round(capacity * (0.28 + region.vegetation * 0.5 + forage * 0.32)
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
            const forage = forageRatio(region, species);
            const recruitment = row.capacity * species.reproduction * (breeding ? 1.25 : 0.35)
                * (1 - density) * migration * (1 + region.vegetation * 0.24)
                * (0.62 + forage * 0.46) * (1 - region.diseasePressure * 0.28);
            const huntingLoss = row.population * row.pressure * 0.32;
            const habitatLoss = density > 1 ? (density - 1) * row.capacity * 0.35 : 0;
            const diseaseLoss = row.population * region.diseasePressure * 0.045;
            row.population = clamp(row.population + recruitment - huntingLoss - habitatLoss - diseaseLoss, 0, row.capacity * 1.25);
            row.health = clamp(row.health + (region.vegetation - 0.5) * 3 - row.pressure * 2
                - region.diseasePressure * 4 + (row.refugeSites ? 0.3 : 0), 5, 100);
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
        region.productionCost = productionCostFor(region);
    }
    const caravans = runBiomeCaravans(atlas, year);
    stats.caravans = caravans.routes;
    stats.caravanGold = caravans.gold;
    regionEcologyHistory(atlas, stats, year);
    invalidateBiomeTileCache();
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
        baseCapacity: Math.round(row.baseCapacity || row.capacity),
        capacity: Math.round(row.capacity),
        quality: Math.round(row.quality),
        stored: Math.round(row.stored),
        deposits: Array.isArray(row.deposits) ? row.deposits.map(site => ({ x: site.x, y: site.y, weight: site.weight })) : [],
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
        refuges: Array.isArray(row.refuges) ? row.refuges.map(site => ({ x: site.x, y: site.y, kind: site.kind })) : [],
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
        lastSeasonKey: atlas.lastSeasonKey,
        migration: (atlas.migration || []).slice(-24).map(route => ({ ...route })),
        caravans: (atlas.caravans || []).slice(-24).map(route => ({ ...route })),
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
            protectedArea: Boolean(region.protectedArea),
            clearCut: Math.round(region.clearCut * 1000) / 1000,
            erosion: Math.round(region.erosion * 1000) / 1000,
            engineered: Boolean(region.engineered),
            importCoverage: (region.importCoverage || []).map(entry => ({ category: entry.category, untilYear: entry.untilYear })),
            caravanImports: Math.round(Number(region.caravanImports) || 0),
            ecologyTrend: Math.round(region.ecologyTrend * 1000) / 1000,
            extractionPressure: Math.round(region.extractionPressure * 1000) / 1000,
            productionCost: Math.round(region.productionCost * 100) / 100,
            crafted: { ...(region.crafted || {}) },
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
    if (snapshot.migration !== undefined && (!Array.isArray(snapshot.migration) || snapshot.migration.length > 24)) {
        throw new Error("Save data contains an invalid biome migration ledger.");
    }
    if (snapshot.caravans !== undefined && (!Array.isArray(snapshot.caravans) || snapshot.caravans.length > 24)) {
        throw new Error("Save data contains an invalid biome caravan ledger.");
    }
    if (snapshot.lastSeasonKey !== undefined && (!Number.isFinite(Number(snapshot.lastSeasonKey)) || Number(snapshot.lastSeasonKey) < 0)) {
        throw new Error("Save data contains an invalid biome season key.");
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
        if (region.protectedArea !== undefined && typeof region.protectedArea !== "boolean") throw new Error("Save data contains an invalid protected-area flag.");
        for (const field of ["clearCut", "erosion"]) {
            if (region[field] !== undefined && (!Number.isFinite(Number(region[field])) || Number(region[field]) < 0 || Number(region[field]) > 1)) {
                throw new Error("Save data contains an invalid biome landscape field.");
            }
        }
        if (region.crafted !== undefined) {
            if (!region.crafted || typeof region.crafted !== "object" || Array.isArray(region.crafted)) {
                throw new Error("Save data contains an invalid biome crafted-goods store.");
            }
            for (const [id, amount] of Object.entries(region.crafted)) {
                if (!BIOME_CRAFT_GOOD_BY_ID[id] || !Number.isFinite(Number(amount))
                    || Number(amount) < 0 || Number(amount) > BIOME_RESOURCE_STORE_LIMIT) {
                    throw new Error("Save data contains an invalid biome crafted-good row.");
                }
            }
        }
        for (const row of region.resources) {
            if (!row || typeof row !== "object" || !BIOME_RESOURCE_BY_ID[row.id]
                || !Number.isFinite(Number(row.stock)) || Number(row.stock) < 0 || Number(row.stock) > 1000000
                || !Number.isFinite(Number(row.capacity)) || Number(row.capacity) < 0 || Number(row.capacity) > 1000000
                || !Number.isFinite(Number(row.quality)) || Number(row.quality) < 0 || Number(row.quality) > 100
                || !Number.isFinite(Number(row.stored)) || Number(row.stored) < 0 || Number(row.stored) > BIOME_RESOURCE_STORE_LIMIT) {
                throw new Error("Save data contains an invalid biome resource row.");
            }
            if (row.baseCapacity !== undefined && (!Number.isFinite(Number(row.baseCapacity))
                || Number(row.baseCapacity) < 1 || Number(row.baseCapacity) > 1000000)) {
                throw new Error("Save data contains an invalid biome resource capacity.");
            }
            if (row.deposits !== undefined && (!Array.isArray(row.deposits) || row.deposits.length > 4
                || row.deposits.some(site => !site || !Number.isFinite(Number(site.x)) || !Number.isFinite(Number(site.y))
                    || Number(site.x) < 0 || Number(site.y) < 0 || Number(site.weight) < 0 || Number(site.weight) > 1))) {
                throw new Error("Save data contains an invalid biome deposit map.");
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
            if (row.refuges !== undefined && (!Array.isArray(row.refuges) || row.refuges.length > 4
                || row.refuges.some(site => !site || !Number.isFinite(Number(site.x)) || !Number.isFinite(Number(site.y))
                    || site.x < 0 || site.y < 0))) {
                throw new Error("Save data contains an invalid wildlife refuge map.");
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
        region.protectedArea = Boolean(saved.protectedArea);
        region.clearCut = clamp(finite(saved.clearCut, 0), 0, 1);
        region.erosion = clamp(finite(saved.erosion, 0), 0, 1);
        region.engineered = Boolean(saved.engineered);
        region.importCoverage = Array.isArray(saved.importCoverage)
            ? saved.importCoverage.slice(0, 8).map(entry => ({
                category: text(entry?.category, "", 24), untilYear: boundedInt(entry?.untilYear, 0, 1000000)
            })).filter(entry => entry.category)
            : [];
        region.caravanImports = boundedInt(saved.caravanImports, 0, 100000000);
        region.ecologyTrend = clamp(finite(saved.ecologyTrend, 0), -1, 1);
        region.extractionPressure = clamp(finite(saved.extractionPressure, 0), 0, 1);
        region.productionCost = clamp(finite(saved.productionCost, 1), 0.5, 3);
        region.crafted = {};
        if (saved.crafted && typeof saved.crafted === "object" && !Array.isArray(saved.crafted)) {
            for (const [id, amount] of Object.entries(saved.crafted)) {
                if (!BIOME_CRAFT_GOOD_BY_ID[id]) continue;
                region.crafted[id] = Math.min(BIOME_RESOURCE_STORE_LIMIT, Math.round(nonNegative(amount)));
            }
        }
        const resourceMap = new Map((saved.resources || []).map(row => [String(row.id), row]));
        for (const row of region.resources) {
            const savedRow = resourceMap.get(row.id);
            if (!savedRow) continue;
            row.stock = clamp(nonNegative(savedRow.stock), 0, Math.max(row.capacity, 1000000));
            row.capacity = Math.max(1, Math.round(clamp(nonNegative(savedRow.capacity), 1, 1000000)));
            row.baseCapacity = Math.max(1, Math.round(clamp(nonNegative(savedRow.baseCapacity || row.capacity), 1, 1000000)));
            row.quality = Math.round(clamp(nonNegative(savedRow.quality), 0, 100));
            row.stored = Math.min(BIOME_RESOURCE_STORE_LIMIT, Math.round(nonNegative(savedRow.stored)));
            if (Array.isArray(savedRow.deposits) && savedRow.deposits.length) {
                row.deposits = savedRow.deposits.slice(0, 4).map(site => ({
                    x: Math.round(clamp(nonNegative(site.x), 0, 1000000)),
                    y: Math.round(clamp(nonNegative(site.y), 0, 1000000)),
                    weight: Math.round(clamp(nonNegative(site.weight), 0, 1) * 100) / 100
                }));
            }
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
            if (Array.isArray(savedRow.refuges) && savedRow.refuges.length) {
                row.refuges = savedRow.refuges.slice(0, 4).map(site => ({
                    x: Math.round(clamp(nonNegative(site.x), 0, 1000000)),
                    y: Math.round(clamp(nonNegative(site.y), 0, 1000000)),
                    kind: text(site.kind, "refuge", 16)
                }));
            } else {
                const species = BIOME_WILDLIFE_BY_ID[row.id];
                row.refuges = species ? refugeSitesFor(species, region, region.index, atlas.seed) : [];
            }
            row.refugeSites = row.refuges.length;
            row.discovered = Boolean(savedRow.discovered);
        }
    }
    atlas.lastYear = Math.round(clamp(nonNegative(snapshot.lastYear), 1, 1000000));
    atlas.lastSeason = boundedInt(snapshot.lastSeason, 0, 3);
    atlas.lastSeasonKey = boundedInt(snapshot.lastSeasonKey, 0, 100000000);
    atlas.migration = Array.isArray(snapshot.migration)
        ? snapshot.migration.slice(-24).map(route => ({
            year: boundedInt(route?.year, 1, 1000000), season: boundedInt(route?.season, 0, 3),
            species: text(route?.species, "", 40), from: text(route?.from, "", 16),
            to: text(route?.to, "", 16), amount: boundedInt(route?.amount, 0, 100000),
            ...(route?.returning ? { returning: true } : {})
        }))
        : [];
    atlas.caravans = Array.isArray(snapshot.caravans)
        ? snapshot.caravans.slice(-24).map(route => ({
            year: boundedInt(route?.year, 1, 1000000), from: text(route?.from, "", 16),
            to: text(route?.to, "", 16), category: text(route?.category, "", 24),
            resource: text(route?.resource, "", 40), amount: boundedInt(route?.amount, 0, 100000),
            price: boundedInt(route?.price, 0, 100000000)
        }))
        : [];
    if (snapshot.stats && typeof snapshot.stats === "object") {
        atlas.stats = {
            harvests: boundedInt(snapshot.stats.harvests, 0, 1000000),
            hunts: boundedInt(snapshot.stats.hunts, 0, 1000000),
            surveys: boundedInt(snapshot.stats.surveys, 0, 1000000),
            crafts: boundedInt(snapshot.stats.crafts, 0, 1000000),
            craftsSold: boundedInt(snapshot.stats.craftsSold, 0, 100000000),
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
            exported: Array.isArray(snapshot.trade.exported) ? snapshot.trade.exported.slice(0, 12).map(value => text(value, "", 32)) : [],
            caravanSpend: boundedInt(snapshot.trade.caravanSpend, 0, 100000000)
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
    invalidateBiomeTileCache();
    return normalizeBiomeAtlasState(snapshot);
}

export function resetBiomeAtlas() {
    state.biomeAtlas = null;
    invalidateBiomeTileCache();
}

// Exposed for deterministic tests and diagnostics.
export const __internals = { hash32, unit, stringHash, regionBounds, seasonFactor, ecologyHealth };
