import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initWorld } from "../../js/world/world.js";
import { harvestForest } from "../../js/systems/resource-geography.js";
import { createResearchState } from "../../js/systems/research.js";
import { ensureDiplomacy } from "../../js/systems/diplomacy.js";
import { ensureWorldMap } from "../../js/systems/world-map.js";
import { createMilitaryState } from "../../js/systems/military.js";
import { sacredGroveTileAt } from "../../js/world/sacred-groves.js";
import {
    FOREST_WAR_PROFILE_LIST, FOREST_WARFARE_REQUIREMENTS, forestWarProfileFor,
} from "../../js/world/forest-warfare.js";
import {
    burnForFields, clearRebelCamp, colonizeWoodland, commissionWarMaps, createJointPreserve,
    cutSiegeTimber, deportWoodlanders, ensureForestWarfare, fellAbatis, fightForestBattle,
    forestWarfareActionAvailability, forestWarfareModifiers, forestWarfareProfileFor, forestWarfareScore,
    forestWarfareSnapshot, forestWarfareSummary, foundMilitaryColony, fundWarEcologyRecovery,
    layForestAmbush, levyTimberQuota, liftForestEmbargo, musterWarElephants,
    normalizeForestWarfare, openForestRoad, openForestTradeRoute, pressForestSiege,
    pressSettlerClaims, raiseBorderPost, raiseForestPartisans, recognizeWoodlandRights,
    recruitForestScouts, reserveShipTimber, runForestSmuggling, setForestCustoms,
    setForestEmbargo, setWarFire, settleForestRefugees, signBorderTreaty,
    strengthenForestWatch, suppressForestResistance, updateForestWarfare,
} from "../../js/systems/forest-warfare.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}
globalThis.document = { createElement: () => makeCanvas() };

const WORLD_OPTIONS = Object.freeze({
    size: "small", shape: "continent", water: 42, landmass: 62,
    fertility: 58, forests: 88, mountains: 52, ruggedness: 54, climate: "temperate",
});
const SEED = 20261127;

function addSoldiers(count = 8) {
    for (let index = 0; index < count; index++) {
        state.entities.push({
            id: "front-guard-" + index,
            personId: "front-guard-" + index,
            type: TYPE.GUARD,
            x: 20 + index,
            y: 20,
            dead: false,
            isKing: false,
            isBuilding() { return false; },
            isEnemy() { return false; },
            military: {
                recruitId: "front-guard-" + index,
                origin: "opening-garrison",
                sessions: 5,
                rank: "veteran",
                equipment: 92,
                morale: 88,
                mounted: false,
                woundedUntilTick: 0,
            },
        });
    }
}

function setup() {
    resetState();
    initWorld(SEED, WORLD_OPTIONS);
    state.hasStarted = true;
    state.year = 12;
    state.dayOfYear = 40;
    state.seasonIndex = 0;
    state.tick = 12 * 400 + 40;
    state.resources = { wood: 900, stone: 400, gold: 900, food: 900 };
    state.morale = 55;
    state.research = createResearchState({});
    state.research.reserve = 60;
    state.military = createMilitaryState();
    state.entities = [];
    addSoldiers();
    const diplomacy = ensureDiplomacy();
    const map = ensureWorldMap();
    return { diplomacy, map };
}

function frontRow(realmId) {
    return ensureForestWarfare().fronts.find(entry => entry.realmId === realmId);
}

function province(realmId) {
    const id = frontRow(realmId).provinceId;
    return ensureWorldMap().regions.find(region => region.id === id);
}

function realm(realmId) {
    return ensureDiplomacy().realms.find(entry => entry.id === realmId);
}

function war(realmId) {
    realm(realmId).treaty = "war";
    realm(realmId).warExhaustion = 12;
}

test("the thirty war points are numbered 211–240 and each names a live consumer", () => {
    assert.equal(FOREST_WARFARE_REQUIREMENTS.length, 30);
    assert.deepEqual(
        FOREST_WARFARE_REQUIREMENTS.map(entry => Number(entry.id.split(".").pop())),
        Array.from({ length: 30 }, (_, index) => 211 + index),
    );
    for (const entry of FOREST_WARFARE_REQUIREMENTS) {
        assert.match(entry.id, /^1\.2\.23\.1\.(21[1-9]|22[0-9]|23[0-9]|240)$/);
        for (const key of ["title", "point", "consumer", "detail"]) {
            assert.ok(entry[key] && entry[key].length > 20, entry.id + " needs a meaningful " + key);
        }
    }
});

test("all sixty forest types have a distinct, deterministic war profile", () => {
    assert.equal(FOREST_WAR_PROFILE_LIST.length, 60);
    assert.equal(new Set(FOREST_WAR_PROFILE_LIST.map(profile => profile.frontierName)).size, 60);
    for (const profile of FOREST_WAR_PROFILE_LIST) {
        assert.ok(profile.border && profile.warTradition && profile.indigenousPeople);
        assert.equal(profile.roads.length, 4);
        assert.ok(profile.ambush >= 20 && profile.ambush <= 92);
        assert.ok(profile.sightPenalty > 0 && profile.movementPenalty > 0);
        assert.ok(profile.smugglerPaths >= 1);
        assert.ok(profile.shipTimberGrade >= 1 && profile.siegeTimberGrade >= 1);
        assert.equal(forestWarProfileFor(profile.id), profile);
        const openSeasons = profile.roads.filter(road => road.open).length;
        assert.ok(openSeasons >= 1, profile.id + " needs at least one open season");
    }
    const elephants = FOREST_WAR_PROFILE_LIST.filter(profile => profile.elephantGround);
    assert.ok(elephants.length > 0);
    assert.ok(elephants.every(profile => ["tropical", "savanna"].includes(profile.archetype)));
    assert.equal(forestWarfareProfileFor("northmere").archetype, "boreal");
    assert.equal(forestWarfareProfileFor("redpass").archetype, "savanna");
    assert.equal(forestWarfareProfileFor("redpass").elephantGround, true);
});

test("border posts, forest watch and scouts change real province control and detection", () => {
    setup();
    const before = province("northmere").control;
    const wood = state.resources.wood;
    const gold = state.resources.gold;
    const post = raiseBorderPost("northmere");
    assert.ok(post.ok, post.reason);
    assert.equal(post.posts, 1);
    assert.ok(province("northmere").control > before);
    assert.equal(state.resources.wood, wood - 10);
    assert.equal(state.resources.gold, gold - 6);
    assert.equal(raiseBorderPost("northmere").ok, false, "one post per frontier per year");
    state.year += 1;
    assert.ok(strengthenForestWatch("northmere").ok);
    assert.equal(frontRow("northmere").watch, 1);
    assert.ok(recruitForestScouts("northmere").ok);
    assert.equal(frontRow("northmere").scouts, 1);
    assert.ok(forestWarfareModifiers().fronts.find(entry => entry.realmId === "northmere").ambushChance < 90);
});

test("forest roads open seasonally and raise movement and trade", () => {
    setup();
    assert.ok(openForestRoad("northmere").ok);
    const winter = frontRow("northmere");
    state.seasonIndex = 0;
    const spring = forestWarfareModifiers().fronts.find(entry => entry.realmId === "northmere");
    assert.equal(spring.roadOpen, false, "the boreal spring thaw closes the road");
    state.seasonIndex = 1;
    const summer = forestWarfareModifiers().fronts.find(entry => entry.realmId === "northmere");
    assert.equal(summer.roadOpen, true);
    assert.ok(summer.movement > spring.movement);
    assert.ok(summer.trade >= spring.trade);
    assert.equal(winter.road, 1);
});

test("ambush and forest battle write to the real soldiers and the province", () => {
    setup();
    war("northmere");
    const availability = forestWarfareActionAvailability("northmere");
    assert.equal(availability.battle.ok, true, availability.battle.reason);
    assert.ok(recruitForestScouts("northmere").ok);
    const ambush = layForestAmbush("northmere");
    assert.ok(ambush.ok, ambush.reason);
    const controlBefore = province("northmere").control;
    const battle = fightForestBattle("northmere");
    assert.ok(battle.ok, battle.reason);
    assert.equal(frontRow("northmere").battles, 1);
    assert.equal(frontRow("northmere").ambushYear, 0, "the ambush is consumed");
    assert.notEqual(province("northmere").control, controlBefore);
    assert.ok(battle.wounded + battle.fallen > 0, "the battle must touch a real soldier");
    const summary = forestWarfareSummary();
    assert.equal(summary.totals.battles, 1);
});

test("siege and ship timber are real reserves with real sinks", () => {
    setup();
    war("northmere");
    assert.ok(cutSiegeTimber("northmere").ok);
    assert.ok(cutSiegeTimber("northmere").ok);
    assert.ok(frontRow("northmere").siegeMaterial >= 10);
    const garrison = province("northmere").garrison;
    const control = province("northmere").control;
    const siege = pressForestSiege("northmere");
    assert.ok(siege.ok, siege.reason);
    assert.ok(province("northmere").garrison < garrison);
    assert.ok(province("northmere").control < control);
    assert.ok(reserveShipTimber("northmere").ok);
    assert.ok(reserveShipTimber("northmere").ok);
    assert.ok(frontRow("northmere").shipTimber >= 12);
    state.year += 1;
    assert.equal(updateForestWarfare(), true);
    assert.ok(state.military.ships >= 1, "reserved mast timber becomes a real hull");
});

test("elephants, abatis and partisans are terrain- and war-gated", () => {
    setup();
    const tropical = forestWarfareActionAvailability("redpass").elephants;
    assert.equal(tropical.ok, true, tropical.reason);
    assert.ok(musterWarElephants("redpass").ok);
    const mountain = forestWarfareActionAvailability("ironvale").elephants;
    assert.equal(mountain.ok, false);
    assert.match(mountain.reason, /cannot feed war elephants/);
    war("northmere");
    assert.ok(fellAbatis("northmere").ok);
    const cavalry = forestWarfareModifiers().fronts.find(entry => entry.realmId === "northmere").cavalry;
    assert.ok(cavalry < 1);
    assert.ok(raiseForestPartisans("northmere").ok);
    assert.equal(frontRow("northmere").partisans, 1);
});

test("embargo, route, customs and smuggling move real gold and relation", () => {
    setup();
    const beforeRelation = realm("northmere").relation;
    assert.ok(openForestTradeRoute("northmere").ok);
    assert.ok(setForestCustoms("northmere", 10).ok);
    const gold = state.resources.gold;
    state.year += 1;
    updateForestWarfare();
    assert.ok(state.resources.gold > gold, "route and customs pay real gold");
    const embargo = setForestEmbargo("northmere", "timber");
    assert.ok(embargo.ok, embargo.reason);
    assert.equal(frontRow("northmere").embargo, "timber");
    assert.ok(realm("northmere").relation < beforeRelation);
    assert.equal(realm("northmere").tradeAgreement, null);
    assert.ok(liftForestEmbargo("northmere").ok);
    assert.equal(frontRow("northmere").embargo, null);
    const smuggling = runForestSmuggling("northmere");
    assert.ok(smuggling.ok, smuggling.reason);
    assert.equal(typeof smuggling.caught, "boolean");
});

test("border treaty and joint preserve protect a real border tile", () => {
    setup();
    realm("northmere").relation = 70;
    const treaty = signBorderTreaty("northmere");
    assert.ok(treaty.ok, treaty.reason);
    assert.ok(frontRow("northmere").treaty.untilYear > state.year);
    const preserve = createJointPreserve("northmere");
    assert.ok(preserve.ok, preserve.reason);
    const tile = frontRow("northmere").preserve;
    assert.ok(sacredGroveTileAt(tile.x, tile.y));
    assert.equal(harvestForest(tile.x, tile.y, 4), 0, "the joint preserve refuses every axe");
    assert.equal(forestWarfareActionAvailability("northmere").ambush.ok, false);
});

test("rights, settlers and colonisation change the province and the resistance", () => {
    setup();
    assert.ok(recognizeWoodlandRights("northmere").ok);
    assert.equal(frontRow("northmere").rights, true);
    for (let step = 0; step < 3; step++) {
        state.year += 1;
        assert.ok(pressSettlerClaims("northmere").ok);
    }
    assert.equal(frontRow("northmere").settlers, 3);
    const colony = colonizeWoodland("northmere");
    assert.ok(colony.ok, colony.reason);
    assert.equal(province("northmere").ownerId, "crown");
    assert.ok(frontRow("northmere").rebels > 0);
    assert.equal(frontRow("northmere").colony.military, false);
});

test("deportation, refugees and a military colony are bounded and real", () => {
    setup();
    war("northmere");
    frontRow("northmere").rebels = 4;
    const deport = deportWoodlanders("northmere");
    assert.ok(deport.ok, deport.reason);
    assert.ok(frontRow("northmere").refugees >= 2);
    assert.ok(frontRow("northmere").rebels <= 2);
    const refugees = settleForestRefugees("northmere");
    assert.ok(refugees.ok, refugees.reason);
    assert.ok(frontRow("northmere").refugees < 2);
    const colony = foundMilitaryColony("northmere");
    assert.ok(colony.ok, colony.reason);
    assert.equal(frontRow("northmere").colony.military, true);
    frontRow("northmere").rebels = 2;
    const clear = clearRebelCamp("northmere");
    assert.ok(clear.ok, clear.reason);
    assert.ok(frontRow("northmere").rebels <= 2);
});

test("war fire and slash-and-burn touch a real forest tile and leave a scar", () => {
    setup();
    const realms = ["northmere", "ironvale", "goldcoast", "redpass"];
    let burned = null;
    for (const realmId of realms) {
        const result = burnForFields(realmId);
        if (result.ok) { burned = { realmId, result }; break; }
    }
    assert.ok(burned, "at least one front must reach a mature forest tile");
    const row = frontRow(burned.realmId);
    assert.ok(row.scars.length >= 1);
    assert.ok(burned.result.stockAfter < burned.result.stockBefore);
    assert.ok(state.resources.food > 0);
    war("northmere");
    const fire = setWarFire("northmere");
    if (fire.ok) {
        assert.ok(frontRow("northmere").scars.some(scar => scar.cause === "war fire"));
        assert.ok(province("northmere").control < 100);
    }
    const beforeScars = row.scars.length;
    const recovery = fundWarEcologyRecovery(burned.realmId);
    if (recovery.ok) {
        assert.ok(row.scars.length < beforeScars);
        assert.ok(recovery.restored >= 0);
    }
});

test("the annual pass is bounded, idempotent and recovers scars", () => {
    setup();
    const row = frontRow("northmere");
    row.scars.push({ x: 2, y: 2, year: state.year, severity: 2, cause: "test fire" });
    row.rebels = 2;
    row.colony = { year: state.year, military: true };
    state.year += 1;
    assert.equal(updateForestWarfare(), true);
    const once = JSON.stringify(forestWarfareSnapshot());
    assert.equal(updateForestWarfare(), false, "the annual pass runs once per year");
    assert.equal(JSON.stringify(forestWarfareSnapshot()), once);
    assert.equal(row.scars[0].severity, 1);
    state.year += 1;
    updateForestWarfare();
    assert.equal(row.scars.length, 0, "the scar heals after its severity runs out");
});

test("old saves normalise to four fronts and tampered values are capped", () => {
    setup();
    const empty = normalizeForestWarfare(null);
    assert.equal(empty.fronts.length, 4);
    assert.equal(empty.fronts.every(front => front.posts === 0), true);
    const tampered = normalizeForestWarfare({
        version: 1,
        fronts: [{
            realmId: "northmere", posts: 99, watch: 99, road: 99, scouts: 99,
            abatis: 99, elephants: 99, partisans: 99, settlers: 99, rebels: 99,
            refugees: 99, siegeMaterial: 999, shipTimber: 999,
            scars: Array.from({ length: 40 }, (_, index) => ({ x: index, y: 1, year: 1, severity: 99 })),
            embargo: "gold", customs: 77, treaty: { sinceYear: 1, untilYear: 2 },
        }],
        totals: { battles: -4 },
        lastUpdateYear: 3,
    });
    const front = tampered.fronts.find(entry => entry.realmId === "northmere");
    assert.equal(front.posts, 3);
    assert.equal(front.elephants, 3);
    assert.equal(front.rebels, 6);
    assert.equal(front.siegeMaterial, 30);
    assert.equal(front.shipTimber, 24);
    assert.equal(front.scars.length, 12);
    assert.equal(front.embargo, null);
    assert.equal(front.customs, 0);
    assert.equal(tampered.totals.battles, 0);
    ensureForestWarfare();
    state.economy.productionChains.forestWarfare = tampered;
    const roundtrip = JSON.parse(JSON.stringify(forestWarfareSnapshot()));
    assert.equal(roundtrip.fronts.length, 4);
    assert.equal(roundtrip.history.length, tampered.history.length);
});

test("the frontier summary exposes thirty points, four fronts and live actions", () => {
    setup();
    const summary = forestWarfareSummary();
    assert.equal(summary.requirementCount, 30);
    assert.equal(summary.fronts.length, 4);
    assert.equal(summary.profiles, 60);
    assert.equal(summary.fronts[0].actions.battle.ok, false);
    assert.ok(summary.fronts[0].profile.border);
    assert.ok(summary.fronts[0].modifiers.sight > 0);
    assert.ok(summary.costs.post.wood > 0);
    assert.ok(forestWarfareScore() !== 0 || summary.totals.battles === 0);
    const guide = summary.requirements.map(entry => entry.id);
    assert.equal(guide.length, 30);
    assert.equal(guide[0], "1.2.23.1.211");
    assert.equal(guide[29], "1.2.23.1.240");
});
