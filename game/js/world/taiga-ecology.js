// Taiga ecology (spec 1.2.10.1–1.2.10.56).
//
// The taiga is not a cold pine plantation. It is a fire- and snow-shaped
// conifer forest with long winters, short intense summers, wet hollows, lakes,
// bogs and a mosaic of spruce, pine, larch and birch. The same deterministic
// profile drives terrain detail, forest stands, gathering, farm/stable surveys,
// movement costs and the shared good ledger.
//
// No per-tile state and no extra tick loop are added. Every caller supplies
// seed, terrain, season, weather and land-use inputs and receives a bounded,
// pure profile.

import { seasonalState } from "./season.js";

export const TAIGA_REQUIREMENTS = Object.freeze([
    { id: "1.2.10.1", key: "spruce-forests", label: "Large spruce forests", group: "vegetation" },
    { id: "1.2.10.2", key: "pine-forests", label: "Pine forests", group: "vegetation" },
    { id: "1.2.10.3", key: "larch-stands", label: "Larch stands", group: "vegetation" },
    { id: "1.2.10.4", key: "birch-islands", label: "Birch islands", group: "vegetation" },
    { id: "1.2.10.5", key: "forest-ages", label: "Different forest ages", group: "vegetation" },
    { id: "1.2.10.6", key: "dense-and-light", label: "Dense and light woodland sections", group: "vegetation" },
    { id: "1.2.10.7", key: "small-clearings", label: "Small forest clearings", group: "vegetation" },
    { id: "1.2.10.8", key: "transitions", label: "Transitions to tundra and wetlands", group: "vegetation" },
    { id: "1.2.10.9", key: "mossy-floors", label: "Moss-rich forest floors", group: "soil" },
    { id: "1.2.10.10", key: "lichen-heath", label: "Lichens and heath plants", group: "vegetation" },
    { id: "1.2.10.11", key: "berry-shrubs", label: "Berry shrubs", group: "vegetation" },
    { id: "1.2.10.12", key: "wet-soils", label: "Moist soils", group: "soil" },
    { id: "1.2.10.13", key: "peat-areas", label: "Peat-bearing areas", group: "soil" },
    { id: "1.2.10.14", key: "exposed-roots", label: "Exposed roots", group: "vegetation" },
    { id: "1.2.10.15", key: "deadwood", label: "Deadwood and tree stumps", group: "vegetation" },
    { id: "1.2.10.16", key: "rocky-woodland", label: "Rocky and stony woodland sections", group: "landform" },
    { id: "1.2.10.17", key: "many-lakes", label: "Numerous lakes", group: "water" },
    { id: "1.2.10.18", key: "forest-ponds", label: "Small forest ponds", group: "water" },
    { id: "1.2.10.19", key: "rivers-streams", label: "Rivers and streams", group: "water" },
    { id: "1.2.10.20", key: "swampy-banks", label: "Swampy shoreline areas", group: "water" },
    { id: "1.2.10.21", key: "seasonal-floods", label: "Seasonal floodplains", group: "water" },
    { id: "1.2.10.22", key: "winter-ice", label: "Ice surfaces in winter", group: "water" },
    { id: "1.2.10.23", key: "wet-hollows", label: "Wet hollows", group: "water" },
    { id: "1.2.10.24", key: "natural-waterways", label: "Natural waterways", group: "water" },
    { id: "1.2.10.25", key: "moose-reindeer", label: "Moose and reindeer", group: "fauna" },
    { id: "1.2.10.26", key: "bears", label: "Bears", group: "fauna" },
    { id: "1.2.10.27", key: "wolves-lynx", label: "Wolves and lynx", group: "fauna" },
    { id: "1.2.10.28", key: "foxes", label: "Foxes", group: "fauna" },
    { id: "1.2.10.29", key: "hares-rodents", label: "Hares and rodents", group: "fauna" },
    { id: "1.2.10.30", key: "owls-forest-birds", label: "Owls and forest birds", group: "fauna" },
    { id: "1.2.10.31", key: "beaver-otter", label: "Beaver and otter", group: "fauna" },
    { id: "1.2.10.32", key: "summer-insects", label: "Numerous insects in summer", group: "fauna" },
    { id: "1.2.10.33", key: "conifer-wood", label: "Conifer wood", group: "economy" },
    { id: "1.2.10.34", key: "birch-wood", label: "Birch wood", group: "economy" },
    { id: "1.2.10.35", key: "resin", label: "Resin", group: "economy" },
    { id: "1.2.10.36", key: "mushrooms-berries", label: "Mushrooms and berries", group: "economy" },
    { id: "1.2.10.37", key: "furs", label: "Furs and pelts", group: "economy" },
    { id: "1.2.10.38", key: "game", label: "Hunting game", group: "economy" },
    { id: "1.2.10.39", key: "fish", label: "Fish", group: "economy" },
    { id: "1.2.10.40", key: "peat-resources", label: "Peat and other regional raw materials", group: "economy" },
    { id: "1.2.10.41", key: "long-winter", label: "Very long winters", group: "climate" },
    { id: "1.2.10.42", key: "short-summer", label: "Short, sometimes intense summers", group: "climate" },
    { id: "1.2.10.43", key: "heavy-snow", label: "Heavy snowfall", group: "climate" },
    { id: "1.2.10.44", key: "frost-periods", label: "Frost periods", group: "climate" },
    { id: "1.2.10.45", key: "forest-fire", label: "Forest fires in dry summers", group: "hazard" },
    { id: "1.2.10.46", key: "mosquitoes", label: "Mosquitoes and other insects in wet summers", group: "hazard" },
    { id: "1.2.10.47", key: "snow-windbreak", label: "Snowbreak and windthrow", group: "hazard" },
    { id: "1.2.10.48", key: "remote-supply", label: "Difficult supply in remote areas", group: "economy" },
    { id: "1.2.10.49", key: "forestry", label: "Forestry as a major economic sector", group: "economy" },
    { id: "1.2.10.50", key: "hunting-fishing", label: "Hunting and fishing", group: "economy" },
    { id: "1.2.10.51", key: "fur-trade", label: "Fur trade", group: "economy" },
    { id: "1.2.10.52", key: "limited-agriculture", label: "Limited agriculture", group: "economy" },
    { id: "1.2.10.53", key: "scattered-settlements", label: "Small, widely separated settlements", group: "economy" },
    { id: "1.2.10.54", key: "waterways-trade", label: "Waterways as trade and transport routes", group: "economy" },
    { id: "1.2.10.55", key: "seasonal-transport", label: "Seasonal transport problems", group: "hazard" },
    { id: "1.2.10.56", key: "winter-supplies", label: "High importance of stores and winter preparation", group: "economy" },
]);

export const TAIGA_REQUIREMENT_IDS = Object.freeze(TAIGA_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(TAIGA_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const TAIGA_FORMATIONS = Object.freeze({
    "spruce-forest": Object.freeze({
        id: "spruce-forest", label: "Old Spruce Forest", height: "dense",
        note: "dark spruce spires over a deep moss floor, deadwood and driven snow",
        trees: ["spruce", "spruce", "pine", "birch"], shrubs: ["juniper", "blueberry"],
        grasses: ["wood-sedge", "boreal-fescue"], lichens: ["feather-moss", "reindeer-lichen"],
        berries: ["blueberry", "lingonberry"],
    }),
    "pine-forest": Object.freeze({
        id: "pine-forest", label: "Pine Ridge", height: "open",
        note: "sunlit pine trunks, lichen heath and dry needle litter on a low ridge",
        trees: ["pine", "pine", "larch", "birch"], shrubs: ["juniper", "lingonberry"],
        grasses: ["sheep-fescue", "boreal-fescue"], lichens: ["reindeer-lichen", "crustose-lichen"],
        berries: ["lingonberry", "blueberry"],
    }),
    "larch-stand": Object.freeze({
        id: "larch-stand", label: "Larch Stand", height: "light",
        note: "airy larch crowns that turn gold and drop their needles before winter",
        trees: ["larch", "larch", "pine", "birch"], shrubs: ["juniper", "rowan"],
        grasses: ["wood-sedge", "boreal-fescue"], lichens: ["feather-moss", "lichen"],
        berries: ["blueberry"],
    }),
    "birch-island": Object.freeze({
        id: "birch-island", label: "Birch Island", height: "light",
        note: "white birch stems in a bright island of regrowth among dark conifers",
        trees: ["birch", "birch", "spruce", "rowan"], shrubs: ["rowan", "blueberry"],
        grasses: ["wood-sedge", "wavy-hair-grass"], lichens: ["feather-moss"],
        berries: ["blueberry", "lingonberry"],
    }),
    "mixed-taiga": Object.freeze({
        id: "mixed-taiga", label: "Mixed Taiga", height: "dense",
        note: "spruce, pine, larch and birch in an uneven, many-aged mosaic",
        trees: ["spruce", "pine", "larch", "birch"], shrubs: ["juniper", "willow"],
        grasses: ["wood-sedge", "boreal-fescue"], lichens: ["feather-moss", "reindeer-lichen"],
        berries: ["blueberry", "lingonberry"],
    }),
    "forest-clearing": Object.freeze({
        id: "forest-clearing", label: "Forest Clearing", height: "open",
        note: "a small sunlit gap of grasses, fireweed and berry bushes ringed by conifers",
        trees: ["birch", "spruce"], shrubs: ["blueberry", "willow"],
        grasses: ["wavy-hair-grass", "wood-sedge"], lichens: ["feather-moss"],
        berries: ["blueberry", "cloudberry"],
    }),
    "tundra-ecotone": Object.freeze({
        id: "tundra-ecotone", label: "Tundra Ecotone", height: "open",
        note: "wind-bent birch and lichen heath where the taiga gives way to tundra",
        trees: ["dwarf-birch", "spruce", "birch"], shrubs: ["dwarf-willow", "lingonberry"],
        grasses: ["boreal-fescue", "cotton-sedge"], lichens: ["reindeer-lichen", "crustose-lichen"],
        berries: ["cloudberry", "lingonberry"],
    }),
    "peat-bog": Object.freeze({
        id: "peat-bog", label: "Peat Bog", height: "wetland",
        note: "sphagnum hummocks, black bog pools and stunted pines over deep peat",
        trees: ["bog-pine", "dwarf-birch"], shrubs: ["bog-rosemary", "cloudberry"],
        grasses: ["cotton-sedge", "wood-sedge"], lichens: ["sphagnum-moss", "reindeer-lichen"],
        berries: ["cloudberry", "lingonberry"],
    }),
    "lakeshore": Object.freeze({
        id: "lakeshore", label: "Taiga Lakeshore", height: "shore",
        note: "a forest lake ringed by reeds, willow, wet moss and beaver sign",
        trees: ["birch", "alder", "spruce"], shrubs: ["willow", "bog-rosemary"],
        grasses: ["reed", "cotton-sedge"], lichens: ["sphagnum-moss"],
        berries: ["cloudberry"],
    }),
    "rocky-woodland": Object.freeze({
        id: "rocky-woodland", label: "Rocky Woodland", height: "rocky",
        note: "pine and spruce roots gripping broken stone above the wet forest floor",
        trees: ["pine", "spruce", "larch"], shrubs: ["juniper", "rowan"],
        grasses: ["sheep-fescue", "boreal-fescue"], lichens: ["crustose-lichen", "reindeer-lichen"],
        berries: ["lingonberry"],
    }),
});

export const TAIGA_TREES = Object.freeze({
    spruce: Object.freeze({
        id: "spruce", label: "Norway spruce", kind: "spruce", heightMeters: 30, crown: 0.62,
        conifer: true, evergreen: true, snowRetention: 1.25,
        colours: { spring: "#294b39", summer: "#244536", autumn: "#203d30", winter: "#1d342b" },
        goods: ["spruce-timber", "spruce-cones", "resin", "mushrooms", "lichen"],
    }),
    pine: Object.freeze({
        id: "pine", label: "Scots pine", kind: "pine", heightMeters: 26, crown: 0.75,
        conifer: true, evergreen: true, snowRetention: 0.9,
        colours: { spring: "#3b6041", summer: "#35583c", autumn: "#335138", winter: "#2d4934" },
        goods: ["pine-timber", "pine-cones", "resin", "blueberries", "lingonberries"],
    }),
    larch: Object.freeze({
        id: "larch", label: "Siberian larch", kind: "larch", heightMeters: 28, crown: 0.58,
        conifer: true, deciduousNeedles: true, snowRetention: 0.72,
        colours: { spring: "#5f8a4c", summer: "#4c7a3d", autumn: "#c08a2d", winter: "#8b6c4a" },
        goods: ["larch-timber", "larch-cones", "resin", "mushrooms"],
    }),
    birch: Object.freeze({
        id: "birch", label: "Silver birch", kind: "birch", heightMeters: 18, crown: 0.8,
        colours: { spring: "#739b55", summer: "#5c8b49", autumn: "#d0ad3f", winter: "#a9a08d" },
        goods: ["birch-timber", "birch-sap", "birch-bark", "mushrooms", "chanterelle"],
    }),
    aspen: Object.freeze({
        id: "aspen", label: "Aspen", kind: "aspen", heightMeters: 20, crown: 0.72,
        colours: { spring: "#789f59", summer: "#638e4d", autumn: "#d3a642", winter: "#a9a18c" },
        goods: ["birch-timber", "mushrooms", "game"],
    }),
    alder: Object.freeze({
        id: "alder", label: "Alder", kind: "broadleaf", heightMeters: 14, crown: 0.78,
        colours: { spring: "#5e8a50", summer: "#4b7d50", autumn: "#a07c3b", winter: "#8e8978" },
        goods: ["alder-timber", "herbs", "willow-withies"],
    }),
    willow: Object.freeze({
        id: "willow", label: "Boreal willow", kind: "willow", heightMeters: 8, crown: 0.72,
        colours: { spring: "#759253", summer: "#64864d", autumn: "#b19545", winter: "#918c76" },
        goods: ["willow-withies", "willow-bark", "bark"],
    }),
    "dwarf-birch": Object.freeze({
        id: "dwarf-birch", label: "Dwarf birch", kind: "birch", heightMeters: 2.4, crown: 0.7,
        colours: { spring: "#829a5e", summer: "#748c55", autumn: "#b18b42", winter: "#8f8978" },
        goods: ["birch-bark", "willow-withies", "bark"],
    }),
    "bog-pine": Object.freeze({
        id: "bog-pine", label: "Bog pine", kind: "pine", heightMeters: 7, crown: 0.55,
        conifer: true, evergreen: true, snowRetention: 1.05,
        colours: { spring: "#4c6d4a", summer: "#456543", autumn: "#425d40", winter: "#3b543d" },
        goods: ["pine-timber", "pine-cones", "resin", "peat"],
    }),
    rowan: Object.freeze({
        id: "rowan", label: "Rowan", kind: "broadleaf", heightMeters: 9, crown: 0.7,
        colours: { spring: "#71975a", summer: "#5f8b4d", autumn: "#c17a35", winter: "#9a917c" },
        goods: ["rowan-berries", "birch-bark", "herbs"],
    }),
});

export const TAIGA_SHRUBS = Object.freeze({
    juniper: Object.freeze({ id: "juniper", label: "Juniper", goods: ["juniper-berries", "resin", "lichen"], colours: ["#3f6248", "#6d8460"] }),
    blueberry: Object.freeze({ id: "blueberry", label: "Blueberry", goods: ["blueberries", "taiga-herb"], colours: ["#526f4e", "#819867"] }),
    lingonberry: Object.freeze({ id: "lingonberry", label: "Lingonberry", goods: ["lingonberries", "taiga-herb"], colours: ["#60764f", "#8b9b6b"] }),
    cloudberry: Object.freeze({ id: "cloudberry", label: "Cloudberry", goods: ["cloudberry"], colours: ["#6f835b", "#a6a77b"], wetland: true }),
    "dwarf-willow": Object.freeze({ id: "dwarf-willow", label: "Dwarf willow", goods: ["willow-withies", "bark"], colours: ["#75845e", "#a0a17b"] }),
    rowan: Object.freeze({ id: "rowan", label: "Rowan scrub", goods: ["rowan-berries", "taiga-herb"], colours: ["#6c854f", "#a1a06b"] }),
    willow: Object.freeze({ id: "willow", label: "Willow thicket", goods: ["willow-withies", "willow-bark", "bark"], colours: ["#718a58", "#a0ab77"], wetland: true }),
    "bog-rosemary": Object.freeze({ id: "bog-rosemary", label: "Bog rosemary", goods: ["taiga-herb"], colours: ["#647b5d", "#8e9d7b"], wetland: true }),
});

export const TAIGA_HERBS = Object.freeze({
    "taiga-herb": Object.freeze({ id: "taiga-herb", label: "Boreal herbs", seasons: ["spring", "summer", "autumn"], medicine: true, colour: "#a3ad87" }),
    "twinflower": Object.freeze({ id: "twinflower", label: "Twinflower", seasons: ["spring", "summer"], medicine: true, colour: "#b8b9a7" }),
    "globeflower": Object.freeze({ id: "globeflower", label: "Globeflower", seasons: ["summer"], medicine: true, colour: "#c6b87f" }),
    "bog-cotton": Object.freeze({ id: "bog-cotton", label: "Bog cotton", seasons: ["summer", "autumn"], medicine: true, colour: "#d7d4bd", wetland: true }),
});

export const TAIGA_FLOWERS = Object.freeze({
    fireweed: Object.freeze({ id: "fireweed", label: "Fireweed", seasons: ["summer", "autumn"], colours: ["#b570a0", "#d9a3c5"] }),
    "twinflower-flower": Object.freeze({ id: "twinflower-flower", label: "Twinflower", seasons: ["spring", "summer"], colours: ["#e0dcd0", "#f3efe4"] }),
    "globeflower-flower": Object.freeze({ id: "globeflower-flower", label: "Globeflower", seasons: ["summer"], colours: ["#e0c96e", "#f2e3a4"] }),
    "boreal-violet": Object.freeze({ id: "boreal-violet", label: "Boreal violet", seasons: ["spring", "summer"], colours: ["#9586b5", "#c3b7d8"] }),
});

export const TAIGA_FAUNA = Object.freeze({
    moose: Object.freeze({ id: "moose", label: "Moose", group: "herbivore", kind: "moose", seasons: ["spring", "summer", "autumn", "winter"], forest: true }),
    reindeer: Object.freeze({ id: "reindeer", label: "Reindeer", group: "herbivore", kind: "reindeer", seasons: ["spring", "summer", "autumn", "winter"], herd: true, migratory: true }),
    bear: Object.freeze({ id: "bear", label: "Brown bear", group: "predator", kind: "bear", seasons: ["spring", "summer", "autumn"], forest: true }),
    wolf: Object.freeze({ id: "wolf", label: "Wolf", group: "predator", kind: "wolf", seasons: ["spring", "summer", "autumn", "winter"], forest: true }),
    lynx: Object.freeze({ id: "lynx", label: "Lynx", group: "predator", kind: "lynx", seasons: ["spring", "summer", "autumn", "winter"], forest: true }),
    fox: Object.freeze({ id: "fox", label: "Red fox", group: "predator", kind: "fox", seasons: ["spring", "summer", "autumn", "winter"] }),
    hare: Object.freeze({ id: "hare", label: "Mountain hare", group: "small", kind: "hare", seasons: ["spring", "summer", "autumn", "winter"] }),
    squirrel: Object.freeze({ id: "squirrel", label: "Red squirrel", group: "rodent", kind: "squirrel", seasons: ["spring", "summer", "autumn", "winter"], forest: true }),
    vole: Object.freeze({ id: "vole", label: "Boreal vole", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn", "winter"] }),
    owl: Object.freeze({ id: "owl", label: "Boreal owl", group: "bird", kind: "owl", seasons: ["spring", "summer", "autumn", "winter"], forest: true }),
    capercaillie: Object.freeze({ id: "capercaillie", label: "Capercaillie", group: "bird", kind: "capercaillie", seasons: ["spring", "summer", "autumn", "winter"], forest: true, groundBird: true }),
    crossbill: Object.freeze({ id: "crossbill", label: "Crossbill", group: "bird", kind: "crossbill", seasons: ["spring", "summer", "autumn", "winter"], forest: true }),
    beaver: Object.freeze({ id: "beaver", label: "Beaver", group: "rodent", kind: "beaver", seasons: ["spring", "summer", "autumn", "winter"], water: true }),
    otter: Object.freeze({ id: "otter", label: "Otter", group: "predator", kind: "otter", seasons: ["spring", "summer", "autumn", "winter"], water: true }),
    mosquito: Object.freeze({ id: "mosquito", label: "Mosquito swarm", group: "insect", kind: "insect", seasons: ["summer"] }),
    blackfly: Object.freeze({ id: "blackfly", label: "Blackfly swarm", group: "insect", kind: "insect", seasons: ["summer"] }),
    ant: Object.freeze({ id: "ant", label: "Wood ant", group: "insect", kind: "ant", seasons: ["spring", "summer", "autumn"] }),
});

// Only genuinely new goods live here. Spruce, pine, larch and birch timber,
// resin, mushrooms, berries, game, hides, fur, fish, peat, stone and bog iron
// reuse the shared catalogue.
export const TAIGA_GOODS = Object.freeze({
    "taiga-herb": Object.freeze({ id: "taiga-herb", label: "Boreal herbs", category: "medicine" }),
    "lake-fish": Object.freeze({ id: "lake-fish", label: "Lake fish", category: "gather" }),
    "larch-cones": Object.freeze({ id: "larch-cones", label: "Larch cones", category: "mast" }),
    "birch-bark": Object.freeze({ id: "birch-bark", label: "Birch bark", category: "material" }),
    "bear-fat": Object.freeze({ id: "bear-fat", label: "Bear fat", category: "medicine" }),
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
    const current = explicit.state || "wild";
    const grazed = Boolean(explicit.grazed || current === "grazed" || current === "overgrazed");
    return {
        ...explicit, state: current, grazed,
        overgrazed: Boolean(explicit.overgrazed || current === "overgrazed"),
        wild: Boolean(explicit.wild || current === "wild" || current === "feral"),
        trampled: Boolean(explicit.trampled || current === "trampled"),
        path: Boolean(explicit.path || current === "path"),
        settled: Boolean(explicit.settled || explicit.settlement || current === "settled"),
        burned: Boolean(explicit.burned || current === "burned"),
        bareSoil: Boolean(explicit.bareSoil || grazed || current === "trampled"),
        intensity: clamp01(explicit.intensity ?? (grazed ? 0.58 : explicit.trampled ? 0.8 : 0.1)),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (grazed ? "grazed taiga pasture" : explicit.trampled
            ? "trampled taiga ground" : "unmanaged taiga"),
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
    if (scores.rocky > 0.76) return "rocky-woodland";
    if (scores.lake > 0.58) return "lakeshore";
    if (scores.peat > 0.58 && scores.marsh > 0.38) return "peat-bog";
    if (scores.aboveSea > 0.4 && scores.ecotone > 0.36) return "tundra-ecotone";
    if (scores.clearing > 0.64) return "forest-clearing";
    // A coarse mosaic patch keeps the four-species mixed taiga reachable even
    // where one of the single-species scores is locally high.
    if (scores.mixed > 0.78) return "mixed-taiga";
    if (scores.birch > 0.68) return "birch-island";
    if (scores.larch > 0.64) return "larch-stand";
    if (scores.pine > 0.62) return "pine-forest";
    if (scores.spruce > 0.58) return "spruce-forest";
    return "mixed-taiga";
}

// The same coarse landform scores decide both the visual formation and the
// cheap open-ground gate used by the terrain renderer. Keeping one function
// prevents a tile being drawn as a lake while a forest stand claims it.
function landscapeScores(seed, x, y, context) {
    const moisture = clamp01(context.moisture ?? 0.6);
    const temperature = clamp01(context.temperature ?? 0.26);
    const height = clamp01(context.height ?? 0.5);
    const seaLevel = number(context.seaLevel, 0.33);
    const aboveSea = Math.max(0, height - seaLevel);
    const relief = coarse(seed, x, y, 7, 0x52454c49);
    const wetRoll = coarse(seed, x, y, 5, 0x5745544c);
    const rockRoll = coarse(seed, x, y, 6, 0x524f434b);
    const lakeRoll = coarse(seed, x, y, 8, 0x4c414b45);
    const pondRoll = coarse(seed, x, y, 5, 0x504f4e44);
    const riverRoll = coarse(seed, x, y, 3, 0x52495652);
    const clearingRoll = coarse(seed, x, y, 5, 0x434c4541);
    const ecotoneRoll = coarse(seed, x, y, 6, 0x45434f54);
    const spruceRoll = coarse(seed, x, y, 4, 0x53505255);
    const pineRoll = coarse(seed, x, y, 4, 0x50494e45);
    const larchRoll = coarse(seed, x, y, 4, 0x4c4152);
    const birchRoll = coarse(seed, x, y, 3, 0x424952);
    const flat = 1 - smoothstep(0.08, 0.32, aboveSea);
    const wetness = clamp01(moisture * 0.64 + flat * 0.16 + wetRoll * 0.2 - aboveSea * 0.08);
    const marsh = clamp01(wetness * 0.8 + flat * 0.2 - 0.24);
    const peat = clamp01(wetness * 0.78 + (1 - relief) * 0.16 - 0.12);
    const lake = clamp01(smoothstep(0.58, 0.82, moisture) * flat * 0.72
        + (lakeRoll > 0.72 ? 0.38 : 0) + (1 - relief) * 0.08 - aboveSea * 0.22);
    const pond = clamp01(smoothstep(0.52, 0.78, moisture) * 0.42
        + (pondRoll > 0.68 ? 0.34 : 0) + flat * 0.12 - aboveSea * 0.18);
    const river = clamp01((1 - smoothstep(0.04, 0.1, aboveSea)) * 0.42
        + riverRoll * 0.4 + (moisture > 0.52 ? 0.16 : 0) - 0.12);
    const rocky = clamp01(aboveSea * 1.08 + rockRoll * 0.42 - 0.18);
    const cold = clamp01((0.3 - temperature) * 1.2 + (1 - moisture) * 0.08);
    const ecotone = clamp01(smoothstep(0.54, 0.8, aboveSea) * 0.5
        + smoothstep(0.42, 0.72, aboveSea) * 0.2 + cold * 0.3
        + (1 - moisture) * 0.18 + ecotoneRoll * 0.22);
    const forestCover = clamp01(0.5 + moisture * 0.28 + spruceRoll * 0.2 - aboveSea * 0.1);
    const clearing = clamp01(clearingRoll * 0.62 + (1 - forestCover) * 0.24 + 0.04);
    const spruce = clamp01(0.4 + moisture * 0.3 + (1 - relief) * 0.14 + spruceRoll * 0.26 - temperature * 0.14);
    const pine = clamp01(0.34 + (1 - moisture) * 0.26 + relief * 0.24 + pineRoll * 0.3);
    const larch = clamp01(0.28 + moisture * 0.14 + relief * 0.08 + larchRoll * 0.42);
    const birch = clamp01(0.24 + clearing * 0.24 + birchRoll * 0.42 + (1 - forestCover) * 0.12);
    const mixed = coarse(seed, x, y, 4, 0x4d495854);
    return {
        aboveSea, relief, wetness, marsh, peat, lake, pond, river, rocky,
        ecotone, clearing, spruce, pine, larch, birch, mixed, cold, flat,
    };
}

function buildTrees(seed, x, y, formation, season, scores, ageClass) {
    const signature = formation.id === "spruce-forest" ? "spruce"
        : formation.id === "pine-forest" ? "pine"
            : formation.id === "larch-stand" ? "larch"
                : formation.id === "birch-island" ? "birch"
                    : formation.id === "peat-bog" ? "bog-pine"
                        : formation.id === "lakeshore" ? "birch"
                            : formation.id === "tundra-ecotone" ? "dwarf-birch" : null;
    const forest = ["spruce-forest", "pine-forest", "larch-stand", "birch-island", "mixed-taiga", "rocky-woodland"].includes(formation.id);
    const chance = forest ? 0.88 : formation.id === "tundra-ecotone" ? 0.5 : formation.id === "forest-clearing" ? 0.34 : 0.6;
    const roll = unit(seed, x, y, 0x54524545);
    if (roll > chance + scores.wetness * 0.08 && !signature && !forest) return [];
    const count = forest ? (ageClass === "ancient" ? 3 : 2) : signature ? 1 : 1;
    const trees = [];
    for (let index = 0; index < count; index++) {
        const treeId = signature && index === 0
            ? signature : pick(seed, x + index, y, formation.trees, 0x54524546 + index);
        const tree = TAIGA_TREES[treeId];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x54524547) - 0.5) * 0.62,
            offsetY: (unit(seed, x, y + index, 0x54524548) - 0.5) * 0.32,
            scale: (forest ? 0.72 : 0.44) + unit(seed, x, y + index, 0x54524549) * 0.26,
            age: ageClass,
            seasonColour: tree.colours[season] || tree.colours.summer,
            snow: clamp01(scores.snowCover * (tree.snowRetention || 0.8)),
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, cover, water, openness, forest, wetland, berries } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = TAIGA_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(9, Math.round(count))) });
    };
    if ((forest || wetland) && unit(seed, x, y, 0x4d4f4f53) > 0.32) add("moose", 1);
    if ((openness > 0.26 || wetland) && unit(seed, x, y, 0x5245494e) > 0.34) add("reindeer", 3 + Math.floor(unit(seed, x, y, 0x48455244) * 5));
    if (forest && berries > 0.24 && unit(seed, x, y, 0x42454152) > 0.44) add("bear");
    if (forest && unit(seed, x, y, 0x574f4c46) > 0.46) add("wolf");
    if (forest && unit(seed, x, y, 0x4c594e58) > 0.58) add("lynx");
    if (unit(seed, x, y, 0x464f5831) > 0.26) add("fox");
    if (unit(seed, x, y, 0x48415245) > 0.3) add("hare");
    if (forest && unit(seed, x, y, 0x53515549) > 0.4) add("squirrel", 2);
    if (unit(seed, x, y, 0x564f4c45) > 0.44) add("vole", 2);
    if (forest && unit(seed, x, y, 0x4f574c31) > 0.4) add("owl");
    if (forest && unit(seed, x, y, 0x43415045) > 0.5) add("capercaillie");
    if (forest && unit(seed, x, y, 0x43524f53) > 0.42) add("crossbill", 2);
    if (water > 0.24 && unit(seed, x, y, 0x42454156) > 0.38) add("beaver", 2);
    if (water > 0.24 && unit(seed, x, y, 0x4f545445) > 0.48) add("otter");
    if (season === "summer" && (wetland > 0.2 || water > 0.2)) {
        add("mosquito", 4 + Math.floor(unit(seed, x, y, 0x4d4f5351) * 5));
        add("blackfly", 3 + Math.floor(unit(seed, x, y, 0x42464c59) * 4));
    }
    if (forest && season !== "winter") add("ant", 3);
    return fauna.slice(0, 9);
}

function buildGoods(seed, x, y, context) {
    const { season, trees, shrubs, bushes, fauna, water, peat, rocky, berries, forest, wetland, lichens } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.06 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    if (trees.some(tree => tree.kind === "spruce" || tree.kind === "pine" || tree.kind === "larch" || tree.kind === "bog-pine")) {
        add("resin", "Resin", "gather", 0.3 + (season === "summer" ? 0.16 : 0));
    }
    if (trees.some(tree => tree.kind === "spruce")) add("spruce-timber", "Spruce timber", "wood", 0.34);
    if (trees.some(tree => tree.kind === "pine" || tree.kind === "bog-pine")) add("pine-timber", "Pine timber", "wood", 0.3);
    if (trees.some(tree => tree.kind === "larch")) add("larch-timber", "Larch timber", "wood", 0.32);
    if (trees.some(tree => tree.kind === "larch")) add("larch-cones", "Larch cones", "mast", 0.22);
    if (trees.some(tree => tree.kind === "birch" || tree.kind === "aspen")) {
        add("birch-timber", "Birch timber", "wood", 0.28);
        add("birch-bark", "Birch bark", "material", 0.3);
    }
    if (season === "spring" && trees.some(tree => tree.kind === "birch")) add("birch-sap", "Birch sap", "gather", 0.3);
    if (trees.some(tree => tree.kind === "spruce" || tree.kind === "pine")) {
        add("spruce-cones", "Spruce cones", "mast", season === "autumn" || season === "winter" ? 0.38 : 0.2);
        add("pine-cones", "Pine cones", "mast", season === "autumn" ? 0.36 : 0.16);
    }
    if (berries > 0.24) {
        add("mushrooms", "Mushrooms", "gather", season === "autumn" ? 0.52 : 0.24);
        add("chanterelle", "Chanterelles", "gather", season === "summer" || season === "autumn" ? 0.34 : 0.1);
        add("blueberries", "Blueberries", "gather", season === "summer" || season === "autumn" ? 0.44 : 0.14);
        add("lingonberries", "Lingonberries", "gather", season === "autumn" || season === "winter" ? 0.42 : 0.18);
    }
    if (wetland > 0.32 && (season === "summer" || season === "autumn")) add("cloudberry", "Cloudberries", "gather", 0.36);
    if (lichens.length) add("lichen", "Lichen", "gather", 0.22);
    if (peat > 0.3) add("peat", "Peat", "material", peat * 0.7);
    if (rocky > 0.3) add("stone", "Stone", "material", rocky * 0.5);
    if (rocky > 0.34 && wetland > 0.24) add("bog-iron", "Bog iron", "material", rocky * wetland * 0.9);
    if (fauna.some(entry => entry.group === "herbivore")) {
        add("game", "Wild game", "hunt", 0.34);
        add("hides", "Hides", "hunt", 0.3);
        add("meat", "Meat", "food", 0.28);
    }
    if (fauna.some(entry => entry.id === "fox" || entry.id === "lynx" || entry.id === "wolf" || season === "winter")) {
        add("fur", "Furs", "hunt", season === "winter" ? 0.48 : 0.26);
    }
    if (fauna.some(entry => entry.id === "bear")) add("bear-fat", "Bear fat", "medicine", 0.26);
    if (water > 0.28 && season !== "winter") add("lake-fish", "Lake fish", "gather", 0.34 + water * 0.24);
    if (forest || wetland) add("taiga-herb", "Boreal herbs", "medicine", 0.24 + berries * 0.18);
    if (bushes.some(entry => entry.id === "willow" || entry.id === "dwarf-willow")) add("willow-withies", "Willow withies", "gather", 0.22);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 10);
}

/**
 * How strongly a tile belongs to the taiga. Taiga is the dedicated boreal
 * conifer climate; northern and temperate realms keep their established
 * forests, so existing saves render exactly as before.
 */
export function taigaPotentialAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const climate = context.climate || "temperate";
    if (climate !== "taiga") return 0;
    const height = clamp01(context.height ?? 0.5);
    const temperature = clamp01(context.temperature ?? 0.26);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height < seaLevel + 0.008 || height > 0.94) return 0;
    const boreal = 1 - smoothstep(0.34, 0.48, temperature);
    const roll = coarse(seed, x, y, 6, 0x54414947);
    return clamp01(0.72 + boreal * 0.18 + roll * 0.1);
}

export function isTaigaSite(x, y, context = {}) {
    return taigaPotentialAt(x, y, context) > 0.24;
}

/**
 * Cheap gate for open taiga ground. The renderer uses it to keep lakes, bogs,
 * ecotones and clearings out of the closed-forest stand path without building
 * a full profile for every tile.
 */
export function taigaOpenAt(x, y, context = {}) {
    if ((context.climate || "temperate") !== "taiga") return false;
    const height = clamp01(context.height ?? 0.5);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height < seaLevel + 0.008 || height > 0.94) return false;
    const seed = Number(context.seed) || 1;
    const scores = landscapeScores(seed, x, y, context);
    const formation = chooseFormation(scores);
    return formation !== "spruce-forest" && formation !== "pine-forest"
        && formation !== "larch-stand" && formation !== "birch-island"
        && formation !== "mixed-taiga" && formation !== "rocky-woodland";
}

/**
 * Derive the complete taiga profile for one tile. Pure and deterministic for
 * the same inputs; `use` is optional and comes from real buildings and roads.
 */
export function taigaProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.6);
    const temperature = clamp01(context.temperature ?? 0.26);
    const height = clamp01(context.height ?? 0.5);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "taiga";
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, "taiga");
    const use = normalizeUse(context.use);
    const scores = landscapeScores(seed, x, y, { ...context, moisture, temperature, height, seaLevel });
    const aboveSea = scores.aboveSea;
    const snowCover = clamp01(base.snowCover);
    const snowDepthCm = Math.round(snowCover * 150 + scores.aboveSea * 20 + wind * 3);
    const cold = clamp01((season === "winter" ? 0.86 : season === "spring" ? 0.28 : season === "autumn" ? 0.4 : 0.08)
        + (0.3 - temperature) * 1.35 + wind * 0.07 + snowCover * 0.1);
    const frost = clamp01((season === "winter" ? 0.9 : season === "autumn" ? 0.48 : season === "spring" ? 0.36 : 0.02)
        + (0.24 - temperature) * 0.9 + (hour <= 5 ? 0.05 : 0));
    const summerIntensity = clamp01(base.warmth * (0.7 + temperature * 0.8) + (season === "summer" ? 0.16 : 0));
    const growingSeasonDays = Math.round(74 + summerIntensity * 38 + (temperature - 0.24) * 24 - cold * 6);
    const winterDays = Math.round(178 + cold * 26 + snowCover * 8);
    const snowfall = clamp01(snowCover * 0.78 + (weather === "storm" ? 0.22 : 0) + (weather === "snow" ? 0.34 : 0) + wind * 0.05);
    const ice = Boolean((season === "winter" || frost > 0.72) && (scores.lake > 0.26 || scores.pond > 0.24 || scores.river > 0.3 || scores.marsh > 0.28));
    const marshBank = clamp01(scores.marsh * 0.8 + (scores.lake + scores.river) * 0.24 + scores.wetness * 0.12);
    const floodRisk = clamp01((scores.river * 0.34 + scores.lake * 0.18 + scores.pond * 0.14)
        * (season === "spring" ? 1.3 : 1) + (weather === "storm" || weather === "rain" ? 0.16 : 0));
    const waterway = Boolean(scores.river > 0.3 || scores.lake > 0.26 || scores.pond > 0.24);
    const formation = TAIGA_FORMATIONS[chooseFormation(scores)];
    const forest = ["spruce-forest", "pine-forest", "larch-stand", "birch-island", "mixed-taiga", "rocky-woodland"].includes(formation.id);
    const ageRoll = coarse(seed, x, y, 6, 0x41474531);
    const neighbourAge = coarse(seed, x + 3, y - 2, 6, 0x41474532);
    const ageClass = ageRoll > 0.76 ? "ancient" : ageRoll > 0.42 ? "mature" : "young";
    const neighbourClass = neighbourAge > 0.76 ? "ancient" : neighbourAge > 0.42 ? "mature" : "young";
    const ageClasses = [...new Set([ageClass, neighbourClass])];
    const ageVariation = clamp01(Math.abs(ageRoll - neighbourAge) * 2.2 + (ageClasses.length > 1 ? 0.2 : 0));
    const density = clamp01(formation.id === "spruce-forest" || formation.id === "mixed-taiga"
        ? 0.72 + scores.spruce * 0.2
        : formation.id === "pine-forest" || formation.id === "birch-island" || formation.id === "larch-stand"
            ? 0.42 + scores.pine * 0.22
            : formation.id === "rocky-woodland" ? 0.46 : 0.2 + scores.wetness * 0.14);
    const light = clamp01(1 - density * 0.82 - (snowCover > 0.75 ? 0.08 : 0));
    const moss = clamp01(0.3 + scores.wetness * 0.35 + (1 - light) * 0.16 + coarse(seed, x, y, 4, 0x4d4f5353) * 0.18);
    const lichen = clamp01(0.24 + scores.pine * 0.24 + scores.rocky * 0.16 + coarse(seed, x, y, 4, 0x4c494348) * 0.24);
    const heather = clamp01(0.16 + scores.pine * 0.28 + (1 - scores.wetness) * 0.2
        + coarse(seed, x, y, 5, 0x48454154) * 0.22);
    const berries = clamp01(0.2 + scores.wetness * 0.2 + scores.clearing * 0.12
        + (season === "summer" ? 0.1 : season === "autumn" ? 0.16 : 0));
    const deadwood = clamp01(0.16 + (ageClass === "ancient" ? 0.24 : 0.04) + scores.wetness * 0.12
        + (formation.id === "peat-bog" ? 0.08 : 0) + coarse(seed, x, y, 5, 0x44454144) * 0.24);
    const roots = clamp01(0.14 + scores.rocky * 0.22 + scores.wetness * 0.12 + deadwood * 0.22
        + (formation.id === "lakeshore" ? 0.1 : 0));
    const cleared = clamp01(scores.clearing + (formation.id === "forest-clearing" ? 0.28 : 0));
    const trees = buildTrees(seed, x, y, formation, season, { ...scores, snowCover }, ageClass);
    const grasses = formation.grasses.map(id => ({
        id, label: id.replace(/-/g, " "),
        colours: id === "reed" ? ["#7f8b57", "#b1a56e"] : ["#70865a", "#a4a879"],
    }));
    const shrubs = formation.shrubs.map(id => TAIGA_SHRUBS[id]).filter(Boolean);
    const lichens = formation.lichens.map(id => ({
        id, label: id.replace(/-/g, " "),
        colours: id === "sphagnum-moss" ? ["#7f8d5e", "#aab17a"] : ["#b9b79a", "#d7d2ae"],
    }));
    const herbs = Object.values(TAIGA_HERBS).filter(herb => herb.seasons.includes(season))
        .filter((entry, index) => coarse(seed, x, y, 4, 0x48455242 + index) > 0.48 - moss * 0.24);
    const bloom = clamp01((season === "summer" ? 0.82 : season === "spring" ? 0.42 : season === "autumn" ? 0.12 : 0)
        * (0.45 + base.greenUp * 0.35) * (1 - snowCover * 0.72) * (0.52 + scores.wetness * 0.28));
    const flowers = bloom > 0.05
        ? Object.values(TAIGA_FLOWERS).filter(flower => flower.seasons.includes(season))
            .filter((entry, index) => coarse(seed, x, y, 4, 0x464c4f57 + index) > 0.48 - bloom * 0.2)
            .slice(0, 3)
        : [];
    const openWater = score => score > 0.26;
    const waterStrength = clamp01(Math.max(scores.lake, scores.pond, scores.river * 0.9));
    const fauna = buildFauna(seed, x, y, {
        season, cover: density, water: waterStrength, openness: 1 - density,
        forest, wetland: scores.wetness, berries,
    });
    const coniferTrees = trees.filter(tree => tree.conifer || tree.kind === "bog-pine" || tree.kind === "larch");
    const birchTrees = trees.filter(tree => tree.kind === "birch" || tree.kind === "aspen");
    const goods = buildGoods(seed, x, y, {
        season, trees, shrubs, bushes: shrubs, fauna, water: waterStrength, peat: scores.peat,
        rocky: scores.rocky, berries, forest, wetland: scores.wetness, lichens,
    });
    const fireSeason = clamp01(season === "summer" ? 0.78 : season === "spring" ? 0.28 : 0.08);
    const fireRisk = clamp01(fireSeason * (0.22 + (1 - moisture) * 0.56 + scores.pine * 0.2) + wind * 0.05
        + (weather === "clear" && hour >= 11 && hour <= 17 ? 0.06 : 0));
    const snowbreakRisk = clamp01(snowCover * 0.56 + wind * 0.1 + scores.spruce * 0.18);
    const windthrowRisk = clamp01((weather === "storm" ? 0.62 : 0.12) + wind * 0.18
        + scores.spruce * 0.12 + deadwood * 0.16);
    const insects = season === "summer" ? clamp01(base.warmth * 0.46 + scores.wetness * 0.4 + scores.marsh * 0.14) : 0;
    const predators = clamp01(fauna.filter(entry => entry.group === "predator").length * 0.2 + density * 0.2);
    const forestry = clamp01(0.24 + (coniferTrees.length ? 0.36 : 0) + density * 0.24 + (formation.id === "larch-stand" ? 0.08 : 0));
    const hunting = clamp01(0.26 + fauna.filter(entry => entry.group === "herbivore").length * 0.16 + density * 0.14);
    const fishing = clamp01(waterStrength * 0.62 + scores.marsh * 0.18 + (ice ? 0.06 : 0));
    const furTrade = clamp01(0.2 + fauna.filter(entry => entry.group === "predator" || entry.id === "hare").length * 0.14
        + (season === "winter" ? 0.18 : 0));
    const agriculture = clamp01(0.12 + scores.wetness * 0.14 + summerIntensity * 0.16 - cold * 0.1 - scores.peat * 0.12);
    const buildingMaterials = clamp01(0.16 + (coniferTrees.length ? 0.28 : 0) + (birchTrees.length ? 0.1 : 0) + scores.rocky * 0.16);
    const fuelDemand = clamp01(0.42 + cold * 0.4 + snowCover * 0.1);
    const winterPreparedness = clamp01(0.34 + cold * 0.22 + snowCover * 0.22 + (season === "autumn" ? 0.12 : 0));
    const winterMobility = clamp01(1 - snowCover * 0.36 - cold * 0.12 - (season === "spring" ? 0.12 : 0));
    const supplyCost = clamp01(0.3 + (1 - density) * 0.08 + snowCover * 0.14 + scores.marsh * 0.16
        + (1 - waterway ? 0.1 : 0) + (1 - winterMobility) * 0.2);
    const settlementSpacing = clamp01(0.4 + (1 - agriculture) * 0.3 + (1 - density) * 0.1 + snowCover * 0.08);
    const waterwayTrade = clamp01(waterStrength * 0.66 + (scores.river > 0.3 ? 0.16 : 0) - (ice ? 0.18 : 0));
    const seasonalTransport = clamp01(snowCover * 0.46 + (season === "spring" ? 0.34 : 0) + floodRisk * 0.18
        + (1 - winterMobility) * 0.18);
    const storage = clamp01(0.42 + cold * 0.24 + snowCover * 0.1 + (season === "autumn" ? 0.08 : 0));
    const remoteSupply = clamp01(supplyCost * 0.78 + (1 - waterwayTrade) * 0.12 + (1 - buildingMaterials) * 0.08);
    const features = new Set();
    const mark = (...ids) => { for (const id of ids) features.add(id); };
    if (trees.some(tree => tree.kind === "spruce") && density > 0.5) mark("1.2.10.1");
    if (trees.some(tree => tree.kind === "pine") && formation.id !== "spruce-forest") mark("1.2.10.2");
    if (trees.some(tree => tree.kind === "larch")) mark("1.2.10.3");
    if (trees.some(tree => tree.kind === "birch" || tree.kind === "aspen") && (formation.id === "birch-island" || !forest)) mark("1.2.10.4");
    if (ageClasses.length > 1 || ageVariation > 0.4) mark("1.2.10.5");
    if (density > 0.64 || light > 0.48) mark("1.2.10.6");
    if (cleared > 0.34 || formation.id === "forest-clearing") mark("1.2.10.7");
    if (formation.id === "tundra-ecotone" || formation.id === "peat-bog" || scores.ecotone > 0.5 || scores.marsh > 0.32) mark("1.2.10.8");
    if (moss > 0.3) mark("1.2.10.9");
    if (lichen > 0.28 || heather > 0.3) mark("1.2.10.10");
    if (berries > 0.28 || shrubs.some(entry => entry.id === "blueberry" || entry.id === "lingonberry")) mark("1.2.10.11");
    if (scores.wetness > 0.45) mark("1.2.10.12");
    if (scores.peat > 0.3) mark("1.2.10.13");
    if (roots > 0.3) mark("1.2.10.14");
    if (deadwood > 0.28) mark("1.2.10.15");
    if (scores.rocky > 0.3) mark("1.2.10.16");
    if (scores.lake > 0.26) mark("1.2.10.17");
    if (scores.pond > 0.24) mark("1.2.10.18");
    if (scores.river > 0.3) mark("1.2.10.19");
    if (marshBank > 0.28) mark("1.2.10.20");
    if (floodRisk > 0.32) mark("1.2.10.21");
    if (ice) mark("1.2.10.22");
    if (scores.marsh > 0.24 && scores.relief < 0.42) mark("1.2.10.23");
    if (waterway) mark("1.2.10.24");
    if (fauna.some(entry => entry.id === "moose" || entry.id === "reindeer")) mark("1.2.10.25");
    if (fauna.some(entry => entry.id === "bear")) mark("1.2.10.26");
    if (fauna.some(entry => entry.id === "wolf" || entry.id === "lynx")) mark("1.2.10.27");
    if (fauna.some(entry => entry.id === "fox")) mark("1.2.10.28");
    if (fauna.some(entry => entry.id === "hare" || entry.group === "rodent")) mark("1.2.10.29");
    if (fauna.some(entry => entry.id === "owl" || entry.id === "crossbill" || entry.id === "capercaillie")) mark("1.2.10.30");
    if (fauna.some(entry => entry.id === "beaver" || entry.id === "otter")) mark("1.2.10.31");
    if (fauna.some(entry => entry.group === "insect" && season === "summer")) mark("1.2.10.32");
    if (goods.some(good => ["spruce-timber", "pine-timber", "larch-timber"].includes(good.id))) mark("1.2.10.33");
    if (goods.some(good => good.id === "birch-timber" || good.id === "birch-bark")) mark("1.2.10.34");
    if (goods.some(good => good.id === "resin")) mark("1.2.10.35");
    if (goods.some(good => ["mushrooms", "chanterelle", "blueberries", "lingonberries", "cloudberry"].includes(good.id))) mark("1.2.10.36");
    if (goods.some(good => good.id === "fur")) mark("1.2.10.37");
    if (goods.some(good => good.id === "game" || good.id === "meat")) mark("1.2.10.38");
    if (goods.some(good => good.id === "lake-fish")) mark("1.2.10.39");
    if (goods.some(good => good.id === "peat" || good.id === "bog-iron" || good.id === "stone")) mark("1.2.10.40");
    if (winterDays >= 190 || cold > 0.6) mark("1.2.10.41");
    if (growingSeasonDays <= 132 || summerIntensity > 0.7) mark("1.2.10.42");
    if (snowfall > 0.6 || snowDepthCm > 90) mark("1.2.10.43");
    if (frost > 0.55) mark("1.2.10.44");
    if (fireRisk > 0.42) mark("1.2.10.45");
    if (insects > 0.46) mark("1.2.10.46");
    if (snowbreakRisk > 0.38 || windthrowRisk > 0.42) mark("1.2.10.47");
    if (remoteSupply > 0.4) mark("1.2.10.48");
    if (forestry > 0.52) mark("1.2.10.49");
    if (hunting > 0.36 || fishing > 0.3) mark("1.2.10.50");
    if (furTrade > 0.3) mark("1.2.10.51");
    if (agriculture < 0.4) mark("1.2.10.52");
    if (settlementSpacing > 0.52) mark("1.2.10.53");
    if (waterwayTrade > 0.32) mark("1.2.10.54");
    if (seasonalTransport > 0.4) mark("1.2.10.55");
    if (winterPreparedness > 0.48 || storage > 0.5) mark("1.2.10.56");

    const ground = mixColour([92, 96, 78], [122, 112, 86], clamp01(scores.peat * 0.36 + (1 - scores.wetness) * 0.18));
    const green = mixColour([87, 111, 76], [109, 124, 82], clamp01(scores.wetness * 0.5 + base.greenUp * 0.24));
    const mossHex = hexColour(mixColour([88, 111, 74], [132, 139, 94], clamp01(moss * 0.55 + base.greenUp * 0.2)));
    const lichenHex = hexColour(mixColour([169, 170, 144], [207, 203, 172], snowCover * 0.26));
    const grassColour = hexColour(green);
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.15) * 0.66);
    const windSway = clamp01(0.14 + wind * 0.13 + (1 - density) * 0.1);
    const phase = unit(seed, x, y, 0x57494e44) * Math.PI * 2;
    const leafColour = trees[0]?.seasonColour || grassColour;
    const waterHex = ice ? "#c7d8dd" : waterway ? "#547f88" : "#6d8178";

    return {
        biome: "taiga", taiga: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate, moisture, temperature, height,
        features: TAIGA_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            hill: scores.relief > 0.62 && aboveSea > 0.12,
            flat: aboveSea < 0.12,
            rocky: scores.rocky > 0.5,
            hollow: scores.relief < 0.38 && scores.wetness > 0.48,
            relief: clamp01(scores.relief), aboveSea,
            label: formation.id === "rocky-woodland" ? "rocky woodland slope"
                : formation.id === "lakeshore" ? "lake shore"
                    : formation.id === "peat-bog" ? "peat hollow"
                        : scores.relief > 0.6 ? "boreal hillside" : "rolling taiga ground",
        },
        soil: {
            moisture: scores.wetness, wet: scores.wetness > 0.48, peat: scores.peat, marsh: scores.marsh,
            moss, lichen, nutrients: clamp01(0.28 + scores.wetness * 0.26 - scores.peat * 0.12 + moss * 0.12),
            drainage: clamp01((1 - scores.wetness) * 0.68 + scores.rocky * 0.2),
            bearing: clamp01(0.5 + (1 - scores.wetness) * 0.26 - scores.peat * 0.18 + scores.rocky * 0.12),
            erosion: clamp01(floodRisk * 0.3 + scores.rocky * 0.16 + (1 - density) * 0.12),
            permafrost: clamp01((0.26 - temperature) * 1.5 + scores.aboveSea * 0.12),
        },
        water: {
            lake: scores.lake, pond: scores.pond, river: scores.river, marsh: scores.marsh,
            openWater: openWater(scores.lake) || openWater(scores.pond) || openWater(scores.river),
            ice, frozen: ice, floodRisk, marshBank, waterway,
            depthCm: Math.round(Math.max(scores.lake, scores.pond) * 90 + scores.river * 24),
            label: ice ? "frozen water" : scores.lake > 0.26 ? "forest lake"
                : scores.pond > 0.24 ? "small forest pond" : scores.river > 0.3 ? "river or stream"
                    : scores.marsh > 0.28 ? "swampy bank" : "dry forest floor",
        },
        vegetation: {
            trees, shrubs, grasses, lichens, herbs, flowers,
            density, cover: clamp01(density * 0.7 + moss * 0.14 + scores.clearing * 0.1),
            light, moss, heather, berries, deadwood, roots, cleared,
            ages: ageClasses, ageClass, ageVariation,
            conifer: coniferTrees.length > 0, birch: birchTrees.length > 0,
            bloom, noTallTrees: false,
            treeChance: trees.length ? (forest ? 0.5 : 0.2) : 0,
        },
        fauna, goods,
        materials: { stone: scores.rocky, peat: scores.peat, wood: clamp01(density + (birchTrees.length ? 0.08 : 0)) },
        economy: {
            forestry, hunting, fishing, furTrade, agriculture, growingSeasonDays, winterDays,
            summerIntensity, snowfall, frost, buildingMaterials, fuelDemand, winterPreparedness,
            winterMobility, supplyCost, remoteSupply, settlementSpacing, waterwayTrade,
            seasonalTransport, storage, gathering: clamp01(berries * 0.7 + moss * 0.18),
            livestock: clamp01(0.14 + (formation.id === "forest-clearing" ? 0.16 : 0) + (use.grazed ? 0.18 : 0) - cold * 0.08),
            huntingSeason: clamp01((season === "autumn" ? 0.78 : season === "winter" ? 0.66 : season === "summer" ? 0.24 : 0.42)
                + (fauna.some(entry => entry.herd) ? 0.14 : 0)),
            migrationEconomy: clamp01((season === "spring" || season === "autumn" ? 0.68 : 0.24)
                + (fauna.some(entry => entry.migratory) ? 0.2 : 0)),
        },
        hazards: {
            cold, hypothermia: clamp01(cold * 0.78 + scores.wetness * 0.1), frost, frostbite: clamp01(frost * 0.64 + wind * 0.12),
            snowDepthCm, snowfall, fireRisk, insects, mosquitoes: insects,
            snowbreakRisk, windthrowRisk, predators, floodRisk,
            winterMobility, seasonalTransport,
        },
        use,
        visual: {
            sunlight, wind, windSway, snowCover, frost, ice, phase,
            groundHex: hexColour(ground), mossHex, lichenHex, grassHex: grassColour,
            leafHex: leafColour, waterHex, snowHex: "#e9eff2", rockHex: "#777c75",
            flowerHex: flowers[0]?.colours?.[0] || "#c7b87f",
            fireHex: "#4f4032", peatHex: "#5f5240",
            noonLight: clamp01(0.32 + sunlight * 0.48 - snowCover * 0.14),
            haze: clamp01(snowfall * 0.16 + (weather === "fog" ? 0.18 : 0)),
        },
        grassHex: grassColour, groundHex: hexColour(ground), leafColour,
        trees, treeChance: trees.length ? (forest ? 0.5 : 0.2) : 0,
        sward: { height: formation.id === "forest-clearing" ? "tall" : "short", density: clamp01(0.24 + moss * 0.4 + scores.clearing * 0.2) },
        seasonalMovement: fauna.some(entry => entry.migratory)
            ? "reindeer herds move between winter lichen grounds and summer wetlands"
            : "wildlife follows the snow-free ground and open water",
        seasonalNote: `${formation.label} · ${Math.round(snowCover * 100)}% snow · ${Math.round(scores.wetness * 100)}% wet · ${trees.length ? trees.length + " tree forms" : "open ground"}`,
    };
}

export function taigaGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "birch-sap") return season === "spring";
        if (good.id === "cloudberry") return season === "summer" || season === "autumn";
        if (good.id === "lake-fish") return season !== "winter";
        if (good.id === "mushrooms" || good.id === "chanterelle") return season !== "winter";
        if (good.id === "blueberries") return season === "summer" || season === "autumn";
        if (good.id === "lingonberries") return season === "autumn" || season === "winter" || season === "spring";
        return true;
    });
}

export function taigaProductsAt(x, y, context = {}) {
    const profile = taigaProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.02) return null;
    const goods = taigaGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function taigaSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const water = profile.water.ice ? " · frozen water"
        : profile.water.lake > 0.26 ? " · forest lake"
            : profile.water.river > 0.3 ? " · running water"
                : profile.water.marsh > 0.28 ? " · swampy bank" : " · dry forest floor";
    return `${profile.label} · ${profile.economy.forestry > 0.5 ? "forestry" : "woodland"} · ${goods} · ${wildlife}${water}`;
}

export function taigaRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const TAIGA_LIMITS = Object.freeze({
    requirements: TAIGA_REQUIREMENTS.length,
    maxFauna: 9,
    maxFlowers: 3,
    maxGoods: 10,
    formations: Object.keys(TAIGA_FORMATIONS).length,
    trees: Object.keys(TAIGA_TREES).length,
    shrubs: Object.keys(TAIGA_SHRUBS).length,
});
