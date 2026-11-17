import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { setSuccessionLaw, normalizeGovernment } from "../../js/systems/government.js";
import { updateRoyalSuccession } from "../../js/systems/royal-dynasty.js";

function preparePerson(entity, ageYears = 34) {
    const person = ensurePersonProfile(entity);
    person.species = "human";
    person.ageYears = ageYears;
    person.lifeStage = "adult";
    person.traits = { ambition: 60, courage: 60, compassion: 55, greed: 30, sociability: 60, discipline: 65, curiosity: 50, piety: 45, distrust: 30, patience: 60 };
    person.needs = { food: 60, rest: 60, safety: 60, belonging: 60, purpose: 65 };
    person.relationships = [];
    return person;
}

function startRealm() {
    resetState();
    state.hasStarted = true;
    state.year = 4;
    state.tick = 400;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    initStartingKingdom();
    state.government = normalizeGovernment({ form: "feudal", taxRate: 10, succession: "primogeniture" });
    state.politics = { legitimacy: 60, factions: { commons: 60, nobility: 60, guilds: 55, clergy: 55 }, settlements: 0 };
    for (const villager of state.entities.filter(entity => entity.type === TYPE.VILLAGER)) preparePerson(villager);
    return state.entities.find(entity => entity.isKing) || null;
}

beforeEach(() => {
    startRealm();
});

test("succession law is a paid, once-per-year constitutional choice", () => {
    const before = state.resources.gold;
    const result = setSuccessionLaw("elective");
    assert.equal(result.ok, true);
    assert.equal(state.government.succession, "elective");
    assert.equal(state.resources.gold, before - 15);
    assert.ok(state.government.history.some(entry => entry.kind === "succession-law" && entry.to === "elective"));
    assert.equal(setSuccessionLaw("designated").reason, "one-succession-change-per-year");
    assert.equal(setSuccessionLaw("unknown").reason, "unknown-succession-law");
});

test("designated law refuses a silent fallback even when an adult child exists", () => {
    const king = startRealm();
    const child = state.entities.find(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
    assert.ok(child);
    preparePerson(child, 30);
    child.isRoyalFamily = true;
    state.royal = { dynastyName: "Test", consortId: null, heirId: null, lastBirthYear: 0, history: [] };
    state.government = normalizeGovernment({ form: "feudal", taxRate: 10, succession: "designated" });
    king.dead = true;
    const result = updateRoyalSuccession();
    assert.equal(result.changed, false);
    assert.equal(result.reason, "no-living-heir");
    assert.equal(result.law, "designated");
    assert.equal(state.entities.some(entity => entity.isKing && !entity.dead), false);
});

test("primogeniture follows the sealed heir and transfers the crown", () => {
    const king = startRealm();
    const child = state.entities.find(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
    preparePerson(child, 24);
    child.isRoyalFamily = true;
    state.royal = { dynastyName: "Test", consortId: null, heirId: String(child.personId), lastBirthYear: 0, history: [] };
    state.government = normalizeGovernment({ form: "feudal", taxRate: 10, succession: "primogeniture" });
    king.dead = true;
    const result = updateRoyalSuccession();
    assert.equal(result.changed, true);
    assert.equal(result.law, "primogeniture");
    assert.equal(result.king, child);
    assert.equal(child.isKing, true);
    assert.equal(state.royal.heirId, null);
});

test("elective law chooses a living adult resident when no designated heir exists", () => {
    const king = startRealm();
    state.royal = { dynastyName: "Test", consortId: null, heirId: null, lastBirthYear: 0, history: [] };
    state.government = normalizeGovernment({ form: "feudal", taxRate: 10, succession: "elective" });
    king.dead = true;
    const result = updateRoyalSuccession();
    assert.equal(result.changed, true);
    assert.equal(result.law, "elective");
    assert.ok(result.king);
    assert.equal(result.king.isKing, true);
    assert.notEqual(result.king, king);
});
