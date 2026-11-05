// Yearly personal needs and goal selection. Values represent satisfaction (0-100).
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { ROUTINE } from "../core/config.js";
import { ensurePersonProfile, addPersonMemory } from "./people.js";

const NEED_GOALS = Object.freeze({
    food: "secure_food",
    rest: "seek_rest",
    safety: "seek_safety",
    belonging: "build_bonds",
    purpose: "find_purpose"
});
const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

function hasNearbyThreat(entity, enemies) {
    for (const enemy of enemies) {
        if (Math.hypot(entity.x - enemy.x, entity.y - enemy.y) <= 14) return true;
    }
    return false;
}

function updateNeeds(entity, person, population, foodPerResident, enemies) {
    const needs = person.needs;
    const traits = person.traits;
    const foodDelta = foodPerResident >= 1.25 ? 3 : foodPerResident >= 0.75 ? 1 :
        foodPerResident >= 0.4 ? -4 : -9;
    const phase = Number(entity.routinePhase);
    const restDelta = phase === ROUTINE.RESTING ? 4 : phase === ROUTINE.WORKING ? -2 : 1;
    const threatened = hasNearbyThreat(entity, enemies);
    const safetyDelta = threatened ? -Math.max(4, 10 - Math.round((traits.courage - 50) / 20)) :
        state.morale < 35 ? -5 : state.morale < 55 ? -2 : 1;
    const recentSocial = person.relationships.some(link => link.lastInteractionTick >= Math.max(0, state.tick - 400));
    const familyLinks = person.kinship.parents.length + person.kinship.children.length +
        person.kinship.partners.filter(link => ["partner", "married"].includes(link.status)).length;
    const belongingDelta = recentSocial ? 3 + Math.round(traits.sociability / 50) :
        familyLinks > 0 ? 1 : traits.sociability >= 70 ? -3 : -1;
    const employed = Boolean(entity.isKing || (entity.workplace && !entity.workplace.dead) ||
        (entity.job && entity.job !== "wanderer"));
    const purposeDelta = employed ? 2 + Math.round(traits.discipline / 70) : -2;

    needs.food = clamp(needs.food + foodDelta);
    needs.rest = clamp(needs.rest + restDelta);
    needs.safety = clamp(needs.safety + safetyDelta);
    needs.belonging = clamp(needs.belonging + belongingDelta);
    needs.purpose = clamp(needs.purpose + purposeDelta);
}

function chooseGoal(person) {
    const needs = Object.entries(person.needs).sort((a, b) => a[1] - b[1]);
    const mostUrgent = needs[0];
    if (mostUrgent && mostUrgent[1] < 35) {
        return {
            id: NEED_GOALS[mostUrgent[0]],
            priority: clamp(100 - mostUrgent[1]),
            reason: mostUrgent[0]
        };
    }
    const longTerm = String(person.goals[0] || "security").slice(0, 32);
    return { id: "pursue_" + longTerm, priority: 50, reason: "long-term ambition" };
}

function transitionGoal(person, next, year, tick) {
    const previous = person.activeGoal;
    if (previous?.id === next.id) {
        previous.priority = next.priority;
        previous.reason = next.reason;
        return false;
    }
    if (previous?.id) {
        person.goalHistory.unshift({
            id: previous.id,
            startedYear: Math.max(1, Number(previous.sinceYear) || year),
            endedYear: year,
            completed: !next.id.startsWith("seek_") && !next.id.startsWith("secure_") &&
                !next.id.startsWith("build_") && !next.id.startsWith("find_"),
            priority: clamp(previous.priority)
        });
        if (person.goalHistory.length > 12) person.goalHistory.length = 12;
    }
    person.activeGoal = {
        id: next.id,
        sinceYear: year,
        priority: next.priority,
        reason: next.reason
    };
    addPersonMemory(personEntity(person), {
        id: "goal:" + person.id + ":" + year + ":" + next.id,
        type: "goal",
        text: "My current priority became " + next.id.replaceAll("_", " ") + ".",
        tick,
        importance: next.priority >= 75 ? 62 : 42
    });
    return true;
}

// The memory helper needs an entity wrapper; profile references are replaced by
// normalization, so locate the owning entity by stable person ID.
function personEntity(person) {
    return state.entities.find(entity => String(entity.personId || "") === String(person.id)) || null;
}

export function updatePersonalAgency() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const economy = state.economy || (state.economy = {});
    if (year <= (Number(economy.lastAgencyYear) || 1)) return { updated: 0, goalChanges: 0 };
    economy.lastAgencyYear = year;

    const residents = state.entities.filter(entity => !entity.dead && entity.personId && entity.person);
    const population = Math.max(1, residents.filter(entity => entity.type === TYPE.VILLAGER).length);
    const foodPerResident = Math.max(0, Number(state.resources?.food) || 0) / population;
    const enemies = state.entities.filter(entity => !entity.dead &&
        typeof entity.isEnemy === "function" && entity.isEnemy());
    let updated = 0, goalChanges = 0;
    const tick = Math.max(0, Math.floor(Number(state.tick) || 0));

    for (const entity of residents) {
        const person = ensurePersonProfile(entity);
        if (person.lastNeedsYear >= year) continue;
        updateNeeds(entity, person, population, foodPerResident, enemies);
        person.lastNeedsYear = year;
        if (transitionGoal(person, chooseGoal(person), year, tick)) goalChanges++;
        updated++;
    }
    return { updated, goalChanges };
}
