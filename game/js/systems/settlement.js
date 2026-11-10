// Household services, needs and the immigration gate. Coverage is measured
// from operational, staffed service buildings; a service is never a realm-wide
// boolean. Shortages degrade satisfaction and productivity gradually.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "./resources.js";
import { getBuildingEfficiency } from "./economy.js";
import { isOperational } from "./construction.js";
import { getLocalWarehouseStock, findLocalWarehouse, consumeFromWarehouse, getWarehouseStock, HOUSEHOLD_SUPPLY_RADIUS } from "./logistics.js";
import { HOUSING_TIERS, SERVICE_DEFINITIONS, isHousingType } from "./city-config.js";
import { getCrownWaterCoverage } from "./crown-supply.js";

export const SETTLEMENT_INTERVAL = 10;
export const NEED_WEIGHTS = Object.freeze({ food: 1.25, water: 1.1, warmth: 0.9, safety: 0.8, social: 0.65, health: 0.6 });
const NEED_KEYS = Object.freeze(Object.keys(NEED_WEIGHTS));

function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clamp01(value) { return Math.max(0, Math.min(1, number(value))); }
function homes() { return state.entities.filter(entity => !entity.dead && isHousingType(entity.type)); }
function houseIsOccupied(house) {
    if (Math.max(0, Math.floor(number(house.occupants))) > 0) return true;
    return state.entities.some(entity => {
        if (entity.dead || entity.type !== TYPE.VILLAGER) return false;
        if (entity.householdId === house.id || entity.householdId === "house:" + house.id || entity.homeId === house.id || entity.homeBuildingId === house.id) return true;
        if (entity.home && Math.abs(number(entity.home.x) - number(house.x)) < 0.6 && Math.abs(number(entity.home.y) - number(house.y)) < 0.6) return true;
        return Boolean(entity.anchor && Math.abs(number(entity.anchor.x) - number(house.x)) < 0.6 && Math.abs(number(entity.anchor.y) - number(house.y)) < 0.6);
    });
}
function serviceBuildings() { return state.entities.filter(entity => !entity.dead && entity.isBuilding() && isOperational(entity)); }
function serviceIsStaffed(building) {
    // Walls, towers and barracks are manned by the crown's guard rather than
    // the villager job pool. Treating them as unstaffed made the safety need
    // impossible to satisfy, which silently blocked all immigration.
    if (building.type === TYPE.WALL || building.type === TYPE.TOWER || building.type === TYPE.BARRACKS) return true;
    return getBuildingEfficiency(building) > 0;
}
function serviceIsSupplied(building) {
    if (building.type === TYPE.TAVERN) return (Number(state.resources.food) || 0) > 0;
    if (building.type === TYPE.WELL) {
        // A well is supplied by its own output or by a store inside the water
        // service radius. A remote warehouse no longer counts on paper.
        if ((Number(building.inventory?.output?.water) || 0) > 0) return true;
        const radius = SERVICE_DEFINITIONS.water?.radius || 8;
        return getLocalWarehouseStock("water", building.x, building.y, radius) > 0;
    }
    return true;
}
function activeService(building) {
    return serviceIsStaffed(building) && serviceIsSupplied(building);
}

export function ensureSettlementState() {
    if (!state.city || typeof state.city !== "object") state.city = {};
    const city = state.city;
    if (!city.services || typeof city.services !== "object") city.services = { version: 1, lastTick: 0, byHouse: {}, byBuilding: {}, summary: null };
    if (!city.needs || typeof city.needs !== "object") city.needs = { version: 1, lastTick: 0, summary: null, households: {}, history: [], lowChecks: 0, lastMigrationYear: 0, lastWarning: null };
    city.services.byHouse = city.services.byHouse && typeof city.services.byHouse === "object" ? city.services.byHouse : {};
    city.services.byBuilding = city.services.byBuilding && typeof city.services.byBuilding === "object" ? city.services.byBuilding : {};
    city.needs.households = city.needs.households && typeof city.needs.households === "object" ? city.needs.households : {};
    city.needs.history = Array.isArray(city.needs.history) ? city.needs.history.filter(Boolean).slice(-24) : [];
    city.needs.lowChecks = Math.max(0, Math.floor(number(city.needs.lowChecks)));
    city.needs.lastMigrationYear = Math.max(0, Math.floor(number(city.needs.lastMigrationYear)));
    return city;
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function serviceForHouse(house, category, buildings) {
    const definition = SERVICE_DEFINITIONS[category];
    if (!definition) return null;
    for (const building of buildings) {
        if (!definition.types.includes(building.type)) continue;
        if (!activeService(building)) continue;
        if (distance(house, building) <= definition.radius) return building;
    }
    return null;
}
function countOperational(category, buildings) {
    const definition = SERVICE_DEFINITIONS[category];
    return buildings.filter(building => definition.types.includes(building.type) && activeService(building)).length;
}

export function updateServices() {
    const city = ensureSettlementState();
    const buildings = serviceBuildings();
    const houseRows = homes();
    const byHouse = {};
    const byBuilding = {};
    for (const category of Object.keys(SERVICE_DEFINITIONS)) byBuilding[category] = { active: 0, coverage: 0 };
    const summary = { water: 0, social: 0, safety: 0, health: 0 };
    let occupiedHomes = 0;
    for (const house of houseRows) {
        const occupied = houseIsOccupied(house);
        if (occupied) occupiedHomes++;
        const row = { id: house.id, type: house.type, occupied, capacity: HOUSING_TIERS[house.type]?.capacity || 0 };
        for (const category of Object.keys(SERVICE_DEFINITIONS)) {
            const provider = serviceForHouse(house, category, buildings);
            row[category] = Boolean(provider);
            row[category + "Source"] = provider?.id || null;
            if (provider) byBuilding[category].coverage++;
            // Empty cottages have no residents to protect or serve. Counting
            // them made every new house lower safety coverage on paper, which
            // silently closed the immigration gate just as housing expanded.
            if (provider && occupied) summary[category]++;
        }
        byHouse[house.id] = row;
    }
    for (const category of Object.keys(byBuilding)) byBuilding[category].active = countOperational(category, buildings);
    // Paid waterworks cover occupied homes that no staffed well reaches. This
    // is a real service with an annual payroll, not a realm-wide boolean: the
    // coverage is counted per occupied house and disappears immediately when
    // the crown cannot pay the watermen.
    const reliefCoverage = getCrownWaterCoverage();
    if (reliefCoverage > 0 && occupiedHomes > 0) {
        const target = Math.ceil(occupiedHomes * reliefCoverage);
        let missing = Math.max(0, target - summary.water);
        if (missing > 0) {
            for (const house of houseRows) {
                const row = byHouse[house.id];
                if (!row?.occupied || row.water) continue;
                row.water = true;
                row.waterSource = "crown-waterworks";
                summary.water++;
                if (--missing <= 0) break;
            }
        }
    }
    for (const category of Object.keys(summary)) summary[category] = occupiedHomes ? summary[category] / occupiedHomes : 0;
    city.services.byHouse = byHouse;
    city.services.byBuilding = byBuilding;
    city.services.summary = summary;
    city.services.lastTick = state.tick;
    return summary;
}

function foodSatisfaction(population) {
    const demand = Math.max(1, population * 0.12);
    return clamp01((Number(state.resources.food) || 0) / demand);
}
// Heating draws firewood from a store in the household's own supply radius and
// books it as consumption. Distant stock cannot warm a house.
function warmthSatisfaction(house, season) {
    if (season !== 3) {
        house.lastHeatedTick = 0;
        return 1;
    }
    // One load of firewood keeps a hearth burning for forty days. Drawing two
    // loads every ten days demanded four times what a staffed sawmill could
    // produce, so every winter opened with cold houses and no firewood.
    const interval = 40;
    const lastHeated = Math.max(0, number(house.lastHeatedTick));
    if (lastHeated > 0 && state.tick - lastHeated < interval) return 1;
    const needed = 1;
    const warehouse = findLocalWarehouse("firewood", house.x, house.y, HOUSEHOLD_SUPPLY_RADIUS);
    if (!warehouse) return 0;
    const consumed = consumeFromWarehouse(warehouse, "firewood", needed, {
        cause: "household-heating", houseId: house.id,
        key: "heat:" + house.id + ":" + state.year + ":" + state.seasonIndex + ":" + Math.floor(state.tick / interval)
    });
    if (consumed >= needed) {
        house.lastHeatedTick = state.tick;
        return 1;
    }
    return 0;
}
function housingComfort(house) {
    return HOUSING_TIERS[house.type]?.comfort || 0.5;
}

export function updateSettlementNeeds() {
    const city = ensureSettlementState();
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const houseRows = homes();
    // Empty structures do not burn firewood and must not drag the settlement
    // average down. Only inhabited houses create household demand.
    const occupiedHomes = houseRows.filter(houseIsOccupied);
    const services = city.services.summary || updateServices();
    const season = Math.max(0, Math.min(3, Math.floor(number(state.seasonIndex))));
    const houseWarmth = new Map();
    for (const house of occupiedHomes) houseWarmth.set(house.id, warmthSatisfaction(house, season));
    const firewood = occupiedHomes.length
        ? occupiedHomes.reduce((sum, house) => sum + houseWarmth.get(house.id), 0) / occupiedHomes.length
        : 1;
    let total = 0, count = 0;
    const householdRows = {};
    for (const house of occupiedHomes) {
        const coverage = city.services.byHouse[house.id] || {};
        const comfort = housingComfort(house);
        const row = {
            id: house.id,
            food: foodSatisfaction(population),
            water: coverage.water ? 1 : 0,
            warmth: Math.min(1, (coverage.water ? 0.75 : 0.55) + comfort * 0.25) * houseWarmth.get(house.id),
            safety: coverage.safety ? 1 : 0.45,
            social: coverage.social ? 1 : 0.4,
            health: coverage.health ? 1 : 0.5,
            comfort
        };
        const weighted = NEED_KEYS.reduce((sum, key) => sum + row[key] * NEED_WEIGHTS[key], 0) / Object.values(NEED_WEIGHTS).reduce((a, b) => a + b, 0);
        row.satisfaction = clamp01(weighted);
        householdRows[house.id] = row;
        total += row.satisfaction;
        count++;
    }
    const average = count ? total / count : 0.55;
    const previousLow = Number(city.needs.lowChecks) || 0;
    const lowChecks = average < 0.45 ? Math.min(5, previousLow + 1) : Math.max(0, previousLow - 1);
    city.needs.lowChecks = lowChecks;
    city.needs.productivity = Math.max(0.72, Math.min(1.05, 0.72 + average * 0.33));
    const warmth = firewood;
    const summary = {
        population, households: occupiedHomes.length,
        food: foodSatisfaction(population), water: services.water || 0,
        warmth, safety: services.safety || 0, social: services.social || 0,
        health: services.health || 0, satisfaction: average,
        productivity: city.needs.productivity,
        lowChecks, firewoodStock: getWarehouseStock("firewood"),
        waterStock: getWarehouseStock("water")
    };
    city.needs.households = householdRows;
    city.needs.summary = summary;
    city.needs.lastTick = state.tick;
    city.needs.history = city.needs.history.slice(-23);
    city.needs.history.push({ tick: state.tick, year: state.year, season, satisfaction: average, food: summary.food, water: summary.water, warmth, safety: summary.safety, social: summary.social, productivity: summary.productivity });
    if (average < 0.45 && state.tick - (Number(city.needs.lastWarningTick) || 0) > 30) {
        city.needs.lastWarningTick = state.tick;
        city.needs.lastWarning = average < 0.3 ? "HOUSEHOLD NEEDS CRITICAL" : "HOUSEHOLD NEEDS STRAINED";
        state.morale = Math.max(0, (Number(state.morale) || 0) - 0.8);
    } else if (average > 0.7) {
        state.morale = Math.min(100, (Number(state.morale) || 0) + 0.25);
    }
    // Migration is a last resort, only after repeated low satisfaction and
    // only removes an unhoused or unemployed resident. The crown is never
    // silently deleted.
    if (average < 0.32 && lowChecks >= 3 && state.year > (Number(city.needs.lastMigrationYear) || 0)) {
        const candidate = state.entities.find(entity => !entity.dead && entity.type === TYPE.VILLAGER && !entity.isKing && !entity.workplace);
        if (candidate && population > 1) {
            candidate.dead = true;
            city.needs.lastMigrationYear = state.year;
            city.needs.lowChecks = 0;
            state.economy.deaths = (Number(state.economy.deaths) || 0) + 1;
            state.eventLog.push({ text: "A RESIDENT LEFT THE REALM — HOUSEHOLD NEEDS UNMET", kind: "population", tick: state.tick, id: ++state.eventSequence });
            if (state.eventLog.length > 100) state.eventLog.shift();
        }
    }
    return summary;
}

export function updateSettlement() {
    if (!state.hasStarted || state.isPaused || state.gameOver) return null;
    const city = ensureSettlementState();
    if (state.tick <= 0 || state.tick % SETTLEMENT_INTERVAL !== 0) return null;
    updateServices();
    return updateSettlementNeeds();
}

export function canSettleNewcomer() {
    const city = ensureSettlementState();
    const summary = city.needs?.summary;
    if (!summary) return { ok: true, reason: null };
    if (summary.water < 0.4) return { ok: false, reason: "No reliable water coverage" };
    if (summary.safety < 0.35) return { ok: false, reason: "Local safety is too low" };
    if (summary.food < 0.5) return { ok: false, reason: "Food reserves are too low" };
    if (summary.satisfaction < 0.45) return { ok: false, reason: "Household needs are not being met" };
    return { ok: true, reason: null };
}

export function getSettlementSnapshot() {
    const city = ensureSettlementState();
    return {
        services: city.services.summary ? { ...city.services.summary } : { water: 0, social: 0, safety: 0, health: 0 },
        needs: city.needs.summary ? { ...city.needs.summary } : null,
        households: { ...(city.needs.households || {}) },
        history: Array.isArray(city.needs.history) ? city.needs.history.slice(-24) : [],
        byBuilding: city.services.byBuilding ? JSON.parse(JSON.stringify(city.services.byBuilding)) : {}
    };
}

export function getHouseholdNeedSnapshot(house) {
    const city = ensureSettlementState();
    return city.needs.households?.[house?.id] || null;
}

export function getServiceBuildingsForOverlay() {
    const result = [];
    for (const building of serviceBuildings()) {
        for (const [category, definition] of Object.entries(SERVICE_DEFINITIONS)) {
            if (!definition.types.includes(building.type)) continue;
            result.push({ id: building.id, x: building.x, y: building.y, type: building.type, category, radius: definition.radius, active: activeService(building) });
        }
    }
    return result;
}

export function getServiceReason(building) {
    if (!building || !isOperational(building)) return "Under construction";
    if (!serviceIsStaffed(building)) return "No staff assigned";
    if (!serviceIsSupplied(building)) return "No supplies";
    return "Operating";
}

export function initializeSettlementForRealm() {
    ensureSettlementState();
    updateServices();
    updateSettlementNeeds();
    return getSettlementSnapshot();
}
