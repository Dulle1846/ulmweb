// ── Resource Tracking & Income ─────────────────────────────────

import { state } from '../core/state.js';

export function resetIncome() {
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0, research: 0 };
}

export function addResource(type, amount) {
    state.resources[type] += amount;
    state.incomeThisTick[type] += amount;
}

export function canAfford(card) {
    if (!card || !card.cost) return false;
    if (card.cost.wood  && state.resources.wood  < card.cost.wood)  return false;
    if (card.cost.stone && state.resources.stone < card.cost.stone) return false;
    if (card.cost.gold  && state.resources.gold  < card.cost.gold)  return false;
    if (card.cost.food  && state.resources.food  < card.cost.food)  return false;
    return true;
}

export function payForCard(card) {
    if (card.cost.wood)  state.resources.wood  -= card.cost.wood;
    if (card.cost.stone) state.resources.stone -= card.cost.stone;
    if (card.cost.gold)  state.resources.gold  -= card.cost.gold;
    if (card.cost.food)  state.resources.food  -= card.cost.food;
}
