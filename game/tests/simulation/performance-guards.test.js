import test from "node:test";
import assert from "node:assert/strict";
import { resetState,state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { WORLD_W,WORLD_H } from "../../js/core/config.js";
import { rebuildBlockedBuildingTiles,isWalkable } from "../../js/simulation/villagers.js";

function prepareDryWorld(){
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
}

test("movement collision index respects building footprints without per-unit entity scans",()=>{
    prepareDryWorld();
    state.entities=[{
        x:40,y:40,type:TYPE.HOUSE,dead:false,footprintScale:2,
        isBuilding(){return true;}
    }];
    rebuildBlockedBuildingTiles();
    assert.equal(isWalkable(40,40),false);
    assert.equal(isWalkable(38,40),false);
    assert.equal(isWalkable(46,40),true);
});

test("movement collision index is rebuilt after a building is removed or added",()=>{
    prepareDryWorld();
    const house={x:40,y:40,type:TYPE.HOUSE,dead:false,isBuilding(){return true;}};
    state.entities=[house];
    rebuildBlockedBuildingTiles();
    assert.equal(isWalkable(40,40),false);
    house.dead=true;
    state.entities=state.entities.filter(entity=>!entity.dead);
    rebuildBlockedBuildingTiles();
    assert.equal(isWalkable(40,40),true);
});

test("walkability still rejects water after the building lookup is indexed",()=>{
    prepareDryWorld();
    const index=40*WORLD_W+40;
    state.heightMap[index]=0.1;
    state.entities=[];
    rebuildBlockedBuildingTiles();
    assert.equal(isWalkable(40.2,40.2),false);
    assert.equal(isWalkable(41.2,40.2),true);
});
