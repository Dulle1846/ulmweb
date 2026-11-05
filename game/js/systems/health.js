// Public health simulation: household transmission, treatment and recovery.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";

export const HEALTH_INTERVAL = 20;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):min));
const residents=()=>state.entities.filter(entity=>!entity.dead&&entity.type===TYPE.VILLAGER);
function ensureHealth(){
    const current=state.health&&typeof state.health==="object"&&!Array.isArray(state.health)?state.health:{};
    const normalized={
        outbreakActive:Boolean(current.outbreakActive),
        disease:typeof current.disease==="string"?current.disease:"none",
        severity:clamp(current.severity??1,0,3),
        containment:clamp(current.containment??0,0,3),
        cases:Math.max(0,Math.floor(Number(current.cases)||0)),
        recovered:Math.max(0,Math.floor(Number(current.recovered)||0)),
        outbreaks:Math.max(0,Math.floor(Number(current.outbreaks)||0)),
        lastUpdateTick:Math.max(0,Math.floor(Number(current.lastUpdateTick)||0)),
        startedAtTick:Math.max(0,Math.floor(Number(current.startedAtTick)||0))
    };
    if(current===state.health)Object.assign(current,normalized);
    else state.health=normalized;
    return state.health;
}
function householdKey(villager){
    if(typeof villager.householdId==="string"&&villager.householdId)return villager.householdId;
    const home=villager.home||{x:villager.x,y:villager.y};
    return "home:"+Number(home.x).toFixed(2)+":"+Number(home.y).toFixed(2);
}
export function getHealthSnapshot(){
    const people=residents(),sick=people.filter(person=>(person.illnessUntilTick||0)>state.tick).length;
    const health=ensureHealth();
    return {population:people.length,sick,recovered:health.recovered,cases:health.cases,disease:health.disease,
        outbreaks:health.outbreaks,active:health.outbreakActive,severity:health.severity,
        containment:health.containment};
}
export function startOutbreak({severity=1,containment=0,disease="common-fever"}={}){
    const health=ensureHealth(),people=residents();
    const alreadyActive=health.outbreakActive&&people.some(person=>(person.illnessUntilTick||0)>state.tick);
    health.outbreakActive=true;
    health.disease=String(disease).slice(0,48)||"common-fever";
    health.severity=Math.max(health.severity,clamp(severity,1,3));
    health.containment=Math.max(health.containment,clamp(containment,0,3));
    if(!alreadyActive){
        health.startedAtTick=state.tick;
        health.outbreaks++;
        if(people.length){
            const patient=people.find(person=>(person.illnessUntilTick||0)<=state.tick)||people[0];
            if((patient.illnessUntilTick||0)<=state.tick){
                patient.illnessStartedTick=state.tick;
                patient.illnessUntilTick=state.tick+80+health.severity*20;
                patient.illnessSeverity=health.severity;
                health.cases++;
            }
        }
    }
    return getHealthSnapshot();
}
export function applyHealthEffects(effects={}){
    let health=ensureHealth();
    if(effects.outbreak){
        startOutbreak({
            severity:effects.severity??1,
            containment:effects.containment??0,
            disease:effects.disease||"common-fever"
        });
        health=ensureHealth();
    }
    if(Number.isFinite(effects.treatment)){
        const treatment=clamp(effects.treatment,0,3);
        health.severity=clamp(health.severity-treatment,0,3);
        if(treatment>0){
            for(const person of residents()){
                if((person.illnessUntilTick||0)>state.tick){
                    person.illnessUntilTick=Math.max(state.tick+HEALTH_INTERVAL,person.illnessUntilTick-treatment*20);
                }
            }
        }
    }
    if(Number.isFinite(effects.containment)&&!effects.outbreak)health.containment=clamp(health.containment+effects.containment,0,3);
    return getHealthSnapshot();
}
export function updateHealth(){
    const current=state.health;
    if(!current||typeof current!=="object"||!current.outbreakActive||state.tick<=0||
        state.tick%HEALTH_INTERVAL!==0||current.lastUpdateTick===state.tick)return null;
    const health=ensureHealth();
    health.lastUpdateTick=state.tick;
    const people=residents();
    let recoveredNow=0;
    for(const person of people){
        if((person.illnessUntilTick||0)>0&&person.illnessUntilTick<=state.tick){
            delete person.illnessUntilTick;
            delete person.illnessStartedTick;
            delete person.illnessSeverity;
            recoveredNow++;
        }
    }
    health.recovered+=recoveredNow;
    const groups=new Map();
    for(const person of people){
        const key=householdKey(person);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(person);
    }
    const foodShortage=Math.max(0,Number(state.economy?.lastLedger?.foodShortage)||0);
    const crowding=people.length>0&&people.length>state.entities.filter(e=>!e.dead&&e.type===TYPE.HOUSE).length*4;
    const careBuildings=state.entities.filter(e=>!e.dead&&e.type===TYPE.TEMPLE).length;
    const transmissionRisk=clamp(
        0.12+health.severity*0.13+(crowding?0.08:0)+Math.min(0.12,foodShortage*0.01)
        -health.containment*0.075-Math.min(0.12,careBuildings*0.025),0,0.8
    );
    for(const household of groups.values()){
        const infectious=household.some(person=>(person.illnessUntilTick||0)>state.tick);
        if(!infectious)continue;
        const susceptible=household.filter(person=>(person.illnessUntilTick||0)<=state.tick);
        if(!susceptible.length)continue;
        if(Math.random()<transmissionRisk){
            const patient=susceptible[Math.floor(Math.random()*susceptible.length)];
            patient.illnessStartedTick=state.tick;
            patient.illnessSeverity=health.severity;
            patient.illnessUntilTick=state.tick+80+health.severity*20;
            health.cases++;
        }
    }
    const sick=people.filter(person=>(person.illnessUntilTick||0)>state.tick).length;
    if(sick>0)state.morale=Math.max(0,state.morale-Math.min(0.45,sick*0.06));
    if(sick===0){
        health.outbreakActive=false;
        health.containment=0;
        health.severity=0;
        health.disease="none";
    }
    return getHealthSnapshot();
}
