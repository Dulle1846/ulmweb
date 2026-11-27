import {state} from "../core/state.js";
import {TYPE} from "../core/types.js";
import {spawnEntity,canSpawnEntity} from "../world/entities.js";
import {ensurePersonProfile,addPersonMemory} from "./people.js";
import {linkParentChild,setPartnership,getFamilySnapshot} from "./families.js";
import {recordResourceMovement} from "./goods-book.js";
import {addResource} from "./resources.js";
import {normalizeRoyalCrisisState} from "./royal-crisis-state.js";
import {DIPLOMATIC_REALMS} from "./diplomacy-config.js";
import {normalizeRoyalEducationState} from "./royal-education.js";
const MAX_HISTORY=48,personId=e=>String(e?.personId||e?.person?.id||e?.id||""),alive=e=>Boolean(e&&!e.dead);
function normalizeForeignMarriage(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const realm=DIPLOMATIC_REALMS.find(item=>item.id===value.realmId),house=realm?.royalHouse;
 if(!house)return null;
 const dowry={};
 for(const key of ["wood","stone","gold","food"]){
  const amount=Math.max(0,Math.min(1000,Math.floor(Number(value.dowry?.[key])||0)));
  if(amount)dowry[key]=amount;
 }
 return {
  realmId:realm.id,
  candidateId:String(value.candidateId||house.id).slice(0,64),
  name:String(value.name||house.name).slice(0,90),
  house:String(value.house||house.house).slice(0,48),
  species:house.species,
  sex:value.sex==="male"?"male":"female",
  sinceYear:Math.max(1,Math.min(1000000,Math.floor(Number(value.sinceYear)||1))),
  dowry
 };
}
function royalState(){
 const s=state.royal&&typeof state.royal==="object"&&!Array.isArray(state.royal)?state.royal:{};
 // Preserve the state object's identity: callers may hold this reference while
 // recording a birth, marriage or succession event. Replacing it would write
 // later mutations to a detached object and silently lose the designated heir.
 s.dynastyName=String(s.dynastyName||state.kingdomName||"Eldria").slice(0,48);
 s.consortId=typeof s.consortId==="string"?s.consortId:null;
 s.heirId=typeof s.heirId==="string"?s.heirId:null;
 s.lastBirthYear=Math.max(0,Math.floor(Number(s.lastBirthYear)||0));
 s.foreignMarriage=normalizeForeignMarriage(s.foreignMarriage);
 s.history=Array.isArray(s.history)?s.history.filter(x=>x&&typeof x==="object").slice(-MAX_HISTORY):[];
 normalizeRoyalCrisisState(s);
  s.education=normalizeRoyalEducationState(s.education);
 state.royal=s;
 return s;
}
function adultAge(e){const p=ensurePersonProfile(e);return ({human:16,elf:35,dwarf:24,orc:14,goblin:10,halfling:20,gnome:24,dragonkin:22,fae:28,revenant:0})[p.species]??16;}
export function royalAdultAge(e){return adultAge(e);}
function closeKinIds(king){const family=getFamilySnapshot(personId(king));return new Set([...(family?.parents||[]),...(family?.children||[]),...(family?.siblings||[])].map(x=>String(x.personId)));}
function hasActivePartner(entity){return ensurePersonProfile(entity).kinship.partners.some(x=>["partner","married"].includes(x.status));}
function record(kind,detail){const s=royalState();s.history.push({year:Math.max(1,Number(state.year)||1),kind,detail:String(detail).slice(0,160)});s.history=s.history.slice(-MAX_HISTORY);}
export function getSovereign(){return state.entities.find(e=>alive(e)&&e.isKing)||null;}
export function getRoyalPerson(id){return state.entities.find(e=>alive(e)&&personId(e)===String(id))||null;}
export function getRoyalHouse(){
 const king=getSovereign(),s=royalState(),consort=getRoyalPerson(s.consortId);
 if(!king)return {king:null,consort,heir:getRoyalPerson(s.heirId),children:[],candidates:[],foreignMarriage:s.foreignMarriage,history:[...s.history]};
 const family=getFamilySnapshot(personId(king)),children=(family?.children||[]).map(x=>getRoyalPerson(x.personId)).filter(Boolean);
 const closeKin=closeKinIds(king);
 const candidates=state.entities.filter(e=>alive(e)&&e!==king&&e.type===TYPE.VILLAGER&&e.personId&&adultAge(e)>0&&ensurePersonProfile(e).ageYears>=adultAge(e)&&personId(e)!==s.consortId&&!closeKin.has(personId(e))&&!hasActivePartner(e)).sort((a,b)=>ensurePersonProfile(a).name.localeCompare(ensurePersonProfile(b).name)).slice(0,40);
 return {king,consort,heir:getRoyalPerson(s.heirId),children,candidates,foreignMarriage:s.foreignMarriage,history:[...s.history]};
}
export function appointRoyalConsort(id){
 const king=getSovereign(),consort=getRoyalPerson(id);if(!king||!consort||consort===king||consort.type!==TYPE.VILLAGER)return {ok:false,reason:"eligible-consort-not-found"};
 const sitting=royalState();
 // A widowed sovereign may marry again once the recorded consort is no longer
 // alive; only a living consort blocks a new match.
 if(sitting.consortId&&sitting.consortId!==personId(consort)&&getRoyalPerson(sitting.consortId))return {ok:false,reason:"sovereign-already-married"};
 const kp=ensurePersonProfile(king,{role:"king"}),cp=ensurePersonProfile(consort);
 if(cp.ageYears<adultAge(consort))return {ok:false,reason:"consort-not-adult"};
 if(closeKinIds(king).has(personId(consort)))return {ok:false,reason:"close-kinship"};
 if(hasActivePartner(consort))return {ok:false,reason:"consort-already-partnered"};
 const result=setPartnership(personId(king),personId(consort),{status:"married",sinceYear:state.year||1});if(!result.ok)return result;
 const rs=royalState();rs.consortId=personId(consort);rs.foreignMarriage=null;cp.role="royal-consort";
 addPersonMemory(king,{id:"royal-marriage:"+personId(consort),type:"dynasty",text:"I entered a royal marriage with "+cp.name+" in year "+state.year+".",tick:state.tick,importance:92});
 addPersonMemory(consort,{id:"royal-marriage:"+personId(king),type:"dynasty",text:"I married the sovereign and joined the royal house in year "+state.year+".",tick:state.tick,importance:92});
 record("marriage",kp.name+" married "+cp.name);return {ok:true,consort};
}
export function createRoyalChild(){
 const king=getSovereign(),s=royalState(),consort=getRoyalPerson(s.consortId);if(!king||!consort)return {ok:false,reason:"royal-marriage-required"};
 if(s.lastBirthYear>0&&(Number(state.year)||1)-s.lastBirthYear<4)return {ok:false,reason:"dynastic-birth-cooldown"};
 if((Number(state.resources?.food)||0)<20||(Number(state.resources?.gold)||0)<15)return {ok:false,reason:"royal-treasury-low"};
 const kp=ensurePersonProfile(king,{role:"king"}),cp=ensurePersonProfile(consort);
 if((kp.kinship?.children?.length||0)>=64||(cp.kinship?.children?.length||0)>=64)return {ok:false,reason:"royal-child-limit"};
 if(!canSpawnEntity(TYPE.KNIGHT))return {ok:false,reason:"entity-capacity"};
 const child=spawnEntity(king.x+1,king.y+1,TYPE.KNIGHT);if(!child)return {ok:false,reason:"entity-capacity"};
 child.isRoyalFamily=true;child.personId=child.id;child.home={...(king.home||{x:king.x,y:king.y})};child.anchor={...child.home};
 const p=ensurePersonProfile(child,{role:"royal-child",species:kp.species});p.ageYears=0;p.lifeStage="young";p.role="royal-child";p.species=kp.species;p.familyName=s.dynastyName;p.name=p.firstName+" "+s.dynastyName;p.bornAtYear=Math.max(1,Number(state.year)||1);p.lastAgedYear=p.bornAtYear;
 const links=[linkParentChild(personId(king),personId(child),{kind:"biological"}),linkParentChild(personId(consort),personId(child),{kind:"biological"})];
 if(links.some(x=>!x.ok)){for(const parent of [king,consort])parent.person.kinship.children=parent.person.kinship.children.filter(x=>x.personId!==personId(child));p.kinship.parents=[];state.entities=state.entities.filter(e=>e!==child);return {ok:false,reason:"kinship-link-failed"};}
 recordResourceMovement("food",-20,"royal-household",{from:{kind:"realm",id:"royal-stores"},to:{kind:"dynasty",id:s.dynastyName||"royal-house"},key:"food:royal-birth:"+child.id});addResource("food",-20);addResource("gold",-15);s.lastBirthYear=Math.max(1,Number(state.year)||1);
 for(const [entity,id,text] of [[king,"king","A royal child, "+p.name+", was born in year "+state.year+"."],[consort,"consort","I welcomed "+p.name+" into the royal house in year "+state.year+"."],[child,"origin","I was born into the royal "+s.dynastyName+" dynasty in year "+state.year+"."]])addPersonMemory(entity,{id:"royal-birth:"+child.id+":"+id,type:"dynasty",text,tick:state.tick,importance:100});
 record("birth","Royal child born: "+p.name);
 if(!s.heirId){s.heirId=personId(child);p.role="heir";record("heir-designated",p.name);}
 return {ok:true,child};
}
export function designateHeir(id){const s=royalState(),h=getRoyalHouse(),candidate=h.children.find(x=>personId(x)===String(id));if(!candidate)return {ok:false,reason:"not-a-living-royal-child"};s.heirId=personId(candidate);ensurePersonProfile(candidate).role="heir";record("heir-designated",ensurePersonProfile(candidate).name);return {ok:true,heir:candidate};}
export function updateRoyalSuccession(){
 if(getSovereign())return {changed:false,king:getSovereign()};
 const s=royalState();
 const law=["primogeniture","elective","designated"].includes(state.government?.succession)?state.government.succession:"primogeniture";
 const memorials=(state.personArchive||[]).filter(x=>x&&x.isKing);
 const memorial=memorials.length?memorials[memorials.length-1]:null;
 const children=memorial?.person?.kinship?.children||[];
 const lateKing=state.entities.find(entity=>entity&&entity.isKing)||null;
 const familyChildren=lateKing?getFamilySnapshot(personId(lateKing)).children||[]:[];
 const isAdult=entity=>{if(!entity)return false;const p=ensurePersonProfile(entity);return p.ageYears>=adultAge(entity);};
 const designated=getRoyalPerson(s.heirId);
 let successor=null;
 if(law==="designated"){
  // A designated minor is a lawful heir. The crisis pass opens a regency for
  // the child instead of silently passing over the named heir.
  successor=designated||null;
 }else if(law==="elective"){
  const pool=state.entities
   .filter(entity=>!entity.dead&&!entity.isKing&&entity.type===TYPE.VILLAGER&&entity.personId&&isAdult(entity))
   .filter((entity,index,all)=>all.findIndex(candidate=>personId(candidate)===personId(entity))===index);
  const score=entity=>{const p=ensurePersonProfile(entity);return (Number(p.traits?.ambition)||0)*0.35+(Number(p.traits?.discipline)||0)*0.25+(Number(p.traits?.compassion)||0)*0.20+(Number(p.traits?.piety)||0)*0.10+Math.min(80,Number(p.ageYears)||0)*0.10;};
  successor=pool.sort((a,b)=>score(b)-score(a)||ensurePersonProfile(a).name.localeCompare(ensurePersonProfile(b).name))[0]||null;
 }else{
  successor=designated||null;
  if(!successor){
   const childIds=[...new Set([...children,...familyChildren].map(x=>String(x.personId)))];
   successor=childIds.map(id=>getRoyalPerson(id)).filter(Boolean)
    .sort((a,b)=>(Number(ensurePersonProfile(b).ageYears)||0)-(Number(ensurePersonProfile(a).ageYears)||0)||ensurePersonProfile(a).name.localeCompare(ensurePersonProfile(b).name)||personId(a).localeCompare(personId(b)))[0]||null;
  }
 }
 if(!successor)return {changed:false,king:null,reason:"no-living-heir",law};
 for(const e of state.entities)if(e.isKing)e.isKing=false;
 successor.isKing=true;successor.isRoyalFamily=true;successor.isAbdicated=false;
 const p=ensurePersonProfile(successor,{role:"king"});p.role="king";s.heirId=null;
 state.kingHp=Math.max(1,Math.min(successor.maxHp||300,successor.hp||300));
 const minor=!isAdult(successor);
 // A fresh succession begins a clean crisis record. The crisis runtime opens
 // the actual regency and seeds claims once the new sovereign is installed.
 s.regency={...s.regency,active:false,regentId:null,minorKingId:minor?personId(successor):null,sinceYear:minor?Math.max(1,Number(state.year)||1):0,reason:minor?"minor-heir":"",councilSupport:0,lastUpdateYear:0,claimsSeeded:false,regentPriorRole:null,history:Array.isArray(s.regency?.history)?s.regency.history:[]};
 s.claims=Array.isArray(s.claims)?s.claims.map(claim=>({...claim,status:claim.status==="pressing"?"settled":claim.status})):[];
 s.civilConflict={...s.civilConflict,active:false,phase:"resolved",severity:0,resolvedYear:Math.max(1,Number(state.year)||1),lastUpdateYear:0};
 record("succession","The crown passed to "+p.name+" under "+law+" law."+(minor?" A regency is required.":""));
 addPersonMemory(successor,{id:"succession:"+successor.id+":"+state.year,type:"dynasty",text:"I inherited the crown under "+law+" law and became sovereign in year "+state.year+"."+(minor?" I am still a minor; a regent will rule in my name.":""),tick:state.tick,importance:100});
 if(minor)record("regency-required",p.name+" is a minor; the crown must appoint a regent.");
 return {changed:true,king:successor,law,minor,regencyRequired:minor};
}

export function normalizeRoyalState(input=state.royal){state.royal={...(input&&typeof input==="object"?input:{})};return royalState();}
