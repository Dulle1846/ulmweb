// Pure normalizers for the two additive noble-war systems. Keeping them free
// of imports makes it safe for nobility.js, the host runtime and the feud
// runtime to share one save shape without a module cycle.
export const NOBLE_HOST_HISTORY_LIMIT = 8;
export const NOBLE_FEUD_HISTORY_LIMIT = 12;
export const NOBLE_FEUD_LIMIT = 8;
export const NOBLE_ACTIVE_FEUD_LIMIT = 4;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const string = (value, limit) => String(value || "").slice(0, limit);
const text = (value, limit = 160) => String(value || "").trim().slice(0, limit);

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = text(entry.summary, 180);
    if (!summary) return null;
    return {
        year: integer(entry.year, 1),
        kind: string(entry.kind || "noble-war", 28),
        summary
    };
}

export function createNobleHost() {
    return {
        version: 1,
        status: "quartered",
        strength: 0,
        targetStrength: 0,
        equipment: 0,
        morale: 50,
        readiness: 0,
        commanderId: null,
        commanderName: "",
        wages: 0,
        supplies: 0,
        raisedYear: 0,
        lastPaidYear: 0,
        musterStartedTick: 0,
        readyTick: 0,
        returnTick: 0,
        target: "",
        joinedWar: false,
        lastWarRealm: "",
        lastOrderYear: 0,
        lastOrder: "",
        history: []
    };
}

export function normalizeNobleHost(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const status = ["quartered", "mustering", "marching", "returning", "revolted"].includes(value.status)
        ? value.status : "quartered";
    return {
        version: 1,
        status,
        strength: integer(value.strength, 0, 60),
        targetStrength: integer(value.targetStrength, 0, 60),
        equipment: clamp(value.equipment ?? 0, 0, 100),
        morale: clamp(value.morale ?? 50, 0, 100),
        readiness: clamp(value.readiness ?? 0, 0, 100),
        commanderId: value.commanderId ? string(value.commanderId, 100) : null,
        commanderName: string(value.commanderName, 90),
        wages: integer(value.wages, 0, 1000),
        supplies: integer(value.supplies, 0, 1000),
        raisedYear: integer(value.raisedYear, 0, 1_000_000),
        lastPaidYear: integer(value.lastPaidYear, 0, 1_000_000),
        musterStartedTick: integer(value.musterStartedTick, 0),
        readyTick: integer(value.readyTick, 0),
        returnTick: integer(value.returnTick, 0),
        target: string(value.target, 80),
        joinedWar: Boolean(value.joinedWar),
        lastWarRealm: string(value.lastWarRealm, 80),
        lastOrderYear: integer(value.lastOrderYear, 0, 1_000_000),
        lastOrder: string(value.lastOrder, 24),
        history: (Array.isArray(value.history) ? value.history : [])
            .map(normalizeHistoryEntry).filter(Boolean).slice(0, NOBLE_HOST_HISTORY_LIMIT)
    };
}

export function createNobleFeud({id, houses, cause, year, severity = 1} = {}) {
    return {
        id: string(id || "feud", 80),
        houses: [...new Set((houses || []).map(house => string(house, 80)).filter(Boolean))].slice(0, 2),
        cause: string(cause || "competing claims", 100),
        severity: integer(severity, 1, 5),
        status: "active",
        startedYear: integer(year, 1, 1_000_000),
        lastEscalationYear: integer(year, 1, 1_000_000),
        settledYear: 0,
        ignoredYear: 0,
        mediatorId: null,
        history: []
    };
}

export function normalizeNobleFeud(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const houses = [...new Set((Array.isArray(value.houses) ? value.houses : [])
        .map(house => string(house, 80)).filter(Boolean))].slice(0, 2);
    if (houses.length !== 2) return null;
    const status = value.status === "settled" ? "settled" : "active";
    return {
        id: string(value.id || "feud", 80),
        houses,
        cause: string(value.cause || "competing claims", 100),
        severity: integer(value.severity, 1, 5),
        status,
        startedYear: integer(value.startedYear, 1, 1_000_000),
        lastEscalationYear: integer(value.lastEscalationYear, 1, 1_000_000),
        settledYear: integer(value.settledYear, 0, 1_000_000),
        ignoredYear: integer(value.ignoredYear, 0, 1_000_000),
        mediatorId: value.mediatorId ? string(value.mediatorId, 100) : null,
        history: (Array.isArray(value.history) ? value.history : [])
            .map(normalizeHistoryEntry).filter(Boolean).slice(0, NOBLE_FEUD_HISTORY_LIMIT)
    };
}

export function normalizeNobleFeuds(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
        .map(normalizeNobleFeud).filter(Boolean)
        .filter(feud => {
            if (seen.has(feud.id)) return false;
            seen.add(feud.id);
            return true;
        })
        .slice(0, NOBLE_FEUD_LIMIT);
}

export function nobleFeudHistory(feud, kind, summary, year) {
    if (!feud) return null;
    const entry = {year: integer(year, 1), kind: string(kind, 28), summary: text(summary, 180)};
    feud.history.unshift(entry);
    feud.history = feud.history.slice(0, NOBLE_FEUD_HISTORY_LIMIT);
    return entry;
}
