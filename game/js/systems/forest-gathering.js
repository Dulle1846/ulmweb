// Seasonal, player-triggered gathering from a real forest tile.
//
// The settlement logistics ledger remains the authority for hauled timber,
// planks and food. This module is deliberately a separate forest-product
// ledger: mushrooms, berries, mast, herbs, honey, game and small amounts of
// wood can be collected without inventing a second city-wide currency.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { getHeightAt, getMoistureAt, getTemperatureAt } from "../world/world.js";
import { FOREST_GOODS, forestGoodsFor, forestSnowDepthAt, forestStandAt } from "../world/forest-ecology.js";
import { grasslandProductsAt } from "../world/grassland-ecology.js";
import { isSteppeSite, steppeProductsAt } from "../world/steppe-ecology.js";
import { isDesertSite, desertProductsAt } from "../world/desert-ecology.js";
import { isTundraSite, tundraProductsAt } from "../world/tundra-ecology.js";
import { grasslandUseAt } from "./grassland-use.js";
import { TROPICAL_GOODS } from "../world/tropical-ecology.js";
import {
    findNearestResourceNode, getResourceNodeAt, getResourceSiteAt, harvestForest,
} from "./resource-geography.js";
import { addMedicineStock, tropicalExposure } from "./health.js";
import { harvestForestGameAt } from "./forest-fauna.js";
import { addLocalOutput, outputSpace, requestHaul } from "./logistics.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";

const VERSION = 1;
const MAX_HISTORY = 32;
const MAX_LAST_GATHER = 256;
const MAX_STOCK = 999999;
const GATHER_RADIUS = 7;
const QUALITY_TIERS = Object.freeze(["prime", "good", "lean"]);
const HUNT_GOODS = Object.freeze(new Set(["game", "fur", "hides", "cured-game", "tanned-fur", "cured-hides"]));
const PROCESSED_FROM = Object.freeze({ game: "cured-game", fur: "tanned-fur", hides: "cured-hides" });
// Deliveries use the existing physical city goods instead of inventing a new
// warehouse taxonomy. Timber becomes logs, firewood stays firewood, food and
// medicine enter the royal stores, and fur/resin are sold for gold.
const FOOD_DELIVERY = Object.freeze(new Set([
    "mushrooms", "chanterelle", "porcini", "wild-garlic", "wood-sorrel", "wild-strawberry",
    "sloes", "crab-apples", "berries", "truffles", "honey", "maple-syrup", "birch-sap",
    "game", "cured-game", "blueberries", "lingonberries", "rowan-berries", "elderberries", "hazelnuts",
    "orchard-fruit", "dates", "cloudberry", "crowberry", "arctic-char",
]));
const GOLD_DELIVERY = Object.freeze(new Set([
    "fur", "hides", "tanned-fur", "cured-hides", "resin", "beeswax", "herbs", "lichen",
    "bark", "linden-flower", "elm-seeds", "alder-cones", "yew-berries", "dwarf-pine-cones",
    "ash-keys", "hornbeam-seeds", "willow-withies", "woodruff", "valerian", "tinder-fungus",
    "hay", "meadow-grass", "wildflowers", "reed", "turf", "salt", "wool",
    "desert-sand", "desert-stone", "gemstones", "copper-ore", "desert-fibre", "desert-resin", "archaeological-find",
    "antler", "bone", "peat", "soapstone", "bog-iron", "qiviut",
]));
const TROPICAL_GOLD_HUNT = Object.freeze(new Set(["hides", "feathers"]));

export function forestDeliveryChannel(id) {
    const good = FOREST_GOODS[id];
    if (!good) return null;
    if (good.category === "wood") return "wood";
    if (good.category === "medicine") return "medicine";
    if (FOOD_DELIVERY.has(id)) return "food";
    if (GOLD_DELIVERY.has(id)) return "gold";
    const tropical = TROPICAL_GOODS[id];
    if (!tropical) return null;
    if (tropical.category === "gather" || tropical.category === "hunt") {
        return TROPICAL_GOLD_HUNT.has(id) ? "gold" : "food";
    }
    if (["fibre", "resin", "luxury", "poison"].includes(tropical.category)) return "gold";
    return null;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function emptyLedger() {
    return {
        version: VERSION,
        stock: {},
        totalGathered: {},
        quality: {},
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
    if (current) {
        if (!current.quality || typeof current.quality !== "object" || Array.isArray(current.quality)) current.quality = {};
        return current;
    }
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
        succession: node.forestSuccession,
    });
    if (!stand.forest) return null;
    const day = number(dayOfYear, 150);
    const climate = state.worldOptions?.climate || "temperate";
    const snow = forestSnowDepthAt(stand, day, climate);
    const tropicalPenalty = Number(stand.tropical?.hazard?.workPenalty) || 0;
    const junglePenalty = Number(stand.jungle?.hazards?.workPenalty) || 0;
    const workFactor = clamp(1 - snow.depth * 0.38 - (1 - (Number(stand.visibility) || 0)) * 0.12
        - tropicalPenalty * 0.55 - junglePenalty * 0.22, 0.3, 1);
    return {
        x: Math.floor(x), y: Math.floor(y), node, stand,
        snowDepthCm: snow.cm,
        visibility: Number(stand.visibility) || 0,
        workFactor,
        hazard: stand.tropical?.hazard
            ? { ...stand.tropical.hazard, ...(stand.jungle?.hazards || {}) }
            : stand.jungle?.hazards || null,
        jungle: stand.jungle || null,
        jungleNavigation: stand.jungle?.navigation || null,
        landUse: stand.tropical?.landUse || null,
        spoilageRisk: stand.tropical?.hazard?.spoilage || 0,
        goods: forestGoodsFor(stand, day, climate),
    };
}

function addStock(ledger, id, amount, quality = null) {
    const key = String(id);
    if (!FOREST_GOODS[key] || !Number.isFinite(amount) || amount <= 0) return 0;
    const current = Math.max(0, Math.floor(number(ledger.stock[key])));
    const accepted = Math.min(MAX_STOCK - current, Math.max(0, Math.floor(amount)));
    ledger.stock[key] = current + accepted;
    ledger.totalGathered[key] = Math.max(0, Math.floor(number(ledger.totalGathered[key]))) + accepted;
    if (accepted > 0 && quality && HUNT_GOODS.has(key) && QUALITY_TIERS.includes(quality)) {
        if (!ledger.quality || typeof ledger.quality !== "object" || Array.isArray(ledger.quality)) ledger.quality = {};
        const row = ledger.quality[key] && typeof ledger.quality[key] === "object" ? ledger.quality[key] : {};
        row[quality] = Math.max(0, Math.floor(number(row[quality]))) + accepted;
        ledger.quality[key] = row;
    }
    return accepted;
}

// Remove raw hunt stock together with its quality bands. Old saves and
// unqualified stock fall back to "good" instead of disappearing.
function takeHuntStock(ledger, id, amount) {
    const key = String(id);
    const available = Math.min(Math.max(0, Math.floor(number(ledger.stock[key]))), Math.max(0, Math.floor(number(amount))));
    if (available <= 0) return [];
    const row = ledger.quality?.[key] && typeof ledger.quality[key] === "object" ? ledger.quality[key] : {};
    const parts = [];
    let remaining = available;
    for (const quality of QUALITY_TIERS) {
        const take = Math.min(remaining, Math.max(0, Math.floor(number(row[quality]))));
        if (take <= 0) continue;
        row[quality] = Math.max(0, Math.floor(number(row[quality]))) - take;
        remaining -= take;
        parts.push({ quality, amount: take });
    }
    if (remaining > 0) parts.push({ quality: "good", amount: remaining });
    ledger.stock[key] = Math.max(0, Math.floor(number(ledger.stock[key])) - available);
    ledger.quality = ledger.quality && typeof ledger.quality === "object" ? ledger.quality : {};
    if (parts.length) ledger.quality[key] = row;
    return parts;
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
    const huntGoods = products.goods.filter(good => good.category === "hunt" && FOREST_GOODS[good.id]);
    const hunt = huntGoods.length ? harvestForestGameAt(products.x, products.y, 2) : null;
    const candidates = products.goods
        .filter(good => FOREST_GOODS[good.id])
        .slice(0, 5);
    // Hunting is a distinct action inside the same visit. Keep the seasonal
    // hunt goods even if the generic five-item selection would omit them.
    for (const good of huntGoods) {
        if (!candidates.some(entry => entry.id === good.id)) candidates.push(good);
    }
    // A jungle visit is a mixed harvest, not a generic five-slot pull. Keep
    // one representative of every resource family this tile actually carries,
    // plus one hidden rare find. This is what makes fibres, medicine, poison,
    // spices and timber reach the ledger instead of only fruit.
    let rareAdded = false;
    for (const good of products.goods) {
        if (!FOREST_GOODS[good.id]) continue;
        const isRare = (products.jungle?.resources?.hiddenRareResources || [])
            .some(entry => entry.id === good.id);
        if (!isRare || rareAdded || candidates.some(entry => entry.id === good.id)) continue;
        candidates.push(good);
        rareAdded = true;
    }
    for (const [group, entries] of Object.entries(products.jungle?.resources || {})) {
        if (group === "hiddenRareResources") continue;
        const best = entries
            .filter(entry => FOREST_GOODS[entry.id])
            .sort((a, b) => Number(b.abundance) - Number(a.abundance))[0];
        if (best && !candidates.some(entry => entry.id === best.id)) {
            candidates.push({ ...FOREST_GOODS[best.id], abundance: Number(best.abundance) || 0.2 });
        }
    }
    if (!candidates.length) return { ok: false, reason: "No seasonal product is available" };
    const gathered = [];
    const spoilage = clamp(number(products.spoilageRisk, 0), 0, 1);
    let spoiledTotal = 0;
    const workFactor = clamp(number(products.workFactor, 1), 0.45, 1);
    for (const good of candidates) {
        let amount = Math.max(1, Math.round((1 + good.abundance * 3) * workFactor));
        const perishable = good.category === "gather" || good.category === "hunt";
        const spoiled = perishable ? Math.min(amount, Math.floor(amount * spoilage * 0.35)) : 0;
        if (spoiled > 0) { amount -= spoiled; spoiledTotal += spoiled; }
        if (amount <= 0) continue;
        let quality = null;
        if (good.category === "wood") {
            const taken = harvestForest(products.x, products.y, Math.max(1, Math.ceil(amount / 2)));
            if (taken <= 0) continue;
            amount = taken;
        } else if (good.category === "hunt") {
            if (!hunt) continue;
            amount = good.id === "game" ? Math.max(1, hunt.taken * 2) : Math.max(1, Math.ceil(hunt.taken / 2));
            quality = hunt.quality;
        }
        const accepted = addStock(ledger, good.id, amount, quality);
        if (accepted > 0) gathered.push({ ...good, amount: accepted, ...(quality ? { quality } : {}) });
    }
    if (!gathered.length) return { ok: false, reason: huntGoods.length && !hunt ? "No huntable herd at this tile" : "The selected products could not be gathered" };
    const exposure = tropicalExposure(products.hazard, {
        source: "gather", x: products.x, y: products.y, diseaseLabel: products.hazard?.diseaseLabel,
    });
    ledger.lastGather[products.x + ":" + products.y] = { day, year };
    const keys = Object.keys(ledger.lastGather);
    if (keys.length > MAX_LAST_GATHER) {
        for (const key of keys.slice(0, keys.length - MAX_LAST_GATHER)) delete ledger.lastGather[key];
    }
    ledger.history.push({
        x: products.x, y: products.y, day, year, kind: "gather",
        goods: gathered.map(good => ({ id: good.id, amount: good.amount, ...(good.quality ? { quality: good.quality } : {}) })),
    });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true,
        tile: { x: products.x, y: products.y, type: products.stand.type, label: products.stand.label },
        goods: gathered,
        hunt: hunt ? { species: hunt.species, label: hunt.label, taken: hunt.taken, quality: hunt.quality } : null,
        workFactor,
        spoilage,
        spoiled: spoiledTotal,
        exposure,
        total: gathered.reduce((sum, good) => sum + good.amount, 0),
    };
}

// UI and action share the same gate: a building is only offered the delivery
// action when at least one held forest good can actually reach a store or the
// royal resources. This keeps an empty ledger from looking actionable.
export function forestDeliveryAvailability(building) {
    if (!building || building.dead || building.isBuilding?.() !== true
        || ![TYPE.LUMBER, TYPE.FORESTER].includes(building.type)) {
        return { available: 0, reason: "A lumber yard or forester is required" };
    }
    if (building.construction && Number(building.construction.stage) < 3) {
        return { available: 0, reason: "The forest building is still under construction" };
    }
    const ledger = activeLedger();
    if (!ledger) return { available: 0, reason: "No forest products have been gathered" };
    const canUseLocalStore = building.type === TYPE.LUMBER;
    let available = 0;
    for (const [id, raw] of Object.entries(ledger.stock)) {
        const amount = Math.max(0, Math.floor(number(raw)));
        if (!amount || !FOREST_GOODS[id]) continue;
        const channel = forestDeliveryChannel(id);
        if (!channel) continue;
        if (channel === "wood" && !canUseLocalStore) continue;
        available += amount;
    }
    return {
        available,
        reason: available > 0 ? "" : (canUseLocalStore
            ? "No deliverable forest products"
            : "This forester has no food, medicine or market goods to deliver"),
    };
}

export function deliverForestGoods(building) {
    const availability = forestDeliveryAvailability(building);
    if (availability.available <= 0) return { ok: false, reason: availability.reason };
    const ledger = activeLedger();
    if (!ledger) return { ok: false, reason: "No forest products have been gathered" };
    const delivered = { logs: 0, firewood: 0, food: 0, gold: 0, medicine: 0, spoiled: 0 };
    const goods = [];
    const canUseLocalStore = building.type === TYPE.LUMBER;
    const bx = Math.floor(Number(building.x) || 0), by = Math.floor(Number(building.y) || 0);
    const site = getResourceSiteAt(bx, by);
    const node = getResourceNodeAt(bx, by);
    const riverTrade = Boolean(node?.forestLandUse?.riverTrade || site?.water);
    const spoilage = Math.max(0, Math.min(1, number(node?.forestHazard?.spoilage)));
    for (const [id, raw] of Object.entries(ledger.stock)) {
        const amount = Math.max(0, Math.floor(number(raw)));
        if (!amount || !FOREST_GOODS[id]) continue;
        const channel = forestDeliveryChannel(id);
        if (!channel) continue;
        if (channel === "wood") {
            if (!canUseLocalStore) continue;
            const isTimber = id !== "firewood" && id !== "charcoal";
            const accepted = addLocalOutput(building, isTimber ? "logs" : "firewood", amount,
                { cause: "forest-delivery" });
            if (accepted <= 0) continue;
            ledger.stock[id] -= accepted;
            if (isTimber) { delivered.logs += accepted; requestHaul(building, "logs", accepted); }
            else { delivered.firewood += accepted; requestHaul(building, "firewood", accepted); }
            goods.push({ id, to: isTimber ? "logs" : "firewood", amount: accepted });
            continue;
        }
        if (channel === "medicine") {
            const accepted = addMedicineStock(amount);
            if (accepted <= 0) continue;
            ledger.stock[id] -= accepted;
            delivered.medicine += accepted;
            goods.push({ id, to: "medicine", amount: accepted });
            continue;
        }
        if (channel === "food") {
            const spoiled = Math.min(amount, Math.floor(amount * spoilage * 0.2));
            const accepted = amount - spoiled;
            ledger.stock[id] -= amount;
            delivered.spoiled += spoiled;
            if (accepted > 0) {
                addResource("food", accepted);
                recordResourceMovement("food", accepted, "forest-delivery", {
                    from: { kind: "building", id: building.id }, to: { kind: "realm", id: "royal-stores" },
                });
                delivered.food += accepted;
            }
            if (accepted > 0 || spoiled > 0) goods.push({
                id, to: "food", amount: accepted, ...(spoiled > 0 ? { spoiled } : {}),
            });
            continue;
        }
        if (channel === "gold") {
            const value = Math.max(1, Math.round(amount * 0.5 * (riverTrade ? 1.5 : 1)));
            addResource("gold", value);
            ledger.stock[id] -= amount;
            delivered.gold += value;
            goods.push({ id, to: "gold", amount, value, ...(riverTrade ? { riverTrade: true } : {}) });
        }
    }
    if (!goods.length) return { ok: false, reason: canUseLocalStore ? "No deliverable forest products" : "This forester has no food, medicine or market goods to deliver" };
    return {
        ok: true, delivered, goods, riverTrade,
        total: goods.reduce((sum, good) => sum + good.amount, 0),
        buildingId: building.id,
    };
}

// Curing and tanning turn raw wild products into storable processed goods. The
// quality bands travel with each unit, so a prime hide remains a prime hide.
export function processForestHunt(limit = 2, options = {}) {
    const ledger = ensureForestGathering();
    const perGood = Math.max(1, Math.min(5, Math.floor(number(limit, 2))));
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    const processed = [];
    for (const [raw, finished] of Object.entries(PROCESSED_FROM)) {
        const available = Math.max(0, Math.floor(number(ledger.stock[raw])));
        if (!available) continue;
        for (const part of takeHuntStock(ledger, raw, Math.min(perGood, available))) {
            const accepted = addStock(ledger, finished, part.amount, part.quality);
            if (accepted > 0) processed.push({ from: raw, to: finished, amount: accepted, quality: part.quality });
        }
    }
    if (!processed.length) return { ok: false, reason: "No raw wild meat, furs or hides to process" };
    ledger.history.push({
        x: 0, y: 0, day, year, kind: "process",
        goods: processed.map(good => ({ id: good.to, amount: good.amount, quality: good.quality })),
    });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return { ok: true, processed, total: processed.reduce((sum, good) => sum + good.amount, 0) };
}

export function gatherNearestForestProducts(x, y, radius = GATHER_RADIUS) {
    const node = findNearestResourceNode("forest", x, y, radius);
    if (!node) return { ok: false, reason: "No forest in working range" };
    return gatherForestProducts(node.x, node.y);
}

function meadowContextAt(x, y, options = {}) {
    return {
        seed: Number(state.worldSeed) || 1,
        moisture: getMoistureAt(x + 0.5, y + 0.5),
        temperature: getTemperatureAt(x + 0.5, y + 0.5),
        height: getHeightAt(x + 0.5, y + 0.5),
        climate: state.worldOptions?.climate || "temperate",
        aridity: state.worldOptions?.aridity ?? 50,
        forests: state.worldOptions?.forests ?? 52,
        seaLevel: Number(state.seaLevel) || 0.33,
        dayOfYear: options.dayOfYear ?? state.dayOfYear,
        year: options.year ?? state.year,
        hour: Number(state.timeOfDay) || 12,
        weather: state.weather || "clear",
        wind: String(state.weather || "").toLowerCase() === "storm" ? 2 : 1,
        use: grasslandUseAt(x, y),
    };
}

// Meadow gathering uses the same ledger and daily cooldown as woodland
// gathering. Hay, grass, wildflowers, orchard fruit, reeds, turf, herbs and
// honey therefore reach the existing economy without a second inventory.
export function gatherMeadowProducts(x, y, options = {}) {
    const ledger = ensureForestGathering();
    const context = meadowContextAt(x, y, options);
    // Tundra, desert and steppe are still forage land. The same button and
    // ledger serve all four profiles; the terrain decides which harvest
    // vocabulary is present. Cold ground wins over the arid margins.
    const products = (isTundraSite(x, y, context) ? tundraProductsAt(x, y, context) : null)
        || (isDesertSite(x, y, context) ? desertProductsAt(x, y, context) : null)
        || (isSteppeSite(x, y, context) ? steppeProductsAt(x, y, context) : null)
        || grasslandProductsAt(x, y, context);
    if (!products) return { ok: false, reason: "No harvestable grassland at this tile" };
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    if (!isValidGather(ledger, products.x, products.y, day, year)) {
        return { ok: false, reason: "This meadow was already gathered today" };
    }
    const candidates = products.goods.filter(good => FOREST_GOODS[good.id]).slice(0, 5);
    if (!candidates.length) return { ok: false, reason: "No seasonal meadow product is available" };
    const gathered = [];
    for (const good of candidates) {
        const amount = Math.max(1, Math.round(1 + good.abundance * 3));
        const accepted = addStock(ledger, good.id, amount);
        if (accepted > 0) gathered.push({ ...good, amount: accepted });
    }
    if (!gathered.length) return { ok: false, reason: "The meadow products could not be gathered" };
    ledger.lastGather[products.x + ":" + products.y] = { day, year };
    const keys = Object.keys(ledger.lastGather);
    if (keys.length > MAX_LAST_GATHER) {
        for (const key of keys.slice(0, keys.length - MAX_LAST_GATHER)) delete ledger.lastGather[key];
    }
    ledger.history.push({
        x: products.x, y: products.y, day, year, kind: "gather",
        goods: gathered.map(good => ({ id: good.id, amount: good.amount })),
    });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true,
        tile: { x: products.x, y: products.y, type: products.profile.formation, label: products.label },
        goods: gathered,
        fauna: products.fauna,
        use: products.use,
        total: gathered.reduce((sum, good) => sum + good.amount, 0),
    };
}

export function gatherNearestGrasslandProducts(x, y, radius = GATHER_RADIUS) {
    const limit = Math.max(1, Math.min(16, Math.floor(number(radius, GATHER_RADIUS))));
    let best = null;
    for (let ty = Math.floor(y) - limit; ty <= Math.floor(y) + limit; ty++) {
        for (let tx = Math.floor(x) - limit; tx <= Math.floor(x) + limit; tx++) {
            if (tx < 0 || ty < 0) continue;
            const node = getResourceNodeAt(tx, ty);
            if (node?.forestCapacity && node.forestStock > 0) continue;
            const context = meadowContextAt(tx, ty);
            const products = (isTundraSite(tx, ty, context) ? tundraProductsAt(tx, ty, context) : null)
                || (isDesertSite(tx, ty, context) ? desertProductsAt(tx, ty, context) : null)
                || (isSteppeSite(tx, ty, context) ? steppeProductsAt(tx, ty, context) : null)
                || grasslandProductsAt(tx, ty, context);
            if (!products) continue;
            if (!best || products.goods.length > best.products.goods.length) best = { products, tx, ty };
        }
    }
    if (!best) return { ok: false, reason: "No meadow in working range" };
    return gatherMeadowProducts(best.tx, best.ty);
}

// Player-directed thinning removes crowded stems and sends the usable logs to
// the yard. It complements the Forester's automatic planting instead of
// introducing a second forest-stock model.
// Availability deliberately ignores output-store space. A full yard must still
// expose the action so a click can report the refusal; removing stock first
// would silently destroy timber. The action checks capacity before harvesting.
export function forestThinningAvailability(building, radius = 6) {
    if (!building || building.dead || building.isBuilding?.() !== true || building.type !== TYPE.LUMBER) {
        return { ok: false, reason: "A completed lumber yard is required" };
    }
    if (building.construction && Number(building.construction.stage) < 3) {
        return { ok: false, reason: "The lumber yard is still under construction" };
    }
    const node = findNearestResourceNode("forest", building.x, building.y, radius);
    if (!node) return { ok: false, reason: "No forest in thinning range" };
    const point = getResourceNodeAt(node.x, node.y);
    if (!point?.forestCapacity) return { ok: false, reason: "No forest in thinning range" };
    const stockBefore = Math.max(0, Math.floor(number(point.forestStock)));
    const capacity = Math.max(1, Math.floor(number(point.forestCapacity)));
    if (stockBefore < capacity * 0.55) return { ok: false, reason: "The nearest stand is too depleted to thin" };
    return { ok: true, node, point, stockBefore, capacity };
}

export function thinNearestForest(building, radius = 6) {
    const availability = forestThinningAvailability(building, radius);
    if (!availability.ok) return availability;
    const { node, point, stockBefore } = availability;
    const space = outputSpace(building);
    if (space <= 0) return { ok: false, reason: "The lumber yard's output store is full" };
    const wanted = Math.max(1, Math.min(12, Math.floor(stockBefore * 0.12), space));
    const taken = harvestForest(node.x, node.y, wanted);
    if (taken <= 0) return { ok: false, reason: "The nearest stand could not be thinned" };
    const accepted = addLocalOutput(building, "logs", taken, { cause: "forest-thinning" });
    if (accepted > 0) requestHaul(building, "logs", accepted);
    return {
        ok: true, taken, accepted, x: node.x, y: node.y,
        stockBefore, stockAfter: Math.max(0, stockBefore - taken),
    };
}

export function forestGatheringSummary(limit = 4) {
    const ledger = activeLedger();
    if (!ledger) return "";
    return Object.entries(ledger.stock)
        .filter(([, amount]) => Number(amount) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
        .slice(0, Math.max(1, Math.floor(limit)))
        .map(([id, amount]) => {
            const base = (FOREST_GOODS[id]?.label || id) + " " + Math.floor(Number(amount));
            const row = ledger.quality?.[id];
            if (!row || typeof row !== "object") return base;
            const detail = QUALITY_TIERS
                .filter(quality => Number(row[quality]) > 0)
                .map(quality => quality + " " + Math.floor(Number(row[quality])))
                .join(" · ");
            return detail ? base + " (" + detail + ")" : base;
        })
        .join(" · ");
}

export function spoilForestGoods(days = 1) {
    const ledger = activeLedger();
    if (!ledger) return 0;
    if ((state.worldOptions?.climate || "temperate") !== "tropical") return 0;
    const elapsed = Math.max(0, Math.min(30, number(days, 0)));
    if (!elapsed) return 0;
    const risk = Math.min(0.22, (0.035 + (state.weather === "rain" ? 0.025 : 0)
        + (state.seasonIndex === 1 ? 0.01 : 0)) * elapsed);
    const durable = new Set(["hides", "feathers"]);
    let lost = 0;
    for (const [id, raw] of Object.entries(ledger.stock)) {
        const entry = FOREST_GOODS[id];
        if (!entry || !["gather", "hunt"].includes(entry.category) || durable.has(id)) continue;
        const amount = Math.max(0, Math.floor(number(raw)));
        const spoil = Math.min(amount, Math.floor(amount * risk));
        if (spoil <= 0) continue;
        ledger.stock[id] = amount - spoil;
        lost += spoil;
    }
    return lost;
}

export function serializeForestGathering() {
    const ledger = activeLedger();
    if (!ledger) return emptyLedger();
    const stock = {};
    const totalGathered = {};
    const quality = {};
    for (const [id, amount] of Object.entries(ledger.stock)) {
        if (FOREST_GOODS[id] && Number(amount) > 0) stock[id] = Math.min(MAX_STOCK, Math.floor(Number(amount)));
    }
    for (const [id, amount] of Object.entries(ledger.totalGathered)) {
        if (FOREST_GOODS[id] && Number(amount) > 0) totalGathered[id] = Math.min(MAX_STOCK, Math.floor(Number(amount)));
    }
    for (const [id, row] of Object.entries(ledger.quality || {})) {
        if (!FOREST_GOODS[id] || !HUNT_GOODS.has(id) || !row || typeof row !== "object") continue;
        const clean = {};
        for (const tier of QUALITY_TIERS) {
            const amount = Math.floor(number(row[tier]));
            if (amount > 0) clean[tier] = Math.min(MAX_STOCK, amount);
        }
        if (Object.keys(clean).length) quality[id] = clean;
    }
    return {
        version: VERSION,
        stock,
        totalGathered,
        quality,
        history: ledger.history.slice(-MAX_HISTORY).map(entry => ({
            x: Math.floor(number(entry.x)), y: Math.floor(number(entry.y)),
            day: Math.floor(number(entry.day)), year: Math.floor(number(entry.year, 1)),
            kind: entry.kind === "process" ? "process" : "gather",
            goods: (entry.goods || []).filter(good => good && FOREST_GOODS[good.id]).map(good => ({
                id: good.id, amount: Math.max(0, Math.floor(number(good.amount))),
                ...(QUALITY_TIERS.includes(good.quality) ? { quality: good.quality } : {}),
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
    if (snapshot.quality !== undefined) {
        if (!snapshot.quality || typeof snapshot.quality !== "object" || Array.isArray(snapshot.quality)) {
            throw new Error("Save data contains an invalid forest product quality map.");
        }
        for (const [id, row] of Object.entries(snapshot.quality)) {
            if (!FOREST_GOODS[id] || !HUNT_GOODS.has(id) || !row || typeof row !== "object" || Array.isArray(row)) {
                throw new Error("Save data contains an invalid forest product quality entry.");
            }
            for (const [quality, amount] of Object.entries(row)) {
                if (!QUALITY_TIERS.includes(quality) || !Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > MAX_STOCK) {
                    throw new Error("Save data contains an invalid forest product quality amount.");
                }
            }
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
            if (!good || !FOREST_GOODS[good.id] || !Number.isFinite(Number(good.amount)) || Number(good.amount) < 0
                || (good.quality !== undefined && !QUALITY_TIERS.includes(good.quality))) {
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
    // A rejected import can reach this restore path with no forest snapshot.
    // Do not create an otherwise absent ledger here: the active realm must stay
    // byte-for-byte unchanged when validation rejects the incoming save.
    if (!snapshot) return 0;
    resetForestGathering();
    validateForestGatheringSnapshot(snapshot);
    const ledger = state.forestGathering;
    for (const [id, amount] of Object.entries(snapshot.stock || {})) {
        if (FOREST_GOODS[id]) ledger.stock[id] = Math.max(0, Math.floor(number(amount)));
    }
    for (const [id, amount] of Object.entries(snapshot.totalGathered || {})) {
        if (FOREST_GOODS[id]) ledger.totalGathered[id] = Math.max(0, Math.floor(number(amount)));
    }
    for (const [id, row] of Object.entries(snapshot.quality || {})) {
        if (!FOREST_GOODS[id] || !HUNT_GOODS.has(id) || !row || typeof row !== "object") continue;
        const clean = {};
        for (const quality of QUALITY_TIERS) {
            if (Number(row[quality]) > 0) clean[quality] = Math.max(0, Math.floor(number(row[quality])));
        }
        if (Object.keys(clean).length) ledger.quality[id] = clean;
    }
    ledger.history = (snapshot.history || []).map(entry => ({
        x: Math.floor(number(entry.x)), y: Math.floor(number(entry.y)),
        day: Math.floor(number(entry.day)), year: Math.floor(number(entry.year, 1)),
        kind: entry.kind === "process" ? "process" : "gather",
        goods: (entry.goods || []).filter(good => good && FOREST_GOODS[good.id]).map(good => ({
            id: good.id, amount: Math.max(0, Math.floor(number(good.amount))),
            ...(QUALITY_TIERS.includes(good.quality) ? { quality: good.quality } : {}),
        })),
    }));
    ledger.lastGather = Object.fromEntries(Object.entries(snapshot.lastGather || {}).map(([key, value]) => [key, {
        day: Math.floor(number(value.day)), year: Math.floor(number(value.year, 1)),
    }]));
    return Object.keys(ledger.stock).length;
}

export const FOREST_GATHERING_LIMITS = Object.freeze({ version: VERSION, maxHistory: MAX_HISTORY, maxStock: MAX_STOCK, qualityTiers: QUALITY_TIERS });
