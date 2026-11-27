// 1.2.23.1.271–300 — long-term forest legacy, conservation and memory.
//
// One bounded ledger per world province, advanced once per year from the
// existing climate drift, regional forest catalogue and biome atlas. It is
// deliberately additive: no per-frame work, no second map, no second species
// simulation. Each saved field is optional on old saves. Every decision is a
// real expenditure and every annual consequence is deterministic.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { getDataPackForests } from "../core/data-packs.js";
import { getClimateDrift } from "./climate-drift.js";
import { REGIONAL_FOREST_TYPES, REGIONAL_SPECIES } from "../world/regional-forests.js";
import { FOREST_FAUNA, FOREST_SPECIES } from "../world/forest-ecology.js";
import { FOREST_CULTURE_REGIONS } from "../world/forest-culture.js";
import { WORLD_REGION_CATALOG } from "../world/world-regions.js";
import {
    FOREST_CONSERVATION_LAWS, FOREST_CONSERVATION_LAW_IDS,
    FOREST_LEGACY_ACHIEVEMENTS, FOREST_LEGACY_ACTION_LIMIT, FOREST_LEGACY_CULTURES,
    FOREST_LEGACY_GROUPS, FOREST_LEGACY_GUARDRAILS, FOREST_LEGACY_HAZARDS,
    FOREST_LEGACY_HAZARD_IDS, FOREST_LEGACY_HISTORY_LIMIT,
    FOREST_LEGACY_INSTITUTIONS, FOREST_LEGACY_INSTITUTION_IDS,
    FOREST_LEGACY_INSTITUTION_LIMIT,     FOREST_LEGACY_REFERENCE_CASES, FOREST_LEGACY_REGION_IDS, FOREST_LEGACY_REGION_LIMIT,
    FOREST_LEGACY_REGIONS, FOREST_LEGACY_REQUIREMENTS,
    FOREST_LEGACY_RING_LIMIT, FOREST_LEGACY_SPECIES_LIMIT,
    FOREST_LEGACY_STAGES, FOREST_LEGACY_VERSION,
} from "../world/forest-legacy-data.js";

export const FOREST_LEGACY_UPDATE_INTERVAL_YEARS = 1;
export const FOREST_LEGACY_MAX_HAZARD_SEVERITY = 1;
export const FOREST_LEGACY_EXTINCTION_STRESS = 92;
export const FOREST_LEGACY_REINTRODUCTION_COST = Object.freeze({ gold: 14 });
export const FOREST_LEGACY_PROTECTION_COST = Object.freeze({ gold: 18 });
export const FOREST_LEGACY_AFFOREST_COST = Object.freeze({ gold: 10, wood: 8, seedlings: 8 });
export const FOREST_LEGACY_MONUMENT_COST = Object.freeze({ gold: 16, wood: 6 });
export const FOREST_LEGACY_CITIZEN_COSTS = Object.freeze([
    Object.freeze({ gold: 18 }), Object.freeze({ gold: 34 }), Object.freeze({ gold: 58 }),
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const int = (value, min, max, fallback = min) => clamp(Math.floor(num(value, fallback)), min, max);
const round = (value, digits = 2) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
const title = value => String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const text = (value, limit = 180) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);

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

function unit(seed, a, b, c) {
    return hash32(seed, a, b, c) / 4294967296;
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

function yearNow() {
    return Math.max(1, Math.floor(num(state.year, 1)));
}

function stageForAge(age, region = null) {
    const protectionBonus = region?.protection === "reserve" ? 28 : region?.protection === "community" ? 12 : 0;
    const adjusted = Math.max(0, num(age) + protectionBonus);
    let stage = FOREST_LEGACY_STAGES[0];
    for (const candidate of FOREST_LEGACY_STAGES) if (adjusted >= candidate.minAge) stage = candidate;
    return stage;
}

function regionDefinition(id) {
    return WORLD_REGION_CATALOG.find(region => region.id === String(id || "")) || null;
}

function typeIsRare(type) {
    if (!type) return false;
    const label = String(type.label || "");
    if (type.rare === true) return true;
    return /mangrove|cloud|volcanic|serpentine|oasis|salt|lagoon|semi-desert|krummholz|island/i.test(label);
}

function speciesLabel(id, kind = "tree") {
    const key = String(id || "");
    if (REGIONAL_SPECIES[key]?.label) return REGIONAL_SPECIES[key].label;
    if (FOREST_SPECIES[key]?.label) return FOREST_SPECIES[key].label;
    if (FOREST_FAUNA[key]?.label) return FOREST_FAUNA[key].label;
    return title(key);
}

function typeSpecies(type) {
    if (!type) return [];
    if (Array.isArray(type.species)) {
        return type.species.slice(0, 6).map(entry => ({
            id: String(entry.id || entry.label || "").slice(0, 48),
            label: text(entry.label || entry.name || speciesLabel(entry.id, "tree"), 48),
            kind: entry.kind === "animal" ? "animal" : "tree",
            share: clamp(num(entry.share, 20), 1, 100),
        })).filter(entry => entry.id);
    }
    const source = type.species && typeof type.species === "object" ? type.species : {};
    return Object.entries(source)
        .sort((a, b) => num(b[1]) - num(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([id, share]) => ({ id, label: speciesLabel(id, "tree"), kind: "tree", share: clamp(num(share, 10) * 100, 1, 100) }));
}

function typeFauna(type) {
    return (Array.isArray(type?.fauna) ? type.fauna : []).slice(0, 2).map(id => ({
        id: String(id).slice(0, 48), label: speciesLabel(id, "animal"), kind: "animal", share: 12,
    }));
}

function normalizedModType(entry, packId = "pack") {
    const species = Array.isArray(entry?.species) ? entry.species : [];
    return {
        id: String(entry?.id || "").slice(0, 64),
        key: String(entry?.key || entry?.id || "").slice(0, 64),
        label: text(entry?.label || entry?.name || "Custom Wood", 64),
        profile: text(entry?.description || entry?.profile || "A player-authored regional forest type.", 240),
        climates: Array.isArray(entry?.climates) ? entry.climates.map(value => text(value, 24)) : [text(entry?.climate || "temperate", 24)],
        species: species.slice(0, 8).map(row => ({
            id: text(row?.id || row?.name || "", 48),
            label: text(row?.label || row?.name || row?.id || "Custom species", 48),
            kind: row?.kind === "animal" ? "animal" : "tree",
            share: clamp(num(row?.share, 20), 1, 100),
        })).filter(row => row.id),
        fauna: [],
        rare: Boolean(entry?.rare),
        palette: Array.isArray(entry?.palette) ? entry.palette.slice(0, 8).map(value => text(value, 16)) : [],
        modded: true,
        packId,
    };
}

/** All built-in and locally installed custom formations, in a stable order. */
export function forestLegacyForestTypes() {
    let custom = [];
    try {
        custom = (getDataPackForests() || []).map((entry, index) => normalizedModType(entry, "data-pack-" + index));
    } catch {
        custom = [];
    }
    return [...REGIONAL_FOREST_TYPES, ...custom];
}

function chooseType(def, seed, preset = null) {
    const all = forestLegacyForestTypes();
    if (preset) {
        const exact = all.find(type => type.id === preset || type.key === preset);
        if (exact) return exact;
    }
    const climate = String(def.climate || "temperate");
    const direct = all.filter(type => (type.climates || []).includes(climate));
    const candidates = direct.length ? direct : all;
    if (!candidates.length) return null;
    const index = hash32(seed, hashString(def.id), 0x54595045) % candidates.length;
    return candidates[index];
}

function linkedBiomeRegion(def) {
    const regions = Array.isArray(state.biomeAtlas?.regions) ? state.biomeAtlas.regions : [];
    if (!regions.length) return null;
    const width = Math.max(1, num(state.worldW, 1));
    const height = Math.max(1, num(state.worldH, 1));
    const anchor = def.anchor || { x: 0.5, y: 0.5 };
    const x = anchor.x * width;
    const y = anchor.y * height;
    let best = null;
    let bestDistance = Infinity;
    for (const region of regions) {
        const cx = num(region.x, 0) + num(region.width, 0) / 2;
        const cy = num(region.y, 0) + num(region.height, 0) / 2;
        const distance = (cx - x) ** 2 + (cy - y) ** 2;
        if (distance < bestDistance) { best = region; bestDistance = distance; }
    }
    return best?.id || null;
}

function initialSpecies(type, seed, def) {
    const trees = typeSpecies(type).slice(0, 5);
    const animals = typeFauna(type).slice(0, 3);
    const rows = [...trees, ...animals].slice(0, FOREST_LEGACY_SPECIES_LIMIT);
    const total = Math.max(1, trees.reduce((sum, row) => sum + row.share, 0));
    return rows.map((row, index) => {
        const tree = row.kind === "tree";
        const base = tree ? row.share / total * 100 : 12;
        const speciesSeed = hashString(type.id + ":" + row.id + ":" + def.id);
        return {
            id: row.id,
            label: row.label,
            kind: row.kind,
            share: round(tree ? clamp(base, 1, 85) : clamp(base, 1, 25)),
            population: tree ? 0 : round(18 + unit(seed, speciesSeed, index, 0x504f50) * 55),
            elevationM: Math.round(210 + unit(seed, speciesSeed, index, 0x454c45) * 1050),
            stress: round(10 + unit(seed, speciesSeed, index, 0x535452) * 28),
            geneticDiversity: round(0.42 + unit(seed, speciesSeed, index, 0x47454e) * 0.42, 3),
            status: "living",
            observed: index < 2,
            seedBackup: false,
            geneBackup: false,
            invasive: Boolean(row.invasive),
            introducedYear: 0,
            lastEvent: null,
        };
    });
}

function initialRings(def, seed, age, year) {
    const count = Math.min(28, Math.max(8, Math.floor(age / 6)));
    const rows = [];
    for (let index = Math.max(1, year - count); index <= year; index++) {
        const stress = clamp(0.2 + unit(seed, hashString(def.id), index, 0x52494e47) * 0.38, 0.05, 0.95);
        rows.push({
            year: index,
            growth: round(clamp(1.15 - stress * 0.55 + unit(seed, hashString(def.id), index, 0x47524f57) * 0.16, 0.2, 1.4), 2),
            stress: round(stress, 2),
            event: null,
        });
    }
    return rows;
}

function createRegion(def, seed, year, preset = null) {
    const type = chooseType(def, seed, preset);
    const age = Math.round(65 + unit(seed, hashString(def.id), 0x414745) * 205);
    const linked = linkedBiomeRegion(def);
    const stage = stageForAge(age);
    const rarity = typeIsRare(type);
    return {
        id: def.id,
        name: def.name,
        ownerId: def.ownerId,
        typeId: type?.id || null,
        typeKey: type?.key || null,
        typeLabel: type?.label || "Unclassified Wood",
        typeProfile: text(type?.profile || "", 220),
        rare: rarity,
        climate: def.climate,
        climatePressure: 0,
        climateShift: 0,
        atlasRegionId: linked,
        ageYears: age,
        phase: stage.id,
        canopy: round(clamp(stage.canopy + unit(seed, hashString(def.id), 0x43414e) * 0.1 - 0.05, 0.22, 0.98), 2),
        elevationM: Math.round(240 + unit(seed, hashString(def.id), 0x454c56) * (def.elevationBand === "high" ? 1250 : def.elevationBand === "low" ? 420 : 780)),
        protection: "none",
        protectionYear: 0,
        lastActionYear: 0,
        afforestation: 0,
        planted: 0,
        extinct: 0,
        reintroduced: 0,
        hazards: Object.fromEntries(FOREST_LEGACY_HAZARD_IDS.map(kind => [kind, { year: 0, severity: 0, loss: 0 }])),
        species: initialSpecies(type, seed, def),
        rings: initialRings(def, seed, age, year),
        monuments: [],
        observations: 0,
        surveyYear: 0,
        codexAdded: 0,
    };
}

function baseState(year = yearNow()) {
    const seed = Math.max(1, Math.floor(num(state.worldSeed, 27101)));
    const preset = state.scenario?.forestType ? String(state.scenario.forestType) : null;
    const regions = FOREST_LEGACY_REGIONS.map((def, index) => {
        const regionSeed = seed + hashString(def.id) + index;
        return createRegion(def, regionSeed, year, index === 0 ? preset : null);
    }).slice(0, FOREST_LEGACY_REGION_LIMIT);
    const model = {
        version: FOREST_LEGACY_VERSION,
        seed,
        lastYear: year,
        lastUpdateYear: year,
        revision: 0,
        climate: { drift: getClimateDrift(), warming: 0, shiftYears: 0 },
        law: "none",
        lawYear: 0,
        institutions: Object.fromEntries(FOREST_LEGACY_INSTITUTION_IDS.map(id => [id, 0])),
        citizenScience: 0,
        seedStock: 0,
        geneStock: 0,
        seedlings: 0,
        museumStock: 0,
        regions,
        codex: {},
        achievements: {},
        history: [],
        actions: [],
        stats: {
            extinctions: 0,
            reintroduced: 0,
            hazards: 0,
            planted: 0,
            protected: 0,
            monuments: 0,
            rings: 0,
            observations: 0,
            laws: 0,
        },
    };
    for (const region of regions) {
        for (const species of region.species.slice(0, 2)) {
            model.codex[codexKey(species.kind, species.id)] = {
                kind: species.kind,
                label: species.label,
                regionId: region.id,
                year,
                detail: species.kind === "tree" ? "A living tree of " + region.typeLabel + "." : "A resident animal of " + region.typeLabel + ".",
            };
        }
        for (const culture of FOREST_LEGACY_CULTURES.slice(0, 1)) {
            model.codex[codexKey("culture", culture.id)] = {
                kind: "culture", label: culture.label, regionId: region.id, year,
                detail: culture.detail,
            };
        }
    }
    return model;
}

function codexKey(kind, id) {
    return String(kind) + ":" + String(id);
}

function normalizeSpecies(row, index) {
    return {
        id: text(row?.id || "unknown-" + index, 48),
        label: text(row?.label || speciesLabel(row?.id, row?.kind), 48),
        kind: row?.kind === "animal" ? "animal" : "tree",
        share: round(clamp(num(row?.share, 2), 0, 100)),
        population: round(clamp(num(row?.population, 0), 0, 100000)),
        elevationM: Math.round(clamp(num(row?.elevationM, 250), 0, 4000)),
        stress: round(clamp(num(row?.stress, 0), 0, 100)),
        geneticDiversity: round(clamp(num(row?.geneticDiversity, 0.5), 0, 1), 3),
        status: row?.status === "extinct" ? "extinct" : "living",
        observed: Boolean(row?.observed),
        seedBackup: Boolean(row?.seedBackup),
        geneBackup: Boolean(row?.geneBackup),
        invasive: Boolean(row?.invasive),
        introducedYear: Math.max(0, Math.floor(num(row?.introducedYear, 0))),
        lastEvent: row?.lastEvent ? text(row.lastEvent, 80) : null,
    };
}

function normalizeRegion(row, fallback, index) {
    const def = WORLD_REGION_CATALOG[index] || fallback;
    if (!def) return null;
    const stage = FOREST_LEGACY_STAGES.find(entry => entry.id === row?.phase) || stageForAge(num(row?.ageYears, 60));
    const species = Array.isArray(row?.species) ? row.species.slice(0, FOREST_LEGACY_SPECIES_LIMIT).map(normalizeSpecies) : [];
    const hazards = {};
    for (const kind of FOREST_LEGACY_HAZARD_IDS) {
        const value = row?.hazards?.[kind] || {};
        hazards[kind] = {
            year: Math.max(0, Math.floor(num(value.year, 0))),
            severity: round(clamp(num(value.severity, 0), 0, 1)),
            loss: Math.max(0, Math.floor(num(value.loss, 0))),
        };
    }
    return {
        id: def.id,
        name: text(row?.name || def.name, 48),
        ownerId: text(row?.ownerId || def.ownerId, 24),
        typeId: row?.typeId ? text(row.typeId, 64) : null,
        typeKey: row?.typeKey ? text(row.typeKey, 64) : null,
        typeLabel: text(row?.typeLabel || "Unclassified Wood", 64),
        typeProfile: text(row?.typeProfile || "", 220),
        rare: Boolean(row?.rare),
        climate: text(row?.climate || "temperate", 24),
        climatePressure: round(clamp(num(row?.climatePressure, 0), 0, 100)),
        climateShift: round(clamp(num(row?.climateShift, -5), -5, 5)),
        atlasRegionId: row?.atlasRegionId ? text(row.atlasRegionId, 32) : null,
        ageYears: Math.max(0, Math.floor(num(row?.ageYears, 60))),
        phase: stage.id,
        canopy: round(clamp(num(row?.canopy, stage.canopy), 0, 1)),
        elevationM: Math.round(clamp(num(row?.elevationM, 300), 0, 4000)),
        protection: ["none", "reserve", "community", "monument"].includes(row?.protection) ? row.protection : "none",
        protectionYear: Math.max(0, Math.floor(num(row?.protectionYear, 0))),
        lastActionYear: Math.max(0, Math.floor(num(row?.lastActionYear, 0))),
        afforestation: round(clamp(num(row?.afforestation, 0), 0, 1)),
        planted: Math.max(0, Math.floor(num(row?.planted, 0))),
        extinct: Math.max(0, Math.floor(num(row?.extinct, 0))),
        reintroduced: Math.max(0, Math.floor(num(row?.reintroduced, 0))),
        hazards,
        species,
        rings: Array.isArray(row?.rings)
            ? row.rings.slice(-FOREST_LEGACY_RING_LIMIT).map(ring => ({
                year: Math.max(1, Math.floor(num(ring?.year, 1))),
                growth: round(clamp(num(ring?.growth, 1), 0.1, 3), 2),
                stress: round(clamp(num(ring?.stress, 0.2), 0, 1), 2),
                event: ring?.event ? text(ring.event, 60) : null,
            }))
            : [],
        monuments: Array.isArray(row?.monuments) ? row.monuments.slice(0, 3).map(monument => ({
            id: text(monument?.id || "monument", 48),
            label: text(monument?.label || "Old Tree", 64),
            speciesId: text(monument?.speciesId || "", 48),
            ageYears: Math.max(1, Math.floor(num(monument?.ageYears, 100))),
            story: text(monument?.story || "", 180),
            year: Math.max(1, Math.floor(num(monument?.year, 1))),
        })) : [],
        observations: Math.max(0, Math.floor(num(row?.observations, 0))),
        surveyYear: Math.max(0, Math.floor(num(row?.surveyYear, 0))),
        codexAdded: Math.max(0, Math.floor(num(row?.codexAdded, 0))),
    };
}

function normalizeModel(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
    if (Number(snapshot.version) !== FOREST_LEGACY_VERSION) return null;
    const seed = Math.max(1, Math.floor(num(snapshot.seed, state.worldSeed || 27101)));
    const regions = [];
    const sourceRegions = Array.isArray(snapshot.regions) ? snapshot.regions.slice(0, FOREST_LEGACY_REGION_LIMIT) : [];
    for (let index = 0; index < WORLD_REGION_CATALOG.length; index++) {
        const saved = sourceRegions.find(row => row?.id === WORLD_REGION_CATALOG[index].id) || sourceRegions[index];
        if (saved) regions.push(normalizeRegion(saved, WORLD_REGION_CATALOG[index], index));
    }
    if (!regions.length) return null;
    const institution = id => Math.max(0, Math.min(FOREST_LEGACY_INSTITUTION_LIMIT, Math.floor(num(snapshot.institutions?.[id], 0))));
    const model = {
        version: FOREST_LEGACY_VERSION,
        seed,
        lastYear: Math.max(1, Math.floor(num(snapshot.lastYear, yearNow()))),
        lastUpdateYear: Math.max(1, Math.floor(num(snapshot.lastUpdateYear, snapshot.lastYear || yearNow()))),
        revision: Math.max(0, Math.floor(num(snapshot.revision, 0))),
        climate: {
            drift: Math.round(clamp(num(snapshot.climate?.drift, 0), -20, 20)),
            warming: round(clamp(num(snapshot.climate?.warming, 0), -1, 1), 3),
            shiftYears: Math.max(0, Math.floor(num(snapshot.climate?.shiftYears, 0))),
        },
        law: FOREST_CONSERVATION_LAW_IDS.includes(snapshot.law) ? snapshot.law : "none",
        lawYear: Math.max(0, Math.floor(num(snapshot.lawYear, 0))),
        institutions: Object.fromEntries(FOREST_LEGACY_INSTITUTION_IDS.map(id => [id, institution(id)])),
        citizenScience: Math.max(0, Math.min(FOREST_LEGACY_INSTITUTION_LIMIT, Math.floor(num(snapshot.citizenScience, 0)))),
        seedStock: Math.max(0, Math.floor(num(snapshot.seedStock, 0))),
        geneStock: Math.max(0, Math.floor(num(snapshot.geneStock, 0))),
        seedlings: Math.max(0, Math.floor(num(snapshot.seedlings, 0))),
        museumStock: Math.max(0, Math.floor(num(snapshot.museumStock, 0))),
        regions,
        codex: snapshot.codex && typeof snapshot.codex === "object" && !Array.isArray(snapshot.codex) ? snapshot.codex : {},
        achievements: snapshot.achievements && typeof snapshot.achievements === "object" && !Array.isArray(snapshot.achievements) ? snapshot.achievements : {},
        history: Array.isArray(snapshot.history) ? snapshot.history.slice(-FOREST_LEGACY_HISTORY_LIMIT).map(entry => ({
            year: Math.max(1, Math.floor(num(entry?.year, 1))),
            kind: text(entry?.kind || "note", 24),
            regionId: text(entry?.regionId || "", 32),
            text: text(entry?.text || "", 160),
        })) : [],
        actions: Array.isArray(snapshot.actions) ? snapshot.actions.slice(-FOREST_LEGACY_ACTION_LIMIT).map(entry => ({
            year: Math.max(1, Math.floor(num(entry?.year, 1))),
            kind: text(entry?.kind || "action", 32),
            regionId: text(entry?.regionId || "", 32),
            text: text(entry?.text || "", 120),
        })) : [],
        stats: {
            extinctions: Math.max(0, Math.floor(num(snapshot.stats?.extinctions, 0))),
            reintroduced: Math.max(0, Math.floor(num(snapshot.stats?.reintroduced, 0))),
            hazards: Math.max(0, Math.floor(num(snapshot.stats?.hazards, 0))),
            planted: Math.max(0, Math.floor(num(snapshot.stats?.planted, 0))),
            protected: Math.max(0, Math.floor(num(snapshot.stats?.protected, 0))),
            monuments: Math.max(0, Math.floor(num(snapshot.stats?.monuments, 0))),
            rings: Math.max(0, Math.floor(num(snapshot.stats?.rings, 0))),
            observations: Math.max(0, Math.floor(num(snapshot.stats?.observations, 0))),
            laws: Math.max(0, Math.floor(num(snapshot.stats?.laws, 0))),
        },
    };
    for (const region of model.regions) {
        if (!region) continue;
        region.phase = stageForAge(region.ageYears, region).id;
        for (const species of region.species) {
            if (species.kind === "tree" && species.share <= 0 && species.status === "living") species.status = "extinct";
        }
    }
    return model;
}

function ensureCodexMethod(model) {
    if (typeof model.codexKey !== "function") model.codexKey = codexKey;
    return model;
}

export function ensureForestLegacy(options = {}) {
    if (!state.forestLegacy || typeof state.forestLegacy !== "object") {
        state.forestLegacy = baseState(yearNow());
        state.forestLegacy.codexKey = codexKey;
    }
    const model = state.forestLegacy;
    if (!model.regions?.length) {
        state.forestLegacy = baseState(yearNow());
        state.forestLegacy.codexKey = codexKey;
    }
    ensureCodexMethod(state.forestLegacy);
    if (options?.refreshClimate === true) {
        state.forestLegacy.climate.drift = getClimateDrift();
    }
    return state.forestLegacy;
}

export function resetForestLegacy() {
    state.forestLegacy = null;
}

function recordAction(model, kind, regionId, message) {
    model.actions.push({ year: yearNow(), kind, regionId: regionId || "", text: text(message, 120) });
    if (model.actions.length > FOREST_LEGACY_ACTION_LIMIT) model.actions.splice(0, model.actions.length - FOREST_LEGACY_ACTION_LIMIT);
    model.revision = Math.max(0, model.revision) + 1;
}

function recordHistory(model, kind, regionId, message) {
    model.history.push({ year: yearNow(), kind, regionId: regionId || "", text: text(message, 160) });
    if (model.history.length > FOREST_LEGACY_HISTORY_LIMIT) model.history.splice(0, model.history.length - FOREST_LEGACY_HISTORY_LIMIT);
}

function hasResources(cost) {
    return (num(state.resources?.gold, 0) >= num(cost.gold, 0))
        && (num(state.resources?.wood, 0) >= num(cost.wood, 0))
        && (num(state.resources?.stone, 0) >= num(cost.stone, 0));
}

function spend(cost) {
    if (!hasResources(cost)) return { ok: false, reason: "not-enough-resources" };
    for (const key of ["gold", "wood", "stone"]) {
        if (num(cost[key], 0)) addResource(key, -num(cost[key], 0));
    }
    return { ok: true };
}

function regionById(model, id) {
    return model.regions.find(region => region.id === String(id || "")) || null;
}

function livingSpecies(region) {
    return (region?.species || []).filter(species => species.status === "living");
}

function treeShare(region) {
    return livingSpecies(region).filter(species => species.kind === "tree").reduce((sum, species) => sum + species.share, 0);
}

function protectionFactor(region) {
    if (region?.protection === "reserve") return 0.55;
    if (region?.protection === "community") return 0.78;
    if (region?.protection === "monument") return 0.68;
    return 1;
}

function linkedBiome(model, region) {
    const id = region?.atlasRegionId;
    return id ? (state.biomeAtlas?.regions || []).find(row => row.id === id) || null : null;
}

function adjustBiome(region, changes = {}) {
    const biome = linkedBiome(null, region);
    if (!biome) return null;
    if (changes.vegetation) biome.vegetation = clamp(num(biome.vegetation) + changes.vegetation, 0.01, 1);
    if (changes.water) biome.water = clamp(num(biome.water) + changes.water, 0.01, 1);
    if (changes.clearCut) biome.clearCut = clamp(num(biome.clearCut) + changes.clearCut, 0, 1);
    if (changes.diseasePressure) biome.diseasePressure = clamp(num(biome.diseasePressure) + changes.diseasePressure, 0, 1);
    if (changes.erosion) biome.erosion = clamp(num(biome.erosion) + changes.erosion, 0, 1);
    return biome;
}

function addCodex(model, kind, id, label, regionId, detail, year = yearNow()) {
    const key = codexKey(kind, id);
    if (model.codex[key]) return false;
    model.codex[key] = { kind, label: text(label, 64), regionId: regionId || "", year, detail: text(detail, 180) };
    const region = regionById(model, regionId);
    if (region) region.codexAdded = Math.max(0, region.codexAdded) + 1;
    return true;
}

function evaluateAchievements(model) {
    for (const achievement of FOREST_LEGACY_ACHIEVEMENTS) {
        if (model.achievements[achievement.id]) continue;
        let earned = false;
        try { earned = achievement.check(model) === true; } catch { earned = false; }
        if (!earned) continue;
        model.achievements[achievement.id] = { year: yearNow(), label: achievement.label };
        recordAction(model, "achievement", "", achievement.label);
        try {
            addLog("FOREST ACHIEVEMENT · " + achievement.label.toUpperCase(), "#d6b56d", "forest");
        } catch { /* logging is presentation */ }
    }
}

export function forestLegacyRegionRules(regionId) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return null;
    return {
        protection: region.protection,
        salvageAllowed: region.protection !== "reserve",
        plantingAllowed: true,
        huntingAllowed: region.protection !== "reserve",
        scientificPriority: region.protection === "reserve" || region.protection === "monument",
        reason: region.protection === "reserve"
            ? "Reserve: no salvage logging; seed, gene and observation work have priority."
            : region.protection === "community"
                ? "Community wood: local use continues; citizen observations are cheaper."
                : region.protection === "monument"
                    ? "Monument wood: the named old tree is untouchable, the surrounding stand stays worked."
                    : "Unprotected: salvage and extraction follow the ordinary forest work.",
    };
}

/** A pure 100/200/300-year projection from the live ledger. No mutation. */
export function forestLegacyCentury(regionId, horizons = [100, 200, 300]) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return [];
    const living = livingSpecies(region);
    const dominant = living.slice().sort((a, b) => (b.kind === "tree" ? b.share : b.population) - (a.kind === "tree" ? a.share : a.population))[0] || null;
    return horizons.map(offset => {
        const age = region.ageYears + Math.max(0, num(offset));
        const stage = stageForAge(age, region);
        const warming = model.climate.warming;
        const pressure = clamp(region.climatePressure / 100 + warming * 0.4, 0, 1);
        const canopy = clamp(stage.canopy + (region.protection === "reserve" ? 0.04 : 0) - pressure * 0.12, 0.2, 0.98);
        return {
            horizon: Math.max(1, Math.floor(num(offset, 100))),
            ageYears: age,
            phase: stage.id,
            phaseLabel: stage.label,
            canopy: round(canopy, 2),
            dominant: dominant?.label || "none",
            climateAnalog: region.typeLabel,
            note: region.protection === "reserve"
                ? "Protected old structure is expected to persist."
                : pressure > 0.6
                    ? "Warming and disturbance favour a younger, more open wood."
                    : "The present cohort can close again if no new catastrophe intervenes.",
        };
    });
}

export function forestLegacyRingArchive(regionId, limit = 12) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return [];
    return region.rings.slice(-Math.max(1, Math.min(FOREST_LEGACY_RING_LIMIT, limit))).reverse();
}

export function forestLegacyRegion(regionId) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return null;
    return {
        ...region,
        rules: forestLegacyRegionRules(region.id),
        century: forestLegacyCentury(region.id),
        rings: forestLegacyRingArchive(region.id, 8),
        species: region.species.map(species => ({ ...species })),
    };
}

export function forestLegacyCodex() {
    const model = ensureForestLegacy();
    const known = Object.values(model.codex).sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
    const all = [];
    const seen = new Set();
    for (const region of model.regions) {
        for (const species of region.species) {
            const key = codexKey(species.kind, species.id);
            if (seen.has(key)) continue;
            seen.add(key);
            all.push({
                key, kind: species.kind, label: species.label,
                regionId: region.id, regionName: region.name,
                detail: species.kind === "tree" ? "A tree cohort of " + region.typeLabel + "." : "An animal cohort of " + region.typeLabel + ".",
                known: Boolean(model.codex[key]),
                status: species.status,
            });
        }
        for (const culture of FOREST_LEGACY_CULTURES) {
            const key = codexKey("culture", culture.id);
            if (seen.has(key)) continue;
            seen.add(key);
            all.push({ key, kind: "culture", label: culture.label, regionId: region.id, regionName: region.name, detail: culture.detail, known: Boolean(model.codex[key]), status: "living" });
        }
    }
    return { known, all, knownCount: known.length, total: all.length };
}

export function forestLegacyModdedTypes() {
    try {
        return (getDataPackForests() || []).map((entry, index) => normalizedModType(entry, "data-pack-" + index));
    } catch {
        return [];
    }
}

export function forestLegacySummary() {
    const model = ensureForestLegacy();
    const regions = model.regions.map(region => {
        const living = livingSpecies(region);
        const extinct = region.species.filter(species => species.status === "extinct");
        return {
            id: region.id, name: region.name, typeId: region.typeId, typeLabel: region.typeLabel,
            rare: region.rare, ageYears: region.ageYears, phase: region.phase,
            phaseLabel: FOREST_LEGACY_STAGES.find(stage => stage.id === region.phase)?.label || title(region.phase),
            canopy: region.canopy, protection: region.protection,
            protectionLabel: region.protection === "none" ? "Unprotected" : title(region.protection),
            living: living.length, extinct: extinct.length,
            treeShare: round(treeShare(region)), observations: region.observations,
            climatePressure: region.climatePressure, climate: region.climate, elevationM: region.elevationM,
            hazards: FOREST_LEGACY_HAZARD_IDS.map(kind => ({ id: kind, ...FOREST_LEGACY_HAZARDS[kind], ...region.hazards[kind] })),
            lastHazard: FOREST_LEGACY_HAZARD_IDS.map(kind => ({ id: kind, ...region.hazards[kind] })).filter(row => row.year > 0).sort((a, b) => b.year - a.year)[0] || null,
            monuments: region.monuments.length,
            monumentList: region.monuments.map(monument => ({ ...monument })),
            rings: region.rings.length,
            species: region.species.map(species => ({ ...species })),
            century: forestLegacyCentury(region.id),
            ringArchive: forestLegacyRingArchive(region.id, 10),
            rules: forestLegacyRegionRules(region.id),
        };
    });
    const achievements = FOREST_LEGACY_ACHIEVEMENTS.map(entry => ({
        ...entry, earned: Boolean(model.achievements[entry.id]), year: model.achievements[entry.id]?.year || null,
    }));
    const codex = forestLegacyCodex();
    return {
        version: model.version,
        seed: model.seed,
        year: model.lastUpdateYear,
        climate: { ...model.climate, temperatureOffset: round(model.climate.warming * 0.045, 3) },
        law: FOREST_CONSERVATION_LAWS[model.law] || FOREST_CONSERVATION_LAWS.none,
        lawId: model.law,
        lawYear: model.lawYear,
        institutions: FOREST_LEGACY_INSTITUTION_IDS.map(id => ({
            ...FOREST_LEGACY_INSTITUTIONS[id], level: model.institutions[id],
            next: model.institutions[id] < FOREST_LEGACY_INSTITUTION_LIMIT,
            nextCost: FOREST_LEGACY_INSTITUTIONS[id].costs[model.institutions[id]] || null,
            capacity: FOREST_LEGACY_INSTITUTIONS[id].capacity[Math.max(0, model.institutions[id] - 1)] || 0,
        })),
        citizenScience: { level: model.citizenScience, max: FOREST_LEGACY_INSTITUTION_LIMIT, nextCost: FOREST_LEGACY_CITIZEN_COSTS[model.citizenScience] || null },
        stocks: { seed: model.seedStock, gene: model.geneStock, seedlings: model.seedlings, museum: model.museumStock },
        regions,
        achievements,
        codex,
        history: model.history.slice().reverse(),
        actions: model.actions.slice(-12).reverse(),
        stats: { ...model.stats, protectedRegions: regions.filter(region => region.protection !== "none").length },
        requirements: FOREST_LEGACY_REQUIREMENTS,
        groups: FOREST_LEGACY_GROUPS,
        guardrails: FOREST_LEGACY_GUARDRAILS,
        moddedTypes: forestLegacyModdedTypes(),
        referenceCases: FOREST_LEGACY_REFERENCE_CASES.map(entry => ({ ...entry })),
    };
}

export function buildForestInstitution(institutionId) {
    const model = ensureForestLegacy();
    const definition = FOREST_LEGACY_INSTITUTIONS[institutionId];
    if (!definition) return { ok: false, reason: "unknown-institution" };
    const level = model.institutions[institutionId] || 0;
    if (level >= FOREST_LEGACY_INSTITUTION_LIMIT) return { ok: false, reason: "already-at-maximum" };
    const cost = definition.costs[level];
    if (!hasResources(cost)) return { ok: false, reason: "not-enough-resources" };
    spend(cost);
    model.institutions[institutionId] = level + 1;
    if (institutionId === "nursery") model.seedlings = Math.min(999, model.seedlings + 4);
    if (institutionId === "seed-bank") model.seedStock = Math.min(999, model.seedStock + 4);
    if (institutionId === "gene-bank") model.geneStock = Math.min(999, model.geneStock + 2);
    if (institutionId === "museum") {
        model.museumStock = Math.min(999, model.museumStock + 3);
        addCodex(model, "culture", "naturalists", "Naturalists & Surveyors", "", "The museum begins a written natural history of the realm.", yearNow());
    }
    recordAction(model, "institution", "", definition.label + " raised to level " + (level + 1) + ".");
    recordHistory(model, "institution", "", definition.label + " reached level " + (level + 1) + ".");
    evaluateAchievements(model);
    return { ok: true, level: level + 1, label: definition.label, message: definition.label.toUpperCase() + " · LEVEL " + (level + 1) };
}

export function setForestConservationLaw(lawId) {
    const model = ensureForestLegacy();
    const law = FOREST_CONSERVATION_LAWS[lawId];
    if (!law) return { ok: false, reason: "unknown-law" };
    if (model.law === lawId) return { ok: false, reason: "law-already-in-force" };
    if (model.lawYear === yearNow()) return { ok: false, reason: "one-law-per-year" };
    if (!hasResources({ gold: law.gold || 0 })) return { ok: false, reason: "not-enough-gold" };
    if (law.gold) addResource("gold", -law.gold);
    if (law.legitimacy && state.politics) {
        state.politics.legitimacy = clamp(num(state.politics.legitimacy, 65) + law.legitimacy, 0, 100);
    }
    model.law = lawId;
    model.lawYear = yearNow();
    model.stats.laws += 1;
    recordAction(model, "law", "", law.label + " enacted.");
    recordHistory(model, "law", "", law.label + " became the standing rule of the woods.");
    evaluateAchievements(model);
    return { ok: true, law: law.id, label: law.label, message: law.label.toUpperCase() + " ENACTED" };
}

export function protectForestRegion(regionId) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (region.protection !== "none") return { ok: false, reason: "already-protected" };
    if (!hasResources(FOREST_LEGACY_PROTECTION_COST)) return { ok: false, reason: "not-enough-gold" };
    spend(FOREST_LEGACY_PROTECTION_COST);
    region.protection = model.law === "community" ? "community" : "reserve";
    region.protectionYear = yearNow();
    region.lastActionYear = yearNow();
    model.stats.protected += 1;
    addCodex(model, "culture", "foresters", "Foresters & Wardens", region.id, "The reserve is entered in the warden's book.", yearNow());
    recordAction(model, "protect", region.id, region.name + " placed under " + region.protection + " protection.");
    recordHistory(model, "protection", region.id, region.name + " received formal woodland protection.");
    evaluateAchievements(model);
    return { ok: true, region: region.id, protection: region.protection, message: region.name.toUpperCase() + " · PROTECTED" };
}

export function afforestForestRegion(regionId) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (region.lastActionYear === yearNow()) return { ok: false, reason: "one-forest-action-per-year" };
    if ((model.institutions.nursery || 0) < 1) return { ok: false, reason: "nursery-required" };
    if (model.seedlings < FOREST_LEGACY_AFFOREST_COST.seedlings) return { ok: false, reason: "not-enough-seedlings" };
    if (!hasResources({ gold: FOREST_LEGACY_AFFOREST_COST.gold, wood: FOREST_LEGACY_AFFOREST_COST.wood })) return { ok: false, reason: "not-enough-resources" };
    spend({ gold: FOREST_LEGACY_AFFOREST_COST.gold, wood: FOREST_LEGACY_AFFOREST_COST.wood });
    model.seedlings -= FOREST_LEGACY_AFFOREST_COST.seedlings;
    region.afforestation = clamp(region.afforestation + 0.12, 0, 1);
    region.planted += 8;
    region.canopy = clamp(region.canopy + 0.045, 0, 0.98);
    region.lastActionYear = yearNow();
    for (const species of livingSpecies(region).filter(row => row.kind === "tree")) {
        species.stress = clamp(species.stress - 2.5, 0, 100);
    }
    adjustBiome(region, { vegetation: 0.045, clearCut: -0.04, erosion: -0.015 });
    model.stats.planted += 8;
    addCodex(model, "culture", "foresters", "Foresters & Wardens", region.id, "A planting party works the exposed slope.", yearNow());
    recordAction(model, "afforest", region.id, region.name + ": 8 native seedlings planted.");
    recordHistory(model, "afforestation", region.id, "A new native planting was laid out in " + region.name + ".");
    evaluateAchievements(model);
    return { ok: true, region: region.id, seedlings: model.seedlings, canopy: round(region.canopy, 2), message: "AFFORESTED " + region.name.toUpperCase() };
}

export function reintroduceForestSpecies(regionId, speciesId = null) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (region.lastActionYear === yearNow()) return { ok: false, reason: "one-forest-action-per-year" };
    const candidates = region.species.filter(species => species.status === "extinct");
    if (!candidates.length) return { ok: false, reason: "no-extinct-species" };
    const species = speciesId ? candidates.find(row => row.id === String(speciesId)) : candidates[0];
    if (!species) return { ok: false, reason: "unknown-species" };
    const hasSeed = species.kind === "tree" ? (model.seedStock > 0 || species.seedBackup) : false;
    const hasGene = model.geneStock > 0 || species.geneBackup;
    if (!hasSeed && !hasGene) return { ok: false, reason: "seed-or-gene-bank-required" };
    if (!hasResources(FOREST_LEGACY_REINTRODUCTION_COST)) return { ok: false, reason: "not-enough-gold" };
    spend(FOREST_LEGACY_REINTRODUCTION_COST);
    if (hasSeed) model.seedStock = Math.max(0, model.seedStock - 1);
    if (hasGene) model.geneStock = Math.max(0, model.geneStock - 1);
    species.status = "living";
    species.stress = 8;
    species.population = species.kind === "animal" ? 8 : 0;
    species.share = species.kind === "tree" ? Math.max(2, species.share) : 0;
    species.introducedYear = yearNow();
    region.reintroduced += 1;
    region.lastActionYear = yearNow();
    model.stats.reintroduced += 1;
    addCodex(model, species.kind, species.id, species.label, region.id, "Returned to " + region.name + " from stored " + (hasGene ? "gene material" : "seed") + ".", yearNow());
    recordAction(model, "reintroduce", region.id, species.label + " returned to " + region.name + ".");
    recordHistory(model, "reintroduction", region.id, species.label + " was reintroduced in " + region.name + ".");
    evaluateAchievements(model);
    return { ok: true, region: region.id, species: species.id, label: species.label, message: "REINTRODUCED " + species.label.toUpperCase() };
}

function monumentName(region, species, seed) {
    const stems = ["Elder", "Crown", "Hollow", "Watch", "Long", "Gray"];
    const suffix = ["Oak", "Pine", "Beech", "Ash", "Cedar", "Linden"];
    const first = stems[hash32(seed, hashString(region.id), 0x4d4f4e) % stems.length];
    const second = species?.label || suffix[hash32(seed, hashString(region.id), 0x535045) % suffix.length];
    return first + " " + second;
}

export function designateForestMonument(regionId) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region) return { ok: false, reason: "unknown-region" };
    if (region.monuments.length >= 3) return { ok: false, reason: "monument-limit" };
    if (region.ageYears < 100) return { ok: false, reason: "stand-too-young" };
    if (region.lastActionYear === yearNow()) return { ok: false, reason: "one-forest-action-per-year" };
    if (!hasResources(FOREST_LEGACY_MONUMENT_COST)) return { ok: false, reason: "not-enough-resources" };
    spend(FOREST_LEGACY_MONUMENT_COST);
    const tree = livingSpecies(region).filter(species => species.kind === "tree").sort((a, b) => b.share - a.share)[0];
    const seed = hash32(model.seed, hashString(region.id), region.monuments.length + 1, 0x4d4f4e55);
    const label = monumentName(region, tree, seed);
    const story = "A " + (tree?.label || "tree") + " older than the present charter. Its ring archive records " + region.rings.slice(-3).map(ring => ring.year).join(", ") + "; the warden keeps the ground beneath it uncut.";
    region.monuments.push({
        id: region.id + "-monument-" + (region.monuments.length + 1),
        label, speciesId: tree?.id || "", ageYears: Math.max(100, region.ageYears - 20), story, year: yearNow(),
    });
    if (region.protection === "none") region.protection = "monument";
    region.lastActionYear = yearNow();
    model.stats.monuments += 1;
    addCodex(model, "tree", tree?.id || "ancient-tree", label, region.id, story, yearNow());
    addCodex(model, "culture", "hermits", "Hermits & Shrine Keepers", region.id, "A named old tree becomes a place of memory.", yearNow());
    recordAction(model, "monument", region.id, label + " designated a natural monument.");
    recordHistory(model, "monument", region.id, label + " entered the roll of natural monuments.");
    evaluateAchievements(model);
    return { ok: true, region: region.id, label, message: "MONUMENT · " + label.toUpperCase() };
}

export function fundCitizenScience() {
    const model = ensureForestLegacy();
    if (model.citizenScience >= FOREST_LEGACY_INSTITUTION_LIMIT) return { ok: false, reason: "already-at-maximum" };
    const cost = FOREST_LEGACY_CITIZEN_COSTS[model.citizenScience];
    if (!hasResources(cost)) return { ok: false, reason: "not-enough-gold" };
    spend(cost);
    model.citizenScience += 1;
    if (model.citizenScience === 1) addCodex(model, "culture", "naturalists", "Naturalists & Surveyors", "", "A network of volunteers begins recording species.", yearNow());
    recordAction(model, "citizen-science", "", "Citizen science network raised to level " + model.citizenScience + ".");
    recordHistory(model, "citizen-science", "", "Volunteer observers joined the woodland survey.");
    evaluateAchievements(model);
    return { ok: true, level: model.citizenScience, message: "CITIZEN SCIENCE · LEVEL " + model.citizenScience };
}

function addRing(region, year, growth, stress, event = null) {
    region.rings.push({ year, growth: round(clamp(growth, 0.1, 3), 2), stress: round(clamp(stress, 0, 1), 2), event: event ? text(event, 60) : null });
    if (region.rings.length > FOREST_LEGACY_RING_LIMIT) region.rings.splice(0, region.rings.length - FOREST_LEGACY_RING_LIMIT);
}

function pickHazard(region, seed, year) {
    const allowed = FOREST_LEGACY_HAZARD_IDS.filter(kind => FOREST_LEGACY_HAZARDS[kind].climates.includes(region.climate));
    const pool = allowed.length ? allowed : FOREST_LEGACY_HAZARD_IDS;
    return pool[hash32(seed, hashString(region.id), year, 0x48415a) % pool.length];
}

/** Apply one named hazard. Public so a deterministic test can prove all six. */
export function applyForestHazard(regionId, kind, options = {}) {
    const model = ensureForestLegacy();
    const region = regionById(model, regionId);
    if (!region || !FOREST_LEGACY_HAZARDS[kind]) return { ok: false, reason: "unknown-hazard" };
    const year = Math.max(1, Math.floor(num(options.year, yearNow())));
    const severity = round(clamp(num(options.severity, 0.55), 0.1, FOREST_LEGACY_MAX_HAZARD_SEVERITY));
    const factor = protectionFactor(region);
    const protectedRegion = region.protection !== "none";
    const beforeCanopy = region.canopy;
    const beforeSpecies = region.species.map(species => ({ id: species.id, share: species.share, stress: species.stress, status: species.status }));
    let foodLoss = 0;
    let woodGain = 0;
    let textMessage = "";
    const nativeTrees = livingSpecies(region).filter(species => species.kind === "tree" && !species.invasive);
    const host = nativeTrees[hash32(model.seed, hashString(region.id), year, hashString(kind)) % Math.max(1, nativeTrees.length)] || null;
    if (kind === "fire") {
        region.canopy = clamp(region.canopy - (0.1 + severity * 0.22) * factor, 0.05, 1);
        region.ageYears = Math.max(0, region.ageYears - Math.round(8 + severity * 18));
        if (host) { host.stress = clamp(host.stress + 20 * severity * factor, 0, 100); host.share = Math.max(0, host.share - 7 * factor); }
        if (!protectedRegion) {
            // The burnt stems stay in the stand as salvage for the ordinary
            // woodcutter path. They are not teleported into the crown store:
            // a regional fire must not bypass the logistics economy.
            woodGain = Math.round((4 + severity * 10) * (model.institutions.museum ? 1.1 : 1));
        }
        adjustBiome(region, { vegetation: -0.08 * severity * factor, clearCut: 0.03 * severity * factor, erosion: 0.02 * severity });
        textMessage = "Fire crossed " + region.name + "; " + Math.round((beforeCanopy - region.canopy) * 100) + " points of canopy lost and " + woodGain + " cords left as salvage.";
    } else if (kind === "drought") {
        foodLoss = Math.round((3 + severity * 8) * (region.protection === "reserve" ? 0.55 : 1));
        addResource("food", -foodLoss);
        region.canopy = clamp(region.canopy - 0.045 * severity * factor, 0.1, 1);
        for (const species of nativeTrees.slice(0, 2)) species.stress = clamp(species.stress + 15 * severity * factor, 0, 100);
        adjustBiome(region, { vegetation: -0.035 * severity, water: -0.02 * severity, erosion: 0.01 * severity });
        textMessage = "Drought in " + region.name + " cost " + foodLoss + " food and narrowed the annual ring.";
    } else if (kind === "storm") {
        region.canopy = clamp(region.canopy - 0.07 * severity * factor, 0.08, 1);
        if (!protectedRegion) {
            woodGain = Math.round((5 + severity * 8) * 1.15);
        }
        if (host) host.stress = clamp(host.stress + 8 * severity * factor, 0, 100);
        adjustBiome(region, { vegetation: -0.045 * severity, clearCut: 0.02 * severity, erosion: 0.012 * severity });
        textMessage = "Windthrow in " + region.name + " left " + woodGain + " cords in the stand and torn root plates.";
    } else if (kind === "insect") {
        const conifers = nativeTrees.filter(species => /pine|fir|spruce|cedar|cypress|hemlock|sitka|larch|juniper/i.test(species.label) || /conifer/i.test(region.typeLabel));
        region.canopy = clamp(region.canopy - 0.08 * severity * factor, 0.08, 1);
        for (const species of (conifers.length ? conifers : nativeTrees).slice(0, 2)) {
            species.stress = clamp(species.stress + 22 * severity * factor, 0, 100);
            species.share = Math.max(0, species.share - 5 * factor);
        }
        if (!protectedRegion) {
            woodGain = Math.round(3 + severity * 7);
        }
        adjustBiome(region, { diseasePressure: 0.04 * severity, vegetation: -0.03 * severity });
        textMessage = "Bark beetles struck " + region.name + "'s conifer cohort.";
    } else if (kind === "invasive") {
        const existing = region.species.find(species => species.invasive && species.status === "living");
        if (!existing) {
            const invasive = {
                id: "invasive-" + region.climate, label: climateInvader(region.climate), kind: "tree",
                share: 4 + Math.round(severity * 5), population: 0, elevationM: region.elevationM, stress: 10,
                geneticDiversity: 0.72, status: "living", observed: false, seedBackup: false, geneBackup: false,
                invasive: true, introducedYear: year, lastEvent: "invasive arrival",
            };
            region.species.push(invasive);
            if (region.species.length > FOREST_LEGACY_SPECIES_LIMIT) region.species.shift();
        } else {
            existing.share = Math.min(45, existing.share + 2 + severity * 6);
        }
        if (host) { host.share = Math.max(0, host.share - 3 * severity); host.stress = clamp(host.stress + 4, 0, 100); }
        adjustBiome(region, { vegetation: -0.015 * severity, diseasePressure: 0.01 });
        addCodex(model, "tree", "invasive-" + region.climate, climateInvader(region.climate), region.id, "An introduced species spreading through " + region.name + ".", year);
        textMessage = "An invasive " + climateInvader(region.climate) + " spread through " + region.name + ".";
    } else if (kind === "fungus") {
        region.canopy = clamp(region.canopy - 0.05 * severity * factor, 0.1, 1);
        if (host) {
            host.stress = clamp(host.stress + 24 * severity * factor, 0, 100);
            host.share = Math.max(0, host.share - 4 * factor);
        }
        adjustBiome(region, { diseasePressure: 0.05 * severity, vegetation: -0.02 * severity });
        textMessage = "A fungal epidemic selected " + (host?.label || "a regional host") + " in " + region.name + ".";
    }
    region.canopy = round(region.canopy, 2);
    region.hazards[kind] = { year, severity, loss: Math.max(0, Math.round((beforeCanopy - region.canopy) * 100) + foodLoss) };
    region.species = region.species.slice(0, FOREST_LEGACY_SPECIES_LIMIT);
    region.ageYears = Math.max(0, Math.floor(region.ageYears));
    model.stats.hazards += 1;
    addRing(region, year, 1.1 - severity * 0.42, 0.3 + severity * 0.55, kind);
    addCodex(model, "animal", "disturbance-" + kind, FOREST_LEGACY_HAZARDS[kind].label, region.id, FOREST_LEGACY_HAZARDS[kind].description, year);
    recordHistory(model, "hazard", region.id, textMessage);
    recordAction(model, "hazard", region.id, textMessage);
    return {
        ok: true, kind, region: region.id, year, severity, foodLoss, woodGain,
        canopy: region.canopy, beforeCanopy,
        speciesBefore: beforeSpecies, host: host?.id || null, text: textMessage,
    };
}

function climateInvader(climate) {
    return {
        tropical: "Feral Oil Palm", temperate: "Tree of Heaven", taiga: "Sitka Spruce Escape",
        mountain: "Himalayan Balsam", coastal: "Japanese Knotweed", swamp: "Water Fern",
        mediterranean: "Blue Gum Escape", arid: "Buffel Grass", savanna: "Mesquite",
        northern: "Rhododendron Escape", snow: "Cow Parsley", volcanic: "Mile-a-minute Vine",
    }[climate] || "Tree of Heaven";
}

function advanceSpeciesMigration(model, region, year) {
    const warming = model.climate.warming;
    const upslope = warming > 0.02 ? warming * 8 : warming < -0.02 ? warming * 4 : 0;
    for (const species of livingSpecies(region)) {
        const max = 2200;
        const before = species.elevationM;
        if (upslope > 0 && species.elevationM < max) {
            species.elevationM = Math.min(max, Math.round(species.elevationM + upslope));
            if (species.elevationM > before) species.lastEvent = "migrating upslope";
        }
        if (upslope < 0) species.elevationM = Math.max(60, Math.round(species.elevationM + upslope));
        if (species.elevationM >= max && warming > 0.12) species.stress = clamp(species.stress + 1.5, 0, 100);
        const geneHelp = model.institutions["gene-bank"] * 0.8;
        species.geneticDiversity = round(clamp(species.geneticDiversity + geneHelp * 0.004 - 0.0015, 0.05, 1), 3);
    }
    const cold = livingSpecies(region).sort((a, b) => b.stress - a.stress)[0];
    if (cold && region.elevationM > 1200 && warming > 0.08) cold.stress = clamp(cold.stress + 1.8, 0, 100);
    region.climatePressure = round(clamp(region.climatePressure + Math.max(0, warming) * 9 + (region.typeId && typeIsRare({ label: region.typeLabel }) ? 0.4 : 0), 0, 100), 2);
}

function advanceExtinctionRisk(model, region, year) {
    const seed = model.seed;
    let extinctions = 0;
    for (const species of livingSpecies(region)) {
        const bank = model.institutions["seed-bank"] > 0 || model.institutions["gene-bank"] > 0;
        const base = species.kind === "tree" ? 1.0 : 0.8;
        const support = species.seedBackup || species.geneBackup ? 4 : 0;
        species.stress = clamp(species.stress + base + Math.max(0, model.climate.warming) * 2.5
            - (region.protection === "reserve" ? 3.5 : region.protection === "monument" ? 2.2 : 0)
            - support - species.geneticDiversity * 2 - model.citizenScience * 0.3, 0, 100);
        if (species.kind === "animal" && species.population < 2) species.stress = clamp(species.stress + 2, 0, 100);
        const threshold = species.kind === "animal" ? 78 : FOREST_LEGACY_EXTINCTION_STRESS;
        const roll = unit(seed, hashString(region.id), year, hashString(species.id));
        if (species.stress >= threshold || (species.kind === "animal" && species.population <= 0.4)) {
            if (!bank || roll < 0.22) {
                species.status = "extinct";
                if (species.kind === "tree") species.share = 0;
                species.population = 0;
                species.lastEvent = "local extinction";
                region.extinct += 1;
                model.stats.extinctions += 1;
                extinctions += 1;
                recordHistory(model, "extinction", region.id, species.label + " was lost from " + region.name + ".");
            }
        }
    }
    return extinctions;
}

function advanceHazards(model, region, year) {
    const risk = 0.052 + Math.max(0, model.climate.warming) * 0.055
        + (region.protection === "reserve" ? -0.018 : region.protection === "community" ? -0.008 : 0)
        + (region.rare ? 0.01 : 0);
    const roll = unit(model.seed, hashString(region.id), year, 0x48415244);
    if (roll >= clamp(risk, 0.015, 0.14)) return null;
    const kind = pickHazard(region, model.seed, year);
    return applyForestHazard(region.id, kind, {
        year,
        severity: 0.35 + unit(model.seed, hashString(region.id), year, hashString(kind)) * 0.55,
    });
}

function advanceInstitutions(model, year) {
    const level = id => model.institutions[id] || 0;
    if (level("seed-bank") > 0) {
        model.seedStock = Math.min(FOREST_LEGACY_INSTITUTIONS["seed-bank"].capacity[level("seed-bank") - 1], model.seedStock + level("seed-bank") * 3);
        for (const region of model.regions) {
            const target = livingSpecies(region).filter(species => species.kind === "tree").sort((a, b) => b.stress - a.stress)[0];
            if (target) target.seedBackup = true;
        }
    }
    if (level("gene-bank") > 0) {
        model.geneStock = Math.min(FOREST_LEGACY_INSTITUTIONS["gene-bank"].capacity[level("gene-bank") - 1], model.geneStock + level("gene-bank") * 2);
        for (const region of model.regions) {
            const target = livingSpecies(region).sort((a, b) => b.stress - a.stress)[0];
            if (target) target.geneBackup = true;
        }
    }
    if (level("nursery") > 0) {
        model.seedlings = Math.min(FOREST_LEGACY_INSTITUTIONS.nursery.capacity[level("nursery") - 1], model.seedlings + level("nursery") * 4);
    }
    if (level("museum") > 0) {
        model.museumStock = Math.min(FOREST_LEGACY_INSTITUTIONS.museum.capacity[level("museum") - 1], model.museumStock + level("museum") * 2);
        for (const region of model.regions) {
            const species = livingSpecies(region).find(row => !row.observed);
            if (species) {
                species.observed = true;
                addCodex(model, species.kind, species.id, species.label, region.id, "A museum specimen from " + region.name + ".", year);
            }
        }
    }
    if (model.citizenScience > 0) {
        for (const region of model.regions) {
            region.observations += model.citizenScience;
            const unknown = livingSpecies(region).find(species => !species.observed);
            if (unknown) {
                unknown.observed = true;
                addCodex(model, unknown.kind, unknown.id, unknown.label, region.id, "Recorded by volunteer observers in " + region.name + ".", year);
                model.stats.observations += 1;
            }
        }
    }
}

export function updateForestLegacy() {
    const model = ensureForestLegacy();
    const year = yearNow();
    if (model.lastUpdateYear >= year) return { updated: false, reason: "already-settled", year };
    model.lastUpdateYear = year;
    model.lastYear = year;
    model.climate.drift = getClimateDrift();
    // A centimetre-scale background signal plus the shared hazard drift. The
    // baseline is deliberately small so 25 years is a trend, not a new climate.
    model.climate.warming = round(clamp(model.climate.drift / 20 + Math.max(0, year - 1) * 0.002, -1, 1), 3);
    model.climate.shiftYears += 1;
    let extinctions = 0;
    let hazards = 0;
    for (const region of model.regions) {
        region.ageYears += 1;
        region.phase = stageForAge(region.ageYears, region).id;
        const stage = stageForAge(region.ageYears, region);
        const target = stage.canopy + (region.protection === "reserve" ? 0.03 : 0) + region.afforestation * 0.08;
        region.canopy = round(clamp(region.canopy + (target - region.canopy) * 0.025 - Math.max(0, model.climate.warming) * 0.004, 0.18, 0.98), 3);
        region.climateShift = round(clamp(region.climateShift + model.climate.warming * 0.02, -1.5, 1.5), 3);
        advanceSpeciesMigration(model, region, year);
        const hazard = advanceHazards(model, region, year);
        if (hazard?.ok) hazards += 1;
        extinctions += advanceExtinctionRisk(model, region, year);
        const stress = region.species.length ? region.species.reduce((sum, species) => sum + species.stress, 0) / region.species.length / 100 : 0.2;
        const growth = clamp(1.18 - stress * 0.45 + region.canopy * 0.22 - Math.max(0, model.climate.warming) * 0.18, 0.18, 1.45);
        addRing(region, year, growth, stress, hazard?.kind || null);
        region.species = region.species.slice(0, FOREST_LEGACY_SPECIES_LIMIT);
        region.observations = Math.max(0, region.observations);
        // A protected region is the first candidate for a citizen observation.
        if (model.citizenScience > 0 && region.protection !== "none" && year % 3 === 0) {
            const unknown = livingSpecies(region).find(species => !species.observed);
            if (unknown) {
                unknown.observed = true;
                addCodex(model, unknown.kind, unknown.id, unknown.label, region.id, "Volunteer record from " + region.name + ".", year);
            }
        }
        for (const monument of region.monuments) {
            if (year - monument.year > 0 && year % 25 === 0) recordHistory(model, "monument-anniversary", region.id, monument.label + " has stood " + (year - monument.year + monument.ageYears) + " years.");
        }
    }
    advanceInstitutions(model, year);
    model.stats.extinctions += 0;
    model.stats.rings = model.regions.reduce((sum, region) => sum + region.rings.length, 0);
    evaluateAchievements(model);
    if (hazards || extinctions) {
        try {
            addLog("FOREST LEGACY · " + hazards + " REGIONAL EVENT(S) · " + extinctions + " LOCAL EXTINCTION(S)", "#b9a37a", "forest");
        } catch { /* presentation */ }
    }
    return {
        updated: true, year, hazards, extinctions,
        regions: model.regions.length,
        canopy: round(model.regions.reduce((sum, region) => sum + region.canopy, 0) / Math.max(1, model.regions.length), 3),
        species: model.regions.reduce((sum, region) => sum + livingSpecies(region).length, 0),
    };
}

export function serializeForestLegacyState() {
    const model = ensureForestLegacy();
    const snapshot = {
        version: FOREST_LEGACY_VERSION,
        seed: model.seed,
        lastYear: model.lastYear,
        lastUpdateYear: model.lastUpdateYear,
        revision: model.revision,
        climate: { ...model.climate },
        law: model.law,
        lawYear: model.lawYear,
        institutions: { ...model.institutions },
        citizenScience: model.citizenScience,
        seedStock: model.seedStock,
        geneStock: model.geneStock,
        seedlings: model.seedlings,
        museumStock: model.museumStock,
        regions: model.regions.map(region => ({
            ...region,
            species: region.species.map(species => ({ ...species })),
            rings: region.rings.slice(-FOREST_LEGACY_RING_LIMIT).map(ring => ({ ...ring })),
            monuments: region.monuments.map(monument => ({ ...monument })),
            hazards: Object.fromEntries(Object.entries(region.hazards).map(([key, value]) => [key, { ...value }])),
        })),
        codex: { ...model.codex },
        achievements: { ...model.achievements },
        history: model.history.slice(-FOREST_LEGACY_HISTORY_LIMIT).map(entry => ({ ...entry })),
        actions: model.actions.slice(-FOREST_LEGACY_ACTION_LIMIT).map(entry => ({ ...entry })),
        stats: { ...model.stats },
    };
    // Save and restore use one precision contract. Normalizing the outgoing
    // snapshot too keeps an exact round-trip even when a live annual pass left
    // an unrounded float in a region or cohort field.
    return normalizeModel(snapshot);
}

export function validateForestLegacySnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Save data contains an invalid forest-legacy ledger.");
    if (Number(snapshot.version) !== FOREST_LEGACY_VERSION) throw new Error("Save data contains an unsupported forest-legacy version.");
    if (!Array.isArray(snapshot.regions) || snapshot.regions.length > FOREST_LEGACY_REGION_LIMIT) throw new Error("Save data contains too many forest-legacy regions.");
    if (Number(snapshot.seed) <= 0) throw new Error("Save data contains an invalid forest-legacy seed.");
    for (const region of snapshot.regions) {
        if (!region || typeof region !== "object" || !FOREST_LEGACY_REGION_IDS.includes(String(region.id))) throw new Error("Save data contains an invalid forest-legacy region.");
        if (!Array.isArray(region.species) || region.species.length > FOREST_LEGACY_SPECIES_LIMIT) throw new Error("Save data contains too many forest-legacy species.");
        if (!Array.isArray(region.rings) || region.rings.length > FOREST_LEGACY_RING_LIMIT) throw new Error("Save data contains too many tree rings.");
    }
    if (snapshot.institutions && Object.keys(snapshot.institutions).some(id => !FOREST_LEGACY_INSTITUTION_IDS.includes(id))) throw new Error("Save data contains an unknown forest institution.");
    return true;
}

export function restoreForestLegacyState(snapshot) {
    if (snapshot === undefined || snapshot === null) {
        state.forestLegacy = null;
        return null;
    }
    validateForestLegacySnapshot(snapshot);
    const model = normalizeModel(snapshot);
    if (!model) throw new Error("Save data contains an invalid forest-legacy ledger.");
    state.forestLegacy = ensureCodexMethod(model);
    return state.forestLegacy;
}

export function forestLegacyGuardrails() {
    return FOREST_LEGACY_GUARDRAILS.slice();
}

export const __internals = Object.freeze({
    hash32, unit, stageForAge, typeIsRare, chooseType, linkedBiomeRegion,
    baseState, normalizeModel, climateInvader,
});
