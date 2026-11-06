import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { Entity, TYPE } from "../../js/core/types.js";
import { defaultLayout } from "../../js/presentation/building-layout.js";
import { BUILDING_SIZE } from "../../js/core/config.js";
import {
    applyRoomBonuses,
    getRoomBonusSnapshot,
    invalidateRoomBonusCache,
} from "../../js/systems/rooms.js";

const DAYS_PER_LEDGER = 20;
const LEDGERS_PER_YEAR = 18;
const STARTING_TYPES = [
    TYPE.KEEP,
    TYPE.HOUSE, TYPE.HOUSE, TYPE.HOUSE,
    TYPE.FARM, TYPE.FARM,
    TYPE.LUMBER, TYPE.QUARRY, TYPE.GOLDMINE, TYPE.TEMPLE,
];
const NO_FURNITURE = { bed: 0, table: 0, chair: 0, shelf: 0, hearth: 0, rug: 0, statue: 0, candle: 0 };

function createStartingRealm(furnished) {
    resetState();
    invalidateRoomBonusCache();
    state.entities = STARTING_TYPES.map((type, index) => {
        const entity = new Entity(20 + index, 20, type);
        const size = BUILDING_SIZE[type] || { w: 1, h: 1 };
        entity.id = "balance-" + index;
        entity.layout = defaultLayout(type, size.w, size.h);
        if (!furnished) entity.interior = { ...NO_FURNITURE };
        return entity;
    });
    state.hasStarted = true;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 72;
    state.politics.legitimacy = 65;
    return getRoomBonusSnapshot();
}

function simulateYears(furnished = true, years = 5) {
    const snapshot = createStartingRealm(furnished);
    const yearly = [];
    let firstMoraleCapDay = null;
    let firstLegitimacyCapDay = null;
    for (let ledger = 1; ledger <= years * LEDGERS_PER_YEAR; ledger++) {
        const bonuses = applyRoomBonuses();
        if (firstMoraleCapDay === null && state.morale >= 100 - 1e-9) {
            firstMoraleCapDay = ledger * DAYS_PER_LEDGER;
        }
        if (firstLegitimacyCapDay === null && state.politics.legitimacy >= 100 - 1e-9) {
            firstLegitimacyCapDay = ledger * DAYS_PER_LEDGER;
        }
        if (ledger % LEDGERS_PER_YEAR === 0) {
            yearly.push({
                year: ledger / LEDGERS_PER_YEAR,
                gold: state.resources.gold,
                morale: state.morale,
                legitimacy: state.politics.legitimacy,
                perLedger: { ...bonuses.totals },
            });
        }
    }
    return {
        snapshot,
        yearly,
        totalGold: state.resources.gold,
        finalMorale: state.morale,
        finalLegitimacy: state.politics.legitimacy,
        firstMoraleCapDay,
        firstLegitimacyCapDay,
    };
}

test("five-year room simulation measures the furnished and unfurnished realm", () => {
    const furnished = simulateYears(true);
    const bare = simulateYears(false);

    assert.equal(furnished.snapshot.rooms, 24);
    assert.equal(furnished.snapshot.buildings, 10);
    assert.ok(furnished.snapshot.rawTotals.gold > bare.snapshot.rawTotals.gold);
    assert.ok(furnished.snapshot.rawTotals.legitimacy > bare.snapshot.rawTotals.legitimacy);
    assert.ok(furnished.snapshot.rawTotals.morale > bare.snapshot.rawTotals.morale);
    assert.ok(furnished.totalGold > 0);
    assert.ok(Number.isFinite(furnished.finalMorale));
    assert.ok(Number.isFinite(furnished.finalLegitimacy));

    // Room bonuses should supplement the realm, not saturate both social caps
    // within the first two simulated years.
    assert.ok(furnished.firstMoraleCapDay === null || furnished.firstMoraleCapDay >= 720);
    assert.ok(furnished.firstLegitimacyCapDay === null || furnished.firstLegitimacyCapDay >= 960);

    console.log("ROOM BALANCE · 5 YEARS · FURNISHED", JSON.stringify({
        raw: furnished.snapshot.rawTotals,
        capped: furnished.snapshot.capped,
        totals: furnished.snapshot.totals,
        firstMoraleCapDay: furnished.firstMoraleCapDay,
        firstLegitimacyCapDay: furnished.firstLegitimacyCapDay,
        totalGold: furnished.totalGold,
        yearly: furnished.yearly,
    }));
    console.log("ROOM BALANCE · 5 YEARS · UNFURNISHED", JSON.stringify({
        raw: bare.snapshot.rawTotals,
        totals: bare.snapshot.totals,
        firstMoraleCapDay: bare.firstMoraleCapDay,
        firstLegitimacyCapDay: bare.firstLegitimacyCapDay,
        totalGold: bare.totalGold,
    }));
});
