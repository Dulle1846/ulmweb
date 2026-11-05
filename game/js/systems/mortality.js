// Species-aware natural mortality with compact, inspectable memorial records.
import { random } from "../core/random.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import {
    ensurePersonProfile, addPersonMemory, createPersonMemorial,
    PERSON_SPECIES, MAX_PERSON_ARCHIVE
} from "./people.js";

export const MAX_NATURAL_DEATHS_PER_YEAR = 8;
export const MORTALITY_START_LIFESPAN_RATIO = 0.72;

function deathRisk(entity, person) {
    const species = PERSON_SPECIES[person.species];
    if (!species || species.lifespan <= 0) return 0;
    const ratio = Math.max(0, Number(person.ageYears) || 0) / species.lifespan;
    if (ratio < MORTALITY_START_LIFESPAN_RATIO) return 0;
    const ageProgress = Math.min(1.5, (ratio - MORTALITY_START_LIFESPAN_RATIO) /
        (1 - MORTALITY_START_LIFESPAN_RATIO));
    const ageRisk = 0.02 + Math.pow(ageProgress, 2) * 0.48;
    const maxHp = Math.max(1, Number(entity.maxHp) || 1);
    const hpRatio = Math.max(0, Math.min(1, (Number(entity.hp) || maxHp) / maxHp));
    const healthRisk = (1 - hpRatio) * 0.2;
    const illnessRisk = Number(entity.illnessSeverity) > 0 ? Math.min(0.2, Number(entity.illnessSeverity) / 500) : 0;
    return Math.max(0, Math.min(0.92, ageRisk + healthRisk + illnessRisk));
}

function hasFamilyTie(person, personId) {
    const kinship = person.kinship;
    return kinship.parents.some(link => link.personId === personId) ||
        kinship.children.some(link => link.personId === personId) ||
        kinship.partners.some(link => link.personId === personId);
}

export function recordNaturalDeath(entity, cause = "old age") {
    if (!entity || entity.dead || !entity.personId) return null;
    const person = ensurePersonProfile(entity);
    const deathYear = Math.max(1, Math.floor(Number(state.year) || 1));
    const deathTick = Math.max(0, Math.floor(Number(state.tick) || 0));
    const normalizedCause = String(cause || "unknown").slice(0, 48);
    addPersonMemory(entity, {
        id: "death:" + entity.personId + ":final",
        type: "death",
        text: "My life ended in year " + deathYear + " (" + normalizedCause + ").",
        tick: deathTick,
        importance: 100
    });
    const memorial = createPersonMemorial(entity, {
        cause: normalizedCause, deathYear, deathTick
    });
    if (!Array.isArray(state.personArchive)) state.personArchive = [];
    if (!state.personArchive.some(entry => entry.personId === memorial.personId)) {
        state.personArchive.push(memorial);
        if (state.personArchive.length > MAX_PERSON_ARCHIVE) {
            state.personArchive.splice(0, state.personArchive.length - MAX_PERSON_ARCHIVE);
        }
    }

    for (const survivor of state.entities) {
        if (survivor === entity || survivor.dead || !survivor.personId || !survivor.person) continue;
        const survivorPerson = ensurePersonProfile(survivor);
        if (!hasFamilyTie(survivorPerson, memorial.personId)) continue;
        addPersonMemory(survivor, {
            id: "bereavement:" + memorial.personId + ":" + survivor.personId,
            type: "loss",
            text: memorial.person.name + " died in year " + deathYear + " (" + normalizedCause + ").",
            tick: deathTick,
            importance: 92
        });
    }

    entity.deathYear = deathYear;
    entity.deathCause = normalizedCause;
    entity.dead = true;
    const economy = state.economy || (state.economy = {});
    economy.deaths = Math.max(0, Number(economy.deaths) || 0) + 1;
    return {
        personId: memorial.personId,
        name: memorial.person.name,
        ageYears: memorial.person.ageYears,
        deathYear,
        cause: normalizedCause
    };
}

export function updateMortality() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    const economy = state.economy || (state.economy = {});
    if (year <= (Number(economy.lastMortalityYear) || 1)) return [];
    economy.lastMortalityYear = year;

    const residents = state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity.personId && !entity.isKing)
        .sort((a, b) => String(a.personId).localeCompare(String(b.personId)));
    const deaths = [];
    for (const entity of residents) {
        if (deaths.length >= MAX_NATURAL_DEATHS_PER_YEAR) break;
        const person = ensurePersonProfile(entity);
        const risk = deathRisk(entity, person);
        if (risk <= 0 || random("mortality") >= risk) continue;
        const maxHp = Math.max(1, Number(entity.maxHp) || 1);
        const hpRatio = Math.max(0, Math.min(1, (Number(entity.hp) || maxHp) / maxHp));
        const cause = Number(entity.illnessUntilTick) > state.tick || Number(entity.illnessSeverity) > 0
            ? "illness"
            : hpRatio < 0.3 ? "injury" : "old age";
        const death = recordNaturalDeath(entity, cause);
        if (death) deaths.push(death);
    }
    return deaths;
}
