import test from "node:test";
import assert from "node:assert/strict";
import {CARD_CATEGORIES,CARD_PROTOTYPES,CARD_VARIANT_DIMENSIONS,POTENTIAL_CARD_VARIANTS,createCardVariant} from "../../js/systems/card-catalog.js";

test("the extensible taxonomy contains one hundred distinct categories",()=>{
    assert.equal(CARD_CATEGORIES.length,100);
    assert.equal(new Set(CARD_CATEGORIES.map(item=>item.id)).size,100);
});
test("potential variants are generated on demand instead of eagerly allocated",()=>{
    assert.equal(CARD_VARIANT_DIMENSIONS.scales.length,10);
    assert.equal(CARD_VARIANT_DIMENSIONS.rarities.length,10);
    assert.equal(CARD_VARIANT_DIMENSIONS.contexts.length,10);
    assert.equal(POTENTIAL_CARD_VARIANTS,100000);
    assert.ok(CARD_PROTOTYPES.length>=15);
});
test("a card variant scales its costs and retains its prototype identity",()=>{
    const base=CARD_PROTOTYPES.find(card=>card.id==="cottage");
    const variant=createCardVariant(base,{scale:"grand",rarity:"rare",context:"frontier"});
    assert.equal(variant.category,base.category);
    assert.equal(variant.scale,"grand");
    assert.ok(variant.cost.wood>base.cost.wood);
});
test("unknown card variant dimensions are rejected",()=>{
    assert.throws(()=>createCardVariant(CARD_PROTOTYPES[0],{scale:"impossible"}),RangeError);
});
