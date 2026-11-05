import {state} from "../core/state.js";
import {TYPE} from "../core/types.js";
import {spawnEntity,canSpawnEntity} from "../world/entities.js";
import {randInt} from "../core/random.js";
import {addLog} from "./events.js";
const NAMES=["Emberwing","Ashscale","Cinder","Stormmaw","Goldvein","Nightflame","Thornfire","Dawnscale"];
const MAX_MEMORIES=16,MAX_ARCHIVE=100;
function remember(dragon,text,year=state.year){const c=dragon.creature;if(!c)return false;if(!Array.isArray(c.memories))c.memories=[];const id=String(year)+":"+text.slice(0,48);if(c.memories.some(m=>m.id===id))return false;c.memories.unshift({id,year:Math.max(1,Number(year)||1),text:String(text).slice(0,180)});c.memories=c.memories.slice(0,MAX_MEMORIES);return true;}
function stage(age){return age<5?"hatchling":age<20?"juvenile":age<90?"adult":age<240?"elder":"ancient";}
export function awakenDragon(dragon){
 if(!dragon)return null;
 dragon.isDragon=true;dragon.isRoyalCreature=true;dragon.creatureId="dragon-"+String(state.worldSeed||1)+"-"+String(dragon.id);
 dragon.home={...(dragon.home||{x:dragon.x,y:dragon.y})};dragon.anchor={...dragon.home};
 const name=NAMES[randInt(0,NAMES.length,"creatures")];
 dragon.creature={id:dragon.creatureId,name,species:"dragon",ageYears:0,lifeStage:"hatchling",health:100,hunger:20,bond:18,temperament:"curious",lastUpdateYear:Math.max(1,Number(state.year)||1),memories:[]};
 remember(dragon,"I hatched into the realm under the care of its sovereign.",state.year);
 return dragon;
}
export function summonDragon(){
 const king=state.entities.find(e=>!e.dead&&e.isKing);if(!king)return {ok:false,reason:"sovereign-required"};
 const living=state.entities.filter(e=>!e.dead&&e.isDragon);if(living.length>=3)return {ok:false,reason:"dragon-limit"};
 if((Number(state.resources?.gold)||0)<55||(Number(state.resources?.food)||0)<35)return {ok:false,reason:"dragon-cost"};
 if(!canSpawnEntity(TYPE.DRAGON))return {ok:false,reason:"entity-capacity"};
 const dragon=spawnEntity(king.x+2+living.length,king.y+1,TYPE.DRAGON);if(!dragon)return {ok:false,reason:"entity-capacity"};
 awakenDragon(dragon);
 state.resources.gold-=55;state.resources.food-=35;
 addLog("A DRAGON HAS JOINED THE REALM: "+name,"#e8b65f","creature");
 return {ok:true,dragon};
}
export function updateCreatures(){
 const year=Math.max(1,Math.floor(Number(state.year)||1));let updated=0,deaths=0;
 for(const dragon of state.entities){
  if(dragon.dead||!dragon.isDragon||!dragon.creature)continue;
  const c=dragon.creature,last=Math.max(1,Math.floor(Number(c.lastUpdateYear)||year));
  if(year<=last)continue;
  const elapsed=Math.min(1000,year-last);c.ageYears=Math.min(1000,Math.max(0,Number(c.ageYears)||0)+elapsed);c.lifeStage=stage(c.ageYears);
  c.hunger=Math.min(100,Math.max(0,Number(c.hunger)||0)+elapsed*16);
  const king=state.entities.find(e=>!e.dead&&e.isKing);
  const nearKing=king&&Math.hypot(king.x-dragon.x,king.y-dragon.y)<=10;
  if((Number(state.resources?.food)||0)>=6&&c.hunger>=35){state.resources.food-=6;c.hunger=Math.max(0,c.hunger-42);c.health=Math.min(100,(Number(c.health)||0)+3);}
  else if(c.hunger>=65){c.health=Math.max(0,(Number(c.health)||0)-Math.min(45,elapsed*12));state.morale=Math.max(0,(Number(state.morale)||0)-Math.min(6,elapsed*1.5));}
  if(nearKing)c.bond=Math.min(100,(Number(c.bond)||0)+Math.min(8,elapsed*2));
  else c.bond=Math.max(0,(Number(c.bond)||0)-Math.min(4,elapsed));
  c.lastUpdateYear=year;updated++;
  if(c.ageYears===5)remember(dragon,"I outgrew my hatchling years and became a juvenile.",year);
  else if(c.ageYears===20)remember(dragon,"I reached adulthood and my wings grew strong.",year);
  else if(c.ageYears===90)remember(dragon,"The realm now calls me an elder dragon.",year);
  if(c.health<=0){
   dragon.dead=true;deaths++;
   const archive=state.creatureArchive||(state.creatureArchive=[]);
   archive.push({creatureId:dragon.creatureId,name:c.name,species:"dragon",ageYears:c.ageYears,lifeStage:c.lifeStage,deathYear:year,memories:(c.memories||[]).slice(-8)});
   state.creatureArchive=archive.slice(-MAX_ARCHIVE);
   addLog("THE DRAGON HAS FALLEN: "+c.name,"#b84a43","creature");
  }
 }
 return {updated,deaths};
}
export function getCreatureSnapshot(){return {living:state.entities.filter(e=>!e.dead&&e.isDragon&&e.creature).map(e=>({...e.creature,memories:(e.creature.memories||[]).slice()})),archive:(state.creatureArchive||[]).slice(-MAX_ARCHIVE)};}
