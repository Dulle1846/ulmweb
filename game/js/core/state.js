import {createAiChronicleState} from "./ai-chronicle-state.js";
import {createEventTimelineState} from "./event-timeline.js";

// Central game state. Runtime objects stay in memory; persistence stores DTOs only.
function createInitialState() {
    return {
        canvas:null,ctx:null,terrainCanvasEl:null,minimapCanvas:null,minimapCtx:null,
        camera:{x:0,y:0},zoom:1,zoomTarget:1,zoomLevel:3,zoomAnchor:null,renderScale:1,
        roads:{version:1,revision:0,tiles:{}},roadBuildMode:null,directBuildType:null,resourceGeography:null,forestFauna:null,forestGathering:null,forestSuccession:null,mapLayer:"terrain",
        city:{version:1,enabled:false,constructionVersion:0,logistics:null,fields:null,services:null,needs:null},
        tick:0,gameSpeed:1,isPaused:false,tickAccumulator:0,lastFrameTime:0,
        randomStreams:{},nextEntityId:1,
        movementAccumulator:0,lastUiRender:0,lastMinimapRender:0,
        gameOver:false,victory:false,hasStarted:false,worldSeed:0,
        kingdomName:"New Realm",playerName:"Guest",activeProfileId:null,
        resources:{wood:180,stone:95,gold:75,food:120},
        incomeThisTick:{wood:0,stone:0,gold:0,food:0},
        morale:72,seasonIndex:0,year:1,dayOfYear:0,timeOfDay:12,
        identity:null,research:null,legacy:null,endeavours:null,crownSupply:null,expeditions:null,
        government:{form:"feudal",taxRate:10,councilSeats:3,succession:"primogeniture",decrees:0,lastDecisionYear:0,lastTaxChangeYear:0,history:[]},
        royal:{dynastyName:"Royal House",consortId:null,heirId:null,lastBirthYear:0,history:[]},
        currentCard:null,availableCards:[],hand:[],cardRewardQueue:[],selectedCardInstanceId:null,cardPreview:null,
        nextCardDrawTick:0,issueSequence:0,nextIssueAtTick:0,
        worldOptions:{size:"standard",shape:"continent",climate:"temperate",landmass:50,ruggedness:55,forests:52,water:48,fertility:55,resources:50},
        worldW:0,worldH:0,worldSizeId:"standard",seaLevel:0.33,rivers:[],temperatureMap:null,terrainVersion:1,
        selectedBuildingId:null,selectedRoom:null,buildTool:null,buildMoveFrom:null,buildUndo:[],workshopOpen:false,buildingInteriorVersion:0,
        hiddenRealm:{tension:0,prosperity:0,mystery:0,memories:[],activeThreads:[],completedThreads:[]},
        frameFaulted:false,frameErrorCount:0,worldEpoch:0,buildingCollisionVersion:0,
        selectedTab:0,eventLog:[],activeEvent:null,eventSequence:0,
        entities:[],personArchive:[],creatureArchive:[],craftedItems:[],population:null,aiChronicle:createAiChronicleState(),eventTimeline:createEventTimelineState(),aiBusy:false,particles:[],floaters:[],pendingPresentationEffects:[],
        heightMap:null,moistureMap:null,terrainCanvas:null,terrainDirty:true,explored:[],
        fogCanvas:null,fogDirty:true,fogExploredRef:null,
        terrainResolution:0,terrainPixW:0,terrainPixH:0,
        terrainRenderer:"auto",terrainAutoMode:"webgl",terrainMode:"webgl",terrainRendererName:"",terrainFallback:false,
        terrainCacheRevision:0,forestVisualRevision:0,terrainCacheHits:0,terrainCacheMisses:0,
        frameLimit:60,adaptiveQuality:true,showFps:false,renderStats:{fps:0,frameMs:0,mode:"auto",fallback:false},lastDrawMs:0,renderedFrames:0,
        exploredRevision:0,
        lastRandomEvent:0,weather:"clear",weatherTimer:0,
        kingHp:240,totalRaidsSurvived:0,raidActive:false,
        military:null,faith:null,justice:null,health:{outbreakActive:false,disease:"none",severity:0,containment:0,cases:0,recovered:0,outbreaks:0,herbalDoses:0,herbalTreated:0,lastUpdateTick:0,startedAtTick:0},court:null,diplomacy:null,market:null,realmCycle:null,politics:{legitimacy:65,factions:{commons:68,nobility:58,guilds:55,clergy:62},settlements:0},economy:{daysElapsed:0,foodConsumed:0,taxesCollected:0,wagesPaid:0,upkeepPaid:0,furnitureUpkeepPaid:0,unpaidWages:0,unpaidUpkeep:0,unpaidFurniture:0,population:0,employed:0,unemployed:0,populationGrowth:0,lastGrowthYear:1,growthYear:1,growthThisYear:0,births:0,lastBirthCheckYear:1,lastSocialYear:1,lastAgencyYear:1,lastGuardianshipYear:1,deaths:0,lastMortalityYear:1,lastLedger:null,debt:0,totalDebtInterest:0,foodAccounting:{inflow:0,outflow:0,sinceTick:0},foodCrisis:{severity:0,consecutiveShortages:0,eventCount:0,lastEventTick:0,lastMilestone:0,lastEvent:null,populationLoss:0,lastPopulationLossTick:0,events:[]},history:[]},statistics:{totalTrades:0,totalBuildingsBuilt:0,totalUnitsRecruited:0,totalEventsResolved:0,totalRoadTilesBuilt:0,totalHousesBuilt:0,totalCardsDrawn:0},ambitions:{completed:{},lastEvaluatedTick:0,eternal:{count:0,serial:0,active:null,lastCompleted:null,history:[]}}
    };
}
export const state=createInitialState();
export function resetState() {
    const nextWorldEpoch=(state.worldEpoch||0)+1;
    const fresh=createInitialState();
    for(const key of Object.keys(state))delete state[key];
    Object.assign(state,fresh);
    state.worldEpoch=nextWorldEpoch;
    return state;
}
