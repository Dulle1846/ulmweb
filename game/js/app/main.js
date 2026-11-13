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
import { invalidateRoomBonusCache } from "../systems/rooms.js";
import { normalizeRoomFurniture } from "../systems/furniture.js";
import { addLog } from "../systems/events.js";
import { restoreEconomyCycleState } from "../systems/economy-cycle.js";
import { startGameLoop } from "./game-loop.js";
import { centerCamera,resize,clampCamera,setRenderScale } from "../presentation/camera.js";
import { terrainRendererInfo } from "../presentation/rendering/terrain-webgl.js";
import { setupInput } from "../presentation/input.js";
import { renderUI,showBigMessage,setupMapViewControls } from "../presentation/rendering/ui.js";
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
import {initializeSettlementForRealm} from "../systems/settlement.js";import { normalizeAmbitions } from "../systems/ambitions.js";
import { createCrownSupplyState, normalizeCrownSupplyState } from "../systems/crown-supply.js";
import { setupWorkshopUI } from "../presentation/build-mode.js";
import {setupModalAccessibility} from "../presentation/modal-accessibility.js";
import {BENCHMARK_MIN_FRAMES,BENCHMARK_SAMPLE_MS,BENCHMARK_WARMUP_MS,buildBenchmarkPlan,findBenchmarkWinner,summarizeBenchmarkSamples} from "./performance-benchmark.js";

let loopStarted=false;
let settings=loadSettings();
// A canvas can only ever own one context type. Keep one prepared surface per
// renderer instead of allocating (and losing) a WebGL context on every switch.
let terrainCanvas2D=null;
let terrainCanvasWebGL=null;
let appliedTerrainMode=null;
function applyInterfaceSettings(){
    document.body.classList.toggle("hide-resource-deltas",settings.showDeltas===false);
    document.body.classList.toggle("reduce-interface-motion",settings.reduceMotion===true);
    const root=document.documentElement;
    root.classList.toggle("ui-hide-tooltips",settings.showTooltips===false);
    root.classList.toggle("ui-reduced-motion",settings.reduceMotion===true);
    root.classList.toggle("ui-high-contrast",settings.highContrast===true);
}

function cloneTerrainCanvas(previous){
    const canvas=previous.cloneNode(false);
    canvas.width=Math.max(1,Number(previous.width)||1);
    canvas.height=Math.max(1,Number(previous.height)||1);
    canvas.style.opacity="";
    canvas.style.transform="";
    return canvas;
}

function cacheTerrainCanvas(mode,canvas){
    if(!canvas)return;
    if(mode==="webgl")terrainCanvasWebGL=canvas;
    else terrainCanvas2D=canvas;
}

function activateTerrainCanvas(next){
    const previous=state.terrainCanvasEl;
    if(!next||next===previous)return;
    // Never resize the cached surface here. Assigning width/height clears a
    // Canvas2D backing store while terrain.js still considers its detail layer
    // valid, which left the switched-back terrain black. ensureTerrainSurface()
    // and drawTerrainGL() resize on the next draw and invalidate their caches
    // when the size actually changes.
    next.style.opacity="";
    next.style.transform="";
    if(previous?.parentElement)previous.replaceWith(next);
    else document.getElementById("terrain-canvas")?.replaceWith(next);
    state.terrainCanvasEl=next;
}

function selectTerrainCanvas(nextMode,previousMode){
    const active=state.terrainCanvasEl;
    if(!active)return;
    if(previousMode==="webgl"&&!terrainCanvasWebGL)terrainCanvasWebGL=active;
    if(previousMode==="canvas"&&!terrainCanvas2D)terrainCanvas2D=active;
    let next=nextMode==="webgl"?terrainCanvasWebGL:terrainCanvas2D;
    if(!next){
        next=cloneTerrainCanvas(active);
        cacheTerrainCanvas(nextMode,next);
    }
    activateTerrainCanvas(next);
}

function applyPerformanceSettings(){
    state.terrainRenderer=settings.terrainRenderer;
    state.frameLimit=settings.frameLimit===30?30:60;
    state.adaptiveQuality=settings.adaptiveQuality!==false;
    state.showFps=settings.showFps===true;
    setRenderScale(settings.renderScale);
    const firstApply=appliedTerrainMode===null;
    let info=null;
    // Use the real initial surface for the one-time probe. On a software
    // renderer it becomes the cached WebGL canvas, so the probe context is
    // recycled later instead of staying as a second, unused context.
    if(settings.terrainRenderer!=="canvas")info=terrainRendererInfo(firstApply?state.terrainCanvasEl:null);
    state.terrainRendererName=info?.name||"";
    const nextMode=settings.terrainRenderer==="auto"
        ?(!info||info.software?"canvas":"webgl")
        :settings.terrainRenderer;
    if(firstApply){
        appliedTerrainMode=nextMode;
        if(nextMode==="webgl"||info?.boundCanvas){
            // Auto may have bound the initial surface to WebGL and then chosen
            // Canvas because it is software. Keep that context for a later
            // switch and give Canvas mode its own surface.
            cacheTerrainCanvas("webgl",state.terrainCanvasEl);
            if(nextMode==="canvas"){
                const canvas2D=cloneTerrainCanvas(state.terrainCanvasEl);
                cacheTerrainCanvas("canvas",canvas2D);
                activateTerrainCanvas(canvas2D);
            }
        }else{
            cacheTerrainCanvas("canvas",state.terrainCanvasEl);
        }
    }else if(appliedTerrainMode!==nextMode){
        selectTerrainCanvas(nextMode,appliedTerrainMode);
        appliedTerrainMode=nextMode;
    }
    state.terrainAutoMode=nextMode;
    state.terrainMode=nextMode;
    state.terrainFallback=false;
    state.terrainCacheRevision=(Number(state.terrainCacheRevision)||0)+1;
    state.terrainCacheHits=0;state.terrainCacheMisses=0;
    state.renderStats={fps:0,frameMs:0,mode:state.terrainMode,fallback:false,renderScale:state.renderScale};
    const hud=document.getElementById("performance-hud");
    if(hud)hud.classList.toggle("hidden",state.showFps!==true);
}

let benchmarkRunning=false;
let benchmarkCancelRequested=false;

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
    for(const id of ["settings-terrain-renderer","settings-frame-limit","settings-render-scale","settings-adaptive-toggle","settings-fps-toggle"]){
        const control=document.getElementById(id);
        if(control)control.disabled=disabled;
    }
}

function benchmarkReady(){
    return state.hasStarted===true&&state.frameFaulted!==true&&Boolean(state.canvas&&state.ctx);
}

function refreshBenchmarkAvailability(){
    const button=document.getElementById("run-performance-benchmark");
    if(!button||benchmarkRunning)return;
    const ready=benchmarkReady();
    button.disabled=!ready;
    button.textContent="RUN BENCHMARK";
    if(!ready)setBenchmarkStatus("Found a realm to benchmark the live scene.");
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

function benchmarkActualMode(row){
    const actual=row.mode==="webgl"?"WEBGL":"CANVAS";
    return row.renderer==="auto"||row.mode!==row.renderer?"ACTUAL "+actual:"";
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
    body.innerHTML=results.map(row=>{
        const actual=benchmarkActualMode(row);
        return "<tr"+(winner===row?' class="is-best"':"")+"><td><strong>"+row.rendererLabel.toUpperCase()+"</strong>"+
            (actual?"<small>"+actual+"</small>":"")+(winner===row?"<em>BEST</em>":"")+
            "</td><td>"+row.scaleLabel+"%</td><td>"+formatBenchmarkMetric(row.fps)+"</td><td>"+formatBenchmarkMetric(row.drawMs," ms")+"</td></tr>";
    }).join("");
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
        setBenchmarkStatus("Found a realm to benchmark the live scene.");
        refreshBenchmarkAvailability();
        return;
    }

    const originalSettings={...settings};
    const wasPaused=state.isPaused===true;
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
    document.getElementById("settings-modal")?.classList.add("hidden");
    setBenchmarkLiveVisible(true);
    const cancelButton=document.getElementById("performance-benchmark-cancel");
    if(cancelButton){cancelButton.disabled=false;cancelButton.textContent="CANCEL";cancelButton.focus({preventScroll:true});}
    setBenchmarkStatus("Preparing the live scene…");
    setBenchmarkLiveStatus("Preparing the live scene…");
    state.isPaused=true;

    try{
        // Prime the 100% surface once before scoring. Building the largest
        // terrain cache inside the first measured row made that row look slower.
        settings.terrainRenderer="auto";
        settings.renderScale=1;
        settings.frameLimit=60;
        settings.adaptiveQuality=false;
        applyPerformanceSettings();
        setBenchmarkStatus("PRIMING LIVE SCENE");
        setBenchmarkLiveStatus("PRIMING LIVE SCENE");
        await waitForBenchmarkWarmup(BENCHMARK_WARMUP_MS);
        if(benchmarkCancelRequested){cancelled=true;throw new Error("BENCHMARK CANCELLED");}

        for(let index=0;index<plan.length;index++){
            if(benchmarkCancelRequested){cancelled=true;break;}
            const config=plan[index];
            settings.terrainRenderer=config.renderer;
            settings.renderScale=config.scale;
            settings.frameLimit=60;
            settings.adaptiveQuality=false;
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
        document.getElementById("settings-modal")?.classList.remove("hidden");
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
    state.ctx=state.canvas.getContext("2d",{alpha:true});
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

function ensureProfile(){
    let profile=getActiveProfile();
    if(profile)return profile;
    const name=document.getElementById("player-name-input")?.value||"Realm Keeper";
    return createLocalProfile(name);
}

function resetForRun(profile){
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
    state.hasStarted=true;
    state.gameSpeed=1;
    state.isPaused=false;
    state.zoom=1;state.zoomTarget=1;state.zoomLevel=3;
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

function startNewRealm(seed,profile,worldOptions=readWorldOptions()){
    resetForRun(profile);
    applyIdentityForNewRealm();
    state.worldSeed=seed;
    state.worldOptions={...worldOptions};
    state.terrainVersion=TERRAIN_GENERATION_VERSION;
    initWorld(seed,state.worldOptions,state.terrainVersion);
    initStartingKingdom();
    const foundingGrant=applyFoundingProfile(state.identity?.startProfile);
    if(foundingGrant.id!=="balanced")addLog("FOUNDING CHARTER — "+foundingGrant.profile.label.toUpperCase(),"#d6b56d","milestone");
    initializeCityForRealm();
    normalizeHouseholdAssignments();
    initializeSettlementForRealm();
    initializePopulationRegister();
    openGoodsBookForNewRealm();
    drawStartingHand();
    state.camera.x=0;state.camera.y=0;
    centerCamera();
    addLog("KINGDOM FOUNDED — "+profile.displayName.toUpperCase(),"#e4bd72","milestone");
    addLog("A NEW REALM RISES · SEED "+seed,"#a3d6a7","milestone");
    state.selectedTab=0;
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("settings-modal").classList.add("hidden");
    if(!loopStarted){loopStarted=true;startGameLoop();}
    renderUI();
    startSoundtrack().catch(()=>{});
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

function loadSnapshotIntoGame(profile,snapshot){
    let prepared;
    try{
        prepared=prepareSaveSnapshot(snapshot);
    }catch(error){
        // Preflight failed before resetForRun. Callers must not reload a
        // rollback snapshot in this case: the active realm was never touched.
        if(error&&typeof error==="object")error.preStateChange=true;
        throw error;
    }
    resetForRun(profile);
    const restored=restoreSaveSnapshot(prepared);
    const savedSpeed=Number(state.gameSpeed);
    document.querySelectorAll(".speed-button").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.speed)===savedSpeed));
    if(restored.hasSavedCamera)clampCamera();else centerCamera();
    document.getElementById("start-screen").classList.add("hidden");
    if(!loopStarted){loopStarted=true;startGameLoop();}
    renderUI();
    startSoundtrack().catch(()=>{});
}

function loadCurrentGame(){
    const profile=getActiveProfile();
    if(!profile){showStatus("Create or select a local player profile first.");return false;}
    const save=readLocalSave(profile.id);
    if(!save){showStatus("No valid saved realm or recovery backup exists for "+profile.displayName+".");return false;}
    const rollbackProfile=state.hasStarted&&state.activeProfileId
        ?{id:state.activeProfileId,displayName:state.playerName}
        :null;
    const rollbackSnapshot=rollbackProfile?createSaveSnapshot():null;
    try{
        loadSnapshotIntoGame(profile,save.snapshot);
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

function bindMenu(){
    const profile=getActiveProfile();
    const nameInput=document.getElementById("player-name-input");
    if(profile&&nameInput)nameInput.value=profile.displayName;
    const saved=profile?readLocalSave(profile.id):null;
    const continueButton=document.getElementById("continue-game-btn");
    if(continueButton){
        continueButton.disabled=!saved;
        continueButton.textContent=saved?"CONTINUE LAST REALM":"NO SAVED REALM";
    }
    const seedInput=document.getElementById("world-seed-input");
    if(seedInput)seedInput.value=String(randomSeed());
    const forgeDefaults=normalizeWorldOptions({});
    syncWorldForge(forgeDefaults);
    const identityControls=["realm-name-input","realm-dynasty-input","realm-title-input","realm-culture","realm-religion","realm-tradition","realm-law","realm-legitimacy","realm-founding","realm-background","realm-banner","realm-emblem"];
    identityControls.forEach(id=>{
        const control=document.getElementById(id);
        control?.addEventListener("input",refreshFoundingSummary);
        control?.addEventListener("change",refreshFoundingSummary);
    });
    refreshFoundingSummary();
    const forgeControls=["world-size","world-shape","world-climate","world-landmass","world-ruggedness","world-forests","world-water","world-fertility","world-resources","world-mountains","world-rivers","world-lakes","world-coastline","world-snow","world-wetlands","world-aridity"];
    forgeControls.forEach(id=>document.getElementById(id)?.addEventListener("input",()=>syncWorldForge(readWorldOptions())));
    seedInput?.addEventListener("input",scheduleForgePreview);
    document.getElementById("random-seed-btn")?.addEventListener("click",()=>{if(seedInput)seedInput.value=String(randomSeed());scheduleForgePreview();});
    const startButton=document.getElementById("start-new-game-btn");
    startButton?.addEventListener("click",()=>{
        const label=startButton.textContent;
        startButton.disabled=true;
        startButton.textContent="FORGING THE REALM…";
        window.setTimeout(()=>{
            try{
                const active=getActiveProfile();
                const typed=nameInput?.value?.trim();
                const player=active&&(!typed||typed===active.displayName)?active:createLocalProfile(typed||"Realm Keeper");
                const seed=Number(seedInput?.value);
                startNewRealm(Number.isSafeInteger(seed)&&seed>0?seed:randomSeed(),player,readWorldOptions());
            }catch(error){showStatus(error.message);}
            finally{startButton.disabled=false;startButton.textContent=label;}
        },40);
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
    document.getElementById("settings-close")?.addEventListener("click",()=>{
        if(benchmarkRunning)benchmarkCancelRequested=true;
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
    const deltasToggle=document.getElementById("settings-deltas-toggle");
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
            state.timeOfDay=Number.isFinite(value)?Math.max(0,Math.min(23,value)):12;
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
    const rendererSelect=document.getElementById("settings-terrain-renderer");
    if(rendererSelect){
        rendererSelect.value=settings.terrainRenderer;
        rendererSelect.addEventListener("change",event=>{settings.terrainRenderer=event.target.value;applyPerformanceSettings();saveSettings(settings);});
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
    const adaptiveToggle=document.getElementById("settings-adaptive-toggle");
    if(adaptiveToggle){
        adaptiveToggle.checked=settings.adaptiveQuality!==false;
        adaptiveToggle.addEventListener("change",event=>{settings.adaptiveQuality=event.target.checked;applyPerformanceSettings();saveSettings(settings);});
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
    window.addEventListener("kac:focus-map",event=>{
        const x=Number(event.detail?.x),y=Number(event.detail?.y);
        if(!Number.isFinite(x)||!Number.isFinite(y)||!state.canvas)return;
        state.camera.x=x*CELL*state.zoom-state.canvas.width/2;
        state.camera.y=y*CELL*state.zoom-state.canvas.height/2;
        clampCamera();
        document.getElementById("people-modal")?.classList.add("hidden");
    });
}

function init(){
    bindCanvas();
    setupInput();
    setupCharacterDossier();
    setupManagementUI();
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
    window.addEventListener("resize",resize);
    const ctx=state.ctx;
    ctx.fillStyle="#0a120a";ctx.fillRect(0,0,state.canvas.width,state.canvas.height);
    ctx.fillStyle="#e6cc91";ctx.font="600 16px monospace";ctx.textAlign="center";
    ctx.fillText("WELCOME TO YOUR REALM",state.canvas.width/2,state.canvas.height/2);
    const profile=getActiveProfile();
    if(profile)state.playerName=profile.displayName;
}
init();
