import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { getFamilySnapshot } from "../../js/systems/families.js";
import { appointRoyalConsort, createRoyalHeir, getDynastySnapshot, resolveRoyalSuccession, normalizeDynasty } from "../../js/systems/dynasty.js";
import { recordNaturalDeath } from "../../js/systems/mortality.js";

function setupRoyalHouse() {
    resetState();
    state.year = 20;
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    const king = spawnEntity(10, 10, TYPE.KNIGHT);
    king.isKing = true;
    king.personId = king.id;
    const kingPerson = ensurePersonProfile(king, { role: "king" });
    Object.assign(kingPerson, { species: "human", sex: "male", ageYears: 36, lifeStage: "adult", bornAtYear: 1 });
    const consort = spawnEntity(11, 10, TYPE.VILLAGER);
    const consortPerson = ensurePersonProfile(consort);
    Object.assign(consortPerson, { species: "human", sex: "female", ageYears: 31, lifeStage: "adult", bornAtYear: 4 });
    return { king, consort, kingPerson, consortPerson };
}

test("royal consort selection rejects incompatible and close-relative candidates", () => {
    const { king, consort, kingPerson } = setupRoyalHouse();
    const relative = spawnEntity(12, 10, TYPE.VILLAGER);
    const relativePerson = ensurePersonProfile(relative);
    Object.assign(relativePerson, { species: "human", sex: "female", ageYears: 29, lifeStage: "adult" });
    kingPerson.kinship.children.push({ personId: relative.personId, kind: "biological", sinceYear: 5 });
    relativePerson.kinship.parents.push({ personId: king.personId, kind: "biological", sinceYear: 5 });
    const candidates = getDynastySnapshot().eligibleConsorts;
    assert.ok(candidates.some(entity => entity.personId === consort.personId));
    assert.ok(!candidates.some(entity => entity.personId === relative.personId));
});

test("royal marriage and heir creation create reciprocal family links and memories", () => {
    const { king, consort } = setupRoyalHouse();
    const marriage = appointRoyalConsort(consort.personId);
    assert.equal(marriage.ok, true);
    assert.equal(king.person.kinship.partners[0].status, "married");
    const birth = createRoyalHeir();
    assert.equal(birth.ok, true);
    const child = birth.child;
    const family = getFamilySnapshot(king.personId);
    assert.ok(family.children.some(link => link.personId === child.personId));
    assert.ok(getFamilySnapshot(consort.personId).children.some(link => link.personId === child.personId));
    assert.equal(getFamilySnapshot(child.personId).parents.length, 2);
    assert.equal(child.person.role, "royal-heir");
    assert.equal(child.isRoyal, true);
    assert.ok(king.person.memories.some(memory => memory.type === "dynasty"));
    assert.ok(consort.person.memories.some(memory => memory.type === "dynasty"));
    assert.ok(child.person.memories.some(memory => memory.type === "birth"));
    assert.equal(state.dynasty.lastRoyalBirthYear, state.year);
    assert.equal(state.resources.food, 88);
    assert.equal(state.resources.gold, 92);
});

test("royal heir creation respects birth cooldown and does not charge resources on failure", () => {
    const { consort } = setupRoyalHouse();
    assert.equal(appointRoyalConsort(consort.personId).ok, true);
    assert.equal(createRoyalHeir().ok, true);
    const count = state.entities.length;
    const food = state.resources.food, gold = state.resources.gold;
    const result = createRoyalHeir();
    assert.deepEqual(result, { ok: false, reason: "birth-cooldown" });
    assert.equal(state.entities.length, count);
    assert.equal(state.resources.food, food);
    assert.equal(state.resources.gold, gold);
});

test("a deceased monarch passes the crown to the oldest living direct heir", () => {
    const { king, consort } = setupRoyalHouse();
    assert.equal(appointRoyalConsort(consort.personId).ok, true);
    const first = createRoyalHeir().child;
    state.year += 3;
    const second = createRoyalHeir().child;
    first.person.ageYears = 30;
    first.person.lifeStage = "adult";
    second.person.ageYears = 20;
    second.person.lifeStage = "adult";
    recordNaturalDeath(king, "old age");
    const result = resolveRoyalSuccession(king.personId);
    assert.equal(result.ok, true);
    assert.equal(result.heir.personId, first.personId);
    assert.equal(result.heir.isKing, true);
    assert.equal(result.heir.type, TYPE.KNIGHT);
    assert.equal(state.dynasty.rulerId, first.personId);
    assert.equal(state.dynasty.consortId, null);
    assert.equal(king.isKing, false);
});

test("a minor heir ascends with a recorded regent candidate", () => {
    const { king, consort } = setupRoyalHouse();
    assert.equal(appointRoyalConsort(consort.personId).ok, true);
    const heir = createRoyalHeir().child;
    recordNaturalDeath(king, "old age");
    const result = resolveRoyalSuccession(king.personId);
    assert.equal(result.ok, true);
    assert.equal(result.heir.personId, heir.personId);
    assert.equal(result.regentId, consort.personId);
    assert.equal(state.dynasty.regentId, consort.personId);
    assert.equal(state.dynasty.consortId, null);
});

test("succession leaves the throne vacant rather than inventing an heir", () => {
    const { king } = setupRoyalHouse();
    recordNaturalDeath(king, "old age");
    const result = resolveRoyalSuccession(king.personId);
    assert.deepEqual(result, { ok: false, reason: "no-living-direct-heir" });
    assert.equal(state.dynasty.vacantSinceYear, state.year);
});

test("dynasty save normalization bounds identifiers and timestamps", () => {
    resetState();
    const result = normalizeDynasty({
        rulerId: "ruler-1".repeat(30),
        consortId: 12,
        lastRoyalBirthYear: -5,
        vacantSinceYear: 0,
        lastSuccession: { year: 0, from: "old", to: 42, reason: "x".repeat(100) }
    });
    assert.equal(result.rulerId, null);
    assert.equal(result.consortId, null);
    assert.equal(result.lastRoyalBirthYear, 0);
    assert.equal(result.vacantSinceYear, 1);
    assert.equal(result.lastSuccession.year, 1);
    assert.equal(result.lastSuccession.to, null);
    assert.equal(result.lastSuccession.reason.length, 48);
});
