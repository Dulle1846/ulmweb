// Building production and recurring settlement income.
import { TYPE } from "../core/types.js";
import { TILE_SIZE } from "../core/config.js";
import { state } from "../core/state.js";
import { getEntitiesOfType } from "../world/entities.js";
import { addResource } from "../systems/resources.js";
import { queueParticle,queueFloater } from "../core/presentation-effects.js";
import { distance } from "../core/utils.js";
export function updateBuildingIncome(){
    const tick=state.tick,farms=getEntitiesOfType(TYPE.FARM),lumbers=getEntitiesOfType(TYPE.LUMBER);
    const quarries=getEntitiesOfType(TYPE.QUARRY),goldMines=getEntitiesOfType(TYPE.GOLDMINE);
    const taverns=getEntitiesOfType(TYPE.TAVERN),temples=getEntitiesOfType(TYPE.TEMPLE),mills=getEntitiesOfType(TYPE.MILL);
    if(tick%18===0){
        farms.forEach(f=>{
            const base=(state.seasonIndex===0||state.seasonIndex===1)?5:3;
            const nearbyMill=mills.some(m=>distance(m.x,m.y,f.x,f.y)<6);
            addResource("food",Math.floor(base*(nearbyMill?1.6:1)));
            if(Math.random()<0.12)queueParticle(f.x*TILE_SIZE+20,f.y*TILE_SIZE+12,"#bef575",26,0,-1.5);
        });
        lumbers.forEach(()=>addResource("wood",3+(Math.random()>0.6?2:0)));
        quarries.forEach(()=>addResource("stone",4));
        goldMines.forEach(mine=>{
            addResource("gold",state.seasonIndex===3?1:2);
            if(Math.random()<0.07)queueFloater(mine.x*TILE_SIZE,mine.y*TILE_SIZE-18,"GOLD VEIN","#fde047");
        });
    }
    if(tick%55===0){
        taverns.forEach(()=>{addResource("gold",2);state.morale=Math.min(100,state.morale+0.6);});
        temples.forEach(()=>{state.morale=Math.min(100,state.morale+1.2);});
    }
}
