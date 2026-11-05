// Explicit, persistent kinship graph. Shared housing never creates family ties.
import { state } from "../core/state.js";
import { ensurePersonProfile, PERSON_SPECIES } from "./people.js";

const PARENT_KINDS = new Set(["biological", "adoptive", "guardian"]);
const PARTNER_STATUSES = new Set(["partner", "married", "separated", "divorced"]);
const MAX_PARENTS = 2;
const MAX_CHILDREN = 64;
const MAX_PARTNERS = 16;
const MAX_GUARDIANS = 2;
const MAX_WARDS = 16;

function personIdOf(entity) {
    return String(entity?.personId || entity?.person?.id || entity?.id || "");
}

function findPerson(personId) {
    const id = String(personId || "");
    if (!id) return null;
    return state.entities.find(entity => personIdOf(entity) === id) || null;
}

function kinshipForRecord(personId) {
    const live = findPerson(personId);
    if (live) return ensureKinship(live);
    const memorial = (state.personArchive || []).find(entry => entry.personId === String(personId));
    return memorial?.person?.kinship || null;
}

function ensureKinship(entity) {
    const person = ensurePersonProfile(entity);
    if (!person.kinship || typeof person.kinship !== "object" || Array.isArray(person.kinship)) {
        person.kinship = { parents: [], children: [], partners: [] };
    }
    for (const key of ["parents", "children", "partners", "guardians", "wards"]) {
        if (!Array.isArray(person.kinship[key])) person.kinship[key] = [];
    }
    return person.kinship;
}

function uniqueById(items, limit, normalize) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const entry = normalize(item);
        if (!entry || seen.has(entry.personId)) continue;
        seen.add(entry.personId);
        result.push(entry);
        if (result.length >= limit) break;
    }
    return result;
}

function hasDescendant(startId, targetId) {
    const pending = [String(startId)];
    const visited = new Set();
    while (pending.length) {
        const currentId = pending.pop();
        if (currentId === String(targetId)) return true;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        const kinship = kinshipForRecord(currentId);
        if (!kinship) continue;
        for (const child of kinship.children) pending.push(child.personId);
    }
    return false;
}

function upsertLink(list, entry) {
    const existing = list.find(item => item.personId === entry.personId);
    if (existing) {
        Object.assign(existing, entry);
        return false;
    }
    list.push(entry);
    return true;
}

export function linkParentChild(parentId, childId, { kind = "biological", sinceYear = state.year } = {}) {
    const parent = findPerson(parentId), child = findPerson(childId);
    if (!parent || !child) return { ok: false, reason: "person-not-found" };
    const pId = personIdOf(parent), cId = personIdOf(child);
    if (pId === cId) return { ok: false, reason: "self-parentage" };
    if (!PARENT_KINDS.has(kind)) return { ok: false, reason: "invalid-parent-kind" };
    // Adding parent -> child is invalid if the child already reaches the parent.
    if (hasDescendant(cId, pId)) return { ok: false, reason: "kinship-cycle" };

    const parentKin = ensureKinship(parent), childKin = ensureKinship(child);
    const existing = childKin.parents.find(item => item.personId === pId);
    if (!existing && childKin.parents.length >= MAX_PARENTS) return { ok: false, reason: "parent-limit" };
    if (!parentKin.children.some(item => item.personId === cId) && parentKin.children.length >= MAX_CHILDREN) return { ok: false, reason: "child-limit" };

    const year = Number.isSafeInteger(Number(sinceYear)) ? Math.max(1, Math.min(1000000, Number(sinceYear))) : Math.max(1, Number(state.year) || 1);
    const parentEntry = { personId: pId, kind, sinceYear: year };
    const childEntry = { personId: cId, kind, sinceYear: year };
    const added = upsertLink(childKin.parents, parentEntry);
    upsertLink(parentKin.children, childEntry);
    return { ok: true, added };
}

export function setPartnership(firstId, secondId, { status = "partner", sinceYear = state.year, endedYear = null } = {}) {
    const first = findPerson(firstId), second = findPerson(secondId);
    if (!first || !second) return { ok: false, reason: "person-not-found" };
    const aId = personIdOf(first), bId = personIdOf(second);
    if (aId === bId) return { ok: false, reason: "self-partnership" };
    if (!PARTNER_STATUSES.has(status)) return { ok: false, reason: "invalid-partnership-status" };

    const firstKin = ensureKinship(first), secondKin = ensureKinship(second);
    if (!firstKin.partners.some(item => item.personId === bId) && firstKin.partners.length >= MAX_PARTNERS) return { ok: false, reason: "partner-limit" };
    if (!secondKin.partners.some(item => item.personId === aId) && secondKin.partners.length >= MAX_PARTNERS) return { ok: false, reason: "partner-limit" };
    const year = Number.isSafeInteger(Number(sinceYear)) ? Math.max(1, Math.min(1000000, Number(sinceYear))) : Math.max(1, Number(state.year) || 1);
    const rawEnd = Number(endedYear);
    const end = endedYear == null ? null : Math.max(year, Math.min(1000000, Number.isFinite(rawEnd) ? Math.floor(rawEnd) : year));
    const previousA = firstKin.partners.find(item => item.personId === bId);
    const previousB = secondKin.partners.find(item => item.personId === aId);
    const lastBirthYear = Math.max(Number(previousA?.lastBirthYear) || 0, Number(previousB?.lastBirthYear) || 0);
    const entryA = { personId: bId, status, sinceYear: year, endedYear: end, lastBirthYear };
    const entryB = { personId: aId, status, sinceYear: year, endedYear: end, lastBirthYear };
    const added = upsertLink(firstKin.partners, entryA);
    upsertLink(secondKin.partners, entryB);
    return { ok: true, added };
}

export function endPartnership(firstId, secondId, { status = "separated", endedYear = state.year } = {}) {
    if (!["separated", "divorced"].includes(status)) return { ok: false, reason: "invalid-ending-status" };
    const first = findPerson(firstId), second = findPerson(secondId);
    if (!first || !second) return { ok: false, reason: "person-not-found" };
    const a = ensureKinship(first).partners.find(item => item.personId === personIdOf(second));
    const b = ensureKinship(second).partners.find(item => item.personId === personIdOf(first));
    if (!a || !b) return { ok: false, reason: "partnership-not-found" };
    const year = Math.max(1, Math.min(1000000, Math.floor(Number(endedYear) || Number(state.year) || 1)));
    for (const entry of [a, b]) {
        entry.status = status;
        entry.endedYear = Math.max(entry.sinceYear, year);
    }
    return { ok: true };
}

export function getSiblings(personId) {
    const kinship = kinshipForRecord(personId);
    if (!kinship) return [];
    const parentIds = new Set(kinship.parents.map(item => item.personId));
    if (!parentIds.size) return [];
    const siblings = new Map();
    for (const parentId of parentIds) {
        const parentKinship = kinshipForRecord(parentId);
        if (!parentKinship) continue;
        for (const child of parentKinship.children) {
            if (child.personId === String(personId)) continue;
            siblings.set(child.personId, (siblings.get(child.personId) || 0) + 1);
        }
    }
    return [...siblings.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, sharedParents]) => ({ personId: id, relation: sharedParents >= 2 ? "full" : "half" }));
}

export function getFamilySnapshot(personId) {
    const kinship = kinshipForRecord(personId);
    if (!kinship) return null;
    return {
        personId: String(personId),
        parents: kinship.parents.map(item => ({ ...item })),
        children: kinship.children.map(item => ({ ...item })),
        partners: kinship.partners.map(item => ({ ...item })),
        siblings: getSiblings(personId),
        guardians: (kinship.guardians || []).map(item => ({ ...item })),
        wards: (kinship.wards || []).map(item => ({ ...item }))
    };
}

export function linkGuardianWard(guardianId, wardId, { sinceYear = state.year } = {}) {
    const guardian = findPerson(guardianId), ward = findPerson(wardId);
    if (!guardian || !ward) return { ok: false, reason: "person-not-found" };
    const guardianKey = personIdOf(guardian), wardKey = personIdOf(ward);
    if (guardianKey === wardKey) return { ok: false, reason: "self-guardianship" };
    const guardianPerson = ensurePersonProfile(guardian), wardPerson = ensurePersonProfile(ward);
    const guardianMaturity = PERSON_SPECIES[guardianPerson.species]?.maturation ?? 16;
    const wardMaturity = PERSON_SPECIES[wardPerson.species]?.maturation ?? 16;
    if (guardianPerson.ageYears < guardianMaturity) return { ok: false, reason: "guardian-not-adult" };
    if (wardPerson.ageYears >= wardMaturity) return { ok: false, reason: "ward-not-minor" };
    const guardianKin = ensureKinship(guardian), wardKin = ensureKinship(ward);
    if (!wardKin.guardians.some(item => item.personId === guardianKey) && wardKin.guardians.length >= MAX_GUARDIANS) {
        return { ok: false, reason: "guardian-limit" };
    }
    if (!guardianKin.wards.some(item => item.personId === wardKey) && guardianKin.wards.length >= MAX_WARDS) {
        return { ok: false, reason: "ward-limit" };
    }
    const year = Number.isSafeInteger(Number(sinceYear))
        ? Math.max(1, Math.min(1000000, Number(sinceYear)))
        : Math.max(1, Number(state.year) || 1);
    const wardEntry = { personId: guardianKey, sinceYear: year };
    const guardianEntry = { personId: wardKey, sinceYear: year };
    const added = upsertLink(wardKin.guardians, wardEntry);
    upsertLink(guardianKin.wards, guardianEntry);
    return { ok: true, added };
}

export function normalizeFamilyLinks() {
    let repaired = 0;
    for (const entity of state.entities) {
        if (!entity.personId && !entity.person) continue;
        const kinship = ensureKinship(entity);
        kinship.parents = uniqueById(kinship.parents, MAX_PARENTS, item => {
            const id = String(item?.personId || "");
            if (!id || id === personIdOf(entity) || !PARENT_KINDS.has(item.kind)) return null;
            return { personId: id, kind: item.kind, sinceYear: Math.max(1, Math.floor(Number(item.sinceYear) || 1)) };
        });
        kinship.children = uniqueById(kinship.children, MAX_CHILDREN, item => {
            const id = String(item?.personId || "");
            if (!id || id === personIdOf(entity) || !PARENT_KINDS.has(item.kind)) return null;
            return { personId: id, kind: item.kind, sinceYear: Math.max(1, Math.floor(Number(item.sinceYear) || 1)) };
        });
        kinship.guardians = uniqueById(kinship.guardians || [], MAX_GUARDIANS, item => {
            const id = String(item?.personId || "");
            if (!id || id === personIdOf(entity)) return null;
            return { personId: id, sinceYear: Math.max(1, Math.floor(Number(item.sinceYear) || 1)) };
        });
        kinship.wards = uniqueById(kinship.wards || [], MAX_WARDS, item => {
            const id = String(item?.personId || "");
            if (!id || id === personIdOf(entity)) return null;
            return { personId: id, sinceYear: Math.max(1, Math.floor(Number(item.sinceYear) || 1)) };
        });
        kinship.partners = uniqueById(kinship.partners, MAX_PARTNERS, item => {
            const id = String(item?.personId || "");
            if (!id || id === personIdOf(entity) || !PARTNER_STATUSES.has(item.status)) return null;
            const sinceYear = Math.max(1, Math.floor(Number(item.sinceYear) || 1));
            return {
                personId: id,
                status: item.status,
                sinceYear,
                endedYear: item.endedYear == null ? null : Math.max(sinceYear, Math.floor(Number(item.endedYear) || sinceYear)),
                lastBirthYear: Math.max(0, Math.min(1000000, Math.floor(Number(item.lastBirthYear) || 0)))
            };
        });
        repaired++;
    }
    // Rebuild reciprocal links only when the counterpart exists; preserve unresolved
    // references so a later save migration can reconnect entities restored in batches.
    for (const entity of state.entities) {
        if (!entity.personId && !entity.person) continue;
        const kin = ensureKinship(entity);
        for (const parentLink of [...kin.parents]) {
            const parent = findPerson(parentLink.personId);
            if (!parent) continue;
            upsertLink(ensureKinship(parent).children, { personId: personIdOf(entity), kind: parentLink.kind, sinceYear: parentLink.sinceYear });
        }
        for (const childLink of [...kin.children]) {
            const child = findPerson(childLink.personId);
            if (!child) continue;
            upsertLink(ensureKinship(child).parents, { personId: personIdOf(entity), kind: childLink.kind, sinceYear: childLink.sinceYear });
        }
        for (const guardianLink of [...kin.guardians]) {
            const guardian = findPerson(guardianLink.personId);
            if (!guardian) continue;
            upsertLink(ensureKinship(guardian).wards, { personId: personIdOf(entity), sinceYear: guardianLink.sinceYear });
        }
        for (const wardLink of [...kin.wards]) {
            const ward = findPerson(wardLink.personId);
            if (!ward) continue;
            upsertLink(ensureKinship(ward).guardians, { personId: personIdOf(entity), sinceYear: wardLink.sinceYear });
        }
        for (const partnerLink of [...kin.partners]) {
            const partner = findPerson(partnerLink.personId);
            if (!partner) continue;
            const partnerLinks = ensureKinship(partner).partners;
            const reciprocal = partnerLinks.find(item => item.personId === personIdOf(entity));
            const lastBirthYear = Math.max(
                Number(partnerLink.lastBirthYear) || 0,
                Number(reciprocal?.lastBirthYear) || 0
            );
            const entry = {
                personId: personIdOf(entity),
                status: partnerLink.status,
                sinceYear: partnerLink.sinceYear,
                endedYear: partnerLink.endedYear,
                lastBirthYear
            };
            upsertLink(partnerLinks, entry);
            partnerLink.lastBirthYear = lastBirthYear;
        }
    }
    return { normalized: repaired };
}
