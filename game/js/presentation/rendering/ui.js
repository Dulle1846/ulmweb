// ── UI Elements (Header, Sidebar) ──────────────────────────────

import { SEASONS } from '../../core/config.js';
import { TYPE } from '../../core/types.js';
import { state } from '../../core/state.js';
import { getEntitiesOfType } from '../../world/entities.js';

export function showBigMessage(title, subtitle, timeout = 1800) {
    const overlay = document.getElementById("big-message");
    document.getElementById("big-title").innerHTML = title;
    document.getElementById("big-subtitle").innerHTML = subtitle;
    overlay.classList.remove("hidden");
    overlay.style.opacity = 1;

    setTimeout(() => {
        overlay.style.opacity = 0;
        setTimeout(() => {
            if (!overlay.classList.contains("hidden")) overlay.classList.add("hidden");
        }, 800);
    }, timeout);
}

export function renderUI() {
    // resources
    document.getElementById("res-wood").textContent  = Math.floor(state.resources.wood);
    document.getElementById("res-stone").textContent = Math.floor(state.resources.stone);
    document.getElementById("res-gold").textContent  = Math.floor(state.resources.gold);
    document.getElementById("res-food").textContent  = Math.floor(state.resources.food);

    const inc = state.incomeThisTick;
    document.getElementById("wood-income").innerHTML  = inc.wood  > 0 ? `+${inc.wood}`  : "";
    document.getElementById("stone-income").innerHTML = inc.stone > 0 ? `+${inc.stone}` : "";
    document.getElementById("gold-income").innerHTML  = inc.gold  > 0 ? `+${inc.gold}`  : "";
    document.getElementById("food-income").innerHTML  = inc.food  > 0 ? `+${inc.food}`  : "";

    // morale
    const moraleEl = document.getElementById("morale-bar");
    moraleEl.style.width = `${state.morale}%`;
    document.getElementById("morale-value").textContent = Math.floor(state.morale);
    moraleEl.style.background = state.morale < 30 ? "rgb(190 18 60)" : "";

    // date
    document.getElementById("season").textContent = SEASONS[state.seasonIndex];
    document.getElementById("year").textContent   = `YEAR ${state.year}`;
    document.getElementById("tick-count").textContent = state.tick;

    // population
    const pops   = getEntitiesOfType(TYPE.VILLAGER).length;
    const houses = getEntitiesOfType(TYPE.HOUSE).length;
    document.getElementById("population").innerHTML =
        `POP <span class="text-white">${pops}</span> <span class="text-zinc-400">/ ${houses * 4}</span>`;

    // current card
    if (state.currentCard) {
        document.getElementById("card-icon").innerHTML = state.currentCard.icon;
        document.getElementById("card-name").textContent = state.currentCard.name;
        document.getElementById("card-desc").textContent = state.currentCard.desc;

        const woodCostEl  = document.getElementById("card-cost-wood");
        const stoneCostEl = document.getElementById("card-cost-stone");
        const goldCostEl  = document.getElementById("card-cost-gold");

        woodCostEl.style.display  = state.currentCard.cost.wood  ? "flex" : "none";
        if (state.currentCard.cost.wood)  woodCostEl.children[1].textContent  = state.currentCard.cost.wood;

        stoneCostEl.style.display = state.currentCard.cost.stone ? "flex" : "none";
        if (state.currentCard.cost.stone) stoneCostEl.children[1].textContent = state.currentCard.cost.stone;

        goldCostEl.style.display  = state.currentCard.cost.gold  ? "flex" : "none";
        if (state.currentCard.cost.gold)  goldCostEl.children[1].textContent  = state.currentCard.cost.gold;
    }

    // tab content
    renderTabContent();
}

function renderTabContent() {
    const container = document.getElementById("tab-content");

    if (state.selectedTab === 0) {
        let html = `<div class="space-y-3 text-xs">`;
        state.eventLog.forEach(entry => {
            html += `
            <div class="flex gap-3">
                <div class="font-mono text-[10px] text-zinc-600 w-12 shrink-0">${entry.tick}</div>
                <div style="color:${entry.color}">${entry.text}</div>
            </div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
    } else if (state.selectedTab === 1) {
        const totalBuildings = state.entities.filter(e => e.isBuilding() && !e.dead).length;
        const totalMilitary  = state.entities.filter(e =>
            (e.type === TYPE.GUARD || e.type === TYPE.KNIGHT || e.type === TYPE.ARCHER) && !e.dead
        ).length;
        const inc = state.incomeThisTick;

        container.innerHTML = `
            <div class="text-[10px] space-y-6">
                <div>
                    <div class="text-amber-300 mb-3">KINGDOM STATISTICS</div>
                    <div class="grid grid-cols-2 gap-x-8 gap-y-5 text-xs">
                        <div class="flex justify-between"><span class="text-zinc-400">Buildings</span><span class="font-medium">${totalBuildings}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Military</span><span class="font-medium">${totalMilitary}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Raids survived</span><span class="font-medium">${state.totalRaidsSurvived}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Research points</span><span class="font-medium">${state.resources.research}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Current morale</span><span class="font-medium">${Math.floor(state.morale)}</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Weather</span><span class="font-medium uppercase">${state.weather}</span></div>
                    </div>
                </div>
                <div class="pt-4 border-t border-zinc-700">
                    <div class="text-amber-300 mb-3">PRODUCTION THIS CYCLE</div>
                    <div class="flex justify-between text-emerald-300"><span>WOOD</span><span class="font-medium">${inc.wood}</span></div>
                    <div class="flex justify-between text-sky-300"><span>STONE</span><span class="font-medium">${inc.stone}</span></div>
                    <div class="flex justify-between text-yellow-300"><span>GOLD</span><span class="font-medium">${inc.gold}</span></div>
                    <div class="flex justify-between text-orange-300"><span>FOOD</span><span class="font-medium">${inc.food}</span></div>
                </div>
            </div>`;
    } else if (state.selectedTab === 2) {
        let html = `<div class="text-xs">`;
        state.techs.forEach(tech => {
            const isUnlocked = state.unlockedTechs.has(tech.id);
            html += `
            <div class="tech-item flex items-center gap-x-4 border ${isUnlocked ? 'border-emerald-400 bg-emerald-950/30' : 'border-transparent bg-zinc-950 hover:bg-zinc-900'} p-4 rounded-2xl mb-3 cursor-pointer"
                 data-tech-id="${tech.id}" data-unlocked="${isUnlocked}">
                <div class="text-4xl w-12">${tech.icon}</div>
                <div class="flex-1">
                    <div class="flex justify-between">
                        <div class="font-medium">${tech.name}</div>
                        ${isUnlocked
                            ? `<span class="text-emerald-400 text-[10px] tracking-widest">RESEARCHED</span>`
                            : `<span class="font-mono text-yellow-300">${tech.cost}R</span>`
                        }
                    </div>
                    <div class="text-zinc-400 text-[10px]">${tech.effect}</div>
                </div>
            </div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
    }
}
