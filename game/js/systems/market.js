// Regional barter and commodity market. Gold is the settlement currency.
import { state } from "../core/state.js";
import { addLog } from "./events.js";
import { random } from "../core/random.js";
import { recordResourceMovement } from "./goods-book.js";
import { addResource } from "./resources.js";

export const MARKET_RESOURCES = Object.freeze(["wood","stone","food"]);
export const BASE_PRICES = Object.freeze({ wood:2, stone:3, food:2 });

export const TRADE_PARTNERS = Object.freeze([
    { id:"northmere", name:"Northmere Guild", region:"Northern Marches", specialty:"WOOD", treasury:420, stock:{wood:90,stone:35,food:60} },
    { id:"ironvale", name:"Ironvale Caravans", region:"Eastern Highlands", specialty:"STONE", treasury:520, stock:{wood:25,stone:110,food:35} },
    { id:"goldcoast", name:"Goldcoast League", region:"Southern Coast", specialty:"FOOD", treasury:760, stock:{wood:45,stone:30,food:125} },
    { id:"redpass", name:"Redpass Companies", region:"Western Frontier", specialty:"SUPPLIES", treasury:300, stock:{wood:60,stone:55,food:25} }
]);

export function createMarketState() {
    return {
        prices:{...BASE_PRICES},
        partners:TRADE_PARTNERS.map(partner=>({...partner,stock:{...partner.stock}})),
        priceTrend:{wood:0,stone:0,food:0},
        lastUpdateTick:0,
        priceHistory:{wood:[BASE_PRICES.wood],stone:[BASE_PRICES.stone],food:[BASE_PRICES.food]},
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
}

export function updateMarket() {
    ensureMarket();
    if (state.tick - state.market.lastUpdateTick < 90) return;
    state.market.lastUpdateTick = state.tick;
    const seasonFactor = [0.92,1.08,1.22,1.38][state.seasonIndex] || 1;
    for (const resource of MARKET_RESOURCES) {
        const drift = (random("market") - 0.5) * 0.12;
        const regionalStock = state.market.partners.reduce((total,partner)=>total+(partner.stock[resource]||0),0);
        const targetStock = 90 * state.market.partners.length;
        const scarcityPressure = Math.max(-0.22,Math.min(0.38,(targetStock-regionalStock)/targetStock*0.32));
        state.market.priceTrend[resource] = Math.max(-0.45,Math.min(0.55,(state.market.priceTrend[resource]||0)*0.68+drift+scarcityPressure*0.12));
        state.market.prices[resource] = Math.max(1,Math.round(BASE_PRICES[resource]*seasonFactor*(1+state.market.priceTrend[resource]+scarcityPressure)*100)/100);
        const history = state.market.priceHistory[resource] || (state.market.priceHistory[resource] = []);
        history.push(state.market.prices[resource]);
        if (history.length > 16) history.shift();
    }
}

export function getTradePartners() {
    ensureMarket();
    return state.market.partners;
}

export function executeTrade(partnerId, resource, direction, quantity = 5) {
    ensureMarket();
    updateMarket();
    const partner = state.market.partners.find(item=>item.id===partnerId);
    if (!partner || !MARKET_RESOURCES.includes(resource) || !["buy","sell"].includes(direction)) {
        return {ok:false,reason:"INVALID TRADE"};
    }
    const amount = Math.max(1,Math.min(25,Math.floor(Number(quantity)||1)));
    const price = state.market.prices[resource];
    if (direction === "buy") {
        const cost = Math.ceil(price*amount);
        if ((partner.stock[resource]||0)<amount) return {ok:false,reason:"PARTNER OUT OF STOCK"};
        if (state.resources.gold<cost) return {ok:false,reason:"NOT ENOUGH GOLD"};
        addResource("gold",-cost);
        addResource(resource,amount);
        if(resource==="food")recordResourceMovement("food",amount,"market-buy",{to:{kind:"realm",id:"royal-stores"}});
        partner.stock[resource]-=amount;
        partner.treasury+=cost;
        state.market.totalGoldTraded+=cost;
        state.statistics.totalTrades++;
        addLog("TRADE: BOUGHT "+amount+" "+resource.toUpperCase()+" FROM "+partner.name,"#e3bd71");
        state.market.totalTrades++;
        return {ok:true,amount,gold:cost};
    }
    const payout = Math.floor(price*amount*0.82);
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
    addLog("TRADE: SOLD "+amount+" "+resource.toUpperCase()+" TO "+partner.name,"#e3bd71");
    return {ok:true,amount,gold:payout};
}
