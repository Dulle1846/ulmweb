import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CARD_CATEGORIES} from "../../js/systems/card-catalog.js";

test("all new card-school illustrations exist in the shared SVG sprite sheet",()=>{
    const svg=readFileSync(new URL("../../assets/realm-sprites.svg",import.meta.url),"utf8");
    const ids=["icon-weather","icon-underworld","icon-spirit","icon-relic","icon-botany","icon-geology","icon-admin","icon-frontier","icon-urban","icon-scholar"];
    for(const id of ids)assert.match(svg,new RegExp('<symbol id="'+id+'"'));
});
test("every expanded card taxonomy group has a corresponding sprite",()=>{
    const svg=readFileSync(new URL("../../assets/realm-sprites.svg",import.meta.url),"utf8");
    const groups=new Set(CARD_CATEGORIES.map(category=>category.group));
    const mappings={
        weather:"icon-weather",underworld:"icon-underworld",spirits:"icon-spirit",relics:"icon-relic",
        botany:"icon-botany",geology:"icon-geology",administration:"icon-admin",frontier:"icon-frontier",
        urbanism:"icon-urban",scholarship:"icon-scholar"
    };
    for(const [group,id] of Object.entries(mappings)){
        assert.ok(groups.has(group));
        assert.match(svg,new RegExp('<symbol id="'+id+'"'));
    }
});
