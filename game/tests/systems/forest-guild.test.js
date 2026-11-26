import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initWorld } from "../../js/world/world.js";
import { getForestHabitatAt } from "../../js/systems/resource-geography.js";
import { ensureInventory } from "../../js/systems/logistics.js";
import { INDUSTRY_GOODS, FOREST_WORKS_MODES } from "../../js/world/forest-industries.js";
import { FOREST_GUILD_PATRONS, FOREST_GUILD_TIERS, forestGuildTierFor } from "../../js/world/forest-guild.js";
import {
    deliverForestCommission, ensureForestGuild, forestGuildSummary,
    industryWarehouseStock, updateForestGuild,
} from "../../js/systems/forest-guild.js";
import {
    forestMasteryFor, runForestWorks, setForestWorksMode, supplyClinicMedicine,
} from "../../js/systems/forest-industries.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}
globalThis.document = { createElement: () => makeCanvas() };

const WORLD_OPTIONS = Object.freeze({
    size: "small", shape: "continent", water: 46, landmass: 58,
    fertility: 55, forests: 78, mountains: 55, ruggedness: 58,
});
const SEED = 20261123;

function firstForestSite() {
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "temperate" });
    const geography = state.resourceGeography;
    const index = geography.forestStock.findIndex(stock => stock > 4);
    assert.ok(index >= 0, "the test world must contain a working forest");
    const x = index % state.worldW;
    const y = Math.floor(index / state.worldW);
    const stand = getForestHabitatAt(x, y)?.forestStand;
    assert.ok(stand?.forest, "the chosen tile must carry a forest stand");
    return { x, y, stand };
}

function plainBuilding(type, id, x, y) {
    return {
        id, type, x, y, dead: false,
        construction: { stage: 3, progress: 100 },
        hp: 200, maxHp: 200,
        isBuilding() { return true; },
    };
}

function warehouseFor(good, amount) {
    const warehouse = plainBuilding(TYPE.WAREHOUSE, "warehouse-guild", 20, 20);
    warehouse.warehouse = {
        filters: [good], stored: { [good]: amount }, reservedIn: {}, reservedOut: {},
        capacity: 240, used: amount, profile: "industry",
    };
    ensureInventory(warehouse);
    return warehouse;
}

test("the guild catalogue demands every finished forest good and covers ten tiers", () => {
    const demanded = new Set(FOREST_GUILD_PATRONS.flatMap(patron => patron.goods));
    for (const good of Object.keys(INDUSTRY_GOODS)) assert.ok(demanded.has(good), good + " needs a guild patron");
    assert.ok(FOREST_GUILD_PATRONS.length >= 12);
    assert.equal(FOREST_GUILD_TIERS.length, 10);
    assert.equal(forestGuildTierFor(0).tier, 1);
    assert.equal(forestGuildTierFor(760).tier, 10);
    assert.ok(forestGuildTierFor(760).premium > 0);
});

test("the commission board is deterministic, bounded and save-safe", () => {
    resetState();
    state.worldSeed = 424242;
    state.economy = {};
    const first = ensureForestGuild();
    const firstGoods = first.active.map(entry => entry.good).join(",");
    assert.equal(first.active.length, 3);
    assert.equal(new Set(first.active.map(entry => entry.id)).size, 3);
    resetState();
    state.worldSeed = 424242;
    state.economy = {};
    const second = ensureForestGuild();
    assert.equal(second.active.map(entry => entry.good).join(","), firstGoods);
    assert.equal(second.active.map(entry => entry.id).join(","), first.active.map(entry => entry.id).join(","));
});

test("filling a commission consumes real warehouse stock, pays gold and rotates the board", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 100;
    state.year = 3;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.health = { medicineStock: 0 };
    const guild = ensureForestGuild();
    const target = guild.active[0];
    state.entities = [warehouseFor(target.good, target.quantity + 2)];
    const before = state.resources.gold;
    const result = deliverForestCommission(target.id);
    assert.ok(result.ok, result.reason);
    assert.equal(result.good, target.good);
    assert.equal(state.resources.gold, before + result.gold);
    assert.equal(guild.active.length, 3);
    assert.ok(!guild.active.some(entry => entry.id === target.id), "the filled order must leave the board");
    assert.equal(guild.completed, 1);
    assert.ok(guild.renown >= target.rewardRenown);
    assert.equal(guild.history.at(-1).outcome, "delivered");
    assert.equal(industryWarehouseStock(target.good), 2);
    assert.equal(forestGuildSummary().completed, 1);
});

test("a lapsed commission moves to the ledger, costs renown and is replaced", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 2;
    state.year = 2;
    state.economy = {};
    const guild = ensureForestGuild();
    const target = guild.active[0];
    guild.renown = 20;
    for (const entry of guild.active) entry.deadlineTick = 90;
    target.deadlineTick = 30;
    state.tick = 60;
    const changed = updateForestGuild();
    assert.equal(changed, true);
    assert.equal(guild.active.length, 3);
    assert.ok(!guild.active.some(entry => entry.id === target.id));
    assert.equal(guild.expired, 1);
    assert.equal(guild.history.at(-1).outcome, "expired");
    assert.ok(guild.renown < 20);
});

test("workshop mastery grows from real batches and grants a deterministic bonus unit", () => {
    resetState();
    const site = firstForestSite();
    state.hasStarted = true;
    state.tick = 30;
    state.seasonIndex = 2;
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    const works = plainBuilding(TYPE.FOREST_WORKS, "works-mastery", site.x, site.y);
    state.entities = [works];
    ensureInventory(works);
    works.inventory.input.firewood = 60;
    const selected = setForestWorksMode(works, "charcoal");
    assert.ok(selected.ok, selected.reason);
    for (let index = 0; index < 16; index++) {
        const batch = runForestWorks(works, { force: true });
        assert.ok(batch.ok, "batch " + (index + 1) + ": " + batch.reason);
    }
    assert.equal(works.forestBatches, 16);
    assert.equal(forestMasteryFor(works).level, 2);
    assert.equal(forestMasteryFor(works).label, "Journeyman");
    assert.equal(works.inventory.output.charcoal, 33);
    assert.deepEqual(works.lastForestBatch.mastery.bonus, { good: "charcoal", amount: 1, level: 2, label: "Journeyman" });
});

test("clinic supply withdraws medicine from a warehouse and fills the public store", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 100;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.health = { medicineStock: 0 };
    const warehouse = warehouseFor("medicine", 10);
    state.entities = [warehouse];
    const result = supplyClinicMedicine(6);
    assert.ok(result.ok, result.reason);
    assert.equal(result.amount, 6);
    assert.equal(state.health.medicineStock, 6);
    assert.equal(industryWarehouseStock("medicine"), 4);
    assert.equal(warehouse.warehouse.stored.medicine, 4);
});
