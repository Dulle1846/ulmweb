// Annual orphan guardianship assignment. Only explicitly recorded family ties
// or established high-trust relationships may create a guardian link.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { PERSON_SPECIES, ensurePersonProfile, addPersonMemory } from "./people.js";
import { getHouseholdSnapshot } from "./population.js";
import { getSiblings, linkGuardianWard } from "./families.js";

export const MAX_GUARDIANSHIPS_PER_YEAR = 4;
export const MIN_GUARDIAN_TRUST = 60;
export const MIN_GUARDIAN_AFFINITY = 60;
export const MAX_WARDS_PER_GUARDIAN = 16;

function findLivingPerson(personId) {
    return state.entities.find(entity =>
        !entity.dead && String(entity.personId || entity.id || "") === String(personId)
    ) || null;
}

function isConfirmedOrphan(entity) {
    const person = ensurePersonProfile(entity);
    const parents = person.kinship.parents || [];
    if (!parents.length) return false;
    return parents.every(link => {
        const living = findLivingPerson(link.personId);
        if (living) return false;
        return (state.personArchive || []).some(entry => entry.personId === link.personId);
    });
}

function activeGuardians(entity) {
    return (entity.person?.kinship?.guardians || []).filter(link => findLivingPerson(link.personId));
}

function relativeScore(candidateId, orphan) {
    const parents = orphan.person.kinship.parents || [];
    let score = 0;
    for (const parentLink of parents) {
        const parentMemorial = (state.personArchive || []).find(entry => entry.personId === parentLink.personId);
        if (!parentMemorial) continue;
        if (getSiblings(parentLink.personId).some(sibling => sibling.personId === candidateId)) {
            score = Math.max(score, 1200); // aunt or uncle
        }
        if ((parentMemorial.person.kinship?.parents || []).some(link => link.personId === candidateId)) {
            score = Math.max(score, 1100); // grandparent
        }
    }
    return score;
}

function relationshipEvidence(candidate, orphan) {
    const candidateId = String(candidate.personId);
    const orphanId = String(orphan.personId);
    const orphanRelation = (orphan.person.relationships || []).find(item => item.targetId === candidateId);
    const parentRelations = (orphan.person.kinship.parents || []).flatMap(parentLink => {
        const memorial = (state.personArchive || []).find(entry => entry.personId === parentLink.personId);
        return memorial?.person?.relationships || [];
    });
    const parentRelation = parentRelations.find(item => item.targetId === candidateId);
    const relation = orphanRelation || parentRelation;
    if (!relation) return null;
    const trust = Math.max(0, Math.min(100, Number(relation.trust) || 0));
    const affinity = Math.max(0, Math.min(100, Number(relation.affinity) || 0));
    if (trust < MIN_GUARDIAN_TRUST || affinity < MIN_GUARDIAN_AFFINITY) return null;
    return { trust, affinity };
}

function candidateScore(candidate, orphan, household) {
    const person = ensurePersonProfile(candidate);
    const maturity = PERSON_SPECIES[person.species]?.maturation ?? 16;
    if (person.ageYears < maturity || person.lifeStage === "young") return null;
    if ((person.kinship.wards || []).length >= MAX_WARDS_PER_GUARDIAN) return null;
    if (candidate.type !== TYPE.VILLAGER || !candidate.home) return null;
    const home = household.homes.find(item => item.x === candidate.home.x && item.y === candidate.home.y);
    const alreadyInHousehold = orphan.home?.x === candidate.home.x && orphan.home?.y === candidate.home.y;
    if (!home || (!alreadyInHousehold && home.residents >= home.capacity)) return null;
    const familyScore = relativeScore(String(candidate.personId), orphan);
    const evidence = relationshipEvidence(candidate, orphan);
    if (!familyScore && !evidence) return null;
    const trustScore = evidence ? evidence.trust + evidence.affinity : 0;
    return {
        score: familyScore + trustScore,
        occupancy: home.residents,
        home
    };
}

function selectGuardian(orphan) {
    const household = getHouseholdSnapshot();
    const candidates = [];
    for (const candidate of state.entities) {
        if (candidate.dead || candidate === orphan || !candidate.personId || !candidate.person) continue;
        const score = candidateScore(candidate, orphan, household);
        if (!score) continue;
        candidates.push({ candidate, ...score });
    }
    candidates.sort((a, b) =>
        b.score - a.score ||
        a.occupancy - b.occupancy ||
        String(a.candidate.personId).localeCompare(String(b.candidate.personId))
    );
    return candidates[0] || null;
}

function moveWardIntoGuardianHousehold(ward, guardian, home) {
    ward.home = { x: home.x, y: home.y };
    ward.anchor = { x: home.x, y: home.y };
    ward.householdId = "house:" + home.x + ":" + home.y;
}

export function updateGuardianships() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const economy = state.economy || (state.economy = {});
    if (year <= (Number(economy.lastGuardianshipYear) || 1)) return [];
    economy.lastGuardianshipYear = year;

    const orphans = state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.personId && entity.person)
        .map(entity => ({ entity, person: ensurePersonProfile(entity) }))
        .filter(({ entity }) => isConfirmedOrphan(entity) && activeGuardians(entity).length === 0)
        .sort((a, b) => String(a.entity.personId).localeCompare(String(b.entity.personId)));

    const assigned = [];
    for (const { entity: orphan } of orphans) {
        if (assigned.length >= MAX_GUARDIANSHIPS_PER_YEAR) break;
        if ((orphan.person.kinship.guardians || []).length >= 2) continue;
        const choice = selectGuardian(orphan);
        if (!choice) continue;
        const result = linkGuardianWard(choice.candidate.personId, orphan.personId, { sinceYear: year });
        if (!result.ok) continue;
        moveWardIntoGuardianHousehold(orphan, choice.candidate, choice.home);
        addPersonMemory(choice.candidate, {
            id: "guardianship:" + orphan.personId + ":" + choice.candidate.personId + ":" + year,
            type: "family",
            text: "I became guardian to " + orphan.person.name + " in year " + year + ".",
            tick: state.tick,
            importance: 82
        });
        addPersonMemory(orphan, {
            id: "guardianship:" + orphan.personId + ":" + choice.candidate.personId + ":" + year,
            type: "family",
            text: choice.candidate.person.name + " became my guardian in year " + year + ".",
            tick: state.tick,
            importance: 90
        });
        assigned.push({
            wardId: String(orphan.personId),
            wardName: orphan.person.name,
            guardianId: String(choice.candidate.personId),
            guardianName: choice.candidate.person.name,
            year
        });
    }
    return assigned;
}
