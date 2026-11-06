// Physical settlement logistics: local inventories, bounded warehouses,
// reserved delivery jobs and visible carriers. Gameplay never moves a good
// directly from one producer to a consumer; a carrier job owns that movement.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { BUILDING_SIZE } from "../core/config.js";
import { addResource } from "./resources.js";
import { getResourceNodeAt } from "./resource-geography.js";
import { findPath, isWalkable, rebuildBlockedBuildingTiles } from "../simulation/villagers.js";
import { getRoadSpeedMultiplier } from "./roads.js";
import { GOOD_KEYS, GOODS, CITY_VERSION, NEW_BUILDING_TYPES, RECIPES } from "./city-config.js";

export const WAREHOUSE_CAPACITY = Object.freeze({ [TYPE.KEEP]: 320, [TYPE.WAREHOUSE]: 180 });
export const CARRIER_CAPACITY = 8;
export const MAX_CARRIERS = 6;
export const MAX_LOGISTICS_JOBS = 72;
export const JOB_RETRY_TICKS = 30;
export const JOB_EXPIRE_TICKS = 900;
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

export function ensureCityState() {
    if (!state.city || typeof state.city !== "object") state.city = {};
    const city = state.city;
    city.version = CITY_VERSION;
    city.enabled = Boolean(city.enabled);
    city.constructionVersion = Math.max(0, Math.floor(number(city.constructionVersion)));
    if (!city.logistics || typeof city.logistics !== "object") {
        city.logistics = { version: 1, nextJobId: 1, nextCarrierId: 1, jobs: [], carriers: [], lastTick: 0, stats: {} };
    }
    const logistics = city.logistics;
    logistics.version = 1;
    logistics.nextJobId = Math.max(1, Math.floor(number(logistics.nextJobId, 1)));
    logistics.nextCarrierId = Math.max(1, Math.floor(number(logistics.nextCarrierId, 1)));
    logistics.jobs = Array.isArray(logistics.jobs) ? logistics.jobs.filter(job => job && typeof job === "object").slice(-MAX_LOGISTICS_JOBS) : [];
    logistics.carriers = Array.isArray(logistics.carriers) ? logistics.carriers.filter(carrier => carrier && typeof carrier === "object").slice(-MAX_CARRIERS) : [];
    logistics.lastTick = Math.max(0, Math.floor(number(logistics.lastTick)));
    logistics.stats = logistics.stats && typeof logistics.stats === "object" ? logistics.stats : {};
    return city;
}

export function ensureInventory(entity) {
    if (!entity || !entity.isBuilding?.()) return null;
    if (!entity.inventory || typeof entity.inventory !== "object") entity.inventory = {};
    const inventory = entity.inventory;
    inventory.version = 1;
    inventory.input = inventory.input && typeof inventory.input === "object" ? inventory.input : {};
    inventory.output = inventory.output && typeof inventory.output === "object" ? inventory.output : {};
    inventory.reservedIn = inventory.reservedIn && typeof inventory.reservedIn === "object" ? inventory.reservedIn : {};
    inventory.reservedOut = inventory.reservedOut && typeof inventory.reservedOut === "object" ? inventory.reservedOut : {};
    for (const key of GOOD_KEYS) {
        inventory.input[key] = cleanQuantity(inventory.input[key]);
        inventory.output[key] = cleanQuantity(inventory.output[key]);
        inventory.reservedIn[key] = cleanQuantity(inventory.reservedIn[key]);
        inventory.reservedOut[key] = cleanQuantity(inventory.reservedOut[key]);
    }
    if (entity.type === TYPE.WAREHOUSE || entity.type === TYPE.KEEP) {
        if (!entity.warehouse || typeof entity.warehouse !== "object") entity.warehouse = {};
        entity.warehouse.capacity = Math.max(1, Math.floor(number(entity.warehouse.capacity, WAREHOUSE_CAPACITY[entity.type] || 180)));
        entity.warehouse.stored = entity.warehouse.stored && typeof entity.warehouse.stored === "object" ? entity.warehouse.stored : {};
        entity.warehouse.filters = Array.isArray(entity.warehouse.filters) ? entity.warehouse.filters.filter(key => GOOD_KEYS.includes(key)) : [...GOOD_KEYS];
        for (const key of GOOD_KEYS) entity.warehouse.stored[key] = cleanQuantity(entity.warehouse.stored[key]);
    }
    return inventory;
}

export function ensureAllInventories() {
    for (const entity of state.entities) if (!entity.dead && entity.isBuilding()) ensureInventory(entity);
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
export function getWarehouseStock(good) {
    return getWarehouses().reduce((sum, warehouse) => sum + cleanQuantity(warehouse.warehouse?.stored?.[good]), 0);
}
export function getWarehouseSnapshot() {
    const rows = getWarehouses().map(warehouse => ({
        id: warehouse.id, x: warehouse.x, y: warehouse.y, type: warehouse.type,
        capacity: warehouse.warehouse.capacity, used: warehouseUsed(warehouse),
        stored: { ...warehouse.warehouse.stored }
    }));
    return { rows, used: rows.reduce((sum, row) => sum + row.used, 0), capacity: rows.reduce((sum, row) => sum + row.capacity, 0), stock: Object.fromEntries(GOOD_KEYS.map(key => [key, getWarehouseStock(key)])) };
}
export function getWarehouseSpace(warehouse) {
    ensureInventory(warehouse);
    return Math.max(0, warehouse.warehouse.capacity - warehouseUsed(warehouse));
}
export function depositGood(good, quantity, x = 0, y = 0) {
    let remaining = cleanQuantity(quantity);
    if (!GOOD_KEYS.includes(good) || remaining <= 0) return 0;
    const warehouses = getWarehouses().filter(warehouse => warehouse.warehouse.filters.includes(good))
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || String(a.id).localeCompare(String(b.id)));
    let moved = 0;
    for (const warehouse of warehouses) {
        const space = getWarehouseSpace(warehouse);
        const amount = Math.min(space, remaining);
        if (amount <= 0) continue;
        warehouse.warehouse.stored[good] += amount;
        moved += amount; remaining -= amount;
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
        const available = cleanQuantity(warehouse.warehouse.stored[good]);
        const amount = Math.min(available, remaining);
        if (amount <= 0) continue;
        warehouse.warehouse.stored[good] -= amount;
        moved += amount; remaining -= amount;
        if (remaining <= 0) break;
    }
    return moved;
}
export function getInventorySummary(entity) {
    if (!entity || !entity.isBuilding()) return null;
    ensureInventory(entity);
    if (isWarehouse(entity)) return { kind: "warehouse", capacity: entity.warehouse.capacity, used: warehouseUsed(entity), stored: { ...entity.warehouse.stored } };
    return {
        kind: "building",
        input: Object.fromEntries(GOOD_KEYS.filter(key => entity.inventory.input[key] > 0).map(key => [key, entity.inventory.input[key]])),
        output: Object.fromEntries(GOOD_KEYS.filter(key => entity.inventory.output[key] > 0).map(key => [key, entity.inventory.output[key]]))
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
    const used = ensureInventory(entity) ? GOOD_KEYS.reduce((sum, key) => sum + entity.inventory.output[key], 0) : 0;
    return Math.max(0, capacity - used);
}
export function inputSpace(entity) {
    const capacity = getInputCapacity(entity.type);
    const used = ensureInventory(entity) ? GOOD_KEYS.reduce((sum, key) => sum + entity.inventory.input[key], 0) : 0;
    return Math.max(0, capacity - used);
}
export function addLocalOutput(entity, good, quantity) {
    const inventory = ensureInventory(entity);
    if (!inventory || !GOOD_KEYS.includes(good)) return 0;
    const space = outputSpace(entity);
    const amount = Math.min(space, cleanQuantity(quantity));
    inventory.output[good] += amount;
    return amount;
}
export function addLocalInput(entity, good, quantity) {
    const inventory = ensureInventory(entity);
    if (!inventory || !GOOD_KEYS.includes(good)) return 0;
    const space = inputSpace(entity);
    const amount = Math.min(space, cleanQuantity(quantity));
    inventory.input[good] += amount;
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
    return ensureCityState().logistics.jobs.some(job => job.status !== "done" && job.status !== "cancelled" && predicate(job));
}
function makeJob(kind, good, quantity, from, to, extra = {}) {
    const city = ensureCityState();
    if (city.logistics.jobs.filter(job => job.status !== "done" && job.status !== "cancelled").length >= MAX_LOGISTICS_JOBS) return null;
    const id = "j" + city.logistics.nextJobId++;
    const job = {
        id, kind, good, quantity: cleanQuantity(quantity),
        from, to, status: "pending", reason: null,
        carrierId: null, createdTick: state.tick, retryAt: state.tick,
        attempts: 0, ...extra
    };
    city.logistics.jobs.push(job);
    if (city.logistics.jobs.length > MAX_LOGISTICS_JOBS) city.logistics.jobs.splice(0, city.logistics.jobs.length - MAX_LOGISTICS_JOBS);
    return job;
}
function entityFromRef(ref) {
    return ref?.id ? entityById(ref.id) : null;
}
function canAcceptWarehouseGood(warehouse, good, quantity) {
    return isWarehouse(warehouse) && warehouse.warehouse.filters.includes(good) && getWarehouseSpace(warehouse) >= quantity;
}

export function requestHaul(building, good, quantity) {
    if (!building || building.dead || !RECIPES[building.type]) return null;
    ensureInventory(building);
    const available = getAvailableOutput(building, good);
    const amount = Math.min(available, cleanQuantity(quantity));
    if (amount <= 0 || hasActiveJob(job => job.kind === "haul" && job.from?.id === building.id && job.good === good)) return null;
    const warehouses = getWarehouses().filter(warehouse => canAcceptWarehouseGood(warehouse, good, amount) && warehouse.warehouse.filters.includes(good))
        .sort((a, b) => Math.hypot(a.x - building.x, a.y - building.y) - Math.hypot(b.x - building.x, b.y - building.y) || String(a.id).localeCompare(String(b.id)));
    const warehouse = warehouses[0];
    if (!warehouse) return null;
    building.inventory.reservedOut[good] += amount;
    return makeJob("haul", good, amount, { kind: "building", id: building.id }, { kind: "warehouse", id: warehouse.id });
}

export function requestSupply(building, good, quantity) {
    if (!building || building.dead || !RECIPES[building.type]) return null;
    ensureInventory(building);
    const amount = Math.min(cleanQuantity(quantity), Math.max(0, inputSpace(building) - cleanQuantity(building.inventory.reservedIn[good])));
    if (amount <= 0 || hasActiveJob(job => job.kind === "supply" && job.to?.id === building.id && job.good === good)) return null;
    const stock = getWarehouseStock(good);
    if (stock < amount) return null;
    const warehouses = getWarehouses().filter(warehouse => cleanQuantity(warehouse.warehouse.stored[good]) > 0)
        .sort((a, b) => Math.hypot(a.x - building.x, a.y - building.y) - Math.hypot(b.x - building.x, b.y - building.y) || String(a.id).localeCompare(String(b.id)));
    const warehouse = warehouses[0];
    if (!warehouse) return null;
    building.inventory.reservedIn[good] += amount;
    return makeJob("supply", good, amount, { kind: "warehouse", id: warehouse.id }, { kind: "building", id: building.id });
}

export function requestConstructionDelivery(site, material, quantity) {
    if (!site || site.dead) return null;
    const amount = cleanQuantity(quantity);
    if (amount <= 0 || getWarehouseStock(material) < amount) return null;
    if (hasActiveJob(job => job.kind === "construction" && job.to?.id === site.id && job.good === material)) return null;
    const warehouses = getWarehouses().filter(warehouse => cleanQuantity(warehouse.warehouse.stored[material]) >= amount)
        .sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y) || String(a.id).localeCompare(String(b.id)));
    const warehouse = warehouses[0];
    if (!warehouse) return null;
    return makeJob("construction", material, amount, { kind: "warehouse", id: warehouse.id }, { kind: "construction", id: site.id });
}

export function cancelJobsForEntity(entityId) {
    const city = ensureCityState();
    for (const job of city.logistics.jobs) {
        if (job.status === "done" || job.status === "cancelled") continue;
        if (job.from?.id !== entityId && job.to?.id !== entityId) continue;
        job.status = "cancelled";
        job.reason = "Site or store removed";
        const source = entityFromRef(job.from);
        if (source?.inventory) {
            if (job.from.kind === "building") source.inventory.reservedOut[job.good] = Math.max(0, cleanQuantity(source.inventory.reservedOut[job.good]) - job.quantity);
        }
        const target = entityFromRef(job.to);
        if (target?.inventory) target.inventory.reservedIn[job.good] = Math.max(0, cleanQuantity(target.inventory.reservedIn[job.good]) - job.quantity);
    }
}

export function markConstructionDelivered(site, good, quantity) {
    if (!site?.construction) return 0;
    site.construction.delivered = site.construction.delivered && typeof site.construction.delivered === "object" ? site.construction.delivered : {};
    site.construction.delivered[good] = cleanQuantity(site.construction.delivered[good]) + cleanQuantity(quantity);
    return site.construction.delivered[good];
}

function releaseJobReservation(job) {
    const source = entityFromRef(job.from);
    if (source?.inventory && job.from?.kind === "building") source.inventory.reservedOut[job.good] = Math.max(0, cleanQuantity(source.inventory.reservedOut[job.good]) - job.quantity);
    const target = entityFromRef(job.to);
    if (target?.inventory) target.inventory.reservedIn[job.good] = Math.max(0, cleanQuantity(target.inventory.reservedIn[job.good]) - job.quantity);
}

function sourcePosition(job) {
    if (job.from?.kind === "warehouse") return entityFromRef(job.from) || { x: 0, y: 0 };
    return entityFromRef(job.from) || { x: 0, y: 0 };
}
function destinationPosition(job) {
    if (job.to?.kind === "warehouse") return entityFromRef(job.to) || { x: 0, y: 0 };
    return entityFromRef(job.to) || null;
}

function spawnCarrier(job) {
    const city = ensureCityState();
    if (city.logistics.carriers.length >= MAX_CARRIERS) return null;
    const source = sourcePosition(job), destination = destinationPosition(job);
    if (!source || !destination) return null;
    const start = nearestWalkable(source.x, source.y);
    const end = nearestWalkable(destination.x, destination.y);
    const path = findPath(start.x, start.y, end.x, end.y, 2400);
    if (!path && (Math.abs(start.x - end.x) > 1 || Math.abs(start.y - end.y) > 1)) {
        job.reason = "No overland route";
        job.retryAt = state.tick + JOB_RETRY_TICKS;
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

function takeFromSource(job) {
    if (job.from.kind === "warehouse") {
        const warehouse = entityFromRef(job.from);
        return withdrawGood(job.good, job.quantity, warehouse?.x, warehouse?.y) > 0;
    }
    const building = entityFromRef(job.from);
    if (!building?.inventory) return false;
    const available = cleanQuantity(building.inventory.output[job.good]);
    const amount = Math.min(available, job.quantity);
    if (amount <= 0) return false;
    building.inventory.output[job.good] -= amount;
    building.inventory.reservedOut[job.good] = Math.max(0, cleanQuantity(building.inventory.reservedOut[job.good]) - amount);
    job.quantity = amount;
    return true;
}
function deliverToDestination(job) {
    if (job.to.kind === "warehouse") {
        const warehouse = entityFromRef(job.to);
        if (job.good === "bread") {
            addResource("food", job.quantity);
            const city = ensureCityState();
            city.logistics.stats.breadDelivered = (cleanQuantity(city.logistics.stats.breadDelivered) || 0) + job.quantity;
            return true;
        }
        const accepted = isWarehouse(warehouse) ? depositGood(job.good, job.quantity, warehouse.x, warehouse.y) : 0;
        if (accepted < job.quantity) {
            // Store surplus back in the nearest warehouse or keep it in the
            // carrier's home store; nothing is destroyed.
            const overflow = job.quantity - accepted;
            const fallback = getWarehouses().sort((a, b) => Math.hypot(a.x - warehouse.x, a.y - warehouse.y) - Math.hypot(b.x - warehouse.x, b.y - warehouse.y))[0];
            if (fallback) fallback.warehouse.stored[job.good] += Math.max(0, Math.min(overflow, getWarehouseSpace(fallback)));
            else addResource("wood", 0);
        }
        return accepted > 0;
    }
    const target = entityFromRef(job.to);
    if (!target) return false;
    if (job.to.kind === "construction") {
        markConstructionDelivered(target, job.good, job.quantity);
        return true;
    }
    const accepted = addLocalInput(target, job.good, job.quantity);
    if (accepted < job.quantity) {
        const overflow = job.quantity - accepted;
        const fallback = getWarehouses().sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
        if (fallback) fallback.warehouse.stored[job.good] += Math.max(0, Math.min(overflow, getWarehouseSpace(fallback)));
    }
    target.inventory.reservedIn[job.good] = Math.max(0, cleanQuantity(target.inventory.reservedIn[job.good]) - job.quantity);
    return accepted > 0;
}
function completeJob(job) {
    job.status = "done";
    job.reason = null;
    const city = ensureCityState();
    city.logistics.stats.delivered = (cleanQuantity(city.logistics.stats.delivered) || 0) + job.quantity;
    city.logistics.stats[job.good] = (cleanQuantity(city.logistics.stats[job.good]) || 0) + job.quantity;
    const index = city.logistics.carriers.findIndex(carrier => carrier.id === job.carrierId);
    if (index >= 0) city.logistics.carriers.splice(index, 1);
}

function assignPendingJobs() {
    const city = ensureCityState();
    for (const job of city.logistics.jobs) {
        if (job.status !== "pending") continue;
        if ((job.retryAt || 0) > state.tick) continue;
        if (city.logistics.carriers.length >= MAX_CARRIERS) break;
        const carrier = spawnCarrier(job);
        if (!carrier) continue;
        if (!takeFromSource(job)) {
            job.reason = "Source stock unavailable";
            job.retryAt = state.tick + JOB_RETRY_TICKS;
            job.status = "pending";
            job.carrierId = null;
            city.logistics.carriers = city.logistics.carriers.filter(item => item.id !== carrier.id);
            continue;
        }
        carrier.status = "to-destination";
        carrier.cargo = { good: job.good, quantity: job.quantity };
        carrier.path = carrier.path?.length ? carrier.path : findPath(carrier.x, carrier.y, destinationPosition(job)?.x || carrier.x, destinationPosition(job)?.y || carrier.y, 2400) || [];
        carrier.pathIndex = 0;
    }
}

export function updateLogistics() {
    const city = ensureCityState();
    if (!city.enabled) return null;
    const logistics = city.logistics;
    if (state.tick <= 0 || state.tick % 2 !== 0) return null;
    logistics.lastTick = state.tick;
    ensureAllInventories();
    const activeJobs = logistics.jobs.filter(job => job.status !== "done" && job.status !== "cancelled");
    for (const job of activeJobs) {
        if (state.tick - job.createdTick > JOB_EXPIRE_TICKS) {
            job.status = "cancelled";
            job.reason = "Delivery expired";
            releaseJobReservation(job);
        }
    }
    assignPendingJobs();
    // Keep only a bounded history of completed jobs.
    if (logistics.jobs.length > MAX_LOGISTICS_JOBS) logistics.jobs = logistics.jobs.slice(-MAX_LOGISTICS_JOBS);
    return getLogisticsSnapshot();
}

export function updateLogisticsMovement(deltaSeconds) {
    const city = ensureCityState();
    if (!city.enabled || deltaSeconds <= 0 || deltaSeconds > 0.2) return;
    const logistics = city.logistics;
    const version = (state.buildingCollisionVersion || 0) + ":" + (state.roads?.revision || 0);
    for (const carrier of [...logistics.carriers]) {
        const job = logistics.jobs.find(item => item.id === carrier.jobId);
        if (!job || job.status === "done" || job.status === "cancelled") {
            logistics.carriers = logistics.carriers.filter(item => item.id !== carrier.id);
            continue;
        }
        if (carrier.pathVersion !== version) { carrier.path = []; carrier.pathVersion = version; }
        if (!carrier.path?.length) {
            const destination = destinationPosition(job);
            if (!destination) { job.status = "cancelled"; job.reason = "Destination removed"; logistics.carriers = logistics.carriers.filter(item => item.id !== carrier.id); continue; }
            const end = nearestWalkable(destination.x, destination.y);
            carrier.path = findPath(carrier.x, carrier.y, end.x, end.y, 2400) || [];
            carrier.pathIndex = 0;
            if (!carrier.path.length) { job.reason = "No overland route"; job.retryAt = state.tick + JOB_RETRY_TICKS; continue; }
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
            if (deliverToDestination(job)) {
                completeJob(job);
            } else {
                job.status = "blocked";
                job.reason = "Destination refused delivery";
                job.retryAt = state.tick + JOB_RETRY_TICKS;
                logistics.carriers = logistics.carriers.filter(item => item.id !== carrier.id);
            }
        }
    }
}

export function getLogisticsSnapshot() {
    const city = ensureCityState();
    const active = city.logistics.jobs.filter(job => job.status !== "done" && job.status !== "cancelled");
    const counts = { pending: 0, assigned: 0, blocked: 0, done: 0, cancelled: 0 };
    for (const job of city.logistics.jobs) counts[job.status] = (counts[job.status] || 0) + 1;
    return {
        jobs: active.slice(-20).map(job => ({ ...job, from: { ...job.from }, to: { ...job.to } })),
        carriers: city.logistics.carriers.map(carrier => ({ ...carrier, path: undefined })),
        counts, warehouses: getWarehouseSnapshot(), stats: { ...city.logistics.stats }
    };
}

export function getBuildingLogisticsStatus(entity) {
    if (!entity) return null;
    const jobs = ensureCityState().logistics.jobs.filter(job => job.status !== "done" && job.status !== "cancelled" && (job.from?.id === entity.id || job.to?.id === entity.id));
    return jobs.map(job => ({ id: job.id, kind: job.kind, good: job.good, quantity: job.quantity, status: job.status, reason: job.reason, carrierId: job.carrierId }));
}

export function getBuildingSupplyReason(entity) {
    const recipe = RECIPES[entity?.type];
    if (!recipe) return null;
    ensureInventory(entity);
    if (recipe.input) {
        for (const [good, amount] of Object.entries(recipe.input)) {
            if (cleanQuantity(entity.inventory.input[good]) < amount) {
                const jobs = getBuildingLogisticsStatus(entity).filter(job => job.good === good && job.kind === "supply");
                return jobs.length ? "Waiting for " + GOODS[good].plural + " delivery" : "No " + GOODS[good].plural + " in reachable stores";
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
    const active = city.logistics.jobs.filter(job => job.status !== "done" && job.status !== "cancelled");
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

export function serializeCity() {
    const city = ensureCityState();
    return {
        version: CITY_VERSION,
        enabled: city.enabled,
        constructionVersion: city.constructionVersion || 0,
        logistics: {
            version: 1, nextJobId: city.logistics.nextJobId, nextCarrierId: city.logistics.nextCarrierId,
            lastTick: city.logistics.lastTick || 0, stats: { ...city.logistics.stats },
            jobs: city.logistics.jobs.slice(-MAX_LOGISTICS_JOBS).map(job => ({
                id: job.id, kind: job.kind, good: job.good, quantity: job.quantity,
                from: job.from ? { ...job.from } : null, to: job.to ? { ...job.to } : null,
                status: job.status, reason: job.reason || null, createdTick: job.createdTick,
                retryAt: job.retryAt || 0, attempts: job.attempts || 0
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
        for (const job of logistics.jobs) {
            if (!job || typeof job !== "object" || !GOOD_KEYS.includes(job.good) || !Number.isFinite(Number(job.quantity)) || Number(job.quantity) < 0) throw new Error("Save data contains an invalid delivery job.");
            if (!job.from || !job.to || typeof job.from !== "object" || typeof job.to !== "object") throw new Error("Save data contains a job without endpoints.");
        }
        for (const carrier of logistics.carriers) {
            if (!carrier || !Number.isFinite(Number(carrier.x)) || !Number.isFinite(Number(carrier.y))) throw new Error("Save data contains an invalid carrier.");
            if (carrier.cargo && (!GOOD_KEYS.includes(carrier.cargo.good) || !Number.isFinite(Number(carrier.cargo.quantity)))) throw new Error("Save data contains invalid carrier cargo.");
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
        city.logistics = { version: 1, nextJobId: 1, nextCarrierId: 1, jobs: [], carriers: [], lastTick: 0, stats: {} };
        return city;
    }
    city.enabled = Boolean(snapshot.enabled);
    city.constructionVersion = Math.max(0, Math.floor(number(snapshot.constructionVersion)));
    const saved = snapshot.logistics || {};
    city.logistics = {
        version: 1,
        nextJobId: Math.max(1, Math.floor(number(saved.nextJobId, 1))),
        nextCarrierId: Math.max(1, Math.floor(number(saved.nextCarrierId, 1))),
        lastTick: Math.max(0, Math.floor(number(saved.lastTick))),
        stats: saved.stats && typeof saved.stats === "object" ? { ...saved.stats } : {},
        jobs: Array.isArray(saved.jobs) ? saved.jobs.map(job => ({
            ...job,
            quantity: cleanQuantity(job.quantity),
            createdTick: Math.max(0, Math.floor(number(job.createdTick))),
            retryAt: Math.max(0, Math.floor(number(job.retryAt))),
            attempts: Math.max(0, Math.floor(number(job.attempts)))
        })) : [],
        carriers: Array.isArray(saved.carriers) ? saved.carriers.map(carrier => ({
            ...carrier,
            x: number(carrier.x), y: number(carrier.y),
            home: carrier.home ? { x: number(carrier.home.x), y: number(carrier.home.y) } : { x: number(carrier.x), y: number(carrier.y) },
            path: [], pathIndex: 0, pathVersion: "", status: carrier.status || "to-destination",
            speed: Math.max(0.5, Math.min(4, number(carrier.speed, 1.9)))
        })) : []
    };
    city.fields = snapshot.fields && typeof snapshot.fields === "object" ? JSON.parse(JSON.stringify(snapshot.fields)) : null;
    city.services = snapshot.services && typeof snapshot.services === "object" ? JSON.parse(JSON.stringify(snapshot.services)) : null;
    city.needs = snapshot.needs && typeof snapshot.needs === "object" ? JSON.parse(JSON.stringify(snapshot.needs)) : null;
    ensureAllInventories();
    return city;
}

export function initializeCityForRealm({ seedWarehouse = true } = {}) {
    const city = ensureCityState();
    city.enabled = true;
    ensureAllInventories();
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        if (!entity.construction) entity.construction = null;
        if (entity.type === TYPE.KEEP && seedWarehouse && warehouseUsed(entity) === 0) {
            entity.warehouse.stored.planks = Math.max(entity.warehouse.stored.planks, 28);
            entity.warehouse.stored.cutStone = Math.max(entity.warehouse.stored.cutStone, 24);
            entity.warehouse.stored.firewood = Math.max(entity.warehouse.stored.firewood, 30);
            entity.warehouse.stored.water = Math.max(entity.warehouse.stored.water, 20);
            entity.warehouse.stored.grain = Math.max(entity.warehouse.stored.grain, 20);
            entity.warehouse.stored.flour = Math.max(entity.warehouse.stored.flour, 10);
            entity.warehouse.stored.logs = Math.max(entity.warehouse.stored.logs, 8);
        }
    }
    return city;
}

export function isCityBuilding(type) {
    return CITY_TYPES.has(type);
}
