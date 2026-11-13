// Steppe ecology (spec 1.2.7.1–1.2.7.56).
//
// A steppe is not a meadow with the colour turned down. It is an open,
// seasonal grassland with low and middle grasses, deep roots, thorn scrub,
// rare tree islands, fertile black earth, salt and sand, migrating herds and
// real drought/fire/winter pressure. The profile is stateless: terrain,
// gathering, pasture suitability and the site survey all derive it from the
// same seed, terrain, climate, season and land-use inputs. No per-tile save
// data is added.
//
// The module deliberately does not import forest-ecology. forest-ecology
// registers STEPPE_GOODS in its shared catalogue, while this module stays a
// pure world query.

import { seasonalState } from "./season.js";

export const STEPPE_REQUIREMENTS = Object.freeze([
    { id: "1.2.7.1", key: "low-mid-grasses", label: "Low and middle-height steppe grasses", group: "vegetation" },
    { id: "1.2.7.2", key: "drought-plants", label: "Drought-resistant plants", group: "vegetation" },
    { id: "1.2.7.3", key: "thorn-shrubs", label: "Thorny shrubs", group: "vegetation" },
    { id: "1.2.7.4", key: "herbs-flowers", label: "Herbs and seasonal flowering plants", group: "vegetation" },
    { id: "1.2.7.5", key: "bush-groups", label: "Scattered bush groups", group: "vegetation" },
    { id: "1.2.7.6", key: "tree-islands", label: "Rare tree islands", group: "vegetation" },
    { id: "1.2.7.7", key: "density", label: "Varying vegetation density", group: "vegetation" },
    { id: "1.2.7.8", key: "deep-roots", label: "Plants with deep root systems", group: "vegetation" },
    { id: "1.2.7.9", key: "open-soil", label: "Dry, open soils", group: "landform" },
    { id: "1.2.7.10", key: "chernozem", label: "Fertile black-earth areas", group: "landform" },
    { id: "1.2.7.11", key: "sand-dust", label: "Dusty and sandy areas", group: "landform" },
    { id: "1.2.7.12", key: "hills", label: "Gently hilly landscapes", group: "landform" },
    { id: "1.2.7.13", key: "plains", label: "Wide plains", group: "landform" },
    { id: "1.2.7.14", key: "gullies", label: "Small erosion gullies", group: "landform" },
    { id: "1.2.7.15", key: "salt", label: "Salty soil surfaces", group: "landform" },
    { id: "1.2.7.16", key: "seasonal-pool", label: "Shallow depressions with seasonal water", group: "landform" },
    { id: "1.2.7.17", key: "hot-summer", label: "Hot and dry summers", group: "climate" },
    { id: "1.2.7.18", key: "cold-winter", label: "Cold winters", group: "climate" },
    { id: "1.2.7.19", key: "temperature-range", label: "Strong temperature differences", group: "climate" },
    { id: "1.2.7.20", key: "seasonal-rain", label: "Seasonal precipitation", group: "climate" },
    { id: "1.2.7.21", key: "drought", label: "Periods of drought", group: "climate" },
    { id: "1.2.7.22", key: "spring-bloom", label: "Spring bloom after rain", group: "climate" },
    { id: "1.2.7.23", key: "summer-scorch", label: "Vegetation drying out in summer", group: "climate" },
    { id: "1.2.7.24", key: "snow", label: "Snow-covered steppe in winter", group: "climate" },
    { id: "1.2.7.25", key: "wild-horses", label: "Wild horses and other grazing animals", group: "fauna" },
    { id: "1.2.7.26", key: "antelope", label: "Antelope-like animals in suitable regions", group: "fauna" },
    { id: "1.2.7.27", key: "rodents", label: "Rodents and burrowing animals", group: "fauna" },
    { id: "1.2.7.28", key: "predators", label: "Wolves and other steppe predators", group: "fauna" },
    { id: "1.2.7.29", key: "raptors", label: "Birds of prey", group: "fauna" },
    { id: "1.2.7.30", key: "ground-birds", label: "Ground-nesting birds", group: "fauna" },
    { id: "1.2.7.31", key: "insects", label: "Insects and seasonal swarms", group: "fauna" },
    { id: "1.2.7.32", key: "migrating-herds", label: "Migrating animal herds", group: "fauna" },
    { id: "1.2.7.33", key: "pasture", label: "Pasture land", group: "economy" },
    { id: "1.2.7.34", key: "wild-game", label: "Wild game and hunting products", group: "economy" },
    { id: "1.2.7.35", key: "medicinal-herbs", label: "Medicinal herbs", group: "economy" },
    { id: "1.2.7.36", key: "grain-soil", label: "Fertile soil for grain farming", group: "economy" },
    { id: "1.2.7.37", key: "clay", label: "Loam and clay", group: "economy" },
    { id: "1.2.7.38", key: "stone", label: "Stone and shallow mineral deposits", group: "economy" },
    { id: "1.2.7.39", key: "hides-wool", label: "Animal hides and wool", group: "economy" },
    { id: "1.2.7.40", key: "plant-fibre", label: "Special plant fibres", group: "economy" },
    { id: "1.2.7.41", key: "nomadism", label: "Conditions for nomadic ways of life", group: "economy" },
    { id: "1.2.7.42", key: "large-pasture", label: "Large grazing areas", group: "economy" },
    { id: "1.2.7.43", key: "horse-breeding", label: "Favourable conditions for horse breeding", group: "economy" },
    { id: "1.2.7.44", key: "sightlines", label: "Long sightlines", group: "strategy" },
    { id: "1.2.7.45", key: "cover", label: "Few natural cover options", group: "strategy" },
    { id: "1.2.7.46", key: "waterholes", label: "Waterholes as strategic places", group: "strategy" },
    { id: "1.2.7.47", key: "settlement-distance", label: "Large distances between settlements", group: "strategy" },
    { id: "1.2.7.48", key: "seasonal-migration", label: "Seasonal movement of people and animals", group: "strategy" },
    { id: "1.2.7.49", key: "drought-hazard", label: "Drought periods", group: "hazard" },
    { id: "1.2.7.50", key: "dust-storms", label: "Dust storms", group: "hazard" },
    { id: "1.2.7.51", key: "water-scarcity", label: "Water scarcity", group: "hazard" },
    { id: "1.2.7.52", key: "fire", label: "Steppe fires", group: "hazard" },
    { id: "1.2.7.53", key: "overgrazing", label: "Overgrazing", group: "hazard" },
    { id: "1.2.7.54", key: "food-shortage", label: "Food shortages in bad years", group: "hazard" },
    { id: "1.2.7.55", key: "extreme-winter", label: "Extreme winter conditions", group: "hazard" },
    { id: "1.2.7.56", key: "soil-degradation", label: "Loss of soil fertility", group: "hazard" },
]);

export const STEPPE_REQUIREMENT_IDS = Object.freeze(STEPPE_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(STEPPE_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const STEPPE_FORMATIONS = Object.freeze({
    "short-grass": Object.freeze({
        id: "short-grass", label: "Short-grass steppe", height: "short", density: 0.34,
        grasses: ["sheep-fescue", "blue-grama", "bulbous-bluegrass"],
        shrubs: ["sagebrush", "saltwort"], flowers: ["steppe-tulip", "adonis"],
        note: "thin, wind-cropped turf with open soil between the tufts",
    }),
    "mixed-grass": Object.freeze({
        id: "mixed-grass", label: "Mixed-grass steppe", height: "medium", density: 0.56,
        grasses: ["needle-grass", "crested-wheatgrass", "feather-grass"],
        shrubs: ["caragana", "wild-rose"], flowers: ["iris", "poppy", "sainfoin"],
        note: "the broad middle ground of feather grass, needlegrass and herbs",
    }),
    "tall-grass": Object.freeze({
        id: "tall-grass", label: "Tall-grass steppe", height: "tall", density: 0.72,
        grasses: ["feather-grass", "sand-reed", "crested-wheatgrass"],
        shrubs: ["wild-rose", "dwarf-almond"], flowers: ["iris", "steppe-aster", "sage-flower"],
        note: "deep soil and enough spring rain for a tall, seed-heavy sward",
    }),
    "thorn-scrub": Object.freeze({
        id: "thorn-scrub", label: "Thorn-scrub steppe", height: "medium", density: 0.42,
        grasses: ["needle-grass", "sheep-fescue"], shrubs: ["camel-thorn", "caragana", "wild-rose"],
        flowers: ["poppy", "xeranthemum"], note: "thorny islands hold sheep and foxes away from the open grass",
    }),
    "salt-flat": Object.freeze({
        id: "salt-flat", label: "Salt-flat steppe", height: "short", density: 0.16,
        grasses: ["saltgrass", "bulbous-bluegrass"], shrubs: ["saltwort"],
        flowers: ["xeranthemum"], note: "pale salt crust with saltgrass in the cracks",
    }),
    "sandy": Object.freeze({
        id: "sandy", label: "Sandy steppe", height: "short", density: 0.24,
        grasses: ["sand-reed", "blue-grama"], shrubs: ["sagebrush", "dwarf-almond"],
        flowers: ["adonis"], note: "loose sand, dust and roots holding the low dunes",
    }),
    "hilly": Object.freeze({
        id: "hilly", label: "Hilly steppe", height: "medium", density: 0.48,
        grasses: ["sheep-fescue", "needle-grass", "crested-wheatgrass"],
        shrubs: ["caragana", "wild-rose"], flowers: ["iris", "steppe-aster"],
        note: "short turf over rolling ground with long views from the crests",
    }),
    "tree-island": Object.freeze({
        id: "tree-island", label: "Steppe tree island", height: "medium", density: 0.62,
        grasses: ["feather-grass", "crested-wheatgrass"], shrubs: ["wild-rose", "sea-buckthorn"],
        flowers: ["iris", "steppe-aster"], trees: ["steppe-elm", "white-poplar", "juniper"],
        note: "a rare island of elm, poplar and juniper around a deeper root line",
    }),
    "seasonal-wet": Object.freeze({
        id: "seasonal-wet", label: "Seasonal steppe hollow", height: "tall", density: 0.66,
        grasses: ["sand-reed", "feather-grass", "saltgrass"], shrubs: ["sea-buckthorn", "wild-rose"],
        flowers: ["iris", "poppy", "steppe-aster"], trees: ["crack-willow"],
        note: "a shallow hollow that holds spring water and dries to cracked mud",
    }),
});

export const STEPPE_GRASSES = Object.freeze({
    "feather-grass": Object.freeze({ id: "feather-grass", label: "Feather grass", height: "tall", colours: ["#aa9a63", "#c8b57a"], deepRoot: true }),
    "needle-grass": Object.freeze({ id: "needle-grass", label: "Needle grass", height: "medium", colours: ["#9d9462", "#b9ac72"], deepRoot: true }),
    "sheep-fescue": Object.freeze({ id: "sheep-fescue", label: "Sheep fescue", height: "short", colours: ["#8c9256", "#a8a76b"], deepRoot: true }),
    "blue-grama": Object.freeze({ id: "blue-grama", label: "Blue grama", height: "short", colours: ["#8c9b61", "#aeb37a"], deepRoot: true }),
    "crested-wheatgrass": Object.freeze({ id: "crested-wheatgrass", label: "Crested wheatgrass", height: "medium", colours: ["#9d9860", "#bdb477"], deepRoot: true }),
    "saltgrass": Object.freeze({ id: "saltgrass", label: "Saltgrass", height: "short", colours: ["#a6a274", "#c0b98b"], deepRoot: true, saltTolerant: true }),
    "sand-reed": Object.freeze({ id: "sand-reed", label: "Sand reed", height: "tall", colours: ["#ad9d68", "#c9b47c"], deepRoot: true }),
    "bulbous-bluegrass": Object.freeze({ id: "bulbous-bluegrass", label: "Bulbous bluegrass", height: "short", colours: ["#929d63", "#b1b47a"], deepRoot: false }),
});

export const STEPPE_SHRUBS = Object.freeze({
    sagebrush: Object.freeze({ id: "sagebrush", label: "Sagebrush", thorny: false, deepRoot: true, colours: ["#8b8e6c", "#a6a57d"], goods: ["steppe-fibre"] }),
    caragana: Object.freeze({ id: "caragana", label: "Caragana", thorny: true, deepRoot: true, colours: ["#7c8b59", "#9aa46c"], goods: ["steppe-fibre"] }),
    "wild-rose": Object.freeze({ id: "wild-rose", label: "Wild rose", thorny: true, deepRoot: false, colours: ["#8c7953", "#b18f68"], goods: ["wildflowers"] }),
    "sea-buckthorn": Object.freeze({ id: "sea-buckthorn", label: "Sea buckthorn", thorny: true, deepRoot: true, colours: ["#8c9361", "#b0a36d"], goods: ["steppe-fibre"] }),
    "camel-thorn": Object.freeze({ id: "camel-thorn", label: "Camel thorn", thorny: true, deepRoot: true, colours: ["#7e8055", "#9d9566"], goods: ["steppe-fibre"] }),
    saltwort: Object.freeze({ id: "saltwort", label: "Saltwort", thorny: false, deepRoot: true, colours: ["#a59f7b", "#c0b78d"], goods: ["salt"] }),
    "dwarf-almond": Object.freeze({ id: "dwarf-almond", label: "Dwarf almond", thorny: true, deepRoot: true, colours: ["#8b7b59", "#ad946b"], goods: ["steppe-fibre"] }),
});

export const STEPPE_FLOWERS = Object.freeze({
    "steppe-tulip": Object.freeze({ id: "steppe-tulip", label: "Steppe tulip", colours: ["#c26b38", "#e0a04d"], seasons: ["spring"], pollinator: 0.55, rare: true }),
    iris: Object.freeze({ id: "iris", label: "Steppe iris", colours: ["#8b78b5", "#b6a7d2"], seasons: ["spring", "summer"], pollinator: 0.5 }),
    poppy: Object.freeze({ id: "poppy", label: "Steppe poppy", colours: ["#c5523d", "#e58b58"], seasons: ["spring", "summer"], pollinator: 0.45 }),
    adonis: Object.freeze({ id: "adonis", label: "Spring adonis", colours: ["#d7b43e", "#efd46a"], seasons: ["spring"], pollinator: 0.6 }),
    "steppe-aster": Object.freeze({ id: "steppe-aster", label: "Steppe aster", colours: ["#9d8ac4", "#c7b8df"], seasons: ["summer", "autumn"], pollinator: 0.75 }),
    sainfoin: Object.freeze({ id: "sainfoin", label: "Sainfoin", colours: ["#b75b79", "#d98ba1"], seasons: ["spring", "summer"], pollinator: 0.9 }),
    "sage-flower": Object.freeze({ id: "sage-flower", label: "Sage flower", colours: ["#8e7fb3", "#b7a8d0"], seasons: ["summer"], pollinator: 0.7 }),
    xeranthemum: Object.freeze({ id: "xeranthemum", label: "Xeranthemum", colours: ["#d4c29a", "#e9ddbd"], seasons: ["summer", "autumn"], pollinator: 0.4 }),
});

export const STEPPE_HERBS = Object.freeze({
    yarrow: Object.freeze({ id: "yarrow", label: "Yarrow", seasons: ["spring", "summer", "autumn"], medicine: true, colour: "#dfd8c0" }),
    thyme: Object.freeze({ id: "thyme", label: "Wild thyme", seasons: ["spring", "summer"], medicine: true, colour: "#b58aa3" }),
    sage: Object.freeze({ id: "sage", label: "Steppe sage", seasons: ["spring", "summer", "autumn"], medicine: true, colour: "#a7a5b5" }),
    licorice: Object.freeze({ id: "licorice", label: "Licorice", seasons: ["summer", "autumn"], medicine: true, colour: "#b99b63" }),
    elecampane: Object.freeze({ id: "elecampane", label: "Elecampane", seasons: ["summer"], medicine: true, colour: "#d9b74e" }),
    plantain: Object.freeze({ id: "plantain", label: "Ribwort plantain", seasons: ["spring", "summer"], medicine: false, colour: "#a99a63" }),
    wormwood: Object.freeze({ id: "wormwood", label: "Wormwood", seasons: ["summer", "autumn"], medicine: true, colour: "#9fa083" }),
});

export const STEPPE_TREES = Object.freeze({
    "steppe-elm": Object.freeze({
        id: "steppe-elm", label: "Steppe elm", kind: "island", crown: 0.78, trunk: 0.28,
        colours: { spring: "#768957", summer: "#4e6f42", autumn: "#9a7b3f", winter: "#655f50" },
        goods: ["timber", "elm-seeds"], note: "a wind-bent elm rooted in a deeper soil pocket",
    }),
    "white-poplar": Object.freeze({
        id: "white-poplar", label: "White poplar", kind: "island", crown: 0.7, trunk: 0.3,
        colours: { spring: "#849665", summer: "#587b4b", autumn: "#b49752", winter: "#6b6454" },
        goods: ["timber"], note: "a pale-leaved poplar marking a spring line",
    }),
    "crack-willow": Object.freeze({
        id: "crack-willow", label: "Crack willow", kind: "riparian", crown: 0.82, trunk: 0.26,
        colours: { spring: "#8d9c67", summer: "#5d7d50", autumn: "#a28b4d", winter: "#716b59" },
        goods: ["timber", "willow-withies"], note: "a willow rooted in a seasonal hollow",
    }),
    juniper: Object.freeze({
        id: "juniper", label: "Steppe juniper", kind: "island", crown: 0.46, trunk: 0.16,
        colours: { spring: "#647d55", summer: "#3d6448", autumn: "#5f6f4c", winter: "#586456" },
        goods: ["juniper-berries", "timber"], note: "a dark juniper on a dry, stony rise",
    }),
    "english-oak": Object.freeze({
        id: "english-oak", label: "Steppe oak", kind: "island", crown: 0.88, trunk: 0.32,
        colours: { spring: "#718b52", summer: "#496c3f", autumn: "#a07a3c", winter: "#665f4e" },
        goods: ["timber", "acorns"], note: "an old oak left as a boundary marker on the plain",
    }),
});

export const STEPPE_FAUNA = Object.freeze({
    tarpan: Object.freeze({ id: "tarpan", label: "Wild horse", group: "herd", kind: "horse", seasons: ["spring", "summer", "autumn", "winter"], migratory: true, note: "a band moving between grass and water" }),
    saiga: Object.freeze({ id: "saiga", label: "Saiga antelope", group: "herd", kind: "antelope", seasons: ["spring", "summer", "autumn", "winter"], migratory: true, note: "a herd crossing the open plain" }),
    "steppe-sheep": Object.freeze({ id: "steppe-sheep", label: "Steppe sheep", group: "livestock", kind: "sheep", seasons: ["spring", "summer", "autumn"], note: "sheep grazing the short turf" }),
    marmot: Object.freeze({ id: "marmot", label: "Steppe marmot", group: "rodent", kind: "marmot", seasons: ["spring", "summer", "autumn"], burrow: true, note: "whistling at the mouth of a burrow" }),
    "ground-squirrel": Object.freeze({ id: "ground-squirrel", label: "Ground squirrel", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn"], burrow: true, note: "darting between grass and earth" }),
    jerboa: Object.freeze({ id: "jerboa", label: "Jerboa", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn"], burrow: true, note: "a night-runner of the dry ground" }),
    "steppe-wolf": Object.freeze({ id: "steppe-wolf", label: "Steppe wolf", group: "predator", kind: "wolf", seasons: ["spring", "summer", "autumn", "winter"], note: "following the herd line" }),
    "steppe-fox": Object.freeze({ id: "steppe-fox", label: "Steppe fox", group: "predator", kind: "fox", seasons: ["spring", "summer", "autumn", "winter"], note: "hunting rodents in the short grass" }),
    "steppe-eagle": Object.freeze({ id: "steppe-eagle", label: "Steppe eagle", group: "raptor", kind: "raptor", seasons: ["spring", "summer", "autumn"], note: "circling on a long thermal" }),
    kestrel: Object.freeze({ id: "kestrel", label: "Kestrel", group: "raptor", kind: "raptor", seasons: ["spring", "summer", "autumn", "winter"], note: "hovering over the open ground" }),
    "great-bustard": Object.freeze({ id: "great-bustard", label: "Great bustard", group: "bird", kind: "ground-bird", seasons: ["spring", "summer", "autumn"], groundNesting: true, note: "a heavy ground bird of the open plain" }),
    skylark: Object.freeze({ id: "skylark", label: "Skylark", group: "bird", kind: "songbird", seasons: ["spring", "summer"], note: "singing above the grass" }),
    locust: Object.freeze({ id: "locust", label: "Steppe locust", group: "insect", kind: "locust", seasons: ["summer", "autumn"], swarming: true, note: "a seasonal swarm in the dry grass" }),
    "steppe-bee": Object.freeze({ id: "steppe-bee", label: "Steppe bee", group: "insect", kind: "bee", seasons: ["spring", "summer"], note: "working the spring flowers" }),
});

// Only genuinely new goods live here. Hay, game, hides, fur, herbs and
// wildflowers already exist in the shared forest catalogue.
export const STEPPE_GOODS = Object.freeze({
    "steppe-grass": Object.freeze({ id: "steppe-grass", label: "Steppe grass", category: "fodder" }),
    "steppe-fibre": Object.freeze({ id: "steppe-fibre", label: "Steppe fibre", category: "fibre" }),
    wool: Object.freeze({ id: "wool", label: "Wool", category: "gather" }),
    clay: Object.freeze({ id: "clay", label: "Clay", category: "gather" }),
    salt: Object.freeze({ id: "salt", label: "Salt", category: "gather" }),
});

const SEASON_FLOWER_CHANCE = Object.freeze({ spring: 0.82, summer: 0.46, autumn: 0.18, winter: 0.01 });
const GRASS_COLOURS = Object.freeze({
    spring: { short: [124, 139, 79], tall: [137, 148, 85] },
    summer: { short: [157, 145, 86], tall: [171, 154, 95] },
    autumn: { short: [162, 138, 79], tall: [176, 150, 87] },
    winter: { short: [176, 178, 158], tall: [185, 184, 164] },
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

function seasonKeyFor(dayOfYear) {
    const day = ((Number(dayOfYear) % 400) + 400) % 400;
    return SEASON_KEYS[Math.floor(day / 100) % 4] || "spring";
}

function seasonProfile(dayOfYear, climate) {
    const key = seasonKeyFor(dayOfYear);
    const base = seasonalState(Number(dayOfYear) || 0, climate === "mediterranean" ? "mediterranean" : "arid");
    const index = SEASON_KEYS.indexOf(key);
    const winterCold = index === 3 ? 0.88 : index === 0 ? 0.4 : index === 2 ? 0.18 : 0.04;
    const snowCover = index === 3
        ? clamp01(0.48 + base.warmth * -0.1 + (1 - (Number(climate) || 0)) * 0)
        : index === 0 ? 0.1 : 0;
    const seasonalRain = index === 0 ? 0.72 : index === 1 ? 0.22 : index === 2 ? 0.3 : 0.14;
    const drought = index === 1 ? clamp01(0.56 + (1 - base.greenUp) * 0.18) : index === 2 ? 0.38 : 0.14;
    const springBloom = index === 0 ? clamp01(0.4 + base.greenUp * 0.4) : 0;
    const summerScorch = index === 1 ? clamp01(0.5 + base.warmth * 0.45) : index === 2 ? 0.18 : 0;
    return {
        key, index, base,
        summerHeat: base.warmth,
        winterCold,
        snowCover,
        seasonalRain,
        drought,
        springBloom,
        summerScorch,
        temperatureRange: clamp01(base.warmth * 0.62 + winterCold * 0.62),
        extremeWinter: clamp01(winterCold * 0.8 + (climate === "northern" ? 0.2 : 0)),
    };
}

export function steppePotentialAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.3);
    const temperature = clamp01(context.temperature ?? 0.72);
    const height = clamp01(context.height ?? 0.42);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "arid";
    const aridity = clamp01((number(context.aridity, 50)) / 100);
    const aridClimate = climate === "arid" ? 1 : climate === "mediterranean" ? 0.72 : climate === "temperate" && aridity > 0.64 ? 0.42 : 0;
    if (!aridClimate) return 0;
    const dry = 1 - smoothstep(0.18, 0.58, moisture);
    const warm = smoothstep(0.43, 0.74, temperature);
    const open = height >= seaLevel + 0.008 && height < Math.min(0.9, seaLevel + 0.5) ? 1 : 0;
    const roll = coarse(seed, x, y, 7, 0x53544550);
    return clamp01(aridClimate * dry * warm * open * (0.72 + roll * 0.38));
}

export function isSteppeSite(x, y, context = {}) {
    return steppePotentialAt(x, y, context) > 0.24;
}

function normalizeUse(value = {}) {
    const explicit = value && typeof value === "object" ? value : {};
    const state = explicit.state || (explicit.overgrazed ? "overgrazed" : explicit.grazed ? "grazed"
        : explicit.mowed ? "mowed" : explicit.trampled ? "trampled" : explicit.path ? "path" : "wild");
    const overgrazed = Boolean(explicit.overgrazed || state === "overgrazed");
    const grazed = Boolean(explicit.grazed || state === "grazed" || overgrazed);
    return {
        ...explicit, state, grazed, overgrazed,
        mowed: Boolean(explicit.mowed || state === "mowed"),
        wild: Boolean(explicit.wild || state === "wild" || state === "feral"),
        trampled: Boolean(explicit.trampled || state === "trampled"),
        path: Boolean(explicit.path || state === "path"),
        bareSoil: Boolean(explicit.bareSoil || overgrazed || explicit.trampled || state === "trampled"),
        intensity: clamp01(explicit.intensity ?? (overgrazed ? 1 : grazed ? 0.7 : explicit.trampled ? 0.84 : 0.16)),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (overgrazed ? "overgrazed steppe" : grazed ? "grazed steppe"
            : explicit.mowed ? "mown steppe" : explicit.trampled ? "trampled steppe" : "open steppe"),
    };
}

function chooseFormation({ moisture, soil, sand, salt, shrubPatches, treeRoll, hill, seasonalPool }) {
    if (salt > 0.56) return "salt-flat";
    if (sand > 0.58) return "sandy";
    if (shrubPatches > 0.64) return "thorn-scrub";
    if (treeRoll > 0.84 && moisture > 0.25) return "tree-island";
    if (seasonalPool) return "seasonal-wet";
    if (hill) return "hilly";
    if (moisture > 0.39 && soil > 0.53) return "tall-grass";
    if (moisture < 0.24) return "short-grass";
    return "mixed-grass";
}

function flowerPool(season) {
    return Object.values(STEPPE_FLOWERS).filter(flower => flower.seasons.includes(season));
}

function herbPool(season) {
    return Object.values(STEPPE_HERBS).filter(herb => herb.seasons.includes(season));
}

function buildFlowers(seed, x, y, season, bloom) {
    if (bloom <= 0.06) return [];
    const pool = flowerPool(season);
    if (!pool.length || unit(seed, x, y, 0x464c4f57) > bloom) return [];
    const chosen = [];
    const count = 1 + Math.floor(unit(seed, x, y, 0x464c4f58) * (bloom > 0.4 ? 3 : 2));
    for (let index = 0; index < count; index++) {
        const flower = pick(seed, x + index * 3, y - index, pool, 0x464c4f59 + index);
        if (flower && !chosen.some(entry => entry.id === flower.id)) chosen.push(flower);
    }
    return chosen;
}

function buildTrees(seed, x, y, { formation, moisture, treeRoll, season, pool }) {
    const trees = [];
    if (formation.id !== "tree-island" && formation.id !== "seasonal-wet" && treeRoll < 0.93) return trees;
    const poolIds = formation.trees?.length ? formation.trees : (moisture > 0.34 ? ["steppe-elm", "white-poplar"] : ["juniper"]);
    const count = formation.id === "tree-island" ? 2 + Math.floor(unit(seed, x, y, 0x54524545) * 2) : 1;
    for (let index = 0; index < count; index++) {
        const tree = STEPPE_TREES[poolIds[(hash32(seed, x, y, 0x54524546 + index) % poolIds.length)]];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x54524547) - 0.5) * (formation.id === "tree-island" ? 0.65 : 0.36),
            offsetY: (unit(seed, x, y + index, 0x54524548) - 0.5) * 0.28,
            scale: 0.78 + unit(seed, x, y + index, 0x54524549) * 0.42,
            role: tree.kind,
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, pasture, plain, sightlines, drought, bloom, cover, shrubs, waterhole } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = STEPPE_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(5, Math.round(count))) });
    };
    const open = cover < 0.62;
    if (open && pasture > 0.28 && unit(seed, x, y, 0x484f5253) > 0.34) add("tarpan", 2 + Math.floor(unit(seed, x, y, 0x484f5254) * 3));
    if (open && plain && pasture > 0.3 && unit(seed, x, y, 0x53414947) > 0.38) add("saiga", 2 + Math.floor(unit(seed, x, y, 0x53414948) * 3));
    if ((pasture > 0.34 || shrubs > 0.35) && season !== "winter" && unit(seed, x, y, 0x53484545) > 0.52) add("steppe-sheep", 2);
    if (plain && unit(seed, x, y, 0x4d41524d) > 0.42) add(season === "autumn" ? "ground-squirrel" : "marmot");
    if (open && unit(seed, x, y, 0x4a455242) > 0.7) add("jerboa");
    if (fauna.some(entry => entry.group === "herd") && unit(seed, x, y, 0x574f4c46) > 0.38) add("steppe-wolf");
    if (unit(seed, x, y, 0x464f5831) > 0.52) add("steppe-fox");
    if (open && sightlines > 0.42 && unit(seed, x, y, 0x4541474c) > 0.36) add(season === "winter" ? "kestrel" : "steppe-eagle");
    if (open && (season === "spring" || season === "summer") && unit(seed, x, y, 0x42555354) > 0.56) add("great-bustard");
    if ((season === "spring" || season === "summer") && unit(seed, x, y, 0x534b594c) > 0.48) add("skylark");
    if (season === "summer" && drought > 0.42 && unit(seed, x, y, 0x4c4f4355) > 0.44) add("locust", 3);
    if ((bloom > 0.12 || waterhole) && season !== "winter" && unit(seed, x, y, 0x42454531) > 0.5) add("steppe-bee");
    return fauna.slice(0, 6);
}

function buildGoods(seed, x, y, context) {
    const { season, pasture, bloom, herbs, fauna, clay, salt, fibres, wool, hides, stone } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.06 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    add("steppe-grass", "Steppe grass", "fodder", 0.2 + pasture * 0.42);
    if (pasture > 0.42 && (season === "summer" || season === "autumn")) add("hay", "Hay", "fodder", 0.3 + pasture * 0.4);
    if (bloom > 0.12 && (season === "spring" || season === "summer")) add("wildflowers", "Wildflowers", "gather", bloom * 0.7);
    if (herbs.length) add("herbs", "Herbs", "gather", 0.35 + herbs.length * 0.1);
    if (fauna.some(entry => entry.group === "herd" || entry.group === "livestock")) add("game", "Wild game", "hunt", 0.3 + pasture * 0.35);
    if (hides > 0.3) add("hides", "Hides", "hunt", hides);
    if (wool > 0.3) add("wool", "Wool", "gather", wool);
    if (fibres > 0.32) add("steppe-fibre", "Steppe fibre", "fibre", fibres);
    if (clay > 0.3) add("clay", "Clay", "gather", clay);
    if (salt > 0.3) add("salt", "Salt", "gather", salt);
    if (fauna.some(entry => entry.group === "predator") && season === "winter") add("fur", "Furs", "hunt", 0.24);
    // Stone is a material potential, not a gatherable plant. Keep it in the
    // materials block so it cannot be mistaken for a forest product.
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 8);
}

/**
 * Derive the complete steppe profile for one tile.
 *
 * `use` is optional. The terrain renderer derives it from real buildings and
 * roads; tests and previews can pass it directly. The function is pure and
 * deterministic for the same inputs.
 */
export function steppeProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.3);
    const temperature = clamp01(context.temperature ?? 0.72);
    const height = clamp01(context.height ?? 0.42);
    const climate = context.climate || "arid";
    const seaLevel = number(context.seaLevel, 0.33);
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const aridity = clamp01(number(context.aridity, 50) / 100);
    const season = seasonProfile(dayOfYear, climate);
    const key = season.key;
    const use = normalizeUse(context.use);
    const relief = coarse(seed, x, y, 7, 0x52454c49);
    const hill = height >= seaLevel + 0.25 || (height >= seaLevel + 0.18 && relief > 0.62);
    const plain = !hill && height < seaLevel + 0.33;
    const hollow = !hill && moisture > 0.22 && moisture < 0.42 && relief < 0.38;
    const seasonalPool = Boolean(hollow && coarse(seed, x, y, 9, 0x504f4f4c) > 0.46);
    const waterhole = Boolean((seasonalPool || coarse(seed, x, y, 13, 0x57415452) > 0.62) && moisture > 0.2);
    const gullyRoll = coarse(seed, x, y, 6, 0x47554c4c);
    const gully = Boolean(!hill && gullyRoll > 0.78);
    const sand = clamp01((1 - moisture) * 0.62 + coarse(seed, x, y, 5, 0x53414e44) * 0.45 - 0.18);
    const salt = clamp01((1 - moisture) * 0.72 + coarse(seed, x, y, 4, 0x53414c54) * 0.42 - 0.48);
    const chernozem = clamp01((moisture - 0.2) * 1.25 + (0.56 - Math.abs(height - (seaLevel + 0.18))) * 0.65
        + coarse(seed, x, y, 8, 0x43484552) * 0.3 - 0.18);
    const soil = clamp01(0.2 + moisture * 0.5 + chernozem * 0.3 + (temperature - 0.5) * 0.08 - salt * 0.18);
    const clay = clamp01(0.14 + coarse(seed, x, y, 5, 0x434c4159) * 0.55 + moisture * 0.2 - sand * 0.15);
    const stone = clamp01((height - seaLevel) * 1.15 + coarse(seed, x, y, 6, 0x53544f4e) * 0.5 - 0.16);
    const bare = clamp01((1 - moisture) * 0.62 + (1 - soil) * 0.2 + season.summerScorch * 0.18 + use.bareSoil * 0.25);
    const shrubPatches = clamp01(coarse(seed, x, y, 5, 0x53485255) * 0.72 + (1 - moisture) * 0.18 - salt * 0.16);
    const treeRoll = unit(seed, x, y, 0x54524545);
    const formation = STEPPE_FORMATIONS[chooseFormation({ moisture, soil, sand, salt, shrubPatches, treeRoll, hill, seasonalPool })];
    const trees = buildTrees(seed, x, y, { formation, moisture, treeRoll, season: key, pool: seasonalPool });
    const grasses = formation.grasses.map(id => STEPPE_GRASSES[id]).filter(Boolean);
    const shrubs = formation.shrubs.map(id => STEPPE_SHRUBS[id]).filter(Boolean);
    const bloomChance = SEASON_FLOWER_CHANCE[key] * (1 - season.snowCover * 0.8);
    const bloom = clamp01(bloomChance * (0.38 + coarse(seed, x, y, 3, 0x464c4f50) * 0.7)
        * (0.66 + moisture * 0.25) * (1 - salt * 0.3));
    const flowers = buildFlowers(seed, x, y, key, bloom);
    const rareRoll = unit(seed, x, y, 0x52415245);
    const rarePlant = rareRoll > 0.91 ? pick(seed, x, y, flowerPool(key).filter(flower => flower.rare), 0x52415245) : null;
    if (rarePlant && !flowers.some(flower => flower.id === rarePlant.id)) flowers.push(rarePlant);
    const herbs = herbPool(key).filter((herb, index) => unit(seed, x, y, 0x48455242 + index) > (1 - moisture) * 0.45);
    const fibres = clamp01(shrubs.filter(entry => entry.goods?.includes("steppe-fibre")).length * 0.2 + shrubPatches * 0.4 + (1 - moisture) * 0.12);
    const wool = clamp01((formation.id === "short-grass" || formation.id === "mixed-grass" ? 0.3 : 0.12) + (1 - moisture) * 0.22);
    const hides = clamp01(0.2 + (1 - moisture) * 0.3 + (season.key === "winter" ? 0.1 : 0));
    const pasture = clamp01(formation.density * 0.62 + moisture * 0.2 + chernozem * 0.18 - use.overgrazed * 0.38);
    const pastureArea = clamp01(pasture * (1 - shrubPatches * 0.35) * (plain ? 1 : 0.72));
    const cover = clamp01(shrubPatches * 0.46 + trees.length * 0.12 + formation.density * 0.2 + (hill ? 0.08 : 0));
    const sightlines = clamp01(1 - cover * 0.75 + (plain ? 0.18 : 0) + (hill ? 0.12 : 0));
    const settlementDistance = clamp01(0.3 + (1 - moisture) * 0.32 + (1 - chernozem) * 0.24 + (plain ? 0.12 : 0));
    const nomadism = clamp01(pastureArea * 0.52 + sightlines * 0.2 + waterhole * 0.18 - chernozem * 0.12);
    const horseBreeding = clamp01(pastureArea * 0.64 + plain * 0.2 + (1 - cover) * 0.18);
    const waterScarcity = clamp01((1 - moisture) * 0.72 + season.drought * 0.3 + (waterhole ? -0.14 : 0.1));
    const dustStorm = clamp01(season.drought * 0.55 + sand * 0.4 + wind * 0.12 - moisture * 0.18);
    const fireRisk = clamp01(season.summerScorch * 0.5 + season.drought * 0.3 + (1 - use.grazed) * 0.12 - moisture * 0.16);
    const overgrazing = clamp01((use.overgrazed ? 0.9 : use.grazed ? 0.42 : 0.08) + pastureArea * 0.12);
    const soilDegradation = clamp01(overgrazing * 0.45 + season.drought * 0.2 + salt * 0.2 + sand * 0.15);
    const foodShortage = clamp01(season.drought * 0.42 + season.extremeWinter * 0.25 + soilDegradation * 0.24 + (1 - pasture) * 0.12);
    const hazards = {
        drought: clamp01(season.drought), dustStorm, waterScarcity,
        fire: fireRisk, overgrazing, foodShortage,
        extremeWinter: clamp01(season.extremeWinter), soilDegradation,
    };
    const grassBase = GRASS_COLOURS[key][formation.height === "short" ? "short" : "tall"];
    let grassColour = mixColour(grassBase, [183, 162, 104], clamp01((1 - moisture) * 0.24 + season.summerScorch * 0.18));
    if (hill) grassColour = mixColour(grassColour, [190, 181, 124], 0.18);
    if (season.snowCover > 0.04) grassColour = mixColour(grassColour, [215, 218, 210], season.snowCover * 0.78);
    if (use.overgrazed) grassColour = mixColour(grassColour, [142, 124, 88], 0.3);
    const groundColour = mixColour([188, 164, 114], [155, 139, 97], clamp01(sand * 0.3 + bare * 0.16));
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.18) * 0.72);
    const haze = clamp01((1 - moisture) * 0.32 + season.summerScorch * 0.2 + (weather === "fog" ? 0.35 : 0));
    const fauna = buildFauna(seed, x, y, { season: key, pasture, plain, sightlines, drought: season.drought, bloom, cover, shrubs: shrubPatches, waterhole });
    const goods = buildGoods(seed, x, y, { season: key, pasture, bloom, herbs, fauna, clay, salt, fibres, wool, hides, stone });
    const features = new Set();
    const mark = (...ids) => { for (const id of ids) features.add(id); };
    mark("1.2.7.1");
    if (grasses.length) mark("1.2.7.2");
    if (shrubs.some(entry => entry.thorny)) mark("1.2.7.3");
    if (flowers.length || herbs.length) mark("1.2.7.4");
    if (shrubPatches > 0.34) mark("1.2.7.5");
    if (trees.length || formation.id === "tree-island") mark("1.2.7.6");
    mark("1.2.7.7");
    if (grasses.some(entry => entry.deepRoot) || shrubs.some(entry => entry.deepRoot)) mark("1.2.7.8");
    if (bare > 0.22 || moisture < 0.4) mark("1.2.7.9");
    if (chernozem > 0.3) mark("1.2.7.10");
    if (sand > 0.3 || dustStorm > 0.2) mark("1.2.7.11");
    if (hill) mark("1.2.7.12");
    if (plain) mark("1.2.7.13");
    if (gully) mark("1.2.7.14");
    if (salt > 0.35) mark("1.2.7.15");
    if (seasonalPool) mark("1.2.7.16");
    if (season.summerHeat > 0.28) mark("1.2.7.17");
    if (season.winterCold > 0.3) mark("1.2.7.18");
    if (season.temperatureRange > 0.28) mark("1.2.7.19");
    if (season.seasonalRain > 0.2) mark("1.2.7.20");
    if (season.drought > 0.22) mark("1.2.7.21");
    if (season.springBloom > 0.2 && bloom > 0.04) mark("1.2.7.22");
    if (season.summerScorch > 0.2) mark("1.2.7.23");
    if (season.snowCover > 0.2) mark("1.2.7.24");
    if (fauna.some(entry => entry.id === "tarpan" || entry.id === "steppe-sheep")) mark("1.2.7.25");
    if (fauna.some(entry => entry.id === "saiga")) mark("1.2.7.26");
    if (fauna.some(entry => entry.burrow || entry.group === "rodent")) mark("1.2.7.27");
    if (fauna.some(entry => entry.group === "predator")) mark("1.2.7.28");
    if (fauna.some(entry => entry.group === "raptor")) mark("1.2.7.29");
    if (fauna.some(entry => entry.groundNesting)) mark("1.2.7.30");
    if (fauna.some(entry => entry.group === "insect")) mark("1.2.7.31");
    if (fauna.some(entry => entry.migratory)) mark("1.2.7.32");
    if (pasture > 0.3) mark("1.2.7.33");
    if (goods.some(good => ["game", "hides", "fur"].includes(good.id))) mark("1.2.7.34");
    if (herbs.some(herb => herb.medicine)) mark("1.2.7.35");
    if (chernozem > 0.46 && plain) mark("1.2.7.36");
    if (clay > 0.28) mark("1.2.7.37");
    if (stone > 0.25) mark("1.2.7.38");
    if (hides > 0.3 || wool > 0.3) mark("1.2.7.39");
    if (fibres > 0.25 || goods.some(good => good.id === "steppe-fibre")) mark("1.2.7.40");
    if (nomadism > 0.34) mark("1.2.7.41");
    if (pastureArea > 0.36) mark("1.2.7.42");
    if (horseBreeding > 0.34) mark("1.2.7.43");
    if (sightlines > 0.5) mark("1.2.7.44");
    if (cover < 0.4) mark("1.2.7.45");
    if (waterhole || seasonalPool) mark("1.2.7.46");
    if (settlementDistance > 0.36) mark("1.2.7.47");
    if (season.seasonalRain > 0.3 || fauna.some(entry => entry.migratory)) mark("1.2.7.48");
    if (hazards.drought > 0.22) mark("1.2.7.49");
    if (hazards.dustStorm > 0.28) mark("1.2.7.50");
    if (hazards.waterScarcity > 0.3) mark("1.2.7.51");
    if (hazards.fire > 0.28) mark("1.2.7.52");
    if (hazards.overgrazing > 0.3) mark("1.2.7.53");
    if (hazards.foodShortage > 0.24) mark("1.2.7.54");
    if (hazards.extremeWinter > 0.3) mark("1.2.7.55");
    if (hazards.soilDegradation > 0.24) mark("1.2.7.56");

    return {
        biome: "steppe", steppe: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season: key, seasonIndex: season.index, climate, moisture, temperature, height, aridity,
        features: STEPPE_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            plain, hill, hollow, gully, seasonalPool,
            label: hill ? "rolling steppe" : gully ? "eroded steppe" : seasonalPool ? "seasonal steppe hollow" : "open steppe plain",
        },
        sward: {
            short: formation.height === "short", medium: formation.height === "medium", tall: formation.height === "tall",
            density: clamp01(formation.density * (0.72 + moisture * 0.22) * (1 - season.snowCover * 0.4)),
            height: formation.height,
        },
        grasses, shrubs, flowers, herbs, rarePlant, trees,
        shrubPatches, treeChance: trees.length ? 0.045 + trees.length * 0.012 : 0,
        bloom, pollinator: clamp01(flowers.reduce((sum, flower) => sum + (flower.pollinator || 0), 0) * 0.26 + (bloom > 0.2 ? 0.18 : 0)),
        soil: { moisture, bare, sand, salt, chernozem, fertility: soil, degradation: soilDegradation },
        materials: { clay, stone, fibres, chernozem },
        pasture, pastureArea, horseBreeding, nomadism, sightlines, cover, waterholes: waterhole,
        settlementDistance, seasonalMigration: Boolean(fauna.some(entry => entry.migratory) || season.seasonalRain > 0.3),
        crops: chernozem > 0.4 ? ["wheat", "barley", "millet"] : ["millet", "rye"],
        cropSuitability: clamp01(chernozem * 0.62 + (plain ? 0.22 : 0.08) + moisture * 0.16 - salt * 0.2),
        hazards,
        fauna, goods,
        use,
        grassColour, grassHex: hexColour(grassColour), groundHex: hexColour(groundColour),
        leafColour: trees[0]?.colours?.[key] || "#657547",
        visual: {
            wind: wind < 0.5 ? "calm" : wind > 1.6 ? "strong" : "breeze",
            windSway: clamp01((formation.height === "tall" ? 0.68 : formation.height === "short" ? 0.3 : 0.5) * wind * (1 - season.snowCover * 0.8)),
            phase: unit(seed, x, y, 0x57494e44) * Math.PI * 2,
            sunlight, haze, dust: clamp01(sand * 0.45 + season.drought * 0.22), dustStorm,
            mirage: clamp01(season.summerHeat * 0.4 + (1 - moisture) * 0.2),
            snowCover: season.snowCover, seasonalTint: key,
            flowerGlow: clamp01(bloom * (0.4 + sunlight * 0.6)),
        },
        seasonalMovement: fauna.length ? ({
            spring: "herds move onto the first green growth",
            summer: "animals gather around waterholes and shaded hollows",
            autumn: "herds follow the seed heads and the longer grass",
            winter: "animals seek shelter from the wind and snow",
        }[key]) : "",
    };
}

export function steppeGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => good.id !== "wildflowers" || season === "spring" || season === "summer");
}

export function steppeProductsAt(x, y, context = {}) {
    const profile = steppeProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.02) return null;
    const goods = steppeGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length) return null;
    return {
        x: profile.x, y: profile.y, profile, goods,
        label: profile.label, use: profile.use, fauna: profile.fauna,
    };
}

export function steppeSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no seasonal harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const water = profile.landform.seasonalPool ? " · seasonal water" : profile.waterholes ? " · waterhole" : "";
    return profile.label + " · " + profile.use.label + " · " + Math.round(profile.sward.density * 100) + "% cover · "
        + goods + " · " + wildlife + water;
}

export function steppeRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const STEPPE_LIMITS = Object.freeze({
    requirements: STEPPE_REQUIREMENTS.length,
    maxFauna: 6,
    maxFlowers: 4,
    maxGoods: 8,
});
