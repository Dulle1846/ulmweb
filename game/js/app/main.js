// Application composition root: boot menu, local profiles, save/load and runtime.
import { WORLD_W,WORLD_H,CELL } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { state,resetState } from "../core/state.js";
import { initWorld } from "../world/world.js";
import { renderWorldPreview,normalizeWorldOptions,resolveWorldDimensions,TERRAIN_GENERATION_VERSION } from "../world/terrain-model.js";
import { initStartingKingdom,spawnEntity,canSpawnEntity } from "../world/entities.js";
import { drawStartingHand,restoreHand } from "../systems/cards.js";
import { createMarketState } from "../systems/market.js";
import { normalizePoliticalState } from "../systems/politics.js";
import { normalizeHouseholdAssignments } from "../systems/population.js";
import { invalidateRoomBonusCache } from "../systems/rooms.js";
import { normalizeRoomFurniture } from "../systems/furniture.js";
import { addLog } from "../systems/events.js";
import { ECONOMY_HISTORY_LIMIT } from "../systems/economy.js";
import { startGameLoop } from "./game-loop.js";
import { centerCamera,resize,clampCamera } from "../presentation/camera.js";
import { setupInput } from "../presentation/input.js";
import { renderUI,showBigMessage,setupMapViewControls } from "../presentation/rendering/ui.js";
import { createLocalProfile,getActiveProfile,readLocalSave,writeLocalSave,getLocalSaveInfo,listLocalProfiles,selectLocalProfile,loadSettings,saveSettings } from "../core/persistence.js";
import { startSoundtrack,setMusicEnabled,setMusicVolume,applySoundtrackSettings } from "../core/soundtrack.js";
import {getRandomStreamSnapshot,restoreRandomStreams} from "../core/random.js";
import {ensurePersonProfile,normalizePersonProfile,normalizePersonMemorial,MAX_PERSON_ARCHIVE} from "../systems/people.js";
import {setupCharacterDossier} from "../presentation/character-dossier.js";
import {normalizeFamilyLinks} from "../systems/families.js";
import {normalizeGovernment} from "../systems/government.js";
import {normalizeRoyalState} from "../systems/royal-dynasty.js";
import {setupManagementUI} from "../presentation/management-ui.js";
import {serializeRoads,restoreRoads} from "../systems/roads.js";
import {serializeResourceGeography,restoreResourceGeography} from "../systems/resource-geography.js";import { setupBuildUI } from "../presentation/build-ui.js";import { normalizeLayout,serializeLayout } from "../presentation/building-layout.js";
import {serializeCity,restoreCity,initializeCityForRealm,openGoodsBookForNewRealm} from "../systems/logistics.js";
import {SAVE_SCHEMA_VERSION,normalizeSaveSnapshot,validateSaveSnapshot} from "../core/save-validation.js";
import {initializeSettlementForRealm} from "../systems/settlement.js";
import { setupWorkshopUI } from "../presentation/build-mode.js";
import {setupModalAccessibility} from "../presentation/modal-accessibility.js";

// Snapshot field migrations run in order. Each step is defensive because
// imported or hand-edited saves may be missing any field.
const SAVE_SCHEMA_MIGRATIONS=Object.freeze({
    0:snapshot=>{snapshot.hiddenRealm=snapshot.hiddenRealm&&typeof snapshot.hiddenRealm==="object"?snapshot.hiddenRealm:{};snapshot.health=snapshot.health&&typeof snapshot.health==="object"?snapshot.health:{};snapshot.economy=snapshot.economy&&typeof snapshot.economy==="object"?snapshot.economy:{};},
    1:snapshot=>{snapshot.statistics=snapshot.statistics&&typeof snapshot.statistics==="object"?snapshot.statistics:{};snapshot.personArchive=Array.isArray(snapshot.personArchive)?snapshot.personArchive:[];snapshot.creatureArchive=Array.isArray(snapshot.creatureArchive)?snapshot.creatureArchive:[];},
    2:snapshot=>{snapshot.randomStreams=snapshot.randomStreams&&typeof snapshot.randomStreams==="object"?snapshot.randomStreams:null;snapshot.availableCards=Array.isArray(snapshot.availableCards)?snapshot.availableCards:[];snapshot.issueSequence=Number.isFinite(Number(snapshot.issueSequence))?Math.max(0,Math.floor(Number(snapshot.issueSequence))):0;},
    3:snapshot=>{if(snapshot.city===undefined)snapshot.city=null;if(snapshot.market===undefined)snapshot.market=null;}
});
function migrateSaveSnapshot(snapshot){
    if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))return snapshot;
    const declared=Number(snapshot.saveSchemaVersion);
    let version=Number.isFinite(declared)?Math.max(0,Math.floor(declared)):0;
    if(version>SAVE_SCHEMA_VERSION)throw new Error("Save data was written by a newer game build (schema "+version+").");
    while(version<SAVE_SCHEMA_VERSION){const step=SAVE_SCHEMA_MIGRATIONS[version];if(step)step(snapshot);version++;}
    snapshot.saveSchemaVersion=SAVE_SCHEMA_VERSION;
    return snapshot;
}

let loopStarted=false;
let settings=loadSettings();
function applyInterfaceSettings(){
    document.body.classList.toggle("hide-resource-deltas",settings.showDeltas===false);
    document.body.classList.toggle("reduce-interface-motion",settings.reduceMotion===true);
    state.cardPace=Math.max(0.5,Math.min(2,Number(settings.cardPace)||1));
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
    invalidateRoomBonusCache();
    bindCanvas();
    state.activeProfileId=profile.id;
    state.playerName=profile.displayName;
    state.market=createMarketState();
    state.hasStarted=true;
    state.gameSpeed=1;
    state.isPaused=false;
    state.zoom=1;state.zoomTarget=1;state.zoomLevel=3;
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

function startNewRealm(seed,profile,worldOptions=readWorldOptions()){
    resetForRun(profile);
    state.worldSeed=seed;
    state.worldOptions={...worldOptions};
    state.terrainVersion=TERRAIN_GENERATION_VERSION;
    initWorld(seed,state.worldOptions,state.terrainVersion);
    initStartingKingdom();
    initializeCityForRealm();
    normalizeHouseholdAssignments();
    initializeSettlementForRealm();
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

function serializeEntity(entity,indexByEntity){
    return {
        id:entity.id||null,personId:entity.personId||null,person:entity.person?JSON.parse(JSON.stringify(entity.person)):null,
        x:entity.x,y:entity.y,type:entity.type,hp:entity.hp,maxHp:entity.maxHp,dead:entity.dead,age:entity.age,
        rotation:entity.rotation||0,footprintScale:entity.footprintScale||1,interior:entity.interior?{...entity.interior}:null,roomFurniture:entity.roomFurniture&&typeof entity.roomFurniture==="object"?JSON.parse(JSON.stringify(entity.roomFurniture)):null,layout:entity.layout?serializeLayout(entity.type,entity.layout,1,1):null,
        construction:entity.construction?JSON.parse(JSON.stringify(entity.construction)):null,inventory:entity.inventory?JSON.parse(JSON.stringify(entity.inventory)):null,warehouse:entity.warehouse?JSON.parse(JSON.stringify(entity.warehouse)):null,field:entity.field?{...entity.field}:null,
        anim:entity.anim,facing:entity.facing,visualState:entity.visualState,anchor:entity.anchor,home:entity.home,
        illnessUntilTick:entity.illnessUntilTick,illnessStartedTick:entity.illnessStartedTick,illnessSeverity:entity.illnessSeverity,
        targetX:entity.targetX,targetY:entity.targetY,velocityX:entity.velocityX,velocityY:entity.velocityY,
        routinePhase:entity.routinePhase,routineTimer:entity.routineTimer,movePause:entity.movePause,
        job:entity.job,jobRefreshTimer:entity.jobRefreshTimer,workplaceIndex:entity.workplace?indexByEntity.get(entity.workplace)??null:null,
        isKing:entity.isKing,isRoyalFamily:Boolean(entity.isRoyalFamily),isDragon:Boolean(entity.isDragon),creature:entity.creature?JSON.parse(JSON.stringify(entity.creature)):null,moraleMod:entity.moraleMod,tint:entity.tint,householdId:entity.householdId||null,lastAgedYear:entity.lastAgedYear??null
    };
}

function createSaveSnapshot(){
    const indexes=new Map(state.entities.map((entity,index)=>[entity,index]));
    return {
        playerName:state.playerName,kingdomName:state.kingdomName,worldSeed:state.worldSeed,
        worldOptions:{...state.worldOptions},terrainVersion:state.terrainVersion||1,randomStreams:getRandomStreamSnapshot(),nextEntityId:state.nextEntityId,saveSchemaVersion:SAVE_SCHEMA_VERSION,nextCardDrawTick:state.nextCardDrawTick,
        nextIssueAtTick:state.nextIssueAtTick,issueSequence:state.issueSequence,
        hiddenRealm:JSON.parse(JSON.stringify(state.hiddenRealm||{})),health:JSON.parse(JSON.stringify(state.health||{})),
        camera:{...state.camera},zoom:state.zoom,
        explored:state.explored.map(column=>column.map(Boolean)),
        roads:serializeRoads(),
        resourceGeography:serializeResourceGeography(),
        city:serializeCity(),
        tick:state.tick,year:state.year,dayOfYear:state.dayOfYear,seasonIndex:state.seasonIndex,gameSpeed:state.gameSpeed,
        morale:state.morale,resources:{...state.resources},incomeThisTick:{...state.incomeThisTick},
        kingHp:state.kingHp,totalRaidsSurvived:state.totalRaidsSurvived,raidActive:state.raidActive,
        gameOver:state.gameOver,victory:state.victory,lastRandomEvent:state.lastRandomEvent,
        weather:state.weather,weatherTimer:state.weatherTimer,
        entities:state.entities.map((entity,index)=>serializeEntity(entity,indexes)),
        personArchive:(state.personArchive||[]).map(entry=>JSON.parse(JSON.stringify(entry))).slice(-MAX_PERSON_ARCHIVE),
        creatureArchive:(state.creatureArchive||[]).map(entry=>JSON.parse(JSON.stringify(entry))).slice(-100),
        hand:state.hand.map(card=>({...card,cost:{...card.cost}})),
        cardRewardQueue:(state.cardRewardQueue||[]).map(card=>({...card,cost:{...card.cost}})),
        selectedCardInstanceId:state.selectedCardInstanceId,
        availableCards:state.availableCards.map(card=>({...card,cost:{...card.cost}})),
        activeEvent:state.activeEvent,
        eventLog:state.eventLog.slice(0,100),eventSequence:state.eventSequence,
        statistics:{...state.statistics},economy:JSON.parse(JSON.stringify(state.economy||{})),politics:JSON.parse(JSON.stringify(state.politics||{})),government:JSON.parse(JSON.stringify(state.government||{})),royal:JSON.parse(JSON.stringify(state.royal||{})),market:JSON.parse(JSON.stringify(state.market)),
        totalPopulation:state.entities.filter(entity=>entity.type===TYPE.VILLAGER&&!entity.dead).length
    };
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
    try{
        snapshot=normalizeSaveSnapshot(migrateSaveSnapshot(snapshot));
        validateSaveSnapshot(snapshot);
    }catch(error){
        // Preflight failed before resetForRun. Callers must not reload a
        // rollback snapshot in this case: the active realm was never touched.
        if(error&&typeof error==="object")error.preStateChange=true;
        throw error;
    }
    resetForRun(profile);
    state.worldSeed=snapshot.worldSeed||randomSeed();
    state.worldOptions=snapshot.worldOptions||{landmass:50,ruggedness:55,forests:52,water:48};
    // Terrain is rebuilt from the seed, so a save without a version marker was
    // created by the version-1 generator and must keep that exact landscape.
    state.terrainVersion=Number(snapshot.terrainVersion)>=TERRAIN_GENERATION_VERSION?TERRAIN_GENERATION_VERSION:1;
    initWorld(state.worldSeed,state.worldOptions,state.terrainVersion);
    restoreRoads(snapshot.roads);
    restoreResourceGeography(snapshot.resourceGeography);
    state.entities=[];
    const restored=[];
    for(const dto of snapshot.entities||[]){
        // Dead entities have already been archived where relevant and should
        // not consume live world capacity during restoration.
        if(dto.dead){restored.push(null);continue;}
        if(!canSpawnEntity(dto.type))throw new Error("Save exceeds the supported world entity capacity.");
        const entity=spawnEntity(dto.x,dto.y,dto.type);
        if(!entity)throw new Error("An entity could not be restored; the current realm will be recovered.");
        Object.assign(entity,{
            id:typeof dto.id==="string"?dto.id:null,personId:typeof dto.personId==="string"?dto.personId:null,person:dto.person&&typeof dto.person==="object"?dto.person:null,
            hp:dto.hp,maxHp:dto.maxHp,dead:dto.dead,age:dto.age,anim:dto.anim,facing:dto.facing,
            rotation:Number.isFinite(dto.rotation)?dto.rotation:0,footprintScale:Number.isFinite(dto.footprintScale)?dto.footprintScale:1,interior:dto.interior&&typeof dto.interior==="object"?{...dto.interior}:null,roomFurniture:dto.roomFurniture&&typeof dto.roomFurniture==="object"&&!Array.isArray(dto.roomFurniture)?normalizeRoomFurniture(dto.roomFurniture):null,layout:dto.layout&&typeof dto.layout==="object"?normalizeLayout(dto.type,dto.layout,1,1):null,
            construction:dto.construction&&typeof dto.construction==="object"?JSON.parse(JSON.stringify(dto.construction)):null,inventory:dto.inventory&&typeof dto.inventory==="object"?JSON.parse(JSON.stringify(dto.inventory)):null,warehouse:dto.warehouse&&typeof dto.warehouse==="object"?JSON.parse(JSON.stringify(dto.warehouse)):null,field:dto.field&&typeof dto.field==="object"?{...dto.field}:null,
            visualState:dto.visualState,anchor:dto.anchor||{x:dto.x,y:dto.y},home:dto.home||{x:dto.x,y:dto.y},
            illnessUntilTick:dto.illnessUntilTick,illnessStartedTick:dto.illnessStartedTick,illnessSeverity:dto.illnessSeverity,
            targetX:dto.targetX??dto.x,targetY:dto.targetY??dto.y,velocityX:dto.velocityX||0,velocityY:dto.velocityY||0,
            routinePhase:dto.routinePhase??4,routineTimer:dto.routineTimer??30,movePause:dto.movePause||0,
            job:dto.job,jobRefreshTimer:dto.jobRefreshTimer??30,isKing:Boolean(dto.isKing),isRoyalFamily:Boolean(dto.isRoyalFamily),isDragon:Boolean(dto.isDragon),creature:dto.creature&&typeof dto.creature==="object"?dto.creature:null,moraleMod:dto.moraleMod||0,tint:dto.tint||0,householdId:dto.householdId||null,lastAgedYear:Number.isFinite(dto.lastAgedYear)?dto.lastAgedYear:state.year
        });
        restored.push(entity);
    }
    (snapshot.entities||[]).forEach((dto,index)=>{
        if(Number.isInteger(dto.workplaceIndex)&&restored[dto.workplaceIndex]&&restored[index])restored[index].workplace=restored[dto.workplaceIndex];
    });
    restoreCity(snapshot.city);
    initializeCityForRealm({seedWarehouse:!snapshot.city});
    state.tick=snapshot.tick||0;state.year=snapshot.year||1;state.dayOfYear=snapshot.dayOfYear||0;
    const savedSpeed=Number(snapshot.gameSpeed);
    state.gameSpeed=[0.5,1,2,4].includes(savedSpeed)?savedSpeed:1;
    document.querySelectorAll(".speed-button").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.speed)===state.gameSpeed));
    state.creatureArchive=Array.isArray(snapshot.creatureArchive)?snapshot.creatureArchive.filter(entry=>entry&&typeof entry==="object").slice(-100):[];
    state.personArchive=Array.isArray(snapshot.personArchive)
        ? snapshot.personArchive.map(normalizePersonMemorial).filter(Boolean).slice(-MAX_PERSON_ARCHIVE)
        : [];
    restoreRandomStreams(snapshot.randomStreams);
    state.nextEntityId=Math.max(1,Number.isSafeInteger(snapshot.nextEntityId)?snapshot.nextEntityId:restored.length+1);
    for(let index=0;index<restored.length;index++){const entity=restored[index];if(!entity)continue;if(typeof entity.id!=="string")entity.id="e"+(Number(state.worldSeed)||1).toString(36)+"-"+(index+1).toString(36);if(entity.type===TYPE.VILLAGER&&!entity.personId)entity.personId=entity.id;if(entity.type===TYPE.VILLAGER||entity.isKing)ensurePersonProfile(entity,{role:entity.isKing?"king":"resident"});}
    normalizeFamilyLinks();
    state.nextEntityId=Math.max(state.nextEntityId,restored.length+1);
    state.seasonIndex=snapshot.seasonIndex||0;state.morale=snapshot.morale??72;
    state.resources={wood:0,stone:0,gold:0,food:0,...snapshot.resources};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0,...snapshot.incomeThisTick};
    state.kingHp=snapshot.kingHp||240;state.totalRaidsSurvived=snapshot.totalRaidsSurvived||0;
    state.raidActive=Boolean(snapshot.raidActive);state.gameOver=Boolean(snapshot.gameOver);state.victory=Boolean(snapshot.victory);
    state.lastRandomEvent=snapshot.lastRandomEvent||0;state.weather=snapshot.weather||"clear";state.weatherTimer=snapshot.weatherTimer||0;
    state.kingdomName=snapshot.kingdomName||"ELDRIA";state.eventLog=Array.isArray(snapshot.eventLog)?snapshot.eventLog:[];
    state.eventSequence=snapshot.eventSequence||state.eventLog.reduce((max,e)=>Math.max(max,e.id||0),0);
    state.activeEvent=snapshot.activeEvent||null;
    state.issueSequence=snapshot.issueSequence||0;
    state.nextIssueAtTick=snapshot.nextIssueAtTick||0;
    state.hiddenRealm={tension:0,prosperity:0,mystery:0,memories:[],activeThreads:[],completedThreads:[],...(snapshot.hiddenRealm||{})};
    state.health={outbreakActive:false,disease:"none",severity:0,containment:0,cases:0,recovered:0,outbreaks:0,lastUpdateTick:0,startedAtTick:0,...(snapshot.health||{})};
    state.hiddenRealm.memories=Array.isArray(state.hiddenRealm.memories)?state.hiddenRealm.memories:[];
    state.hiddenRealm.activeThreads=Array.isArray(state.hiddenRealm.activeThreads)?state.hiddenRealm.activeThreads:[];
    state.hiddenRealm.completedThreads=Array.isArray(state.hiddenRealm.completedThreads)?state.hiddenRealm.completedThreads:[];
    state.availableCards=Array.isArray(snapshot.availableCards)
        ? snapshot.availableCards.map(card=>({...card,cost:{...(card.cost||{})}}))
        : [];
    state.statistics={totalTrades:0,totalBuildingsBuilt:0,totalUnitsRecruited:0,totalEventsResolved:0,totalRoadTilesBuilt:0,...snapshot.statistics};
    state.economy={daysElapsed:0,foodConsumed:0,taxesCollected:0,wagesPaid:0,upkeepPaid:0,furnitureUpkeepPaid:0,unpaidWages:0,unpaidUpkeep:0,unpaidFurniture:0,population:0,employed:0,unemployed:0,populationGrowth:0,lastGrowthYear:state.year,births:0,lastBirthCheckYear:state.year,lastSocialYear:state.year,lastAgencyYear:state.year,deaths:0,lastMortalityYear:state.year,lastLedger:null,history:[],...snapshot.economy};
    // Older saves have no series; imported or hand-edited saves may contain an
    // invalid one. Keep only bounded, numeric settlement records for the charts.
    state.economy.history=(Array.isArray(state.economy.history)?state.economy.history:[])
        .filter(entry=>entry&&typeof entry==="object"&&!Array.isArray(entry)&&Number.isFinite(Number(entry.tick)))
        .slice(-ECONOMY_HISTORY_LIMIT);
    const growthYear=state.economy.lastGrowthYear;
    state.economy.lastGrowthYear=Number.isFinite(growthYear)?Math.max(1,Math.min(state.year,Math.floor(growthYear))):state.year;
    const populationGrowth=Number(state.economy.populationGrowth);
    state.economy.populationGrowth=Number.isFinite(populationGrowth)?Math.max(0,populationGrowth):0;
    const births=Number(state.economy.births);
    state.economy.births=Number.isFinite(births)?Math.max(0,Math.floor(births)):0;
    const mortalityYear=Number(state.economy.lastMortalityYear);
    state.economy.lastMortalityYear=Number.isFinite(mortalityYear)?Math.max(1,Math.min(state.year,Math.floor(mortalityYear))):state.year;
    const deaths=Number(state.economy.deaths);
    state.economy.deaths=Number.isFinite(deaths)?Math.max(0,Math.floor(deaths)):0;
    const agencyYear=Number(state.economy.lastAgencyYear);
    state.economy.lastAgencyYear=Number.isFinite(agencyYear)?Math.max(1,Math.min(state.year,Math.floor(agencyYear))):state.year;
    const socialYear=Number(state.economy.lastSocialYear);
    state.economy.lastSocialYear=Number.isFinite(socialYear)?Math.max(1,Math.min(state.year,Math.floor(socialYear))):state.year;
    const birthCheckYear=Number(state.economy.lastBirthCheckYear);
    state.economy.lastBirthCheckYear=Number.isFinite(birthCheckYear)?Math.max(1,Math.min(state.year,Math.floor(birthCheckYear))):state.year;
    normalizePoliticalState(snapshot.politics);
    normalizeGovernment(snapshot.government);
    normalizeRoyalState(snapshot.royal);
    normalizeHouseholdAssignments();
    initializeSettlementForRealm();
    state.market=snapshot.market||createMarketState();
    if(Array.isArray(snapshot.explored)&&snapshot.explored.length===(Number(state.worldW)||WORLD_W))state.explored=snapshot.explored;
    const hasSavedCamera=snapshot.camera&&Number.isFinite(snapshot.camera.x)&&Number.isFinite(snapshot.camera.y);
    if(hasSavedCamera)state.camera={x:snapshot.camera.x,y:snapshot.camera.y};
    if(Number.isFinite(snapshot.zoom)){state.zoom=snapshot.zoom;state.zoomTarget=snapshot.zoom;state.zoomLevel=3;}
    restoreHand(snapshot.hand,snapshot.selectedCardInstanceId,snapshot.availableCards,snapshot.nextCardDrawTick,snapshot.cardRewardQueue);
    if(hasSavedCamera)clampCamera();else centerCamera();
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
        const profile=getActiveProfile()||ensureProfile();
        const rollbackProfile=state.hasStarted&&state.activeProfileId?{id:state.activeProfileId,displayName:state.playerName}:null;
        const rollbackSnapshot=rollbackProfile?createSaveSnapshot():null;
        try{
            loadSnapshotIntoGame(profile,snapshot);
        }catch(error){
            if(rollbackProfile&&rollbackSnapshot&&!error?.preStateChange){
                try{loadSnapshotIntoGame(rollbackProfile,rollbackSnapshot);}catch{/* keep the original error */}
            }
            throw error;
        }
        const savedAt=writeLocalSave(profile.id,createSaveSnapshot());
        syncWorldForge(state.worldOptions);
        document.getElementById("start-screen")?.classList.add("hidden");
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
    const openSettings=()=>{renderSaveSlots();document.getElementById("settings-modal").classList.remove("hidden");};
    document.getElementById("settings-btn")?.addEventListener("click",openSettings);
    document.getElementById("start-settings-btn")?.addEventListener("click",openSettings);
    document.getElementById("export-save-btn")?.addEventListener("click",exportRealm);
    const importInput=document.getElementById("import-save-input");
    importInput?.addEventListener("change",async event=>{
        const file=event.target.files?.[0];
        await importRealm(file);
        event.target.value="";
    });
    document.getElementById("settings-close")?.addEventListener("click",()=>document.getElementById("settings-modal").classList.add("hidden"));
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
    const motionToggle=document.getElementById("settings-motion-toggle");
    const paceSelect=document.getElementById("settings-card-pace");
    if(deltasToggle){deltasToggle.checked=settings.showDeltas!==false;deltasToggle.addEventListener("change",event=>{settings.showDeltas=event.target.checked;applyInterfaceSettings();saveSettings(settings);});}
    if(motionToggle){motionToggle.checked=settings.reduceMotion===true;motionToggle.addEventListener("change",event=>{settings.reduceMotion=event.target.checked;applyInterfaceSettings();saveSettings(settings);});}
    if(paceSelect){paceSelect.value=String(Number(settings.cardPace)||1);paceSelect.addEventListener("change",event=>{settings.cardPace=Number(event.target.value)||1;applyInterfaceSettings();saveSettings(settings);});}
    applyInterfaceSettings();

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
        if(state.activeEvent){state.activeEvent.dismissed=true;renderUI();}
    });
setupBuildUI();
    setupWorkshopUI();
    bindMenu();
    applySoundtrackSettings(settings);
    window.addEventListener("resize",resize);
    const ctx=state.ctx;
    ctx.fillStyle="#0a120a";ctx.fillRect(0,0,state.canvas.width,state.canvas.height);
    ctx.fillStyle="#e6cc91";ctx.font="600 16px monospace";ctx.textAlign="center";
    ctx.fillText("WELCOME TO ELDRIA",state.canvas.width/2,state.canvas.height/2);
    const profile=getActiveProfile();
    if(profile)state.playerName=profile.displayName;
}
init();
