// Coastal regions (spec 1.2.14.1–1.2.14.71).
//
// A coast is a meeting point, not a recoloured meadow. The same tile can be a
// surf-cut sand beach, a shingle bank, a salt marsh, a dune field, a flooded
// tidal flat or a sheltered natural harbour. This module derives one bounded,
// deterministic profile per tile from the shared seed, terrain, season, tide
// and player works. The renderer, survey, gathering ledger, hazards and the
// coastal works all read this single profile; there is no second coastline
// simulation and no per-tile mutable ecology state.
import { seasonalState } from "./season.js";

const req = (id, key, label, group) => ({ id: "1.2.14." + id, key, label, group });

export const COAST_REQUIREMENTS = Object.freeze([
    req(1, "sand-beaches", "Sand beaches", "landform"),
    req(2, "shingle-beaches", "Shingle beaches", "landform"),
    req(3, "rocky-coasts", "Rocky coasts", "landform"),
    req(4, "sea-cliffs", "Sea cliffs", "landform"),
    req(5, "flat-marsh-coasts", "Flat marsh coasts", "landform"),
    req(6, "dune-coasts", "Dune coasts", "landform"),
    req(7, "lagoons", "Lagoons", "landform"),
    req(8, "tidal-flats", "Tidal flats", "landform"),
    req(9, "fjord-coasts", "Fjord coasts", "landform"),
    req(10, "river-mouths-deltas", "River mouths and deltas", "landform"),
    req(11, "beach-grasses", "Beach grasses", "vegetation"),
    req(12, "dune-plants", "Dune plants", "vegetation"),
    req(13, "coastal-shrubs", "Coastal shrubs", "vegetation"),
    req(14, "salt-tolerant-plants", "Salt-tolerant plants", "vegetation"),
    req(15, "coastal-forests", "Coastal forests", "vegetation"),
    req(16, "reeds-wetland-plants", "Reeds and wetland plants", "vegetation"),
    req(17, "salt-meadow", "Salt meadow vegetation", "vegetation"),
    req(18, "algae-seagrass", "Algae and seagrass", "vegetation"),
    req(19, "small-bays", "Small bays", "landform"),
    req(20, "natural-harbours", "Natural harbours", "landform"),
    req(21, "river-mouths", "River mouths", "water"),
    req(22, "tidal-areas", "Tidal areas", "water"),
    req(23, "coastal-lagoons", "Coastal lagoons", "water"),
    req(24, "rock-outcrops", "Rock outcrops", "rock"),
    req(25, "island-groups", "Island groups", "landform"),
    req(26, "sandbanks", "Sandbanks", "water"),
    req(27, "reefs", "Reefs and underwater formations", "water"),
    req(28, "shallow-water", "Shallow coastal water", "water"),
    req(29, "gulls-seabirds", "Gulls and seabirds", "fauna"),
    req(30, "seals-marine-mammals", "Seals and other marine mammals", "fauna"),
    req(31, "coastal-wading-birds", "Coastal and wading birds", "fauna"),
    req(32, "fish-shellfish", "Fish and shellfish", "fauna"),
    req(33, "crabs-mussels", "Crabs and mussels", "fauna"),
    req(34, "sea-turtles", "Sea turtles in suitable climates", "fauna"),
    req(35, "coastal-predators", "Coastal predators", "fauna"),
    req(36, "migratory-birds", "Migratory birds and seasonal resting places", "fauna"),
    req(37, "fish", "Fish", "economy"),
    req(38, "shellfish", "Shellfish and molluscs", "economy"),
    req(39, "salt", "Salt", "economy"),
    req(40, "seaweed", "Seaweed and algae", "economy"),
    req(41, "driftwood", "Driftwood", "economy"),
    req(42, "coastal-minerals", "Coastal minerals", "economy"),
    req(43, "sea-trade-goods", "Sea trade goods", "economy"),
    req(44, "pearls-rare-materials", "Pearls and rare natural materials", "economy"),
    req(45, "strong-winds", "Strong coastal winds", "climate"),
    req(46, "fog", "Fog", "climate"),
    req(47, "storm-surges", "Storm surges", "hazard"),
    req(48, "high-waves", "High waves", "climate"),
    req(49, "tides", "Tides", "water"),
    req(50, "coastal-rain", "Coastal rain", "climate"),
    req(51, "salt-spray", "Salt spray", "climate"),
    req(52, "seasonal-water-levels", "Seasonal changes in water level", "water"),
    req(53, "ice-floes", "Ice floes and frozen coasts", "climate"),
    req(54, "fishing-villages", "Fishing villages", "settlement"),
    req(55, "harbour-towns", "Harbour towns", "settlement"),
    req(56, "trading-posts", "Trading posts", "settlement"),
    req(57, "coastal-fortresses", "Coastal fortresses", "settlement"),
    req(58, "lighthouses", "Lighthouses", "settlement"),
    req(59, "shipyards", "Shipyards", "settlement"),
    req(60, "saltworks", "Salt-making works", "settlement"),
    req(61, "coastal-markets", "Coastal markets", "settlement"),
    req(62, "naval-bases", "Naval bases and fleet stations", "settlement"),
    req(63, "harbour-control", "Strategic control of natural harbours", "settlement"),
    req(64, "storm-surge-damage", "Storm surge damage", "hazard"),
    req(65, "coastal-erosion", "Coastal erosion", "hazard"),
    req(66, "flooding", "Flooding", "hazard"),
    req(67, "sand-shift", "Sand movement", "hazard"),
    req(68, "soil-salinisation", "Salinisation of soils", "hazard"),
    req(69, "port-damage", "Damage to harbours and settlements", "hazard"),
    req(70, "tide-change", "Changes caused by tides", "succession"),
    req(71, "coastline-change", "Long-term changes of the coastline", "succession"),
]);

export const COAST_REQUIREMENT_IDS = Object.freeze(COAST_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(COAST_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const COAST_FORMATIONS = Object.freeze({
    "sand-beach": Object.freeze({
        id: "sand-beach", label: "Sand beach", zone: "beach",
        note: "a pale surf-cut strand of sand, shell grit and low beach grass above the tide line",
        trees: [], shrubs: ["sea-buckthorn"], grasses: ["beach-grass", "sand-couch"],
        flowers: ["sea-holly", "yellow-horned-poppy"], algae: ["sea-lettuce"],
    }),
    "shingle-beach": Object.freeze({
        id: "shingle-beach", label: "Shingle beach", zone: "beach",
        note: "a steep bank of rounded shingle, sorted by the waves and held by salt-tolerant scrub",
        trees: [], shrubs: ["sea-buckthorn"], grasses: ["sand-couch", "beach-grass"],
        flowers: ["sea-kale", "thrift"], algae: [],
    }),
    "rocky-shore": Object.freeze({
        id: "rocky-shore", label: "Rocky shore", zone: "rock",
        note: "a wave-cut rock platform with tide pools, barnacles, kelp and outcrops",
        trees: [], shrubs: ["saltbush"], grasses: ["fescue"],
        flowers: ["thrift", "sea-lavender"], algae: ["kelp", "seagrass"],
    }),
    "sea-cliff": Object.freeze({
        id: "sea-cliff", label: "Sea cliff", zone: "cliff",
        note: "a sheer wind-scoured cliff of layered rock above a narrow wave-cut base",
        trees: [], shrubs: ["saltbush"], grasses: ["fescue"],
        flowers: ["thrift"], algae: ["kelp"],
    }),
    "salt-marsh": Object.freeze({
        id: "salt-marsh", label: "Salt marsh", zone: "marsh",
        note: "a flat, twice-flooded marsh of creeklets, glasswort, salt meadow and reed beds",
        trees: [], shrubs: ["saltbush"], grasses: ["salt-meadow", "cord-grass", "reed"],
        flowers: ["sea-lavender", "sea-aster"], algae: ["seagrass"],
    }),
    "dune-field": Object.freeze({
        id: "dune-field", label: "Dune field", zone: "dune",
        note: "a moving field of marram-held dunes, slacks and wind-scoured sand",
        trees: [], shrubs: ["sea-buckthorn", "bramble"], grasses: ["marram", "beach-grass"],
        flowers: ["sea-holly", "yellow-horned-poppy"], algae: [],
    }),
    lagoon: Object.freeze({
        id: "lagoon", label: "Coastal lagoon", zone: "lagoon",
        note: "a shallow brackish lagoon behind a barrier beach, fringed with reeds and eelgrass",
        trees: [], shrubs: ["saltbush"], grasses: ["reed", "salt-meadow"],
        flowers: ["sea-aster"], algae: ["seagrass", "sea-lettuce"],
    }),
    "tidal-flat": Object.freeze({
        id: "tidal-flat", label: "Tidal flat", zone: "tidal",
        note: "a wide mudflat exposed at low water, cut by drainage creeks and loud with waders",
        trees: [], shrubs: [], grasses: ["cord-grass"],
        flowers: [], algae: ["sea-lettuce"],
    }),
    fjord: Object.freeze({
        id: "fjord", label: "Fjord coast", zone: "fjord",
        note: "a deep drowned valley with steep rock walls, waterfalls and a narrow sheltered arm",
        trees: ["coastal-pine", "alder"], shrubs: ["juniper", "bramble"], grasses: ["fescue"],
        flowers: ["thrift"], algae: ["kelp"],
    }),
    "river-delta": Object.freeze({
        id: "river-delta", label: "River delta", zone: "delta",
        note: "a branching river mouth of shifting sandbars, reed islands and rich brackish mud",
        trees: ["alder", "willow"], shrubs: ["bramble", "saltbush"], grasses: ["reed", "salt-meadow"],
        flowers: ["sea-aster"], algae: ["seagrass"],
    }),
    "sheltered-bay": Object.freeze({
        id: "sheltered-bay", label: "Sheltered bay", zone: "bay",
        note: "a curved bay with calm shallow water, a sand and shingle head and a low wooded bank",
        trees: ["coastal-pine"], shrubs: ["sea-buckthorn"], grasses: ["beach-grass", "salt-meadow"],
        flowers: ["sea-lavender"], algae: ["seagrass"],
    }),
    "natural-harbour": Object.freeze({
        id: "natural-harbour", label: "Natural harbour", zone: "harbour",
        note: "a deep, sheltered anchorage behind a spit or headland, with a safe approach and a working shore",
        trees: ["alder", "coastal-pine"], shrubs: ["sea-buckthorn"], grasses: ["salt-meadow", "reed"],
        flowers: ["sea-aster"], algae: ["seagrass", "kelp"],
    }),
    "island-shore": Object.freeze({
        id: "island-shore", label: "Island group", zone: "island",
        note: "a cluster of low islands, skerries and channels broken by tide and weather",
        trees: ["coastal-pine"], shrubs: ["sea-buckthorn"], grasses: ["fescue", "beach-grass"],
        flowers: ["thrift"], algae: ["kelp"],
    }),
    "coastal-forest": Object.freeze({
        id: "coastal-forest", label: "Coastal forest", zone: "forest",
        note: "a wind-shaped stand of pine, alder and willow holding the stable ground behind the shore",
        trees: ["coastal-pine", "alder", "willow"], shrubs: ["sea-buckthorn", "juniper", "bramble"],
        grasses: ["fescue", "salt-meadow"], flowers: ["sea-aster"], algae: [],
    }),
    "shallow-water": Object.freeze({
        id: "shallow-water", label: "Shallow coastal water", zone: "water",
        note: "clear shallow water over sand, weed and shell rubble, alive with fish and waders",
        trees: [], shrubs: [], grasses: [], flowers: [], algae: ["seagrass", "kelp"],
    }),
    reef: Object.freeze({
        id: "reef", label: "Reef and underwater formation", zone: "reef",
        note: "a rock reef breaking the surface at low tide, its pools and kelp forest crowded with life",
        trees: [], shrubs: [], grasses: [], flowers: [], algae: ["kelp", "seagrass"],
    }),
    sandbank: Object.freeze({
        id: "sandbank", label: "Sandbank", zone: "sandbank",
        note: "a shifting tongue of sand and shell visible through the tide, marked by breaking water",
        trees: [], shrubs: [], grasses: [], flowers: [], algae: [],
    }),
});

export const COAST_GOODS = Object.freeze({
    fish: Object.freeze({ id: "fish", label: "Fish", category: "food" }),
    shellfish: Object.freeze({ id: "shellfish", label: "Shellfish", category: "food" }),
    mussels: Object.freeze({ id: "mussels", label: "Mussels", category: "food" }),
    salt: Object.freeze({ id: "salt", label: "Sea salt", category: "material" }),
    seaweed: Object.freeze({ id: "seaweed", label: "Seaweed", category: "gather" }),
    driftwood: Object.freeze({ id: "driftwood", label: "Driftwood", category: "wood" }),
    "coastal-minerals": Object.freeze({ id: "coastal-minerals", label: "Coastal minerals", category: "material" }),
    "sea-trade-goods": Object.freeze({ id: "sea-trade-goods", label: "Sea trade goods", category: "luxury" }),
    pearls: Object.freeze({ id: "pearls", label: "Pearls", category: "luxury" }),
    amber: Object.freeze({ id: "amber", label: "Amber", category: "luxury" }),
    reed: Object.freeze({ id: "reed", label: "Reed", category: "gather" }),
    "coastal-fibre": Object.freeze({ id: "coastal-fibre", label: "Coastal fibre", category: "gather" }),
    "sea-buckthorn": Object.freeze({ id: "sea-buckthorn", label: "Sea buckthorn berries", category: "gather" }),
    "coastal-pine-timber": Object.freeze({ id: "coastal-pine-timber", label: "Coastal pine timber", category: "wood" }),
});

export const COAST_TREES = Object.freeze({
    "coastal-pine": Object.freeze({ id: "coastal-pine", label: "Coastal pine", kind: "conifer", heightMeters: 15, crown: 0.6, colours: { spring: "#5d704b", summer: "#4a6445", autumn: "#526442", winter: "#4c5b44" }, goods: ["coastal-pine-timber", "firewood", "resin"] }),
    alder: Object.freeze({ id: "alder", label: "Alder", kind: "broadleaf", heightMeters: 12, crown: 0.68, colours: { spring: "#71855c", summer: "#587447", autumn: "#8b8454", winter: "#6f715e" }, goods: ["alder-timber", "firewood", "alder-cones"] }),
    willow: Object.freeze({ id: "willow", label: "Willow", kind: "broadleaf", heightMeters: 9, crown: 0.74, colours: { spring: "#879764", summer: "#6f8653", autumn: "#a89958", winter: "#7d7c67" }, goods: ["willow-timber", "willow-withies", "firewood"] }),
});

export const COAST_SHRUBS = Object.freeze({
    "sea-buckthorn": Object.freeze({ id: "sea-buckthorn", label: "Sea buckthorn", colours: ["#7d8a57", "#b0833f"], goods: ["sea-buckthorn"] }),
    saltbush: Object.freeze({ id: "saltbush", label: "Saltbush", colours: ["#78866b", "#a3a67a"], goods: ["coastal-fibre"] }),
    bramble: Object.freeze({ id: "bramble", label: "Coastal bramble", colours: ["#566d4b", "#7f8157"], goods: ["berries"] }),
    juniper: Object.freeze({ id: "juniper", label: "Coastal juniper", colours: ["#4f644c", "#6f7b5d"], goods: ["juniper-berries", "firewood"] }),
});

export const COAST_GRASSES = Object.freeze({
    "beach-grass": Object.freeze({ id: "beach-grass", label: "Beach grass", colours: ["#9a9a75", "#c0b98b"], goods: ["coastal-fibre", "hay"] }),
    "sand-couch": Object.freeze({ id: "sand-couch", label: "Sand couch", colours: ["#8b9466", "#b5ad7b"], goods: ["coastal-fibre"] }),
    marram: Object.freeze({ id: "marram", label: "Marram grass", colours: ["#9d9c6f", "#c2b98b"], goods: ["coastal-fibre", "hay"] }),
    "salt-meadow": Object.freeze({ id: "salt-meadow", label: "Salt meadow grass", colours: ["#7c8b5e", "#a7a679"], goods: ["hay"] }),
    "cord-grass": Object.freeze({ id: "cord-grass", label: "Cord grass", colours: ["#7b8a5b", "#a6a172"], goods: ["hay", "coastal-fibre"] }),
    reed: Object.freeze({ id: "reed", label: "Reed", colours: ["#7c8b54", "#b3a76e"], goods: ["reed", "coastal-fibre"] }),
    fescue: Object.freeze({ id: "fescue", label: "Coastal fescue", colours: ["#7d8a61", "#a6a67a"], goods: ["hay"] }),
});

export const COAST_FLOWERS = Object.freeze({
    "sea-holly": Object.freeze({ id: "sea-holly", label: "Sea holly", seasons: ["summer", "autumn"], colours: ["#6f7f9a", "#a9b4c9"], goods: [] }),
    "yellow-horned-poppy": Object.freeze({ id: "yellow-horned-poppy", label: "Yellow horned poppy", seasons: ["spring", "summer"], colours: ["#c9b75a", "#e7dc8e"], goods: [] }),
    thrift: Object.freeze({ id: "thrift", label: "Thrift", seasons: ["spring", "summer"], colours: ["#b8799b", "#d5a4bd"], goods: [] }),
    "sea-kale": Object.freeze({ id: "sea-kale", label: "Sea kale", seasons: ["spring", "summer"], colours: ["#9caa86", "#d1d4b3"], goods: ["coastal-fibre"] }),
    "sea-lavender": Object.freeze({ id: "sea-lavender", label: "Sea lavender", seasons: ["summer", "autumn"], colours: ["#8b78ad", "#b5a5d0"], goods: [] }),
    "sea-aster": Object.freeze({ id: "sea-aster", label: "Sea aster", seasons: ["summer", "autumn"], colours: ["#8e83b0", "#c0b5d6"], goods: [] }),
});

export const COAST_ALGAE = Object.freeze({
    kelp: Object.freeze({ id: "kelp", label: "Kelp", colours: ["#4b674a", "#78865b"], goods: ["seaweed"] }),
    seagrass: Object.freeze({ id: "seagrass", label: "Eelgrass", colours: ["#4f7254", "#7f9667"], goods: ["seaweed"] }),
    "sea-lettuce": Object.freeze({ id: "sea-lettuce", label: "Sea lettuce", colours: ["#6d8d56", "#a0b77a"], goods: ["seaweed"] }),
});

export const COAST_FAUNA = Object.freeze({
    gull: Object.freeze({ id: "gull", label: "Herring gull", group: "seabird", seasons: ["spring", "summer", "autumn", "winter"] }),
    tern: Object.freeze({ id: "tern", label: "Tern", group: "seabird", seasons: ["spring", "summer", "autumn"] }),
    oystercatcher: Object.freeze({ id: "oystercatcher", label: "Oystercatcher", group: "wader", seasons: ["spring", "summer", "autumn", "winter"] }),
    redshank: Object.freeze({ id: "redshank", label: "Redshank", group: "wader", seasons: ["spring", "summer", "autumn"] }),
    goose: Object.freeze({ id: "goose", label: "Migrating goose", group: "migratory", seasons: ["spring", "autumn", "winter"] }),
    seal: Object.freeze({ id: "seal", label: "Harbour seal", group: "marine-mammal", seasons: ["spring", "summer", "autumn", "winter"] }),
    otter: Object.freeze({ id: "otter", label: "Coastal otter", group: "predator", seasons: ["spring", "summer", "autumn", "winter"] }),
    fox: Object.freeze({ id: "fox", label: "Dune fox", group: "predator", seasons: ["spring", "summer", "autumn", "winter"] }),
    "sea-eagle": Object.freeze({ id: "sea-eagle", label: "Sea eagle", group: "predator", seasons: ["spring", "summer", "autumn", "winter"] }),
    crab: Object.freeze({ id: "crab", label: "Shore crab", group: "crustacean", seasons: ["spring", "summer", "autumn"] }),
    mussel: Object.freeze({ id: "mussel", label: "Mussel bed", group: "shellfish", seasons: ["spring", "summer", "autumn", "winter"] }),
    fish: Object.freeze({ id: "fish", label: "Coastal fish", group: "fish", seasons: ["spring", "summer", "autumn", "winter"] }),
    turtle: Object.freeze({ id: "turtle", label: "Sea turtle", group: "reptile", seasons: ["summer", "autumn"] }),
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const smoothstep = (edge0, edge1, value) => {
    const t = clamp01((Number(value) - edge0) / (edge1 - edge0 || 1e-6));
    return t * t * (3 - 2 * t);
};

function hash32(seed, x, y, salt) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, x, y, salt) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

function coarse(seed, x, y, cell, salt) {
    return unit(seed, Math.floor(x / Math.max(1, cell)), Math.floor(y / Math.max(1, cell)), salt);
}

function pick(seed, x, y, list, salt = 0) {
    if (!list.length) return null;
    return list[hash32(seed, x, y, salt) % list.length];
}

function seasonKeyFor(dayOfYear) {
    const day = ((Number(dayOfYear) % 400) + 400) % 400;
    return SEASON_KEYS[Math.floor(day / 100) % 4] || "spring";
}

function normalizeUse(value = {}) {
    const explicit = value && typeof value === "object" ? value : {};
    const state = explicit.state || "wild";
    return {
        ...explicit, state,
        settlement: Boolean(explicit.settlement || explicit.village || state === "village"),
        fishingVillage: Boolean(explicit.fishingVillage || explicit.fishing || state === "fishing-village"),
        harbour: Boolean(explicit.harbour || explicit.harbor || state === "harbour"),
        tradingPost: Boolean(explicit.tradingPost || explicit.trade || state === "trading-post"),
        fortress: Boolean(explicit.fortress || state === "fortress"),
        lighthouse: Boolean(explicit.lighthouse || state === "lighthouse"),
        shipyard: Boolean(explicit.shipyard || state === "shipyard"),
        saltworks: Boolean(explicit.saltworks || state === "saltworks"),
        market: Boolean(explicit.market || state === "market"),
        navalBase: Boolean(explicit.navalBase || state === "naval-base"),
        road: Boolean(explicit.road || state === "road"),
        bridge: Boolean(explicit.bridge || state === "bridged"),
        drained: Boolean(explicit.drained || state === "drained"),
        protected: Boolean(explicit.protected || state === "protected"),
        restored: Boolean(explicit.restored || state === "restored"),
        logged: Boolean(explicit.logged || state === "logged"),
        grazed: Boolean(explicit.grazed || state === "grazed"),
    };
}

function chooseFormation(scores) {
    if (scores.water) {
        if (scores.reef > 0.72) return "reef";
        if (scores.sandbank > 0.62) return "sandbank";
        return "shallow-water";
    }
    if (scores.sand && scores.relative < 0.016) return "sand-beach";
    if (scores.shingle && scores.relative < 0.022) return "shingle-beach";
    if (scores.fjord > 0.72 && scores.temperature < 0.48) return "fjord";
    if (scores.marsh > 0.62 && scores.relative < 0.048) return "salt-marsh";
    if (scores.tidal > 0.62 && scores.relative < 0.042) return "tidal-flat";
    if (scores.lagoon > 0.66) return "lagoon";
    if (scores.dune > 0.58 && scores.relative < 0.082) return "dune-field";
    if (scores.delta > 0.62) return "river-delta";
    if (scores.cliff > 0.68) return "sea-cliff";
    if (scores.rocky > 0.62) return "rocky-shore";
    if (scores.harbour > 0.68) return "natural-harbour";
    if (scores.bay > 0.58) return "sheltered-bay";
    if (scores.island > 0.62) return "island-shore";
    if (scores.forest > 0.46) return "coastal-forest";
    if (scores.sand > 0.45) return "sand-beach";
    return "shingle-beach";
}

function buildTrees(seed, x, y, formation, season, stage, forest) {
    if (!formation.trees.length || stage === "bare" || forest < 0.32) return [];
    const rank = stage === "forest" ? 3 : stage === "shrub" ? 2 : 1;
    const chance = rank >= 3 ? 0.66 : rank === 2 ? 0.24 : 0.08;
    const roll = unit(seed, x, y, 0x434f4154);
    if (roll > chance) return [];
    const trees = [];
    const count = roll < chance * 0.18 ? 2 : 1;
    for (let index = 0; index < count; index++) {
        const definition = COAST_TREES[pick(seed, x + index, y, formation.trees, 0x54524545 + index)];
        if (!definition) continue;
        trees.push({
            ...definition,
            offsetX: (unit(seed, x + index, y, 0x54524546) - 0.5) * 0.5,
            offsetY: (unit(seed, x, y + index, 0x54524547) - 0.5) * 0.26,
            scale: 0.68 + unit(seed, x, y + index, 0x54524548) * 0.4,
            seasonColour: definition.colours[season] || definition.colours.summer,
            windBent: true,
            coastal: true,
        });
    }
    return trees;
}

function buildFlora(seed, x, y, formation, season, context) {
    const { stage, salt, moisture, temperature } = context;
    const grasses = formation.grasses.map(id => COAST_GRASSES[id]).filter(Boolean)
        .filter((entry, index) => stage !== "bare" || unit(seed, x, y, 0x47524153 + index) > 0.52);
    const shrubs = formation.shrubs.map(id => COAST_SHRUBS[id]).filter(Boolean)
        .filter((entry, index) => (stage === "shrub" || stage === "forest") && unit(seed, x, y, 0x53485255 + index) > 0.32 + salt * 0.18);
    const flowers = formation.flowers.map(id => COAST_FLOWERS[id]).filter(Boolean)
        .filter(entry => entry.seasons.includes(season))
        .filter((entry, index) => stage !== "bare" && unit(seed, x, y, 0x464c4f57 + index) > 0.34 + salt * 0.2);
    const algae = formation.algae.map(id => COAST_ALGAE[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x414c4741 + index) > 0.22);
    return { grasses, shrubs, flowers, algae };
}

function buildFauna(seed, x, y, context) {
    const { season, temperature, water, rock, vegetation, tide, island, harbour, marsh, stage } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = COAST_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(12, Math.round(count))) });
    };
    if ((water > 0.18 || harbour) && unit(seed, x, y, 0x47554c4c) > 0.28) add("gull", 3);
    if (water > 0.3 && (season === "spring" || season === "summer") && unit(seed, x, y, 0x5445524e) > 0.42) add("tern", 2);
    if ((marsh || tide > 0.5) && unit(seed, x, y, 0x4f595354) > 0.38) add("oystercatcher", 2);
    if (marsh && unit(seed, x, y, 0x52454453) > 0.48) add("redshank", 2);
    if ((season === "spring" || season === "autumn" || season === "winter") && (marsh || harbour) && unit(seed, x, y, 0x474f4f53) > 0.56) add("goose", 4);
    if ((rock > 0.42 || harbour) && unit(seed, x, y, 0x5345414c) > 0.5) add("seal", 2);
    if ((water > 0.24 || marsh) && unit(seed, x, y, 0x4f545445) > 0.62) add("otter");
    if (stage !== "bare" && unit(seed, x, y, 0x464f5831) > 0.68) add("fox");
    if (rock > 0.48 && unit(seed, x, y, 0x4541474c) > 0.78) add("sea-eagle");
    if (tide > 0.35 && unit(seed, x, y, 0x43524142) > 0.44) add("crab", 3);
    if (rock > 0.26 && unit(seed, x, y, 0x4d555353) > 0.42) add("mussel", 5);
    if (water > 0.2 && unit(seed, x, y, 0x46495348) > 0.3) add("fish", 4);
    if (temperature > 0.72 && season === "summer" && (water > 0.28 || island) && unit(seed, x, y, 0x54555254) > 0.76) add("turtle");
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { water, rock, sand, marsh, tide, harbour, reef, island, vegetation, fauna, use, season } = context;
    const goods = [];
    const add = (id, abundance) => {
        const definition = COAST_GOODS[id];
        const amount = clamp01(abundance);
        if (!definition || amount <= 0.08 || goods.some(entry => entry.id === id)) return;
        goods.push({ ...definition, abundance: amount });
    };
    if (water > 0.15 || harbour || use.fishingVillage) add("fish", 0.28 + water * 0.36 + (use.fishingVillage ? 0.24 : 0));
    if (rock > 0.2 || marsh || tide > 0.35 || use.fishingVillage) add("shellfish", 0.2 + tide * 0.22 + (marsh ? 0.1 : 0));
    if (rock > 0.32 || tide > 0.42) add("mussels", 0.18 + rock * 0.2 + (use.fishingVillage ? 0.2 : 0));
    if (marsh > 0.34 || use.saltworks) add("salt", 0.22 + (marsh > 0.34 ? 0.26 : 0) + (use.saltworks ? 0.35 : 0));
    if (water > 0.16 || reef) add("seaweed", 0.2 + water * 0.25 + (reef ? 0.14 : 0));
    if (sand > 0.32 || tide > 0.48) add("driftwood", 0.16 + tide * 0.12 + (use.harbour ? 0.08 : 0));
    if (rock > 0.3) add("coastal-minerals", 0.18 + rock * 0.28);
    if (harbour || use.tradingPost || use.market || use.shipyard) add("sea-trade-goods", 0.3 + (harbour ? 0.2 : 0) + (use.market ? 0.14 : 0));
    if (reef && season !== "winter") add("pearls", 0.14 + (reef ? 0.2 : 0));
    if (sand > 0.3 && unit(seed, x, y, 0x414d4245) > 0.82) add("amber", 0.18);
    if (marsh > 0.38) add("reed", 0.26 + marsh * 0.2);
    if (vegetation > 0.2 || sand > 0.18) add("coastal-fibre", 0.18 + vegetation * 0.2);
    if (vegetation > 0.34 && island) add("sea-buckthorn", 0.16);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

/** How strongly a tile belongs to the coastal climate, including shallow water. */
export function coastPotentialAt(x, y, context = {}) {
    const climate = context.climate || "temperate";
    if (climate !== "coastal") return 0;
    const height = clamp01(context.height ?? 0.56);
    const seaLevel = number(context.seaLevel, 0.33);
    const depth = seaLevel - height;
    if (depth > 0.075) return 0;
    return clamp01(0.82 + unit(Number(context.seed) || 1, x, y, 0x434f4153) * 0.18);
}

export function isCoastSite(x, y, context = {}) {
    return coastPotentialAt(x, y, context) > 0.24;
}

/** Complete, pure coastal profile for one tile. */
export function coastProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const height = clamp01(context.height ?? 0.56);
    const seaLevel = number(context.seaLevel, 0.33);
    const moisture = clamp01(context.moisture ?? 0.55);
    const temperature = clamp01(context.temperature ?? 0.6);
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.15, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const seasonal = seasonalState(dayOfYear, "coastal");
    const use = normalizeUse(context.use);
    const aboveSea = height - seaLevel;
    const water = Math.max(0, seaLevel - height);
    const relative = clamp01(aboveSea / 0.42);
    const isWater = water > 0;
    const tide = 0.5 + 0.5 * Math.sin((dayOfYear / 50 + unit(seed, x, y, 0x54494445) * 0.7) * Math.PI * 2);
    const springTide = 0.55 + 0.45 * Math.sin((dayOfYear / 100 + 0.25) * Math.PI * 2);
    const seasonalWater = (season === "autumn" || season === "winter" ? 0.04 : 0.018) * (0.6 + springTide * 0.6);
    const wave = clamp01(0.18 + wind * 0.24 + (season === "autumn" || season === "winter" ? 0.16 : 0.04) + (water > 0.03 ? 0.1 : 0));
    const storm = clamp01((season === "autumn" ? 0.27 : season === "winter" ? 0.22 : 0.08) + wave * 0.22
        + unit(seed, x, y, 0x53544f52) * 0.24 + (year % 7 === 0 ? 0.08 : 0));
    const rain = weather === "rain" || season === "autumn" || season === "winter" ? clamp01(0.34 + moisture * 0.3) : clamp01(moisture * 0.2);
    const fog = clamp01((hour < 9 || weather === "fog" ? 0.24 : 0.02) + moisture * 0.25 + (wave > 0.5 ? 0.08 : 0));
    const salt = clamp01(0.18 + wave * 0.28 + (1 - moisture) * 0.18 + (isWater ? 0.1 : 0));
    const rockRoll = coarse(seed, x, y, 6, 0x524f434b);
    const cliffRoll = coarse(seed, x, y, 7, 0x434c4946);
    const sandRoll = coarse(seed, x, y, 5, 0x53414e44);
    const shingleRoll = coarse(seed, x, y, 4, 0x5348494e);
    const duneRoll = coarse(seed, x, y, 8, 0x44554e45);
    const marshRoll = coarse(seed, x, y, 6, 0x4d415253);
    const lagoonRoll = coarse(seed, x, y, 9, 0x4c41474f);
    const reefRoll = coarse(seed, x, y, 5, 0x52454546);
    const harbourRoll = coarse(seed, x, y, 8, 0x48415242);
    const bayRoll = coarse(seed, x, y, 10, 0x424159);
    const fjordRoll = coarse(seed, x, y, 11, 0x464a4f52);
    const deltaRoll = coarse(seed, x, y, 6, 0x44454c54);
    const islandRoll = coarse(seed, x, y, 12, 0x49534c45);
    const forestRoll = coarse(seed, x, y, 7, 0x464f5245);
    const textureRoll = coarse(seed, x, y, 4, 0x54455854);
    const rock = clamp01((relative > 0.06 ? 0.18 : 0.06) + rockRoll * 0.72 + cliffRoll * 0.18);
    const sand = clamp01(sandRoll * 0.8 + (1 - rock) * 0.2 + (isWater ? 0.08 : 0));
    const shingle = clamp01(shingleRoll * 0.82 + rock * 0.16);
    const cliff = clamp01(cliffRoll * 0.76 + smoothstep(0.035, 0.13, relative) * 0.22 + (relative > 0.14 ? 0.08 : 0));
    const dune = clamp01(duneRoll * 0.72 + smoothstep(0.008, 0.06, relative) * (1 - relative) * 0.24);
    const marsh = clamp01(marshRoll * 0.7 + moisture * 0.32 + (relative < 0.045 ? 0.12 : 0) - (1 - moisture) * 0.12);
    const tidal = clamp01(tide * 0.42 + marsh * 0.38 + (relative < 0.035 ? 0.14 : 0));
    const lagoon = clamp01(lagoonRoll * 0.66 + (relative < 0.06 && moisture > 0.6 ? 0.22 : 0) + (isWater ? 0.12 : 0));
    const reef = clamp01(reefRoll * 0.84 + (temperature > 0.58 ? 0.12 : 0) + (water > 0.015 ? 0.1 : 0));
    const harbour = clamp01(harbourRoll * 0.8 + (1 - cliff) * 0.16 + (relative > 0.01 && relative < 0.09 ? 0.12 : 0));
    const bay = clamp01(bayRoll * 0.78 + (1 - rock) * 0.18 + (relative < 0.1 ? 0.08 : 0));
    const fjord = clamp01(fjordRoll * 0.8 + (temperature < 0.48 ? 0.2 : 0) + (rock > 0.46 ? 0.1 : 0));
    const delta = clamp01(deltaRoll * 0.74 + moisture * 0.22 + (relative < 0.025 ? 0.16 : 0));
    const island = clamp01(islandRoll * 0.72 + (relative < 0.05 ? 0.14 : 0) + (weather === "storm" ? 0.08 : 0));
    const forest = clamp01(forestRoll * 0.62 + moisture * 0.34 + (1 - salt) * 0.16 - (relative < 0.025 ? 0.2 : 0));
    const sandbank = clamp01(sand * 0.62 + textureRoll * 0.25 + (tide > 0.55 ? 0.12 : 0));
    const formationId = chooseFormation({
        water: isWater, relative, temperature, sand, shingle, fjord, marsh, tidal, lagoon,
        dune, delta, cliff, rocky: rock, harbour, bay, island, forest, reef, sandbank,
    });
    const formation = COAST_FORMATIONS[formationId];
    const stage = cliff > 0.62 || (isWater && water > 0.05) ? "bare"
        : relative < 0.012 ? "pioneer"
            : marsh > 0.55 ? "marsh"
                : dune > 0.52 && forest < 0.3 ? "pioneer"
                    : forest > 0.52 ? "forest"
                        : forest > 0.34 || shrubPotential(shoreShrubRoll(seed, x, y)) ? "shrub"
                            : "meadow";
    const flora = buildFlora(seed, x, y, formation, season, { stage, salt, moisture, temperature });
    const trees = buildTrees(seed, x, y, formation, season, stage, forest);
    const vegetation = clamp01(trees.length * 0.14 + flora.shrubs.length * 0.09 + flora.grasses.length * 0.07
        + flora.flowers.length * 0.03 + (stage === "marsh" ? 0.16 : 0) - salt * 0.2 - (cliff > 0.62 ? 0.14 : 0));
    const fauna = buildFauna(seed, x, y, {
        season, temperature, water: Math.max(water, tidal * 0.8), rock, vegetation, tide,
        island: formationId === "island-shore", harbour: harbour > 0.5, marsh: marsh > 0.5, stage,
    });
    const erosion = clamp01(wave * 0.32 + storm * 0.34 + (use.drained ? 0.08 : 0) - (use.protected ? 0.2 : 0));
    const salinisation = clamp01(salt * 0.38 + storm * 0.2 + (relative < 0.06 ? 0.14 : 0) - (use.drained ? 0.14 : 0));
    const sandShift = clamp01(dune * 0.34 + wave * 0.2 + storm * 0.28 + (use.protected ? -0.08 : 0.06));
    const flood = clamp01(storm * 0.46 + tide * 0.2 + marsh * 0.2 + (relative < 0.04 ? 0.12 : 0) - (use.protected ? 0.1 : 0));
    const coastlineChange = clamp01((year % 9) / 9 * 0.28 + storm * 0.24 + erosion * 0.3 + sandShift * 0.18);
    const tideChange = clamp01(Math.abs(tide - 0.5) * 0.7 + springTide * 0.18 + coastlineChange * 0.2);
    const waveHeightM = Math.round((0.2 + wave * 2.8 + storm * 1.6) * 10) / 10;
    const stormSurgeM = Math.round((storm * flood * 1.8 + tide * 0.3) * 10) / 10;
    const damage = clamp01(storm * 0.36 + flood * 0.26 + erosion * 0.2);
    const ice = clamp01((temperature < 0.35 ? (0.35 - temperature) * 2.2 : 0) + (season === "winter" ? 0.2 : 0));
    const harbourScore = clamp01(harbour * 0.5 + (1 - wave) * 0.24 + (1 - cliff) * 0.16 + (relative > 0.008 ? 0.1 : 0));
    const saltworks = clamp01(salt * 0.52 + marsh * 0.32 + (use.saltworks ? 0.2 : 0));
    const fish = clamp01(water * 0.28 + reef * 0.24 + harbour * 0.16 + (use.fishingVillage ? 0.2 : 0));
    const goods = buildGoods(seed, x, y, {
        water: Math.max(water, reef * 0.04), rock, sand, marsh, tide, harbour: harbour > 0.5,
        reef: reef > 0.56, island: formationId === "island-shore", vegetation, fauna, use, season,
    });
    const treesGoods = trees.length ? trees.flatMap(tree => tree.goods || []) : [];
    if (treesGoods.length) {
        for (const id of treesGoods) {
            if (goods.some(entry => entry.id === id) || !COAST_GOODS[id]) continue;
            goods.push({ ...COAST_GOODS[id], abundance: 0.22 + trees.length * 0.08 });
        }
        goods.sort((a, b) => b.abundance - a.abundance);
    }

    const features = new Set();
    const add = (id, present = true) => { if (present) features.add("1.2.14." + id); };
    add(1, formationId === "sand-beach" && sand > 0.32);
    add(2, formationId === "shingle-beach" || shingle > 0.48);
    add(3, formationId === "rocky-shore" || rock > 0.52);
    add(4, formationId === "sea-cliff" || cliff > 0.56);
    add(5, formationId === "salt-marsh" || marsh > 0.58);
    add(6, formationId === "dune-field" || dune > 0.52);
    add(7, formationId === "lagoon" || lagoon > 0.56);
    add(8, formationId === "tidal-flat" || tidal > 0.52);
    add(9, formationId === "fjord" || fjord > 0.58);
    add(10, formationId === "river-delta" || delta > 0.54);
    add(11, flora.grasses.some(entry => entry.id === "beach-grass" || entry.id === "sand-couch"));
    add(12, flora.grasses.some(entry => entry.id === "marram") || flora.shrubs.some(entry => entry.id === "sea-buckthorn"));
    add(13, flora.shrubs.length > 0);
    add(14, salt > 0.34 || formationId === "salt-marsh");
    add(15, trees.length > 0 || formationId === "coastal-forest");
    add(16, flora.grasses.some(entry => entry.id === "reed") || marsh > 0.52);
    add(17, flora.grasses.some(entry => entry.id === "salt-meadow") || formationId === "salt-marsh");
    add(18, flora.algae.length > 0);
    add(19, formationId === "sheltered-bay" || bay > 0.5);
    add(20, formationId === "natural-harbour" || harbour > 0.58);
    add(21, formationId === "river-delta" || delta > 0.5);
    add(22, tidal > 0.34 || formationId === "tidal-flat");
    add(23, formationId === "lagoon" || lagoon > 0.52);
    add(24, rock > 0.42 || cliff > 0.46);
    add(25, formationId === "island-shore" || island > 0.56);
    add(26, formationId === "sandbank" || sandbank > 0.52);
    add(27, formationId === "reef" || reef > 0.54);
    add(28, isWater && water < 0.06);
    add(29, fauna.some(entry => entry.group === "seabird"));
    add(30, fauna.some(entry => entry.group === "marine-mammal"));
    add(31, fauna.some(entry => entry.group === "wader"));
    add(32, fish > 0.28 || goods.some(entry => entry.id === "fish"));
    add(33, fauna.some(entry => entry.group === "crustacean" || entry.group === "shellfish") || goods.some(entry => entry.id === "mussels"));
    add(34, fauna.some(entry => entry.id === "turtle") || (temperature > 0.62 && isWater));
    add(35, fauna.some(entry => entry.group === "predator"));
    add(36, fauna.some(entry => entry.group === "migratory") || (season !== "summer" && (marsh > 0.4 || harbour > 0.5 || formationId === "island-shore")));
    add(37, goods.some(entry => entry.id === "fish") || use.fishingVillage);
    add(38, goods.some(entry => entry.id === "shellfish" || entry.id === "mussels") || use.fishingVillage);
    add(39, goods.some(entry => entry.id === "salt") || use.saltworks);
    add(40, goods.some(entry => entry.id === "seaweed") || flora.algae.length > 0);
    add(41, goods.some(entry => entry.id === "driftwood") || formationId === "sand-beach");
    add(42, goods.some(entry => entry.id === "coastal-minerals") || rock > 0.4);
    add(43, goods.some(entry => entry.id === "sea-trade-goods") || use.tradingPost || use.market);
    add(44, goods.some(entry => entry.id === "pearls" || entry.id === "amber"));
    add(45, wind > 1.15 || wave > 0.46);
    add(46, fog > 0.26);
    add(47, storm > 0.34 || flood > 0.28);
    add(48, wave > 0.38 || waveHeightM > 1.5);
    add(49, tide > 0.18);
    add(50, rain > 0.18);
    add(51, salt > 0.3);
    add(52, seasonalWater > 0.025 || Math.abs(tide - 0.5) > 0.18);
    add(53, ice > 0.15 || temperature < 0.38);
    add(54, use.fishingVillage);
    add(55, use.harbour);
    add(56, use.tradingPost);
    add(57, use.fortress);
    add(58, use.lighthouse);
    add(59, use.shipyard);
    add(60, use.saltworks);
    add(61, use.market);
    add(62, use.navalBase);
    add(63, harbour > 0.5 && (use.harbour || use.navalBase || use.fortress));
    add(64, storm > 0.36 && flood > 0.3);
    add(65, erosion > 0.3);
    add(66, flood > 0.28);
    add(67, sandShift > 0.3);
    add(68, salinisation > 0.32);
    add(69, damage > 0.26 && (use.settlement || use.harbour || use.fishingVillage || use.navalBase));
    add(70, tideChange > 0.24);
    add(71, coastlineChange > 0.16 || year > 2);

    const ground = isWater ? [42, 92, 94] : sand > 0.5 ? [206, 190, 146] : shingle > 0.5 ? [151, 148, 135]
        : marsh > 0.5 ? [104, 116, 79] : [118, 130, 88];
    const grassColour = marsh > 0.5 ? [93, 112, 74] : dune > 0.5 ? [165, 160, 104] : [112, 132, 82];
    const rockColour = cliff > 0.55 ? "#77746b" : rock > 0.5 ? "#8c8779" : "#a39c89";
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.16) * 0.64);
    const sky = weather === "rain" ? "#849ba2" : fog > 0.4 ? "#aab8b8" : "#a9c6ce";
    const waterHex = fog > 0.45 ? "#719a9b" : "#4f8f96";
    const visual = {
        sunlight, shadow: clamp01((1 - sunlight) * 0.12 + fog * 0.1), cloud: clamp01(fog * 0.25 + rain * 0.2),
        wind: clamp01(wind * 0.35), windSway: clamp01(0.06 + wind * 0.16),
        sandHex: "#c9b98f", shingleHex: "#9a978a", rockHex: rockColour,
        grassHex: "#71855a", marshHex: "#687b50", waterHex, foamHex: "#d9e8e1",
        skyHex: sky, fogHex: "#bdc9c6", iceHex: "#d8ebec", saltHex: "#ece8d8",
        lightHex: sunlight > 0.5 ? "#e4e2c8" : "#b8c7c7",
        mood: fog > 0.5 ? "fogbound" : storm > 0.55 ? "storm-light" : rain > 0.5 ? "rain-washed" : "maritime",
    };

    return {
        biome: "coastal", coastal: true, coast: true,
        x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate: context.climate || "coastal", moisture, temperature, height,
        features: COAST_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            aboveSea: Math.max(0, aboveSea), relative, waterDepth: water, slope: clamp01(cliff * 0.48 + rock * 0.28 + relative * 0.2),
            sand, shingle, rock, cliff, dune, marsh, tidal, lagoon, reef, harbour, bay, fjord, delta, island,
            outcrop: clamp01(rock * 0.72 + cliff * 0.34), sandbank,
            label: isWater ? (formationId === "reef" ? "reef" : formationId === "sandbank" ? "sandbank" : "shallow water")
                : formationId === "sea-cliff" ? "sea cliff" : formationId === "natural-harbour" ? "natural harbour"
                    : formationId === "salt-marsh" ? "salt marsh" : formationId === "dune-field" ? "dune field"
                        : formationId === "sand-beach" ? "sand beach" : formationId === "shingle-beach" ? "shingle beach"
                            : formationId === "fjord" ? "fjord wall" : formationId === "river-delta" ? "delta shore" : "coastal shelf",
        },
        soil: {
            sand, shingle, salt, organic: clamp01(vegetation * 0.4 + marsh * 0.35), thin: clamp01(1 - vegetation * 0.7),
            fertility: clamp01(vegetation * 0.52 + (1 - salt) * 0.24 - (dune > 0.5 ? 0.12 : 0)),
            salinisation, erosion, stability: clamp01(1 - erosion * 0.5 - sandShift * 0.3),
        },
        water: {
            sea: isWater, depth: water, tide, springTide, seasonalWater, waterLevel: seaLevel + (tide - 0.5) * 0.006 + seasonalWater * 0.02,
            wave, waveHeightM, stormSurgeM, flood, rain, fog, shore: clamp01(1 - Math.abs(aboveSea) / 0.06),
            shallow: isWater && water < 0.06, lagoon: lagoon > 0.55, harbour: harbour > 0.5,
            label: isWater ? "tidal shallows" : formationId === "lagoon" ? "brackish lagoon" : marsh > 0.5 ? "tidal creek and marsh" : "open coast",
        },
        climate: {
            wind, strongWind: wind > 1.15, fog, rain, saltSpray: salt, wave, waveHeightM, tide, tideChange,
            stormSurge: storm, stormSurgeM, ice, iceFloe: ice > 0.3, sunlight, skyHex: sky,
            season, seasonalWater, weather,
        },
        vegetation: {
            trees, shrubs: flora.shrubs, grasses: flora.grasses, flowers: flora.flowers, algae: flora.algae,
            density: vegetation, cover: vegetation, stage, stageRank: stage === "forest" ? 4 : stage === "shrub" ? 3 : stage === "marsh" ? 2 : stage === "meadow" ? 1 : 0,
            saltTolerant: flora.grasses.some(entry => entry.id === "salt-meadow" || entry.id === "cord-grass") || flora.shrubs.some(entry => entry.id === "saltbush"),
            beachGrass: flora.grasses.some(entry => entry.id === "beach-grass"),
            dunePlants: flora.grasses.some(entry => entry.id === "marram") || flora.shrubs.some(entry => entry.id === "sea-buckthorn"),
            reeds: flora.grasses.some(entry => entry.id === "reed"),
            saltMeadow: flora.grasses.some(entry => entry.id === "salt-meadow"),
            seagrass: flora.algae.some(entry => entry.id === "seagrass"),
            seaweed: flora.algae.length > 0,
            bloom: clamp01((season === "spring" ? 0.7 : season === "summer" ? 0.62 : 0.2) * (1 - salt * 0.2)),
            windBent: true,
        },
        fauna,
        goods,
        economy: {
            fish, shellfish: clamp01(tide * 0.3 + rock * 0.22 + (use.fishingVillage ? 0.3 : 0)),
            salt: clamp01(salt * 0.52 + marsh * 0.3 + (use.saltworks ? 0.24 : 0)),
            seaweed: clamp01(water * 0.3 + flora.algae.length * 0.12),
            driftwood: clamp01(sand * 0.24 + tide * 0.18), minerals: clamp01(rock * 0.6 + cliff * 0.16),
            trade: clamp01(harbour * 0.46 + (use.harbour ? 0.24 : 0) + (use.tradingPost ? 0.18 : 0) + (use.market ? 0.18 : 0)),
            rare: clamp01(reef * 0.42 + sand * 0.12 + (use.tradingPost ? 0.1 : 0)),
            timber: clamp01(trees.length * 0.16), hunting: clamp01(fauna.length * 0.06 + vegetation * 0.16),
            harbour: harbourScore, saltworks, fishing: fish, settlement: clamp01((1 - flood) * 0.34 + (1 - erosion) * 0.22
                + (harbour > 0.5 ? 0.18 : 0) + (use.settlement ? 0.2 : 0) + (use.harbour ? 0.16 : 0) - salt * 0.1),
            defence: clamp01(rock * 0.3 + cliff * 0.3 + (use.fortress ? 0.22 : 0) + (use.navalBase ? 0.18 : 0)),
            carryingCapacity: clamp01(0.16 + fish * 0.25 + vegetation * 0.3 + (harbour > 0.5 ? 0.16 : 0) - salinisation * 0.12),
            usability: clamp01(1 - erosion * 0.32 - flood * 0.26 - salinisation * 0.2 + (use.protected ? 0.16 : 0)),
        },
        hazards: {
            stormSurge: storm, wave, waveHeightM, flood, erosion, sandShift, salinisation, damage,
            coastlineChange, tideChange, tide, ice, spray: salt, fog, wind,
            movement: clamp01(0.96 - flood * 0.24 - sand * 0.08 - cliff * 0.2 + (use.road ? 0.16 : 0) + (use.bridge ? 0.12 : 0)),
            passability: clamp01(1 - flood * 0.3 - cliff * 0.18 - sandShift * 0.12 + (use.road ? 0.16 : 0)),
            warning: clamp01((use.lighthouse ? 0.3 : 0) + (use.navalBase ? 0.12 : 0) + fog * 0.12),
        },
        workPotential: {
            fishingVillage: fish, harbour: harbourScore, tradingPost: clamp01(harbourScore * 0.8 + tradePotential(use)),
            fortress: clamp01(rock * 0.65 + cliff * 0.35), lighthouse: clamp01(cliff * 0.55 + rock * 0.3 + harbourScore * 0.15),
            shipyard: clamp01(harbourScore * 0.6 + trees.length * 0.18), saltworks: clamp01(salt * 0.62 + marsh * 0.3),
            market: clamp01(harbourScore * 0.5 + (use.settlement ? 0.2 : 0) + (use.market ? 0.2 : 0)),
            navalBase: clamp01(harbourScore * 0.7 + (use.fortress ? 0.16 : 0) + (use.navalBase ? 0.2 : 0)),
        },
        succession: {
            coastlineChange, duneStability: clamp01(1 - sandShift * 0.6), marshAccretion: clamp01(marsh * 0.6 + tidal * 0.2),
            erosionScar: erosion, saltPan: salinisation, longTermShift: clamp01(coastlineChange * 0.7 + (year / 40)),
            yearsObserved: Math.max(0, year - 1),
        },
        tide: {
            level: tide, heightM: Math.round(tide * 4.2 * 10) / 10,
            rangeM: Math.round((0.5 + springTide * 1.8) * 10) / 10,
            change: tideChange, spring: springTide,
        },
        use,
        visual,
        grassHex: "#71855a", groundHex: "#8f936d", leafColour: trees[0]?.seasonColour || "#71855a",
        sward: { height: dune > 0.5 ? "tussock" : marsh > 0.5 ? "reed" : "short", density: clamp01(vegetation * 0.7) },
        trees, treeChance: trees.length ? clamp01(0.28 + vegetation * 0.44) : 0,
        seasonalNote: `${formation.label} · tide ${Math.round(tide * 100)}% · wave ${waveHeightM} m · ${goods[0]?.label || "bare shore"}`,
    };
}

function shoreShrubRoll(seed, x, y) {
    return coarse(seed, x, y, 5, 0x53485242);
}

function shrubPotential(roll) {
    return roll > 0.58;
}

function tradePotential(use) {
    return (use.harbour ? 0.22 : 0) + (use.market ? 0.18 : 0) + (use.tradingPost ? 0.2 : 0);
}

export function coastGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "amber" || good.id === "pearls") return season !== "winter";
        return true;
    });
}

export function coastProductsAt(x, y, context = {}) {
    if (!isCoastSite(x, y, context)) return null;
    const profile = coastProfileAt(x, y, context);
    if (!profile?.coastal || profile.water.sea) return null;
    const goods = coastGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length && !profile.fauna.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function coastSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const works = ["fishingVillage", "harbour", "tradingPost", "fortress", "lighthouse", "shipyard", "saltworks", "market", "navalBase"]
        .filter(key => profile.use?.[key]);
    return `${profile.label} · ${profile.landform.label} · ${goods} · ${wildlife}`
        + (works.length ? " · works: " + works.join(", ") : "");
}

export function coastRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export function coastRequirementAudit(profile) {
    const present = new Set(profile?.features || []);
    return COAST_REQUIREMENTS.map(requirement => {
        const working = present.has(requirement.id);
        return { ...requirement, present: working, working };
    });
}

export const COAST_LIMITS = Object.freeze({
    requirements: COAST_REQUIREMENTS.length,
    formations: Object.keys(COAST_FORMATIONS).length,
    maxFauna: 8,
    maxGoods: 9,
    trees: Object.keys(COAST_TREES).length,
});
