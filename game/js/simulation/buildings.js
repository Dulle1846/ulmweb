// Building production and recurring settlement income.
import { TYPE } from "../core/types.js";
import { TILE_SIZE } from "../core/config.js";
import { state } from "../core/state.js";
import { getEntitiesOfType } from "../world/entities.js";
import { addResource } from "../systems/resources.js";
import { queueParticle,queueFloater } from "../core/presentation-effects.js";
import { distance } from "../core/utils.js";
import { getWorkforceSnapshot,getBuildingEfficiency } from "../systems/economy.js";
export function updateBuildingIncome(){
    const tick=state.tick,productionTick=tick%18===0,civicTick=tick%55===0;
    if(!productionTick&&!civicTick)return;
    const workforce=getWorkforceSnapshot();
    const farms=getEntitiesOfType(TYPE.FARM),lumbers=getEntitiesOfType(TYPE.LUMBER);
    const quarries=getEntitiesOfType(TYPE.QUARRY),goldMines=getEntitiesOfType(TYPE.GOLDMINE);
    const taverns=getEntitiesOfType(TYPE.TAVERN),temples=getEntitiesOfType(TYPE.TEMPLE),mills=getEntitiesOfType(TYPE.MILL);
    if(productionTick){
        const chains=state.economy||(state.economy={});
        const production=chains.productionChains||(chains.productionChains={millWoodConsumed:0,millBonusFood:0,tavernFoodConsumed:0,tavernGoldProduced:0});
        const activeMills=new Map();
        // A mill is a real production link: it consumes timber to improve nearby farms.
        mills.forEach(mill=>{
            const efficiency=getBuildingEfficiency(mill,workforce);
            const requiredWood=0.5*efficiency;
            if(requiredWood<=0)return;
            const fuel=Math.min(state.resources.wood,requiredWood);
            if(fuel>0){
                addResource("wood",-fuel);
                production.millWoodConsumed+=fuel;
                activeMills.set(mill,fuel/requiredWood);
            }
        });
        farms.forEach(f=>{
            const base=(state.seasonIndex===0||state.seasonIndex===1)?5:3;
            let millRatio=0;
            for(const [mill,ratio] of activeMills){
                if(distance(mill.x,mill.y,f.x,f.y)<6)millRatio=Math.max(millRatio,ratio);
            }
            const efficiency=getBuildingEfficiency(f,workforce);
            const output=base*efficiency*(1+0.6*millRatio);
            addResource("food",output);
            production.millBonusFood+=base*efficiency*0.6*millRatio;
            if(Math.random()<0.12)queueParticle(f.x*TILE_SIZE+20,f.y*TILE_SIZE+12,"#bef575",26,0,-1.5);
        });
        lumbers.forEach(building=>addResource("wood",(3+(Math.random()>0.6?2:0))*getBuildingEfficiency(building,workforce)));
        quarries.forEach(building=>addResource("stone",4*getBuildingEfficiency(building,workforce)));
        goldMines.forEach(mine=>{
            addResource("gold",(state.seasonIndex===3?1:2)*getBuildingEfficiency(mine,workforce));
            if(Math.random()<0.07)queueFloater(mine.x*TILE_SIZE,mine.y*TILE_SIZE-18,"GOLD VEIN","#fde047");
        });
    }
    if(civicTick){
        const chains=state.economy||(state.economy={});
        const production=chains.productionChains||(chains.productionChains={millWoodConsumed:0,millBonusFood:0,tavernFoodConsumed:0,tavernGoldProduced:0});
        // Taverns convert surplus food into trade income; without provisions they cannot operate.
        taverns.forEach(building=>{
            const efficiency=getBuildingEfficiency(building,workforce);
            const requiredFood=1*efficiency;
            if(requiredFood<=0)return;
            const provisions=Math.min(state.resources.food,requiredFood);
            const operatingRatio=provisions/requiredFood;
            addResource("food",-provisions);
            const gold=3*efficiency*operatingRatio;
            addResource("gold",gold);
            production.tavernFoodConsumed+=provisions;
            production.tavernGoldProduced+=gold;
            state.morale=Math.min(100,state.morale+0.6*efficiency*operatingRatio);
        });
        temples.forEach(building=>{state.morale=Math.min(100,state.morale+1.2*getBuildingEfficiency(building,workforce));});
    }
}
