import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { normalizeHouseholdAssignments, getHouseholdSnapshot } from "../../js/systems/population.js";
import { createIdentityState } from "../../js/systems/identity.js";
import { setPartnership } from "../../js/systems/families.js";
import {
    initializePopulationRegister, updateCitizenRegister, normalizePopulationState,
    getPopulationSnapshot, getCitizenModifiers, validatePopulationState, CROWN_HOUSEHOLD_ID
} from "../../js/systems/population-register.js";

function createRealm() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.worldSeed = 90210;
    state.year = 2;
    state.tick = 400;
    state.morale = 72;
    state.resources = { wood: 100, stone: 100, gold: 120, food: 240 };
    state.identity = null;
    const firstHouse = spawnEntity(40, 40, TYPE.HOUSE);
    const secondHouse = spawnEntity(50, 40, TYPE.HOUSE);
    const first = spawnEntity(41, 40, TYPE.VILLAGER);
    const second = spawnEntity(42, 40, TYPE.VILLAGER);
    const third = spawnEntity(51, 40, TYPE.VILLAGER);
    const fourth = spawnEntity(52, 40, TYPE.VILLAGER);
    first.home = { x: firstHouse.x, y: firstHouse.y };
    second.home = { x: firstHouse.x, y: firstHouse.y };
    third.home = { x: secondHouse.x, y: secondHouse.y };
    fourth.home = { x: secondHouse.x, y: secondHouse.y };
    for (const villager of [first, second, third, fourth]) {
        villager.anchor = { ...villager.home };
        villager.householdId = `house:${villager.home.x}:${villager.home.y}`;
        villager.jobRefreshTimer = 1000;
        villager.routineTimer = 1000;
        ensurePersonProfile(villager);
    }
    normalizeHouseholdAssignments();
    initializePopulationRegister();
    return { firstHouse, secondHouse, first, second, third, fourth };
}

test("the register persists named citizens with civic, faith and household records", () => {
    const { firstHouse, first } = createRealm();
    first.job = "farmer";
    first.person.traits.discipline = 92;
    first.person.traits.patience = 88;
    initializePopulationRegister();
    const citizen = state.population.citizens[first.personId];
    const household = state.population.households[`house:${firstHouse.x}:${firstHouse.y}`];
    assert.ok(citizen);
    assert.equal(citizen.name, first.person.name);
    assert.equal(citizen.sex, first.person.sex);
    assert.equal(citizen.ageYears, first.person.ageYears);
    assert.equal(citizen.householdId, `house:${firstHouse.x}:${firstHouse.y}`);
    assert.equal(citizen.profession, "Farmer");
    assert.equal(citizen.status, "worker");
    assert.match(citizen.faith, /Ancestral/);
    assert.match(citizen.tradition, /Open hearth/);
    assert.ok(citizen.talent.score >= 80);
    assert.ok(citizen.healthScore >= 0 && citizen.healthScore <= 100);
    assert.ok(citizen.loyalty >= 0 && citizen.loyalty <= 100);
    assert.ok(household.memberIds.includes(first.personId));
    assert.ok(household.wealth > 0);
    assert.equal(state.population.totals.civilians, 4);
    assert.equal(state.population.totals.households, 2);
    assert.doesNotThrow(() => validatePopulationState(JSON.parse(JSON.stringify(state.population))));
});

test("the annual census is deterministic and records a second civic year", () => {
    const build = () => {
        createRealm();
        state.year = 3;
        state.tick = 800;
        const result = updateCitizenRegister();
        return JSON.stringify({
            citizens: result.register.citizens,
            households: result.register.households,
            totals: result.register.totals
        });
    };
    const first = build();
    const second = build();
    assert.equal(first, second);
    const repeated = updateCitizenRegister();
    assert.equal(repeated.ok, false, "a second census in the same year must be a no-op");
    // No-op ticks run every frame; returning the live register (rather than a
    // normalized copy) is what keeps the annual census off the tick hot path.
    assert.equal(repeated.register, state.population);
});

test("partners in different houses are brought into one household when capacity allows", () => {
    const { first, third } = createRealm();
    for (const [villager, sex] of [[first, "female"], [third, "male"]]) {
        Object.assign(villager.person, {
            ageYears: 25, lifeStage: "adult", sex,
            kinship: {
                parents: [], children: [],
                partners: [{ personId: String(villager === first ? third.personId : first.personId), status: "married", sinceYear: 2, endedYear: null, lastBirthYear: 0 }],
                guardians: [], wards: []
            }
        });
    }
    initializePopulationRegister();
    state.year = 3;
    state.tick = 800;
    updateCitizenRegister();
    assert.equal(state.population.citizens[first.personId].householdId, state.population.citizens[third.personId].householdId);
    const household = state.population.households[state.population.citizens[first.personId].householdId];
    assert.ok(household.memberIds.includes(first.personId));
    assert.ok(household.memberIds.includes(third.personId));
    assert.ok(household.relations.some(relation => relation.kind === "partners"));
});

test("vocational talent is persisted and changes the civic productivity modifier", () => {
    const { first, second, third, fourth } = createRealm();
    for (const villager of [first, second, third, fourth]) {
        villager.person.traits.discipline = 100;
        villager.person.traits.patience = 100;
        villager.person.traits.courage = 100;
        villager.person.traits.curiosity = 100;
    }
    first.job = "farmer";
    second.job = "woodcutter";
    third.job = "mason";
    fourth.job = "baker";
    const guard = spawnEntity(43, 40, TYPE.GUARD);
    guard.personId = guard.id;
    ensurePersonProfile(guard, { role: "soldier" });
    guard.person.traits.courage = 100;
    guard.person.traits.discipline = 100;
    initializePopulationRegister();
    const modifiers = getCitizenModifiers();
    assert.equal(state.population.citizens[first.personId].talent.score, 100);
    assert.equal(state.population.citizens[first.personId].talent.focus, "Discipline & Patience");
    assert.ok(modifiers.productivity > 1);
    assert.ok(modifiers.taxEfficiency >= 1);
    assert.ok(modifiers.militaryQuality > 1);
    assert.equal(state.population.citizens[guard.personId].soldier, true);
});

test("the sovereign is recorded as crown, not as a garrison soldier", () => {
    createRealm();
    const king = spawnEntity(44, 40, TYPE.KNIGHT);
    king.isKing = true;
    king.personId = king.id;
    ensurePersonProfile(king, { role: "king" });
    initializePopulationRegister();
    const citizen = state.population.citizens[king.personId];
    assert.equal(citizen.status, "royal");
    assert.equal(citizen.profession, "Crown");
    assert.equal(citizen.royal, true);
    assert.equal(citizen.soldier, false);
    assert.equal(citizen.civilian, true);
    assert.equal(state.population.totals.soldiers, 0);
    assert.equal(state.population.totals.civilians, 5);
    assert.equal(getCitizenModifiers().militaryQuality, 1);
});

test("the register survives a JSON save/load roundtrip without losing civic data", () => {
    const { first } = createRealm();
    first.job = "farmer";
    initializePopulationRegister();
    const saved = normalizePopulationState(JSON.parse(JSON.stringify(state.population)));
    assert.equal(saved.citizens[first.personId].profession, "Farmer");
    assert.equal(saved.citizens[first.personId].householdId, state.population.citizens[first.personId].householdId);
    assert.equal(saved.households[state.population.citizens[first.personId].householdId].wealth, state.population.households[state.population.citizens[first.personId].householdId].wealth);
    assert.doesNotThrow(() => validatePopulationState(saved));
});

test("legacy saves without a register are normalized and populated from live households", () => {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 7712;
    state.year = 4;
    state.tick = 1200;
    state.morale = 64;
    state.resources = { wood: 100, stone: 100, gold: 100, food: 160 };
    const house = spawnEntity(30, 30, TYPE.HOUSE);
    const resident = spawnEntity(31, 30, TYPE.VILLAGER);
    resident.home = { x: house.x, y: house.y };
    resident.anchor = { ...resident.home };
    resident.householdId = `house:${house.x}:${house.y}`;
    normalizeHouseholdAssignments();
    state.population = null;
    assert.deepEqual(normalizePopulationState(undefined).citizens, {});
    const register = initializePopulationRegister();
    assert.equal(register.totals.civilians, 1);
    assert.equal(register.totals.households, 1);
    assert.ok(register.citizens[resident.personId]);
    assert.equal(register.lastCensusYear, 4);
    const malformed = normalizePopulationState({
        citizens: { broken: { ageYears: 9999, loyalty: -5, happiness: 500, householdId: 7 } },
        households: { "house:1:1": { x: 1, y: 1, wealth: -4, memberIds: ["broken", 3] } }
    });
    assert.equal(malformed.citizens.broken.ageYears, 1000);
    assert.equal(malformed.citizens.broken.loyalty, 0);
    assert.equal(malformed.citizens.broken.happiness, 100);
    assert.equal(malformed.households["house:1:1"].wealth, 0);
    assert.deepEqual(malformed.households["house:1:1"].memberIds, ["broken"]);
});

test("a household built after founding records its actual formation year", () => {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 90211;
    state.year = 12;
    state.tick = 4400;
    state.morale = 80;
    state.resources = { wood: 100, stone: 100, gold: 100, food: 300 };
    state.identity = createIdentityState({ foundedYear: 1 });
    const house = spawnEntity(60, 60, TYPE.HOUSE);
    const resident = spawnEntity(61, 60, TYPE.VILLAGER);
    resident.home = { x: house.x, y: house.y };
    resident.anchor = { ...resident.home };
    resident.householdId = `house:${house.x}:${house.y}`;
    normalizeHouseholdAssignments();
    initializePopulationRegister();
    assert.equal(state.population.households[resident.householdId].formedYear, 12);
});

test("full households merge partners by a capacity-neutral resident swap", () => {
    const { firstHouse, secondHouse, first, third } = createRealm();
    state.identity = createIdentityState({ foundedYear: 1 });
    for (const house of [firstHouse, secondHouse]) {
        for (let index = 0; index < 2; index++) {
            const extra = spawnEntity(house.x + index + 1, house.y, TYPE.VILLAGER);
            extra.home = { x: house.x, y: house.y };
            extra.anchor = { ...extra.home };
            extra.householdId = `house:${house.x}:${house.y}`;
            extra.jobRefreshTimer = 1000;
            extra.routineTimer = 1000;
            ensurePersonProfile(extra);
        }
    }
    normalizeHouseholdAssignments();
    initializePopulationRegister();
    for (const [villager, sex] of [[first, "female"], [third, "male"]]) {
        Object.assign(villager.person, { ageYears: 25, lifeStage: "adult", sex });
    }
    assert.equal(setPartnership(first.personId, third.personId, { status: "partner", sinceYear: 2 }).ok, true);
    state.year = 3;
    state.tick = 800;
    updateCitizenRegister();
    assert.equal(state.population.citizens[first.personId].householdId, state.population.citizens[third.personId].householdId);
    assert.equal(getHouseholdSnapshot().unhoused, 0);
    const household = state.population.households[state.population.citizens[first.personId].householdId];
    assert.equal(household.memberIds.length, 4);
    assert.equal(household.formedYear, 3);
});

test("the crown household stays on the keep when the sovereign moves", () => {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 7713;
    state.year = 5;
    state.tick = 1600;
    state.morale = 70;
    state.resources = { wood: 100, stone: 100, gold: 100, food: 200 };
    const keep = spawnEntity(40, 40, TYPE.KEEP);
    const house = spawnEntity(45, 40, TYPE.HOUSE);
    const resident = spawnEntity(46, 40, TYPE.VILLAGER);
    resident.home = { x: house.x, y: house.y };
    resident.anchor = { ...resident.home };
    resident.householdId = `house:${house.x}:${house.y}`;
    normalizeHouseholdAssignments();
    const king = spawnEntity(41, 41, TYPE.KNIGHT);
    king.isKing = true;
    king.isRoyalFamily = true;
    king.personId = king.id;
    ensurePersonProfile(king, { role: "king" });
    initializePopulationRegister();
    king.x = 41.75;
    king.y = 42.25;
    initializePopulationRegister();
    const crown = state.population.households[CROWN_HOUSEHOLD_ID];
    assert.equal(crown.x, keep.x);
    assert.equal(crown.y, keep.y);
    assert.ok(Number.isInteger(crown.x) && Number.isInteger(crown.y));
    // A save already written by v3.10.0 must remain loadable and normalize to
    // the valid tile rather than being rejected.
    const legacy = JSON.parse(JSON.stringify(state.population));
    legacy.households[CROWN_HOUSEHOLD_ID].x = 41.75;
    legacy.households[CROWN_HOUSEHOLD_ID].y = 42.25;
    assert.doesNotThrow(() => validatePopulationState(legacy));
    const normalized = normalizePopulationState(legacy);
    assert.equal(normalized.households[CROWN_HOUSEHOLD_ID].x, 41);
    assert.equal(normalized.households[CROWN_HOUSEHOLD_ID].y, 42);
});

test("loading a saved register preserves civic scores and its census tick", () => {
    const { first } = createRealm();
    const householdId = state.population.citizens[first.personId].householdId;
    const members = [...state.population.households[householdId].memberIds];
    for (const id of members) {
        state.population.citizens[id].happiness = 23;
        state.population.citizens[id].loyalty = 67;
        state.population.citizens[id].healthScore = 42;
        state.population.citizens[id].immunity = 13;
    }
    state.population.households[householdId].happiness = 23;
    state.population.households[householdId].loyalty = 67;
    state.population.lastCensusTick = 777;
    state.population.totals.tick = 555;
    const reloaded = initializePopulationRegister({ preserveCivicScores: true });
    assert.equal(reloaded.citizens[first.personId].happiness, 23);
    assert.equal(reloaded.citizens[first.personId].loyalty, 67);
    assert.equal(reloaded.citizens[first.personId].healthScore, 42);
    assert.equal(reloaded.citizens[first.personId].immunity, 13);
    assert.equal(reloaded.households[householdId].happiness, 23);
    assert.equal(reloaded.households[householdId].loyalty, 67);
    assert.equal(reloaded.lastCensusTick, 777);
    assert.equal(reloaded.totals.tick, 555);
});

test("dead residents disappear from the next civic census and from their household", () => {
    const { first } = createRealm();
    const householdId = state.population.citizens[first.personId].householdId;
    first.dead = true;
    state.year = 3;
    state.tick = 800;
    const result = updateCitizenRegister();
    assert.equal(result.register.citizens[first.personId], undefined);
    assert.ok(!result.register.households[householdId].memberIds.includes(first.personId));
    const snapshot = getPopulationSnapshot();
    assert.ok(snapshot.citizens.every(citizen => citizen.id !== first.personId));
    assert.equal(CROWN_HOUSEHOLD_ID, "crown:household");
});
