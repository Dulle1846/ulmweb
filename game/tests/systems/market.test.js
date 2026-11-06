import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {createMarketState,executeTrade,updateMarket} from "../../js/systems/market.js";

beforeEach(()=>{
    resetState();
    state.market=createMarketState();
    state.resources={wood:20,stone:10,gold:100,food:20};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
});
test("buying goods exchanges gold for stock and updates inventory",()=>{
    const before=state.resources.wood;
    const result=executeTrade("northmere","wood","buy",5);
    assert.equal(result.ok,true);
    assert.equal(state.resources.wood,before+5);
    assert.ok(state.resources.gold<100);
    assert.equal(state.incomeThisTick.wood,5);
    assert.equal(state.incomeThisTick.gold,state.resources.gold-100);
});
test("selling goods pays gold and adds stock to the partner",()=>{
    const before=state.resources.gold;
    const stockBefore=state.market.partners[0].stock.wood;
    const result=executeTrade("northmere","wood","sell",5);
    assert.equal(result.ok,true);
    assert.equal(state.resources.gold,before+result.gold);
    assert.equal(state.incomeThisTick.wood,-5);
    assert.equal(state.incomeThisTick.gold,result.gold);
    assert.equal(state.market.partners[0].stock.wood,stockBefore+5);
});
test("trades reject unaffordable purchases without changing resources",()=>{
    state.resources.gold=0;
    const before=state.resources.wood;
    const result=executeTrade("northmere","wood","buy",5);
    assert.equal(result.ok,false);
    assert.equal(result.reason,"NOT ENOUGH GOLD");
    assert.equal(state.resources.wood,before);
});
test("market quotes move on schedule and remain positive",()=>{
    state.tick=100;
    updateMarket();
    for(const price of Object.values(state.market.prices))assert.ok(price>0);
});

test("legacy market saves with partial partner stock are normalized safely",()=>{
    state.market={
        partners:[{id:"legacy-partner",name:"Legacy Partner",treasury:50}],
        prices:{wood:2},
        lastUpdateTick:0
    };
    state.tick=90;
    assert.doesNotThrow(()=>updateMarket());
    const partner=state.market.partners[0];
    assert.equal(partner.stock.wood,0);
    assert.equal(partner.stock.stone,0);
    assert.equal(partner.stock.food,0);
    assert.equal(partner.treasury,50);
    for(const resource of ["wood","stone","food"]){
        assert.ok(Number.isFinite(state.market.prices[resource]));
        assert.ok(state.market.prices[resource]>0);
        assert.ok(Array.isArray(state.market.priceHistory[resource]));
    }
});
