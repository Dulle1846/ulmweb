// Grassland ecology (spec 1.2.6.1–1.2.6.60).
//
// One deterministic profile is derived from the same seed, terrain, climate and
// land-use inputs that drive the rest of the living world. Rendering, gathering,
// fodder, pasture suitability and the grassland survey all read that profile, so
// a meadow cannot look lush in one system and be barren in another.
//
// The profile is intentionally stateless. Long-term grazing, mowing, trampling
// and encroachment are supplied by grassland-use.js from real buildings, roads
// and the current year; nothing here adds per-tile save data or changes the save
// schema.

import { seasonalState } from "./season.js";

export const GRASSLAND_REQUIREMENTS = Object.freeze([
    { id: "1.2.6.1", key: "short-grasses", label: "Short, dense grasses", group: "vegetation" },
    { id: "1.2.6.2", key: "medium-meadow", label: "Medium-height meadow vegetation", group: "vegetation" },
    { id: "1.2.6.3", key: "tall-wild-grasses", label: "Tall wild grasses", group: "vegetation" },
    { id: "1.2.6.4", key: "grass-colours", label: "Different grass colours", group: "vegetation" },
    { id: "1.2.6.5", key: "spring-grass", label: "Fresh spring grass", group: "vegetation" },
    { id: "1.2.6.6", key: "summer-grass", label: "Dry summer grass", group: "vegetation" },
    { id: "1.2.6.7", key: "flowering-meadow", label: "Flowering meadows", group: "vegetation" },
    { id: "1.2.6.8", key: "density", label: "Vegetation density follows soil and moisture", group: "vegetation" },
    { id: "1.2.6.9", key: "wildflowers", label: "Wildflowers in different colours", group: "vegetation" },
    { id: "1.2.6.10", key: "herbs", label: "Herbs and medicinal plants", group: "vegetation" },
    { id: "1.2.6.11", key: "flower-islands", label: "Small flower islands", group: "vegetation" },
    { id: "1.2.6.12", key: "flower-sections", label: "Flowering meadow sections", group: "vegetation" },
    { id: "1.2.6.13", key: "seasonal-bloom", label: "Seasonal changes in flowering", group: "vegetation" },
    { id: "1.2.6.14", key: "pollinators", label: "Pollinator-friendly plant areas", group: "vegetation" },
    { id: "1.2.6.15", key: "rare-plants", label: "Rare and regionally distinctive plants", group: "vegetation" },
    { id: "1.2.6.16", key: "flat-meadow", label: "Flat meadows", group: "landform" },
    { id: "1.2.6.17", key: "gentle-hills", label: "Gentle hills", group: "landform" },
    { id: "1.2.6.18", key: "wide-plains", label: "Wide plains", group: "landform" },
    { id: "1.2.6.19", key: "small-hollows", label: "Small hollows", group: "landform" },
    { id: "1.2.6.20", key: "wet-meadow", label: "Wet meadows", group: "landform" },
    { id: "1.2.6.21", key: "dry-meadow", label: "Dry grassland", group: "landform" },
    { id: "1.2.6.22", key: "rocky-grass", label: "Grassy rock surfaces", group: "landform" },
    { id: "1.2.6.23", key: "transitions", label: "Transitions to forest, steppe and mountains", group: "landform" },
    { id: "1.2.6.24", key: "old-trees", label: "Individual old trees", group: "woody" },
    { id: "1.2.6.25", key: "tree-groups", label: "Small groups of trees", group: "woody" },
    { id: "1.2.6.26", key: "hedges", label: "Hedges and shrub islands", group: "woody" },
    { id: "1.2.6.27", key: "riparian-woods", label: "Woody growth along watercourses", group: "woody" },
    { id: "1.2.6.28", key: "fruit-trees", label: "Scattered fruit trees", group: "woody" },
    { id: "1.2.6.29", key: "windbreaks", label: "Natural windbreak groups", group: "woody" },
    { id: "1.2.6.30", key: "deer-hare", label: "Deer, roe deer and hares", group: "fauna" },
    { id: "1.2.6.31", key: "predators", label: "Foxes and smaller predators", group: "fauna" },
    { id: "1.2.6.32", key: "birds-raptors", label: "Wild birds and birds of prey", group: "fauna" },
    { id: "1.2.6.33", key: "insects", label: "Insects, butterflies and bees", group: "fauna" },
    { id: "1.2.6.34", key: "livestock", label: "Livestock in suitable landscapes", group: "fauna" },
    { id: "1.2.6.35", key: "ground-birds", label: "Ground-nesting birds", group: "fauna" },
    { id: "1.2.6.36", key: "rodents", label: "Small rodents", group: "fauna" },
    { id: "1.2.6.37", key: "seasonal-movement", label: "Seasonal animal movement", group: "fauna" },
    { id: "1.2.6.38", key: "pasture", label: "Pasture for cattle, sheep, goats and horses", group: "economy" },
    { id: "1.2.6.39", key: "hay", label: "Hay and grass for animal feed", group: "economy" },
    { id: "1.2.6.40", key: "medicinal-herbs", label: "Medicinal plants and herbs", group: "economy" },
    { id: "1.2.6.41", key: "honey", label: "Wildflowers and honey production", group: "economy" },
    { id: "1.2.6.42", key: "fertile-soil", label: "Fertile soil for agriculture", group: "economy" },
    { id: "1.2.6.43", key: "gatherables", label: "Gatherable natural products", group: "economy" },
    { id: "1.2.6.44", key: "crops", label: "Land suitable for grain and other crops", group: "economy" },
    { id: "1.2.6.45", key: "roads-settlements", label: "Good conditions for roads and settlements", group: "economy" },
    { id: "1.2.6.46", key: "grazed", label: "Grazed areas", group: "use" },
    { id: "1.2.6.47", key: "mowed", label: "Regularly mown meadows", group: "use" },
    { id: "1.2.6.48", key: "wild", label: "Feral, unmanaged pastures", group: "use" },
    { id: "1.2.6.49", key: "trampled", label: "Trampled areas", group: "use" },
    { id: "1.2.6.50", key: "paths", label: "Small paths through tall grass", group: "use" },
    { id: "1.2.6.51", key: "encroachment", label: "Shrub growth when management stops", group: "use" },
    { id: "1.2.6.52", key: "reforestation", label: "Long-term scrub and reforestation", group: "use" },
    { id: "1.2.6.53", key: "overgrazed", label: "Overgrazing and soil damage", group: "use" },
    { id: "1.2.6.54", key: "wind", label: "Grass moving in the wind", group: "visual" },
    { id: "1.2.6.55", key: "waves", label: "Wave-like movement in tall grass", group: "visual" },
    { id: "1.2.6.56", key: "sunlight", label: "Sunlight on flowers and blades", group: "visual" },
    { id: "1.2.6.57", key: "hill-gradients", label: "Different colour gradients on hills", group: "visual" },
    { id: "1.2.6.58", key: "mist", label: "Mist over wet meadows", group: "visual" },
    { id: "1.2.6.59", key: "dew", label: "Morning dew", group: "visual" },
    { id: "1.2.6.60", key: "seasonal-colour", label: "Seasonal changes in meadow colour", group: "visual" },
]);

export const GRASSLAND_REQUIREMENT_IDS = Object.freeze(GRASSLAND_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(GRASSLAND_REQUIREMENTS.map(entry => [entry.id, entry])));

const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

// Formations describe the plant community, not merely a colour. Each one names
// its grass layer, flower candidates and the management that keeps it open.
export const GRASSLAND_FORMATIONS = Object.freeze({
    "short-turf": Object.freeze({
        id: "short-turf", label: "Short sheep turf", height: "short", density: 0.72,
        grasses: ["creeping-bent", "sheep-fescue", "sweet-vernal"], flowers: ["daisy", "white-clover", "cowslip"],
        note: "close-cropped turf kept open by grazing and wind",
    }),
    "tall-meadow": Object.freeze({
        id: "tall-meadow", label: "Tall hay meadow", height: "tall", density: 0.9,
        grasses: ["meadow-foxtail", "timothy", "cocksfoot", "tufted-hairgrass"], flowers: ["buttercup", "knapweed", "meadowsweet", "scabious"],
        note: "a summer hay crop with a deep flowering understorey",
    }),
    "wet-meadow": Object.freeze({
        id: "wet-meadow", label: "Wet riverside meadow", height: "tall", density: 0.94,
        grasses: ["reed-canary-grass", "tufted-hairgrass", "marsh-foxtail"], flowers: ["marsh-marigold", "meadowsweet", "ragged-robin", "orchid"],
        note: "damp ground with tall growth, reeds and morning mist",
    }),
    "dry-meadow": Object.freeze({
        id: "dry-meadow", label: "Dry chalk grassland", height: "medium", density: 0.52,
        grasses: ["sheep-fescue", "crested-dogstail", "purple-moor-grass"], flowers: ["harebell", "wild-thyme", "hawkweed", "pasque-flower"],
        note: "thin, sun-baked turf with bare patches and short herbs",
    }),
    "rocky-pasture": Object.freeze({
        id: "rocky-pasture", label: "Rocky hill pasture", height: "short", density: 0.42,
        grasses: ["sheep-fescue", "blue-fescue", "mountain-bent"], flowers: ["harebell", "mountain-avens", "wild-thyme"],
        note: "grass threaded between outcrops and thin soil",
    }),
    "hill-meadow": Object.freeze({
        id: "hill-meadow", label: "Gentle hill meadow", height: "medium", density: 0.78,
        grasses: ["cocksfoot", "red-fescue", "sweet-vernal"], flowers: ["scabious", "knapweed", "hawkweed", "harebell"],
        note: "a sunlit slope with a changing colour gradient",
    }),
    "wooded-meadow": Object.freeze({
        id: "wooded-meadow", label: "Wooded meadow", height: "medium", density: 0.7,
        grasses: ["tufted-hairgrass", "wood-meadow-grass", "cocksfoot"], flowers: ["bluebell", "wood-anemone", "knapweed"],
        note: "an open glade held back by mowing, browsed at the edge",
    }),
    "orchard-meadow": Object.freeze({
        id: "orchard-meadow", label: "Orchard meadow", height: "medium", density: 0.76,
        grasses: ["timothy", "creeping-bent", "sweet-vernal"], flowers: ["cowslip", "daisy", "buttercup"],
        note: "old fruit trees over a grazed or mown sward",
    }),
    "steppe-edge": Object.freeze({
        id: "steppe-edge", label: "Steppe edge", height: "medium", density: 0.48,
        grasses: ["feather-grass", "crested-dogstail", "sheep-fescue"], flowers: ["poppy", "cornflower", "wild-thyme"],
        note: "the dry transition between meadow and open steppe",
    }),
    "mountain-meadow": Object.freeze({
        id: "mountain-meadow", label: "Mountain meadow", height: "short", density: 0.56,
        grasses: ["mountain-bent", "blue-fescue", "sheep-fescue"], flowers: ["mountain-avens", "harebell", "alpine-aster"],
        note: "short alpine growth above the wooded slopes",
    }),
});

export const GRASSLAND_GRASSES = Object.freeze({
    "creeping-bent": Object.freeze({ id: "creeping-bent", label: "Creeping bent", height: "short", moisture: [0.35, 0.8], colours: ["#6e8d3d", "#86a64e"] }),
    "sheep-fescue": Object.freeze({ id: "sheep-fescue", label: "Sheep fescue", height: "short", moisture: [0.2, 0.7], colours: ["#7d8f48", "#9aa45b"] }),
    "sweet-vernal": Object.freeze({ id: "sweet-vernal", label: "Sweet vernal grass", height: "short", moisture: [0.4, 0.85], colours: ["#5f873d", "#82a855"] }),
    "blue-fescue": Object.freeze({ id: "blue-fescue", label: "Blue fescue", height: "short", moisture: [0.15, 0.5], colours: ["#748a53", "#9da77d"] }),
    "mountain-bent": Object.freeze({ id: "mountain-bent", label: "Mountain bent", height: "short", moisture: [0.3, 0.75], colours: ["#667e48", "#8a9b63"] }),
    "meadow-foxtail": Object.freeze({ id: "meadow-foxtail", label: "Meadow foxtail", height: "tall", moisture: [0.5, 0.9], colours: ["#5d873b", "#84a954"] }),
    "timothy": Object.freeze({ id: "timothy", label: "Timothy", height: "tall", moisture: [0.45, 0.85], colours: ["#688d40", "#8fac5a"] }),
    "cocksfoot": Object.freeze({ id: "cocksfoot", label: "Cocksfoot", height: "medium", moisture: [0.35, 0.8], colours: ["#5d8038", "#7f9f4d"] }),
    "tufted-hairgrass": Object.freeze({ id: "tufted-hairgrass", label: "Tufted hair-grass", height: "tall", moisture: [0.55, 0.95], colours: ["#6c8e4b", "#94a96b"] }),
    "reed-canary-grass": Object.freeze({ id: "reed-canary-grass", label: "Reed canary-grass", height: "tall", moisture: [0.65, 1], colours: ["#66864f", "#8da26c"] }),
    "marsh-foxtail": Object.freeze({ id: "marsh-foxtail", label: "March foxtail", height: "tall", moisture: [0.72, 1], colours: ["#5c7d4a", "#819867"] }),
    "red-fescue": Object.freeze({ id: "red-fescue", label: "Red fescue", height: "medium", moisture: [0.3, 0.7], colours: ["#718448", "#919f5c"] }),
    "crested-dogstail": Object.freeze({ id: "crested-dogstail", label: "Crested dogstail", height: "medium", moisture: [0.2, 0.65], colours: ["#7c8a47", "#a0a560"] }),
    "purple-moor-grass": Object.freeze({ id: "purple-moor-grass", label: "Purple moor-grass", height: "medium", moisture: [0.25, 0.6], colours: ["#796d4c", "#a08a61"] }),
    "wood-meadow-grass": Object.freeze({ id: "wood-meadow-grass", label: "Wood meadow-grass", height: "medium", moisture: [0.45, 0.8], colours: ["#5d8244", "#82a460"] }),
    "feather-grass": Object.freeze({ id: "feather-grass", label: "Feather grass", height: "tall", moisture: [0.12, 0.42], colours: ["#9a925c", "#c0b27b"] }),
});

export const GRASSLAND_FLOWERS = Object.freeze({
    daisy: Object.freeze({ id: "daisy", label: "Daisy", colours: ["#f4f0db", "#e8dfbf"], seasons: ["spring", "summer"], pollinator: 0.4 }),
    "white-clover": Object.freeze({ id: "white-clover", label: "White clover", colours: ["#f1eedb", "#d9dfbf"], seasons: ["spring", "summer"], pollinator: 0.8 }),
    cowslip: Object.freeze({ id: "cowslip", label: "Cowslip", colours: ["#e7bd46", "#caa13c"], seasons: ["spring"], pollinator: 0.75 }),
    buttercup: Object.freeze({ id: "buttercup", label: "Buttercup", colours: ["#e9ca4b", "#c6a43d"], seasons: ["spring", "summer"], pollinator: 0.6 }),
    knapweed: Object.freeze({ id: "knapweed", label: "Knapweed", colours: ["#9566a8", "#b291c0"], seasons: ["summer", "autumn"], pollinator: 0.9 }),
    meadowsweet: Object.freeze({ id: "meadowsweet", label: "Meadowsweet", colours: ["#e7ddc3", "#d2c5a5"], seasons: ["summer"], pollinator: 0.8 }),
    "marsh-marigold": Object.freeze({ id: "marsh-marigold", label: "Marsh marigold", colours: ["#e2b83e", "#c99b32"], seasons: ["spring"], pollinator: 0.5 }),
    "ragged-robin": Object.freeze({ id: "ragged-robin", label: "Ragged robin", colours: ["#d48ca2", "#b96e89"], seasons: ["summer"], pollinator: 0.6 }),
    orchid: Object.freeze({ id: "orchid", label: "Meadow orchid", colours: ["#a878b7", "#d0a6d6"], seasons: ["spring", "summer"], pollinator: 0.7, rare: true }),
    harebell: Object.freeze({ id: "harebell", label: "Harebell", colours: ["#8799c6", "#b4bfdf"], seasons: ["summer", "autumn"], pollinator: 0.55 }),
    "wild-thyme": Object.freeze({ id: "wild-thyme", label: "Wild thyme", colours: ["#bd8db6", "#956f91"], seasons: ["summer"], pollinator: 0.9 }),
    hawkweed: Object.freeze({ id: "hawkweed", label: "Hawkweed", colours: ["#db9b3d", "#bd7b34"], seasons: ["summer", "autumn"], pollinator: 0.6 }),
    "pasque-flower": Object.freeze({ id: "pasque-flower", label: "Pasque flower", colours: ["#a789b5", "#806391"], seasons: ["spring"], pollinator: 0.5, rare: true }),
    scabious: Object.freeze({ id: "scabious", label: "Field scabious", colours: ["#9b8bbe", "#b9add5"], seasons: ["summer", "autumn"], pollinator: 0.85 }),
    bluebell: Object.freeze({ id: "bluebell", label: "Bluebell", colours: ["#6d74bd", "#9298da"], seasons: ["spring"], pollinator: 0.45 }),
    "wood-anemone": Object.freeze({ id: "wood-anemone", label: "Wood anemone", colours: ["#ece8dd", "#d1cbbd"], seasons: ["spring"], pollinator: 0.35 }),
    poppy: Object.freeze({ id: "poppy", label: "Field poppy", colours: ["#c64d3f", "#e37b55"], seasons: ["summer"], pollinator: 0.5 }),
    cornflower: Object.freeze({ id: "cornflower", label: "Cornflower", colours: ["#5277bc", "#83a0d4"], seasons: ["summer"], pollinator: 0.8 }),
    "mountain-avens": Object.freeze({ id: "mountain-avens", label: "Mountain avens", colours: ["#f0e5c7", "#d9cdb0"], seasons: ["spring", "summer"], pollinator: 0.4 }),
    "alpine-aster": Object.freeze({ id: "alpine-aster", label: "Alpine aster", colours: ["#9a83c2", "#c0a9da"], seasons: ["summer", "autumn"], pollinator: 0.55 }),
    "meadow-saffron": Object.freeze({ id: "meadow-saffron", label: "Meadow saffron", colours: ["#a87dbb", "#cfadd8"], seasons: ["autumn"], pollinator: 0.45 }),
    "red-clover": Object.freeze({ id: "red-clover", label: "Red clover", colours: ["#b55e7c", "#d18aa1"], seasons: ["spring", "summer"], pollinator: 0.9 }),
});

export const GRASSLAND_HERBS = Object.freeze({
    yarrow: Object.freeze({ id: "yarrow", label: "Yarrow", seasons: ["spring", "summer", "autumn"], medicine: true, goods: ["herbs"], colour: "#dfd9c6" }),
    thyme: Object.freeze({ id: "thyme", label: "Wild thyme", seasons: ["spring", "summer"], medicine: true, goods: ["herbs"], colour: "#b5869d" }),
    chamomile: Object.freeze({ id: "chamomile", label: "Chamomile", seasons: ["spring", "summer"], medicine: true, goods: ["herbs"], colour: "#efe9d5" }),
    "st-johns-wort": Object.freeze({ id: "st-johns-wort", label: "St John's wort", seasons: ["summer"], medicine: true, goods: ["herbs"], colour: "#e0bd3d" }),
    valerian: Object.freeze({ id: "valerian", label: "Valerian", seasons: ["spring", "summer"], medicine: true, goods: ["herbs"], colour: "#e5d7c8" }),
    mint: Object.freeze({ id: "mint", label: "Water mint", seasons: ["summer"], medicine: true, goods: ["herbs"], colour: "#b7a2c5" }),
    plantain: Object.freeze({ id: "plantain", label: "Ribwort plantain", seasons: ["spring", "summer"], medicine: false, goods: ["herbs"], colour: "#a89a63" }),
    "meadowsweet-herb": Object.freeze({ id: "meadowsweet-herb", label: "Meadowsweet herb", seasons: ["summer"], medicine: true, goods: ["herbs"], colour: "#e1d7bd" }),
});

export const GRASSLAND_TREES = Object.freeze({
    "old-oak": Object.freeze({
        id: "old-oak", label: "Ancient field oak", kind: "old", crown: 0.9, trunk: 0.34,
        colours: { spring: "#6d8d49", summer: "#426c3e", autumn: "#9b783e", winter: "#676351" },
        goods: ["acorns"], note: "a boundary tree older than the fields around it",
    }),
    "fruit-apple": Object.freeze({
        id: "fruit-apple", label: "Apple tree", kind: "fruit", crown: 0.66, trunk: 0.2,
        colours: { spring: "#b7a6a9", summer: "#557f42", autumn: "#a3713d", winter: "#6a5b4d" },
        goods: ["orchard-fruit"], note: "a gnarled orchard tree with a small autumn crop",
    }),
    "fruit-pear": Object.freeze({
        id: "fruit-pear", label: "Pear tree", kind: "fruit", crown: 0.7, trunk: 0.21,
        colours: { spring: "#b5b09a", summer: "#4f7841", autumn: "#a68b42", winter: "#6a5a4c" },
        goods: ["orchard-fruit"], note: "an old pear tree at the meadow edge",
    }),
    hawthorn: Object.freeze({
        id: "hawthorn", label: "Hawthorn hedge", kind: "hedge", crown: 0.56, trunk: 0.12,
        colours: { spring: "#779257", summer: "#40643a", autumn: "#8e6c42", winter: "#6d6653" },
        goods: ["timber", "hazelnuts"], note: "a thorny hedge used by nesting birds and foxes",
    }),
    alder: Object.freeze({
        id: "alder", label: "Alder", kind: "riparian", crown: 0.72, trunk: 0.24,
        colours: { spring: "#6c8a55", summer: "#426b46", autumn: "#847444", winter: "#625d50" },
        goods: ["timber", "alder-cones"], note: "a water-loving tree marking the damp ground",
    }),
    willow: Object.freeze({
        id: "willow", label: "Crack willow", kind: "riparian", crown: 0.82, trunk: 0.27,
        colours: { spring: "#8b9f62", summer: "#5b7d4d", autumn: "#9b8b4b", winter: "#716b59" },
        goods: ["timber", "willow-withies"], note: "a riverside willow with flexible withies",
    }),
    poplar: Object.freeze({
        id: "poplar", label: "Windbreak poplar", kind: "windbreak", crown: 0.62, trunk: 0.34,
        colours: { spring: "#71945a", summer: "#4a7047", autumn: "#a19048", winter: "#666253" },
        goods: ["timber"], note: "a tall tree planted to break the prevailing wind",
    }),
    rowan: Object.freeze({
        id: "rowan", label: "Rowan", kind: "grove", crown: 0.5, trunk: 0.16,
        colours: { spring: "#78905a", summer: "#4b7044", autumn: "#a75f3a", winter: "#635c4e" },
        goods: ["rowan-berries", "timber"], note: "a small berry-bearing tree of upland edges",
    }),
    "field-maple": Object.freeze({
        id: "field-maple", label: "Field maple", kind: "grove", crown: 0.6, trunk: 0.2,
        colours: { spring: "#7c9754", summer: "#4c7543", autumn: "#b07b3e", winter: "#655e4f" },
        goods: ["timber"], note: "a hardy hedgerow tree with golden autumn colour",
    }),
});

export const GRASSLAND_FAUNA = Object.freeze({
    "red-deer": Object.freeze({ id: "red-deer", label: "Red deer", group: "large", kind: "deer", note: "grazing the meadow edge", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    "roe-deer": Object.freeze({ id: "roe-deer", label: "Roe deer", group: "large", kind: "deer", note: "moving between hedges and open grass", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    hare: Object.freeze({ id: "hare", label: "Brown hare", group: "small", kind: "hare", note: "crouched in the tall grass", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    fox: Object.freeze({ id: "fox", label: "Fox", group: "predator", kind: "fox", note: "following the field margin", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    stoat: Object.freeze({ id: "stoat", label: "Stoat", group: "predator", kind: "stoat", note: "hunting along a stone wall", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    buzzard: Object.freeze({ id: "buzzard", label: "Buzzard", group: "raptor", kind: "raptor", note: "circling over the open field", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    kestrel: Object.freeze({ id: "kestrel", label: "Kestrel", group: "raptor", kind: "raptor", note: "hovering above the grass", seasons: ["spring", "summer", "autumn"], seasonal: true }),
    skylark: Object.freeze({ id: "skylark", label: "Skylark", group: "bird", kind: "songbird", note: "singing above the meadow", seasons: ["spring", "summer", "autumn"], seasonal: true }),
    lapwing: Object.freeze({ id: "lapwing", label: "Lapwing", group: "bird", kind: "ground-bird", note: "nesting on the open ground", seasons: ["spring", "summer"], seasonal: true, groundNesting: true }),
    "meadow-pipit": Object.freeze({ id: "meadow-pipit", label: "Meadow pipit", group: "bird", kind: "ground-bird", note: "flitting between tussocks", seasons: ["spring", "summer", "autumn"], seasonal: true, groundNesting: true }),
    "painted-lady": Object.freeze({ id: "painted-lady", label: "Painted lady", group: "insect", kind: "butterfly", note: "visiting the flower heads", seasons: ["spring", "summer", "autumn"], seasonal: true }),
    "meadow-brown": Object.freeze({ id: "meadow-brown", label: "Meadow brown", group: "insect", kind: "butterfly", note: "drifting low over the sward", seasons: ["summer"], seasonal: true }),
    bumblebee: Object.freeze({ id: "bumblebee", label: "Bumblebee", group: "insect", kind: "bee", note: "working the clover", seasons: ["spring", "summer"], seasonal: true }),
    "field-mouse": Object.freeze({ id: "field-mouse", label: "Field mouse", group: "rodent", kind: "mouse", note: "rustling under the seed heads", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    vole: Object.freeze({ id: "vole", label: "Meadow vole", group: "rodent", kind: "mouse", note: "following a run through the grass", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    cattle: Object.freeze({ id: "cattle", label: "Cattle", group: "livestock", kind: "cattle", note: "grazing the managed pasture", seasons: ["spring", "summer", "autumn"], seasonal: true }),
    sheep: Object.freeze({ id: "sheep", label: "Sheep", group: "livestock", kind: "sheep", note: "cropping the turf close", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
    goat: Object.freeze({ id: "goat", label: "Goat", group: "livestock", kind: "goat", note: "browsing the scrubby edge", seasons: ["spring", "summer", "autumn"], seasonal: true }),
    horse: Object.freeze({ id: "horse", label: "Horse", group: "livestock", kind: "horse", note: "standing in the pasture", seasons: ["spring", "summer", "autumn", "winter"], seasonal: true }),
});

export const GRASSLAND_GOODS = Object.freeze({
    hay: Object.freeze({ id: "hay", label: "Hay", category: "fodder" }),
    "meadow-grass": Object.freeze({ id: "meadow-grass", label: "Meadow grass", category: "fodder" }),
    wildflowers: Object.freeze({ id: "wildflowers", label: "Wildflowers", category: "gather" }),
    "orchard-fruit": Object.freeze({ id: "orchard-fruit", label: "Orchard fruit", category: "gather" }),
    reed: Object.freeze({ id: "reed", label: "Reeds", category: "gather" }),
    turf: Object.freeze({ id: "turf", label: "Turf", category: "gather" }),
});

const SEASONAL_FLOWER_CHANCE = Object.freeze({ spring: 0.92, summer: 1, autumn: 0.34, winter: 0.03 });
const SEASONAL_GRASS = Object.freeze({
    spring: { short: [100, 143, 61], tall: [82, 126, 52] },
    summer: { short: [119, 138, 58], tall: [93, 119, 47] },
    autumn: { short: [142, 128, 66], tall: [124, 112, 55] },
    winter: { short: [145, 151, 137], tall: [128, 136, 121] },
});
const HABITAT_BY_FORMATION = Object.freeze({
    "short-turf": ["short", "dry"],
    "tall-meadow": ["tall", "mesic"],
    "wet-meadow": ["wet", "tall"],
    "dry-meadow": ["dry", "short"],
    "rocky-pasture": ["rock", "dry", "short"],
    "hill-meadow": ["hill", "mesic"],
    "wooded-meadow": ["wood", "mesic"],
    "orchard-meadow": ["orchard", "mesic"],
    "steppe-edge": ["dry", "steppe"],
    "mountain-meadow": ["mountain", "short"],
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const fract = value => value - Math.floor(value);

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
    return unit(seed, Math.floor(x / cell), Math.floor(y / cell), salt);
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

function seasonKeyFor(dayOfYear, climate) {
    return SEASON_KEYS[seasonalState(dayOfYear, climate).season] || "spring";
}

function chooseFormation({ moisture, temperature, height, seaLevel, soil, rockiness, vegetationRoll, climate }) {
    if (height >= seaLevel + 0.5) return "mountain-meadow";
    if (moisture > 0.7) return "wet-meadow";
    if (moisture < 0.34) return climate === "arid" || temperature > 0.66 ? "steppe-edge" : "dry-meadow";
    if (rockiness > 0.64) return "rocky-pasture";
    if (vegetationRoll > 0.8 && height < seaLevel + 0.2) return "orchard-meadow";
    if (vegetationRoll > 0.7 && moisture > 0.48) return "wooded-meadow";
    if (height >= seaLevel + 0.33) return "hill-meadow";
    if (soil > 0.58 && moisture > 0.52) return "tall-meadow";
    return "short-turf";
}

function flowerPool(formationId, season, moisture, height) {
    return Object.values(GRASSLAND_FLOWERS).filter(flower => flower.seasons.includes(season)
        && (formationId === "wet-meadow" ? moisture > 0.6 || flower.id === "meadowsweet" || flower.id === "orchid"
            : formationId === "dry-meadow" ? moisture < 0.52 || flower.id === "harebell"
                : formationId === "mountain-meadow" ? height > 0.7 || flower.id === "harebell"
                    : true));
}

function herbPool(season, moisture) {
    return Object.values(GRASSLAND_HERBS).filter(herb => herb.seasons.includes(season)
        && (moisture > 0.6 ? herb.id !== "thyme" : herb.id !== "mint"));
}

function buildFlowers(seed, x, y, formation, season, moisture, height, bloomChance) {
    if (bloomChance <= 0.04) return [];
    const roll = unit(seed, x, y, 0x464c4f57);
    if (roll > bloomChance) return [];
    const pool = flowerPool(formation.id, season, moisture, height);
    if (!pool.length) return [];
    const count = 1 + Math.floor(unit(seed, x, y, 0x464c4f58) * (roll < 0.22 ? 3 : 2));
    const chosen = [];
    for (let index = 0; index < count; index++) {
        const flower = pick(seed, x + index * 3, y - index, pool, 0x464c4f59 + index);
        if (flower && !chosen.some(entry => entry.id === flower.id)) chosen.push(flower);
    }
    return chosen;
}

function buildHerbs(seed, x, y, season, moisture) {
    const pool = herbPool(season, moisture);
    if (!pool.length || unit(seed, x, y, 0x48455242) > 0.58) return [];
    return [pick(seed, x, y, pool, 0x48455243), pick(seed, x + 2, y + 1, pool, 0x48455244)]
        .filter((herb, index, list) => herb && list.findIndex(entry => entry?.id === herb.id) === index);
}

function buildTrees(seed, x, y, { formation, moisture, height, seaLevel, nearForest, vegetationRoll, season }) {
    const trees = [];
    let hedge = false;
    let windbreak = false;
    const roll = unit(seed, x, y, 0x54524545);
    const hedgeRoll = coarse(seed, x, y, 4, 0x48454745);
    if (hedgeRoll > 0.76 && moisture > 0.36) {
        hedge = true;
        trees.push({ ...GRASSLAND_TREES.hawthorn, offsetX: (unit(seed, x, y, 0x48454746) - 0.5) * 0.44, offsetY: (unit(seed, x + 1, y, 0x48454747) - 0.5) * 0.28, scale: 1.1, role: "hedge" });
    }
    if (formation.id === "wet-meadow" && roll > 0.48) {
        trees.push({ ...GRASSLAND_TREES[roll > 0.72 ? "willow" : "alder"], offsetX: (roll - 0.5) * 0.38, offsetY: (unit(seed, x, y, 0x52495041) - 0.5) * 0.22, scale: 0.95 + roll * 0.2, role: "riparian" });
    } else if (formation.id === "orchard-meadow" && roll > 0.3) {
        trees.push({ ...GRASSLAND_TREES[roll > 0.62 ? "fruit-pear" : "fruit-apple"], offsetX: (roll - 0.5) * 0.42, offsetY: (unit(seed, x, y, 0x46525549) - 0.5) * 0.24, scale: 0.9 + roll * 0.22, role: "fruit" });
    } else if (nearForest && vegetationRoll > 0.48) {
        trees.push({ ...GRASSLAND_TREES[roll > 0.58 ? "field-maple" : "old-oak"], offsetX: (roll - 0.5) * 0.4, offsetY: (unit(seed, x, y, 0x4f4c4454) - 0.5) * 0.24, scale: 1.05, role: roll > 0.58 ? "grove" : "old" });
        if (roll > 0.72) trees.push({ ...GRASSLAND_TREES.rowan, offsetX: (roll - 0.2) * 0.34, offsetY: 0.16, scale: 0.84, role: "grove" });
    } else if (height < seaLevel + 0.24 && formation.id !== "wet-meadow" && roll > 0.8) {
        windbreak = true;
        const tree = GRASSLAND_TREES.poplar;
        for (let index = 0; index < 3; index++) {
            trees.push({ ...tree, offsetX: (index - 1) * 0.23, offsetY: (index % 2 - 0.5) * 0.06, scale: 0.86 + index * 0.08, role: "windbreak" });
        }
    } else if (roll > 0.9) {
        trees.push({ ...GRASSLAND_TREES["old-oak"], offsetX: (roll - 0.5) * 0.32, offsetY: 0.08, scale: 1.18, role: "old" });
    }
    return {
        trees,
        hedge,
        windbreak,
        treeChance: trees.length ? (hedge ? 0.08 : nearForest ? 0.14 : 0.045) : 0,
        leafColour: trees[0]?.colours?.[season] || "#5f7d46",
    };
}

function buildFauna(seed, x, y, { season, formation, moisture, bloom, pollinator, use, treeRoll, pasture }) {
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = GRASSLAND_FAUNA[id];
        if (!definition || fauna.some(entry => entry.id === id)) return;
        if (!definition.seasons.includes(season)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(4, Math.round(count))) });
    };
    const open = formation.id !== "wooded-meadow" && formation.id !== "mountain-meadow";
    const wet = moisture > 0.66;
    if (open && treeRoll > 0.24) add(treeRoll > 0.62 ? "roe-deer" : "red-deer", treeRoll > 0.75 ? 3 : 2);
    if (open && unit(seed, x, y, 0x48415245) > 0.35) add("hare");
    if (fauna.some(entry => entry.group === "large") && unit(seed, x, y, 0x464f58) > 0.58) add("fox");
    if (unit(seed, x, y, 0x53544f41) > 0.68) add("stoat");
    if (open && unit(seed, x, y, 0x42555a5a) > 0.4) add(season === "winter" ? "buzzard" : "kestrel");
    if (open && unit(seed, x, y, 0x534b594c) > 0.42) add(season === "spring" ? "skylark" : "meadow-pipit");
    if (season === "spring" && open && !wet && unit(seed, x, y, 0x4e455354) > 0.56) add("lapwing");
    if ((bloom > 0.14 || pollinator > 0.58) && unit(seed, x, y, 0x494e5345) > 0.34) add(season === "summer" ? "meadow-brown" : "painted-lady");
    if ((bloom > 0.2 || formation.id === "tall-meadow") && unit(seed, x, y, 0x424545) > 0.28) add("bumblebee");
    if (unit(seed, x, y, 0x524f4445) > 0.56) add(season === "autumn" ? "vole" : "field-mouse");
    if ((use.grazed || use.overgrazed || pasture > 0.6) && !use.overgrazed && season !== "winter") {
        const livestock = use.livestock?.length ? use.livestock : ["cattle", "sheep", "goat", "horse"];
        add(livestock[hash32(seed, x, y, 0x4c495645) % livestock.length], 2);
    }
    return fauna.slice(0, 5);
}

function buildGoods(seed, x, y, { season, formation, moisture, bloom, pollinator, trees, soil, use }) {
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.06 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    const tall = ["tall-meadow", "wet-meadow", "hill-meadow"].includes(formation.id);
    if (tall || use.mowed || formation.density > 0.7) {
        const haySeason = season === "summer" ? 1 : season === "autumn" ? 0.86 : season === "spring" ? 0.48 : 0.12;
        add("hay", "Hay", "fodder", haySeason * (0.6 + formation.density * 0.35) * (use.overgrazed ? 0.38 : 1));
    }
    // Every grassland tile can yield a little grass; managed and tall swards
    // yield more. This is the everyday fodder that keeps a stable alive when
    // mast is scarce, while hay remains the preserved summer/autumn crop.
    add("meadow-grass", "Meadow grass", "fodder",
        (0.2 + formation.density * 0.34) * (use.grazed ? 1.12 : use.mowed ? 1.05 : 1)
        * (season === "winter" ? 0.24 : 1));
    if (bloom > 0.2 && ["spring", "summer"].includes(season)) add("wildflowers", "Wildflowers", "gather", bloom * 0.62);
    if (trees.some(tree => tree.kind === "fruit") && season === "autumn") add("orchard-fruit", "Orchard fruit", "gather", 0.72);
    if (moisture > 0.7) add("reed", "Reeds", "gather", 0.38 + moisture * 0.2);
    if (soil > 0.5 && season !== "winter") add("turf", "Turf", "gather", 0.2 + soil * 0.18);
    if (bloom > 0.14 || pollinator > 0.52) {
        add("herbs", "Herbs", "gather", 0.32 + bloom * 0.28);
        if (season === "summer" && pollinator > 0.42) add("honey", "Honey", "gather", 0.38 + pollinator * 0.3);
    }
    if (season === "autumn" && moisture > 0.52) add("mushrooms", "Mushrooms", "gather", 0.28);
    return goods.sort((a, b) => b.abundance - a.abundance);
}

function normalizeUse(value = {}) {
    const explicit = value && typeof value === "object" ? value : {};
    const state = explicit.state || (explicit.overgrazed ? "overgrazed" : explicit.grazed ? "grazed"
        : explicit.mowed ? "mowed" : explicit.trampled ? "trampled" : explicit.path ? "path" : "wild");
    const grazed = Boolean(explicit.grazed || state === "grazed" || state === "overgrazed");
    const mowed = Boolean(explicit.mowed || state === "mowed");
    const wild = Boolean(explicit.wild || state === "wild" || state === "feral");
    const trampled = Boolean(explicit.trampled || state === "trampled");
    const path = Boolean(explicit.path || state === "path");
    const overgrazed = Boolean(explicit.overgrazed || state === "overgrazed");
    return {
        ...explicit,
        state,
        grazed,
        mowed,
        wild,
        trampled,
        path,
        overgrazed,
        bareSoil: Boolean(explicit.bareSoil || overgrazed || trampled),
        encroachment: Boolean(explicit.encroachment || (wild && number(explicit.yearsSinceUse) > 3)),
        reforestation: Boolean(explicit.reforestation || (wild && number(explicit.yearsSinceUse) > 9)),
        intensity: clamp01(explicit.intensity ?? (overgrazed ? 1 : grazed ? 0.72 : mowed ? 0.6 : trampled ? 0.82 : 0.16)),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        livestock: Array.isArray(explicit.livestock) ? explicit.livestock.filter(id => GRASSLAND_FAUNA[id]) : [],
        label: explicit.label || ({ grazed: "grazed pasture", mowed: "mown hay meadow", wild: "unmanaged meadow", trampled: "trampled ground", path: "path through the grass", overgrazed: "overgrazed, damaged turf" }[state] || "open meadow"),
    };
}

/**
 * Derive the complete grassland profile for one tile.
 *
 * `use` is optional. grassland-use.js fills it from real buildings, roads and
 * years without management; tests and previews can pass it directly.
 */
export function grasslandProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.55);
    const temperature = clamp01(context.temperature ?? 0.55);
    const height = clamp01(context.height ?? 0.5);
    const climate = context.climate || "temperate";
    const seaLevel = number(context.seaLevel, 0.33);
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonalState(dayOfYear, climate);
    const seasonKey = SEASON_KEYS[season.season] || "spring";
    const fertility = clamp01(0.18 + moisture * 0.62 + (0.62 - height) * 0.25 + (temperature - 0.5) * 0.08);
    const rockiness = clamp01((height - (seaLevel + 0.2)) * 1.7 + (coarse(seed, x, y, 5, 0x524f434b) - 0.5) * 0.45);
    const relief = coarse(seed, x, y, 7, 0x52454c49);
    const vegetationRoll = unit(seed, x, y, 0x56454745);
    const soil = clamp01(fertility * (0.72 + coarse(seed, x, y, 3, 0x534f494c) * 0.28));
    const formation = GRASSLAND_FORMATIONS[chooseFormation({
        moisture, temperature, height, seaLevel, soil, rockiness, vegetationRoll, climate,
    })] || GRASSLAND_FORMATIONS["short-turf"];
    const nearForest = moisture > 0.46 && height > seaLevel + 0.12 && height < seaLevel + 0.38 && unit(seed, x, y, 0x45444745) > 0.48;
    const nearSteppe = moisture < 0.42 || (temperature > 0.64 && moisture < 0.5);
    const nearMountain = height > seaLevel + 0.42;
    const flat = height < seaLevel + 0.18 && relief > 0.3;
    const plain = height < seaLevel + 0.34 && !flat;
    const hill = height >= seaLevel + 0.32;
    const hollow = !hill && moisture > 0.58 && relief < 0.42;
    const rocky = rockiness > 0.58 || formation.id === "rocky-pasture";
    // Flowering is patchy at a 2–3 tile scale: the coarse roll creates whole
    // flower islands and flowering sections, while the fine roll varies colour
    // and species within that patch.
    const flowerPatch = coarse(seed, x, y, 3, 0x464c4f50);
    const bloomChance = SEASONAL_FLOWER_CHANCE[seasonKey] * (formation.id === "dry-meadow" ? 0.68 : 1)
        * (1 - Math.max(0, season.snowCover - 0.55) * 0.8);
    const bloom = clamp01(bloomChance * (0.4 + flowerPatch * 0.72)
        * (0.68 + moisture * 0.22) * (formation.id === "wet-meadow" ? 0.94 : 1));
    const flowers = buildFlowers(seed, x, y, formation, seasonKey, moisture, height, bloom);
    const herbs = buildHerbs(seed, x, y, seasonKey, moisture);
    const rareRoll = unit(seed, x, y, 0x52415245);
    const rarePlant = rareRoll > 0.9 ? pick(seed, x, y, Object.values(GRASSLAND_FLOWERS).filter(flower => flower.rare && flower.seasons.includes(seasonKey)), 0x52415245) : null;
    if (rarePlant && !flowers.some(flower => flower.id === rarePlant.id)) flowers.push(rarePlant);
    const use = normalizeUse(context.use);
    const pasture = clamp01((formation.density * 0.64 + moisture * 0.2 + soil * 0.16) * (1 - use.overgrazed * 0.5) * (1 - Math.max(0, rockiness - 0.5) * 0.35));
    const pollinator = clamp01((flowers.length ? 0.34 : 0) + flowers.reduce((sum, flower) => sum + (flower.pollinator || 0), 0) * 0.23
        + (formation.id === "tall-meadow" || formation.id === "orchard-meadow" ? 0.14 : 0) - (use.overgrazed ? 0.22 : 0));
    const treeRoll = unit(seed, x, y, 0x54524545);
    const woody = buildTrees(seed, x, y, { formation, moisture, height, seaLevel, nearForest, vegetationRoll, season: seasonKey });
    const trees = woody.trees;
    const fauna = buildFauna(seed, x, y, { season: seasonKey, formation, moisture, bloom, pollinator, use, treeRoll, pasture });
    const goods = buildGoods(seed, x, y, { season: seasonKey, formation, moisture, bloom, pollinator, trees, soil, use });
    const grassBase = SEASONAL_GRASS[seasonKey][formation.height === "short" ? "short" : "tall"];
    let grassColour = mixColour(grassBase, [171, 154, 92], clamp01((formation.id === "dry-meadow" || formation.id === "steppe-edge" ? 0.34 : 0.08) + season.warmth * 0.3 + (1 - moisture) * 0.2));
    grassColour = mixColour(grassColour, [70, 119, 70], clamp01((moisture - 0.56) * 0.42));
    if (hill) grassColour = mixColour(grassColour, [190, 188, 110], clamp01((height - seaLevel) * 0.42));
    if (season.snowCover > 0.04) grassColour = mixColour(grassColour, [195, 204, 203], season.snowCover * 0.72);
    if (use.overgrazed) grassColour = mixColour(grassColour, [139, 123, 89], 0.32);
    if (use.mowed) grassColour = mixColour(grassColour, [126, 149, 78], 0.12);
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.18) * 0.72);
    const morning = clamp01(1 - Math.abs(hour - 7) / 4);
    const mist = clamp01((morning * 0.72 + (weather === "fog" ? 0.48 : weather === "rain" || weather === "storm" ? 0.26 : 0))
        * (0.2 + clamp01((moisture - 0.4) / 0.45) * 0.9) * (seasonKey === "winter" ? 0.72 : 1));
    const dew = clamp01(morning * (0.32 + moisture * 0.7) * (weather === "clear" ? 1 : 0.78));
    const features = new Set();
    const mark = (...ids) => { for (const id of ids) features.add(id); };
    mark("1.2.6.1");
    if (formation.height !== "short") mark("1.2.6.2");
    if (formation.height === "tall") mark("1.2.6.3");
    mark("1.2.6.4");
    if (seasonKey === "spring") mark("1.2.6.5");
    if (seasonKey === "summer" && season.warmth > 0.25) mark("1.2.6.6");
    if (bloom > 0.12 && flowers.length && !use.overgrazed) mark("1.2.6.7");
    mark("1.2.6.8");
    if (flowers.length) mark("1.2.6.9", "1.2.6.12");
    if (herbs.length) mark("1.2.6.10");
    if (bloom > 0.38 && flowerPatch > 0.62) mark("1.2.6.11");
    if (seasonKey) mark("1.2.6.13");
    if (pollinator > 0.48) mark("1.2.6.14");
    if (rarePlant) mark("1.2.6.15");
    if (flat) mark("1.2.6.16");
    if (hill) mark("1.2.6.17");
    if (plain) mark("1.2.6.18");
    if (hollow) mark("1.2.6.19");
    if (moisture > 0.66) mark("1.2.6.20");
    if (moisture < 0.36) mark("1.2.6.21");
    if (rocky) mark("1.2.6.22");
    if (nearForest || nearSteppe || nearMountain) mark("1.2.6.23");
    if (trees.some(tree => tree.kind === "old")) mark("1.2.6.24");
    if (trees.filter(tree => tree.kind === "grove").length >= 2) mark("1.2.6.25");
    if (woody.hedge) mark("1.2.6.26");
    if (trees.some(tree => tree.kind === "riparian")) mark("1.2.6.27");
    if (trees.some(tree => tree.kind === "fruit")) mark("1.2.6.28");
    if (woody.windbreak) mark("1.2.6.29");
    if (fauna.some(entry => ["red-deer", "roe-deer", "hare"].includes(entry.id))) mark("1.2.6.30");
    if (fauna.some(entry => ["fox", "stoat"].includes(entry.id))) mark("1.2.6.31");
    if (fauna.some(entry => entry.group === "bird" || entry.group === "raptor")) mark("1.2.6.32");
    if (fauna.some(entry => entry.group === "insect")) mark("1.2.6.33");
    if (fauna.some(entry => entry.group === "livestock")) mark("1.2.6.34");
    if (fauna.some(entry => entry.groundNesting)) mark("1.2.6.35");
    if (fauna.some(entry => entry.group === "rodent")) mark("1.2.6.36");
    if (fauna.length) mark("1.2.6.37");
    if (pasture > 0.42) mark("1.2.6.38");
    if (goods.some(good => good.id === "hay" || good.id === "meadow-grass")) mark("1.2.6.39");
    if (herbs.some(herb => herb.medicine)) mark("1.2.6.40");
    if (goods.some(good => good.id === "honey" || good.id === "wildflowers")) mark("1.2.6.41");
    if (soil > 0.52) mark("1.2.6.42");
    if (goods.length) mark("1.2.6.43");
    if (soil > 0.5 && (flat || plain) && moisture > 0.38 && moisture < 0.74) mark("1.2.6.44");
    if ((flat || plain) && !rocky && moisture < 0.68) mark("1.2.6.45");
    if (use.grazed) mark("1.2.6.46");
    if (use.mowed) mark("1.2.6.47");
    if (use.wild) mark("1.2.6.48");
    if (use.trampled) mark("1.2.6.49");
    if (use.path) mark("1.2.6.50");
    if (use.encroachment) mark("1.2.6.51");
    if (use.reforestation) mark("1.2.6.52");
    if (use.overgrazed) mark("1.2.6.53");
    mark("1.2.6.54");
    if (formation.height === "tall") mark("1.2.6.55");
    if (sunlight > 0.28) mark("1.2.6.56");
    if (hill) mark("1.2.6.57");
    if (mist > 0.22) mark("1.2.6.58");
    if (dew > 0.22) mark("1.2.6.59");
    mark("1.2.6.60");

    const grasses = formation.grasses.map(id => GRASSLAND_GRASSES[id]).filter(Boolean)
        .slice(0, 1 + Math.round(formation.density * 3));
    const windSway = clamp01((formation.height === "tall" ? 0.75 : formation.height === "short" ? 0.32 : 0.52) * wind * (1 - season.snowCover * 0.8));
    return {
        x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season: seasonKey, seasonIndex: season.season,
        moisture, temperature, height, climate, fertility: soil, rockiness,
        features: GRASSLAND_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: { flat, plain, hill, hollow, rocky, nearForest, nearSteppe, nearMountain, label: hollow ? "small hollow" : hill ? "gentle hill" : flat ? "flat meadow" : "wide plain" },
        sward: { short: formation.height === "short", medium: formation.height === "medium", tall: formation.height === "tall", density: clamp01(formation.density * (0.72 + moisture * 0.22) * (1 - Math.max(0, season.snowCover - 0.68) * 0.4)), height: formation.height },
        grasses, flowers, herbs, rarePlant, trees,
        hedge: woody.hedge, windbreak: woody.windbreak, treeChance: woody.treeChance,
        shrubPatches: clamp01(coarse(seed, x, y, 5, 0x53485255) * 0.66 + (woody.hedge ? 0.28 : 0) + (use.encroachment ? 0.22 : 0)),
        bloom, flowerPatch, pollinator, pasture, pastureAnimals: ["cattle", "sheep", "goat", "horse"], soil, cropSuitability: clamp01(soil * (flat || plain ? 0.92 : 0.68) * (moisture > 0.36 && moisture < 0.74 ? 1 : 0.45)),
        settlementSuitability: clamp01((flat || plain ? 0.72 : 0.36) + (1 - moisture) * 0.18 + (1 - rockiness) * 0.1),
        roadSuitability: clamp01((flat ? 0.82 : plain ? 0.68 : 0.4) + (1 - moisture) * 0.18 - rockiness * 0.2),
        use, fauna, goods,
        grassColour, grassHex: hexColour(grassColour), leafColour: woody.leafColour,
        visual: {
            wind: wind < 0.5 ? "calm" : wind > 1.6 ? "strong" : "breeze", windSway,
            wave: formation.height === "tall" ? clamp01(0.42 + wind * 0.3) : clamp01(wind * 0.16),
            phase: unit(seed, x, y, 0x57494e44) * Math.PI * 2,
            sunlight, hillGradient: hill ? clamp01((height - seaLevel) * 0.75 + relief * 0.25) : 0,
            mist, dew, flowerGlow: clamp01(bloom * (0.4 + sunlight * 0.6)),
            seasonalTint: seasonKey, snowCover: season.snowCover,
        },
        seasonalMovement: fauna.length ? ({
            spring: "moving onto the fresh growth",
            summer: "following flowers, shade and water",
            autumn: "drawn to seed heads and the harvested margins",
            winter: "sheltering along hedges and the woodland edge",
        }[seasonKey]) : "",
    };
}

export function grasslandGoodsFor(profile, dayOfYear = 150, climate = profile?.climate || "temperate") {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear, climate);
    return profile.goods.filter(good => good.id !== "orchard-fruit" || season === "autumn");
}

export function grasslandProductsAt(x, y, context = {}) {
    const profile = grasslandProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.02) return null;
    const goods = grasslandGoodsFor(profile, context.dayOfYear ?? 150, profile.climate);
    if (!goods.length) return null;
    return {
        x: profile.x, y: profile.y, profile, goods,
        label: profile.label, use: profile.use, fauna: profile.fauna,
    };
}

export function grasslandSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no seasonal harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const rare = profile.rarePlant ? " · rare: " + profile.rarePlant.label : "";
    return profile.label + " · " + profile.use.label + " · " + Math.round(profile.sward.density * 100) + "% cover · "
        + goods + " · " + wildlife + rare;
}

export function grasslandRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const GRASSLAND_LIMITS = Object.freeze({
    requirements: GRASSLAND_REQUIREMENTS.length,
    maxFauna: 5,
    maxFlowers: 4,
    maxGoods: 8,
});
