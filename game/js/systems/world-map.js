// The world beyond the realm: a schematic map of the four neighbouring
// regions, standing trade routes and the frontiers between them.
//
// This is deliberately not a second map renderer or a second economy. Seats are
// the existing settlement owners, regions are the existing diplomatic realms,
// prices and partner stock come from the existing market, and every annual
// caravan writes the same partner stock/treasury and the same realm relation
// ledger the manual trade and the annual trade agreements already use. The
// whole layer settles once per year: no per-tick or per-frame work is added.
import { state } from "../core/state.js";
import { DIPLOMATIC_REALMS } from "./diplomacy-config.js";
import { recordTradeInfluence } from "./diplomacy-trade.js";
import { getCrownDread, getFrontierPressure } from "./crown-dread.js";
import {
    getSettlementSeats, SETTLEMENT_STORE_LIMIT, SETTLEMENT_TREASURY_LIMIT
} from "./settlement-owners.js";
import { BASE_PRICES } from "./market.js";
import { addResource } from "./resources.js";
import { addLog } from "./events.js";
import { getDataPackRegionLabel } from "../core/data-packs.js";
import {
    CROWN_OWNER_ID, WORLD_REGION_CATALOG, regionDefinitionFor, regionIsKnown
} from "../world/world-regions.js";

export const WORLD_MAP_VERSION = 2;
export const REGION_CLAIM_COST = Object.freeze({ gold: 24, food: 8 });
export const REGION_CONTROL_MAX = 100;
export const REGION_CONTESTED_BELOW = 38;
export const REGION_SECURE_ABOVE = 48;
export const REGION_FLIP_BELOW = 12;
export const TRADE_ROUTE_LIMIT = 6;
export const TRADE_ROUTE_LOT = 6;
export const TRADE_ROUTE_COST = Object.freeze({ gold: 15, wood: 8 });
export const FRONTIER_WATCH_LIMIT = 3;
export const FRONTIER_WATCH_COST = 12;
export const FRONTIER_INCIDENT_PRESSURE = 58;
export const FRONTIER_INCIDENT_CERTAIN = 75;
export const WORLD_ROUTE_HISTORY_LIMIT = 24;

// Compass anchors give the schematic its geography without a second terrain
// pass. The four canonical realms keep their named directions; an unknown id
// falls back to a stable circle position.
export const WORLD_REGION_ANCHORS = Object.freeze({
    northmere: Object.freeze({ x: 0.50, y: 0.09 }),
    ironvale: Object.freeze({ x: 0.91, y: 0.50 }),
    goldcoast: Object.freeze({ x: 0.50, y: 0.91 }),
    redpass: Object.freeze({ x: 0.09, y: 0.50 })
});

const REALM_BY_ID = new Map(DIPLOMATIC_REALMS.map(realm => [realm.id, realm]));
const RESOURCES = Object.freeze(["wood", "stone", "food"]);
const DIRECTIONS = Object.freeze(["import", "export"]);
const BAND_BY_ID = Object.freeze({
    calm: Object.freeze({ id: "calm", label: "CALM" }),
    watchful: Object.freeze({ id: "watchful", label: "WATCHFUL" }),
    tense: Object.freeze({ id: "tense", label: "TENSE" }),
    contested: Object.freeze({ id: "contested", label: "CONTESTED" })
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, min = 0, max = 1_000_000_000) =>
    Math.max(min, Math.min(max, Math.floor(finite(value, min))));
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, finite(value, min)));
const text = (value, limit = 80) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const yearOf = value => Math.max(0, Math.floor(finite(value)));

function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function frontierBand(pressure) {
    const value = clamp(pressure);
    if (value >= 65) return BAND_BY_ID.contested;
    if (value >= 45) return BAND_BY_ID.tense;
    if (value >= 25) return BAND_BY_ID.watchful;
    return BAND_BY_ID.calm;
}

export function regionAnchorFor(realmId, index = 0) {
    const named = WORLD_REGION_ANCHORS[realmId];
    if (named) return { ...named };
    const angle = (Math.PI * 2 * index) / Math.max(1, DIPLOMATIC_REALMS.length) - Math.PI / 2;
    return {
        x: Math.round((0.5 + Math.cos(angle) * 0.41) * 1000) / 1000,
        y: Math.round((0.5 + Math.sin(angle) * 0.41) * 1000) / 1000
    };
}

function defaultFrontier(realmId) {
    return {
        realmId,
        pressure: 0,
        watch: 0,
        relief: 0,
        incidents: 0,
        lastIncidentYear: 0,
        updatedYear: 0
    };
}

function defaultRegion(definition) {
    return {
        id: definition.id,
        ownerId: definition.ownerId,
        control: definition.control,
        loyalty: definition.loyalty,
        garrison: definition.garrison,
        contestedBy: null,
        lastChangeYear: 0,
        changes: 0
    };
}

export function createWorldMapState() {
    return {
        version: WORLD_MAP_VERSION,
        lastUpdateYear: 0,
        lastRegionClaimYear: 0,
        routes: [],
        frontiers: DIPLOMATIC_REALMS.map(realm => defaultFrontier(realm.id)),
        regions: WORLD_REGION_CATALOG.map(defaultRegion),
        history: [],
        totals: {
            routesOpened: 0,
            delivered: 0,
            earned: 0,
            spent: 0,
            incidents: 0,
            stalls: 0,
            regionYield: 0,
            regionChanges: 0,
            provinceClaims: 0
        }
    };
}

function normalizeFrontier(input, realmId) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
        realmId,
        pressure: Math.round(clamp(source.pressure)),
        watch: Math.round(clamp(source.watch, 0, FRONTIER_WATCH_LIMIT)),
        // A recent raid spends the raiders' strength for a year or two.
        relief: Math.round(clamp(source.relief, 0, 24)),
        incidents: integer(source.incidents, 0, 9999),
        lastIncidentYear: yearOf(source.lastIncidentYear),
        updatedYear: yearOf(source.updatedYear)
    };
}

function normalizeRegion(input, definition) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const ownerId = source.ownerId === CROWN_OWNER_ID || REALM_BY_ID.has(text(source.ownerId, 40))
        ? source.ownerId
        : definition.ownerId;
    const contestedBy = text(source.contestedBy, 40);
    return {
        id: definition.id,
        ownerId,
        control: Math.round(clamp(source.control ?? definition.control, 0, REGION_CONTROL_MAX)),
        loyalty: Math.round(clamp(source.loyalty ?? definition.loyalty)),
        garrison: Math.round(clamp(source.garrison ?? definition.garrison, 0, 10)),
        contestedBy: contestedBy && contestedBy !== ownerId && (contestedBy === CROWN_OWNER_ID || REALM_BY_ID.has(contestedBy))
            ? contestedBy : null,
        lastChangeYear: yearOf(source.lastChangeYear),
        changes: integer(source.changes, 0, 9999)
    };
}

function routeIdFor(seatId, realmId, resource, direction) {
    return ("route:" + seatId + ":" + realmId + ":" + resource + ":" + direction).slice(0, 180);
}

function normalizeRoute(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const realmId = text(input.realmId, 40);
    if (!REALM_BY_ID.has(realmId)) return null;
    const seatId = text(input.seatId, 80);
    if (!seatId) return null;
    const resource = RESOURCES.includes(input.resource) ? input.resource : "";
    const direction = DIRECTIONS.includes(input.direction) ? input.direction : "";
    if (!resource || !direction) return null;
    return {
        id: text(input.id, 180) || routeIdFor(seatId, realmId, resource, direction),
        seatId,
        realmId,
        resource,
        direction,
        sinceYear: Math.max(1, yearOf(input.sinceYear) || 1),
        lastSettledYear: yearOf(input.lastSettledYear),
        delivered: integer(input.delivered),
        earned: integer(input.earned),
        goldSpent: integer(input.goldSpent),
        stalls: integer(input.stalls, 0, 9999),
        lastResult: text(input.lastResult, 140)
    };
}

function normalizeHistoryEntry(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const summary = text(input.summary, 180);
    if (!summary) return null;
    const realmId = text(input.realmId, 40);
    return {
        year: yearOf(input.year),
        tick: integer(input.tick),
        kind: text(input.kind, 24) || "world",
        ...(realmId ? { realmId } : {}),
        summary
    };
}

export function normalizeWorldMapSnapshot(input) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const seenRoutes = new Set();
    const routes = [];
    for (const raw of Array.isArray(source.routes) ? source.routes : []) {
        const route = normalizeRoute(raw);
        if (!route) continue;
        // One physical caravan per depot, region, good and direction. A forged
        // or duplicated save row cannot stack two identical routes in a slot.
        const key = route.seatId + "|" + route.realmId + "|" + route.resource + "|" + route.direction;
        if (seenRoutes.has(key)) continue;
        seenRoutes.add(key);
        routes.push(route);
        if (routes.length >= TRADE_ROUTE_LIMIT) break;
    }
    const savedFrontiers = new Map(
        (Array.isArray(source.frontiers) ? source.frontiers : [])
            .filter(row => row && typeof row === "object" && !Array.isArray(row))
            .map(row => [text(row.realmId, 40), row])
    );
    const savedRegions = new Map(
        (Array.isArray(source.regions) ? source.regions : [])
            .filter(row => row && typeof row === "object" && !Array.isArray(row))
            .map(row => [text(row.id, 40), row])
    );
    return {
        version: WORLD_MAP_VERSION,
        lastUpdateYear: yearOf(source.lastUpdateYear),
        lastRegionClaimYear: yearOf(source.lastRegionClaimYear),
        routes,
        frontiers: DIPLOMATIC_REALMS.map(realm => normalizeFrontier(savedFrontiers.get(realm.id), realm.id)),
        regions: WORLD_REGION_CATALOG.map(definition => normalizeRegion(savedRegions.get(definition.id), definition)),
        history: (Array.isArray(source.history) ? source.history : [])
            .map(normalizeHistoryEntry).filter(Boolean).slice(0, WORLD_ROUTE_HISTORY_LIMIT),
        totals: {
            routesOpened: integer(source.totals?.routesOpened),
            delivered: integer(source.totals?.delivered),
            earned: integer(source.totals?.earned),
            spent: integer(source.totals?.spent),
            incidents: integer(source.totals?.incidents, 0, 9999),
            stalls: integer(source.totals?.stalls, 0, 9999),
            regionYield: integer(source.totals?.regionYield),
            regionChanges: integer(source.totals?.regionChanges, 0, 9999),
            provinceClaims: integer(source.totals?.provinceClaims, 0, 9999)
        }
    };
}

export function validateWorldMapSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Save data contains an invalid world map state.");
    }
    const version = Number(snapshot.version);
    if (version !== 1 && version !== WORLD_MAP_VERSION) {
        throw new Error("Save data contains an unsupported world map version.");
    }
    if (snapshot.routes !== undefined && (!Array.isArray(snapshot.routes) || snapshot.routes.length > TRADE_ROUTE_LIMIT)) {
        throw new Error("Save data contains an invalid trade route list.");
    }
    for (const [index, route] of (snapshot.routes || []).entries()) {
        if (!route || typeof route !== "object" || Array.isArray(route)) {
            throw new Error("Save data contains an invalid trade route at position " + index + ".");
        }
        if (!text(route.seatId, 80) || !REALM_BY_ID.has(text(route.realmId, 40)) ||
            !RESOURCES.includes(route.resource) || !DIRECTIONS.includes(route.direction)) {
            throw new Error("Save data contains an incomplete trade route at position " + index + ".");
        }
    }
    if (snapshot.history !== undefined && (!Array.isArray(snapshot.history) || snapshot.history.length > WORLD_ROUTE_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid world map history.");
    }
    if (snapshot.regions !== undefined) {
        if (!Array.isArray(snapshot.regions) || snapshot.regions.length > WORLD_REGION_CATALOG.length) {
            throw new Error("Save data contains an invalid province list.");
        }
        const seen = new Set();
        for (const [index, region] of snapshot.regions.entries()) {
            if (!region || typeof region !== "object" || Array.isArray(region)) {
                throw new Error("Save data contains an invalid province at position " + index + ".");
            }
            const id = text(region.id, 40);
            if (!regionIsKnown(id) || seen.has(id)) {
                throw new Error("Save data contains an unknown or duplicate province id.");
            }
            seen.add(id);
            const ownerId = text(region.ownerId, 40);
            if (ownerId !== CROWN_OWNER_ID && !REALM_BY_ID.has(ownerId)) {
                throw new Error("Save data contains an unknown province owner.");
            }
            if (!Number.isFinite(Number(region.control)) || Number(region.control) < 0 || Number(region.control) > REGION_CONTROL_MAX ||
                !Number.isFinite(Number(region.loyalty)) || Number(region.loyalty) < 0 || Number(region.loyalty) > 100 ||
                !Number.isFinite(Number(region.garrison)) || Number(region.garrison) < 0 || Number(region.garrison) > 10) {
                throw new Error("Save data contains an invalid province control record.");
            }
        }
    }
    return true;
}

export function ensureWorldMap() {
    const current = state.worldMap;
    if (!current || typeof current !== "object" || Array.isArray(current) ||
        current.version !== WORLD_MAP_VERSION || !Array.isArray(current.routes) ||
        !Array.isArray(current.frontiers) || !Array.isArray(current.regions) ||
        current.regions.length !== WORLD_REGION_CATALOG.length) {
        state.worldMap = normalizeWorldMapSnapshot(current);
    }
    return state.worldMap;
}

function frontierEntry(map, realmId) {
    let entry = map.frontiers.find(row => row.realmId === realmId);
    if (!entry) {
        entry = defaultFrontier(realmId);
        map.frontiers.push(entry);
    }
    return entry;
}

function regionEntry(map, regionId) {
    return map.regions.find(row => row.id === regionId) || null;
}

function regionDisplayName(regionId, fallback) {
    return getDataPackRegionLabel(regionId) || fallback;
}

function crownKingdomName() {
    return text(state.identity?.kingdomName || state.kingdomName || "The Crown", 60) || "The Crown";
}

function crownRulerName() {
    const king = (state.entities || []).find(entity => entity && !entity.dead && entity.isKing);
    return text(king?.name || king?.person?.name || "The Sovereign", 80) || "The Sovereign";
}

function regionOwnerName(ownerId) {
    if (ownerId === CROWN_OWNER_ID) return crownKingdomName();
    return REALM_BY_ID.get(ownerId)?.name || "Unclaimed";
}

function regionYieldFor(region, definition) {
    const factor = 0.55 + clamp(region.control, 0, REGION_CONTROL_MAX) / 200 + clamp(region.loyalty) / 400;
    return Math.max(1, Math.round(definition.baseYield * factor));
}

function adjacentCrownCount(region, map) {
    const definition = regionDefinitionFor(region.id);
    if (!definition) return 0;
    return definition.neighbours.filter(id => regionEntry(map, id)?.ownerId === CROWN_OWNER_ID).length;
}

const REGION_CLAIM_REASONS = Object.freeze({
    "crown-province": "Already held by the crown",
    "no-crown-border": "No crown province shares this border",
    "unknown-owner": "The province has no known kingdom",
    "alliance-holds-the-border": "An alliance protects this border",
    "trade-pact-holds-the-border": "A trade pact protects this border",
    "relation-too-high": "The court will not press a friendly border",
    "claim-already-pressed": "One claim can be pressed each year",
    "not-enough-gold": "The crown treasury is short",
    "not-enough-food": "The royal granary is short"
});

function regionClaimReadiness(region, map) {
    const definition = regionDefinitionFor(region.id);
    if (!definition) return { ok: false, reason: "unknown-owner", reasonLabel: REGION_CLAIM_REASONS["unknown-owner"] };
    if (region.ownerId === CROWN_OWNER_ID) {
        return { ok: false, reason: "crown-province", reasonLabel: REGION_CLAIM_REASONS["crown-province"] };
    }
    if (adjacentCrownCount(region, map) === 0) {
        return { ok: false, reason: "no-crown-border", reasonLabel: REGION_CLAIM_REASONS["no-crown-border"] };
    }
    const realm = realmState(region.ownerId);
    if (!realm) return { ok: false, reason: "unknown-owner", reasonLabel: REGION_CLAIM_REASONS["unknown-owner"] };
    if (realm.treaty === "alliance") {
        return { ok: false, reason: "alliance-holds-the-border", reasonLabel: REGION_CLAIM_REASONS["alliance-holds-the-border"] };
    }
    if (realm.treaty === "trade") {
        return { ok: false, reason: "trade-pact-holds-the-border", reasonLabel: REGION_CLAIM_REASONS["trade-pact-holds-the-border"] };
    }
    if (realm.treaty !== "war" && realm.relation >= 55) {
        return { ok: false, reason: "relation-too-high", reasonLabel: REGION_CLAIM_REASONS["relation-too-high"] };
    }
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    if (map.lastRegionClaimYear >= year) {
        return { ok: false, reason: "claim-already-pressed", reasonLabel: REGION_CLAIM_REASONS["claim-already-pressed"] };
    }
    if ((Number(state.resources?.gold) || 0) < REGION_CLAIM_COST.gold) {
        return { ok: false, reason: "not-enough-gold", reasonLabel: REGION_CLAIM_REASONS["not-enough-gold"] };
    }
    if ((Number(state.resources?.food) || 0) < REGION_CLAIM_COST.food) {
        return { ok: false, reason: "not-enough-food", reasonLabel: REGION_CLAIM_REASONS["not-enough-food"] };
    }
    const war = realm.treaty === "war";
    const chance = Math.max(5, Math.min(92, Math.round(
        28 + (REGION_CONTROL_MAX - region.control) * 0.45 + (war ? 18 : 0) +
        adjacentCrownCount(region, map) * 4 - region.garrison * 4 + (region.loyalty < 45 ? 6 : 0)
    )));
    return { ok: true, chance, cost: REGION_CLAIM_COST };
}

function regionSnapshot(region, map) {
    const definition = regionDefinitionFor(region.id);
    const readiness = regionClaimReadiness(region, map);
    return {
        id: region.id,
        name: regionDisplayName(region.id, definition.name),
        description: definition.description,
        terrain: definition.terrain,
        resource: definition.resource,
        baseYield: definition.baseYield,
        yield: regionYieldFor(region, definition),
        ownerId: region.ownerId,
        ownerName: regionOwnerName(region.ownerId),
        ownerKind: region.ownerId === CROWN_OWNER_ID ? "crown" : "realm",
        control: Math.round(region.control),
        loyalty: Math.round(region.loyalty),
        garrison: Math.round(region.garrison),
        contestedBy: region.contestedBy,
        contestedName: region.contestedBy ? regionOwnerName(region.contestedBy) : null,
        contested: Boolean(region.contestedBy),
        lastChangeYear: region.lastChangeYear,
        changes: region.changes,
        anchor: { ...definition.anchor },
        neighbours: definition.neighbours.map(id => ({
            id,
            name: regionDisplayName(id, regionDefinitionFor(id)?.name || id),
            ownerId: regionEntry(map, id)?.ownerId || null
        })),
        adjacentCrown: adjacentCrownCount(region, map),
        canClaim: readiness.ok,
        claimReason: readiness.reason || null,
        claimReasonLabel: readiness.reasonLabel || null,
        claimChance: readiness.chance || 0,
        claimCost: REGION_CLAIM_COST
    };
}

function provincePressureFor(realmId, map) {
    return map.regions.reduce((sum, region) => {
        if (region.ownerId !== realmId) return sum;
        return sum + (region.contestedBy ? 4 : 0) + (region.control < 35 ? 2 : 0);
    }, 0);
}

function seatById(seatId) {
    return getSettlementSeats().find(seat => seat.buildingId === seatId || seat.id === seatId) || null;
}

function realmState(realmId) {
    return (Array.isArray(state.diplomacy?.realms) ? state.diplomacy.realms : [])
        .find(realm => realm && realm.id === realmId) || null;
}

function partnerState(realmId) {
    return (Array.isArray(state.market?.partners) ? state.market.partners : [])
        .find(partner => partner && partner.id === realmId) || null;
}

function priceOf(resource) {
    const live = Number(state.market?.prices?.[resource]);
    const fallback = Number(BASE_PRICES[resource]) || 1;
    return live > 0 ? live : fallback;
}

function lotCost(resource) {
    return Math.max(1, Math.ceil(priceOf(resource) * TRADE_ROUTE_LOT * 0.9));
}

function lotPayout(resource) {
    return Math.max(1, Math.floor(priceOf(resource) * TRADE_ROUTE_LOT * 0.7));
}

function routeStatus(route, seat, realm) {
    if (!seat) return "abandoned";
    if (!realm || realm.treaty === "war") return "closed";
    if (route.direction === "import") {
        if ((Number(state.resources?.gold) || 0) < lotCost(route.resource)) return "unfunded";
        if (route.resource !== "food" &&
            (Number(seat.stores?.[route.resource]) || 0) + TRADE_ROUTE_LOT > SETTLEMENT_STORE_LIMIT) return "depot-full";
        const partner = partnerState(route.realmId);
        if (!partner || (Number(partner.stock?.[route.resource]) || 0) < TRADE_ROUTE_LOT) return "no-stock";
        return "open";
    }
    if (route.resource === "food") {
        if ((Number(state.resources?.food) || 0) < TRADE_ROUTE_LOT) return "depot-short";
    } else if ((Number(seat.stores?.[route.resource]) || 0) < TRADE_ROUTE_LOT) {
        return "depot-short";
    }
    const partner = partnerState(route.realmId);
    if (!partner || (Number(partner.treasury) || 0) < lotPayout(route.resource)) return "no-buyer";
    return "open";
}

const STATUS_LABELS = Object.freeze({
    open: "CARAVAN READY",
    closed: "CLOSED BY WAR",
    unfunded: "CROWN TREASURY SHORT",
    "no-stock": "PARTNER OUT OF STOCK",
    "depot-short": "SETTLEMENT DEPOT SHORT",
    "depot-full": "SETTLEMENT DEPOT FULL",
    "no-buyer": "PARTNER CANNOT PAY",
    abandoned: "SETTLEMENT LOST"
});

// Seat positions are drawn in a padded 0..1 box derived from the real world
// coordinates. With one seat the settlement sits in the centre of the map.
function normalizedSeats(seats = getSettlementSeats()) {
    if (!seats.length) return [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const seat of seats) {
        minX = Math.min(minX, seat.x);
        maxX = Math.max(maxX, seat.x);
        minY = Math.min(minY, seat.y);
        maxY = Math.max(maxY, seat.y);
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const nx = seat => maxX === minX ? 0.5 : 0.16 + ((seat.x - minX) / spanX) * 0.68;
    const ny = seat => maxY === minY ? 0.5 : 0.16 + ((seat.y - minY) / spanY) * 0.68;
    return seats.map(seat => ({
        id: seat.buildingId,
        seatId: seat.id,
        // The live owner is used by the frontier raid so the theft reaches the
        // real settlement stores instead of the presentation copy.
        live: seat,
        name: seat.name,
        x: Math.round(nx(seat) * 1000) / 1000,
        y: Math.round(ny(seat) * 1000) / 1000,
        worldX: seat.x,
        worldY: seat.y,
        stores: { wood: Math.max(0, finite(seat.stores?.wood)), stone: Math.max(0, finite(seat.stores?.stone)) },
        treasury: { gold: Math.max(0, finite(seat.treasury?.gold)) }
    }));
}

function nearbySeats(seats, anchor) {
    const reach = 0.27;
    let count = 0;
    let nearest = null;
    for (const seat of seats) {
        const distance = Math.hypot(seat.x - anchor.x, seat.y - anchor.y);
        if (distance <= reach) count++;
        if (!nearest || distance < nearest.distance) nearest = { seat, distance };
    }
    return { count, nearest };
}

export function frontierPressureFor(realm, seats, watch = 0, routeCount = 0, relief = 0, provincePressure = 0) {
    const line = realmState(realm.id);
    const treaty = line?.treaty || "none";
    const anchor = regionAnchorFor(realm.id, DIPLOMATIC_REALMS.indexOf(realm));
    const near = nearbySeats(seats, anchor);
    const levy = getFrontierPressure();
    const dread = getCrownDread();
    let pressure = 18;
    pressure += treaty === "war" ? 42 : treaty === "none" ? 18 : treaty === "trade" ? 7 : 1;
    pressure += Math.max(0, 45 - clamp(line?.relation ?? realm.baseRelation)) * 0.5;
    pressure += Math.max(0, 40 - clamp(line?.trust ?? realm.baseTrust)) * 0.2;
    pressure -= near.count * 3;
    pressure -= clamp(watch, 0, FRONTIER_WATCH_LIMIT) * 9;
    pressure -= Math.min(10, Math.max(0, routeCount) * 3);
    pressure -= clamp(relief, 0, 24);
    pressure -= clamp(dread.dread, 0, 100) * 0.1;
    pressure += Math.max(0, finite(levy.percent)) * 0.35;
    pressure += clamp(provincePressure, 0, 20);
    return {
        pressure: Math.round(clamp(pressure)),
        band: frontierBand(pressure),
        nearby: near.count,
        nearestSeat: near.nearest?.seat || null,
        distance: near.nearest ? Math.round(near.nearest.distance * 1000) / 1000 : null,
        anchor
    };
}

function liveRealmRow(realm, seats, map, year) {
    const line = realmState(realm.id);
    const anchor = regionAnchorFor(realm.id, DIPLOMATIC_REALMS.indexOf(realm));
    const entry = map.frontiers.find(row => row.realmId === realm.id) || defaultFrontier(realm.id);
    const routes = map.routes.filter(route => route.realmId === realm.id);
    const active = routes.filter(route => routeStatus(route, seatById(route.seatId), line) === "open").length;
    const routeDelivered = routes.reduce((sum, route) => sum + Math.max(0, Number(route.delivered) || 0), 0);
    const computed = frontierPressureFor(realm, seats, entry.watch, active, entry.relief, provincePressureFor(realm.id, map));
    const provinces = map.regions.filter(region => region.ownerId === realm.id);
    return {
        id: realm.id,
        name: realm.name,
        region: realm.region,
        specialty: realm.specialty,
        ruler: realm.ruler,
        treaty: line?.treaty || "none",
        relation: Math.round(clamp(line?.relation ?? realm.baseRelation)),
        trust: Math.round(clamp(line?.trust ?? realm.baseTrust)),
        fear: Math.round(clamp(line?.fear ?? realm.baseFear)),
        anchor: computed.anchor,
        pressure: computed.pressure,
        band: computed.band.id,
        bandLabel: computed.band.label,
        watch: entry.watch,
        incidents: entry.incidents,
        lastIncidentYear: entry.lastIncidentYear,
        updatedYear: entry.updatedYear,
        nearby: computed.nearby,
        nearestSeat: computed.nearestSeat ? { id: computed.nearestSeat.seatId, name: computed.nearestSeat.name } : null,
        routes: routes.length,
        activeRoutes: active,
        routeDelivered: integer(routeDelivered),
        tradeVolume: integer(line?.tradeVolume),
        provinces: provinces.length,
        contestedProvinces: provinces.filter(region => region.contestedBy).length,
        provincePressure: provincePressureFor(realm.id, map),
        year
    };
}

export function getWorldMapSnapshot() {
    const map = ensureWorldMap();
    const year = Math.max(0, Math.floor(Number(state.year) || 0));
    const seats = normalizedSeats();
    const realms = DIPLOMATIC_REALMS.map(realm => liveRealmRow(realm, seats, map, year));
    const routes = map.routes.map(route => {
        const seat = seatById(route.seatId);
        const line = realmState(route.realmId);
        const definition = REALM_BY_ID.get(route.realmId);
        const status = routeStatus(route, seat, line);
        return {
            ...route,
            seatName: seat?.name || "Lost settlement",
            realmName: definition?.name || route.realmId,
            region: definition?.region || "Unknown region",
            status,
            statusLabel: STATUS_LABELS[status] || "UNKNOWN",
            lot: TRADE_ROUTE_LOT,
            price: priceOf(route.resource),
            cost: lotCost(route.resource),
            payout: lotPayout(route.resource)
        };
    });
    const regions = map.regions.map(region => regionSnapshot(region, map));
    const kingdoms = [{
        id: CROWN_OWNER_ID,
        name: crownKingdomName(),
        ruler: crownRulerName(),
        isCrown: true,
        regionCount: regions.filter(region => region.ownerId === CROWN_OWNER_ID).length,
        control: regions.filter(region => region.ownerId === CROWN_OWNER_ID).reduce((sum, region) => sum + region.control, 0),
        contested: regions.filter(region => region.ownerId === CROWN_OWNER_ID && region.contested).length
    }, ...DIPLOMATIC_REALMS.map(realm => {
        const owned = regions.filter(region => region.ownerId === realm.id);
        return {
            id: realm.id,
            name: realm.name,
            ruler: realm.ruler,
            isCrown: false,
            regionCount: owned.length,
            control: owned.reduce((sum, region) => sum + region.control, 0),
            contested: owned.filter(region => region.contested).length
        };
    })].map(kingdom => ({
        ...kingdom,
        control: kingdom.regionCount ? Math.round(kingdom.control / kingdom.regionCount) : 0
    }));
    const totals = {
        ...map.totals,
        activeRoutes: routes.filter(route => route.status === "open").length,
        closedRoutes: routes.filter(route => route.status === "closed").length,
        stallRoutes: routes.filter(route => !["open", "closed"].includes(route.status)).length,
        watchLevels: map.frontiers.reduce((sum, row) => sum + row.watch, 0),
        crownProvinces: regions.filter(region => region.ownerId === CROWN_OWNER_ID).length,
        contestedProvinces: regions.filter(region => region.contested).length,
        annualYield: regions.filter(region => region.ownerId === CROWN_OWNER_ID).reduce((sum, region) => sum + region.yield, 0)
    };
    return {
        version: WORLD_MAP_VERSION,
        year,
        lastUpdateYear: map.lastUpdateYear,
        // The live owner reference is used only by the annual raid pass; the
        // player-facing snapshot carries plain data.
        seats: seats.map(({ live, ...seat }) => seat),
        realms,
        regions,
        kingdoms,
        routes,
        totals,
        history: map.history.slice(0, 12),
        costs: { route: TRADE_ROUTE_COST, watch: FRONTIER_WATCH_COST, lot: TRADE_ROUTE_LOT, claim: REGION_CLAIM_COST },
        limits: { routes: TRADE_ROUTE_LIMIT, watch: FRONTIER_WATCH_LIMIT, provinces: WORLD_REGION_CATALOG.length },
        regionAction: {
            lastClaimYear: map.lastRegionClaimYear,
            oneClaimPerYear: true
        },
        inventory: {
            wood: Math.max(0, finite(state.resources?.wood)),
            stone: Math.max(0, finite(state.resources?.stone)),
            gold: Math.max(0, finite(state.resources?.gold)),
            food: Math.max(0, finite(state.resources?.food))
        },
        ready: seats.length > 0
    };
}

function record(map, kind, summary, realmId = null) {
    map.history.unshift({
        year: Math.max(1, Math.floor(Number(state.year) || 1)),
        tick: Math.max(0, Math.floor(Number(state.tick) || 0)),
        kind,
        ...(realmId ? { realmId } : {}),
        summary
    });
    if (map.history.length > WORLD_ROUTE_HISTORY_LIMIT) map.history.length = WORLD_ROUTE_HISTORY_LIMIT;
}

export function openTradeRoute(seatId, realmId, resource, direction) {
    const map = ensureWorldMap();
    const seat = seatById(text(seatId, 80));
    if (!seat) return { ok: false, reason: "no-royal-seat" };
    const definition = REALM_BY_ID.get(text(realmId, 40));
    if (!definition) return { ok: false, reason: "unknown-region" };
    if (!RESOURCES.includes(resource)) return { ok: false, reason: "unknown-resource" };
    if (!DIRECTIONS.includes(direction)) return { ok: false, reason: "unknown-direction" };
    const line = realmState(definition.id);
    if (line?.treaty === "war") return { ok: false, reason: "war-closes-the-route" };
    if (map.routes.length >= TRADE_ROUTE_LIMIT) return { ok: false, reason: "route-limit-reached" };
    const id = routeIdFor(seat.buildingId, definition.id, resource, direction);
    if (map.routes.some(route => route.id === id)) return { ok: false, reason: "route-already-open" };
    if ((Number(state.resources?.gold) || 0) < TRADE_ROUTE_COST.gold) return { ok: false, reason: "not-enough-gold" };
    if ((Number(state.resources?.wood) || 0) < TRADE_ROUTE_COST.wood) return { ok: false, reason: "not-enough-wood" };
    addResource("gold", -TRADE_ROUTE_COST.gold);
    addResource("wood", -TRADE_ROUTE_COST.wood);
    const route = {
        id,
        seatId: seat.buildingId,
        realmId: definition.id,
        resource,
        direction,
        sinceYear: Math.max(1, Math.floor(Number(state.year) || 1)),
        lastSettledYear: 0,
        delivered: 0,
        earned: 0,
        goldSpent: 0,
        stalls: 0,
        lastResult: "Chartered; the first caravan departs at the next year boundary."
    };
    map.routes.push(route);
    map.totals.routesOpened += 1;
    if (line && line.treaty !== "war") line.relation = clamp((Number(line.relation) || 0) + 0.6);
    record(map, "route-opened", (direction === "import" ? "Import" : "Export") + " route opened from " +
        seat.name + " to " + definition.region + " for " + resource, definition.id);
    addLog("TRADE ROUTE OPENED · " + seat.name.toUpperCase() + " ↔ " + definition.region.toUpperCase(), "#a5d6a7", "trade");
    return {
        ok: true,
        message: "Trade route opened: " + seat.name + " ↔ " + definition.region + " (" + direction + " " + resource + ")",
        route
    };
}

export function closeTradeRoute(routeId) {
    const map = ensureWorldMap();
    const index = map.routes.findIndex(route => route.id === routeId);
    if (index < 0) return { ok: false, reason: "route-not-found" };
    const [route] = map.routes.splice(index, 1);
    const definition = REALM_BY_ID.get(route.realmId);
    record(map, "route-closed", "Route to " + (definition?.region || route.realmId) + " closed", route.realmId);
    addLog("TRADE ROUTE CLOSED · " + (definition?.region || route.realmId).toUpperCase(), "#d8a38a", "trade");
    return { ok: true, message: "Trade route to " + (definition?.region || route.realmId) + " closed" };
}

export function setFrontierWatch(realmId, level) {
    const map = ensureWorldMap();
    const definition = REALM_BY_ID.get(text(realmId, 40));
    if (!definition) return { ok: false, reason: "unknown-region" };
    const entry = frontierEntry(map, definition.id);
    const next = Math.round(clamp(level, 0, FRONTIER_WATCH_LIMIT));
    if (next === entry.watch) return { ok: false, reason: "watch-already-set" };
    const added = Math.max(0, next - entry.watch);
    const cost = added * FRONTIER_WATCH_COST;
    if (cost > 0 && (Number(state.resources?.gold) || 0) < cost) return { ok: false, reason: "not-enough-gold" };
    if (cost > 0) addResource("gold", -cost);
    entry.watch = next;
    const detail = next === 0
        ? "Frontier watch withdrawn from " + definition.region
        : "Frontier watch raised to " + next + "/" + FRONTIER_WATCH_LIMIT + " at " + definition.region;
    record(map, "frontier-watch", detail, definition.id);
    addLog(detail.toUpperCase(), next === 0 ? "#d8a38a" : "#9fc5e8", "frontier");
    return { ok: true, message: detail, watch: next, paid: cost };
}

function steal(seat, resource, amount) {
    if (!seat || !(amount > 0)) return 0;
    const held = Math.max(0, finite(seat.stores?.[resource]));
    const taken = Math.min(held, amount);
    if (taken <= 0) return 0;
    seat.stores[resource] = Math.round((held - taken) * 1e6) / 1e6;
    return taken;
}

function applyFrontierIncident(map, entry, definition, realm, nearest, pressure, year) {
    const stolen = { wood: 0, stone: 0, food: 0 };
    if (nearest) {
        stolen.wood = steal(nearest, "wood", 1);
        stolen.stone = steal(nearest, "stone", 1);
        const treasury = Math.max(0, finite(nearest.treasury?.gold));
        const takenGold = Math.min(treasury, 1);
        if (takenGold > 0) nearest.treasury.gold = Math.round((treasury - takenGold) * 1e6) / 1e6;
        stolen.gold = takenGold;
    } else {
        const food = Math.min(2, Math.max(0, finite(state.resources?.food)));
        if (food > 0) {
            addResource("food", -food);
            stolen.food = food;
        }
    }
    if (realm) {
        realm.relation = clamp((Number(realm.relation) || 0) - 2);
        realm.trust = clamp((Number(realm.trust) || 0) - 1.5);
        realm.fear = clamp((Number(realm.fear) || 0) + 2);
        // The existing diplomacy border levy reads this year marker, so a raid
        // immediately raises the same pressure the diplomacy panel shows.
        realm.lastIncidentYear = year;
    }
    state.morale = clamp((Number(state.morale) || 0) - 0.5);
    entry.incidents += 1;
    entry.lastIncidentYear = year;
    entry.pressure = Math.max(0, pressure - 12);
    entry.relief = Math.min(24, Math.max(0, entry.relief) + 12);
    map.totals.incidents += 1;
    const stolenText = [
        stolen.wood > 0 ? stolen.wood + " wood" : "",
        stolen.stone > 0 ? stolen.stone + " stone" : "",
        stolen.food > 0 ? stolen.food + " food" : "",
        stolen.gold > 0 ? stolen.gold + " gold" : ""
    ].filter(Boolean).join(", ");
    const where = nearest ? nearest.name : "the royal stores";
    record(map, "frontier-incident",
        "Raiders from " + definition.region + " crossed at " + where + (stolenText ? " and took " + stolenText : ""),
        definition.id);
    addLog("FRONTIER RAID · " + definition.region.toUpperCase() + " CROSSED THE BORDER", "#d27b6d", "frontier");
}

function settleImport(map, route, seat, realm, definition, year) {
    const lot = TRADE_ROUTE_LOT;
    const partner = partnerState(route.realmId);
    const cost = lotCost(route.resource);
    const stock = Math.max(0, Math.floor(Number(partner?.stock?.[route.resource]) || 0));
    if (!partner || stock < lot) {
        route.stalls += 1;
        route.lastResult = "No " + route.resource + " in " + definition.region + " to load.";
        map.totals.stalls += 1;
        return;
    }
    if ((Number(state.resources?.gold) || 0) < cost) {
        route.stalls += 1;
        route.lastResult = "The crown treasury could not fund the caravan.";
        map.totals.stalls += 1;
        return;
    }
    if (route.resource !== "food" &&
        Math.max(0, finite(seat.stores[route.resource])) + lot > SETTLEMENT_STORE_LIMIT) {
        route.stalls += 1;
        route.lastResult = "The depot at " + seat.name + " is full; the caravan stayed in " + definition.region + ".";
        map.totals.stalls += 1;
        return;
    }
    addResource("gold", -cost);
    partner.stock[route.resource] = stock - lot;
    partner.treasury = Math.max(0, (Number(partner.treasury) || 0) + cost);
    if (route.resource === "food") addResource("food", lot);
    else {
        seat.stores[route.resource] = Math.min(SETTLEMENT_STORE_LIMIT,
            Math.round((Math.max(0, finite(seat.stores[route.resource])) + lot) * 1e6) / 1e6);
    }
    route.goldSpent += cost;
    route.delivered += lot;
    route.lastResult = "Unloaded " + lot + " " + route.resource + " at " + seat.name + " for " + cost + " gold.";
    map.totals.delivered += lot;
    map.totals.spent += cost;
    // recordTradeInfluence owns tradeVolume, lastTradeYear and the realm
    // history, exactly as it does for a manual market trade.
    recordTradeInfluence(state.diplomacy, route.realmId, {
        year, tick: state.tick, direction: "buy", resource: route.resource,
        amount: lot, gold: cost
    });
}

function settleExport(map, route, seat, realm, definition, year) {
    const lot = TRADE_ROUTE_LOT;
    const partner = partnerState(route.realmId);
    const payout = lotPayout(route.resource);
    let available;
    if (route.resource === "food") available = Math.max(0, Math.floor(Number(state.resources?.food) || 0));
    else available = Math.max(0, Math.floor(Number(seat.stores?.[route.resource]) || 0));
    if (available < lot) {
        route.stalls += 1;
        route.lastResult = "The depot at " + seat.name + " held less than " + lot + " " + route.resource + ".";
        map.totals.stalls += 1;
        return;
    }
    if (!partner || (Number(partner.treasury) || 0) < payout) {
        route.stalls += 1;
        route.lastResult = definition.region + " could not pay " + payout + " gold.";
        map.totals.stalls += 1;
        return;
    }
    if (route.resource === "food") addResource("food", -lot);
    else seat.stores[route.resource] = Math.round((available - lot) * 1e6) / 1e6;
    partner.stock[route.resource] = Math.max(0, (Number(partner.stock?.[route.resource]) || 0) + lot);
    partner.treasury = Math.max(0, (Number(partner.treasury) || 0) - payout);
    // The settlement that supplies the depot keeps a small handling fee. This
    // is the only gold its own road repairs can spend from trade directly.
    const fee = Math.min(2, Math.max(1, Math.round(payout * 0.1)));
    addResource("gold", payout - fee);
    if (fee > 0) {
        seat.treasury.gold = Math.min(SETTLEMENT_TREASURY_LIMIT,
            Math.round((Math.max(0, finite(seat.treasury.gold)) + fee) * 1e6) / 1e6);
    }
    route.earned += payout;
    route.delivered += lot;
    route.lastResult = "Sold " + lot + " " + route.resource + " from " + seat.name + " for " + (payout - fee) +
        " gold" + (fee > 0 ? " · the settlement kept " + fee + " gold handling fee." : ".");
    map.totals.delivered += lot;
    map.totals.earned += payout - fee;
    recordTradeInfluence(state.diplomacy, route.realmId, {
        year, tick: state.tick, direction: "sell", resource: route.resource,
        amount: lot, gold: payout
    });
}

function strongestNeighbourOwner(region, map) {
    const definition = regionDefinitionFor(region.id);
    if (!definition) return null;
    let best = null;
    for (const id of definition.neighbours) {
        const other = regionEntry(map, id);
        if (!other || other.ownerId === region.ownerId) continue;
        const otherRealm = realmState(other.ownerId);
        const ownerRealm = region.ownerId === CROWN_OWNER_ID ? null : realmState(region.ownerId);
        // Realms only have a treaty with the crown, not with each other. A
        // foreign province is hostile to the crown only across a crown border;
        // two foreign neighbours are not at war merely because one of them is
        // fighting the crown elsewhere.
        const hostile = region.ownerId === CROWN_OWNER_ID
            ? otherRealm?.treaty === "war"
            : other.ownerId === CROWN_OWNER_ID && ownerRealm?.treaty === "war";
        const score = other.control + (hostile ? 24 : 0) + (other.contestedBy ? -8 : 0) + (id < (best?.id || "" ) ? 1 : 0);
        if (!best || score > best.score) best = { id, ownerId: other.ownerId, score };
    }
    return best;
}

function regionCanFlip(region, challengerId) {
    if (!challengerId) return false;
    if (region.ownerId === CROWN_OWNER_ID) return realmState(challengerId)?.treaty === "war";
    const ownerRealm = realmState(region.ownerId);
    if (challengerId === CROWN_OWNER_ID) return ownerRealm?.treaty === "war";
    // The four neighbouring realms do not fight each other in the shared
    // diplomacy ledger; only a crown border can change a province's owner.
    return false;
}

function changeRegionOwner(map, region, ownerId, year, kind, summary) {
    const oldOwner = region.ownerId;
    region.ownerId = ownerId;
    region.control = Math.max(26, Math.round(region.control));
    region.loyalty = Math.max(38, Math.round(region.loyalty));
    region.garrison = 1;
    region.contestedBy = null;
    region.lastChangeYear = year;
    region.changes += 1;
    map.totals.regionChanges += 1;
    if (ownerId === CROWN_OWNER_ID) {
        state.morale = clamp((Number(state.morale) || 0) + 1.5);
    } else if (oldOwner === CROWN_OWNER_ID) {
        state.morale = clamp((Number(state.morale) || 0) - 2);
        if (state.politics && typeof state.politics === "object") {
            state.politics.legitimacy = clamp((Number(state.politics.legitimacy) || 0) - 1);
        }
    }
    record(map, kind, summary, ownerId === CROWN_OWNER_ID ? null : ownerId);
    addLog("PROVINCE CHANGED HANDS · " + regionDisplayName(region.id, regionDefinitionFor(region.id).name).toUpperCase(),
        ownerId === CROWN_OWNER_ID ? "#a5d6a7" : "#d27b6d", "frontier");
}

function updateRegions(map, year) {
    let annualYield = 0;
    let changes = 0;
    for (const region of map.regions) {
        const definition = regionDefinitionFor(region.id);
        if (!definition) continue;
        const ownerRealm = region.ownerId === CROWN_OWNER_ID ? null : realmState(region.ownerId);
        const atWar = ownerRealm?.treaty === "war";
        let delta = region.ownerId === CROWN_OWNER_ID
            ? ((Number(state.morale) || 0) >= 50 ? 1 : -1)
            : (atWar ? -2 : 1);
        if (region.contestedBy) delta -= 2;
        if (ownerRealm && !atWar && ownerRealm.relation >= 55) delta += 1;
        if (ownerRealm && ownerRealm.relation < 25) delta -= 1;
        const hostileBorders = definition.neighbours.filter(id => {
            const other = regionEntry(map, id);
            if (!other || other.ownerId === region.ownerId) return false;
            return region.ownerId === CROWN_OWNER_ID
                ? realmState(other.ownerId)?.treaty === "war"
                : other.ownerId === CROWN_OWNER_ID && atWar;
        }).length;
        delta -= hostileBorders * 2;
        region.control = clamp(region.control + delta, 0, REGION_CONTROL_MAX);
        region.loyalty = clamp(region.loyalty + (region.ownerId === CROWN_OWNER_ID
            ? ((Number(state.morale) || 0) >= 50 ? 1 : -1)
            : (ownerRealm && ownerRealm.relation >= 50 ? 1 : -1)) - (region.contestedBy ? 2 : 0));
        if (region.control < REGION_CONTESTED_BELOW) {
            const challenger = strongestNeighbourOwner(region, map);
            region.contestedBy = challenger?.ownerId || null;
        } else if (region.control >= REGION_SECURE_ABOVE) {
            region.contestedBy = null;
        }
        if (region.contestedBy && region.control <= REGION_FLIP_BELOW && regionCanFlip(region, region.contestedBy)) {
            const roll = hashText(region.id + ":" + year + ":flip") % 100;
            const chance = region.ownerId === CROWN_OWNER_ID ? 48 : 36;
            if (roll < chance) {
                const previous = region.ownerId;
                const oldName = regionOwnerName(previous);
                const newName = regionOwnerName(region.contestedBy);
                const summary = regionDisplayName(region.id, definition.name) + " passed from " + oldName + " to " + newName + " after a contested border year.";
                changeRegionOwner(map, region, region.contestedBy, year, "province-changed", summary);
                changes += 1;
                continue;
            }
        }
        if (region.ownerId === CROWN_OWNER_ID) {
            const amount = regionYieldFor(region, definition);
            addResource(definition.resource, amount);
            map.totals.regionYield += amount;
            annualYield += amount;
        }
    }
    map.lastRegionClaimYear = Math.min(map.lastRegionClaimYear, year);
    return { annualYield, changes };
}

export function pressRegionClaim(regionId) {
    const map = ensureWorldMap();
    const region = regionEntry(map, text(regionId, 40));
    if (!region) return { ok: false, reason: "unknown-province" };
    const readiness = regionClaimReadiness(region, map);
    if (!readiness.ok) return { ok: false, reason: readiness.reason, reasonLabel: readiness.reasonLabel };
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    addResource("gold", -REGION_CLAIM_COST.gold);
    addResource("food", -REGION_CLAIM_COST.food);
    map.lastRegionClaimYear = year;
    map.totals.provinceClaims += 1;
    const definition = regionDefinitionFor(region.id);
    const oldOwner = region.ownerId;
    const oldRealm = realmState(oldOwner);
    const roll = hashText(region.id + ":" + year + ":claim") % 100;
    const success = roll < readiness.chance;
    if (success) {
        region.ownerId = CROWN_OWNER_ID;
        region.control = 30;
        region.loyalty = 42;
        region.garrison = 1;
        region.contestedBy = null;
        region.lastChangeYear = year;
        region.changes += 1;
        map.totals.regionChanges += 1;
        if (oldRealm) {
            oldRealm.relation = clamp(oldRealm.relation - 14);
            oldRealm.trust = clamp(oldRealm.trust - 10);
            oldRealm.fear = clamp(oldRealm.fear + 5);
        }
        state.morale = clamp((Number(state.morale) || 0) + 1.5);
        record(map, "province-claimed", "The crown pressed its claim to " + regionDisplayName(region.id, definition.name) + " and the border yielded.");
        addLog("PROVINCE CLAIMED · " + regionDisplayName(region.id, definition.name).toUpperCase(), "#a5d6a7", "frontier");
    } else {
        region.control = clamp(region.control - 14);
        region.loyalty = clamp(region.loyalty - 6);
        if (oldRealm) {
            oldRealm.relation = clamp(oldRealm.relation - 6);
            oldRealm.trust = clamp(oldRealm.trust - 4);
        }
        record(map, "province-claim-repulsed", "The claim on " + regionDisplayName(region.id, definition.name) + " was repulsed; the border holds for now.");
        addLog("PROVINCE CLAIM REPULSED · " + regionDisplayName(region.id, definition.name).toUpperCase(), "#d8a38a", "frontier");
    }
    return {
        ok: true,
        success,
        chance: readiness.chance,
        message: success
            ? "Province claimed: " + regionDisplayName(region.id, definition.name)
            : "Claim repulsed at " + regionDisplayName(region.id, definition.name) + " (" + readiness.chance + "% chance)",
        region: regionSnapshot(region, map)
    };
}

// One bounded annual pass. It runs after the court has settled its own trade
// agreements and after the settlements received their year-start grant.
export function updateWorldMap() {
    const map = ensureWorldMap();
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    if (map.lastUpdateYear >= year) return getWorldMapSnapshot();
    map.lastUpdateYear = year;
    // Read the settlement owners once. getSettlementSeats() rebuilds its seat
    // objects on every call, so holding one array for the whole pass is what
    // makes a raid and the caravan that follows it land in the same stores.
    const seats = getSettlementSeats();
    const seatRows = normalizedSeats(seats);
    const seatFor = route => seats.find(seat =>
        seat.buildingId === route.seatId || seat.id === route.seatId) || null;
    const levy = getFrontierPressure();
    updateRegions(map, year);

    for (const definition of DIPLOMATIC_REALMS) {
        const entry = frontierEntry(map, definition.id);
        const realm = realmState(definition.id);
        const activeRoutes = map.routes.filter(route =>
            route.realmId === definition.id &&
            routeStatus(route, seatFor(route), realm) === "open").length;
        const computed = frontierPressureFor(definition, seatRows, entry.watch, activeRoutes, entry.relief, provincePressureFor(definition.id, map));
        const pressure = computed.pressure;
        entry.pressure = pressure;
        entry.updatedYear = year;
        const incidentChance = Math.max(0, pressure - 50);
        const certain = pressure >= FRONTIER_INCIDENT_CERTAIN;
        const rolled = pressure >= FRONTIER_INCIDENT_PRESSURE &&
            (certain || (hashText(definition.id + ":" + year) % 100) < incidentChance);
        if (rolled) {
            applyFrontierIncident(map, entry, definition, realm, computed.nearestSeat?.live || null, pressure, year);
        } else if (entry.relief > 0) {
            // The border recovers when no new raid crosses.
            entry.relief = Math.max(0, entry.relief - 6);
        }
    }

    for (const route of map.routes) {
        if (route.lastSettledYear >= year) continue;
        const seat = seatFor(route);
        const realm = realmState(route.realmId);
        const definition = REALM_BY_ID.get(route.realmId);
        if (!definition) continue;
        if (!seat) {
            route.lastResult = "The settlement seat no longer exists.";
            route.lastSettledYear = year;
            map.totals.stalls += 1;
            continue;
        }
        if (realm?.treaty === "war") {
            route.lastResult = "War has closed this route; no caravan moved.";
            route.lastSettledYear = year;
            continue;
        }
        if (route.direction === "import") settleImport(map, route, seat, realm, definition, year);
        else settleExport(map, route, seat, realm, definition, year);
        route.lastSettledYear = year;
    }

    // Only charters, closures, watches, raids and route results write history;
    // a quiet year should not bury them under an annual "nothing happened" row.
    state.morale = clamp((Number(state.morale) || 0) + (levy.band === "CALM" ? 0.1 : 0));
    return getWorldMapSnapshot();
}
