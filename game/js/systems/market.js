// Regional barter and commodity market. Gold is the settlement currency.
import { state } from "../core/state.js";
import { addLog } from "./events.js";
import { random } from "../core/random.js";
import { recordResourceMovement } from "./goods-book.js";
import { addResource } from "./resources.js";
import { TRADE_PARTNERS } from "./diplomacy-config.js";
import { getDiplomaticTradeTerms, recordTradeInfluence } from "./diplomacy-trade.js";
import { getCourtModifiers } from "./court.js";
import { getHealthEconomicEffects } from "./health.js";
import { getFaithModifiers } from "./faith.js";
import { getJusticeModifiers } from "./justice.js";
import { getResearchModifiers } from "./research.js";
import { getEndeavourModifiers } from "./endeavours.js";
import { getDebtMarketFactor, getDebtPressure, getFoodCrisisSnapshot } from "./economy-cycle.js";
import { getBiomeFrontierSupply, normalizeBiomeFrontierSupply } from "./biome-market-link.js";
import { getEspionageMarketTerms } from "./espionage.js";
import { getHazardTradeBuyFactor, getHazardTradeSellFactor } from "./hazard-modifiers.js";
import { GOODS, GOOD_KEYS } from "./city-config.js";
import { REGIONAL_TIMBER_BY_GOOD } from "../world/regional-forests.js";
import { depositGood, getAvailableWarehouseStock, getWarehouseSpace, getWarehouses, withdrawGood } from "./logistics.js";

export const MARKET_RESOURCES = Object.freeze(["wood","stone","food"]);
export const BASE_PRICES = Object.freeze({ wood:2, stone:3, food:2 });
// The general goods exchange is a parallel book beside the three royal
// resources. It never changes their prices, partner stock loops or ledgers.
export const MARKET_GOODS = GOOD_KEYS;
export const GOOD_MARKET_LOT = 5;
export const GOOD_MARKET_VERSION = 1;
const BASE_GOOD_PRICES = Object.freeze({
    logs:2, planks:4, stoneBlocks:3, cutStone:6, grain:2, flour:4,
    bread:6, water:1, firewood:2, ale:5
});
export const GOOD_BASE_PRICES = Object.freeze(Object.fromEntries(GOOD_KEYS.map(good => [
    good, REGIONAL_TIMBER_BY_GOOD[good]?.basePrice || BASE_GOOD_PRICES[good] || 3
])));
export { TRADE_PARTNERS };

// Cheap staples arrive in larger lots than scarce finished goods. This is a
// starting stock and a restock baseline, never a source of free goods: every
// purchase still removes the units from the partner and deposits real stock.
function initialGoodStock(good) {
    return Math.max(4, Math.round(18 / Math.sqrt(GOOD_BASE_PRICES[good])));
}
function goodDepositCapacity(good) {
    return getWarehouses().reduce((sum, warehouse) => sum + (
        warehouse.warehouse.filters.includes(good) ? getWarehouseSpace(warehouse) : 0
    ), 0);
}

export function createMarketState() {
    return {
        prices:{...BASE_PRICES,...Object.fromEntries(MARKET_GOODS.map(good=>[good,GOOD_BASE_PRICES[good]]))},
        partners:TRADE_PARTNERS.map(partner=>({...partner,stock:{...partner.stock,...Object.fromEntries(MARKET_GOODS.map(good=>[good,initialGoodStock(good)]))}})),
        priceTrend:{wood:0,stone:0,food:0,...Object.fromEntries(MARKET_GOODS.map(good=>[good,0]))},
        lastUpdateTick:0,
        priceHistory:{wood:[BASE_PRICES.wood],stone:[BASE_PRICES.stone],food:[BASE_PRICES.food],...Object.fromEntries(MARKET_GOODS.map(good=>[good,[GOOD_BASE_PRICES[good]]]))},
        // The latest quote is written from the biome atlas. It is saved with
        // the market so a load keeps the same explanation the player saw.
        frontierSupply:getBiomeFrontierSupply(),
        lastFrontierNoticeTick:0,
        totalTrades:0,
        totalGoldTraded:0
    };
}

function ensureMarket() {
    if (!state.market || typeof state.market !== "object" || Array.isArray(state.market)) {
        state.market = createMarketState();
    }
    if (!Array.isArray(state.market.partners) || state.market.partners.length === 0) {
        state.market = createMarketState();
    }

    state.market.prices = state.market.prices && typeof state.market.prices === "object"
        ? state.market.prices : {};
    state.market.priceTrend = state.market.priceTrend && typeof state.market.priceTrend === "object"
        ? state.market.priceTrend : {};
    state.market.priceHistory = state.market.priceHistory && typeof state.market.priceHistory === "object"
        ? state.market.priceHistory : {};

    for (const resource of MARKET_RESOURCES) {
        const price = Number(state.market.prices[resource]);
        state.market.prices[resource] = Number.isFinite(price) && price > 0 ? price : BASE_PRICES[resource];

        const trend = Number(state.market.priceTrend[resource]);
        state.market.priceTrend[resource] = Number.isFinite(trend) ? Math.max(-0.45, Math.min(0.55, trend)) : 0;

        const history = state.market.priceHistory[resource];
        state.market.priceHistory[resource] = Array.isArray(history)
            ? history.filter(value => Number.isFinite(value) && value > 0).slice(-16)
            : [];
        if (state.market.priceHistory[resource].length === 0) {
            state.market.priceHistory[resource].push(state.market.prices[resource]);
        }
    }
    // Legacy saves gain the general book in place. The resource entries above
    // are untouched, so an older wood/stone/food quote is exactly preserved.
    for (const good of MARKET_GOODS) {
        const price = Number(state.market.prices[good]);
        state.market.prices[good] = Number.isFinite(price) && price > 0 ? price : GOOD_BASE_PRICES[good];
        const trend = Number(state.market.priceTrend[good]);
        state.market.priceTrend[good] = Number.isFinite(trend) ? Math.max(-0.45, Math.min(0.55, trend)) : 0;
        const history = state.market.priceHistory[good];
        state.market.priceHistory[good] = Array.isArray(history)
            ? history.filter(value => Number.isFinite(value) && value > 0).slice(-16)
            : [];
        if (state.market.priceHistory[good].length === 0) {
            state.market.priceHistory[good].push(state.market.prices[good]);
        }
    }

    state.market.partners = state.market.partners.filter(partner => partner && typeof partner === "object");
    if (state.market.partners.length === 0) {
        state.market = createMarketState();
        return;
    }
    for (const partner of state.market.partners) {
        partner.stock = partner.stock && typeof partner.stock === "object" ? partner.stock : {};
        for (const resource of MARKET_RESOURCES) {
            const stock = Number(partner.stock[resource]);
            partner.stock[resource] = Number.isFinite(stock) ? Math.max(0, stock) : 0;
        }
        for (const good of MARKET_GOODS) {
            const stock = Number(partner.stock[good]);
            partner.stock[good] = Number.isFinite(stock) ? Math.max(0, stock) : initialGoodStock(good);
        }
        const treasury = Number(partner.treasury);
        partner.treasury = Number.isFinite(treasury) ? Math.max(0, treasury) : 0;
        partner.id = String(partner.id || "unknown-partner");
        partner.name = String(partner.name || "Unknown trading partner");
    }

    const lastUpdateTick = Number(state.market.lastUpdateTick);
    state.market.lastUpdateTick = Number.isFinite(lastUpdateTick) ? Math.max(0, lastUpdateTick) : 0;
    state.market.totalTrades = Number.isFinite(Number(state.market.totalTrades))
        ? Math.max(0, Number(state.market.totalTrades)) : 0;
    state.market.totalGoldTraded = Number.isFinite(Number(state.market.totalGoldTraded))
        ? Math.max(0, Number(state.market.totalGoldTraded)) : 0;
    if (!state.market.frontierSupply || typeof state.market.frontierSupply !== "object"
        || state.market.frontierSupply.version !== 1 || !state.market.frontierSupply.categories) {
        state.market.frontierSupply = normalizeBiomeFrontierSupply(state.market.frontierSupply);
    }
    const lastFrontierNoticeTick = Number(state.market.lastFrontierNoticeTick);
    state.market.lastFrontierNoticeTick = Number.isFinite(lastFrontierNoticeTick)
        ? Math.max(0, lastFrontierNoticeTick) : 0;
}

export function updateMarket() {
    ensureMarket();
    if (state.tick - state.market.lastUpdateTick < 90) return;
    state.market.lastUpdateTick = state.tick;
    const seasonFactor = [0.92,1.08,1.22,1.38][state.seasonIndex] || 1;
    const previousFrontier = state.market.frontierSupply;
    const frontier = getBiomeFrontierSupply();
    state.market.frontierSupply = frontier;
    // Trade partners are producers, not finite loot chests. Without a bounded
    // restock, repeated food purchases drained every route to zero and left a
    // rich realm unable to buy grain at any price. The replenishment is small,
    // capped near the partner's starting stock and still subject to war.
    for (const partner of state.market.partners) {
        const home = TRADE_PARTNERS.find(entry => entry.id === partner.id) || {};
        for (const resource of MARKET_RESOURCES) {
            const base = Math.max(1, Number(home.stock?.[resource]) || Number(partner.stock?.[resource]) || 1);
            const current = Math.max(0, Number(partner.stock[resource]) || 0);
            const cap = Math.ceil(base * 1.25);
            const replenish = Math.max(1, Math.round(base * 0.12));
            partner.stock[resource] = Math.min(cap, current + replenish);
        }
    }
    for (const resource of MARKET_RESOURCES) {
        const drift = (random("market") - 0.5) * 0.12;
        const regionalStock = state.market.partners.reduce((total,partner)=>total+(partner.stock[resource]||0),0);
        const targetStock = 90 * state.market.partners.length;
        const scarcityPressure = Math.max(-0.22,Math.min(0.38,(targetStock-regionalStock)/targetStock*0.32));
        const hungerPressure = resource === "food" ? getFoodCrisisSnapshot().severity * 0.35 : 0;
        // Civic pressure is the market's read of the same living cycle. A
        // household petition does not exist in a separate economy: it makes
        // grain dearer through this bounded term until stock or policy eases.
        const civicPressure = resource === "food" ? Math.max(0,Math.min(0.35,Number(state.realmCycle?.marketPressure)||0))*0.35 : 0;
        // 1.2.16: firewood scarcity is priced into the wood market. The winter
        // ledger writes the pressure; the regular market pass carries it.
        const fuelPressure = resource === "wood" ? Math.max(0,Math.min(0.4,Number(state.winter?.values?.fuelPricePressure)||0))*0.35 : 0;
        // The frontier is the third real supply ledger beside partner stock and
        // crown stores. Its pressure is a saved atlas reading, not a parallel
        // price formula: the same quote is shown in the Trade tab and paid when
        // a stored biome good is sold.
        const frontierPressure = Math.max(0, Math.min(0.30,
            Number(frontier.categories?.[resource]?.priceFactor || 1) - 1));
        state.market.priceTrend[resource] = Math.max(-0.45,Math.min(0.55,(state.market.priceTrend[resource]||0)*0.68+drift+scarcityPressure*0.12+hungerPressure*0.04+civicPressure*0.04+fuelPressure*0.05+frontierPressure*0.04));
        state.market.prices[resource] = Math.max(1,Math.round(BASE_PRICES[resource]*seasonFactor*(1+state.market.priceTrend[resource]+scarcityPressure+hungerPressure+civicPressure+fuelPressure+frontierPressure)*100)/100);
        const history = state.market.priceHistory[resource] || (state.market.priceHistory[resource] = []);
        history.push(state.market.prices[resource]);
        if (history.length > 16) history.shift();
    }
    // General goods use their own RNG stream and a bounded lot-based restock.
    // The three resource draws above stay exactly three, and the biome frontier
    // never sees a good it does not model.
    for (const partner of state.market.partners) {
        for (const good of MARKET_GOODS) {
            const base = initialGoodStock(good);
            const current = Math.max(0, Number(partner.stock[good]) || 0);
            partner.stock[good] = Math.min(Math.ceil(base * 1.25), current + Math.max(1, Math.round(base * 0.12)));
        }
    }
    for (const good of MARKET_GOODS) {
        const drift = (random("goods-market") - 0.5) * 0.12;
        const regionalStock = state.market.partners.reduce((total,partner)=>total+(partner.stock[good]||0),0);
        const targetStock = 16 * Math.max(1, state.market.partners.length);
        const scarcityPressure = Math.max(-0.22,Math.min(0.38,(targetStock-regionalStock)/targetStock*0.32));
        state.market.priceTrend[good] = Math.max(-0.45,Math.min(0.55,(state.market.priceTrend[good]||0)*0.68+drift+scarcityPressure*0.12));
        state.market.prices[good] = Math.max(1,Math.round(GOOD_BASE_PRICES[good]*seasonFactor*(1+state.market.priceTrend[good]+scarcityPressure)*100)/100);
        const history = state.market.priceHistory[good] || (state.market.priceHistory[good] = []);
        history.push(state.market.prices[good]);
        if (history.length > 16) history.shift();
    }
    const warnings = MARKET_RESOURCES.filter(resource => {
        const next = frontier.categories?.[resource];
        const before = previousFrontier?.categories?.[resource];
        return next?.known && next.band === "SCARCE" && before?.band !== "SCARCE";
    });
    if (warnings.length && state.tick - (Number(state.market.lastFrontierNoticeTick) || 0) >= 360) {
        state.market.lastFrontierNoticeTick = state.tick;
        addLog("FRONTIER " + warnings.map(resource => resource.toUpperCase()).join(" & ")
            + " SCARCE · THE REGIONAL EXCHANGE REPRICES", "#d9b26f", "market");
    }
}

export function getTradePartners() {
    ensureMarket();
    return state.market.partners;
}

// The price chart is a base quote. Every settlement also reads the partner's
// diplomatic terms and the current health, faith, court, research, debt and
// weather factors. Keep those factors in one place so the buttons can show the
// exact gold the player is about to pay or receive.
function getTradeFactors(partnerId) {
    const terms = getDiplomaticTradeTerms(state.diplomacy, partnerId, getCourtModifiers().tradeBonus);
    const healthTerms = getHealthEconomicEffects();
    const faithTerms = getFaithModifiers();
    const justiceTerms = getJusticeModifiers();
    const researchTerms = getResearchModifiers();
    const eraTradeFactor = Math.max(1, Math.min(1.20, Number(state.ambitions?.era?.agenda?.modifiers?.tradeFactor) || 1));
    const tradeFactor = Math.max(0.55, faithTerms.tradeFactor * justiceTerms.tradeFactor * researchTerms.tradeFactor * (1 + getEndeavourModifiers().trade) * eraTradeFactor);
    const demandFactor = 1 + Math.max(0, Number(faithTerms.festivalDemand) || 0);
    const debtFactor = getDebtMarketFactor();
    const spyTerms = getEspionageMarketTerms();
    const hazardBuy = getHazardTradeBuyFactor();
    const hazardSell = getHazardTradeSellFactor();
    return {
        terms,
        buyFactor: terms.buyFactor * (1 + healthTerms.tradePenalty) * debtFactor / tradeFactor * spyTerms.buyFactor * hazardBuy,
        sellFactor: terms.sellFactor * (1 - healthTerms.tradePenalty) * tradeFactor * demandFactor / debtFactor * spyTerms.sellFactor * hazardSell
    };
}

function quoteSettlement(partner, resource, direction, quantity, factors) {
    if (!partner || !MARKET_RESOURCES.includes(resource) || !["buy","sell"].includes(direction)) {
        return {ok:false,reason:"INVALID TRADE"};
    }
    const requestedAmount = Math.max(1,Math.min(25,Math.floor(Number(quantity)||1)));
    const available = direction === "sell" ? Math.max(0, Number(state.resources[resource]) || 0) : 0;
    const amount = available > 0 && available < requestedAmount ? available : requestedAmount;
    if (direction === "sell" && amount <= 0) return {ok:false,reason:"NOT ENOUGH "+resource.toUpperCase()};
    const price = state.market.prices[resource];
    if (factors.terms.blocked) return {ok:false,reason:"AT WAR — THE TRADE ROAD IS CLOSED"};
    if (direction === "buy") {
        if ((partner.stock[resource]||0) < amount) return {ok:false,reason:"PARTNER OUT OF STOCK"};
        const gold = Math.ceil(price*amount*factors.buyFactor);
        return {ok:true,amount,gold,price};
    }
    const gold = Math.floor(price*amount*0.82*factors.sellFactor);
    if (partner.treasury < gold) return {ok:false,reason:"PARTNER TREASURY TOO LOW"};
    return {ok:true,amount,gold,price};
}

export function getTradeQuote(partnerId, resource, direction, quantity = 5) {
    ensureMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner) return {ok:false,reason:"INVALID TRADE"};
    return quoteSettlement(partner, resource, direction, quantity, getTradeFactors(partnerId));
}

// The trade tab needs six quotes per partner. Read the expensive diplomacy,
// health, faith, court, research, debt and weather terms once per partner and
// reuse them for every resource and direction.
export function getTradeOffers(partnerId) {
    ensureMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner) return null;
    const factors = getTradeFactors(partnerId);
    return Object.fromEntries(MARKET_RESOURCES.map(resource => [resource, {
        buy: quoteSettlement(partner, resource, "buy", 5, factors),
        sell: quoteSettlement(partner, resource, "sell", 5, factors)
    }]));
}

export function executeTrade(partnerId, resource, direction, quantity = 5) {
    ensureMarket();
    updateMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner || !MARKET_RESOURCES.includes(resource) || !["buy","sell"].includes(direction)) {
        return {ok:false,reason:"INVALID TRADE"};
    }
    const requestedAmount = Math.max(1,Math.min(25,Math.floor(Number(quantity)||1)));
    // Harvests and consumption make food fractional. A sale must be able to
    // take the remaining balance below one lot instead of stranding it behind
    // a SELL 5 control. Buying always trades whole lots.
    const available = direction === "sell" ? Math.max(0, Number(state.resources[resource]) || 0) : 0;
    const amount = available > 0 && available < requestedAmount ? available : requestedAmount;
    const price = state.market.prices[resource];
    state.market.debtPressure = getDebtPressure();
    const {terms,buyFactor,sellFactor} = getTradeFactors(partnerId);
    if (terms.blocked) return {ok:false,reason:"AT WAR — THE TRADE ROAD IS CLOSED"};
    if (direction === "buy") {
        const cost = Math.ceil(price*amount*buyFactor);
        if ((partner.stock[resource]||0)<amount) return {ok:false,reason:"PARTNER OUT OF STOCK"};
        if (state.resources.gold<cost) return {ok:false,reason:"NOT ENOUGH GOLD"};
        addResource("gold",-cost);
        addResource(resource,amount);
        if(resource==="food")recordResourceMovement("food",amount,"market-buy",{to:{kind:"realm",id:"royal-stores"}});
        partner.stock[resource]-=amount;
        partner.treasury+=cost;
        state.market.totalGoldTraded+=cost;
        state.statistics.totalTrades++;
        recordTradeInfluence(state.diplomacy,partnerId,{year:state.year,tick:state.tick,direction,resource,amount,gold:cost});
        addLog("TRADE: BOUGHT "+amount+" "+resource.toUpperCase()+" FROM "+partner.name,"#e3bd71");
        state.market.totalTrades++;
        return {ok:true,amount,gold:cost};
    }
    const payout = Math.floor(price*amount*0.82*sellFactor);
    if ((state.resources[resource]||0)<amount) return {ok:false,reason:"NOT ENOUGH "+resource.toUpperCase()};
    if (partner.treasury<payout) return {ok:false,reason:"PARTNER TREASURY TOO LOW"};
    addResource(resource,-amount);
    if(resource==="food")recordResourceMovement("food",-amount,"market-sell",{from:{kind:"realm",id:"royal-stores"},to:{kind:"market",id:partner.id}});
    addResource("gold",payout);
    partner.stock[resource]=(partner.stock[resource]||0)+amount;
    partner.treasury-=payout;
    state.market.totalGoldTraded+=payout;
    state.market.totalTrades++;
    state.statistics.totalTrades++;
    recordTradeInfluence(state.diplomacy,partnerId,{year:state.year,tick:state.tick,direction,resource,amount,gold:payout});
    addLog("TRADE: SOLD "+amount+" "+resource.toUpperCase()+" TO "+partner.name,"#e3bd71");
    return {ok:true,amount,gold:payout};
}

// General goods settle with the same partner factors as the resource exchange
// but move physical stock through logistics. Quotes and execution therefore use
// one arithmetic path, and the goods book sees a deposit or withdrawal instead
// of a fabricated resource grant.
function quoteGoodSettlement(partner, good, direction, quantity, factors) {
    if (!partner || !MARKET_GOODS.includes(good) || !["buy","sell"].includes(direction)) {
        return {ok:false,reason:"INVALID GOODS TRADE"};
    }
    const requestedAmount = Math.max(1,Math.min(25,Math.floor(Number(quantity)||GOOD_MARKET_LOT)));
    const price = state.market.prices[good];
    const label = String(GOODS[good]?.label || good).toUpperCase();
    if (factors.terms.blocked) return {ok:false,reason:"AT WAR — THE TRADE ROAD IS CLOSED"};
    if (direction === "buy") {
        const capacity = Math.floor(goodDepositCapacity(good));
        const stock = Math.max(0, Math.floor(Number(partner.stock[good]) || 0));
        const amount = Math.min(requestedAmount, capacity, stock);
        if (amount <= 0) return {ok:false,reason:capacity <= 0 ? "NO WAREHOUSE SPACE" : "PARTNER OUT OF STOCK"};
        return {ok:true,amount,gold:Math.ceil(price*amount*factors.buyFactor),price};
    }
    const available = getAvailableWarehouseStock(good);
    const amount = available > 0 && available < requestedAmount ? available : requestedAmount;
    if (amount <= 0) return {ok:false,reason:"NOT ENOUGH "+label};
    const gold = Math.floor(price*amount*0.82*factors.sellFactor);
    if (Number(partner.treasury) < gold) return {ok:false,reason:"PARTNER TREASURY TOO LOW"};
    return {ok:true,amount,gold,price};
}

export function getGoodTradeQuote(partnerId, good, direction, quantity = GOOD_MARKET_LOT) {
    ensureMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner) return {ok:false,reason:"INVALID GOODS TRADE"};
    return quoteGoodSettlement(partner, good, direction, quantity, getTradeFactors(partnerId));
}

export function getGoodTradeOffers(partnerId) {
    ensureMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner) return null;
    const factors = getTradeFactors(partnerId);
    return Object.fromEntries(MARKET_GOODS.map(good => [good, {
        buy: quoteGoodSettlement(partner, good, "buy", GOOD_MARKET_LOT, factors),
        sell: quoteGoodSettlement(partner, good, "sell", GOOD_MARKET_LOT, factors)
    }]));
}

export function executeGoodTrade(partnerId, good, direction, quantity = GOOD_MARKET_LOT) {
    ensureMarket();
    updateMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner || !MARKET_GOODS.includes(good) || !["buy","sell"].includes(direction)) {
        return {ok:false,reason:"INVALID GOODS TRADE"};
    }
    state.market.debtPressure = getDebtPressure();
    const factors = getTradeFactors(partnerId);
    const quote = quoteGoodSettlement(partner, good, direction, quantity, factors);
    if (!quote.ok) return quote;
    const label = String(GOODS[good]?.label || good).toLowerCase();
    if (direction === "buy") {
        if (state.resources.gold < quote.gold) return {ok:false,reason:"NOT ENOUGH GOLD"};
        addResource("gold",-quote.gold);
        const moved = depositGood(good, quote.amount, 0, 0);
        const paid = Math.ceil(quote.price*moved*factors.buyFactor);
        if (paid < quote.gold) addResource("gold",quote.gold-paid);
        if (moved <= 0) return {ok:false,reason:"NO WAREHOUSE SPACE"};
        partner.stock[good] -= moved;
        partner.treasury += paid;
        state.market.totalGoldTraded += paid;
        state.market.totalTrades++;
        state.statistics.totalTrades++;
        recordTradeInfluence(state.diplomacy,partnerId,{year:state.year,tick:state.tick,direction,resource:good,amount:moved,gold:paid});
        addLog("GOODS MARKET: BOUGHT "+moved+" "+label+" FROM "+partner.name,"#e3bd71");
        return {ok:true,amount:moved,gold:paid,good};
    }
    const moved = withdrawGood(good, quote.amount, 0, 0);
    if (moved <= 0) return {ok:false,reason:"NOT ENOUGH "+label.toUpperCase()};
    const payout = moved === quote.amount ? quote.gold : Math.floor(quote.price*moved*0.82*factors.sellFactor);
    if (Number(partner.treasury) < payout) return {ok:false,reason:"PARTNER TREASURY TOO LOW"};
    addResource("gold",payout);
    partner.stock[good] = (Number(partner.stock[good]) || 0) + moved;
    partner.treasury -= payout;
    state.market.totalGoldTraded += payout;
    state.market.totalTrades++;
    state.statistics.totalTrades++;
    recordTradeInfluence(state.diplomacy,partnerId,{year:state.year,tick:state.tick,direction,resource:good,amount:moved,gold:payout});
    addLog("GOODS MARKET: SOLD "+moved+" "+label+" TO "+partner.name,"#e3bd71");
    return {ok:true,amount:moved,gold:payout,good};
}
