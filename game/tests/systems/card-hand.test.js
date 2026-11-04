import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {drawStartingHand,updateCardDraw,skipCard,CARD_DECK} from "../../js/systems/cards.js";

test("the playable deck covers all four hundred catalogue categories",()=>{
    assert.equal(CARD_DECK.length,400);
    assert.equal(new Set(CARD_DECK.map(card=>card.category)).size,400);
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
