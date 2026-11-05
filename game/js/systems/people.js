// Persistent person records for named residents and the independently acting king.
import { random, randInt } from "../core/random.js";

export const PERSON_SPECIES = Object.freeze({
    human: { label:"Human", lifespan:82, maturation:16 },
    elf: { label:"Elf", lifespan:420, maturation:35 },
    dwarf: { label:"Dwarf", lifespan:260, maturation:24 },
    orc: { label:"Orc", lifespan:95, maturation:14 },
    goblin: { label:"Goblin", lifespan:65, maturation:10 },
    halfling: { label:"Halfling", lifespan:110, maturation:20 },
    gnome: { label:"Gnome", lifespan:180, maturation:24 },
    dragonkin: { label:"Dragonkin", lifespan:150, maturation:22 },
    fae: { label:"Fae", lifespan:300, maturation:28 },
    revenant: { label:"Revenant", lifespan:999, maturation:0 }
});
const FIRST_NAMES=["Aldric","Alwen","Bryn","Cedric","Dain","Eira","Elric","Fen","Galen","Hilda","Ilyra","Jorund","Kael","Liora","Marek","Mira","Neris","Orin","Perrin","Runa","Sylvi","Thane","Una","Varek","Wren","Ysra"];
const FAMILY_NAMES=["Ashford","Blackbriar","Copperfield","Dawnmere","Elderbrook","Frostmantle","Goldleaf","Hollowmere","Ironwood","Juniper","Kestrel","Longstride","Moonbrook","Northwind","Oakenshield","Pineward","Quickwater","Ravencrest","Stonehelm","Thornfield","Umber","Valewood","Wintermere","Yarrow"];
const SPECIES_IDS=Object.keys(PERSON_SPECIES);
const TRAITS=["ambition","courage","compassion","greed","sociability","discipline","curiosity","piety","distrust","patience"];
const NEEDS=["food","rest","safety","belonging","purpose"];
const clamp=(value,fallback=50)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):fallback;
const pick=(items,stream)=>items[randInt(0,items.length,stream)];
function lifeStage(age,species){const maturity=PERSON_SPECIES[species]?.maturation??16;if(age<maturity)return "young";if(age<(PERSON_SPECIES[species]?.lifespan??80)*0.72)return "adult";return "elder";}
function createTraits(){return Object.fromEntries(TRAITS.map(trait=>[trait,randInt(15,86,"people")]));}
function createNeeds(){return Object.fromEntries(NEEDS.map(need=>[need,randInt(45,91,"people")]));}
export function createPersonProfile(entity,{role="resident",species=null}={}){
    const chosenSpecies=SPECIES_IDS.includes(species)?species:pick(SPECIES_IDS,"people");
    const ageYears=randInt(PERSON_SPECIES[chosenSpecies].maturation,Math.max(PERSON_SPECIES[chosenSpecies].maturation+1,Math.min(90,PERSON_SPECIES[chosenSpecies].lifespan)),"people");
    const firstName=pick(FIRST_NAMES,"people"),familyName=pick(FAMILY_NAMES,"people");
    const id=entity.personId||entity.id;
    return {
        id:String(id||entity.id||"person-unknown"),
        name:firstName+" "+familyName,
        firstName,familyName,species:chosenSpecies,
        role:String(role).slice(0,32),
        ageYears,lifeStage:lifeStage(ageYears,chosenSpecies),
        traits:createTraits(),needs:createNeeds(),
        goals:[pick(["security","prosperity","family","recognition","knowledge","faith","adventure","power"],"people")],
        memories:[],relationships:[],secrets:[],
        bornAtYear:1,createdAtTick:0
    };
}
export function normalizePersonProfile(saved,entity,{role="resident"}={}){
    if(!saved||typeof saved!=="object"||Array.isArray(saved))return createPersonProfile(entity,{role});
    const species=SPECIES_IDS.includes(saved.species)?saved.species:"human";
    const firstName=typeof saved.firstName==="string"&&saved.firstName.length<=40?saved.firstName:"A nameless";
    const familyName=typeof saved.familyName==="string"&&saved.familyName.length<=48?saved.familyName:"Resident";
    const ageYears=Math.max(0,Math.min(1000,Math.floor(clamp(saved.ageYears,20))));
    const traits=Object.fromEntries(TRAITS.map(key=>[key,clamp(saved.traits?.[key])]));
    const needs=Object.fromEntries(NEEDS.map(key=>[key,clamp(saved.needs?.[key])]));
    const list=(value,max)=>Array.isArray(value)?value.filter(item=>item&&typeof item==="object").slice(0,max):[];
    const name=typeof saved.name==="string"&&saved.name.length<=90?saved.name:firstName+" "+familyName;
    return {
        id:String(entity.personId||saved.id||entity.id||"person-unknown"),
        name,firstName,familyName,species,
        role:typeof saved.role==="string"?saved.role.slice(0,32):role,
        ageYears,lifeStage:lifeStage(ageYears,species),
        traits,needs,
        goals:Array.isArray(saved.goals)?saved.goals.filter(x=>typeof x==="string").slice(0,8):[],
        memories:list(saved.memories,24),relationships:list(saved.relationships,32),
        secrets:Array.isArray(saved.secrets)?saved.secrets.filter(x=>typeof x==="string").slice(0,12):[],
        bornAtYear:Math.max(1,Math.floor(clamp(saved.bornAtYear,1))),
        createdAtTick:Math.max(0,Math.floor(clamp(saved.createdAtTick,0)))
    };
}
export function ensurePersonProfile(entity,options={}){
    if(!entity||typeof entity!=="object")return null;
    entity.personId=String(entity.personId||entity.id||"person-unknown");
    entity.person=normalizePersonProfile(entity.person,entity,options);
    return entity.person;
}
export function addPersonMemory(entity,memory){
    const person=ensurePersonProfile(entity);
    if(!person||!memory||typeof memory!=="object")return false;
    const entry={
        id:String(memory.id||("memory-"+(person.memories.length+1))),
        type:String(memory.type||"event").slice(0,32),
        text:String(memory.text||"").slice(0,240),
        tick:Math.max(0,Math.floor(Number(memory.tick)||0)),
        importance:clamp(memory.importance,50)
    };
    if(!entry.text)return false;
    person.memories.unshift(entry);
    if(person.memories.length>24)person.memories.length=24;
    return entry;
}
export function getPersonSnapshot(entity){
    if(!entity)return null;
    const person=ensurePersonProfile(entity);
    return {id:person.id,name:person.name,species:person.species,role:person.role,ageYears:person.ageYears,lifeStage:person.lifeStage,traits:{...person.traits},needs:{...person.needs},goals:[...person.goals],memories:person.memories.map(item=>({...item})),relationships:person.relationships.map(item=>({...item}))};
}
