import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {createCardForCategory} from "../../js/systems/card-catalog.js";
import {drawStartingHand,drawNewCard,updateCardDraw,skipCard,placeCurrentCard,restoreHand,CARD_DECK} from "../../js/systems/cards.js";

test("the playable deck covers all five hundred catalogue categories",()=>{
    assert.equal(CARD_DECK.length,500);
    assert.equal(new Set(CARD_DECK.map(card=>card.category)).size,500);
});
test("a new realm begins with an empty hand and deals cards on a hidden timer",()=>{
    resetState();
    drawStartingHand();
    assert.equal(state.hand.length,0);
    assert.equal(state.currentCard,null);
    const firstDue=state.nextCardDrawTick;
    state.tick=firstDue-1;
    assert.equal(updateCardDraw(),false);
    assert.equal(state.hand.length,0);
    state.tick=firstDue;
    assert.equal(updateCardDraw(),true);
    assert.equal(state.hand.length,1);
    assert.equal(state.currentCard.instanceId,state.selectedCardInstanceId);
    while(state.hand.length<5){
        state.tick=state.nextCardDrawTick;
        assert.equal(updateCardDraw(),true);
    }
    assert.equal(state.hand.length,5);
    assert.equal(state.nextCardDrawTick,0);
    assert.equal(new Set(state.hand.map(card=>card.instanceId)).size,5);
    assert.equal(new Set(state.hand.map(card=>card.id)).size,5);
    assert.ok(state.hand.every(card=>card.cost&&card.category&&card.scale&&card.rarity&&card.context));
});
test("discarding a card costs no resources and schedules a later replacement",()=>{
    resetState();
    drawStartingHand();
    state.tick=state.nextCardDrawTick;
    updateCardDraw();
    const gold=state.resources.gold;
    assert.equal(skipCard(),true);
    assert.equal(state.hand.length,0);
    assert.equal(state.resources.gold,gold);
    assert.ok(state.nextCardDrawTick>state.tick);
});

test("playing a building card removes it and schedules its randomized replacement",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.explored=Array.from({length:WORLD_W},()=>Array(WORLD_H).fill(false));
    const card=createCardForCategory("cottages");
    card.instanceId="card-play-test";
    state.hand=[card];
    state.currentCard=card;
    state.selectedCardInstanceId=card.instanceId;
    state.tick=100;
    const woodBefore=state.resources.wood;
    assert.equal(placeCurrentCard(40,40),true);
    assert.equal(state.hand.length,0);
    assert.equal(state.currentCard,null);
    assert.ok(state.nextCardDrawTick>state.tick);
    assert.ok(state.resources.wood<woodBefore);
    const nextDue=state.nextCardDrawTick;
    state.tick=nextDue-1;
    assert.equal(updateCardDraw(),false);
    state.tick=nextDue;
    assert.equal(updateCardDraw(),true);
    assert.equal(state.hand.length,1);
});

test("an issue-earned card takes priority over the random catalogue draw",()=>{
    resetState();
    drawStartingHand();
    state.cardRewardQueue=[createCardForCategory("gold-mines")];
    const card=drawNewCard();
    assert.equal(card.category,"gold-mines");
    assert.equal(state.cardRewardQueue.length,0);
    assert.equal(state.hand.length,1);
});
test("queued card rewards survive save restoration",()=>{
    resetState();
    const reward=createCardForCategory("embassies");
    restoreHand([],null,[...CARD_DECK],40,[reward]);
    assert.equal(state.cardRewardQueue.length,1);
    state.tick=40;
    const card=drawNewCard();
    assert.equal(card.category,"embassies");
    assert.equal(state.cardRewardQueue.length,0);
});
