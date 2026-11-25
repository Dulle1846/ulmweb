import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";
import { initializeCityForRealm, ensureInventory, setWarehouseProfile, getPhysicalStock } from "../../js/systems/logistics.js";
import { GOODS, GOOD_KEYS, REGIONAL_TIMBER_KEYS, WAREHOUSE_PROFILES, RECIPES } from "../../js/systems/city-config.js";
import {
    REGIONAL_GOODS, REGIONAL_TIMBERS, REGIONAL_TIMBER_BY_GOOD,
    signatureTimberForRegionalType, REGIONAL_FOREST_TYPE_BY_KEY,
} from "../../js/world/regional-forests.js";
import { ensureForestGathering, deliverForestGoods } from "../../js/systems/forest-gathering.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";
import { timberQuote, timberMarketRows, sellRegionalTimber } from "../../js/systems/regional-timber-market.js";

const WIDTH = 96;
const HEIGHT = 96;

function setupCity() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.tick = 0;
    state.year = 1;
    state.dayOfYear = 120;
    state.seasonIndex = 1;
    state.worldSeed = 20261106;
    state.worldW = WIDTH;
    state.worldH = HEIGHT;
    state.terrainResolution = 1;
    state.terrainPixW = WIDTH;
    state.terrainPixH = HEIGHT;
    state.heightMap = new Float32Array(WIDTH * HEIGHT).fill(0.62);
    state.moistureMap = new Float32Array(WIDTH * HEIGHT).fill(0.56);
    state.temperatureMap = new Float32Array(WIDTH * HEIGHT).fill(0.55);
    state.resources = { wood: 300, stone: 300, gold: 200, food: 300 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.statistics = { ...(state.statistics || {}), totalTrades: 0 };
    state.worldOptions = { landmass: 50, ruggedness: 45, forests: 60, water: 40, climate: "temperate" };
    initializeCityForRealm({ seedWarehouse: false });
    return generateResourceGeography(state.worldSeed);
}

function place(type, x, y) {
    const entity = spawnEntity(x, y, type);
    assert.ok(entity, `${type} should spawn at ${x},${y}`);
    ensureInventory(entity);
    return entity;
}

function employ(building, count, offset = 4) {
    for (let index = 0; index < count; index++) {
        const worker = spawnEntity(Math.round(building.x + index - (count - 1) / 2), Math.round(building.y + offset), TYPE.VILLAGER);
        assert.ok(worker, "fixture worker should spawn");
        worker.workplace = building;
        worker.anchor = { x: building.x, y: building.y };
        worker.jobRefreshTimer = 1_000_000;
    }
}

test("every regional timber is a real good with a label, a price and a sawmill batch", () => {
    assert.equal(REGIONAL_TIMBERS.length, 18);
    assert.equal(REGIONAL_TIMBER_KEYS.length, 18);
    for (const timber of REGIONAL_TIMBERS) {
        assert.ok(GOOD_KEYS.includes(timber.id), timber.id + " must be a physical good");
        assert.equal(GOODS[timber.id].label, REGIONAL_GOODS[timber.id].label);
        assert.equal(REGIONAL_TIMBER_BY_GOOD[timber.id].species, timber.species);
        assert.ok(timber.basePrice >= 2 && timber.basePrice <= 6, timber.id + " base price is bounded");
        assert.ok(timber.planks >= 1 && timber.planks <= 3, timber.id + " plank batch is bounded");
        assert.ok(WAREHOUSE_PROFILES.timber.filters.includes(timber.id), "the timber yard accepts " + timber.id);
        assert.equal(RECIPES[TYPE.SAWMILL].regionalTimber, true);
    }
    // The ten original goods keep their exact order. New keys are appended.
    assert.deepEqual(GOOD_KEYS.slice(0, 10), ["logs", "planks", "stoneBlocks", "cutStone", "grain", "flour", "bread", "water", "firewood", "ale"]);
    assert.ok(REGIONAL_TIMBER_KEYS.every((good, index) => GOOD_KEYS[10 + index] === good));
});

test("regional forest types name the signature timber their sawmill can produce", () => {
    const taiga = signatureTimberForRegionalType(REGIONAL_FOREST_TYPE_BY_KEY["boreal-taiga"]);
    assert.equal(taiga, null, "generic spruce and pine keep the ordinary log chain");
    const redwood = signatureTimberForRegionalType(REGIONAL_FOREST_TYPE_BY_KEY["coast-redwood"]);
    assert.equal(redwood?.id, "redwood-timber");
    const mangrove = signatureTimberForRegionalType(REGIONAL_FOREST_TYPE_BY_KEY.mangrove);
    assert.equal(mangrove?.id, "mangrove-timber");
    const teak = signatureTimberForRegionalType(REGIONAL_FOREST_TYPE_BY_KEY["teak-forest"]);
    assert.equal(teak?.id, "teak-timber");
});

test("a delivered forester haul keeps named timber as its own good and old timber as logs", () => {
    setupCity();
    let tile = null;
    for (let y = 2; y < HEIGHT - 2 && !tile; y++) {
        for (let x = 2; x < WIDTH - 2 && !tile; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestCapacity && node.forestStock) tile = { x, y, node };
        }
    }
    assert.ok(tile, "the fixture must generate a forest tile");
    const building = {
        id: "lumber-delivery", type: TYPE.LUMBER, x: tile.x, y: tile.y, dead: false,
        construction: { stage: 3, progress: 100 }, isBuilding: () => true,
    };
    state.entities = [building];
    ensureInventory(building);
    const ledger = ensureForestGathering();
    ledger.stock = { "redwood-timber": 3, timber: 2, firewood: 1 };
    const result = deliverForestGoods(building);
    assert.equal(result.ok, true);
    assert.equal(building.inventory.output["redwood-timber"], 3, "named timber keeps its identity");
    assert.equal(building.inventory.output.logs, 2, "generic timber still becomes logs");
    assert.equal(building.inventory.output.firewood, 1);
    assert.equal(result.delivered.timber, 3);
    assert.equal(result.delivered.logs, 2);
});

test("the sawmill saws logs exactly as before and a named timber into its own batch", () => {
    setupCity();
    const logMill = place(TYPE.SAWMILL, 20, 20);
    const timberMill = place(TYPE.SAWMILL, 30, 20);
    employ(logMill, 2);
    employ(timberMill, 2);
    logMill.inventory.input.logs = 2;
    timberMill.inventory.input["redwood-timber"] = 2;
    state.tick = 0;
    updateBuildingIncome();
    assert.equal(logMill.inventory.input.logs, 0);
    assert.equal(logMill.inventory.output.planks, 2);
    assert.equal(logMill.inventory.output.firewood, 1);
    assert.equal(timberMill.inventory.input["redwood-timber"], 0);
    assert.equal(timberMill.inventory.output.planks, 3, "dense redwood yields a third plank");
    assert.equal(timberMill.inventory.output.firewood, 1);
});

test("a sawmill without reachable logs orders the regional timber beside it", () => {
    setupCity();
    const mill = place(TYPE.SAWMILL, 20, 20);
    employ(mill, 2);
    const yard = place(TYPE.WAREHOUSE, 26, 20);
    assert.equal(setWarehouseProfile(yard, "timber").ok, true);
    yard.warehouse.stored["redwood-timber"] = 10;
    state.tick = 0;
    updateBuildingIncome();
    const supply = (state.city?.logistics?.jobs || []).find(job => job.kind === "supply"
        && job.to?.id === mill.id && job.good === "redwood-timber");
    assert.ok(supply, "the mill must order the stored regional timber instead of idling");
    assert.ok(supply.quantity > 0);
});

test("a sawmill prefers stored regional timber but never loses the log recipe", () => {
    setupCity();
    const mill = place(TYPE.SAWMILL, 24, 24);
    employ(mill, 2);
    mill.inventory.input.logs = 2;
    mill.inventory.input["treefern-timber"] = 2;
    state.tick = 0;
    updateBuildingIncome();
    assert.equal(mill.inventory.output.planks, 1, "tree fern is a light regional timber");
    assert.equal(mill.inventory.input.logs, 2, "logs are untouched while specialty timber is on the bench");
    // With the specialty timber gone the ordinary recipe still runs.
    state.tick = 6;
    updateBuildingIncome();
    assert.equal(mill.inventory.input.logs, 0);
    assert.equal(mill.inventory.output.planks, 3);
});

test("regional timber is stored by the timber yard and sells real stock at a seasonal quote", () => {
    setupCity();
    const yard = place(TYPE.WAREHOUSE, 40, 40);
    assert.equal(setWarehouseProfile(yard, "timber").ok, true);
    assert.ok(yard.warehouse.filters.includes("teak-timber"));
    yard.warehouse.stored["teak-timber"] = 7;
    const goldBefore = state.resources.gold;
    const quote = timberQuote("teak-timber");
    assert.ok(quote.price >= REGIONAL_TIMBER_BY_GOOD["teak-timber"].basePrice * 0.8);
    assert.ok(timberMarketRows().some(row => row.id === "teak-timber" && row.stock === 7));
    const sale = sellRegionalTimber("teak-timber", 5);
    assert.equal(sale.ok, true);
    assert.equal(sale.amount, 5);
    assert.ok(sale.gold >= 5);
    assert.equal(state.resources.gold, goldBefore + sale.gold);
    assert.equal(getPhysicalStock("teak-timber"), 2, "the sale removes warehouse stock");
    assert.equal(state.statistics.totalTrades, 1);
    const empty = sellRegionalTimber("teak-timber", 5);
    assert.equal(empty.ok, true);
    assert.equal(empty.amount, 2, "a short lot sells the remainder instead of stranding it");
    assert.equal(sellRegionalTimber("teak-timber", 1).ok, false);
});

test("legacy saves gain empty regional timber slots and old timber yards learn the new goods", () => {
    setupCity();
    const yard = place(TYPE.WAREHOUSE, 60, 30);
    // A pre-regional save: only the three shipped timber filters, no profile.
    yard.warehouse.filters = ["logs", "planks", "firewood"];
    delete yard.warehouse.profile;
    ensureInventory(yard);
    assert.equal(yard.warehouse.profile, "timber");
    assert.ok(yard.warehouse.filters.includes("redwood-timber"));
    const mill = place(TYPE.SAWMILL, 64, 34);
    for (const good of REGIONAL_TIMBER_KEYS) {
        assert.equal(mill.inventory.input[good], 0, good + " starts empty in an old inventory");
        assert.equal(mill.inventory.output[good], 0);
    }
    // A genuinely custom legacy filter list is not overwritten.
    const custom = place(TYPE.WAREHOUSE, 70, 30);
    custom.warehouse.filters = ["water", "bread"];
    delete custom.warehouse.profile;
    ensureInventory(custom);
    assert.equal(custom.warehouse.profile, "general");
    assert.deepEqual(custom.warehouse.filters, ["water", "bread"]);
    // A custom store that happens to carry only one core timber good is not
    // the old three-good timber profile and must not be widened.
    const narrow = place(TYPE.WAREHOUSE, 74, 30);
    narrow.warehouse.filters = ["logs"];
    delete narrow.warehouse.profile;
    ensureInventory(narrow);
    assert.equal(narrow.warehouse.profile, "general");
    assert.deepEqual(narrow.warehouse.filters, ["logs"]);
});
