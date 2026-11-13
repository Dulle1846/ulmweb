import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { createMarketState } from "../../js/systems/market.js";
import { updateMarket } from "../../js/systems/market.js";
import { updateEconomy } from "../../js/systems/economy.js";
import { ensureSettlementState, updateServices, updateSettlementNeeds } from "../../js/systems/settlement.js";
import {
    BASE_FOOD_PRICE, REALM_PHASES, createRealmCycleState, getRealmCycleSnapshot,
    normalizeRealmCycleState, resolveRealmCyclePetition, updateRealmCycle
} from "../../js/systems/realm-cycle.js";

function prepareScarcityRealm({ food = 0, gold = 100, partnerFood = 0, morale = 72 } = {}) {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = 20;
    state.year = 1;
    state.dayOfYear = 20;
    state.seasonIndex = 0;
    state.weather = "clear";
    state.morale = morale;
    state.resources = { wood: 100, stone: 100, gold, food };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.market = createMarketState();
    for (const partner of state.market.partners) {
        partner.stock = { wood: 60, stone: 60, food: partnerFood };
        partner.treasury = 500;
    }
    const homes = [];
    for (let i = 0; i < 4; i++) homes.push(spawnEntity(20 + i * 4, 20, TYPE.HOUSE));
    const farms = [];
    for (let i = 0; i < 4; i++) farms.push(spawnEntity(60 + i * 4, 60, TYPE.FARM));
    for (let i = 0; i < 12; i++) {
        const home = homes[i % homes.length];
        const villager = spawnEntity(30 + (i % 6) * 2, 30 + Math.floor(i / 6) * 2, TYPE.VILLAGER);
        villager.home = { x: home.x, y: home.y };
        villager.anchor = { x: home.x, y: home.y };
        villager.householdId = "house:" + home.x + ":" + home.y;
        villager.workplace = farms[i % farms.length];
        villager.jobRefreshTimer = 0;
    }
    ensureSettlementState();
    state.city.enabled = true;
    updateServices();
    updateSettlementNeeds();
    return state;
}

function advance(tick, { market = true, economy = true } = {}) {
    state.tick = tick;
    state.dayOfYear = tick % 400;
    state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
    updateServices();
    updateSettlementNeeds();
    if (economy && tick % 20 === 0) updateEconomy();
    if (market) updateMarket();
    return updateRealmCycle();
}

function advanceUntilPetition({ maxTick = 600, action = null } = {}) {
    for (let tick = state.tick + 20; tick <= maxTick; tick += 20) {
        advance(tick);
        const snapshot = getRealmCycleSnapshot();
        if (snapshot.petition) {
            if (action) resolveRealmCyclePetition(action);
            return snapshot;
        }
    }
    return getRealmCycleSnapshot();
}

test("scarcity reaches the ledger, raises the grain market and produces a civic petition through real system paths", () => {
    prepareScarcityRealm();
    const ledger = updateEconomy();
    assert.ok(ledger.foodShortage > 0, "the empty granary must create a real settled food shortage");

    state.tick = 100;
    state.dayOfYear = 100;
    updateMarket();
    const crisisPrice = state.market.prices.food;
    assert.ok(crisisPrice > BASE_FOOD_PRICE, "market food must become dearer than the base price");

    const first = updateRealmCycle();
    assert.ok(first.scarcity > 0, "the cycle must read the granary shortage");
    assert.ok(first.marketPressure >= 0, "the cycle must read the market pressure");
    assert.ok(first.unrest > 0, "civic unrest must begin to move");

    const petitionSnapshot = advanceUntilPetition({ maxTick: 340 });
    assert.ok(petitionSnapshot.petition, "sustained scarcity and market pressure must produce a real petition");
    assert.ok(petitionSnapshot.scarcity > first.scarcity, "scarcity must accumulate through the loop");
    assert.ok(petitionSnapshot.unrest > first.unrest, "unrest must rise after the market response");
    assert.ok(petitionSnapshot.drivers.foodPrice >= BASE_FOOD_PRICE, "the displayed price is the real market price");
    assert.ok(state.morale < 72, "the cycle must reach the existing morale system");
    assert.ok(["commons", "guilds"].includes(petitionSnapshot.petition.faction));

    const beforeMarketStock = state.market.partners[0].stock.food;
    const beforeTrend = state.market.priceTrend.food;
    const beforeGuilds = state.politics.factions.guilds;
    const resolved = resolveRealmCyclePetition("compact");
    assert.equal(resolved.ok, true, resolved.reason);
    assert.equal(state.realmCycle.petition, null, "the answered petition must leave the active inbox");
    assert.equal(state.market.partners[0].stock.food, beforeMarketStock + 24, "the compact must add real market stock");
    assert.ok(state.market.priceTrend.food < beforeTrend, "the compact must ease the real price trend");
    assert.ok(state.politics.factions.guilds > beforeGuilds, "the compact must change the existing faction state");
    assert.ok(Number.isFinite(state.morale) && state.morale >= 0 && state.morale <= 100);
});

test("a player concession beats an ignored petition and both worlds remain deterministic", () => {
    function run(action) {
        prepareScarcityRealm({ gold: 100 });
        updateEconomy();
        state.tick = 100;
        updateMarket();
        for (let tick = 120; tick <= 600; tick += 20) {
            advance(tick);
            const snapshot = getRealmCycleSnapshot();
            if (snapshot.petition && action) {
                const result = resolveRealmCyclePetition(action);
                assert.equal(result.ok, true, result.reason);
                break;
            }
        }
        const petitionTick = state.tick;
        for (let tick = petitionTick + 20; tick <= petitionTick + 200; tick += 20) advance(tick);
        const snapshot = getRealmCycleSnapshot();
        return {
            snapshot,
            marketPressure: snapshot.marketPressure,
            unrest: snapshot.unrest,
            price: snapshot.drivers.foodPrice,
            guilds: state.politics.factions.guilds,
            phase: snapshot.phase,
            history: snapshot.history
        };
    }

    const control = run(null);
    const concession = run("compact");
    assert.ok(control.unrest > 0.4, "the ignored petition must leave audible unrest");
    assert.ok(concession.unrest < control.unrest, "answering the petition must reduce unrest against the control");
    assert.ok(concession.marketPressure <= control.marketPressure, "market stock and the eased trend must reduce pressure");
    assert.ok(concession.price <= control.price + 0.5, "the compact must keep the grain price within a normal market band");
    assert.ok(concession.history.every(row => REALM_PHASES.includes(row.phase)));

    const repeated = run("compact");
    assert.deepEqual(repeated.snapshot, concession.snapshot, "the same seed and decisions must replay exactly");
});

test("the cycle is damped, bounded and recovers when stores and markets are restored", () => {
    resetState();
    state.tick = 0;
    state.year = 1;
    state.morale = 10;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.market = createMarketState();
    for (const partner of state.market.partners) partner.stock.food = 0;
    state.economy = {
        ...state.economy,
        debt: 1200,
        lastLedger: { foodDemand: 20, foodShortage: 20, population: 40, unemployed: 15 },
        foodCrisis: { severity: 1, consecutiveShortages: 9, events: [] }
    };
    ensureSettlementState();
    state.city.needs.summary = { satisfaction: 0.15, food: 0, water: 0, safety: 0, social: 0 };
    state.realmCycle = createRealmCycleState();

    for (let tick = 20; tick <= 2400; tick += 20) {
        state.tick = tick;
        updateRealmCycle();
    }
    const crisis = getRealmCycleSnapshot();
    for (const key of ["scarcity", "marketPressure", "unrest", "prosperity"]) {
        assert.ok(Number.isFinite(crisis[key]), key + " must remain finite");
        assert.ok(crisis[key] >= 0 && crisis[key] <= 1, key + " must remain bounded");
    }
    assert.ok(REALM_PHASES.includes(crisis.phase));
    assert.ok(crisis.unrest <= 1 && crisis.unrest >= 0, "the feedback must not leave its bounded range");
    assert.ok(crisis.displacement >= 0);

    // Restore the real drivers: a full granary, calm market, satisfied
    // households and healthy morale. The same equations must recover, not stay
    // latched in crisis.
    state.resources.food = 1000;
    state.economy.debt = 0;
    state.economy.lastLedger = { foodDemand: 6, foodShortage: 0, population: 40, unemployed: 0 };
    state.economy.foodCrisis.severity = 0;
    state.market.prices.food = 1;
    for (const partner of state.market.partners) partner.stock.food = 90;
    state.city.needs.summary = { satisfaction: 0.82, food: 1, water: 1, safety: 1, social: 1 };
    state.morale = 82;
    state.realmCycle.petition = null;
    state.realmCycle.lastPetitionTick = state.tick;
    const recoveryEnd = state.tick + 1200;
    for (let tick = state.tick + 20; tick <= recoveryEnd; tick += 20) {
        state.tick = tick;
        updateRealmCycle();
    }
    const recovered = getRealmCycleSnapshot();
    assert.ok(recovered.scarcity < crisis.scarcity, "restored stores must lower scarcity");
    assert.ok(recovered.unrest < crisis.unrest, "restored confidence must lower unrest");
    assert.ok(recovered.prosperity > crisis.prosperity, "the recovered realm must regain prosperity");
    assert.ok(recovered.prosperity > 0.7 && recovered.scarcity < 0.18 && recovered.unrest < 0.2,
        "a restored realm must satisfy the prosperity phase conditions");
    assert.equal(recovered.phase, "prosperity", "the upside of the cycle must be reachable");
    assert.ok(Number.isFinite(recovered.marketPressure) && recovered.marketPressure <= 1);
    assert.ok(["stable", "prosperity"].includes(recovered.phase), "the cycle must be able to leave crisis");
});

test("civic strain reaches settlement needs and a sustained crisis removes residents through real paths", () => {
    prepareScarcityRealm({ food: 0 });
    state.realmCycle = createRealmCycleState();
    state.city.needs.lowChecks = 0;
    state.realmCycle.unrest = 0;
    updateServices();
    const calm = updateSettlementNeeds().satisfaction;
    state.realmCycle.unrest = 0.9;
    const strained = updateSettlementNeeds().satisfaction;
    assert.ok(strained < calm, "the same houses and services must feel worse under civic unrest");

    const extra = spawnEntity(35, 45, TYPE.VILLAGER);
    assert.ok(extra, "the test realm must have an unhoused resident to observe migration");
    const beforePopulation = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    state.tick = 20;
    updateEconomy();
    for (let tick = 40; tick <= 240; tick += 20) advance(tick);
    const snapshot = getRealmCycleSnapshot();
    const afterPopulation = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    assert.ok(state.city.needs.lastMigrationYear >= 1, "the existing settlement migration gate must fire");
    assert.ok(snapshot.displacement >= 1, "the cycle must record displacement from the real settlement path");
    assert.ok(afterPopulation < beforePopulation, "a sustained crisis must reduce the living population");
    assert.ok(Number.isFinite(snapshot.unrest) && snapshot.unrest >= 0 && snapshot.unrest <= 1);
});

test("normalization repairs malformed cycle state without NaN", () => {
    resetState();
    state.realmCycle = {
        scarcity: "not-a-number",
        marketPressure: Infinity,
        unrest: -4,
        prosperity: 3,
        petition: { faction: "guilds", createdTick: 20, expiresTick: 40 },
        history: [{ tick: 20, phase: "unknown", scarcity: 4, marketPressure: -1, unrest: "x" }]
    };
    const normalized = normalizeRealmCycleState(state.realmCycle);
    assert.equal(normalized.scarcity, 0);
    assert.equal(normalized.marketPressure, 0);
    assert.equal(normalized.unrest, 0);
    assert.equal(normalized.prosperity, 1);
    assert.equal(normalized.petition.faction, "guilds");
    assert.equal(normalized.history[0].phase, "stable");
    assert.equal(normalized.history[0].scarcity, 1);
});

test("the realm cycle stays inside the tick budget on a populated realm", () => {
    prepareScarcityRealm({ gold: 0, food: 0 });
    updateEconomy();
    const cycles = 1000;
    const started = performance.now();
    for (let index = 1; index <= cycles; index++) {
        state.tick = index * 20;
        updateRealmCycle();
    }
    const elapsed = performance.now() - started;
    const perCycle = elapsed / cycles;
    const perTick = perCycle / 20;
    console.log("Realm cycle benchmark: " + cycles + " checks in " + elapsed.toFixed(2) + "ms · " +
        (perCycle * 1000).toFixed(1) + "µs per 20-day check · " + (perTick * 1000).toFixed(1) + "µs per tick");
    assert.ok(Number.isFinite(perCycle), "benchmark must produce a finite timing");
    assert.ok(perCycle < 0.5, "realm cycle check exceeded its 0.5ms budget: " + perCycle.toFixed(3) + "ms");
    assert.ok(perTick < 0.05, "realm cycle exceeded its per-tick budget: " + perTick.toFixed(3) + "ms");
});
