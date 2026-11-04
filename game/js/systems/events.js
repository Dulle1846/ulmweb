// ── Random Events System & Event Log ───────────────────────────

import { WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { TYPE } from '../types.js';
import { state } from '../state.js';
import { spawnEntity, getEntitiesOfType } from '../world/entities.js';
import { createFloater } from '../presentation/rendering/particles.js';
import { showBigMessage } from '../presentation/rendering/ui.js';
import { randInt } from '../utils.js';

export function addLog(text, color = "#a3a3a3") {
    state.eventLog.unshift({ text, color, tick: state.tick });
    if (state.eventLog.length > 12) state.eventLog.pop();
}

export function triggerRandomEvent() {
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);

    const events = [
        {
            title: "Bountiful Harvest",
            desc: "The fields are rich! +40 food",
            fn: () => {
                state.resources.food += 40;
                createFloater(400, 200, "+40 FOOD", "#a3e635");
            },
        },
        {
            title: "Goblin Ambush",
            desc: "A raiding party appears near the border!",
            fn: () => {
                state.raidActive = true;
                for (let i = 0; i < 6; i++) {
                    spawnEntity(
                        cx + randInt(-35, 35),
                        cy + randInt(-35, 35),
                        Math.random() > 0.6 ? TYPE.GOBLIN : TYPE.ORC
                    );
                }
                addLog("GOBLIN RAID INCOMING", "#f43f5e");
            },
        },
        {
            title: "Traveling Merchant",
            desc: "A merchant caravan arrives. Trade offered.",
            fn: () => {
                state.resources.gold += 25;
                state.resources.wood += 15;
                addLog("MERCHANT TRADE COMPLETE", "#eab308");
            },
        },
        {
            title: "Miraculous Spring",
            desc: "A sacred spring was discovered. Morale +18",
            fn: () => {
                state.morale = Math.min(100, state.morale + 18);
                addLog("HOLY SPRING FOUND", "#67e8f9");
            },
        },
        {
            title: "Plague Outbreak",
            desc: "Villagers are sick. -12 morale. -20 food",
            fn: () => {
                state.morale = Math.max(10, state.morale - 12);
                state.resources.food = Math.max(0, state.resources.food - 20);
                addLog("THE PLAGUE SPREADS", "#a78bfa");
                const villagers = getEntitiesOfType(TYPE.VILLAGER);
                if (villagers.length > 3) {
                    villagers.slice(0, 3).forEach(v => (v.dead = true));
                }
            },
        },
        {
            title: "Ancient Relic Found",
            desc: "An old crown was recovered. +30 research",
            fn: () => {
                state.resources.research += 30;
                addLog("RELIC DISCOVERED", "#c084fc");
            },
        },
        {
            title: "Festival of the Sun",
            desc: "The people celebrate! +25 morale",
            fn: () => {
                state.morale = Math.min(100, state.morale + 25);
                state.resources.food = Math.max(0, state.resources.food - 10);
                addLog("THE SUN FESTIVAL!", "#f59e0b");
            },
        },
    ];

    const chosen = events[randInt(0, events.length)];
    addLog(chosen.title.toUpperCase(), "#facc15");
    chosen.fn();
    showBigMessage(chosen.title, chosen.desc, 2200);
}

export function checkRandomEvents() {
    if (state.tick - state.lastRandomEvent > 520 + randInt(0, 700)) {
        state.lastRandomEvent = state.tick;
        if (Math.random() < 0.7) triggerRandomEvent();
    }
}
