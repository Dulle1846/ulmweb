import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initWorld } from "../../js/world/world.js";
import { GOODS, RECIPES } from "../../js/systems/city-config.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { REGIONAL_TIMBERS } from "../../js/world/regional-forests.js";
import { getForestHabitatAt } from "../../js/systems/resource-geography.js";
import {
    furnitureStyleFor,
    FOREST_INDUSTRY_REQUIREMENTS, FOREST_WORKS_MODES, INDUSTRY_GOODS,
    SAW_PROFILE_IDS, SAW_PROFILES, WOOD_PROPERTIES, WOOD_QUALITY_CLASSES,
    modeFitsStand, sawBatchFor, sawProfileAccepts, woodQualityFor,
} from "../../js/world/forest-industries.js";
import {
    INDUSTRY_STOCK_TARGETS, forestIndustrySummary, industryQuote,
    runForestWorks, sellForestIndustryGood, setForestWorksMode, setSawProfile,
} from "../../js/systems/forest-industries.js";
import { ensureInventory } from "../../js/systems/logistics.js";
import { planSawBatch } from "../../js/simulation/buildings.js";

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

test("all thirty forest-economy points have a real consumer", () => {
    assert.equal(FOREST_INDUSTRY_REQUIREMENTS.length, 30);
    assert.deepEqual(
        FOREST_INDUSTRY_REQUIREMENTS.map(entry => entry.point),
        Array.from({ length: 30 }, (_, index) => 151 + index),
    );
    for (const entry of FOREST_INDUSTRY_REQUIREMENTS) {
        assert.match(entry.id, /^1\.2\.23\.1\.(15[1-9]|1[6-7][0-9]|180)$/);
        for (const key of ["title", "system", "playerUse", "longTerm", "consumer"]) {
            assert.ok(entry[key] && entry[key].length > 20, entry.id + " needs a meaningful " + key);
        }
    }
});

test("every regional timber has physical properties and a scored quality class", () => {
    assert.equal(Object.keys(WOOD_PROPERTIES).length, REGIONAL_TIMBERS.length);
    for (const timber of REGIONAL_TIMBERS) {
        const properties = WOOD_PROPERTIES[timber.id];
        assert.ok(properties, timber.id + " needs working properties");
        for (const key of ["hardness", "elasticity", "rot", "density", "workability"]) {
            assert.ok(properties[key] >= 0 && properties[key] <= 1, timber.id + " has an invalid " + key);
        }
        for (const classId of Object.keys(WOOD_QUALITY_CLASSES)) {
            const quality = woodQualityFor(timber.id, classId);
            assert.ok(quality.score >= 0 && quality.score <= 1);
            assert.ok(["select", "first", "standard", "utility"].includes(quality.grade));
        }
    }
});

test("the saw profiles cut real, distinct batches and five profiles are offered", () => {
    assert.equal(SAW_PROFILE_IDS.length, 5);
    for (const timber of REGIONAL_TIMBERS) {
        const accepted = SAW_PROFILE_IDS.filter(id => sawProfileAccepts(id, timber.id));
        assert.ok(accepted.length >= 1, timber.id + " must fit at least one saw profile");
        for (const id of accepted) {
            const batch = sawBatchFor({ id: timber.id, planks: timber.planks, firewood: timber.firewoodYield }, id);
            assert.ok(batch && Object.keys(batch.output).length > 0, timber.id + " / " + id + " needs a batch");
            for (const good of Object.keys(batch.output)) assert.ok(GOODS[good], timber.id + " / " + id + " output is not a warehouse good: " + good);
        }
    }
    const hardwood = sawBatchFor({ id: "holm-timber", planks: 2, firewood: 1 }, "hardwood");
    assert.equal(hardwood.output.planks, 3);
    assert.equal(hardwood.output.firewood, undefined);
    const bow = sawBatchFor({ id: "mangrove-timber", planks: 1, firewood: 1 }, "bow");
    assert.equal(bow.output.bowStaves, 1);
    const ship = sawBatchFor({ id: "redwood-timber", planks: 3, firewood: 1 }, "ship");
    assert.equal(ship.output.shipTimber, 1);
    assert.equal(sawBatchFor({ id: "poplar-timber", planks: 1, firewood: 1 }, "hardwood"), null);
});

test("workshop modes only reference registered raw and warehouse goods", () => {
    assert.equal(Object.keys(FOREST_WORKS_MODES).length, 17);
    assert.equal(Object.keys(INDUSTRY_GOODS).length, 20);
    for (const [id, mode] of Object.entries(FOREST_WORKS_MODES)) {
        assert.equal(mode.id, id);
        assert.ok(mode.label && mode.description && mode.longTerm);
        for (const good of Object.keys(mode.standard || {})) assert.ok(GOODS[good], id + " has an unknown standard input " + good);
        for (const good of Object.keys(mode.raw || {})) assert.ok(FOREST_GOODS[good], id + " has an unknown raw input " + good);
        for (const good of Object.keys(mode.output || {})) assert.ok(GOODS[good], id + " has an unknown output " + good);
        for (const good of mode.requiresAny || []) assert.ok(FOREST_GOODS[good], id + " gates on unknown raw good " + good);
        if (mode.timber) assert.ok(WOOD_QUALITY_CLASSES[mode.timber.classId], id + " has an unknown timber class");
    }
    for (const good of Object.keys(INDUSTRY_GOODS)) {
        assert.ok(GOODS[good], good + " must be a warehouse good");
        assert.ok(INDUSTRY_STOCK_TARGETS[good] > 0, good + " needs a reserve ceiling");
    }
    assert.equal(RECIPES[TYPE.FOREST_WORKS].custom, true);
    assert.ok(RECIPES[TYPE.FOREST_WORKS].acceptedInputs.includes("firewood"));
});

test("furniture styles follow the regional wood and keep their premium", () => {
    const med = furnitureStyleFor("mediterranean-hardleaf");
    const tropical = furnitureStyleFor("tropical");
    const fallback = furnitureStyleFor({ key: "unknown-wood" });
    assert.notEqual(med.id, tropical.id);
    assert.ok(med.premium > 0 && tropical.premium > 0);
    assert.ok(fallback.label);
});

test("a Forest Works consumes real firewood and produces real charcoal", () => {
    resetState();
    const site = firstForestSite();
    state.hasStarted = true;
    state.tick = 30;
    state.seasonIndex = 2;
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    const works = plainBuilding(TYPE.FOREST_WORKS, "works-1", site.x, site.y);
    state.entities = [works];
    ensureInventory(works);
    works.inventory.input.firewood = 9;
    const selection = setForestWorksMode(works, "charcoal");
    assert.ok(selection.ok, selection.reason);
    const result = runForestWorks(works, { force: true });
    assert.ok(result.ok, result.reason);
    assert.equal(result.output.charcoal, 2);
    assert.equal(works.inventory.input.firewood, 6);
    assert.equal(works.inventory.output.charcoal, 2);
    assert.ok(works.lastForestBatch?.label);
    assert.ok(forestIndustrySummary().batches >= 1);
});

test("a specialized sawmill refuses softwood and cuts furniture grade from hardwood", () => {
    resetState();
    state.hasStarted = true;
    const mill = plainBuilding(TYPE.SAWMILL, "mill-1", 20, 20);
    ensureInventory(mill);
    mill.inventory.input["holm-timber"] = 4;
    mill.inventory.input["poplar-timber"] = 4;
    const set = setSawProfile(mill, "hardwood");
    assert.ok(set.ok, set.reason);
    mill.sawProfile = "hardwood";
    const batch = planSawBatch(mill);
    assert.equal(batch.good, "holm-timber");
    assert.equal(batch.output.planks, 3);
    assert.equal(batch.quality.classId, "furniture");
    mill.inventory.input["holm-timber"] = 0;
    assert.equal(planSawBatch(mill), null, "the hardwood bench must not fall back to poplar");
});

test("industry sales remove real warehouse stock and pay the quote", () => {
    resetState();
    state.hasStarted = true;
    state.seasonIndex = 2;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    const warehouse = plainBuilding(TYPE.WAREHOUSE, "warehouse-1", 20, 20);
    warehouse.warehouse = {
        filters: ["charcoal"], stored: { charcoal: 7 }, reservedIn: {}, reservedOut: {},
        capacity: 200, used: 7, profile: "general",
    };
    state.entities = [warehouse];
    ensureInventory(warehouse);
    const quote = industryQuote("charcoal");
    assert.ok(quote > 0);
    const sale = sellForestIndustryGood("charcoal", 5);
    assert.ok(sale.ok, sale.reason);
    assert.equal(sale.amount, 5);
    assert.equal(warehouse.warehouse.stored.charcoal, 2);
    assert.ok(state.resources.gold >= 5);
});
