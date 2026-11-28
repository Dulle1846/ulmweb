// 1.2.23.2–16 — persistent frontier biomes, player actions and one yearly pass.
//
// The fifteen catalogued ecosystems are bound to the existing 36-region biome
// atlas. There is no second map and no per-tile work: each site is one small
// DTO, every action spends real resources, and the annual consequences settle
// once in the ordinary yearly chain. The ledger is additive and optional, so a
// save written before this release keeps working and starts a deterministic
// catalogue on its next tick.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { getClimateDrift } from "./climate-drift.js";
import { applyPoliticalEffects } from "./politics.js";
import {
    BIOME_FRONTIER_ACTIONS, BIOME_FRONTIER_ASPECTS, BIOME_FRONTIER_BY_ID,
    BIOME_FRONTIER_CYCLE_LIMIT, BIOME_FRONTIER_FAMILIES, BIOME_FRONTIER_GOOD_LIMIT,
    BIOME_FRONTIER_GOODS_CAP, BIOME_FRONTIER_GROUPS, BIOME_FRONTIER_GUARDRAILS,
    BIOME_FRONTIER_HAZARD_LIMIT, BIOME_FRONTIER_HISTORY_LIMIT,
    BIOME_FRONTIER_JOURNAL_TIER_LIMIT, BIOME_FRONTIER_PHASES,
    BIOME_FRONTIER_REFERENCE_SEEDS, BIOME_FRONTIER_REQUIREMENTS,
    BIOME_FRONTIER_SITE_HISTORY_LIMIT, BIOME_FRONTIER_SITE_LIMIT,
    BIOME_FRONTIER_SPECIALIST_LIMIT, BIOME_FRONTIER_SPECIES_LIMIT,
    BIOME_FRONTIER_VERSION,
} from "../world/biome-frontiers.js";

export const BIOME_FRONTIER_UPDATE_INTERVAL_YEARS = 1;
export const BIOME_FRONTIER_VANISH_CONDITION = 0.5;
export const BIOME_FRONTIER_REVIVE_CONDITION = 16;
export const BIOME_FRONTIER_GOOD_STOCK_LIMIT = 40;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
const text = (value, limit = 180) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
const title = value => String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

function hash32(seed, a = 0, b = 0, c = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 7, 0x85ebca6b)
        ^ Math.imul((Number(c) | 0) + 13, 0xc2b2ae35);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value >>> 0;
}

function hashString(value) {
    let hash = 2166136261;
    const source = String(value ?? "");
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

const unit = (seed, a, b, c) => hash32(seed, a, b, c) / 4294967296;

function yearNow() {
    return Math.max(1, Math.floor(num(state.year, 1)));
}

function logEvent(message, color = "#9fc08e") {
    try { addLog(message, color, "nature"); } catch { /* presentation only */ }
}

function biomeRegions() {
    return Array.isArray(state.biomeAtlas?.regions) ? state.biomeAtlas.regions : [];
}

function linkedAtlasRegion(def) {
    const regions = biomeRegions();
    if (!regions.length) return null;
    const anchor = def.site?.anchor || [0.5, 0.5];
    const width = Math.max(1, num(state.worldW, 1));
    const height = Math.max(1, num(state.worldH, 1));
    const x = anchor[0] * width;
    const y = anchor[1] * height;
    const preferred = regions.filter(region => def.atlasBiomes.includes(String(region.rawBiome || region.biome || "")));
    const pool = preferred.length ? preferred : regions;
    let best = null;
    let bestDistance = Infinity;
    for (const region of pool) {
        const cx = num(region.x, 0) + num(region.width, 0) / 2;
        const cy = num(region.y, 0) + num(region.height, 0) / 2;
        const distance = (cx - x) ** 2 + (cy - y) ** 2;
        if (distance < bestDistance) { best = region; bestDistance = distance; }
    }
    return best || null;
}

export function biomeFrontierPhaseFor(condition) {
    const value = clamp(condition, 0, 100);
    if (value < BIOME_FRONTIER_VANISH_CONDITION) return BIOME_FRONTIER_PHASES[BIOME_FRONTIER_PHASES.length - 1];
    for (const phase of BIOME_FRONTIER_PHASES) if (value >= phase.minCondition) return phase;
    return BIOME_FRONTIER_PHASES[BIOME_FRONTIER_PHASES.length - 1];
}

const CYCLE_PHASE_COUNT = 4;

function cyclePeriodNumber(cycle, year, offset) {
    return Math.floor((Math.max(1, year) - 1 + Math.max(0, offset)) / Math.max(1, cycle.period));
}

function cyclePhaseIndex(cycle, year, offset) {
    const period = Math.max(1, cycle.period);
    const span = Math.max(1, Math.floor(period / CYCLE_PHASE_COUNT));
    return Math.min(CYCLE_PHASE_COUNT - 1, Math.floor(((Math.max(1, year) - 1 + Math.max(0, offset)) % period) / span));
}

function cycleYearsToPhase(cycle, year, offset, target) {
    const period = Math.max(1, cycle.period);
    const span = Math.max(1, Math.floor(period / CYCLE_PHASE_COUNT));
    const elapsed = Math.max(1, year) - 1 + Math.max(0, offset);
    const targetAt = Math.floor(elapsed / period) * period + Math.max(0, Math.min(CYCLE_PHASE_COUNT - 1, target)) * span;
    return targetAt >= elapsed ? targetAt - elapsed : targetAt + period - elapsed;
}

function createCycles(def, year, seed) {
    const state = {};
    for (const [index, cycle] of (def.cycles || []).slice(0, BIOME_FRONTIER_CYCLE_LIMIT).entries()) {
        const offset = hash32(seed, hashString(def.id), index + 1, 0x43594c) % Math.max(1, cycle.period);
        const phase = cyclePhaseIndex(cycle, year, offset);
        const periodNumber = cyclePeriodNumber(cycle, year, offset);
        state[cycle.id] = {
            phase,
            offset,
            lastYear: year,
            harvests: 0,
            regenerations: 0,
            completions: 0,
            lastHarvestPeriod: phase === cycle.harvestPhase ? periodNumber : -1,
            lastRegenerationPeriod: phase === cycle.regenerationPhase ? periodNumber : -1,
            lastCompletionPeriod: phase === 0 ? periodNumber : -1,
        };
    }
    return state;
}

function normalizeCycles(saved, def, year, seed) {
    const base = createCycles(def, year, seed);
    const source = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    const cycles = {};
    for (const [id, fallback] of Object.entries(base)) {
        const row = source[id] && typeof source[id] === "object" && !Array.isArray(source[id]) ? source[id] : {};
        const cycle = (def.cycles || []).find(entry => entry.id === id);
        const offset = cycle ? Math.max(0, Math.floor(num(row.offset, fallback.offset))) % Math.max(1, cycle.period) : fallback.offset;
        const phase = Math.max(0, Math.min(CYCLE_PHASE_COUNT - 1, Math.floor(num(row.phase, fallback.phase))));
        cycles[id] = {
            phase,
            offset,
            lastYear: Math.max(1, Math.floor(num(row.lastYear, year))),
            harvests: Math.max(0, Math.floor(num(row.harvests, 0))),
            regenerations: Math.max(0, Math.floor(num(row.regenerations, 0))),
            completions: Math.max(0, Math.floor(num(row.completions, 0))),
            lastHarvestPeriod: Number.isFinite(Number(row.lastHarvestPeriod)) ? Math.floor(Number(row.lastHarvestPeriod)) : fallback.lastHarvestPeriod,
            lastRegenerationPeriod: Number.isFinite(Number(row.lastRegenerationPeriod)) ? Math.floor(Number(row.lastRegenerationPeriod)) : fallback.lastRegenerationPeriod,
            lastCompletionPeriod: Number.isFinite(Number(row.lastCompletionPeriod)) ? Math.floor(Number(row.lastCompletionPeriod)) : fallback.lastCompletionPeriod,
        };
    }
    return cycles;
}

function cycleTotals(site) {
    const rows = Object.values(site.cycles || {}).filter(row => row && typeof row === "object");
    return {
        harvests: rows.reduce((sum, row) => sum + Math.max(0, Math.floor(num(row.harvests, 0))), 0),
        regenerations: rows.reduce((sum, row) => sum + Math.max(0, Math.floor(num(row.regenerations, 0))), 0),
        completions: rows.reduce((sum, row) => sum + Math.max(0, Math.floor(num(row.completions, 0))), 0),
    };
}

function createSpecies(def, seed) {
    return def.species.slice(0, BIOME_FRONTIER_SPECIES_LIMIT).map((row, index) => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        cover: round(clamp(row.cover + unit(seed, index, 1, 0x535045) * 8 - 4, 1, 100), 1),
        note: text(row.note, 100),
        status: "living",
    }));
}

function createSpecialists(def) {
    return def.specialists.slice(0, BIOME_FRONTIER_SPECIALIST_LIMIT).map(row => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        note: text(row.note, 120),
        status: "living",
    }));
}

function createHazards(def) {
    return def.hazards.slice(0, BIOME_FRONTIER_HAZARD_LIMIT).map(row => ({
        id: row.id,
        label: row.label,
        trigger: text(row.trigger, 100),
        effect: text(row.effect, 140),
        memory: 0,
        severity: 0,
        year: 0,
    }));
}

function createGoods(def) {
    return def.goods.slice(0, BIOME_FRONTIER_GOOD_LIMIT).map(row => ({
        id: row.id,
        label: row.label,
        value: Math.max(1, Math.round(num(row.value, 5))),
        annual: clamp(num(row.annual, 1), 1, 4),
        note: text(row.note, 100),
        stock: 0,
    }));
}

export function createBiomeFrontierSite(def, index, seed, year = yearNow()) {
    const siteSeed = hash32(seed, hashString(def.id), index + 1, 0x46524e54);
    const linked = linkedAtlasRegion(def);
    const condition = round(clamp(def.startCondition + unit(siteSeed, 2, 3, 5) * 10 - 5, 8, 96), 1);
    const corruption = round(clamp((def.curseBase || 0) * 100 + unit(siteSeed, 4, 6, 8) * 6, 0, 100), 1);
    const magic = round(clamp((def.magicBase || 0) * 100 + unit(siteSeed, 7, 9, 11) * 8, 0, 100), 1);
    const aspect = def.aspect === "transfigured" ? "transfigured" : corruption >= 55 ? "blighted" : "natural";
    return {
        id: "frontier-" + def.id,
        family: def.id,
        requirement: def.requirement,
        name: def.site.name,
        variant: def.site.variant,
        lore: text(def.site.lore, 180),
        originBiome: text(def.originBiome || def.site.originBiome || "", 140),
        atlasRegionId: linked?.id ? text(linked.id, 40) : null,
        atlasRegionName: linked?.name ? text(linked.name, 60) : null,
        biomeLabel: linked ? text(linked.biomeLabel || linked.biome || "", 60) : "",
        climate: def.climates[0],
        climateAnalogIndex: 0,
        climatePressure: round(10 + unit(siteSeed, 13, 15, 17) * 16, 1),
        condition,
        extent: round(clamp(def.startExtent + unit(siteSeed, 19, 21, 23) * 10 - 5, 2, 100), 1),
        magic,
        corruption,
        ageYears: Math.max(1, Math.round(def.ageYears + unit(siteSeed, 25, 27, 29) * Math.max(40, def.ageYears * 0.18))),
        aspect,
        aspectSince: aspect === "natural" ? 0 : Math.max(1, year),
        phase: biomeFrontierPhaseFor(condition).id,
        protected: false,
        charter: false,
        surveyed: false,
        deepSurveyed: false,
        lastActionYear: 0,
        lastStabiliseYear: 0,
        vanishedYear: 0,
        transfiguredYear: aspect === "transfigured" ? Math.max(1, year - 3) : 0,
        climateShiftYear: 0,
        surveys: 0,
        restored: 0,
        harvested: 0,
        stabilised: 0,
        layers: def.relics.slice(0, 1),
        species: createSpecies(def, siteSeed),
        specialists: createSpecialists(def),
        hazards: createHazards(def),
        goods: createGoods(def),
        journal: [],
        cycles: createCycles(def, year, siteSeed),
        history: [],
    };
}

function baseState(year = yearNow()) {
    const seed = Math.max(1, Math.floor(num(state.worldSeed, 23201)));
    const sites = BIOME_FRONTIER_FAMILIES.map((def, index) => createBiomeFrontierSite(def, index, seed, year))
        .slice(0, BIOME_FRONTIER_SITE_LIMIT);
    return {
        version: BIOME_FRONTIER_VERSION,
        seed,
        lastYear: year,
        lastUpdateYear: year,
        revision: 0,
        climate: { drift: getClimateDrift(), warming: 0 },
        sites,
        history: [],
        stats: {
            surveyed: 0, conserved: 0, restored: 0, revived: 0, harvested: 0,
            stabilised: 0, vanished: 0, transfigured: 0, climateShifts: 0,
            magicEvents: 0, catastrophes: 0, goods: 0, discoveries: 0,
            cycleHarvests: 0, cycleRegenerations: 0, cycleCompletions: 0,
        },
    };
}

function normalizeSpecies(row, def, index) {
    const catalog = def.species[index];
    if (!catalog) return null;
    return {
        id: catalog.id,
        label: catalog.label,
        kind: catalog.kind,
        cover: round(clamp(num(row?.cover, catalog.cover), 0, 100), 1),
        note: text(catalog.note, 100),
        status: row?.status === "vanished" || row?.status === "extinct" ? "vanished" : "living",
    };
}

function normalizeSpecialist(row, def, index) {
    const catalog = def.specialists[index];
    if (!catalog) return null;
    return {
        id: catalog.id,
        label: catalog.label,
        kind: catalog.kind,
        note: text(catalog.note, 120),
        status: row?.status === "vanished" || row?.status === "extinct" ? "vanished" : "living",
    };
}

function normalizeHazard(row, def, index) {
    const catalog = def.hazards[index];
    if (!catalog) return null;
    return {
        id: catalog.id,
        label: catalog.label,
        trigger: text(catalog.trigger, 100),
        effect: text(catalog.effect, 140),
        memory: Math.max(0, Math.floor(num(row?.memory, 0))),
        severity: round(clamp(num(row?.severity, 0), 0, 1), 2),
        year: Math.max(0, Math.floor(num(row?.year, 0))),
    };
}

function normalizeGood(row, def, index) {
    const catalog = def.goods[index];
    if (!catalog) return null;
    return {
        id: catalog.id,
        label: catalog.label,
        value: Math.max(1, Math.round(num(catalog.value, 5))),
        annual: clamp(num(catalog.annual, 1), 1, 4),
        note: text(catalog.note, 100),
        stock: clamp(Math.floor(num(row?.stock, 0)), 0, BIOME_FRONTIER_GOODS_CAP),
    };
}

function normalizeHistory(entry) {
    if (!entry || typeof entry !== "object") return null;
    return {
        year: Math.max(1, Math.floor(num(entry.year, 1))),
        kind: text(entry.kind || "note", 24),
        text: text(entry.text || "", 160),
    };
}

function normalizeSite(row, def, index, seed, year) {
    const saved = row && typeof row === "object" ? row : {};
    const condition = round(clamp(num(saved.condition, def.startCondition), 0, 100), 1);
    const phase = biomeFrontierPhaseFor(condition).id;
    const species = def.species.slice(0, BIOME_FRONTIER_SPECIES_LIMIT).map((entry, at) => normalizeSpecies(
        (Array.isArray(saved.species) ? saved.species : []).find(item => item?.id === entry.id) || saved.species?.[at],
        def, at
    )).filter(Boolean);
    const specialists = def.specialists.slice(0, BIOME_FRONTIER_SPECIALIST_LIMIT).map((entry, at) => normalizeSpecialist(
        (Array.isArray(saved.specialists) ? saved.specialists : []).find(item => item?.id === entry.id) || saved.specialists?.[at],
        def, at
    )).filter(Boolean);
    const hazards = def.hazards.slice(0, BIOME_FRONTIER_HAZARD_LIMIT).map((entry, at) => normalizeHazard(
        (Array.isArray(saved.hazards) ? saved.hazards : []).find(item => item?.id === entry.id) || saved.hazards?.[at],
        def, at
    )).filter(Boolean);
    const goods = def.goods.slice(0, BIOME_FRONTIER_GOOD_LIMIT).map((entry, at) => normalizeGood(
        (Array.isArray(saved.goods) ? saved.goods : []).find(item => item?.id === entry.id) || saved.goods?.[at],
        def, at
    )).filter(Boolean);
    const layers = Array.isArray(saved.layers)
        ? saved.layers.filter(layer => def.relics.includes(String(layer))).slice(0, def.relics.length)
        : [];
    const journalIds = new Set(def.journal.map(entry => entry.id));
    const journal = Array.isArray(saved.journal)
        ? [...new Set(saved.journal.filter(id => journalIds.has(String(id))).map(String))].slice(0, def.journal.length)
        : [];
    return {
        id: "frontier-" + def.id,
        family: def.id,
        requirement: def.requirement,
        name: def.site.name,
        variant: def.site.variant,
        lore: text(def.site.lore, 180),
        originBiome: text(saved.originBiome || def.originBiome || def.site.originBiome || "", 140),
        atlasRegionId: saved.atlasRegionId ? text(saved.atlasRegionId, 40) : null,
        atlasRegionName: saved.atlasRegionName ? text(saved.atlasRegionName, 60) : null,
        biomeLabel: saved.biomeLabel ? text(saved.biomeLabel, 60) : "",
        climate: def.climates[0],
        climateAnalogIndex: Math.max(0, Math.min(def.climateAnalog.length - 1, Math.floor(num(saved.climateAnalogIndex, 0)))),
        climatePressure: round(clamp(num(saved.climatePressure, 10), 0, 100), 1),
        condition,
        extent: round(clamp(num(saved.extent, def.startExtent), 0, 100), 1),
        magic: round(clamp(num(saved.magic, def.magicBase * 100), 0, 100), 1),
        corruption: round(clamp(num(saved.corruption, def.curseBase * 100), 0, 100), 1),
        ageYears: Math.max(0, Math.floor(num(saved.ageYears, def.ageYears))),
        aspect: ["natural", "transfigured", "blighted"].includes(saved.aspect)
            ? saved.aspect
            : def.aspect === "transfigured" ? "transfigured" : "natural",
        aspectSince: Math.max(0, Math.floor(num(saved.aspectSince, 0))),
        phase,
        protected: Boolean(saved.protected),
        charter: Boolean(saved.charter),
        surveyed: Boolean(saved.surveyed),
        deepSurveyed: Boolean(saved.deepSurveyed),
        lastActionYear: Math.max(0, Math.floor(num(saved.lastActionYear, 0))),
        lastStabiliseYear: Math.max(0, Math.floor(num(saved.lastStabiliseYear, 0))),
        vanishedYear: Math.max(0, Math.floor(num(saved.vanishedYear, 0))),
        transfiguredYear: Math.max(0, Math.floor(num(saved.transfiguredYear, 0))),
        climateShiftYear: Math.max(0, Math.floor(num(saved.climateShiftYear, 0))),
        surveys: Math.max(0, Math.floor(num(saved.surveys, 0))),
        restored: Math.max(0, Math.floor(num(saved.restored, 0))),
        harvested: Math.max(0, Math.floor(num(saved.harvested, 0))),
        stabilised: Math.max(0, Math.floor(num(saved.stabilised, 0))),
        layers: layers.length ? layers : def.relics.slice(0, 1),
        species,
        specialists,
        hazards,
        goods,
        journal,
        cycles: normalizeCycles(saved.cycles, def, year, seed),
        history: Array.isArray(saved.history)
            ? saved.history.map(normalizeHistory).filter(Boolean).slice(-BIOME_FRONTIER_SITE_HISTORY_LIMIT)
            : [],
    };
}

function normalizeModel(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
    if (Number(snapshot.version) !== BIOME_FRONTIER_VERSION) return null;
    const seed = Math.max(1, Math.floor(num(snapshot.seed, state.worldSeed || 23201)));
    const year = Math.max(1, Math.floor(num(snapshot.lastYear, yearNow())));
    const savedSites = Array.isArray(snapshot.sites) ? snapshot.sites : [];
    const sites = BIOME_FRONTIER_FAMILIES.map((def, index) => normalizeSite(
        savedSites.find(row => row?.family === def.id) || savedSites[index],
        def, index, seed, year
    )).filter(Boolean).slice(0, BIOME_FRONTIER_SITE_LIMIT);
    if (!sites.length) return null;
    return {
        version: BIOME_FRONTIER_VERSION,
        seed,
        lastYear: year,
        lastUpdateYear: Math.max(1, Math.floor(num(snapshot.lastUpdateYear, year))),
        revision: Math.max(0, Math.floor(num(snapshot.revision, 0))),
        climate: {
            drift: Math.round(clamp(num(snapshot.climate?.drift, 0), -20, 20)),
            warming: round(clamp(num(snapshot.climate?.warming, 0), -1, 1), 3),
        },
        sites,
        history: Array.isArray(snapshot.history)
            ? snapshot.history.map(normalizeHistory).filter(Boolean).slice(-BIOME_FRONTIER_HISTORY_LIMIT)
            : [],
        stats: {
            surveyed: Math.max(0, Math.floor(num(snapshot.stats?.surveyed, 0))),
            conserved: Math.max(0, Math.floor(num(snapshot.stats?.conserved, 0))),
            restored: Math.max(0, Math.floor(num(snapshot.stats?.restored, 0))),
            revived: Math.max(0, Math.floor(num(snapshot.stats?.revived, 0))),
            harvested: Math.max(0, Math.floor(num(snapshot.stats?.harvested, 0))),
            stabilised: Math.max(0, Math.floor(num(snapshot.stats?.stabilised, 0))),
            vanished: Math.max(0, Math.floor(num(snapshot.stats?.vanished, 0))),
            transfigured: Math.max(0, Math.floor(num(snapshot.stats?.transfigured, 0))),
            climateShifts: Math.max(0, Math.floor(num(snapshot.stats?.climateShifts, 0))),
            magicEvents: Math.max(0, Math.floor(num(snapshot.stats?.magicEvents, 0))),
            catastrophes: Math.max(0, Math.floor(num(snapshot.stats?.catastrophes, 0))),
            goods: Math.max(0, Math.floor(num(snapshot.stats?.goods, 0))),
            discoveries: Math.max(0, Math.floor(num(snapshot.stats?.discoveries, 0))),
            cycleHarvests: Math.max(0, Math.floor(num(snapshot.stats?.cycleHarvests, 0))),
            cycleRegenerations: Math.max(0, Math.floor(num(snapshot.stats?.cycleRegenerations, 0))),
            cycleCompletions: Math.max(0, Math.floor(num(snapshot.stats?.cycleCompletions, 0))),
        },
    };
}

export function ensureBiomeFrontiers() {
    if (!state.biomeFrontiers || typeof state.biomeFrontiers !== "object" || !Array.isArray(state.biomeFrontiers.sites)) {
        state.biomeFrontiers = baseState(yearNow());
    }
    if (!state.biomeFrontiers.sites.length) state.biomeFrontiers = baseState(yearNow());
    return state.biomeFrontiers;
}

export function resetBiomeFrontiers() {
    state.biomeFrontiers = null;
}

function siteById(model, siteId) {
    return model.sites.find(site => site.id === String(siteId || "")) || null;
}

function definitionFor(site) {
    return BIOME_FRONTIER_BY_ID[site?.family] || null;
}

function linkedBiome(site) {
    if (!site?.atlasRegionId) return null;
    return biomeRegions().find(region => region.id === site.atlasRegionId) || null;
}

function adjustBiome(site, changes = {}) {
    const biome = linkedBiome(site);
    if (!biome) return null;
    if (changes.vegetation) biome.vegetation = clamp(num(biome.vegetation) + changes.vegetation, 0.01, 1);
    if (changes.water) biome.water = clamp(num(biome.water) + changes.water, 0.01, 1);
    if (changes.erosion) biome.erosion = clamp(num(biome.erosion) + changes.erosion, 0, 1);
    if (changes.diseasePressure) biome.diseasePressure = clamp(num(biome.diseasePressure) + changes.diseasePressure, 0, 1);
    return biome;
}

function hasResources(cost) {
    const gold = num(state.resources?.gold, 0);
    const wood = num(state.resources?.wood, 0);
    const stone = num(state.resources?.stone, 0);
    return gold >= num(cost.gold, 0) && wood >= num(cost.wood, 0) && stone >= num(cost.stone, 0);
}

function spend(cost) {
    if (!hasResources(cost)) return false;
    for (const key of ["gold", "wood", "stone"]) {
        if (num(cost[key], 0)) addResource(key, -num(cost[key], 0));
    }
    return true;
}

function pushHistory(model, site, kind, message) {
    const year = yearNow();
    site.history.push({ year, kind, text: text(message, 160) });
    if (site.history.length > BIOME_FRONTIER_SITE_HISTORY_LIMIT) {
        site.history.splice(0, site.history.length - BIOME_FRONTIER_SITE_HISTORY_LIMIT);
    }
    model.history.push({ year, kind, text: text(site.name + ": " + message, 160) });
    if (model.history.length > BIOME_FRONTIER_HISTORY_LIMIT) {
        model.history.splice(0, model.history.length - BIOME_FRONTIER_HISTORY_LIMIT);
    }
    model.revision = Math.max(0, model.revision) + 1;
}

function bump(model, key, amount = 1) {
    model.stats[key] = Math.max(0, num(model.stats[key], 0) + amount);
}

function journalGoalMet(site, entry) {
    const at = Math.max(0, num(entry.at, 1));
    const totals = cycleTotals(site);
    switch (entry.goal) {
        case "surveys": return site.surveys >= at;
        case "deep": return site.deepSurveyed;
        case "conserved": return site.protected;
        case "restored": return site.restored >= at;
        case "harvested": return site.harvested >= at;
        case "stabilised": return site.stabilised >= at;
        case "condition": return site.condition >= at;
        case "hazard": return site.hazards.some(row => row.year > 0);
        case "climate": return site.climateAnalogIndex >= at;
        case "layers": return site.layers.length >= at;
        case "specialists": return site.specialists.filter(row => row.status === "living").length >= at;
        case "cycleHarvests": return totals.harvests >= at;
        case "cycleCompletions": return totals.completions >= at;
        default: return false;
    }
}

function shiftFrontierRelations(amount) {
    const realms = Array.isArray(state.diplomacy?.realms) ? state.diplomacy.realms : [];
    let changed = 0;
    for (const realm of realms.slice(0, 4)) {
        if (!realm || typeof realm !== "object" || realm.treaty === "war") continue;
        realm.relation = round(clamp(num(realm.relation, 0) + amount, 0, 100), 1);
        realm.lastContactYear = yearNow();
        changed += 1;
    }
    return changed;
}

function bolsterFrontierGarrison(amount) {
    let changed = 0;
    for (const entity of state.entities || []) {
        if (changed >= 24) break;
        if (!entity || entity.dead || !entity.military || typeof entity.military !== "object") continue;
        entity.military.morale = round(clamp(num(entity.military.morale, 60) + amount, 0, 100), 1);
        changed += 1;
    }
    return changed;
}

function addCycleGoods(site, amount) {
    let left = Math.max(0, Math.floor(num(amount, 0)));
    let changed = 0;
    for (const good of site.goods || []) {
        if (left <= 0) break;
        const before = good.stock;
        good.stock = clamp(good.stock + Math.min(left, 2), 0, BIOME_FRONTIER_GOODS_CAP);
        left -= good.stock - before;
        if (good.stock > before) changed += 1;
    }
    return changed;
}

function rewardSummary(reward = {}) {
    return [
        reward.gold ? "+" + Math.round(reward.gold) + " gold" : "",
        reward.food ? "+" + Math.round(reward.food) + " food" : "",
        reward.wood ? "+" + Math.round(reward.wood) + " wood" : "",
        reward.stone ? "+" + Math.round(reward.stone) + " stone" : "",
        reward.morale ? "+" + reward.morale + " morale" : "",
        reward.legitimacy ? "+" + reward.legitimacy + " legitimacy" : "",
        reward.relation ? "+" + reward.relation + " relations" : "",
        reward.military ? "+" + reward.military + " soldier morale" : "",
        reward.magic ? (reward.magic > 0 ? "+" : "") + reward.magic + " wild magic" : "",
        reward.corruption ? (reward.corruption > 0 ? "+" : "") + reward.corruption + " corruption" : "",
        reward.goods ? "+" + reward.goods + " goods" : "",
        reward.charter ? "crown charter" : "",
    ].filter(Boolean).join(", ");
}

function applyFrontierReward(model, site, reward = {}) {
    if (reward.gold) addResource("gold", reward.gold);
    for (const key of ["food", "wood", "stone"]) if (reward[key]) addResource(key, reward[key]);
    if (reward.morale && state.morale != null) state.morale = clamp(num(state.morale, 50) + reward.morale, 0, 100);
    const politics = {};
    if (reward.legitimacy) politics.legitimacy = reward.legitimacy;
    if (reward.faction && reward.factionAmount) politics[reward.faction] = reward.factionAmount;
    if (Object.keys(politics).length) applyPoliticalEffects(politics);
    if (reward.relation) shiftFrontierRelations(reward.relation);
    if (reward.military) bolsterFrontierGarrison(reward.military);
    if (reward.magic) site.magic = round(clamp(num(site.magic, 0) + reward.magic, 0, 100), 1);
    if (reward.corruption) site.corruption = round(clamp(num(site.corruption, 0) + reward.corruption, 0, 100), 1);
    if (reward.goods) addCycleGoods(site, reward.goods);
    if (reward.charter) site.charter = true;
}

// Field notes are the long-term research ladder. Four notes form each tier;
// the next tier opens only after the previous tier is complete, and the tier
// is fixed when this pass begins so one action cannot cascade through it.
function journalTierComplete(site, def, tier) {
    const rows = def.journal.filter(entry => entry.tier === tier);
    return rows.length > 0 && rows.every(entry => site.journal.includes(entry.id));
}

function accessibleJournalTier(site, def) {
    let tier = 1;
    for (let current = 1; current < BIOME_FRONTIER_JOURNAL_TIER_LIMIT; current += 1) {
        if (!journalTierComplete(site, def, current)) break;
        tier = current + 1;
    }
    return tier;
}

// Field notes unlock once, pay once and never consume the shared RNG. Tier 3
// may grant a permanent crown charter, which is the site's visible unlock.
function settleJournal(model, site) {
    const def = definitionFor(site);
    // The journal records work the crown has actually seen. An unsurveyed
    // frontier still lives its own ecology, but it cannot pay research grants
    // before the first survey reaches it.
    if (!site.surveyed || !def?.journal?.length || !Array.isArray(site.journal)) return 0;
    const maxTier = accessibleJournalTier(site, def);
    let unlocked = 0;
    for (const entry of def.journal) {
        if (entry.tier > maxTier || site.journal.includes(entry.id) || !journalGoalMet(site, entry)) continue;
        site.journal.push(entry.id);
        if (site.journal.length > def.journal.length) site.journal.splice(0, site.journal.length - def.journal.length);
        unlocked += 1;
        bump(model, "discoveries", 1);
        applyFrontierReward(model, site, entry.reward || {});
        pushHistory(model, site, "journal", "T" + entry.tier + " " + entry.label + " recorded: " + entry.detail);
        logEvent("FIELD NOTE T" + entry.tier + " · " + entry.label.toUpperCase() + " · " + site.name.toUpperCase(), "#b7c99b");
    }
    return unlocked;
}

function applyCycleReward(model, site, cycle, phaseLabel) {
    const reward = cycle.reward || {};
    applyFrontierReward(model, site, reward);
    const summary = rewardSummary(reward);
    if (summary) {
        pushHistory(model, site, "cycle", cycle.label + " · " + phaseLabel + ": " + summary);
        logEvent("FRONTIER CYCLE · " + cycle.label.toUpperCase() + " · " + phaseLabel.toUpperCase() + " · " + site.name.toUpperCase(), "#c7b27a");
    }
}

function settleCycles(model, site, year) {
    const def = definitionFor(site);
    if (!def?.cycles?.length || !site.cycles) return 0;
    // Cycles keep turning in the wild, but harvest and regeneration windows
    // only pay the crown once a survey has made the site legible. The period
    // marker advances anyway, so a late survey cannot claim years of back pay.
    const observed = Boolean(site.surveyed);
    let paid = 0;
    for (const cycle of def.cycles.slice(0, BIOME_FRONTIER_CYCLE_LIMIT)) {
        const row = site.cycles[cycle.id];
        if (!row) continue;
        const phase = cyclePhaseIndex(cycle, year, row.offset);
        const periodNumber = cyclePeriodNumber(cycle, year, row.offset);
        const phaseLabel = cycle.phaseLabels[phase] || "phase " + (phase + 1);
        if (phase === cycle.harvestPhase && row.lastHarvestPeriod !== periodNumber) {
            row.lastHarvestPeriod = periodNumber;
            if (observed) {
                row.harvests += 1;
                bump(model, "cycleHarvests", 1);
                applyCycleReward(model, site, cycle, phaseLabel);
                paid += 1;
            }
        }
        if (phase === cycle.regenerationPhase && row.lastRegenerationPeriod !== periodNumber) {
            row.lastRegenerationPeriod = periodNumber;
            if (observed) {
                row.regenerations += 1;
                site.condition = round(clamp(num(site.condition, 0) + 2 + (site.charter ? 0.5 : 0), 0, 100), 1);
                site.corruption = round(clamp(num(site.corruption, 0) - 1, 0, 100), 1);
                bump(model, "cycleRegenerations", 1);
                pushHistory(model, site, "cycle", cycle.label + " · " + phaseLabel + ": regeneration restored the site.");
            }
        }
        if (phase === 0 && row.phase !== 0 && row.lastCompletionPeriod !== periodNumber) {
            row.lastCompletionPeriod = periodNumber;
            if (observed) {
                row.completions += 1;
                site.condition = round(clamp(num(site.condition, 0) + 1, 0, 100), 1);
                bump(model, "cycleCompletions", 1);
                pushHistory(model, site, "cycle", cycle.label + " completed a full " + cycle.period + "-year rotation.");
                logEvent("FRONTIER ROTATION COMPLETE · " + cycle.label.toUpperCase() + " · " + site.name.toUpperCase(), "#a9c58d");
            }
        }
        row.phase = phase;
        row.lastYear = year;
    }
    return paid;
}

function costLabel(cost) {
    return [cost.gold ? cost.gold + " gold" : "", cost.wood ? cost.wood + " wood" : "", cost.stone ? cost.stone + " stone" : ""]
        .filter(Boolean).join(", ");
}

function actionEntry(id, site, model, enabled, reason = "") {
    const definition = BIOME_FRONTIER_ACTIONS[id];
    return {
        id,
        label: definition.label.toUpperCase(),
        cost: { gold: definition.gold || 0, wood: definition.wood || 0, stone: definition.stone || 0 },
        detail: definition.detail,
        enabled: Boolean(enabled),
        reason: enabled ? "" : reason,
    };
}

export function biomeFrontierActionAvailability(site, model = ensureBiomeFrontiers()) {
    const acted = site.lastActionYear === yearNow();
    const gold = num(state.resources?.gold, 0);
    const wood = num(state.resources?.wood, 0);
    const stone = num(state.resources?.stone, 0);
    const locked = acted ? "One frontier action per site each year; the next annual pass reopens it." : "";
    const actions = [];
    if (!site.surveyed) {
        actions.push(actionEntry("survey", site, model, !acted && gold >= 8,
            locked || "Needs 8 gold."));
    } else if (!site.deepSurveyed) {
        actions.push(actionEntry("deepSurvey", site, model, !acted && gold >= 12,
            locked || "Needs 12 gold."));
    }
    const canRestore = site.phase === "vanished" ? (gold >= 26 && wood >= 10) : site.condition < 96 && gold >= 12 && wood >= 8;
    const restoreId = site.phase === "vanished" ? "revive" : "restore";
    if (site.phase === "vanished" || site.condition < 96) {
        actions.push(actionEntry(restoreId, site, model, !acted && canRestore,
            locked || (site.phase === "vanished" ? "Needs 26 gold and 10 wood." : "Needs 12 gold and 8 wood.")));
    }
    if (!site.protected && site.phase !== "vanished") {
        actions.push(actionEntry("conserve", site, model, !acted && gold >= 14 && wood >= 6,
            locked || "Needs 14 gold and 6 wood."));
    }
    if (site.surveyed && site.phase !== "vanished" && site.condition >= 25 && site.goods.some(good => good.stock < BIOME_FRONTIER_GOODS_CAP)) {
        actions.push(actionEntry("harvest", site, model, !acted, locked));
    }
    if (site.aspect !== "natural" || site.magic >= 30 || site.corruption >= 30) {
        actions.push(actionEntry("stabilise", site, model, !acted && gold >= 16 && stone >= 4,
            locked || "Needs 16 gold and 4 stone."));
    }
    for (const entry of actions) {
        if (entry.enabled) continue;
        if (!entry.reason) entry.reason = entry.id === "survey" || entry.id === "deepSurvey" ? "Not enough gold." : "Not available.";
    }
    return actions;
}

function siteSummary(site, model) {
    const def = definitionFor(site);
    const phase = BIOME_FRONTIER_PHASES.find(entry => entry.id === site.phase) || BIOME_FRONTIER_PHASES[0];
    const aspect = BIOME_FRONTIER_ASPECTS[site.aspect] || BIOME_FRONTIER_ASPECTS.natural;
    const goods = site.goods.map(good => ({ ...good }));
    const year = Math.max(1, Math.floor(num(model.lastUpdateYear, yearNow())));
    const totals = cycleTotals(site);
    const journalTiers = Array.from({ length: BIOME_FRONTIER_JOURNAL_TIER_LIMIT }, (_, index) => {
        const tier = index + 1;
        const rows = (def?.journal || []).filter(entry => entry.tier === tier);
        const unlocked = rows.filter(entry => site.journal.includes(entry.id)).length;
        return { tier, total: rows.length, unlocked, complete: rows.length > 0 && unlocked === rows.length };
    });
    const accessibleTier = def ? accessibleJournalTier(site, def) : 1;
    const cycles = (def?.cycles || []).slice(0, BIOME_FRONTIER_CYCLE_LIMIT).map(cycle => {
        const row = site.cycles?.[cycle.id] || { phase: 0, offset: 0, harvests: 0, regenerations: 0, completions: 0 };
        const phaseIndex = cyclePhaseIndex(cycle, year, row.offset);
        return {
            id: cycle.id,
            label: cycle.label,
            detail: cycle.detail,
            period: cycle.period,
            phase: phaseIndex,
            phaseLabel: cycle.phaseLabels[phaseIndex] || "phase " + (phaseIndex + 1),
            phaseLabels: [...cycle.phaseLabels],
            harvestPhase: cycle.harvestPhase,
            regenerationPhase: cycle.regenerationPhase,
            harvestOpen: phaseIndex === cycle.harvestPhase,
            regenerationOpen: phaseIndex === cycle.regenerationPhase,
            yearsToHarvest: phaseIndex === cycle.harvestPhase ? 0 : cycleYearsToPhase(cycle, year, row.offset, cycle.harvestPhase),
            yearsToRegeneration: phaseIndex === cycle.regenerationPhase ? 0 : cycleYearsToPhase(cycle, year, row.offset, cycle.regenerationPhase),
            harvests: Math.max(0, Math.floor(num(row.harvests, 0))),
            regenerations: Math.max(0, Math.floor(num(row.regenerations, 0))),
            completions: Math.max(0, Math.floor(num(row.completions, 0))),
            reward: { ...cycle.reward },
            rewardSummary: rewardSummary(cycle.reward),
        };
    });
    return {
        ...site,
        title: def?.title || title(site.family),
        titleDe: def?.titleDe || "",
        label: def?.label || title(site.family),
        labelDe: def?.labelDe || "",
        kicker: def?.kicker || "",
        glyph: def?.glyph || "◆",
        band: def?.band || "surface",
        requirementPoint: def?.requirement || site.requirement,
        profile: def?.profile || "",
        formation: def?.formation || "",
        soil: def?.soil || "",
        water: def?.water || "",
        seasonality: def?.seasonality || "",
        palette: def?.palette ? [...def.palette] : [],
        magicShift: def?.magicShift ? { ...def.magicShift } : null,
        catastrophes: def?.catastrophes ? def.catastrophes.map(entry => ({ ...entry })) : [],
        climateAnalog: def?.climateAnalog?.[site.climateAnalogIndex] || def?.climateAnalog?.[0] || "",
        climateAnalogs: def?.climateAnalog ? [...def.climateAnalog] : [],
        phaseLabel: phase.label,
        phaseDetail: phase.detail,
        aspectLabel: aspect.label,
        aspectDetail: aspect.detail,
        actedThisYear: site.lastActionYear === yearNow(),
        actions: biomeFrontierActionAvailability(site, model),
        species: site.species.map(row => ({ ...row })),
        specialists: site.specialists.map(row => ({ ...row })),
        hazards: site.hazards.map(row => ({ ...row })),
        goods,
        history: site.history.map(row => ({ ...row })),
        layers: [...site.layers],
        journal: (def?.journal || []).map(entry => ({
            id: entry.id,
            label: entry.label,
            detail: entry.detail,
            goal: entry.goal,
            goalLabel: entry.goalLabel,
            tier: entry.tier,
            tierAccessible: entry.tier <= accessibleTier,
            reward: { ...entry.reward },
            rewardSummary: rewardSummary(entry.reward),
            unlocked: site.journal.includes(entry.id),
        })),
        journalTiers,
        journalTier: accessibleTier,
        journalNextTier: accessibleTier < BIOME_FRONTIER_JOURNAL_TIER_LIMIT ? accessibleTier + 1 : 0,
        journalUnlocked: site.journal.length,
        journalTotal: def?.journal?.length || 0,
        cycles,
        cycleHarvests: totals.harvests,
        cycleRegenerations: totals.regenerations,
        cycleCompletions: totals.completions,
        charter: Boolean(site.charter),
        livingSpecies: site.species.filter(row => row.status === "living").length,
        livingSpecialists: site.specialists.filter(row => row.status === "living").length,
        goodsStock: goods.reduce((sum, row) => sum + row.stock, 0),
        rareGood: goods[0] ? { ...goods[0] } : null,
    };
}

export function biomeFrontierSite(siteId) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    return site ? siteSummary(site, model) : null;
}

export function biomeFrontierSummary() {
    const model = ensureBiomeFrontiers();
    const sites = model.sites.map(site => siteSummary(site, model));
    const goods = sites.flatMap(site => site.goods.map(good => ({ ...good, siteId: site.id, siteName: site.name })));
    return {
        version: model.version,
        seed: model.seed,
        year: model.lastUpdateYear,
        climate: { ...model.climate },
        sites,
        goods,
        stats: {
            ...model.stats,
            sites: sites.length,
            surveyed: sites.filter(site => site.surveyed).length,
            deepSurveyed: sites.filter(site => site.deepSurveyed).length,
            conserved: sites.filter(site => site.protected).length,
            vanished: sites.filter(site => site.phase === "vanished").length,
            transfigured: sites.filter(site => site.aspect === "transfigured").length,
            blighted: sites.filter(site => site.aspect === "blighted").length,
            goods: goods.reduce((sum, good) => sum + good.stock, 0),
            specialists: sites.reduce((sum, site) => sum + site.specialists.length, 0),
            livingSpecialists: sites.reduce((sum, site) => sum + site.livingSpecialists, 0),
            discoveries: sites.reduce((sum, site) => sum + site.journalUnlocked, 0),
            journal: sites.reduce((sum, site) => sum + site.journalTotal, 0),
            charters: sites.filter(site => site.charter).length,
            cycleHarvests: sites.reduce((sum, site) => sum + site.cycleHarvests, 0),
            cycleRegenerations: sites.reduce((sum, site) => sum + site.cycleRegenerations, 0),
            cycleCompletions: sites.reduce((sum, site) => sum + site.cycleCompletions, 0),
            averageCondition: round(sites.reduce((sum, site) => sum + site.condition, 0) / Math.max(1, sites.length), 1),
        },
        history: model.history.slice().reverse().map(row => ({ ...row })),
        requirements: BIOME_FRONTIER_REQUIREMENTS,
        groups: BIOME_FRONTIER_GROUPS,
        guardrails: BIOME_FRONTIER_GUARDRAILS,
        referenceSeeds: Object.entries(BIOME_FRONTIER_REFERENCE_SEEDS).map(([family, seed]) => ({ family, seed })),
        regions: sites.map(site => ({
            siteId: site.id, family: site.family, name: site.name,
            atlasRegionId: site.atlasRegionId, atlasRegionName: site.atlasRegionName,
        })),
    };
}

function clearActionLock(site) {
    site.lastActionYear = yearNow();
}

export function surveyBiomeFrontier(siteId, deep = false) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    const def = definitionFor(site);
    if (!site || !def) return { ok: false, reason: "unknown-frontier-site" };
    if (site.phase === "vanished") return { ok: false, reason: "site-vanished" };
    if (site.lastActionYear === yearNow()) return { ok: false, reason: "one-frontier-action-per-year" };
    const wantsDeep = deep || site.surveyed;
    if (wantsDeep && site.deepSurveyed) return { ok: false, reason: "already-fully-surveyed" };
    const cost = wantsDeep ? BIOME_FRONTIER_ACTIONS.deepSurvey : BIOME_FRONTIER_ACTIONS.survey;
    if (!spend({ gold: cost.gold })) return { ok: false, reason: "not-enough-gold" };
    site.surveyed = true;
    site.surveys += 1;
    if (wantsDeep) {
        site.deepSurveyed = true;
        site.specialists.forEach(row => { row.status = "living"; });
        const nextLayer = def.relics.find(layer => !site.layers.includes(layer));
        if (nextLayer) site.layers.push(nextLayer);
    }
    clearActionLock(site);
    bump(model, "surveyed", 1);
    settleJournal(model, site);
    const message = wantsDeep
        ? def.site.name + " deep survey: " + site.specialists.length + " specialist species and " + site.layers.length + " relict layers recorded."
        : def.site.name + " surveyed: " + site.species.length + " species and " + site.hazards.length + " disturbance regimes charted.";
    pushHistory(model, site, "survey", message);
    logEvent("FRONTIER SURVEY · " + def.site.name.toUpperCase() + " · " + (wantsDeep ? "DEEP RECORD" : "CHARTED"));
    return { ok: true, site: site.id, deep: wantsDeep, message: wantsDeep ? "DEEP SURVEY COMPLETE · " + def.site.name.toUpperCase() : "SURVEY COMPLETE · " + def.site.name.toUpperCase() };
}

export function conserveBiomeFrontier(siteId) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    if (!site) return { ok: false, reason: "unknown-frontier-site" };
    if (site.phase === "vanished") return { ok: false, reason: "site-vanished" };
    if (site.protected) return { ok: false, reason: "already-conserved" };
    if (site.lastActionYear === yearNow()) return { ok: false, reason: "one-frontier-action-per-year" };
    const cost = BIOME_FRONTIER_ACTIONS.conserve;
    if (!spend({ gold: cost.gold, wood: cost.wood })) return { ok: false, reason: "not-enough-resources" };
    site.protected = true;
    site.condition = round(clamp(site.condition + 4, 0, 100), 1);
    site.extent = round(clamp(site.extent + 1, 0, 100), 1);
    clearActionLock(site);
    bump(model, "conserved", 1);
    adjustBiome(site, { vegetation: 0.012, erosion: -0.006 });
    settleJournal(model, site);
    const message = "A warden's agreement protects " + site.name + "; annual decline is halved and the rare community has priority.";
    pushHistory(model, site, "conserve", message);
    logEvent("FRONTIER CONSERVED · " + site.name.toUpperCase());
    return { ok: true, site: site.id, message: "CONSERVED · " + site.name.toUpperCase() };
}

export function restoreBiomeFrontier(siteId) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    if (!site) return { ok: false, reason: "unknown-frontier-site" };
    if (site.lastActionYear === yearNow()) return { ok: false, reason: "one-frontier-action-per-year" };
    const def = definitionFor(site);
    if (site.phase === "vanished") {
        const cost = BIOME_FRONTIER_ACTIONS.revive;
        if (!spend({ gold: cost.gold, wood: cost.wood })) return { ok: false, reason: "not-enough-resources" };
        site.condition = BIOME_FRONTIER_REVIVE_CONDITION;
        site.extent = round(clamp(Math.max(8, site.extent), 8, 100), 1);
        site.phase = biomeFrontierPhaseFor(site.condition).id;
        site.species.forEach((row, index) => {
            row.status = index < 3 ? "living" : "vanished";
            row.cover = index < 3 ? Math.max(1, round(row.cover * 0.2, 1)) : 0;
        });
        site.restored += 1;
        clearActionLock(site);
        bump(model, "revived", 1);
        bump(model, "restored", 1);
        adjustBiome(site, { vegetation: 0.03, erosion: -0.012 });
        settleJournal(model, site);
        const message = site.name + " was revived from stored seed and local material; three founder cohorts now hold the site.";
        pushHistory(model, site, "revive", message);
        logEvent("FRONTIER REVIVED · " + site.name.toUpperCase());
        return { ok: true, site: site.id, revived: true, message: "REVIVED · " + site.name.toUpperCase() };
    }
    if (site.condition >= 96) return { ok: false, reason: "site-already-whole" };
    const cost = BIOME_FRONTIER_ACTIONS.restore;
    if (!spend({ gold: cost.gold, wood: cost.wood })) return { ok: false, reason: "not-enough-resources" };
    site.condition = round(clamp(site.condition + 9, 0, 100), 1);
    site.extent = round(clamp(site.extent + 3, 0, 100), 1);
    site.phase = biomeFrontierPhaseFor(site.condition).id;
    site.restored += 1;
    clearActionLock(site);
    bump(model, "restored", 1);
    adjustBiome(site, { vegetation: 0.018, water: 0.004, erosion: -0.006 });
    if (state.morale != null) state.morale = clamp(num(state.morale, 50) + 1, 0, 100);
    settleJournal(model, site);
    const message = "Restoration work in " + site.name + " raised condition to " + Math.round(site.condition) + " and extent to " + Math.round(site.extent) + ".";
    pushHistory(model, site, "restore", message);
    logEvent("FRONTIER RESTORED · " + site.name.toUpperCase());
    return { ok: true, site: site.id, condition: site.condition, message: "RESTORED · " + site.name.toUpperCase() };
}

export function harvestBiomeFrontier(siteId) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    if (!site) return { ok: false, reason: "unknown-frontier-site" };
    if (!site.surveyed) return { ok: false, reason: "survey-required" };
    if (site.phase === "vanished") return { ok: false, reason: "site-vanished" };
    if (site.condition < 25) return { ok: false, reason: "site-too-fragile" };
    if (site.lastActionYear === yearNow()) return { ok: false, reason: "one-frontier-action-per-year" };
    const good = site.goods[0];
    if (!good) return { ok: false, reason: "no-frontier-good" };
    const amount = Math.max(1, Math.round(good.annual * 2 + site.condition / 40));
    good.stock = clamp(good.stock + amount, 0, BIOME_FRONTIER_GOODS_CAP);
    site.condition = round(clamp(site.condition - (site.protected ? 1.5 : 3), 0, 100), 1);
    site.extent = round(clamp(site.extent - 0.4, 0, 100), 1);
    site.phase = biomeFrontierPhaseFor(site.condition).id;
    site.harvested += 1;
    clearActionLock(site);
    bump(model, "harvested", 1);
    bump(model, "goods", amount);
    adjustBiome(site, { vegetation: -0.005 });
    settleJournal(model, site);
    const message = amount + " " + good.label + " taken from " + site.name + "; condition fell to " + Math.round(site.condition) + ".";
    pushHistory(model, site, "harvest", message);
    logEvent("FRONTIER HARVEST · " + amount + " " + good.label.toUpperCase() + " · " + site.name.toUpperCase());
    return { ok: true, site: site.id, good: good.id, label: good.label, amount, stock: good.stock, condition: site.condition, message: "+" + amount + " " + good.label.toUpperCase() };
}

export function stabiliseBiomeFrontier(siteId) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    if (!site) return { ok: false, reason: "unknown-frontier-site" };
    if (site.phase === "vanished") return { ok: false, reason: "site-vanished" };
    if (site.lastActionYear === yearNow()) return { ok: false, reason: "one-frontier-action-per-year" };
    if (site.aspect === "natural" && site.magic < 30 && site.corruption < 30) return { ok: false, reason: "nothing-to-stabilise" };
    const cost = BIOME_FRONTIER_ACTIONS.stabilise;
    if (!spend({ gold: cost.gold, stone: cost.stone })) return { ok: false, reason: "not-enough-resources" };
    site.magic = round(clamp(site.magic - 24, 0, 100), 1);
    site.corruption = round(clamp(site.corruption - 24, 0, 100), 1);
    site.condition = round(clamp(site.condition + 3, 0, 100), 1);
    if (site.magic < 55 && site.corruption < 45) {
        site.aspect = "natural";
        site.aspectSince = 0;
    }
    site.stabilised += 1;
    site.lastStabiliseYear = yearNow();
    clearActionLock(site);
    bump(model, "stabilised", 1);
    settleJournal(model, site);
    const message = "Stabilisation reduced wild magic to " + Math.round(site.magic) + " and corruption to " + Math.round(site.corruption) + " in " + site.name + ".";
    pushHistory(model, site, "stabilise", message);
    logEvent("FRONTIER STABILISED · " + site.name.toUpperCase());
    return { ok: true, site: site.id, magic: site.magic, corruption: site.corruption, message: "STABILISED · " + site.name.toUpperCase() };
}

export function sellBiomeFrontierGood(siteId, goodId = null) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    if (!site) return { ok: false, reason: "unknown-frontier-site" };
    const good = goodId ? site.goods.find(row => row.id === String(goodId)) : site.goods.find(row => row.stock > 0);
    if (!good || good.stock <= 0) return { ok: false, reason: "no-good-stored" };
    const value = good.value * good.stock;
    addResource("gold", value);
    const amount = good.stock;
    good.stock = 0;
    bump(model, "goods", -amount);
    pushHistory(model, site, "trade", amount + " " + good.label + " sold for " + value + " gold.");
    logEvent("FRONTIER GOODS SOLD · " + amount + " " + good.label.toUpperCase() + " FOR " + value + " GOLD", "#d8bd82");
    return { ok: true, site: site.id, good: good.id, amount, gold: value, message: "SOLD " + amount + " " + good.label.toUpperCase() + " · +" + value + "G" };
}

export function runBiomeFrontierAction(siteId, actionId) {
    const action = String(actionId || "");
    if (action === "survey") return surveyBiomeFrontier(siteId, false);
    if (action === "deepSurvey") return surveyBiomeFrontier(siteId, true);
    if (action === "conserve") return conserveBiomeFrontier(siteId);
    if (action === "restore") return restoreBiomeFrontier(siteId);
    if (action === "revive") return restoreBiomeFrontier(siteId);
    if (action === "harvest") return harvestBiomeFrontier(siteId);
    if (action === "stabilise") return stabiliseBiomeFrontier(siteId);
    return { ok: false, reason: "unknown-frontier-action" };
}

/** A named catastrophe with real, bounded consequences. Public for the soak. */
export function applyBiomeFrontierCatastrophe(siteId, kind = null, options = {}) {
    const model = ensureBiomeFrontiers();
    const site = siteById(model, siteId);
    if (!site) return { ok: false, reason: "unknown-frontier-site" };
    if (site.phase === "vanished") return { ok: false, reason: "already-vanished" };
    const def = definitionFor(site);
    const event = def.catastrophes.find(entry => entry.id === kind) || def.catastrophes[0];
    const year = Math.max(1, Math.floor(num(options.year, yearNow())));
    const severity = round(clamp(num(options.severity, 0.55 + unit(model.seed, hashString(site.id), year, 0x534556) * 0.4), 0.1, 1), 2);
    const before = site.condition;
    site.condition = round(clamp(site.condition - (6 + severity * 12), 0, 100), 1);
    site.extent = round(clamp(site.extent - (2 + severity * 3), 0, 100), 1);
    const hazard = site.hazards[0];
    if (hazard) {
        hazard.memory += 1;
        hazard.severity = severity;
        hazard.year = year;
    }
    const vanished = site.condition < BIOME_FRONTIER_VANISH_CONDITION;
    if (vanished) {
        site.condition = 0;
        site.phase = "vanished";
        site.vanishedYear = year;
        site.species.forEach(row => { row.cover = 0; row.status = "vanished"; });
        site.specialists.forEach(row => { row.status = "vanished"; });
        site.goods.forEach(row => { row.stock = 0; });
        site.magic = round(clamp(site.magic - 10, 0, 100), 1);
        bump(model, "vanished", 1);
        if (state.morale != null) state.morale = clamp(num(state.morale, 50) - 1, 0, 100);
        adjustBiome(site, { vegetation: -0.03, erosion: 0.015 });
    } else {
        adjustBiome(site, { vegetation: -0.012 * severity, erosion: 0.008 * severity });
    }
    bump(model, "catastrophes", 1);
    settleJournal(model, site);
    const message = (event?.label || "Ecological catastrophe") + " struck " + site.name + " at severity " + Math.round(severity * 100)
        + "% · condition " + Math.round(before) + " → " + Math.round(site.condition) + (vanished ? " · the site is gone" : "");
    pushHistory(model, site, "catastrophe", message);
    logEvent("FRONTIER CATASTROPHE · " + site.name.toUpperCase() + " · " + (event?.label || "COLLAPSE").toUpperCase(), "#d99a6c");
    return {
        ok: true, site: site.id, kind: event?.id || "catastrophe", year, severity,
        before, condition: site.condition, vanished, text: message,
    };
}

function transfigureSite(model, site, year) {
    const def = definitionFor(site);
    if (!def?.magicShift) return false;
    site.aspect = "transfigured";
    site.aspectSince = year;
    site.transfiguredYear = year;
    site.magic = round(clamp(site.magic + 8, 0, 100), 1);
    bump(model, "transfigured", 1);
    pushHistory(model, site, "magic", def.magicShift.label + ": " + def.magicShift.detail);
    logEvent("THE FRONTIER TURNS · " + site.name.toUpperCase() + " · " + def.magicShift.label.toUpperCase(), "#c9a6e6");
    return true;
}

function advanceBiomeFrontierYear(model, site, year) {
    const def = definitionFor(site);
    if (!def) return null;
    const warming = num(model.climate.warming, 0);
    if (site.phase === "vanished") {
        site.climatePressure = round(clamp(site.climatePressure + 0.2, 0, 100), 1);
        return { vanished: true, changed: false };
    }
    const beforePhase = site.phase;
    const beforeAspect = site.aspect;
    const jitter = (unit(model.seed, hashString(site.id), year, 0x4a4954) - 0.5) * 2.4;
    // The frontier catalogue reads the shared drift but deliberately damps the
    // long linear trend: a 300-year soak must show a changed world, not erase
    // every site before the player can act. The clamp is the ecological limit
    // of what these formations can express, not a second climate model.
    const effectiveWarming = clamp(warming, -0.4, 0.4);
    const stress = effectiveWarming * def.warmingStress * 2.6;
    const gain = effectiveWarming * def.warmingGain * 2.2;
    const protection = site.protected ? 2.2 : 0;
    const recovery = def.band === "polar" || def.band === "catastrophe"
        ? 0
        : clamp((55 - site.condition) * 0.05, 0, 2.2);
    const corruptionDrag = site.corruption / 45;
    const aspectDrag = site.aspect === "transfigured" ? 0.6 : site.aspect === "blighted" ? 1.1 : 0;
    site.condition = round(clamp(site.condition + gain - stress + protection + recovery - corruptionDrag - aspectDrag + jitter + (site.charter ? 0.55 : 0), 0, 100), 1);
    site.extent = round(clamp(site.extent + (site.condition - 55) * 0.035 + (site.protected ? 0.2 : 0), 0, 100), 1);
    site.ageYears = Math.max(0, site.ageYears + 1);
    site.climatePressure = round(clamp(site.climatePressure + Math.max(0, effectiveWarming) * 5 + (def.warmingStress - 0.5) * 0.8, 0, 100), 1);
    if (site.climatePressure >= 52 && site.climateAnalogIndex < def.climateAnalog.length - 1
        && (!site.climateShiftYear || year - site.climateShiftYear >= 6)) {
        site.climateAnalogIndex += 1;
        site.climateShiftYear = year;
        bump(model, "climateShifts", 1);
        pushHistory(model, site, "climate", site.name + " crossed toward " + def.climateAnalog[site.climateAnalogIndex] + ".");
    }
    // Magic: an annual event can transfigure a natural site, and a recent
    // stabilisation keeps the residue low for a few years.
    if (def.magicBase > 0.15 || site.aspect !== "natural") {
        const stabilisedRecently = site.lastStabiliseYear > 0 && year - site.lastStabiliseYear <= 3;
        const magicRoll = unit(model.seed, hashString(site.id), year, 0x4d4147);
        if (!stabilisedRecently && magicRoll < 0.025 + def.magicBase * 0.03) {
            site.magic = round(clamp(site.magic + 14 + unit(model.seed, hashString(site.id), year, 0x4d4148) * 12, 0, 100), 1);
            bump(model, "magicEvents", 1);
            pushHistory(model, site, "magic", "A surge raised wild magic in " + site.name + " to " + Math.round(site.magic) + ".");
            if (site.magic >= 62 && site.aspect === "natural" && def.magicShift) transfigureSite(model, site, year);
        } else {
            site.magic = round(clamp(site.magic - (stabilisedRecently ? 3.5 : 1.2), 0, 100), 1);
        }
    }
    // Curse and corruption: a conserved site holds the boundary, an open site
    // lets it write further into the soil and the rare community.
    if (def.curseBase > 0 || site.aspect === "blighted") {
        site.corruption = round(clamp(site.corruption + (site.protected ? -3.2 : 1.8) + (site.aspect === "blighted" ? 1.2 : 0), 0, 100), 1);
        if (site.corruption >= 60 && site.aspect !== "blighted") {
            site.aspect = "blighted";
            site.aspectSince = year;
            pushHistory(model, site, "corruption", "The blight took the boundary of " + site.name + ".");
        }
        if (site.corruption > 45) site.condition = round(clamp(site.condition - 1.5, 0, 100), 1);
    } else if (site.corruption > 0) {
        site.corruption = round(clamp(site.corruption - 1, 0, 100), 1);
    }
    // One named catastrophe at most per site-year, deterministic from the seed.
    const risk = clamp(def.catastropheRisk * 0.35 + Math.max(0, warming) * 0.005
        + (site.condition < 35 ? 0.01 : 0) - (site.protected ? 0.02 : 0), 0.003, 0.06);
    let catastrophe = null;
    if (unit(model.seed, hashString(site.id), year, 0x434154) < risk) {
        catastrophe = applyBiomeFrontierCatastrophe(site.id, null, { year });
    }
    // Rare community: specialists vanish first when the site thins and return
    // only when the habitat is genuinely restored.
    if (!catastrophe?.vanished) {
        if (site.condition < 30) {
            const lost = site.specialists.find(row => row.status === "living");
            if (lost) {
                lost.status = "vanished";
                pushHistory(model, site, "specialist", lost.label + " vanished from " + site.name + ".");
            }
        } else if (site.condition >= 65) {
            const back = site.specialists.find(row => row.status === "vanished");
            if (back) {
                back.status = "living";
                pushHistory(model, site, "specialist", back.label + " returned to " + site.name + ".");
            }
        }
    }
    // Annual good: the site produces only while it is alive, and a conserved
    // site gives up a little less to the harvest economy.
    if (site.condition >= 30 && site.phase !== "vanished") {
        for (const good of site.goods) {
            const amount = Math.max(1, Math.round(good.annual * (0.4 + site.condition / 100) * (site.protected ? 0.8 : 1) * (site.charter ? 1.08 : 1)));
            good.stock = clamp(good.stock + amount, 0, BIOME_FRONTIER_GOODS_CAP);
        }
    }
    if (def.band === "historic" && year % 12 === 0) {
        const nextLayer = def.relics.find(layer => !site.layers.includes(layer));
        if (nextLayer) {
            site.layers.push(nextLayer);
            pushHistory(model, site, "layer", "A new relict layer was read in " + site.name + ": " + nextLayer + ".");
        }
    }
    site.history = site.history.slice(-BIOME_FRONTIER_SITE_HISTORY_LIMIT);
    site.phase = biomeFrontierPhaseFor(site.condition).id;
    if (site.phase === "vanished" && !catastrophe?.vanished) {
        site.vanishedYear = year;
        site.species.forEach(row => { row.cover = 0; row.status = "vanished"; });
        site.goods.forEach(row => { row.stock = 0; });
        bump(model, "vanished", 1);
        pushHistory(model, site, "vanish", site.name + " crossed the threshold and vanished from the atlas.");
    } else if (site.phase !== beforePhase && !catastrophe?.vanished) {
        pushHistory(model, site, "phase", site.name + " moved from " + beforePhase + " to " + site.phase + ".");
    }
    settleCycles(model, site, year);
    settleJournal(model, site);
    return {
        vanished: site.phase === "vanished",
        changed: site.phase !== beforePhase || site.aspect !== beforeAspect || Boolean(catastrophe),
        catastrophe: Boolean(catastrophe),
        condition: site.condition,
    };
}

export function updateBiomeFrontiers() {
    const model = ensureBiomeFrontiers();
    const year = yearNow();
    if (model.lastUpdateYear >= year) return { updated: false, reason: "already-settled", year };
    model.lastUpdateYear = year;
    model.lastYear = year;
    const drift = getClimateDrift();
    model.climate.drift = drift;
    model.climate.warming = round(clamp(drift / 20 + Math.max(0, year - 1) * 0.002, -1, 1), 3);
    let vanished = 0;
    let catastrophes = 0;
    let changed = 0;
    for (const site of model.sites) {
        const result = advanceBiomeFrontierYear(model, site, year);
        if (result?.vanished) vanished += 1;
        if (result?.catastrophe) catastrophes += 1;
        if (result?.changed) changed += 1;
    }
    model.stats.surveyed = model.sites.filter(site => site.surveyed).length;
    model.stats.conserved = model.sites.filter(site => site.protected).length;
    model.stats.goods = model.sites.reduce((sum, site) => sum + site.goods.reduce((inner, good) => inner + good.stock, 0), 0);
    if (vanished || catastrophes) {
        logEvent("BIOME FRONTIERS · " + catastrophes + " CATASTROPHE(S) · " + vanished + " SITE(S) LOST", "#d99a6c");
    }
    return {
        updated: true,
        year,
        sites: model.sites.length,
        changed,
        catastrophes,
        vanished: model.sites.filter(site => site.phase === "vanished").length,
        surveyed: model.stats.surveyed,
        conserved: model.stats.conserved,
        condition: round(model.sites.reduce((sum, site) => sum + site.condition, 0) / Math.max(1, model.sites.length), 1),
    };
}

export function serializeBiomeFrontierState() {
    const model = ensureBiomeFrontiers();
    const snapshot = {
        version: BIOME_FRONTIER_VERSION,
        seed: model.seed,
        lastYear: model.lastYear,
        lastUpdateYear: model.lastUpdateYear,
        revision: model.revision,
        climate: { ...model.climate },
        sites: model.sites.map(site => ({
            ...site,
            layers: [...site.layers],
            species: site.species.map(row => ({ ...row })),
            specialists: site.specialists.map(row => ({ ...row })),
            hazards: site.hazards.map(row => ({ ...row })),
            goods: site.goods.map(row => ({ ...row })),
            history: site.history.map(row => ({ ...row })),
        })),
        history: model.history.map(row => ({ ...row })),
        stats: { ...model.stats },
    };
    return normalizeModel(snapshot);
}

export function validateBiomeFrontierSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Save data contains an invalid biome-frontier ledger.");
    if (Number(snapshot.version) !== BIOME_FRONTIER_VERSION) throw new Error("Save data contains an unsupported biome-frontier version.");
    if (!Array.isArray(snapshot.sites) || snapshot.sites.length > BIOME_FRONTIER_SITE_LIMIT) throw new Error("Save data contains too many frontier sites.");
    if (Number(snapshot.seed) <= 0) throw new Error("Save data contains an invalid biome-frontier seed.");
    const seen = new Set();
    for (const site of snapshot.sites) {
        if (!site || typeof site !== "object" || !BIOME_FRONTIER_BY_ID[site.family]) throw new Error("Save data contains an invalid frontier family.");
        if (seen.has(site.family)) throw new Error("Save data contains a duplicate frontier family.");
        seen.add(site.family);
        for (const key of ["condition", "extent", "magic", "corruption", "climatePressure"]) {
            const value = Number(site[key]);
            if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Save data contains an out-of-range frontier " + key + ".");
        }
        if (!Array.isArray(site.species) || site.species.length > BIOME_FRONTIER_SPECIES_LIMIT) throw new Error("Save data contains too many frontier species.");
        if (!Array.isArray(site.specialists) || site.specialists.length > BIOME_FRONTIER_SPECIALIST_LIMIT) throw new Error("Save data contains too many frontier specialists.");
        if (!Array.isArray(site.hazards) || site.hazards.length > BIOME_FRONTIER_HAZARD_LIMIT) throw new Error("Save data contains too many frontier hazards.");
        if (!Array.isArray(site.goods) || site.goods.length > BIOME_FRONTIER_GOOD_LIMIT) throw new Error("Save data contains too many frontier goods.");
        if (site.layers !== undefined && (!Array.isArray(site.layers) || site.layers.length > BIOME_FRONTIER_BY_ID[site.family].relics.length)) {
            throw new Error("Save data contains too many frontier relict layers.");
        }
        if (site.cycles !== undefined && (!site.cycles || typeof site.cycles !== "object" || Array.isArray(site.cycles))) {
            throw new Error("Save data contains an invalid frontier cycle ledger.");
        }
        if (site.cycles && Object.keys(site.cycles).length > BIOME_FRONTIER_CYCLE_LIMIT) {
            throw new Error("Save data contains too many frontier cycles.");
        }
        for (const cycle of Object.values(site.cycles || {})) {
            if (!cycle || typeof cycle !== "object" || Array.isArray(cycle)) throw new Error("Save data contains an invalid frontier cycle.");
            if (!Number.isFinite(Number(cycle.phase)) || Number(cycle.phase) < 0 || Number(cycle.phase) >= 4) throw new Error("Save data contains an out-of-range frontier cycle phase.");
        }
        const journalIds = new Set(BIOME_FRONTIER_BY_ID[site.family].journal.map(entry => entry.id));
        if (site.journal !== undefined && (!Array.isArray(site.journal) || site.journal.length > BIOME_FRONTIER_BY_ID[site.family].journal.length
            || site.journal.some(id => !journalIds.has(String(id))))) {
            throw new Error("Save data contains an invalid frontier field journal.");
        }
        if (!Array.isArray(site.history) || site.history.length > BIOME_FRONTIER_SITE_HISTORY_LIMIT) throw new Error("Save data contains too much frontier site history.");
    }
    return true;
}

export function restoreBiomeFrontierState(snapshot) {
    if (snapshot === undefined || snapshot === null) {
        state.biomeFrontiers = null;
        return null;
    }
    validateBiomeFrontierSnapshot(snapshot);
    const model = normalizeModel(snapshot);
    if (!model) throw new Error("Save data contains an invalid biome-frontier ledger.");
    state.biomeFrontiers = model;
    return state.biomeFrontiers;
}

export function biomeFrontierGuardrails() {
    return BIOME_FRONTIER_GUARDRAILS.slice();
}

export const __internals = Object.freeze({
    hash32, unit, linkedAtlasRegion, createBiomeFrontierSite,
    normalizeModel, advanceBiomeFrontierYear, transfigureSite, costLabel,
});
