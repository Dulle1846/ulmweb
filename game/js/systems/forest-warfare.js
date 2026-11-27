// 1.2.23.1.211–240 — war, diplomacy, borders and strategy in the woodland.
//
// One bounded frontier ledger over the existing world map, diplomatic court,
// royal army, forest succession and sacred-grove guard. It is not a second
// army, province map or market: every action spends real resources and writes
// the same province, soldier, trade, grove and forest records the rest of the
// game already uses. All state is additive under
// state.economy.productionChains.forestWarfare, so old saves load unchanged.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { recordLegacy } from "./legacy.js";
import { getMilitarySnapshot, recordMilitaryWound, recordMilitaryCasualty } from "./military.js";
import { cancelTradeAgreement, ensureDiplomacy } from "./diplomacy.js";
import { ensureWorldMap } from "./world-map.js";
import { controlledBurnNearestForestTile, findBurnableForestTile } from "./forest-succession.js";
import { sacredGroveTileAt } from "../world/sacred-groves.js";
import { DIPLOMATIC_REALMS } from "./diplomacy-config.js";
import { regionDefinitionFor } from "../world/world-regions.js";
import {
    FOREST_WAR_PROFILE_LIST, FOREST_WAR_PROFILES, FOREST_WAR_FRONTS,
    FOREST_WAR_FRONTS_BY_REALM, FOREST_WARFARE_REQUIREMENTS, forestWarProfileFor,
} from "../world/forest-warfare.js";

export const FOREST_WARFARE_VERSION = 1;
export const FOREST_WARFARE_LIMITS = Object.freeze({
    version: FOREST_WARFARE_VERSION,
    posts: 3, watch: 3, roads: 3, scouts: 3, abatis: 3, elephants: 3,
    partisans: 5, siegeMaterial: 30, shipTimber: 24, settlers: 4, rebels: 6,
    refugees: 12, scars: 12, history: 24, actions: 20,
});
export const FOREST_WAR_COSTS = Object.freeze({
    post: Object.freeze({ wood: 10, gold: 6 }),
    watch: Object.freeze({ gold: 8, food: 2 }),
    road: Object.freeze({ wood: 12, stone: 4, gold: 8 }),
    scouts: Object.freeze({ gold: 6, food: 3 }),
    ambush: Object.freeze({ food: 3 }),
    battle: Object.freeze({}),
    siegeTimber: Object.freeze({ wood: 15 }),
    siege: Object.freeze({}),
    shipTimber: Object.freeze({ wood: 12, gold: 4 }),
    elephants: Object.freeze({ food: 12, gold: 10 }),
    abatis: Object.freeze({ wood: 6, food: 4 }),
    partisans: Object.freeze({ food: 5, gold: 3 }),
    warFire: Object.freeze({ food: 3 }),
    burnFields: Object.freeze({ food: 2 }),
    deport: Object.freeze({ gold: 6 }),
    quota: Object.freeze({ food: 4 }),
    route: Object.freeze({ wood: 10, gold: 5 }),
    smuggling: Object.freeze({ food: 2 }),
    maps: Object.freeze({ gold: 12, research: 4 }),
    treaty: Object.freeze({ gold: 8 }),
    preserve: Object.freeze({ gold: 12 }),
    rights: Object.freeze({ gold: 10 }),
    settlers: Object.freeze({ food: 6 }),
    colonize: Object.freeze({ wood: 20, food: 10, gold: 15 }),
    suppress: Object.freeze({ gold: 10, food: 4 }),
    refugees: Object.freeze({ food: 10, wood: 6 }),
    colony: Object.freeze({ wood: 18, stone: 10, gold: 12 }),
    clearCamp: Object.freeze({ food: 3 }),
    recovery: Object.freeze({ gold: 8, wood: 4 }),
});
export const FOREST_EMBARGO_GOODS = Object.freeze([
    Object.freeze({ id: "timber", label: "Timber", detail: "Sawn wood, beams and ship timber" }),
    Object.freeze({ id: "resin", label: "Resin", detail: "Pitch, tar and naval stores" }),
    Object.freeze({ id: "medicine", label: "Medicine", detail: "Barks, herbs and clinic doses" }),
]);
export const FOREST_CUSTOMS_RATES = Object.freeze([0, 5, 10, 15]);
export const FOREST_WAR_TECHS = Object.freeze({
    maps: "woodland-cartography",
});

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yearNow = () => Math.max(1, Math.floor(number(state.year, 1)));
const seasonNow = () => Math.max(0, Math.min(3, Math.floor(number(state.seasonIndex, 0))));
const SEASON_LABELS = Object.freeze(["Spring", "Summer", "Autumn", "Winter"]);
const EMBARGO_IDS = FOREST_EMBARGO_GOODS.map(entry => entry.id);

function hashString(text) {
    let hash = 2166136261;
    for (let index = 0; index < String(text).length; index++) {
        hash ^= String(text).charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function cleanText(value, limit = 200) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function emptyFront(realmId) {
    const front = FOREST_WAR_FRONTS_BY_REALM[realmId];
    return {
        realmId,
        provinceId: front?.provinceId || "",
        posts: 0, watch: 0, road: 0, scouts: 0, abatis: 0,
        elephants: 0, partisans: 0, siegeMaterial: 0, shipTimber: 0,
        maps: false, rights: false, treaty: null, preserve: null,
        embargo: null, customs: 0, route: false,
        settlers: 0, colony: null, rebels: 0, refugees: 0, deportations: 0,
        scars: [], battles: 0, victories: 0, warYears: 0,
        pressure: 0,
        postYear: 0, watchYear: 0, roadYear: 0, scoutYear: 0,
        abatisYear: 0, elephantYear: 0, partisanYear: 0,
        ambushYear: 0, battleYear: 0, fireYear: 0, burnYear: 0,
        deportYear: 0, quotaYear: 0, smuggleYear: 0, settlerYear: 0,
        suppressYear: 0, refugeeYear: 0, clearCampYear: 0, recoveryYear: 0,
        lastActionYear: 0,
    };
}

function emptyLedger() {
    return {
        version: FOREST_WARFARE_VERSION,
        fronts: FOREST_WAR_FRONTS.map(front => emptyFront(front.realmId)),
        history: [],
        totals: {
            battles: 0, victories: 0, provincesClaimed: 0, shipsLaunched: 0,
            scarsHealed: 0, rebelsCleared: 0, refugeesSettled: 0, smugglersCaught: 0,
        },
        lastUpdateYear: 0,
        revision: 0,
    };
}

function cleanScar(entry) {
    if (!entry || typeof entry !== "object") return null;
    const x = Math.floor(number(entry.x, -1));
    const y = Math.floor(number(entry.y, -1));
    if (x < 0 || y < 0) return null;
    return {
        x, y,
        year: Math.max(1, Math.floor(number(entry.year, 1))),
        severity: clamp(entry.severity ?? 6, 1, 16),
        cause: cleanText(entry.cause, 60) || "war fire",
    };
}

function cleanTreaty(entry) {
    if (!entry || typeof entry !== "object") return null;
    const sinceYear = Math.max(1, Math.floor(number(entry.sinceYear, 1)));
    return {
        sinceYear,
        untilYear: Math.max(sinceYear + 1, Math.floor(number(entry.untilYear, sinceYear + 8))),
        term: cleanText(entry.term, 160) || "Shared woodland and a closed border",
    };
}

function cleanPreserve(entry) {
    if (!entry || typeof entry !== "object") return null;
    const x = Math.floor(number(entry.x, -1));
    const y = Math.floor(number(entry.y, -1));
    if (x < 0 || y < 0) return null;
    return { x, y, year: Math.max(1, Math.floor(number(entry.year, 1))) };
}

function cleanColony(entry) {
    if (!entry || typeof entry !== "object") return null;
    return {
        year: Math.max(1, Math.floor(number(entry.year, 1))),
        military: Boolean(entry.military),
    };
}

function cleanFront(value, realmId) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const front = emptyFront(realmId);
    for (const key of ["posts", "watch", "road", "scouts", "abatis", "elephants", "partisans", "settlers", "rebels", "refugees", "deportations", "battles", "victories", "warYears"]) {
        const max = key === "posts" ? FOREST_WARFARE_LIMITS.posts
            : key === "watch" ? FOREST_WARFARE_LIMITS.watch
                : key === "road" ? FOREST_WARFARE_LIMITS.roads
                    : key === "scouts" ? FOREST_WARFARE_LIMITS.scouts
                        : key === "abatis" ? FOREST_WARFARE_LIMITS.abatis
                            : key === "elephants" ? FOREST_WARFARE_LIMITS.elephants
                                : key === "partisans" ? FOREST_WARFARE_LIMITS.partisans
                                    : key === "settlers" ? FOREST_WARFARE_LIMITS.settlers
                                        : key === "rebels" ? FOREST_WARFARE_LIMITS.rebels
                                            : key === "refugees" ? FOREST_WARFARE_LIMITS.refugees
                                                : 9999;
        front[key] = Math.max(0, Math.min(max, Math.floor(number(source[key], 0))));
    }
    front.siegeMaterial = clamp(source.siegeMaterial ?? 0, 0, FOREST_WARFARE_LIMITS.siegeMaterial);
    front.shipTimber = clamp(source.shipTimber ?? 0, 0, FOREST_WARFARE_LIMITS.shipTimber);
    front.maps = Boolean(source.maps);
    front.rights = Boolean(source.rights);
    front.route = Boolean(source.route);
    front.embargo = EMBARGO_IDS.includes(source.embargo) ? source.embargo : null;
    front.customs = FOREST_CUSTOMS_RATES.includes(Number(source.customs)) ? Number(source.customs) : 0;
    front.treaty = cleanTreaty(source.treaty);
    front.preserve = cleanPreserve(source.preserve);
    front.colony = cleanColony(source.colony);
    front.pressure = clamp(source.pressure ?? 0, 0, 100);
    for (const key of ["postYear", "watchYear", "roadYear", "scoutYear", "abatisYear", "elephantYear", "partisanYear", "ambushYear", "battleYear", "fireYear", "burnYear", "deportYear", "quotaYear", "smuggleYear", "settlerYear", "suppressYear", "refugeeYear", "clearCampYear", "recoveryYear", "lastActionYear"]) {
        front[key] = Math.max(0, Math.floor(number(source[key], 0)));
    }
    for (const entry of Array.isArray(source.scars) ? source.scars : []) {
        const scar = cleanScar(entry);
        if (scar) front.scars.push(scar);
        if (front.scars.length >= FOREST_WARFARE_LIMITS.scars) break;
    }
    return front;
}

export function normalizeForestWarfare(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const ledger = emptyLedger();
    const rows = Array.isArray(source.fronts) ? source.fronts : [];
    ledger.fronts = FOREST_WAR_FRONTS.map(front =>
        cleanFront(rows.find(row => row && row.realmId === front.realmId) || null, front.realmId));
    for (const entry of Array.isArray(source.history) ? source.history : []) {
        if (!entry || typeof entry !== "object") continue;
        const summary = cleanText(entry.summary, 180);
        if (!summary) continue;
        ledger.history.push({
            year: Math.max(1, Math.floor(number(entry.year, 1))),
            kind: cleanText(entry.kind, 32) || "frontier",
            realmId: FOREST_WAR_FRONTS_BY_REALM[entry.realmId] ? entry.realmId : null,
            summary,
        });
        if (ledger.history.length >= FOREST_WARFARE_LIMITS.history) break;
    }
    for (const key of Object.keys(ledger.totals)) ledger.totals[key] = Math.max(0, Math.floor(number(source.totals?.[key], 0)));
    ledger.lastUpdateYear = Math.max(0, Math.floor(number(source.lastUpdateYear, 0)));
    ledger.revision = Math.max(0, Math.floor(number(source.revision, 0)));
    return ledger;
}

export function ensureForestWarfare() {
    if (!state.economy || typeof state.economy !== "object") state.economy = {};
    if (!state.economy.productionChains || typeof state.economy.productionChains !== "object" || Array.isArray(state.economy.productionChains)) {
        state.economy.productionChains = {};
    }
    const current = state.economy.productionChains.forestWarfare;
    const complete = current && current.version === FOREST_WARFARE_VERSION
        && Array.isArray(current.fronts) && current.fronts.length === FOREST_WAR_FRONTS.length
        && Array.isArray(current.history) && current.totals && typeof current.totals === "object"
        && current.fronts.every(front => front && FOREST_WAR_FRONTS_BY_REALM[front.realmId] && Array.isArray(front.scars));
    if (complete) return current;
    state.economy.productionChains.forestWarfare = normalizeForestWarfare(current);
    return state.economy.productionChains.forestWarfare;
}

function front(realmId) {
    const ledger = ensureForestWarfare();
    return ledger.fronts.find(entry => entry.realmId === realmId) || ledger.fronts[0] || null;
}

function realmName(realmId) {
    return DIPLOMATIC_REALMS.find(realm => realm.id === realmId)?.name || realmId;
}

function realmRow(realmId) {
    return Array.isArray(state.diplomacy?.realms)
        ? state.diplomacy.realms.find(entry => entry && entry.id === realmId) || null
        : null;
}

function atWar(realmId) {
    return realmRow(realmId)?.treaty === "war";
}

function provinceFor(frontRow) {
    const map = ensureWorldMap();
    return map.regions.find(region => region.id === frontRow.provinceId) || null;
}

function regionAnchor(regionId) {
    const definition = regionDefinitionFor(regionId);
    const anchor = definition?.anchor || { x: 0.5, y: 0.5 };
    return {
        x: Math.floor(clamp(anchor.x, 0, 1) * Math.max(1, number(state.worldW, 1))),
        y: Math.floor(clamp(anchor.y, 0, 1) * Math.max(1, number(state.worldH, 1))),
    };
}

export function forestWarfareProfileFor(realmId) {
    const definition = FOREST_WAR_FRONTS_BY_REALM[realmId];
    if (!definition) return null;
    const candidates = FOREST_WAR_PROFILE_LIST.filter(profile => definition.archetypes.includes(profile.archetype));
    if (!candidates.length) return FOREST_WAR_PROFILE_LIST[0] || null;
    return candidates[hashString(realmId + ":front") % candidates.length];
}

export function forestWarfarePreviewProfile(regionId) {
    return forestWarProfileFor(regionId);
}

function canPay(cost) {
    return Object.entries(cost).every(([key, amount]) => {
        if (key === "research") return number(state.research?.reserve) >= amount;
        return number(state.resources?.[key]) >= amount;
    });
}

function pay(cost) {
    for (const [key, amount] of Object.entries(cost)) {
        if (key === "research") {
            if (state.research && typeof state.research === "object") state.research.reserve = clamp(number(state.research.reserve) - amount, 0, 240);
        } else addResource(key, -amount);
    }
}

function costLabel(cost) {
    return Object.entries(cost).map(([key, amount]) => amount + " " + key).join(" · ");
}

function noteAction(frontRow, label) {
    const ledger = ensureForestWarfare();
    frontRow.lastActionYear = yearNow();
    ledger.revision++;
    addLog(label, "#b58b62", "frontier");
}

function recordHistory(ledger, kind, summary, realmId = null) {
    ledger.history.unshift({
        year: yearNow(),
        kind,
        realmId: FOREST_WAR_FRONTS_BY_REALM[realmId] ? realmId : null,
        summary: cleanText(summary, 180),
    });
    if (ledger.history.length > FOREST_WARFARE_LIMITS.history) ledger.history.length = FOREST_WARFARE_LIMITS.history;
}

function forestTileNear(originX, originY, radius = 16) {
    const geo = state.resourceGeography;
    const width = number(state.worldW, 0);
    const height = number(state.worldH, 0);
    if (!geo?.forestStock || !width || !height) return null;
    const cx = Math.max(0, Math.min(width - 1, Math.floor(originX)));
    const cy = Math.max(0, Math.min(height - 1, Math.floor(originY)));
    for (let ring = 0; ring <= radius; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || y < 0 || x >= width || y >= height) continue;
                const index = y * width + x;
                const stock = number(geo.forestStock[index]);
                if (stock <= 4) continue;
                if (sacredGroveTileAt(x, y)) continue;
                return { x, y, index, stock, capacity: Math.max(stock, number(geo.forestCapacity?.[index], stock)) };
            }
        }
    }
    return null;
}

function burnFrontTile(frontRow, radius = 16) {
    const anchor = regionAnchor(frontRow.provinceId);
    return controlledBurnNearestForestTile(anchor.x, anchor.y, radius);
}

function addScar(frontRow, x, y, cause, severity) {
    if (frontRow.scars.some(scar => scar.x === x && scar.y === y)) return;
    frontRow.scars.push({
        x: Math.floor(x), y: Math.floor(y), year: yearNow(),
        severity: clamp(severity ?? 6, 1, 16), cause: cleanText(cause, 60),
    });
    if (frontRow.scars.length > FOREST_WARFARE_LIMITS.scars) frontRow.scars.shift();
}

function frontModifiers(frontRow, profile = forestWarfareProfileFor(frontRow.realmId)) {
    const season = seasonNow();
    const roadOpen = Boolean(profile?.roads?.[season]?.open);
    const sight = clamp(1 - number(profile?.sightPenalty, 20) / 300 - frontRow.scouts * 0.02 - (frontRow.maps ? 0.05 : 0), 0.55, 1.15);
    const movement = clamp(1 - number(profile?.movementPenalty, 20) / 500 + frontRow.road * 0.05 + (roadOpen ? 0.03 : 0), 0.5, 1.2);
    const cavalry = clamp(1 - (number(profile?.cavalryDrag, 20) + frontRow.abatis * 8) / 400, 0.55, 1.1);
    const elephant = number(profile?.elephantGround) ? frontRow.elephants * 7 : frontRow.elephants * 2;
    const ambushChance = clamp(number(profile?.ambush, 30) - frontRow.watch * 7 - frontRow.scouts * 4 - (frontRow.maps ? 4 : 0), 5, 90);
    const smugglingRisk = clamp(35 + number(profile?.smugglerPaths, 2) * 4 + frontRow.customs * 1.5 - frontRow.watch * 7 - frontRow.scouts * 5, 3, 95);
    const trade = clamp(1 + frontRow.road * 0.08 + (roadOpen ? 0.05 : 0) + frontRow.scouts * 0.01
        - (frontRow.embargo ? 0.6 : 0), 0.3, 1.4);
    return {
        season,
        roadOpen,
        roadLabel: profile?.roads?.[season]?.label || "The forest track is open",
        sight: Math.round(sight * 100) / 100,
        movement: Math.round(movement * 100) / 100,
        cavalry: Math.round(cavalry * 100) / 100,
        elephant: Math.round(elephant * 10) / 10,
        ambushChance: Math.round(ambushChance),
        smugglingRisk: Math.round(smugglingRisk),
        trade: Math.round(trade * 100) / 100,
    };
}

export function forestWarfareModifiers() {
    const ledger = ensureForestWarfare();
    const fronts = ledger.fronts.map(frontRow => ({
        realmId: frontRow.realmId,
        ...frontModifiers(frontRow),
    }));
    return Object.freeze({
        fronts,
        scars: ledger.fronts.reduce((sum, entry) => sum + entry.scars.length, 0),
        rebels: ledger.fronts.reduce((sum, entry) => sum + entry.rebels, 0),
        refugees: ledger.fronts.reduce((sum, entry) => sum + entry.refugees, 0),
        partisans: ledger.fronts.reduce((sum, entry) => sum + entry.partisans, 0),
        siegeMaterial: ledger.fronts.reduce((sum, entry) => sum + entry.siegeMaterial, 0),
        shipTimber: ledger.fronts.reduce((sum, entry) => sum + entry.shipTimber, 0),
        elephants: ledger.fronts.reduce((sum, entry) => sum + entry.elephants, 0),
        settlers: ledger.fronts.reduce((sum, entry) => sum + entry.settlers, 0),
        customsIncome: ledger.fronts.reduce((sum, entry) => sum + annualCustoms(entry, false), 0),
    });
}

function annualRouteIncome(frontRow, realm, profile) {
    if (!frontRow.route || !realm || realm.treaty === "war" || frontRow.embargo) return 0;
    const season = seasonNow();
    const roadOpen = Boolean(profile?.roads?.[season]?.open);
    const base = 5 + frontRow.road * 2 + (roadOpen ? 2 : 0) + (frontRow.maps ? 1 : 0);
    return Math.max(0, Math.round(base * frontModifiers(frontRow, profile).trade));
}

function annualCustoms(frontRow, includeRoute = true) {
    if (!frontRow.customs || frontRow.embargo) return 0;
    const realm = realmRow(frontRow.realmId);
    if (!realm || realm.treaty === "war") return 0;
    const volume = 12 + Math.min(58, Math.floor(number(realm.tradeVolume) * 0.02)) + (includeRoute && frontRow.route ? 8 : 0);
    return Math.round(volume * frontRow.customs / 100);
}

function readySoldiers() {
    const snapshot = getMilitarySnapshot();
    return snapshot.soldiers.filter(soldier => soldier.status === "READY" || soldier.status === "MOUNTED");
}

// Availability is rendered for four fronts on every atlas repaint. Counting a
// few real soldier entities is bounded; building the whole military snapshot
// (which profiles every resident) is not. The full snapshot is taken only when
// a battle or a camp patrol is actually resolved.
function hasReadySoldier() {
    return state.entities.some(entity => !entity.dead
        && (entity.type === TYPE.GUARD || entity.type === TYPE.ARCHER || entity.type === TYPE.KNIGHT)
        && !(Number(entity.military?.woundedUntilTick) > Number(state.tick)));
}

function soldierEntity(id) {
    return state.entities.find(entity => !entity.dead && String(entity.id) === String(id)) || null;
}

function soldierLoss(ready, count, seed) {
    let wounded = 0;
    let fallen = 0;
    for (let index = 0; index < count && ready.length; index++) {
        const pick = ready[hashString(seed + ":" + index) % ready.length];
        const entity = soldierEntity(pick.id);
        if (!entity) continue;
        const severe = index === 0 && hashString(seed + ":severe") % 100 < 34;
        if (severe) {
            const casualty = recordMilitaryCasualty(entity, "forest battle");
            if (casualty) fallen++;
        } else {
            recordMilitaryWound(entity);
            wounded++;
        }
    }
    return { wounded, fallen };
}

export function forestWarfareActionAvailability(realmId) {
    const frontRow = front(realmId);
    if (!frontRow) return Object.freeze({});
    const profile = forestWarfareProfileFor(realmId);
    const realm = realmRow(realmId);
    const province = provinceFor(frontRow);
    const year = yearNow();
    const war = Boolean(realm && realm.treaty === "war");
    const peace = Boolean(realm && realm.treaty !== "war");
    const treatyActive = Boolean(frontRow.treaty && frontRow.treaty.untilYear >= year);
    const reason = (ok, text) => ({ ok, reason: ok ? "Ready" : text });
    const ready = reason(canPay(FOREST_WAR_COSTS.post), "Needs " + costLabel(FOREST_WAR_COSTS.post));
    // The tile scan is lazy: only the actions that actually need a reachable
    // forest pay for it, and never while their other gates are already closed.
    let tileCache;
    const frontTile = () => {
        if (tileCache === undefined) {
            const anchor = regionAnchor(frontRow.provinceId);
            tileCache = forestTileNear(anchor.x, anchor.y);
        }
        return tileCache;
    };
    // Fire and clearance must offer the same mature, unbroken stand the burn
    // action will actually use, not merely any forest tile in reach.
    let burnCache;
    const burnTile = () => {
        if (burnCache === undefined) {
            const anchor = regionAnchor(frontRow.provinceId);
            burnCache = findBurnableForestTile(anchor.x, anchor.y, 16);
        }
        return burnCache;
    };
    const rights = Boolean(frontRow.rights);
    return Object.freeze({
        post: reason(frontRow.posts < FOREST_WARFARE_LIMITS.posts && frontRow.postYear !== year && ready.ok,
            frontRow.posts >= FOREST_WARFARE_LIMITS.posts ? "Three posts already hold this frontier" : frontRow.postYear === year ? "A post was raised this year" : "Needs 10 wood and 6 gold"),
        watch: reason(frontRow.watch < FOREST_WARFARE_LIMITS.watch && frontRow.watchYear !== year && canPay(FOREST_WAR_COSTS.watch),
            frontRow.watch >= FOREST_WARFARE_LIMITS.watch ? "The forest watch is fully manned" : frontRow.watchYear === year ? "The watch was strengthened this year" : "Needs 8 gold and 2 food"),
        road: reason(frontRow.road < FOREST_WARFARE_LIMITS.roads && frontRow.roadYear !== year && canPay(FOREST_WAR_COSTS.road),
            frontRow.road >= FOREST_WARFARE_LIMITS.roads ? "The forest road is at its highest grade" : frontRow.roadYear === year ? "The road crews already worked this year" : "Needs 12 wood, 4 stone and 8 gold"),
        scouts: reason(frontRow.scouts < FOREST_WARFARE_LIMITS.scouts && frontRow.scoutYear !== year && canPay(FOREST_WAR_COSTS.scouts),
            frontRow.scouts >= FOREST_WARFARE_LIMITS.scouts ? "All scout bands are in the field" : frontRow.scoutYear === year ? "New scouts are already recruited this year" : "Needs 6 gold and 3 food"),
        ambush: reason(war && !treatyActive && frontRow.ambushYear !== year && frontRow.scouts > 0 && number(profile?.ambush) >= 45 && canPay(FOREST_WAR_COSTS.ambush),
            !war ? "Only a war opens the ambush ground" : treatyActive ? "A border treaty forbids an ambush" : frontRow.ambushYear === year ? "An ambush is already laid this year" : frontRow.scouts <= 0 ? "Recruit a forest scout first" : number(profile?.ambush) < 45 ? "This frontier is too open for an ambush" : "Needs 3 food"),
        battle: reason(war && hasReadySoldier(), !war ? "Declare war at the diplomatic court first" : "No ready soldier is in the field"),
        siegeTimber: reason(war && canPay(FOREST_WAR_COSTS.siegeTimber), !war ? "Siege timber is cut only at war" : "Needs 15 wood"),
        siege: reason(war && frontRow.siegeMaterial >= 10 && province && province.ownerId !== "crown",
            !war ? "No siege without a war" : frontRow.siegeMaterial < 10 ? "Ten siege material are needed" : province?.ownerId === "crown" ? "The province is already held by the crown" : "No enemy province to press"),
        shipTimber: reason(canPay(FOREST_WAR_COSTS.shipTimber) && frontRow.shipTimber < FOREST_WARFARE_LIMITS.shipTimber,
            frontRow.shipTimber >= FOREST_WARFARE_LIMITS.shipTimber ? "The mast-timber reserve is full" : "Needs 12 wood and 4 gold"),
        elephants: reason(Boolean(profile?.elephantGround) && frontRow.elephants < FOREST_WARFARE_LIMITS.elephants && frontRow.elephantYear !== year && canPay(FOREST_WAR_COSTS.elephants),
            !profile?.elephantGround ? "This frontier cannot feed war elephants" : frontRow.elephants >= FOREST_WARFARE_LIMITS.elephants ? "The elephant herd is at its limit" : frontRow.elephantYear === year ? "The herd was mustered this year" : "Needs 12 food and 10 gold"),
        abatis: reason(frontRow.abatis < FOREST_WARFARE_LIMITS.abatis && frontRow.abatisYear !== year && canPay(FOREST_WAR_COSTS.abatis),
            frontRow.abatis >= FOREST_WARFARE_LIMITS.abatis ? "Three abatis belts already block the wood" : frontRow.abatisYear === year ? "The belts were laid this year" : "Needs 6 wood and 4 food"),
        partisans: reason(war && !treatyActive && frontRow.partisans < FOREST_WARFARE_LIMITS.partisans && frontRow.partisanYear !== year
            && ((province && province.contestedBy) || number(realm?.warExhaustion) >= 10) && canPay(FOREST_WAR_COSTS.partisans),
            !war ? "Partisans rise only in a war" : treatyActive ? "A border treaty disarms the partisans" : frontRow.partisans >= FOREST_WARFARE_LIMITS.partisans ? "The partisan bands are full" :             frontRow.partisanYear === year ? "The bands were raised this year" : "The province must be contested or the war weary (5 food, 3 gold)"),
        warFire: reason(war && !treatyActive && frontRow.fireYear !== year && canPay({ food: 6, gold: 6 }) && Boolean(burnTile()) && province && province.ownerId !== "crown",
            !war ? "War fire is a weapon of war" : treatyActive ? "A border treaty forbids fire" : frontRow.fireYear === year ? "The wood was fired this year" : !burnTile() ? "No mature, unbroken stand is in reach" : province?.ownerId === "crown" ? "The crown does not burn its own province" : "Needs 3 food"),
        burnFields: reason(frontRow.burnYear !== year && !treatyActive && canPay({ food: 8, gold: 6 }) && Boolean(burnTile()),
            frontRow.burnYear === year ? "The clearing was burned this year" : treatyActive ? "A border treaty forbids clearance" : !burnTile() ? "No mature stand is in reach" : "Needs 8 food and 6 gold for the burn crew"),
        deport: reason((war || frontRow.rebels > 0) && frontRow.deportYear !== year && canPay(FOREST_WAR_COSTS.deport),
            !war && frontRow.rebels <= 0 ? "There is no resistance to deport" : frontRow.deportYear === year ? "A deportation already ran this year" : "Needs 6 gold"),
        quota: reason(frontRow.quotaYear !== year && canPay({ food: 4 }) && number(state.resources?.wood) >= 10,
            frontRow.quotaYear === year ? "The quota was levied this year" : number(state.resources?.wood) < 10 ? "Needs 10 wood in the royal store" : "Needs 4 food for the work gangs"),
        route: reason(peace && !frontRow.embargo && !frontRow.route && canPay(FOREST_WAR_COSTS.route),
            !peace ? "No forest route runs through a war" : frontRow.embargo ? "An embargo closes the route" : frontRow.route ? "A forest route already runs here" : "Needs 10 wood and 5 gold"),
        smuggling: reason(!frontRow.embargo && frontRow.smuggleYear !== year && number(profile?.smugglerPaths) > 0 && canPay(FOREST_WAR_COSTS.smuggling),
            frontRow.embargo ? "The embargo is watched too closely" : frontRow.smuggleYear === year ? "The smugglers already ran this year" : number(profile?.smugglerPaths) <= 0 ? "No hidden path crosses this frontier" : "Needs 2 food"),
        maps: reason(!frontRow.maps && canPay(FOREST_WAR_COSTS.maps), frontRow.maps ? "The war maps are already charted" : "Needs 12 gold and 4 research"),
        treaty: reason(peace && !treatyActive && number(realm?.relation) >= 30 && canPay(FOREST_WAR_COSTS.treaty),
            !peace ? "No treaty is signed at war" : treatyActive ? "A border treaty is already in force" : number(realm?.relation) < 30 ? "The court's relation is below 30" : "Needs 8 gold"),
        preserve: reason(treatyActive && !frontRow.preserve && canPay(FOREST_WAR_COSTS.preserve) && Boolean(frontTile()),
            !treatyActive ? "A border treaty must come first" : frontRow.preserve ? "A joint preserve already stands here" : !frontTile() ? "No forest tile is in reach" : "Needs 12 gold"),
        rights: reason(!rights && canPay(FOREST_WAR_COSTS.rights), rights ? "The woodland communities already hold their charter" : "Needs 10 gold"),
        settlers: reason(frontRow.settlers < FOREST_WARFARE_LIMITS.settlers && frontRow.settlerYear !== year && canPay(FOREST_WAR_COSTS.settlers),
            frontRow.settlers >= FOREST_WARFARE_LIMITS.settlers ? "The wood edge is fully claimed" : frontRow.settlerYear === year ? "New claims were pressed this year" : "Needs 6 food"),
        colonize: reason(frontRow.settlers >= 3 && !frontRow.colony && peace && !treatyActive && !frontRow.preserve && canPay(FOREST_WAR_COSTS.colonize),
            frontRow.settlers < 3 ? "Three settler claims are needed first" : frontRow.colony ? "This frontier is already colonised" : !peace ? "Colonisation waits for peace" : treatyActive || frontRow.preserve ? "A treaty or preserve forbids the claim" : "Needs 20 wood, 10 food and 15 gold"),
        suppress: reason(frontRow.rebels > 0 && frontRow.suppressYear !== year && canPay(FOREST_WAR_COSTS.suppress),
            frontRow.rebels <= 0 ? "No resistance camp is known" : frontRow.suppressYear === year ? "The camps were already suppressed this year" : "Needs 10 gold and 4 food"),
        refugees: reason(frontRow.refugees > 0 && frontRow.refugeeYear !== year && canPay(FOREST_WAR_COSTS.refugees),
            frontRow.refugees <= 0 ? "No forest refugees wait at the border" : frontRow.refugeeYear === year ? "The refugees were already settled this year" : "Needs 10 food and 6 wood"),
        colony: reason(!frontRow.colony?.military && canPay(FOREST_WAR_COSTS.colony),
            frontRow.colony?.military ? "A military colony already guards this frontier" : "Needs 18 wood, 10 stone and 12 gold"),
        clearCamp: reason(frontRow.rebels > 0 && frontRow.clearCampYear !== year && hasReadySoldier() && canPay(FOREST_WAR_COSTS.clearCamp),
            frontRow.rebels <= 0 ? "No rebel camp is known" : frontRow.clearCampYear === year ? "A camp was cleared this year" : !hasReadySoldier() ? "A ready soldier must lead the patrol" : "Needs 3 food"),
        recovery: reason(frontRow.scars.length > 0 && frontRow.recoveryYear !== year && canPay(FOREST_WAR_COSTS.recovery),
            frontRow.scars.length <= 0 ? "The frontier carries no war scar" : frontRow.recoveryYear === year ? "A recovery crew already worked this year" : "Needs 8 gold and 4 wood"),
        embargo: reason(!frontRow.embargo && peace, frontRow.embargo ? "An embargo is already in force" : "An embargo is declared in peace, not war"),
        clearEmbargo: reason(Boolean(frontRow.embargo), frontRow.embargo ? "Ready" : "No embargo is in force"),
    });
}

// —— Actions ————————————————————————————————————————————————————————————

export function raiseBorderPost(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).post;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const year = yearNow();
    pay(FOREST_WAR_COSTS.post);
    frontRow.posts++;
    frontRow.postYear = year;
    const province = provinceFor(frontRow);
    if (province) province.control = clamp(province.control + 6, 0, 100);
    const frontier = ensureWorldMap().frontiers.find(entry => entry.realmId === realmId);
    if (frontier) frontier.pressure = clamp(frontier.pressure - 6, 0, 100);
    noteAction(frontRow, "BORDER POST — " + realmName(realmId) + " frontier gains a post.");
    recordHistory(ensureForestWarfare(), "post", "Raised border post " + frontRow.posts + " on the " + realmName(realmId) + " frontier.", realmId);
    return { ok: true, posts: frontRow.posts, control: province?.control ?? null };
}

export function strengthenForestWatch(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).watch;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.watch);
    frontRow.watch++;
    frontRow.watchYear = yearNow();
    noteAction(frontRow, "FOREST WATCH — " + realmName(realmId) + " watch level " + frontRow.watch + ".");
    return { ok: true, watch: frontRow.watch };
}

export function openForestRoad(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).road;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.road);
    frontRow.road++;
    frontRow.roadYear = yearNow();
    const province = provinceFor(frontRow);
    if (province) province.control = clamp(province.control + 2, 0, 100);
    noteAction(frontRow, "FOREST ROAD — " + realmName(realmId) + " road grade " + frontRow.road + ".");
    return { ok: true, road: frontRow.road, modifiers: frontModifiers(frontRow) };
}

export function recruitForestScouts(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).scouts;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.scouts);
    frontRow.scouts++;
    frontRow.scoutYear = yearNow();
    const profile = forestWarfareProfileFor(realmId);
    noteAction(frontRow, "FOREST SCOUTS — regional paths of the " + (profile?.region || "wood") + " are charted.");
    return { ok: true, scouts: frontRow.scouts, paths: profile?.smugglerPaths ?? 0 };
}

export function layForestAmbush(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).ambush;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.ambush);
    frontRow.ambushYear = yearNow();
    noteAction(frontRow, "AMBUSH LAID — " + realmName(realmId) + " column route is covered.");
    return { ok: true, year: yearNow() };
}

export function fightForestBattle(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).battle;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const realm = realmRow(realmId);
    const profile = forestWarfareProfileFor(realmId);
    const province = provinceFor(frontRow);
    const ready = readySoldiers();
    const year = yearNow();
    const mods = frontModifiers(frontRow, profile);
    const ambush = frontRow.ambushYear === year;
    const ownBase = ready.reduce((sum, soldier) => sum + number(soldier.power), 0)
        + frontRow.elephants * 7 + frontRow.partisans * 2.5 + frontRow.siegeMaterial * 0.35;
    const enemyBase = 26 + number(province?.garrison, 2) * 10 + number(realm?.fear, 20) * 0.3
        + Math.max(0, number(realm?.warExhaustion)) * 0.18;
    const own = Math.max(1, ownBase * mods.sight * mods.movement * mods.cavalry
        * (ambush ? 1.45 : 1) * (frontRow.maps ? 1.06 : 1));
    const enemy = Math.max(1, enemyBase * (1 + number(profile?.ambush) / 500)
        * (1 - Math.min(0.25, frontRow.partisans * 0.02)) * (1 + frontRow.watch * 0.01));
    const ratio = own / (own + enemy);
    const roll = (hashString(realmId + ":" + year + ":" + frontRow.battles) % 1000) / 1000;
    const victory = roll < ratio;
    const losses = 1 + Math.floor(Math.abs(own - enemy) / 55) + (victory ? 0 : 1);
    const casualtyCount = Math.min(ready.length, Math.max(1, Math.min(3, losses)));
    const lossesApplied = soldierLoss(ready, casualtyCount, realmId + ":" + year + ":" + frontRow.battles + ":" + (victory ? "win" : "loss"));
    frontRow.battles++;
    if (victory) {
        frontRow.victories++;
        if (province) {
            province.control = clamp(province.control + 12, 0, 100);
            province.contestedBy = province.ownerId === "crown" ? null : "crown";
        }
        if (realm) {
            realm.relation = clamp(realm.relation - 3);
            realm.fear = clamp(realm.fear + 6);
            realm.warExhaustion = clamp(realm.warExhaustion + 6);
        }
        state.morale = clamp(number(state.morale, 50) + 1.5, 0, 100);
        applyPoliticalEffects({ nobility: 1, legitimacy: 1 });
        ensureForestWarfare().totals.victories++;
    } else {
        if (province) province.control = clamp(province.control - 10, 0, 100);
        if (realm) realm.warExhaustion = clamp(realm.warExhaustion + 9);
        state.morale = clamp(number(state.morale, 50) - 2, 0, 100);
        if (frontRow.elephants > 0 && roll < 0.25) frontRow.elephants--;
    }
    if (ambush) {
        frontRow.ambushYear = 0;
        if (realm) realm.warExhaustion = clamp(realm.warExhaustion + 2);
    }
    frontRow.siegeMaterial = Math.max(0, frontRow.siegeMaterial - 4);
    frontRow.battleYear = year;
    ensureForestWarfare().totals.battles++;
    const summary = (victory ? "Victory" : "Reverse") + " in the " + (profile?.region || "wood")
        + ": " + lossesApplied.wounded + " wounded, " + lossesApplied.fallen + " fallen"
        + (ambush ? "; the ambush sprung" : "") + ".";
    noteAction(frontRow, "FOREST BATTLE — " + summary);
    recordHistory(ensureForestWarfare(), "battle", summary, realmId);
    recordLegacy("battle", (victory ? "Forest victory" : "Forest reverse") + " at the " + realmName(realmId) + " frontier",
        summary + " The " + (profile?.frontierName || "wood") + " was the ground.", { importance: victory ? 2 : 1 });
    return {
        ok: true, victory, ratio: Math.round(ratio * 100), roll: Math.round(roll * 1000) / 1000,
        own: Math.round(own), enemy: Math.round(enemy),
        wounded: lossesApplied.wounded, fallen: lossesApplied.fallen,
        ambush, control: province?.control ?? null, modifiers: mods,
    };
}

export function cutSiegeTimber(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).siegeTimber;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const profile = forestWarfareProfileFor(realmId);
    pay(FOREST_WAR_COSTS.siegeTimber);
    const gain = 4 + number(profile?.siegeTimberGrade, 2) * 2;
    frontRow.siegeMaterial = clamp(frontRow.siegeMaterial + gain, 0, FOREST_WARFARE_LIMITS.siegeMaterial);
    noteAction(frontRow, "SIEGE TIMBER — " + gain + " material stacked for the " + realmName(realmId) + " siege train.");
    return { ok: true, gain, siegeMaterial: frontRow.siegeMaterial };
}

export function pressForestSiege(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).siege;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const province = provinceFor(frontRow);
    const realm = realmRow(realmId);
    frontRow.siegeMaterial -= 10;
    if (province) {
        province.garrison = Math.max(0, number(province.garrison, 1) - 1);
        province.control = clamp(province.control - 12, 0, 100);
        if (province.control <= 14 && province.ownerId !== "crown") province.contestedBy = "crown";
    }
    if (realm) {
        realm.warExhaustion = clamp(realm.warExhaustion + 4);
        realm.relation = clamp(realm.relation - 2);
    }
    noteAction(frontRow, "SIEGE PRESSED — " + realmName(realmId) + " frontier garrison reduced.");
    recordHistory(ensureForestWarfare(), "siege", "Pressed the siege at " + (province?.id || realmId) + "; garrison and control fell.", realmId);
    return { ok: true, garrison: province?.garrison ?? 0, control: province?.control ?? null };
}

export function reserveShipTimber(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).shipTimber;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const profile = forestWarfareProfileFor(realmId);
    pay(FOREST_WAR_COSTS.shipTimber);
    const gain = 4 + number(profile?.shipTimberGrade, 2) * 2;
    frontRow.shipTimber = clamp(frontRow.shipTimber + gain, 0, FOREST_WARFARE_LIMITS.shipTimber);
    noteAction(frontRow, "SHIP TIMBER — " + gain + " mast and keel lengths reserved from the " + (profile?.region || "wood") + ".");
    return { ok: true, gain, shipTimber: frontRow.shipTimber };
}

export function musterWarElephants(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).elephants;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.elephants);
    frontRow.elephants++;
    frontRow.elephantYear = yearNow();
    const profile = forestWarfareProfileFor(realmId);
    noteAction(frontRow, "WAR ELEPHANTS — the " + (profile?.region || "tropical") + " herd joins the frontier.");
    return { ok: true, elephants: frontRow.elephants };
}

export function fellAbatis(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).abatis;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.abatis);
    frontRow.abatis++;
    frontRow.abatisYear = yearNow();
    noteAction(frontRow, "ABATIS FELLED — a new belt of undergrowth blocks cavalry.");
    return { ok: true, abatis: frontRow.abatis, modifiers: frontModifiers(frontRow) };
}

export function raiseForestPartisans(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).partisans;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.partisans);
    frontRow.partisans++;
    frontRow.partisanYear = yearNow();
    state.morale = clamp(number(state.morale, 50) + 1, 0, 100);
    noteAction(frontRow, "FOREST PARTISANS — the " + realmName(realmId) + " wood rises behind the enemy line.");
    return { ok: true, partisans: frontRow.partisans };
}

export function setWarFire(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).warFire;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    if (!canPay({ gold: 6, food: 3 })) return { ok: false, reason: "Needs 6 gold and 3 food for the fire crew" };
    pay(FOREST_WAR_COSTS.warFire);
    const burn = burnFrontTile(frontRow, 18);
    if (!burn.ok) return { ok: false, reason: burn.reason };
    frontRow.fireYear = yearNow();
    const province = provinceFor(frontRow);
    if (province) province.control = clamp(province.control - 8, 0, 100);
    const realm = realmRow(realmId);
    if (realm) {
        realm.relation = clamp(realm.relation - 2);
        realm.fear = clamp(realm.fear + 2);
        realm.warExhaustion = clamp(realm.warExhaustion + 2);
    }
    const profile = forestWarfareProfileFor(realmId);
    addScar(frontRow, burn.x, burn.y, "war fire", Math.ceil(number(profile?.recoveryYears, 30) / 4));
    state.morale = clamp(number(state.morale, 50) - 0.5, 0, 100);
    noteAction(frontRow, "WAR FIRE — the wood at " + burn.x + ", " + burn.y + " burns behind the enemy column.");
    recordHistory(ensureForestWarfare(), "fire", "War fire at " + burn.x + ", " + burn.y + " damaged the frontier and left a scar.", realmId);
    return { ok: true, x: burn.x, y: burn.y, stockBefore: burn.stockBefore, stockAfter: burn.stockAfter, escaped: burn.escaped };
}

export function burnForFields(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).burnFields;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    if (!canPay({ gold: 6, food: 3 })) return { ok: false, reason: "Needs 6 gold and 3 food for the burn crew" };
    pay(FOREST_WAR_COSTS.burnFields);
    const burn = burnFrontTile(frontRow, 18);
    if (!burn.ok) return { ok: false, reason: burn.reason };
    frontRow.burnYear = yearNow();
    addResource("food", 10);
    frontRow.settlers = Math.min(FOREST_WARFARE_LIMITS.settlers, frontRow.settlers + 1);
    const profile = forestWarfareProfileFor(realmId);
    addScar(frontRow, burn.x, burn.y, "slash-and-burn", Math.ceil(number(profile?.recoveryYears, 30) / 4));
    if (frontRow.settlers > 2 && !frontRow.rights) {
        frontRow.rebels = Math.min(FOREST_WARFARE_LIMITS.rebels, frontRow.rebels + 1);
        state.morale = clamp(number(state.morale, 50) - 0.5, 0, 100);
    }
    noteAction(frontRow, "SLASH AND BURN — " + burn.x + ", " + burn.y + " cleared for fields; a scar remains.");
    return { ok: true, x: burn.x, y: burn.y, food: 10, settlers: frontRow.settlers, stockBefore: burn.stockBefore, stockAfter: burn.stockAfter };
}

export function deportWoodlanders(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).deport;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.deport);
    frontRow.deportYear = yearNow();
    frontRow.deportations++;
    const before = frontRow.rebels;
    frontRow.rebels = Math.max(0, frontRow.rebels - 2);
    frontRow.settlers = Math.max(0, frontRow.settlers - 1);
    frontRow.refugees = Math.min(FOREST_WARFARE_LIMITS.refugees, frontRow.refugees + 2);
    state.morale = clamp(number(state.morale, 50) - 1, 0, 100);
    applyPoliticalEffects({ legitimacy: -2, commons: -1 });
    noteAction(frontRow, "DEPORTATION — " + (before - frontRow.rebels) + " resistance members removed; refugees seek shelter.");
    recordHistory(ensureForestWarfare(), "deport", "Deported woodlanders from the " + realmName(realmId) + " frontier; legitimacy fell.", realmId);
    return { ok: true, rebels: frontRow.rebels, refugees: frontRow.refugees };
}

export function levyTimberQuota(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).quota;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.quota);
    addResource("wood", -10);
    addResource("gold", 8);
    frontRow.siegeMaterial = clamp(frontRow.siegeMaterial + 4, 0, FOREST_WARFARE_LIMITS.siegeMaterial);
    frontRow.quotaYear = yearNow();
    if (!frontRow.rights && yearNow() % 2 === 0) frontRow.rebels = Math.min(FOREST_WARFARE_LIMITS.rebels, frontRow.rebels + 1);
    const realm = realmRow(realmId);
    if (realm) realm.relation = clamp(realm.relation - 2);
    noteAction(frontRow, "TIMBER QUOTA — 10 wood taken for fleet and siege; 8 gold and 4 material returned.");
    return { ok: true, wood: -10, gold: 8, siegeMaterial: frontRow.siegeMaterial };
}

export function setForestEmbargo(realmId, good = "timber") {
    const requested = EMBARGO_IDS.includes(good) ? good : "timber";
    const frontRow = front(realmId);
    if (!realmRow(realmId)) return { ok: false, reason: "The diplomatic court is not established" };
    if (frontRow.embargo) return { ok: false, reason: "An embargo is already in force" };
    if (realmRow(realmId).treaty === "war") return { ok: false, reason: "An embargo is declared in peace, not war" };
    frontRow.embargo = requested;
    const realm = realmRow(realmId);
    realm.relation = clamp(realm.relation - 6);
    realm.trust = clamp(realm.trust - 3);
    realm.fear = clamp(realm.fear + 3);
    cancelTradeAgreement(realmId);
    applyPoliticalEffects({ guilds: -1, nobility: 1 });
    noteAction(frontRow, "EMBARGO — " + requested + " is banned from the " + realmName(realmId) + " trade.");
    recordHistory(ensureForestWarfare(), "embargo", "Embargoed " + requested + " against " + realmName(realmId) + "; the trade agreement fell.", realmId);
    return { ok: true, good: requested };
}

export function liftForestEmbargo(realmId) {
    const frontRow = front(realmId);
    if (!frontRow.embargo) return { ok: false, reason: "No embargo is in force" };
    const good = frontRow.embargo;
    frontRow.embargo = null;
    const realm = realmRow(realmId);
    if (realm) realm.relation = clamp(realm.relation + 1);
    noteAction(frontRow, "EMBARGO LIFTED — " + good + " may cross the " + realmName(realmId) + " frontier again.");
    return { ok: true, good };
}

export function openForestTradeRoute(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).route;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.route);
    frontRow.route = true;
    const realm = realmRow(realmId);
    if (realm) {
        realm.relation = clamp(realm.relation + 1);
        realm.lastTradeYear = yearNow();
    }
    applyPoliticalEffects({ guilds: 1 });
    noteAction(frontRow, "FOREST ROUTE — caravans now cross the " + realmName(realmId) + " wood.");
    return { ok: true, route: frontRow.route };
}

export function setForestCustoms(realmId, rate = 0) {
    const frontRow = front(realmId);
    const next = Number(rate);
    if (!FOREST_CUSTOMS_RATES.includes(next)) return { ok: false, reason: "Unknown customs rate" };
    frontRow.customs = next;
    const realm = realmRow(realmId);
    if (realm && next > 0) realm.relation = clamp(realm.relation - (next >= 10 ? 0.8 : 0.3));
    noteAction(frontRow, "CUSTOMS — " + next + "% on the " + realmName(realmId) + " forest trade.");
    return { ok: true, customs: frontRow.customs, annual: annualCustoms(frontRow) };
}

export function runForestSmuggling(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).smuggling;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const profile = forestWarfareProfileFor(realmId);
    pay(FOREST_WAR_COSTS.smuggling);
    frontRow.smuggleYear = yearNow();
    const risk = frontModifiers(frontRow, profile).smugglingRisk;
    const roll = hashString(realmId + ":" + yearNow() + ":smuggle") % 100;
    const caught = roll < risk;
    const realm = realmRow(realmId);
    if (caught) {
        if (realm) realm.relation = clamp(realm.relation - 4);
        ensureForestWarfare().totals.smugglersCaught++;
        noteAction(frontRow, "SMUGGLING CAUGHT — the " + realmName(realmId) + " patrol found the hidden path.");
        recordHistory(ensureForestWarfare(), "smuggling", "A smuggling run into " + realmName(realmId) + " was caught.", realmId);
        return { ok: true, caught: true, gold: 0, risk };
    }
    const gold = 8 + number(profile?.smugglerPaths, 2) * 2 + frontRow.customs;
    addResource("gold", gold);
    if (realm) realm.relation = clamp(realm.relation - 1);
    noteAction(frontRow, "SMUGGLING RUN — " + gold + " gold crossed the hidden paths.");
    return { ok: true, caught: false, gold, risk };
}

export function commissionWarMaps(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).maps;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.maps);
    frontRow.maps = true;
    noteAction(frontRow, "WAR MAPS — the " + realmName(realmId) + " forest is charted and the plates are guarded.");
    recordLegacy("strategy", "War maps of the " + realmName(realmId) + " frontier", "The scouts' paths, fords and hiding places are charted as a military secret.", { importance: 2 });
    return { ok: true, maps: true, modifiers: frontModifiers(frontRow) };
}

export function signBorderTreaty(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).treaty;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.treaty);
    const year = yearNow();
    frontRow.treaty = {
        sinceYear: year,
        untilYear: year + 8,
        term: "Shared woodland, closed border and no fire on the " + (forestWarfareProfileFor(realmId)?.region || "frontier"),
    };
    const realm = realmRow(realmId);
    if (realm) {
        realm.relation = clamp(realm.relation + 8);
        realm.trust = clamp(realm.trust + 5);
    }
    applyPoliticalEffects({ legitimacy: 1, commons: 1 });
    noteAction(frontRow, "BORDER TREATY — the " + realmName(realmId) + " wood is shared for eight years.");
    recordLegacy("diplomacy", "Border treaty with " + realmName(realmId), frontRow.treaty.term, { importance: 2 });
    return { ok: true, treaty: { ...frontRow.treaty } };
}

export function createJointPreserve(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).preserve;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const anchor = regionAnchor(frontRow.provinceId);
    const tile = forestTileNear(anchor.x, anchor.y);
    if (!tile) return { ok: false, reason: "No forest tile can be marked as a preserve" };
    pay(FOREST_WAR_COSTS.preserve);
    frontRow.preserve = { x: tile.x, y: tile.y, year: yearNow() };
    const realm = realmRow(realmId);
    if (realm) {
        realm.relation = clamp(realm.relation + 6);
        realm.trust = clamp(realm.trust + 4);
    }
    applyPoliticalEffects({ legitimacy: 1, clergy: 1, commons: 1 });
    noteAction(frontRow, "JOINT PRESERVE — tile " + tile.x + ", " + tile.y + " is protected by both realms.");
    recordLegacy("forest", "Joint forest preserve at " + tile.x + ", " + tile.y, "A shared border wood withdrawn from every axe.", { importance: 2 });
    return { ok: true, preserve: { ...frontRow.preserve } };
}

export function recognizeWoodlandRights(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).rights;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.rights);
    frontRow.rights = true;
    frontRow.rebels = Math.max(0, frontRow.rebels - 2);
    state.morale = clamp(number(state.morale, 50) + 1, 0, 100);
    applyPoliticalEffects({ legitimacy: 2, commons: 2 });
    noteAction(frontRow, "WOODLAND RIGHTS — the " + realmName(realmId) + " communities hold their charter.");
    recordLegacy("law", "Woodland charter with " + realmName(realmId), "The indigenous woodland communities keep their use rights and their groves.", { importance: 3 });
    return { ok: true, rights: true };
}

export function pressSettlerClaims(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).settlers;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.settlers);
    frontRow.settlers++;
    frontRow.settlerYear = yearNow();
    const realm = realmRow(realmId);
    if (realm) realm.relation = clamp(realm.relation - 1);
    noteAction(frontRow, "SETTLER CLAIMS — " + frontRow.settlers + " households press the " + realmName(realmId) + " wood edge.");
    return { ok: true, settlers: frontRow.settlers };
}

export function colonizeWoodland(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).colonize;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const province = provinceFor(frontRow);
    pay(FOREST_WAR_COSTS.colonize);
    frontRow.colony = { year: yearNow(), military: false };
    if (province) {
        province.ownerId = "crown";
        province.control = 32;
        province.loyalty = 38;
        province.garrison = 1;
        province.contestedBy = null;
        province.lastChangeYear = yearNow();
        province.changes = Math.max(0, number(province.changes, 0)) + 1;
        ensureWorldMap().totals.regionChanges = Math.max(0, number(ensureWorldMap().totals.regionChanges, 0)) + 1;
    }
    const realm = realmRow(realmId);
    if (realm) {
        realm.relation = clamp(realm.relation - 16);
        realm.trust = clamp(realm.trust - 8);
        realm.fear = clamp(realm.fear + 8);
    }
    frontRow.rebels = Math.min(FOREST_WARFARE_LIMITS.rebels, frontRow.rebels + 3);
    frontRow.refugees = Math.min(FOREST_WARFARE_LIMITS.refugees, frontRow.refugees + 2);
    state.morale = clamp(number(state.morale, 50) + 2, 0, 100);
    applyPoliticalEffects({ nobility: 1, commons: -1 });
    ensureForestWarfare().totals.provincesClaimed++;
    noteAction(frontRow, "COLONISATION — the " + realmName(realmId) + " frontier province is claimed for the crown.");
    recordHistory(ensureForestWarfare(), "colonise", "Colonised the " + realmName(realmId) + " woodland; its province changed hands.", realmId);
    recordLegacy("frontier", "Colonised the " + realmName(realmId) + " wood", "The frontier province was settled and its woodland divided.", { importance: 3 });
    return { ok: true, province: province?.id || null, control: province?.control ?? null, rebels: frontRow.rebels };
}

export function suppressForestResistance(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).suppress;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.suppress);
    const before = frontRow.rebels;
    frontRow.rebels = Math.max(0, frontRow.rebels - 2);
    frontRow.suppressYear = yearNow();
    const province = provinceFor(frontRow);
    if (province) province.control = clamp(province.control + 4, 0, 100);
    state.morale = clamp(number(state.morale, 50) - 1, 0, 100);
    applyPoliticalEffects({ legitimacy: -1, commons: -1 });
    ensureForestWarfare().totals.rebelsCleared += Math.max(0, before - frontRow.rebels);
    noteAction(frontRow, "RESISTANCE SUPPRESSED — " + (before - frontRow.rebels) + " camps broken in the " + realmName(realmId) + " wood.");
    return { ok: true, rebels: frontRow.rebels, cleared: before - frontRow.rebels };
}

export function settleForestRefugees(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).refugees;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.refugees);
    const before = frontRow.refugees;
    frontRow.refugees = Math.max(0, frontRow.refugees - 3);
    frontRow.refugeeYear = yearNow();
    state.morale = clamp(number(state.morale, 50) + 2, 0, 100);
    applyPoliticalEffects({ legitimacy: 1, commons: 1, clergy: 1 });
    ensureForestWarfare().totals.refugeesSettled += Math.min(3, before);
    noteAction(frontRow, "REFUGEES SETTLED — " + Math.min(3, before) + " forest families take shelter.");
    return { ok: true, refugees: frontRow.refugees, settled: Math.min(3, before) };
}

export function foundMilitaryColony(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).colony;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.colony);
    const province = provinceFor(frontRow);
    frontRow.colony = { year: yearNow(), military: true };
    if (province) {
        province.control = clamp(province.control + 8, 0, 100);
        province.garrison = Math.min(10, number(province.garrison, 0) + 1);
    }
    applyPoliticalEffects({ nobility: 1, commons: 1 });
    noteAction(frontRow, "MILITARY COLONY — a frontier garrison settlement guards the " + realmName(realmId) + " road.");
    recordLegacy("frontier", "Military colony at the " + realmName(realmId) + " frontier", "A soldier-settler colony keeps the forest road and the border post.", { importance: 2 });
    return { ok: true, control: province?.control ?? null, garrison: province?.garrison ?? 0 };
}

export function clearRebelCamp(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).clearCamp;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.clearCamp);
    frontRow.clearCampYear = yearNow();
    const profile = forestWarfareProfileFor(realmId);
    const ready = readySoldiers();
    const roll = hashString(realmId + ":" + yearNow() + ":camp") % 100;
    const chance = clamp(55 + frontRow.scouts * 8 + frontRow.watch * 5 - frontRow.rebels * 6, 20, 92);
    const success = roll < chance;
    const soldier = ready.length ? soldierEntity(ready[hashString(realmId + ":camp:soldier") % ready.length].id) : null;
    if (success) {
        frontRow.rebels = Math.max(0, frontRow.rebels - 1);
        const province = provinceFor(frontRow);
        if (province) province.control = clamp(province.control + 5, 0, 100);
        ensureForestWarfare().totals.rebelsCleared++;
        if (soldier) recordMilitaryWound(soldier);
        noteAction(frontRow, "REBEL CAMP CLEARED — the " + (profile?.region || "wood") + " is quieter.");
        return { ok: true, cleared: true, rebels: frontRow.rebels, wounded: Boolean(soldier) };
    }
    frontRow.rebels = Math.min(FOREST_WARFARE_LIMITS.rebels, frontRow.rebels + 1);
    if (soldier) recordMilitaryWound(soldier);
    noteAction(frontRow, "REBEL CAMP HOLDS — the patrol was driven back into the " + (profile?.region || "wood") + ".");
    return { ok: true, cleared: false, rebels: frontRow.rebels, wounded: Boolean(soldier) };
}

export function fundWarEcologyRecovery(realmId) {
    const frontRow = front(realmId);
    const availability = forestWarfareActionAvailability(realmId).recovery;
    if (!availability.ok) return { ok: false, reason: availability.reason };
    pay(FOREST_WAR_COSTS.recovery);
    frontRow.recoveryYear = yearNow();
    const scar = frontRow.scars.shift();
    const geo = state.resourceGeography;
    const width = number(state.worldW, 0);
    let restored = 0;
    if (scar && geo?.forestStock && width) {
        const index = scar.y * width + scar.x;
        if (index >= 0 && index < geo.forestStock.length) {
            const capacity = Math.max(number(geo.forestCapacity?.[index], 20), 20);
            const before = number(geo.forestStock[index]);
            geo.forestStock[index] = Math.min(capacity, before + Math.max(8, Math.round(capacity * 0.18)));
            restored = geo.forestStock[index] - before;
        }
    }
    state.morale = clamp(number(state.morale, 50) + 1, 0, 100);
    ensureForestWarfare().totals.scarsHealed++;
    noteAction(frontRow, "WAR ECOLOGY — the old scar at " + (scar ? scar.x + ", " + scar.y : "the wood") + " is planted over.");
    return { ok: true, healed: Boolean(scar), restored };
}

// —— Annual pass ————————————————————————————————————————————————————————

function convertFrontForest(frontRow, profile, map) {
    const origin = regionAnchor(frontRow.provinceId);
    const tile = forestTileNear(origin.x, origin.y, 20);
    if (!tile) return 0;
    const take = Math.max(1, Math.floor(tile.stock * (0.18 + frontRow.settlers * 0.03)));
    const geo = state.resourceGeography;
    geo.forestStock[tile.index] = Math.max(0, tile.stock - take);
    addResource("food", Math.max(1, Math.round(take * 0.35)));
    if (!frontRow.scars.some(scar => scar.x === tile.x && scar.y === tile.y)) {
        addScar(frontRow, tile.x, tile.y, "settler clearance", Math.ceil(number(profile?.recoveryYears, 30) / 5));
    }
    return take;
}

export function updateForestWarfare() {
    const ledger = ensureForestWarfare();
    const year = yearNow();
    if (ledger.lastUpdateYear >= year) return false;
    ledger.lastUpdateYear = year;
    const map = ensureWorldMap();
    for (const frontRow of ledger.fronts) {
        const profile = forestWarfareProfileFor(frontRow.realmId);
        const realm = realmRow(frontRow.realmId);
        const province = map.regions.find(region => region.id === frontRow.provinceId) || null;
        const frontier = map.frontiers.find(entry => entry.realmId === frontRow.realmId) || null;
        const war = Boolean(realm && realm.treaty === "war");
        // A treaty that meets its term is kept faith; a war breaks it.
        if (frontRow.treaty && (war || frontRow.treaty.untilYear < year)) {
            if (war && realm) realm.relation = clamp(realm.relation - 12);
            else if (realm) realm.relation = clamp(realm.relation + 3);
            recordHistory(ledger, "treaty", (war ? "War broke" : "Treaty kept") + " with " + realmName(frontRow.realmId) + ".", frontRow.realmId);
            frontRow.treaty = null;
            if (war) frontRow.partisans = 0;
        }
        // Border security pushes the existing frontier pressure down.
        const security = frontRow.posts * 5 + frontRow.watch * 4 + frontRow.scouts * 2;
        if (frontier) {
            frontier.pressure = clamp(frontier.pressure - Math.min(18, security), 0, 100);
            frontRow.pressure = frontier.pressure;
        }
        if (war) {
            frontRow.warYears++;
            if (frontRow.partisans > 0 && province) {
                province.control = clamp(province.control - Math.min(12, frontRow.partisans * 2), 0, 100);
                if (realm) realm.warExhaustion = clamp(realm.warExhaustion + 1);
            }
            const upkeep = frontRow.elephants * 2;
            if (upkeep > 0) {
                const available = number(state.resources?.food);
                if (available >= upkeep) addResource("food", -upkeep);
                else {
                    addResource("food", -Math.max(0, available));
                    frontRow.elephants = Math.max(0, frontRow.elephants - Math.ceil((upkeep - available) / 2));
                }
            }
            if (frontRow.warYears % 2 === 0) frontRow.refugees = Math.min(FOREST_WARFARE_LIMITS.refugees, frontRow.refugees + 1);
            if (realm && frontRow.partisans > 0) realm.warExhaustion = clamp(realm.warExhaustion + frontRow.partisans * 0.2);
        } else {
            if (frontRow.treaty) frontRow.partisans = 0;
            else if (frontRow.partisans > 0 && year % 2 === 0) frontRow.partisans--;
        }
        // Route, customs and smuggling. These write real gold and relation.
        const routeIncome = annualRouteIncome(frontRow, realm, profile);
        const customsIncome = annualCustoms(frontRow);
        if (routeIncome + customsIncome > 0) {
            addResource("gold", routeIncome + customsIncome);
            if (realm) realm.tradeVolume = Math.min(1_000_000_000, number(realm.tradeVolume) + 6);
        }
        if (!war && frontRow.customs > 0 && frontRow.watch < 3) {
            const risk = Math.max(5, frontRow.customs * 2 + number(profile?.smugglerPaths, 2) * 2 - frontRow.watch * 4 - frontRow.scouts * 3);
            if (hashString(frontRow.realmId + ":" + year + ":evade") % 100 < risk && realm) {
                realm.relation = clamp(realm.relation - 2);
                ledger.totals.smugglersCaught++;
                recordHistory(ledger, "smuggling", "Smugglers evaded the " + realmName(frontRow.realmId) + " customs.", frontRow.realmId);
            }
        }
        // Settlers clear a bounded piece of real forest every year.
        if (frontRow.settlers > 0) {
            convertFrontForest(frontRow, profile, map);
            if (frontRow.settlers > 2 && !frontRow.rights && hashString(frontRow.realmId + ":" + year + ":resistance") % 100 < 32) {
                frontRow.rebels = Math.min(FOREST_WARFARE_LIMITS.rebels, frontRow.rebels + 1);
            }
        }
        // A camp that is not cleared grows and drains the province.
        if (frontRow.rebels > 0) {
            if (!frontRow.rights && year % 2 === 0) frontRow.rebels = Math.min(FOREST_WARFARE_LIMITS.rebels, frontRow.rebels + 1);
            if (frontRow.rights && year % 2 === 0) frontRow.rebels = Math.max(0, frontRow.rebels - 1);
            if (province) province.control = clamp(province.control - Math.min(5, frontRow.rebels), 0, 100);
        }
        // Military colony and colonisation have their own upkeep and growth.
        if (frontRow.colony?.military) {
            if (number(state.resources?.food) >= 2) {
                addResource("food", -2);
                if (province) province.control = clamp(province.control + 2, 0, 100);
            } else {
                state.morale = clamp(number(state.morale, 50) - 1, 0, 100);
            }
        }
        // Scar recovery: one severity step per year, then the tile regrows.
        for (let index = frontRow.scars.length - 1; index >= 0; index--) {
            const scar = frontRow.scars[index];
            scar.severity = Math.max(0, number(scar.severity) - 1);
            if (scar.severity > 0) continue;
            const geo = state.resourceGeography;
            const width = number(state.worldW, 0);
            if (geo?.forestStock && width) {
                const tileIndex = scar.y * width + scar.x;
                if (tileIndex >= 0 && tileIndex < geo.forestStock.length) {
                    const capacity = Math.max(12, number(geo.forestCapacity?.[tileIndex], 12));
                    geo.forestStock[tileIndex] = Math.min(capacity, number(geo.forestStock[tileIndex]) + Math.max(6, Math.round(capacity * 0.12)));
                }
            }
            frontRow.scars.splice(index, 1);
            ledger.totals.scarsHealed++;
        }
        // Reserved mast timber becomes a real hull at the royal yard.
        if (frontRow.shipTimber >= 12 && state.military && typeof state.military === "object") {
            frontRow.shipTimber -= 12;
            state.military.ships = Math.max(0, Math.floor(number(state.military.ships, 0)) + 1);
            ledger.totals.shipsLaunched++;
            recordHistory(ledger, "ship", "Reserved ship timber launched a hull from the " + realmName(frontRow.realmId) + " frontier.", frontRow.realmId);
        }
        // Unsettled refugees cost morale; a settled frontier does not.
        if (frontRow.refugees > 0) state.morale = clamp(number(state.morale, 50) - Math.min(1.2, frontRow.refugees * 0.12), 0, 100);
    }
    ledger.history.unshift({
        year,
        kind: "year",
        realmId: null,
        summary: "Forest frontier review: " + ledger.fronts.reduce((sum, entry) => sum + entry.scars.length, 0) + " scars, "
            + ledger.fronts.reduce((sum, entry) => sum + entry.rebels, 0) + " rebel camps, "
            + ledger.fronts.reduce((sum, entry) => sum + entry.refugees, 0) + " refugee groups.",
    });
    if (ledger.history.length > FOREST_WARFARE_LIMITS.history) ledger.history.length = FOREST_WARFARE_LIMITS.history;
    ledger.revision++;
    return true;
}

export function forestWarfareSummary() {
    const ledger = ensureForestWarfare();
    ensureDiplomacy();
    const year = yearNow();
    const map = ensureWorldMap();
    const fronts = ledger.fronts.map(frontRow => {
        const profile = forestWarfareProfileFor(frontRow.realmId);
        const realm = realmRow(frontRow.realmId);
        const province = map.regions.find(region => region.id === frontRow.provinceId) || null;
        const actions = forestWarfareActionAvailability(frontRow.realmId);
        const modifiers = frontModifiers(frontRow, profile);
        return {
            realmId: frontRow.realmId,
            realmName: realmName(frontRow.realmId),
            provinceId: frontRow.provinceId,
            provinceName: regionDefinitionFor(frontRow.provinceId)?.name || frontRow.provinceId,
            ownerId: province?.ownerId || null,
            control: province?.control ?? 0,
            garrison: province?.garrison ?? 0,
            relation: realm ? Math.round(number(realm.relation)) : 0,
            trust: realm ? Math.round(number(realm.trust)) : 0,
            fear: realm ? Math.round(number(realm.fear)) : 0,
            treatyState: realm?.treaty || "none",
            war: realm?.treaty === "war",
            warExhaustion: realm ? Math.round(number(realm.warExhaustion)) : 0,
            profile,
            posts: frontRow.posts,
            watch: frontRow.watch,
            road: frontRow.road,
            scouts: frontRow.scouts,
            abatis: frontRow.abatis,
            elephants: frontRow.elephants,
            partisans: frontRow.partisans,
            siegeMaterial: Math.round(frontRow.siegeMaterial),
            shipTimber: Math.round(frontRow.shipTimber),
            maps: frontRow.maps,
            rights: Boolean(frontRow.rights),
            treaty: frontRow.treaty ? { ...frontRow.treaty } : null,
            preserve: frontRow.preserve ? { ...frontRow.preserve } : null,
            embargo: frontRow.embargo,
            customs: frontRow.customs,
            route: frontRow.route,
            settlers: frontRow.settlers,
            colony: frontRow.colony ? { ...frontRow.colony } : null,
            rebels: frontRow.rebels,
            refugees: frontRow.refugees,
            deportations: frontRow.deportations,
            scars: frontRow.scars.map(scar => ({ ...scar })),
            battles: frontRow.battles,
            victories: frontRow.victories,
            pressure: frontRow.pressure,
            modifiers,
            actions,
            annualRoute: annualRouteIncome(frontRow, realm, profile),
            annualCustoms: annualCustoms(frontRow),
        };
    });
    const totals = {
        ...ledger.totals,
        fronts: fronts.length,
        wars: fronts.filter(entry => entry.war).length,
        frontsHeld: fronts.filter(entry => entry.ownerId === "crown").length,
        posts: fronts.reduce((sum, entry) => sum + entry.posts, 0),
        watch: fronts.reduce((sum, entry) => sum + entry.watch, 0),
        scars: fronts.reduce((sum, entry) => sum + entry.scars.length, 0),
        rebels: fronts.reduce((sum, entry) => sum + entry.rebels, 0),
        refugees: fronts.reduce((sum, entry) => sum + entry.refugees, 0),
        partisans: fronts.reduce((sum, entry) => sum + entry.partisans, 0),
        shipTimber: fronts.reduce((sum, entry) => sum + entry.shipTimber, 0),
        siegeMaterial: fronts.reduce((sum, entry) => sum + entry.siegeMaterial, 0),
        elephants: fronts.reduce((sum, entry) => sum + entry.elephants, 0),
        settlers: fronts.reduce((sum, entry) => sum + entry.settlers, 0),
        customs: fronts.reduce((sum, entry) => sum + entry.annualCustoms, 0),
        routes: fronts.filter(entry => entry.route).length,
        embargoes: fronts.filter(entry => entry.embargo).length,
        treaties: fronts.filter(entry => entry.treaty).length,
        preservedTiles: fronts.filter(entry => entry.preserve).length,
    };
    return Object.freeze({
        version: FOREST_WARFARE_VERSION,
        year,
        season: seasonNow(),
        seasonLabel: SEASON_LABELS[seasonNow()],
        fronts,
        totals,
        costs: FOREST_WAR_COSTS,
        limits: FOREST_WARFARE_LIMITS,
        customsRates: FOREST_CUSTOMS_RATES,
        embargoGoods: FOREST_EMBARGO_GOODS,
        requirements: FOREST_WARFARE_REQUIREMENTS,
        requirementCount: FOREST_WARFARE_REQUIREMENTS.length,
        profiles: FOREST_WAR_PROFILE_LIST.length,
        history: ledger.history.slice(0, 10),
        modifiers: forestWarfareModifiers(),
    });
}

export function forestWarfareSnapshot() {
    return JSON.parse(JSON.stringify(ensureForestWarfare()));
}

export function forestWarfareScore() {
    const summary = forestWarfareSummary();
    return Math.round(summary.totals.battles * 3 + summary.totals.victories * 5
        + summary.totals.posts * 2 + summary.totals.routes * 4 + summary.totals.treaties * 4
        + summary.totals.preservedTiles * 5 - summary.totals.scars * 2 - summary.totals.rebels);
}
