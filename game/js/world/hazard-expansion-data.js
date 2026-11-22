// 1.2.20 — authored data for the hazard response layer.
//
// Kept free of simulation imports so both the annual pass and the panel read
// exactly the same plans, disease profiles, crew roles and rare-event chains.
import { TYPE } from "../core/types.js";

// Real protection works. Each one is a placeable structure whose count feeds
// the mitigation survey; none of them is a hidden policy or a renamed proxy.
export const PROTECTION_BUILDINGS = Object.freeze([
    Object.freeze({ type: TYPE.DAM, label: "Flood Dam", note: "Holds back floodwater and protects the low fields." }),
    Object.freeze({ type: TYPE.AVALANCHE_BARRIER, label: "Avalanche Barrier", note: "Breaks slides above the settlement." }),
    Object.freeze({ type: TYPE.DRAINAGE, label: "Drainage Ditch", note: "Drains wet ground before fever and rot set in." }),
    Object.freeze({ type: TYPE.FIREBREAK, label: "Firebreak", note: "Starves a wildfire before it reaches the stores." }),
    Object.freeze({ type: TYPE.WEATHER_HOUSE, label: "Weatherproof House", note: "Insulated housing for frost, heat and storms." }),
    Object.freeze({ type: TYPE.QUARANTINE, label: "Quarantine House", note: "Separates the sick and slows contagion." }),
    Object.freeze({ type: TYPE.GRANARY, label: "Granary", note: "Keeps grain dry through flood and damp." }),
    Object.freeze({ type: TYPE.WARD, label: "Warding Stone", note: "Holds back corruption and cursed ground." })
]);

export const RESPONSE_PLANS = Object.freeze({
    stockpile: Object.freeze({
        id: "stockpile", label: "Stockpile supplies", readiness: 0.16,
        cost: Object.freeze({ wood: 14, gold: 8 }),
        note: "Dry stores, sealed grain and reserve water. Softens food and water losses."
    }),
    evacuate: Object.freeze({
        id: "evacuate", label: "Evacuate exposed crews", readiness: 0.22,
        cost: Object.freeze({ gold: 18, food: 8 }),
        note: "Fields and woods are cleared before the worst. Fewer casualties, less work done."
    }),
    relief: Object.freeze({
        id: "relief", label: "Ready relief crews", readiness: 0.20,
        cost: Object.freeze({ food: 10, gold: 12 }),
        note: "Crews stand ready to clear roads, rescue the trapped and repair a field."
    }),
    fortify: Object.freeze({
        id: "fortify", label: "Raise protection works", readiness: 0.28,
        cost: Object.freeze({ wood: 10, stone: 12 }),
        note: "Temporary dams, braces and screens around the settlement; the strongest readiness."
    })
});

export const RESPONSE_PLAN_ORDER = Object.freeze(Object.keys(RESPONSE_PLANS));

export const HAZARD_CREWS = Object.freeze({
    fire: Object.freeze({
        id: "fire", label: "Fire watch", max: 3, cost: Object.freeze({ wood: 10, gold: 10 }),
        note: "Cuts firebreaks and saves stores from wildfire."
    }),
    rescue: Object.freeze({
        id: "rescue", label: "Mountain rescue", max: 3, cost: Object.freeze({ stone: 10, gold: 12 }),
        note: "Digs out collapses and reaches crews cut off by slides."
    }),
    medical: Object.freeze({
        id: "medical", label: "Field medics", max: 3, cost: Object.freeze({ gold: 14, food: 4 }),
        note: "Treats the sick on site and slows contagion."
    }),
    equipment: Object.freeze({
        id: "equipment", label: "Relief equipment", max: 3, cost: Object.freeze({ wood: 16, stone: 8, gold: 10 }),
        note: "Pumps, ropes, stretchers and fire hooks for every crew."
    }),
    veterans: Object.freeze({
        id: "veterans", label: "Veteran leaders", max: 2, cost: Object.freeze({ gold: 24, food: 6 }),
        note: "Experienced hands keep a crew working when the ground gives way."
    })
});

export const HAZARD_CREW_ORDER = Object.freeze(Object.keys(HAZARD_CREWS));

// Contagion, lethality, duration and route for each modelled disease family.
// Cases are the hazard ledger's own count; the health system still owns death
// and household transmission, so the two never run duplicate mortality rolls.
export const DISEASE_PROFILES = Object.freeze({
    "hazard:vector-disease": Object.freeze({ id: "vector", label: "Insect-borne fever", contagion: 0.34, lethality: 0.05, duration: 2, vector: "insects", water: false, trade: 0.25 }),
    "hazard:water-disease": Object.freeze({ id: "water", label: "Water-borne fever", contagion: 0.46, lethality: 0.08, duration: 2, vector: "water", water: true, trade: 0.35 }),
    "hazard:parasite-disease": Object.freeze({ id: "parasite", label: "Parasitic infection", contagion: 0.22, lethality: 0.04, duration: 3, vector: "parasites", water: true, trade: 0.15 }),
    "hazard:hygiene-disease": Object.freeze({ id: "hygiene", label: "Damp-house infection", contagion: 0.38, lethality: 0.05, duration: 2, vector: "crowding", water: true, trade: 0.2 }),
    "hazard:respiratory": Object.freeze({ id: "respiratory", label: "Dust and ash lung", contagion: 0.26, lethality: 0.07, duration: 2, vector: "air", water: false, trade: 0.1 }),
    "hazard:frostbite": Object.freeze({ id: "cold", label: "Cold injury", contagion: 0.08, lethality: 0.04, duration: 1, vector: "cold", water: false, trade: 0 }),
    "hazard:heat-illness": Object.freeze({ id: "heat", label: "Heat collapse", contagion: 0.08, lethality: 0.05, duration: 1, vector: "heat", water: false, trade: 0 }),
    "hazard:deficiency": Object.freeze({ id: "deficiency", label: "Deficiency sickness", contagion: 0.12, lethality: 0.06, duration: 3, vector: "hunger", water: false, trade: 0 }),
    "hazard:spoiled-food": Object.freeze({ id: "spoiled", label: "Spoiled-food sickness", contagion: 0.3, lethality: 0.05, duration: 1, vector: "food", water: true, trade: 0.2 }),
    "hazard:regional-disease": Object.freeze({ id: "regional", label: "Regional fever", contagion: 0.32, lethality: 0.06, duration: 2, vector: "region", water: false, trade: 0.3 }),
    "hazard:parasite": Object.freeze({ id: "parasite", label: "Parasitic infection", contagion: 0.2, lethality: 0.03, duration: 2, vector: "parasites", water: true, trade: 0.1 }),
    "hazard:poison-plant": Object.freeze({ id: "poison", label: "Plant poisoning", contagion: 0.05, lethality: 0.07, duration: 1, vector: "poison", water: false, trade: 0 }),
    "hazard:poison-mushroom": Object.freeze({ id: "poison", label: "Mushroom poisoning", contagion: 0.05, lethality: 0.09, duration: 1, vector: "poison", water: false, trade: 0 })
});

export const DISEASE_DEFAULT = Object.freeze({
    id: "environmental", label: "Environmental sickness", contagion: 0.2, lethality: 0.04,
    duration: 2, vector: "exposure", water: false, trade: 0.1
});

export function diseaseProfileFor(mechanic) {
    return DISEASE_PROFILES[String(mechanic || "")] || DISEASE_DEFAULT;
}

// Rare events are multi-year chains with a real annual rule and a decision.
// `effect` names the rule the response pass applies; choices either end the
// chain early or trade one burden for another.
export const RARE_CHAINS = Object.freeze([
    Object.freeze({
        id: "harvest-curse", label: "The Harvest Curse", years: 4,
        summary: "The fields ripen black and the granary shrinks each year until the curse is answered.",
        annual: Object.freeze({ food: -4, morale: -1, fields: 0.1 }),
        choices: Object.freeze([
            Object.freeze({ id: "tithe", label: "Offer a tithe", cost: Object.freeze({ food: 22, gold: 8 }), effect: "end", text: "The tithe is accepted and the fields begin to recover." }),
            Object.freeze({ id: "break", label: "Break the curse", cost: Object.freeze({ stone: 16, gold: 18 }), effect: "cleanse", text: "Ward-stones are raised and the curse is broken." })
        ])
    }),
    Object.freeze({
        id: "migration-wave", label: "The Long Migration", years: 3,
        summary: "Displaced households arrive from a stricken neighbour and ask for shelter and work.",
        annual: Object.freeze({ food: -3, gold: -2, morale: -1, fields: 0 }),
        choices: Object.freeze([
            Object.freeze({ id: "settle", label: "Settle the arrivals", cost: Object.freeze({ food: 18, gold: 10 }), effect: "settle", text: "The newcomers are settled and add their hands to the realm." }),
            Object.freeze({ id: "close", label: "Close the border", cost: Object.freeze({ gold: 4 }), effect: "end", text: "The border closes; the camps beyond it are left to their fate." })
        ])
    }),
    Object.freeze({
        id: "plague-valley", label: "The Plague Valley", years: 4,
        summary: "A fever settles in the valley farms and follows every cart that leaves it.",
        annual: Object.freeze({ food: -2, gold: -3, morale: -1, disease: 0.18 }),
        choices: Object.freeze([
            Object.freeze({ id: "quarantine", label: "Quarantine the valley", cost: Object.freeze({ gold: 16, food: 6 }), effect: "quarantine", text: "The valley is sealed; the fever loses its roads." }),
            Object.freeze({ id: "healers", label: "Send healers", cost: Object.freeze({ gold: 12, food: 8 }), effect: "treat", text: "Healers enter the valley and the sick are treated where they lie." })
        ])
    }),
    Object.freeze({
        id: "ore-vein", label: "The Opened Vein", years: 5,
        summary: "A fresh seam opens under the old ground. Its ore is rich, and something beneath it is awake.",
        annual: Object.freeze({ stone: 8, gold: 4, morale: 0, corruption: 0.05 }),
        choices: Object.freeze([
            Object.freeze({ id: "mine", label: "Work the vein", cost: Object.freeze({ wood: 12 }), effect: "corruption", text: "The vein is worked; the ground beneath grows tainted." }),
            Object.freeze({ id: "seal", label: "Seal the shaft", cost: Object.freeze({ stone: 18, gold: 10 }), effect: "cleanse", text: "The shaft is sealed and the old ground is left in peace." })
        ])
    }),
    Object.freeze({
        id: "trade-wind", label: "The Favourable Wind", years: 3,
        summary: "A new caravan road opens through the region and every market feels the traffic.",
        annual: Object.freeze({ gold: 7, food: 2, morale: 1, fields: 0 }),
        choices: Object.freeze([
            Object.freeze({ id: "invest", label: "Invest in the road", cost: Object.freeze({ wood: 14, gold: 8 }), effect: "extend", text: "Waystations and bridges extend the route's prosperity." }),
            Object.freeze({ id: "tax", label: "Tax the traffic", cost: Object.freeze({}), effect: "end", text: "The toll is collected and the caravans move on." })
        ])
    })
]);

export const RARE_CHAIN_BY_ID = Object.freeze(Object.fromEntries(RARE_CHAINS.map(chain => [chain.id, chain])));

export function rareChainFor(roll) {
    const index = Math.max(0, Math.min(RARE_CHAINS.length - 1, Math.floor((Number(roll) || 0) * RARE_CHAINS.length)));
    return RARE_CHAINS[index];
}
