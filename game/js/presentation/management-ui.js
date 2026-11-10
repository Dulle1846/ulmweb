// Strategy management command deck: government, politics, royal decisions, cards and economy.
import { state } from "../core/state.js";
import { getGovernmentSnapshot, GOVERNMENT_FORMS, GOVERNMENT_POLICIES, setGovernmentForm, enactPolicy } from "../systems/government.js";
import { getPoliticalSnapshot } from "../systems/politics.js";
import { getCourtSnapshot, appointMinister, dismissMinister, addressFactionDemand } from "../systems/court.js";
import { getDiplomacySnapshot, sendGift, proposeTradePact, proposeAlliance, declareWar, sueForPeace, appointEnvoy, recallEnvoy } from "../systems/diplomacy.js";
import { getRoyalHouse, appointRoyalConsort, createRoyalChild, designateHeir } from "../systems/royal-dynasty.js";
import { renderEndeavoursPanel } from "./endeavours-panel.js";
import { startEndeavour, abandonEndeavour, setEndeavourFunding, setEndeavourOverseer } from "../systems/endeavours.js";
import { getFamilySnapshot } from "../systems/families.js";
import { BUILDING_WORKFORCE, getBuildingEfficiency, getWorkforceSnapshot } from "../systems/economy.js";
import { BUILDING_SIZE } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { CARD_DECK, drawPlayerCard, selectCard } from "../systems/cards.js";
import { getResourceNodeAt } from "../systems/resource-geography.js";
import { forestFaunaSummaryAt } from "../systems/forest-fauna.js";
import { deliverForestGoods, forestDeliveryAvailability, forestGatheringSummary, forestThinningAvailability, gatherNearestForestProducts, processForestHunt, thinNearestForest } from "../systems/forest-gathering.js";
import { feedStableFromMast, pannageSummary } from "../systems/forest-pannage.js";
import { suppressNearestForestDisturbance } from "../systems/forest-succession.js";
import { renderUI, cardSprite } from "./rendering/ui.js";
import { getHousingSnapshot, getHouseholdSnapshot } from "../systems/population.js";
import { renderPopulationPanel, setPopulationFilter, setPopulationQuery, applyPopulationSearch } from "./population-panel.js";
import { getCreatureSnapshot, summonDragon } from "../systems/creatures.js";
import { getMilitarySnapshot, recruitVillager, trainSoldier, equipSoldier, buyHorse, mountSoldier, demobilizeSoldier } from "../systems/military.js";
import { getHealthSnapshot, improveSanitation, appointHealer, dismissHealer, brewMedicine, treatSick, sellMedicine, setQuarantine } from "../systems/health.js";
import { getFaithSnapshot, appointClergy, dismissClergy, holdFestival, fundPilgrimage, setCultureBudget, addressHeresy } from "../systems/faith.js";
import { getJusticeSnapshot, appointJudge, dismissJudge, setLawCode, grantCharter, tryCase, investigateCorruption } from "../systems/justice.js";
import { getIdentitySnapshot } from "../systems/identity.js";
import { getResearchSnapshot, startResearch, setResearchFunding, appointScholar, dismissScholar } from "../systems/research.js";
import { GRAIN_CONTRACTS, WATERWORKS_LEVELS, getCrownSupplySnapshot, setGrainContract, setWaterworks, upgradeHousingStock, provisionGranary } from "../systems/crown-supply.js";
import { applyCrownRelief } from "../systems/crown-relief.js";
import { getLegacySnapshot } from "../systems/legacy.js";
import { constructionSnapshot, isUnderConstruction } from "../systems/construction.js";
import { getInventorySummary, getBuildingLogisticsStatus, getBuildingSupplyReason, getCitySummary, getLogisticsSnapshot, setWarehouseProfile } from "../systems/logistics.js";
import { WAREHOUSE_PROFILES } from "../systems/city-config.js";
import { getSettlementSnapshot, getServiceReason } from "../systems/settlement.js";
import { foresterRangeSummary } from "../systems/fields.js";
let activePanel="kingdom",dynastyStylesRequested=false,endeavourFunding=1;
const $=id=>document.getElementById(id),esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=value=>Math.floor(Number(value)||0).toLocaleString("en-US");
const amount=value=>Number(value||0).toLocaleString("en-US",{maximumFractionDigits:2});
const costLabel=cost=>Object.entries(cost||{}).filter(([,value])=>Number(value)>0).map(([key,value])=>Math.floor(Number(value))+" "+key.toUpperCase()).join(" · ");
const BUILDING_LABELS=Object.freeze({
 [TYPE.KEEP]:"Royal Keep",[TYPE.HOUSE]:"House",[TYPE.FARM]:"Farm",[TYPE.LUMBER]:"Lumber Yard",
 [TYPE.QUARRY]:"Quarry",[TYPE.TOWER]:"Watchtower",[TYPE.WALL]:"Defensive Wall",[TYPE.TAVERN]:"Tavern",
 [TYPE.TEMPLE]:"Temple",[TYPE.BARRACKS]:"Barracks",[TYPE.MILL]:"Mill",[TYPE.STABLE]:"Stables",
 [TYPE.WONDER]:"Wonder",[TYPE.GOLDMINE]:"Gold Mine",[TYPE.BARREL]:"Storage Barrel",
 [TYPE.TENT]:"Tent",[TYPE.STONE_HOUSE]:"Stone House",[TYPE.WAREHOUSE]:"Warehouse",[TYPE.SAWMILL]:"Sawmill",
 [TYPE.BAKERY]:"Bakery",[TYPE.WELL]:"Well",[TYPE.MASON]:"Mason's Yard",[TYPE.FORESTER]:"Forester's Lodge",
 [TYPE.CLINIC]:"Clinic",[TYPE.MARKET]:"Market"
});
function setNavigationActive(target){
 document.querySelectorAll(".realm-nav-button").forEach(button=>{
  const active=button.dataset.kacPanel===target;
  button.classList.toggle("is-active",active);
  if(active)button.setAttribute("aria-current","page");
  else button.removeAttribute("aria-current");
 });
}
function toast(message){const el=$("action-toast");if(!el)return;el.textContent=message;el.classList.add("is-visible");setTimeout(()=>el.classList.remove("is-visible"),1800);}
function meter(label,value){const v=Math.max(0,Math.min(100,Number(value)||0));return '<div class="command-meter"><span>'+esc(label)+'</span><i><b style="width:'+v+'%"></b></i><strong>'+Math.round(v)+'</strong></div>';}
function intro(k,t,p){return '<div class="command-panel-intro"><span>'+esc(k)+'</span><h3>'+esc(t)+'</h3><p>'+esc(p)+'</p></div>';}
const RESOURCE_ORDER=["wood","stone","gold","food"];
const RESOURCE_META=Object.freeze({
 wood:{label:"Wood",unit:"timber",art:"assets/realm-icons.svg#tree",buildings:[TYPE.LUMBER,TYPE.MILL,TYPE.BARREL],note:"Lumber yards harvest forests, mills consume timber, and storage barrels expand what the realm can hold."},
 stone:{label:"Stone",unit:"stone",art:"assets/city-builder-sprites.svg#quarry",buildings:[TYPE.QUARRY,TYPE.WALL,TYPE.TOWER],note:"Quarries extract stone; walls and watchtowers record the realm's defensive construction."},
 gold:{label:"Gold",unit:"gold",art:"assets/realm-icons.svg#coin",buildings:[TYPE.GOLDMINE,TYPE.TAVERN,TYPE.KEEP],note:"Taxes and wages settle every 20 days. Gold mines, taverns and the royal keep are listed because they are recorded structures, not because each is assigned a per-tick output here."},
 food:{label:"Food",unit:"food",art:"assets/city-builder-sprites.svg#mill",buildings:[TYPE.FARM,TYPE.MILL,TYPE.TAVERN],note:"Farms and mills supply food; taverns consume provisions. Household demand is settled every 20 days."}
});
function trendChart(entries,key,label,color="#b99a59"){
 const points=(Array.isArray(entries)?entries:[]).map(entry=>({value:Number(entry?.[key]),tick:Number(entry?.tick)})).filter(point=>Number.isFinite(point.value)&&Number.isFinite(point.tick));
 if(points.length<2)return '<div class="command-chart-empty">At least two completed settlements are needed before this line can be drawn.</div>';
 const width=560,height=104,pad=10;
 const values=points.map(point=>point.value),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
 const coords=points.map((point,index)=>{
  const x=pad+(points.length===1?0:index/(points.length-1))*(width-pad*2);
  const y=height-pad-((point.value-min)/span)*(height-pad*2);
  return [x,y];
 });
 const line=coords.map(([x,y])=>x.toFixed(1)+","+y.toFixed(1)).join(" ");
 const area=[pad+","+(height-pad),...coords.map(([x,y])=>x.toFixed(1)+","+y.toFixed(1)),(width-pad)+","+(height-pad)].join(" ");
 const last=points[points.length-1],first=points[0];
 return '<figure class="command-trend"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(label)+': '+esc(first.value.toLocaleString("en-US"))+' to '+esc(last.value.toLocaleString("en-US"))+' across '+points.length+' settlements"><title>'+esc(label)+'</title><path class="command-trend-area" d="M'+area.replaceAll(" "," L")+'Z" style="fill:'+esc(color)+'"></path><polyline points="'+line+'" fill="none" stroke="'+esc(color)+'" stroke-width="2.5" vector-effect="non-scaling-stroke"></polyline><circle cx="'+coords[coords.length-1][0].toFixed(1)+'" cy="'+coords[coords.length-1][1].toFixed(1)+'" r="3.5" fill="'+esc(color)+'"></circle></svg><figcaption><span>'+esc(label)+'</span><span>'+esc(first.value.toLocaleString("en-US"))+' → '+esc(last.value.toLocaleString("en-US"))+' · '+points.length+' SETTLEMENTS</span></figcaption></figure>';
}
function treasuryCharts(history){
 return '<div class="command-chart-grid">'+trendChart(history,"gold","Treasury stock · gold","#b99a59")+trendChart(history,"netGold","Net treasury change · per settlement","#8eaa7a")+'</div>';
}
function resourceCard(key,history){
 const meta=RESOURCE_META[key],stock=Math.max(0,Number(state.resources?.[key])||0),flow=Number(state.incomeThisTick?.[key])||0;
 const previous=history.length>1?history[history.length-2]:null;
 const delta=previous?stock-(Number(previous[key])||0):null;
 const counts=new Map();
 for(const entity of state.entities){if(!entity.dead&&entity.isBuilding())counts.set(entity.type,(counts.get(entity.type)||0)+1);}
 const related=meta.buildings.map(type=>({name:CARD_DECK.find(card=>card.type===type)?.name||BUILDING_LABELS[type]||("Building "+type),count:counts.get(type)||0})).filter(item=>item.count>0);
 const ledger=state.economy?.lastLedger;
 let ledgerNote;
 if(key==="gold"&&ledger)ledgerNote="Latest settlement: "+amount(ledger.taxesCollected)+" gold taxes · "+amount((Number(ledger.wagesPaid)||0)+(Number(ledger.upkeepPaid)||0)+(Number(ledger.furnitureUpkeepPaid)||0))+" gold in wages and upkeep · net "+(Number(ledger.netGold)>=0?"+":"")+amount(ledger.netGold)+" gold.";
 else if(key==="food"&&ledger)ledgerNote="Latest settlement: "+amount(ledger.foodDemand)+" food demanded · "+amount(ledger.foodConsumed)+" consumed · "+amount(ledger.foodShortage)+" shortage.";
 else ledgerNote="The 20-day financial ledger does not settle "+esc(meta.unit)+"; this chart records stock at each completed settlement.";
 return '<article class="resource-detail-card" data-resource="'+esc(key)+'"><header><svg class="resource-detail-art" viewBox="0 0 64 64" aria-hidden="true"><use href="'+meta.art+'"></use></svg><div><small>ROYAL STORE</small><h4>'+esc(meta.label)+'</h4></div><div class="resource-detail-stock"><strong>'+number(stock)+'</strong><span>IN STORE</span></div></header><div class="resource-detail-stats"><div><small>CURRENT TICK FLOW</small><strong class="'+(flow>0?'is-positive':flow<0?'is-negative':'')+'">'+(flow>0?'+':'')+amount(flow)+'</strong></div><div><small>SETTLEMENT CHANGE</small><strong class="'+(delta!==null&&delta>=0?'is-positive':delta!==null?'is-negative':'')+'">'+(delta===null?'AWAITING DATA':(delta>=0?'+':'')+amount(delta))+'</strong></div><div><small>RELATED STRUCTURES</small><strong>'+related.reduce((sum,item)=>sum+item.count,0)+'</strong></div></div>'+trendChart(history,key,meta.label+" stock at settlement")+'<p class="command-note">'+ledgerNote+'</p><div class="resource-related"><span>RECORDED BUILDINGS</span>'+(related.length?related.map(item=>'<b class="resource-building-chip">'+esc(item.name)+' ×'+item.count+'</b>').join(""):'<em>No related structure is recorded.</em>')+'</div><p class="command-note">'+esc(meta.note)+'</p></article>';
}
function resources(){
 if(!state.hasStarted)return intro("ROYAL STORES","Awaiting its founding","Resource detail becomes active when a new campaign begins.")+'<div class="command-note">No campaign is running yet. Found a realm to read its stocks, flows and bounded settlement history.</div>';
 const history=Array.isArray(state.economy?.history)?state.economy.history:[];
 return intro("THE ROYAL STORES","Resource detail","Inspect every store together with its current-tick flow, the latest completed settlement and a real, bounded stock history. Charts use stored settlement points only.")+
 '<div class="command-summary"><div><small>WOOD</small><strong>'+number(state.resources.wood)+'</strong></div><div><small>STONE</small><strong>'+number(state.resources.stone)+'</strong></div><div><small>GOLD</small><strong>'+number(state.resources.gold)+'</strong></div><div><small>FOOD</small><strong>'+number(state.resources.food)+'</strong></div></div>'+
 '<div class="resource-detail-grid">'+RESOURCE_ORDER.map(key=>resourceCard(key,history)).join("")+'</div>'+
 '<p class="command-note">Stock history contains up to 24 completed 20-day settlements. The chart is intentionally blank until two settlements exist; no interpolated or invented points are drawn.</p>';
}
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
function courtSection(){
 const c=getCourtSnapshot(),gold=Number(state.resources?.gold)||0;
 const offices=c.offices.map(office=>{
  if(office.holder){
   const h=office.holder;
   return '<article class="court-office" data-court-office="'+esc(office.id)+'"><div class="court-office__head"><div><span class="court-office__role">'+esc(office.label)+'</span><h4>'+esc(h.name)+'</h4><p>'+esc(office.description)+'</p></div><span class="court-office__badge">'+esc(h.factionLabel)+'</span></div><div class="court-office__stats"><span>COMPETENCE<b>'+Math.round(h.competence)+'</b></span><span>LOYALTY<b>'+Math.round(h.loyalty)+'</b></span><span>INTEGRITY<b>'+Math.round(h.integrity)+'</b></span><span>SALARY<b>'+h.salary+'G</b></span></div><p class="court-office__effect">'+esc(office.effect)+' · appointed year '+h.appointedYear+'</p><div class="court-actions"><button data-command="court-dismiss" data-value="'+esc(office.id)+'">DISMISS</button></div></article>';
  }
  const options=c.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · age '+Math.floor(p.ageYears)+' · '+esc(p.species)+' · fit '+Math.round(p.fits[office.id]||0)+'</option>').join("");
  return '<article class="court-office court-office--vacant" data-court-office="'+esc(office.id)+'"><div class="court-office__head"><div><span class="court-office__role">'+esc(office.label)+'</span><h4>Office vacant</h4><p>'+esc(office.description)+'</p></div><span class="court-office__badge">VACANT</span></div><div class="command-inline"><select id="court-office-'+esc(office.id)+'" aria-label="Choose '+esc(office.label)+'"><option value="">Choose a resident…</option>'+options+'</select><button data-command="court-appoint" data-value="'+esc(office.id)+'"'+((gold<c.appointmentCost||!c.candidates.length)?" disabled":"")+'>APPOINT · '+c.appointmentCost+'G</button></div><p class="court-office__effect">'+esc(office.effect)+'</p></article>';
 }).join("");
 const affordable=c.demand&&Object.entries(c.demand.cost).every(([key,value])=>(Number(state.resources?.[key])||0)>=value);
 const demand=c.demand?'<article class="court-demand"><div><span class="command-ribbon">'+esc(c.demand.factionLabel.toUpperCase())+' PETITION · EXPIRES YEAR '+c.demand.expiresYear+'</span><h4>'+esc(c.demand.title)+'</h4><p>'+esc(c.demand.description)+'</p><small>'+esc(costLabel(c.demand.cost))+'</small></div><button data-command="court-demand" data-value="'+esc(c.demand.faction)+'"'+(affordable?"":" disabled")+'>GRANT PETITION</button></article>':'<p class="command-note">No petition is waiting. The next annual court session will raise one.</p>';
 const m=c.modifiers;
 const effects='<div class="court-effect-grid"><span>TAX EFFICIENCY<b>+'+Math.round((m.taxEfficiency-1)*100)+'%</b></span><span>DIPLOMATIC GAIN<b>+'+Math.round((m.diplomacyGain-1)*100)+'%</b></span><span>TRADE TERMS<b>+'+(m.tradeBonus*100).toFixed(1)+'%</b></span><span>INCIDENT REDUCTION<b>'+Math.round(m.incidentReduction*100)+'%</b></span><span>MILITARY READINESS<b>+'+Math.round((m.militaryReadiness-1)*100)+'%</b></span><span>DISEASE CONTAINMENT<b>-'+Math.round(m.healthContainment*100)+'%</b></span><span>ANNUAL LEGITIMACY<b>+'+m.legitimacyGain.toFixed(2)+'</b></span><span>CORRUPTION RESISTANCE<b>'+Math.round(m.corruptionResistance*100)+'%</b></span></div>';
 const audit=c.lastAudit?'<p class="command-note">Last audit · year '+c.lastAudit.year+' · '+c.lastAudit.paid+'/'+c.lastAudit.salaries+' gold salaries · '+c.lastAudit.corruption+' gold lost to corruption · '+c.lastAudit.vacancies+' vacancies · '+c.lastAudit.estateSavings+' gold estate savings.</p>':'<p class="command-note">No annual court audit has been completed yet.</p>';
 const history=c.history.length?'<div class="court-history">'+c.history.map(entry=>'<div><span>'+esc(String(entry.kind).toUpperCase())+' · YEAR '+entry.year+'</span><p>'+esc(entry.summary)+'</p></div>').join("")+'</div>':'<p class="command-note">No court record has been written yet.</p>';
 return '<div class="command-section-title">ROYAL COURT · '+m.officesFilled+' OF '+c.offices.length+' OFFICES FILLED</div><p class="command-note">Appoint named residents to six offices. Competence, loyalty and integrity come from their real traits, needs and relationship with the crown. Salaries and corruption settle once per year; every office changes a live system, not only a label.</p><div class="court-office-grid">'+offices+'</div><div class="command-section-title">THE ANNUAL PETITION</div>'+demand+'<div class="command-section-title">COURT EFFECTS</div>'+effects+'<div class="command-section-title">LAST AUDIT</div>'+audit+'<div class="command-section-title">COURT RECORD</div>'+history;
}
function government(){
 const g=getGovernmentSnapshot(),f=GOVERNMENT_FORMS[g.form],identity=getIdentitySnapshot(),forms=Object.entries(GOVERNMENT_FORMS).map(([id,x])=>'<button class="command-choice'+(id===g.form?' is-current':'')+'" data-command="government-form" data-value="'+id+'"><strong>'+esc(x.label)+'</strong><small>Tax baseline '+x.tax+'% · Research ×'+((1+Number(x.research||0)).toFixed(2))+' · Trade ×'+((1+Number(x.trade||0)).toFixed(2))+' · Cost 20 gold</small></button>').join("");
 const identitySection='<div class="command-section-title">REALM IDENTITY</div><div class="command-summary"><div><small>REALM</small><strong>'+esc(identity.kingdomName)+'</strong></div><div><small>ROYAL HOUSE</small><strong>'+esc(identity.dynastyName)+'</strong></div><div><small>RULER TITLE</small><strong>'+esc(identity.rulerTitle)+'</strong></div><div><small>HERALDRY</small><strong>'+esc(identity.emblem.toUpperCase())+' ON '+esc(identity.banner.toUpperCase())+'</strong></div></div><div class="command-note"><strong>'+esc(identity.cultureDetails.label.toUpperCase())+' CULTURE</strong> · '+esc(identity.cultureDetails.description)+' · tax '+(identity.cultureDetails.tax>=0?"+":"")+Math.round(identity.cultureDetails.tax*100)+'% · trade '+(identity.cultureDetails.trade>=0?"+":"")+Math.round(identity.cultureDetails.trade*100)+'% · research '+(identity.cultureDetails.research>=0?"+":"")+Math.round(identity.cultureDetails.research*100)+'% · food demand '+Math.round(-identity.cultureDetails.food*100)+'% · legitimacy '+(identity.cultureDetails.legitimacy>=0?"+":"")+Math.round(identity.cultureDetails.legitimacy*100)+'%.</div>';
 const charterSection='<div class="command-section-title">FOUNDING CHARTER</div><div class="command-summary"><div><small>RELIGION</small><strong>'+esc(identity.religionDetails.label)+'</strong></div><div><small>TRADITION</small><strong>'+esc(identity.traditionDetails.label)+'</strong></div><div><small>LAW</small><strong>'+esc(identity.lawDetails.label)+'</strong></div><div><small>LEGITIMACY</small><strong>'+esc(identity.legitimacyDetails.label)+'</strong></div></div><div class="command-summary"><div><small>STARTING CHARTER</small><strong>'+esc(identity.foundingDetails.label)+'</strong></div><div><small>TAX</small><strong>'+((identity.modifiers.tax>=0?"+":"")+Math.round(identity.modifiers.tax*100))+'%</strong></div><div><small>TRADE</small><strong>'+((identity.modifiers.trade>=0?"+":"")+Math.round(identity.modifiers.trade*100))+'%</strong></div><div><small>RESEARCH</small><strong>'+((identity.modifiers.research>=0?"+":"")+Math.round(identity.modifiers.research*100))+'%</strong></div></div><p class="command-note">'+esc(identity.religionDetails.description)+' · '+esc(identity.traditionDetails.description)+' · '+esc(identity.lawDetails.description)+' · '+esc(identity.legitimacyDetails.description)+'</p>'+(identity.background?'<p class="command-note"><strong>FOUNDING CHRONICLE</strong><br>'+esc(identity.background)+'</p>':'')+'<p class="command-note">The starting charter added '+esc(identity.foundingDetails.description)+'</p>';
 return intro("THE CROWN & ITS INSTITUTIONS","Government","Choose how authority is organized. Changing the constitution costs 20 gold and shifts faction support. The royal court below turns those factions into named offices and annual petitions.")+identitySection+charterSection+'<div class="command-summary"><div><small>IN FORCE</small><strong>'+esc(f.label)+'</strong></div><div><small>TAX BASELINE</small><strong>'+g.taxRate+'%</strong></div><div><small>COUNCIL SEATS</small><strong>'+g.councilSeats+'</strong></div><div><small>DECREE COUNT</small><strong>'+g.decrees+'</strong></div></div><div class="command-section-title">CONSTITUTIONAL MODELS</div><div class="command-choice-grid">'+forms+'</div><div class="command-note">The six offices are now live. Ministries, lawmaking procedure and regional autonomy beyond this court remain future modules.</div>'+courtSection();
}
function politics(){
 const p=getPoliticalSnapshot(),court=getCourtSnapshot(),f=Object.entries(p.factions).map(([k,v])=>meter(k,v)).join(""),policies=Object.entries(GOVERNMENT_POLICIES).map(([id,x])=>'<article class="command-policy"><div><strong>'+esc(x.label)+'</strong><p>'+esc(x.description)+'</p></div><button data-command="policy" data-value="'+id+'">ENACT</button></article>').join("");
 const petition=court.demand?'<p class="command-note"><strong>COURT PETITION</strong><br>'+esc(court.demand.factionLabel)+' asks: '+esc(court.demand.title)+'. Grant or ignore it in Government → Royal Court.</p>':'';
 return intro("FACTIONS & PUBLIC ORDER","Politics","Legitimacy and faction support respond to decrees and the realm's material conditions.")+'<div class="command-summary"><div><small>LEGITIMACY</small><strong>'+Math.round(p.legitimacy)+'/100</strong></div><div><small>AVERAGE SUPPORT</small><strong>'+Math.round(p.averageSupport)+'/100</strong></div><div><small>DECISIONS</small><strong>'+p.settlements+'</strong></div></div><div class="command-section-title">FACTION SUPPORT</div><div class="command-meter-list">'+f+'</div>'+petition+'<div class="command-section-title">ROYAL DECREES · ONE PER YEAR</div><div class="command-policy-list">'+policies+'</div>';
}
function diplomacy(){
 const d=getDiplomacySnapshot(),c=d.costs,gold=Number(state.resources?.gold)||0,food=Number(state.resources?.food)||0,court=getCourtSnapshot();
 const envoyOptions=court.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · '+esc(p.species)+' · '+Math.round(p.fits.chancellor||0)+' fit</option>').join("");
 const rows=d.realms.map(r=>{
  const actions=[];
  if(r.treaty==="war"){
   const whitePeace=Number(r.warExhaustion)>=35;
   actions.push('<button data-command="diplomacy-peace" data-value="'+esc(r.id)+'"'+((!whitePeace&&(gold<c.peaceGold||food<c.peaceFood))?" disabled":"")+'>'+(whitePeace?'SUE FOR WHITE PEACE':'SUE FOR PEACE · '+c.peaceGold+'G / '+c.peaceFood+'F')+'</button>');
  }else{
   actions.push('<button data-command="diplomacy-gift" data-value="'+esc(r.id)+'"'+(gold<c.gift?" disabled":"")+'>SEND GIFT · '+c.gift+'G</button>');
   if(r.treaty==="none"&&r.relation>=d.thresholds.tradePact)actions.push('<button data-command="diplomacy-pact" data-value="'+esc(r.id)+'"'+(gold<c.tradePact?" disabled":"")+'>TRADE PACT · '+c.tradePact+'G</button>');
   if(r.treaty==="trade"&&r.relation>=d.thresholds.alliance)actions.push('<button data-command="diplomacy-alliance" data-value="'+esc(r.id)+'"'+(gold<c.alliance?" disabled":"")+'>ALLIANCE · '+c.alliance+'G</button>');
   actions.push('<button class="diplomacy-button--war" data-command="diplomacy-war" data-value="'+esc(r.id)+'">DECLARE WAR</button>');
  }
  let hint="";
  if(r.treaty==="war")hint="Trade is closed. Border incidents become more likely while the war endures.";
  else if(r.treaty==="alliance")hint="The alliance sends 3 gold and 4 food each year. An envoy strengthens annual trust further.";
  else if(r.treaty==="trade")hint="The pact improves buy and sell terms. Reach 70 relation to propose an alliance. An envoy improves annual relation.";
  else if(r.relation<d.thresholds.tradePact)hint="A trade pact requires 45 relation. Gifts and trade raise it. An envoy adds steady annual progress.";
  else hint="A trade pact is available. An alliance requires 70 relation. An envoy improves annual relation and trade terms.";
  const latest=Array.isArray(r.history)&&r.history[0];
  const envoyBlock=r.envoyId?'<div class="diplomacy-envoy"><div><span>ENVOY · SKILL '+Math.round(r.envoySkill)+'</span><strong>'+esc(r.envoyName||"Unnamed envoy")+'</strong><small>Appointed year '+r.envoySinceYear+'</small></div><button data-command="diplomacy-recall" data-value="'+esc(r.id)+'">RECALL</button></div>':r.treaty==="war"?'<p class="command-note">War has closed the court; no envoy can be received.</p>':'<div class="command-inline"><select id="envoy-'+esc(r.id)+'" aria-label="Choose envoy for '+esc(r.name)+'"><option value="">Appoint an envoy…</option>'+envoyOptions+'</select><button data-command="diplomacy-envoy" data-value="'+esc(r.id)+'"'+((gold<c.envoy||!court.candidates.length)?" disabled":"")+'>APPOINT · '+c.envoy+'G</button></div>';
  const warLine=r.treaty==="war"?'<p class="diplomacy-realm__hint">WAR EXHAUSTION '+Math.round(r.warExhaustion)+'/100 · '+esc(r.warExhaustionLabel)+'</p>':'';
  return '<article class="diplomacy-realm diplomacy-realm--'+esc(r.treatyTone)+'" data-diplomacy-realm="'+esc(r.id)+'">'+
   '<div class="diplomacy-realm__head"><div><span class="diplomacy-realm__region">'+esc(r.region)+' · '+esc(r.specialty)+'</span><h4>'+esc(r.name)+'</h4><p>'+esc(r.ruler)+' · '+esc(r.trait)+'</p></div><span class="diplomacy-treaty diplomacy-treaty--'+esc(r.treatyTone)+'">'+esc(r.treatyLabel)+'</span></div>'+
   meter("RELATION",r.relation)+
   '<div class="diplomacy-realm__stats"><span>TRUST<b>'+Math.round(r.trust)+'</b></span><span>FEAR<b>'+Math.round(r.fear)+'</b></span><span>GOODS TRADED<b>'+number(r.tradeVolume)+'</b></span></div>'+
   envoyBlock+warLine+
   '<p class="diplomacy-realm__hint">'+esc(r.relationLabel+" · "+hint)+'</p>'+
   (latest?'<p class="diplomacy-realm__record">'+esc(latest.summary)+' · year '+latest.year+'</p>':'')+
   '<div class="diplomacy-actions">'+actions.join("")+'</div></article>';
 }).join("");
 return intro("THE NEIGHBOURING COURTS","Diplomacy","Relationships persist between years and connect trade, faction politics, war pressure and royal prestige. Envoys and the chancellor now shape annual trust, trade terms and border risk.")+
  '<div class="command-summary"><div><small>NEIGHBOURS</small><strong>'+d.realms.length+'</strong></div><div><small>AVG RELATION</small><strong>'+Math.round(d.averageRelation)+'</strong></div><div><small>TRADE PACTS</small><strong>'+d.counts.trade+'</strong></div><div><small>ALLIANCES</small><strong>'+d.counts.alliance+'</strong></div><div><small>ENVOYS</small><strong>'+d.envoys+'</strong></div><div><small>AT WAR</small><strong>'+d.counts.war+'</strong></div></div>'+
  '<div class="command-section-title">'+d.realms.length+' NEIGHBOURING REALMS · LAST REVIEW YEAR '+d.lastUpdateYear+'</div><div class="diplomacy-grid">'+rows+'</div>'+
  '<p class="command-note">Gifts improve trust. Trade raises relation and improves prices through the market. Trade pacts deepen that advantage; alliances send annual aid. An appointed envoy adds annual relation and improves trade terms, while a chancellor strengthens every gift and treaty. War closes trade, raises exhaustion and makes border incidents more likely. Diplomacy resolves once per year, so its cost stays bounded to four realms.</p>';
}
function decisions(){
 const h=getRoyalHouse(),children=h.children.map(p=>'<article class="command-policy"><div><strong>'+esc(p.person.name)+'</strong><p>'+esc(p.person.role)+' · age '+Math.floor(p.person.ageYears)+' · born '+(p.person.bornAtYear||"?")+'</p></div><button data-command="heir" data-value="'+esc(p.personId)+'">'+(h.heir?.personId===p.personId?"CURRENT HEIR":"DESIGNATE")+'</button></article>').join("");
 const options=h.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.person.name)+' · '+Math.floor(p.person.ageYears)+' · '+esc(p.person.species)+'</option>').join("");
 return intro("ROYAL HOUSE","Royal decisions","Dynastic actions are explicit and recorded in personal memories.")+'<img class="command-hero-art" src="assets/royal-court-art.svg" alt="Royal court, castle and heraldic banners" loading="lazy"><div class="command-summary"><div><small>SOVEREIGN</small><strong>'+esc(h.king?.person?.name||"No sovereign")+'</strong></div><div><small>CONSORT</small><strong>'+esc(h.consort?.person?.name||"None")+'</strong></div><div><small>HEIR</small><strong>'+esc(h.heir?.person?.name||"Undesignated")+'</strong></div></div>'+(h.consort?'':'<div class="command-section-title">ROYAL MARRIAGE</div><div class="command-inline"><select id="royal-consort-select"><option value="">Choose an adult resident…</option>'+options+'</select><button data-command="consort">FORM MARRIAGE</button></div>')+'<div class="command-actions"><button data-command="royal-birth" '+(!h.consort?'disabled':'')+'>WELCOME ROYAL CHILD · 20 FOOD / 15 GOLD</button></div><div class="command-section-title">LIVING ROYAL CHILDREN</div><div class="command-policy-list">'+(children||'<p class="command-note">No living royal children are recorded yet.</p>')+'</div><p class="command-note">Succession uses the designated living heir; absent one, it falls back to a living child in the late sovereign’s explicit family record. No unrelated person is silently promoted.</p>';
}
function cards(){
 const hand=state.hand||[],selected=state.selectedCardInstanceId,full=hand.length>=5;
 const rows=hand.map(c=>'<article class="command-card'+(c.instanceId===selected?' is-selected':'')+'"><span class="command-card-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-card-atlas.svg#'+esc(cardSprite(c.group))+'"></use></svg></span><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.categoryName||c.group||"Card")+' · '+esc(c.rarity||"common")+'</small><p>'+esc(c.desc||"")+'</p></div><button data-command="select-card" data-value="'+esc(c.instanceId)+'">'+(c.instanceId===selected?'SELECTED':'SELECT')+'</button></article>').join("");
 return intro("ROYAL DECK","Card management","Draw a card only when you want one. Select it here, then drag it from the Selected Card panel onto the map.")+'<div class="command-summary"><div><small>HAND</small><strong>'+hand.length+' / 5</strong></div><div><small>DRAW PILE</small><strong>'+number(state.availableCards?.length)+'</strong></div><div><small>REWARDS QUEUED</small><strong>'+number(state.cardRewardQueue?.length)+'</strong></div></div><div class="command-actions"><button type="button" data-command="draw-card"'+(full?' disabled':'')+'>DRAW RANDOM CARD</button></div><div class="command-card-list">'+(rows||'<p class="command-note">Your hand is empty. Draw a card when you want one.</p>')+'</div>';
}
function crownSupplyPanel(){
 const s=getCrownSupplySnapshot();
 const grain=GRAIN_CONTRACTS.filter(contract=>contract.level>0).map(contract=>'<button type="button" class="command-choice" data-command="crown-grain" data-value="'+contract.level+'"'+(s.grainLevel===contract.level?' disabled':'')+'>'+(contract.level===4?'WAR GRANARY · 2.5Y RATIONS':'GRAIN '+contract.level+' · '+contract.target+' RESERVE')+'</button>').join("");
 const water=WATERWORKS_LEVELS.filter(works=>works.level>0).map(works=>'<button type="button" class="command-choice" data-command="crown-water" data-value="'+works.level+'"'+(s.waterworksLevel===works.level?' disabled':'')+'>WATER '+works.level+' · +'+Math.round(works.coverage*100)+'%</button>').join("");
 const commissary=s.commissary||{wood:0,stone:0,shortfall:0,keep:{wood:600,stone:600}};
 const canProvision=s.grainLevel>0&&commissary.shortfall>0&&(commissary.wood>=25||commissary.stone>=25);
 return '<div class="command-section-title">CROWN SUPPLY · GRAIN, WATER & SHELTER</div>'+
 '<div class="command-summary"><div><small>GRAIN CONTRACT</small><strong>'+(s.grainLevel?('LEVEL '+s.grainLevel):'NONE')+'</strong></div><div><small>FOOD TARGET</small><strong>'+number(s.grainTarget)+'</strong></div><div><small>ANNUAL DEMAND</small><strong>'+number(Math.round(s.annualDemand))+'</strong></div><div><small>RESERVE COVERAGE</small><strong>'+s.reserveYears.toFixed(1)+' Y</strong></div><div><small>WATERWORKS</small><strong>'+(s.waterworksLevel?('LEVEL '+s.waterworksLevel):'NONE')+'</strong></div><div><small>COVERAGE</small><strong>'+Math.round(s.waterworksCoverage*100)+'%</strong></div><div><small>TIMBER COTTAGES</small><strong>'+number(s.timberCottages)+'</strong></div><div><small>STONE HOUSES</small><strong>'+number(s.stoneHouses)+'</strong></div></div>'+
 '<div class="command-note">Grain contracts buy from open, non-war partners at a fixed crown rate and deliver in four seasonal shipments. The war granary targets 2.5 years of the realm real annual demand (residents + garrison). Surplus timber and stone above the construction reserve can be sold through the market or bartered directly for grain when the coin route is exhausted. Waterworks pay an annual crew and cover occupied homes beyond the wells; if the payroll fails, coverage stops.</div>'+
 '<div class="command-actions">'+grain+(s.grainLevel?'<button type="button" class="command-choice" data-command="crown-grain" data-value="0">END GRAIN CONTRACT</button>':'')+'</div>'+
 '<div class="command-note">'+esc(s.grainRouteOpen?('Open grain routes: '+s.grainPartners+' partner'+(s.grainPartners===1?'':'s')+'. Target '+s.grainTarget+' food · '+commissary.shortfall+' short. Commissary surplus: '+commissary.wood+' wood · '+commissary.stone+' stone above the '+commissary.keep.wood+'/'+commissary.keep.stone+' reserve.'):'No open grain route: end the war or restore a trade partner before signing a contract.')+'</div>'+
 '<div class="command-actions">'+water+(s.waterworksLevel?'<button type="button" class="command-choice" data-command="crown-water" data-value="0">CLOSE WATERWORKS</button>':'')+'</div>'+
 '<div class="command-actions"><button type="button" class="command-choice" data-command="crown-provision"'+(canProvision?'':' disabled')+'>PROVISION THE GRANARY · CALL IN GRAIN / BARTER GOODS</button></div>'+
 '<div class="command-actions"><button type="button" class="command-choice" data-command="crown-housing"'+(s.timberCottages<1||Number(s.housingCost)>Number(state.resources.gold||0)?' disabled':'')+'>RAISE A STONE HOUSE · '+number(s.housingCost)+' GOLD</button></div>'+
 '<p class="command-note">Crown supply settles grain every season and the waterworks payroll once a year. The grain rate is paid in gold; the waterworks payroll is separate from the wells and the garrison. Housing upgrades are permanent and do not create a new building.</p>';
}
function economy(){
 const w=getWorkforceSnapshot(),h=getHousingSnapshot(),homes=getHouseholdSnapshot().homes||[];
 const resources=Object.entries(state.resources||{}).map(([k,v])=>'<div class="command-resource"><span>'+esc(k)+'</span><strong>'+amount(v)+'</strong></div>').join("");
 const flow=Object.entries(state.incomeThisTick||{}).map(([k,v])=>'<div class="command-resource"><span>'+esc(k)+' · this tick</span><strong class="'+(Number(v)>0?'is-positive':Number(v)<0?'is-negative':'')+'">'+(Number(v)>0?'+':'')+amount(v)+'</strong></div>').join("");
 const ledger=state.economy?.lastLedger;
 const history=Array.isArray(state.economy?.history)?state.economy.history:[];
 const ledgerRows=ledger?[
  ["Food demand",ledger.foodDemand,"food"],["Food consumed",ledger.foodConsumed,"food"],["Food shortage",ledger.foodShortage,"food"],
  ["Taxes collected",ledger.taxesCollected,"gold"],["Wages paid",ledger.wagesPaid,"gold"],["Building & road upkeep",ledger.upkeepPaid,"gold"],
  ["Furniture upkeep",ledger.furnitureUpkeepPaid,"gold"],
  ["Unpaid wages",ledger.unpaidWages,"gold"],["Unpaid upkeep",ledger.unpaidUpkeep,"gold"],["Unpaid furniture",ledger.unpaidFurniture,"gold"],["Net treasury change",ledger.netGold,"gold"]
 ].map(([label,value,unit])=>'<div class="ledger-row"><span>'+esc(label)+'</span><strong>'+amount(value)+' '+unit+'</strong></div>').join(""):'<p class="command-note">No completed financial ledger yet. The simulation settles a ledger every 20 in-game days.</p>';
 const totals=state.economy||{};
 return intro("TREASURY & PRODUCTION","Realm economy","Live resource stocks, current-tick flows and the latest completed 20-day financial ledger. No forecasts are inferred.")+
 '<div class="command-summary"><div><small>POPULATION</small><strong>'+h.population+'</strong></div><div><small>HOUSING</small><strong>'+h.capacity+'</strong></div><div><small>FREE BEDS</small><strong>'+h.available+'</strong></div><div><small>EMPLOYED</small><strong>'+number(w.employed)+'</strong></div></div>'+
 crownSupplyPanel()+'<div class="command-section-title">CURRENT ROYAL STORES · STOCK</div><div class="command-resource-grid">'+resources+'</div>'+
 '<div class="command-section-title">RESOURCE FLOW · CURRENT SIMULATION TICK</div><div class="command-resource-grid">'+flow+'</div>'+
 '<div class="command-section-title">LATEST FINANCIAL SETTLEMENT · 20 IN-GAME DAYS</div><div class="ledger-grid">'+ledgerRows+'</div>'+
 '<div class="command-section-title">TREASURY HISTORY · '+(history.length?history.length+' COMPLETED SETTLEMENTS':'AWAITING FIRST SETTLEMENT')+'</div>'+treasuryCharts(history)+
 '<div class="command-section-title">CUMULATIVE LEDGER TOTALS</div><div class="command-summary"><div><small>DAYS SETTLED</small><strong>'+number(totals.daysElapsed)+'</strong></div><div><small>TAXES</small><strong>'+amount(totals.taxesCollected)+' G</strong></div><div><small>WAGES</small><strong>'+amount(totals.wagesPaid)+' G</strong></div><div><small>UPKEEP</small><strong>'+amount(totals.upkeepPaid)+' G</strong></div><div><small>FURNITURE</small><strong>'+amount(totals.furnitureUpkeepPaid)+' G</strong></div></div>'+
 '<div class="command-section-title">WORKFORCE & HOUSEHOLDS</div><div class="command-summary"><div><small>WORKERS</small><strong>'+number(w.population)+'</strong></div><div><small>UNEMPLOYED</small><strong>'+number(w.unemployed)+'</strong></div><div><small>BUILDINGS</small><strong>'+number(w.buildings)+'</strong></div><div><small>HOMES</small><strong>'+number(homes.length)+'</strong></div></div>'+
 '<p class="command-note">No forecasts are inferred. A bounded historical time series now retains the latest 24 completed 20-day settlements; the latest completed ledger is shown above and the charts record stock and ledger values only.</p>';
}
function foresterStewardship(building){
 if(building.type!==TYPE.FORESTER)return "";
 try{
  const range=foresterRangeSummary(building);
  const percent=Math.round(range.fill*100);
  const status=building.foresterReason||"Awaiting assignment";
  return '<section class="forester-stewardship" aria-label="Forester stewardship" data-forester-stewardship="'+esc(building.id)+'" data-forest-stock="'+range.stock+'" data-forest-capacity="'+range.capacity+'" data-forest-restorable="'+range.restorable+'" data-forest-status="'+esc(status)+'"><div class="forester-stewardship-heading"><span>FOREST STEWARDSHIP · '+range.radius+'-TILE RANGE</span><strong>'+number(range.stock)+' / '+number(range.capacity)+'</strong></div><div class="forester-stewardship-meter" role="img" aria-label="'+percent+' percent of the stewardship range stocked"><span><i style="width:'+percent+'%"></i></span><strong>'+percent+'%</strong></div><div class="forester-stewardship-facts"><span>RESTORABLE STANDS<strong>'+number(range.restorable)+'</strong></span><span>STATUS<strong>'+esc(status)+'</strong></span></div></section>';
 }catch{return "";}
}
function buildings(){
 const workforce=getWorkforceSnapshot();const city=getCitySummary(),settlement=getSettlementSnapshot(),logistics=getLogisticsSnapshot();
 const records=state.entities.filter(entity=>!entity.dead&&entity.isBuilding()).slice().sort((a,b)=>{
  const an=CARD_DECK.find(card=>card.type===a.type)?.name||BUILDING_LABELS[a.type]||String(a.type),bn=CARD_DECK.find(card=>card.type===b.type)?.name||BUILDING_LABELS[b.type]||String(b.type);
  return an.localeCompare(bn)||String(a.id).localeCompare(String(b.id));
 });
 const counts=new Map();
 for(const building of records)counts.set(building.type,(counts.get(building.type)||0)+1);
 const typeSummary=[...counts.entries()].map(([type,count])=>{
  const card=CARD_DECK.find(item=>item.type===type);
  return '<span class="building-type-chip">'+esc(card?.name||BUILDING_LABELS[type]||("Building "+type))+' <strong>'+count+'</strong></span>';
 }).join("");
 const buildingSprite=(type)=>({
  [TYPE.KEEP]:"keep",[TYPE.HOUSE]:"cottage",[TYPE.FARM]:"farm",[TYPE.LUMBER]:"lumber-yard",
  [TYPE.QUARRY]:"quarry",[TYPE.TOWER]:"watchtower",[TYPE.WALL]:"wall",[TYPE.TAVERN]:"tavern",
  [TYPE.TEMPLE]:"temple",[TYPE.BARRACKS]:"barracks",[TYPE.MILL]:"windmill",[TYPE.STABLE]:"stable",
  [TYPE.WONDER]:"wonder",[TYPE.GOLDMINE]:"goldmine",[TYPE.BARREL]:"storehouse",
  [TYPE.TENT]:"cottage",[TYPE.STONE_HOUSE]:"cottage",[TYPE.WAREHOUSE]:"storehouse",[TYPE.SAWMILL]:"lumber-yard",
  [TYPE.BAKERY]:"windmill",[TYPE.WELL]:"windmill",[TYPE.MASON]:"quarry",[TYPE.FORESTER]:"lumber-yard",
  [TYPE.CLINIC]:"temple",[TYPE.MARKET]:"tavern"
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
   if([TYPE.LUMBER,TYPE.FORESTER].includes(building.type))siteNote="Forest stock at site tile: "+number(node.forestStock)+" / "+number(node.forestCapacity)+(node.forestTypeLabel?" · "+node.forestTypeLabel+" · "+(node.forestAge||"age unknown")+" · "+(node.forestSpecies||[]).slice(0,4).join(", ")+" · Snow depth: "+number(node.forestSnowDepthCm)+" cm · Exposure: "+Math.round((node.forestExposure||0)*100)+"% · Fire risk: "+Math.round((node.forestFireRisk||0)*100)+"% · Pest risk: "+Math.round((node.forestPestRisk||0)*100)+"% · Monoculture: "+Math.round((node.forestMonoculture||0)*100)+"% · Work: "+Math.round((node.forestWorkFactor||0)*100)+"% · Visibility: "+Math.round((node.forestVisibility||0)*100)+"% · Sight: "+number(node.forestSightRadius)+" tiles · Diversity: "+Math.round((node.forestSpeciesDiversity||0)*100)+"% · Wind exposure: "+Math.round((node.forestWindExposure||0)*100)+"% · Wetness: "+Math.round((node.forestWetness||0)*100)+"% · Deadwood: "+Math.round((node.forestDeadwood||0)*100)+"%"+(node.forestTreeline?" · Treeline":"")+" · Browse: "+Math.round((node.forestBrowsingPressure||0)*100)+"% · Predators: "+Math.round((node.forestPredatorPressure||0)*100)+"%":"")+(node.forestSuccession?(node.forestSuccession.label?" · Succession: "+esc(node.forestSuccession.label)+" · "+number(node.forestSuccession.age)+" days":" · Recovered woodland")+(node.forestSuccession?.contained?" · Control party until day "+number(node.forestSuccession.containedUntil):""):"")+" · Wildlife: "+(forestFaunaSummaryAt(building.x,building.y,node.forestFauna)||"none recorded at this tile")+" · Forest products: "+(forestGatheringSummary()||"none gathered yet");
   else if([TYPE.QUARRY,TYPE.MASON].includes(building.type))siteNote="Stone stock at site tile: "+number(node.stoneStock)+" / "+number(node.stoneCapacity);
   else if(building.type===TYPE.FARM){const effective=Number(building.field?.maxFertility);siteNote="Site fertility: "+number(node.fertility)+" / 100"+(Number.isFinite(effective)&&effective>0?" · effective soil: "+number(effective)+" / 100":"")+" · water access: "+(node.waterAccess?"yes":"no");}
   else if(building.type===TYPE.WELL)siteNote="Water access at site tile: "+(node.waterAccess?"yes":"no");
   else if(building.type===TYPE.STABLE)siteNote="Pannage reserve: "+esc(pannageSummary(building))+" · feed comes from acorns, beechnuts and chestnuts gathered in the forest ledger.";
  }catch{}
  const deliveryAvailability=forestDeliveryAvailability(building);
  const thinningAvailability=building.type===TYPE.LUMBER?forestThinningAvailability(building,6):null;
  const forestGather=[TYPE.LUMBER,TYPE.FORESTER].includes(building.type)?[
   '<button type="button" class="command-choice" data-gather-forest="'+esc(building.id)+'">GATHER FOREST PRODUCTS</button>',
   '<button type="button" class="command-choice" data-deliver-forest="'+esc(building.id)+'"'+(deliveryAvailability.available>0?'':' disabled title="'+esc(deliveryAvailability.reason)+'"')+'>DELIVER FOREST GOODS</button>',
   '<button type="button" class="command-choice" data-process-hunt="'+esc(building.id)+'">PROCESS FOREST HUNT</button>',
   '<button type="button" class="command-choice" data-suppress-forest="'+esc(building.id)+'">SUPPRESS FOREST DISTURBANCE</button>',
   ...(building.type===TYPE.LUMBER?['<button type="button" class="command-choice" data-thin-forest="'+esc(building.id)+'"'+(thinningAvailability.ok?'':' disabled title="'+esc(thinningAvailability.reason)+'"')+'>THIN NEAREST STAND</button>']:[]),
  ].join(""):"";
  const forestPannage=building.type===TYPE.STABLE?'<button type="button" class="command-choice" data-feed-stable="'+esc(building.id)+'">FEED STABLE FROM MAST</button>':"";
  const detail=card?.desc||BUILDING_LABELS[building.type]||"No additional building description is recorded.";
  const site=constructionSnapshot(building);
  const inventory=getInventorySummary(building);
  const jobs=getBuildingLogisticsStatus(building)||[];
  const supply=getBuildingSupplyReason(building)||getServiceReason(building);
  const reservedIn=Object.entries(inventory?.reservedIn||{}).filter(([,value])=>Number(value)>0).map(([good,value])=>value+" "+good).join(", ");
  const reservedOut=Object.entries(inventory?.reservedOut||{}).filter(([,value])=>Number(value)>0).map(([good,value])=>value+" "+good).join(", ");
  const storedGoods=inventory?Object.entries(inventory.stored||{}).filter(([,value])=>Number(value)>0).map(([good,value])=>value+" "+good).join(" · "):"";
  const storeText=!inventory?"No local store":inventory.kind==="warehouse"?
   inventory.used+" / "+inventory.capacity+" used"+
   (storedGoods?" · "+storedGoods:" · empty")+
   (reservedIn?" · reserved in: "+reservedIn:"")+(reservedOut?" · reserved out: "+reservedOut:""):[
   ...Object.entries(inventory.input||{}).map(([good,value])=>value+" "+good+" in"),
   ...Object.entries(inventory.output||{}).map(([good,value])=>value+" "+good+" out"),
   ...(reservedIn?["reserved in: "+reservedIn]:[]),
   ...(reservedOut?["reserved out: "+reservedOut]:[])
  ].join(" · ")||"Empty";
  const haulText=jobs.length?jobs.map(job=>job.quantity+" "+job.good+" · "+job.status+(job.reason?" · "+job.reason:"")+" · "+job.quantity+" reserved, "+job.delivered+" delivered").join(" | "):"No active haul";
  const profileField=inventory?.kind==="warehouse"?'<span>Warehouse profile<strong>'+(building.type===TYPE.KEEP?esc(inventory.profileLabel||"General store")+" · fixed by the crown":'<select class="warehouse-profile-select" data-warehouse-profile="'+esc(building.id)+'" aria-label="Warehouse profile for '+esc(name)+'">'+Object.values(WAREHOUSE_PROFILES).map(profile=>'<option value="'+esc(profile.id)+'"'+(inventory.profile===profile.id?' selected':'')+'>'+esc(profile.label)+" · "+number(profile.capacity)+'</option>').join("")+'</select>')+'</strong></span>':"";
  const fieldText=building.field?" · field "+building.field.stage+" ("+Math.round(building.field.growth)+"%) · soil "+Math.round(building.field.fertility)+"%"+(building.field.resting?" · resting":""):"";
  const stewardship=foresterStewardship(building);
  return '<details class="building-record" data-building-name="'+esc(name.toLowerCase())+'"><summary><svg class="building-record-art" viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-building-atlas.svg#'+buildingSprite(building.type)+'"></use></svg><span class="building-record-title"><strong>'+esc(name)+'</strong><small>'+esc(building.id||("record-"+index))+' · '+Math.round(building.x)+', '+Math.round(building.y)+'</small></span><span class="building-record-status"><b>'+(isUnderConstruction(building)?site.percent+'%':condition+'%')+'</b><small>'+(isUnderConstruction(building)?"built":"condition")+'</small></span></summary><div class="building-record-details"><p>'+esc(detail)+'</p>'+stewardship+'<div class="building-detail-grid"><span>Footprint<strong>'+amount(width)+' × '+amount(height)+' tiles</strong></span><span>Health<strong>'+amount(hp)+' / '+amount(maxHp)+'</strong></span><span>Construction<strong>'+esc(site.status)+' · '+site.percent+'%</strong></span><span>Staff<strong>'+staff+(capacity?' / '+capacity:' · not staffed')+'</strong></span><span>Workforce efficiency<strong>'+(efficiency===null?'not applicable':efficiency+'%')+'</strong></span><span>Recorded card cost<strong>'+esc(costs)+'</strong></span><span>Local store<strong>'+esc(storeText)+'</strong></span>'+profileField+'<span>Active haul<strong>'+esc(haulText)+'</strong></span><span>Supply / service<strong>'+esc(supply||"Operating")+'</strong></span><span>Site data<strong>'+esc(siteNote)+esc(fieldText)+'</strong></span>'+forestGather+forestPannage+'</div></div></details>';
 }).join("");
 const rejection=logistics.lastRejection?'<p class="command-note logistics-rejection">LAST ORDER REJECTED · '+esc(logistics.lastRejection.reason)+' · '+esc(logistics.lastRejection.kind||"job")+' '+(logistics.lastRejection.good?esc(logistics.lastRejection.good):"")+' · tick '+number(logistics.lastRejection.tick)+'</p>':"";
 const jobRows=[...(logistics.jobs||[]),...(logistics.completed||[])].map(job=>'<div class="logistics-job'+(job.status==="blocked"?' is-blocked':'')+'" data-job-status="'+esc(job.status)+'"><strong>'+esc((job.id||"job")+" · "+job.quantity+" "+job.good+" · "+job.status)+'</strong><small>'+esc((job.from?.kind||"?")+" "+(job.from?.id||"?")+" → "+(job.to?.kind||"?")+" "+(job.to?.id||"?")+" · reserved "+number(job.reserved)+" · picked "+number(job.picked)+" · delivered "+number(job.delivered))+(job.carrierId?" · carrier "+esc(job.carrierId):"")+(job.attempts?" · attempts "+esc(job.attempts):"")+(job.reason?" · "+esc(job.reason):"")+'</small></div>').join("");
 const warehouseRows=(logistics.warehouses?.rows||[]).map(row=>{
  const stored=Object.entries(row.stored||{}).filter(([,value])=>Number(value)>0).map(([good,value])=>value+" "+good).join(" · ")||"empty";
  return '<div class="logistics-job warehouse-row" data-warehouse-profile="'+esc(row.profile)+'"><strong>'+esc((row.type===TYPE.KEEP?"Royal Keep":"Warehouse")+" · "+(row.profileLabel||"General store")+" · "+row.used+" / "+row.capacity)+'</strong><small>'+esc(row.id+" · "+Math.round(row.x)+", "+Math.round(row.y)+" · "+stored+" · reserved in "+row.reservedIn+" / out "+row.reservedOut)+'</small></div>';
 }).join("");
 const ledger=(logistics.ledger||[]).slice().reverse();
 const movementRows=ledger.slice(0,40).map(entry=>'<div class="logistics-job logistics-movement" data-movement-type="'+esc(entry.type||"move")+'"><strong>'+esc(String(entry.type||"move").toUpperCase())+" · "+esc(entry.quantity+" "+(entry.good||"stock"))+(entry.scope==="resource"?" · RESOURCE":"")+'</strong><small>'+esc((entry.from||"—")+" → "+(entry.to||"—")+" · tick "+entry.tick+" · "+(entry.cause||entry.type||"move"))+(entry.jobId?" · job "+esc(entry.jobId):"")+(entry.houseId?" · household "+esc(entry.houseId):"")+(entry.key?" · key "+esc(entry.key):"")+'</small></div>').join("");
 const auditRows=(logistics.audit?.rows||[]).map(row=>'<div class="logistics-job logistics-audit'+(row.balanced?'':' is-blocked')+'" data-audit-good="'+esc(row.good)+'"><strong>'+esc(row.good.toUpperCase()+" · "+(row.balanced?"BALANCED":"DIFFERENCE "+row.difference))+'</strong><small>opening '+number(row.opening)+" + produced "+number(row.produced)+" − consumed "+number(row.consumed)+" = expected "+number(row.expected)+" · physical "+number(row.physical)+" · "+esc(row.scope)+'</small></div>').join("");
 return intro("SETTLEMENT ARCHITECTURE","Building register","Inspect every surviving structure using its actual simulation entity, health, footprint, staffing and site data.")+
 '<div class="command-summary"><div><small>STRUCTURES</small><strong>'+records.length+'</strong></div><div><small>CONSTRUCTION SITES</small><strong>'+city.construction+'</strong></div><div><small>CARRIERS</small><strong>'+city.carriers+'</strong></div><div><small>ACTIVE HAULS</small><strong>'+city.activeJobs+'</strong></div><div><small>BLOCKED HAULS</small><strong>'+number(city.blockedJobs||0)+'</strong></div><div><small>WAREHOUSE SPACE USED</small><strong>'+number(city.warehouses?.used||0)+' / '+number(city.warehouses?.capacity||0)+'</strong></div><div><small>WAREHOUSE RESERVED</small><strong>'+number(city.warehouses?.reservedIn||0)+' in · '+number(city.warehouses?.reservedOut||0)+' out</strong></div><div><small>WATER COVERAGE</small><strong>'+(settlement.needs?Math.round(settlement.needs.water*100)+'%':'—')+'</strong></div></div>'+
 '<div class="command-section-title">ALL STORES</div><div class="logistics-overview">'+(warehouseRows||'<p class="command-note">No warehouse exists yet.</p>')+'</div>'+
 '<div class="command-section-title">DELIVERY JOBS · '+number(logistics.jobCount||0)+' / '+number(logistics.jobLimit||0)+'</div>'+rejection+'<div class="logistics-overview">'+(jobRows||'<p class="command-note">No delivery jobs are recorded.</p>')+'</div>'+
 '<div class="command-section-title">GOODS AUDIT · '+((logistics.audit?.balanced)?"ALL BOOKS BALANCED":"CHECK DIFFERENCES")+'</div><div class="logistics-overview">'+(auditRows||'<p class="command-note">No goods audit is recorded yet.</p>')+'</div>'+
 '<div class="command-section-title">MOVEMENT ARCHIVE · '+number(logistics.ledgerSize||0)+' / '+number(logistics.ledgerLimit||0)+' ENTRIES</div><div class="logistics-overview">'+(movementRows||'<p class="command-note">No good movement is recorded yet.</p>')+'</div>'+
 '<div class="building-type-summary">'+typeSummary+'</div><label class="building-search-label" for="building-search">FILTER STRUCTURES</label><input id="building-search" class="building-search" type="search" maxlength="80" placeholder="Search by building type or name">'+
 '<div class="building-register">'+(rows||'<p class="command-note">No buildings are recorded in this realm yet.</p>')+'</div>'+
 '<p class="command-note">Construction, local stores, field stages and active hauls are read from live simulation state. Site resource values are taken from the structure centre tile only; they are not a production rate. Construction and demolition remain in the build interface.</p>';
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
 return '<button type="button" class="dynasty-person'+(entity.isArchived?' is-deceased':'')+'" data-open-person="'+esc(id)+'" data-lineage-node-id="'+esc(id)+'" aria-label="Open character dossier for '+esc(person.name||"Unnamed person")+'"><svg class="dynasty-person-portrait" viewBox="0 0 256 320" aria-hidden="true"><use href="assets/royal-portraits.svg#'+portraitSymbol(entity)+'"></use></svg><span class="dynasty-person-copy"><strong>'+esc(person.name||"Unnamed person")+'</strong><small>'+esc(person.role||person.species||"Resident")+' · '+esc(age)+'</small><em>'+esc(flags||"RECORDED FAMILY MEMBER")+'</em></span></button>';
}

function ensureDynastyNetworkStyles(){
 if(dynastyStylesRequested)return;
 const link=document.createElement("link");
 dynastyStylesRequested=true;
 link.rel="stylesheet";
 link.href="css/dynasty-network.css";
 document.head.append(link);
}
function lineageGraph(king,heirId){
 const rootId=String(king?.personId||king?.person?.id||king?.id||"");
 const rootFamily=getFamilySnapshot(rootId)||{};
 const lanes=[
  {id:"grandparents",label:"GRANDPARENTS",ids:[]},
  {id:"parents",label:"PARENTS",ids:[]},
  {id:"royal-generation",label:"THE SOVEREIGN & SIBLINGS",ids:[]},
  {id:"collateral",label:"AUNTS & UNCLES",ids:[]},
  {id:"cousins",label:"COUSINS",ids:[]},
  {id:"children",label:"ROYAL CHILDREN",ids:[]}
 ];
 const laneById=new Map(lanes.map(lane=>[lane.id,lane]));
 const MAX_NODES=80,MAX_EDGES=120;
 const nodes=new Map(),edges=[],edgeKeys=new Set();
 const idOf=entity=>String(entity?.personId||entity?.person?.id||entity?.id||"");
 const add=(entity,laneId)=>{
  const id=idOf(entity),lane=laneById.get(laneId);
  if(!id||!entity?.person||!lane)return "";
  if(nodes.has(id))return id;
  if(nodes.size>=MAX_NODES)return "";
  nodes.set(id,entity);lane.ids.push(id);return id;
 };
 const connect=(from,to,kind="parent")=>{
  if(!from||!to||from===to||!nodes.has(from)||!nodes.has(to)||edges.length>=MAX_EDGES)return;
  const key=from+"|"+to+"|"+kind;
  if(edgeKeys.has(key))return;
  edgeKeys.add(key);edges.push({from,to,kind});
 };
 const parentRecords=(rootFamily.parents||[]).map(link=>familyRecord(link.personId)).filter(Boolean).slice(0,2);
 for(const parent of parentRecords){
  const parentId=add(parent,"parents");
  const parentFamily=getFamilySnapshot(parentId)||{};
  for(const link of (parentFamily.parents||[]).slice(0,2)){
   const grandparent=familyRecord(link.personId),grandparentId=add(grandparent,"grandparents");
   if(grandparentId)connect(grandparentId,parentId,link.kind==="guardian"?"guardian":"parent");
  }
 }
 const sovereignId=add(king,"royal-generation");
 const house=getRoyalHouse();
 const consortId=add(house.consort,"royal-generation");
 if(consortId)connect(sovereignId,consortId,"partner");
 for(const parent of parentRecords)connect(idOf(parent),sovereignId,(rootFamily.parents||[]).find(link=>String(link.personId)===idOf(parent))?.kind==="guardian"?"guardian":"parent");
 for(const link of (rootFamily.siblings||[]).slice(0,16)){
  const sibling=familyRecord(link.personId),siblingId=add(sibling,"royal-generation");
  if(siblingId)connect(sovereignId,siblingId,"sibling");
 }
 for(const parent of parentRecords){
  const parentId=idOf(parent),parentFamily=getFamilySnapshot(parentId)||{};
  for(const siblingLink of (parentFamily.siblings||[]).slice(0,12)){
   const aunt=familyRecord(siblingLink.personId),auntId=add(aunt,"collateral");
   if(!auntId)continue;
   connect(parentId,auntId,"sibling");
   const auntChildren=getFamilySnapshot(auntId)?.children||[];
   for(const cousinLink of auntChildren.slice(0,12)){
    const cousin=familyRecord(cousinLink.personId),cousinId=add(cousin,"cousins");
    if(cousinId)connect(auntId,cousinId,cousinLink.kind==="guardian"?"guardian":"parent");
   }
  }
 }
 for(const childLink of (rootFamily.children||[]).slice(0,24)){
  const child=familyRecord(childLink.personId),childId=add(child,"children");
  if(!childId)continue;
  const childFamily=getFamilySnapshot(childId)||{};
  const explicitParents=(childFamily.parents||[]).map(link=>String(link.personId));
  if(explicitParents.includes(rootId))connect(rootId,childId,childLink.kind==="guardian"?"guardian":"parent");
  if(consortId&&explicitParents.includes(consortId))connect(consortId,childId,"parent");
  if(!explicitParents.length)connect(rootId,childId,"parent");
 }
 const laneMarkup=lanes.filter(lane=>lane.ids.length).map(lane=>
  '<section class="dynasty-lineage-lane" data-lineage-lane="'+lane.id+'"><h4>'+lane.label+'</h4><div class="dynasty-lineage-lane__nodes">'+
  lane.ids.map(id=>familyNode(nodes.get(id),heirId)).join("")+'</div></section>'
 ).join("");
 const edgeMarkup=edges.map(edge=>
  '<path class="dynasty-lineage-edge dynasty-lineage-edge--'+edge.kind+'" data-lineage-from="'+esc(edge.from)+'" data-lineage-to="'+esc(edge.to)+'"></path>'
 ).join("");
 const cousinNote=laneById.get("cousins").ids.length?"":'<p class="command-note">No cousin links can be verified from the recorded kinship graph.</p>';
 return '<section class="dynasty-lineage-graph" aria-label="Verified royal family relationship graph"><svg class="dynasty-lineage-edges" aria-hidden="true">'+edgeMarkup+'</svg>'+
 laneMarkup+cousinNote+'<p class="dynasty-lineage-note">Connectors represent recorded parent, guardian, partnership and sibling relationships. Only linked relatives are shown; unknown branches are not inferred.</p></section>';
}
function drawDynastyConnectors(){
 const graph=document.querySelector(".dynasty-lineage-graph");
 if(!graph)return;
 const svg=graph.querySelector(".dynasty-lineage-edges");
 if(!svg)return;
 const bounds=graph.getBoundingClientRect();
 const width=Math.max(1,graph.scrollWidth,graph.clientWidth),height=Math.max(1,graph.scrollHeight,graph.clientHeight);
 svg.setAttribute("viewBox","0 0 "+width+" "+height);
 svg.setAttribute("width",String(width));svg.setAttribute("height",String(height));
 const nodes=new Map([...graph.querySelectorAll("[data-lineage-node-id]")].map(node=>[node.dataset.lineageNodeId,node]));
 for(const path of svg.querySelectorAll("[data-lineage-from][data-lineage-to]")){
  const from=nodes.get(path.dataset.lineageFrom),to=nodes.get(path.dataset.lineageTo);
  if(!from||!to){path.setAttribute("d","");continue;}
  const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
  let x1=a.left-bounds.left+a.width/2,y1=a.bottom-bounds.top;
  let x2=b.left-bounds.left+b.width/2,y2=b.top-bounds.top;
  if(["partner","sibling"].some(kind=>path.classList.contains("dynasty-lineage-edge--"+kind))){
   const stacked=Math.abs(a.top-b.top)>Math.min(a.height,b.height)*.6;
   if(stacked){
    x1=a.left-bounds.left+a.width/2;y1=a.bottom-bounds.top;
    x2=b.left-bounds.left+b.width/2;y2=b.top-bounds.top;
    const bend=Math.min(18,Math.max(3,Math.abs(y2-y1)*.42));
    path.setAttribute("d","M "+x1+" "+y1+" C "+x1+" "+(y1+bend)+", "+x2+" "+(y2-bend)+", "+x2+" "+y2);
   }else{
    const forward=b.left>=a.left;
    x1=(forward?a.right:a.left)-bounds.left;y1=a.top-bounds.top+a.height/2;
    x2=(forward?b.left:b.right)-bounds.left;y2=b.top-bounds.top+b.height/2;
    const bend=Math.min(24,Math.max(4,Math.abs(x2-x1)*.32));
    path.setAttribute("d","M "+x1+" "+y1+" C "+(x1+(forward?bend:-bend))+" "+y1+", "+(x2-(forward?bend:-bend))+" "+y2+", "+x2+" "+y2);
   }
  }else{
   const bend=Math.max(18,Math.abs(y2-y1)*.42);
   path.setAttribute("d","M "+x1+" "+y1+" C "+x1+" "+(y1+bend)+", "+x2+" "+(y2-bend)+", "+x2+" "+y2);
  }
 }
}

function dynasty(){
 const h=getRoyalHouse(),king=h.king;
 if(!king)return intro("HOUSE OF THE CROWN","Dynasty & lineage","The family tree is assembled from explicit parent, child and partnership records.")+'<div class="command-note">No living sovereign is currently recorded. Start a campaign or inspect the character dossiers for archived family records.</div>';
 const heirId=h.heir?.personId||"";
 const visited=new Set(),generations=[];
 let current=[king];
 for(let depth=0;depth<4&&current.length;depth++){
  const unique=current.filter(entity=>{
   const id=String(entity?.personId||entity?.person?.id||entity?.id||"");
   if(!id||visited.has(id)||!entity?.person)return false;
   visited.add(id);return true;
  }).slice(0,24);
  if(!unique.length)break;
  generations.push('<section class="dynasty-generation"><div class="dynasty-generation-heading"><span>GENERATION '+(depth+1)+'</span><small>'+unique.length+' RECORDED '+(unique.length===1?'PERSON':'PEOPLE')+'</small></div><div class="dynasty-generation-grid">'+unique.map(entity=>familyNode(entity,heirId)).join("")+'</div></section>');
  const next=[];
  for(const entity of unique){
   const id=String(entity.personId||entity.person?.id||entity.id||"");
   const family=getFamilySnapshot(id);
   for(const link of family?.children||[]){
    const child=familyRecord(link.personId);
    if(child&&!visited.has(String(link.personId)))next.push(child);
   }
  }
  current=next;
 }
 const history=h.history.slice().reverse().slice(0,12).map(x=>'<article class="command-history"><strong>YEAR '+number(x.year)+' · '+esc(x.kind)+'</strong><p>'+esc(x.detail)+'</p></article>').join("");
 return intro("HOUSE OF THE CROWN","Dynasty & lineage","A multi-generation view of the actual kinship graph. Select any recorded person to open their full dossier.")+
 '<div class="command-section-title">INTERACTIVE LINEAGE</div>'+lineageGraph(king,heirId)+
 '<div class="command-section-title">DESCENDANTS & SUCCESSION</div><div class="dynasty-tree">'+(generations.join("")||'<p class="command-note">No descendant links are recorded for the current sovereign.</p>')+'</div>'+
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
 const legacy=getLegacySnapshot();
 const legacyRows=legacy.entries.slice(0,24).map(entry=>'<article class="command-history" data-legacy-kind="'+esc(entry.kind)+'"><strong>YEAR '+number(entry.year)+' · '+esc(String(entry.kind).toUpperCase())+'</strong><p>'+esc(entry.title)+(entry.detail?' — '+esc(entry.detail):'')+'</p></article>').join("");
 const legacySection='<div class="command-section-title">LEGACY · '+esc(legacy.era.toUpperCase())+' · PRESTIGE '+number(legacy.prestige)+'</div><div class="command-summary"><div><small>ERA</small><strong>'+esc(legacy.era)+'</strong></div><div><small>PRESTIGE</small><strong>'+number(legacy.prestige)+'</strong></div><div><small>RECORDED DEEDS</small><strong>'+legacy.entryCount+' / '+number(legacy.entries.length?120:120)+'</strong></div><div><small>REFORMS · DISCOVERIES</small><strong>'+number(legacy.reforms)+' · '+number(legacy.discoveries)+'</strong></div></div><p class="command-note">Prestige accrues from recorded deeds and feeds a small annual legitimacy, trade and research bonus. The ledger keeps the most recent '+number(legacy.entries.length?120:120)+' deeds.</p><div class="command-history-list">'+(legacyRows||'<p class="command-note">No legacy deed has been recorded yet.</p>')+'</div>';
 const kinds=[...new Set(entries.map(entry=>String(entry.kind||"realm")))].sort();
 const options=['<option value="all">All categories</option>',...kinds.map(kind=>'<option value="'+esc(kind)+'">'+esc(kind.toUpperCase())+'</option>')].join("");
 const rows=entries.map(entry=>{
  const text=String(entry.text||"Recorded realm event");
  return '<article class="chronicle-entry" data-kind="'+esc(entry.kind||"realm")+'" data-search="'+esc((text+" "+(entry.kind||"")+" "+entry.id).toLowerCase())+'"><div class="chronicle-entry-meta"><strong>'+esc(String(entry.kind||"realm").toUpperCase())+'</strong><span>RECORD '+number(entry.id)+' · TICK '+number(entry.tick)+'</span></div><p>'+esc(text)+'</p></article>';
 }).join("");
 const active=state.activeEvent?'<article class="active-issue-card"><span class="command-ribbon">CURRENTLY AWAITING THE CROWN</span><h4>'+esc(state.activeEvent.title)+'</h4><p>'+esc(state.activeEvent.description)+'</p><small>'+state.activeEvent.choices.length+' recorded choices</small><button type="button" data-command="show-active-event">OPEN ISSUE</button></article>':'<p class="command-note">No unresolved realm issue is currently awaiting a decision.</p>';
 return intro("THE ROYAL ARCHIVE","Chronicle & event inbox","Search the actual event log by text or category. Records show their stored simulation tick; calendar dates are not inferred from missing history.")+
 '<div class="command-section-title">ACTIVE REALM ISSUE</div>'+active+
 legacySection+'<div class="command-section-title">RECORDED CHRONICLE</div><div class="chronicle-filters"><label for="chronicle-search">SEARCH RECORDS</label><input id="chronicle-search" type="search" maxlength="80" placeholder="Search event text or category"><label for="chronicle-kind-filter">CATEGORY</label><select id="chronicle-kind-filter">'+options+'</select></div>'+
 '<div class="chronicle-list">'+(rows||'<p class="command-note">No chronicle entries have been recorded yet.</p>')+'</div>'+
 '<p class="command-note">The event log retains up to 100 recent records. This screen does not claim unread tracking or permanent archival beyond the simulation save.</p>';
}
function military(){
 const m=getMilitarySnapshot();
 const costs=Object.entries(m.recruitCost).map(([key,value])=>value+" "+key.toUpperCase()).join(" · ");
 const candidates=m.candidates.map(c=>'<option value="'+esc(c.personId)+'">'+esc(c.name)+' · '+c.age+' · '+esc(c.job)+'</option>').join("");
 const soldierRows=m.soldiers.map(s=>{
  const training=s.training?'<span class="military-training"><b>TRAINING</b> '+s.training.remaining+' DAYS · '+Math.round(s.training.chance*100)+'% DRILL CHANCE<br><i style="width:'+Math.max(4,Math.min(100,Math.round((s.training.duration-s.training.remaining)/Math.max(1,s.training.duration)*100)))+'%"></i></span>':'';
  const mount=s.mounted?'<span class="military-badge">MOUNTED</span>':'';
  return '<article class="military-soldier" data-soldier-id="'+esc(s.id)+'"><div class="military-soldier-head"><div><span class="command-ribbon">'+esc(s.rankLabel)+' · '+esc(s.status)+'</span><h4>'+esc(s.name)+'</h4><small>'+esc(s.species)+' · age '+s.age+' · '+s.serviceYears+' years service '+mount+'</small></div><strong class="military-power">'+s.power+'<small>POWER</small></strong></div><div class="military-stats"><span>MORALE<b>'+s.morale+'</b></span><span>EQUIPMENT<b>'+s.equipment+'</b></span><span>ARMOUR<b>'+s.armor+'%</b></span><span>BATTLES<b>'+s.battles+'</b></span><span>KILLS<b>'+s.kills+'</b></span><span>WOUNDS<b>'+s.wounds+'</b></span></div>'+training+'<div class="military-actions"><button data-command="military-train" data-value="'+esc(s.id)+'" '+(s.status==="TRAINING"||s.status==="WOUNDED"?'disabled':'')+'>TRAIN · 7+ GOLD / 4+ FOOD</button><button data-command="military-equip" data-value="'+esc(s.id)+'" '+(s.equipment>=96?'disabled':'')+'>EQUIP · WOOD + GOLD</button><button data-command="military-mount" data-value="'+esc(s.id)+'" '+(s.mounted||s.rankIndex<1||m.horses<1?'disabled':'')+'>MOUNT WARHORSE</button><button data-command="military-demobilize" data-value="'+esc(s.id)+'" '+(s.status==="TRAINING"?'disabled':'')+'>DEMOBILIZE</button></div></article>';
 }).join("");
 const payroll=m.lastPayroll?'<p class="command-note">YEAR '+m.lastPayroll.year+' MUSTER · '+m.lastPayroll.soldiers+' soldiers · '+Math.round(m.lastPayroll.goldPaid)+'/'+Math.round(m.lastPayroll.goldNeed)+' gold paid · '+Math.round(m.lastPayroll.foodPaid)+'/'+Math.round(m.lastPayroll.foodNeed)+' food · '+m.lastPayroll.pannageDays+' pannage days · '+m.lastPayroll.desertions+' desertions</p>':'<p class="command-note">The first annual muster has not yet been settled.</p>';
 const history=m.history.length?'<div class="military-history">'+m.history.slice(0,6).map(entry=>'<div><span>YEAR '+entry.year+'</span><strong>'+entry.soldiers+' soldiers · '+Math.round(entry.goldPaid)+'G / '+Math.round(entry.foodPaid)+'F</strong><small>morale '+Math.round(entry.morale)+' · '+entry.desertions+' desertions</small></div>').join("")+'</div>':'<p class="command-note">No annual muster has been recorded.</p>';
 const casualties=m.recentCasualties.length?m.recentCasualties.map(entry=>'<div class="military-casualty"><span>'+esc(entry.name)+'</span><strong>'+esc(String(entry.cause).toUpperCase())+' · YEAR '+entry.year+'</strong></div>').join(""):'<p class="command-note">No casualties are recorded.</p>';
 return intro("THE CROWN'S GARRISON","Barracks & stables","Recruit named residents, drill them over days, issue equipment, mount trained soldiers and meet the annual payroll. Training speed and success depend on the marshal, food, morale, equipment, season and war.")+
 '<div class="command-summary"><div><small>GARRISON</small><strong>'+m.garrison+' / '+m.capacity+'</strong></div><div><small>READINESS</small><strong>'+m.readiness+' / 100</strong></div><div><small>MORALE</small><strong>'+m.averageMorale+' / 100</strong></div><div><small>EQUIPMENT</small><strong>'+m.averageEquipment+' / 100</strong></div><div><small>BARACKS</small><strong>'+m.barracks+'</strong></div><div><small>STABLES</small><strong>'+m.stables+'</strong></div></div>'+
 '<div class="command-section-title">DRILLMASTER & SEASON</div><p class="command-note"><strong>'+esc(m.marshal.name)+'</strong> · '+esc(m.marshal.office)+' · competence '+Math.round(m.marshal.competence)+'/100. '+(m.atWar?'War service shortens drill time but raises the chance of a failed drill.':'Peace permits deliberate drill.')+' Winter slows training; summer is the best window.</p>'+
 '<div class="command-section-title">RECRUIT FROM THE HOUSEHOLDS · '+costs+'</div><div class="command-inline"><select id="military-recruit-select" aria-label="Choose a resident to recruit"><option value="">Choose an adult resident…</option>'+candidates+'</select><button data-command="military-recruit" '+(!candidates||m.freeBeds<=0?'disabled':'')+'>RECRUIT TO GARRISON</button></div><p class="command-note">Recruitment removes a villager from the workforce and population count. Horse feed can come from stable pannage; otherwise it is paid in food.</p>'+
 '<div class="command-section-title">WARHORSES & STABLE RESERVE</div><div class="command-summary"><div><small>UNASSIGNED HORSES</small><strong>'+m.horses+'</strong></div><div><small>ASSIGNED</small><strong>'+m.assignedHorses+'</strong></div><div><small>STABLE CAPACITY</small><strong>'+m.assignedHorses+m.horses+' / '+m.horseCapacity+'</strong></div><div><small>MOUNTED BONUS</small><strong>+18% POWER</strong></div></div><div class="command-actions"><button data-command="military-horse" '+(m.freeHorseCapacity<=0?'disabled':'')+'>BUY WARHORSE · 22 GOLD / 10 FOOD</button></div>'+
 '<div class="command-section-title">NAMED GARRISON · '+m.garrison+' SOLDIERS</div><div class="military-roster">'+(soldierRows||'<p class="command-note">No soldiers are recorded. Recruit a resident to begin.</p>')+'</div>'+
 '<div class="command-section-title">LAST ANNUAL MUSTER</div>'+payroll+'<div class="military-history">'+(history||'')+'</div>'+
 '<div class="command-section-title">CASUALTY & DESERTION RECORD</div>'+(casualties||'')+'<p class="command-note">Trained: '+m.trained+' · losses: '+m.losses+' · desertions: '+m.desertions+'. Veterans and elite guards fight harder, but cost more gold, food and horse feed each year.</p>';
}
function healthPanel(){
 const h=getHealthSnapshot();
 const healerOptions=state.entities.filter(entity=>!entity.dead&&entity.type===TYPE.VILLAGER&&!h.healers.some(entry=>String(entry.personId)===String(entity.personId||entity.id))).filter(entity=>(Number(entity.person?.ageYears)||0)>=16&&!(entity.illnessUntilTick>state.tick)).slice(0,18).map(entity=>'<option value="'+esc(entity.personId||entity.id)+'">'+esc(entity.person?.name||"Resident")+' · age '+Math.floor(Number(entity.person?.ageYears)||0)+'</option>').join("");
 const healers=h.healers.length?h.healers.map(entry=>'<article class="health-healer"><div><span class="command-ribbon">PUBLIC HEALER</span><h4>'+esc(entry.name)+'</h4><p>Competence '+Math.round(entry.competence)+'/100 · appointed year '+entry.appointedYear+' · '+entry.treated+' treatments</p></div><button data-command="health-dismiss" data-value="'+esc(entry.personId)+'">DISMISS</button></article>').join(""):'<p class="command-note">No public healer has been appointed. A temple or clinic creates posts.</p>';
 const mortality=h.mortality||{};const age=mortality.byAge||{};const occupations=Object.entries(mortality.byOccupation||{}).sort((a,b)=>b[1]-a[1]).slice(0,6);
 const deaths=(mortality.lastDeaths||[]).map(entry=>'<div class="health-death"><span>'+esc(entry.name)+' · '+entry.age+'</span><strong>'+esc(entry.group.toUpperCase())+' · '+esc(entry.occupation.toUpperCase())+' · '+esc(String(entry.cause).toUpperCase())+'</strong></div>').join("");
 const history=h.history.length?'<div class="health-history">'+h.history.slice(0,6).map(entry=>'<div><span>YEAR '+entry.year+'</span><strong>SANITATION '+entry.sanitation+' · '+entry.sick+' ILL</strong><small>'+esc(entry.outbreak)+' · medicine '+entry.medicineStock+' @ '+entry.medicinePrice+'G</small></div>').join("")+'</div>':'<p class="command-note">No annual health audit has been recorded.</p>';
 return intro("THE PUBLIC HEALTH","Sanitation, healers & medicine","Water, waste, immunity and treatment form one chain. Outbreaks spread through households and the wider settlement; quarantine slows contagion but taxes every trade. Healers are named residents with real competence.")+
 '<div class="command-summary"><div><small>SANITATION</small><strong>'+h.sanitation+' / 100</strong></div><div><small>WATER COVERAGE</small><strong>'+h.waterCoverage+'%</strong></div><div><small>SICK</small><strong>'+h.sick+'</strong></div><div><small>AVG IMMUNITY</small><strong>'+h.immunityAverage+'</strong></div><div><small>HEALER COVERAGE</small><strong>'+h.healerCoverage+'%</strong></div><div><small>MEDICINE</small><strong>'+h.medicineStock+' DOSES</strong></div></div>'+
 '<div class="command-section-title">CURRENT OUTBREAK</div><div class="health-outbreak"><div><span class="command-ribbon">'+(h.active?'ACTIVE OUTBREAK':'NO ACTIVE OUTBREAK')+'</span><h4>'+esc(h.active?h.disease:"The settlement is clear")+'</h4><p>'+(h.active?'Severity '+h.severity+'/3 · '+h.sick+' currently ill · '+h.cases+' recorded cases · '+h.recovered+' recoveries':'No disease is currently spreading. Annual sanitation and crowding determine the next risk.')+'</p></div><div class="health-outbreak-stats"><span>QUARANTINE<b>LEVEL '+h.quarantineLevel+'</b></span><span>TRADE PENALTY<b>'+Math.round(h.tradePenalty*100)+'%</b></span></div></div>'+
 '<div class="command-section-title">SANITARY WORKS · COST 18 WOOD / 12 STONE / 6 GOLD</div><div class="command-actions"><button data-command="health-sanitation">IMPROVE DRAINS & LATRINES</button></div><p class="command-note">Wells supply water coverage automatically; constructed latrines and drains raise the stored sanitation score. Waste and crowding erode it every year. One public works programme may be ordered each year.</p>'+
 '<div class="command-section-title">QUARANTINE ORDERS</div><div class="health-quarantine-actions"><button data-command="health-quarantine" data-value="1">LEVEL 1 · 9% TRADE COST</button><button data-command="health-quarantine" data-value="2">LEVEL 2 · 18% TRADE COST</button><button data-command="health-quarantine" data-value="3">LEVEL 3 · 27% TRADE COST</button><button data-command="health-quarantine" data-value="0" '+(h.quarantineLevel<=0?'disabled':'')+'>LIFT QUARANTINE</button></div><p class="command-note">Quarantine lasts 240 days, reduces household and community transmission and lowers morale. The trade penalty is applied by the real market, not a label.</p>'+
 '<div class="command-section-title">HEALERS · '+h.healers.length+' / '+h.healerCapacity+' POSTS FILLED</div><div class="health-healer-list">'+(healers||'')+'</div><div class="command-inline"><select id="health-healer-select" aria-label="Choose a resident to appoint as healer"><option value="">Choose an adult resident…</option>'+healerOptions+'</select><button data-command="health-appoint" '+(h.healers.length>=h.healerCapacity||!healerOptions?'disabled':'')+'>APPOINT HEALER · 12 GOLD</button></div>'+
 '<div class="command-section-title">MEDICINE ECONOMY</div><div class="command-summary"><div><small>DOSES IN STORE</small><strong>'+h.medicineStock+'</strong></div><div><small>MARKET PRICE</small><strong>'+h.medicinePrice.toFixed(2)+' G</strong></div><div><small>BREWED</small><strong>'+h.medicineBrewed+'</strong></div><div><small>USED</small><strong>'+h.medicineUsed+'</strong></div><div><small>SOLD</small><strong>'+h.medicineSold+'</strong></div></div><div class="health-medicine-actions"><button data-command="health-brew">BREW FROM 3 HERBS + 4 GOLD</button><button data-command="health-treat" '+(h.sick<=0||h.medicineStock<=0?'disabled':'')+'>TREAT THE SICK · UP TO 4 DOSES</button><button data-command="health-sell" '+(h.medicineStock<2?'disabled':'')+'>SELL 2 DOSES</button></div><p class="command-note">Brewing consumes forest herbs and lichen, automatically uses medicine during an outbreak, and exposes the store to real market prices. Selling medicine earns gold but leaves fewer doses for the next outbreak.</p>'+
 '<div class="command-section-title">MORTALITY BY AGE & OCCUPATION · YEAR '+(mortality.lastYear||"—")+'</div><div class="health-mortality-grid"><div><span>CHILDREN<b>'+age.child+'</b></span><span>ADULTS<b>'+age.adult+'</b></span><span>ELDERS<b>'+age.elder+'</b></span></div><div>'+occupations.map(([name,count])=>'<span>'+esc(name.toUpperCase())+'<b>'+count+'</b></span>').join("")+'</div></div><div class="health-death-list">'+(deaths||'<p class="command-note">No deaths have been recorded in the health ledger.</p>')+'</div>'+
 '<div class="command-section-title">ANNUAL HEALTH AUDIT</div>'+history+'<p class="command-note">Mortality is resolved once per year by age, occupation, illness, immunity, sanitation, healers and medicine stock. The audit is bounded to residents and the latest records.</p>';
}
function faithPanel(){
 const f=getFaithSnapshot(),m=f.modifiers,gold=Number(state.resources?.gold)||0,food=Number(state.resources?.food)||0;
 const clergyRows=f.clergy.length?f.clergy.map(c=>'<article class="court-office" data-faith-clergy="'+esc(c.personId)+'"><div class="court-office__head"><div><span class="court-office__role">'+esc(c.convictionLabel).toUpperCase()+' CLERIC</span><h4>'+esc(c.name)+'</h4><p>Serves the congregation since year '+c.appointedYear+'.</p></div><span class="court-office__badge">'+Math.round(c.competence)+'</span></div><div class="court-office__stats"><span>COMPETENCE<b>'+Math.round(c.competence)+'</b></span><span>CONVICTION<b>'+esc(c.convictionLabel)+'</b></span></div><div class="court-actions"><button data-command="faith-dismiss" data-value="'+esc(c.personId)+'">DISMISS</button></div></article>').join(""):'<p class="command-note">No named clergy serve yet. Appoint a resident from the congregation list.</p>';
 const options=f.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · age '+Math.floor(p.ageYears)+' · '+esc(p.convictionLabel)+' · fit '+Math.round(p.fit)+'</option>').join("");
 const convictions=f.convictions.map(c=>'<span class="faith-conviction"><small>'+esc(c.label.toUpperCase())+'</small><strong>'+Math.round((m.convictions[c.id]||0)*100)+'%</strong><em>'+esc(c.description)+'</em></span>').join("");
 const festivals=f.festivals.map(x=>{
  const affordable=Object.entries(x.cost).every(([key,value])=>(Number(state.resources?.[key])||0)>=value);
  return '<article class="command-policy" data-faith-festival="'+esc(x.id)+'"><div><strong>'+esc(x.label)+'</strong><p>'+esc(x.description)+'</p><small>'+esc(costLabel(x.cost))+' · morale +'+x.morale+' · legitimacy +'+x.legitimacy+' · trade demand +'+Math.round(x.demand*100)+'%</small></div><button data-command="faith-festival" data-value="'+esc(x.id)+'"'+((f.canHoldFestival&&affordable&&f.capacity>0)?"":" disabled")+'>HOLD</button></article>';
 }).join("");
 const pilgrimage='<article class="command-policy"><div><strong>PILGRIMAGE TO THE HOLY SITES</strong><p>'+esc(f.pilgrimagePending?'Pilgrims are already on the road; they return at the next annual audit.':'Send pilgrims with 14 gold and 12 food. They return with gold spent in the realm, a trade bonus and, when housing allows, a settled resident.')+'</p><small>'+(f.pilgrimage.lastResolvedYear?'LAST RETURN · YEAR '+f.pilgrimage.lastResolvedYear+' · '+f.pilgrimage.pilgrims+' PILGRIMS · '+f.pilgrimage.goldEarned+' GOLD · '+f.pilgrimage.settlers+' SETTLED':'NO RETURN RECORDED YET')+'</small></div><button data-command="faith-pilgrimage"'+((f.canFundPilgrimage&&gold>=14&&food>=12&&f.capacity>0)?"":" disabled")+'>FUND PILGRIMAGE</button></article>';
 const budgets=f.budgetLevels.map(b=>'<button class="command-choice'+(b.level===f.cultureBudget?' is-current':'')+'" data-command="faith-budget" data-value="'+b.level+'"><strong>'+esc(b.label.toUpperCase())+'</strong><small>'+b.gold+' gold / year · morale +'+b.morale+' · legitimacy +'+b.legitimacy+'</small></button>').join("");
 const heresy='<div class="command-summary"><div><small>TENSION</small><strong>'+m.heresyTension+'/100</strong></div><div><small>STANDING</small><strong>'+esc(f.heresyLevelDefinition.label.toUpperCase())+'</strong></div><div><small>PUBLIC UNREST</small><strong>'+m.unrest+'</strong></div><div><small>MIGRATION</small><strong>'+Math.round(m.migrationFactor*100)+'%</strong></div></div>'+meter("RELIGIOUS TENSION",m.heresyTension)+'<div class="command-actions"><button data-command="faith-heresy" data-value="reconcile"'+((f.heresy.lastActionYear>=state.year||gold<12||food<10)?" disabled":"")+'>RECONCILE · 12G / 10F</button><button data-command="faith-heresy" data-value="suppress"'+((f.heresy.lastActionYear>=state.year||gold<10)?" disabled":"")+'>SUPPRESS · 10G / MORALE −4</button></div>';
 const audit=f.lastAudit?'<p class="command-note">Last audit · year '+f.lastAudit.year+' · '+f.lastAudit.clergy+'/'+f.lastAudit.capacity+' clergy · '+f.lastAudit.congregation+' of '+f.lastAudit.population+' in the congregation · coverage '+f.lastAudit.coverage+'% · budget '+f.lastAudit.budgetPaid+'/'+f.lastAudit.budgetDue+' gold · tension '+f.lastAudit.heresyTension+' · tax ×'+f.lastAudit.taxEfficiency+' · trade ×'+f.lastAudit.tradeFactor+' · mortality ×'+f.lastAudit.mortalityRelief+'.</p>':'<p class="command-note">No annual faith audit has been completed yet.</p>';
 const history=f.history.length?'<div class="court-history">'+f.history.map(entry=>'<div><span>'+esc(String(entry.kind).toUpperCase())+' · YEAR '+entry.year+'</span><p>'+esc(entry.summary)+'</p></div>').join("")+'</div>':'<p class="command-note">No congregation record has been written yet.</p>';
 return intro("THE CONGREGATION & ITS RITES","Faith & culture","Named clergy, real congregations, funded festivals, pilgrimages and the slow pressure of heresy. Every effect below is annual and reads the realm's actual people, legitimacy, food and temples.")+
 '<div class="command-summary"><div><small>CLERGY</small><strong>'+f.clergy.length+' / '+f.capacity+'</strong></div><div><small>CONGREGATION</small><strong>'+m.congregation+' / '+m.population+'</strong></div><div><small>TEMPLES & SHRINES</small><strong>'+m.temples+' / '+m.shrines+'</strong></div><div><small>COVERAGE</small><strong>'+Math.round(m.coverage*100)+'%</strong></div></div>'+
 '<div class="command-section-title">NAMED CLERGY</div><p class="command-note">Clergy are drawn from the realm\'s living residents. Their piety, compassion, discipline and curiosity decide competence and conviction. A cleric who dies or leaves stops affecting the realm immediately.</p><div class="court-office-grid">'+clergyRows+'</div><div class="command-inline"><select id="faith-clergy-select" aria-label="Choose a resident to appoint as clergy"><option value="">Choose an adult resident…</option>'+options+'</select><button data-command="faith-appoint"'+((f.capacity<=f.clergy.length||gold<f.appointmentCost||!options)?" disabled":"")+'>APPOINT · '+f.appointmentCost+'G</button></div>'+
 '<div class="command-section-title">CONVICTIONS OF THE CONGREGATION</div><div class="faith-conviction-grid">'+convictions+'</div>'+
 '<div class="command-section-title">FESTIVALS · ONE PER YEAR</div><div class="command-policy-list">'+festivals+'</div>'+
 '<div class="command-section-title">PILGRIMAGE</div><div class="command-policy-list">'+pilgrimage+'</div>'+
 '<div class="command-section-title">CULTURE BUDGET · PAID EACH YEAR</div><div class="command-choice-grid">'+budgets+'</div>'+
 '<div class="command-section-title">HERESY & RELIGIOUS TENSION</div>'+heresy+'<p class="command-note">Tension grows from low legitimacy, hunger, war, high taxes and thin clergy coverage. A high tension reduces tax yield and trade, depresses morale and lowers migration; reconciliation costs gold and food while suppression costs morale and clergy goodwill.</p>'+
 '<div class="command-section-title">ANNUAL FAITH AUDIT</div>'+audit+'<div class="command-section-title">CONGREGATION RECORD</div>'+history;
}
function justicePanel(){
 const j=getJusticeSnapshot(),m=j.modifiers,gold=Number(state.resources?.gold)||0,wood=Number(state.resources?.wood)||0,stone=Number(state.resources?.stone)||0;
 const judgeRows=j.judges.length?j.judges.map(x=>'<article class="court-office" data-justice-judge="'+esc(x.personId)+'"><div class="court-office__head"><div><span class="court-office__role">JUDGE OF THE REALM</span><h4>'+esc(x.name)+'</h4><p>Appointed year '+x.appointedYear+' · salary '+x.salary+' gold / year.</p></div><span class="court-office__badge">'+x.convictions+' CASES</span></div><div class="court-office__stats"><span>COMPETENCE<b>'+Math.round(x.competence)+'</b></span><span>INTEGRITY<b>'+Math.round(x.integrity)+'</b></span><span>CONVICTIONS<b>'+x.convictions+'</b></span></div><div class="court-actions"><button data-command="justice-dismiss" data-value="'+esc(x.personId)+'">DISMISS</button><button data-command="justice-investigate" data-value="'+esc(x.personId)+'"'+((x.investigatedYear>=state.year||gold<8)?" disabled":"")+'>INVESTIGATE · 8G</button></div></article>').join(""):'<p class="command-note">No judge sits on the bench. A court alone cannot hold a trial; appoint a named resident.</p>';
 const options=j.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · age '+Math.floor(p.ageYears)+' · fit '+Math.round(p.fit)+' · integrity '+Math.round(p.integrity)+'</option>').join("");
 const laws=j.lawCodes.map(code=>'<button class="command-choice'+(code.id===j.lawCode?' is-current':'')+'" data-command="justice-law" data-value="'+esc(code.id)+'"><strong>'+esc(code.label.toUpperCase())+'</strong><small>tax ×'+code.tax+' · trade ×'+code.trade+' · migration ×'+code.migration+' · desertion ×'+code.desertion+'</small></button>').join("");
 const charters=j.charterTypes.map(c=>{
  const affordable=Object.entries(c.cost).every(([key,value])=>(Number(state.resources?.[key])||0)>=value);
  return '<article class="command-policy"><div><strong>'+esc(c.label.toUpperCase())+'</strong><p>'+esc(c.description)+'</p><small>'+esc(costLabel(c.cost))+'</small></div><button data-command="justice-charter" data-value="'+esc(c.id)+'"'+((j.charters.length<4&&j.lastCharterYear<state.year&&affordable)?"":" disabled")+'>GRANT</button></article>';
 }).join("");
 const charterList=j.charters.length?j.charters.map(c=>'<span class="justice-charter">'+esc(c.label.toUpperCase())+' · YEAR '+c.grantedYear+'</span>').join(""):'<span class="command-note">No charter has been granted.</span>';
 const causes=Object.entries(j.crime.causes).map(([id,value])=>'<span class="justice-cause"><small>'+esc(id.toUpperCase())+'</small><strong>'+Math.round(value*100)+'%</strong></span>').join("");
 const cases=j.pendingCases.length?j.pendingCases.map(c=>'<article class="justice-case" data-justice-case="'+esc(c.id)+'"><div><span class="command-ribbon">'+esc(c.crimeLabel.toUpperCase())+' · SEVERITY '+c.severity+' · YEAR '+c.createdYear+'</span><h4>'+esc(c.defendantName)+'</h4><p>Accused of '+esc(c.crimeLabel.toLowerCase())+' against '+esc(c.victim)+'. The case emerged from '+esc(CRIME_CAUSE_LABELS[c.cause]||c.cause)+'.</p></div><div class="command-inline"><select id="justice-sentence-'+esc(c.id)+'" aria-label="Choose a sentence for '+esc(c.defendantName)+'">'+j.sentences.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+' · '+esc(x.description)+'</option>').join("")+'</select><button data-command="justice-verdict" data-value="'+esc(c.id)+'">PASS SENTENCE</button></div></article>').join(""):'<p class="command-note">No case is waiting on the court roll. New cases are raised at the annual justice audit from real hardship.</p>';
 const totals=Object.entries(j.sentenceTotals).map(([id,value])=>'<span class="justice-sentence-total"><small>'+esc(String(id).toUpperCase())+'</small><strong>'+value+'</strong></span>').join("");
 const audit=j.lastAudit?'<p class="command-note">Last audit · year '+j.lastAudit.year+' · '+j.lastAudit.judges+'/'+j.lastAudit.judgeCapacity+' judges · crime '+Math.round(j.lastAudit.crimeRate*100)+'% ('+esc(j.lastAudit.crimeLevel)+') · '+j.lastAudit.cases+' cases pending · '+j.lastAudit.paid+'/'+j.lastAudit.salaries+' gold salaries · '+j.lastAudit.corruptionLost+' gold lost to corruption · tax ×'+j.lastAudit.taxEfficiency+' · trade ×'+j.lastAudit.tradeFactor+' · migration ×'+j.lastAudit.migrationFactor+' · desertion ×'+j.lastAudit.desertionFactor+'.</p>':'<p class="command-note">No annual justice audit has been completed yet.</p>';
 const history=j.history.length?'<div class="court-history">'+j.history.map(entry=>'<div><span>'+esc(String(entry.kind).toUpperCase())+' · YEAR '+entry.year+'</span><p>'+esc(entry.summary)+'</p></div>').join("")+'</div>':'<p class="command-note">No court record has been written yet.</p>';
 return intro("THE COURT OF LAW","Justice & order","Named judges, emergent crime and real sentences. Crime is not scripted: it grows from unemployment, hunger, war and quarantine, and every verdict changes the realm's treasury, population, trade, migration and desertion.")+
 '<div class="command-summary"><div><small>JUDGES</small><strong>'+j.judges.length+' / '+j.capacity+'</strong></div><div><small>COURTS & PRISONS</small><strong>'+m.courts+' / '+m.prisons+'</strong></div><div><small>CRIME RATE</small><strong>'+Math.round(j.crime.rate*100)+'%</strong></div><div><small>PENDING CASES</small><strong>'+j.pendingCases.length+'</strong></div></div>'+
 '<div class="command-section-title">NAMED JUDGES</div><p class="command-note">Competence and integrity come from the resident\'s real traits. A dead or departed judge loses every effect at once; the seat can be refilled. Judges draw a yearly salary and corrupt judges skim fines.</p><div class="court-office-grid">'+judgeRows+'</div><div class="command-inline"><select id="justice-judge-select" aria-label="Choose a resident to appoint as judge"><option value="">Choose an adult resident…</option>'+options+'</select><button data-command="justice-appoint"'+((j.capacity<=j.judges.length||gold<j.appointmentCost||!options)?" disabled":"")+'>APPOINT · '+j.appointmentCost+'G</button></div>'+
 '<div class="command-section-title">LEGAL ORDER · IN FORCE: '+esc(m.lawLabel.toUpperCase())+'</div><div class="command-choice-grid">'+laws+'</div><p class="command-note">Changing the code costs '+j.lawChangeCost+' gold, requires a court and a judge, and is limited to once a year. The code feeds directly into taxes, market terms, morale, migration and desertion.</p>'+
 '<div class="command-section-title">CHARTERS · '+j.charters.length+' / 4</div><div class="command-policy-list">'+charters+'</div><div class="justice-charter-list">'+charterList+'</div>'+
 '<div class="command-section-title">CRIME PRESSURE</div><div class="command-summary"><div><small>RATE</small><strong>'+Math.round(j.crime.rate*100)+'%</strong></div><div><small>STANDING</small><strong>'+esc(String(j.crime.level).toUpperCase())+'</strong></div><div><small>CORRUPTION</small><strong>'+m.corruption+'%</strong></div><div><small>JUDICIAL COVERAGE</small><strong>'+Math.round(m.judgeCoverage*100)+'%</strong></div></div>'+meter("CRIME RATE",j.crime.rate*100)+'<div class="justice-cause-grid">'+causes+'</div><p class="command-note">Crime falls with judges, courts, charters and lawful codes; it rises with inequality, hunger, war and quarantine. Every sentence shifts the underlying pressure, so justice is not a cosmetic choice.</p>'+
 '<div class="command-section-title">CASES AWAITING JUDGEMENT · '+j.pendingCases.length+'</div><div class="command-policy-list">'+cases+'</div>'+
 '<div class="command-section-title">SENTENCE RECORD</div><div class="justice-sentence-grid">'+totals+'</div><div class="command-summary"><div><small>CASES OPENED</small><strong>'+j.totals.cases+'</strong></div><div><small>CASES CLOSED</small><strong>'+j.totals.closed+'</strong></div><div><small>GOLD RECOVERED</small><strong>'+j.corruption.recovered+'</strong></div><div><small>CORRUPTION LOSSES</small><strong>'+j.corruption.lostGold+'</strong></div></div>'+
 '<div class="command-section-title">ANNUAL JUSTICE AUDIT</div>'+audit+'<div class="command-section-title">COURT RECORD</div>'+history;
}
function researchPanel(){
 const r=getResearchSnapshot(),gold=Number(state.resources?.gold)||0,m=r.modifiers;
 const techs=r.branches.map(branch=>{
  const rows=branch.techs.map(tech=>{
   const percent=tech.status==="complete"?100:tech.status==="active"?Math.min(99,Math.round(tech.progress/Math.max(1,tech.cost)*100)):0;
   return '<article class="command-policy research-technology" data-research-tech="'+esc(tech.id)+'" data-research-status="'+esc(tech.status)+'"><div><span class="command-ribbon">'+esc(tech.status.toUpperCase())+(tech.status==="active"?" · "+percent+"%":"")+'</span><strong>'+esc(tech.label)+'</strong><p>'+esc(tech.description)+'</p><small>'+tech.cost+' points · requires '+esc(tech.requires.length?tech.requires.join(", "):"no earlier work")+'</small></div><button data-command="research-start" data-value="'+esc(tech.id)+'"'+(tech.status==="available"?"":" disabled")+'>'+(tech.status==="complete"?"COMPLETE":tech.status==="active"?"IN PROGRESS":tech.status==="locked"?"LOCKED":"BEGIN")+'</button></article>';
  }).join("");
  return '<div class="command-section-title">'+esc(branch.label.toUpperCase())+' · '+esc(branch.description)+'</div><div class="command-policy-list">'+rows+'</div>';
 }).join("");
 const scholars=r.scholars.length?r.scholars.map(entry=>'<article class="court-office" data-research-scholar="'+esc(entry.personId)+'"><div class="court-office__head"><div><span class="court-office__role">NAMED SCHOLAR</span><h4>'+esc(entry.name)+'</h4><p>Appointed year '+entry.appointedYear+' · salary '+entry.salary+' gold / year.</p></div><span class="court-office__badge">FIT '+Math.round(entry.fit)+'</span></div><div class="court-actions"><button data-command="research-dismiss" data-value="'+esc(entry.personId)+'">DISMISS</button></div></article>').join(""):'<p class="command-note">No scholar holds a post. Temples and courts open further posts.</p>';
 const candidates=r.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · age '+Math.floor(p.ageYears)+' · fit '+Math.round(p.fit)+'</option>').join("");
 const funding=r.fundingLevels.map(level=>'<button class="command-choice'+(level.level===r.funding?' is-current':'')+'" data-command="research-funding" data-value="'+level.level+'"><strong>'+esc(level.label.toUpperCase())+'</strong><small>'+level.gold+' gold / year · output ×'+level.multiplier+'</small></button>').join("");
 return intro("THE ROYAL ACADEMY","Research & knowledge","Scholars are named residents. Funding and salaries are paid each year, points accumulate against a chosen technology, and every completed discovery changes a live value of the realm.")+
 '<div class="command-summary"><div><small>POINTS / YEAR</small><strong>'+amount(r.pointsPerYear)+'</strong></div><div><small>RESERVE</small><strong>'+amount(r.reserve)+'</strong></div><div><small>COMPLETED</small><strong>'+m.completedCount+' / 24</strong></div><div><small>SCHOLARS</small><strong>'+r.scholars.length+' / '+r.capacity+'</strong></div><div><small>FUNDING</small><strong>'+esc(r.fundingDetails.label.toUpperCase())+'</strong></div><div><small>ACTIVE PROJECT</small><strong>'+esc(r.activeTechDetails?r.activeTechDetails.label:"NONE")+'</strong></div></div>'+
 '<div class="command-section-title">ACTIVE PROJECT</div>'+(r.activeTechDetails?'<div class="command-summary"><div><small>PROJECT</small><strong>'+esc(r.activeTechDetails.label)+'</strong></div><div><small>PROGRESS</small><strong>'+amount(r.progress)+' / '+r.activeTechDetails.cost+'</strong></div><div><small>REMAINING</small><strong>'+amount(Math.max(0,r.activeTechDetails.cost-r.progress))+'</strong></div></div>':'<p class="command-note">No project is active. An unspent reserve carries forward; choose a technology below to begin.</p>')+
 '<div class="command-section-title">LIVE EFFECTS</div><div class="court-effect-grid"><span>TAX YIELD<b>×'+amount(m.taxEfficiency)+'</b></span><span>TRADE TERMS<b>×'+amount(m.tradeFactor)+'</b></span><span>HOUSEHOLD FOOD DEMAND<b>×'+amount(m.foodDemandFactor)+'</b></span><span>MORTALITY RELIEF<b>×'+amount(m.mortalityRelief)+'</b></span><span>CONSTRUCTION DISCOUNT<b>'+Math.round(m.buildDiscount*100)+'%</b></span><span>SOLDIER POWER<b>×'+amount(m.militaryBonus)+'</b></span><span>RESEARCH RATE<b>×'+amount(m.researchSpeed)+'</b></span><span>ANNUAL LEGITIMACY<b>'+amount(m.legitimacyYear)+'</b></span></div>'+
 '<div class="command-section-title">NAMED SCHOLARS · '+r.scholars.length+' / '+r.capacity+'</div><div class="court-office-grid">'+scholars+'</div><div class="command-inline"><select id="research-scholar-select" aria-label="Choose a resident to appoint as scholar"><option value="">Choose an adult resident…</option>'+candidates+'</select><button data-command="research-appoint"'+((r.scholars.length>=r.capacity||gold<12||!candidates)?" disabled":"")+'>APPOINT · 12G</button></div><p class="command-note">A scholar leaves any other office before taking a research post. Salaries of 5 gold per scholar are paid at the annual audit; unpaid salaries reduce that year\'s output.</p>'+
 '<div class="command-section-title">ANNUAL FUNDING</div><div class="command-choice-grid">'+funding+'</div>'+
 '<div class="command-section-title">TECHNOLOGY TREE · '+m.completedCount+' / 24 COMPLETE</div>'+techs+
 (r.lastAudit?'<div class="command-section-title">LAST ANNUAL AUDIT</div><p class="command-note">Year '+r.lastAudit.year+' · '+r.lastAudit.points+' points · speed ×'+r.lastAudit.speed+' · '+r.lastAudit.scholars+' scholars · '+r.lastAudit.salariesPaid+' gold salaries · '+r.lastAudit.fundingPaid+' gold funding'+(r.lastAudit.completed?' · completed '+esc(r.lastAudit.completed):"")+'.</p>':'<p class="command-note">No annual research audit has been completed yet.</p>');
}
const CRIME_CAUSE_LABELS=Object.freeze({inequality:"inequality",hunger:"hunger",war:"war",quarantine:"quarantine",unemployment:"unemployment"});
function render(){
 const panel=$("command-panel-content");if(!panel)return;
 panel.innerHTML=({kingdom,government,politics,diplomacy,decisions,cards,economy,resources,buildings,military,health:healthPanel,faith:faithPanel,justice:justicePanel,research:researchPanel,endeavours:()=>renderEndeavoursPanel(endeavourFunding),population:renderPopulationPanel,dynasty,creatures,chronicle}[activePanel]||kingdom)();
 if(activePanel==="dynasty")requestAnimationFrame(drawDynastyConnectors);
 document.querySelectorAll("[data-command-tab]").forEach(b=>{
  const active=b.dataset.commandTab===activePanel;
  b.classList.toggle("is-active",active);
  b.setAttribute("aria-pressed",String(active));
 });
 setNavigationActive(activePanel);
}
function act(b){ const a=b.dataset.command,v=b.dataset.value;let r={ok:false,reason:"unknown-action"};

 if(a==="endeavour-start")r=startEndeavour(v,{overseerId:$("endeavour-overseer-select")?.value||null,funding:endeavourFunding});
 else if(a==="endeavour-funding"){endeavourFunding=Math.max(0,Math.min(2,Number(v)||0));r={ok:true};}
 else if(a==="endeavour-active-funding")r=setEndeavourFunding(Number(v));
 else if(a==="endeavour-abandon")r=abandonEndeavour();
 else if(a==="endeavour-reassign")r=setEndeavourOverseer($("endeavour-active-overseer")?.value);
 else if(a==="research-start")r=startResearch(v);
 else if(a==="research-funding")r=setResearchFunding(Number(v));
 else if(a==="research-appoint")r=appointScholar($("research-scholar-select")?.value);else if(a==="research-dismiss")r=dismissScholar(v);else if(a==="crown-relief")r=applyCrownRelief();else if(a==="crown-grain")r=setGrainContract(Number(v));else if(a==="crown-water")r=setWaterworks(Number(v));else if(a==="crown-housing")r=upgradeHousingStock();else if(a==="crown-provision")r=provisionGranary();else if(a==="government-form")r=setGovernmentForm(v);else if(a==="policy")r=enactPolicy(v);else if(a==="consort")r=appointRoyalConsort($("royal-consort-select")?.value);else if(a==="royal-birth")r=createRoyalChild();else if(a==="summon-dragon")r=summonDragon();else if(a==="heir")r=designateHeir(v);else if(a==="draw-card")r=drawPlayerCard();else if(a==="select-card"){r=selectCard(v)?{ok:true}:{ok:false,reason:"card not found"};if(r.ok)$("command-modal")?.classList.add("hidden");}else if(a==="show-active-event"&&state.activeEvent){state.activeEvent.dismissed=false;renderUI();r={ok:true};}else if(a==="diplomacy-gift")r=sendGift(v);else if(a==="diplomacy-pact")r=proposeTradePact(v);else if(a==="diplomacy-alliance")r=proposeAlliance(v);else if(a==="diplomacy-war")r=declareWar(v);else if(a==="diplomacy-peace")r=sueForPeace(v);else if(a==="diplomacy-envoy")r=appointEnvoy(v,$("envoy-"+v)?.value);else if(a==="diplomacy-recall")r=recallEnvoy(v);else if(a==="court-appoint")r=appointMinister(v,$("court-office-"+v)?.value);else if(a==="court-dismiss")r=dismissMinister(v);else if(a==="court-demand")r=addressFactionDemand(v);else if(a==="military-recruit")r=recruitVillager($("military-recruit-select")?.value);else if(a==="military-train")r=trainSoldier(v);else if(a==="military-equip")r=equipSoldier(v);else if(a==="military-mount")r=mountSoldier(v);else if(a==="military-horse")r=buyHorse();else if(a==="military-demobilize")r=demobilizeSoldier(v);else if(a==="health-sanitation")r=improveSanitation();else if(a==="health-appoint")r=appointHealer($("health-healer-select")?.value);else if(a==="health-dismiss")r=dismissHealer(v);else if(a==="health-brew")r=brewMedicine();else if(a==="health-treat")r=treatSick();else if(a==="health-sell")r=sellMedicine(2);else if(a==="health-quarantine")r=setQuarantine(Number(v));else if(a==="faith-appoint")r=appointClergy($("faith-clergy-select")?.value);else if(a==="faith-dismiss")r=dismissClergy(v);else if(a==="faith-festival")r=holdFestival(v);else if(a==="faith-pilgrimage")r=fundPilgrimage();else if(a==="faith-budget")r=setCultureBudget(Number(v));else if(a==="faith-heresy")r=addressHeresy(v);else if(a==="justice-appoint")r=appointJudge($("justice-judge-select")?.value);else if(a==="justice-dismiss")r=dismissJudge(v);else if(a==="justice-law")r=setLawCode(v);else if(a==="justice-charter")r=grantCharter(v);else if(a==="justice-verdict")r=tryCase(v,$("justice-sentence-"+v)?.value);else if(a==="justice-investigate")r=investigateCorruption(v);
 if(r.ok){
  if(a==="draw-card")toast(r.card.name+" DRAWN · SELECT IT TO PLACE IT");
  else if(a==="select-card")toast("CARD SELECTED — DRAG IT ONTO THE MAP");
  else if(a.startsWith("diplomacy-"))toast(String(r.message||"DIPLOMACY UPDATED").toUpperCase());
  else if(a.startsWith("court-"))toast("COURT DECISION RECORDED");
  else if(a.startsWith("military-"))toast(String(r.message||"GARRISON UPDATED").toUpperCase());
  else if(a.startsWith("health-"))toast(String(r.message||"PUBLIC HEALTH UPDATED").toUpperCase());
  else if(a.startsWith("faith-"))toast(String(r.message||"CONGREGATION UPDATED").toUpperCase());
  else if(a.startsWith("justice-"))toast(String(r.message||"COURT DECISION RECORDED").toUpperCase());
  else if(a.startsWith("research-"))toast(String(r.message||"RESEARCH UPDATED").toUpperCase());
  else if(a.startsWith("endeavour-"))toast(String(r.message||"CROWN WORK UPDATED").toUpperCase());
  else if(a.startsWith("crown-"))toast(String(r.message||"CROWN SUPPLY UPDATED").toUpperCase());
  else toast("DECISION RECORDED");
  renderUI();render();
 }else toast((r.reason||"ACTION FAILED").replaceAll("-"," ").toUpperCase());
}
export function setupManagementUI(){
 ensureDynastyNetworkStyles();
 window.addEventListener("resize",()=>{if(activePanel==="dynasty")drawDynastyConnectors();});
 document.querySelectorAll("[data-kac-panel]").forEach(button=>button.addEventListener("click",()=>{
  const target=button.dataset.kacPanel;
  setNavigationActive(target);
  if(target==="people"){$("people-btn")?.click();return;}
  if(target==="settings"){$("settings-btn")?.click();return;}
  if(target==="build"){$("build-open-btn")?.click();return;}
  if(["kingdom","government","politics","diplomacy","decisions","cards","economy","resources","buildings","military","health","faith","justice","research","endeavours","population","dynasty","creatures","chronicle"].includes(target)){
   activePanel=target;$("command-modal")?.classList.remove("hidden");render();
   if(target==="resources"&&button.dataset.resourceDetail)requestAnimationFrame(()=>document.querySelector('.resource-detail-card[data-resource="'+button.dataset.resourceDetail+'"]')?.scrollIntoView({block:"start",behavior:"smooth"}));
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
  if(e.target.id==="population-search"){
   setPopulationQuery(e.target.value);
   applyPopulationSearch();
  }
 });
 $("command-panel-content")?.addEventListener("change",e=>{
  const select=e.target.closest("[data-warehouse-profile]");
  if(!select)return;
  const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(select.dataset.warehouseProfile));
  const result=setWarehouseProfile(entity,select.value);
  if(result.ok){toast("WAREHOUSE PROFILE UPDATED");render();}
  else toast(String(result.reason||"PROFILE CHANGE FAILED").replaceAll("-"," ").toUpperCase());
 });
 $("command-panel-content")?.addEventListener("click",e=>{
  const populationButton=e.target.closest("[data-population-filter]");
  if(populationButton){
   setPopulationFilter(populationButton.dataset.populationFilter||"all");
   render();
   return;
  }
  const process=e.target.closest("[data-process-hunt]");
  if(process){
   const result=processForestHunt();
   if(result.ok){toast("PROCESSED "+result.processed.map(good=>good.amount+" "+good.to.replaceAll("-"," ")).join(" · "));renderUI();render();}
   else toast(String(result.reason||"PROCESSING FAILED").toUpperCase());
   return;
  }
  const feed=e.target.closest("[data-feed-stable]");
  if(feed){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(feed.dataset.feedStable));
   const result=entity?feedStableFromMast(entity):{ok:false,reason:"Building not found"};
   if(result.ok){toast("PANNAGE "+result.fed+" MAST · "+result.days+" DAYS RESERVED");renderUI();render();}
   else toast(String(result.reason||"PANNAGE FAILED").toUpperCase());
   return;
  }
  const thin=e.target.closest("[data-thin-forest]");
  if(thin){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(thin.dataset.thinForest));
   const result=entity?thinNearestForest(entity,6):{ok:false,reason:"Building not found"};
   if(result.ok){toast("THINNED "+result.taken+" LOGS AT "+result.x+", "+result.y);renderUI();render();}
   else toast(String(result.reason||"THINNING FAILED").toUpperCase());
   return;
  }
  const deliver=e.target.closest("[data-deliver-forest]");
  if(deliver){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(deliver.dataset.deliverForest));
   const result=entity?deliverForestGoods(entity):{ok:false,reason:"Building not found"};
   if(result.ok){toast("DELIVERED "+result.goods.map(good=>good.amount+" "+good.to).join(" · "));renderUI();render();}
   else toast(String(result.reason||"DELIVERY FAILED").toUpperCase());
   return;
  }
  const suppress=e.target.closest("[data-suppress-forest]");
  if(suppress){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(suppress.dataset.suppressForest));
   const result=entity?suppressNearestForestDisturbance(entity.x,entity.y,8):{ok:false,reason:"Building not found"};
   if(result.ok){toast("CONTROL PARTY · "+String(result.kind).toUpperCase()+" HELD UNTIL DAY "+result.containedUntil);renderUI();render();}
   else toast(String(result.reason||"CONTROL PARTY FAILED").toUpperCase());
   return;
  }
  const gather=e.target.closest("[data-gather-forest]");
  if(gather){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(gather.dataset.gatherForest));
   const result=entity?gatherNearestForestProducts(entity.x,entity.y,7):{ok:false,reason:"Building not found"};
   if(result.ok){toast("GATHERED "+result.goods.map(good=>good.amount+" "+good.label).join(" · "));renderUI();render();}
   else toast(String(result.reason||"GATHERING FAILED").toUpperCase());
   return;
  }
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
