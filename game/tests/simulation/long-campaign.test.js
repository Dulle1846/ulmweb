import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {spawnEntity} from "../../js/world/entities.js";
import {updateSimulation} from "../../js/simulation/simulation.js";

function prepareCampaign(){
    resetState();
    state.hasStarted=true;
    state.isPaused=false;
    state.gameOver=false;
    state.worldSeed=20261105;
    state.morale=86;
    state.resources={wood:5000,stone:5000,gold:5000,food:5000};
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.moistureMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.explored=Array.from({length:WORLD_W},()=>Array(WORLD_H).fill(false));
    const homes=[];
    for(let i=0;i<8;i++)homes.push(spawnEntity(20+i*4,20,TYPE.HOUSE));
    const farms=[];
    for(let i=0;i<6;i++)farms.push(spawnEntity(60+i*4,60,TYPE.FARM));
    for(let i=0;i<24;i++){
        const home=homes[Math.floor(i/3)];
        const villager=spawnEntity(30+(i%8)*2,30+Math.floor(i/8)*2,TYPE.VILLAGER);
        villager.home={x:home.x,y:home.y};
        villager.anchor={x:home.x,y:home.y};
        villager.householdId=`house:${home.x}:${home.y}`;
        villager.workplace=farms[Math.floor(i/4)];
        villager.jobRefreshTimer=0;
    }
}

test("a controlled settlement survives a 25-year deterministic campaign horizon",()=>{
    prepareCampaign();
    const started=performance.now();
    const targetTicks=10000;
    for(let tick=0;tick<targetTicks;tick++)updateSimulation();
    const elapsed=performance.now()-started;
    assert.equal(state.tick,targetTicks,"the simulation must not stop before the 25-year horizon");
    assert.equal(state.year,26,"10,000 simulation days should complete 25 full years from year one");
    assert.equal(state.gameOver,false,"the staffed baseline settlement should remain recoverable");
    assert.ok(state.entities.length<=900,"entity count must stay below the world cap");
    assert.ok(state.entities.every(entity=>Number.isFinite(entity.x)&&Number.isFinite(entity.y)),"all entity coordinates must remain finite");
    assert.ok(state.entities.every(entity=>entity.x>=0&&entity.y>=0&&entity.x<WORLD_W&&entity.y<WORLD_H),"entities must remain inside world bounds");
    for(const [resource,value] of Object.entries(state.resources)){
        assert.ok(Number.isFinite(value),resource+" balance must remain finite");
        assert.ok(value>=0,resource+" balance must never become negative");
    }
    assert.ok(Number.isFinite(state.morale)&&state.morale>=0&&state.morale<=100,"morale must remain in its valid range");
    const ids=state.entities.map(entity=>entity.id).filter(id=>id!==undefined&&id!==null);
    assert.equal(new Set(ids).size,ids.length,"live entity IDs must remain unique");
    assert.ok(elapsed<30000,"25-year simulation exceeded the 30-second CI budget: "+elapsed.toFixed(1)+"ms");
    console.log("Kings & Cards 25-year campaign: "+targetTicks+" ticks, "+state.entities.length+" entities, year "+state.year+", "+elapsed.toFixed(1)+"ms, "+(targetTicks/(elapsed/1000)).toFixed(0)+" ticks/s");
});
