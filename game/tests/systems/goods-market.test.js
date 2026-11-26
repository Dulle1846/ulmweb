import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import { resetState,state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { GOOD_KEYS } from "../../js/systems/city-config.js";
import { readAuditTotals,setAuditOpening } from "../../js/systems/goods-book.js";
import { ensureInventory,getGoodsAudit,getPhysicalStock } from "../../js/systems/logistics.js";
import { createMarketState,executeGoodTrade,getGoodTradeOffers,getGoodTradeQuote,GOOD_MARKET_LOT,MARKET_GOODS,updateMarket } from "../../js/systems/market.js";

function addStore(stock,capacity=2000){
    const store={id:"goods-market-store",type:TYPE.WAREHOUSE,x:30,y:30,dead:false,
        construction:{stage:3},isBuilding:()=>true,
        warehouse:{capacity,stored:{...stock}}};
    state.entities.push(store);
    ensureInventory(store);
    return store;
}

function openAudit(){
    const opening={food:state.resources.food};
    for(const good of MARKET_GOODS)opening[good]=getPhysicalStock(good);
    setAuditOpening(opening);
}

beforeEach(()=>{
    resetState();
    state.tick=0;
    state.market=createMarketState();
    state.resources={wood:100,stone:100,gold:10000,food:100};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
});

test("every registered good buys and sells at the quoted gold through physical stock",()=>{
    const store=addStore(Object.fromEntries(MARKET_GOODS.map(good=>[good,10])));
    openAudit();
    assert.deepEqual(MARKET_GOODS,GOOD_KEYS);
    for(const good of MARKET_GOODS){
        const buyQuote=getGoodTradeQuote("northmere",good,"buy",GOOD_MARKET_LOT);
        assert.equal(buyQuote.ok,true,good+" should have a partner stock quote");
        const bought=executeGoodTrade("northmere",good,"buy",GOOD_MARKET_LOT);
        assert.equal(bought.ok,true,good+" should be deposit able");
        assert.equal(bought.amount,buyQuote.amount);
        assert.equal(bought.gold,buyQuote.gold);
        assert.equal(store.warehouse.stored[good],10+buyQuote.amount);

        const sellQuote=getGoodTradeQuote("northmere",good,"sell",GOOD_MARKET_LOT);
        assert.equal(sellQuote.ok,true,good+" should have a stored-stock quote");
        const sold=executeGoodTrade("northmere",good,"sell",GOOD_MARKET_LOT);
        assert.equal(sold.ok,true,good+" should be withdraw able");
        assert.equal(sold.amount,sellQuote.amount);
        assert.equal(sold.gold,sellQuote.gold);
        assert.equal(store.warehouse.stored[good],10);
        assert.equal(getPhysicalStock(good),10);
    }
    assert.equal(getGoodsAudit().balanced,true,"both sides of all physical goods trades must be booked");
    assert.equal(state.market.prices.wood,2,"the royal wood quote is unchanged");
    assert.equal(state.market.prices.stone,3,"the royal stone quote is unchanged");
    assert.equal(state.market.prices.food,2,"the royal food quote is unchanged");
});

test("general goods keep their own bounded seeded price stream",()=>{
    function run(seed){
        resetState();
        state.worldSeed=seed;
        state.tick=90;
        state.seasonIndex=2;
        state.market=createMarketState();
        updateMarket();
        return {
            prices:{...state.market.prices},
            trend:{...state.market.priceTrend},
            history:JSON.parse(JSON.stringify(state.market.priceHistory)),
            marketDraws:state.randomStreams.market||0,
            goodDraws:state.randomStreams["goods-market"]||0
        };
    }
    const first=run(20261118);
    assert.deepEqual(run(20261118),first);
    assert.equal(first.marketDraws,3,"the original three resource draws must not change");
    assert.equal(first.goodDraws,MARKET_GOODS.length,"each general good gets one independent draw");
    for(const good of MARKET_GOODS)assert.ok(first.prices[good]>0);
});

test("a legacy market gains the general book without losing its saved resource quote",()=>{
    addStore({});
    state.market={
        partners:[{id:"legacy-partner",name:"Legacy Partner",treasury:50,stock:{wood:7,stone:8,food:9}}],
        prices:{wood:4,stone:3,food:2},
        priceTrend:{},
        priceHistory:{},
        lastUpdateTick:0
    };
    const offers=getGoodTradeOffers("legacy-partner");
    assert.ok(offers,"the legacy partner must gain goods offers");
    assert.equal(state.market.prices.wood,4,"the saved wood price survives normalization");
    for(const good of MARKET_GOODS){
        assert.ok(Number.isFinite(state.market.prices[good])&&state.market.prices[good]>0,good+" price");
        assert.ok(offers[good].buy.amount>=1,good+" partner stock");
    }
    const restored=JSON.parse(JSON.stringify(state.market));
    state.market=restored;
    const reloaded=getGoodTradeOffers("legacy-partner");
    for(const good of MARKET_GOODS)assert.equal(reloaded[good].buy.gold,offers[good].buy.gold,good+" quote survives save/load");
});

test("selling general goods never touches a carrier reservation",()=>{
    const store=addStore({grain:10});
    store.warehouse.reservedOut.grain=9;
    ensureInventory(store);
    openAudit();
    const quote=getGoodTradeQuote("northmere","grain","sell",GOOD_MARKET_LOT);
    assert.equal(quote.ok,true);
    assert.equal(quote.amount,1,"only the unreserved single unit is for sale");
    const result=executeGoodTrade("northmere","grain","sell",GOOD_MARKET_LOT);
    assert.equal(result.ok,true);
    assert.equal(result.amount,1);
    assert.equal(store.warehouse.stored.grain,9);
    assert.equal(store.warehouse.reservedOut.grain,9);
    assert.equal(getPhysicalStock("grain"),9);
    assert.equal(readAuditTotals("grain","good").consumed,1);
    assert.equal(getGoodsAudit().balanced,true);
});

test("an unaffordable goods purchase leaves the stores and the ledger untouched",()=>{
    addStore({});
    openAudit();
    state.resources.gold=0;
    const before=getPhysicalStock("planks");
    const result=executeGoodTrade("northmere","planks","buy",GOOD_MARKET_LOT);
    assert.equal(result.ok,false);
    assert.equal(result.reason,"NOT ENOUGH GOLD");
    assert.equal(getPhysicalStock("planks"),before);
    assert.equal(readAuditTotals("planks","good").produced,0);
    assert.equal(getGoodsAudit().balanced,true);
});

test("the goods market refuses non-goods and reports a full accepting capacity",()=>{
    addStore({});
    assert.equal(getGoodTradeQuote("northmere","wood","buy",5).reason,"INVALID GOODS TRADE");
    assert.equal(executeGoodTrade("northmere","unknown","buy",5).reason,"INVALID GOODS TRADE");
    for(const good of MARKET_GOODS){
        const quote=getGoodTradeQuote("northmere",good,"buy",GOOD_MARKET_LOT);
        assert.equal(quote.ok,true,good+" has an accepting store and partner stock");
        assert.equal(quote.amount,GOOD_MARKET_LOT);
    }
});
