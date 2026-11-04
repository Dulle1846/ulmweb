import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {drawStartingHand,CARD_DECK} from "../../js/systems/cards.js";

test("the playable deck covers all one hundred catalogue categories",()=>{
    assert.equal(CARD_DECK.length,100);
    assert.equal(new Set(CARD_DECK.map(card=>card.category)).size,100);
});
test("a new realm receives five unique randomly scaled cards",()=>{
    resetState();
    drawStartingHand();
    assert.equal(state.hand.length,5);
    assert.equal(new Set(state.hand.map(card=>card.instanceId)).size,5);
    assert.equal(new Set(state.hand.map(card=>card.id)).size,5);
    assert.ok(state.hand.every(card=>card.cost&&card.category&&card.scale&&card.rarity&&card.context));
    assert.equal(state.currentCard.instanceId,state.selectedCardInstanceId);
});
