// Fixed-step simulation orchestrator.
import { state } from "../core/state.js";
import { resetIncome } from "../systems/resources.js";
import { updateMorale } from "../systems/morale.js";
import { checkRandomEvents,addLog } from "../systems/events.js";
import { updateMarket } from "../systems/market.js";
import { updateEconomy } from "../systems/economy.js";
import { updateHealth } from "../systems/health.js";
import { updatePopulation } from "../systems/population.js";
import { updateCardDraw } from "../systems/cards.js";
import { updateWeather } from "../world/weather.js";
import { updateBuildingIncome } from "./buildings.js";
import { updateVillagers } from "./villagers.js";
import { updateCombat } from "./combat.js";
import { queueMessage } from "../core/presentation-effects.js";
import { updatePeople } from "../systems/people.js";
import { updateBirths } from "../systems/births.js";
import { updateSocialLife } from "../systems/social.js";
import { updatePersonalAgency } from "../systems/agency.js";
export function updateSimulation(){
    if(state.isPaused||state.gameOver||!state.hasStarted)return;
    const previousYear=state.year;
    state.tick++;state.dayOfYear++;
    if(state.dayOfYear>=400){state.dayOfYear=0;state.year++;}
    let newborn=null;
    let socialResult=null;
    if(state.year>previousYear){
        updatePeople();
        socialResult=updateSocialLife();
        updatePersonalAgency();
        newborn=updateBirths();
    }
    state.seasonIndex=Math.floor(state.dayOfYear/100)%4;
    resetIncome();
    const newcomer=newborn?null:updatePopulation();
    if(socialResult?.partnerships?.length){
        for(const partnership of socialResult.partnerships){
            addLog("A PARTNERSHIP FORMED: "+partnership.first+" & "+partnership.second,"#e8c77b","family");
        }
    }
    if(newborn)addLog("A CHILD WAS BORN: "+newborn.person.name,"#e8c77b","family");
    else if(newcomer)addLog("A NEW RESIDENT HAS JOINED THE REALM","#a3d6a7","population");
    updateBuildingIncome();updateVillagers();updateCombat();checkRandomEvents();updateCardDraw();
    updateWeather();updateMorale();updateMarket();updateEconomy();updateHealth();
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
