// Emergent realm issue generator. Narrative combinations are composed on demand.
import { WORLD_W,WORLD_H } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { spawnEntity,canSpawnEntity } from "../world/entities.js";
import { randInt } from "../core/utils.js";
import { EVENT_CHAINS } from "./event-chains.js";

export function addLog(text,color="#a3a3a3",kind="realm"){
 const entry={id:++state.eventSequence,text:String(text),color,tick:state.tick,kind};
 state.eventLog.unshift(entry);if(state.eventLog.length>100)state.eventLog.length=100;return entry;
}
const PLACES=["the lower fields","the eastern orchards","the old river road","the northern watch","the abbey lands","the market square"];
const STAGES=["At dawn","Before the evening bell","Beyond the old stone bridge","Under a pale sky","Near the forest edge","At the king's own table"];
const DETAILS=["a sealed letter has arrived","the village elders have sent a petition","workers report an unusual discovery","a trusted steward has raised a concern","travellers bring an unsettling rumour","the matter has reached the royal household"];
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
 ["rebellion",["Whispers of Rebellion","The Unquiet Quarter","A Banner in the Night","The Tax Collectors Turn Back","The People's Assembly"],"gold",11,24,-2,7,2]
];
const FAMILIES=FAMILY_ROWS.map(([id,titles,resource,gain,cost,prosperity,tension,mystery])=>({id,titles,resource,gain,cost,prosperity,tension,mystery}));
export const EVENT_VARIANT_COUNT=FAMILIES.length*PLACES.length*STAGES.length*DETAILS.length*5;
const pick=items=>items[randInt(0,items.length)];
function chooseFamily(){
 const hidden=state.hiddenRealm||{};
 const weights=FAMILIES.map(f=>Math.max(.25,1+
  (f.tension>0?Math.max(0,hidden.tension||0)*f.tension/80:0)+
  (f.prosperity>0?Math.max(0,hidden.prosperity||0)*f.prosperity/90:0)+
  (f.mystery>0?Math.max(0,hidden.mystery||0)*f.mystery/100:0)));
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
 if(family.id==="migration"&&canSpawnEntity(TYPE.VILLAGER)){choices[0].effects.villagers=1;choices[0].description+=" A new resident may join the realm.";}
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
 if(Object.entries(resources).some(([key,value])=>value<0&&(!Number.isFinite(state.resources[key])||state.resources[key]<-value))){
  addLog("ISSUE UNRESOLVED: NOT ENOUGH RESOURCES","#e9857b","issue");return false;
 }
 for(const [key,value] of Object.entries(resources))state.resources[key]=(state.resources[key]||0)+value;
 if(Number.isFinite(effects.morale))state.morale=Math.max(0,Math.min(100,state.morale+effects.morale));
 const hidden=state.hiddenRealm||(state.hiddenRealm={tension:0,prosperity:0,mystery:0,memories:[]});
 for(const key of ["tension","prosperity","mystery"])hidden[key]=Math.max(-30,Math.min(100,(hidden[key]||0)+(effects.hidden?.[key]||0)));
 if(effects.villagers&&canSpawnEntity(TYPE.VILLAGER)){
  const keep=state.entities.find(e=>e.type===TYPE.KEEP&&!e.dead),x=keep?.x??WORLD_W/2,y=keep?.y??WORLD_H/2;
  const arrivals=Math.min(10,Math.max(0,Math.floor(effects.villagers)));
  for(let i=0;i<arrivals&&canSpawnEntity(TYPE.VILLAGER);i++){
   const villager=spawnEntity(x+randInt(-3,4),y+randInt(-3,4),TYPE.VILLAGER);
   if(villager){villager.home={x,y};villager.anchor={x,y};villager.jobRefreshTimer=0;}
  }
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
