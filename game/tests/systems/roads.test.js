import test from "node:test";
import assert from "node:assert/strict";
import { resetState,state } from "../../js/core/state.js";
import { placeRoad,removeRoad,getRoadAt,getRoadCount,getRoadSpeedMultiplier,getRoadTravelCost,getRoadTiles,getRoadUpkeepTotal,getRoadConditionSnapshot,getRoadRepairCost,updateRoadWear,repairWornRoads,restoreRoads,serializeRoads,setRoadBuildMode,getRoadBuildMode,clearRoadBuildMode } from "../../js/systems/roads.js";
import { findPath } from "../../js/simulation/villagers.js";
import { calculateDailyLedger,updateEconomy } from "../../js/systems/economy.js";
import { TYPE } from "../../js/core/types.js";
import { initializeSettlementOwners,getSettlementSeats,registerSettlementSeat,serializeSettlementOwners,restoreSettlementOwners } from "../../js/systems/settlement-owners.js";

function setup(){
    resetState();
    state.explored=Array.from({length:160},()=>Array(160).fill(true));
    state.terrainResolution=1;state.terrainPixW=160;state.terrainPixH=160;
    state.heightMap=new Float32Array(160*160).fill(0.5);
    state.resources={wood:100,stone:100,gold:100,food:100};
    state.statistics={};
}
function addSeat(id,x,y,type=TYPE.KEEP){
    state.entities.push({id,x,y,type,dead:false,isBuilding:()=>true});
}
function seatById(id){
    return getSettlementSeats().find(seat=>seat.buildingId===id)||null;
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

test("the annual road survey wears road tiers, slows travel and raises emergency upkeep",()=>{
    setup();
    assert.equal(placeRoad(20,20,"dirt").ok,true);
    assert.equal(placeRoad(21,20,"paved").ok,true);
    state.year=2;
    state.city.logistics={carriers:[{},{},{}]};
    const initialSpeed=getRoadSpeedMultiplier(20.5,20.5);
    const initialTravelCost=getRoadTravelCost(20.5,20.5);
    const initialUpkeep=getRoadUpkeepTotal();
    const survey=updateRoadWear();
    const dirt=getRoadAt(20,20),paved=getRoadAt(21,20);
    assert.equal(survey.year,2);
    assert.equal(survey.changed,2,"both road tiles must be surveyed once");
    assert.ok(dirt.condition<100&&dirt.condition>=10,"dirt wear must stay above the impassable floor");
    assert.ok(paved.condition>dirt.condition,"a paved road must wear more slowly than a dirt path");
    assert.ok(getRoadSpeedMultiplier(20.5,20.5)<initialSpeed,"worn roads must slow travel");
    assert.ok(getRoadTravelCost(20.5,20.5)>initialTravelCost,"worn roads must cost more route time");
    assert.ok(getRoadUpkeepTotal()>initialUpkeep,"worn roads must add emergency upkeep");
    const snapshot=getRoadConditionSnapshot();
    assert.equal(snapshot.tiles,2);
    assert.equal(snapshot.worn,1,"only the dirt tile has crossed the worn threshold");
    assert.ok(snapshot.average<100&&snapshot.average>90);
    assert.ok(snapshot.repairCost.wood>0,"repairing a worn dirt path must cost real materials");
    const condition=dirt.condition;
    updateRoadWear();
    assert.equal(getRoadAt(20,20).condition,condition,"one year must produce exactly one survey");
});

test("worn roads repair for materials and restore their full movement bonus",()=>{
    setup();
    placeRoad(30,30,"dirt");
    state.year=3;
    state.city.logistics={carriers:[{},{},{}]};
    updateRoadWear();
    const worn=getRoadAt(30,30).condition;
    assert.ok(worn<100);
    const cost=getRoadRepairCost();
    const before={...state.resources};
    const repaired=repairWornRoads();
    assert.equal(repaired.ok,true);
    assert.equal(repaired.repaired,1);
    assert.equal(getRoadAt(30,30).condition,100);
    assert.equal(getRoadSpeedMultiplier(30.5,30.5),1.08,"repair must restore the full dirt-path speed");
    assert.equal(getRoadTravelCost(30.5,30.5),1);
    assert.ok(state.resources.wood<before.wood,"repair must spend the quoted wood");
    assert.deepEqual(repaired.cost,cost);
    assert.equal(state.roads.lastRepair.year,3);
    assert.equal(state.roads.lastRepair.tiles,1);
    assert.equal(repairWornRoads().ok,false,"sound roads must not charge a second repair");
    const saved=serializeRoads();
    resetState();
    setup();
    assert.equal(restoreRoads(saved),1);
    assert.equal(getRoadAt(30,30).condition,100,"the repaired condition must survive save and reload");
    assert.equal(state.roads.lastRepair.year,3);
    assert.equal(state.roads.lastWear.year,3);
});

test("each settlement pays for the worn roads inside its own territory",()=>{
    setup();
    addSeat("e-seat-a",40,40);
    addSeat("e-seat-b",60,60);
    assert.equal(placeRoad(40,45,"dirt").ok,true);
    assert.equal(placeRoad(60,65,"dirt").ok,true);
    assert.equal(placeRoad(90,90,"dirt").ok,true,"the remote road is wilderness");
    state.year=2;
    state.city.logistics={carriers:[{},{},{}]};
    initializeSettlementOwners();
    assert.equal(getSettlementSeats().length,2);
    for(const seat of getSettlementSeats()){seat.stores.wood=1;seat.stores.stone=1;seat.treasury.gold=1;}
    updateRoadWear();
    state.year=3;
    updateRoadWear();
    const snapshot=getRoadConditionSnapshot();
    assert.equal(snapshot.settlements.length,2,"both settlements must expose their own obligation");
    assert.equal(snapshot.wilderness.worn,1,"the remote road belongs to the crown pool");
    const a=snapshot.settlements.find(row=>row.id.includes("e-seat-a"));
    const b=snapshot.settlements.find(row=>row.id.includes("e-seat-b"));
    assert.equal(a.worn,1);assert.equal(b.worn,1);
    assert.ok(a.cost.wood>0&&a.affordable);
    const crownBefore={...state.resources};
    const result=repairWornRoads();
    assert.equal(result.ok,true);
    assert.equal(result.repaired,3);
    assert.equal(result.groups.length,3,"two seats and the crown must each settle their own bill");
    assert.equal(getRoadAt(40,45).condition,100);
    assert.equal(getRoadAt(60,65).condition,100);
    assert.equal(getRoadAt(90,90).condition,100);
    assert.ok(seatById("e-seat-a").stores.wood<1,"seat A must spend its own wood");
    assert.ok(seatById("e-seat-b").stores.wood<1,"seat B must spend its own wood");
    assert.ok(state.resources.wood<crownBefore.wood,"the wilderness tile must spend the crown pool");
    assert.deepEqual(result.shortfalls,[]);
});

test("an unaffordable settlement leaves its road worn and names the shortfall",()=>{
    setup();
    addSeat("e-seat-a",40,40);
    addSeat("e-seat-b",60,60);
    placeRoad(40,45,"dirt");
    placeRoad(60,65,"dirt");
    state.year=2;
    initializeSettlementOwners();
    const a=seatById("e-seat-a"),b=seatById("e-seat-b");
    a.stores.wood=1;a.stores.stone=1;a.treasury.gold=1;
    b.stores.wood=0;b.stores.stone=0;b.treasury.gold=0;
    updateRoadWear();
    updateRoadWear();
    state.year=3;
    updateRoadWear();
    const wornB=getRoadAt(60,65).condition;
    const snapshot=getRoadConditionSnapshot();
    const rowB=snapshot.settlements.find(row=>row.id.includes("e-seat-b"));
    assert.equal(rowB.affordable,false,"a settlement without materials must not be quoted as covered");
    assert.ok(rowB.shortfall.wood>0,"the panel must name the amount it is short");
    assert.equal(rowB.worn,1);
    assert.deepEqual(snapshot.obligation.shortSeats,[rowB.name]);
    const crownBefore={...state.resources};
    const result=repairWornRoads();
    assert.equal(result.ok,true,"the affordable settlement still repairs");
    assert.equal(result.repaired,1);
    assert.equal(getRoadAt(40,45).condition,100);
    assert.equal(getRoadAt(60,65).condition,wornB,"the short settlement's road must stay worn");
    assert.equal(seatById("e-seat-b").stores.wood,0,"nothing may be spent beyond the settlement's stores");
    assert.equal(seatById("e-seat-b").stores.stone,0);
    assert.equal(seatById("e-seat-b").treasury.gold,0);
    assert.equal(result.shortfalls.length,1);
    assert.equal(result.shortfalls[0].name,rowB.name);
    assert.ok(result.shortfalls[0].shortfall.wood>0);
    assert.deepEqual(state.resources,crownBefore,"a settlement bill must not fall through to the crown");
    assert.equal(repairWornRoads().ok,false,"the remaining worn tile is still an obligation, not a silent pass");
});

test("roads beyond every settlement territory fall back to the crown pool",()=>{
    setup();
    addSeat("e-seat-a",40,40);
    placeRoad(90,90,"dirt");
    state.year=2;
    initializeSettlementOwners();
    const seat=seatById("e-seat-a");
    seat.stores.wood=1;seat.stores.stone=1;seat.treasury.gold=1;
    updateRoadWear();
    state.year=3;
    updateRoadWear();
    const snapshot=getRoadConditionSnapshot();
    assert.equal(snapshot.settlements.length,0,"the seat owns no worn tile here");
    assert.equal(snapshot.wilderness.worn,1);
    const seatBefore={...seat.stores};
    const crownBefore={...state.resources};
    const result=repairWornRoads();
    assert.equal(result.ok,true);
    assert.equal(result.groups.length,1);
    assert.equal(result.groups[0].kind,"crown");
    assert.equal(getRoadAt(90,90).condition,100);
    assert.deepEqual(seat.stores,seatBefore,"wilderness work must not touch a settlement's stores");
    assert.ok(state.resources.wood<crownBefore.wood);
});

test("settlement seats and their maintenance balances survive save normalization",()=>{
    setup();
    addSeat("e-seat-a",40,40);
    placeRoad(40,45,"dirt");
    state.year=2;
    initializeSettlementOwners();
    const seat=seatById("e-seat-a");
    seat.stores.wood=0.75;seat.stores.stone=0.5;seat.treasury.gold=2.25;
    updateRoadWear();
    state.year=3;
    updateRoadWear();
    const saved=serializeSettlementOwners();
    const obligation=JSON.parse(JSON.stringify(seatById("e-seat-a").lastObligation));
    assert.ok(obligation&&obligation.tiles===1,"the survey must assess the seat's worn tile");
    setup();
    addSeat("e-seat-a",40,40);
    assert.equal(restoreSettlementOwners(saved),1);
    const restored=seatById("e-seat-a");
    assert.equal(restored.stores.wood,0.75);
    assert.equal(restored.stores.stone,0.5);
    assert.equal(restored.treasury.gold,2.25);
    assert.deepEqual(restored.lastObligation,obligation,"the assessed obligation must survive the save");
    // Malformed legacy values clamp instead of producing NaN or debt.
    state.entities=state.entities.filter(entity=>entity.id!=="e-seat-a");
    addSeat("e-hall",70,70,TYPE.TOWN_HALL);
    assert.equal(restoreSettlementOwners({version:1,seats:[{buildingId:"e-hall",name:"Hall",x:70,y:70,stores:{wood:-4,stone:"bad"},treasury:{gold:NaN},lastRepair:{year:2,tiles:-3,cost:{wood:-1}}}]}),1);
    const hall=seatById("e-hall");
    assert.equal(hall.stores.wood,0);
    assert.equal(hall.stores.stone,0);
    assert.equal(hall.treasury.gold,0);
    assert.equal(hall.lastRepair.tiles,0);
    assert.equal(hall.lastRepair.cost.wood,0);
    // A completed town hall registers itself through the construction path.
    const registered=registerSettlementSeat({id:"e-hall-2",type:TYPE.TOWN_HALL,x:72,y:72,dead:false,isBuilding:()=>true});
    assert.ok(registered,"a completed seat building must become an owner immediately");
    assert.equal(getSettlementSeats().length,2);
});

test("legacy road tiles without condition normalize to sound roads",()=>{
    setup();
    assert.equal(restoreRoads({version:1,revision:2,tiles:{"1:1":{type:"dirt"},"2:2":{type:"gravel",condition:0}}}),2);
    assert.equal(getRoadAt(1,1).condition,100,"a missing condition must mean a newly built road");
    assert.equal(getRoadAt(2,2).condition,10,"an explicit zero must clamp to the wear floor, not reset to new");
    const snapshot=getRoadConditionSnapshot();
    assert.equal(snapshot.lastWear,null);
    assert.equal(snapshot.lastRepair,null);
});
