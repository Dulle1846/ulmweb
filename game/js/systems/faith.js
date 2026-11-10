// Faith & culture: named clergy, real congregations, funded festivals,
// pilgrimages, culture budgets and emergent heresy. Every heavy calculation
// runs once per year; trade, taxation and mortality read a small cached
// modifier block so the tick stays cheap.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { random } from "../core/random.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { applyPoliticalEffects, getPoliticalSnapshot } from "./politics.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { spawnEntity, canSpawnEntity } from "../world/entities.js";
import { HOUSING_TIERS, isHousingType } from "./city-config.js";

export const FAITH_VERSION = 1;
export const FAITH_HISTORY_LIMIT = 24;
export const MAX_CLERGY = 8;
export const CLERGY_APPOINTMENT_COST = 10;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = value => Math.max(0, Math.round(Number(value) || 0));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const trait = (person, key) => clamp(person?.traits?.[key] ?? 50, 0, 100);
const maturityFor = person => PERSON_SPECIES[person?.species]?.maturation ?? 16;
const residents = () => state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
const isComplete = entity => Boolean(entity && !entity.dead && !(entity.construction && Number(entity.construction.stage) < 3));

export const CONVICTIONS = Object.freeze({
    orthodox: Object.freeze({
        label: "Orthodox", tone: "#c9b17a",
        description: "Rites, hierarchy and continuity. Strengthens the crown's legitimacy.",
        legitimacy: 0.30, tax: 0.006, trade: 0, mortality: 0, morale: 0
    }),
    reformist: Object.freeze({
        label: "Reformist", tone: "#8eaa7a",
        description: "Temples should serve the living. Improves tax reach and trade contact.",
        legitimacy: 0.05, tax: 0.018, trade: 0.010, mortality: 0, morale: 0.10
    }),
    mystic: Object.freeze({
        label: "Mystic", tone: "#9a8ec4",
        description: "Comfort for the sick and dying. Lowers mortality in the congregation.",
        legitimacy: 0.10, tax: 0, trade: 0, mortality: 0.028, morale: 0.25
    }),
    ascetic: Object.freeze({
        label: "Ascetic", tone: "#a3b18a",
        description: "Poverty and service. Raises public morale and welcomes newcomers.",
        legitimacy: 0.14, tax: 0, trade: 0, mortality: 0.012, morale: 0.42
    })
});

export const FESTIVALS = Object.freeze({
    harvest: Object.freeze({
        label: "Harvest festival", cost: Object.freeze({ food: 24, gold: 8 }),
        morale: 6, legitimacy: 1.2, demand: 0.18, heresyRelief: 5,
        description: "Feed the settlement and open the granary. Strong street morale and a real surge in food and timber demand."
    }),
    reconciliation: Object.freeze({
        label: "Rite of reconciliation", cost: Object.freeze({ gold: 14, food: 8 }),
        morale: 3.5, legitimacy: 1.6, demand: 0.08, heresyRelief: 14,
        description: "Public penance and a shared table. The strongest answer to religious tension."
    }),
    founders: Object.freeze({
        label: "Founders' procession", cost: Object.freeze({ gold: 18 }),
        morale: 4.5, legitimacy: 1.0, demand: 0.12, heresyRelief: 7,
        description: "Carry the realm's relics through the streets. Prestige, trade visitors and a modest festival market."
    })
});

export const FAITH_BUDGET_LEVELS = Object.freeze([
    Object.freeze({ level: 0, label: "None", gold: 0, morale: 0, legitimacy: 0, relief: 0 }),
    Object.freeze({ level: 1, label: "Modest", gold: 6, morale: 0.35, legitimacy: 0.20, relief: 2 }),
    Object.freeze({ level: 2, label: "Generous", gold: 14, morale: 0.85, legitimacy: 0.45, relief: 5 }),
    Object.freeze({ level: 3, label: "Splendid", gold: 24, morale: 1.40, legitimacy: 0.75, relief: 9 })
]);

export const HERESY_LEVELS = Object.freeze([
    Object.freeze({ id: "none", label: "United", max: 24 }),
    Object.freeze({ id: "murmur", label: "Murmurs", max: 49 }),
    Object.freeze({ id: "dissent", label: "Dissent", max: 74 }),
    Object.freeze({ id: "heresy", label: "Heresy", max: 100 })
]);

function budgetLevelFor(value) {
    const level = Math.max(0, Math.min(FAITH_BUDGET_LEVELS.length - 1, Math.floor(Number(value) || 0)));
    return FAITH_BUDGET_LEVELS[level];
}

export function heresyLevelFor(tension) {
    const value = clamp(tension, 0, 100);
    return HERESY_LEVELS.find(entry => value <= entry.max) || HERESY_LEVELS[HERESY_LEVELS.length - 1];
}

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = String(entry.summary || "").trim().slice(0, 200);
    if (!summary) return null;
    return {
        year: round(entry.year),
        tick: round(entry.tick),
        kind: String(entry.kind || "faith").slice(0, 32),
        summary
    };
}

function normalizeClergyEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const personId = String(entry.personId || "").slice(0, 100);
    if (!personId) return null;
    const conviction = CONVICTIONS[entry.conviction] ? entry.conviction : "orthodox";
    return {
        personId,
        name: String(entry.name || "Unnamed cleric").slice(0, 90),
        competence: clamp(entry.competence ?? 50, 1, 100),
        conviction,
        appointedYear: Math.max(1, round(entry.appointedYear) || 1),
        templeId: entry.templeId ? String(entry.templeId).slice(0, 100) : null
    };
}

export function createFaithState() {
    return {
        version: FAITH_VERSION,
        revision: 1,
        lastUpdateYear: 0,
        clergy: [],
        cultureBudget: 1,
        lastBudgetYear: 0,
        festival: { lastHeldYear: 0, lastKind: null, expiresYear: 0, demand: 0, attendance: 0 },
        pilgrimage: { lastFundedYear: 0, pendingYear: 0, lastResolvedYear: 0, pilgrims: 0, goldEarned: 0, settlers: 0, tradeBonus: 0, expiresYear: 0 },
        heresy: { tension: 12, level: "none", sinceYear: 0, lastActionYear: 0 },
        history: [],
        lastAudit: null,
        totals: { festivals: 0, pilgrimages: 0, pilgrims: 0, clergyAppointed: 0, heresyYears: 0 }
    };
}

export function normalizeFaithState(input = state.faith) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const festival = source.festival && typeof source.festival === "object" && !Array.isArray(source.festival) ? source.festival : {};
    const pilgrimage = source.pilgrimage && typeof source.pilgrimage === "object" && !Array.isArray(source.pilgrimage) ? source.pilgrimage : {};
    const heresy = source.heresy && typeof source.heresy === "object" && !Array.isArray(source.heresy) ? source.heresy : {};
    const totals = source.totals && typeof source.totals === "object" && !Array.isArray(source.totals) ? source.totals : {};
    const tension = clamp(heresy.tension ?? 12, 0, 100);
    const normalized = {
        version: FAITH_VERSION,
        revision: Math.max(1, round(source.revision) || 1),
        lastUpdateYear: round(source.lastUpdateYear),
        clergy: (Array.isArray(source.clergy) ? source.clergy : []).map(normalizeClergyEntry).filter(Boolean).slice(0, MAX_CLERGY),
        cultureBudget: Math.max(0, Math.min(FAITH_BUDGET_LEVELS.length - 1, Math.floor(Number(source.cultureBudget) || 0))),
        lastBudgetYear: round(source.lastBudgetYear),
        festival: {
            lastHeldYear: round(festival.lastHeldYear),
            lastKind: FESTIVALS[festival.lastKind] ? festival.lastKind : null,
            expiresYear: round(festival.expiresYear),
            demand: clamp(festival.demand, 0, 0.5),
            attendance: round(festival.attendance)
        },
        pilgrimage: {
            lastFundedYear: round(pilgrimage.lastFundedYear),
            pendingYear: round(pilgrimage.pendingYear),
            lastResolvedYear: round(pilgrimage.lastResolvedYear),
            pilgrims: round(pilgrimage.pilgrims),
            goldEarned: round(pilgrimage.goldEarned),
            settlers: round(pilgrimage.settlers),
            tradeBonus: clamp(pilgrimage.tradeBonus, 0, 0.4),
            expiresYear: round(pilgrimage.expiresYear)
        },
        heresy: {
            tension,
            level: heresyLevelFor(tension).id,
            sinceYear: round(heresy.sinceYear),
            lastActionYear: round(heresy.lastActionYear)
        },
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, FAITH_HISTORY_LIMIT),
        lastAudit: source.lastAudit && typeof source.lastAudit === "object" && !Array.isArray(source.lastAudit) ? { ...source.lastAudit } : null,
        totals: {
            festivals: round(totals.festivals),
            pilgrimages: round(totals.pilgrimages),
            pilgrims: round(totals.pilgrims),
            clergyAppointed: round(totals.clergyAppointed),
            heresyYears: round(totals.heresyYears)
        }
    };
    if (state.faith === input) state.faith = normalized;
    return normalized;
}

export function ensureFaith() {
    const current = state.faith;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== FAITH_VERSION ||
        !Array.isArray(current.clergy) || !current.festival || !current.pilgrimage || !current.heresy) {
        state.faith = normalizeFaithState(current);
    }
    return state.faith;
}

function touch(faith) {
    faith.revision = Math.max(1, Number(faith.revision) || 1) + 1;
}

function record(faith, kind, summary) {
    faith.history.unshift({ year: yearNow(), tick: round(state.tick), kind: String(kind).slice(0, 32), summary: String(summary).slice(0, 200) });
    if (faith.history.length > FAITH_HISTORY_LIMIT) faith.history.length = FAITH_HISTORY_LIMIT;
    addLog(summary, "#c9b17a", "faith");
}

function findResident(personId) {
    return state.entities.find(entity => !entity.dead && (String(entity.personId || entity.id) === String(personId) || String(entity.id) === String(personId))) || null;
}

function countCompleted(type) {
    return state.entities.filter(entity => isComplete(entity) && entity.type === type).length;
}

export function getFaithBuildings() {
    return { temples: countCompleted(TYPE.TEMPLE), shrines: countCompleted(TYPE.SHRINE) };
}

export function clergyCapacity() {
    const { temples, shrines } = getFaithBuildings();
    return Math.min(MAX_CLERGY, temples * 2 + shrines * 1);
}

function servesElsewhere(entity) {
    const id = String(entity.personId || entity.id);
    if (entity.isKing) return true;
    if (entity.type !== TYPE.VILLAGER) return true;
    if (entity.isHealer || entity.healthRole === "healer") return true;
    if ((state.health?.healers || []).some(entry => String(entry.personId) === id)) return true;
    if (state.court?.offices && Object.values(state.court.offices).some(office => office && String(office.personId) === id)) return true;
    if (Array.isArray(state.justice?.judges) && state.justice.judges.some(judge => String(judge.personId) === id)) return true;
    return false;
}

function convictionFor(person) {
    const scores = {
        orthodox: trait(person, "piety") * 0.55 + trait(person, "discipline") * 0.30 + (100 - trait(person, "curiosity")) * 0.15,
        reformist: trait(person, "curiosity") * 0.40 + trait(person, "ambition") * 0.35 + trait(person, "sociability") * 0.25,
        mystic: trait(person, "piety") * 0.40 + trait(person, "curiosity") * 0.35 + trait(person, "compassion") * 0.25,
        ascetic: trait(person, "compassion") * 0.45 + (100 - trait(person, "greed")) * 0.35 + trait(person, "discipline") * 0.20
    };
    return Object.keys(scores).reduce((best, key) => scores[key] > scores[best] ? key : best, "orthodox");
}

function competenceFor(person) {
    const experience = clamp((person.ageYears - maturityFor(person)) * 2.0, 0, 100);
    return Math.round(clamp(
        trait(person, "piety") * 0.44 +
        trait(person, "compassion") * 0.20 +
        trait(person, "discipline") * 0.18 +
        trait(person, "sociability") * 0.10 +
        experience * 0.08,
        12, 98
    ));
}

function pruneClergy(faith) {
    let changed = false;
    faith.clergy = faith.clergy.filter(entry => {
        const entity = findResident(entry.personId);
        if (!entity || entity.type !== TYPE.VILLAGER) {
            changed = true;
            record(faith, "vacancy", entry.name + " no longer serves the congregation");
            return false;
        }
        entry.name = ensurePersonProfile(entity).name;
        return true;
    });
    if (changed) touch(faith);
    return faith.clergy;
}

function activeClergy(faith) {
    pruneClergy(faith);
    return faith.clergy.slice();
}

// Modifiers are cached by the inputs that can change them, never by the tick.
// `source` is the live faith object: a load replaces it, so a restored realm
// can never reuse the modifiers of the realm that was open before the load.
// Clergy and population are read live, so a death or vacancy invalidates the
// cache in the same call; the year covers festival and pilgrimage expiry.
let modifierCache = { source: null, signature: "", value: null };

export function getFaithModifiers() {
    const faith = ensureFaith();
    const clergy = activeClergy(faith);
    const { temples, shrines } = getFaithBuildings();
    const population = residents().length;
    const signature = [
        yearNow(), state.worldEpoch || 0, state.buildingCollisionVersion || 0,
        faith.revision, faith.cultureBudget, clergy.length, temples, shrines, population,
        faith.heresy.tension, faith.festival.expiresYear, faith.festival.demand,
        faith.pilgrimage.expiresYear, faith.pilgrimage.tradeBonus
    ].join(":");
    if (modifierCache.source === faith && modifierCache.signature === signature && modifierCache.value) {
        return modifierCache.value;
    }

    const competence = clergy.reduce((sum, entry) => sum + Number(entry.competence || 0), 0);
    const coverage = clamp(competence / Math.max(12, population * 12), 0, 1);
    const shares = { orthodox: 0, reformist: 0, mystic: 0, ascetic: 0 };
    for (const entry of clergy) shares[entry.conviction] += Number(entry.competence || 0);
    const total = Math.max(1, competence);
    for (const key of Object.keys(shares)) shares[key] = shares[key] / total;
    const budget = budgetLevelFor(faith.cultureBudget);
    const heresyPenalty = clamp(faith.heresy.tension, 0, 100) / 100;
    const festivalActive = faith.festival.expiresYear >= yearNow() ? clamp(faith.festival.demand, 0, 0.5) : 0;
    const pilgrimageActive = faith.pilgrimage.expiresYear >= yearNow() ? clamp(faith.pilgrimage.tradeBonus, 0, 0.4) : 0;
    const congregation = Math.min(population, temples * 10 + shrines * 4);

    const value = {
        population,
        congregation,
        temples,
        shrines,
        clergyCount: clergy.length,
        clergyCapacity: clergyCapacity(),
        coverage: Math.round(coverage * 1000) / 1000,
        convictions: shares,
        budgetLevel: budget.level,
        budgetGold: budget.gold,
        festivalDemand: Math.round(festivalActive * 1000) / 1000,
        pilgrimageTrade: Math.round(pilgrimageActive * 1000) / 1000,
        heresyTension: Math.round(clamp(faith.heresy.tension, 0, 100)),
        heresyLevel: faith.heresy.level,
        taxEfficiency: Math.max(0.72, 1 + coverage * 0.03 + budget.level * 0.004 + shares.reformist * 0.02 - heresyPenalty * 0.12),
        tradeFactor: Math.max(0.7, 1 + pilgrimageActive + festivalActive * 0.06 + coverage * 0.012 + shares.reformist * 0.01 - heresyPenalty * 0.10),
        mortalityRelief: Math.max(0.82, 1 - (coverage * 0.05 + shares.mystic * 0.04 + budget.level * 0.005)),
        militaryMorale: Math.round((coverage * 6 + shares.orthodox * 2) * 10) / 10,
        moraleYear: Math.round((budget.morale + coverage * 0.9 + shares.ascetic * 0.5 - heresyPenalty * 3) * 100) / 100,
        legitimacyYear: Math.round((coverage * 0.45 + shares.orthodox * 0.3 + budget.legitimacy - heresyPenalty * 1.3) * 100) / 100,
        migrationFactor: Math.max(0.35, Math.min(1.2, 1 - heresyPenalty * 0.5 + coverage * 0.06 + shares.ascetic * 0.04)),
        unrest: Math.round(heresyPenalty * 100)
    };
    modifierCache = { source: faith, signature, value };
    return value;
}

export function faithCandidatePool() {
    const faith = ensureFaith();
    const occupied = new Set(faith.clergy.map(entry => String(entry.personId)));
    return residents()
        .filter(entity => !occupied.has(String(entity.personId || entity.id)) && !servesElsewhere(entity))
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return {
                personId: String(person.id),
                name: person.name,
                ageYears: person.ageYears,
                species: person.species,
                adult: person.ageYears >= maturityFor(person),
                conviction: convictionFor(person),
                convictionLabel: CONVICTIONS[convictionFor(person)].label,
                fit: competenceFor(person)
            };
        })
        .filter(candidate => candidate.adult)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 12);
}

export function getFaithSnapshot() {
    const faith = ensureFaith();
    const modifiers = getFaithModifiers();
    const { temples, shrines } = getFaithBuildings();
    return {
        ...faith,
        clergy: faith.clergy.map(entry => ({ ...entry, convictionLabel: CONVICTIONS[entry.conviction].label })),
        candidates: faithCandidatePool(),
        modifiers,
        temples,
        shrines,
        capacity: clergyCapacity(),
        budget: budgetLevelFor(faith.cultureBudget),
        budgetLevels: FAITH_BUDGET_LEVELS.map(level => ({ ...level })),
        convictions: Object.entries(CONVICTIONS).map(([id, definition]) => ({ id, ...definition })),
        festivals: Object.entries(FESTIVALS).map(([id, definition]) => ({ id, ...definition, cost: { ...definition.cost } })),
        canHoldFestival: faith.festival.lastHeldYear < yearNow(),
        canFundPilgrimage: faith.pilgrimage.lastFundedYear < yearNow() && faith.pilgrimage.pendingYear === 0,
        pilgrimagePending: faith.pilgrimage.pendingYear > 0,
        heresyLevelDefinition: heresyLevelFor(faith.heresy.tension),
        appointmentCost: CLERGY_APPOINTMENT_COST,
        history: faith.history.slice(0, 16),
        lastAudit: faith.lastAudit ? { ...faith.lastAudit } : null
    };
}

export function appointClergy(personId) {
    const faith = ensureFaith();
    const entity = findResident(personId);
    if (!entity) return { ok: false, reason: "RESIDENT NOT FOUND" };
    if (servesElsewhere(entity)) return { ok: false, reason: "THIS RESIDENT ALREADY HOLDS AN OFFICE" };
    const person = ensurePersonProfile(entity);
    if (person.ageYears < maturityFor(person)) return { ok: false, reason: "THE RESIDENT IS TOO YOUNG TO SERVE" };
    if (faith.clergy.some(entry => String(entry.personId) === String(person.id))) return { ok: false, reason: "THIS RESIDENT ALREADY SERVES THE CONGREGATION" };
    const capacity = clergyCapacity();
    if (capacity <= 0) return { ok: false, reason: "BUILD A TEMPLE OR SHRINE FIRST" };
    if (faith.clergy.length >= capacity) return { ok: false, reason: "ALL CLERGY POSTS ARE FILLED" };
    if ((Number(state.resources?.gold) || 0) < CLERGY_APPOINTMENT_COST) return { ok: false, reason: "NOT ENOUGH GOLD" };
    addResource("gold", -CLERGY_APPOINTMENT_COST);
    const temple = state.entities.find(item => isComplete(item) && (item.type === TYPE.TEMPLE || item.type === TYPE.SHRINE)) || null;
    const conviction = convictionFor(person);
    const entry = {
        personId: String(person.id),
        name: person.name,
        competence: competenceFor(person),
        conviction,
        appointedYear: yearNow(),
        templeId: temple ? String(temple.id) : null
    };
    faith.clergy.push(entry);
    faith.totals.clergyAppointed++;
    touch(faith);
    applyPoliticalEffects({ clergy: 1.2, legitimacy: 0.15 });
    addPersonMemory(entity, {
        id: "faith:clergy:" + state.year,
        type: "faith",
        text: "I was appointed to the congregation in year " + yearNow() + " as a " + CONVICTIONS[conviction].label.toLowerCase() + " cleric.",
        tick: state.tick,
        importance: 78
    });
    record(faith, "appointment", person.name + " was appointed to the congregation · " + CONVICTIONS[conviction].label + " · competence " + entry.competence);
    return { ok: true, entry: { ...entry }, message: person.name + " appointed", name: person.name, competence: entry.competence, conviction };
}

export function dismissClergy(personId) {
    const faith = ensureFaith();
    const entry = faith.clergy.find(item => String(item.personId) === String(personId));
    if (!entry) return { ok: false, reason: "CLERIC NOT FOUND" };
    faith.clergy = faith.clergy.filter(item => String(item.personId) !== String(personId));
    touch(faith);
    applyPoliticalEffects({ clergy: -1.0, legitimacy: -0.2 });
    record(faith, "dismissal", entry.name + " was relieved of the congregation");
    return { ok: true, name: entry.name, message: entry.name + " dismissed" };
}

export function holdFestival(kind) {
    const definition = FESTIVALS[kind];
    if (!definition) return { ok: false, reason: "UNKNOWN FESTIVAL" };
    const faith = ensureFaith();
    if (faith.festival.lastHeldYear >= yearNow()) return { ok: false, reason: "A FESTIVAL WAS ALREADY HELD THIS YEAR" };
    if (clergyCapacity() <= 0) return { ok: false, reason: "BUILD A TEMPLE OR SHRINE FIRST" };
    for (const [resource, amount] of Object.entries(definition.cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(definition.cost)) addResource(resource, -amount);
    if (definition.cost.food) recordResourceMovement("food", -definition.cost.food, "faith-festival", { from: { kind: "realm", id: "royal-stores" }, to: { kind: "faith", id: kind } });
    const modifiers = getFaithModifiers();
    const scale = 0.7 + modifiers.coverage * 0.5 + modifiers.convictions.ascetic * 0.3;
    const moraleGain = definition.morale * scale;
    state.morale = clamp(state.morale + moraleGain, 0, 100);
    applyPoliticalEffects({ legitimacy: definition.legitimacy * scale, clergy: 0.8, commons: 0.4 });
    faith.heresy.tension = clamp(faith.heresy.tension - definition.heresyRelief * (0.7 + modifiers.coverage * 0.6), 0, 100);
    faith.heresy.level = heresyLevelFor(faith.heresy.tension).id;
    faith.festival = {
        lastHeldYear: yearNow(),
        lastKind: kind,
        expiresYear: yearNow() + 1,
        demand: definition.demand,
        attendance: Math.round(modifiers.congregation * (0.5 + modifiers.coverage * 0.5))
    };
    faith.totals.festivals++;
    touch(faith);
    record(faith, "festival", definition.label + " held · " + Math.round(moraleGain * 10) / 10 + " morale · legitimacy +" + Math.round(definition.legitimacy * scale * 10) / 10 + " · " + faith.festival.attendance + " attending");
    addLog(definition.label.toUpperCase() + " FILLS THE STREETS · MORALE RISES", "#e8c77b", "faith");
    return { ok: true, message: definition.label + " held", morale: Math.round(moraleGain * 10) / 10, attendance: faith.festival.attendance };
}

export function fundPilgrimage() {
    const faith = ensureFaith();
    if (faith.pilgrimage.pendingYear > 0) return { ok: false, reason: "A PILGRIMAGE IS ALREADY ON THE ROAD" };
    if (faith.pilgrimage.lastFundedYear >= yearNow()) return { ok: false, reason: "A PILGRIMAGE WAS ALREADY FUNDED THIS YEAR" };
    if (clergyCapacity() <= 0) return { ok: false, reason: "BUILD A TEMPLE OR SHRINE FIRST" };
    const cost = { gold: 14, food: 12 };
    for (const [resource, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
    recordResourceMovement("food", -cost.food, "faith-pilgrimage", { from: { kind: "realm", id: "royal-stores" }, to: { kind: "faith", id: "pilgrims" } });
    faith.pilgrimage.lastFundedYear = yearNow();
    faith.pilgrimage.pendingYear = yearNow() + 1;
    faith.totals.pilgrimages++;
    touch(faith);
    record(faith, "pilgrimage", "A pilgrimage was funded for year " + (yearNow() + 1) + " · 14 gold and 12 food committed");
    addLog("PILGRIMS TAKE THE ROAD · THE TEMPLE PREPARES FOR YEAR " + (yearNow() + 1), "#c9b17a", "faith");
    return { ok: true, message: "pilgrimage funded", resolvesYear: faith.pilgrimage.pendingYear, cost };
}

export function setCultureBudget(level) {
    const faith = ensureFaith();
    const next = budgetLevelFor(level);
    if (faith.cultureBudget === next.level) return { ok: false, reason: "THE CULTURE BUDGET ALREADY STANDS AT " + next.label.toUpperCase() };
    faith.cultureBudget = next.level;
    touch(faith);
    record(faith, "budget", "Culture budget set to " + next.label + " · " + next.gold + " gold each year");
    return { ok: true, message: "culture budget set to " + next.label, budget: next };
}

export function addressHeresy(action) {
    const faith = ensureFaith();
    if (faith.heresy.lastActionYear >= yearNow()) return { ok: false, reason: "THE CONGREGATION WAS ALREADY ADDRESSED THIS YEAR" };
    if (action === "reconcile") {
        const cost = { gold: 12, food: 10 };
        for (const [resource, amount] of Object.entries(cost)) {
            if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
        }
        for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
        recordResourceMovement("food", -cost.food, "faith-reconciliation", { from: { kind: "realm", id: "royal-stores" }, to: { kind: "faith", id: "congregation" } });
        const modifiers = getFaithModifiers();
        const relief = 16 + modifiers.coverage * 18 + modifiers.convictions.orthodox * 6;
        faith.heresy.tension = clamp(faith.heresy.tension - relief, 0, 100);
        state.morale = clamp(state.morale + 0.8, 0, 100);
        applyPoliticalEffects({ legitimacy: 0.3, clergy: 1.4 });
        faith.heresy.lastActionYear = yearNow();
        faith.heresy.level = heresyLevelFor(faith.heresy.tension).id;
        touch(faith);
        record(faith, "reconciliation", "The crown reconciled with the congregation · tension -" + Math.round(relief));
        return { ok: true, message: "congregation reconciled", relief: Math.round(relief) };
    }
    if (action === "suppress") {
        if ((Number(state.resources?.gold) || 0) < 10) return { ok: false, reason: "NOT ENOUGH GOLD" };
        addResource("gold", -10);
        faith.heresy.tension = clamp(faith.heresy.tension - 30, 0, 100);
        state.morale = clamp(state.morale - 4, 0, 100);
        applyPoliticalEffects({ legitimacy: -0.8, clergy: -1.6, commons: -0.6 });
        faith.heresy.lastActionYear = yearNow();
        faith.heresy.level = heresyLevelFor(faith.heresy.tension).id;
        touch(faith);
        record(faith, "suppression", "Heterodox preachers were suppressed · tension -30 · morale -4");
        return { ok: true, message: "heresy suppressed", relief: 30 };
    }
    return { ok: false, reason: "UNKNOWN CONGREGATION ACTION" };
}

function resolvePilgrimage(faith) {
    if (!faith.pilgrimage.pendingYear || faith.pilgrimage.pendingYear > yearNow()) return null;
    const modifiers = getFaithModifiers();
    const population = residents().length;
    const pilgrims = Math.max(4, Math.round((population * 0.45 + modifiers.coverage * 24 + modifiers.congregation * 0.25) * (0.85 + random("faith") * 0.3)));
    const goldEarned = Math.max(2, Math.round(pilgrims * 0.42 + modifiers.coverage * 8));
    addResource("gold", goldEarned);
    const tradeBonus = Math.round((0.04 + modifiers.coverage * 0.04) * 1000) / 1000;
    faith.pilgrimage.pendingYear = 0;
    faith.pilgrimage.lastResolvedYear = yearNow();
    faith.pilgrimage.pilgrims = pilgrims;
    faith.pilgrimage.goldEarned = goldEarned;
    faith.pilgrimage.tradeBonus = tradeBonus;
    faith.pilgrimage.expiresYear = yearNow() + 1;
    faith.totals.pilgrims += pilgrims;
    let settlers = 0;
    const houses = state.entities.filter(entity => isComplete(entity) && isHousingType(entity.type));
    const occupancy = new Map(houses.map(house => [house, 0]));
    for (const villager of residents()) {
        const home = houses.find(house => villager.home?.x === house.x && villager.home?.y === house.y);
        if (home) occupancy.set(home, occupancy.get(home) + 1);
    }
    const openHouse = houses.find(house => occupancy.get(house) < (HOUSING_TIERS[house.type]?.capacity || 0));
    if (openHouse && (Number(state.resources?.food) || 0) > population * 0.9 && state.morale >= 40 && canSpawnEntity(TYPE.VILLAGER)) {
        const settler = spawnEntity(openHouse.x + 1, openHouse.y + 1, TYPE.VILLAGER);
        if (settler) {
            settler.home = { x: openHouse.x, y: openHouse.y };
            settler.anchor = { x: openHouse.x, y: openHouse.y };
            settler.householdId = "house:" + openHouse.x + ":" + openHouse.y;
            settler.lastAgedYear = state.year;
            settler.jobRefreshTimer = 0;
            ensurePersonProfile(settler);
            faith.pilgrimage.settlers = (Number(faith.pilgrimage.settlers) || 0) + 1;
            settlers = 1;
            record(faith, "settler",                "A pilgrim stayed and settled in the realm");
        }
    }
    touch(faith);
    record(faith, "pilgrimage-return", pilgrims + " pilgrims returned · " + goldEarned + " gold spent in the realm · trade +" + Math.round(tradeBonus * 100) + "%");
    return { pilgrims, goldEarned, tradeBonus, settlers };
}

function updateHeresy(faith, modifiers, legend) {
    const politics = getPoliticalSnapshot();
    const ledger = state.economy?.lastLedger;
    const hunger = ledger && Number(ledger.foodDemand) > 0 ? clamp(Number(ledger.foodShortage) / Number(ledger.foodDemand), 0, 1) : 0;
    const war = state.raidActive || (state.diplomacy?.realms || []).some(realm => realm.treaty === "war") ? 1 : 0;
    const taxPressure = Math.max(0, (Number(state.government?.taxRate) || 10) - 12) / 100;
    const pressure = (100 - politics.legitimacy) / 100 * 0.35 + hunger * 0.30 + war * 0.12 +
        (1 - modifiers.coverage) * 0.28 + taxPressure * 0.15;
    const relief = modifiers.coverage * 0.38 + modifiers.budgetLevel * 0.06 +
        (faith.festival.lastHeldYear === yearNow() ? 0.18 : 0);
    const before = faith.heresy.tension;
    faith.heresy.tension = clamp(before + (pressure - relief) * 18, 0, 100);
    faith.heresy.level = heresyLevelFor(faith.heresy.tension).id;
    if (faith.heresy.level !== "none" && before <= 24) {
        faith.heresy.sinceYear = yearNow();
        addLog("RELIGIOUS TENSION RISES · " + faith.heresy.level.toUpperCase(), "#c48a8a", "faith");
    }
    if (faith.heresy.level === "heresy") faith.totals.heresyYears++;
    const penalty = faith.heresy.tension / 100;
    state.morale = clamp(state.morale - penalty * 2.5, 0, 100);
    applyPoliticalEffects({ legitimacy: -penalty * 1.2, clergy: -penalty * 1.5 });
    legend.heresyPressure = Math.round(pressure * 1000) / 1000;
    legend.heresyRelief = Math.round(relief * 1000) / 1000;
}

export function updateFaith() {
    const faith = ensureFaith();
    const year = yearNow();
    if (faith.lastUpdateYear >= year) return getFaithSnapshot();
    const modifiers = getFaithModifiers();
    const legend = { year };
    // Salaries of the congregation are paid from the culture budget once a
    // year. An unpaid budget weakens the clergy's reach for that year.
    const budget = budgetLevelFor(faith.cultureBudget);
    const available = Math.max(0, Number(state.resources?.gold) || 0);
    const paid = Math.min(available, budget.gold);
    if (paid > 0) addResource("gold", -paid);
    faith.lastBudgetYear = year;
    legend.budgetDue = budget.gold;
    legend.budgetPaid = paid;
    legend.unpaidBudget = Math.max(0, budget.gold - paid);
    if (legend.unpaidBudget > 0) {
        faith.heresy.tension = clamp(faith.heresy.tension + 4, 0, 100);
        state.morale = clamp(state.morale - 0.6, 0, 100);
    }
    state.morale = clamp(state.morale + modifiers.moraleYear, 0, 100);
    applyPoliticalEffects({ legitimacy: modifiers.legitimacyYear, clergy: modifiers.coverage * 0.8 });
    const pilgrimage = resolvePilgrimage(faith);
    updateHeresy(faith, modifiers, legend);
    if (faith.festival.expiresYear < year) {
        faith.festival.expiresYear = 0;
        faith.festival.demand = 0;
    }
    if (faith.pilgrimage.expiresYear < year) {
        faith.pilgrimage.expiresYear = 0;
        faith.pilgrimage.tradeBonus = 0;
    }
    const latest = getFaithModifiers();
    faith.lastAudit = {
        year,
        population: latest.population,
        congregation: latest.congregation,
        clergy: latest.clergyCount,
        capacity: latest.clergyCapacity,
        coverage: Math.round(latest.coverage * 100),
        budgetDue: legend.budgetDue,
        budgetPaid: legend.budgetPaid,
        festivals: faith.festival.lastHeldYear === year ? 1 : 0,
        pilgrims: pilgrimage ? pilgrimage.pilgrims : faith.pilgrimage.pilgrims,
        pilgrimageGold: pilgrimage ? pilgrimage.goldEarned : faith.pilgrimage.goldEarned,
        heresyTension: latest.heresyTension,
        heresyLevel: latest.heresyLevel,
        taxEfficiency: Math.round(latest.taxEfficiency * 1000) / 1000,
        tradeFactor: Math.round(latest.tradeFactor * 1000) / 1000,
        mortalityRelief: Math.round(latest.mortalityRelief * 1000) / 1000,
        migrationFactor: Math.round(latest.migrationFactor * 1000) / 1000,
        moraleChange: modifiers.moraleYear,
        legitimacyChange: modifiers.legitimacyYear
    };
    faith.lastUpdateYear = year;
    touch(faith);
    const parts = [];
    if (latest.clergyCount) parts.push(latest.clergyCount + " clergy serving " + latest.congregation + " of " + latest.population);
    if (legend.budgetDue) parts.push(legend.budgetPaid + "/" + legend.budgetDue + " gold culture budget");
    if (pilgrimage) parts.push(pilgrimage.pilgrims + " pilgrims brought " + pilgrimage.goldEarned + " gold");
    parts.push("tension " + latest.heresyTension + " (" + latest.heresyLevel + ")");
    record(faith, "audit", "Faith audit year " + year + ": " + parts.join(" · "));
    return getFaithSnapshot();
}

export function validateFaithState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Save data contains an invalid faith state.");
    if (value.clergy !== undefined && (!Array.isArray(value.clergy) || value.clergy.length > MAX_CLERGY)) {
        throw new Error("Save data contains an invalid clergy list.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > FAITH_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid faith history.");
    }
    if (value.cultureBudget !== undefined && (!Number.isFinite(Number(value.cultureBudget)) || Number(value.cultureBudget) < 0 || Number(value.cultureBudget) > 3)) {
        throw new Error("Save data contains an invalid culture budget.");
    }
    if (value.heresy !== undefined && value.heresy !== null) {
        if (typeof value.heresy !== "object" || Array.isArray(value.heresy)) throw new Error("Save data contains an invalid heresy record.");
        if (value.heresy.tension !== undefined && (!Number.isFinite(Number(value.heresy.tension)) || Number(value.heresy.tension) < 0 || Number(value.heresy.tension) > 100)) {
            throw new Error("Save data contains an invalid heresy tension.");
        }
    }
    if (value.pilgrimage !== undefined && value.pilgrimage !== null && (typeof value.pilgrimage !== "object" || Array.isArray(value.pilgrimage))) {
        throw new Error("Save data contains an invalid pilgrimage record.");
    }
    return true;
}
