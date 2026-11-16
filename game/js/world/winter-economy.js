// Winter economy and ice-route systems (1.2.16.1–1.2.16.20).
//
// This layer sits on top of the completed 1.2.15 snow ecology. It is a bounded
// twenty-day ledger plus one annual hazard pass. Every effect changes an
// existing state: royal resources, the goods ledger, fields, market prices,
// morale, health, buildings, villagers, roads or diplomacy. No per-tile mutable
// simulation and no second frame loop are introduced.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "../systems/resources.js";
import { recordResourceMovement } from "../systems/goods-book.js";
import {
    consumeFromWarehouse, findLocalWarehouse, getWarehouseStock, getWarehouses,
} from "../systems/logistics.js";
import { snowProfileAt } from "./snow-ecology.js";

const system = (id, key, label, chain, group) => ({ id: "1.2.16." + id, key, label, chain, group });

export const WINTER_SYSTEMS = Object.freeze([
    system(1, "bearing", "Snow bearing capacity", "snow depth → load bearing → transport", "travel"),
    system(2, "transport", "Winter transport speed", "bearing → caravan speed → goods flow", "travel"),
    system(3, "heating", "Cold and heating demand", "cold → heating demand → fuel draw", "heating"),
    system(4, "shortfall", "Heating shortfall", "missing fuel → illness risk → mortality", "heating"),
    system(5, "fuelPrice", "Fuel price pressure", "fuel demand → market scarcity → price", "economy"),
    system(6, "iceRoads", "Ice roads", "frozen water → seasonal route → capacity", "ice"),
    system(7, "iceBreakup", "Ice-road breakup", "thaw → broken route → cargo loss", "ice"),
    system(8, "clearance", "Snow clearance", "snow → labour/material cost → works", "works"),
    system(9, "insulation", "Snow insulation", "snow cover → soil temperature → yield", "fields"),
    system(10, "frostDamage", "Frost and pest damage", "thin cover → frost → field fertility", "fields"),
    system(11, "meltwater", "Meltwater recharge", "thaw → meltwater → soil fertility", "fields"),
    system(12, "flood", "Snowmelt flood", "swollen rivers → flood damage → fertility", "hazard"),
    system(13, "wildlife", "Wildlife migration", "migration → hunt yield → food", "fauna"),
    system(14, "wolfPressure", "Wolf pressure", "wolves → herd loss → food stress", "fauna"),
    system(15, "foodStress", "Winter food stress", "low stores → morale and migration", "population"),
    system(16, "avalanche", "Avalanche and blizzard", "slope/storm → damage → pass closure", "hazard"),
    system(17, "caravan", "Caravan diplomacy", "closed route → late caravan → relation", "diplomacy"),
    system(18, "morale", "Winter morale and festival", "stores/festival → morale → migration", "population"),
    system(19, "hardiness", "Building winter hardiness", "insulation upgrade → lower fuel/damage", "buildings"),
    system(20, "unitKit", "Unit winter kit", "snowshoes/furs → exposure reduction", "units"),
]);

const SYSTEM_BY_KEY = Object.freeze(Object.fromEntries(WINTER_SYSTEMS.map(entry => [entry.key, entry])));
const SYSTEM_VALUE_KEYS = Object.freeze({
    bearing: "bearing", transport: "transportSpeed", heating: "heatingDemand",
    shortfall: "heatingShortfall", fuelPrice: "fuelPricePressure", iceRoads: "iceCapacity",
    iceBreakup: "iceCargoLost", clearance: "clearanceWork", insulation: "insulation",
    frostDamage: "frostDamage", meltwater: "meltwater", flood: "floodDamage",
    wildlife: "huntYield", wolfPressure: "wolfPressure", foodStress: "foodStress",
    avalanche: "avalancheRisk", caravan: "caravanDelay", morale: "moraleBonus",
    hardiness: "buildingHardiness", unitKit: "unitKit",
});
const POLICY_CLEARANCE = new Set(["balanced", "roads", "harvest", "works"]);
const POLICY_HEATING = new Set(["normal", "reserve"]);
const POLICY_ICE = new Set(["open", "closed"]);

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => Math.round(Number(value) * 10 ** digits) / 10 ** digits;
const hash32 = (seed, x, y, salt) => {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0)
        ^ Math.imul((Number(state.year) | 0) + 1, 0xc2b2ae35);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
};
const unit = (seed, x, y, salt) => hash32(seed, x, y, salt) / 0x100000000;

const DEFAULT_VALUES = Object.freeze({
    snowDepth: 0, snowDepthM: 0, bearing: 1, transportSpeed: 1,
    heatingDemand: 0, heatingStock: 0, heatingShortfall: 0, illnessRisk: 0,
    fuelPricePressure: 0, iceCapacity: 0, iceBreakRisk: 0, iceCargoLost: 0,
    clearanceWork: 0, clearancePenalty: 0, clearanceCostWood: 0, clearanceLabor: 0,
    insulation: 0, soilTemperature: 0, vegetationProtection: 0, frostDamage: 0,
    meltwater: 0, fertilityBonus: 0, floodDamage: 0, floodFertility: 0,
    migration: 0, huntYield: 0, wolfPressure: 0, foodStress: 0, foodStressLoss: 0,
    avalancheRisk: 0, blizzardRisk: 0, passClosed: 0,
    caravanDelay: 0, diplomacyMalus: 0,
    moraleBonus: 0, migrationPull: 0, buildingHardiness: 0.42, unitKit: 0,
    fuelBurned: 0, fuelShortfall: 0, iceRoutesOpen: 0, lastLedgerTick: 0,
});

export function createWinterState() {
    return {
        version: 1,
        policy: { clearance: "balanced", heating: "normal", iceRoads: "open", festival: false },
        values: { ...DEFAULT_VALUES },
        iceRoads: [],
        history: [],
        totals: {
            ledgers: 0, fuelBurned: 0, fuelShortfall: 0, cargoLost: 0,
            woodCleared: 0, floodDamage: 0, huntFood: 0, wolfLoss: 0, meltwaterBonus: 0, snowDamage: 0,
            iceRoutesOpened: 0, iceRoutesBroken: 0, upgrades: 0, unitUpgrades: 0,
        },
        lastLedgerTick: 0,
        lastAnnualYear: 0,
        lastMeltYear: 0,
        lastFloodYear: 0,
        lastFrostYear: 0,
        fuelStock: 0,
        debug: null,
    };
}

function normalizePolicy(raw = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
        clearance: POLICY_CLEARANCE.has(source.clearance) ? source.clearance : "balanced",
        heating: POLICY_HEATING.has(source.heating) ? source.heating : "normal",
        iceRoads: POLICY_ICE.has(source.iceRoads) ? source.iceRoads : "open",
        festival: source.festival === true,
    };
}

export function normalizeWinterState(raw = {}) {
    const base = createWinterState();
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const values = {};
    for (const key of Object.keys(DEFAULT_VALUES)) {
        values[key] = Number.isFinite(Number(source.values?.[key])) ? round(source.values[key], 4) : DEFAULT_VALUES[key];
    }
    const history = Array.isArray(source.history)
        ? source.history.slice(-12).map(entry => entry && typeof entry === "object" ? {
            year: Math.max(0, Math.floor(number(entry.year))),
            tick: Math.max(0, Math.floor(number(entry.tick))),
            depth: round(clamp(entry.depth)),
            heating: round(number(entry.heating)),
            transport: round(clamp(entry.transport)),
            morale: round(number(entry.morale)),
        } : null).filter(Boolean)
        : [];
    const iceRoads = (Array.isArray(source.iceRoads) ? source.iceRoads : []).slice(0, 8).map(route => ({
        id: String(route?.id || "").slice(0, 32),
        x: Math.max(0, Math.floor(number(route?.x))),
        y: Math.max(0, Math.floor(number(route?.y))),
        status: ["open", "closed", "broken"].includes(route?.status) ? route.status : "closed",
        capacity: Math.max(0, Math.min(24, Math.floor(number(route?.capacity)))),
        risk: round(clamp(route?.risk)),
    })).filter(route => route.id && Number.isFinite(route.x) && Number.isFinite(route.y));
    return {
        ...base,
        policy: normalizePolicy(source.policy),
        values,
        iceRoads,
        history,
        totals: {
            ...base.totals,
            ...Object.fromEntries(Object.keys(base.totals).map(key => [key, Math.max(0, number(source.totals?.[key]))])),
        },
        lastLedgerTick: Math.max(0, Math.floor(number(source.lastLedgerTick))),
        lastAnnualYear: Math.max(0, Math.floor(number(source.lastAnnualYear))),
        lastMeltYear: Math.max(0, Math.floor(number(source.lastMeltYear))),
        lastFloodYear: Math.max(0, Math.floor(number(source.lastFloodYear))),
        lastFrostYear: Math.max(0, Math.floor(number(source.lastFrostYear))),
        fuelStock: Math.max(0, number(source.fuelStock)),
    };
}

export function serializeWinterState() {
    const winter = ensureWinterState();
    return {
        version: winter.version,
        policy: { ...winter.policy },
        history: winter.history.map(entry => ({ ...entry })),
        totals: { ...winter.totals },
        lastAnnualYear: winter.lastAnnualYear,
        lastMeltYear: winter.lastMeltYear,
        lastFloodYear: winter.lastFloodYear,
        lastFrostYear: winter.lastFrostYear,
    };
}

export function restoreWinterState(snapshot) {
    state.winter = normalizeWinterState(snapshot);
    return state.winter;
}

export function ensureWinterState() {
    if (!state.winter || typeof state.winter !== "object" || Array.isArray(state.winter)) {
        state.winter = createWinterState();
    } else if (!state.winter.values || !state.winter.policy) {
        state.winter = normalizeWinterState(state.winter);
    }
    return state.winter;
}

function isBuilding(entity) {
    if (!entity || entity.dead) return false;
    try { return typeof entity.isBuilding === "function" && entity.isBuilding(); } catch { return false; }
}

function completedBuilding(entity) {
    return isBuilding(entity) && (!entity.construction || Number(entity.construction.stage) >= 3);
}

function terrainAt(x, y) {
    const width = Math.max(1, Number(state.terrainPixW) || 0);
    const height = Math.max(1, Number(state.terrainPixH) || 0);
    if (!state.heightMap || !width || !height) return { height: 0.58, moisture: 0.55, temperature: 0.12 };
    const res = Math.max(1, Number(state.terrainResolution) || 1);
    const px = Math.max(0, Math.min(width - 1, Math.floor((x + 0.5) * res)));
    const py = Math.max(0, Math.min(height - 1, Math.floor((y + 0.5) * res)));
    const index = py * width + px;
    return {
        height: number(state.heightMap[index], 0.58),
        moisture: number(state.moistureMap?.[index], 0.55),
        temperature: number(state.temperatureMap?.[index], 0.12),
    };
}

function settlementAnchor() {
    const keep = (state.entities || []).find(entity => !entity.dead && entity.type === TYPE.KEEP);
    if (keep) return { x: Number(keep.x) || 0, y: Number(keep.y) || 0 };
    const buildings = (state.entities || []).filter(completedBuilding);
    if (buildings.length) {
        return {
            x: buildings.reduce((sum, entity) => sum + Number(entity.x), 0) / buildings.length,
            y: buildings.reduce((sum, entity) => sum + Number(entity.y), 0) / buildings.length,
        };
    }
    return { x: (Number(state.worldW) || 176) / 2, y: (Number(state.worldH) || 176) / 2 };
}

function profileAt(x, y, extraUse = {}) {
    const terrain = terrainAt(x, y);
    return snowProfileAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        climate: "snow",
        height: terrain.height,
        moisture: terrain.moisture,
        temperature: terrain.temperature,
        seaLevel: Number(state.seaLevel) || 0.33,
        dayOfYear: Number(state.dayOfYear) || 0,
        year: Math.max(1, Number(state.year) || 1),
        hour: Number(state.timeOfDay) || 12,
        weather: state.weather || "clear",
        wind: String(state.weather || "").toLowerCase() === "storm" ? 2 : 1.15,
        use: { settlement: true, ...extraUse },
    });
}

function buildings() {
    return (state.entities || []).filter(entity => completedBuilding(entity));
}

function villagers() {
    return (state.entities || []).filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
}

function farms() {
    return (state.entities || []).filter(entity => !entity.dead && entity.type === TYPE.FARM && entity.field);
}

function roadCount() {
    return Object.keys(state.roads?.tiles || {}).length;
}

function roadSnowValue(profile) {
    return clamp(profile.surface.depth * 0.7 + profile.surface.drift * 0.3);
}

function ensureBuildingWinterStats(entity) {
    if (!entity || typeof entity !== "object") return;
    if (!Number.isFinite(Number(entity.winterHardiness))) {
        const base = entity.type === TYPE.KEEP ? 0.58 : entity.type === TYPE.HOUSE || entity.type === TYPE.STONE_HOUSE ? 0.46 : 0.38;
        entity.winterHardiness = clamp(base + (entity.insulated ? 0.14 : 0));
    }
    entity.winterHardiness = clamp(entity.winterHardiness);
    entity.winterUpgrade = Math.max(0, Math.min(0.3, number(entity.winterUpgrade)));
}

function ensureUnitWinterKit(entity) {
    if (!entity || typeof entity !== "object") return;
    entity.winterKit = clamp(number(entity.winterKit));
    entity.winterKitTier = Math.max(0, Math.min(3, Math.floor(number(entity.winterKitTier))));
}

function averageBuildingHardiness() {
    const list = buildings();
    if (!list.length) return 0.42;
    let total = 0;
    for (const entity of list) {
        ensureBuildingWinterStats(entity);
        total += entity.winterHardiness;
    }
    return total / list.length;
}

function averageUnitKit() {
    const list = villagers();
    if (!list.length) return 0;
    let total = 0;
    for (const entity of list) {
        ensureUnitWinterKit(entity);
        total += entity.winterKit;
    }
    return total / list.length;
}

function readFuelStock() {
    try {
        const stock = getWarehouseStock("firewood");
        if (stock > 0 || getWarehouses().length > 0) {
            ensureWinterState().fuelStock = stock;
            return stock;
        }
    } catch { /* headless fixtures may not initialise logistics */ }
    return Math.max(0, number(ensureWinterState().fuelStock));
}

function spendResource(key, amount) {
    const available = Math.max(0, number(state.resources?.[key]));
    const spent = Math.min(available, Math.max(0, number(amount)));
    if (spent > 0) addResource(key, -spent);
    return spent;
}

function addFood(amount, cause, key) {
    const quantity = Math.max(0, number(amount));
    if (quantity <= 0) return 0;
    addResource("food", quantity);
    try {
        recordResourceMovement("food", quantity, cause, {
            to: { kind: "realm", id: "royal-stores" },
            key: key || "winter-food:" + state.year + ":" + state.tick,
        });
    } catch { /* the resource change is authoritative */ }
    return quantity;
}

function removeFood(amount, cause, key) {
    const quantity = Math.min(Math.max(0, number(state.resources?.food)), Math.max(0, number(amount)));
    if (quantity <= 0) return 0;
    addResource("food", -quantity);
    try {
        recordResourceMovement("food", -quantity, cause, {
            from: { kind: "realm", id: "royal-stores" },
            key: key || "winter-food-loss:" + state.year + ":" + state.tick,
        });
    } catch { /* the resource change is authoritative */ }
    return quantity;
}

function logWinter(text, color = "#b6d7e4", key = "winter") {
    addLog(text, color, key);
}

function clampMorale(delta) {
    state.morale = Math.max(0, Math.min(100, number(state.morale, 72) + delta));
}

function fuelNeeded() {
    const winter = ensureWinterState();
    const profile = winter._profile;
    if (!profile) return 0;
    const cold = clamp(1 - number(profile.temperature, 0.12) * 1.6);
    const wind = clamp(number(profile.weather.wind, 1) / 2.6);
    const hardiness = averageBuildingHardiness();
    const reserve = winter.policy.heating === "reserve" ? 0.78 : 1;
    return round(clamp(0.35 + cold * 1.55 + wind * 0.32 - hardiness * 0.6, 0.2, 3.2) * reserve, 2);
}

function iceCandidateTiles(anchor) {
    const baseX = Math.floor(anchor.x), baseY = Math.floor(anchor.y);
    const offsets = [
        [5, 0], [-5, 0], [0, 5], [0, -5], [8, 3], [-8, -3], [3, 8], [-3, -8],
    ];
    const candidates = [];
    const seen = new Set();
    for (const route of ensureWinterState().iceRoads || []) {
        const x = Math.floor(number(route.x)), y = Math.floor(number(route.y));
        if (x < 0 || y < 0 || x >= (Number(state.worldW) || 176) || y >= (Number(state.worldH) || 176)) continue;
        const profile = profileAt(x, y);
        const key = x + ":" + y;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ x, y, profile });
    }
    for (const [ox, oy] of offsets) {
        const x = baseX + ox, y = baseY + oy;
        if (x < 0 || y < 0 || x >= (Number(state.worldW) || 176) || y >= (Number(state.worldH) || 176)) continue;
        const profile = profileAt(x, y);
        if (!profile.water.frozen && profile.water.iceCover < 0.34) continue;
        const key = x + ":" + y;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ x, y, profile });
    }
    return candidates;
}

function refreshIceRoads(anchor, { handleBreakup = false, updateStatus = true } = {}) {
    const winter = ensureWinterState();
    const candidates = iceCandidateTiles(anchor);
    const previous = new Map((winter.iceRoads || []).map(route => [route.id, route]));
    const next = [];
    for (const candidate of candidates.slice(0, 4)) {
        const id = "ice-" + candidate.x + "-" + candidate.y;
        const p = candidate.profile;
        const breakup = p.water.breakup;
        const blocked = winter.policy.iceRoads === "closed";
        const broken = breakup > 0.42 || p.thaw.springMelt > 0.52;
        const old = previous.get(id);
        const risk = clamp(breakup * 0.8 + p.thaw.springMelt * 0.35 + (p.water.iceCover < 0.5 ? 0.12 : 0));
        const nextStatus = broken ? "broken" : blocked ? "closed" : p.water.iceCover >= 0.42 ? "open" : "closed";
        const status = updateStatus ? nextStatus : (old?.status || "closed");
        next.push({
            id, x: candidate.x, y: candidate.y, status,
            capacity: updateStatus ? (status === "open" ? Math.max(1, Math.round(p.water.iceCover * 18)) : 0) : (old?.capacity || 0),
            risk: round(risk),
        });
        if (handleBreakup && old && old.status !== "broken" && status === "broken") {
            const loss = 1 + Math.round(clamp(risk));
            const foodLoss = removeFood(loss, "winter-ice-breakup");
            let fuelLoss = 0;
            try {
                const warehouse = findLocalWarehouse("firewood", candidate.x, candidate.y, 20);
                if (warehouse) fuelLoss = consumeFromWarehouse(warehouse, "firewood", Math.min(2, loss), {
                    cause: "winter-ice-breakup", key: "winter-ice-breakup:" + state.year + ":" + candidate.x + ":" + candidate.y,
                });
            } catch { /* no local store */ }
            winter.values.iceCargoLost = round(number(winter.values.iceCargoLost) + foodLoss + fuelLoss, 2);
            winter.totals.cargoLost = round(number(winter.totals.cargoLost) + foodLoss + fuelLoss, 2);
            winter.totals.iceRoutesBroken += 1;
            logWinter("ICE ROAD BREAKS · " + candidate.x + "," + candidate.y + " · " + (foodLoss + fuelLoss) + " GOODS LOST", "#e9857b", "winter-disaster");
        }
    }
    winter.iceRoads = next;
    winter.values.iceBreakRisk = next.length ? next.reduce((max, route) => Math.max(max, route.risk), 0) : 0;
    winter.values.iceCapacity = next.filter(route => route.status === "open").reduce((sum, route) => sum + route.capacity, 0);
    winter.values.iceRoutesOpen = next.filter(route => route.status === "open").length;
    if (next.some(route => route.status === "open")) winter.totals.iceRoutesOpened += next.filter(route => route.status === "open").length;
    return next;
}

function computeValues(profile, anchor) {
    const winter = ensureWinterState();
    const prior = winter.values || {};
    winter._profile = profile;
    const depth = profile.surface.depth;
    const hardiness = averageBuildingHardiness();
    const kit = averageUnitKit();
    const bearing = clamp(0.28 + (1 - depth) * 0.66 - profile.surface.drift * 0.1 - profile.landform.slope * 0.1 + (profile.use.road ? 0.14 : 0) + (profile.use.cleared ? 0.1 : 0) - profile.weather.blizzard * 0.06, 0.12, 1);
    const iceCapacity = winter.policy.iceRoads === "open"
        ? (winter.iceRoads || []).filter(route => route.status === "open").reduce((sum, route) => sum + route.capacity, 0)
        : 0;
    const transport = clamp(bearing * 0.82 + iceCapacity / 40 * 0.16 + (profile.use.road ? 0.1 : 0) - profile.hazards.passClosed * 0.24 - profile.hazards.icyRoads * 0.08, 0.2, 1);
    const cold = clamp(1 - number(profile.temperature, 0.12) * 1.7);
    const heatingDemand = round(clamp(0.35 + cold * 1.55 + profile.weather.wind / 2.6 * 0.32 - hardiness * 0.6, 0.2, 3.2), 2);
    const soilTemperature = clamp(0.16 + depth * 0.68 + (1 - cold) * 0.14 - profile.surface.exposed * 0.16);
    const frostDamage = clamp((1 - depth) * cold * 0.75 + (profile.surface.exposed > 0.45 ? 0.12 : 0) - soilTemperature * 0.28);
    const insulation = clamp(depth * 0.62 + profile.vegetation.snowLoad * 0.28 + (1 - profile.surface.exposed) * 0.1);
    const migration = profile.fauna.some(entry => entry.migratory) || profile.season === "autumn" || profile.season === "spring";
    const wolves = profile.fauna.some(entry => entry.id === "wolf");
    const huntYield = clamp(profile.economy.game * 0.62 + profile.economy.fish * 0.22 + (migration ? 0.2 : 0) - (wolves ? 0.08 : 0));
    const wolfPressure = clamp((wolves ? 0.48 : 0.06) + profile.landform.forest * 0.18 + profile.economy.game * 0.18 - kit * 0.1);
    const clearanceWork = clamp(depth * 1.15 + Math.min(1, roadCount() / 60) * 0.7 + profile.surface.drift * 0.35);
    const clearancePolicy = winter.policy.clearance;
    const clearancePenalty = clamp(clearanceWork * (clearancePolicy === "roads" ? 0.11 : clearancePolicy === "harvest" ? 0.055 : 0.085), 0, 0.24);
    const meltwater = clamp(profile.thaw.meltwaterLakes * 0.55 + profile.thaw.swollenRivers * 0.3 + profile.thaw.snowRetreat * 0.2);
    const flood = clamp(profile.thaw.swollenRivers * 0.5 + profile.thaw.meltwaterLakes * 0.35 + profile.thaw.muddyRoads * 0.15);
    const values = {
        snowDepth: round(depth, 4), snowDepthM: round(profile.surface.depthM, 2), bearing: round(bearing, 3),
        transportSpeed: round(transport, 3), heatingDemand, heatingStock: number(prior.heatingStock), heatingShortfall: number(prior.heatingShortfall),
        illnessRisk: number(prior.illnessRisk), fuelPricePressure: number(prior.fuelPricePressure), iceCapacity,
        iceBreakRisk: winter.iceRoads.length ? round(winter.iceRoads.reduce((max, route) => Math.max(max, route.risk), 0), 3) : 0,
        iceCargoLost: number(prior.iceCargoLost),
        clearanceWork: round(clearanceWork, 3), clearancePenalty: round(clearancePenalty, 3),
        clearanceCostWood: Math.max(1, Math.round(clearanceWork * 2)), clearanceLabor: Math.max(0, Math.round(villagers().length * clearanceWork * 0.12)),
        insulation: round(insulation, 3), soilTemperature: round(soilTemperature, 3),
        vegetationProtection: round(clamp(insulation * 0.7 + (1 - profile.surface.exposed) * 0.2), 3),
        frostDamage: round(frostDamage, 3), meltwater: round(meltwater, 3),
        fertilityBonus: round(meltwater * 3.2, 2), floodDamage: round(flood, 3), floodFertility: round(flood * 1.8, 2),
        migration: round(migration ? 1 : 0, 0), huntYield: round(huntYield, 3), wolfPressure: round(wolfPressure, 3),
        foodStress: number(prior.foodStress), foodStressLoss: number(prior.foodStressLoss),
        avalancheRisk: round(profile.hazards.avalanche, 3), blizzardRisk: round(profile.weather.blizzard, 3),
        passClosed: round(profile.hazards.passClosed, 3), caravanDelay: number(prior.caravanDelay), diplomacyMalus: number(prior.diplomacyMalus),
        moraleBonus: number(prior.moraleBonus), migrationPull: number(prior.migrationPull), buildingHardiness: round(hardiness, 3), unitKit: round(kit, 3),
        fuelBurned: number(prior.fuelBurned), fuelShortfall: number(prior.fuelShortfall),
        iceRoutesOpen: winter.iceRoads.filter(route => route.status === "open").length,
        lastLedgerTick: number(winter.values.lastLedgerTick),
    };
    winter.values = values;
    winter._anchor = anchor;
    return values;
}

function getEnabled(systems) {
    if (!systems || !Array.isArray(systems) || systems.length === 0) return () => true;
    const enabled = new Set(systems);
    return key => enabled.has(key);
}

function applyBearing(winter) {
    winter.values.bearing = round(clamp(winter.values.bearing), 3);
}

function applyTransport(winter) {
    const transport = clamp(winter.values.transportSpeed, 0.12, 1);
    winter.values.transportSpeed = round(transport, 3);
    if (transport < 0.55) {
        const lost = removeFood(1, "winter-supply-loss");
        winter.values.supplyLoss = (number(winter.values.supplyLoss) || 0) + lost;
        if (lost > 0) logWinter("WINTER ROADS SLOW THE CARAVANS · FOOD -" + lost, "#d6b47e", "winter-supply");
    }
}

function applyHeating(winter) {
    const needed = Math.max(1, Math.round(fuelNeeded()));
    const stock = readFuelStock();
    let consumed = 0;
    const warehouses = (() => { try { return getWarehouses(); } catch { return []; } })();
    let remaining = needed;
    for (const warehouse of warehouses) {
        if (remaining <= 0) break;
        try {
            const got = consumeFromWarehouse(warehouse, "firewood", remaining, {
                cause: "winter-heating",
                key: "winter-heat:" + state.year + ":" + Math.floor(state.tick / 20),
            });
            consumed += got; remaining -= got;
        } catch { /* a malformed fixture must not stop the ledger */ }
    }
    if (consumed === 0 && warehouses.length === 0) {
        const fallback = Math.min(remaining, Math.max(0, number(winter.fuelStock)));
        winter.fuelStock = Math.max(0, number(winter.fuelStock) - fallback);
        consumed += fallback; remaining -= fallback;
    }
    winter.values.heatingStock = round(readFuelStock(), 2);
    winter.values.heatingDemand = needed;
    winter.values.heatingShortfall = round(clamp(remaining / needed), 3);
    winter.values.fuelBurned = round(number(winter.values.fuelBurned) + consumed, 2);
    winter.totals.fuelBurned = round(number(winter.totals.fuelBurned) + consumed, 2);
    winter.totals.fuelShortfall = round(number(winter.totals.fuelShortfall) + remaining, 2);
}

function applyShortfall(winter) {
    const shortfall = clamp(winter.values.heatingShortfall);
    winter.values.illnessRisk = round(clamp(shortfall * 0.8 + (1 - winter.values.buildingHardiness) * 0.16), 3);
    if (shortfall <= 0) return;
    clampMorale(-(0.45 + shortfall * 2.1));
    const candidates = villagers().filter(entity => !entity.isKing);
    for (let index = 0; index < Math.min(2, candidates.length); index++) {
        const person = candidates[index];
        const risk = clamp(winter.values.illnessRisk * (1 - number(person.winterKit) * 0.25));
        if (unit(state.worldSeed, person.x, person.y, 0x57494c44) > risk) continue;
        person.illnessStartedTick = state.tick;
        person.illnessUntilTick = Math.max(number(person.illnessUntilTick), state.tick + 50 + Math.round(shortfall * 60));
        person.illnessSeverity = Math.max(1, Number(person.illnessSeverity) || 0, shortfall > 0.65 ? 2 : 1);
        person.infectionSource = "winter-cold";
    }
    logWinter("HEARTHS RUN COLD · " + Math.round(shortfall * 100) + "% OF WINTER FUEL MISSING", "#e9857b", "winter-health");
}

function applyFuelPrice(winter) {
    const pressure = clamp((winter.values.heatingShortfall * 0.7 + (winter.values.heatingDemand / 3.2) * 0.3));
    winter.values.fuelPricePressure = round(pressure, 3);
    if (state.market?.prices && Number.isFinite(Number(state.market.prices.wood))) {
        const before = Number(state.market.prices.wood);
        state.market.prices.wood = Math.max(1, round(before * (1 + pressure * 0.08), 2));
        state.market.priceTrend = state.market.priceTrend || {};
        state.market.priceTrend.wood = clamp(number(state.market.priceTrend.wood) + pressure * 0.035, -0.45, 0.55);
    }
}

function applyIceRoads(winter, anchor) {
    refreshIceRoads(anchor);
    winter.values.iceCapacity = winter.iceRoads.filter(route => route.status === "open").reduce((sum, route) => sum + route.capacity, 0);
    winter.values.iceRoutesOpen = winter.iceRoads.filter(route => route.status === "open").length;
    if (winter.iceRoads.length) {
        winter.values.transportSpeed = round(clamp(winter.values.transportSpeed + winter.values.iceCapacity / 40 * 0.12), 3);
    }
}

function applyIceBreakup(winter) {
    if (winter.values.iceBreakRisk < 0.35) return;
    const broken = winter.iceRoads.filter(route => route.status === "broken").length;
    if (broken > 0) winter.values.iceCargoLost = number(winter.values.iceCargoLost);
}

function applyClearance(winter) {
    const work = clamp(winter.values.clearanceWork);
    const cost = Math.max(1, Math.round(work * 2));
    const spent = spendResource("wood", cost);
    winter.values.clearanceCostWood = spent;
    winter.values.clearanceLabor = Math.max(0, Math.round(villagers().length * work * 0.12));
    winter.values.clearancePenalty = round(clamp(work * (winter.policy.clearance === "roads" ? 0.11 : winter.policy.clearance === "harvest" ? 0.055 : 0.085), 0, 0.24), 3);
    winter.totals.woodCleared = round(number(winter.totals.woodCleared) + spent, 2);
    for (const farm of farms()) {
        farm.field.growth = Math.max(0, number(farm.field.growth) - winter.values.clearancePenalty * 2.4);
        farm.field.winterClearance = winter.values.clearancePenalty;
    }
    if (spent > 0) logWinter("SNOW CLEARANCE · " + spent + " WOOD SPENT · LABOUR -" + winter.values.clearanceLabor, "#d6b47e", "winter-works");
}

function applyInsulation(winter) {
    winter.values.insulation = round(clamp(winter.values.insulation), 3);
    for (const farm of farms()) {
        farm.field.winterInsulation = winter.values.insulation;
        farm.field.winterSoilTemperature = winter.values.soilTemperature;
    }
}

function applyFrost(winter) {
    if (Number(state.seasonIndex) !== 0) return;
    if (winter.lastFrostYear === state.year) return;
    winter.lastFrostYear = state.year;
    const damage = clamp(winter.values.frostDamage);
    if (damage <= 0.05) return;
    for (const farm of farms()) {
        farm.field.fertility = Math.max(0, number(farm.field.fertility) - damage * 1.8);
        farm.field.frostDamage = round(damage, 3);
    }
}

function applyMeltwater(winter) {
    if (Number(state.seasonIndex) !== 0) return;
    if (winter.lastMeltYear === state.year) return;
    winter.lastMeltYear = state.year;
    const bonus = Math.max(0, number(winter.values.fertilityBonus));
    if (bonus <= 0) return;
    for (const farm of farms()) {
        farm.field.fertility = Math.min(number(farm.field.maxFertility, 50), number(farm.field.fertility) + bonus);
        farm.field.meltwaterBonus = round(bonus, 2);
    }
    winter.totals.meltwaterBonus = round(number(winter.totals.meltwaterBonus) + bonus, 2);
    logWinter("MELTWATER SOAKS THE FIELDS · +" + round(bonus, 1) + " FERTILITY", "#a3d6a7", "winter-thaw");
}

function applyFlood(winter) {
    if (Number(state.seasonIndex) !== 0 || winter.values.floodDamage < 0.3) return;
    if (winter.lastFloodYear === state.year) return;
    winter.lastFloodYear = state.year;
    const target = buildings().find(entity => entity.type !== TYPE.KEEP && entity.type !== TYPE.WONDER);
    if (!target) return;
    const damage = Math.max(1, Math.round(winter.values.floodDamage * 18));
    target.hp = Math.max(1, number(target.hp, 1) - damage);
    target.floodedYear = state.year;
    winter.values.floodDamage = round(damage, 2);
    winter.totals.floodDamage = round(number(winter.totals.floodDamage) + damage, 2);
    for (const farm of farms()) {
        farm.field.fertility = Math.min(number(farm.field.maxFertility, 50), number(farm.field.fertility) + number(winter.values.floodFertility));
    }
    logWinter("MELTWATER FLOODS A BUILDING · " + damage + " DAMAGE", "#e9857b", "winter-disaster");
}

function applyWildlife(winter) {
    const yieldFood = Math.max(0, Math.round(winter.values.huntYield * (Number(state.seasonIndex) === 2 || Number(state.seasonIndex) === 3 ? 2 : 1)));
    if (yieldFood > 0) {
        addFood(yieldFood, "winter-hunt", "winter-hunt:" + state.year + ":" + state.tick);
        winter.totals.huntFood = round(number(winter.totals.huntFood) + yieldFood, 2);
        logWinter("WINTER HERDS MOVE THROUGH THE REALM · HUNT +" + yieldFood, "#a3d6a7", "winter-fauna");
    }
    winter.values.huntYield = yieldFood;
}

function applyWolfPressure(winter) {
    const pressure = clamp(winter.values.wolfPressure);
    if (pressure < 0.45) return;
    const loss = Math.min(2, 1 + Math.round(pressure));
    const lost = removeFood(loss, "winter-wolf-loss", "winter-wolves:" + state.year + ":" + state.tick);
    winter.totals.wolfLoss = round(number(winter.totals.wolfLoss) + lost, 2);
    winter.values.wolfLoss = lost;
    clampMorale(-pressure * 0.35);
    logWinter("WOLVES PRESS THE HERDS · FOOD -" + lost, "#e6a15a", "winter-fauna");
}

function applyFoodStress(winter) {
    const population = Math.max(1, villagers().length);
    const demand = population * 0.3;
    const food = Math.max(0, number(state.resources?.food));
    const stress = clamp((demand - food) / Math.max(1, demand));
    winter.values.foodStress = round(stress, 3);
    if (stress <= 0.55) return;
    winter.values.foodStressLoss = 1;
    clampMorale(-(0.4 + stress * 1.5));
    winter.values.migrationPull = round(clamp(stress * 0.6), 3);
    logWinter("WINTER STORES RUN LOW · MORALE AND MIGRATION STRAIN", "#e6a15a", "winter-population");
}

function applyAvalanche(winter, profile) {
    winter.values.avalancheRisk = round(profile.hazards.avalanche, 3);
    winter.values.blizzardRisk = round(profile.weather.blizzard, 3);
    winter.values.passClosed = round(profile.hazards.passClosed, 3);
    const risk = Math.max(winter.values.avalancheRisk, winter.values.blizzardRisk * 0.8);
    winter.values.caravanDelay = round(clamp(risk * 0.8 + winter.values.passClosed * 0.2), 3);
    if (risk < 0.45) return;
    const target = buildings().find(entity => entity.type !== TYPE.KEEP && entity.type !== TYPE.WONDER);
    if (!target) return;
    const damage = Math.max(1, Math.round((risk - 0.4) * 20 * (1 - number(target.winterHardiness) * 0.35)));
    target.hp = Math.max(1, number(target.hp, 1) - damage);
    target.snowDamagedYear = state.year;
    winter.totals.snowDamage = round(number(winter.totals.snowDamage) + damage, 2);
    logWinter("AVALANCHE STRIKES THE SETTLEMENT · " + damage + " DAMAGE", "#e9857b", "winter-disaster");
}

function applyCaravan(winter) {
    const relationLoss = clamp(winter.values.caravanDelay * 2.4 + winter.values.passClosed * 1.2);
    const realms = state.diplomacy?.realms;
    if (Array.isArray(realms) && realms.length) {
        const realm = realms[0];
        const before = number(realm.relation, 50);
        realm.relation = Math.max(0, Math.min(100, before - relationLoss + (relationLoss <= 0.1 ? 0.15 : 0)));
        winter.values.diplomacyMalus = round(Math.max(0, before - realm.relation), 3);
        if (relationLoss > 0.4) logWinter("LATE CARAVANS STRAIN A NEIGHBOUR · RELATION -" + round(relationLoss, 1), "#e6a15a", "winter-diplomacy");
    }
}

function applyMorale(winter) {
    let delta = 0;
    if (winter.policy.festival) {
        const canFeast = number(state.resources?.food) >= 20 && number(winter.values.heatingStock) >= 4;
        delta = canFeast ? 1.15 : -0.65;
        winter.values.moraleBonus = round(delta, 2);
    } else {
        delta = winter.values.heatingShortfall > 0.2 ? -0.5 : 0.2;
        winter.values.moraleBonus = round(delta, 2);
    }
    if (winter.values.foodStress > 0.55) delta -= 0.4;
    winter.values.migrationPull = round(clamp(winter.values.foodStress * 0.6 + (delta < 0 ? 0.1 : 0)), 3);
    clampMorale(delta);
}

function applyHardiness(winter) {
    for (const entity of buildings()) ensureBuildingWinterStats(entity);
    winter.values.buildingHardiness = round(averageBuildingHardiness(), 3);
}

function applyUnitKit(winter) {
    for (const entity of villagers()) ensureUnitWinterKit(entity);
    winter.values.unitKit = round(averageUnitKit(), 3);
}

function recordHistory(winter) {
    winter.history.push({
        year: Math.max(0, Math.floor(number(state.year))),
        tick: Math.max(0, Math.floor(number(state.tick))),
        depth: round(winter.values.snowDepth, 3),
        heating: round(winter.values.heatingDemand, 2),
        transport: round(winter.values.transportSpeed, 3),
        morale: round(number(state.morale), 1),
    });
    winter.history = winter.history.slice(-12);
    winter.totals.ledgers += 1;
}

export function getWinterSnapshot() {
    const winter = ensureWinterState();
    const active = (state.worldOptions?.climate || "temperate") === "snow";
    return {
        active,
        systemCount: WINTER_SYSTEMS.length,
        policy: { ...winter.policy },
        values: { ...winter.values },
        iceRoads: winter.iceRoads.map(route => ({ ...route })),
        history: winter.history.map(entry => ({ ...entry })),
        totals: { ...winter.totals },
        systems: WINTER_SYSTEMS.map(entry => ({
            ...entry,
            value: round(number(winter.values[SYSTEM_VALUE_KEYS[entry.key]]), 3),
        })),
        eventLog: (state.eventLog || []).filter(entry => String(entry.kind || "").startsWith("winter")).slice(0, 6),
    };
}

/** Cheap HUD refresh: derived values only, no resource mutation. */
export function refreshWinterSnapshot() {
    const winter = ensureWinterState();
    if ((state.worldOptions?.climate || "temperate") !== "snow") {
        winter.values = { ...DEFAULT_VALUES };
        winter._profile = null;
        return getWinterSnapshot();
    }
    const anchor = settlementAnchor();
    const profile = profileAt(anchor.x, anchor.y, { road: roadCount() > 0 });
    winter._profile = profile;
    refreshIceRoads(anchor, { updateStatus: winter.iceRoads.length === 0 });
    computeValues(profile, anchor);
    const fuel = round(readFuelStock(), 2);
    if (fuel > 0 || winter.values.heatingStock === 0) winter.values.heatingStock = fuel;
    winter.values.lastLedgerTick = winter.lastLedgerTick;
    return getWinterSnapshot();
}

/** One bounded twenty-day winter ledger. */
export function updateWinterEconomy({ force = false, systems = null, focus = null } = {}) {
    const winter = ensureWinterState();
    if ((state.worldOptions?.climate || "temperate") !== "snow") {
        // Other climates must pay nothing on the hot path. Only reset once if a
        // loaded realm switched climate; the HUD is hidden there anyway.
        if (winter.values.snowDepth !== 0 || winter._profile) {
            winter.values = { ...DEFAULT_VALUES };
            winter._profile = null;
        }
        return null;
    }
    if (!force && state.tick % 20 !== 0) return null;
    const anchor = focus && Number.isFinite(Number(focus.x)) && Number.isFinite(Number(focus.y))
        ? { x: Number(focus.x), y: Number(focus.y) } : settlementAnchor();
    const profile = profileAt(anchor.x, anchor.y, { road: roadCount() > 0 });
    winter._profile = profile;
    if (getEnabled(systems)("iceRoads") || getEnabled(systems)("iceBreakup") || !systems) refreshIceRoads(anchor, { handleBreakup: getEnabled(systems)("iceBreakup") || !systems });
    computeValues(profile, anchor);
    const enabled = getEnabled(systems);
    if (enabled("bearing")) applyBearing(winter);
    if (enabled("iceRoads")) applyIceRoads(winter, anchor);
    if (enabled("iceBreakup")) applyIceBreakup(winter);
    if (enabled("heating")) applyHeating(winter);
    if (enabled("shortfall")) applyShortfall(winter);
    if (enabled("fuelPrice")) applyFuelPrice(winter);
    if (enabled("transport")) applyTransport(winter);
    if (enabled("clearance")) applyClearance(winter);
    if (enabled("insulation")) applyInsulation(winter);
    if (enabled("frostDamage")) applyFrost(winter);
    if (enabled("meltwater")) applyMeltwater(winter);
    if (enabled("flood")) applyFlood(winter);
    if (enabled("wildlife")) applyWildlife(winter);
    if (enabled("wolfPressure")) applyWolfPressure(winter);
    if (enabled("foodStress")) applyFoodStress(winter);
    if (enabled("morale")) applyMorale(winter);
    if (enabled("hardiness")) applyHardiness(winter);
    if (enabled("unitKit")) applyUnitKit(winter);
    winter.lastLedgerTick = state.tick;
    winter.values.lastLedgerTick = state.tick;
    recordHistory(winter);
    return getWinterSnapshot();
}

/** One annual pass for avalanches, blizzards, ice breakup and diplomacy. */
export function updateWinterAnnual({ force = false } = {}) {
    const winter = ensureWinterState();
    if ((state.worldOptions?.climate || "temperate") !== "snow") {
        return { applied: false, events: [], reason: "not-snow-climate" };
    }
    if (!force && winter.lastAnnualYear === state.year) return { applied: false, events: [], reason: "already-applied" };
    winter.lastAnnualYear = state.year;
    const anchor = settlementAnchor();
    const profile = profileAt(anchor.x, anchor.y, { road: roadCount() > 0 });
    const before = { ...winter.values };
    applyAvalanche(winter, profile);
    refreshIceRoads(anchor, { handleBreakup: true });
    applyIceBreakup(winter);
    applyCaravan(winter);
    winter.values.lastAnnualYear = state.year;
    const events = (state.eventLog || []).filter(entry => String(entry.kind || "").startsWith("winter") && entry.tick === state.tick).map(entry => entry.text);
    return { applied: true, events, before, after: { ...winter.values } };
}

export function initializeWinterForRealm() {
    const winter = ensureWinterState();
    winter.lastAnnualYear = Math.max(0, Number(state.year) - 1);
    if ((state.worldOptions?.climate || "temperate") === "snow") refreshWinterSnapshot();
    return getWinterSnapshot();
}

export function setWinterPolicy(key, value) {
    const winter = ensureWinterState();
    if (key === "clearance" && POLICY_CLEARANCE.has(value)) winter.policy.clearance = value;
    else if (key === "heating" && POLICY_HEATING.has(value)) winter.policy.heating = value;
    else if (key === "iceRoads" && POLICY_ICE.has(value)) winter.policy.iceRoads = value;
    else if (key === "festival") winter.policy.festival = value === true;
    else return { ok: false, reason: "unknown-winter-policy" };
    refreshWinterSnapshot();
    return { ok: true, policy: { ...winter.policy } };
}

export function cycleWinterPolicy(key) {
    const winter = ensureWinterState();
    if (key === "clearance") {
        const order = ["balanced", "roads", "harvest", "works"];
        return setWinterPolicy(key, order[(order.indexOf(winter.policy.clearance) + 1) % order.length]);
    }
    if (key === "heating") return setWinterPolicy(key, winter.policy.heating === "reserve" ? "normal" : "reserve");
    if (key === "iceRoads") return setWinterPolicy(key, winter.policy.iceRoads === "open" ? "closed" : "open");
    if (key === "festival") return setWinterPolicy(key, !winter.policy.festival);
    return { ok: false, reason: "unknown-winter-policy" };
}

export function upgradeWinterBuildings(limit = 1) {
    const winter = ensureWinterState();
    const list = buildings().filter(entity => number(entity.winterUpgrade) < 0.3).slice(0, Math.max(1, Math.min(3, Math.floor(number(limit, 1)))));
    if (!list.length) return { ok: false, reason: "all-buildings-winterised" };
    if (number(state.resources?.wood) < 10 || number(state.resources?.gold) < 5) return { ok: false, reason: "not-enough-materials" };
    spendResource("wood", 10);
    spendResource("gold", 5);
    for (const entity of list) {
        entity.winterUpgrade = clamp(number(entity.winterUpgrade) + 0.12);
        entity.winterHardiness = clamp(number(entity.winterHardiness, 0.4) + 0.12);
    }
    winter.totals.upgrades += list.length;
    winter.totals.woodCleared = round(number(winter.totals.woodCleared) + 10, 2);
    logWinter("WINTERISED " + list.length + " BUILDING" + (list.length === 1 ? "" : "S"), "#a3d6a7", "winter-works");
    refreshWinterSnapshot();
    return { ok: true, upgraded: list.length, hardiness: averageBuildingHardiness() };
}

export function upgradeWinterUnits(limit = 1) {
    const winter = ensureWinterState();
    const list = villagers().filter(entity => number(entity.winterKitTier) < 3).slice(0, Math.max(1, Math.min(3, Math.floor(number(limit, 1)))));
    if (!list.length) return { ok: false, reason: "all-units-equipped" };
    if (number(state.resources?.wood) < 6 || number(state.resources?.gold) < 3) return { ok: false, reason: "not-enough-materials" };
    spendResource("wood", 6);
    spendResource("gold", 3);
    for (const entity of list) {
        entity.winterKitTier = Math.max(1, Math.floor(number(entity.winterKitTier)) + 1);
        entity.winterKit = clamp(number(entity.winterKit) + 0.18);
    }
    winter.totals.unitUpgrades += list.length;
    logWinter("WINTER KITS ISSUED · " + list.length + " RESIDENT" + (list.length === 1 ? "" : "S"), "#a3d6a7", "winter-units");
    refreshWinterSnapshot();
    return { ok: true, equipped: list.length, kit: averageUnitKit() };
}

export function winterSystem(key) {
    return SYSTEM_BY_KEY[key] || null;
}

export const WINTER_LIMITS = Object.freeze({
    systems: WINTER_SYSTEMS.length,
    ledgerDays: 20,
    iceRoutes: 4,
    history: 12,
});
