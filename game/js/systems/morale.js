// Morale responds to civic buildings, threats and population pressure.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { getEntitiesOfType } from "../world/entities.js";
import { getEndeavourModifiers } from "./endeavours.js";
export function updateMorale(){
    if(state.tick%45!==0)return;
    let delta=getEntitiesOfType(TYPE.TAVERN).length*0.6+getEntitiesOfType(TYPE.TEMPLE).length*1.4;
    delta-=state.entities.filter(entity=>!entity.dead&&entity.isEnemy()).length*2;
    if(getEntitiesOfType(TYPE.VILLAGER).length>35)delta-=0.4;
    if(state.resources.food<10)delta-=1.1;
    delta+=Math.max(0,Number(getEndeavourModifiers().morale)||0)*0.25;
    state.morale=Math.max(0,Math.min(100,state.morale+delta));
}
