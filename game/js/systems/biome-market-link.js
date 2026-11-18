// Frontier exchange link: the biome atlas and the commodity market are one
// supply chain, not two parallel economies.
//
// The atlas owns physical stock, extraction pressure and caravan imports. This
// module turns that saved geography into a bounded commodity reading for the
// market. The market then writes its quote back through getBiomeMarketQuote()
// when stored frontier goods are sold. No per-tick simulation is added: the
// reading is cached by a cheap atlas signature and only rebuilt when a stock,
// policy, discovery or import actually changes.
import { state } from "../core/state.js";
import {
    BIOME_MARKET_CATEGORIES, BIOME_MARKET_CATEGORY_BY_RESOURCE_CATEGORY, BIOME_RESOURCE_BY_ID
} from "../world/biome-resource-data.js";

export const BIOME_MARKET_LINK_VERSION = 1;
export const BIOME_MARKET_PRESSURE_LIMIT = 0.5;
export const BIOME_MARKET_QUOTE_LIMIT = 0.35;

const MARKET_DEFINITIONS = Object.freeze({
    wood: Object.freeze({ label: "Timber", basePrice: 2 }),
    stone: Object.freeze({ label: "Stone", basePrice: 3 }),
    food: Object.freeze({ label: "Food", basePrice: 2 })
});
const BANDS = new Set(["UNCHARTED", "ABUNDANT", "STEADY", "TIGHT", "SCARCE"]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = (value, places = 3) => {
    const scale = 10 ** places;
    return Math.round((Number(value) || 0) * scale) / scale;
};
const clamp01 = value => clamp(value, 0, 1);

let cache = { signature: null, value: null };

function marketCategoryFor(resourceCategory) {
    const key = BIOME_MARKET_CATEGORY_BY_RESOURCE_CATEGORY[String(resourceCategory)];
    return key || null;
}

function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function atlasSignature(atlas) {
    if (!atlas || !Array.isArray(atlas.regions)) return "none";
    const parts = [atlas.seed, state.year];
    for (const region of atlas.regions) {
        if (!region?.discovered) continue;
        parts.push(region.id, round(region.extractionPressure, 3));
        for (const row of region.resources || []) {
            const resource = BIOME_RESOURCE_BY_ID[row?.id];
            if (!resource || !marketCategoryFor(resource.category)) continue;
            parts.push(row.id, Math.round(Number(row.stock) || 0), Math.round(Number(row.capacity) || 0),
                row.discovered ? 1 : 0, row.locallyExtinct ? 1 : 0);
        }
        for (const entry of region.importCoverage || []) {
            parts.push("import", entry.category || "", Number(entry.untilYear) || 0);
        }
    }
    return hashText(parts.join("|"));
}

function bandFor(known, pressure, cover, extraction) {
    if (!known) return "UNCHARTED";
    if (pressure >= 0.20) return "SCARCE";
    if (pressure >= 0.08) return "TIGHT";
    if (cover >= 0.82 && extraction < 0.18) return "ABUNDANT";
    return "STEADY";
}

function neutralCategory(key) {
    return {
        category: key,
        label: MARKET_DEFINITIONS[key].label,
        known: false,
        stock: 0,
        capacity: 0,
        cover: 0,
        pressure: 0,
        priceFactor: 1,
        band: "UNCHARTED",
        regions: 0,
        extraction: 0,
        importDependency: 0
    };
}

function emptySupply() {
    return {
        version: BIOME_MARKET_LINK_VERSION,
        signature: "none",
        updatedTick: Math.max(0, Math.floor(Number(state.tick) || 0)),
        categories: Object.fromEntries(BIOME_MARKET_CATEGORIES.map(key => [key, neutralCategory(key)]))
    };
}

export function getBiomeMarketCategory(resourceCategory) {
    return marketCategoryFor(resourceCategory);
}

export function getBiomeFrontierSupply() {
    const atlas = state.biomeAtlas;
    const signature = atlasSignature(atlas);
    if (cache.signature === signature && cache.value) return cache.value;

    const regions = Array.isArray(atlas?.regions) ? atlas.regions : [];
    const totals = Object.fromEntries(BIOME_MARKET_CATEGORIES.map(key => [key, {
        stock: 0, capacity: 0, regions: 0, extraction: 0, importing: 0
    }]));
    let discoveredRegions = 0;
    for (const region of regions) {
        if (!region?.discovered) continue;
        discoveredRegions++;
        const seen = new Set();
        for (const row of region.resources || []) {
            if (!row?.discovered || row.locallyExtinct) continue;
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            const key = resource ? marketCategoryFor(resource.category) : null;
            if (!key || !totals[key]) continue;
            totals[key].stock += Math.max(0, Number(row.stock) || 0);
            totals[key].capacity += Math.max(1, Number(row.capacity) || 1);
            seen.add(key);
        }
        for (const key of seen) {
            totals[key].regions++;
            totals[key].extraction += clamp01(region.extractionPressure);
        }
        for (const entry of region.importCoverage || []) {
            const key = String(entry?.category || "");
            if (totals[key] && Number(entry?.untilYear) >= Number(state.year)) totals[key].importing++;
        }
    }

    const categories = {};
    for (const key of BIOME_MARKET_CATEGORIES) {
        const total = totals[key];
        const known = total.regions > 0;
        const cover = total.capacity > 0 ? clamp01(total.stock / total.capacity) : 0;
        const extraction = total.regions > 0 ? clamp01(total.extraction / total.regions) : 0;
        const importDependency = discoveredRegions > 0 ? clamp01(total.importing / discoveredRegions) : 0;
        const scarcity = clamp01((0.72 - cover) / 0.55);
        const pressure = known
            ? round(clamp(scarcity * 0.50 + extraction * 0.42 + importDependency * 0.08, 0, BIOME_MARKET_PRESSURE_LIMIT), 3)
            : 0;
        categories[key] = {
            category: key,
            label: MARKET_DEFINITIONS[key].label,
            known,
            stock: Math.round(total.stock),
            capacity: Math.round(total.capacity),
            cover: round(cover, 3),
            pressure,
            priceFactor: round(1 + pressure * 0.65, 3),
            band: bandFor(known, pressure, cover, extraction),
            regions: total.regions,
            extraction: round(extraction, 3),
            importDependency: round(importDependency, 3)
        };
    }
    const value = {
        version: BIOME_MARKET_LINK_VERSION,
        signature,
        updatedTick: Math.max(0, Math.floor(Number(state.tick) || 0)),
        categories
    };
    cache = { signature, value };
    return value;
}

export function invalidateBiomeMarketLink() {
    cache = { signature: null, value: null };
}

// Old realms and saves created before this link have no frontier block. The
// market calls this only when the block is absent; a valid saved reading is
// preserved exactly so an ordinary load does not silently re-quote prices.
export function normalizeBiomeFrontierSupply(source) {
    const fallback = getBiomeFrontierSupply();
    if (!source || typeof source !== "object" || Array.isArray(source)
        || source.version !== BIOME_MARKET_LINK_VERSION || !source.categories) {
        return fallback;
    }
    const categories = {};
    for (const key of BIOME_MARKET_CATEGORIES) {
        const row = source.categories[key];
        const neutral = fallback.categories[key] || neutralCategory(key);
        if (!row || typeof row !== "object" || Array.isArray(row)) {
            categories[key] = neutral;
            continue;
        }
        const known = Boolean(row.known);
        const pressure = known ? round(clamp(row.pressure, 0, BIOME_MARKET_PRESSURE_LIMIT), 3) : 0;
        const cover = round(clamp01(row.cover), 3);
        const extraction = round(clamp01(row.extraction), 3);
        categories[key] = {
            category: key,
            label: MARKET_DEFINITIONS[key].label,
            known,
            stock: Math.max(0, Math.min(1_000_000_000, Math.round(Number(row.stock) || 0))),
            capacity: Math.max(0, Math.min(1_000_000_000, Math.round(Number(row.capacity) || 0))),
            cover,
            pressure,
            priceFactor: known ? round(clamp(row.priceFactor, 1, 1 + BIOME_MARKET_QUOTE_LIMIT), 3) : 1,
            band: known && BANDS.has(row.band) ? row.band : bandFor(known, pressure, cover, extraction),
            regions: Math.max(0, Math.min(1_000_000, Math.floor(Number(row.regions) || 0))),
            extraction,
            importDependency: round(clamp01(row.importDependency), 3)
        };
    }
    return {
        version: BIOME_MARKET_LINK_VERSION,
        signature: String(source.signature || "saved").slice(0, 32),
        updatedTick: Math.max(0, Math.floor(Number(source.updatedTick) || 0)),
        categories
    };
}

// The reverse edge of the link: stored frontier goods settle at the same quote
// the regional exchange uses. A timber sale therefore rises when the atlas is
// tight and falls when surveyed forests are abundant.
export function getBiomeMarketQuote(resourceCategory) {
    const market = marketCategoryFor(resourceCategory);
    if (!market) return { market: null, price: 0, basePrice: 0, factor: 1 };
    const definition = MARKET_DEFINITIONS[market];
    const quoted = Number(state.market?.prices?.[market]);
    const price = Number.isFinite(quoted) && quoted > 0 ? quoted : definition.basePrice;
    return {
        market,
        price: round(price, 2),
        basePrice: definition.basePrice,
        factor: round(clamp(price / definition.basePrice, 1 - BIOME_MARKET_QUOTE_LIMIT, 1 + BIOME_MARKET_QUOTE_LIMIT), 3)
    };
}

export function getBiomeFrontierCategory(resourceCategory) {
    const market = marketCategoryFor(resourceCategory);
    if (!market) return null;
    return getBiomeFrontierSupply().categories[market] || null;
}
