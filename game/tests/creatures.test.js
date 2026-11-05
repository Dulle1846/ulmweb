import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity, canSpawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile } from "../js/systems/people.js";
import { CARD_CATEGORIES, createCardForCategory } from "../js/systems/card-catalog.js";
import {
    initializeCreature, normalizeCreatureProfile, normalizeCreatureArchive,
    updateCreatures, recordCreatureDeath, CREATURE_ARCHIVE_LIMIT
} from "../js/systems/creatures.js";

let monarch;
beforeEach(() => {
    resetState();
    state.worldSeed = 77221;
    state.year = 1;
    state.tick = 1;
    state.resources.food = 40;
    monarch = spawnEntity(40, 40, TYPE.KNIGHT);
    monarch.isKing = true;
    monarch.personId = monarch.id;
    ensurePersonProfile(monarch, { role: "king", species: "human" });
});

test("the monster catalogue contains a curated dragon card without growing unbounded", () => {
    assert.equal(CARD_CATEGORIES.length, 501);
    const card = createCardForCategory("dragons");
    assert.equal(card.type, TYPE.DRAGON);
    assert.equal(card.kind, "creature");
    assert.equal(card.unit, true);
    assert.match(card.name, /DRAGON/);
});

test("dragon cards create persistent identities with species traits and a royal bond", () => {
    const entity = spawnEntity(42, 40, TYPE.DRAGON);
    const creature = initializeCreature(entity, { category: "dragons", group: "monsters", name: "YOUNG DRAGON", rarity: "rare" });
    assert.ok(creature.id.startsWith("creature:"));
    assert.ok(creature.name.length > 2);
    assert.equal(creature.species, "dragons");
    assert.equal(creature.lifeStage, "young");
    assert.equal(creature.lifespanYears, 220);
    assert.equal(creature.bondedTo, monarch.personId);
    assert.equal(entity.maxHp, 520);
    assert.equal(entity.creature, creature);
    assert.ok(creature.memories.some(memory => memory.text.includes("YOUNG DRAGON")));
});

test("creatures age once per realm year, feed from the treasury and retain needs", () => {
    const entity = spawnEntity(42, 40, TYPE.DRAGON);
    const creature = initializeCreature(entity, { category: "dragons", name: "Dragon" });
    creature.hunger = 50;
    state.year = 2;
    state.tick = 50;
    const first = updateCreatures();
    assert.equal(first.aged, 1);
    assert.equal(first.fed, 1);
    assert.equal(entity.creature.ageYears, 1);
    assert.ok(entity.creature.hunger < 30);
    assert.equal(state.resources.food, 35);
    assert.equal(updateCreatures().aged, 0);
    assert.equal(creature.ageYears, 1);
});

test("creature maturity and elder stages are species-specific", () => {
    const entity = spawnEntity(42, 40, TYPE.DRAGON);
    const creature = initializeCreature(entity, { category: "dragons" });
    creature.ageYears = 15;
    creature.lastAgedYear = 1;
    state.year = 2;
    updateCreatures();
    assert.equal(entity.creature.lifeStage, "adult");
    creature.ageYears = 158;
    creature.lastAgedYear = 2;
    state.year = 3;
    updateCreatures();
    assert.equal(entity.creature.lifeStage, "elder");
});

test("starvation creates a bounded creature memorial instead of a silent disappearance", () => {
    const entity = spawnEntity(42, 40, TYPE.DRAGON);
    const creature = initializeCreature(entity, { category: "dragons" });
    creature.hunger = 100;
    creature.health = 5;
    state.resources.food = 0;
    state.year = 2;
    const result = updateCreatures();
    assert.equal(result.deaths, 1);
    assert.equal(entity.dead, true);
    assert.equal(state.creatureArchive.length, 1);
    assert.equal(state.creatureArchive[0].cause, "starvation");
    assert.equal(state.creatureArchive[0].name, creature.name);
});

test("old age ends a creature lifecycle and keeps its identity in the memorial", () => {
    const entity = spawnEntity(42, 40, TYPE.DRAGON);
    const creature = initializeCreature(entity, { category: "dragons" });
    creature.ageYears = creature.lifespanYears - 1;
    creature.lastAgedYear = 1;
    state.year = 2;
    const result = updateCreatures();
    assert.equal(result.deaths, 1);
    assert.equal(state.creatureArchive[0].cause, "old age");
    assert.equal(state.creatureArchive[0].id, creature.id);
});

test("battle deaths are archived exactly once", () => {
    const entity = spawnEntity(42, 40, TYPE.DRAGON);
    const creature = initializeCreature(entity, { category: "dragons" });
    assert.equal(recordCreatureDeath(entity, "battle").id, creature.id);
    assert.equal(recordCreatureDeath(entity, "battle").id, creature.id);
    assert.equal(state.creatureArchive.length, 1);
});

test("creature archive normalization caps history and sanitizes malformed fields", () => {
    const archive = Array.from({ length: CREATURE_ARCHIVE_LIMIT + 20 }, (_, index) => ({
        id: "creature-" + index, species: "dragons", name: "Dragon " + index,
        cause: "old age", diedAtYear: 10
    }));
    const normalized = normalizeCreatureArchive(archive);
    assert.equal(normalized.length, CREATURE_ARCHIVE_LIMIT);
    assert.equal(normalized[0].id, "creature-20");
    assert.equal(normalizeCreatureProfile({ species: "unknown", health: 900, hunger: -20 }).species, "deer");
    assert.equal(normalizeCreatureProfile({ species: "dragons", health: 900, hunger: -20 }).health, 100);
    assert.equal(normalizeCreatureProfile({ species: "dragons", health: 900, hunger: -20 }).hunger, 0);
});

test("dragon units obey the same bounded mobile population limits", () => {
    assert.equal(canSpawnEntity(TYPE.DRAGON), true);
});
