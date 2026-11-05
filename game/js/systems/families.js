// Explicit, persistent kinship graph. Shared housing never creates family ties.
import { state } from "../core/state.js";
import { ensurePersonProfile } from "./people.js";

const PARENT_KINDS = new Set(["biological", "adoptive", "guardian"]);
const PARTNER_STATUSES = new Set(["partner", "married", "separated", "divorced"]);
const MAX_PARENTS = 2;
const MAX_CHILDREN = 64;
const MAX_PARTNERS = 16;

function personIdOf(entity) {
    return String(entity?.personId || entity?.person?.id || entity?.id || "");
}

function findPerson(personId) {
    const id = String(personId || "");
    if (!id) return null;
    return state.entities.find(entity => personIdOf(entity) === id) || null;
}

function ensureKinship(entity) {
    const person = ensurePersonProfile(entity);
    if (!person.kinship || typeof person.kinship !== "object" || Array.isArray(person.kinship)) {
        person.kinship = { parents: [], children: [], partners: [] };
    }
    for (const key of ["parents", "children", "partners"]) {
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
        const current = findPerson(currentId);
        if (!current) continue;
        const kinship = ensureKinship(current);
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

    const year = Number.isSafeInteger(Number(sinceYear)) ? Math.max(1, Math.min(1000000, Number(sinceYear))) : Math.max(1, Number(state.year) || 1);
    const parentEntry = { personId: pId, kind, sinceYear: year };
    const childEntry = { personId: cId, kind, sinceYear: year };
    const added = upsertLink(childKin.parents, parentEntry);
    upsertLink(parentKin.children, childEntry);
    if (parentKin.children.length > MAX_CHILDREN) parentKin.children.shift();
    return { ok: true, added };
}

export function setPartnership(firstId, secondId, { status = "partner", sinceYear = state.year, endedYear = null } = {}) {
    const first = findPerson(firstId), second = findPerson(secondId);
    if (!first || !second) return { ok: false, reason: "person-not-found" };
    const aId = personIdOf(first), bId = personIdOf(second);
    if (aId === bId) return { ok: false, reason: "self-partnership" };
    if (!PARTNER_STATUSES.has(status)) return { ok: false, reason: "invalid-partnership-status" };

    const firstKin = ensureKinship(first), secondKin = ensureKinship(second);
    const year = Number.isSafeInteger(Number(sinceYear)) ? Math.max(1, Math.min(1000000, Number(sinceYear))) : Math.max(1, Number(state.year) || 1);
    const end = endedYear == null ? null : Math.max(year, Math.min(1000000, Math.floor(Number(endedYear) || year)));
    const entryA = { personId: bId, status, sinceYear: year, endedYear: end };
    const entryB = { personId: aId, status, sinceYear: year, endedYear: end };
    const added = upsertLink(firstKin.partners, entryA);
    upsertLink(secondKin.partners, entryB);
    for (const kin of [firstKin, secondKin]) {
        if (kin.partners.length > MAX_PARTNERS) {
            const removable = kin.partners.findIndex(item => item.endedYear != null || item.status === "divorced");
            if (removable >= 0) kin.partners.splice(removable, 1);
            else kin.partners.shift();
        }
    }
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
    const entity = findPerson(personId);
    if (!entity) return [];
    const kinship = ensureKinship(entity);
    const parentIds = new Set(kinship.parents.map(item => item.personId));
    if (!parentIds.size) return [];
    const siblings = new Map();
    for (const parentId of parentIds) {
        const parent = findPerson(parentId);
        if (!parent) continue;
        for (const child of ensureKinship(parent).children) {
            if (child.personId === personId) continue;
            siblings.set(child.personId, (siblings.get(child.personId) || 0) + 1);
        }
    }
    return [...siblings.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, sharedParents]) => ({ personId: id, relation: sharedParents >= 2 ? "full" : "half" }));
}

export function getFamilySnapshot(personId) {
    const entity = findPerson(personId);
    if (!entity) return null;
    const kinship = ensureKinship(entity);
    return {
        personId: personIdOf(entity),
        parents: kinship.parents.map(item => ({ ...item })),
        children: kinship.children.map(item => ({ ...item })),
        partners: kinship.partners.map(item => ({ ...item })),
        siblings: getSiblings(personId)
    };
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
        kinship.partners = uniqueById(kinship.partners, MAX_PARTNERS, item => {
            const id = String(item?.personId || "");
            if (!id || id === personIdOf(entity) || !PARTNER_STATUSES.has(item.status)) return null;
            const sinceYear = Math.max(1, Math.floor(Number(item.sinceYear) || 1));
            return { personId: id, status: item.status, sinceYear, endedYear: item.endedYear == null ? null : Math.max(sinceYear, Math.floor(Number(item.endedYear) || sinceYear)) };
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
        for (const partnerLink of [...kin.partners]) {
            const partner = findPerson(partnerLink.personId);
            if (!partner) continue;
            upsertLink(ensureKinship(partner).partners, { personId: personIdOf(entity), status: partnerLink.status, sinceYear: partnerLink.sinceYear, endedYear: partnerLink.endedYear });
        }
    }
    return { repaired };
}
