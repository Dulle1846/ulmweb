// Strategy management command deck: government, politics, royal decisions, cards and economy.
import { state } from "../core/state.js";
import { MANAGEMENT_TABS } from "./management-tabs.js";
import { getGovernmentSnapshot, GOVERNMENT_FORMS, GOVERNMENT_POLICIES, SUCCESSION_LAWS, setGovernmentForm, setTaxRate, setSuccessionLaw, enactPolicy } from "../systems/government.js";
import { getPoliticalSnapshot } from "../systems/politics.js";
import { getCourtSnapshot, appointMinister, dismissMinister, addressFactionDemand } from "../systems/court.js";
import { getAdvisorSnapshot, appointRoyalAdvisor, resolveAdvisorAdvice } from "../systems/advisor.js";
import { getNobilitySnapshot, grantNobleCharter, callNobleLevy } from "../systems/nobility.js";
import { getNobleHostSnapshot, orderNobleHost } from "../systems/noble-host.js";
import { aimCampaign, commitCampaign, settleReadyCampaigns } from "../systems/feudal-campaigns.js";
import { getCouncilSnapshot, proposeCouncilBill, lobbyCouncilBill, callCouncilVote } from "../systems/council-laws.js";
import { getNobleFeudSnapshot, mediateFeud, inflameFeud, ignoreFeud, arbitrateFeud, settleFeudWithTerms } from "../systems/noble-feuds.js";
import { getDiplomacySnapshot, sendGift, proposeTradePact, proposeAlliance, declareWar, sueForPeace, appointEnvoy, recallEnvoy, sendEnvoyMission, negotiateEnvoyMission, reportEnvoyMission, ratifyEnvoyMission, grantGuarantee, withdrawGuarantee, honorGuaranteeCall, refuseGuaranteeCall, signTradeAgreement, cancelTradeAgreement } from "../systems/diplomacy.js";
import { describeStanding } from "../systems/diplomatic-standing.js";
import { startExpedition } from "../systems/expeditions.js";
import { attuneSpecialBiome, cleanseSpecialBiome, sellSpecialGood } from "../systems/special-biome-state.js";
import { resolveBiomeQuest, resolveBiomeQuestFollowUp, resolveBlightDecision } from "../systems/special-biome-couplings.js";
import { refreshTransitionSurvey, refreshVegetationDensity, renderExpeditionsPanel, stepTransitionSurvey } from "./expeditions-panel.js";
import { getRoyalHouse, appointRoyalConsort, createRoyalChild, designateHeir } from "../systems/royal-dynasty.js";
import { getRoyalEducationSnapshot, appointRoyalTutor, enrollRoyalStudent, holdRoyalAudience, dismissRoyalStudent } from "../systems/royal-education.js";
import { getForeignMarriageSnapshot, marryForeignRealm } from "../systems/royal-marriage.js";
import { getRoyalCrisisSnapshot, appointRegent, abdicateThrone, concedeCrown, pressClaim, settleClaim, suppressCivilConflict } from "../systems/royal-crisis.js";
import { renderEndeavoursPanel } from "./endeavours-panel.js";
import { startEndeavour, abandonEndeavour, setEndeavourFunding, setEndeavourOverseer } from "../systems/endeavours.js";
import { getFamilySnapshot } from "../systems/families.js";
import { BUILDING_WORKFORCE, getBuildingEfficiency, getWorkforceSnapshot } from "../systems/economy.js";
import { getEconomyCycleSnapshot } from "../systems/economy-cycle.js";
import { BUILDING_SIZE } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { CARD_DECK, drawPlayerCard, selectCard } from "../systems/cards.js";
import { getResourceNodeAt } from "../systems/resource-geography.js";
import { buildingFormFor } from "../world/building-forms.js";
import { forestFaunaSummaryAt } from "../systems/forest-fauna.js";
import { forestFaunaEcologyFor, forestFaunaEcologySummary } from "../world/forest-fauna-ecology.js";
import { cleanBiomeWater, craftBiomeGoods, drainBiomeRegion, harvestBiomeResource, huntBiomeSpecies, irrigateBiomeRegion, reforestBiomeRegion, reintroduceBiomeSpecies, restoreBiomeRegion, sellBiomeCraft, sellBiomeGoods, setBiomeFocus, setBiomePolicy, setBiomeProtection, slashAndBurnBiomeRegion, surveyBiomeRegion } from "../systems/biome-resource-state.js";
import { renderBiomePanel } from "./biome-panel.js";
import { invalidateForestAtlasSurvey, renderForestAtlasPanel } from "./forest-atlas-panel.js";
import { afforestForestRegion, buildForestInstitution, designateForestMonument, fundCitizenScience, protectForestRegion, reintroduceForestSpecies, setForestConservationLaw } from "../systems/forest-legacy.js";
import { previewForestAmbience } from "../core/forest-ambience.js";
import { forestPresentationProfile } from "../world/forest-presentation.js";
import { forestMapFilters, forestPresentationSummary, resetForestMapFilters, setForestMapFilter } from "../systems/forest-presentation.js";
import { timberMarketSummary, sellRegionalTimber, TIMBER_SALE_LOT } from "../systems/regional-timber-market.js";
import { FOREST_WORKS_MODES, SAW_PROFILES, INDUSTRY_GOODS } from "../world/forest-industries.js";
import { forestMasteryFor, forestMasterworkArchive, forestWorksStatus, runForestWorks, sawProfileIdFor, sellForestIndustryGood, setForestWorksMode, setSawProfile, supplyClinicMedicine } from "../systems/forest-industries.js";
import { deliverForestCommission, dispatchGuildCaravan } from "../systems/forest-guild.js";
import { brewForestRemedies, collectForestLore, consultForestHermit, dedicateSacredGrove, holdForestFestival, holdForestSchool, makeForestOffering, mediateForestConflict, performHuntRite, performTreeWedding, setForestDoctrine, setForestRights, tendSacredGrove } from "../systems/forest-culture.js";
import { burnForFields, clearRebelCamp, colonizeWoodland, commissionWarMaps, createJointPreserve, cutSiegeTimber, deportWoodlanders, fellAbatis, fightForestBattle, foundMilitaryColony, fundWarEcologyRecovery, layForestAmbush, levyTimberQuota, liftForestEmbargo, musterWarElephants, openForestRoad, openForestTradeRoute, pressForestSiege, pressSettlerClaims, raiseBorderPost, raiseForestPartisans, recognizeWoodlandRights, recruitForestScouts, reserveShipTimber, runForestSmuggling, setForestCustoms, setForestEmbargo, setWarFire, settleForestRefugees, signBorderTreaty, strengthenForestWatch, suppressForestResistance } from "../systems/forest-warfare.js";
import { grandConsumerStatusFor } from "../systems/grand-consumers.js";
import { renderScenarioPanel } from "./scenario-panel.js";
import { renderWorldMapPanel } from "./world-map-panel.js";
import { closeTradeRoute, getWorldMapSnapshot, grantProvinceCharter, openTradeRoute, pressRegionClaim, refuseProvincePetition, revokeProvinceCharter, setFrontierWatch } from "../systems/world-map.js";
import { getSettlementSeats, SETTLEMENT_SEAT_LIMIT, SETTLEMENT_TERRITORY_RADIUS } from "../systems/settlement-owners.js";
import { renderHazardPanel } from "./hazard-panel.js";
import { cleanseHazardCorruption, prepareForHazardSeason, treatHazardCasualties } from "../systems/environmental-hazards.js";
import {
    chooseHazardPlan, chooseRareEvent, fundHazardInsurance, requestHazardAid,
    resettleHazardGround, sendHazardAid, setHazardQuarantine, takeHazardLoan,
    trainHazardCrew, treatHazardDisease
} from "../systems/hazard-response.js";
import { deliverForestGoods, forestDeliveryAvailability, forestGatheringEconomySummary, forestGatheringSummary, forestSellAvailability, forestThinningAvailability, gatherNearestForestProducts, gatherNearestGrasslandProducts, performMountainWork, performSwampWork, performVolcanoWork, performCoastWork, processForestHunt, sellForestGoods, mountainWorkAvailability, swampWorkAvailability, volcanoWorkAvailability, coastWorkAvailability, thinNearestForest } from "../systems/forest-gathering.js";
import { grasslandSiteSummaryAt } from "../systems/grassland-use.js";
import { feedStableFromMast, pannageSummary } from "../systems/forest-pannage.js";
import {
    buildNearestForestFirebreak, controlledBurnNearestForestTile,
    reforestNearestForestTile, suppressNearestForestDisturbance,
    toggleNearestWetlandDrainage,
} from "../systems/forest-succession.js";
import { renderUI, cardSprite } from "./rendering/ui.js";
import { getHousingSnapshot, getHouseholdSnapshot } from "../systems/population.js";
import { renderPopulationPanel, setPopulationFilter, setPopulationQuery, stepPopulationPage } from "./population-panel.js";
import { renderAiChroniclePanel, renderAiArchiveSection } from "./ai-chronicle-panel.js";
import { renderLivingTimeline, renderLivingTimelineChunks, renderTimelineDetailCard, renderTimelineCardBatch, MAX_VISIBLE_TIMELINE_CARDS, TIMELINE_INITIAL_CARDS, TIMELINE_CARD_BATCH, focusTimelineEvent, resetTimelineView, setTimelineFilter, setTimelineYear, stepTimelineYear, clearTimelineSelection, getTimelineView } from "./event-timeline-panel.js";
import { performAiAction } from "../systems/ai-chronicle.js";
import { getCreatureSnapshot, summonCreature, summonDragon } from "../systems/creatures.js";
import { CREATURE_SPECIES_LIST } from "../world/creature-species-data.js";
import { getMilitarySnapshot, recruitVillager, trainSoldier, equipSoldier, buyHorse, mountSoldier, demobilizeSoldier } from "../systems/military.js";
import { getHealthSnapshot, improveSanitation, appointHealer, dismissHealer, brewMedicine, treatSick, sellMedicine, setQuarantine, applyHerbalRemedy } from "../systems/health.js";
import { getEspionageSnapshot, recruitAgent, dismissAgent, assignAgent, screenCourt, warnHouse, demandConcession, plantFalseTrail, ESPIONAGE_DESKS, ESPIONAGE_DESK_LABELS } from "../systems/espionage.js";
import { getFaithSnapshot, appointClergy, dismissClergy, holdFestival, fundPilgrimage, setCultureBudget, addressHeresy } from "../systems/faith.js";
import { getJusticeSnapshot, appointJudge, dismissJudge, setLawCode, grantCharter, tryCase, investigateCorruption } from "../systems/justice.js";
import { getIdentitySnapshot } from "../systems/identity.js";
import { getResearchSnapshot, startResearch, setResearchFunding, appointScholar, dismissScholar } from "../systems/research.js";
import { GRAIN_CONTRACTS, WATERWORKS_LEVELS, getCrownSupplySnapshot, setGrainContract, setWaterworks, upgradeHousingStock, provisionGranary } from "../systems/crown-supply.js";
import { applyCrownRelief } from "../systems/crown-relief.js";
import { getRealmCycleSnapshot, resolveRealmCyclePetition } from "../systems/realm-cycle.js";
import { getLegacySnapshot } from "../systems/legacy.js";
import { constructionSnapshot, isUnderConstruction } from "../systems/construction.js";
import { getBulkRepairSnapshot, getBuildingRepairSnapshot, getRealmDamageSnapshot, repairAllDamaged, repairBuilding } from "../systems/building-repair.js";
import { CARRIER_CAPACITY, getInventorySummary, getBuildingLogisticsStatus, getBuildingSupplyReason, getCitySummary, getGoodsAudit, getLogisticsSnapshot, getPhysicalStockMap, setWarehouseProfile } from "../systems/logistics.js";
import { getManualLogisticsSnapshot, placeManualOrder } from "./manual-logistics.js";
import { chainTagsFor, getProductionChainSnapshot, getWarehouseProfileSnapshot, warehouseProfileHint } from "./production-chain.js";
import { BUILDING_COSTS, GOODS, GOOD_KEYS, WAREHOUSE_PROFILES } from "../systems/city-config.js";
import { getSettlementSnapshot, getServiceReason } from "../systems/settlement.js";
import { foresterRangeSummary } from "../systems/fields.js";
import { renderCityPanel, handleCityPanelClick } from "./city-panel.js";
import { openBuildPanel } from "./build-ui.js";
import { renderItemLexicon } from "./item-lexicon-panel.js";
import { renderProgressive, cancelProgressiveRender } from "./progressive-render.js";
let activePanel="kingdom",commandOpenRenderToken=0,panelRenderSeq=0,panelRevealToken=0,expandedBuildingId=null,expandedBuildingLogistics=false,buildingShowAll=false,courtShowAll=false,dynastyStylesRequested=false,endeavourFunding=1,timelineRefreshFrame=0,timelineHydrationToken=0,chronicleProgressToken=0,chronicleSectionsToken=0,detailRefreshToken=0;
const MANAGEMENT_TAB_IDS=new Set(MANAGEMENT_TABS.map(tab=>tab.id));
const FRAME_WORK_BUDGET=7;
// These ledgers carry the most nested cards per open. Their full innerHTML
// layout measured 52-75 ms at 4x CPU throttle, so they use the existing
// frame-budgeted hydrator on desktop as well as on a phone. Kingdom is
// included because opening the deck first paints the previously active tab.
const STAGED_OPEN_PANELS=new Set(["kingdom","population","nobility","diplomacy"]);
let frameWorkQueue=[],frameWorkFrame=0;
// At phone width the court and diplomacy selects contain the same long list of
// named residents once per office/realm. Keep those option sets out of the
// initial innerHTML and append them on first focus or pointer contact.
const lazyOptionSets=new Map();
const narrowViewport=()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 640px)").matches;
function setCommandModalOpen(open){
 const modal=document.getElementById("command-modal");
 if(!modal)return;
 modal.classList.toggle("hidden",!open);
 // The shell stays laid out while closed; visibility is the only state that
 // changes. Set it inline in the same task as the class so Chromium cannot
 // serve the previous hidden style to an immediate open assertion.
 modal.style.setProperty("visibility",open?"visible":"hidden","important");
}
function hydrateLazySelect(select){
 if(!select||!select.dataset.lazyOptions||select.dataset.lazyOptionsReady)return;
 const options=lazyOptionSets.get(select.dataset.lazyOptions);
 if(!options)return;
 select.insertAdjacentHTML("beforeend",options);
 select.dataset.lazyOptionsReady="1";
}
const CULLED_CARD_SELECTOR=[
 ".command-policy",".command-card",".command-resource",".court-office",".court-history>div",
 ".city-policy",".city-service-card",".city-codex-card",".population-citizen",
 ".population-household",".building-record",".diplomacy-realm",".military-soldier",
 ".health-healer",".creature-record",".dynasty-person",".endeavour-card",".item-lexicon__entry"
].join(",");
let lowEndCullObserver=null,lowEndCullFrame=0,lowEndRevealQueue=[],lowEndRevealFrame=0;
function releaseCulledCards(){
 lowEndRevealFrame=0;
 const target=lowEndRevealQueue.shift();
 if(target?.isConnected)target.classList.add("is-cv-ready");
 if(lowEndRevealQueue.length)lowEndRevealFrame=requestAnimationFrame(releaseCulledCards);
}
function schedulePanelCulling(){
 return;
 if(!narrowViewport())return;
 if(lowEndCullFrame)return;
 lowEndCullFrame=requestAnimationFrame(()=>{
  lowEndCullFrame=0;
  const panel=$("command-panel-content");
  if(!panel||!panel.isConnected)return;
  lowEndCullObserver?.disconnect();
  const targets=[...panel.querySelectorAll(CULLED_CARD_SELECTOR)].filter(element=>!element.classList.contains("is-cv-ready"));
  if(!targets.length){lowEndCullObserver=null;return;}
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    observer.unobserve(entry.target);
    lowEndRevealQueue.push(entry.target);
    if(!lowEndRevealFrame)lowEndRevealFrame=requestAnimationFrame(releaseCulledCards);
   }
  },{root:panel,rootMargin:"240px 0px"});
  lowEndCullObserver=observer;
  targets.forEach(element=>observer.observe(element));
 });
}
const $=id=>document.getElementById(id),esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function forestDynamicsDetail(dynamics){
 if(!dynamics)return"";
 const pct=value=>Math.round((Number(value)||0)*100),age=dynamics.age||{},regen=dynamics.regeneration||{};
 const structure=dynamics.structure||{},soil=dynamics.soil||{},regime=dynamics.hazard?.regime||{};
 const system=dynamics.silviculture||{},deadwood=structure.deadwoodProfile||{},gap=structure.gapProfile||{};
 const edge=structure.edgeProfile||{},litter=soil.litterProfile||{},herb=structure.herbProfile||{};
 const working=dynamics.working||{},timber=working.timber||{},forage=working.forage||{},habitat=working.habitat||{};
 const cohorts=age.cohorts||{},bits=[
  "Working sawlogs "+pct(timber.sawlog)+"% · firewood "+pct(timber.firewood)+"% · specialty "+pct(timber.specialty)+"% · quality "+pct(timber.quality)+"% · log share "+pct(timber.logShare)+"% · volume "+pct(timber.volume)+"% · mushrooms "+pct(forage.mushrooms)+"% · herbs "+pct(forage.herbs)+"% · mast "+pct(forage.mast)+"% · game "+pct(forage.game)+"% · honey "+pct(forage.honey)+"% · berries "+pct(forage.berries)+"% · fibre "+pct(forage.fibre)+"% · habitat "+pct(habitat.score)+"%",
  "Cohorts "+pct(cohorts.young)+"/"+pct(cohorts.mature)+"/"+pct(cohorts.ancient)+"% young/mature/ancient ("+(age.uneven?"uneven":"even")+", spread "+Math.round(Number(age.spreadYears)||0)+"y)",
  "Seed source "+esc(regen.seedSource||"stand")+" · rain "+pct(regen.seedRain)+"% · germ "+pct(regen.germination)+"% · seedlings "+pct(regen.seedlingBank)+"% · recruit "+pct(regen.saplingRecruitment)+"%",
  "Deadwood "+pct(deadwood.total)+"% (standing "+pct(deadwood.standing)+"% / fallen "+pct(deadwood.fallen)+"% / stumps "+pct(deadwood.stumps)+"% · decay "+pct(deadwood.decay)+"% · cavities "+Math.round(Number(deadwood.cavityTreesPerHa)||0)+"/ha)",
  "Gap "+pct(structure.canopyGap)+"% "+esc(gap.sizeClass||"none")+" "+esc(gap.origin||"none")+" · "+Math.round(Number(structure.gapAge)||0)+"d old",
  "Edge "+(edge.active?Math.round(Number(edge.widthM)||0)+"m mantle / "+pct(edge.mantleCover)+"% cover":"interior")+" · diversity "+pct(structure.edgeDiversity)+"%",
  "Litter "+pct(litter.broadleaf)+"/"+pct(litter.needle)+" leaf/needle · "+Math.round(Number(litter.depthCm)||0)+"cm litter · "+Math.round(Number(soil.humusDepthCm)||0)+"cm humus",
  "Rooting "+esc(soil.rootingType||"roots")+" · "+esc(soil.mycorrhizaType||"mixed network")+" "+Math.round(Number(soil.networkReachM)||0)+"m · uptake "+pct(soil.waterUptake)+"%",
  "Liana "+esc((structure.lianaProfile?.types||[]).join(", ")||"none")+" · epiphytes "+esc((structure.epiphyteProfile?.groups||[]).join(", ")||"none"),
  "Herb food/medicine "+pct(herb.food)+"%/"+pct(herb.medicine)+"% · flowering "+pct(herb.flowering)+"%",
  "Treatment rotation "+pct(system.rotationProgress)+"% · retention "+Math.round(Number(system.retentionTreesPerHa)||0)+"/ha · harvest "+pct(system.harvestIntensity)+"% · canopy target "+pct(system.canopyTarget)+"% · regime return "+Math.round(Number(regime.returnIntervalYears)||0)+"y",
 ];
 return " · "+bits.join(" · ");
}
const groupNumber=value=>String(Math.floor(Number(value)||0)).replace(/\B(?=(\d{3})+(?!\d))/g,",");
const number=value=>groupNumber(value);
const amount=value=>{const rounded=Math.round((Number(value)||0)*100)/100;const [whole,fraction]=String(rounded).split(".");return whole.replace(/\B(?=(\d{3})+(?!\d))/g,",")+(fraction?"."+fraction:"");};
const costLabel=cost=>Object.entries(cost||{}).filter(([,value])=>Number(value)>0).map(([key,value])=>Math.floor(Number(value))+" "+key.toUpperCase()).join(" · ");
const BUILDING_LABELS=Object.freeze({
 [TYPE.KEEP]:"Royal Keep",[TYPE.HOUSE]:"House",[TYPE.FARM]:"Farm",[TYPE.LUMBER]:"Lumber Yard",
 [TYPE.QUARRY]:"Quarry",[TYPE.TOWER]:"Watchtower",[TYPE.WALL]:"Defensive Wall",[TYPE.TAVERN]:"Tavern",
 [TYPE.TEMPLE]:"Temple",[TYPE.BARRACKS]:"Barracks",[TYPE.MILL]:"Mill",[TYPE.STABLE]:"Stables",
 [TYPE.WONDER]:"Wonder",[TYPE.GOLDMINE]:"Gold Mine",[TYPE.BARREL]:"Storage Barrel",
 [TYPE.TENT]:"Tent",[TYPE.STONE_HOUSE]:"Stone House",[TYPE.WAREHOUSE]:"Warehouse",[TYPE.SAWMILL]:"Sawmill",
 [TYPE.BAKERY]:"Bakery",[TYPE.WELL]:"Well",[TYPE.MASON]:"Mason's Yard",[TYPE.FORESTER]:"Forester's Lodge",
 [TYPE.CLINIC]:"Clinic",[TYPE.MARKET]:"Market",[TYPE.SHRINE]:"Shrine",[TYPE.COURT]:"Court of Law",
 [TYPE.PRISON]:"Prison",[TYPE.TOWN_HALL]:"Town Hall",[TYPE.SCHOOL]:"School",[TYPE.BATHHOUSE]:"Bathhouse",
 [TYPE.BREWERY]:"Brewery",[TYPE.GUILDHALL]:"Guildhall",[TYPE.WATCHHOUSE]:"Watchhouse",
 [TYPE.SMITHY]:"Smithy",[TYPE.SCRIPTORIUM]:"Scriptorium",[TYPE.FOREST_WORKS]:"Forest Works"
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
// Touch has no hover, so atlas explanations open on a real tap as a single
// shared tooltip. Keyboard focus still exposes the same text through the
// button's native title and the live tooltip region.
function hideForestTip(){
 const tip=$("forest-tip");
 document.querySelectorAll("[data-forest-tip][aria-describedby='forest-tip']").forEach(target=>target.removeAttribute("aria-describedby"));
 if(!tip)return;
 tip.classList.add("hidden");
 tip.setAttribute("aria-hidden","true");
 tip.textContent="";
}
function showForestTip(target){
 const tip=$("forest-tip"),text=target?.getAttribute("data-forest-tip");
 if(!tip||!text)return;
 hideForestTip();
 tip.textContent=text;
 tip.classList.remove("hidden");
 tip.setAttribute("aria-hidden","false");
 target.setAttribute("aria-describedby","forest-tip");
 const anchor=target.getBoundingClientRect(),box=tip.getBoundingClientRect(),margin=8;
 const half=box.width/2;
 const left=Math.min(Math.max(margin+half,anchor.left+anchor.width/2),window.innerWidth-margin-half);
 let top=anchor.bottom+8;
 if(top+box.height>window.innerHeight-margin)top=Math.max(margin,anchor.top-box.height-8);
 tip.style.left=Math.round(left)+"px";
 tip.style.top=Math.round(top)+"px";
}
function toggleForestTip(target){
 const open=target.getAttribute("aria-describedby")==="forest-tip";
 hideForestTip();
 if(!open)showForestTip(target);
}

function resourceCostLabel(cost){return Object.entries(cost||{}).map(([key,amount])=>amount+" "+String(key).toUpperCase()).join(" · ")||"no stores";}
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
 const cycle=getEconomyCycleSnapshot();
 let ledgerNote;
 if(key==="gold"&&ledger)ledgerNote="Latest settlement: "+amount(ledger.taxesCollected)+" gold taxes · "+amount((Number(ledger.wagesPaid)||0)+(Number(ledger.upkeepPaid)||0)+(Number(ledger.furnitureUpkeepPaid)||0))+" gold in wages and upkeep · net "+(Number(ledger.netGold)>=0?"+":"")+amount(ledger.netGold)+" gold · debt "+amount(cycle.debt)+"G (interest "+amount(cycle.debtInterest)+"G).";
 else if(key==="food"&&ledger)ledgerNote="Latest settlement: "+amount(ledger.foodInflow)+" gross food inflow · "+amount(ledger.foodDemand)+" demanded · "+amount(ledger.foodConsumed)+" consumed · "+amount(ledger.foodSpoiled)+" spoiled · "+amount(ledger.foodShortage)+" shortage · storage "+amount(cycle.storageCapacity)+".";
 else ledgerNote="The 20-day financial ledger does not settle "+esc(meta.unit)+"; this chart records stock at each completed settlement.";
 return '<article class="resource-detail-card" data-resource="'+esc(key)+'"><header><svg class="resource-detail-art" viewBox="0 0 64 64" aria-hidden="true"><use href="'+meta.art+'"></use></svg><div><small>ROYAL STORE</small><h4>'+esc(meta.label)+'</h4></div><div class="resource-detail-stock"><strong>'+number(stock)+'</strong><span>IN STORE</span></div></header><div class="resource-detail-stats"><div><small>CURRENT TICK FLOW</small><strong class="'+(flow>0?'is-positive':flow<0?'is-negative':'')+'">'+(flow>0?'+':'')+amount(flow)+'</strong></div><div><small>SETTLEMENT CHANGE</small><strong class="'+(delta!==null&&delta>=0?'is-positive':delta!==null?'is-negative':'')+'">'+(delta===null?'AWAITING DATA':(delta>=0?'+':'')+amount(delta))+'</strong></div><div><small>RELATED STRUCTURES</small><strong>'+related.reduce((sum,item)=>sum+item.count,0)+'</strong></div></div>'+trendChart(history,key,meta.label+" stock at settlement")+'<p class="command-note">'+ledgerNote+'</p><div class="resource-related"><span>RECORDED BUILDINGS</span>'+(related.length?related.map(item=>'<b class="resource-building-chip">'+esc(item.name)+' ×'+item.count+'</b>').join(""):'<em>No related structure is recorded.</em>')+'</div><p class="command-note">'+esc(meta.note)+'</p></article>';
}
export function resources(){
 if(!state.hasStarted)return intro("ROYAL STORES","Awaiting its founding","Resource detail becomes active when a new campaign begins.")+'<div class="command-note">No campaign is running yet. Found a realm to read its stocks, flows and bounded settlement history.</div>';
 const history=Array.isArray(state.economy?.history)?state.economy.history:[];
 const cycle=getEconomyCycleSnapshot();
 return intro("THE ROYAL STORES","Resource detail","Inspect every store together with its current-tick flow, the latest completed settlement and a real, bounded stock history. Charts use stored settlement points only.")+
 '<div class="command-summary"><div><small>WOOD</small><strong>'+number(state.resources.wood)+'</strong></div><div><small>STONE</small><strong>'+number(state.resources.stone)+'</strong></div><div><small>GOLD</small><strong>'+number(state.resources.gold)+'</strong></div><div><small>FOOD</small><strong>'+number(state.resources.food)+'</strong></div></div>'+
 '<div class="command-summary"><div><small>FOOD BALANCE / LEDGER</small><strong>'+(cycle.balance>=0?'+':'')+amount(cycle.balance)+'</strong></div><div><small>STORAGE CAP</small><strong>'+number(cycle.storageCapacity)+'</strong></div><div><small>DEBT</small><strong>'+amount(cycle.debt)+'G</strong></div><div><small>CRISIS</small><strong>'+Math.round(cycle.crisis.severity*100)+'%</strong></div></div>'+
 '<div class="resource-detail-grid">'+RESOURCE_ORDER.map(key=>resourceCard(key,history)).join("")+'</div>'+
 '<p class="command-note">Stock history contains up to 24 completed 20-day settlements. The chart is intentionally blank until two settlements exist; no interpolated or invented points are drawn.</p>'+
 goodsOverviewPanel(cycle)+
 productionChainPanel()+
 warehouseProfilePanel()+
 timberMarketPanel();
}

// The four royal resources are only part of the economy: warehouses, building
// inventories and carriers hold named goods. This overview reads the same
// physical-stock and audit models the logistics system already maintains, so a
// player can see what is actually in the realm before ordering another haul.
// It is presentation-only: no state field, movement or tick work is added.
function goodsOverviewPanel(cycle){
 let stock,audit;
 try{stock=getPhysicalStockMap();audit=getGoodsAudit();}catch{return "";}
 const rows=audit.rows.map(row=>{
  const good=String(row.good||"");
  return {
   good,
   label:GOODS[good]?.label||(good==="food"?"Royal food":good),
   scope:row.scope,
   physical:Math.max(0,Number(stock?.[good] ?? row.physical)||0),
   produced:Math.max(0,Number(row.produced)||0),
   consumed:Math.max(0,Number(row.consumed)||0),
   balanced:Boolean(row.balanced)
  };
 });
 const needs=[];
 const foodShortage=Math.max(0,Number(cycle?.shortage)||0);
 if(foodShortage>0)needs.push({good:"food",label:"Royal food",detail:"Last settlement recorded "+amount(foodShortage)+" food short"});
 for(const row of rows){
  if(row.good==="food"||row.physical>0||row.consumed<=0)continue;
  needs.push({good:row.good,label:row.label,detail:"Store empty · "+amount(row.consumed)+" consumed since the audit began"});
  if(needs.length>=3)break;
 }
 const needMarkup=needs.length
  ?needs.map(item=>'<div class="goods-shortage-row" data-good-need="'+esc(item.good)+'"><strong>'+esc(item.label)+'</strong><span>'+esc(item.detail)+'</span></div>').join("")
  :'<div class="goods-shortage-row is-clear"><strong>NOTHING URGENT</strong><span>No audited store is empty while consumption is recorded.</span></div>';
 const goodsMarkup=rows.map(row=>'<article class="goods-detail-card" data-good="'+esc(row.good)+'"><header><strong>'+esc(row.label)+'</strong><span>'+esc(row.scope)+'</span></header><div><small>IN REALM</small><b>'+number(row.physical)+'</b></div><div><small>PRODUCED</small><b>'+number(row.produced)+'</b></div><div><small>CONSUMED</small><b>'+number(row.consumed)+'</b></div><footer>'+(row.balanced?'<span class="is-balanced">BALANCED</span>':'<span class="is-unbalanced">AUDIT DIFFERENCE</span>')+'</footer></article>').join("");
 const auditNote=audit.balanced
  ?"The goods audit reconciles opening stock plus production minus consumption with the physical stock in warehouses, building inventories and carrier loads."
  :"Some rows do not reconcile with opening stock plus production minus consumption; the Buildings register opens the full movement and delivery archive.";
 return '<div class="command-section-title">PHYSICAL GOODS · '+number(rows.length)+' LEDGER LINES · '+number(GOOD_KEYS.length)+' NAMED GOODS</div>'+
  '<div class="goods-shortage-board"><span>NEEDS ATTENTION</span>'+needMarkup+'</div>'+
  '<div class="goods-detail-grid">'+goodsMarkup+'</div>'+
  '<p class="command-note">'+esc(auditNote)+' Stock and audit totals are read from live state; this board never moves goods or changes a price.</p>';
}

// Regional timber is physical warehouse stock, so its market lives beside the
// royal stores rather than in a separate trade screen. Each row shows the real
// unit quote and lets the crown sell a bounded lot from the timber yards.
function timberMarketPanel(){
 let market;
 try{market=timberMarketSummary();}catch{return "";}
 if(!market?.rows?.length)return "";
 const rows=market.rows.map(row=>'<div class="timber-market__row" data-timber-good="'+esc(row.id)+'"><div class="timber-market__name"><strong>'+esc(row.label)+'</strong><small>'+esc(row.speciesLabel)+' · '+row.planks+' planks per 2 · '+row.stock+' in store</small></div><span class="timber-market__price">'+amount(row.price)+'G</span><button type="button" class="command-choice timber-market__sell" data-command="timber-sell" data-value="'+esc(row.id)+'"'+(row.stock>0?'':' disabled')+'>SELL '+TIMBER_SALE_LOT+'</button></div>').join("");
 return '<div class="command-section-title">REGIONAL TIMBER MARKET · '+number(market.kinds)+' / '+number(market.totalKinds)+' KINDS IN STORE · '+amount(market.value)+'G VALUE</div>'+
  '<div class="timber-market">'+rows+'</div>'+
  '<p class="command-note">A sawmill turns two units of a named timber into its own plank and firewood batch. Timbers reach the yard from a delivered forester haul or from a lumber camp working a regional stand. Selling removes real warehouse stock at the current seasonal quote.</p>';
}

// The chain register is a read model, not a second economy. It shows the real
// structures, their declared recipe, physical stock and the same ready carrier
// orders the Buildings register offers. Chains are collapsed so the Stores tab
// stays within the low-end panel budget until a player opens one.
function productionChainPanel(){
 let snapshot;
 try{snapshot=getProductionChainSnapshot();}catch{return "";}
 const chains=snapshot?.chains||[];
 const chainRows=chains.map(chain=>{
  const stages=chain.stages.map(stage=>{
   const orders=(stage.orders||[]).slice(0,4).map(order=>'<button type="button" class="command-choice chain-order" data-command="manual-order" data-manual-order="'+esc(order.kind)+'" data-value="'+esc(order.buildingId)+'" data-good="'+esc(order.good)+'" data-quantity="'+number(order.quantity)+'">'+esc((order.kind==="supply"?"SUPPLY ":"HAUL ")+order.quantity+" "+order.label).toUpperCase()+'</button>').join("");
   const focus=stage.focusBuildingId!==null?'<button type="button" class="command-choice chain-focus" data-chain-focus="'+esc(stage.focusBuildingId)+'">SHOW BUILDING</button>':"";
   return '<div class="chain-stage" data-chain-stage="'+esc(stage.id)+'" data-chain-status="'+esc(stage.status)+'"><span class="chain-stage-head"><strong>'+esc(stage.label)+'</strong><b>'+esc(stage.status)+'</b></span><small>'+number(stage.count)+' structures · '+number(stage.ready)+' ready · '+number(stage.sites)+' sites · '+number(stage.stock)+' goods in realm</small><small>'+esc(stage.recipe)+' · '+esc(stage.goods.join(", "))+'</small>'+orders+focus+'</div>';
  }).join("");
  const active=chain.stages.filter(stage=>stage.ready>0).length;
  return '<details class="chain-record" data-chain-id="'+esc(chain.id)+'"><summary><span><strong>'+esc(chain.label)+'</strong><small>'+number(active)+' / '+number(chain.stages.length)+' stages have a ready structure</small></span><b>'+number(active)+' ACTIVE</b></summary><div class="chain-detail"><p class="command-note">'+esc(chain.note)+'</p><div class="chain-stage-grid">'+stages+'</div></div></details>';
 }).join("");
 const stageTotal=chains.reduce((sum,chain)=>sum+(chain.stages?.length||0),0);
 return '<div class="command-section-title">PRODUCTION CHAINS · '+number(chains.length)+' ROUTES · '+number(stageTotal)+' STAGES</div>'+
  '<div class="chain-register">'+(chainRows||'<p class="command-note">No chain is declared yet.</p>')+'</div>'+
  '<p class="command-note">Every row reads live structures, recipes and physical stock. READY counts structures with no current supply block; it is not a forecast. A carrier button or SHOW BUILDING uses the same verified path as the Buildings register.</p>';
}

// Warehouse profiles are a filter and capacity setting on an existing store.
// This board explains the settings and names any good that currently has stock
// but no accepting free space; it never changes a profile by itself.
function warehouseProfilePanel(){
 let snapshot;
 try{snapshot=getWarehouseProfileSnapshot();}catch{return "";}
 const rows=(snapshot?.profiles||[]).map(profile=>'<div class="warehouse-profile-card" data-profile-id="'+esc(profile.id)+'"><strong>'+esc(profile.label)+'</strong><small>'+esc(profile.description)+'</small><small>'+number(profile.stores)+' stores · '+number(profile.used)+' used · '+number(profile.free)+' free · '+number(profile.heldGoodKinds)+' matching realm kinds · '+number(profile.accepts)+' accepted goods</small></div>').join("");
 const stranded=(snapshot?.stranded||[]).map(item=>'<span class="warehouse-stranded" data-stranded-good="'+esc(item.good)+'">'+esc(item.label)+' · '+number(item.stored)+' held, no accepting space</span>').join("");
 return '<div class="command-section-title">WAREHOUSE PROFILES · '+number(snapshot?.stores||0)+' STORES · '+number(snapshot?.free||0)+' / '+number(snapshot?.capacity||0)+' SPACE FREE</div>'+
  '<div class="warehouse-profile-grid">'+(rows||'<p class="command-note">No profile is declared yet.</p>')+'</div>'+
  (stranded?'<div class="warehouse-stranded-board"><span>NO ACCEPTING STORE</span>'+stranded+'</div>':'')+
  '<p class="command-note">A profile narrows which goods a store accepts and how much it holds. Granary, timber yard, stone depot and cistern only accept their named goods; the royal keep stays a general store. Change a profile on an individual store in the Buildings register.</p>';
}
function realmCycleStatus(){
 const c=getRealmCycleSnapshot();
 const phase=String(c.phase||"stable").toUpperCase();
 const petition=c.petition?'A '+esc(c.petition.faction)+' petition is waiting in Politics.':'No petition is waiting. The crown can still watch the reserve and the market before pressure becomes a demand.';
 const reserve=Number(c.drivers?.reserveYears)||0;
 const price=Number(c.drivers?.foodPrice)||0;
 return '<div class="command-summary"><div><small>PHASE</small><strong>'+esc(phase)+'</strong></div><div><small>SCARCITY</small><strong>'+Math.round(c.scarcity*100)+'%</strong></div><div><small>MARKET PRESSURE</small><strong>'+Math.round(c.marketPressure*100)+'%</strong></div><div><small>UNREST</small><strong>'+Math.round(c.unrest*100)+'%</strong></div><div><small>RESERVE</small><strong>'+amount(reserve)+' Y</strong></div><div><small>GRAIN PRICE</small><strong>'+amount(price)+'G</strong></div></div><p class="command-note">'+petition+'</p>';
}
function kingdom(){
 if(!state.hasStarted)return intro("THE REALM OF "+(state.kingdomName||"ELDRIA"),"Awaiting its founding","The royal ledger becomes active when a new campaign begins.")+'<div class="command-note">No campaign is running yet. Begin a new game to appoint the sovereign, populate the settlement and activate the royal ledger.</div>';
 const scenarioMarkup=renderScenarioPanel();
 const world=getWorldMapSnapshot();
 const pressedFrontiers=world.realms.filter(realm=>realm.pressure>=45).length;
 const worldMarkup='<div class="command-summary"><div><small>STANDING ROUTES</small><strong>'+world.routes.length+' / '+world.limits.routes+'</strong></div><div><small>GOODS MOVED</small><strong>'+number(world.totals.delivered)+'</strong></div><div><small>FRONTIER PRESSURE</small><strong>'+pressedFrontiers+' PRESSED</strong></div><div><small>BORDER INCIDENTS</small><strong>'+number(world.totals.incidents)+'</strong></div></div><p class="command-note">Open WORLD in this deck for the compass map, standing caravans and the frozen frontier bands. Caravans move real market stock into settlement depots; a contested frontier can take stores from the nearest seat and raise the diplomacy border levy.</p>';
 const seats=getSettlementSeats();
  const firstSeat=seats.slice().sort((a,b)=>(a.foundedYear||0)-(b.foundedYear||0)||String(a.name||"").localeCompare(String(b.name||""))||String(a.buildingId||"").localeCompare(String(b.buildingId||"")))[0];
  const firstSeatLabel=firstSeat?esc(firstSeat.name)+' · '+number(firstSeat.x)+','+number(firstSeat.y)+' · YEAR '+number(firstSeat.foundedYear):"No chartered seat";
  const seatMarkup='<div class="command-summary"><div><small>CHARTERED SEATS</small><strong>'+number(seats.length)+' / '+number(SETTLEMENT_SEAT_LIMIT)+'</strong></div><div><small>TERRITORY RADIUS</small><strong>'+number(SETTLEMENT_TERRITORY_RADIUS)+' TILES</strong></div><div><small>FIRST SEAT</small><strong>'+firstSeatLabel+'</strong></div></div><p class="command-note">No separate capital field is recorded; First Seat means the oldest chartered seat. Each seat guards a bounded radius and keeps its own repair stores and treasury, all read from the running settlement registry.</p>';
  const damage=getRealmDamageSnapshot();
  const damageMarkup=damage.damaged
    ?'<div class="command-summary"><div><small>DAMAGED STRUCTURES</small><strong>'+number(damage.damaged)+'</strong></div><div><small>DEFENSIVE</small><strong>'+number(damage.defensive)+'</strong></div><div><small>MISSING HP</small><strong>'+number(damage.missingHp)+'</strong></div><div><small>WORST</small><strong>'+esc(damage.worst.name)+' · '+Math.round(damage.worst.ratio*100)+'%</strong></div></div><p class="command-note">Raids, floods and avalanches can leave a finished building standing but hurt. Open WORKSHOP, select the structure on the map and press REPAIR to spend the shown materials.</p>'
    :'<div class="command-note">Every finished structure is sound. Raids, floods and avalanches can damage buildings; the Workshop can restore them.</div>';
  const h=getRoyalHouse(),p=getPoliticalSnapshot(),w=getWorkforceSnapshot(),housing=getHousingSnapshot();
 const sovereign=h.king?.person?.name||"No sovereign recorded";
 const income=state.incomeThisTick||{};
 const resources=Object.entries(state.resources||{}).map(([key,value])=>'<div class="command-resource"><span>'+esc(key)+'</span><strong>'+number(value)+'</strong></div>').join("");
 const recent=(state.eventLog||[]).slice(0,5).map(entry=>'<article class="command-history"><strong>REALM RECORD</strong><p>'+esc(entry.text||entry.title||entry.message||"Recorded event")+'</p></article>').join("");
 const active=state.activeEvent?'<div class="command-note"><strong>ACTIVE ISSUE</strong><br>'+esc(state.activeEvent.title||state.activeEvent.name||"A realm issue requires attention")+'</div>':'<div class="command-note">No realm-wide event is currently awaiting a decision.</div>';
 return intro("THE REALM OF "+(state.kingdomName||"ELDRIA"),"Kingdom overview","A live summary of the crown, people, treasury and stability. Figures below are read from the running simulation.")+
 '<div class="command-summary"><div><small>SOVEREIGN</small><strong>'+esc(sovereign)+'</strong></div><div><small>YEAR</small><strong>'+number(state.year)+'</strong></div><div><small>POPULATION</small><strong>'+number(housing.population)+'</strong></div><div><small>MORALE</small><strong>'+Math.round(state.morale||0)+'/100</strong></div></div>'+
 (scenarioMarkup?'<div class="command-section-title">SCENARIO OBJECTIVE</div>'+scenarioMarkup:'')+
 '<div class="command-section-title">THE WORLD BEYOND</div>'+worldMarkup+
 '<div class="command-section-title">SEAT NETWORK</div>'+seatMarkup+'<div class="command-section-title">STRUCTURE DAMAGE</div>'+damageMarkup+
  '<div class="command-section-title">THE REALM AT A GLANCE</div><div class="command-summary"><div><small>TREASURY</small><strong>'+number(state.resources?.gold)+'</strong></div><div><small>HOUSING</small><strong>'+number(housing.population)+' / '+number(housing.capacity)+'</strong></div><div><small>EMPLOYED</small><strong>'+number(w.employed)+'</strong></div><div><small>LEGITIMACY</small><strong>'+Math.round(p.legitimacy)+'/100</strong></div></div>'+
 '<div class="command-section-title">LIVING REALM CYCLE</div>'+realmCycleStatus()+
 '<div class="command-section-title">ROYAL STORES</div><div class="command-resource-grid">'+resources+'</div>'+
 '<div class="command-section-title">CURRENT PRODUCTION FLOW</div><div class="command-resource-grid">'+Object.entries(income).map(([key,value])=>'<div class="command-resource"><span>'+esc(key)+' · change</span><strong>'+(Number(value)>0?"+":"")+number(value)+'</strong></div>').join("")+'</div>'+
 '<div class="command-section-title">REALM ISSUES</div>'+active+
 '<div class="command-section-title">RECENT CHRONICLE</div><div class="command-history-list">'+(recent||'<p class="command-note">No recent realm records are available.</p>')+'</div>'+
 '<p class="command-note">The seat network above is read from the settlement registry; no separate capital field is recorded.</p>';
}
function advisorSection(){
 const a=getAdvisorSnapshot(),gold=Number(state.resources?.gold)||0;
 const costText=cost=>Object.entries(cost||{}).map(([key,value])=>value+" "+key).join(" + ")||"no treasury cost";
 const evidence=advice=>(advice?.evidence||[]).map(item=>'<span>'+esc(item.label)+'<b>'+esc(item.value)+'</b></span>').join("");
 const memory=(a.memory||[]).slice(0,4).map(item=>'<div><span>'+esc(String(item.kind).toUpperCase())+' · YEAR '+item.year+'</span><p>'+esc(item.text)+'</p></div>').join("");
 if(!a.advisor){
  const options=(a.candidates||[]).map(candidate=>'<option value="'+esc(candidate.personId)+'">'+esc(candidate.name)+' · '+esc(candidate.faction)+' · fit '+candidate.fit+'</option>').join("");
  return '<div class="command-section-title">ROYAL ADVISOR</div><p class="command-note">No named advisor sits at the council table. A royal advisor reads the realm once a year, cites the figures behind every recommendation and may be biased by faction or ambition.</p><div class="command-inline"><select id="advisor-select" aria-label="Choose a royal advisor"><option value="">Choose an adult resident…</option>'+options+'</select><button data-command="advisor-appoint"'+(gold<a.appointmentCost||!options?" disabled":"")+'>APPOINT · '+a.appointmentCost+'G</button></div>';
 }
 const adv=a.advice;
 const adviceCard=adv?'<article class="advisor-advice" data-advisor-advice="'+esc(adv.id)+'"><div class="advisor-advice__head"><div><span class="advisor-kicker">'+esc(String(adv.kind).toUpperCase())+' COUNSEL · YEAR '+adv.createdYear+' · CONFIDENCE '+adv.confidence+'%</span><h4>'+esc(adv.title)+'</h4></div><span class="advisor-status">'+esc(String(adv.status).toUpperCase())+'</span></div><p class="advisor-advice__text">'+esc(adv.recommendation)+'</p><div class="advisor-evidence">'+evidence(adv)+'</div><small class="advisor-cost">COST · '+esc(costText(adv.cost))+' · EFFECT · '+esc(adv.effectsLabel||"recorded in the realm")+'</small><p class="advisor-bias">'+esc(adv.bias||"")+'</p>'+(["pending","evidence"].includes(adv.status)?'<div class="advisor-actions"><button data-command="advisor-action" data-value="accept"'+(adv.affordable?"":" disabled")+'>ACCEPT</button><button data-command="advisor-action" data-value="reject">REJECT</button><button data-command="advisor-action" data-value="delay">DELAY</button><button data-command="advisor-action" data-value="evidence"'+(adv.revealed?" disabled":"")+'>REQUEST EVIDENCE</button></div>':'<p class="command-note"><strong>COUNSEL CLOSED · '+esc(String(adv.outcome||adv.status).toUpperCase())+'</strong> The next annual council session brings new advice.</p>')+'</article>':'<p class="command-note">The advisor is reviewing the ledger. A recommendation will arrive at the next annual session.</p>';
 const candidates=(a.candidates||[]).filter(candidate=>candidate.personId!==a.advisor.personId).map(candidate=>'<option value="'+esc(candidate.personId)+'">'+esc(candidate.name)+' · '+esc(candidate.faction)+' · fit '+candidate.fit+'</option>').join("");
 return '<div class="command-section-title">ROYAL ADVISOR</div><article class="advisor-card" data-advisor="'+esc(a.advisor.personId)+'"><div class="advisor-card__head"><div><span class="advisor-kicker">'+esc(a.advisor.factionLabel.toUpperCase())+' ALIGNMENT · APPOINTED YEAR '+a.advisor.appointedYear+'</span><h4>'+esc(a.advisor.name)+'</h4><p>'+esc(a.advisor.biasReason)+'</p></div><span class="advisor-card__badge">ADVISOR</span></div><div class="advisor-stats"><span>COMPETENCE<b>'+Math.round(a.advisor.competence)+'</b></span><span>LOYALTY<b>'+Math.round(a.advisor.loyalty)+'</b></span><span>RELATIONSHIP<b>'+Math.round(a.advisor.relationship)+'</b></span><span>AMBITION<b>'+Math.round(a.advisor.ambition)+'</b></span></div>'+adviceCard+'<div class="advisor-replace"><select id="advisor-select" aria-label="Replace the royal advisor"><option value="">Choose a replacement…</option>'+candidates+'</select><button data-command="advisor-appoint"'+((gold<a.appointmentCost||!candidates)?" disabled":"")+'>REPLACE · '+a.appointmentCost+'G</button></div></article><div class="command-section-title">ADVISOR MEMORY · '+(a.memory||[]).length+' SIGNALS</div>'+(memory?'<div class="court-history">'+memory+'</div>':'<p class="command-note">No counsel has been recorded yet.</p>');
}
function courtSection(){
 const c=getCourtSnapshot(),gold=Number(state.resources?.gold)||0;
 const courtLazy=narrowViewport();
 const courtCollapsed=courtLazy&&!courtShowAll;
 const visibleOffices=courtCollapsed?c.offices.slice(0,1):c.offices;
 const offices=visibleOffices.map(office=>{
  if(office.holder){
   const h=office.holder;
   return '<article class="court-office" data-court-office="'+esc(office.id)+'"><div class="court-office__head"><div><span class="court-office__role">'+esc(office.label)+'</span><h4>'+esc(h.name)+'</h4><p>'+esc(office.description)+'</p></div><span class="court-office__badge">'+esc(h.factionLabel)+'</span></div><div class="court-office__stats"><span>COMPETENCE<b>'+Math.round(h.competence)+'</b></span><span>LOYALTY<b>'+Math.round(h.loyalty)+'</b></span><span>INTEGRITY<b>'+Math.round(h.integrity)+'</b></span><span>SALARY<b>'+h.salary+'G</b></span></div><p class="court-office__effect">'+esc(office.effect)+' · appointed year '+h.appointedYear+'</p><div class="court-actions"><button data-command="court-dismiss" data-value="'+esc(office.id)+'">DISMISS</button></div></article>';
  }
  const options=c.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · age '+Math.floor(p.ageYears)+' · '+esc(p.species)+' · fit '+Math.round(p.fits[office.id]||0)+'</option>').join("");
  const optionKey="court:"+office.id;
  if(courtLazy)lazyOptionSets.set(optionKey,options);
  const selectOptions=courtLazy?"":options;
  const selectLazy=courtLazy?' data-lazy-options="'+esc(optionKey)+'"':'';
  return '<article class="court-office court-office--vacant" data-court-office="'+esc(office.id)+'"><div class="court-office__head"><div><span class="court-office__role">'+esc(office.label)+'</span><h4>Office vacant</h4><p>'+esc(office.description)+'</p></div><span class="court-office__badge">VACANT</span></div><div class="command-inline"><select id="court-office-'+esc(office.id)+'" aria-label="Choose '+esc(office.label)+'"'+selectLazy+'><option value="">Choose a resident…</option>'+selectOptions+'</select><button data-command="court-appoint" data-value="'+esc(office.id)+'"'+((gold<c.appointmentCost||!c.candidates.length)?" disabled":"")+'>APPOINT · '+c.appointmentCost+'G</button></div><p class="court-office__effect">'+esc(office.effect)+'</p></article>';
 }).join("");
 const affordable=c.demand&&Object.entries(c.demand.cost).every(([key,value])=>(Number(state.resources?.[key])||0)>=value);
 const demand=c.demand?'<article class="court-demand"><div><span class="command-ribbon">'+esc(c.demand.factionLabel.toUpperCase())+' PETITION · EXPIRES YEAR '+c.demand.expiresYear+'</span><h4>'+esc(c.demand.title)+'</h4><p>'+esc(c.demand.description)+'</p><small>'+esc(costLabel(c.demand.cost))+'</small></div><button data-command="court-demand" data-value="'+esc(c.demand.faction)+'"'+(affordable?"":" disabled")+'>GRANT PETITION</button></article>':'<p class="command-note">No petition is waiting. The next annual court session will raise one.</p>';
 const m=c.modifiers;
 const effects='<div class="court-effect-grid"><span>TAX EFFICIENCY<b>+'+Math.round((m.taxEfficiency-1)*100)+'%</b></span><span>DIPLOMATIC GAIN<b>+'+Math.round((m.diplomacyGain-1)*100)+'%</b></span><span>TRADE TERMS<b>+'+(m.tradeBonus*100).toFixed(1)+'%</b></span><span>INCIDENT REDUCTION<b>'+Math.round(m.incidentReduction*100)+'%</b></span><span>MILITARY READINESS<b>+'+Math.round((m.militaryReadiness-1)*100)+'%</b></span><span>DISEASE CONTAINMENT<b>-'+Math.round(m.healthContainment*100)+'%</b></span><span>ANNUAL LEGITIMACY<b>+'+m.legitimacyGain.toFixed(2)+'</b></span><span>CORRUPTION RESISTANCE<b>'+Math.round(m.corruptionResistance*100)+'%</b></span></div>';
 const audit=c.lastAudit?'<p class="command-note">Last audit · year '+c.lastAudit.year+' · '+c.lastAudit.paid+'/'+c.lastAudit.salaries+' gold salaries · '+c.lastAudit.corruption+' gold lost to corruption · '+c.lastAudit.vacancies+' vacancies · '+c.lastAudit.estateSavings+' gold estate savings.</p>':'<p class="command-note">No annual court audit has been completed yet.</p>';
 const history=c.history.length?'<div class="court-history">'+c.history.map(entry=>'<div><span>'+esc(String(entry.kind).toUpperCase())+' · YEAR '+entry.year+'</span><p>'+esc(entry.summary)+'</p></div>').join("")+'</div>':'<p class="command-note">No court record has been written yet.</p>';
 return '<div class="command-section-title">ROYAL COURT · '+m.officesFilled+' OF '+c.offices.length+' OFFICES FILLED</div><p class="command-note">Appoint named residents to six offices. Competence, loyalty and integrity come from their real traits, needs and relationship with the crown. Salaries and corruption settle once per year; every office changes a live system, not only a label.</p><div class="court-office-grid">'+offices+'</div>'+(courtCollapsed&&c.offices.length>visibleOffices.length?'<p class="command-note">Showing the first '+visibleOffices.length+' of '+c.offices.length+' crown offices on this screen. Salaries, vacancies and court effects still count every office.</p><button type="button" class="command-choice" data-court-show-all>SHOW ALL '+c.offices.length+' CROWN OFFICES</button>':'')+'<div class="command-section-title">THE ANNUAL PETITION</div>'+demand+advisorSection()+'<div class="command-section-title">COURT EFFECTS</div>'+effects+'<div class="command-section-title">LAST AUDIT</div>'+audit+'<div class="command-section-title">COURT RECORD</div>'+history;
}
function councilSection(){
 const c=getCouncilSnapshot();
 const docket=c.docket.map(entry=>{
  const supporters=entry.supporters.map(name=>esc(String(name).toUpperCase())).join(" · ");
  const opponents=entry.opponents.map(name=>esc(String(name).toUpperCase())).join(" · ");
  const action=entry.stage==="proposed"
   ?'<button type="button" data-command="council-lobby" data-value="'+esc(entry.id)+'"'+(entry.canLobby?'':' disabled')+'>PAY LOBBY · '+esc(costLabel(entry.cost))+'</button>'
   :'<button type="button" data-command="council-vote" data-value="'+esc(entry.id)+'"'+(entry.canVote?'':' disabled')+'>CALL VOTE</button>';
  return '<article class="command-policy" data-council-bill="'+esc(entry.id)+'"><div><span class="command-ribbon">'+esc(String(entry.stage).toUpperCase())+' · PROPOSED YEAR '+entry.proposedYear+'</span><strong>'+esc(entry.title)+'</strong><p>'+esc(entry.description)+'</p><small>SUPPORT '+entry.support+' / '+entry.threshold+' · AGAINST '+entry.opposition+' · FOR '+supporters+' / AGAINST '+opponents+'</small><p class="command-note">'+esc(entry.voteNote)+'</p></div><div class="noble-house__actions">'+action+'</div></article>';
 }).join("")||'<p class="command-note">No bill is on the docket. Propose one from the standing bills below; a realm may carry at most '+c.limits.docket+'.</p>';
 const bills=c.bills.filter(bill=>!bill.onDocket).map(bill=>'<button class="command-choice" data-command="council-propose" data-value="'+esc(bill.id)+'"'+(bill.proposable?'':' disabled')+'><strong>'+esc(bill.label)+'</strong><small>'+esc(bill.description)+' · '+esc(costLabel(bill.cost))+' · LOBBY COST · FOR '+bill.supporters.map(name=>esc(String(name).toUpperCase())).join(" · ")+' / AGAINST '+bill.opponents.map(name=>esc(String(name).toUpperCase())).join(" · ")+'</small></button>').join("");
 const history=c.history.slice(0,4).map(row=>'<div class="command-history"><strong>'+esc(String(row.stage).toUpperCase())+' · '+esc(row.title)+' · YEAR '+row.settledYear+'</strong><p>'+esc(row.summary)+'</p><small>SUPPORT '+row.support+' / '+row.threshold+' · MARGIN '+(row.margin>=0?'+':'')+row.margin+' · ROLL '+row.roll.toFixed(3)+'</small></div>').join("")||'<p class="command-note">No council session has settled a bill yet. A lobbied bill is voted in the next annual session.</p>';
 return '<div class="command-section-title">COUNCIL DOCKET · '+c.docket.length+' / '+c.limits.docket+' BILLS · '+c.seats+' SEATS</div>'+
  '<p class="command-note">A bill is proposed once a year. Its supporters and opponents come from the four political factions; paying the lobby raises support, and the next council session votes with a small deterministic swing. Enactment changes real legitimacy, faction standing, morale and the government record. '+number(c.totals.votes)+' vote(s) recorded.</p>'+
  '<div class="command-summary"><div><small>DOCKET</small><strong>'+c.docket.length+' / '+c.limits.docket+'</strong></div><div><small>ENACTED</small><strong>'+c.totals.enacted+'</strong></div><div><small>REJECTED</small><strong>'+c.totals.rejected+'</strong></div><div><small>LAST SESSION</small><strong>'+(c.lastVoteYear||"—")+'</strong></div></div>'+
  '<div class="command-section-title">PROPOSE A BILL</div><div class="command-choice-grid">'+bills+'</div>'+
  '<div class="command-section-title">ON THE DOCKET</div><div class="command-policy-list">'+docket+'</div>'+
  '<div class="command-section-title">COUNCIL RECORD · LAST '+Math.min(4,c.history.length)+'</div><div class="command-history-list">'+history+'</div>';
}
function government(){
 const g=getGovernmentSnapshot(),f=GOVERNMENT_FORMS[g.form],identity=getIdentitySnapshot(),forms=Object.entries(GOVERNMENT_FORMS).map(([id,x])=>'<button class="command-choice'+(id===g.form?' is-current':'')+'" data-command="government-form" data-value="'+id+'"><strong>'+esc(x.label)+'</strong><small>Tax baseline '+x.tax+'% · Research ×'+((1+Number(x.research||0)).toFixed(2))+' · Trade ×'+((1+Number(x.trade||0)).toFixed(2))+' · Cost 20 gold</small></button>').join("");
 const successionCards=Object.entries(SUCCESSION_LAWS).map(([id,law])=>'<button class="command-choice'+(id===g.succession?' is-current':'')+'" data-command="government-succession" data-value="'+id+'"'+(id===g.succession?' disabled':'')+'><strong>'+esc(law.label)+'</strong><small>'+esc(law.description)+' · cost 15 gold · one change per year</small></button>').join("");
 const taxButtons='<div class="command-choice-grid">'+[5,10,15,20,25,30].map(rate=>'<button class="command-choice'+(rate===g.taxRate?' is-current':'')+'" data-command="government-tax" data-value="'+rate+'"'+(rate===g.taxRate?' disabled':'')+'><strong>'+rate+'%</strong><small>Assessed on employed households · one change per year</small></button>').join('')+'</div>';
 const identitySection='<div class="command-section-title">REALM IDENTITY</div><div class="command-summary"><div><small>REALM</small><strong>'+esc(identity.kingdomName)+'</strong></div><div><small>ROYAL HOUSE</small><strong>'+esc(identity.dynastyName)+'</strong></div><div><small>RULER TITLE</small><strong>'+esc(identity.rulerTitle)+'</strong></div><div><small>HERALDRY</small><strong>'+esc(identity.emblem.toUpperCase())+' ON '+esc(identity.banner.toUpperCase())+'</strong></div></div><div class="command-note"><strong>'+esc(identity.cultureDetails.label.toUpperCase())+' CULTURE</strong> · '+esc(identity.cultureDetails.description)+' · tax '+(identity.cultureDetails.tax>=0?"+":"")+Math.round(identity.cultureDetails.tax*100)+'% · trade '+(identity.cultureDetails.trade>=0?"+":"")+Math.round(identity.cultureDetails.trade*100)+'% · research '+(identity.cultureDetails.research>=0?"+":"")+Math.round(identity.cultureDetails.research*100)+'% · food demand '+Math.round(-identity.cultureDetails.food*100)+'% · legitimacy '+(identity.cultureDetails.legitimacy>=0?"+":"")+Math.round(identity.cultureDetails.legitimacy*100)+'%.</div>';
 const charterSection='<div class="command-section-title">FOUNDING CHARTER</div><div class="command-summary"><div><small>RELIGION</small><strong>'+esc(identity.religionDetails.label)+'</strong></div><div><small>TRADITION</small><strong>'+esc(identity.traditionDetails.label)+'</strong></div><div><small>LAW</small><strong>'+esc(identity.lawDetails.label)+'</strong></div><div><small>LEGITIMACY</small><strong>'+esc(identity.legitimacyDetails.label)+'</strong></div></div><div class="command-summary"><div><small>STARTING CHARTER</small><strong>'+esc(identity.foundingDetails.label)+'</strong></div><div><small>TAX</small><strong>'+((identity.modifiers.tax>=0?"+":"")+Math.round(identity.modifiers.tax*100))+'%</strong></div><div><small>TRADE</small><strong>'+((identity.modifiers.trade>=0?"+":"")+Math.round(identity.modifiers.trade*100))+'%</strong></div><div><small>RESEARCH</small><strong>'+((identity.modifiers.research>=0?"+":"")+Math.round(identity.modifiers.research*100))+'%</strong></div></div><p class="command-note">'+esc(identity.religionDetails.description)+' · '+esc(identity.traditionDetails.description)+' · '+esc(identity.lawDetails.description)+' · '+esc(identity.legitimacyDetails.description)+'</p>'+(identity.background?'<p class="command-note"><strong>FOUNDING CHRONICLE</strong><br>'+esc(identity.background)+'</p>':'')+'<p class="command-note">The starting charter added '+esc(identity.foundingDetails.description)+'</p>';
 return intro("THE CROWN & ITS INSTITUTIONS","Government","Choose how authority is organized. Changing the constitution costs 20 gold and shifts faction support. The royal court below turns those factions into named offices and annual petitions.")+identitySection+charterSection+'<div class="command-summary"><div><small>IN FORCE</small><strong>'+esc(f.label)+'</strong></div><div><small>TAX BASELINE</small><strong>'+g.taxRate+'%</strong></div><div><small>COUNCIL SEATS</small><strong>'+g.councilSeats+'</strong></div><div><small>DECREE COUNT</small><strong>'+g.decrees+'</strong></div></div><div class="command-section-title">TAX RATE · CURRENT '+g.taxRate+'%</div><p class="command-note">The tax rate is charged against employed households at every 20-day settlement. Raising it lifts revenue but embitters the commons and guilds; lowering it buys goodwill and leaves less for wages. Last changed in year '+(g.lastTaxChangeYear||"—")+'.</p>'+taxButtons+'<div class="command-section-title">CONSTITUTIONAL MODELS</div><div class="command-choice-grid">'+forms+'</div><div class="command-section-title">SUCCESSION LAW · '+g.succession.toUpperCase()+'</div><p class="command-note">The law decides which claimant the next succession actually reads. Designated refuses every silent fallback; elective lets the adult residents and great houses choose; primogeniture prefers the eldest eligible child.</p><div class="command-choice-grid">'+successionCards+'</div>'+councilSection()+'<div class="command-note">The six offices and the council docket are live. Regional autonomy beyond this court remains a future module.</div>'+courtSection();
}
function realmCycleSection(){
 const c=getRealmCycleSnapshot();
 const phase=String(c.phase||"stable").toUpperCase();
 const narrative={
  prosperity:"The granary is full, the market is calm and households are confident. Low prices and a strong reserve are feeding the next season of growth.",
  stable:"The realm is holding. Reserves, prices and public confidence are close enough to balance that ordinary decisions still matter more than crisis.",
  strain:"Scarcity is reaching the market and household confidence is weakening. A petition is likely if the crown does not act.",
  crisis:"Scarcity, market pressure and unrest are reinforcing one another. Requisition can end the immediate petition, but it makes the next season harder."
 }[c.phase]||"The cycle is moving through the real stores, market and settlement.";
 const actions=(c.actions||[]).map(a=>'<article class="command-policy"><div><strong>'+esc(a.label)+'</strong><p>'+esc(a.detail)+'</p><small>'+esc(costLabel(a.cost||{})||"NO DIRECT COST")+'</small></div><button data-command="realm-cycle" data-value="'+esc(a.id)+'"'+(a.available?'':' disabled')+'>'+(a.available?'ANSWER PETITION':'NOT AVAILABLE')+'</button></article>').join("");
 const petition=c.petition?'<article class="command-policy"><div><span class="command-ribbon">'+esc(c.petition.faction.toUpperCase())+' PETITION · EXPIRES YEAR '+Math.floor((Number(c.petition.expiresTick)||0)/400+1)+'</span><strong>'+esc(c.petition.title)+'</strong><p>'+esc(c.petition.demand)+'</p></div></article><div class="command-policy-list">'+actions+'</div>':'<p class="command-note">No petition is waiting. When unrest crosses '+Math.round(0.42*100)+'%, the households or the guilds will bring a demand to the crown. Ignoring it raises unrest and lowers legitimacy.</p>';
 const recent=(c.history||[]).slice(-4).reverse().map(row=>'<div class="command-history"><strong>'+esc(String(row.phase||"stable").toUpperCase())+' · TICK '+number(row.tick)+'</strong><p>Scarcity '+Math.round(row.scarcity*100)+'% · market '+Math.round(row.marketPressure*100)+'% · unrest '+Math.round(row.unrest*100)+'% · prosperity '+Math.round(row.prosperity*100)+'%</p></div>').join("");
 const drivers=c.drivers||{};
 return '<div class="command-summary"><div><small>PHASE</small><strong>'+esc(phase)+'</strong></div><div><small>SCARCITY</small><strong>'+Math.round(c.scarcity*100)+'%</strong></div><div><small>MARKET PRESSURE</small><strong>'+Math.round(c.marketPressure*100)+'%</strong></div><div><small>UNREST</small><strong>'+Math.round(c.unrest*100)+'%</strong></div><div><small>PROSPERITY</small><strong>'+Math.round(c.prosperity*100)+'%</strong></div><div><small>PETITIONS ANSWERED</small><strong>'+number(c.resolvedPetitions)+' / '+number(c.totalPetitions)+'</strong></div></div>'+
  '<div class="command-meter-list">'+meter("SCARCITY",c.scarcity*100)+meter("MARKET PRESSURE",c.marketPressure*100)+meter("PUBLIC UNREST",c.unrest*100)+meter("PROSPERITY",c.prosperity*100)+'</div>'+
  '<p class="command-note"><strong>LIVING LOOP</strong> Granary reserve → grain price and market stock → household confidence → petition → concession or requisition → migration and demand → the next reserve. '+esc(narrative)+'</p>'+
  '<div class="command-note">Reserve '+amount(Number(drivers.foodReserve)||0)+' food · demand '+amount(Number(drivers.foodDemand)||0)+' per settlement · '+amount(Number(drivers.reserveYears)||0)+' years of cover · regional market stock '+amount(Number(drivers.regionalFoodStock)||0)+' / '+amount(Number(drivers.regionalFoodTarget)||0)+' · '+(c.displacement?'<strong>'+number(c.displacement)+' displacement(s) recorded.</strong>':'no displacement recorded yet.')+'</div>'+
  petition+
  '<div class="command-section-title">CYCLE RECORD · LAST '+Math.min(4,(c.history||[]).length)+' CHECKS</div><div class="command-history-list">'+(recent||'<p class="command-note">The first cycle check will appear after the next 20-day settlement.</p>')+'</div>'+
  (c.lastResolution?'<p class="command-note"><strong>LAST CROWN ANSWER</strong> '+esc(c.lastResolution)+'</p>':'');
}
function nobleRealmNote(){
 const n=getNobilitySnapshot(),hosts=getNobleHostSnapshot(),feuds=getNobleFeudSnapshot();
 const houses=n.houses.filter(h=>h.memberCount>0).sort((a,b)=>b.loyalty-a.loyalty||a.familyName.localeCompare(b.familyName)).slice(0,3).map(h=>esc(h.familyName)+" "+Math.round(h.loyalty)).join(" · ");
 return '<div class="command-note"><strong>NOBLE HOUSES · '+n.houseCount+'</strong> '+(houses?houses+" loyalty":'No living noble house is recorded yet.')+' · defence +'+Math.round((n.defenseBonus-1)*100)+'% · '+hosts.activeHosts+' land host'+(hosts.activeHosts===1?'':'s')+' ('+hosts.totalStrength+' men, '+hosts.upkeep.wages+'G/'+hosts.upkeep.supplies+'F upkeep) · '+feuds.active+' active feud'+(feuds.active===1?'':'s')+' ('+feuds.bloodFeuds+' blood, '+feuds.arbitration+' in arbitration) · '+n.duesThisYear+' gold dues in the last audit. Charters cost gold and timber; feuds and withheld charters erode loyalty and dues, while court office, loyalty and a paid host strengthen the house.</div>';
}
function nobilityPanel(){
 if(!state.hasStarted)return intro("THE NOBLE HOUSES","Awaiting their founding","Noble houses emerge from the named residents of a living realm.")+'<div class="command-note">Begin a campaign to record its families, estates, dues and levies.</div>';
 const n=getNobilitySnapshot(),hostSnapshot=getNobleHostSnapshot(),feuds=getNobleFeudSnapshot(),gold=Number(state.resources?.gold)||0,wood=Number(state.resources?.wood)||0,food=Number(state.resources?.food)||0;
 const hostByHouse=new Map(hostSnapshot.hosts.map(host=>[host.houseId,host]));
 const cards=n.houses.map(h=>{
  const cost=n.charterCost,canCharter=!h.charter&&Boolean(h.head)&&gold>=cost.gold&&wood>=cost.wood;
  const cooldown=h.lastLevyYear?Math.max(0,h.lastLevyYear+n.levyCooldownYears-state.year):0;
  const canLevy=Boolean(h.head)&&h.loyalty>=35&&cooldown===0&&h.feudSeverity<4;
  const people=h.memberNames.length?h.memberNames.slice(0,5).join(" · ")+(h.memberCount>5?" · +"+(h.memberCount-5):""):"No living members";
  const latest=h.history[0]?h.history[0].summary:"No house record yet.";
  const host=hostByHouse.get(h.id);
  const hostBlock=host
   ?'<div class="command-note"><strong>LAND HOST · '+esc(String(host.status).toUpperCase())+'</strong> '+host.strength+' retainers · readiness '+host.readiness+'/100 · equipment '+Math.round(host.equipment)+' · morale '+Math.round(host.morale)+' · '+host.wages+'G / '+host.supplies+'F per year'+(host.joinedWar?' · AT WAR':'')+(host.feudSeverity?' · FEUD '+host.feudSeverity+'/5':'')+'<br><small>COMMANDER '+esc(host.commanderName||"VACANT")+' · '+(host.status==="mustering"?'MUSTERING · NEXT ANNUAL AUDIT':host.status==="returning"?'RETURNING · NEXT ANNUAL AUDIT':host.status==="revolted"?'IN REVOLT':'QUARTERED')+'</small></div><div class="noble-house__actions"><button type="button" data-command="noble-host-order" data-order="march" data-value="'+esc(h.id)+'"'+((host.canMarch&&gold>=hostSnapshot.marchCost.gold&&food>=hostSnapshot.marchCost.food)?'':' disabled')+'>MARCH · '+hostSnapshot.marchCost.gold+'G / '+hostSnapshot.marchCost.food+'F</button><button type="button" data-command="noble-host-order" data-order="quarter" data-value="'+esc(h.id)+'"'+((['quartered','returning'].includes(host.status))?' disabled':'')+'>'+(host.status==='quartered'?'AT HOME':host.status==='returning'?'RETURNING':'RETURN HOME')+'</button><button type="button" data-command="noble-host-order" data-order="disband" data-value="'+esc(h.id)+'">DISBAND</button></div>'
   :'<div class="command-note"><strong>NO LAND HOST</strong> This house has not raised retainers. A host draws its size, equipment and upkeep from real adults, levy, wealth, power, offices and charter. Loyalty below '+hostSnapshot.loyaltyFloor+' or a severe feud blocks it.</div><div class="noble-house__actions"><button type="button" data-command="noble-host-order" data-order="raise" data-value="'+esc(h.id)+'"'+((h.head&&h.loyalty>=hostSnapshot.loyaltyFloor&&gold>=hostSnapshot.raiseCost.gold)?'':' disabled')+'>RAISE LAND HOST · '+hostSnapshot.raiseCost.gold+'G</button></div>';
  const stats=[["HEAD",h.head?.name||"VACANT"],["MEMBERS",h.memberCount],["WEALTH",Math.round(h.wealth)],["LEVY",h.levyActive],["COURT OFFICES",h.heldOffices],["DUES / YEAR",h.dues+"G"]];
  return '<article class="noble-house" data-noble-house="'+esc(h.id)+'"><header class="noble-house__head"><div><span class="command-ribbon">'+esc(String(h.status).toUpperCase())+(h.mustered?' · LEVY MUSTERED':'')+(h.feudSeverity?' · FEUD '+h.feudSeverity+'/5':'')+'</span><h4>HOUSE '+esc(h.familyName.toUpperCase())+'</h4><p>'+esc(h.seat)+' · founded year '+number(h.foundedYear)+'</p></div><div class="noble-house__power" aria-label="Power '+Math.round(h.power)+'"><strong>'+Math.round(h.power)+'</strong></div></header>'+
   meter("LOYALTY",h.loyalty)+'<p class="noble-house__stats" aria-label="'+stats.map(([label,value])=>label+' '+esc(String(value))).join(", ")+'">'+stats.map(([label,value])=>label+' '+esc(String(value))).join(" · ")+'</p>'+
   '<p class="noble-house__people" aria-label="Noble members: '+esc(people)+'">'+esc(people)+'</p><p class="command-note">'+esc(latest)+'</p>'+hostBlock+'<div class="noble-house__actions"><button type="button" data-command="noble-charter" data-value="'+esc(h.id)+'"'+(canCharter?'':' disabled')+'>'+(h.charter?'CHARTER GRANTED':'GRANT CHARTER · '+cost.gold+'G / '+cost.wood+' WOOD')+'</button><button type="button" data-command="noble-levy" data-value="'+esc(h.id)+'"'+(canLevy?'':' disabled')+'>'+(h.feudSeverity>=4?'FEUD BLOCKS THE LEVY':cooldown?'LEVY COOLDOWN · '+cooldown+'Y':'CALL THE LEVY · 2 YEARS')+'</button></div></article>';
 }).join("");
 const feudCards=feuds.feuds.length?feuds.feuds.map(f=>{
  const active=f.status==="active",names=f.houses.map(house=>house.familyName).join(" vs ");
  const stage=String(f.stage||"grievance"),stageLabel=feuds.stageLabels?.[stage]||stage;
  const arbitrationCost=Number(feuds.arbitrationCost)||16,compensation=feuds.settlementCosts?.compensation||{gold:24},charterTerms=feuds.settlementCosts?.charter||{gold:10,wood:8};
  const canArbitrate=active&&stage!=="arbitration"&&gold>=arbitrationCost;
  const canSettle=active&&stage==="arbitration"&&Number(f.severity)<=3;
  const canCompensate=canSettle&&gold>=(Number(compensation.gold)||0);
  const canCharter=canSettle&&gold>=(Number(charterTerms.gold)||0)&&wood>=(Number(charterTerms.wood)||0);
  const actions=active
   ?'<button type="button" data-command="noble-feud-mediate" data-value="'+esc(f.id)+'"'+(gold>=feuds.mediationCost?'':' disabled')+'>MEDIATE · '+feuds.mediationCost+'G</button>'+
     '<button type="button" data-command="noble-feud-arbitrate" data-value="'+esc(f.id)+'"'+(canArbitrate?'':' disabled')+'>'+(stage==="arbitration"?'IN ARBITRATION':'ARBITRATE · '+arbitrationCost+'G')+'</button>'+
     '<button type="button" data-command="noble-feud-settle" data-value="'+esc(f.id)+'" data-terms="compensation"'+(canCompensate?'':' disabled')+'>COMPENSATE · '+(Number(compensation.gold)||0)+'G</button>'+
     '<button type="button" data-command="noble-feud-settle" data-value="'+esc(f.id)+'" data-terms="charter"'+(canCharter?'':' disabled')+'>ESTATE CHARTERS · '+(Number(charterTerms.gold)||0)+'G / '+(Number(charterTerms.wood)||0)+' WOOD</button>'+
     '<button type="button" data-command="noble-feud-inflame" data-value="'+esc(f.id)+'"'+(gold>=feuds.inflameCost?'':' disabled')+'>INFLAME · '+feuds.inflameCost+'G</button>'+
     '<button type="button" data-command="noble-feud-ignore" data-value="'+esc(f.id)+'">IGNORE</button>'
   :'<small>Settled by '+(f.settlement?esc(String(f.settlement).toUpperCase().replace("-"," ")):'cooling')+' · the bounded court keeps the record.</small>';
  return '<article class="command-policy" data-noble-feud="'+esc(f.id)+'"><div><span class="command-ribbon">'+esc(String(f.status).toUpperCase())+' · '+esc(String(stageLabel).toUpperCase())+' · SEVERITY '+f.severity+'/5</span><strong>'+esc(names)+'</strong><p>'+esc(f.cause)+' · opened year '+number(f.startedYear)+(f.settledYear?' · settled year '+number(f.settledYear):'')+'</p><small>Dues penalty '+Math.round(f.penalty*100)+'% · host size reduced while the feud burns · loyalty '+f.houses.map(house=>house.loyalty).join(" / ")+
   (stage==="arbitration"?' · settle within '+feuds.arbitrationWindowYears+' audits or it becomes a blood feud':stage==="blood-feud"?' · no levy until the crown settles it':'')+'</small></div><div class="noble-house__actions">'+actions+'</div></article>';
 }).join(""):'<p class="command-note">No noble feud is burning. Competing claims, inheritance disputes, old insults and resource conflicts can open one; unresolved disputes escalate into blood feuds, while crown arbitration can settle them for good.</p>';
 const audit=n.lastAudit?'<p class="command-note">Last audit year '+n.lastAudit.year+' · '+n.lastAudit.houses+' living houses · '+n.lastAudit.dues+' gold dues · '+n.lastAudit.withheld+' withheld · defence multiplier '+n.lastAudit.defenseBonus.toFixed(2)+'.</p>':'';
 const hostAudit=hostSnapshot.lastAudit?'<p class="command-note">Last host audit year '+hostSnapshot.lastAudit.year+' · '+hostSnapshot.lastAudit.hosts+' hosts · '+hostSnapshot.lastAudit.strength+' effective strength · '+hostSnapshot.lastAudit.wages+'G / '+hostSnapshot.lastAudit.supplies+'F upkeep · '+hostSnapshot.lastAudit.joinedWar+' at war · '+hostSnapshot.lastAudit.revolts+' revolt(s).</p>':'';
 const contracts=n.contracts||{active:[],history:[],counters:{signed:0,fulfilled:0}};
 const contractCards=contracts.active.length?contracts.active.map(c=>'<article class="command-policy" data-feudal-contract="'+esc(c.id)+'"><div><span class="command-ribbon">'+esc(String(c.stage).toUpperCase())+' · '+esc(String(c.aim).toUpperCase())+'</span><strong>'+esc(c.houseName||"THE CROWN")+' · '+esc(c.theatre)+'</strong><p>Signed year '+number(c.signedYear)+' · supply '+c.supply+' · risk '+c.risk+'/100.</p><small>Noble contracts are settled by the annual campaign audit in Military.</small></div></article>').join(""):'<p class="command-note">No feudal contract is active. Open an aim in Military, then commit it to sign a covenant with a house.</p>';
 const history=n.history.length?n.history.slice(0,6).map(entry=>'<div class="command-history"><strong>YEAR '+entry.year+' · '+esc(String(entry.kind).toUpperCase())+'</strong><p>'+esc(entry.summary)+'</p></div>').join(""):'<p class="command-note">No noble audit has been recorded yet.</p>';
 return intro("THE NOBLE HOUSES","Estates, loyalty, hosts & feuds","Houses are drawn from the realm's real families. Their heads hold estates, pay annual dues, raise land hosts and can fall into feuds that change taxes, loyalty and who marches for the crown.")+
  '<div class="command-summary"><div><small>LIVING HOUSES</small><strong>'+n.houseCount+' / '+n.houses.length+'</strong></div><div><small>AVERAGE LOYALTY</small><strong>'+Math.round(n.averageLoyalty)+'/100</strong></div><div><small>FIELD LEVY</small><strong>'+n.totalLevy+'</strong></div><div><small>LAND HOSTS</small><strong>'+hostSnapshot.activeHosts+' · '+hostSnapshot.totalStrength+' MEN</strong></div><div><small>ACTIVE FEUDS</small><strong>'+feuds.active+'</strong></div><div><small>DEFENCE BONUS</small><strong>+'+Math.round((n.defenseBonus-1)*100)+'%</strong></div><div><small>DUES LAST AUDIT</small><strong>'+n.duesThisYear+'G</strong></div><div><small>TOTAL DUES</small><strong>'+number(n.duesCollected)+'G</strong></div></div>'+
  '<p class="command-note"><strong>LIVING LINK</strong> Annual dues reach the treasury; feuds cut dues and loyalty; loyalty determines whether a house raises, marches or revolts; called levies and land hosts raise real combat defence; host wages and supplies leave the same treasury. Houses with no living member become dormant instead of inventing a new family.</p>'+audit+hostAudit+
  '<div class="command-section-title">THE GREAT HOUSES</div><div class="noble-house-grid">'+(cards||'<p class="command-note">No named family has yet crossed the threshold into a noble house.</p>')+'</div>'+
  '<div class="command-section-title">FEUDS BETWEEN HOUSES · '+feuds.active+' ACTIVE / '+feuds.feuds.length+' REMEMBERED</div><div class="command-policy-list">'+feudCards+'</div>'+
  '<div class="command-section-title">FEUDAL CONTRACTS · '+contracts.counters.signed+' SIGNED / '+contracts.counters.fulfilled+' SETTLED</div><div class="command-policy-list">'+contractCards+'</div>'+
  '<div class="command-section-title">NOBLE CHRONICLE</div><div class="command-history-list">'+history+'</div>'+
  '<p class="command-note">Charters permanently raise wealth and loyalty at a cost of '+n.charterCost.gold+' gold and '+n.charterCost.wood+' wood. A called levy lasts through the following year, adds defence in combat and lowers the house’s loyalty by 7. Each house can muster again after '+n.levyCooldownYears+' years. Hosts cost '+hostSnapshot.raiseCost.gold+'G to raise and '+hostSnapshot.marchCost.gold+'G / '+hostSnapshot.marchCost.food+'F to march. All noble work is annual and bounded to four houses and '+feuds.feudLimit+' remembered feuds.</p>';
}

function politics(){
 const p=getPoliticalSnapshot(),court=getCourtSnapshot(),f=Object.entries(p.factions).map(([k,v])=>meter(k,v)).join(""),policies=Object.entries(GOVERNMENT_POLICIES).map(([id,x])=>'<article class="command-policy"><div><strong>'+esc(x.label)+'</strong><p>'+esc(x.description)+'</p></div><button data-command="policy" data-value="'+id+'">ENACT</button></article>').join("");
 const petition=court.demand?'<p class="command-note"><strong>COURT PETITION</strong><br>'+esc(court.demand.factionLabel)+' asks: '+esc(court.demand.title)+'. Grant or ignore it in Government → Royal Court.</p>':'';
 return intro("FACTIONS & PUBLIC ORDER","Politics","Legitimacy and faction support respond to decrees and the realm's material conditions. The living realm cycle below connects granary scarcity to market prices, household unrest and real petitions.")+'<div class="command-summary"><div><small>LEGITIMACY</small><strong>'+Math.round(p.legitimacy)+'/100</strong></div><div><small>AVERAGE SUPPORT</small><strong>'+Math.round(p.averageSupport)+'/100</strong></div><div><small>DECISIONS</small><strong>'+p.settlements+'</strong></div></div><div class="command-section-title">LIVING REALM CYCLE</div>'+realmCycleSection()+'<div class="command-section-title">FACTION SUPPORT</div><div class="command-meter-list">'+f+'</div>'+nobleRealmNote()+petition+'<div class="command-section-title">ROYAL DECREES · ONE PER YEAR</div><div class="command-policy-list">'+policies+'</div>';
}
function diplomacy(){
 const d=getDiplomacySnapshot(),c=d.costs,gold=Number(state.resources?.gold)||0,food=Number(state.resources?.food)||0,court=getCourtSnapshot(),g=d.guarantees,ta=d.tradeAgreements;
 const envoyOptions=court.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.name)+' · '+esc(p.species)+' · '+Math.round(p.fits.chancellor||0)+' fit</option>').join("");
 const envoyLazy=narrowViewport();
 if(envoyLazy)lazyOptionSets.set("envoy",envoyOptions);
 const envoySelectOptions=envoyLazy?"":envoyOptions;
 const envoySelectLazy=envoyLazy?' data-lazy-options="envoy"':'';
 const pendingCalls=d.realms.filter(r=>r.guaranteeCall);
  const missionsByRealm=new Map(d.missions.map(mission=>[mission.realmId,mission]));
  const missionCost=Number(d.missionLimits?.costGold)||6;
  const missionGoalLabel=goal=>goal==="trade"?"TRADE PACT":"ALLIANCE";
 const callBanner=pendingCalls.length?'<div class="diplomacy-guarantee-call"><strong>GUARANTEE CALLS · '+pendingCalls.length+'</strong><span>'+pendingCalls.map(r=>esc(r.name)+' is threatened by '+esc(r.guaranteeCall.attackerName)+' · answer by year '+r.guaranteeCall.deadlineYear).join(' · ')+'</span></div>':'';
 const rows=d.realms.map(r=>{
  const actions=[];
  const guarantee=r.guarantee;
  const guaranteeActive=Boolean(guarantee?.active);
  const agreement=r.tradeAgreement;
  const agreementActive=Boolean(agreement?.active);
  if(r.treaty==="war"){
   const whitePeace=Number(r.warExhaustion)>=35;
   actions.push('<button data-command="diplomacy-peace" data-value="'+esc(r.id)+'"'+((!whitePeace&&(gold<c.peaceGold||food<c.peaceFood))?" disabled":"")+'>'+(whitePeace?'SUE FOR WHITE PEACE':'SUE FOR PEACE · '+c.peaceGold+'G / '+c.peaceFood+'F')+'</button>');
  }else{
   actions.push('<button data-command="diplomacy-gift" data-value="'+esc(r.id)+'"'+(gold<c.gift?" disabled":"")+'>SEND GIFT · '+c.gift+'G</button>');
   if(r.treaty==="none"&&r.relation>=d.thresholds.tradePact)actions.push('<button data-command="diplomacy-pact" data-value="'+esc(r.id)+'"'+(gold<c.tradePact?" disabled":"")+'>TRADE PACT · '+c.tradePact+'G</button>');
   if(r.treaty==="trade"&&r.relation>=d.thresholds.alliance)actions.push('<button data-command="diplomacy-alliance" data-value="'+esc(r.id)+'"'+(gold<c.alliance?" disabled":"")+'>ALLIANCE · '+c.alliance+'G</button>');
    const activeMission=missionsByRealm.get(r.id);
    if(activeMission){
     if(activeMission.canNegotiate)actions.push('<button data-command="diplomacy-mission-negotiate" data-value="'+esc(activeMission.id)+'">NEGOTIATE · '+missionGoalLabel(activeMission.goalTreaty)+'</button>');
     else if(activeMission.canReport)actions.push('<button data-command="diplomacy-mission-report" data-value="'+esc(activeMission.id)+'">FILE REPORT</button>');
     else if(activeMission.canRatify)actions.push('<button data-command="diplomacy-mission-ratify" data-value="'+esc(activeMission.id)+'">RATIFY · '+missionGoalLabel(activeMission.goalTreaty)+'</button>');
     else actions.push('<button disabled>'+esc(activeMission.nextAction)+' · '+esc(activeMission.note)+'</button>');
    }else if(r.envoyId&&d.missions.length<d.missionLimits.active&&d.missionLastSendYear<Number(state.year)){
     const options=[];
     if(r.treaty==="none"&&r.relation>=Math.max(10,d.thresholds.tradePact-20))options.push('<option value="trade">TRADE PACT</option>');
     if(r.treaty==="trade"&&r.relation>=Math.max(10,d.thresholds.alliance-20))options.push('<option value="alliance">ALLIANCE</option>');
     if(options.length)actions.push('<select id="mission-goal-'+esc(r.id)+'" aria-label="Choose treaty goal for '+esc(r.name)+'">'+options.join("")+'</select><button data-command="diplomacy-mission-send" data-value="'+esc(r.id)+'"'+(gold<missionCost?" disabled":"")+'>SEND MISSION · '+missionCost+'G</button>');
    }
   if(!guaranteeActive&&!r.guaranteeCall){
    const canGuarantee=r.relation>=d.thresholds.guarantee;
    actions.push('<button data-command="diplomacy-guarantee" data-value="'+esc(r.id)+'"'+((gold<c.guarantee||!canGuarantee)?" disabled":"")+'>'+(canGuarantee?'GUARANTEE · '+c.guarantee+'G':'GUARANTEE · NEEDS '+d.thresholds.guarantee+' RELATION')+'</button>');
    if(r.marriageBond)actions.push('<button class="diplomacy-button--war" disabled>BOUND BY ROYAL MARRIAGE</button>');
    else actions.push('<button class="diplomacy-button--war" data-command="diplomacy-war" data-value="'+esc(r.id)+'">DECLARE WAR</button>');
   }
  }
  let hint="";
  if(r.treaty==="war")hint="Trade is closed. Border incidents become more likely while the war endures.";
  else if(agreementActive)hint="The trade agreement imports "+agreement.importPerYear+" "+agreement.importResource+" each year and buys up to "+agreement.exportCap+" surplus "+agreement.exportResource+" at "+agreement.exportUnitGold+"G. The annual fee is due every year; war or cancellation breaks it and costs trust.";
  else if(r.marriageBond)hint="A royal marriage binds this court to the crown: war is barred and the bond adds relation and trust every year.";
  else if(r.guarantee?.active&&r.guaranteeCall)hint="A guarantee call is pending. Honour it to shield this court, or refuse and break the crown’s guarantee.";
  else if(r.guarantee?.active)hint="The crown guarantees this court until year "+r.guarantee.expiresYear+". A call for aid can arrive while the guarantee stands; withdrawing it damages credibility.";
  else if(r.treaty==="alliance")hint="The alliance sends 3 gold and 4 food each year, rising with treaty standing. An envoy strengthens annual trust further.";
  else if(r.treaty==="trade")hint="The pact improves buy and sell terms, and grows better as the pact ages. Reach 70 relation to propose an alliance. An envoy improves annual relation.";
  else if(r.relation<d.thresholds.tradePact)hint="A trade pact requires 45 relation. Gifts and trade raise it. An envoy adds steady annual progress.";
  else hint="A trade pact is available. An alliance requires 70 relation. An envoy improves annual relation and trade terms.";
  const latest=Array.isArray(r.history)&&r.history[0];
  const standing=r.standing||{};
  const standingYearsText=standing.years>0?(standing.years+(standing.years===1?' YEAR':' YEARS')):'SIGNED THIS YEAR';
  const standingBlock=r.treaty!=="war"&&(standing.years>0||r.treaty!=="none")?'<p class="diplomacy-realm__hint diplomacy-realm__standing"><strong>TREATY STANDING · '+standingYearsText+' · '+esc(standing.tierLabel||"NEW")+'</strong> · '+esc(describeStanding(standing))+'</p>':'';
  const envoyBlock=r.envoyId?'<div class="diplomacy-envoy"><div><span>ENVOY · SKILL '+Math.round(r.envoySkill)+'</span><strong>'+esc(r.envoyName||"Unnamed envoy")+'</strong><small>Appointed year '+r.envoySinceYear+'</small></div><button data-command="diplomacy-recall" data-value="'+esc(r.id)+'">RECALL</button></div>':r.treaty==="war"?'<p class="command-note">War has closed the court; no envoy can be received.</p>':'<div class="command-inline"><select id="envoy-'+esc(r.id)+'" aria-label="Choose envoy for '+esc(r.name)+'"'+envoySelectLazy+'><option value="">Appoint an envoy…</option>'+envoySelectOptions+'</select><button data-command="diplomacy-envoy" data-value="'+esc(r.id)+'"'+((gold<c.envoy||!court.candidates.length)?" disabled":"")+'>APPOINT · '+c.envoy+'G</button></div>';
  const activeMission=missionsByRealm.get(r.id);
  const missionBlock=!activeMission?'':'<div class="diplomacy-mission" data-diplomacy-mission="'+esc(activeMission.id)+'"><div><span>ENVOY MISSION · '+esc(activeMission.stageLabel)+' · '+esc(missionGoalLabel(activeMission.goalTreaty))+'</span><strong>'+esc(r.name)+' · '+esc(activeMission.envoyName||"ENVOY")+' SKILL '+Math.round(activeMission.envoySkill)+'</strong><small>Sent year '+activeMission.sentYear+' · mandate through year '+activeMission.expiresYear+' · '+esc(activeMission.note)+(activeMission.score!==null?' · score '+activeMission.score+'/'+activeMission.difficulty+(activeMission.roll!==null?' · roll '+activeMission.roll.toFixed(3):''):'')+'</small></div><span class="diplomacy-mission__action">'+esc(activeMission.nextAction)+'</span></div>';
  const warLine=r.treaty==="war"?'<p class="diplomacy-realm__hint">WAR EXHAUSTION '+Math.round(r.warExhaustion)+'/100 · '+esc(r.warExhaustionLabel)+'</p>':'';
  const marriageBlock=r.marriageBond?'<p class="diplomacy-realm__hint"><strong>ROYAL MARRIAGE · '+esc(r.marriageBond.house)+'</strong> · '+esc(r.marriageBond.name)+' since year '+r.marriageBond.sinceYear+'. The crown cannot declare war on this court while the consort lives.</p>':'';
  const tradeAgreementBlock=!agreement?'':agreementActive?'<div class="diplomacy-trade-agreement" id="trade-agreement-'+esc(r.id)+'"><div><span>FOREIGN TRADE AGREEMENT · SINCE YEAR '+agreement.sinceYear+'</span><strong>IMPORT '+agreement.importPerYear+' '+esc(agreement.importResource.toUpperCase())+' / YEAR · EXPORT UP TO '+agreement.exportCap+' '+esc(agreement.exportResource.toUpperCase())+' @ '+agreement.exportUnitGold+'G</strong><small>Annual fee '+agreement.annualGold+'G · delivered '+number(agreement.imports)+' '+esc(agreement.importResource)+' · sold '+number(agreement.exports)+' '+esc(agreement.exportResource)+' for '+number(agreement.goldEarned)+'G · '+agreement.yearsServed+' annual settlement(s).'+(agreement.marriageDiscount?' A royal marriage secures reduced terms.':'')+'</small></div><button id="trade-cancel-'+esc(r.id)+'" class="diplomacy-button--war" data-command="diplomacy-cancel-agreement" data-value="'+esc(r.id)+'">CANCEL</button></div>':r.treaty==="war"?'':'<div class="diplomacy-trade-agreement diplomacy-trade-agreement--offer" id="trade-agreement-'+esc(r.id)+'"><div><span>TRADE AGREEMENT OFFER'+(agreement.marriageDiscount?' · MARRIAGE TERMS':'')+'</span><strong>IMPORT '+agreement.importPerYear+' '+esc(agreement.importResource.toUpperCase())+' / YEAR · EXPORT SURPLUS '+esc(agreement.exportResource.toUpperCase())+' @ '+agreement.exportUnitGold+'G</strong><small>Signing '+agreement.signingGold+'G · annual fee '+agreement.annualGold+'G · needs '+agreement.minRelation+' relation / '+agreement.minTrust+' trust · keeps '+agreement.exportKeep+' '+esc(agreement.exportResource)+' in reserve.</small></div><button id="trade-sign-'+esc(r.id)+'" data-command="diplomacy-trade-agreement" data-value="'+esc(r.id)+'"'+(agreement.canSign?'':' disabled')+'>'+(agreement.canSign?'SIGN · '+agreement.signingGold+'G':'SIGN · '+esc(String(agreement.signReason||'unavailable').replaceAll('-',' ').toUpperCase()))+'</button></div>';
  const guaranteeBlock=r.treaty!=="war"&&(guaranteeActive||r.guaranteeCall)?'<div class="diplomacy-guarantee'+(r.guaranteeCall?' diplomacy-guarantee--call':'')+'"><div><span>ROYAL GUARANTEE'+(r.guaranteeCall?' · CALL PENDING':' · UNTIL YEAR '+guarantee.expiresYear)+'</span><strong>'+(r.guaranteeCall?esc(r.guaranteeCall.attackerName)+' THREATENS THIS COURT':'THE CROWN SHIELDS THIS COURT')+'</strong><small>'+(r.guaranteeCall?'Honour the call with '+c.guaranteeAidGold+'G / '+c.guaranteeAidFood+'F or refuse and break the guarantee. Deadline year '+r.guaranteeCall.deadlineYear+'.':'Honoured '+guarantee.honored+' · refused '+guarantee.refused+' · '+guarantee.yearsLeft+' years remain.')+'</small></div>'+(r.guaranteeCall?'<div class="diplomacy-guarantee__actions"><button data-command="diplomacy-honor" data-value="'+esc(r.id)+'"'+((gold<c.guaranteeAidGold||food<c.guaranteeAidFood)?' disabled':'')+'>HONOR · '+c.guaranteeAidGold+'G / '+c.guaranteeAidFood+'F</button><button class="diplomacy-button--war" data-command="diplomacy-refuse" data-value="'+esc(r.id)+'">REFUSE · BREAK GUARANTEE</button></div>':'<button data-command="diplomacy-withdraw" data-value="'+esc(r.id)+'">WITHDRAW</button>')+'</div>':'';
  return '<article class="diplomacy-realm diplomacy-realm--'+esc(r.treatyTone)+'" data-diplomacy-realm="'+esc(r.id)+'">'+
   '<div class="diplomacy-realm__head"><div><span class="diplomacy-realm__region">'+esc(r.region)+' · '+esc(r.specialty)+'</span><h4>'+esc(r.name)+'</h4><p>'+esc(r.ruler)+' · '+esc(r.trait)+'</p></div><span class="diplomacy-treaty diplomacy-treaty--'+esc(r.treatyTone)+'">'+esc(r.treatyLabel)+(standing.years>0?' · '+standing.years+(standing.years===1?' YR':' YRS'):'')+'</span></div>'+
   meter("RELATION",r.relation)+
   '<div class="diplomacy-realm__stats"><span>TRUST<b>'+Math.round(r.trust)+'</b></span><span>FEAR<b>'+Math.round(r.fear)+'</b></span><span>GOODS TRADED<b>'+number(r.tradeVolume)+'</b></span></div>'+
   warLine+marriageBlock+tradeAgreementBlock+guaranteeBlock+standingBlock+envoyBlock+missionBlock+
   '<p class="diplomacy-realm__hint">'+esc(r.relationLabel+" · "+hint)+'</p>'+
   (latest?'<p class="diplomacy-realm__record">'+esc(latest.summary)+' · year '+latest.year+'</p>':'')+
   '<div class="diplomacy-actions">'+actions.join("")+'</div></article>';
 }).join("");
 return intro("THE NEIGHBOURING COURTS","Diplomacy","Relationships persist between years and connect trade, faction politics, war pressure and royal prestige. Guarantees now bind the crown to a neighbour: standing earns trust, a call demands an answer, and every refusal outlives the crisis.")+
  '<div class="command-summary"><div><small>NEIGHBOURS</small><strong>'+d.realms.length+'</strong></div><div><small>AVG RELATION</small><strong>'+Math.round(d.averageRelation)+'</strong></div><div><small>TRADE PACTS</small><strong>'+d.counts.trade+'</strong></div><div><small>ALLIANCES</small><strong>'+d.counts.alliance+'</strong></div><div><small>ENVOYS</small><strong>'+d.envoys+'</strong></div><div><small>ENVOY MISSIONS</small><strong>'+d.missions.length+' / '+d.missionLimits.active+'</strong></div><div><small>AT WAR</small><strong>'+d.counts.war+'</strong></div><div><small>GUARANTEES</small><strong>'+g.active+'</strong></div><div><small>TRADE ACCORDS</small><strong>'+ta.active+'</strong></div></div>'+
  '<div class="command-note"><strong>CROWN DREAD · '+d.dread.dread+'/100 '+esc(d.dread.band)+'</strong> · '+d.dread.soldiers+' soldiers at '+d.dread.power+' power · border levy ×'+(1+d.pressure.percent/100).toFixed(2)+' ('+d.pressure.wars+' war(s), '+d.pressure.hostile+' hostile court(s)). Fear drifts toward this reading once a year: a strong garrison deters border incidents and shortens wars, while fear above 60 erodes trust and worsens buy and sell terms.</div>'+
  '<div class="command-note"><strong>ENTENTE STANDING · '+(d.standing.longest?esc(String(d.standing.longest.name).toUpperCase())+' '+d.standing.longest.years+' '+ (d.standing.longest.years===1?'YEAR':'YEARS'):'NO TREATY HAS AGED YET')+'</strong> · '+d.standing.realms+(d.standing.realms===1?' court':' courts')+' with standing · average '+d.standing.averageYears+' years · '+d.standing.ententes+(d.standing.ententes===1?' entente':' ententes')+'. Every year a treaty or peace holds adds trust, improves buy and sell terms (up to 3%) and makes a border incident less likely (up to 4 points); a long alliance also raises its annual aid by up to 3 gold and 4 food. Declaring war resets that court’s clock to zero, so a long peace is an asset worth protecting. Standing caps at '+d.standing.yearLimit+' years.</div>'+
  '<div class="command-note"><strong>BIOME INFLUENCE</strong> · Relation '+((d.biomeInfluence.relationDrift>=0?'+':'')+d.biomeInfluence.relationDrift.toFixed(2))+' per year · guilds '+((d.biomeInfluence.guilds>=0?'+':'')+d.biomeInfluence.guilds.toFixed(2))+' · clergy '+((d.biomeInfluence.clergy>=0?'+':'')+d.biomeInfluence.clergy.toFixed(2))+' · rare-good trade '+((d.biomeInfluence.tradeValue>=0?'+':'')+d.biomeInfluence.tradeValue.toFixed(2))+'. '+esc(d.biomeInfluence.label)+'.</div>'+
  '<div class="command-note"><strong>GUARANTEE STANDING · '+g.credibility+'/100</strong> · '+g.active+' active · '+g.pending+' call(s) pending · '+g.honored+' honoured · '+g.refused+' refused. A guarantee lasts '+g.termYears+' years. An unanswered call is refused by the annual court, breaking the guarantee and lowering standing.</div>'+callBanner+
  '<div class="command-note"><strong>FOREIGN TRADE AGREEMENTS · '+ta.active+' ACTIVE</strong> · '+number(ta.imports)+' goods imported · '+number(ta.exports)+' exported · '+number(ta.goldPaid)+'G paid in fees and signing costs · '+number(ta.goldEarned)+'G earned. Each court makes one authored offer; a royal marriage lowers its signing cost, annual fee and thresholds. The annual court settles every agreement once, using the same partner stock and treasury as the market.</div>'+
  '<div class="command-note"><strong>ENVOY MISSIONS · '+d.missions.length+' / '+d.missionLimits.active+' ACTIVE</strong> · one mandate per court, one send per year, '+missionCost+'G to send, '+d.missionLimits.lifetimeYears+' years to finish. Send → Negotiate → Report → Ratify: negotiation rolls once on the dedicated diplomacy stream from envoy skill, Chancellor quality, foreign-desk insight, a targeted foreign agent and the realm’s relation and trust. An accepted trade pact or alliance changes the same treaty record as a direct agreement without paying its signing fee again; a refusal leaves a bounded political scar.</div>'+
  '<div class="command-section-title">'+d.realms.length+' NEIGHBOURING REALMS · LAST REVIEW YEAR '+d.lastUpdateYear+'</div><div class="diplomacy-grid">'+rows+'</div>'+
  '<p class="command-note">Gifts improve trust. Trade raises relation and improves prices through the market. Trade pacts deepen that advantage; alliances send annual aid. A royal guarantee costs '+c.guarantee+'G and binds the crown for '+g.termYears+' years: an attack on the protected court becomes a call that costs '+c.guaranteeAidGold+'G and '+c.guaranteeAidFood+'F to honour. Honouring raises standing and trust across the courts; refusing or ignoring the call breaks the guarantee, lowers legitimacy and makes every court warier. A standing guarantee also bars declaring war on its protected realm until it is withdrawn. Treaty standing is read from the year each pact, war or peace began: keep a treaty in force and it deepens; declare war and that court’s clock resets. Diplomacy resolves once per year, so its cost stays bounded to four realms.</p>';
}

function royalCrisisPanel(){
 const c=getRoyalCrisisSnapshot(),reg=c.regency,claims=c.pressingClaims||[],costs=c.costs;
 let html='<div class="command-section-title">DYNASTIC CRISIS · REGENCY, CLAIMS & CIVIL CONFLICT</div>';
 if(reg.active){
  html+='<div class="command-summary"><div><small>REGENCY</small><strong>ACTIVE</strong></div><div><small>MINOR SOVEREIGN</small><strong>'+esc(reg.minorKingName||"None")+'</strong></div><div><small>REGENT</small><strong>'+esc(reg.regentName||"VACANT")+'</strong></div><div><small>COUNCIL SUPPORT</small><strong>'+Math.round(reg.councilSupport)+'%</strong></div><div><small>MAJORITY</small><strong>YEAR '+number(reg.majorityYear)+'</strong></div></div>';
  html+='<p class="command-note">A minor sovereign rules through a regent. Council support, the regent’s qualities and every pressing claim determine whether the regency holds. At majority the regency ends automatically; a disputed claim can still become a civil war first.</p>';
  const options=(c.regentCandidates||[]).map(candidate=>'<option value="'+esc(candidate.personId)+'">'+esc(candidate.name)+' · '+number(candidate.ageYears)+' · '+esc(candidate.source)+'</option>').join("");
  if(options)html+='<div class="command-inline"><select id="royal-regent-select"><option value="">Choose another eligible regent…</option>'+options+'</select><button data-command="royal-appoint-regent">APPOINT REGENT · '+costLabel(costs.regent)+'</button></div>';
  else html+='<p class="command-note">No alternative regent is currently eligible. The sitting regent must retain the council or the regency will be contested.</p>';
 }else{
  html+='<div class="command-summary"><div><small>SOVEREIGN</small><strong>'+esc(c.kingName||"No sovereign")+'</strong></div><div><small>REGENCY</small><strong>NONE</strong></div><div><small>USURPATION RISK</small><strong>'+Math.round(c.usurpationRisk||0)+'%</strong></div></div>';
  if(c.canAbdicate)html+='<div class="command-actions"><button data-command="royal-abdicate">ABDICATE TO '+esc(c.abdicationCandidates[0]?.person?.name||c.abdicationCandidates[0]?.name||"THE HEIR")+' · −7 LEGITIMACY</button></div>';
  else html+='<p class="command-note">Abdication is available to an adult sovereign with a living lawful successor. A minor sovereign cannot abdicate their own regency.</p>';
 }
 if(claims.length){
  html+='<div class="command-section-title">PRESSING CLAIMS · '+claims.length+'</div><div class="command-policy-list">'+claims.map(claim=>'<article class="command-policy" data-royal-claim="'+esc(claim.id)+'"><div><strong>'+esc(claim.claimantName)+'</strong><p>'+esc(claim.source.replaceAll("-"," "))+(claim.houseName?' · House '+esc(claim.houseName):'')+' · claim '+Math.round(claim.claimStrength)+' · support '+Math.round(claim.support)+'</p></div><div class="command-actions"><button data-command="royal-settle-claim" data-value="'+esc(claim.id)+'">NEGOTIATE · '+costLabel(costs.settleClaim)+'</button><button data-command="royal-press-claim" data-value="'+esc(claim.id)+'">PRESS CLAIM · '+costLabel(costs.usurpation)+'</button><button data-command="royal-concede" data-value="'+esc(claim.id)+'">CONCEDE CROWN</button></div></article>').join("")+'</div><p class="command-note">Settling a claim buys time and charges the treasury. Pressing a claim or conceding the crown changes the sovereign and the realm’s legitimacy; pressing a weak claim can start or widen a civil war.</p>';
 }else if(reg.active){
  html+='<p class="command-note">No claimant currently presses the crown. The regency still depends on council support and the regent’s survival.</p>';
 }
 const conflict=c.civilConflict||{};
 if(conflict.active){
  const houses=(conflict.houses||[]).map(house=>house.name).join(", ")||"crown loyalists";
  html+='<div class="command-section-title">CIVIL CONFLICT · '+esc(String(conflict.phase||"tension").replaceAll("-"," ").toUpperCase())+'</div>'+
   '<div class="command-summary"><div><small>SEVERITY</small><strong>'+Math.round(conflict.severity||0)+'%</strong></div><div><small>BATTLES</small><strong>'+number(conflict.battles)+'</strong></div><div><small>CASUALTIES</small><strong>'+number(conflict.casualties)+'</strong></div><div><small>FACTIONS</small><strong>'+esc(houses)+'</strong></div></div>'+
   '<p class="command-note">Open conflict drains gold and food, lowers morale and legitimacy, and pushes involved noble houses toward revolt. A pressing claimant can seize the throne if the crown’s position collapses.</p>'+
   '<div class="command-actions"><button data-command="royal-suppress">CROWN CAMPAIGN · '+costLabel(costs.suppress)+'</button></div>';
 }else if(reg.active||claims.length){
  html+='<div class="command-note">No civil conflict is active. The claim ledger remains the warning system: high support and low legitimacy can turn tension into open war.</div>';
 }
 if(c.history?.length)html+='<div class="command-section-title">CRISIS RECORD</div><div class="command-policy-list">'+c.history.slice(0,4).map(entry=>'<article class="command-policy"><div><strong>'+esc(String(entry.kind||"crisis").replaceAll("-"," ").toUpperCase())+'</strong><p>'+esc(entry.detail)+'</p></div><small>YEAR '+number(entry.year)+'</small></article>').join("")+'</div>';
 return html;
}
function royalEducationPanel(){
 const s=getRoyalEducationSnapshot();
 const options=s.candidates.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · age '+p.age+'</option>').join("");
 const courses=s.curricula.map(course=>'<option value="'+esc(course.id)+'">'+esc(course.label)+' · '+course.years+' Y · '+esc(course.office)+'</option>').join("");
 const childRows=s.children.map(child=>'<article class="command-policy" data-education-child="'+esc(child.id)+'"><div><strong>'+esc(child.name)+'</strong><p>Age '+child.age+' · ready for tutelage</p></div><div class="command-inline"><select id="royal-curriculum-'+esc(child.id)+'" aria-label="Curriculum for '+esc(child.name)+'">'+courses+'</select><button type="button" data-command="royal-education-enroll" data-value="'+esc(child.id)+'">ENROL · '+costLabel(s.enrolledCost)+'</button></div></article>').join("");
 const studentRows=s.students.map(student=>{
  const actions=(student.canAudience?'<button type="button" data-command="royal-education-audience" data-value="'+esc(student.id)+'">HOLD AUDIENCE · '+costLabel(s.audienceCost)+'</button>':'')+(student.canDismiss?'<button type="button" data-command="royal-education-dismiss" data-value="'+esc(student.id)+'">END TUTELAGE</button>':'');
  return '<article class="command-policy" data-education-student="'+esc(student.id)+'"><div><strong>'+esc(student.name)+' · '+esc(student.courseLabel)+'</strong><p>'+esc(student.summary)+'</p><small>'+String(student.stage).toUpperCase()+' · '+student.yearsTaught+'/'+student.yearsRequired+' Y · '+student.progress+'%'+' · age '+student.age+' · '+esc(student.species)+(student.adult?' · of age':' · minor')+'</small></div>'+actions+'</article>';
 }).join("");
 const curriculumNotes=s.curricula.map(course=>{
  const effects=Object.entries(course.effects||{}).map(([key,value])=>'+'+(Number(value)||0)+' '+key).join(' · ');
  const endowment=costLabel(course.endowment)||'none';
  return '<p class="command-note"><strong>'+esc(course.label)+'</strong> · '+course.years+' years → '+esc(course.office)+'. '+esc(course.description)+' Effects: '+esc(effects)+' · office endowment: '+esc(endowment)+'.</p>';
 }).join("");
 const history=s.history.slice(0,4).map(entry=>'<article class="command-policy"><div><strong>'+esc(String(entry.kind).replaceAll("-"," ").toUpperCase())+'</strong><p>'+esc(entry.detail)+'</p></div><small>YEAR '+number(entry.year)+'</small></article>').join("");
 return '<div class="command-section-title">ROYAL EDUCATION · TUTOR & TUTELAGE</div>'+
  '<div class="command-summary"><div><small>TUTOR</small><strong>'+esc(s.tutorName||"None")+'</strong></div><div><small>ACTIVE STUDENTS</small><strong>'+s.active+' / '+s.limit+'</strong></div><div><small>READY AUDIENCES</small><strong>'+s.ready+'</strong></div><div><small>OFFICES GRANTED</small><strong>'+s.completed+'</strong></div></div>'+
  '<p class="command-note">Appoint one adult, non-kin Tutor, then enrol up to three royal children. Tutelage advances once each new year with no random roll; a course and the student’s maturity must both be complete before a coming-of-age audience. The audience pays '+costLabel(s.audienceCost)+', applies the advertised political effects, returns the office endowment to the stores and records a real memory on the student.</p>'+
  (s.tutorPresent?'<div class="command-note"><strong>'+esc(s.tutorName)+'</strong> has taught the royal household since year '+number(s.appointedYear||s.lastUpdateYear)+'.</div>':'<div class="command-inline" data-education-tutor="appoint"><select id="royal-tutor-select" aria-label="Royal Tutor candidate"><option value="">Choose an adult tutor…</option>'+options+'</select><button type="button" data-command="royal-education-tutor">APPOINT ROYAL TUTOR · '+costLabel({gold:s.tutorCost})+'</button></div>'+(options?'':'<p class="command-note">No eligible adult outside the sovereign’s close kin is available yet.</p>'))+
  '<div class="command-section-title">ROYAL CHILDREN · ASSIGN A CURRICULUM</div><div class="command-policy-list">'+(childRows||'<p class="command-note">Every living royal child is already in tutelage or has completed an audience.</p>')+'</div>'+
  '<div class="command-section-title">TUTELAGE & COMING-OF-AGE AUDIENCES</div><div class="command-policy-list">'+(studentRows||'<p class="command-note">No student is enrolled yet. Appoint a Tutor, then choose a child and a curriculum above.</p>')+'</div>'+
  '<div class="command-section-title">AUTHORED CURRICULA</div>'+curriculumNotes+
  (history?'<div class="command-section-title">EDUCATION RECORD</div><div class="command-policy-list">'+history+'</div>':'');
}
function decisions(){
 const h=getRoyalHouse(),foreign=getForeignMarriageSnapshot(),children=h.children.map(p=>'<article class="command-policy"><div><strong>'+esc(p.person.name)+'</strong><p>'+esc(p.person.role)+' · age '+Math.floor(p.person.ageYears)+' · born '+(p.person.bornAtYear||"?")+'</p></div><button data-command="heir" data-value="'+esc(p.personId)+'">'+(h.heir?.personId===p.personId?"CURRENT HEIR":"DESIGNATE")+'</button></article>').join("");
 const options=h.candidates.map(p=>'<option value="'+esc(p.personId)+'">'+esc(p.person.name)+' · '+Math.floor(p.person.ageYears)+' · '+esc(p.person.species)+'</option>').join("");
 const dowryText=dowry=>Object.entries(dowry||{}).map(([key,value])=>value+' '+key.toUpperCase()).join(' + ')||'none';
 const foreignCards=foreign.candidates.map(c=>'<article class="command-policy" data-foreign-match="'+esc(c.realmId)+'"><div><strong>'+esc(c.name)+'</strong><p>'+esc(c.house)+' · '+esc(c.realmName)+' · '+esc(c.speciesLabel)+' · age '+c.ageYears+'</p><small>RELATION '+c.relation+'/'+c.minRelation+' · TRUST '+c.trust+'/'+c.minTrust+' · DOWRY '+esc(dowryText(c.dowry))+(c.available?'':' · '+esc(String(c.reason||"unavailable").replaceAll("-"," ").toUpperCase()))+'</small></div><button data-command="foreign-marriage" data-value="'+esc(c.realmId)+'"'+(c.available?'':' disabled')+'>'+(c.available?'MARRY':'UNAVAILABLE')+'</button></article>').join("");
 const bondPanel=foreign.bond?'<div class="command-note"><strong>FOREIGN MARRIAGE · '+esc(foreign.bond.house)+'</strong> · '+esc(foreign.bond.name)+' of '+esc(foreign.bond.realmName)+' joined the royal house in year '+foreign.bond.sinceYear+'. The bond bars war with that court and adds +1.2 relation and +0.8 trust each year. Dowry received: '+esc(dowryText(foreign.bond.dowry))+'.</div>':h.consort?'<p class="command-note">A local consort already sits beside the sovereign; the foreign courts will not offer another match.</p>':'<div class="command-section-title">FOREIGN ROYAL MATCHES</div><div class="command-policy-list">'+(foreignCards||'<p class="command-note">No neighbouring court currently offers a match.</p>')+'</div><p class="command-note">A foreign marriage creates a real consort with a house, species, age and dowry. It raises relation and trust, pays the dowry into the royal stores, and binds the crown: war against that court is blocked while the consort lives. Each court requires both relation and trust.</p>';
 return intro("ROYAL HOUSE","Royal decisions","Dynastic actions are explicit and recorded in personal memories.")+'<img class="command-hero-art" src="assets/royal-court-art.svg" alt="Royal court, castle and heraldic banners" loading="lazy"><div class="command-summary"><div><small>SOVEREIGN</small><strong>'+esc(h.king?.person?.name||"No sovereign")+'</strong></div><div><small>CONSORT</small><strong>'+esc(h.consort?.person?.name||"None")+'</strong></div><div><small>HEIR</small><strong>'+esc(h.heir?.person?.name||"Undesignated")+'</strong></div>'+(foreign.bond?'<div><small>ORIGIN</small><strong>'+esc(foreign.bond.realmName)+'</strong></div>':'')+'</div>'+(h.consort?'':'<div class="command-section-title">ROYAL MARRIAGE</div><div class="command-inline"><select id="royal-consort-select"><option value="">Choose an adult resident…</option>'+options+'</select><button data-command="consort">FORM MARRIAGE</button></div>')+bondPanel+'<div class="command-actions"><button data-command="royal-birth" '+(!h.consort?'disabled':'')+'>WELCOME ROYAL CHILD · 20 FOOD / 15 GOLD</button></div><div class="command-section-title">LIVING ROYAL CHILDREN</div><div class="command-policy-list">'+(children||'<p class="command-note">No living royal children are recorded yet.</p>')+'</div>'+royalEducationPanel()+royalCrisisPanel()+'<p class="command-note">Succession uses the designated living heir; absent one, it falls back to a living child in the late sovereign’s explicit family record. No unrelated person is silently promoted. A minor heir is lawful and opens a regency.</p>';
}
function cards(){
 const hand=state.hand||[],selected=state.selectedCardInstanceId,full=hand.length>=5;
 const rows=hand.map(c=>'<article class="command-card'+(c.instanceId===selected?' is-selected':'')+'"><span class="command-card-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-card-atlas.svg#'+esc(cardSprite(c.group))+'"></use></svg></span><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.categoryName||c.group||"Card")+' · '+esc(c.rarity||"common")+'</small><p>'+esc(c.desc||"")+'</p></div><button data-command="select-card" data-value="'+esc(c.instanceId)+'">'+(c.instanceId===selected?'SELECTED':'SELECT')+'</button></article>').join("");
 return intro("ROYAL DECK","Card management","Draw a card only when you want one. Select it here, then drag it from the Selected Card panel onto the map, or tap a map tile on a touch device.")+'<div class="command-summary"><div><small>HAND</small><strong>'+hand.length+' / 5</strong></div><div><small>DRAW PILE</small><strong>'+number(state.availableCards?.length)+'</strong></div><div><small>REWARDS QUEUED</small><strong>'+number(state.cardRewardQueue?.length)+'</strong></div></div><div class="command-actions"><button type="button" data-command="draw-card"'+(full?' disabled':'')+'>DRAW RANDOM CARD</button></div><div class="command-card-list">'+(rows||'<p class="command-note">Your hand is empty. Draw a card when you want one.</p>')+'</div>';
}
function crownSupplyPanel(){
 const s=getCrownSupplySnapshot();
 const grain=GRAIN_CONTRACTS.filter(contract=>contract.level>0).map(contract=>'<button type="button" class="command-choice" data-command="crown-grain" data-value="'+contract.level+'"'+(s.grainLevel===contract.level?' disabled':'')+'>'+(contract.level===4?'WAR GRANARY · 2.5Y RATIONS':'GRAIN '+contract.level+' · '+contract.target+' RESERVE')+'</button>').join("");
 const water=WATERWORKS_LEVELS.filter(works=>works.level>0).map(works=>'<button type="button" class="command-choice" data-command="crown-water" data-value="'+works.level+'"'+(s.waterworksLevel===works.level?' disabled':'')+'>WATER '+works.level+' · +'+Math.round(works.coverage*100)+'%</button>').join("");
 const commissary=s.commissary||{wood:0,stone:0,shortfall:0,keep:{wood:600,stone:600},foodGoods:{grain:0,flour:0,bread:0}};
 const storedFood=Object.values(commissary.foodGoods||{}).reduce((sum,qty)=>sum+Number(qty||0),0);
 const canProvision=s.grainLevel>0&&commissary.shortfall>0&&(commissary.wood>=25||commissary.stone>=25||storedFood>0);
 return '<div class="command-section-title">CROWN SUPPLY · GRAIN, WATER & SHELTER</div>'+
 '<div class="command-summary"><div><small>GRAIN CONTRACT</small><strong>'+(s.grainLevel?('LEVEL '+s.grainLevel):'NONE')+'</strong></div><div><small>FOOD TARGET</small><strong>'+number(s.grainTarget)+'</strong></div><div><small>ANNUAL DEMAND</small><strong>'+number(Math.round(s.annualDemand))+'</strong></div><div><small>RESERVE COVERAGE</small><strong>'+s.reserveYears.toFixed(1)+' Y</strong></div><div><small>WATERWORKS</small><strong>'+(s.waterworksLevel?('LEVEL '+s.waterworksLevel):'NONE')+'</strong></div><div><small>COVERAGE</small><strong>'+Math.round(s.waterworksCoverage*100)+'%</strong></div><div><small>TIMBER COTTAGES</small><strong>'+number(s.timberCottages)+'</strong></div><div><small>STONE HOUSES</small><strong>'+number(s.stoneHouses)+'</strong></div></div>'+
 '<div class="command-note">Grain contracts buy from open, non-war partners at a fixed crown rate and deliver in four seasonal shipments. The war granary targets 2.5 years of the realm real annual demand (residents + garrison). Surplus timber and stone above the construction reserve can be sold through the market or bartered directly for grain when the coin route is exhausted. Waterworks pay an annual crew and cover occupied homes beyond the wells; if the payroll fails, coverage stops.</div>'+
 '<div class="command-actions">'+grain+(s.grainLevel?'<button type="button" class="command-choice" data-command="crown-grain" data-value="0">END GRAIN CONTRACT</button>':'')+'</div>'+
 '<div class="command-note">'+esc(s.grainRouteOpen?('Open grain routes: '+s.grainPartners+' partner'+(s.grainPartners===1?'':'s')+'. Target '+s.grainTarget+' food · '+commissary.shortfall+' short. Commissary surplus: '+commissary.wood+' wood · '+commissary.stone+' stone above the '+commissary.keep.wood+'/'+commissary.keep.stone+' reserve. Real stores: '+number(commissary.foodGoods?.grain||0)+' grain · '+number(commissary.foodGoods?.flour||0)+' flour · '+number(commissary.foodGoods?.bread||0)+' bread, called in before any material is spent.'):'No open grain route: end the war or restore a trade partner before signing a contract.')+'</div>'+
 '<div class="command-actions">'+water+(s.waterworksLevel?'<button type="button" class="command-choice" data-command="crown-water" data-value="0">CLOSE WATERWORKS</button>':'')+'</div>'+
 '<div class="command-actions"><button type="button" class="command-choice" data-command="crown-provision"'+(canProvision?'':' disabled')+'>PROVISION THE GRANARY · CALL IN STORED FOOD / BARTER GOODS</button></div>'+
 '<div class="command-actions"><button type="button" class="command-choice" data-command="crown-housing"'+(s.timberCottages<1||Number(s.housingCost)>Number(state.resources.gold||0)?' disabled':'')+'>RAISE A STONE HOUSE · '+number(s.housingCost)+' GOLD</button></div>'+
 '<p class="command-note">Crown supply settles grain every season and the waterworks payroll once a year. The grain rate is paid in gold; the waterworks payroll is separate from the wells and the garrison. Housing upgrades are permanent and do not create a new building.</p>';
}
function economy(){
 const w=getWorkforceSnapshot(),h=getHousingSnapshot(),homes=getHouseholdSnapshot().homes||[];
 const resources=Object.entries(state.resources||{}).map(([k,v])=>'<div class="command-resource"><span>'+esc(k)+'</span><strong>'+amount(v)+'</strong></div>').join("");
 const flow=Object.entries(state.incomeThisTick||{}).map(([k,v])=>'<div class="command-resource"><span>'+esc(k)+' · this tick</span><strong class="'+(Number(v)>0?'is-positive':Number(v)<0?'is-negative':'')+'">'+(Number(v)>0?'+':'')+amount(v)+'</strong></div>').join("");
 const ledger=state.economy?.lastLedger;
 const history=Array.isArray(state.economy?.history)?state.economy.history:[];
 const cycle=getEconomyCycleSnapshot();
 const ledgerRows=ledger?[
  ["Food demand",ledger.foodDemand,"food"],["Food consumed",ledger.foodConsumed,"food"],["Food shortage",ledger.foodShortage,"food"],["Food balance",ledger.foodBalance,"food"],["Food spoiled",ledger.foodSpoiled,"food"],
  ["Taxes collected",ledger.taxesCollected,"gold"],["Wages paid",ledger.wagesPaid,"gold"],["Building & road upkeep",ledger.upkeepPaid,"gold"],
  ["Furniture upkeep",ledger.furnitureUpkeepPaid,"gold"],
  ["Unpaid wages",ledger.unpaidWages,"gold"],["Unpaid upkeep",ledger.unpaidUpkeep,"gold"],["Unpaid furniture",ledger.unpaidFurniture,"gold"],["Debt after settlement",ledger.debt,"gold"],["Debt interest",ledger.debtInterest,"gold"],["Net treasury change",ledger.netGold,"gold"]
 ].map(([label,value,unit])=>'<div class="ledger-row"><span>'+esc(label)+'</span><strong>'+amount(value)+' '+unit+'</strong></div>').join(""):'<p class="command-note">No completed financial ledger yet. The simulation settles a ledger every 20 in-game days.</p>';
 const totals=state.economy||{};
 return intro("TREASURY & PRODUCTION","Realm economy","Live resource stocks, current-tick flows and the latest completed 20-day financial ledger. No forecasts are inferred.")+
 '<div class="command-summary"><div><small>POPULATION</small><strong>'+h.population+'</strong></div><div><small>HOUSING</small><strong>'+h.capacity+'</strong></div><div><small>FREE BEDS</small><strong>'+h.available+'</strong></div><div><small>EMPLOYED</small><strong>'+number(w.employed)+'</strong></div></div>'+
 '<div class="command-summary"><div><small>FOOD BALANCE / LEDGER</small><strong>'+(cycle.balance>=0?'+':'')+amount(cycle.balance)+'</strong></div><div><small>STORAGE CAPACITY</small><strong>'+number(cycle.storageCapacity)+'</strong></div><div><small>CROWN DEBT</small><strong>'+amount(cycle.debt)+' G</strong></div><div><small>FOOD CRISIS</small><strong>'+Math.round(cycle.crisis.severity*100)+'%</strong></div></div>'+
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
 const allRecords=state.entities.filter(entity=>!entity.dead&&entity.isBuilding()).slice().sort((a,b)=>{
  const an=CARD_DECK.find(card=>card.type===a.type)?.name||BUILDING_LABELS[a.type]||String(a.type),bn=CARD_DECK.find(card=>card.type===b.type)?.name||BUILDING_LABELS[b.type]||String(b.type);
  return an.localeCompare(bn)||String(a.id).localeCompare(String(b.id));
 });
 const records=narrowViewport()&&!buildingShowAll?allRecords.slice(0,8):allRecords;
 const counts=new Map();
 for(const building of allRecords)counts.set(building.type,(counts.get(building.type)||0)+1);
 const typeSummary=[...counts.entries()].map(([type,count])=>{
  const card=CARD_DECK.find(item=>item.type===type);
  return '<span class="building-type-chip">'+esc(card?.name||BUILDING_LABELS[type]||("Building "+type))+' <strong>'+count+'</strong></span>';
 }).join("");
 const repairCostText=cost=>Object.entries(cost||{}).filter(([,value])=>Number(value)>0).map(([resource,value])=>amount(value)+" "+resource).join(" · ")||"no materials";
 const bulkRepair=getBulkRepairSnapshot();
 const bulkRepairMarkup=bulkRepair.count?('<div class="command-section-title">STRUCTURE DAMAGE · '+number(bulkRepair.count)+' NEED REPAIR</div>'+
  '<p class="command-note">These finished structures are missing '+number(bulkRepair.missingHp)+' HP in total. The bill below is the exact sum of their individual repairs; the order spends nothing at all when stores are short.</p>'+
  '<div class="command-summary"><div><small>DAMAGED STRUCTURES</small><strong>'+number(bulkRepair.count)+'</strong></div><div><small>MISSING HP</small><strong>'+number(bulkRepair.missingHp)+'</strong></div><div><small>MATERIAL BILL</small><strong>'+esc(repairCostText(bulkRepair.cost))+'</strong></div></div>'+
  '<button type="button" class="command-choice" data-command="repair-all"'+(bulkRepair.ok?'':' disabled title="'+esc(bulkRepair.reason.replaceAll("-"," "))+'"')+'>REPAIR ALL DAMAGED STRUCTURES</button>'):"";
 const buildingSprite=(type)=>({
  [TYPE.KEEP]:"keep",[TYPE.HOUSE]:"cottage",[TYPE.FARM]:"farm",[TYPE.LUMBER]:"lumber-yard",
  [TYPE.QUARRY]:"quarry",[TYPE.TOWER]:"watchtower",[TYPE.WALL]:"wall",[TYPE.TAVERN]:"tavern",
  [TYPE.TEMPLE]:"temple",[TYPE.BARRACKS]:"barracks",[TYPE.MILL]:"windmill",[TYPE.STABLE]:"stable",
  [TYPE.WONDER]:"wonder",[TYPE.GOLDMINE]:"goldmine",[TYPE.BARREL]:"storehouse",
  [TYPE.TENT]:"cottage",[TYPE.STONE_HOUSE]:"cottage",[TYPE.WAREHOUSE]:"storehouse",[TYPE.SAWMILL]:"lumber-yard",
  [TYPE.BAKERY]:"windmill",[TYPE.WELL]:"windmill",[TYPE.MASON]:"quarry",[TYPE.FORESTER]:"lumber-yard",
  [TYPE.CLINIC]:"temple",[TYPE.MARKET]:"tavern",
  [TYPE.SMITHY]:"windmill",[TYPE.SCRIPTORIUM]:"temple",[TYPE.FOREST_WORKS]:"lumber-yard",
  [TYPE.SHIPYARD]:"lumber-yard",[TYPE.PAPER_MILL]:"windmill"
 }[type]||"cottage");
 const rows=records.map((building,index)=>{
  const card=CARD_DECK.find(item=>item.type===building.type);
  const name=card?.name||BUILDING_LABELS[building.type]||("Building "+building.type);
  const footprint=BUILDING_SIZE[building.type]||{w:1,h:1};
  const scale=Math.max(.25,Math.min(6,Number(building.footprintScale)||1));
  const width=footprint.w*scale,height=footprint.h*scale;
  const hp=Number(building.hp)||0,maxHp=Math.max(1,Number(building.maxHp)||hp||1),condition=Math.max(0,Math.min(100,Math.round(hp/maxHp*100)));
  const repair=getBuildingRepairSnapshot(building);
  const repairButton=repair.entity&&(repair.ok||repair.reason==="short-resources")?'<button type="button" class="command-choice" data-command="repair-building" data-value="'+esc(building.id)+'"'+(repair.ok?'':' disabled title="'+esc(repair.reason.replaceAll("-"," "))+'"')+'>'+(repair.ok?'REPAIR · ':'STORES SHORT · ')+esc(repairCostText(repair.cost))+'</button>':'';
  const site=constructionSnapshot(building);
  if(narrowViewport()&&String(building.id)!==String(expandedBuildingId)){
   return '<details class="building-record" data-building-name="'+esc(name.toLowerCase())+'" data-building-id="'+esc(building.id)+'"><summary><span class="building-record-art" aria-hidden="true">◆</span><span class="building-record-title"><strong>'+esc(name)+'</strong><small>'+esc(building.id||("record-"+index))+' · '+Math.round(building.x)+', '+Math.round(building.y)+'</small></span><span class="building-record-status"><b>'+(isUnderConstruction(building)?site.percent+'%':condition+'%')+'</b><small>'+(isUnderConstruction(building)?"built":"condition")+'</small></span></summary><div class="building-record-details" data-building-details></div></details>';
  }
  const capacity=BUILDING_WORKFORCE[building.type]||0,staff=workforce.workersByBuilding.get(building)||0;
  const efficiency=capacity?Math.round(getBuildingEfficiency(building,workforce)*100):null;
  const costs=Object.entries(card?.cost||BUILDING_COSTS[building.type]||{}).filter(([,value])=>Number(value)>0).map(([resource,value])=>amount(value)+" "+resource).join(" · ")||"No catalogued material cost";
  let siteNote="No dedicated resource-site indicator is defined for this building type.";
  try{
   const node=getResourceNodeAt(building.x,building.y);
   if([TYPE.LUMBER,TYPE.FORESTER,TYPE.FOREST_WORKS].includes(building.type))siteNote=(node.forestRegionalLabel?"Forest type: "+esc(node.forestRegionalLabel)+" — "+esc(node.forestRegionalProfile||"")+(node.forestRegionalTransitionLabel?" · Transition to "+esc(node.forestRegionalTransitionLabel)+" "+Math.round((node.forestRegionalTransitionShare||0)*100)+"%":"")+(node.forestRegionalSignature?" · Signature "+esc(node.forestRegionalSignatureLabel||String(node.forestRegionalSignature).replace(/-/g," "))+" ("+["Spring","Summer","Autumn","Winter"][Math.max(0,Math.min(3,Number(node.forestRegionalBountySeason)||0))]+" bounty)":"")+" · Timber yield "+Math.round((node.forestRegionalEffects?.timber||1)*100)+"% · Regrowth "+Math.round((node.forestRegionalEffects?.regrowth||1)*100)+"% · Fire "+(Number(node.forestRegionalEffects?.fire||0)>=0?"+":"")+Math.round((node.forestRegionalEffects?.fire||0)*100)+"% · Wildlife "+Math.round((node.forestRegionalEffects?.fauna||1)*100)+"% · Forage "+Math.round((node.forestRegionalEffects?.forage||1)*100)+"% · Work "+Math.round((node.forestRegionalEffects?.work||1)*100)+"% · Flood "+Math.round((node.forestRegionalEffects?.flood||0)*100)+"% · " : "")+"Forest stock at site tile: "+number(node.forestStock)+" / "+number(node.forestCapacity)+(node.forestTypeLabel?" · "+node.forestTypeLabel+" · "+(node.forestAge||"age unknown")+" · "+(node.forestSpecies||[]).slice(0,4).join(", ")+" · Snow depth: "+number(node.forestSnowDepthCm)+" cm · Exposure: "+Math.round((node.forestExposure||0)*100)+"% · Fire risk: "+Math.round((node.forestFireRisk||0)*100)+"% · Pest risk: "+Math.round((node.forestPestRisk||0)*100)+"% · Monoculture: "+Math.round((node.forestMonoculture||0)*100)+"% · Work: "+Math.round((node.forestWorkFactor||0)*100)+"% · Visibility: "+Math.round((node.forestVisibility||0)*100)+"% · Sight: "+number(node.forestSightRadius)+" tiles · Diversity: "+Math.round((node.forestSpeciesDiversity||0)*100)+"%"+(node.forestMixed?" · Mix: "+esc(node.forestMixture?.label||"mixed")+" · Pattern: "+esc(node.forestMixture?.pattern||"even")+" · Layers: "+esc((node.forestMixture?.canopyLayers||[]).map(layer=>layer.label).join(", ")||"single")+" · Broadleaf/conifer: "+Math.round((node.forestMixture?.broadleafShare||0)*100)+"/"+Math.round((node.forestMixture?.coniferShare||0)*100)+" · Understorey: "+esc(node.forestMixture?.understoryType||"woodland floor")+" · Silviculture: "+esc((node.forestMixture?.silviculture||[]).slice(0,4).join(", ")||"none"):"")+(node.forestDynamics?" · Mix class: "+esc(node.forestMixtureClass||"unknown")+" · Phase: "+esc(node.forestPhase||"unknown")+" · Pioneer/climax: "+Math.round((node.forestPioneerShare||0)*100)+"%/"+Math.round((node.forestClimaxShare||0)*100)+"% · Seed bank: "+Math.round((node.forestSeedBank||0)*100)+"% · Mother trees: "+Math.round((node.forestMotherTrees||0)*100)+"% · Genetic diversity: "+Math.round((node.forestGeneticDiversity||0)*100)+"% · Site fit: "+Math.round((node.forestSiteFitness||0)*100)+"% · Disease resistance: "+Math.round((node.forestDiseaseResistance||0)*100)+"% · Regime: "+esc(node.forestRegime||"mixed")+" (fire "+Math.round((node.forestRegimeFire||0)*100)+"% / wind "+Math.round((node.forestRegimeWind||0)*100)+"%) · System: "+esc(node.forestSilviculturalSystem||"high-forest")+" · Regeneration: "+Math.round((node.forestRegenerationFactor||1)*100)+"% · Roots: "+Math.round((node.forestRootDepth||0)*100)+"% · Humus: "+esc(node.forestHumusForm||"unknown")+" · Water uptake: "+Math.round((node.forestWaterUptake||0)*100)+"% · Decomposition: "+Math.round((node.forestDecomposition||0)*100)+"% · Mycorrhiza: "+Math.round((node.forestMycorrhiza||0)*100)+"% · Lianas/epiphytes: "+Math.round((node.forestLianaCover||0)*100)+"%/"+Math.round((node.forestEpiphyteCover||0)*100)+"% · Herb layer: "+Math.round((node.forestHerbLayer||0)*100)+"%":"")+" · Medicine: "+Math.round((node.forestMedicinalHerbs||0)*100)+"% · Gap age: "+Math.round((node.forestGapAge||0))+"d · Light woodland: "+(node.forestLightWoodland?"yes":"no")+" · Wind exposure: "+Math.round((node.forestWindExposure||0)*100)+"% · Deadwood: "+Math.round((node.forestDeadwood||0)*100)+"%"+(node.forestTreeline?" · Treeline":"")+" · Browse: "+Math.round((node.forestBrowsingPressure||0)*100)+"% · Predators: "+Math.round((node.forestPredatorPressure||0)*100)+"%":"")+(node.forestSuccession?(node.forestSuccession.label?" · Succession: "+esc(node.forestSuccession.label)+" · "+number(node.forestSuccession.age)+" days":" · Recovered woodland")+(node.forestSuccession?.contained?" · Control party until day "+number(node.forestSuccession.containedUntil):""):"")+" · Stewardship: "+(node.forestDrained?"drained wetland":"natural water table")+(node.forestFirebreak?" · firebreak until day "+number(node.forestFirebreakUntil):" · no firebreak")+(node.forestRestoredDay?" · last planted/restored day "+number(node.forestRestoredDay):"")+" · Wildlife: "+(forestFaunaSummaryAt(building.x,building.y,node.forestFauna)||"none recorded at this tile")+" · Forest products: "+(forestGatheringSummary()||"none gathered yet")+forestDynamicsDetail(node.forestDynamics)+(node.forestJungle?" · JUNGLE INTERIOR: "+esc(node.forestJungle.summary)+" · Path: "+esc(node.forestJungle.landscape?.type||"closed")+" · Layers: "+esc((node.forestJungle.layers||[]).map(layer=>layer.label+" "+layer.heightMeters+"m").join(", "))+" · Ambush "+Math.round((node.forestJungle.navigation?.ambushChance||0)*100)+"% · Cover "+Math.round((node.forestJungle.navigation?.defenceBonus||0)*100)+"% · Supply "+Math.round((node.forestJungle.navigation?.supplyFactor||1)*100)+"% · Guerrilla "+Math.round((node.forestJungle.navigation?.guerrillaBonus||0)*100)+"% · Local "+Math.round((node.forestJungle.navigation?.localAdvantage||0)*100)+"% · Disease "+Math.round((node.forestJungle.navigation?.disease||0)*100)+"% · Parasites "+Math.round((node.forestJungle.navigation?.parasites||0)*100)+"% · Hidden resources: "+esc(Object.values(node.forestJungle.resources||{}).flat().map(entry=>entry.id).filter((id,index,list)=>list.indexOf(id)===index).slice(0,8).join(", ")||"none")+(node.forestJungle.landscape?.hiddenGlade?" · HIDDEN GLADE":node.forestJungle.landscape?.waterfall?" · HIDDEN WATERFALL":node.forestJungle.landscape?.ravine?" · RAVINE":"")+"":"");
   else if([TYPE.QUARRY,TYPE.MASON].includes(building.type))siteNote="Stone stock at site tile: "+number(node.stoneStock)+" / "+number(node.stoneCapacity);
   else if(building.type===TYPE.FARM){const effective=Number(building.field?.maxFertility);siteNote="Site fertility: "+number(node.fertility)+" / 100"+(Number.isFinite(effective)&&effective>0?" · effective soil: "+number(effective)+" / 100":"")+" · water access: "+(node.waterAccess?"yes":"no")+(grasslandSiteSummaryAt(building.x,building.y)?" · meadow: "+esc(grasslandSiteSummaryAt(building.x,building.y)):"");}
   else if(building.type===TYPE.WELL)siteNote="Water access at site tile: "+(node.waterAccess?"yes":"no");
   else if(building.type===TYPE.STABLE)siteNote="Feed reserve: "+esc(pannageSummary(building))+" · feed comes from mast, hay and meadow grass gathered in the stores."+(grasslandSiteSummaryAt(building.x,building.y)?" · pasture: "+esc(grasslandSiteSummaryAt(building.x,building.y)):"");
   if([TYPE.LUMBER,TYPE.FORESTER,TYPE.FOREST_WORKS].includes(building.type)&&node?.forestStand){
    const fauna=forestFaunaEcologyFor(node.forestStand,{day:state.dayOfYear,climate:state.worldOptions?.climate||"temperate"});
    if(fauna)siteNote+=" · FAUNA ECOLOGY: "+esc(forestFaunaEcologySummary(fauna))+" · FOOD WEB: "+esc(fauna.foodWeb.keystone)+" ("+number(fauna.foodWeb.nodes.length)+" guilds / "+number(fauna.foodWeb.links.length)+" links) · INDICATORS: health "+Math.round(Number(fauna.indicators.forestHealth)||0)+"% · water "+Math.round(Number(fauna.indicators.waterQuality)||0)+"% · deadwood "+Math.round(Number(fauna.indicators.deadwoodContinuity)||0)+"% · old growth "+Math.round(Number(fauna.indicators.oldGrowth)||0)+"% · biodiversity "+Math.round(Number(fauna.indicators.biodiversity)||0)+"%";
   }
  }catch{}
  const deliveryAvailability=forestDeliveryAvailability(building);
  const sellAvailability=[TYPE.LUMBER,TYPE.FORESTER].includes(building.type)?forestSellAvailability(building):null;
  const forestEconomy=[TYPE.LUMBER,TYPE.FORESTER].includes(building.type)?forestGatheringEconomySummary():"";
  const thinningAvailability=building.type===TYPE.LUMBER?forestThinningAvailability(building,6):null;
  const thinSystem=thinningAvailability?.point?.forestDynamics?.silviculture?.system||null;
  const thinLabel=thinSystem==="coppice"?"CUT COPPICE":thinSystem==="coppice-with-standards"?"CUT UNDERWOOD":thinSystem==="selection"?"SELECT FELLING":thinSystem==="continuous-cover"?"SINGLE-TREE CUT":thinSystem==="wood-pasture"?"POLLARD AND CLEAR":"THIN NEAREST STAND";
  const forestGather=[TYPE.LUMBER,TYPE.FORESTER].includes(building.type)?[
   ...(forestEconomy?['<span class="building-detail-wide" data-forest-economy><strong>Forest goods</strong><small>'+esc(forestEconomy)+'</small></span>']:[]),
   '<button type="button" class="command-choice" data-gather-forest="'+esc(building.id)+'">GATHER FOREST PRODUCTS</button>',
   '<button type="button" class="command-choice" data-deliver-forest="'+esc(building.id)+'"'+(deliveryAvailability.available>0?' title="'+esc(deliveryAvailability.summary)+'"':' disabled title="'+esc(deliveryAvailability.reason)+'"')+'>DELIVER FOREST GOODS</button>',
   '<button type="button" class="command-choice" data-sell-forest="'+esc(building.id)+'"'+(sellAvailability?.ok?' title="'+esc(sellAvailability.summary)+'"':' disabled title="'+esc(sellAvailability?.reason||"No non-timber forest goods to sell")+'"')+'>SELL FOREST GOODS'+(sellAvailability?.gold?' (+'+sellAvailability.gold+'G)':'')+'</button>',
   '<button type="button" class="command-choice" data-process-hunt="'+esc(building.id)+'">PROCESS FOREST HUNT</button>',
   '<button type="button" class="command-choice" data-suppress-forest="'+esc(building.id)+'">SUPPRESS FOREST DISTURBANCE</button>',
   '<button type="button" class="command-choice" data-reforest-forest="'+esc(building.id)+'">REFOREST NEAREST CLEARING</button>',
   '<button type="button" class="command-choice" data-firebreak-forest="'+esc(building.id)+'">BUILD FOREST FIREBREAK</button>',
   '<button type="button" class="command-choice" data-burn-forest="'+esc(building.id)+'">CONTROLLED BURN</button>',
   '<button type="button" class="command-choice" data-drain-forest="'+esc(building.id)+'">DRAIN / RESTORE NEAREST WETLAND</button>',
   ...(building.type===TYPE.LUMBER?['<button type="button" class="command-choice" data-thin-forest="'+esc(building.id)+'"'+(thinningAvailability.ok?'':' disabled title="'+esc(thinningAvailability.reason)+'"')+'>'+esc(thinLabel)+'</button>']:[]),
  ].join(""):"";
  const forestPannage=building.type===TYPE.STABLE?'<button type="button" class="command-choice" data-feed-stable="'+esc(building.id)+'">FEED STABLE FROM MAST OR HAY</button>':"";
  const meadowGather=[TYPE.FARM,TYPE.STABLE].includes(building.type)?'<button type="button" class="command-choice" data-gather-meadow="'+esc(building.id)+'">GATHER MEADOW PRODUCTS</button>':"";
  let wetlandWorks="";
  try{
   if([TYPE.FARM,TYPE.STABLE].includes(building.type)&&state.worldOptions?.climate==="swamp"){
    const wetland=swampWorkAvailability(building.x,building.y);
    if(wetland.ok) wetlandWorks='<span class="building-detail-wide"><strong>Wetland works</strong><small>'+esc(wetland.title)+' · '+esc(wetland.summary||"no works built")+' · '+wetland.audit+' site features</small>'+Object.values(wetland.works).map(work=>'<button type="button" class="command-choice" data-swamp-work="'+esc(work.id)+'" data-swamp-building="'+esc(building.id)+'"'+(work.ok?'':' disabled title="'+esc(work.reason||"Not possible here")+'"')+'>'+esc(work.label.toUpperCase())+'</button>').join("")+'</span>';
   }
  }catch{}
  let mountainWorks="";
  try{
   if(state.worldOptions?.climate==="mountain"&&String(building.id)===String(expandedBuildingId)){
    const mountain=mountainWorkAvailability(building.x,building.y);
    if(mountain.ok) mountainWorks='<span class="building-detail-wide"><strong>Mountain works</strong><small>'+esc(mountain.title)+' · '+esc(mountain.summary||"no works built")+' · '+mountain.audit+' site features</small>'+Object.values(mountain.works).map(work=>'<button type="button" class="command-choice" data-mountain-work="'+esc(work.id)+'" data-mountain-building="'+esc(building.id)+'"'+(work.ok?'':' disabled title="'+esc(work.reason||"Not possible here")+'"')+'>'+esc(work.label.toUpperCase())+'</button>').join("")+'</span>';
   }
  }catch{}
  let volcanoWorks="";
  try{
   if(state.worldOptions?.climate==="volcanic"&&String(building.id)===String(expandedBuildingId)){
    const volcanic=volcanoWorkAvailability(building.x,building.y);
    if(volcanic.ok) volcanoWorks='<span class="building-detail-wide"><strong>Volcanic works</strong><small>'+esc(volcanic.title)+' · '+esc(volcanic.summary||"no works built")+' · '+volcanic.audit+' site features</small>'+Object.values(volcanic.works).map(work=>'<button type="button" class="command-choice" data-volcano-work="'+esc(work.id)+'" data-volcano-building="'+esc(building.id)+'"'+(work.ok?'':' disabled title="'+esc(work.reason||"Not possible here")+'"')+'>'+esc(work.label.toUpperCase())+'</button>').join("")+'</span>';
   }
  }catch{}
  let coastWorks="";
  try{
   if(state.worldOptions?.climate==="coastal"&&String(building.id)===String(expandedBuildingId)){
    const coastal=coastWorkAvailability(building.x,building.y);
    if(coastal.ok) coastWorks='<span class="building-detail-wide"><strong>Coastal works</strong><small>'+esc(coastal.title)+' · '+esc(coastal.summary||"no works built")+' · '+coastal.audit+' site features</small>'+Object.values(coastal.works).map(work=>'<button type="button" class="command-choice" data-coast-work="'+esc(work.id)+'" data-coast-building="'+esc(building.id)+'"'+(work.ok?'':' disabled title="'+esc(work.reason||"Not possible here")+'"')+'>'+esc(work.label.toUpperCase())+'</button>').join("")+'</span>';
   }
  }catch{}
  const detail=card?.desc||BUILDING_LABELS[building.type]||"No additional building description is recorded.";
  const chainTags=chainTagsFor(building.type);
  const chainTagMarkup=chainTags.length?'<span class="building-chain-tags" data-chain-tags="'+esc(chainTags.join(","))+'"><strong>Production chains</strong><small>'+esc(chainTags.join(" · "))+'</small></span>':"";
  const buildingForm=buildingFormFor(building);
  const formText=buildingForm?(buildingForm.label+" · "+buildingForm.description+" · Hearth insulation "+(buildingForm.warmthPercent>=0?"+":"")+buildingForm.warmthPercent+"%"):"No regional form was assigned to this structure.";
  const sawProfileId=building.type===TYPE.SAWMILL?sawProfileIdFor(building):null;
  const sawProfile=sawProfileId?SAW_PROFILES[sawProfileId]:null;
  const sawInfo=building.type===TYPE.SAWMILL?(()=>{
   const rows=timberMarketSummary().rows.filter(row=>row.stock>0).slice(0,4);
   const last=building.lastSawQuality?" · last batch "+building.lastSawQuality.grade+" "+building.lastSawQuality.label+" ("+Math.round((Number(building.lastSawQuality.score)||0)*100)+"%)":"";
   return sawProfile.label+" · "+sawProfile.note+(rows.length?" · In store: "+rows.map(row=>row.stock+" "+row.label+" ("+row.planks+" planks/2)").join(", "):" · No regional timber in store")+last;
  })():"";
  const sawField=building.type===TYPE.SAWMILL?'<span>Saw specialization<strong><select class="saw-profile-select" data-saw-profile="'+esc(building.id)+'" aria-label="Saw specialization for '+esc(name)+'">'+Object.values(SAW_PROFILES).map(profile=>'<option value="'+esc(profile.id)+'"'+(profile.id===sawProfileId?' selected':'')+'>'+esc(profile.label)+'</option>').join("")+'</select></strong><small>'+esc(sawProfile.note)+'</small></span>':"";
  const worksStatus=building.type===TYPE.FOREST_WORKS?forestWorksStatus(building):null;
  const worksMode=worksStatus?.mode||null;
  const worksLast=building.lastForestBatch?"Last batch: "+building.lastForestBatch.label+" → "+Object.entries(building.lastForestBatch.output||{}).map(([good,value])=>value+" "+(INDUSTRY_GOODS[good]?.label||good)).join(" + ")+(building.lastForestBatch.style?" · "+building.lastForestBatch.style:"")+(building.lastForestBatch.quality?" · "+building.lastForestBatch.quality.grade:""):"No batch has run yet";
  const grandStatus=building.type===TYPE.SHIPYARD||building.type===TYPE.PAPER_MILL?grandConsumerStatusFor(building):null;
  const grandConsumerField=grandStatus?'<span class="building-detail-wide" data-grand-consumer="'+esc(grandStatus.id)+'" data-grand-status="'+esc(grandStatus.status)+'"><strong>'+esc(grandStatus.label)+' · permanent forest consumer</strong><small>'+esc(grandStatus.story)+'</small><small>'+esc(grandStatus.ok?'RUNNING · next batch due':'STOCKED OUT · '+grandStatus.text)+'</small><small>Batches run: '+number(grandStatus.batches)+' · Inputs: '+Object.entries(grandStatus.stock||{}).map(([good,value])=>value+' '+good).join(" · ")+'</small></span>':"";
  const forestWorksField=building.type===TYPE.FOREST_WORKS?'<span class="building-detail-wide">Forest industry<strong><select class="forest-mode-select" data-forest-mode="'+esc(building.id)+'" aria-label="Forest industry for '+esc(name)+'">'+Object.values(FOREST_WORKS_MODES).map(mode=>'<option value="'+esc(mode.id)+'"'+(worksMode?.id===mode.id?' selected':'')+'>'+esc(mode.label)+'</option>').join("")+'</select></strong><small>'+esc(worksMode?.description||"Choose a workshop")+' · Site: '+esc(worksStatus?.siteLabel||"unknown")+(worksStatus?.style?" · Style: "+esc(worksStatus.style.label):"")+' · '+esc(worksLast)+'</small><small class="building-mastery" data-forest-mastery="'+number(forestMasteryFor(building).level)+'">Mastery: '+esc(forestMasteryFor(building).label)+' · '+number(forestMasteryFor(building).batches)+' batches'+(forestMasteryFor(building).nextAt!==null?' · next '+esc(forestMasteryFor(building).nextLabel)+' at '+number(forestMasteryFor(building).nextAt):' · highest rank')+'</small><small class="'+(worksStatus?.ok?'is-balanced':'')+'">'+esc(worksStatus?.reason||worksStatus?.mode?.use||"Ready")+'</small><button type="button" class="command-choice" data-run-forest-works="'+esc(building.id)+'"'+(worksStatus?.ok?'':' disabled title="'+esc(worksStatus?.reason||"Workshop unavailable")+'"')+'>RUN ONE BATCH</button></span>':"";
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
  const manualOrders=getManualLogisticsSnapshot(building,{warehouseFree:city.warehouses?.free??0}).orders;
  const manualOrderMarkup=manualOrders.length?('<span class="building-detail-wide" data-manual-logistics="'+esc(building.id)+'"><strong>Manual carrier orders</strong><small>'+number(manualOrders.length)+' recipe goods · '+number(manualOrders.filter(order=>order.ok).length)+' ready · max '+number(CARRIER_CAPACITY)+' per cart</small>'+manualOrders.map(order=>'<button type="button" class="command-choice" data-command="manual-order" data-manual-order="'+esc(order.kind)+'" data-value="'+esc(building.id)+'" data-good="'+esc(order.good)+'" data-quantity="'+number(order.quantity)+'"'+(order.ok?'':' disabled title="'+esc(order.reason||"Order unavailable")+'"')+'>'+esc((order.kind==="supply"?"SUPPLY ":"HAUL ")+order.quantity+" "+order.label).toUpperCase()+'</button>').join("")+'</span>'):"";
  const profileField=inventory?.kind==="warehouse"?'<span>Warehouse profile<strong>'+(building.type===TYPE.KEEP?esc(inventory.profileLabel||"General store")+" · fixed by the crown":'<select class="warehouse-profile-select" data-warehouse-profile="'+esc(building.id)+'" aria-label="Warehouse profile for '+esc(name)+'">'+Object.values(WAREHOUSE_PROFILES).map(profile=>'<option value="'+esc(profile.id)+'"'+(inventory.profile===profile.id?' selected':'')+'>'+esc(profile.label)+" · "+number(profile.capacity)+'</option>').join("")+'</select>')+'</strong></span>':"";
  const profileRow=(logistics.warehouses?.rows||[]).find(row=>String(row.id)===String(building.id))||null;
  const profileHint=inventory?.kind==="warehouse"?'<span class="building-detail-wide warehouse-profile-hint" data-profile-hint="'+esc(inventory.profile)+'"><strong>Warehouse profile note</strong><small>'+esc(warehouseProfileHint(profileRow||inventory,inventory.profile))+'</small></span>':"";
  const fieldText=building.field?" · field "+building.field.stage+" ("+Math.round(building.field.growth)+"%) · soil "+Math.round(building.field.fertility)+"%"+(building.field.resting?" · resting":""):"";
  const stewardship=foresterStewardship(building);
  return '<details class="building-record" data-building-name="'+esc(name.toLowerCase())+'" data-building-id="'+esc(building.id)+'"'+(String(building.id)===String(expandedBuildingId)?' open':'')+'><summary><svg class="building-record-art" viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-building-atlas.svg#'+buildingSprite(building.type)+'"></use></svg><span class="building-record-title"><strong>'+esc(name)+'</strong><small>'+esc(building.id||("record-"+index))+' · '+Math.round(building.x)+', '+Math.round(building.y)+'</small></span><span class="building-record-status"><b>'+(isUnderConstruction(building)?site.percent+'%':condition+'%')+'</b><small>'+(isUnderConstruction(building)?"built":"condition")+'</small></span></summary><div class="building-record-details"><p>'+esc(detail)+'</p>'+chainTagMarkup+stewardship+'<div class="building-detail-grid"><span>Footprint<strong>'+amount(width)+' × '+amount(height)+' tiles</strong></span><span>Health<strong>'+amount(hp)+' / '+amount(maxHp)+'</strong></span><span>Construction<strong>'+esc(site.status)+' · '+site.percent+'%</strong></span><span>Staff<strong>'+staff+(capacity?' / '+capacity:' · not staffed')+'</strong></span><span>Workforce efficiency<strong>'+(efficiency===null?'not applicable':efficiency+'%')+'</strong></span><span>Recorded card cost<strong>'+esc(costs)+'</strong></span><span>Local store<strong>'+esc(storeText)+'</strong></span>'+(sawInfo?'<span>Timber recipe<strong>'+esc(sawInfo)+'</strong></span>':'')+sawField+forestWorksField+grandConsumerField+profileField+profileHint+'<span>Active haul<strong>'+esc(haulText)+'</strong></span><span>Supply / service<strong>'+esc(supply||"Operating")+'</strong></span><span>Building form<strong>'+esc(formText)+'</strong></span><span>Site data<strong>'+esc(siteNote)+esc(fieldText)+'</strong></span>'+manualOrderMarkup+repairButton+forestGather+forestPannage+meadowGather+wetlandWorks+mountainWorks+volcanoWorks+coastWorks+'</div></div></details>';
 }).join("");
 const logisticsClosed=narrowViewport()&&!expandedBuildingLogistics;
 const rejection=!logisticsClosed&&logistics.lastRejection?'<p class="command-note logistics-rejection">LAST ORDER REJECTED · '+esc(logistics.lastRejection.reason)+' · '+esc(logistics.lastRejection.kind||"job")+' '+(logistics.lastRejection.good?esc(logistics.lastRejection.good):"")+' · tick '+number(logistics.lastRejection.tick)+'</p>':"";
 const jobRows=logisticsClosed?"":[...(logistics.jobs||[]),...(logistics.completed||[])].map(job=>'<div class="logistics-job'+(job.status==="blocked"?' is-blocked':'')+'" data-job-status="'+esc(job.status)+'"><strong>'+esc((job.id||"job")+" · "+job.quantity+" "+job.good+" · "+job.status)+'</strong><small>'+esc((job.from?.kind||"?")+" "+(job.from?.id||"?")+" → "+(job.to?.kind||"?")+" "+(job.to?.id||"?")+" · reserved "+number(job.reserved)+" · picked "+number(job.picked)+" · delivered "+number(job.delivered))+(job.carrierId?" · carrier "+esc(job.carrierId):"")+(job.attempts?" · attempts "+esc(job.attempts):"")+(job.reason?" · "+esc(job.reason):"")+'</small></div>').join("");
 const warehouseRows=logisticsClosed?"":(logistics.warehouses?.rows||[]).map(row=>{
  const stored=Object.entries(row.stored||{}).filter(([,value])=>Number(value)>0).map(([good,value])=>value+" "+good).join(" · ")||"empty";
  return '<div class="logistics-job warehouse-row" data-warehouse-profile="'+esc(row.profile)+'"><strong>'+esc((row.type===TYPE.KEEP?"Royal Keep":"Warehouse")+" · "+(row.profileLabel||"General store")+" · "+row.used+" / "+row.capacity)+'</strong><small>'+esc(row.id+" · "+Math.round(row.x)+", "+Math.round(row.y)+" · "+stored+" · reserved in "+row.reservedIn+" / out "+row.reservedOut)+'</small></div>';
 }).join("");
 const ledger=(logistics.ledger||[]).slice().reverse();
 const movementRows=logisticsClosed?"":ledger.slice(0,40).map(entry=>'<div class="logistics-job logistics-movement" data-movement-type="'+esc(entry.type||"move")+'"><strong>'+esc(String(entry.type||"move").toUpperCase())+" · "+esc(entry.quantity+" "+(entry.good||"stock"))+(entry.scope==="resource"?" · RESOURCE":"")+'</strong><small>'+esc((entry.from||"—")+" → "+(entry.to||"—")+" · tick "+entry.tick+" · "+(entry.cause||entry.type||"move"))+(entry.jobId?" · job "+esc(entry.jobId):"")+(entry.houseId?" · household "+esc(entry.houseId):"")+(entry.key?" · key "+esc(entry.key):"")+'</small></div>').join("");
 const auditRows=logisticsClosed?"":(logistics.audit?.rows||[]).map(row=>'<div class="logistics-job logistics-audit'+(row.balanced?'':' is-blocked')+'" data-audit-good="'+esc(row.good)+'"><strong>'+esc(row.good.toUpperCase()+" · "+(row.balanced?"BALANCED":"DIFFERENCE "+row.difference))+'</strong><small>opening '+number(row.opening)+" + produced "+number(row.produced)+" − consumed "+number(row.consumed)+" = expected "+number(row.expected)+" · physical "+number(row.physical)+" · "+esc(row.scope)+'</small></div>').join("");
 const logisticsSections=logisticsClosed
  ?'<div class="command-section-title">LOGISTICS ARCHIVE</div><button type="button" class="command-choice" data-building-logistics>OPEN STORES, HAULS, AUDIT &amp; MOVEMENT ARCHIVE</button><p class="command-note">The archive is measured from live simulation state. It is folded on this screen to keep the first building register frame inside the low-end budget.</p>'
  :'<div class="command-section-title">ALL STORES</div><div class="logistics-overview">'+(warehouseRows||'<p class="command-note">No warehouse exists yet.</p>')+'</div>'+
   '<div class="command-section-title">DELIVERY JOBS · '+number(logistics.jobCount||0)+' / '+number(logistics.jobLimit||0)+'</div>'+rejection+'<div class="logistics-overview">'+(jobRows||'<p class="command-note">No delivery jobs are recorded.</p>')+'</div>'+
   '<div class="command-section-title">GOODS AUDIT · '+((logistics.audit?.balanced)?"ALL BOOKS BALANCED":"CHECK DIFFERENCES")+'</div><div class="logistics-overview">'+(auditRows||'<p class="command-note">No goods audit is recorded yet.</p>')+'</div>'+
   '<div class="command-section-title">MOVEMENT ARCHIVE · '+number(logistics.ledgerSize||0)+' / '+number(logistics.ledgerLimit||0)+' ENTRIES</div><div class="logistics-overview">'+(movementRows||'<p class="command-note">No good movement is recorded yet.</p>')+'</div>';
 return intro("SETTLEMENT ARCHITECTURE","Building register","Inspect every surviving structure using its actual simulation entity, health, footprint, staffing and site data.")+
 '<div class="command-summary"><div><small>STRUCTURES</small><strong>'+allRecords.length+'</strong></div><div><small>DAMAGED STRUCTURES</small><strong>'+number(bulkRepair.count)+'</strong></div><div><small>CONSTRUCTION SITES</small><strong>'+city.construction+'</strong></div><div><small>CARRIERS</small><strong>'+city.carriers+'</strong></div><div><small>ACTIVE HAULS</small><strong>'+city.activeJobs+'</strong></div><div><small>BLOCKED HAULS</small><strong>'+number(city.blockedJobs||0)+'</strong></div><div><small>WAREHOUSE SPACE USED</small><strong>'+number(city.warehouses?.used||0)+' / '+number(city.warehouses?.capacity||0)+'</strong></div><div><small>WAREHOUSE RESERVED</small><strong>'+number(city.warehouses?.reservedIn||0)+' in · '+number(city.warehouses?.reservedOut||0)+' out</strong></div><div><small>WATER COVERAGE</small><strong>'+(settlement.needs?Math.round(settlement.needs.water*100)+'%':'—')+'</strong></div></div>'+
 logisticsSections+bulkRepairMarkup+
 '<div class="building-type-summary">'+typeSummary+'</div>'+(records.length<allRecords.length?'<p class="command-note">Showing the first '+records.length+' of '+allRecords.length+' structures on this screen. Counts above include every structure.</p><button type="button" class="command-choice" data-building-show-all>SHOW ALL '+allRecords.length+' STRUCTURES</button>':'')+'<label class="building-search-label" for="building-search">FILTER STRUCTURES</label><input id="building-search" class="building-search" type="search" maxlength="80" placeholder="Search by building type or name">'+
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
 // Connector geometry needs several rect reads and a full SVG layout pass.
 // It is drawn once after the panel has hydrated, including on narrow screens.
 const bounds=graph.getBoundingClientRect();
 // The SVG is decorative and must never widen the 360px panel. Measure the
 // content box, not scrollWidth, and cache every node rect once: asking the
 // browser for each endpoint on every edge forces repeated synchronous layout.
 const width=Math.max(1,graph.clientWidth),height=Math.max(1,graph.scrollHeight,graph.clientHeight);
 svg.setAttribute("viewBox","0 0 "+width+" "+height);
 svg.setAttribute("width","100%");svg.setAttribute("height",String(height));
 const nodes=new Map([...graph.querySelectorAll("[data-lineage-node-id]")].map(node=>[node.dataset.lineageNodeId,node]));
 const rects=new Map([...nodes].map(([id,node])=>[id,node.getBoundingClientRect()]));
 for(const path of svg.querySelectorAll("[data-lineage-from][data-lineage-to]")){
  const from=nodes.get(path.dataset.lineageFrom),to=nodes.get(path.dataset.lineageTo);
  if(!from||!to){path.setAttribute("d","");continue;}
  const a=rects.get(path.dataset.lineageFrom),b=rects.get(path.dataset.lineageTo);
  if(!a||!b){path.setAttribute("d","");continue;}
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
 const masterworks=forestMasterworkArchive();
 const masterworkRows=masterworks.length?masterworks.map(entry=>'<article class="command-history masterwork-record" data-dynasty-masterwork="'+esc(entry.id)+'"><strong>YEAR '+number(entry.year)+' · MASTERWORK '+esc(entry.style)+'</strong><p>'+esc(entry.master)+' · '+esc(entry.region)+' · '+esc(entry.workshop)+' · '+esc(entry.quality)+' ('+esc(entry.grade)+') · '+number(entry.value)+' G value · +'+number(entry.prestige)+' prestige</p></article>').join(""):'<p class="command-note">No masterwork furniture has entered the dynasty archive yet. A master furniture workshop can produce one from a mastered batch.</p>';
 return intro("HOUSE OF THE CROWN","Dynasty & lineage","A multi-generation view of the actual kinship graph. Select any recorded person to open their full dossier.")+
 '<div class="command-section-title">MASTERWORK FURNITURE ARCHIVE · '+number(masterworks.length)+'</div><div class="command-history-list" data-dynasty-masterworks="'+number(masterworks.length)+'">'+masterworkRows+'</div>'+
 '<div class="command-section-title">INTERACTIVE LINEAGE</div>'+lineageGraph(king,heirId)+
 '<div class="command-section-title">DESCENDANTS & SUCCESSION</div><div class="dynasty-tree">'+(generations.join("")||'<p class="command-note">No descendant links are recorded for the current sovereign.</p>')+'</div>'+
 '<div class="command-section-title">ROYAL SUCCESSION RECORD</div><div class="command-history-list">'+(history||'<p class="command-note">No royal event has been recorded yet.</p>')+'</div>'+
 '<p class="command-note">Only saved family relationships are drawn. Missing, unknown or unlinked relatives are intentionally not inferred.</p>';
}
function dragonPortraitSymbol(lifeStage){const stage=String(lifeStage||"adult").toLowerCase();return ({hatchling:"dragon-hatchling",juvenile:"dragon-juvenile",adult:"dragon-adult",elder:"dragon-elder",ancient:"dragon-ancient"})[stage]||"dragon-adult";}
function creatureGlyph(d){
 const species=String(d.species||"dragon");
 if(species==="dragon")return '<svg class="creature-portrait" data-life-stage="'+esc(d.lifeStage)+'" viewBox="0 0 128 96" aria-hidden="true"><use href="assets/royal-dragon-atlas.svg#'+dragonPortraitSymbol(d.lifeStage)+'"></use></svg>';
 const symbol=CREATURE_SPECIES_LIST.some(profile=>profile.id===species)?species:"griffin";
 return '<svg class="creature-portrait" data-creature-species="'+esc(species)+'" viewBox="0 0 128 96" aria-hidden="true"><use href="assets/royal-creature-atlas.svg#'+symbol+'"></use></svg>';
}
function creatures(){
 const c=getCreatureSnapshot();
 const speciesLabels=new Map(c.species.map(profile=>[profile.id,profile.label]));
 const nests=c.living.reduce((sum,d)=>sum+(d.nest?1:0),0);
 const eggs=c.living.reduce((sum,d)=>sum+(Number(d.eggs)||0),0);
 const hatchlings=c.living.reduce((sum,d)=>sum+(Number(d.ecology?.hatchlings)||0),0);
 const rows=c.living.map(d=>{
  const memories=(d.memories||[]).slice(0,8).map(memory=>'<li><strong>YEAR '+number(memory.year)+'</strong><span>'+esc(memory.text)+'</span></li>').join("");
  const abilities=(d.abilities||[]).map(value=>'<span class="creature-chip">'+esc(value)+'</span>').join("");
  const goals=(d.goals||[]).map(value=>'<span class="creature-chip">'+esc(value)+'</span>').join("");
  const species=speciesLabels.get(d.species)||String(d.species||"Dragon");
  const nest=d.nest?'<span>Nest<strong>'+number(d.eggs)+' eggs · laid year '+number(d.nest.laidYear)+'</strong></span>':'<span>Nest<strong>No active clutch</strong></span>';
  const ecology=d.ecology||{};
  return '<details class="creature-record"><summary>'+creatureGlyph(d)+'<span><strong>'+esc(d.name)+'</strong><small>'+esc(species)+' · '+esc(d.lifeStage)+' · '+number(d.ageYears)+' years · '+esc(d.temperament)+'</small></span><b>'+number(d.health)+'% health</b></summary><div class="creature-dossier"><div class="creature-stat-grid"><span>Health<strong>'+number(d.health)+' / 100</strong></span><span>Hunger<strong>'+number(d.hunger)+' / 100</strong></span><span>Bond with sovereign<strong>'+number(d.bond)+' / 100</strong></span><span>Expected lifespan<strong>'+number(d.expectedLifespan)+' years</strong></span><span>Habitat<strong>'+esc(d.habitat||"Unknown")+'</strong></span><span>Diet<strong>'+esc(d.diet||"unknown")+'</strong></span><span>Territory<strong>'+number(d.territoryRadius)+' tiles</strong></span><span>Injuries<strong>'+number(d.injuries)+'</strong></span>'+nest+'<span>Ecology<strong>'+number(ecology.predation||0)+' hunts · '+number(ecology.scavenging||0)+' carrion · '+number(ecology.migrations||0)+' migrations</strong></span><span>Clutches raised<strong>'+number(ecology.hatchlings||0)+' hatchlings</strong></span></div><div class="command-section-title">ABILITIES</div><div class="creature-chip-list">'+(abilities||'<span class="command-note">No abilities recorded.</span>')+'</div><div class="command-section-title">RECORDED GOALS</div><div class="creature-chip-list">'+(goals||'<span class="command-note">No goals recorded.</span>')+'</div><div class="command-section-title">PERSONAL MEMORIES</div><ol class="creature-memory-list">'+(memories||'<li>No memories have been recorded yet.</li>')+'</ol></div></details>';
 }).join("");
 const archive=c.archive.slice().reverse().map(d=>{
  const memories=(d.memories||[]).map(memory=>'<li><strong>YEAR '+number(memory.year)+'</strong><span>'+esc(memory.text)+'</span></li>').join("");
  return '<details class="creature-record is-memorial"><summary>'+creatureGlyph(d)+'<span><strong>'+esc(d.name)+'</strong><small>MEMORIAL · '+esc(speciesLabels.get(d.species)||d.species||"Dragon")+' · '+esc(d.lifeStage)+' · '+number(d.ageYears)+' years</small></span><b>FELL IN YEAR '+number(d.deathYear)+'</b></summary><div class="creature-dossier"><p>Cause recorded: '+esc(d.cause||"unknown")+'</p><ol class="creature-memory-list">'+(memories||'<li>No surviving memories were archived.</li>')+'</ol></div></details>';
 }).join("");
 const speciesRows=c.species.map(profile=>'<div><small>'+esc(profile.label.toUpperCase())+'</small><strong>'+number(profile.living)+' / '+number(profile.max)+'</strong></div>').join("");
 const summonOptions=CREATURE_SPECIES_LIST.map(profile=>'<option value="'+esc(profile.id)+'">'+esc(profile.label)+' — '+number(profile.cost.gold)+' GOLD · '+number(profile.cost.food)+' FOOD</option>').join("");
 return intro("THE LIVING BESTIARY","Royal creature sanctuary","Individual creature dossiers preserve species, habitat, territory, diet, age, needs, temperament, clutches and personal memories from the live creature records.")+
 '<img class="command-creature-art" src="assets/dragon-companion.svg" alt="Royal creature sanctuary illustration" loading="lazy"><div class="command-summary"><div><small>LIVING CREATURES</small><strong>'+c.living.length+' / 14</strong></div><div><small>NESTING CLUTCHES</small><strong>'+nests+' · '+eggs+' EGGS</strong></div><div><small>HATCHLINGS RAISED</small><strong>'+hatchlings+'</strong></div><div><small>CREATURE MEMORIALS</small><strong>'+c.archive.length+'</strong></div></div><div class="command-summary">'+speciesRows+'</div>'+
 '<div class="command-actions"><select id="creature-summon-select" class="settings-select" aria-label="Choose a creature species">'+summonOptions+'</select><button data-command="summon-creature">SUMMON CREATURE</button><button data-command="summon-dragon">SUMMON A DRAGON</button></div><div class="command-section-title">LIVING CREATURE DOSSIERS</div><div class="creature-record-list">'+(rows||'<p class="command-note">No creature has joined the realm yet.</p>')+'</div>'+
 '<div class="command-section-title">CREATURE MEMORIALS</div><div class="creature-record-list">'+(archive||'<p class="command-note">No creature memorials yet.</p>')+'</div>';
}

function chronicleSectionsChunks(){
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
 return [
  '<div class="command-section-title">ACTIVE REALM ISSUE</div>'+active,
  legacySection,
  renderAiArchiveSection(),
  '<div class="command-section-title">RECORDED CHRONICLE</div><div class="chronicle-filters"><label for="chronicle-search">SEARCH RECORDS</label><input id="chronicle-search" type="search" maxlength="80" placeholder="Search event text or category"><label for="chronicle-kind-filter">CATEGORY</label><select id="chronicle-kind-filter">'+options+'</select></div>',
  '<div class="chronicle-list">'+(rows||'<p class="command-note">No chronicle entries have been recorded yet.</p>')+'</div>',
  '<p class="command-note">The living timeline retains up to 2,400 pages; the decision log below retains up to 100 recent records. This screen does not claim unread tracking or permanent archival beyond the simulation save; both records are restored from the save.</p>'
 ];
}
function chronicle(){
 return intro("THE ROYAL ARCHIVE","Chronicle & event inbox","Reread the living timeline of small events, then search the short decision log and legacy record. The timeline is a reading view; the realm keeps running.")+
 '<div data-chronicle-timeline-slot></div><div data-chronicle-sections-slot></div>';
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
 const history=m.history.length?'<div class="military-history">'+m.history.slice(0,6).map(entry=>'<div><span>YEAR '+entry.year+'</span><strong>'+entry.soldiers+' soldiers · '+Math.round(entry.goldPaid)+'G / '+Math.round(entry.foodPaid)+'F</strong><small>morale '+Math.round(entry.morale)+' · '+entry.desertions+' desertions</small></div>').join("")+'</div>':'';
 const casualties=m.recentCasualties.length?m.recentCasualties.map(entry=>'<div class="military-casualty"><span>'+esc(entry.name)+'</span><strong>'+esc(String(entry.cause).toUpperCase())+' · YEAR '+entry.year+'</strong></div>').join(""):'<p class="command-note">No casualties are recorded.</p>';
 const campaignData=m.campaigns||{campaigns:[],history:[],aims:[],limits:{active:2},counters:{aimsOpened:0,commitments:0,settlements:0}};
 const theatres=getWorldMapSnapshot().kingdoms.filter(kingdom=>!kingdom.isCrown).slice(0,5);
 const theatreOptions=theatres.length?theatres.map(kingdom=>'<option value="'+esc(kingdom.id)+'">'+esc(kingdom.name)+' · '+kingdom.regionCount+' provinces · '+kingdom.contested+' contested</option>').join(""):'<option value="">No neighbouring theatre recorded</option>';
 const houseOptions='<option value="">Crown alone · no house bond</option>'+getNobilitySnapshot().houses.filter(house=>house.memberCount>0).slice(0,4).map(house=>'<option value="'+esc(house.id)+'">HOUSE '+esc(house.familyName)+' · levy '+house.levyActive+'</option>').join("");
 const aimCards=campaignData.aims.map(aim=>{
  const affordable=Object.entries(aim.contract.cost).every(([key,value])=>(Number(state.resources?.[key])||0)>=value);
  const alreadyOpen=campaignData.campaigns.some(c=>c.aim===aim.id&&c.stage==="aim");
  const disabled=!theatres.length||!affordable||alreadyOpen||campaignData.campaigns.length>=campaignData.limits.active;
  return '<article class="command-policy" data-war-aim="'+esc(aim.id)+'"><div><span class="command-ribbon">'+esc(aim.label)+'</span><strong>'+esc(aim.contract.label)+'</strong><p>'+esc(aim.description)+'</p><small>'+costLabel(aim.contract.cost)+' · minimum power '+aim.contract.minimumPower+' · reward '+costLabel(aim.contract.reward)+' · risk '+aim.contract.risk+'/100</small></div><div class="command-inline"><select id="campaign-theatre-'+esc(aim.id)+'" aria-label="Choose a theatre for '+esc(aim.label)+'">'+theatreOptions+'</select><select id="campaign-house-'+esc(aim.id)+'" aria-label="Choose a house for '+esc(aim.label)+'">'+houseOptions+'</select><button type="button" data-command="campaign-aim" data-value="'+esc(aim.id)+'"'+(disabled?' disabled':'')+'>OPEN AIM</button></div>'+(alreadyOpen?'<small>This aim is already open for a theatre.</small>':'')+'</article>';
 }).join("");
 const campaignCards=campaignData.campaigns.length?campaignData.campaigns.map(c=>{
  const cost=costLabel(c.cost);
  return '<article class="command-policy" data-campaign-id="'+esc(c.id)+'"><div><span class="command-ribbon">'+esc(c.stageLabel)+' · '+esc(c.aimLabel)+'</span><strong>'+esc(c.theatreName)+'</strong><p>'+esc(c.houseName||"Crown alone")+' · power '+c.power+' · supply '+c.supply+' · risk '+c.risk+'/100.</p><small>Opened year '+number(c.openedYear)+(c.committedYear?' · committed year '+number(c.committedYear):'')+' · '+c.daysRemaining+' days to the annual settlement.</small></div>'+meter("CAMPAIGN PROGRESS",c.progressPercent)+'<div class="command-actions"><button type="button" data-command="campaign-commit" data-value="'+esc(c.id)+'"'+(c.canCommit?'':' disabled')+'>COMMIT · '+cost+'</button><button type="button" data-command="campaign-settle" data-value="'+esc(c.id)+'"'+(c.canSettle?'':' disabled')+'>SETTLE NOW</button></div>'+(c.outcome?'<p class="command-note"><strong>'+esc(c.outcome.result.toUpperCase())+'</strong> '+esc(c.outcome.summary)+'</p>':'')+'</article>';
 }).join(""):'<p class="command-note">No war band is in the field. Open an aim, commit a contract and the annual audit will settle it.</p>';
 const campaignHistory=campaignData.history.length?campaignData.history.slice(0,4).map(c=>'<div class="command-history"><strong>YEAR '+number(c.settledYear)+' · '+esc(c.outcome?.result?.toUpperCase()||"SETTLED")+' · '+esc(c.theatreName)+'</strong><p>'+esc(c.outcome?.summary||c.contractLabel)+'</p></div>').join(""):'<p class="command-note">No campaign has been settled yet.</p>';
 return intro("THE CROWN'S GARRISON","Barracks & stables","Recruit named residents, drill them over days, issue equipment, mount trained soldiers and meet the annual payroll. Training speed and success depend on the marshal, food, morale, equipment, season and war.")+
 '<div class="command-summary"><div><small>GARRISON</small><strong>'+m.garrison+' / '+m.capacity+'</strong></div><div><small>READINESS</small><strong>'+m.readiness+' / 100</strong></div><div><small>MORALE</small><strong>'+m.averageMorale+' / 100</strong></div><div><small>EQUIPMENT</small><strong>'+m.averageEquipment+' / 100</strong></div><div><small>BARACKS</small><strong>'+m.barracks+'</strong></div><div><small>STABLES</small><strong>'+m.stables+'</strong></div><div><small>CROWN DREAD</small><strong>'+m.dread.dread+' · '+esc(m.dread.band)+'</strong></div><div><small>BORDER LEVY</small><strong>×'+(1+m.pressure.percent/100).toFixed(2)+'</strong></div></div>'+
 '<div class="command-note"><strong>CROWN DREAD · '+m.dread.dread+'/100 '+esc(m.dread.band)+'</strong> · '+m.dread.soldiers+' soldiers at '+m.dread.power+' power, measured at the last muster. The courts read this: '+m.pressure.wars+' war(s), '+m.pressure.hostile+' hostile court(s) and '+m.pressure.incidents+' border incident(s) this year put the border levy at ×'+(1+m.pressure.percent/100).toFixed(2)+' on this muster. A feared crown is tested less and wins wars faster, but pays in trust and trade terms; a thin garrison invites pressure.</div>'+
 '<div class="command-section-title">DRILLMASTER & SEASON</div><p class="command-note"><strong>'+esc(m.marshal.name)+'</strong> · '+esc(m.marshal.office)+' · competence '+Math.round(m.marshal.competence)+'/100. '+(m.atWar?'War service shortens drill time but raises the chance of a failed drill.':'Peace permits deliberate drill.')+' Winter slows training; summer is the best window.</p>'+
 '<div class="command-section-title">RECRUIT FROM THE HOUSEHOLDS · '+costs+'</div><div class="command-inline"><select id="military-recruit-select" aria-label="Choose a resident to recruit"><option value="">Choose an adult resident…</option>'+candidates+'</select><button data-command="military-recruit" '+(!candidates||m.freeBeds<=0?'disabled':'')+'>RECRUIT TO GARRISON</button></div><p class="command-note">Recruitment removes a villager from the workforce and population count. Horse feed can come from stable pannage; otherwise it is paid in food.</p>'+
 '<div class="command-section-title">WARHORSES & STABLE RESERVE</div><div class="command-summary"><div><small>UNASSIGNED HORSES</small><strong>'+m.horses+'</strong></div><div><small>ASSIGNED</small><strong>'+m.assignedHorses+'</strong></div><div><small>STABLE CAPACITY</small><strong>'+(Number(m.assignedHorses)+Number(m.horses))+' / '+m.horseCapacity+'</strong></div><div><small>MOUNTED BONUS</small><strong>+18% POWER</strong></div></div><div class="command-actions"><button data-command="military-horse" '+(m.freeHorseCapacity<=0?'disabled':'')+'>BUY WARHORSE · 22 GOLD / 10 FOOD</button></div>'+
 '<div class="command-section-title">FEUDAL CAMPAIGNS · '+campaignData.campaigns.length+' / '+campaignData.limits.active+' ACTIVE · '+campaignData.counters.settlements+' SETTLED</div><p class="command-note"><strong>AIM → COMMIT → SETTLE.</strong> An aim binds a theatre and optionally a noble house. Committing pays the contract from the same treasury and stock as every other crown action. Progress advances by '+campaignData.limits.progressPerTick+' per day and settles once a year, or early when the register is full; the dedicated campaign stream never touches the combat draws.</p><div class="command-policy-list">'+aimCards+'</div><div class="command-section-title">WAR BANDS IN THE FIELD</div><div class="command-policy-list">'+campaignCards+'</div><div class="command-section-title">CAMPAIGN RECORD</div><div class="command-history-list">'+campaignHistory+'</div>'+
 '<div class="command-section-title">NAMED GARRISON · '+m.garrison+' SOLDIERS</div><div class="military-roster">'+(soldierRows||'<p class="command-note">No soldiers are recorded. Recruit a resident to begin.</p>')+'</div>'+
 '<div class="command-section-title">LAST ANNUAL MUSTER</div>'+payroll+history+
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
 '<div class="command-section-title">FIELD MEDICINE · '+h.fieldMedicine+' / '+h.fieldMedicineLimit+' PRACTICE</div><div class="command-summary"><div><small>TREATED CASES</small><strong>'+h.fieldTreatedLastYear+'</strong></div><div><small>GATHERED REMEDIES</small><strong>'+h.fieldStock+'</strong></div><div><small>OUTBREAK RISK</small><strong>'+(h.fieldOutbreakReduction>0?'−'+h.fieldOutbreakReduction+'%':'0%')+'</strong></div><div><small>ILLNESS MORTALITY</small><strong>'+(h.fieldMortalityReduction>0?'−'+h.fieldMortalityReduction+'%':'0%')+'</strong></div><div><small>NEW OUTBREAK SEVERITY</small><strong>'+(h.fieldSeverityRelief?'−1 STEP':'FULL')+'</strong></div></div><div class="health-medicine-actions"><button data-command="health-field" '+(h.sick<=0||h.fieldStock<=0?'disabled':'')+'>TREAT WITH FIELD REMEDIES'+(h.fieldStock>0?' · '+h.fieldStock+' IN STORE':'')+'</button></div><p class="command-note">'+(h.fieldMedicine>0?'At this practice, the next outbreak risk is '+h.fieldOutbreakReduction+'% lower and illness deaths are '+h.fieldMortalityReduction+'% lower'+(h.fieldSeverityRelief?', and a new outbreak begins one severity step milder':'')+'. Every annual audit turns treatments actually given with gathered herbs into remembered practice, then fades 28% of it. Keep gathering and treating to renew it.':'No field practice yet. Gather herbs or lichen and treat the sick; the next annual audit will turn last year\'s treated cases into remembered practice. It then fades 28% each year.')+'</p>'+'<div class="health-mortality-grid"><div><span>CHILDREN<b>'+age.child+'</b></span><span>ADULTS<b>'+age.adult+'</b></span><span>ELDERS<b>'+age.elder+'</b></span></div><div>'+occupations.map(([name,count])=>'<span>'+esc(name.toUpperCase())+'<b>'+count+'</b></span>').join("")+'</div></div><div class="health-death-list">'+(deaths||'<p class="command-note">No deaths have been recorded in the health ledger.</p>')+'</div>'+
 '<div class="command-section-title">ANNUAL HEALTH AUDIT</div>'+history+'<p class="command-note">Mortality is resolved once per year by age, occupation, illness, immunity, sanitation, healers and medicine stock. The audit is bounded to residents and the latest records.</p>';
}
function espionagePanel(){
 const s=getEspionageSnapshot(),gold=Number(state.resources?.gold)||0;
 const agentCards=s.agents.length?s.agents.map(a=>{
  const deskOptions=ESPIONAGE_DESKS.map(desk=>'<option value="'+desk+'"'+(a.desk===desk?' selected':'')+'>'+esc(ESPIONAGE_DESK_LABELS[desk])+'</option>').join("");
  const targetOptions='<option value="">No target needed</option>'+s.realms.map(realm=>'<option value="'+esc(realm.id)+'"'+(a.desk==="foreign"&&a.targetId===realm.id?' selected':'')+'>REALM · '+esc(realm.name)+'</option>').join("")+s.houses.map(house=>'<option value="'+esc(house.id)+'"'+(a.desk==="nobles"&&a.targetId===house.id?' selected':'')+'>HOUSE · '+esc(house.familyName)+'</option>').join("");
  return '<article class="spy-agent"><header><div><span class="command-ribbon">'+esc(a.deskLabel)+'</span><h4>'+esc(a.name)+'</h4><p>Guile '+a.guile+' · Loyalty '+a.loyalty+' · Cover '+a.cover+' ('+esc(a.coverLabel)+') · '+a.missions+' missions · '+a.successes+' successes</p></div><button data-command="spy-dismiss" data-value="'+esc(a.id)+'">DISMISS</button></header><div class="spy-agent-target"><small>'+esc(a.targetLabel)+'</small><strong>'+(a.successRate>0?a.successRate+'% SUCCESS':"NO FIELD MISSION")+'</strong></div><div class="command-inline"><select id="spy-desk-'+esc(a.id)+'" aria-label="Choose a desk for '+esc(a.name)+'">'+deskOptions+'</select><select id="spy-target-'+esc(a.id)+'" aria-label="Choose a target for '+esc(a.name)+'">'+targetOptions+'</select><button data-command="spy-assign" data-value="'+esc(a.id)+'">ASSIGN</button></div><p class="command-note">Foreign and noble desks need a named target. Market, watch and counter-intelligence work the realm itself.</p></article>';
 }).join(""):'<p class="command-note">No agents serve yet. Recruit a resident below; every agent costs '+s.recruitCost.gold+' gold and draws '+s.wages+' gold a year in wages.</p>';
 const candidateOptions=s.candidates.map(c=>'<option value="'+esc(c.personId)+'">'+esc(c.name)+' · '+esc(c.job)+' · age '+c.age+' · guile '+c.guile+'</option>').join("");
 const canRecruit=s.agentCount<s.capacity&&s.candidates.length>0&&gold>=s.recruitCost.gold;
 const reports=s.reports.length?s.reports.map(report=>'<div class="spy-report"><span>YEAR '+report.year+' · '+esc(ESPIONAGE_DESK_LABELS[report.desk]||"COURT")+' · '+esc(String(report.kind).toUpperCase())+'</span><strong>'+esc(report.targetName||"Intelligence report")+'</strong><small>'+esc(report.detail)+'</small></div>').join(""):'<p class="command-note">No reports yet. The first missions resolve at the next annual audit.</p>';
 const playNote=(key,pool,cost,target)=>s.plays[key]>=s.year?'Used this year; available again next year.':s[pool]<cost?'Need '+(cost-s[pool])+' more '+pool.replace('Insight',' insight').toLowerCase()+'.':!target?'No eligible target.':'';
 const lastPlayLine=play=>play?'Last: year '+play.year+' · '+esc(play.detail):'No play has been made yet.';
 const warnOptions=s.warnCandidates.length?s.warnCandidates.map(house=>'<option value="'+esc(house.id)+'">'+esc(house.familyName)+' · loyalty '+house.loyalty+(house.feudSeverity?' · feud '+house.feudSeverity:'')+'</option>').join(""):'<option value="">No threatened houses</option>';
 const concessionOptions=s.realms.map(realm=>'<option value="'+esc(realm.id)+'">'+esc(realm.name)+'</option>').join("");
 const playCards='<article class="spy-agent spy-play"><header><div><span class="command-ribbon">NOBLE DESK</span><h4>WARN A THREATENED HOUSE</h4><p>'+s.costs.warnHouse+' noble insight · once a year</p></div></header><p class="command-note">Raises the chosen house\'s loyalty by 6 and eases its worst active feud by one step. A house below 75 loyalty or already in a feud can be warned.</p><div class="command-inline"><select id="spy-warn-house" aria-label="Choose a house to warn">'+warnOptions+'</select><button data-command="spy-warn" '+(s.canWarn?'':'disabled')+'>WARN · '+s.costs.warnHouse+' NOBLE</button></div><small class="spy-play-note">'+esc(playNote("warnHouse","nobleInsight",s.costs.warnHouse,s.warnCandidates.length))+'</small><small class="spy-play-last">'+lastPlayLine(s.lastPlays.warnHouse)+'</small></article>'+
  '<article class="spy-agent spy-play"><header><div><span class="command-ribbon">FOREIGN DESK</span><h4>DEMAND A CONCESSION</h4><p>'+s.costs.concession+' foreign insight · once a year</p></div></header><p class="command-note">Takes gold and food from the realm\'s existing trade treasury and stock. The realm resents it: relation falls 4 and fear rises 3.</p><div class="command-inline"><select id="spy-concession-realm" aria-label="Choose a realm to demand from">'+concessionOptions+'</select><button data-command="spy-concession" '+(s.canConcession?'':'disabled')+'>DEMAND · '+s.costs.concession+' FOREIGN</button></div><small class="spy-play-note">'+esc(playNote("concession","foreignInsight",s.costs.concession,s.realms.length))+'</small><small class="spy-play-last">'+lastPlayLine(s.lastPlays.concession)+'</small></article>'+
  '<article class="spy-agent spy-play"><header><div><span class="command-ribbon">MARKET DESK</span><h4>PLANT A FALSE TRAIL</h4><p>'+s.costs.falseTrail+' market insight · once a year</p></div></header><p class="command-note">Cuts rival pressure by '+18+', reduces suspicion by 4, and gives every mission in next year\'s audit +8% success odds.</p><div class="command-inline"><button data-command="spy-false-trail" '+(s.canFalseTrail?'':'disabled')+'>PLANT TRAIL · '+s.costs.falseTrail+' MARKET</button><strong>'+(s.missionBonusActive?'NEXT AUDIT +'+Math.round(s.missionBonus*100)+'% ODDS':'NO TRAIL ACTIVE')+'</strong></div><small class="spy-play-note">'+esc(playNote("falseTrail","marketInsight",s.costs.falseTrail,true))+'</small><small class="spy-play-last">'+lastPlayLine(s.lastPlays.falseTrail)+'</small></article>';
 const history=s.history.length?'<div class="spy-history">'+s.history.map(entry=>'<div><span>YEAR '+entry.year+'</span><strong>'+entry.successes+' / '+entry.missions+' MISSIONS · '+entry.seizedGold+' GOLD SEIZED</strong><small>Agents '+entry.agents+' paid '+entry.paid+' · suspicion '+entry.suspicion+' · foreign insight '+entry.foreignInsight+' · market '+entry.marketInsight+' · nobles '+entry.nobleInsight+'</small></div>').join("")+'</div>':'<p class="command-note">No annual intelligence audit has been recorded.</p>';
 return intro("THE WHISPER COURT","Shadow network","Recruit living residents, set them to a desk and let the annual audit turn their work into warning, leverage and quiet influence. Every mission is bounded to the roster, and every report says who paid for it.")+
 '<div class="command-summary"><div><small>AGENTS</small><strong>'+s.agentCount+' / '+s.capacity+'</strong></div><div><small>YEARLY WAGES</small><strong>'+s.annualWages+' G</strong></div><div><small>SUSPICION</small><strong>'+s.suspicion+' · '+esc(s.suspicionLabel)+'</strong></div><div><small>RIVAL PRESSURE</small><strong>'+s.rivalPressure+' / 100</strong></div><div><small>FOREIGN INSIGHT</small><strong>'+s.foreignInsight+' / 100</strong></div><div><small>MARKET INSIGHT</small><strong>'+s.marketInsight+' / 100</strong></div><div><small>NOBLE INSIGHT</small><strong>'+s.nobleInsight+' / 100</strong></div></div>'+
 '<div class="command-section-title">WHAT THE COURT CHANGES</div><div class="command-summary"><div><small>RAID WARNING</small><strong>'+(s.effects.raidReductionPercent>0?'−'+s.effects.raidReductionPercent+'% RAID DAMAGE':'0%')+'</strong></div><div><small>MARKET TERMS</small><strong>'+(s.effects.marketTermPercent>0?'+'+s.effects.marketTermPercent+'% TRADE':'0%')+'</strong></div><div><small>PLOTS EXPOSED</small><strong>'+s.totals.plotsExposed+'</strong></div><div><small>STREET CALM</small><strong>'+(s.moraleBonus>0?'+'+s.moraleBonus+' MORALE':'0')+'</strong></div><div><small>NEXT AUDIT</small><strong>'+(s.missionBonusActive?'+'+Math.round(s.missionBonus*100)+'% MISSION ODDS':'—')+'</strong></div></div><p class="command-note">Foreign insight warns the garrison, lowering raid damage. Market insight improves the terms the crown gets when it buys and sells. A noble report can expose a plot and return a wavering house to the crown\'s peace. Watch reports calm the streets.</p>'+
 '<div class="command-section-title">ACTIONABLE INTELLIGENCE · SPEND WHAT THE DESKS BRING HOME</div><div class="spy-agent-list">'+playCards+'</div>'+ '<p class="command-note">Each play spends one insight pool and can be used once a year. Warning a house feeds noble loyalty and feud risk; a concession moves real gold and food out of a realm\'s trade treasury; a false trail buys down rival pressure and improves the next annual missions. The last result of each play stays on its card.</p>'+ '<div class="command-section-title">AGENT ROSTER · '+s.agentCount+' / '+s.capacity+'</div><div class="spy-agent-list">'+agentCards+'</div>'+
 '<div class="command-section-title">RECRUIT FROM THE REALM · '+s.recruitCost.gold+' GOLD · '+s.wages+' GOLD A YEAR</div><div class="command-inline"><select id="spy-recruit-select" aria-label="Choose a resident to recruit"><option value="">Choose an adult resident…</option>'+candidateOptions+'</select><button data-command="spy-recruit" '+(canRecruit?'':'disabled')+'>RECRUIT AGENT</button></div><p class="command-note">'+(s.agentCount>=s.capacity?'The court is full; dismiss an agent before recruiting another.':s.candidates.length?'Recruits are drawn from living adults. Their learning, trade and command skills become guile.':'No free adult residents are available; the register must grow first.')+'</p>'+
 '<div class="command-section-title">LATEST REPORTS</div><div class="spy-report-list">'+reports+'</div>'+
 '<div class="command-section-title">SUSPICION · '+s.suspicion+' / 100 · '+esc(s.suspicionLabel)+'</div><p class="command-note">'+(s.suspicion>=50?'Foreign courts are watching. A failed mission can now cost the agent and trigger a diplomatic incident. Counter-intelligence agents lower the risk.':'The court is still quiet. Each field mission adds suspicion; counter-intelligence agents reduce it before missions resolve.')+'</p>'+
 '<div class="command-section-title">RIVAL COUNTER-INTELLIGENCE · PRESSURE '+s.rivalPressure+' / 100</div><div class="command-summary"><div><small>RIVAL PRESSURE</small><strong>'+s.rivalPressure+' / 100</strong></div><div><small>TURNED LAST SCREEN</small><strong>'+(s.lastScreen?s.lastScreen.revealed:0)+'</strong></div><div><small>FALSE REPORTS</small><strong>'+s.totals.falseReports+'</strong></div><div><small>GOLD LEAKED</small><strong>'+s.totals.goldLost+' G</strong></div><div><small>SCREENING COST</small><strong>'+s.screenCost+' G</strong></div></div><div class="health-medicine-actions"><button data-command="spy-screen" '+(s.canScreen?'':'disabled')+'>SCREEN THE COURT · '+s.screenCost+' GOLD</button></div><p class="command-note">'+(s.lastScreen?(s.lastScreen.clean?'The last screening found no turned agents; a clean court is not a guarantee.':'The last screening unmasked '+s.lastScreen.revealed+' turned agent'+(s.lastScreen.revealed===1?'':'s')+' and turned them back.'):'No screening has been ordered yet.')+' Rival pressure builds from active missions and suspicion. A turned agent keeps reporting, but sends false reports and leaks gold until the court is screened. Counter-intelligence agents lower the pressure and the odds of turning. Screening can be ordered once a year.'+(s.screenedYear&&s.screenedYear>=s.year?' The court has already been screened this year.':'')+'</p>'+
 '<div class="command-section-title">AGENT COVER</div><p class="command-note">Cover grows with successful missions and falls after failures. Thin cover signals an agent under pressure; a report that cannot be corroborated is the other warning. Screening is the only certain cure.</p>'+
 '<div class="command-section-title">ANNUAL INTELLIGENCE AUDIT</div>'+history+'<p class="command-note">Once a year the court pays every wage, resolves one mission per field agent and fades 12% of unused insight. Nothing here runs per frame or per tick.</p>';
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
 '<div class="command-summary"><div><small>POINTS / YEAR</small><strong>'+amount(r.pointsPerYear)+'</strong></div><div><small>RESERVE</small><strong>'+amount(r.reserve)+'</strong></div><div><small>COMPLETED</small><strong>'+m.completedCount+' / '+r.techs.length+'</strong></div><div><small>SCHOLARS</small><strong>'+r.scholars.length+' / '+r.capacity+'</strong></div><div><small>FUNDING</small><strong>'+esc(r.fundingDetails.label.toUpperCase())+'</strong></div><div><small>ACTIVE PROJECT</small><strong>'+esc(r.activeTechDetails?r.activeTechDetails.label:"NONE")+'</strong></div></div>'+
 '<div class="command-section-title">ACTIVE PROJECT</div>'+(r.activeTechDetails?'<div class="command-summary"><div><small>PROJECT</small><strong>'+esc(r.activeTechDetails.label)+'</strong></div><div><small>PROGRESS</small><strong>'+amount(r.progress)+' / '+r.activeTechDetails.cost+'</strong></div><div><small>REMAINING</small><strong>'+amount(Math.max(0,r.activeTechDetails.cost-r.progress))+'</strong></div></div>':'<p class="command-note">No project is active. An unspent reserve carries forward; choose a technology below to begin.</p>')+
 '<div class="command-section-title">LIVE EFFECTS</div><div class="court-effect-grid"><span>TAX YIELD<b>×'+amount(m.taxEfficiency)+'</b></span><span>TRADE TERMS<b>×'+amount(m.tradeFactor)+'</b></span><span>HOUSEHOLD FOOD DEMAND<b>×'+amount(m.foodDemandFactor)+'</b></span><span>MORTALITY RELIEF<b>×'+amount(m.mortalityRelief)+'</b></span><span>CONSTRUCTION DISCOUNT<b>'+Math.round(m.buildDiscount*100)+'%</b></span><span>SOLDIER POWER<b>×'+amount(m.militaryBonus)+'</b></span><span>RESEARCH RATE<b>×'+amount(m.researchSpeed)+'</b></span><span>ANNUAL LEGITIMACY<b>'+amount(m.legitimacyYear)+'</b></span></div>'+
 '<div class="command-section-title">NAMED SCHOLARS · '+r.scholars.length+' / '+r.capacity+'</div><div class="court-office-grid">'+scholars+'</div><div class="command-inline"><select id="research-scholar-select" aria-label="Choose a resident to appoint as scholar"><option value="">Choose an adult resident…</option>'+candidates+'</select><button data-command="research-appoint"'+((r.scholars.length>=r.capacity||gold<12||!candidates)?" disabled":"")+'>APPOINT · 12G</button></div><p class="command-note">A scholar leaves any other office before taking a research post. Salaries of 5 gold per scholar are paid at the annual audit; unpaid salaries reduce that year\'s output.</p>'+
 '<div class="command-section-title">ANNUAL FUNDING</div><div class="command-choice-grid">'+funding+'</div>'+
 '<div class="command-section-title">TECHNOLOGY TREE · '+m.completedCount+' / '+r.techs.length+' COMPLETE</div>'+techs+
 (r.lastAudit?'<div class="command-section-title">LAST ANNUAL AUDIT</div><p class="command-note">Year '+r.lastAudit.year+' · '+r.lastAudit.points+' points · speed ×'+r.lastAudit.speed+' · '+r.lastAudit.scholars+' scholars · '+r.lastAudit.salariesPaid+' gold salaries · '+r.lastAudit.fundingPaid+' gold funding'+(r.lastAudit.completed?' · completed '+esc(r.lastAudit.completed):"")+'.</p>':'<p class="command-note">No annual research audit has been completed yet.</p>');
}
const CRIME_CAUSE_LABELS=Object.freeze({inequality:"inequality",hunger:"hunger",war:"war",quarantine:"quarantine",unemployment:"unemployment"});
function city(){return renderCityPanel();}
function cancelTimelineRefresh(){
 if(timelineRefreshFrame){cancelAnimationFrame(timelineRefreshFrame);timelineRefreshFrame=0;}
 timelineHydrationToken++;
 chronicleProgressToken++;
}
function clearFrameWork(){
 if(frameWorkFrame){cancelAnimationFrame(frameWorkFrame);frameWorkFrame=0;}
 frameWorkQueue=[];
 frameWorkPerFrame=1;
}
let frameWorkPerFrame=1;
function runFrameWork(){
 frameWorkFrame=0;
 const started=performance.now();
 let completed=0;
 while(frameWorkQueue.length&&completed<frameWorkPerFrame&&performance.now()-started<FRAME_WORK_BUDGET){
  const work=frameWorkQueue.shift();
  try{work();}catch(error){console.error(error);}
  completed++;
 }
 const elapsed=performance.now()-started;
 if(elapsed>FRAME_WORK_BUDGET)frameWorkPerFrame=1;
 else if(elapsed<FRAME_WORK_BUDGET/2)frameWorkPerFrame=Math.min(4,frameWorkPerFrame+1);
 else frameWorkPerFrame=Math.max(1,frameWorkPerFrame-1);
 if(frameWorkQueue.length)frameWorkFrame=requestAnimationFrame(runFrameWork);
}
function enqueueFrameWork(work){
 frameWorkQueue.push(work);
 if(!frameWorkFrame)frameWorkFrame=requestAnimationFrame(runFrameWork);
}
function enqueueShallowNode(node,parent,stillValid){
 if(node.nodeType===3){
  if(!node.nodeValue.trim())return;
  const text=node.cloneNode(true);
  enqueueFrameWork(()=>{if(stillValid()&&parent.isConnected)parent.appendChild(text);});
  return;
 }
 if(node.nodeType!==1)return;
 const shell=node.cloneNode(false);
 enqueueFrameWork(()=>{if(stillValid()&&parent.isConnected)parent.appendChild(shell);});
 for(const child of [...node.childNodes])enqueueShallowNode(child,shell,stillValid);
}
function startProgressiveTimeline(){
 cancelTimelineRefresh();
 const panel=$("command-panel-content");
 const slot=panel?.querySelector("[data-chronicle-timeline-slot]");
 if(!slot)return false;
 const token=chronicleProgressToken;
 enqueueFrameWork(()=>{
  if(token!==chronicleProgressToken||!slot.isConnected)return;
  const {attributes,chunks}=renderLivingTimelineChunks({cardLimit:TIMELINE_INITIAL_CARDS});
  const section=document.createElement("section");
  for(const [name,value] of attributes)section.setAttribute(name,value);
  slot.replaceChildren(section);
  chunks.forEach((build,index)=>{
   enqueueFrameWork(()=>{
    if(token!==chronicleProgressToken||!section.isConnected)return;
    const template=document.createElement("template");
    template.innerHTML=build();
    for(const child of [...template.content.childNodes])enqueueShallowNode(child,section,()=>token===chronicleProgressToken);
    if(index===chunks.length-1)enqueueFrameWork(()=>{
     if(token!==chronicleProgressToken||!section.isConnected)return;
     scheduleTimelineHydration();
     startProgressiveSections();
    });
   });
  });
 });
 return true;
}
function startProgressiveSections(){
 const slot=$("command-panel-content")?.querySelector("[data-chronicle-sections-slot]");
 if(!slot||slot.dataset.progressiveStarted)return false;
 slot.dataset.progressiveStarted="1";
 const token=++chronicleSectionsToken;
 const chunks=chronicleSectionsChunks();
 chunks.forEach((chunk,index)=>enqueueFrameWork(()=>{
  if(token!==chronicleSectionsToken||!slot.isConnected)return;
  const template=document.createElement("template");
  template.innerHTML=chunk;
  for(const child of [...template.content.childNodes])enqueueShallowNode(child,slot,()=>token===chronicleSectionsToken);
 }));
 return true;
}
function scheduleTimelineHydration(){
 cancelTimelineRefresh();
 const token=timelineHydrationToken;
 let batchSize=1;
 const step=()=>{
  if(token!==timelineHydrationToken)return;
  const current=$("command-panel-content")?.querySelector(".living-timeline");
  if(!current)return;
  const total=Math.min(MAX_VISIBLE_TIMELINE_CARDS,Number(current.dataset.timelineVisible)||0);
  const events=current.querySelector(".timeline-events");
  if(!events)return;
  const rendered=events.querySelectorAll("[data-timeline-event]").length;
  if(rendered>=total)return;
  const started=performance.now();
  const end=Math.min(total,rendered+batchSize);
  const holder=document.createElement("template");
  holder.innerHTML=renderTimelineCardBatch(rendered,end);
  const note=events.querySelector(":scope > .command-note");
  const loading=events.querySelector(":scope > .timeline-loading");
  while(holder.content.firstChild)events.insertBefore(holder.content.firstChild,note||loading||null);
  if(loading)loading.remove();
  current.dataset.timelineRendered=String(end);
  const elapsed=performance.now()-started;
  if(elapsed>FRAME_WORK_BUDGET)batchSize=Math.max(1,Math.floor(batchSize/2));
  else if(elapsed<FRAME_WORK_BUDGET/2)batchSize=Math.min(2,batchSize+1);
  if(end<total)requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
}
function timelineChunkElement(chunks,index){
 const template=document.createElement("template");
 template.innerHTML=chunks[index]();
 return template.content.firstElementChild;
}
function applyTimelineRootAttributes(current,attributes){
 for(const [name,value] of attributes)if(name!=="class")current.setAttribute(name,value);
}
function refreshTimeline(preserveScroll=false){
 cancelTimelineRefresh();
 chronicleProgressToken++;
 const current=$("command-panel-content")?.querySelector(".living-timeline");
 if(!current)return false;
 const {attributes,chunks}=renderLivingTimelineChunks({cardLimit:0});
 const nextSummary=timelineChunkElement(chunks,1);
 const nextNavigation=timelineChunkElement(chunks,2);
 const nextScrubber=timelineChunkElement(chunks,3);
 const nextToolbar=timelineChunkElement(chunks,4);
 const nextLayout=timelineChunkElement(chunks,5);
 const nextNote=timelineChunkElement(chunks,6);
 if(!nextSummary||!nextNavigation||!nextScrubber||!nextToolbar||!nextLayout||!nextNote)return false;
 const previousEvents=current.querySelector(".timeline-events");
 const scrollTop=preserveScroll?(previousEvents?.scrollTop||0):0;
 current.querySelector(".timeline-summary")?.replaceWith(nextSummary);
 current.querySelector(".timeline-navigation")?.replaceWith(nextNavigation);
 current.querySelector(".timeline-scrubber")?.replaceWith(nextScrubber);
 current.querySelector(".timeline-toolbar")?.replaceWith(nextToolbar);
 current.querySelector(".timeline-layout")?.replaceWith(nextLayout);
 current.querySelector(".timeline-note")?.replaceWith(nextNote);
 nextLayout.querySelector(".timeline-events").scrollTop=scrollTop;
 applyTimelineRootAttributes(current,attributes);
 scheduleTimelineHydration();
 return true;
}
function refreshTimelineResults(preserveScroll=false){
 cancelTimelineRefresh();
 chronicleProgressToken++;
 const current=$("command-panel-content")?.querySelector(".living-timeline");
 if(!current)return false;
 const {attributes,chunks}=renderLivingTimelineChunks({cardLimit:0});
 const nextSummary=timelineChunkElement(chunks,1);
 const nextToolbar=timelineChunkElement(chunks,4);
 const nextLayout=timelineChunkElement(chunks,5);
 if(!nextSummary||!nextToolbar||!nextLayout)return false;
 const currentEvents=current.querySelector(".timeline-events");
 const nextEvents=nextLayout.querySelector(".timeline-events");
 const scrollTop=preserveScroll?(currentEvents?.scrollTop||0):0;
 if(currentEvents&&nextEvents){currentEvents.replaceChildren(...nextEvents.childNodes);currentEvents.scrollTop=scrollTop;}
 current.querySelector(".timeline-summary")?.replaceWith(nextSummary);
 current.querySelectorAll("[data-timeline-year]").forEach(button=>{
  const selected=button.dataset.timelineYear===String(getTimelineView().year||"");
  button.classList.toggle("is-current",selected);
  if(selected)button.setAttribute("aria-current","date");else button.removeAttribute("aria-current");
 });
 const currentLive=current.querySelector("[data-timeline-live]");
 const nextLive=nextToolbar.querySelector("[data-timeline-live]");
 if(currentLive&&nextLive)currentLive.disabled=nextLive.disabled;
 applyTimelineRootAttributes(current,attributes);
 scheduleTimelineHydration();
 return true;
}
function refreshTimelineDetail(){
 const current=$("command-panel-content")?.querySelector(".living-timeline");
 if(!current)return false;
 const selectedId=getTimelineView().selectedId;
 const currentDetail=current.querySelector(".timeline-detail");
 const holder=document.createElement("template");
 holder.innerHTML=renderTimelineDetailCard();
 const incoming=holder.content.firstElementChild;
 const token=++detailRefreshToken;
 if(currentDetail&&incoming){
  currentDetail.className=incoming.className;
  for(const attribute of [...incoming.attributes])currentDetail.setAttribute(attribute.name,attribute.value);
  currentDetail.replaceChildren();
  for(const child of [...incoming.childNodes])enqueueShallowNode(child,currentDetail,()=>token===detailRefreshToken&&currentDetail.isConnected);
 }else if(incoming)currentDetail?.replaceWith(incoming);
 current.querySelector("[data-timeline-event].is-selected")?.classList.remove("is-selected");
 if(selectedId)current.querySelector('[data-timeline-event="'+selectedId+'"]')?.classList.add("is-selected");
 return true;
}
function scheduleTimelineResultsRefresh(){
 if(timelineRefreshFrame)return;
 timelineRefreshFrame=requestAnimationFrame(()=>{timelineRefreshFrame=0;refreshTimelineResults();});
}
// A biome action re-renders the panel with fresh values. Preserve the player's
// open region, expanded 66-row ledger, scroll position and keyboard focus so
// the update never throws them back into the closed region list.
function captureBiomePanelState(panel){
 if(!panel)return null;
 const openRegions=[];
 const openLedgers=[];
 panel.querySelectorAll("[data-biome-region]").forEach(node=>{
  if(!node.open)return;
  const id=node.dataset.biomeRegion;
  openRegions.push(id);
  if(node.querySelector(".biome-system-ledger[open]"))openLedgers.push(id);
 });
 const active=document.activeElement;
 const focus=active&&panel.contains(active)&&active.dataset?.command
  ?{command:active.dataset.command,value:active.dataset.value||null}:null;
 return {openRegions,openLedgers,scrollTop:panel.scrollTop,focus};
}
function restoreBiomePanelState(panel,saved){
 if(!panel||!saved)return;
 panel.querySelectorAll("[data-biome-region]").forEach(node=>{
  const id=node.dataset.biomeRegion;
  node.open=saved.openRegions.includes(id);
  const ledger=node.querySelector(".biome-system-ledger");
  if(ledger)ledger.open=saved.openLedgers.includes(id);
 });
 panel.scrollTop=saved.scrollTop;
 if(saved.focus){
  const selector='[data-biome-region] [data-command="'+saved.focus.command+'"]'+(saved.focus.value?'[data-value="'+saved.focus.value+'"]':"");
  const next=panel.querySelector(selector);
  next?.focus({preventScroll:true});
 }
}
// Every successful command rebuilds the panel. Keep the activated control's
// identity so a keyboard player never lands on <body> after Repair All,
// Repair Building or a timber sale. Nothing here runs without a real action.
function captureCommandFocus(button){
 if(!button||!button.dataset?.command)return null;
 return {command:button.dataset.command,value:button.dataset.value||null,order:button.dataset.order||null};
}
function restoreCommandFocus(saved){
 if(!saved||$("command-modal")?.classList.contains("hidden"))return false;
 const panel=$("command-panel-content");if(!panel)return false;
 const nodes=[...panel.querySelectorAll("[data-command]")].filter(node=>!node.disabled);
 const exact=nodes.find(node=>node.dataset.command===saved.command&&(node.dataset.value||null)===saved.value&&(node.dataset.order||null)===saved.order);
 const same=nodes.find(node=>node.dataset.command===saved.command);
 const fallback=nodes.find(node=>node.dataset.command==="repair-all")||$("command-close");
 const target=exact||same||fallback;
 if(!target)return false;
 target.focus({preventScroll:true});
 return true;
}
function render(resetScroll=false){
 commandOpenRenderToken++;
 clearFrameWork();
 lowEndRevealQueue=[];
 if(lowEndRevealFrame){cancelAnimationFrame(lowEndRevealFrame);lowEndRevealFrame=0;}
 frameWorkPerFrame=1;
 chronicleSectionsToken++;
 cancelTimelineRefresh();
 const panel=$("command-panel-content");if(!panel)return;
 panel.dataset.renderSeq=String(++panelRenderSeq);
 // A previous tab may still be hydrating across frames. Cancel it before the
 // incoming renderer replaces the panel, otherwise late chunks can append the
 // old ledger over the newly selected tab (most visible when returning to the
 // Lexicon from a large management view).
 cancelProgressiveRender(panel);
 // Split style/layout from paint when a tab changes on a narrow screen. The
 // incoming panel is laid out while visibility:hidden, then revealed on the
 // next task. Both halves stay well below the long-task threshold at 6x CPU,
 // instead of one task carrying layout, paint and compositor commit together.
 const splitPanelPaint=resetScroll&&narrowViewport();
 const revealToken=++panelRevealToken;
 if(splitPanelPaint)panel.style.visibility="hidden";
 // A second render can arrive before the split-paint reveal (opening the
 // panel and selecting its tab). That render owns the new token and must not
 // inherit the previous frame's hidden state; otherwise the whole atlas stays
 // invisible even though its sixty cards are in the DOM.
 else panel.style.visibility="";
 const renderers={kingdom,government,politics,nobility:nobilityPanel,diplomacy,worldmap:renderWorldMapPanel,espionage:espionagePanel,decisions,cards,economy,resources,buildings,city,military,health:healthPanel,faith:faithPanel,justice:justicePanel,research:researchPanel,endeavours:()=>renderEndeavoursPanel(endeavourFunding),population:renderPopulationPanel,dynasty,creatures,biome:renderBiomePanel,forest:renderForestAtlasPanel,hazards:renderHazardPanel,chronicle,atelier:renderAiChroniclePanel,explore:renderExpeditionsPanel};
 // A new tab starts at its title, not at the scroll offset of the previous
 // panel. Reset the old, already-laid-out view before inserting the new DOM:
 // assigning scrollTop after innerHTML forces a synchronous layout of the
 // entire incoming panel on the click task.
 let progressiveDynasty=false;
 const biomePanelState=activePanel==="biome"&&!resetScroll?captureBiomePanelState(panel):null;
 if(activePanel==="items")renderItemLexicon(panel);
 else {
  // Opening a ledger on a mature realm used to insert the whole archive in
  // one click task. The markup itself is small; font, style and layout for
  // hundreds of rows were the 60-170 ms task. Reuse the existing chunked
  // renderer for every opened tab, not only phones. Chronicle already owns a
  // timeline hydrator and needs its slots synchronously.
  const __t0=performance.now();
  const markup=(renderers[activePanel]||kingdom)();
  window.__panelTiming={panel:activePanel,renderMs:Math.round((performance.now()-__t0)*10)/10};
  // Every phone panel is hydrated progressively. On desktop, the heavy
  // ledgers named above use the same scheduler: one full innerHTML insertion
  // spent 52-75 ms in style and layout on a 4x-throttled renderer. The parse
  // and mount tasks stay inside the existing 4 ms frame budget, so the panel
  // still fills in a few frames without blocking the click or the game loop.
  if(resetScroll&&activePanel!=="chronicle"&&(narrowViewport()||STAGED_OPEN_PANELS.has(activePanel))){
   progressiveDynasty=false;
   // Building a mature ledger and parsing it in one frame left a 50-57 ms
   // task at 4x CPU throttle. Let the markup generation settle in this task;
   // parse and mount the first chunk in the next one.
   const mountToken=revealToken;
   // A desktop record card now mounts atomically, so it must also be the only
   // card in its animation frame: appending two or three whole houses or
   // neighbouring courts in one task still forced a 55-60 ms style/layout pass
   // at 4x CPU. Phones keep their existing chunk size; their cards are already
   // narrower and their hydration is bounded by the same 4 ms frame budget.
   // The population register is mostly small chunks; batch them up to the
   // scheduler's 4 ms budget. The larger noble houses and neighbouring courts
   // still mount two chunks at a time: eight let two whole cards land in one
   // task and produced a 54-69 ms long task at 4x CPU. Phones keep their
   // existing smaller count-based slices.
   const nodesPerFrame=narrowViewport()?(activePanel==="nobility"?3:2):4;
   const cardsPerFrame=narrowViewport()?Infinity:(activePanel==="population"?4:(activePanel==="nobility"?1:2));
   requestAnimationFrame(()=>{
    if(mountToken!==panelRevealToken)return;
    renderProgressive(panel,markup,{resetScroll,nodesPerFrame,cardsPerFrame,immediate:narrowViewport()?1:0,onDone:()=>{
     if(activePanel==="dynasty")requestAnimationFrame(drawDynastyConnectors);
    }});
   });
  }else {
   panel.innerHTML=markup;
   if(biomePanelState)restoreBiomePanelState(panel,biomePanelState);
   if(resetScroll)requestAnimationFrame(()=>{if(panel.isConnected)panel.scrollTop=0;});
  }
 }
 if(activePanel==="dynasty"&&!narrowViewport())requestAnimationFrame(drawDynastyConnectors);
 if(activePanel==="chronicle")startProgressiveTimeline();
 const syncTabState=()=>{
  document.querySelectorAll("[data-command-tab]").forEach(b=>{
   const active=b.dataset.commandTab===activePanel;
   if(!narrowViewport()&&b.classList.contains("is-active")!==active)b.classList.toggle("is-active",active);
   if(b.getAttribute("aria-selected")!==String(active))b.setAttribute("aria-selected",String(active));
   const tabIndex=active?0:-1;
   if(b.tabIndex!==tabIndex)b.tabIndex=tabIndex;
   if(active){if(b.getAttribute("aria-current")!=="page")b.setAttribute("aria-current","page");}
   else if(b.hasAttribute("aria-current"))b.removeAttribute("aria-current");
  });
  const activeTab=document.querySelector('[data-command-tab="'+activePanel+'"]');
  const activePanelEl=$("command-panel-content");
  if(activePanelEl&&activeTab&&activePanelEl.getAttribute("aria-labelledby")!==activeTab.id)activePanelEl.setAttribute("aria-labelledby",activeTab.id);
  const tabSelect=$("command-tab-select");
  if(tabSelect&&tabSelect.value!==activePanel)tabSelect.value=activePanel;
  setNavigationActive(activePanel);
 };
 if(resetScroll)requestAnimationFrame(syncTabState);
 else syncTabState();
 // Compact narrow renderers already cap rows or fold heavy sections, so a
 // second IntersectionObserver reveal pass only adds per-frame class writes.
 if(splitPanelPaint){
  requestAnimationFrame(()=>{
   if(revealToken!==panelRevealToken)return;
   panel.getBoundingClientRect();
   setTimeout(()=>{if(revealToken===panelRevealToken)panel.style.visibility="";},0);
  });
 }
}
function act(b){ const a=b.dataset.command,v=b.dataset.value;let r={ok:false,reason:"unknown-action"}; const focus=captureCommandFocus(b);

 if(a==="realm-cycle")r=resolveRealmCyclePetition(v);
 else if(a==="noble-charter")r=grantNobleCharter(v);
 else if(a==="noble-levy")r=callNobleLevy(v);
 else if(a==="noble-host-order")r=orderNobleHost(v,b.dataset.order);
 else if(a==="noble-feud-mediate")r=mediateFeud(v);
 else if(a==="noble-feud-arbitrate")r=arbitrateFeud(v);
 else if(a==="noble-feud-settle")r=settleFeudWithTerms(v,b.dataset.terms);
 else if(a==="noble-feud-inflame")r=inflameFeud(v);
 else if(a==="noble-feud-ignore")r=ignoreFeud(v);
 else if(a==="campaign-aim")r=aimCampaign({aim:v,theatre:$("campaign-theatre-"+v)?.value,houseId:$("campaign-house-"+v)?.value||null});
 else if(a==="campaign-commit")r=commitCampaign(v);
 else if(a==="campaign-settle")r=settleReadyCampaigns();
 else if(a==="special-biome-attune")r=attuneSpecialBiome(v);
 else if(a==="special-biome-cleanse")r=cleanseSpecialBiome(v);
 else if(a==="special-biome-quest")r=resolveBiomeQuest(v,b.dataset.choice);
 else if(a==="special-biome-quest-followup")r=resolveBiomeQuestFollowUp(v,b.dataset.choice);
 else if(a==="special-blight-choice")r=resolveBlightDecision(v);
 else if(a==="special-good-sell")r=sellSpecialGood(v);
 else if(a==="timber-sell")r=sellRegionalTimber(v);
 else if(a==="repair-building")r=repairBuilding(v);
 else if(a==="repair-all")r=repairAllDamaged();
 else if(a==="manual-order"){
  const building=state.entities.find(item=>!item.dead&&String(item.id)===String(v));
  r=building?placeManualOrder(building,b.dataset.manualOrder,b.dataset.good,Number(b.dataset.quantity)):{ok:false,reason:"building-not-found"};
 }
 else if(a==="hazard-prepare")r=prepareForHazardSeason();
 else if(a==="hazard-treat")r=treatHazardCasualties();
 else if(a==="hazard-cleanse")r=cleanseHazardCorruption();
 else if(a==="hazard-overlay"){state.hazardOverlay=!state.hazardOverlay;r={ok:true,message:state.hazardOverlay?"hazard map shown":"hazard map hidden"};}
 else if(a==="hazard-quarantine")r=setHazardQuarantine(true);
 else if(a==="hazard-quarantine-lift")r=setHazardQuarantine(false);
 else if(a==="hazard-request-aid")r=requestHazardAid();
 else if(a==="hazard-insure")r=fundHazardInsurance();
 else if(a==="hazard-loan")r=takeHazardLoan();
 else if(a==="hazard-resettle")r=resettleHazardGround();
 else if(a==="hazard-aid")r=sendHazardAid(v);
 else if(a==="hazard-treat-disease")r=treatHazardDisease(v);
 else if(a.startsWith("hazard-plan-"))r=chooseHazardPlan(a.slice("hazard-plan-".length));
 else if(a.startsWith("hazard-crew-"))r=trainHazardCrew(a.slice("hazard-crew-".length));
 else if(a.startsWith("hazard-rare-"))r=chooseRareEvent(a.slice("hazard-rare-".length));
 else if(a==="biome-survey")r=surveyBiomeRegion(v);
 else if(a==="biome-harvest")r=harvestBiomeResource(v,b.dataset.biomeResource);
 else if(a==="biome-hunt")r=huntBiomeSpecies(v,b.dataset.biomeSpecies);
 else if(a==="biome-reintroduce")r=reintroduceBiomeSpecies(v,b.dataset.biomeSpecies);
 else if(a==="biome-restore")r=restoreBiomeRegion(v);
 else if(a==="biome-irrigate")r=irrigateBiomeRegion(v);
 else if(a==="biome-drain")r=drainBiomeRegion(v);
 else if(a==="biome-reforest")r=reforestBiomeRegion(v);
 else if(a==="biome-clean-water")r=cleanBiomeWater(v);
 else if(a==="biome-slash-burn")r=slashAndBurnBiomeRegion(v);
 else if(a==="biome-protect")r=setBiomeProtection(v,b.dataset.biomeProtected!=="0");
 else if(a==="biome-policy")r=setBiomePolicy(v,b.dataset.biomePolicy);
 else if(a==="biome-focus")r=setBiomeFocus(v,b.dataset.biomeFocus);
 else if(a==="biome-sell")r=sellBiomeGoods(v,b.dataset.biomeResource);
 else if(a==="biome-craft")r=craftBiomeGoods(v,b.dataset.biomeRecipe);
 else if(a==="biome-sell-craft")r=sellBiomeCraft(v,b.dataset.biomeRecipe);
 else if(a==="expedition-start")r=startExpedition(v,$("expedition-leader-select")?.value,$("expedition-supply-select")?.value);
 else if(a==="endeavour-start")r=startEndeavour(v,{overseerId:$("endeavour-overseer-select")?.value||null,funding:endeavourFunding});
 else if(a==="endeavour-funding"){endeavourFunding=Math.max(0,Math.min(2,Number(v)||0));r={ok:true};}
 else if(a==="endeavour-active-funding")r=setEndeavourFunding(Number(v));
 else if(a==="endeavour-abandon")r=abandonEndeavour();
 else if(a==="endeavour-reassign")r=setEndeavourOverseer($("endeavour-active-overseer")?.value);
 else if(a==="research-start")r=startResearch(v);
 else if(a==="research-funding")r=setResearchFunding(Number(v));
 else if(a==="research-appoint")r=appointScholar($("research-scholar-select")?.value);else if(a==="research-dismiss")r=dismissScholar(v);else if(a==="crown-relief")r=applyCrownRelief();else if(a==="crown-grain")r=setGrainContract(Number(v));else if(a==="crown-water")r=setWaterworks(Number(v));else if(a==="crown-housing")r=upgradeHousingStock();else if(a==="crown-provision")r=provisionGranary();else if(a==="government-form")r=setGovernmentForm(v);else if(a==="government-tax")r=setTaxRate(Number(v));else if(a==="government-succession")r=setSuccessionLaw(v);else if(a==="policy")r=enactPolicy(v);else if(a==="council-propose")r=proposeCouncilBill(v);else if(a==="council-lobby")r=lobbyCouncilBill(v);else if(a==="council-vote")r=callCouncilVote(v);else if(a==="foreign-marriage")r=marryForeignRealm(v);else if(a==="consort")r=appointRoyalConsort($("royal-consort-select")?.value);else if(a==="royal-birth")r=createRoyalChild();else if(a==="royal-education-tutor")r=appointRoyalTutor($("royal-tutor-select")?.value);else if(a==="royal-education-enroll")r=enrollRoyalStudent(v,$("royal-curriculum-"+v)?.value);else if(a==="royal-education-audience")r=holdRoyalAudience(v);else if(a==="royal-education-dismiss")r=dismissRoyalStudent(v);else if(a==="summon-creature")r=summonCreature($("creature-summon-select")?.value);else if(a==="summon-dragon")r=summonDragon();else if(a==="heir")r=designateHeir(v);else if(a==="royal-appoint-regent")r=appointRegent($("royal-regent-select")?.value);else if(a==="royal-abdicate")r=abdicateThrone();else if(a==="royal-concede")r=concedeCrown(v);else if(a==="royal-press-claim")r=pressClaim(v);else if(a==="royal-settle-claim")r=settleClaim(v);else if(a==="royal-suppress")r=suppressCivilConflict();else if(a==="draw-card")r=drawPlayerCard();else if(a==="select-card"){r=selectCard(v)?{ok:true}:{ok:false,reason:"card not found"};if(r.ok)setCommandModalOpen(false);}else if(a==="show-active-event"&&state.activeEvent){state.activeEvent.dismissed=false;renderUI();r={ok:true};}else if(a==="open-atelier"){activePanel="atelier";r={ok:true};}else if(a==="diplomacy-mission-send")r=sendEnvoyMission(v,$("mission-goal-"+v)?.value);else if(a==="diplomacy-mission-negotiate")r=negotiateEnvoyMission(v);else if(a==="diplomacy-mission-report")r=reportEnvoyMission(v);else if(a==="diplomacy-mission-ratify")r=ratifyEnvoyMission(v);else if(a==="diplomacy-gift")r=sendGift(v);else if(a==="diplomacy-pact")r=proposeTradePact(v);else if(a==="diplomacy-trade-agreement")r=signTradeAgreement(v);else if(a==="diplomacy-cancel-agreement")r=cancelTradeAgreement(v);else if(a==="diplomacy-alliance")r=proposeAlliance(v);else if(a==="diplomacy-war")r=declareWar(v);else if(a==="diplomacy-peace")r=sueForPeace(v);else if(a==="diplomacy-envoy")r=appointEnvoy(v,$("envoy-"+v)?.value);else if(a==="diplomacy-recall")r=recallEnvoy(v);else if(a==="diplomacy-guarantee")r=grantGuarantee(v);else if(a==="diplomacy-withdraw")r=withdrawGuarantee(v);else if(a==="diplomacy-honor")r=honorGuaranteeCall(v);else if(a==="diplomacy-refuse")r=refuseGuaranteeCall(v);else if(a==="world-route-open")r=openTradeRoute($("world-seat-"+v)?.value,v,$("world-resource-"+v)?.value,$("world-direction-"+v)?.value);else if(a==="world-route-close")r=closeTradeRoute(v);else if(a==="world-watch")r=setFrontierWatch(v,Number(b.dataset.level));else if(a==="world-region-claim")r=pressRegionClaim(v);else if(a==="world-charter-grant")r=grantProvinceCharter(v);else if(a==="world-petition-refuse")r=refuseProvincePetition(v);else if(a==="world-charter-revoke")r=revokeProvinceCharter(v);else if(a==="court-appoint")r=appointMinister(v,$("court-office-"+v)?.value);else if(a==="court-dismiss")r=dismissMinister(v);else if(a==="court-demand")r=addressFactionDemand(v);else if(a==="advisor-appoint")r=appointRoyalAdvisor($("advisor-select")?.value);else if(a==="advisor-action")r=resolveAdvisorAdvice(v);else if(a==="military-recruit")r=recruitVillager($("military-recruit-select")?.value);else if(a==="military-train")r=trainSoldier(v);else if(a==="military-equip")r=equipSoldier(v);else if(a==="military-mount")r=mountSoldier(v);else if(a==="military-horse")r=buyHorse();else if(a==="military-demobilize")r=demobilizeSoldier(v);else if(a==="health-sanitation")r=improveSanitation();else if(a==="health-appoint")r=appointHealer($("health-healer-select")?.value);else if(a==="health-dismiss")r=dismissHealer(v);else if(a==="health-brew")r=brewMedicine();else if(a==="health-field")r=applyHerbalRemedy(2);else if(a==="health-treat")r=treatSick();else if(a==="health-sell")r=sellMedicine(2);else if(a==="health-quarantine")r=setQuarantine(Number(v));else if(a==="spy-recruit")r=recruitAgent($("spy-recruit-select")?.value);else if(a==="spy-assign")r=assignAgent(v,$("spy-desk-"+v)?.value,$("spy-target-"+v)?.value);else if(a==="spy-dismiss")r=dismissAgent(v);else if(a==="spy-screen")r=screenCourt();else if(a==="spy-warn")r=warnHouse($("spy-warn-house")?.value);else if(a==="spy-concession")r=demandConcession($("spy-concession-realm")?.value);else if(a==="spy-false-trail")r=plantFalseTrail();else if(a==="faith-appoint")r=appointClergy($("faith-clergy-select")?.value);else if(a==="faith-dismiss")r=dismissClergy(v);else if(a==="faith-festival")r=holdFestival(v);else if(a==="faith-pilgrimage")r=fundPilgrimage();else if(a==="faith-budget")r=setCultureBudget(Number(v));else if(a==="faith-heresy")r=addressHeresy(v);else if(a==="justice-appoint")r=appointJudge($("justice-judge-select")?.value);else if(a==="justice-dismiss")r=dismissJudge(v);else if(a==="justice-law")r=setLawCode(v);else if(a==="justice-charter")r=grantCharter(v);else if(a==="justice-verdict")r=tryCase(v,$("justice-sentence-"+v)?.value);else if(a==="justice-investigate")r=investigateCorruption(v);
 if(r.ok){
  if(a==="foreign-marriage")toast(String(r.message||"FOREIGN MARRIAGE SEALED").toUpperCase());
  else if(a==="draw-card")toast(r.card.name+" DRAWN · SELECT IT TO PLACE IT");
  else if(a==="select-card")toast("CARD SELECTED — DRAG OR TAP IT ONTO THE MAP");
  else if(a.startsWith("diplomacy-"))toast(String(r.message||"DIPLOMACY UPDATED").toUpperCase());
  else if(a.startsWith("world-"))toast(String(r.message||"WORLD MAP UPDATED").toUpperCase());
  else if(a.startsWith("council-"))toast(String(r.message||r.result||"COUNCIL UPDATED").toUpperCase());
  else if(a.startsWith("court-"))toast("COURT DECISION RECORDED");
  else if(a.startsWith("advisor-"))toast(String(r.message||"ROYAL COUNSEL RECORDED").toUpperCase());
  else if(a.startsWith("military-"))toast(String(r.message||"GARRISON UPDATED").toUpperCase());
  else if(a==="health-field")toast("FIELD REMEDIES · "+(r.treated||0)+" TREATED · "+(r.used||[]).length+" REMEDY TYPES USED");
  else if(a==="spy-recruit")toast("WHISPER COURT · "+String(r.agent?.name||"AGENT").toUpperCase()+" RECRUITED");
  else if(a==="spy-assign")toast("ASSIGNMENT RECORDED");
  else if(a==="spy-dismiss")toast("AGENT DISMISSED FROM THE WHISPER COURT");
  else if(a==="spy-screen")toast(r.revealed?"COURT SCREENED · "+r.revealed+" TURNED AGENT"+(r.revealed===1?"":"S")+" UNMASKED":"COURT SCREENED · NO TURNED AGENTS FOUND");else if(a==="spy-warn")toast(r.ok?"HOUSE WARNED · "+r.targetName.toUpperCase()+" LOYALTY RAISED":"WARNING FAILED · "+String(r.reason).replace(/-/g," ").toUpperCase());else if(a==="spy-concession")toast(r.ok?"CONCESSION DEMANDED · +"+r.gold+" GOLD, +"+r.food+" FOOD":"CONCESSION FAILED · "+String(r.reason).replace(/-/g," ").toUpperCase());else if(a==="spy-false-trail")toast(r.ok?"FALSE TRAIL PLANTED · RIVAL PRESSURE FALLS":"TRAIL FAILED · "+String(r.reason).replace(/-/g," ").toUpperCase());
  else if(a.startsWith("health-"))toast(String(r.message||"PUBLIC HEALTH UPDATED").toUpperCase());
  else if(a.startsWith("faith-"))toast(String(r.message||"CONGREGATION UPDATED").toUpperCase());
  else if(a.startsWith("justice-"))toast(String(r.message||"COURT DECISION RECORDED").toUpperCase());
  else if(a.startsWith("research-"))toast(String(r.message||"RESEARCH UPDATED").toUpperCase());
  else if(a.startsWith("endeavour-"))toast(String(r.message||"CROWN WORK UPDATED").toUpperCase());
  else if(a.startsWith("crown-"))toast(String(r.message||"CROWN SUPPLY UPDATED").toUpperCase());
  else if(a.startsWith("noble-host"))toast(String(r.message||"NOBLE LAND HOST UPDATED").toUpperCase());
  else if(a.startsWith("noble-feud"))toast(String(r.message||"NOBLE FEUD UPDATED").toUpperCase());
  else if(a==="campaign-aim")toast(r.ok?"WAR AIM OPENED · "+String(r.campaign.theatreName).toUpperCase():"AIM FAILED · "+String(r.reason).replaceAll("-"," ").toUpperCase());
  else if(a==="campaign-commit")toast(r.ok?"FEUDAL CONTRACT SIGNED · "+String(r.campaign.contractLabel).toUpperCase():"COMMIT FAILED · "+String(r.reason).replaceAll("-"," ").toUpperCase());
  else if(a==="campaign-settle")toast(r.ok?"CAMPAIGN SETTLED · "+r.settled.length+" WAR BAND(S) RETURNED":"NO READY CAMPAIGN YET");
  else if(a.startsWith("royal-education-"))toast(String(r.message||"ROYAL EDUCATION UPDATED").toUpperCase());else if(a.startsWith("royal-"))toast(String(r.message||"ROYAL CRISIS UPDATED").toUpperCase());
  else if(a==="realm-cycle")toast(String(r.message||"PETITION ANSWERED").toUpperCase());
  else if(a.startsWith("noble-"))toast(String(r.message||"NOBLE HOUSE UPDATED").toUpperCase());
  else if(a.startsWith("expedition-"))toast(String(r.message||"ROYAL EXPEDITION UPDATED").toUpperCase());
  else if(a==="special-good-sell")toast("RARE GOODS SOLD · "+(r.gold||0)+" GOLD");
  else if(a==="repair-building")toast(r.ok?("REPAIRED · "+Math.round(r.restored)+" HP RESTORED"):String(r.reason||"REPAIR FAILED").replaceAll("-"," ").toUpperCase());
  else if(a==="repair-all")toast(r.ok?("REPAIRED · "+r.repaired+" STRUCTURES · "+Math.round(r.restored)+" HP"):String(r.reason||"REPAIR FAILED").replaceAll("-"," ").toUpperCase());
  else if(a==="manual-order")toast(r.ok?r.message:String(r.reason||"ORDER FAILED").replaceAll("-"," ").toUpperCase());
  else if(a==="timber-sell")toast(r.ok?("TIMBER SOLD · "+(r.amount||0)+" FOR "+(r.gold||0)+" GOLD"):String(r.reason||"TIMBER NOT SOLD").toUpperCase());
  else if(a==="special-biome-quest")toast("ATLAS QUEST RESOLVED · "+String(r.choice||"CHOICE").toUpperCase()+(r.followUp?" · FOLLOW-UP "+String(r.followUp.title).toUpperCase():""));
  else if(a==="special-biome-quest-followup")toast(r.ok?"ATLAS FOLLOW-UP CLOSED · "+String(r.choice||"CHOICE").toUpperCase():String(r.reason||"FOLLOW-UP FAILED").replaceAll("-"," ").toUpperCase());
  else if(a==="special-blight-choice")toast("BLIGHT DECREE ANSWERED · "+String(r.choice||"CHOICE").toUpperCase()+(r.siteChain?" · FOLLOW-UP "+String(r.siteChain.siteName).toUpperCase():""));
  else if(a.startsWith("special-biome-"))toast("RARE BIOME UPDATED");
  else if(a.startsWith("biome-"))toast(String(r.message||"BIOME ATLAS UPDATED").toUpperCase());
  else if(a.startsWith("hazard-"))toast(String(r.message||"HAZARD RESPONSE RECORDED").toUpperCase());
  else if(a==="open-atelier")toast("ATELIER OPEN");
  else if(a==="show-active-event")toast("ISSUE OPENED");
  else toast("DECISION RECORDED");
  if(a.startsWith("special-"))window.dispatchEvent(new CustomEvent("kac:special-biome-change"));
  renderUI();render();
 if(focus&&(!document.activeElement||document.activeElement===document.body||!document.activeElement.isConnected)){
  if(!restoreCommandFocus(focus))requestAnimationFrame(()=>{if(!document.activeElement||document.activeElement===document.body)restoreCommandFocus(focus);});
 }
 }else toast((r.reason||"ACTION FAILED").replaceAll("-"," ").toUpperCase());
}
async function runAiCommand(kind){
 if(state.aiBusy)return;
 const personId=$("ai-person-select")?.value||null;
 state.aiBusy=true;
 render(false);
 let result;
 try{
  result=await performAiAction(kind,{personId});
 }catch(error){
  result={ok:false,reason:error?.message||"The chronicler could not answer."};
 }
 state.aiBusy=false;
 if(result?.ok){
  toast(String(result.message||"CHRONICLE ENTRY RECORDED").toUpperCase());
  renderUI();
  render(false);
 }else{
  toast(String(result?.reason||"CHRONICLE ACTION FAILED").replaceAll("-"," ").toUpperCase());
  render(false);
 }
}

function renderManagementTabs(){
 const deck=document.querySelector("#command-modal .command-deck");
 if(!deck)return;
 const fragment=document.createDocumentFragment();
 for(const tab of MANAGEMENT_TABS){
  const button=document.createElement("button");
  button.type="button";
  button.className="ui-button ui-button--tab";
  button.dataset.commandTab=tab.id;
  button.id="command-tab-"+tab.id;
  button.setAttribute("role","tab");
  button.setAttribute("aria-controls","command-panel-content");
  button.innerHTML='<svg aria-hidden="true"><use href="assets/command-emblems.svg#'+esc(tab.icon)+'"></use></svg><span>'+esc(tab.label)+'</span>';
  fragment.append(button);
 }
 deck.replaceChildren(fragment);
}

export function setupManagementUI(){
 renderManagementTabs();
 ensureDynastyNetworkStyles();
 window.addEventListener("kac:expedition-change",()=>{
  if(activePanel==="explore"&&!$("command-modal")?.classList.contains("hidden"))render(false);
 });
 window.addEventListener("kac:special-biome-change",()=>{
  if(activePanel==="explore"&&!$("command-modal")?.classList.contains("hidden"))render(false);
 });
 // Density is derived from the living season. Refresh the small survey on the
 // four seasonal boundaries instead of rebuilding the entire Explore panel or
 // running a per-frame scan. Keep the reader's place and the 70-point list open.
 window.addEventListener("kac:season-change",()=>{
  if(activePanel==="biome"&&!$("command-modal")?.classList.contains("hidden")){render(false);return;}
  if(activePanel!=="explore"||$("command-modal")?.classList.contains("hidden"))return;
  const panel=$("command-panel-content");
  if(!panel)return;
  const details=panel.querySelector("[data-vegetation-density-section] details.vegetation-manifest");
  const wasOpen=Boolean(details?.open);
  const scrollTop=panel.scrollTop;
  if(!refreshVegetationDensity(panel))return;
  const next=panel.querySelector("[data-vegetation-density-section] details.vegetation-manifest");
  if(next&&wasOpen)next.open=true;
  panel.scrollTop=scrollTop;
 });
 window.addEventListener("resize",()=>{if(activePanel==="dynasty")drawDynastyConnectors();});
 document.querySelectorAll("[data-kac-panel]").forEach(button=>button.addEventListener("click",()=>{
  const target=button.dataset.kacPanel;
  setNavigationActive(target);
  if(target==="people"){$("people-btn")?.click();return;}
  if(target==="settings"){$("settings-btn")?.click();return;}
  if(target==="build"){
   if(button.dataset.kacBuildCategory)openBuildPanel(button.dataset.kacBuildCategory,button.dataset.kacBuildType||null);
   else $("build-open-btn")?.click();
   return;
  }
  if(target==="market"){$("tab-2")?.click();return;}
  if(MANAGEMENT_TAB_IDS.has(target)){
   if(target==="chronicle")resetTimelineView(state.year);
   activePanel=target;render(true);setCommandModalOpen(true);
   if(target==="resources"&&button.dataset.resourceDetail)requestAnimationFrame(()=>document.querySelector('.resource-detail-card[data-resource="'+button.dataset.resourceDetail+'"]')?.scrollIntoView({block:"start",behavior:"smooth"}));
  }
 }));
 $("command-open-btn")?.addEventListener("click",()=>{
  const modal=$("command-modal");
  if(modal?.classList.contains("hidden")){
   // Reveal the empty shell first, then let the next frame build the panel.
   // Settling the fixed dialog and laying out a full ledger in one task was a
   // 60-90 ms block on a throttled device; these are separate tasks now. Keep
   // the warm height spacer until the renderer replaces it, so revealing the
   // shell does not collapse and re-grow the flex pane in the click task.
   // If the player picks a tab before that frame, its render invalidates this
   // token: otherwise the deferred open render replaced the freshly selected
   // atlas, reset its scroll and briefly removed all sixty cards.
   const openToken=++commandOpenRenderToken;
   setCommandModalOpen(true);
   requestAnimationFrame(()=>{if(openToken!==commandOpenRenderToken)return;render(true);});
   return;
  }
  render(true);
 });
 const commandContent=$("command-panel-content");
 commandContent?.addEventListener("focusin",e=>hydrateLazySelect(e.target.closest("select[data-lazy-options]")));
 commandContent?.addEventListener("pointerdown",e=>hydrateLazySelect(e.target.closest("select[data-lazy-options]")));
 commandContent?.addEventListener("keydown",e=>{if(e.key==="ArrowDown"||e.key==="Enter"||e.key===" ")hydrateLazySelect(e.target.closest("select[data-lazy-options]"));});
 if(commandContent)new MutationObserver(records=>{
  if(records.some(record=>record.addedNodes.length||record.removedNodes.length))schedulePanelCulling();
 }).observe(commandContent,{childList:true,subtree:true});

 document.querySelectorAll("[data-command-tab]").forEach(b=>b.addEventListener("click",()=>{const nextPanel=b.dataset.commandTab||"government";if(nextPanel==="chronicle")resetTimelineView(state.year);activePanel=nextPanel;render(true);setCommandModalOpen(true);}));
  document.querySelector("#command-modal .command-deck")?.addEventListener("keydown",event=>{
   if(event.ctrlKey||event.metaKey||event.altKey||event.repeat)return;
   const tabs=[...document.querySelectorAll("#command-modal .command-deck [data-command-tab]")];
   const current=tabs.indexOf(document.activeElement);
   if(current<0)return;
   let next=-1;
   if(event.key==="Home")next=0;
   else if(event.key==="End")next=tabs.length-1;
   else if(event.key==="ArrowRight")next=(current+1)%tabs.length;
   else if(event.key==="ArrowLeft")next=(current-1+tabs.length)%tabs.length;
   if(next<0||!tabs[next])return;
   event.preventDefault();
   const id=tabs[next].dataset.commandTab||"government";
   if(id==="chronicle")resetTimelineView(state.year);
   activePanel=id;render(true);setCommandModalOpen(true);
   document.querySelector('[data-command-tab="'+id+'"]')?.focus({preventScroll:true});
  });
 const commandTabSelect=$("command-tab-select");
 if(commandTabSelect&&!commandTabSelect.options.length){
  document.querySelectorAll("[data-command-tab]").forEach(b=>{
   const option=document.createElement("option");
   option.value=b.dataset.commandTab||"";
   option.textContent=(b.textContent||option.value).trim().replace(/\s+/g," ");
   commandTabSelect.append(option);
  });
  commandTabSelect.value=activePanel;
  commandTabSelect.addEventListener("change",()=>{
   const nextPanel=commandTabSelect.value||"government";
   if(nextPanel==="chronicle")resetTimelineView(state.year);
   activePanel=nextPanel;render(true);setCommandModalOpen(true);
  });
 }
 $("command-panel-content")?.addEventListener("click",e=>{
  const button=e.target.closest("[data-transition-survey-step]");
  if(!button)return;
  e.preventDefault();
  if(stepTransitionSurvey(Number(button.dataset.transitionSurveyStep))){
   const panel=$("command-panel-content");
   if(!panel||!refreshTransitionSurvey(panel))render(false);
  }
 });
 $("command-panel-content")?.addEventListener("click",async e=>{
  const button=e.target.closest("[data-ai-command]");
  if(!button)return;
  e.preventDefault();
  await runAiCommand(button.dataset.aiCommand);
 });
 $("command-panel-content")?.addEventListener("click",e=>{
  const eventButton=e.target.closest("[data-timeline-event]");
  if(eventButton){e.preventDefault();focusTimelineEvent(eventButton.dataset.timelineEvent);refreshTimelineDetail();return;}
  const yearButton=e.target.closest("[data-timeline-year]");
  if(yearButton){e.preventDefault();setTimelineYear(yearButton.dataset.timelineYear);refreshTimeline(false);return;}
  const stepButton=e.target.closest("[data-timeline-step]");
  if(stepButton){e.preventDefault();stepTimelineYear(Number(stepButton.dataset.timelineStep));refreshTimeline(false);return;}
  const liveButton=e.target.closest("[data-timeline-live]");
  if(liveButton){e.preventDefault();resetTimelineView(state.year);refreshTimeline(false);return;}
  const clearButton=e.target.closest("[data-timeline-clear]");
  if(clearButton){e.preventDefault();clearTimelineSelection();refreshTimelineDetail();}
 });
 document.addEventListener("kac:open-timeline",e=>{
  if(!focusTimelineEvent(e.detail?.eventId))return;
  activePanel="chronicle";render(true);setCommandModalOpen(true);
 });
 $("command-close")?.addEventListener("click",()=>{hideForestTip();setCommandModalOpen(false);});
 document.addEventListener("click",e=>{if(!e.target.closest?.("[data-forest-tip]"))hideForestTip();});
 $("command-panel-content")?.addEventListener("scroll",hideForestTip,{passive:true});
 $("command-modal")?.addEventListener("click",e=>{if(e.target===$("command-modal"))setCommandModalOpen(false);});
 $("command-panel-content")?.addEventListener("input",e=>{
  if(e.target.id==="building-search"){
   const query=e.target.value.trim().toLowerCase();
   document.querySelectorAll(".building-record").forEach(record=>record.classList.toggle("is-filtered",query&&!record.dataset.buildingName.includes(query)));
  }
  if(e.target.id==="timeline-year-range"){
   const previousYear=getTimelineView().year;
   setTimelineYear(e.target.value);
   if(getTimelineView().year!==previousYear)scheduleTimelineResultsRefresh();
   return;
  }
  if(e.target.id==="chronicle-search"||e.target.id==="chronicle-kind-filter"){
   const query=$("chronicle-search")?.value.trim().toLowerCase()||"";
   const kind=$("chronicle-kind-filter")?.value||"all";
   document.querySelectorAll(".chronicle-entry").forEach(record=>record.classList.toggle("is-filtered",(kind!=="all"&&record.dataset.kind!==kind)||(query&&!record.dataset.search.includes(query))));
  }
  if(e.target.id==="population-search"){
   const selectionStart=e.target.selectionStart,selectionEnd=e.target.selectionEnd;
   setPopulationQuery(e.target.value);
   const scrollTop=$("command-panel-content")?.scrollTop||0;
   render();
   const panel=$("command-panel-content");
   if(panel)panel.scrollTop=scrollTop;
   const input=$("population-search");
   if(input){input.focus({preventScroll:true});input.setSelectionRange(selectionStart,selectionEnd);}
  }
 });
 $("command-panel-content")?.addEventListener("change",e=>{
  if(e.target.id==="timeline-filter"){setTimelineFilter(e.target.value);refreshTimeline(false);return;}
  const sawSelect=e.target.closest("[data-saw-profile]");
  if(sawSelect){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(sawSelect.dataset.sawProfile));
   const result=setSawProfile(entity,sawSelect.value);
   if(result.ok){toast("SAW BENCH RETOOLED · "+String(result.label).toUpperCase());render();}
   else toast(String(result.reason||"SAW PROFILE FAILED").toUpperCase());
   return;
  }
  const forestSelect=e.target.closest("[data-forest-mode]");
  if(forestSelect){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(forestSelect.dataset.forestMode));
   const result=setForestWorksMode(entity,forestSelect.value);
   if(result.ok){toast("FOREST INDUSTRY SELECTED · "+String(result.label).toUpperCase());render();}
   else toast(String(result.reason||"FOREST INDUSTRY FAILED").toUpperCase());
   return;
  }
  const select=e.target.closest("[data-warehouse-profile]");
  if(!select)return;
  const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(select.dataset.warehouseProfile));
  const result=setWarehouseProfile(entity,select.value);
  if(result.ok){toast("WAREHOUSE PROFILE UPDATED");render();}
  else toast(String(result.reason||"PROFILE CHANGE FAILED").replaceAll("-"," ").toUpperCase());
 });
 $("command-panel-content")?.addEventListener("click",e=>{
  const buildingShowAllButton=e.target.closest("[data-building-show-all]");
  if(buildingShowAllButton){buildingShowAll=true;const panel=$("command-panel-content");const scrollTop=panel?.scrollTop||0;render();if(panel)panel.scrollTop=scrollTop;return;}
  const courtShowAllButton=e.target.closest("[data-court-show-all]");
  if(courtShowAllButton){
   courtShowAll=true;const panel=$("command-panel-content");render();let tries=0;
   const showCourt=()=>{
    if(activePanel!=="government"||tries++>180)return;
    const grid=panel?.querySelector(".court-office-grid");
    if(!grid){requestAnimationFrame(showCourt);return;}
    grid.scrollIntoView({block:"start"});
   };
   requestAnimationFrame(showCourt);return;
  }
  const logisticsButton=e.target.closest("[data-building-logistics]");
  if(logisticsButton){
   expandedBuildingLogistics=true;
   const panel=$("command-panel-content");const scrollTop=panel?.scrollTop||0;
   render();if(panel)panel.scrollTop=scrollTop;return;
  }
  const chainFocus=e.target.closest("[data-chain-focus]");
  if(chainFocus){
   expandedBuildingId=chainFocus.dataset.chainFocus||null;
   buildingShowAll=true;
   activePanel="buildings";
   render(true);
   setCommandModalOpen(true);
   requestAnimationFrame(()=>{
    const panel=$("command-panel-content");
    const record=[...(panel?.querySelectorAll(".building-record")||[])].find(node=>String(node.dataset.buildingId)===String(expandedBuildingId));
    if(record)record.scrollIntoView({block:"start"});
   });
   return;
  }
  const buildingSummary=e.target.closest(".building-record>summary");
  if(buildingSummary&&narrowViewport()){
   const details=buildingSummary.parentElement;
   expandedBuildingId=details?.dataset.buildingId||null;
   const panel=$("command-panel-content");
   const scrollTop=panel?.scrollTop||0;
   render();
   if(panel)panel.scrollTop=scrollTop;
   return;
  }
  const populationPageButton=e.target.closest("[data-population-page]");
  if(populationPageButton){
   stepPopulationPage(populationPageButton.dataset.populationPage,populationPageButton.dataset.populationPageStep);
   const panel=$("command-panel-content");const scrollTop=panel?.scrollTop||0;
   render();
   if(panel)panel.scrollTop=scrollTop;
   return;
  }
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
   if(result.ok){const products=result.products||{},output=[products.logs?products.logs+" LOGS":"",products.firewood?products.firewood+" FIREWOOD":""].filter(Boolean).join(" + ")||(result.taken+" STEMS");toast("THINNED "+output+" AT "+result.x+", "+result.y+(result.systemLabel?" · "+result.systemLabel:""));renderUI();render();}
   else toast(String(result.reason||"THINNING FAILED").toUpperCase());
   return;
  }
  const runWorks=e.target.closest("[data-run-forest-works]");
  if(runWorks){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(runWorks.dataset.runForestWorks));
   const result=entity?runForestWorks(entity):{ok:false,reason:"Building not found"};
   if(result.ok){toast("FOREST BATCH · "+Object.entries(result.output).map(([good,value])=>value+" "+(INDUSTRY_GOODS[good]?.label||good)).join(" + ")+(result.style?" · "+result.style.label:""));renderUI();render();}
   else toast(String(result.reason||"FOREST BATCH FAILED").toUpperCase());
   return;
  }
     const legacyRegionAction=e.target.closest("[data-legacy-region-action]");
  if(legacyRegionAction){
   const action=legacyRegionAction.dataset.legacyRegionAction;
   const region=legacyRegionAction.dataset.legacyRegion;
   let result;
   switch(action){
    case "protect": result=protectForestRegion(region); break;
    case "afforest": result=afforestForestRegion(region); break;
    case "reintroduce": result=reintroduceForestSpecies(region); break;
    case "monument": result=designateForestMonument(region); break;
    default: result={ok:false,reason:"Unknown forest legacy action"};
   }
   if(result.ok){toast(String(result.message||"FOREST LEGACY ACTION COMPLETE").toUpperCase());renderUI();render();}
   else toast(String(result.reason||"FOREST LEGACY ACTION FAILED").replaceAll("-"," ").toUpperCase());
   return;
  }
  const legacyBuild=e.target.closest("[data-legacy-build]");
  if(legacyBuild){
   const result=buildForestInstitution(legacyBuild.dataset.legacyBuild);
   if(result.ok){toast(String(result.message||"FOREST INSTITUTION RAISED").toUpperCase());renderUI();render();}
   else toast(String(result.reason||"FOREST INSTITUTION FAILED").replaceAll("-"," ").toUpperCase());
   return;
  }
  const legacyLaw=e.target.closest("[data-legacy-law]");
  if(legacyLaw){
   const result=setForestConservationLaw(legacyLaw.dataset.legacyLaw);
   if(result.ok){toast(String(result.message||"FOREST LAW ENACTED").toUpperCase());renderUI();render();}
   else toast(String(result.reason||"FOREST LAW FAILED").replaceAll("-"," ").toUpperCase());
   return;
  }
  const legacyCitizen=e.target.closest("[data-legacy-citizen]");
  if(legacyCitizen){
   const result=fundCitizenScience();
   if(result.ok){toast(String(result.message||"CITIZEN SCIENCE RAISED").toUpperCase());renderUI();render();}
   else toast(String(result.reason||"CITIZEN SCIENCE FAILED").replaceAll("-"," ").toUpperCase());
   return;
  }
  const warAction=e.target.closest("[data-war-action]");
  if(warAction){
   const realm=warAction.dataset.warRealm;
   const action=warAction.dataset.warAction;
   const good=warAction.dataset.warGood;
   let result;
   switch(action){
    case "post": result=raiseBorderPost(realm); break;
    case "watch": result=strengthenForestWatch(realm); break;
    case "road": result=openForestRoad(realm); break;
    case "scouts": result=recruitForestScouts(realm); break;
    case "ambush": result=layForestAmbush(realm); break;
    case "battle": result=fightForestBattle(realm); break;
    case "siegeTimber": result=cutSiegeTimber(realm); break;
    case "siege": result=pressForestSiege(realm); break;
    case "shipTimber": result=reserveShipTimber(realm); break;
    case "elephants": result=musterWarElephants(realm); break;
    case "abatis": result=fellAbatis(realm); break;
    case "partisans": result=raiseForestPartisans(realm); break;
    case "warFire": result=setWarFire(realm); break;
    case "burnFields": result=burnForFields(realm); break;
    case "deport": result=deportWoodlanders(realm); break;
    case "quota": result=levyTimberQuota(realm); break;
    case "embargo": result=setForestEmbargo(realm,good); break;
    case "liftEmbargo": result=liftForestEmbargo(realm); break;
    case "route": result=openForestTradeRoute(realm); break;
    case "smuggling": result=runForestSmuggling(realm); break;
    case "maps": result=commissionWarMaps(realm); break;
    case "treaty": result=signBorderTreaty(realm); break;
    case "preserve": result=createJointPreserve(realm); break;
    case "rights": result=recognizeWoodlandRights(realm); break;
    case "settlers": result=pressSettlerClaims(realm); break;
    case "colonize": result=colonizeWoodland(realm); break;
    case "suppress": result=suppressForestResistance(realm); break;
    case "refugees": result=settleForestRefugees(realm); break;
    case "colony": result=foundMilitaryColony(realm); break;
    case "clearCamp": result=clearRebelCamp(realm); break;
    case "recovery": result=fundWarEcologyRecovery(realm); break;
    default: result={ok:false,reason:"Unknown frontier action"};
   }
   if(result.ok){
    const message=action==="battle"?"FOREST "+(result.victory?"VICTORY":"REVERSE")+" · "+result.wounded+" WOUNDED · "+result.fallen+" FALLEN"
     :action==="post"?"BORDER POST · CONTROL "+result.control
     :action==="watch"?"FOREST WATCH · "+result.watch+" / 3"
     :action==="road"?"FOREST ROAD · GRADE "+result.road
     :action==="scouts"?"FOREST SCOUTS · "+result.scouts+" / 3"
     :action==="ambush"?"AMBUSH LAID IN THE WOOD"
     :action==="siegeTimber"?"SIEGE MATERIAL +"+result.gain
     :action==="siege"?"SIEGE PRESSED · GARRISON "+result.garrison
     :action==="shipTimber"?"SHIP TIMBER +"+result.gain
     :action==="elephants"?"WAR ELEPHANTS · "+result.elephants
     :action==="abatis"?"ABATIS · "+result.abatis+" BELTS"
     :action==="partisans"?"FOREST PARTISANS · "+result.partisans
     :action==="warFire"?"WAR FIRE · TILE "+result.x+", "+result.y
     :action==="burnFields"?"FIELDS CLEARED · +"+result.food+" FOOD · "+result.settlers+" CLAIMS"
     :action==="deport"?"DEPORTATION · REBELS "+result.rebels+" · REFUGEES "+result.refugees
     :action==="quota"?"TIMBER QUOTA · +8 GOLD · MATERIAL "+result.siegeMaterial
     :action==="embargo"?"EMBARGO · "+String(result.good).toUpperCase()
     :action==="liftEmbargo"?"EMBARGO LIFTED · "+String(result.good).toUpperCase()
     :action==="route"?"FOREST ROUTE OPEN"
     :action==="smuggling"?result.caught?"SMUGGLING RUN CAUGHT":"SMUGGLING RUN · +"+result.gold+" GOLD"
     :action==="maps"?"WAR MAPS CHARTED"
     :action==="treaty"?"BORDER TREATY · UNTIL "+result.treaty.untilYear
     :action==="preserve"?"JOINT PRESERVE · TILE "+result.preserve.x+", "+result.preserve.y
     :action==="rights"?"WOODLAND RIGHTS RECOGNISED"
     :action==="settlers"?"SETTLER CLAIMS · "+result.settlers
     :action==="colonize"?"PROVINCE COLONISED · REBELS "+result.rebels
     :action==="suppress"?"RESISTANCE · "+result.cleared+" CAMPS CLEARED"
     :action==="refugees"?"REFUGEES SETTLED · "+result.settled
     :action==="colony"?"MILITARY COLONY · CONTROL "+result.control
     :action==="clearCamp"?result.cleared?"REBEL CAMP CLEARED":"REBEL CAMP HOLDS · PATROL WOUNDED"
     :action==="recovery"?"WAR ECOLOGY · "+result.restored+" FOREST RESTORED"
     :String(action).toUpperCase()+" · DONE";
    toast(message);renderUI();render();
   }else toast(String(result.reason||"FRONTIER ACTION FAILED").toUpperCase());
   return;
  }
  const warCustoms=e.target.closest("[data-war-customs]");
  if(warCustoms){
   const result=setForestCustoms(warCustoms.dataset.warRealm,Number(warCustoms.dataset.warCustoms));
   if(result.ok){toast("FOREST CUSTOMS · "+result.customs+"% · +"+result.annual+" GOLD / YEAR");renderUI();render();}
   else toast(String(result.reason||"CUSTOMS FAILED").toUpperCase());
   return;
  }
     const cultureAction=e.target.closest("[data-culture-action]");
  if(cultureAction){
   const action=cultureAction.dataset.cultureAction;
   const result=action==="grove"?dedicateSacredGrove()
    :action==="offering"?makeForestOffering()
    :action==="offering-honey"?makeForestOffering("honey")
    :action==="offering-herbs"?makeForestOffering("herbs")
    :action==="offering-mushrooms"?makeForestOffering("mushrooms")
    :action==="festival"||action==="festival-spring"?holdForestFestival("spring")
    :action==="festival-woodcut"?holdForestFestival("woodcut")
    :action==="festival-harvest"?holdForestFestival("harvest")
    :action==="hunt"?performHuntRite()
    :action==="wedding"?performTreeWedding()
    :action==="lore"?collectForestLore()
    :action==="hermit"?consultForestHermit()
    :action==="school"?holdForestSchool()
    :action==="remedy"?brewForestRemedies()
    :{ok:false,reason:"Unknown culture action"};
   if(result.ok){
    const message=action==="grove"?"SACRED GROVE CONSECRATED · "+result.profile.groveName
     :action.startsWith("offering")?"OFFERING MADE · "+result.good+" · FAVOUR "+result.favor
     :action.startsWith("festival")?"FOREST FESTIVAL · "+result.festival.name
     :action==="hunt"?"HUNT RITE OPENED · "+(result.initiates?.length?result.initiates.join(", "):"NO NEW INITIATES")
     :action==="wedding"?"TREE WEDDING · "+result.grove.label
     :action==="hermit"?"HERMIT'S OMEN · "+result.omen.title
     :action==="school"?"WOODLAND SCHOOL · "+result.taught+" APPRENTICES"
     :action==="remedy"?"FOREST REMEDIES · +"+result.medicine+" MEDICINE"
     :"WOODLORE COLLECTED · "+result.added+" ENTRIES";
    toast(message);renderUI();render();
   }else toast(String(result.reason||"CULTURE ACTION FAILED").toUpperCase());
   return;
  }
  const cultureTend=e.target.closest("[data-culture-tend]");
  if(cultureTend){
   const result=tendSacredGrove(cultureTend.dataset.cultureTend);
   if(result.ok){toast("GROVE TENDED · VITALITY "+result.grove.vitality+" / 100");renderUI();render();}
   else toast(String(result.reason||"GROVE TENDING FAILED").toUpperCase());
   return;
  }
  const cultureDoctrine=e.target.closest("[data-culture-doctrine]");
  if(cultureDoctrine){
   const result=setForestDoctrine(cultureDoctrine.dataset.cultureDoctrine);
   if(result.ok){toast("WOODLAND DOCTRINE · "+result.doctrine.label.toUpperCase());renderUI();render();}
   else toast(String(result.reason||"DOCTRINE FAILED").toUpperCase());
   return;
  }
  const cultureRights=e.target.closest("[data-culture-rights]");
  if(cultureRights){
   const result=setForestRights(cultureRights.dataset.cultureRights);
   if(result.ok){toast("FOREST RIGHT · "+String(result.priority).toUpperCase());renderUI();render();}
   else toast(String(result.reason||"FOREST RIGHT FAILED").toUpperCase());
   return;
  }
  const cultureMediate=e.target.closest("[data-culture-mediate]");
  if(cultureMediate){
   const result=mediateForestConflict(cultureMediate.dataset.cultureMediate);
   if(result.ok){toast("WOOD-RIGHT DISPUTE SETTLED · "+result.conflict.label);renderUI();render();}
   else toast(String(result.reason||"MEDIATION FAILED").toUpperCase());
   return;
  }
  const forestTipTarget=e.target.closest("[data-forest-tip]");
  if(forestTipTarget){
   e.preventDefault();
   toggleForestTip(forestTipTarget);
   return;
  }
  // 1.2.23.1.256–258/267: an atlas cue is a real user gesture, so the
  // procedural engine may resume a suspended context and the printed line is
  // updated in place. The cue is the same object the ambience scheduler uses.
  const forestCue=e.target.closest("[data-forest-cue]");
  if(forestCue){
   const scene=forestPresentationSummary().scene;
   const result=previewForestAmbience(scene.profile,scene,forestCue.dataset.forestCue);
   const text=result?.text||result?.cue?.text||"The wood is still.";
   document.querySelectorAll("[data-forest-cue-text]").forEach(element=>{element.textContent=text;});
   document.querySelectorAll("[data-forest-last-cue]").forEach(element=>{element.textContent="LAST HEARD · "+text;});
   return;
  }
  const forestTypeCue=e.target.closest("[data-forest-type-cue]");
  if(forestTypeCue){
   const profile=forestPresentationProfile(forestTypeCue.dataset.forestTypeCue);
   const scene={weather:state.weather||"clear",hour:state.timeOfDay,season:["spring","summer","autumn","winter"][Math.max(0,Math.min(3,Number(state.seasonIndex)||0))],seasonIndex:Number(state.seasonIndex)||0};
   const result=previewForestAmbience(profile,scene,forestTypeCue.dataset.forestCueKind||"instrument");
   const text=result?.text||result?.cue?.text||"The wood is still.";
   document.querySelectorAll("[data-forest-cue-text]").forEach(element=>{element.textContent=text;});
   document.querySelectorAll("[data-forest-last-cue]").forEach(element=>{element.textContent="LAST HEARD · "+text;});
   toast((profile?.short||"FOREST")+" · "+text);
   return;
  }
  // 1.2.23.1.260/262: a legend entry is also a one-tap family filter. Tapping
  // the active family clears it again, so the legend can never trap the player
  // in a subset without an obvious way back.
  const forestFamily=e.target.closest("[data-forest-family-filter]");
  if(forestFamily){
   const family=forestFamily.dataset.forestFamilyFilter;
   const active=forestMapFilters().family===family;
   const ok=setForestMapFilter("family",active?"all":family);
   if(ok){toast("FOREST FAMILY · "+(active?"ALL TYPES":String(family).toUpperCase()));renderUI();render();}
   return;
  }
  // 1.2.23.1.262: filter chips re-render the atlas in place. The filter state
  // lives with the presentation system, so it also survives a panel reopen
  // without being written to the save.
  const forestFilter=e.target.closest("[data-forest-filter]");
  if(forestFilter){
   const ok=setForestMapFilter(forestFilter.dataset.forestFilter,forestFilter.dataset.forestFilterValue);
   if(ok){toast("FOREST FILTER · "+String(forestFilter.dataset.forestFilterValue).toUpperCase());renderUI();render();}
   return;
  }
  const forestFilterReset=e.target.closest("[data-forest-filter-reset]");
  if(forestFilterReset){
   resetForestMapFilters();toast("FOREST FILTERS CLEARED · ALL SIXTY TYPES");renderUI();render();
   return;
  }
  const commission=e.target.closest("[data-forest-commission]");
  if(commission){
   const result=deliverForestCommission(commission.dataset.forestCommission);
   if(result.ok){toast("GUILD COMMISSION FILLED · +"+result.gold+" GOLD · +"+result.renown+" RENOWN"+(result.tier?" · TIER "+result.tier:''));renderUI();render();}
   else toast(String(result.reason||"COMMISSION FAILED").toUpperCase());
   return;
  }
  const caravan=e.target.closest("[data-forest-caravan]");
  if(caravan){
   const result=dispatchGuildCaravan(caravan.dataset.forestCaravan);
   if(result.ok){toast("CARAVAN ESCORTED · -"+result.cost+" GOLD · NEW ROUTE DISPATCHED");renderUI();render();}
   else toast(String(result.reason||"CARAVAN FAILED").toUpperCase());
   return;
  }
  const clinic=e.target.closest("[data-clinic-medicine]");
  if(clinic){
   const result=supplyClinicMedicine(Number(clinic.dataset.clinicMedicine||6));
   if(result.ok){toast("CLINIC SUPPLIED · "+result.amount+" MEDICINE · STORE "+result.stock+" / "+result.capacity);renderUI();render();}
   else toast(String(result.reason||"CLINIC SUPPLY FAILED").toUpperCase());
   return;
  }
  const industrySell=e.target.closest("[data-industry-sell]");
  if(industrySell){
   const result=sellForestIndustryGood(industrySell.dataset.industrySell,Number(industrySell.dataset.industryQuantity||5));
   if(result.ok){toast("SOLD "+result.amount+" "+result.label+" · +"+result.gold+" GOLD");renderUI();render();}
   else toast(String(result.reason||"SALE FAILED").toUpperCase());
   return;
  }
  const sell=e.target.closest("[data-sell-forest]");
  if(sell){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(sell.dataset.sellForest));
   const result=entity?sellForestGoods(entity):{ok:false,reason:"Building not found"};
   if(result.ok){toast("SOLD "+result.goods.map(good=>good.amount+" "+good.label).join(" · ")+" · +"+result.gold+" GOLD");renderUI();render();}
   else toast(String(result.reason||"SALE FAILED").toUpperCase());
   return;
  }
  const deliver=e.target.closest("[data-deliver-forest]");
  if(deliver){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(deliver.dataset.deliverForest));
   const result=entity?deliverForestGoods(entity):{ok:false,reason:"Building not found"};
   if(result.ok){toast("DELIVERED "+result.goods.map(good=>good.to==="gold"?good.amount+" SOLD FOR "+good.value+"G":good.amount+" "+good.to).join(" · "));renderUI();render();}
   else toast(String(result.reason||"DELIVERY FAILED").toUpperCase());
   return;
  }
  const suppress=e.target.closest("[data-suppress-forest]");
  if(suppress){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(suppress.dataset.suppressForest));
   const result=entity?suppressNearestForestDisturbance(entity.x,entity.y,8):{ok:false,reason:"Building not found"};
   if(result.ok){invalidateForestAtlasSurvey();toast("CONTROL PARTY · "+String(result.kind).toUpperCase()+" HELD UNTIL DAY "+result.containedUntil);renderUI();render();}
   else toast(String(result.reason||"CONTROL PARTY FAILED").toUpperCase());
   return;
  }
  const reforest=e.target.closest("[data-reforest-forest]");
  if(reforest){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(reforest.dataset.reforestForest));
   const result=entity?reforestNearestForestTile(entity.x,entity.y,9):{ok:false,reason:"Building not found"};
   if(result.ok){invalidateForestAtlasSurvey();toast("REFORESTED "+result.tiles+" "+(result.tiles===1?"TILE":"TILES")+" · +"+result.planted+" STAND "+(result.planted===1?"UNIT":"UNITS")+" · "+resourceCostLabel(result.cost));renderUI();render();}
   else toast(String(result.reason||"REFORESTATION FAILED").toUpperCase());
   return;
  }
  const firebreak=e.target.closest("[data-firebreak-forest]");
  if(firebreak){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(firebreak.dataset.firebreakForest));
   const result=entity?buildNearestForestFirebreak(entity.x,entity.y,9):{ok:false,reason:"Building not found"};
   if(result.ok){invalidateForestAtlasSurvey();toast("FIREBREAK · "+result.tiles+" "+(result.tiles===1?"TILE":"TILES")+" PROTECTED UNTIL DAY "+result.until);renderUI();render();}
   else toast(String(result.reason||"FIREBREAK FAILED").toUpperCase());
   return;
  }
  const burn=e.target.closest("[data-burn-forest]");
  if(burn){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(burn.dataset.burnForest));
   const result=entity?controlledBurnNearestForestTile(entity.x,entity.y,9):{ok:false,reason:"Building not found"};
   if(result.ok){invalidateForestAtlasSurvey();toast("CONTROLLED BURN · +"+result.wood+" WOOD · "+(result.escaped?"FIRE ESCAPED":"HELD FOR "+90+" DAYS")+" · "+resourceCostLabel(result.cost));renderUI();render();}
   else toast(String(result.reason||"CONTROLLED BURN FAILED").toUpperCase());
   return;
  }
  const drain=e.target.closest("[data-drain-forest]");
  if(drain){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(drain.dataset.drainForest));
   const result=entity?toggleNearestWetlandDrainage(entity.x,entity.y,9):{ok:false,reason:"Building not found"};
   if(result.ok){
    invalidateForestAtlasSurvey();
    const title=result.action==="restore"?"WETLAND RESTORED":"WETLAND DRAINED";
    toast(title+" · FLOOD "+Math.round(result.beforeFlood*100)+"% → "+Math.round(result.afterFlood*100)+"% · BIODIVERSITY "+Math.round(result.beforeBiodiversity*100)+"% → "+Math.round(result.afterBiodiversity*100)+"%");
    renderUI();render();
   }
   else toast(String(result.reason||"WETLAND ORDER FAILED").toUpperCase());
   return;
  }
  const gather=e.target.closest("[data-gather-forest]");
  if(gather){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(gather.dataset.gatherForest));
   const result=entity?gatherNearestForestProducts(entity.x,entity.y,7):{ok:false,reason:"Building not found"};
   if(result.ok){toast("GATHERED "+result.goods.map(good=>good.amount+" "+good.label).join(" · ")+(result.bounty?" · SEASONAL BOUNTY +"+result.bounty.amount+" "+result.bounty.label:""));renderUI();render();}
   else toast(String(result.reason||"GATHERING FAILED").toUpperCase());
   return;
  }
  const meadow=e.target.closest("[data-gather-meadow]");
  if(meadow){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(meadow.dataset.gatherMeadow));
   const result=entity?gatherNearestGrasslandProducts(entity.x,entity.y,7):{ok:false,reason:"Building not found"};
   if(result.ok){toast("MEADOW HARVEST · "+result.goods.map(good=>good.amount+" "+good.label).join(" · "));renderUI();render();}
   else toast(String(result.reason||"MEADOW HARVEST FAILED").toUpperCase());
   return;
  }
  const mountainWork=e.target.closest("[data-mountain-work]");
  if(mountainWork){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(mountainWork.dataset.mountainBuilding));
   const result=entity?performMountainWork(entity.x,entity.y,mountainWork.dataset.mountainWork):{ok:false,reason:"Building not found"};
   if(result.ok){toast(result.message);renderUI();render();}
   else toast(String(result.reason||"MOUNTAIN WORK FAILED").toUpperCase());
   return;
  }
  const volcanoWork=e.target.closest("[data-volcano-work]");
  if(volcanoWork){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(volcanoWork.dataset.volcanoBuilding));
   const result=entity?performVolcanoWork(entity.x,entity.y,volcanoWork.dataset.volcanoWork):{ok:false,reason:"Building not found"};
   if(result.ok){toast(result.message);renderUI();render();}
   else toast(String(result.reason||"VOLCANIC WORK FAILED").toUpperCase());
   return;
  }
  const coastWork=e.target.closest("[data-coast-work]");
  if(coastWork){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(coastWork.dataset.coastBuilding));
   const result=entity?performCoastWork(entity.x,entity.y,coastWork.dataset.coastWork):{ok:false,reason:"Building not found"};
   if(result.ok){toast(result.message);renderUI();render();}
   else toast(String(result.reason||"COASTAL WORK FAILED").toUpperCase());
   return;
  }
  const swampWork=e.target.closest("[data-swamp-work]");
  if(swampWork){
   const entity=state.entities.find(item=>!item.dead&&String(item.id)===String(swampWork.dataset.swampBuilding));
   const result=entity?performSwampWork(entity.x,entity.y,swampWork.dataset.swampWork):{ok:false,reason:"Building not found"};
   if(result.ok){toast(result.message);renderUI();render();}
   else toast(String(result.reason||"WETLAND WORK FAILED").toUpperCase());
   return;
  }
  const person=e.target.closest("[data-open-person]");
  if(person){window.dispatchEvent(new CustomEvent("kac:open-person",{detail:{personId:person.dataset.openPerson}}));setCommandModalOpen(false);return;}
  if(handleCityPanelClick(e,{onChanged:()=>{renderUI();render();},toast}))return;
  const b=e.target.closest("[data-command]");if(b&&!b.disabled)act(b);
 });
 document.querySelectorAll("[data-kac-dock-action]").forEach(button=>button.addEventListener("click",()=>{
  const action=button.dataset.kacDockAction;
  if(action==="people")$("people-btn")?.click();
  else if(action==="dynasty"){activePanel="dynasty";render();setCommandModalOpen(true);}
  else if(action==="cards"){activePanel="cards";render();setCommandModalOpen(true);}
  else if(action==="events")$("tab-0")?.click();
  else if(action==="save")$("save-btn")?.click();
 }));
 document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  hideForestTip();
  // A nested dossier owns Escape; management must not close underneath it.
  const commandModal=$("command-modal");
  if(!commandModal||commandModal.classList.contains("hidden"))return;
  const above=[...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(dialog=>
   dialog!==commandModal&&!dialog.classList.contains("hidden"));
  if(!above)setCommandModalOpen(false);
 });
 // The closed shell is kept in the layout tree, but Chromium still defers some
 // of its first style/layout work while it is invisible: opening the empty
 // dialog then cost 55-60 ms on a 4x-throttled device. Pay that layout once
 // during idle startup, fully transparent and non-interactive, so a player's
 // first open only flips visibility.
 const warmCommandModal=()=>{
  const modal=$("command-modal");
  if(!modal||!modal.classList.contains("hidden"))return;
  const content=$("command-panel-content");
  // Give the empty scroll pane its real flex height while it is still
  // invisible. Otherwise the first panel insert also relaid out the whole
  // dialog to grow this pane from zero, a 40-50 ms tail on the open task.
  if(content&&!content.childElementCount){
   const spacer=document.createElement("div");
   spacer.className="command-panel-warm-spacer";
   spacer.setAttribute("aria-hidden","true");
   spacer.style.cssText="height:100%;min-height:100%;pointer-events:none";
   content.append(spacer);
  }
  modal.style.setProperty("visibility","visible","important");
  modal.style.setProperty("opacity","0","important");
  modal.getBoundingClientRect();
  modal.style.setProperty("visibility","hidden","important");
  modal.style.removeProperty("opacity");
 };
 // Run before the player can start a campaign, never on an idle callback that
 // could land inside a measured cold-start window.
 warmCommandModal();
}
