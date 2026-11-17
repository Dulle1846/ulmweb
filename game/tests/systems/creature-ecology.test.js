import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { CREATURE_SPECIES, CREATURE_SPECIES_LIST } from "../../js/world/creature-species-data.js";
import {
    __creatureInternals,
    awakenCreature,
    getCreatureSnapshot,
    summonCreature,
    summonDragon,
    updateCreatures
} from "../../js/systems/creatures.js";

function startRealm() {
    resetState();
    state.worldSeed = 20261119;
    state.year = 30;
    state.resources = { wood: 500, stone: 500, gold: 1000, food: 1000 };
    initStartingKingdom();
    return state.entities.find(entity => entity.isKing);
}

function clearCreaturesExcept(...keep) {
    state.entities = state.entities.filter(entity => entity.isKing || keep.includes(entity));
}

test("creature species ship complete habitat, diet and territory profiles", () => {
    assert.ok(CREATURE_SPECIES_LIST.length >= 4);
    for (const profile of CREATURE_SPECIES_LIST) {
        assert.ok(profile.label && profile.icon && profile.names.length >= 4, profile.id);
        assert.ok(profile.biomes.length >= 3, profile.id + " needs real habitats");
        assert.ok(["carnivore", "scavenger", "omnivore"].includes(profile.diet), profile.id + " needs a diet");
        assert.ok(profile.territory > 0 && profile.lifespan > profile.breedingAge, profile.id);
        assert.ok(profile.breedingAge > 0 && profile.clutch > 0 && profile.max > 0, profile.id);
        assert.ok(profile.cost.gold >= 0 && profile.cost.food >= 0, profile.id);
        assert.ok(profile.temperaments.length >= 3 && profile.abilities.length >= 2, profile.id);
    }
});

test("wyverns and trolls are real bounded creatures with their own costs and glyphs", () => {
    startRealm();
    const wyvern = summonCreature("wyvern");
    assert.equal(wyvern.ok, true);
    assert.equal(wyvern.creature.creature.species, "wyvern");
    assert.equal(wyvern.creature.isDragon, false);
    assert.equal(wyvern.creature.isRoyalCreature, true);
    assert.equal(wyvern.creature.creature.icon, "🦇");

    const troll = summonCreature("troll");
    assert.equal(troll.ok, true);
    assert.equal(troll.creature.creature.species, "troll");
    assert.equal(troll.creature.creature.diet, "scavenger");
    assert.equal(getCreatureSnapshot().living.length, 2);
});

test("the per-species cap refuses an extra creature without charging resources", () => {
    startRealm();
    for (let index = 0; index < CREATURE_SPECIES.wyvern.max; index++) {
        assert.equal(summonCreature("wyvern").ok, true);
    }
    const before = { ...state.resources };
    const refused = summonCreature("wyvern");
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, "species-limit");
    assert.deepEqual(state.resources, before);
});

test("a mature creature lays a clutch and the next year a hatchling joins the realm", () => {
    const king = startRealm();
    const summon = summonDragon();
    const dragon = summon.creature;
    clearCreaturesExcept(dragon);
    dragon.x = king.x + 8;
    dragon.y = king.y + 8;
    dragon.creature.home = { x: dragon.x, y: dragon.y };
    dragon.home = { ...dragon.creature.home };
    dragon.creature.ageYears = 30;
    dragon.creature.lastBreedYear = 0;
    dragon.creature.hunger = 0;
    dragon.creature.lastUpdateYear = state.year;

    state.year += 1;
    updateCreatures();
    assert.equal(dragon.creature.eggs, 2);
    assert.ok(dragon.creature.nest);

    const before = getCreatureSnapshot().living.length;
    state.year += 1;
    updateCreatures();
    const after = getCreatureSnapshot();
    assert.ok(after.living.length > before, "one egg should hatch when capacity is available");
    assert.equal(dragon.creature.ecology.hatchlings, 1);
    assert.equal(after.living.find(creature => creature.ageYears === 0)?.species, "dragon");
});

test("predation lowers local wildlife and scavenging clears the carcass load", () => {
    startRealm();
    const wyvern = summonCreature("wyvern").creature;
    const troll = summonCreature("troll").creature;
    clearCreaturesExcept(wyvern, troll);
    state.biomeAtlas = {
        regions: [{
            id: "test-forest",
            name: "Test Forest",
            rawBiome: "forest",
            x: 0, y: 0, width: 60, height: 60,
            fauna: [{ id: "red-deer", label: "Red deer", role: "herbivore", population: 20 }],
            carcassLoad: 0.2
        }]
    };
    for (const creature of [wyvern, troll]) {
        creature.creature.home = { x: 10, y: 10 };
        creature.home = { x: 10, y: 10 };
        creature.creature.hunger = 40;
        creature.creature.lastUpdateYear = state.year;
    }
    for (let year = 0; year < 12; year++) {
        state.year += 1;
        updateCreatures();
    }
    assert.ok(wyvern.creature.ecology.predation > 0, "the carnivore must consume local prey");
    assert.ok(state.biomeAtlas.regions[0].fauna[0].population < 20, "prey population must decline");
    assert.ok(troll.creature.ecology.scavenging > 0, "the scavenger must clear carrion");
});

test("a creature outside its habitat migrates to a suitable territory", () => {
    startRealm();
    const wyvern = summonCreature("wyvern").creature;
    clearCreaturesExcept(wyvern);
    state.biomeAtlas = {
        regions: [
            { id: "water", rawBiome: "water", x: 0, y: 0, width: 20, height: 40 },
            { id: "forest", rawBiome: "forest", x: 20, y: 0, width: 20, height: 40 }
        ]
    };
    wyvern.creature.home = { x: 5, y: 5 };
    wyvern.home = { x: 5, y: 5 };
    wyvern.creature.habitat = "water";
    wyvern.creature.hunger = 80;
    wyvern.creature.lastUpdateYear = state.year;
    state.resources.food = 0;
    state.year += 1;
    updateCreatures();
    assert.ok(wyvern.creature.ecology.migrations > 0);
    assert.equal(wyvern.creature.habitat, "forest");
    assert.ok(wyvern.creature.home.x >= 20);
});

test("the memory archive records species and breeding without unbounded growth", () => {
    startRealm();
    const dragon = summonDragon().creature;
    clearCreaturesExcept(dragon);
    dragon.creature.memories = Array.from({ length: 40 }, (_, index) => ({
        id: "old-" + index, year: 1, text: "Old memory " + index
    }));
    dragon.creature.ageYears = 4;
    dragon.creature.lifeStage = "hatchling";
    state.year += 1;
    updateCreatures();
    assert.ok(dragon.creature.memories.length <= 16);
    assert.equal(typeof __creatureInternals.stageFor, "function");
    assert.equal(__creatureInternals.MAX_CREATURES, 14);
});
