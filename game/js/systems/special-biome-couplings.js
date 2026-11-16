// Cross-system links for the rare-biome atlas.
//
// The atlas itself is tiny (at most twelve regions). This module turns those
// regions into one cached influence profile and a small set of persistent
// decisions: quests, rites and a blight decree. Every consumer reads either the
// cached scalar profile or a single O(1) tile lookup. No per-tick region scan,
// entity scan or pairwise loop is added.
//
// The module deliberately does not import special-biome-state.js. The state
// module owns the atlas and calls the hooks here; this direction prevents a
// cycle while keeping the coupling state inside the same additive save block.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { applyPoliticalEffects } from "./politics.js";
import { RARE_GOODS, SPECIAL_BIOME_FAMILIES, specialBiomeRegionAt } from "../world/special-biomes.js";

export const SPECIAL_BIOME_COUPLING_VERSION = 1;
export const BIOME_QUEST_LIMIT = 6;
export const BIOME_QUEST_ARCHIVE_LIMIT = 12;
export const BIOME_DECISION_HISTORY_LIMIT = 12;

const COUNT_LIMIT = 1_000_000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonNegative = value => Math.max(0, Math.floor(finite(value, 0)));
const positiveYear = value => Math.max(1, Math.floor(finite(value, 1)));
const currentYear = () => positiveYear(state.year);
const currentTick = () => nonNegative(state.tick);

function clean(value, max) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

const QUEST_KINDS = new Set(["survey", "rite", "omen"]);
const QUEST_STATUSES = new Set(["active", "completed", "failed"]);
const BLIGHT_CHOICES = new Set(["quarantine", "purge", "study", "ignore"]);

function emptyInfluence() {
    return Object.freeze({
        signature: "empty",
        discovered: 0,
        attuned: 0,
        rareTypes: 0,
        rareUnits: 0,
        blightPressure: 0,
        nearBlight: 0,
        rites: 0,
        diplomacy: Object.freeze({
            relationDrift: 0, guilds: 0, commons: 0, nobility: 0, clergy: 0,
            tradeValue: 0, label: "No charted biome influence"
        }),
        military: Object.freeze({
            defenderPower: 1, defenderCover: 0, enemyAttrition: 0, casualtyReduction: 0,
            label: "No charted biome influence"
        }),
        city: Object.freeze({
            harvest: 0, production: 0, morale: 0, growthSlots: 0, foodSecurity: 0,
            label: "No charted biome influence"
        }),
        quest: Object.freeze({ omenBias: 0, riteCharge: 0, label: "No charted biome influence" }),
        administration: Object.freeze({
            unrest: 0, legitimacy: 0, blightCost: 0, foodCost: 0,
            label: "No charted biome influence"
        })
    });
}

let influenceCache = { atlas: null, couplings: null, value: null };
const EMPTY_COMBAT = Object.freeze({ region: null, defenderPower: 1, defenderCover: 0, enemyAttrition: 0, casualtyReduction: 0 });
let combatCache = new Map();

export function invalidateSpecialBiomeInfluence() {
    influenceCache = { atlas: null, couplings: null, value: null };
    combatCache = new Map();
}

function normalizeQuest(entry, index) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const kind = QUEST_KINDS.has(entry.kind) ? entry.kind : null;
    if (!kind) return null;
    const status = QUEST_STATUSES.has(entry.status) ? entry.status : "active";
    const regionId = clean(entry.regionId, 48);
    if (!regionId) return null;
    return {
        id: clean(entry.id || "biome-quest-" + (index + 1), 80),
        kind,
        status,
        regionId,
        regionName: clean(entry.regionName || "the charted region", 90),
        family: SPECIAL_BIOME_FAMILIES[entry.family] ? entry.family : "enchanted-wood",
        createdYear: positiveYear(entry.createdYear),
        expiresYear: positiveYear(entry.expiresYear || (positiveYear(entry.createdYear) + 4)),
        resolvedYear: nonNegative(entry.resolvedYear),
        choice: entry.choice ? clean(entry.choice, 32) : null
    };
}

function normalizeDecision(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const regionId = clean(entry.regionId, 48);
    if (!regionId) return null;
    return {
        id: clean(entry.id || "blight-decree", 80),
        regionId,
        regionName: clean(entry.regionName || "the blighted region", 90),
        pressure: clamp(nonNegative(entry.pressure), 0, 6),
        createdYear: positiveYear(entry.createdYear),
        expiresYear: positiveYear(entry.expiresYear || (positiveYear(entry.createdYear) + 1)),
        title: clean(entry.title || "The Blight at the Door", 100),
        demand: clean(entry.demand || "The rot is spreading. The crown must choose a response with a real cost.", 220)
    };
}

function normalizeHistory(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const kind = clean(entry.kind || "biome", 32);
    if (!kind) return null;
    return {
        kind,
        year: positiveYear(entry.year),
        tick: nonNegative(entry.tick),
        regionId: clean(entry.regionId, 48),
        choice: entry.choice ? clean(entry.choice, 32) : null,
        text: clean(entry.text, 220)
    };
}

export function createSpecialBiomeCouplingState(source = {}) {
    const safe = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const quests = (Array.isArray(safe.quests) ? safe.quests : [])
        .map(normalizeQuest).filter(Boolean).slice(0, BIOME_QUEST_ARCHIVE_LIMIT);
    return {
        version: SPECIAL_BIOME_COUPLING_VERSION,
        lastYear: nonNegative(safe.lastYear),
        lastDecisionYear: nonNegative(safe.lastDecisionYear),
        lastQuestYear: nonNegative(safe.lastQuestYear),
        rites: nonNegative(safe.rites),
        omenBias: clamp(finite(safe.omenBias, 0), 0, 4),
        totalQuests: Math.min(COUNT_LIMIT, nonNegative(safe.totalQuests)),
        completedQuests: Math.min(COUNT_LIMIT, nonNegative(safe.completedQuests)),
        failedQuests: Math.min(COUNT_LIMIT, nonNegative(safe.failedQuests)),
        totalBlightDecisions: Math.min(COUNT_LIMIT, nonNegative(safe.totalBlightDecisions)),
        ignoredBlightDecisions: Math.min(COUNT_LIMIT, nonNegative(safe.ignoredBlightDecisions)),
        blightActions: {
            quarantine: Math.min(COUNT_LIMIT, nonNegative(safe.blightActions?.quarantine)),
            purge: Math.min(COUNT_LIMIT, nonNegative(safe.blightActions?.purge)),
            study: Math.min(COUNT_LIMIT, nonNegative(safe.blightActions?.study)),
            ignore: Math.min(COUNT_LIMIT, nonNegative(safe.blightActions?.ignore))
        },
        quests,
        blightDecision: normalizeDecision(safe.blightDecision),
        history: (Array.isArray(safe.history) ? safe.history : []).map(normalizeHistory).filter(Boolean).slice(0, BIOME_DECISION_HISTORY_LIMIT)
    };
}

export function normalizeSpecialBiomeCouplingState(source) {
    const couplings = createSpecialBiomeCouplingState(source);
    if (state.specialBiomes && typeof state.specialBiomes === "object") {
        state.specialBiomes.couplings = couplings;
    }
    invalidateSpecialBiomeInfluence();
    return couplings;
}

export function validateSpecialBiomeCouplingState(source) {
    if (source === undefined || source === null) return;
    if (typeof source !== "object" || Array.isArray(source)) throw new Error("special-biome couplings must be an object");
    if (source.version !== undefined && Number(source.version) !== SPECIAL_BIOME_COUPLING_VERSION) {
        throw new Error("unsupported special-biome coupling version");
    }
    if (source.quests !== undefined && (!Array.isArray(source.quests) || source.quests.length > BIOME_QUEST_ARCHIVE_LIMIT)) {
        throw new Error("special-biome quests must be a bounded array");
    }
    if (source.blightDecision !== undefined && source.blightDecision !== null
        && (typeof source.blightDecision !== "object" || Array.isArray(source.blightDecision))) {
        throw new Error("special-biome blight decision must be an object");
    }
    if (Array.isArray(source.quests)) {
        for (const quest of source.quests) {
            if (!quest || typeof quest !== "object" || !QUEST_KINDS.has(quest.kind)) {
                throw new Error("special-biome quest has an unknown kind");
            }
            if (!SPECIAL_BIOME_FAMILIES[quest.family]) throw new Error("special-biome quest has an unknown family");
        }
    }
    if (source.blightDecision) {
        if (!clean(source.blightDecision.regionId, 48)) throw new Error("special-biome blight decision has no region");
        if (!Number.isFinite(Number(source.blightDecision.pressure))) {
            throw new Error("special-biome blight decision pressure is invalid");
        }
    }
    if (source.history !== undefined && (!Array.isArray(source.history) || source.history.length > BIOME_DECISION_HISTORY_LIMIT)) {
        throw new Error("special-biome coupling history must be bounded");
    }
}

function ensureCouplings() {
    const atlas = state.specialBiomes;
    if (!atlas) return null;
    if (!atlas.couplings || typeof atlas.couplings !== "object" || Array.isArray(atlas.couplings)) {
        atlas.couplings = createSpecialBiomeCouplingState();
        invalidateSpecialBiomeInfluence();
    }
    return atlas.couplings;
}

function keepPosition() {
    const keep = state.entities?.find(entity => !entity.dead && entity.isBuilding?.() && entity.type === 1);
    return keep ? { x: keep.x, y: keep.y } : { x: (Number(state.worldW) || 1) / 2, y: (Number(state.worldH) || 1) / 2 };
}

function regionAt(x, y) {
    if (!state.specialBiomeMap || !state.specialBiomes?.regions?.length) return null;
    const index = specialBiomeRegionAt(state.specialBiomeMap, state.worldW, x, y);
    return index ? state.specialBiomes.regions[index - 1] || null : null;
}

function atlasProfile() {
    const atlas = state.specialBiomes;
    const couplings = atlas?.couplings || null;
    if (!atlas || !Array.isArray(atlas.regions) || !atlas.regions.length) return emptyInfluence();
    const heart = keepPosition();
    let discovered = 0;
    let attuned = 0;
    let blightPressure = 0;
    let nearBlight = 0;
    let rareTypes = 0;
    let rareUnits = 0;
    const families = {};
    for (const region of atlas.regions) {
        if (!region || !region.discovered) continue;
        discovered++;
        families[region.family] = (families[region.family] || 0) + 1;
        if (region.attuned) attuned++;
        const blight = region.family === "blighted-land" && !region.cleansed ? Math.max(1, region.spread) : 0;
        blightPressure += blight;
        const distance = Math.hypot(region.x - heart.x, region.y - heart.y);
        if (blight && distance <= 24) nearBlight += blight;
    }
    for (const id of Object.keys(RARE_GOODS)) {
        const count = Math.max(0, finite(atlas.rareGoods?.[id]));
        if (count > 0) rareTypes++;
        rareUnits += count;
    }
    const rites = Math.min(8, Math.max(0, finite(couplings?.rites)));
    const rareTrade = Math.min(0.8, rareTypes * 0.06 + Math.log1p(rareUnits) * 0.05);
    const attuneScale = Math.min(6, attuned);
    const discoveredScale = Math.min(8, discovered);
    const blightScale = Math.min(18, blightPressure);
    const signature = [atlas.seed, discovered, attuned, blightPressure, nearBlight, rareTypes, rareUnits, rites,
        ...atlas.regions.map(region => region.discovered ? region.family + ":" + Number(region.attuned) + ":" + Number(region.cleansed) + ":" + Number(region.spread) : "-")].join("|");

    const diplomacy = {
        relationDrift: round2(0.16 * attuneScale + 0.035 * discoveredScale + rareTrade - 0.055 * blightScale),
        guilds: round2(0.14 * attuneScale + 0.10 * rareTypes - 0.035 * nearBlight),
        commons: round2(0.08 * discoveredScale + 0.05 * attuneScale - 0.06 * nearBlight),
        nobility: round2(0.05 * discoveredScale - 0.045 * nearBlight + 0.03 * attuneScale),
        clergy: round2(0.10 * attuneScale + 0.04 * (families["enchanted-wood"] || 0) + 0.04 * (families["mist-moor"] || 0)),
        tradeValue: round2(rareTrade + attuned * 0.10),
        label: discovered ? discovered + " charted region" + (discovered === 1 ? "" : "s") + " shape the courts" : "No charted biome influence"
    };
    const military = {
        defenderPower: round2(1 + Math.min(0.24, 0.025 * attuned + 0.005 * discovered) + Math.min(0.08, nearBlight * 0.006)),
        defenderCover: round2(Math.min(0.22, 0.012 * attuned + 0.004 * discovered + 0.008 * nearBlight)),
        enemyAttrition: round2(Math.min(3, 0.10 * blightPressure + 0.025 * discovered + (families["ash-shadow"] || 0) * 0.18)),
        casualtyReduction: round2(Math.min(0.16, 0.012 * attuned + 0.004 * discovered + 0.006 * (families["enchanted-wood"] || 0))),
        label: discovered ? "Biome terrain favours the defender; blight and ash bleed attackers" : "No charted biome influence"
    };
    const city = {
        harvest: round2(clamp(0.018 * attuned + 0.003 * discovered - 0.010 * blightScale, -0.12, 0.18)),
        production: round2(clamp(0.016 * attuned + 0.002 * discovered - 0.008 * blightScale, -0.10, 0.15)),
        morale: round2(clamp(0.10 * attuned - 0.035 * nearBlight + 0.03 * rites, -0.8, 0.9)),
        growthSlots: attuned >= 4 ? 2 : attuned >= 1 ? 1 : 0,
        foodSecurity: round2(clamp(0.02 * (families["fungal-wilds"] || 0) + 0.015 * attuned - 0.02 * nearBlight, -0.1, 0.12)),
        label: discovered ? "Biome harvest, production and household growth are linked" : "No charted biome influence"
    };
    const quest = {
        omenBias: round2(Math.min(2, 0.20 * (families["magic-mountains"] || 0) + 0.15 * (families["mist-moor"] || 0) + 0.08 * discovered)),
        riteCharge: rites,
        label: discovered ? "Charted wonders can open survey and rite quests" : "No charted biome influence"
    };
    const administration = {
        unrest: round2(clamp(0.006 * nearBlight + 0.002 * blightPressure - 0.003 * attuned, 0, 0.20)),
        legitimacy: round2(clamp(0.04 * attuned + 0.02 * rites - 0.05 * nearBlight, -0.4, 0.5)),
        blightCost: round2(4 + nearBlight * 1.4),
        foodCost: round2(2 + nearBlight * 0.8),
        label: discovered ? "Blight pressure reaches the royal administration" : "No charted biome influence"
    };
    return Object.freeze({
        signature,
        discovered,
        attuned,
        rareTypes,
        rareUnits,
        blightPressure,
        nearBlight,
        rites,
        families: Object.freeze({ ...families }),
        diplomacy: Object.freeze(diplomacy),
        military: Object.freeze(military),
        city: Object.freeze(city),
        quest: Object.freeze(quest),
        administration: Object.freeze(administration)
    });
}

export function getSpecialBiomeInfluence() {
    const atlas = state.specialBiomes;
    if (!atlas) return emptyInfluence();
    const couplings = atlas.couplings || null;
    if (influenceCache.atlas === atlas && influenceCache.couplings === couplings && influenceCache.value) {
        return influenceCache.value;
    }
    const value = atlasProfile();
    influenceCache = { atlas, couplings, value };
    return value;
}

// O(1) battlefield query. The global profile is cached; this function only
// reads the one-byte atlas and the region's scalar fields.
export function getBiomeCombatModifiersAt(x, y) {
    const region = regionAt(x, y);
    if (!region || !region.discovered) return EMPTY_COMBAT;
    const cached = combatCache.get(region);
    if (cached) return cached;
    const blight = region.family === "blighted-land" && !region.cleansed ? Math.max(1, region.spread) : 0;
    const value = Object.freeze({
        region,
        defenderPower: 1 + (region.attuned ? 0.06 : 0.01) + (region.family === "magic-mountains" ? 0.02 : 0),
        defenderCover: Math.min(0.2, (region.attuned ? 0.07 : 0.025) + blight * 0.012),
        enemyAttrition: Math.min(2.5, (region.family === "ash-shadow" || region.family === "blighted-land" ? 0.45 : 0.08) + blight * 0.22),
        casualtyReduction: Math.min(0.14, (region.attuned ? 0.045 : 0.01) + (region.family === "enchanted-wood" ? 0.02 : 0))
    });
    combatCache.set(region, value);
    return value;
}

function pushCouplingHistory(kind, region, text, choice = null) {
    const couplings = ensureCouplings();
    if (!couplings) return;
    couplings.history.unshift({
        kind,
        year: currentYear(),
        tick: currentTick(),
        regionId: region?.id || "",
        choice: choice || null,
        text: clean(text, 220)
    });
    if (couplings.history.length > BIOME_DECISION_HISTORY_LIMIT) couplings.history.length = BIOME_DECISION_HISTORY_LIMIT;
}

function addRareGood(id, amount) {
    const atlas = state.specialBiomes;
    if (!atlas?.rareGoods || !RARE_GOODS[id]) return;
    atlas.rareGoods[id] = Math.min(COUNT_LIMIT, Math.max(0, finite(atlas.rareGoods[id]) + amount));
}

function spendRareGood(id, amount) {
    const atlas = state.specialBiomes;
    if (!atlas?.rareGoods || !RARE_GOODS[id]) return false;
    if (finite(atlas.rareGoods[id]) < amount) return false;
    atlas.rareGoods[id] -= amount;
    return true;
}

function spendResources(cost) {
    if (!cost) return true;
    for (const key of ["gold", "food", "wood", "stone"]) {
        if (finite(cost[key]) > 0 && finite(state.resources?.[key]) < finite(cost[key])) return false;
    }
    for (const key of ["gold", "food", "wood", "stone"]) {
        if (finite(cost[key]) > 0) state.resources[key] = Math.max(0, finite(state.resources[key]) - finite(cost[key]));
    }
    return true;
}

function questChoices(kind, region) {
    if (kind === "survey") {
        return [
            { id: "survey", label: "SURVEY & GATHER", detail: "4 food + 2 gold · reward 2 rare goods", cost: { food: 4, gold: 2 }, rareReward: 2 },
            { id: "seal", label: "SEAL THE SITE", detail: "6 gold · legitimacy +1", cost: { gold: 6 }, legitimacy: 1 }
        ];
    }
    if (kind === "rite") {
        return [
            { id: "perform", label: "PERFORM THE RITE", detail: "6 gold + 1 rare good · morale +2", cost: { gold: 6 }, rareCost: 1 },
            { id: "refuse", label: "REFUSE THE RITE", detail: "No cost · legitimacy -1", cost: {}, legitimacy: -1 }
        ];
    }
    return [
        { id: "follow", label: "FOLLOW THE OMEN", detail: "3 food", cost: { food: 3 }, gold: 10 },
        { id: "ignore", label: "KEEP TO THE ROAD", detail: "No cost · morale -0.5", cost: {}, morale: -0.5 }
    ];
}

export function biomeQuestChoices(quest) {
    if (!quest) return [];
    return questChoices(quest.kind, state.specialBiomes?.regions.find(region => region.id === quest.regionId) || null);
}

function beginQuest(kind, region, title) {
    const couplings = ensureCouplings();
    const atlas = state.specialBiomes;
    if (!couplings || !atlas || !region) return null;
    const active = couplings.quests.filter(quest => quest.status === "active");
    if (active.some(quest => quest.regionId === region.id && quest.kind === kind)) return null;
    if (active.length >= BIOME_QUEST_LIMIT) return null;
    const year = currentYear();
    const quest = {
        id: "biome-quest:" + region.id + ":" + kind + ":" + year,
        kind,
        status: "active",
        regionId: region.id,
        regionName: region.name,
        family: region.family,
        createdYear: year,
        expiresYear: year + 4,
        resolvedYear: 0,
        choice: null
    };
    couplings.quests.unshift(quest);
    couplings.quests = couplings.quests.slice(0, BIOME_QUEST_ARCHIVE_LIMIT);
    couplings.totalQuests++;
    couplings.lastQuestYear = year;
    pushCouplingHistory("quest", region, title + " opened.");
    addLog("ATLAS QUEST · " + title.toUpperCase(), "#d8bd82", "exploration");
    invalidateSpecialBiomeInfluence();
    return quest;
}

export function onSpecialBiomeDiscovered(region) {
    if (!region) return null;
    beginQuest("survey", region, "The Survey of " + region.name);
    if (region.family === "magic-mountains" || region.family === "mist-moor") {
        beginQuest("omen", region, "An Omen at " + region.name);
    }
    return true;
}

export function onSpecialBiomeAttuned(region) {
    if (!region) return null;
    return beginQuest("rite", region, "The Rite of " + region.name);
}

export function onSpecialBiomeCleansed(region) {
    if (!region) return null;
    const couplings = ensureCouplings();
    if (couplings) {
        couplings.rites = Math.min(8, couplings.rites + 1);
        pushCouplingHistory("cleanse", region, "The blight was cut out; a rite of thanks followed.");
    }
    invalidateSpecialBiomeInfluence();
    return true;
}

export function resolveBiomeQuest(questId, choiceId) {
    const couplings = ensureCouplings();
    const atlas = state.specialBiomes;
    if (!couplings || !atlas) return { ok: false, reason: "atlas-unavailable" };
    const quest = couplings.quests.find(entry => entry.id === String(questId));
    if (!quest || quest.status !== "active") return { ok: false, reason: "quest-not-active" };
    if (quest.expiresYear < currentYear()) return { ok: false, reason: "quest-expired" };
    const choice = questChoices(quest.kind, atlas.regions.find(region => region.id === quest.regionId))
        .find(entry => entry.id === String(choiceId));
    if (!choice) return { ok: false, reason: "unknown-quest-choice" };
    const region = atlas.regions.find(entry => entry.id === quest.regionId);
    const rareId = region?.resource;
    if (choice.rareCost && (!rareId || finite(atlas.rareGoods[rareId]) < choice.rareCost)) {
        return { ok: false, reason: "not-enough-rare-goods" };
    }
    if (!spendResources(choice.cost)) return { ok: false, reason: "not-enough-resources" };
    if (choice.rareCost) spendRareGood(rareId, choice.rareCost);
    if (choice.gold) {
        state.resources.gold = Math.min(999999, finite(state.resources.gold) + choice.gold);
    }
    if (choice.rareReward) addRareGood(rareId, choice.rareReward);
    if (choice.legitimacy) {
        const politics = state.politics || (state.politics = { legitimacy: 65, factions: {} });
        politics.legitimacy = clamp(finite(politics.legitimacy, 65) + choice.legitimacy, 0, 100);
    }
    if (choice.morale) state.morale = clamp(finite(state.morale, 0) + choice.morale, 0, 100);
    if (quest.kind === "rite" && choice.id === "perform") {
        couplings.rites = Math.min(8, couplings.rites + 1);
        state.morale = clamp(finite(state.morale, 0) + 2, 0, 100);
        const politics = state.politics || (state.politics = { legitimacy: 65, factions: {} });
        politics.legitimacy = clamp(finite(politics.legitimacy, 65) + 1, 0, 100);
        applyPoliticalEffects({ clergy: 0.8, legitimacy: 0.2 });
    }
    quest.status = "completed";
    quest.resolvedYear = currentYear();
    quest.choice = choice.id;
    couplings.completedQuests++;
    pushCouplingHistory("quest", region, quest.regionName + " resolved: " + choice.label + ".", choice.id);
    addLog("ATLAS QUEST RESOLVED · " + quest.regionName.toUpperCase() + " · " + choice.label.toUpperCase(), "#d8bd82", "exploration");
    invalidateSpecialBiomeInfluence();
    return { ok: true, quest: { ...quest }, choice: choice.id, influence: getSpecialBiomeInfluence() };
}

export function getBiomeQuestSnapshot() {
    const couplings = ensureCouplings();
    if (!couplings) return { quests: [], active: 0, completed: 0, failed: 0, rites: 0 };
    return {
        quests: couplings.quests.map(quest => ({
            ...quest,
            choices: quest.status === "active" ? questChoices(quest.kind, state.specialBiomes?.regions.find(region => region.id === quest.regionId)) : []
        })),
        active: couplings.quests.filter(quest => quest.status === "active").length,
        completed: couplings.completedQuests,
        failed: couplings.failedQuests,
        rites: couplings.rites
    };
}

export function blightChoices() {
    return [
        { id: "quarantine", label: "QUARANTINE", detail: "10 food + 5 gold · pressure -1 · morale +0.5", cost: { food: 10, gold: 5 } },
        { id: "purge", label: "BURN THE ROT", detail: "15 wood + 8 gold · pressure -2 · legitimacy +1", cost: { wood: 15, gold: 8 } },
        { id: "study", label: "STUDY THE BLIGHT", detail: "12 gold · pressure unchanged · +3 resin", cost: { gold: 12 } },
        { id: "ignore", label: "LEAVE IT", detail: "No cost · pressure +1 · morale -2 · legitimacy -1", cost: {} }
    ];
}

export function getBlightDecisionSnapshot() {
    const couplings = ensureCouplings();
    if (!couplings?.blightDecision) return null;
    return {
        ...couplings.blightDecision,
        choices: blightChoices()
    };
}

function createBlightDecision() {
    const couplings = ensureCouplings();
    const atlas = state.specialBiomes;
    if (!couplings || !atlas) return null;
    if (couplings.blightDecision) return couplings.blightDecision;
    const year = currentYear();
    if (couplings.lastDecisionYear >= year) return null;
    const candidates = atlas.regions.filter(region => region.discovered && region.family === "blighted-land" && !region.cleansed && region.spread >= 2);
    if (!candidates.length) return null;
    const region = candidates.sort((a, b) => b.spread - a.spread || a.id.localeCompare(b.id))[0];
    const decision = {
        id: "blight-decree:" + region.id + ":" + year,
        regionId: region.id,
        regionName: region.name,
        pressure: region.spread,
        createdYear: year,
        expiresYear: year + 1,
        title: "The Blight at " + region.name,
        demand: "The rot is at pressure " + region.spread + " / 6. Quarantine, purge, study or ignore it before the next year."
    };
    couplings.blightDecision = decision;
    couplings.lastDecisionYear = year;
    couplings.totalBlightDecisions++;
    pushCouplingHistory("decree", region, "A blight decree was laid before the crown at pressure " + region.spread + ".");
    addLog("BLIGHT DECREE · " + region.name.toUpperCase() + " · THE CROWN MUST CHOOSE", "#d8a25d", "politics");
    invalidateSpecialBiomeInfluence();
    return decision;
}

function expireBlightDecision() {
    const couplings = ensureCouplings();
    if (!couplings?.blightDecision) return false;
    if (currentYear() < couplings.blightDecision.expiresYear) return false;
    const decision = couplings.blightDecision;
    const region = state.specialBiomes?.regions.find(entry => entry.id === decision.regionId);
    couplings.blightDecision = null;
    couplings.lastDecisionYear = currentYear();
    couplings.ignoredBlightDecisions++;
    couplings.blightActions.ignore++;
    if (region) region.spread = Math.min(6, region.spread + 1);
    state.morale = clamp(finite(state.morale, 0) - 2, 0, 100);
    applyPoliticalEffects({ legitimacy: -1, commons: -1.2 });
    pushCouplingHistory("decree", region, "The crown let the blight decree expire; the rot spread.", "expire");
    addLog("THE BLIGHT DECREE EXPIRED — " + decision.regionName.toUpperCase() + " SPREADS", "#c77c62", "politics");
    invalidateSpecialBiomeInfluence();
    return true;
}

export function resolveBlightDecision(choiceId) {
    const couplings = ensureCouplings();
    const decision = couplings?.blightDecision;
    if (!couplings || !decision) return { ok: false, reason: "no-blight-decision" };
    if (!BLIGHT_CHOICES.has(choiceId)) return { ok: false, reason: "unknown-blight-choice" };
    const region = state.specialBiomes?.regions.find(entry => entry.id === decision.regionId);
    if (!region) return { ok: false, reason: "blight-region-missing" };
    const choice = blightChoices().find(entry => entry.id === choiceId);
    if (!spendResources(choice.cost)) return { ok: false, reason: "not-enough-resources" };
    if (choiceId === "quarantine") {
        region.spread = Math.max(0, region.spread - 1);
        state.morale = clamp(finite(state.morale, 0) + 0.5, 0, 100);
        applyPoliticalEffects({ legitimacy: 0.4, commons: 0.3 });
    } else if (choiceId === "purge") {
        region.spread = Math.max(0, region.spread - 2);
        state.morale = clamp(finite(state.morale, 0) - 1, 0, 100);
        applyPoliticalEffects({ legitimacy: 1, commons: -0.4 });
    } else if (choiceId === "study") {
        addRareGood("blight-resin", 3);
        couplings.omenBias = Math.min(4, couplings.omenBias + 1);
        applyPoliticalEffects({ guilds: 0.4, legitimacy: -0.1 });
    } else {
        region.spread = Math.min(6, region.spread + 1);
        state.morale = clamp(finite(state.morale, 0) - 2, 0, 100);
        applyPoliticalEffects({ legitimacy: -1, commons: -1 });
        couplings.ignoredBlightDecisions++;
    }
    couplings.blightActions[choiceId]++;
    couplings.blightDecision = null;
    pushCouplingHistory("decree", region, decision.regionName + " answered: " + choice.label + ".", choiceId);
    addLog("BLIGHT DECREE ANSWERED · " + choice.label.toUpperCase() + " · " + region.name.toUpperCase(), "#d8bd82", "politics");
    invalidateSpecialBiomeInfluence();
    return { ok: true, choice: choiceId, region: { ...region }, snapshot: getBlightDecisionSnapshot() };
}

// Bounded annual settlement. Called once after the rare-good yield pass.
export function updateSpecialBiomeCouplings() {
    const couplings = ensureCouplings();
    if (!couplings) return null;
    const year = currentYear();
    if (couplings.lastYear === year) return couplings;
    couplings.lastYear = year;
    const atlas = state.specialBiomes;
    const influence = getSpecialBiomeInfluence();

    for (const quest of couplings.quests) {
        if (quest.status !== "active" || quest.expiresYear >= year) continue;
        quest.status = "failed";
        quest.resolvedYear = year;
        couplings.failedQuests++;
        state.morale = clamp(finite(state.morale, 0) - 0.5, 0, 100);
        pushCouplingHistory("quest", atlas?.regions.find(region => region.id === quest.regionId), quest.regionName + " was left unanswered.");
    }
    expireBlightDecision();
    createBlightDecision();

    if (influence.city.morale) state.morale = clamp(finite(state.morale, 0) + influence.city.morale, 0, 100);
    if (influence.administration.legitimacy) {
        const politics = state.politics || (state.politics = { legitimacy: 65, factions: {} });
        politics.legitimacy = clamp(finite(politics.legitimacy, 65) + influence.administration.legitimacy, 0, 100);
    }
    if (influence.administration.unrest > 0.08 && state.realmCycle) {
        state.realmCycle.unrest = clamp(finite(state.realmCycle.unrest) + influence.administration.unrest, 0, 1);
    }
    invalidateSpecialBiomeInfluence();
    return couplings;
}

export function getBiomeCouplingState() {
    return ensureCouplings();
}

export const __internals = { atlasProfile, createBlightDecision, expireBlightDecision, keepPosition };
