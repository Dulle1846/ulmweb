import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {spawnEntity} from "../../js/world/entities.js";
import {assignWorkerToVacantFuelJob,updateVillagers} from "../../js/simulation/villagers.js";
import {createSaveSnapshot,restoreSaveSnapshot} from "../../js/core/save-runtime.js";
import {generateResourceGeography} from "../../js/systems/resource-geography.js";
import {createIdentityState} from "../../js/systems/identity.js";

function makeCanvas() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {}
            };
        }
    };
}

test("villagers never overfill a workplace beyond its staffing capacity",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    const farm=spawnEntity(80,80,TYPE.FARM);
    const villagers=Array.from({length:5},(_,index)=>{
        const villager=spawnEntity(81+index,80,TYPE.VILLAGER);
        villager.jobRefreshTimer=0;
        villager.routineTimer=1000;
        return villager;
    });

    updateVillagers();

    // A farm now needs two farmers, not four, so an opening village can staff
    // its mill, bakery and sawmill as well as its fields.
    const assigned=villagers.filter(villager=>villager.workplace===farm);
    assert.equal(assigned.length,2);
    assert.equal(villagers.filter(villager=>villager.workplace===null).length,3);
});

test("a one-shot fuel order fills only the sick sawyer's slot and does not re-sort other jobs",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    const sawmill=spawnEntity(80,80,TYPE.SAWMILL);
    const sick=spawnEntity(81,80,TYPE.VILLAGER);
    sick.workplace=sawmill;
    sick.job="sawyer";
    sick.illnessUntilTick=state.tick+120;
    sick.jobRefreshTimer=1000;
    sick.routineTimer=1000;
    const farm=spawnEntity(83,80,TYPE.FARM);
    const bystander=spawnEntity(84,80,TYPE.VILLAGER);
    bystander.workplace=farm;
    bystander.job="farmer";
    bystander.jobRefreshTimer=123;
    bystander.routineTimer=1000;
    if(bystander.person)bystander.person.jobExperience=17;
    sawmill.inventory={version:1,input:{logs:4},output:{planks:3,firewood:2},reservedIn:{},reservedOut:{}};
    const healthy=spawnEntity(82,80,TYPE.VILLAGER);
    healthy.jobRefreshTimer=0;
    healthy.routineTimer=1000;

    const first=assignWorkerToVacantFuelJob();

    assert.equal(first.ok,true);
    assert.equal(healthy.workplace,sawmill,"a healthy resident must backfill the absent sawyer");
    assert.equal(healthy.job,"sawyer");
    assert.ok(healthy.fuelBackfillUntil>state.tick,"the replacement keeps the seat until recovery");
    assert.ok(sick.fuelBackfillGuardUntil>state.tick,"the sick worker does not trigger another rotation");
    assert.equal(bystander.workplace,farm);
    assert.equal(bystander.jobRefreshTimer,123,"unrelated job state must remain untouched");
    if(bystander.person)assert.equal(bystander.person.jobExperience,17,"unrelated tenure must remain untouched");
    assert.deepEqual(sawmill.inventory.output,{planks:3,firewood:2},"the production accumulator must remain untouched");

    const timer=healthy.jobRefreshTimer;
    assert.equal(assignWorkerToVacantFuelJob(),null,"the filled slot must not be assigned twice");
    assert.equal(healthy.jobRefreshTimer,timer,"a second order must not reset the replacement's timer");
    assert.deepEqual(sawmill.inventory.output,{planks:3,firewood:2});

    state.tick+=10;
    updateVillagers();
    assert.equal(healthy.jobRefreshTimer,timer,"the replacement timer is frozen for the whole backfill");
    assert.equal(sick.jobRefreshTimer,1000,"the sick original timer is frozen for the whole backfill");
});

test("a dead replacement cannot cause a second backfill in the same illness phase",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    const sawmill=spawnEntity(80,80,TYPE.SAWMILL);
    const sick=spawnEntity(81,80,TYPE.VILLAGER);
    sick.workplace=sawmill;
    sick.job="sawyer";
    sick.illnessUntilTick=state.tick+120;
    sick.jobRefreshTimer=1000;
    sick.routineTimer=1000;
    const replacement=spawnEntity(82,80,TYPE.VILLAGER);
    replacement.jobRefreshTimer=0;
    replacement.routineTimer=1000;
    const spare=spawnEntity(83,80,TYPE.VILLAGER);
    spare.jobRefreshTimer=0;
    spare.routineTimer=1000;

    assert.equal(assignWorkerToVacantFuelJob().ok,true);
    replacement.dead=true;
    updateVillagers();
    assert.ok(sick.fuelBackfillGuardUntil>state.tick,"the illness guard must outlive a dead replacement");

    assert.equal(assignWorkerToVacantFuelJob(),null,"the same illness phase is already served");
    assert.equal(spare.workplace,null,"no second replacement may consume the vacancy");
});

test("a recovered fuel vacancy releases the temporary replacement without a hanging guard",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    const sawmill=spawnEntity(80,80,TYPE.SAWMILL);
    const sick=spawnEntity(81,80,TYPE.VILLAGER);
    sick.workplace=sawmill;
    sick.job="sawyer";
    sick.illnessUntilTick=state.tick+120;
    sick.jobRefreshTimer=1000;
    sick.routineTimer=1000;
    const replacement=spawnEntity(82,80,TYPE.VILLAGER);
    replacement.jobRefreshTimer=0;
    replacement.routineTimer=1000;

    assert.equal(assignWorkerToVacantFuelJob().ok,true);
    assert.equal(replacement.workplace,sawmill);
    state.tick=sick.illnessUntilTick;
    updateVillagers();

    const sawmillWorkers=state.entities.filter(entity=>!entity.dead&&entity.type===TYPE.VILLAGER&&entity.workplace===sawmill);
    assert.equal(sawmillWorkers.length,1,"recovery must not leave a double worker");
    assert.equal(sawmillWorkers[0],sick,"the recovered original keeps the fuel seat");
    assert.notEqual(replacement.workplace,sawmill,"the temporary replacement must be released");
    assert.equal(sick.fuelBackfillGuardUntil,undefined,"the sick guard must not hang after recovery");
    assert.equal(replacement.fuelBackfillUntil,undefined,"the replacement guard must not hang after recovery");
});

test("fuel-backfill guards survive an exact save/load roundtrip without touching ordinary entities",()=>{
    const previousDocument=globalThis.document;
    globalThis.document={createElement:()=>makeCanvas()};
    try {
        resetState();
        state.terrainResolution=1;
        state.terrainPixW=WORLD_W;
        state.terrainPixH=WORLD_H;
        state.worldSeed=20261108;
        state.identity=createIdentityState({kingdomName:"Fuel Realm",dynastyName:"Royal House",foundedYear:1});
        state.kingdomName=state.identity.kingdomName;
        state.royal.dynastyName=state.identity.dynastyName;
        state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
        state.moistureMap=new Float32Array(WORLD_W*WORLD_H).fill(0.6);
        state.temperatureMap=new Float32Array(WORLD_W*WORLD_H).fill(0.55);
        generateResourceGeography(state.worldSeed);
        state.isPaused=false;
        state.gameOver=false;
        state.city.needs={summary:{firewoodStock:4}};
        const sawmill=spawnEntity(80,80,TYPE.SAWMILL);
        const sick=spawnEntity(81,80,TYPE.VILLAGER);
        sick.workplace=sawmill;
        sick.job="sawyer";
        sick.illnessUntilTick=state.tick+120;
        sick.jobRefreshTimer=1000;
        sick.routineTimer=1000;
        const replacement=spawnEntity(82,80,TYPE.VILLAGER);
        replacement.jobRefreshTimer=0;
        replacement.routineTimer=1000;
        const bystander=spawnEntity(90,80,TYPE.VILLAGER);
        bystander.jobRefreshTimer=333;
        bystander.routineTimer=1000;

        assert.equal(assignWorkerToVacantFuelJob().ok,true);
        const spare=spawnEntity(83,80,TYPE.VILLAGER);
        spare.jobRefreshTimer=1000;
        spare.routineTimer=1000;
        const saved=JSON.parse(JSON.stringify(createSaveSnapshot()));
        const savedSick=saved.entities.find(entity=>entity.id===sick.id);
        const savedReplacement=saved.entities.find(entity=>entity.id===replacement.id);
        const savedSawmill=saved.entities.find(entity=>entity.id===sawmill.id);
        const savedBystander=saved.entities.find(entity=>entity.id===bystander.id);
        assert.ok(savedSick.fuelBackfillGuardUntil>saved.tick,"the sick guard must be saved");
        assert.ok(savedReplacement.fuelBackfillUntil>saved.tick,"the replacement lease must be saved");
        assert.equal(savedSick.fuelBackfillUntil,undefined,"the guard must not be duplicated as a lease");
        assert.equal(savedReplacement.fuelBackfillGuardUntil,undefined,"the replacement must not carry the phase guard");
        assert.equal(savedSick.fuelBackfillServedUntil,undefined,"derived ownership must not be saved");
        assert.equal(savedSawmill.fuelBackfillActiveUntil,undefined,"building ownership must not be duplicated");
        assert.equal(savedBystander.fuelBackfillUntil,undefined,"ordinary villagers must not gain backfill keys");
        assert.equal("fuelBackfillUntil" in savedBystander,false,"non-settler snapshots stay byte-identical");

        const prepared=JSON.parse(JSON.stringify(saved));
        resetState();
        state.activeProfileId="fuel-backfill-roundtrip";
        state.playerName=saved.playerName;
        state.hasStarted=true;
        state.isPaused=false;
        restoreSaveSnapshot(prepared);

        const restoredSick=state.entities.find(entity=>entity.id===sick.id);
        const restoredReplacement=state.entities.find(entity=>entity.id===replacement.id);
        const restoredSawmill=state.entities.find(entity=>entity.id===sawmill.id);
        const restoredBystander=state.entities.find(entity=>entity.id===bystander.id);
        const restoredSpare=state.entities.find(entity=>entity.id===spare.id);
        assert.equal(restoredSick.fuelBackfillGuardUntil,savedSick.fuelBackfillGuardUntil);
        assert.equal(restoredReplacement.fuelBackfillUntil,savedReplacement.fuelBackfillUntil);
        assert.equal(restoredBystander.fuelBackfillUntil,undefined);

        // Continue the lease through the normal tick. The reserve is still
        // low and an idle resident is available, so only the restored guard
        // can prevent a second order.
        state.city.needs={summary:{firewoodStock:4}};
        state.tick=40;
        assert.equal(assignWorkerToVacantFuelJob(),null,"a restored lease must not be issued twice");
        assert.equal(restoredSpare.workplace,null,"the idle resident must not consume the restored phase");
        updateVillagers();
        assert.equal(restoredReplacement.workplace,restoredSawmill);
        assert.equal(restoredReplacement.fuelBackfillUntil,savedReplacement.fuelBackfillUntil);
        assert.equal(restoredSpare.workplace,null,"the policy tick must respect the restored lease");

        // A legacy save without the two transient fields loads normally and
        // does not invent a backfill owner.
        const legacy=JSON.parse(JSON.stringify(saved));
        for(const entity of legacy.entities){
            delete entity.fuelBackfillUntil;
            delete entity.fuelBackfillGuardUntil;
        }
        resetState();
        state.activeProfileId="fuel-backfill-legacy";
        state.playerName=legacy.playerName;
        state.hasStarted=true;
        state.isPaused=false;
        restoreSaveSnapshot(legacy);
        assert.equal(state.entities.find(entity=>entity.id===sick.id).fuelBackfillGuardUntil,undefined);
        assert.equal(state.entities.find(entity=>entity.id===replacement.id).fuelBackfillUntil,undefined);
        assert.equal(state.entities.find(entity=>entity.id===spare.id).workplace,null);
    } finally {
        globalThis.document=previousDocument;
    }
});

test("a sick fuel worker is replaced while the reserve is still healthy",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    state.tick=20;
    state.city.needs={summary:{firewoodStock:60}};
    const sawmill=spawnEntity(80,80,TYPE.SAWMILL);
    const sick=spawnEntity(81,80,TYPE.VILLAGER);
    sick.workplace=sawmill;
    sick.job="sawyer";
    sick.illnessUntilTick=state.tick+120;
    sick.jobRefreshTimer=1000;
    sick.routineTimer=1000;
    const idle=spawnEntity(82,80,TYPE.VILLAGER);
    idle.jobRefreshTimer=1000;
    idle.routineTimer=1000;

    updateVillagers();

    assert.equal(idle.workplace,sawmill,"the policy must see the unstaffed fuel seat, not only a low store");
    assert.equal(idle.job,"sawyer");
    assert.ok(idle.fuelBackfillUntil>state.tick);
    assert.ok(sick.fuelBackfillGuardUntil>state.tick);
});

test("the normal villager tick fills a sick fuel seat when the reserve runs low",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    state.tick=20;
    state.city.needs={summary:{firewoodStock:4}};
    const sawmill=spawnEntity(80,80,TYPE.SAWMILL);
    const sick=spawnEntity(81,80,TYPE.VILLAGER);
    sick.workplace=sawmill;
    sick.job="sawyer";
    sick.illnessUntilTick=state.tick+120;
    sick.jobRefreshTimer=1000;
    sick.routineTimer=1000;
    const idle=spawnEntity(82,80,TYPE.VILLAGER);
    idle.jobRefreshTimer=1000;
    idle.routineTimer=1000;

    updateVillagers();

    assert.equal(idle.workplace,sawmill,"the simulation tick, not a test driver, must issue the order");
    assert.equal(idle.job,"sawyer");
    assert.ok(idle.fuelBackfillUntil>state.tick);
    assert.ok(sick.fuelBackfillGuardUntil>state.tick);
});

test("a villager is released from a destroyed workplace on reassignment",()=>{
    resetState();
    state.isPaused=false;
    state.gameOver=false;
    const farm=spawnEntity(80,80,TYPE.FARM);
    const villager=spawnEntity(81,80,TYPE.VILLAGER);
    villager.workplace=farm;
    villager.jobRefreshTimer=0;
    villager.routineTimer=1000;
    farm.dead=true;

    updateVillagers();

    assert.equal(villager.workplace,null);
    assert.equal(villager.job,"wanderer");
});

test("villager age advances once per settlement year, never once per simulation tick",()=>{
    resetState();
    state.isPaused=false;
    state.gameOver=false;
    state.year=2;
    state.dayOfYear=1;
    const villager=spawnEntity(80,80,TYPE.VILLAGER);
    villager.age=20;
    villager.lastAgedYear=1;
    villager.jobRefreshTimer=1000;
    villager.routineTimer=1000;

    updateVillagers();
    assert.equal(villager.age,20);

    state.dayOfYear=0;
    updateVillagers();
    assert.equal(villager.age,21);
    updateVillagers();
    assert.equal(villager.age,21);

    state.year=3;
    updateVillagers();
    assert.equal(villager.age,22);
});
