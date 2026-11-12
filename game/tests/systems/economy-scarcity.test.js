import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { calculateDailyLedger, updateEconomy } from "../../js/systems/economy.js";
import { setTaxRate } from "../../js/systems/government.js";
import { getEconomyCycleSnapshot, getFoodStorageCapacity, getHarvestYieldFactor, normalizeEconomyCycleState, restoreEconomyCycleState } from "../../js/systems/economy-cycle.js";
import { activateEdict } from "../../js/systems/edicts.js";
import { beginConstruction, getBuildingCost } from "../../js/systems/construction.js";
import { executeTrade, getTradePartners } from "../../js/systems/market.js";
import { addressFactionDemand, createCourtState, getCourtSnapshot, updateCourt } from "../../js/systems/court.js";
import { createResearchState, startResearch } from "../../js/systems/research.js";
import { holdFestival } from "../../js/systems/faith.js";
import { migrateSaveSnapshot } from "../../js/core/save-migrations.js";
import { SAVE_SCHEMA_VERSION, normalizeSaveSnapshot, validateSaveSnapshot } from "../../js/core/save-validation.js";

function realm({ food, gold, taxRate = 10, warehouses = 0 }) {
    resetState();
    state.hasStarted = true;
    state.tick = 20;
    state.year = 1;
    state.dayOfYear = 20;
    state.seasonIndex = 0;
    state.weather = "clear";
    state.morale = 70;
    state.resources = { wood: 100, stone: 100, gold, food };
    state.government.taxRate = taxRate;
    const farms = [];
    for (let i = 0; i < 6; i++) farms.push(spawnEntity(60 + i * 3, 60, TYPE.FARM));
    for (let i = 0; i < 12; i++) {
        const house = spawnEntity(20 + (i % 6) * 3, 20 + Math.floor(i / 6) * 3, TYPE.HOUSE);
        const villager = spawnEntity(30 + (i % 6) * 2, 30 + Math.floor(i / 6) * 2, TYPE.VILLAGER);
        villager.home = { x: house.x, y: house.y };
        villager.anchor = { x: house.x, y: house.y };
        villager.householdId = "house:" + house.id;
        villager.workplace = farms[i % farms.length];
        villager.jobRefreshTimer = 0;
    }
    for (let i = 0; i < warehouses; i++) {
        const store = spawnEntity(8 + i * 2, 8, TYPE.WAREHOUSE);
        store.construction = { stage: 3, progress: 100 };
    }
    return state;
}

function settle() {
    const result = updateEconomy();
    return { ledger: result, snapshot: getEconomyCycleSnapshot() };
}

test("household demand, storage and spoilage form one measurable food loop", () => {
    const ledger = calculateDailyLedger({
        population: 10, employed: 10, buildings: 4, foodAvailable: 100, goldAvailable: 100,
        households: 2, livestock: 1
    });
    assert.equal(ledger.foodDemand, 3 + 2 * 0.045 + 0.32);
    assert.equal(ledger.foodShortage, 0);
    assert.ok(getFoodStorageCapacity([]) >= 360);
});

test("a fed realm and a starving realm diverge deterministically", () => {
    const fed = realm({ food: 100, gold: 100 });
    const fedRun = settle();
    const fedLedger = fedRun.ledger;
    assert.equal(fedLedger.foodShortage, 0);
    assert.equal(fedRun.snapshot.crisis.severity, 0);

    const hungry = realm({ food: 0, gold: 0 });
    // Enough completed buildings create genuine upkeep arrears when the tax
    // base is too small; this is the treasury failure the old zero-floor
    // economy could never represent.
    for (let i = 0; i < 70; i++) spawnEntity(3 + i, 3, TYPE.WALL);
    const hungryRun = settle();
    const hungryLedger = hungryRun.ledger;
    assert.ok(hungryLedger.foodShortage > 0);
    assert.ok(hungryLedger.foodShortage > fedLedger.foodShortage);
    assert.ok(hungryRun.snapshot.crisis.severity > fedRun.snapshot.crisis.severity);
    assert.ok(hungryRun.snapshot.debt > fedRun.snapshot.debt);
    assert.ok(hungryLedger.foodReserve < fedLedger.foodReserve);

    // The same starting state produces the same curve. This is the save/replay
    // guarantee, not a random event comparison.
    const repeat = realm({ food: 0, gold: 0 });
    for (let i = 0; i < 70; i++) spawnEntity(3 + i, 3, TYPE.WALL);
    const repeated = settle();
    assert.deepEqual(repeated.ledger, hungryLedger);
    assert.deepEqual(repeated.snapshot.crisis, hungryRun.snapshot.crisis);
});

test("a tax decision changes the treasury curve and the debt it leaves behind", () => {
    const low = realm({ food: 0, gold: 0, taxRate: 5 });
    for (let i = 0; i < 70; i++) spawnEntity(3 + i, 3, TYPE.WALL);
    const lowRun = settle();

    const high = realm({ food: 0, gold: 0, taxRate: 5 });
    for (let i = 0; i < 70; i++) spawnEntity(3 + i, 3, TYPE.WALL);
    const change = setTaxRate(30);
    assert.equal(change.ok, true);
    const highRun = settle();

    assert.ok(highRun.ledger.taxesCollected > lowRun.ledger.taxesCollected);
    assert.ok(highRun.snapshot.debt < lowRun.snapshot.debt);
    assert.ok(highRun.ledger.netGold > lowRun.ledger.netGold);
});

test("storage capacity changes spoilage while the harvest reads season, morale and health", () => {
    realm({ food: 5000, gold: 100 });
    const open = getEconomyCycleSnapshot();
    realm({ food: 5000, gold: 100, warehouses: 24 });
    const withStores = getEconomyCycleSnapshot();
    assert.ok(withStores.storageCapacity > 360);
    assert.ok(withStores.spoilage <= open.spoilage);

    state.morale = 70;
    state.weather = "clear";
    state.seasonIndex = 2;
    const autumn = getHarvestYieldFactor();
    state.seasonIndex = 3;
    const winter = getHarvestYieldFactor();
    assert.ok(autumn > winter);
    state.morale = 10;
    assert.ok(getHarvestYieldFactor() < autumn);
    assert.ok(getEconomyCycleSnapshot().storageCapacity > 360);
});

test("schema-9 economy fields normalize without replacing the live state object", () => {
    resetState();
    state.economy = { debt: -4, foodCrisis: { severity: 3, consecutiveShortages: "2" }, foodAccounting: null };
    const before = state.economy;
    const normalized = normalizeEconomyCycleState();
    assert.equal(normalized, before);
    assert.equal(normalized.debt, 0);
    assert.equal(normalized.foodCrisis.severity, 1);
    assert.equal(normalized.foodCrisis.consecutiveShortages, 2);
    assert.equal(normalized.foodAccounting.inflow, 0);
});

// ── Player levers ───────────────────────────────────────────────
// Every scenario starts from the same deterministic realm, applies one real
// player action, and settles several ledgers. `proveScenario` runs the whole
// scenario twice so a curve cannot pass on leaked module or state values.

const round = value => Math.round((Number(value) || 0) * 1e6) / 1e6;

function ledgerPoint(ledger) {
    return {
        tick: state.tick,
        foodDemand: round(ledger.foodDemand),
        foodReserve: round(ledger.foodReserve),
        foodBalance: round(ledger.foodBalance),
        foodSpoiled: round(ledger.foodSpoiled),
        foodShortage: round(ledger.foodShortage),
        taxesCollected: round(ledger.taxesCollected),
        netGold: round(ledger.netGold),
        debt: round(ledger.debt),
        gold: round(state.resources.gold),
        morale: round(state.morale),
        employed: ledger.employed,
        storageCapacity: ledger.storageCapacity
    };
}

function runLedgers(count = 3) {
    const curve = [];
    for (let i = 0; i < count; i++) {
        state.tick += 20;
        const ledger = updateEconomy();
        assert.ok(ledger, "a multiple of the settlement interval must settle a ledger");
        curve.push(ledgerPoint(ledger));
    }
    return curve;
}

function proveScenario(build, count = 3) {
    build();
    const first = runLedgers(count);
    build();
    const repeated = runLedgers(count);
    assert.deepEqual(repeated, first, "the same starting realm and lever must produce the same curve");
    return first;
}

const last = curve => curve[curve.length - 1];

function buildSixWarehouses() {
    for (let i = 0; i < 6; i++) {
        const warehouse = spawnEntity(5 + i * 2, 5, TYPE.WAREHOUSE);
        const started = beginConstruction(warehouse, getBuildingCost(TYPE.WAREHOUSE), { source: "build" });
        assert.equal(started.ok, true, started.reason);
        // The economic acceptance starts when the site becomes operational;
        // completing the stage here keeps this test about the ledger effect
        // while construction itself is covered by the construction suite.
        warehouse.construction.stage = 3;
        warehouse.construction.progress = 100;
    }
}

test("a tax rise changes the measured tax and debt curve across several settlements", () => {
    const low = proveScenario(() => {
        realm({ food: 0, gold: 0, taxRate: 5 });
        for (let i = 0; i < 70; i++) spawnEntity(3 + i, 3, TYPE.WALL);
    });
    const high = proveScenario(() => {
        realm({ food: 0, gold: 0, taxRate: 5 });
        for (let i = 0; i < 70; i++) spawnEntity(3 + i, 3, TYPE.WALL);
        assert.equal(setTaxRate(30).ok, true);
    });

    assert.ok(high.every((point, index) => point.taxesCollected > low[index].taxesCollected));
    assert.ok(high.every((point, index) => point.netGold > low[index].netGold));
    assert.ok(last(high).debt < last(low).debt, "higher taxes must reduce the debt curve");
});

test("an edict changes household demand and morale over the settlement curve", () => {
    const ordinary = proveScenario(() => realm({ food: 160, gold: 160 }));
    const harvestLaw = proveScenario(() => {
        realm({ food: 160, gold: 160 });
        assert.equal(activateEdict("harvest-law").ok, true);
    });

    assert.ok(harvestLaw.every((point, index) => point.foodDemand < ordinary[index].foodDemand));
    assert.ok(harvestLaw.every((point, index) => point.foodReserve > ordinary[index].foodReserve));
    assert.ok(last(harvestLaw).morale > last(ordinary).morale);
});

test("a completed warehouse changes storage capacity and the spoilage curve", () => {
    const openStores = proveScenario(() => realm({ food: 5000, gold: 5000 }));
    const builtStores = proveScenario(() => {
        realm({ food: 5000, gold: 5000 });
        buildSixWarehouses();
    });

    assert.ok(builtStores.every((point, index) => point.storageCapacity > openStores[index].storageCapacity));
    assert.ok(builtStores.every((point, index) => point.foodSpoiled < openStores[index].foodSpoiled));
    assert.ok(last(builtStores).foodReserve > last(openStores).foodReserve);
});

test("work assignment changes employment, taxes and the treasury curve", () => {
    const idle = proveScenario(() => {
        realm({ food: 160, gold: 0 });
        for (const entity of state.entities) if (entity.type === TYPE.VILLAGER) entity.workplace = null;
    });
    const working = proveScenario(() => realm({ food: 160, gold: 0 }));

    assert.equal(idle[0].employed, 0);
    assert.equal(working[0].employed, 12);
    assert.ok(working.every((point, index) => point.taxesCollected > idle[index].taxesCollected));
    assert.ok(working.every((point, index) => point.netGold > idle[index].netGold));
    assert.ok(last(working).gold > last(idle).gold);
    assert.ok(last(working).debt < last(idle).debt);
});

test("market purchase and distress sale both move the food and gold curves", () => {
    const untouched = proveScenario(() => realm({ food: 200, gold: 200 }));
    const bought = proveScenario(() => {
        realm({ food: 200, gold: 200 });
        const partner = getTradePartners().find(entry => entry.stock.food >= 10);
        assert.ok(partner);
        const trade = executeTrade(partner.id, "food", "buy", 10);
        assert.equal(trade.ok, true, trade.reason);
    });
    const sold = proveScenario(() => {
        realm({ food: 200, gold: 200 });
        const partner = getTradePartners().find(entry => entry.treasury >= 30);
        assert.ok(partner);
        const trade = executeTrade(partner.id, "food", "sell", 10);
        assert.equal(trade.ok, true, trade.reason);
    });

    assert.ok(bought.every((point, index) => point.foodReserve > untouched[index].foodReserve));
    assert.ok(bought[0].gold < untouched[0].gold, "a purchase must spend treasury gold");
    assert.ok(sold.every((point, index) => point.foodReserve < untouched[index].foodReserve));
    assert.ok(sold[0].gold > untouched[0].gold, "a distress sale must raise treasury gold");
});

test("granting the court petition changes the treasury curve", () => {
    const ignored = proveScenario(() => realm({ food: 200, gold: 200 }));
    const granted = proveScenario(() => {
        realm({ food: 200, gold: 200 });
        state.court = createCourtState();
        updateCourt();
        const demand = getCourtSnapshot().demand;
        assert.ok(demand, "the annual court pass must produce a faction petition");
        const result = addressFactionDemand(demand.faction);
        assert.equal(result.ok, true, result.reason);
        assert.equal(state.court.demand, null);
    });

    assert.ok(granted[0].gold < ignored[0].gold, "granting a petition must spend treasury gold");
    assert.ok(granted.every((point, index) => point.gold < ignored[index].gold));
});

test("finishing crop rotation lowers food demand on the ledger curve", () => {
    const before = proveScenario(() => realm({ food: 200, gold: 200 }));
    const researched = proveScenario(() => {
        realm({ food: 200, gold: 200 });
        state.research = createResearchState();
        state.research.reserve = 240;
        const result = startResearch("crop-rotation");
        assert.equal(result.ok, true, result.reason);
        assert.equal(state.research.completed["crop-rotation"], true);
    });

    assert.ok(researched.every((point, index) => point.foodDemand < before[index].foodDemand));
    assert.ok(researched.every((point, index) => point.foodReserve > before[index].foodReserve));
});

test("a held festival changes the food and morale curves", () => {
    const ordinary = proveScenario(() => realm({ food: 200, gold: 200 }));
    const festival = proveScenario(() => {
        realm({ food: 200, gold: 200 });
        const temple = spawnEntity(50, 50, TYPE.TEMPLE);
        temple.construction = { stage: 3, progress: 100 };
        const result = holdFestival("harvest");
        assert.equal(result.ok, true, result.reason);
    });

    assert.ok(festival[0].foodReserve < ordinary[0].foodReserve, "the festival must consume food");
    assert.ok(festival.every((point, index) => point.foodReserve < ordinary[index].foodReserve));
    assert.ok(last(festival).morale > last(ordinary).morale);
});

// ── Legacy save and cadence ────────────────────────────────────

function legacySchemaEightSnapshot() {
    return {
        saveSchemaVersion: 8,
        worldSeed: 20261111,
        tick: 20,
        year: 1,
        dayOfYear: 20,
        kingdomName: "Legacy Hold",
        resources: { wood: 500, stone: 500, gold: 200, food: 600 },
        incomeThisTick: { wood: 0, stone: 0, gold: 0, food: 0 },
        entities: [],
        statistics: { totalTrades: 0 },
        government: { form: "feudal", taxRate: 10 },
        economy: {
            daysElapsed: 400,
            taxesCollected: 321.5,
            foodConsumed: 980.25,
            lastLedger: { foodDemand: 3.8, foodReserve: 620, debt: 0 },
            history: [{ tick: 20, year: 1, food: 600, debt: 0 }]
        }
    };
}

function loadLegacyEconomy(snapshot) {
    realm({ food: snapshot.resources.food, gold: snapshot.resources.gold });
    state.tick = snapshot.tick;
    state.year = snapshot.year;
    state.dayOfYear = snapshot.dayOfYear;
    state.resources = { ...snapshot.resources };
    state.government.taxRate = snapshot.government.taxRate;
    return restoreEconomyCycleState(snapshot);
}

test("a schema-8 save migrates without inventing resources and continues identically", () => {
    const legacy = legacySchemaEightSnapshot();
    const originalResources = JSON.stringify(legacy.resources);
    const firstSnapshot = normalizeSaveSnapshot(migrateSaveSnapshot(JSON.parse(JSON.stringify(legacy))));
    const secondSnapshot = normalizeSaveSnapshot(migrateSaveSnapshot(JSON.parse(JSON.stringify(legacy))));

    assert.equal(firstSnapshot.saveSchemaVersion, SAVE_SCHEMA_VERSION);
    assert.equal(firstSnapshot.economy.foodCrisis, undefined, "migration must not synthesize a crisis");
    assert.equal(firstSnapshot.economy.debt, undefined, "migration must not synthesize debt");
    assert.equal(JSON.stringify(firstSnapshot.resources), originalResources, "migration must not change resources");
    assert.deepEqual(firstSnapshot, secondSnapshot);
    validateSaveSnapshot(firstSnapshot);

    loadLegacyEconomy(firstSnapshot);
    assert.equal(state.economy.debt, 0, "a save without debt must load with zero debt");
    assert.equal(state.economy.foodAccounting.inflow, 0);
    assert.equal(state.economy.foodCrisis.severity, 0);
    assert.deepEqual(state.resources, firstSnapshot.resources, "loading must preserve the saved resource balances");
    const first = runLedgers(10);

    loadLegacyEconomy(secondSnapshot);
    const second = runLedgers(10);
    assert.deepEqual(second, first, "two loads of the same schema-8 save must continue tick-for-tick identically");
    assert.equal(first.length, 10);
    assert.deepEqual(first.map(point => point.tick), [40, 60, 80, 100, 120, 140, 160, 180, 200, 220]);
});

test("the economy settles on a fixed cadence instead of every frame", t => {
    realm({ food: 200, gold: 200 });
    state.tick = 0;
    let settlements = 0;
    const start = performance.now();
    for (let frame = 0; frame < 200; frame++) {
        state.tick++;
        if (updateEconomy()) settlements++;
    }
    const elapsed = performance.now() - start;
    assert.equal(settlements, 10, "200 frames may settle only the ten 20-day ledgers");

    state.tick = 21;
    let skipped = 0;
    for (let frame = 0; frame < 2000; frame++) {
        if (updateEconomy() === null) skipped++;
    }
    assert.equal(skipped, 2000, "off-cadence frames must return before touching households or storage");
    assert.ok(elapsed < 1000, "the measured ledger cost must stay bounded");
    t.diagnostic("200 frames / 10 settlements: " + elapsed.toFixed(2) + " ms");
});
