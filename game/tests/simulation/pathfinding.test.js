import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {spawnEntity} from "../../js/world/entities.js";
import {findPath,isWalkable,updateFriendlyMovement,getPathCacheStats,clearPathCache} from "../../js/simulation/villagers.js";

function prepare(){
    resetState();
    state.isPaused=false;state.gameOver=false;state.victory=false;
    state.terrainResolution=1;state.terrainPixW=WORLD_W;state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
}

test("A-star finds a route around a blocking building footprint",()=>{
    prepare();
    spawnEntity(40,40,TYPE.KEEP);
    const route=findPath(35.5,40.5,45.5,40.5);
    assert.ok(route);
    assert.ok(route.length>8);
    assert.ok(route.some(node=>node.y<39||node.y>42));
    assert.ok(route.every(node=>isWalkable(node.x,node.y)));
});

test("A-star does not invent a route through a full-width water barrier",()=>{
    prepare();
    for(let y=0;y<WORLD_H;y++)state.heightMap[y*WORLD_W+40]=0.1;
    assert.equal(findPath(35.5,40.5,45.5,40.5),null);
});

test("hierarchical fallback routes a long open-map path without raising the local A* cap",()=>{
    resetState();
    const W=576,H=576;
    state.worldW=W;state.worldH=H;
    state.terrainResolution=1;state.terrainPixW=W;state.terrainPixH=H;
    state.heightMap=new Float32Array(W*H).fill(0.5);
    const route=findPath(20.5,20.5,520.5,520.5,1800);
    assert.ok(Array.isArray(route),"the coarse route must bridge the local search cap");
    assert.ok(route.length>400,"the route must actually reach across the large map");
    assert.deepEqual(route.at(-1),{x:520.5,y:520.5});
    assert.ok(route.every(node=>isWalkable(node.x,node.y)),"every coarse and local node must be walkable");
    for(let i=1;i<route.length;i++){
        assert.ok(Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y)<=1.5,"local segments must remain contiguous");
    }
});

test("hierarchical fallback does not bridge a full-width water barrier",()=>{
    prepare();
    for(let y=0;y<WORLD_H;y++)state.heightMap[y*WORLD_W+80]=0.1;
    assert.equal(findPath(20.5,40.5,140.5,40.5),null);
});

test("pathfinding and walkability use the full larger world bounds",()=>{
    resetState();
    const W=448,H=448;
    state.worldW=W;state.worldH=H;
    state.terrainResolution=1;state.terrainPixW=W;state.terrainPixH=H;
    state.heightMap=new Float32Array(W*H).fill(0.5);
    assert.equal(isWalkable(400.5,400.5),true,"walkability must not stop at the legacy 160-tile edge");
    assert.equal(isWalkable(447.5,447.5),true);
    assert.equal(isWalkable(448.5,448.5),false);
    const route=findPath(395.5,400.5,405.5,400.5,400);
    assert.ok(Array.isArray(route)&&route.length>0,"A* must find a route on a larger map");
    assert.ok(route.every(node=>node.x>390&&node.x<410),"the route must stay near the requested larger-map coordinates");
});

test("hierarchical path cache stays bounded across repeated world epochs",()=>{
    resetState();
    const W=128,H=128;
    state.worldW=W;state.worldH=H;
    state.terrainResolution=1;state.terrainPixW=W;state.terrainPixH=H;
    state.heightMap=new Float32Array(W*H).fill(0.5);
    clearPathCache();
    let route=null;
    for(let index=0;index<30;index++){
        state.worldEpoch=(state.worldEpoch||0)+1;
        route=findPath(10.5,10.5,110.5,110.5,40);
        assert.ok(Array.isArray(route),"the coarse route must remain available after cache churn");
        assert.deepEqual(route.at(-1),{x:110.5,y:110.5});
    }
    const stats=getPathCacheStats();
    assert.equal(stats.limit,24);
    assert.ok(stats.size<=stats.limit,"the hierarchical grid cache must never exceed its limit");
    assert.ok(stats.misses>=30,"each world epoch must miss the old cache key");
    assert.ok(stats.evictions>0,"the bounded cache must evict old grids");
    assert.ok(stats.invalidations>0,"world changes must be visible in diagnostics");
    const afterEviction=findPath(10.5,10.5,110.5,110.5,40);
    assert.ok(Array.isArray(afterEviction),"evicting an old grid must not break a fresh route");
    assert.deepEqual(afterEviction.at(-1),{x:110.5,y:110.5});
    clearPathCache();
});

test("units follow cached routes instead of repeatedly pushing into a building",()=>{
    prepare();
    spawnEntity(40,40,TYPE.KEEP);
    const villager=spawnEntity(35.5,40.5,TYPE.VILLAGER);
    villager.targetX=45.5;villager.targetY=40.5;
    villager.routinePhase=0;villager.routineTimer=1000;villager.visualState="walk";
    for(let step=0;step<180;step++)updateFriendlyMovement(1/30);
    assert.ok(villager.x>37,"villager should make progress around the obstacle");
    assert.ok(isWalkable(villager.x,villager.y),"villager must not enter blocked building tiles");
    assert.ok(Number.isFinite(villager.x)&&Number.isFinite(villager.y));
});
