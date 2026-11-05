// Strategy management command deck: government, politics, royal decisions, cards and economy.
import { state } from "../core/state.js";
import { getGovernmentSnapshot, GOVERNMENT_FORMS, GOVERNMENT_POLICIES, setGovernmentForm, enactPolicy } from "../systems/government.js";
import { getPoliticalSnapshot } from "../systems/politics.js";
import { getRoyalHouse, appointRoyalConsort, createRoyalChild, designateHeir } from "../systems/royal-dynasty.js";
import { getFamilySnapshot } from "../systems/families.js";
import { BUILDING_WORKFORCE, getBuildingEfficiency, getWorkforceSnapshot } from "../systems/economy.js";
import { BUILDING_SIZE } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { CARD_DECK } from "../systems/cards.js";
import { getResourceNodeAt } from "../systems/resource-geography.js";
import { renderUI } from "./rendering/ui.js";
import { getHousingSnapshot, getHouseholdSnapshot } from "../systems/population.js";
import { getCreatureSnapshot, summonDragon } from "../systems/creatures.js";
let activePanel="kingdom";
const $=id=>document.getElementById(id),esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=value=>Math.floor(Number(value)||0).toLocaleString("en-US");
const amount=value=>Number(value||0).toLocaleString("en-US",{maximumFractionDigits:2});
const BUILDING_LABELS=Object.freeze({
 [TYPE.KEEP]:"Royal Keep",[TYPE.HOUSE]:"House",[TYPE.FARM]:"Farm",[TYPE.LUMBER]:"Lumber Yard",
 [TYPE.QUARRY]:"Quarry",[TYPE.TOWER]:"Watchtower",[TYPE.WALL]:"Defensive Wall",[TYPE.TAVERN]:"Tavern",
 [TYPE.TEMPLE]:"Temple",[TYPE.BARRACKS]:"Barracks",[TYPE.MILL]:"Mill",[TYPE.STABLE]:"Stables",
 [TYPE.WONDER]:"Wonder",[TYPE.GOLDMINE]:"Gold Mine",[TYPE.BARREL]:"Storage Barrel"
});
function setNavigationActive(target){
 document.querySelectorAll(".realm-nav-button").forEach(button=>{
  const active=button.dataset.kacPanel===target;
  button.classList.toggle("is-active",active);
  button.setAttribute("aria-pressed",String(active));
 });
}
function toast(message){const el=$("action-toast");if(!el)return;el.textContent=message;el.classList.add("is-visible");setTimeout(()=>el.classList.remove("is-visible"),1800);}
function meter(label,value){const v=Math.max(0,Math.min(100,Number(value)||0));return '<div class="command-meter"><span>'+esc(label)+'</span><i><b style="width:'+v+'%"></b></i><strong>'+Math.round(v)+'</strong></div>';}
function intro(k,t,p){return '<div class="command-panel-intro"><span>'+esc(k)+'</span><h3>'+esc(t)+'</h3><p>'+esc(p)+'</p></div>';}
function kingdom(){
 if(!state.hasStarted)return intro("THE REALM OF "+(state.kingdomName||"ELDRIA"),"Awaiting its founding","The royal ledger becomes active when a new campaign begins.")+'<div class="command-note">No campaign is running yet. Begin a new game to appoint the sovereign, populate the settlement and activate the royal ledger.</div>';
 const h=getRoyalHouse(),p=getPoliticalSnapshot(),w=getWorkforceSnapshot(),housing=getHousingSnapshot();
 const sovereign=h.king?.person?.name||"No sovereign recorded";
 const income=state.incomeThisTick||{};
 const resources=Object.entries(state.resources||{}).map(([key,value])=>'<div class="command-resource"><span>'+esc(key)+'</span><strong>'+number(value)+'</strong></div>').join("");
 const recent=(state.eventLog||[]).slice(-5).reverse().map(entry=>'<article class="command-history"><strong>REALM RECORD</strong><p>'+esc(entry.text||entry.title||entry.message||"Recorded event")+'</p></article>').join("");
 const active=state.activeEvent?'<div class="command-note"><strong>ACTIVE ISSUE</strong><br>'+esc(state.activeEvent.title||state.activeEvent.name||"A realm issue requires attention")+'</div>':'<div class="command-note">No realm-wide event is currently awaiting a decision.</div>';
 return intro("THE REALM OF "+(state.kingdomName||"ELDRIA"),"Kingdom overview","A live summary of the crown, people, treasury and stability. Figures below are read from the running simulation.")+
 '<div class="command-summary"><div><small>SOVEREIGN</small><strong>'+esc(sovereign)+'</strong></div><div><small>YEAR</small><strong>'+number(state.year)+'</strong></div><div><small>POPULATION</small><strong>'+number(housing.population)+'</strong></div><div><small>MORALE</small><strong>'+Math.round(state.morale||0)+'/100</strong></div></div>'+
 '<div class="command-section-title">THE REALM AT A GLANCE</div><div class="command-summary"><div><small>TREASURY</small><strong>'+number(state.resources?.gold)+'</strong></div><div><small>HOUSING</small><strong>'+number(housing.population)+' / '+number(housing.capacity)+'</strong></div><div><small>EMPLOYED</small><strong>'+number(w.employed)+'</strong></div><div><small>LEGITIMACY</small><strong>'+Math.round(p.legitimacy)+'/100</strong></div></div>'+
 '<div class="command-section-title">ROYAL STORES</div><div class="command-resource-grid">'+resources+'</div>'+
 '<div class="command-section-title">CURRENT PRODUCTION FLOW</div><div class="command-resource-grid">'+Object.entries(income).map(([key,value])=>'<div class="command-resource"><span>'+esc(key)+' · change</span><strong>'+(Number(value)>0?"+":"")+number(value)+'</strong></div>').join("")+'</div>'+
 '<div class="command-section-title">REALM ISSUES</div>'+active+
 '<div class="command-section-title">RECENT CHRONICLE</div><div class="command-history-list">'+(recent||'<p class="command-note">No recent realm records are available.</p>')+'</div>'+
 '<p class="command-note">Territory and capital are not displayed because the current game state does not yet provide authoritative kingdom-level values for them.</p>';
}
function government(){
 const g=getGovernmentSnapshot(),f=GOVERNMENT_FORMS[g.form],forms=Object.entries(GOVERNMENT_FORMS).map(([id,x])=>'<button class="command-choice'+(id===g.form?' is-current':'')+'" data-command="government-form" data-value="'+id+'"><strong>'+esc(x.label)+'</strong><small>Tax baseline '+x.tax+'% · Cost 20 gold</small></button>').join("");
 return intro("THE CROWN & ITS INSTITUTIONS","Government","Choose how authority is organized. Changing the constitution costs 20 gold and shifts faction support.")+'<div class="command-summary"><div><small>IN FORCE</small><strong>'+esc(f.label)+'</strong></div><div><small>TAX BASELINE</small><strong>'+g.taxRate+'%</strong></div><div><small>COUNCIL SEATS</small><strong>'+g.councilSeats+'</strong></div><div><small>DECREE COUNT</small><strong>'+g.decrees+'</strong></div></div><div class="command-section-title">CONSTITUTIONAL MODELS</div><div class="command-choice-grid">'+forms+'</div><div class="command-note">These are the first playable constitutional models. Ministries, offices, lawmaking procedure and regional autonomy remain future modules.</div>';
}
function politics(){
 const p=getPoliticalSnapshot(),f=Object.entries(p.factions).map(([k,v])=>meter(k,v)).join(""),policies=Object.entries(GOVERNMENT_POLICIES).map(([id,x])=>'<article class="command-policy"><div><strong>'+esc(x.label)+'</strong><p>'+esc(x.description)+'</p></div><button data-command="policy" data-value="'+id+'">ENACT</button></article>').join("");
 return intro("FACTIONS & PUBLIC ORDER","Politics","Legitimacy and faction support respond to decrees and the realm's material conditions.")+'<div class="command-summary"><div><small>LEGITIMACY</small><strong>'+Math.round(p.legitimacy)+'/100</strong></div><div><small>AVERAGE SUPPORT</small><strong>'+Math.round(p.averageSupport)+'/100</strong></div><div><small>DECISIONS</small><strong>'+p.settlements+'</strong></div></div><div class="command-section-title">FACTION SUPPORT</div><div class="command-meter-list">'+f+'</div><div class="command-section-title">ROYAL DECREES · ONE PER YEAR</div><div class="command-policy-list">'+policies+'</div>';
}
function decisions(){
 const h=getRoyalHouse(),children=h.children.map(p=>'<article class="command-policy"><div><strong>'+esc(p.person.name)+'</strong><p>'+esc(p.person.role)+' · age '+Math.floor(p.person.ageYears)+' · born '+(p.person.bornAtYear||"?")+'</p></div><button data-command="heir" data-value="'+esc(p.personId)+'">'+(h.heir?.personId===p.personId?"CURRENT HEIR":"DESIGNATE")+'</button></article>').join("");
 const options=h.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.person.name)+' · '+Math.floor(p.person.ageYears)+' · '+esc(p.person.species)+'</option>').join("");
 return intro("ROYAL HOUSE","Royal decisions","Dynastic actions are explicit and recorded in personal memories.")+'<img class="command-hero-art" src="assets/royal-court-art.svg" alt="Royal court, castle and heraldic banners" loading="lazy"><div class="command-summary"><div><small>SOVEREIGN</small><strong>'+esc(h.king?.person?.name||"No sovereign")+'</strong></div><div><small>CONSORT</small><strong>'+esc(h.consort?.person?.name||"None")+'</strong></div><div><small>HEIR</small><strong>'+esc(h.heir?.person?.name||"Undesignated")+'</strong></div></div>'+(h.consort?'':'<div class="command-section-title">ROYAL MARRIAGE</div><div class="command-inline"><select id="royal-consort-select"><option value="">Choose an adult resident…</option>'+options+'</select><button data-command="consort">FORM MARRIAGE</button></div>')+'<div class="command-actions"><button data-command="royal-birth" '+(!h.consort?'disabled':'')+'>WELCOME ROYAL CHILD · 20 FOOD / 15 GOLD</button></div><div class="command-section-title">LIVING ROYAL CHILDREN</div><div class="command-policy-list">'+(children||'<p class="command-note">No living royal children are recorded yet.</p>')+'</div><p class="command-note">Succession uses the designated living heir; absent one, it falls back to a living child in the late sovereign’s explicit family record. No unrelated person is silently promoted.</p>';
}
function cards(){
 const rows=(state.hand||[]).map(c=>'<article class="command-card"><span class="command-card-art">'+esc(c.icon||"✦")+'</span><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.categoryName||c.group||"Card")+' · '+esc(c.rarity||"common")+'</small><p>'+esc(c.desc||"")+'</p></div><button data-command="select-card" data-value="'+esc(c.instanceId)+'">SELECT</button></article>').join("");
 return intro("ROYAL DECK","Card management","Inspect your hand and select a card before placing it on the map.")+'<div class="command-summary"><div><small>HAND</small><strong>'+(state.hand||[]).length+' / 5</strong></div><div><small>DRAW PILE</small><strong>'+number(state.availableCards?.length)+'</strong></div><div><small>REWARDS QUEUED</small><strong>'+number(state.cardRewardQueue?.length)+'</strong></div></div><div class="command-card-list">'+(rows||'<p class="command-note">Your hand is empty. Advance the simulation to draw cards.</p>')+'</div>';
}
function economy(){
 const w=getWorkforceSnapshot(),h=getHousingSnapshot(),homes=getHouseholdSnapshot().homes||[];
 const resources=Object.entries(state.resources||{}).map(([k,v])=>'<div class="command-resource"><span>'+esc(k)+'</span><strong>'+amount(v)+'</strong></div>').join("");
 const flow=Object.entries(state.incomeThisTick||{}).map(([k,v])=>'<div class="command-resource"><span>'+esc(k)+' · this tick</span><strong class="'+(Number(v)>0?'is-positive':Number(v)<0?'is-negative':'')+'">'+(Number(v)>0?'+':'')+amount(v)+'</strong></div>').join("");
 const ledger=state.economy?.lastLedger;
 const ledgerRows=ledger?[
  ["Food demand",ledger.foodDemand,"food"],["Food consumed",ledger.foodConsumed,"food"],["Food shortage",ledger.foodShortage,"food"],
  ["Taxes collected",ledger.taxesCollected,"gold"],["Wages paid",ledger.wagesPaid,"gold"],["Building & road upkeep",ledger.upkeepPaid,"gold"],
  ["Unpaid wages",ledger.unpaidWages,"gold"],["Unpaid upkeep",ledger.unpaidUpkeep,"gold"],["Net treasury change",ledger.netGold,"gold"]
 ].map(([label,value,unit])=>'<div class="ledger-row"><span>'+esc(label)+'</span><strong>'+amount(value)+' '+unit+'</strong></div>').join(""):'<p class="command-note">No completed financial ledger yet. The simulation settles a ledger every 20 in-game days.</p>';
 const totals=state.economy||{};
 return intro("TREASURY & PRODUCTION","Realm economy","Live resource stocks, current-tick flows and the latest completed 20-day financial ledger. No forecasts are inferred.")+
 '<div class="command-summary"><div><small>POPULATION</small><strong>'+h.population+'</strong></div><div><small>HOUSING</small><strong>'+h.capacity+'</strong></div><div><small>FREE BEDS</small><strong>'+h.available+'</strong></div><div><small>EMPLOYED</small><strong>'+number(w.employed)+'</strong></div></div>'+
 '<div class="command-section-title">CURRENT ROYAL STORES · STOCK</div><div class="command-resource-grid">'+resources+'</div>'+
 '<div class="command-section-title">RESOURCE FLOW · CURRENT SIMULATION TICK</div><div class="command-resource-grid">'+flow+'</div>'+
 '<div class="command-section-title">LATEST FINANCIAL SETTLEMENT · 20 IN-GAME DAYS</div><div class="ledger-grid">'+ledgerRows+'</div>'+
 '<div class="command-section-title">CUMULATIVE LEDGER TOTALS</div><div class="command-summary"><div><small>DAYS SETTLED</small><strong>'+number(totals.daysElapsed)+'</strong></div><div><small>TAXES</small><strong>'+amount(totals.taxesCollected)+' G</strong></div><div><small>WAGES</small><strong>'+amount(totals.wagesPaid)+' G</strong></div><div><small>UPKEEP</small><strong>'+amount(totals.upkeepPaid)+' G</strong></div></div>'+
 '<div class="command-section-title">WORKFORCE & HOUSEHOLDS</div><div class="command-summary"><div><small>WORKERS</small><strong>'+number(w.population)+'</strong></div><div><small>UNEMPLOYED</small><strong>'+number(w.unemployed)+'</strong></div><div><small>BUILDINGS</small><strong>'+number(w.buildings)+'</strong></div><div><small>HOMES</small><strong>'+number(homes.length)+'</strong></div></div>'+
 '<p class="command-note">The simulation currently retains only its latest completed ledger, not a historical time series. Long-term trend charts and forecasts are intentionally withheld until real history is stored.</p>';
}
function buildings(){
 const workforce=getWorkforceSnapshot();
 const records=state.entities.filter(entity=>!entity.dead&&entity.isBuilding()).slice().sort((a,b)=>{
  const an=CARD_DECK.find(card=>card.type===a.type)?.name||BUILDING_LABELS[a.type]||String(a.type),bn=CARD_DECK.find(card=>card.type===b.type)?.name||BUILDING_LABELS[b.type]||String(b.type);
  return an.localeCompare(bn)||String(a.id).localeCompare(String(b.id));
 });
 const counts=new Map();
 for(const building of records)counts.set(building.type,(counts.get(building.type)||0)+1);
 const typeSummary=[...counts.entries()].map(([type,count])=>{
  const card=CARD_DECK.find(item=>item.type===type);
  return '<span class="building-type-chip">'+esc(card?.name||("Building "+type))+' <strong>'+count+'</strong></span>';
 }).join("");
 const buildingSprite=(type)=>({
  [TYPE.KEEP]:"keep",[TYPE.HOUSE]:"cottage",[TYPE.FARM]:"farm",[TYPE.LUMBER]:"lumber-yard",
  [TYPE.QUARRY]:"quarry",[TYPE.TOWER]:"watchtower",[TYPE.WALL]:"wall",[TYPE.TAVERN]:"tavern",
  [TYPE.TEMPLE]:"temple",[TYPE.BARRACKS]:"barracks",[TYPE.MILL]:"windmill",[TYPE.STABLE]:"stable",
  [TYPE.WONDER]:"wonder",[TYPE.GOLDMINE]:"goldmine",[TYPE.BARREL]:"storehouse"
 }[type]||"cottage");
 const rows=records.map((building,index)=>{
  const card=CARD_DECK.find(item=>item.type===building.type);
  const name=card?.name||BUILDING_LABELS[building.type]||("Building "+building.type);
  const footprint=BUILDING_SIZE[building.type]||{w:1,h:1};
  const scale=Math.max(.25,Math.min(6,Number(building.footprintScale)||1));
  const width=footprint.w*scale,height=footprint.h*scale;
  const hp=Number(building.hp)||0,maxHp=Math.max(1,Number(building.maxHp)||hp||1),condition=Math.max(0,Math.min(100,Math.round(hp/maxHp*100)));
  const capacity=BUILDING_WORKFORCE[building.type]||0,staff=workforce.workersByBuilding.get(building)||0;
  const efficiency=capacity?Math.round(getBuildingEfficiency(building,workforce)*100):null;
  const costs=Object.entries(card?.cost||{}).filter(([,value])=>Number(value)>0).map(([resource,value])=>amount(value)+" "+resource).join(" · ")||"No catalogued material cost";
  let siteNote="No dedicated resource-site indicator is defined for this building type.";
  try{
   const node=getResourceNodeAt(building.x,building.y);
   if(building.type===TYPE.LUMBER)siteNote="Forest stock at site tile: "+number(node.forestStock)+" / "+number(node.forestCapacity);
   else if(building.type===TYPE.QUARRY)siteNote="Stone stock at site tile: "+number(node.stoneStock)+" / "+number(node.stoneCapacity);
   else if(building.type===TYPE.FARM)siteNote="Site fertility: "+number(node.fertility)+" / 100 · water access: "+(node.waterAccess?"yes":"no");
  }catch{}
  const detail=card?.desc||"No additional building description is recorded in the card catalogue.";
  return '<details class="building-record" data-building-name="'+esc(name.toLowerCase())+'"><summary><svg class="building-record-art" viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-building-atlas.svg#'+buildingSprite(building.type)+'"></use></svg><span class="building-record-title"><strong>'+esc(name)+'</strong><small>'+esc(building.id||("record-"+index))+' · '+Math.round(building.x)+', '+Math.round(building.y)+'</small></span><span class="building-record-status"><b>'+condition+'%</b><small>condition</small></span></summary><div class="building-record-details"><p>'+esc(detail)+'</p><div class="building-detail-grid"><span>Footprint<strong>'+amount(width)+' × '+amount(height)+' tiles</strong></span><span>Health<strong>'+amount(hp)+' / '+amount(maxHp)+'</strong></span><span>Staff<strong>'+staff+(capacity?' / '+capacity:' · not staffed')+'</strong></span><span>Workforce efficiency<strong>'+(efficiency===null?'not applicable':efficiency+'%')+'</strong></span><span>Recorded card cost<strong>'+esc(costs)+'</strong></span><span>Site data<strong>'+esc(siteNote)+'</strong></span></div><p class="command-note">Per-building production output, storage and upkeep are not currently exposed by the simulation, so no values are fabricated here.</p></div></details>';
 }).join("");
 return intro("SETTLEMENT ARCHITECTURE","Building register","Inspect every surviving structure using its actual simulation entity, health, footprint, staffing and site data.")+
 '<div class="command-summary"><div><small>STRUCTURES</small><strong>'+records.length+'</strong></div><div><small>BUILDING TYPES</small><strong>'+counts.size+'</strong></div><div><small>EMPLOYED</small><strong>'+number(workforce.employed)+'</strong></div><div><small>POPULATION</small><strong>'+number(workforce.population)+'</strong></div></div>'+
 '<div class="building-type-summary">'+typeSummary+'</div><label class="building-search-label" for="building-search">FILTER STRUCTURES</label><input id="building-search" class="building-search" type="search" maxlength="80" placeholder="Search by building type or name">'+
 '<div class="building-register">'+(rows||'<p class="command-note">No buildings are recorded in this realm yet.</p>')+'</div>'+
 '<p class="command-note">Site resource values are taken from the structure centre tile only. They are not a production rate. The register is read-only; construction and demolition remain in the existing build interface.</p>';
}
function familyRecord(id){
 const key=String(id||"");
 const live=state.entities.find(entity=>!entity.dead&&String(entity.personId||entity.person?.id||entity.id||"")===key);
 if(live)return live;
 const memorial=(state.personArchive||[]).find(entry=>String(entry.personId||"")===key);
 return memorial?{...memorial,isArchived:true}:null;
}
function portraitSymbol(entity){
 const person=entity?.person||{},role=String(person.role||"").toLowerCase(),sex=String(person.sex||"").toLowerCase();
 const female=sex==="f"||sex.includes("female")||sex.includes("woman");
 if(entity?.isKing||/sovereign|monarch|ruler|king|queen/.test(role))return female?"portrait-queen":"portrait-king";
 if(/scholar|scribe|healer|cleric|priest|mage|teacher/.test(role))return "portrait-scholar";
 if(/knight|guard|soldier|marshal|captain|archer/.test(role))return "portrait-knight";
 if(/noble|lord|lady|court|consort/.test(role))return female?"portrait-noblewoman":"portrait-nobleman";
 return female?"portrait-noblewoman":"portrait-villager";
}
function familyNode(entity,heirId){
 const id=String(entity?.personId||entity?.person?.id||entity?.id||"");
 const person=entity?.person;
 if(!id||!person)return "";
 const flags=[entity.isKing?"SOVEREIGN":"",id===String(heirId||"")?"DESIGNATED HEIR":"",entity.isArchived?"DECEASED":""].filter(Boolean).join(" · ");
 const age=Number.isFinite(Number(person.ageYears))?Math.floor(Number(person.ageYears))+" years":"age unknown";
 return '<button type="button" class="dynasty-person'+(entity.isArchived?' is-deceased':'')+'" data-open-person="'+esc(id)+'" aria-label="Open character dossier for '+esc(person.name||"Unnamed person")+'"><svg class="dynasty-person-portrait" viewBox="0 0 256 320" aria-hidden="true"><use href="assets/royal-portraits.svg#'+portraitSymbol(entity)+'"></use></svg><span class="dynasty-person-copy"><strong>'+esc(person.name||"Unnamed person")+'</strong><small>'+esc(person.role||person.species||"Resident")+' · '+esc(age)+'</small><em>'+esc(flags||"RECORDED FAMILY MEMBER")+'</em></span></button>';
}
function dynasty(){
 const h=getRoyalHouse(),king=h.king;
 if(!king)return intro("HOUSE OF THE CROWN","Dynasty & lineage","The family tree is assembled from explicit parent, child and partnership records.")+'<div class="command-note">No living sovereign is currently recorded. Start a campaign or inspect the character dossiers for archived family records.</div>';
 const heirId=h.heir?.personId||"";
 const sovereignId=String(king.personId||king.person?.id||king.id||"");
 const rootFamily=getFamilySnapshot(sovereignId)||{};
 const linkedRecords=(links,exclude=[])=>{
  const blocked=new Set([sovereignId,...exclude.map(value=>String(value))]);
  return (links||[]).map(link=>familyRecord(link.personId)).filter(record=>{
   const id=String(record?.personId||record?.person?.id||record?.id||"");
   if(!id||blocked.has(id))return false;
   blocked.add(id);return true;
  }).slice(0,24);
 };
 const parents=linkedRecords(rootFamily.parents||[]);
 const siblings=linkedRecords(rootFamily.siblings||[],parents.map(person=>person.personId));
 const cousinMap=new Map();
 for(const parent of parents){
  const parentId=String(parent.personId||parent.person?.id||parent.id||"");
  for(const auntLink of getFamilySnapshot(parentId)?.siblings||[]){
   const aunt=familyRecord(auntLink.personId);
   if(!aunt)continue;
   const auntId=String(aunt.personId||aunt.person?.id||aunt.id||"");
   for(const cousinLink of getFamilySnapshot(auntId)?.children||[]){
    const cousin=familyRecord(cousinLink.personId);
    const cousinId=String(cousin?.personId||cousin?.person?.id||cousin?.id||"");
    if(cousin&&cousinId!==sovereignId&&!parents.some(person=>String(person.personId)===cousinId)&&!siblings.some(person=>String(person.personId)===cousinId))cousinMap.set(cousinId,cousin);
   }
  }
 }
 const cousins=[...cousinMap.values()].slice(0,24);
 const descendantVisited=new Set([sovereignId]);
 let descendantCount=1;
 const descendantBranch=(entity,depth=1)=>{
  if(!entity?.person||depth>4||descendantCount>=80)return "";
  const id=String(entity.personId||entity.person?.id||entity.id||"");
  if(!id||descendantVisited.has(id))return "";
  descendantVisited.add(id);descendantCount++;
  const children=[];
  for(const link of getFamilySnapshot(id)?.children||[]){
   const child=familyRecord(link.personId);
   const childId=String(child?.personId||child?.person?.id||child?.id||"");
   if(child&&childId&&!descendantVisited.has(childId))children.push(child);
   if(children.length>=16)break;
  }
  const childMarkup=children.map(child=>descendantBranch(child,depth+1)).filter(Boolean).join("");
  return '<div class="dynasty-branch" data-parent-id="'+esc(id)+'"><div class="dynasty-branch-person">'+familyNode(entity,heirId)+'</div>'+
   (childMarkup?'<div class="dynasty-branch-children">'+childMarkup+'</div>':'')+'</div>';
 };
 const directChildren=(rootFamily.children||[]).map(link=>familyRecord(link.personId)).filter(Boolean).slice(0,16);
 const directBranches=directChildren.map(child=>descendantBranch(child,1)).filter(Boolean).join("");
 const descendantMarkup='<div class="dynasty-graph" role="group" aria-label="Recorded royal descendants">'+
  '<div class="dynasty-graph-root">'+familyNode(king,heirId)+'</div>'+
  (directBranches?'<div class="dynasty-branch-children dynasty-graph-children">'+directBranches+'</div>':'')+'</div>';
 const consort=h.consort?familyNode(h.consort,heirId):'<p class="command-note">No royal consort is recorded.</p>';
 const history=h.history.slice().reverse().slice(0,12).map(x=>'<article class="command-history"><strong>YEAR '+number(x.year)+' · '+esc(x.kind)+'</strong><p>'+esc(x.detail)+'</p></article>').join("");
 return intro("HOUSE OF THE CROWN","Dynasty & lineage","A multi-generation view of the actual kinship graph. Select any recorded person to open their full dossier.")+
 '<div class="command-section-title">THE SOVEREIGN HOUSE</div><div class="dynasty-root-grid">'+familyNode(king,heirId)+consort+'</div>'+
 '<div class="command-section-title">ANCESTORS & SIBLINGS</div><div class="dynasty-root-grid">'+(parents.map(person=>familyNode(person,heirId)).join("")||'<p class="command-note">No parent links are recorded for the sovereign.</p>')+(siblings.map(person=>familyNode(person,heirId)).join("")||'<p class="command-note">No sibling links are recorded for the sovereign.</p>')+'</div>'+
 '<div class="command-section-title">RECORDED COUSINS</div><div class="dynasty-root-grid">'+(cousins.map(person=>familyNode(person,heirId)).join("")||'<p class="command-note">No cousin links can be verified from the recorded kinship graph.</p>')+'</div>'+
 '<div class="command-section-title">DESCENDANTS & SUCCESSION</div><div class="dynasty-tree">'+descendantMarkup+'</div>'+
 '<div class="command-section-title">ROYAL SUCCESSION RECORD</div><div class="command-history-list">'+(history||'<p class="command-note">No royal event has been recorded yet.</p>')+'</div>'+
 '<p class="command-note">Only saved family relationships are drawn. Missing, unknown or unlinked relatives are intentionally not inferred.</p>';
}
function dragonPortraitSymbol(lifeStage){const stage=String(lifeStage||"adult").toLowerCase();return ({hatchling:"dragon-hatchling",juvenile:"dragon-juvenile",adult:"dragon-adult",elder:"dragon-elder",ancient:"dragon-ancient"})[stage]||"dragon-adult";}
function creatures(){
 const c=getCreatureSnapshot();
 const rows=c.living.map(d=>{
  const memories=(d.memories||[]).slice(0,8).map(memory=>'<li><strong>YEAR '+number(memory.year)+'</strong><span>'+esc(memory.text)+'</span></li>').join("");
  const abilities=(d.abilities||[]).map(value=>'<span class="creature-chip">'+esc(value)+'</span>').join("");
  const goals=(d.goals||[]).map(value=>'<span class="creature-chip">'+esc(value)+'</span>').join("");
  return '<details class="creature-record"><summary><svg class="creature-portrait" data-life-stage="'+esc(d.lifeStage)+'" viewBox="0 0 128 96" aria-hidden="true"><use href="assets/royal-dragon-atlas.svg#'+dragonPortraitSymbol(d.lifeStage)+'"></use></svg><span><strong>'+esc(d.name)+'</strong><small>'+esc(d.lifeStage)+' · '+number(d.ageYears)+' years · '+esc(d.temperament)+'</small></span><b>'+number(d.health)+'% health</b></summary><div class="creature-dossier"><div class="creature-stat-grid"><span>Health<strong>'+number(d.health)+' / 100</strong></span><span>Hunger<strong>'+number(d.hunger)+' / 100</strong></span><span>Bond with sovereign<strong>'+number(d.bond)+' / 100</strong></span><span>Expected lifespan<strong>'+number(d.expectedLifespan)+' years</strong></span><span>Last update<strong>Year '+number(d.lastUpdateYear)+'</strong></span><span>Temperament<strong>'+esc(d.temperament)+'</strong></span></div><div class="command-section-title">ABILITIES</div><div class="creature-chip-list">'+(abilities||'<span class="command-note">No abilities recorded.</span>')+'</div><div class="command-section-title">RECORDED GOALS</div><div class="creature-chip-list">'+(goals||'<span class="command-note">No goals recorded.</span>')+'</div><div class="command-section-title">PERSONAL MEMORIES</div><ol class="creature-memory-list">'+(memories||'<li>No memories have been recorded yet.</li>')+'</ol></div></details>';
 }).join("");
 const archive=c.archive.slice().reverse().map(d=>{
  const memories=(d.memories||[]).map(memory=>'<li><strong>YEAR '+number(memory.year)+'</strong><span>'+esc(memory.text)+'</span></li>').join("");
  return '<details class="creature-record is-memorial"><summary><svg class="creature-portrait" data-life-stage="'+esc(d.lifeStage)+'" viewBox="0 0 128 96" aria-hidden="true"><use href="assets/royal-dragon-atlas.svg#'+dragonPortraitSymbol(d.lifeStage)+'"></use></svg><span><strong>'+esc(d.name)+'</strong><small>MEMORIAL · '+esc(d.lifeStage)+' · '+number(d.ageYears)+' years</small></span><b>FELL IN YEAR '+number(d.deathYear)+'</b></summary><div class="creature-dossier"><p>Cause recorded: '+esc(d.cause||"unknown")+'</p><ol class="creature-memory-list">'+(memories||'<li>No surviving memories were archived.</li>')+'</ol></div></details>';
 }).join("");
 return intro("THE LIVING BESTIARY","Dragon sanctuary","Individual creature dossiers preserve age, needs, temperament, abilities, goals and personal memories from the live creature records.")+
 '<img class="command-creature-art" src="assets/dragon-companion.svg" alt="Dragon companion illustration" loading="lazy"><div class="command-summary"><div><small>LIVING DRAGONS</small><strong>'+c.living.length+' / 3</strong></div><div><small>CREATURE MEMORIALS</small><strong>'+c.archive.length+'</strong></div><div><small>SUMMONING COST</small><strong>55 GOLD · 35 FOOD</strong></div></div>'+
 '<div class="command-actions"><button data-command="summon-dragon" '+(c.living.length>=3?'disabled':'')+'>SUMMON A DRAGON</button></div><div class="command-section-title">LIVING CREATURE DOSSIERS</div><div class="creature-record-list">'+(rows||'<p class="command-note">No dragon has joined the realm yet.</p>')+'</div>'+
 '<div class="command-section-title">CREATURE MEMORIALS</div><div class="creature-record-list">'+(archive||'<p class="command-note">No creature memorials yet.</p>')+'</div>';
}
function chronicle(){
 const entries=Array.isArray(state.eventLog)?state.eventLog:[];
 const kinds=[...new Set(entries.map(entry=>String(entry.kind||"realm")))].sort();
 const options=['<option value="all">All categories</option>',...kinds.map(kind=>'<option value="'+esc(kind)+'">'+esc(kind.toUpperCase())+'</option>')].join("");
 const rows=entries.map(entry=>{
  const text=String(entry.text||"Recorded realm event");
  return '<article class="chronicle-entry" data-kind="'+esc(entry.kind||"realm")+'" data-search="'+esc((text+" "+(entry.kind||"")+" "+entry.id).toLowerCase())+'"><div class="chronicle-entry-meta"><strong>'+esc(String(entry.kind||"realm").toUpperCase())+'</strong><span>RECORD '+number(entry.id)+' · TICK '+number(entry.tick)+'</span></div><p>'+esc(text)+'</p></article>';
 }).join("");
 const active=state.activeEvent?'<article class="active-issue-card"><span class="command-ribbon">CURRENTLY AWAITING THE CROWN</span><h4>'+esc(state.activeEvent.title)+'</h4><p>'+esc(state.activeEvent.description)+'</p><small>'+state.activeEvent.choices.length+' recorded choices</small><button type="button" data-command="show-active-event">OPEN ISSUE</button></article>':'<p class="command-note">No unresolved realm issue is currently awaiting a decision.</p>';
 return intro("THE ROYAL ARCHIVE","Chronicle & event inbox","Search the actual event log by text or category. Records show their stored simulation tick; calendar dates are not inferred from missing history.")+
 '<div class="command-section-title">ACTIVE REALM ISSUE</div>'+active+
 '<div class="command-section-title">RECORDED CHRONICLE</div><div class="chronicle-filters"><label for="chronicle-search">SEARCH RECORDS</label><input id="chronicle-search" type="search" maxlength="80" placeholder="Search event text or category"><label for="chronicle-kind-filter">CATEGORY</label><select id="chronicle-kind-filter">'+options+'</select></div>'+
 '<div class="chronicle-list">'+(rows||'<p class="command-note">No chronicle entries have been recorded yet.</p>')+'</div>'+
 '<p class="command-note">The event log retains up to 100 recent records. This screen does not claim unread tracking or permanent archival beyond the simulation save.</p>';
}
function render(){
 const panel=$("command-panel-content");if(!panel)return;
 panel.innerHTML=({kingdom,government,politics,decisions,cards,economy,buildings,dynasty,creatures,chronicle}[activePanel]||kingdom)();
 document.querySelectorAll("[data-command-tab]").forEach(b=>{
  const active=b.dataset.commandTab===activePanel;
  b.classList.toggle("is-active",active);
  b.setAttribute("aria-pressed",String(active));
 });
 setNavigationActive(activePanel);
}
function act(b){
 const a=b.dataset.command,v=b.dataset.value;let r={ok:false,reason:"unknown-action"};
 if(a==="government-form")r=setGovernmentForm(v);else if(a==="policy")r=enactPolicy(v);else if(a==="consort")r=appointRoyalConsort($("royal-consort-select")?.value);else if(a==="royal-birth")r=createRoyalChild();else if(a==="summon-dragon")r=summonDragon();else if(a==="heir")r=designateHeir(v);else if(a==="select-card"){const card=[...document.querySelectorAll(".hand-card")].find(x=>x.dataset.cardId===v);if(card){card.click();r={ok:true};}}else if(a==="show-active-event"&&state.activeEvent){state.activeEvent.dismissed=false;renderUI();r={ok:true};}
 if(r.ok){toast("DECISION RECORDED");render();}else toast((r.reason||"ACTION FAILED").replaceAll("-"," ").toUpperCase());
}
export function setupManagementUI(){
 document.querySelectorAll("[data-kac-panel]").forEach(button=>button.addEventListener("click",()=>{
  const target=button.dataset.kacPanel;
  setNavigationActive(target);
  if(target==="people"){$("people-btn")?.click();return;}
  if(target==="settings"){$("settings-btn")?.click();return;}
  if(target==="build"){$("build-open-btn")?.click();return;}
  if(["kingdom","government","politics","decisions","cards","economy","buildings","dynasty","creatures","chronicle"].includes(target)){
   activePanel=target;$("command-modal")?.classList.remove("hidden");render();
  }
 }));
 $("command-open-btn")?.addEventListener("click",()=>{$("command-modal")?.classList.remove("hidden");render();});

 document.querySelectorAll("[data-command-tab]").forEach(b=>b.addEventListener("click",()=>{activePanel=b.dataset.commandTab||"government";$("command-modal")?.classList.remove("hidden");render();}));
 $("command-close")?.addEventListener("click",()=>$("command-modal")?.classList.add("hidden"));
 $("command-modal")?.addEventListener("click",e=>{if(e.target===$("command-modal"))$("command-modal").classList.add("hidden");});
 $("command-panel-content")?.addEventListener("input",e=>{
  if(e.target.id==="building-search"){
   const query=e.target.value.trim().toLowerCase();
   document.querySelectorAll(".building-record").forEach(record=>record.classList.toggle("is-filtered",query&&!record.dataset.buildingName.includes(query)));
  }
  if(e.target.id==="chronicle-search"||e.target.id==="chronicle-kind-filter"){
   const query=$("chronicle-search")?.value.trim().toLowerCase()||"";
   const kind=$("chronicle-kind-filter")?.value||"all";
   document.querySelectorAll(".chronicle-entry").forEach(record=>record.classList.toggle("is-filtered",(kind!=="all"&&record.dataset.kind!==kind)||(query&&!record.dataset.search.includes(query))));
  }
 });
 $("command-panel-content")?.addEventListener("click",e=>{
  const person=e.target.closest("[data-open-person]");
  if(person){window.dispatchEvent(new CustomEvent("kac:open-person",{detail:{personId:person.dataset.openPerson}}));$("command-modal")?.classList.add("hidden");return;}
  const b=e.target.closest("[data-command]");if(b&&!b.disabled)act(b);
 });
 document.querySelectorAll("[data-kac-dock-action]").forEach(button=>button.addEventListener("click",()=>{
  const action=button.dataset.kacDockAction;
  if(action==="people")$("people-btn")?.click();
  else if(action==="dynasty"){activePanel="dynasty";$("command-modal")?.classList.remove("hidden");render();}
  else if(action==="cards"){activePanel="cards";$("command-modal")?.classList.remove("hidden");render();}
  else if(action==="events")$("tab-0")?.click();
  else if(action==="save")$("save-btn")?.click();
 }));
 document.addEventListener("keydown",e=>{if(e.key==="Escape")$("command-modal")?.classList.add("hidden");});
}
