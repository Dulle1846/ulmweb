import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { ensurePersonProfile, normalizePersonProfile } from "../../js/systems/people.js";
import { linkParentChild, setPartnership, endPartnership, getSiblings, getFamilySnapshot, normalizeFamilyLinks, linkGuardianWard } from "../../js/systems/families.js";

function makePeople(count = 5) {
    resetState();
    state.worldSeed = 2525;
    state.year = 12;
    return Array.from({ length: count }, (_, index) => {
        const entity = spawnEntity(index, 0, TYPE.VILLAGER);
        ensurePersonProfile(entity);
        return entity;
    });
}

test("explicit parent-child links are reciprocal, typed and idempotent", () => {
    const [parent, child] = makePeople(2);
    const first = linkParentChild(parent.personId, child.personId, { kind: "adoptive", sinceYear: 8 });
    const second = linkParentChild(parent.personId, child.personId, { kind: "adoptive", sinceYear: 8 });
    assert.deepEqual(first, { ok: true, added: true });
    assert.deepEqual(second, { ok: true, added: false });
    assert.deepEqual(child.person.kinship.parents, [{ personId: parent.personId, kind: "adoptive", sinceYear: 8 }]);
    assert.deepEqual(parent.person.kinship.children, [{ personId: child.personId, kind: "adoptive", sinceYear: 8 }]);
});

test("kinship rejects self-parentage, unknown people, invalid kinds and cycles", () => {
    const [a, b, c] = makePeople(3);
    assert.equal(linkParentChild(a.personId, a.personId).reason, "self-parentage");
    assert.equal(linkParentChild("missing", b.personId).reason, "person-not-found");
    assert.equal(linkParentChild(a.personId, b.personId, { kind: "roommate" }).reason, "invalid-parent-kind");
    assert.equal(linkParentChild(a.personId, b.personId).ok, true);
    assert.equal(linkParentChild(b.personId, c.personId).ok, true);
    assert.equal(linkParentChild(c.personId, a.personId).reason, "kinship-cycle");
    assert.equal(linkParentChild(c.personId, c.personId).ok, false);
});

test("a person has at most two explicit parents", () => {
    const [a, b, c, child] = makePeople(4);
    assert.equal(linkParentChild(a.personId, child.personId).ok, true);
    assert.equal(linkParentChild(b.personId, child.personId).ok, true);
    assert.equal(linkParentChild(c.personId, child.personId).reason, "parent-limit");
    assert.equal(child.person.kinship.parents.length, 2);
});

test("siblings are derived from shared explicit parents, not shared households", () => {
    const [mother, father, otherParent, first, fullSibling, halfSibling, roommate] = makePeople(7);
    linkParentChild(mother.personId, first.personId);
    linkParentChild(father.personId, first.personId);
    linkParentChild(mother.personId, fullSibling.personId);
    linkParentChild(father.personId, fullSibling.personId);
    linkParentChild(mother.personId, halfSibling.personId);
    linkParentChild(otherParent.personId, halfSibling.personId);
    first.householdId = fullSibling.householdId = halfSibling.householdId = roommate.householdId = "same-house";
    assert.deepEqual(getSiblings(first.personId), [
        { personId: halfSibling.personId, relation: "half" },
        { personId: fullSibling.personId, relation: "full" }
    ].sort((a, b) => a.personId.localeCompare(b.personId)));
    assert.deepEqual(getSiblings(roommate.personId), []);
});

test("partnerships are reciprocal and can end without deleting history", () => {
    const [a, b] = makePeople(2);
    assert.deepEqual(setPartnership(a.personId, b.personId, { status: "married", sinceYear: 4 }), { ok: true, added: true });
    assert.equal(a.person.kinship.partners[0].status, "married");
    assert.equal(b.person.kinship.partners[0].personId, a.personId);
    assert.deepEqual(endPartnership(a.personId, b.personId, { status: "divorced", endedYear: 10 }), { ok: true });
    assert.equal(a.person.kinship.partners[0].status, "divorced");
    assert.equal(b.person.kinship.partners[0].endedYear, 10);
});

test("legacy person records migrate to bounded empty kinship collections", () => {
    resetState();
    state.year = 5;
    const entity = { id: "legacy-person", personId: "legacy-person" };
    const person = normalizePersonProfile({ ageYears: 22, kinship: { parents: Array(10).fill({ personId: "p", kind: "biological" }), children: "bad", partners: [] } }, entity);
    assert.equal(person.kinship.parents.length, 2);
    assert.deepEqual(person.kinship.children, []);
    assert.deepEqual(person.kinship.partners, []);
});

test("family migration restores reciprocal edges after all save entities are present", () => {
    const [parent, child, partner] = makePeople(3);
    child.person.kinship.parents = [{ personId: parent.personId, kind: "biological", sinceYear: 2 }];
    child.person.kinship.partners = [{ personId: partner.personId, status: "partner", sinceYear: 7, endedYear: null }];
    const result = normalizeFamilyLinks();
    assert.ok(result.normalized >= 3);
    assert.equal(parent.person.kinship.children[0].personId, child.personId);
    assert.equal(partner.person.kinship.partners[0].personId, child.personId);
    assert.equal(getFamilySnapshot(child.personId).parents[0].personId, parent.personId);
});


test("family normalization is idempotent and preserves unresolved historical references", () => {
    const [parent, child] = makePeople(2);
    child.person.kinship.parents = [
        { personId: parent.personId, kind: "biological", sinceYear: 3 },
        { personId: "deceased-ancestor", kind: "adoptive", sinceYear: 1 },
        { personId: parent.personId, kind: "biological", sinceYear: 3 },
        { personId: child.personId, kind: "biological", sinceYear: 1 }
    ];
    const first = normalizeFamilyLinks();
    const second = normalizeFamilyLinks();
    assert.ok(first.normalized >= 2);
    assert.ok(second.normalized >= 2);
    assert.equal(child.person.kinship.parents.length, 2);
    assert.equal(child.person.kinship.parents.filter(link => link.personId === parent.personId).length, 1);
    assert.ok(child.person.kinship.parents.some(link => link.personId === "deceased-ancestor"));
    assert.equal(parent.person.kinship.children.filter(link => link.personId === child.personId).length, 1);
});


test("family collection limits reject new edges without breaking reciprocal history", () => {
    const people = makePeople(67);
    const [parent, ...children] = people;
    for (const child of children.slice(0, 64)) assert.equal(linkParentChild(parent.personId, child.personId).ok, true);
    assert.equal(linkParentChild(parent.personId, children[64].personId).reason, "child-limit");
    assert.equal(parent.person.kinship.children.length, 64);
    assert.equal(children[64].person.kinship.parents.length, 0);

    const [first, ...partners] = makePeople(18);
    for (const partner of partners.slice(0, 16)) assert.equal(setPartnership(first.personId, partner.personId).ok, true);
    assert.equal(setPartnership(first.personId, partners[16].personId).reason, "partner-limit");
    assert.equal(first.person.kinship.partners.length, 16);
    assert.equal(partners[16].person.kinship.partners.length, 0);
});


test("family normalization preserves the birth cooldown and repairs it reciprocally", () => {
    const [first, second] = makePeople(2);
    setPartnership(first.personId, second.personId, { status: "married", sinceYear: 4 });
    first.person.kinship.partners[0].lastBirthYear = 9;
    second.person.kinship.partners[0].lastBirthYear = 7;
    normalizeFamilyLinks();
    assert.equal(first.person.kinship.partners[0].lastBirthYear, 9);
    assert.equal(second.person.kinship.partners[0].lastBirthYear, 9);
    normalizeFamilyLinks();
    assert.equal(first.person.kinship.partners[0].lastBirthYear, 9);
    assert.equal(second.person.kinship.partners[0].lastBirthYear, 9);
});

test("re-establishing a partnership does not erase its previous birth cooldown", () => {
    const [first, second] = makePeople(2);
    setPartnership(first.personId, second.personId, { status: "married", sinceYear: 4 });
    first.person.kinship.partners[0].lastBirthYear = 8;
    second.person.kinship.partners[0].lastBirthYear = 8;
    setPartnership(first.personId, second.personId, { status: "partner", sinceYear: 12 });
    assert.equal(first.person.kinship.partners[0].lastBirthYear, 8);
    assert.equal(second.person.kinship.partners[0].lastBirthYear, 8);
});


test("guardian and ward links are reciprocal, bounded and visible in family snapshots", () => {
    const [guardian, ward, secondGuardian] = makePeople(3);
    ensurePersonProfile(guardian).ageYears = 40;
    ensurePersonProfile(guardian).lifeStage = "adult";
    ensurePersonProfile(ward).ageYears = 8;
    ensurePersonProfile(ward).lifeStage = "young";
    ensurePersonProfile(secondGuardian).ageYears = 38;
    ensurePersonProfile(secondGuardian).lifeStage = "adult";
    assert.deepEqual(linkGuardianWard(guardian.personId, ward.personId, { sinceYear: 10 }), { ok: true, added: true });
    assert.deepEqual(linkGuardianWard(guardian.personId, ward.personId, { sinceYear: 10 }), { ok: true, added: false });
    assert.deepEqual(ward.person.kinship.guardians, [{ personId: guardian.personId, sinceYear: 10 }]);
    assert.deepEqual(guardian.person.kinship.wards, [{ personId: ward.personId, sinceYear: 10 }]);
    assert.equal(getFamilySnapshot(ward.personId).guardians[0].personId, guardian.personId);
    assert.equal(getFamilySnapshot(guardian.personId).wards[0].personId, ward.personId);
    assert.equal(linkGuardianWard(ward.personId, guardian.personId).reason, "guardian-not-adult");
    assert.equal(linkGuardianWard(secondGuardian.personId, ward.personId).ok, true);
    assert.equal(linkGuardianWard(guardian.personId, secondGuardian.personId).reason, "ward-not-minor");
});

test("legacy kinship migration adds bounded guardian and ward collections", () => {
    const entity = { id: "legacy-guardian", personId: "legacy-guardian" };
    const person = normalizePersonProfile({ ageYears: 22, kinship: { guardians: Array(10).fill({ personId: "g" }), wards: "invalid" } }, entity);
    assert.equal(person.kinship.guardians.length, 2);
    assert.deepEqual(person.kinship.wards, []);
});

test("guardian migration restores reciprocal links without discarding unresolved references", () => {
    const [guardian, ward] = makePeople(2);
    ward.person.kinship.guardians = [
        { personId: guardian.personId, sinceYear: 8 },
        { personId: "archived-guardian", sinceYear: 2 }
    ];
    normalizeFamilyLinks();
    assert.equal(guardian.person.kinship.wards[0].personId, ward.personId);
    assert.ok(ward.person.kinship.guardians.some(link => link.personId === "archived-guardian"));
});
