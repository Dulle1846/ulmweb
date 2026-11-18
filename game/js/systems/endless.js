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
import { queueMessage } from "../core/presentation-effects.js";
import { TYPE } from "../core/types.js";
import { spawnEntity, buildingOverlaps } from "../world/entities.js";
import { addResource } from "./resources.js";
import { depositGood } from "./logistics.js";
import { housingCapacityFor } from "./city-config.js";

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
    const kind = entry.kind === "rescue" || entry.kind === "keep" || entry.kind === "age" || entry.kind === "relief" ? entry.kind : null;
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
        reliefs: Math.min(ENDLESS_COUNT_LIMIT, nonNegative(source.reliefs)),
        lastReliefTick: nonNegative(source.lastReliefTick),
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

// Before an endless realm loses its last household, the crown can send one
// bounded relief expedition. It restores only missing essentials, staffs them
// with the returning settlers, and tops up the stores. Two years must pass
// between expeditions; the normal city economy still has to carry the realm.
export function updateEndlessRelief() {
    const endless = ensureEndlessState();
    if (!endless.enabled) return false;
    const tick = nonNegative(state.tick);
    if (tick < 800 || tick - nonNegative(endless.lastReliefTick) < 800) return false;
    const living = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const food = Number(state.resources?.food) || 0;
    const firewood = Number(state.city?.needs?.summary?.firewoodStock) || 0;
    if (living >= 12 && food >= 40 && firewood >= 2) return false;
    const keep = state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP);
    if (!keep) return false;

    const findReliefSite = (type) => {
        for (let radius = 3; radius <= 18; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const x = keep.x + dx, y = keep.y + dy;
                    if (!buildingOverlaps(x, y, type)) return { x, y };
                }
            }
        }
        return null;
    };
    const restored = [];
    const reliefNames = new Map([
        [TYPE.FARM, "farm"], [TYPE.MILL, "mill"], [TYPE.BAKERY, "bakery"],
        [TYPE.SAWMILL, "sawmill"], [TYPE.WAREHOUSE, "storehouse"], [TYPE.HOUSE, "cottage"]
    ]);
    const restore = (type) => {
        if (state.entities.some(entity => !entity.dead && entity.type === type &&
            !(entity.construction && entity.construction.stage < 3))) return null;
        const site = findReliefSite(type);
        const building = site ? spawnEntity(site.x, site.y, type) : null;
        if (building) restored.push(reliefNames.get(type) || "building");
        return building;
    };
    const farm = restore(TYPE.FARM);
    const mill = restore(TYPE.MILL);
    const bakery = restore(TYPE.BAKERY);
    const sawmill = restore(TYPE.SAWMILL);
    const warehouse = restore(TYPE.WAREHOUSE);
    const homes = state.entities.filter(entity => !entity.dead &&
        [TYPE.HOUSE, TYPE.TENT, TYPE.STONE_HOUSE].includes(entity.type) &&
        !(entity.construction && entity.construction.stage < 3));
    const settlers = Math.min(6, Math.max(0, 12 - living));
    // A household without a bed is not a recovery. Raise enough emergency
    // cottages to cover the people already here and the settlers on their way;
    // this also handles a second relief arriving into a crowded district.
    let housingCapacity = homes.reduce((sum, home) => sum + housingCapacityFor(home.type), 0);
    for (let index = 0; index < 6 && housingCapacity < living + settlers; index++) {
        const site = findReliefSite(TYPE.HOUSE);
        if (!site) break;
        const cottage = spawnEntity(site.x, site.y, TYPE.HOUSE);
        if (!cottage) break;
        restored.push("cottage");
        homes.push(cottage);
        housingCapacity += housingCapacityFor(TYPE.HOUSE);
    }
    const jobs = [
        [farm, "farmer"], [mill, "miller"], [mill, "miller"],
        [bakery, "baker"], [sawmill, "sawyer"], [warehouse, "hauler"]
    ];
    let arrived = 0;
    for (let index = 0; index < settlers; index++) {
        const home = homes.length ? homes[index % homes.length] : keep;
        const villager = spawnEntity(keep.x + (index % 3) - 1, keep.y + 1 + Math.floor(index / 3), TYPE.VILLAGER);
        if (!villager) break;
        villager.home = { x: home.x, y: home.y };
        villager.anchor = { x: home.x, y: home.y };
        villager.householdId = home === keep ? "keep:" + keep.x + ":" + keep.y : "house:" + home.x + ":" + home.y;
        villager.lastAgedYear = state.year;
        villager.jobRefreshTimer = 0;
        villager.civicOrigin = "crown-relief";
        const [workplace, job] = jobs[index] || [null, null];
        if (workplace && !workplace.dead) {
            villager.workplace = workplace;
            villager.job = job;
            villager.anchor = { x: workplace.x, y: workplace.y };
            villager.jobRefreshTimer = 220;
        }
        arrived += 1;
    }
    const foodTarget = living === 0 ? 600 : 320;
    const foodMissing = Math.max(0, foodTarget - food);
    const woodMissing = Math.max(0, 200 - (Number(state.resources?.wood) || 0));
    const stoneMissing = Math.max(0, 80 - (Number(state.resources?.stone) || 0));
    if (foodMissing > 0) addResource("food", foodMissing);
    if (woodMissing > 0) addResource("wood", woodMissing);
    if (stoneMissing > 0) addResource("stone", stoneMissing);
    if (firewood < 2 && warehouse) depositGood("firewood", 40, warehouse.x, warehouse.y);
    state.morale = Math.max(state.morale, 35);
    endless.reliefs = Math.min(ENDLESS_COUNT_LIMIT, nonNegative(endless.reliefs) + 1);
    endless.lastReliefTick = tick;
    pushHistory(endless, "relief");
    const restoredCounts = new Map();
    for (const name of restored) restoredCounts.set(name, (restoredCounts.get(name) || 0) + 1);
    const restoredPhrases = [...restoredCounts].map(([name, count]) => count > 1 ? count + " " + name + "s" : name);
    const listPhrase = (items) => items.length < 2
        ? (items[0] || "")
        : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
    const details = [];
    if (arrived > 0) details.push(arrived + (arrived === 1 ? " SETTLER ARRIVED" : " SETTLERS ARRIVED"));
    if (restoredPhrases.length) details.push(listPhrase(restoredPhrases).toUpperCase() + " RESTORED");
    if (foodMissing > 0 || woodMissing > 0 || stoneMissing > 0 || firewood < 2) details.push("STORES REPLENISHED");
    const reliefText = details.length ? details.join(" · ") : "THE HEARTH IS REKINDLED";
    addLog("CROWN RELIEF — " + reliefText, "#e4bd72", "endless");
    queueMessage("CROWN RELIEF", reliefText, 9000);
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
        reliefs: endless.reliefs,
        lastRescueTick: endless.lastRescueTick,
        lastReliefTick: endless.lastReliefTick,
        historyLength: endless.history.length,
        label
    };
}
