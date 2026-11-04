// Realm issues: authored incidents with explicit player choices and a persistent event log.
import { WORLD_W,WORLD_H } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { spawnEntity } from "../world/entities.js";
import { randInt } from "../core/utils.js";
export function addLog(text,color="#a3a3a3",kind="realm"){
    const entry={id:++state.eventSequence,text:String(text),color,tick:state.tick,kind};
    state.eventLog.unshift(entry);if(state.eventLog.length>100)state.eventLog.length=100;return entry;
}
const ISSUE_DECK=[
{id:"harvest",title:"A Bountiful Harvest",description:"The fields have yielded more than expected. How should the surplus be used?",choices:[
{label:"Fill the granaries",description:"+35 food",effects:{resources:{food:35}}},
{label:"Sell the surplus",description:"+18 gold, +12 food",effects:{resources:{gold:18,food:12}}}]},
{id:"gold-vein",title:"A Gold Seam Discovered",description:"Miners have uncovered a glittering seam in the hills.",choices:[
{label:"Work the seam",description:"+28 gold",effects:{resources:{gold:28}}},
{label:"Secure the site",description:"+12 gold and +8 morale",effects:{resources:{gold:12},morale:8}}]},
{id:"merchant",title:"A Merchant Caravan Arrives",description:"A travelling guild offers a one-time settlement contract.",choices:[
{label:"Sign the timber contract",description:"Pay 10 gold, gain 30 wood",effects:{resources:{gold:-10,wood:30}}},
{label:"Sell provisions",description:"Gain 24 gold, lose 20 food",effects:{resources:{gold:24,food:-20}}}]},
{id:"plague",title:"Sickness in the Lower Quarter",description:"A fever has spread through several households.",choices:[
{label:"Fund the healers",description:"Pay 22 gold, morale +8",effects:{resources:{gold:-22},morale:8}},
{label:"Ration supplies",description:"Lose 18 food, morale -4",effects:{resources:{food:-18},morale:-4}}]},
{id:"bandits",title:"Bandits on the Trade Road",description:"Scouts report bandits intercepting caravans near the frontier.",choices:[
{label:"Hire local guards",description:"Pay 25 gold, morale +3",effects:{resources:{gold:-25},morale:3}},
{label:"Let the caravan pass",description:"Lose 12 gold",effects:{resources:{gold:-12}}}]},
{id:"festival",title:"The Lantern Festival",description:"The townsfolk want a night of music, food and celebration.",choices:[
{label:"Fund the festivities",description:"Pay 15 food, morale +16",effects:{resources:{food:-15},morale:16}},
{label:"Keep the stores closed",description:"No cost, morale -3",effects:{morale:-3}}]},
{id:"settlers",title:"Settlers at the Gate",description:"A small family group seeks permission to settle in Eldria.",choices:[
{label:"Welcome them",description:"Gain 2 villagers, pay 10 food",effects:{resources:{food:-10},villagers:2,morale:4}},
{label:"Offer temporary work",description:"Gain 1 villager and 8 wood",effects:{resources:{wood:8},villagers:1}}]},
{id:"storm",title:"A Fierce Autumn Storm",description:"A storm threatens exposed stores and outlying farms.",choices:[
{label:"Protect the supplies",description:"Pay 16 wood",effects:{resources:{wood:-16}}},
{label:"Accept the damage",description:"Lose 18 food and 8 wood",effects:{resources:{food:-18,wood:-8}}}]}
];
export function triggerRandomEvent(){
    if(state.activeEvent)return null;
    const issue=ISSUE_DECK[randInt(0,ISSUE_DECK.length)];
    state.activeEvent={...issue,createdAtTick:state.tick};
    addLog("ISSUE: "+issue.title,"#e4bd72","issue");return state.activeEvent;
}
export function resolveEventChoice(choiceIndex){
    const issue=state.activeEvent;if(!issue)return false;
    const choice=issue.choices[choiceIndex];if(!choice)return false;
    const effects=choice.effects||{},resources=effects.resources||{};
    const cannotPay=Object.entries(resources).some(([key,value])=>value<0&&(state.resources[key]||0)<Math.abs(value));
    if(cannotPay){addLog("ISSUE UNRESOLVED: NOT ENOUGH RESOURCES","#e9857b","issue");return false;}
    for(const [key,value] of Object.entries(resources))state.resources[key]+=value;
    if(Number.isFinite(effects.morale))state.morale=Math.max(0,Math.min(100,state.morale+effects.morale));
    if(effects.villagers){
        const keep=state.entities.find(entity=>entity.type===TYPE.KEEP&&!entity.dead);
        const cx=keep?.x??WORLD_W/2,cy=keep?.y??WORLD_H/2;
        for(let i=0;i<effects.villagers;i++)spawnEntity(cx+randInt(-3,4),cy+randInt(-3,4),TYPE.VILLAGER);
    }
    addLog(issue.title.toUpperCase()+": "+choice.label,"#a5d6a7","resolution");
    state.statistics.totalEventsResolved++;state.activeEvent=null;return true;
}
export function checkRandomEvents(){
    if(state.activeEvent)return;
    if(state.tick-state.lastRandomEvent>520+randInt(0,700)){state.lastRandomEvent=state.tick;if(Math.random()<0.72)triggerRandomEvent();}
}
