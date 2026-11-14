// Savanna ecology (spec 1.2.10.1–1.2.10.48).
//
// Savanna is not dry grassland with a few trees painted on it. It is a
// fire-shaped, grazing-shaped landscape with a strong wet/dry pulse: tall and
// short grasses, scattered flat-crowned trees, thorn scrub, riparian corridors,
// seasonal pans and waterholes, termite mounds and rocky kopjes. The same
// deterministic profile drives terrain detail, gathering, farm/stable surveys,
// movement costs and the shared good ledger.
//
// No per-tile state and no extra tick loop are added. Every caller supplies
// seed, terrain, season, weather and land-use inputs and receives a bounded,
// pure profile.

import { seasonalState } from "./season.js";

export const SAVANNA_REQUIREMENTS = Object.freeze([
    { id: "1.2.10.1", key: "tall-grasses", label: "Tall grasses", group: "vegetation" },
    { id: "1.2.10.2", key: "short-grasses", label: "Short grazing grasses", group: "vegetation" },
    { id: "1.2.10.3", key: "scattered-trees", label: "Scattered trees", group: "vegetation" },
    { id: "1.2.10.4", key: "acacia", label: "Acacia and flat-crowned trees", group: "vegetation" },
    { id: "1.2.10.5", key: "baobab", label: "Baobab and water-storing trees", group: "vegetation" },
    { id: "1.2.10.6", key: "thorn-shrubs", label: "Thorn shrubs and thickets", group: "vegetation" },
    { id: "1.2.10.7", key: "seasonal-flowers", label: "Seasonal flowering plants", group: "vegetation" },
    { id: "1.2.10.8", key: "fire-adapted-grasses", label: "Fire-adapted grasses", group: "vegetation" },
    { id: "1.2.10.9", key: "flat-plains", label: "Broad flat plains", group: "landform" },
    { id: "1.2.10.10", key: "rolling-hills", label: "Rolling hills and low ridges", group: "landform" },
    { id: "1.2.10.11", key: "rocky-kopjes", label: "Rocky kopjes and outcrops", group: "landform" },
    { id: "1.2.10.12", key: "dry-riverbeds", label: "Dry riverbeds and sand channels", group: "water" },
    { id: "1.2.10.13", key: "seasonal-wetlands", label: "Seasonal wetlands and pans", group: "water" },
    { id: "1.2.10.14", key: "waterholes", label: "Waterholes and residual pools", group: "water" },
    { id: "1.2.10.15", key: "wet-season", label: "Distinct wet season", group: "climate" },
    { id: "1.2.10.16", key: "dry-season", label: "Long dry season", group: "climate" },
    { id: "1.2.10.17", key: "high-heat", label: "High daytime heat", group: "climate" },
    { id: "1.2.10.18", key: "drought-cycles", label: "Recurring drought cycles", group: "climate" },
    { id: "1.2.10.19", key: "seasonal-colour", label: "Strong seasonal colour change", group: "visual" },
    { id: "1.2.10.20", key: "green-flush", label: "Green flush after rain", group: "visual" },
    { id: "1.2.10.21", key: "golden-dry-grass", label: "Golden dry-season grass", group: "visual" },
    { id: "1.2.10.22", key: "wildlife-herds", label: "Large grazing herds", group: "fauna" },
    { id: "1.2.10.23", key: "elephants", label: "Elephants", group: "fauna" },
    { id: "1.2.10.24", key: "giraffes", label: "Giraffes", group: "fauna" },
    { id: "1.2.10.25", key: "antelope", label: "Antelope and gazelle", group: "fauna" },
    { id: "1.2.10.26", key: "zebra", label: "Zebra and wild equids", group: "fauna" },
    { id: "1.2.10.27", key: "big-cats", label: "Lions and other big cats", group: "fauna" },
    { id: "1.2.10.28", key: "hyenas", label: "Hyenas and scavengers", group: "fauna" },
    { id: "1.2.10.29", key: "vultures", label: "Vultures and carrion birds", group: "fauna" },
    { id: "1.2.10.30", key: "ground-birds", label: "Ostriches and ground birds", group: "fauna" },
    { id: "1.2.10.31", key: "termites", label: "Termites and mound builders", group: "fauna" },
    { id: "1.2.10.32", key: "migratory-wildlife", label: "Seasonal wildlife migration", group: "fauna" },
    { id: "1.2.10.33", key: "grain", label: "Sorghum, millet and grain", group: "economy" },
    { id: "1.2.10.34", key: "livestock", label: "Cattle and adapted livestock", group: "economy" },
    { id: "1.2.10.35", key: "hides", label: "Hides and leather", group: "economy" },
    { id: "1.2.10.36", key: "meat", label: "Meat and animal products", group: "economy" },
    { id: "1.2.10.37", key: "timber", label: "Scattered timber and fuel", group: "economy" },
    { id: "1.2.10.38", key: "gum-arabic", label: "Gum arabic and tree resin", group: "economy" },
    { id: "1.2.10.39", key: "medicinal-plants", label: "Medicinal plants", group: "economy" },
    { id: "1.2.10.40", key: "salt", label: "Salt and mineral licks", group: "economy" },
    { id: "1.2.10.41", key: "ivory-bone", label: "Ivory, bone and horn", group: "economy" },
    { id: "1.2.10.42", key: "fire-hazard", label: "Grass-fire danger", group: "hazard" },
    { id: "1.2.10.43", key: "drought-hazard", label: "Drought and failed pasture", group: "hazard" },
    { id: "1.2.10.44", key: "heat-exhaustion", label: "Heat exhaustion", group: "hazard" },
    { id: "1.2.10.45", key: "predator-danger", label: "Predator danger", group: "hazard" },
    { id: "1.2.10.46", key: "limited-water", label: "Limited and distant water", group: "hazard" },
    { id: "1.2.10.47", key: "flash-floods", label: "Flash floods in the wet season", group: "hazard" },
    { id: "1.2.10.48", key: "livestock-disease", label: "Livestock disease and biting flies", group: "hazard" },
]);

export const SAVANNA_REQUIREMENT_IDS = Object.freeze(SAVANNA_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(SAVANNA_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const SAVANNA_FORMATIONS = Object.freeze({
    "grass-plains": Object.freeze({
        id: "grass-plains", label: "Open grass plains", height: "flat",
        note: "a broad golden sea of grass with the horizon broken only by distant herds",
        grasses: ["red-oat-grass", "guinea-grass", "buffalo-grass"], shrubs: [], trees: [],
    }),
    "acacia-savanna": Object.freeze({
        id: "acacia-savanna", label: "Acacia savanna", height: "open",
        note: "flat-crowned acacias spaced across tall grass and grazing lawns",
        grasses: ["red-oat-grass", "star-grass", "guinea-grass"], shrubs: ["sickle-bush"], trees: ["umbrella-acacia", "camelthorn"],
    }),
    "baobab-grove": Object.freeze({
        id: "baobab-grove", label: "Baobab grove", height: "open",
        note: "massive water-storing trunks and bare, root-like crowns above dry grass",
        grasses: ["buffalo-grass", "star-grass"], shrubs: ["raisin-bush"], trees: ["baobab", "marula"],
    }),
    "riparian-corridor": Object.freeze({
        id: "riparian-corridor", label: "Riparian corridor", height: "wooded",
        note: "a green ribbon of fever trees and reed beds along a seasonal river",
        grasses: ["guinea-grass", "thatching-grass"], shrubs: ["wild-sage"], trees: ["fever-tree", "sausage-tree", "umbrella-acacia"],
    }),
    "dry-riverbed": Object.freeze({
        id: "dry-riverbed", label: "Dry riverbed", height: "flat",
        note: "pale sand, cracked mud and root-washed banks holding hidden water",
        grasses: ["star-grass", "buffalo-grass"], shrubs: ["thornbush"], trees: ["camelthorn"],
    }),
    "thorn-scrub": Object.freeze({
        id: "thorn-scrub", label: "Thorn scrub", height: "low",
        note: "dense wait-a-bit thorn and raisin bush over short grazed turf",
        grasses: ["buffalo-grass", "star-grass"], shrubs: ["thornbush", "sickle-bush", "raisin-bush"], trees: ["camelthorn"],
    }),
    "termite-mound-field": Object.freeze({
        id: "termite-mound-field", label: "Termite-mound field", height: "flat",
        note: "red earth spires, close-cropped lawns and rings of enriched grass",
        grasses: ["star-grass", "red-oat-grass"], shrubs: ["wild-sage"], trees: ["marula"],
    }),
    "seasonal-pan": Object.freeze({
        id: "seasonal-pan", label: "Seasonal pan", height: "flat",
        note: "a shallow clay basin that turns from dust to mirror to mud",
        grasses: ["thatching-grass", "star-grass"], shrubs: ["thornbush"], trees: [],
    }),
    "burned-grassland": Object.freeze({
        id: "burned-grassland", label: "Burned grassland", height: "flat",
        note: "black ash, charred stems and the first bright green shoots of regrowth",
        grasses: ["red-oat-grass", "guinea-grass"], shrubs: ["thornbush"], trees: ["umbrella-acacia"],
    }),
    "rocky-kopje": Object.freeze({
        id: "rocky-kopje", label: "Rocky kopje", height: "high",
        note: "piled granite boulders, deep shade and a thin fringe of grass and scrub",
        grasses: ["buffalo-grass", "star-grass"], shrubs: ["wild-sage", "thornbush"], trees: ["sausage-tree", "marula"],
    }),
});


// Species records for the shared forest stand model. Savanna trees are not a
// closed canopy, but their timber, foliage and growth form must resolve through
// the same vocabulary as every other woodland.
export const SAVANNA_SPECIES = Object.freeze({
    acacia: Object.freeze({
        id: "acacia", label: "Umbrella acacia", latin: "Vachellia tortilis",
        bark: "#5e4932", barkLight: "#8f704d",
        summer: ["#778c45", "#a2b16a"], autumn: ["#a08d58", "#c3ac75"],
        form: "spreading", leafShape: "compound", height: 0.82, crown: 1.16, trunk: 0.7, lobes: 2,
        timber: 0.78, firewood: 1.04, charcoal: 1.1, wood: "acacia-timber",
        goods: ["gum-arabic", "firewood", "timber"], understory: ["grass", "thorn", "herb"],
    }),
    camelthorn: Object.freeze({
        id: "camelthorn", label: "Camelthorn", latin: "Vachellia erioloba",
        bark: "#53402f", barkLight: "#836549",
        summer: ["#758742", "#9ca75e"], autumn: ["#9c8952", "#bfa46a"],
        form: "spreading", leafShape: "compound", height: 0.86, crown: 1.02, trunk: 0.82, lobes: 2,
        timber: 0.92, firewood: 1.12, charcoal: 1.18, wood: "camelthorn-timber",
        goods: ["gum-arabic", "firewood", "timber"], understory: ["grass", "thorn"],
    }),
    marula: Object.freeze({
        id: "marula", label: "Marula", latin: "Sclerocarya birrea",
        bark: "#71604a", barkLight: "#9d896a",
        summer: ["#7d9746", "#a9b66b"], autumn: ["#b09c48", "#cfb968"],
        form: "dome", leafShape: "oval", height: 0.74, crown: 0.94, trunk: 0.7, lobes: 2,
        timber: 0.74, firewood: 0.96, charcoal: 0.9, wood: "marula-timber",
        goods: ["marula-fruit", "firewood", "timber"], understory: ["grass", "herb"],
    }),
    "fever-tree": Object.freeze({
        id: "fever-tree", label: "Fever tree", latin: "Vachellia xanthophloea",
        bark: "#a99a63", barkLight: "#cfc58e",
        summer: ["#82a047", "#abbd68"], autumn: ["#ada34f", "#cbbd71"],
        form: "spreading", leafShape: "compound", height: 0.9, crown: 0.9, trunk: 0.76, lobes: 2,
        timber: 0.82, firewood: 0.94, charcoal: 0.86, wood: "fever-tree-timber",
        goods: ["gum-arabic", "timber", "firewood"], understory: ["grass", "reed", "herb"],
    }),
    baobab: Object.freeze({
        id: "baobab", label: "Baobab", latin: "Adansonia digitata",
        bark: "#83715a", barkLight: "#a9957a",
        summer: ["#6e843f", "#94a75c"], autumn: ["#9c8a4b", "#bdab69"],
        form: "spreading", leafShape: "compound", height: 0.94, crown: 1.12, trunk: 1.48, lobes: 2,
        timber: 0.58, firewood: 0.78, charcoal: 0.7, wood: "baobab-timber",
        goods: ["baobab-fruit", "baobab-fibre", "firewood"], understory: ["grass", "herb"],
    }),
});

export const SAVANNA_GRASSES = Object.freeze({
    "red-oat-grass": Object.freeze({ id: "red-oat-grass", label: "Red oat grass", height: "tall", colours: ["#b08a47", "#d8bb74"], goods: ["hay", "thatching-grass"], fireAdapted: true }),
    "guinea-grass": Object.freeze({ id: "guinea-grass", label: "Guinea grass", height: "tall", colours: ["#9a8c46", "#c9b970"], goods: ["hay", "meadow-grass"], fireAdapted: true }),
    "star-grass": Object.freeze({ id: "star-grass", label: "Star grass", height: "short", colours: ["#8e964c", "#c4bd6d"], goods: ["meadow-grass"], grazing: true }),
    "buffalo-grass": Object.freeze({ id: "buffalo-grass", label: "Buffalo grass", height: "short", colours: ["#8a8d4c", "#b5ad6a"], goods: ["hay"], grazing: true, fireAdapted: true }),
    "thatching-grass": Object.freeze({ id: "thatching-grass", label: "Thatching grass", height: "tall", colours: ["#b39352", "#e0c987"], goods: ["thatching-grass"], fireAdapted: true }),
});

export const SAVANNA_SHRUBS = Object.freeze({
    thornbush: Object.freeze({ id: "thornbush", label: "Wait-a-bit thorn", goods: ["firewood", "thorn-branches"], colours: ["#6f7142", "#9a9459"] }),
    "sickle-bush": Object.freeze({ id: "sickle-bush", label: "Sickle bush", goods: ["firewood", "savanna-herb"], colours: ["#74773f", "#a7a25e"] }),
    "wild-sage": Object.freeze({ id: "wild-sage", label: "Wild sage", goods: ["savanna-herb"], colours: ["#7d8352", "#aeb078"] }),
    "raisin-bush": Object.freeze({ id: "raisin-bush", label: "Raisin bush", goods: ["marula-fruit", "firewood"], colours: ["#67743e", "#969c58"] }),
});

export const SAVANNA_HERBS = Object.freeze({
    "savanna-sage": Object.freeze({ id: "savanna-sage", label: "Savanna sage", seasons: ["spring", "summer"], medicine: true, colour: "#a4a77a" }),
    "wild-basil": Object.freeze({ id: "wild-basil", label: "Wild basil", seasons: ["spring", "summer", "autumn"], medicine: true, colour: "#8f9c69" }),
    "devils-claw": Object.freeze({ id: "devils-claw", label: "Devil's claw", seasons: ["summer", "autumn"], medicine: true, colour: "#a89a72" }),
});

export const SAVANNA_FLOWERS = Object.freeze({
    "fire-lily": Object.freeze({ id: "fire-lily", label: "Fire lily", seasons: ["spring", "autumn"], colours: ["#d4653b", "#efa177"] }),
    "rain-lily": Object.freeze({ id: "rain-lily", label: "Rain lily", seasons: ["spring"], colours: ["#e4d7b2", "#f6efd8"] }),
    aloe: Object.freeze({ id: "aloe", label: "Aloe", seasons: ["winter", "spring"], colours: ["#cf7a3a", "#e9aa69"] }),
    hibiscus: Object.freeze({ id: "hibiscus", label: "Wild hibiscus", seasons: ["summer", "autumn"], colours: ["#c86e66", "#e6a59d"] }),
    "carrion-flower": Object.freeze({ id: "carrion-flower", label: "Carrion flower", seasons: ["autumn"], colours: ["#8d6b52", "#b69578"] }),
});

export const SAVANNA_TREES = Object.freeze({
    "umbrella-acacia": Object.freeze({
        id: "umbrella-acacia", label: "Umbrella acacia", kind: "acacia", heightMeters: 9, crown: 0.86,
        colours: { spring: "#8d9c52", summer: "#778c45", autumn: "#b19a54", winter: "#a08d58" },
        goods: ["gum-arabic", "firewood", "timber"],
    }),
    camelthorn: Object.freeze({
        id: "camelthorn", label: "Camelthorn", kind: "acacia", heightMeters: 11, crown: 0.74,
        colours: { spring: "#8b994f", summer: "#758742", autumn: "#ac9450", winter: "#9c8952" },
        goods: ["gum-arabic", "firewood", "timber"],
    }),
    baobab: Object.freeze({
        id: "baobab", label: "Baobab", kind: "baobab", heightMeters: 16, crown: 0.8,
        colours: { spring: "#7f9049", summer: "#6e843f", autumn: "#9c8a4b", winter: "#8b7b4c" },
        goods: ["baobab-fruit", "baobab-fibre", "firewood"],
    }),
    "fever-tree": Object.freeze({
        id: "fever-tree", label: "Fever tree", kind: "acacia", heightMeters: 14, crown: 0.68,
        colours: { spring: "#9bab58", summer: "#82a047", autumn: "#ada34f", winter: "#9c9a58" },
        goods: ["gum-arabic", "timber", "firewood"],
    }),
    marula: Object.freeze({
        id: "marula", label: "Marula", kind: "broadleaf", heightMeters: 10, crown: 0.72,
        colours: { spring: "#95a653", summer: "#7d9746", autumn: "#b09c48", winter: "#a08d52" },
        goods: ["marula-fruit", "firewood", "timber"],
    }),
    "sausage-tree": Object.freeze({
        id: "sausage-tree", label: "Sausage tree", kind: "broadleaf", heightMeters: 13, crown: 0.7,
        colours: { spring: "#8fa353", summer: "#789346", autumn: "#a89a4e", winter: "#978b56" },
        goods: ["savanna-herb", "firewood", "timber"],
    }),
});

export const SAVANNA_FAUNA = Object.freeze({
    elephant: Object.freeze({ id: "elephant", label: "Elephant", group: "herbivore", kind: "elephant", seasons: ["spring", "summer", "autumn", "winter"], herd: true, migratory: true }),
    giraffe: Object.freeze({ id: "giraffe", label: "Giraffe", group: "herbivore", kind: "giraffe", seasons: ["spring", "summer", "autumn", "winter"], herd: true }),
    zebra: Object.freeze({ id: "zebra", label: "Zebra", group: "herbivore", kind: "zebra", seasons: ["spring", "summer", "autumn", "winter"], herd: true, migratory: true }),
    wildebeest: Object.freeze({ id: "wildebeest", label: "Wildebeest", group: "herbivore", kind: "wildebeest", seasons: ["spring", "summer", "autumn", "winter"], herd: true, migratory: true }),
    impala: Object.freeze({ id: "impala", label: "Impala", group: "herbivore", kind: "antelope", seasons: ["spring", "summer", "autumn", "winter"], herd: true }),
    gazelle: Object.freeze({ id: "gazelle", label: "Gazelle", group: "herbivore", kind: "antelope", seasons: ["spring", "summer", "autumn", "winter"], herd: true }),
    lion: Object.freeze({ id: "lion", label: "Lion", group: "predator", kind: "cat", seasons: ["spring", "summer", "autumn", "winter"] }),
    cheetah: Object.freeze({ id: "cheetah", label: "Cheetah", group: "predator", kind: "cat", seasons: ["spring", "summer", "autumn", "winter"] }),
    hyena: Object.freeze({ id: "hyena", label: "Hyena", group: "predator", kind: "hyena", seasons: ["spring", "summer", "autumn", "winter"] }),
    vulture: Object.freeze({ id: "vulture", label: "Vulture", group: "bird", kind: "vulture", seasons: ["spring", "summer", "autumn", "winter"] }),
    ostrich: Object.freeze({ id: "ostrich", label: "Ostrich", group: "bird", kind: "ostrich", seasons: ["spring", "summer", "autumn", "winter"], groundBird: true }),
    "guinea-fowl": Object.freeze({ id: "guinea-fowl", label: "Guinea fowl", group: "bird", kind: "ground-bird", seasons: ["spring", "summer", "autumn", "winter"], groundBird: true }),
    termite: Object.freeze({ id: "termite", label: "Termite", group: "insect", kind: "termite", seasons: ["spring", "summer", "autumn", "winter"] }),
    "dung-beetle": Object.freeze({ id: "dung-beetle", label: "Dung beetle", group: "insect", kind: "beetle", seasons: ["spring", "summer", "autumn"] }),
    baboon: Object.freeze({ id: "baboon", label: "Baboon", group: "small", kind: "baboon", seasons: ["spring", "summer", "autumn", "winter"] }),
});

// Only genuinely new goods live here. Meat, hides, game, firewood, timber,
// hay, thatch, stone and wool reuse the shared catalogue.
export const SAVANNA_GOODS = Object.freeze({
    sorghum: Object.freeze({ id: "sorghum", label: "Sorghum", category: "gather" }),
    millet: Object.freeze({ id: "millet", label: "Millet", category: "gather" }),
    "gum-arabic": Object.freeze({ id: "gum-arabic", label: "Gum arabic", category: "gather" }),
    "marula-fruit": Object.freeze({ id: "marula-fruit", label: "Marula fruit", category: "gather" }),
    "baobab-fruit": Object.freeze({ id: "baobab-fruit", label: "Baobab fruit", category: "gather" }),
    "baobab-fibre": Object.freeze({ id: "baobab-fibre", label: "Baobab fibre", category: "fibre" }),
    "savanna-salt": Object.freeze({ id: "savanna-salt", label: "Savanna salt", category: "material" }),
    "savanna-herb": Object.freeze({ id: "savanna-herb", label: "Savanna herbs", category: "medicine" }),
    "thorn-branches": Object.freeze({ id: "thorn-branches", label: "Thorn branches", category: "material" }),
    ivory: Object.freeze({ id: "ivory", label: "Ivory and bone", category: "material" }),
    charcoal: Object.freeze({ id: "charcoal", label: "Charcoal", category: "material" }),
    "termite-earth": Object.freeze({ id: "termite-earth", label: "Termite earth", category: "material" }),
    "thatching-grass": Object.freeze({ id: "thatching-grass", label: "Thatching grass", category: "material" }),
    meat: Object.freeze({ id: "meat", label: "Meat", category: "food" }),
    "acacia-timber": Object.freeze({ id: "acacia-timber", label: "Acacia timber", category: "wood" }),
    "camelthorn-timber": Object.freeze({ id: "camelthorn-timber", label: "Camelthorn timber", category: "wood" }),
    "marula-timber": Object.freeze({ id: "marula-timber", label: "Marula timber", category: "wood" }),
    "fever-tree-timber": Object.freeze({ id: "fever-tree-timber", label: "Fever-tree timber", category: "wood" }),
    "baobab-timber": Object.freeze({ id: "baobab-timber", label: "Baobab timber", category: "wood" }),
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
    const grazed = Boolean(explicit.grazed || state === "grazed" || state === "overgrazed");
    return {
        ...explicit, state, grazed,
        overgrazed: Boolean(explicit.overgrazed || state === "overgrazed"),
        wild: Boolean(explicit.wild || state === "wild" || state === "feral"),
        trampled: Boolean(explicit.trampled || state === "trampled"),
        path: Boolean(explicit.path || state === "path"),
        settled: Boolean(explicit.settled || explicit.settlement || state === "settled"),
        burned: Boolean(explicit.burned || state === "burned"),
        bareSoil: Boolean(explicit.bareSoil || grazed || state === "trampled"),
        intensity: clamp01(explicit.intensity ?? (grazed ? 0.62 : explicit.trampled ? 0.8 : 0.12)),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (grazed ? "grazed savanna pasture" : explicit.trampled
            ? "trampled savanna ground" : "open savanna"),
    };
}

function mixColour(from, to, amount) {
    const t = clamp01(amount);
    return [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
    ];
}

function hexColour(rgb) {
    return "#" + rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

function chooseFormation(scores) {
    if (scores.kopje > 0.64) return "rocky-kopje";
    if (scores.pan > 0.7) return "seasonal-pan";
    if (scores.riverbed > 0.72) return "dry-riverbed";
    if (scores.riparian > 0.64) return "riparian-corridor";
    if (scores.burned > 0.7) return "burned-grassland";
    if (scores.mound > 0.7) return "termite-mound-field";
    if (scores.baobab > 0.62) return "baobab-grove";
    if (scores.thorn > 0.64) return "thorn-scrub";
    if (scores.acacia > 0.48) return "acacia-savanna";
    return "grass-plains";
}

function buildFlowers(seed, x, y, season, bloom) {
    if (bloom <= 0.045) return [];
    const pool = Object.values(SAVANNA_FLOWERS).filter(flower => flower.seasons.includes(season));
    if (!pool.length) return [];
    const count = 1 + Math.floor(unit(seed, x, y, 0x464c4f58) * (bloom > 0.38 ? 3 : 2));
    const chosen = [];
    for (let index = 0; index < count; index++) {
        const flower = pick(seed, x + index * 3, y - index, pool, 0x464c4f59 + index);
        if (flower && !chosen.some(entry => entry.id === flower.id)) chosen.push(flower);
    }
    return chosen;
}

function buildTrees(seed, x, y, formation, season, treeScore, wet) {
    if (!formation.trees.length) return [];
    // Scattered is the defining density. Even the riparian corridor is a ribbon
    // of trees, not a closed canopy; the flat-crowned silhouette needs sky.
    const chance = formation.id === "riparian-corridor" ? 0.9
        : formation.id === "baobab-grove" ? 0.82
            : formation.id === "acacia-savanna" ? 0.7
                : formation.id === "thorn-scrub" ? 0.34 : 0.24;
    const roll = unit(seed, x, y, 0x54524545);
    // Formations named after a tree always show that tree. The reference and
    // the survey must never call a tile an acacia savanna while it renders as
    // bare grass; the remaining stems stay random and scattered.
    const signature = formation.id === "baobab-grove" ? "baobab"
        : formation.id === "acacia-savanna" ? "umbrella-acacia"
            : formation.id === "riparian-corridor" ? "fever-tree"
                : formation.id === "dry-riverbed" ? "camelthorn"
                    : formation.id === "rocky-kopje" ? "sausage-tree" : null;
    if (roll > chance * (0.82 + treeScore * 0.24) && !signature) return [];
    // Groves and riverside strips carry two or three stems per tile; open
    // plains keep one or none. The density stays tile-scattered, never a wall.
    const count = roll < chance * 0.18 ? 3 : roll < chance * 0.62 ? 2 : 1;
    const trees = [];
    for (let index = 0; index < count; index++) {
        // A baobab grove always contains its namesake: a grove of only marula
        // would make the formation label and the visible state disagree.
        const treeId = signature && index === 0
            ? signature : pick(seed, x + index, y, formation.trees, 0x54524546 + index);
        const tree = SAVANNA_TREES[treeId];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x54524547) - 0.5) * 0.6,
            offsetY: (unit(seed, x, y + index, 0x54524548) - 0.5) * 0.36,
            scale: 0.7 + unit(seed, x, y + index, 0x54524549) * 0.4,
            seasonColour: tree.colours[season] || tree.colours.summer,
            flowering: wet > 0.36 && (season === "spring" || season === "summer") && unit(seed, x, y + index, 0x424c4f4f) > 0.58,
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, cover, water, openness, wet, heat, use } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = SAVANNA_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(12, Math.round(count))) });
    };
    if (openness > 0.3 && unit(seed, x, y, 0x454c4550) > (wet > 0.4 ? 0.35 : 0.55)) add("elephant", 2 + Math.floor(unit(seed, x, y, 0x454c4532) * 4));
    if (cover > 0.3 && unit(seed, x, y, 0x47495241) > 0.46) add("giraffe", 2);
    if (openness > 0.22 && unit(seed, x, y, 0x5a454252) > 0.3) add("zebra", 4 + Math.floor(unit(seed, x, y, 0x5a454232) * 6));
    if (openness > 0.25 && unit(seed, x, y, 0x57494c44) > 0.34) add("wildebeest", 5 + Math.floor(unit(seed, x, y, 0x57494c32) * 7));
    if (cover > 0.16 && unit(seed, x, y, 0x494d5041) > 0.34) add("impala", 4);
    if (openness > 0.35 && unit(seed, x, y, 0x47415a45) > 0.52) add("gazelle", 3);
    if (unit(seed, x, y, 0x4c494f4e) > 0.6) add("lion");
    if (openness > 0.4 && unit(seed, x, y, 0x43484545) > 0.7) add("cheetah");
    if (unit(seed, x, y, 0x4859454e) > 0.54) add("hyena", 2);
    if (heat > 0.4 && unit(seed, x, y, 0x56554c54) > 0.48) add("vulture", 2);
    if (openness > 0.24 && unit(seed, x, y, 0x4f535452) > 0.42) add("ostrich", 2);
    if (cover > 0.1 && unit(seed, x, y, 0x4746494e) > 0.38) add("guinea-fowl", 3);
    if (unit(seed, x, y, 0x5445524d) > 0.3) add("termite", 2);
    if (season !== "winter" && unit(seed, x, y, 0x42454554) > 0.58) add("dung-beetle");
    if ((cover > 0.22 || water > 0.2) && unit(seed, x, y, 0x4241424f) > 0.62) add("baboon", 2);
    // A grazing lawn beside water is where herds concentrate in the dry season.
    if ((use.grazed || water > 0.28) && openness > 0.2 && fauna.some(entry => entry.id === "wildebeest")) {
        const herd = fauna.find(entry => entry.id === "wildebeest");
        herd.count = Math.min(12, herd.count + 3);
    }
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { season, wet, dry, water, grass, trees, shrubs, fauna, salt, burned, termites, use, grain } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.06 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    if (grain > 0.28) add(grain > 0.5 ? "sorghum" : "millet", grain > 0.5 ? "Sorghum" : "Millet", "gather", 0.26 + grain * 0.3);
    if (grass.some(entry => entry.grazing)) add("meadow-grass", "Meadow grass", "gather", 0.3 + wet * 0.22);
    if (grass.some(entry => entry.id === "red-oat-grass" || entry.id === "guinea-grass")) add("hay", "Hay", "gather", 0.32 + (1 - dry) * 0.2);
    if (grass.some(entry => entry.id === "thatching-grass")) add("thatching-grass", "Thatching grass", "material", 0.36);
    if (trees.some(tree => tree.kind === "acacia")) add("gum-arabic", "Gum arabic", "gather", 0.34 + (dry > 0.4 ? 0.16 : 0));
    if (trees.some(tree => tree.id === "marula") && season !== "winter") add("marula-fruit", "Marula fruit", "gather", 0.4);
    if (trees.some(tree => tree.id === "baobab")) {
        add("baobab-fruit", "Baobab fruit", "gather", 0.44);
        add("baobab-fibre", "Baobab fibre", "fibre", 0.32);
    }
    if (trees.length || shrubs.length) add("firewood", "Firewood", "material", 0.3 + trees.length * 0.08);
    if (trees.some(tree => tree.goods.includes("timber"))) add("timber", "Timber", "material", 0.26);
    if (shrubs.some(entry => entry.id === "thornbush")) add("thorn-branches", "Thorn branches", "material", 0.32);
    if (shrubs.some(entry => entry.id === "raisin-bush" || entry.id === "sickle-bush") || wet > 0.36) {
        add("savanna-herb", "Savanna herbs", "medicine", 0.26 + wet * 0.18);
    }
    if (salt > 0.42) add("savanna-salt", "Savanna salt", "material", salt * 0.66);
    if (fauna.some(entry => entry.group === "herbivore")) add("game", "Wild game", "hunt", 0.32 + wet * 0.1);
    if (fauna.some(entry => entry.group === "herbivore")) add("meat", "Meat", "food", 0.3);
    if (fauna.some(entry => entry.group === "herbivore" || entry.group === "predator")) add("hides", "Hides", "hunt", 0.3);
    if (fauna.some(entry => entry.id === "elephant")) add("ivory", "Ivory and bone", "material", 0.22);
    if (fauna.some(entry => entry.group === "predator")) add("bone", "Bone and horn", "material", 0.18);
    if (burned) add("charcoal", "Charcoal", "material", 0.34);
    if (termites) add("termite-earth", "Termite earth", "material", 0.24);
    if (use.grazed) add("wool", "Wool", "fibre", 0.18);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

/**
 * How strongly a tile belongs to the savanna. Savanna is the dedicated
 * tropical-grassland climate; tropical rainforest, arid desert and temperate
 * grasslands keep their established ecology, so existing saves render exactly
 * as before.
 */
export function savannaPotentialAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const climate = context.climate || "temperate";
    if (climate !== "savanna") return 0;
    const height = clamp01(context.height ?? 0.42);
    const temperature = clamp01(context.temperature ?? 0.72);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height < seaLevel + 0.008 || height > 0.94) return 0;
    const warmth = smoothstep(0.44, 0.62, temperature);
    const roll = coarse(seed, x, y, 6, 0x53415641);
    return clamp01(0.72 + warmth * 0.2 + roll * 0.1);
}

export function isSavannaSite(x, y, context = {}) {
    return savannaPotentialAt(x, y, context) > 0.24;
}

/**
 * Derive the complete savanna profile for one tile. Pure and deterministic for
 * the same inputs; `use` is optional and comes from real buildings and roads.
 */
export function savannaProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.46);
    const temperature = clamp01(context.temperature ?? 0.72);
    const height = clamp01(context.height ?? 0.42);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "savanna";
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, climate === "savanna" ? "savanna" : climate);
    const use = normalizeUse(context.use);
    const aboveSea = Math.max(0, height - seaLevel);
    const relief = coarse(seed, x, y, 7, 0x52454c49);
    const wetRoll = coarse(seed, x, y, 5, 0x5745544c);
    const rockRoll = coarse(seed, x, y, 6, 0x524f434b);
    const treeRoll = coarse(seed, x, y, 4, 0x54524545);
    const shrubRoll = coarse(seed, x, y, 4, 0x53485242);
    const burnRoll = coarse(seed, x, y, 5, 0x4255524e);
    const moundRoll = coarse(seed, x, y, 6, 0x4d4f554e);
    const saltRoll = coarse(seed, x, y, 7, 0x53414c54);
    const riverRoll = coarse(seed, x, y, 3, 0x52495652);

    // The wet season is a short, intense pulse. The long dry season is the
    // default state, not the exception; this asymmetry is what makes savanna
    // savanna rather than a warm meadow.
    const wetPulse = smoothstep(34, 74, dayOfYear) * (1 - smoothstep(174, 218, dayOfYear));
    const wetSeason = clamp01(wetPulse * (0.52 + moisture * 0.48) + wetRoll * 0.12);
    const drySeason = clamp01(1 - wetSeason * 1.18 + (moisture < 0.38 ? 0.12 : 0));
    const drought = clamp01(drySeason * (0.48 + (1 - moisture) * 0.38) + (year % 4 === 0 ? 0.12 : 0));
    const heat = clamp01(base.warmth * 0.7 + smoothstep(0.58, 0.82, temperature) * 0.34 + (hour >= 10 && hour <= 16 ? 0.12 : 0));
    const fireSeason = clamp01((dayOfYear > 220 && dayOfYear < 340 ? 0.62 : 0.14) + drySeason * 0.32);
    const burnScar = clamp01(fireSeason * (0.38 + drySeason * 0.42) * (0.55 + burnRoll * 0.7) - 0.16 + (use.burned ? 0.4 : 0));
    const burned = burnScar > 0.48;

    const flat = 1 - smoothstep(0.1, 0.28, aboveSea);
    const hill = relief > 0.62 && aboveSea > 0.09;
    const kopje = rockRoll > 0.66 && aboveSea > 0.08 && relief > 0.52;
    const lowGround = aboveSea < 0.06;
    const pan = clamp01(smoothstep(0.5, 0.72, moisture) * flat * 0.7 + wetSeason * 0.22
        + (wetRoll > 0.7 ? 0.12 : 0) - aboveSea * 0.18);
    const dryRiverbed = clamp01((1 - smoothstep(0.05, 0.1, aboveSea)) * (0.3 + riverRoll * 0.8) - 0.18);
    const river = dryRiverbed > 0.4 || (moisture > 0.56 && lowGround && riverRoll > 0.38);
    const waterhole = clamp01((pan > 0.38 ? pan * 0.7 : 0) + wetSeason * 0.30 + dryRiverbed * 0.22
        + (moisture > 0.5 ? 0.1 : 0) - drought * 0.34);
    const standingWater = waterhole > 0.3 && (wetSeason > 0.3 || waterhole > 0.52);
    const waterDepthCm = standingWater ? Math.round(14 + waterhole * 58) : 0;
    const wetland = clamp01(pan * 0.78 + wetSeason * 0.18 - drought * 0.16);
    const termites = moundRoll > 0.68 && aboveSea > 0.015 && !kopje;
    const moundCount = termites ? 2 + Math.floor(unit(seed, x, y, 0x4d4f554e) * 4) : 0;

    const grassCover = clamp01(0.34 + wetSeason * 0.34 - drySeason * 0.2 + moisture * 0.18 - use.intensity * 0.16);
    const tree = clamp01(treeRoll * 0.46 + moisture * 0.22 + (1 - fireSeason) * 0.14 - drought * 0.1);
    const acacia = clamp01(tree * 0.8 + drySeason * 0.16 + treeRoll * 0.14);
    const baobab = clamp01((relief > 0.45 ? 0.2 : 0.08) + treeRoll * 0.32 + drySeason * 0.22 - wetSeason * 0.16);
    const thorn = clamp01(shrubRoll * 0.42 + drySeason * 0.26 + use.intensity * 0.14 + (1 - grassCover) * 0.14);
    const riparian = clamp01(river ? 0.7 + moisture * 0.2 : 0.06 + moisture * 0.18);
    const rocky = clamp01(rockRoll * 0.6 + aboveSea * 0.6 + (kopje ? 0.38 : 0));
    const salt = clamp01(saltRoll * 0.42 + pan * 0.3 + drySeason * 0.22 + (lowGround ? 0.12 : 0));
    const formation = SAVANNA_FORMATIONS[chooseFormation({
        kopje: kopje ? 1 : rocky * 0.5,
        pan: pan, riverbed: dryRiverbed, riparian, burned: burnScar,
        mound: termites ? 0.8 : 0, baobab, thorn, acacia, tree,
    })];

    const grasses = formation.grasses.map(id => SAVANNA_GRASSES[id]).filter(Boolean);
    const shrubs = formation.shrubs.map(id => SAVANNA_SHRUBS[id]).filter(Boolean);
    const trees = buildTrees(seed, x, y, formation, season, tree, wetSeason);
    const herbs = Object.values(SAVANNA_HERBS).filter(herb => herb.seasons.includes(season))
        .filter((entry, index) => unit(seed, x, y, 0x48455242 + index) > 0.55 - grassCover * 0.26);
    const bloom = clamp01((wetSeason * 0.8 + (season === "spring" ? 0.24 : season === "autumn" ? 0.12 : 0.06))
        * (0.4 + base.greenUp * 0.4) * (0.55 + moisture * 0.3) * (1 - burned * 0.5) + (season === "winter" ? 0.12 : 0));
    const flowers = buildFlowers(seed, x, y, season, bloom);
    const cover = clamp01(grassCover * 0.58 + trees.length * 0.08 + shrubs.length * 0.06 + riparian * 0.14 - burned * 0.18);
    const fauna = buildFauna(seed, x, y, {
        season, cover, water: waterhole, openness: clamp01((1 - cover) * 0.7 + grassCover * 0.2 + 0.2),
        wet: wetSeason, heat, use,
    });
    const livestock = clamp01(0.24 + grassCover * 0.34 + (1 - thorn) * 0.12 + (fauna.some(entry => entry.id === "wildebeest") ? 0.12 : 0)
        + (use.grazed ? 0.14 : 0) - drought * 0.14);
    const agriculture = clamp01(0.18 + wetSeason * 0.3 + moisture * 0.2 + (1 - rocky) * 0.12 - drought * 0.18 - use.intensity * 0.08);
    const grain = clamp01(agriculture * 0.82 + wetSeason * 0.14 - burned * 0.2);
    const goods = buildGoods(seed, x, y, {
        season, wet: wetSeason, dry: drySeason, water: waterhole, grass: grasses, trees, shrubs,
        fauna, salt, burned, termites, use, grain,
    });
    const tsetse = clamp01(wetSeason * 0.52 + riparian * 0.32 + moisture * 0.2);
    const predators = clamp01(fauna.filter(entry => entry.group === "predator").length * 0.24 + cover * 0.22);
    const fireRisk = clamp01(fireSeason * (0.5 + grassCover * 0.44) + (weather === "storm" ? 0.08 : 0) + wind * 0.06);
    const droughtRisk = clamp01(drought * (0.62 + drySeason * 0.3));
    const heatRisk = clamp01(heat * 0.7 + (hour >= 12 && hour <= 15 ? 0.12 : 0));
    const floodRisk = clamp01(wetSeason * (0.46 + pan * 0.4) + (weather === "storm" || weather === "rain" ? 0.1 : 0));
    const waterScarcity = clamp01(drySeason * 0.62 + (1 - waterhole) * 0.32 - moisture * 0.1);
    const disease = clamp01(tsetse * 0.72 + wetSeason * 0.12);
    const movement = clamp01(1 - floodRisk * 0.2 - drought * 0.12 - (burned ? 0.08 : 0) - thorn * 0.08 + (use.path ? 0.1 : 0));
    const forage = clamp01(grassCover * (0.58 + wetSeason * 0.4) - drought * 0.28 - use.intensity * 0.14 - burned * 0.2);
    const timber = clamp01(trees.filter(entry => entry.goods.includes("timber")).length * 0.22 + (trees.length ? 0.14 : 0));
    const fuel = clamp01(timber * 0.8 + shrubs.length * 0.1 + 0.08);
    const visibility = clamp01(0.5 + (1 - cover) * 0.32 - drySeason * 0.08 + (weather === "clear" ? 0.1 : 0));

    const features = new Set();
    const mark = (...ids) => { for (const id of ids) features.add(id); };
    if (grasses.some(entry => entry.height === "tall")) mark("1.2.10.1");
    if (grasses.some(entry => entry.height === "short")) mark("1.2.10.2");
    if (trees.length) mark("1.2.10.3");
    if (trees.some(entry => entry.kind === "acacia")) mark("1.2.10.4");
    if (trees.some(entry => entry.kind === "baobab")) mark("1.2.10.5");
    if (shrubs.length) mark("1.2.10.6");
    if (flowers.length) mark("1.2.10.7");
    if (grasses.some(entry => entry.fireAdapted)) mark("1.2.10.8");
    if (flat > 0.5) mark("1.2.10.9");
    if (hill || relief > 0.5) mark("1.2.10.10");
    if (kopje) mark("1.2.10.11");
    if (dryRiverbed > 0.34) mark("1.2.10.12");
    if (wetland > 0.24) mark("1.2.10.13");
    if (waterhole > 0.3) mark("1.2.10.14");
    if (wetSeason > 0.3) mark("1.2.10.15");
    if (drySeason > 0.5) mark("1.2.10.16");
    if (heat > 0.45) mark("1.2.10.17");
    if (drought > 0.46) mark("1.2.10.18");
    if (Math.abs(wetSeason - drySeason) > 0.32) mark("1.2.10.19");
    if (grassCover > 0.42 && wetSeason > 0.3) mark("1.2.10.20");
    if (drySeason > 0.4 && grassCover > 0.2) mark("1.2.10.21");
    if (fauna.some(entry => entry.herd && entry.group === "herbivore")) mark("1.2.10.22");
    if (fauna.some(entry => entry.id === "elephant")) mark("1.2.10.23");
    if (fauna.some(entry => entry.id === "giraffe")) mark("1.2.10.24");
    if (fauna.some(entry => entry.id === "impala" || entry.id === "gazelle")) mark("1.2.10.25");
    if (fauna.some(entry => entry.id === "zebra")) mark("1.2.10.26");
    if (fauna.some(entry => entry.id === "lion" || entry.id === "cheetah")) mark("1.2.10.27");
    if (fauna.some(entry => entry.id === "hyena")) mark("1.2.10.28");
    if (fauna.some(entry => entry.id === "vulture")) mark("1.2.10.29");
    if (fauna.some(entry => entry.groundBird)) mark("1.2.10.30");
    if (termites || fauna.some(entry => entry.id === "termite")) mark("1.2.10.31");
    if (fauna.some(entry => entry.migratory)) mark("1.2.10.32");
    if (grain > 0.28 || goods.some(good => good.id === "sorghum" || good.id === "millet")) mark("1.2.10.33");
    if (livestock > 0.34) mark("1.2.10.34");
    if (fauna.some(entry => entry.group === "herbivore")) mark("1.2.10.35");
    if (fauna.some(entry => entry.group === "herbivore")) mark("1.2.10.36");
    if (timber > 0.16) mark("1.2.10.37");
    if (goods.some(good => good.id === "gum-arabic")) mark("1.2.10.38");
    if (goods.some(good => good.id === "savanna-herb")) mark("1.2.10.39");
    if (salt > 0.34 || goods.some(good => good.id === "savanna-salt")) mark("1.2.10.40");
    if (goods.some(good => good.id === "ivory" || good.id === "bone")) mark("1.2.10.41");
    if (fireRisk > 0.44) mark("1.2.10.42");
    if (droughtRisk > 0.42) mark("1.2.10.43");
    if (heatRisk > 0.48) mark("1.2.10.44");
    if (predators > 0.24) mark("1.2.10.45");
    if (waterScarcity > 0.42) mark("1.2.10.46");
    if (floodRisk > 0.34) mark("1.2.10.47");
    if (disease > 0.38) mark("1.2.10.48");

    const ground = mixColour([146, 107, 68], [176, 137, 82], clamp01(drySeason * 0.5 + salt * 0.2 + rocky * 0.15));
    const green = mixColour([139, 145, 71], [103, 125, 58], clamp01(wetSeason * 0.7 + (1 - drySeason) * 0.18));
    const grassColour = hexColour(burned ? mixColour([49, 44, 37], [104, 91, 60], 0.3) : green);
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.15) * 0.66);
    const windSway = clamp01(0.18 + wind * 0.16 + grassCover * 0.18);
    const phase = unit(seed, x, y, 0x57494e44) * Math.PI * 2;
    const leafColour = trees[0]?.seasonColour || grassColour;
    const waterHex = standingWater ? "#6f8c82" : "#b9a17c";

    return {
        biome: "savanna", savanna: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate, moisture, temperature, height,
        features: SAVANNA_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            hill, flat, kopje, relief: clamp01(relief), aboveSea,
            label: kopje ? "rocky kopje" : hill ? "rolling savanna hill" : "broad savanna plain",
        },
        soil: {
            laterite: clamp01(0.32 + drySeason * 0.24 + (1 - moisture) * 0.18 + rockRoll * 0.18),
            nutrients: clamp01(0.3 + wetSeason * 0.3 + moundCount * 0.03 - drought * 0.12 - rocky * 0.1),
            drainage: clamp01((1 - pan) * 0.7 + aboveSea * 0.22 + kopje * 0.16),
            erosion: clamp01(floodRisk * 0.4 + aboveSea * 0.2 + (1 - grassCover) * 0.2),
            salinity: salt, agriculture, grain, livestock, forage,
        },
        water: {
            wetSeason, drySeason, wetland, pan, waterhole, standingWater, waterDepthCm,
            dryRiverbed, river, floodRisk, scarcity: waterScarcity,
            label: standingWater ? "standing water" : dryRiverbed > 0.34 ? "dry sand channel" : pan > 0.3 ? "seasonal pan" : "dry ground",
        },
        vegetation: {
            grasses, shrubs, herbs, flowers, trees,
            density: clamp01(grasses.length * 0.1 + shrubs.length * 0.06 + trees.length * 0.08),
            cover, bloom, grassCover, fireAdapted: grasses.some(entry => entry.fireAdapted),
            greenFlush: clamp01(wetSeason * 0.8 + (season === "spring" ? 0.2 : 0)),
            dryGold: drySeason, woody: clamp01(trees.length * 0.22 + shrubs.length * 0.15),
            treeChance: trees.length ? (formation.id === "baobab-grove" ? 0.95 : formation.id === "riparian-corridor" ? 0.8 : 0.68) : 0,
        },
        fauna, goods,
        termites: { mounds: termites, moundCount },
        economy: {
            agriculture, grain, livestock, forage, timber, fuel, salt,
            pastoralism: clamp01(livestock * 0.8 + (use.grazed ? 0.15 : 0)),
            hunting: clamp01(fauna.some(entry => entry.group === "herbivore") ? 0.5 + drySeason * 0.2 : 0.12),
            migrationEconomy: clamp01((season === "spring" || season === "summer" ? 0.65 : 0.28)
                + (fauna.some(entry => entry.migratory) ? 0.2 : 0)),
            waterDemand: clamp01(heatRisk * 0.7 + droughtRisk * 0.3),
            storage: clamp01(0.3 + drought * 0.2 + heat * 0.14),
            disease, tsetse, predators, waterScarcity, supplyCost: clamp01(0.3 + waterScarcity * 0.26 + floodRisk * 0.12 + (1 - movement) * 0.2),
            buildingMaterial: clamp01(0.18 + trees.length * 0.08 + shrubs.length * 0.06 + rocky * 0.1),
        },
        hazards: {
            fireRisk, droughtRisk, heatRisk, predators, floodRisk, waterScarcity, disease, tsetse,
            burnScar, burned, movement, visibility, erosion: clamp01(floodRisk * 0.5 + (1 - grassCover) * 0.2),
        },
        use,
        visual: {
            sunlight, wind, windSway, phase, wetSeason, drySeason, heat, burned,
            groundHex: hexColour(ground), grassHex: grassColour,
            leafHex: leafColour, waterHex, rockHex: "#8d735c", flowerHex: flowers[0]?.colours?.[0] || "#d49a59",
            ashHex: "#3d3831", termiteHex: "#a56f4e", dustHex: hexColour(mixColour([196, 166, 122], [170, 132, 92], drySeason * 0.4)),
            noonLight: clamp01(0.44 + sunlight * 0.44 - heat * 0.08),
            haze: clamp01(drySeason * 0.18 + (1 - grassCover) * 0.1),
        },
        grassHex: grassColour, groundHex: hexColour(ground), leafColour,
        sward: { height: grasses.some(entry => entry.height === "tall") ? "tall" : "short", density: clamp01(0.25 + grassCover * 0.5) },
        trees, treeChance: trees.length ? (formation.id === "baobab-grove" ? 0.95 : formation.id === "riparian-corridor" ? 0.8 : 0.68) : 0,
        seasonalMovement: fauna.some(entry => entry.migratory)
            ? "herds follow the rain and the remaining water"
            : "wildlife concentrates around shade and water",
        seasonalNote: `${formation.label} · ${Math.round(wetSeason * 100)}% wet · ${Math.round(grassCover * 100)}% grass cover · ${waterhole > 0.3 ? "waterhole" : "dry ground"}`,
    };
}

export function savannaGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "marula-fruit") return season === "spring" || season === "summer" || season === "autumn";
        if (good.id === "savanna-salt") return season === "autumn" || season === "winter" || profile.water?.drySeason > 0.5;
        if (good.id === "savanna-herb") return season !== "winter" || profile.water?.wetSeason > 0.4;
        return true;
    });
}

export function savannaProductsAt(x, y, context = {}) {
    const profile = savannaProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.02) return null;
    const goods = savannaGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function savannaSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const water = profile.water.standingWater ? " · standing water" : profile.water.dryRiverbed > 0.34 ? " · dry channel" : profile.water.pan > 0.3 ? " · seasonal pan" : " · dry ground";
    const pulse = profile.water.wetSeason > profile.water.drySeason ? "wet season" : "dry season";
    return `${profile.label} · ${pulse} · ${goods} · ${wildlife}${water}`;
}

export function savannaRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const SAVANNA_LIMITS = Object.freeze({
    requirements: SAVANNA_REQUIREMENTS.length,
    maxFauna: 8,
    maxFlowers: 3,
    maxGoods: 9,
    formations: Object.keys(SAVANNA_FORMATIONS).length,
    grasses: Object.keys(SAVANNA_GRASSES).length,
    shrubs: Object.keys(SAVANNA_SHRUBS).length,
    trees: Object.keys(SAVANNA_TREES).length,
});
