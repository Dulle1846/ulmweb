import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { createDiplomacyState, normalizeDiplomacySnapshot, appointEnvoy, recallEnvoy, updateDiplomacy } from "../../js/systems/diplomacy.js";
import {
    appointMinister,
    dismissMinister,
    addressFactionDemand,
    normalizeCourtState,
    getCourtModifiers,
    updateCourt
} from "../../js/systems/court.js";

function preparePerson(entity, overrides = {}) {
    const person = ensurePersonProfile(entity);
    person.species = "human";
    person.ageYears = 30;
    person.lifeStage = "adult";
    person.traits = {
        ambition: 40,
        courage: 60,
        compassion: 60,
        greed: 30,
        sociability: 70,
        discipline: 65,
        curiosity: 55,
        piety: 45,
        distrust: 35,
        patience: 60,
        ...overrides
    };
    person.needs = { food: 60, rest: 60, safety: 60, belonging: 60, purpose: 70 };
    person.relationships = [];
    return person;
}

function startRealm() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 31105;
    state.year = 4;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    initStartingKingdom();
    state.diplomacy = createDiplomacyState();
    const king = state.entities.find(entity => entity.isKing) || null;
    const villagers = state.entities.filter(entity => entity.type === TYPE.VILLAGER && entity.personId);
    for (const villager of villagers) preparePerson(villager);
    return { king, villagers };
}

beforeEach(() => {
    startRealm();
});

test("malformed court saves normalize every office, petition and audit field", () => {
    const normalized = normalizeCourtState({
        version: 99,
        offices: {
            chancellor: { personId: "person-1", competence: 999, loyalty: -4, integrity: "bad", faction: "unknown" }
        },
        demand: { faction: "unknown" },
        history: [{ year: "7", kind: "audit", summary: "A valid court record" }],
        lastAudit: { year: "6", corruption: 7 }
    });
    assert.equal(normalized.version, 1);
    assert.equal(normalized.offices.chancellor.competence, 100);
    assert.equal(normalized.offices.chancellor.loyalty, 0);
    assert.equal(normalized.offices.chancellor.integrity, 0);
    assert.equal(normalized.offices.chancellor.faction, "nobility");
    assert.equal(normalized.offices.steward, null);
    assert.equal(normalized.demand, null);
    assert.equal(normalized.history.length, 1);
    assert.equal(normalized.lastAudit.corruption, 7);
});

test("a named resident can be appointed once and the appointment costs gold", () => {
    const { king, villagers } = startRealm();
    const candidate = villagers[0];
    const result = appointMinister("steward", candidate.personId);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, 194);
    assert.equal(state.court.offices.steward.personId, candidate.personId);
    assert.equal(state.court.offices.steward.faction, "commons");
    assert.ok(state.court.offices.steward.competence > 50);
    assert.ok(getCourtModifiers().taxEfficiency > 1);
    assert.equal(appointMinister("steward", villagers[1].personId).reason, "office-is-already-filled");
    assert.equal(appointMinister("chancellor", king.personId).reason, "the-sovereign-cannot-hold-an-office");
});

test("dismissal records the decision, vacates the office and refunds nothing", () => {
    const { villagers } = startRealm();
    assert.equal(appointMinister("chaplain", villagers[0].personId).ok, true);
    const goldBefore = state.resources.gold;
    const result = dismissMinister("chaplain");
    assert.equal(result.ok, true);
    assert.equal(state.court.offices.chaplain, null);
    assert.equal(state.resources.gold, goldBefore);
    assert.ok(state.court.history.some(entry => entry.kind === "dismissal"));
});

test("the annual court audit pays salaries, creates a petition and never runs twice", () => {
    const { villagers } = startRealm();
    assert.equal(appointMinister("steward", villagers[0].personId).ok, true);
    state.year = 5;
    const snapshot = updateCourt();
    assert.equal(snapshot.lastUpdateYear, 5);
    assert.equal(snapshot.lastAudit.salaries, 10);
    assert.equal(snapshot.lastAudit.vacancies, 5);
    assert.equal(snapshot.demand.faction, "guilds");
    assert.ok(snapshot.history.some(entry => entry.kind === "audit"));
    const goldAfter = state.resources.gold;
    updateCourt();
    assert.equal(state.resources.gold, goldAfter);
    assert.equal(state.court.lastUpdateYear, 5);
});

test("a petition costs its exact goods and raises the petitioning faction", () => {
    const { villagers } = startRealm();
    state.year = 5;
    updateCourt();
    assert.equal(state.court.demand.faction, "guilds");
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    const supportBefore = state.politics.factions.guilds;
    const result = addressFactionDemand("guilds");
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, 82);
    assert.equal(state.resources.wood, 92);
    assert.equal(state.court.demand, null);
    assert.ok(state.politics.factions.guilds > supportBefore);
    assert.ok(state.court.history.some(entry => entry.kind === "petition-granted"));
    assert.ok(villagers.length > 0);
});

test("an ignored petition lowers faction support and is recorded", () => {
    state.year = 5;
    updateCourt();
    const faction = state.court.demand.faction;
    const supportBefore = state.politics.factions[faction];
    state.year = 6;
    updateCourt();
    assert.ok(state.politics.factions[faction] < supportBefore);
    assert.ok(state.court.history.some(entry => entry.kind === "petition-ignored"));
});

test("a dead officeholder vacates the office and removes its modifier", () => {
    const { villagers } = startRealm();
    assert.equal(appointMinister("marshal", villagers[0].personId).ok, true);
    assert.ok(getCourtModifiers().militaryReadiness > 1);
    villagers[0].dead = true;
    const modifiers = getCourtModifiers();
    assert.equal(modifiers.officesFilled, 0);
    assert.equal(modifiers.militaryReadiness, 1);
    assert.equal(state.court.offices.marshal, null);
    assert.ok(state.court.history.some(entry => entry.kind === "vacancy"));
});

test("an envoy costs gold, improves annual relations and can be recalled", () => {
    const { villagers } = startRealm();
    const target = state.diplomacy.realms.find(realm => realm.id === "northmere");
    const goldBefore = state.resources.gold;
    const result = appointEnvoy("northmere", villagers[1].personId);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, goldBefore - 8);
    assert.equal(target.envoyId, villagers[1].personId);
    assert.ok(target.envoySkill > 0);
    const relationBefore = target.relation;
    state.year = 6;
    updateDiplomacy();
    assert.ok(target.relation > relationBefore);
    assert.equal(recallEnvoy("northmere").ok, true);
    assert.equal(target.envoyId, null);
    assert.equal(target.envoySkill, 0);
});

test("legacy diplomacy saves bound envoy skill and war exhaustion", () => {
    const normalized = normalizeDiplomacySnapshot({
        realms: [{ id: "northmere", envoyId: "person-1", envoyName: "Envoy", envoySkill: 999, envoySinceYear: "7", warExhaustion: -4 }]
    });
    const realm = normalized.realms.find(item => item.id === "northmere");
    assert.equal(realm.envoyId, "person-1");
    assert.equal(realm.envoySkill, 100);
    assert.equal(realm.envoySinceYear, 7);
    assert.equal(realm.warExhaustion, 0);
});
