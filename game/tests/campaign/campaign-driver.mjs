// Deterministic scripted player for the full campaign.
//
// The driver uses the shipped starting kingdom, construction, logistics,
// events and royal systems. It never mutates resource totals directly: every
// building is placed through placeDirectBuilding(), every road through
// placeRoad(), and every issue through resolveEventChoice(). The same module
// runs in Node (with a canvas stub) and in the browser page.
import { state, resetState } from "../../js/core/state.js";
import { initWorld } from "../../js/world/world.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { TYPE } from "../../js/core/types.js";
import {
    initializeCityForRealm, openGoodsBookForNewRealm, updateLogisticsMovement, getWarehouseSnapshot, getPhysicalStockMap
} from "../../js/systems/logistics.js";
import { BUILDING_SIZE } from "../../js/core/config.js";
import { isWaterAt } from "../../js/world/world.js";
import { findPath, isWalkable } from "../../js/simulation/villagers.js";
import { normalizeHouseholdAssignments, getHousingSnapshot } from "../../js/systems/population.js";
import { initializeSettlementForRealm } from "../../js/systems/settlement.js";
import { updateSimulation } from "../../js/simulation/simulation.js";
import { resolveEventChoice } from "../../js/systems/events.js";
import { AMBITIONS, getAmbitionSnapshot, getCrownEraSnapshot } from "../../js/systems/ambitions.js";
import { placeDirectBuilding, canPlaceBuilding, isUnderConstruction, cancelConstruction } from "../../js/systems/construction.js";
import { placeRoad } from "../../js/systems/roads.js";
import { getRoyalHouse, appointRoyalConsort, createRoyalChild } from "../../js/systems/royal-dynasty.js";
import { addressFactionDemand } from "../../js/systems/court.js";
import { getWorldMapSnapshot, grantProvinceCharter, refuseProvincePetition } from "../../js/systems/world-map.js";
import { getResourceNodeAt } from "../../js/systems/resource-geography.js";
import { REGIONAL_FOREST_TYPE_IDS, REGIONAL_TIMBERS } from "../../js/world/regional-forests.js";

export const CAMPAIGN_YEAR_DAYS = 400;
export const CAMPAIGN_SEED = 20261108;
export const CAMPAIGN_YEARS = 25;
const LOGISTICS_STEPS = 4;
const LOGISTICS_DT = 0.1875;
const MAX_ACTIVE_SITES = 1;
const CIVIC_BUILDINGS = Object.freeze([TYPE.TOWN_HALL, TYPE.SCHOOL, TYPE.CLINIC, TYPE.BATHHOUSE, TYPE.GUILDHALL, TYPE.WATCHHOUSE]);
let campaignProfile = "builder";
let campaignSkippedTypes = new Set();
let campaignEra = "common-weal";
let campaignMinAgendaStages = 1;

const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
};
const countType = type => state.entities.filter(entity => !entity.dead && entity.type === type).length;
const operationalCount = type => state.entities.filter(entity =>
    !entity.dead && entity.type === type && !isUnderConstruction(entity)
).length;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const population = () => countType(TYPE.VILLAGER);

function keepPosition() {
    const keep = state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP);
    return keep ? { x: keep.x, y: keep.y } : {
        x: Math.floor((Number(state.worldW) || 160) / 2),
        y: Math.floor((Number(state.worldH) || 160) / 2)
    };
}

function nearestDistance(point, entities) {
    if (!entities.length) return 0;
    return Math.min(...entities.map(entity => distance(point, entity)));
}

function activeSites() {
    return state.entities.filter(entity => !entity.dead && entity.isBuilding() && isUnderConstruction(entity));
}

function buildingCoversTile(x, y) {
    return state.entities.some(entity => {
        if (entity.dead || !entity.isBuilding?.()) return false;
        const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
        const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
        const halfW = base.w * scale / 2;
        const halfH = base.h * scale / 2;
        return x + 0.5 >= entity.x + 0.5 - halfW && x + 0.5 < entity.x + 0.5 + halfW &&
            y + 0.5 >= entity.y + 0.5 - halfH && y + 0.5 < entity.y + 0.5 + halfH;
    });
}

// A deliberate settlement keeps a main street open. Without one, a ring of
// cottages can seal the keep off from every store and construction site, and
// no amount of material can be hauled in.
let corridorCache = null;
let keepAccess = null;
const corridorKey = (x, y) => x + ":" + y;

function footprintTiles(type, x, y) {
    const base = BUILDING_SIZE[type] || { w: 1, h: 1 };
    const left = Math.floor(x + 0.5 - base.w / 2);
    const right = Math.ceil(x + 0.5 + base.w / 2) - 1;
    const top = Math.floor(y + 0.5 - base.h / 2);
    const bottom = Math.ceil(y + 0.5 + base.h / 2) - 1;
    const tiles = [];
    for (let tx = left; tx <= right; tx++) {
        for (let ty = top; ty <= bottom; ty++) tiles.push({ x: tx, y: ty });
    }
    return tiles;
}
function footprintTouches(type, x, y, tiles) {
    return footprintTiles(type, x, y).some(tile => tiles.has(corridorKey(tile.x, tile.y)));
}
function walkableNear(x, y, radius = 6) {
    for (let step = 0; step <= radius; step++) {
        for (let dx = -step; dx <= step; dx++) {
            for (let dy = -step; dy <= step; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== step) continue;
                if (isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
            }
        }
    }
    return null;
}
function routeFromKeep(x, y) {
    if (!keepAccess) {
        const centre = keepPosition();
        keepAccess = walkableNear(centre.x, centre.y, 6);
    }
    if (!keepAccess || !isWalkable(x, y)) return null;
    const route = findPath(keepAccess.x, keepAccess.y, x, y, 1800);
    return Array.isArray(route) && route.length ? route : null;
}
// A carrier cannot stand on the new footprint. Find a walkable tile around it
// and route to that tile instead; otherwise a building can block its own last
// approach and appear present while being unreachable from every store.
function approachRoute(type, x, y) {
    const footprint = footprintTiles(type, x, y);
    const inside = new Set(footprint.map(tile => corridorKey(tile.x, tile.y)));
    const approaches = new Map();
    for (const tile of footprint) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const ax = tile.x + dx, ay = tile.y + dy;
                if (inside.has(corridorKey(ax, ay)) || !isWalkable(ax, ay)) continue;
                approaches.set(corridorKey(ax, ay), { x: ax, y: ay });
            }
        }
    }
    // Try only the approaches facing the keep. Pathfinding every perimeter
    // tile for every candidate turns a 25-year audit into a minutes-long scan.
    const centre = keepPosition();
    const closest = [...approaches.values()]
        .sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))
        .slice(0, 4);
    let best = null;
    for (const approach of closest) {
        const route = routeFromKeep(approach.x, approach.y);
        if (!route) continue;
        if (!best || route.length < best.route.length) best = { route, approach };
    }
    return best;
}
function corridorTiles() {
    if (corridorCache) return corridorCache;
    const centre = keepPosition();
    const tiles = [];
    // The housing district extends north from the keep. Reserving a three-tile
    // main street through it keeps every cottage reachable from the stores.
    for (let step = 2; step <= 30; step++) {
        for (let side = -1; side <= 1; side++) tiles.push({ x: centre.x + side, y: centre.y - step });
    }
    corridorCache = new Set(tiles.map(tile => corridorKey(tile.x, tile.y)));
    return corridorCache;
}

function siteScore(type, x, y) {
    const centre = keepPosition();
    const point = { x, y };
    const houses = state.entities.filter(entity => !entity.dead && entity.type === TYPE.HOUSE);
    const wells = state.entities.filter(entity => !entity.dead && entity.type === TYPE.WELL && !isUnderConstruction(entity));
    const social = state.entities.filter(entity => !entity.dead &&
        [TYPE.TEMPLE, TYPE.MARKET, TYPE.TAVERN].includes(entity.type) && !isUnderConstruction(entity));
    const serviceDistance = type === TYPE.HOUSE
        ? nearestDistance(point, wells) + nearestDistance(point, social) * 0.7
        : type === TYPE.WELL
            ? houses.length ? houses.reduce((sum, house) => sum + distance(point, house), 0) / houses.length : 0
            : type === TYPE.MARKET || type === TYPE.TEMPLE || type === TYPE.CLINIC || type === TYPE.TOWER
                ? houses.length ? houses.reduce((sum, house) => sum + distance(point, house), 0) / houses.length : 0
                : 0;
    return serviceDistance + distance(point, centre) * 0.18;
}

const PRODUCTION_TYPES = new Set([TYPE.FARM, TYPE.BAKERY, TYPE.MILL, TYPE.SAWMILL]);
function inBuildSector(type, dx, dy) {
    if (type === TYPE.HOUSE) return dy <= -3 && Math.abs(dx) <= 22;
    if (PRODUCTION_TYPES.has(type)) return dy >= 2 || dx >= 2;
    return true;
}

function snowScarNear(x, y, radius = 6) {
    const recovery = state.disasterRecovery;
    if (!recovery) return false;
    const wrecks = [...(recovery.pending || []), ...(recovery.history || [])];
    return wrecks.some(entry => /snow|avalanche/i.test(String(entry.cause || entry.causeLabel || "")) &&
        Math.hypot(Number(entry.x) - x, Number(entry.y) - y) <= radius);
}

function findSite(type, maxRadius, excluded = null) {
    const centre = keepPosition();
    const candidates = [];
    for (let radius = 2; radius <= maxRadius; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                if (!inBuildSector(type, dx, dy)) continue;
                const x = centre.x + dx;
                const y = centre.y + dy;
                if (excluded?.has(type + ":" + x + ":" + y)) continue;
                const check = canPlaceBuilding(type, x, y);
                if (!check.ok) continue;
                if (snowScarNear(x, y)) continue;
                if (footprintTouches(type, x, y, corridorTiles())) continue;
                candidates.push({ x, y, score: siteScore(type, x, y) });
            }
        }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates.slice(0, 24)) {
        if (!approachRoute(type, candidate.x, candidate.y)) continue;
        return candidate;
    }
    return null;
}

function layRoads() {
    if (Math.max(0, Number(state.statistics?.totalRoadTilesBuilt) || 0) >= 12) return 0;
    const centre = keepPosition();
    let placed = 0;
    // Pave the reserved access corridor first; this makes the main street a
    // real road rather than only a keep-clear rule for builders.
    for (const key of corridorTiles()) {
        if ((Number(state.statistics?.totalRoadTilesBuilt) || 0) >= 12) break;
        const [x, y] = key.split(":").map(Number);
        if (placeRoad(x, y, "dirt").ok) placed++;
    }
    for (let radius = 2; radius <= 18 && (Number(state.statistics?.totalRoadTilesBuilt) || 0) < 12; radius++) {
        for (let dx = -radius; dx <= radius && (Number(state.statistics?.totalRoadTilesBuilt) || 0) < 12; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const result = placeRoad(centre.x + dx, centre.y + dy, "dirt");
                if (result.ok) placed++;
                if ((Number(state.statistics?.totalRoadTilesBuilt) || 0) >= 12) break;
            }
        }
    }
    return placed;
}

function nextBuilding() {
    // Security first, then one extra cottage, then the food chain. Production
    // is placed on the east/south side while the new housing district grows
    // north, so cottages cannot wall the mills and bakeries off from stores.
    if (countType(TYPE.TOWER) < 1) return { type: TYPE.TOWER, radius: 12 };
    if (countType(TYPE.HOUSE) < 5) return { type: TYPE.HOUSE, radius: 26 };
    if (countType(TYPE.FARM) < 4) return { type: TYPE.FARM, radius: 36 };
    if (countType(TYPE.BAKERY) < 2) return { type: TYPE.BAKERY, radius: 24 };
    if (countType(TYPE.MILL) < 2) return { type: TYPE.MILL, radius: 24 };
    if (countType(TYPE.HOUSE) < 16) return { type: TYPE.HOUSE, radius: 30 };
    // Finish the food and fuel chains before optional coverage upgrades. A
    // blocked well used to freeze the one-site pipeline; production is the
    // part of the settlement that keeps residents alive through winter.
    if (countType(TYPE.BAKERY) < 3) return { type: TYPE.BAKERY, radius: 28 };
    if (countType(TYPE.MILL) < 3) return { type: TYPE.MILL, radius: 28 };
    if (countType(TYPE.SAWMILL) < 2) return { type: TYPE.SAWMILL, radius: 28 };
    // A mature realm also builds the service and civic buildings whose jobs
    // make the staffing, coverage and court systems observable over decades.
    // Leave the first 25-year gate untouched: these are post-ambition works.
    if (state.year >= 30) {
        for (const type of CIVIC_BUILDINGS) {
            if (!campaignSkippedTypes.has(type) && countType(type) < 1) return { type, radius: 36 };
        }
    }
    const agenda = getCrownEraSnapshot()?.agenda;
    // The campaign is a deliberate player: when the era agenda asks for housing,
    // it builds the next cottage instead of leaving the objective blocked by a
    // full settlement. This uses the normal construction and logistic paths.
    if (agenda?.id === "common-hearths" && agenda.value < agenda.target) return { type: TYPE.HOUSE, radius: 40 };
    // A high-food opening can set the granary target above the output of the
    // four farms that satisfied the earlier ambition. Add real farm capacity
    // while the food stage is open; the target itself remains +180 food.
    if (agenda?.id === "common-granary" && agenda.value < agenda.target && countType(TYPE.FARM) < 6) return { type: TYPE.FARM, radius: 56 };

    const needs = state.city?.needs?.summary;
    // Safety coverage must grow with the housing district. A single tower by
    // the keep cannot watch cottages added to the east and north, and the
    // immigration gate then freezes the realm at twenty residents.
    if (needs && needs.safety < 0.55 && countType(TYPE.TOWER) < 5) return { type: TYPE.TOWER, radius: 30 };
    if (needs && needs.water < 0.8 && countType(TYPE.WELL) < 4) return { type: TYPE.WELL, radius: 30 };
    if (needs && needs.social < 0.75 && countType(TYPE.MARKET) < 2) return { type: TYPE.MARKET, radius: 24 };
    if (needs && needs.social < 0.75 && countType(TYPE.TEMPLE) < 2) return { type: TYPE.TEMPLE, radius: 24 };
    if (countType(TYPE.BAKERY) < 3) return { type: TYPE.BAKERY, radius: 24 };
    if (countType(TYPE.MILL) < 3) return { type: TYPE.MILL, radius: 24 };
    if (countType(TYPE.SAWMILL) < 2) return { type: TYPE.SAWMILL, radius: 24 };
    return null;
}

function ensureHeir() {
    if (state.royal?.heirId) return { ok: true, reason: "heir-present" };
    const house = getRoyalHouse();
    if (!house.king) return { ok: false, reason: "no-sovereign" };
    if (!state.royal?.consortId) {
        const candidate = house.candidates[0];
        if (!candidate) return { ok: false, reason: "no-eligible-consort" };
        const married = appointRoyalConsort(candidate.personId || candidate.id);
        if (!married.ok) return { ok: false, reason: married.reason || "royal-marriage-failed" };
    }
    const child = createRoyalChild();
    if (!child.ok) return { ok: false, reason: child.reason || "royal-child-failed" };
    return { ok: Boolean(state.royal?.heirId), reason: state.royal?.heirId ? "heir-created" : "heir-not-designated" };
}

function resolveActiveEvent() {
    if (!state.activeEvent) return false;
    const choices = Array.isArray(state.activeEvent.choices) ? state.activeEvent.choices : [];
    if (state.activeEvent.family === "crown-era") {
        const eraIndex = choices.findIndex(choice => choice?.effects?.crownEra === campaignEra);
        return eraIndex >= 0 ? resolveEventChoice(eraIndex) : false;
    }
    for (let index = 0; index < Math.max(1, choices.length); index++) {
        if (resolveEventChoice(index)) return true;
    }
    return false;
}

function provinceEvidence() {
    const world = getWorldMapSnapshot();
    return {
        crownProvinces: world.totals.crownProvinces,
        charteredProvinces: world.totals.charteredProvinces,
        openPetitions: world.totals.openPetitions,
        annualLevy: world.totals.annualLevy,
        annualYield: world.totals.annualYield,
        chartersGranted: world.totals.chartersGranted,
        chartersRevoked: world.totals.chartersRevoked,
        petitionsGranted: world.totals.petitionsGranted,
        petitionsRefused: world.totals.petitionsRefused,
        petitionsIgnored: world.totals.petitionsIgnored,
        provinces: world.regions.filter(region => region.ownerKind === "crown").map(region => ({
            id: region.id,
            autonomy: region.autonomy,
            autonomyLabel: region.autonomyLabel,
            loyalty: region.loyalty,
            control: region.control,
            levy: region.levy,
            levyBase: region.levyBase,
            petitionTier: region.petitionTier
        }))
    };
}

function answerPendingProvincePetitions(diagnostics) {
    const snapshot = getWorldMapSnapshot();
    for (const region of snapshot.regions) {
        if (region.ownerKind !== "crown" || !(region.petitionTier > 0)) continue;
        if (region.canGrantCharter) {
            const result = grantProvinceCharter(region.id);
            if (result.ok) {
                diagnostics.provincePetitions.push({
                    year: state.year, province: region.id, decision: "granted",
                    tier: result.tier, cost: result.cost
                });
                continue;
            }
        }
        if (region.canRefusePetition) {
            const result = refuseProvincePetition(region.id);
            if (result.ok) {
                diagnostics.provincePetitions.push({
                    year: state.year, province: region.id, decision: "refused",
                    strategy: "the treasury could not fund the charter"
                });
            }
        }
    }
}

function captureSnapshot(extra = {}) {
    const housing = getHousingSnapshot();
    const warehouse = getWarehouseSnapshot();
    const ambition = getAmbitionSnapshot();
    const era = getCrownEraSnapshot();
    const needs = state.city?.needs?.summary;
    const ledger = state.economy?.lastLedger;
    return {
        tick: state.tick,
        year: state.year,
        population: population(),
        capacity: housing.capacity,
        houses: housing.houses,
        farms: countType(TYPE.FARM),
        mills: countType(TYPE.MILL),
        bakeries: countType(TYPE.BAKERY),
        towers: countType(TYPE.TOWER),
        wells: countType(TYPE.WELL),
        sawmills: countType(TYPE.SAWMILL),
        buildings: state.entities.filter(entity => !entity.dead && entity.isBuilding() && !isUnderConstruction(entity)).length,
        activeSites: activeSites().length,
        resources: Object.fromEntries(Object.entries(state.resources).map(([key, value]) => [key, round(value)])),
        morale: round(state.morale),
        satisfaction: round(needs?.satisfaction, 3),
        foodShortage: round(ledger?.foodShortage),
        legitimacy: round(state.politics?.legitimacy),
        factions: state.politics?.factions ? { ...state.politics.factions } : null,
        taxesCollected: round(state.economy?.taxesCollected),
        trades: Math.max(0, Number(state.statistics?.totalTrades) || 0),
        recruited: Math.max(0, Number(state.statistics?.totalUnitsRecruited) || 0),
        prestige: Math.max(0, Number(state.legacy?.prestige) || 0),
        firewood: round(warehouse.stock?.firewood || 0),
        grain: round(warehouse.stock?.grain || 0),
        bread: round(warehouse.stock?.bread || 0),
        roads: Math.max(0, Number(state.statistics?.totalRoadTilesBuilt) || 0),
        built: Math.max(0, Number(state.statistics?.totalBuildingsBuilt) || 0),
        eventsResolved: Math.max(0, Number(state.statistics?.totalEventsResolved) || 0),
        ambition: {
            id: ambition.id,
            title: ambition.title,
            completedCount: ambition.completedCount,
            total: ambition.total,
            allComplete: ambition.allComplete,
            progressLabel: ambition.progressLabel,
            eternal: Boolean(ambition.eternal),
            eternalCount: Number(ambition.eternalCount) || 0,
            eternalTitle: ambition.eternal ? ambition.title : null,
            eternalProgress: ambition.eternal ? ambition.progress : 0,
            agenda: Boolean(ambition.agenda),
            stageIndex: Number(ambition.stageIndex) || 0,
            stageTotal: Number(ambition.stageTotal) || 0,
            stageTitle: ambition.agenda ? ambition.title : null,
            stageProgress: ambition.agenda ? ambition.progress : 0,
            stageProgressLabel: ambition.agenda ? ambition.progressLabel : null
        },
        era: era ? era.id : null,
        eraTitle: era ? era.title : null,
        eraAgenda: era?.agenda ? {
            id: era.agenda.id,
            stageIndex: era.agenda.stage,
            completed: era.agenda.completed.length,
            complete: era.agenda.complete,
            value: round(era.agenda.value),
            target: round(era.agenda.target),
            progressLabel: era.agenda.progressLabel,
            modifiers: { ...era.agenda.modifiers }
        } : null,
        economyFeedback: {
            foodDemandFactor: ledger?.eraFoodDemandFactor ?? null,
            taxEfficiency: ledger?.eraTaxEfficiency ?? null
        },
        world: provinceEvidence(),
        ...extra
    };
}

// Read-only evidence for the one-shot fuel order. The harness never calls
// the order or sets its flags; it only observes the normal simulation state
// after each tick. Continuous leases are one order, while a changed lease on
// the same worker is an illness extension, not a second order.
function observeFuelBackfill(previous, phases, diagnostics) {
    const current = new Map();
    for (const entity of state.entities) {
        const building = entity.workplace;
        const lease = Number(entity.fuelBackfillUntil);
        if (entity.dead || entity.type !== TYPE.VILLAGER || !(lease > state.tick)) continue;
        if (!building || building.dead || ![TYPE.LUMBER, TYPE.SAWMILL].includes(building.type)) continue;
        current.set(entity.id + ":" + building.id, {
            lease,
            worker: entity,
            building
        });
    }
    for (const [key, active] of current) {
        const before = previous.get(key);
        if (before && before.lease === active.lease) continue;
        if (before) {
            diagnostics.extensions++;
            continue;
        }
        const phase = active.building.id + ":" + active.lease;
        const count = (phases.get(phase) || 0) + 1;
        phases.set(phase, count);
        diagnostics.orders++;
        diagnostics.phases = phases.size;
        diagnostics.maxOrdersPerPhase = Math.max(diagnostics.maxOrdersPerPhase, count);
        const sick = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER
            && entity.workplace === active.building && Number(entity.illnessUntilTick) > state.tick);
        if (diagnostics.observations.length < 6) {
            diagnostics.observations.push({
                tick: state.tick,
                year: state.year,
                buildingId: active.building.id,
                buildingType: active.building.type,
                replacementId: active.worker.id,
                replacementJob: active.worker.job,
                lease: active.lease,
                firewoodStock: Number(state.city?.needs?.summary?.firewoodStock),
                sick: sick.map(entity => ({
                    id: entity.id,
                    job: entity.job,
                    illnessUntilTick: entity.illnessUntilTick,
                    guardUntil: entity.fuelBackfillGuardUntil
                }))
            });
        }
    }
    previous.clear();
    for (const [key, active] of current) previous.set(key, active);
}

function initialiseFreshRealm(seed, worldOptions = null) {
    corridorCache = null;
    keepAccess = null;
    resetState();
    state.worldSeed = seed;
    if (worldOptions && typeof worldOptions === "object") {
        state.worldOptions = { ...state.worldOptions, ...worldOptions };
    }
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.victory = false;
    initWorld(seed, state.worldOptions);
    initStartingKingdom();
    initializeCityForRealm();
    normalizeHouseholdAssignments();
    initializeSettlementForRealm();
    openGoodsBookForNewRealm();
}

export function runCampaign({
    seed = CAMPAIGN_SEED,
    profile = "builder",
    years = CAMPAIGN_YEARS,
    initialize = true,
    sampleTicks = 120,
    era = "common-weal",
    minAgendaStages = 1,
    worldOptions = null,
    answerCourtPetitions = false,
    answerProvincePetitions = false,
    onTick = null,
    onInitialized = null
} = {}) {
    if (initialize) {
        initialiseFreshRealm(seed, worldOptions);
        // Long-run audits need the same identity/legacy surface as a browser
        // realm so their saves pass the real import validation. Keep this
        // opt-in: the deterministic campaign benchmarks intentionally use the
        // minimal driver realm and must not change.
        if (typeof onInitialized === "function") onInitialized(state);
    }
    state.isPaused = false;
    state.gameOver = false;
    state.victory = false;

    campaignProfile = ["builder", "settler", "ignorer"].includes(profile) ? profile : "builder";
    campaignSkippedTypes = new Set();
    campaignEra = ["common-weal", "guild-compact", "royal-ascendancy"].includes(era) ? era : "common-weal";
    campaignMinAgendaStages = Math.max(1, Math.min(3, Math.floor(Number(minAgendaStages) || 1)));
    const started = performance.now();
    const totalTicks = years * CAMPAIGN_YEAR_DAYS + 40;
    // A settler acts promptly on housing and food; an ignorer lets the realm
    // run and reviews construction every sixteen days.
    const buildInterval = campaignProfile === "ignorer" ? 16 : campaignProfile === "settler" ? 6 : 8;
    const yearly = [captureSnapshot()];
    const diagnostics = {
        buildAttempts: 0,
        buildFailures: {},
        stalledSites: [],
        recoveredSites: [],
        heirAttempts: [],
        fuelBackfill: { orders: 0, phases: 0, extensions: 0, maxOrdersPerPhase: 0, observations: [] },
        lastBuild: null,
        lastHeir: null,
        provincePetitions: []
    };
    const fuelBackfillActive = new Map();
    const fuelBackfillPhases = new Map();
    let previousYear = state.year;
    let lastBuildCheck = 0;
    let lastHeirYear = 0;
    const siteHistory = new Map();
    const unreachableSites = new Set();
    const noSiteAttempts = new Map();

    for (let index = 0; index < totalTicks; index++) {
        updateSimulation();
        observeFuelBackfill(fuelBackfillActive, fuelBackfillPhases, diagnostics.fuelBackfill);
        resolveActiveEvent();
        // A deliberate player answers the court's annual faction petition.
        // Retry periodically while it is affordable; an unaffordable petition
        // still expires through the shipped court path.
        if (answerCourtPetitions && state.tick % 40 === 0 && state.court?.demand) addressFactionDemand(state.court.demand.faction);
        for (let step = 0; step < LOGISTICS_STEPS; step++) updateLogisticsMovement(LOGISTICS_DT);

        // Player decisions are deliberately sparse: one construction site at
        // a time, one policy review every 8 days, roads and the royal house
        // reviewed annually. This mirrors a deliberate human build order
        // rather than placing every affordable building on tick one.
        if (state.tick - lastBuildCheck >= buildInterval) {
            lastBuildCheck = state.tick;
            layRoads();
            // A site waiting for a stage payment or a missing material must not
            // monopolise the campaign's one-site pipeline forever. This mirrors
            // the shipped cancel-site action (35% of paid materials returned);
            // the record distinguishes a recovered setback from an open stall.
            for (const site of activeSites()) {
                const previous = siteHistory.get(site);
                if (!previous || previous.stage !== site.construction?.stage) continue;
                if (state.tick - previous.since <= 420) continue;
                const cancelled = cancelConstruction(site);
                if (!cancelled.ok) continue;
                diagnostics.recoveredSites.push({
                    id: site.id, type: site.type, stage: previous.stage,
                    since: previous.since, reason: previous.reason || null
                });
                siteHistory.delete(site);
            }
            const sites = activeSites();
            if (sites.length < MAX_ACTIVE_SITES) {
                const wanted = nextBuilding();
                if (wanted) {
                    const site = findSite(wanted.type, wanted.radius, unreachableSites);
                    diagnostics.buildAttempts++;
                    if (!site) {
                        const key = "no-site:" + wanted.type;
                        diagnostics.buildFailures[key] = (diagnostics.buildFailures[key] || 0) + 1;
                        if (CIVIC_BUILDINGS.includes(wanted.type)) {
                            const attempts = (noSiteAttempts.get(wanted.type) || 0) + 1;
                            noSiteAttempts.set(wanted.type, attempts);
                            if (attempts >= 3) campaignSkippedTypes.add(wanted.type);
                        }
                    } else {
                        const result = placeDirectBuilding(wanted.type, site.x, site.y);
                        if (result.ok) {
                            diagnostics.lastBuild = { tick: state.tick, type: wanted.type, x: site.x, y: site.y };
                        } else {
                            const key = result.reason || "placement-rejected";
                            diagnostics.buildFailures[key] = (diagnostics.buildFailures[key] || 0) + 1;
                            if (result.reason === "NO DELIVERY ROUTE") unreachableSites.add(wanted.type + ":" + site.x + ":" + site.y);
                        }
                    }
                }
            }
            // A construction site that does not change stage for a long time
            // is the exact class of dead-end this audit exists to expose.
            for (const site of sites) {
                const previous = siteHistory.get(site);
                const stage = site.construction?.stage;
                if (!previous || previous.stage !== stage) {
                    siteHistory.set(site, { stage, since: state.tick, reason: site.construction?.reason });
                    continue;
                }
                if (state.tick - previous.since > 600 && !diagnostics.stalledSites.some(row => row.id === site.id && row.since === previous.since)) {
                    diagnostics.stalledSites.push({
                        id: site.id, type: site.type, stage,
                        since: previous.since, reason: site.construction?.reason || null
                    });
                }
            }
        }

        if (state.year !== previousYear) {
            previousYear = state.year;
            if (state.year >= 6 && state.year !== lastHeirYear) {
                lastHeirYear = state.year;
                const heir = ensureHeir();
                diagnostics.lastHeir = { year: state.year, ...heir };
                diagnostics.heirAttempts.push(diagnostics.lastHeir);
            }
            if (answerProvincePetitions) answerPendingProvincePetitions(diagnostics);
            yearly.push(captureSnapshot());
        }
        if (typeof onTick === "function") onTick(state);
        if (state.gameOver) break;
    }

    // Force a final ambition evaluation even if the last 20-day cadence has
    // not elapsed, then snapshot the mature realm.
    try { state.ambitions.lastEvaluatedTick = 0; } catch { /* state normalisation below */ }
    updateSimulation();
    resolveActiveEvent();
    // `updateSimulation` above may create an issue at the final tick; give it
    // the same affordable-choice treatment before measuring.
    resolveActiveEvent();
    const final = captureSnapshot();

    // Measure the mature simulation cost over real ticks. This runs after the
    // campaign has all its buildings and residents, so it captures the deep
    // game rather than the opening village.
    const sampleStarted = performance.now();
    const measured = Math.max(1, Math.min(sampleTicks, 200));
    for (let index = 0; index < measured; index++) {
        updateSimulation();
        resolveActiveEvent();
        for (let step = 0; step < LOGISTICS_STEPS; step++) updateLogisticsMovement(LOGISTICS_DT);
    }
    const tickCostMs = (performance.now() - sampleStarted) / measured;
    const measuredFinal = captureSnapshot();

    const completedIds = Object.keys(state.ambitions?.completed || {});
    const orderedCompleted = AMBITIONS.map(ambition => ambition.id).filter(id => completedIds.includes(id));
    const lastYears = yearly.slice(-4);
    const stableFood = lastYears.every(mark => Number(mark.resources?.food) > 0 && Number(mark.foodShortage) <= 0);
    const stableFirewood = lastYears.every(mark => Number(mark.firewood) > 0);
    const allComplete = Boolean(getAmbitionSnapshot().allComplete);
    const eraSnapshot = getCrownEraSnapshot();
    const agendaStages = eraSnapshot?.agenda?.completed.length || 0;
    const agendaFeedback = Boolean(eraSnapshot?.agenda && (eraSnapshot.agenda.completed.length > 0) && (
        Number(eraSnapshot.agenda.modifiers.foodDemandFactor) < 1 ||
        Number(eraSnapshot.agenda.modifiers.taxEfficiency) > 1 ||
        Number(eraSnapshot.agenda.modifiers.tradeFactor) > 1 ||
        Number(eraSnapshot.agenda.modifiers.migrationFactor) > 1 ||
        Number(eraSnapshot.agenda.modifiers.unrestFactor) < 1 ||
        Number(eraSnapshot.agenda.modifiers.legitimacyYear) > 0
    ));
    const constructionComplete = measuredFinal.activeSites === 0;
    const noStalledSites = diagnostics.stalledSites.length === 0;
    const requirements = {
        allComplete,
        allIntermediate: orderedCompleted.length === AMBITIONS.length,
        eraChosen: Boolean(eraSnapshot),
        agendaStage: agendaStages >= campaignMinAgendaStages,
        agendaFeedback,
        population: measuredFinal.population >= 55,
        gold: measuredFinal.resources.gold >= 2000,
        morale: measuredFinal.morale >= 80,
        year: measuredFinal.year >= 25,
        food: stableFood,
        firewood: stableFirewood,
        tower: measuredFinal.towers >= 1,
        housing: measuredFinal.houses >= 16,
        farms: measuredFinal.farms >= 4,
        bakeries: measuredFinal.bakeries >= 3,
        mills: measuredFinal.mills >= 3,
        construction: constructionComplete,
        built: measuredFinal.built >= 12,
        events: measuredFinal.eventsResolved >= 12,
        notOver: !state.gameOver,
        noStalls: noStalledSites
    };
    const ok = Object.values(requirements).every(Boolean);

    // Forest types are derived, not saved, so this scan is also a proof that
    // the mature campaign still resolves a type for every woodland tile after
    // twenty-five years of growth, harvest and succession.
    const forestCounts = {};
    let forestTiles = 0, untypedForestTiles = 0;
    const width = Number(state.worldW) || 0, height = Number(state.worldH) || 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            forestTiles++;
            const id = node.forestRegionalType || "untyped";
            if (id === "untyped") untypedForestTiles++;
            forestCounts[id] = (forestCounts[id] || 0) + 1;
        }
    }
    const forestTypes = {
        tiles: forestTiles,
        untyped: untypedForestTiles,
        observed: REGIONAL_FOREST_TYPE_IDS.filter(id => forestCounts[id] > 0),
        missing: REGIONAL_FOREST_TYPE_IDS.filter(id => !forestCounts[id]),
        counts: forestCounts,
    };
    // Regional timber is a real economy stream. Report what the twenty-five
    // years actually produced and what is still sitting in the stores, so a
    // green campaign cannot hide a recipe that never ran.
    const physicalStock = getPhysicalStockMap();
    const timberStock = Object.fromEntries(REGIONAL_TIMBERS.map(timber => [timber.id, Number(physicalStock[timber.id]) || 0]));
    const timberEconomy = {
        produced: Math.max(0, Math.round(Number(state.economy?.productionChains?.regionalTimberProduced) || 0)),
        stored: Object.values(timberStock).reduce((sum, value) => sum + value, 0),
        kinds: Object.values(timberStock).filter(value => value > 0).length,
        stock: timberStock,
    };

    return {
        ok,
        seed: state.worldSeed,
        profile: campaignProfile,
        years,
        totalTicks,
        elapsedMs: round(performance.now() - started, 1),
        tickCostMs: round(tickCostMs, 3),
        finalYear: measuredFinal.year,
        requirements,
        completedIds,
        orderedCompleted,
        final: measuredFinal,
        initial: yearly[0],
        yearly,
        diagnostics,
        forestTypes,
        forestLegacy: state.forestLegacy ? {
            stats: { ...state.forestLegacy.stats },
            climate: { ...state.forestLegacy.climate },
            regions: state.forestLegacy.regions.map(region => ({
                id: region.id, typeId: region.typeId, phase: region.phase,
                canopy: region.canopy, living: region.species.filter(species => species.status === "living").length,
                extinct: region.species.filter(species => species.status === "extinct").length,
                hazards: Object.values(region.hazards).filter(hazard => hazard.year > 0).length,
                rings: region.rings.length,
            })),
        } : null,
        timberEconomy,
        gameOver: Boolean(state.gameOver),
        ambition: getAmbitionSnapshot(),
        era: eraSnapshot,
        agendaStages,
        campaignEra,
        roads: measuredFinal.roads,
        warehouse: getWarehouseSnapshot(),
        population: population()
    };
}
