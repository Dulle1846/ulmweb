// Legacy: a bounded, persistent record of the choices that outlive a ruler.
// It feeds the chronicle and a small prestige modifier, but never replaces the
// event log or the existing dynasty history.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";

export const LEGACY_VERSION = 1;
export const LEGACY_LIMIT = 120;
export const PRESTIGE_LIMIT = 10000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

export function createLegacyState(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const entries = Array.isArray(source.entries) ? source.entries.map(normalizeEntry).filter(Boolean).slice(0, LEGACY_LIMIT) : [];
    // Entry ids must stay unique after a save round trip. Deriving the counter
    // from the persisted records prevents a restored save from reusing ids.
    const highestId = entries.reduce((max, entry) => Math.max(max, entry.id), 0);
    return {
        version: LEGACY_VERSION,
        foundedYear: Math.max(1, Math.floor(Number(source.foundedYear) || Number(state.year) || 1)),
        prestige: clamp(source.prestige, 0, PRESTIGE_LIMIT),
        nextId: Math.max(highestId + 1, Math.floor(Number(source.nextId) || 1)),
        entries,
        reforms: Math.max(0, Math.floor(Number(source.reforms) || 0)),
        discoveries: Math.max(0, Math.floor(Number(source.discoveries) || 0))
    };
}

function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const title = clean(entry.title, 96);
    if (!title) return null;
    return {
        id: Math.max(1, Math.floor(Number(entry.id) || 1)),
        kind: clean(entry.kind || "realm", 24) || "realm",
        title,
        detail: clean(entry.detail, 320),
        year: Math.max(1, Math.floor(Number(entry.year) || 1)),
        tick: Math.max(0, Math.floor(Number(entry.tick) || 0)),
        importance: clamp(entry.importance ?? 1, 0, 5)
    };
}

export function normalizeLegacyState(input = state.legacy) {
    state.legacy = createLegacyState(input && typeof input === "object" ? input : {});
    return state.legacy;
}

export function validateLegacyState(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Legacy must be an object.");
    if (!Array.isArray(input.entries) || input.entries.length > LEGACY_LIMIT) throw new Error("Legacy entries are invalid.");
    if (!Number.isFinite(Number(input.prestige)) || Number(input.prestige) < 0) throw new Error("Legacy prestige is invalid.");
    for (const entry of input.entries) {
        if (!entry || typeof entry !== "object" || typeof entry.title !== "string" || !entry.title.trim()) throw new Error("Legacy entry is invalid.");
    }
    return true;
}

export function recordLegacy(kind, title, detail = "", { importance = 1, year = state.year, tick = state.tick } = {}) {
    const legacy = normalizeLegacyState();
    const entry = normalizeEntry({ id: legacy.nextId++, kind, title, detail, importance, year, tick });
    if (!entry) return null;
    legacy.entries.unshift(entry);
    if (legacy.entries.length > LEGACY_LIMIT) legacy.entries.length = LEGACY_LIMIT;
    legacy.prestige = clamp(legacy.prestige + entry.importance, 0, PRESTIGE_LIMIT);
    addLog(entry.title + (entry.detail ? " — " + entry.detail : ""), "#d6b56d", entry.kind);
    return entry;
}

export function recordDiscovery(tech) {
    const legacy = normalizeLegacyState();
    legacy.discoveries++;
    return recordLegacy("discovery", "Discovery: " + tech.label, tech.description, { importance: 2 });
}

export function recordReform(formLabel) {
    const legacy = normalizeLegacyState();
    legacy.reforms++;
    return recordLegacy("reform", "The constitution changes", formLabel + " is now in force.", { importance: 3 });
}

export function legacyEra(prestige, year) {
    const p = Number(prestige) || 0;
    const y = Number(year) || 1;
    if (y === 1 && p < 5) return "Foundation";
    if (p >= 90) return "Golden Age";
    if (p >= 45) return "High Kingdom";
    if (p >= 15) return "Rising Realm";
    return "Early Years";
}

export function getLegacyModifiers() {
    const legacy = state.legacy || createLegacyState();
    const prestige = clamp(legacy.prestige, 0, PRESTIGE_LIMIT);
    return {
        prestige,
        legitimacyYear: Math.min(0.25, prestige / 1600),
        tradeFactor: 1 + Math.min(0.04, prestige / 4000),
        research: Math.min(0.08, prestige / 2500)
    };
}

export function getLegacySnapshot() {
    const legacy = state.legacy || createLegacyState();
    return {
        ...legacy,
        entries: legacy.entries.map(entry => ({ ...entry })),
        era: legacyEra(legacy.prestige, state.year),
        modifiers: getLegacyModifiers(),
        entryCount: legacy.entries.length
    };
}
