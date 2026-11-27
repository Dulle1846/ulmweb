// Forest type atlas: the player-facing catalogue of the 60 regional forest
// formations. It is a pure reader over the frozen catalogue plus one bounded
// sample of the realm's own forest tiles; it never runs a per-tile survey at
// render time and adds no per-tick simulation.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import {
    REGIONAL_FOREST_TYPES, REGIONAL_FOREST_TYPE_BY_ID, REGIONAL_FOREST_TYPE_BY_KEY,
    REGIONAL_SPECIES, REGIONAL_BOUNTY_SEASONS,
    regionalCharacterFor, signatureTimberForRegionalType,
} from "../world/regional-forests.js";
import { FOREST_GOODS, FOREST_SPECIES, forestStandAt, forestSuccessionStage } from "../world/forest-ecology.js";
import { FOREST_MANAGEMENT_SYSTEMS } from "../world/forest-dynamics.js";
import { forestFaunaEcologyFor, forestFaunaFieldGuide } from "../world/forest-fauna-ecology.js";
import { forestAmbienceHistory } from "../core/forest-ambience.js";
import {
    FOREST_CHUNK_SIZE, FOREST_MODEL_REQUIREMENTS, FOREST_MODEL_SAMPLE_BUDGET, FOREST_MODEL_TYPE_BUDGET,
    FOREST_MODEL_VERSION, FOREST_RNG_STREAMS,
    forestAnnualCadenceFor, forestBiodiversityFor, forestChunkBudgetFor,
    forestChunkKeyFor, forestDisturbanceMatrixFor, forestErosionFor,
    forestFloodPressureFor, forestLimitsFor, forestLodFor,
    forestMoistureIndexFor, forestModelCacheStats, forestModelTelemetrySnapshot,
    forestPhenologyFor, forestRegionSeedFor, forestRegenerationFor,
    forestRegionalWeightsFor, forestRngSeedFor, forestSoilFor,
    forestSpeciesPoolFor, forestSuccessionMatrixFor, forestWaterFlowFor,
    forestWindthrowFor, precomputeForestChunk,
} from "../world/forest-model.js";
import { timberQuote } from "../systems/regional-timber-market.js";
import { forestGoodUseLabel } from "../systems/forest-gathering.js";
import {
    FOREST_INDUSTRY_REQUIREMENTS, FOREST_WORKS_MODES, INDUSTRY_GOODS,
    SAW_PROFILES, WOOD_QUALITY_CLASSES,
} from "../world/forest-industries.js";
import {
    forestMasterworkArchive, forestMasteryFor, forestWorksModeFor, furnitureLotProof, industryQuote,
} from "../systems/forest-industries.js";
import { getPhysicalStock } from "../systems/logistics.js";
import { forestCultureSummary } from "../systems/forest-culture.js";
import { legacyBlock } from "./forest-legacy-panel.js";
import {
    FOREST_EMBARGO_GOODS, FOREST_CUSTOMS_RATES, FOREST_WAR_COSTS,
    FOREST_WARFARE_LIMITS, forestWarfareProfileFor, forestWarfareSnapshot,
} from "../systems/forest-warfare.js";
import { ensureDiplomacy } from "../systems/diplomacy.js";
import { FOREST_WARFARE_REQUIREMENTS } from "../world/forest-warfare.js";
import { ensureWorldMap } from "../systems/world-map.js";
import { DIPLOMATIC_REALMS } from "../systems/diplomacy-config.js";
import { regionDefinitionFor } from "../world/world-regions.js";
import { ensureForestGuild } from "../systems/forest-guild.js";
import {
    FOREST_GUILD_ACTIVE_LIMIT, FOREST_GUILD_HISTORY_LIMIT, FOREST_GUILD_PATRONS,
    FOREST_PATRON_PACT_DELIVERIES, forestGuildNextTier, forestGuildTierFor,
} from "../world/forest-guild.js";
import { grandConsumersSummary } from "../systems/grand-consumers.js";
import { MEDICINE_MAX_STOCK } from "../systems/health.js";
import {
    ensureForestSuccession, findBurnableForestTile, forestFirebreakAt,
    forestStewardshipAt, forestSuccessionAt, forestSuccessionChronicle,
    forestSuccessionStats,
} from "../systems/forest-succession.js";
import {
    forestDangerLegend, forestFilterOptions, forestLegendEntries, forestMapFilters,
    forestMatchesFilters, forestPresentationGuide, forestPresentationSettings,
    forestPresentationSummary, forestProtectionForStand, forestUseLegend,
} from "../systems/forest-presentation.js";
import { sacredGroveTileAt } from "../world/sacred-groves.js";
import { FOREST_PROTECTION_STATES, forestPresentationProfile } from "../world/forest-presentation.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const amount = value => { const rounded = Math.round((Number(value) || 0) * 100) / 100; return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
const pct = value => Math.round((Number(value) || 0) * 100);
const percent = value => Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
const signed = value => {
    const rounded = Math.round((Number(value) || 0) * 100);
    return (rounded > 0 ? "+" : "") + rounded + "%";
};
const seasonNames = ["Spring", "Summer", "Autumn", "Winter"];
const SURVEY_LIMIT = 240;
const modelRound = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
};
// forestModelFor builds eleven independent matrices in one call. The atlas
// reads the same exported matrices here, one bounded slice at a time, so the
// first cold type no longer stalls the frame for a full model build.
const modelTypeFor = input => {
    if (!input) return null;
    if (typeof input === "string") return REGIONAL_FOREST_TYPE_BY_ID[input] || REGIONAL_FOREST_TYPE_BY_KEY[input] || null;
    if (typeof input !== "object") return null;
    if (input.regionalType && typeof input.regionalType === "object") return input.regionalType;
    const typeId = input.regionalTypeId || input.forestTypeId || input.typeId || input.id;
    if (typeId && REGIONAL_FOREST_TYPE_BY_ID[typeId]) return REGIONAL_FOREST_TYPE_BY_ID[typeId];
    const typeKey = input.regionalType || input.forestType || input.key;
    if (typeof typeKey === "string") {
        return REGIONAL_FOREST_TYPE_BY_KEY[typeKey] || REGIONAL_FOREST_TYPE_BY_ID[typeKey] || null;
    }
    return null;
};
const modelClimateKey = value => {
    const climate = String(value || "temperate").toLowerCase();
    return climate === "boreal" ? "taiga" : climate;
};

let surveyCache = { key: null, value: null };
let surveyGeneration = 0;
// A smaller scan budget keeps the first scan advances as cheap as the later
// derived phases; the strided sample list it produces is unchanged.
const SURVEY_SCAN_BUDGET = 4096;
// The staged survey used to batch several phases into one part; a single
// derived phase can still cost tens of milliseconds on a throttled low-end
// device, so each part now advances exactly one phase. The phase machine still
// preserves the exact strided sample order and final snapshot.
// The stand factory is pure but its first call compiles a large deterministic
// formation table. Warm that one-time cost after module load, outside every
// panel part, so opening the atlas never pays a cold JIT spike inside a
// generation task. The result is discarded; survey values still come from the
// live tile snapshot below.
const warmForestStand = () => {
    try {
        const stand = forestStandAt(0.5, 0.5, {
            seed: 1, moisture: 0.8, temperature: 0.55, height: 0.7,
            climate: "temperate", forests: 70, stockRatio: 1, rockLine: 0.92,
        });
        forestFaunaEcologyFor(stand, { day: 150, climate: "temperate", seed: 1, x: 0, y: 0 });
        card(REGIONAL_FOREST_TYPES[0], 0, 0, 0, 0, null, null, null);
    } catch { /* A warm-up is never allowed to fail a panel render. */ }
};
if (typeof setTimeout === "function") setTimeout(warmForestStand, 0);
else warmForestStand();

function intro(kicker, title, copy) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div>';
}

function terrainAt(tx, ty) {
    const res = Number(state.terrainResolution) || 1;
    const width = Number(state.terrainPixW) || 0, height = Number(state.terrainPixH) || 0;
    const px = Math.floor((tx + 0.5) * res), py = Math.floor((ty + 0.5) * res);
    if (!width || !height || px < 0 || py < 0 || px >= width || py >= height) {
        return { height: 0, moisture: 0.5, temperature: 0.55 };
    }
    const index = py * width + px;
    return {
        height: Number(state.heightMap?.[index]) || 0,
        moisture: Math.max(0, Math.min(1, Number(state.moistureMap?.[index]) || 0)),
        temperature: Math.max(0, Math.min(1, Number(state.temperatureMap?.[index] ?? 0.55) || 0)),
    };
}

// A bounded, deterministic sample of the realm's own forest tiles. Sampling
// every stride-th forest tile keeps a panel open cheap on a large map while
// still reporting the regional mix the player actually owns. Transition tiles
// are counted separately so an edge reads as an edge, not as a second type.
function unavailableSurvey() {
    return {
        available: false, forestTiles: 0, sampled: 0, counts: {}, transitions: {},
        transitionSamples: 0, present: 0, types: [],
    };
}

// The atlas survey is a bounded deterministic sample, but on a mature realm
// its first build was the longest single task in the interface (over 800 ms at
// 4x CPU). The same sample is now a state machine: the synchronous helper runs
// it to completion for older callers, while the staged panel advances one
// bounded slice per animation frame. The order of samples and the final object
// are unchanged, so the saved realm and every derived reading stay identical.
export function createForestAtlasSurveyBuilder(limit = SURVEY_LIMIT) {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0, height = Number(state.worldH) || 0;
    if (!geo?.forestStock || !width || !height) return {
        done: () => true,
        advance: () => true,
        value: () => unavailableSurvey()
    };
    // Keep the original cache key exactly. The survey reads the same live
    // snapshot it always did; only the work is spread across frames.
    const key = [geo.seed, width, height, state.year,
        Math.floor((Number(state.tick) || 0) / 30),
        Number(state.forestSuccession?.day) || 0,
        Number(state.forestSuccession?.revision) || 0,
        Number(state.forestSuccession?.stewardshipActions) || 0].join(":");
    if (surveyCache.key === key) return {
        done: () => true,
        advance: () => true,
        value: () => surveyCache.value
    };
    const total = Math.min(geo.forestStock.length, width * height);
    const climate = state.worldOptions?.climate || "temperate";
    const zoom = Number(state.zoom) || 1;
    const season = Math.max(0, Math.min(3, Number(state.seasonIndex) || 0));
    const ctx = {
        key, geo, width, height, total, climate, zoom, season,
        day: state.dayOfYear, weather: state.weather,
        forests: state.worldOptions?.forests ?? 52,
        generation: surveyGeneration,
        indices: [], slots: [], scanIndex: 0, slotIndex: 0, current: null, model: null,
        counts: {}, transitions: {}, samples: {}, faunaSamples: {},
        modelSamples: {}, systemCounts: {}, regionSamples: {},
        sampled: 0, transitionSamples: 0,
        types: null, chunk: null, successionStats: null, chronicle: null, regions: null,
        phase: "scan", done: false, value: null
    };
    const sampleStandAt = (sx, sy) => {
        const x = Math.floor(sx), y = Math.floor(sy);
        if (x < 0 || y < 0 || x >= width || y >= height) return null;
        const terrain = terrainAt(x, y);
        const stewardship = forestStewardshipAt(x, y);
        return forestStandAt(sx, sy, {
            seed: Number(geo.seed) || 1,
            moisture: terrain.moisture,
            temperature: terrain.temperature,
            height: terrain.height,
            climate,
            forests: ctx.forests,
            stockRatio: geo.forestCapacity[y * width + x]
                ? geo.forestStock[y * width + x] / geo.forestCapacity[y * width + x] : 1,
            rockLine: 0.92,
            succession: forestSuccessionAt(x, y),
            drainage: stewardship.drainage,
        });
    };
    // The chunk builder samples the same stands again. Serve those samples from
    // a bounded pre-pass so one survey frame never generates a whole 16×16 chunk.
    const chunkStandAt = (x, y) => ctx.chunkStands?.get(x + ":" + y) || null;
    const scan = budget => {
        const end = Math.min(total, ctx.scanIndex + budget);
        for (; ctx.scanIndex < end; ctx.scanIndex++) {
            if (geo.forestStock[ctx.scanIndex] > 0) ctx.indices.push(ctx.scanIndex);
        }
        if (ctx.scanIndex < total) return;
        // Materialise the exact strided loop used by the synchronous survey.
        // There are at most SURVEY_LIMIT + 1 entries, so this is cheap and it
        // makes the remaining number of frames explicit.
        const stride = Math.max(1, Math.ceil(ctx.indices.length / Math.max(1, limit)));
        for (let slot = 0; slot < ctx.indices.length; slot += stride) ctx.slots.push(ctx.indices[slot]);
        ctx.phase = ctx.slots.length ? "sample" : "final";
    };
    // One sampled tile still produces several derived records. They used to be
    // built in a single advance, which made the first and richest slots the
    // longest tasks in the stream. Each derived record now owns its own bounded
    // slice, while the strided sample order and the final object stay the same.
    const beginSlot = () => {
        const index = ctx.slots[ctx.slotIndex++];
        const x = index % width, y = Math.floor(index / width);
        ctx.current = { x, y, index };
        ctx.phase = "slot-terrain";
    };
    const slotTerrain = () => {
        const { x, y } = ctx.current;
        // The stand factory reads the same live tile snapshot as the region
        // record. Building that snapshot here gives the scheduler another cheap
        // frame boundary without changing a single sampled value.
        ctx.current.terrain = terrainAt(x, y);
        ctx.current.stewardship = forestStewardshipAt(x, y);
        ctx.current.succession = forestSuccessionAt(x, y);
        ctx.phase = "slot-stand";
    };
    const slotStand = () => {
        const { x, y, terrain, stewardship, succession } = ctx.current;
        const stand = forestStandAt(x + 0.5, y + 0.5, {
            seed: Number(geo.seed) || 1,
            moisture: terrain.moisture,
            temperature: terrain.temperature,
            height: terrain.height,
            climate,
            forests: ctx.forests,
            stockRatio: geo.forestCapacity[y * width + x]
                ? geo.forestStock[y * width + x] / geo.forestCapacity[y * width + x] : 1,
            rockLine: 0.92,
            succession,
            drainage: stewardship.drainage,
        });
        const id = stand?.regionalTypeId || null;
        ctx.current.stand = stand;
        ctx.current.id = id;
        if (id) {
            ctx.counts[id] = (ctx.counts[id] || 0) + 1;
            if (!ctx.samples[id] && stand.dynamics) ctx.samples[id] = stand.dynamics;
        }
        ctx.phase = "slot-biodiversity";
    };
    // The region record used to derive seven live readings in one task. Each
    // reading is now a separate bounded advance; the record is assembled only
    // after every input exists, so no partial row can ever be published.
    const derived = (phase, key, fn) => {
        const { stand, id } = ctx.current;
        if (id && !ctx.regionSamples[id]) ctx.current[key] = fn(stand);
        ctx.phase = phase;
    };
    const slotBiodiversity = () => derived("slot-erosion", "biodiversity", stand => forestBiodiversityFor(stand));
    const slotErosion = () => derived("slot-flood", "erosion", stand => forestErosionFor(stand));
    const slotFlood = () => derived("slot-regeneration", "flood", stand => forestFloodPressureFor(stand, { season, weather: ctx.weather }));
    const slotRegeneration = () => derived("slot-water", "regeneration", stand => forestRegenerationFor(stand));
    const slotWater = () => derived("slot-grove", "water", stand => forestWaterFlowFor(stand));
    const slotGrove = () => {
        const { x, y, stand, id } = ctx.current;
        if (id && !ctx.regionSamples[id]) {
            ctx.current.grove = sacredGroveTileAt(x, y);
            // The original record re-read stewardship from the live tile here.
            ctx.current.recordStewardship = forestStewardshipAt(x, y);
            ctx.current.protection = forestProtectionForStand(stand, ctx.current.recordStewardship, ctx.current.grove);
        }
        ctx.phase = "slot-region";
    };
    const slotRegion = () => {
        const { x, y, stand, id, biodiversity, erosion, flood, regeneration,
            water, grove, recordStewardship, protection } = ctx.current;
        if (id && !ctx.regionSamples[id]) {
            ctx.regionSamples[id] = {
                x, y,
                typeId: id, typeLabel: stand.regionalLabel || null,
                ageClass: stand.ageClass || null,
                protection, protected: protection === "protected",
                grove: Boolean(grove),
                biodiversity: biodiversity.index,
                biodiversityClass: biodiversity.class,
                erosion: erosion.risk, erosionClass: erosion.class,
                flood: flood.pressure, wetness: Number(stand.wetness) || 0,
                regeneration: regeneration.factor, yearsToCanopy: regeneration.yearsToCanopy,
                flow: water.flow, drained: recordStewardship.drained,
                firebreak: recordStewardship.firebreak, firebreakUntil: recordStewardship.firebreakUntil,
                succession: forestSuccessionAt(x, y),
            };
        }
        ctx.phase = "slot-model";
    };
    const slotModel = () => {
        const { stand, id } = ctx.current;
        if (!id || ctx.modelSamples[id] || !stand.dynamics) {
            ctx.phase = "slot-fauna";
            return;
        }
        const type = modelTypeFor(stand);
        if (!type) {
            ctx.modelSamples[id] = null;
            ctx.phase = "slot-fauna";
            return;
        }
        const modelClimate = modelClimateKey(climate || stand.climate || type.climates[0]);
        const day = Number.isFinite(Number(ctx.day)) ? Number(ctx.day) : 150;
        const distribution = forestRegionalWeightsFor({
            climate: modelClimate,
            height: stand.height ?? type.probe?.height,
            temperature: stand.temperature ?? type.probe?.temperature,
            moisture: stand.moisture ?? type.probe?.moisture,
        });
        ctx.model = {
            stand, id, type, climate: modelClimate, day, distribution,
            options: { zoom, seed: geo.seed, weather: ctx.weather, season: ctx.season },
        };
        ctx.phase = "slot-model-core";
    };
    // The eleven model matrices used to be built in one advance. They are now
    // four consecutive phases, called in the original order, so no part pays
    // for the whole envelope at once.
    const slotModelCore = () => {
        const m = ctx.model;
        m.row = m.distribution.byId[m.type.id] || null;
        m.limits = forestLimitsFor(m.type);
        m.soil = forestSoilFor(m.stand);
        m.moisture = forestMoistureIndexFor(m.stand);
        ctx.phase = "slot-model-matrices";
    };
    const slotModelMatrices = () => {
        const m = ctx.model;
        m.disturbance = forestDisturbanceMatrixFor(m.stand);
        m.successionMatrix = forestSuccessionMatrixFor(m.stand);
        ctx.phase = "slot-model-ecology";
    };
    const slotModelEcology = () => {
        const m = ctx.model;
        m.species = forestSpeciesPoolFor(m.type);
        m.lod = forestLodFor(m.options.zoom ?? 1);
        m.cadence = forestAnnualCadenceFor(m.day);
        ctx.phase = "slot-model-phenology";
    };
    const slotModelPhenology = () => {
        const m = ctx.model;
        m.phenology = forestPhenologyFor(m.stand, m.day, m.climate);
        ctx.phase = "slot-model-readings";
    };
    const slotModelReadings = () => {
        const m = ctx.model;
        m.biodiversity = forestBiodiversityFor(m.stand);
        m.erosion = forestErosionFor(m.stand);
        m.regeneration = forestRegenerationFor(m.stand);
        ctx.phase = "slot-model-water";
    };
    const slotModelWater = () => {
        const m = ctx.model;
        m.windthrow = forestWindthrowFor(m.stand, m.stand.standAge ?? m.stand.age);
        m.water = forestWaterFlowFor(m.stand);
        m.floodPressure = forestFloodPressureFor(m.stand, {
            weather: m.options.weather, season: m.options.season,
        });
        ctx.phase = "slot-model-value";
    };
    const slotModelValue = () => {
        const m = ctx.model;
        const rng = Object.freeze({
            streams: FOREST_RNG_STREAMS,
            vegetation: forestRngSeedFor("vegetation", m.options.seed ?? m.stand.seed, m.stand.x, m.stand.y),
            animals: forestRngSeedFor("animals", m.options.seed ?? m.stand.seed, m.stand.x, m.stand.y),
            events: forestRngSeedFor("events", m.options.seed ?? m.stand.seed, m.stand.x, m.stand.y),
        });
        ctx.modelSamples[m.id] = Object.freeze({
            version: FOREST_MODEL_VERSION,
            typeId: m.type.id,
            key: m.type.key,
            label: m.type.label,
            regionSeed: forestRegionSeedFor(m.options.seed ?? m.stand.seed ?? 1, m.stand.x || 0, m.stand.y || 0, m.type.id),
            distribution: Object.freeze({
                climate: m.climate,
                share: modelRound(m.row?.share || 0, 4),
                fit: modelRound(m.row?.fit || 0, 3),
                top: Object.freeze(m.distribution.types.slice(0, FOREST_MODEL_TYPE_BUDGET).map(entry => Object.freeze({
                    id: entry.id, key: entry.key, label: entry.label, share: modelRound(entry.share, 4),
                }))),
            }),
            limits: m.limits,
            soil: m.soil,
            moisture: m.moisture,
            disturbance: m.disturbance,
            succession: m.successionMatrix,
            species: m.species,
            lod: m.lod,
            chunk: Object.freeze({
                key: forestChunkKeyFor(m.stand.x, m.stand.y),
                size: FOREST_CHUNK_SIZE,
                budget: forestChunkBudgetFor(m.options.zoom ?? 1),
            }),
            cadence: m.cadence,
            phenology: m.phenology,
            biodiversity: m.biodiversity,
            erosion: m.erosion,
            regeneration: m.regeneration,
            windthrow: m.windthrow,
            water: m.water,
            floodPressure: m.floodPressure,
            rng,
            requirementIds: Object.freeze(FOREST_MODEL_REQUIREMENTS.map(entry => entry.id)),
        });
        ctx.model = null;
        ctx.phase = "slot-fauna";
    };
    const slotFauna = () => {
        const { x, y, stand, id } = ctx.current;
        if (id) {
            if (!ctx.faunaSamples[id] && stand.dynamics) {
                ctx.faunaSamples[id] = forestFaunaEcologyFor(stand, {
                    day: ctx.day, climate, seed: geo.seed, x, y,
                });
            }
            const system = stand.dynamics?.silviculture?.system;
            if (system) ctx.systemCounts[system] = (ctx.systemCounts[system] || 0) + 1;
            ctx.sampled++;
            if (stand.regionalTransitionId) {
                ctx.transitionSamples++;
                ctx.transitions[stand.regionalTransitionId] = (ctx.transitions[stand.regionalTransitionId] || 0) + 1;
            }
        }
        ctx.current = null;
        ctx.phase = ctx.slotIndex >= ctx.slots.length ? "final-types" : "sample";
    };
    // Finalisation was another single long frame: the type table, the bounded
    // chunk build, the succession archive and its region rows, and the final
    // snapshot are now consecutive slices. Nothing is published until the last
    // one completes.
    const finalTypes = () => {
        ctx.types = REGIONAL_FOREST_TYPES.map(type => ({
            id: type.id, key: type.key, count: ctx.counts[type.id] || 0,
            transitionCount: ctx.transitions[type.id] || 0,
            dynamics: ctx.samples[type.id] || null,
            fauna: ctx.faunaSamples[type.id] || null,
            model: ctx.modelSamples[type.id] || null,
        }));
        ctx.phase = "final-chunk";
    };
    const finalChunkPrepare = () => {
        ctx.chunk = null;
        ctx.chunkStands = null;
        ctx.chunkPoints = [];
        ctx.chunkIndex = 0;
        if (!ctx.indices.length) {
            ctx.phase = "final-regions";
            return;
        }
        const index = ctx.indices[0];
        const chunkX = Math.floor((index % width) / FOREST_CHUNK_SIZE);
        const chunkY = Math.floor(Math.floor(index / width) / FOREST_CHUNK_SIZE);
        ctx.chunkContext = {
            chunkX, chunkY, seed: Number(geo.seed) || 1,
            climate, day: ctx.day, zoom, standAt: chunkStandAt,
        };
        const stride = Math.max(1, Math.ceil(Math.sqrt(
            FOREST_CHUNK_SIZE * FOREST_CHUNK_SIZE / FOREST_MODEL_SAMPLE_BUDGET
        )));
        let sampled = 0;
        for (let y = chunkY * FOREST_CHUNK_SIZE; y < (chunkY + 1) * FOREST_CHUNK_SIZE; y += stride) {
            for (let x = chunkX * FOREST_CHUNK_SIZE; x < (chunkX + 1) * FOREST_CHUNK_SIZE; x += stride) {
                if (sampled >= FOREST_MODEL_SAMPLE_BUDGET) break;
                sampled++;
                ctx.chunkPoints.push([x + 0.5, y + 0.5]);
            }
        }
        ctx.chunkStands = new Map();
        ctx.phase = "final-chunk-sample";
    };
    const finalChunkSample = () => {
        const end = Math.min(ctx.chunkPoints.length, ctx.chunkIndex + 2);
        for (; ctx.chunkIndex < end; ctx.chunkIndex++) {
            const [x, y] = ctx.chunkPoints[ctx.chunkIndex];
            ctx.chunkStands.set(x + ":" + y, sampleStandAt(x, y));
        }
        if (ctx.chunkIndex < ctx.chunkPoints.length) return;
        ctx.phase = "final-chunk-build";
    };
    const finalChunkBuild = () => {
        ctx.chunk = precomputeForestChunk(ctx.chunkContext);
        ctx.chunkContext = null;
        ctx.chunkPoints = null;
        ctx.chunkStands = null;
        ctx.phase = "final-regions";
    };
    const finalRegions = () => {
        ctx.successionStats = forestSuccessionStats();
        ctx.chronicle = forestSuccessionChronicle(60);
        ctx.phase = "final-region-rows";
    };
    const finalRegionRows = () => {
        const types = ctx.types;
        const regionIds = new Set([
            ...types.filter(type => type.count > 0).map(type => type.id),
            ...Object.keys(ctx.successionStats.regions || {}),
            ...Object.keys(ctx.chronicle.byRegion || {}),
        ]);
        ctx.regions = [...regionIds].filter(id => id !== "legacy")
            .map(id => {
                const type = REGIONAL_FOREST_TYPES.find(entry => entry.id === id);
                const sampled = types.find(entry => entry.id === id);
                return {
                    id, key: type?.key || null, label: type?.label || id,
                    count: sampled?.count || 0,
                    sample: ctx.regionSamples[id] || null,
                    disturbances: ctx.successionStats.regions?.[id] || null,
                    history: ctx.chronicle.byRegion?.[id] || [],
                };
            });
        ctx.phase = "final-value";
    };
    const finalValue = () => {
        const types = ctx.types;
        const value = {
            available: true,
            forestTiles: ctx.indices.length,
            sampled: ctx.sampled,
            counts: ctx.counts,
            transitions: ctx.transitions,
            transitionSamples: ctx.transitionSamples,
            present: types.filter(type => type.count > 0).length,
            types,
            regions: ctx.regions,
            chronicle: ctx.chronicle,
            chunk: ctx.chunk,
            succession: ctx.successionStats,
            telemetry: forestModelTelemetrySnapshot(),
            cache: forestModelCacheStats(),
            systems: Object.entries(FOREST_MANAGEMENT_SYSTEMS).map(([id, meta]) => ({
                id, label: meta.label, count: ctx.systemCounts[id] || 0,
            })),
            climate,
            season: seasonNames[season],
        };
        // A forest action may invalidate the cache while the streamed survey is
        // between frames. The current render still receives its coherent
        // snapshot, but a stale value must never become the next cache hit.
        if (ctx.generation === surveyGeneration) surveyCache = { key, value };
        ctx.value = value;
        ctx.done = true;
    };
    return {
        done: () => ctx.done,
        advance: () => {
            if (ctx.done) return true;
            switch (ctx.phase) {
                case "scan": scan(SURVEY_SCAN_BUDGET); break;
                case "sample": beginSlot(); break;
                case "slot-terrain": slotTerrain(); break;
                case "slot-stand": slotStand(); break;
                case "slot-biodiversity": slotBiodiversity(); break;
                case "slot-erosion": slotErosion(); break;
                case "slot-flood": slotFlood(); break;
                case "slot-regeneration": slotRegeneration(); break;
                case "slot-water": slotWater(); break;
                case "slot-grove": slotGrove(); break;
                case "slot-region": slotRegion(); break;
                case "slot-model": slotModel(); break;
                case "slot-model-core": slotModelCore(); break;
                case "slot-model-matrices": slotModelMatrices(); break;
                case "slot-model-ecology": slotModelEcology(); break;
                case "slot-model-phenology": slotModelPhenology(); break;
                case "slot-model-readings": slotModelReadings(); break;
                case "slot-model-water": slotModelWater(); break;
                case "slot-model-value": slotModelValue(); break;
                case "slot-fauna": slotFauna(); break;
                case "final-types": finalTypes(); break;
                case "final-chunk": finalChunkPrepare(); break;
                case "final-chunk-sample": finalChunkSample(); break;
                case "final-chunk-build": finalChunkBuild(); break;
                case "final-regions": finalRegions(); break;
                case "final-region-rows": finalRegionRows(); break;
                default: finalValue(); break;
            }
            return ctx.done;
        },
        value: () => ctx.done ? ctx.value : null
    };
}

export function forestAtlasSurvey(limit = SURVEY_LIMIT) {
    const builder = createForestAtlasSurveyBuilder(limit);
    while (!builder.advance()) { /* synchronous compatibility path */ }
    return builder.value();
}

export function invalidateForestAtlasSurvey() {
    surveyGeneration++;
    surveyCache = { key: null, value: null };
}

function swatches(type) {
    const palette = type.render?.palette || [];
    return palette.map(color => '<i style="background:' + esc(color) + '"></i>').join("");
}

function meter(label, value, detail = "") {
    const width = Math.max(0, Math.min(100, pct(value)));
    return '<span class="forest-atlas__meter"><small>' + esc(label) + '</small>'
        + '<i><b style="width:' + width + '%"></b></i><em>' + esc(detail || signed(value - 1)) + '</em></span>';
}

function speciesList(type) {
    const entries = Object.entries(type.species || {}).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 5).map(([id, weight]) => {
        // Some regional mixes use the shared temperate/tropical species table
        // rather than a 1.2.23.1-only record. Read both so every chip can
        // explain its tree instead of showing a bare identifier.
        const species = REGIONAL_SPECIES[id] || FOREST_SPECIES[id] || {};
        const label = species.label || id.replace(/-/g, " ");
        // 1.2.23.1.261: the chip explains the tree, not only its share.
        const tip = [
            species.latin || label,
            species.form ? species.form + ' form' : null,
            species.leafShape ? species.leafShape + ' leaf' : null,
            species.timber ? 'timber ×' + Number(species.timber).toFixed(2) : null,
            species.firewood ? 'firewood ×' + Number(species.firewood).toFixed(2) : null,
            (species.understory || []).length ? 'understorey ' + species.understory.join(', ') : null,
        ].filter(Boolean).join(' · ');
        return '<button type="button" class="forest-atlas__chip" data-forest-tip="' + esc(tip)
            + '" title="' + esc(tip) + '">' + esc(label) + ' <b>' + Math.round(weight * 100) + '%</b></button>';
    }).join("");
}

function goodsList(type) {
    const goods = (type.goods || []).slice(0, 10);
    return goods.map(id => {
        const good = FOREST_GOODS[id] || {};
        const label = good.label || String(id).replace(/-/g, " ");
        const use = forestGoodUseLabel(id) || "market";
        const tip = [label, good.category ? String(good.category) : null, use,
            good.season ? good.season + ' season' : null]
            .filter(Boolean).join(' · ');
        return '<button type="button" class="forest-atlas__good" data-forest-tip="' + esc(tip)
            + '" title="' + esc(tip) + '">' + esc(label) + ' <small>' + esc(use) + '</small></button>';
    }).join("");
}

function characterLine(type, currentSeason) {
    const character = regionalCharacterFor(type);
    if (!character) return "";
    const traits = character.traits.map(trait =>
        '<span class="forest-atlas__trait">' + esc(trait) + '</span>').join("");
    const good = character.signature ? FOREST_GOODS[character.signature] : null;
    const active = Boolean(good) && character.season === currentSeason;
    const signature = good
        ? '<div class="forest-atlas__signature' + (active ? ' is-active' : '') + '"><span>SIGNATURE</span><strong>'
            + esc(good.label) + '</strong><em>' + esc(REGIONAL_BOUNTY_SEASONS[character.season] || "Autumn")
            + ' bounty' + (active ? ' · IN SEASON' : '') + '</em></div>'
        : "";
    return '<div class="forest-atlas__character">' + traits + '</div>' + signature;
}

const MIX_LABELS = {
    pure: 'Pure stand', dominant: 'Dominant species', mixed: 'Mixed stand', even: 'Even mixture',
};
const PHASE_LABELS = {
    pioneer: 'Pioneer', thicket: 'Thicket', pole: 'Pole stage', mature: 'Mature',
    'old-growth': 'Old growth', climax: 'Climax',
};

function dynamicsBlock(dynamics, fauna = null) {
    if (!dynamics) return '';
    const composition = dynamics.composition || {};
    const regeneration = dynamics.regeneration || {};
    const health = dynamics.health || {};
    const age = dynamics.age || {};
    const system = dynamics.silviculture || {};
    const working = dynamics.working || {};
    const hazard = dynamics.hazard || {};
    const regime = hazard.regime || {};
    const soil = dynamics.soil || {};
    const structure = dynamics.structure || {};
    const ageCohorts = age.cohorts || {};
    const deadwood = structure.deadwoodProfile || {};
    const gap = structure.gapProfile || {};
    const edge = structure.edgeProfile || {};
    const herb = structure.herbProfile || {};
    const liana = structure.lianaProfile || {};
    const epiphyte = structure.epiphyteProfile || {};
    const litter = soil.litterProfile || {};
    const facts = [
        ['MIX', MIX_LABELS[composition.mixtureClass] || composition.mixtureClass || '—', pct(composition.purity) + '% dominant · ' + number(composition.speciesCount) + ' species'],
        ['COHORTS', pct(ageCohorts.young) + '/' + pct(ageCohorts.mature) + '/' + pct(ageCohorts.ancient), 'young/mature/ancient · spread ' + number(age.spreadYears) + 'y'],
        ['PHASE', PHASE_LABELS[age.phase] || age.phase || '—', 'rotation ' + number(age.rotationYears) + 'y · ' + (age.uneven ? 'uneven' : 'even') + ' age'],
        ['PIONEER / CLIMAX', pct(composition.pioneerShare) + '% / ' + pct(composition.climaxShare) + '%', (composition.pioneerSpecies || []).slice(0, 2).join(' · ') || '—'],
        ['SEED BANK', pct(regeneration.seedBank) + '%', 'mother trees ' + number(regeneration.motherTreesPerHa) + '/ha · viable ' + pct(regeneration.seedBankViability) + '%'],
        ['REGEN', 'seedling ' + pct(regeneration.seedlingBank) + '%', 'rain ' + pct(regeneration.seedRain) + '% · germ ' + pct(regeneration.germination) + '% · recruit ' + pct(regeneration.saplingRecruitment) + '%'],
        ['GENETICS', pct(regeneration.geneticDiversity) + '%', 'quality ' + pct(regeneration.seedQuality) + '% · ' + (regeneration.provenance?.regional >= 0.5 ? 'regional provenance' : 'local provenance')],
        ['SITE FIT', pct(health.siteFitness) + '%', 'disease resistance ' + pct(health.diseaseResistance) + '%'],
        ['SYSTEM', system.label || '—', number(system.rotationYears) + 'y · timber ' + pct(system.timberFactor) + '% · retention ' + number(system.retentionTreesPerHa) + '/ha'],
        ['WORKING', 'sawlogs ' + pct(working.timber?.sawlog) + '% · firewood ' + pct(working.timber?.firewood) + '%', 'specialty ' + pct(working.timber?.specialty) + '% · quality ' + pct(working.timber?.quality) + '% · log share ' + pct(working.timber?.logShare) + '% · volume ' + pct(working.timber?.volume) + '%'],
        ['REGIME', regime.label || '—', 'fire ' + pct(regime.fire) + '% · wind ' + pct(regime.wind) + '% · return ' + number(regime.returnIntervalYears) + 'y'],
        ['DEADWOOD', pct(deadwood.total) + '%', 'standing ' + pct(deadwood.standing) + '% · fallen ' + pct(deadwood.fallen) + '% · decay ' + pct(deadwood.decay) + '%'],
        ['SOIL', soil.humusForm || '—', (soil.rootingType || 'roots') + ' · uptake ' + pct(soil.waterUptake) + '% · ' + number(soil.humusDepthCm) + 'cm humus · ' + pct(litter.broadleaf) + '/' + pct(litter.needle) + ' leaf/needle'],
        ['MYCORRHIZA', soil.mycorrhizaLabel || '—', (soil.mycorrhizaType || 'mixed network') + ' · decomposition ' + pct(soil.decomposition) + '% · ' + number(soil.networkReachM) + 'm reach'],
        ['STRUCTURE', structure.understoryLabel || '—', 'liana ' + pct(structure.lianaCover) + '% (' + ((liana.types || []).join(', ') || 'none') + ') · epiphyte ' + pct(structure.epiphyteCover) + '%'],
        ['EDGE', edge.active ? number(edge.widthM) + 'm mantle' : 'interior', 'diversity ' + pct(structure.edgeDiversity) + '% · cover ' + pct(edge.mantleCover) + '%'],
        ['LIGHT', structure.lightWoodland ? 'Open woodland' : 'Closed canopy', 'gap age ' + number(structure.gapAge) + 'd · edge diversity ' + pct(structure.edgeDiversity) + '%'],
        ['GAPS', pct(structure.canopyGap) + '%', (gap.origin || 'none') + ' · ' + (gap.sizeClass || 'none') + ' · ' + number(structure.layers) + ' layers'],
        ['HERB', 'food ' + pct(herb.food) + '%', 'medicine ' + pct(herb.medicine) + '% · flowering ' + pct(herb.flowering) + '%'],
    ];
    if (fauna) {
        facts.push(
            ['WILDLIFE', fauna.deer.primary + ' ' + number(fauna.deer.densityPer100Ha) + '/100ha', 'browse ' + percent(fauna.deer.browsePressure) + ' · boar ' + number(fauna.boar.sounderSize) + ' · health ' + percent(fauna.indicators.forestHealth) + '%'],
            ['PREDATORS', fauna.wolf.present ? 'wolf pack ' + number(fauna.wolf.packSize) : 'no wolf pack', (fauna.bear.present ? 'bear ' + number(fauna.bear.densityPer100Km2) + '/100km²' : 'no bear') + ' · lynx ' + (fauna.lynx.present ? 'present' : 'absent') + ' · raptors ' + number(fauna.raptors.pairs) + ' pairs'],
            ['WATER FAUNA', fauna.beavers.present ? 'beaver ' + number(fauna.beavers.colonies) : 'no beaver', 'otter ' + number(fauna.otters.individuals) + ' · fish ' + number(fauna.fish.biomassKgHa) + ' kg/ha · water ' + percent(fauna.indicators.waterQuality) + '%'],
            ['INSECTS', 'pollinators ' + percent(fauna.insects.pollinators) + '%', 'pests ' + percent(fauna.insects.pests) + '% · bees ' + number(fauna.wildBees.speciesRichness) + ' · butterflies ' + number(fauna.butterflies.speciesRichness)],
            ['DEADWOOD LIFE', 'ants ' + number(fauna.ants.moundsPerHa) + '/ha', 'woodpeckers ' + number(fauna.woodpeckers.pairs) + ' · beetles ' + number(fauna.deadwoodBeetles.speciesRichness) + ' · owls ' + number(fauna.owls.pairs)],
            ['CYCLE', fauna.cycles.hareLynx.label, 'hare ' + percent(fauna.cycles.hareLynx.hareIndex) + '% · lynx ' + percent(fauna.cycles.hareLynx.lynxIndex) + '% · parasites ' + percent(fauna.parasites.load) + '% · cleanup ' + percent(fauna.scavengers.diseaseCleanup) + '%'],
            ['CORRIDOR', percent(fauna.corridors.quality) + '%', 'migration ' + percent(fauna.corridors.migration) + '% · ' + number(fauna.corridors.links) + ' links · ' + number(fauna.corridors.nearestWoodKm) + 'km · ' + (fauna.corridors.targetRegionalType || 'local matrix')],
            ['HARVEST', 'game ' + number(fauna.products.venisonKgHa) + ' kg/ha', 'fish ' + number(fauna.products.fishKgHa) + ' · honey ' + number(fauna.products.honeyKgHa) + ' · mushrooms ' + number(fauna.products.mushroomsKgHa) + ' kg/ha'],
        );
    }
    return '<div class="forest-atlas__dynamics">' + facts.map(([label, value, detail]) =>
        '<span><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong><em>' + esc(detail) + '</em></span>').join('')
        + '</div>';
}

function modelBlock(model) {
    if (!model) return '';
    const limits = model.limits || {};
    const temperature = limits.temperature || [0, 0];
    const moisture = limits.moisture || [0, 0];
    const height = limits.height || [0, 0];
    const disturbance = model.disturbance || {};
    const succession = model.succession || {};
    const lod = model.lod || {};
    const water = model.water || {};
    const flood = model.floodPressure || {};
    const erosion = model.erosion || {};
    const regeneration = model.regeneration || {};
    const biodiversity = model.biodiversity || {};
    const facts = [
        ['MODEL', 'ID ' + model.typeId.slice(-3) + ' · ' + pct(model.distribution.share) + '% region',
            'temp ' + Number(temperature[0]).toFixed(2) + '–' + Number(temperature[1]).toFixed(2)
            + ' · moisture ' + Number(moisture[0]).toFixed(2) + '–' + Number(moisture[1]).toFixed(2)
            + ' · height ' + Number(height[0]).toFixed(2) + '–' + Number(height[1]).toFixed(2)],
        ['SOIL / WATER', esc(model.soil.label) + ' · pH ' + model.soil.pH,
            'N ' + pct(model.soil.nutrients) + '% · water ' + pct(model.soil.waterCapacity)
            + '% · ' + model.moisture.class + ' / ' + model.moisture.habitat],
        ['DISTURBANCE', 'fire ' + pct(disturbance.fire) + '% · wind ' + pct(disturbance.wind) + '%',
            'ice ' + pct(disturbance.ice) + '% · flood ' + pct(disturbance.flood)
            + '% · ' + (succession.stageLabel || succession.stage || 'undisturbed')
            + ' · return ' + number(disturbance.returnYears) + 'y'],
        ['PERFORMANCE', 'LOD ' + lod.tier + ' · ' + number(lod.maxTrees) + ' trees/chunk',
            'chunk ' + (model.chunk?.key || '—') + ' · ' + number(model.chunk?.budget?.maxStands)
            + ' stands · ' + number(model.chunk?.budget?.maxTypes) + ' types · '
            + (model.rng.streams?.vegetation || 'forest-vegetation')],
        ['WATER', (water.floodplain ? 'Floodplain' : water.mire ? 'Mire' : 'Upland')
            + ' · flow ' + pct(water.flow) + '%', 'flood pressure ' + pct(flood.pressure)
            + '% · retention ' + pct(water.retention) + '% · ' + (flood.wetWeather ? 'wet weather' : 'dry weather')],
        ['EROSION', esc(erosion.class || 'low') + ' · ' + number(erosion.sedimentTonsPerHaYear) + ' t/ha/y',
            'risk ' + pct(erosion.risk) + '% · mitigation ' + pct(erosion.mitigation) + '% · ' + esc(erosion.soil || 'soil')],
        ['RECOVERY', number(regeneration.yearsToCanopy) + 'y to canopy',
            esc(regeneration.trajectory || 'steady') + ' · seed bank ' + pct(regeneration.seedBank)
            + '% · mother trees ' + pct(regeneration.motherTrees) + '% · erosion penalty ' + pct(regeneration.erosionPenalty) + '%'],
        ['HABITAT', 'biodiversity ' + number(biodiversity.percent) + '%',
            esc(biodiversity.class || 'moderate') + ' · ' + number(biodiversity.layers) + ' layers · fauna '
            + number(biodiversity.faunaRichness) + ' · deadwood ' + pct(biodiversity.deadwood) + '%'],
    ];
    return '<div class="forest-atlas__dynamics" data-forest-model="' + esc(model.typeId) + '">'
        + facts.map(([label, value, detail]) => '<span><small>' + esc(label) + '</small><strong>'
            + esc(value) + '</strong><em>' + esc(detail) + '</em></span>').join('')
        + '</div>';
}

function card(type, count, sampled, transitionCount, currentSeason, dynamics = null, fauna = null, model = null) {
    const timber = signatureTimberForRegionalType(type);
    const presentation = forestPresentationProfile(type.id);
    const quote = timber ? timberQuote(timber.id) : null;
    const share = sampled > 0 ? Math.round(count / sampled * 100) : 0;
    const effects = type.effects || {};
    const timberLine = quote
        ? '<div class="forest-atlas__timber"><strong>' + esc(quote.label) + '</strong><span>' + esc(quote.speciesLabel)
            + ' · ' + quote.planks + ' planks per 2 · ' + quote.price.toFixed(1) + 'G quote</span></div>'
        : '<div class="forest-atlas__timber"><strong>Ordinary log chain</strong><span>No named regional timber for this type.</span></div>';
    const presence = count > 0
        ? number(count) + ' SAMPLED · ' + share + '%' + (transitionCount > 0 ? ' · ' + number(transitionCount) + ' EDGE' : '')
        : 'NOT SURVEYED';
    return '<details class="forest-atlas__card' + (count > 0 ? ' is-present' : '') + '" data-forest-type="' + esc(type.id) + '">'
        + '<summary><span class="forest-atlas__palette">' + swatches(type) + '</span>'
        + '<span class="forest-atlas__title"><strong>' + esc(type.id.slice(-3)) + ' · ' + esc(type.short || type.label) + '</strong>'
        + '<small>' + esc(type.climates.join(", ")) + ' · priority ' + number(type.priority) + '</small></span>'
        + '<span class="forest-atlas__presence">' + presence + '</span></summary>'
        + '<p class="forest-atlas__profile">' + esc(type.profile) + '</p>'
        + characterLine(type, currentSeason)
        + (presentation ? cardSeasonLine(presentation) + cardFieldMarks(presentation) : '')
        + (presentation ? '<div class="forest-atlas__listen"><button type="button" class="forest-atlas__listen-button" data-forest-type-cue="'
            + esc(type.id) + '" data-forest-cue-kind="instrument" aria-label="Hear '
            + esc(type.short || type.label) + '">HEAR THIS WOOD <small>'
            + esc(presentation.sound.scale?.mode || 'Ionian') + '</small></button><span>'
            + esc(presentation.instruments.map(entry => entry.label).join(' · ')) + '</span></div>' : '')
        + dynamicsBlock(dynamics, fauna)
        + modelBlock(model)
        + '<div class="forest-atlas__stats">'
        + meter("Timber", effects.timber, signed((effects.timber ?? 1) - 1))
        + meter("Regrowth", effects.regrowth, signed((effects.regrowth ?? 1) - 1))
        + meter("Fire", Math.max(0, effects.fire), signed(effects.fire))
        + meter("Wildlife", effects.fauna, signed((effects.fauna ?? 1) - 1))
        + meter("Forage", effects.forage, signed((effects.forage ?? 1) - 1))
        + meter("Work", effects.work, signed((effects.work ?? 1) - 1))
        + '</div>'
        + timberLine
        + '<div class="forest-atlas__chips">' + speciesList(type) + '</div>'
        + '<div class="forest-atlas__goods">' + goodsList(type) + '</div>'
        + '</details>';
}

// The atlas cards carry eight decision cells per forest type. This guide opens
// the complete requested set once, against the richest sampled wood, so every
// point has a visible live reading and a plain-language field note. It is one
// bounded block of thirty rows and adds no survey or simulation work.
function faunaFieldGuide(survey) {
    const reference = survey.types
        .filter(entry => entry.count > 0 && entry.fauna)
        .sort((a, b) => (b.fauna.indicators?.biodiversity || 0) - (a.fauna.indicators?.biodiversity || 0))[0];
    if (!reference) return "";
    const points = forestFaunaFieldGuide(reference.fauna);
    if (!points.length) return "";
    const type = REGIONAL_FOREST_TYPES.find(entry => entry.id === reference.id);
    const label = type ? (type.short || type.label) : reference.id;
    const rows = points.map(point => {
        const facts = point.facts.map(fact => '<span>' + esc(fact) + '</span>').join("");
        return '<article class="forest-atlas__guide-point" data-fauna-point="' + esc(point.id) + '">'
            + '<div class="forest-atlas__guide-head"><b>' + esc(point.id.slice(-3)) + '</b><span>' + esc(point.group.toUpperCase()) + '</span></div>'
            + '<h4>' + esc(point.title) + '</h4>'
            + '<p>' + facts + '</p>'
            + '<small>' + esc(point.note) + '</small>'
            + '</article>';
    }).join("");
    return '<details class="forest-atlas__field-guide" data-fauna-guide="' + number(points.length) + '">'
        + '<summary><span>FIELD GUIDE · ' + number(points.length) + ' POINTS</span>'
        + '<strong>Fauna, ecology and food webs</strong>'
        + '<em>Reference wood: ' + esc(reference.id.slice(-3)) + ' · ' + esc(label) + ' · ' + esc(survey.season) + '</em></summary>'
        + '<p class="forest-atlas__guide-intro">All thirty requested fauna and ecology points, read live from the reference wood. '
        + 'Each value follows the same stand, season and management record that feeds hunting, gathering, herd growth and regeneration. '
        + 'Open a forest type above to compare its own fauna summary.</p>'
        + '<div class="forest-atlas__guide-grid">' + rows + '</div>'
        + '</details>';
}

function stewardshipEventLine(entry) {
    const year = entry.year ? 'Year ' + number(entry.year) : 'Day ' + number(entry.day);
    const area = number(entry.area) + (entry.area === 1 ? ' tile' : ' tiles');
    const progress = entry.progress !== null && entry.progress !== undefined
        ? ' · ' + pct(entry.progress) + '% recovered' : '';
    const stock = entry.stockBefore !== null && entry.stockAfter !== null
        ? ' · stock ' + number(entry.stockBefore) + ' → ' + number(entry.stockAfter) : '';
    const amount = entry.amount ? ' · +' + number(entry.amount) + ' stand units' : '';
    const escaped = entry.escaped ? ' · ESCAPED' : '';
    const flood = entry.beforeFlood !== null && entry.afterFlood !== null
        ? ' · flood ' + pct(entry.beforeFlood) + '% → ' + pct(entry.afterFlood) + '%' : '';
    return '<li data-forest-chronicle="' + esc(entry.kind) + '"><b>' + esc(year) + '</b> · '
        + esc(entry.label) + ' · ' + area + progress + stock + amount + flood + escaped + '</li>';
}

function regionHistoryBlock(survey) {
    const pulse = survey.succession || {};
    const regions = Array.isArray(survey.regions) ? survey.regions : [];
    const countLabel = (count, one, many) => {
        const value = Number(count) || 0;
        return number(value) + ' ' + (value === 1 ? one : many);
    };
    const rows = regions.map(region => {
        const sample = region.sample || {};
        const disturbances = region.disturbances || {};
        const kinds = Object.entries(disturbances.byKind || {})
            .map(([kind, count]) => String(kind).replace(/-/g, ' ') + ' ' + number(count)).join(' · ');
        // Player orders must not be crowded out by later natural events. Show
        // the latest orders first, then the latest disturbance/spread records.
        const allHistory = region.history || [];
        const history = [
            ...allHistory.filter(entry => entry.source === "stewardship").slice(0, 4),
            ...allHistory.filter(entry => entry.source !== "stewardship").slice(0, 3),
        ];
        const status = sample.biodiversity !== undefined
            ? 'Biodiversity ' + pct(sample.biodiversity) + '% · Erosion '
                + pct(sample.erosion) + '% · Flood ' + pct(sample.flood)
                + '% · Wetness ' + pct(sample.wetness) + '% · Regrowth '
                + pct(sample.regeneration) + '%'
            : 'No live ecology sample at this survey window';
        return '<details class="forest-atlas__region" data-forest-region="' + esc(region.id)
            + '" data-forest-region-biodiversity="' + pct(sample.biodiversity)
            + '" data-forest-region-flood="' + pct(sample.flood) + '">'
            + '<summary><span>' + esc(region.label) + '</span><small>' + countLabel(region.count, 'sampled stand', 'sampled stands')
            + ' · ' + esc(status) + '</small></summary>'
            + '<div class="command-note"><b>CURRENT</b> ' + esc(status)
            + (sample.erosionClass ? ' · erosion ' + esc(sample.erosionClass) : '')
            + (sample.biodiversityClass ? ' · habitat ' + esc(sample.biodiversityClass) : '')
            + (sample.drained ? ' · DRAINED WETLAND' : '')
            + (sample.firebreak ? ' · FIREBREAK ACTIVE TO DAY ' + number(sample.firebreakUntil) : '')
            + ' · ' + countLabel(disturbances.active || 0, 'active disturbance tile', 'active disturbance tiles')
            + (kinds ? ' (' + esc(kinds) + ')' : '') + '.</div>'
            + '<ul class="forest-atlas__chronicle">'
            + (history.length ? history.map(stewardshipEventLine).join('')
                : '<li data-forest-chronicle="none">No disturbance event or stewardship order is recorded in this region yet.</li>')
            + '</ul></details>';
    }).join('');
    return '<div class="command-section-title">FOREST STEWARDSHIP &amp; REGION HISTORY</div>'
        + '<div class="command-summary" data-forest-stewardship="' + number(pulse.stewardshipActions) + '" data-forest-firebreaks="'
        + number(pulse.firebreaks) + '" data-forest-drained="' + number(pulse.drained) + '">'
        + '<div><small>PLAYER ORDERS</small><strong>' + number(pulse.stewardshipActions) + '</strong></div>'
        + '<div><small>FIREBREAKS</small><strong>' + countLabel(pulse.firebreaks, 'TILE', 'TILES') + '</strong></div>'
        + '<div><small>DRAINED SITES</small><strong>' + number(pulse.drained) + '</strong></div>'
        + '<div><small>REPLANTED</small><strong>' + countLabel(pulse.planted, 'UNIT', 'UNITS') + '</strong></div>'
        + '<div><small>REGIONS CHRONICLED</small><strong>' + number(regions.length) + '</strong></div></div>'
        + '<p class="command-note">Orders are issued from a Lumber Yard or Forester\'s Lodge: reforest a clearing, clear a firebreak belt, set a controlled burn, or drain/restore a wet stand. Every order costs real stores, is saved with the realm and writes into the region history below; disturbance area, recovery and current biodiversity, erosion, flood and wetness are read from the same stand model the simulation uses.</p>'
        + '<div class="forest-atlas__regions">' + rows + '</div>';
}

function industryInputLabel(mode) {
    const parts = [];
    for (const [good, amount] of Object.entries(mode.standard || {})) parts.push(amount + " " + (good === "water" ? "water" : good));
    if (mode.timber) parts.push(mode.timber.amount + " regional timber");
    for (const [good, amount] of Object.entries(mode.raw || {})) parts.push(amount + " " + (FOREST_GOODS[good]?.label || good));
    return parts.length ? parts.join(" · ") : "no material input";
}

const industryRound2 = value => Math.round((Number(value) || 0) * 100) / 100;
const industryProduction = () => {
    const economy = state.economy || (state.economy = {});
    const production = economy.productionChains || (economy.productionChains = {});
    for (const key of ["forestBatches", "forestRawConsumed", "forestFinished", "forestGold", "forestCursor"]) {
        production[key] = Math.max(0, Number(production[key]) || 0);
    }
    production.forestFurniturePremium = Math.max(0, Math.min(0.4, Number(production.forestFurniturePremium) || 0));
    return production;
};

// forestIndustrySummary() derives twenty market quotes in one task. Each quote
// reads live warehouse stock, so the atlas rebuilds the same summary one good
// at a time and keeps only the exact fields its markup consumes.
function fillIndustrySummary(summary) {
    summary.counts = {};
    summary.rows = [];
    let works = [];
    let masteries = [];
    return {
        html: "",
        more: [
            () => {
                works = state.entities.filter(entity => !entity.dead && entity.type === TYPE.FOREST_WORKS);
                for (const building of works) {
                    const id = forestWorksModeFor(building).id;
                    summary.counts[id] = (summary.counts[id] || 0) + 1;
                    if (building.lastForestBatch && (!summary.lastBatch || building.lastForestBatch.tick > summary.lastBatch.tick)) {
                        summary.lastBatch = building.lastForestBatch;
                    }
                }
                masteries = works.map(forestMasteryFor);
                return "";
            },
            ...Object.keys(INDUSTRY_GOODS).map(good => () => {
                const def = INDUSTRY_GOODS[good];
                const stock = Math.max(0, Number(getPhysicalStock(good)) || 0);
                if (stock <= 0) return "";
                const price = industryQuote(good);
                summary.rows.push({ id: good, label: def.label, use: def.use, stock, price, value: industryRound2(stock * price) });
                return "";
            }),
            () => {
                summary.rows.sort((a, b) => b.stock - a.stock || b.price - a.price || a.id.localeCompare(b.id));
                const production = industryProduction();
                summary.works = works.length;
                summary.masteryBatches = masteries.reduce((sum, entry) => sum + entry.batches, 0);
                summary.masteryLevel = masteries.reduce((max, entry) => Math.max(max, entry.level), 1);
                summary.masteryLabel = masteries.reduce((best, entry) => entry.level > best.level ? entry : best,
                    masteries[0] || forestMasteryFor(null)).label;
                summary.activeModes = Object.keys(summary.counts).length;
                summary.stored = summary.rows.reduce((sum, row) => sum + row.stock, 0);
                summary.value = industryRound2(summary.rows.reduce((sum, row) => sum + row.value, 0));
                summary.batches = production.forestBatches;
                summary.rawConsumed = production.forestRawConsumed;
                summary.finished = production.forestFinished;
                summary.gold = production.forestGold;
                summary.furniturePremium = production.forestFurniturePremium;
                return "";
            },
        ],
    };
}

const guildInteger = (value, min, max) => {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? Math.floor(numeric) : min;
    return Math.max(min, Math.min(max, safe));
};
const guildTickNow = () => Math.max(0, Math.floor(Number(state.tick) || 0));
const guildPatronFor = id => FOREST_GUILD_PATRONS.find(patron => patron.id === id) || null;
const guildPatronLedger = guild => {
    if (!guild.patrons || typeof guild.patrons !== "object" || Array.isArray(guild.patrons)) guild.patrons = {};
    for (const patron of FOREST_GUILD_PATRONS) {
        const entry = guild.patrons[patron.id] && typeof guild.patrons[patron.id] === "object" ? guild.patrons[patron.id] : {};
        guild.patrons[patron.id] = {
            deliveries: guildInteger(entry.deliveries, 0, 1000000),
            pacts: guildInteger(entry.pacts, 0, 1000000),
            active: Boolean(entry.active),
            lastTick: guildInteger(entry.lastTick, 0, Number.MAX_SAFE_INTEGER),
        };
    }
    return guild.patrons;
};
const guildWarehouseAvailable = good => {
    let total = 0;
    for (const entity of state.entities) {
        if (!entity || entity.dead || !entity.warehouse || !Array.isArray(entity.warehouse.filters)) continue;
        if (!entity.warehouse.filters.includes(good)) continue;
        const stored = Math.max(0, Number(entity.warehouse.stored?.[good]) || 0);
        const reserved = Math.max(0, Number(entity.warehouse.reservedOut?.[good]) || 0);
        total += Math.max(0, stored - reserved);
    }
    return total;
};
const guildPatronGoodsPremium = good => {
    let total = 0;
    const guild = state.economy?.productionChains?.forestGuild;
    if (!guild || typeof guild !== "object") return 0;
    const patrons = guildPatronLedger(guild);
    for (const patron of FOREST_GUILD_PATRONS) {
        if (!patrons[patron.id]?.active || !patron.bonus) continue;
        if (!patron.bonus.goods.includes(good)) continue;
        if (patron.bonus.kind === "goods-premium" || patron.bonus.kind === "naval-trade" || patron.bonus.kind === "furniture-prestige") {
            total += Number(patron.bonus.value) || 0;
        }
    }
    return total;
};
const guildCommissionView = (entry, guild) => {
    const def = INDUSTRY_GOODS[entry.good];
    const stock = guildWarehouseAvailable(entry.good);
    const proofStock = entry.requirement ? furnitureLotProof(entry.requirement.styleId, entry.requirement.minScore) : null;
    const caravan = entry.caravan;
    const caravanDays = caravan.status === "enroute" || caravan.status === "delayed"
        ? Math.max(0, Math.ceil(caravan.arrivalTick - guildTickNow())) : 0;
    const supplyReady = stock >= entry.quantity && (!entry.requirement || proofStock >= entry.quantity);
    return {
        ...entry,
        caravan,
        caravanDays,
        caravanStatus: caravan.status,
        label: def?.label || entry.good,
        use: def?.use || "",
        stock,
        proofStock,
        supplyReady,
        ready: supplyReady && caravan.status === "arrived",
        daysLeft: Math.max(0, Math.ceil(entry.deadlineTick - guildTickNow())),
        premiumPct: Math.round(forestGuildTierFor(guild.renown).premium * 100),
        patronBonusPct: Math.round(guildPatronGoodsPremium(entry.good) * 100),
    };
};

// The guild summary reads every commission against live warehouse stock. Each
// order is now resolved in its own part instead of one 45 ms summary call.
function fillGuildSummary(summary) {
    return {
        html: "",
        more: [
            () => {
                const guild = ensureForestGuild();
                const tier = forestGuildTierFor(guild.renown);
                const next = forestGuildNextTier(guild.renown);
                summary.renown = guild.renown;
                summary.tier = tier.tier;
                summary.tierTitle = tier.title;
                summary.tierLabel = "TIER " + tier.tier + " · " + tier.title;
                summary.premiumPct = Math.round(tier.premium * 100);
                summary.nextTier = next ? { tier: next.tier, title: next.title, at: next.renown, remaining: Math.max(0, next.renown - guild.renown) } : null;
                summary.progress = next ? Math.max(0, Math.min(1, (guild.renown - tier.renown) / Math.max(1, next.renown - tier.renown))) : 1;
                summary.completed = guild.completed;
                summary.expired = guild.expired;
                summary.totalGold = guild.totalGold;
                summary.totalDelivered = guild.totalDelivered;
                summary.lastEvent = guild.lastEvent;
                summary.activeLimit = FOREST_GUILD_ACTIVE_LIMIT;
                summary.historyLimit = FOREST_GUILD_HISTORY_LIMIT;
                summary.active = [];
                summary._guild = guild;
                return "";
            },
            () => {
                const guild = summary._guild;
                summary.history = guild.history.slice(-FOREST_GUILD_HISTORY_LIMIT).reverse().map(entry => ({
                    ...entry,
                    label: INDUSTRY_GOODS[entry.good]?.label || entry.good,
                    patronName: guildPatronFor(entry.patronId)?.name || "Forest Guild",
                }));
                const patrons = guildPatronLedger(guild);
                summary.pacts = FOREST_GUILD_PATRONS.filter(patron => patrons[patron.id]?.active).length;
                summary.patrons = FOREST_GUILD_PATRONS.map(patron => {
                    const standing = patrons[patron.id];
                    return {
                        id: patron.id, name: patron.name, seal: patron.seal, faction: patron.faction,
                        deliveries: standing.deliveries, pacts: standing.pacts, active: standing.active,
                        threshold: FOREST_PATRON_PACT_DELIVERIES,
                        progress: standing.active ? 1 : Math.min(1, standing.deliveries / FOREST_PATRON_PACT_DELIVERIES),
                        bonusKind: patron.bonus?.kind || "none", bonusPct: Math.round((Number(patron.bonus?.value) || 0) * 100),
                        bonusLabel: standing.active ? patron.bonus?.label || "" : "Pact after " + FOREST_PATRON_PACT_DELIVERIES + " deliveries · " + (patron.bonus?.label || "no standing bonus"),
                    };
                });
                return "";
            },
            ...Array.from({ length: FOREST_GUILD_ACTIVE_LIMIT }, (_, index) => () => {
                const guild = summary._guild;
                if (!guild.active[index]) return "";
                summary.active.push(guildCommissionView(guild.active[index], guild));
                return "";
            }),
        ],
    };
}

function guildShellMarkup(guild) {
    return '<div class="command-section-title">FOREST GUILD · LIVING COMMISSION BOARD</div>'
        + '<div class="command-summary forest-atlas__guild" data-forest-guild="' + number(guild.completed) + '" data-forest-guild-tier="' + number(guild.tier) + '" data-forest-guild-renown="' + number(guild.renown) + '" data-forest-guild-active="' + number(guild.active.length) + '">'
        + '<div><small>GUILD RENOWN</small><strong>' + number(guild.renown) + '</strong></div>'
        + '<div><small>STANDING</small><strong>TIER ' + number(guild.tier) + ' · ' + esc(guild.tierTitle) + '</strong></div>'
        + '<div><small>COMMISSION PREMIUM</small><strong>+' + number(guild.premiumPct) + '%</strong></div>'
        + '<div><small>FILLED / LAPSED</small><strong>' + number(guild.completed) + ' / ' + number(guild.expired) + '</strong></div>'
        + '<div><small>ACTIVE ORDERS</small><strong>' + number(guild.active.length) + ' / ' + number(guild.activeLimit) + '</strong></div>'
        + '<div><small>LIFETIME GUILD GOLD</small><strong>' + number(guild.totalGold) + ' G</strong></div></div>'
        + '<div class="forest-atlas__guild-progress" data-guild-progress="' + Math.round(guild.progress * 100) + '"><span style="width:' + Math.round(guild.progress * 100) + '%"></span></div>'
        + '<p class="command-note">' + (guild.nextTier ? number(guild.nextTier.remaining) + ' renown to tier ' + number(guild.nextTier.tier) + ' · ' + esc(guild.nextTier.title) + '. ' : 'The highest guild tier is held. ')
        + 'Each filled order consumes real, unreserved warehouse stock and pays gold, renown and faction standing. A lapsed order costs 3 renown. Every filled or lapsed order is replaced immediately from 16 patrons and all 20 forest goods, so the board never runs out.</p>';
}

function guildCommissionMarkup(entry) {
    const requirement = entry.requirement
        ? '<small class="forest-atlas__commission-proof" data-forest-proof="' + esc(entry.id) + '"><b>REQUIRED STYLE</b> ' + esc(entry.requirement.style) + ' · <b>QUALITY</b> ' + esc(entry.requirement.quality) + ' · ' + number(entry.proofStock) + ' / ' + number(entry.quantity) + ' CERTIFIED</small>'
        : '';
    const caravan = entry.caravan
        ? '<div class="forest-atlas__commission-caravan" data-forest-caravan-status="' + esc(entry.caravan.status) + '"><b>CARAVAN</b> ' + esc(String(entry.caravan.status).toUpperCase()) + (entry.caravanDays ? ' · ' + number(entry.caravanDays) + ' DAYS' : '') + '</div>'
        : '';
    const action = entry.caravanStatus === "raided"
        ? '<button type="button" class="command-choice" data-forest-caravan="' + esc(entry.id) + '">ESCORT CARAVAN · ' + number(entry.caravan.escortCost) + ' G</button>'
        : '<button type="button" class="command-choice" data-forest-commission="' + esc(entry.id) + '"' + (entry.ready ? '' : ' disabled') + '>FILL COMMISSION</button>';
    const stockLine = entry.ready ? 'READY · CARAVAN ARRIVED' : entry.caravanStatus !== "arrived" ? 'WAITING FOR CARAVAN' : number(entry.stock) + ' IN STORE';
    return '<article class="forest-atlas__commission" data-forest-commission-card="' + esc(entry.id) + '" data-forest-commission-good="' + esc(entry.good) + '">'
        + '<header><span>' + esc(entry.patronId.slice(0, 2).toUpperCase()) + '</span><b>' + esc(entry.title) + '</b></header>'
        + '<div class="forest-atlas__commission-main"><strong>' + number(entry.quantity) + ' ' + esc(entry.label) + '</strong>'
        + '<span>' + esc(stockLine) + '</span></div>'
        + '<p>' + esc(entry.story) + '</p>' + requirement + caravan
        + '<div class="forest-atlas__commission-reward"><span>+' + number(entry.rewardGold) + ' G</span><span>+' + number(entry.rewardRenown) + ' RENOWN</span><span>' + number(entry.daysLeft) + ' DAYS</span></div>'
        + action + '<small>' + esc(entry.use) + '</small></article>';
}

function guildCommissionGridMarkup(guild) {
    const cards = guild.active.map(guildCommissionMarkup).join("");
    return '<div class="forest-atlas__commission-grid">' + (cards || '<p class="command-note">The guild board is being drawn.</p>') + '</div>';
}

function guildPatronsMarkup(guild) {
    const rows = guild.patrons.map(patron => '<div class="forest-atlas__patron" data-patron-pact="' + esc(patron.id) + '" data-patron-active="' + (patron.active ? '1' : '0') + '"><span>' + esc(patron.seal) + '</span><b>' + esc(patron.name) + '</b><small>' + (patron.active ? 'PACT · ' : '') + esc(patron.bonusLabel) + ' · ' + number(patron.deliveries) + ' deliveries</small><em>' + (patron.active ? 'ACTIVE +' + number(patron.bonusPct) + '%' : Math.round(patron.progress * 100) + '%') + '</em></div>').join("");
    return '<details class="forest-atlas__field-guide" data-patron-pacts="' + number(guild.pacts) + '"><summary><span>PATRON PACT REGISTER · ' + number(guild.pacts) + ' / ' + number(guild.patrons.length) + ' SIGNED</span><strong>Each patron is a permanent relationship</strong><em>Every pact changes a named market or research path</em></summary><div class="forest-atlas__patron-grid">' + rows + '</div></details>';
}

function guildMasterworksMarkup() {
    const masterworks = forestMasterworkArchive();
    const rows = masterworks.length ? masterworks.slice(0, 8).map(entry => '<div class="forest-atlas__masterwork" data-masterwork="' + esc(entry.id) + '"><b>' + esc(entry.style) + '</b><small>' + esc(entry.master) + ' · ' + esc(entry.region) + ' · year ' + number(entry.year) + ' · ' + number(entry.value) + ' G value</small></div>').join("") : '<p class="command-note">No masterwork has left a Forest Works yet. Mastery batches can produce one.</p>';
    return '<details class="forest-atlas__field-guide" data-masterwork-count="' + number(masterworks.length) + '"><summary><span>MASTERWORK FURNITURE · ' + number(masterworks.length) + '</span><strong>Provenance survives the workshop</strong><em>Region, workshop, master and year</em></summary><div class="forest-atlas__masterworks">' + rows + '</div></details>';
}

function guildClinicMarkup() {
    const medicine = Math.max(0, Math.floor(Number(state.health?.medicineStock) || 0));
    const medicineAvailable = Math.max(0, Math.floor(Number(state.entities.reduce((sum, entity) => {
        if (!entity || entity.dead || !entity.warehouse || !Array.isArray(entity.warehouse.filters) || !entity.warehouse.filters.includes("medicine")) return sum;
        const stored = Math.max(0, Number(entity.warehouse.stored?.medicine) || 0);
        const reserved = Math.max(0, Number(entity.warehouse.reservedOut?.medicine) || 0);
        return sum + Math.max(0, stored - reserved);
    }, 0)) || 0));
    return '<div class="forest-atlas__clinic" data-clinic-medicine-stock="' + number(medicine) + '" data-clinic-medicine-available="' + number(medicineAvailable) + '">'
        + '<div><small>CLINIC MEDICINE STORE</small><strong>' + number(medicine) + ' / ' + number(MEDICINE_MAX_STOCK) + ' DOSES</strong><p>' + (medicineAvailable > 0 ? number(medicineAvailable) + ' doses sit unreserved in forest-works warehouses.' : 'No warehouse holds unreserved medicine. Run the apothecary or buy medicine from the forest exchange.') + '</p></div>'
        + '<button type="button" class="command-choice" data-clinic-medicine="6"' + (medicineAvailable > 0 && medicine < MEDICINE_MAX_STOCK ? '' : ' disabled') + '>SUPPLY 6 DOSES</button></div>';
}

function guildHistoryMarkup(guild) {
    const rows = guild.history.length
        ? guild.history.map(entry => '<div class="forest-atlas__guild-history-row" data-guild-history="' + esc(entry.outcome) + '"><span>' + number(entry.year) + '</span><b>' + esc(entry.label) + ' ×' + number(entry.quantity) + '</b><small>' + esc(entry.patronName) + ' · ' + (entry.outcome === "expired" ? "LAPSED" : '+' + number(entry.rewardGold) + ' G') + '</small></div>').join("")
        : '<p class="command-note">No commission has been filled or lapsed yet.</p>';
    return '<details class="forest-atlas__field-guide" data-forest-guild-history="' + number(guild.history.length) + '"><summary><span>GUILD LEDGER · LAST ' + number(guild.historyLimit) + '</span><strong>Every order leaves a record</strong><em>Filled and lapsed commissions</em></summary>'
        + '<div class="forest-atlas__guild-history">' + rows + '</div></details>';
}

function guildParts() {
    const guild = {};
    return {
        html: "",
        more: [
            fillGuildSummary(guild),
            () => ({ html: guildShellMarkup(guild) }),
            () => ({ html: guildCommissionGridMarkup(guild) }),
            () => ({ html: guildPatronsMarkup(guild) }),
            () => ({ html: guildMasterworksMarkup() }),
            () => ({ html: guildClinicMarkup() }),
            () => ({ html: guildHistoryMarkup(guild) }),
        ],
    };
}

function guildBlock() {
    return joinParts(guildParts());
}

function cultureActionButton(action, label, detail, disabled) {
    return '<button type="button" class="command-choice culture-action" data-culture-action="' + esc(action) + '"'
        + (disabled ? ' disabled title="' + esc(detail) + '"' : ' title="' + esc(detail) + '"')
        + '><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></button>';
}

const cultureRightsOptions = [
    { id: "balance", label: "BALANCE", detail: "Forage, game and timber share the wood" },
    { id: "commons", label: "COMMONS", detail: "Village farms, herds and forage first" },
    { id: "hunt", label: "HUNTING", detail: "Game and the hunting court first" },
    { id: "timber", label: "TIMBER", detail: "Woodcutters and the timber court first" },
];
const cultureKnowledgeOptions = [
    { key: "forestry", label: "Woodland forestry", id: "woodland-forestry" },
    { key: "herbalism", label: "Woodland herb lore", id: "woodland-herb-lore" },
    { key: "astronomy", label: "Natural astronomy", id: "woodland-astronomy" },
    { key: "cartography", label: "Woodland cartography", id: "woodland-cartography" },
    { key: "philosophy", label: "Natural philosophy", id: "woodland-natural-philosophy" },
];
const cultureRoleOptions = [
    ["druids", "Druids & woodland priests"], ["foresters", "Foresters & wardens"],
    ["woodcutters", "Woodcutters"], ["charcoal", "Charcoal kiln communities"],
    ["forestFarmers", "Forest farmers"], ["herders", "Transhumant herders"],
    ["herbWives", "Herb-wives & healers"], ["hermits", "Hermits & forest shrines"],
    ["monasteries", "Forest monasteries"], ["scholars", "Woodland scholars"],
    ["singers", "Work singers"], ["hunters", "Hunting parties"],
];

function cultureShellMarkup(culture) {
    const profile = culture.profile;
    const calendar = culture.calendar.windows.map(window => '<div class="' + (window.id === culture.calendar.active.id ? 'is-current' : '') + '" data-culture-calendar="' + esc(window.id) + '"><small>' + esc(window.label.toUpperCase()) + '</small><strong>' + esc(window.detail) + '</strong></div>').join("");
    return '<section class="forest-culture" data-forest-culture="' + number(culture.requirementCount) + '" data-culture-region="' + esc(culture.homeRegion || "none") + '">'
        + '<div class="command-section-title">FOREST CULTURE · 1.2.23.1.181–210 · ' + number(culture.requirementCount) + ' POINTS</div>'
        + '<p class="command-note">The home wood has a name, a spirit, a taboo and a calendar. These are not a second economy: the grove guard uses the shared forest tile, the roles are real workers, and the rights change the same forage, hunt, farm, pannage and timber visits.</p>'
        + '<div class="command-summary culture-summary">'
        + '<div data-culture-favor="' + number(culture.favor) + '"><small>GROVE FAVOUR</small><strong>' + number(culture.favor) + ' / 100</strong></div>'
        + '<div data-culture-groves="' + number(culture.groves.length) + '"><small>SACRED GROVES</small><strong>' + number(culture.groves.length) + ' / ' + number(culture.groveLimit) + '</strong></div>'
        + '<div><small>FOREST RIGHT</small><strong>' + esc(culture.rights.label.toUpperCase()) + '</strong></div>'
        + '<div data-culture-lore="' + number(culture.lore.length) + '"><small>WOODLORE</small><strong>' + number(culture.lore.length) + ' ENTRIES</strong></div>'
        + '<div><small>OPEN CONFLICTS</small><strong>' + number(culture.counts.openConflicts) + '</strong></div>'
        + '<div><small>GROVE VITALITY</small><strong>' + number(culture.groveVitality) + ' / 100</strong></div>'
        + '<div><small>HUNT INITIATES</small><strong>' + number(culture.initiates) + '</strong></div></div>'
        + (profile ? '<div class="culture-profile" data-culture-profile="' + esc(profile.id) + '"><div class="culture-profile__head"><span>HOME WOOD · ' + esc(profile.region.toUpperCase()) + '</span><strong>' + esc(profile.spirit) + '</strong><p>' + esc(profile.tradition) + ' · ' + esc(profile.sacredTree) + '</p></div>'
            + '<div class="culture-profile__grid"><div><small>TABOO</small><p>' + esc(profile.taboo) + '</p></div><div><small>WORK TECHNIQUE</small><p>' + esc(profile.workTechnique) + '</p></div><div><small>HUNT RULE</small><p>' + esc(profile.huntRule) + '</p></div><div><small>PHILOSOPHY</small><p>' + esc(profile.philosophy) + '</p></div></div>'
            + '<p class="command-note">Paths: ' + esc((profile.paths || []).join(" · ")) + ' · Festival cycle: ' + esc((profile.festivals || []).map(entry => entry.name).join(" · ")) + '</p>'
            + '<div class="culture-tale">'
            + '<div class="culture-tale__entry"><small>REGIONAL TALE</small><strong>' + esc(profile.tale.title) + '</strong><p>' + esc(profile.tale.moral) + '</p></div>'
            + '<div class="culture-tale__entry"><small>LEGEND OF THE LOST WOOD</small><strong>' + esc(profile.legend.title) + '</strong><p>' + esc(profile.legend.text) + '</p></div>'
            + '<div class="culture-tale__entry"><small>WORK SONG</small><strong>' + esc(profile.song.title) + '</strong><p>' + esc(profile.song.verse) + '</p></div>'
            + '</div></div>' : '<p class="command-note">No regional culture is available: the realm has no living forest near a shrine or hall.</p>')
        + '<div class="command-section-title">FOREST CALENDAR</div><div class="culture-calendar" data-culture-season="' + number(culture.calendar.season) + '">' + calendar + '</div>'
        + (profile ? '<p class="command-note">Bloom window: ' + esc(profile.calendar.bloom) + ' · Hunt window: ' + esc(profile.calendar.hunt) + ' · Felling window: ' + esc(profile.calendar.felling) + '</p>' : '');
}

function cultureRitesMarkup(culture) {
    const actions = culture.actions;
    const festivals = (culture.festivals || []).map(entry => {
        const key = entry.id === "spring" ? "festivalSpring" : entry.id === "woodcut" ? "festivalWoodcut" : "festivalHarvest";
        const availability = actions[key] || actions.festival;
        const cost = entry.cost || { food: 0, gold: 0 };
        return cultureActionButton("festival-" + entry.id, entry.name.toUpperCase(),
            seasonNames[entry.season] + " · " + cost.food + " food · " + cost.gold + " gold · " + availability.reason,
            !availability.ok);
    }).join("");
    const offerings = [
        ["honey", "HONEY", "favour and devotion"],
        ["herbs", "HERBS", "healers' medicine"],
        ["mushrooms", "MUSHROOMS", "morale and study"],
    ].map(([good, label, detail]) => cultureActionButton("offering-" + good, "OFFER " + label,
        "2 " + good + " · " + detail + " · " + actions["offering" + good[0].toUpperCase() + good.slice(1)].reason,
        !actions["offering" + good[0].toUpperCase() + good.slice(1)].ok)).join("");
    return '<div class="command-section-title">RITUAL ACTIONS</div><div class="culture-actions">'
        + cultureActionButton("grove", "DEDICATE GROVE", "12 wood · 8 gold · " + actions.grove.reason, !actions.grove.ok)
        + cultureActionButton("hunt", "HUNT RITE", "4 food · " + actions.hunt.reason, !actions.hunt.ok)
        + cultureActionButton("wedding", "TREE WEDDING", "10 gold · " + actions.wedding.reason, !actions.wedding.ok)
        + cultureActionButton("lore", "COLLECT WOODLORE", actions.lore.reason, !actions.lore.ok)
        + '</div>'
        + '<div class="command-section-title">FESTIVAL CYCLE · THREE SEASONS</div><div class="culture-actions culture-festivals">' + festivals + '</div>'
        + '<div class="command-section-title">OFFERINGS · ONE GIFT PER SEASON</div><div class="culture-actions culture-offerings">' + offerings + '</div>';
}

function cultureGrovesMarkup(culture) {
    const actions = culture.actions;
    const currentYear = Math.floor(Number(state.year) || 0);
    const groves = culture.groves.length ? culture.groves.map(grove => {
        const tended = Math.floor(Number(grove.tendedYear) || 0) === currentYear;
        const canTend = actions.tend.ok && !tended;
        return '<article class="culture-grove" data-culture-grove="' + esc(grove.id) + '" data-grove-protected="1" data-grove-trait="' + esc(grove.trait) + '">'
            + '<div><span class="command-ribbon">PROTECTED · ' + esc(grove.traitLabel.toUpperCase()) + '</span><strong>' + esc(grove.label) + '</strong>'
            + '<p>' + esc(grove.region) + ' · tile ' + number(grove.x) + ', ' + number(grove.y) + ' · devotion ' + number(grove.devotion) + ' / 100 · vitality ' + number(grove.vitality) + ' / 100</p>'
            + '<div class="culture-grove__vitality" title="Grove vitality"><i style="width:' + percent(grove.vitality) + '%"></i></div>'
            + '<small>' + esc(grove.traitDetail) + ' Age ' + number(grove.ageYears) + ' years. Consecrated year ' + number(grove.foundedYear) + '; the axe and the hunter are refused on this tile.</small>'
            + (tended ? '<small>This grove has been tended this year.</small>'
                : '<button type="button" class="command-choice culture-tend" data-culture-tend="' + esc(grove.id) + '"' + (canTend ? '' : ' disabled title="' + esc(actions.tend.reason) + '"') + '>TEND GROVE · 2 FOOD</button>')
            + '</div></article>';
    }).join("") : '<p class="command-note">No grove is consecrated. A shrine beside living forest can withdraw its first tile from the axe.</p>';
    return '<div class="command-section-title">SACRED GROVES · ' + number(culture.groves.length) + ' / ' + number(culture.groveLimit) + '</div><div class="culture-groves" data-culture-grove-count="' + number(culture.groves.length) + '">' + groves + '</div>'
        + '<div class="command-section-title">CRAFT &amp; KNOWLEDGE</div><div class="culture-actions culture-craft">'
        + cultureActionButton("hermit", "CONSULT HERMIT", actions.hermit.reason, !actions.hermit.ok)
        + cultureActionButton("school", "HOLD FOREST SCHOOL", "3 food · 6 gold · " + actions.school.reason, !actions.school.ok)
        + cultureActionButton("remedy", "BREW REMEDIES", "2 herbs · 1 honey · " + actions.remedy.reason, !actions.remedy.ok)
        + '</div>';
}

function cultureRightsMarkup(culture) {
    const actions = culture.actions;
    const conflicts = culture.conflicts.length ? culture.conflicts.map(entry => '<article class="culture-conflict' + (entry.resolved ? ' is-resolved' : '') + '" data-culture-conflict="' + esc(entry.id) + '" data-resolved="' + (entry.resolved ? '1' : '0') + '">'
        + '<div><span class="command-ribbon">' + esc(entry.kind.toUpperCase()) + ' · ' + (entry.resolved ? 'SETTLED ' + number(entry.resolvedYear) : 'OPEN SINCE ' + number(entry.sinceYear)) + '</span>'
        + '<strong>' + esc(entry.label) + '</strong><p>' + esc(entry.detail) + '</p></div>'
        + (entry.resolved ? '' : '<button type="button" class="command-choice" data-culture-mediate="' + esc(entry.id) + '"' + (actions.mediate.ok ? '' : ' disabled title="' + esc(actions.mediate.reason) + '"') + '>MEDIATE · 6G</button>') + '</article>').join("") : '<p class="command-note">No wood-right conflict is open. Extreme rights and a protected grove can still create one.</p>';
    return '<div class="command-section-title">WOOD-RIGHT · ' + esc(culture.rights.label.toUpperCase()) + '</div><div class="culture-rights">'
        + cultureRightsOptions.map(right => '<button type="button" class="command-choice' + (culture.rights.priority === right.id ? ' is-current' : '') + '" data-culture-rights="' + right.id + '"' + (actions.rights.ok ? '' : ' disabled title="' + esc(actions.rights.reason) + '"') + '><strong>' + right.label + '</strong><small>' + esc(right.detail) + '</small></button>').join("")
        + '</div><p class="command-note">' + esc(actions.rights.reason) + '. A forester must hold office; the law changes once a year.</p>'
        + '<div class="command-section-title">LIVING WOOD-RIGHT CONFLICTS</div>' + conflicts;
}

function cultureRolesMarkup(culture) {
    const actions = culture.actions;
    const roles = culture.roles;
    const doctrines = (culture.doctrines || []).map(entry => '<button type="button" class="command-choice'
        + (culture.doctrine?.id === entry.id ? ' is-current' : '') + '" data-culture-doctrine="' + esc(entry.id) + '"'
        + (actions.doctrine.ok ? '' : ' disabled title="' + esc(actions.doctrine.reason) + '"')
        + '><strong>' + esc(entry.label.toUpperCase()) + '</strong><small>' + esc(entry.detail) + '</small></button>').join("");
    return '<div class="command-section-title">WOODLAND ROLES · REAL WORKERS</div><div class="culture-roles">'
        + cultureRoleOptions.map(([key, label]) => '<div data-culture-role="' + key + '"><small>' + esc(label.toUpperCase()) + '</small><strong>' + number(roles[key]) + '</strong></div>').join("")
        + '</div>'
        + '<p class="command-note">Hunt initiates: ' + number(culture.initiates) + ' · Forest-school apprentices: ' + number(culture.apprentices) + ' · School meetings: ' + number(culture.teachings) + '.</p>'
        + '<div class="command-section-title">WOODLAND KNOWLEDGE · ' + number(culture.knowledgeCount) + ' / 5</div><div class="culture-knowledge">'
        + cultureKnowledgeOptions.map(entry => '<div class="' + (culture.knowledge[entry.key] ? 'is-known' : '') + '" data-culture-tech="' + esc(entry.id) + '"><small>' + (culture.knowledge[entry.key] ? 'KNOWN' : 'RESEARCH') + '</small><strong>' + esc(entry.label) + '</strong></div>').join("")
        + '</div>'
        + '<div class="command-section-title">NATURE PHILOSOPHY · ' + esc(culture.doctrine.label.toUpperCase()) + '</div><div class="culture-doctrines" data-culture-doctrine-id="' + esc(culture.doctrine.id) + '">' + doctrines + '</div>'
        + '<p class="command-note">' + esc(culture.doctrine.detail) + ' ' + esc(actions.doctrine.reason) + '.</p>';
}

function cultureArchiveMarkup(culture) {
    const lore = culture.lore.map(entry => '<article class="culture-lore-card" data-culture-lore="' + esc(entry.kind) + '">'
        + '<span class="command-ribbon">' + esc(entry.label || entry.kind.toUpperCase()) + ' · ' + number(entry.year) + '</span>'
        + '<strong>' + esc(entry.title) + '</strong><p>' + esc(entry.text) + '</p>'
        + '<small>' + esc(REGIONAL_FOREST_TYPES.find(type => type.id === entry.regionId)?.short || entry.regionId || "home wood") + '</small></article>').join("");
    const guide = culture.requirements.map(requirement => '<details class="culture-requirement" data-culture-requirement="' + esc(requirement.id) + '">'
        + '<summary><span>' + esc(requirement.id) + '</span><strong>' + esc(requirement.title) + '</strong></summary>'
        + '<p>' + esc(requirement.point) + '</p><small>' + esc(requirement.consumer) + '</small><p>' + esc(requirement.detail) + '</p></details>').join("");
    return '<div class="command-section-title">LIVE CULTURE EFFECTS</div><div class="command-summary culture-effects">'
        + '<div><small>FORAGE</small><strong>×' + amount(culture.modifiers.forage) + '</strong></div>'
        + '<div><small>HUNT</small><strong>×' + amount(culture.modifiers.hunt) + '</strong></div>'
        + '<div><small>FARM</small><strong>×' + amount(culture.modifiers.farm) + '</strong></div>'
        + '<div><small>PANNAGE</small><strong>×' + amount(culture.modifiers.herd) + '</strong></div>'
        + '<div><small>MEDICINE</small><strong>×' + amount(culture.modifiers.medicine) + '</strong></div>'
        + '<div><small>TIMBER</small><strong>×' + amount(culture.modifiers.timber) + '</strong></div></div>'
        + '<div class="command-section-title">WOODLORE ARCHIVE · ' + number(culture.lore.length) + ' ENTRIES · SIX KINDS</div><div class="culture-lore">' + (lore || '<p class="command-note">No lore has been collected yet. Collect woodlore to store the region’s tale, lost-wood legend, work song, omen, custom and herb note.</p>') + '</div>'
        + '<details class="culture-guide" data-culture-guide="' + number(culture.requirementCount) + '"><summary>THIRTY-POINT CULTURE, RELIGION, SOCIETY & KNOWLEDGE FIELD GUIDE</summary><div class="culture-requirements">' + guide + '</div></details>'
        + '</section>';
}

function cultureParts() {
    let culture = null;
    return {
        html: "",
        more: [
            () => { culture = forestCultureSummary(); return ""; },
            () => ({ html: cultureShellMarkup(culture) }),
            () => ({ html: cultureRitesMarkup(culture) }),
            () => ({ html: cultureGrovesMarkup(culture) }),
            () => ({ html: cultureRightsMarkup(culture) }),
            () => ({ html: cultureRolesMarkup(culture) }),
            () => ({ html: cultureArchiveMarkup(culture) }),
        ],
    };
}

function cultureBlock() {
    return joinParts(cultureParts());
}

// The four frontier ledgers are read from the same live records as before, but
// action availability is derived here in bounded slices. The original summary
// computed every frontier in one task; the panel now computes one frontier per
// part and uses the same exported game rules, constants and tile helpers.
const warNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const warClamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, warNumber(value, min)));
const warYearNow = () => Math.max(1, Math.floor(warNumber(state.year, 1)));
const warSeasonNow = () => Math.max(0, Math.min(3, Math.floor(warNumber(state.seasonIndex, 0))));
const warRealmRow = realmId => Array.isArray(state.diplomacy?.realms)
    ? state.diplomacy.realms.find(entry => entry && entry.id === realmId) || null
    : null;
const warRealmName = realmId => DIPLOMATIC_REALMS.find(realm => realm.id === realmId)?.name || realmId;
const warCostLabel = cost => Object.entries(cost).map(([key, amount]) => amount + " " + key).join(" · ");
const warCanPay = cost => Object.entries(cost).every(([key, amount]) => key === "research"
    ? warNumber(state.research?.reserve) >= amount
    : warNumber(state.resources?.[key]) >= amount);
const warHasReadySoldier = () => state.entities.some(entity => !entity.dead
    && (entity.type === TYPE.GUARD || entity.type === TYPE.ARCHER || entity.type === TYPE.KNIGHT)
    && !(Number(entity.military?.woundedUntilTick) > Number(state.tick)));
const warRegionAnchor = regionId => {
    const definition = regionDefinitionFor(regionId);
    const anchor = definition?.anchor || { x: 0.5, y: 0.5 };
    return {
        x: Math.floor(warClamp(anchor.x, 0, 1) * Math.max(1, warNumber(state.worldW, 1))),
        y: Math.floor(warClamp(anchor.y, 0, 1) * Math.max(1, warNumber(state.worldH, 1))),
    };
};
const warFrontTile = (geo, frontRow) => {
    if (!geo?.forestStock) return null;
    const width = warNumber(state.worldW, 0), height = warNumber(state.worldH, 0);
    if (!width || !height) return null;
    const anchor = warRegionAnchor(frontRow.provinceId);
    const cx = Math.max(0, Math.min(width - 1, Math.floor(anchor.x)));
    const cy = Math.max(0, Math.min(height - 1, Math.floor(anchor.y)));
    for (let ring = 0; ring <= 16; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                const x = cx + dx, y = cy + dy;
                if (x < 0 || y < 0 || x >= width || y >= height) continue;
                const index = y * width + x;
                if (warNumber(geo.forestStock[index]) <= 4) continue;
                if (sacredGroveTileAt(x, y)) continue;
                return { x, y, index };
            }
        }
    }
    return null;
};
const warBurnTile = (geo, frontRow) => {
    const anchor = warRegionAnchor(frontRow.provinceId);
    return findBurnableForestTile(anchor.x, anchor.y, 16);
};
const warTileKey = (x, y) => Math.floor(Number(x)) + ":" + Math.floor(Number(y));
const warMapSample = (x, y) => {
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const width = Number(state.terrainPixW) || 0, height = Number(state.terrainPixH) || 0;
    if (!width || !height) return { moisture: 0.55, temperature: 0.55, height: 0.55 };
    const px = Math.max(0, Math.min(width - 1, Math.floor((x + 0.5) * resolution)));
    const py = Math.max(0, Math.min(height - 1, Math.floor((y + 0.5) * resolution)));
    const index = py * width + px;
    return {
        moisture: Number(state.moistureMap?.[index]) || 0.55,
        temperature: Number(state.temperatureMap?.[index]) || 0.55,
        height: Number(state.heightMap?.[index]) || 0.55,
    };
};
// The burn helper walks the same sixteen-tile neighbourhood as the succession
// model, generating a full stand for each candidate. The atlas mirrors the
// exact search one row at a time so no single part walks hundreds of stands.
const warBurnStandAt = (geo, x, y) => {
    const width = Number(state.worldW) || 0;
    if (!width) return null;
    const index = Math.floor(y) * width + Math.floor(x);
    const capacity = Number(geo.forestCapacity?.[index]) || 0;
    if (!capacity) return null;
    const sample = warMapSample(x, y);
    return forestStandAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        moisture: sample.moisture,
        temperature: sample.temperature,
        height: sample.height,
        climate: state.worldOptions?.climate || "temperate",
        forests: state.worldOptions?.forests ?? 52,
        stockRatio: Number(geo.forestStock?.[index] || 0) / capacity,
        rockLine: 0.92,
        drainage: forestStewardshipAt(x, y).drained ? 1 : 0,
    });
};
const warBurnAccepts = (model, geo, stand, x, y, index) => {
    if (!stand?.forest) return false;
    if (forestFirebreakAt(x, y) || sacredGroveTileAt(x, y)) return false;
    const record = model.tiles[warTileKey(x, y)];
    const stage = record ? forestSuccessionStage(record.kind, record.age) : null;
    if (stage && stage.id !== "recovered") return false;
    if (stand.ageClass === "young") return false;
    return Number(geo.forestStock[index]) >= Math.max(18, Number(geo.forestCapacity[index]) * 0.28);
};
const warBurnTileParts = (frontRow, tiles) => {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0, height = Number(state.worldH) || 0;
    if (!geo?.forestStock || !width || !height) {
        tiles.burn = null;
        return [];
    }
    const anchor = warRegionAnchor(frontRow.provinceId);
    const cx = Math.floor(warNumber(anchor.x)), cy = Math.floor(warNumber(anchor.y));
    const limit = Math.max(1, Math.min(14, Math.floor(warNumber(16, 14))));
    const x0 = Math.max(0, cx - limit), x1 = Math.min(width - 1, cx + limit);
    const y0 = Math.max(0, cy - limit), y1 = Math.min(height - 1, cy + limit);
    const scan = { model: null, best: null };
    const parts = [() => { scan.model = ensureForestSuccession(); return ""; }];
    for (let y = y0; y <= y1; y++) {
        // A whole row still scans up to twenty-nine stands in one task. Slice
        // the row into short x runs; the nearest-tie rule stays identical.
        for (let start = x0; start <= x1; start += 4) {
            const from = start, to = Math.min(x1, start + 3);
            parts.push(() => {
                for (let x = from; x <= to; x++) {
                    const distance = Math.abs(x - cx) + Math.abs(y - cy);
                    if (distance > limit || (scan.best && distance > scan.best.distance)) continue;
                    const index = y * width + x;
                    if (!Number(geo.forestCapacity?.[index])) continue;
                    const stand = warBurnStandAt(geo, x, y);
                    if (!warBurnAccepts(scan.model, geo, stand, x, y, index)) continue;
                    if (!scan.best || distance < scan.best.distance || (distance === scan.best.distance && index < scan.best.index)) {
                        scan.best = { stand, x, y, index, distance };
                    }
                }
                return "";
            });
        }
    }
    parts.push(() => {
        tiles.burn = scan.model ? scan.best : null;
        return "";
    });
    return parts;
};
const warFrontModifiers = (frontRow, profile) => {
    const season = warSeasonNow();
    const roadOpen = Boolean(profile?.roads?.[season]?.open);
    const sight = warClamp(1 - warNumber(profile?.sightPenalty, 20) / 300 - frontRow.scouts * 0.02 - (frontRow.maps ? 0.05 : 0), 0.55, 1.15);
    const movement = warClamp(1 - warNumber(profile?.movementPenalty, 20) / 500 + frontRow.road * 0.05 + (roadOpen ? 0.03 : 0), 0.5, 1.2);
    const cavalry = warClamp(1 - (warNumber(profile?.cavalryDrag, 20) + frontRow.abatis * 8) / 400, 0.55, 1.1);
    const elephant = warNumber(profile?.elephantGround) ? frontRow.elephants * 7 : frontRow.elephants * 2;
    const ambushChance = warClamp(warNumber(profile?.ambush, 30) - frontRow.watch * 7 - frontRow.scouts * 4 - (frontRow.maps ? 4 : 0), 5, 90);
    const smugglingRisk = warClamp(35 + warNumber(profile?.smugglerPaths, 2) * 4 + frontRow.customs * 1.5 - frontRow.watch * 7 - frontRow.scouts * 5, 3, 95);
    const trade = warClamp(1 + frontRow.road * 0.08 + (roadOpen ? 0.05 : 0) + frontRow.scouts * 0.01
        - (frontRow.embargo ? 0.6 : 0), 0.3, 1.4);
    return {
        season,
        roadOpen,
        roadLabel: profile?.roads?.[season]?.label || "The forest track is open",
        sight: Math.round(sight * 100) / 100,
        movement: Math.round(movement * 100) / 100,
        cavalry: Math.round(cavalry * 100) / 100,
        elephant: Math.round(elephant * 10) / 10,
        ambushChance: Math.round(ambushChance),
        smugglingRisk: Math.round(smugglingRisk),
        trade: Math.round(trade * 100) / 100,
    };
};
const warAnnualRouteIncome = (frontRow, realm, profile) => {
    if (!frontRow.route || !realm || realm.treaty === "war" || frontRow.embargo) return 0;
    const season = warSeasonNow();
    const roadOpen = Boolean(profile?.roads?.[season]?.open);
    const base = 5 + frontRow.road * 2 + (roadOpen ? 2 : 0) + (frontRow.maps ? 1 : 0);
    return Math.max(0, Math.round(base * warFrontModifiers(frontRow, profile).trade));
};
const warAnnualCustoms = frontRow => {
    if (!frontRow.customs || frontRow.embargo) return 0;
    const realm = warRealmRow(frontRow.realmId);
    if (!realm || realm.treaty === "war") return 0;
    const volume = 12 + Math.min(58, Math.floor(warNumber(realm.tradeVolume) * 0.02)) + (frontRow.route ? 8 : 0);
    return Math.round(volume * frontRow.customs / 100);
};
const warActions = (frontRow, profile, realm, province, tiles = {}) => {
    const year = warYearNow();
    const war = Boolean(realm && realm.treaty === "war");
    const peace = Boolean(realm && realm.treaty !== "war");
    const treatyActive = Boolean(frontRow.treaty && frontRow.treaty.untilYear >= year);
    const reason = (ok, text) => ({ ok, reason: ok ? "Ready" : text });
    const ready = reason(warCanPay(FOREST_WAR_COSTS.post), "Needs " + warCostLabel(FOREST_WAR_COSTS.post));
    // Tile probes are the only expensive readings in this table. The staged
    // renderer resolves them in their own bounded parts and passes them in, so
    // no action group silently repeats a sixteen-ring scan.
    const frontTile = () => Object.prototype.hasOwnProperty.call(tiles, "front")
        ? tiles.front : warFrontTile(state.resourceGeography, frontRow);
    const burnTile = () => Object.prototype.hasOwnProperty.call(tiles, "burn")
        ? tiles.burn : warBurnTile(state.resourceGeography, frontRow);
    const rights = Boolean(frontRow.rights);
    return Object.freeze({
        post: reason(frontRow.posts < FOREST_WARFARE_LIMITS.posts && frontRow.postYear !== year && ready.ok,
            frontRow.posts >= FOREST_WARFARE_LIMITS.posts ? "Three posts already hold this frontier" : frontRow.postYear === year ? "A post was raised this year" : "Needs 10 wood and 6 gold"),
        watch: reason(frontRow.watch < FOREST_WARFARE_LIMITS.watch && frontRow.watchYear !== year && warCanPay(FOREST_WAR_COSTS.watch),
            frontRow.watch >= FOREST_WARFARE_LIMITS.watch ? "The forest watch is fully manned" : frontRow.watchYear === year ? "The watch was strengthened this year" : "Needs 8 gold and 2 food"),
        road: reason(frontRow.road < FOREST_WARFARE_LIMITS.roads && frontRow.roadYear !== year && warCanPay(FOREST_WAR_COSTS.road),
            frontRow.road >= FOREST_WARFARE_LIMITS.roads ? "The forest road is at its highest grade" : frontRow.roadYear === year ? "The road crews already worked this year" : "Needs 12 wood, 4 stone and 8 gold"),
        scouts: reason(frontRow.scouts < FOREST_WARFARE_LIMITS.scouts && frontRow.scoutYear !== year && warCanPay(FOREST_WAR_COSTS.scouts),
            frontRow.scouts >= FOREST_WARFARE_LIMITS.scouts ? "All scout bands are in the field" : frontRow.scoutYear === year ? "New scouts are already recruited this year" : "Needs 6 gold and 3 food"),
        ambush: reason(war && !treatyActive && frontRow.ambushYear !== year && frontRow.scouts > 0 && warNumber(profile?.ambush) >= 45 && warCanPay(FOREST_WAR_COSTS.ambush),
            !war ? "Only a war opens the ambush ground" : treatyActive ? "A border treaty forbids an ambush" : frontRow.ambushYear === year ? "An ambush is already laid this year" : frontRow.scouts <= 0 ? "Recruit a forest scout first" : warNumber(profile?.ambush) < 45 ? "This frontier is too open for an ambush" : "Needs 3 food"),
        battle: reason(war && warHasReadySoldier(), !war ? "Declare war at the diplomatic court first" : "No ready soldier is in the field"),
        siegeTimber: reason(war && warCanPay(FOREST_WAR_COSTS.siegeTimber), !war ? "Siege timber is cut only at war" : "Needs 15 wood"),
        siege: reason(war && frontRow.siegeMaterial >= 10 && province && province.ownerId !== "crown",
            !war ? "No siege without a war" : frontRow.siegeMaterial < 10 ? "Ten siege material are needed" : province?.ownerId === "crown" ? "The province is already held by the crown" : "No enemy province to press"),
        shipTimber: reason(warCanPay(FOREST_WAR_COSTS.shipTimber) && frontRow.shipTimber < FOREST_WARFARE_LIMITS.shipTimber,
            frontRow.shipTimber >= FOREST_WARFARE_LIMITS.shipTimber ? "The mast-timber reserve is full" : "Needs 12 wood and 4 gold"),
        elephants: reason(Boolean(profile?.elephantGround) && frontRow.elephants < FOREST_WARFARE_LIMITS.elephants && frontRow.elephantYear !== year && warCanPay(FOREST_WAR_COSTS.elephants),
            !profile?.elephantGround ? "This frontier cannot feed war elephants" : frontRow.elephants >= FOREST_WARFARE_LIMITS.elephants ? "The elephant herd is at its limit" : frontRow.elephantYear === year ? "The herd was mustered this year" : "Needs 12 food and 10 gold"),
        abatis: reason(frontRow.abatis < FOREST_WARFARE_LIMITS.abatis && frontRow.abatisYear !== year && warCanPay(FOREST_WAR_COSTS.abatis),
            frontRow.abatis >= FOREST_WARFARE_LIMITS.abatis ? "Three abatis belts already block the wood" : frontRow.abatisYear === year ? "The belts were laid this year" : "Needs 6 wood and 4 food"),
        partisans: reason(war && !treatyActive && frontRow.partisans < FOREST_WARFARE_LIMITS.partisans && frontRow.partisanYear !== year
            && ((province && province.contestedBy) || warNumber(realm?.warExhaustion) >= 10) && warCanPay(FOREST_WAR_COSTS.partisans),
            !war ? "Partisans rise only in a war" : treatyActive ? "A border treaty disarms the partisans" : frontRow.partisans >= FOREST_WARFARE_LIMITS.partisans ? "The partisan bands are full" : frontRow.partisanYear === year ? "The bands were raised this year" : "The province must be contested or the war weary (5 food, 3 gold)"),
        warFire: reason(war && !treatyActive && frontRow.fireYear !== year && warCanPay({ food: 6, gold: 6 }) && Boolean(burnTile()) && province && province.ownerId !== "crown",
            !war ? "War fire is a weapon of war" : treatyActive ? "A border treaty forbids fire" : frontRow.fireYear === year ? "The wood was fired this year" : !burnTile() ? "No mature, unbroken stand is in reach" : province?.ownerId === "crown" ? "The crown does not burn its own province" : "Needs 3 food"),
        burnFields: reason(frontRow.burnYear !== year && !treatyActive && warCanPay({ food: 8, gold: 6 }) && Boolean(burnTile()),
            frontRow.burnYear === year ? "The clearing was burned this year" : treatyActive ? "A border treaty forbids clearance" : !burnTile() ? "No mature stand is in reach" : "Needs 8 food and 6 gold for the burn crew"),
        deport: reason((war || frontRow.rebels > 0) && frontRow.deportYear !== year && warCanPay(FOREST_WAR_COSTS.deport),
            !war && frontRow.rebels <= 0 ? "There is no resistance to deport" : frontRow.deportYear === year ? "A deportation already ran this year" : "Needs 6 gold"),
        quota: reason(frontRow.quotaYear !== year && warCanPay({ food: 4 }) && warNumber(state.resources?.wood) >= 10,
            frontRow.quotaYear === year ? "The quota was levied this year" : warNumber(state.resources?.wood) < 10 ? "Needs 10 wood in the royal store" : "Needs 4 food for the work gangs"),
        route: reason(peace && !frontRow.embargo && !frontRow.route && warCanPay(FOREST_WAR_COSTS.route),
            !peace ? "No forest route runs through a war" : frontRow.embargo ? "An embargo closes the route" : frontRow.route ? "A forest route already runs here" : "Needs 10 wood and 5 gold"),
        smuggling: reason(!frontRow.embargo && frontRow.smuggleYear !== year && warNumber(profile?.smugglerPaths) > 0 && warCanPay(FOREST_WAR_COSTS.smuggling),
            frontRow.embargo ? "The embargo is watched too closely" : frontRow.smuggleYear === year ? "The smugglers already ran this year" : warNumber(profile?.smugglerPaths) <= 0 ? "No hidden path crosses this frontier" : "Needs 2 food"),
        maps: reason(!frontRow.maps && warCanPay(FOREST_WAR_COSTS.maps), frontRow.maps ? "The war maps are already charted" : "Needs 12 gold and 4 research"),
        treaty: reason(peace && !treatyActive && warNumber(realm?.relation) >= 30 && warCanPay(FOREST_WAR_COSTS.treaty),
            !peace ? "No treaty is signed at war" : treatyActive ? "A border treaty is already in force" : warNumber(realm?.relation) < 30 ? "The court's relation is below 30" : "Needs 8 gold"),
        preserve: reason(treatyActive && !frontRow.preserve && warCanPay(FOREST_WAR_COSTS.preserve) && Boolean(frontTile()),
            !treatyActive ? "A border treaty must come first" : frontRow.preserve ? "A joint preserve already stands here" : !frontTile() ? "No forest tile is in reach" : "Needs 12 gold"),
        rights: reason(!rights && warCanPay(FOREST_WAR_COSTS.rights), rights ? "The woodland communities already hold their charter" : "Needs 10 gold"),
        settlers: reason(frontRow.settlers < FOREST_WARFARE_LIMITS.settlers && frontRow.settlerYear !== year && warCanPay(FOREST_WAR_COSTS.settlers),
            frontRow.settlers >= FOREST_WARFARE_LIMITS.settlers ? "The wood edge is fully claimed" : frontRow.settlerYear === year ? "New claims were pressed this year" : "Needs 6 food"),
        colonize: reason(frontRow.settlers >= 3 && !frontRow.colony && peace && !treatyActive && !frontRow.preserve && warCanPay(FOREST_WAR_COSTS.colonize),
            frontRow.settlers < 3 ? "Three settler claims are needed first" : frontRow.colony ? "This frontier is already colonised" : !peace ? "Colonisation waits for peace" : treatyActive || frontRow.preserve ? "A treaty or preserve forbids the claim" : "Needs 20 wood, 10 food and 15 gold"),
        suppress: reason(frontRow.rebels > 0 && frontRow.suppressYear !== year && warCanPay(FOREST_WAR_COSTS.suppress),
            frontRow.rebels <= 0 ? "No resistance camp is known" : frontRow.suppressYear === year ? "The camps were already suppressed this year" : "Needs 10 gold and 4 food"),
        refugees: reason(frontRow.refugees > 0 && frontRow.refugeeYear !== year && warCanPay(FOREST_WAR_COSTS.refugees),
            frontRow.refugees <= 0 ? "No forest refugees wait at the border" : frontRow.refugeeYear === year ? "The refugees were already settled this year" : "Needs 10 food and 6 wood"),
        colony: reason(!frontRow.colony?.military && warCanPay(FOREST_WAR_COSTS.colony),
            frontRow.colony?.military ? "A military colony already guards this frontier" : "Needs 18 wood, 10 stone and 12 gold"),
        clearCamp: reason(frontRow.rebels > 0 && frontRow.clearCampYear !== year && warHasReadySoldier() && warCanPay(FOREST_WAR_COSTS.clearCamp),
            frontRow.rebels <= 0 ? "No rebel camp is known" : frontRow.clearCampYear === year ? "A camp was cleared this year" : !warHasReadySoldier() ? "A ready soldier must lead the patrol" : "Needs 3 food"),
        recovery: reason(frontRow.scars.length > 0 && frontRow.recoveryYear !== year && warCanPay(FOREST_WAR_COSTS.recovery),
            frontRow.scars.length <= 0 ? "The frontier carries no war scar" : frontRow.recoveryYear === year ? "A recovery crew already worked this year" : "Needs 8 gold and 4 wood"),
        embargo: reason(!frontRow.embargo && peace, frontRow.embargo ? "An embargo is already in force" : "An embargo is declared in peace, not war"),
        clearEmbargo: reason(Boolean(frontRow.embargo), frontRow.embargo ? "Ready" : "No embargo is in force"),
    });
};

const buildWarData = () => {
    const snapshot = forestWarfareSnapshot();
    ensureDiplomacy();
    const map = ensureWorldMap();
    const fronts = snapshot.fronts;
    const totals = {
        ...snapshot.totals,
        fronts: fronts.length,
        wars: fronts.filter(row => warRealmRow(row.realmId)?.treaty === "war").length,
        frontsHeld: fronts.filter(row => map.regions.find(region => region.id === row.provinceId)?.ownerId === "crown").length,
        posts: fronts.reduce((sum, row) => sum + row.posts, 0),
        watch: fronts.reduce((sum, row) => sum + row.watch, 0),
        scars: fronts.reduce((sum, row) => sum + row.scars.length, 0),
        rebels: fronts.reduce((sum, row) => sum + row.rebels, 0),
        refugees: fronts.reduce((sum, row) => sum + row.refugees, 0),
        partisans: fronts.reduce((sum, row) => sum + row.partisans, 0),
        shipTimber: fronts.reduce((sum, row) => sum + row.shipTimber, 0),
        siegeMaterial: fronts.reduce((sum, row) => sum + row.siegeMaterial, 0),
        elephants: fronts.reduce((sum, row) => sum + row.elephants, 0),
        settlers: fronts.reduce((sum, row) => sum + row.settlers, 0),
        customs: fronts.reduce((sum, row) => sum + warAnnualCustoms(row), 0),
        routes: fronts.filter(row => row.route).length,
        embargoes: fronts.filter(row => row.embargo).length,
        treaties: fronts.filter(row => row.treaty).length,
        preservedTiles: fronts.filter(row => row.preserve).length,
    };
    return {
        fronts, totals, map,
        season: warSeasonNow(),
        requirements: FOREST_WARFARE_REQUIREMENTS,
        requirementCount: FOREST_WARFARE_REQUIREMENTS.length,
        embargoGoods: FOREST_EMBARGO_GOODS,
        customsRates: FOREST_CUSTOMS_RATES,
    };
};
const warFrontBase = (frontRow, war) => {
    const realm = warRealmRow(frontRow.realmId);
    const province = war.map.regions.find(region => region.id === frontRow.provinceId) || null;
    const profile = forestWarfareProfileFor(frontRow.realmId) || {};
    const front = {
        realmId: frontRow.realmId,
        realmName: warRealmName(frontRow.realmId),
        provinceId: frontRow.provinceId,
        provinceName: regionDefinitionFor(frontRow.provinceId)?.name || frontRow.provinceId,
        ownerId: province?.ownerId || null,
        control: province?.control ?? 0,
        garrison: province?.garrison ?? 0,
        relation: realm ? Math.round(warNumber(realm.relation)) : 0,
        trust: realm ? Math.round(warNumber(realm.trust)) : 0,
        fear: realm ? Math.round(warNumber(realm.fear)) : 0,
        treatyState: realm?.treaty || "none",
        war: realm?.treaty === "war",
        warExhaustion: realm ? Math.round(warNumber(realm.warExhaustion)) : 0,
        profile,
        posts: frontRow.posts,
        watch: frontRow.watch,
        road: frontRow.road,
        scouts: frontRow.scouts,
        abatis: frontRow.abatis,
        elephants: frontRow.elephants,
        partisans: frontRow.partisans,
        siegeMaterial: Math.round(frontRow.siegeMaterial),
        shipTimber: Math.round(frontRow.shipTimber),
        maps: frontRow.maps,
        rights: Boolean(frontRow.rights),
        treaty: frontRow.treaty ? { ...frontRow.treaty } : null,
        preserve: frontRow.preserve ? { ...frontRow.preserve } : null,
        embargo: frontRow.embargo,
        customs: frontRow.customs,
        route: frontRow.route,
        settlers: frontRow.settlers,
        colony: frontRow.colony ? { ...frontRow.colony } : null,
        rebels: frontRow.rebels,
        refugees: frontRow.refugees,
        deportations: frontRow.deportations,
        scars: frontRow.scars.map(scar => ({ ...scar })),
        battles: frontRow.battles,
        victories: frontRow.victories,
        pressure: frontRow.pressure,
    };
    return { front, realm, province, profile };
};

function warActionButton(front, action, label, detail, ok) {
    return '<button type="button" class="command-choice war-action" data-war-realm="' + esc(front.realmId) + '" data-war-action="' + esc(action) + '"'
        + ' title="' + esc(detail) + '"' + (ok ? '' : ' disabled')
        + '><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></button>';
}

// A single frontier card measured 25 ms to generate and parse as one part on a
// throttled Chromium. The same bytes are now emitted as six lazy sections, each
// mounted into the open war-fronts shell, so neither generation nor HTML parsing
// has to handle the whole card in one task.
function warFrontMarkupParts(front, war) {
    const acts = front.actions;
    const profile = front.profile || {};
    const mods = front.modifiers || {};
    const stateLabel = front.war ? 'AT WAR' : front.treaty ? 'TREATY' : 'PEACE';
    const ownerLabel = front.ownerId === 'crown' ? 'CROWN' : (front.ownerId || 'UNHELD').toUpperCase();
    return [
        () => '<article class="forest-war-front" data-war-front="' + esc(front.realmId) + '" data-war-state="' + (front.war ? 'war' : front.treaty ? 'treaty' : 'peace') + '" data-war-control="' + number(front.control) + '" data-war-battles="' + number(front.battles) + '">'
        + '<header class="forest-war-front__head"><div><span class="command-ribbon">' + esc(stateLabel) + ' · ' + esc(ownerLabel) + ' PROVINCE</span><strong>' + esc(front.realmName) + ' · ' + esc(front.provinceName) + '</strong><p>' + esc(profile.label || '') + ' · ' + esc(profile.border || '') + '</p></div>'
        + '<div class="forest-war-front__control" data-war-control-value="' + number(front.control) + '"><small>CONTROL</small><strong>' + number(front.control) + ' / 100</strong><span>Relation ' + number(front.relation) + ' · Trust ' + number(front.trust) + ' · Fear ' + number(front.fear) + (front.war ? ' · exhaustion ' + number(front.warExhaustion) : '') + '</span></div></header>'
        + '<div class="command-summary war-summary">'
        + '<div><small>BORDER POSTS</small><strong>' + number(front.posts) + ' / 3</strong></div>'
        + '<div><small>FOREST WATCH</small><strong>' + number(front.watch) + ' / 3</strong></div>'
        + '<div><small>ROAD GRADE</small><strong>' + number(front.road) + ' / 3</strong></div>'
        + '<div><small>SCOUTS</small><strong>' + number(front.scouts) + ' / 3</strong></div>'
        + '<div><small>SIEGE MATERIAL</small><strong>' + number(front.siegeMaterial) + '</strong></div>'
        + '<div><small>SHIP TIMBER</small><strong>' + number(front.shipTimber) + '</strong></div>'
        + '<div><small>ELEPHANTS</small><strong>' + number(front.elephants) + '</strong></div>'
        + '<div><small>ABATIS</small><strong>' + number(front.abatis) + ' / 3</strong></div>'
        + '<div><small>PARTISANS</small><strong>' + number(front.partisans) + '</strong></div>'
        + '<div><small>SETTLERS</small><strong>' + number(front.settlers) + ' / 4</strong></div>'
        + '<div><small>REBEL CAMPS</small><strong>' + number(front.rebels) + '</strong></div>'
        + '<div><small>REFUGEES</small><strong>' + number(front.refugees) + '</strong></div>'
        + '<div><small>BATTLES</small><strong>' + number(front.battles) + ' · ' + number(front.victories) + ' WON</strong></div>'
        + '<div><small>ROUTE / CUSTOMS</small><strong>' + (front.route ? '+' + number(front.annualRoute) + 'G' : 'NO ROUTE') + ' · ' + number(front.customs) + '% · +' + number(front.annualCustoms) + 'G</strong></div>'
        + '<div><small>PRESSURE</small><strong>' + number(front.pressure) + ' / 100</strong></div>'
        + '<div><small>WAR SCARS</small><strong>' + number(front.scars.length) + '</strong></div>'
        + '</div>',
        () => '<div class="war-tradition"><small>REGIONAL WAR TRADITION</small><p>' + esc(profile.warTradition || '') + '</p><small>STRATEGIC WOOD</small><p>' + esc((profile.strategicGoods || []).join(' · ')) + ' · recovery ' + number(profile.recoveryYears) + ' years</p></div>'
        + '<div class="command-summary war-modifiers">'
        + '<div><small>SIGHT</small><strong>×' + amount(mods.sight) + '</strong></div>'
        + '<div><small>MOVEMENT</small><strong>×' + amount(mods.movement) + '</strong></div>'
        + '<div><small>CAVALRY DRAG</small><strong>×' + amount(mods.cavalry) + '</strong></div>'
        + '<div><small>ENEMY AMBUSH</small><strong>' + number(mods.ambushChance) + '%</strong></div>'
        + '<div><small>SMUGGLING RISK</small><strong>' + number(mods.smugglingRisk) + '%</strong></div>'
        + '<div><small>TRADE FACTOR</small><strong>×' + amount(mods.trade) + '</strong></div>'
        + '<div><small>ELEPHANT POWER</small><strong>+' + amount(mods.elephant) + '</strong></div>'
        + '<div><small>ROAD THIS SEASON</small><strong>' + (mods.roadOpen ? 'OPEN' : 'CLOSED') + '</strong></div>'
        + '</div>',
        () => '<div class="command-section-title">BORDER WORKS · POSTS, WATCH AND ROADS</div><div class="war-actions">'
        + warActionButton(front, 'post', 'BORDER POST', '10 wood · 6 gold · ' + acts.post.reason, acts.post.ok)
        + warActionButton(front, 'watch', 'STRENGTHEN WATCH', '8 gold · 2 food · ' + acts.watch.reason, acts.watch.ok)
        + warActionButton(front, 'road', 'OPEN FOREST ROAD', '12 wood · 4 stone · 8 gold · ' + acts.road.reason, acts.road.ok)
        + warActionButton(front, 'scouts', 'RECRUIT SCOUTS', '6 gold · 3 food · ' + acts.scouts.reason, acts.scouts.ok)
        + warActionButton(front, 'maps', 'COMMISSION WAR MAPS', '12 gold · 4 research · ' + acts.maps.reason, acts.maps.ok)
        + '</div>'
        + '<div class="command-section-title">FOREST BATTLE · AMBUSH AND SIEGE</div><div class="war-actions">'
        + warActionButton(front, 'ambush', 'LAY AMBUSH', '3 food · ' + acts.ambush.reason, acts.ambush.ok)
        + warActionButton(front, 'battle', 'FIGHT FOREST BATTLE', 'soldiers · ' + acts.battle.reason, acts.battle.ok)
        + warActionButton(front, 'siegeTimber', 'CUT SIEGE TIMBER', '15 wood · ' + acts.siegeTimber.reason, acts.siegeTimber.ok)
        + warActionButton(front, 'siege', 'PRESS SIEGE', '10 material · ' + acts.siege.reason, acts.siege.ok)
        + warActionButton(front, 'shipTimber', 'RESERVE SHIP TIMBER', '12 wood · 4 gold · ' + acts.shipTimber.reason, acts.shipTimber.ok)
        + warActionButton(front, 'elephants', 'MUSTER ELEPHANTS', '12 food · 10 gold · ' + acts.elephants.reason, acts.elephants.ok)
        + warActionButton(front, 'abatis', 'FELL ABATIS', '6 wood · 4 food · ' + acts.abatis.reason, acts.abatis.ok)
        + warActionButton(front, 'partisans', 'RAISE PARTISANS', '5 food · 3 gold · ' + acts.partisans.reason, acts.partisans.ok)
        + '</div>',
        () => {
            const embargoButtons = war.embargoGoods.map(good => '<button type="button" class="command-choice' + (front.embargo === good.id ? ' is-current' : '') + '" data-war-realm="' + esc(front.realmId) + '" data-war-action="embargo" data-war-good="' + esc(good.id) + '"'
                + (acts.embargo.ok ? '' : ' disabled title="' + esc(acts.embargo.reason) + '"') + '><strong>EMBARGO ' + esc(good.label.toUpperCase()) + '</strong><small>' + esc(good.detail) + '</small></button>').join("");
            const customsButtons = war.customsRates.map(rate => '<button type="button" class="command-choice' + (front.customs === rate ? ' is-current' : '') + '" data-war-realm="' + esc(front.realmId) + '" data-war-customs="' + rate + '"><strong>' + rate + '%</strong><small>Customs on forest trade</small></button>').join("");
            return '<div class="command-section-title">TRADE, EMBARGO AND THE HIDDEN PATHS</div><div class="war-actions">'
        + warActionButton(front, 'route', 'OPEN FOREST ROUTE', '10 wood · 5 gold · ' + acts.route.reason, acts.route.ok)
        + warActionButton(front, 'smuggling', 'RUN SMUGGLING', '2 food · ' + acts.smuggling.reason, acts.smuggling.ok)
        + '<button type="button" class="command-choice' + (front.embargo ? ' is-current' : '') + '" data-war-realm="' + esc(front.realmId) + '" data-war-action="liftEmbargo"' + (acts.clearEmbargo.ok ? '' : ' disabled title="' + esc(acts.clearEmbargo.reason) + '"') + '><strong>LIFT EMBARGO</strong><small>' + (front.embargo ? 'Currently banning ' + esc(front.embargo) : 'No embargo in force') + '</small></button>'
        + '</div><div class="war-actions war-embargoes">' + embargoButtons + '</div>'
        + '<div class="command-section-title">CUSTOMS ON WOOD, RESIN AND MEDICINE</div><div class="war-actions war-customs">' + customsButtons + '</div>';
        },
        () => '<div class="command-section-title">PEOPLE, SETTLEMENT AND THE FOREST</div><div class="war-actions">'
        + warActionButton(front, 'warFire', 'SET WAR FIRE', '3 food · ' + acts.warFire.reason, acts.warFire.ok)
        + warActionButton(front, 'burnFields', 'BURN FOR FIELDS', '2 food · 6 gold · ' + acts.burnFields.reason, acts.burnFields.ok)
        + warActionButton(front, 'deport', 'DEPORT WOODLANDERS', '6 gold · ' + acts.deport.reason, acts.deport.ok)
        + warActionButton(front, 'quota', 'LEVY TIMBER QUOTA', '10 wood · 4 food · ' + acts.quota.reason, acts.quota.ok)
        + warActionButton(front, 'treaty', 'SIGN BORDER TREATY', '8 gold · ' + acts.treaty.reason, acts.treaty.ok)
        + warActionButton(front, 'preserve', 'CREATE JOINT PRESERVE', '12 gold · ' + acts.preserve.reason, acts.preserve.ok)
        + warActionButton(front, 'rights', 'RECOGNISE WOODLAND RIGHTS', '10 gold · ' + acts.rights.reason, acts.rights.ok)
        + warActionButton(front, 'settlers', 'PRESS SETTLER CLAIMS', '6 food · ' + acts.settlers.reason, acts.settlers.ok)
        + warActionButton(front, 'colonize', 'COLONISE WOODLAND', '20 wood · 10 food · 15 gold · ' + acts.colonize.reason, acts.colonize.ok)
        + warActionButton(front, 'suppress', 'SUPPRESS RESISTANCE', '10 gold · 4 food · ' + acts.suppress.reason, acts.suppress.ok)
        + warActionButton(front, 'refugees', 'SETTLE REFUGEES', '10 food · 6 wood · ' + acts.refugees.reason, acts.refugees.ok)
        + warActionButton(front, 'colony', 'FOUND MILITARY COLONY', '18 wood · 10 stone · 12 gold · ' + acts.colony.reason, acts.colony.ok)
        + warActionButton(front, 'clearCamp', 'CLEAR REBEL CAMP', '3 food · ' + acts.clearCamp.reason, acts.clearCamp.ok)
        + warActionButton(front, 'recovery', 'FUND WAR ECOLOGY', '8 gold · 4 wood · ' + acts.recovery.reason, acts.recovery.ok)
        + '</div>',
        () => {
            const roads = (profile.roads || []).map(road => '<div class="' + (road.season === war.season ? 'is-current' : '') + (road.open ? '' : ' is-closed') + '"><small>' + esc(seasonNames[road.season].toUpperCase()) + '</small><strong>' + (road.open ? 'OPEN' : 'CLOSED') + '</strong><span>' + esc(road.label) + '</span></div>').join("");
            const scars = front.scars.length
                ? front.scars.map(scar => '<div class="war-scar" data-war-scar="' + number(scar.x) + ',' + number(scar.y) + '"><small>' + esc(String(scar.cause).toUpperCase()) + ' · ' + number(scar.year) + '</small><strong>Tile ' + number(scar.x) + ', ' + number(scar.y) + '</strong><span>Severity ' + number(scar.severity) + '</span></div>').join("")
                : '<p class="command-note">No war scar is open on this frontier. Fire and clearance would create one.</p>';
            return '<div class="command-section-title">SEASONAL FOREST ROADS</div><div class="war-roads">' + roads + '</div>'
        + '<div class="command-section-title">WAR SCARS ON REAL TILES</div><div class="war-scars">' + scars + '</div>'
        + (front.treaty ? '<p class="command-note">Border treaty until year ' + number(front.treaty.untilYear) + ': ' + esc(front.treaty.term) + '. Ambush, war fire and partisans are refused while it holds.</p>' : '')
        + (front.preserve ? '<p class="command-note">Joint preserve on tile ' + number(front.preserve.x) + ', ' + number(front.preserve.y) + ' since ' + number(front.preserve.year) + '. The shared grove guard refuses every axe there.</p>' : '')
        + (front.colony ? '<p class="command-note">' + (front.colony.military ? 'Military colony' : 'Colonised settlement') + ' founded in ' + number(front.colony.year) + '. ' + (front.colony.military ? 'It adds control each year and eats 2 food.' : 'The province is claimed; resistance remains.') + '</p>' : '')
        + '</article>';
        },
    ];
}

function warFrontMarkup(front, war) {
    return warFrontMarkupParts(front, war).map(thunk => thunk()).join("");
}

function warFrontParts(frontRow, war) {
    // A frontier has four independent readings: two bounded tile probes, the
    // live province/diplomacy/profile snapshot, and the action/modifier tables.
    // Each gets its own part so no single generation task assembles the whole
    // record. The markup part only joins strings that are already known.
    const tiles = {};
    const front = {};
    let realm = null;
    let province = null;
    let profile = null;
    return {
        html: "",
        more: [
            () => { tiles.front = warFrontTile(state.resourceGeography, frontRow); return ""; },
            ...warBurnTileParts(frontRow, tiles),
            () => {
                const base = warFrontBase(frontRow, war);
                Object.assign(front, base.front);
                realm = base.realm;
                province = base.province;
                profile = base.profile;
                return "";
            },
            () => { front.modifiers = warFrontModifiers(frontRow, profile); return ""; },
            () => { front.actions = warActions(frontRow, profile, realm, province, tiles); return ""; },
            () => {
                front.annualRoute = warAnnualRouteIncome(frontRow, realm, profile);
                front.annualCustoms = warAnnualCustoms(frontRow);
                return "";
            },
            () => ({
                html: "",
                more: warFrontMarkupParts(front, war).map(thunk => () => ({ into: '[data-war-fronts]', html: thunk })),
            }),
        ],
    };
}

function warGuideRow(requirement) {
    return '<details class="culture-requirement" data-war-requirement="' + esc(requirement.id) + '"><summary><span>' + esc(requirement.id) + '</span><strong>' + esc(requirement.title) + '</strong></summary><p>' + esc(requirement.point) + '</p><small>' + esc(requirement.consumer) + '</small><p>' + esc(requirement.detail) + '</p></details>';
}

function warGuideMarkup(war) {
    return war.requirements.map(warGuideRow).join('');
}

function warShellMarkup(war) {
    const totals = war.totals;
    return '<section class="forest-war" data-forest-war="' + number(war.requirementCount) + '" data-war-fronts="' + number(war.fronts.length) + '">'
        + '<div class="command-section-title">FOREST WAR, DIPLOMACY AND BORDERS · 1.2.23.1.211–240 · ' + number(war.requirementCount) + ' POINTS</div>'
        + '<p class="command-note">Four real woodland frontiers sit between the crown and its neighbours. Every post, road, ambush, battle, embargo and scar writes the same world-map province, soldier, diplomatic court, forest tile and sacred-grove record the rest of the game already uses. The season changes which roads are open; a closed road still exists, but it slows an army and carries less trade.</p>'
        + '<div class="command-summary war-totals">'
        + '<div><small>FOREST FRONTS</small><strong>' + number(totals.fronts) + '</strong></div>'
        + '<div><small>WARS</small><strong>' + number(totals.wars) + '</strong></div>'
        + '<div><small>PROVINCES HELD</small><strong>' + number(totals.frontsHeld) + ' / ' + number(totals.fronts) + '</strong></div>'
        + '<div><small>BATTLES / WINS</small><strong>' + number(totals.battles) + ' / ' + number(totals.victories) + '</strong></div>'
        + '<div><small>BORDER POSTS</small><strong>' + number(totals.posts) + '</strong></div>'
        + '<div><small>FOREST ROUTES</small><strong>' + number(totals.routes) + '</strong></div>'
        + '<div><small>SHIP TIMBER</small><strong>' + number(totals.shipTimber) + '</strong></div>'
        + '<div><small>SIEGE MATERIAL</small><strong>' + number(totals.siegeMaterial) + '</strong></div>'
        + '<div><small>REBEL CAMPS</small><strong>' + number(totals.rebels) + '</strong></div>'
        + '<div><small>REFUGEES</small><strong>' + number(totals.refugees) + '</strong></div>'
        + '<div><small>WAR SCARS</small><strong>' + number(totals.scars) + '</strong></div>'
        + '<div><small>CUSTOMS INCOME</small><strong>+' + number(totals.customs) + ' G / YEAR</strong></div>'
        + '</div>'
        + '<div class="war-fronts">';
}

function warGuideShell(war) {
    return '</div><details class="culture-guide" data-war-guide="' + number(war.requirementCount) + '"><summary>THIRTY-POINT WAR, DIPLOMACY, BORDER AND STRATEGY FIELD GUIDE</summary><div class="culture-requirements">';
}

function warGuideTail() {
    return '</div></details></section>';
}

function warTailMarkup(war) {
    return warGuideShell(war) + warGuideMarkup(war) + warGuideTail();
}

function warfareParts() {
    // The shell generates the ledger once, then hands each frontier, the guide
    // shell and each individual requirement to the hydrator. The old joined
    // guide was a 70 KB parse/generate task on a mature realm; the plain
    // renderer still receives the exact same string through warfareBlock().
    // The outer descriptor keeps the whole block a single part from the
    // caller's point of view while its `more` queue hands the real work to the
    // same staged scheduler the card stream uses. The closure-scoped war data
    // is rebuilt for every panel render, so a click never reads a stale realm.
    let war = null;
    return {
        html: "",
        more: [
            () => { war = buildWarData(); return ""; },
            () => ({
                html: warShellMarkup(war),
                more: [
                    ...war.fronts.map(frontRow => warFrontParts(frontRow, war)),
                    { into: '.forest-war', html: () => warGuideShell(war) },
                    ...war.requirements.map(requirement => ({
                        into: '[data-war-guide]',
                        html: () => warGuideRow(requirement),
                    })),
                    { into: '.forest-war', html: warGuideTail },
                ],
            }),
        ],
    };
}

function warfareBlock() {
    return joinParts(warfareParts());
}

function grandConsumersBlock() {
    const summary = grandConsumersSummary();
    const rows = summary.rows.length ? summary.rows.map(row => '<article class="forest-atlas__grand-consumer" data-grand-consumer-card="' + esc(row.id) + '" data-grand-status="' + esc(row.status) + '"><header><b>' + esc(row.label) + '</b><span>' + esc(String(row.status).toUpperCase()) + '</span></header><p>' + esc(row.story) + '</p><small>' + esc(row.text) + '</small><em>Batches ' + number(row.batches) + ' · ' + Object.entries(row.inputs || {}).map(([good, value]) => value + ' ' + good).join(' · ') + '</em></article>').join("") : '<p class="command-note">No shipyard or paper mill stands yet. Build one from the GRAND CONSUMERS category.</p>';
    return '<div class="command-section-title">GRAND CONSUMERS · SHIPYARD &amp; PAPER MILL</div>'
        + '<div class="command-summary" data-grand-consumers="' + number(summary.rows.length) + '" data-grand-ships="' + number(summary.ships) + '" data-grand-reserve="' + number(summary.reserve) + '">'
        + '<div><small>SHIPYARDS / MILLS</small><strong>' + number(summary.shipyards) + ' / ' + number(summary.paperMills) + '</strong></div>'
        + '<div><small>FLEET HULLS</small><strong>' + number(summary.ships) + '</strong></div>'
        + '<div><small>SEA-LANE TRADE</small><strong>+' + number(summary.tradeBonusPct) + '%</strong></div>'
        + '<div><small>SHIP BATCHES</small><strong>' + number(summary.shipBatches) + '</strong></div>'
        + '<div><small>PAPER BATCHES</small><strong>' + number(summary.paperBatches) + '</strong></div>'
        + '<div><small>RESEARCH RESERVE</small><strong>' + number(summary.reserve) + '</strong></div></div>'
        + '<p class="command-note">These are permanent sinks, not one-off commissions: every hull consumes ship timber, pitch, tar, charcoal and potash; every paper batch consumes paper, potash and charcoal. Carriers must keep their input stores filled. A starved building waits visibly and does not consume partial goods.</p>'
        + '<div class="forest-atlas__grand-grid">' + rows + '</div>';
}

function industryShellMarkup(summary) {
    const last = summary.lastBatch;
    return '<div class="command-section-title">REGIONAL FOREST INDUSTRIES · 1.2.23.1.151–180</div>'
        + '<div class="command-summary" data-forest-industry="' + number(summary.works) + '" data-forest-industry-batches="' + number(summary.batches) + '">'
        + '<div><small>FOREST WORKS</small><strong>' + number(summary.works) + '</strong></div>'
        + '<div><small>ACTIVE INDUSTRIES</small><strong>' + number(summary.activeModes) + ' / ' + Object.keys(FOREST_WORKS_MODES).length + '</strong></div>'
        + '<div><small>FINISHED STOCK</small><strong>' + number(summary.stored) + '</strong></div>'
        + '<div><small>MARKET VALUE</small><strong>' + amount(summary.value) + ' G</strong></div>'
        + '<div><small>BATCHES RUN</small><strong>' + number(summary.batches) + '</strong></div>'
        + '<div><small>RAW CONSUMED</small><strong>' + number(summary.rawConsumed) + '</strong></div>'
        + '<div><small>FURNITURE PRESTIGE</small><strong>+' + Math.round(summary.furniturePremium * 100) + '%</strong></div></div>'
        + '<p class="command-note">Every Forest Works is a real building with its own selected industry. Standard inputs arrive by carrier from your warehouses; resin, bark, cork and other raw materials come from the live forest-gathering ledger of the wood you actually manage. Output is ordinary physical stock, hauled by the same carriers and sold here from real warehouses. ' + (last ? 'Last batch: ' + esc(last.label) + ' → ' + esc(Object.entries(last.output || {}).map(([good, value]) => value + ' ' + (INDUSTRY_GOODS[good]?.label || good)).join(' + ')) + ' · ' + esc(last.style || 'standard') + ' · ' + esc(last.quality?.grade || 'standard') + (last.mastery ? ' · ' + esc(last.mastery.label) + ' (' + number(last.mastery.batches) + ' batches)' : '') + '.' : 'No workshop has completed a batch yet.') + '</p>';
}

function industryCatalogueMarkup() {
    const modeCards = Object.values(FOREST_WORKS_MODES).map(mode => {
        const outputs = Object.entries(mode.output || {})
            .map(([good, amount]) => amount + " " + (INDUSTRY_GOODS[good]?.label || good)).join(" + ");
        return '<article class="forest-atlas__industry-card" data-industry-mode-card="' + esc(mode.id) + '">'
            + '<header><b>' + esc(mode.short) + '</b><span>' + esc(outputs) + '</span></header>'
            + '<strong>' + esc(mode.label) + '</strong>'
            + '<p>' + esc(mode.description) + '</p>'
            + '<small><b>IN</b> ' + esc(industryInputLabel(mode)) + '</small>'
            + '<small><b>SITE</b> ' + esc(mode.requiresAny?.length ? mode.requiresAny.join(" · ") : "any managed wood") + '</small>'
            + '<em>' + esc(mode.longTerm) + '</em></article>';
    }).join("");
    return '<details class="forest-atlas__field-guide" data-industry-catalogue="' + Object.keys(FOREST_WORKS_MODES).length + '"><summary><span>WORKSHOP CATALOGUE · ' + Object.keys(FOREST_WORKS_MODES).length + ' PATHS</span><strong>From charcoal to silk</strong><em>One building type, one site-specific choice at a time</em></summary>'
        + '<div class="forest-atlas__industry-grid">' + modeCards + '</div></details>';
}

function industryMarketMarkup(summary) {
    const rows = summary.rows.map(row => '<div class="forest-atlas__industry-market-row" data-industry-good="' + esc(row.id) + '">'
        + '<div><strong>' + esc(row.label) + '</strong><small>' + esc(row.use) + ' · ' + number(row.stock) + ' in store</small></div>'
        + '<span>' + amount(row.price) + 'G</span>'
        + '<button type="button" class="command-choice" data-industry-sell="' + esc(row.id) + '" data-industry-quantity="5"' + (row.stock > 0 ? '' : ' disabled') + '>SELL 5</button></div>').join("");
    return '<details class="forest-atlas__field-guide" data-industry-market="' + number(summary.rows.length) + '"><summary><span>FOREST GOODS EXCHANGE</span><strong>Finished wares, real stock</strong><em>Prices move with season and how much you hold</em></summary>'
        + '<div class="forest-atlas__industry-market">' + (rows || '<p class="command-note">No finished forest-industry good is in a warehouse yet. Build a Forest Works, select a mode and let the woodwright work.</p>') + '</div></details>';
}

function industryGuideMarkup() {
    const requirementRows = FOREST_INDUSTRY_REQUIREMENTS.map(entry => '<article class="forest-atlas__guide-point" data-industry-requirement="' + esc(entry.id) + '">'
        + '<div class="forest-atlas__guide-head"><b>' + esc(entry.point) + '</b><span>FOREST ECONOMY</span></div>'
        + '<h4>' + esc(entry.title) + '</h4>'
        + '<p><b>IN THE GAME</b> ' + esc(entry.system) + '</p>'
        + '<p><b>WHAT THE PLAYER DOES</b> ' + esc(entry.playerUse) + '</p>'
        + '<p><b>WHY IT LASTS</b> ' + esc(entry.longTerm) + '</p>'
        + '<small><b>LIVE CONSUMER</b> ' + esc(entry.consumer) + '</small></article>').join("");
    const quality = Object.values(WOOD_QUALITY_CLASSES).map(entry => '<span class="forest-atlas__trait" title="' + esc(entry.note) + '">' + esc(entry.label) + '</span>').join("");
    const profiles = Object.values(SAW_PROFILES).map(entry => '<span class="forest-atlas__trait" title="' + esc(entry.note) + '">' + esc(entry.label) + '</span>').join("");
    return '<details class="forest-atlas__field-guide" data-industry-guide="' + FOREST_INDUSTRY_REQUIREMENTS.length + '"><summary><span>FIELD GUIDE · ' + FOREST_INDUSTRY_REQUIREMENTS.length + ' POINTS</span><strong>Wood, workshops and long-term play</strong><em>1.2.23.1.151–180 · every point has a live consumer</em></summary>'
        + '<p class="forest-atlas__guide-intro">This is the design and play guide for the whole regional forest economy. Each entry names the simulation system that makes it real, what the player can do with it, why it supports a long campaign, and the concrete consumer that reads it.</p>'
        + '<div class="forest-atlas__quality-strip"><span><b>QUALITY CLASSES</b>' + quality + '</span><span><b>SAW PROFILES</b>' + profiles + '</span></div>'
        + '<div class="forest-atlas__guide-grid">' + requirementRows + '</div></details>';
}

function industryParts() {
    const summary = {};
    return {
        html: "",
        more: [
            fillIndustrySummary(summary),
            () => ({ html: industryShellMarkup(summary) }),
            guildParts(),
            () => ({ html: grandConsumersBlock() }),
            () => ({ html: industryCatalogueMarkup() }),
            () => ({ html: industryMarketMarkup(summary) }),
            () => ({ html: industryGuideMarkup() }),
        ],
    };
}

function industryBlock() {
    return joinParts(industryParts());
}

// 1.2.23.1.259–267: the atlas is also the player's map-reading and
// accessibility panel. Everything here is generated from the same profile
// tables, filter state and guide rows the renderer and ambience read, so a
// legend entry cannot describe a symbol the map no longer draws.
// 1.2.23.1.244/245/253: a real phenology strip, not a decorative swatch. The
// dates come from the same climate curves the renderer uses, shifted by the
// regional type hash, so two neighbouring woods can be compared by day.
function seasonCalendar(profile, scene) {
    if (!profile?.seasons?.length) return "";
    const active = Math.max(0, Math.min(3, Number(scene.seasonIndex) || 0));
    const rows = profile.seasons.map((season, index) => {
        const keyLabel = season.id === "spring" ? "LEAF-OUT"
            : season.id === "summer" ? "CANOPY CLOSED"
                : season.id === "autumn" ? "TURN" : "DEEP WINTER";
        const snowFact = season.id === "winter" && profile.phenology?.snowHold !== null
            ? "first snow day " + number(profile.phenology.snowHold) + " · " : "";
        const facts = season.id === "spring"
            ? "blossom " + pct(season.blossom) + " · snow " + pct(season.snow)
            : season.id === "summer" ? "fruit " + pct(season.fruit) + " · ground " + season.ground
                : season.id === "autumn" ? "fruit " + pct(season.fruit) + " · bare " + pct(season.bare)
                    : snowFact + "snow " + pct(season.snow) + " · bare " + pct(season.bare);
        return '<article class="forest-atlas__season' + (index === active ? ' is-current' : '') + '" data-forest-season="'
            + esc(season.id) + '" data-forest-season-day="' + number(season.keyDay) + '">'
            + '<span class="forest-atlas__season-band" style="--leaf:' + esc(season.leaf)
            + ';--accent:' + esc(season.accent) + '" aria-hidden="true"></span>'
            + '<div><strong>' + esc(season.label) + '</strong><small>' + esc(keyLabel) + ' · day '
            + number(season.keyDay) + '</small></div>'
            + '<em>' + esc(season.note) + '</em>'
            + '<span class="forest-atlas__season-facts">' + esc(facts) + '</span></article>';
    }).join("");
    return '<div class="forest-atlas__year" data-forest-year="' + number(profile.seasons.length)
        + '" data-forest-year-current="' + esc(profile.seasons[active].id) + '">'
        + '<div class="forest-atlas__year-head"><b>A YEAR IN THE WOOD</b><span>'
        + esc(profile.short) + ' · ' + esc(profile.phenology ? 'turn day ' + profile.phenology.turn : profile.family)
        + ' · ' + esc(profile.ground.label) + '</span></div>' + rows + '</div>';
}

function canopyDepth(profile) {
    const layers = profile?.canopyLayers || [];
    if (!layers.length) return "";
    const rows = layers.map(layer => '<div class="forest-atlas__canopy-layer" data-forest-canopy-layer="'
        + esc(layer.id) + '"><small>' + esc(layer.label) + '</small><i><b style="width:'
        + Math.round(layer.opacity * 100) + '%;background:' + esc(layer.tint) + '"></b></i><em>'
        + layer.parallax.toFixed(3) + '×</em></div>').join("");
    return '<div class="forest-atlas__canopy" data-forest-canopy-layers="' + number(layers.length) + '">'
        + '<div class="forest-atlas__canopy-head"><b>CANOPY DEPTH</b><span>'
        + esc(profile.family) + ' · ' + profile.parallax.toFixed(3) + '× base parallax</span></div>'
        + rows + '</div>';
}

function soundPreview(profile, scene, cueKinds) {
    if (!profile?.sound) return "";
    const last = forestAmbienceHistory()[0];
    const buttons = (cueKinds || []).map(entry => '<button type="button" class="forest-atlas__cue-button" data-forest-cue="'
        + esc(entry.id) + '" aria-label="' + esc(entry.action) + '" title="' + esc(entry.detail) + '">'
        + esc(String(entry.label).toUpperCase()) + '</button>').join("");
    return '<div class="forest-atlas__sound" data-forest-soundscape="' + number((cueKinds || []).length)
        + '" data-forest-sound-mode="' + esc(profile.sound.scale?.mode || 'Ionian') + '">'
        + '<div class="forest-atlas__sound-head"><b>LISTEN TO THIS WOOD</b><span>'
        + esc(profile.short) + ' · ' + esc(profile.sound.scale?.mode || 'Ionian') + ' · '
        + number(profile.sound.tempo) + ' bpm · ' + esc(profile.sound.bed) + '</span></div>'
        + '<div class="forest-atlas__cue-grid">' + buttons + '</div>'
        + '<p class="forest-atlas__cue-text" data-forest-cue-text role="status" aria-live="polite">'
        + 'Tap a cue to hear this wood. Every cue is printed here even with the sound muted.</p>'
        + '<p class="forest-atlas__last-cue" data-forest-last-cue>'
        + (last ? 'LAST HEARD · ' + esc(last.text) : 'NO CUE HEARD YET') + '</p>'
        + '<small>Preview follows the forest ambience volume and subtitle setting. It never changes the regional bed or the save.</small>'
        + '</div>';
}

// Two compact lines, not one node per season and field mark. The phone atlas
// renders all sixty cards at once; the full four-card calendar lives once in
// the presentation block above, and the card keeps the same information in a
// single bounded row so the staged panel still opens quickly.
function cardSeasonLine(profile) {
    if (!profile?.seasons?.length) return "";
    return '<p class="forest-atlas__season-line" data-forest-season-line="' + number(profile.seasons.length) + '">'
        + '<b>SEASONS</b> ' + profile.seasons.map(season => esc(season.label) + ' day '
            + number(season.keyDay)).join(' · ') + '</p>';
}

function cardFieldMarks(profile) {
    if (!profile?.fieldMarks?.length) return "";
    return '<p class="forest-atlas__field-marks-line" data-forest-field-marks="' + number(profile.fieldMarks.length) + '">'
        + '<b>FIELD MARKS</b> ' + profile.fieldMarks.map(esc).join(' · ') + '</p>';
}

function presentationFilterChip(group, option, current) {
    const active = current === option.id;
    return '<button type="button" class="forest-atlas__filter-chip is-pattern-'
        + esc(group.pattern || 'dots') + (active ? ' is-current' : '') + '" data-forest-filter="'
        + esc(group.id) + '" data-forest-filter-value="' + esc(option.id) + '" aria-pressed="'
        + (active ? 'true' : 'false') + '">' + esc(option.label) + '</button>';
}

const PRESENTATION_FAMILY_PATTERNS = {
    conifer: 'chevron', emergent: 'diamond', broadleaf: 'dots', airy: 'rays',
    coastal: 'waves', riparian: 'waves', dry: 'cross', columnar: 'bars',
    umbrella: 'rings', baobab: 'rings', thorn: 'cross', mangrove: 'waves',
    bamboo: 'bars', scrub: 'dots', willow: 'waves', heath: 'chevron',
};

function presentationShellMarkup(data) {
    const { settings, summary, scene, profile, guide, activeCount } = data;
    return '<section class="forest-atlas__presentation' + (settings.forestColorblind ? ' ui-forest-colorblind' : '')
        + (settings.forestCanopyContrast ? ' ui-forest-contrast' : '')
        + (settings.forestFontScale === 'normal' ? '' : ' forest-font-' + esc(settings.forestFontScale))
        + '" data-forest-presentation="' + number(guide.length)
        + '" data-presentation-profiles="' + number(summary.profiles)
        + '" data-presentation-patterns="' + number(summary.patterns.length) + '">'
        + '<div class="command-section-title">FOREST PRESENTATION, AUDIO &amp; ACCESSIBILITY · 1.2.23.1.241–270 · '
        + number(guide.length) + ' POINTS</div>'
        + '<p class="command-note">Sixty regional woods share one visual, acoustic and cartographic language. '
        + 'The legend below is generated from the same profile tables the map draws from; the filters narrow the sixty types by family, resource and protection; '
        + 'the field guide reads each point against the reference wood: '
        + (profile ? esc(profile.short) + ' · ' + esc(profile.silhouette) + ' · ' + esc(profile.fog.label) : 'no wooded reference tile in view')
        + '.</p>'
        + '<div class="command-summary forest-atlas__presentation-summary">'
        + '<div><small>PROFILES</small><strong>' + number(summary.profiles) + ' / ' + number(summary.families.length) + ' FAMILIES</strong></div>'
        + '<div><small>PATTERNS</small><strong>' + number(summary.patterns.length) + '</strong></div>'
        + '<div><small>FOG TYPES</small><strong>' + number(summary.fogs.length) + '</strong></div>'
        + '<div><small>GROUND WEAVES</small><strong>' + number(summary.grounds.length) + '</strong></div>'
        + '<div><small>FILTERS ACTIVE</small><strong data-forest-filter-status="' + activeCount + '" role="status" aria-live="polite">' + number(activeCount) + ' / 3</strong></div>'
        + '<div><small>REFERENCE WOOD</small><strong>' + (profile ? esc(profile.id.slice(-3)) + ' · ' + esc(profile.family.toUpperCase()) : '—') + '</strong></div></div>'
        + '<div class="command-section-title">A YEAR IN THE WOOD · PHENOLOGY &amp; DEPTH</div>';
}

function presentationPhenologyMarkup(data) {
    return seasonCalendar(data.profile, data.scene)
        + canopyDepth(data.profile)
        + soundPreview(data.profile, data.scene, data.summary.cueKinds)
        + '<div class="command-section-title">FILTER THE ATLAS · FAMILY, RESOURCE, PROTECTION</div>';
}

function presentationFiltersMarkup(data) {
    return '<div class="forest-atlas__filter-bar" role="group" aria-label="Forest atlas filters">' + data.filterGroups
        + '<div class="forest-atlas__filter-group"><small>RESET</small><button type="button" class="forest-atlas__filter-chip" data-forest-filter-reset="1">ALL SIXTY TYPES</button></div></div>'
        + '<div class="command-section-title">LEGEND · ECOLOGICAL SYMBOLS</div>';
}

function presentationLegendMarkup(data) {
    return '<div class="forest-atlas__legend-grid">' + data.legendRows + '</div>'
        + '<div class="forest-atlas__legend-grid forest-atlas__legend-grid--compact">' + data.useRows + data.dangerRows + '</div>'
        + '<div class="forest-atlas__legend-protection"><b>PROTECTION</b> ' + data.protectionRows + '</div>'
        + '<div class="command-section-title">ACCESSIBILITY &amp; PERFORMANCE SETTINGS IN THIS VIEW</div>';
}

function presentationSettingsMarkup(data) {
    return '<div class="forest-atlas__presentation-settings" data-forest-settings="' + esc(data.settings.forestMapView) + '">' + data.settingChips + '</div>'
        + '<p class="command-note">Change these in Settings → FOREST PRESENTATION &amp; ACCESSIBILITY. '
        + 'Forest text scales the atlas cards, notes, chips and this guide without changing the map. '
        + 'Colour-blind mode adds the family patterns shown above; canopy contrast separates mass crowns from the shade; '
        + 'performance mode and the symbolic map view cut presentation work without touching the simulation or the save.</p>'
        + '<details class="forest-atlas__field-guide forest-atlas__presentation-guide" data-presentation-guide="'
        + number(data.guide.length) + '"><summary><span>FIELD GUIDE · ' + number(data.guide.length) + ' POINTS</span>'
        + '<strong>Appearance, sound, map reading and access</strong><em>1.2.23.1.241–270 · live readings from the reference wood</em></summary>'
        + '<p class="forest-atlas__guide-intro">Each point names the system that makes it real in play and its current reading. '
        + 'Regional colour, silhouette, fog, ground, wind, fauna and sound all come from the same sixty-type profile; '
        + 'the accessibility controls change presentation only, never simulation, save compatibility or determinism.</p>'
        + '<div class="forest-atlas__guide-grid">';
}

function presentationParts() {
    const data = {};
    return {
        html: "",
        more: [
            () => { data.settings = forestPresentationSettings(); return ""; },
            () => {
                data.summary = forestPresentationSummary();
                data.scene = data.summary.scene || {};
                data.profile = data.scene.profile || null;
                return "";
            },
            () => { data.filters = forestMapFilters(); data.groups = forestFilterOptions(); return ""; },
            () => { data.legend = forestLegendEntries(); data.uses = forestUseLegend(); data.dangers = forestDangerLegend(); return ""; },
            () => { data.guide = forestPresentationGuide(data.scene); return ""; },
            () => {
                data.patternGroups = data.groups.map(group => ({
                    ...group,
                    pattern: group.id === 'family' ? 'chevron' : group.id === 'resource' ? 'rays' : 'dots',
                }));
                data.activeCount = Object.values(data.filters).filter(value => value !== 'all').length;
                return "";
            },
            () => {
                // The family legend is also a filter: a player can tap the
                // symbol they are looking at instead of translating it back.
                data.legendRows = data.legend.map(entry => '<button type="button" class="forest-atlas__legend-entry" data-forest-legend="'
                    + esc(entry.family) + '" data-forest-family-filter="' + esc(entry.family)
                    + '" aria-pressed="' + (data.filters.family === entry.family ? 'true' : 'false') + '" title="Filter '
                    + esc(entry.label) + ' woods"><span class="forest-atlas__legend-swatch is-pattern-'
                    + esc(PRESENTATION_FAMILY_PATTERNS[entry.family] || entry.pattern) + '" aria-hidden="true"><b>'
                    + esc(entry.icon) + '</b></span><div><strong>' + esc(entry.label) + '</strong><small>'
                    + esc(entry.detail) + ' · ' + esc(entry.ground) + ' · ' + esc(entry.light)
                    + '</small></div></button>').join("");
                return "";
            },
            () => {
                data.useRows = data.uses.map(entry => '<div class="forest-atlas__legend-entry" data-forest-use="'
                    + esc(entry.id) + '"><span class="forest-atlas__legend-glyph" aria-hidden="true">'
                    + esc(entry.glyph) + '</span><div><strong>' + esc(entry.label) + '</strong><small>'
                    + esc(entry.detail) + '</small></div></div>').join("");
                data.dangerRows = data.dangers.map(entry => '<div class="forest-atlas__legend-entry" data-forest-danger="'
                    + esc(entry.id) + '"><span class="forest-atlas__legend-glyph" aria-hidden="true">'
                    + esc(entry.glyph) + '</span><div><strong>' + esc(entry.label) + '</strong><small>'
                    + esc(entry.detail) + '</small></div></div>').join("");
                data.protectionRows = FOREST_PROTECTION_STATES.filter(entry => entry.id !== 'all')
                    .map(entry => '<span class="forest-atlas__protection" data-forest-protection="'
                        + esc(entry.id) + '">' + esc(entry.label) + '</span>').join("");
                return "";
            },
            () => {
                data.filterGroups = data.patternGroups.map(group => '<div class="forest-atlas__filter-group" data-forest-filter-group="'
                    + esc(group.id) + '"><small>' + esc(group.label) + '</small><div class="forest-atlas__filter-row">'
                    + group.options.map(option => presentationFilterChip(group, option, data.filters[group.id])).join("")
                    + '</div></div>').join("");
                return "";
            },
            () => {
                data.settingChips = [
                    ['Ambience', data.settings.forestAmbience ? 'ON · ' + Math.round(data.settings.forestAmbienceVolume * 100) + '%' : 'OFF'],
                    ['Subtitles', data.settings.forestSubtitles ? 'ON' : 'OFF'],
                    ['Colour-blind', data.settings.forestColorblind ? 'ON' : 'OFF'],
                    ['Canopy contrast', data.settings.forestCanopyContrast ? 'ON' : 'OFF'],
                    ['Forest text', String(data.settings.forestFontScale).toUpperCase()],
                    ['Performance', data.settings.forestPerformance ? 'ON' : 'OFF'],
                    ['Particles', data.settings.forestReducedParticles ? 'REDUCED' : 'FULL'],
                    ['Map view', data.settings.forestMapView === 'symbolic' ? 'SYMBOLIC' : 'DETAILED'],
                ].map(([label, value]) => '<span><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong></span>').join("");
                return "";
            },
            () => {
                data.guideChunks = chunkRows(data.guide.map(entry => '<article class="forest-atlas__guide-point forest-atlas__presentation-point" data-presentation-point="'
                    + esc(entry.id) + '" data-presentation-group="' + esc(entry.group) + '">'
                    + '<div class="forest-atlas__guide-head"><b>' + esc(entry.id.slice(-3)) + '</b><span>'
                    + esc(entry.group.toUpperCase()) + '</span></div><h4>' + esc(entry.title) + '</h4>'
                    + '<p><b>WHAT IT DOES</b> ' + esc(entry.point) + '</p>'
                    + '<p><b>LIVE IN THIS WOOD</b> ' + esc(entry.value) + '</p>'
                    + '<small>' + esc(entry.consumer) + '</small>'
                    + '<p class="forest-atlas__presentation-detail">' + esc(entry.detail) + '</p></article>'), 6);
                return "";
            },
            () => ({ html: presentationShellMarkup(data) }),
            () => ({ html: presentationPhenologyMarkup(data) }),
            () => ({ html: presentationFiltersMarkup(data) }),
            () => ({ html: presentationLegendMarkup(data) }),
            () => ({ html: presentationSettingsMarkup(data) }),
            () => ({
                html: "",
                more: [
                    ...data.guideChunks.map(rows => ({ html: () => rows.join("") })),
                    () => '</div></details></section>',
                ],
            }),
        ],
    };
}

function presentationBlock() {
    return joinParts(presentationParts());
}

function joinParts(parts) {
    const append = part => {
        const value = typeof part === "function" ? part() : part;
        if (typeof value === "string") return value;
        if (!value) return "";
        if (Array.isArray(value)) return value.map(append).join("");
        const html = typeof value.html === "function" ? value.html() : value.html;
        const text = typeof html === "string" ? html : "";
        const more = Array.isArray(value.more) ? value.more : [];
        return text + more.map(append).join("");
    };
    return (Array.isArray(parts) ? parts : [parts]).map(append).join("");
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
    return chunks;
}

// The atlas is the largest panel in the game: sixty closed record cards plus
// five long reference blocks. Building all of them in the click task measured
// over a second at 4x CPU, so the same content is exposed as bounded parts.
// The plain renderer joins them for callers that still expect one string; the
// management deck hands the functions to the staged hydrator instead.
export function renderForestAtlasPanelParts() {
    const builder = createForestAtlasSurveyBuilder();
    // One bounded survey slice per frame. Returning `more` hands the next
    // slice to the existing scheduler without creating hundreds of up-front
    // no-op parts that would delay the first visible card for seconds.
    const surveyStep = () => {
        if (builder.done()) return "";
        // A batch of six advances still measured 15–32 ms per empty part on a
        // throttled Chromium because one derived phase can itself be costly.
        // One phase per part keeps the state machine's work bounded by the
        // longest single reading while preserving the exact phase order,
        // strided sample list and final snapshot. The scheduler batches several
        // parts per frame, so the extra continuations do not add a frame each.
        builder.advance();
        return builder.done() ? "" : { html: "", more: [surveyStep] };
    };
    const late = {
        survey: null, unavailable: false, present: 0, currentSeason: 0,
        pulse: null, byKind: null, chunk: null, visibleTypes: []
    };
    const prepare = () => {
        if (late.survey) return;
        const survey = builder.value() || unavailableSurvey();
        late.survey = survey;
        if (!survey.available) { late.unavailable = true; return; }
        late.present = survey.types.filter(type => type.count > 0).length;
        late.currentSeason = Math.max(0, Math.min(3, Number(state.seasonIndex) || 0));
        late.pulse = survey.succession || {};
        late.byKind = late.pulse.byKind || {};
        late.chunk = survey.chunk;
        late.visibleTypes = REGIONAL_FOREST_TYPES.filter(type => {
            const profile = forestPresentationProfile(type.id);
            const row = survey.types.find(entry => entry.id === type.id);
            const region = survey.regions.find(entry => entry.id === type.id);
            const protection = region?.sample?.protection
                || (region?.disturbances?.active > 0 ? 'disturbed'
                    : row?.dynamics?.silviculture?.system ? 'managed' : 'unmanaged');
            return forestMatchesFilters({
                family: profile?.family,
                resources: profile?.resources || [],
                protection,
            });
        });
    };
    const ready = () => { prepare(); return late.unavailable ? null : late.survey; };
    const footnote = '<p class="command-note">The realm count comes from a bounded deterministic sample of up to ' + number(SURVEY_LIMIT)
        + ' forest tiles; it is a survey, not a per-frame scan. Timber, regrowth, wildlife, forage and work are live simulation inputs: they price lumber batches, gathering yields, regrowth and habitat. Flood raises the spoilage of a perishable harvest, and a signature good pays a bonus in its own season. The ecology block is taken from the first surveyed tile of each type: it reports the actual mixture class, succession phase, seed bank, mother trees, genetic breadth, site fitness, disease resistance, silvicultural system, roots, humus, mycorrhiza, understorey, lianas, epiphytes and canopy gaps. Timber prices are the current seasonal base quote of the regional timber market in the Royal Stores.</p>';
    return [
        surveyStep,
        () => {
            const survey = ready();
            if (!survey) return intro("THE FOREST ATLAS", "Regional woodland", "The atlas is charted with the realm. Start or load a campaign to classify its forest tiles.")
                + '<p class="command-note">No resource geography is available in this session.</p>';
            return intro("THE FOREST ATLAS", "Sixty regional woodlands",
                "Every forest tile belongs to exactly one regional type, and boundary tiles name the woodland they blend into. Open a type to read its field marks, its signature good, its timber, its ecological effects, its soil/water envelope, its disturbance and succession matrix, its biodiversity index and its bounded LOD budget.")
                + '<div class="command-summary"><div><small>CATALOGUED</small><strong>' + number(REGIONAL_FOREST_TYPES.length) + ' TYPES</strong></div>'
                + '<div><small>IN THIS REALM</small><strong>' + number(late.present) + ' TYPES</strong></div>'
                + '<div><small>SILVICULTURE</small><strong>' + survey.systems.filter(row => row.count > 0).length + ' / 6 SYSTEMS</strong></div>'
                + '<div><small>ECOLOGY SAMPLE</small><strong>' + number(survey.sampled) + ' STANDS</strong></div>'
                + '</div>';
        },
        () => {
            const survey = ready();
            if (!survey) return "";
            return '<div class="command-section-title">SILVICULTURE IN SAMPLE</div>'
                + '<div class="command-summary forest-atlas__systems">' + survey.systems.map(row =>
                    '<div data-forest-system="' + esc(row.id) + '"><small>' + esc(row.label) + '</small><strong>'
                    + number(row.count) + '</strong></div>').join('') + '</div>'
                + '<div class="command-summary">'
                + '<div><small>FOREST TILES</small><strong>' + number(survey.forestTiles) + '</strong></div>'
                + '<div><small>SURVEYED</small><strong>' + number(survey.sampled) + ' SAMPLES</strong></div>'
                + '<div><small>TRANSITION EDGES</small><strong>' + number(survey.transitionSamples) + '</strong></div>'
                + '<div><small>SEASON</small><strong>' + esc(survey.season.toUpperCase()) + '</strong></div></div>';
        },
        () => {
            const survey = ready();
            if (!survey) return "";
            return '<div class="command-section-title">LIVE ECOLOGY PULSE</div>'
                + '<div class="command-summary" data-forest-process="' + number(late.pulse.active) + '" data-forest-flood="'
                + number(late.byKind.flooded) + '" data-forest-chunk="' + esc(late.chunk?.key || 'none') + '">'
                + '<div><small>ACTIVE DISTURBANCES</small><strong>' + number(late.pulse.active) + '</strong></div>'
                + '<div><small>CONTAINED</small><strong>' + number(late.pulse.contained) + '</strong></div>'
                + '<div><small>SPREADS</small><strong>' + number(late.pulse.spreadings) + '</strong></div>'
                + '<div><small>ACTIVE FLOODS</small><strong>' + number(late.byKind.flooded) + '</strong></div>'
                + '<div><small>CHUNK / LOD</small><strong>' + esc(late.chunk ? late.chunk.budget.lod.toUpperCase() : 'WAITING')
                + ' · ' + number(late.chunk?.sampled) + ' SAMPLES</strong></div>'
                + '<div><small>MODEL CACHE</small><strong>' + number(survey.cache?.chunks) + ' / '
                + number(survey.cache?.limit) + '</strong></div></div>'
                + '<p class="command-note" data-forest-model-telemetry="' + number(survey.telemetry?.chunksBuilt) + '">'
                + 'The pulse is read from the real succession tiles, the shared chunk budget and the bounded model cache. '
                + 'Chunk builds: ' + number(survey.telemetry?.chunksBuilt) + ' · max ' + number(survey.telemetry?.maxMs)
                + ' ms · types seen: ' + number(survey.telemetry?.typesSeen) + '. No per-tile work is added to the simulation tick.</p>';
        },
        // Keep the published document order: the sixty woodlands sit directly
        // below the live counts, and every reference section follows the list.
        // Staging mounts the cards into their stream one at a time without
        // changing that order or the bytes a plain renderer produces.
        () => {
            const survey = ready();
            if (!survey) return "";
            // The closing tag is its own part so the joined plain renderer and
            // the staged DOM both place every card inside this exact container.
            return '<div class="forest-atlas">'
                + (late.visibleTypes.length ? '' : '<p class="command-note" data-forest-filter-empty="1">No regional type matches the active filters. Reset the filter bar above to show all sixty types.</p>');
        },
        ...Array.from({ length: 60 }, (_, index) => ({
            into: "div.forest-atlas",
            html: () => {
                const survey = ready();
                if (!survey) return "";
                const type = late.visibleTypes[index];
                if (!type) return "";
                const row = survey.types.find(entry => entry.id === type.id);
                return card(type, row?.count || 0, survey.sampled, row?.transitionCount || 0, late.currentSeason, row?.dynamics || null, row?.fauna || null, row?.model || null);
            }
        })),
        () => "</div>",
        () => ready() ? presentationParts() : "",
        () => ready() ? industryParts() : "",
        () => ready() ? cultureParts() : "",
        () => ready() ? legacyBlock() : "",
        () => ready() ? warfareParts() : "",
        () => { const survey = ready(); return survey ? regionHistoryBlock(survey) : ""; },
        () => { const survey = ready(); return survey ? faunaFieldGuide(survey) : ""; },
        () => footnote
    ];
}

export function renderForestAtlasPanel() {
    // Older callers still expect one string. Complete the same bounded survey
    // synchronously first so every generated part sees the finished snapshot.
    forestAtlasSurvey();
    return joinParts(renderForestAtlasPanelParts());
}
