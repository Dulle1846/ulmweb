import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { initializeCityForRealm, ensureInventory } from "../../js/systems/logistics.js";
import { updateCraftProduction, CRAFT_INTERVAL } from "../../js/systems/craft-production.js";
import { normalizeCraftedItems, validateCraftedItems, MAX_CRAFTED_ITEMS } from "../../js/systems/item-lexicon.js";

function setup({ inputs = true, workers = true, gold = 100 } = {}) {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = CRAFT_INTERVAL;
    state.year = 1;
    state.dayOfYear = CRAFT_INTERVAL;
    state.seasonIndex = 1;
    state.worldSeed = 20261111;
    state.resources = { wood: 400, stone: 400, gold, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    initStartingKingdom();
    initializeCityForRealm({ seedWarehouse: false });

    const smithy = state.entities.find(entity => entity.type === TYPE.SMITHY && !entity.dead);
    const scriptorium = state.entities.find(entity => entity.type === TYPE.SCRIPTORIUM && !entity.dead);
    assert.ok(smithy, "the starting realm must contain a real smithy");
    assert.ok(scriptorium, "the starting realm must contain a real scriptorium");
    ensureInventory(smithy);
    ensureInventory(scriptorium);
    if (inputs) {
        smithy.inventory.input.planks = 4;
        smithy.inventory.input.firewood = 4;
        scriptorium.inventory.input.planks = 4;
        scriptorium.inventory.input.water = 4;
    }
    if (!workers) {
        for (const villager of state.entities) {
            if (villager.workplace === smithy || villager.workplace === scriptorium) villager.dead = true;
        }
    }
    return { smithy, scriptorium };
}

test("a staffed, supplied smithy and scriptorium record real unique items", () => {
    const { smithy, scriptorium } = setup();
    const smith = state.entities.find(entity => !entity.dead && entity.workplace === smithy);
    const scribe = state.entities.find(entity => !entity.dead && entity.workplace === scriptorium);
    assert.ok(smith && scribe, "both workshops must open with named staff");
    assert.equal(smith.job, "smith");
    assert.equal(scribe.job, "scribe");

    const made = updateCraftProduction();
    assert.equal(made, 2);
    assert.equal(state.craftedItems.length, 2);
    const weapon = state.craftedItems.find(item => item.kind === "weapon");
    const book = state.craftedItems.find(item => item.kind === "book");
    assert.ok(weapon && book, "the archive must contain one forged weapon and one generated book");
    assert.equal(weapon.category, "weapon");
    assert.equal(book.category, "book");
    assert.equal(weapon.origin, "crafted");
    assert.equal(book.origin, "crafted");
    assert.equal(weapon.workshop, "Royal Smithy");
    assert.equal(book.workshop, "Royal Scriptorium");
    assert.equal(weapon.crafterId, String(smith.personId || smith.person?.id || smith.id));
    assert.equal(book.crafterId, String(scribe.personId || scribe.person?.id || scribe.id));
    assert.ok(weapon.crafterName && book.crafterName);
    assert.equal(weapon.year, 1);
    assert.equal(book.year, 1);
    assert.equal(weapon.tick, CRAFT_INTERVAL);
    assert.equal(book.tick, CRAFT_INTERVAL);
    assert.ok(weapon.quality >= 1 && weapon.quality <= 100);
    assert.ok(book.quality >= 1 && book.quality <= 100);
    assert.ok(weapon.materials.some(entry => entry.id === "iron" && entry.amount === 2));
    assert.ok(book.materials.some(entry => entry.id === "parchment" && entry.amount === 3));
    assert.match(weapon.source, /Royal Smithy · year 1/);
    assert.match(book.source, /Royal Scriptorium · year 1/);
    assert.equal(smithy.inventory.input.planks, 2);
    assert.equal(smithy.inventory.input.firewood, 2);
    assert.equal(scriptorium.inventory.input.planks, 3);
    assert.equal(scriptorium.inventory.input.water, 3);
    assert.equal(state.resources.gold, 95);
    assert.equal(state.economy.crafting.itemsMade, 2);
    assert.equal(state.economy.crafting.weapons, 1);
    assert.equal(state.economy.crafting.books, 1);
    assert.equal(state.eventLog.filter(entry => entry.kind === "craft").length, 2);
    assert.match(smithy.productionReason, /recorded/);
    assert.match(scriptorium.productionReason, /recorded/);

    // A repeated call in the same season is a no-op: the archive, inputs,
    // treasury and event log all stay exactly as they were.
    const before = JSON.stringify(state.craftedItems);
    const goldBefore = state.resources.gold;
    assert.equal(updateCraftProduction(), 0);
    assert.equal(JSON.stringify(state.craftedItems), before);
    assert.equal(state.resources.gold, goldBefore);

    const restored = normalizeCraftedItems(JSON.parse(JSON.stringify(state.craftedItems)));
    assert.deepEqual(restored, state.craftedItems);
    assert.doesNotThrow(() => validateCraftedItems(restored));
    assert.ok(restored.length < MAX_CRAFTED_ITEMS);
});

test("workshop production is deterministic for the same seed and season", () => {
    setup();
    updateCraftProduction();
    const first = state.craftedItems.map(item => item.id);
    setup();
    updateCraftProduction();
    const second = state.craftedItems.map(item => item.id);
    assert.deepEqual(second, first, "the same seed, staff and season must produce the same stable ids");
});

test("missing inputs, staff or treasury stops production without consuming stock", () => {
    const noInputs = setup({ inputs: false });
    assert.equal(updateCraftProduction(), 0);
    assert.equal(state.craftedItems.length, 0);
    assert.equal(noInputs.smithy.inventory.input.planks, 0);

    setup({ workers: false });
    assert.equal(updateCraftProduction(), 0);
    assert.equal(state.craftedItems.length, 0);

    const noGold = setup({ gold: 0 });
    assert.equal(updateCraftProduction(), 0);
    assert.equal(state.craftedItems.length, 0);
    assert.equal(noGold.smithy.inventory.input.planks, 4);
});

test("the simulation and UI contracts expose the real craft loop", async () => {
    const [simulation, craft, source] = await Promise.all([
        readFile(new URL("../../js/simulation/simulation.js", import.meta.url), "utf8"),
        readFile(new URL("../../js/systems/craft-production.js", import.meta.url), "utf8"),
        readFile(new URL("../../js/world/entities.js", import.meta.url), "utf8"),
    ]);
    assert.ok(simulation.includes("updateCraftProduction()"));
    assert.ok(craft.includes("CRAFT_INTERVAL") && craft.includes("appendCraftedItem"));
    assert.ok(source.includes("TYPE.SMITHY") && source.includes("TYPE.SCRIPTORIUM"));
});
