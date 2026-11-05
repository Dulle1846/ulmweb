import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {random,rand,randInt,getRandomStreamSnapshot,restoreRandomStreams} from "../../js/core/random.js";
test("named streams replay exactly for the same world seed",()=>{resetState();state.worldSeed=918273;const first=Array.from({length:8},()=>random("events"));resetState();state.worldSeed=918273;assert.deepEqual(Array.from({length:8},()=>random("events")),first);});
test("independent streams do not advance one another",()=>{resetState();state.worldSeed=77;const expected=[random("cards"),random("cards")];resetState();state.worldSeed=77;random("health");assert.deepEqual([random("cards"),random("cards")],expected);});
test("saved counters restore the exact next values",()=>{resetState();state.worldSeed=12345;random("simulation");random("simulation");random("events");const saved=getRandomStreamSnapshot(),expected=[random("simulation"),random("events")];restoreRandomStreams(saved);assert.deepEqual([random("simulation"),random("events")],expected);});
test("helpers respect half-open ranges and reject invalid bounds",()=>{resetState();state.worldSeed=99;for(let i=0;i<100;i++){const n=randInt(-3,4,"test"),x=rand(2,5,"test");assert.ok(Number.isInteger(n)&&n>=-3&&n<4);assert.ok(x>=2&&x<5);}assert.throws(()=>randInt(2,2),RangeError);assert.throws(()=>rand(4,3),RangeError);});
test("malformed saved counters are ignored",()=>{resetState();assert.deepEqual(restoreRandomStreams({valid:3,negative:-1,fractional:1.5,huge:Number.MAX_SAFE_INTEGER+1,array:[]}),{valid:3});});
