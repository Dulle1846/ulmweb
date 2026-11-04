// Fixed-step simulation orchestrator.
import { state } from "../core/state.js";
import { resetIncome } from "../systems/resources.js";
import { updateMorale } from "../systems/morale.js";
import { checkRandomEvents,addLog } from "../systems/events.js";
import { updateMarket } from "../systems/market.js";
import { updateWeather } from "../world/weather.js";
import { updateBuildingIncome } from "./buildings.js";
import { updateVillagers } from "./villagers.js";
import { updateCombat } from "./combat.js";
import { queueMessage } from "../core/presentation-effects.js";
export function updateSimulation(){
    if(state.isPaused||state.gameOver||!state.hasStarted)return;
    state.tick++;state.dayOfYear++;
    if(state.dayOfYear>=400){state.dayOfYear=0;state.year++;}
    state.seasonIndex=Math.floor(state.dayOfYear/100)%4;
    resetIncome();updateBuildingIncome();updateVillagers();updateCombat();checkRandomEvents();
    updateWeather();updateMorale();updateMarket();
    state.entities=state.entities.filter(entity=>!entity.dead);
    if(state.raidActive&&!state.entities.some(entity=>entity.isEnemy())){
        state.totalRaidsSurvived++;state.raidActive=false;addLog("RAID DEFEATED — THE REALM HOLDS","#a5d6a7","military");
    }
    if(state.year>=12&&state.morale>80&&!state.victory){
        state.victory=true;addLog("THE KINGDOM ENDURES","#e4bd72","milestone");
        queueMessage("YOUR KINGDOM ENDURES","A LEGEND WAS BORN",8000);
    }
    if(state.morale<8&&state.tick>800&&!state.gameOver){
        state.gameOver=true;addLog("THE REALM FELL — MORALE COLLAPSED","#e9857b","milestone");
        queueMessage("THE REALM FELL","MORALE COLLAPSED",0);
    }
}
