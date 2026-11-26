// 1.2.23.1.181–210 — forest culture, religion and woodland knowledge.
//
// This is a bounded culture ledger, not a second economy. It owns groves,
// favour, rights, festivals, lore, conflicts and the annual role census. The
// yields it changes are the existing forage, hunt, farm, pannage and charcoal
// paths. All writes are additive under state.economy.productionChains, so old
// saves load unchanged and the deterministic simulation is preserved.

import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { recordLegacy } from "./legacy.js";
import { getForestHabitatAt } from "./resource-geography.js";
import { sacredGroveTileAt } from "../world/sacred-groves.js";
import {
    FOREST_CULTURE_BY_REGION,
    FOREST_CULTURE_REQUIREMENTS,
    forestCultureCalendarFor,
    forestCultureNameFor,
    forestCultureProfileFor,
} from "../world/forest-culture.js";

export const FOREST_CULTURE_VERSION = 1;
export const FOREST_CULTURE_LIMITS = Object.freeze({
    version: FOREST_CULTURE_VERSION,
    groves: 8,
    lore: 60,
    conflicts: 8,
    history: 24,
    actions: 16,
    updateSeasonDays: 20,
});
export const FOREST_GROVE_BASE_LIMIT = 4;
export const FOREST_RIGHTS_PRIORITIES = Object.freeze(["balance", "commons", "hunt", "timber"]);
export const FOREST_CULTURE_TECHS = Object.freeze({
    forestry: "woodland-forestry",
    herbalism: "woodland-herb-lore",
    astronomy: "woodland-astronomy",
    cartography: "woodland-cartography",
    philosophy: "woodland-natural-philosophy",
});
export const FOREST_CULTURE_TECH_LIST = Object.freeze(Object.values(FOREST_CULTURE_TECHS));

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yearNow = () => Math.max(1, Math.floor(number(state.year, 1)));
const seasonNow = () => Math.max(0, Math.min(3, Math.floor(number(state.seasonIndex, 0))));
const isComplete = entity => Boolean(entity && !entity.dead && entity.isBuilding?.() && !(entity.construction && number(entity.construction.stage) < 3));
const TERRAIN_RADIUS = 10;
const ROLE_RADIUS = 5;
const siteCache = new Map();
let homeCache = null;

function cleanText(value, limit = 180) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function emptyLedger() {
    return {
        version: FOREST_CULTURE_VERSION,
        homeRegion: null,
        groves: [],
        lore: [],
        conflicts: [],
        history: [],
        actions: [],
        favor: 50,
        festivals: 0,
        offerings: 0,
        rites: 0,
        weddings: 0,
        nextGroveId: 1,
        nextConflictId: 1,
        lastOfferingKey: "",
        festivalYear: 0,
        huntYear: 0,
        weddingYear: 0,
        rightsChangedYear: 0,
        lastAnnualYear: 0,
        lastUpdateSeason: -1,
        lastUpdateYear: 0,
        rights: { priority: "balance", sinceYear: 1 },
        revision: 0,
    };
}

function cleanLoreEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const kind = ["tale", "legend", "song"].includes(entry.kind) ? entry.kind : null;
    const title = cleanText(entry.title, 120);
    if (!kind || !title) return null;
    return {
        id: cleanText(entry.id, 80) || kind + "-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48),
        kind, title,
        regionId: FOREST_CULTURE_BY_REGION[entry.regionId] ? entry.regionId : null,
        text: cleanText(entry.text, 420),
        year: Math.max(1, Math.floor(number(entry.year, 1))),
    };
}

function cleanConflict(entry) {
    if (!entry || typeof entry !== "object") return null;
    const kind = ["timber", "hunt", "commons", "grove"].includes(entry.kind) ? entry.kind : null;
    if (!kind) return null;
    return {
        id: cleanText(entry.id, 80) || "conflict-" + kind + "-" + Math.max(1, Math.floor(number(entry.sinceYear, 1))),
        kind,
        label: cleanText(entry.label, 120) || "Wood-right dispute",
        detail: cleanText(entry.detail, 260),
        sinceYear: Math.max(1, Math.floor(number(entry.sinceYear, 1))),
        severity: clamp(entry.severity ?? 2, 1, 5),
        resolved: Boolean(entry.resolved),
        resolvedYear: entry.resolved ? Math.max(1, Math.floor(number(entry.resolvedYear, 1))) : null,
    };
}

function cleanGrove(entry) {
    if (!entry || typeof entry !== "object") return null;
    const x = Math.floor(number(entry.x, -1));
    const y = Math.floor(number(entry.y, -1));
    if (x < 0 || y < 0) return null;
    return {
        id: cleanText(entry.id, 80) || "grove-" + x + "-" + y,
        x, y,
        regionId: FOREST_CULTURE_BY_REGION[entry.regionId] ? entry.regionId : null,
        label: cleanText(entry.label, 120) || "Sacred grove",
        devotion: clamp(entry.devotion ?? 50, 0, 100),
        foundedYear: Math.max(1, Math.floor(number(entry.foundedYear, 1))),
        lastOfferingYear: Math.max(0, Math.floor(number(entry.lastOfferingYear, 0))),
    };
}

export function normalizeForestCulture(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const ledger = emptyLedger();
    if (FOREST_CULTURE_BY_REGION[source.homeRegion]) ledger.homeRegion = source.homeRegion;
    for (const entry of Array.isArray(source.groves) ? source.groves : []) {
        const grove = cleanGrove(entry);
        if (grove) ledger.groves.push(grove);
        if (ledger.groves.length >= FOREST_CULTURE_LIMITS.groves) break;
    }
    const seenLore = new Set();
    for (const entry of Array.isArray(source.lore) ? source.lore : []) {
        const lore = cleanLoreEntry(entry);
        if (!lore || seenLore.has(lore.id)) continue;
        seenLore.add(lore.id);
        ledger.lore.push(lore);
        if (ledger.lore.length >= FOREST_CULTURE_LIMITS.lore) break;
    }
    for (const entry of Array.isArray(source.conflicts) ? source.conflicts : []) {
        const conflict = cleanConflict(entry);
        if (conflict) ledger.conflicts.push(conflict);
        if (ledger.conflicts.length >= FOREST_CULTURE_LIMITS.conflicts) break;
    }
    for (const entry of Array.isArray(source.history) ? source.history : []) {
        if (!entry || typeof entry !== "object") continue;
        ledger.history.push({
            year: Math.max(1, Math.floor(number(entry.year, 1))),
            favor: clamp(entry.favor, 0, 100),
            groves: Math.max(0, Math.floor(number(entry.groves))),
            conflicts: Math.max(0, Math.floor(number(entry.conflicts))),
            lore: Math.max(0, Math.floor(number(entry.lore))),
            priority: FOREST_RIGHTS_PRIORITIES.includes(entry.priority) ? entry.priority : "balance",
        });
        if (ledger.history.length >= FOREST_CULTURE_LIMITS.history) break;
    }
    for (const entry of Array.isArray(source.actions) ? source.actions : []) {
        if (!entry || typeof entry !== "object" || !entry.label) continue;
        ledger.actions.push({ label: cleanText(entry.label, 120), year: Math.max(1, Math.floor(number(entry.year, 1))), kind: cleanText(entry.kind, 30) || "action" });
        if (ledger.actions.length >= FOREST_CULTURE_LIMITS.actions) break;
    }
    ledger.favor = clamp(source.favor ?? 50, 0, 100);
    ledger.festivals = Math.max(0, Math.floor(number(source.festivals)));
    ledger.offerings = Math.max(0, Math.floor(number(source.offerings)));
    ledger.rites = Math.max(0, Math.floor(number(source.rites)));
    ledger.weddings = Math.max(0, Math.floor(number(source.weddings)));
    ledger.nextGroveId = Math.max(1, Math.floor(number(source.nextGroveId, 1)));
    ledger.nextConflictId = Math.max(1, Math.floor(number(source.nextConflictId, 1)));
    ledger.lastOfferingKey = cleanText(source.lastOfferingKey, 40);
    ledger.festivalYear = Math.max(0, Math.floor(number(source.festivalYear)));
    ledger.huntYear = Math.max(0, Math.floor(number(source.huntYear)));
    ledger.weddingYear = Math.max(0, Math.floor(number(source.weddingYear)));
    ledger.rightsChangedYear = Math.max(0, Math.floor(number(source.rightsChangedYear)));
    ledger.lastAnnualYear = Math.max(0, Math.floor(number(source.lastAnnualYear)));
    ledger.lastUpdateSeason = Math.max(-1, Math.min(3, Math.floor(number(source.lastUpdateSeason, -1))));
    ledger.lastUpdateYear = Math.max(0, Math.floor(number(source.lastUpdateYear)));
    const priority = FOREST_RIGHTS_PRIORITIES.includes(source.rights?.priority) ? source.rights.priority : "balance";
    ledger.rights = { priority, sinceYear: Math.max(1, Math.floor(number(source.rights?.sinceYear, 1))) };
    ledger.revision = Math.max(0, Math.floor(number(source.revision)));
    return ledger;
}

export function ensureForestCulture() {
    if (!state.economy || typeof state.economy !== "object") state.economy = {};
    if (!state.economy.productionChains || typeof state.economy.productionChains !== "object" || Array.isArray(state.economy.productionChains)) {
        state.economy.productionChains = {};
    }
    const current = state.economy.productionChains.forestCulture;
    if (current && current.version === FOREST_CULTURE_VERSION) {
        if (!Array.isArray(current.groves)) current.groves = [];
        if (!Array.isArray(current.lore)) current.lore = [];
        if (!Array.isArray(current.conflicts)) current.conflicts = [];
        if (!Array.isArray(current.history)) current.history = [];
        if (!Array.isArray(current.actions)) current.actions = [];
        if (!current.rights || typeof current.rights !== "object") current.rights = { priority: "balance", sinceYear: 1 };
        return current;
    }
    state.economy.productionChains.forestCulture = normalizeForestCulture(current);
    return state.economy.productionChains.forestCulture;
}

function forestStockAt(x, y) {
    const geo = state.resourceGeography;
    if (!geo?.forestStock || x < 0 || y < 0 || x >= state.worldW || y >= state.worldH) return 0;
    return Math.max(0, number(geo.forestStock[y * state.worldW + x]));
}

function forestNear(x, y, radius = ROLE_RADIUS) {
    const cx = Math.floor(number(x, 0));
    const cy = Math.floor(number(y, 0));
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (forestStockAt(cx + dx, cy + dy) > 0) return true;
        }
    }
    return false;
}

function deepForestTiles(x, y, radius = 4) {
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (forestStockAt(Math.floor(x) + dx, Math.floor(y) + dy) > 0) count++;
        }
    }
    return count;
}

function anchorForHome() {
    const shrines = state.entities.filter(entity => isComplete(entity) && entity.type === TYPE.SHRINE);
    if (shrines.length) return shrines[0];
    return state.entities.find(entity => isComplete(entity) && (entity.type === TYPE.KEEP || entity.type === TYPE.TOWN_HALL))
        || state.entities.find(entity => isComplete(entity) && entity.isBuilding?.())
        || null;
}

function homeProfile(ledger) {
    const anchor = anchorForHome();
    if (!anchor) return null;
    const key = [state.worldSeed, state.worldW, state.worldH, anchor.id, Math.floor(anchor.x), Math.floor(anchor.y)].join("|");
    if (homeCache?.key === key) {
        ledger.homeRegion = homeCache.regionId;
        return homeCache.profile;
    }
    let best = null;
    for (let index = 0; index < (state.resourceGeography?.forestStock?.length || 0); index++) {
        if (!state.resourceGeography.forestStock[index]) continue;
        const x = index % state.worldW;
        const y = Math.floor(index / state.worldW);
        const distance = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
        if (!best || distance < best.distance) best = { x, y, distance };
    }
    if (!best) return null;
    let regionId = null;
    try {
        regionId = getForestHabitatAt(best.x, best.y)?.forestStand?.regionalType?.id || null;
    } catch {
        regionId = null;
    }
    const profile = forestCultureProfileFor(regionId) || FOREST_CULTURE_REGIONS[0] || null;
    if (!profile) return null;
    homeCache = { key, regionId: profile.id, profile };
    ledger.homeRegion = profile.id;
    return profile;
}

function shrineNear(x, y, radius = 8) {
    return state.entities.find(entity => isComplete(entity) && entity.type === TYPE.SHRINE
        && Math.abs(number(entity.x) - number(x)) <= radius && Math.abs(number(entity.y) - number(y)) <= radius) || null;
}

function scriptoriumNear(x, y, radius = 6) {
    return state.entities.find(entity => isComplete(entity) && entity.type === TYPE.SCRIPTORIUM
        && Math.abs(number(entity.x) - number(x)) <= radius && Math.abs(number(entity.y) - number(y)) <= radius) || null;
}

export function forestCultureRoles() {
    const villagers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
    const buildings = state.entities.filter(entity => isComplete(entity));
    const role = { druids: 0, foresters: 0, woodcutters: 0, charcoal: 0, forestFarmers: 0, herders: 0, herbWives: 0, hermits: 0, monasteries: 0, scholars: 0, singers: 0, hunters: 0 };
    for (const villager of villagers) {
        const job = String(villager.job || "");
        if (job === "druid") role.druids++;
        else if (job === "forester") role.foresters++;
        else if (job === "woodcutter") role.woodcutters++;
        else if (job === "innkeeper") role.singers++;
        else if ((job === "scribe" || job === "teacher" || job === "scholar") && villager.workplace && forestNear(villager.workplace.x, villager.workplace.y, 7)) role.scholars++;
        else if (job === "healer" && villager.workplace && forestNear(villager.workplace.x, villager.workplace.y, 7)) role.herbWives++;
        else if (job === "stablehand" && villager.workplace && forestNear(villager.workplace.x, villager.workplace.y, 7)) role.herders++;
        else if (job === "farmer" && villager.workplace && forestNear(villager.workplace.x, villager.workplace.y, 6)) role.forestFarmers++;
    }
    for (const building of buildings) {
        if (building.type === TYPE.FOREST_WORKS && building.forestMode === "charcoal") role.charcoal++;
        if (building.type === TYPE.SHRINE && deepForestTiles(building.x, building.y) >= 20) {
            role.hermits++;
            if (scriptoriumNear(building.x, building.y)) role.monasteries++;
        }
    }
    // Hunters are the forester field parties: the game has one woodland office
    // for both timber and game, so the culture census reports the actual people
    // who can be sent out rather than inventing an unemployed hunter class.
    role.hunters = Math.floor(role.foresters / 2);
    return Object.freeze(role);
}

function knowledgeUnlocked(id) {
    return Boolean(state.research?.completed?.[id]);
}

export function forestCultureKnowledge() {
    return Object.freeze({
        forestry: knowledgeUnlocked(FOREST_CULTURE_TECHS.forestry),
        herbalism: knowledgeUnlocked(FOREST_CULTURE_TECHS.herbalism),
        astronomy: knowledgeUnlocked(FOREST_CULTURE_TECHS.astronomy),
        cartography: knowledgeUnlocked(FOREST_CULTURE_TECHS.cartography),
        philosophy: knowledgeUnlocked(FOREST_CULTURE_TECHS.philosophy),
    });
}

export function forestCultureGroveLimit() {
    const knowledge = forestCultureKnowledge();
    return Math.min(FOREST_CULTURE_LIMITS.groves, FOREST_GROVE_BASE_LIMIT + (knowledge.cartography ? 2 : 0) + (knowledge.philosophy ? 1 : 0));
}

export function isSacredGroveTile(x, y) {
    return Boolean(sacredGroveTileAt(x, y));
}

// Called by the shared forest harvest guard. This deliberately reads the
// public state contract instead of importing this module, which keeps the
// resource path free of a system dependency.
export function sacredGroveAt(x, y) {
    return isSacredGroveTile(x, y);
}

export function forestCultureRightsLabel(priority) {
    return ({ balance: "Balance", commons: "Commons", hunt: "Hunting", timber: "Timber" })[priority] || "Balance";
}

export function forestCultureModifiers() {
    const ledger = ensureForestCulture();
    const roles = forestCultureRoles();
    const knowledge = forestCultureKnowledge();
    const priority = ledger.rights.priority;
    const groves = ledger.groves.length;
    const season = seasonNow();
    const active = groves > 0 || ledger.lore.length > 0;
    const favorFactor = (ledger.favor - 50) / 1000;
    const monastery = roles.monasteries;
    return Object.freeze({
        favor: ledger.favor,
        priority,
        groves,
        roles,
        knowledge,
        forage: clamp(1 + favorFactor + groves * 0.006 + (priority === "commons" ? 0.06 : 0) + (knowledge.herbalism ? 0.04 : 0) + (active && season === 0 ? 0.03 : 0), 0.82, 1.28),
        hunt: clamp(1 + (ledger.huntYear === yearNow() ? 0.12 : 0) + (priority === "hunt" ? 0.08 : 0) + (knowledge.astronomy ? 0.03 : 0) + (active && season === 2 ? 0.04 : 0) - (priority === "timber" ? 0.04 : 0), 0.8, 1.3),
        farm: clamp(1 + Math.min(6, roles.forestFarmers) * 0.008 + (priority === "commons" ? 0.05 : 0) + groves * 0.008 + (active && season === 0 ? 0.02 : 0), 0.96, 1.2),
        herd: clamp(1 + Math.min(6, roles.herders) * 0.01 + (priority === "commons" ? 0.06 : 0) + groves * 0.006, 0.96, 1.22),
        timber: clamp(1 + (priority === "timber" ? 0.06 : 0) + (knowledge.forestry ? 0.03 : 0) - (active && groves ? 0.02 : 0), 0.92, 1.14),
        medicine: clamp(1 + Math.min(4, roles.herbWives) * 0.02 + (knowledge.herbalism ? 0.05 : 0) + monastery * 0.03, 0.96, 1.2),
        charcoal: clamp(1 + Math.max(0, roles.charcoal - 1) * 0.02 + (knowledge.forestry ? 0.01 : 0), 1, 1.12),
        knowledge: clamp(1 + Object.values(knowledge).filter(Boolean).length * 0.02 + monastery * 0.01, 1, 1.14),
        morale: clamp(1 + (ledger.favor - 50) / 500 + groves * 0.005, 0.9, 1.1),
    });
}

export function forestCultureFarmFactor() {
    return forestCultureModifiers().farm;
}

export function forestCultureHerdBonusDays() {
    const mods = forestCultureModifiers();
    return Math.max(0, Math.floor((mods.herd - 1) * 30));
}

export function forestCultureChildName(sex, seed) {
    const ledger = ensureForestCulture();
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    if (!profile) return null;
    if (!ledger.lore.some(entry => entry.kind === "tale" || entry.kind === "song")) return null;
    return forestCultureNameFor(profile, sex, seed);
}

function canPay(cost) {
    return Object.entries(cost).every(([key, amount]) => number(state.resources?.[key]) >= amount);
}

function pay(cost) {
    for (const [key, amount] of Object.entries(cost)) addResource(key, -amount);
}

function noteAction(ledger, kind, label) {
    ledger.actions.unshift({ kind, label: cleanText(label, 120), year: yearNow() });
    if (ledger.actions.length > FOREST_CULTURE_LIMITS.actions) ledger.actions.length = FOREST_CULTURE_LIMITS.actions;
}

function findGrove(ledger) {
    return ledger.groves.find(grove => grove.devotion < 100) || ledger.groves[0] || null;
}

function ritualStock() {
    const stock = state.forestGathering?.stock;
    if (!stock || typeof stock !== "object") return null;
    return stock;
}

function takeRitualGood(preferred) {
    const stock = ritualStock();
    if (!stock) return null;
    const order = [...new Set([preferred, "honey", "herbs", "mushrooms"].filter(Boolean))];
    for (const good of order) {
        const available = Math.max(0, Math.floor(number(stock[good])));
        if (available >= 2) {
            stock[good] = available - 2;
            return good;
        }
    }
    return null;
}

export function forestCultureActionAvailability() {
    const ledger = ensureForestCulture();
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    const roles = forestCultureRoles();
    const shrine = state.entities.find(entity => isComplete(entity) && entity.type === TYPE.SHRINE) || null;
    const grove = findGrove(ledger);
    const reason = (ok, text) => ({ ok, reason: ok ? "Ready" : text });
    return Object.freeze({
        grove: reason(Boolean(shrine) && ledger.groves.length < forestCultureGroveLimit() && canPay({ wood: 12, gold: 8 }),
            !shrine ? "Build and finish a shrine near the wood" : ledger.groves.length >= forestCultureGroveLimit() ? "The grove limit is reached" : "Needs 12 wood and 8 gold"),
        offering: reason(Boolean(grove) && Boolean(profile) && ledger.lastOfferingKey !== yearNow() + "-" + seasonNow() && Boolean(takeRitualGoodDry(profile?.offeringGood)),
            !grove ? "Consecrate a grove first" : ledger.lastOfferingKey === yearNow() + "-" + seasonNow() ? "This season has already been honoured" : "Needs 2 honey, herbs or mushrooms"),
        festival: reason(Boolean(grove) && ledger.festivalYear !== yearNow() && canPay({ food: 8, gold: 5 }),
            !grove ? "Consecrate a grove first" : ledger.festivalYear === yearNow() ? "A festival has already been held this year" : "Needs 8 food and 5 gold"),
        hunt: reason(Boolean(grove) && ledger.huntYear !== yearNow() && canPay({ food: 4 }),
            !grove ? "Consecrate a grove first" : ledger.huntYear === yearNow() ? "The hunt rite is already open this year" : "Needs 4 food"),
        wedding: reason(Boolean(grove) && ledger.weddingYear !== yearNow() && canPay({ gold: 10 }),
            !grove ? "Consecrate a grove first" : ledger.weddingYear === yearNow() ? "A tree wedding has already been held this year" : "Needs 10 gold"),
        lore: reason(Boolean(profile) && !ledger.lore.some(entry => entry.regionId === profile.id && entry.kind === "tale"),
            !profile ? "No living woodland found" : "The home region's tale is already in the archive"),
        rights: reason(roles.foresters > 0 && ledger.rightsChangedYear !== yearNow(),
            roles.foresters <= 0 ? "Appoint a forester to administer the wood-right" : "The forest law changes once a year"),
        mediate: reason(ledger.conflicts.some(entry => !entry.resolved) && canPay({ gold: 6 }),
            !ledger.conflicts.some(entry => !entry.resolved) ? "No open wood-right conflict" : "Needs 6 gold"),
    });
}

// Availability must not mutate the harvest ledger, so this look-only twin is
// used only for the UI gate. The action itself still consumes the goods.
function takeRitualGoodDry(preferred) {
    const stock = ritualStock();
    if (!stock) return null;
    const order = [...new Set([preferred, "honey", "herbs", "mushrooms"].filter(Boolean))];
    return order.find(good => Math.max(0, Math.floor(number(stock[good]))) >= 2) || null;
}

export function dedicateSacredGrove() {
    const ledger = ensureForestCulture();
    const shrine = state.entities.find(entity => isComplete(entity) && entity.type === TYPE.SHRINE);
    if (!shrine) return { ok: false, reason: "Build and finish a shrine near the wood first" };
    if (ledger.groves.length >= forestCultureGroveLimit()) return { ok: false, reason: "The sacred grove limit is reached" };
    if (!canPay({ wood: 12, gold: 8 })) return { ok: false, reason: "Needs 12 wood and 8 gold" };
    let chosen = null;
    let chosenStand = null;
    for (let radius = 2; radius <= TERRAIN_RADIUS && !chosen; radius++) {
        for (let dy = -radius; dy <= radius && !chosen; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const x = Math.floor(number(shrine.x) + dx);
                const y = Math.floor(number(shrine.y) + dy);
                if (forestStockAt(x, y) <= 0 || isSacredGroveTile(x, y)) continue;
                const stand = getForestHabitatAt(x, y)?.forestStand;
                if (!stand?.forest) continue;
                chosen = { x, y };
                chosenStand = stand;
                break;
            }
        }
    }
    if (!chosen) return { ok: false, reason: "No living forest tile stands near the shrine" };
    const profile = forestCultureProfileFor(chosenStand?.regionalType?.id) || homeProfile(ledger);
    if (!profile) return { ok: false, reason: "The woodland has no regional culture" };
    pay({ wood: 12, gold: 8 });
    const id = "grove-" + ledger.nextGroveId++;
    ledger.groves.push({
        id, x: chosen.x, y: chosen.y, regionId: profile.id,
        label: profile.groveName + (ledger.groves.length ? " " + (ledger.groves.length + 1) : ""),
        devotion: 50, foundedYear: yearNow(), lastOfferingYear: 0,
    });
    ledger.homeRegion = profile.id;
    ledger.favor = clamp(ledger.favor + 5);
    ledger.revision++;
    noteAction(ledger, "grove", "Consecrated " + profile.groveName);
    applyPoliticalEffects({ clergy: 1, commons: 1 });
    recordLegacy("forest", "Sacred grove consecrated", profile.groveName + " · " + profile.spirit, { importance: 2 });
    addLog("SACRED GROVE CONSECRATED — " + profile.groveName + " is withdrawn from the axe.", "#8fbf7f", "forest");
    return { ok: true, grove: { ...ledger.groves[ledger.groves.length - 1] }, profile };
}

export function makeForestOffering() {
    const ledger = ensureForestCulture();
    const grove = findGrove(ledger);
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    if (!grove) return { ok: false, reason: "Consecrate a grove first" };
    if (!profile) return { ok: false, reason: "No living woodland found" };
    if (ledger.lastOfferingKey === yearNow() + "-" + seasonNow()) return { ok: false, reason: "This season has already been honoured" };
    const good = takeRitualGood(profile.offeringGood);
    if (!good) return { ok: false, reason: "Needs 2 honey, herbs or mushrooms from the forest store" };
    const bonus = knowledgeUnlocked(FOREST_CULTURE_TECHS.astronomy) ? 10 : 8;
    ledger.favor = clamp(ledger.favor + bonus);
    grove.devotion = clamp(grove.devotion + 8);
    grove.lastOfferingYear = yearNow();
    ledger.lastOfferingKey = yearNow() + "-" + seasonNow();
    ledger.offerings++;
    ledger.revision++;
    noteAction(ledger, "offering", "Offering of " + good + " at " + grove.label);
    addLog("OFFERING MADE — " + good + " set at " + grove.label + "; the grove's favour rises.", "#d6b56d", "forest");
    return { ok: true, good, favor: ledger.favor, grove: { ...grove } };
}

export function holdForestFestival() {
    const ledger = ensureForestCulture();
    const grove = findGrove(ledger);
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    if (!grove) return { ok: false, reason: "Consecrate a grove first" };
    if (!profile) return { ok: false, reason: "No living woodland found" };
    if (ledger.festivalYear === yearNow()) return { ok: false, reason: "A forest festival has already been held this year" };
    if (!canPay({ food: 8, gold: 5 })) return { ok: false, reason: "Needs 8 food and 5 gold" };
    pay({ food: 8, gold: 5 });
    ledger.festivalYear = yearNow();
    ledger.festivals++;
    ledger.favor = clamp(ledger.favor + 6);
    ledger.revision++;
    state.morale = clamp(number(state.morale, 50) + 4, 0, 100);
    applyPoliticalEffects({ legitimacy: 1, clergy: 2, commons: 1 });
    noteAction(ledger, "festival", profile.festival.name);
    recordLegacy("festival", profile.festival.name, profile.festival.focus + " · " + profile.region, { importance: 2 });
    addLog("FOREST FESTIVAL — " + profile.festival.name + ": " + profile.festival.focus + ".", "#d6b56d", "festival");
    return { ok: true, festival: profile.festival, favor: ledger.favor };
}

export function performHuntRite() {
    const ledger = ensureForestCulture();
    const grove = findGrove(ledger);
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    if (!grove) return { ok: false, reason: "Consecrate a grove first" };
    if (!profile) return { ok: false, reason: "No living woodland found" };
    if (ledger.huntYear === yearNow()) return { ok: false, reason: "The hunt rite is already open this year" };
    if (!canPay({ food: 4 })) return { ok: false, reason: "Needs 4 food for the hunting party" };
    pay({ food: 4 });
    ledger.huntYear = yearNow();
    ledger.rites++;
    ledger.favor = clamp(ledger.favor + 3);
    ledger.revision++;
    state.morale = clamp(number(state.morale, 50) + 2, 0, 100);
    applyPoliticalEffects({ commons: 1 });
    noteAction(ledger, "hunt", "Hunt rite · " + profile.huntRule.slice(0, 70));
    addLog("HUNT RITE OPENED — " + profile.huntRule, "#b58b62", "forest");
    return { ok: true, rule: profile.huntRule, year: yearNow() };
}

export function performTreeWedding() {
    const ledger = ensureForestCulture();
    const grove = findGrove(ledger);
    if (!grove) return { ok: false, reason: "Consecrate a grove first" };
    if (ledger.weddingYear === yearNow()) return { ok: false, reason: "A tree wedding has already been held this year" };
    if (!canPay({ gold: 10 })) return { ok: false, reason: "Needs 10 gold for the wedding feast" };
    pay({ gold: 10 });
    ledger.weddingYear = yearNow();
    ledger.weddings++;
    ledger.favor = clamp(ledger.favor + 8);
    grove.devotion = clamp(grove.devotion + 12);
    ledger.revision++;
    applyPoliticalEffects({ legitimacy: 2, clergy: 2 });
    noteAction(ledger, "wedding", "Tree wedding at " + grove.label);
    recordLegacy("forest", "Tree wedding", "The village is wed to " + grove.label + " for another year.", { importance: 2 });
    addLog("TREE WEDDING — the village is bound to " + grove.label + ".", "#c7a26b", "forest");
    return { ok: true, grove: { ...grove }, favor: ledger.favor };
}

export function setForestRights(priority) {
    const ledger = ensureForestCulture();
    const next = String(priority || "");
    const roles = forestCultureRoles();
    if (!FOREST_RIGHTS_PRIORITIES.includes(next)) return { ok: false, reason: "Unknown forest right" };
    if (roles.foresters <= 0) return { ok: false, reason: "Appoint a forester to administer the wood-right" };
    if (ledger.rightsChangedYear === yearNow()) return { ok: false, reason: "The forest law changes once a year" };
    if (ledger.rights.priority === next) return { ok: false, reason: "This right is already in force" };
    ledger.rights = { priority: next, sinceYear: yearNow() };
    ledger.rightsChangedYear = yearNow();
    ledger.revision++;
    if (next === "commons") applyPoliticalEffects({ commons: 2, legitimacy: 1 });
    else if (next === "hunt") applyPoliticalEffects({ commons: 1, nobility: 1 });
    else if (next === "timber") applyPoliticalEffects({ nobility: 2, commons: -1 });
    else applyPoliticalEffects({ legitimacy: 1 });
    noteAction(ledger, "rights", forestCultureRightsLabel(next) + " forest right");
    recordLegacy("law", "Forest right: " + forestCultureRightsLabel(next), "The forester's court sets the wood-right for the year.", { importance: 2 });
    addLog("FOREST RIGHT — " + forestCultureRightsLabel(next) + " is now the law of the wood.", "#8fbf7f", "forest");
    return { ok: true, priority: next };
}

export function mediateForestConflict(conflictId = null) {
    const ledger = ensureForestCulture();
    const conflict = ledger.conflicts.find(entry => !entry.resolved && (!conflictId || entry.id === conflictId));
    if (!conflict) return { ok: false, reason: "No open wood-right conflict" };
    if (!canPay({ gold: 6 })) return { ok: false, reason: "Needs 6 gold for the mediation" };
    pay({ gold: 6 });
    conflict.resolved = true;
    conflict.resolvedYear = yearNow();
    ledger.favor = clamp(ledger.favor + 4);
    ledger.revision++;
    applyPoliticalEffects({ legitimacy: 1, commons: 1 });
    noteAction(ledger, "mediation", conflict.label);
    addLog("WOOD-RIGHT DISPUTE SETTLED — " + conflict.label + ".", "#8fbf7f", "forest");
    return { ok: true, conflict: { ...conflict } };
}

export function collectForestLore() {
    const ledger = ensureForestCulture();
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    if (!profile) return { ok: false, reason: "No living woodland found" };
    const existing = new Set(ledger.lore.map(entry => entry.kind + ":" + entry.regionId));
    const additions = [
        { kind: "tale", title: profile.tale.title, text: profile.tale.moral },
        { kind: "legend", title: profile.legend.title, text: profile.legend.text },
        { kind: "song", title: profile.song.title, text: profile.song.verse },
    ].filter(entry => !existing.has(entry.kind + ":" + profile.id));
    if (!additions.length) return { ok: false, reason: "The home region's lore is already in the archive" };
    for (const entry of additions) {
        ledger.lore.push({
            id: entry.kind + "-" + profile.id,
            kind: entry.kind,
            title: entry.title,
            regionId: profile.id,
            text: entry.text,
            year: yearNow(),
        });
        if (ledger.lore.length >= FOREST_CULTURE_LIMITS.lore) break;
    }
    ledger.favor = clamp(ledger.favor + 4);
    ledger.revision++;
    if (state.research && typeof state.research === "object") {
        state.research.reserve = clamp(number(state.research.reserve) + 3, 0, 240);
    }
    state.morale = clamp(number(state.morale, 50) + 1, 0, 100);
    noteAction(ledger, "lore", profile.tale.title);
    recordLegacy("lore", profile.tale.title, profile.legend.title + " · " + profile.region, { importance: 2 });
    addLog("WOODLORE COLLECTED — " + profile.tale.title + " enters the archive.", "#d6b56d", "forest");
    return { ok: true, added: additions.length, profile };
}

function addConflict(ledger, kind, label, detail) {
    if (ledger.conflicts.some(entry => !entry.resolved && entry.kind === kind)) return null;
    const conflict = {
        id: "conflict-" + ledger.nextConflictId++,
        kind, label, detail,
        sinceYear: yearNow(), severity: 3, resolved: false, resolvedYear: null,
    };
    ledger.conflicts.unshift(conflict);
    if (ledger.conflicts.length > FOREST_CULTURE_LIMITS.conflicts) ledger.conflicts.length = FOREST_CULTURE_LIMITS.conflicts;
    ledger.favor = clamp(ledger.favor - 3);
    addLog("WOOD-RIGHT CONFLICT — " + label + ": " + detail, "#b56b62", "forest");
    return conflict;
}

function annualCulture(ledger, profile, roles) {
    const priority = ledger.rights.priority;
    const groves = ledger.groves.length;
    const knowledge = forestCultureKnowledge();
    const target = 42 + groves * 2 + Object.values(knowledge).filter(Boolean).length * 2
        + (priority === "commons" ? 5 : 0) + roles.monasteries * 2 + (roles.herbWives > 0 ? 1 : 0);
    if (ledger.favor < target) ledger.favor = clamp(ledger.favor + 1);
    else if (ledger.favor > target) ledger.favor = clamp(ledger.favor - 1);
    for (const conflict of ledger.conflicts) {
        if (!conflict.resolved && conflict.sinceYear < yearNow()) {
            state.morale = clamp(number(state.morale, 50) - 0.5, 0, 100);
        }
    }
    if (groves > 0 && priority === "timber") {
        addConflict(ledger, "grove", "Axes at the grove boundary", "Timber priority presses against a protected grove; the woodcutters want the marked trees.");
    }
    if (priority === "hunt" && roles.herders > 0) {
        addConflict(ledger, "hunt", "Hunters and herds", "The hunting court and the transhumant herders disagree over the mast wood and the drove road.");
    }
    if (priority === "commons" && roles.charcoal > 0) {
        addConflict(ledger, "commons", "Commons against the kilns", "Village commons claim the coppice while the charcoal kilns claim the same stand.");
    }
    if (priority === "timber" && roles.forestFarmers > 0) {
        addConflict(ledger, "timber", "Fields under the saw", "The timber court is clearing shade the forest farmers need for their crops.");
    }
    if (ledger.conflicts.filter(entry => !entry.resolved).length === 0 && ledger.favor > 68) {
        state.morale = clamp(number(state.morale, 50) + 0.3, 0, 100);
    }
    ledger.history.unshift({
        year: yearNow(), favor: ledger.favor, groves,
        conflicts: ledger.conflicts.filter(entry => !entry.resolved).length,
        lore: ledger.lore.length, priority,
    });
    if (ledger.history.length > FOREST_CULTURE_LIMITS.history) ledger.history.length = FOREST_CULTURE_LIMITS.history;
    ledger.lastAnnualYear = yearNow();
    ledger.revision++;
}

export function updateForestCulture() {
    const ledger = ensureForestCulture();
    const year = yearNow();
    const season = seasonNow();
    if (ledger.lastUpdateYear === year && ledger.lastUpdateSeason === season && ledger.lastAnnualYear === year) return false;
    ledger.lastUpdateYear = year;
    ledger.lastUpdateSeason = season;
    const profile = homeProfile(ledger);
    if (ledger.lastAnnualYear !== year) annualCulture(ledger, profile, forestCultureRoles());
    ledger.revision++;
    return true;
}

export function forestCultureSummary() {
    const ledger = ensureForestCulture();
    const profile = forestCultureProfileFor(ledger.homeRegion) || homeProfile(ledger);
    const roles = forestCultureRoles();
    const knowledge = forestCultureKnowledge();
    const calendar = forestCultureCalendarFor(profile, seasonNow());
    const mods = forestCultureModifiers();
    const actions = forestCultureActionAvailability();
    const spec = FOREST_CULTURE_REQUIREMENTS;
    return Object.freeze({
        version: FOREST_CULTURE_VERSION,
        profile,
        homeRegion: profile?.id || null,
        spirit: profile?.spirit || "No woodland spirit yet",
        sacredTree: profile?.sacredTree || "No sacred tree yet",
        taboo: profile?.taboo || "No taboo recorded",
        tradition: profile?.tradition || "No woodland tradition",
        workTechnique: profile?.workTechnique || "",
        huntRule: profile?.huntRule || "",
        philosophy: profile?.philosophy || "",
        paths: profile?.paths || [],
        festival: profile?.festival || null,
        tale: profile?.tale || null,
        legend: profile?.legend || null,
        song: profile?.song || null,
        calendar,
        favor: ledger.favor,
        groves: ledger.groves.map(grove => ({ ...grove, protected: true, region: forestCultureProfileFor(grove.regionId)?.region || profile?.region || "wood" })),
        groveLimit: forestCultureGroveLimit(),
        lore: ledger.lore.map(entry => ({ ...entry })),
        conflicts: ledger.conflicts.map(entry => ({ ...entry })),
        rights: { ...ledger.rights, label: forestCultureRightsLabel(ledger.rights.priority) },
        roles,
        knowledge,
        knowledgeCount: Object.values(knowledge).filter(Boolean).length,
        modifiers: mods,
        actions,
        counts: {
            festivals: ledger.festivals, offerings: ledger.offerings, rites: ledger.rites,
            weddings: ledger.weddings, lore: ledger.lore.length,
            openConflicts: ledger.conflicts.filter(entry => !entry.resolved).length,
        },
        actionsLog: ledger.actions.slice(0, 6),
        requirements: spec,
        requirementCount: spec.length,
        regions: Object.keys(FOREST_CULTURE_BY_REGION).length,
        history: ledger.history.slice(0, 8),
    });
}

export function forestCultureSnapshot() {
    const ledger = ensureForestCulture();
    return JSON.parse(JSON.stringify(ledger));
}

export function forestCultureScore() {
    const summary = forestCultureSummary();
    return Math.round(summary.favor + summary.groves.length * 6 + summary.knowledgeCount * 4 + summary.counts.lore * 1.5 + summary.counts.festivals * 2);
}
