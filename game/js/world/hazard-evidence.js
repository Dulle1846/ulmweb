// 1.2.20 — one auditable chain for every catalogue point.
//
// A catalogue row is not allowed to be "implemented" because a prose label or
// a mechanic string exists. This module binds each row to the simulation rule
// that consumes it, the player-facing surface that reports it, and the focused
// test that proves the rule. The test suite compares all three against the real
// source, so a new row without an effect/surface/test fails the build.
import { HAZARD_CATALOG, HAZARD_EFFECTS, REGIONAL_BUNDLES } from "./hazard-data.js";

export const HAZARD_SURFACES = Object.freeze({
    active: "HAZARDS > ACTIVE HAZARDS",
    losses: "HAZARDS > LOSSES",
    consequences: "HAZARDS > DERIVED CONSEQUENCES",
    effects: "HAZARDS > VISIBLE EFFECTS · LIVE",
    resilience: "HAZARDS > REALM RESILIENCE",
    protection: "HAZARDS > PROTECTION · READINESS",
    diseases: "HAZARDS > DISEASES & OUTBREAKS",
    chronic: "HAZARDS > LONG-TERM CONSEQUENCES",
    magic: "HAZARDS > ARCANE BURDEN",
    scars: "HAZARDS > HAZARD SCARS ON THE MAP",
    regional: "HAZARDS > REGIONAL DANGERS",
    forecast: "HAZARDS > SEASONAL FORECAST",
    log: "EVENT LOG"
});

const testRef = (file, name) => Object.freeze({ file: "tests/world/" + file + ".test.js", name });
const evidence = (effect, surfaces, tests, passive = false, passiveReason = "") => Object.freeze({
    effect,
    surfaces: Object.freeze(surfaces.map(key => HAZARD_SURFACES[key])),
    tests: Object.freeze(tests),
    passive: Boolean(passive),
    passiveReason
});

const ENV = "environmental-hazards";
const MODS = "hazard-modifiers";
const TERRAIN = "hazard-terrain";
const EXPANSION = "hazard-expansion";
const CLIMATE = "climate-drift";
const COVERAGE = "hazard-coverage";

const ENV_HEALTH = testRef(ENV, "1.2.20 hazards cost health, stores and morale");
const ENV_FIELDS = testRef(ENV, "1.2.20 drought and frost damage real fields");
const ENV_DESTROY = testRef(ENV, "1.2.20 structural damage hits a real building but never the keep");
const ENV_YEAR = testRef(ENV, "1.2.20 annual pass compounds drought, plague and fire");
const ENV_WILDFIRE = testRef(ENV, "1.2.20 wildfire zones and scars survive the year");
const ENV_ARCANE = testRef(ENV, "1.2.20 arcane burden grows, spreads and can be cleansed");
const ENV_SEASON = testRef(ENV, "1.2.20 seasonal pass is deterministic and bounded");
const ENV_PROTECTION = testRef(ENV, "1.2.20 protection works raise readiness and lower severity");
const MODS_DEMAND = testRef(MODS, "1.2.20 an active hazard raises household food and water draw");
const MODS_WATER = testRef(MODS, "1.2.20 active needs draw real household water while calm weather leaves the store");
const MODS_WORK = testRef(MODS, "1.2.20 an active hazard slows production and building");
const MODS_MORALE = testRef(MODS, "1.2.20 the stored morale modifier reaches the morale simulation");
const MODS_MOVEMENT = testRef(MODS, "1.2.20 the same caravan carrier walks less far in a severe season");
const MODS_TRADE = testRef(MODS, "1.2.20 caravan deals really shift in the market");
const MODS_EXTRACTION = testRef(MODS, "1.2.20 a real lumber camp brings less timber out in a severe season");
const MODS_PASTURE = testRef(MODS, "1.2.20 real forest herds lose pasture capacity in a severe season");
const MODS_HUNT = testRef(MODS, "1.2.20 the same hunt takes fewer animals when pasture is stressed");
const TERRAIN_LAVA = testRef(TERRAIN, "lava permanently converts a tile, destroys its node and blocks movement");
const TERRAIN_FIRE = testRef(TERRAIN, "wildfire changes vegetation without making the tile impassable");
const TERRAIN_FLOOD = testRef(TERRAIN, "flood raises moisture, converts resource tiles and cuts a real road");
const TERRAIN_SHIELD = testRef(TERRAIN, "real protection works measurably raise the conversion shield");
const EXPANSION_DISEASE = testRef(EXPANSION, "1.2.20 disease records carry contagion and quarantine slows the ledger");
const EXPANSION_RARE = testRef(EXPANSION, "1.2.20 rare events select a chain and a real decision resolves it");
const EXPANSION_FORECAST = testRef(EXPANSION, "1.2.20 forecast is deterministic, bounded and shows an uncertainty band");
const EXPANSION_CREW = testRef(EXPANSION, "1.2.20 crews, insurance, loans and resettlement have real costs and effects");
const EXPANSION_MAGIC = testRef(EXPANSION, "1.2.20 unnatural weather and changed animal populations are real burdens");
const COVERAGE_HERDS = testRef(COVERAGE, "1.2.20 animal plague culls real herds and persists across settlements");
const COVERAGE_RARE = testRef(COVERAGE, "1.2.20 magic rare pressure seeds a real rare chain");
const COVERAGE_WORKS = testRef(COVERAGE, "1.2.20 targeted works change their own risk and loss path");
const COVERAGE_MAGIC = testRef(COVERAGE, "1.2.20 cursed and forbidden burdens reach real consumers");
const COVERAGE_VOLCANO = testRef(COVERAGE, "1.2.20 volcanic ash and long-term debt reach the annual state");
// This is the executable state-delta proof. Every row is run through the real
// simulator and again with that row's effect neutralized; the second run must
// stop moving state. The evidence contract names it so a row cannot claim a
// proof that the release did not actually run.
const EXECUTABLE_PROOF = testRef("hazard-effect-proofs", "1.2.20 all 102 catalogue points produce measured state deltas");
const VISIBILITY_PROOF = Object.freeze({
    file: "tests/browser/hazard-visibility-proof.mjs",
    name: "HAZARD VISIBILITY 102/102 · NEUTRALIZED 102/102 · SURVIVORS 0/102",
    render: "renderHazardPanel() → data-hazard-surface row in a real DOM"
});

function eventTestFor(row) {
    const effects = HAZARD_EFFECTS[row.mechanic] || {};
    if (row.mechanic === "hazard:epizootic") return [COVERAGE_HERDS, MODS_PASTURE];
    if (row.mechanic === "hazard:flood") return [TERRAIN_FLOOD, ENV_FIELDS];
    if (row.mechanic === "hazard:lava" || row.mechanic === "hazard:eruption") return [TERRAIN_LAVA, COVERAGE_VOLCANO];
    if (row.mechanic === "hazard:heatwave") return [ENV_WILDFIRE, ENV_HEALTH];
    if (effects.outbreak) return [EXPANSION_DISEASE, ENV_HEALTH];
    if (effects.herd) return [COVERAGE_HERDS];
    if (effects.destroy || effects.injury) return [ENV_DESTROY, ENV_HEALTH];
    if (effects.field) return [ENV_FIELDS, ENV_HEALTH];
    if (effects.trade) return [MODS_TRADE, ENV_HEALTH];
    if (effects.pasture) return [MODS_PASTURE, ENV_HEALTH];
    return [ENV_HEALTH];
}

function eventEvidence(row) {
    const effects = HAZARD_EFFECTS[row.mechanic];
    if (!effects) return null;
    return evidence(
        "applyHazard(" + row.mechanic + ") → " + Object.keys(effects).join(", "),
        ["active", "losses", "log"],
        eventTestFor(row)
    );
}

function bundleEvidence(row) {
    const bundle = REGIONAL_BUNDLES[row.mechanic];
    if (!bundle) return null;
    return evidence(
        "getHazardProfile(): signature hazards " + bundle.hazards.join(", ")
            + " carry exposure ×" + bundle.exposure,
        ["regional", "active", "forecast"],
        [
            testRef(CLIMATE, "1.2.20.91 regional bundle exposure is applied to its signature hazards"),
            testRef(ENV, "1.2.20 every climate receives its own hazard set")
        ]
    );
}

const EFFECT_EVIDENCE = Object.freeze({
    "effect:disease-risk": evidence("modifiers.diseaseRisk → applyHazard illness roll", ["resilience", "consequences", "log"], [ENV_HEALTH], false),
    "effect:resistance": evidence("modifiers.resistance → injury risk and structural damage", ["resilience", "consequences"], [ENV_DESTROY]),
    "effect:needs": evidence("getHazardFoodDemandFactor → calculateDailyLedger and household water draw", ["consequences", "log"], [MODS_DEMAND, MODS_WATER]),
    "effect:movement": evidence("getHazardMovementFactor/getHazardCaravanMovementFactor → villagers, expeditions and carriers", ["consequences"], [MODS_MOVEMENT, MODS_WATER]),
    "effect:losses": evidence("applyHazard → entry.losses + addResource on real stores", ["losses", "active", "log"], [ENV_HEALTH]),
    "effect:work": evidence("getHazardWorkFactor → getBuildingEfficiency and updateConstruction", ["consequences"], [MODS_WORK]),
    "effect:clothing": evidence("mitigation.clothing → cold/heat illness risk and resistance", ["resilience", "protection"], [COVERAGE_WORKS]),
    "effect:adaptation": evidence("modifiers.adaptation → 60% relief in every derived multiplier", ["consequences"], [MODS_WORK, MODS_DEMAND]),
    "effect:morale": evidence("modifiers.morale → updateMorale", ["consequences", "active"], [MODS_MORALE]),
    "effect:medical": evidence("mitigation.medical → outbreak chance, illness risk and treatment", ["resilience", "protection", "diseases"], [COVERAGE_WORKS, EXPANSION_DISEASE]),
    "effect:crop-failure": evidence("hazard:drought field damage → real farm growth and fertility", ["active", "losses", "log"], [ENV_FIELDS]),
    "effect:frost-damage": evidence("hazard:frost field damage → real farm growth and fertility", ["active", "losses", "log"], [ENV_FIELDS]),
    "effect:flood-damage": evidence("hazard:flood field damage plus flood scars and road cuts", ["active", "scars", "log"], [ENV_FIELDS, TERRAIN_FLOOD]),
    "effect:crop-disease": evidence("hazard:plant-disease field damage → real farm growth", ["active", "losses", "log"], [ENV_FIELDS]),
    "effect:crop-pest": evidence("hazard:pest field and food loss → real farm/store damage", ["active", "losses", "log"], [ENV_FIELDS, ENV_HEALTH]),
    "effect:pasture-loss": evidence("getHazardPastureCapacityFactor → real forest carrying capacity and hunt take", ["consequences", "active"], [MODS_PASTURE, MODS_HUNT]),
    "effect:herd-plague": evidence("damageHazardHerds → saved herd populations and losses.herds", ["losses", "chronic", "log"], [COVERAGE_HERDS]),
    "effect:trade-damage": evidence("modifiers.trade → executeTrade and caravan carriers; road tiles are cut", ["consequences", "scars"], [MODS_TRADE, TERRAIN_FLOOD]),
    "effect:extraction": evidence("getHazardExtractionFactor → lumber, quarry and mine yields", ["consequences"], [MODS_EXTRACTION])
});

const WORK_EVIDENCE = Object.freeze({
    "work:clothing": evidence("mitigation.clothing → cold/heat illness relief", ["protection", "resilience"], [COVERAGE_WORKS]),
    "work:medical": evidence("mitigation.medical → outbreak/illness relief", ["protection", "resilience", "diseases"], [COVERAGE_WORKS]),
    "work:well": evidence("mitigation.well → water loss and water-borne outbreak relief", ["protection", "resilience"], [COVERAGE_WORKS]),
    "work:irrigation": evidence("mitigation.irrigation → drought field damage relief", ["protection"], [COVERAGE_WORKS]),
    "work:dam": evidence("mitigation.dam → flood/lava conversion shield and destruction relief", ["protection", "scars"], [TERRAIN_SHIELD]),
    "work:avalanche": evidence("mitigation.avalanche → destruction relief and lava/lost-ground shield", ["protection", "scars"], [TERRAIN_SHIELD]),
    "work:drainage": evidence("mitigation.drainage → flood field damage, flood shield and water outbreak relief", ["protection", "scars"], [COVERAGE_WORKS, TERRAIN_SHIELD]),
    "work:roads": evidence("mitigation.roads → movement and caravan penalty relief", ["protection", "consequences"], [COVERAGE_WORKS]),
    "work:warehouse": evidence("mitigation.warehouse → food and water loss relief", ["protection", "losses"], [COVERAGE_WORKS]),
    "work:research": evidence("mitigation.research → forecast confidence, adaptation and wildfire shield", ["protection", "forecast"], [EXPANSION_FORECAST]),
    "work:units": evidence("mitigation.units → injury/destruction resistance and specialist crews", ["protection", "resilience"], [EXPANSION_CREW]),
    "work:siting": evidence("mitigation.siting → adaptation relief and lava/lost-ground shield", ["protection", "scars"], [TERRAIN_SHIELD, ENV_PROTECTION])
});

const CHRONIC_EVIDENCE = Object.freeze({
    "chronic:seasonal": evidence("getHazardProfile season/weather weights + one bounded seasonal pass", ["forecast", "active"], [ENV_SEASON]),
    "chronic:drought-years": evidence("chronic.droughtYears → annual food loss and droughtLevel", ["chronic", "losses"], [ENV_YEAR]),
    "chronic:plague-trade": evidence("state.health outbreak → real trade partners' disease spread", ["chronic", "diseases"], [ENV_YEAR]),
    "chronic:epizootic-regions": evidence("chronic.epizooticRegions + damageHazardHerds across real herds", ["chronic", "losses"], [COVERAGE_HERDS]),
    "chronic:wildfire": evidence("chronic.wildfireZones + recordWildfireScar + burntTiles", ["chronic", "scars"], [ENV_WILDFIRE, TERRAIN_FIRE]),
    "chronic:flood-scars": evidence("chronic.floodScars + recordFloodScar + real road cuts", ["chronic", "scars"], [TERRAIN_FLOOD]),
    "chronic:volcanic-region": evidence("chronic.volcanicYears + recordLavaScar and regional ash", ["chronic", "scars"], [COVERAGE_VOLCANO]),
    "chronic:climate-trend": evidence("chronic.climateDrift → per-tile temperature/moisture and weather table", ["chronic", "losses"], [testRef(CLIMATE, "1.2.20.91 climate drift moves per-tile temperature and moisture")]),
    "chronic:long-term-economy": evidence("chronic.economicDrag → annual treasury loss", ["chronic", "losses"], [COVERAGE_VOLCANO])
});

const MAGIC_EVIDENCE = Object.freeze({
    "magic:burden": evidence("applyMagic → fog/cursed burdens in the annual state", ["magic", "log"], [ENV_ARCANE]),
    "magic:corruption": evidence("magic.corruption → diseaseRisk, real terrain corruption scar and spread", ["magic", "scars"], [ENV_ARCANE]),
    "magic:cursed": evidence("awakenCursedCreature + cursed relief/cleanse", ["magic", "log"], [COVERAGE_MAGIC]),
    "magic:fog": evidence("magic.fog → modifiers.movement and caravan speed", ["magic", "consequences"], [COVERAGE_MAGIC]),
    "magic:unnatural-weather": evidence("magic.unnaturalWeather → hazard weights and movement", ["magic", "forecast"], [EXPANSION_MAGIC]),
    "magic:disease": evidence("magic.magicDisease → startOutbreak and registered disease", ["magic", "diseases"], [ENV_ARCANE]),
    "magic:animal-shift": evidence("magic.animalShift → pasture capacity and predator/parasite hazard weights", ["magic", "consequences"], [EXPANSION_MAGIC]),
    "magic:spread": evidence("magic.spread → corruption scar growth and diseaseRisk", ["magic", "scars"], [ENV_ARCANE]),
    "magic:forbidden": evidence("magic.forbidden → extraction modifier and forbidden growth event", ["magic", "consequences"], [COVERAGE_MAGIC]),
    "magic:wards": evidence("magic.wards → magical hazard weights and cleanse protection", ["magic", "protection"], [COVERAGE_MAGIC]),
    "magic:rare": evidence("magic.rareYears → selectRareChain and a real rare-event decision", ["magic", "log"], [COVERAGE_RARE, EXPANSION_RARE])
});

const UNKNOWN = evidence("", [], []);

export const HAZARD_EVIDENCE_BY_MECHANIC = Object.freeze(Object.fromEntries(HAZARD_CATALOG.map(row => {
    let proof = null;
    if (row.mechanic.startsWith("hazard:")) proof = eventEvidence(row);
    else if (row.mechanic.startsWith("bundle:")) proof = bundleEvidence(row);
    else if (row.mechanic.startsWith("effect:")) proof = EFFECT_EVIDENCE[row.mechanic];
    else if (row.mechanic.startsWith("work:")) proof = WORK_EVIDENCE[row.mechanic];
    else if (row.mechanic.startsWith("chronic:")) proof = CHRONIC_EVIDENCE[row.mechanic];
    else if (row.mechanic.startsWith("magic:")) proof = MAGIC_EVIDENCE[row.mechanic];
    return [row.mechanic, proof || UNKNOWN];
})));

export const HAZARD_EVIDENCE = Object.freeze(Object.fromEntries(HAZARD_CATALOG.map(row => {
    const proof = HAZARD_EVIDENCE_BY_MECHANIC[row.mechanic] || UNKNOWN;
    // Effects share one player-facing live-effects strip. Naming it here keeps
    // the static contract honest, while the browser proof checks the actual
    // rendered row rather than this string.
    const surfaces = row.mechanic.startsWith("effect:")
        ? [...proof.surfaces, HAZARD_SURFACES.effects]
        : proof.surfaces;
    return [row.spec, Object.freeze({
        ...proof,
        surfaces: Object.freeze(surfaces),
        tests: Object.freeze([...(proof.tests || []), EXECUTABLE_PROOF]),
        executableProof: EXECUTABLE_PROOF.name,
        visibilityProof: VISIBILITY_PROOF,
        spec: row.spec,
        id: row.id,
        mechanic: row.mechanic,
        label: row.label
    })];
})));

export function hazardEvidenceFor(spec) {
    return HAZARD_EVIDENCE[spec] || null;
}
