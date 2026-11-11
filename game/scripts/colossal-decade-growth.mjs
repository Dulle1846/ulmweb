// Ten-year growth audit: real card draws, real costs, real placement.
// Run with: node --expose-gc scripts/colossal-decade-growth.mjs
//
// The baseline decade audit keeps the starting kingdom static. This variant
// adds a deterministic building policy: it draws from the real card catalog,
// chooses a card from the actual hand, pays the real cost and places the
// building through placeCurrentCard(). The simulation is otherwise unchanged.

import { performance } from "node:perf_hooks";
import { resetState, state } from "../js/core/state.js";
import { DEFAULT_WORLD_OPTIONS } from "../js/world/terrain-model.js";
import { initWorld } from "../js/world/world.js";
import { initStartingKingdom } from "../js/world/entities.js";
import { initializeCityForRealm, openGoodsBookForNewRealm, updateLogisticsMovement } from "../js/systems/logistics.js";
import { initializeSettlementForRealm } from "../js/systems/settlement.js";
import { canPlaceBuilding, placeDirectBuilding } from "../js/systems/construction.js";
import { updateSimulation } from "../js/simulation/simulation.js";
import { TYPE } from "../js/core/types.js";
import { getHousingSnapshot } from "../js/systems/population.js";
import { canAfford } from "../js/systems/resources.js";
import { CARD_PROTOTYPES } from "../js/systems/card-catalog.js";
import {
    drawStartingHand,
    drawNewCard,
    selectCard,
    skipCard,
    placeCurrentCard,
    getCardPlacementPreview,
} from "../js/systems/cards.js";

const SEEDS = [20261107, 1846, 424242, 7, 90210];
const OPTIONS = { ...DEFAULT_WORLD_OPTIONS, size: "colossal" };
const TICKS = 4000;
const DECISION_INTERVAL = 200;
const HAND_LIMIT = 5;
const MAX_AUTO_DRAW_TICK = Number.MAX_SAFE_INTEGER;

const CARD_IDS = ["farmstead", "cottage", "lumberyard", "watchtower", "farmstead", "cottage", "stone-quarry", "tavern", "mill"];
const CARD_PROTOTYPE_BY_ID = new Map(CARD_PROTOTYPES.map(card => [card.id, card]));
const OFFER_CYCLE = CARD_IDS.map(id => {
    const prototype = CARD_PROTOTYPE_BY_ID.get(id);
    if (!prototype) throw new Error("Missing card prototype: " + id);
    return prototype;
});

function makeCanvasStub() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {},
            };
        },
    };
}

function withCanvasStub(callback) {
    const previous = globalThis.document;
    globalThis.document = {
        createElement(tag) {
            if (tag !== "canvas") throw new Error("Unexpected DOM element in benchmark: " + tag);
            return makeCanvasStub();
        },
    };
    try {
        return callback();
    } finally {
        globalThis.document = previous;
    }
}

function rounded(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function countType(type) {
    return state.entities.filter(entity => !entity.dead && entity.type === type).length;
}

function populationCount() {
    return countType(TYPE.VILLAGER);
}

function buildingCount() {
    return state.entities.filter(entity => !entity.dead && entity.isBuilding?.()).length;
}

function snapshot() {
    const housing = getHousingSnapshot();
    const ledger = state.economy?.lastLedger || {};
    return {
        year: state.year,
        tick: state.tick,
        population: populationCount(),
        capacity: housing.capacity,
        houses: countType(TYPE.HOUSE),
        farms: countType(TYPE.FARM),
        lumber: countType(TYPE.LUMBER),
        quarries: countType(TYPE.QUARRY),
        taverns: countType(TYPE.TAVERN),
        mills: countType(TYPE.MILL),
        buildings: buildingCount(),
        wood: rounded(state.resources.wood),
        stone: rounded(state.resources.stone),
        gold: rounded(state.resources.gold),
        food: rounded(state.resources.food),
        morale: rounded(state.morale, 1),
        legitimacy: rounded(state.politics?.legitimacy, 1),
        foodShortage: rounded(ledger.foodShortage),
        netGold: rounded(ledger.netGold),
        gameOver: Boolean(state.gameOver),
        victory: Boolean(state.victory),
    };
}

function ensureRewardQueue() {
    if (!Array.isArray(state.cardRewardQueue)) state.cardRewardQueue = [];
    if (state.cardRewardQueue.length < HAND_LIMIT * 2) state.cardRewardQueue.push(...OFFER_CYCLE);
}

function disableAutoDraw() {
    // The audit owns every draw so that a seed's card decisions stay explicit.
    state.nextCardDrawTick = MAX_AUTO_DRAW_TICK;
}

function drawOneCard() {
    if (state.hand.length >= HAND_LIMIT) return null;
    ensureRewardQueue();
    const card = drawNewCard();
    disableAutoDraw();
    return card;
}

function fillHand() {
    let drawn = 0;
    while (state.hand.length < HAND_LIMIT && drawn < 8) {
        if (!drawOneCard()) break;
        drawn++;
    }
    return drawn;
}

function desiredBuildingType() {
    const housing = getHousingSnapshot();
    const farms = countType(TYPE.FARM);
    const houses = housing.houses;
    const wood = Number(state.resources.wood) || 0;
    const stone = Number(state.resources.stone) || 0;
    const gold = Number(state.resources.gold) || 0;
    const food = Number(state.resources.food) || 0;
    const shortage = Number(state.economy?.lastLedger?.foodShortage) || 0;

    if (shortage > 0 || food < Math.max(90, housing.population * 4.5)) return TYPE.FARM;
    const needs = state.city?.needs?.summary;
    if (needs && needs.safety < 0.35) return TYPE.TOWER;
    if (farms < houses) return TYPE.FARM;
    if (housing.available < 2) return TYPE.HOUSE;
    if (wood < 140) return TYPE.LUMBER;
    if (stone < 80) return TYPE.QUARRY;
    if (gold < 70 && food > 80) return TYPE.TAVERN;
    if (housing.available < 5) return TYPE.HOUSE;
    if (farms < houses + 1) return TYPE.FARM;
    return TYPE.HOUSE;
}

function cardCost(card) {
    return Object.values(card?.cost || {}).reduce((total, value) => total + (Number(value) || 0), 0);
}

function findBuildTile() {
    const centerX = Math.floor((Number(state.worldW) || 576) / 2);
    const centerY = Math.floor((Number(state.worldH) || 576) / 2);
    for (let radius = 0; radius <= 40; radius++) {
        for (let ox = -radius; ox <= radius; ox++) {
            for (let oy = -radius; oy <= radius; oy++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                const tx = centerX + ox, ty = centerY + oy;
                const preview = getCardPlacementPreview(tx, ty);
                if (preview?.valid) return { tx, ty };
            }
        }
    }
    return null;
}

function attemptBuild(decision) {
    const drawn = fillHand();
    const wanted = desiredBuildingType();
    const affordable = state.hand.filter(card =>
        card?.kind === "building" && canAfford(card) && card.type
    );
    const wantedCards = affordable.filter(card => card.type === wanted);
    const candidates = wantedCards.length ? wantedCards : affordable;
    if (!candidates.length) {
        // Free one hand slot from an unaffordable or non-building card, then
        // let the next decision try a freshly drawn offer.
        const discard = state.hand.find(card => card?.kind === "building" && !canAfford(card));
        if (discard) {
            selectCard(discard.instanceId);
            if (skipCard()) decision.discarded++;
        }
        return { built: false, wanted, drawn, reason: "no affordable building card" };
    }
    candidates.sort((a, b) => cardCost(a) - cardCost(b) || String(a.type).localeCompare(String(b.type)));
    const card = candidates[0];
    if (!selectCard(card.instanceId)) return { built: false, wanted, drawn, reason: "could not select card" };
    const tile = findBuildTile();
    if (!tile) {
        if (skipCard()) decision.discarded++;
        return { built: false, wanted, drawn, reason: "no valid placement tile" };
    }
    const typeBefore = card.type;
    const beforeBuildings = buildingCount();
    const placed = placeCurrentCard(tile.tx, tile.ty);
    disableAutoDraw();
    if (!placed) {
        if (state.currentCard && skipCard()) decision.discarded++;
        return { built: false, wanted, drawn, reason: "placement rejected" };
    }
    decision.played++;
    decision.playedByType[typeBefore] = (decision.playedByType[typeBefore] || 0) + 1;
    if (buildingCount() > beforeBuildings) decision.newBuildings++;
    return { built: true, wanted, drawn, type: typeBefore, card: card.name, tile, cost: card.cost };
}

function runSeed(seed) {
    resetState();
    state.worldSeed = seed;
    state.worldOptions = { ...OPTIONS };
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.hiddenRealm = { ...(state.hiddenRealm || {}), prosperity: 0 };

    const initStarted = performance.now();
    withCanvasStub(() => initWorld(seed, state.worldOptions));
    initStartingKingdom();
    // Card buildings need the same city, settlement and logistics layers as
    // the live game; without them every new house stays an unfinished site and
    // the growth audit measures population decline rather than growth.
    initializeCityForRealm();
    initializeSettlementForRealm();
    openGoodsBookForNewRealm();
    // A colossal start has homes but no reliable service district. Place a
    // small paid well/watchtower cluster as a real construction project so the
    // normal settlement gate can open; this is infrastructure, not a resource
    // grant. Watchtowers can also be drawn later from the real card queue.
    const placeService = type => {
        if (state.entities.some(entity => !entity.dead && entity.type === type)) return;
        const centerX = Math.floor((Number(state.worldW) || 576) / 2);
        const centerY = Math.floor((Number(state.worldH) || 576) / 2);
        for (let radius = 0; radius <= 30; radius++) {
            for (let ox = -radius; ox <= radius; ox++) {
                for (let oy = -radius; oy <= radius; oy++) {
                    if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                    const tx = centerX + ox, ty = centerY + oy;
                    if (!canPlaceBuilding(type, tx, ty).ok) continue;
                    return placeDirectBuilding(type, tx, ty);
                }
            }
        }
        return null;
    };
    placeService(TYPE.WELL);
    placeService(TYPE.WELL);
    placeService(TYPE.TOWER);
    placeService(TYPE.TOWER);
    initializeSettlementForRealm();
    const initMs = performance.now() - initStarted;

    drawStartingHand();
    ensureRewardQueue();
    fillHand();
    disableAutoDraw();
    const initial = snapshot();
    const decision = {
        played: 0,
        discarded: 0,
        newBuildings: 0,
        attempted: 0,
        playedByType: {},
        failures: {},
    };
    const yearly = [snapshot()];
    const decisions = [];
    let lastYear = state.year;
    let minFood = Infinity, maxFood = -Infinity;
    let shortagePeriods = 0, shortageTotal = 0;
    let ledgerPeriods = 0;

    const simulationStarted = performance.now();
    let completedTicks = 0;
    for (let tick = 1; tick <= TICKS; tick++) {
        updateSimulation();
        for (let step = 0; step < 4; step++) updateLogisticsMovement(0.1875);
        disableAutoDraw();
        completedTicks = state.tick;
        minFood = Math.min(minFood, state.resources.food);
        maxFood = Math.max(maxFood, state.resources.food);
        if (state.tick % 20 === 0 && state.economy?.lastLedger) {
            ledgerPeriods++;
            const shortage = Number(state.economy.lastLedger.foodShortage) || 0;
            if (shortage > 0) {
                shortagePeriods++;
                shortageTotal += shortage;
            }
        }
        if (state.tick % DECISION_INTERVAL === 0) {
            decision.attempted++;
            const result = attemptBuild(decision);
            decisions.push({
                tick: state.tick,
                year: state.year,
                wanted: Object.keys(TYPE).find(key => TYPE[key] === result.wanted) || result.wanted,
                ...result,
            });
            if (!result.built) {
                decision.failures[result.reason] = (decision.failures[result.reason] || 0) + 1;
            }
        }
        if (state.year !== lastYear) {
            lastYear = state.year;
            yearly.push(snapshot());
        }
        if (state.gameOver) break;
    }
    const simulationMs = performance.now() - simulationStarted;
    const final = snapshot();

    const resourcesValid = Object.values(state.resources).every(value => Number.isFinite(value) && value >= 0);
    const entitiesValid = state.entities.every(entity =>
        Number.isFinite(entity.x) && Number.isFinite(entity.y)
        && entity.x >= 0 && entity.y >= 0
        && entity.x < state.worldW && entity.y < state.worldH
    );
    const ids = state.entities.map(entity => entity.id).filter(Boolean);
    const uniqueIds = new Set(ids).size === ids.length;
    const moodsValid = Number.isFinite(state.morale) && state.morale >= 0 && state.morale <= 100
        && Number.isFinite(state.politics?.legitimacy) && state.politics.legitimacy >= 0 && state.politics.legitimacy <= 100;
    const grew = final.population > initial.population
        && final.buildings > initial.buildings
        && final.houses > initial.houses
        && final.capacity > initial.capacity;
    const valid = resourcesValid && entitiesValid && uniqueIds && moodsValid
        && completedTicks === TICKS && !final.gameOver && decision.played > 0 && grew;

    return {
        seed,
        world: [state.worldW, state.worldH],
        initMs: rounded(initMs, 1),
        simulationMs: rounded(simulationMs, 1),
        completedTicks,
        initial,
        final,
        growth: {
            population: final.population - initial.population,
            capacity: final.capacity - initial.capacity,
            houses: final.houses - initial.houses,
            farms: final.farms - initial.farms,
            buildings: final.buildings - initial.buildings,
        },
        cards: {
            played: decision.played,
            discarded: decision.discarded,
            newBuildings: decision.newBuildings,
            attempted: decision.attempted,
            playedByType: decision.playedByType,
            failures: decision.failures,
        },
        ledgerPeriods,
        shortagePeriods,
        shortageTotal: rounded(shortageTotal),
        minFood: rounded(minFood),
        maxFood: rounded(maxFood),
        yearly,
        decisions,
        valid,
        grew,
        resourcesValid,
        entitiesValid,
        uniqueIds,
        moodsValid,
    };
}

const runs = SEEDS.map(runSeed);
const range = values => [Math.min(...values), Math.max(...values)];
const summary = {
    profile: "default colossal world + real building-card policy",
    seeds: SEEDS,
    counts: {
        completedTenYears: runs.filter(run => run.completedTicks === TICKS).length,
        gameOver: runs.filter(run => run.final.gameOver).length,
        grewBeyondStartingKingdom: runs.filter(run => run.grew).length,
        invalid: runs.filter(run => !run.valid).length,
    },
    finalPopulation: range(runs.map(run => run.final.population)),
    populationGrowth: range(runs.map(run => run.growth.population)),
    finalBuildings: range(runs.map(run => run.final.buildings)),
    houseGrowth: range(runs.map(run => run.growth.houses)),
    farmGrowth: range(runs.map(run => run.growth.farms)),
    finalCapacity: range(runs.map(run => run.final.capacity)),
    cardsPlayed: range(runs.map(run => run.cards.played)),
    cardsDiscarded: range(runs.map(run => run.cards.discarded)),
    finalGold: range(runs.map(run => run.final.gold)),
    finalFood: range(runs.map(run => run.final.food)),
    finalWood: range(runs.map(run => run.final.wood)),
    finalStone: range(runs.map(run => run.final.stone)),
    shortageRuns: runs.filter(run => run.shortagePeriods > 0).length,
    totalShortage: rounded(runs.reduce((total, run) => total + run.shortageTotal, 0)),
    initMs: range(runs.map(run => run.initMs)),
    simulationMs: range(runs.map(run => run.simulationMs)),
};

console.log("GROWTH DECADE", JSON.stringify({ summary, runs }));

if (summary.counts.invalid > 0 || summary.counts.grewBeyondStartingKingdom !== runs.length) process.exitCode = 1;
