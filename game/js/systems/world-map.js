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

export const WORLD_MAP_VERSION = 1;
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

export function createWorldMapState() {
    return {
        version: WORLD_MAP_VERSION,
        lastUpdateYear: 0,
        routes: [],
        frontiers: DIPLOMATIC_REALMS.map(realm => defaultFrontier(realm.id)),
        history: [],
        totals: {
            routesOpened: 0,
            delivered: 0,
            earned: 0,
            spent: 0,
            incidents: 0,
            stalls: 0
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
    return {
        version: WORLD_MAP_VERSION,
        lastUpdateYear: yearOf(source.lastUpdateYear),
        routes,
        frontiers: DIPLOMATIC_REALMS.map(realm => normalizeFrontier(savedFrontiers.get(realm.id), realm.id)),
        history: (Array.isArray(source.history) ? source.history : [])
            .map(normalizeHistoryEntry).filter(Boolean).slice(0, WORLD_ROUTE_HISTORY_LIMIT),
        totals: {
            routesOpened: integer(source.totals?.routesOpened),
            delivered: integer(source.totals?.delivered),
            earned: integer(source.totals?.earned),
            spent: integer(source.totals?.spent),
            incidents: integer(source.totals?.incidents, 0, 9999),
            stalls: integer(source.totals?.stalls, 0, 9999)
        }
    };
}

export function validateWorldMapSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Save data contains an invalid world map state.");
    }
    if (Number(snapshot.version) !== WORLD_MAP_VERSION) {
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
    return true;
}

export function ensureWorldMap() {
    const current = state.worldMap;
    if (!current || typeof current !== "object" || Array.isArray(current) ||
        current.version !== WORLD_MAP_VERSION || !Array.isArray(current.routes) ||
        !Array.isArray(current.frontiers)) {
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

export function frontierPressureFor(realm, seats, watch = 0, routeCount = 0, relief = 0) {
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
    const computed = frontierPressureFor(realm, seats, entry.watch, active, entry.relief);
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
    const totals = {
        ...map.totals,
        activeRoutes: routes.filter(route => route.status === "open").length,
        closedRoutes: routes.filter(route => route.status === "closed").length,
        stallRoutes: routes.filter(route => !["open", "closed"].includes(route.status)).length,
        watchLevels: map.frontiers.reduce((sum, row) => sum + row.watch, 0)
    };
    return {
        version: WORLD_MAP_VERSION,
        year,
        lastUpdateYear: map.lastUpdateYear,
        // The live owner reference is used only by the annual raid pass; the
        // player-facing snapshot carries plain data.
        seats: seats.map(({ live, ...seat }) => seat),
        realms,
        routes,
        totals,
        history: map.history.slice(0, 12),
        costs: { route: TRADE_ROUTE_COST, watch: FRONTIER_WATCH_COST, lot: TRADE_ROUTE_LOT },
        limits: { routes: TRADE_ROUTE_LIMIT, watch: FRONTIER_WATCH_LIMIT },
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

    for (const definition of DIPLOMATIC_REALMS) {
        const entry = frontierEntry(map, definition.id);
        const realm = realmState(definition.id);
        const activeRoutes = map.routes.filter(route =>
            route.realmId === definition.id &&
            routeStatus(route, seatFor(route), realm) === "open").length;
        const computed = frontierPressureFor(definition, seatRows, entry.watch, activeRoutes, entry.relief);
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
