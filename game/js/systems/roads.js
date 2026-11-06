// Road network: compact tile data, deterministic route costs and versioned saves.
import { state } from "../core/state.js";
import { BUILDING_SIZE } from "../core/config.js";
import { isWaterAt, worldWidth, worldHeight } from "../world/world.js";
import { addResource } from "./resources.js";

export const ROAD_TYPES = Object.freeze({
    dirt: Object.freeze({ id:"dirt", label:"Dirt path", speed:1.08, travelCost:1.0, upkeep:0.0004, cost:Object.freeze({wood:0.15,stone:0,gold:0}), color:"#a97849", edge:"#4e3526" }),
    gravel: Object.freeze({ id:"gravel", label:"Gravel road", speed:1.18, travelCost:0.9, upkeep:0.0008, cost:Object.freeze({wood:0.1,stone:0.22,gold:0}), color:"#9a9b8c", edge:"#4e504b" }),
    paved: Object.freeze({ id:"paved", label:"Paved road", speed:1.35, travelCost:0.78, upkeep:0.0015, cost:Object.freeze({wood:0.1,stone:0.38,gold:0.025}), color:"#68747a", edge:"#303a40" })
});
const ROAD_ORDER=Object.freeze({dirt:0,gravel:1,paved:2});
let cachedRevision=-1;
let cachedTiles=[];

function ensureRoadState(){
    if(!state.roads||typeof state.roads!=="object"||!state.roads.tiles){
        state.roads={version:1,revision:0,tiles:{}};
    }
    return state.roads;
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
    return road?ROAD_TYPES[road.type].speed:1;
}

export function getRoadTravelCost(x,y){
    const road=getRoadAt(x,y);
    return road?ROAD_TYPES[road.type].travelCost:1.25;
}

export function getRoadCount(){
    return Object.keys(ensureRoadState().tiles).length;
}

export function getRoadUpkeepTotal(){
    return getRoadTiles().reduce((total,tile)=>total+(ROAD_TYPES[tile.type]?.upkeep||0),0);
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
            tiles[key]={type:tile.type,builtAtTick:Math.max(0,Math.floor(Number(tile.builtAtTick)||0)),condition:Math.max(0,Math.min(100,Number(tile.condition)||100))};
        }
    }
    return {version:1,revision:Math.max(0,Math.floor(Number(roads.revision)||0)),tiles};
}

export function restoreRoads(snapshot){
    const next={version:1,revision:0,tiles:{}};
    if(snapshot&&typeof snapshot==="object"&&snapshot.version===1&&snapshot.tiles&&typeof snapshot.tiles==="object"){
        for(const [key,tile] of Object.entries(snapshot.tiles).slice(0,5000)){
            if(!tileFromKey(key)||!tile||!ROAD_TYPES[tile.type])continue;
            next.tiles[key]={type:tile.type,builtAtTick:Math.max(0,Math.floor(Number(tile.builtAtTick)||0)),condition:Math.max(0,Math.min(100,Number(tile.condition)||100))};
        }
        next.revision=Math.max(0,Math.floor(Number(snapshot.revision)||0));
    }
    state.roads=next;
    state.roadBuildMode=null;
    cachedRevision=-1;
    return getRoadCount();
}
