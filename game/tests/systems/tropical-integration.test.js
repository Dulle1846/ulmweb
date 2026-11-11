import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    generateResourceGeography, getForestMovementFactorAt, getResourceNodeAt,
} from "../../js/systems/resource-geography.js";
import {
    deliverForestGoods, ensureForestGathering, forestDeliveryChannel, spoilForestGoods,
} from "../../js/systems/forest-gathering.js";
import { addMedicineStock, tropicalExposure } from "../../js/systems/health.js";
import { forestRegrowthFactor, forestGoodsFor } from "../../js/world/forest-ecology.js";
import {
    TROPICAL_GOODS, tropicalProfileFor,
} from "../../js/world/tropical-ecology.js";

function setup(seed = 20261111) {
    resetState();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 78, water: 48, climate: "tropical" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.86);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.86);
    state.seasonIndex = 1;
    state.weather = "rain";
    generateResourceGeography(seed);
}

function tropicalTile() {
    for (let y = 2; y < state.worldH - 2; y++) {
        for (let x = 2; x < state.worldW - 2; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestStand?.tropical && node.forestStock > 0) return { x, y, node };
        }
    }
    return null;
}

test("every tropical product has a real delivery channel", () => {
    for (const id of Object.keys(TROPICAL_GOODS)) {
        assert.ok(forestDeliveryChannel(id), id + " must not strand in the forest ledger");
    }
    assert.equal(forestDeliveryChannel("bananas"), "food");
    assert.equal(forestDeliveryChannel("river-fish"), "food");
    assert.equal(forestDeliveryChannel("quinine-bark"), "medicine");
    assert.equal(forestDeliveryChannel("natural-rubber"), "gold");
    assert.equal(forestDeliveryChannel("mahogany-timber"), "wood");
    assert.equal(forestDeliveryChannel("feathers"), "gold");
});

test("tropical food, medicine and materials reach the real settlement stores", () => {
    setup();
    const tile = tropicalTile();
    assert.ok(tile, "the tropical test world must contain a forest tile");
    ensureForestGathering().stock = {
        "quinine-bark": 3, bananas: 4, "natural-rubber": 2, "mahogany-timber": 2,
    };
    const building = {
        id: "tropical-lumber", type: TYPE.LUMBER, x: tile.x, y: tile.y, dead: false,
        construction: { stage: 3, progress: 100 }, isBuilding: () => true,
    };
    state.entities = [building];
    const foodBefore = state.resources.food;
    const goldBefore = state.resources.gold;
    const result = deliverForestGoods(building);
    assert.equal(result.ok, true);
    assert.ok(result.delivered.medicine > 0, "quinine must enter the public medicine store");
    assert.ok(result.delivered.food > 0, "tropical fruit must feed the royal stores");
    assert.ok(result.delivered.gold > 0, "rubber must become a market good");
    assert.ok(result.delivered.logs > 0, "tropical timber must reach the lumber yard");
    assert.ok(state.resources.food > foodBefore);
    assert.ok(state.resources.gold > goldBefore);
    assert.ok(state.health.medicineStock > 0);
    assert.equal(state.forestGathering.stock["quinine-bark"], 0);
    assert.equal(state.forestGathering.stock.bananas, 0);
});

test("tropical food spoils in storage while timber and medicine keep", () => {
    setup();
    ensureForestGathering().stock = { bananas: 100, timber: 100, "quinine-bark": 100 };
    const lost = spoilForestGoods(10);
    assert.ok(lost > 0);
    assert.ok(state.forestGathering.stock.bananas < 100);
    assert.equal(state.forestGathering.stock.timber, 100);
    assert.equal(state.forestGathering.stock["quinine-bark"], 100);
});

test("land use produces crops, plantation goods and a readable succession stage", () => {
    const plantation = tropicalProfileFor({
        x: 7, y: 9, seed: 20261111, formationId: "tropical-plantation",
        species: ["cacao", "rubber", "palm"], stockRatio: 0.45,
    });
    assert.equal(plantation.landUse.plantation, true);
    assert.ok(plantation.landUse.plantationGoods.includes("cacao-pods"));
    assert.ok(plantation.landUse.plantationGoods.includes("natural-rubber"));
    assert.ok(["cleared", "regrowing", "closed"].includes(plantation.landUse.successionStage));
    const profile = tropicalProfileFor({
        x: 7, y: 9, seed: 20261111, formationId: "tropical-secondary",
        species: ["balsa", "bamboo"], stockRatio: 0.5,
    });
    assert.ok(profile.landUse.regrowth > 0.5);
    assert.ok(Array.isArray(profile.landUse.crops));
    const stand = tropicalTile()?.node?.forestStand;
    assert.ok(stand, "a tropical stand is required");
    const goods = forestGoodsFor(stand, 150, "tropical");
    assert.ok(goods.length > 0);
});

test("tropical undergrowth slows real movement and regrowth remains bounded", () => {
    setup();
    const tile = tropicalTile();
    assert.ok(tile);
    const factor = getForestMovementFactorAt(tile.x + 0.5, tile.y + 0.5);
    assert.ok(factor >= 0.55 && factor <= 1);
    assert.ok(factor < 1, "dense tropical undergrowth must cost movement");
    const base = { ground: { compaction: 0 } };
    const cleared = forestRegrowthFactor({ ...base, tropical: { clearance: 1, regrowth: 0 } });
    const regrowing = forestRegrowthFactor({ ...base, tropical: { clearance: 0.1, regrowth: 0.94 } });
    assert.ok(cleared < 1);
    assert.ok(regrowing > cleared);
});

test("medicine stock is capped by the public health contract", () => {
    setup();
    const accepted = addMedicineStock(1000);
    assert.equal(accepted, 60);
    assert.equal(state.health.medicineStock, 60);
    assert.equal(addMedicineStock(10), 0);
});


test("tropical exposure starts the existing health outbreak instead of a parallel system", () => {
    setup();
    state.tick = 10;
    state.resources.food = 100;
    state.entities = [{
        id: "resident-1", type: TYPE.VILLAGER, x: 2, y: 2, dead: false,
        householdId: "test-household",
    }];
    let result = null;
    for (let attempt = 0; attempt < 50 && !state.health?.outbreakActive; attempt++) {
        result = tropicalExposure({ disease: 1, diseaseLabel: "forest fever" });
    }
    assert.equal(state.health.outbreakActive, true);
    assert.ok(state.health.cases >= 1);
    assert.ok(state.entities[0].illnessUntilTick > state.tick);
    assert.equal(state.health.disease, "forest fever");
    assert.equal(result.outbreak, true);
});
