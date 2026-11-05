import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile } from "../js/systems/people.js";
import { getFamilySnapshot } from "../js/systems/families.js";
import { recordNaturalDeath } from "../js/systems/mortality.js";
import {
    normalizeRoyalHouse, getMonarch, getRoyalMarriageCandidates,
    arrangeRoyalMarriage, createRoyalHeir, setSuccessionLaw,
    getSuccessionCandidates, resolveRoyalSuccession
} from "../js/systems/royal-dynasty.js";

let monarch, candidate;
beforeEach(() => {
    resetState();
    state.worldSeed = 9090;
    state.year = 20;
    state.tick = 8000;
    monarch = spawnEntity(40, 40, TYPE.KNIGHT);
    monarch.isKing = true;
    monarch.personId = monarch.id;
    const ruler = ensurePersonProfile(monarch, { role: "king", species: "human" });
    Object.assign(ruler, { species: "human", sex: "male", ageYears: 40, lifeStage: "adult", bornAtYear: 1, familyName: "Eldria" });
    candidate = spawnEntity(41, 40, TYPE.VILLAGER);
    const consort = ensurePersonProfile(candidate, { role: "resident", species: "human" });
    Object.assign(consort, { species: "human", sex: "female", ageYears: 28, lifeStage: "adult", familyName: "Ashford" });
    normalizeRoyalHouse();
});

test("royal household is initialized from the living monarch and normalizes succession rules", () => {
    const house = normalizeRoyalHouse({ dynastyName: "House of Eldria", successionLaw: "unknown", successionHistory: [] });
    assert.equal(house.monarchId, monarch.personId);
    assert.equal(house.successionLaw, "absolute");
    assert.equal(getMonarch(), monarch);
});

test("marriage candidates exclude underage, same-sex, already partnered and close relatives", () => {
    const young = spawnEntity(42, 40, TYPE.VILLAGER);
    Object.assign(ensurePersonProfile(young), { species: "human", sex: "female", ageYears: 12, lifeStage: "young" });
    const sameSex = spawnEntity(43, 40, TYPE.VILLAGER);
    Object.assign(ensurePersonProfile(sameSex), { species: "human", sex: "male", ageYears: 30, lifeStage: "adult" });
    const candidates = getRoyalMarriageCandidates();
    assert.deepEqual(candidates.map(item => item.personId), [candidate.personId]);
});

test("royal marriage creates reciprocal partnership and royal-consort identity", () => {
    const result = arrangeRoyalMarriage(candidate.personId);
    assert.equal(result.ok, true);
    assert.equal(candidate.isRoyal, true);
    assert.equal(candidate.isRoyalConsort, true);
    assert.equal(candidate.person.role, "royal-consort");
    assert.equal(monarch.person.kinship.partners[0].personId, candidate.personId);
    assert.equal(candidate.person.kinship.partners[0].personId, monarch.personId);
    assert.equal(arrangeRoyalMarriage(candidate.personId).reason, "consort-already-recorded");
});

test("royal heir is a persistent person with two reciprocal biological parent links", () => {
    assert.equal(arrangeRoyalMarriage(candidate.personId).ok, true);
    const result = createRoyalHeir();
    assert.equal(result.ok, true);
    const child = result.child;
    assert.equal(child.type, TYPE.KNIGHT);
    assert.equal(child.isRoyal, true);
    assert.equal(child.isRoyalHeir, true);
    assert.equal(child.person.ageYears, 0);
    assert.equal(child.person.species, "human");
    assert.equal(child.person.role, "royal-child");
    assert.deepEqual(child.person.kinship.parents.map(link => link.personId).sort(), [monarch.personId, candidate.personId].sort());
    assert.ok(getFamilySnapshot(monarch.personId).children.some(link => link.personId === child.personId));
    assert.equal(createRoyalHeir().reason, "royal-birth-cooldown");
});

test("succession laws are validated and adult royal children become eligible heirs", () => {
    assert.equal(setSuccessionLaw("invalid").ok, false);
    assert.equal(setSuccessionLaw("malePreference").ok, true);
    assert.equal(arrangeRoyalMarriage(candidate.personId).ok, true);
    const child = createRoyalHeir().child;
    child.person.ageYears = 20;
    child.person.lifeStage = "adult";
    assert.deepEqual(getSuccessionCandidates().map(item => item.personId), [child.personId]);
});

test("verified royal death transfers the crown to the eligible adult child", () => {
    assert.equal(arrangeRoyalMarriage(candidate.personId).ok, true);
    const child = createRoyalHeir().child;
    child.person.ageYears = 20;
    child.person.lifeStage = "adult";
    recordNaturalDeath(monarch, "old age");
    const result = resolveRoyalSuccession();
    assert.equal(result.ok, true);
    assert.equal(result.successor, child);
    assert.equal(child.isKing, true);
    assert.equal(child.person.role, "king");
    assert.equal(getMonarch(), child);
});

test("succession is not invented without a verified royal memorial", () => {
    monarch.dead = true;
    assert.equal(resolveRoyalSuccession(), null);
});
