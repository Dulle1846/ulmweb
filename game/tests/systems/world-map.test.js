import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { createDiplomacyState } from "../../js/systems/diplomacy.js";
import { createMarketState } from "../../js/systems/market.js";
import { getSettlementSeats, initializeSettlementOwners, SETTLEMENT_STORE_LIMIT } from "../../js/systems/settlement-owners.js";
import {
    FRONTIER_INCIDENT_PRESSURE, FRONTIER_WATCH_COST, REGION_CLAIM_COST, TRADE_ROUTE_COST, TRADE_ROUTE_LIMIT,
    closeTradeRoute, createWorldMapState, getWorldMapSnapshot, normalizeWorldMapSnapshot,
    openTradeRoute, pressRegionClaim, setFrontierWatch, updateWorldMap, validateWorldMapSnapshot
} from "../../js/systems/world-map.js";
import { WORLD_REGION_CATALOG } from "../../js/world/world-regions.js";
import { migrateSaveSnapshot } from "../../js/core/save-migrations.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";

function setup() {
    resetState();
    state.hasStarted = true;
    state.isPaused = true;
    state.year = 4;
    state.tick = 1200;
    state.worldW = 160;
    state.worldH = 160;
    state.resources = { wood: 300, stone: 120, gold: 200, food: 120 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.entities = [
        { id: "e-keep", x: 80, y: 80, type: TYPE.KEEP, dead: false, isBuilding: () => true },
        { id: "e-hall", x: 104, y: 68, type: TYPE.TOWN_HALL, dead: false, isBuilding: () => true }
    ];
    state.diplomacy = createDiplomacyState();
    state.market = createMarketState();
    state.worldMap = createWorldMapState();
    initializeSettlementOwners();
    return getSettlementSeats();
}

function realm(id) {
    return state.diplomacy.realms.find(row => row.id === id);
}

test("a route needs a real seat, a known region, goods, flow and a free slot", () => {
    setup();
    assert.equal(openTradeRoute("missing-seat", "northmere", "wood", "import").reason, "no-royal-seat");
    assert.equal(openTradeRoute("e-keep", "nowhere", "wood", "import").reason, "unknown-region");
    assert.equal(openTradeRoute("e-keep", "northmere", "clay", "import").reason, "unknown-resource");
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "barter").reason, "unknown-direction");
    state.resources.gold = 0;
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "import").reason, "not-enough-gold");
    state.resources.gold = 200;
    state.resources.wood = 0;
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "import").reason, "not-enough-wood");
    state.resources.wood = 300;
    const opened = openTradeRoute("e-keep", "northmere", "wood", "import");
    assert.equal(opened.ok, true);
    assert.equal(state.resources.gold, 200 - TRADE_ROUTE_COST.gold);
    assert.equal(state.resources.wood, 300 - TRADE_ROUTE_COST.wood);
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "import").reason, "route-already-open");
    const pairs = [["stone", "import"], ["food", "import"], ["wood", "export"], ["stone", "export"], ["food", "export"]];
    for (const [resource, direction] of pairs) {
        assert.equal(openTradeRoute("e-hall", "ironvale", resource, direction).ok, true);
    }
    assert.equal(getWorldMapSnapshot().routes.length, TRADE_ROUTE_LIMIT);
    assert.equal(openTradeRoute("e-hall", "goldcoast", "wood", "import").reason, "route-limit-reached");
    realm("goldcoast").treaty = "war";
    closeTradeRoute(getWorldMapSnapshot().routes[0].id);
    assert.equal(openTradeRoute("e-keep", "goldcoast", "wood", "import").reason, "war-closes-the-route");
});

test("an import caravan moves partner stock into the settlement depot and pays the market price", () => {
    setup();
    const seats = getSettlementSeats();
    const seat = seats.find(row => row.buildingId === "e-keep");
    seat.stores.wood = 0;
    const partner = state.market.partners.find(row => row.id === "northmere");
    assert.equal(partner.stock.wood, 90);
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "import").ok, true);
    const goldBefore = state.resources.gold;
    const line = realm("northmere");
    const relationBefore = line.relation;
    const snapshot = updateWorldMap();
    const settledSeat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    assert.equal(settledSeat.stores.wood, 6, "the caravan unloads six wood into the real settlement depot");
    assert.equal(partner.stock.wood, 84, "the partner stock is the same stock manual trade reads");
    assert.ok(state.resources.gold < goldBefore, "the crown paid for the goods");
    assert.ok(partner.treasury > 420, "the partner treasury received the payment");
    assert.ok(line.tradeVolume >= 6);
    assert.equal(line.lastTradeYear, 4);
    assert.ok(line.relation > relationBefore, "the trade uses the existing diplomatic trade ledger");
    assert.ok(line.history.some(entry => entry.kind === "trade"), "the realm record names the caravan");
    assert.equal(snapshot.routes[0].delivered, 6);
    assert.match(snapshot.routes[0].lastResult, /Unloaded 6 wood at/);
    const again = updateWorldMap();
    assert.equal(again.routes[0].delivered, 6, "a second call in the same year must not settle twice");
});

test("an export caravan draws the depot, pays the crown and leaves the settlement a handling fee", () => {
    setup();
    const seat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    seat.stores.wood = 10;
    const partner = state.market.partners.find(row => row.id === "northmere");
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "export").ok, true);
    const goldBefore = state.resources.gold;
    updateWorldMap();
    const settledSeat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    assert.equal(settledSeat.stores.wood, 4);
    assert.equal(partner.stock.wood, 96);
    // The founding grant left this seat with 0.5 gold; the caravan adds its 1 gold fee.
    assert.equal(settledSeat.treasury.gold, 1.5, "the depot keeps its handling fee");
    assert.equal(state.resources.gold, goldBefore + 7, "the crown receives the payout minus the fee");
    assert.equal(partner.treasury, 412);
    assert.equal(getWorldMapSnapshot().routes[0].earned, 8);
});

test("a full settlement depot stalls the import instead of wasting paid goods", () => {
    setup();
    const seat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    seat.stores.wood = SETTLEMENT_STORE_LIMIT;
    const partner = state.market.partners.find(row => row.id === "northmere");
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "import").ok, true);
    const goldAfterCharter = state.resources.gold;
    const stockBefore = partner.stock.wood;
    const snapshot = updateWorldMap();
    assert.equal(snapshot.routes[0].status, "depot-full");
    assert.match(snapshot.routes[0].lastResult, /depot at .+ is full/);
    assert.equal(state.resources.gold, goldAfterCharter, "a stalled caravan must not pay for goods it cannot store");
    assert.equal(partner.stock.wood, stockBefore, "the partner stock must stay untouched");
});

test("war closes a standing route without moving any goods", () => {
    setup();
    const seat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    seat.stores.wood = 10;
    const partner = state.market.partners.find(row => row.id === "northmere");
    assert.equal(openTradeRoute("e-keep", "northmere", "wood", "export").ok, true);
    realm("northmere").treaty = "war";
    const before = { gold: state.resources.gold, stock: partner.stock.wood, stores: seat.stores.wood };
    const snapshot = updateWorldMap();
    assert.equal(snapshot.routes[0].status, "closed");
    assert.equal(seat.stores.wood, before.stores);
    assert.equal(partner.stock.wood, before.stock);
    assert.ok(state.resources.gold >= before.gold);
    assert.match(snapshot.routes[0].lastResult, /War has closed this route/);
});

test("a frontier watch costs gold, lowers pressure and survives normalization", () => {
    setup();
    const line = realm("redpass");
    line.relation = 12;
    line.trust = 12;
    line.treaty = "none";
    const before = getWorldMapSnapshot().realms.find(row => row.id === "redpass");
    assert.ok(before.pressure >= FRONTIER_INCIDENT_PRESSURE, "a hostile frontier starts pressed");
    const goldBefore = state.resources.gold;
    const raised = setFrontierWatch("redpass", 3);
    assert.equal(raised.ok, true);
    assert.equal(raised.paid, 3 * FRONTIER_WATCH_COST);
    assert.equal(state.resources.gold, goldBefore - 3 * FRONTIER_WATCH_COST);
    const after = getWorldMapSnapshot().realms.find(row => row.id === "redpass");
    assert.ok(after.pressure <= before.pressure - 20, "three watch levels must materially ease the border");
    assert.equal(after.watch, 3);
    assert.equal(setFrontierWatch("redpass", 3).reason, "watch-already-set");
    const saved = normalizeWorldMapSnapshot(JSON.parse(JSON.stringify(state.worldMap)));
    assert.equal(saved.frontiers.find(row => row.realmId === "redpass").watch, 3);
    state.worldMap = saved;
    const restored = getWorldMapSnapshot();
    assert.equal(restored.realms.find(row => row.id === "redpass").watch, 3, "the watch survives a normalized reload");
});

test("a contested frontier raids a real settlement, raises the border levy and is bounded", () => {
    setup();
    const seat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    seat.stores.wood = 5;
    seat.stores.stone = 5;
    seat.treasury.gold = 5;
    const line = realm("redpass");
    line.treaty = "war";
    line.relation = 20;
    line.trust = 0;
    const relationBefore = line.relation;
    const snapshot = updateWorldMap();
    const frontier = snapshot.realms.find(row => row.id === "redpass");
    assert.ok(frontier.incidents >= 1, "certain pressure above 75 must cross the border");
    assert.equal(line.lastIncidentYear, 4, "the existing diplomacy incident reading sees the raid");
    assert.ok(line.relation < relationBefore);
    const raidedSeat = getSettlementSeats().find(row => row.buildingId === "e-keep");
    assert.ok(raidedSeat.stores.wood < 5 && raidedSeat.stores.wood >= 4, "the raid takes at most one wood");
    assert.ok(raidedSeat.stores.stone < 5 && raidedSeat.stores.stone >= 4, "the raid takes at most one stone");
    assert.ok(raidedSeat.treasury.gold < 5);
    assert.ok(snapshot.history.some(entry => entry.kind === "frontier-incident"));
    assert.ok(frontier.pressure < 95, "the raid spends part of the frontier's strength");
});

test("the world map normalizes legacy and malformed data without inventing routes", () => {
    setup();
    const quiet = normalizeWorldMapSnapshot(null);
    assert.equal(quiet.version, 2);
    assert.equal(quiet.routes.length, 0);
    assert.equal(quiet.frontiers.length, 4);
    assert.equal(quiet.regions.length, 10);
    assert.equal(quiet.regions.filter(region => region.ownerId === "crown").length, 2);
    assert.equal(quiet.frontiers.every(row => row.watch === 0 && row.incidents === 0), true);
    const malformed = normalizeWorldMapSnapshot({
        version: 1,
        routes: [
            { seatId: "e-keep", realmId: "northmere", resource: "wood", direction: "import" },
            { seatId: "e-keep", realmId: "northmere", resource: "wood", direction: "import" },
            { seatId: "", realmId: "northmere", resource: "wood", direction: "import" },
            { seatId: "e-keep", realmId: "unknown", resource: "wood", direction: "import" },
            { seatId: "e-keep", realmId: "northmere", resource: "clay", direction: "import" },
            { seatId: "e-keep", realmId: "northmere", resource: "wood", direction: "barter" }
        ],
        frontiers: [{ realmId: "northmere", pressure: 999, watch: 99, incidents: -4 }],
        history: [{ year: 3, summary: "A bounded record" }]
    });
    assert.equal(malformed.routes.length, 1);
    assert.equal(malformed.routes[0].id, "route:e-keep:northmere:wood:import");
    assert.equal(malformed.frontiers.find(row => row.realmId === "northmere").pressure, 100);
    assert.equal(malformed.frontiers.find(row => row.realmId === "northmere").watch, 3);
    assert.equal(malformed.frontiers.find(row => row.realmId === "northmere").incidents, 0);
    assert.throws(() => validateWorldMapSnapshot({
        version: 1,
        routes: [{ seatId: "e-keep", realmId: "northmere", resource: "clay", direction: "import" }]
    }), /incomplete trade route/);
});

test("the world map is a saved ten-province, five-crown map", () => {
    setup();
    const snapshot = getWorldMapSnapshot();
    assert.equal(snapshot.version, 2);
    assert.equal(snapshot.regions.length, 10);
    assert.equal(snapshot.regions.length, WORLD_REGION_CATALOG.length);
    assert.equal(snapshot.totals.crownProvinces, 2);
    assert.equal(snapshot.kingdoms.length, 5);
    assert.equal(snapshot.kingdoms.filter(kingdom => kingdom.isCrown).length, 1);
    assert.equal(snapshot.kingdoms.reduce((sum, kingdom) => sum + kingdom.regionCount, 0), 10);
    const northmere = snapshot.regions.find(region => region.id === "northmere-pines");
    assert.equal(northmere.ownerId, "northmere");
    assert.equal(northmere.ownerName, "Northmere Guild");
    assert.ok(northmere.yield >= 1);
    assert.equal(northmere.resource, "wood");
    const crown = snapshot.regions.find(region => region.id === "crown-heartland");
    assert.equal(crown.ownerKind, "crown");
    assert.equal(crown.canClaim, false);
    assert.equal(crown.claimReason, "crown-province");
    assert.equal(snapshot.regions.every(region => region.name && Number.isFinite(region.control) && region.control >= 0), true);
    assert.equal(snapshot.totals.annualYield, crown.yield + snapshot.regions.find(region => region.id === "crown-march").yield);
});

test("a v1 world map migrates its routes and gets the ten provinces without losing the old watch", () => {
    const legacy = normalizeWorldMapSnapshot({
        version: 1,
        routes: [{ seatId: "e-keep", realmId: "northmere", resource: "wood", direction: "import" }],
        frontiers: [{ realmId: "northmere", watch: 2, incidents: 1 }]
    });
    assert.equal(legacy.version, 2);
    assert.equal(legacy.routes.length, 1);
    assert.equal(legacy.frontiers.find(row => row.realmId === "northmere").watch, 2);
    assert.equal(legacy.frontiers.find(row => row.realmId === "northmere").incidents, 1);
    assert.equal(legacy.regions.length, 10);
    validateWorldMapSnapshot(legacy);
    const saved = normalizeWorldMapSnapshot({
        ...legacy,
        regions: legacy.regions.map(region => region.id === "redpass-steppe"
            ? { ...region, ownerId: "crown", control: 44, changes: 2, lastChangeYear: 7 }
            : region),
        lastRegionClaimYear: 7
    });
    assert.equal(saved.regions.find(region => region.id === "redpass-steppe").ownerId, "crown");
    assert.equal(saved.regions.find(region => region.id === "redpass-steppe").control, 44);
    assert.equal(saved.regions.find(region => region.id === "redpass-steppe").changes, 2);
    assert.equal(saved.lastRegionClaimYear, 7);
    assert.equal(saved.routes[0].realmId, "northmere");
});

test("a province claim spends the treasury, changes hands and locks further claims for the year", () => {
    let result = null;
    for (let year = 4; year < 20 && !result?.success; year++) {
        setup();
        state.year = year;
        const target = state.worldMap.regions.find(region => region.id === "redpass-steppe");
        target.control = 0;
        target.garrison = 0;
        target.loyalty = 0;
        const line = realm("redpass");
        line.relation = 20;
        line.trust = 20;
        const before = { gold: state.resources.gold, food: state.resources.food };
        result = pressRegionClaim("redpass-steppe");
        assert.equal(result.ok, true);
        assert.equal(state.resources.gold, before.gold - REGION_CLAIM_COST.gold);
        assert.equal(state.resources.food, before.food - REGION_CLAIM_COST.food);
        assert.equal(state.worldMap.lastRegionClaimYear, year);
        assert.equal(state.worldMap.totals.provinceClaims, 1);
        const again = pressRegionClaim("redpass-gorge");
        assert.equal(again.ok, false);
        assert.equal(again.reason, "claim-already-pressed");
    }
    assert.equal(result?.success, true, "a low-control border province is claimable within the bounded years");
    assert.equal(state.worldMap.regions.find(region => region.id === "redpass-steppe").ownerId, "crown");
    assert.ok(realm("redpass").relation < 20, "the former owner remembers the claim");
    assert.ok(state.worldMap.history.some(entry => entry.kind === "province-claimed"));
});

test("alliances and trade pacts protect a province from a crown claim", () => {
    setup();
    const line = realm("redpass");
    line.relation = 20;
    line.trust = 20;
    line.treaty = "alliance";
    assert.equal(pressRegionClaim("redpass-steppe").reason, "alliance-holds-the-border");
    line.treaty = "trade";
    assert.equal(pressRegionClaim("redpass-steppe").reason, "trade-pact-holds-the-border");
    line.treaty = "none";
    line.relation = 60;
    assert.equal(pressRegionClaim("redpass-steppe").reason, "relation-too-high");
    assert.equal(pressRegionClaim("ironvale-crags").reason, "no-crown-border");
});

test("a hostile border erodes control and can change province ownership in the annual pass", () => {
    setup();
    const line = realm("northmere");
    line.treaty = "war";
    const target = state.worldMap.regions.find(region => region.id === "northmere-pines");
    target.control = 6;
    target.garrison = 0;
    let flipped = false;
    for (let year = 4; year < 30 && !flipped; year++) {
        state.year = year;
        const snapshot = updateWorldMap();
        const current = snapshot.regions.find(region => region.id === "northmere-pines");
        assert.ok(current.control >= 0 && current.control <= 100);
        flipped = current.ownerId === "crown";
    }
    assert.equal(flipped, true, "a hostile, low-control border province changes hands in the bounded annual pass");
    assert.ok(state.worldMap.totals.regionChanges >= 1);
    assert.ok(state.worldMap.history.some(entry => entry.kind === "province-changed"));
    assert.equal(state.worldMap.regions.find(region => region.id === "northmere-pines").ownerId, "crown");
});

test("the annual world pass pays crown province yields and keeps ownership bounded", () => {
    setup();
    const before = state.worldMap.totals.regionYield;
    const snapshot = updateWorldMap();
    assert.ok(state.worldMap.totals.regionYield > before, "crown provinces paid their annual yield");
    assert.equal(snapshot.regions.length, 10);
    assert.equal(snapshot.regions.filter(region => region.ownerId === "crown").length >= 2, true);
    assert.equal(snapshot.lastUpdateYear, 4);
    assert.equal(snapshot.regions.every(region => region.control >= 0 && region.control <= 100), true);
});

test("schema 15 migrates a legacy realm to a quiet world map and keeps it savable", () => {
    const legacy = migrateSaveSnapshot({ saveSchemaVersion: 14 });
    assert.equal(SAVE_SCHEMA_VERSION, 15);
    assert.equal(legacy.saveSchemaVersion, 15);
    assert.equal(legacy.worldMap, null);
    const quiet = normalizeWorldMapSnapshot(legacy.worldMap);
    assert.equal(quiet.routes.length, 0);
    assert.equal(quiet.lastUpdateYear, 0);
    validateWorldMapSnapshot(quiet);
});
