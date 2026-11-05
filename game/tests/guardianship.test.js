import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile } from "../js/systems/people.js";
import { linkParentChild, getFamilySnapshot } from "../js/systems/families.js";
import { recordNaturalDeath } from "../js/systems/mortality.js";
import { updateGuardianships } from "../js/systems/guardianship.js";
import { getHouseholdSnapshot } from "../js/systems/population.js";

beforeEach(() => {
    resetState();
    state.worldSeed = 4141;
    state.year = 30;
    state.tick = 12000;
});

function resident(x, house, { age = 30, name = null } = {}) {
    const entity = spawnEntity(x, 40, TYPE.VILLAGER);
    entity.home = { x: house.x, y: house.y };
    entity.anchor = { x: house.x, y: house.y };
    entity.householdId = "house:" + house.x + ":" + house.y;
    const person = ensurePersonProfile(entity, { species: "human" });
    Object.assign(person, {
        species: "human",
        ageYears: age,
        lifeStage: age < 16 ? "young" : age >= 59 ? "elder" : "adult"
    });
    if (name) person.name = name;
    return entity;
}

function createOrphanFamily() {
    const house = spawnEntity(40, 40, TYPE.HOUSE);
    const sharedGrandparent = resident(39, house, { age: 70, name: "Elder Root" });
    const deceasedParent = resident(40, house, { age: 82, name: "Alder Root" });
    const aunt = resident(41, house, { age: 35, name: "Mira Root" });
    const child = resident(42, house, { age: 10, name: "Perrin Root" });
    linkParentChild(sharedGrandparent.personId, deceasedParent.personId);
    linkParentChild(sharedGrandparent.personId, aunt.personId);
    linkParentChild(deceasedParent.personId, child.personId);
    recordNaturalDeath(deceasedParent, "old age");
    state.entities = state.entities.filter(entity => entity !== deceasedParent);
    return { house, sharedGrandparent, deceasedParent, aunt, child };
}

test("a confirmed orphan is assigned to a living adult aunt and joins her household", () => {
    const { aunt, child } = createOrphanFamily();
    const result = updateGuardianships();
    assert.equal(result.length, 1);
    assert.equal(result[0].guardianId, aunt.personId);
    assert.equal(result[0].wardId, child.personId);
    assert.deepEqual(child.person.kinship.guardians, [{ personId: aunt.personId, sinceYear: 30 }]);
    assert.deepEqual(aunt.person.kinship.wards, [{ personId: child.personId, sinceYear: 30 }]);
    assert.equal(child.householdId, aunt.householdId);
    assert.equal(getFamilySnapshot(child.personId).guardians[0].personId, aunt.personId);
    assert.ok(child.person.memories.some(memory => memory.type === "family" && memory.text.includes("guardian")));
    assert.ok(aunt.person.memories.some(memory => memory.type === "family" && memory.text.includes("guardian")));
    assert.equal(getHouseholdSnapshot().homes[0].residents, 3);
});

test("an unresolved parent reference is not silently treated as proof of orphanhood", () => {
    const house = spawnEntity(40, 40, TYPE.HOUSE);
    const guardian = resident(40, house, { age: 40 });
    const child = resident(41, house, { age: 10 });
    child.person.kinship.parents.push({ personId: "missing-parent-record", kind: "biological", sinceYear: 1 });
    guardian.person.relationships.push({
        targetId: child.personId, targetName: child.person.name, kind: "known",
        trust: 90, respect: 80, affinity: 90, interactions: 10, lastInteractionTick: state.tick
    });
    assert.deepEqual(updateGuardianships(), []);
    assert.deepEqual(child.person.kinship.guardians, []);
});

test("an unrelated adult without kinship or strong recorded trust is not selected", () => {
    const house = spawnEntity(40, 40, TYPE.HOUSE);
    const parent = resident(39, house, { age: 82 });
    const child = resident(40, house, { age: 10 });
    const unrelated = resident(41, house, { age: 40 });
    linkParentChild(parent.personId, child.personId);
    recordNaturalDeath(parent, "old age");
    state.entities = state.entities.filter(entity => entity !== parent);
    assert.deepEqual(updateGuardianships(), []);
    assert.deepEqual(child.person.kinship.guardians, []);
    assert.equal(unrelated.person.kinship.wards.length, 0);
});

test("guardian selection respects the receiving household capacity", () => {
    const childHouse = spawnEntity(40, 40, TYPE.HOUSE);
    const guardianHouse = spawnEntity(60, 40, TYPE.HOUSE);
    const parent = resident(39, childHouse, { age: 82 });
    const child = resident(40, childHouse, { age: 10 });
    const sharedGrandparent = resident(60, guardianHouse, { age: 70 });
    const aunt = resident(61, guardianHouse, { age: 40 });
    const extraA = resident(62, guardianHouse, { age: 32 });
    const extraB = resident(63, guardianHouse, { age: 28 });
    linkParentChild(sharedGrandparent.personId, parent.personId);
    linkParentChild(sharedGrandparent.personId, aunt.personId);
    linkParentChild(parent.personId, child.personId);
    recordNaturalDeath(parent, "old age");
    state.entities = state.entities.filter(entity => entity !== parent);
    assert.equal(getHouseholdSnapshot().homes.find(home => home.x === guardianHouse.x).residents, 4);
    assert.deepEqual(updateGuardianships(), []);
    assert.equal(aunt.person.kinship.wards.length, 0);
    assert.equal(sharedGrandparent.person.kinship.wards.length, 0);
    assert.equal(extraA.person.kinship.wards.length, 0);
    assert.equal(extraB.person.kinship.wards.length, 0);
});

test("guardianship scheduler runs at most once per realm year", () => {
    const { child } = createOrphanFamily();
    const first = updateGuardianships();
    const second = updateGuardianships();
    assert.equal(first.length, 1);
    assert.deepEqual(second, []);
    assert.equal(state.economy.lastGuardianshipYear, state.year);
    assert.equal(child.person.kinship.guardians.length, 1);
});


test("a deceased guardian remains in the ward's history and can be replaced next year", () => {
    const { aunt, sharedGrandparent, child } = createOrphanFamily();
    assert.equal(updateGuardianships()[0].guardianId, aunt.personId);
    recordNaturalDeath(aunt, "illness");
    state.entities = state.entities.filter(entity => entity !== aunt);
    assert.ok(child.person.memories.some(memory => memory.type === "loss" && memory.text.includes(aunt.person.name)));
    assert.ok(getFamilySnapshot(aunt.personId).wards.some(link => link.personId === child.personId));
    assert.ok(getFamilySnapshot(child.personId).guardians.some(link => link.personId === aunt.personId));
    state.year = 31;
    state.economy.lastGuardianshipYear = 30;
    const replacement = updateGuardianships();
    assert.equal(replacement.length, 1);
    assert.equal(replacement[0].guardianId, sharedGrandparent.personId);
    assert.equal(child.person.kinship.guardians.length, 2);
});


test("a trusted non-relative can become guardian only with recorded strong ties", () => {
    const orphanHouse = spawnEntity(40, 40, TYPE.HOUSE);
    const friendHouse = spawnEntity(60, 40, TYPE.HOUSE);
    const parent = resident(40, orphanHouse, { age: 82 });
    const child = resident(41, orphanHouse, { age: 10 });
    const trustedFriend = resident(60, friendHouse, { age: 42 });
    trustedFriend.person.relationships.push({
        targetId: child.personId, targetName: child.person.name, kind: "friend",
        trust: 80, respect: 75, affinity: 78, interactions: 12, lastInteractionTick: state.tick
    });
    linkParentChild(parent.personId, child.personId);
    recordNaturalDeath(parent, "old age");
    state.entities = state.entities.filter(entity => entity !== parent);
    const result = updateGuardianships();
    assert.equal(result.length, 1);
    assert.equal(result[0].guardianId, trustedFriend.personId);
    assert.equal(child.person.kinship.guardians[0].personId, trustedFriend.personId);
});
