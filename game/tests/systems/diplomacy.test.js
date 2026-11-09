import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {createMarketState,executeTrade} from "../../js/systems/market.js";
import {DIPLOMATIC_REALMS,TRADE_PARTNERS} from "../../js/systems/diplomacy-config.js";
import {getDiplomaticTradeTerms} from "../../js/systems/diplomacy-trade.js";
import {
    createDiplomacyState,normalizeDiplomacySnapshot,getDiplomacySnapshot,
    sendGift,proposeTradePact,proposeAlliance,declareWar,sueForPeace,updateDiplomacy
} from "../../js/systems/diplomacy.js";

beforeEach(()=>{
    resetState();
    state.hasStarted=true;
    state.diplomacy=createDiplomacyState();
    state.market=createMarketState();
    state.resources={wood:100,stone:100,gold:200,food:100};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
    state.morale=70;
});
const realm=id=>state.diplomacy.realms.find(item=>item.id===id);

test("every trade partner has exactly one diplomatic realm",()=>{
    assert.deepEqual(TRADE_PARTNERS.map(partner=>partner.id),DIPLOMATIC_REALMS.map(entry=>entry.id));
    assert.equal(getDiplomacySnapshot().realms.length,4);
});

test("a royal gift spends gold and improves relation and trust",()=>{
    const target=realm("northmere");
    const relationBefore=target.relation,trustBefore=target.trust;
    const result=sendGift("northmere");
    assert.equal(result.ok,true);
    assert.equal(state.resources.gold,188);
    assert.ok(target.relation>relationBefore);
    assert.ok(target.trust>trustBefore);
    assert.equal(target.history[0].kind,"gift");
});

test("treaties progress from trade pact to alliance and war closes the market",()=>{
    const target=realm("northmere");
    target.relation=50;
    assert.equal(proposeTradePact("northmere").ok,true);
    assert.equal(target.treaty,"trade");

    target.relation=70;
    assert.equal(proposeAlliance("northmere").ok,true);
    assert.equal(target.treaty,"alliance");

    assert.equal(declareWar("northmere").ok,true);
    assert.equal(target.treaty,"war");
    const trade=executeTrade("northmere","wood","buy",1);
    assert.equal(trade.ok,false);
    assert.match(trade.reason,/WAR/);

    state.resources.gold=100;
    state.resources.food=100;
    assert.equal(sueForPeace("northmere").ok,true);
    assert.equal(target.treaty,"none");
    assert.ok(target.relation>=28);
});

test("annual diplomacy moves pacts and sends allied aid once per year",()=>{
    const target=realm("goldcoast");
    target.treaty="alliance";
    target.relation=74;
    const goldBefore=state.resources.gold,foodBefore=state.resources.food;
    const decisionsBefore=state.politics.settlements;
    state.year=2;
    const snapshot=updateDiplomacy();
    assert.equal(snapshot.lastUpdateYear,2);
    assert.equal(state.resources.gold,goldBefore+3);
    assert.equal(state.resources.food,foodBefore+4);
    assert.equal(state.politics.settlements,decisionsBefore,"annual drift is not a royal decision");
    assert.ok(target.relation>74);
    const relationAfter=target.relation;
    updateDiplomacy();
    assert.equal(state.resources.gold,goldBefore+3);
    assert.equal(target.relation,relationAfter);
});

test("successful trade improves the partner relationship and records volume",()=>{
    const target=realm("ironvale");
    const relationBefore=target.relation,tradedBefore=target.tradeVolume;
    state.tick=0;
    const result=executeTrade("ironvale","stone","buy",5);
    assert.equal(result.ok,true);
    assert.ok(target.relation>relationBefore);
    assert.equal(target.tradeVolume,tradedBefore+5);
    assert.equal(target.lastTradeYear,state.year);
    assert.equal(target.history[0].kind,"trade");
});

test("better relations and treaties improve trade terms while war blocks them",()=>{
    const friendly=createDiplomacyState();
    const northmere=friendly.realms.find(item=>item.id==="northmere");
    northmere.relation=100;
    northmere.treaty="alliance";
    const warm=getDiplomaticTradeTerms(friendly,"northmere");
    assert.ok(warm.buyFactor<1);
    assert.ok(warm.sellFactor>1);
    northmere.treaty="war";
    assert.equal(getDiplomaticTradeTerms(friendly,"northmere").blocked,true);
});

test("legacy and malformed diplomacy saves are normalized into the bounded shape",()=>{
    const normalized=normalizeDiplomacySnapshot({
        lastUpdateYear:"7",
        realms:[{id:"northmere",relation:999,trust:-5,fear:"bad",treaty:"war",tradeVolume:-3,relationHistory:[1,2,"bad"]}],
        history:[{year:2,kind:"gift",summary:"A valid record"}]
    });
    assert.equal(normalized.version,1);
    assert.equal(normalized.lastUpdateYear,7);
    assert.equal(normalized.realms.length,4);
    const northmere=normalized.realms.find(item=>item.id==="northmere");
    assert.equal(northmere.relation,100);
    assert.equal(northmere.trust,0);
    assert.equal(northmere.fear,0);
    assert.equal(northmere.treaty,"war");
    assert.equal(northmere.tradeVolume,0);
    assert.deepEqual(northmere.relationHistory,[1,2]);
    assert.equal(normalized.history.length,1);
});
