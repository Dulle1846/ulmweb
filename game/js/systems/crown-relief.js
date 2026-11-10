// Crown relief at the point of a blocked immigration gate.
//
// The population panel names the rule that stopped household growth. This
// module turns that explanation into one deliberate, costed action using the
// existing crown-supply systems: waterworks, the grain contract, emergency
// granary provisioning or a stone-house upgrade. It never creates resources or
// bypasses the settlement gate.
import { state } from "../core/state.js";
import { getPopulationGrowthGate } from "./population.js";
import {
    WATERWORKS_LEVELS, GRAIN_CONTRACTS, getCrownSupplySnapshot,
    setWaterworks, setGrainContract, provisionGranary, upgradeHousingStock
} from "./crown-supply.js";

const gold = () => Math.max(0, Number(state.resources?.gold) || 0);

function waterOffer(gate, supply) {
    if (supply.waterworksLevel >= 3) return null;
    const level = Math.min(3, Math.max(1, Number(supply.waterworksLevel) + 1));
    const definition = WATERWORKS_LEVELS[level];
    const cost = Number(definition?.setup) || 0;
    return {
        kind: "water",
        level,
        label: "COMMISSION " + String(definition?.label || "WATERWORKS").toUpperCase(),
        detail: "+" + Math.round((definition?.coverage || 0) * 100) + "% household water coverage",
        cost,
        available: gold() + 1e-9 >= cost
    };
}

function foodOffer(gate, supply) {
    if (supply.grainLevel === 0) {
        const contract = GRAIN_CONTRACTS[2];
        return {
            kind: "grain",
            level: 2,
            label: "OPEN REGIONAL GRANARY II",
            detail: "A standing grain contract; seasonal deliveries keep the growth reserve filled",
            cost: 0,
            target: Number(contract?.target) || 240,
            available: Boolean(supply.grainRouteOpen)
        };
    }
    if (Number(supply.commissary?.shortfall) > 0 && (Number(supply.commissary?.wood) >= 25 || Number(supply.commissary?.stone) >= 25)) {
        return {
            kind: "provision",
            label: "PROVISION THE GRANARY",
            detail: "Call in held harvest and barter surplus goods for grain",
            cost: 0,
            available: true
        };
    }
    return null;
}

function housingOffer(gate, supply) {
    if (Number(supply.timberCottages) < 1) return null;
    const cost = Number(supply.housingCost) || 0;
    return {
        kind: "housing",
        label: "REBUILD A COTTAGE IN STONE",
        detail: "+2 household places without a new building footprint",
        cost,
        available: gold() + 1e-9 >= cost
    };
}

export function getCrownReliefOffer() {
    const gate = getPopulationGrowthGate();
    if (gate.ok) return null;
    const supply = getCrownSupplySnapshot();
    if (gate.reason === "No reliable water coverage") return waterOffer(gate, supply);
    if (gate.reason === "The food reserve is below the growth floor" || gate.reason === "Food reserves are too low") return foodOffer(gate, supply);
    if (gate.reason === "No free housing") return housingOffer(gate, supply);
    // Safety, morale and unmet household needs still require the building or
    // policy named in the gate hint; there is no purchased shortcut.
    return null;
}

export function applyCrownRelief() {
    const offer = getCrownReliefOffer();
    if (!offer) return { ok: false, reason: "no-crown-relief-available" };
    if (!offer.available) return { ok: false, reason: "not-enough-gold", offer };
    let result;
    if (offer.kind === "water") result = setWaterworks(offer.level);
    else if (offer.kind === "grain") result = setGrainContract(offer.level);
    else if (offer.kind === "provision") result = provisionGranary();
    else if (offer.kind === "housing") result = upgradeHousingStock();
    else result = { ok: false, reason: "unknown-crown-relief" };
    return { ...result, offer };
}
