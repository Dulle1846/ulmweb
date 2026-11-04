// ── Tech Tree & Unlocks ────────────────────────────────────────

import { state } from '../core/state.js';
import { TYPE } from '../core/types.js';
import { addLog } from './events.js';
import { queueFloater } from '../core/presentation-effects.js';

export function initTechTree() {
    state.techs = [
        { id: "irrigation",  name: "IRRIGATION",    cost: 35, unlocked: false, effect: "Farms produce 40% more food",          icon: "💧" },
        { id: "steel",       name: "STEEL FORGING",  cost: 55, unlocked: false, effect: "All military units +25 HP",           icon: "⚔️" },
        { id: "scholarship", name: "SCHOLARSHIP",    cost: 40, unlocked: false, effect: "Research income +2",                  icon: "📜" },
        { id: "feudalism",   name: "FEUDAL SYSTEM",  cost: 70, unlocked: false, effect: "Houses give +1 morale",               icon: "🏛️" },
        { id: "alchemy",     name: "ALCHEMY",        cost: 85, unlocked: false, effect: "Gold mines occasionally spawn gold",  icon: "🧪" },
    ];
}

export function researchTech(id) {
    const tech = state.techs.find(t => t.id === id);
    if (!tech || state.unlockedTechs.has(id)) return;

    if (state.resources.research < tech.cost) {
        queueFloater(300, 200, "NOT ENOUGH RESEARCH", "#f87171");
        return;
    }

    state.resources.research -= tech.cost;
    state.unlockedTechs.add(id);

    if (id === "steel") {
        const militaryTypes = new Set([TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT]);
        state.entities.forEach(entity => {
            if (militaryTypes.has(entity.type)) {
                entity.maxHp += 25;
                entity.hp += 25;
            }
        });
    }

    if (id === "irrigation") {
        addLog("IRRIGATION UNLOCKED — FARMS BUFFED", "#4ade80");
    }
    if (id === "scholarship") {
        addLog("KNOWLEDGE FLOWS", "#67e8f9");
    }

    queueFloater(340, 160, "TECH ACQUIRED!", "#67e8f9");
}
