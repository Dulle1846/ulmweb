// Royal household, dynastic heirs and deterministic succession.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { spawnEntity,canSpawnEntity } from "../world/entities.js";
import { getHousingSnapshot,getHouseholdSnapshot } from "./population.js";
import { setPartnership,linkParentChild,getFamilySnapshot } from "./families.js";
import { ensurePersonProfile,addPersonMemory,PERSON_SPECIES } from "./people.js";
import { addLog } from "./events.js";
import { randInt } from "../core/random.js";

const BIRTH_COOLDOWN_YEARS=3;
const getId=entity=>String(entity?.personId||entity?.id||"");
const living=entity=>Boolean(entity&&!entity.dead);
function kingEntity(){return state.entities.find(entity=>living(entity)&&entity.isKing)||null;}
function findLiving(id){return state.entities.find(entity=>living(entity)&&getId(entity)===String(id))||null;}
function kinshipOf(entity){const person=ensurePersonProfile(entity,{role:entity.isKing?"king":"resident"});if(!person.kinship||typeof person.kinship!=="object")person.kinship={parents:[],children:[],partners:[]};for(const key of ["parents","children","partners"])if(!Array.isArray(person.kinship[key]))person.kinship[key]=[];return person.kinship;}
function activeMarriage(first,second){const a=kinshipOf(first).partners.find(link=>link.personId===getId(second));const b=kinshipOf(second).partners.find(link=>link.personId===getId(first));return a&&b&&a.status==="married"&&b.status==="married"?{a,b}:null;}
function familyIds(person){const kin=person?.kinship||{};return new Set([...(kin.parents||[]),...(kin.children||[]),...(kin.partners||[])].map(item=>item.personId));}
function eligibleConsort(king,candidate){
    if(!living(candidate)||candidate===king||candidate.type!==TYPE.VILLAGER||!candidate.personId)return false;
    const monarch=ensurePersonProfile(king,{role:"king"}),person=ensurePersonProfile(candidate);
    const species=PERSON_SPECIES[monarch.species];
    if(!species||person.species!==monarch.species||species.reproduction!=="paired")return false;
    if(monarch.lifeStage!=="adult"||person.lifeStage!=="adult"||monarch.sex===person.sex)return false;
    if(monarch.ageYears>species.lifespan*.65||person.ageYears>species.lifespan*.65)return false;
    const kingFamily=getFamilySnapshot(getId(king));
    const candidateFamily=getFamilySnapshot(getId(candidate));
    const relatedIds=family=>new Set([...(family?.parents||[]),...(family?.children||[]),...(family?.siblings||[]),...(family?.partners||[])].map(link=>link.personId));
    if(relatedIds(kingFamily).has(getId(candidate))||relatedIds(candidateFamily).has(getId(king)))return false;
    const links=kinshipOf(candidate).partners;
    if(links.some(link=>["partner","married"].includes(link.status)))return false;
    return true;
}
export function getRoyalHouseholdSnapshot(){
    const king=kingEntity();
    if(!king)return {king:null,consorts:[],children:[],candidates:[],succession:{status:"vacant",description:"The throne is vacant. The realm has no active monarch."}};
    const person=ensurePersonProfile(king,{role:"king"}),kin=kinshipOf(king);
    const consorts=kin.partners.filter(link=>link.status==="married").map(link=>{
        const entity=findLiving(link.personId);return entity?{personId:link.personId,person:ensurePersonProfile(entity),status:link.status}:null;
    }).filter(Boolean);
    const children=kin.children.map(link=>{
        const entity=findLiving(link.personId);
        if(entity)return {personId:link.personId,person:ensurePersonProfile(entity),living:true,entity};
        const memorial=(state.personArchive||[]).find(item=>item.personId===link.personId);
        return memorial?{personId:link.personId,person:memorial.person,living:false,deathYear:memorial.deathYear}:null;
    }).filter(Boolean).sort((a,b)=>(Number(a.person.bornAtYear)||0)-(Number(b.person.bornAtYear)||0)||a.personId.localeCompare(b.personId));
    const eligibleChildren=children.filter(item=>item.living);
    const heir=eligibleChildren[0]||null;
    const regency=state.royalDynasty?.regency||null;
    const succession=heir?{
        status:regency?"regency":heir.person.lifeStage==="adult"?"heir-designate":"minor-heir",
        heirId:heir.personId,
        description:regency?"A regency is active until the designated heir reaches the species-specific age of maturity.":heir.person.lifeStage==="adult"?"The eldest living direct descendant is the designated heir.":"The eldest living descendant is still a minor; a regency is required if the throne becomes vacant."
    }:{status:"no-heir",description:"No living direct descendant is recorded. The succession would require a council settlement."};
    const candidates=state.entities.filter(entity=>eligibleConsort(king,entity)).map(entity=>({personId:getId(entity),person:ensurePersonProfile(entity)})).sort((a,b)=>a.person.name.localeCompare(b.person.name)).slice(0,50);
    return {king:{personId:getId(king),person},consorts,children,candidates,succession};
}
export function arrangeRoyalMarriage(consortId){
    const king=kingEntity(),candidate=findLiving(consortId);
    if(!king)return {ok:false,reason:"no-reigning-monarch"};
    if(!candidate||!eligibleConsort(king,candidate))return {ok:false,reason:"ineligible-consort"};
    const result=setPartnership(getId(king),getId(candidate),{status:"married",sinceYear:state.year});
    if(!result.ok)return result;
    const kingPerson=ensurePersonProfile(king,{role:"king"}),consortPerson=ensurePersonProfile(candidate);
    consortPerson.role="royal-consort";
    addPersonMemory(king,{id:"royal-marriage:"+getId(candidate)+":"+state.year,type:"dynasty",text:"I married "+consortPerson.name+" in year "+state.year+" to unite our households.",tick:state.tick,importance:90});
    addPersonMemory(candidate,{id:"royal-marriage:"+getId(king)+":"+state.year,type:"dynasty",text:"I married "+kingPerson.name+" and joined the royal household in year "+state.year+".",tick:state.tick,importance:90});
    addLog("ROYAL MARRIAGE: "+kingPerson.name+" & "+consortPerson.name,"#e4bd72","dynasty");
    return {ok:true,king:kingPerson.name,consort:consortPerson.name};
}
export function createRoyalHeir(consortId){
    const king=kingEntity(),consort=findLiving(consortId);
    if(!king||!consort)return {ok:false,reason:"royal-household-not-found"};
    const marriage=activeMarriage(king,consort);
    if(!marriage)return {ok:false,reason:"royal-marriage-required"};
    const kingPerson=ensurePersonProfile(king,{role:"king"}),consortPerson=ensurePersonProfile(consort);
    const species=PERSON_SPECIES[kingPerson.species];
    if(!species||kingPerson.species!==consortPerson.species||kingPerson.sex===consortPerson.sex||species.reproduction!=="paired")return {ok:false,reason:"incompatible-royal-pair"};
    if(kingPerson.lifeStage!=="adult"||consortPerson.lifeStage!=="adult"||kingPerson.ageYears>species.lifespan*.65||consortPerson.ageYears>species.lifespan*.65)return {ok:false,reason:"outside-reproductive-life-stage"};
    const dynasty=state.royalDynasty||(state.royalDynasty={lastBirthYear:0,regency:null,history:[]});
    if(dynasty.lastBirthYear>0&&state.year-dynasty.lastBirthYear<BIRTH_COOLDOWN_YEARS)return {ok:false,reason:"royal-birth-cooldown"};
    const housing=getHousingSnapshot(),home=getHouseholdSnapshot().homes.filter(item=>item.residents<item.capacity).sort((a,b)=>a.residents-b.residents||a.y-b.y||a.x-b.x)[0];
    if(!home||Number(state.resources.food||0)<housing.population*.75||state.morale<55)return {ok:false,reason:"realm-needs-food-morale-and-housing"};
    if(!canSpawnEntity(TYPE.VILLAGER))return {ok:false,reason:"entity-capacity"};
    const child=spawnEntity(home.x+randInt(-1,2,"births"),home.y+randInt(-1,2,"births"),TYPE.VILLAGER);
    if(!child)return {ok:false,reason:"entity-capacity"};
    child.home={x:home.x,y:home.y};child.anchor={x:home.x,y:home.y};child.householdId="house:"+home.x+":"+home.y;child.jobRefreshTimer=0;
    const childPerson=ensurePersonProfile(child);
    childPerson.species=kingPerson.species;childPerson.ageYears=0;childPerson.lifeStage="young";childPerson.familyName=kingPerson.familyName||consortPerson.familyName;childPerson.name=childPerson.firstName+" "+childPerson.familyName;childPerson.role="royal-heir";childPerson.goals=["family","security","recognition"];childPerson.bornAtYear=state.year;childPerson.lastAgedYear=state.year;
    const links=[linkParentChild(getId(king),getId(child)),linkParentChild(getId(consort),getId(child))];
    if(links.some(link=>!link.ok)){state.entities=state.entities.filter(entity=>entity!==child);return {ok:false,reason:"royal-kinship-link-failed"};}
    const tick=Math.max(0,Math.floor(Number(state.tick)||0));
    addPersonMemory(king,{id:"royal-birth:"+child.personId+":king",type:"dynasty",text:"My heir "+childPerson.name+" was born in year "+state.year+".",tick,importance:100});
    addPersonMemory(consort,{id:"royal-birth:"+child.personId+":consort",type:"dynasty",text:"Our royal child "+childPerson.name+" was born in year "+state.year+".",tick,importance:100});
    addPersonMemory(child,{id:"royal-birth:"+child.personId+":origin",type:"birth",text:"I was born into the royal house in year "+state.year+".",tick,importance:100});
    const persistedMarriage=activeMarriage(king,consort);
    if(persistedMarriage){persistedMarriage.a.lastBirthYear=state.year;persistedMarriage.b.lastBirthYear=state.year;}
    dynasty.lastBirthYear=state.year;
    dynasty.history=Array.isArray(dynasty.history)?dynasty.history:[];
    dynasty.history.push({type:"birth",personId:child.personId,year:state.year,tick});
    if(dynasty.history.length>100)dynasty.history.splice(0,dynasty.history.length-100);
    addLog("A ROYAL HEIR IS BORN: "+childPerson.name,"#f0d17e","dynasty");
    return {ok:true,child,person:childPerson};
}
function livingDescendants(monarch){
    const kin=kinshipOf(monarch);
    return kin.children.map(link=>findLiving(link.personId)).filter(Boolean).map(entity=>({entity,person:ensurePersonProfile(entity)})).sort((a,b)=>(Number(a.person.bornAtYear)||0)-(Number(b.person.bornAtYear)||0)||getId(a.entity).localeCompare(getId(b.entity)));
}
export function updateRoyalSuccession(){
    const dynasty=state.royalDynasty||(state.royalDynasty={lastBirthYear:0,regency:null,history:[]});
    const current=kingEntity();
    if(!current&&dynasty.regency?.regentId){
        const protectedHeir=findLiving(dynasty.regency.heirId);
        if(protectedHeir){
            const heirPerson=ensurePersonProfile(protectedHeir);
            protectedHeir.isKing=true;
            heirPerson.role="king";
            dynasty.regency={heirId:getId(protectedHeir),regentId:null,sinceYear:dynasty.regency.sinceYear||state.year};
            addLog("THE REGENCY ENDS AFTER THE REGENT'S DEATH; THE COUNCIL PROTECTS "+heirPerson.name,"#e4bd72","succession");
            dynasty.history=Array.isArray(dynasty.history)?dynasty.history:[];
            dynasty.history.push({type:"regent-death",personId:getId(protectedHeir),year:state.year,tick:state.tick});
            if(dynasty.history.length>100)dynasty.history.splice(0,dynasty.history.length-100);
            return {type:"regent-death",personId:getId(protectedHeir),regency:dynasty.regency};
        }
    }
    if(current&&dynasty.regency){
        const heir=findLiving(dynasty.regency.heirId);
        if(heir){
            const heirPerson=ensurePersonProfile(heir);
            if(heirPerson.lifeStage==="adult"){
                current.isKing=false;heir.isKing=true;heirPerson.role="king";dynasty.regency=null;
                addPersonMemory(heir,{id:"succession:coming-of-age:"+getId(heir)+":"+state.year,type:"succession",text:"I assumed full royal authority after reaching adulthood in year "+state.year+".",tick:state.tick,importance:100});
                addLog("THE HEIR ASSUMES THE CROWN: "+heirPerson.name,"#f0d17e","succession");
                dynasty.history.push({type:"majority",personId:getId(heir),year:state.year,tick:state.tick});
                return {type:"majority",personId:getId(heir)};
            }
        }
        return null;
    }
    if(current)return null;
    const deceasedKing=[...(state.personArchive||[])].reverse().find(item=>item.isKing);
    if(!deceasedKing)return null;
    const descendants=livingDescendants({personId:deceasedKing.personId,person:deceasedKing.person});
    const heir=descendants[0];
    if(!heir)return {type:"vacant",reason:"no-living-descendant"};
    const species=PERSON_SPECIES[heir.person.species],adult=heir.person.ageYears>=(species?.maturation??16);
    const spouseLink=(deceasedKing.person.kinship?.partners||[]).find(link=>link.status==="married");
    const regent=spouseLink?findLiving(spouseLink.personId):null;
    if(adult){
        heir.entity.isKing=true;heir.person.role="king";
        dynasty.regency=null;
        addLog("THE CROWN PASSES TO "+heir.person.name,"#f0d17e","succession");
    }else if(regent){
        regent.isKing=true;ensurePersonProfile(regent).role="queen-regent";
        dynasty.regency={heirId:getId(heir.entity),regentId:getId(regent),sinceYear:state.year};
        addLog("REGENCY ESTABLISHED FOR THE MINOR HEIR "+heir.person.name,"#e4bd72","succession");
    }else{
        heir.entity.isKing=true;heir.person.role="king";
        dynasty.regency={heirId:getId(heir.entity),regentId:null,sinceYear:state.year};
        addLog("THE COUNCIL GOVERNS UNTIL "+heir.person.name+" COMES OF AGE","#e4bd72","succession");
    }
    dynasty.history=Array.isArray(dynasty.history)?dynasty.history:[];
    dynasty.history.push({type:"succession",personId:getId(heir.entity),year:state.year,tick:state.tick,regentId:dynasty.regency?.regentId||null});
    if(dynasty.history.length>100)dynasty.history.splice(0,dynasty.history.length-100);
    return {type:"succession",personId:getId(heir.entity),regency:dynasty.regency};
}
