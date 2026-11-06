// Resource ledger. Every resource change is validated and recorded per simulation tick.
import { state } from "../core/state.js";
import { recordResourceMovement } from "./goods-book.js";
export const RESOURCE_KEYS=Object.freeze(["wood","stone","gold","food"]);
export function resetIncome(){state.incomeThisTick={wood:0,stone:0,gold:0,food:0};}
export function addResource(type,amount){
    if(!RESOURCE_KEYS.includes(type)||!Number.isFinite(amount))throw new TypeError("Unknown resource or non-finite amount.");
    const before=Number(state.resources[type])||0;
    state.resources[type]=Math.max(0,before+amount);
    state.incomeThisTick[type]=(Number(state.incomeThisTick[type])||0)+(state.resources[type]-before);
}
export function canAfford(card){
    if(!card||!card.cost)return false;
    return Object.entries(card.cost).every(([resource,amount])=>RESOURCE_KEYS.includes(resource)&&Number.isFinite(amount)&&amount>=0&&(state.resources[resource]||0)>=amount);
}
export function payForCard(card){
    if(!canAfford(card))return false;
    for(const [resource,amount] of Object.entries(card.cost||{}))addResource(resource,-amount);
    const foodCost=Number(card.cost?.food||0);
    if(foodCost>0)recordResourceMovement("food",-foodCost,"card-cost",{from:{kind:"realm",id:"royal-stores"},to:{kind:"card",id:String(card.id||card.uid||"card")}});
    return true;
}
