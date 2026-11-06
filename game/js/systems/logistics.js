// Physical settlement logistics: local inventories, bounded warehouses,
// reserved delivery jobs and visible carriers. Gameplay never moves a good
// directly from one producer to a consumer; a carrier job owns that movement.
//
// Every active job owns explicit source and destination reservations. The
// actual picked quantity is written back into the job before the carrier
// leaves, and every failed delivery is either retried or returned to a store.
// Goods are never deleted to make a broken route disappear.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { BUILDING_SIZE } from "../core/config.js";
import { addResource } from "./resources.js";
import { getResourceNodeAt } from "./resource-geography.js";
import { findPath, isWalkable, rebuildBlockedBuildingTiles } from "../simulation/villagers.js";
import { getRoadSpeedMultiplier } from "./roads.js";
import { GOOD_KEYS, GOODS, CITY_VERSION, NEW_BUILDING_TYPES, RECIPES, WAREHOUSE_PROFILES, WAREHOUSE_PROFILE_IDS } from "./city-config.js";
import { GOODS_LEDGER_LIMIT, ensureGoodsBook, recordGoodsMovement, setAuditOpening, readAuditTotals, recordResourceMovement } from "./goods-book.js";
export { recordResourceMovement };

export const WAREHOUSE_CAPACITY = Object.freeze({ [TYPE.KEEP]: 320, [TYPE.WAREHOUSE]: 180 });
export const CARRIER_CAPACITY = 8;
export const MAX_CARRIERS = 6;
export const MAX_LOGISTICS_JOBS = 72;
export const JOB_RETRY_TICKS = 30;
export const JOB_EXPIRE_TICKS = 900;
export const MAX_JOB_ATTEMPTS = 8;
export const JOB_PRIORITIES = Object.freeze({ food: 100, water: 90, firewood: 80, bread: 100, flour: 60, grain: 50, construction: 70, supply: 60, haul: 40 });
const LOGISTICS_VERSION = 3;
const LEDGER_LIMIT = GOODS_LEDGER_LIMIT;
const SNAPSHOT_LEDGER_LIMIT = 120;
export const HOUSEHOLD_SUPPLY_RADIUS = 12;
const ROUTE_CACHE_LIMIT = 600;
const ACTIVE_STATUSES = Object.freeze(["pending", "assigned", "blocked"]);
const JOB_STATUSES = new Set([...ACTIVE_STATUSES, "done", "cancelled"]);
const CITY_TYPES = new Set([...NEW_BUILDING_TYPES, TYPE.KEEP, TYPE.HOUSE, TYPE.FARM, TYPE.LUMBER, TYPE.QUARRY, TYPE.TOWER, TYPE.WALL, TYPE.TAVERN, TYPE.TEMPLE, TYPE.BARRACKS, TYPE.MILL, TYPE.STABLE, TYPE.WONDER, TYPE.GOLDMINE, TYPE.BARREL]);

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function cleanQuantity(value) {
    return Math.max(0, Math.floor(number(value)));
}
function entityById(id) {
    return state.entities.find(entity => !entity.dead && entity.id === id) || null;
}
function buildingAt(x, y) {
    return state.entities.find(entity => {
        if (entity.dead || !entity.isBuilding()) return false;
        const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
        const scale = Math.max(0.25, Math.min(6, number(entity.footprintScale, 1)));
        const halfW = base.w * scale / 2, halfH = base.h * scale / 2;
        return x + 0.5 >= entity.x + 0.5 - halfW && x + 0.5 <= entity.x + 0.5 + halfW &&
            y + 0.5 >= entity.y + 0.5 - halfH && y + 0.5 <= entity.y + 0.5 + halfH;
    }) || null;
}
function nearestWalkable(x, y) {
    rebuildBlockedBuildingTiles();
    const centerX = Math.floor(number(x)), centerY = Math.floor(number(y));
    for (let radius = 1; radius <= 8; radius++) {
        for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                const tx = centerX + ox, ty = centerY + oy;
                if (isWalkable(tx + 0.5, ty + 0.5) && !state.entities.some(entity => !entity.dead && entity.type === TYPE.VILLAGER && Math.floor(entity.x) === tx && Math.floor(entity.y) === ty)) return { x: tx + 0.5, y: ty + 0.5 };
            }
        }
    }
    return { x: centerX + 0.5, y: centerY + 0.5 };
}
function isActive(job) {
    return Boolean(job && ACTIVE_STATUSES.includes(job.status));
}
function totalReservedIn(inventory) {
    return GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(inventory?.reservedIn?.[key]), 0);
}
function usedInput(entity) {
    return GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(entity?.inventory?.input?.[key]), 0);
}
function usedOutput(entity) {
    return GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(entity?.inventory?.output?.[key]), 0);
}

export function ensureCityState() {
    if (!state.city || typeof state.city !== "object") state.city = {};
    const city = state.city;
    city.version = CITY_VERSION;
    city.enabled = Boolean(city.enabled);
    city.constructionVersion = Math.max(0, Math.floor(number(city.constructionVersion)));
    if (!city.logistics || typeof city.logistics !== "object") {
        city.logistics = { version: LOGISTICS_VERSION, nextJobId: 1, nextCarrierId: 1, jobs: [], carriers: [], lastTick: 0, stats: {} };
    }
    const logistics = ensureGoodsBook();
    logistics.version = LOGISTICS_VERSION;
    logistics.nextJobId = Math.max(1, Math.floor(number(logistics.nextJobId, 1)));
    logistics.nextCarrierId = Math.max(1, Math.floor(number(logistics.nextCarrierId, 1)));
    logistics.jobs = Array.isArray(logistics.jobs) ? logistics.jobs.filter(job => job && typeof job === "object") : [];
    logistics.carriers = Array.isArray(logistics.carriers) ? logistics.carriers.filter(carrier => carrier && typeof carrier === "object").slice(-MAX_CARRIERS) : [];
    logistics.lastTick = Math.max(0, Math.floor(number(logistics.lastTick)));
    logistics.stats = logistics.stats && typeof logistics.stats === "object" ? logistics.stats : {};
    return city;
}

export function ensureInventory(entity) {
    if (!entity || !entity.isBuilding?.()) return null;
    if (!entity.inventory || typeof entity.inventory !== "object") entity.inventory = {};
    const inventory = entity.inventory;
    inventory.version = LOGISTICS_VERSION;
    inventory.input = inventory.input && typeof inventory.input === "object" ? inventory.input : {};
    inventory.output = inventory.output && typeof inventory.output === "object" ? inventory.output : {};
    inventory.reservedIn = inventory.reservedIn && typeof inventory.reservedIn === "object" ? inventory.reservedIn : {};
    inventory.reservedOut = inventory.reservedOut && typeof inventory.reservedOut === "object" ? inventory.reservedOut : {};
    for (const key of GOOD_KEYS) {
        inventory.input[key] = cleanQuantity(inventory.input[key]);
        inventory.output[key] = cleanQuantity(inventory.output[key]);
        inventory.reservedIn[key] = cleanQuantity(inventory.reservedIn[key]);
        inventory.reservedOut[key] = Math.min(cleanQuantity(inventory.reservedOut[key]), cleanQuantity(inventory.output[key]));
    }
    if (entity.type === TYPE.WAREHOUSE || entity.type === TYPE.KEEP) {
        if (!entity.warehouse || typeof entity.warehouse !== "object") entity.warehouse = {};
        const savedFilters = Array.isArray(entity.warehouse.filters) ? entity.warehouse.filters.filter(key => GOOD_KEYS.includes(key)) : null;
        let profileId = WAREHOUSE_PROFILES[entity.warehouse.profile] ? entity.warehouse.profile : null;
        if (!profileId && savedFilters) {
            // A legacy save predates profiles. Recognise the shipped filter sets
            // instead of silently relabelling a specialised store as general.
            profileId = WAREHOUSE_PROFILE_IDS.find(id => {
                const filters = WAREHOUSE_PROFILES[id].filters;
                return filters.length === savedFilters.length && filters.every(good => savedFilters.includes(good));
            }) || null;
        }
        const profile = WAREHOUSE_PROFILES[profileId || "general"];
        entity.warehouse.profile = profile.id;
        const defaultCapacity = entity.type === TYPE.KEEP ? WAREHOUSE_CAPACITY[TYPE.KEEP] : (WAREHOUSE_CAPACITY[entity.type] || profile.capacity);
        entity.warehouse.capacity = Math.max(1, Math.floor(number(entity.warehouse.capacity, defaultCapacity)));
        entity.warehouse.stored = entity.warehouse.stored && typeof entity.warehouse.stored === "object" ? entity.warehouse.stored : {};
        entity.warehouse.filters = savedFilters || [...profile.filters];
        entity.warehouse.reservedIn = entity.warehouse.reservedIn && typeof entity.warehouse.reservedIn === "object" ? entity.warehouse.reservedIn : {};
        entity.warehouse.reservedOut = entity.warehouse.reservedOut && typeof entity.warehouse.reservedOut === "object" ? entity.warehouse.reservedOut : {};
        for (const key of GOOD_KEYS) {
            entity.warehouse.stored[key] = cleanQuantity(entity.warehouse.stored[key]);
            entity.warehouse.reservedIn[key] = cleanQuantity(entity.warehouse.reservedIn[key]);
            entity.warehouse.reservedOut[key] = Math.min(cleanQuantity(entity.warehouse.reservedOut[key]), entity.warehouse.stored[key]);
        }
    }
    return inventory;
}

export function ensureAllInventories() {
    for (const entity of state.entities) if (!entity.dead && entity.isBuilding()) ensureInventory(entity);
}

// Legacy saves predate the capacity cap. Raising the capacity of an overfull
// store keeps every stored good instead of deleting the overflow. This runs
// only during migration, never while the game is being played.
export function normalizeLegacyWarehouseCapacity() {
    let raised = 0;
    for (const entity of state.entities) {
        if (entity.dead || !isWarehouse(entity)) continue;
        ensureInventory(entity);
        const used = GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(entity.warehouse.stored[key]), 0);
        // Only real stock may raise a legacy capacity. Stale reservations are
        // rebuilt from the surviving jobs and must never invent storage space.
        if (used > entity.warehouse.capacity) {
            entity.warehouse.capacity = used;
            raised++;
        }
    }
    return raised;
}

export function isWarehouse(entity) {
    return Boolean(entity && !entity.dead && (entity.type === TYPE.WAREHOUSE || entity.type === TYPE.KEEP));
}
export function getWarehouses() {
    return state.entities.filter(entity => isWarehouse(entity)).map(entity => { ensureInventory(entity); return entity; });
}
export function warehouseUsed(warehouse) {
    ensureInventory(warehouse);
    return GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(warehouse.warehouse?.stored?.[key]), 0);
}
export function warehouseReservedIn(warehouse) {
    ensureInventory(warehouse);
    return GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(warehouse.warehouse?.reservedIn?.[key]), 0);
}
export function warehouseReservedOut(warehouse) {
    ensureInventory(warehouse);
    return GOOD_KEYS.reduce((sum, key) => sum + cleanQuantity(warehouse.warehouse?.reservedOut?.[key]), 0);
}
export function getWarehouseStock(good) {
    return getWarehouses().reduce((sum, warehouse) => sum + cleanQuantity(warehouse.warehouse?.stored?.[good]), 0);
}
export function getAvailableWarehouseStock(good) {
    return getWarehouses().reduce((sum, warehouse) => sum + Math.max(0, cleanQuantity(warehouse.warehouse?.stored?.[good]) - cleanQuantity(warehouse.warehouse?.reservedOut?.[good])), 0);
}
export function getWarehouseSnapshot() {
    const rows = getWarehouses().map(warehouse => ({
        id: warehouse.id, x: warehouse.x, y: warehouse.y, type: warehouse.type,
        profile: warehouse.warehouse.profile, profileLabel: WAREHOUSE_PROFILES[warehouse.warehouse.profile]?.label || "General store",
        capacity: warehouse.warehouse.capacity, used: warehouseUsed(warehouse),
        free: getWarehouseSpace(warehouse), reservedIn: warehouseReservedIn(warehouse),
        reservedOut: warehouseReservedOut(warehouse), filters: [...warehouse.warehouse.filters],
        stored: { ...warehouse.warehouse.stored }
    }));
    return {
        rows,
        used: rows.reduce((sum, row) => sum + row.used, 0),
        capacity: rows.reduce((sum, row) => sum + row.capacity, 0),
        free: rows.reduce((sum, row) => sum + row.free, 0),
        reservedIn: rows.reduce((sum, row) => sum + row.reservedIn, 0),
        reservedOut: rows.reduce((sum, row) => sum + row.reservedOut, 0),
        stock: Object.fromEntries(GOOD_KEYS.map(key => [key, getWarehouseStock(key)]))
    };
}
export function getWarehouseSpace(warehouse) {
    ensureInventory(warehouse);
    return Math.max(0, warehouse.warehouse.capacity - warehouseUsed(warehouse) - warehouseReservedIn(warehouse));
}
export function getWarehouseProfile(entity) {
    if (!isWarehouse(entity)) return null;
    ensureInventory(entity);
    return WAREHOUSE_PROFILES[entity.warehouse.profile] || WAREHOUSE_PROFILES.general;
}
export function setWarehouseProfile(entity, profileId) {
    if (!isWarehouse(entity)) return { ok: false, reason: "not-a-warehouse" };
    const profile = WAREHOUSE_PROFILES[profileId];
    if (!profile) return { ok: false, reason: "unknown-warehouse-profile" };
    if (entity.type === TYPE.KEEP) return { ok: false, reason: "royal-keep-is-always-a-general-store" };
    ensureInventory(entity);
    const blocked = GOOD_KEYS.filter(good => !profile.filters.includes(good) && (
        cleanQuantity(entity.warehouse.stored[good]) > 0 ||
        cleanQuantity(entity.warehouse.reservedIn[good]) > 0 ||
        cleanQuantity(entity.warehouse.reservedOut[good]) > 0
    ));
    if (blocked.length) return { ok: false, reason: "store-still-holds-" + blocked.join("-") };
    entity.warehouse.profile = profile.id;
    entity.warehouse.filters = [...profile.filters];
    entity.warehouse.capacity = Math.max(profile.capacity, warehouseUsed(entity) + warehouseReservedIn(entity));
    return { ok: true, profile: profile.id, capacity: entity.warehouse.capacity, filters: [...entity.warehouse.filters] };
}
function depositToWarehouse(warehouse, good, quantity) {
    if (!isWarehouse(warehouse) || !warehouse.warehouse.filters.includes(good)) return 0;
    const space = getWarehouseSpace(warehouse);
    const amount = Math.min(space, cleanQuantity(quantity));
    if (amount <= 0) return 0;
    warehouse.warehouse.stored[good] += amount;
    return amount;
}
function withdrawUnreservedFromWarehouse(warehouse, good, quantity) {
    if (!isWarehouse(warehouse) || !warehouse.warehouse.filters.includes(good)) return 0;
    const available = Math.max(0, cleanQuantity(warehouse.warehouse.stored[good]) - cleanQuantity(warehouse.warehouse.reservedOut[good]));
    const amount = Math.min(available, cleanQuantity(quantity));
    if (amount <= 0) return 0;
    warehouse.warehouse.stored[good] -= amount;
    return amount;
}
function withdrawReservedFromWarehouse(warehouse, good, quantity) {
    if (!isWarehouse(warehouse) || !warehouse.warehouse.filters.includes(good)) return 0;
    const reserved = cleanQuantity(warehouse.warehouse.reservedOut[good]);
    const stored = cleanQuantity(warehouse.warehouse.stored[good]);
    const amount = Math.min(reserved, stored, cleanQuantity(quantity));
    if (amount <= 0) return 0;
    warehouse.warehouse.stored[good] -= amount;
    warehouse.warehouse.reservedOut[good] -= amount;
    return amount;
}
export function depositGood(good, quantity, x = 0, y = 0) {
    let remaining = cleanQuantity(quantity);
    if (!GOOD_KEYS.includes(good) || remaining <= 0) return 0;
    const warehouses = getWarehouses().filter(warehouse => warehouse.warehouse.filters.includes(good))
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || String(a.id).localeCompare(String(b.id)));
    let moved = 0;
    for (const warehouse of warehouses) {
        const amount = depositToWarehouse(warehouse, good, remaining);
        if (amount <= 0) continue;
        moved += amount; remaining -= amount;
        recordGoodMovement({ type: "deposited", good, quantity: amount, to: { kind: "warehouse", id: warehouse.id }, cause: "manual-deposit" });
        if (remaining <= 0) break;
    }
    return moved;
}
export function withdrawGood(good, quantity, x = 0, y = 0) {
    let remaining = cleanQuantity(quantity);
    if (!GOOD_KEYS.includes(good) || remaining <= 0) return 0;
    const warehouses = getWarehouses().filter(warehouse => warehouse.warehouse.filters.includes(good))
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || String(a.id).localeCompare(String(b.id)));
    let moved = 0;
    for (const warehouse of warehouses) {
        const amount = withdrawUnreservedFromWarehouse(warehouse, good, remaining);
        if (amount <= 0) continue;
        moved += amount; remaining -= amount;
        recordGoodMovement({ type: "withdrawn", good, quantity: amount, from: { kind: "warehouse", id: warehouse.id }, cause: "manual-withdrawal" });
        if (remaining <= 0) break;
    }
    return moved;
}

// Household consumption: goods leave a real local store and are booked once.
// The key makes the booking idempotent, so a repeated settlement pass cannot
// burn the same firewood twice.
export function consumeFromWarehouse(warehouse, good, quantity, { cause = "household-consumption", key = null, houseId = null, to = null } = {}) {
    if (!isWarehouse(warehouse) || !GOOD_KEYS.includes(good)) return 0;
    const logistics = ensureCityState().logistics;
    if (key) {
        const existing = logistics.ledger.find(entry => entry.key === key);
        if (existing) return cleanQuantity(existing.quantity);
    }
    const amount = withdrawUnreservedFromWarehouse(warehouse, good, quantity);
    if (amount <= 0) return 0;
    recordGoodMovement({
        type: "consumed", good, quantity: amount,
        from: { kind: "warehouse", id: warehouse.id },
        to: to || { kind: "household", id: houseId || "settlement" },
        cause, key, houseId
    });
    return amount;
}

// A local query only counts stores inside the household or service radius. A
// remote warehouse can no longer satisfy a local need on paper.
export function getLocalWarehouseStock(good, x, y, radius) {
    const limit = Math.max(0, number(radius));
    return getWarehouses()
        .filter(warehouse => warehouse.warehouse.filters.includes(good) && Math.hypot(warehouse.x - x, warehouse.y - y) <= limit)
        .reduce((sum, warehouse) => sum + Math.max(0, cleanQuantity(warehouse.warehouse.stored[good]) - cleanQuantity(warehouse.warehouse.reservedOut[good])), 0);
}

export function findLocalWarehouse(good, x, y, radius) {
    const limit = Math.max(0, number(radius));
    const origin = { x, y };
    return getWarehouses()
        .filter(warehouse => warehouse.warehouse.filters.includes(good) &&
            Math.hypot(warehouse.x - x, warehouse.y - y) <= limit &&
            cleanQuantity(warehouse.warehouse.stored[good]) - cleanQuantity(warehouse.warehouse.reservedOut[good]) > 0)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || String(a.id).localeCompare(String(b.id)))
        .find(warehouse => hasOverlandRoute(origin, warehouse)) || null;
}

const routeCache = new Map();
// Reachability is path-based, not euclidean. Results are cached per collision
// and road revision because blocking changes invalidate old routes.
export function hasOverlandRoute(a, b) {
    if (!a || !b) return false;
    const version = (state.buildingCollisionVersion || 0) + ":" + (state.roads?.revision || 0);
    const key = Math.floor(number(a.x)) + "," + Math.floor(number(a.y)) + ">" + Math.floor(number(b.x)) + "," + Math.floor(number(b.y)) + "@" + version;
    if (routeCache.has(key)) return routeCache.get(key);
    const start = nearestWalkable(a.x, a.y), end = nearestWalkable(b.x, b.y);
    const adjacent = Math.abs(start.x - end.x) <= 1 && Math.abs(start.y - end.y) <= 1;
    const reachable = adjacent || Boolean(findPath(start.x, start.y, end.x, end.y, 2400));
    if (routeCache.size > ROUTE_CACHE_LIMIT) routeCache.clear();
    routeCache.set(key, reachable);
    return reachable;
}
export function clearRouteCache() {
    routeCache.clear();
}

function waypoint(ref) {
    const entity = entityFromRef(ref);
    return entity ? { x: entity.x, y: entity.y } : null;
}
function availableIn(warehouse, good) {
    return Math.max(0, cleanQuantity(warehouse.warehouse.stored[good]) - cleanQuantity(warehouse.warehouse.reservedOut[good]));
}
function pickWarehouse(good, quantity, origin, { requireSpace = false, requireStock = false, avoidId = null } = {}) {
    const candidates = getWarehouses().filter(warehouse =>
        warehouse.warehouse.filters.includes(good) && warehouse.id !== avoidId &&
        (!requireSpace || getWarehouseSpace(warehouse) >= quantity) &&
        (!requireStock || availableIn(warehouse, good) >= quantity)
    ).map(warehouse => ({ warehouse, distance: Math.hypot(warehouse.x - origin.x, warehouse.y - origin.y) }))
        .sort((a, b) => a.distance - b.distance || String(a.warehouse.id).localeCompare(String(b.warehouse.id)));
    for (const candidate of candidates) if (hasOverlandRoute(origin, candidate.warehouse)) return candidate.warehouse;
    return null;
}
function rejectOrder(reason, kind, good) {
    const logistics = ensureCityState().logistics;
    logistics.lastRejection = { reason, kind, good: good || null, tick: Math.max(0, Math.floor(number(state.tick))) };
    logistics.stats.queueRejected = cleanQuantity(logistics.stats.queueRejected) + 1;
}

// Physical stock = every local store, every warehouse and every carrier load.
// Reservations are claims on that stock, never additional goods.
export function getPhysicalStock(good) {
    let total = 0;
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        ensureInventory(entity);
        if (entity.warehouse) total += cleanQuantity(entity.warehouse.stored[good]);
        total += cleanQuantity(entity.inventory?.output?.[good]);
        total += cleanQuantity(entity.inventory?.input?.[good]);
    }
    for (const carrier of ensureCityState().logistics.carriers) {
        if (carrier.cargo?.good === good) total += cleanQuantity(carrier.cargo.quantity);
    }
    return total;
}
export function getPhysicalStockMap() {
    const result = Object.fromEntries(GOOD_KEYS.map(key => [key, 0]));
    result.food = Math.max(0, Number(state.resources.food) || 0);
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        ensureInventory(entity);
        if (entity.warehouse) for (const key of GOOD_KEYS) result[key] += cleanQuantity(entity.warehouse.stored[key]);
        for (const key of GOOD_KEYS) result[key] += cleanQuantity(entity.inventory?.output?.[key]) + cleanQuantity(entity.inventory?.input?.[key]);
    }
    for (const carrier of ensureCityState().logistics.carriers) {
        if (carrier.cargo && GOOD_KEYS.includes(carrier.cargo.good)) result[carrier.cargo.good] += cleanQuantity(carrier.cargo.quantity);
    }
    return result;
}
// The audit reconciles the current stock against opening + produced - consumed.
// Internal transfers never change the total, so a non-zero difference means a
// real leak and not a rounding artefact (resource amounts are rounded to 0.01).
export function getGoodsAudit() {
    const logistics = ensureCityState().logistics;
    const rows = [...GOOD_KEYS, "food"].map(good => {
        const scope = GOOD_KEYS.includes(good) ? "good" : "resource";
        const totals = readAuditTotals(good, scope);
        const physical = scope === "resource" ? Math.max(0, Number(state.resources.food) || 0) : getPhysicalStock(good);
        const expected = Math.round((totals.opening + totals.produced - totals.consumed) * 100) / 100;
        const difference = Math.round((physical - expected) * 100) / 100;
        return { ...totals, physical, expected, difference, balanced: Math.abs(difference) < 0.02 };
    });
    return {
        rows,
        balanced: rows.every(row => row.balanced),
        sinceTick: Math.max(0, Math.floor(number(logistics.audit?.sinceTick))),
        lastTick: Math.max(0, Math.floor(number(logistics.audit?.lastTick)))
    };
}
export function getInventorySummary(entity) {
    if (!entity || !entity.isBuilding()) return null;
    ensureInventory(entity);
    if (isWarehouse(entity)) {
        return {
            kind: "warehouse", profile: entity.warehouse.profile, profileLabel: WAREHOUSE_PROFILES[entity.warehouse.profile]?.label || "General store",
            capacity: entity.warehouse.capacity, used: warehouseUsed(entity),
            free: getWarehouseSpace(entity), reservedIn: { ...entity.warehouse.reservedIn },
            reservedOut: { ...entity.warehouse.reservedOut }, filters: [...entity.warehouse.filters],
            stored: { ...entity.warehouse.stored }
        };
    }
    return {
        kind: "building",
        input: Object.fromEntries(GOOD_KEYS.filter(key => entity.inventory.input[key] > 0).map(key => [key, entity.inventory.input[key]])),
        output: Object.fromEntries(GOOD_KEYS.filter(key => entity.inventory.output[key] > 0).map(key => [key, entity.inventory.output[key]])),
        reservedIn: { ...entity.inventory.reservedIn },
        reservedOut: { ...entity.inventory.reservedOut }
    };
}
export function getOutputCapacity(type) {
    const recipe = RECIPES[type];
    return Math.max(0, Math.floor(number(recipe?.outputCapacity, 0)));
}
export function getInputCapacity(type) {
    const recipe = RECIPES[type];
    return Math.max(0, Math.floor(number(recipe?.inputCapacity, 0)));
}
export function outputSpace(entity) {
    const capacity = getOutputCapacity(entity.type);
    const used = ensureInventory(entity) ? usedOutput(entity) : 0;
    return Math.max(0, capacity - used);
}
// The input store is shared by every good. This function is deliberately
// independent of a recipe: requestSupply() decides which goods are allowed,
// while this allocator only decides how much physical input space remains.
export function getInputCapacityUsage(entity, capacity = null) {
    if (!entity || entity.dead || !entity.isBuilding?.()) return { capacity: 0, used: 0, reserved: 0, occupied: 0, free: 0 };
    const limit = capacity === null || capacity === undefined ? getInputCapacity(entity.type) : Number(capacity);
    if (!Number.isFinite(limit) || limit <= 0) return { capacity: 0, used: 0, reserved: 0, occupied: 0, free: 0 };
    if (!ensureInventory(entity)) return { capacity: 0, used: 0, reserved: 0, occupied: 0, free: 0 };
    const used = usedInput(entity);
    const reserved = totalReservedIn(entity.inventory);
    const occupied = used + reserved;
    return { capacity: limit, used, reserved, occupied, free: Math.max(0, limit - occupied) };
}
export function inputSpace(entity) {
    return getInputCapacityUsage(entity).free;
}

// Reserves only the part of a request that fits. The caller remains responsible
// for releasing the reservation when its job is cancelled or cannot be created.
export function reserveInputCapacity(entity, good, quantity, capacity = null) {
    if (!entity || entity.dead || !entity.isBuilding?.() || !GOOD_KEYS.includes(good)) return 0;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return 0;
    const usage = getInputCapacityUsage(entity, capacity);
    if (usage.capacity <= 0) return 0;
    const amount = Math.min(Math.floor(quantity), usage.free);
    if (amount <= 0) return 0;
    const inventory = ensureInventory(entity);
    inventory.reservedIn[good] = cleanQuantity(inventory.reservedIn[good]) + amount;
    return amount;
}

export function releaseInputCapacity(entity, good, quantity) {
    if (!entity?.inventory || !GOOD_KEYS.includes(good)) return 0;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return 0;
    const reserved = cleanQuantity(entity.inventory.reservedIn[good]);
    const amount = Math.min(Math.floor(quantity), reserved);
    if (amount <= 0) return 0;
    entity.inventory.reservedIn[good] = reserved - amount;
    return amount;
}
export function addLocalOutput(entity, good, quantity, extra = {}) {
    const inventory = ensureInventory(entity);
    if (!inventory || !GOOD_KEYS.includes(good)) return 0;
    const space = Math.max(0, getOutputCapacity(entity.type) - usedOutput(entity));
    const amount = Math.min(space, cleanQuantity(quantity));
    if (amount <= 0) return 0;
    inventory.output[good] += amount;
    recordGoodMovement({
        type: "produced", good, quantity: amount,
        to: { kind: "building", id: entity.id },
        cause: extra.cause || "local-production", key: extra.key || null
    });
    return amount;
}
export function addLocalInput(entity, good, quantity, extra = {}) {
    const inventory = ensureInventory(entity);
    if (!inventory || !GOOD_KEYS.includes(good)) return 0;
    const space = Math.max(0, getInputCapacity(entity.type) - usedInput(entity));
    const amount = Math.min(space, cleanQuantity(quantity));
    if (amount <= 0) return 0;
    inventory.input[good] += amount;
    recordGoodMovement({
        type: "produced", good, quantity: amount,
        to: { kind: "building", id: entity.id },
        cause: extra.cause || "local-input", key: extra.key || null
    });
    return amount;
}
export function getAvailableOutput(entity, good) {
    ensureInventory(entity);
    return Math.max(0, cleanQuantity(entity?.inventory?.output?.[good]) - cleanQuantity(entity?.inventory?.reservedOut?.[good]));
}
export function getAvailableInput(entity) {
    ensureInventory(entity);
    return Object.fromEntries(GOOD_KEYS.map(key => [key, Math.max(0, cleanQuantity(entity.inventory.input[key]))]));
}

function hasActiveJob(predicate) {
    return ensureCityState().logistics.jobs.some(job => isActive(job) && predicate(job));
}
function priorityFor(kind, good) {
    if (kind === "construction") return JOB_PRIORITIES.construction;
    if (kind === "supply") return JOB_PRIORITIES.supply;
    return JOB_PRIORITIES[good] ?? JOB_PRIORITIES[kind] ?? JOB_PRIORITIES.haul;
}
function refName(ref) {
    return ref ? ref.kind + ":" + ref.id : "unknown";
}
export function recordGoodMovement(entry) {
    if (!entry || typeof entry !== "object") return null;
    const good = entry.good === null || entry.good === undefined ? null : String(entry.good);
    if (good !== null && !GOOD_KEYS.includes(good)) return null;
    return recordGoodsMovement({ ...entry, good, scope: "good" });
}
function appendLedger(entry) {
    return recordGoodMovement(entry);
}
function trimJobs() {
    const logistics = ensureCityState().logistics;
    const active = logistics.jobs.filter(isActive);
    const finished = logistics.jobs.filter(job => !isActive(job));
    const room = Math.max(0, MAX_LOGISTICS_JOBS - active.length);
    logistics.jobs = [...active, ...finished.slice(-room)];
}
function makeJob(kind, good, quantity, from, to, extra = {}) {
    const city = ensureCityState();
    if (city.logistics.jobs.filter(isActive).length >= MAX_LOGISTICS_JOBS) {
        rejectOrder("Delivery queue is full", kind, good);
        return null;
    }
    const id = "j" + city.logistics.nextJobId++;
    const job = {
        id, kind, good, quantity: cleanQuantity(quantity), reserved: cleanQuantity(quantity),
        priority: priorityFor(kind, good), from, to, status: "pending", reason: null,
        carrierId: null, createdTick: state.tick || 0, retryAt: state.tick || 0,
        attempts: 0, picked: 0, delivered: 0, sourceReserved: false, targetReserved: false,
        ...extra
    };
    city.logistics.jobs.push(job);
    appendLedger({ type: "reserved", good, quantity: job.quantity, from, to, cause: "job-created", jobId: id });
    trimJobs();
    return job;
}
function entityFromRef(ref) {
    return ref?.id ? entityById(ref.id) : null;
}
function canAcceptWarehouseGood(warehouse, good, quantity) {
    return isWarehouse(warehouse) && warehouse.warehouse.filters.includes(good) && getWarehouseSpace(warehouse) >= quantity;
}
function activeCarrier(job) {
    return ensureCityState().logistics.carriers.find(carrier => carrier.id === job?.carrierId) || null;
}
function removeCarrier(job) {
    const logistics = ensureCityState().logistics;
    if (job?.carrierId) logistics.carriers = logistics.carriers.filter(carrier => carrier.id !== job.carrierId);
    if (job) job.carrierId = null;
}

export function requestHaul(building, good, quantity) {
    if (!building || building.dead || !RECIPES[building.type] || !GOOD_KEYS.includes(good)) return null;
    ensureInventory(building);
    const available = getAvailableOutput(building, good);
    const amount = Math.min(available, cleanQuantity(quantity));
    if (amount <= 0 || hasActiveJob(job => job.kind === "haul" && job.from?.id === building.id && job.good === good)) return null;
    const isBread = good === "bread";
    const warehouse = pickWarehouse(good, amount, building, { requireSpace: !isBread });
    if (!warehouse) {
        rejectOrder("No reachable store can accept " + good, "haul", good);
        return null;
    }
    const job = makeJob("haul", good, amount, { kind: "building", id: building.id }, { kind: "warehouse", id: warehouse.id });
    if (!job) return null;
    building.inventory.reservedOut[good] += amount;
    job.sourceReserved = true;
    if (!isBread) {
        warehouse.warehouse.reservedIn[good] += amount;
        job.targetReserved = true;
    }
    return job;
}

export function requestSupply(building, good, quantity) {
    if (!building || building.dead || !RECIPES[building.type] || !RECIPES[building.type].input?.[good]) return null;
    ensureInventory(building);
    const amount = Math.min(cleanQuantity(quantity), inputSpace(building));
    if (amount <= 0 || hasActiveJob(job => job.kind === "supply" && job.to?.id === building.id && job.good === good)) return null;
    const reserved = reserveInputCapacity(building, good, amount);
    if (reserved <= 0) return null;
    const warehouse = pickWarehouse(good, reserved, building, { requireStock: true });
    if (!warehouse) {
        releaseInputCapacity(building, good, reserved);
        rejectOrder("No reachable store holds " + good, "supply", good);
        return null;
    }
    const job = makeJob("supply", good, reserved, { kind: "warehouse", id: warehouse.id }, { kind: "building", id: building.id });
    if (!job) {
        releaseInputCapacity(building, good, reserved);
        return null;
    }
    warehouse.warehouse.reservedOut[good] += reserved;
    job.sourceReserved = true;
    job.targetReserved = true;
    return job;
}

export function requestConstructionDelivery(site, material, quantity) {
    if (!site || site.dead || !GOOD_KEYS.includes(material)) return null;
    const amount = Math.min(cleanQuantity(quantity), getAvailableWarehouseStock(material));
    if (amount <= 0) return null;
    if (hasActiveJob(job => job.kind === "construction" && job.to?.id === site.id && job.good === material)) return null;
    const warehouse = pickWarehouse(material, amount, site, { requireStock: true });
    if (!warehouse) {
        rejectOrder("No reachable store holds " + material, "construction", material);
        return null;
    }
    const job = makeJob("construction", material, amount, { kind: "warehouse", id: warehouse.id }, { kind: "construction", id: site.id });
    if (!job) return null;
    warehouse.warehouse.reservedOut[material] += amount;
    job.sourceReserved = true;
    return job;
}

export function cancelJobsForEntity(entityId) {
    const city = ensureCityState();
    for (const job of [...city.logistics.jobs]) {
        if (!isActive(job)) continue;
        if (job.from?.id !== entityId && job.to?.id !== entityId) continue;
        cancelJob(job, "Site or store removed");
    }
}

export function markConstructionDelivered(site, good, quantity) {
    if (!site?.construction) return 0;
    site.construction.delivered = site.construction.delivered && typeof site.construction.delivered === "object" ? site.construction.delivered : {};
    site.construction.delivered[good] = cleanQuantity(site.construction.delivered[good]) + cleanQuantity(quantity);
    return site.construction.delivered[good];
}

function releaseSourceReservation(job, amount = job.quantity) {
    if (!job.sourceReserved) return;
    const quantity = cleanQuantity(amount);
    const source = entityFromRef(job.from);
    if (source?.inventory) {
        if (job.from.kind === "warehouse" && isWarehouse(source)) source.warehouse.reservedOut[job.good] = Math.max(0, cleanQuantity(source.warehouse.reservedOut[job.good]) - quantity);
        else source.inventory.reservedOut[job.good] = Math.max(0, cleanQuantity(source.inventory.reservedOut[job.good]) - quantity);
    }
    if (quantity >= job.quantity) job.sourceReserved = false;
}
function releaseTargetReservation(job, amount = job.quantity) {
    if (!job.targetReserved) return;
    const quantity = cleanQuantity(amount);
    const target = entityFromRef(job.to);
    if (job.to.kind === "warehouse" && isWarehouse(target)) target.warehouse.reservedIn[job.good] = Math.max(0, cleanQuantity(target.warehouse.reservedIn[job.good]) - quantity);
    else if (job.to.kind === "building" && target?.inventory) releaseInputCapacity(target, job.good, quantity);
    if (quantity >= job.quantity) job.targetReserved = false;
}
function takeFromSource(job) {
    let moved = 0;
    if (job.from.kind === "warehouse") {
        const warehouse = entityFromRef(job.from);
        if (!isWarehouse(warehouse)) return 0;
        moved = job.sourceReserved
            ? withdrawReservedFromWarehouse(warehouse, job.good, job.quantity)
            : withdrawUnreservedFromWarehouse(warehouse, job.good, job.quantity);
    } else {
        const building = entityFromRef(job.from);
        if (!building?.inventory) return 0;
        const output = cleanQuantity(building.inventory.output[job.good]);
        const reserved = cleanQuantity(building.inventory.reservedOut[job.good]);
        const limit = job.sourceReserved ? Math.min(output, reserved, job.quantity) : Math.min(output, job.quantity);
        moved = Math.min(limit, cleanQuantity(job.quantity));
        if (moved > 0) {
            building.inventory.output[job.good] -= moved;
            if (job.sourceReserved) building.inventory.reservedOut[job.good] = Math.max(0, reserved - moved);
        }
    }
    if (moved <= 0) return 0;
    const planned = job.quantity;
    job.sourceReserved = false;
    if (moved < planned && job.targetReserved) releaseTargetReservation(job, planned - moved);
    job.quantity = moved;
    job.picked = moved;
    appendLedger({ type: "picked", good: job.good, quantity: moved, from: job.from, to: { kind: "carrier", id: job.carrierId }, cause: "pickup", jobId: job.id });
    return moved;
}
function recordDelivery(job, quantity) {
    const amount = cleanQuantity(quantity);
    if (amount <= 0) return;
    const stats = ensureCityState().logistics.stats;
    stats.delivered = (cleanQuantity(stats.delivered) || 0) + amount;
    stats[job.good] = (cleanQuantity(stats[job.good]) || 0) + amount;
    if (job.good === "bread") stats.breadDelivered = (cleanQuantity(stats.breadDelivered) || 0) + amount;
    job.delivered = cleanQuantity(job.delivered) + amount;
    appendLedger({ type: "delivered", good: job.good, quantity: amount, from: { kind: "carrier", id: job.carrierId }, to: job.to, cause: "delivery", jobId: job.id });
}
function deliverToDestination(job, carrier) {
    if (!carrier?.cargo || cleanQuantity(carrier.cargo.quantity) <= 0) return { ok: false, reason: "Carrier has no cargo" };
    const quantity = cleanQuantity(carrier.cargo.quantity);
    const target = entityFromRef(job.to);
    if (!target) return { ok: false, reason: "Destination removed", missing: true };
    if (job.to.kind === "warehouse") {
        if (!isWarehouse(target) || !target.warehouse.filters.includes(job.good)) return { ok: false, reason: "Destination store cannot accept " + job.good, missing: true };
        if (job.good === "bread") {
            recordGoodMovement({ type: "consumed", good: "bread", quantity, from: { kind: "warehouse", id: job.to?.id || job.from?.id || "unknown" }, to: { kind: "realm", id: "food-store" }, cause: "bread-converted-to-food", jobId: job.id });
            addResource("food", quantity);
            recordDelivery(job, quantity);
            carrier.cargo = null;
            job.quantity = 0;
            job.targetReserved = false;
            return { ok: true, completed: true, delivered: quantity };
        }
        const own = job.targetReserved ? Math.min(cleanQuantity(target.warehouse.reservedIn[job.good]), quantity) : 0;
        const other = Math.max(0, warehouseReservedIn(target) - own);
        const space = Math.max(0, target.warehouse.capacity - warehouseUsed(target) - other);
        const accepted = Math.min(quantity, space);
        if (accepted <= 0) return { ok: false, reason: "Warehouse is full" };
        if (own > 0) target.warehouse.reservedIn[job.good] = Math.max(0, own - accepted);
        target.warehouse.stored[job.good] += accepted;
        recordDelivery(job, accepted);
        carrier.cargo.quantity -= accepted;
        job.quantity = carrier.cargo.quantity;
        if (carrier.cargo.quantity <= 0) {
            carrier.cargo = null;
            job.quantity = 0;
            job.targetReserved = false;
            return { ok: true, completed: true, delivered: accepted };
        }
        job.targetReserved = own - accepted > 0;
        return { ok: true, completed: false, delivered: accepted, reason: "Warehouse space exhausted" };
    }
    if (job.to.kind === "construction") {
        if (!target.construction || target.construction.stage >= 3) return { ok: false, reason: "Construction is complete", missing: true };
        markConstructionDelivered(target, job.good, quantity);
        recordDelivery(job, quantity);
        carrier.cargo = null;
        job.quantity = 0;
        return { ok: true, completed: true, delivered: quantity };
    }
    if (job.to.kind === "building") {
        ensureInventory(target);
        if (!target.inventory) return { ok: false, reason: "Destination removed", missing: true };
        const capacity = getInputCapacity(target.type);
        if (capacity <= 0) return { ok: false, reason: "Destination has no input store", missing: true };
        const own = job.targetReserved ? Math.min(cleanQuantity(target.inventory.reservedIn[job.good]), quantity) : 0;
        const other = Math.max(0, totalReservedIn(target.inventory) - own);
        const space = Math.max(0, capacity - usedInput(target) - other);
        const accepted = Math.min(quantity, space);
        if (accepted <= 0) return { ok: false, reason: "Destination input store is full" };
        if (own > 0) releaseInputCapacity(target, job.good, accepted);
        target.inventory.input[job.good] += accepted;
        recordDelivery(job, accepted);
        carrier.cargo.quantity -= accepted;
        job.quantity = carrier.cargo.quantity;
        if (carrier.cargo.quantity <= 0) {
            carrier.cargo = null;
            job.quantity = 0;
            job.targetReserved = false;
            return { ok: true, completed: true, delivered: accepted };
        }
        job.targetReserved = own - accepted > 0;
        return { ok: true, completed: false, delivered: accepted, reason: "Input store is full" };
    }
    return { ok: false, reason: "Unknown destination", missing: true };
}
function completeJob(job) {
    job.status = "done";
    job.reason = null;
    job.sourceReserved = false;
    job.targetReserved = false;
    if (job.delivered > 0) job.quantity = job.delivered;
    removeCarrier(job);
    ensureCityState().logistics.stats.carriers = Math.max(cleanQuantity(ensureCityState().logistics.stats.carriers), ensureCityState().logistics.carriers.length);
}
function returnCargo(job, carrier) {
    const cargo = carrier?.cargo;
    if (!cargo || cleanQuantity(cargo.quantity) <= 0) return true;
    const quantity = cleanQuantity(cargo.quantity);
    releaseTargetReservation(job, job.quantity);
    job.targetReserved = false;
    if (job.good === "bread") {
        const warehouse = getWarehouses().find(entry => entry.warehouse.filters.includes(job.good));
        if (!warehouse) return false;
        recordGoodMovement({ type: "consumed", good: "bread", quantity, from: { kind: "warehouse", id: job.to?.id || job.from?.id || "unknown" }, to: { kind: "realm", id: "food-store" }, cause: "bread-converted-to-food", jobId: job.id });
        recordResourceMovement("food", quantity, "bread-delivered", { to: { kind: "realm", id: "royal-stores" }, jobId: job.id });
        addResource("food", quantity);
        recordDelivery(job, quantity);
        carrier.cargo = null;
        job.quantity = 0;
        return true;
    }
    let remaining = quantity;
    const warehouses = getWarehouses().filter(entry => entry.warehouse.filters.includes(job.good))
        .sort((a, b) => Math.hypot(a.x - carrier.x, a.y - carrier.y) - Math.hypot(b.x - carrier.x, b.y - carrier.y) || String(a.id).localeCompare(String(b.id)));
    for (const warehouse of warehouses) {
        const amount = depositToWarehouse(warehouse, job.good, remaining);
        if (amount <= 0) continue;
        remaining -= amount;
        if (remaining <= 0) break;
    }
    if (remaining > 0) {
        carrier.cargo.quantity = remaining;
        job.quantity = remaining;
        return false;
    }
    carrier.cargo = null;
    job.quantity = 0;
    return true;
}
function retargetWarehouse(job, origin = null) {
    const quantity = cleanQuantity(job.quantity);
    if (quantity <= 0) return false;
    const isBread = job.good === "bread";
    const carrier = activeCarrier(job);
    const from = origin || (carrier ? { x: carrier.x, y: carrier.y } : (waypoint(job.from) || waypoint(job.to) || { x: 0, y: 0 }));
    const warehouse = pickWarehouse(job.good, quantity, from, { requireSpace: !isBread, avoidId: job.to?.id || null });
    if (!warehouse) return false;
    releaseTargetReservation(job, job.quantity);
    job.targetReserved = false;
    job.to = { kind: "warehouse", id: warehouse.id };
    if (!isBread) {
        warehouse.warehouse.reservedIn[job.good] += quantity;
        job.targetReserved = true;
    }
    job.status = "assigned";
    job.reason = null;
    job.retryAt = 0;
    return true;
}
function cancelJob(job, reason) {
    if (!isActive(job)) return true;
    // Recovery may zero quantity/picked while depositing cargo, so the amount
    // owed to the target is captured before any stock moves.
    const releaseQuantity = Math.max(cleanQuantity(job.quantity), cleanQuantity(job.picked), cleanQuantity(job.reserved));
    const carrier = activeCarrier(job);
    if (carrier?.cargo && cleanQuantity(carrier.cargo.quantity) > 0) {
        if (!returnCargo(job, carrier)) {
            job.status = "blocked";
            job.reason = "Cargo awaiting warehouse space";
            job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
            carrier.status = "blocked";
            return false;
        }
    } else if (!carrier && job.picked > 0) {
        // A missing carrier must not erase already-picked cargo. Restore the
        // picked quantity to a warehouse before retiring the job.
        if (!recoverVirtualCargo(job)) {
            job.status = "blocked";
            job.reason = "Cargo awaiting warehouse space";
            job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
            return false;
        }
    }
    if (job.picked > 0) releaseTargetReservation(job, releaseQuantity);
    else {
        releaseSourceReservation(job, releaseQuantity);
        releaseTargetReservation(job, releaseQuantity);
    }
    job.status = "cancelled";
    job.reason = reason;
    job.sourceReserved = false;
    job.targetReserved = false;
    removeCarrier(job);
    return true;
}
function recoverVirtualCargo(job) {
    const quantity = cleanQuantity(job.picked);
    if (quantity <= 0) return true;
    if (job.good === "bread") {
        if (!getWarehouses().some(warehouse => warehouse.warehouse.filters.includes(job.good))) return false;
        recordGoodMovement({ type: "consumed", good: "bread", quantity, from: { kind: "warehouse", id: job.to?.id || job.from?.id || "unknown" }, to: { kind: "realm", id: "food-store" }, cause: "bread-converted-to-food", jobId: job.id });
        recordResourceMovement("food", quantity, "bread-delivered", { to: { kind: "realm", id: "royal-stores" }, jobId: job.id });
        addResource("food", quantity);
        recordDelivery(job, quantity);
        job.picked = 0;
        job.quantity = 0;
        return true;
    }
    let remaining = quantity;
    for (const warehouse of getWarehouses().filter(entry => entry.warehouse.filters.includes(job.good))) {
        const amount = depositToWarehouse(warehouse, job.good, remaining);
        if (amount <= 0) continue;
        remaining -= amount;
        if (remaining <= 0) break;
    }
    job.picked = remaining;
    job.quantity = remaining;
    return remaining === 0;
}
function spawnCarrier(job) {
    const city = ensureCityState();
    if (city.logistics.carriers.length >= MAX_CARRIERS) {
        job.reason = "All carriers are busy";
        job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
        return null;
    }
    const source = entityFromRef(job.from), destination = entityFromRef(job.to);
    if (!source) { job.reason = "Source removed"; job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS; return null; }
    if (!destination) { job.reason = "Destination removed"; job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS; return null; }
    const start = nearestWalkable(source.x, source.y);
    let end = nearestWalkable(destination.x, destination.y);
    let path = findPath(start.x, start.y, end.x, end.y, 2400);
    if (!path && (Math.abs(start.x - end.x) > 1 || Math.abs(start.y - end.y) > 1) && job.to.kind === "warehouse") {
        // The nearest store is not reachable. Pick a reachable alternative
        // instead of blocking a carrier on a destination it can never serve.
        if (retargetWarehouse(job, source)) {
            const newTarget = entityFromRef(job.to);
            end = nearestWalkable(newTarget.x, newTarget.y);
            path = findPath(start.x, start.y, end.x, end.y, 2400);
        }
    }
    if (!path && (Math.abs(start.x - end.x) > 1 || Math.abs(start.y - end.y) > 1)) {
        job.reason = "No overland route";
        job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
        rejectOrder("No overland route to " + refName(job.to), job.kind, job.good);
        return null;
    }
    const carrier = {
        id: "c" + city.logistics.nextCarrierId++, jobId: job.id, x: start.x, y: start.y,
        home: { x: start.x, y: start.y }, path: path || [], pathIndex: 0,
        pathVersion: (state.buildingCollisionVersion || 0) + ":" + (state.roads?.revision || 0),
        status: "to-destination", cargo: null, speed: 1.9
    };
    city.logistics.carriers.push(carrier);
    city.logistics.stats.carriers = Math.max(cleanQuantity(city.logistics.stats.carriers), city.logistics.carriers.length);
    job.carrierId = carrier.id;
    job.status = "assigned";
    job.reason = null;
    return carrier;
}
function assignPendingJobs() {
    const city = ensureCityState();
    const pending = city.logistics.jobs.filter(job => job.status === "pending" && (job.retryAt || 0) <= (state.tick || 0))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.createdTick - b.createdTick || String(a.id).localeCompare(String(b.id)));
    for (const job of pending) {
        if (city.logistics.carriers.length >= MAX_CARRIERS) break;
        if (!entityFromRef(job.from)) {
            job.attempts = (job.attempts || 0) + 1;
            cancelJob(job, "Source removed");
            continue;
        }
        if (!entityFromRef(job.to)) {
            if (job.to.kind === "warehouse" && job.kind === "haul" && retargetWarehouse(job)) {
                // Retargeting succeeded; continue with the new destination.
            } else {
                cancelJob(job, "Destination removed");
                continue;
            }
        }
        const carrier = spawnCarrier(job);
        if (!carrier) {
            job.attempts = (job.attempts || 0) + 1;
            job.status = "pending";
            if (job.attempts >= MAX_JOB_ATTEMPTS) cancelJob(job, job.reason || "No route after retries");
            continue;
        }
        const moved = takeFromSource(job);
        if (moved <= 0) {
            city.logistics.carriers = city.logistics.carriers.filter(entry => entry.id !== carrier.id);
            job.carrierId = null;
            job.status = "pending";
            job.reason = "Source stock unavailable";
            job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
            job.attempts = (job.attempts || 0) + 1;
            if (job.attempts >= MAX_JOB_ATTEMPTS) cancelJob(job, "Source stock unavailable");
            continue;
        }
        carrier.cargo = { good: job.good, quantity: moved };
        carrier.status = "to-destination";
        job.status = "assigned";
        job.attempts = 0;
        job.reason = null;
        const destination = entityFromRef(job.to);
        if (destination) {
            const end = nearestWalkable(destination.x, destination.y);
            carrier.path = findPath(carrier.x, carrier.y, end.x, end.y, 2400) || [];
            carrier.pathIndex = 0;
        }
    }
}
function retryBlockedJobs() {
    const city = ensureCityState();
    const blocked = city.logistics.jobs.filter(job => job.status === "blocked" && (job.retryAt || 0) <= (state.tick || 0))
        .sort((a, b) => a.createdTick - b.createdTick || String(a.id).localeCompare(String(b.id)));
    for (const job of blocked) {
        const carrier = activeCarrier(job);
        if (!carrier) {
            if (job.picked > 0) {
                if (recoverVirtualCargo(job)) cancelJob(job, "Cargo recovered from missing carrier");
                else {
                    job.reason = "Cargo awaiting warehouse space";
                    job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                }
            } else {
                job.status = "pending";
                job.carrierId = null;
                job.reason = null;
                job.retryAt = 0;
            }
            continue;
        }
        if (!carrier.cargo || cleanQuantity(carrier.cargo.quantity) <= 0) {
            if (job.delivered > 0) completeJob(job);
            else {
                job.status = "pending";
                job.carrierId = null;
                job.reason = null;
                job.retryAt = 0;
            }
            continue;
        }
        const target = entityFromRef(job.to);
        if (!target) {
            if (job.to.kind === "warehouse" && retargetWarehouse(job)) {
                carrier.path = [];
                carrier.pathIndex = 0;
                carrier.pathVersion = "";
                carrier.status = "to-destination";
                continue;
            }
            if (returnCargo(job, carrier)) cancelJob(job, "Destination removed");
            else {
                job.reason = "No warehouse space to return cargo";
                job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
            }
            continue;
        }
        const result = deliverToDestination(job, carrier);
        if (result.ok) {
            if (!carrier.cargo) completeJob(job);
            else {
                job.status = "blocked";
                job.reason = result.reason || "Destination cannot accept all cargo";
                job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                carrier.status = "blocked";
                carrier.path = [];
            }
            continue;
        }
        job.attempts = (job.attempts || 0) + 1;
        if (result.missing) {
            if (job.to.kind === "warehouse" && retargetWarehouse(job)) {
                carrier.path = [];
                carrier.pathIndex = 0;
                carrier.pathVersion = "";
                carrier.status = "to-destination";
                continue;
            }
            if (returnCargo(job, carrier)) { cancelJob(job, result.reason); continue; }
        }
        if (job.to.kind === "warehouse" && job.attempts >= 2 && retargetWarehouse(job)) {
            carrier.path = [];
            carrier.pathIndex = 0;
            carrier.pathVersion = "";
            carrier.status = "to-destination";
            continue;
        }
        if (job.attempts >= 3 && returnCargo(job, carrier)) {
            cancelJob(job, result.reason);
            continue;
        }
        job.status = "blocked";
        job.reason = result.reason;
        job.retryAt = (state.tick || 0) + (job.attempts >= 6 ? 120 : JOB_RETRY_TICKS);
        carrier.status = "blocked";
        carrier.path = [];
    }
}
function sweepCarriers() {
    const city = ensureCityState();
    city.logistics.carriers = city.logistics.carriers.filter(carrier => {
        const job = city.logistics.jobs.find(entry => entry.id === carrier.jobId);
        if (!job || !isActive(job)) return false;
        if (job.carrierId && job.carrierId !== carrier.id) return false;
        return true;
    });
}

export function updateLogistics() {
    const city = ensureCityState();
    if (!city.enabled) return null;
    if (state.tick <= 0 || state.tick % 2 !== 0) return null;
    const logistics = city.logistics;
    logistics.lastTick = state.tick;
    ensureAllInventories();
    sweepCarriers();
    for (const job of [...logistics.jobs]) {
        if (!isActive(job)) continue;
        if ((state.tick || 0) - (job.createdTick || 0) > JOB_EXPIRE_TICKS) {
            if (!cancelJob(job, "Delivery expired")) {
                job.reason = "Delivery expired · cargo awaiting warehouse space";
                job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
            }
            continue;
        }
        const carrier = activeCarrier(job);
        if (!carrier && job.status === "assigned") {
            if (job.picked > 0) {
                if (recoverVirtualCargo(job)) cancelJob(job, "Cargo recovered from missing carrier");
                else {
                    job.status = "blocked";
                    job.reason = "Cargo awaiting warehouse space";
                    job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                }
            } else {
                job.status = "pending";
                job.carrierId = null;
                job.reason = "Carrier missing";
                job.retryAt = 0;
            }
        }
    }
    retryBlockedJobs();
    assignPendingJobs();
    trimJobs();
    return getLogisticsSnapshot();
}

export function updateLogisticsMovement(deltaSeconds) {
    const city = ensureCityState();
    if (!city.enabled || deltaSeconds <= 0 || deltaSeconds > 0.2) return;
    const logistics = city.logistics;
    const version = (state.buildingCollisionVersion || 0) + ":" + (state.roads?.revision || 0);
    for (const carrier of [...logistics.carriers]) {
        const job = logistics.jobs.find(item => item.id === carrier.jobId);
        if (!job || !isActive(job)) {
            logistics.carriers = logistics.carriers.filter(item => item.id !== carrier.id);
            continue;
        }
        if (job.status === "blocked") continue;
        if (carrier.pathVersion !== version) { carrier.path = []; carrier.pathVersion = version; }
        if (!carrier.path?.length) {
            const destination = entityFromRef(job.to);
            if (!destination) {
                job.status = "blocked";
                job.reason = "Destination removed";
                job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                carrier.status = "blocked";
                continue;
            }
            const end = nearestWalkable(destination.x, destination.y);
            const distance = Math.hypot(carrier.x - end.x, carrier.y - end.y);
            if (distance <= 1.35) {
                const result = deliverToDestination(job, carrier);
                if (result.ok && !carrier.cargo) completeJob(job);
                else if (!result.ok) {
                    job.status = "blocked";
                    job.reason = result.reason;
                    job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                    carrier.status = "blocked";
                } else {
                    job.status = "blocked";
                    job.reason = result.reason || "Destination cannot accept all cargo";
                    job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                    carrier.status = "blocked";
                    carrier.path = [];
                }
                continue;
            }
            carrier.path = findPath(carrier.x, carrier.y, end.x, end.y, 2400) || [];
            carrier.pathIndex = 0;
            if (!carrier.path.length) {
                job.status = "blocked";
                job.reason = "No overland route";
                job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                carrier.status = "blocked";
                continue;
            }
        }
        let remaining = carrier.speed * getRoadSpeedMultiplier(carrier.x, carrier.y) * deltaSeconds;
        while (remaining > 0 && carrier.pathIndex < carrier.path.length) {
            const node = carrier.path[carrier.pathIndex];
            const dx = node.x - carrier.x, dy = node.y - carrier.y, distance = Math.hypot(dx, dy);
            if (distance <= 0.001) { carrier.pathIndex++; continue; }
            if (distance <= remaining) {
                carrier.x = node.x; carrier.y = node.y; remaining -= distance; carrier.pathIndex++;
            } else {
                carrier.x += dx / distance * remaining;
                carrier.y += dy / distance * remaining;
                remaining = 0;
            }
        }
        if (carrier.pathIndex >= (carrier.path?.length || 0)) {
            const result = deliverToDestination(job, carrier);
            if (result.ok && !carrier.cargo) completeJob(job);
            else {
                job.status = "blocked";
                job.reason = result.ok ? (result.reason || "Destination cannot accept all cargo") : result.reason;
                job.retryAt = (state.tick || 0) + JOB_RETRY_TICKS;
                carrier.status = "blocked";
                carrier.path = [];
            }
        }
    }
}

export function getLogisticsSnapshot() {
    const city = ensureCityState();
    const active = city.logistics.jobs.filter(isActive);
    const counts = { pending: 0, assigned: 0, blocked: 0, done: 0, cancelled: 0 };
    for (const job of city.logistics.jobs) counts[job.status] = (counts[job.status] || 0) + 1;
    const ledger = city.logistics.ledger.slice(-SNAPSHOT_LEDGER_LIMIT).map(entry => ({ ...entry }));
    const copyJob = job => ({
        ...job, from: { ...job.from }, to: { ...job.to },
        quantity: cleanQuantity(job.quantity), reserved: cleanQuantity(job.reserved),
        picked: cleanQuantity(job.picked), delivered: cleanQuantity(job.delivered)
    });
    const finished = city.logistics.jobs.filter(job => !isActive(job));
    return {
        jobs: active.map(copyJob),
        completed: finished.slice(-24).map(copyJob),
        jobCount: city.logistics.jobs.length,
        jobLimit: MAX_LOGISTICS_JOBS,
        carriers: city.logistics.carriers.map(carrier => ({ ...carrier, path: undefined })),
        counts, warehouses: getWarehouseSnapshot(), stats: { ...city.logistics.stats },
        ledger, ledgerSize: city.logistics.ledger.length, ledgerLimit: LEDGER_LIMIT,
        audit: getGoodsAudit(), lastRejection: city.logistics.lastRejection || null,
        routeCacheSize: routeCache.size
    };
}

export function getBuildingLogisticsStatus(entity) {
    if (!entity) return null;
    return ensureCityState().logistics.jobs
        .filter(job => isActive(job) && (job.from?.id === entity.id || job.to?.id === entity.id))
        .map(job => ({
            id: job.id, kind: job.kind, good: job.good, quantity: job.quantity,
            delivered: job.delivered || 0, status: job.status, reason: job.reason,
            carrierId: job.carrierId, attempts: job.attempts || 0
        }));
}

export function getBuildingSupplyReason(entity) {
    const recipe = RECIPES[entity?.type];
    if (!recipe) return null;
    ensureInventory(entity);
    if (recipe.input) {
        for (const [good, amount] of Object.entries(recipe.input)) {
            if (cleanQuantity(entity.inventory.input[good]) < amount) {
                const jobs = getBuildingLogisticsStatus(entity).filter(job => job.good === good && job.kind === "supply");
                if (jobs.length) return "Waiting for " + GOODS[good].plural + " delivery";
                if (getAvailableWarehouseStock(good) <= 0) return "No " + GOODS[good].plural + " in reachable stores";
                return "Waiting for a carrier for " + GOODS[good].plural;
            }
        }
    }
    if (recipe.output) {
        const space = outputSpace(entity);
        if (space <= 0) return "Output store is full";
        return null;
    }
    return null;
}

export function resourceNodeSummary(entity) {
    if (!entity?.isBuilding?.()) return null;
    try {
        const node = getResourceNodeAt(entity.x, entity.y);
        if (!node) return null;
        return { forest: node.forestStock, stone: node.stoneStock, water: Boolean(node.waterAccess), fertility: node.fertility };
    } catch { return null; }
}

export function getCitySummary() {
    const city = ensureCityState();
    const warehouses = getWarehouseSnapshot();
    const active = city.logistics.jobs.filter(isActive);
    return {
        enabled: city.enabled,
        warehouses,
        activeJobs: active.length,
        carriers: city.logistics.carriers.length,
        blockedJobs: active.filter(job => job.status === "blocked" || job.reason).length,
        construction: state.entities.filter(entity => !entity.dead && entity.construction && entity.construction.stage < 3).length,
        homes: state.entities.filter(entity => !entity.dead && (entity.type === TYPE.TENT || entity.type === TYPE.HOUSE || entity.type === TYPE.STONE_HOUSE)).length
    };
}

function normalizeJob(job) {
    if (!job || typeof job !== "object") return null;
    const status = JOB_STATUSES.has(job.status) ? job.status : "pending";
    const quantity = cleanQuantity(job.quantity);
    return {
        ...job,
        id: typeof job.id === "string" ? job.id : "j" + Math.random().toString(36).slice(2),
        kind: typeof job.kind === "string" ? job.kind : "haul",
        good: GOOD_KEYS.includes(job.good) ? job.good : "logs",
        quantity,
        reserved: Math.max(quantity, cleanQuantity(job.reserved ?? quantity)),
        picked: cleanQuantity(job.picked),
        delivered: cleanQuantity(job.delivered),
        status,
        reason: typeof job.reason === "string" ? job.reason : null,
        priority: Math.max(0, Math.floor(number(job.priority, priorityFor(job.kind, job.good)))),
        createdTick: Math.max(0, Math.floor(number(job.createdTick))),
        retryAt: Math.max(0, Math.floor(number(job.retryAt))),
        attempts: Math.max(0, Math.floor(number(job.attempts))),
        sourceReserved: Boolean(job.sourceReserved),
        targetReserved: Boolean(job.targetReserved)
    };
}

export function serializeCity() {
    const city = ensureCityState();
    return {
        version: CITY_VERSION,
        enabled: city.enabled,
        constructionVersion: city.constructionVersion || 0,
        logistics: {
            version: LOGISTICS_VERSION, nextJobId: city.logistics.nextJobId, nextCarrierId: city.logistics.nextCarrierId,
            lastTick: city.logistics.lastTick || 0, nextLedgerId: city.logistics.nextLedgerId || 1, stats: { ...city.logistics.stats },
            ledger: city.logistics.ledger.slice(-LEDGER_LIMIT).map(entry => ({ ...entry })),
            audit: JSON.parse(JSON.stringify(city.logistics.audit || {})),
            lastRejection: city.logistics.lastRejection ? { ...city.logistics.lastRejection } : null,
            jobs: city.logistics.jobs.slice(-MAX_LOGISTICS_JOBS).map(job => ({
                id: job.id, kind: job.kind, good: job.good, quantity: job.quantity,
                reserved: job.reserved, picked: job.picked, delivered: job.delivered,
                from: job.from ? { ...job.from } : null, to: job.to ? { ...job.to } : null,
                status: job.status, reason: job.reason || null, carrierId: job.carrierId || null, priority: job.priority, createdTick: job.createdTick,
                retryAt: job.retryAt || 0, attempts: job.attempts || 0,
                sourceReserved: Boolean(job.sourceReserved), targetReserved: Boolean(job.targetReserved)
            })),
            carriers: city.logistics.carriers.slice(-MAX_CARRIERS).map(carrier => ({
                id: carrier.id, jobId: carrier.jobId, x: carrier.x, y: carrier.y,
                home: carrier.home || { x: carrier.x, y: carrier.y },
                pathVersion: carrier.pathVersion || "", status: carrier.status,
                cargo: carrier.cargo ? { ...carrier.cargo } : null, speed: carrier.speed || 1.9
            }))
        },
        fields: city.fields ? JSON.parse(JSON.stringify(city.fields)) : null,
        services: city.services ? JSON.parse(JSON.stringify(city.services)) : null,
        needs: city.needs ? JSON.parse(JSON.stringify(city.needs)) : null
    };
}

export function validateCitySnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Save data contains an invalid city-builder state.");
    if (snapshot.version !== CITY_VERSION) throw new Error("Save data contains an unsupported city-builder version.");
    const logistics = snapshot.logistics;
    if (logistics !== undefined && logistics !== null) {
        if (typeof logistics !== "object" || !Array.isArray(logistics.jobs) || logistics.jobs.length > MAX_LOGISTICS_JOBS) throw new Error("Save data contains an invalid logistics job list.");
        if (!Array.isArray(logistics.carriers) || logistics.carriers.length > MAX_CARRIERS) throw new Error("Save data contains an invalid carrier list.");
        if (logistics.ledger !== undefined && (!Array.isArray(logistics.ledger) || logistics.ledger.length > LEDGER_LIMIT)) throw new Error("Save data contains an invalid movement ledger.");
        for (const entry of logistics.ledger || []) {
            if (!entry || typeof entry !== "object") throw new Error("Save data contains an invalid movement ledger entry.");
            const scope = entry.scope === "resource" ? "resource" : "good";
            const validGood = scope === "resource" ? entry.good === "food" : GOOD_KEYS.includes(entry.good);
            if (!validGood) throw new Error("Save data contains an invalid movement ledger entry.");
            if (!Number.isFinite(Number(entry.quantity)) || Number(entry.quantity) < 0) throw new Error("Save data contains an invalid movement amount.");
            if (entry.scope !== undefined && entry.scope !== "good" && entry.scope !== "resource") throw new Error("Save data contains an invalid movement scope.");
        }
        for (const bucket of ["opening", "produced", "consumed"]) {
            const totals = logistics.audit?.[bucket];
            if (totals === undefined) continue;
            if (!totals || typeof totals !== "object" || Array.isArray(totals)) throw new Error("Save data contains an invalid goods audit.");
            for (const [good, quantity] of Object.entries(totals)) {
                if (!GOOD_KEYS.includes(good) && good !== "food") continue;
                if (!Number.isFinite(Number(quantity)) || Number(quantity) < 0) throw new Error("Save data contains an invalid goods audit amount.");
            }
        }
        const ids = new Set();
        for (const job of logistics.jobs) {
            if (!job || typeof job !== "object" || !GOOD_KEYS.includes(job.good)) throw new Error("Save data contains an invalid delivery job.");
            if (typeof job.id !== "string" || !job.id || ids.has(job.id)) throw new Error("Save data contains an invalid or duplicate delivery job id.");
            ids.add(job.id);
            for (const key of ["quantity", "reserved", "picked", "delivered"]) {
                if (job[key] !== undefined && (!Number.isFinite(Number(job[key])) || Number(job[key]) < 0)) throw new Error("Save data contains an invalid delivery amount.");
            }
            if (job.status !== undefined && !JOB_STATUSES.has(job.status)) throw new Error("Save data contains an unknown delivery job status.");
            if (!job.from || !job.to || typeof job.from !== "object" || typeof job.to !== "object") throw new Error("Save data contains a job without endpoints.");
            if (typeof job.from.kind !== "string" || typeof job.to.kind !== "string" || typeof job.from.id !== "string" || typeof job.to.id !== "string") throw new Error("Save data contains invalid job endpoints.");
        }
        for (const carrier of logistics.carriers) {
            if (!carrier || !Number.isFinite(Number(carrier.x)) || !Number.isFinite(Number(carrier.y))) throw new Error("Save data contains an invalid carrier.");
            if (carrier.cargo && (!GOOD_KEYS.includes(carrier.cargo.good) || !Number.isFinite(Number(carrier.cargo.quantity)) || Number(carrier.cargo.quantity) < 0)) throw new Error("Save data contains invalid carrier cargo.");
        }
    }
    for (const key of ["fields", "services", "needs"]) {
        if (snapshot[key] !== undefined && snapshot[key] !== null && (typeof snapshot[key] !== "object" || Array.isArray(snapshot[key]))) throw new Error("Save data contains invalid " + key + " state.");
    }
    return true;
}

export function restoreCity(snapshot) {
    ensureCityState();
    validateCitySnapshot(snapshot);
    const city = state.city;
    if (!snapshot) {
        city.fields = null; city.services = null; city.needs = null;
        city.logistics = { version: LOGISTICS_VERSION, nextJobId: 1, nextCarrierId: 1, jobs: [], carriers: [], lastTick: 0, stats: {} };
        ensureAllInventories();
        return city;
    }
    city.enabled = Boolean(snapshot.enabled);
    city.constructionVersion = Math.max(0, Math.floor(number(snapshot.constructionVersion)));
    const saved = snapshot.logistics || {};
    const jobs = Array.isArray(saved.jobs) ? saved.jobs.map(normalizeJob).filter(Boolean) : [];
    const carriers = Array.isArray(saved.carriers) ? saved.carriers.map(carrier => ({
        ...carrier,
        x: number(carrier.x), y: number(carrier.y),
        home: carrier.home ? { x: number(carrier.home.x), y: number(carrier.home.y) } : { x: number(carrier.x), y: number(carrier.y) },
        path: [], pathIndex: 0, pathVersion: "",
        status: carrier.status || "to-destination",
        cargo: carrier.cargo && GOOD_KEYS.includes(carrier.cargo.good) ? { good: carrier.cargo.good, quantity: cleanQuantity(carrier.cargo.quantity) } : null,
        speed: Math.max(0.5, Math.min(4, number(carrier.speed, 1.9)))
    })) : [];
    for (const carrier of carriers) {
        const job = jobs.find(entry => entry.id === carrier.jobId);
        if (job) job.carrierId = carrier.id;
    }
    city.logistics = {
        version: LOGISTICS_VERSION,
        nextJobId: Math.max(1, Math.floor(number(saved.nextJobId, 1))),
        nextCarrierId: Math.max(1, Math.floor(number(saved.nextCarrierId, 1))),
        nextLedgerId: Math.max(1, Math.floor(number(saved.nextLedgerId, 1))),
        lastTick: Math.max(0, Math.floor(number(saved.lastTick))),
        stats: saved.stats && typeof saved.stats === "object" ? { ...saved.stats } : {},
        ledger: Array.isArray(saved.ledger) ? saved.ledger.filter(entry => entry && typeof entry === "object").slice(-LEDGER_LIMIT).map(entry => ({ ...entry })) : [],
        audit: saved.audit && typeof saved.audit === "object" ? JSON.parse(JSON.stringify(saved.audit)) : null,
        lastRejection: saved.lastRejection && typeof saved.lastRejection === "object" ? { ...saved.lastRejection } : null,
        jobs, carriers
    };
    city.fields = snapshot.fields && typeof snapshot.fields === "object" ? JSON.parse(JSON.stringify(snapshot.fields)) : null;
    city.services = snapshot.services && typeof snapshot.services === "object" ? JSON.parse(JSON.stringify(snapshot.services)) : null;
    city.needs = snapshot.needs && typeof snapshot.needs === "object" ? JSON.parse(JSON.stringify(snapshot.needs)) : null;
    ensureAllInventories();
    // Capture this before rebuilding reservations: ensuring the book during
    // the rebuild would create an empty audit and hide the missing one.
    const hadSavedAudit = Boolean(city.logistics.audit);
    rebuildLogisticsReservations();
    normalizeLegacyWarehouseCapacity();
    if (!hadSavedAudit) {
        // A legacy save predates the goods book. Its current stock becomes the
        // opening balance, so later production and consumption still reconcile.
        setAuditOpening(getPhysicalStockMap());
    }
    return city;
}

export function rebuildLogisticsReservations() {
    const city = ensureCityState();
    ensureAllInventories();
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        for (const key of GOOD_KEYS) {
            entity.inventory.reservedIn[key] = 0;
            entity.inventory.reservedOut[key] = 0;
            if (entity.warehouse) {
                entity.warehouse.reservedIn[key] = 0;
                entity.warehouse.reservedOut[key] = 0;
            }
        }
    }
    const jobs = city.logistics.jobs.filter(isActive)
        .sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0) || String(a.id).localeCompare(String(b.id)));
    for (const job of jobs) {
        const carrier = city.logistics.carriers.find(entry => entry.id === job.carrierId);
        if (carrier?.cargo && cleanQuantity(carrier.cargo.quantity) > 0 && cleanQuantity(job.picked) <= 0) job.picked = cleanQuantity(carrier.cargo.quantity);
        if (job.quantity <= 0 && job.picked > 0) job.quantity = job.picked;
        const remaining = cleanQuantity(job.quantity);
        if (remaining <= 0) continue;
        if (cleanQuantity(job.picked) <= 0) {
            const source = entityFromRef(job.from);
            if (source?.inventory) {
                if (job.from.kind === "warehouse" && isWarehouse(source)) {
                    const available = Math.max(0, cleanQuantity(source.warehouse.stored[job.good]) - cleanQuantity(source.warehouse.reservedOut[job.good]));
                    const reserved = Math.min(remaining, available);
                    if (reserved > 0) {
                        source.warehouse.reservedOut[job.good] += reserved;
                        job.sourceReserved = true;
                    }
                } else if (job.from.kind === "building") {
                    const available = Math.max(0, cleanQuantity(source.inventory.output[job.good]) - cleanQuantity(source.inventory.reservedOut[job.good]));
                    const reserved = Math.min(remaining, available);
                    if (reserved > 0) {
                        source.inventory.reservedOut[job.good] += reserved;
                        job.sourceReserved = true;
                    }
                }
            }
        }
        if (job.to.kind === "warehouse" && job.good !== "bread") {
            const target = entityFromRef(job.to);
            if (isWarehouse(target)) {
                const reserved = Math.min(remaining, getWarehouseSpace(target));
                if (reserved > 0) {
                    target.warehouse.reservedIn[job.good] += reserved;
                    job.targetReserved = true;
                }
            }
        } else if (job.to.kind === "building" && job.kind === "supply") {
            const target = entityFromRef(job.to);
            if (target?.inventory) {
                const free = Math.max(0, getInputCapacity(target.type) - usedInput(target) - totalReservedIn(target.inventory));
                const reserved = Math.min(remaining, free);
                if (reserved > 0) {
                    target.inventory.reservedIn[job.good] += reserved;
                    job.targetReserved = true;
                }
            }
        }
    }
}

// A newly founded realm opens its books with whatever the starting stores
// already hold. Without this, the initial royal granary would look like
// unbooked production for the rest of the campaign.
export function openGoodsBookForNewRealm() {
    setAuditOpening(getPhysicalStockMap());
    return getGoodsAudit();
}

export function initializeCityForRealm({ seedWarehouse = true } = {}) {
    const city = ensureCityState();
    city.enabled = true;
    ensureAllInventories();
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        if (!entity.construction) entity.construction = null;
        if (entity.type === TYPE.KEEP && seedWarehouse && warehouseUsed(entity) === 0) {
            const seed = { planks: 28, cutStone: 24, firewood: 30, water: 20, grain: 20, flour: 10, logs: 8 };
            for (const [good, quantity] of Object.entries(seed)) {
                entity.warehouse.stored[good] = Math.max(entity.warehouse.stored[good], quantity);
                recordGoodMovement({ type: "produced", good, quantity, to: { kind: "warehouse", id: entity.id }, cause: "realm-seed" });
            }
        }
    }
    rebuildLogisticsReservations();
    return city;
}

export function evacuateBuildingInventory(entity) {
    if (!entity || !entity.isBuilding() || entity.dead) return { ok: true, moved: 0, remaining: {} };
    ensureInventory(entity);
    const pools = isWarehouse(entity)
        ? [{ map: entity.warehouse.stored, warehouse: true }]
        : [{ map: entity.inventory.output, warehouse: false }, { map: entity.inventory.input, warehouse: false }];
    let moved = 0;
    const remaining = {};
    for (const pool of pools) {
        for (const good of GOOD_KEYS) {
            let left = cleanQuantity(pool.map[good]);
            if (left <= 0) continue;
            const targets = getWarehouses().filter(warehouse => warehouse !== entity && warehouse.warehouse.filters.includes(good))
                .sort((a, b) => Math.hypot(a.x - entity.x, a.y - entity.y) - Math.hypot(b.x - entity.x, b.y - entity.y) || String(a.id).localeCompare(String(b.id)));
            for (const warehouse of targets) {
                const amount = depositToWarehouse(warehouse, good, left);
                if (amount <= 0) continue;
                pool.map[good] -= amount;
                left -= amount;
                moved += amount;
                recordGoodMovement({ type: "evacuated", good, quantity: amount, from: { kind: "building", id: entity.id }, to: { kind: "warehouse", id: warehouse.id }, cause: "demolition-evacuation" });
                if (left <= 0) break;
            }
            if (left > 0) remaining[good] = (remaining[good] || 0) + left;
        }
    }
    for (const [good, quantity] of Object.entries(remaining)) {
        recordGoodMovement({ type: "lost", good, quantity, from: { kind: "building", id: entity.id }, cause: "demolition-loss" });
    }
    return { ok: Object.keys(remaining).length === 0, moved, remaining };
}

export function isCityBuilding(type) {
    return CITY_TYPES.has(type);
}
