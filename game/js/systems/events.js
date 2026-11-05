// Emergent realm issue generator. Narrative combinations are composed on demand.
import { WORLD_W,WORLD_H } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { spawnEntity,canSpawnEntity } from "../world/entities.js";
import { randInt } from "../core/utils.js";
import { EVENT_CHAINS } from "./event-chains.js";
import { getWorkforceSnapshot } from "./economy.js";
import { canAccommodateVillagers,normalizeHouseholdAssignments } from "./population.js";
import { createCardForCategory } from "./card-catalog.js";
import { applyPoliticalEffects,getPoliticalSnapshot } from "./politics.js";
import { applyHealthEffects } from "./health.js";

export function addLog(text,color="#a3a3a3",kind="realm"){
 const entry={id:++state.eventSequence,text:String(text),color,tick:state.tick,kind};
 state.eventLog.unshift(entry);if(state.eventLog.length>100)state.eventLog.length=100;return entry;
}
const PLACES=["the lower fields","the eastern orchards","the old river road","the northern watch","the abbey lands","the market square","the western marshes","the old quarry road","the royal granaries","the border villages"];
const STAGES=["At dawn","Before the evening bell","Beyond the old stone bridge","Under a pale sky","Near the forest edge","At the king's own table","As the harvest moon rises","During the first winter frost","After the midnight watch","At the opening of the spring fair"];
const DETAILS=["a sealed letter has arrived","the village elders have sent a petition","workers report an unusual discovery","a trusted steward has raised a concern","travellers bring an unsettling rumour","the matter has reached the royal household","a long-forgotten record has resurfaced","a guild has refused its customary duty","an unfamiliar banner has been sighted","a strange pattern has appeared in the old accounts"];
const FAMILY_ROWS=[
 ["harvest",["A Bountiful Harvest","The Fields Sing","The Granaries Overflow","The Reapers' Fortune","The Harvest Moon Rises"],"food",34,10,4,-2,0],
 ["shortage",["A Sudden Shortage","The Stores Run Thin","A Hard Winter Approaches","The Empty Cart","The Quartermaster's Alarm"],"wood",26,12,-2,3,0],
 ["discovery",["A Hidden Discovery","The Earth Gives Up a Secret","A Glint Beneath the Hill","The Lost Survey","A Door in the Rock"],"gold",27,12,2,1,5],
 ["caravan",["A Caravan at the Gate","The Road Brings Fortune","Foreign Banners","A Merchant's Proposal","The Long Road Home"],"gold",24,9,3,-1,0],
 ["illness",["A Fever in the Quarter","The Healers' Bell","An Unwelcome Sickness","The Pale Cough","A Night of Lanterns"],"food",16,18,-2,5,0],
 ["bandits",["Bandits on the Road","A Broken King's Peace","The Red Sashes","A Missing Toll Cart","Smoke on the Frontier"],"stone",14,22,-1,6,0],
 ["festival",["The Lantern Festival","A Day of Merriment","The Midsummer Revel","Bells Across the Valley","A Feast for the People"],"food",12,9,1,-3,0],
 ["migration",["Strangers at the Gate","A Family Seeks Shelter","The Road-weary Company","New Fires on the Hill","A Village Without a Home"],"food",18,12,3,1,0],
 ["storm",["A Fierce Storm","The Sky Turns Black","Rain on the King's Road","A Wind from the Mountains","The Broken Weathervane"],"wood",17,14,-1,3,0],
 ["feud",["A Feud Between Houses","Two Banners at Dawn","An Old Grudge Returns","The Broken Oath","A Dispute at Court"],"gold",20,13,-1,4,0],
 ["faith",["A Pilgrim's Arrival","The Bells of the Abbey","A Relic on the Road","The Hermit's Warning","A Procession in the Rain"],"food",15,8,1,-2,2],
 ["wildlife",["The Animals Draw Near","Tracks in the Snow","A Herd in the Orchard","The Wolves at Dusk","The Stag with Silver Antlers"],"food",16,10,1,2,2],
 ["craft",["A Masterwork Offered","The Guild's New Invention","A Craftsman's Challenge","The Forge Burns Late","A Wonder of Wood and Iron"],"stone",20,11,2,-1,1],
 ["diplomacy",["An Envoy from Afar","A Foreign Banner","A Message in Green Wax","A Wedding Proposal","A Treaty on the Table"],"gold",22,12,2,-2,0],
 ["ruins",["The Ruins Remember","A Door Beneath the Earth","The Lost Hall","Whispers from the Deep","A Map Without a Name"],"gold",26,15,0,1,6],
 ["crime",["A Theft in the Night","The Missing Ledger","A Shadow in the Market","The Silent Watchman","A Crime Without Witnesses"],"gold",13,12,-1,4,1],
 ["omens",["An Omen in the Heavens","The Raven's Strange Cry","A Star Falls Eastward","The Bells at Midnight","The Dream of the Old King"],"gold",18,9,0,2,7],
 ["fishing",["A Silver Run of Fish","The River Gives Its Bounty","A New Fishing Ground","The Empty Nets Return Full","A Strange Tide"],"food",26,10,3,-1,0],
 ["winter",["The First Frost","A Long Winter's Warning","Snow at the Pass","The Frozen Well","A Cold Wind from the North"],"wood",22,14,-1,3,0],
 ["succession",["A Question of Inheritance","The Heir's Quiet Request","A Seal Without a Name","The Empty Chair","A Noble's Last Testament"],"gold",16,10,0,5,0],
 ["pilgrimage",["The Pilgrim Road Fills","A Thousand Footsteps","The Travellers' Blessing","A Long Procession","The Wayfarers' Camp"],"food",17,8,1,-1,1],
 ["fire",["A Fire in the Ward","Smoke Above the Rooftops","The Bell of Alarm","A Night of Sparks","The Burning Storehouse"],"wood",12,16,-2,5,0],
 ["invention",["A Curious Invention","The Clockwork Bird","A New Kind of Mill","The Alchemist's Engine","The Scholar's Contraption"],"stone",23,14,2,0,3],
 ["rebellion",["Whispers of Rebellion","The Unquiet Quarter","A Banner in the Night","The Tax Collectors Turn Back","The People's Assembly"],"gold",11,24,-2,7,2],
 ["guild",["The Guilds Demand a Charter","A Masterwork Dispute","The Hall of Weavers","The Blacksmiths' Petition","A Guild Without a Master"],"wood",20,12,2,3,0],
 ["flood",["The River Breaks Its Banks","Water in the Lower Ward","The Drowned Causeway","A Bridge Swept Away","The Great Thaw"],"wood",16,18,-2,4,1],
 ["plague",["The Red Fever","A Sickness Behind Closed Doors","The Healers' Vigil","A Strange Rash","The Bells of Quarantine"],"food",14,20,-2,6,2],
 ["taxation",["The King's Levy","A Disputed Tithe","The Collector's Return","A Village Refuses Payment","The Royal Assessment"],"gold",19,13,-1,5,0],
 ["monster",["A Beast Beyond the Palisade","The Tracks of a Giant","A Shadow on the Ridge","The Shepherd's Warning","The Thing in the Old Mine"],"stone",17,15,-1,4,5],
 ["border",["A Disputed Boundary","The Watchfires Answer","Riders at the Frontier","A Missing Boundary Stone","The Unmarked Road"],"wood",18,14,0,5,2]
];
const FAMILIES=FAMILY_ROWS.map(([id,titles,resource,gain,cost,prosperity,tension,mystery])=>({id,titles,resource,gain,cost,prosperity,tension,mystery}));
const CARD_REWARDS=Object.freeze({
 discovery:"gold-mines",caravan:"merchant-stalls",craft:"blacksmiths",faith:"reliquaries",
 wildlife:"deer",fishing:"river-weirs",invention:"clockmakers",diplomacy:"embassies",
 ruins:"forgotten-tombs",guild:"guildhalls",monster:"griffins",border:"border-rangers"
});
const POLITICAL_EVENT_EFFECTS=Object.freeze({
 harvest:{legitimacy:1,commons:1},shortage:{legitimacy:-1,commons:-2},discovery:{legitimacy:1,nobility:1},
 caravan:{legitimacy:1,guilds:2},illness:{legitimacy:-1,clergy:1,commons:-1},bandits:{legitimacy:-1,nobility:-1},
 festival:{legitimacy:1,commons:2},migration:{commons:1,nobility:-1},storm:{commons:-1,nobility:-1},
 feud:{nobility:-2,legitimacy:-1},faith:{clergy:2,commons:1},wildlife:{commons:1},
 craft:{guilds:2,legitimacy:1},diplomacy:{nobility:1,guilds:1},ruins:{nobility:1,clergy:1},
 crime:{guilds:-2,legitimacy:-1},omens:{clergy:2},fishing:{commons:1,guilds:1},winter:{commons:-1},
 succession:{nobility:-2,legitimacy:-2},pilgrimage:{clergy:2,commons:1},fire:{commons:-1,nobility:-1},
 invention:{guilds:2,legitimacy:1},rebellion:{commons:-3,legitimacy:-2},guild:{guilds:-2,legitimacy:-1},
 flood:{commons:-2,nobility:-1},plague:{commons:-2,clergy:1,legitimacy:-2},taxation:{commons:-2,legitimacy:-1},
 monster:{nobility:-1,commons:-1},border:{nobility:1,legitimacy:1}
});
export const EVENT_VARIANT_COUNT=FAMILIES.length*PLACES.length*STAGES.length*DETAILS.length*5;
const pick=items=>items[randInt(0,items.length)];
function chooseFamily(){
 const hidden=state.hiddenRealm||{},workforce=getWorkforceSnapshot(),politics=getPoliticalSnapshot();
 const food=Math.max(0,state.resources.food||0);
 const foodShortage=Math.max(0,state.economy?.lastLedger?.foodShortage||0);
 const unpaidCosts=Math.max(0,(state.economy?.lastLedger?.unpaidWages||0)+(state.economy?.lastLedger?.unpaidUpkeep||0));
 const weights=FAMILIES.map(f=>{
  let situational=0;
  if(f.id==="shortage")situational+=(food<Math.max(20,workforce.population*2)?3:0)+foodShortage*0.4;
  if(f.id==="harvest")situational+=food<35&&workforce.employed>0?1.2:0;
  if(f.id==="migration")situational+=Math.min(3,workforce.unemployed*0.35);
  if(f.id==="rebellion")situational+=Math.min(5,unpaidCosts*1.5+Math.max(0,hidden.tension||0)*0.08);
  if(f.id==="illness")situational+=workforce.population>25?1.2:0;
  if(f.id==="caravan")situational+=Math.max(0,hidden.prosperity||0)*0.025;
  if(f.id==="rebellion")situational+=Math.max(0,50-politics.factions.commons)*0.1;
  if(f.id==="guild")situational+=Math.max(0,50-politics.factions.guilds)*0.1;
  if(f.id==="faith")situational+=Math.max(0,50-politics.factions.clergy)*0.08;
  if(f.id==="succession")situational+=Math.max(0,50-politics.factions.nobility)*0.08;
  if(f.id==="taxation")situational+=Math.max(0,55-politics.legitimacy)*0.06;
  const baseWeight=1+
   (f.tension>0?Math.max(0,hidden.tension||0)*f.tension/80:0)+
   (f.prosperity>0?Math.max(0,hidden.prosperity||0)*f.prosperity/90:0)+
   (f.mystery>0?Math.max(0,hidden.mystery||0)*f.mystery/100:0)+situational;
  const recentCount=(Array.isArray(hidden.memories)?hidden.memories.slice(0,8):[])
   .filter(memory=>memory.family===f.id).length;
  // The realm remembers what just happened: repeated families become less likely,
  // while their long-term tension/prosperity/mystery still influence future stories.
  return Math.max(.15,baseWeight/(1+recentCount*.65));
 });
 let roll=Math.random()*weights.reduce((a,b)=>a+b,0);
 for(let i=0;i<FAMILIES.length;i++){roll-=weights[i];if(roll<=0)return FAMILIES[i];}
 return FAMILIES[FAMILIES.length-1];
}
export function triggerRandomEvent(){
 if(state.activeEvent)return null;
 const family=chooseFamily(),place=pick(PLACES),stage=pick(STAGES),detail=pick(DETAILS);
 const title=pick(family.titles)+" — "+place;
 const description=stage+", "+detail+". The royal household must decide what is to be done.";
 const gain=Math.max(6,family.gain+randInt(-4,12)),cost=Math.max(4,family.cost+randInt(-3,7));
 const secondary=family.resource==="food"?"wood":family.resource==="wood"?"food":"stone";
 const morale=randInt(-3,5);
 const choices=[
  {label:pick(["Act in the crown's name","Offer royal patronage","Gather the council","Spend from the royal purse"]),description:"Gain "+gain+" "+family.resource.toUpperCase()+"; morale "+(morale>=0?"+":"")+morale+".",effects:{resources:{[family.resource]:gain},morale,hidden:{tension:family.tension,prosperity:family.prosperity,mystery:family.mystery}}},
  {label:pick(["Leave the matter to the local guilds","Choose the cautious course","Demand a public accounting","Let the old custom stand"]),description:"Spend "+cost+" "+secondary.toUpperCase()+" and take a different path.",effects:{resources:{[secondary]:-cost,[family.resource]:Math.max(3,Math.floor(gain*.35))},morale:randInt(-3,3),hidden:{tension:-family.tension*.35,prosperity:1,mystery:family.mystery?1:0}}}
 ];
 if(family.id==="illness"||family.id==="plague"){
  const severe=family.id==="plague";
  choices[0].label=severe?"Fund the healers and establish quarantine":"Isolate the sick and fund the healers";
  choices[0].description="Spend "+(severe?14:8)+" gold on treatment and containment.";
  choices[0].effects.resources={gold:-(severe?14:8)};
  choices[0].effects.health={outbreak:true,severity:severe?2:1,containment:2,disease:severe?"red-fever":"common-fever"};
  choices[1].label=severe?"Keep the gates open":"Delay costly intervention";
  choices[1].description="Preserve the treasury for now, but allow the illness to spread.";
  choices[1].effects.health={outbreak:true,severity:severe?3:2,containment:0,disease:severe?"red-fever":"common-fever"};
 }
 if(family.id==="migration"&&canSpawnEntity(TYPE.VILLAGER)&&canAccommodateVillagers(1)){choices[0].effects.villagers=1;choices[0].description+=" A new resident may join the realm.";}
 const cardReward=CARD_REWARDS[family.id];
 if(cardReward){choices[0].effects.cardReward=cardReward;choices[0].description+=" The crown may also secure a related card for its next draw.";}
 const politicalImpact=POLITICAL_EVENT_EFFECTS[family.id];
 if(politicalImpact){
  choices[0].effects.politics={...politicalImpact};
  choices[1].effects.politics=Object.fromEntries(Object.entries(politicalImpact).map(([key,value])=>[key,-value*0.45]));
 }
 state.activeEvent={id:"issue-"+(++state.issueSequence),family:family.id,title,description,icon:family.id,createdAtTick:state.tick,threadStart:EVENT_CHAINS[family.id]?family.id:null,choices};
 addLog("ISSUE: "+title,"#e4bd72","issue");return state.activeEvent;
}
function triggerThreadEvent(thread){
 const stages=EVENT_CHAINS[thread.id],stage=stages?.[thread.stage];
 if(!stage)return false;
 state.activeEvent={
  id:"thread-"+thread.id+"-"+thread.stage+"-"+(++state.issueSequence),
  family:"chronicle",title:stage.title,description:stage.description,
  icon:"chronicle",createdAtTick:state.tick,
  thread:{id:thread.id,stage:thread.stage},
  choices:stage.choices.map(choice=>({...choice,effects:{...(choice.effects||{}),resources:{...(choice.effects?.resources||{})},hidden:{...(choice.effects?.hidden||{})}}}))
 };
 addLog("CHRONICLE: "+stage.title,"#c5a66b","chronicle");
 return true;
}
export function resolveEventChoice(index){
 const issue=state.activeEvent;if(!issue)return false;
 const choice=issue.choices[index];if(!choice)return false;
 const effects=choice.effects||{},resources=effects.resources||{};
 const arrivals=Math.min(10,Math.max(0,Math.floor(Number(effects.villagers)||0)));
 let rewardCard=null;
 if(typeof effects.cardReward==="string"){
  try{rewardCard=createCardForCategory(effects.cardReward);}catch{return false;}
 }
 if(arrivals>0&&(!canAccommodateVillagers(arrivals)||!canSpawnEntity(TYPE.VILLAGER,arrivals))){
  addLog("ISSUE UNRESOLVED: NOT ENOUGH HOUSING OR REALM CAPACITY","#e9857b","issue");return false;
 }
 if(Object.entries(resources).some(([key,value])=>value<0&&(!Number.isFinite(state.resources[key])||state.resources[key]<-value))){
  addLog("ISSUE UNRESOLVED: NOT ENOUGH RESOURCES","#e9857b","issue");return false;
 }
 for(const [key,value] of Object.entries(resources))state.resources[key]=(state.resources[key]||0)+value;
 if(rewardCard){
  state.cardRewardQueue=Array.isArray(state.cardRewardQueue)?state.cardRewardQueue:[];
  if(state.cardRewardQueue.length<12){
   state.cardRewardQueue.push(rewardCard);
   addLog("A CARD HAS BEEN SECURED: "+rewardCard.categoryName.toUpperCase(),"#e4bd72","card");
  }else addLog("THE CARD ARCHIVE IS FULL — THE REWARD WAS NOT STORED","#e9857b","card");
 }
 if(effects.politics&&typeof effects.politics==="object")applyPoliticalEffects(effects.politics);
 if(effects.health&&typeof effects.health==="object"){
  const health=applyHealthEffects(effects.health);
  if(effects.health.outbreak)addLog("HEALTH CRISIS: "+health.disease.toUpperCase()+" · "+health.sick+" RESIDENT(S) ILL","#e9857b","health");
 }
 if(Number.isFinite(effects.morale))state.morale=Math.max(0,Math.min(100,state.morale+effects.morale));
 const hidden=state.hiddenRealm||(state.hiddenRealm={tension:0,prosperity:0,mystery:0,memories:[]});
 for(const key of ["tension","prosperity","mystery"])hidden[key]=Math.max(-30,Math.min(100,(hidden[key]||0)+(effects.hidden?.[key]||0)));
 if(arrivals>0){
  const keep=state.entities.find(e=>e.type===TYPE.KEEP&&!e.dead),x=keep?.x??WORLD_W/2,y=keep?.y??WORLD_H/2;
  for(let i=0;i<arrivals;i++){
   const villager=spawnEntity(x+randInt(-3,4),y+randInt(-3,4),TYPE.VILLAGER);
   if(villager){villager.home={x,y};villager.anchor={x,y};villager.lastAgedYear=state.year;villager.jobRefreshTimer=0;}
  }
  normalizeHouseholdAssignments();
 }
 hidden.memories=Array.isArray(hidden.memories)?hidden.memories:[];
 hidden.memories.unshift({family:issue.family,choice:choice.label,tick:state.tick});
 if(hidden.memories.length>24)hidden.memories.length=24;
 hidden.activeThreads=Array.isArray(hidden.activeThreads)?hidden.activeThreads:[];
 hidden.completedThreads=Array.isArray(hidden.completedThreads)?hidden.completedThreads:[];
 if(issue.threadStart&&Math.random()<0.5&&!hidden.activeThreads.some(thread=>thread.id===issue.threadStart)){
  hidden.activeThreads.push({id:issue.threadStart,stage:0,startedAtTick:state.tick,nextAtTick:state.tick+130+randInt(0,90)});
  addLog("A LONGER STORY BEGINS: "+issue.threadStart.toUpperCase(),"#c5a66b","chronicle");
 }
 if(issue.thread){
  const thread=hidden.activeThreads.find(item=>item.id===issue.thread.id);
  if(thread){
   if(thread.stage+1<EVENT_CHAINS[thread.id].length){
    thread.stage++;thread.nextAtTick=state.tick+130+randInt(0,90);
    addLog("THE CHRONICLE CONTINUES: "+thread.id.toUpperCase(),"#c5a66b","chronicle");
   }else{
    hidden.activeThreads=hidden.activeThreads.filter(item=>item!==thread);
    hidden.completedThreads.unshift({id:thread.id,completedAtTick:state.tick,finalChoice:choice.label});
    if(hidden.completedThreads.length>20)hidden.completedThreads.length=20;
    addLog("CHRONICLE CONCLUDED: "+thread.id.toUpperCase(),"#c5a66b","chronicle");
   }
  }
 }
 addLog(issue.title.toUpperCase()+": "+choice.label,"#a5d6a7","resolution");
 state.statistics.totalEventsResolved++;state.activeEvent=null;return true;
}
export function checkRandomEvents(){
 if(state.activeEvent)return;
 const hidden=state.hiddenRealm||(state.hiddenRealm={tension:0,prosperity:0,mystery:0,memories:[]});
 hidden.activeThreads=Array.isArray(hidden.activeThreads)?hidden.activeThreads:[];
 const readyThread=hidden.activeThreads.filter(thread=>state.tick>=thread.nextAtTick)
  .sort((a,b)=>a.nextAtTick-b.nextAtTick)[0];
 if(readyThread){if(!triggerThreadEvent(readyThread))hidden.activeThreads=hidden.activeThreads.filter(thread=>thread!==readyThread);return;}
 if(!Number.isFinite(state.nextIssueAtTick)||state.nextIssueAtTick<=0)state.nextIssueAtTick=state.tick+145+randInt(0,95);
 if(state.tick<state.nextIssueAtTick)return;
 state.nextIssueAtTick=state.tick+220+randInt(0,520);
 if(Math.random()<.82)triggerRandomEvent();
}
