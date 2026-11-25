// Regional timber exchange: the bridge between the physical timber yard and
// the royal treasury. Each regional timber has one base quote derived from its
// species density and climate. The quote is shaped by the ordinary wood market
// and by how much of that timber actually sits in stores, so a rare hardwood
// is worth more than a soft pioneer wood without inventing a second market.
//
// Selling removes real warehouse stock through the shared logistics ledger;
// nothing is created from a counter. The module is read-only until the player
// presses SELL, and adds no per-tick work.
import { state } from "../core/state.js";
import { addLog } from "./events.js";
import { addResource } from "./resources.js";
import { consumeFromWarehouse, getPhysicalStock } from "./logistics.js";
import { REGIONAL_TIMBERS, regionalTimberGood } from "../world/regional-forests.js";

export const TIMBER_MARKET_VERSION = 1;
export const TIMBER_SALE_LOT = 5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

// The same four seasons the ordinary market uses. Timber is cut all year, but
// winter building and spring rafting move the price by a modest amount.
const SEASON_FACTOR = Object.freeze([0.94, 1.0, 1.06, 1.12]);

export function timberQuote(good) {
    const def = regionalTimberGood(good);
    if (!def) return null;
    const season = SEASON_FACTOR[Math.max(0, Math.min(3, Math.floor(Number(state.seasonIndex) || 0)))] || 1;
    const woodPrice = Number(state.market?.prices?.wood);
    const marketFactor = clamp((Number.isFinite(woodPrice) && woodPrice > 0 ? woodPrice : 2) / 2, 0.8, 1.5);
    const stock = Math.max(0, Number(getPhysicalStock(good)) || 0);
    // A full yard softens the quote, an empty one firms it. Bounded so a single
    // sale can never spiral the price.
    const stockFactor = clamp(1.12 - Math.min(1, stock / 60) * 0.18, 0.94, 1.12);
    const price = round2(def.basePrice * season * marketFactor * stockFactor);
    return {
        id: def.id,
        label: def.label,
        species: def.species,
        speciesLabel: def.speciesLabel,
        tropical: def.tropical,
        basePrice: def.basePrice,
        price,
        stock,
        planks: def.planks,
        firewood: def.firewoodYield,
    };
}

export function timberMarketRows() {
    return REGIONAL_TIMBERS.map(timber => timberQuote(timber.id));
}

export function timberMarketSummary() {
    const rows = timberMarketRows();
    const stored = rows.reduce((sum, row) => sum + row.stock, 0);
    const value = rows.reduce((sum, row) => sum + row.stock * row.price, 0);
    return {
        rows,
        stored,
        value: round2(value),
        kinds: rows.filter(row => row.stock > 0).length,
        totalKinds: rows.length,
        best: rows.slice().sort((a, b) => b.price - a.price || a.id.localeCompare(b.id))[0] || null,
    };
}

// Selling walks the existing warehouses in entity order. Only unreserved stock
// leaves, and every unit is booked as a consumed good before the gold enters
// the treasury. A shop with no stock returns a reason instead of a payout.
export function sellRegionalTimber(good, quantity = TIMBER_SALE_LOT) {
    const def = regionalTimberGood(good);
    if (!def) return { ok: false, reason: "Not a regional timber" };
    const quote = timberQuote(good);
    const requested = Math.max(1, Math.min(50, Math.floor(Number(quantity) || TIMBER_SALE_LOT)));
    const available = Math.max(0, Number(getPhysicalStock(good)) || 0);
    if (available < 1) return { ok: false, reason: "No " + def.label + " in store" };
    let remaining = Math.min(requested, available);
    let sold = 0;
    for (const entity of state.entities) {
        if (remaining <= 0) break;
        if (entity.dead || !entity.warehouse || typeof entity.warehouse !== "object") continue;
        if (!Array.isArray(entity.warehouse.filters) || !entity.warehouse.filters.includes(good)) continue;
        const amount = consumeFromWarehouse(entity, good, remaining, {
            cause: "timber-market",
            to: { kind: "market", id: "regional-timber-exchange" },
        });
        if (amount <= 0) continue;
        sold += amount;
        remaining -= amount;
    }
    if (sold <= 0) return { ok: false, reason: "The timber is reserved for a delivery" };
    const gold = Math.max(sold, Math.round(sold * quote.price));
    addResource("gold", gold);
    state.statistics.totalTrades = Math.max(0, Number(state.statistics.totalTrades) || 0) + 1;
    addLog("TIMBER SOLD · " + sold + " " + def.label.toUpperCase() + " FOR " + gold + " GOLD", "#e3bd71", "market");
    return { ok: true, good, amount: sold, gold, price: quote.price };
}
