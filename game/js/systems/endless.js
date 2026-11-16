// Endless Realm: the chronicle has no terminal state.
//
// The authored ambitions, Eternal Deeds and Crown Endeavours already provide
// goals after year 25. This layer removes the two hard stops that could still
// end a mature realm - a morale collapse and the destruction of the keep - and
// makes their consequences recoverable instead. It also records the endless
// ages (25 years each) and a bounded history of the realm's worst days.
//
// The normal campaign remains available by unchecking Endless Realm at
// founding. Old saves without an endless block are upgraded to endless so a
// long-running realm is never silently stranded on a terminal save.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";

export const ENDLESS_VERSION = 1;
export const ENDLESS_AGE_YEARS = 25;
export const ENDLESS_RESCUE_COOLDOWN = 400;
export const ENDLESS_MORALE_RESET = 26;
export const ENDLESS_HISTORY_LIMIT = 12;
const ENDLESS_COUNT_LIMIT = 1_000_000;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positiveYear = value => Math.max(1, Math.floor(finite(value, 1)));
const nonNegative = value => Math.max(0, Math.floor(finite(value, 0)));

export function endlessAgeForYear(year) {
    return Math.max(1, Math.floor((positiveYear(year) - 1) / ENDLESS_AGE_YEARS) + 1);
}

export function endlessAgeStartYear(age) {
    return (Math.max(1, Math.floor(finite(age, 1))) - 1) * ENDLESS_AGE_YEARS + 1;
}

function ordinal(age) {
    const value = Math.max(1, Math.floor(finite(age, 1)));
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return value + "TH";
    const suffix = value % 10 === 1 ? "ST" : value % 10 === 2 ? "ND" : value % 10 === 3 ? "RD" : "TH";
    return value + suffix;
}

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const kind = entry.kind === "rescue" || entry.kind === "keep" || entry.kind === "age" ? entry.kind : null;
    if (!kind) return null;
    return {
        kind,
        age: Math.max(1, Math.floor(finite(entry.age, 1))),
        year: positiveYear(entry.year),
        tick: nonNegative(entry.tick)
    };
}

export function createEndlessState(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const enabled = source.enabled !== false;
    const year = positiveYear(source.bestYear || source.year || 1);
    const age = Math.max(endlessAgeForYear(year), Math.max(1, Math.floor(finite(source.age, 1))));
    return {
        version: ENDLESS_VERSION,
        enabled,
        age,
        ageStartedYear: endlessAgeStartYear(age),
        bestYear: Math.max(year, positiveYear(source.bestYear || 1)),
        collapses: Math.min(ENDLESS_COUNT_LIMIT, nonNegative(source.collapses)),
        rescues: Math.min(ENDLESS_COUNT_LIMIT, nonNegative(source.rescues)),
        keepHolds: Math.min(ENDLESS_COUNT_LIMIT, nonNegative(source.keepHolds)),
        lastRescueTick: nonNegative(source.lastRescueTick),
        history: Array.isArray(source.history)
            ? source.history.map(normalizeHistoryEntry).filter(Boolean).slice(0, ENDLESS_HISTORY_LIMIT)
            : []
    };
}

// A save must never be able to freeze the realm in a terminal state. The age
// is derived from the authoritative calendar, not trusted from the save, so a
// hand-edited or old save still continues at the correct age.
export function normalizeEndlessState(input = state.endless, year = state.year) {
    const normalized = createEndlessState(input);
    normalized.age = endlessAgeForYear(year);
    normalized.ageStartedYear = endlessAgeStartYear(normalized.age);
    normalized.bestYear = Math.max(normalized.bestYear, positiveYear(year));
    state.endless = normalized;
    return normalized;
}

export function ensureEndlessState() {
    const current = state.endless;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== ENDLESS_VERSION) {
        return normalizeEndlessState(current, state.year);
    }
    return current;
}

export function isEndlessEnabled() {
    return ensureEndlessState().enabled !== false;
}

function pushHistory(endless, kind) {
    endless.history.unshift({
        kind,
        age: endless.age,
        year: positiveYear(state.year),
        tick: nonNegative(state.tick)
    });
    if (endless.history.length > ENDLESS_HISTORY_LIMIT) {
        endless.history.length = ENDLESS_HISTORY_LIMIT;
    }
}

// Called once per simulation tick. The common path is two integer reads and
// one comparison; allocations only happen when a new age begins.
export function updateEndlessRealm() {
    const endless = ensureEndlessState();
    if (!endless.enabled) return null;
    const year = positiveYear(state.year);
    if (year > endless.bestYear) endless.bestYear = year;
    const age = endlessAgeForYear(year);
    if (age <= endless.age) return null;
    for (let next = endless.age + 1; next <= age; next++) {
        endless.age = next;
        endless.ageStartedYear = endlessAgeStartYear(next);
        pushHistory(endless, "age");
        addLog(
            "THE " + ordinal(next) + " AGE BEGINS — THE CHRONICLE CONTINUES",
            "#d8bd82",
            "endless"
        );
    }
    return endless.age;
}

// A morale collapse is a setback, not an ending. The crown loses legitimacy
// and the realm restarts from a low but survivable morale floor. The cooldown
// prevents a permanently starving realm from retriggering the recovery every
// day while still leaving the player time to repair the food or housing chain.
export function recoverEndlessMorale() {
    const endless = ensureEndlessState();
    if (!endless.enabled) return false;
    const tick = nonNegative(state.tick);
    if (tick - endless.lastRescueTick < ENDLESS_RESCUE_COOLDOWN) return false;
    endless.collapses = Math.min(ENDLESS_COUNT_LIMIT, endless.collapses + 1);
    endless.rescues = Math.min(ENDLESS_COUNT_LIMIT, endless.rescues + 1);
    endless.lastRescueTick = tick;
    state.morale = Math.max(ENDLESS_MORALE_RESET, finite(state.morale, 0));
    if (state.politics) {
        state.politics.legitimacy = Math.max(0, finite(state.politics.legitimacy) - 3);
    }
    pushHistory(endless, "rescue");
    addLog(
        "THE REALM ENDURES — A HARSH LESSON · MORALE RESTORED",
        "#e4bd72",
        "endless"
    );
    return true;
}

// The keep cannot be removed from an endless realm. It is badly damaged, the
// raid still costs lives and resources, but the crown keeps a seat to rebuild
// from. Returns true when the keep was saved.
export function holdEndlessKeep(target) {
    if (!target || !isEndlessEnabled()) return false;
    const maxHp = Math.max(1, finite(target.maxHp, finite(target.hp, 1)));
    target.hp = Math.max(1, Math.round(maxHp * 0.35));
    target.dead = false;
    const endless = ensureEndlessState();
    endless.keepHolds = Math.min(ENDLESS_COUNT_LIMIT, endless.keepHolds + 1);
    pushHistory(endless, "keep");
    addLog(
        "THE KEEP HOLDS — THE CROWN WILL REBUILD",
        "#e4bd72",
        "endless"
    );
    return true;
}

export function getEndlessSnapshot() {
    const endless = ensureEndlessState();
    const year = positiveYear(state.year);
    const age = endless.enabled ? endlessAgeForYear(year) : endless.age;
    const nextAgeYear = endless.enabled ? age * ENDLESS_AGE_YEARS + 1 : 0;
    const label = endless.enabled
        ? "∞ ENDLESS · AGE " + age + " · NEXT " + nextAgeYear
        : "CLASSIC REALM · FINITE DEFEAT";
    return {
        enabled: endless.enabled,
        age,
        ageStartedYear: endlessAgeStartYear(age),
        nextAgeYear,
        year,
        bestYear: Math.max(endless.bestYear, year),
        collapses: endless.collapses,
        rescues: endless.rescues,
        keepHolds: endless.keepHolds,
        lastRescueTick: endless.lastRescueTick,
        historyLength: endless.history.length,
        label
    };
}
