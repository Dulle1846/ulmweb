// Central game state. Runtime objects stay in memory; persistence stores DTOs only.
function createInitialState() {
    return {
        canvas:null,ctx:null,minimapCanvas:null,minimapCtx:null,
        camera:{x:0,y:0},zoom:1,zoomTarget:1,zoomLevel:3,zoomAnchor:null,
        tick:0,gameSpeed:1,isPaused:false,tickAccumulator:0,lastFrameTime:0,
        randomStreams:{},nextEntityId:1,
        movementAccumulator:0,lastUiRender:0,lastMinimapRender:0,
        gameOver:false,victory:false,hasStarted:false,worldSeed:0,
        kingdomName:"ELDRIA",playerName:"Guest",activeProfileId:null,
        resources:{wood:180,stone:95,gold:75,food:120},
        incomeThisTick:{wood:0,stone:0,gold:0,food:0},
        morale:72,seasonIndex:0,year:1,dayOfYear:0,
        currentCard:null,availableCards:[],hand:[],cardRewardQueue:[],selectedCardInstanceId:null,cardPreview:null,
        nextCardDrawTick:0,issueSequence:0,nextIssueAtTick:0,
        worldOptions:{landmass:50,ruggedness:55,forests:52,water:48},
        hiddenRealm:{tension:0,prosperity:0,mystery:0,memories:[],activeThreads:[],completedThreads:[]},
        frameFaulted:false,frameErrorCount:0,worldEpoch:0,buildingCollisionVersion:0,
        selectedTab:0,eventLog:[],activeEvent:null,eventSequence:0,
        entities:[],particles:[],floaters:[],pendingPresentationEffects:[],
        heightMap:null,moistureMap:null,terrainCanvas:null,terrainDirty:true,explored:[],
        fogCanvas:null,fogDirty:true,fogExploredRef:null,
        terrainResolution:0,terrainPixW:0,terrainPixH:0,
        lastRandomEvent:0,weather:"clear",weatherTimer:0,
        kingHp:240,totalRaidsSurvived:0,raidActive:false,
        health:{outbreakActive:false,disease:"none",severity:0,containment:0,cases:0,recovered:0,outbreaks:0,lastUpdateTick:0,startedAtTick:0},market:null,politics:{legitimacy:65,factions:{commons:68,nobility:58,guilds:55,clergy:62},settlements:0},economy:{daysElapsed:0,foodConsumed:0,taxesCollected:0,wagesPaid:0,upkeepPaid:0,unpaidWages:0,unpaidUpkeep:0,population:0,employed:0,unemployed:0,populationGrowth:0,lastGrowthYear:1,births:0,lastBirthCheckYear:1,lastSocialYear:1,lastAgencyYear:1,lastLedger:null},statistics:{totalTrades:0,totalBuildingsBuilt:0,totalUnitsRecruited:0,totalEventsResolved:0}
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
