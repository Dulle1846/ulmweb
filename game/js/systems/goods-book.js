// Central goods book. Every physical movement and every booked consumption is
// written here exactly once. The ring buffer keeps a long but bounded transport
// archive; the cumulative audit totals are unbounded and survive trimming, so
// the physical stock of the realm can always be reconciled against production
// and consumption instead of being reconstructed from a short debug log.
import { state } from "../core/state.js";

export const GOODS_LEDGER_LIMIT = 600;
export const RESOURCE_GOOD_KEYS = Object.freeze(["food"]);
export const GOODS_SCOPES = Object.freeze(["good", "resource"]);

// Types that create or destroy tracked stock. Internal transfers (picked,
// delivered, deposited into a local store, evacuated) never change the total.
const CREATES_STOCK = new Set(["produced", "deposited"]);
const DESTROYS_STOCK = new Set(["consumed", "withdrawn", "lost"]);

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
    return Math.round(number(value) * 100) / 100;
}

export function cleanAmount(value, scope = "good") {
    const parsed = number(value);
    return scope === "resource" ? Math.max(0, round2(parsed)) : Math.max(0, Math.floor(parsed));
}

// Every booking calls ensureGoodsBook(). Filtering and re-slicing the whole
// ledger there allocated a new 600-entry array per movement and dominated the
// mature tick. The array is sanitised once per identity instead; trimming then
// happens in place and only when the bound is actually exceeded.
const sanitizedLedgers = new WeakSet();
// Idempotency keys used to be found with ledger.find(), which is O(600) per
// booking and dominated goods-heavy production ticks. Keep an exact index next
// to the ring buffer; entries removed by trimming are removed from the index
// too, so a key can become bookable again exactly when the baseline allowed it.
const ledgerKeyIndexes = new WeakMap();

function ledgerIndex(ledger) {
    let index = ledgerKeyIndexes.get(ledger);
    if (index) return index;
    index = new Map();
    for (const entry of ledger) {
        if (entry && entry.key) index.set(String(entry.key), entry);
    }
    ledgerKeyIndexes.set(ledger, index);
    return index;
}

function trimLedger(ledger) {
    if (ledger.length <= GOODS_LEDGER_LIMIT) return;
    const removed = ledger.splice(0, ledger.length - GOODS_LEDGER_LIMIT);
    const index = ledgerKeyIndexes.get(ledger);
    if (!index) return;
    for (const entry of removed) {
        if (entry && entry.key && index.get(String(entry.key)) === entry) index.delete(String(entry.key));
    }
}

function ensureLedger(logistics) {
    if (!Array.isArray(logistics.ledger)) logistics.ledger = [];
    let ledger = logistics.ledger;
    if (!sanitizedLedgers.has(ledger)) {
        const clean = ledger.filter(entry => entry && typeof entry === "object");
        if (clean.length !== ledger.length) logistics.ledger = ledger = clean;
        sanitizedLedgers.add(ledger);
    }
    trimLedger(ledger);
    return ledger;
}

export function ensureGoodsBook() {
    if (!state.city || typeof state.city !== "object") state.city = {};
    const city = state.city;
    if (!city.logistics || typeof city.logistics !== "object") {
        city.logistics = { version: 2, nextJobId: 1, nextCarrierId: 1, jobs: [], carriers: [], lastTick: 0, stats: {} };
    }
    const logistics = city.logistics;
    ensureLedger(logistics);
    logistics.nextLedgerId = Math.max(1, Math.floor(number(logistics.nextLedgerId, 1)));
    if (!logistics.audit || typeof logistics.audit !== "object") {
        logistics.audit = { version: 1, opening: {}, produced: {}, consumed: {}, sinceTick: Math.max(0, Math.floor(number(state.tick))), lastTick: 0 };
    }
    const audit = logistics.audit;
    audit.opening = audit.opening && typeof audit.opening === "object" ? audit.opening : {};
    audit.produced = audit.produced && typeof audit.produced === "object" ? audit.produced : {};
    audit.consumed = audit.consumed && typeof audit.consumed === "object" ? audit.consumed : {};
    audit.sinceTick = Math.max(0, Math.floor(number(audit.sinceTick)));
    audit.lastTick = Math.max(0, Math.floor(number(audit.lastTick)));
    return logistics;
}

export function scopeForGood(good, scope) {
    if (RESOURCE_GOOD_KEYS.includes(good)) return scope === "good" ? "good" : "resource";
    return "good";
}

function ensureTotals(good) {
    const audit = ensureGoodsBook().audit;
    for (const bucket of ["opening", "produced", "consumed"]) {
        audit[bucket][good] = Math.max(0, round2(audit[bucket][good]));
    }
    return {
        opening: audit.opening[good], produced: audit.produced[good], consumed: audit.consumed[good],
        audit
    };
}

function refName(ref) {
    if (!ref) return null;
    return String(ref.kind || "unknown") + ":" + String(ref.id ?? "unknown");
}

// Writing the same key twice is a no-op and returns the original entry. This is
// what makes consumption idempotent when two systems evaluate the same need in
// one tick.
export function recordGoodsMovement(entry) {
    if (!entry || typeof entry !== "object") return null;
    const good = entry.good === null || entry.good === undefined ? null : String(entry.good);
    if (good === null) return null;
    const scope = scopeForGood(good, entry.scope);
    const quantity = cleanAmount(entry.quantity, scope);
    if (quantity <= 0) return null;
    const logistics = ensureGoodsBook();
    const key = entry.key ? String(entry.key) : null;
    const index = ledgerIndex(logistics.ledger);
    if (key) {
        const existing = index.get(key);
        if (existing) return existing;
    }
    const type = String(entry.type || "moved");
    const record = {
        id: "l" + logistics.nextLedgerId++,
        tick: Math.max(0, Math.floor(number(state.tick))),
        type, good, scope, quantity,
        from: refName(entry.from), to: refName(entry.to),
        cause: entry.cause ? String(entry.cause) : type,
        jobId: entry.jobId ? String(entry.jobId) : null,
        houseId: entry.houseId ? String(entry.houseId) : null,
        status: String(entry.status || type),
        key
    };
    logistics.ledger.push(record);
    if (key) index.set(key, record);
    trimLedger(logistics.ledger);
    const totals = ensureTotals(good);
    if (CREATES_STOCK.has(type)) totals.produced = round2(totals.produced + quantity);
    else if (DESTROYS_STOCK.has(type)) totals.consumed = round2(totals.consumed + quantity);
    totals.audit.produced[good] = totals.produced;
    totals.audit.consumed[good] = totals.consumed;
    totals.audit.lastTick = record.tick;
    return record;
}

export function findGoodsMovementByKey(key) {
    if (!key) return null;
    const logistics = ensureGoodsBook();
    return ledgerIndex(logistics.ledger).get(String(key)) || null;
}

export function readAuditTotals(good, scope) {
    const resolved = scopeForGood(good, scope);
    const totals = ensureTotals(good);
    return {
        good, scope: resolved,
        opening: round2(totals.opening), produced: round2(totals.produced), consumed: round2(totals.consumed)
    };
}

// Opening stock is the stock that already existed when the books were opened,
// typically a legacy save that predates the audit. It is set once and never
// recomputed, so later production and consumption remain comparable.
export function setAuditOpening(stockByGood = {}) {
    const audit = ensureGoodsBook().audit;
    audit.opening = {};
    audit.produced = {};
    audit.consumed = {};
    for (const [good, quantity] of Object.entries(stockByGood)) {
        audit.opening[good] = Math.max(0, round2(quantity));
        audit.produced[good] = 0;
        audit.consumed[good] = 0;
    }
    audit.sinceTick = Math.max(0, Math.floor(number(state.tick)));
    audit.lastTick = audit.sinceTick;
    return audit;
}

// Royal resources (food) use the same book with a resource scope. A signed
// delta of a resource change becomes exactly one typed booking.
export function recordResourceMovement(good, delta, cause, extra = {}) {
    const amount = Math.abs(number(delta));
    if (!amount) return null;
    return recordGoodsMovement({
        ...extra,
        type: number(delta) > 0 ? "produced" : "consumed",
        scope: "resource",
        good,
        quantity: amount,
        cause
    });
}
