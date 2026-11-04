import test from "node:test";
import assert from "node:assert/strict";
import {CARD_CATEGORIES,CARD_PROTOTYPES,CARD_VARIANT_DIMENSIONS,POTENTIAL_CARD_VARIANTS,createCardVariant,createCardForCategory} from "../../js/systems/card-catalog.js";

test("the expandable taxonomy contains five hundred distinct categories",()=>{
    assert.equal(CARD_CATEGORIES.length,500);
    assert.equal(new Set(CARD_CATEGORIES.map(item=>item.id)).size,500);
});
test("potential variants are generated on demand instead of eagerly allocated",()=>{
    assert.equal(CARD_VARIANT_DIMENSIONS.scales.length,10);
    assert.equal(CARD_VARIANT_DIMENSIONS.rarities.length,10);
    assert.equal(CARD_VARIANT_DIMENSIONS.contexts.length,10);
    assert.equal(POTENTIAL_CARD_VARIANTS,500000);
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

test("every category creates a playable archetype and all effects resolve",()=>{
    for(const category of CARD_CATEGORIES){
        const card=createCardForCategory(category.id);
        assert.equal(card.category,category.id);
        assert.ok(card.kind);
        if(card.kind==="effect")assert.ok(["harvest","gold-rush","festival","supply-cache"].includes(card.effect));
    }
});

test("second-stage randomization preserves the authored base name without duplicating context",()=>{
    const prototype=createCardForCategory("blacksmiths");
    const variant=createCardVariant(prototype,{scale:"large",rarity:"rare",context:"frontier"});
    assert.equal(variant.baseName,"BLACKSMITHS");
    assert.match(variant.name,/Blacksmiths/);
    assert.equal((variant.name.match(/OF THE HEARTLAND/g)||[]).length,0);
    assert.equal((variant.name.match(/OF THE FRONTIER/g)||[]).length,1);
});
test("the expanded taxonomy exposes ten new thematic groups",()=>{
    const groups=new Set(CARD_CATEGORIES.map(category=>category.group));
    for(const group of ["weather","underworld","spirits","relics","botany","geology","administration","frontier","urbanism","scholarship"]){
        assert.ok(groups.has(group),group+" group is missing");
    }
});
