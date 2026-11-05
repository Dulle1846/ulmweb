// Persistent magical creature lifecycle. Creature identity and memories live on the entity and survive save/load.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { random,randInt } from "../core/random.js";
import { addLog } from "./events.js";

export const DRAGON_LIFESPAN=240;
export const CREATURE_MEMORY_LIMIT=24;
export const CREATURE_ARCHIVE_LIMIT=100;
const NAMES=["Ashwing","Emberclaw","Cinderheart","Moonscale","Stormcoil","Goldflare","Thornfire","Dawnmaw","Skyrend","Brightfang"];
const TEMPERAMENTS=["curious","proud","watchful","playful","fierce","gentle"];
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
function stageForAge(age){
    if(age<3)return "hatchling";
    if(age<12)return "juvenile";
    if(age<180)return "adult";
    return "elder";
}
export function recordCreatureMemory(entity,type,text){
    const creature=entity?.creature;
    if(!creature||!text)return false;
    creature.memories=Array.isArray(creature.memories)?creature.memories:[];
    const tick=Math.max(0,Math.floor(Number(state.tick)||0));
    const entry={id:"creature-memory:"+creature.id+":"+type+":"+tick,type:String(type).slice(0,32),text:String(text).slice(0,220),tick,year:Math.max(1,Math.floor(Number(state.year)||1))};
    if(creature.memories.some(memory=>memory.id===entry.id))return false;
    creature.memories.push(entry);
    if(creature.memories.length>CREATURE_MEMORY_LIMIT)creature.memories.splice(0,creature.memories.length-CREATURE_MEMORY_LIMIT);
    return true;
}
export function createCreatureProfile(entity,{name=null,temperament=null}={}){
    if(!entity||entity.type!==TYPE.DRAGON)return null;
    if(entity.creature&&typeof entity.creature==="object")return normalizeCreatureProfile(entity.creature,entity);
    const chosenName=name||NAMES[randInt(0,NAMES.length,"creatures")];
    entity.creature={
        id:"dragon:"+String(entity.id||entity.personId||state.nextEntityId),
        species:"dragon",
        name:String(chosenName).slice(0,48),
        ageYears:0,
        lifeStage:"hatchling",
        temperament:TEMPERAMENTS.includes(temperament)?temperament:TEMPERAMENTS[randInt(0,TEMPERAMENTS.length,"creatures")],
        bond:55,
        needs:{hunger:15,rest:20},
        health:100,
        maxHealth:100,
        lastAgedYear:state.year,
        lastNeedsTick:state.tick,
        lastBehaviorTick:state.tick,
        lastMemoryTick:state.tick,
        memories:[]
    };
    recordCreatureMemory(entity,"birth","I emerged into the realm as a dragon hatchling.");
    return entity.creature;
}
export function normalizeCreatureProfile(input,entity=null){
    const source=input&&typeof input==="object"?input:{};
    const ageYears=clamp(source.ageYears,0,DRAGON_LIFESPAN+100,0);
    return {
        id:String(source.id||("dragon:"+String(entity?.id||"unknown"))).slice(0,80),
        species:"dragon",
        name:String(source.name||"Unnamed dragon").slice(0,48),
        ageYears,
        lifeStage:stageForAge(ageYears),
        temperament:TEMPERAMENTS.includes(source.temperament)?source.temperament:"watchful",
        bond:clamp(source.bond,0,100,50),
        needs:{hunger:clamp(source.needs?.hunger,0,100,15),rest:clamp(source.needs?.rest,0,100,20)},
        health:clamp(source.health,0,100,100),
        maxHealth:100,
        lastAgedYear:Math.max(1,Math.floor(Number(source.lastAgedYear)||state.year)),
        lastNeedsTick:Math.max(0,Math.floor(Number(source.lastNeedsTick)||state.tick)),
        lastBehaviorTick:Math.max(0,Math.floor(Number(source.lastBehaviorTick)||state.tick)),
        lastMemoryTick:Math.max(0,Math.floor(Number(source.lastMemoryTick)||state.tick)),
        memories:Array.isArray(source.memories)?source.memories.slice(-CREATURE_MEMORY_LIMIT).map(memory=>({id:String(memory.id||"memory").slice(0,100),type:String(memory.type||"event").slice(0,32),text:String(memory.text||"").slice(0,220),tick:Math.max(0,Math.floor(Number(memory.tick)||0)),year:Math.max(1,Math.floor(Number(memory.year)||1))})):[]
    };
}
export function recordCreatureDeath(entity,cause="combat"){
    if(!entity||entity.type!==TYPE.DRAGON)return null;
    const creature=createCreatureProfile(entity);
    const archive=state.creatureArchive||(state.creatureArchive=[]);
    if(archive.some(entry=>entry.id===creature.id))return null;
    recordCreatureMemory(entity,"death","My life ended in year "+state.year+" ("+String(cause).slice(0,40)+").");
    const memorial={...JSON.parse(JSON.stringify(creature)),deathYear:state.year,deathTick:state.tick,cause:String(cause).slice(0,48)};
    archive.push(memorial);
    if(archive.length>CREATURE_ARCHIVE_LIMIT)archive.splice(0,archive.length-CREATURE_ARCHIVE_LIMIT);
    entity.dead=true;
    addLog("A DRAGON HAS FALLEN: "+creature.name,"#b77bd8","creature");
    return memorial;
}
export function updateCreatures(){
    const dragons=state.entities.filter(entity=>!entity.dead&&entity.type===TYPE.DRAGON);
    for(const entity of dragons){
        const creature=createCreatureProfile(entity);
        const previousStage=creature.lifeStage;
        if(state.year>creature.lastAgedYear){
            const years=Math.min(1000,state.year-creature.lastAgedYear);
            creature.ageYears=Math.min(DRAGON_LIFESPAN+100,creature.ageYears+years);
            creature.lastAgedYear=state.year;
            creature.lifeStage=stageForAge(creature.ageYears);
            if(creature.lifeStage!==previousStage){
                recordCreatureMemory(entity,"life-stage","I entered the "+creature.lifeStage+" stage of my life.");
                addLog(creature.name+" BECAME "+creature.lifeStage.toUpperCase(),"#b77bd8","creature");
            }
            if(creature.ageYears>DRAGON_LIFESPAN&&random("creatures")<Math.min(1,0.12+(creature.ageYears-DRAGON_LIFESPAN)*0.08)){
                recordCreatureDeath(entity,"old age");
                continue;
            }
        }
        const intervals=Math.min(10,Math.floor(Math.max(0,state.tick-creature.lastNeedsTick)/20));
        for(let i=0;i<intervals;i++){
            if(state.resources.food>=1){
                state.resources.food-=1;
                creature.needs.hunger=Math.max(0,creature.needs.hunger-16);
                creature.bond=Math.min(100,creature.bond+0.5);
                if(state.tick-creature.lastMemoryTick>=200){
                    recordCreatureMemory(entity,"feeding","The realm's stores provided food; my bond with the settlement deepened.");
                    creature.lastMemoryTick=state.tick;
                }
            }else{
                creature.needs.hunger=Math.min(100,creature.needs.hunger+10);
                if(creature.needs.hunger>=80)entity.hp=Math.max(0,entity.hp-4);
            }
            creature.lastNeedsTick+=20;
        }
        if(entity.hp<=0||creature.health<=0){
            recordCreatureDeath(entity,creature.needs.hunger>=80?"starvation":"injury");
            continue;
        }
        creature.health=clamp(entity.hp/Math.max(1,entity.maxHp)*100,0,100,100);
        if(state.tick-creature.lastBehaviorTick>=40){
            const keep=state.entities.find(candidate=>!candidate.dead&&candidate.type===TYPE.KEEP);
            if(keep){
                const dx=keep.x-entity.x,dy=keep.y-entity.y,distance=Math.hypot(dx,dy);
                if(distance>8){entity.x+=Math.sign(dx)*Math.min(0.5,Math.abs(dx)*0.025);entity.y+=Math.sign(dy)*Math.min(0.5,Math.abs(dy)*0.025);}
                else if(distance<3){entity.x+=random("creatures")>0.5?0.15:-0.15;entity.y+=random("creatures")>0.5?0.15:-0.15;}
            }
            creature.lastBehaviorTick=state.tick;
        }
    }
    return dragons.length;
}
export function getCreatureSnapshot(){
    const active=state.entities.filter(entity=>!entity.dead&&entity.type===TYPE.DRAGON).map(entity=>{
        const creature=createCreatureProfile(entity);
        return {id:creature.id,name:creature.name,ageYears:creature.ageYears,lifeStage:creature.lifeStage,temperament:creature.temperament,bond:creature.bond,hunger:creature.needs.hunger,health:creature.health,memories:creature.memories.slice(-5).reverse()};
    });
    const archive=(state.creatureArchive||[]).slice(-20).reverse().map(entry=>({id:entry.id,name:entry.name,ageYears:entry.ageYears,lifeStage:entry.lifeStage,deathYear:entry.deathYear,cause:entry.cause}));
    return {active,archive};
}
