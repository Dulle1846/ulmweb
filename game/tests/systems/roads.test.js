import test from "node:test";
import assert from "node:assert/strict";
import { resetState,state } from "../../js/core/state.js";
import { placeRoad,removeRoad,getRoadAt,getRoadCount,getRoadSpeedMultiplier,getRoadTravelCost,getRoadTiles,getRoadUpkeepTotal,restoreRoads,serializeRoads,setRoadBuildMode,getRoadBuildMode,clearRoadBuildMode } from "../../js/systems/roads.js";
import { findPath } from "../../js/simulation/villagers.js";
import { calculateDailyLedger,updateEconomy } from "../../js/systems/economy.js";

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
    assert.ok(Math.abs(state.incomeThisTick.wood+0.15)<1e-9,"dirt road wood cost must reach the tick ledger");
    assert.equal(state.incomeThisTick.stone,0);
    assert.equal(state.incomeThisTick.gold,0);
    assert.equal(getRoadSpeedMultiplier(20.5,20.5),1.08);
    assert.equal(getRoadTravelCost(20.5,20.5),1);
    assert.equal(placeRoad(20,20,"dirt").ok,false);
    assert.equal(placeRoad(20,20,"gravel").upgraded,true);
    assert.equal(getRoadCount(),1);
    assert.ok(Math.abs(state.incomeThisTick.wood+0.10)<1e-9,"the cheaper upgrade wood share must refund 0.05 on top of the dirt cost");
    assert.ok(Math.abs(state.incomeThisTick.stone+0.22)<1e-9,"the upgrade stone delta must reach the tick ledger");
    assert.equal(getRoadAt(20,20).type,"gravel");
    assert.equal(getRoadSpeedMultiplier(20,20),1.18);
    assert.equal(getRoadTravelCost(20,20),0.9);
    assert.equal(placeRoad(20,20,"dirt").ok,false);
});

test("road removal refunds part of the material cost and invalidates the tile",()=>{
    setup();
    assert.equal(placeRoad(21,21,"paved").ok,true);
    const before={...state.resources};
    const incomeBefore={...state.incomeThisTick};
    assert.equal(removeRoad(21,21).ok,true);
    assert.equal(getRoadAt(21,21),null);
    const refund={wood:0.1*0.25,stone:0.38*0.25,gold:0.025*0.25};
    for(const [resource,amount] of Object.entries(refund)){
        assert.ok(Math.abs(state.resources[resource]-before[resource]-amount)<1e-9,"refund must increase "+resource);
        assert.ok(Math.abs(state.incomeThisTick[resource]-incomeBefore[resource]-amount)<1e-9,"refund must reach the "+resource+" tick ledger");
    }
    assert.equal(removeRoad(21,21).ok,false);
});

test("an unaffordable multi-resource road leaves every balance and tick entry untouched",()=>{
    setup();
    state.resources={wood:100,stone:0,gold:100,food:100};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
    const result=placeRoad(22,22,"paved");
    assert.equal(result.ok,false);
    assert.deepEqual(state.resources,{wood:100,stone:0,gold:100,food:100});
    assert.deepEqual(state.incomeThisTick,{wood:0,stone:0,gold:0,food:0});
    assert.equal(getRoadCount(),0);
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
    assert.equal(setRoadBuildMode("remove"),true);
    assert.equal(getRoadBuildMode(),"remove");
    clearRoadBuildMode();
    assert.equal(getRoadBuildMode(),null);
});

test("roads can be built anywhere on worlds larger than the legacy 160 grid",()=>{
    setup();
    const W=448,H=448;
    state.worldW=W;state.worldH=H;
    state.explored=Array.from({length:W},()=>Array(H).fill(true));
    state.terrainResolution=1;state.terrainPixW=W;state.terrainPixH=H;
    state.heightMap=new Float32Array(W*H).fill(0.5);
    const placed=placeRoad(400,400,"dirt");
    assert.equal(placed.ok,true,"road placement must accept larger-map coordinates");
    assert.equal(getRoadAt(400,400).type,"dirt");
    assert.equal(removeRoad(400,400).ok,true);
    assert.equal(getRoadAt(400,400),null);
});

test("A* prefers a long paved corridor when it is cheaper than a shorter dirt route",()=>{
    setup();
    for(let x=10;x<=30;x++)assert.equal(placeRoad(x,6,"paved").ok,true);
    const route=findPath(10.5,5.5,30.5,5.5,5000);
    assert.ok(Array.isArray(route)&&route.length>0);
    const pavedNodes=route.filter(node=>getRoadAt(Math.floor(node.x),Math.floor(node.y))?.type==="paved");
    assert.ok(pavedNodes.length>=18,"the route should use most of the paved corridor instead of taking the shorter off-road line");
});

test("road maintenance is included in the settlement treasury ledger",()=>{
    setup();
    placeRoad(40,40,"dirt");
    const roadCost=getRoadUpkeepTotal();
    const ledger=calculateDailyLedger({population:10,employed:5,buildings:2,foodAvailable:100,goldAvailable:100,roadUpkeep:roadCost*20});
    assert.equal(ledger.roadUpkeepAssessed,roadCost*20);
    assert.equal(ledger.upkeepAssessed,2*0.003*20+roadCost*20);
    state.tick=20;
    state.resources.gold=100;
    const settled=updateEconomy();
    assert.equal(settled.roadUpkeepAssessed,roadCost*20,"the live ledger must charge the actual road network");
});
