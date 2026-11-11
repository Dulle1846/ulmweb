// Living population register: every living resident has a civic record and a
// real household. Person profiles remain the canonical identity; this register
// adds origin, profession, faith, health, loyalty, wealth and household ties.
//
// The register is advanced once per realm year, never per frame. It is fully
// deterministic (no Math.random) and bounded to the same mobile population cap
// as the world, so a large realm cannot turn the census into an unbounded scan.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { isHousingType, housingCapacityFor } from "./city-config.js";
import { ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { RELIGIONS, TRADITIONS } from "./identity.js";

export const POPULATION_REGISTER_VERSION = 1;
export const MAX_REGISTERED_CITIZENS = 420;
export const MAX_REGISTERED_HOUSEHOLDS = 900;
export const CITIZEN_HISTORY_LIMIT = 8;
export const HOUSEHOLD_HISTORY_LIMIT = 12;
export const HOUSEHOLD_WEALTH_CAP = 5000;
export const CROWN_HOUSEHOLD_ID = "crown:household";

const SOLDIER_TYPES = new Set([TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT]);
const CLERGY_TYPES = new Set([TYPE.PRIEST]);
const ROYAL_HOUSEHOLD_CAPACITY = 12;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const cleanText = (value, max, fallback = "") => {
    const clean = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
    return clean || fallback;
};
const asObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : null;

const PROFESSION_TRAITS = Object.freeze({
    Farmer: ["discipline", "patience"],
    Farmhand: ["discipline", "patience"],
    Woodcutter: ["discipline", "courage"],
    Forester: ["patience", "curiosity"],
    Quarryman: ["discipline", "courage"],
    Miner: ["discipline", "courage"],
    Miller: ["discipline", "patience"],
    Baker: ["discipline", "compassion"],
    Mason: ["discipline", "curiosity"],
    Soldier: ["courage", "discipline"],
    Healer: ["compassion", "curiosity"],
    Cleric: ["piety", "compassion"],
    Scholar: ["curiosity", "patience"],
    Merchant: ["greed", "sociability"],
    Innkeeper: ["sociability", "compassion"],
    Courtier: ["ambition", "sociability"],
    Child: ["curiosity", "sociability"],
    Resident: ["sociability", "patience"]
});
const JOB_LABELS = Object.freeze({
    farmer: "Farmer", farmhand: "Farmhand", woodcutter: "Woodcutter", forester: "Forester",
    quarryman: "Quarryman", miner: "Miner", miller: "Miller", baker: "Baker",
    mason: "Mason", soldier: "Soldier", healer: "Healer", priest: "Cleric",
    scholar: "Scholar", merchant: "Merchant", innkeeper: "Innkeeper", courtier: "Courtier",
    wanderer: "Resident", resident: "Resident"
});
const BUILDING_PROFESSIONS = Object.freeze({
    [TYPE.FARM]: "Farmer", [TYPE.LUMBER]: "Woodcutter", [TYPE.QUARRY]: "Quarryman",
    [TYPE.GOLDMINE]: "Miner", [TYPE.MILL]: "Miller", [TYPE.BAKERY]: "Baker",
    [TYPE.TAVERN]: "Innkeeper", [TYPE.TEMPLE]: "Cleric", [TYPE.MARKET]: "Merchant",
    [TYPE.MASON]: "Mason", [TYPE.FORESTER]: "Forester", [TYPE.CLINIC]: "Healer",
    [TYPE.KEEP]: "Courtier"
});
const STATUS_LABELS = Object.freeze({
    royal: "Royal", soldier: "Soldier", healer: "Healer", clergy: "Clergy",
    scholar: "Scholar", child: "Child", elder: "Elder", worker: "Worker",
    unemployed: "Unemployed", resident: "Resident"
});

function emptyTotals() {
    return {
        population: 0, civilians: 0, soldiers: 0, households: 0, housed: 0, unhoused: 0,
        children: 0, adults: 0, elders: 0, employed: 0, unemployed: 0,
        avgAge: 0, avgLoyalty: 0, avgHappiness: 0, avgHealth: 0, avgTalent: 0,
        soldierTalent: 50, wealth: 0, births: 0, deaths: 0, emigration: 0, year: 0, tick: 0
    };
}

export function createPopulationState() {
    return {
        version: POPULATION_REGISTER_VERSION,
        households: {},
        citizens: {},
        totals: emptyTotals(),
        history: [],
        departures: [],
        lastCensusYear: 0,
        lastCensusTick: 0
    };
}

function normalizeTalent(value) {
    const source = asObject(value) || {};
    return {
        score: clamp(Math.round(Number(source.score) || 0), 0, 100),
        focus: cleanText(source.focus, 32, "Discipline"),
        traits: Array.isArray(source.traits)
            ? source.traits.filter(item => typeof item === "string").slice(0, 4).map(item => item.slice(0, 24))
            : []
    };
}

function normalizeCitizenRecord(value, id) {
    const source = asObject(value) || {};
    return {
        id: cleanText(source.id, 100, id),
        name: cleanText(source.name, 90, "Unnamed resident"),
        species: Object.hasOwn(PERSON_SPECIES, source.species) ? source.species : "human",
        sex: source.sex === "female" || source.sex === "male" ? source.sex : "female",
        ageYears: clampInt(source.ageYears, 0, 1000),
        role: cleanText(source.role, 32, "resident"),
        origin: cleanText(source.origin, 64, "Realm-born"),
        householdId: source.householdId == null ? null : cleanText(source.householdId, 80, ""),
        profession: cleanText(source.profession, 40, "Resident"),
        status: Object.hasOwn(STATUS_LABELS, source.status) ? source.status : "resident",
        faithId: cleanText(source.faithId, 32, "ancestral"),
        faith: cleanText(source.faith, 64, "Ancestral hearth"),
        traditionId: cleanText(source.traditionId, 32, "hearth"),
        tradition: cleanText(source.tradition, 64, "Open hearth"),
        healthStatus: ["healthy", "wounded", "ill"].includes(source.healthStatus) ? source.healthStatus : "healthy",
        healthScore: clamp(Math.round(Number(source.healthScore) || 80), 0, 100),
        immunity: clamp(Math.round(Number(source.immunity) || 0), 0, 100),
        happiness: clamp(Math.round(Number(source.happiness) || 50), 0, 100),
        loyalty: clamp(Math.round(Number(source.loyalty) || 50), 0, 100),
        talent: normalizeTalent(source.talent),
        wealthShare: clamp(Number(source.wealthShare) || 0, 0, HOUSEHOLD_WEALTH_CAP),
        householdWealth: clamp(Number(source.householdWealth) || 0, 0, HOUSEHOLD_WEALTH_CAP),
        joinedYear: clampInt(source.joinedYear, 1, 1000000),
        lastUpdatedYear: clampInt(source.lastUpdatedYear, 1, 1000000),
        civilian: source.civilian === undefined ? true : Boolean(source.civilian),
        soldier: Boolean(source.soldier),
        royal: Boolean(source.royal),
        professionHistory: (Array.isArray(source.professionHistory) ? source.professionHistory : [])
            .filter(item => item && typeof item === "object")
            .slice(-CITIZEN_HISTORY_LIMIT)
            .map(item => ({ year: clampInt(item.year, 1, 1000000), from: cleanText(item.from, 40, "Resident"), to: cleanText(item.to, 40, "Resident") })),
        events: (Array.isArray(source.events) ? source.events : [])
            .filter(item => item && typeof item === "object")
            .slice(-CITIZEN_HISTORY_LIMIT)
            .map(item => ({ year: clampInt(item.year, 1, 1000000), kind: cleanText(item.kind, 24, "life"), text: cleanText(item.text, 180, "A life event was recorded.") }))
    };
}

function normalizeHouseholdRecord(value, id) {
    const source = asObject(value) || {};
    const relationKinds = new Set(["partners", "parent-child", "siblings", "kin"]);
    return {
        id: cleanText(source.id, 80, id),
        x: clampInt(source.x, 0, 1000000),
        y: clampInt(source.y, 0, 1000000),
        type: clampInt(source.type, 0, 1000),
        capacity: clampInt(source.capacity, 0, 32),
        memberIds: [...new Set((Array.isArray(source.memberIds) ? source.memberIds : []).filter(item => typeof item === "string").slice(0, 32))],
        headId: source.headId == null ? null : cleanText(source.headId, 100, ""),
        wealth: clamp(Number(source.wealth) || 0, 0, HOUSEHOLD_WEALTH_CAP),
        loyalty: clamp(Math.round(Number(source.loyalty) || 0), 0, 100),
        happiness: clamp(Math.round(Number(source.happiness) || 0), 0, 100),
        formedYear: clampInt(source.formedYear, 1, 1000000),
        lastUpdatedYear: clampInt(source.lastUpdatedYear, 1, 1000000),
        relations: (Array.isArray(source.relations) ? source.relations : [])
            .filter(item => item && typeof item === "object")
            .slice(0, 32)
            .map(item => ({
                a: cleanText(item.a, 100, ""), b: cleanText(item.b, 100, ""),
                kind: relationKinds.has(item.kind) ? item.kind : "kin"
            }))
            .filter(item => item.a && item.b && item.a !== item.b),
        history: (Array.isArray(source.history) ? source.history : [])
            .filter(item => item && typeof item === "object")
            .slice(-HOUSEHOLD_HISTORY_LIMIT)
            .map(item => ({
                year: clampInt(item.year, 1, 1000000), members: clampInt(item.members, 0, 32),
                wealth: clamp(Number(item.wealth) || 0, 0, HOUSEHOLD_WEALTH_CAP),
                loyalty: clamp(Math.round(Number(item.loyalty) || 0), 0, 100),
                happiness: clamp(Math.round(Number(item.happiness) || 0), 0, 100)
            }))
    };
}

export function normalizePopulationState(value) {
    const source = asObject(value) || {};
    const households = {};
    for (const [id, record] of Object.entries(asObject(source.households) || {}).slice(0, MAX_REGISTERED_HOUSEHOLDS)) {
        if (!asObject(record)) continue;
        const normalized = normalizeHouseholdRecord(record, id);
        households[normalized.id] = normalized;
    }
    const citizens = {};
    for (const [id, record] of Object.entries(asObject(source.citizens) || {}).slice(0, MAX_REGISTERED_CITIZENS)) {
        if (!asObject(record)) continue;
        const normalized = normalizeCitizenRecord(record, id);
        citizens[normalized.id] = normalized;
    }
    const totalsSource = asObject(source.totals) || {};
    const totals = { ...emptyTotals() };
    for (const key of Object.keys(totals)) totals[key] = clamp(Number(totalsSource[key]) || 0, 0, key === "wealth" ? 100000000 : 1000000);
    const history = (Array.isArray(source.history) ? source.history : [])
        .filter(item => item && typeof item === "object")
        .slice(-25)
        .map(item => ({
            year: clampInt(item.year, 1, 1000000), population: clampInt(item.population, 0, MAX_REGISTERED_CITIZENS),
            households: clampInt(item.households, 0, MAX_REGISTERED_HOUSEHOLDS),
            loyalty: clamp(Math.round(Number(item.loyalty) || 0), 0, 100),
            happiness: clamp(Math.round(Number(item.happiness) || 0), 0, 100),
            wealth: clamp(Number(item.wealth) || 0, 0, 100000000)
        }));
    const departures = (Array.isArray(source.departures) ? source.departures : [])
        .filter(item => item && typeof item === "object")
        .slice(-12)
        .map(item => ({
            personId: cleanText(item.personId, 100, ""), name: cleanText(item.name, 90, "Unknown resident"),
            year: clampInt(item.year, 1, 1000000), reason: cleanText(item.reason, 80, "left the realm")
        }))
        .filter(item => item.personId);
    return {
        version: POPULATION_REGISTER_VERSION,
        households, citizens, totals, history, departures,
        lastCensusYear: clampInt(source.lastCensusYear, 0, 1000000),
        lastCensusTick: clampInt(source.lastCensusTick, 0, 1000000000)
    };
}

function isCitizenEntity(entity) {
    if (!entity || entity.dead || !entity.personId) return false;
    if (entity.type === TYPE.VILLAGER || entity.isKing || entity.isRoyalFamily) return true;
    return SOLDIER_TYPES.has(entity.type) || CLERGY_TYPES.has(entity.type);
}

function completedHouses() {
    return state.entities
        .filter(entity => !entity.dead && isHousingType(entity.type) && !(entity.construction && entity.construction.stage < 3))
        .sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));
}

function identityFaith() {
    const id = Object.hasOwn(RELIGIONS, state.identity?.religion) ? state.identity.religion : "ancestral";
    return { id, label: RELIGIONS[id]?.label || "Ancestral hearth" };
}

function identityTradition() {
    const id = Object.hasOwn(TRADITIONS, state.identity?.tradition) ? state.identity.tradition : "hearth";
    return { id, label: TRADITIONS[id]?.label || "Open hearth" };
}

function professionFor(entity, person, year) {
    if (entity.isKing || entity.isRoyalFamily || person.role === "royal") return { id: "crown", label: "Crown", status: "royal" };
    if (SOLDIER_TYPES.has(entity.type)) return { id: "soldier", label: "Soldier", status: "soldier" };
    if (CLERGY_TYPES.has(entity.type) || entity.faithRole) return { id: "clergy", label: "Cleric", status: "clergy" };
    if (entity.isHealer || entity.healthRole) return { id: "healer", label: "Healer", status: "healer" };
    if (person.role === "scholar") return { id: "scholar", label: "Scholar", status: "scholar" };
    const species = PERSON_SPECIES[person.species] || PERSON_SPECIES.human;
    if (Number(person.ageYears) < species.maturation) return { id: "child", label: "Child", status: "child" };
    if (person.lifeStage === "elder") return { id: "elder", label: JOB_LABELS[entity.job] || "Elder", status: "elder" };
    const job = String(entity.job || "").toLowerCase();
    if (job && job !== "wanderer" && job !== "resident") {
        return { id: job, label: JOB_LABELS[job] || cleanText(entity.job, 40, "Resident"), status: "worker" };
    }
    const workplace = entity.workplace && !entity.workplace.dead ? entity.workplace : null;
    if (workplace) {
        const label = BUILDING_PROFESSIONS[workplace.type] || "Resident";
        return { id: label.toLowerCase(), label, status: "worker" };
    }
    return { id: "resident", label: "Resident", status: "unemployed" };
}

function talentFor(person, profession) {
    const traits = PROFESSION_TRAITS[profession] || PROFESSION_TRAITS.Resident;
    const values = traits.map(key => Number(person.traits?.[key]) || 50);
    return {
        score: clamp(Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)), 0, 100),
        focus: traits.map(key => key.charAt(0).toUpperCase() + key.slice(1)).join(" & "),
        traits
    };
}

function healthFor(entity) {
    const maxHp = Math.max(1, Number(entity.maxHp) || 1);
    const hp = Math.max(0, Math.min(maxHp, Number.isFinite(Number(entity.hp)) ? Number(entity.hp) : maxHp));
    const ill = Number(entity.illnessUntilTick) > state.tick;
    const severity = clamp(Number(entity.illnessSeverity) || 0, 0, 3);
    const score = clamp(Math.round((hp / maxHp) * 76 + (ill ? 4 : 18) - severity * 7), 0, 100);
    return {
        status: ill ? "ill" : hp / maxHp < 0.55 ? "wounded" : "healthy",
        score,
        immunity: clamp(Math.round(Number(entity.immunity) || 0), 0, 100)
    };
}

function originFor(entity, person, previous) {
    if (previous?.origin) return previous.origin;
    if (entity.isKing || entity.isRoyalFamily) return "Founding dynasty";
    if (person.role === "child" || Number(person.ageYears) < (PERSON_SPECIES[person.species]?.maturation || 16)) return "Born in the realm";
    if (entity.civicOrigin === "settler") return "Settled from beyond the realm";
    return "Realm-born";
}

function baseCivicScores(entity, person, profession, health) {
    const needs = Object.values(person.needs || {});
    const needAverage = needs.length ? needs.reduce((sum, value) => sum + (Number(value) || 0), 0) / needs.length : 50;
    const morale = clamp(state.morale, 0, 100);
    const legitimacy = clamp(state.politics?.legitimacy, 0, 100);
    const statusBonus = profession.status === "royal" ? 10 : profession.status === "soldier" ? 2 :
        profession.status === "child" ? 5 : profession.status === "unemployed" ? -5 : 2;
    const healthPenalty = health.status === "ill" ? 9 : health.status === "wounded" ? 4 : 0;
    const happiness = clamp(Math.round(needAverage * 0.48 + morale * 0.24 + legitimacy * 0.14 + statusBonus + health.score * 0.09 - healthPenalty), 0, 100);
    const loyalty = clamp(Math.round(legitimacy * 0.30 + morale * 0.16 + needAverage * 0.22 + health.score * 0.12 + 14 + statusBonus - healthPenalty * 0.5), 0, 100);
    return { happiness, loyalty, needAverage };
}

function relationKind(first, second) {
    const a = first.person, b = second.person;
    if (!a || !b) return null;
    if (a.kinship?.partners.some(link => link.personId === second.personId && ["partner", "married"].includes(link.status))) return "partners";
    if (a.kinship?.parents.some(link => link.personId === second.personId) ||
        b.kinship?.parents.some(link => link.personId === first.personId)) return "parent-child";
    const aParents = new Set((a.kinship?.parents || []).map(link => link.personId));
    if ((b.kinship?.parents || []).some(link => aParents.has(link.personId))) return "siblings";
    return null;
}

function buildRelations(members, byId) {
    const relations = [];
    for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
            const first = byId.get(members[i]), second = byId.get(members[j]);
            if (!first || !second) continue;
            const kind = relationKind(first, second);
            if (kind) relations.push({ a: members[i], b: members[j], kind });
            if (relations.length >= 32) return relations;
        }
    }
    return relations;
}

function chooseHome(entity, houses, occupancy, houseByKey) {
    const currentKey = entity.home ? `house:${entity.home.x}:${entity.home.y}` : null;
    if (currentKey && houseByKey.has(currentKey) && (occupancy.get(currentKey) || 0) < houseByKey.get(currentKey)) {
        occupancy.set(currentKey, (occupancy.get(currentKey) || 0) + 1);
        entity.householdId = currentKey;
        return currentKey;
    }
    const candidates = houses
        .filter(house => (occupancy.get(`house:${house.x}:${house.y}`) || 0) < houseByKey.get(`house:${house.x}:${house.y}`))
        .sort((a, b) => {
            const aKey = `house:${a.x}:${a.y}`, bKey = `house:${b.x}:${b.y}`;
            const occupancyDelta = (occupancy.get(aKey) || 0) - (occupancy.get(bKey) || 0);
            if (occupancyDelta) return occupancyDelta;
            const da = Math.hypot(a.x - entity.x, a.y - entity.y);
            const db = Math.hypot(b.x - entity.x, b.y - entity.y);
            return da - db || a.y - b.y || a.x - b.x;
        });
    const home = candidates[0];
    if (!home) {
        entity.householdId = null;
        return null;
    }
    const key = `house:${home.x}:${home.y}`;
    occupancy.set(key, (occupancy.get(key) || 0) + 1);
    entity.home = { x: home.x, y: home.y };
    entity.anchor = { x: home.x, y: home.y };
    entity.householdId = key;
    return key;
}

function moveIntoHousehold(entity, targetKey) {
    const parts = String(targetKey || "").split(":");
    const x = Number(parts[1]), y = Number(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    entity.home = { x, y };
    entity.anchor = { x, y };
    entity.householdId = targetKey;
    return true;
}

function formPartnerHouseholds(citizens, houses, houseByKey, occupancy) {
    const byId = new Map(citizens.map(entity => [String(entity.personId || entity.id), entity]));
    const moved = new Set();
    const formed = new Set();
    let moves = 0;
    for (const entity of citizens) {
        if (moves >= 16 || moved.has(String(entity.personId || entity.id))) continue;
        const person = ensurePersonProfile(entity);
        for (const link of person.kinship.partners) {
            if (!["partner", "married"].includes(link.status)) continue;
            const partner = byId.get(String(link.personId));
            if (!partner || partner === entity || moved.has(String(partner.personId || partner.id))) continue;
            const firstKey = entity.householdId;
            const secondKey = partner.householdId;
            if (!firstKey || !secondKey || firstKey === secondKey) continue;
            const firstCapacity = houseByKey.get(firstKey) || 0;
            const secondCapacity = houseByKey.get(secondKey) || 0;
            const firstOccupancy = occupancy.get(firstKey) || 0;
            const secondOccupancy = occupancy.get(secondKey) || 0;
            if (!firstCapacity || !secondCapacity) continue;
            const moveInside = (targetKey, targetCapacity, sourceKey) => {
                if ((occupancy.get(targetKey) || 0) >= targetCapacity) return false;
                occupancy.set(sourceKey, Math.max(0, (occupancy.get(sourceKey) || 0) - 1));
                occupancy.set(targetKey, (occupancy.get(targetKey) || 0) + 1);
                return true;
            };
            const preferFirst = firstOccupancy <= secondOccupancy;
            const targetKey = preferFirst ? firstKey : secondKey;
            const sourceKey = preferFirst ? secondKey : firstKey;
            const targetCapacity = preferFirst ? firstCapacity : secondCapacity;
            const sourceCapacity = preferFirst ? secondCapacity : firstCapacity;
            const targetEntity = preferFirst ? entity : partner;
            const sourceEntity = preferFirst ? partner : entity;
            if (moveInside(targetKey, targetCapacity, sourceKey)) {
                moveIntoHousehold(sourceEntity, targetKey);
                formed.add(targetKey);
            } else {
                // Both homes can be full. A partner must not become unhoused
                // merely because every bed is occupied: rebalance one unrelated
                // resident from the target house into the bed the moving partner
                // leaves behind. This keeps total occupancy and capacity
                // unchanged, creates the shared household, and never evicts
                // anyone into the street.
                const sourceFreeAfterPartnerLeaves = sourceCapacity - Math.max(0, (occupancy.get(sourceKey) || 0) - 1);
                if (sourceFreeAfterPartnerLeaves <= 0) continue;
                const swap = citizens.find(other =>
                    other !== entity && other !== partner &&
                    other.householdId === targetKey && !other.isKing && !other.isRoyalFamily &&
                    !moved.has(String(other.personId || other.id))
                );
                if (!swap) continue;
                occupancy.set(targetKey, Math.max(0, (occupancy.get(targetKey) || 0) - 1));
                occupancy.set(sourceKey, (occupancy.get(sourceKey) || 0) + 1);
                occupancy.set(sourceKey, Math.max(0, (occupancy.get(sourceKey) || 0) - 1));
                occupancy.set(targetKey, (occupancy.get(targetKey) || 0) + 1);
                moveIntoHousehold(swap, sourceKey);
                moveIntoHousehold(sourceEntity, targetKey);
                moved.add(String(swap.personId || swap.id));
                formed.add(targetKey);
            }
            moved.add(String(entity.personId || entity.id));
            moved.add(String(partner.personId || partner.id));
            moves++;
            break;
        }
    }
    return { moves, formed };
}

function shouldEmigrate(register) {
    if (state.year <= 3 || state.raidActive) return false;
    const food = Number(state.resources?.food) || 0;
    const civilians = Object.values(register.citizens || {}).filter(citizen => citizen.civilian);
    const foodPerResident = civilians.length ? food / civilians.length : Infinity;
    return (Number(state.morale) < 18 && foodPerResident < 0.45) || (Number(state.morale) < 12);
}

function applyEmigration(register) {
    if (!shouldEmigrate(register)) return null;
    const candidates = Object.values(register.citizens || {})
        .filter(citizen => citizen.civilian && !citizen.soldier && !citizen.royal &&
            citizen.ageYears >= (PERSON_SPECIES[citizen.species]?.maturation || 16) &&
            ["worker", "unemployed", "resident"].includes(citizen.status) && citizen.loyalty < 42)
        .sort((a, b) => a.loyalty - b.loyalty || a.id.localeCompare(b.id));
    const record = candidates[0];
    if (!record) return null;
    const entity = state.entities.find(item => !item.dead && String(item.personId || item.id) === record.id);
    if (!entity) return null;
    entity.dead = true;
    entity.emigrated = true;
    entity.deathYear = Math.max(1, Math.floor(Number(state.year) || 1));
    entity.deathCause = "emigration";
    const departure = { personId: record.id, name: record.name, year: state.year, reason: "left for a better household beyond the realm" };
    register.departures = [...(register.departures || []), departure].slice(-12);
    const economy = state.economy || (state.economy = {});
    economy.emigration = Math.max(0, Number(economy.emigration) || 0) + 1;
    return departure;
}

function recomputeTotals(register, year) {
    const citizens = Object.values(register.citizens || {});
    const households = Object.values(register.households || {});
    const sum = (list, key) => list.reduce((total, item) => total + (Number(item[key]) || 0), 0);
    const civilians = citizens.filter(citizen => citizen.civilian);
    const soldiers = citizens.filter(citizen => citizen.soldier);
    const totals = {
        population: citizens.length,
        civilians: civilians.length,
        soldiers: soldiers.length,
        households: households.length,
        housed: citizens.filter(citizen => citizen.householdId).length,
        unhoused: citizens.filter(citizen => !citizen.householdId).length,
        children: citizens.filter(citizen => citizen.status === "child").length,
        adults: citizens.filter(citizen => citizen.status !== "child" && citizen.status !== "elder").length,
        elders: citizens.filter(citizen => citizen.status === "elder").length,
        employed: civilians.filter(citizen => ["worker", "healer", "clergy", "scholar"].includes(citizen.status)).length,
        unemployed: civilians.filter(citizen => citizen.status === "unemployed").length,
        avgAge: citizens.length ? Math.round(sum(citizens, "ageYears") / citizens.length) : 0,
        avgLoyalty: citizens.length ? Math.round(sum(citizens, "loyalty") / citizens.length) : 0,
        avgHappiness: citizens.length ? Math.round(sum(citizens, "happiness") / citizens.length) : 0,
        avgHealth: citizens.length ? Math.round(sum(citizens, "healthScore") / citizens.length) : 0,
        avgTalent: citizens.length ? Math.round(citizens.reduce((total, citizen) => total + (Number(citizen.talent?.score) || 0), 0) / citizens.length) : 0,
        soldierTalent: soldiers.length ? Math.round(soldiers.reduce((total, citizen) => total + (Number(citizen.talent?.score) || 0), 0) / soldiers.length) : 50,
        wealth: households.reduce((total, household) => total + (Number(household.wealth) || 0), 0),
        births: Math.max(0, Math.floor(Number(state.economy?.births) || 0)),
        deaths: Math.max(0, Math.floor(Number(state.economy?.deaths) || 0)),
        emigration: Math.max(0, Math.floor(Number(state.economy?.emigration) || 0)),
        year, tick: Math.max(0, Math.floor(Number(state.tick) || 0))
    };
    register.totals = totals;
    return totals;
}

// Synchronizes the civic register with the authoritative entities. This is the
// only place that scans all citizens; callers invoke it at founding, on load,
// and once per realm year.
export function synchronizePopulationRegister(register = state.population, { advance = false, formHouseholds = false, emigrate = false, preserveCivicScores = false } = {}) {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const normalized = normalizePopulationState(register);
    const preservedTotalsTick = preserveCivicScores ? Math.max(0, Math.floor(Number(normalized.totals?.tick) || 0)) : null;
    const preservedCivicIds = new Set();
    const houses = completedHouses();
    const houseByKey = new Map(houses.map(house => [`house:${house.x}:${house.y}`, housingCapacityFor(house.type)]));
    const citizenship = state.entities
        .filter(isCitizenEntity)
        .sort((a, b) => String(a.personId || a.id).localeCompare(String(b.personId || b.id)));
    const occupancy = new Map();
    const placed = [];
    const deferredHomes = [];
    for (const entity of citizenship) {
        if (entity.isKing || entity.isRoyalFamily) {
            entity.householdId = CROWN_HOUSEHOLD_ID;
            placed.push(entity);
            continue;
        }
        // The population register is authoritative for an already housed
        // citizen. Reserve every saved home before assigning the remaining
        // entities, otherwise a full house encountered earlier in the sorted
        // entity list would silently move a resident during load.
        const savedHome = preserveCivicScores ? normalized.citizens[String(entity.personId || entity.id)]?.householdId : null;
        if (savedHome && houseByKey.has(savedHome) && moveIntoHousehold(entity, savedHome)) {
            occupancy.set(savedHome, (occupancy.get(savedHome) || 0) + 1);
            placed.push(entity);
        } else {
            deferredHomes.push(entity);
        }
    }
    for (const entity of deferredHomes) {
        chooseHome(entity, houses, occupancy, houseByKey);
        placed.push(entity);
    }
    const householdFormation = formHouseholds
        ? formPartnerHouseholds(placed, houses, houseByKey, occupancy)
        : { moves: 0, formed: new Set() };
    const previousCitizens = normalized.citizens;
    const nextCitizens = {};
    const entityByPersonId = new Map();
    for (const entity of placed) {
        const person = ensurePersonProfile(entity);
        const id = String(entity.personId || entity.id);
        entityByPersonId.set(id, entity);
        const previous = previousCitizens[id] || null;
        const computedProfession = professionFor(entity, person, year);
        // A load must present the citizen exactly as they were saved. The next
        // annual census may update the job and record that change, but loading
        // must not invent a promotion, dismissal or status transition just
        // because an entity reference was restored in a different order.
        const profession = preserveCivicScores && previous?.profession
            ? { ...computedProfession, label: previous.profession, status: previous.status || computedProfession.status }
            : computedProfession;
        const health = healthFor(entity);
        const talent = talentFor(person, profession.label);
        const faith = identityFaith();
        const tradition = identityTradition();
        // Loading a save must not recalculate civic scores from a partially
        // rebuilt world. Keep the persisted values until the next annual census;
        // the security bonus is already included in those saved values.
        const preservedCivic = preserveCivicScores && previous && Number.isFinite(Number(previous.happiness)) && Number.isFinite(Number(previous.loyalty))
            ? { happiness: clamp(Math.round(Number(previous.happiness)), 0, 100), loyalty: clamp(Math.round(Number(previous.loyalty)), 0, 100) }
            : null;
        const preservedHealth = preserveCivicScores && previous && Number.isFinite(Number(previous.healthScore)) && Number.isFinite(Number(previous.immunity))
            ? {
                healthStatus: ["healthy", "wounded", "ill"].includes(previous.healthStatus) ? previous.healthStatus : health.status,
                healthScore: clamp(Math.round(Number(previous.healthScore)), 0, 100),
                immunity: clamp(Math.round(Number(previous.immunity)), 0, 100)
            }
            : null;
        if (preservedCivic) preservedCivicIds.add(id);
        const scores = preservedCivic || baseCivicScores(entity, person, profession, health);
        const restoredHealth = preservedHealth || { healthStatus: health.status, healthScore: health.score, immunity: health.immunity };
        const professionHistory = [...(previous?.professionHistory || [])];
        if (!preserveCivicScores && previous?.profession && previous.profession !== profession.label && professionHistory.length < CITIZEN_HISTORY_LIMIT) {
            professionHistory.push({ year, from: previous.profession, to: profession.label });
        }
        const events = [...(previous?.events || [])];
        if (!preserveCivicScores && previous?.status && previous.status !== profession.status && events.length < CITIZEN_HISTORY_LIMIT) {
            events.push({ year, kind: "status", text: "Status changed from " + (STATUS_LABELS[previous.status] || previous.status) + " to " + (STATUS_LABELS[profession.status] || profession.status) + "." });
        }
        if (!preserveCivicScores && previous?.healthStatus && previous.healthStatus !== health.status && events.length < CITIZEN_HISTORY_LIMIT) {
            events.push({ year, kind: "health", text: "Health changed from " + previous.healthStatus + " to " + health.status + "." });
        }
        // A royal KNIGHT is a court figure, never a garrison soldier. Counting
        // the crown here would both inflate the soldier total and let the
        // sovereign's courtly traits drive military quality instead of the
        // actual named garrison.
        const royal = Boolean(entity.isKing || entity.isRoyalFamily);
        const soldier = SOLDIER_TYPES.has(entity.type) && !royal;
        const citizen = {
            id, name: person.name, species: person.species, sex: person.sex, ageYears: person.ageYears,
            role: preserveCivicScores && previous?.role ? previous.role : person.role,
            origin: originFor(entity, person, previous), householdId: entity.householdId || null,
            profession: profession.label, status: profession.status,
            faithId: faith.id, faith: faith.label, traditionId: tradition.id, tradition: tradition.label,
            healthStatus: restoredHealth.healthStatus, healthScore: restoredHealth.healthScore, immunity: restoredHealth.immunity,
            happiness: scores.happiness, loyalty: scores.loyalty, talent,
            wealthShare: 0, householdWealth: 0,
            joinedYear: previous?.joinedYear || Math.max(1, Math.min(year, Number(person.bornAtYear) || year)),
            lastUpdatedYear: year,
            civilian: !soldier, soldier, royal,
            professionHistory: professionHistory.slice(-CITIZEN_HISTORY_LIMIT),
            events: events.slice(-CITIZEN_HISTORY_LIMIT)
        };
        nextCitizens[id] = citizen;
    }
    normalized.citizens = nextCitizens;
    // Emigration is deliberately rare: only a starving, collapsing realm loses
    // a low-loyalty household member. Normal campaigns never consume this path.
    const departure = emigrate ? applyEmigration(normalized) : null;
    if (departure) {
        delete normalized.citizens[departure.personId];
        delete nextCitizens[departure.personId];
    }
    const nextHouseholds = {};
    const crownMembers = Object.values(nextCitizens).filter(citizen => citizen.householdId === CROWN_HOUSEHOLD_ID).map(citizen => citizen.id);
    if (crownMembers.length) {
        // The sovereign is a mobile entity. Anchoring the crown household to
        // the king leaks fractional movement coordinates into the persisted
        // save; the royal residence is the keep itself.
        const keep = state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP) || houses[0] || null;
        const previous = normalized.households[CROWN_HOUSEHOLD_ID] || {};
        nextHouseholds[CROWN_HOUSEHOLD_ID] = {
            id: CROWN_HOUSEHOLD_ID, x: Math.max(0, Math.floor(Number(keep?.x) || 0)), y: Math.max(0, Math.floor(Number(keep?.y) || 0)), type: keep?.type || TYPE.KEEP,
            capacity: ROYAL_HOUSEHOLD_CAPACITY, memberIds: crownMembers.sort(),
            headId: crownMembers[0] || null, wealth: clamp(Number(previous.wealth) || 0, 0, HOUSEHOLD_WEALTH_CAP),
            loyalty: 0, happiness: 0, formedYear: previous.formedYear || state.identity?.foundedYear || 1,
            lastUpdatedYear: year,
            relations: buildRelations(crownMembers, entityByPersonId), history: Array.isArray(previous.history) ? previous.history : []
        };
    }
    for (const house of houses) {
        const key = `house:${house.x}:${house.y}`;
        const members = Object.values(nextCitizens).filter(citizen => citizen.householdId === key).map(citizen => citizen.id).sort();
        if (!members.length && !normalized.households[key]) continue;
        const previous = normalized.households[key] || {};
        const memberCitizens = members.map(id => nextCitizens[id]).filter(Boolean);
        const capacity = housingCapacityFor(house.type);
        const employed = memberCitizens.filter(citizen => ["worker", "healer", "clergy", "scholar", "soldier", "royal"].includes(citizen.status)).length;
        const talent = memberCitizens.length ? memberCitizens.reduce((sum, citizen) => sum + citizen.talent.score, 0) / memberCitizens.length : 50;
        const savedWealth = Number(previous.wealth);
        let wealth = preserveCivicScores && Number.isFinite(savedWealth)
            ? savedWealth
            : (Number.isFinite(savedWealth) && savedWealth > 0 ? savedWealth : memberCitizens.length * 3 + 2);
        if (advance && memberCitizens.length) {
            const income = employed * (1.4 + talent / 100 * 0.8) + memberCitizens.length * 0.15;
            const upkeep = memberCitizens.length * 0.55;
            wealth = clamp(wealth * 0.9 + income - upkeep, 0, HOUSEHOLD_WEALTH_CAP);
        }
        const head = memberCitizens
            .filter(citizen => citizen.status !== "child")
            .sort((a, b) => b.ageYears - a.ageYears || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0] || memberCitizens[0] || null;
        nextHouseholds[key] = {
            id: key, x: house.x, y: house.y, type: house.type, capacity,
            memberIds: members, headId: head?.id || null, wealth,
            loyalty: 0, happiness: 0,
            // A household without a previous record was formed in this census
            // year. A partner moving into a previously unrelated household
            // likewise creates a new family unit in this year, even though the
            // house itself is older. The realm's founding year is only the
            // correct fallback for the initial census.
            formedYear: householdFormation.formed.has(key) ? year : previous.formedYear || year,
            lastUpdatedYear: year,
            relations: buildRelations(members, entityByPersonId),
            history: Array.isArray(previous.history) ? previous.history : []
        };
    }
    normalized.households = nextHouseholds;
    // Link citizens back to their household wealth, then let the household's
    // security lift every member's satisfaction and loyalty.
    for (const household of Object.values(nextHouseholds)) {
        const members = household.memberIds.map(id => nextCitizens[id]).filter(Boolean);
        const share = members.length ? household.wealth / members.length : 0;
        const security = Math.min(6, household.wealth / 30 + (members.length ? 1 : 0));
        for (const citizen of members) {
            citizen.householdWealth = household.wealth;
            citizen.wealthShare = Math.round(share * 100) / 100;
            if (!preservedCivicIds.has(citizen.id)) {
                citizen.happiness = clamp(citizen.happiness + Math.round(security * 0.6), 0, 100);
                citizen.loyalty = clamp(citizen.loyalty + Math.round(security * 0.5), 0, 100);
            }
        }
        household.loyalty = members.length ? Math.round(members.reduce((sum, citizen) => sum + citizen.loyalty, 0) / members.length) : 0;
        household.happiness = members.length ? Math.round(members.reduce((sum, citizen) => sum + citizen.happiness, 0) / members.length) : 0;
        if (advance && members.length) {
            household.history = [...(household.history || []), {
                year, members: members.length, wealth: household.wealth,
                loyalty: household.loyalty, happiness: household.happiness
            }].slice(-HOUSEHOLD_HISTORY_LIMIT);
        }
    }
    normalized.totals = recomputeTotals(normalized, year);
    if (preservedTotalsTick !== null) normalized.totals.tick = preservedTotalsTick;
    if (advance) {
        normalized.history = [...(normalized.history || []), {
            year, population: normalized.totals.population, households: normalized.totals.households,
            loyalty: normalized.totals.avgLoyalty, happiness: normalized.totals.avgHappiness,
            wealth: normalized.totals.wealth
        }].slice(-25);
        normalized.lastCensusYear = Math.max(normalized.lastCensusYear, year);
        normalized.lastCensusTick = Math.max(0, Math.floor(Number(state.tick) || 0));
    }
    return normalized;
}

export function initializePopulationRegister({ advance = false, preserveCivicScores = false } = {}) {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const register = normalizePopulationState(state.population);
    state.population = register;
    const synchronized = synchronizePopulationRegister(register, { advance, preserveCivicScores, formHouseholds: false, emigrate: false });
    state.population = synchronized;
    synchronized.lastCensusYear = Math.max(synchronized.lastCensusYear, year);
    if (!preserveCivicScores) synchronized.lastCensusTick = Math.max(0, Math.floor(Number(state.tick) || 0));
    return synchronized;
}

// One annual civic census. Returns a small result object so the simulation can
// report departures without scanning the register again.
export function updateCitizenRegister() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    if (!state.population || typeof state.population !== "object") state.population = createPopulationState();
    // This function is called on every tick, but the census is annual. Check the
    // stored census year before normalizing: deep-copying every citizen and
    // household here would turn the annual event into a per-tick allocation.
    if (year <= (Number(state.population.lastCensusYear) || 0)) {
        return { ok: false, year, reason: "already-censused", register: state.population };
    }
    const register = normalizePopulationState(state.population);
    register.lastCensusYear = year;
    const before = Object.keys(register.citizens || {}).length;
    const synchronized = synchronizePopulationRegister(register, { advance: true, formHouseholds: true, emigrate: true });
    state.population = synchronized;
    return {
        ok: true,
        year,
        citizens: synchronized.totals.population,
        households: synchronized.totals.households,
        births: synchronized.totals.births,
        deaths: synchronized.totals.deaths,
        emigration: synchronized.totals.emigration,
        grown: synchronized.totals.population - before,
        register: synchronized
    };
}

export function getCitizenModifiers() {
    const totals = state.population?.totals;
    if (!totals || !Number.isFinite(Number(totals.population)) || Number(totals.population) <= 0) {
        return {
            population: 0, taxEfficiency: 1, productivity: 1,
            legitimacyPressure: 0, militaryQuality: 1,
            avgLoyalty: 50, avgHappiness: 50, avgTalent: 50
        };
    }
    const population = Math.max(0, Number(totals.population) || 0);
    const civilians = Math.max(0, Number(totals.civilians) || 0);
    const employed = Math.max(0, Number(totals.employed) || 0);
    const avgLoyalty = clamp(Number(totals.avgLoyalty) || 50);
    const avgHappiness = clamp(Number(totals.avgHappiness) || 50);
    const avgTalent = clamp(Number(totals.avgTalent) || 50);
    const avgHealth = clamp(Number(totals.avgHealth) || 50);
    const employmentShare = civilians ? Math.min(1, employed / civilians) : 0;
    const soldierQuality = Number(totals.soldiers) > 0 ? clamp(Number(totals.soldierTalent) || 50) : 50;
    return {
        population,
        taxEfficiency: Math.max(0.96, Math.min(1.05, 1 + (avgLoyalty - 50) / 2500 + (employmentShare - 1) * 0.02)),
        productivity: Math.max(0.97, Math.min(1.04, 1 + (avgTalent - 50) / 2500 + (avgHealth - 50) / 5000)),
        legitimacyPressure: Math.max(-0.08, Math.min(0.08, (avgLoyalty - 50) * 0.0018 + (avgHappiness - 50) * 0.001)),
        militaryQuality: Math.max(0.97, Math.min(1.04, 1 + (soldierQuality - 50) / 2500)),
        avgLoyalty, avgHappiness, avgTalent
    };
}

function citizenMatches(citizen, filter) {
    if (filter === "children") return citizen.status === "child";
    if (filter === "adults") return citizen.status !== "child" && citizen.status !== "elder";
    if (filter === "elders") return citizen.status === "elder";
    if (filter === "workers") return ["worker", "healer", "clergy", "scholar"].includes(citizen.status);
    if (filter === "soldiers") return citizen.soldier;
    if (filter === "unemployed") return citizen.status === "unemployed";
    if (filter === "royal") return citizen.royal;
    if (filter === "unhoused") return !citizen.householdId;
    return true;
}

export function filterPopulationCitizens(citizens, filter = "all", query = "") {
    const needle = String(query || "").trim().toLowerCase();
    return (Array.isArray(citizens) ? citizens : []).filter(citizen => {
        if (!citizenMatches(citizen, filter)) return false;
        if (!needle) return true;
        return [citizen.name, citizen.profession, citizen.householdId, citizen.status, citizen.faith, citizen.tradition, citizen.origin]
            .filter(Boolean).join(" ").toLowerCase().includes(needle);
    }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function getPopulationSnapshot() {
    if (state.hasStarted && (!state.population || !state.population.totals || Number(state.population.totals.population) === 0)) {
        initializePopulationRegister();
    }
    const register = normalizePopulationState(state.population);
    const citizens = Object.values(register.citizens)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const households = Object.values(register.households)
        .sort((a, b) => b.memberIds.length - a.memberIds.length || a.id.localeCompare(b.id));
    return {
        ...register.totals,
        citizens,
        households,
        departures: register.departures.map(item => ({ ...item })),
        history: register.history.map(item => ({ ...item })),
        lastCensusYear: register.lastCensusYear,
        lastCensusTick: register.lastCensusTick,
        modifiers: getCitizenModifiers()
    };
}

export function serializePopulationState() {
    return JSON.parse(JSON.stringify(state.population || createPopulationState()));
}

export function validatePopulationState(input) {
    if (input === undefined || input === null) return true;
    if (!asObject(input)) throw new Error("Population state must be an object.");
    if (input.version !== undefined && Number(input.version) !== POPULATION_REGISTER_VERSION) throw new Error("Population state has an unsupported version.");
    if (input.households !== undefined) {
        if (!asObject(input.households)) throw new Error("Population households must be an object.");
        if (Object.keys(input.households).length > MAX_REGISTERED_HOUSEHOLDS) throw new Error("Population households exceed the supported limit.");
        for (const [id, record] of Object.entries(input.households)) {
            if (!asObject(record) || cleanText(id, 80) !== id) throw new Error("Population contains an invalid household record.");
            // v3.10.0 could persist a fractional crown position from the moving
            // sovereign. Accept finite coordinates here; normalization below
            // floors them back to a valid tile. New saves are integer already.
            const x = Number(record.x), y = Number(record.y);
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) throw new Error("Population household residence is invalid.");
            if (!Number.isFinite(Number(record.wealth)) || Number(record.wealth) < 0) throw new Error("Population household wealth is invalid.");
            if (record.memberIds !== undefined && (!Array.isArray(record.memberIds) || record.memberIds.length > 32)) throw new Error("Population household members are invalid.");
        }
    }
    if (input.citizens !== undefined) {
        if (!asObject(input.citizens)) throw new Error("Population citizens must be an object.");
        if (Object.keys(input.citizens).length > MAX_REGISTERED_CITIZENS) throw new Error("Population citizens exceed the supported limit.");
        for (const [id, record] of Object.entries(input.citizens)) {
            if (!asObject(record) || cleanText(id, 100) !== id) throw new Error("Population contains an invalid citizen record.");
            if (!Number.isFinite(Number(record.ageYears)) || Number(record.ageYears) < 0 || Number(record.ageYears) > 1000) throw new Error("Population citizen age is invalid.");
            if (!Number.isFinite(Number(record.loyalty)) || !Number.isFinite(Number(record.happiness))) throw new Error("Population citizen civic values are invalid.");
        }
    }
    if (input.history !== undefined && (!Array.isArray(input.history) || input.history.length > 25)) throw new Error("Population history is invalid.");
    if (input.departures !== undefined && (!Array.isArray(input.departures) || input.departures.length > 12)) throw new Error("Population departures are invalid.");
    return true;
}
