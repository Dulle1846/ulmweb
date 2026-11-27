// Pure normalizers for the two additive noble-war systems. Keeping them free
// of imports makes it safe for nobility.js, the host runtime and the feud
// runtime to share one save shape without a module cycle.
export const NOBLE_HOST_HISTORY_LIMIT = 8;
export const NOBLE_FEUD_HISTORY_LIMIT = 12;
export const NOBLE_FEUD_LIMIT = 8;
export const NOBLE_ACTIVE_FEUD_LIMIT = 4;
export const NOBLE_FEUD_STAGES = Object.freeze(["grievance", "arbitration", "blood-feud"]);
export const NOBLE_FEUD_SETTLEMENTS = Object.freeze(["compensation", "charter"]);

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

function feudStage(value) {
    const stage = String(value || "");
    return NOBLE_FEUD_STAGES.includes(stage) ? stage : "grievance";
}

function feudSettlement(value) {
    const settlement = String(value || "");
    return NOBLE_FEUD_SETTLEMENTS.includes(settlement) ? settlement : "";
}

export function createNobleFeud({id, houses, cause, year, severity = 1, stage = "grievance"} = {}) {
    const startedYear = integer(year, 1, 1_000_000);
    return {
        id: string(id || "feud", 80),
        houses: [...new Set((houses || []).map(house => string(house, 80)).filter(Boolean))].slice(0, 2),
        cause: string(cause || "competing claims", 100),
        severity: integer(severity, 1, 5),
        status: "active",
        stage: feudStage(stage),
        stageYear: startedYear,
        startedYear,
        lastEscalationYear: startedYear,
        settledYear: 0,
        ignoredYear: 0,
        arbitratedYear: 0,
        bloodFeudYear: 0,
        mediatorId: null,
        settlement: "",
        history: []
    };
}

export function normalizeNobleFeud(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const houses = [...new Set((Array.isArray(value.houses) ? value.houses : [])
        .map(house => string(house, 80)).filter(Boolean))].slice(0, 2);
    if (houses.length !== 2) return null;
    const status = value.status === "settled" ? "settled" : "active";
    const stage = feudStage(value.stage);
    const startedYear = integer(value.startedYear, 1, 1_000_000);
    const arbitratedYear = integer(value.arbitratedYear, 0, 1_000_000);
    const bloodFeudYear = integer(value.bloodFeudYear, 0, 1_000_000);
    return {
        id: string(value.id || "feud", 80),
        houses,
        cause: string(value.cause || "competing claims", 100),
        severity: integer(value.severity, status === "settled" ? 0 : 1, 5),
        status,
        stage,
        stageYear: integer(value.stageYear, 1, 1_000_000) || startedYear,
        startedYear,
        lastEscalationYear: integer(value.lastEscalationYear, 1, 1_000_000) || startedYear,
        settledYear: integer(value.settledYear, 0, 1_000_000),
        ignoredYear: integer(value.ignoredYear, 0, 1_000_000),
        arbitratedYear: stage === "arbitration" && !arbitratedYear ? startedYear : arbitratedYear,
        bloodFeudYear: stage === "blood-feud" && !bloodFeudYear ? startedYear : bloodFeudYear,
        mediatorId: value.mediatorId ? string(value.mediatorId, 100) : null,
        settlement: status === "settled" ? feudSettlement(value.settlement) : "",
        history: (Array.isArray(value.history) ? value.history : [])
            .map(normalizeHistoryEntry).filter(Boolean).slice(0, NOBLE_FEUD_HISTORY_LIMIT)
    };
}

// One pure penalty source keeps the court view, the house ledger and the feud
// snapshot in agreement. A blood feud costs more than the same severity of a
// grievance; a formal arbitration calms the estate while the terms are held.
export function nobleFeudPenalty(feud) {
    if (!feud || feud.status !== "active") return 0;
    const base = clamp(Number(feud.severity) || 0, 0, 5) * 0.036;
    const factor = feudStage(feud.stage) === "blood-feud" ? 1.25
        : feudStage(feud.stage) === "arbitration" ? 0.85 : 1;
    return clamp(base * factor, 0, 0.25);
}

export function validateNobleFeud(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid noble feud.");
    }
    if (value.stage !== undefined && !NOBLE_FEUD_STAGES.includes(String(value.stage))) {
        throw new Error("Save data contains an invalid noble-feud stage.");
    }
    if (value.settlement !== undefined && value.settlement !== "" && !NOBLE_FEUD_SETTLEMENTS.includes(String(value.settlement))) {
        throw new Error("Save data contains an invalid noble-feud settlement.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > NOBLE_FEUD_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid noble-feud history.");
    }
    return true;
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
