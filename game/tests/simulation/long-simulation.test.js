import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {spawnEntity} from "../../js/world/entities.js";
import {updateSimulation} from "../../js/simulation/simulation.js";
import {updateFriendlyMovement} from "../../js/simulation/villagers.js";

function prepare(){
    resetState();
    state.hasStarted=true;
    state.isPaused=false;
    state.gameOver=false;
    state.resources={wood:5000,stone:5000,gold:5000,food:5000};
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.moistureMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.explored=Array.from({length:WORLD_W},()=>Array(WORLD_H).fill(false));
}

test("a long settlement simulation remains finite with a large population",()=>{
    prepare();
    for(let i=0;i<12;i++)spawnEntity(70+(i%4)*3,70+Math.floor(i/4)*3,TYPE.HOUSE);
    for(let i=0;i<8;i++)spawnEntity(60+(i%4)*7,60+Math.floor(i/4)*7,TYPE.FARM);
    for(let i=0;i<180;i++){
        const villager=spawnEntity(64+(i%20),64+Math.floor(i/20),TYPE.VILLAGER);
        villager.home={x:70,y:70};
        villager.anchor={x:70,y:70};
        villager.jobRefreshTimer=0;
    }
    const started=performance.now();
    for(let tick=0;tick<1200;tick++)updateSimulation();
    const elapsed=performance.now()-started;
    assert.equal(state.tick,1200);
    assert.ok(state.entities.length>=180);
    assert.ok(state.entities.length<=900);
    assert.ok(state.entities.every(entity=>Number.isFinite(entity.x)&&Number.isFinite(entity.y)));
    assert.ok(elapsed<10000,"1,200 ticks exceeded the generous 10-second CI safety budget: "+elapsed.toFixed(1)+"ms");
    console.log("Kings & Cards simulation benchmark: 1,200 ticks, "+state.entities.length+" entities, "+elapsed.toFixed(1)+"ms, "+(1200/(elapsed/1000)).toFixed(0)+" ticks/s");
});

test("large mobile groups complete repeated movement steps without invalid coordinates",()=>{
    prepare();
    for(let i=0;i<8;i++)spawnEntity(75+i*2,75,TYPE.HOUSE);
    const villagers=[];
    for(let i=0;i<120;i++){
        const villager=spawnEntity(65+(i%15),65+Math.floor(i/15),TYPE.VILLAGER);
        villager.home={x:75,y:75};villager.anchor={x:75,y:75};
        villager.targetX=80+(i%10);villager.targetY=80+Math.floor(i/10);
        villagers.push(villager);
    }
    for(let i=0;i<12;i++)spawnEntity(88+(i%4),88+Math.floor(i/4),TYPE.GOBLIN);
    const started=performance.now();
    for(let step=0;step<180;step++)updateFriendlyMovement(1/30);
    const elapsed=performance.now()-started;
    assert.ok(villagers.every(unit=>Number.isFinite(unit.x)&&Number.isFinite(unit.y)));
    assert.ok(villagers.every(unit=>unit.x>=0&&unit.y>=0&&unit.x<WORLD_W&&unit.y<WORLD_H));
    assert.ok(elapsed<10000,"180 movement frames exceeded the generous 10-second CI safety budget: "+elapsed.toFixed(1)+"ms");
    console.log("Kings & Cards movement benchmark: 120 villagers + 12 enemies, 180 steps, "+elapsed.toFixed(1)+"ms");
});
