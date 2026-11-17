import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { spawnEntity, canSpawnEntity } from "../world/entities.js";
import { randInt, random } from "../core/random.js";
import { addLog } from "./events.js";
import { recordResourceMovement } from "./goods-book.js";
import { addResource } from "./resources.js";
import { creatureProfile, CREATURE_SPECIES_LIST } from "../world/creature-species-data.js";

const MAX_MEMORIES = 16;
const MAX_ARCHIVE = 100;
const MAX_CREATURES = 14;
const CREATURE_TYPE = TYPE.DRAGON;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function remember(creature, text, year = state.year) {
    const c = creature?.creature;
    if (!c) return false;
    if (!Array.isArray(c.memories)) c.memories = [];
    const id = String(year) + ":" + String(text).slice(0, 48);
    if (c.memories.some(memory => memory.id === id)) return false;
    c.memories.unshift({
        id,
        year: Math.max(1, Number(year) || 1),
        text: String(text).slice(0, 180)
    });
    c.memories = c.memories.slice(0, MAX_MEMORIES);
    return true;
}

function speciesOf(creature) {
    return creatureProfile(creature?.creature?.species || "dragon");
}

function isRoyalCreature(entity) {
    return Boolean(entity && !entity.dead && (entity.isRoyalCreature || entity.isDragon) && entity.creature);
}

function stageFor(profile, age) {
    const ages = profile.stageAges;
    if (age < ages[0]) return "hatchling";
    if (age < ages[1]) return "juvenile";
    if (age < ages[2]) return "adult";
    if (age < ages[3]) return "elder";
    return "ancient";
}

function healthBiomeAt(x, y) {
    const region = state.biomeAtlas?.regions?.find(entry =>
        Number(x) >= entry.x && Number(x) < entry.x + entry.width &&
        Number(y) >= entry.y && Number(y) < entry.y + entry.height
    );
    return region?.rawBiome || "unknown";
}

function findHabitat(profile, x, y) {
    for (let radius = 1; radius <= 16; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const tx = Math.round(x) + dx;
                const ty = Math.round(y) + dy;
                if (profile.biomes.includes(healthBiomeAt(tx, ty))) return { x: tx, y: ty };
            }
        }
    }
    return null;
}

function localRegion(x, y) {
    return state.biomeAtlas?.regions?.find(entry =>
        Number(x) >= entry.x && Number(x) < entry.x + entry.width &&
        Number(y) >= entry.y && Number(y) < entry.y + entry.height
    ) || null;
}

function chooseName(profile) {
    return profile.names[randInt(0, profile.names.length, "creatures")];
}

export function awakenCreature(entity, speciesId = "dragon", options = {}) {
    if (!entity) return null;
    const profile = creatureProfile(speciesId);
    const year = Math.max(1, Number(state.year) || 1);
    const ageYears = Math.max(0, Number(options.ageYears) || 0);
    const home = { ...(options.home || entity.home || { x: entity.x, y: entity.y }) };
    const habitat = options.habitat || healthBiomeAt(home.x, home.y);

    entity.isRoyalCreature = true;
    entity.isDragon = profile.id === "dragon";
    entity.creatureId = profile.id + "-" + String(state.worldSeed || 1) + "-" + String(entity.id);
    entity.home = { ...home };
    entity.anchor = { ...home };
    entity.creature = {
        id: entity.creatureId,
        name: options.name || chooseName(profile),
        species: profile.id,
        icon: profile.icon,
        ageYears,
        expectedLifespan: profile.lifespan,
        lifeStage: stageFor(profile, ageYears),
        health: 100,
        hunger: profile.id === "dragon" ? 20 : 25,
        bond: profile.id === "dragon" ? 18 : 12,
        temperament: profile.temperaments[randInt(0, profile.temperaments.length, "creatures")],
        abilities: profile.abilities.slice(),
        goals: profile.goals.slice(),
        home: { ...home },
        habitat,
        diet: profile.diet,
        territoryRadius: profile.territory,
        territory: { x: home.x, y: home.y, radius: profile.territory },
        nest: null,
        eggs: 0,
        lastBreedYear: 0,
        injuries: 0,
        ecology: { predation: 0, scavenging: 0, migrations: 0, competition: 0, hatchlings: 0 },
        lastUpdateYear: year,
        memories: []
    };
    remember(entity, options.hatch
        ? "I hatched from a clutch in " + habitat + "."
        : "I joined the realm under the care of its sovereign.", year);
    return entity;
}

// Backwards-compatible entry point used by the dragon-egg card and older saves.
export function awakenDragon(dragon) {
    return awakenCreature(dragon, "dragon");
}

export function summonCreature(speciesId = "dragon") {
    const profile = creatureProfile(speciesId);
    const living = state.entities.filter(isRoyalCreature);
    const sameSpecies = living.filter(entity => speciesOf(entity).id === profile.id);
    if (living.length >= MAX_CREATURES) return { ok: false, reason: "creature-limit" };
    if (sameSpecies.length >= profile.max) {
        return { ok: false, reason: profile.id === "dragon" ? "dragon-limit" : "species-limit" };
    }
    const gold = Math.max(0, Number(profile.cost.gold) || 0);
    const food = Math.max(0, Number(profile.cost.food) || 0);
    if ((Number(state.resources?.gold) || 0) < gold || (Number(state.resources?.food) || 0) < food) {
        return { ok: false, reason: profile.id === "dragon" ? "dragon-cost" : "creature-cost" };
    }
    if (!canSpawnEntity(CREATURE_TYPE)) return { ok: false, reason: "entity-capacity" };
    const king = state.entities.find(entity => !entity.dead && entity.isKing);
    if (!king) return { ok: false, reason: "sovereign-required" };
    const creature = spawnEntity(king.x + 2 + sameSpecies.length, king.y + 1, CREATURE_TYPE);
    if (!creature) return { ok: false, reason: "entity-capacity" };
    awakenCreature(creature, profile.id);
    if (gold > 0) addResource("gold", -gold);
    if (food > 0) {
        recordResourceMovement("food", -food, "creature-tribute", {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "creature", id: creature.id }
        });
        addResource("food", -food);
    }
    addLog((profile.id === "dragon" ? "A DRAGON" : "A " + profile.label.toUpperCase()) + " HAS JOINED THE REALM: " + creature.creature.name, "#e8b65f", "creature");
    return { ok: true, dragon: creature, creature };
}

export function summonDragon() {
    return summonCreature("dragon");
}

function feedCreature(entity, c, profile, year) {
    if ((Number(state.resources?.food) || 0) >= profile.foodNeed && c.hunger >= 35) {
        recordResourceMovement("food", -profile.foodNeed, "creature-feeding", {
            from: { kind: "realm", id: "royal-stores" },
            to: { kind: "creature", id: entity.id },
            key: "food:creature:" + entity.id + ":" + year
        });
        addResource("food", -profile.foodNeed);
        c.hunger = Math.max(0, c.hunger - 42);
        c.health = Math.min(100, c.health + 3);
        return true;
    }
    if (c.hunger >= 65) {
        c.health = Math.max(0, c.health - 12);
        c.injuries = Math.max(0, Number(c.injuries) || 0) + 1;
        state.morale = Math.max(0, (Number(state.morale) || 0) - 1.5);
    }
    return false;
}

function forageCreature(c, profile) {
    const region = localRegion(c.home.x, c.home.y);
    if (!region) return;
    if (profile.diet === "carnivore" && Array.isArray(region.fauna) && region.fauna.length) {
        const prey = region.fauna
            .filter(row => row.population > 2 && profile.preyRoles.includes(row.role))
            .sort((a, b) => b.population - a.population)[0];
        if (prey && random("creatures") < 0.55) {
            prey.population = Math.max(0, prey.population - 1);
            c.ecology.predation = Math.max(0, Number(c.ecology.predation) || 0) + 1;
            c.hunger = Math.max(0, c.hunger - 5);
            region.carcassLoad = clamp((Number(region.carcassLoad) || 0) + 0.012, 0, 1);
            if (c.ecology.predation % 4 === 1) remember(c, "I hunted " + (prey.label || prey.id) + " in " + (region.name || "the wilds") + ".", state.year);
        }
    }
    if ((profile.diet === "scavenger" || profile.diet === "omnivore") && (Number(region.carcassLoad) || 0) > 0.03) {
        region.carcassLoad = clamp(region.carcassLoad - 0.04, 0, 1);
        c.ecology.scavenging = Math.max(0, Number(c.ecology.scavenging) || 0) + 1;
        c.hunger = Math.max(0, c.hunger - 3);
        if (c.ecology.scavenging % 5 === 1) remember(c, "I cleared carrion from " + (region.name || "the wilds") + ".", state.year);
    }
}

function migrateCreature(entity, c, profile) {
    const currentHabitat = healthBiomeAt(c.home.x, c.home.y);
    if (profile.biomes.includes(currentHabitat)) {
        c.habitat = currentHabitat;
        return false;
    }
    const target = findHabitat(profile, c.home.x, c.home.y);
    if (!target) return false;
    c.home = { ...target };
    entity.home = { ...target };
    entity.anchor = { ...target };
    c.habitat = healthBiomeAt(target.x, target.y);
    c.territory = { x: target.x, y: target.y, radius: profile.territory };
    c.ecology.migrations = Math.max(0, Number(c.ecology.migrations) || 0) + 1;
    remember(c, "I migrated to " + c.habitat + " in search of a suitable territory.", state.year);
    return true;
}

function competeCreature(entity, c, profile) {
    const rivals = state.entities.filter(other =>
        other !== entity && isRoyalCreature(other) &&
        speciesOf(other).id === profile.id &&
        Math.hypot((other.creature.home?.x || other.x) - c.home.x, (other.creature.home?.y || other.y) - c.home.y) <= profile.territory * 1.5
    );
    if (!rivals.length || random("creatures") >= 0.3) return false;
    c.health = Math.max(0, c.health - 2);
    c.injuries = Math.max(0, Number(c.injuries) || 0) + 1;
    c.ecology.competition = Math.max(0, Number(c.ecology.competition) || 0) + 1;
    remember(c, "A territorial dispute with another " + profile.label.toLowerCase() + " left me wounded.", state.year);
    return true;
}

function hatchNest(entity, c, profile, year) {
    if (!c.nest || !c.eggs) return null;
    if (year - (Number(c.nest.laidYear) || year) > 8) {
        c.nest = null;
        c.eggs = 0;
        remember(c, "My old clutch never hatched.", year);
        return null;
    }
    const sameSpecies = state.entities.filter(other => isRoyalCreature(other) && speciesOf(other).id === profile.id);
    if (sameSpecies.length >= profile.max || state.entities.filter(isRoyalCreature).length >= MAX_CREATURES) return null;
    if (!canSpawnEntity(CREATURE_TYPE)) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const x = (Number(c.nest.x) || c.home.x) + (attempt % 3) - 1;
        const y = (Number(c.nest.y) || c.home.y) + Math.floor(attempt / 3) - 1;
        const hatchling = spawnEntity(x, y, CREATURE_TYPE);
        if (!hatchling) continue;
        awakenCreature(hatchling, profile.id, {
            ageYears: 0,
            home: { x, y },
            habitat: healthBiomeAt(x, y),
            hatch: true
        });
        hatchling.home = { x: c.nest.x, y: c.nest.y };
        hatchling.anchor = { ...hatchling.home };
        c.eggs = Math.max(0, Number(c.eggs) - 1);
        c.ecology.hatchlings = Math.max(0, Number(c.ecology.hatchlings) || 0) + 1;
        if (c.eggs <= 0) c.nest = null;
        remember(c, "A hatchling of my clutch joined the realm.", year);
        addLog("A " + profile.label.toUpperCase() + " HATCHLING HAS JOINED THE REALM: " + hatchling.creature.name, "#e8b65f", "creature");
        return hatchling;
    }
    return null;
}

function breedCreature(entity, c, profile, year) {
    if (c.eggs > 0 || c.nest) return false;
    if (c.ageYears < profile.breedingAge || c.health < 55 || c.hunger >= 65) return false;
    if (year - (Number(c.lastBreedYear) || 0) < profile.breedYears) return false;
    c.lastBreedYear = year;
    c.eggs = profile.clutch;
    c.nest = { x: c.home.x, y: c.home.y, laidYear: year };
    remember(c, "I laid a clutch of " + profile.clutch + " eggs in my territory.", year);
    return true;
}

export function updateCreatures() {
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    let updated = 0;
    let deaths = 0;
    let births = 0;
    for (const entity of state.entities) {
        if (!isRoyalCreature(entity)) continue;
        const c = entity.creature;
        if (!c.home) c.home = { ...(entity.home || { x: entity.x, y: entity.y }) };
        const profile = speciesOf(entity);
        const last = Math.max(1, Math.floor(Number(c.lastUpdateYear) || year));
        if (year <= last) continue;
        const previousAge = Math.max(0, Number(c.ageYears) || 0);
        const elapsed = Math.min(1000, year - last);
        c.ageYears = Math.min(1000, previousAge + elapsed);
        const previousStage = c.lifeStage || stageFor(profile, previousAge);
        c.lifeStage = stageFor(profile, c.ageYears);
        c.hunger = clamp((Number(c.hunger) || 0) + elapsed * 16, 0, 100);
        const king = state.entities.find(entry => !entry.dead && entry.isKing);
        const nearKing = king && Math.hypot(king.x - entity.x, king.y - entity.y) <= 10;
        if (nearKing) c.bond = Math.min(100, (Number(c.bond) || 0) + Math.min(8, elapsed * 2));
        else c.bond = Math.max(0, (Number(c.bond) || 0) - Math.min(4, elapsed));

        feedCreature(entity, c, profile, year);
        forageCreature(c, profile);
        competeCreature(entity, c, profile);
        if (c.hunger >= 55 || c.injuries > 0) migrateCreature(entity, c, profile);
        c.territory = { x: c.home.x, y: c.home.y, radius: profile.territory };
        c.habitat = healthBiomeAt(c.home.x, c.home.y);

        const hatchling = hatchNest(entity, c, profile, year);
        if (hatchling) births++;
        if (!c.eggs) breedCreature(entity, c, profile, year);
        c.lastUpdateYear = year;
        updated++;

        if (previousStage !== c.lifeStage) {
            remember(entity, "I entered the " + c.lifeStage + " stage of my life.", year);
        }
        const lifespan = Math.max(20, Number(c.expectedLifespan) || profile.lifespan);
        const ageRisk = c.ageYears < lifespan ? 0 : Math.min(0.75, 0.08 + (c.ageYears - lifespan) * 0.006);
        if (c.health > 0 && ageRisk > 0 && random("creatures") < ageRisk) c.health = 0;
        if (c.health <= 0) {
            const cause = ageRisk > 0 ? "old age" : (c.ecology.competition > 0 ? "territorial wounds" : "starvation");
            remember(entity, "My life ended in year " + year + " from " + cause + ".", year);
            entity.dead = true;
            deaths++;
            const archive = state.creatureArchive || (state.creatureArchive = []);
            archive.push({
                creatureId: entity.creatureId,
                name: c.name,
                species: profile.id,
                ageYears: c.ageYears,
                lifeStage: c.lifeStage,
                deathYear: year,
                cause,
                memories: (c.memories || []).slice(-8)
            });
            state.creatureArchive = archive.slice(-MAX_ARCHIVE);
            addLog("THE " + profile.label.toUpperCase() + " HAS FALLEN: " + c.name, "#b84a43", "creature");
        }
    }
    return { updated, deaths, births };
}

export function getCreatureSnapshot() {
    return {
        living: state.entities.filter(isRoyalCreature).map(entity => ({
            ...entity.creature,
            memories: (entity.creature.memories || []).slice()
        })),
        archive: (state.creatureArchive || []).slice(-MAX_ARCHIVE),
        species: CREATURE_SPECIES_LIST.map(profile => ({
            id: profile.id,
            label: profile.label,
            icon: profile.icon,
            max: profile.max,
            living: state.entities.filter(entity => isRoyalCreature(entity) && speciesOf(entity).id === profile.id).length,
            cost: { ...profile.cost }
        }))
    };
}

export const __creatureInternals = { stageFor, healthBiomeAt, findHabitat, MAX_CREATURES };
