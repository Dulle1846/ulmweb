import {state} from "../core/state.js";
import {TYPE} from "../core/types.js";
import {spawnEntity,canSpawnEntity} from "../world/entities.js";
import {ensurePersonProfile,addPersonMemory} from "./people.js";
import {linkParentChild,setPartnership,getFamilySnapshot} from "./families.js";
const MAX_HISTORY=48,personId=e=>String(e?.personId||e?.person?.id||e?.id||""),alive=e=>Boolean(e&&!e.dead);
function royalState(){const s=state.royal&&typeof state.royal==="object"?state.royal:{};state.royal={dynastyName:String(s.dynastyName||state.kingdomName||"Eldria").slice(0,48),consortId:typeof s.consortId==="string"?s.consortId:null,heirId:typeof s.heirId==="string"?s.heirId:null,lastBirthYear:Math.max(0,Math.floor(Number(s.lastBirthYear)||0)),history:Array.isArray(s.history)?s.history.filter(x=>x&&typeof x==="object").slice(-MAX_HISTORY):[]};return state.royal;}
function adultAge(e){const p=ensurePersonProfile(e);return ({human:16,elf:35,dwarf:24,orc:14,goblin:10,halfling:20,gnome:24,dragonkin:22,fae:28,revenant:0})[p.species]??16;}
function record(kind,detail){const s=royalState();s.history.push({year:Math.max(1,Number(state.year)||1),kind,detail:String(detail).slice(0,160)});s.history=s.history.slice(-MAX_HISTORY);}
export function getSovereign(){return state.entities.find(e=>alive(e)&&e.isKing)||null;}
export function getRoyalPerson(id){return state.entities.find(e=>alive(e)&&personId(e)===String(id))||null;}
export function getRoyalHouse(){
 const king=getSovereign(),s=royalState(),consort=getRoyalPerson(s.consortId);
 if(!king)return {king:null,consort,heir:getRoyalPerson(s.heirId),children:[],candidates:[],history:[...s.history]};
 const family=getFamilySnapshot(personId(king)),children=(family?.children||[]).map(x=>getRoyalPerson(x.personId)).filter(Boolean);
 const candidates=state.entities.filter(e=>alive(e)&&e!==king&&e.type===TYPE.VILLAGER&&e.personId&&adultAge(e)>0&&ensurePersonProfile(e).ageYears>=adultAge(e)&&personId(e)!==s.consortId).sort((a,b)=>ensurePersonProfile(a).name.localeCompare(ensurePersonProfile(b).name)).slice(0,40);
 return {king,consort,heir:getRoyalPerson(s.heirId),children,candidates,history:[...s.history]};
}
export function appointRoyalConsort(id){
 const king=getSovereign(),consort=getRoyalPerson(id);if(!king||!consort||consort===king||consort.type!==TYPE.VILLAGER)return {ok:false,reason:"eligible-consort-not-found"};
 const kp=ensurePersonProfile(king,{role:"king"}),cp=ensurePersonProfile(consort);if(cp.ageYears<adultAge(consort))return {ok:false,reason:"consort-not-adult"};
 const result=setPartnership(personId(king),personId(consort),{status:"married",sinceYear:state.year||1});if(!result.ok)return result;
 royalState().consortId=personId(consort);cp.role="royal-consort";
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
 state.resources.food-=20;state.resources.gold-=15;s.lastBirthYear=Math.max(1,Number(state.year)||1);
 for(const [entity,id,text] of [[king,"king","A royal child, "+p.name+", was born in year "+state.year+"."],[consort,"consort","I welcomed "+p.name+" into the royal house in year "+state.year+"."],[child,"origin","I was born into the royal "+s.dynastyName+" dynasty in year "+state.year+"."]])addPersonMemory(entity,{id:"royal-birth:"+child.id+":"+id,type:"dynasty",text,tick:state.tick,importance:100});
 record("birth","Royal child born: "+p.name);if(!s.heirId)designateHeir(personId(child));return {ok:true,child};
}
export function designateHeir(id){const s=royalState(),h=getRoyalHouse(),candidate=h.children.find(x=>personId(x)===String(id));if(!candidate)return {ok:false,reason:"not-a-living-royal-child"};s.heirId=personId(candidate);ensurePersonProfile(candidate).role="heir";record("heir-designated",ensurePersonProfile(candidate).name);return {ok:true,heir:candidate};}
export function updateRoyalSuccession(){
 if(getSovereign())return {changed:false,king:getSovereign()};
 const s=royalState(),memorial=(state.personArchive||[]).find(x=>x.isKing),children=memorial?.person?.kinship?.children||[];
 let successor=getRoyalPerson(s.heirId);if(!successor)successor=children.map(x=>getRoyalPerson(x.personId)).find(Boolean)||null;
 if(!successor)return {changed:false,king:null,reason:"no-living-heir"};
 for(const e of state.entities)if(e.isKing)e.isKing=false;
 successor.isKing=true;successor.isRoyalFamily=true;const p=ensurePersonProfile(successor,{role:"king"});p.role="king";s.heirId=null;
 state.kingHp=Math.max(1,Math.min(successor.maxHp||300,successor.hp||300));record("succession","The crown passed to "+p.name);
 addPersonMemory(successor,{id:"succession:"+successor.id+":"+state.year,type:"dynasty",text:"I inherited the crown and became sovereign in year "+state.year+".",tick:state.tick,importance:100});
 return {changed:true,king:successor};
}
export function normalizeRoyalState(input=state.royal){state.royal={...(input&&typeof input==="object"?input:{})};return royalState();}
