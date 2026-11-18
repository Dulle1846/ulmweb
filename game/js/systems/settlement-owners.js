// Settlement maintenance owners: every completed keep or town hall is a seat
// with a bounded territory, its own small treasury and stores, and one annual
// crown grant. Road repair reads this registry; nothing here scans the map per
// frame or per tick.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "./resources.js";

export const SETTLEMENT_OWNER_VERSION = 1;
export const SETTLEMENT_TERRITORY_RADIUS = 16;
export const SETTLEMENT_SEAT_LIMIT = 24;
export const SETTLEMENT_STORE_LIMIT = 50;
export const SETTLEMENT_TREASURY_LIMIT = 500;
// Local maintenance funds are deliberately small. They cover routine annual
// patching but not a neglected network; a short settlement must wait for its
// next crown allotment instead of repairing with money it does not hold.
export const SETTLEMENT_FOUNDING_GRANT = Object.freeze({ wood: 0.02, stone: 0.01, gold: 0.5 });
export const SETTLEMENT_ANNUAL_GRANT = Object.freeze({ wood: 0.01, stone: 0.005, gold: 0.25 });
const SEAT_TYPES = new Set([TYPE.KEEP, TYPE.TOWN_HALL]);
const RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold"]);
const NAME_POOL = Object.freeze([
    "Crown Keep", "Northgate", "Riverside", "Highfield", "Millbrook", "Southwatch",
    "Eastmere", "Fenwick", "Rookwood", "Ashford", "Dunmere", "Lowbridge"
]);

const finite = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, limit) => Math.max(0, Math.min(limit, finite(value)));
const balance = value => Math.round(clamp(value, 1e9) * 1e6) / 1e6;
const yearOf = value => Math.max(0, Math.min(1_000_000, Math.floor(finite(value))));
const text = (value, limit = 80) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

function emptyCost() {
    return { wood: 0, stone: 0, gold: 0 };
}
function normalizeCost(source) {
    const result = emptyCost();
    if (!source || typeof source !== "object" || Array.isArray(source)) return result;
    for (const key of RESOURCE_KEYS) result[key] = Math.round(clamp(source[key], 1e9) * 1000) / 1000;
    return result;
}
function normalizeRepair(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const year = yearOf(source.year);
    if (!year) return null;
    return {
        year,
        tiles: Math.max(0, Math.floor(finite(source.tiles))),
        cost: normalizeCost(source.cost)
    };
}
function normalizeObligation(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const year = yearOf(source.year);
    if (!year) return null;
    return {
        year,
        tiles: Math.max(0, Math.floor(finite(source.tiles))),
        cost: normalizeCost(source.cost),
        covered: normalizeCost(source.covered),
        shortfall: normalizeCost(source.shortfall)
    };
}
function normalizeSeat(source, index = 0) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const buildingId = text(source.buildingId || source.id, 80);
    if (!buildingId) return null;
    const stores = source.stores && typeof source.stores === "object" ? source.stores : {};
    const treasury = source.treasury && typeof source.treasury === "object" ? source.treasury : {};
    return {
        id: "seat:" + buildingId,
        buildingId,
        name: text(source.name, 60) || ("Settlement " + (index + 1)),
        x: Math.max(0, Math.floor(finite(source.x))),
        y: Math.max(0, Math.floor(finite(source.y))),
        foundedYear: Math.max(1, yearOf(source.foundedYear) || 1),
        stores: { wood: balance(stores.wood), stone: balance(stores.stone) },
        treasury: { gold: balance(treasury.gold) },
        lastGrantYear: yearOf(source.lastGrantYear),
        lastGrant: normalizeRepair(source.lastGrant),
        lastRepairYear: yearOf(source.lastRepairYear),
        lastRepair: normalizeRepair(source.lastRepair),
        lastObligation: normalizeObligation(source.lastObligation)
    };
}
function sortSeats(seats) {
    return seats.sort((a, b) => (a.buildingId < b.buildingId ? -1 : a.buildingId > b.buildingId ? 1 : 0));
}

export function ensureSettlementOwnerState() {
    if (!state.settlements || typeof state.settlements !== "object" || !Array.isArray(state.settlements.seats)) {
        state.settlements = {
            version: SETTLEMENT_OWNER_VERSION,
            revision: 0,
            seeded: false,
            nextNameIndex: 0,
            seats: [],
            lastGrantYear: 0,
            lastGrant: null,
            lastObligationYear: 0,
            lastObligation: null
        };
    }
    const owners = state.settlements;
    const seen = new Set();
    const seats = [];
    for (const [index, raw] of owners.seats.entries()) {
        const seat = normalizeSeat(raw, index);
        if (!seat || seen.has(seat.buildingId)) continue;
        seen.add(seat.buildingId);
        seats.push(seat);
        if (seats.length >= SETTLEMENT_SEAT_LIMIT) break;
    }
    owners.seats = sortSeats(seats);
    owners.version = SETTLEMENT_OWNER_VERSION;
    owners.revision = Math.max(0, Math.floor(finite(owners.revision)));
    owners.seeded = owners.seeded === true;
    owners.nextNameIndex = Math.max(owners.seats.length, Math.max(0, Math.floor(finite(owners.nextNameIndex))));
    owners.lastGrantYear = yearOf(owners.lastGrantYear);
    owners.lastObligationYear = yearOf(owners.lastObligationYear);
    if (!owners.lastGrant || typeof owners.lastGrant !== "object" || Array.isArray(owners.lastGrant)) owners.lastGrant = null;
    if (!owners.lastObligation || typeof owners.lastObligation !== "object" || Array.isArray(owners.lastObligation)) owners.lastObligation = null;
    return owners;
}

function activeSeatBuildings() {
    const rows = [];
    for (const entity of state.entities || []) {
        if (!entity || entity.dead || !SEAT_TYPES.has(entity.type)) continue;
        if (typeof entity.isBuilding === "function" && !entity.isBuilding()) continue;
        if (entity.construction && Number(entity.construction.stage) < 3) continue;
        if (!text(entity.id, 80)) continue;
        rows.push(entity);
        if (rows.length >= SETTLEMENT_SEAT_LIMIT * 4) break;
    }
    rows.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    return rows.slice(0, SETTLEMENT_SEAT_LIMIT);
}

function seatName(ownerState) {
    const index = Math.max(0, Math.floor(finite(ownerState.nextNameIndex)));
    ownerState.nextNameIndex = index + 1;
    if (index < NAME_POOL.length) return NAME_POOL[index];
    return "Settlement " + (index + 1);
}
function blankSeat(entity, ownerState) {
    return {
        id: "seat:" + String(entity.id),
        buildingId: String(entity.id),
        name: seatName(ownerState),
        x: Math.max(0, Math.floor(finite(entity.x))),
        y: Math.max(0, Math.floor(finite(entity.y))),
        foundedYear: Math.max(1, Math.floor(finite(state.year, 1))),
        stores: { wood: 0, stone: 0 },
        treasury: { gold: 0 },
        lastGrantYear: 0,
        lastGrant: null,
        lastRepairYear: 0,
        lastRepair: null,
        lastObligation: null
    };
}
function transferToSeat(seat, grant) {
    const paid = emptyCost();
    if (!state.resources || typeof state.resources !== "object") return paid;
    for (const key of RESOURCE_KEYS) {
        const held = key === "gold" ? seat.treasury.gold : seat.stores[key];
        const limit = key === "gold" ? SETTLEMENT_TREASURY_LIMIT : SETTLEMENT_STORE_LIMIT;
        const room = Math.max(0, limit - held);
        const available = Math.max(0, finite(state.resources[key]));
        const amount = Math.min(available, Math.max(0, finite(grant[key])), room);
        if (amount <= 0) continue;
        addResource(key, -amount);
        if (key === "gold") seat.treasury.gold = balance(seat.treasury.gold + amount);
        else seat.stores[key] = balance(seat.stores[key] + amount);
        paid[key] = Math.round(amount * 1e6) / 1e6;
    }
    return paid;
}
function refundSeat(seat) {
    if (!state.resources) return;
    for (const key of RESOURCE_KEYS) {
        const amount = key === "gold" ? seat.treasury.gold : seat.stores[key];
        if (amount > 0) addResource(key, amount);
    }
    seat.stores = { wood: 0, stone: 0 };
    seat.treasury = { gold: 0 };
}

export function getSettlementSeats() {
    return ensureSettlementOwnerState().seats;
}

// Discover completed seat buildings. New seats receive a founding grant drawn
// from the crown; restoration passes grantNewSeats=false so a legacy save does
// not change its resource totals merely by loading.
export function syncSettlementSeats({ grantNewSeats = false } = {}) {
    const owners = ensureSettlementOwnerState();
    const existing = new Map(owners.seats.map(seat => [seat.buildingId, seat]));
    const next = [];
    let changed = false;
    for (const entity of activeSeatBuildings()) {
        const buildingId = String(entity.id);
        let seat = existing.get(buildingId);
        if (!seat) {
            seat = blankSeat(entity, owners);
            if (grantNewSeats) {
                const paid = transferToSeat(seat, SETTLEMENT_FOUNDING_GRANT);
                seat.lastGrantYear = Math.max(1, Math.floor(finite(state.year, 1)));
                seat.lastGrant = { year: seat.lastGrantYear, tiles: 0, cost: paid };
            }
            changed = true;
        } else if (seat.x !== Math.floor(finite(entity.x)) || seat.y !== Math.floor(finite(entity.y))) {
            seat.x = Math.max(0, Math.floor(finite(entity.x)));
            seat.y = Math.max(0, Math.floor(finite(entity.y)));
            changed = true;
        }
        next.push(seat);
    }
    const live = new Set(next.map(seat => seat.buildingId));
    for (const seat of owners.seats) {
        if (live.has(seat.buildingId)) continue;
        refundSeat(seat);
        changed = true;
    }
    if (changed) {
        owners.seats = sortSeats(next);
        owners.revision = Math.max(0, Math.floor(finite(owners.revision))) + 1;
    }
    owners.seeded = true;
    return owners.seats;
}

export function initializeSettlementOwners() {
    return syncSettlementSeats({ grantNewSeats: true });
}

export function registerSettlementSeat(entity) {
    if (!entity || entity.dead || !SEAT_TYPES.has(entity.type)) return null;
    if (typeof entity.isBuilding === "function" && !entity.isBuilding()) return null;
    if (entity.construction && Number(entity.construction.stage) < 3) return null;
    const buildingId = text(entity.id, 80);
    if (!buildingId) return null;
    const owners = ensureSettlementOwnerState();
    const existing = owners.seats.find(seat => seat.buildingId === buildingId);
    if (existing) return existing;
    if (owners.seats.length >= SETTLEMENT_SEAT_LIMIT) return null;
    const seat = blankSeat(entity, owners);
    const paid = transferToSeat(seat, SETTLEMENT_FOUNDING_GRANT);
    seat.lastGrantYear = Math.max(1, Math.floor(finite(state.year, 1)));
    seat.lastGrant = { year: seat.lastGrantYear, tiles: 0, cost: paid };
    owners.seats = sortSeats([...owners.seats, seat]);
    owners.revision = Math.max(0, Math.floor(finite(owners.revision))) + 1;
    owners.seeded = true;
    return seat;
}

export function updateSettlementMaintenance() {
    const owners = ensureSettlementOwnerState();
    const year = Math.max(1, Math.min(1_000_000, Math.floor(finite(state.year, 1))));
    const seats = syncSettlementSeats({ grantNewSeats: true });
    if (owners.lastGrantYear >= year) return owners.lastGrant;
    const rows = [];
    const total = emptyCost();
    for (const seat of seats) {
        const paid = transferToSeat(seat, SETTLEMENT_ANNUAL_GRANT);
        seat.lastGrantYear = year;
        seat.lastGrant = { year, tiles: 0, cost: paid };
        for (const key of RESOURCE_KEYS) total[key] += paid[key];
        rows.push({ id: seat.id, name: seat.name, paid });
    }
    for (const key of RESOURCE_KEYS) total[key] = Math.round(total[key] * 1e6) / 1e6;
    owners.lastGrantYear = year;
    owners.lastGrant = { year, seats: rows.length, paid: total, rows };
    return owners.lastGrant;
}

export function setSettlementObligationSummary(summary) {
    const owners = ensureSettlementOwnerState();
    if (!summary || typeof summary !== "object") return;
    owners.lastObligationYear = yearOf(summary.year);
    owners.lastObligation = {
        year: owners.lastObligationYear,
        tiles: Math.max(0, Math.floor(finite(summary.tiles))),
        owed: normalizeCost(summary.owed),
        covered: normalizeCost(summary.covered),
        shortfall: normalizeCost(summary.shortfall),
        settlements: Math.max(0, Math.floor(finite(summary.settlements))),
        shortSeats: Array.isArray(summary.shortSeats) ? summary.shortSeats.map(name => text(name, 60)).filter(Boolean).slice(0, SETTLEMENT_SEAT_LIMIT) : []
    };
}

export function getSettlementOwnerSnapshot() {
    const owners = ensureSettlementOwnerState();
    return {
        seats: owners.seats.map(seat => JSON.parse(JSON.stringify(seat))),
        seeded: owners.seeded,
        lastGrant: owners.lastGrant ? JSON.parse(JSON.stringify(owners.lastGrant)) : null,
        lastObligation: owners.lastObligation ? JSON.parse(JSON.stringify(owners.lastObligation)) : null
    };
}

export function serializeSettlementOwners() {
    const owners = ensureSettlementOwnerState();
    return {
        version: SETTLEMENT_OWNER_VERSION,
        revision: Math.max(0, Math.floor(finite(owners.revision))),
        seeded: owners.seeded === true,
        nextNameIndex: Math.max(0, Math.floor(finite(owners.nextNameIndex))),
        seats: owners.seats.map(seat => ({
            buildingId: seat.buildingId,
            name: seat.name,
            x: seat.x,
            y: seat.y,
            foundedYear: seat.foundedYear,
            stores: { ...seat.stores },
            treasury: { ...seat.treasury },
            lastGrantYear: seat.lastGrantYear,
            lastGrant: seat.lastGrant ? { ...seat.lastGrant, cost: { ...seat.lastGrant.cost } } : null,
            lastRepairYear: seat.lastRepairYear,
            lastRepair: seat.lastRepair ? { ...seat.lastRepair, cost: { ...seat.lastRepair.cost } } : null,
            lastObligation: seat.lastObligation ? JSON.parse(JSON.stringify(seat.lastObligation)) : null
        })),
        lastGrantYear: owners.lastGrantYear,
        lastGrant: owners.lastGrant ? JSON.parse(JSON.stringify(owners.lastGrant)) : null,
        lastObligationYear: owners.lastObligationYear,
        lastObligation: owners.lastObligation ? JSON.parse(JSON.stringify(owners.lastObligation)) : null
    };
}

export function restoreSettlementOwners(snapshot) {
    const next = {
        version: SETTLEMENT_OWNER_VERSION,
        revision: 0,
        seeded: false,
        nextNameIndex: 0,
        seats: [],
        lastGrantYear: 0,
        lastGrant: null,
        lastObligationYear: 0,
        lastObligation: null
    };
    if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && Number(snapshot.version) === SETTLEMENT_OWNER_VERSION) {
        next.revision = Math.max(0, Math.floor(finite(snapshot.revision)));
        next.seeded = snapshot.seeded === true;
        next.nextNameIndex = Math.max(0, Math.floor(finite(snapshot.nextNameIndex)));
        next.seats = (Array.isArray(snapshot.seats) ? snapshot.seats : []).map(normalizeSeat).filter(Boolean).slice(0, SETTLEMENT_SEAT_LIMIT);
        next.lastGrantYear = yearOf(snapshot.lastGrantYear);
        next.lastObligationYear = yearOf(snapshot.lastObligationYear);
        next.lastGrant = snapshot.lastGrant && typeof snapshot.lastGrant === "object" && !Array.isArray(snapshot.lastGrant) ? JSON.parse(JSON.stringify(snapshot.lastGrant)) : null;
        next.lastObligation = snapshot.lastObligation && typeof snapshot.lastObligation === "object" && !Array.isArray(snapshot.lastObligation) ? JSON.parse(JSON.stringify(snapshot.lastObligation)) : null;
    }
    state.settlements = next;
    // Reconcile against the restored buildings without moving resources. A
    // legacy save gets its existing keep as a zero-balance seat; a modern save
    // keeps every saved balance exactly.
    syncSettlementSeats({ grantNewSeats: false });
    return getSettlementSeats().length;
}

export function validateSettlementOwnersSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Save data contains an invalid settlement ownership state.");
    }
    if (Number(snapshot.version) !== SETTLEMENT_OWNER_VERSION) {
        throw new Error("Save data contains an unsupported settlement ownership version.");
    }
    if (snapshot.seats !== undefined && (!Array.isArray(snapshot.seats) || snapshot.seats.length > SETTLEMENT_SEAT_LIMIT)) {
        throw new Error("Save data contains an invalid settlement seat list.");
    }
    for (const [index, seat] of (snapshot.seats || []).entries()) {
        if (!seat || typeof seat !== "object" || Array.isArray(seat) || !text(seat.buildingId, 80)) {
            throw new Error("Save data contains an invalid settlement seat at position " + index + ".");
        }
        if (!Number.isFinite(Number(seat.x)) || !Number.isFinite(Number(seat.y))) {
            throw new Error("Save data contains an invalid settlement seat position at index " + index + ".");
        }
    }
    return true;
}
