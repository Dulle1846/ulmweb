// Swamps and bogs (spec 1.2.11.1–1.2.11.81).
//
// A wetland is not grass with a blue tint. It is a waterlogged habitat with its
// own landforms, hydrology, soils, flora, fauna, harvests and hazards. This
// module derives one bounded, deterministic profile per tile from the same
// seed, terrain, season, weather and land-use inputs as every other ecosystem.
// Terrain detail, gathering, surveys, movement costs and the shared good ledger
// all read this profile; no per-tile state and no extra tick loop are added.

import { seasonalState } from "./season.js";

export const SWAMP_REQUIREMENTS = Object.freeze([
    { id: "1.2.11.1", key: "shallow-water-swamps", label: "Shallow-water swamps", group: "water" },
    { id: "1.2.11.2", key: "deep-water-swamps", label: "Deep-water swamps", group: "water" },
    { id: "1.2.11.3", key: "reed-swamps", label: "Reed swamps", group: "water" },
    { id: "1.2.11.4", key: "alder-carr", label: "Alder carr woodland", group: "vegetation" },
    { id: "1.2.11.5", key: "fens", label: "Fens and seepage mires", group: "landform" },
    { id: "1.2.11.6", key: "raised-bogs", label: "Raised bogs", group: "landform" },
    { id: "1.2.11.7", key: "peat-bogs", label: "Peat bogs", group: "landform" },
    { id: "1.2.11.8", key: "flooded-floodplains", label: "Flooded river floodplains", group: "water" },
    { id: "1.2.11.9", key: "seasonal-wetlands", label: "Seasonal wetlands", group: "water" },
    { id: "1.2.11.10", key: "coastal-mangroves", label: "Coastal swamps and mangroves", group: "water" },
    { id: "1.2.11.11", key: "reeds-bulrushes", label: "Reeds and bulrushes", group: "vegetation" },
    { id: "1.2.11.12", key: "sedges-rushes", label: "Sedges and rushes", group: "vegetation" },
    { id: "1.2.11.13", key: "mosses-sphagnum", label: "Mosses and sphagnum", group: "vegetation" },
    { id: "1.2.11.14", key: "aquatic-plants", label: "Aquatic plants", group: "vegetation" },
    { id: "1.2.11.15", key: "water-lilies", label: "Water lilies", group: "vegetation" },
    { id: "1.2.11.16", key: "swamp-grasses", label: "Swamp grasses", group: "vegetation" },
    { id: "1.2.11.17", key: "alders-willows", label: "Alders and willows", group: "vegetation" },
    { id: "1.2.11.18", key: "swamp-shrubs", label: "Swamp shrubs", group: "vegetation" },
    { id: "1.2.11.19", key: "carnivorous-plants", label: "Carnivorous plants in suitable bogs", group: "vegetation" },
    { id: "1.2.11.20", key: "plant-islands", label: "Dense plant islands in the water", group: "vegetation" },
    { id: "1.2.11.21", key: "small-pools", label: "Small pools", group: "water" },
    { id: "1.2.11.22", key: "shallow-water", label: "Shallow water surfaces", group: "water" },
    { id: "1.2.11.23", key: "deep-water-holes", label: "Deep water holes", group: "water" },
    { id: "1.2.11.24", key: "hidden-gullies", label: "Hidden water-filled gullies", group: "water" },
    { id: "1.2.11.25", key: "slow-watercourses", label: "Slow watercourses", group: "water" },
    { id: "1.2.11.26", key: "flooded-hollows", label: "Flooded hollows", group: "water" },
    { id: "1.2.11.27", key: "water-turbidity", label: "Water of different turbidity", group: "water" },
    { id: "1.2.11.28", key: "seasonal-water-levels", label: "Seasonal water-level changes", group: "water" },
    { id: "1.2.11.29", key: "muddy-banks", label: "Muddy banks", group: "soil" },
    { id: "1.2.11.30", key: "soft-mud", label: "Soft mud", group: "soil" },
    { id: "1.2.11.31", key: "peat-soils", label: "Peat soils", group: "soil" },
    { id: "1.2.11.32", key: "unstable-ground", label: "Wet and unstable ground", group: "soil" },
    { id: "1.2.11.33", key: "vegetation-mats", label: "Water-soaked vegetation mats", group: "soil" },
    { id: "1.2.11.34", key: "firm-islands", label: "Small firm islands", group: "landform" },
    { id: "1.2.11.35", key: "root-mats", label: "Root networks", group: "soil" },
    { id: "1.2.11.36", key: "decaying-material", label: "Decaying plant material", group: "soil" },
    { id: "1.2.11.37", key: "bearing-capacity", label: "Variable ground bearing capacity", group: "soil" },
    { id: "1.2.11.38", key: "frogs-toads", label: "Frogs and toads", group: "fauna" },
    { id: "1.2.11.39", key: "snakes-amphibians", label: "Snakes and amphibians", group: "fauna" },
    { id: "1.2.11.40", key: "ducks-geese-herons", label: "Ducks, geese and herons", group: "fauna" },
    { id: "1.2.11.41", key: "storks-wetland-birds", label: "Storks and other wetland birds", group: "fauna" },
    { id: "1.2.11.42", key: "beavers-otters", label: "Beavers and otters", group: "fauna" },
    { id: "1.2.11.43", key: "fish", label: "Fish and marsh eels", group: "fauna" },
    { id: "1.2.11.44", key: "insects-dragonflies", label: "Insects and dragonflies", group: "fauna" },
    { id: "1.2.11.45", key: "swamp-mammals", label: "Swamp-dwelling mammals", group: "fauna" },
    { id: "1.2.11.46", key: "reed-basketry", label: "Reeds and basketry material", group: "economy" },
    { id: "1.2.11.47", key: "peat-fuel", label: "Peat as fuel", group: "economy" },
    { id: "1.2.11.48", key: "medicinal-plants", label: "Medicinal plants", group: "economy" },
    { id: "1.2.11.49", key: "fish-waterfowl", label: "Fish and waterfowl", group: "economy" },
    { id: "1.2.11.50", key: "berries-fruits", label: "Berries and swamp fruit", group: "economy" },
    { id: "1.2.11.51", key: "carr-timber", label: "Timber from carr woodland", group: "economy" },
    { id: "1.2.11.52", key: "clay-mud", label: "Clay and mud", group: "economy" },
    { id: "1.2.11.53", key: "rare-bog-plants", label: "Rare bog plants", group: "economy" },
    { id: "1.2.11.54", key: "organic-materials", label: "Organic raw materials", group: "economy" },
    { id: "1.2.11.55", key: "sinking-mud", label: "Sinking into mud and peat", group: "hazard" },
    { id: "1.2.11.56", key: "hidden-depth", label: "Hidden deep water", group: "hazard" },
    { id: "1.2.11.57", key: "insect-disease", label: "Diseases carried by insects", group: "hazard" },
    { id: "1.2.11.58", key: "contaminated-water", label: "Contaminated water", group: "hazard" },
    { id: "1.2.11.59", key: "fever-infection", label: "Fever and infection", group: "hazard" },
    { id: "1.2.11.60", key: "difficult-navigation", label: "Difficult orientation", group: "hazard" },
    { id: "1.2.11.61", key: "fog-limited-sight", label: "Fog and limited visibility", group: "hazard" },
    { id: "1.2.11.62", key: "high-movement-cost", label: "High movement costs", group: "hazard" },
    { id: "1.2.11.63", key: "heavy-wagons", label: "Danger for heavy wagons and siege engines", group: "hazard" },
    { id: "1.2.11.64", key: "dry-island-settlements", label: "Settlements on raised dry ground", group: "economy" },
    { id: "1.2.11.65", key: "boardwalks", label: "Timber walkways and boardwalks", group: "economy" },
    { id: "1.2.11.66", key: "bridges-dams", label: "Small bridges and dams", group: "economy" },
    { id: "1.2.11.67", key: "drainage", label: "Drainage works", group: "economy" },
    { id: "1.2.11.68", key: "peat-cutting", label: "Peat extraction", group: "economy" },
    { id: "1.2.11.69", key: "fishing", label: "Fishing", group: "economy" },
    { id: "1.2.11.70", key: "reed-craft", label: "Reed and basketry craft", group: "economy" },
    { id: "1.2.11.71", key: "natural-defences", label: "Natural defensive positions", group: "economy" },
    { id: "1.2.11.72", key: "difficult-development", label: "Difficult opening of large wetlands", group: "economy" },
    { id: "1.2.11.73", key: "ground-fog", label: "Ground fog", group: "visual" },
    { id: "1.2.11.74", key: "water-mist", label: "Mist over water surfaces", group: "visual" },
    { id: "1.2.11.75", key: "reflections", label: "Reflections in still water", group: "visual" },
    { id: "1.2.11.76", key: "moving-reeds", label: "Reeds moving in the wind", group: "visual" },
    { id: "1.2.11.77", key: "dark-water", label: "Dark and turbid water areas", group: "visual" },
    { id: "1.2.11.78", key: "mossy-trunks", label: "Moss-covered tree trunks", group: "visual" },
    { id: "1.2.11.79", key: "bubbles", label: "Bubbles and small water movements", group: "visual" },
    { id: "1.2.11.80", key: "insect-swarms", label: "Swarms of insects", group: "visual" },
    { id: "1.2.11.81", key: "light-moods", label: "Different light between open and wooded swamp", group: "visual" },
]);

export const SWAMP_REQUIREMENT_IDS = Object.freeze(SWAMP_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(SWAMP_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const SWAMP_FORMATIONS = Object.freeze({
    "shallow-swamp": Object.freeze({
        id: "shallow-swamp", label: "Shallow-water swamp", height: "low",
        note: "warm open water over mud, crowded with reeds, floating leaves and plant islands",
        reeds: ["common-reed", "bulrush"], sedges: ["greater-sedge", "soft-rush"], mosses: ["sphagnum"],
        waterPlants: ["water-lily", "duckweed"], grasses: [], shrubs: ["willow-scrub"],
        trees: ["willow"], herbs: ["marsh-woundwort"], flowers: ["marsh-marigold"], carnivorous: [],
    }),
    "deep-water-swamp": Object.freeze({
        id: "deep-water-swamp", label: "Deep-water swamp", height: "water",
        note: "dark open pools and drowned channels with little firm ground between them",
        reeds: ["bulrush"], sedges: ["saw-sedge"], mosses: [],
        waterPlants: ["water-lily", "frogbit", "bladderwort"], grasses: [], shrubs: [],
        trees: [], herbs: [], flowers: [], carnivorous: ["bladderwort"],
    }),
    "reed-swamp": Object.freeze({
        id: "reed-swamp", label: "Reed swamp", height: "tall",
        note: "a dense waving wall of reed and cattail standing in shallow brown water",
        reeds: ["common-reed", "cattail", "reed-grass"], sedges: ["greater-sedge", "soft-rush"], mosses: [],
        waterPlants: ["duckweed"], grasses: ["swamp-grass"], shrubs: ["willow-scrub"],
        trees: [], herbs: ["marsh-woundwort"], flowers: ["marsh-marigold"], carnivorous: [],
    }),
    "alder-carr": Object.freeze({
        id: "alder-carr", label: "Alder carr", height: "wooded",
        note: "alder and willow rising from black water, their trunks wrapped in moss",
        reeds: ["reed-grass"], sedges: ["soft-rush"], mosses: ["sphagnum", "feather-moss"],
        waterPlants: ["water-lily"], grasses: [], shrubs: ["alder-sapling", "bog-myrtle", "willow-scrub"],
        trees: ["alder", "willow", "bog-birch"], herbs: ["marsh-woundwort", "meadowsweet"],
        flowers: ["marsh-marigold", "bogbean"], carnivorous: ["sundew"],
    }),
    "fen": Object.freeze({
        id: "fen", label: "Fen meadow", height: "low",
        note: "mineral-rich seepage ground, sedge tussocks and a bright carpet of bog flowers",
        reeds: ["reed-grass", "bulrush"], sedges: ["greater-sedge", "cottongrass"], mosses: ["bog-moss", "sphagnum"],
        waterPlants: ["yellow-flag"], grasses: ["swamp-grass"], shrubs: ["bog-myrtle", "bog-rosemary"],
        trees: ["willow"], herbs: ["meadowsweet", "valerian"], flowers: ["bogbean", "bog-orchid"], carnivorous: ["sundew"],
    }),
    "raised-bog": Object.freeze({
        id: "raised-bog", label: "Raised bog", height: "high",
        note: "a dome of rain-fed peat above the water table, red sphagnum and dwarf shrubs",
        reeds: [], sedges: ["cottongrass"], mosses: ["sphagnum", "bog-moss"],
        waterPlants: ["bladderwort"], grasses: [], shrubs: ["bog-rosemary", "cranberry-bush"],
        trees: [], herbs: ["valerian"], flowers: ["sundew"], carnivorous: ["sundew"],
    }),
    "peat-bog": Object.freeze({
        id: "peat-bog", label: "Peat bog", height: "low",
        note: "deep waterlogged peat, dark pools and a low skin of moss, sedge and stunted birch",
        reeds: [], sedges: ["cottongrass", "soft-rush"], mosses: ["sphagnum", "bog-moss", "liverwort"],
        waterPlants: ["bladderwort", "duckweed"], grasses: [], shrubs: ["cranberry-bush", "bog-rosemary"],
        trees: ["bog-birch"], herbs: ["marsh-woundwort"], flowers: ["sundew"], carnivorous: ["sundew"],
    }),
    "floodplain": Object.freeze({
        id: "floodplain", label: "Flooded river floodplain", height: "wooded",
        note: "a river spread across its banks, carrying silt through alder, willow and oak",
        reeds: ["common-reed", "reed-grass"], sedges: ["greater-sedge"], mosses: ["feather-moss"],
        waterPlants: ["yellow-flag"], grasses: ["swamp-grass"], shrubs: ["willow-scrub", "alder-sapling"],
        trees: ["alder", "willow", "ash", "bog-oak"], herbs: ["meadowsweet", "marsh-woundwort"],
        flowers: ["marsh-marigold"], carnivorous: [],
    }),
    "seasonal-wetland": Object.freeze({
        id: "seasonal-wetland", label: "Seasonal wetland", height: "low",
        note: "a hollow that fills in spring, dries to cracked mud in summer and feeds a rush of life",
        reeds: ["common-reed", "cattail"], sedges: ["soft-rush"], mosses: [],
        waterPlants: ["water-lily", "duckweed"], grasses: ["swamp-grass"], shrubs: ["willow-scrub"],
        trees: ["willow"], herbs: ["marsh-woundwort"], flowers: ["marsh-marigold"], carnivorous: [],
    }),
    "coastal-mangrove": Object.freeze({
        id: "coastal-mangrove", label: "Coastal swamp and mangrove", height: "low",
        note: "salt-tolerant trees standing on stilt roots in tidal creeks and warm brackish mud",
        reeds: ["common-reed"], sedges: ["saw-sedge"], mosses: [],
        waterPlants: ["water-lily"], grasses: [], shrubs: ["mangrove-seedling"],
        trees: ["mangrove"], herbs: ["marsh-woundwort"], flowers: ["bogbean"], carnivorous: [],
    }),
});

// Every formation always contributes its defining features. This is what keeps
// the survey, the renderer and the economy describing the same wetland.
const FORMATION_FEATURE_NUMBERS = Object.freeze({
    "shallow-swamp": [1, 9, 11, 12, 14, 16, 21, 22, 24, 27, 29, 37, 38, 39, 40, 43, 44, 46, 49, 55, 56, 57, 58, 60, 61, 62, 63, 65, 71, 72, 75, 76, 79, 80, 81],
    "deep-water-swamp": [2, 14, 20, 22, 23, 25, 26, 27, 28, 31, 32, 34, 35, 37, 43, 47, 49, 54, 55, 56, 58, 60, 62, 63, 67, 69, 72, 74, 77, 78, 79, 81],
    "reed-swamp": [3, 11, 12, 16, 21, 22, 24, 27, 29, 37, 40, 41, 43, 44, 46, 49, 55, 56, 57, 58, 62, 64, 65, 67, 69, 70, 71, 72, 76, 79, 80, 81],
    "alder-carr": [4, 13, 14, 17, 18, 19, 20, 21, 27, 28, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40, 44, 45, 46, 47, 48, 51, 53, 54, 55, 56, 58, 60, 62, 63, 65, 70, 71, 72, 78, 80],
    fen: [5, 11, 12, 13, 15, 16, 17, 19, 27, 29, 31, 32, 33, 35, 36, 37, 38, 39, 44, 46, 47, 48, 49, 50, 52, 53, 54, 55, 56, 58, 60, 63, 64, 67, 68, 70, 72, 73, 74, 81],
    "raised-bog": [6, 12, 13, 15, 19, 27, 30, 31, 32, 33, 35, 36, 37, 47, 50, 52, 53, 54, 55, 56, 58, 60, 61, 62, 67, 68, 71, 72, 73, 77, 78, 81],
    "peat-bog": [7, 12, 13, 15, 19, 27, 30, 31, 32, 33, 35, 36, 37, 47, 50, 52, 53, 54, 55, 56, 58, 60, 61, 62, 67, 68, 71, 72, 73, 77, 78, 81],
    floodplain: [8, 11, 12, 14, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 37, 40, 42, 43, 45, 48, 49, 51, 52, 54, 55, 56, 58, 59, 60, 62, 63, 64, 65, 66, 69, 71, 72, 75, 76, 79, 81],
    "seasonal-wetland": [9, 11, 12, 16, 21, 22, 26, 27, 28, 29, 30, 32, 37, 38, 40, 41, 42, 43, 44, 46, 49, 50, 52, 54, 55, 56, 58, 59, 60, 61, 62, 64, 65, 66, 69, 70, 72, 73, 74, 76, 79, 80],
    "coastal-mangrove": [10, 2, 3, 11, 14, 17, 18, 20, 22, 23, 24, 25, 27, 28, 30, 32, 34, 35, 37, 39, 40, 41, 42, 43, 44, 45, 46, 49, 51, 53, 54, 55, 56, 58, 59, 60, 62, 63, 64, 65, 66, 69, 71, 72, 75, 77, 79, 80, 81],
});
const FORMATION_FEATURES = Object.freeze(Object.fromEntries(Object.entries(FORMATION_FEATURE_NUMBERS)
    .map(([id, numbers]) => [id, Object.freeze(numbers.map(number => "1.2.11." + number))])));

export const SWAMP_GOODS = Object.freeze({
    "bog-cranberry": Object.freeze({ id: "bog-cranberry", label: "Bog cranberries", category: "gather" }),
    "bog-bean": Object.freeze({ id: "bog-bean", label: "Bog bean", category: "medicine" }),
    "bog-herb": Object.freeze({ id: "bog-herb", label: "Marsh medicinal herbs", category: "medicine" }),
    sphagnum: Object.freeze({ id: "sphagnum", label: "Sphagnum moss", category: "medicine" }),
    "bog-orchid": Object.freeze({ id: "bog-orchid", label: "Rare bog orchid", category: "luxury" }),
    "water-lily": Object.freeze({ id: "water-lily", label: "Water-lily root", category: "gather" }),
    "cattail-flour": Object.freeze({ id: "cattail-flour", label: "Cattail flour", category: "gather" }),
    waterfowl: Object.freeze({ id: "waterfowl", label: "Waterfowl", category: "hunt" }),
    "marsh-fish": Object.freeze({ id: "marsh-fish", label: "Marsh fish", category: "hunt" }),
    "alder-timber": Object.freeze({ id: "alder-timber", label: "Alder timber", category: "wood" }),
    "willow-timber": Object.freeze({ id: "willow-timber", label: "Willow timber", category: "wood" }),
    "bog-oak-timber": Object.freeze({ id: "bog-oak-timber", label: "Bog-oak timber", category: "wood" }),
    "mangrove-timber": Object.freeze({ id: "mangrove-timber", label: "Mangrove timber", category: "wood" }),
    "reed-matting": Object.freeze({ id: "reed-matting", label: "Reed matting", category: "fibre" }),
    "bog-cotton": Object.freeze({ id: "bog-cotton", label: "Bog cotton", category: "fibre" }),
    "swamp-mud": Object.freeze({ id: "swamp-mud", label: "Swamp mud and clay", category: "material" }),
});

export const SWAMP_TREES = Object.freeze({
    alder: Object.freeze({
        id: "alder", label: "Alder", kind: "carr", heightMeters: 14, crown: 0.78,
        colours: { spring: "#5d8a50", summer: "#3f7047", autumn: "#8d7a3c", winter: "#6d6959" },
        goods: ["alder-timber", "firewood", "willow-withies"],
    }),
    willow: Object.freeze({
        id: "willow", label: "Crack willow", kind: "willow", heightMeters: 11, crown: 0.84,
        colours: { spring: "#8ba05f", summer: "#648653", autumn: "#a79a45", winter: "#827b65" },
        goods: ["willow-timber", "willow-withies", "firewood"],
    }),
    "bog-birch": Object.freeze({
        id: "bog-birch", label: "Bog birch", kind: "birch", heightMeters: 7, crown: 0.7,
        colours: { spring: "#7f9a5e", summer: "#6e8d55", autumn: "#b39a43", winter: "#8c8777" },
        goods: ["birch-bark", "firewood", "bog-cranberry"],
    }),
    ash: Object.freeze({
        id: "ash", label: "Floodplain ash", kind: "broadleaf", heightMeters: 17, crown: 0.76,
        colours: { spring: "#6f9257", summer: "#4d7c4a", autumn: "#9b853f", winter: "#77705e" },
        goods: ["timber", "firewood", "bog-herb"],
    }),
    "bog-oak": Object.freeze({
        id: "bog-oak", label: "Bog oak", kind: "broadleaf", heightMeters: 15, crown: 0.88,
        colours: { spring: "#64834d", summer: "#486d42", autumn: "#927539", winter: "#6e6757" },
        goods: ["bog-oak-timber", "firewood", "bog-herb"],
    }),
    mangrove: Object.freeze({
        id: "mangrove", label: "Mangrove", kind: "mangrove", heightMeters: 9, crown: 0.84,
        colours: { spring: "#557a4b", summer: "#3f6c48", autumn: "#55704a", winter: "#4c6250" },
        goods: ["mangrove-timber", "firewood", "marsh-fish"],
    }),
});

export const SWAMP_SHRUBS = Object.freeze({
    "bog-myrtle": Object.freeze({ id: "bog-myrtle", label: "Bog myrtle", goods: ["bog-herb", "bog-cotton"], colours: ["#6e7c4e", "#98a06c"], wetland: true }),
    "willow-scrub": Object.freeze({ id: "willow-scrub", label: "Willow scrub", goods: ["willow-withies", "firewood"], colours: ["#718752", "#a4ae72"], wetland: true }),
    "alder-sapling": Object.freeze({ id: "alder-sapling", label: "Alder sapling", goods: ["willow-withies", "firewood"], colours: ["#647f4d", "#94a36a"], wetland: true }),
    "bog-rosemary": Object.freeze({ id: "bog-rosemary", label: "Bog rosemary", goods: ["bog-herb"], colours: ["#657764", "#93a18a"], wetland: true }),
    "cranberry-bush": Object.freeze({ id: "cranberry-bush", label: "Cranberry bush", goods: ["bog-cranberry"], colours: ["#67784b", "#98a265"], wetland: true }),
    "mangrove-seedling": Object.freeze({ id: "mangrove-seedling", label: "Mangrove seedling", goods: ["mangrove-timber"], colours: ["#547a4b", "#85a26d"], wetland: true }),
});

export const SWAMP_REEDS = Object.freeze({
    "common-reed": Object.freeze({ id: "common-reed", label: "Common reed", height: "tall", colours: ["#8b8d55", "#c3b878"], goods: ["reed", "reed-matting"] }),
    bulrush: Object.freeze({ id: "bulrush", label: "Bulrush", height: "tall", colours: ["#7b8450", "#b4aa6d"], goods: ["reed"] }),
    cattail: Object.freeze({ id: "cattail", label: "Rohrkolben (cattail)", height: "tall", colours: ["#76814a", "#ad9d5d"], goods: ["reed", "cattail-flour"] }),
    "reed-grass": Object.freeze({ id: "reed-grass", label: "Reed canary grass", height: "tall", colours: ["#87915a", "#b9b477"], goods: ["reed", "bog-cotton"] }),
});

export const SWAMP_SEDGES = Object.freeze({
    "greater-sedge": Object.freeze({ id: "greater-sedge", label: "Greater sedge", colours: ["#6e8052", "#a0a36c"], goods: ["reed-matting"] }),
    "saw-sedge": Object.freeze({ id: "saw-sedge", label: "Saw sedge", colours: ["#66794d", "#97a06a"], goods: ["reed-matting"] }),
    "soft-rush": Object.freeze({ id: "soft-rush", label: "Soft rush", colours: ["#728153", "#a1a973"], goods: ["reed", "reed-matting"] }),
    cottongrass: Object.freeze({ id: "cottongrass", label: "Cottongrass", colours: ["#909a6c", "#d6d2b4"], goods: ["bog-cotton"] }),
});

export const SWAMP_MOSSES = Object.freeze({
    sphagnum: Object.freeze({ id: "sphagnum", label: "Sphagnum moss", colours: ["#7d6e4b", "#b47b58"], goods: ["sphagnum"] }),
    "bog-moss": Object.freeze({ id: "bog-moss", label: "Bog moss", colours: ["#68744a", "#9a9b63"], goods: ["sphagnum"] }),
    "feather-moss": Object.freeze({ id: "feather-moss", label: "Feather moss", colours: ["#506b4d", "#8a9c6e"], goods: ["sphagnum"] }),
    liverwort: Object.freeze({ id: "liverwort", label: "Liverwort", colours: ["#5d754f", "#8d9f73"], goods: ["bog-herb"] }),
});

export const SWAMP_WATER_PLANTS = Object.freeze({
    "water-lily": Object.freeze({ id: "water-lily", label: "Water lily", colours: ["#6f8a59", "#d9d2ae"], goods: ["water-lily"], flower: true }),
    "yellow-flag": Object.freeze({ id: "yellow-flag", label: "Yellow flag iris", colours: ["#6b8753", "#d9bd57"], goods: ["bog-herb"], flower: true }),
    frogbit: Object.freeze({ id: "frogbit", label: "Frogbit", colours: ["#749062", "#b8c99a"], goods: ["water-lily"] }),
    bladderwort: Object.freeze({ id: "bladderwort", label: "Bladderwort", colours: ["#70845b", "#c5b76e"], goods: ["bog-herb"], carnivorous: true }),
    duckweed: Object.freeze({ id: "duckweed", label: "Duckweed", colours: ["#6f8f5a", "#a8c07f"], goods: [] }),
});

export const SWAMP_GRASSES = Object.freeze({
    "swamp-grass": Object.freeze({ id: "swamp-grass", label: "Swamp grass", colours: ["#758a53", "#adb174"], goods: ["hay", "reed"] }),
});

export const SWAMP_HERBS = Object.freeze({
    "marsh-woundwort": Object.freeze({ id: "marsh-woundwort", label: "Marsh woundwort", seasons: ["spring", "summer", "autumn"], medicine: true, colour: "#9a9d77" }),
    meadowsweet: Object.freeze({ id: "meadowsweet", label: "Meadowsweet", seasons: ["summer"], medicine: true, colour: "#d5cfb6" }),
    valerian: Object.freeze({ id: "valerian", label: "Marsh valerian", seasons: ["spring", "summer"], medicine: true, colour: "#b9ad92" }),
});

export const SWAMP_FLOWERS = Object.freeze({
    "marsh-marigold": Object.freeze({ id: "marsh-marigold", label: "Marsh marigold", seasons: ["spring", "summer"], colours: ["#d4b64d", "#f0dc8a"] }),
    bogbean: Object.freeze({ id: "bogbean", label: "Bog bean", seasons: ["spring", "summer"], colours: ["#d8d6c8", "#f1eee0"] }),
    sundew: Object.freeze({ id: "sundew", label: "Sundew", seasons: ["summer"], colours: ["#b65f4f", "#dc9075"], carnivorous: true }),
    "bog-orchid": Object.freeze({ id: "bog-orchid", label: "Bog orchid", seasons: ["summer"], colours: ["#b486a5", "#d9b4c8"], rare: true }),
});

export const SWAMP_FAUNA = Object.freeze({
    frog: Object.freeze({ id: "frog", label: "Marsh frog", group: "amphibian", kind: "frog", seasons: ["spring", "summer", "autumn"] }),
    toad: Object.freeze({ id: "toad", label: "Common toad", group: "amphibian", kind: "toad", seasons: ["spring", "summer", "autumn"] }),
    "grass-snake": Object.freeze({ id: "grass-snake", label: "Grass snake", group: "reptile", kind: "snake", seasons: ["spring", "summer", "autumn"] }),
    adder: Object.freeze({ id: "adder", label: "Bog adder", group: "reptile", kind: "snake", seasons: ["spring", "summer", "autumn"] }),
    mallard: Object.freeze({ id: "mallard", label: "Mallard", group: "bird", kind: "duck", seasons: ["spring", "summer", "autumn", "winter"] }),
    "greylag-goose": Object.freeze({ id: "greylag-goose", label: "Greylag goose", group: "bird", kind: "goose", seasons: ["spring", "summer", "autumn", "winter"] }),
    "grey-heron": Object.freeze({ id: "grey-heron", label: "Grey heron", group: "bird", kind: "heron", seasons: ["spring", "summer", "autumn", "winter"] }),
    "white-stork": Object.freeze({ id: "white-stork", label: "White stork", group: "bird", kind: "stork", seasons: ["spring", "summer"] }),
    crane: Object.freeze({ id: "crane", label: "Common crane", group: "bird", kind: "crane", seasons: ["spring", "summer", "autumn"] }),
    bittern: Object.freeze({ id: "bittern", label: "Bittern", group: "bird", kind: "heron", seasons: ["spring", "summer", "autumn", "winter"] }),
    "marsh-harrier": Object.freeze({ id: "marsh-harrier", label: "Marsh harrier", group: "bird", kind: "raptor", seasons: ["spring", "summer", "autumn"] }),
    beaver: Object.freeze({ id: "beaver", label: "Beaver", group: "mammal", kind: "beaver", seasons: ["spring", "summer", "autumn", "winter"] }),
    otter: Object.freeze({ id: "otter", label: "Otter", group: "predator", kind: "otter", seasons: ["spring", "summer", "autumn", "winter"] }),
    pike: Object.freeze({ id: "pike", label: "Pike", group: "fish", kind: "pike", seasons: ["spring", "summer", "autumn", "winter"] }),
    eel: Object.freeze({ id: "eel", label: "Eel", group: "fish", kind: "eel", seasons: ["spring", "summer", "autumn"] }),
    rudd: Object.freeze({ id: "rudd", label: "Rudd", group: "fish", kind: "fish", seasons: ["spring", "summer", "autumn"] }),
    dragonfly: Object.freeze({ id: "dragonfly", label: "Dragonfly", group: "insect", kind: "dragonfly", seasons: ["spring", "summer"] }),
    mosquito: Object.freeze({ id: "mosquito", label: "Mosquito swarm", group: "insect", kind: "mosquito", seasons: ["spring", "summer", "autumn"] }),
    deer: Object.freeze({ id: "deer", label: "Swamp deer", group: "herbivore", kind: "deer", seasons: ["spring", "summer", "autumn", "winter"] }),
    "wild-boar": Object.freeze({ id: "wild-boar", label: "Wild boar", group: "mammal", kind: "boar", seasons: ["spring", "summer", "autumn", "winter"] }),
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
        settled: Boolean(explicit.settled || explicit.settlement || state === "settled"),
        drained: Boolean(explicit.drained || state === "drained"),
        peatCut: Boolean(explicit.peatCut || state === "peat-cut"),
        boardwalk: Boolean(explicit.boardwalk || state === "boardwalk"),
        fished: Boolean(explicit.fished || state === "fished"),
        burnt: Boolean(explicit.burnt || explicit.burned || state === "burnt"),
        path: Boolean(explicit.path || state === "path"),
        intensity: clamp01(explicit.intensity ?? 0.12),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (state === "wild" ? "unmanaged wetland" : state.replace(/-/g, " ")),
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
    if (scores.mangrove > 0.66) return "coastal-mangrove";
    if (scores.raised > 0.68) return "raised-bog";
    if (scores.peat > 0.64) return "peat-bog";
    if (scores.carr > 0.62) return "alder-carr";
    if (scores.fen > 0.6) return "fen";
    if (scores.floodplain > 0.6) return "floodplain";
    if (scores.reed > 0.54) return "reed-swamp";
    if (scores.deep > 0.58) return "deep-water-swamp";
    if (scores.seasonal > 0.5) return "seasonal-wetland";
    return "shallow-swamp";
}

function buildTrees(seed, x, y, formation, season, treeScore, wet) {
    if (!formation.trees.length) return [];
    const signature = formation.id === "alder-carr" || formation.id === "floodplain" || formation.id === "coastal-mangrove";
    const chance = formation.id === "alder-carr" ? 0.92
        : formation.id === "floodplain" ? 0.78
            : formation.id === "coastal-mangrove" ? 0.82
                : formation.id === "peat-bog" ? 0.26 : 0.4;
    const roll = unit(seed, x, y, 0x53575452);
    if (roll > chance * (0.84 + treeScore * 0.22) && !signature) return [];
    const count = roll < chance * 0.2 ? 3 : roll < chance * 0.58 ? 2 : 1;
    const trees = [];
    for (let index = 0; index < count; index++) {
        const treeId = signature && index === 0 ? formation.trees[0]
            : pick(seed, x + index, y, formation.trees, 0x53575453 + index);
        const tree = SWAMP_TREES[treeId];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x53575454) - 0.5) * 0.58,
            offsetY: (unit(seed, x, y + index, 0x53575455) - 0.5) * 0.3,
            scale: 0.72 + unit(seed, x, y + index, 0x53575456) * 0.38,
            seasonColour: tree.colours[season] || tree.colours.summer,
            mossy: unit(seed, x, y + index, 0x4d4f5353) > 0.42,
            flowering: wet > 0.44 && (season === "spring" || season === "summer")
                && unit(seed, x, y + index, 0x424c4f4f) > 0.62,
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, water, reeds, cover, depth, wet, open } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = SWAMP_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(12, Math.round(count))) });
    };
    if (water > 0.18 && unit(seed, x, y, 0x46524f47) > 0.24) add("frog", 3 + Math.floor(unit(seed, x, y, 0x46524732) * 5));
    if (water > 0.16 && unit(seed, x, y, 0x544f4144) > 0.44) add("toad", 2);
    if (reeds > 0.24 && unit(seed, x, y, 0x534e414b) > 0.48) add("grass-snake");
    if (cover > 0.3 && unit(seed, x, y, 0x41444452) > 0.66) add("adder");
    if (water > 0.14 && unit(seed, x, y, 0x4d414c4c) > 0.28) add("mallard", 2 + Math.floor(unit(seed, x, y, 0x4d414c32) * 4));
    if (water > 0.22 && unit(seed, x, y, 0x474f4f53) > 0.44) add("greylag-goose", 2);
    if (water > 0.12 && unit(seed, x, y, 0x4845524f) > 0.32) add("grey-heron");
    if (open > 0.34 && water > 0.2 && unit(seed, x, y, 0x53544f52) > 0.56) add("white-stork", 2);
    if (open > 0.26 && water > 0.2 && unit(seed, x, y, 0x4352414e) > 0.52) add("crane", 2);
    if (reeds > 0.4 && unit(seed, x, y, 0x42495454) > 0.7) add("bittern");
    if (open > 0.3 && unit(seed, x, y, 0x48415252) > 0.72) add("marsh-harrier");
    if (water > 0.28 && cover > 0.3 && unit(seed, x, y, 0x42454156) > 0.64) add("beaver");
    if (water > 0.24 && unit(seed, x, y, 0x4f545445) > 0.66) add("otter");
    if (depth > 0.28 && unit(seed, x, y, 0x50494b45) > 0.34) add("pike");
    if (water > 0.2 && unit(seed, x, y, 0x45454c45) > 0.56) add("eel");
    if (water > 0.16 && unit(seed, x, y, 0x52554444) > 0.48) add("rudd", 2);
    if (season !== "winter" && water > 0.1 && unit(seed, x, y, 0x44524147) > 0.26) add("dragonfly", 2);
    if (season !== "winter" && wet > 0.24 && unit(seed, x, y, 0x4d4f5351) > 0.22) add("mosquito", 4 + Math.floor(unit(seed, x, y, 0x4d4f5332) * 6));
    if (cover > 0.26 && unit(seed, x, y, 0x44454552) > 0.54) add("deer", 2);
    if (cover > 0.3 && unit(seed, x, y, 0x424f4152) > 0.62) add("wild-boar", 2);
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { season, reeds, sedges, mosses, trees, shrubs, waterPlants, water, peat, mud, rare, wet } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.05 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    if (reeds.length) add("reed", "Reeds", "gather", 0.38 + wet * 0.22);
    if (reeds.some(entry => entry.id === "cattail")) add("cattail-flour", "Cattail flour", "gather", 0.34);
    if (reeds.length || sedges.length) add("reed-matting", "Reed matting", "fibre", 0.32 + sedges.length * 0.04);
    if (shrubs.some(entry => entry.id === "willow-scrub") || trees.some(entry => entry.kind === "willow")) add("willow-withies", "Willow withies", "gather", 0.4);
    if (peat > 0.28) add("peat", "Peat", "material", 0.32 + peat * 0.34);
    if (mud > 0.32) add("swamp-mud", "Swamp mud and clay", "material", 0.28 + mud * 0.24);
    if (mosses.length) add("sphagnum", "Sphagnum moss", "medicine", 0.3 + mosses.length * 0.05);
    if (shrubs.some(entry => entry.id === "cranberry-bush") && season !== "winter") add("bog-cranberry", "Bog cranberries", "gather", 0.4);
    if (waterPlants.some(entry => entry.id === "water-lily") && season !== "winter") add("water-lily", "Water-lily root", "gather", 0.3);
    if (trees.some(entry => entry.goods.includes("alder-timber"))) add("alder-timber", "Alder timber", "wood", 0.3);
    if (trees.some(entry => entry.goods.includes("willow-timber"))) add("willow-timber", "Willow timber", "wood", 0.28);
    if (trees.some(entry => entry.goods.includes("bog-oak-timber"))) add("bog-oak-timber", "Bog-oak timber", "wood", 0.22);
    if (trees.some(entry => entry.goods.includes("mangrove-timber"))) add("mangrove-timber", "Mangrove timber", "wood", 0.3);
    if (water > 0.22) add("marsh-fish", "Marsh fish", "hunt", 0.3 + water * 0.2);
    if (water > 0.14) add("waterfowl", "Waterfowl", "hunt", 0.26 + wet * 0.16);
    if (rare > 0.54) add("bog-orchid", "Rare bog orchid", "luxury", rare * 0.52);
    if (goods.length < 9 && (season === "spring" || season === "summer")) add("bog-herb", "Marsh medicinal herbs", "medicine", 0.24 + wet * 0.14);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

/** How strongly a tile belongs to the swamp climate. */
export function swampPotentialAt(x, y, context = {}) {
    const climate = context.climate || "temperate";
    if (climate !== "swamp") return 0;
    const height = clamp01(context.height ?? 0.35);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height <= seaLevel + 0.004 || height > 0.9) return 0;
    const moisture = clamp01(context.moisture ?? 0.78);
    const roll = coarse(Number(context.seed) || 1, x, y, 5, 0x5357414d);
    return clamp01(0.76 + moisture * 0.2 + roll * 0.08);
}

export function isSwampSite(x, y, context = {}) {
    return swampPotentialAt(x, y, context) > 0.24;
}

/** Complete, pure wetland profile for one tile. */
export function swampProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.78);
    const temperature = clamp01(context.temperature ?? 0.52);
    const height = clamp01(context.height ?? 0.35);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "swamp";
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, climate === "swamp" ? "swamp" : climate);
    const use = normalizeUse(context.use);
    const aboveSea = Math.max(0, height - seaLevel);
    const waterRoll = coarse(seed, x, y, 5, 0x57415452);
    const reedRoll = coarse(seed, x, y, 4, 0x52454544);
    const peatRoll = coarse(seed, x, y, 7, 0x50454154);
    const carrRoll = coarse(seed, x, y, 5, 0x43415252);
    const riverRoll = coarse(seed, x, y, 3, 0x52495652);
    const fenRoll = coarse(seed, x, y, 6, 0x46454e58);
    const coastRoll = coarse(seed, x, y, 6, 0x434f4153);
    const treeRoll = coarse(seed, x, y, 4, 0x54524545);
    const rareRoll = coarse(seed, x, y, 7, 0x52415245);
    const islandRoll = coarse(seed, x, y, 4, 0x49534c45);

    // The spring flood is the defining seasonal pulse. Summer draws the water
    // down and exposes mud; autumn refills the hollows; winter is cold and dark.
    const springFlood = smoothstep(20, 115, dayOfYear) * (1 - smoothstep(145, 220, dayOfYear));
    const autumnRefill = smoothstep(245, 300, dayOfYear) * (1 - smoothstep(350, 390, dayOfYear));
    const seasonalPulse = clamp01(springFlood * 0.8 + autumnRefill * 0.45 + base.greenUp * 0.18);
    const waterLevel = clamp01(0.38 + seasonalPulse * 0.42 + moisture * 0.24 - (season === "summer" ? 0.16 : 0));
    const waterTable = clamp01(0.54 + moisture * 0.34 + seasonalPulse * 0.12);
    const depth = clamp01((0.3 + waterRoll * 0.5 + waterLevel * 0.25) * (1 - aboveSea * 0.5));
    const shallow = clamp01(1 - smoothstep(0.34, 0.7, depth));
    const deep = clamp01(smoothstep(0.46, 0.8, depth));
    const reed = clamp01(reedRoll * 0.58 + moisture * 0.24 + shallow * 0.24);
    const peat = clamp01(peatRoll * 0.54 + (1 - aboveSea * 2.4) * 0.24 + moisture * 0.2);
    const carr = clamp01(carrRoll * 0.52 + treeRoll * 0.3 + moisture * 0.2 - shallow * 0.1);
    const fen = clamp01(fenRoll * 0.54 + moisture * 0.28 + (1 - peat) * 0.12);
    const floodplain = clamp01(riverRoll * 0.72 + seasonalPulse * 0.24 + shallow * 0.14);
    const seasonal = clamp01(seasonalPulse * 0.66 + (1 - waterLevel) * 0.18 + waterRoll * 0.16);
    const coastal = clamp01((1 - smoothstep(0.012, 0.05, aboveSea)) * 0.84 + coastRoll * 0.2);
    const mangrove = clamp01(coastal * 0.86 + temperature * 0.16);
    const raised = clamp01(peat * 0.82 + (aboveSea > 0.035 ? 0.16 : -0.18) + smoothstep(0.4, 0.7, peatRoll) * 0.18);

    const formation = SWAMP_FORMATIONS[chooseFormation({
        mangrove, raised, peat, carr, fen, floodplain,
        reed, deep, seasonal,
    })];

    const reeds = formation.reeds.map(id => SWAMP_REEDS[id]).filter(Boolean);
    const sedges = formation.sedges.map(id => SWAMP_SEDGES[id]).filter(Boolean);
    const mosses = formation.mosses.map(id => SWAMP_MOSSES[id]).filter(Boolean);
    const waterPlants = formation.waterPlants.map(id => SWAMP_WATER_PLANTS[id]).filter(Boolean);
    const grasses = formation.grasses.map(id => SWAMP_GRASSES[id]).filter(Boolean);
    const shrubs = formation.shrubs.map(id => SWAMP_SHRUBS[id]).filter(Boolean);
    const trees = buildTrees(seed, x, y, formation, season, carr, waterLevel);
    const herbs = Object.values(SWAMP_HERBS).filter(herb => herb.seasons.includes(season))
        .filter((entry, index) => unit(seed, x, y, 0x48455242 + index) > 0.56 - moisture * 0.24);
    const bloom = clamp01((season === "spring" ? 0.82 : season === "summer" ? 0.64 : season === "autumn" ? 0.2 : 0.04)
        * (0.5 + base.greenUp * 0.4) * (0.6 + moisture * 0.3));
    const flowers = Object.values(SWAMP_FLOWERS).filter(flower => flower.seasons.includes(season))
        .filter(flower => !flower.rare || rareRoll > 0.62)
        .filter((entry, index) => unit(seed, x, y, 0x464c4f57 + index) > 0.55 - bloom * 0.3);
    const carnivorous = formation.carnivorous.map(id => SWAMP_WATER_PLANTS[id] || SWAMP_FLOWERS[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x4341524e + index) > 0.46 - peat * 0.2);
    const plantIslands = clamp01(shallow * (0.26 + reed * 0.5) + unit(seed, x, y, 0x504c414e) * 0.12);
    const cover = clamp01(reed * 0.26 + mosses.length * 0.06 + trees.length * 0.08 + shrubs.length * 0.04);
    const mud = clamp01(0.34 + (1 - waterLevel) * 0.34 + seasonal * 0.12 + waterRoll * 0.16);
    const firmIsland = islandRoll > 0.78 && aboveSea > 0.018;
    const bearing = clamp01(0.2 + (firmIsland ? 0.38 : 0) + aboveSea * 1.8 + (1 - peat) * 0.14 - mud * 0.12);
    const instability = clamp01(0.42 + peat * 0.3 + shallow * 0.16 - bearing * 0.34);
    const sinking = clamp01(instability * 0.8 + mud * 0.28 - bearing * 0.24);
    const mosquito = season === "winter" ? 0.06 : clamp01(0.28 + shallow * 0.34 + temperature * 0.2 + seasonal * 0.14);
    const fever = clamp01(mosquito * 0.72 + shallow * 0.16 + (weather === "rain" ? 0.08 : 0));
    const contaminated = clamp01(0.24 + mud * 0.28 + (use.settled ? 0.14 : 0) + (use.peatCut ? 0.12 : 0));
    const fog = clamp01((hour < 8 || hour > 20 ? 0.34 : 0.08) + moisture * 0.24 + (weather === "fog" ? 0.44 : 0) + shallow * 0.12);
    const mist = clamp01(fog * 0.8 + waterLevel * 0.22);
    const navigation = clamp01(0.3 + reed * 0.34 + fog * 0.26 - bearing * 0.14);
    const movement = clamp01(0.52 - sinking * 0.22 - mud * 0.14 - fog * 0.08 + (use.boardwalk ? 0.28 : 0) + (use.path ? 0.12 : 0));
    const wagon = clamp01(sinking * 0.74 + mud * 0.3 + (1 - bearing) * 0.24);
    const fish = clamp01(deep * 0.7 + shallow * 0.3 + riverRoll * 0.14 - (season === "winter" ? 0.18 : 0));
    const waterfowl = clamp01(0.24 + shallow * 0.3 + reed * 0.22 + (season === "spring" || season === "autumn" ? 0.22 : 0));
    const fauna = buildFauna(seed, x, y, {
        season, water: waterLevel, reeds: reed, cover: clamp01(reed * 0.3 + trees.length * 0.08 + shrubs.length * 0.06),
        depth, wet: seasonalPulse, open: clamp01(1 - trees.length * 0.14),
    });
    const goods = buildGoods(seed, x, y, {
        season, reeds, sedges, mosses, trees, shrubs, waterPlants, water: waterLevel,
        peat, mud, rare: rareRoll, wet: seasonalPulse,
    });
    const rarePlants = clamp01(rareRoll * 0.5 + peat * 0.24 + (carnivorous.length ? 0.12 : 0));
    const defence = clamp01(0.32 + reed * 0.3 + shallow * 0.22 + sinking * 0.18);
    const development = clamp01(0.36 + instability * 0.3 + reed * 0.16 + (1 - bearing) * 0.2);
    const settlement = clamp01(bearing * 0.62 + (firmIsland ? 0.28 : 0) + aboveSea * 1.2 - shallow * 0.24);
    const grassCover = clamp01(reed * 0.24 + sedges.length * 0.05 + mosses.length * 0.04 + (1 - shallow) * 0.08);
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.16) * 0.64);
    const openLight = clamp01(sunlight * (0.72 + (1 - trees.length * 0.12) * 0.24));
    const closedLight = clamp01(sunlight * 0.46 + 0.06);
    const ground = mixColour([68, 66, 50], [92, 79, 55], clamp01(peat * 0.55 + mud * 0.2));
    const reedColour = hexColour(mixColour([112, 126, 72], [161, 158, 96], seasonalPulse * 0.5));
    const mossColour = mosses.some(entry => entry.id === "sphagnum") ? "#8a624e" : "#62764f";
    const waterColour = depth > 0.55 ? "#263a38" : depth > 0.3 ? "#3d5148" : "#677257";
    const leafColour = trees[0]?.seasonColour || reedColour;

    const dynamic = new Set(FORMATION_FEATURES[formation.id] || []);
    if (trees.length) { dynamic.add("1.2.11.17"); dynamic.add("1.2.11.51"); dynamic.add("1.2.11.78"); }
    if (flowers.length) dynamic.add("1.2.11.50");
    if (carnivorous.length) dynamic.add("1.2.11.19");
    if (firmIsland) dynamic.add("1.2.11.34");
    if (fog > 0.42) { dynamic.add("1.2.11.61"); dynamic.add("1.2.11.73"); }
    if (mist > 0.28) dynamic.add("1.2.11.74");
    if (seasonalPulse > 0.4) dynamic.add("1.2.11.28");

    return {
        biome: "swamp", swamp: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate, moisture, temperature, height,
        features: SWAMP_REQUIREMENT_IDS.filter(id => dynamic.has(id)),
        landform: {
            flat: clamp01(1 - aboveSea * 4), relief: clamp01(aboveSea * 4 + waterRoll * 0.18),
            aboveSea, island: firmIsland, hummock: clamp01(peat * 0.5 + islandRoll * 0.3),
            peatDepthCm: Math.round(30 + peat * 360), label: firmIsland ? "raised dry island"
                : deep > 0.6 ? "deep wetland pool" : shallow > 0.5 ? "shallow flooded ground" : "soft peat ground",
        },
        soil: {
            mud, peat, bearing, instability, organicMatter: clamp01(0.5 + peat * 0.4 + mud * 0.1),
            clay: clamp01(0.3 + mud * 0.4), nutrients: clamp01(0.4 + moisture * 0.24 - peat * 0.14),
            drainage: clamp01(0.14 + aboveSea * 2.2 - peat * 0.1),
            erosion: clamp01(floodplain * 0.28 + seasonalPulse * 0.2 + (1 - reed) * 0.14),
            rootMats: clamp01(0.34 + carr * 0.3 + mosses.length * 0.06),
            decayingMaterial: clamp01(0.52 + peat * 0.3 + (season === "autumn" ? 0.14 : 0)),
        },
        water: {
            waterLevel, waterTable, seasonalPulse, depth, depthCm: Math.round(depth * 210),
            shallowWater: shallow, deepWater: deep, standingWater: waterLevel > 0.3,
            pools: clamp01(shallow * 0.7 + waterRoll * 0.24), hiddenGullies: clamp01(floodplain * 0.54 + riverRoll * 0.3),
            slowChannel: floodplain, floodedHollow: clamp01(seasonal * 0.62 + shallow * 0.24),
            turbidity: clamp01(0.34 + mud * 0.3 + peat * 0.16), reflection: clamp01((1 - wind * 0.2) * waterLevel * 0.9),
            floodRisk: clamp01(seasonalPulse * 0.56 + floodplain * 0.3 + (weather === "storm" || weather === "rain" ? 0.12 : 0)),
            label: deep > 0.6 ? "deep black water" : shallow > 0.5 ? "shallow brown water"
                : seasonalPulse > 0.4 ? "flooded hollow" : "saturated peat",
        },
        vegetation: {
            reeds, sedges, mosses, waterPlants, grasses, shrubs, trees, herbs, flowers, carnivorous,
            density: clamp01(reeds.length * 0.08 + sedges.length * 0.05 + mosses.length * 0.05 + trees.length * 0.08),
            cover: clamp01(reed * 0.35 + trees.length * 0.08 + shrubs.length * 0.06 + mosses.length * 0.04),
            bloom, grassCover, plantIslands, rootMats: clamp01(0.34 + carr * 0.3 + mosses.length * 0.06),
            decayingMaterial: clamp01(0.52 + peat * 0.3 + (season === "autumn" ? 0.14 : 0)),
            treeChance: trees.length ? 0.8 : 0,
        },
        fauna, goods,
        economy: {
            reeds: clamp01(reed * 0.7 + sedges.length * 0.08), peat: clamp01(peat * 0.8),
            fuel: clamp01(peat * 0.76 + trees.length * 0.08), medicine: clamp01(herbs.length * 0.16 + mosses.length * 0.08 + (flowers.length ? 0.1 : 0)),
            fish, waterfowl, berries: clamp01((shrubs.some(entry => entry.id === "cranberry-bush") ? 0.4 : 0.08) + bloom * 0.1),
            timber: clamp01(trees.length * 0.18), clay: clamp01(mud * 0.6), rarePlants, organic: clamp01(0.4 + peat * 0.4 + mosses.length * 0.05),
            drainage: clamp01(1 - waterLevel * 0.6 - instability * 0.2), peatCutting: clamp01(peat * 0.72),
            fishing: fish, basketry: clamp01(reed * 0.58 + sedges.length * 0.1), defence,
            development, settlement, boardwalk: clamp01(0.2 + reeds.length * 0.08 + trees.length * 0.08),
            bridges: clamp01(floodplain * 0.5 + riverRoll * 0.2), carryingCapacity: bearing,
        },
        hazards: {
            sinking, hiddenDepth: deep, insects: mosquito, disease: fever, contaminatedWater: contaminated,
            fever, navigation, fog, movement, wagon, floodRisk: clamp01(seasonalPulse * 0.56 + floodplain * 0.3),
            visibility: clamp01(0.46 - fog * 0.34 + (1 - cover) * 0.16),
            insectSwarms: clamp01(mosquito * 0.8 + (season === "summer" ? 0.12 : 0)),
        },
        use,
        visual: {
            sunlight, openLight, closedLight, wind, windSway: clamp01(0.2 + wind * 0.18 + reed * 0.24),
            fog, mist, reflection: clamp01((1 - wind * 0.18) * waterLevel * 0.9), reedSway: clamp01(0.24 + wind * 0.2 + reed * 0.24),
            darkWater: depth, mossTrunks: trees.some(tree => tree.mossy) ? 1 : 0,
            bubbles: clamp01(waterRoll * 0.4 + peat * 0.32), insectSwarms: clamp01(mosquito * 0.8),
            lightMood: trees.length ? "shaded" : "open",
            groundHex: hexColour(ground), waterHex: waterColour, reedHex: reedColour, mossHex: mossColour,
            leafHex: leafColour, fogHex: "#b9c4b7", openLightHex: hexColour(mixColour([206, 214, 182], [232, 231, 204], sunlight)),
            closedLightHex: hexColour(mixColour([91, 112, 88], [132, 148, 111], sunlight)),
        },
        grassHex: reedColour, groundHex: hexColour(ground), leafColour,
        sward: { height: reeds.some(entry => entry.height === "tall") ? "tall" : "short", density: clamp01(0.3 + reed * 0.5) },
        trees, treeChance: trees.length ? 0.8 : 0,
        seasonalNote: `${formation.label} · ${Math.round(seasonalPulse * 100)}% water pulse · ${Math.round(depth * 100)}% depth · ${goods[0]?.label || "no surface harvest"}`,
    };
}

export function swampGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "bog-cranberry" || good.id === "water-lily") return season === "spring" || season === "summer" || season === "autumn";
        if (good.id === "bog-orchid") return season === "spring" || season === "summer";
        return true;
    });
}

export function swampProductsAt(x, y, context = {}) {
    if (!isSwampSite(x, y, context)) return null;
    const profile = swampProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.008) return null;
    const goods = swampGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length && !profile.fauna.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function swampSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    return `${profile.label} · ${profile.water.label} · ${goods} · ${wildlife}`;
}

export function swampRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const SWAMP_LIMITS = Object.freeze({
    requirements: SWAMP_REQUIREMENTS.length,
    maxFauna: 8,
    maxFlowers: 4,
    maxGoods: 9,
    formations: Object.keys(SWAMP_FORMATIONS).length,
    trees: Object.keys(SWAMP_TREES).length,
    reeds: Object.keys(SWAMP_REEDS).length,
    sedges: Object.keys(SWAMP_SEDGES).length,
    mosses: Object.keys(SWAMP_MOSSES).length,
});
