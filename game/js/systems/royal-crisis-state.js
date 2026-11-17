// Pure, import-free save shape for the royal crisis systems. Keeping this
// module separate lets the royal house normalizer and the crisis runtime share
// one bounded representation without a module cycle.
export const ROYAL_CLAIM_LIMIT = 6;
export const ROYAL_CRISIS_HISTORY_LIMIT = 16;
export const ROYAL_ABDICATION_HISTORY_LIMIT = 8;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max,
    Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max,
    Math.floor(Number(value) || 0)));
const text = (value, limit) => String(value || "").trim().slice(0, limit);

function normalizeHistory(value, limit) {
    return (Array.isArray(value) ? value : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .map(entry => ({
            year: integer(entry.year, 1, 1_000_000),
            kind: text(entry.kind || "royal-crisis", 32),
            detail: text(entry.detail || entry.summary || "", 180)
        }))
        .filter(entry => entry.detail)
        .slice(-limit);
}

export function createRegencyState() {
    return {
        active: false,
        regentId: null,
        minorKingId: null,
        sinceYear: 0,
        reason: "",
        councilSupport: 0,
        lastUpdateYear: 0,
        claimsSeeded: false,
        regentPriorRole: null,
        history: []
    };
}

export function normalizeRegency(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        active: source.active === true,
        regentId: source.regentId ? text(source.regentId, 100) : null,
        minorKingId: source.minorKingId ? text(source.minorKingId, 100) : null,
        sinceYear: integer(source.sinceYear, 0, 1_000_000),
        reason: text(source.reason || "", 40),
        councilSupport: clamp(source.councilSupport ?? 0),
        lastUpdateYear: integer(source.lastUpdateYear, 0, 1_000_000),
        claimsSeeded: source.claimsSeeded === true,
        regentPriorRole: source.regentPriorRole ? text(source.regentPriorRole, 40) : null,
        history: normalizeHistory(source.history, ROYAL_CRISIS_HISTORY_LIMIT)
    };
}

export function normalizeClaim(value, index = 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const personId = text(value.personId, 100);
    if (!personId) return null;
    const status = ["pressing", "settled", "withdrawn", "defeated", "won"].includes(value.status)
        ? value.status : "pressing";
    return {
        id: text(value.id || ("claim-" + personId), 100) || ("claim-" + index),
        personId,
        claimantName: text(value.claimantName || "", 90),
        source: ["royal-sibling", "royal-kin", "noble-house", "council"].includes(value.source)
            ? value.source : "royal-kin",
        claimStrength: clamp(value.claimStrength ?? 0),
        support: clamp(value.support ?? 0),
        status,
        sinceYear: integer(value.sinceYear, 0, 1_000_000),
        lastActionYear: integer(value.lastActionYear, 0, 1_000_000),
        houseId: value.houseId ? text(value.houseId, 100) : null,
        houseName: text(value.houseName || "", 90)
    };
}

export function normalizeClaims(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
        .map((claim, index) => normalizeClaim(claim, index))
        .filter(Boolean)
        .filter(claim => {
            if (seen.has(claim.personId)) return false;
            seen.add(claim.personId);
            return true;
        })
        .slice(0, ROYAL_CLAIM_LIMIT);
}

export function createCivilConflictState() {
    return {
        active: false,
        phase: "peace",
        severity: 0,
        cause: "",
        claimantId: null,
        startedYear: 0,
        resolvedYear: 0,
        lastUpdateYear: 0,
        battles: 0,
        casualties: 0,
        houses: [],
        history: []
    };
}

export function normalizeCivilConflict(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const phase = ["peace", "tension", "civil-war", "resolved"].includes(source.phase)
        ? source.phase : (source.active === true ? "tension" : "peace");
    const houses = (Array.isArray(source.houses) ? source.houses : [])
        .map(house => {
            if (typeof house === "string") return { id: text(house, 100), name: text(house, 90) };
            if (!house || typeof house !== "object") return null;
            const id = text(house.id, 100);
            if (!id) return null;
            return { id, name: text(house.name || house.familyName || id, 90) };
        })
        .filter(Boolean)
        .slice(0, 6);
    return {
        active: source.active === true,
        phase,
        severity: clamp(source.severity ?? 0),
        cause: text(source.cause || "", 80),
        claimantId: source.claimantId ? text(source.claimantId, 100) : null,
        startedYear: integer(source.startedYear, 0, 1_000_000),
        resolvedYear: integer(source.resolvedYear, 0, 1_000_000),
        lastUpdateYear: integer(source.lastUpdateYear, 0, 1_000_000),
        battles: integer(source.battles, 0),
        casualties: integer(source.casualties, 0),
        houses,
        history: normalizeHistory(source.history, ROYAL_CRISIS_HISTORY_LIMIT)
    };
}

export function normalizeRoyalCrisisState(royal) {
    const source = royal && typeof royal === "object" && !Array.isArray(royal) ? royal : {};
    source.regency = normalizeRegency(source.regency);
    source.claims = normalizeClaims(source.claims);
    source.civilConflict = normalizeCivilConflict(source.civilConflict);
    source.crisisHistory = normalizeHistory(source.crisisHistory, ROYAL_CRISIS_HISTORY_LIMIT);
    source.abdicationHistory = (Array.isArray(source.abdicationHistory) ? source.abdicationHistory : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .map(entry => ({
            year: integer(entry.year, 1, 1_000_000),
            fromId: text(entry.fromId, 100),
            fromName: text(entry.fromName, 90),
            toId: text(entry.toId, 100),
            toName: text(entry.toName, 90),
            regency: entry.regency === true
        }))
        .filter(entry => entry.fromId && entry.toId)
        .slice(-ROYAL_ABDICATION_HISTORY_LIMIT);
    source.lastCrisisYear = integer(source.lastCrisisYear, 0, 1_000_000);
    return source;
}
