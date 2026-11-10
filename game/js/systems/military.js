// Named garrison, seasonal training, equipment, mounts and annual upkeep.
//
// The barracks and stables are no longer decorative building fields. This
// system converts real villagers into named soldiers, trains them over days,
// equips them from the treasury, mounts them from the stable reserve, pays and
// feeds them once per year, and feeds their rank, morale, wounds and horses
// back into combat, population, workforce and the royal court.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { random } from "../core/random.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { getCourtSnapshot } from "./court.js";
import { ensurePersonProfile, addPersonMemory } from "./people.js";
import { recordNaturalDeath } from "./mortality.js";
import { getFaithModifiers } from "./faith.js";
import { getJusticeModifiers } from "./justice.js";
import { getEndeavourModifiers } from "./endeavours.js";
import { getResearchModifiers } from "./research.js";
import { getCitizenModifiers } from "./population-register.js";
import { spawnEntity, canSpawnEntity } from "../world/entities.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/config.js";

export const MILITARY_INTERVAL = 10;
export const MILITARY_HISTORY_LIMIT = 24;
export const RANKS = Object.freeze(["recruit", "soldier", "veteran", "elite"]);
export const RANK_LABELS = Object.freeze({
    recruit: "RECRUIT",
    soldier: "SOLDIER",
    veteran: "VETERAN",
    elite: "ELITE GUARD"
});
export const MAX_BARRACKS_GARRISON = 8;
export const MAX_STABLE_HORSES = 4;
export const RECRUIT_COST = Object.freeze({ gold: 18, food: 12 });

const SOLDIER_TYPES = new Set([TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = value => Math.max(0, Math.round(Number(value) || 0));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));

function isCompleted(building) {
    return Boolean(building && !building.dead && !(building.construction && Number(building.construction.stage) < 3));
}

export function createMilitaryState() {
    return {
        version: 1,
        horses: 0,
        recruitsTrained: 0,
        losses: 0,
        desertions: 0,
        lastUpdateTick: 0,
        lastMusterYear: yearNow(),
        lastWarRaidYear: 0,
        lastPayroll: null,
        history: [],
        recentCasualties: []
    };
}

export function normalizeMilitaryState(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const history = (Array.isArray(source.history) ? source.history : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, MILITARY_HISTORY_LIMIT)
        .map(entry => ({
            year: clamp(entry.year, 1, 1000000),
            soldiers: round(entry.soldiers),
            horses: round(entry.horses),
            goldNeed: clamp(entry.goldNeed, 0, 1000000),
            goldPaid: clamp(entry.goldPaid, 0, 1000000),
            foodNeed: clamp(entry.foodNeed, 0, 1000000),
            foodPaid: clamp(entry.foodPaid, 0, 1000000),
            pannageDays: round(entry.pannageDays),
            desertions: round(entry.desertions),
            morale: clamp(entry.morale, 0, 100)
        }));
    const recentCasualties = (Array.isArray(source.recentCasualties) ? source.recentCasualties : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, 12)
        .map(entry => ({
            name: String(entry.name || "Unknown soldier").slice(0, 90),
            year: clamp(entry.year, 1, 1000000),
            cause: String(entry.cause || "battle").slice(0, 48)
        }));
    const lastPayroll = source.lastPayroll && typeof source.lastPayroll === "object" && !Array.isArray(source.lastPayroll)
        ? {
            year: clamp(source.lastPayroll.year, 1, 1000000),
            goldNeed: clamp(source.lastPayroll.goldNeed, 0, 1000000),
            goldPaid: clamp(source.lastPayroll.goldPaid, 0, 1000000),
            foodNeed: clamp(source.lastPayroll.foodNeed, 0, 1000000),
            foodPaid: clamp(source.lastPayroll.foodPaid, 0, 1000000),
            pannageDays: round(source.lastPayroll.pannageDays),
            desertions: round(source.lastPayroll.desertions)
        } : null;
    return {
        version: 1,
        horses: clamp(source.horses, 0, 500),
        recruitsTrained: round(source.recruitsTrained),
        losses: round(source.losses),
        desertions: round(source.desertions),
        lastUpdateTick: round(source.lastUpdateTick),
        lastMusterYear: clamp(source.lastMusterYear || yearNow(), 1, 1000000),
        lastWarRaidYear: clamp(source.lastWarRaidYear || 0, 0, 1000000),
        lastPayroll,
        history,
        recentCasualties
    };
}

function ensureMilitary() {
    if (!state.military || typeof state.military !== "object" || Array.isArray(state.military)) {
        state.military = createMilitaryState();
    }
    const normalized = normalizeMilitaryState(state.military);
    for (const key of Object.keys(normalized)) state.military[key] = normalized[key];
    if (!state.economy || typeof state.economy !== "object") state.economy = {};
    if (!Number.isFinite(Number(state.economy.militaryUpkeep))) state.economy.militaryUpkeep = 0;
    if (!Number.isFinite(Number(state.economy.militaryFood))) state.economy.militaryFood = 0;
    return state.military;
}

function completedBarracks() {
    return state.entities.filter(entity => isCompleted(entity) && entity.type === TYPE.BARRACKS);
}

function completedStables() {
    return state.entities.filter(entity => isCompleted(entity) && entity.type === TYPE.STABLE);
}

export function getMilitaryCapacity() {
    return completedBarracks().length * MAX_BARRACKS_GARRISON;
}

export function getStableCapacity() {
    return completedStables().length * MAX_STABLE_HORSES;
}

function isSoldier(entity) {
    return Boolean(entity && !entity.dead && !entity.isKing && SOLDIER_TYPES.has(entity.type));
}

function rankForSessions(sessions) {
    if (sessions >= 6) return "elite";
    if (sessions >= 3) return "veteran";
    if (sessions >= 1) return "soldier";
    return "recruit";
}

function rankIndex(rank) {
    const index = RANKS.indexOf(rank);
    return index < 0 ? 0 : index;
}

function defaultRecord(entity, { origin = "garrison" } = {}) {
    const person = ensurePersonProfile(entity, { role: "soldier" });
    const startingSessions = origin === "opening-garrison" ? 1 : 0;
    return {
        recruitId: String(entity.personId || entity.id),
        origin,
        sessions: startingSessions,
        rank: rankForSessions(startingSessions),
        equipment: origin === "opening-garrison" ? 32 : 24,
        morale: origin === "opening-garrison" ? 68 : 62,
        mounted: false,
        trainingStartedTick: 0,
        trainingCompletesTick: 0,
        trainingDuration: 0,
        trainingInstructor: null,
        trainingChance: 0,
        trainingAttempts: 0,
        battles: 0,
        kills: 0,
        wounds: 0,
        woundedUntilTick: 0,
        joinedYear: yearNow(),
        serviceYears: 0,
        lastPaidYear: 0,
        name: person?.name || "Unnamed soldier"
    };
}

function ensureSoldierRecord(entity, options = {}) {
    if (!isSoldier(entity)) return null;
    const person = ensurePersonProfile(entity, { role: "soldier" });
    if (!entity.military || typeof entity.military !== "object" || Array.isArray(entity.military)) {
        entity.military = defaultRecord(entity, options);
    }
    const record = entity.military;
    record.recruitId = String(record.recruitId || entity.personId || entity.id);
    record.origin = String(record.origin || "garrison").slice(0, 32);
    record.sessions = round(record.sessions);
    record.rank = RANKS.includes(record.rank) ? record.rank : rankForSessions(record.sessions);
    record.equipment = clamp(record.equipment ?? 24, 0, 100);
    record.morale = clamp(record.morale ?? 62, 0, 100);
    record.mounted = Boolean(record.mounted);
    record.trainingStartedTick = round(record.trainingStartedTick);
    record.trainingCompletesTick = round(record.trainingCompletesTick);
    record.trainingDuration = round(record.trainingDuration);
    record.trainingInstructor = record.trainingInstructor && typeof record.trainingInstructor === "object"
        ? { name: String(record.trainingInstructor.name || "Drillmaster").slice(0, 90), competence: clamp(record.trainingInstructor.competence, 0, 100) }
        : null;
    record.trainingChance = clamp(record.trainingChance, 0, 1);
    record.trainingAttempts = round(record.trainingAttempts);
    record.battles = round(record.battles);
    record.kills = round(record.kills);
    record.wounds = round(record.wounds);
    record.woundedUntilTick = round(record.woundedUntilTick);
    record.joinedYear = clamp(record.joinedYear || yearNow(), 1, 1000000);
    record.serviceYears = round(record.serviceYears);
    record.lastPaidYear = round(record.lastPaidYear);
    record.name = String(person?.name || record.name || "Unnamed soldier").slice(0, 90);
    return record;
}

function allSoldierEntities() {
    return state.entities.filter(entity => isSoldier(entity));
}

function registerExistingGarrison() {
    for (const entity of allSoldierEntities()) {
        if (!entity.personId) entity.personId = entity.id;
        ensureSoldierRecord(entity, { origin: "opening-garrison" });
    }
}

function getMarshal() {
    try {
        const court = getCourtSnapshot();
        const marshal = (court.offices || []).find(office => office.id === "marshal");
        if (marshal?.holder) {
            return {
                name: marshal.holder.name || "Court Marshal",
                competence: clamp(marshal.holder.competence, 0, 100),
                office: "Court Marshal"
            };
        }
    } catch { /* unit tests may not construct a court */ }
    const veterans = allSoldierEntities().filter(entity => rankIndex(entity.military?.rank) >= 2);
    if (veterans.length) {
        return {
            name: veterans[0].person?.name || "Veteran drillmaster",
            competence: 48,
            office: "Veteran drillmaster"
        };
    }
    return { name: "Garrison drillmaster", competence: 32, office: "Garrison" };
}

function atWar() {
    if (state.raidActive) return true;
    return Boolean((state.diplomacy?.realms || []).some(realm => realm.treaty === "war"));
}

function foodRatio() {
    const people = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const need = Math.max(1, people * 0.75);
    return clamp((Number(state.resources?.food) || 0) / need, 0, 1);
}

function seasonTrainingFactor() {
    // Spring, summer, autumn, winter. Winter drill is slower; harvest season
    // competes with the fields, while summer is the best training window.
    return [1.18, 0.92, 1.08, 1.28][clamp(state.seasonIndex, 0, 3)] || 1;
}

function trainingQuoteFor(entity) {
    const record = ensureSoldierRecord(entity);
    if (!record) return null;
    const marshal = getMarshal();
    const moraleFactor = 1.18 - record.morale / 420;
    const equipmentFactor = 1.12 - record.equipment / 360;
    const foodFactor = 1.16 - foodRatio() * 0.2;
    const rankFactor = 1 + rankIndex(record.rank) * 0.18;
    const warFactor = atWar() ? 0.86 : 1;
    const duration = clamp(Math.round(24 * seasonTrainingFactor() * moraleFactor * equipmentFactor * foodFactor * rankFactor * warFactor * (1.22 - marshal.competence / 260)), 10, 90);
    const successChance = clamp(
        0.34 + marshal.competence / 210 + record.equipment / 420 + record.morale / 560 +
        foodRatio() * 0.13 - (atWar() ? 0.05 : 0) - (state.seasonIndex === 3 ? 0.04 : 0) -
        rankIndex(record.rank) * 0.035,
        0.22, 0.94
    );
    const cost = {
        gold: 7 + rankIndex(record.rank) * 4,
        food: 4 + rankIndex(record.rank) * 2
    };
    return { duration, successChance, cost, marshal, atWar: atWar() };
}

export function trainSoldier(entityId) {
    ensureMilitary();
    const entity = state.entities.find(item => !item.dead && String(item.id) === String(entityId));
    const record = entity && ensureSoldierRecord(entity);
    if (!record) return { ok: false, reason: "SOLDIER NOT FOUND" };
    if (record.rank === "elite" && record.sessions >= 9) return { ok: false, reason: "THIS SOLDIER HAS REACHED THE HIGHEST DRILL STANDARD" };
    if (record.trainingCompletesTick > state.tick) return { ok: false, reason: "THIS SOLDIER IS ALREADY IN TRAINING" };
    if ((entity.illnessUntilTick || 0) > state.tick) return { ok: false, reason: "THE SOLDIER IS ILL" };
    if (record.woundedUntilTick > state.tick) return { ok: false, reason: "THE SOLDIER IS STILL RECOVERING" };
    const quote = trainingQuoteFor(entity);
    for (const [resource, amount] of Object.entries(quote.cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(quote.cost)) {
        addResource(resource, -amount);
        if (resource === "food") recordResourceMovement("food", -amount, "military-training", {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "military", id: String(entity.id) }
        });
    }
    record.trainingStartedTick = state.tick;
    record.trainingDuration = quote.duration;
    record.trainingCompletesTick = state.tick + quote.duration;
    record.trainingInstructor = { name: quote.marshal.name, competence: quote.marshal.competence };
    record.trainingChance = quote.successChance;
    record.trainingAttempts++;
    addLog("TRAINING BEGINS: " + record.name + " · " + quote.duration + " DAYS UNDER " + quote.marshal.name, "#d8c18a", "military");
    return { ok: true, entity, record, quote, message: "training begins" };
}

export function equipSoldier(entityId) {
    ensureMilitary();
    const entity = state.entities.find(item => !item.dead && String(item.id) === String(entityId));
    const record = entity && ensureSoldierRecord(entity);
    if (!record) return { ok: false, reason: "SOLDIER NOT FOUND" };
    if (record.equipment >= 96) return { ok: false, reason: "THE SOLDIER ALREADY CARRIES FULL EQUIPMENT" };
    const cost = { wood: 4 + rankIndex(record.rank) * 2, gold: 8 + rankIndex(record.rank) * 3 };
    for (const [resource, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
    const before = record.equipment;
    record.equipment = clamp(record.equipment + 14, 0, 100);
    record.morale = clamp(record.morale + 2, 0, 100);
    addLog("EQUIPMENT ISSUED TO " + record.name + ": " + Math.round(before) + " → " + Math.round(record.equipment), "#c9b17a", "military");
    return { ok: true, entity, record, cost, message: "equipment issued" };
}

export function buyHorse() {
    const military = ensureMilitary();
    const capacity = getStableCapacity();
    const assigned = allSoldierEntities().filter(entity => entity.military?.mounted).length;
    if (capacity <= 0) return { ok: false, reason: "BUILD A STABLE FIRST" };
    if (military.horses + assigned >= capacity) return { ok: false, reason: "THE STABLES ARE AT CAPACITY" };
    const cost = { gold: 22, food: 10 };
    for (const [resource, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
    military.horses++;
    addLog("A WARHORSE WAS RAISED AT THE STABLES · " + military.horses + " UNASSIGNED", "#c9b17a", "military");
    return { ok: true, cost, horses: military.horses, message: "horse purchased" };
}

export function mountSoldier(entityId) {
    const military = ensureMilitary();
    const entity = state.entities.find(item => !item.dead && String(item.id) === String(entityId));
    const record = entity && ensureSoldierRecord(entity);
    if (!record) return { ok: false, reason: "SOLDIER NOT FOUND" };
    if (record.mounted) return { ok: false, reason: "THE SOLDIER IS ALREADY MOUNTED" };
    if (record.rank === "recruit") return { ok: false, reason: "ONLY A TRAINED SOLDIER MAY RIDE INTO BATTLE" };
    if (military.horses <= 0) return { ok: false, reason: "NO UNASSIGNED WARHORSE IS AVAILABLE" };
    military.horses--;
    record.mounted = true;
    record.morale = clamp(record.morale + 4, 0, 100);
    addLog(record.name + " WAS MOUNTED ON A WARHORSE", "#c9b17a", "military");
    return { ok: true, entity, record, message: "warhorse assigned" };
}

export function recruitVillager(personId) {
    ensureMilitary();
    const capacity = getMilitaryCapacity();
    const garrison = allSoldierEntities().filter(entity => entity.military?.origin !== "opening-garrison" || entity.military?.sessions > 0).length;
    if (capacity <= 0) return { ok: false, reason: "BUILD A BARRACKS FIRST" };
    if (garrison >= capacity) return { ok: false, reason: "THE BARRACKS GARRISON IS FULL" };
    const candidate = state.entities.find(entity => !entity.dead && entity.type === TYPE.VILLAGER &&
        (String(entity.personId || entity.id) === String(personId) || String(entity.id) === String(personId)));
    if (!candidate) return { ok: false, reason: "RECRUIT NOT FOUND" };
    const person = ensurePersonProfile(candidate);
    if (person.ageYears < 16) return { ok: false, reason: "THE RESIDENT IS TOO YOUNG TO SERVE" };
    if ((candidate.illnessUntilTick || 0) > state.tick) return { ok: false, reason: "THE RESIDENT IS ILL" };
    if ((state.health?.healers || []).some(entry => String(entry.personId) === String(person.id))) {
        return { ok: false, reason: "THIS RESIDENT IS A PUBLIC HEALER" };
    }
    if ((Number(state.resources?.gold) || 0) < RECRUIT_COST.gold || (Number(state.resources?.food) || 0) < RECRUIT_COST.food) {
        return { ok: false, reason: "NEED " + RECRUIT_COST.gold + " GOLD / " + RECRUIT_COST.food + " FOOD" };
    }
    const barracks = completedBarracks()[0] || state.entities.find(entity => isCompleted(entity) && entity.type === TYPE.KEEP);
    addResource("gold", -RECRUIT_COST.gold);
    addResource("food", -RECRUIT_COST.food);
    recordResourceMovement("food", -RECRUIT_COST.food, "military-recruitment", {
        from: { kind: "realm", id: "royal-stores" },
        to: { kind: "military", id: String(candidate.id) }
    });

    // The resident leaves the workforce and becomes a garrison soldier. Their
    // household stays attached so the settlement ledger still knows where
    // they sleep; their labour is now military service.
    candidate.type = TYPE.GUARD;
    candidate.maxHp = Math.max(160, Number(candidate.maxHp) || 0);
    candidate.hp = candidate.maxHp;
    candidate.workplace = null;
    candidate.job = "soldier";
    candidate.jobRefreshTimer = 999999;
    candidate.anchor = barracks ? { x: barracks.x, y: barracks.y } : { x: candidate.x, y: candidate.y };
    candidate.military = defaultRecord(candidate, { origin: "levy" });
    candidate.person.role = "soldier";
    addPersonMemory(candidate, {
        id: "military:enlisted:" + state.year,
        type: "military",
        text: "I enlisted in the crown's garrison in year " + yearNow() + ".",
        tick: state.tick,
        importance: 76
    });
    state.statistics.totalUnitsRecruited = (Number(state.statistics.totalUnitsRecruited) || 0) + 1;
    addLog(person.name + " LEFT THE HOUSEHOLD TO SERVE IN THE GARRISON", "#c9b17a", "military");
    return { ok: true, entity: candidate, name: person.name, cost: { ...RECRUIT_COST }, message: "recruited" };
}

export function demobilizeSoldier(entityId) {
    ensureMilitary();
    const entity = state.entities.find(item => !item.dead && String(item.id) === String(entityId));
    const record = entity && ensureSoldierRecord(entity);
    if (!record) return { ok: false, reason: "SOLDIER NOT FOUND" };
    if (record.trainingCompletesTick > state.tick) return { ok: false, reason: "THE SOLDIER IS IN TRAINING" };
    if (record.mounted) ensureMilitary().horses++;
    // Returning a trained soldier to the village restores a worker but costs
    // the crown the equipment and severance pay. This is a real trade-off
    // between a broad militia and a small standing force.
    entity.type = TYPE.VILLAGER;
    entity.maxHp = 35;
    entity.hp = Math.min(35, Math.max(1, Number(entity.hp) || 35));
    entity.job = "labourer";
    entity.jobRefreshTimer = 0;
    entity.military = null;
    entity.person.role = "resident";
    const severance = 3 + rankIndex(record.rank) * 3;
    if ((Number(state.resources.gold) || 0) >= severance) addResource("gold", -severance);
    addLog(record.name + " WAS DEMOBILIZED · " + severance + " GOLD SEVERANCE", "#a3b18a", "military");
    return { ok: true, name: record.name, severance, message: "demobilized" };
}

function consumePannage(days) {
    let remaining = Math.max(0, Math.floor(Number(days) || 0));
    let used = 0;
    for (const stable of completedStables()) {
        if (remaining <= 0) break;
        const reserve = stable.pannage && typeof stable.pannage === "object" ? stable.pannage : null;
        if (!reserve) continue;
        const available = Math.max(0, Math.floor(Number(reserve.days) || 0));
        const take = Math.min(remaining, available);
        if (take <= 0) continue;
        reserve.days = available - take;
        remaining -= take;
        used += take;
    }
    return used;
}

function resolveMilitaryYear() {
    const military = ensureMilitary();
    const year = yearNow();
    if (year <= military.lastMusterYear) return null;
    military.lastMusterYear = year;
    registerExistingGarrison();
    const soldiers = allSoldierEntities();
    const unassignedHorses = Math.max(0, military.horses);
    let goldNeed = 0, foodNeed = 0;
    for (const entity of soldiers) {
        const record = ensureSoldierRecord(entity);
        const rankCost = [3, 5, 8, 12][rankIndex(record.rank)] || 3;
        goldNeed += rankCost + (record.mounted ? 5 : 0);
        foodNeed += 2 + (record.mounted ? 2 : 0);
    }
    foodNeed += unassignedHorses * 2;
    const pannageDays = consumePannage(Math.ceil(foodNeed * 0.5));
    foodNeed = Math.max(0, foodNeed - pannageDays);
    const goldPaid = Math.min(Math.max(0, Number(state.resources.gold) || 0), goldNeed);
    const foodPaid = Math.min(Math.max(0, Number(state.resources.food) || 0), foodNeed);
    if (goldPaid > 0) addResource("gold", -goldPaid);
    if (foodPaid > 0) {
        addResource("food", -foodPaid);
        recordResourceMovement("food", -foodPaid, "military-upkeep", {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "military", id: "garrison" }
        });
    }
    state.economy.militaryUpkeep = (Number(state.economy.militaryUpkeep) || 0) + goldPaid;
    state.economy.militaryFood = (Number(state.economy.militaryFood) || 0) + foodPaid;
    const goldRatio = goldNeed > 0 ? goldPaid / goldNeed : 1;
    const foodRatioNow = foodNeed > 0 ? foodPaid / foodNeed : 1;
    const faith = getFaithModifiers();
    const justice = getJusticeModifiers();
    let desertions = 0;
    for (const entity of soldiers) {
        const record = ensureSoldierRecord(entity);
        record.serviceYears++;
        record.lastPaidYear = year;
        const hardship = (1 - goldRatio) * 0.25 + (1 - foodRatioNow) * 0.18;
        const warService = atWar() ? 2 : 0;
        record.morale = clamp(record.morale + 4 + (goldRatio >= 1 ? 3 : -8) + (foodRatioNow >= 1 ? 1 : -6) - warService + (record.mounted ? -1 : 0) + faith.militaryMorale, 0, 100);
        const desertionChance = clamp((hardship + (record.morale < 28 ? 0.1 : 0) + (record.mounted ? 0.015 : 0)) * justice.desertionFactor, 0, 0.45);
        if (desertionChance > 0 && random("military") < desertionChance) {
            entity.dead = true;
            military.desertions++;
            desertions++;
            military.recentCasualties.unshift({ name: record.name, year, cause: "desertion" });
            addLog("DESERTION: " + record.name + " LEFT THE GARRISON", "#b99a9a", "military");
        }
    }
    military.recentCasualties = military.recentCasualties.slice(0, 12);
    const payroll = {
        year,
        soldiers: soldiers.length,
        horses: unassignedHorses + soldiers.filter(entity => entity.military?.mounted).length,
        goldNeed,
        goldPaid,
        foodNeed,
        foodPaid,
        pannageDays,
        desertions,
        morale: soldiers.length ? soldiers.reduce((sum, entity) => sum + (Number(entity.military?.morale) || 0), 0) / soldiers.length : 0
    };
    military.lastPayroll = payroll;
    military.history.unshift(payroll);
    military.history = military.history.slice(0, MILITARY_HISTORY_LIMIT);
    if (soldiers.length) {
        addLog("GARRISON MUSTER · " + soldiers.length + " SOLDIERS · " + Math.round(goldPaid) + "/" + Math.round(goldNeed) + " GOLD PAID · " + Math.round(foodPaid) + "/" + Math.round(foodNeed) + " FOOD" + (desertions ? " · " + desertions + " DESERTED" : ""), "#d8c18a", "military");
    }
    return payroll;
}

function maybeLaunchWarFront(military, year) {
    const realm = (state.diplomacy?.realms || []).find(entry => entry.treaty === "war");
    if (!realm || state.raidActive) return;
    if (Number(military.lastWarRaidYear) === year) return;
    military.lastWarRaidYear = year;
    const keep = state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP);
    if (!keep || !canSpawnEntity(TYPE.TROLL)) return;
    const angle = random("war-front") * Math.PI * 2;
    const distance = 12 + random("war-front") * 7;
    const x = Math.max(2, Math.min(WORLD_WIDTH - 3, keep.x + Math.cos(angle) * distance));
    const y = Math.max(2, Math.min(WORLD_HEIGHT - 3, keep.y + Math.sin(angle) * distance));
    let spawned = 0;
    for (let index = 0; index < 2; index++) {
        if (spawnEntity(x + index * 0.7, y, TYPE.TROLL)) spawned++;
    }
    if (!spawned) return;
    state.raidActive = true;
    addLog("WAR FRONT: " + spawned + " RAIDERS CROSS THE BORDER FROM " + String(realm.name || "THE ENEMY").toUpperCase(), "#e9857b", "military");
}

export function updateMilitary() {
    const military = ensureMilitary();
    const year = yearNow();
    if (year > military.lastMusterYear) resolveMilitaryYear();
    maybeLaunchWarFront(military, year);
    if (state.tick <= 0 || state.tick % MILITARY_INTERVAL !== 0 || military.lastUpdateTick === state.tick) return null;
    military.lastUpdateTick = state.tick;
    registerExistingGarrison();
    let completed = 0;
    for (const entity of allSoldierEntities()) {
        const record = ensureSoldierRecord(entity);
        if (record.woundedUntilTick > 0 && record.woundedUntilTick <= state.tick) {
            record.woundedUntilTick = 0;
            addLog(record.name + " HAS RECOVERED FROM THEIR WOUNDS", "#a3b18a", "military");
        }
        if (!record.trainingCompletesTick || record.trainingCompletesTick > state.tick) continue;
        const previousRank = record.rank;
        const success = random("military") < record.trainingChance;
        record.trainingCompletesTick = 0;
        record.trainingStartedTick = 0;
        record.trainingDuration = 0;
        record.trainingInstructor = null;
        if (success) {
            record.sessions++;
            record.rank = rankForSessions(record.sessions);
            record.equipment = clamp(record.equipment + 3, 0, 100);
            record.morale = clamp(record.morale + 6, 0, 100);
            military.recruitsTrained++;
            completed++;
            if (rankIndex(record.rank) > rankIndex(previousRank)) {
                addLog(record.name + " WAS PROMOTED TO " + RANK_LABELS[record.rank], "#e8c77b", "military");
                addPersonMemory(entity, {
                    id: "military:promotion:" + record.rank + ":" + state.year,
                    type: "military",
                    text: "I was promoted to " + RANK_LABELS[record.rank] + " in year " + yearNow() + ".",
                    tick: state.tick,
                    importance: 86
                });
            } else {
                addLog("DRILL COMPLETED: " + record.name + " · " + RANK_LABELS[record.rank], "#d8c18a", "military");
            }
        } else {
            record.morale = clamp(record.morale - 5, 0, 100);
            addLog("DRILL FAILED: " + record.name + " · MORALE FALLS", "#b99a9a", "military");
        }
    }
    return { completed };
}

export function getSoldierPower(entity) {
    if (!isSoldier(entity)) return 0;
    const record = ensureSoldierRecord(entity);
    if (!record) return 0;
    const base = entity.type === TYPE.KNIGHT ? 34 : entity.type === TYPE.ARCHER ? 16 : 18;
    const rankBonus = 1 + rankIndex(record.rank) * 0.18;
    const equipmentBonus = 1 + record.equipment / 260;
    const moraleBonus = 0.72 + record.morale / 280;
    const mountBonus = record.mounted ? 1.18 : 1;
    const woundPenalty = record.woundedUntilTick > state.tick ? 0.55 : 1;
    // Better metallurgy and mechanical arts reach the drill yard as real power.
    const researchBonus = getResearchModifiers().militaryBonus;
    const endeavourBonus = 1 + Math.max(0, Number(getEndeavourModifiers().military) || 0);
    return base * rankBonus * equipmentBonus * moraleBonus * mountBonus * woundPenalty *
        (1 + getFaithModifiers().militaryMorale / 260) * researchBonus * getCitizenModifiers().militaryQuality * endeavourBonus;
}

export function getSoldierArmor(entity) {
    if (!isSoldier(entity)) return 0;
    const record = ensureSoldierRecord(entity);
    if (!record) return 0;
    return clamp(record.equipment / 330 + (record.mounted ? 0.06 : 0) + (record.rank === "elite" ? 0.05 : 0), 0, 0.38);
}

export function recordMilitaryVictory(entity) {
    const record = entity && ensureSoldierRecord(entity);
    if (!record) return;
    record.battles++;
    record.kills++;
    record.morale = clamp(record.morale + 0.7, 0, 100);
}

export function recordMilitaryWound(entity) {
    const record = entity && ensureSoldierRecord(entity);
    if (!record) return;
    record.wounds++;
    record.battles++;
    record.morale = clamp(record.morale - 3, 0, 100);
    record.woundedUntilTick = state.tick + 90;
}

export function recordMilitaryCasualty(entity, cause = "battle") {
    if (!entity) return null;
    const military = ensureMilitary();
    const record = ensureSoldierRecord(entity);
    const name = record?.name || entity.person?.name || "Unknown soldier";
    military.losses++;
    military.recentCasualties.unshift({ name, year: yearNow(), cause: String(cause).slice(0, 48) });
    military.recentCasualties = military.recentCasualties.slice(0, 12);
    addLog("FALLEN: " + name + " · " + String(cause).toUpperCase(), "#b99a9a", "military");
    if (entity.personId && !entity.dead) {
        try {
            recordNaturalDeath(entity, "battle");
        } catch {
            entity.dead = true;
        }
    } else {
        entity.dead = true;
    }
    return { name, cause };
}

export function getMilitarySnapshot() {
    const military = ensureMilitary();
    registerExistingGarrison();
    const soldiers = allSoldierEntities()
        .map(entity => {
            const record = ensureSoldierRecord(entity);
            const person = ensurePersonProfile(entity, { role: "soldier" });
            const training = record.trainingCompletesTick > state.tick;
            return {
                id: String(entity.id),
                personId: String(entity.personId || entity.id),
                name: record.name,
                age: Math.floor(Number(person.ageYears) || 0),
                species: person.species,
                type: entity.type,
                rank: record.rank,
                rankLabel: RANK_LABELS[record.rank],
                rankIndex: rankIndex(record.rank),
                sessions: record.sessions,
                equipment: Math.round(record.equipment),
                morale: Math.round(record.morale),
                mounted: record.mounted,
                status: training ? "TRAINING" : record.woundedUntilTick > state.tick ? "WOUNDED" : record.mounted ? "MOUNTED" : "READY",
                training: training ? {
                    startedTick: record.trainingStartedTick,
                    completesTick: record.trainingCompletesTick,
                    remaining: Math.max(0, record.trainingCompletesTick - state.tick),
                    duration: record.trainingDuration,
                    instructor: record.trainingInstructor,
                    chance: record.trainingChance
                } : null,
                battles: record.battles,
                kills: record.kills,
                wounds: record.wounds,
                serviceYears: record.serviceYears,
                power: Math.round(getSoldierPower(entity) * 10) / 10,
                armor: Math.round(getSoldierArmor(entity) * 100)
            };
        })
        .sort((a, b) => b.rankIndex - a.rankIndex || a.name.localeCompare(b.name));
    const candidates = state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)
        .filter(entity => {
            const person = ensurePersonProfile(entity);
            return person.ageYears >= 16 && !(entity.illnessUntilTick > state.tick);
        })
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return {
                personId: String(entity.personId || entity.id),
                id: String(entity.id),
                name: person.name,
                age: Math.floor(person.ageYears),
                job: String(entity.job || "resident"),
                species: person.species
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    const capacity = getMilitaryCapacity();
    const barracks = completedBarracks();
    const stables = completedStables();
    const horses = Math.max(0, Number(military.horses) || 0);
    const assignedHorses = soldiers.filter(soldier => soldier.mounted).length;
    const stableCapacity = getStableCapacity();
    const averageMorale = soldiers.length ? soldiers.reduce((sum, soldier) => sum + soldier.morale, 0) / soldiers.length : 0;
    const averageEquipment = soldiers.length ? soldiers.reduce((sum, soldier) => sum + soldier.equipment, 0) / soldiers.length : 0;
    return {
        soldiers,
        candidates,
        capacity,
        garrison: soldiers.length,
        barracks: barracks.length,
        stables: stables.length,
        freeBeds: Math.max(0, capacity - soldiers.length),
        horses,
        assignedHorses,
        horseCapacity: stableCapacity,
        freeHorseCapacity: Math.max(0, stableCapacity - horses - assignedHorses),
        averageMorale: Math.round(averageMorale),
        averageEquipment: Math.round(averageEquipment),
        readiness: Math.round(clamp((averageMorale * 0.55 + averageEquipment * 0.45) * (atWar() ? 1.05 : 1), 0, 100)),
        marshal: getMarshal(),
        atWar: atWar(),
        lastPayroll: military.lastPayroll,
        history: military.history,
        recentCasualties: military.recentCasualties,
        trained: military.recruitsTrained,
        losses: military.losses,
        desertions: military.desertions,
        recruitCost: RECRUIT_COST
    };
}

export function validateMilitaryState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid military state.");
    }
    if (value.horses !== undefined && (!Number.isFinite(Number(value.horses)) || Number(value.horses) < 0)) {
        throw new Error("Save data contains an invalid mounted reserve.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > MILITARY_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid military history.");
    }
    if (value.recentCasualties !== undefined && (!Array.isArray(value.recentCasualties) || value.recentCasualties.length > 12)) {
        throw new Error("Save data contains an invalid casualty record.");
    }
    return true;
}
