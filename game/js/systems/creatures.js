// Persistent fantasy creatures: identity, lifecycle, needs, bonds, autonomous movement and memorials.
import { state } from "../core/state.js";
import { randInt } from "../core/random.js";

export const CREATURE_MEMORY_LIMIT = 20;
export const CREATURE_ARCHIVE_LIMIT = 200;
const SPECIES = Object.freeze({
    dragons: { maturation: 16, lifespan: 220, feed: 5, health: 100, power: 100 },
    wyverns: { maturation: 14, lifespan: 150, feed: 4, health: 90, power: 82 },
    trolls: { maturation: 30, lifespan: 180, feed: 6, health: 120, power: 90 },
    "giant-spiders": { maturation: 4, lifespan: 60, feed: 2, health: 75, power: 55 },
    "cave-bears": { maturation: 6, lifespan: 45, feed: 4, health: 110, power: 68 },
    wargs: { maturation: 3, lifespan: 32, feed: 3, health: 85, power: 62 },
    basilisks: { maturation: 12, lifespan: 160, feed: 4, health: 105, power: 88 },
    "giant-boars": { maturation: 3, lifespan: 26, feed: 3, health: 90, power: 58 },
    "marsh-wights": { maturation: 20, lifespan: 170, feed: 1, health: 95, power: 72 },
    "stone-guardians": { maturation: 80, lifespan: 800, feed: 0, health: 160, power: 105 },
    deer: { maturation: 2, lifespan: 20, feed: 1, health: 45, power: 10 },
    "wild-deer": { maturation: 2, lifespan: 20, feed: 1, health: 45, power: 10 }
});
const NAMES = Object.freeze({
    dragons: ["Emberwing", "Ashscale", "Cinderheart", "Sunspite", "Goldflame", "Thornfire", "Stormmaw", "Brightclaw"],
    wyverns: ["Skyrake", "Needlewind", "Razorwing", "Cloudfang"],
    trolls: ["Mossbreaker", "Gravelhide", "Old Boulder"],
    "giant-spiders": ["Silkshade", "Eightfold", "Webmother"],
    "cave-bears": ["Stonepaw", "Mossfur", "Winterclaw"],
    wargs: ["Greyfang", "Nightstep", "Redhowl"],
    basilisks: ["Glass-Eye", "Sunstare", "Gorgon"],
    "giant-boars": ["Iron Tusk", "Rootbreaker"],
    "marsh-wights": ["Mirewalker", "Fen Whisper"],
    "stone-guardians": ["The Watcher", "Granite Oath"]
});
const TEMPERAMENTS = ["curious", "proud", "protective", "wary", "playful", "fierce"];
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));

function addCreatureMemory(creature, text, year = yearNow()) {
    creature.memories = Array.isArray(creature.memories) ? creature.memories : [];
    const id = creature.id + ":" + year + ":" + text.slice(0, 32);
    if (creature.memories.some(memory => memory.id === id)) return false;
    creature.memories.push({ id, year, text: String(text).slice(0, 240) });
    if (creature.memories.length > CREATURE_MEMORY_LIMIT) creature.memories.splice(0, creature.memories.length - CREATURE_MEMORY_LIMIT);
    return true;
}

export function normalizeCreatureProfile(input, entity = null) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const species = SPECIES[input.species] ? input.species : "deer";
    const spec = SPECIES[species];
    const id = String(input.id || entity?.id || "creature-unknown").slice(0, 120);
    return {
        id,
        name: String(input.name || "Unnamed Creature").slice(0, 80),
        species,
        originCard: String(input.originCard || species).slice(0, 100),
        rarity: String(input.rarity || "common").slice(0, 24),
        ageYears: clamp(Math.floor(Number(input.ageYears) || 0), 0, 100000),
        maturationYears: clamp(Math.floor(Number(input.maturationYears) || spec.maturation), 1, 10000),
        lifespanYears: clamp(Math.floor(Number(input.lifespanYears) || spec.lifespan), 2, 100000),
        lifeStage: ["young", "adult", "elder"].includes(input.lifeStage) ? input.lifeStage : "young",
        hunger: clamp(input.hunger, 0, 100),
        health: clamp(input.health ?? spec.health, 0, 100),
        temperament: TEMPERAMENTS.includes(input.temperament) ? input.temperament : "wary",
        loyalty: clamp(input.loyalty ?? 35, 0, 100),
        power: clamp(input.power ?? spec.power, 0, 200),
        bondedTo: typeof input.bondedTo === "string" ? input.bondedTo.slice(0, 120) : null,
        bornAtYear: clamp(Math.floor(Number(input.bornAtYear) || yearNow()), 1, 1000000),
        lastAgedYear: clamp(Math.floor(Number(input.lastAgedYear) || yearNow()), 1, 1000000),
        lastFedYear: clamp(Math.floor(Number(input.lastFedYear) || 0), 0, 1000000),
        lastBondYear: clamp(Math.floor(Number(input.lastBondYear) || 0), 0, 1000000),
        memories: Array.isArray(input.memories) ? input.memories.filter(memory => memory && typeof memory === "object")
            .slice(-CREATURE_MEMORY_LIMIT).map(memory => ({
                id: String(memory.id || "").slice(0, 180),
                year: clamp(Math.floor(Number(memory.year) || 1), 1, 1000000),
                text: String(memory.text || "").slice(0, 240)
            })) : []
    };
}

export function initializeCreature(entity, card = {}) {
    if (!entity || entity.dead) return null;
    const species = SPECIES[card.category] ? card.category :
        (card.group === "monsters" ? "dragons" : "deer");
    const spec = SPECIES[species];
    const options = NAMES[species] || ["Fern", "Bramble", "Swiftfoot", "Ash"];
    const name = options[randInt(0, options.length, "creatures")];
    const monarch = state.entities.find(person => !person.dead && person.isKing);
    const creature = normalizeCreatureProfile({
        id: "creature:" + entity.id,
        name,
        species,
        originCard: card.name || card.category || species,
        rarity: card.rarity || "common",
        ageYears: 0,
        maturationYears: spec.maturation,
        lifespanYears: spec.lifespan,
        lifeStage: "young",
        hunger: 18,
        health: spec.health,
        temperament: TEMPERAMENTS[randInt(0, TEMPERAMENTS.length, "creatures")],
        loyalty: 38,
        power: spec.power,
        bondedTo: monarch?.personId || null,
        bornAtYear: yearNow(),
        lastAgedYear: yearNow(),
        lastFedYear: 0,
        lastBondYear: 0,
        memories: []
    }, entity);
    entity.creature = creature;
    entity.home = { x: entity.x, y: entity.y };
    entity.anchor = { x: entity.x, y: entity.y };
    entity.maxHp = Math.max(entity.maxHp || 1, species === "dragons" ? 520 : 100);
    entity.hp = entity.maxHp;
    addCreatureMemory(creature, "I entered the realm through " + (card.name || species) + ".");
    if (monarch) addCreatureMemory(creature, "I first sensed the presence of " + (monarch.person?.name || "the monarch") + ".");
    return creature;
}

export function recordCreatureDeath(entity, cause = "unknown") {
    if (!entity?.creature) return null;
    const creature = normalizeCreatureProfile(entity.creature, entity);
    if (Number.isFinite(entity.maxHp) && entity.maxHp > 0 && Number.isFinite(entity.hp)) {
        creature.health = Math.min(creature.health, clamp(entity.hp / entity.maxHp * 100, 0, 100));
    }
    state.creatureArchive = Array.isArray(state.creatureArchive) ? state.creatureArchive : [];
    if (!state.creatureArchive.some(entry => entry.id === creature.id)) {
        state.creatureArchive.push({
            ...creature,
            cause: String(cause || "unknown").slice(0, 60),
            diedAtYear: yearNow()
        });
        if (state.creatureArchive.length > CREATURE_ARCHIVE_LIMIT) {
            state.creatureArchive.splice(0, state.creatureArchive.length - CREATURE_ARCHIVE_LIMIT);
        }
    }
    entity.dead = true;
    return creature;
}

export function normalizeCreatureArchive(input = state.creatureArchive) {
    return (Array.isArray(input) ? input : []).filter(entry => entry && typeof entry === "object")
        .slice(-CREATURE_ARCHIVE_LIMIT).map(entry => ({
            ...normalizeCreatureProfile(entry, null),
            cause: String(entry.cause || "unknown").slice(0, 60),
            diedAtYear: clamp(Math.floor(Number(entry.diedAtYear) || 1), 1, 1000000)
        }));
}

function updateCreatureMovement(entity) {
    if (state.tick % 50 === 0) {
        const origin = entity.home || entity.anchor || { x: entity.x, y: entity.y };
        entity.targetX = clamp(origin.x + randInt(-5, 6, "creatures"), 1, 198);
        entity.targetY = clamp(origin.y + randInt(-5, 6, "creatures"), 1, 198);
    }
    const dx = (entity.targetX ?? entity.x) - entity.x;
    const dy = (entity.targetY ?? entity.y) - entity.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.15) {
        const speed = entity.creature.species === "dragons" ? 0.055 : 0.035;
        entity.velocityX = dx / distance * speed;
        entity.velocityY = dy / distance * speed;
        entity.x = clamp(entity.x + entity.velocityX, 0, 199);
        entity.y = clamp(entity.y + entity.velocityY, 0, 199);
        entity.visualState = "walk";
    } else {
        entity.velocityX = 0;
        entity.velocityY = 0;
        entity.visualState = "idle";
    }
}

function ageCreature(entity, creature, elapsedYears) {
    const spec = SPECIES[creature.species];
    creature.ageYears = clamp(creature.ageYears + elapsedYears, 0, 100000);
    creature.hunger = clamp(creature.hunger + elapsedYears * (creature.species === "stone-guardians" ? 0 : 9), 0, 100);
    if (creature.ageYears >= creature.lifespanYears) creature.health = 0;
    if (creature.ageYears >= creature.maturationYears && creature.ageYears < creature.lifespanYears * 0.72) {
        if (creature.lifeStage !== "adult") addCreatureMemory(creature, "I reached maturity and became an adult.");
        creature.lifeStage = "adult";
    } else if (creature.ageYears >= creature.lifespanYears * 0.72) {
        if (creature.lifeStage !== "elder") addCreatureMemory(creature, "I entered the final stage of my life.");
        creature.lifeStage = "elder";
    } else creature.lifeStage = "young";

    const monarch = creature.bondedTo
        ? state.entities.find(person => !person.dead && person.personId === creature.bondedTo)
        : null;
    if (monarch && Math.hypot(monarch.x - entity.x, monarch.y - entity.y) < 14 && creature.lastBondYear < yearNow()) {
        creature.loyalty = clamp(creature.loyalty + 2, 0, 100);
        creature.lastBondYear = yearNow();
        if (creature.loyalty >= 75) addCreatureMemory(creature, "I grew more trusting of the royal household.");
    } else if (!monarch && creature.bondedTo) {
        addCreatureMemory(creature, "The person I bonded with is no longer present.");
        creature.bondedTo = null;
    }

    let fed = false;
    if (creature.hunger >= 30 && spec.feed > 0 && Number(state.resources.food) >= spec.feed) {
        state.resources.food -= spec.feed;
        creature.hunger = clamp(creature.hunger - 42, 0, 100);
        creature.health = clamp(creature.health + 3, 0, 100);
        creature.lastFedYear = yearNow();
        fed = true;
        addCreatureMemory(creature, "The realm provided food and I recovered my strength.");
    } else if (creature.hunger >= 72 && spec.feed > 0) {
        creature.health = clamp(creature.health - Math.min(24, (creature.hunger - 65) * 0.45), 0, 100);
        addCreatureMemory(creature, "Hunger weakened me; food was scarce.");
    }
    if (creature.health <= 0) {
        recordCreatureDeath(entity, creature.ageYears >= creature.lifespanYears ? "old age" : "starvation");
        return { aged: elapsedYears, fed, died: true, name: creature.name, species: creature.species };
    }
    entity.hp = Math.max(1, Math.round(entity.maxHp * creature.health / 100));
    return { aged: elapsedYears, fed, died: false, name: creature.name, species: creature.species };
}

export function updateCreatures() {
    const living = state.entities.filter(entity => !entity.dead && entity.creature);
    let aged = 0, fed = 0, deaths = 0;
    const deceased = [];
    for (const entity of living) {
        const creature = normalizeCreatureProfile(entity.creature, entity);
        entity.creature = creature;
        updateCreatureMovement(entity);
        if (yearNow() <= creature.lastAgedYear) continue;
        const elapsed = Math.min(1000, yearNow() - creature.lastAgedYear);
        creature.lastAgedYear = yearNow();
        const result = ageCreature(entity, creature, elapsed);
        aged++;
        if (result.fed) fed++;
        if (result.died) { deaths++; deceased.push({ name: result.name, species: result.species }); }
    }
    return { aged, fed, deaths, deceased };
}
