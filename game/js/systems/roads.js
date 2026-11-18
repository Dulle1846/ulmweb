// Road network: compact tile data, deterministic route costs and versioned saves.
import { state } from "../core/state.js";
import { BUILDING_SIZE } from "../core/config.js";
import { isWaterAt, worldWidth, worldHeight } from "../world/world.js";
import { addResource } from "./resources.js";

export const ROAD_TYPES = Object.freeze({
    dirt: Object.freeze({ id:"dirt", label:"Dirt path", speed:1.08, travelCost:1.0, upkeep:0.0004, wear:4.2, repair:Object.freeze({wood:0.06,stone:0,gold:0}), cost:Object.freeze({wood:0.15,stone:0,gold:0}), color:"#a97849", edge:"#4e3526" }),
    gravel: Object.freeze({ id:"gravel", label:"Gravel road", speed:1.18, travelCost:0.9, upkeep:0.0008, wear:2.8, repair:Object.freeze({wood:0.04,stone:0.09,gold:0}), cost:Object.freeze({wood:0.1,stone:0.22,gold:0}), color:"#9a9b8c", edge:"#4e504b" }),
    paved: Object.freeze({ id:"paved", label:"Paved road", speed:1.35, travelCost:0.78, upkeep:0.0015, wear:1.8, repair:Object.freeze({wood:0.03,stone:0.14,gold:0.008}), cost:Object.freeze({wood:0.1,stone:0.38,gold:0.025}), color:"#68747a", edge:"#303a40" })
});
const ROAD_ORDER=Object.freeze({dirt:0,gravel:1,paved:2});
const ROAD_CONDITION_FLOOR=10;
const ROAD_CONDITION_SOUND=95;
const ROAD_WEAR_TILE_LIMIT=5000;
const ROAD_YEAR_LIMIT=1_000_000;
let cachedRevision=-1;
let cachedTiles=[];

function roundCondition(value){
    return Math.round(Math.max(ROAD_CONDITION_FLOOR,Math.min(100,Number(value)||0))*10)/10;
}
function conditionPercent(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.max(ROAD_CONDITION_FLOOR,Math.min(100,n)):100;
}
function conditionFactor(value){
    // A road never becomes impassable, but a rutted dirt path loses almost half
    // its speed advantage. New roads keep exactly their old multiplier.
    return 0.55+0.45*conditionPercent(value)/100;
}
function normalizeYear(value){
    const n=Math.floor(Number(value));
    return Number.isFinite(n)?Math.max(0,Math.min(ROAD_YEAR_LIMIT,n)):0;
}
function normalizeSurvey(source){
    if(!source||typeof source!=="object"||Array.isArray(source))return null;
    const year=normalizeYear(source.year);
    if(!year)return null;
    return {
        year,
        tiles:Math.max(0,Math.floor(Number(source.tiles)||0)),
        changed:Math.max(0,Math.floor(Number(source.changed)||0)),
        worn:Math.max(0,Math.floor(Number(source.worn)||0)),
        average:source.average==null?null:roundCondition(source.average),
        loss:Math.round(Math.max(0,Number(source.loss)||0)*10)/10,
        carriers:Math.max(0,Math.floor(Number(source.carriers)||0)),
        climate:String(source.climate||"temperate").slice(0,20)
    };
}
function normalizeRepair(source){
    if(!source||typeof source!=="object"||Array.isArray(source))return null;
    const year=normalizeYear(source.year);
    if(!year)return null;
    const cost=source.cost&&typeof source.cost==="object"?source.cost:{};
    return {
        year,
        tiles:Math.max(0,Math.floor(Number(source.tiles)||0)),
        cost:{
            wood:Math.max(0,Math.round((Number(cost.wood)||0)*1000)/1000),
            stone:Math.max(0,Math.round((Number(cost.stone)||0)*1000)/1000),
            gold:Math.max(0,Math.round((Number(cost.gold)||0)*1000)/1000)
        }
    };
}

function ensureRoadState(){
    if(!state.roads||typeof state.roads!=="object"||!state.roads.tiles){
        state.roads={version:1,revision:0,tiles:{},lastWearYear:0,lastWear:null,lastRepairYear:0,lastRepair:null};
    }
    const roads=state.roads;
    roads.lastWearYear=normalizeYear(roads.lastWearYear);
    roads.lastRepairYear=normalizeYear(roads.lastRepairYear);
    return roads;
}
function keyFor(x,y){return x+":"+y;}
function tileFromKey(key){
    const match=/^(\d+):(\d+)$/.exec(key);
    if(!match)return null;
    const x=Number(match[1]),y=Number(match[2]);
    return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<worldWidth()&&y<worldHeight()?{x,y}:null;
}
function isBuildingFootprint(x,y){
    const cx=x+0.5,cy=y+0.5;
    return state.entities.some(entity=>{
        if(entity.dead||!entity.isBuilding?.())return false;
        const base=BUILDING_SIZE[entity.type]||{w:1,h:1};
        const scale=Math.max(0.25,Math.min(6,Number(entity.footprintScale)||1));
        const halfW=base.w*scale/2,halfH=base.h*scale/2;
        const centerX=entity.x+0.5,centerY=entity.y+0.5;
        return cx>=centerX-halfW&&cx<centerX+halfW&&cy>=centerY-halfH&&cy<centerY+halfH;
    });
}
function costDelta(target,existing){
    const result={wood:0,stone:0,gold:0};
    for(const resource of Object.keys(result)){
        result[resource]=Math.round(((target.cost[resource]||0)-(existing?.cost?.[resource]||0))*1000)/1000;
    }
    return result;
}
function canAfford(delta){
    return Object.entries(delta).every(([resource,amount])=>amount<=0||(Number(state.resources?.[resource])||0)+1e-9>=amount);
}
function applyCost(delta){
    for(const [resource,amount] of Object.entries(delta)){
        if(amount===0)continue;
        // addResource owns clamping and the per-tick ledger. Road costs and
        // refunds must not bypass it with direct state.resources writes.
        addResource(resource,-amount);
    }
}
function bumpRevision(){
    const roads=ensureRoadState();
    roads.revision=(roads.revision||0)+1;
    cachedRevision=-1;
}

export function getRoadAt(x,y){
    const tx=Math.floor(Number(x)),ty=Math.floor(Number(y));
    if(!Number.isInteger(tx)||!Number.isInteger(ty)||tx<0||ty<0||tx>=worldWidth()||ty>=worldHeight())return null;
    const tile=ensureRoadState().tiles[keyFor(tx,ty)];
    return tile&&ROAD_TYPES[tile.type]?tile:null;
}

export function getRoadSpeedMultiplier(x,y){
    const road=getRoadAt(x,y);
    return road?ROAD_TYPES[road.type].speed*conditionFactor(road.condition):1;
}

export function getRoadTravelCost(x,y){
    const road=getRoadAt(x,y);
    return road?ROAD_TYPES[road.type].travelCost/conditionFactor(road.condition):1.25;
}

export function getRoadCount(){
    return Object.keys(ensureRoadState().tiles).length;
}

export function getRoadUpkeepTotal(){
    // Wear is a real maintenance liability: a rutted road needs emergency
    // patching before the next season. New roads keep the old exact upkeep.
    return getRoadTiles().reduce((total,tile)=>{
        const style=ROAD_TYPES[tile.type];
        if(!style)return total;
        const wear=1-conditionPercent(tile.condition)/100;
        return total+style.upkeep*(1+wear*1.5);
    },0);
}

export function getRoadRepairCost(){
    const cost={wood:0,stone:0,gold:0};
    for(const tile of getRoadTiles().slice(0,ROAD_WEAR_TILE_LIMIT)){
        const condition=conditionPercent(tile.condition);
        if(condition>=ROAD_CONDITION_SOUND)continue;
        const missing=(100-condition)/100;
        const repair=ROAD_TYPES[tile.type]?.repair;
        if(!repair)continue;
        for(const resource of Object.keys(cost))cost[resource]+=(repair[resource]||0)*missing;
    }
    for(const resource of Object.keys(cost))cost[resource]=Math.round(cost[resource]*1000)/1000;
    return cost;
}

export function getRoadConditionSnapshot(){
    const roads=ensureRoadState();
    const tiles=getRoadTiles();
    const byType={};
    let sum=0,worn=0,worst=100;
    for(const tile of tiles.slice(0,ROAD_WEAR_TILE_LIMIT)){
        const condition=conditionPercent(tile.condition);
        sum+=condition;
        worst=Math.min(worst,condition);
        if(condition<ROAD_CONDITION_SOUND)worn++;
        const entry=byType[tile.type]||(byType[tile.type]={tiles:0,sum:0,worn:0,average:100});
        entry.tiles++;
        entry.sum+=condition;
        if(condition<ROAD_CONDITION_SOUND)entry.worn++;
    }
    for(const entry of Object.values(byType))entry.average=roundCondition(entry.sum/Math.max(1,entry.tiles));
    const repairCost=getRoadRepairCost();
    return {
        tiles:tiles.length,
        average:tiles.length?roundCondition(sum/tiles.length):null,
        worst:tiles.length?roundCondition(worst):null,
        worn,
        sound:Math.max(0,tiles.length-worn),
        byType,
        repairCost,
        repairAffordable:canAfford(repairCost),
        lastWear:normalizeSurvey(roads.lastWear),
        lastRepair:normalizeRepair(roads.lastRepair)
    };
}

// One bounded annual survey. It reads the existing carrier count and climate,
// never scans entities or jobs, and caps the walked tiles at the save limit.
export function updateRoadWear(){
    const roads=ensureRoadState();
    const year=Math.max(1,Math.min(ROAD_YEAR_LIMIT,Math.floor(Number(state.year)||1)));
    if(Number(roads.lastWearYear)>=year)return roads.lastWear;
    const tiles=getRoadTiles().slice(0,ROAD_WEAR_TILE_LIMIT);
    const carriers=Math.max(0,Math.min(64,Array.isArray(state.city?.logistics?.carriers)?state.city.logistics.carriers.length:0));
    const climate=String(state.worldOptions?.climate||"temperate");
    const climateFactor=climate==="snowlands"?1.3:climate==="tropical"?1.15:climate==="coastlands"?1.1:1;
    const haulFactor=1+Math.min(0.9,carriers*0.08);
    if(!tiles.length){
        roads.lastWearYear=year;
        roads.lastWear={year,tiles:0,changed:0,worn:0,average:null,loss:0,carriers,climate};
        return roads.lastWear;
    }
    let sum=0,changed=0,worn=0,loss=0;
    for(const tile of tiles){
        const style=ROAD_TYPES[tile.type];
        if(!style)continue;
        const before=conditionPercent(tile.condition);
        const next=roundCondition(before-style.wear*haulFactor*climateFactor);
        if(next<before){
            roads.tiles[tile.x+":"+tile.y].condition=next;
            changed++;
            loss+=before-next;
        }
        sum+=next;
        if(next<ROAD_CONDITION_SOUND)worn++;
    }
    roads.lastWearYear=year;
    roads.lastWear={year,tiles:tiles.length,changed,worn,average:roundCondition(sum/tiles.length),loss:Math.round(loss*10)/10,carriers,climate};
    if(changed)bumpRevision();
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("kac:road-survey",{detail:{...roads.lastWear}}));
    return roads.lastWear;
}

export function repairWornRoads(){
    const roads=ensureRoadState();
    const repairs=[];
    const cost={wood:0,stone:0,gold:0};
    for(const tile of getRoadTiles().slice(0,ROAD_WEAR_TILE_LIMIT)){
        const condition=conditionPercent(tile.condition);
        if(condition>=ROAD_CONDITION_SOUND)continue;
        const missing=(100-condition)/100;
        const repair=ROAD_TYPES[tile.type]?.repair;
        if(!repair)continue;
        for(const resource of Object.keys(cost))cost[resource]+=(repair[resource]||0)*missing;
        repairs.push(tile);
    }
    for(const resource of Object.keys(cost))cost[resource]=Math.round(cost[resource]*1000)/1000;
    if(!repairs.length)return {ok:false,reason:"All roads are sound",cost};
    if(!canAfford(cost))return {ok:false,reason:"Not enough materials to repair the roads",cost};
    applyCost(cost);
    for(const tile of repairs)roads.tiles[tile.x+":"+tile.y].condition=100;
    const year=Math.max(1,Math.min(ROAD_YEAR_LIMIT,Math.floor(Number(state.year)||1)));
    roads.lastRepairYear=year;
    roads.lastRepair={year,tiles:repairs.length,cost:{...cost}};
    bumpRevision();
    return {ok:true,repaired:repairs.length,cost};
}

export function getRoadTiles(){
    const roads=ensureRoadState();
    if(cachedRevision!==roads.revision){
        cachedTiles=Object.entries(roads.tiles).map(([key,tile])=>{
            const point=tileFromKey(key);
            return point?{...point,...tile}:null;
        }).filter(Boolean).sort((a,b)=>a.y-b.y||a.x-b.x);
        cachedRevision=roads.revision;
    }
    return cachedTiles;
}

export function getRoadBuildCost(type,x=null,y=null){
    const target=ROAD_TYPES[type];
    if(!target)return null;
    const existing=Number.isInteger(x)&&Number.isInteger(y)?getRoadAt(x,y):null;
    return costDelta(target,existing?ROAD_TYPES[existing.type]:null);
}

export function placeRoad(x,y,type="dirt"){
    const tx=Math.floor(Number(x)),ty=Math.floor(Number(y)),target=ROAD_TYPES[type];
    if(!target)return {ok:false,reason:"Unknown road type"};
    if(!Number.isInteger(tx)||!Number.isInteger(ty)||tx<0||ty<0||tx>=worldWidth()||ty>=worldHeight())return {ok:false,reason:"Outside the realm"};
    if(!state.explored?.[tx]?.[ty])return {ok:false,reason:"Explore this land first"};
    if(isWaterAt(tx+0.5,ty+0.5))return {ok:false,reason:"Roads cannot cross deep water"};
    if(isBuildingFootprint(tx,ty))return {ok:false,reason:"A building occupies this tile"};
    const roads=ensureRoadState(),key=keyFor(tx,ty),existing=roads.tiles[key];
    if(existing?.type===type)return {ok:false,reason:"Road already exists here"};
    if(existing&&ROAD_ORDER[type]<=ROAD_ORDER[existing.type])return {ok:false,reason:"Choose a higher road tier to upgrade"};
    const delta=costDelta(target,existing?ROAD_TYPES[existing.type]:null);
    if(!canAfford(delta))return {ok:false,reason:"Not enough materials for this road"};
    applyCost(delta);
    roads.tiles[key]={type,builtAtTick:state.tick||0,condition:100};
    bumpRevision();
    state.statistics.totalRoadTilesBuilt=(state.statistics.totalRoadTilesBuilt||0)+1;
    return {ok:true,upgraded:Boolean(existing),x:tx,y:ty,type};
}

export function removeRoad(x,y){
    const tx=Math.floor(Number(x)),ty=Math.floor(Number(y));
    if(tx<0||ty<0||tx>=worldWidth()||ty>=worldHeight())return {ok:false,reason:"Outside the realm"};
    const roads=ensureRoadState(),key=keyFor(tx,ty),existing=roads.tiles[key];
    if(!existing)return {ok:false,reason:"No road on this tile"};
    const cost=ROAD_TYPES[existing.type].cost;
    for(const [resource,amount] of Object.entries(cost)){
        const refund=amount*0.25;
        if(refund>0)addResource(resource,refund);
    }
    delete roads.tiles[key];
    bumpRevision();
    return {ok:true,x:tx,y:ty,refund:cost};
}

// Volcanic destruction removes the road without a salvage refund. The normal
// player-facing removeRoad() keeps its 25% material refund.
export function destroyRoad(x,y){
    const tx=Math.floor(Number(x)),ty=Math.floor(Number(y));
    if(tx<0||ty<0||tx>=worldWidth()||ty>=worldHeight())return {ok:false,reason:"Outside the realm"};
    const roads=ensureRoadState(),key=keyFor(tx,ty),existing=roads.tiles[key];
    if(!existing)return {ok:false,reason:"No road on this tile"};
    delete roads.tiles[key];
    bumpRevision();
    return {ok:true,x:tx,y:ty,type:existing.type};
}

export function setRoadBuildMode(type){
    if(type!=="remove"&&!ROAD_TYPES[type])return false;
    state.roadBuildMode=type;
    return true;
}
export function clearRoadBuildMode(){state.roadBuildMode=null;}
export function getRoadBuildMode(){return state.roadBuildMode==="remove"||ROAD_TYPES[state.roadBuildMode]?state.roadBuildMode:null;}

export function serializeRoads(){
    const roads=ensureRoadState();
    const tiles={};
    for(const [key,tile] of Object.entries(roads.tiles)){
        if(tileFromKey(key)&&ROAD_TYPES[tile.type]){
            tiles[key]={type:tile.type,builtAtTick:Math.max(0,Math.floor(Number(tile.builtAtTick)||0)),condition:conditionPercent(tile.condition)};
        }
    }
    return {
        version:1,
        revision:Math.max(0,Math.floor(Number(roads.revision)||0)),
        lastWearYear:normalizeYear(roads.lastWearYear),
        lastWear:normalizeSurvey(roads.lastWear),
        lastRepairYear:normalizeYear(roads.lastRepairYear),
        lastRepair:normalizeRepair(roads.lastRepair),
        tiles
    };
}

export function restoreRoads(snapshot){
    const next={version:1,revision:0,tiles:{},lastWearYear:0,lastWear:null,lastRepairYear:0,lastRepair:null};
    if(snapshot&&typeof snapshot==="object"&&snapshot.version===1&&snapshot.tiles&&typeof snapshot.tiles==="object"){
        for(const [key,tile] of Object.entries(snapshot.tiles).slice(0,5000)){
            if(!tileFromKey(key)||!tile||!ROAD_TYPES[tile.type])continue;
            next.tiles[key]={type:tile.type,builtAtTick:Math.max(0,Math.floor(Number(tile.builtAtTick)||0)),condition:conditionPercent(tile.condition)};
        }
        next.revision=Math.max(0,Math.floor(Number(snapshot.revision)||0));
        next.lastWearYear=normalizeYear(snapshot.lastWearYear);
        next.lastWear=normalizeSurvey(snapshot.lastWear);
        next.lastRepairYear=normalizeYear(snapshot.lastRepairYear);
        next.lastRepair=normalizeRepair(snapshot.lastRepair);
    }
    state.roads=next;
    state.roadBuildMode=null;
    cachedRevision=-1;
    return getRoadCount();
}
