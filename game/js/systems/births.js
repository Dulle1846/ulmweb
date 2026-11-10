// Species-aware births driven by explicit adult partnerships and real household capacity.
import { random, randInt } from "../core/random.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { spawnEntity, canSpawnEntity } from "../world/entities.js";
import { getHousingSnapshot, getHouseholdSnapshot, recordPopulationGrowth } from "./population.js";
import { linkParentChild } from "./families.js";
import { ensurePersonProfile, addPersonMemory, PERSON_SPECIES } from "./people.js";

export const BIRTH_CHANCE_PER_PARTNERSHIP_YEAR = 0.12;
export const BIRTH_COOLDOWN_YEARS = 3;
export const BIRTH_FOOD_RESERVE_PER_RESIDENT = 0.75;
export const BIRTH_MIN_MORALE = 55;

function findResident(personId) {
    const id = String(personId || "");
    return state.entities.find(entity =>
        !entity.dead && entity.type === TYPE.VILLAGER &&
        String(entity.personId || entity.id || "") === id
    ) || null;
}

function activePartnership(first, second) {
    const a = first.person.kinship.partners.find(link => link.personId === second.personId);
    const b = second.person.kinship.partners.find(link => link.personId === first.personId);
    if (!a || !b) return null;
    if (!["partner", "married"].includes(a.status) || a.status !== b.status) return null;
    return { first: a, second: b };
}

function eligibleParents(first, second) {
    if (!first || !second || first === second) return false;
    const a = ensurePersonProfile(first), b = ensurePersonProfile(second);
    if (a.species !== b.species || !PERSON_SPECIES[a.species]) return false;
    const species = PERSON_SPECIES[a.species];
    if (species.reproduction !== "paired" || !["female","male"].includes(a.sex) || !["female","male"].includes(b.sex) || a.sex === b.sex) return false;
    if (a.lifeStage !== "adult" || b.lifeStage !== "adult") return false;
    if (a.ageYears < species.maturation || b.ageYears < species.maturation) return false;
    if (a.ageYears > species.lifespan * 0.65 || b.ageYears > species.lifespan * 0.65) return false;
    const partnership = activePartnership(first, second);
    if (!partnership) return false;
    const sinceYear = Math.max(Number(partnership.first.sinceYear) || 1, Number(partnership.second.sinceYear) || 1);
    return sinceYear < Math.max(1, Math.floor(Number(state.year) || 1));
}

function chooseBirthHome(first, second) {
    const snapshot = getHouseholdSnapshot();
    const available = snapshot.homes.filter(home => home.residents < home.capacity);
    if (!available.length) return null;
    const parentHomes = [first, second]
        .map(parent => parent.home)
        .filter(Boolean)
        .filter((home, index, list) => list.findIndex(item => item.x === home.x && item.y === home.y) === index);
    const preferred = available
        .filter(home => parentHomes.some(parent => parent.x === home.x && parent.y === home.y))
        .sort((a, b) => a.residents - b.residents || a.y - b.y || a.x - b.x)[0];
    if (preferred) return preferred;

    // Both parents' homes can be full while a bed exists elsewhere. Leaving
    // the newborn in a stranger's house separates the family for life. Move
    // one unrelated resident from a parent home into the free bed instead,
    // then place the child with the parents. This consumes no extra capacity
    // and never creates an unhoused resident.
    const freeHome = available.sort((a, b) => a.residents - b.residents || a.y - b.y || a.x - b.x)[0];
    if (!freeHome) return null;
    const parentIds = new Set([String(first.personId), String(second.personId)]);
    for (const parentHome of parentHomes) {
        if (parentHome.x === freeHome.x && parentHome.y === freeHome.y) continue;
        const relocated = state.entities
            .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER &&
                !parentIds.has(String(entity.personId || entity.id)) &&
                entity.home && entity.home.x === parentHome.x && entity.home.y === parentHome.y &&
                entity.person?.lifeStage !== "child")
            .sort((a, b) => String(a.personId || a.id).localeCompare(String(b.personId || b.id)))[0];
        if (!relocated) continue;
        relocated.home = { x: freeHome.x, y: freeHome.y };
        relocated.anchor = { ...relocated.home };
        relocated.householdId = "house:" + freeHome.x + ":" + freeHome.y;
        parentHome.residents = Math.max(0, parentHome.residents - 1);
        freeHome.residents = Math.min(freeHome.capacity, freeHome.residents + 1);
        return parentHome;
    }
    return freeHome;
}

function hasResourcesForBirth() {
    const housing = getHousingSnapshot();
    return state.morale >= BIRTH_MIN_MORALE &&
        Number(state.resources?.food || 0) >= housing.population * BIRTH_FOOD_RESERVE_PER_RESIDENT;
}

// This operation is deliberately explicit and deterministic. The yearly
// autonomous scheduler below is the only place that applies the probability roll.
export function createChildFromParents(firstId, secondId) {
    const first = findResident(firstId), second = findResident(secondId);
    if (!first || !second) return { ok: false, reason: "parent-not-found" };
    if (!eligibleParents(first, second)) return { ok: false, reason: "parents-not-eligible" };

    const firstPerson = ensurePersonProfile(first), secondPerson = ensurePersonProfile(second);
    const partnership = activePartnership(first, second);
    const lastBirthYear = Math.max(Number(partnership.first.lastBirthYear) || 0, Number(partnership.second.lastBirthYear) || 0);
    if (lastBirthYear > 0 && state.year - lastBirthYear < BIRTH_COOLDOWN_YEARS) {
        return { ok: false, reason: "birth-cooldown" };
    }
    if (!hasResourcesForBirth()) return { ok: false, reason: "settlement-conditions" };

    const firstKinship = firstPerson.kinship, secondKinship = secondPerson.kinship;
    if (firstKinship.children.length >= 64 || secondKinship.children.length >= 64) {
        return { ok: false, reason: "parent-child-limit" };
    }
    const home = chooseBirthHome(first, second);
    if (!home) return { ok: false, reason: "no-household-capacity" };
    if (!canSpawnEntity(TYPE.VILLAGER)) return { ok: false, reason: "entity-capacity" };

    const child = spawnEntity(
        home.x + randInt(-1, 2, "births"),
        home.y + randInt(-1, 2, "births"),
        TYPE.VILLAGER
    );
    if (!child) return { ok: false, reason: "entity-capacity" };

    child.home = { x: home.x, y: home.y };
    child.anchor = { x: home.x, y: home.y };
    child.householdId = "house:" + home.x + ":" + home.y;
    child.jobRefreshTimer = 0;
    child.civicOrigin = "born-in-realm";

    const childPerson = ensurePersonProfile(child);
    const familyName = firstPerson.familyName || secondPerson.familyName || "Resident";
    childPerson.species = firstPerson.species;
    childPerson.ageYears = 0;
    childPerson.lifeStage = "young";
    childPerson.familyName = familyName;
    childPerson.name = childPerson.firstName + " " + familyName;
    childPerson.role = "child";
    childPerson.goals = ["family", "security"];
    childPerson.bornAtYear = Math.max(1, Math.floor(Number(state.year) || 1));
    childPerson.lastAgedYear = childPerson.bornAtYear;
    childPerson.createdAtTick = Math.max(0, Math.floor(Number(state.tick) || 0));

    const parentLinks = [
        linkParentChild(first.personId, child.personId, { kind: "biological", sinceYear: state.year }),
        linkParentChild(second.personId, child.personId, { kind: "biological", sinceYear: state.year })
    ];
    if (parentLinks.some(result => !result.ok)) {
        child.dead = true;
        state.entities = state.entities.filter(entity => entity !== child);
        return { ok: false, reason: "kinship-link-failed" };
    }

    const tick = Math.max(0, Math.floor(Number(state.tick) || 0));
    addPersonMemory(first, {
        id: "birth:" + child.personId + ":" + first.personId,
        type: "family",
        text: "Our child " + childPerson.name + " was born in year " + state.year + ".",
        tick, importance: 88
    });
    addPersonMemory(second, {
        id: "birth:" + child.personId + ":" + second.personId,
        type: "family",
        text: "Our child " + childPerson.name + " was born in year " + state.year + ".",
        tick, importance: 88
    });
    addPersonMemory(child, {
        id: "birth:" + child.personId + ":origin",
        type: "birth",
        text: "I was born into the " + familyName + " family in year " + state.year + ".",
        tick, importance: 100
    });

    // Profile normalization replaces nested arrays/objects; reacquire the reciprocal
    // links after all memory and kinship writes before persisting the cooldown.
    const persistedPartnership = activePartnership(first, second);
    if (persistedPartnership) {
        persistedPartnership.first.lastBirthYear = state.year;
        persistedPartnership.second.lastBirthYear = state.year;
    }

    const economy = state.economy || (state.economy = {});
    economy.births = Math.max(0, Number(economy.births) || 0) + 1;
    // A family birth consumes one of this year's population-growth slots;
    // otherwise the migration scheduler would add a full extra resident.
    recordPopulationGrowth({ immigration: false });
    return { ok: true, child };
}

export function updateBirths() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const economy = state.economy || (state.economy = {});
    if (year <= (Number(economy.lastBirthCheckYear) || 1)) return null;
    economy.lastBirthCheckYear = year;

    const residents = state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.personId)
        .sort((a, b) => String(a.personId).localeCompare(String(b.personId)));
    for (const first of residents) {
        const person = ensurePersonProfile(first);
        for (const link of person.kinship.partners) {
            if (!["partner", "married"].includes(link.status)) continue;
            if (String(first.personId).localeCompare(String(link.personId)) >= 0) continue;
            const second = findResident(link.personId);
            if (!second || !eligibleParents(first, second)) continue;
            const partnership = activePartnership(first, second);
            if (!partnership) continue;
            const lastBirthYear = Math.max(Number(partnership.first.lastBirthYear) || 0, Number(partnership.second.lastBirthYear) || 0);
            if (lastBirthYear > 0 && year - lastBirthYear < BIRTH_COOLDOWN_YEARS) continue;
            if (!hasResourcesForBirth()) return null;
            if (random("births") >= BIRTH_CHANCE_PER_PARTNERSHIP_YEAR) continue;
            const result = createChildFromParents(first.personId, second.personId);
            if (result.ok) return result.child;
        }
    }
    return null;
}
