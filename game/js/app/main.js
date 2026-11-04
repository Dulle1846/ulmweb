// Application composition root: boot menu, local profiles, save/load and runtime.
import { WORLD_W,WORLD_H } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { state,resetState } from "../core/state.js";
import { initWorld } from "../world/world.js";
import { initStartingKingdom,spawnEntity,canSpawnEntity } from "../world/entities.js";
import { drawStartingHand,restoreHand } from "../systems/cards.js";
import { createMarketState } from "../systems/market.js";
import { addLog } from "../systems/events.js";
import { startGameLoop } from "./game-loop.js";
import { centerCamera,resize,clampCamera } from "../presentation/camera.js";
import { setupInput } from "../presentation/input.js";
import { renderUI,showBigMessage } from "../presentation/rendering/ui.js";
import { createLocalProfile,getActiveProfile,readLocalSave,writeLocalSave,loadSettings,saveSettings } from "../core/persistence.js";
import { startSoundtrack,setMusicEnabled,setMusicVolume,applySoundtrackSettings } from "../core/soundtrack.js";

let loopStarted=false;
let settings=loadSettings();

function bindCanvas(){
    state.canvas=document.getElementById("canvas");
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
    return {landmass:value("world-landmass"),ruggedness:value("world-ruggedness"),forests:value("world-forests"),water:value("world-water")};
}
function syncWorldForge(options){
    const controls=[
        ["landmass",document.getElementById("world-landmass"),document.getElementById("world-landmass-value")],
        ["ruggedness",document.getElementById("world-ruggedness"),document.getElementById("world-ruggedness-value")],
        ["forests",document.getElementById("world-forests"),document.getElementById("world-forests-value")],
        ["water",document.getElementById("world-water"),document.getElementById("world-water-value")]
    ];
    for(const [key,input,output] of controls){
        if(input&&Number.isFinite(Number(options?.[key])))input.value=String(options[key]);
        if(output)output.textContent=input?.value||"50";
    }
}

function startNewRealm(seed,profile,worldOptions=readWorldOptions()){
    resetForRun(profile);
    state.worldSeed=seed;
    state.worldOptions={...worldOptions};
    initWorld(seed,state.worldOptions);
    initStartingKingdom();
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
        x:entity.x,y:entity.y,type:entity.type,hp:entity.hp,maxHp:entity.maxHp,dead:entity.dead,age:entity.age,
        anim:entity.anim,facing:entity.facing,visualState:entity.visualState,anchor:entity.anchor,home:entity.home,
        targetX:entity.targetX,targetY:entity.targetY,velocityX:entity.velocityX,velocityY:entity.velocityY,
        routinePhase:entity.routinePhase,routineTimer:entity.routineTimer,movePause:entity.movePause,
        job:entity.job,jobRefreshTimer:entity.jobRefreshTimer,workplaceIndex:entity.workplace?indexByEntity.get(entity.workplace)??null:null,
        isKing:entity.isKing,moraleMod:entity.moraleMod,tint:entity.tint
    };
}

function createSaveSnapshot(){
    const indexes=new Map(state.entities.map((entity,index)=>[entity,index]));
    return {
        playerName:state.playerName,kingdomName:state.kingdomName,worldSeed:state.worldSeed,
        worldOptions:{...state.worldOptions},nextCardDrawTick:state.nextCardDrawTick,
        nextIssueAtTick:state.nextIssueAtTick,issueSequence:state.issueSequence,
        hiddenRealm:JSON.parse(JSON.stringify(state.hiddenRealm||{})),
        camera:{...state.camera},zoom:state.zoom,
        explored:state.explored.map(column=>column.map(Boolean)),
        tick:state.tick,year:state.year,dayOfYear:state.dayOfYear,seasonIndex:state.seasonIndex,
        morale:state.morale,resources:{...state.resources},incomeThisTick:{...state.incomeThisTick},
        kingHp:state.kingHp,totalRaidsSurvived:state.totalRaidsSurvived,raidActive:state.raidActive,
        gameOver:state.gameOver,victory:state.victory,lastRandomEvent:state.lastRandomEvent,
        weather:state.weather,weatherTimer:state.weatherTimer,
        entities:state.entities.map((entity,index)=>serializeEntity(entity,indexes)),
        hand:state.hand.map(card=>({...card,cost:{...card.cost}})),
        cardRewardQueue:(state.cardRewardQueue||[]).map(card=>({...card,cost:{...card.cost}})),
        selectedCardInstanceId:state.selectedCardInstanceId,
        availableCards:state.availableCards.map(card=>({...card,cost:{...card.cost}})),
        activeEvent:state.activeEvent,
        eventLog:state.eventLog.slice(0,100),eventSequence:state.eventSequence,
        statistics:{...state.statistics},economy:JSON.parse(JSON.stringify(state.economy||{})),market:JSON.parse(JSON.stringify(state.market)),
        totalPopulation:state.entities.filter(entity=>entity.type===TYPE.VILLAGER&&!entity.dead).length
    };
}

function saveCurrentGame(){
    if(!state.hasStarted||!state.activeProfileId){showStatus("Create a local player profile before saving.");return false;}
    try{
        const savedAt=writeLocalSave(state.activeProfileId,createSaveSnapshot());
        showStatus("Realm saved · "+new Date(savedAt).toLocaleTimeString());
        addLog("GAME SAVED","#a3d6a7","system");
        renderUI();
        return true;
    }catch(error){
        showStatus("Save failed: "+error.message);
        return false;
    }
}

function loadSnapshotIntoGame(profile,snapshot){
    resetForRun(profile);
    state.worldSeed=snapshot.worldSeed||randomSeed();
    state.worldOptions=snapshot.worldOptions||{landmass:50,ruggedness:55,forests:52,water:48};
    initWorld(state.worldSeed,state.worldOptions);
    state.entities=[];
    const restored=[];
    for(const dto of snapshot.entities||[]){
        if(!canSpawnEntity(dto.type)){restored.push(null);continue;}
        const entity=spawnEntity(dto.x,dto.y,dto.type);
        if(!entity){restored.push(null);continue;}
        Object.assign(entity,{
            hp:dto.hp,maxHp:dto.maxHp,dead:dto.dead,age:dto.age,anim:dto.anim,facing:dto.facing,
            visualState:dto.visualState,anchor:dto.anchor||{x:dto.x,y:dto.y},home:dto.home||{x:dto.x,y:dto.y},
            targetX:dto.targetX??dto.x,targetY:dto.targetY??dto.y,velocityX:dto.velocityX||0,velocityY:dto.velocityY||0,
            routinePhase:dto.routinePhase??4,routineTimer:dto.routineTimer??30,movePause:dto.movePause||0,
            job:dto.job,jobRefreshTimer:dto.jobRefreshTimer??30,isKing:Boolean(dto.isKing),moraleMod:dto.moraleMod||0,tint:dto.tint||0
        });
        restored.push(entity);
    }
    (snapshot.entities||[]).forEach((dto,index)=>{
        if(Number.isInteger(dto.workplaceIndex)&&restored[dto.workplaceIndex]&&restored[index])restored[index].workplace=restored[dto.workplaceIndex];
    });
    state.tick=snapshot.tick||0;state.year=snapshot.year||1;state.dayOfYear=snapshot.dayOfYear||0;
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
    state.hiddenRealm.memories=Array.isArray(state.hiddenRealm.memories)?state.hiddenRealm.memories:[];
    state.hiddenRealm.activeThreads=Array.isArray(state.hiddenRealm.activeThreads)?state.hiddenRealm.activeThreads:[];
    state.hiddenRealm.completedThreads=Array.isArray(state.hiddenRealm.completedThreads)?state.hiddenRealm.completedThreads:[];
    state.availableCards=Array.isArray(snapshot.availableCards)
        ? snapshot.availableCards.map(card=>({...card,cost:{...(card.cost||{})}}))
        : [];
    state.statistics={totalTrades:0,totalBuildingsBuilt:0,totalUnitsRecruited:0,totalEventsResolved:0,...snapshot.statistics};
    state.economy={daysElapsed:0,foodConsumed:0,taxesCollected:0,wagesPaid:0,upkeepPaid:0,unpaidWages:0,unpaidUpkeep:0,population:0,employed:0,unemployed:0,populationGrowth:0,lastGrowthYear:state.year,lastLedger:null,...snapshot.economy};
    const growthYear=state.economy.lastGrowthYear;
    state.economy.lastGrowthYear=Number.isFinite(growthYear)?Math.max(1,Math.min(state.year,Math.floor(growthYear))):state.year;
    const populationGrowth=Number(state.economy.populationGrowth);
    state.economy.populationGrowth=Number.isFinite(populationGrowth)?Math.max(0,populationGrowth):0;
    state.market=snapshot.market||createMarketState();
    if(Array.isArray(snapshot.explored)&&snapshot.explored.length===WORLD_W)state.explored=snapshot.explored;
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
    if(!save){showStatus("No saved realm exists for "+profile.displayName+".");return false;}
    try{
        loadSnapshotIntoGame(profile,save.snapshot);
        syncWorldForge(state.worldOptions);
        showStatus("Loaded realm · "+new Date(save.savedAt).toLocaleString());
        addLog("SAVE LOADED","#a3d6a7","system");
        return true;
    }catch(error){
        showStatus("Load failed: "+error.message);return false;
    }
}

function showStatus(message){
    const status=document.getElementById("status-message");
    if(status){status.textContent=message;status.classList.add("is-visible");}
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
    const forgeDefaults={landmass:50,ruggedness:55,forests:52,water:48};
    syncWorldForge(forgeDefaults);
    document.getElementById("world-landmass")?.addEventListener("input",()=>syncWorldForge(readWorldOptions()));
    document.getElementById("world-ruggedness")?.addEventListener("input",()=>syncWorldForge(readWorldOptions()));
    document.getElementById("world-forests")?.addEventListener("input",()=>syncWorldForge(readWorldOptions()));
    document.getElementById("world-water")?.addEventListener("input",()=>syncWorldForge(readWorldOptions()));
    document.getElementById("random-seed-btn")?.addEventListener("click",()=>{if(seedInput)seedInput.value=String(randomSeed());});
    document.getElementById("start-new-game-btn")?.addEventListener("click",()=>{
        try{
            const active=getActiveProfile();
            const typed=nameInput?.value?.trim();
            const player=active&&(!typed||typed===active.displayName)?active:createLocalProfile(typed||"Realm Keeper");
            const seed=Number(seedInput?.value);
            startNewRealm(Number.isSafeInteger(seed)&&seed>0?seed:randomSeed(),player,readWorldOptions());
        }catch(error){showStatus(error.message);}
    });
    continueButton?.addEventListener("click",loadCurrentGame);
    document.getElementById("load-game-btn")?.addEventListener("click",loadCurrentGame);

    document.getElementById("save-btn")?.addEventListener("click",saveCurrentGame);
    document.getElementById("load-btn")?.addEventListener("click",loadCurrentGame);
    const openSettings=()=>document.getElementById("settings-modal").classList.remove("hidden");
    document.getElementById("settings-btn")?.addEventListener("click",openSettings);
    document.getElementById("start-settings-btn")?.addEventListener("click",openSettings);
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

    document.getElementById("big-message-close")?.addEventListener("click",()=>document.getElementById("big-message").classList.add("hidden"));
    window.addEventListener("kac:save-request",saveCurrentGame);
    window.addEventListener("kac:load-request",loadCurrentGame);
}

function init(){
    bindCanvas();
    setupInput();
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
