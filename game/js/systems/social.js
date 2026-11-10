// Bounded yearly social simulation: shared work/home creates encounters, never kinship.
import { random, randInt } from "../core/random.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { ensurePersonProfile, addPersonMemory } from "./people.js";
import { setPartnership } from "./families.js";

export const MAX_SOCIAL_PAIRS_PER_YEAR = 120;
export const MAX_NEW_PARTNERSHIPS_PER_YEAR = 4;
export const PARTNERSHIP_AFFINITY_THRESHOLD = 72;
export const PARTNERSHIP_TRUST_THRESHOLD = 60;
export const PARTNERSHIP_INTERACTION_THRESHOLD = 4;

const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

function addGroup(groups, key, entity) {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entity);
}

function collectCandidatePairs(residents) {
    const groups = new Map();
    for (const entity of residents) {
        if (entity.householdId) addGroup(groups, "home:" + entity.householdId, entity);
        if (entity.workplace && !entity.workplace.dead) {
            addGroup(groups, "work:" + String(entity.workplace.id || entity.workplace.type), entity);
        }
    }
    // The settlement itself is a meeting place: market, temple and tavern are
    // shared civic spaces. Without this group, a small opening village can
    // contain reproductively compatible adults who never meet because their
    // homes and workplaces do not overlap.
    for (const entity of residents) addGroup(groups, "settlement:commons", entity);
    const pairs = new Map();
    outer: for (const [, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (group.length < 2) continue;
        group.sort((a, b) =>
            (Number(a.person?.needs?.belonging ?? 50)) - (Number(b.person?.needs?.belonging ?? 50)) ||
            String(a.personId).localeCompare(String(b.personId))
        );
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const first = group[i], second = group[j];
                const key = String(first.personId) + "|" + String(second.personId);
                if (!pairs.has(key)) pairs.set(key, [first, second]);
                if (pairs.size >= MAX_SOCIAL_PAIRS_PER_YEAR) break outer;
            }
        }
    }
    return [...pairs.entries()].sort(([a], [b]) => a.localeCompare(b))
        .slice(0, MAX_SOCIAL_PAIRS_PER_YEAR).map(([, pair]) => pair);
}

function getOrCreateRelationship(person, target) {
    const targetId = String(target.personId || target.id || "");
    let relation = person.relationships.find(item => item.targetId === targetId);
    if (relation) {
        relation.targetName = target.person.name;
        return relation;
    }
    if (person.relationships.length >= 32) {
        let weakest = 0;
        for (let i = 1; i < person.relationships.length; i++) {
            if ((person.relationships[i].lastInteractionTick || 0) <
                (person.relationships[weakest].lastInteractionTick || 0)) weakest = i;
        }
        person.relationships.splice(weakest, 1);
    }
    relation = {
        targetId, targetName: target.person.name, kind: "acquaintance",
        trust: 50, respect: 50, affinity: 50, interactions: 0, lastInteractionTick: 0
    };
    person.relationships.push(relation);
    return relation;
}

function relationshipKind(relation) {
    if (relation.affinity >= 70 && relation.trust >= 58) return "friend";
    if (relation.affinity <= 28 || relation.trust <= 25) return "rival";
    return "acquaintance";
}

function interact(first, second) {
    const a = ensurePersonProfile(first), b = ensurePersonProfile(second);
    const beforeA = a.relationships.find(item => item.targetId === second.personId);
    const beforeB = b.relationships.find(item => item.targetId === first.personId);
    const previousKind = beforeA?.kind || "acquaintance";
    const compatibilityA = (
        a.traits.sociability + a.traits.compassion + a.traits.patience + (100 - a.traits.distrust)
    ) / 4;
    const compatibilityB = (
        b.traits.sociability + b.traits.compassion + b.traits.patience + (100 - b.traits.distrust)
    ) / 4;
    // An encounter is shared. Basing each side entirely on its own traits made
    // one highly sociable resident like everyone while nobody warmed to them,
    // so a small settlement could never produce a mutual friendship. Keep the
    // individual difference, but grow both sides from the same encounter.
    const sharedDelta = Math.max(-3, Math.min(5,
        Math.round(((compatibilityA + compatibilityB) / 2 - 50) / 12) + randInt(-1, 2, "social")));
    const deltaA = sharedDelta;
    const deltaB = sharedDelta;
    const tick = Math.max(0, Math.floor(Number(state.tick) || 0));
    const relationA = getOrCreateRelationship(a, second);
    const relationB = getOrCreateRelationship(b, first);
    for (const [relation, delta] of [[relationA, deltaA], [relationB, deltaB]]) {
        relation.trust = clamp(relation.trust + delta);
        relation.affinity = clamp(relation.affinity + delta);
        relation.respect = clamp(relation.respect + Math.round(delta * 0.6));
        relation.interactions = Math.min(100000, (Number(relation.interactions) || 0) + 1);
        relation.lastInteractionTick = tick;
        relation.kind = relationshipKind(relation);
    }
    return {
        changed: relationA.kind !== previousKind && ["friend", "rival"].includes(relationA.kind),
        kind: relationA.kind,
        year: Math.max(1, Math.floor(Number(state.year) || 1))
    };
}

function hasCloseKin(first, second) {
    const a = first.person.kinship, b = second.person.kinship;
    const firstId = String(first.personId), secondId = String(second.personId);
    if (a.parents.some(link => link.personId === secondId) ||
        a.children.some(link => link.personId === secondId) ||
        b.parents.some(link => link.personId === firstId) ||
        b.children.some(link => link.personId === firstId)) return true;
    const parents = new Set(a.parents.map(link => link.personId));
    return b.parents.some(link => parents.has(link.personId));
}

function hasActivePartner(person) {
    return person.kinship.partners.some(link => ["partner", "married"].includes(link.status));
}

function reproductivePair(first, second) {
    const a = first.person, b = second.person;
    if (!a || !b || a.species !== b.species) return false;
    if (a.lifeStage !== "adult" || b.lifeStage !== "adult") return false;
    if (!["female", "male"].includes(a.sex) || !["female", "male"].includes(b.sex) || a.sex === b.sex) return false;
    return true;
}

function maybeFormPartnership(first, second) {
    const a = ensurePersonProfile(first), b = ensurePersonProfile(second);
    if (!reproductivePair(first, second)) return false;
    if (a.lifeStage !== "adult" || b.lifeStage !== "adult" || hasCloseKin(first, second)) return false;
    if (hasActivePartner(a) || hasActivePartner(b)) return false;
    const relationA = a.relationships.find(item => item.targetId === second.personId);
    const relationB = b.relationships.find(item => item.targetId === first.personId);
    if (!relationA || !relationB) return false;
    if (relationA.interactions < PARTNERSHIP_INTERACTION_THRESHOLD ||
        relationB.interactions < PARTNERSHIP_INTERACTION_THRESHOLD) return false;
    if (relationA.affinity < PARTNERSHIP_AFFINITY_THRESHOLD ||
        relationB.affinity < PARTNERSHIP_AFFINITY_THRESHOLD ||
        relationA.trust < PARTNERSHIP_TRUST_THRESHOLD ||
        relationB.trust < PARTNERSHIP_TRUST_THRESHOLD) return false;
    if (random("social") >= 0.08) return false;
    const result = setPartnership(first.personId, second.personId, {
        status: "partner", sinceYear: state.year
    });
    if (!result.ok) return false;
    addPersonMemory(first, {
        id: "partnership:" + first.personId + ":" + second.personId + ":" + state.year,
        type: "relationship",
        text: "I began a partnership with " + b.name + " in year " + state.year + ".",
        tick: state.tick, importance: 76
    });
    addPersonMemory(second, {
        id: "partnership:" + second.personId + ":" + first.personId + ":" + state.year,
        type: "relationship",
        text: "I began a partnership with " + a.name + " in year " + state.year + ".",
        tick: state.tick, importance: 76
    });
    return true;
}

export function updateSocialLife() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const economy = state.economy || (state.economy = {});
    if (year <= (Number(economy.lastSocialYear) || 1)) return { interactions: 0, partnerships: [] };
    economy.lastSocialYear = year;

    const residents = state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.personId)
        .sort((a, b) => String(a.personId).localeCompare(String(b.personId)));
    const pairs = collectCandidatePairs(residents);
    // Prefer a pairing that can found a family when both adults are compatible.
    // The affinity, trust and probability gates below are unchanged; this only
    // keeps an incidental non-reproductive pairing from taking the sole
    // available partner before a reproductively compatible match is considered.
    const orderedPairs = [...pairs].sort((a, b) =>
        Number(reproductivePair(b[0], b[1])) - Number(reproductivePair(a[0], a[1]))
    );
    let interactions = 0;
    const partnerships = [];
    for (const [first, second] of orderedPairs) {
        const outcome = interact(first, second);
        interactions++;
        if (outcome.changed) {
            const memoryId = "social:" + outcome.year + ":" + first.personId + ":" + second.personId + ":" + outcome.kind;
            const sentence = outcome.kind === "friend"
                ? "I grew closer to " + second.person.name + " through repeated encounters."
                : "Repeated encounters made " + second.person.name + " a rival.";
            addPersonMemory(first, { id: memoryId + ":" + first.personId, type: "relationship", text: sentence, tick: state.tick, importance: 54 });
            addPersonMemory(second, { id: memoryId + ":" + second.personId, type: "relationship", text: sentence.replace(second.person.name, first.person.name), tick: state.tick, importance: 54 });
        }
        if (partnerships.length < MAX_NEW_PARTNERSHIPS_PER_YEAR && maybeFormPartnership(first, second)) {
            partnerships.push({ first: first.person.name, second: second.person.name });
        }
    }
    return { interactions, partnerships };
}
