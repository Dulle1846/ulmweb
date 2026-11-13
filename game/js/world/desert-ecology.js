// Desert and semi-desert ecology (spec 1.2.8.1–1.2.8.75).
//
// A desert is not a sand-coloured meadow. It combines mobile dune fields,
// exposed rock, gravel plains, salt pans, dry basins, cold and mountain
// deserts, rare rain, groundwater oases, caravan routes, drought and extreme
// day/night temperature swings. The profile is stateless and deterministic:
// terrain rendering, gathering, farm/stable surveys and the shared goods
// catalogue all derive it from the same seed, terrain, season and land-use
// inputs. No per-tile save data and no extra tick loop are added.

import { seasonalState } from "./season.js";

export const DESERT_REQUIREMENTS = Object.freeze([
    { id: "1.2.8.1", key: "sand-desert", label: "Sand deserts with broad dune fields", group: "landform" },
    { id: "1.2.8.2", key: "rock-desert", label: "Rock deserts with exposed formations", group: "landform" },
    { id: "1.2.8.3", key: "gravel-desert", label: "Gravel deserts with gravel and stone surfaces", group: "landform" },
    { id: "1.2.8.4", key: "pebble-plains", label: "Pebble plains", group: "landform" },
    { id: "1.2.8.5", key: "salt-desert", label: "Salt deserts with pale mineral surfaces", group: "landform" },
    { id: "1.2.8.6", key: "semi-desert", label: "Semi-deserts with scattered vegetation", group: "landform" },
    { id: "1.2.8.7", key: "cold-desert", label: "Cold deserts", group: "landform" },
    { id: "1.2.8.8", key: "mountain-desert", label: "Mountain deserts", group: "landform" },
    { id: "1.2.8.9", key: "dry-basin", label: "Dry basin landscapes", group: "landform" },
    { id: "1.2.8.10", key: "small-sand-hills", label: "Small sand hills", group: "landform" },
    { id: "1.2.8.11", key: "great-dunes", label: "Large migrating dunes", group: "landform" },
    { id: "1.2.8.12", key: "dune-ridges", label: "Long dune ridges", group: "landform" },
    { id: "1.2.8.13", key: "crescent-dunes", label: "Crescent-shaped dunes", group: "landform" },
    { id: "1.2.8.14", key: "wind-scour", label: "Wind-scoured hollows", group: "landform" },
    { id: "1.2.8.15", key: "sand-colours", label: "Different sand colours", group: "visual" },
    { id: "1.2.8.16", key: "exposed-rock", label: "Exposed rock between sand fields", group: "landform" },
    { id: "1.2.8.17", key: "sand-at-walls", label: "Sand deposits at rock walls and buildings", group: "landform" },
    { id: "1.2.8.18", key: "boulders", label: "Large free-standing boulders", group: "landform" },
    { id: "1.2.8.19", key: "cliffs", label: "Steep rock walls", group: "landform" },
    { id: "1.2.8.20", key: "mesas", label: "Table mountains", group: "landform" },
    { id: "1.2.8.21", key: "canyons", label: "Canyons and gorges", group: "landform" },
    { id: "1.2.8.22", key: "rugged-mountains", label: "Rugged mountain sections", group: "landform" },
    { id: "1.2.8.23", key: "weathered-rock", label: "Weathered rock formations", group: "landform" },
    { id: "1.2.8.24", key: "scree", label: "Scree fields", group: "landform" },
    { id: "1.2.8.25", key: "erosion-channels", label: "Erosion channels", group: "landform" },
    { id: "1.2.8.26", key: "caves", label: "Natural caves and crevices", group: "landform" },
    { id: "1.2.8.27", key: "thorn-shrubs", label: "Thorny shrubs", group: "vegetation" },
    { id: "1.2.8.28", key: "drought-grasses", label: "Drought-resistant grasses", group: "vegetation" },
    { id: "1.2.8.29", key: "succulents", label: "Succulents and allied plants", group: "vegetation" },
    { id: "1.2.8.30", key: "desert-flowers", label: "Desert flowers after rare rain", group: "vegetation" },
    { id: "1.2.8.31", key: "deep-roots", label: "Deep root systems", group: "vegetation" },
    { id: "1.2.8.32", key: "palms", label: "Scattered palms", group: "vegetation" },
    { id: "1.2.8.33", key: "dense-semi-desert", label: "Denser grass in semi-deserts", group: "vegetation" },
    { id: "1.2.8.34", key: "groundwater-vegetation", label: "Vegetation along underground water", group: "vegetation" },
    { id: "1.2.8.35", key: "springs", label: "Natural springs", group: "water" },
    { id: "1.2.8.36", key: "palm-groves", label: "Palm groves", group: "vegetation" },
    { id: "1.2.8.37", key: "ponds", label: "Small lakes and ponds", group: "water" },
    { id: "1.2.8.38", key: "fertile-soil", label: "Fertile soils", group: "water" },
    { id: "1.2.8.39", key: "fields", label: "Small farmland", group: "settlement" },
    { id: "1.2.8.40", key: "orchards", label: "Fruit and useful plants", group: "settlement" },
    { id: "1.2.8.41", key: "waterholes", label: "Animal watering places", group: "water" },
    { id: "1.2.8.42", key: "caravan-stops", label: "Trade and rest stops", group: "settlement" },
    { id: "1.2.8.43", key: "water-settlements", label: "Settlements at strategic water sources", group: "settlement" },
    { id: "1.2.8.44", key: "desert-foxes", label: "Desert foxes and small predators", group: "fauna" },
    { id: "1.2.8.45", key: "reptiles", label: "Snakes and lizards", group: "fauna" },
    { id: "1.2.8.46", key: "scorpions", label: "Scorpions and insects", group: "fauna" },
    { id: "1.2.8.47", key: "rodents", label: "Rodents and burrowing animals", group: "fauna" },
    { id: "1.2.8.48", key: "vultures", label: "Vultures and other scavengers", group: "fauna" },
    { id: "1.2.8.49", key: "camels", label: "Camels or comparable adapted livestock", group: "fauna" },
    { id: "1.2.8.50", key: "nocturnal", label: "Nocturnal species", group: "fauna" },
    { id: "1.2.8.51", key: "water-independent", label: "Animals with high water independence", group: "fauna" },
    { id: "1.2.8.52", key: "salt-minerals", label: "Salt and minerals", group: "economy" },
    { id: "1.2.8.53", key: "sand-stone", label: "Sand and special stones", group: "economy" },
    { id: "1.2.8.54", key: "gems-metals", label: "Gemstones and metals", group: "economy" },
    { id: "1.2.8.55", key: "medicine", label: "Desert plants and medicinal herbs", group: "economy" },
    { id: "1.2.8.56", key: "oasis-fruit", label: "Oasis fruits", group: "economy" },
    { id: "1.2.8.57", key: "hides-wool", label: "Animal hides and wool", group: "economy" },
    { id: "1.2.8.58", key: "resins", label: "Rare resins and natural products", group: "economy" },
    { id: "1.2.8.59", key: "archaeology", label: "Archaeological and historical sites", group: "economy" },
    { id: "1.2.8.60", key: "day-heat", label: "Extreme heat during the day", group: "climate" },
    { id: "1.2.8.61", key: "night-cooling", label: "Strong cooling at night", group: "climate" },
    { id: "1.2.8.62", key: "sandstorms", label: "Sandstorms", group: "climate" },
    { id: "1.2.8.63", key: "dust-winds", label: "Dusty winds", group: "climate" },
    { id: "1.2.8.64", key: "heavy-rain", label: "Rare but heavy rain", group: "climate" },
    { id: "1.2.8.65", key: "flash-floods", label: "Flash floods in dry riverbeds", group: "climate" },
    { id: "1.2.8.66", key: "droughts", label: "Periods of drought", group: "climate" },
    { id: "1.2.8.67", key: "sand-visibility", label: "Visibility blocked by drifting sand", group: "climate" },
    { id: "1.2.8.68", key: "water-importance", label: "High importance of water sources", group: "strategy" },
    { id: "1.2.8.69", key: "supply-cost", label: "High supply costs for troops", group: "strategy" },
    { id: "1.2.8.70", key: "agriculture-difficulty", label: "Difficult agriculture outside oases", group: "strategy" },
    { id: "1.2.8.71", key: "water-routes", label: "Trade routes between water sources", group: "strategy" },
    { id: "1.2.8.72", key: "well-control", label: "Strategic control of wells", group: "strategy" },
    { id: "1.2.8.73", key: "caravan-trade", label: "Special suitability for caravan trade", group: "strategy" },
    { id: "1.2.8.74", key: "desert-building", label: "Specialised building methods", group: "economy" },
    { id: "1.2.8.75", key: "storage", label: "High importance of storing supplies", group: "economy" },
]);

export const DESERT_REQUIREMENT_IDS = Object.freeze(DESERT_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(DESERT_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const DESERT_FORMATIONS = Object.freeze({
    "sand-sea": Object.freeze({
        id: "sand-sea", label: "Sand sea", height: "low",
        note: "a broad sea of sand broken by dune crests and gravel islands",
        plants: ["sand-reed", "bunch-grass"], shrubs: ["camel-thorn"], palms: [],
    }),
    "dune-field": Object.freeze({
        id: "dune-field", label: "Dune field", height: "low",
        note: "mobile dunes with hollows and wind-scoured corridors",
        plants: ["sand-reed", "bunch-grass"], shrubs: ["saltbush"], palms: [],
    }),
    "rock-desert": Object.freeze({
        id: "rock-desert", label: "Rock desert", height: "high",
        note: "bare rock, boulders and thin sand in the lee of the stone",
        plants: ["bunch-grass"], shrubs: ["acacia-thorn"], palms: [],
    }),
    "gravel-desert": Object.freeze({
        id: "gravel-desert", label: "Gravel desert", height: "flat",
        note: "a dark gravel pavement between isolated rock ridges",
        plants: ["bunch-grass"], shrubs: ["saltbush"], palms: [],
    }),
    "pebble-plain": Object.freeze({
        id: "pebble-plain", label: "Pebble plain", height: "flat",
        note: "wind-polished pebbles and sparse bunch grass on open ground",
        plants: ["needle-grass"], shrubs: ["sage"], palms: [],
    }),
    "salt-flat": Object.freeze({
        id: "salt-flat", label: "Salt flat", height: "flat",
        note: "a pale mineral crust with cracked plates and salt-tolerant plants",
        plants: ["saltgrass"], shrubs: ["saltbush"], palms: [],
    }),
    "semi-desert": Object.freeze({
        id: "semi-desert", label: "Semi-desert", height: "mid",
        note: "scattered grass, thorn scrub and the first spring flowers",
        plants: ["bunch-grass", "needle-grass"], shrubs: ["acacia-thorn", "sage"], palms: [],
    }),
    "cold-desert": Object.freeze({
        id: "cold-desert", label: "Cold desert", height: "high",
        note: "high, dry ground with frost, bare stone and thin hardy turf",
        plants: ["needle-grass"], shrubs: ["sage"], palms: [],
    }),
    "mountain-desert": Object.freeze({
        id: "mountain-desert", label: "Mountain desert", height: "high",
        note: "steep dry slopes, scree and weathered rock above the basin",
        plants: ["bunch-grass"], shrubs: ["acacia-thorn"], palms: [],
    }),
    "dry-basin": Object.freeze({
        id: "dry-basin", label: "Dry basin", height: "flat",
        note: "an enclosed basin where rare water gathers and quickly disappears",
        plants: ["sand-reed", "bunch-grass"], shrubs: ["camel-thorn"], palms: ["date-palm"],
    }),
});

export const DESERT_GRASSES = Object.freeze({
    "bunch-grass": Object.freeze({ id: "bunch-grass", label: "Desert bunch grass", height: "short", deepRoot: true, colours: ["#a59a65", "#c5b98a"] }),
    "needle-grass": Object.freeze({ id: "needle-grass", label: "Needle grass", height: "short", deepRoot: true, colours: ["#9b9464", "#bcb27e"] }),
    "sand-reed": Object.freeze({ id: "sand-reed", label: "Sand reed", height: "tall", deepRoot: true, colours: ["#b0a16c", "#d0bf8c"] }),
    saltgrass: Object.freeze({ id: "saltgrass", label: "Saltgrass", height: "short", deepRoot: true, saltTolerant: true, colours: ["#b0ad83", "#cac596"] }),
});

export const DESERT_SHRUBS = Object.freeze({
    "acacia-thorn": Object.freeze({ id: "acacia-thorn", label: "Acacia thorn", thorny: true, deepRoot: true, goods: ["desert-resin", "desert-herb"], colours: ["#7d7752", "#a08f61"] }),
    "camel-thorn": Object.freeze({ id: "camel-thorn", label: "Camel thorn", thorny: true, deepRoot: true, goods: ["desert-herb"], colours: ["#7f8057", "#a59a68"] }),
    saltbush: Object.freeze({ id: "saltbush", label: "Saltbush", thorny: false, deepRoot: true, goods: ["salt"], colours: ["#999675", "#b8ae88"] }),
    sage: Object.freeze({ id: "sage", label: "Desert sage", thorny: false, deepRoot: true, goods: ["desert-herb"], colours: ["#8e9277", "#aab093"] }),
});

export const DESERT_SUCCULENTS = Object.freeze({
    agave: Object.freeze({ id: "agave", label: "Agave", deepRoot: false, goods: ["desert-herb"], colours: ["#7d9071", "#a7b397"] }),
    aloe: Object.freeze({ id: "aloe", label: "Aloe", deepRoot: false, goods: ["desert-herb"], colours: ["#668568", "#9ab399"] }),
    "barrel-cactus": Object.freeze({ id: "barrel-cactus", label: "Barrel cactus", deepRoot: false, goods: ["desert-herb"], colours: ["#728a5e", "#a0a979"] }),
    euphorbia: Object.freeze({ id: "euphorbia", label: "Euphorbia", deepRoot: false, goods: ["desert-resin"], colours: ["#8f9870", "#b0af84"] }),
});

export const DESERT_FLOWERS = Object.freeze({
    "rain-lily": Object.freeze({ id: "rain-lily", label: "Rain lily", seasons: ["spring", "summer"], colours: ["#d8d0ae", "#f1e9ca"], rainOnly: true }),
    "desert-poppy": Object.freeze({ id: "desert-poppy", label: "Desert poppy", seasons: ["spring"], colours: ["#d27342", "#efa46a"], rainOnly: true }),
    "sand-verbena": Object.freeze({ id: "sand-verbena", label: "Sand verbena", seasons: ["spring", "summer"], colours: ["#b884b0", "#d9b4d0"], rainOnly: true }),
    "desert-iris": Object.freeze({ id: "desert-iris", label: "Desert iris", seasons: ["spring"], colours: ["#9e86bd", "#cbbbe0"], rainOnly: false }),
});

export const DESERT_HERBS = Object.freeze({
    "desert-thyme": Object.freeze({ id: "desert-thyme", label: "Desert thyme", seasons: ["spring", "summer"], medicine: true, colour: "#b6a58f" }),
    wormwood: Object.freeze({ id: "wormwood", label: "Wormwood", seasons: ["summer", "autumn"], medicine: true, colour: "#a7a88a" }),
    senna: Object.freeze({ id: "senna", label: "Senna", seasons: ["summer", "autumn"], medicine: true, colour: "#c1b36a" }),
    "desert-sage": Object.freeze({ id: "desert-sage", label: "Desert sage", seasons: ["spring", "summer"], medicine: true, colour: "#b7b7a4" }),
});

export const DESERT_PALMS = Object.freeze({
    "date-palm": Object.freeze({
        id: "date-palm", label: "Date palm", kind: "oasis", crown: 0.82, trunk: 0.2,
        colours: { spring: "#6f8b4f", summer: "#547a43", autumn: "#897b46", winter: "#68724e" },
        goods: ["dates", "desert-fibre"], note: "a date palm rooted in a spring line",
    }),
    "doum-palm": Object.freeze({
        id: "doum-palm", label: "Doum palm", kind: "oasis", crown: 0.74, trunk: 0.24,
        colours: { spring: "#738e55", summer: "#5b8049", autumn: "#8a844d", winter: "#6d754f" },
        goods: ["dates", "desert-fibre"], note: "a forked doum palm shading a watering place",
    }),
    "fan-palm": Object.freeze({
        id: "fan-palm", label: "Fan palm", kind: "oasis", crown: 0.7, trunk: 0.18,
        colours: { spring: "#78935a", summer: "#5e844c", autumn: "#8e8850", winter: "#707953" },
        goods: ["dates", "desert-fibre"], note: "a fan palm at the edge of a seasonal pool",
    }),
});

export const DESERT_FAUNA = Object.freeze({
    fennec: Object.freeze({ id: "fennec", label: "Desert fox", group: "predator", kind: "fox", seasons: ["spring", "summer", "autumn", "winter"], nocturnal: true, waterIndependent: true }),
    "sand-cat": Object.freeze({ id: "sand-cat", label: "Sand cat", group: "predator", kind: "cat", seasons: ["spring", "summer", "autumn", "winter"], nocturnal: true, waterIndependent: true }),
    "horned-viper": Object.freeze({ id: "horned-viper", label: "Horned viper", group: "reptile", kind: "snake", seasons: ["spring", "summer", "autumn"], nocturnal: true, waterIndependent: true }),
    "monitor-lizard": Object.freeze({ id: "monitor-lizard", label: "Monitor lizard", group: "reptile", kind: "lizard", seasons: ["spring", "summer", "autumn"], waterIndependent: true }),
    scorpion: Object.freeze({ id: "scorpion", label: "Scorpion", group: "insect", kind: "scorpion", seasons: ["spring", "summer", "autumn"], nocturnal: true, waterIndependent: true }),
    "darkling-beetle": Object.freeze({ id: "darkling-beetle", label: "Darkling beetle", group: "insect", kind: "beetle", seasons: ["spring", "summer", "autumn"], waterIndependent: true }),
    jerboa: Object.freeze({ id: "jerboa", label: "Jerboa", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn", "winter"], nocturnal: true, waterIndependent: true }),
    "sand-rat": Object.freeze({ id: "sand-rat", label: "Sand rat", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn", "winter"], waterIndependent: true }),
    vulture: Object.freeze({ id: "vulture", label: "Desert vulture", group: "scavenger", kind: "vulture", seasons: ["spring", "summer", "autumn", "winter"] }),
    camel: Object.freeze({ id: "camel", label: "Camel", group: "livestock", kind: "camel", seasons: ["spring", "summer", "autumn", "winter"], waterIndependent: true }),
});

// Only genuinely new goods live here. Salt, wool, hides and herbs reuse the
// shared catalogue so the city ledger keeps one vocabulary.
export const DESERT_GOODS = Object.freeze({
    "desert-sand": Object.freeze({ id: "desert-sand", label: "Desert sand", category: "material" }),
    "desert-stone": Object.freeze({ id: "desert-stone", label: "Desert stone", category: "material" }),
    gemstones: Object.freeze({ id: "gemstones", label: "Gemstones", category: "luxury" }),
    "copper-ore": Object.freeze({ id: "copper-ore", label: "Copper ore", category: "material" }),
    "desert-herb": Object.freeze({ id: "desert-herb", label: "Desert herbs", category: "medicine" }),
    dates: Object.freeze({ id: "dates", label: "Dates", category: "gather" }),
    "desert-fibre": Object.freeze({ id: "desert-fibre", label: "Desert fibre", category: "fibre" }),
    "desert-resin": Object.freeze({ id: "desert-resin", label: "Desert resin", category: "resin" }),
    "archaeological-find": Object.freeze({ id: "archaeological-find", label: "Archaeological find", category: "luxury" }),
});

export const DESERT_SANDS = Object.freeze([
    Object.freeze({ id: "pale-gold", label: "Pale gold", hex: "#d9c08a", rgb: [217, 192, 138] }),
    Object.freeze({ id: "red-ochre", label: "Red ochre", hex: "#c98e62", rgb: [201, 142, 98] }),
    Object.freeze({ id: "ash-grey", label: "Ash grey", hex: "#b8ac95", rgb: [184, 172, 149] }),
    Object.freeze({ id: "rose-sand", label: "Rose sand", hex: "#d1a58d", rgb: [209, 165, 141] }),
]);

const DUNE_TYPES = Object.freeze([
    Object.freeze({ id: "small-hills", label: "Small sand hills" }),
    Object.freeze({ id: "great-dunes", label: "Great migrating dunes" }),
    Object.freeze({ id: "linear-ridges", label: "Long dune ridges" }),
    Object.freeze({ id: "crescent-dunes", label: "Crescent dunes" }),
    Object.freeze({ id: "wind-scour", label: "Wind-scoured hollows" }),
]);

const SEASON_FLOWER_CHANCE = Object.freeze({ spring: 0.66, summer: 0.3, autumn: 0.08, winter: 0.01 });
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

function seasonProfile(dayOfYear, climate) {
    const key = seasonKeyFor(dayOfYear);
    const base = seasonalState(Number(dayOfYear) || 0, climate === "cold" ? "northern" : "arid");
    const index = SEASON_KEYS.indexOf(key);
    const winter = index === 3;
    return {
        key, index, base,
        dayHeat: clamp01(base.warmth * (index === 1 ? 1 : index === 3 ? 0.32 : 0.68)),
        nightCold: clamp01(winter ? 0.92 : index === 1 ? 0.4 : 0.56),
        drought: clamp01(index === 1 ? 0.72 + (1 - base.greenUp) * 0.18 : index === 2 ? 0.46 : 0.18),
        rareRain: clamp01(index === 0 ? 0.38 : index === 2 ? 0.22 : 0.08),
        heavyRain: clamp01(index === 0 ? 0.44 : index === 2 ? 0.3 : 0.12),
        heat: clamp01(base.warmth * (index === 1 ? 1 : 0.5)),
        cold: winter ? clamp01(0.65 + (climate === "arid" ? 0.12 : 0.2)) : 0.08,
        snowCover: winter && climate !== "arid" ? clamp01(base.snowCover * 0.7) : 0,
    };
}

function normalizeUse(value = {}) {
    const explicit = value && typeof value === "object" ? value : {};
    const state = explicit.state || "wild";
    const grazed = Boolean(explicit.grazed || state === "grazed" || state === "overgrazed");
    const overgrazed = Boolean(explicit.overgrazed || state === "overgrazed");
    return {
        ...explicit, state, grazed, overgrazed,
        wild: Boolean(explicit.wild || state === "wild" || state === "feral"),
        trampled: Boolean(explicit.trampled || state === "trampled"),
        path: Boolean(explicit.path || state === "path"),
        settled: Boolean(explicit.settled || explicit.settlement || state === "settled"),
        irrigated: explicit.irrigated !== false,
        bareSoil: Boolean(explicit.bareSoil || overgrazed || state === "trampled"),
        intensity: clamp01(explicit.intensity ?? (overgrazed ? 0.95 : grazed ? 0.62 : explicit.trampled ? 0.8 : 0.12)),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (overgrazed ? "overgrazed desert margin" : grazed ? "grazed desert margin"
            : explicit.irrigated ? "irrigated oasis land" : explicit.trampled ? "trampled caravan ground" : "open desert"),
    };
}

function chooseFormation({ sand, rock, gravel, pebble, salt, semi, cold, mountain, basin }) {
    if (salt > 0.56) return "salt-flat";
    // A high, dry peak is a cold desert before it is a generic mountain
    // desert. This keeps both formations reachable in one arid realm.
    if (cold > 0.5) return "cold-desert";
    if (mountain || (rock > 0.58 && mountain)) return "mountain-desert";
    if (rock > 0.56) return "rock-desert";
    if (semi > 0.4) return "semi-desert";
    if (gravel > 0.52) return "gravel-desert";
    if (pebble > 0.52) return "pebble-plain";
    if (basin) return "dry-basin";
    if (sand > 0.48) return "sand-sea";
    return "dune-field";
}

function flowerPool(season) {
    return Object.values(DESERT_FLOWERS).filter(flower => flower.seasons.includes(season));
}

function herbPool(season) {
    return Object.values(DESERT_HERBS).filter(herb => herb.seasons.includes(season));
}

function buildFlowers(seed, x, y, season, bloom) {
    if (bloom <= 0.04) return [];
    const pool = flowerPool(season);
    if (!pool.length || unit(seed, x, y, 0x464c4f57) > bloom) return [];
    const chosen = [];
    const count = 1 + Math.floor(unit(seed, x, y, 0x464c4f58) * (bloom > 0.34 ? 3 : 2));
    for (let index = 0; index < count; index++) {
        const flower = pick(seed, x + index * 3, y - index, pool, 0x464c4f59 + index);
        if (flower && !chosen.some(entry => entry.id === flower.id)) chosen.push(flower);
    }
    return chosen;
}

function buildPalmGrove(seed, x, y, { formation, moisture, oasis, spring, waterhole, season }) {
    if (!oasis && !spring && !waterhole) return [];
    if (formation.id === "sand-sea" || formation.id === "rock-desert" || formation.id === "salt-flat") return [];
    const poolIds = ["date-palm", "doum-palm", "fan-palm"];
    const count = oasis ? 3 + Math.floor(unit(seed, x, y, 0x50414c4d) * 3)
        : spring ? 2 : 1;
    const grove = [];
    for (let index = 0; index < count; index++) {
        const palm = DESERT_PALMS[poolIds[hash32(seed, x, y, 0x50414c4e + index) % poolIds.length]];
        if (!palm) continue;
        grove.push({
            ...palm,
            offsetX: (unit(seed, x + index, y, 0x50414c4f) - 0.5) * 0.7,
            offsetY: (unit(seed, x, y + index, 0x50414c50) - 0.5) * 0.38,
            scale: 0.82 + unit(seed, x, y + index, 0x50414c51) * 0.34,
            seasonColour: palm.colours[season] || palm.colours.summer,
        });
    }
    return grove;
}

function buildFauna(seed, x, y, context) {
    const { season, night, water, oasis, heat, cover, caravan, rocks, sand } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = DESERT_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(5, Math.round(count))) });
    };
    if (unit(seed, x, y, 0x46454e4e) > 0.38) add("fennec");
    if (rocks > 0.3 && unit(seed, x, y, 0x53414e44) > 0.56) add("sand-cat");
    if (sand > 0.24 && unit(seed, x, y, 0x56495045) > 0.42) add("horned-viper");
    if (rocks > 0.25 && unit(seed, x, y, 0x4c495a41) > 0.5) add("monitor-lizard");
    if (unit(seed, x, y, 0x53434f52) > 0.42) add("scorpion");
    if (unit(seed, x, y, 0x42454554) > 0.58) add("darkling-beetle");
    if (unit(seed, x, y, 0x4a455242) > 0.4) add("jerboa");
    if (sand > 0.36 && unit(seed, x, y, 0x52415431) > 0.62) add("sand-rat");
    if (cover < 0.56 && unit(seed, x, y, 0x56554c54) > 0.4) add("vulture");
    if ((caravan || oasis || water) && unit(seed, x, y, 0x43414d45) > 0.32) add("camel", 2);
    // Night is a real activity window, not a cosmetic tint. Nocturnal animals
    // are added even when the same tile is quiet at noon.
    if (night && unit(seed, x, y, 0x4e494748) > 0.28) {
        add("fennec");
        add("jerboa");
        add("scorpion");
    }
    if (heat > 0.6 && water > 0.2 && unit(seed, x, y, 0x57415452) > 0.5) add("camel", 2);
    return fauna.slice(0, 7);
}

function buildGoods(seed, x, y, context) {
    const { season, salt, sand, stone, gems, metal, herbs, palms, fauna, oasis, fertile, resin, archaeology, wool } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.06 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    if (salt > 0.28) add("salt", "Salt", "gather", salt);
    if (sand > 0.24) add("desert-sand", "Desert sand", "material", sand * 0.8);
    if (stone > 0.25) add("desert-stone", "Desert stone", "material", stone * 0.82);
    if (gems > 0.42) add("gemstones", "Gemstones", "luxury", gems * 0.7);
    if (metal > 0.36) add("copper-ore", "Copper ore", "material", metal * 0.66);
    if (herbs.length) add("desert-herb", "Desert herbs", "medicine", 0.3 + herbs.length * 0.08);
    if (palms.length || oasis || fertile > 0.3) add("dates", "Dates", "gather", 0.4 + palms.length * 0.08);
    if (resin > 0.28) add("desert-resin", "Desert resin", "resin", resin);
    if (archaeology > 0.45) add("archaeological-find", "Archaeological find", "luxury", archaeology * 0.6);
    if (wool > 0.3) add("wool", "Wool", "gather", wool);
    if (fauna.some(entry => entry.group === "livestock" || entry.group === "predator")) add("hides", "Hides", "hunt", 0.28);
    if (fauna.some(entry => entry.group === "livestock")) add("game", "Wild game", "hunt", 0.22);
    if (season === "winter" && fauna.some(entry => entry.group === "predator")) add("fur", "Furs", "hunt", 0.2);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

export function desertPotentialAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.16);
    const temperature = clamp01(context.temperature ?? 0.78);
    const height = clamp01(context.height ?? 0.4);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "arid";
    const aridity = clamp01(number(context.aridity, 72) / 100);
    const aridClimate = climate === "arid" ? 1
        : climate === "mediterranean" ? 0.58
            : climate === "temperate" && aridity > 0.7 ? 0.34
                : climate === "northern" && height > seaLevel + 0.28 && aridity > 0.52 ? 0.26 : 0;
    if (!aridClimate) return 0;
    const dry = 1 - smoothstep(0.22, 0.58, moisture);
    const open = height >= seaLevel + 0.008 && height < 0.94 ? 1 : 0;
    const hot = smoothstep(0.42, 0.74, temperature);
    const coldHigh = climate === "northern" || (temperature < 0.36 && height > seaLevel + 0.2);
    const roll = coarse(seed, x, y, 7, 0x44455345);
    return clamp01(aridClimate * dry * open * (coldHigh ? 0.55 : 0.35 + hot * 0.65) * (0.72 + roll * 0.38));
}

export function isDesertSite(x, y, context = {}) {
    return desertPotentialAt(x, y, context) > 0.24;
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

/**
 * Derive the complete desert profile for one tile. The function is pure and
 * deterministic for the same inputs; `use` is optional and is supplied by the
 * terrain/settlement layer from real buildings, roads and oasis irrigation.
 */
export function desertProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.16);
    const temperature = clamp01(context.temperature ?? 0.78);
    const height = clamp01(context.height ?? 0.4);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "arid";
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const aridity = clamp01(number(context.aridity, 72) / 100);
    const season = seasonProfile(dayOfYear, climate);
    const key = season.key;
    const use = normalizeUse(context.use);
    const night = hour < 6 || hour >= 20;
    const relief = coarse(seed, x, y, 7, 0x52454c49);
    const duneRoll = coarse(seed, x, y, 5, 0x44554e45);
    const rockRoll = coarse(seed, x, y, 6, 0x524f434b);
    const gravelRoll = coarse(seed, x, y, 4, 0x47524156);
    const saltRoll = coarse(seed, x, y, 8, 0x53414c54);
    const heightAboveSea = Math.max(0, height - seaLevel);
    const hill = heightAboveSea > 0.25;
    const mountain = heightAboveSea > 0.36 || (hill && relief > 0.72);
    const basin = heightAboveSea < 0.14 && relief < 0.42;
    const sand = clamp01((1 - moisture) * 0.76 + duneRoll * 0.34 + heightAboveSea * 0.08 - 0.16);
    const rock = clamp01(heightAboveSea * 1.18 + rockRoll * 0.46 - 0.2);
    const gravel = clamp01((1 - moisture) * 0.38 + gravelRoll * 0.54 + rock * 0.2 - 0.2);
    const pebble = clamp01((1 - moisture) * 0.28 + gravelRoll * 0.5 + relief * 0.2 - 0.2);
    const salt = clamp01((1 - moisture) * 0.82 + saltRoll * 0.35 - 0.55);
    const semi = clamp01(moisture * 0.9 + (temperature < 0.48 ? 0.12 : 0) + (1 - sand) * 0.16 - 0.08);
    const cold = clamp01((temperature < 0.38 ? 0.62 : 0.08) + heightAboveSea * 0.85 + (climate === "northern" ? 0.2 : 0));
    const duneField = sand > 0.3 && rock < 0.3;
    const sandSea = sand > 0.54 && rock < 0.3 && salt < 0.4;
    const formation = DESERT_FORMATIONS[chooseFormation({ sand, rock, gravel, pebble, salt, semi, cold, mountain, basin })];
    const sandDef = DESERT_SANDS[hash32(seed, x, y, 0x534e4431) % DESERT_SANDS.length];
    const duneTypes = [];
    if (duneField) {
        if (relief < 0.28) duneTypes.push(DUNE_TYPES[0]);
        if (relief > 0.68) duneTypes.push(DUNE_TYPES[1]);
        if (coarse(seed, x, y, 3, 0x52494447) > 0.58) duneTypes.push(DUNE_TYPES[2]);
        if (coarse(seed, x, y, 5, 0x43524553) > 0.54) duneTypes.push(DUNE_TYPES[3]);
        if (coarse(seed, x, y, 6, 0x53434f55) > 0.64 || (gravel > 0.36 && relief < 0.3)) duneTypes.push(DUNE_TYPES[4]);
    }
    const exposedRock = rock > 0.3;
    const boulders = rock > 0.46 && relief > 0.5;
    const cliff = rock > 0.52 && (heightAboveSea > 0.18 || relief > 0.62);
    const mesa = rock > 0.58 && relief > 0.48 && heightAboveSea > 0.3;
    const canyon = rock > 0.4 && (relief > 0.7 || coarse(seed, x, y, 9, 0x43414e59) > 0.78);
    const rugged = rock > 0.56 && mountain;
    const weathered = rock > 0.26 && relief > 0.38;
    const scree = gravel > 0.3 && rock > 0.24;
    const erosion = gravel > 0.32 && (relief > 0.52 || coarse(seed, x, y, 7, 0x45524f44) > 0.66);
    const cave = rock > 0.44 && (relief > 0.58 || coarse(seed, x, y, 8, 0x43415645) > 0.78);
    const spring = moisture > 0.38 && (basin || coarse(seed, x, y, 11, 0x53505249) > 0.74);
    const oasis = Boolean((spring || moisture > 0.5) && temperature > 0.36 && !salt);
    const pond = Boolean(oasis && coarse(seed, x, y, 13, 0x504f4e44) > 0.58);
    const waterhole = Boolean(oasis || spring || (basin && moisture > 0.25));
    const groundwater = Boolean(spring || oasis || (moisture > 0.34 && basin));
    const fertile = clamp01((oasis ? 0.52 : 0) + (spring ? 0.22 : 0) + (groundwater ? 0.14 : 0) + (1 - salt) * 0.12);
    const fields = Boolean(oasis && fertile > 0.42 && !use.bareSoil);
    const orchards = Boolean(oasis && fertile > 0.36 && !use.bareSoil);
    const caravan = Boolean(waterhole && ((use.path || use.settled) || coarse(seed, x, y, 17, 0x43415241) > 0.62));
    const settlementSuitable = Boolean(oasis && fertile > 0.42 && waterhole);
    const archaeology = clamp01((rock > 0.34 ? 0.28 : 0) + (cave ? 0.24 : 0) + (coarse(seed, x, y, 19, 0x41524348) > 0.7 ? 0.36 : 0) + (1 - moisture) * 0.12);
    const gems = clamp01((rock > 0.48 ? 0.34 : 0) + (cave ? 0.2 : 0) + coarse(seed, x, y, 21, 0x47454d53) * 0.52 - 0.18);
    const metal = clamp01((rock > 0.4 ? 0.28 : 0) + (canyon ? 0.22 : 0) + coarse(seed, x, y, 22, 0x4d455441) * 0.5 - 0.18);
    const saltMineral = clamp01(salt * 1.1 + (basin ? 0.1 : 0));
    const stone = clamp01(rock * 0.92 + gravel * 0.24);
    const resin = clamp01((formation.id === "semi-desert" ? 0.24 : 0.12) + (oasis ? 0.12 : 0) + coarse(seed, x, y, 23, 0x52455349) * 0.3);
    const deepRoots = Boolean(formation.plants.length || formation.shrubs.length || oasis);
    const grasses = formation.plants.map(id => DESERT_GRASSES[id]).filter(Boolean);
    const shrubs = formation.shrubs.map(id => DESERT_SHRUBS[id]).filter(Boolean);
    const succulents = ["agave", "aloe", "barrel-cactus", "euphorbia"].map(id => DESERT_SUCCULENTS[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x53554343 + index) > (1 - semi) * 0.46);
    const bloomChance = SEASON_FLOWER_CHANCE[key] * (0.25 + season.heavyRain * 0.75) * (weather === "rain" ? 1.4 : 1);
    const bloom = clamp01(bloomChance * (0.3 + coarse(seed, x, y, 3, 0x464c4f50) * 0.75) * (0.7 + moisture * 0.2) * (1 - salt * 0.5));
    const flowers = buildFlowers(seed, x, y, key, bloom);
    const herbs = herbPool(key).filter((herb, index) => unit(seed, x, y, 0x48455242 + index) > (1 - moisture) * 0.62);
    const palms = buildPalmGrove(seed, x, y, { formation, moisture, oasis, spring, waterhole, season: key });
    const grassDensity = clamp01(formation.plants.length / 2 * (0.3 + moisture * 0.7) + (semi > 0.42 ? 0.28 : 0) - salt * 0.2);
    const shrubCover = clamp01(formation.shrubs.length * 0.22 + semi * 0.22 + (oasis ? 0.12 : 0));
    const cover = clamp01(shrubCover * 0.5 + palms.length * 0.09 + (rock > 0.4 ? 0.16 : 0) + cold * 0.08);
    const heat = clamp01(season.heat * (0.55 + (1 - moisture) * 0.45) * (hour >= 10 && hour <= 16 ? 1 : 0.62));
    const nightCold = clamp01(season.nightCold * (1 - moisture * 0.24) * (night ? 1 : 0.35));
    const dust = clamp01((1 - moisture) * 0.3 + sand * 0.32 + season.drought * 0.2 + wind * 0.06);
    const sandstorm = clamp01((weather === "storm" ? 0.7 : 0) + dust * 0.46 + (wind > 1.4 ? 0.22 : 0) - (oasis ? 0.18 : 0));
    const heavyRain = clamp01((weather === "rain" ? 0.56 : 0) + season.heavyRain * 0.44);
    const flashFlood = clamp01(heavyRain * 0.5 + (canyon || basin ? 0.28 : 0) + (1 - moisture) * 0.08);
    const drought = clamp01(season.drought * 0.78 + (1 - moisture) * 0.16 + aridity * 0.08);
    const visibility = clamp01(dust * 0.6 + sandstorm * 0.38 + (weather === "fog" ? 0.18 : 0));
    const waterScarcity = clamp01((1 - moisture) * 0.72 + drought * 0.3 - (waterhole ? 0.2 : 0) + salt * 0.16);
    const supplyCost = clamp01(0.3 + (1 - moisture) * 0.28 + (1 - waterhole) * 0.18 + settlementSuitable * -0.1 + (1 - fertile) * 0.18);
    const agriculture = clamp01(fertile * 0.72 + (oasis ? 0.22 : 0) - salt * 0.28 - drought * 0.2);
    const caravanTrade = clamp01((waterhole ? 0.32 : 0) + (oasis ? 0.28 : 0) + (1 - cover) * 0.16 + (use.path ? 0.18 : 0));
    const storage = clamp01(0.4 + drought * 0.24 + (1 - waterhole) * 0.16 + season.dayHeat * 0.12);
    const wool = clamp01((formation.id === "semi-desert" ? 0.36 : 0.12) + (1 - moisture) * 0.2);
    const fauna = buildFauna(seed, x, y, { season: key, night, water: waterhole, oasis, heat, cover, caravan, rocks: rock, sand });
    const goods = buildGoods(seed, x, y, {
        season: key, salt: saltMineral, sand, stone, gems, metal, herbs, palms, fauna, oasis,
        fertile, resin, archaeology, wool,
    });
    const trees = palms.map(palm => ({
        ...palm,
        kind: "palm",
        crown: palm.crown,
        colours: palm.colours,
    }));
    const features = new Set();
    const mark = (...ids) => { for (const id of ids) features.add(id); };
    if (sandSea || duneField) mark("1.2.8.1");
    if (rock > 0.3 || exposedRock) mark("1.2.8.2");
    if (gravel > 0.34) mark("1.2.8.3");
    if (pebble > 0.38) mark("1.2.8.4");
    if (salt > 0.4) mark("1.2.8.5");
    if (semi > 0.36) mark("1.2.8.6");
    if (cold > 0.45) mark("1.2.8.7");
    if (mountain) mark("1.2.8.8");
    if (basin) mark("1.2.8.9");
    for (const dune of duneTypes) {
        if (dune.id === "small-hills") mark("1.2.8.10");
        if (dune.id === "great-dunes") mark("1.2.8.11");
        if (dune.id === "linear-ridges") mark("1.2.8.12");
        if (dune.id === "crescent-dunes") mark("1.2.8.13");
        if (dune.id === "wind-scour") mark("1.2.8.14");
    }
    if (sand > 0.2) mark("1.2.8.15");
    if (exposedRock) mark("1.2.8.16");
    if (sand > 0.25 && rock > 0.2) mark("1.2.8.17");
    if (boulders) mark("1.2.8.18");
    if (cliff) mark("1.2.8.19");
    if (mesa) mark("1.2.8.20");
    if (canyon) mark("1.2.8.21");
    if (rugged) mark("1.2.8.22");
    if (weathered) mark("1.2.8.23");
    if (scree) mark("1.2.8.24");
    if (erosion) mark("1.2.8.25");
    if (cave) mark("1.2.8.26");
    if (shrubs.length) mark("1.2.8.27");
    if (grasses.length) mark("1.2.8.28");
    if (succulents.length) mark("1.2.8.29");
    if (flowers.length) mark("1.2.8.30");
    if (deepRoots) mark("1.2.8.31");
    if (palms.length) mark("1.2.8.32");
    if (grasses.length && semi > 0.36) mark("1.2.8.33");
    if (groundwater) mark("1.2.8.34");
    if (spring) mark("1.2.8.35");
    if (palms.length && oasis) mark("1.2.8.36");
    if (pond) mark("1.2.8.37");
    if (fertile > 0.3) mark("1.2.8.38");
    if (fields) mark("1.2.8.39");
    if (orchards) mark("1.2.8.40");
    if (waterhole) mark("1.2.8.41");
    if (caravan) mark("1.2.8.42");
    if (settlementSuitable) mark("1.2.8.43");
    if (fauna.some(entry => entry.group === "predator")) mark("1.2.8.44");
    if (fauna.some(entry => entry.group === "reptile")) mark("1.2.8.45");
    if (fauna.some(entry => entry.group === "insect")) mark("1.2.8.46");
    if (fauna.some(entry => entry.group === "rodent")) mark("1.2.8.47");
    if (fauna.some(entry => entry.group === "scavenger")) mark("1.2.8.48");
    if (fauna.some(entry => entry.group === "livestock")) mark("1.2.8.49");
    if (fauna.some(entry => entry.nocturnal)) mark("1.2.8.50");
    if (fauna.some(entry => entry.waterIndependent)) mark("1.2.8.51");
    if (saltMineral > 0.25) mark("1.2.8.52");
    if (goods.some(good => good.id === "desert-sand" || good.id === "desert-stone")) mark("1.2.8.53");
    if (gems > 0.34 || metal > 0.3) mark("1.2.8.54");
    if (herbs.length || goods.some(good => good.id === "desert-herb")) mark("1.2.8.55");
    if (goods.some(good => good.id === "dates")) mark("1.2.8.56");
    if (goods.some(good => good.id === "hides" || good.id === "wool")) mark("1.2.8.57");
    if (resin > 0.28 || goods.some(good => good.id === "desert-resin")) mark("1.2.8.58");
    if (archaeology > 0.38) mark("1.2.8.59");
    if (heat > 0.4) mark("1.2.8.60");
    if (nightCold > 0.3) mark("1.2.8.61");
    if (sandstorm > 0.4) mark("1.2.8.62");
    if (dust > 0.28) mark("1.2.8.63");
    if (heavyRain > 0.3) mark("1.2.8.64");
    if (flashFlood > 0.3) mark("1.2.8.65");
    if (drought > 0.3) mark("1.2.8.66");
    if (visibility > 0.38) mark("1.2.8.67");
    if (waterScarcity > 0.3) mark("1.2.8.68");
    if (supplyCost > 0.36) mark("1.2.8.69");
    if (agriculture < 0.52 || !oasis) mark("1.2.8.70");
    if (waterhole && caravan) mark("1.2.8.71");
    if (waterhole) mark("1.2.8.72");
    if (caravanTrade > 0.35) mark("1.2.8.73");
    if (sand > 0.2 || rock > 0.3 || oasis) mark("1.2.8.74");
    if (storage > 0.4) mark("1.2.8.75");

    const sandBase = sandDef.rgb;
    const groundColour = mixColour(sandBase, [154, 143, 117], clamp01(gravel * 0.3 + salt * 0.18));
    const grassColour = mixColour([176, 164, 111], [137, 138, 92], clamp01(semi * 0.5 + moisture * 0.2));
    const leafColour = palms[0]?.seasonColour || "#6d8650";
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.18) * 0.72);
    const haze = clamp01((1 - moisture) * 0.3 + dust * 0.26 + heat * 0.1);

    return {
        biome: "desert", desert: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season: key, seasonIndex: season.index, climate, moisture, temperature, height, aridity,
        features: DESERT_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            sandSea, duneField, basin, hill, mountain, saltFlat: salt > 0.4,
            label: formation.label,
        },
        dunes: {
            types: duneTypes.map(dune => dune.id), primary: duneTypes[0]?.id || null,
            label: duneTypes[0]?.label || "wind-smoothed sand",
            height: clamp01(duneRoll * 0.8 + sand * 0.35), drift: clamp01(wind * 0.2 + drought * 0.2),
        },
        sand: { amount: sand, colour: sandDef.id, hex: sandDef.hex, colourCount: DESERT_SANDS.length },
        rocks: {
            exposed: exposedRock, boulders, cliff, mesa, canyon, rugged, weathered, scree, erosion, cave,
            cover: rock,
        },
        soil: { moisture, salt, gravel, pebble, stone, fertile, agriculture, degradation: clamp01(drought * 0.4 + salt * 0.2 + use.overgrazed * 0.3) },
        vegetation: {
            grasses, shrubs, succulents, flowers, herbs, palms, trees,
            density: grassDensity, shrubCover, cover, deepRoots,
            groundwater, bloom, treeChance: palms.length ? 0.3 : 0,
        },
        water: {
            spring, oasis, pond, waterhole, groundwater,
            scarcity: waterScarcity, source: spring ? "spring" : pond ? "pond" : oasis ? "oasis" : waterhole ? "waterhole" : null,
        },
        settlement: {
            suitable: settlementSuitable, fields, orchards, irrigation: Boolean(oasis || groundwater),
            label: settlementSuitable ? "oasis settlement" : caravan ? "caravan stop" : "open desert",
        },
        economy: {
            waterCost: clamp01(0.2 + waterScarcity * 0.6), supplyCost, agriculture,
            caravanTrade, storage, wellControl: clamp01((waterhole ? 0.5 : 0) + waterScarcity * 0.3),
            building: clamp01(0.35 + (1 - moisture) * 0.2 + (1 - waterhole) * 0.16),
        },
        materials: { salt: saltMineral, stone, gems, metal, sand, resin, archaeology },
        hazards: { heat, nightCold, sandstorm, dust, heavyRain, flashFlood, drought, visibility, waterScarcity },
        fauna, goods,
        use,
        visual: {
            sunlight, haze, dust, dustStorm: sandstorm, mirage: clamp01(heat * 0.48 + (1 - moisture) * 0.2),
            wind, windSway: clamp01(wind * (palms.length ? 0.52 : 0.2)), snowCover: season.snowCover,
            phase: unit(seed, x, y, 0x57494e44) * Math.PI * 2,
            sandHex: sandDef.hex, groundHex: hexColour(groundColour), grassHex: hexColour(grassColour),
            leafHex: leafColour, noonHeat: clamp01(heat * (hour >= 10 && hour <= 16 ? 1 : 0.5)),
        },
        grassHex: hexColour(grassColour), groundHex: hexColour(groundColour), leafColour,
        sandColour: sandDef.id, sandHex: sandDef.hex,
        trees, treeChance: palms.length ? 0.3 : 0, sward: { height: "short", density: grassDensity },
        seasonalMovement: fauna.some(entry => entry.waterIndependent)
            ? "animals range widely between water and shade" : "wildlife waits out the heat in cover",
        seasonalNote: `${formation.label} · ${sandDef.label} sand · ${waterhole ? "water present" : "dry ground"}`,
    };
}

export function desertGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => good.id !== "dates" || (season === "summer" || season === "autumn"));
}

export function desertProductsAt(x, y, context = {}) {
    const profile = desertProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.02) return null;
    const goods = desertGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function desertSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const water = profile.water.source ? " · " + profile.water.source : " · dry";
    return `${profile.label} · ${profile.sand.colour} sand · ${Math.round(profile.sand.amount * 100)}% sand · ${goods} · ${wildlife}${water}`;
}

export function desertRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const DESERT_LIMITS = Object.freeze({
    requirements: DESERT_REQUIREMENTS.length,
    maxFauna: 7,
    maxFlowers: 4,
    maxGoods: 9,
    formations: Object.keys(DESERT_FORMATIONS).length,
    duneTypes: DUNE_TYPES.length,
});
