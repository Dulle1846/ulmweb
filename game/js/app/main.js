// Application composition root: boot menu, local profiles, save/load and runtime.
import { WORLD_W,WORLD_H,CELL } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { state,resetState } from "../core/state.js";
import { initWorld } from "../world/world.js";
import { renderWorldPreview,normalizeWorldOptions,resolveWorldDimensions,TERRAIN_GENERATION_VERSION,resolveSavedTerrainVersion } from "../world/terrain-model.js";
import { initStartingKingdom,spawnEntity,canSpawnEntity } from "../world/entities.js";
import { drawStartingHand,restoreHand } from "../systems/cards.js";
import { createMarketState } from "../systems/market.js";
import { createDiplomacyState, normalizeDiplomacySnapshot } from "../systems/diplomacy.js";
import { createCourtState, normalizeCourtState } from "../systems/court.js";
import { createFaithState, normalizeFaithState } from "../systems/faith.js";
import { createJusticeState, normalizeJusticeState } from "../systems/justice.js";
import { normalizeMilitaryState } from "../systems/military.js";
import { normalizeCraftedItems } from "../systems/item-lexicon.js";
import { normalizeHealthState } from "../systems/health.js";
import { normalizePoliticalState } from "../systems/politics.js";
import { normalizeHouseholdAssignments } from "../systems/population.js";
import { initializePopulationRegister,normalizePopulationState,serializePopulationState,synchronizePopulationRegister } from "../systems/population-register.js";
import { invalidateRoomBonusCache, getRoomBonusSnapshot } from "../systems/rooms.js";
import { normalizeRoomFurniture } from "../systems/furniture.js";
import { addLog } from "../systems/events.js";
import { restoreEconomyCycleState } from "../systems/economy-cycle.js";
import { resetAnnualMaintenance, setAnnualMaintenanceSlicing, updateSimulation } from "../simulation/simulation.js";
import { warmLogisticsRoutes } from "../systems/logistics.js";
import { warmEconomyCaches } from "../systems/economy.js";
import { warmFieldHarvestFactors } from "../systems/fields.js";
import { warmForestFaunaCaches } from "../systems/forest-fauna.js";
import { warmMicroEventContext } from "../systems/micro-events.js";
import { warmHealthCaches } from "../systems/health.js";
import { settleOpeningMuster, warmMilitaryCaches } from "../systems/military.js";
import { warmVillagerPaths } from "../simulation/villagers.js";
import { startGameLoop } from "./game-loop.js";
import { centerCamera,resize,clampCamera,setRenderScale } from "../presentation/camera.js";
import { drawTerrain, isTerrainDetailSettled } from "../presentation/rendering/terrain.js";
import { drawWorld } from "../presentation/rendering/renderer.js";
import { setupInput } from "../presentation/input.js";
import { renderUI,renderInitialUI,showBigMessage,setupMapViewControls } from "../presentation/rendering/ui.js";
import { createLocalProfile,getActiveProfile,readLocalSave,writeLocalSave,getLocalSaveInfo,listLocalProfiles,selectLocalProfile,loadSettings,saveSettings } from "../core/persistence.js";
import { startSoundtrack,setMusicEnabled,setMusicVolume,applySoundtrackSettings } from "../core/soundtrack.js";
import {getRandomStreamSnapshot,restoreRandomStreams} from "../core/random.js";
import {ensurePersonProfile,normalizePersonProfile,normalizePersonMemorial,MAX_PERSON_ARCHIVE} from "../systems/people.js";
import {setupCharacterDossier} from "../presentation/character-dossier.js";
import {normalizeFamilyLinks} from "../systems/families.js";
import {normalizeGovernment,GOVERNMENT_FORMS} from "../systems/government.js";
import {createIdentityState,normalizeIdentity,applyFoundingProfile,getFoundingModifiersFor,FOUNDING_PROFILES} from "../systems/identity.js";
import {createResearchState,normalizeResearchState} from "../systems/research.js";
import {createLegacyState,normalizeLegacyState,recordLegacy} from "../systems/legacy.js";
import {normalizeRoyalState} from "../systems/royal-dynasty.js";
import {createEndeavoursState,normalizeEndeavoursState} from "../systems/endeavours.js";
import {setupManagementUI} from "../presentation/management-ui.js";
import { clearTimelineNotifications } from "../presentation/event-notifications.js";
import {serializeRoads,restoreRoads} from "../systems/roads.js";
import {serializeResourceGeography,restoreResourceGeography} from "../systems/resource-geography.js";import {serializeForestFauna,restoreForestFauna} from "../systems/forest-fauna.js";import {serializeForestGathering,restoreForestGathering} from "../systems/forest-gathering.js";import {serializeForestSuccession,restoreForestSuccession} from "../systems/forest-succession.js";import { setupBuildUI } from "../presentation/build-ui.js";import { normalizeLayout,serializeLayout } from "../presentation/building-layout.js";
import {serializeCity,restoreCity,initializeCityForRealm,openGoodsBookForNewRealm} from "../systems/logistics.js";
import {SAVE_SCHEMA_VERSION,normalizeSaveSnapshot,validateSaveSnapshot} from "../core/save-validation.js";
import {migrateSaveSnapshot} from "../core/save-migrations.js";
import {createSaveSnapshot,prepareSaveSnapshot,restoreSaveSnapshot} from "../core/save-runtime.js";
import {initializeSettlementForRealm} from "../systems/settlement.js";import { initializeSettlementOwners } from "../systems/settlement-owners.js";import { normalizeAmbitions } from "../systems/ambitions.js";
import { createCrownSupplyState, normalizeCrownSupplyState } from "../systems/crown-supply.js";
import { setupWorkshopUI } from "../presentation/build-mode.js";
import {setupModalAccessibility} from "../presentation/modal-accessibility.js";
import {BENCHMARK_MIN_FRAMES,BENCHMARK_SAMPLE_MS,BENCHMARK_WARMUP_MS,buildBenchmarkPlan,findBenchmarkWinner,summarizeBenchmarkSamples} from "./performance-benchmark.js";
import { initializeWinterForRealm, refreshWinterSnapshot } from "../world/winter-economy.js";
import { createEndlessState } from "../systems/endless.js";
import { setupWinterHud } from "../presentation/winter-panel.js";
import { buildRandomStart } from "./start-randomizer.js";
import { SCENARIO_CLIMATES, SCENARIO_OBJECTIVES, SCENARIO_PRESETS, SCENARIO_PRESET_LIST, SCENARIO_SEASONS, applyScenarioStart, createCustomScenario, getScenarioStartDayForSeason, refreshScenarioProgress } from "../systems/scenario.js";
import { addScenarioToLibrary, readScenarioLibrary, removeScenarioFromLibrary } from "../core/scenario-library.js";
import { getDataPackScenarios, getDataPackSummary, installDataPack, parseDataPackText, removeDataPack } from "../core/data-packs.js";

let loopStarted=false;
let settings=loadSettings();
state.timeOfDay=settings.timeOfDay;
let customScenarios=[];
let dataPackScenarios=[];
let selectedScenarioId="free-realm";
let selectedScenarioDefinition=SCENARIO_PRESETS["free-realm"];
const scenarioEscape=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
function scenarioSeasonLabel(index){return (SCENARIO_SEASONS[Number(index)%4]||"spring").replace(/^./,letter=>letter.toUpperCase());}

// Possible chapters are clearly labelled flavour, not simulation output. They
// let the founding gate show the kind of story this climate can produce while
// the real chronicle remains entirely the player's own.
const POSSIBLE_CHAPTER_LANDSCAPES=Object.freeze({
    temperate:["the oak ridge","the river meadow","the market road"],
    northern:["the pine line","the frozen ford","the long road"],
    taiga:["the larch belt","the trapper trail","the frozen river"],
    tundra:["the lichen plain","the reindeer ford","the winter track"],
    savanna:["the acacia plain","the dry riverbed","the cattle road"],
    swamp:["the alder fen","the peat causeway","the drowned meadow"],
    mountain:["the high pass","the alpine meadow","the mine road"],
    volcanic:["the ash slope","the lava terrace","the black beach"],
    coastal:["the salt marsh","the harbour road","the cliff stair"],
    snow:["the snowfield","the ice road","the shelter wood"],
    mediterranean:["the olive slope","the hill road","the stone terrace"],
    arid:["the dry wash","the caravan road","the cistern yard"],
    enchanted:["the moon grove","the spirit path","the old stone ring"],
    tropical:["the rain canopy","the river landing","the jungle track"]
});
function possibleChaptersFor(seedValue,climate){
    const seed=Math.max(1,Math.floor(Number(seedValue)||1));
    const land=POSSIBLE_CHAPTER_LANDSCAPES[String(climate||"temperate")]||POSSIBLE_CHAPTER_LANDSCAPES.temperate;
    return [
        {year:3+(seed%5),tag:"THE LAND",title:"The "+land[0].replace(/^the /i,"")+" is opened",copy:"Saws, carts and surveyors reach "+land[0]+". The crown must decide what is taken and what is left."},
        {year:9+((seed>>3)%7),tag:"THE CROWN",title:"A neighbour tests the border",copy:"An envoy arrives with old maps, a marriage offer and a new toll on "+land[2]+". The answer will echo for years."},
        {year:17+((seed>>6)%9),tag:"THE CHRONICLE",title:"A hard season changes the map",copy:"Flood, fire or frost tests "+land[1]+". Stores, roads and woodland decide who remembers the crown kindly."}
    ];
}
function renderStartVignettes(){
    const container=document.getElementById("start-vignettes");
    if(!container)return;
    const seed=Number(document.getElementById("world-seed-input")?.value)||1;
    const climate=document.getElementById("world-climate")?.value||"temperate";
    container.innerHTML=possibleChaptersFor(seed,climate).map(chapter=>
        '<article class="start-vignette"><div class="start-vignette__top"><b>YEAR '+chapter.year+'</b><em>'+scenarioEscape(chapter.tag)+'</em></div>'
        +'<strong>'+scenarioEscape(chapter.title)+'</strong><small>'+scenarioEscape(chapter.copy)+'</small></article>').join("");
}
function scenarioDeadlineLabel(definition){
    const deadline=definition?.objective;
    return deadline?scenarioSeasonLabel(Math.floor(deadline.deadlineDay/100)%4)+", year "+deadline.deadlineYear:"";
}
function scenarioRewardText(effects={}){
    const parts=[];
    for(const key of ["food","wood","stone","gold"])if(Number(effects[key]))parts.push((Number(effects[key])>0?"+":"")+Number(effects[key])+" "+key);
    if(Number(effects.morale))parts.push((Number(effects.morale)>0?"+":"")+Number(effects.morale)+" morale");
    if(Number(effects.legitimacy))parts.push((Number(effects.legitimacy)>0?"+":"")+Number(effects.legitimacy)+" legitimacy");
    return parts.join(" · ")||"the realm's survival";
}
function scenarioStoreText(definition){
    return ["food","wood","stone","gold"].map(key=>Number(definition?.resources?.[key])>0?Number(definition.resources[key])+" "+key:"").filter(Boolean).join(" · ")||"no starting stores";
}
function scenarioById(id){return SCENARIO_PRESETS[id]||dataPackScenarios.find(entry=>entry.id===id)||customScenarios.find(entry=>entry.id===id)||SCENARIO_PRESETS["free-realm"];}
function applyInterfaceSettings(){
    document.body.classList.toggle("hide-resource-deltas",settings.showDeltas===false);
    document.body.classList.toggle("reduce-interface-motion",settings.reduceMotion===true);
    const root=document.documentElement;
    root.classList.toggle("ui-hide-tooltips",settings.showTooltips===false);
    root.classList.toggle("ui-reduced-motion",settings.reduceMotion===true);
    root.classList.toggle("ui-high-contrast",settings.highContrast===true);
}

function applyPerformanceSettings(){
    // The terrain is Canvas 2D only. Chromium logs a software-WebGL fallback
    // warning for any WebGL request on a software GPU, even a detached probe,
    // so the game never creates a WebGL context on a user-reachable path.
    state.terrainRenderer="canvas";
    state.terrainAutoMode="canvas";
    state.terrainMode="canvas";
    state.terrainRendererName="";
    state.terrainFallback=false;
    state.frameLimit=settings.frameLimit===30?30:60;
    state.showFps=settings.showFps===true;
    setRenderScale(settings.renderScale);
    state.terrainCacheRevision=(Number(state.terrainCacheRevision)||0)+1;
    state.terrainCacheHits=0;state.terrainCacheMisses=0;
    state.renderStats={fps:0,frameMs:0,mode:"canvas",fallback:false,renderScale:state.renderScale};
    const hud=document.getElementById("performance-hud");
    if(hud)hud.classList.toggle("hidden",state.showFps!==true);
}

let benchmarkRunning=false;
let benchmarkCancelRequested=false;
let benchmarkSettingsWasOpen=false;
let benchmarkSettingsDismissed=false;

function setBenchmarkStatus(message,tone=""){
    const status=document.getElementById("performance-benchmark-status");
    if(!status)return;
    status.textContent=message;
    status.classList.toggle("is-error",tone==="error");
}

function setBenchmarkLiveStatus(message){
    const status=document.getElementById("performance-benchmark-live-status");
    if(status)status.textContent=message;
}

function setBenchmarkLiveVisible(visible){
    const live=document.getElementById("performance-benchmark-live");
    if(live)live.classList.toggle("hidden",!visible);
}

function updateBenchmarkProgress(value,max){
    for(const id of ["performance-benchmark-progress","performance-benchmark-live-progress"]){
        const progress=document.getElementById(id);
        if(!progress)continue;
        progress.max=max;progress.value=value;
        progress.classList.remove("hidden");
    }
}

function setBenchmarkControlsDisabled(disabled){
    for(const id of ["settings-frame-limit","settings-render-scale","settings-fps-toggle"]){
        const control=document.getElementById(id);
        if(control)control.disabled=disabled;
    }
}

function benchmarkReady(){
    return state.hasStarted===true&&state.frameFaulted!==true&&Boolean(state.canvas&&state.ctx);
}

function benchmarkUnavailableMessage(){
    return state.frameFaulted===true
        ?{message:"Renderer unavailable after an internal error.",tone:"error"}
        :{message:"Start or load a realm first.",tone:""};
}

function refreshBenchmarkAvailability(){
    const button=document.getElementById("run-performance-benchmark");
    if(!button||benchmarkRunning)return;
    const ready=benchmarkReady();
    button.disabled=!ready;
    button.textContent="RUN BENCHMARK";
    if(!ready){
        const unavailable=benchmarkUnavailableMessage();
        setBenchmarkStatus(unavailable.message,unavailable.tone);
        return;
    }
    // Once a realm is live the stale "start or load a realm first" hint must
    // not linger in settings. Keep completed/cancelled run messages intact:
    // only the blocked-state hint is replaced by the ready hint.
    const status=document.getElementById("performance-benchmark-status");
    if(status&&(status.textContent==="Start or load a realm first."||status.textContent==="Renderer unavailable after an internal error.")){
        setBenchmarkStatus("Live scene ready · measure your device below.");
    }
}

function benchmarkDeviceSummary(){
    const rect=state.canvas?.getBoundingClientRect?.();
    const threads=Number(navigator.hardwareConcurrency);
    return [
        "LIVE SCENE",
        rect?Math.round(rect.width)+" × "+Math.round(rect.height)+" VIEW":null,
        Number.isFinite(threads)&&threads>0?threads+" THREADS":null
    ].filter(Boolean).join(" · ");
}

function formatBenchmarkMetric(value,suffix=""){
    return Number.isFinite(value)&&value>0?value.toFixed(1)+suffix:"—";
}

function renderBenchmarkResults(results,total,deviceLabel){
    const wrap=document.getElementById("performance-benchmark-results");
    const body=document.getElementById("performance-benchmark-body");
    const summary=document.getElementById("performance-benchmark-summary");
    if(!wrap||!body)return;
    if(!results.length){wrap.classList.add("hidden");return;}
    const winner=findBenchmarkWinner(results);
    body.innerHTML=results.map(row=>"<tr"+(winner===row?' class="is-best"':"")+"><td><strong>"+row.rendererLabel.toUpperCase()+"</strong>"+
        (winner===row?"<em>BEST</em>":"")+"</td><td>"+row.scaleLabel+"%</td><td>"+formatBenchmarkMetric(row.fps)+"</td><td>"+formatBenchmarkMetric(row.drawMs," ms")+"</td></tr>").join("");
    if(summary)summary.textContent=(results.length===total?"COMPLETE":"PARTIAL")+" · "+deviceLabel;
    wrap.classList.remove("hidden");
}

function waitForBenchmarkWarmup(durationMs){
    return new Promise(resolve=>{
        let settled=false;
        const started=performance.now();
        const startFrames=Number(state.renderedFrames)||0;
        const finish=()=>{
            if(settled)return;
            settled=true;clearTimeout(fallback);resolve();
        };
        const fallback=setTimeout(finish,durationMs+3000);
        const step=()=>{
            if(settled)return;
            const elapsed=performance.now()-started;
            const frames=(Number(state.renderedFrames)||0)-startFrames;
            if(benchmarkCancelRequested||(elapsed>=durationMs&&frames>=3)||elapsed>=durationMs+2500)finish();
            else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

function sampleBenchmarkFrames(durationMs){
    return new Promise(resolve=>{
        const frameTimes=[];
        const drawTimes=[];
        let firstFrameAt=0,lastFrameAt=0,settled=false;
        let lastRenderedFrames=Number(state.renderedFrames)||0;
        const startedWall=performance.now();
        const finish=()=>{
            if(settled)return;
            settled=true;clearTimeout(fallback);
            resolve(summarizeBenchmarkSamples(frameTimes,drawTimes));
        };
        const fallback=setTimeout(finish,durationMs+20000);
        const step=timestamp=>{
            if(settled)return;
            if(benchmarkCancelRequested){finish();return;}
            const rendered=Number(state.renderedFrames)||0;
            if(rendered!==lastRenderedFrames){
                lastRenderedFrames=rendered;
                if(firstFrameAt)frameTimes.push(Math.max(0,timestamp-lastFrameAt));
                else firstFrameAt=timestamp;
                lastFrameAt=timestamp;
                const drawMs=Number(state.lastDrawMs);
                if(Number.isFinite(drawMs)&&drawMs>=0)drawTimes.push(drawMs);
            }
            if(firstFrameAt&&timestamp-firstFrameAt>=durationMs&&frameTimes.length>=BENCHMARK_MIN_FRAMES){finish();return;}
            if(performance.now()-startedWall>=durationMs+19500){finish();return;}
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

async function runPerformanceBenchmark(){
    const button=document.getElementById("run-performance-benchmark");
    if(!button)return;
    if(benchmarkRunning){
        benchmarkCancelRequested=true;
        button.textContent="STOPPING…";
        setBenchmarkStatus("Stopping after the current sample…");
        setBenchmarkLiveStatus("Stopping after the current sample…");
        return;
    }
    if(!benchmarkReady()){
        const unavailable=benchmarkUnavailableMessage();
        setBenchmarkStatus(unavailable.message,unavailable.tone);
        refreshBenchmarkAvailability();
        return;
    }

    const originalSettings={...settings};
    const wasPaused=state.isPaused===true;
    const settingsModal=document.getElementById("settings-modal");
    benchmarkSettingsWasOpen=Boolean(settingsModal&&!settingsModal.classList.contains("hidden"));
    benchmarkSettingsDismissed=false;
    const plan=buildBenchmarkPlan();
    const deviceLabel=benchmarkDeviceSummary();
    const results=[];
    const progress=document.getElementById("performance-benchmark-progress");
    const meta=document.getElementById("performance-benchmark-meta");
    let cancelled=false,failed=false;

    benchmarkRunning=true;benchmarkCancelRequested=false;
    setBenchmarkControlsDisabled(true);
    button.disabled=false;button.textContent="CANCEL BENCHMARK";
    document.getElementById("performance-benchmark-results")?.classList.add("hidden");
    if(meta){meta.textContent=deviceLabel;meta.classList.remove("hidden");}
    updateBenchmarkProgress(0,plan.length);
    if(benchmarkSettingsWasOpen)settingsModal?.classList.add("hidden");
    setBenchmarkLiveVisible(true);
    const cancelButton=document.getElementById("performance-benchmark-cancel");
    if(cancelButton){cancelButton.disabled=false;cancelButton.textContent="CANCEL";cancelButton.focus({preventScroll:true});}
    setBenchmarkStatus("Preparing the live scene…");
    setBenchmarkLiveStatus("Preparing the live scene…");
    state.isPaused=true;

    try{
        // Prime the 100% surface once before scoring. Building the largest
        // terrain cache inside the first measured row made that row look slower.
        settings.renderScale=1;
        settings.frameLimit=60;
        applyPerformanceSettings();
        setBenchmarkStatus("PRIMING LIVE SCENE");
        setBenchmarkLiveStatus("PRIMING LIVE SCENE");
        await waitForBenchmarkWarmup(BENCHMARK_WARMUP_MS);
        if(benchmarkCancelRequested){cancelled=true;throw new Error("BENCHMARK CANCELLED");}

        for(let index=0;index<plan.length;index++){
            if(benchmarkCancelRequested){cancelled=true;break;}
            const config=plan[index];
            settings.renderScale=config.scale;
            settings.frameLimit=60;
            applyPerformanceSettings();
            const benchmarkMessage="WARMING "+(index+1)+"/"+plan.length+" · "+config.rendererLabel.toUpperCase()+" · "+config.scaleLabel+"%";
            setBenchmarkStatus(benchmarkMessage);setBenchmarkLiveStatus(benchmarkMessage);
            await waitForBenchmarkWarmup(BENCHMARK_WARMUP_MS);
            if(benchmarkCancelRequested){cancelled=true;break;}
            const samplingMessage="SAMPLING "+(index+1)+"/"+plan.length+" · "+config.rendererLabel.toUpperCase()+" · "+config.scaleLabel+"%";
            setBenchmarkStatus(samplingMessage);setBenchmarkLiveStatus(samplingMessage);
            const sample=await sampleBenchmarkFrames(BENCHMARK_SAMPLE_MS);
            if(benchmarkCancelRequested){cancelled=true;break;}
            if(sample.samples<3)throw new Error("No rendered frames were captured. Keep this tab visible and try again.");
            results.push({...config,mode:state.terrainMode,...sample});
            updateBenchmarkProgress(index+1,plan.length);
            renderBenchmarkResults(results,plan.length,deviceLabel);
        }
    }catch(error){
        if(cancelled){
            setBenchmarkStatus("BENCHMARK CANCELLED · SETTINGS RESTORED");
        }else{
            failed=true;
            console.error("Performance benchmark failed:",error);
            setBenchmarkStatus("BENCHMARK FAILED · "+error.message,"error");
        }
    }finally{
        Object.assign(settings,originalSettings);
        applyPerformanceSettings();
        state.isPaused=wasPaused;
        benchmarkRunning=false;benchmarkCancelRequested=false;
        setBenchmarkControlsDisabled(false);
        setBenchmarkLiveVisible(false);
        if(progress)progress.classList.add("hidden");
        button.textContent="RUN BENCHMARK";
        button.disabled=!benchmarkReady();
        if(benchmarkSettingsWasOpen&&!benchmarkSettingsDismissed)settingsModal?.classList.remove("hidden");
        benchmarkSettingsWasOpen=false;
        benchmarkSettingsDismissed=false;
        if(cancelButton){cancelButton.disabled=false;cancelButton.textContent="CANCEL";}
        if(results.length)renderBenchmarkResults(results,plan.length,deviceLabel);
        if(!failed){
            setBenchmarkStatus(cancelled
                ?"BENCHMARK CANCELLED · SETTINGS RESTORED"
                :"BENCHMARK COMPLETE · SETTINGS RESTORED");
        }
        setBenchmarkLiveStatus("");
    }
}

function bindCanvas(){
    state.canvas=document.getElementById("canvas");
    state.terrainCanvasEl=document.getElementById("terrain-canvas");
    state.ctx=state.canvas.getContext("2d",{alpha:true,desynchronized:true});
    state.minimapCanvas=document.getElementById("minimap");
    state.minimapCtx=state.minimapCanvas.getContext("2d");
    resize();
}

function randomSeed(){
    if(globalThis.crypto?.getRandomValues){
        const value=new Uint32Array(1);crypto.getRandomValues(value);return (value[0]%2147483000)+1;
    }
    return Math.floor(Math.random()*2147483000)+1;
}

const START_RANDOM_WORLD_FIELDS=Object.freeze({
    size:"world-size",shape:"world-shape",climate:"world-climate",landmass:"world-landmass",
    ruggedness:"world-ruggedness",forests:"world-forests",water:"world-water",fertility:"world-fertility",
    resources:"world-resources",mountains:"world-mountains",rivers:"world-rivers",lakes:"world-lakes",
    coastline:"world-coastline",snow:"world-snow",wetlands:"world-wetlands",aridity:"world-aridity"
});
const START_FORM_IDS=Object.freeze([
    "player-name-input","world-seed-input",
    "realm-name-input","realm-dynasty-input","realm-title-input","realm-culture","realm-government",
    "realm-religion","realm-tradition","realm-law","realm-legitimacy","realm-founding",
    "realm-background","realm-banner","realm-emblem",
    ...Object.values(START_RANDOM_WORLD_FIELDS),"world-endless"
]);
let randomStartBaseline=null;

function readStartFormState(){
    const values={};
    for(const id of START_FORM_IDS){
        const control=document.getElementById(id);
        if(!control)continue;
        values[id]=control.type==="checkbox"?Boolean(control.checked):String(control.value??"");
    }
    values.__scenarioId=selectedScenarioId;
    return values;
}

function writeStartFormState(values){
    if(!values)return;
    for(const id of START_FORM_IDS){
        if(!Object.hasOwn(values,id))continue;
        const control=document.getElementById(id);
        if(!control)continue;
        if(control.type==="checkbox")control.checked=Boolean(values[id]);
        else control.value=String(values[id]??"");
    }
    if(values.__scenarioId)selectScenario(values.__scenarioId,{applyClimate:false});
}

function setStartControl(id,value){
    const control=document.getElementById(id);
    if(!control)return;
    if(control.type==="checkbox")control.checked=Boolean(value);
    else control.value=String(value??"");
}

function selectedStartLabel(id){
    const option=document.getElementById(id)?.selectedOptions?.[0];
    return String(option?.textContent||"").split("·")[0].trim();
}

function renderRandomStartSummary(){
    const summary=document.getElementById("random-realm-summary");
    if(!summary)return;
    const value=id=>document.getElementById(id)?.value||"";
    const name=String(value("player-name-input")).trim()||"Realm Keeper";
    const realm=String(value("realm-name-input")).trim()||"New Realm";
    const dynasty=String(value("realm-dynasty-input")).trim()||"Royal House";
    const title=String(value("realm-title-input")).trim()||"Sovereign";
    const background=String(value("realm-background")).trim();
    const lines=[
        "KEEPER "+name+" · REALM "+realm+" · "+dynasty+" · "+title,
        "WORLD seed "+value("world-seed-input")+" · "+[selectedStartLabel("world-size"),selectedStartLabel("world-shape"),selectedStartLabel("world-climate")].filter(Boolean).join(" · "),
        "CULTURE "+selectedStartLabel("realm-culture")+" · "+selectedStartLabel("realm-government"),
        "FAITH "+selectedStartLabel("realm-religion")+" · "+selectedStartLabel("realm-tradition")+" · "+selectedStartLabel("realm-law")+" · "+selectedStartLabel("realm-legitimacy"),
        "CHARTER "+selectedStartLabel("realm-founding")+" · "+selectedStartLabel("realm-banner")+" · "+selectedStartLabel("realm-emblem"),
        "SCENARIO "+(selectedScenarioDefinition?.name||"Free Realm")+(selectedScenarioDefinition?.id!=="free-realm"?" · "+scenarioDeadlineLabel(selectedScenarioDefinition):" · NO DEADLINE"),
        document.getElementById("world-endless")?.checked?"∞ ENDLESS REALM":"CLASSIC FINITE CAMPAIGN"
    ];
    if(background)lines.push("“"+background+"”");
    summary.textContent=lines.join("\n");
}

function openRandomStartConfirm(){
    const panel=document.getElementById("random-realm-confirm");
    if(!panel)return;
    panel.hidden=false;
    document.getElementById("random-realm-btn")?.setAttribute("aria-expanded","true");
    renderRandomStartSummary();
    document.getElementById("random-realm-accept")?.focus();
}

function closeRandomStartConfirm(restore=false){
    const panel=document.getElementById("random-realm-confirm");
    if(restore&&randomStartBaseline){
        writeStartFormState(randomStartBaseline);
        syncWorldForge(readWorldOptions());
        refreshFoundingSummary();
        scheduleForgePreview();
    }
    randomStartBaseline=null;
    if(panel)panel.hidden=true;
    document.getElementById("random-realm-btn")?.setAttribute("aria-expanded","false");
}

function rollRandomStart(){
    if(!randomStartBaseline)randomStartBaseline=readStartFormState();
    const playerName=document.getElementById("player-name-input")?.value?.trim()||"";
    const choices=buildRandomStart({seed:randomSeed(),playerName});
    setStartControl("player-name-input",choices.playerName);
    setStartControl("world-seed-input",choices.seed);
    setStartControl("world-endless",choices.endless);
    for(const [key,id] of Object.entries(START_RANDOM_WORLD_FIELDS))setStartControl(id,choices.worldOptions[key]);
    setStartControl("realm-name-input",choices.identity.kingdomName);
    setStartControl("realm-dynasty-input",choices.identity.dynastyName);
    setStartControl("realm-title-input",choices.identity.rulerTitle);
    setStartControl("realm-culture",choices.identity.culture);
    setStartControl("realm-government",choices.government);
    setStartControl("realm-religion",choices.identity.religion);
    setStartControl("realm-tradition",choices.identity.tradition);
    setStartControl("realm-law",choices.identity.law);
    setStartControl("realm-legitimacy",choices.identity.legitimacy);
    setStartControl("realm-founding",choices.identity.startProfile);
    setStartControl("realm-background",choices.identity.background);
    setStartControl("realm-banner",choices.identity.banner);
    setStartControl("realm-emblem",choices.identity.emblem);
    syncWorldForge(choices.worldOptions);
    refreshFoundingSummary();
    scheduleForgePreview();
    openRandomStartConfirm();
}

function cancelRandomStart(){
    closeRandomStartConfirm(true);
    document.getElementById("random-realm-btn")?.focus();
}

function startRealmFromForm(trigger){
    closeRandomStartConfirm(false);
    // Unlock audio while the click is still a live user gesture. The realm
    // warm-up below is deliberately asynchronous and can outlive Safari's
    // transient activation window.
    startSoundtrack().catch(()=>{});
    const label=trigger.textContent;
    const randomButton=document.getElementById("random-realm-btn");
    trigger.disabled=true;
    if(randomButton)randomButton.disabled=true;
    trigger.textContent="FORGING THE REALM…";
    window.setTimeout(()=>{
        try{
            const active=getActiveProfile();
            const input=document.getElementById("player-name-input");
            const typed=input?.value?.trim();
            const player=active&&(!typed||typed===active.displayName)?active:createLocalProfile(typed||"Realm Keeper");
            const seed=Number(document.getElementById("world-seed-input")?.value);
            const worldOptions=readWorldOptions();
            startNewRealm(Number.isSafeInteger(seed)&&seed>0?seed:randomSeed(),player,worldOptions,selectedScenarioDefinition)
                .catch(error=>{failRealmLoading();showStatus(error.message);});
        }catch(error){showStatus(error.message);}
        finally{
            trigger.disabled=false;
            if(randomButton)randomButton.disabled=false;
            trigger.textContent=label;
        }
    },40);
}

function ensureProfile(){
    let profile=getActiveProfile();
    if(profile)return profile;
    const name=document.getElementById("player-name-input")?.value||"Realm Keeper";
    return createLocalProfile(name);
}

function resetForRun(profile){
    resetAnnualMaintenance();
    resetState();
    clearTimelineNotifications();
    state.endeavours=createEndeavoursState();
    state.crownSupply=createCrownSupplyState();
    invalidateRoomBonusCache();
    bindCanvas();
    state.activeProfileId=profile.id;
    state.playerName=profile.displayName;
    state.market=createMarketState();
    state.court=createCourtState();
    state.faith=createFaithState();
    state.justice=createJusticeState();
    state.identity=createIdentityState({kingdomName:"New Realm",dynastyName:"Royal House"});
    state.research=createResearchState();
    state.legacy=createLegacyState({foundedYear:1});
    state.diplomacy=createDiplomacyState();
    state.gameSpeed=1;
    state.isPaused=false;
    state.zoom=1;state.zoomTarget=1;state.zoomLevel=3;
    state.timeOfDay=settings.timeOfDay;
    applyPerformanceSettings();
}

function readWorldOptions(){
    const value=id=>Number(document.getElementById(id)?.value);
    const choice=id=>document.getElementById(id)?.value;
    return normalizeWorldOptions({
        size:choice("world-size"),shape:choice("world-shape"),climate:choice("world-climate"),
        landmass:value("world-landmass"),ruggedness:value("world-ruggedness"),forests:value("world-forests"),
        water:value("world-water"),fertility:value("world-fertility"),resources:value("world-resources"),
        mountains:value("world-mountains"),rivers:value("world-rivers"),lakes:value("world-lakes"),
        coastline:value("world-coastline"),snow:value("world-snow"),wetlands:value("world-wetlands"),
        aridity:value("world-aridity")
    });
}
function syncWorldForge(options){
    const normalized=normalizeWorldOptions(options);
    for(const [key,id] of [["size","world-size"],["shape","world-shape"],["climate","world-climate"]]){
        const select=document.getElementById(id);
        if(select)select.value=normalized[key];
    }
    const controls=[
        ["landmass",document.getElementById("world-landmass"),document.getElementById("world-landmass-value")],
        ["ruggedness",document.getElementById("world-ruggedness"),document.getElementById("world-ruggedness-value")],
        ["forests",document.getElementById("world-forests"),document.getElementById("world-forests-value")],
        ["water",document.getElementById("world-water"),document.getElementById("world-water-value")],
        ["fertility",document.getElementById("world-fertility"),document.getElementById("world-fertility-value")],
        ["resources",document.getElementById("world-resources"),document.getElementById("world-resources-value")],
        ["mountains",document.getElementById("world-mountains"),document.getElementById("world-mountains-value")],
        ["rivers",document.getElementById("world-rivers"),document.getElementById("world-rivers-value")],
        ["lakes",document.getElementById("world-lakes"),document.getElementById("world-lakes-value")],
        ["coastline",document.getElementById("world-coastline"),document.getElementById("world-coastline-value")],
        ["snow",document.getElementById("world-snow"),document.getElementById("world-snow-value")],
        ["wetlands",document.getElementById("world-wetlands"),document.getElementById("world-wetlands-value")],
        ["aridity",document.getElementById("world-aridity"),document.getElementById("world-aridity-value")]
    ];
    for(const [key,input,output] of controls){
        if(input&&Number.isFinite(Number(normalized[key])))input.value=String(normalized[key]);
        if(output)output.textContent=input?.value||"50";
    }
    const endless=document.getElementById("world-endless");
    if(endless)endless.checked=state.endless?.enabled!==false;
    renderStartVignettes();
    scheduleForgePreview();
}

let forgePreviewTimer=0;
function drawForgePreview(){
    const canvas=document.getElementById("world-preview");
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    const options=readWorldOptions();
    const seed=Number(document.getElementById("world-seed-input")?.value)||1;
    const started=performance.now();
    let rendered=null;
    try{rendered=renderWorldPreview(ctx,canvas.width,canvas.height,options,seed);}
    catch(error){/* a preview failure must never block founding */}
    const dims=resolveWorldDimensions(options);
    const size=document.getElementById("world-preview-size");
    if(size)size.textContent=dims.w+" × "+dims.h+" TILES";
    const summary=document.getElementById("world-preview-summary");
    if(summary)summary.textContent=options.climate.toUpperCase()+" · "+options.shape.toUpperCase();
    const status=document.getElementById("world-preview-status");
    if(status){
        const ms=Math.max(1,Math.round(performance.now()-started));
        status.textContent=rendered
            ?"EXACT PREVIEW · SEED "+seed+" · "+ms+" MS"
            :"PREVIEW UNAVAILABLE";
    }
}
function scheduleForgePreview(){
    // The forge is invisible during a campaign; rendering a colossal preview
    // after load would stall the game for over a second for no benefit.
    if(document.getElementById("start-screen")?.classList.contains("hidden"))return;
    window.clearTimeout(forgePreviewTimer);
    forgePreviewTimer=window.setTimeout(drawForgePreview,180);
}

function readIdentityOptions(){
    const value=id=>document.getElementById(id)?.value;
    return {
        kingdomName:value("realm-name-input"),dynastyName:value("realm-dynasty-input"),
        rulerTitle:value("realm-title-input"),culture:value("realm-culture"),
        religion:value("realm-religion"),tradition:value("realm-tradition"),
        law:value("realm-law"),legitimacy:value("realm-legitimacy"),
        startProfile:value("realm-founding"),background:value("realm-background"),
        banner:value("realm-banner"),emblem:value("realm-emblem")
    };
}

function applyIdentityForNewRealm(){
    const identity=createIdentityState({...readIdentityOptions(),foundedYear:1});
    state.identity=identity;
    state.kingdomName=identity.kingdomName;
    state.royal.dynastyName=identity.dynastyName;
    const form=document.getElementById("realm-government")?.value;
    if(form&&Object.hasOwn(GOVERNMENT_FORMS,form)){
        state.government.form=form;
        state.government.taxRate=GOVERNMENT_FORMS[form].tax;
    }
    state.legacy=createLegacyState({foundedYear:1});
    recordLegacy("realm","The realm is founded",identity.kingdomName+" is founded under "+identity.dynastyName+" with the "+identity.religion+" rite, "+identity.tradition+" custom and "+identity.law+" law.",{importance:4,year:1,tick:0});
    if(identity.background)recordLegacy("realm","Founding chronicle",identity.background,{importance:3,year:1,tick:0});
}

function refreshFoundingSummary(){
    const summary=document.getElementById("founding-summary");
    if(!summary)return;
    const identity=createIdentityState({...readIdentityOptions(),foundedYear:1});
    const modifiers=getFoundingModifiersFor(identity);
    const profile=FOUNDING_PROFILES[identity.startProfile];
    const pct=value=>{const n=Math.round(Number(value||0)*100);return (n>=0?"+":"")+n+"%";};
    summary.textContent=profile.label+" · "+profile.description+"  |  Tax "+pct(modifiers.tax)+" · Trade "+pct(modifiers.trade)+" · Research "+pct(modifiers.research)+" · Food demand "+pct(modifiers.foodDemand)+" · Legitimacy "+pct(modifiers.legitimacy)+" · Mortality "+pct(modifiers.mortality);
}

async function warmTerrainDetailForStart(){
    if(!state.ctx)return;
    drawTerrain(state.ctx);
    const started=performance.now();
    while(!isTerrainDetailSettled()&&performance.now()-started<1800){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        drawTerrain(state.ctx);
    }
}

const LOADING_STAGES=Object.freeze([
    {id:"survey",progress:8,heading:"Surveying the land",copy:"The forge reads the seed, the waters and the first forests."},
    {id:"settle",progress:31,heading:"Raising the first settlement",copy:"The keep finds its footing. Households, stores and the opening muster take shape."},
    {id:"chancery",progress:56,heading:"Opening the royal chancery",copy:"Trade routes, ledgers, seals and the first offices of the crown are being prepared."},
    {id:"chronicle",progress:79,heading:"Writing the first chronicle",copy:"A year of weather, work and neighbourly intent is already passing through the realm."},
    {id:"ready",progress:96,heading:"Opening the gates",copy:"The first view is warm and ready. Your sovereign is about to step into the light."}
]);
let realmLoad={active:false,startedAt:0,minMs:1600,chapterTimer:0,chapters:[],chapterIndex:0};
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function setRealmLoadingProgress(value){
    const progress=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
    const bar=document.getElementById("loading-progress");
    const track=document.getElementById("loading-progress-track");
    const label=document.getElementById("loading-percent");
    if(bar)bar.style.width=progress+"%";
    if(track)track.setAttribute("aria-valuenow",String(progress));
    if(label)label.textContent=progress+"%";
}
function setLoadingChapter(index=0){
    if(!realmLoad.chapters.length)return;
    realmLoad.chapterIndex=((index%realmLoad.chapters.length)+realmLoad.chapters.length)%realmLoad.chapters.length;
    const chapter=realmLoad.chapters[realmLoad.chapterIndex];
    const era=document.getElementById("loading-chapter-era");
    const title=document.getElementById("loading-chapter-title");
    const copy=document.getElementById("loading-chapter-copy");
    const card=document.getElementById("loading-chapter");
    if(era)era.textContent="YEAR "+chapter.year+" · "+chapter.tag+" · A POSSIBLE CHAPTER";
    if(title)title.textContent=chapter.title;
    if(copy)copy.textContent=chapter.copy;
    if(card){
        card.classList.remove("is-changing");
        void card.offsetWidth;
        card.classList.add("is-changing");
    }
}
function setRealmLoadingStage(id){
    if(!realmLoad.active)return;
    const index=Math.max(0,LOADING_STAGES.findIndex(stage=>stage.id===id));
    const stage=LOADING_STAGES[index]||LOADING_STAGES[0];
    const heading=document.getElementById("loading-heading");
    const copy=document.getElementById("loading-copy");
    if(heading)heading.textContent=stage.heading;
    if(copy)copy.textContent=stage.copy;
    document.querySelectorAll("#loading-steps [data-loading-step]").forEach(step=>{
        const stepIndex=LOADING_STAGES.findIndex(entry=>entry.id===step.dataset.loadingStep);
        step.classList.toggle("is-done",stepIndex>=0&&stepIndex<index);
        step.classList.toggle("is-current",stepIndex===index);
    });
    setRealmLoadingProgress(stage.progress);
}
async function beginRealmLoading({realmName="A NEW REALM",seed=1,climate="temperate"}={}){
    const screen=document.getElementById("start-screen");
    const loading=document.getElementById("start-loading");
    if(!screen||!loading)return;
    realmLoad={...realmLoad,active:true,startedAt:performance.now(),chapters:possibleChaptersFor(seed,climate),chapterIndex:0};
    const name=document.getElementById("loading-realm-name");
    const seedLabel=document.getElementById("loading-seed");
    const climateLabel=document.getElementById("loading-climate");
    if(name)name.textContent=String(realmName||"A NEW REALM").toUpperCase();
    if(seedLabel)seedLabel.textContent="SEED "+seed;
    if(climateLabel)climateLabel.textContent=String(climate).replace(/-/g," ").toUpperCase();
    const loadingMap=document.getElementById("start-loading-map");
    const preview=document.getElementById("world-preview");
    if(loadingMap&&preview){
        const ctx=loadingMap.getContext("2d");
        if(ctx){
            ctx.clearRect(0,0,loadingMap.width,loadingMap.height);
            ctx.fillStyle="#0b1513";ctx.fillRect(0,0,loadingMap.width,loadingMap.height);
            try{ctx.drawImage(preview,0,0,loadingMap.width,loadingMap.height);}catch{}
        }
    }
    screen.classList.add("is-loading");
    screen.setAttribute("aria-busy","true");
    loading.hidden=false;
    setLoadingChapter(0);
    setRealmLoadingStage("survey");
    window.clearInterval(realmLoad.chapterTimer);
    realmLoad.chapterTimer=window.setInterval(()=>setLoadingChapter(realmLoad.chapterIndex+1),1800);
    // Let the browser paint the gate before the heavier world assembly begins.
    await nextPaint();
}
async function holdRealmLoading(){
    if(!realmLoad.active)return;
    setRealmLoadingStage("ready");
    setRealmLoadingProgress(100);
    await nextPaint();
    const remaining=Math.max(0,realmLoad.minMs-(performance.now()-realmLoad.startedAt));
    if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
}
function finishRealmLoading(){
    window.clearInterval(realmLoad.chapterTimer);
    realmLoad.chapterTimer=0;
    const screen=document.getElementById("start-screen");
    const loading=document.getElementById("start-loading");
    if(loading)loading.hidden=true;
    if(screen){screen.classList.remove("is-loading");screen.removeAttribute("aria-busy");}
    realmLoad={...realmLoad,active:false,chapters:[]};
}
function failRealmLoading(){
    window.clearInterval(realmLoad.chapterTimer);
    realmLoad.chapterTimer=0;
    const screen=document.getElementById("start-screen");
    const loading=document.getElementById("start-loading");
    if(loading)loading.hidden=true;
    if(screen){screen.classList.remove("is-loading");screen.removeAttribute("aria-busy");}
    setRealmLoadingProgress(0);
    realmLoad={...realmLoad,active:false,chapters:[]};
}

async function startNewRealm(seed,profile,worldOptions=readWorldOptions(),scenarioDefinition=selectedScenarioDefinition){
    const foundingName=document.getElementById("realm-name-input")?.value?.trim()||"A New Realm";
    await beginRealmLoading({realmName:foundingName,seed,climate:worldOptions.climate});
    resetForRun(profile);
    applyIdentityForNewRealm();
    state.worldSeed=seed;
    state.worldOptions={...worldOptions};
    state.endless=createEndlessState({enabled:document.getElementById("world-endless")?.checked!==false});
    state.terrainVersion=TERRAIN_GENERATION_VERSION;
    // Apply the authored opening before world generation so the first biome
    // state, seasonal atlas and starting settlement all see the same calendar.
    applyScenarioStart(scenarioDefinition||SCENARIO_PRESETS["free-realm"]);
    initWorld(seed,state.worldOptions,state.terrainVersion);
    setRealmLoadingStage("settle");
    initStartingKingdom();
    const foundingGrant=applyFoundingProfile(state.identity?.startProfile);
    if(foundingGrant.id!=="balanced")addLog("FOUNDING CHARTER — "+foundingGrant.profile.label.toUpperCase(),"#d6b56d","milestone");
    initializeCityForRealm();
    normalizeHouseholdAssignments();
    initializeSettlementForRealm();
    initializeSettlementOwners();
    initializeWinterForRealm();
    initializePopulationRegister();
    refreshScenarioProgress();
    openGoodsBookForNewRealm();
    drawStartingHand();
    state.camera.x=0;state.camera.y=0;
    centerCamera();
    setRealmLoadingStage("chancery");
    // Finish the first terrain raster one 3 ms slice per frame while the start
    // screen covers the stage. The realm becomes interactive only with a
    // settled layer; this is startup work, not a blocked gameplay frame.
    await warmTerrainDetailForStart();
    // The realm is only "started" once every cache and the opening production
    // cycle are ready. The harness and the save system treat this flag as a
    // readiness signal, so it must not turn true while the world is still
    // being assembled behind the overlay.
    state.hasStarted=true;
    // Build the room ledger, modifier caches, reachability memo and opening
    // routes while the overlay still covers the stage. All are caches with the
    // same values as their lazy first use.
    getRoomBonusSnapshot();
    warmEconomyCaches();
    warmFieldHarvestFactors();
    warmForestFaunaCaches();
    warmMicroEventContext();
    warmHealthCaches();
    settleOpeningMuster();
    warmMilitaryCaches();
    warmLogisticsRoutes();
    warmVillagerPaths();
    addLog("KINGDOM FOUNDED — "+profile.displayName.toUpperCase(),"#e4bd72","milestone");
    addLog("A NEW REALM RISES · SEED "+seed,"#a3d6a7","milestone");
    // Pre-run the opening days behind the start overlay. These ticks build the
    // workforce, herd, logistics and production caches and run the first
    // seasonal/day boundaries. They are the same deterministic ticks the realm
    // would run a moment later; doing them here keeps the first visible frames
    // free of their one-off compilation and allocation cost.
    setRealmLoadingStage("chronicle");
    for(let warmTick=0;warmTick<60;warmTick++){
        updateSimulation();
        if(warmTick%6===0)setRealmLoadingProgress(79+Math.round(warmTick/60*17));
    }
    setAnnualMaintenanceSlicing(true);
    state.selectedTab=0;
    renderInitialUI();
    // Warm the complete entity/overlay draw pipeline and let the first HUD
    // layout settle while the start overlay still covers the stage. The realm
    // that becomes visible then starts on a warm canvas instead of paying the
    // first sprite allocations and style recalculation in gameplay frames.
    if (state.ctx) { drawWorld(); drawWorld(); }
    await nextPaint();
    await holdRealmLoading();
    document.getElementById("start-screen").classList.add("hidden");
    finishRealmLoading();
    document.getElementById("settings-modal").classList.add("hidden");
    // The founding form scrolls internally on phones; once it closes, return
    // the document to the map instead of leaving the player halfway down the
    // management panel.
    window.scrollTo(0, 0);
    if(!loopStarted){loopStarted=true;startGameLoop();}
    // The full HUD was already rendered behind the start overlay. Starting a
    // second refresh chain on the first visible frame only competes with it.
    startSoundtrack().catch(()=>{});
    // A newly founded realm must survive a reload even if the player never
    // discovers the Save button. This is the same snapshot the explicit Save
    // writes; it never changes the schema and a storage error must not undo an
    // otherwise playable founding.
    persistFoundingRealm();
}

function persistFoundingRealm(){
    if(!state.hasStarted||!state.activeProfileId)return false;
    try{
        const savedAt=writeLocalSave(state.activeProfileId,createSaveSnapshot());
        setSaveStatus("FOUNDING REALM SAVED · "+new Date(savedAt).toLocaleTimeString(),"saved");
        renderSaveSlots();
        addLog("FOUNDING REALM SAVED","#a3d6a7","system");
        return true;
    }catch(error){
        setSaveStatus("FOUNDING SAVE FAILED · "+error.message,"error");
        return false;
    }
}

function saveCurrentGame(){
    if(!state.hasStarted||!state.activeProfileId){showStatus("Create a local player profile before saving.");return false;}
    try{
        const savedAt=writeLocalSave(state.activeProfileId,createSaveSnapshot());
        showStatus("Realm saved · "+new Date(savedAt).toLocaleTimeString());
        setSaveStatus("LAST SAVED · "+new Date(savedAt).toLocaleTimeString(),"saved");
        addLog("GAME SAVED","#a3d6a7","system");
        renderSaveSlots();
        renderUI();
        return true;
    }catch(error){
        showStatus("Save failed: "+error.message);
        setSaveStatus("SAVE FAILED · "+error.message,"error");
        return false;
    }
}

function markLoadTime(name,startedAt){
    const times=globalThis.__KAC_LOAD_TIMES;
    if(times&&Number.isFinite(startedAt))times[name]=Math.round((performance.now()-startedAt)*10)/10;
}

function loadSnapshotIntoGame(profile,snapshot){
    let prepared;
    const prepareStarted=performance.now();
    try{
        prepared=prepareSaveSnapshot(snapshot);
    }catch(error){
        // Preflight failed before resetForRun. Callers must not reload a
        // rollback snapshot in this case: the active realm was never touched.
        if(error&&typeof error==="object")error.preStateChange=true;
        throw error;
    }
    markLoadTime("prepareMs",prepareStarted);
    const resetStarted=performance.now();
    resetForRun(profile);
    markLoadTime("resetMs",resetStarted);
    const restoreStarted=performance.now();
    const restored=restoreSaveSnapshot(prepared);
    markLoadTime("restoreMs",restoreStarted);
    refreshWinterSnapshot();
    setAnnualMaintenanceSlicing(true);
    const warmStarted=performance.now();
    // resetForRun clears readiness before the snapshot is applied. Restoring a
    // prepared snapshot rebuilds the realm and resumes the loop, so it must
    // mark the realm started again; otherwise every renderUI() call (HUD,
    // chronicle, active issue) silently returns and the loaded realm can never
    // open or dismiss a realm issue.
    state.hasStarted=true;
    // A saved mature realm has the same cold derived caches as a freshly
    // founded one. Warm them through the existing startup helpers before the
    // first visible tick; otherwise the first day pays several one-off
    // multi-millisecond rebuilds and can exceed the low-end frame budget.
    getRoomBonusSnapshot();
    warmEconomyCaches();
    warmFieldHarvestFactors();
    warmForestFaunaCaches();
    warmMicroEventContext();
    warmHealthCaches();
    warmMilitaryCaches();
    warmLogisticsRoutes();
    warmVillagerPaths();
    markLoadTime("warmMs",warmStarted);
    const savedSpeed=Number(state.gameSpeed);
    document.querySelectorAll(".speed-button").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.speed)===savedSpeed));
    if(restored.hasSavedCamera)clampCamera();else centerCamera();
    document.getElementById("start-screen").classList.add("hidden");
    window.scrollTo(0, 0);
    if(!loopStarted){loopStarted=true;startGameLoop();}
    const renderStarted=performance.now();
    renderUI();
    markLoadTime("uiMs",renderStarted);
    startSoundtrack().catch(()=>{});
}

function loadCurrentGame(){
    if(globalThis.__KAC_LOAD_TIMES)globalThis.__KAC_LOAD_TIMES={};
    const loadStarted=performance.now();
    startSoundtrack().catch(()=>{});
    const profile=getActiveProfile();
    if(!profile){showStatus("Create or select a local player profile first.");return false;}
    const readStarted=performance.now();
    const save=readLocalSave(profile.id);
    markLoadTime("readMs",readStarted);
    if(!save){showStatus("No valid saved realm or recovery backup exists for "+profile.displayName+".");return false;}
    const rollbackProfile=state.hasStarted&&state.activeProfileId
        ?{id:state.activeProfileId,displayName:state.playerName}
        :null;
    const rollbackStarted=performance.now();
    const rollbackSnapshot=rollbackProfile?createSaveSnapshot():null;
    markLoadTime("rollbackMs",rollbackStarted);
    try{
        loadSnapshotIntoGame(profile,save.snapshot);
        markLoadTime("totalMs",loadStarted);
        // A load replaces the realm under any toast left by the previous one.
        // Clear that action toast so it cannot report a trade or order that no
        // longer belongs to the realm now on screen; the save status and event
        // log carry the load confirmation instead.
        const actionToast=document.getElementById("action-toast");
        if(actionToast){actionToast.textContent="";actionToast.classList.remove("is-visible");}
        syncWorldForge(state.worldOptions);
        showStatus("Loaded realm"+(save.migratedFrom!=null?" · save migrated from schema "+save.migratedFrom:"")+(save.restoredFromBackup?" · previous backup restored":"")+" · "+new Date(save.savedAt).toLocaleString());
        setSaveStatus("LOADED · "+new Date(save.savedAt).toLocaleTimeString(),"saved");
        addLog("SAVE LOADED","#a3d6a7","system");
        renderSaveSlots();
        return true;
    }catch(error){
        let recovery="";
        if(rollbackProfile&&rollbackSnapshot&&!error?.preStateChange){
            try{
                loadSnapshotIntoGame(rollbackProfile,rollbackSnapshot);
                recovery=" · previous realm restored";
            }catch(restoreError){
                recovery=" · recovery also failed: "+restoreError.message;
            }
        }
        showStatus("Load failed: "+error.message+recovery);
        return false;
    }
}

function showStatus(message){
    const status=document.getElementById("status-message");
    if(status){status.textContent=message;status.classList.add("is-visible");}
}

function setSaveStatus(message,kind=""){
    const status=document.getElementById("save-status");
    if(!status)return;
    status.textContent=message;
    status.classList.toggle("is-saved",kind==="saved");
    status.classList.toggle("is-error",kind==="error");
}

function setArchiveStatus(message){
    const status=document.getElementById("save-archive-status");
    if(status)status.textContent=message;
}

function formatSaveDate(value){
    if(!value)return "NO SAVE RECORDED";
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"SAVE RECORD PRESENT":date.toLocaleString();
}

function renderSaveSlots(){
    const host=document.getElementById("save-slot-list");
    if(!host)return;
    host.replaceChildren();
    const profiles=listLocalProfiles();
    if(!profiles.length){
        const empty=document.createElement("p");
        empty.className="settings-archive-note";
        empty.textContent="No local profile exists yet. Found a realm to create the first save slot.";
        host.append(empty);
        return;
    }
    const active=getActiveProfile();
    const activeId=state.activeProfileId||active?.id||null;
    const sorted=profiles.slice().sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||""))||String(a.id).localeCompare(String(b.id)));
    for(const profile of sorted){
        const info=getLocalSaveInfo(profile.id);
        const row=document.createElement("div");
        row.className="save-slot"+(profile.id===activeId?" is-active":"");
        const copy=document.createElement("span");
        copy.className="save-slot__copy";
        const name=document.createElement("strong");
        name.textContent=profile.displayName||"Unnamed keeper";
        const date=document.createElement("small");
        date.textContent=formatSaveDate(info?.savedAt);
        const stateLabel=document.createElement("em");
        stateLabel.textContent=(profile.id===activeId?"ACTIVE PROFILE · ":"")+(info?(info.restoredFromBackup?"BACKUP RECOVERY RECORD":"LOCAL SAVE"):"NO REALM SAVED");
        copy.append(name,date,stateLabel);
        const button=document.createElement("button");
        button.type="button";
        button.textContent=info?(profile.id===activeId?"RELOAD":"LOAD"):"NO SAVE";
        button.disabled=!info;
        button.title=info?"Load "+(profile.displayName||"this local realm"):"This profile has no saved realm";
        button.addEventListener("click",()=>{
            try{
                if(getActiveProfile()?.id!==profile.id)selectLocalProfile(profile.id);
                if(loadCurrentGame()){
                    document.getElementById("settings-modal")?.classList.add("hidden");
                    setArchiveStatus("Loaded "+(profile.displayName||"local realm")+" · "+formatSaveDate(info.savedAt));
                }
            }catch(error){
                setArchiveStatus(error.message);
            }
        });
        row.append(copy,button);
        host.append(row);
    }
}

function exportRealm(){
    if(!state.hasStarted||!state.activeProfileId){
        setArchiveStatus("Start a realm before exporting a save.");
        showStatus("Start a realm before exporting a save.");
        return;
    }
    try{
        const profile=getActiveProfile();
        const payload={
            version:1,
            savedAt:new Date().toISOString(),
            profileId:state.activeProfileId,
            profileName:profile?.displayName||state.playerName,
            snapshot:createSaveSnapshot()
        };
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
        const url=URL.createObjectURL(blob);
        const link=document.createElement("a");
        const safeName=String(state.kingdomName||"realm").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"realm";
        link.href=url;
        link.download="kings-and-cards-"+safeName+"-"+new Date().toISOString().slice(0,10)+".json";
        document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        setArchiveStatus("Realm exported as a local JSON file. Keep it somewhere safe.");
        showStatus("Realm exported.");
    }catch(error){
        setArchiveStatus("Export failed: "+error.message);
        showStatus("Export failed: "+error.message);
    }
}

async function importRealm(file){
    if(!file)return;
    try{
        const payload=JSON.parse(await file.text());
        const snapshot=payload&&typeof payload==="object"&&payload.snapshot&&typeof payload.snapshot==="object"&&!Array.isArray(payload.snapshot)?payload.snapshot:payload;
        if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))throw new Error("The selected file does not contain a realm snapshot.");
        const payloadProfileId=payload&&typeof payload.profileId==="string"?payload.profileId:null;
        if(state.hasStarted&&state.activeProfileId&&payloadProfileId&&payloadProfileId!==state.activeProfileId){
            throw new Error("This save belongs to a different local profile. The current realm was not changed.");
        }
        // Validate before creating or selecting a profile, so a corrupt import
        // cannot leave a new local profile behind when there is no active realm.
        const preparedSnapshot=prepareSaveSnapshot(snapshot);
        const activeProfile=getActiveProfile();
        const profile=payloadProfileId
            ?(activeProfile&&activeProfile.id===payloadProfileId
                ?activeProfile
                :createLocalProfile(payload.profileName||preparedSnapshot.playerName||"Realm Keeper",payloadProfileId))
            :(activeProfile||ensureProfile());
        const rollbackProfile=state.hasStarted&&state.activeProfileId?{id:state.activeProfileId,displayName:state.playerName}:null;
        const rollbackSnapshot=rollbackProfile?createSaveSnapshot():null;
        try{
            loadSnapshotIntoGame(profile,preparedSnapshot);
        }catch(error){
            if(rollbackProfile&&rollbackSnapshot&&!error?.preStateChange){
                try{loadSnapshotIntoGame(rollbackProfile,rollbackSnapshot);}catch{/* keep the original error */}
            }
            throw error;
        }
        const savedAt=writeLocalSave(profile.id,createSaveSnapshot());
        syncWorldForge(state.worldOptions);
        document.getElementById("start-screen")?.classList.add("hidden");
        document.getElementById("settings-modal")?.classList.add("hidden");
        window.scrollTo(0, 0);
        setSaveStatus("IMPORTED · "+new Date(savedAt).toLocaleTimeString(),"saved");
        setArchiveStatus("Imported realm saved to "+(profile.displayName||"this profile")+".");
        showStatus("Realm imported · "+new Date(savedAt).toLocaleTimeString());
        addLog("IMPORTED REALM","#a3d6a7","system");
        renderSaveSlots();
        renderUI();
    }catch(error){
        setArchiveStatus("Import failed: "+error.message);
        showStatus("Import failed: "+error.message);
    }
}

function renderScenarioPicker(){
    const list=document.getElementById("scenario-preset-list");
    if(!list)return;
    const all=[...SCENARIO_PRESET_LIST,...dataPackScenarios,...customScenarios.filter(entry=>!SCENARIO_PRESETS[entry.id]&&!dataPackScenarios.some(pack=>pack.id===entry.id))];
    list.innerHTML=all.map(definition=>{
        const selected=definition.id===selectedScenarioId;
        const target=definition.objective?definition.objective.target+" "+(SCENARIO_OBJECTIVES[definition.objective.type]?.unit||"") : "Standard realm";
        const subtitle=definition.id==="free-realm"?"No deadline. Every world and charter option remains open.":scenarioSeasonLabel(definition.startSeason)+" opening · "+target+" target";
        const tag=definition.packName?"PACK · "+definition.packName:definition.difficulty;
        return '<button type="button" class="scenario-card'+(selected?' is-selected':'')+'" data-scenario-card="'+scenarioEscape(definition.id)+'" aria-pressed="'+(selected?'true':'false')+'">'+
            '<span class="scenario-card__tag">'+scenarioEscape(tag)+'</span>'+
            '<strong>'+scenarioEscape(definition.name)+'</strong>'+
            '<em>'+scenarioEscape(definition.description)+'</em>'+
            '<small>'+scenarioEscape(subtitle)+'</small>'+
            '</button>';
    }).join("");
    renderScenarioBriefing(selectedScenarioDefinition);
    renderScenarioDeleteButton();
}

function renderScenarioDeleteButton(){
    const button=document.getElementById("scenario-delete-custom");
    if(!button)return;
    button.hidden=!customScenarios.some(entry=>entry.id===selectedScenarioId);
}

function renderScenarioBriefing(definition){
    const box=document.getElementById("scenario-briefing");
    if(!box||!definition)return;
    if(definition.id==="free-realm"){
        box.innerHTML='<div class="scenario-briefing__head"><h3>Free Realm</h3><span>NO SCENARIO DEADLINE</span></div>'+
            '<p>'+scenarioEscape(definition.description)+'</p>'+
            '<div class="scenario-briefing__conditions"><span>OPENING <b>Spring · Year 1</b></span><span>STORES <b>World Forge defaults</b></span><span>MORALE / LEGITIMACY <b>65 / 65</b></span><span>OBJECTIVE <b>None</b></span></div>'+
            '<div class="scenario-briefing__goal">This is the classic open campaign. Choose a scenario card only when you want a different opening and a live objective.</div>';
        return;
    }
    const objective=definition.objective;
    const meta=SCENARIO_OBJECTIVES[objective.type];
    box.innerHTML='<div class="scenario-briefing__head"><h3>'+scenarioEscape(definition.name)+'</h3><span>'+scenarioEscape(definition.difficulty)+'</span></div>'+
        '<p>'+scenarioEscape(definition.description)+'</p>'+
        '<div class="scenario-briefing__conditions">'+
        '<span>OPENING <b>'+scenarioEscape(scenarioSeasonLabel(definition.startSeason))+' · Year 1</b></span>'+
        '<span>RECOMMENDED CLIMATE <b>'+scenarioEscape(definition.recommendedClimate)+'</b></span>'+
        '<span>STARTING STORES <b>'+scenarioEscape(scenarioStoreText(definition))+'</b></span>'+
        '<span>MORALE / LEGITIMACY <b>'+scenarioEscape(definition.morale)+' / '+scenarioEscape(definition.legitimacy)+'</b></span>'+
        '</div>'+
        '<div class="scenario-briefing__goal"><strong>'+scenarioEscape(meta?.label||"Objective")+':</strong> '+scenarioEscape(objective.target+" "+(meta?.unit||"")+" by "+scenarioDeadlineLabel(definition))+'<br><small>REWARD · '+scenarioEscape(scenarioRewardText(definition.reward))+' · IF MISSED · '+scenarioEscape(scenarioRewardText(definition.failure))+'</small></div>';
}

function selectScenario(id,{applyClimate=true}={}){
    selectedScenarioDefinition=scenarioById(id);
    selectedScenarioId=selectedScenarioDefinition.id;
    document.querySelectorAll("[data-scenario-card]").forEach(card=>{
        const selected=card.dataset.scenarioCard===selectedScenarioId;
        card.classList.toggle("is-selected",selected);
        card.setAttribute("aria-pressed",selected?"true":"false");
    });
    renderScenarioBriefing(selectedScenarioDefinition);
    renderScenarioDeleteButton();
    const status=document.getElementById("scenario-editor-status");
    if(status&&selectedScenarioDefinition.id!=="free-realm")status.textContent="Selected · "+selectedScenarioDefinition.name+". It will apply when the realm is founded.";
    if(applyClimate&&selectedScenarioDefinition.id!=="free-realm"){
        setStartControl("world-climate",selectedScenarioDefinition.recommendedClimate);
        syncWorldForge(readWorldOptions());
    }
}

function resetScenarioEditor(){
    const values={"scenario-name-input":"","scenario-description-input":"","scenario-climate-select":"temperate","scenario-season-select":"0","scenario-morale-input":"65","scenario-legitimacy-input":"65","scenario-food-input":"150","scenario-wood-input":"180","scenario-stone-input":"95","scenario-gold-input":"75","scenario-objective-select":"food","scenario-target-input":"150","scenario-deadline-year-input":"2"};
    for(const [id,value] of Object.entries(values))setStartControl(id,value);
    const objective=document.getElementById("scenario-objective-select");
    if(objective)objective.value="food";
    const target=document.getElementById("scenario-target-input");
    if(target)target.max="9999";
    const status=document.getElementById("scenario-editor-status");
    if(status)status.textContent="";
}

function saveCustomScenarioFromEditor(){
    const status=document.getElementById("scenario-editor-status");
    const name=String(document.getElementById("scenario-name-input")?.value||"").trim();
    const description=String(document.getElementById("scenario-description-input")?.value||"").trim();
    if(!name||!description){
        if(status)status.textContent="Enter a scenario name and a briefing before saving.";
        return;
    }
    const season=Math.max(0,Math.min(3,Number(document.getElementById("scenario-season-select")?.value)||0));
    const objectiveType=String(document.getElementById("scenario-objective-select")?.value||"food");
    const meta=SCENARIO_OBJECTIVES[objectiveType]||SCENARIO_OBJECTIVES.food;
    const objective={
        type:meta===SCENARIO_OBJECTIVES[objectiveType]?objectiveType:"food",
        target:Number(document.getElementById("scenario-target-input")?.value)||meta.defaultTarget,
        deadlineYear:Number(document.getElementById("scenario-deadline-year-input")?.value)||2,
        deadlineDay:299
    };
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,28)||"chronicle";
    try{
        const definition=createCustomScenario({
            id:"custom-"+slug+"-"+Date.now().toString(36).slice(-5),
            name,description,
            recommendedClimate:String(document.getElementById("scenario-climate-select")?.value||"temperate"),
            startDay:getScenarioStartDayForSeason(season),
            resources:{
                food:Number(document.getElementById("scenario-food-input")?.value)||0,
                wood:Number(document.getElementById("scenario-wood-input")?.value)||0,
                stone:Number(document.getElementById("scenario-stone-input")?.value)||0,
                gold:Number(document.getElementById("scenario-gold-input")?.value)||0
            },
            morale:Number(document.getElementById("scenario-morale-input")?.value)||0,
            legitimacy:Number(document.getElementById("scenario-legitimacy-input")?.value)||0,
            objective,
            reward:{food:40,morale:2},
            failure:{morale:-4}
        });
        customScenarios=addScenarioToLibrary(customScenarios,definition);
        selectScenario(definition.id,{applyClimate:true});
        renderScenarioPicker();
        if(status)status.textContent="Saved in this browser · "+definition.name+" is selected.";
    }catch(error){
        if(status)status.textContent=String(error?.message||"This scenario could not be saved.");
    }
}

function deleteSelectedCustomScenario(){
    if(!customScenarios.some(entry=>entry.id===selectedScenarioId))return;
    customScenarios=removeScenarioFromLibrary(customScenarios,selectedScenarioId);
    selectScenario("free-realm",{applyClimate:false});
    renderScenarioPicker();
    const status=document.getElementById("scenario-editor-status");
    if(status)status.textContent="Custom scenario deleted. The free realm is selected.";
}

function renderDataPackList(){
    const list=document.getElementById("data-pack-list");
    if(!list)return;
    const packs=getDataPackSummary();
    list.innerHTML=packs.length
        ?packs.map(pack=>'<div class="data-pack-row" data-data-pack="'+scenarioEscape(pack.id)+'"><div><strong>'+scenarioEscape(pack.name)+'</strong><small>'+scenarioEscape(pack.author)+' · v'+scenarioEscape(pack.version)+' · '+pack.scenarios+' scenario'+(pack.scenarios===1?'':'s')+' · '+pack.regions+' province label'+(pack.regions===1?'':'s')+'</small></div><button type="button" data-data-pack-remove="'+scenarioEscape(pack.id)+'">REMOVE</button></div>').join("")
        :'<p class="data-pack-empty">No local data pack is installed. The base scenarios and province names remain in use.</p>';
}

function refreshDataPackContent(){
    dataPackScenarios=getDataPackScenarios();
    renderDataPackList();
    renderScenarioPicker();
}

async function importDataPackFromFile(){
    const status=document.getElementById("data-pack-status");
    const input=document.getElementById("data-pack-file");
    const file=input?.files?.[0];
    if(!file){if(status)status.textContent="Choose a JSON data pack first.";return;}
    try{
        const pack=parseDataPackText(await file.text());
        const result=installDataPack(pack);
        if(!result.ok){if(status)status.textContent=result.error;return;}
        refreshDataPackContent();
        if(input)input.value="";
        if(status)status.textContent="Installed · "+pack.name+" · "+pack.scenarios.length+" scenario"+(pack.scenarios.length===1?"":"s")+" and "+pack.regions.length+" province label"+(pack.regions.length===1?"":"s")+".";
    }catch(error){
        if(status)status.textContent=String(error?.message||"This data pack could not be installed.");
    }
}

function removeInstalledDataPack(id){
    const status=document.getElementById("data-pack-status");
    const removedSelected=Boolean(selectedScenarioDefinition?.packName&&selectedScenarioDefinition.packId===id);
    removeDataPack(id);
    refreshDataPackContent();
    if(removedSelected)selectScenario("free-realm",{applyClimate:false});
    if(status)status.textContent="Data pack removed. Saved realms and their scenario objectives are unchanged.";
}

function setupScenarioPicker(){
    customScenarios=readScenarioLibrary();
    dataPackScenarios=getDataPackScenarios();
    renderDataPackList();
    const climate=document.getElementById("scenario-climate-select");
    if(climate)climate.innerHTML=SCENARIO_CLIMATES.map((id,index)=>'<option value="'+scenarioEscape(id)+'"'+(index===0?' selected':'')+'>'+scenarioEscape(id.replace(/^./,letter=>letter.toUpperCase()))+'</option>').join("");
    const objective=document.getElementById("scenario-objective-select");
    if(objective)objective.innerHTML=Object.entries(SCENARIO_OBJECTIVES).map(([id,meta])=>'<option value="'+scenarioEscape(id)+'"'+(id==="food"?' selected':'')+'>'+scenarioEscape(meta.label+' · '+meta.unit)+'</option>').join("");
    resetScenarioEditor();
    document.getElementById("scenario-preset-list")?.addEventListener("click",event=>{
        const card=event.target.closest("[data-scenario-card]");
        if(card)selectScenario(card.dataset.scenarioCard);
    });
    document.getElementById("scenario-save-custom")?.addEventListener("click",saveCustomScenarioFromEditor);
    document.getElementById("scenario-reset-custom")?.addEventListener("click",resetScenarioEditor);
    document.getElementById("scenario-delete-custom")?.addEventListener("click",deleteSelectedCustomScenario);
    document.getElementById("data-pack-import")?.addEventListener("click",importDataPackFromFile);
    document.getElementById("data-pack-list")?.addEventListener("click",event=>{
        const button=event.target.closest("[data-data-pack-remove]");
        if(button)removeInstalledDataPack(button.dataset.dataPackRemove);
    });
    document.getElementById("scenario-objective-select")?.addEventListener("change",event=>{
        const meta=SCENARIO_OBJECTIVES[event.target.value]||SCENARIO_OBJECTIVES.food;
        const target=document.getElementById("scenario-target-input");
        if(target){target.max=String(meta.max);target.value=String(meta.defaultTarget);}
    });
    renderScenarioPicker();
    selectScenario(selectedScenarioId,{applyClimate:false});
}

function bindMenu(){
    const profile=getActiveProfile();
    const nameInput=document.getElementById("player-name-input");
    if(profile&&nameInput)nameInput.value=profile.displayName;
    const saved=profile?readLocalSave(profile.id):null;
    const continueButton=document.getElementById("continue-game-btn");
    const resumePanel=document.getElementById("start-resume");
    if(resumePanel)resumePanel.hidden=!saved;
    if(continueButton){
        continueButton.disabled=!saved;
        continueButton.textContent=saved?"CONTINUE LAST REALM":"NO SAVED REALM";
    }
    const seedInput=document.getElementById("world-seed-input");
    if(seedInput)seedInput.value=String(randomSeed());
    const forgeDefaults=normalizeWorldOptions({});
    syncWorldForge(forgeDefaults);
    setupScenarioPicker();
    const identityControls=["realm-name-input","realm-dynasty-input","realm-title-input","realm-culture","realm-religion","realm-tradition","realm-law","realm-legitimacy","realm-founding","realm-background","realm-banner","realm-emblem"];
    identityControls.forEach(id=>{
        const control=document.getElementById(id);
        control?.addEventListener("input",refreshFoundingSummary);
        control?.addEventListener("change",refreshFoundingSummary);
    });
    refreshFoundingSummary();
    const forgeControls=["world-size","world-shape","world-climate","world-landmass","world-ruggedness","world-forests","world-water","world-fertility","world-resources","world-mountains","world-rivers","world-lakes","world-coastline","world-snow","world-wetlands","world-aridity"];
    forgeControls.forEach(id=>document.getElementById(id)?.addEventListener("input",()=>syncWorldForge(readWorldOptions())));
    seedInput?.addEventListener("input",()=>{scheduleForgePreview();renderStartVignettes();});
    document.getElementById("random-seed-btn")?.addEventListener("click",()=>{if(seedInput)seedInput.value=String(randomSeed());scheduleForgePreview();renderStartVignettes();});
    const startButton=document.getElementById("start-new-game-btn");
    startButton?.addEventListener("click",()=>startRealmFromForm(startButton));
    const customStartButton=document.getElementById("start-custom-game-btn");
    customStartButton?.addEventListener("click",()=>startRealmFromForm(customStartButton));
    document.getElementById("random-realm-btn")?.addEventListener("click",rollRandomStart);
    document.getElementById("random-realm-reroll")?.addEventListener("click",rollRandomStart);
    document.getElementById("random-realm-cancel")?.addEventListener("click",cancelRandomStart);
    document.getElementById("random-realm-accept")?.addEventListener("click",event=>startRealmFromForm(event.currentTarget));
    document.getElementById("random-realm-confirm")?.addEventListener("keydown",event=>{
        if(event.key==="Escape")cancelRandomStart();
    });
    // A manual edit while the offer is open must be reflected in the summary
    // the player is about to confirm. This only touches presentation.
    const refreshRandomSummary=()=>{
        const panel=document.getElementById("random-realm-confirm");
        if(panel&&!panel.hidden)renderRandomStartSummary();
    };
    START_FORM_IDS.forEach(id=>{
        const control=document.getElementById(id);
        control?.addEventListener("input",refreshRandomSummary);
        control?.addEventListener("change",refreshRandomSummary);
    });
    drawForgePreview();
    continueButton?.addEventListener("click",loadCurrentGame);
    document.getElementById("load-game-btn")?.addEventListener("click",loadCurrentGame);

    document.getElementById("save-btn")?.addEventListener("click",saveCurrentGame);
    document.getElementById("load-btn")?.addEventListener("click",loadCurrentGame);
    const openSettings=()=>{
        if(benchmarkRunning)return;
        renderSaveSlots();
        refreshBenchmarkAvailability();
        const timeControl=document.getElementById("settings-time-of-day");
        if(timeControl){
            const current=Number(state.timeOfDay);
            timeControl.value=String(Number.isFinite(current)?Math.max(0,Math.min(23,current)):12);
            timeControl.dispatchEvent(new Event("input"));
        }
        document.getElementById("settings-modal").classList.remove("hidden");
    };
    document.getElementById("settings-btn")?.addEventListener("click",openSettings);
    document.getElementById("start-settings-btn")?.addEventListener("click",openSettings);
    document.getElementById("run-performance-benchmark")?.addEventListener("click",runPerformanceBenchmark);
    document.getElementById("performance-benchmark-cancel")?.addEventListener("click",()=>{
        if(!benchmarkRunning)return;
        benchmarkCancelRequested=true;
        const cancelButton=document.getElementById("performance-benchmark-cancel");
        if(cancelButton){cancelButton.disabled=true;cancelButton.textContent="STOPPING…";}
        setBenchmarkLiveStatus("Stopping after the current sample…");
    });
    document.getElementById("export-save-btn")?.addEventListener("click",exportRealm);
    const importInput=document.getElementById("import-save-input");
    importInput?.addEventListener("change",async event=>{
        const file=event.target.files?.[0];
        await importRealm(file);
        event.target.value="";
    });
    const dismissSettingsDuringBenchmark=()=>{
        if(!benchmarkRunning)return;
        benchmarkCancelRequested=true;
        benchmarkSettingsDismissed=true;
        setBenchmarkStatus("Stopping after the current sample…");
        setBenchmarkLiveStatus("Stopping after the current sample…");
        const cancelButton=document.getElementById("performance-benchmark-cancel");
        if(cancelButton){cancelButton.disabled=true;cancelButton.textContent="STOPPING…";}
    };
    document.addEventListener("kac:settings-dismissed",dismissSettingsDuringBenchmark);
    document.getElementById("settings-close")?.addEventListener("click",()=>{
        dismissSettingsDuringBenchmark();
        document.getElementById("settings-modal").classList.add("hidden");
    });
    document.getElementById("settings-music-toggle")?.addEventListener("change",event=>{
        settings.musicEnabled=event.target.checked;setMusicEnabled(settings.musicEnabled);saveSettings(settings);
    });
    document.getElementById("settings-music-volume")?.addEventListener("input",event=>{
        settings.musicVolume=Number(event.target.value)/100;setMusicVolume(settings.musicVolume);saveSettings(settings);
    });
    const musicToggle=document.getElementById("settings-music-toggle");
    const volume=document.getElementById("settings-music-volume");
    if(musicToggle)musicToggle.checked=settings.musicEnabled;
    if(volume)volume.value=String(Math.round(settings.musicVolume*100));
    // The help sheet advertises M as the music shortcut; keep that shortcut
    // wired to the same persisted setting as the settings toggle.
    window.addEventListener("keydown",event=>{
        if(String(event.key).toLowerCase()!=="m"||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
        const target=event.target;
        if(target instanceof HTMLElement&&(target.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(target.tagName)))return;
        settings.musicEnabled=!settings.musicEnabled;
        setMusicEnabled(settings.musicEnabled);
        if(musicToggle)musicToggle.checked=settings.musicEnabled;
        saveSettings(settings);
    });
    const deltasToggle=document.getElementById("settings-deltas-toggle");
    if(deltasToggle){deltasToggle.checked=settings.showDeltas!==false;deltasToggle.addEventListener("change",event=>{settings.showDeltas=event.target.checked;applyInterfaceSettings();saveSettings(settings);});}
    const tooltipsToggle=document.getElementById("settings-tooltips-toggle");
    if(tooltipsToggle){tooltipsToggle.checked=settings.showTooltips!==false;tooltipsToggle.addEventListener("change",event=>{settings.showTooltips=event.target.checked;applyInterfaceSettings();saveSettings(settings);});}
    const motionToggle=document.getElementById("settings-motion-toggle");
    if(motionToggle){motionToggle.checked=settings.reduceMotion===true;motionToggle.addEventListener("change",event=>{settings.reduceMotion=event.target.checked;applyInterfaceSettings();saveSettings(settings);});}
    const highContrastToggle=document.getElementById("settings-high-contrast-toggle");
    if(highContrastToggle){highContrastToggle.checked=settings.highContrast===true;highContrastToggle.addEventListener("change",event=>{settings.highContrast=event.target.checked;applyInterfaceSettings();saveSettings(settings);});}
    const timeOfDayControl=document.getElementById("settings-time-of-day");
    const timeOfDayValue=document.getElementById("settings-time-of-day-value");
    if(timeOfDayControl){
        const syncTimeOfDay=()=>{
            const value=Number(timeOfDayControl.value);
            state.timeOfDay=Number.isFinite(value)?Math.max(0,Math.min(23,Math.round(value))):12;
            settings.timeOfDay=state.timeOfDay;
            saveSettings(settings);
            const hour=Math.floor(state.timeOfDay)%24;
            const minutes=Math.round((state.timeOfDay-hour)*60)%60;
            const label=String(hour).padStart(2,"0")+":"+String(minutes).padStart(2,"0");
            if(timeOfDayValue)timeOfDayValue.textContent=label;
            timeOfDayControl.setAttribute("aria-valuetext",label);
        };
        const initialTime=Number(state.timeOfDay);
        timeOfDayControl.value=String(Number.isFinite(initialTime)?Math.max(0,Math.min(23,initialTime)):12);
        syncTimeOfDay();
        timeOfDayControl.addEventListener("input",syncTimeOfDay);
    }
    const frameLimitSelect=document.getElementById("settings-frame-limit");
    if(frameLimitSelect){
        frameLimitSelect.value=String(settings.frameLimit);
        frameLimitSelect.addEventListener("change",event=>{settings.frameLimit=Number(event.target.value)===30?30:60;applyPerformanceSettings();saveSettings(settings);});
    }
    const renderScaleSelect=document.getElementById("settings-render-scale");
    if(renderScaleSelect){
        renderScaleSelect.value=String(Math.round(settings.renderScale*100));
        renderScaleSelect.addEventListener("change",event=>{settings.renderScale=Number(event.target.value)/100;applyPerformanceSettings();saveSettings(settings);});
    }
    const fpsToggle=document.getElementById("settings-fps-toggle");
    if(fpsToggle){
        fpsToggle.checked=settings.showFps===true;
        fpsToggle.addEventListener("change",event=>{settings.showFps=event.target.checked;applyPerformanceSettings();saveSettings(settings);});
    }
    applyInterfaceSettings();
    applyPerformanceSettings();

    document.getElementById("big-message-close")?.addEventListener("click",()=>document.getElementById("big-message").classList.add("hidden"));
    window.addEventListener("kac:save-request",saveCurrentGame);
    window.addEventListener("kac:load-request",loadCurrentGame);
    window.addEventListener("kac:winter-change",()=>{ if(state.hasStarted){ renderUI(); if(state.ctx) drawWorld(); } });
    window.addEventListener("kac:focus-map",event=>{
        const x=Number(event.detail?.x),y=Number(event.detail?.y);
        if(!Number.isFinite(x)||!Number.isFinite(y)||!state.canvas)return;
        state.camera.x=x*CELL*state.zoom-state.canvas.width/2;
        state.camera.y=y*CELL*state.zoom-state.canvas.height/2;
        clampCamera();
        document.getElementById("people-modal")?.classList.add("hidden");
    });
}

// The banner grows to two or three rows on tablets and phones. Anchor the
// transient event toast below the real header and horizontal admin rail so it
// can never cover the crown's controls. This is a resize-only measurement, not
// per-frame work.
function syncHudAnchors(){
    const topbar=document.querySelector(".topbar");
    if(!topbar)return;
    const topbarHeight=Math.round(topbar.getBoundingClientRect().height);
    const nav=document.querySelector(".realm-nav");
    const stacked=window.matchMedia("(max-width: 900px)").matches;
    const navHeight=stacked&&nav?Math.round(nav.getBoundingClientRect().height):0;
    document.documentElement.style.setProperty("--kac-topbar-height",topbarHeight+"px");
    document.documentElement.style.setProperty("--kac-event-top",(topbarHeight+navHeight+10)+"px");
}
let hudAnchorFrame=0;
function scheduleHudAnchors(){
    if(hudAnchorFrame)return;
    hudAnchorFrame=requestAnimationFrame(()=>{hudAnchorFrame=0;syncHudAnchors();});
}

function init(){
    bindCanvas();
    setupInput();
    setupCharacterDossier();
    setupManagementUI();
    setupWinterHud();
    setupMapViewControls();
    setupModalAccessibility();
    document.getElementById("warning-inbox-btn")?.addEventListener("click",()=>{
        if(state.activeEvent&&!state.activeEvent.dismissed)state.activeEvent.dismissed=true;
        document.getElementById("realm-event-modal")?.classList.add("hidden");
        renderUI();
    });
    document.getElementById("realm-event-chronicle")?.addEventListener("click",()=>{
        if(state.activeEvent)state.activeEvent.dismissed=true;
        document.getElementById("realm-event-modal")?.classList.add("hidden");
        document.querySelector('.realm-nav-button[data-kac-panel="chronicle"]')?.click();
        renderUI();
    });
    document.getElementById("realm-event-participants")?.addEventListener("click",event=>{
        const button=event.target.closest("[data-event-person]");
        if(!button)return;
        window.dispatchEvent(new CustomEvent("kac:open-person",{detail:{personId:String(button.dataset.eventPerson||"")}}));
    });
    document.getElementById("realm-event-dismiss")?.addEventListener("click",()=>{
        if(state.activeEvent){
            state.activeEvent.dismissed=true;
            // Dismissal is immediate; the chunked HUD refresh is not allowed to
            // leave a blocking modal on screen after the player has closed it.
            document.getElementById("realm-event-modal")?.classList.add("hidden");
            renderUI();
        }
    });
setupBuildUI();
    setupWorkshopUI();
    bindMenu();
    applySoundtrackSettings(settings);
    syncHudAnchors();
    window.addEventListener("resize",scheduleHudAnchors);
    if(typeof ResizeObserver!=="undefined"){
        const hudObserver=new ResizeObserver(scheduleHudAnchors);
        hudObserver.observe(document.querySelector(".topbar"));
        hudObserver.observe(document.querySelector(".realm-nav"));
    }
    window.addEventListener("resize",resize);
    const ctx=state.ctx;
    ctx.fillStyle="#0a120a";ctx.fillRect(0,0,state.canvas.width,state.canvas.height);
    ctx.fillStyle="#e6cc91";ctx.font="600 16px monospace";ctx.textAlign="center";
    ctx.fillText("WELCOME TO YOUR REALM",state.canvas.width/2,state.canvas.height/2);
    const profile=getActiveProfile();
    if(profile)state.playerName=profile.displayName;
}
init();
