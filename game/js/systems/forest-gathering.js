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
import { BIOME_RESOURCE_BY_ID } from "../world/biome-resource-data.js";
import { grasslandProductsAt } from "../world/grassland-ecology.js";
import { isSteppeSite, steppeProductsAt } from "../world/steppe-ecology.js";
import { isDesertSite, desertProductsAt } from "../world/desert-ecology.js";
import { isTundraSite, tundraProductsAt } from "../world/tundra-ecology.js";
import { isSnowSite, snowProductsAt } from "../world/snow-ecology.js";
import { isTaigaSite, taigaProductsAt, TAIGA_GOODS } from "../world/taiga-ecology.js";
import { isSavannaSite, savannaProductsAt, SAVANNA_GOODS } from "../world/savanna-ecology.js";
import { isSwampSite, swampProductsAt, swampProfileAt, SWAMP_GOODS } from "../world/swamp-ecology.js";
import {
    SWAMP_WORKS, applySwampWork, swampWorkAt, swampWorkReady, swampWorksSummaryAt,
} from "../world/swamp-works.js";
import { isMountainSite, mountainProductsAt, mountainProfileAt, MOUNTAIN_GOODS } from "../world/mountain-ecology.js";
import { isVolcanoSite, volcanoProductsAt, volcanoProfileAt, VOLCANO_GOODS } from "../world/volcano-ecology.js";
import {
    VOLCANO_WORKS, applyVolcanoWork, volcanoWorkAt, volcanoWorkReady, volcanoWorksSummaryAt, volcanoWorkUseAt,
} from "../world/volcano-works.js";
import { COAST_GOODS, coastProductsAt, coastProfileAt, isCoastSite } from "../world/coast-ecology.js";
import {
    COAST_WORKS, applyCoastWork, coastWorkAt, coastWorkReady, coastWorksSummaryAt, coastWorkUseAt,
} from "../world/coast-works.js";
import {
    MOUNTAIN_WORKS, applyMountainWork, mountainWorkAt, mountainWorkReady, mountainWorksSummaryAt,
} from "../world/mountain-works.js";
import { grasslandUseAt } from "./grassland-use.js";
import { transitionGameplayAt } from "../world/transition-biomes.js";
import { vegetationDensityAt } from "../world/vegetation-density.js";
import { TROPICAL_GOODS } from "../world/tropical-ecology.js";
import {
    findNearestResourceNode, getResourceNodeAt, getResourceSiteAt, harvestForest,
} from "./resource-geography.js";
import { addMedicineStock, tropicalExposure } from "./health.js";
import { harvestForestGameAt } from "./forest-fauna.js";
import { addLocalOutput, depositGood, outputSpace, requestHaul } from "./logistics.js";
import { REGIONAL_TIMBER_SET } from "./city-config.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { isHazardForageBlocked } from "./hazard-scars.js";

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
    "orchard-fruit", "dates", "cloudberry", "crowberry", "arctic-char", "lake-fish", "crab",
]));
const GOLD_DELIVERY = Object.freeze(new Set([
    "fur", "hides", "tanned-fur", "cured-hides", "resin", "beeswax", "herbs", "lichen",
    "bark", "linden-flower", "elm-seeds", "alder-cones", "yew-berries", "dwarf-pine-cones",
    "ash-keys", "hornbeam-seeds", "willow-withies", "woodruff", "valerian", "tinder-fungus",
    "hay", "meadow-grass", "wildflowers", "reed", "turf", "salt", "wool",
    "desert-sand", "desert-stone", "gemstones", "copper-ore", "desert-fibre", "desert-resin", "archaeological-find",
    "antler", "bone", "peat", "soapstone", "bog-iron", "qiviut", "larch-cones", "birch-bark",
    "dune-grass", "serpentine-stone",
]));
const TROPICAL_GOLD_HUNT = Object.freeze(new Set(["hides", "feathers"]));

// Every catalogued forest good must have a market quote. Existing biome trade
// values are the first source; a few forest-only ids and the category fallback
// cover the rest. These are unit quotes, not a parallel currency: a sale pays
// into the same gold treasury and is booked in the goods book.
const FOREST_GOOD_PRICE_ALIASES = Object.freeze({
    beeswax: "wax", truffles: "truffle", "juniper-berries": "juniper", reed: "reeds",
});
const FOREST_GOOD_PRICE_OVERRIDES = Object.freeze({
    honey: 3.8, "maple-syrup": 2.8, "birch-sap": 1.4, "linden-flower": 2.4,
    acorns: 0.7, beechnuts: 0.8, chestnuts: 1.0, hazelnuts: 1.3,
    "spruce-cones": 0.7, "fir-cones": 0.7, "pine-cones": 0.7, "dwarf-pine-cones": 0.9,
    "tanned-fur": 4.4, "cured-hides": 3.0, "yew-berries": 1.8, "willow-withies": 1.1,
    "tinder-fungus": 1.6, "steppe-fibre": 1.0, "steppe-grass": 0.45, clay: 0.9,
});
const FOREST_GOOD_CATEGORY_PRICE = Object.freeze({
    wood: 1.0, gather: 0.9, mast: 0.7, hunt: 1.8, medicine: 2.2, luxury: 4.0,
    poison: 2.5, fibre: 1.0, resin: 1.8, fodder: 0.45, material: 0.9,
    food: 1.1, fruit: 1.0, spice: 2.8, grain: 0.8, fish: 1.2, meat: 1.5,
    honey: 3.8, fungus: 1.2, dairy: 1.4, egg: 1.1, dye: 2.2, salt: 1.0,
    stone: 1.0, ore: 3.0, gem: 5.0, crystal: 4.0,
});
const FOREST_SEASON_PRICE = Object.freeze([0.94, 1, 1.06, 1.12]);

function forestSeasonPriceFactor() {
    return FOREST_SEASON_PRICE[Number(state.seasonIndex) || 0] || 1;
}

function forestFoodDemandFactor() {
    const food = Number(state.market?.prices?.food);
    return Number.isFinite(food) && food > 0 ? clamp(food / 2, 0.8, 1.4) : 1;
}

/** Unit market quote for a forest good, in gold. */
export function forestGoodMarketPrice(id) {
    const good = FOREST_GOODS[id];
    if (!good) return 0;
    const alias = FOREST_GOOD_PRICE_ALIASES[id] || id;
    const catalogValue = Number(BIOME_RESOURCE_BY_ID[alias]?.tradeValue);
    const base = FOREST_GOOD_PRICE_OVERRIDES[id]
        ?? (Number.isFinite(catalogValue) && catalogValue > 0 ? catalogValue : null)
        ?? FOREST_GOOD_CATEGORY_PRICE[good.category]
        ?? 0.9;
    const demand = forestDeliveryChannel(id) === "food" ? forestFoodDemandFactor() : 1;
    return Math.max(0.25, Math.round(base * demand * forestSeasonPriceFactor() * 100) / 100);
}

/** What the player can do with a forest good today. */
export function forestGoodUseLabel(id) {
    const good = FOREST_GOODS[id];
    if (!good) return "";
    const channel = forestDeliveryChannel(id);
    if (channel === "wood") return id === "firewood" || id === "charcoal" ? "fuel / hearths" : "logs → planks";
    if (channel === "food") return "food / market";
    if (channel === "medicine") return "healer / market";
    if (good.category === "mast") return "pannage / market";
    return "market";
}

/** Gold a sale of this many units would pay at today's quote. */
export function forestGoodSaleValue(id, amount = 1) {
    const units = Math.max(0, Math.floor(number(amount)));
    if (!units || !FOREST_GOODS[id]) return 0;
    return Math.max(1, Math.round(units * forestGoodMarketPrice(id)));
}

export function forestDeliveryChannel(id) {
    const good = FOREST_GOODS[id];
    if (!good) return null;
    if (good.category === "wood") return "wood";
    if (good.category === "medicine") return "medicine";
    if (FOOD_DELIVERY.has(id)) return "food";
    if (GOLD_DELIVERY.has(id)) return "gold";
    const taiga = TAIGA_GOODS[id];
    if (taiga) {
        if (taiga.category === "medicine") return "medicine";
        if (taiga.category === "wood") return "wood";
        if (id === "lake-fish") return "food";
        return "gold";
    }
    const savanna = SAVANNA_GOODS[id];
    if (savanna) {
        if (["sorghum", "millet", "marula-fruit", "baobab-fruit", "meat"].includes(id)) return "food";
        if (["gum-arabic", "savanna-salt", "thorn-branches", "termite-earth", "charcoal", "ivory", "baobab-fibre", "thatching-grass"].includes(id)) return "gold";
        return "gold";
    }
    const swamp = SWAMP_GOODS[id];
    if (swamp) {
        if (swamp.category === "wood") return "wood";
        if (swamp.category === "medicine") return "medicine";
        if (["bog-cranberry", "bog-bean", "water-lily", "cattail-flour", "waterfowl", "marsh-fish"].includes(id)) return "food";
        if (["bog-orchid", "sphagnum", "reed-matting", "bog-cotton", "swamp-mud"].includes(id)) return "gold";
        return "gold";
    }
    const mountain = MOUNTAIN_GOODS[id];
    if (mountain) {
        if (mountain.category === "wood") return "wood";
        if (mountain.category === "medicine") return "medicine";
        return "gold";
    }
    const volcano = VOLCANO_GOODS[id];
    if (volcano) {
        if (volcano.category === "wood") return "wood";
        if (volcano.category === "medicine") return "medicine";
        if (volcano.category === "food") return "food";
        return "gold";
    }
    const coast = COAST_GOODS[id];
    if (coast) {
        if (coast.category === "wood") return "wood";
        if (coast.category === "food") return "food";
        if (coast.category === "medicine") return "medicine";
        return "gold";
    }
    const tropical = TROPICAL_GOODS[id];
    if (!tropical) return "gold";
    if (tropical.category === "gather" || tropical.category === "hunt") {
        return TROPICAL_GOLD_HUNT.has(id) ? "gold" : "food";
    }
    if (["fibre", "resin", "luxury", "poison"].includes(tropical.category)) return "gold";
    return "gold";
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
    // 1.2.18: the same local density the terrain draws now prices work, sight,
    // cover, concealment and hunting. Dense undergrowth slows a visit; an open
    // woodland edge is easier to work and offers a clearer shot.
    const vegetation = vegetationDensityAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1, year: Number(state.year) || 1,
        dayOfYear: day, climate, height: terrainHeight, moisture, temperature,
        stand, use: grasslandUseAt(x, y),
    });
    // The regional work effect is a real labour cost, not a panel number. It
    // now shapes the same visit that gathering actually performs; before this,
    // only the inspector's node applied it and the gather path bypassed it.
    const regionalWork = clamp(number(stand.regionalEffects?.work, 1), 0.7, 1.15);
    const workFactor = clamp((1 - snow.depth * 0.38 - (1 - (Number(stand.visibility) || 0)) * 0.12
        - tropicalPenalty * 0.55 - junglePenalty * 0.22) * regionalWork, 0.3, 1);
    // Flood-prone stands spoil their perishable harvest faster. The effect is
    // capped and only applies to the bounded gather visit, never to stored
    // warehouse goods.
    const floodRisk = Math.max(0, number(stand.regionalEffects?.flood, 0));
    const spoilageRisk = clamp(number(stand.tropical?.hazard?.spoilage, 0) + floodRisk * 0.12, 0, 0.9);
    return {
        x: Math.floor(x), y: Math.floor(y), node, stand,
        dynamics: stand.dynamics || null,
        working: stand.dynamics?.working || null,
        snowDepthCm: snow.cm,
        visibility: Number(stand.visibility) || 0,
        workFactor,
        vegetation,
        sight: vegetation.sight,
        movement: vegetation.movement,
        cover: vegetation.cover,
        concealment: vegetation.concealment,
        huntFactor: clamp(0.76 + vegetation.hunting * 0.3, 0.76, 1.06),
        hazard: stand.tropical?.hazard
            ? { ...stand.tropical.hazard, ...(stand.jungle?.hazards || {}) }
            : stand.jungle?.hazards || null,
        jungle: stand.jungle || null,
        jungleNavigation: stand.jungle?.navigation || null,
        landUse: stand.tropical?.landUse || null,
        spoilageRisk,
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

// Gathering reads the named seam at the visited tile, not the realm average.
// A missing terrain fixture leaves the historical yield unchanged.
function ecotoneGatherFactor(x, y, kind) {
    if (!state.heightMap || !Number(state.terrainPixW) || !Number(state.terrainPixH)) return 1;
    const gameplay = transitionGameplayAt(x + 0.5, y + 0.5, {
        dayOfYear: state.dayOfYear, year: state.year,
    });
    const bonus = kind === "forest" ? gameplay?.forest : gameplay?.forage;
    return Math.max(0.75, Math.min(1.30, 1 + (Number(bonus) || 0)));
}

export function gatherForestProducts(x, y, options = {}) {
    const ledger = ensureForestGathering();
    const products = forestProductsAt(x, y, options.dayOfYear ?? state.dayOfYear);
    if (!products) return { ok: false, reason: "No living forest at this tile" };
    if (isHazardForageBlocked(products.x, products.y)) {
        return { ok: false, reason: "Forbidden or corrupted growth makes this wood unsafe to gather" };
    }
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
    // A working visit always brings back some wood when the stand carries it;
    // the richer honey/berry/mast list must not crowd the timber out of the
    // five-item selection.
    const woodGood = products.goods.find(good => good.category === "wood" && FOREST_GOODS[good.id]);
    if (woodGood && !candidates.some(good => good.id === woodGood.id)) candidates.push(woodGood);
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
    const ecotoneFactor = ecotoneGatherFactor(products.x, products.y, "forest");
    const vegetationFactor = clamp(number(products.vegetation?.yield, 1), 0.74, 1.12);
    const huntFactor = clamp(number(products.huntFactor, 1), 0.76, 1.06);
    // Regional effects now price the actual harvest: timber for wood, forage
    // for everything else, and a small ecotone bonus where two type windows
    // overlap. All values are bounded so a single type cannot dominate the
    // ledger.
    const regionalEffects = products.stand.regionalEffects || {};
    const forageFactor = clamp(number(regionalEffects.forage, 1), 0.75, 1.35);
    const timberFactor = clamp(number(regionalEffects.timber, 1), 0.7, 1.35);
    const dynamics = products.stand.dynamics || null;
    const goodsBoost = dynamics?.goods?.boost || {};
    const managementTimber = clamp(number(dynamics?.silviculture?.timberFactor, 1), 0.75, 1.1);
    const transitionFactor = 1 + clamp(number(products.stand.regionalTransitionShare, 0), 0, 0.5) * 0.12;
    const character = products.stand.regionalCharacter || null;
    const signature = character?.signature || null;
    const bountyActive = Boolean(signature)
        && Math.floor(Number(character.season) || 0) === Math.max(0, Math.min(3, Math.floor(Number(state.seasonIndex) || 0)));
    // A signature good is part of the field character, so it must be offered
    // even when the generic five-slot selection would omit it.
    if (signature && FOREST_GOODS[signature] && products.goods.some(good => good.id === signature)
        && !candidates.some(good => good.id === signature)) {
        candidates.push({ ...FOREST_GOODS[signature], abundance: 0.4 });
    }
    const bounty = bountyActive && signature
        ? { good: signature, label: FOREST_GOODS[signature]?.label || signature, season: character.seasonLabel, amount: 0 }
        : null;
    for (const good of candidates) {
        // Timber keeps the historical stock contract; the local density shapes
        // the gathered plant/food abundance and the distinct hunting factor.
        const densityYield = good.category === "wood" ? 1 : vegetationFactor;
        const regionalYield = good.category === "wood" ? timberFactor : forageFactor * transitionFactor;
        const dynamicsYield = good.category === "wood" ? managementTimber : clamp(number(goodsBoost[good.id], 1), 0.75, 1.3);
        let amount = Math.max(1, Math.round((1 + good.abundance * 3) * workFactor * ecotoneFactor
            * densityYield * regionalYield * dynamicsYield));
        if (bounty && good.id === signature) { amount += 1; bounty.amount += 1; }
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
            amount = Math.max(1, Math.round((good.id === "game" ? Math.max(1, hunt.taken * 2) : Math.max(1, Math.ceil(hunt.taken / 2))) * huntFactor));
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
        ecotoneFactor,
        regional: {
            forage: forageFactor,
            timber: timberFactor,
            work: clamp(number(regionalEffects.work, 1), 0.7, 1.15),
            transition: clamp(number(products.stand.regionalTransitionShare, 0), 0, 0.5),
            transitionLabel: products.stand.regionalTransitionLabel || null,
        },
        dynamics: dynamics ? {
            mixtureClass: dynamics.composition.mixtureClass,
            pioneerShare: dynamics.composition.pioneerShare,
            climaxShare: dynamics.composition.climaxShare,
            phase: dynamics.age.phase,
            seedBank: dynamics.regeneration.seedBank,
            motherTrees: dynamics.regeneration.motherTrees,
            geneticDiversity: dynamics.regeneration.geneticDiversity,
            siteFitness: dynamics.health.siteFitness,
            silviculturalSystem: dynamics.silviculture.system,
            mycorrhiza: dynamics.soil.mycorrhiza,
            humusForm: dynamics.soil.humusForm,
            lianaCover: dynamics.structure.lianaCover,
            epiphyteCover: dynamics.structure.epiphyteCover,
            herbLayer: dynamics.structure.herbLayer,
            working: dynamics.working ? {
                sawlog: dynamics.working.timber.sawlog,
                firewood: dynamics.working.timber.firewood,
                volume: dynamics.working.timber.volume,
                specialty: dynamics.working.timber.specialty,
                quality: dynamics.working.timber.quality,
                logShare: dynamics.working.timber.logShare,
                mushrooms: dynamics.working.forage.mushrooms,
                herbs: dynamics.working.forage.herbs,
                mast: dynamics.working.forage.mast,
                game: dynamics.working.forage.game,
                habitat: dynamics.working.habitat.score,
            } : null,
        } : null,
        bounty: bounty && bounty.amount > 0 ? bounty : null,
        vegetation: {
            density: products.vegetation?.density,
            band: products.vegetation?.band,
            habitat: products.vegetation?.habitat,
            sight: products.vegetation?.sight,
            movement: products.vegetation?.movement,
            cover: products.vegetation?.cover,
            concealment: products.vegetation?.concealment,
            hunting: products.vegetation?.hunting,
            yield: products.vegetation?.yield,
            structure: products.vegetation?.structure,
            microhabitats: products.vegetation?.microhabitats,
            microhabitatLabels: products.vegetation?.microhabitatLabels,
            requirements: products.vegetation?.requirements,
        },
        vegetationFactor,
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
        return { available: 0, food: 0, medicine: 0, wood: 0, gold: 0, summary: "", reason: "A lumber yard or forester is required" };
    }
    if (building.construction && Number(building.construction.stage) < 3) {
        return { available: 0, food: 0, medicine: 0, wood: 0, gold: 0, summary: "", reason: "The forest building is still under construction" };
    }
    const ledger = activeLedger();
    if (!ledger) return { available: 0, food: 0, medicine: 0, wood: 0, gold: 0, summary: "", reason: "No forest products have been gathered" };
    const canUseLocalStore = building.type === TYPE.LUMBER;
    let available = 0, food = 0, medicine = 0, wood = 0, gold = 0;
    for (const [id, raw] of Object.entries(ledger.stock)) {
        const amount = Math.max(0, Math.floor(number(raw)));
        if (!amount || !FOREST_GOODS[id]) continue;
        const channel = forestDeliveryChannel(id);
        if (!channel) continue;
        if (channel === "wood" && !canUseLocalStore) continue;
        available += amount;
        if (channel === "wood") wood += amount;
        else if (channel === "food") food += amount;
        else if (channel === "medicine") medicine += amount;
        else if (channel === "gold") gold += forestGoodSaleValue(id, amount);
    }
    const parts = [];
    if (food) parts.push(food + " food");
    if (medicine) parts.push(medicine + " medicine");
    if (wood) parts.push(wood + " timber/fuel");
    if (gold) parts.push(gold + "G market");
    return {
        available, food, medicine, wood, gold,
        summary: parts.join(" · "),
        reason: available > 0 ? "" : (canUseLocalStore
            ? "No deliverable forest products"
            : "This forester has no food, medicine or market goods to deliver"),
    };
}

// A market sale is the explicit alternative to delivery: food can fill the
// royal stores, or the player can take today's quote instead. Wood stays with
// the timber yard because logs, planks and fuel are the productive path.
export function forestSellAvailability(building) {
    if (!building || building.dead || building.isBuilding?.() !== true
        || ![TYPE.LUMBER, TYPE.FORESTER].includes(building.type)) {
        return { ok: false, available: 0, gold: 0, goods: [], reason: "A lumber yard or forester is required" };
    }
    if (building.construction && Number(building.construction.stage) < 3) {
        return { ok: false, available: 0, gold: 0, goods: [], reason: "The forest building is still under construction" };
    }
    const ledger = activeLedger();
    if (!ledger) return { ok: false, available: 0, gold: 0, goods: [], reason: "No forest products have been gathered" };
    let available = 0, gold = 0;
    const goods = [];
    for (const [id, raw] of Object.entries(ledger.stock)) {
        const amount = Math.max(0, Math.floor(number(raw)));
        if (!amount || !FOREST_GOODS[id] || forestDeliveryChannel(id) === "wood") continue;
        const value = forestGoodSaleValue(id, amount);
        if (value <= 0) continue;
        available += amount;
        gold += value;
        goods.push({
            id, amount, value, label: FOREST_GOODS[id].label,
            price: forestGoodMarketPrice(id), use: forestGoodUseLabel(id),
        });
    }
    return {
        ok: available > 0,
        available, gold, goods,
        reason: available > 0 ? "" : "No non-timber forest goods to sell",
        summary: goods.map(good => good.amount + " " + good.label + " (" + good.value + "G)").join(" · "),
    };
}

export function sellForestGoods(building) {
    const availability = forestSellAvailability(building);
    if (!availability.ok) return { ok: false, reason: availability.reason };
    const ledger = activeLedger();
    if (!ledger) return { ok: false, reason: "No forest products have been gathered" };
    const goods = [];
    let gold = 0, total = 0;
    for (const row of availability.goods) {
        const held = Math.max(0, Math.floor(number(ledger.stock[row.id])));
        const amount = Math.min(row.amount, held);
        if (amount <= 0) continue;
        const value = forestGoodSaleValue(row.id, amount);
        if (value <= 0) continue;
        ledger.stock[row.id] -= amount;
        gold += value;
        total += amount;
        goods.push({
            id: row.id, label: row.label, amount, price: forestGoodMarketPrice(row.id),
            value, use: forestGoodUseLabel(row.id), to: "gold",
        });
    }
    if (!goods.length || gold <= 0) return { ok: false, reason: "No non-timber forest goods to sell" };
    addResource("gold", gold);
    recordResourceMovement("gold", gold, "forest-market", {
        from: { kind: "building", id: building.id },
        to: { kind: "market", id: "forest-goods" },
        key: "forest-goods:" + building.id + ":" + state.tick,
    });
    state.statistics.totalTrades = Math.max(0, Number(state.statistics.totalTrades) || 0) + 1;
    return { ok: true, goods, total, gold, buildingId: building.id };
}

export function deliverForestGoods(building) {
    const availability = forestDeliveryAvailability(building);
    if (availability.available <= 0) return { ok: false, reason: availability.reason };
    const ledger = activeLedger();
    if (!ledger) return { ok: false, reason: "No forest products have been gathered" };
    const delivered = { logs: 0, timber: 0, firewood: 0, food: 0, gold: 0, medicine: 0, spoiled: 0 };
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
            // A named regional timber keeps its identity into the timber yard
            // so the sawmill can saw it and the market can price it. Generic
            // timber and old saves still become logs, exactly as before.
            const target = isTimber ? (REGIONAL_TIMBER_SET.has(id) ? id : "logs") : "firewood";
            const localAccepted = addLocalOutput(building, target, amount,
                { cause: "forest-delivery" });
            // A full yard store must not turn a real delivery into dead stock.
            // The remainder goes into the same filtered warehouse chain the
            // normal hauls use; the local store keeps first claim on space.
            const overflow = Math.max(0, amount - localAccepted);
            const stored = overflow > 0 ? depositGood(target, overflow, bx, by) : 0;
            const accepted = localAccepted + stored;
            if (accepted <= 0) continue;
            ledger.stock[id] -= accepted;
            if (target === "logs") delivered.logs += accepted;
            else if (target === "firewood") delivered.firewood += accepted;
            else delivered.timber += accepted;
            if (localAccepted > 0) requestHaul(building, target, localAccepted);
            goods.push({ id, to: target, amount: accepted, ...(stored > 0 ? { stored } : {}) });
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
            const price = forestGoodMarketPrice(id);
            const value = Math.max(1, Math.round(amount * price * (riverTrade ? 1.5 : 1)));
            addResource("gold", value);
            recordResourceMovement("gold", value, "forest-market", {
                from: { kind: "building", id: building.id },
                to: { kind: "market", id: "forest-goods" },
                key: "forest-goods:" + building.id + ":" + state.tick,
            });
            ledger.stock[id] -= amount;
            delivered.gold += value;
            goods.push({ id, to: "gold", amount, price, value, ...(riverTrade ? { riverTrade: true } : {}) });
        }
    }
    if (!goods.length) return { ok: false, reason: canUseLocalStore ? "No deliverable forest products" : "This forester has no food, medicine or market goods to deliver" };
    return {
        ok: true, delivered, goods, riverTrade,
        total: goods.reduce((sum, good) => sum + good.amount, 0),
        buildingId: building.id,
    };
}

/** Player-readable stock line: what each held good is for and what it is worth. */
export function forestGatheringEconomySummary(limit = 4) {
    const ledger = activeLedger();
    if (!ledger) return "";
    let marketGold = 0;
    const rows = [];
    for (const [id, raw] of Object.entries(ledger.stock)) {
        const amount = Math.max(0, Math.floor(number(raw)));
        if (!amount || !FOREST_GOODS[id]) continue;
        const channel = forestDeliveryChannel(id);
        const value = channel === "wood" ? 0 : forestGoodSaleValue(id, amount);
        marketGold += value;
        rows.push({
            id, amount, value, channel,
            label: FOREST_GOODS[id].label, use: forestGoodUseLabel(id),
        });
    }
    if (!rows.length) return "";
    rows.sort((a, b) => b.value - a.value || b.amount - a.amount || a.id.localeCompare(b.id));
    const shown = rows.slice(0, Math.max(1, Math.floor(limit)));
    const parts = shown.map(row => row.label + " " + row.amount + " → " + row.use
        + (row.value > 0 ? " (≈" + row.value + "G)" : ""));
    if (rows.length > shown.length) parts.push("+" + (rows.length - shown.length) + " more");
    if (marketGold > 0) parts.push("market quote " + marketGold + "G");
    return parts.join(" · ");
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
        use: {
            ...grasslandUseAt(x, y),
            ...(state.worldOptions?.climate === "mountain" ? mountainWorkUseAt(x, y) : {}),
            ...(state.worldOptions?.climate === "volcanic" ? volcanoWorkUseAt(x, y) : {}),
            ...(state.worldOptions?.climate === "coastal" ? coastWorkUseAt(x, y) : {}),
        },
    };
}

// Mountain works are a separate player action; their use flags are merged
// into the same context so the ecology profile and the works cannot disagree.
function mountainWorkUseAt(x, y) {
    try {
        return mountainWorkAt(x, y) ? Object.fromEntries(
            ["terraced", "valleySettlement", "fortress", "fortifiedPass", "road", "bridge", "mine", "quarry", "aqueduct"]
                .filter(flag => mountainWorkAt(x, y)?.[flag])
                .map(flag => [flag, true])
        ) : {};
    } catch { return {}; }
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
    const products = (isSnowSite(x, y, context) ? snowProductsAt(x, y, context) : null)
        || (isCoastSite(x, y, context) ? coastProductsAt(x, y, context) : null)
        || (isVolcanoSite(x, y, context) ? volcanoProductsAt(x, y, context) : null)
        || (isMountainSite(x, y, context) ? mountainProductsAt(x, y, context) : null)
        || (isSwampSite(x, y, context) ? swampProductsAt(x, y, context) : null)
        || (isTundraSite(x, y, context) ? tundraProductsAt(x, y, context) : null)
        || (isTaigaSite(x, y, context) ? taigaProductsAt(x, y, context) : null)
        || (isSavannaSite(x, y, context) ? savannaProductsAt(x, y, context) : null)
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
    const ecotoneFactor = ecotoneGatherFactor(products.x, products.y, "meadow");
    for (const good of candidates) {
        const amount = Math.max(1, Math.round((1 + good.abundance * 3) * ecotoneFactor));
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
        ecotoneFactor,
        fauna: products.fauna,
        use: products.use,
        total: gathered.reduce((sum, good) => sum + good.amount, 0),
    };
}

// --- Player-built wetland works and harvests (1.2.11.64–1.2.11.72) -------
//
// The meadow gather button already harvests reeds and peat as generic goods.
// These actions add the works that a wetland needs before it can be lived in:
// a boardwalk, a drainage cut, a stilt platform, a peat face, a fish trap and
// a managed reed bed. Every action shares the existing ledger and the existing
// daily cooldown; no second inventory and no extra simulation tick are added.

function swampWorkContextAt(x, y, options = {}) {
    return meadowContextAt(x, y, options);
}

function swampWorkSiteAt(x, y, options = {}) {
    const context = swampWorkContextAt(x, y, options);
    if (!isSwampSite(x, y, context)) return null;
    const profile = swampProfileAt(x + 0.5, y + 0.5, context);
    return profile?.swamp ? { profile, context } : null;
}

function swampWorkCost(def) {
    return Object.entries(def?.cost || {}).filter(([, amount]) => Number(amount) > 0);
}

function canPaySwampWork(def) {
    return swampWorkCost(def).every(([resource, amount]) =>
        (Number(state.resources?.[resource]) || 0) >= Number(amount));
}

function paySwampWork(def) {
    if (!canPaySwampWork(def)) return false;
    for (const [resource, amount] of swampWorkCost(def)) addResource(resource, -Number(amount));
    return true;
}

function swampWorkEcologicalReason(kind, profile) {
    if (kind === "peat" && profile.economy.peatCutting < 0.18) return "No workable peat at this tile";
    if (kind === "fishing" && profile.economy.fish < 0.12) return "No fishable water at this tile";
    if (kind === "reeds" && profile.economy.reeds < 0.12) return "No standing reed bed at this tile";
    if (kind === "stilt" && profile.economy.settlement < 0.16) return "The ground is too soft for a stilt platform";
    if (kind === "drainage" && profile.water.waterLevel < 0.3) return "The ground is already dry enough";
    if (kind === "defence" && profile.economy.defence < 0.2) return "No reed or firm bank for a defence";
    return null;
}

export function swampWorkAvailability(x, y, options = {}) {
    const site = swampWorkSiteAt(x, y, options);
    if (!site) return { ok: false, reason: "No wetland at this tile", works: {} };
    const { profile } = site;
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const works = {};
    for (const [kind, definition] of Object.entries(SWAMP_WORKS)) {
        const ready = swampWorkReady(x, y, kind, day);
        const ecological = swampWorkEcologicalReason(kind, profile);
        const affordable = canPaySwampWork(definition);
        const reason = ready.reason || ecological || (affordable ? null
            : "Not enough " + swampWorkCost(definition).filter(([resource, amount]) => (Number(state.resources?.[resource]) || 0) < Number(amount)).map(([resource]) => resource).join(", "));
        works[kind] = { ...definition, ok: !reason, reason };
    }
    return {
        ok: true,
        profile,
        works,
        summary: swampWorksSummaryAt(x, y),
        title: profile.label + " · " + profile.water.label,
        audit: profile.features?.length || 0,
    };
}

export function performSwampWork(x, y, kind, options = {}) {
    const definition = SWAMP_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown wetland work" };
    const availability = swampWorkAvailability(x, y, options);
    if (!availability.ok) return { ok: false, reason: availability.reason };
    if (!availability.works[kind]?.ok) {
        return { ok: false, reason: availability.works[kind]?.reason || "This work is not possible here" };
    }
    const profile = availability.profile;
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    if (!paySwampWork(definition)) return { ok: false, reason: "The work could not be paid for" };
    const ledger = ensureForestGathering();
    const goods = [];
    const add = (id, amount) => {
        const accepted = addStock(ledger, id, Math.max(0, Math.floor(amount)));
        if (accepted > 0 && FOREST_GOODS[id]) {
            goods.push({ ...FOREST_GOODS[id], amount: accepted });
        }
        return accepted;
    };

    if (kind === "fishing") {
        add("marsh-fish", 3 + Math.round(profile.economy.fish * 4));
        if (profile.economy.waterfowl > 0.26) add("waterfowl", 1 + Math.round(profile.economy.waterfowl * 2));
    } else if (kind === "reeds") {
        add("reed", 4 + Math.round(profile.economy.reeds * 5));
        add("reed-matting", 1 + Math.round(profile.economy.basketry * 2));
    } else if (kind === "peat") {
        add("peat", 4 + Math.round(profile.economy.peatCutting * 5));
        add("swamp-mud", 1);
    }
    applySwampWork(x, y, kind, { day });
    const exposure = (kind === "fishing" || kind === "peat" || kind === "reeds")
        ? tropicalExposure({
            disease: clamp(profile.hazards.fever * 0.24, 0, 1),
            diseaseLabel: "marsh fever",
        }, { source: "wetland-work", x, y })
        : { outbreak: false, injury: false, foodLost: 0 };
    const record = swampWorkAt(x, y);
    if (record) {
        record.lastHarvest = record.lastHarvest || {};
        record.lastHarvest[kind] = day;
    }
    const summary = swampWorksSummaryAt(x, y);
    ledger.history.push({
        x: Math.floor(x), y: Math.floor(y), day, year, kind: "swamp-work",
        work: kind, goods: goods.map(good => ({ id: good.id, amount: good.amount })),
    });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true, kind, label: definition.label,
        tile: { x: Math.floor(x), y: Math.floor(y), label: profile.label, formation: profile.formation },
        goods, exposure, summary,
        message: definition.label.toUpperCase() + (goods.length ? " · " + goods.map(good => good.amount + " " + good.label).join(" · ") : " COMPLETED"),
    };
}

// --- Player-built mountain works and extraction (1.2.12.69–1.2.12.77) ----

function mountainWorkContextAt(x, y, options = {}) {
    const context = meadowContextAt(x, y, options);
    context.use = { ...context.use, ...mountainWorkUseAt(x, y) };
    return context;
}

function mountainWorkSiteAt(x, y, options = {}) {
    const context = mountainWorkContextAt(x, y, options);
    return isMountainSite(x, y, context) ? mountainProfileAt(x + 0.5, y + 0.5, context) : null;
}

function mountainWorkCost(def) {
    return Object.entries(def?.cost || {}).filter(([, value]) => Number(value) > 0);
}

function canPayMountainWork(def) {
    return mountainWorkCost(def).every(([resource, amount]) => (Number(state.resources?.[resource]) || 0) >= Number(amount));
}

function payMountainWork(def) {
    if (!canPayMountainWork(def)) return false;
    for (const [resource, amount] of mountainWorkCost(def)) addResource(resource, -Number(amount));
    return true;
}

function mountainWorkEcologicalReason(kind, profile) {
    if (kind === "terrace" && profile.landform.slope < 0.22) return "The slope is too gentle for terraces";
    if (kind === "village" && profile.economy.settlement < 0.18) return "No sheltered building ground at this tile";
    if (kind === "fort" && profile.landform.relative < 0.28) return "A summit fortress needs a real height advantage";
    if (kind === "passFort" && profile.economy.pass < 0.24) return "No pass or saddle at this tile";
    if (kind === "bridge" && profile.landform.gorge < 0.28) return "No gorge or ravine to bridge";
    if (kind === "mine" && profile.economy.mine < 0.2) return "No workable ore seam at this tile";
    if (kind === "quarry" && profile.economy.quarry < 0.2) return "No workable stone at this tile";
    if (kind === "aqueduct" && profile.water.water < 0.16) return "No spring or tarn to draw from";
    return null;
}

export function mountainWorkAvailability(x, y, options = {}) {
    const profile = mountainWorkSiteAt(x, y, options);
    if (!profile) return { ok: false, reason: "No mountain slope at this tile", works: {} };
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const works = {};
    for (const [kind, definition] of Object.entries(MOUNTAIN_WORKS)) {
        const ready = mountainWorkReady(x, y, kind, day);
        const ecological = mountainWorkEcologicalReason(kind, profile);
        const affordable = canPayMountainWork(definition);
        const reason = ready.reason || ecological || (affordable ? null
            : "Not enough " + mountainWorkCost(definition).filter(([resource, amount]) => (Number(state.resources?.[resource]) || 0) < Number(amount)).map(([resource]) => resource).join(", "));
        works[kind] = { ...definition, ok: !reason, reason };
    }
    return {
        ok: true, profile, works,
        summary: mountainWorksSummaryAt(x, y),
        title: profile.label + " · " + profile.landform.label,
        audit: profile.features?.length || 0,
    };
}

export function performMountainWork(x, y, kind, options = {}) {
    const definition = MOUNTAIN_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown mountain work" };
    const availability = mountainWorkAvailability(x, y, options);
    if (!availability.ok) return { ok: false, reason: availability.reason };
    if (!availability.works[kind]?.ok) return { ok: false, reason: availability.works[kind]?.reason || "This work is not possible here" };
    const profile = availability.profile;
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    if (!payMountainWork(definition)) return { ok: false, reason: "The work could not be paid for" };
    const ledger = ensureForestGathering();
    const goods = [];
    const add = (id, amount) => {
        const accepted = addStock(ledger, id, Math.max(0, Math.floor(amount)));
        if (accepted > 0 && FOREST_GOODS[id]) goods.push({ ...FOREST_GOODS[id], amount: accepted });
        return accepted;
    };
    if (kind === "mine") {
        add("iron-ore", 2 + Math.round(profile.economy.ore * 5));
        if (profile.economy.metals > 0.4) add("copper-ore", 1 + Math.round(profile.economy.metals * 3));
        if (profile.economy.gems > 0.5) add("gemstones", 1 + Math.round(profile.economy.gems * 2));
        if (profile.economy.salt > 0.52) add("salt", 1 + Math.round(profile.economy.salt * 3));
    } else if (kind === "quarry") {
        add("stone", 4 + Math.round(profile.economy.stone * 6));
        if (profile.economy.granite > 0.3) add("granite", 2 + Math.round(profile.economy.granite * 3));
        else if (profile.economy.limestone > 0.3) add("limestone", 2 + Math.round(profile.economy.limestone * 3));
        else if (profile.economy.slate > 0.3) add("slate", 2 + Math.round(profile.economy.slate * 3));
        else if (profile.economy.marble > 0.3) add("marble", 2 + Math.round(profile.economy.marble * 3));
    } else if (kind === "aqueduct") {
        add("mountain-water", 3 + Math.round(profile.economy.water * 4));
    }
    applyMountainWork(x, y, kind, { day });
    const exposure = (kind === "mine" || kind === "quarry" || kind === "road" || kind === "bridge")
        ? tropicalExposure({ disease: clamp(profile.hazards.avalanche * 0.2, 0, 1), diseaseLabel: "mountain exposure" }, { source: "mountain-work", x, y })
        : { outbreak: false, injury: false, foodLost: 0 };
    const record = mountainWorkAt(x, y);
    if (record) {
        record.lastHarvest = record.lastHarvest || {};
        record.lastHarvest[kind] = day;
    }
    ledger.history.push({ x: Math.floor(x), y: Math.floor(y), day, year, kind: "mountain-work", work: kind, goods: goods.map(good => ({ id: good.id, amount: good.amount })) });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true, kind, label: definition.label,
        tile: { x: Math.floor(x), y: Math.floor(y), label: profile.label, formation: profile.formation },
        goods, exposure, summary: mountainWorksSummaryAt(x, y),
        message: definition.label.toUpperCase() + (goods.length ? " · " + goods.map(good => good.amount + " " + good.label).join(" · ") : " COMPLETED"),
    };
}

// --- Player-built volcanic works and extraction (1.2.13.49–1.2.13.57) ---

function volcanoWorkContextAt(x, y, options = {}) {
    const context = meadowContextAt(x, y, options);
    context.use = { ...context.use, ...volcanoWorkUseAt(x, y) };
    return context;
}

function volcanoWorkSiteAt(x, y, options = {}) {
    const context = volcanoWorkContextAt(x, y, options);
    return isVolcanoSite(x, y, context) ? volcanoProfileAt(x + 0.5, y + 0.5, context) : null;
}

function volcanoWorkCost(def) {
    return Object.entries(def?.cost || {}).filter(([, value]) => Number(value) > 0);
}

function canPayVolcanoWork(def) {
    return volcanoWorkCost(def).every(([resource, amount]) => (Number(state.resources?.[resource]) || 0) >= Number(amount));
}

function payVolcanoWork(def) {
    if (!canPayVolcanoWork(def)) return false;
    for (const [resource, amount] of volcanoWorkCost(def)) addResource(resource, -Number(amount));
    return true;
}

function volcanoWorkEcologicalReason(kind, profile) {
    if (kind === "lavaQuarry" && profile.landform.basalt < 0.22) return "No workable basalt flow at this tile";
    if (kind === "obsidianQuarry" && profile.landform.obsidian < 0.28) return "No obsidian at this tile";
    if (kind === "pumiceQuarry" && profile.landform.pumice < 0.28) return "No pumice bed at this tile";
    if (kind === "sulfurMine" && profile.economy.sulfur < 0.24) return "No sulfur crust at this tile";
    if (kind === "metalMine" && profile.economy.mine < 0.2) return "No workable ore seam at this tile";
    if (kind === "mineralWorks" && profile.economy.minerals < 0.2) return "No mineral deposit at this tile";
    if (kind === "geothermalPlant" && profile.economy.geothermalPlant < 0.22) return "No strong geothermal source at this tile";
    if (kind === "fertileTerrace" && profile.economy.fertileSoil < 0.25) return "The ash is too fresh for a terrace";
    if (kind === "craterExpedition" && profile.economy.craterExpedition < 0.25) return "No rare crater materials to survey";
    return null;
}

export function volcanoWorkAvailability(x, y, options = {}) {
    const profile = volcanoWorkSiteAt(x, y, options);
    if (!profile) return { ok: false, reason: "No volcanic ground at this tile", works: {} };
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const works = {};
    for (const [kind, definition] of Object.entries(VOLCANO_WORKS)) {
        const ready = volcanoWorkReady(x, y, kind, day);
        const ecological = volcanoWorkEcologicalReason(kind, profile);
        const affordable = canPayVolcanoWork(definition);
        const reason = ready.reason || ecological || (affordable ? null
            : "Not enough " + volcanoWorkCost(definition).filter(([resource, amount]) => (Number(state.resources?.[resource]) || 0) < Number(amount)).map(([resource]) => resource).join(", "));
        works[kind] = { ...definition, ok: !reason, reason };
    }
    return {
        ok: true, profile, works,
        summary: volcanoWorksSummaryAt(x, y),
        title: profile.label + " · " + profile.landform.label,
        audit: profile.features?.length || 0,
    };
}

export function performVolcanoWork(x, y, kind, options = {}) {
    const definition = VOLCANO_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown volcanic work" };
    const availability = volcanoWorkAvailability(x, y, options);
    if (!availability.ok) return { ok: false, reason: availability.reason };
    if (!availability.works[kind]?.ok) return { ok: false, reason: availability.works[kind]?.reason || "This work is not possible here" };
    const profile = availability.profile;
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    if (!payVolcanoWork(definition)) return { ok: false, reason: "The work could not be paid for" };
    const ledger = ensureForestGathering();
    const goods = [];
    const add = (id, amount) => {
        const accepted = addStock(ledger, id, Math.max(0, Math.floor(amount)));
        if (accepted > 0 && FOREST_GOODS[id]) goods.push({ ...FOREST_GOODS[id], amount: accepted });
        return accepted;
    };
    if (kind === "lavaQuarry") {
        add("basalt", 4 + Math.round(profile.landform.basalt * 6));
        add("stone", 2 + Math.round(profile.landform.basalt * 2));
    } else if (kind === "obsidianQuarry") {
        add("obsidian", 2 + Math.round(profile.landform.obsidian * 4));
        if (profile.landform.obsidian > 0.55) add("crater-crystal", 1);
    } else if (kind === "pumiceQuarry") {
        add("pumice", 4 + Math.round(profile.landform.pumice * 5));
        add("stone", 1);
    } else if (kind === "sulfurMine") {
        add("sulfur", 3 + Math.round(profile.economy.sulfur * 4));
        if (profile.economy.minerals > 0.45) add("volcanic-minerals", 1 + Math.round(profile.economy.minerals * 2));
    } else if (kind === "metalMine") {
        add("iron-ore", 2 + Math.round(profile.economy.ore * 5));
        if (profile.economy.metals > 0.4) add("copper-ore", 1 + Math.round(profile.economy.metals * 3));
        if (profile.economy.rare > 0.5) add("crater-crystal", 1);
    } else if (kind === "mineralWorks") {
        add("volcanic-minerals", 3 + Math.round(profile.economy.minerals * 5));
        if (profile.economy.rare > 0.45) add("crater-crystal", 1);
    } else if (kind === "geothermalPlant") {
        add("geothermal-energy", 2 + Math.round(profile.economy.geothermal * 3));
        add("hot-spring-water", 2 + Math.round(profile.water.heatedWater * 3));
    } else if (kind === "fertileTerrace") {
        add("volcanic-soil", 3 + Math.round(profile.economy.fertileSoil * 4));
        addResource("food", 1);
    } else if (kind === "craterExpedition") {
        add("crater-crystal", 1 + Math.round(profile.economy.rare * 3));
        add("volcanic-minerals", 1 + Math.round(profile.economy.minerals * 2));
    }
    applyVolcanoWork(x, y, kind, { day });
    const exposure = (kind === "sulfurMine" || kind === "metalMine" || kind === "craterExpedition" || kind === "geothermalPlant")
        ? tropicalExposure({
            disease: clamp(profile.hazards.toxicGas * 0.22, 0, 1),
            diseaseLabel: "volcanic gas",
        }, { source: "volcanic-work", x, y })
        : { outbreak: false, injury: false, foodLost: 0 };
    const record = volcanoWorkAt(x, y);
    if (record) {
        record.lastHarvest = record.lastHarvest || {};
        record.lastHarvest[kind] = day;
    }
    ledger.history.push({ x: Math.floor(x), y: Math.floor(y), day, year, kind: "volcano-work", work: kind, goods: goods.map(good => ({ id: good.id, amount: good.amount })) });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true, kind, label: definition.label,
        tile: { x: Math.floor(x), y: Math.floor(y), label: profile.label, formation: profile.formation },
        goods, exposure, summary: volcanoWorksSummaryAt(x, y),
        message: definition.label.toUpperCase() + (goods.length ? " · " + goods.map(good => good.amount + " " + good.label).join(" · ") : " COMPLETED"),
    };
}

// --- Player-built coastal works and sea harvests (1.2.14.54–1.2.14.63) ---

function coastWorkContextAt(x, y, options = {}) {
    const context = meadowContextAt(x, y, options);
    context.use = { ...context.use, ...coastWorkUseAt(x, y) };
    return context;
}

function coastWorkSiteAt(x, y, options = {}) {
    const context = coastWorkContextAt(x, y, options);
    if (!isCoastSite(x, y, context)) return null;
    const profile = coastProfileAt(x + 0.5, y + 0.5, context);
    return profile?.coastal && !profile.water?.sea ? profile : null;
}

function coastWorkCost(def) {
    return Object.entries(def?.cost || {}).filter(([, value]) => Number(value) > 0);
}

function canPayCoastWork(def) {
    return coastWorkCost(def).every(([resource, amount]) => (Number(state.resources?.[resource]) || 0) >= Number(amount));
}

function payCoastWork(def) {
    if (!canPayCoastWork(def)) return false;
    for (const [resource, amount] of coastWorkCost(def)) addResource(resource, -Number(amount));
    return true;
}

function coastWorkEcologicalReason(kind, profile) {
    if (kind === "fishingVillage" && profile.economy.fish < 0.18) return "No productive fishing shore at this tile";
    if (kind === "harbour" && profile.workPotential.harbour < 0.32) return "No sheltered natural anchorage at this tile";
    if (kind === "tradingPost" && profile.workPotential.harbour < 0.22) return "No landing place for a trading post";
    if (kind === "fortress" && profile.workPotential.fortress < 0.2) return "No defensible coastal height at this tile";
    if (kind === "lighthouse" && profile.workPotential.lighthouse < 0.2) return "No headland or harbour approach to mark";
    if (kind === "shipyard" && profile.workPotential.harbour < 0.3 && profile.economy.timber < 0.12) return "No deep-water launch and timber at this tile";
    if (kind === "saltworks" && profile.workPotential.saltworks < 0.25) return "The tide and marsh do not yield enough brine here";
    if (kind === "market" && profile.workPotential.harbour < 0.22) return "No harbour trade reaches this shore";
    if (kind === "navalBase" && profile.workPotential.harbour < 0.34) return "No deep sheltered anchorage for a fleet station";
    return null;
}

export function coastWorkAvailability(x, y, options = {}) {
    const profile = coastWorkSiteAt(x, y, options);
    if (!profile) return { ok: false, reason: "No coastal land at this tile", works: {} };
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const works = {};
    for (const [kind, definition] of Object.entries(COAST_WORKS)) {
        const ready = coastWorkReady(x, y, kind, day);
        const ecological = coastWorkEcologicalReason(kind, profile);
        const affordable = canPayCoastWork(definition);
        const reason = ready.reason || ecological || (affordable ? null
            : "Not enough " + coastWorkCost(definition).filter(([resource, amount]) => (Number(state.resources?.[resource]) || 0) < Number(amount)).map(([resource]) => resource).join(", "));
        works[kind] = { ...definition, ok: !reason, reason };
    }
    return {
        ok: true, profile, works,
        summary: coastWorksSummaryAt(x, y),
        title: profile.label + " · " + profile.landform.label,
        audit: profile.features?.length || 0,
    };
}

export function performCoastWork(x, y, kind, options = {}) {
    const definition = COAST_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown coastal work" };
    const availability = coastWorkAvailability(x, y, options);
    if (!availability.ok) return { ok: false, reason: availability.reason };
    if (!availability.works[kind]?.ok) return { ok: false, reason: availability.works[kind]?.reason || "This work is not possible here" };
    const profile = availability.profile;
    const day = Math.floor(number(options.dayOfYear, state.dayOfYear) || 0);
    const year = Math.floor(number(options.year, state.year) || 1);
    if (!payCoastWork(definition)) return { ok: false, reason: "The work could not be paid for" };
    const ledger = ensureForestGathering();
    const goods = [];
    const add = (id, amount) => {
        const accepted = addStock(ledger, id, Math.max(0, Math.floor(amount)));
        if (accepted > 0 && FOREST_GOODS[id]) goods.push({ ...FOREST_GOODS[id], amount: accepted });
        return accepted;
    };
    if (kind === "fishingVillage") {
        add("fish", 3 + Math.round(profile.economy.fish * 5));
        add("shellfish", 2 + Math.round(profile.economy.shellfish * 3));
    } else if (kind === "harbour") {
        add("sea-trade-goods", 2 + Math.round(profile.economy.trade * 4));
        add("fish", 1 + Math.round(profile.economy.fish * 2));
    } else if (kind === "tradingPost") {
        add("sea-trade-goods", 1 + Math.round(profile.economy.trade * 3));
        addResource("gold", 2);
    } else if (kind === "fortress") {
        addResource("stone", 1);
    } else if (kind === "lighthouse") {
        addResource("gold", 1);
    } else if (kind === "shipyard") {
        add("sea-trade-goods", 1 + Math.round(profile.workPotential.harbour * 3));
        add("coastal-pine-timber", 2 + Math.round(profile.economy.timber * 3));
    } else if (kind === "saltworks") {
        add("salt", 3 + Math.round(profile.workPotential.saltworks * 5));
    } else if (kind === "market") {
        add("sea-trade-goods", 1 + Math.round(profile.economy.trade * 2));
        addResource("gold", 2);
    } else if (kind === "navalBase") {
        add("sea-trade-goods", 1 + Math.round(profile.workPotential.harbour * 2));
    }
    applyCoastWork(x, y, kind, { day });
    const record = coastWorkAt(x, y);
    if (record) {
        record.lastHarvest = record.lastHarvest || {};
        record.lastHarvest[kind] = day;
    }
    ledger.history.push({ x: Math.floor(x), y: Math.floor(y), day, year, kind: "coast-work", work: kind, goods: goods.map(good => ({ id: good.id, amount: good.amount })) });
    if (ledger.history.length > MAX_HISTORY) ledger.history.splice(0, ledger.history.length - MAX_HISTORY);
    return {
        ok: true, kind, label: definition.label,
        tile: { x: Math.floor(x), y: Math.floor(y), label: profile.label, formation: profile.formation },
        goods, summary: coastWorksSummaryAt(x, y),
        message: definition.label.toUpperCase() + (goods.length ? " · " + goods.map(good => good.amount + " " + good.label).join(" · ") : " COMPLETED"),
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
            const products = (isCoastSite(tx, ty, context) ? coastProductsAt(tx, ty, context) : null)
                || (isVolcanoSite(tx, ty, context) ? volcanoProductsAt(tx, ty, context) : null)
                || (isMountainSite(tx, ty, context) ? mountainProductsAt(tx, ty, context) : null)
                || (isSwampSite(tx, ty, context) ? swampProductsAt(tx, ty, context) : null)
                || (isTundraSite(tx, ty, context) ? tundraProductsAt(tx, ty, context) : null)
                || (isTaigaSite(tx, ty, context) ? taigaProductsAt(tx, ty, context) : null)
                || (isSavannaSite(tx, ty, context) ? savannaProductsAt(tx, ty, context) : null)
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
    // A high-timber stand gives more usable stems from the same thinning. The
    // regional effect is bounded and the 12-unit ceiling is unchanged.
    const timberFactor = Math.max(0.7, Math.min(1.35, Number(point.forestRegionalEffects?.timber) || 1));
    const managementFactor = Math.max(0.75, Math.min(1.10, Number(point.forestDynamics?.silviculture?.timberFactor) || 1));
    const working = point.forestDynamics?.working || null;
    const timber = working?.timber || {};
    const volume = Math.max(0.8, Math.min(1.2, Number(timber.volume) || 1));
    const wanted = Math.max(1, Math.min(12, Math.floor(stockBefore * 0.12 * timberFactor * managementFactor * volume), space));
    const taken = harvestForest(node.x, node.y, wanted);
    if (taken <= 0) return { ok: false, reason: "The nearest stand could not be thinned" };
    // The silvicultural system decides what the removed stems become. A
    // coppice cut is mostly smallwood and firewood; a high forest or selection
    // stand sends most of the cut to the sawlogs pile. The split always sums to
    // exactly the stock actually removed.
    const logShare = Math.max(0.24, Math.min(0.92, Number(timber.logShare) || 1));
    const logWanted = Math.max(1, Math.min(taken, Math.round(taken * logShare)));
    const firewoodWanted = Math.max(0, taken - logWanted);
    const acceptedLogs = addLocalOutput(building, "logs", logWanted, { cause: "forest-thinning" });
    const acceptedFirewood = firewoodWanted > 0
        ? addLocalOutput(building, "firewood", firewoodWanted, { cause: "forest-thinning" })
        : 0;
    if (acceptedLogs > 0) requestHaul(building, "logs", acceptedLogs);
    if (acceptedFirewood > 0) requestHaul(building, "firewood", acceptedFirewood);
    const accepted = acceptedLogs + acceptedFirewood;
    return {
        ok: true, taken, accepted, x: node.x, y: node.y,
        stockBefore, stockAfter: Math.max(0, stockBefore - taken),
        products: { logs: acceptedLogs, firewood: acceptedFirewood },
        logShare, system: point.forestDynamics?.silviculture?.system || null,
        systemLabel: point.forestDynamics?.silviculture?.label || null,
        working: working ? {
            sawlog: timber.sawlog, firewood: timber.firewood,
            volume: timber.volume, specialty: timber.specialty, quality: timber.quality,
            logShare, habitat: working.habitat?.score,
        } : null,
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
