import test from "node:test";
import assert from "node:assert/strict";
import { TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import {
    getMilitarySnapshot, recruitVillager, trainSoldier, equipSoldier,
    buyHorse, mountSoldier, updateMilitary, getSoldierPower, getSoldierArmor,
    recordMilitaryWound, normalizeMilitaryState
} from "../../js/systems/military.js";
import {
    getHealthSnapshot, improveSanitation, appointHealer, brewMedicine,
    treatSick, setQuarantine, getHealthEconomicEffects, recordHealthMortality,
    normalizeHealthState, updateHealth
} from "../../js/systems/health.js";
import { executeTrade } from "../../js/systems/market.js";
import { createDiplomacyState } from "../../js/systems/diplomacy.js";

function setupRealm({ tick = 20, year = 1, season = 0, gold = 400, food = 400 } = {}) {
    resetState();
    state.worldSeed = 7719;
    state.tick = tick;
    state.year = year;
    state.dayOfYear = tick % 400;
    state.seasonIndex = season;
    state.resources = { wood: 400, stone: 300, gold, food };
    initStartingKingdom();
    state.health = { ...state.health };
    return state.entities.find(entity => !entity.dead && entity.type === TYPE.VILLAGER);
}

test("the opening realm owns a barracks and stable and exposes named garrison soldiers", () => {
    setupRealm();
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.BARRACKS), "opening realm must have a barracks");
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.STABLE), "opening realm must have a stable");
    const snapshot = getMilitarySnapshot();
    assert.ok(snapshot.capacity >= 8, "a completed barracks must hold a real garrison");
    assert.ok(snapshot.soldiers.length >= 2, "initial guards must become named soldiers");
    assert.ok(snapshot.soldiers.every(soldier => soldier.name && soldier.rank), "every soldier must have a name and rank");
    assert.ok(snapshot.horseCapacity >= 4, "a completed stable must hold horses");
});

test("recruitment removes a villager from population and creates a trainable named guard", () => {
    setupRealm();
    const villager = state.entities.find(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.workplace);
    assert.ok(villager, "the opening realm must have an employed resident to recruit");
    const name = villager.person.name;
    const beforePopulation = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const beforeWorkforce = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.workplace).length;
    const result = recruitVillager(villager.personId);
    assert.equal(result.ok, true);
    assert.equal(result.name, name);
    assert.equal(villager.type, TYPE.GUARD);
    assert.equal(villager.person.name, name);
    assert.equal(villager.military.rank, "recruit");
    assert.equal(villager.workplace, null);
    assert.equal(state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length, beforePopulation - 1);
    assert.equal(state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.workplace).length, beforeWorkforce - 1,
        "a recruit must leave the civilian workforce");
    assert.ok(state.statistics.totalUnitsRecruited >= 1);
    const snapshot = getMilitarySnapshot();
    assert.ok(snapshot.soldiers.some(soldier => soldier.name === name && soldier.rank === "recruit"));
});

test("season, drillmaster and war decide training duration while completion promotes the soldier", () => {
    setupRealm({ season: 1, gold: 500, food: 500 });
    let snapshot = getMilitarySnapshot();
    const summerGuard = state.entities.find(entity => String(entity.id) === snapshot.soldiers.find(soldier => soldier.rank === "soldier")?.id);
    assert.ok(summerGuard);
    const summer = trainSoldier(summerGuard.id);
    assert.equal(summer.ok, true);
    const summerDuration = summer.quote.duration;

    setupRealm({ season: 3, gold: 500, food: 500 });
    snapshot = getMilitarySnapshot();
    const winterGuard = state.entities.find(entity => String(entity.id) === snapshot.soldiers.find(soldier => soldier.rank === "soldier")?.id);
    const winter = trainSoldier(winterGuard.id);
    assert.equal(winter.ok, true);
    assert.ok(winter.quote.duration > summerDuration, "winter drill must take measurably longer than summer drill");
    assert.ok(winter.quote.successChance >= 0.22 && winter.quote.successChance <= 0.94);

    const winterRecord = winterGuard.military;
    winterRecord.trainingChance = 1;
    state.tick = winterRecord.trainingCompletesTick;
    updateMilitary();
    assert.equal(winterRecord.sessions, 2);
    assert.equal(winterRecord.equipment > 32, true);
    assert.ok(state.military.recruitsTrained >= 1, "completed drill must count toward trained recruits");
});

test("equipment and a warhorse measurably increase power and annual upkeep is paid", () => {
    const villager = setupRealm({ gold: 500, food: 500 });
    assert.equal(recruitVillager(villager.personId).ok, true);
    let soldier = state.entities.find(entity => String(entity.id) === String(villager.id));
    const basePower = getSoldierPower(soldier);
    assert.equal(equipSoldier(soldier.id).ok, true);
    const equippedPower = getSoldierPower(soldier);
    assert.ok(equippedPower > basePower, "equipment must increase combat power and armour");
    assert.ok(getSoldierArmor(soldier) > 0);
    assert.equal(buyHorse().ok, true);
    soldier.military.rank = "soldier";
    soldier.military.sessions = 1;
    assert.equal(mountSoldier(soldier.id).ok, true);
    assert.ok(getSoldierPower(soldier) > equippedPower, "a trained mounted soldier must fight harder");
    const moraleBeforeWound = soldier.military.morale;
    recordMilitaryWound(soldier);
    assert.ok(getSoldierPower(soldier) < equippedPower, "a wound must reduce combat power");
    assert.ok(soldier.military.morale < moraleBeforeWound);

    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    state.year = 2;
    state.tick = 400;
    updateMilitary();
    assert.ok(state.resources.gold < goldBefore, "annual muster must charge gold");
    assert.ok(state.resources.food < foodBefore, "annual muster must feed soldiers and horses");
    assert.ok(state.military.lastPayroll.goldNeed > 0);
    assert.ok(state.military.history.length >= 1);
});

test("sanitation, healers, medicine and quarantine form a connected public health economy", () => {
    const villager = setupRealm({ gold: 400 });
    const before = getHealthSnapshot();
    assert.ok(before.wells >= 1);
    const works = improveSanitation();
    assert.equal(works.ok, true);
    assert.ok(getHealthSnapshot().sanitation > before.sanitation, "sanitary works must raise effective sanitation");
    assert.equal(improveSanitation().ok, false, "only one public works programme per year is allowed");

    const appointment = appointHealer(villager.personId);
    assert.equal(appointment.ok, true);
    const health = getHealthSnapshot();
    assert.equal(health.healers.length, 1);
    assert.equal(health.healers[0].name, villager.person.name);
    assert.ok(health.healers[0].competence > 0);
    assert.ok(health.healerCoverage >= 0);

    state.forestGathering = { stock: { herbs: 9, lichen: 4 } };
    const brew = brewMedicine();
    assert.equal(brew.ok, true);
    assert.ok(brew.stock >= 5);
    assert.equal(state.forestGathering.stock.herbs, 6);
    assert.ok(state.resources.gold < 400);

    state.health.outbreakActive = true;
    state.health.disease = "dysentery";
    state.health.severity = 2;
    state.health.cases = 1;
    villager.illnessUntilTick = state.tick + 90;
    villager.illnessSeverity = 2;
    const beforeTreatment = villager.illnessUntilTick;
    const treatment = treatSick();
    assert.equal(treatment.ok, true);
    assert.ok(villager.illnessUntilTick < beforeTreatment);
    assert.ok(state.health.medicineUsed > 0);

    const quarantine = setQuarantine(2);
    assert.equal(quarantine.ok, true);
    const effects = getHealthEconomicEffects();
    assert.equal(effects.quarantineLevel, 2);
    assert.ok(effects.tradePenalty > 0.15, "quarantine must create a real trade penalty");
});

test("quarantine raises the gold cost of a real market purchase", () => {
    setupRealm({ gold: 400 });
    state.market = null;
    state.diplomacy = createDiplomacyState();
    const partner = state.market?.partners?.[0] || null;
    assert.equal(partner, null);
    // executeTrade constructs the market from its own defaults when state.market is null.
    const first = executeTrade("northmere", "wood", "buy", 5);
    assert.equal(first.ok, true);
    const cleanCost = 400 - state.resources.gold;
    setupRealm({ gold: 400 });
    state.market = null;
    state.diplomacy = createDiplomacyState();
    setQuarantine(3);
    const quarantined = executeTrade("northmere", "wood", "buy", 5);
    assert.equal(quarantined.ok, true);
    const quarantinedCost = 400 - state.resources.gold;
    assert.ok(quarantinedCost > cleanCost, "quarantine must raise the real market price");
});

test("mortality is recorded by age and occupation and old saves normalize", () => {
    const villager = setupRealm();
    const person = villager.person;
    const record = recordHealthMortality(villager, person, "dysentery");
    assert.equal(record.group, person.ageYears < 16 ? "child" : person.ageYears >= 60 ? "elder" : "adult");
    assert.equal(record.occupation, person.role);
    const health = getHealthSnapshot();
    assert.ok(health.mortality.total >= 1);
    assert.ok(health.mortality.byAge[record.group] >= 1);

    const oldHealth = normalizeHealthState({ severity: 2, disease: "fever", cases: 3 });
    assert.equal(oldHealth.severity, 2);
    assert.equal(oldHealth.disease, "fever");
    assert.equal(oldHealth.sanitation.score, 0);
    assert.deepEqual(oldHealth.medicineStock, 0);
    const oldMilitary = normalizeMilitaryState({ horses: 2, recruitsTrained: 4 });
    assert.equal(oldMilitary.horses, 2);
    assert.equal(oldMilitary.recruitsTrained, 4);
    assert.ok(Array.isArray(oldMilitary.history));
});

test("health update consumes medicine and raises immunity after recovery", () => {
    const villager = setupRealm({ tick: 20 });
    villager.illnessUntilTick = 80;
    villager.illnessSeverity = 2;
    state.health.outbreakActive = true;
    state.health.disease = "fever";
    state.health.severity = 1;
    state.health.medicineStock = 2;
    state.health.lastUpdateTick = 0;
    villager.immunity = 5;
    updateHealth();
    assert.ok(state.health.medicineStock < 2);
    assert.ok(villager.immunity > 5);
});
