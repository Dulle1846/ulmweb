// Persistent person records for named residents and the independently acting king.
import { random, randInt } from "../core/random.js";
import {state} from "../core/state.js";

export const PERSON_SPECIES = Object.freeze({
    human: { label:"Human", lifespan:82, maturation:16, reproduction:"paired" },
    elf: { label:"Elf", lifespan:420, maturation:35, reproduction:"paired" },
    dwarf: { label:"Dwarf", lifespan:260, maturation:24, reproduction:"paired" },
    orc: { label:"Orc", lifespan:95, maturation:14, reproduction:"paired" },
    goblin: { label:"Goblin", lifespan:65, maturation:10, reproduction:"paired" },
    halfling: { label:"Halfling", lifespan:110, maturation:20, reproduction:"paired" },
    gnome: { label:"Gnome", lifespan:180, maturation:24, reproduction:"paired" },
    dragonkin: { label:"Dragonkin", lifespan:150, maturation:22, reproduction:"paired" },
    fae: { label:"Fae", lifespan:300, maturation:28, reproduction:"paired" },
    revenant: { label:"Revenant", lifespan:999, maturation:0, reproduction:"none" }
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
function legacySex(saved,id){if(saved==="female"||saved==="male")return saved;const value=String(id||"person");let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0)%2===0?"female":"male";}
function createNeeds(){return Object.fromEntries(NEEDS.map(need=>[need,randInt(45,91,"people")]));}
export function createPersonProfile(entity,{role="resident",species=null}={}){
    const chosenSpecies=SPECIES_IDS.includes(species)?species:pick(SPECIES_IDS,"people");
    const ageYears=randInt(PERSON_SPECIES[chosenSpecies].maturation,Math.max(PERSON_SPECIES[chosenSpecies].maturation+1,Math.min(90,PERSON_SPECIES[chosenSpecies].lifespan)),"people");
    const firstName=pick(FIRST_NAMES,"people"),familyName=pick(FAMILY_NAMES,"people");
    const id=entity.personId||entity.id;
    return {
        id:String(id||entity.id||"person-unknown"),
        name:firstName+" "+familyName,
        firstName,familyName,species:chosenSpecies,sex:pick(["female","male"],"people"),
        role:String(role).slice(0,32),
        ageYears,lifeStage:lifeStage(ageYears,chosenSpecies),
        traits:createTraits(),needs:createNeeds(),
        goals:[pick(["security","prosperity","family","recognition","knowledge","faith","adventure","power"],"people")],
        memories:[],relationships:[],kinship:{parents:[],children:[],partners:[]},secrets:[],
        activeGoal:null,goalHistory:[],lastNeedsYear:Math.max(1,Number(state.year)||1),
        bornAtYear:Math.max(1,(Number(state.year)||1)-ageYears),lastAgedYear:Math.max(1,Number(state.year)||1),createdAtTick:Math.max(0,Number(state.tick)||0)
    };
}
export function normalizePersonProfile(saved,entity,{role="resident"}={}){
    if(!saved||typeof saved!=="object"||Array.isArray(saved))return createPersonProfile(entity,{role});
    const species=SPECIES_IDS.includes(saved.species)?saved.species:"human";
    const firstName=typeof saved.firstName==="string"&&saved.firstName.length<=40?saved.firstName:"A nameless";
    const familyName=typeof saved.familyName==="string"&&saved.familyName.length<=48?saved.familyName:"Resident";
    const ageValue=Number(saved.ageYears);
    const ageYears=Number.isFinite(ageValue)?Math.max(0,Math.min(1000,Math.floor(ageValue))):20;
    const traits=Object.fromEntries(TRAITS.map(key=>[key,clamp(saved.traits?.[key])]));
    const needs=Object.fromEntries(NEEDS.map(key=>[key,clamp(saved.needs?.[key])]));
    const list=(value,max)=>Array.isArray(value)?value.filter(item=>item&&typeof item==="object").slice(0,max):[];
    const name=typeof saved.name==="string"&&saved.name.length<=90?saved.name:firstName+" "+familyName;
    return {
        id:String(entity.personId||saved.id||entity.id||"person-unknown"),
        name,firstName,familyName,species,sex:legacySex(saved.sex,entity.personId||saved.id||entity.id),
        role:typeof saved.role==="string"?saved.role.slice(0,32):role,
        ageYears,lifeStage:lifeStage(ageYears,species),
        traits,needs,
        goals:Array.isArray(saved.goals)?saved.goals.filter(x=>typeof x==="string").slice(0,8):[],
        memories:list(saved.memories,24).map((item,index)=>({
            id:String(item.id||("legacy-memory-"+index)).slice(0,120),
            type:String(item.type||"event").slice(0,32),
            text:String(item.text||"").slice(0,240),
            tick:Math.max(0,Math.floor(Number(item.tick)||0)),
            importance:clamp(item.importance,50)
        })).filter(item=>item.text),
        relationships:list(saved.relationships,32).map(item=>({
            targetId:String(item.targetId||"").slice(0,100),
            targetName:String(item.targetName||"Unknown").slice(0,90),
            kind:String(item.kind||"known").slice(0,24),
            trust:clamp(item.trust),respect:clamp(item.respect),affinity:clamp(item.affinity),
            interactions:Math.max(0,Math.min(100000,Math.floor(Number(item.interactions)||0))),
            lastInteractionTick:Math.max(0,Math.floor(Number(item.lastInteractionTick)||0))
        })).filter(item=>item.targetId),
        kinship:(()=>{const source=saved.kinship&&typeof saved.kinship==="object"&&!Array.isArray(saved.kinship)?saved.kinship:{};const links=(value,max)=>Array.isArray(value)?value.filter(item=>item&&typeof item==="object").slice(0,max):[];return {
            parents:links(source.parents,2).map(item=>({personId:String(item.personId||"").slice(0,100),kind:["biological","adoptive","guardian"].includes(item.kind)?item.kind:"biological",sinceYear:Math.max(1,Math.floor(Number(item.sinceYear)||1))})).filter(item=>item.personId),
            children:links(source.children,64).map(item=>({personId:String(item.personId||"").slice(0,100),kind:["biological","adoptive","guardian"].includes(item.kind)?item.kind:"biological",sinceYear:Math.max(1,Math.floor(Number(item.sinceYear)||1))})).filter(item=>item.personId),
            partners:links(source.partners,16).map(item=>({personId:String(item.personId||"").slice(0,100),status:["partner","married","separated","divorced"].includes(item.status)?item.status:"partner",sinceYear:Math.max(1,Math.floor(Number(item.sinceYear)||1)),endedYear:item.endedYear==null?null:Math.max(1,Math.floor(Number(item.endedYear)||1)),lastBirthYear:Number.isSafeInteger(item.lastBirthYear)?Math.max(0,Math.min(1000000,item.lastBirthYear)):0})).filter(item=>item.personId)
        };})(),
        secrets:Array.isArray(saved.secrets)?saved.secrets.filter(x=>typeof x==="string").slice(0,12):[],
        activeGoal:saved.activeGoal&&typeof saved.activeGoal==="object"&&typeof saved.activeGoal.id==="string"?{
            id:saved.activeGoal.id.slice(0,48),
            sinceYear:Math.max(1,Math.min(Number(state.year)||1,Math.floor(Number(saved.activeGoal.sinceYear)||1))),
            priority:clamp(saved.activeGoal.priority,50),
            reason:String(saved.activeGoal.reason||"long-term ambition").slice(0,48)
        }:null,
        goalHistory:list(saved.goalHistory,12).map(item=>({
            id:String(item.id||"unknown").slice(0,48),
            startedYear:Math.max(1,Math.floor(Number(item.startedYear)||1)),
            endedYear:Math.max(1,Math.floor(Number(item.endedYear)||1)),
            completed:Boolean(item.completed),
            priority:clamp(item.priority,50)
        })),
        lastNeedsYear:Number.isSafeInteger(saved.lastNeedsYear)?Math.max(1,Math.min(Number(state.year)||1,saved.lastNeedsYear)):Math.max(1,Number(state.year)||1),
        bornAtYear:Number.isSafeInteger(saved.bornAtYear)?Math.max(1,Math.min(1000000,saved.bornAtYear)):Math.max(1,(Number(state.year)||1)-ageYears),
        lastAgedYear:Number.isSafeInteger(saved.lastAgedYear)?Math.max(1,Math.min(Number(state.year)||1,saved.lastAgedYear)):Math.max(1,Number(state.year)||1),
        createdAtTick:Number.isSafeInteger(saved.createdAtTick)?Math.max(0,saved.createdAtTick):0
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
        id:String(memory.id||("memory-"+person.id+"-"+Math.max(0,Math.floor(Number(memory.tick)||0))+"-"+Math.floor(random("people")*1000000000))).slice(0,120),
        type:String(memory.type||"event").slice(0,32),
        text:String(memory.text||"").slice(0,240),
        tick:Math.max(0,Math.floor(Number(memory.tick)||0)),
        importance:clamp(memory.importance,50)
    };
    if(!entry.text||person.memories.some(item=>item.id===entry.id))return false;
    person.memories.unshift(entry);
    if(person.memories.length>24)person.memories.length=24;
    return entry;
}
export function getPersonSnapshot(entity){
    if(!entity)return null;
    const person=ensurePersonProfile(entity);
    return {id:person.id,name:person.name,species:person.species,sex:person.sex,role:person.role,ageYears:person.ageYears,lifeStage:person.lifeStage,bornAtYear:person.bornAtYear,lastAgedYear:person.lastAgedYear,traits:{...person.traits},needs:{...person.needs},goals:[...person.goals],activeGoal:person.activeGoal?{...person.activeGoal}:null,goalHistory:person.goalHistory.map(item=>({...item})),lastNeedsYear:person.lastNeedsYear,memories:person.memories.map(item=>({...item})),relationships:person.relationships.map(item=>({...item})),kinship:{parents:person.kinship.parents.map(item=>({...item})),children:person.kinship.children.map(item=>({...item})),partners:person.kinship.partners.map(item=>({...item}))}};
}


const EVENT_IMPORTANCE=Object.freeze({
    plague:92,illness:82,rebellion:90,succession:88,fire:84,flood:82,monster:78,
    feud:76,crime:70,shortage:72,taxation:68,diplomacy:64,guild:62,migration:58,
    harvest:42,festival:38,wildlife:40,fishing:36,winter:48,faith:52,pilgrimage:44,
    discovery:54,ruins:60,omens:48,craft:42,invention:50,caravan:40,bandits:66,border:62,storm:54
});
const clampDelta=value=>Math.max(-8,Math.min(8,Math.round(Number(value)||0)));

export function createEventParticipants(family="realm"){
    const actors=state.entities.filter(entity=>!entity.dead&&(entity.isKing||(entity.personId&&entity.person)));
    const king=actors.find(entity=>entity.isKing)||null;
    const residents=actors.filter(entity=>!entity.isKing&&entity.personId&&entity.person)
        .sort((a,b)=>String(a.personId).localeCompare(String(b.personId)));
    if(!king&&!residents.length)return [];
    const participants=[];
    const civicFamilies=new Set(["succession","diplomacy","taxation","rebellion","feud","guild","faith","crime"]);
    const desired=Math.min(residents.length,civicFamilies.has(family)?2:1);
    if(desired>0){
        const start=randInt(0,residents.length,"people");
        for(let offset=0;offset<desired;offset++){
            const resident=residents[(start+offset)%residents.length];
            participants.push({personId:String(resident.personId),role:offset===0?"affected":"witness"});
        }
    }
    if(king)participants.push({personId:String(king.personId||king.id),role:"decision-maker"});
    return participants.slice(0,4);
}

function upsertRelationship(source,target,kind,delta,tick){
    if(!source?.person||!target?.person||source.personId===target.personId)return false;
    const person=ensurePersonProfile(source),targetPerson=ensurePersonProfile(target);
    const targetId=String(target.personId||target.id);
    let relation=person.relationships.find(item=>item.targetId===targetId);
    if(!relation){
        if(person.relationships.length>=32){
            let weakest=0;
            for(let i=1;i<person.relationships.length;i++){
                const a=person.relationships[i],b=person.relationships[weakest];
                if((a.lastInteractionTick||0)<(b.lastInteractionTick||0))weakest=i;
            }
            person.relationships.splice(weakest,1);
        }
        relation={targetId,targetName:targetPerson.name,kind:String(kind).slice(0,24),trust:50,respect:50,affinity:50,interactions:0,lastInteractionTick:0};
        person.relationships.push(relation);
    }
    relation.targetName=targetPerson.name;
    relation.kind=String(kind).slice(0,24);
    relation.trust=clamp((Number(relation.trust)??50)+delta,50);
    relation.respect=clamp((Number(relation.respect)??50)+Math.round(delta*.6),50);
    relation.affinity=clamp((Number(relation.affinity)??50)+Math.round(delta*.25),50);
    relation.interactions=Math.min(100000,(Number(relation.interactions)||0)+1);
    relation.lastInteractionTick=Math.max(0,Math.floor(Number(tick)||0));
    return relation;
}

export function recordPersonEventOutcome(issue,choice,effects={},tick=state.tick){
    if(!issue||!choice)return {memories:0,relationships:0};
    const participants=Array.isArray(issue.participants)?issue.participants.slice(0,4):[];
    if(!participants.length)return {memories:0,relationships:0};
    const byId=new Map(state.entities.filter(entity=>!entity.dead&&entity.personId).map(entity=>[String(entity.personId),entity]));
    const king=state.entities.find(entity=>!entity.dead&&entity.isKing)||null;
    const importance=EVENT_IMPORTANCE[issue.family]??50;
    const commons=Number(effects.politics?.commons)||0;
    const morale=Number(effects.morale)||0;
    const health=effects.health||{};
    const publicImpact=clampDelta(commons*1.15+morale*.8+(Number(health.containment)||0)*.7-(Number(health.severity)||0)*.5);
    let memories=0,relationships=0;
    for(const participant of participants){
        const entity=byId.get(String(participant.personId));
        if(!entity)continue;
        const role=participant.role==="decision-maker"?"decision-maker":participant.role==="witness"?"witness":"affected";
        const sentence=role==="decision-maker"
            ? "I chose “"+String(choice.label).slice(0,100)+"” in response to "+String(issue.title).slice(0,110)+"."
            : role==="witness"
                ? "I witnessed "+String(issue.title).slice(0,120)+". The crown chose: "+String(choice.label).slice(0,90)+"."
                : "I was affected by "+String(issue.title).slice(0,120)+". The crown chose: "+String(choice.label).slice(0,90)+".";
        const added=addPersonMemory(entity,{
            id:"event:"+String(issue.id)+":"+String(entity.personId),
            type:"realm-event",text:sentence,tick,importance:role==="affected"?importance:Math.max(20,importance-12)
        });
        if(added)memories++;
        if(added&&role==="affected"&&king&&entity!==king&&publicImpact!==0){
            if(upsertRelationship(entity,king,"ruler",publicImpact,tick))relationships++;
            upsertRelationship(king,entity,"subject",Math.round(publicImpact*.35),tick);
        }
    }
    return {memories,relationships};
}


// Aging is advanced once per simulated realm year, never per animation frame.
// Missing lastAgedYear values in legacy saves are normalized to the current year
// so old profiles are not unexpectedly aged by the entire save's elapsed time.
export function updatePeople(){
    const currentYear=Math.max(1,Math.floor(Number(state.year)||1));
    let aged=0,transitions=0;
    for(const entity of state.entities){
        if(entity.dead||(!entity.personId&&!entity.isKing))continue;
        const person=ensurePersonProfile(entity,{role:entity.isKing?"king":"resident"});
        const lastYear=Number.isSafeInteger(person.lastAgedYear)?person.lastAgedYear:currentYear;
        const elapsed=Math.max(0,Math.min(1000,currentYear-lastYear));
        if(!elapsed)continue;
        const previousStage=person.lifeStage;
        person.ageYears=Math.max(0,Math.min(1000,person.ageYears+elapsed));
        person.lifeStage=lifeStage(person.ageYears,person.species);
        person.lastAgedYear=currentYear;
        aged++;
        if(person.lifeStage!==previousStage){
            const stageLabel=person.lifeStage==="adult"?"adulthood":person.lifeStage==="elder"?"old age":"youth";
            addPersonMemory(entity,{
                id:"life-stage:"+person.id+":"+person.lifeStage+":"+currentYear,
                type:"life-stage",
                text:"I entered "+stageLabel+" at age "+person.ageYears+".",
                tick:state.tick,
                importance:58
            });
            transitions++;
        }
    }
    return {aged,transitions};
}


export const MAX_PERSON_ARCHIVE = 1000;

export function createPersonMemorial(entity, { cause = "unknown", deathYear = state.year, deathTick = state.tick } = {}) {
    const person = ensurePersonProfile(entity);
    if (!person) return null;
    return {
        personId: String(entity.personId || person.id),
        person: JSON.parse(JSON.stringify(person)),
        deathYear: Math.max(1, Math.floor(Number(deathYear) || 1)),
        deathTick: Math.max(0, Math.floor(Number(deathTick) || 0)),
        cause: String(cause || "unknown").slice(0, 48),
        isKing: Boolean(entity.isKing)
    };
}

export function normalizePersonMemorial(saved) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const personId = String(saved.personId || saved.person?.id || "").slice(0, 100);
    if (!personId || !saved.person || typeof saved.person !== "object") return null;
    const entity = { id: personId, personId };
    const person = normalizePersonProfile(saved.person, entity, { role: saved.person.role || "resident" });
    return {
        personId,
        person,
        deathYear: Math.max(1, Math.min(1000000, Math.floor(Number(saved.deathYear) || 1))),
        deathTick: Math.max(0, Math.floor(Number(saved.deathTick) || 0)),
        cause: String(saved.cause || "unknown").slice(0, 48),
        isKing: Boolean(saved.isKing)
    };
}
