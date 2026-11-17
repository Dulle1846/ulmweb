// Foreign royal marriages bind the dynasty to one neighbouring court. A match
// creates a real resident, uses the existing partnership/kinship pipeline and
// resolves once on command; the annual diplomacy pass only adjusts four realms.
import {state} from "../core/state.js";
import {TYPE} from "../core/types.js";
import {spawnEntity,canSpawnEntity} from "../world/entities.js";
import {DIPLOMATIC_REALMS} from "./diplomacy-config.js";
import {getSovereign,appointRoyalConsort} from "./royal-dynasty.js";
import {ensurePersonProfile,addPersonMemory,PERSON_SPECIES} from "./people.js";
import {createAppearance} from "./appearance.js";
import {createSkills} from "./skills.js";
import {addResource} from "./resources.js";
import {recordResourceMovement} from "./goods-book.js";
import {addLog} from "./events.js";
import {applyForeignMarriageBond} from "./diplomacy.js";

const personId=entity=>String(entity?.personId||entity?.id||"");

function livingConsort(){
 const royal=state.royal||{};
 if(!royal.consortId)return null;
 return (state.entities||[]).find(entity=>!entity.dead&&personId(entity)===String(royal.consortId))||null;
}

function realmRecord(id){
 return (state.diplomacy?.realms||[]).find(realm=>String(realm.id)===String(id))||null;
}

export function getForeignMarriageSnapshot(){
 const royal=state.royal||{};
 const consort=livingConsort();
 const savedBond=royal.foreignMarriage&&typeof royal.foreignMarriage==="object"?royal.foreignMarriage:null;
 const savedDefinition=savedBond?DIPLOMATIC_REALMS.find(realm=>realm.id===savedBond.realmId):null;
 const bond=savedBond&&savedDefinition&&consort?{
  realmId:savedDefinition.id,
  realmName:savedDefinition.name,
  house:String(savedBond.house||savedDefinition.royalHouse.house),
  name:String(savedBond.name||savedDefinition.royalHouse.name),
  species:savedDefinition.royalHouse.species,
  sinceYear:Math.max(1,Math.floor(Number(savedBond.sinceYear)||1)),
  dowry:{...(savedBond.dowry||{})}
 }:null;
 const candidates=DIPLOMATIC_REALMS.map(definition=>{
  const house=definition.royalHouse,realm=realmRecord(definition.id);
  const relation=Number.isFinite(Number(realm?.relation))?Number(realm.relation):definition.baseRelation;
  const trust=Number.isFinite(Number(realm?.trust))?Number(realm.trust):definition.baseTrust;
  const treaty=realm?.treaty||"none";
  let reason=null;
  if(bond)reason="royal-marriage-already-sealed";
  else if(consort)reason="sovereign-already-married";
  else if(treaty==="war")reason="war-closes-the-court";
  else if(relation<house.minRelation)reason="relation-too-low";
  else if(trust<house.minTrust)reason="trust-too-low";
  return {
   realmId:definition.id,
   realmName:definition.name,
   region:definition.region,
   house:house.house,
   candidateId:house.id,
   name:house.name,
   species:house.species,
   speciesLabel:PERSON_SPECIES[house.species]?.label||house.species,
   sex:house.sex,
   ageYears:house.ageYears,
   traits:{...house.traits},
   dowry:{...house.dowry},
   minRelation:house.minRelation,
   minTrust:house.minTrust,
   relation:Math.round(relation),
   trust:Math.round(trust),
   treaty,
   available:!reason,
   reason
  };
 });
 return {
  bond,
  married:Boolean(bond),
  hasConsort:Boolean(consort),
  candidates,
  available:candidates.filter(candidate=>candidate.available).length
 };
}

function freeAdjacentTile(king){
 const occupied=new Set((state.entities||[]).filter(entity=>!entity.dead).map(entity=>entity.x+","+entity.y));
 const hasBounds=state.worldW>0&&state.worldH>0;
 for(let radius=1;radius<=8;radius++){
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   const x=king.x+dx,y=king.y+dy;
   if(hasBounds&&(x<0||y<0||x>=state.worldW||y>=state.worldH))continue;
   if(!occupied.has(x+","+y))return {x,y};
  }
 }
 return null;
}

export function marryForeignRealm(realmId){
 const snapshot=getForeignMarriageSnapshot();
 const candidate=snapshot.candidates.find(item=>item.realmId===String(realmId));
 if(!candidate)return {ok:false,reason:"unknown-realm"};
 if(!candidate.available)return {ok:false,reason:candidate.reason||"match-unavailable"};
 const king=getSovereign();
 if(!king)return {ok:false,reason:"no-sovereign"};
 if(snapshot.hasConsort)return {ok:false,reason:"sovereign-already-married"};
 if(!canSpawnEntity(TYPE.VILLAGER))return {ok:false,reason:"entity-capacity"};
 const tile=freeAdjacentTile(king);
 if(!tile)return {ok:false,reason:"no-space-for-consort"};
 const spouse=spawnEntity(tile.x,tile.y,TYPE.VILLAGER);
 if(!spouse)return {ok:false,reason:"entity-capacity"};
 spouse.personId=spouse.id;
 spouse.isRoyalFamily=true;
 spouse.civicOrigin="foreign-marriage";
 spouse.home={...(king.home||{x:king.x,y:king.y})};
 spouse.anchor={...spouse.home};

 const year=Math.max(1,Number(state.year)||1);
 const person=ensurePersonProfile(spouse,{role:"royal-consort",species:candidate.species});
 person.name=candidate.name;
 const nameParts=candidate.name.split(" ");
 person.firstName=nameParts.length>2?nameParts[nameParts.length-2]:nameParts[0];
 person.familyName=candidate.house.replace(/^House\s+/,"");
 person.species=candidate.species;
 person.sex=candidate.sex;
 person.ageYears=Math.max(0,Math.floor(candidate.ageYears));
 person.lifeStage=person.ageYears>=((PERSON_SPECIES[person.species]?.maturation)??16)?"adult":"young";
 person.role="royal-consort";
 person.traits={...candidate.traits};
 person.appearance=createAppearance(person.id,{species:candidate.species,sex:candidate.sex,role:"royal-consort"});
 person.skills=createSkills(person.id,person.traits);
 person.bornAtYear=Math.max(1,year-person.ageYears);
 person.lastAgedYear=year;
 person.goals=["family","security"];
 person.createdAtTick=Math.max(0,Number(state.tick)||0);

 const marriage=appointRoyalConsort(person.id);
 if(!marriage.ok){
  state.entities=state.entities.filter(entity=>entity!==spouse);
  return {ok:false,reason:marriage.reason||"royal-marriage-failed"};
 }

 state.royal.foreignMarriage={
  realmId:candidate.realmId,
  candidateId:candidate.candidateId,
  name:candidate.name,
  house:candidate.house,
  species:candidate.species,
  sex:candidate.sex,
  sinceYear:year,
  dowry:{...candidate.dowry}
 };

 for(const [resource,amount] of Object.entries(candidate.dowry)){
  const value=Math.max(0,Math.floor(Number(amount)||0));
  if(!value)continue;
  addResource(resource,value);
  if(resource==="food"){
   recordResourceMovement("food",value,"foreign-dowry",{
    from:{kind:"realm",id:candidate.realmId},
    to:{kind:"realm",id:"royal-stores"},
    key:"food:foreign-dowry:"+candidate.realmId+":"+year+":"+spouse.id
   });
  }
 }

 const diplomacy=applyForeignMarriageBond(candidate.realmId,{name:candidate.name,house:candidate.house});
 addLog("ROYAL MARRIAGE WITH "+candidate.realmName.toUpperCase(),"#d8b56a","dynasty");
 addPersonMemory(king,{
  id:"foreign-marriage:"+candidate.realmId+":"+year,
  type:"dynasty",
  text:"I married "+candidate.name+" of "+candidate.house+"; our crowns are bound to "+candidate.realmName+".",
  tick:state.tick,
  importance:96
 });
 addPersonMemory(spouse,{
  id:"foreign-marriage:"+candidate.realmId+":"+year,
  type:"dynasty",
  text:"I left "+candidate.realmName+" to marry the sovereign and joined the royal house in year "+year+".",
  tick:state.tick,
  importance:96
 });
 const history=Array.isArray(state.royal.history)?state.royal.history:[];
 history.push({year,kind:"foreign-marriage",detail:candidate.name+" of "+candidate.house+" joined the royal house."});
 state.royal.history=history.slice(-48);

 return {
  ok:true,
  message:candidate.name+" married into the royal house",
  spouse,
  candidate,
  realm:diplomacy?.realm||null,
  snapshot:getForeignMarriageSnapshot()
 };
}

