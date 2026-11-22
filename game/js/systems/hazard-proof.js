// 1.2.20 proof seam. The production default is an empty set, so every lookup
// returns false and the simulation is unchanged. The executable proof suite
// fills this set with exactly one catalogue spec at a time to prove that the
// measured delta really belongs to that point. This is intentionally a small,
// synchronous lookup at hazard/season cadence, never a frame-loop system.
const neutralized = new Set();
const hiddenSurfaces = new Set();

export function setHazardProofNeutralized(specs = []) {
    neutralized.clear();
    for (const spec of specs) neutralized.add(String(spec));
}

export function clearHazardProofNeutralized() {
    neutralized.clear();
}

export function isHazardProofNeutralized(spec) {
    return neutralized.has(String(spec));
}

// Visibility has its own seam. Hiding a surface must not disable the effect
// that produced it: the effect proof still runs, but the HAZARDS renderer must
// omit exactly that row. This set is empty in production and never saved.
export function setHazardSurfaceProofHidden(specs = []) {
    hiddenSurfaces.clear();
    for (const spec of specs) hiddenSurfaces.add(String(spec));
}

export function clearHazardSurfaceProofHidden() {
    hiddenSurfaces.clear();
}

export function isHazardSurfaceHidden(spec) {
    return hiddenSurfaces.has(String(spec));
}

// Effect rows whose consumer is an event primitive. Zeroing the named primitive
// is the actual neutralization a hazard application sees.
export const HAZARD_EFFECT_PRIMITIVE = Object.freeze({
    "effect:crop-failure": "field",
    "effect:frost-damage": "field",
    "effect:flood-damage": "field",
    "effect:crop-disease": "field",
    "effect:crop-pest": "field",
    "effect:pasture-loss": "pasture",
    "effect:herd-plague": "herd",
    "effect:trade-damage": "trade",
    "effect:extraction": "extraction"
});

// Effect rows whose consumer is a saved/derived modifier. The modifier module
// zeroes the named field when that row is neutralized.
export const HAZARD_EFFECT_MODIFIER = Object.freeze({
    "effect:disease-risk": "diseaseRisk",
    "effect:resistance": "resistance",
    "effect:needs": "needs",
    "effect:movement": "movement",
    "effect:work": "work",
    "effect:clothing": "resistance",
    "effect:adaptation": "adaptation",
    "effect:morale": "morale",
    "effect:medical": "resistance",
    "effect:pasture-loss": "pasture",
    "effect:trade-damage": "trade",
    "effect:extraction": "extraction"
});

// Work rows map to the protection survey field they contribute to.
export const HAZARD_WORK_FIELD = Object.freeze({
    "work:clothing": "clothing",
    "work:medical": "medical",
    "work:well": "well",
    "work:irrigation": "irrigation",
    "work:dam": "dam",
    "work:avalanche": "avalanche",
    "work:drainage": "drainage",
    "work:roads": "roads",
    "work:warehouse": "warehouse",
    "work:research": "research",
    "work:units": "units",
    "work:siting": "siting"
});
