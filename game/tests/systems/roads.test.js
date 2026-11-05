import test from "node:test";
import assert from "node:assert/strict";
import { resetState,state } from "../../js/core/state.js";
import { placeRoad,removeRoad,getRoadAt,getRoadCount,getRoadSpeedMultiplier,getRoadTravelCost,getRoadTiles,restoreRoads,serializeRoads,setRoadBuildMode,getRoadBuildMode,clearRoadBuildMode } from "../../js/systems/roads.js";
import { findPath } from "../../js/simulation/villagers.js";

function setup(){
    resetState();
    state.explored=Array.from({length:160},()=>Array(160).fill(true));
    state.terrainResolution=1;state.terrainPixW=160;state.terrainPixH=160;
    state.heightMap=new Float32Array(160*160).fill(0.5);
    state.resources={wood:100,stone:100,gold:100,food:100};
    state.statistics={};
}

test("road placement validates bounds, exploration, water and building footprints",()=>{
    setup();
    assert.equal(placeRoad(-1,4,"dirt").ok,false);
    state.explored[10][10]=false;
    assert.match(placeRoad(10,10,"dirt").reason,/Explore/);
    state.explored[10][10]=true;
    state.heightMap[11*160+11]=0.1;
    assert.match(placeRoad(11,11,"dirt").reason,/water/);
    state.heightMap[11*160+11]=0.5;
    state.entities.push({dead:false,x:12,y:12,type:1,footprintScale:1,isBuilding:()=>true});
    assert.match(placeRoad(12,12,"dirt").reason,/building/);
    assert.equal(getRoadCount(),0);
});

test("roads spend materials, upgrade in place and expose movement modifiers",()=>{
    setup();
    const first=placeRoad(20,20,"dirt");
    assert.equal(first.ok,true);
    assert.equal(getRoadCount(),1);
    assert.ok(state.resources.wood<100);
    assert.equal(getRoadSpeedMultiplier(20.5,20.5),1.08);
    assert.equal(getRoadTravelCost(20.5,20.5),1);
    assert.equal(placeRoad(20,20,"dirt").ok,false);
    assert.equal(placeRoad(20,20,"gravel").upgraded,true);
    assert.equal(getRoadCount(),1);
    assert.equal(getRoadAt(20,20).type,"gravel");
    assert.equal(getRoadSpeedMultiplier(20,20),1.18);
    assert.equal(getRoadTravelCost(20,20),0.9);
    assert.equal(placeRoad(20,20,"dirt").ok,false);
});

test("road removal refunds part of the material cost and invalidates the tile",()=>{
    setup();
    assert.equal(placeRoad(21,21,"paved").ok,true);
    const before=state.resources.stone;
    assert.equal(removeRoad(21,21).ok,true);
    assert.equal(getRoadAt(21,21),null);
    assert.ok(state.resources.stone>before);
    assert.equal(removeRoad(21,21).ok,false);
});

test("road save data round-trips and malformed entries are discarded",()=>{
    setup();
    placeRoad(30,31,"gravel");
    placeRoad(32,33,"paved");
    const saved=serializeRoads();
    resetState();
    assert.equal(restoreRoads(saved),2);
    assert.equal(getRoadAt(30,31).type,"gravel");
    assert.equal(getRoadAt(32,33).type,"paved");
    assert.equal(restoreRoads({version:1,revision:7,tiles:{"-1:2":{type:"dirt"},"1:1":{type:"unknown"},"2:3":{type:"dirt",builtAtTick:4,condition:75}}}),1);
    assert.equal(getRoadAt(2,3).condition,75);
});

test("road list is stable and build mode accepts only known tiers",()=>{
    setup();
    placeRoad(5,8,"dirt");placeRoad(2,3,"paved");
    assert.deepEqual(getRoadTiles().map(tile=>[tile.x,tile.y]),[[2,3],[5,8]]);
    assert.equal(setRoadBuildMode("invalid"),false);
    assert.equal(setRoadBuildMode("gravel"),true);
    assert.equal(getRoadBuildMode(),"gravel");
    clearRoadBuildMode();
    assert.equal(getRoadBuildMode(),null);
});

test("A* prefers a long paved corridor when it is cheaper than a shorter dirt route",()=>{
    setup();
    for(let x=10;x<=30;x++)assert.equal(placeRoad(x,6,"paved").ok,true);
    const route=findPath(10.5,5.5,30.5,5.5,5000);
    assert.ok(Array.isArray(route)&&route.length>0);
    const pavedNodes=route.filter(node=>getRoadAt(Math.floor(node.x),Math.floor(node.y))?.type==="paved");
    assert.ok(pavedNodes.length>=18,"the route should use most of the paved corridor instead of taking the shorter off-road line");
});
