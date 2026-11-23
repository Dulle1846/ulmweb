// Authored start conditions for the founding screen.
//
// A scenario is deliberately a small, saveable data contract. It changes the
// opening date, stores, morale and legitimacy, then hands one objective to the
// existing simulation. It does not replace world generation, identity or any
// neighbouring system; those systems remain the source of the numbers the
// objective reads.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { queueMessage } from "../core/presentation-effects.js";
import { recordLegacy } from "./legacy.js";
import { TYPE } from "../core/types.js";

export const SCENARIO_VERSION = 1;
export const SCENARIO_FREE_ID = "free-realm";
export const SCENARIO_HISTORY_LIMIT = 12;
export const SCENARIO_RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold", "food"]);
export const SCENARIO_SEASONS = Object.freeze(["spring", "summer", "autumn", "winter"]);
export const SCENARIO_DIFFICULTIES = Object.freeze(["FREE", "STORY", "NORMAL", "HARD", "SEVERE", "CUSTOM"]);
export const SCENARIO_CLIMATES = Object.freeze([
    "temperate", "northern", "taiga", "tundra", "savanna", "swamp", "mountain",
    "volcanic", "coastal", "snow", "mediterranean", "arid", "enchanted", "tropical"
]);

export const SCENARIO_OBJECTIVES = Object.freeze({
    food: Object.freeze({ label: "Fill the granary", unit: "food", max: 9999, defaultTarget: 150, description: "Keep enough food in the royal store for the people who will eat through the next season." }),
    population: Object.freeze({ label: "Grow the realm", unit: "residents", max: 420, defaultTarget: 18, description: "Raise the number of living residents in the realm." }),
    legitimacy: Object.freeze({ label: "Win consent", unit: "legitimacy", max: 100, defaultTarget: 60, description: "Restore the crown's standing with the factions of the realm." }),
    regions: Object.freeze({ label: "Survey the frontier", unit: "regions", max: 36, defaultTarget: 6, description: "Reveal and survey distinct biome regions on the world map." })
});

const DEFAULT_STORES = Object.freeze({ wood: 180, stone: 95, gold: 75, food: 120 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min, max, fallback = min) => clamp(Math.floor(Number(value) || fallback), min, max);
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function stores(input = DEFAULT_STORES) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const result = {};
    for (const key of SCENARIO_RESOURCE_KEYS) {
        result[key] = integer(has(source, key) ? source[key] : DEFAULT_STORES[key], 0, 9999, 0);
    }
    return result;
}

function effects(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const result = {};
    for (const key of SCENARIO_RESOURCE_KEYS) {
        const value = Math.floor(Number(source[key]) || 0);
        if (value) result[key] = clamp(value, -9999, 9999);
    }
    const morale = Math.floor(Number(source.morale) || 0);
    const legitimacy = Math.floor(Number(source.legitimacy) || 0);
    if (morale) result.morale = clamp(morale, -100, 100);
    if (legitimacy) result.legitimacy = clamp(legitimacy, -100, 100);
    return result;
}

function seasonFromDay(day) {
    return Math.floor((((Number(day) || 0) % 400) + 400) % 400 / 100) % 4;
}

function deadlineAbsolute(objective) {
    return objective.deadlineYear * 400 + objective.deadlineDay;
}

function deadlineLabel(objective) {
    const season = SCENARIO_SEASONS[seasonFromDay(objective.deadlineDay)] || "spring";
    return (season.charAt(0).toUpperCase() + season.slice(1)) + ", year " + objective.deadlineYear;
}

function shortDeadline(objective) {
    const season = SCENARIO_SEASONS[seasonFromDay(objective.deadlineDay)] || "spring";
    return season.toUpperCase() + " · YEAR " + objective.deadlineYear;
}

function objectiveLabel(type, target, deadline) {
    const meta = SCENARIO_OBJECTIVES[type];
    const name = meta?.unit || "target";
    const goal = type === "legitimacy"
        ? "Reach " + target + " legitimacy"
        : type === "regions"
            ? "Survey " + target + " biome regions"
            : type === "population"
                ? "Grow the realm to " + target + " residents"
                : "Store " + target + " food";
    return goal + " by " + deadlineLabel(deadline) + ".";
}

function normalizeObjective(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const type = has(SCENARIO_OBJECTIVES, input.type) ? input.type : "food";
    const meta = SCENARIO_OBJECTIVES[type];
    const target = integer(input.target, 1, meta.max, meta.defaultTarget);
    const deadlineYear = integer(input.deadlineYear, 1, 25, 2);
    const deadlineDay = integer(input.deadlineDay, 0, 399, 0);
    return { type, target, deadlineYear, deadlineDay };
}

function normalizeDefinition(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const id = clean(source.id, 64);
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error("Scenario id is invalid.");
    const name = clean(source.name, 40);
    if (!name) throw new Error("Scenario name is required.");
    const description = clean(source.description, 220);
    if (!description) throw new Error("Scenario briefing is required.");
    const difficulty = SCENARIO_DIFFICULTIES.includes(source.difficulty) ? source.difficulty : "CUSTOM";
    const recommendedClimate = SCENARIO_CLIMATES.includes(source.recommendedClimate) ? source.recommendedClimate : "temperate";
    const startDay = integer(source.startDay, 0, 399, 0);
    const startSeason = seasonFromDay(startDay);
    const objective = normalizeObjective(source.objective);
    if (!objective) throw new Error("A scenario needs an objective.");
    if (deadlineAbsolute(objective) <= 400 + startDay) throw new Error("The scenario deadline must fall after its opening.");
    const free = id === SCENARIO_FREE_ID;
    return {
        version: SCENARIO_VERSION,
        id,
        name,
        description,
        difficulty: free ? "FREE" : difficulty,
        recommendedClimate,
        startSeason,
        startDay,
        resources: stores(source.resources),
        morale: integer(source.morale, 0, 100, 65),
        legitimacy: integer(source.legitimacy, 0, 100, 65),
        objective: free ? null : objective,
        reward: free ? {} : effects(source.reward),
        failure: free ? {} : effects(source.failure)
    };
}

function freeDefinition() {
    return normalizeDefinition({
        id: SCENARIO_FREE_ID,
        name: "Free Realm",
        description: "The classic open founding. No authored deadline, no altered stores: shape the realm exactly as the world forge presents it.",
        difficulty: "FREE",
        recommendedClimate: "temperate",
        startDay: 0,
        resources: DEFAULT_STORES,
        morale: 65,
        legitimacy: 65,
        objective: { type: "food", target: 1, deadlineYear: 2, deadlineDay: 0 },
        reward: {},
        failure: {}
    });
}

const PRESET_BLUEPRINTS = [
    {
        id: "first-winter",
        name: "The First Winter",
        description: "A northern autumn is already old. The first snow is close, the granary is thin, and every bundle of firewood must be earned before spring. This is a survival opening, not a gentle tutorial.",
        difficulty: "HARD",
        recommendedClimate: "northern",
        startDay: 200,
        resources: { wood: 130, stone: 75, gold: 70, food: 70 },
        morale: 60,
        legitimacy: 52,
        objective: { type: "food", target: 150, deadlineYear: 2, deadlineDay: 0 },
        reward: { food: 80, gold: 30, morale: 4, legitimacy: 3 },
        failure: { morale: -8 }
    },
    {
        id: "empty-granary",
        name: "The Empty Granary",
        description: "The harvest failed, but the treasury did not. The streets are full, the stores are almost bare, and winter is the only creditor who cannot be postponed. Turn coin and fields into bread before the cold arrives.",
        difficulty: "SEVERE",
        recommendedClimate: "temperate",
        startDay: 100,
        resources: { wood: 180, stone: 120, gold: 240, food: 20 },
        morale: 62,
        legitimacy: 58,
        objective: { type: "food", target: 180, deadlineYear: 1, deadlineDay: 299 },
        reward: { food: 60, gold: 40, morale: 3 },
        failure: { morale: -10 }
    },
    {
        id: "broken-crown",
        name: "The Broken Crown",
        description: "The succession is disputed before the old sovereign is cold. The factions have taken their sides, the treasury is pledged, and the new crown must earn consent one appointment, tax and judgement at a time.",
        difficulty: "HARD",
        recommendedClimate: "temperate",
        startDay: 200,
        resources: { wood: 110, stone: 90, gold: 45, food: 95 },
        morale: 52,
        legitimacy: 26,
        objective: { type: "legitimacy", target: 60, deadlineYear: 2, deadlineDay: 0 },
        reward: { legitimacy: 6, gold: 25, morale: 4 },
        failure: { morale: -12, legitimacy: -4 }
    },
    {
        id: "green-frontier",
        name: "The Green Frontier",
        description: "One hall stands in an old forest. The soil is thin but the timber is deep, and the surveyors have not yet put a name to the valleys beyond the clearing. A realm that never looks outward will never grow.",
        difficulty: "NORMAL",
        recommendedClimate: "temperate",
        startDay: 0,
        resources: { wood: 140, stone: 60, gold: 90, food: 100 },
        morale: 68,
        legitimacy: 55,
        objective: { type: "regions", target: 6, deadlineYear: 2, deadlineDay: 0 },
        reward: { wood: 60, gold: 20, morale: 3 },
        failure: { morale: -5 }
    }
];

export const SCENARIO_PRESETS = Object.freeze(Object.fromEntries([
    [SCENARIO_FREE_ID, freeDefinition()],
    ...PRESET_BLUEPRINTS.map(definition => [definition.id, normalizeDefinition(definition)])
]));
export const SCENARIO_PRESET_LIST = Object.freeze([
    SCENARIO_PRESETS[SCENARIO_FREE_ID],
    ...PRESET_BLUEPRINTS.map(definition => SCENARIO_PRESETS[definition.id])
]);

export function createScenarioDefinition(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const id = clean(source.id, 64) || "custom-" + Date.now().toString(36);
    return normalizeDefinition({ ...source, id });
}

export function createCustomScenario(input = {}) {
    return createScenarioDefinition({
        ...input,
        id: clean(input.id, 64) || "custom-" + Date.now().toString(36),
        difficulty: "CUSTOM"
    });
}

export function validateScenarioDefinition(input) {
    normalizeDefinition(input);
    return true;
}

export function getScenarioCurrentValue(type) {
    if (type === "food") return Math.max(0, Math.floor(Number(state.resources?.food) || 0));
    if (type === "population") {
        const registered = Math.floor(Number(state.population?.totals?.population));
        if (Number.isFinite(registered) && registered >= 0) return registered;
        return state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    }
    if (type === "legitimacy") return Math.max(0, Math.floor(Number(state.politics?.legitimacy) || 0));
    if (type === "regions") return Array.isArray(state.biomeAtlas?.regions)
        ? state.biomeAtlas.regions.filter(region => region.discovered).length
        : 0;
    return 0;
}

function calculateProgress(scenario) {
    if (!scenario?.objective) return 0;
    return Math.max(0, Math.min(1, (Number(scenario.current) || 0) / Math.max(1, Number(scenario.objective.target) || 1)));
}

function freeScenarioState() {
    return {
        ...freeDefinition(),
        status: "free",
        startedYear: 1,
        startedDay: 0,
        current: 0,
        target: 0,
        progress: 0,
        evaluatedYear: null,
        evaluatedDay: null,
        outcomeYear: null,
        outcomeDay: null,
        history: []
    };
}

export function createScenarioState(definition, { year = 1, day = 0 } = {}) {
    const normalized = normalizeDefinition(definition);
    if (normalized.id === SCENARIO_FREE_ID) return freeScenarioState();
    return {
        ...normalized,
        status: "active",
        startedYear: Math.max(1, integer(year, 1, 100000, 1)),
        startedDay: integer(day, 0, 399, normalized.startDay),
        current: 0,
        target: normalized.objective.target,
        progress: 0,
        evaluatedYear: null,
        evaluatedDay: null,
        outcomeYear: null,
        outcomeDay: null,
        history: []
    };
}

export function normalizeScenarioState(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return freeScenarioState();
    if (input.id === SCENARIO_FREE_ID || input.status === "free") return freeScenarioState();
    let definition;
    try {
        definition = normalizeDefinition(input);
    } catch {
        return freeScenarioState();
    }
    const objective = definition.objective;
    const status = ["active", "won", "failed"].includes(input.status) ? input.status : "active";
    const target = Math.max(1, Number(objective.target) || 1);
    const current = Math.max(0, Math.floor(Number(input.current) || 0));
    return {
        ...definition,
        status,
        startedYear: Math.max(1, integer(input.startedYear, 1, 100000, 1)),
        startedDay: integer(input.startedDay, 0, 399, definition.startDay),
        current,
        target,
        progress: status === "won" ? 1 : calculateProgress({ ...definition, current, objective }),
        evaluatedYear: Number.isSafeInteger(Number(input.evaluatedYear)) ? Number(input.evaluatedYear) : null,
        evaluatedDay: Number.isSafeInteger(Number(input.evaluatedDay)) ? Number(input.evaluatedDay) : null,
        outcomeYear: Number.isSafeInteger(Number(input.outcomeYear)) ? Number(input.outcomeYear) : null,
        outcomeDay: Number.isSafeInteger(Number(input.outcomeDay)) ? Number(input.outcomeDay) : null,
        history: Array.isArray(input.history)
            ? input.history.filter(entry => entry && typeof entry === "object" && typeof entry.status === "string" && typeof entry.text === "string")
                .slice(0, SCENARIO_HISTORY_LIMIT)
                .map(entry => ({
                    year: Math.max(1, Math.floor(Number(entry.year) || 1)),
                    day: clamp(Math.floor(Number(entry.day) || 0), 0, 399),
                    status: ["won", "failed"].includes(entry.status) ? entry.status : "active",
                    text: clean(entry.text, 180)
                }))
            : []
    };
}

export function validateScenarioState(input) {
    if (input === null || input === undefined) return true;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Scenario state must be an object.");
    if (input.id === SCENARIO_FREE_ID || input.status === "free") return true;
    normalizeDefinition(input);
    if (!["active", "won", "failed"].includes(input.status)) throw new Error("Scenario status is invalid.");
    if (!Number.isFinite(Number(input.current)) || Number(input.current) < 0) throw new Error("Scenario progress is invalid.");
    if (!Array.isArray(input.history) || input.history.length > SCENARIO_HISTORY_LIMIT) throw new Error("Scenario history is invalid.");
    for (const entry of input.history) {
        if (!entry || typeof entry !== "object" || typeof entry.status !== "string" || typeof entry.text !== "string") {
            throw new Error("Scenario history entry is invalid.");
        }
    }
    return true;
}

function applyEffects(source, direction = 1) {
    if (!source || typeof source !== "object") return;
    if (!state.resources || typeof state.resources !== "object") state.resources = {};
    for (const key of SCENARIO_RESOURCE_KEYS) {
        const amount = Math.floor(Number(source[key]) || 0);
        if (!amount) continue;
        state.resources[key] = Math.max(0, Math.min(999999999, (Number(state.resources[key]) || 0) + amount * direction));
    }
    if (Number(source.morale)) state.morale = clamp((Number(state.morale) || 0) + Number(source.morale) * direction, 0, 100);
    if (Number(source.legitimacy)) {
        if (!state.politics || typeof state.politics !== "object") state.politics = { legitimacy: 65, factions: {}, settlements: 0 };
        state.politics.legitimacy = clamp((Number(state.politics.legitimacy) || 0) + Number(source.legitimacy) * direction, 0, 100);
    }
}

function effectText(source) {
    const parts = [];
    for (const key of ["food", "wood", "stone", "gold"]) {
        const amount = Math.floor(Number(source?.[key]) || 0);
        if (amount) parts.push((amount > 0 ? "+" : "") + amount + " " + key);
    }
    if (Number(source?.morale)) parts.push((Number(source.morale) > 0 ? "+" : "") + Number(source.morale) + " morale");
    if (Number(source?.legitimacy)) parts.push((Number(source.legitimacy) > 0 ? "+" : "") + Number(source.legitimacy) + " legitimacy");
    return parts.join(" · ");
}

export function applyScenarioStart(definition) {
    // A free realm deliberately has no objective. Check its id before
    // normalizeDefinition(), which correctly rejects an authored scenario
    // without one.
    if (definition?.id === SCENARIO_FREE_ID) {
        state.scenario = freeScenarioState();
        return state.scenario;
    }
    const normalized = normalizeDefinition(definition);
    const scenario = createScenarioState(normalized, { year: 1, day: normalized.startDay });
    state.year = 1;
    state.dayOfYear = normalized.startDay;
    state.seasonIndex = normalized.startSeason;
    state.resources = { ...normalized.resources };
    state.morale = normalized.morale;
    if (!state.politics || typeof state.politics !== "object") state.politics = { legitimacy: 65, factions: {}, settlements: 0 };
    state.politics.legitimacy = normalized.legitimacy;
    state.scenario = scenario;
    // The opening is a real choice and belongs in the realm's memory. The
    // objective itself stays active until the simulation evaluates it.
    if (state.hasStarted === false || state.year === 1) {
        recordLegacy("scenario", "SCENARIO — " + normalized.name, normalized.description, {
            importance: 2, year: state.year, tick: state.tick
        });
    }
    return scenario;
}

export function refreshScenarioProgress() {
    const scenario = state.scenario;
    if (!scenario || scenario.status !== "active" || !scenario.objective) return scenario;
    scenario.current = getScenarioCurrentValue(scenario.objective.type);
    scenario.progress = calculateProgress(scenario);
    return scenario;
}

function completeScenario(scenario, won) {
    scenario.status = won ? "won" : "failed";
    scenario.outcomeYear = state.year;
    scenario.outcomeDay = state.dayOfYear;
    scenario.current = getScenarioCurrentValue(scenario.objective.type);
    scenario.progress = won ? 1 : calculateProgress(scenario);
    const effects = won ? scenario.reward : scenario.failure;
    applyEffects(effects, 1);
    const detail = won
        ? "Objective met: " + scenario.objective.target + " " + SCENARIO_OBJECTIVES[scenario.objective.type].unit + " by " + deadlineLabel(scenario.objective) + ". Reward: " + (effectText(scenario.reward) || "the realm's survival") + "."
        : "Objective missed by " + deadlineLabel(scenario.objective) + ". Consequence: " + (effectText(scenario.failure) || "the realm remembers the failure") + ".";
    scenario.history.unshift({
        year: state.year,
        day: state.dayOfYear,
        status: won ? "won" : "failed",
        text: detail
    });
    if (scenario.history.length > SCENARIO_HISTORY_LIMIT) scenario.history.length = SCENARIO_HISTORY_LIMIT;
    recordLegacy("scenario", won ? "SCENARIO COMPLETE — " + scenario.name : "SCENARIO FAILED — " + scenario.name, detail, {
        importance: won ? 4 : 3, year: state.year, tick: state.tick
    });
    queueMessage(
        won ? "SCENARIO COMPLETE" : "SCENARIO FAILED",
        won ? scenario.name.toUpperCase() + " · THE REALM REMEMBERS" : scenario.name.toUpperCase() + " · THE CHRONICLE CONTINUES",
        8000
    );
    return scenario;
}

export function updateScenario() {
    const scenario = state.scenario;
    if (!scenario || scenario.status !== "active" || !scenario.objective) return false;
    // Objectives settle once per calendar day. A year is 400 days, so this is a
    // bounded read of the fields the objective names: one store scalar, the
    // population-register total, one political scalar or the discovered-region
    // list. It never runs a map, ecology or render pass.
    if (scenario.evaluatedYear === state.year && scenario.evaluatedDay === state.dayOfYear) return false;
    scenario.evaluatedYear = state.year;
    scenario.evaluatedDay = state.dayOfYear;
    scenario.current = getScenarioCurrentValue(scenario.objective.type);
    scenario.progress = calculateProgress(scenario);
    const now = state.year * 400 + state.dayOfYear;
    if (scenario.current >= scenario.objective.target) {
        completeScenario(scenario, true);
        return true;
    }
    if (now >= deadlineAbsolute(scenario.objective)) {
        completeScenario(scenario, false);
        return true;
    }
    return false;
}

export function getScenarioSnapshot() {
    const scenario = normalizeScenarioState(state.scenario);
    if (scenario.status === "free" || scenario.id === SCENARIO_FREE_ID || !scenario.objective) {
        return { visible: false, id: SCENARIO_FREE_ID, status: "free", statusLabel: "FREE REALM" };
    }
    const objective = scenario.objective;
    const meta = SCENARIO_OBJECTIVES[objective.type];
    return {
        visible: true,
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        difficulty: scenario.difficulty,
        status: scenario.status,
        statusLabel: scenario.status === "won" ? "COMPLETE" : scenario.status === "failed" ? "FAILED" : "IN PROGRESS",
        current: scenario.current,
        target: objective.target,
        unit: meta.unit,
        progress: scenario.status === "won" ? 1 : calculateProgress(scenario),
        progressLabel: scenario.current + " / " + objective.target + " " + meta.unit,
        objectiveLabel: objectiveLabel(objective.type, objective.target, objective),
        deadlineLabel: deadlineLabel(objective),
        deadlineShort: shortDeadline(objective),
        startLabel: (SCENARIO_SEASONS[scenario.startSeason] || "spring").replace(/^./, letter => letter.toUpperCase()) + " · Year 1",
        startStores: { ...scenario.resources },
        startMorale: scenario.morale,
        startLegitimacy: scenario.legitimacy,
        rewardText: effectText(scenario.reward) || "The realm's survival",
        failureText: effectText(scenario.failure) || "A permanent mark in the chronicle",
        history: scenario.history.slice(0, 4)
    };
}

export function getScenarioObjectiveTypes() {
    return Object.entries(SCENARIO_OBJECTIVES).map(([id, value]) => ({ id, ...value }));
}

export function getScenarioStartDayForSeason(seasonIndex) {
    return integer(seasonIndex, 0, 3, 0) * 100 + 20;
}
