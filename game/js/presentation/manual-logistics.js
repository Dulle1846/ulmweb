// Player-facing read model for manual carrier orders. It only advertises work
// that the existing logistics system can really accept. The click path calls
// requestHaul()/requestSupply() directly, so routes, reservations, the cart
// limit and lastRejection all stay in the simulation, not in this presentation
// module. No timer, save field or per-tick work is added.
import { GOODS, GOOD_KEYS, RECIPES, REGIONAL_TIMBER_KEYS } from "../systems/city-config.js";
import {
    CARRIER_CAPACITY, MAX_LOGISTICS_JOBS, ensureCityState, getAvailableOutput,
    getAvailableWarehouseStock, getInputCapacityUsage, getWarehouseSnapshot,
    requestHaul, requestSupply
} from "../systems/logistics.js";

const ACTIVE_STATUSES = new Set(["pending", "assigned", "blocked"]);
const lot = value => Math.max(0, Math.floor(Number(value) || 0));
const labelFor = good => GOODS[good]?.label || good;
const pluralFor = good => GOODS[good]?.plural || (labelFor(good).toLowerCase() + "s");
const unique = (values) => [...new Set(values.filter(value => GOOD_KEYS.includes(value)))];

/**
 * Describe every haul/supply order this building's declared recipe can accept.
 * `warehouseFree` is passed in by the register because it already holds the
 * city snapshot; the default keeps the read model usable from unit tests.
 */
export function getManualLogisticsSnapshot(building, { warehouseFree = null } = {}) {
    const recipe = building && !building.dead && building.isBuilding?.() ? RECIPES[building.type] : null;
    if (!recipe) return { buildingId: building?.id ?? null, orders: [], activeJobs: 0, jobLimit: MAX_LOGISTICS_JOBS, queueFull: false };
    const logistics = ensureCityState().logistics;
    const active = logistics.jobs.filter(job => ACTIVE_STATUSES.has(job.status));
    const activeFor = new Map();
    for (const job of active) {
        if (job.from?.id !== building.id && job.to?.id !== building.id) continue;
        activeFor.set(job.kind + ":" + job.good, job);
    }
    const free = warehouseFree === null ? getWarehouseSnapshot().free : lot(warehouseFree);
    const inputSpace = getInputCapacityUsage(building).free;
    const queueFull = active.length >= MAX_LOGISTICS_JOBS;
    const inputs = unique([...Object.keys(recipe.input || {}), ...(recipe.regionalTimber ? REGIONAL_TIMBER_KEYS : [])]);
    const outputs = unique(Object.keys(recipe.output || {}));
    const orders = [];
    for (const [kind, goods] of [["supply", inputs], ["haul", outputs]]) {
        for (const good of goods) {
            const job = activeFor.get(kind + ":" + good) || null;
            const stock = getAvailableWarehouseStock(good);
            const local = getAvailableOutput(building, good);
            const available = kind === "supply"
                ? Math.min(CARRIER_CAPACITY, stock, inputSpace)
                : Math.min(CARRIER_CAPACITY, local, free);
            let reason = null;
            if (job) reason = "A carrier already has " + pluralFor(good) + " on order";
            else if (queueFull) reason = "Delivery queue is full";
            else if (kind === "supply" && stock <= 0) reason = "No " + pluralFor(good) + " in reachable stores";
            else if (kind === "supply" && inputSpace <= 0) reason = "Input store is full or fully reserved";
            else if (kind === "haul" && local <= 0) reason = "No unreserved " + pluralFor(good) + " in this structure";
            else if (kind === "haul" && free <= 0) reason = "No warehouse space is free";
            orders.push({
                kind, good,
                label: labelFor(good),
                quantity: job ? lot(job.quantity) : available,
                available,
                activeJobId: job?.id || null,
                ok: !job && !queueFull && available > 0,
                reason
            });
        }
    }
    return { buildingId: building?.id ?? null, orders, activeJobs: active.length, jobLimit: MAX_LOGISTICS_JOBS, queueFull };
}

/** Place one real order through the simulation and return a player-readable result. */
export function placeManualOrder(building, kind, good, quantity) {
    const order = getManualLogisticsSnapshot(building).orders.find(item => item.kind === kind && item.good === good);
    if (!order) return { ok: false, reason: "not-a-recipe-good" };
    if (!order.ok) return { ok: false, reason: order.reason || "order-not-available" };
    const requested = Math.min(CARRIER_CAPACITY, lot(quantity), order.available);
    const job = kind === "supply" ? requestSupply(building, good, requested) : requestHaul(building, good, requested);
    if (!job) {
        const reason = ensureCityState().logistics.lastRejection?.reason || "order-rejected";
        return { ok: false, reason };
    }
    return {
        ok: true, job, kind, good, quantity: job.quantity,
        message: (kind === "supply" ? "SUPPLY ORDERED · " : "HAUL ORDERED · ") + job.quantity + " " + labelFor(good).toUpperCase()
    };
}
