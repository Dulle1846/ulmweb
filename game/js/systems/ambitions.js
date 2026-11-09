// Long-term royal ambitions. Each ambition reads authoritative live state,
// advances in a fixed order, and pays its reward exactly once. The ladder is
// deliberately broader than the year-12 victory so a realm can keep playing.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { isHousingType, housingCapacityFor } from "./city-config.js";
import { addResource } from "./resources.js";

const RESOURCE_ORDER = ["wood", "stone", "gold", "food"];
const RESOURCE_LABELS = Object.freeze({ wood: "wood", stone: "stone", gold: "gold", food: "food" });

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function countBuildings(type) {
    return state.entities.filter(entity => !entity.dead && entity.type === type).length;
}
function population() {
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
}
function housingCapacity() {
    return state.entities
        .filter(entity => !entity.dead && isHousingType(entity.type))
        .reduce((sum, entity) => sum + housingCapacityFor(entity.type), 0);
}
function satisfaction() {
    return number(state.city?.needs?.summary?.satisfaction, 0);
}
function food() {
    return number(state.resources?.food);
}
function gold() {
    return number(state.resources?.gold);
}
function morale() {
    return number(state.morale);
}
function year() {
    return Math.max(1, number(state.year, 1));
}
function roads() {
    return Math.max(0, number(state.statistics?.totalRoadTilesBuilt));
}
function built() {
    return Math.max(0, number(state.statistics?.totalBuildingsBuilt));
}
function resolvedIssues() {
    return Math.max(0, number(state.statistics?.totalEventsResolved));
}

export const AMBITIONS = Object.freeze([
    Object.freeze({
        id: "full-larder",
        title: "Fill the Royal Granary",
        description: "Keep 220 food in the royal stores while the settlement grows.",
        reward: Object.freeze({ gold: 25 }),
        check: () => food() >= 220,
        progress: () => Math.min(1, food() / 220),
        progressLabel: () => Math.floor(food()) + " / 220 food"
    }),
    Object.freeze({
        id: "room-to-grow",
        title: "Make Room for the Living",
        description: "Reach 20 residents and 24 housing capacity.",
        reward: Object.freeze({ wood: 35, stone: 20 }),
        check: () => population() >= 20 && housingCapacity() >= 24,
        progress: () => Math.min(1, population() / 20, housingCapacity() / 24),
        progressLabel: () => population() + " residents · " + housingCapacity() + " / 24 housing"
    }),
    Object.freeze({
        id: "royal-road",
        title: "Connect the Realm",
        description: "Lay at least 12 road tiles between the crown's settlements.",
        reward: Object.freeze({ gold: 30 }),
        check: () => roads() >= 12,
        progress: () => Math.min(1, roads() / 12),
        progressLabel: () => roads() + " / 12 road tiles"
    }),
    Object.freeze({
        id: "four-fields",
        title: "A Full Harvest",
        description: "Operate four farmsteads, a mill and a bakery together.",
        reward: Object.freeze({ food: 50 }),
        check: () => countBuildings(TYPE.FARM) >= 4 && countBuildings(TYPE.MILL) >= 1 && countBuildings(TYPE.BAKERY) >= 1,
        progress: () => Math.min(1, countBuildings(TYPE.FARM) / 4),
        progressLabel: () => countBuildings(TYPE.FARM) + " / 4 farmsteads · " + countBuildings(TYPE.MILL) + " mill · " + countBuildings(TYPE.BAKERY) + " bakery"
    }),
    Object.freeze({
        id: "crown-wealth",
        title: "A Treasury Worth Guarding",
        description: "Hold 500 gold in the royal treasury.",
        reward: Object.freeze({ stone: 60 }),
        check: () => gold() >= 500,
        progress: () => Math.min(1, gold() / 500),
        progressLabel: () => Math.floor(gold()) + " / 500 gold"
    }),
    Object.freeze({
        id: "civic-heart",
        title: "The Civic Heart",
        description: "Support two wells, a market and a temple.",
        reward: Object.freeze({ food: 40 }),
        check: () => countBuildings(TYPE.WELL) >= 2 && countBuildings(TYPE.MARKET) >= 1 && countBuildings(TYPE.TEMPLE) >= 1,
        progress: () => Math.min(1, (countBuildings(TYPE.WELL) / 2 + Math.min(1, countBuildings(TYPE.MARKET)) + Math.min(1, countBuildings(TYPE.TEMPLE))) / 3),
        progressLabel: () => countBuildings(TYPE.WELL) + " wells · " + countBuildings(TYPE.MARKET) + " market · " + countBuildings(TYPE.TEMPLE) + " temple"
    }),
    Object.freeze({
        id: "steadfast-realm",
        title: "A Steadfast Realm",
        description: "Reach 25 residents and 85 morale.",
        reward: Object.freeze({ gold: 50 }),
        check: () => population() >= 25 && morale() >= 85,
        progress: () => Math.min(1, population() / 25, morale() / 85),
        progressLabel: () => population() + " residents · " + Math.round(morale()) + " morale"
    }),
    Object.freeze({
        id: "royal-line",
        title: "Secure the Royal Line",
        description: "Designate an heir in the royal house.",
        reward: Object.freeze({ food: 60, gold: 20 }),
        check: () => Boolean(state.royal?.heirId),
        progress: () => state.royal?.heirId ? 1 : 0,
        progressLabel: () => state.royal?.heirId ? "An heir is designated" : "No heir designated"
    }),
    Object.freeze({
        id: "master-builders",
        title: "A Realm of Stone and Timber",
        description: "Complete 12 new buildings in this campaign.",
        reward: Object.freeze({ wood: 80, stone: 40 }),
        check: () => built() >= 12,
        progress: () => Math.min(1, built() / 12),
        progressLabel: () => built() + " / 12 buildings completed"
    }),
    Object.freeze({
        id: "seasoned-crown",
        title: "The Crown Hears Every Petition",
        description: "Resolve 12 realm issues through the royal council.",
        reward: Object.freeze({ gold: 60 }),
        check: () => resolvedIssues() >= 12,
        progress: () => Math.min(1, resolvedIssues() / 12),
        progressLabel: () => resolvedIssues() + " / 12 issues resolved"
    }),
    Object.freeze({
        id: "enduring-realm",
        title: "The Kingdom Endures",
        description: "Reach year 12 with at least 80 morale.",
        reward: Object.freeze({ gold: 120 }),
        check: () => year() >= 12 && morale() >= 80,
        progress: () => Math.min(1, year() / 12, morale() / 80),
        progressLabel: () => "Year " + year() + " / 12 · " + Math.round(morale()) + " morale"
    }),
    Object.freeze({
        id: "great-realm",
        title: "A Great and Populous Realm",
        description: "Reach year 16 with 40 residents and satisfied households.",
        reward: Object.freeze({ food: 100, stone: 60 }),
        check: () => year() >= 16 && population() >= 40 && satisfaction() >= 0.6,
        progress: () => Math.min(1, year() / 16, population() / 40, satisfaction() / 0.6),
        progressLabel: () => "Year " + year() + " / 16 · " + population() + " / 40 residents · " + Math.round(satisfaction() * 100) + "% satisfaction"
    }),
    Object.freeze({
        id: "eternal-realm",
        title: "The Eternal Realm",
        description: "Reach year 25 with 55 residents, 2,000 gold and 80 morale.",
        reward: Object.freeze({ gold: 250, food: 150 }),
        check: () => year() >= 25 && population() >= 55 && gold() >= 2000 && morale() >= 80,
        progress: () => Math.min(1, year() / 25, population() / 55, gold() / 2000, morale() / 80),
        progressLabel: () => "Year " + year() + " / 25 · " + population() + " / 55 residents · " + Math.floor(gold()) + " / 2,000 gold"
    })
]);

const AMBITION_IDS = new Set(AMBITIONS.map(ambition => ambition.id));

export function normalizeAmbitions(snapshot) {
    const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
    const completed = {};
    if (source.completed && typeof source.completed === "object" && !Array.isArray(source.completed)) {
        for (const [id, tick] of Object.entries(source.completed)) {
            if (!AMBITION_IDS.has(id)) continue;
            const value = Number(tick);
            completed[id] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        }
    }
    return {
        completed,
        lastEvaluatedTick: Math.max(0, Math.floor(number(source.lastEvaluatedTick)))
    };
}

function ensureAmbitions() {
    // Normalize only malformed or missing data. Rebuilding this object on every
    // lookup would detach updateAmbitions() from the object it is mutating and
    // could pay the same reward repeatedly.
    const current = state.ambitions;
    if (!current || typeof current !== "object" || !current.completed || typeof current.completed !== "object" || Array.isArray(current.completed)) {
        state.ambitions = normalizeAmbitions(current);
    } else {
        current.lastEvaluatedTick = Math.max(0, Math.floor(number(current.lastEvaluatedTick)));
    }
    return state.ambitions;
}

function currentAmbition() {
    const data = ensureAmbitions();
    return AMBITIONS.find(ambition => !Object.prototype.hasOwnProperty.call(data.completed, ambition.id)) || null;
}

function rewardText(reward) {
    return RESOURCE_ORDER
        .filter(key => Number(reward?.[key]) > 0)
        .map(key => "+" + Math.floor(Number(reward[key])) + " " + RESOURCE_LABELS[key])
        .join(" · ");
}

function applyReward(reward) {
    for (const key of RESOURCE_ORDER) {
        const value = Number(reward?.[key]);
        if (Number.isFinite(value) && value > 0) addResource(key, value);
    }
}

function recordCompletion(ambition) {
    state.eventLog.unshift({
        id: ++state.eventSequence,
        text: "AMBITION FULFILLED — " + ambition.title.toUpperCase(),
        color: "#e4bd72",
        tick: state.tick,
        kind: "milestone"
    });
    if (state.eventLog.length > 100) state.eventLog.length = 100;
}

export function updateAmbitions() {
    if (!state.hasStarted || state.isPaused || state.gameOver) return [];
    const data = ensureAmbitions();
    const lastTick = Math.max(0, Math.floor(number(data.lastEvaluatedTick)));
    if (state.tick > 0 && state.tick - lastTick < 20) return [];
    data.lastEvaluatedTick = state.tick;
    const completedNow = [];
    for (let guard = 0; guard < AMBITIONS.length; guard++) {
        const ambition = currentAmbition();
        if (!ambition) break;
        let completed = false;
        try {
            completed = Boolean(ambition.check(state));
        } catch {
            completed = false;
        }
        if (!completed) break;
        data.completed[ambition.id] = state.tick;
        applyReward(ambition.reward);
        recordCompletion(ambition);
        completedNow.push(ambition.id);
    }
    return completedNow;
}

export function getAmbitionSnapshot() {
    const data = ensureAmbitions();
    const current = AMBITIONS.find(ambition => !Object.prototype.hasOwnProperty.call(data.completed, ambition.id)) || null;
    const completedCount = Object.keys(data.completed).length;
    if (!current) {
        return {
            allComplete: true,
            id: "eternal-realm",
            title: "The Eternal Realm",
            description: "Every royal ambition has been fulfilled. The chronicle is yours to continue.",
            rewardText: "",
            progress: 1,
            progressLabel: "Every royal ambition fulfilled",
            completedCount,
            total: AMBITIONS.length
        };
    }
    let progress = 0;
    let progressLabel = "";
    try {
        progress = Math.max(0, Math.min(1, number(current.progress?.(state))));
        progressLabel = String(current.progressLabel?.(state) || "");
    } catch {
        progress = 0;
        progressLabel = "Progress is awaiting a completed settlement.";
    }
    return {
        allComplete: false,
        id: current.id,
        title: current.title,
        description: current.description,
        rewardText: rewardText(current.reward),
        progress,
        progressLabel,
        completedCount,
        total: AMBITIONS.length
    };
}
