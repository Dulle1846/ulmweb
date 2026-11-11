import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
    BASE_ITEMS, buildItemCatalog, createCraftedItem, appendCraftedItem,
    normalizeCraftedItem, validateCraftedItems, ITEM_CATEGORIES, MAX_CRAFTED_ITEMS
} from "../../js/systems/item-lexicon.js";
import { normalizeSaveSnapshot, validateSaveSnapshot, SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";

function forgedOptions(overrides = {}) {
    return {
        kind: "weapon",
        materials: { iron: 3, planks: 1 },
        crafterId: "person-ada",
        crafterName: "Ada Ashford",
        workshop: "Royal Smithy",
        year: 4,
        tick: 120,
        worldSeed: 9917,
        ...overrides,
    };
}

test("the base lexicon unifies every authoritative item table without duplicate ids", () => {
    const catalog = buildItemCatalog();
    assert.ok(catalog.baseCount >= 165, "expected a genuinely large base lexicon, got " + catalog.baseCount);
    assert.equal(catalog.total, catalog.baseCount);
    assert.equal(new Set(catalog.rows.map(row => row.id)).size, catalog.total);
    assert.ok(catalog.rows.every(row => row.label && row.category && row.source && row.summary && row.search));
    for (const category of ["resource", "material", "metal", "food", "drink", "fuel", "timber", "forage", "mast", "game", "medicine", "luxury", "poison", "fibre", "resin", "furnishing"]) {
        assert.ok(catalog.categoryCounts[category] > 0, "missing populated item category " + category);
    }
    assert.equal(catalog.categoryCounts.crafted, 0, "a fresh catalogue has no player-made records");
    assert.equal(catalog.rows.filter(row => row.label === "Firewood").length, 1, "firewood is one real warehouse good, not two");
    assert.ok(catalog.rows.some(row => row.label === "Oak timber" && row.category === "timber"));
    assert.ok(catalog.rows.some(row => row.label === "Cacao pods" && row.origin === "tropical"));
    assert.ok(catalog.rows.some(row => row.label === "Iron" && row.category === "metal"));
    assert.ok(catalog.rows.some(row => row.label === "Bed" && row.category === "furnishing"));
    assert.deepEqual(catalog.categories.map(entry => entry.id), ITEM_CATEGORIES.map(entry => entry.id));
});

test("crafted weapons, armour, tools and books receive stable deterministic records", () => {
    const first = createCraftedItem(forgedOptions());
    const second = createCraftedItem(forgedOptions());
    assert.equal(first.id, second.id);
    assert.equal(first.label, second.label);
    assert.equal(first.quality, second.quality);
    assert.equal(first.qualityBand, second.qualityBand);
    assert.deepEqual(first.materials, second.materials);
    assert.equal(first.origin, "crafted");
    assert.equal(first.category, "weapon");
    assert.equal(first.crafterName, "Ada Ashford");
    assert.equal(first.source, "Royal Smithy · year 4");
    assert.ok(first.detail.includes("quality " + first.quality + "/100"));
    assert.ok(first.tags.includes("player-made"));
    assert.equal(normalizeCraftedItem(first).id, first.id);

    const book = createCraftedItem(forgedOptions({ kind: "book", materials: { planks: 2 }, serial: 1 }));
    assert.equal(book.category, "book");
    assert.ok(book.label.length > 8);
    assert.notEqual(book.id, first.id);
    assert.equal(book.quality, createCraftedItem(forgedOptions({ kind: "book", materials: { planks: 2 }, serial: 1 })).quality);

    const catalogue = buildItemCatalog([first, book]);
    assert.equal(catalogue.craftedCount, 2);
    assert.equal(catalogue.categoryCounts.crafted, 2);
    assert.equal(catalogue.categoryCounts.weapon, 1);
    assert.equal(catalogue.categoryCounts.book, 1);
    assert.ok(catalogue.rows.some(row => row.id === first.id && row.origin === "crafted"));
});

test("crafted archives are idempotent, bounded and reject malformed saves", () => {
    const item = createCraftedItem(forgedOptions());
    const archive = appendCraftedItem([], item);
    assert.equal(archive.length, 1);
    assert.equal(appendCraftedItem(archive, item).length, 1, "registering the same record twice must not duplicate it");

    const many = Array.from({ length: MAX_CRAFTED_ITEMS + 5 }, (_, index) =>
        createCraftedItem(forgedOptions({ serial: index + 1 }))
    );
    const bounded = many.reduce((rows, row) => appendCraftedItem(rows, row), []);
    assert.equal(bounded.length, MAX_CRAFTED_ITEMS);
    assert.doesNotThrow(() => validateCraftedItems(bounded));
    assert.throws(() => validateCraftedItems([{ id: "not-a-crafted-item" }]), /invalid/i);

    const snapshot = {
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: 9917,
        entities: [],
        resources: { wood: 1, stone: 2, gold: 3, food: 4 },
        incomeThisTick: { wood: 0, stone: 0, gold: 0, food: 0 },
        craftedItems: [JSON.parse(JSON.stringify(item))],
    };
    assert.equal(validateSaveSnapshot(snapshot), true);
    const normalized = normalizeSaveSnapshot(snapshot);
    assert.equal(normalized.craftedItems.length, 1);
    assert.equal(normalized.craftedItems[0].id, item.id);
    assert.throws(
        () => validateSaveSnapshot({ ...snapshot, craftedItems: [{ id: "bad" }] }),
        error => error.code === "INVALID_CRAFTED_ITEMS" && error.phase === "items"
    );
});

test("base item records stay frozen and do not depend on node locale formatting", () => {
    assert.ok(Object.isFrozen(BASE_ITEMS));
    assert.ok(BASE_ITEMS.every(item => Object.isFrozen(item) && Object.isFrozen(item.tags)));
    const catalog = buildItemCatalog();
    assert.ok(catalog.rows.every(row => row.label === row.label.trim()));
});

test("the save and management contracts actually wire the crafted archive", async () => {
    const [main, validation, management] = await Promise.all([
        readFile(new URL("../../js/app/main.js", import.meta.url), "utf8"),
        readFile(new URL("../../js/core/save-validation.js", import.meta.url), "utf8"),
        readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8"),
    ]);
    assert.ok(main.includes("7:snapshot=>") && main.includes("craftedItems:normalizeCraftedItems(state.craftedItems||[])"));
    assert.ok(main.includes("state.craftedItems=normalizeCraftedItems(snapshot.craftedItems)"));
    assert.ok(validation.includes("validateCraftedItems"));
    assert.ok(management.includes('if(activePanel==="items")renderItemLexicon(panel)'));
});
