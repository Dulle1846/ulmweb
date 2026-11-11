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

test("hierarchical path cache keeps LRU eviction within one world",()=>{
    resetState();
    const W=128,H=128;
    state.worldW=W;state.worldH=H;
    state.terrainResolution=1;state.terrainPixW=W;state.terrainPixH=H;
    state.heightMap=new Float32Array(W*H).fill(0.5);
    clearPathCache();
    findPath(10.5,8.5,110.5,70.5,40);
    const beforeHit=getPathCacheStats();
    const hitRoute=findPath(10.5,8.5,110.5,70.5,40);
    assert.ok(Array.isArray(hitRoute));
    assert.ok(getPathCacheStats().hits>beforeHit.hits,"a repeated grid must be a cache hit");
    for(let index=0;index<30;index++){
        const route=findPath(10.5,8.5+index*2,110.5,70.5,40);
        assert.ok(Array.isArray(route),"the coarse route must remain available after cache churn");
        assert.deepEqual(route.at(-1),{x:110.5,y:70.5});
    }
    const stats=getPathCacheStats();
    assert.equal(stats.limit,24);
    assert.ok(stats.size<=stats.limit,"the hierarchical grid cache must never exceed its limit");
    assert.ok(stats.evictions>0,"the bounded cache must evict old grids");
    assert.equal(stats.invalidations,0,"same-world churn must not invalidate the world");
    assert.ok(stats.estimatedBytes>0,"the diagnostic must expose retained grid memory");
    const afterEviction=findPath(10.5,8.5,110.5,70.5,40);
    assert.ok(Array.isArray(afterEviction),"evicting an old grid must not break a fresh route");
    assert.deepEqual(afterEviction.at(-1),{x:110.5,y:70.5});
    clearPathCache();
});

test("world, collision, size and terrain changes invalidate old grids immediately",()=>{
    resetState();
    const W=128,H=128;
    state.worldW=W;state.worldH=H;
    state.terrainResolution=1;state.terrainPixW=W;state.terrainPixH=H;
    state.heightMap=new Float32Array(W*H).fill(0.5);
    clearPathCache();
    state.worldEpoch=(state.worldEpoch||0)+1;
    assert.ok(Array.isArray(findPath(10.5,10.5,110.5,110.5,40)),"warm-up world must route");
    let previousInvalidations=getPathCacheStats().invalidations;
    for(let epoch=2;epoch<=6;epoch++){
        state.worldEpoch=(state.worldEpoch||0)+1;
        const route=findPath(10.5,10.5,110.5,110.5,40);
        assert.ok(Array.isArray(route),"a fresh world must produce a fresh route");
        const stats=getPathCacheStats();
        assert.ok(stats.size<=3,"only the current world's grids may remain");
        assert.ok(stats.invalidations>previousInvalidations,"world changes must be counted");
        assert.ok(stats.worldKey.startsWith(String(state.worldEpoch)+":"),"diagnostics must identify the current world");
        previousInvalidations=stats.invalidations;
    }

    state.buildingCollisionVersion=(state.buildingCollisionVersion||0)+1;
    assert.ok(Array.isArray(findPath(10.5,10.5,110.5,110.5,40)));
    assert.ok(getPathCacheStats().invalidations>previousInvalidations,"collision changes must invalidate");
    previousInvalidations=getPathCacheStats().invalidations;

    state.worldW=96;state.worldH=96;
    state.terrainPixW=96;state.terrainPixH=96;
    state.heightMap=new Float32Array(96*96).fill(0.5);
    assert.ok(Array.isArray(findPath(10.5,10.5,80.5,80.5,40)));
    assert.ok(getPathCacheStats().invalidations>previousInvalidations,"world-size changes must invalidate");
    previousInvalidations=getPathCacheStats().invalidations;

    state.heightMap.fill(0.1);
    state.worldEpoch=(state.worldEpoch||0)+1;
    assert.equal(findPath(10.5,10.5,80.5,80.5,40),null,"the new water world must not reuse an old land route");
    let stats=getPathCacheStats();
    assert.equal(stats.size,0,"a failed reachability probe must not retain a grid");
    assert.ok(stats.invalidations>previousInvalidations);
    assert.equal(stats.estimatedBytes,0);

    state.heightMap.fill(0.5);
    state.worldEpoch=(state.worldEpoch||0)+1;
    assert.ok(Array.isArray(findPath(10.5,10.5,80.5,80.5,40)),"the restored land world must produce a fresh route");
    stats=getPathCacheStats();
    assert.ok(stats.size>0&&stats.estimatedBytes>0);
    assert.ok(stats.invalidations>previousInvalidations);
    clearPathCache();
    assert.equal(getPathCacheStats().size,0);
    assert.equal(getPathCacheStats().estimatedBytes,0);
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

test("nearby walkers keep personal space while heading for the same target",()=>{
    prepare();
    const first=spawnEntity(40.5,40.5,TYPE.VILLAGER);
    const second=spawnEntity(40.51,40.5,TYPE.VILLAGER);
    for(const unit of [first,second]){
        unit.routinePhase=0;unit.routineTimer=1000;unit.targetX=45.5;unit.targetY=40.5;
        unit.anchor={x:40.5,y:40.5};unit.home={x:40.5,y:40.5};unit.movePause=0;unit.path=null;
    }
    for(let step=0;step<90;step++)updateFriendlyMovement(1/30);
    assert.ok(Math.hypot(first.x-second.x,first.y-second.y)>0.25,"walkers must not occupy the same spot");
    assert.ok(isWalkable(first.x,first.y)&&isWalkable(second.x,second.y),"separation must stay on walkable ground");
});
