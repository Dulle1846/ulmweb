// Seasonal, player-triggered gathering from a real forest tile.
//
// The settlement logistics ledger remains the authority for hauled timber,
// planks and food. This module is deliberately a separate forest-product
// ledger: mushrooms, berries, mast, herbs, honey, game and small amounts of
// wood can be collected without inventing a second city-wide currency.
import { state } from "../core/state.js";
import { getHeightAt, getMoistureAt, getTemperatureAt } from "../world/world.js";
import { FOREST_GOODS, forestGoodsFor, forestStandAt } from "../world/forest-ecology.js";
import {
    findNearestResourceNode, getResourceNodeAt, harvestForest,
} from "./resource-geography.js";

const VERSION = 1;
const MAX_HISTORY = 32;
const MAX_LAST_GATHER = 256;
const MAX_STOCK = 999999;
const GATHER_RADIUS = 7;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function emptyLedger() {
    return {
        version: VERSION,
        stock: {},
        totalGathered: {},
        history: [],
        lastGather: {},
    };
}

function activeLedger() {
    const current = state.forestGathering;
    return current && current.version === VERSION && current.stock && typeof current.stock === "object" ? current : null;
}

export function ensureForestGathering() {
    const current = activeLedger();
    if (current) return current;
    state.forestGathering = emptyLedger();
    return state.forestGathering;
}

export function resetForestGathering() {
    state.forestGathering = emptyLedger();
}

export function forestProductsAt(x, y, dayOfYear = state.dayOfYear) {
    const node = getResourceNodeAt(x, y);
    if (!node?.forestCapacity || !node.forestStock) return null;
    const width = Number(state.terrainPixW) || 0;
    const px = width ? clamp(Math.floor((x + 0.5) * (Number(state.terrainResolution) || 1)), 0, width - 1) : 0;
    const height = Number(state.terrainPixH) || 0;
    const py = height ? clamp(Math.floor((y + 0.5) * (Number(state.terrainResolution) || 1)), 0, height - 1) : 0;
    const mapIndex = py * width + px;
    const moisture = Number(state.moistureMap?.[mapIndex]) || 0.55;
    const temperature = Number(state.temperatureMap?.[mapIndex]) || 0.55;
    const terrainHeight = Number(state.heightMap?.[mapIndex]) || 0.55;
    const stand = forestStandAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        moisture, temperature, height: terrainHeight,
        climate: state.worldOptions?.climate || "temperate",
        forests: state.worldOptions?.forests ?? 52,
        stockRatio: node.forestStock / Math.max(1, node.forestCapacity),
        rockLine: 0.92,
    });
    if (!stand.forest) return null;
    return {
        x: Math.floor(x), y: Math.floor(y), node, stand,
        goods: forestGoodsFor(stand, number(dayOfYear, 150), state.worldOptions?.climate || "temperate"),
    };
}

function addStock(ledger, id, amount) {
    const key = String(id);
    if (!FOREST_GOODS[key] || !Number.isFinite(amount) || amount <= 0) return 0;
    const current = Math.max(0, Math.floor(number(ledger.stock[key])));
    const accepted = Math.min(MAX_STOCK - current, Math.max(0, Math.floor(amount)));
    ledger.stock[key] = current + accepted;
    ledger.totalGathered[key] = Math.max(0, Math.floor(number(ledger.totalGathered[key]))) + accepted;
    return accepted;
}

function isValidGather(ledger, x, y, day, year) {
    const key = x + ":" + y;
    const last = ledger.lastGather[key];
    return !last || Number(last.day) !== day || Number(last.year) !== year;
}

export function gatherForestProducts(x, y, options = {}) {
    const ledger = ensureForestGathering();
    const products = forestProductsAt(x, y, options.dayOfYear ?? state.dayOfYear);
    if (!products) return { ok: false, reason: "No living forest at this tile" };
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    if (!isValidGather(ledger, products.x, products.y, day, year)) {
        return { ok: false, reason: "This wood was already gathered today" };
    }
    // Prefer the characteristic foods and materials, but keep a small,
    // deterministic selection so a single click never empties every category.
    const candidates = products.goods
        .filter(good => FOREST_GOODS[good.id])
        .slice(0, 5);
    if (!candidates.length) return { ok: false, reason: "No seasonal product is available" };
    const gathered = [];
    for (const good of candidates) {
        let amount = Math.max(1, Math.round(1 + good.abundance * 3));
        if (good.category === "wood") {
            const taken = harvestForest(products.x, products.y, Math.max(1, Math.ceil(amount / 2)));
            if (taken <= 0) continue;
            amount = taken;
        }
        const accepted = addStock(ledger, good.id, amount);
        if (accepted > 0) gathered.push({ ...good, amount: accepted });
    }
    if (!gathered.length) return { ok: false, reason: "The selected products could not be gathered" };
    ledger.lastGather[products.x + ":" + products.y] = { day, year };
    const keys = Object.keys(ledger.lastGather);
    if (keys.length > MAX_LAST_GATHER) {
        for (const key of keys.slice(0, keys.length - MAX_LAST_GATHER)) delete ledger.lastGather[key];
    }
    ledger.history.push({
        x: products.x, y: products.y, day, year,
        goods: gathered.map(good => ({ id: good.id, amount: good.amount })),
    });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true,
        tile: { x: products.x, y: products.y, type: products.stand.type, label: products.stand.label },
        goods: gathered,
        total: gathered.reduce((sum, good) => sum + good.amount, 0),
    };
}

export function gatherNearestForestProducts(x, y, radius = GATHER_RADIUS) {
    const node = findNearestResourceNode("forest", x, y, radius);
    if (!node) return { ok: false, reason: "No forest in working range" };
    return gatherForestProducts(node.x, node.y);
}

export function forestGatheringSummary(limit = 4) {
    const ledger = activeLedger();
    if (!ledger) return "";
    return Object.entries(ledger.stock)
        .filter(([, amount]) => Number(amount) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, Math.max(1, Math.floor(limit)))
        .map(([id, amount]) => (FOREST_GOODS[id]?.label || id) + " " + Math.floor(Number(amount)))
        .join(" · ");
}

export function serializeForestGathering() {
    const ledger = activeLedger();
    if (!ledger) return emptyLedger();
    const stock = {};
    const totalGathered = {};
    for (const [id, amount] of Object.entries(ledger.stock)) {
        if (FOREST_GOODS[id] && Number(amount) > 0) stock[id] = Math.min(MAX_STOCK, Math.floor(Number(amount)));
    }
    for (const [id, amount] of Object.entries(ledger.totalGathered)) {
        if (FOREST_GOODS[id] && Number(amount) > 0) totalGathered[id] = Math.min(MAX_STOCK, Math.floor(Number(amount)));
    }
    return {
        version: VERSION,
        stock,
        totalGathered,
        history: ledger.history.slice(-MAX_HISTORY).map(entry => ({
            x: Math.floor(number(entry.x)), y: Math.floor(number(entry.y)),
            day: Math.floor(number(entry.day)), year: Math.floor(number(entry.year, 1)),
            goods: (entry.goods || []).filter(good => good && FOREST_GOODS[good.id]).map(good => ({
                id: good.id, amount: Math.max(0, Math.floor(number(good.amount))),
            })),
        })),
        lastGather: Object.fromEntries(Object.entries(ledger.lastGather)
            .filter(([key]) => /^\d+:\d+$/.test(key))
            .slice(-MAX_LAST_GATHER)
            .map(([key, value]) => [key, {
                day: Math.floor(number(value?.day)), year: Math.floor(number(value?.year, 1)),
            }])),
    };
}

export function validateForestGatheringSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== VERSION) {
        throw new Error("Save data contains an invalid forest-gathering state.");
    }
    for (const key of ["stock", "totalGathered", "lastGather"]) {
        if (snapshot[key] !== undefined && (!snapshot[key] || typeof snapshot[key] !== "object" || Array.isArray(snapshot[key]))) {
            throw new Error("Save data contains an invalid forest-gathering " + key + " map.");
        }
    }
    for (const [id, amount] of Object.entries(snapshot.stock || {})) {
        if (!FOREST_GOODS[id] || !Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > MAX_STOCK) {
            throw new Error("Save data contains an invalid forest product stock entry.");
        }
    }
    if (snapshot.history !== undefined && (!Array.isArray(snapshot.history) || snapshot.history.length > MAX_HISTORY)) {
        throw new Error("Save data contains an invalid forest-gathering history.");
    }
    for (const entry of snapshot.history || []) {
        if (!entry || typeof entry !== "object" || !Number.isFinite(Number(entry.x)) || !Number.isFinite(Number(entry.y))
            || !Number.isFinite(Number(entry.day)) || !Number.isFinite(Number(entry.year))) {
            throw new Error("Save data contains an invalid forest-gathering history entry.");
        }
        for (const good of entry.goods || []) {
            if (!good || !FOREST_GOODS[good.id] || !Number.isFinite(Number(good.amount)) || Number(good.amount) < 0) {
                throw new Error("Save data contains an invalid gathered product entry.");
            }
        }
    }
    for (const [key, value] of Object.entries(snapshot.lastGather || {})) {
        if (!/^\d+:\d+$/.test(key) || !value || !Number.isFinite(Number(value.day)) || !Number.isFinite(Number(value.year))) {
            throw new Error("Save data contains an invalid forest-gathering cooldown.");
        }
    }
    return true;
}

export function restoreForestGathering(snapshot) {
    resetForestGathering();
    if (!snapshot) return 0;
    validateForestGatheringSnapshot(snapshot);
    const ledger = state.forestGathering;
    for (const [id, amount] of Object.entries(snapshot.stock || {})) {
        if (FOREST_GOODS[id]) ledger.stock[id] = Math.max(0, Math.floor(number(amount)));
    }
    for (const [id, amount] of Object.entries(snapshot.totalGathered || {})) {
        if (FOREST_GOODS[id]) ledger.totalGathered[id] = Math.max(0, Math.floor(number(amount)));
    }
    ledger.history = (snapshot.history || []).map(entry => ({
        x: Math.floor(number(entry.x)), y: Math.floor(number(entry.y)),
        day: Math.floor(number(entry.day)), year: Math.floor(number(entry.year, 1)),
        goods: (entry.goods || []).filter(good => good && FOREST_GOODS[good.id]).map(good => ({
            id: good.id, amount: Math.max(0, Math.floor(number(good.amount))),
        })),
    }));
    ledger.lastGather = Object.fromEntries(Object.entries(snapshot.lastGather || {}).map(([key, value]) => [key, {
        day: Math.floor(number(value.day)), year: Math.floor(number(value.year, 1)),
    }]));
    return Object.keys(ledger.stock).length;
}

export const FOREST_GATHERING_LIMITS = Object.freeze({ version: VERSION, maxHistory: MAX_HISTORY, maxStock: MAX_STOCK });
