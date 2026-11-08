import test from "node:test";
import assert from "node:assert/strict";
import { resetState,state } from "../../js/core/state.js";
import {
    generateResourceGeography,getResourceNodeAt,findNearestResourceNode,
    harvestForest,extractStone,regrowForests,serializeResourceGeography,
    restoreResourceGeography,validateResourceGeographySnapshot
} from "../../js/systems/resource-geography.js";

function setup(seed=12345){
    resetState();
    state.worldSeed=seed;
    state.worldOptions={landmass:50,ruggedness:55,forests:52,water:48};
    state.terrainResolution=2;state.terrainPixW=320;state.terrainPixH=320;
    state.heightMap=new Float32Array(320*320).fill(0.5);
    state.moistureMap=new Float32Array(320*320).fill(0.8);
    for(let y=0;y<160;y++){
        for(let x=0;x<160;x++){
            const h=x<24?0.85:x<48?0.95:x<64?0.2:x<88?0.5:0.7;
            for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
                const i=(y*2+dy)*320+x*2+dx;
                state.heightMap[i]=h;
            }
        }
    }
    return generateResourceGeography(seed);
}
function findNode(type,xStart,xEnd){
    for(let x=xStart;x<xEnd;x++)for(let y=2;y<158;y++){
        const node=getResourceNodeAt(x,y);
        if(type==="forest"&&node.forestStock>0)return {x,y,node};
        if(type==="stone"&&node.stoneStock>0)return {x,y,node};
        if(type==="water"&&node.waterAccess)return {x,y,node};
    }
    return null;
}

test("resource geography is deterministic for the same seed and terrain",()=>{
    const first=setup(777);
    const firstForest=findNode("forest",0,24);
    const firstStone=findNode("stone",24,48);
    const firstWater=findNode("water",48,64);
    assert.ok(firstForest&&firstStone&&firstWater,"all resource regions should contain valid nodes");
    const saved={
        forest:first.forestStock.slice(),
        stone:first.stoneStock.slice(),
        fertility:first.fertility.slice(),
        water:first.waterAccess.slice()
    };
    const second=setup(777);
    assert.deepEqual(second.forestStock,saved.forest);
    assert.deepEqual(second.stoneStock,saved.stone);
    assert.deepEqual(second.fertility,saved.fertility);
    assert.deepEqual(second.waterAccess,saved.water);
});

test("resource nodes expose suitability, fertility and nearest-node search",()=>{
    setup();
    const forest=findNode("forest",0,24);
    const stone=findNode("stone",24,48);
    const water=findNode("water",48,64);
    assert.ok(forest.node.forestCapacity>=forest.node.forestStock);
    assert.ok(stone.node.stoneCapacity>=stone.node.stoneStock);
    assert.equal(water.node.waterAccess,true);
    assert.ok(getResourceNodeAt(72,10).fertility>0);
    assert.equal(getResourceNodeAt(-1,10),null);
    assert.equal(findNearestResourceNode("forest",forest.x,forest.y,0).x,forest.x);
    assert.equal(findNearestResourceNode("stone",forest.x,forest.y,0),null);
});

test("forest and stone extraction are bounded and never produce negative stock",()=>{
    setup();
    const forest=findNode("forest",0,24),stone=findNode("stone",24,48);
    const forestBefore=forest.node.forestStock,stoneBefore=stone.node.stoneStock;
    assert.equal(harvestForest(forest.x,forest.y,5),5);
    assert.equal(extractStone(stone.x,stone.y,7),7);
    assert.equal(getResourceNodeAt(forest.x,forest.y).forestStock,forestBefore-5);
    assert.equal(getResourceNodeAt(stone.x,stone.y).stoneStock,stoneBefore-7);
    assert.equal(harvestForest(forest.x,forest.y,999999),forestBefore-5);
    assert.equal(extractStone(stone.x,stone.y,999999),stoneBefore-7);
    assert.equal(harvestForest(forest.x,forest.y,0.5),0);
    assert.equal(getResourceNodeAt(forest.x,forest.y).forestStock,0);
});

test("resource depletion is sparse, validates and round-trips over deterministic generation",()=>{
    const generated=setup(4242);
    const forest=findNode("forest",0,24),stone=findNode("stone",24,48);
    harvestForest(forest.x,forest.y,11);
    extractStone(stone.x,stone.y,13);
    const snapshot=serializeResourceGeography();
    assert.equal(snapshot.version,1);
    assert.equal(snapshot.forest.length,1);
    assert.equal(snapshot.stone.length,1);
    validateResourceGeographySnapshot(snapshot);
    setup(4242);
    restoreResourceGeography(snapshot);
    assert.equal(getResourceNodeAt(forest.x,forest.y).forestStock,forest.node.forestStock-11);
    assert.equal(getResourceNodeAt(stone.x,stone.y).stoneStock,stone.node.stoneStock-13);
    assert.throws(()=>validateResourceGeographySnapshot({version:1,forest:[[0,1],[0,2]],stone:[]}),/invalid forest resource entry/);
    assert.throws(()=>validateResourceGeographySnapshot({version:2,forest:[],stone:[]}),/unsupported resource geography version/);
});

test("forest resource nodes carry their formation and standing value",()=>{
    setup();
    const forest=findNode("forest",0,24);
    assert.ok(forest,"the forest belt should contain a stand");
    assert.ok(forest.node.forestTypeLabel,"a forest node should name its formation");
    assert.match(forest.node.forestAge,/^(young|mature|ancient)$/);
    assert.ok(forest.node.forestSpecies.length>=5);
    assert.ok(forest.node.forestGoods.includes("timber"));
    assert.ok(forest.node.forestGoods.includes("firewood"));
    assert.ok(forest.node.forestFauna.length>0);
    assert.equal(forest.node.forestStock,forest.node.forestCapacity);
});

test("forests regrow slowly and only up to their original capacity",()=>{
    setup();
    const forest=findNode("forest",0,24);
    const capacity=forest.node.forestCapacity;
    harvestForest(forest.x,forest.y,capacity);
    assert.equal(getResourceNodeAt(forest.x,forest.y).forestStock,0);
    assert.equal(regrowForests(24),0);
    assert.equal(regrowForests(25),1);
    assert.equal(getResourceNodeAt(forest.x,forest.y).forestStock,1);
    // Trail/cut-over compaction deliberately makes full recovery take longer
    // than the old uniform timer; the long run still caps at capacity.
    const partial=regrowForests(10000);
    assert.ok(partial>0&&partial<capacity-1);
    assert.equal(regrowForests(10000),capacity-1-partial);
    assert.equal(getResourceNodeAt(forest.x,forest.y).forestStock,capacity);
});
