// Hand-based card economy and validated map placement.
import { TYPE } from "../core/types.js";
import { TILE_SIZE,WORLD_WIDTH,WORLD_HEIGHT,BUILDING_SIZE } from "../core/config.js";
import { state } from "../core/state.js";
import { spawnEntity,buildingOverlaps,canSpawnEntity } from "../world/entities.js";
import { revealArea,isWaterAt } from "../world/world.js";
import { canAfford,payForCard,addResource } from "./resources.js";
import { beginConstruction,siteSuitability } from "./construction.js";
import { CARD_PROTOTYPES,CARD_CATEGORIES,CARD_VARIANT_DIMENSIONS,createCardForCategory,createCardVariant } from "./card-catalog.js";
import { addLog } from "./events.js";
import { canAccommodateVillagers,getHousingSnapshot,RESIDENTS_PER_HOUSE,normalizeHouseholdAssignments } from "./population.js";
import { queueParticle,queueFloater } from "../core/presentation-effects.js";
import { recordResourceMovement } from "./goods-book.js";
import { rand as seededRand,randInt as seededRandInt } from "../core/random.js";
import { awakenDragon } from "./creatures.js";
import { activateEdict } from "./edicts.js";
const rand=(min,max)=>seededRand(min,max,"cards");
const randInt=(min,max)=>seededRandInt(min,max,"cards");
export const CARD_DECK=Object.freeze(CARD_CATEGORIES.map(category=>{
    const card=createCardForCategory(category.id);
    return {...card,id:category.id,name:card.baseName||card.name};
}));
const HAND_LIMIT=5;
let nextCardInstance=1;
function cardPace(){const value=Number(state.cardPace);return Number.isFinite(value)&&value>0?Math.max(0.4,Math.min(2.5,value)):1;}
function pacedTicks(base){return Math.max(4,Math.round(base*cardPace()));}
function makeHandCard(card){return {...card,instanceId:"card-"+(nextCardInstance++)};}
export function drawNewCard(){
    if(state.hand.length>=HAND_LIMIT)return null;
    state.cardRewardQueue=Array.isArray(state.cardRewardQueue)?state.cardRewardQueue:[];
    let prototype=state.cardRewardQueue.length?state.cardRewardQueue.shift():null;
    if(!prototype){
        if(!state.availableCards.length)state.availableCards=[...CARD_DECK];
        const index=randInt(0,state.availableCards.length);
        [prototype]=state.availableCards.splice(index,1);
    }
    const scales=["standard","standard","small","large","grand"];
    const rarityPool=(state.hiddenRealm?.prosperity||0)>18
        ?["common","common","uncommon","fine","rare","epic"]
        :["common","common","common","uncommon","fine","rare"];
    const scale=scales[randInt(0,scales.length)],rarity=rarityPool[randInt(0,rarityPool.length)];
    const context=CARD_VARIANT_DIMENSIONS.contexts[randInt(0,CARD_VARIANT_DIMENSIONS.contexts.length)];
    const card=createCardVariant(prototype,{scale,rarity,context});
    const handCard=makeHandCard(card);state.hand.push(handCard);
    if(!state.currentCard||!state.hand.some(item=>item.instanceId===state.selectedCardInstanceId))selectCard(handCard.instanceId);
    return handCard;
}
export function drawStartingHand(){
    state.hand=[];state.availableCards=[...CARD_DECK];state.cardRewardQueue=[];state.currentCard=null;state.selectedCardInstanceId=null;
    state.nextCardDrawTick=state.tick+pacedTicks(28+randInt(0,44));
}
export function updateCardDraw(){
    if(state.hand.length>=HAND_LIMIT){state.nextCardDrawTick=0;return false;}
    if(!Number.isFinite(state.nextCardDrawTick)||state.nextCardDrawTick<=0)state.nextCardDrawTick=state.tick+pacedTicks(22+randInt(0,38));
    if(state.tick<state.nextCardDrawTick)return false;
    const card=drawNewCard();
    state.nextCardDrawTick=state.hand.length<HAND_LIMIT?state.tick+pacedTicks(22+randInt(0,68)):0;
    return Boolean(card);
}
export function selectCard(instanceId){
    const card=state.hand.find(item=>item.instanceId===instanceId);if(!card)return false;
    state.selectedCardInstanceId=instanceId;state.currentCard=card;return true;
}
function consumeCurrentCard(){
    const index=state.hand.findIndex(item=>item.instanceId===state.selectedCardInstanceId);
    if(index>=0)state.hand.splice(index,1);
    state.currentCard=null;state.selectedCardInstanceId=null;
    if(state.hand.length)selectCard(state.hand[0].instanceId);
    state.nextCardDrawTick=state.hand.length<HAND_LIMIT?state.tick+pacedTicks(18+randInt(0,54)):0;
}
export function skipCard(){
    if(!state.currentCard)return false;
    const discarded=state.currentCard.name;
    addLog("CARD DISCARDED — "+discarded,"#d8a1a1","card");
    consumeCurrentCard();queueFloater(280,180,"CARD DISCARDED","#a5b4fc");return true;
}
function footprintFor(card){
    if(card.kind==="effect")return {w:0.35,h:0.35};
    const base=card.unit?{w:0.55,h:0.55}:(BUILDING_SIZE[card.type]||{w:1,h:1});
    const scale=Number.isFinite(card.sizeMultiplier)?Math.max(0.25,Math.min(6,card.sizeMultiplier)):1;
    return {w:base.w*scale,h:base.h*scale};
}
function hasBuildableTerrain(tx,ty,card){
    const size=footprintFor(card);
    const left=tx+0.5-size.w/2,right=tx+0.5+size.w/2,top=ty+0.5-size.h/2,bottom=ty+0.5+size.h/2;
    if(left<0||top<0||right>(Number(state.worldW)||WORLD_WIDTH)||bottom>(Number(state.worldH)||WORLD_HEIGHT))return false;
    for(let x=Math.floor(left);x<right;x++)for(let y=Math.floor(top);y<bottom;y++){
        const sx=(Math.max(left,x)+Math.min(right,x+1))/2,sy=(Math.max(top,y)+Math.min(bottom,y+1))/2;
        if(isWaterAt(sx,sy))return false;
    }
    return true;
}
export function getCardPlacementPreview(tx,ty){
    const card=state.currentCard;if(!card||!Number.isInteger(tx)||!Number.isInteger(ty))return null;
    const size=footprintFor(card),terrainValid=hasBuildableTerrain(tx,ty,card);
    const occupied=card.kind==="effect"?false:buildingOverlaps(tx,ty,card.type,card.sizeMultiplier||1),affordable=canAfford(card);
    let reason=null;if(!terrainValid)reason="INVALID TERRAIN";else if(occupied)reason="SPACE OCCUPIED";else if(!affordable)reason="CANNOT AFFORD";
    if(!reason&&card.kind==="building"){
        const suitability=siteSuitability(card.type,tx,ty);
        if(!suitability.ok)reason=suitability.reason;
    }
    return {tx,ty,type:card.type,width:size.w,height:size.h,valid:reason===null,reason,kind:card.kind};
}
function findNearestBuildableTile(cx,cy){
    if(!state.currentCard)return null;
    for(let radius=0;radius<=12;radius++)for(let ox=-radius;ox<=radius;ox++)for(let oy=-radius;oy<=radius;oy++){
        if(Math.abs(ox)!==radius&&Math.abs(oy)!==radius)continue;
        const tx=cx+ox,ty=cy+oy;
        if(!hasBuildableTerrain(tx,ty,state.currentCard)||(state.currentCard.kind!=="effect"&&buildingOverlaps(tx,ty,state.currentCard.type)))continue;
        if(state.currentCard.kind==="building"&&!siteSuitability(state.currentCard.type,tx,ty).ok)continue;
        return {tx,ty};
    }
    return null;
}
function realmPopulation(){
    const tracked=Number(state.economy?.population);
    if(Number.isFinite(tracked)&&tracked>0)return Math.floor(tracked);
    return state.entities.filter(entity=>entity&&!entity.dead&&entity.type===TYPE.VILLAGER).length;
}
function healthState(){return state.health||(state.health={containment:0,cases:0});}
function resolveEffectCard(card){
    if(card.effect==="harvest"){recordResourceMovement("food",35,"card-harvest",{to:{kind:"realm",id:"royal-stores"},key:"food:card:"+card.uid});addResource("food",35);return " +35 FOOD";}
    if(card.effect==="gold-rush"){addResource("gold",24);return " +24 GOLD";}
    if(card.effect==="festival"){state.morale=Math.min(100,state.morale+14);return " +14 MORALE";}
    if(card.effect==="supply-cache"){addResource("wood",8);recordResourceMovement("food",6,"card-supply-cache",{to:{kind:"realm",id:"royal-stores"},key:"food:card:"+card.uid});addResource("food",6);return " SUPPLIES FOUND";}
    if(card.effect==="granary-cache"){recordResourceMovement("food",45,"card-granary",{to:{kind:"realm",id:"royal-stores"},key:"food:card:"+card.uid});addResource("food",45);return " +45 FOOD";}
    if(card.effect==="apiary"){recordResourceMovement("food",18,"card-apiary",{to:{kind:"realm",id:"royal-stores"},key:"food:card:"+card.uid});addResource("food",18);state.morale=Math.min(100,state.morale+3);return " +18 FOOD · +3 MORALE";}
    if(card.effect==="vintage"){addResource("gold",14);state.morale=Math.min(100,state.morale+8);return " +14 GOLD · +8 MORALE";}
    if(card.effect==="clean-water"){state.morale=Math.min(100,state.morale+7);healthState().containment=Math.min(100,(healthState().containment||0)+10);return " +7 MORALE · CLEAN WATER";}
    if(card.effect==="healers"){healthState().containment=Math.min(100,(healthState().containment||0)+15);state.morale=Math.min(100,state.morale+4);return " HEALERS TEND THE SICK";}
    if(card.effect==="quarantine"){const health=healthState();health.containment=Math.min(100,(health.containment||0)+25);if((health.cases||0)>0)health.cases=Math.max(0,Math.round(health.cases*0.7));return " QUARANTINE ENFORCED";}
    if(card.effect==="grand-festival"){state.morale=Math.min(100,state.morale+20);return " +20 MORALE";}
    if(card.effect==="tax-levy"){const gold=10+Math.round(realmPopulation()*1.5);addResource("gold",gold);return " +"+gold+" GOLD";}
    if(card.effect==="pilgrimage"){addResource("gold",18);state.morale=Math.min(100,state.morale+6);return " PILGRIMS ARRIVE";}
    if(card.effect==="road-works"){addResource("gold",12);addResource("stone",6);return " ROADS IMPROVED";}
    if(card.effect==="dragon-tribute"){addResource("gold",40);state.morale=Math.max(0,state.morale-4);return " +40 GOLD · -4 MORALE";}
    if(card.effect==="omen"){addResource("gold",16);state.hiddenRealm.mystery=(state.hiddenRealm.mystery||0)+2;return " AN OMEN IS READ";}
    if(card.effect==="archive"){addResource("gold",10);state.hiddenRealm.mystery=(state.hiddenRealm.mystery||0)+1;return " THE ARCHIVE GROWS";}
    if(card.effect==="edict"&&card.edict){const result=activateEdict(card.edict);return result.ok?" EDICT: "+result.name:" EDICT FAILED";}
    return "";
}
export function placeCurrentCard(targetX,targetY){
    const card=state.currentCard;if(!card||state.gameOver||state.isPaused)return false;
    const canvas=state.canvas,camera=state.camera;
    const fallbackX=canvas?Math.floor((camera.x+canvas.width/2)/(TILE_SIZE*state.zoom)):(Number(state.worldW)||WORLD_WIDTH)/2;
    const fallbackY=canvas?Math.floor((camera.y+canvas.height/2)/(TILE_SIZE*state.zoom)):(Number(state.worldH)||WORLD_HEIGHT)/2;
    const requested=Number.isInteger(targetX)&&Number.isInteger(targetY)?{tx:targetX,ty:targetY}:findNearestBuildableTile(fallbackX,fallbackY);
    if(!requested){queueFloater(fallbackX*TILE_SIZE,fallbackY*TILE_SIZE,"NO SPACE NEARBY","#f59e0b");return false;}
    const {tx,ty}=requested,preview=getCardPlacementPreview(tx,ty);
    if(!preview?.valid){
        const message=preview?.reason||"CANNOT BUILD HERE";
        queueFloater(tx*TILE_SIZE+TILE_SIZE/2,ty*TILE_SIZE,message,message==="CANNOT AFFORD"?"#f43f5e":"#f59e0b");
        return false;
    }
    if(card.kind!=="effect"&&!canSpawnEntity(card.type)){
        queueFloater(tx*TILE_SIZE,ty*TILE_SIZE,"REALM CAPACITY REACHED","#f59e0b");
        return false;
    }
    if(card.kind==="person"&&card.type===TYPE.VILLAGER&&!canAccommodateVillagers(1)){
        queueFloater(tx*TILE_SIZE,ty*TILE_SIZE,"NO HOUSING AVAILABLE","#f59e0b");
        return false;
    }
    const isBuilding=card.kind==="building";
    if(!isBuilding&&!payForCard(card))return false;
    if(card.kind==="effect"){
        const result=resolveEffectCard(card);
        queueFloater(tx*TILE_SIZE,ty*TILE_SIZE,"CARD PLAYED"+result,"#e4bd72");
        addLog("PLAYED "+card.name,"#e4bd72","card");
    }else{
        const entity=spawnEntity(tx,ty,card.type);
        if(!entity){queueFloater(tx*TILE_SIZE,ty*TILE_SIZE,"REALM CAPACITY REACHED","#f59e0b");return false;}
        entity.footprintScale=Number.isFinite(card.sizeMultiplier)?Math.max(0.25,Math.min(6,card.sizeMultiplier)):1;
        if(card.type===TYPE.DRAGON)awakenDragon(entity);
        if(card.kind==="unit"||card.kind==="person"||card.kind==="animal"){
            entity.anchor={x:tx,y:ty};entity.home={x:tx,y:ty};entity.jobRefreshTimer=0;
            if(card.kind!=="animal")state.statistics.totalUnitsRecruited++;
        }else{
            const started=beginConstruction(entity,card.cost,{source:"card"});
            if(!started.ok){
                entity.dead=true;
                state.buildingCollisionVersion=(state.buildingCollisionVersion||0)+1;
                queueFloater(tx*TILE_SIZE,ty*TILE_SIZE,started.reason.toUpperCase(),"#f59e0b");
                return false;
            }
            revealArea(tx,ty,9);
        }
        if(card.kind==="person"&&card.type===TYPE.VILLAGER)normalizeHouseholdAssignments();
        for(let i=0;i<10;i++)queueParticle(tx*TILE_SIZE+rand(0,TILE_SIZE),ty*TILE_SIZE+rand(0,TILE_SIZE),"#fde047",24,rand(-2,2),rand(-3,-0.5),4);
        queueFloater(tx*TILE_SIZE+TILE_SIZE/2,ty*TILE_SIZE+10,card.kind==="animal"?"RELEASED!":card.unit?"RECRUITED!":"SITE OPENED!","#a3e635");
        addLog((card.unit||card.kind==="animal"?"RECRUITED ":"CONSTRUCTION BEGUN — ")+card.name,"#a3d6a7","card");
    }
    consumeCurrentCard();return true;
}
export function restoreHand(savedHand,selectedId,savedAvailableCards,nextDrawTick,savedRewards=[]){
    state.hand=Array.isArray(savedHand)?savedHand.map(card=>({...card,instanceId:card.instanceId||"card-"+(nextCardInstance++)})): [];
    const numericIds=state.hand.map(card=>Number(String(card.instanceId).replace("card-",""))||0);
    if(numericIds.length)nextCardInstance=Math.max(nextCardInstance,Math.max(...numericIds)+1);
    state.selectedCardInstanceId=null;state.currentCard=null;
    const selected=state.hand.find(card=>card.instanceId===selectedId)||state.hand[0];
    if(selected)selectCard(selected.instanceId);
    state.availableCards=Array.isArray(savedAvailableCards)
        ? savedAvailableCards.map(card=>({...card,cost:{...(card.cost||{})}}))
        : [...CARD_DECK];
    state.cardRewardQueue=Array.isArray(savedRewards)?savedRewards.slice(0,12).map(card=>({...card,cost:{...(card.cost||{})}})):[];
    state.nextCardDrawTick=Number.isFinite(nextDrawTick)?nextDrawTick:(state.hand.length<HAND_LIMIT?state.tick+24+randInt(0,48):0);
}
