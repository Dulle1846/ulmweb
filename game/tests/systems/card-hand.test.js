import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {createCardForCategory} from "../../js/systems/card-catalog.js";
import {drawStartingHand,drawNewCard,drawPlayerCard,selectCard,skipCard,placeCurrentCard,restoreHand,CARD_DECK} from "../../js/systems/cards.js";

test("the playable deck covers all five hundred catalogue categories",()=>{
    assert.equal(CARD_DECK.length,500);
    assert.equal(new Set(CARD_DECK.map(card=>card.category)).size,500);
});
test("a new realm begins empty and only deals when the player asks",()=>{
    resetState();
    state.hasStarted=true;
    drawStartingHand();
    assert.equal(state.hand.length,0);
    assert.equal(state.currentCard,null);
    assert.equal(state.nextCardDrawTick,0);
    assert.equal(state.statistics.totalCardsDrawn,0);
    // Time alone must never add a card.
    state.tick=5000;
    assert.equal(state.hand.length,0);
    const result=drawPlayerCard();
    assert.equal(result.ok,true);
    assert.equal(state.hand.length,1);
    assert.equal(state.currentCard,null,"drawing must not select the new card");
    assert.equal(state.selectedCardInstanceId,null);
    assert.equal(state.statistics.totalCardsDrawn,1,"the checklist counter must record the first draw");
});
test("the hand holds five cards and refuses a sixth until one leaves",()=>{
    resetState();
    state.hasStarted=true;
    drawStartingHand();
    for(let index=0;index<5;index++)assert.equal(drawPlayerCard().ok,true);
    assert.equal(state.hand.length,5);
    assert.equal(new Set(state.hand.map(card=>card.instanceId)).size,5);
    assert.equal(new Set(state.hand.map(card=>card.id)).size,5);
    assert.ok(state.hand.every(card=>card.cost&&card.category&&card.scale&&card.rarity&&card.context));
    const overflow=drawPlayerCard();
    assert.equal(overflow.ok,false);
    assert.match(overflow.reason,/hand is full/i);
    assert.equal(state.hand.length,5);
});
test("discarding a card costs no resources and selects nothing else",()=>{
    resetState();
    state.hasStarted=true;
    drawStartingHand();
    drawPlayerCard();
    const first=state.hand[0];
    assert.equal(selectCard(first.instanceId),true);
    const gold=state.resources.gold;
    assert.equal(skipCard(),true);
    assert.equal(state.hand.length,0);
    assert.equal(state.resources.gold,gold);
    assert.equal(state.currentCard,null);

    // Discarding one of two cards must not silently arm the other one.
    drawPlayerCard();
    drawPlayerCard();
    assert.equal(selectCard(state.hand[0].instanceId),true);
    assert.equal(skipCard(),true);
    assert.equal(state.hand.length,1);
    assert.equal(state.currentCard,null,"the remaining card must stay unselected");
});
test("playing a building card consumes it and arms nothing else",()=>{
    resetState();
    state.hasStarted=true;
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.explored=Array.from({length:WORLD_W},()=>Array(WORLD_H).fill(false));
    const first=createCardForCategory("cottages");
    first.instanceId="card-play-test";
    const second=createCardForCategory("cottages");
    second.instanceId="card-keep-test";
    state.hand=[first,second];
    state.currentCard=first;
    state.selectedCardInstanceId=first.instanceId;
    const woodBefore=state.resources.wood;
    assert.equal(placeCurrentCard(40,40),true);
    assert.equal(state.hand.length,1);
    assert.equal(state.currentCard,null);
    assert.equal(state.selectedCardInstanceId,null);
    assert.equal(state.hand[0].instanceId,second.instanceId);
    assert.ok(state.resources.wood<woodBefore);
    assert.equal(drawPlayerCard().ok,true,"a freed slot must accept a new on-demand draw");
    assert.equal(state.currentCard,null,"the replacement must not be selected automatically");
});
test("an issue-earned card takes priority over the random catalogue draw",()=>{
    resetState();
    state.hasStarted=true;
    drawStartingHand();
    state.cardRewardQueue=[createCardForCategory("gold-mines")];
    const card=drawNewCard();
    assert.equal(card.category,"gold-mines");
    assert.equal(state.cardRewardQueue.length,0);
    assert.equal(state.hand.length,1);
});
test("restoring a hand only keeps an explicitly saved selection",()=>{
    resetState();
    const first=createCardForCategory("cottages");
    first.instanceId="card-restore-a";
    const second=createCardForCategory("embassies");
    second.instanceId="card-restore-b";
    restoreHand([first,second],first.instanceId,[...CARD_DECK],0);
    assert.equal(state.currentCard.instanceId,first.instanceId);
    assert.equal(state.nextCardDrawTick,0);

    restoreHand([first,second],null,[...CARD_DECK],0);
    assert.equal(state.currentCard,null,"an unselected save must not arm a card");
    assert.equal(state.selectedCardInstanceId,null);
});
test("queued card rewards survive save restoration",()=>{
    resetState();
    state.hasStarted=true;
    const reward=createCardForCategory("embassies");
    restoreHand([],null,[...CARD_DECK],40,[reward]);
    assert.equal(state.cardRewardQueue.length,1);
    state.tick=40;
    const card=drawNewCard();
    assert.equal(card.category,"embassies");
    assert.equal(state.cardRewardQueue.length,0);
});
