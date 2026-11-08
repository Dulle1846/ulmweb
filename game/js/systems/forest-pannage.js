// Pannage: mast from the wood becomes a real feed reserve for stables.
//
// The forest ledger owns acorns, beechnuts and chestnuts. Feeding a stable
// consumes those goods and records horse-days on the stable itself, so the
// reserve survives save/load and is visible in the management panel. This is a
// local forest right, not a second city currency.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { ensureForestGathering } from "./forest-gathering.js";

const VERSION = 1;
const MAX_DAYS = 30;
const MAST_GOODS = Object.freeze(["acorns", "beechnuts", "chestnuts"]);

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function isStable(building) {
    return Boolean(building && !building.dead && building.type === TYPE.STABLE);
}

function normalizePannage(building) {
    if (!building.pannage || typeof building.pannage !== "object" || Array.isArray(building.pannage)) {
        building.pannage = { version: VERSION, days: 0, fedTotal: 0, mastUsed: 0, lastFedDay: null, lastFedYear: null };
    }
    const reserve = building.pannage;
    reserve.version = VERSION;
    reserve.days = Math.max(0, Math.min(MAX_DAYS, Math.floor(number(reserve.days))));
    reserve.fedTotal = Math.max(0, Math.floor(number(reserve.fedTotal)));
    reserve.mastUsed = Math.max(0, Math.floor(number(reserve.mastUsed)));
    reserve.lastFedDay = reserve.lastFedDay === null ? null : Math.max(1, Math.min(400, Math.floor(number(reserve.lastFedDay, 1))));
    reserve.lastFedYear = reserve.lastFedYear === null ? null : Math.max(1, Math.floor(number(reserve.lastFedYear, 1)));
    return reserve;
}

export function pannageSummary(building) {
    if (!isStable(building)) return "";
    const reserve = normalizePannage(building);
    return reserve.days + " days · " + reserve.fedTotal + " mast fed";
}

export function feedStableFromMast(building, rations = 6) {
    if (!isStable(building)) return { ok: false, reason: "Only a stable can receive pannage" };
    if (building.construction && Number(building.construction.stage) < 3) {
        return { ok: false, reason: "The stable is still under construction" };
    }
    const reserve = normalizePannage(building);
    const room = MAX_DAYS - reserve.days;
    if (room <= 0) return { ok: false, reason: "The pannage reserve is already full" };
    const ledger = ensureForestGathering();
    let remaining = Math.min(room, Math.max(1, Math.floor(number(rations, 6))));
    const taken = {};
    for (const good of MAST_GOODS) {
        if (remaining <= 0) break;
        const available = Math.max(0, Math.floor(number(ledger.stock[good])));
        const amount = Math.min(remaining, available);
        if (amount <= 0) continue;
        ledger.stock[good] = available - amount;
        taken[good] = amount;
        remaining -= amount;
    }
    const fed = Object.values(taken).reduce((sum, amount) => sum + amount, 0);
    if (fed <= 0) return { ok: false, reason: "No acorns, beechnuts or chestnuts in the forest ledger" };
    reserve.days += fed;
    reserve.fedTotal += fed;
    reserve.mastUsed += fed;
    reserve.lastFedDay = Math.max(1, Math.min(400, Math.floor(number(state.dayOfYear, 1))));
    reserve.lastFedYear = Math.max(1, Math.floor(number(state.year, 1)));
    return { ok: true, fed, days: reserve.days, mast: taken, reserve };
}

// A stable eats one reserve day per simulation day. The feed is not free: the
// player must first gather mast and then spend it here.
export function updateForestPannage(days = 1) {
    const steps = Math.max(0, Math.floor(number(days, 1)));
    if (!steps) return 0;
    let consumed = 0;
    for (const building of state.entities || []) {
        if (!isStable(building)) continue;
        const reserve = normalizePannage(building);
        const used = Math.min(reserve.days, steps);
        reserve.days -= used;
        consumed += used;
    }
    return consumed;
}

export function validatePannage(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid pannage reserve.");
    }
    const reserve = value;
    if (reserve.version !== undefined && reserve.version !== VERSION) {
        throw new Error("Save data contains an unsupported pannage reserve version.");
    }
    for (const key of ["days", "fedTotal", "mastUsed"]) {
        if (reserve[key] !== undefined && (!Number.isFinite(Number(reserve[key])) || Number(reserve[key]) < 0)) {
            throw new Error("Save data contains an invalid pannage reserve value.");
        }
    }
    if (Number(reserve.days) > MAX_DAYS) throw new Error("Save data contains an oversized pannage reserve.");
    return true;
}

export const PANNAGE_LIMITS = Object.freeze({ version: VERSION, maxDays: MAX_DAYS, mastGoods: MAST_GOODS });
