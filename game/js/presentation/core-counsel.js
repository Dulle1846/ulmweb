// The core loop needs one clear next step. This helper is presentation-only:
// it reads existing state and never mutates the realm or invents a new system.
import { TYPE } from "../core/types.js";
import { BUILDING_COSTS, CONSTRUCTION_SHARE, costShare, isHousingType, housingCapacityFor } from "../systems/city-config.js";
import { ROAD_TYPES } from "../systems/roads.js";
import { getAmbitionSnapshot } from "../systems/ambitions.js";

function canAfford(state, cost) {
    return Object.entries(cost || {}).every(([resource, amount]) =>
        Number(amount) <= 0 || (Number(state?.resources?.[resource]) || 0) >= Number(amount));
}

function marketCanBuy(state, resource, amount = 5) {
    const price = Number(state?.market?.prices?.[resource]) || 2;
    const stock = (Array.isArray(state?.market?.partners) ? state.market.partners : [])
        .reduce((total, partner) => total + Math.max(0, Number(partner?.stock?.[resource]) || 0), 0);
    const gold = Number(state?.resources?.gold) || 0;
    return stock >= amount && gold >= Math.ceil(price * amount * 1.25);
}

function count(state, type) {
    return (Array.isArray(state?.entities) ? state.entities : [])
        .filter(entity => !entity?.dead && entity?.type === type).length;
}

function capacity(state) {
    return (Array.isArray(state?.entities) ? state.entities : [])
        .filter(entity => !entity?.dead && isHousingType(entity?.type) && !(entity?.construction?.stage < 3))
        .reduce((total, entity) => total + housingCapacityFor(entity.type), 0);
}

export function getCoreCounsel(state) {
    const food = Math.max(0, Number(state?.resources?.food) || 0);
    const people = count(state, TYPE.VILLAGER);
    const beds = capacity(state);
    const shortage = Math.max(0, Number(state?.economy?.lastLedger?.foodShortage) || 0);
    const roads = Math.max(0, Number(state?.statistics?.totalRoadTilesBuilt) || 0);
    const hand = Array.isArray(state?.hand) ? state.hand.length : 0;
    const morale = Number(state?.morale) || 0;

    if (!state?.hasStarted) {
        return {
            id: "found",
            text: "Choose a world and found your first realm.",
            actionLabel: "FOUND A REALM",
            panel: null
        };
    }
    if (shortage > 0 || food < Math.max(40, people * 3)) {
        if (!canAfford(state, costShare(BUILDING_COSTS[TYPE.FARM] || {}, CONSTRUCTION_SHARE))) {
            if (marketCanBuy(state, "food")) {
                return {
                    id: "food",
                    text: "The granary is empty and the treasury cannot open a farm. Buy food at the regional market before winter.",
                    actionLabel: "OPEN MARKET",
                    panel: "market"
                };
            }
            return {
                id: "food",
                text: "The granary is empty and the treasury cannot open a farm. Open the cards for food or a new opportunity.",
                actionLabel: "OPEN CARDS",
                panel: "cards"
            };
        }
        return {
            id: "food",
            text: "The granary is thin. Secure a farm before the next shortage.",
            actionLabel: "BUILD",
            panel: "build"
        };
    }
    if (people >= beds) {
        if (!canAfford(state, costShare(BUILDING_COSTS[TYPE.HOUSE] || {}, CONSTRUCTION_SHARE))) {
            return {
                id: "housing",
                text: "Every hearth is full and the treasury cannot open a cottage. Open the cards for shelter or materials.",
                actionLabel: "OPEN CARDS",
                panel: "cards"
            };
        }
        return {
            id: "housing",
            text: "Every hearth is full. Raise a cottage to welcome new residents.",
            actionLabel: "BUILD",
            panel: "build"
        };
    }
    if (roads === 0) {
        if (!canAfford(state, ROAD_TYPES.dirt.cost)) {
            return {
                id: "roads",
                text: "The stores have no road and the treasury cannot lay one. Open the cards for materials or a new route.",
                actionLabel: "OPEN CARDS",
                panel: "cards"
            };
        }
        return {
            id: "roads",
            text: "The stores have no road. Lay one to connect the settlement.",
            actionLabel: "BUILD",
            panel: "build"
        };
    }
    if (hand === 0) {
        return {
            id: "cards",
            text: "Your hand is empty. Draw a card to shape the next chapter.",
            actionLabel: "OPEN CARDS",
            panel: "cards"
        };
    }
    if (morale < 55) {
        return {
            id: "morale",
            text: "Morale is faltering. Review services and faction support.",
            actionLabel: "REVIEW REALM",
            panel: "kingdom"
        };
    }
    // After the first house, road and card, the onboarding path continues with
    // the first royal ambition. "Stores are steady" was a dead end for a new
    // player who had just finished the checklist but did not know where the
    // long-term goal lived. Only the live realm carries the ambition model;
    // synthetic counsel readers stay pure and keep their steady fallback.
    try {
        const ambition = state?.ambitions && typeof state.ambitions === "object" ? getAmbitionSnapshot() : null;
        if (ambition && !ambition.allComplete && Number(ambition.completedCount) === 0) {
            return {
                id: "ambition",
                text: "The realm is steady. Complete your first royal ambition: " + (ambition.title || "open the royal ledger") + ".",
                actionLabel: "REVIEW REALM",
                panel: "kingdom"
            };
        }
    } catch { /* the counsel must remain available during early loading */ }
    return {
        id: "steady",
        text: "Stores are steady. Follow the royal ambition or draw another card.",
        actionLabel: "OPEN CARDS",
        panel: "cards"
    };
}
