// Persistent, deterministic 1.2.21 cross-biome ecology.
//
// The 6×6 atlas from 1.2.19 already owns the region graph and the annual
// ecological pass. This module adds one compact system record per region:
// climate-derived soil and water state, land-use pressure, a stable local
// variant and slow recovery/legacy fields. It is read by the existing atlas
// snapshot and panel, and advanced once per realm year from the existing
// biomeAtlas annual step. There is no per-frame loop and no second world model.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import {
    BIOME_CLIMATE_ENVELOPES, BIOME_CLIMATE_ZONES, BIOME_SEASONS,
    BIOME_SEASONAL_APPEARANCE, BIOME_SEASONAL_TINTS, BIOME_SOIL_TYPES, BIOME_SYSTEM_REQUIREMENTS,
    BIOME_VARIANTS, CROSS_BIOME_VERSION, climateEnvelopeFor, climateZoneFor,
    seasonalAppearanceFor
} from "../world/cross-biome-data.js";
import {
    BIOME_PROFILES, BIOME_RESOURCE_BY_ID, BIOME_WILDLIFE_BY_ID
} from "../world/biome-resource-data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pct = value => Math.round(clamp(finite(value), 0, 1) * 100);
const round = (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round(finite(value) * factor) / factor;
};

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}
const unit = (seed, x, y, salt = 0) => hash32(seed, x, y, salt) / 4294967296;

function profileFor(region) {
    return BIOME_PROFILES[region?.rawBiome] || BIOME_PROFILES.meadow;
}

function seasonIndex(season = state.seasonIndex) {
    return clamp(Math.floor(finite(season)), 0, 3);
}

function seasonRecord(season) {
    return BIOME_SEASONS[seasonIndex(season)];
}

function rangeFit(value, range) {
    if (!Array.isArray(range) || range.length < 2) return 0.5;
    const low = range[0], high = range[1], span = Math.max(1, high - low);
    if (value >= low && value <= high) return 1;
    return clamp(1 - Math.abs(value < low ? low - value : value - high) / span, 0, 1);
}

function terrainSlopeAt(region) {
    const heights = state.heightMap;
    if (!heights) return 0;
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const pixW = Math.max(1, Number(state.terrainPixW) || 1);
    const pixH = Math.max(1, Number(state.terrainPixH) || 1);
    const px = clamp(Math.round(finite(region.centerX) * resolution), 1, pixW - 2);
    const py = clamp(Math.round(finite(region.centerY) * resolution), 1, pixH - 2);
    let low = Infinity, high = -Infinity;
    for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
            const value = finite(heights[(py + oy) * pixW + px + ox], 0.5);
            if (value < low) low = value;
            if (value > high) high = value;
        }
    }
    return clamp((high - low) / 0.28, 0, 1);
}

function measureHydrology(region) {
    const width = Math.max(1, Number(state.worldW) || 1);
    const sea = finite(state.seaLevel, 0.33);
    const x0 = finite(region.x), y0 = finite(region.y);
    const x1 = x0 + Math.max(1, finite(region.width)), y1 = y0 + Math.max(1, finite(region.height));
    const riverTiles = new Set();
    for (const path of state.rivers || []) {
        for (const index of path || []) {
            const x = index % width;
            const y = Math.floor(index / width);
            if (x >= x0 && x < x1 && y >= y0 && y < y1) riverTiles.add(index);
        }
    }
    let wetSamples = 0;
    let samples = 0;
    const heights = state.heightMap;
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const pixW = Math.max(1, Number(state.terrainPixW) || 1);
    const pixH = Math.max(1, Number(state.terrainPixH) || 1);
    if (heights) {
        for (let row = 0; row < 5; row++) {
            for (let column = 0; column < 5; column++) {
                const wx = x0 + Math.min(region.width - 1, Math.floor((column + 0.5) * region.width / 5));
                const wy = y0 + Math.min(region.height - 1, Math.floor((row + 0.5) * region.height / 5));
                const px = clamp(Math.floor(wx * resolution), 0, pixW - 1);
                const py = clamp(Math.floor(wy * resolution), 0, pixH - 1);
                if (finite(heights[py * pixW + px], 1) <= sea + 0.005) wetSamples++;
                samples++;
            }
        }
    }
    return {
        riverTiles: riverTiles.size,
        lakeShare: samples ? Math.round(wetSamples / samples * 100) : 0
    };
}

function chooseVariant(region, system, climate) {
    const variants = BIOME_VARIANTS[region.rawBiome] || BIOME_VARIANTS.meadow;
    const tags = [];
    const envelope = climateEnvelopeFor(region.rawBiome);
    if (climate.precip > envelope.precip[1] * 0.92) tags.push("wet");
    if (climate.precip < envelope.precip[0] + (envelope.precip[1] - envelope.precip[0]) * 0.18) tags.push("dry");
    if (climate.elevationM > 1300) tags.push("high");
    if (climate.elevationM < 350) tags.push("low");
    if (climate.tempC < 1) tags.push("cold");
    if (climate.tempC > 24) tags.push("warm");
    if (system.salinity > 0.32) tags.push("saline");
    if (region.clearCut > 0.22) tags.push("disturbed");
    if (region.protectedArea) tags.push("ancient");
    if (region.vegetation > 0.74) tags.push("ancient");
    if (region.vegetation < 0.3) tags.push("young");
    if (climate.wind > 0.58) tags.push("windy");
    const matched = variants.find(candidate => tags.includes(candidate.tag));
    return matched || variants[hash32(region.index, 0x56415249, 0, region.index) % variants.length];
}

function soilFor(region, climate, seed) {
    const envelope = climateEnvelopeFor(region.rawBiome);
    const candidates = envelope.soils.filter(id => BIOME_SOIL_TYPES[id]);
    if (!candidates.length) return BIOME_SOIL_TYPES.loam;
    // Saline and permafrost regimes override a random parent material: the
    // visible soil type must agree with the climate rather than be flavour.
    if (region.rawBiome === "desert" || climate.salinityRisk > 0.55) {
        const saline = candidates.find(id => id === "saline");
        if (saline) return BIOME_SOIL_TYPES[saline];
    }
    if (region.rawBiome === "snow" || region.rawBiome === "tundra") {
        const frozen = candidates.find(id => id === "permafrost");
        if (frozen) return BIOME_SOIL_TYPES[frozen];
    }
    return BIOME_SOIL_TYPES[candidates[hash32(seed, region.index, 0x534f494c) % candidates.length]];
}

function initialClimate(region, seed, season) {
    const profile = profileFor(region);
    const sample = region.sample || { height: 0.5, moisture: 0.5, temperature: 0.55 };
    const envelope = climateEnvelopeFor(region.rawBiome);
    const currentSeason = seasonRecord(season);
    const jitter = unit(seed, region.index, 0, 0x434c494d) - 0.5;
    const elevationM = Math.round(clamp((finite(sample.height, 0.5) - 0.32) / 0.62 * 3800, 0, 4200));
    const tempC = clamp(-20 + finite(sample.temperature, 0.55) * 62 - elevationM * 0.0062
        + jitter * 3 + (seasonIndex(season) === 1 ? 3 : seasonIndex(season) === 3 ? -3 : 0), -45, 48);
    const orographic = 1 + Math.max(0, finite(sample.height, 0.5) - 0.42) * 0.9;
    const precip = Math.round(clamp((45 + Math.pow(clamp(finite(sample.moisture, 0.5), 0, 1), 1.3) * 3100)
        * orographic * (0.8 + unit(seed, region.index, 0x5241494e) * 0.4)
        * (currentSeason.waterFactor * 0.7 + 0.3), 0, 5200));
    const humidity = clamp(finite(sample.moisture, 0.5) * 0.65 + profile.water * 0.25
        + 0.04 + jitter * 0.08, 0.02, 1);
    const sun = clamp(currentSeason.sun + (finite(sample.temperature, 0.55) - 0.5) * 0.22
        + (1 - humidity) * 0.16 - elevationM / 14000 + jitter * 0.05, 0.04, 1);
    const weatherWind = /storm|gale|wind/i.test(String(state.weather || "")) ? 0.14 : 0;
    const wind = clamp(0.16 + finite(sample.height, 0.5) * 0.5 + (1 - profile.vegetation) * 0.16
        + jitter * 0.16 + weatherWind, 0.02, 1);
    const evap = Math.round(clamp(330 + Math.max(0, tempC) * 26 + sun * 340 - humidity * 240
        + wind * 120, 80, 2400));
    return {
        tempC: round(tempC, 1), elevationM, precip, humidity: round(humidity, 3),
        insolation: round(sun, 3), wind: round(wind, 3), evap,
        waterBalance: precip - evap,
        tempSuitability: rangeFit(tempC, envelope.temp),
        precipSuitability: rangeFit(precip, envelope.precip),
        salinityRisk: region.rawBiome === "desert" || region.rawBiome === "beach" ? 0.7 : 0.2,
        envelope, zone: climateZoneFor(region.rawBiome)
    };
}

function makeSystemState(region, seed, index) {
    const profile = profileFor(region);
    const seedValue = Number.isSafeInteger(Number(seed)) && Number(seed) > 0 ? Number(seed) : 1;
    const climate = initialClimate(region, seedValue, state.seasonIndex);
    const soil = soilFor(region, climate, seedValue);
    const sample = region.sample || { moisture: 0.5, height: 0.5 };
    const jitter = unit(seedValue, index, 0x53595354) - 0.5;
    const nutrients = clamp(profile.soil * 0.62 + soil.nutrients * 0.38 + jitter * 0.08, 0.06, 0.98);
    const humus = clamp(profile.vegetation * 0.4 + soil.organic * 0.45
        + finite(sample.moisture, 0.5) * 0.1 + jitter * 0.06, 0.03, 0.98);
    const waterCapacity = clamp(soil.waterCapacity * 0.68 + profile.water * 0.2 + humus * 0.12, 0.04, 0.99);
    const compaction = clamp((profile.production === "mining" ? 0.12 : 0.03)
        + Math.max(0, 0.45 - profile.vegetation) * 0.12, 0, 0.55);
    const salinity = clamp((region.rawBiome === "desert" ? 0.28 : region.rawBiome === "beach" ? 0.22 : 0.03)
        + (1 - soil.saltTolerance) * 0.08 + jitter * 0.03, 0, 0.8);
    const soilLife = clamp(humus * 0.45 + profile.vegetation * 0.22
        + finite(sample.moisture, 0.5) * 0.2 + jitter * 0.06, 0.03, 0.98);
    const groundwater = clamp(profile.water * 0.62 + finite(sample.moisture, 0.5) * 0.24
        + unit(seedValue, index, 0x47524f55) * 0.08, 0.02, 0.99);
    const waterQuality = clamp(0.8 + unit(seedValue, index, 0x5155414c) * 0.16, 0.55, 0.98);
    const system = {
        version: CROSS_BIOME_VERSION,
        seed: seedValue,
        variantId: "",
        soilType: soil.id,
        nutrients: round(nutrients, 3),
        waterCapacity: round(waterCapacity, 3),
        compaction: round(compaction, 3),
        humus: round(humus, 3),
        soilLife: round(soilLife, 3),
        salinity: round(salinity, 3),
        groundwater: round(groundwater, 3),
        waterQuality: round(waterQuality, 3),
        pollution: 0,
        legacy: 0,
        hydrology: measureHydrology(region),
        landUse: {
            grazing: 0, farming: 0, irrigation: 0, drainage: 0, reforestation: 0,
            restoration: 0, slashBurn: 0, mining: 0, settlement: 0, roads: 0, fields: 0
        },
        lastActionYear: {}
    };
    const variant = chooseVariant(region, system, climate);
    system.variantId = variant.id;
    system.variantLabel = variant.label;
    return system;
}

export function createCrossBiomeState(region, index, seed) {
    return makeSystemState(region, seed, index);
}

function systemFor(region) {
    if (!region) return null;
    if (region.systems?.version === CROSS_BIOME_VERSION) {
        const system = region.systems;
        if (!system.hydrology || typeof system.hydrology !== "object") system.hydrology = { riverTiles: 0, lakeShare: 0 };
        if (!system.landUse || typeof system.landUse !== "object") system.landUse = {};
        if (!system.lastActionYear || typeof system.lastActionYear !== "object") system.lastActionYear = {};
        return system;
    }
    const fallback = makeSystemState(region, 1, finite(region.index));
    region.systems = fallback;
    return fallback;
}

function measureLandUse(region) {
    const x0 = finite(region.x), y0 = finite(region.y);
    const x1 = x0 + Math.max(1, finite(region.width));
    const y1 = y0 + Math.max(1, finite(region.height));
    let buildings = 0, fields = 0;
    for (const entity of state.entities || []) {
        if (!entity || entity.dead) continue;
        const x = finite(entity.x, -1), y = finite(entity.y, -1);
        if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
        if (entity.isBuilding?.()) buildings++;
        if (entity.type === TYPE.FARM) fields++;
    }
    let roads = 0;
    for (const key of Object.keys(state.roads?.tiles || {})) {
        const [x, y] = key.split(":").map(Number);
        if (x >= x0 && x < x1 && y >= y0 && y < y1) roads++;
    }
    return {
        buildings, fields, roads,
        grazing: 0,
        farming: clamp(fields / 8, 0, 1),
        settlement: clamp(buildings / 12 + roads / 60, 0, 1),
        roadUse: clamp(roads / 60, 0, 1)
    };
}

function avgFaunaPressure(region) {
    if (!region.fauna?.length) return 0;
    return region.fauna.reduce((sum, row) => sum + clamp(row.population / Math.max(1, row.capacity), 0, 1), 0) / region.fauna.length;
}

function herbivorePressure(region) {
    if (!region.fauna?.length) return 0;
    const rows = region.fauna.filter(row => ["herbivore", "omnivore"].includes(BIOME_WILDLIFE_BY_ID[row.id]?.role));
    return rows.reduce((sum, row) => sum + clamp(row.population / Math.max(1, row.capacity), 0, 1), 0);
}

function selectedResourceLabels(region, season) {
    return region.resources
        .filter(row => row.discovered && row.stock > 0 && BIOME_RESOURCE_BY_ID[row.id]?.seasons.includes(season))
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 3)
        .map(row => BIOME_RESOURCE_BY_ID[row.id]?.label)
        .filter(Boolean);
}

function selectedFaunaLabels(region) {
    return region.fauna
        .filter(row => row.discovered && row.population > 0)
        .sort((a, b) => b.population - a.population)
        .slice(0, 3)
        .map(row => BIOME_WILDLIFE_BY_ID[row.id]?.label)
        .filter(Boolean);
}

function recentRegionChange(region) {
    const history = state.biomeAtlas?.history || [];
    const entry = [...history].reverse().find(row => row.regionId === region.id);
    return entry?.text || "no local disturbance recorded";
}

function movementProfile(region, climate, soil, vegetation, snowCover) {
    const slope = terrainSlopeAt(region);
    const factor = clamp(0.98 - slope * 0.28 - Math.max(0, region.water - 0.55) * 0.16
        - snowCover * 0.32 - (1 - soil.drainage) * 0.08 - vegetation * 0.07, 0.3, 1.05);
    const label = factor > 0.86 ? "Open going" : factor > 0.68 ? "Soft ground" : factor > 0.5 ? "Difficult going" : "Impassable margins";
    return { factor: round(factor, 2), label, slope: round(slope, 2) };
}

function hazardsFor(region, climate, system, soil, season) {
    const spring = seasonIndex(season) === 0, summer = seasonIndex(season) === 1;
    const winter = seasonIndex(season) === 3;
    const dry = clamp(1 - climate.precipSuitability, 0, 1);
    const heat = clamp((climate.tempC - 18) / 22, 0, 1);
    const cold = clamp((0 - climate.tempC) / 25, 0, 1);
    const flood = clamp((Number(region.engineered) ? 0.1 : 0.2) + finite(region.water) * 0.3
        + (spring ? 0.25 : 0) + Math.max(0, climate.precip - 900) / 2400
        + (1 - system.landUse.drainage) * 0.08, 0, 1);
    const fire = clamp(dry * 0.55 + heat * 0.3 + climate.wind * 0.15
        + system.landUse.slashBurn * 0.25 - region.water * 0.2, 0, 1);
    const frost = clamp(cold * 0.7 + (winter ? 0.22 : 0) + soil.frostProne * 0.16, 0, 1);
    const disease = clamp(climate.humidity * 0.32 + (1 - system.waterQuality) * 0.36
        + finite(region.diseasePressure) * 0.3 + (spring ? 0.08 : 0), 0, 1);
    const erosion = clamp(region.erosion * 0.5 + terrainSlopeAt(region) * 0.24
        + climate.wind * 0.18 + (1 - region.vegetation) * 0.16, 0, 1);
    const drought = clamp(dry * 0.45 + (summer ? 0.24 : 0) + (1 - region.water) * 0.2
        + Math.max(0, climate.evap - climate.precip) / 2400, 0, 1);
    const rows = [
        ["flood", "Flood", flood],
        ["wildfire", "Wildfire", fire],
        ["frost", "Frost", frost],
        ["disease", "Disease", disease],
        ["erosion", "Erosion", erosion],
        ["drought", "Drought", drought],
        ["salinity", "Salinity", clamp(system.salinity * 0.8 + dry * 0.15, 0, 1)]
    ].filter(([, , severity]) => severity >= 0.28)
        .sort((a, b) => b[2] - a[2])
        .slice(0, 4)
        .map(([id, label, severity]) => ({ id, label, severity: pct(severity) }));
    return rows;
}

function recoveryFor(region, system) {
    const vegetation = clamp(0.16 + region.water * 0.2 + system.soilLife * 0.15
        + system.humus * 0.16 + system.nutrients * 0.12 + (region.protectedArea ? 0.14 : 0)
        + (region.policy === "conservation" ? 0.12 : region.policy === "fallow" ? 0.08 : 0)
        - system.legacy * 0.34 - system.landUse.grazing * 0.12
        - system.compaction * 0.1, 0, 1);
    const forest = clamp(vegetation * (1 - region.clearCut * 0.58) + system.landUse.reforestation * 0.2, 0, 1);
    const colonization = clamp((1 - region.vegetation) * 0.38 + system.soilLife * 0.2
        + region.water * 0.2 + (1 - system.compaction) * 0.1 - system.salinity * 0.2, 0, 1);
    const fauna = clamp(avgFaunaPressure(region) * 0.55 + (region.protectedArea ? 0.16 : 0)
        + region.vegetation * 0.2 + region.water * 0.1 - system.legacy * 0.12, 0, 1);
    const soilRecovery = clamp(system.soilLife * 0.32 + system.humus * 0.28
        + system.nutrients * 0.2 + (1 - region.erosion) * 0.16 - system.salinity * 0.18
        - system.legacy * 0.24, 0, 1);
    const waterRecovery = clamp(system.waterQuality * 0.42 + system.groundwater * 0.2
        + region.water * 0.2 - system.pollution * 0.3 + (region.engineered ? 0.06 : 0), 0, 1);
    return { vegetation, forest, colonization, fauna, soil: soilRecovery, water: waterRecovery };
}

function variantLabels(region) {
    return (BIOME_VARIANTS[region.rawBiome] || BIOME_VARIANTS.meadow).map(row => row.label);
}

// Cheap, allocation-light overlay data used by the biome map layer. It reads
// the season and the region sample only, so drawing the layer stays bounded
// and never recalculates the full 66-row profile on a frame.
export function getCrossBiomeSeasonOverlay(region) {
    const season = seasonIndex();
    const tints = BIOME_SEASONAL_TINTS[region?.rawBiome] || BIOME_SEASONAL_TINTS.meadow;
    const height = finite(region?.sample?.height, 0.5);
    const snow = clamp((season === 3 ? 0.34 : 0) + Math.max(0, height - 0.62) * 1.4, 0, 1);
    return {
        season,
        label: seasonRecord(season).label,
        look: seasonalAppearanceFor(region?.rawBiome, season),
        tint: tints[season],
        // The map wash has to survive the biome fill, terrain raster and the
        // region grid at landscape zoom. Winter is stronger at a lower alpha
        // because its pale blue already lifts the ground; the other three
        // seasons need enough saturation to read as distinct faces.
        tintAlpha: round((season === 3 ? 0.26 : 0.3) + (1 - finite(region?.vegetation, 0.5)) * 0.05, 3),
        snowCover: pct(snow)
    };
}

export function getCrossBiomeProfile(region) {
    const system = systemFor(region);
    const profile = profileFor(region);
    const season = seasonIndex();
    const seasonInfo = seasonRecord(season);
    const climate = initialClimate(region, system.seed || state.worldSeed || 1, season);
    const soil = BIOME_SOIL_TYPES[system.soilType] || BIOME_SOIL_TYPES.loam;
    const sample = region.sample || { height: 0.5, moisture: 0.5, temperature: 0.55 };
    const slope = terrainSlopeAt(region);
    const snowLine = Math.round(clamp((climate.tempC / 6.2) * 1000 + 500 + seasonInfo.snowLineShiftM, 0, 5000));
    const frostLine = Math.round(clamp(snowLine - 350 + (seasonInfo.id === "winter" ? -180 : 0), 0, 5000));
    const snowCover = clamp((2 - climate.tempC) / 12 + (seasonInfo.id === "winter" ? 0.25 : 0)
        + (1 - climate.insolation) * 0.12, 0, 1);
    const frostDays = Math.round(clamp((0 - climate.tempC) / 28, 0, 1) * 175 + snowCover * 35);
    const waterLevel = clamp(region.water * seasonInfo.waterFactor
        * (0.84 + system.groundwater * 0.16) * (1 - system.landUse.drainage * 0.14 + system.landUse.irrigation * 0.08), 0.01, 1);
    const waterScarcity = clamp(1 - (waterLevel * 0.5 + system.groundwater * 0.3
        + climate.precipSuitability * 0.2) + system.pollution * 0.12, 0, 1);
    const floodplain = clamp((1 - clamp((finite(sample.height, 0.5) - finite(state.seaLevel, 0.33)) / 0.3, 0, 1))
        * 0.6 + region.water * 0.25 + Math.min(0.16, system.hydrology.riverTiles / 80)
        + system.hydrology.lakeShare / 500, 0, 1);
    const farmBase = clamp(climate.tempSuitability * 0.28 + climate.precipSuitability * 0.2
        + system.nutrients * 0.22 + system.waterCapacity * 0.1 + (1 - system.salinity) * 0.12
        + (1 - system.compaction) * 0.08 + climate.insolation * 0.1 - slope * 0.1
        - system.legacy * 0.08 - clamp((6 - climate.tempC) / 28, 0, 0.32)
        - snowCover * 0.12, 0, 1);
    const farmSeason = clamp(farmBase * seasonInfo.farmFactor, 0, 1);
    const plantGrowth = clamp(climate.tempSuitability * 0.24 + climate.precipSuitability * 0.22
        + climate.humidity * 0.12 + climate.insolation * 0.12 + system.nutrients * 0.15
        + waterLevel * 0.12 + system.soilLife * 0.08 - system.salinity * 0.1
        - system.compaction * 0.07 - system.legacy * 0.05, 0, 1);
    const animalHabitat = clamp(region.vegetation * 0.38 + waterLevel * 0.22
        + climate.tempSuitability * 0.16 + system.soilLife * 0.12
        + (region.protectedArea ? 0.1 : 0) - system.legacy * 0.08, 0, 1);
    const movement = movementProfile(region, climate, soil, region.vegetation, snowCover);
    const hazards = hazardsFor(region, climate, system, soil, season);
    const recovery = recoveryFor(region, system);
    const animalBreeding = region.fauna.filter(row => row.breeding).length;
    const animalMigrating = region.fauna.filter(row => row.migrating).length;
    const resources = selectedResourceLabels(region, season);
    const fauna = selectedFaunaLabels(region);
    const zone = climate.zone || climateZoneFor(region.rawBiome);
    const relatedZones = Object.values(BIOME_CLIMATE_ZONES).filter(entry => entry.biomes.includes(region.rawBiome));
    const gradientBase = region.sample?.moisture ?? 0.5;
    const atlas = state.biomeAtlas;
    let gradientNeighbors = [];
    if (atlas?.regions?.length) {
        const column = region.index % 6, row = Math.floor(region.index / 6);
        gradientNeighbors = [
            [column - 1, row], [column + 1, row], [column, row - 1], [column, row + 1]
        ].filter(([c, r]) => c >= 0 && c < 6 && r >= 0 && r < 6)
            .map(([c, r]) => atlas.regions[r * 6 + c]?.sample?.moisture)
            .filter(value => Number.isFinite(value));
    }
    const neighborMoisture = gradientNeighbors.length
        ? gradientNeighbors.reduce((sum, value) => sum + value, 0) / gradientNeighbors.length
        : gradientBase;
    const moistureGradient = round((gradientBase - neighborMoisture) * 100, 1);
    const soilRegeneration = clamp(0.18 + system.humus * 0.24 + system.soilLife * 0.2
        + waterLevel * 0.15 + (1 - region.erosion) * 0.12 + (region.protectedArea ? 0.1 : 0)
        - system.legacy * 0.42 - system.compaction * 0.12, 0, 1);
    const irreversible = clamp(system.legacy * 0.68 + system.salinity * 0.14
        + (1 - system.waterQuality) * 0.1 + region.erosion * 0.08, 0, 1);
    const ecologicalChanges = recentRegionChange(region);
    const look = seasonalAppearanceFor(region.rawBiome, season);
    const fieldLabel = region.focus === "agriculture" ? "cropland focus" : region.focus === "pastoralism" ? "pasture focus" : "mixed use";
    const densityLabel = region.vegetation > 0.72 ? "dense" : region.vegetation > 0.45 ? "open" : region.vegetation > 0.2 ? "sparse" : "bare";
    const soilTypeLabel = soil.label;
    const precipitationLabel = climate.precip < 300 ? "arid" : climate.precip < 700 ? "dry" : climate.precip < 1600 ? "moist" : "wet";
    const climateLabel = climate.tempC < 0 ? "frost-bound" : climate.tempC < 10 ? "cool" : climate.tempC < 22 ? "mild" : climate.tempC < 30 ? "warm" : "hot";
    const farmLimit = [
        ["temperature", climate.tempSuitability],
        ["rainfall", climate.precipSuitability],
        ["nutrients", system.nutrients],
        ["salinity", 1 - system.salinity],
        ["compaction", 1 - system.compaction],
        ["slope", 1 - slope],
        ["frost", 1 - clamp(snowCover * 0.72 + Math.max(0, (6 - climate.tempC) / 28), 0, 1)]
    ].sort((a, b) => a[1] - b[1])[0];
    const values = {
        "temperature-range": { value: climate.tempC.toFixed(1) + " °C", detail: "envelope " + climate.envelope.temp[0] + "…" + climate.envelope.temp[1] + " °C · " + climateLabel },
        "precipitation-range": { value: climate.precip + " mm/yr", detail: "envelope " + climate.envelope.precip[0] + "…" + climate.envelope.precip[1] + " mm · " + precipitationLabel },
        "humidity-growth-soil": { value: pct(climate.humidity) + "%", detail: "plant growth " + pct(plantGrowth) + "% · soil life " + pct(system.soilLife) + "%" },
        "elevation-temperature-vegetation": { value: climate.elevationM + " m", detail: "local lapse −" + round(climate.elevationM * 0.0062, 1) + " °C · slope " + pct(slope) + "%" },
        "insolation-plants": { value: pct(climate.insolation) + "%", detail: "solar input · growth " + pct(plantGrowth) + "%" },
        "wind-vegetation-erosion": { value: pct(climate.wind) + "%", detail: "wind exposure · erosion " + pct(region.erosion) + "%" },
        "climate-zones-multiple-biomes": { value: zone.label, detail: relatedZones.map(entry => entry.label).join(" · ") },
        "local-variants": { value: system.variantLabel || "Local form", detail: variantLabels(region).join(" · ") },
        "soil-types": { value: soilTypeLabel, detail: soil.parent },
        "nutrients": { value: pct(system.nutrients) + "%", detail: "plant-available nutrient store" },
        "water-capacity": { value: pct(system.waterCapacity) + "%", detail: "soil water storage" },
        "compaction": { value: pct(system.compaction) + "%", detail: "traffic, grazing and tillage" },
        "erosion": { value: pct(region.erosion) + "%", detail: "slope, wind and cover loss" },
        "humus": { value: pct(system.humus) + "%", detail: "organic matter and litter" },
        "soil-organisms": { value: pct(system.soilLife) + "%", detail: "soil fauna and microbial service" },
        "salinity": { value: pct(system.salinity) + "%", detail: "salt accumulation in the root zone" },
        "frost-thaw": { value: frostDays + " days", detail: "snow cover " + pct(snowCover) + "% · frost line " + frostLine + " m" },
        "soil-regeneration": { value: pct(soilRegeneration) + "%", detail: "humus, organisms and recovery rate" },
        "precipitation-evaporation": { value: climate.precip + " / " + climate.evap + " mm", detail: "annual balance " + (climate.waterBalance >= 0 ? "+" : "") + climate.waterBalance + " mm" },
        "surface-water": { value: pct(waterLevel) + "%", detail: "seasonal lakes, streams and ponds" },
        "groundwater": { value: pct(system.groundwater) + "%", detail: "recharged by rain, drawn by irrigation" },
        "rivers-lakes": { value: system.hydrology.riverTiles + " river tiles", detail: system.hydrology.lakeShare + "% lake / open water" },
        "floodplains": { value: pct(floodplain) + "%", detail: "low ground and riparian margin" },
        "seasonal-water": { value: pct(waterLevel) + "%", detail: seasonInfo.water },
        "water-quality": { value: pct(system.waterQuality) + "%", detail: "drinking, fishing and irrigation quality" },
        "water-scarcity": { value: pct(waterScarcity) + "%", detail: waterScarcity > 0.55 ? "scarcity limits farms and herds" : "water is not the limiting factor" },
        "moisture-gradients": { value: (moistureGradient >= 0 ? "+" : "") + moistureGradient + "%", detail: moistureGradient >= 0 ? "wetter than neighbouring regions" : "drier than neighbouring regions" },
        "plants-animals-agriculture": { value: "plants " + pct(plantGrowth) + "%", detail: "animals " + pct(animalHabitat) + "% · farms " + pct(farmBase) + "%" },
        "seasonal-appearance": { value: seasonInfo.label, detail: look },
        "plant-season-reactions": { value: seasonInfo.plants, detail: "growth " + pct(seasonInfo.growth) + "%" },
        "animal-activity": { value: seasonInfo.animals, detail: (animalBreeding + animalMigrating) + " species breeding or moving" },
        "seasonal-resources": { value: resources.length ? resources.join(" · ") : "none in season", detail: "live stocks and seasonal windows" },
        "snow-frost-line": { value: snowLine + " m snow", detail: "frost line " + frostLine + " m · " + seasonInfo.label },
        "water-levels": { value: pct(waterLevel) + "%", detail: "surface and groundwater response to the season" },
        "farm-use": { value: pct(farmSeason) + "%", detail: seasonInfo.farm + " · " + fieldLabel },
        "seasonal-hazards": { value: hazards.length ? hazards.map(row => row.label).join(" · ") : "none pressing", detail: seasonInfo.hazard },
        "clearing": { value: pct(region.clearCut) + "%", detail: "recent canopy removal and exposed ground" },
        "afforestation": { value: pct(system.landUse.reforestation) + "%", detail: "active replanting footprint" },
        "grazing": { value: pct(system.landUse.grazing) + "%", detail: "herbivore pressure on pasture and regeneration" },
        "farming": { value: pct(system.landUse.farming) + "%", detail: "fields, tillage and nutrient draw" },
        "irrigation": { value: pct(system.landUse.irrigation) + "%", detail: "water diverted to fields and orchards" },
        "drainage": { value: pct(system.landUse.drainage) + "%", detail: "ditches and lowered water table" },
        "mining": { value: pct(system.landUse.mining) + "%", detail: "extraction, spoil and pollution pressure" },
        "roads-settlement": { value: pct(system.landUse.settlement) + "%", detail: "buildings, roads and compaction" },
        "pollution": { value: pct(system.pollution) + "%", detail: "mine spoil, smoke and settlement waste" },
        "slash-burn": { value: pct(system.landUse.slashBurn) + "%", detail: "burnt clearing and short nutrient pulse" },
        "habitat-restoration": { value: pct(system.landUse.restoration) + "%", detail: "crown restoration and protection work" },
        "long-term-landscape": { value: "legacy " + pct(system.legacy) + "%", detail: "persistent change after intensive use" },
        "vegetation-recovery": { value: pct(recovery.vegetation) + "%", detail: "regrowth after disturbance" },
        "forest-regrowth": { value: pct(recovery.forest) + "%", detail: "woodland return after clearing" },
        "colonization": { value: pct(recovery.colonization) + "%", detail: "bare-ground colonisation potential" },
        "fauna-return": { value: pct(recovery.fauna) + "%", detail: "populations and breeding cover" },
        "soil-recovery": { value: pct(recovery.soil) + "%", detail: "humus, organisms and structure" },
        "water-recovery": { value: pct(recovery.water) + "%", detail: "quality and groundwater after pollution" },
        "recovery-context": { value: zone.label + " · " + soilTypeLabel, detail: "policy " + region.policy + " · " + fieldLabel },
        "irreversible-damage": { value: pct(irreversible) + "%", detail: irreversible > 0.5 ? "some loss will outlast the current reign" : "recovery remains possible" },
        "display-biome": { value: profile.label, detail: zone.label + " zone · " + system.variantLabel },
        "display-variants": { value: system.variantLabel, detail: variantLabels(region).join(" · ") },
        "display-density": { value: pct(region.vegetation) + "%", detail: densityLabel + " vegetation cover" },
        "display-resources": { value: resources.length ? resources.join(" · ") : "none in season", detail: "typical local production" },
        "display-fauna": { value: fauna.length ? fauna.join(" · ") : "none recorded", detail: "most visible animal populations" },
        "display-climate": { value: climate.tempC.toFixed(1) + " °C · " + climate.precip + " mm", detail: precipitationLabel + " · humidity " + pct(climate.humidity) + "%" },
        "display-hazards": { value: hazards.length ? hazards.map(row => row.label).join(" · ") : "none pressing", detail: seasonInfo.hazard },
        "display-agriculture": { value: pct(farmBase) + "%", detail: "seasonal " + pct(farmSeason) + "% · limit " + farmLimit[0] },
        "display-movement": { value: movement.factor.toFixed(2) + "×", detail: movement.label },
        "display-changes": { value: "trend " + (region.ecologyTrend >= 0 ? "+" : "") + round(region.ecologyTrend * 100, 1) + "%", detail: ecologicalChanges }
    };
    const requirements = BIOME_SYSTEM_REQUIREMENTS.map(requirement => ({
        ...requirement,
        value: values[requirement.key]?.value ?? "—",
        detail: values[requirement.key]?.detail ?? ""
    }));
    return {
        version: CROSS_BIOME_VERSION,
        biome: region.rawBiome,
        biomeLabel: profile.label,
        zone: zone.label,
        zoneId: zone.id,
        relatedBiomes: [...zone.biomes],
        variant: system.variantLabel,
        variants: variantLabels(region),
        climate: {
            tempC: climate.tempC, tempRange: [...climate.envelope.temp],
            precipitation: climate.precip, precipitationRange: [...climate.envelope.precip],
            humidity: pct(climate.humidity), insolation: pct(climate.insolation),
            wind: pct(climate.wind), elevationM: climate.elevationM,
            evap: climate.evap, waterBalance: climate.waterBalance, label: climateLabel
        },
        soil: {
            id: soil.id, label: soil.label, parent: soil.parent,
            nutrients: pct(system.nutrients), waterCapacity: pct(system.waterCapacity),
            compaction: pct(system.compaction), erosion: pct(region.erosion),
            humus: pct(system.humus), organisms: pct(system.soilLife),
            salinity: pct(system.salinity), frostDays, snowCover: pct(snowCover),
            regeneration: pct(soilRegeneration)
        },
        water: {
            precipitation: climate.precip, evaporation: climate.evap,
            surface: pct(waterLevel), groundwater: pct(system.groundwater),
            riverTiles: system.hydrology.riverTiles, lakeShare: system.hydrology.lakeShare,
            floodplain: pct(floodplain), quality: pct(system.waterQuality),
            scarcity: pct(waterScarcity), gradient: moistureGradient
        },
        season: {
            index: season, label: seasonInfo.label, look,
            plants: seasonInfo.plants, animals: seasonInfo.animals,
            water: seasonInfo.water, farm: seasonInfo.farm, hazard: seasonInfo.hazard,
            snowLineM: snowLine, frostLineM: frostLine,
            waterLevel: pct(waterLevel), farmUse: pct(farmSeason),
            animalActivity: pct(clamp(0.25 + seasonInfo.growth * 0.4 + animalBreeding * 0.03 + animalMigrating * 0.03, 0, 1))
        },
        ecology: {
            plantGrowth: pct(plantGrowth), animalHabitat: pct(animalHabitat),
            agriculture: pct(farmBase), movement: movement.factor, movementLabel: movement.label,
            hazards, trend: round(region.ecologyTrend * 100, 1), change: ecologicalChanges
        },
        landUse: {
            clearing: pct(region.clearCut), afforestation: pct(system.landUse.reforestation),
            grazing: pct(system.landUse.grazing), farming: pct(system.landUse.farming),
            irrigation: pct(system.landUse.irrigation), drainage: pct(system.landUse.drainage),
            mining: pct(system.landUse.mining), settlement: pct(system.landUse.settlement),
            pollution: pct(system.pollution), slashBurn: pct(system.landUse.slashBurn),
            restoration: pct(system.landUse.restoration), legacy: pct(system.legacy)
        },
        recovery: {
            vegetation: pct(recovery.vegetation), forest: pct(recovery.forest),
            colonization: pct(recovery.colonization), fauna: pct(recovery.fauna),
            soil: pct(recovery.soil), water: pct(recovery.water),
            irreversible: pct(irreversible)
        },
        display: {
            biome: values["display-biome"].value,
            variants: values["display-variants"].value,
            density: values["display-density"].value,
            resources: values["display-resources"].value,
            fauna: values["display-fauna"].value,
            climate: values["display-climate"].value,
            hazards: values["display-hazards"].value,
            agriculture: values["display-agriculture"].value,
            movement: values["display-movement"].value,
            changes: values["display-changes"].value
        },
        requirements
    };
}

// One bounded annual step. Everything here reads the region's existing saved
// fields and the already-computed fauna/resources; it never loops over tiles.
export function advanceCrossBiomeAnnual(region, { year, season } = {}) {
    const system = systemFor(region);
    if (!system) return null;
    const use = measureLandUse(region);
    const seasonValue = seasonIndex(season);
    const climate = initialClimate(region, system.seed || state.worldSeed || 1, seasonValue);
    const soil = BIOME_SOIL_TYPES[system.soilType] || BIOME_SOIL_TYPES.loam;
    const policy = { intensive: 1.45, sustainable: 0.55, conservation: 0.15, fallow: 0 }[region.policy] ?? 0.55;
    const herbivores = herbivorePressure(region);
    const nonRenewable = region.resources.some(row => row.discovered
        && BIOME_RESOURCE_BY_ID[row.id] && !BIOME_RESOURCE_BY_ID[row.id].renewable)
        ? clamp(region.extractionPressure * 0.35, 0, 1) : 0;
    system.landUse.grazing = clamp(herbivores * (region.focus === "pastoralism" ? 1.2 : 1)
        * (region.protectedArea ? 0.55 : 1), 0, 1);
    system.landUse.farming = clamp(use.farming + (region.focus === "agriculture" ? 0.32 : 0), 0, 1);
    system.landUse.mining = clamp(finite(region.extractionPressure) * 0.58
        + (region.focus === "mining" ? 0.2 : 0) + nonRenewable * 0.08, 0, 1);
    system.landUse.settlement = use.settlement;
    system.landUse.roads = use.roadUse;
    system.landUse.fields = use.fields;

    const rain = clamp(climate.precip / 2600, 0, 1);
    const evaporation = clamp(climate.evap / 2600, 0, 1);
    const waterBalance = rain - evaporation * 0.72;
    const plantGrowth = clamp(climate.tempSuitability * 0.24 + climate.precipSuitability * 0.22
        + climate.humidity * 0.12 + climate.insolation * 0.12 + system.nutrients * 0.15
        + region.water * 0.12 + system.soilLife * 0.08 - system.salinity * 0.1
        - system.compaction * 0.07 - system.legacy * 0.05, 0, 1);
    // Water: rain recharges the lens, irrigation and drainage move it, and
    // pollution is flushed only while the water body is actually renewing.
    system.groundwater = clamp(system.groundwater + waterBalance * 0.028
        - system.landUse.irrigation * 0.04 - system.landUse.mining * 0.01
        + system.landUse.restoration * 0.004, 0.02, 1);
    system.pollution = clamp(system.pollution + system.landUse.mining * 0.018
        + system.landUse.settlement * 0.012 + system.landUse.slashBurn * 0.035
        - rain * 0.014 - system.landUse.restoration * 0.018, 0, 1);
    system.waterQuality = clamp(system.waterQuality + rain * 0.012
        + system.landUse.restoration * 0.018 + policy * 0.0015
        - system.pollution * 0.024 - system.landUse.mining * 0.01, 0.05, 1);
    // Soil: organic matter and organisms build slowly; tillage, grazing,
    // erosion, salt and pollution consume them. Legacy is deliberately sticky.
    system.nutrients = clamp(system.nutrients + region.vegetation * 0.006
        + system.soilLife * 0.004 - system.landUse.farming * 0.012
        - system.landUse.grazing * 0.008 - region.erosion * 0.01
        - system.landUse.slashBurn * 0.015 + system.landUse.restoration * 0.008, 0.04, 1);
    system.humus = clamp(system.humus + region.vegetation * 0.006
        + system.soilLife * 0.003 - region.erosion * 0.008
        - system.landUse.farming * 0.005 - system.landUse.slashBurn * 0.02
        + system.landUse.restoration * 0.006, 0.02, 1);
    system.soilLife = clamp(system.soilLife + system.humus * 0.006
        + waterBalance * 0.004 - system.pollution * 0.01 - system.compaction * 0.006
        - system.salinity * 0.006 + system.landUse.restoration * 0.005, 0.03, 1);
    system.compaction = clamp(system.compaction + system.landUse.grazing * 0.008
        + system.landUse.farming * 0.005 + system.landUse.settlement * 0.01
        + system.landUse.mining * 0.008 - system.landUse.restoration * 0.012
        - (region.policy === "fallow" ? 0.008 : 0), 0, 0.9);
    const irrigationSalt = system.landUse.irrigation * (region.rawBiome === "desert" ? 0.018 : 0.006);
    system.salinity = clamp(system.salinity + irrigationSalt + evaporation * 0.003
        - system.landUse.drainage * 0.012 - rain * 0.003, 0, 0.9);
    system.legacy = clamp(system.legacy + region.erosion * 0.004 + system.salinity * 0.003
        + system.pollution * 0.003 + system.landUse.slashBurn * 0.006
        + system.landUse.mining * 0.002 - system.landUse.restoration * 0.002
        - (region.protectedArea ? 0.001 : 0), 0, 1);
    region.soilHealth = clamp(region.soilHealth + (system.nutrients - 0.5) * 0.008
        + (system.humus - 0.5) * 0.004 - system.compaction * 0.004
        - system.salinity * 0.004 - system.legacy * 0.003, 0.02, 1);
    region.water = clamp(region.water + waterBalance * 0.012
        + system.landUse.irrigation * 0.01 - system.landUse.drainage * 0.012
        - system.landUse.settlement * 0.003, 0.02, 1);
    region.vegetation = clamp(region.vegetation + (plantGrowth - 0.45) * 0.003
        - system.landUse.grazing * 0.002 - system.landUse.slashBurn * 0.01
        + system.landUse.reforestation * 0.006 + system.landUse.restoration * 0.004, 0.005, 1);
    region.erosion = clamp(region.erosion + system.landUse.grazing * 0.003
        + system.landUse.farming * 0.002 + climate.wind * 0.002
        + system.compaction * 0.002 - region.vegetation * 0.003
        - system.landUse.restoration * 0.004 - (region.protectedArea ? 0.001 : 0), 0, 1);
    region.diseasePressure = clamp(region.diseasePressure + (1 - system.waterQuality) * 0.003
        - system.landUse.restoration * 0.002, 0, 1);
    // Land-use footprints fade when the action is not repeated. Reforestation
    // leaves its result in vegetation rather than a permanent free bonus.
    system.landUse.irrigation *= 0.9;
    system.landUse.drainage *= 0.9;
    system.landUse.reforestation *= 0.92;
    system.landUse.restoration *= 0.86;
    system.landUse.slashBurn *= 0.65;
    system.lastYear = Number(year) || Number(state.year) || 1;
    return {
        year: system.lastYear,
        soil: {
            nutrients: pct(system.nutrients), humus: pct(system.humus),
            organisms: pct(system.soilLife), compaction: pct(system.compaction),
            salinity: pct(system.salinity), legacy: pct(system.legacy)
        },
        water: {
            groundwater: pct(system.groundwater), quality: pct(system.waterQuality),
            pollution: pct(system.pollution)
        },
        landUse: { ...system.landUse }
    };
}

export function applyCrossBiomeAction(region, action) {
    const system = systemFor(region);
    if (!system) return null;
    const currentYear = Number(state.year) || 1;
    system.lastActionYear = system.lastActionYear || {};
    if (action === "irrigate") {
        system.landUse.irrigation = clamp(system.landUse.irrigation + 0.22, 0, 1);
        region.water = clamp(region.water + 0.035, 0, 1);
        system.groundwater = clamp(system.groundwater - 0.02, 0.02, 1);
        system.salinity = clamp(system.salinity + (region.rawBiome === "desert" ? 0.025 : 0.008), 0, 0.9);
    } else if (action === "drain") {
        system.landUse.drainage = clamp(system.landUse.drainage + 0.22, 0, 1);
        region.water = clamp(region.water - 0.03, 0.02, 1);
        system.salinity = clamp(system.salinity - 0.025, 0, 0.9);
        system.waterQuality = clamp(system.waterQuality + 0.01, 0, 1);
    } else if (action === "reforest") {
        system.landUse.reforestation = clamp(system.landUse.reforestation + 0.26, 0, 1);
        region.vegetation = clamp(region.vegetation + 0.055, 0, 1);
        region.erosion = clamp(region.erosion - 0.025, 0, 1);
        system.humus = clamp(system.humus + 0.012, 0, 1);
    } else if (action === "clean-water") {
        system.pollution = clamp(system.pollution - 0.18, 0, 1);
        system.waterQuality = clamp(system.waterQuality + 0.12, 0, 1);
    } else if (action === "slash-burn") {
        if (system.lastActionYear.slashBurn === currentYear) return { ok: false, reason: "already-burnt-this-year" };
        system.lastActionYear.slashBurn = currentYear;
        system.landUse.slashBurn = clamp(system.landUse.slashBurn + 0.3, 0, 1);
        system.nutrients = clamp(system.nutrients + 0.035, 0, 1);
        system.legacy = clamp(system.legacy + 0.035, 0, 1);
        region.clearCut = clamp(region.clearCut + 0.12, 0, 1);
        region.vegetation = clamp(region.vegetation - 0.06, 0.005, 1);
        region.erosion = clamp(region.erosion + 0.015, 0, 1);
        system.pollution = clamp(system.pollution + 0.03, 0, 1);
    } else if (action === "restore") {
        system.landUse.restoration = clamp(system.landUse.restoration + 0.24, 0, 1);
        region.vegetation = clamp(region.vegetation + 0.06, 0, 1);
        region.soilHealth = clamp(region.soilHealth + 0.035, 0, 1);
        system.humus = clamp(system.humus + 0.015, 0, 1);
        system.soilLife = clamp(system.soilLife + 0.012, 0, 1);
        system.pollution = clamp(system.pollution - 0.08, 0, 1);
        system.waterQuality = clamp(system.waterQuality + 0.04, 0, 1);
        system.legacy = clamp(system.legacy - 0.006, 0, 1);
    }
    return { ok: true, action };
}

export function serializeCrossBiomeState(system) {
    if (!system || system.version !== CROSS_BIOME_VERSION) return null;
    return {
        version: system.version,
        seed: system.seed,
        variantId: system.variantId,
        variantLabel: system.variantLabel,
        soilType: system.soilType,
        nutrients: round(system.nutrients, 3),
        waterCapacity: round(system.waterCapacity, 3),
        compaction: round(system.compaction, 3),
        humus: round(system.humus, 3),
        soilLife: round(system.soilLife, 3),
        salinity: round(system.salinity, 3),
        groundwater: round(system.groundwater, 3),
        waterQuality: round(system.waterQuality, 3),
        pollution: round(system.pollution, 3),
        legacy: round(system.legacy, 3),
        hydrology: {
            riverTiles: Math.max(0, Math.round(finite(system.hydrology?.riverTiles))),
            lakeShare: clamp(Math.round(finite(system.hydrology?.lakeShare)), 0, 100)
        },
        landUse: Object.fromEntries(Object.entries(system.landUse || {}).map(([key, value]) => [key, round(value, 3)])),
        lastActionYear: { ...(system.lastActionYear || {}) }
    };
}

export function validateCrossBiomeState(saved) {
    if (saved === undefined || saved === null) return true;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Save data contains an invalid cross-biome system.");
    if (saved.version !== undefined && saved.version !== CROSS_BIOME_VERSION) throw new Error("Save data contains an unsupported cross-biome version.");
    if (!BIOME_SOIL_TYPES[String(saved.soilType)]) throw new Error("Save data contains an invalid soil type.");
    for (const key of ["nutrients", "waterCapacity", "compaction", "humus", "soilLife", "salinity", "groundwater", "waterQuality", "pollution", "legacy"]) {
        if (saved[key] !== undefined && (!Number.isFinite(Number(saved[key])) || Number(saved[key]) < 0 || Number(saved[key]) > 1)) {
            throw new Error("Save data contains an invalid cross-biome scalar.");
        }
    }
    for (const key of ["riverTiles", "lakeShare"]) {
        if (saved.hydrology?.[key] !== undefined && (!Number.isFinite(Number(saved.hydrology[key])) || Number(saved.hydrology[key]) < 0 || Number(saved.hydrology[key]) > 1000000)) {
            throw new Error("Save data contains invalid biome hydrology.");
        }
    }
    if (saved.landUse !== undefined) {
        if (!saved.landUse || typeof saved.landUse !== "object" || Array.isArray(saved.landUse)) throw new Error("Save data contains an invalid biome land-use record.");
        for (const [key, value] of Object.entries(saved.landUse)) {
            const maximum = key === "fields" ? 10000 : 1;
            if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > maximum) throw new Error("Save data contains an invalid biome land-use value.");
        }
    }
    if (saved.lastActionYear !== undefined && (!saved.lastActionYear || typeof saved.lastActionYear !== "object" || Array.isArray(saved.lastActionYear))) {
        throw new Error("Save data contains an invalid biome action ledger.");
    }
    return true;
}

export function normalizeCrossBiomeState(saved, region, seed) {
    validateCrossBiomeState(saved);
    const system = makeSystemState(region, seed ?? saved?.seed ?? state.worldSeed ?? 1, region.index);
    if (!saved) return system;
    const allowedSoil = BIOME_SOIL_TYPES[String(saved.soilType)];
    if (allowedSoil) system.soilType = allowedSoil.id;
    if (BIOME_VARIANTS[region.rawBiome]?.some(row => row.id === String(saved.variantId))) {
        system.variantId = String(saved.variantId);
        system.variantLabel = BIOME_VARIANTS[region.rawBiome].find(row => row.id === system.variantId).label;
    }
    for (const key of ["nutrients", "waterCapacity", "compaction", "humus", "soilLife", "salinity", "groundwater", "waterQuality", "pollution", "legacy"]) {
        system[key] = clamp(finite(saved[key], system[key]), 0, 1);
    }
    if (saved.hydrology && typeof saved.hydrology === "object") {
        system.hydrology.riverTiles = Math.max(0, Math.round(finite(saved.hydrology.riverTiles, system.hydrology.riverTiles)));
        system.hydrology.lakeShare = clamp(Math.round(finite(saved.hydrology.lakeShare, system.hydrology.lakeShare)), 0, 100);
    }
    if (saved.landUse && typeof saved.landUse === "object" && !Array.isArray(saved.landUse)) {
        for (const key of Object.keys(system.landUse)) {
            const maximum = key === "fields" ? 10000 : 1;
            system.landUse[key] = clamp(finite(saved.landUse[key], system.landUse[key]), 0, maximum);
        }
    }
    if (saved.lastActionYear && typeof saved.lastActionYear === "object" && !Array.isArray(saved.lastActionYear)) {
        for (const [key, value] of Object.entries(saved.lastActionYear)) {
            if (["slashBurn"].includes(key)) system.lastActionYear[key] = clamp(Math.round(finite(value, 0)), 0, 1000000);
        }
    }
    return system;
}

export { BIOME_CLIMATE_ZONES, BIOME_CLIMATE_ENVELOPES, BIOME_SEASONS, BIOME_SEASONAL_APPEARANCE, BIOME_SEASONAL_TINTS };
