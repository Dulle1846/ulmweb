// 1.2.20 — Environmental hazards, diseases and their countermeasures.
//
// This is the cross-biome hazard layer. The per-climate modules
// (snow-/volcano-/coast-hazards.js) keep their destructive annual events; this
// module owns the shared experience: what the current climate and season throw
// at the realm, how the population and the stores feel it, which works keep it
// in check and which damage outlives the year.
//
// Cadence and budget:
//   • one pass when the season changes (at most four per year),
//   • one bounded pass at the year boundary inside ANNUAL_TASKS.
// Every roll is a pure hash of seed, year, season and hazard id, so a replay
// reaches the same hazards without consuming the shared random streams. No
// per-frame or per-tick scan is introduced: the seasonal pass reads a capped
// building list and at most 24 farms, the annual pass reads caps and counters.
import { BUILDING_SIZE } from "../core/config.js";
import { addLog } from "../core/event-log.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "../systems/resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { consumeMedicine, getMedicineAvailability, startOutbreak } from "../systems/health.js";
import { getHazardModifiers as readHazardModifiers, invalidateHazardModifierCache } from "./hazard-modifiers.js";
import { destroyRoad, getRoadAt } from "../systems/roads.js";
import {
    addHazardScar, applyHazardTerrainScars, getHazardScarSnapshot, normalizeHazardScars,
    recordFloodScar, recordLavaScar, recordLostGround, recordWildfireScar
} from "./hazard-scars.js";
import {
    advanceHazardResponse, buildHazardForecast, consumeHazardStockpile,
    createDiseaseRecord, hazardEvacuationActive, isHazardQuarantined,
    normalizeHazardPartners, normalizeHazardResponse, payHazardInsurance,
    planReadiness, refreshHazardForecast, registerHazardDisease,
    selectRareChain
} from "./hazard-response.js";
import { rareChainFor } from "../world/hazard-expansion-data.js";
import { getClimateDrift } from "./climate-drift.js";
import { damageHazardHerds } from "./forest-fauna.js";
import {
    HAZARD_EFFECT_PRIMITIVE, HAZARD_WORK_FIELD, isHazardProofNeutralized
} from "./hazard-proof.js";
import {
    HAZARD_CATALOG, HAZARD_EFFECTS, HAZARD_LIMITS, HAZARD_MECHANICS, REGIONAL_BUNDLES,
    hazardRowsForClimate
} from "../world/hazard-data.js";

export const HAZARD_STATE_VERSION = 1;
export {
    getHazardSimulationEffects, getHazardFoodDemandFactor, getHazardWorkFactor,
    getHazardMovementFactor, getHazardExtractionFactor, getHazardPastureCapacityFactor,
    getHazardTradeBuyFactor, getHazardTradeSellFactor
} from "./hazard-modifiers.js";
const SEASON_NAMES = ["spring", "summer", "autumn", "winter"];

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const int = (value, fallback = 0) => Math.trunc(Number.isFinite(Number(value)) ? Number(value) : fallback);
const positive = value => Math.max(0, int(value, 0));

function hash32(seed, salt, a = 0, b = 0) {
    let value = (Number(seed) >>> 0) ^ (Number(salt) >>> 0)
        ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b)
        ^ Math.imul((Number(state.year) | 0) + 1, 0xc2b2ae35);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

let proofRoll = null;

/** Test-only forced roll. Null in production, so the live hash is untouched. */
export function setHazardProofRoll(value = null) {
    proofRoll = value === null || value === undefined ? null : clamp01(value);
}

/** Deterministic 0..1 roll for one hazard in one year and season. */
export function hazardRoll(mechanic, season = state.seasonIndex) {
    if (proofRoll !== null) return proofRoll;
    const salt = Array.from(String(mechanic)).reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7);
    return hash32(Number(state.worldSeed) || 1, salt, int(season), 0) / 0x100000000;
}

export function createEnvironmentalHazardState() {
    return {
        version: HAZARD_STATE_VERSION,
        year: 0,
        season: -1,
        lastUpdateTick: -1,
        lastYear: 0,
        active: [],
        warnings: [],
        modifiers: emptyModifiers(),
        chronic: emptyChronic(),
        magic: emptyMagic(),
        diseases: [],
        mitigation: emptyMitigation(),
        preparedness: { season: -1, year: 0, spent: 0, history: [] },
        losses: { food: 0, wood: 0, stone: 0, gold: 0, buildings: 0, roads: 0, ill: 0, injured: 0, herds: 0, years: 0 },
        history: [],
        rare: null,
        response: normalizeHazardResponse(null),
        partners: [],
        scars: normalizeHazardScars(null)
    };
}

function emptyModifiers() {
    return {
        diseaseRisk: 0, work: 0, movement: 0, needs: 0, morale: 0,
        resistance: 0, adaptation: 0, medical: 0, trade: 0, extraction: 0, pasture: 0
    };
}

function emptyChronic() {
    return {
        droughtYears: 0, droughtLevel: 0, plagueSpread: [], epizooticRegions: [],
        wildfireZones: [], floodScars: 0, volcanicYears: 0, climateDrift: 0,
        economicDrag: 0, burntTiles: 0, lostGround: 0,
        terrainTiles: 0, nodesLost: 0, roadsCut: 0
    };
}

function emptyMagic() {
    return {
        corruption: 0, fog: 0, cursed: 0, unnaturalWeather: 0, magicDisease: 0,
        animalShift: 0, forbidden: 0, wards: 0, lastRare: null, rareYears: 0
    };
}

function emptyMitigation() {
    return {
        well: 0, irrigation: 0, dam: 0, avalanche: 0, drainage: 0, roads: 0,
        warehouse: 0, medical: 0, clothing: 0, research: 0, units: 0, siting: 0,
        firebreak: 0, readiness: 0, score: 0
    };
}

/** Clamp a stored or partially built state into the current shape. */
export function normalizeEnvironmentalHazardState(value) {
    const base = createEnvironmentalHazardState();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    base.year = positive(value.year);
    base.season = Number.isInteger(value.season) && value.season >= -1 && value.season <= 3 ? value.season : -1;
    base.lastUpdateTick = int(value.lastUpdateTick, -1);
    base.lastYear = positive(value.lastYear);
    base.active = Array.isArray(value.active) ? value.active.slice(0, HAZARD_LIMITS.maxActive).map(normalizeActive).filter(Boolean) : [];
    base.warnings = Array.isArray(value.warnings) ? value.warnings.slice(0, 8).map(entry => String(entry).slice(0, 140)) : [];
    base.modifiers = normalizeModifiers(value.modifiers);
    base.chronic = normalizeChronic(value.chronic);
    base.magic = normalizeMagic(value.magic);
    base.diseases = Array.isArray(value.diseases) ? value.diseases.slice(0, HAZARD_LIMITS.maxDiseases).map(entry => ({
        id: String(entry?.id || "regional-fever").slice(0, 48),
        label: String(entry?.label || entry?.id || "Regional fever").slice(0, 80),
        cases: positive(entry?.cases),
        year: positive(entry?.year),
        source: String(entry?.source || "hazard").slice(0, 32),
        profile: String(entry?.profile || "environmental").slice(0, 32),
        vector: String(entry?.vector || "exposure").slice(0, 24),
        water: Boolean(entry?.water),
        contagion: clamp01(entry?.contagion),
        lethality: clamp01(entry?.lethality),
        duration: Math.min(12, positive(entry?.duration) || 1),
        deaths: positive(entry?.deaths),
        recovered: positive(entry?.recovered),
        active: Boolean(entry?.active),
        lastYear: positive(entry?.lastYear)
    })).filter(entry => entry.id) : [];
    base.mitigation = normalizeMitigation(value.mitigation);
    base.response = normalizeHazardResponse(value.response);
    base.partners = normalizeHazardPartners(value.partners);
    base.scars = normalizeHazardScars(value.scars);
    const preparedness = value.preparedness && typeof value.preparedness === "object" ? value.preparedness : {};
    base.preparedness = {
        season: Number.isInteger(preparedness.season) ? preparedness.season : -1,
        year: positive(preparedness.year),
        spent: positive(preparedness.spent),
        history: Array.isArray(preparedness.history) ? preparedness.history.slice(-8).map(entry => ({
            year: positive(entry?.year), season: int(entry?.season, -1), cost: positive(entry?.cost)
        })) : []
    };
    const losses = value.losses && typeof value.losses === "object" ? value.losses : {};
    base.losses = {
        food: positive(losses.food), wood: positive(losses.wood), stone: positive(losses.stone),
        gold: positive(losses.gold), buildings: positive(losses.buildings), roads: positive(losses.roads),
        ill: positive(losses.ill), injured: positive(losses.injured), herds: positive(losses.herds),
        years: positive(losses.years)
    };
    base.history = Array.isArray(value.history) ? value.history.slice(-HAZARD_LIMITS.maxHistory).map(entry => ({
        year: positive(entry?.year), season: int(entry?.season, -1),
        kind: String(entry?.kind || "hazard").slice(0, 24),
        text: String(entry?.text || "").slice(0, 220)
    })).filter(entry => entry.text) : [];
    base.rare = value.rare && typeof value.rare === "object" ? {
        id: String(value.rare.id || "rare-event").slice(0, 48),
        label: String(value.rare.label || "Rare event").slice(0, 90),
        year: positive(value.rare.year),
        years: positive(value.rare.years),
        chainId: value.rare.chainId ? String(value.rare.chainId).slice(0, 48) : null,
        stage: positive(value.rare.stage),
        endsYear: positive(value.rare.endsYear),
        choice: value.rare.choice ? String(value.rare.choice).slice(0, 32) : null,
        resolved: Boolean(value.rare.resolved),
        outcome: String(value.rare.outcome || "").slice(0, 140),
        lastYear: positive(value.rare.lastYear)
    } : null;
    return base;
}

function normalizeActive(entry) {
    if (!entry || typeof entry !== "object") return null;
    const mechanic = String(entry.mechanic || "");
    if (!HAZARD_MECHANICS.includes(mechanic)) return null;
    const row = HAZARD_CATALOG.find(item => item.mechanic === mechanic);
    return {
        id: String(entry.id || row?.id || mechanic).slice(0, 48),
        mechanic,
        label: String(entry.label || row?.label || mechanic).slice(0, 80),
        category: String(entry.category || row?.category || "weather").slice(0, 24),
        spec: String(entry.spec || row?.spec || "").slice(0, 16),
        severity: clamp01(entry.severity),
        startedYear: positive(entry.startedYear),
        effects: {}
    };
}

function normalizeModifiers(value) {
    const base = emptyModifiers();
    if (!value || typeof value !== "object") return base;
    for (const key of Object.keys(base)) base[key] = clamp01(value[key]);
    return base;
}

function normalizeChronic(value) {
    const base = emptyChronic();
    if (!value || typeof value !== "object") return base;
    base.droughtYears = Math.min(60, positive(value.droughtYears));
    base.droughtLevel = clamp01(value.droughtLevel);
    base.plagueSpread = Array.isArray(value.plagueSpread) ? value.plagueSpread.slice(0, HAZARD_LIMITS.maxTradePartners).map(name => String(name).slice(0, 60)) : [];
    base.epizooticRegions = Array.isArray(value.epizooticRegions) ? value.epizooticRegions.slice(0, HAZARD_LIMITS.maxZones).map(name => String(name).slice(0, 60)) : [];
    base.wildfireZones = Array.isArray(value.wildfireZones) ? value.wildfireZones.slice(-HAZARD_LIMITS.maxZones).map(zone => ({
        x: int(zone?.x), y: int(zone?.y), year: positive(zone?.year)
    })) : [];
    base.floodScars = positive(value.floodScars);
    base.volcanicYears = Math.min(40, positive(value.volcanicYears));
    base.climateDrift = Math.max(-20, Math.min(20, int(value.climateDrift)));
    base.economicDrag = clamp01(value.economicDrag);
    base.burntTiles = Math.min(4096, positive(value.burntTiles));
    base.lostGround = Math.min(4096, positive(value.lostGround));
    base.terrainTiles = Math.min(4096, positive(value.terrainTiles));
    base.nodesLost = Math.min(4096, positive(value.nodesLost));
    base.roadsCut = Math.min(4096, positive(value.roadsCut));
    return base;
}

function normalizeMagic(value) {
    const base = emptyMagic();
    if (!value || typeof value !== "object") return base;
    for (const key of ["corruption", "fog", "cursed", "unnaturalWeather", "magicDisease", "animalShift", "forbidden", "wards"]) {
        base[key] = clamp01(value[key]);
    }
    base.rareYears = Math.min(80, positive(value.rareYears));
    if (value.lastRare && typeof value.lastRare === "object") {
        base.lastRare = {
            id: String(value.lastRare.id || "rare-event").slice(0, 48),
            label: String(value.lastRare.label || "Rare event").slice(0, 90),
            year: positive(value.lastRare.year)
        };
    }
    return base;
}

function normalizeMitigation(value) {
    const base = emptyMitigation();
    if (!value || typeof value !== "object") return base;
    for (const key of Object.keys(base)) base[key] = clamp01(value[key]);
    return base;
}

export function validateEnvironmentalHazardState(value) {
    const stateValue = normalizeEnvironmentalHazardState(value);
    return {
        ok: true,
        active: stateValue.active.length,
        history: stateValue.history.length,
        version: stateValue.version
    };
}

function isBuilding(entity) {
    if (!entity || entity.dead) return false;
    try { return typeof entity.isBuilding === "function" && entity.isBuilding(); } catch { return false; }
}

function footprintContains(entity, x, y) {
    const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
    const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
    const halfW = base.w * scale / 2, halfH = base.h * scale / 2;
    const centerX = Number(entity.x) + 0.5, centerY = Number(entity.y) + 0.5;
    return x + 0.5 >= centerX - halfW && x + 0.5 < centerX + halfW
        && y + 0.5 >= centerY - halfH && y + 0.5 < centerY + halfH;
}

function countBuildings(type) {
    let count = 0;
    for (const entity of state.entities || []) {
        if (isBuilding(entity) && entity.type === type) count++;
    }
    return count;
}

/** Cut roads actually crossed by a converted hazard area. */
function cutHazardRoads(entry, marks, radius = 0) {
    let cut = 0;
    const list = Array.isArray(marks) ? marks : [];
    for (const mark of list) {
        const mx = int(mark?.x), my = int(mark?.y);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tx = mx + dx, ty = my + dy;
                if (!getRoadAt(tx, ty)) continue;
                const result = destroyRoad(tx, ty);
                if (result.ok) cut++;
            }
        }
    }
    if (cut && entry?.chronic) entry.chronic.roadsCut = Math.min(4096, positive(entry.chronic.roadsCut) + cut);
    return cut;
}

// Old 3.39 saves stored a scar but no capacity delta. Their roads were not cut
// by the old code, so the migration cuts them once from the saved marks.
function restoreHazardRoadCuts(entry) {
    const marks = [];
    for (const kind of ["lava", "flooded", "burnt"]) {
        for (const mark of entry?.scars?.[kind] || []) marks.push(mark);
    }
    return cutHazardRoads(entry, marks, 0);
}

/**
 * Protection that actually exists in the realm. Every value is read from a real
 * building, road, store or civic score; nothing is granted by naming a policy.
 */
export function getHazardMitigation() {
    const mitigation = emptyMitigation();
    const response = normalizeHazardResponse(state.environmentalHazards?.response);
    mitigation.well = clamp01((countBuildings(TYPE.WELL) + countBuildings(TYPE.BATHHOUSE) * 0.5) / 3);
    mitigation.irrigation = clamp01(countBuildings(TYPE.MILL) / 2 * 0.8 + countBuildings(TYPE.FARM) * 0.02);
    mitigation.dam = clamp01(countBuildings(TYPE.DAM) / 2 * 0.8 + countBuildings(TYPE.WALL) / 12);
    mitigation.avalanche = clamp01(countBuildings(TYPE.AVALANCHE_BARRIER) / 2 * 0.8
        + countBuildings(TYPE.FORESTER) / 4 * 0.35 + countBuildings(TYPE.WALL) / 24);
    mitigation.firebreak = clamp01(countBuildings(TYPE.FIREBREAK) / 2 * 0.8);
    mitigation.drainage = clamp01(countBuildings(TYPE.DRAINAGE) / 2 * 0.65
        + (Number(state.health?.sanitation?.score) || 0) / 100 * 0.5);
    const roads = state.roads?.tiles ? Object.keys(state.roads.tiles).length : 0;
    mitigation.roads = clamp01(roads / 40);
    mitigation.warehouse = clamp01((countBuildings(TYPE.WAREHOUSE) + countBuildings(TYPE.GRANARY) * 1.2
        + countBuildings(TYPE.MARKET) * 0.25) / 2.2);
    mitigation.medical = clamp01((countBuildings(TYPE.CLINIC) * 0.5 + countBuildings(TYPE.QUARANTINE) * 0.6
        + (Number(state.health?.healers?.length) || 0) * 0.25
        + (Number(state.health?.medicine) || 0) / 40 + response.crews.medical * 0.25) / 2);
    mitigation.clothing = clamp01(countBuildings(TYPE.BATHHOUSE) / 2 * 0.35
        + countBuildings(TYPE.WEATHER_HOUSE) * 0.35
        + (state.entities || []).filter(entity => isBuilding(entity) && (entity.insulated || entity.winterised || entity.heated)).length / 8);
    mitigation.research = clamp01(countBuildings(TYPE.SCHOOL) / 2 * 0.6 + countBuildings(TYPE.SCRIPTORIUM) * 0.4
        + (Number(state.research?.completed?.length) || 0) / 10);
    mitigation.units = clamp01(countBuildings(TYPE.BARRACKS) / 2 * 0.45 + countBuildings(TYPE.SMITHY) * 0.3
        + (response.crews.fire + response.crews.rescue + response.crews.medical + response.crews.equipment + response.crews.veterans) / 10);
    mitigation.siting = clamp01(countBuildings(TYPE.KEEP) > 0 ? 0.45 : 0);
    mitigation.wards = clamp01(countBuildings(TYPE.WARD) / 2 * 0.8 + response.crews.veterans * 0.05);
    const preparedness = state.environmentalHazards?.preparedness;
    const prepared = preparedness && preparedness.season === state.seasonIndex && preparedness.year === state.year
        ? clamp01(Number(preparedness.spent) / 40) : 0;
    mitigation.readiness = clamp01(prepared + planReadiness(state.environmentalHazards));
    for (const [spec, field] of Object.entries(HAZARD_WORK_FIELD)) {
        if (isHazardProofNeutralized(spec)) mitigation[field] = 0;
    }
    // A cleared firebreak belt is a new work, not a missing baseline work. Keep
    // it out of the average until the realm actually builds one, so a realm
    // without firebreaks keeps the exact pre-3.40 readiness and hazard pressure.
    const values = Object.entries(mitigation)
        .filter(([key, value]) => key !== "score" && key !== "readiness" && (key !== "firebreak" || value > 0))
        .map(([, value]) => value);
    mitigation.score = clamp01((values.reduce((sum, value) => sum + value, 0) / values.length) * 0.72 + mitigation.readiness * 0.28);
    return mitigation;
}

/**
 * Targeted relief from real works. The readiness score is a general dampener,
 * but a well, an irrigated field, a drained lane, built roads and insulated
 * clothing must also change their own path. `applyHazard` multiplies these
 * factors into the exact risk/loss calculation; a calm realm with none of the
 * works returns exactly 1 through every entry.
 */
export function getHazardExposureRelief(mechanic, mitigation = getHazardMitigation(), savedModifiers = null) {
    const m = normalizeMitigation(mitigation);
    // The saved modifier block is the hazard layer's own record. Use its care
    // and clothing values as a floor so older saves and direct calls still
    // fall back to the live protection survey.
    const clothing = isHazardProofNeutralized("effect:clothing")
        ? 0 : Math.max(m.clothing, clamp01(savedModifiers?.clothing));
    const medical = isHazardProofNeutralized("effect:medical")
        ? 0 : Math.max(m.medical, clamp01(savedModifiers?.medical));
    const coldOrHeat = [
        "hazard:cold", "hazard:frost", "hazard:snowstorm", "hazard:frostbite",
        "hazard:heat", "hazard:heatwave", "hazard:heat-illness", "hazard:swing"
    ].includes(mechanic);
    const waterborne = [
        "hazard:water-disease", "hazard:parasite", "hazard:parasite-disease",
        "hazard:hygiene-disease", "hazard:vector-disease", "hazard:spoiled-food"
    ].includes(mechanic);
    const drought = mechanic === "hazard:drought";
    const flood = mechanic === "hazard:flood";
    return {
        illness: clamp01(1 - clothing * (coldOrHeat ? 0.28 : 0.06) - medical * 0.05),
        outbreak: clamp01(1 - medical * 0.22 - m.well * 0.15 - (waterborne ? m.drainage * 0.12 : 0)),
        foodLoss: clamp01(1 - m.warehouse * 0.22),
        waterLoss: clamp01(1 - m.well * 0.30 - m.warehouse * 0.18),
        field: clamp01(1 - (drought ? m.irrigation * 0.35 : 0) - (flood ? m.drainage * 0.30 : 0)),
        trade: clamp01(1 - m.roads * 0.20),
        movement: clamp01(1 - m.roads * 0.15)
    };
}

/**
 * The terrain-conversion shield for one hazard. This is the small, testable
 * bridge between the real protection works and the saved scar layer: when the
 * deterministic roll is below the shield, the hazard still costs stores and
 * fields but does not leave a new permanent tile mark.
 */
export function getHazardTerrainShield(kind) {
    const mitigation = getHazardMitigation();
    if (kind === "wildfire") {
        return clamp01(mitigation.firebreak * 0.68 + mitigation.research * 0.12);
    }
    if (kind === "flood") {
        return clamp01(mitigation.dam * 0.35 + mitigation.drainage * 0.30);
    }
    if (kind === "lava") {
        return clamp01(mitigation.dam * 0.25 + mitigation.avalanche * 0.22 + mitigation.siting * 0.18);
    }
    if (kind === "lost") {
        return clamp01(mitigation.siting * 0.18 + mitigation.avalanche * 0.12);
    }
    return 0;
}

/** True when the protection does not turn the conversion aside. */
export function shouldHazardTerrainConvert(kind, roll = hazardRoll(kind + ":terrain")) {
    return Number(roll) >= getHazardTerrainShield(kind);
}

/**
 * The climate profile for this season. Pure and bounded: it reads the climate,
 * the season, the live weather and the survival works, never the tile grid.
 */
export function getHazardProfile() {
    const climate = state.worldOptions?.climate || "temperate";
    const season = Number.isInteger(state.seasonIndex) ? state.seasonIndex : 0;
    const rows = hazardRowsForClimate(climate);
    const mitigation = getHazardMitigation();
    const bundle = Object.values(REGIONAL_BUNDLES).find(item => item.climate === climate) || null;
    const bundleRow = bundle
        ? HAZARD_CATALOG.find(row => row.mechanic.startsWith("bundle:") && row.climates.includes(climate))
        : null;
    const bundleExposure = bundleRow && isHazardProofNeutralized(bundleRow.spec)
        ? 1 : Math.max(1, Number(bundle?.exposure) || 1);
    const seasonal = !isHazardProofNeutralized("chronic:seasonal");
    const bundleHazards = new Set(bundle?.hazards || []);
    const drift = getClimateDrift();
    const hazards = [];
    for (const row of rows) {
        // Only concrete dangers roll here. Regional bundles, works, effects and
        // chronic rows are modifiers, not events; arcane rows do roll because
        // their burden is felt the same season it appears.
        if (!row.mechanic.startsWith("hazard:") && !row.mechanic.startsWith("magic:")) continue;
        if (seasonal && row.seasons && !row.seasons.includes(season)) continue;
        const key = row.mechanic.slice("hazard:".length);
        let weight = row.severity * 0.55;
        if (row.climates.length <= 6) weight += 0.12; // a climate-specific danger is its signature
        if (state.weather === "storm" && ["storm", "wind", "rain", "flood"].includes(key)) weight += 0.16;
        if (state.weather === "snow" && ["snowstorm", "cold", "frost", "avalanche"].includes(key)) weight += 0.16;
        if (state.weather === "rain" && ["rain", "flood", "water-disease", "landslide"].includes(key)) weight += 0.1;
        if (state.weather === "clear" && ["heat", "heatwave", "drought", "sandstorm"].includes(key)) weight += 0.08;
        if (key === "deficiency" && (Number(state.resources?.food) || 0) < 40) weight += 0.2;
        if (key === "spoiled-food" && (Number(state.resources?.food) || 0) > 160) weight += 0.06;
        // The regional bundle is more than a label: its signature dangers are
        // the ones this climate actually exposes, so they carry its exposure.
        if (bundleHazards.has(key)) weight *= bundleExposure;
        weight -= mitigation.score * 0.22;
        // A warmer, drier baseline raises heat/drought/fire and lowers cold;
        // a colder, wetter drift does the reverse. This also feeds the world's
        // temperature and moisture queries through climate-drift.js.
        if (["heat", "heatwave", "drought", "sandstorm", "wildfire", "heat-illness"].includes(key)) {
            weight += drift * 0.006;
        }
        if (["cold", "frost", "snowstorm", "avalanche", "frostbite", "extreme-cold"].includes(key)) {
            weight -= drift * 0.006;
        }
        const arcane = state.environmentalHazards?.magic || {};
        if (row.magical) weight -= clamp01(arcane.wards) * 0.12;
        if (["storm", "wind", "rain", "flood", "snowstorm"].includes(key)) {
            weight += clamp01(arcane.unnaturalWeather) * 0.10;
        }
        if (["predator", "epizootic", "parasite", "vector-disease"].includes(key)) {
            weight += clamp01(arcane.animalShift) * 0.10;
        }
        if (weight > 0.02) hazards.push({ ...row, weight: clamp01(weight) });
    }
    hazards.sort((a, b) => b.weight - a.weight || a.spec.localeCompare(b.spec));
    return {
        climate,
        season,
        seasonName: SEASON_NAMES[season] || "spring",
        weather: state.weather || "clear",
        hazards: hazards.slice(0, HAZARD_LIMITS.maxActive),
        mitigation,
        bundle,
        exposure: Math.min(1.3, (1 - mitigation.score * 0.5) * bundleExposure)
    };
}

function residents() {
    return (state.entities || []).filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
}

// The crown and the noble households are not sent into the storm, the mine or
// the flooded field: they have shelter, stores and care. Hazard casualties are
// drawn from the working population, so a bad season cannot silently extinguish
// a noble house while its manor stands untouched.
function shieldedResidentIds() {
    const ids = new Set();
    for (const house of state.nobility?.houses || []) {
        for (const member of house?.members || []) ids.add(String(member));
    }
    for (const key of ["king", "consort", "heir"]) {
        const id = state.royal?.[key + "Id"];
        if (id) ids.add(String(id));
    }
    return ids;
}

// Field, forest and mine work takes the weather first. Most hazard casualties
// are drawn from exposed crews; a minority still falls on the household, so
// shelter, medicine and a warm hearth keep mattering.
const EXPOSED_HAZARD_WORKPLACES = new Set([
    TYPE.FARM, TYPE.LUMBER, TYPE.QUARRY, TYPE.GOLDMINE, TYPE.SAWMILL, TYPE.FORESTER, TYPE.MASON
]);

function harmResident({ kind = "illness", disease = "environmental illness", severity = 1 } = {}) {
    const shielded = shieldedResidentIds();
    const people = residents().filter(person => !(Number(person.illnessUntilTick) > state.tick)
        && !shielded.has(String(person.personId || person.id)));
    if (!people.length) return null;
    const exposed = people.filter(person => {
        const workplace = person.workplace;
        return workplace && !workplace.dead && EXPOSED_HAZARD_WORKPLACES.has(workplace.type);
    });
    const exposureRoll = hash32(Number(state.worldSeed) || 1, 0x48455850, state.tick, state.year) % 100;
    const pool = exposed.length && exposureRoll < 65 ? exposed : people;
    const index = hash32(Number(state.worldSeed) || 1, 0x4841524d, pool.length, state.year) % pool.length;
    const victim = pool[index];
    const ticks = 40 + Math.round(severity * 40);
    victim.illnessStartedTick = state.tick;
    victim.illnessUntilTick = Math.max(Number(victim.illnessUntilTick) || 0, state.tick + ticks);
    // Exposure costs working days, not a hidden mortality roll. The health and
    // mortality systems still own death: an outbreak they declare keeps its
    // full severity, while a wet, cold or dusty season only lays people up.
    victim.illnessSeverity = Math.max(1, Math.min(3, Math.round(severity * 2)));
    victim.infectionSource = String(kind).slice(0, 32);
    victim.hp = Math.max(1, (Number(victim.hp) || 1) - (kind === "injury" ? 3 : 1));
    return { name: victim.person?.name || "a resident", disease, ticks };
}

function ensureHazardState() {
    if (!state.environmentalHazards || typeof state.environmentalHazards !== "object") {
        state.environmentalHazards = createEnvironmentalHazardState();
    }
    return state.environmentalHazards;
}

function recordLoss(entry, kind, amount) {
    if (isHazardProofNeutralized("effect:losses")) return 0;
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const value = Math.max(0, Math.round(amount));
    entry.losses[kind] = positive(entry.losses[kind]) + value;
    return value;
}

// Hazard losses are physical changes to the royal food store. Every one must
// reach the same goods book as population consumption, otherwise the movement
// audit reports a real leak after a flood or drought. The bounded amounts are
// already clamped to the available reserve by the callers.
function bookHazardFoodLoss(loss, cause, key) {
    const amount = Math.max(0, Number(loss) || 0);
    if (amount <= 0) return 0;
    recordResourceMovement("food", -amount, cause, {
        from: { kind: "realm", id: "royal-stores" },
        to: { kind: "hazard", id: cause },
        key
    });
    addResource("food", -amount);
    return amount;
}

function addHistory(entry, kind, text) {
    entry.history.push({ year: state.year, season: state.seasonIndex, kind, text: String(text).slice(0, 220) });
    if (entry.history.length > HAZARD_LIMITS.maxHistory) entry.history.splice(0, entry.history.length - HAZARD_LIMITS.maxHistory);
}

function damageFields(entry, amount, reason) {
    let damaged = 0;
    for (const entity of state.entities || []) {
        if (damaged >= HAZARD_LIMITS.maxFieldsPerPass) break;
        if (!entity || entity.dead || entity.type !== TYPE.FARM || !entity.field) continue;
        const field = entity.field;
        const growth = Number(field.growth) || 0;
        if (growth <= 0 && field.stage === "fallow") continue;
        field.growth = Math.max(0, growth - growth * amount);
        field.fertility = Math.max(0, (Number(field.fertility) || 0) - amount * 6);
        field.lastReason = String(reason).slice(0, 40);
        damaged++;
    }
    return damaged;
}

// Civic anchors whose loss would break another system's invariants (a court
// holds the case roll, a keep or wonder the settlement) are never hazard
// targets. The same hazard always picks the same victim for a given seed.
const HAZARD_PROTECTED_TYPES = new Set([TYPE.KEEP, TYPE.WONDER, TYPE.COURT, TYPE.PRISON]);

function destroyHazardTarget(mechanic) {
    const candidates = (state.entities || []).filter(entity => isBuilding(entity)
        && !entity.dead && !HAZARD_PROTECTED_TYPES.has(entity.type));
    const building = candidates.length
        ? candidates[Math.floor(hazardRoll(mechanic + ":destroy") * candidates.length)]
        : null;
    if (building) {
        building.dead = true;
        building.destroyedBy = "hazard-" + mechanic;
        building.destroyedYear = Math.max(1, Number(state.year) || 1);
        for (const villager of state.entities || []) {
            if (villager.workplace !== building) continue;
            villager.workplace = null;
            if (villager.job === "builder") villager.job = "idle";
        }
        if (state.selectedBuildingId === building.id) state.selectedBuildingId = null;
        state.buildingCollisionVersion = (Number(state.buildingCollisionVersion) || 0) + 1;
        if (state.city) state.city.constructionVersion = (Number(state.city.constructionVersion) || 0) + 1;
        return { kind: "building", x: building.x, y: building.y };
    }
    const roadTile = state.roads?.tiles ? Object.keys(state.roads.tiles)[0] : null;
    if (roadTile) {
        const [x, y] = roadTile.split(":").map(Number);
        if (getRoadAt(x, y) && destroyRoad(x, y).ok) return { kind: "road", x, y };
    }
    return null;
}

function applyHazard(entry, row, severity, budget = {}) {
    const effects = { ...(HAZARD_EFFECTS[row.mechanic] || {}) };
    // The proof seam neutralizes the whole event, or one effect row that shares
    // its primitive, before any branch can change world state.
    if (isHazardProofNeutralized(row.spec)) {
        for (const key of Object.keys(effects)) delete effects[key];
    }
    for (const [spec, key] of Object.entries(HAZARD_EFFECT_PRIMITIVE)) {
        if (isHazardProofNeutralized(spec)) delete effects[key];
    }
    entry.response = normalizeHazardResponse(entry.response);
    const response = entry.response;
    const mitigation = entry.mitigation;
    const exposureRelief = getHazardExposureRelief(row.mechanic, mitigation, entry.modifiers);
    const crews = response.crews;
    const resistance = 1 - (mitigation.score * 0.45 + (row.category === "disease" ? mitigation.medical * 0.25 : 0)
        + crews.veterans * 0.04 + crews.equipment * 0.02);
    const scale = severity * Math.max(0.25, resistance);
    const evacuated = hazardEvacuationActive(entry);
    const quarantined = isHazardQuarantined(entry);
    const reliefReady = response.relief > 0;
    let text = null;

    if (effects.outbreak && !budget.outbreak
        && hazardRoll(row.mechanic + ":outbreak") < effects.outbreak * scale * (quarantined ? 0.45 : 1) * exposureRelief.outbreak
        && entry.diseases.length < HAZARD_LIMITS.maxDiseases) {
        budget.outbreak = true;
        const label = row.label + " in the realm";
        // Hazards poison the ground and the water; they do not run a second
        // outbreak engine beside the health system. The real sanitation score
        // drops, which is the input the health system already uses to declare
        // an outbreak, and the regional disease is recorded for the panel.
        if (state.health?.sanitation) {
            state.health.sanitation.score = Math.max(
                HAZARD_LIMITS.sanitationFloor,
                (Number(state.health.sanitation.score) || 0) - 6 * scale
            );
        }
        entry.diseases = entry.diseases.filter(disease => disease.id !== row.id);
        registerHazardDisease(entry, createDiseaseRecord(row.mechanic, label, severity, "hazard"));
        text = "REGIONAL DISEASE PRESSURE · " + row.label.toUpperCase();
    }

    if (effects.illness && !budget.casualty) {
        const risk = effects.illness * scale * (1 + entry.modifiers.diseaseRisk * 0.5)
            * (evacuated ? 0.45 : 1) * (1 - crews.medical * 0.07) * exposureRelief.illness;
        if (hazardRoll(row.mechanic + ":ill") < risk) {
            budget.casualty = true;
            const victim = harmResident({ kind: "illness", disease: row.label, severity });
            if (victim) {
                recordLoss(entry, "ill", 1);
                text = (text ? text + " · " : "") + (victim.name.toUpperCase() + " FALLS ILL");
            }
        }
    }
    if (effects.injury && !budget.casualty) {
        const risk = effects.injury * scale * (1 - entry.modifiers.resistance * 0.4)
            * (evacuated ? 0.42 : 1) * (1 - crews.rescue * 0.06);
        if (hazardRoll(row.mechanic + ":injury") < risk) {
            budget.casualty = true;
            const victim = harmResident({ kind: "injury", disease: row.label, severity });
            if (victim) {
                recordLoss(entry, "injured", 1);
                text = (text ? text + " · " : "") + (victim.name.toUpperCase() + " IS HURT");
            }
        }
    }
    if (effects.food) {
        const room = Math.max(0, HAZARD_LIMITS.foodPerSeason - budget.food);
        const surplus = Math.max(0, (Number(state.resources?.food) || 0) - HAZARD_LIMITS.foodReserve);
        let loss = Math.min(surplus, effects.food * scale, room) * exposureRelief.foodLoss;
        if (loss > 0 && response.stockpile > 0 && !budget.stockpile) {
            budget.stockpile = true;
            response.stockpile -= 1;
            loss *= 0.55;
        }
        loss = recordLoss(entry, "food", loss);
        budget.food += loss;
        if (loss > 0) {
            bookHazardFoodLoss(loss, "hazard-food-loss",
                "hazard-food:" + row.mechanic + ":" + state.year + ":" + state.seasonIndex);
            text = (text ? text + " · " : "") + ("FOOD -" + loss);
        }
    }
    if (effects.wood) {
        const loss = recordLoss(entry, "wood", Math.min(Number(state.resources?.wood) || 0, effects.wood * scale));
        if (loss > 0) { addResource("wood", -loss); text = (text ? text + " · " : "") + ("WOOD -" + loss); }
    }
    if (effects.stone) {
        const loss = recordLoss(entry, "stone", Math.min(Number(state.resources?.stone) || 0, effects.stone * scale));
        if (loss > 0) { addResource("stone", -loss); text = (text ? text + " · " : "") + ("STONE -" + loss); }
    }
    if (effects.water) {
        // The realm stores food, not water. Scarcity shows as spoilage and lost
        // carrying capacity, which is the resource the economy already moves.
        const room = Math.max(0, HAZARD_LIMITS.foodPerSeason - budget.food);
        const surplus = Math.max(0, (Number(state.resources?.food) || 0) - HAZARD_LIMITS.foodReserve);
        let loss = Math.min(surplus, Math.max(1, effects.water * scale * 0.5), room)
            * exposureRelief.waterLoss;
        if (loss > 0 && response.stockpile > 0 && !budget.stockpile) {
            budget.stockpile = true;
            response.stockpile -= 1;
            loss *= 0.6;
        }
        loss = recordLoss(entry, "food", loss);
        budget.food += loss;
        if (loss > 0) {
            bookHazardFoodLoss(loss, "hazard-water-shortage",
                "hazard-water:" + row.mechanic + ":" + state.year + ":" + state.seasonIndex);
            text = (text ? text + " · " : "") + ("WATER SHORT · FOOD -" + loss);
        }
    }
    if (effects.work) {
        entry.modifiers.work = clamp01(entry.modifiers.work + effects.work * scale);
        text = (text ? text + " · " : "") + ("WORK OUTPUT -" + Math.round(effects.work * scale * 100) + "%");
    }
    if (effects.odd) {
        // Poisoned harvests and strange weather leave people confused and
        // unsteady. This is a real work/illness drag, not a flavour field.
        entry.modifiers.work = clamp01(entry.modifiers.work + effects.odd * scale * 0.4);
        entry.modifiers.diseaseRisk = clamp01(entry.modifiers.diseaseRisk + effects.odd * 0.12);
        text = (text ? text + " · " : "") + "STRANGE AILMENT · WORK SLOWED";
    }
    if (effects.morale && severity > 0.55) {
        // Only a severe season reaches the mood of the realm, and never more
        // than one point a season: a hazard is a hardship, not a morale drain.
        const loss = Math.min(Math.max(0, HAZARD_LIMITS.moralePerSeason - budget.morale), Math.max(1, Math.round(effects.morale * scale * 0.5)));
        if (loss > 0) {
            budget.morale += loss;
            state.morale = Math.max(0, (Number(state.morale) || 0) - loss);
            entry.modifiers.morale = clamp01(entry.modifiers.morale + effects.morale * 0.05 * scale);
            text = (text ? text + " · " : "") + ("MORALE -" + loss);
        }
    }
    if (effects.field) {
        const firebreakRelief = 1 - Math.min(0.5, countBuildings(TYPE.FIREBREAK) * 0.14);
        const reliefRelief = reliefReady ? 0.55 : 1;
        const damaged = damageFields(entry,
            effects.field * scale * firebreakRelief * reliefRelief * exposureRelief.field, row.label);
        if (damaged > 0) {
            if (reliefReady && !budget.relief) {
                budget.relief = true;
                response.relief -= 1;
                text = (text ? text + " · " : "") + "RELIEF CREWS DEPLOYED";
            }
            text = (text ? text + " · " : "") + (damaged + " FIELD" + (damaged === 1 ? "" : "S") + " DAMAGED");
        }
    }
    if (effects.pasture) {
        entry.modifiers.pasture = clamp01(entry.modifiers.pasture + effects.pasture * scale);
        text = (text ? text + " · " : "") + "PASTURE FAILS";
    }
    if (effects.trade) {
        const loss = recordLoss(entry, "gold", Math.min(Number(state.resources?.gold) || 0,
            Math.max(1, Math.round(effects.trade * scale * 4 * exposureRelief.trade))));
        entry.modifiers.trade = clamp01(entry.modifiers.trade + effects.trade * scale * exposureRelief.trade);
        if (loss > 0) { addResource("gold", -loss); text = (text ? text + " · " : "") + ("TRADE -" + loss + "G"); }
    }
    if (effects.herd) {
        entry.chronic.epizooticRegions = [...new Set([...entry.chronic.epizooticRegions, "royal pasture"])].slice(0, HAZARD_LIMITS.maxZones);
        // An animal plague reaches the real herd model, not only the region list
        // in the panel. The cap keeps this to one bounded pass over the saved
        // herd list; no map or frame work is added.
        const cull = damageHazardHerds(effects.herd * scale * 0.35, row.mechanic);
        if (cull.affected > 0) {
            recordLoss(entry, "herds", cull.affected);
            text = (text ? text + " · " : "") + "HERDS AFFECTED · " + cull.affected +
                " HERD" + (cull.affected === 1 ? "" : "S") + " · " + cull.lost + " ANIMALS LOST";
        } else {
            text = (text ? text + " · " : "") + "HERDS AFFECTED";
        }
    }
    if (effects.ash) {
        entry.chronic.volcanicYears = Math.max(entry.chronic.volcanicYears, 3);
        entry.modifiers.diseaseRisk = clamp01(entry.modifiers.diseaseRisk + effects.ash * 0.2);
        text = (text ? text + " · " : "") + "ASH BLANKETS THE REGION";
    }
    if (effects.destroy && !budget.destroyed && severity > 0.45
        && hazardRoll(row.mechanic + ":destroy") < effects.destroy * scale * 0.6
            * (1 - mitigation.dam * 0.4 - mitigation.avalanche * 0.2
                - crews.rescue * 0.035 - crews.equipment * 0.025 - (evacuated ? 0.2 : 0)
                - (reliefReady ? 0.08 : 0))) {
        budget.destroyed = true;
        const destroyed = destroyHazardTarget(row.mechanic);
        if (destroyed) {
            recordLoss(entry, destroyed.kind === "road" ? "roads" : "buildings", 1);
            const claim = destroyed.kind === "building" ? payHazardInsurance(entry, 12) : 0;
            text = (text ? text + " · " : "") + (destroyed.kind === "road" ? "A ROAD IS LOST" : "A STRUCTURE IS LOST")
                + (claim ? " · INSURANCE +" + claim + "G" : "");
        }
    }
    if (effects.permanent && hazardRoll(row.mechanic + ":permanent") < effects.permanent) {
        const W = Math.max(1, Number(state.worldW) || 1), H = Math.max(1, Number(state.worldH) || 1);
        const x = Math.floor(hazardRoll(row.mechanic + ":lost-x") * W);
        const y = Math.floor(hazardRoll(row.mechanic + ":lost-y") * H);
        recordLostGround(entry, x, y);
        entry.chronic.lostGround = Math.min(4096, positive(entry.chronic.lostGround) + 1);
        text = (text ? text + " · " : "") + "GROUND IS LOST FOR GOOD";
    }
    return text;
}

function applyMagic(row, severity, entry = ensureHazardState()) {
    if (isHazardProofNeutralized(row.spec)) return;
    const magic = entry.magic;
    const keep = (state.entities || []).find(entity => !entity.dead && entity.type === TYPE.KEEP);
    const W = Math.max(1, Number(state.worldW) || 1), H = Math.max(1, Number(state.worldH) || 1);
    const scarX = keep ? Math.floor(keep.x) + 2 : Math.floor(hazardRoll(row.mechanic + ":scar-x") * W);
    const scarY = keep ? Math.floor(keep.y) + 1 : Math.floor(hazardRoll(row.mechanic + ":scar-y") * H);
    const drifts = {
        "magic:burden": () => { magic.fog = clamp01(magic.fog + 0.08 * severity); magic.cursed = clamp01(magic.cursed + 0.06 * severity); },
        "magic:corruption": () => { magic.corruption = clamp01(magic.corruption + 0.12 * severity); addHazardScar(entry, "corruption", scarX, scarY); },
        "magic:cursed": () => { magic.cursed = clamp01(magic.cursed + 0.1 * severity); },
        "magic:fog": () => { magic.fog = clamp01(magic.fog + 0.14 * severity); },
        "magic:unnatural-weather": () => { magic.unnaturalWeather = clamp01(magic.unnaturalWeather + 0.12 * severity); },
        "magic:disease": () => { magic.magicDisease = clamp01(magic.magicDisease + 0.1 * severity); },
        "magic:animal-shift": () => { magic.animalShift = clamp01(magic.animalShift + 0.1 * severity); },
        "magic:forbidden": () => { magic.forbidden = clamp01(magic.forbidden + 0.08 * severity); },
        "magic:spread": () => { magic.corruption = clamp01(magic.corruption + 0.2 * severity); addHazardScar(entry, "corruption", scarX, scarY); },
        "magic:wards": () => { magic.wards = clamp01(magic.wards + 0.15 * severity); },
        "magic:rare": () => { magic.rareYears = Math.min(80, magic.rareYears + 8); }
    };
    const apply = drifts[row.mechanic];
    if (apply) apply();
}

/**
 * One bounded seasonal pass. Runs when the season changes (four times a year)
 * and only rolls hazards the current climate, season and weather can produce.
 */
export function updateEnvironmentalHazards({ force = false } = {}) {
    const entry = ensureHazardState();
    if (!force && entry.season === state.seasonIndex && entry.year === state.year) {
        return { skipped: true, active: entry.active, events: [] };
    }
    entry.season = state.seasonIndex;
    entry.year = state.year;
    entry.response = normalizeHazardResponse(entry.response);
    entry.partners = normalizeHazardPartners(entry.partners);
    entry.scars = normalizeHazardScars(entry.scars);
    entry.lastUpdateTick = state.tick;
    invalidateHazardModifierCache();
    entry.mitigation = getHazardMitigation();
    entry.modifiers = emptyModifiers();
    entry.warnings = [];
    entry.active = [];

    const profile = getHazardProfile();
    const events = [];
    const budget = { casualty: false, outbreak: false, destroyed: false, food: 0, morale: 0 };
    let applied = 0;
    for (const row of profile.hazards) {
        if (applied >= HAZARD_LIMITS.maxApplied) break;
        // A danger on the climate's list is a possibility, not an appointment.
        // Its own roll decides whether this season is the one it strikes.
        if (hazardRoll(row.mechanic + ":occur") > row.weight) continue;
        const severity = clamp01(row.weight * (0.55 + hazardRoll(row.mechanic) * 0.7));
        entry.active.push({
            id: row.id, mechanic: row.mechanic, label: row.label, category: row.category,
            spec: row.spec, severity, startedYear: state.year, effects: HAZARD_EFFECTS[row.mechanic] || {}
        });
        entry.warnings.push(row.label.toUpperCase() + " · " + Math.round(severity * 100) + "%");
        if (row.magical) {
            applyMagic(row, severity, entry);
            events.push(row.label.toUpperCase() + " STIRS");
        } else {
            const text = applyHazard(entry, row, severity, budget);
            if (text) {
                const line = row.label.toUpperCase() + " · " + text;
                addLog(line, row.category === "disease" ? "#c48a8a" : row.category === "geology" ? "#c9a27a" : "#8ab4c9", "hazard");
                events.push(line);
            }
        }
        applied++;
    }

    // The regional bundle is the identity of the climate: when its own danger
    // is not already present, it is named as a standing condition instead of
    // silently disappearing from the panel.
    if (profile.bundle) {
        const bundleRow = HAZARD_CATALOG.find(item => item.mechanic.startsWith("bundle:") && item.climates.includes(profile.climate));
        if (bundleRow && !entry.active.some(hazard => hazard.category === "regional")) {
            entry.active.push({
                id: bundleRow.id, mechanic: bundleRow.mechanic, label: bundleRow.label,
                category: "regional", spec: bundleRow.spec, severity: clamp01(profile.exposure * 0.6),
                startedYear: state.year, effects: {}
            });
        }
    }

    // A climate can name its regional bundle in addition to the rolled hazards;
    // the cap is enforced after both so the panel and the state never exceed it.
    entry.active = entry.active.slice(0, HAZARD_LIMITS.maxActive);

    // Standing modifiers the rolled hazards imply. The regional bundle is the
    // climate's standing identity, not a separate event: counting it here made
    // every climate permanently "hazardous" and shifted the baseline economy
    // even in a quiet season. Only rolled hazards carry a modifier.
    const pressure = entry.active.filter(hazard => hazard.category !== "regional");
    const has = category => pressure.some(hazard => hazard.category === category);
    const total = pressure.reduce((sum, hazard) => sum + hazard.severity, 0) / Math.max(1, pressure.length);
    entry.modifiers.work = clamp01(entry.modifiers.work + total * 0.12);
    entry.modifiers.movement = clamp01((total * 0.3 + (has("geology") ? 0.15 : 0))
        * (1 - entry.mitigation.roads * 0.15));
    entry.modifiers.needs = clamp01(total * 0.35);
    entry.modifiers.diseaseRisk = clamp01(entry.modifiers.diseaseRisk + (has("disease") ? 0.3 : 0.08) + entry.magic.corruption * 0.2);
    entry.modifiers.resistance = clamp01(entry.mitigation.medical * 0.5 + entry.mitigation.clothing * 0.3 + entry.mitigation.units * 0.2);
    entry.modifiers.adaptation = clamp01(entry.mitigation.research * 0.5 + entry.mitigation.siting * 0.5);
    entry.modifiers.medical = entry.mitigation.medical;
    entry.modifiers.extraction = clamp01(total * 0.25);
    entry.modifiers.clothing = entry.mitigation.clothing;
    entry.modifiers.trade = clamp01((entry.modifiers.trade + (has("weather") ? 0.1 : 0))
        * (1 - entry.mitigation.roads * 0.20));
    entry.modifiers.pasture = clamp01(entry.modifiers.pasture + (has("flora") ? 0.15 : 0));
    // Fog closes paths and forbidden growth makes gathering costly. Both are
    // real magic burdens, not panel counters: they enter the shared modifiers
    // the movement and extraction systems already read.
    entry.modifiers.movement = clamp01(entry.modifiers.movement + entry.magic.fog * 0.18);
    entry.modifiers.extraction = clamp01(entry.modifiers.extraction + entry.magic.forbidden * 0.12);

    // A severe season costs real labour: one food unit of lost workdays per
    // point of work penalty above 25%, capped so the store cannot be emptied.
    if (entry.modifiers.work > 0.25) {
        const lost = Math.min(Math.floor((Number(state.resources?.food) || 0) / 10), 2);
        if (lost > 0) {
            recordLoss(entry, "food", lost);
            bookHazardFoodLoss(lost, "hazard-lost-workdays",
                "hazard-workdays:" + state.year + ":" + state.seasonIndex);
            events.push("LOST WORKDAYS · FOOD -" + lost);
        }
    }

    refreshHazardForecast(entry);
    if (events.length) addHistory(entry, "season", events.slice(0, HAZARD_LIMITS.maxEventsPerSeason).join(" · "));
    invalidateHazardModifierCache();
    state.environmentalHazards = entry;
    return { skipped: false, season: entry.season, active: entry.active, events, profile };
}

/**
 * One bounded annual pass for the processes that outlive a season. It reads the
 * year, the counters and the neighbours' names; it never scans the map.
 */
export function updateEnvironmentalHazardYear() {
    const entry = ensureHazardState();
    if (entry.lastYear === state.year) return { skipped: true };
    entry.lastYear = state.year;
    recordLoss(entry, "years", 1);
    entry.response = normalizeHazardResponse(entry.response);
    entry.partners = normalizeHazardPartners(entry.partners);
    entry.scars = normalizeHazardScars(entry.scars);
    const chronic = entry.chronic;
    const magic = entry.magic;
    const mitigation = getHazardMitigation();
    const events = [];
    const drought = entry.active.some(hazard => hazard.mechanic === "hazard:drought");
    const flood = entry.active.some(hazard => hazard.mechanic === "hazard:flood");
    const volcanic = entry.active.some(hazard => hazard.mechanic === "hazard:eruption" || hazard.mechanic === "hazard:lava");
    const wildfire = entry.active.some(hazard => hazard.mechanic === "hazard:heatwave" && state.seasonIndex === 1);

    if (!isHazardProofNeutralized("chronic:drought-years")) {
        chronic.droughtYears = drought ? Math.min(60, chronic.droughtYears + 1) : Math.max(0, chronic.droughtYears - 1);
        chronic.droughtLevel = clamp01(chronic.droughtYears / 6);
        if (chronic.droughtYears >= 2) {
            const loss = Math.min(Number(state.resources?.food) || 0, chronic.droughtYears);
            if (loss > 0) {
                recordLoss(entry, "food", loss);
                bookHazardFoodLoss(loss, "hazard-drought", "hazard-drought:" + state.year);
                events.push("YEAR " + chronic.droughtYears + " OF DROUGHT · FOOD -" + loss);
            }
        }
    }

    // An active outbreak reaches the neighbours the realm actually trades with.
    if (!isHazardProofNeutralized("chronic:plague-trade") && state.health?.outbreakActive) {
        const partners = tradePartners();
        const spread = partners.filter(partner => hazardRoll("plague:" + partner, 0) < 0.5).slice(0, HAZARD_LIMITS.maxTradePartners);
        if (spread.length) {
            chronic.plagueSpread = [...new Set([...chronic.plagueSpread, ...spread])].slice(0, HAZARD_LIMITS.maxTradePartners);
            events.push("THE " + String(state.health.disease || "FEVER").toUpperCase() + " REACHES " + spread.join(", ").toUpperCase());
        }
    } else {
        chronic.plagueSpread = chronic.plagueSpread.slice(-1);
    }

    if (!isHazardProofNeutralized("chronic:epizootic-regions")
        && entry.active.some(hazard => hazard.mechanic === "hazard:epizootic")) {
        const regions = ["royal pasture", ...tradePartners().slice(0, 2)];
        chronic.epizooticRegions = [...new Set([...chronic.epizooticRegions, ...regions])].slice(0, HAZARD_LIMITS.maxZones);
        // A plague that lasts into the next year keeps taking animals from the
        // same real herds. The seasonal event already culls once; this is the
        // bounded year-over-year continuation, capped by the herd model.
        const cull = damageHazardHerds(0.06, "hazard:epizootic:year");
        if (cull.affected > 0) {
            recordLoss(entry, "herds", cull.affected);
            events.push("ANIMAL PLAGUE IN " + regions.join(", ").toUpperCase()
                + " · " + cull.affected + " HERDS · " + cull.lost + " ANIMALS LOST");
        } else {
            events.push("ANIMAL PLAGUE IN " + regions.join(", ").toUpperCase());
        }
    } else {
        chronic.epizooticRegions = chronic.epizooticRegions.slice(-1);
    }

    if (!isHazardProofNeutralized("chronic:wildfire") && wildfire) {
        const W = Number(state.worldW) || 0, H = Number(state.worldH) || 0;
        if (W > 2 && H > 2) {
            if (!shouldHazardTerrainConvert("wildfire")) {
                events.push("FIREBREAKS HOLD THE WOODLAND · NO NEW TILE IS LOST");
            } else {
                const x = hash32(Number(state.worldSeed) || 1, 0x57494c44, state.year, 1) % W;
                const y = hash32(Number(state.worldSeed) || 1, 0x57494c44, state.year, 2) % H;
                chronic.wildfireZones = [...chronic.wildfireZones, { x, y, year: state.year }].slice(-HAZARD_LIMITS.maxZones);
                const burnt = recordWildfireScar(entry, x, y, { spread: (Number(mitigation.firebreak) || 0) > 0 ? 1 : 2 });
                cutHazardRoads(entry, burnt.marks, 0);
                events.push("FIRE SCARS THE WOODLAND AT " + x + "," + y
                    + (burnt.burnt ? " · " + burnt.burnt + " TILES CHANGED" : ""));
            }
        }
    }

    if (!isHazardProofNeutralized("chronic:flood-scars") && flood) {
        damageFields(entry, 0.12 * (1 - mitigation.dam * 0.5), "flood scar");
        const drained = hazardRoll("flood:drainage") < mitigation.drainage * 0.7;
        if (drained || !shouldHazardTerrainConvert("flood")) {
            events.push("DAMS AND DRAINAGE HOLD THE CHANNEL · THE GROUND IS NOT CONVERTED");
        } else {
            chronic.floodScars = Math.min(40, chronic.floodScars + 1);
            const W = Math.max(3, Number(state.worldW) || 3), H = Math.max(3, Number(state.worldH) || 3);
            const x = hash32(Number(state.worldSeed) || 1, 0x464c4f44, state.year, 1) % W;
            const y = hash32(Number(state.worldSeed) || 1, 0x464c4f44, state.year, 2) % H;
            const flooded = recordFloodScar(entry, x, y, { spread: 2 });
            cutHazardRoads(entry, flooded.marks, 1);
            events.push("THE FLOOD CONVERTS " + Math.max(1, flooded.marks.length) + " TILE(S) AT " + x + "," + y
                + " · FIELDS, ROADS AND NODES ARE WASHED OUT");
        }
    } else if (!isHazardProofNeutralized("chronic:flood-scars")) {
        chronic.floodScars = Math.max(0, chronic.floodScars - 1);
    }

    if (!isHazardProofNeutralized("chronic:volcanic-region")) {
        chronic.volcanicYears = volcanic ? 3 : Math.max(0, chronic.volcanicYears - 1);
        if (chronic.volcanicYears > 0 && !volcanic) events.push("ASH STILL LIES ON THE REGION");
    }
    if (!isHazardProofNeutralized("chronic:volcanic-region") && volcanic) {
        if (!shouldHazardTerrainConvert("lava")) {
            events.push("BARRIERS DIVERT THE LAVA · THE GROUND IS NOT CONVERTED");
        } else {
            const W = Math.max(3, Number(state.worldW) || 3), H = Math.max(3, Number(state.worldH) || 3);
            const x = hash32(Number(state.worldSeed) || 1, 0x4c415641, state.year, 1) % W;
            const y = hash32(Number(state.worldSeed) || 1, 0x4c415641, state.year, 2) % H;
            const lava = recordLavaScar(entry, x, y, { spread: 1 });
            cutHazardRoads(entry, lava.marks, 1);
            events.push("LAVA COOLS AT " + x + "," + y + " · " + Math.max(1, lava.marks.length)
                + " TILE(S) ARE LOST TO THE REALM");
        }
    }

    // The baseline drifts only when the realm has lived through real extremes.
    if (!isHazardProofNeutralized("chronic:climate-trend")) {
        if (drought || volcanic) chronic.climateDrift = Math.max(-20, Math.min(20, chronic.climateDrift + 1));
        else if (chronic.climateDrift > 0) chronic.climateDrift--;
    }

    if (!isHazardProofNeutralized("chronic:long-term-economy")) {
        chronic.economicDrag = clamp01(chronic.economicDrag * 0.85 + (entry.losses.buildings + entry.losses.roads) * 0.01
            + chronic.droughtYears * 0.01 + chronic.floodScars * 0.005);
    }
    if (!isHazardProofNeutralized("chronic:long-term-economy") && chronic.economicDrag > 0.05) {
        const tax = Math.min(Math.floor((Number(state.resources?.gold) || 0) * 0.02), Math.round(chronic.economicDrag * 10));
        if (tax > 0) {
            addResource("gold", -tax);
            recordLoss(entry, "gold", tax);
            events.push("DISASTER DEBT · " + tax + "G LOST TO REPAIRS");
        }
    }

    // Magical burdens grow while untreated and retreat when the player invests.
    if (magic.corruption > 0) {
        magic.corruption = clamp01(magic.corruption * 0.92 + entry.modifiers.diseaseRisk * 0.04);
        magic.wards = Math.max(getHazardMitigation().wards, clamp01(magic.wards * 0.85));
        magic.fog = clamp01(magic.fog * 0.8);
        magic.cursed = clamp01(magic.cursed * 0.85);
        magic.magicDisease = clamp01(magic.magicDisease * 0.8);
        magic.animalShift = clamp01(magic.animalShift * 0.9);
        magic.forbidden = clamp01(magic.forbidden * 0.9);
        magic.unnaturalWeather = clamp01(magic.unnaturalWeather * 0.75);
    }
    if (magic.corruption > 0.5) {
        magic.fog = clamp01(magic.fog + 0.1);
        magic.cursed = clamp01(magic.cursed + 0.08);
        events.push("CORRUPTION SPREADS FROM THE OLD GROUND");
    }
    if (!isHazardProofNeutralized("magic:disease")
        && magic.magicDisease > 0.4 && !state.health?.outbreakActive) {
        startOutbreak({ severity: 2, disease: "arcane wasting fever" });
        registerHazardDisease(entry, createDiseaseRecord("magic:disease", "Arcane wasting fever", 0.6, "magic"));
        events.push("AN ARCANE FEVER TAKES HOLD");
    }
    if (magic.animalShift > 0.3) events.push("WILDLIFE BEHAVIOUR SHIFTS ACROSS THE REGION");
    if (magic.forbidden > 0.3) events.push("FORBIDDEN GROWTH APPEARS AT THE FOREST EDGE");

    // `magic:rare` is not a panel counter. A charged unnatural year seeds the
    // next rare chain through the same response layer, so the magical catalogue
    // row has a real multi-year consequence and a decision attached to it.
    if (!isHazardProofNeutralized("magic:rare") && magic.rareYears > 0
        && (!entry.rare || entry.rare.resolved || state.year > positive(entry.rare.endsYear))) {
        const chain = selectRareChain(entry, hazardRoll("magic-rare-chain"));
        magic.rareYears = 0;
        events.push("THE OLD MAGIC CALLS A RARE EVENT · " + chain.label.toUpperCase());
    }

    // One rare event per decade at most, deterministic from the seed and year.
    // It is a multi-year chain with an annual rule and a player decision. A
    // legacy rare record from 3.36 is given a chain instead of staying inert.
    if (entry.rare && !entry.rare.chainId) {
        const chain = rareChainFor(hazardRoll("rare-legacy:" + entry.rare.year));
        entry.rare.chainId = chain.id;
        entry.rare.label = chain.label;
        entry.rare.endsYear = Math.max(positive(entry.rare.year) + chain.years, state.year);
        entry.rare.stage = Math.max(0, state.year - positive(entry.rare.year));
        entry.rare.resolved = false;
        entry.rare.choice = null;
        entry.rare.outcome = "";
    }
    if (!entry.rare || state.year - entry.rare.year >= 10) {
        if (hazardRoll("rare-event:year") < 0.12) {
            const chain = selectRareChain(entry, hazardRoll("rare-chain"));
            magic.rareYears = Math.min(80, magic.rareYears + 10);
            events.push("A RARE EVENT SHAPES THE REGION · " + chain.label.toUpperCase());
        }
    }
    if (entry.rare && entry.rare.year < state.year) entry.rare.years = state.year - entry.rare.year;

    entry.mitigation = getHazardMitigation();
    // Diseases, partner realms, rare chains, loans and the next forecast. The
    // pass is capped and reads only the saved lists; it never scans the map.
    advanceHazardResponse(entry, events, {
        damageFields: (amount, reason) => damageFields(entry, amount, reason)
    });
    entry.diseases = entry.diseases.filter(disease => disease.active || state.year - disease.year <= 3).slice(-HAZARD_LIMITS.maxDiseases);
    if (events.length) {
        for (const line of events.slice(0, 4)) addLog(line, "#b08cc4", "hazard");
        addHistory(entry, "year", events.join(" · "));
    }
    invalidateHazardModifierCache();
    state.environmentalHazards = entry;
    return { skipped: false, events, chronic, magic };
}

function tradePartners() {
    const diplomacy = state.diplomacy;
    if (!diplomacy || typeof diplomacy !== "object") return [];
    const names = [];
    const relations = diplomacy.relations || diplomacy.realms || diplomacy.neighbours;
    if (Array.isArray(relations)) {
        for (const relation of relations.slice(0, HAZARD_LIMITS.maxTradePartners)) {
            const name = relation?.name || relation?.id || relation?.realm;
            if (name) names.push(String(name).slice(0, 60));
        }
    } else if (relations && typeof relations === "object") {
        for (const [name, value] of Object.entries(relations).slice(0, HAZARD_LIMITS.maxTradePartners)) {
            if (value && (typeof value !== "object" || (Number(value.relation) || 0) >= 0)) names.push(String(name).slice(0, 60));
        }
    }
    return names;
}

/**
 * Spend stores to prepare the current season. One preparation per season; the
 * readiness feeds the mitigation score the next hazard roll uses.
 */
export function prepareForHazardSeason() {
    const entry = ensureHazardState();
    if (entry.preparedness.season === state.seasonIndex && entry.preparedness.year === state.year) {
        return { ok: false, reason: "THIS SEASON IS ALREADY PREPARED" };
    }
    const cost = { wood: 12, gold: 8 };
    for (const [resource, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) {
            return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
        }
    }
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
    entry.preparedness = {
        season: state.seasonIndex,
        year: state.year,
        spent: positive(entry.preparedness.spent) + 20,
        history: [...entry.preparedness.history, { year: state.year, season: state.seasonIndex, cost: 20 }].slice(-8)
    };
    entry.mitigation = getHazardMitigation();
    addLog("THE REALM PREPARES FOR " + (SEASON_NAMES[state.seasonIndex] || "the season").toUpperCase()
        + " · READINESS " + Math.round(entry.mitigation.score * 100) + "%", "#9ab7a1", "hazard");
    return { ok: true, cost, readiness: Math.round(entry.mitigation.score * 100), message: "season prepared" };
}

/**
 * Treat the sick and injured the hazard pass left behind. Doses come from the
 * real medicine store (brewed medicine first, then gathered herbs), not from
 * `herbalDoses` — that field counts doses already given and must only grow.
 */
export function treatHazardCasualties() {
    const entry = ensureHazardState();
    const sick = residents().filter(person => Number(person.illnessUntilTick) > state.tick);
    if (!sick.length) return { ok: false, reason: "NO ONE NEEDS TREATMENT" };
    const availability = getMedicineAvailability();
    if (availability.available <= 0) return { ok: false, reason: "NO MEDICINE IN STORE" };
    const treated = Math.min(2, availability.available, sick.length);
    const spent = consumeMedicine(treated);
    if (spent.total <= 0) return { ok: false, reason: "NO MEDICINE IN STORE" };
    state.health.herbalTreated = positive(state.health.herbalTreated) + spent.total;
    for (const person of sick.slice(0, spent.total)) {
        person.illnessUntilTick = Math.max(state.tick + 20, person.illnessUntilTick - 30);
        person.immunity = Math.min(100, (Number(person.immunity) || 0) + 3);
    }
    addLog("HAZARD CASUALTIES TREATED · " + spent.total + " DOSES USED", "#9ab7a1", "health");
    return { ok: true, treated: spent.total, medicine: getMedicineAvailability().available, message: "casualties treated" };
}

/** Cleanse corrupted ground. Costs stone and gold and lowers the taint. */
export function cleanseHazardCorruption() {
    const entry = ensureHazardState();
    if (entry.magic.corruption < 0.05) return { ok: false, reason: "NO CORRUPTION TO CLEANSE" };
    const cost = { stone: 10, gold: 12 };
    for (const [resource, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
    entry.magic.corruption = clamp01(entry.magic.corruption - 0.25);
    entry.magic.fog = clamp01(entry.magic.fog - 0.2);
    entry.magic.cursed = clamp01(entry.magic.cursed - 0.2);
    entry.magic.forbidden = clamp01(entry.magic.forbidden - 0.15);
    entry.magic.wards = clamp01(entry.magic.wards + 0.2);
    const scars = normalizeHazardScars(entry.scars);
    if (scars.corruption.length) {
        scars.corruption.shift();
        scars.revision += 1;
        entry.scars = scars;
    }
    entry.mitigation = getHazardMitigation();
    addLog("THE CORRUPTED GROUND IS CLEANSED · TAINT " + Math.round(entry.magic.corruption * 100) + "%", "#b08cc4", "hazard");
    return { ok: true, cost, corruption: Math.round(entry.magic.corruption * 100), message: "corruption cleansed" };
}

/** Read-only snapshot for the panel. */
/** Test seam: call the real hazard application without exposing it to the UI. */
export function applyHazardForProof(entry, row, severity = 1, budget = {}) {
    return applyHazard(entry, row, severity, budget);
}

/** Test seam: call the real magic application without exposing it to the UI. */
export function applyMagicForProof(row, severity = 1, entry = ensureHazardState()) {
    applyMagic(row, severity, entry);
    return entry;
}

export function getHazardSnapshot() {
    const entry = normalizeEnvironmentalHazardState(state.environmentalHazards);
    const response = normalizeHazardResponse(entry.response);
    const profile = getHazardProfile();
    const catalogByCategory = {};
    for (const row of HAZARD_CATALOG) catalogByCategory[row.category] = (catalogByCategory[row.category] || 0) + 1;
    return {
        available: true,
        year: state.year,
        season: state.seasonIndex,
        seasonName: SEASON_NAMES[state.seasonIndex] || "spring",
        weather: state.weather || "clear",
        profile,
        active: entry.active,
        warnings: entry.warnings,
        modifiers: entry.modifiers,
        chronic: entry.chronic,
        magic: entry.magic,
        diseases: entry.diseases,
        mitigation: entry.mitigation,
        preparedness: entry.preparedness,
        losses: entry.losses,
        medicine: getMedicineAvailability(),
        history: entry.history,
        rare: entry.rare,
        response,
        forecast: response.forecast || buildHazardForecast(entry),
        partners: normalizeHazardPartners(entry.partners),
        scars: getHazardScarSnapshot(),
        catalog: {
            total: HAZARD_CATALOG.length,
            mechanics: HAZARD_MECHANICS.length,
            categories: catalogByCategory,
            climates: hazardRowsForClimate(state.worldOptions?.climate || "temperate").length
        }
    };
}

/** Modifiers other systems may read. Values are 0..1. */
export function getHazardModifiers() {
    return readHazardModifiers();
}

export function serializeEnvironmentalHazardState() {
    return normalizeEnvironmentalHazardState(state.environmentalHazards);
}

export function restoreEnvironmentalHazardState(value) {
    invalidateHazardModifierCache();
    const restored = normalizeEnvironmentalHazardState(value);
    // Saves written before modifiers had consumers could carry a non-zero block
    // from the standing regional bundle alone. With no rolled hazard pressing,
    // the realm must load at exactly neutral so a calm save keeps its baseline.
    if (!restored.active.some(hazard => hazard.category !== "regional")) {
        restored.modifiers = emptyModifiers();
    }
    state.environmentalHazards = restored;
    // A 3.40 save carries sparse resource-capacity deltas; the restored arrays
    // are already authoritative, so only the terrain visual cache is rebuilt.
    // A 3.39 save has marks but no capacity deltas and is converted here. This
    // is the explicit migration backstop: old saves never keep lava on a tile
    // that a quarry or forest still occupies.
    const capacitySnapshot = Boolean(state.resourceGeography?.capacitySnapshot);
    applyHazardTerrainScars(restored, { resources: !capacitySnapshot });
    if (!capacitySnapshot) restoreHazardRoadCuts(restored);
    return state.environmentalHazards;
}
