// 1.2.20 — the operative side of the environmental-hazard modifiers.
//
// `environmental-hazards.js` writes one bounded modifier block per season. This
// module turns that block into the concrete multipliers the rest of the game
// reads: household demand, work, movement, extraction, pasture, caravan terms
// and the regional adaptation that softens all of them.
//
// All values are neutral at zero, so a calm season multiplies by exactly 1 and
// adds exactly 0. The block is read from the saved hazard state, never from a
// second simulation, and is cached by object identity: a seasonal pass replaces
// the block and therefore invalidates the cache naturally.
import { state } from "../core/state.js";

export const HAZARD_MODIFIER_KEYS = Object.freeze([
    "diseaseRisk", "work", "movement", "needs", "morale",
    "resistance", "adaptation", "medical", "trade", "extraction", "pasture"
]);

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const bounded = (value, min, max) => Math.max(min, Math.min(max, value));

const NEUTRAL_MODIFIERS = Object.freeze(Object.fromEntries(
    HAZARD_MODIFIER_KEYS.map(key => [key, 0])
));

// The strongest a hazard may bend a system. Kept deliberately moderate: a bad
// season hurts, but it cannot replace the economy with a second one.
export const HAZARD_MODIFIER_EFFECT = Object.freeze({
    foodDemand: 0.45,
    work: 0.40,
    movement: 0.45,
    extraction: 0.40,
    pasture: 0.35,
    tradeBuy: 0.30,
    tradeSell: 0.30,
    adaptationRelief: 0.60
});

const NEUTRAL_EFFECTS = Object.freeze({
    foodDemand: 1, work: 1, movement: 1, caravanMovement: 1, extraction: 1, pasture: 1,
    tradeBuy: 1, tradeSell: 1, adaptationRelief: 0, raw: NEUTRAL_MODIFIERS
});

let modifierSource = null;
let modifiers = NEUTRAL_MODIFIERS;
let effectSource = null;
let effects = NEUTRAL_EFFECTS;

/** Drop the memoised block after a season pass or a save restore. */
export function invalidateHazardModifierCache() {
    modifierSource = null;
    modifiers = NEUTRAL_MODIFIERS;
    effectSource = null;
    effects = NEUTRAL_EFFECTS;
}

/** The saved, clamped modifier block. Neutral when no hazard state exists. */
export function getHazardModifiers() {
    const source = state.environmentalHazards?.modifiers;
    if (!source || typeof source !== "object") return NEUTRAL_MODIFIERS;
    if (source === modifierSource) return modifiers;
    const result = {};
    for (const key of HAZARD_MODIFIER_KEYS) result[key] = clamp01(source[key]);
    modifiers = Object.freeze(result);
    modifierSource = source;
    return modifiers;
}

/**
 * The multipliers the simulation applies. Every value is exactly 1 when the
 * modifier block is neutral; `adaptationRelief` is exactly 0. The relief is the
 * share of each penalty a region's research and siting take back.
 */
export function getHazardSimulationEffects() {
    const base = getHazardModifiers();
    if (effectSource === base) return effects;
    // Magic burdens and sick neighbours bend the same saved modifier block.
    // Fog closes paths, forbidden growth makes extraction dangerous and an
    // outbreak across the border raises caravan terms. Zero changes nothing.
    const magic = state.environmentalHazards?.magic || {};
    const partnerCrises = Array.isArray(state.environmentalHazards?.partners)
        ? state.environmentalHazards.partners.filter(partner => partner?.outbreak
            || (partner?.crisis && partner.crisis !== "none")).length : 0;
    const raw = Object.freeze({
        ...base,
        movement: clamp01(base.movement + clamp01(magic.fog) * 0.18 + clamp01(magic.unnaturalWeather) * 0.10),
        extraction: clamp01(base.extraction + clamp01(magic.forbidden) * 0.12),
        pasture: clamp01(base.pasture + clamp01(magic.animalShift) * 0.20),
        diseaseRisk: clamp01(base.diseaseRisk + clamp01(magic.corruption) * 0.12),
        trade: clamp01(base.trade + partnerCrises * 0.035)
    });
    const relief = 1 - clamp01(raw.adaptation) * HAZARD_MODIFIER_EFFECT.adaptationRelief;
    const movement = bounded(1 - raw.movement * HAZARD_MODIFIER_EFFECT.movement * relief, 0.50, 1);
    // Pack animals and carts buffer part of a person's travel penalty. The
    // haulage factor is derived from the same movement reading, so it is still
    // real weather and never a second, independent hazard system.
    const caravanMovement = bounded(1 - (1 - movement) * 0.5, 0.75, 1);
    effects = Object.freeze({
        foodDemand: bounded(1 + raw.needs * HAZARD_MODIFIER_EFFECT.foodDemand * relief, 0.75, 1.60),
        work: bounded(1 - raw.work * HAZARD_MODIFIER_EFFECT.work * relief, 0.55, 1),
        movement,
        caravanMovement,
        extraction: bounded(1 - raw.extraction * HAZARD_MODIFIER_EFFECT.extraction * relief, 0.55, 1),
        pasture: bounded(1 - raw.pasture * HAZARD_MODIFIER_EFFECT.pasture * relief, 0.60, 1),
        tradeBuy: bounded(1 + raw.trade * HAZARD_MODIFIER_EFFECT.tradeBuy * relief, 1, 1.35),
        tradeSell: bounded(1 - raw.trade * HAZARD_MODIFIER_EFFECT.tradeSell * relief, 0.65, 1),
        adaptationRelief: clamp01(raw.adaptation) * HAZARD_MODIFIER_EFFECT.adaptationRelief,
        raw
    });
    effectSource = base;
    return effects;
}

export function getHazardFoodDemandFactor() {
    return getHazardSimulationEffects().foodDemand;
}

export function getHazardWorkFactor() {
    return getHazardSimulationEffects().work;
}

export function getHazardMovementFactor() {
    return getHazardSimulationEffects().movement;
}

export function getHazardCaravanMovementFactor() {
    return getHazardSimulationEffects().caravanMovement;
}

export function getHazardExtractionFactor() {
    return getHazardSimulationEffects().extraction;
}

export function getHazardPastureCapacityFactor() {
    return getHazardSimulationEffects().pasture;
}

export function getHazardTradeBuyFactor() {
    return getHazardSimulationEffects().tradeBuy;
}

export function getHazardTradeSellFactor() {
    return getHazardSimulationEffects().tradeSell;
}
