// Volcanic landscapes (spec 1.2.13.1–1.2.13.73).
//
// A volcano is not a grey mountain with an orange crack. The same tile can be a
// fresh clinker field, a steaming fumarole, a weathered shield flank or a
// crater rim with rare minerals. This module derives one bounded, deterministic
// profile per tile from the shared seed, terrain, season and player works. The
// renderer, survey, gathering ledger, movement costs, hazards and the volcanic
// works all read this single profile; there is no second volcanic simulation.
import { seasonalState } from "./season.js";

const req = (id, key, label, group) => ({ id: "1.2.13." + id, key, label, group });

export const VOLCANO_REQUIREMENTS = Object.freeze([
    req(1, "single-cone", "Single volcanic cones", "landform"),
    req(2, "large-crater", "Large volcanic craters", "landform"),
    req(3, "crater-field", "Several craters inside a volcanic field", "landform"),
    req(4, "shield-volcano", "Shield volcanoes", "landform"),
    req(5, "steep-cone", "Steep volcanic cones", "landform"),
    req(6, "caldera", "Collapsed craters and calderas", "landform"),
    req(7, "fissures", "Lava fissures", "landform"),
    req(8, "volcanic-chain", "Volcanic mountain chains", "landform"),
    req(9, "extinct-volcano", "Extinct volcanoes with weathered forms", "landform"),
    req(10, "fresh-lava", "Fresh dark lava fields", "landform"),
    req(11, "old-lava", "Old weathered lava surfaces", "landform"),
    req(12, "lava-flow", "Solidified lava flows", "landform"),
    req(13, "basalt", "Basalt formations", "rock"),
    req(14, "pumice", "Pumice fields", "rock"),
    req(15, "obsidian", "Obsidian occurrences", "rock"),
    req(16, "spires", "Volcanic rock spires", "rock"),
    req(17, "broken-rock", "Broken and fissured rock surfaces", "rock"),
    req(18, "lava-colours", "Different lava colours and textures", "rock"),
    req(19, "smoking-craters", "Smoking craters", "climate"),
    req(20, "steam-vents", "Steam vents", "climate"),
    req(21, "glowing-lava", "Glowing lava in active areas", "climate"),
    req(22, "lava-streams", "Small lava streams", "climate"),
    req(23, "ash-emissions", "Ash emissions", "climate"),
    req(24, "sulfur-deposits", "Sulfur deposits", "rock"),
    req(25, "hot-rock", "Hot rock surfaces", "climate"),
    req(26, "earthquakes-cracks", "Earthquakes and ground cracks", "hazard"),
    req(27, "hot-springs", "Hot springs", "water"),
    req(28, "geysers", "Geysers", "water"),
    req(29, "fumaroles", "Fumaroles", "water"),
    req(30, "sulfur-springs", "Sulfur springs", "water"),
    req(31, "mineral-deposits", "Mineral deposits", "rock"),
    req(32, "mud-pools", "Volcanic mud pools", "water"),
    req(33, "heated-water", "Geothermally heated water", "water"),
    req(34, "steaming-ground", "Steaming ground", "climate"),
    req(35, "barren-young-lava", "Sparsely vegetated young lava", "vegetation"),
    req(36, "lichens-mosses", "First lichens and mosses", "vegetation"),
    req(37, "pioneer-plants", "Pioneer plants", "vegetation"),
    req(38, "volcanic-grasses", "Grasses on weathered volcanic soil", "vegetation"),
    req(39, "old-shrubs", "Shrub vegetation on older surfaces", "vegetation"),
    req(40, "fertile-soil", "Fertile soils in suitable volcanic regions", "vegetation"),
    req(41, "regeneration-stages", "Different regeneration stages", "vegetation"),
    req(42, "heat-drought-plants", "Heat and drought adapted plants", "vegetation"),
    req(43, "reptiles", "Small reptiles in warm regions", "fauna"),
    req(44, "birds", "Birds at suitable rock and crater sites", "fauna"),
    req(45, "insects", "Insects and pioneer species", "fauna"),
    req(46, "mammals", "Mammals on older vegetated volcanic ground", "fauna"),
    req(47, "cave-dwellers", "Cave and crevice dwellers", "fauna"),
    req(48, "specialised-fauna", "Specialised animals in hot mineral-rich areas", "fauna"),
    req(49, "basalt-material", "Basalt and other volcanic stone", "economy"),
    req(50, "obsidian-material", "Obsidian", "economy"),
    req(51, "pumice-material", "Pumice", "economy"),
    req(52, "sulfur", "Sulfur", "economy"),
    req(53, "metal-ores", "Metal ores", "economy"),
    req(54, "minerals", "Mineral deposits", "economy"),
    req(55, "geothermal-energy", "Geothermal energy", "economy"),
    req(56, "fertile-volcanic-soil", "Fertile volcanic soils", "economy"),
    req(57, "rare-crater-materials", "Rare materials in crater regions", "economy"),
    req(58, "eruptions", "Volcanic eruptions", "hazard"),
    req(59, "lava-flows", "Lava flows", "hazard"),
    req(60, "ashfall", "Ashfall", "hazard"),
    req(61, "toxic-gases", "Toxic volcanic gases", "hazard"),
    req(62, "earthquakes", "Earthquakes", "hazard"),
    req(63, "unstable-springs", "Hot springs and unstable ground", "hazard"),
    req(64, "rockfall", "Rockfall", "hazard"),
    req(65, "uninhabitable", "Long-term uninhabitable areas", "hazard"),
    req(66, "destruction", "Destruction of settlements and infrastructure", "hazard"),
    req(67, "recolonisation", "Colonisation and growth on old lava", "succession"),
    req(68, "soil-formation", "Slow soil formation", "succession"),
    req(69, "new-watercourses", "Formation of new watercourses", "succession"),
    req(70, "crater-change", "Change of the crater landscape", "succession"),
    req(71, "regeneration", "Vegetation regeneration after eruptions", "succession"),
    req(72, "new-minerals", "Formation of new mineral resources", "succession"),
    req(73, "long-term-usability", "Long-term changes in land usability", "succession"),
]);

export const VOLCANO_REQUIREMENT_IDS = Object.freeze(VOLCANO_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(VOLCANO_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const VOLCANO_FORMATIONS = Object.freeze({
    "single-cone": Object.freeze({
        id: "single-cone", label: "Single volcanic cone", zone: "cone",
        note: "a lone ash cone with a dark breach, cooling lava tongues and a ring of pioneer plants",
        trees: [], shrubs: ["bramble", "broom"], grasses: ["pioneer-grass", "hairgrass"],
        flowers: ["fireweed", "lava-coltsfoot"], mosses: ["lava-lichen", "crustose-lichen"],
    }),
    "large-crater": Object.freeze({
        id: "large-crater", label: "Large volcanic crater", zone: "crater",
        note: "a broad rim above a deep crater floor, with ash, sulfur and a permanent steam plume",
        trees: [], shrubs: ["broom"], grasses: ["hairgrass"],
        flowers: ["pumice-aster"], mosses: ["crustose-lichen", "lava-lichen"],
    }),
    "crater-field": Object.freeze({
        id: "crater-field", label: "Volcanic crater field", zone: "field",
        note: "several small craters and spatter cones scattered across a dark lava plateau",
        trees: [], shrubs: ["bramble"], grasses: ["pioneer-grass"],
        flowers: ["fireweed"], mosses: ["lava-lichen"],
    }),
    "shield-volcano": Object.freeze({
        id: "shield-volcano", label: "Broad shield volcano", zone: "shield",
        note: "a low, wide shield of overlapping lava flows, cut by long fissures and scattered spatter cones",
        trees: ["volcanic-pine", "ohia"], shrubs: ["manzanita", "bramble"],
        grasses: ["fescue", "tussock"], flowers: ["fireweed", "pumice-aster"], mosses: ["moss", "lava-lichen"],
    }),
    "steep-cone": Object.freeze({
        id: "steep-cone", label: "Steep ash cone", zone: "cone",
        note: "a high, unstable cone of loose ash and scoria; the flanks fail in rockfalls after every eruption",
        trees: [], shrubs: ["broom"], grasses: ["hairgrass", "fescue"],
        flowers: ["lava-coltsfoot"], mosses: ["crustose-lichen"],
    }),
    caldera: Object.freeze({
        id: "caldera", label: "Collapsed caldera", zone: "caldera",
        note: "a wide collapsed basin ringed by cliffs, with a steaming lake, hot springs and fresh domes",
        trees: ["ohia"], shrubs: ["manzanita"], grasses: ["tussock", "fescue"],
        flowers: ["fireweed"], mosses: ["moss", "lava-lichen"],
    }),
    "fissure-field": Object.freeze({
        id: "fissure-field", label: "Lava fissure field", zone: "fissure",
        note: "long open cracks in the crust, some cold and mossy, others glowing and fuming",
        trees: [], shrubs: ["bramble"], grasses: ["pioneer-grass"],
        flowers: ["fireweed"], mosses: ["lava-lichen", "crustose-lichen"],
    }),
    "volcanic-chain": Object.freeze({
        id: "volcanic-chain", label: "Volcanic mountain chain", zone: "chain",
        note: "a line of cones and lava shoulders rising one behind another along a deep fracture",
        trees: ["volcanic-pine", "birch"], shrubs: ["manzanita", "juniper"],
        grasses: ["fescue", "hairgrass"], flowers: ["pumice-aster", "sulfur-cinquefoil"],
        mosses: ["moss", "reindeer-lichen"],
    }),
    "extinct-volcano": Object.freeze({
        id: "extinct-volcano", label: "Extinct weathered volcano", zone: "extinct",
        note: "an old volcano worn down to soft ridges, its crater breached and its flanks held by mature forest",
        trees: ["ohia", "birch", "volcanic-pine"], shrubs: ["manzanita", "juniper", "bramble"],
        grasses: ["fescue", "tussock"], flowers: ["fireweed", "pumice-aster"],
        mosses: ["moss", "reindeer-lichen", "lava-lichen"],
    }),
    "lava-field": Object.freeze({
        id: "lava-field", label: "Lava field", zone: "field",
        note: "a low plain of broken lava slabs, pressure ridges and shallow hollows filled with ash",
        trees: [], shrubs: ["bramble"], grasses: ["pioneer-grass", "hairgrass"],
        flowers: ["lava-coltsfoot"], mosses: ["lava-lichen", "crustose-lichen"],
    }),
});

// Only truly volcanic goods live here. Stone, iron, copper, gemstones, game and
// timber already exist in the shared catalogue and keep the same ledger.
export const VOLCANO_GOODS = Object.freeze({
    basalt: Object.freeze({ id: "basalt", label: "Basalt blocks", category: "material" }),
    obsidian: Object.freeze({ id: "obsidian", label: "Obsidian", category: "luxury" }),
    pumice: Object.freeze({ id: "pumice", label: "Pumice", category: "material" }),
    sulfur: Object.freeze({ id: "sulfur", label: "Sulfur", category: "material" }),
    "volcanic-minerals": Object.freeze({ id: "volcanic-minerals", label: "Volcanic minerals", category: "material" }),
    "volcanic-soil": Object.freeze({ id: "volcanic-soil", label: "Fertile volcanic soil", category: "material" }),
    "crater-crystal": Object.freeze({ id: "crater-crystal", label: "Crater crystals", category: "luxury" }),
    "geothermal-energy": Object.freeze({ id: "geothermal-energy", label: "Geothermal energy", category: "material" }),
    "hot-spring-water": Object.freeze({ id: "hot-spring-water", label: "Hot spring water", category: "medicine" }),
    "ohia-timber": Object.freeze({ id: "ohia-timber", label: "Ohia timber", category: "wood" }),
});

export const VOLCANO_TREES = Object.freeze({
    ohia: Object.freeze({ id: "ohia", label: "Ohia", kind: "broadleaf", heightMeters: 16, crown: 0.7, colours: { spring: "#63764c", summer: "#4e6b44", autumn: "#77734c", winter: "#555f4d" }, goods: ["firewood", "ohia-timber"] }),
    "volcanic-pine": Object.freeze({ id: "volcanic-pine", label: "Volcanic pine", kind: "conifer", heightMeters: 19, crown: 0.62, colours: { spring: "#4f6546", summer: "#3d5b43", autumn: "#46583f", winter: "#475440" }, goods: ["pine-timber", "resin", "firewood"] }),
    birch: Object.freeze({ id: "birch", label: "Volcanic birch", kind: "broadleaf", heightMeters: 12, crown: 0.6, colours: { spring: "#899b63", summer: "#658152", autumn: "#b49a48", winter: "#7f7b68" }, goods: ["birch-timber", "firewood", "birch-sap"] }),
    juniper: Object.freeze({ id: "juniper", label: "Volcanic juniper", kind: "conifer", heightMeters: 7, crown: 0.54, colours: { spring: "#52674b", summer: "#435a43", autumn: "#4c5d43", winter: "#4a5645" }, goods: ["juniper-berries", "firewood"] }),
});

export const VOLCANO_SHRUBS = Object.freeze({
    bramble: Object.freeze({ id: "bramble", label: "Lava bramble", colours: ["#5d6745", "#7f7d57"], goods: ["berries"] }),
    broom: Object.freeze({ id: "broom", label: "Broom", colours: ["#6b7246", "#a49a55"], goods: ["broom-fibre"] }),
    manzanita: Object.freeze({ id: "manzanita", label: "Manzanita", colours: ["#586a4c", "#8b795b"], goods: ["berries", "firewood"] }),
    juniper: Object.freeze({ id: "juniper", label: "Dwarf juniper", colours: ["#4d6449", "#6d7858"], goods: ["juniper-berries", "firewood"] }),
});

export const VOLCANO_GRASSES = Object.freeze({
    "pioneer-grass": Object.freeze({ id: "pioneer-grass", label: "Pioneer grass", colours: ["#777d57", "#9b9a6b"], goods: ["hay"] }),
    hairgrass: Object.freeze({ id: "hairgrass", label: "Tufted hairgrass", colours: ["#697b52", "#969a68"], goods: ["hay"] }),
    fescue: Object.freeze({ id: "fescue", label: "Volcanic fescue", colours: ["#7c8456", "#a4a075"], goods: ["hay"] }),
    tussock: Object.freeze({ id: "tussock", label: "Tussock grass", colours: ["#66754c", "#939468"], goods: ["hay"] }),
});

export const VOLCANO_FLOWERS = Object.freeze({
    fireweed: Object.freeze({ id: "fireweed", label: "Fireweed", seasons: ["summer", "autumn"], colours: ["#b35b84", "#d486a7"], goods: [] }),
    "lava-coltsfoot": Object.freeze({ id: "lava-coltsfoot", label: "Lava coltsfoot", seasons: ["spring", "summer"], colours: ["#d2c276", "#efe4ad"], goods: ["volcanic-soil"] }),
    "pumice-aster": Object.freeze({ id: "pumice-aster", label: "Pumice aster", seasons: ["summer", "autumn"], colours: ["#8b83b7", "#b6aed6"], goods: [] }),
    "sulfur-cinquefoil": Object.freeze({ id: "sulfur-cinquefoil", label: "Sulfur cinquefoil", seasons: ["spring", "summer"], colours: ["#c9b84e", "#e4d981"], rare: true, goods: ["volcanic-minerals"] }),
});

export const VOLCANO_MOSSES = Object.freeze({
    "lava-lichen": Object.freeze({ id: "lava-lichen", label: "Lava lichen", colours: ["#7d8461", "#b3b58f"], goods: ["lichen"] }),
    "crustose-lichen": Object.freeze({ id: "crustose-lichen", label: "Crustose lichen", colours: ["#737d66", "#9ba588"], goods: ["lichen"] }),
    moss: Object.freeze({ id: "moss", label: "Pioneer moss", colours: ["#5d7651", "#8b9a6c"], goods: ["volcanic-soil"] }),
    "reindeer-lichen": Object.freeze({ id: "reindeer-lichen", label: "Reindeer lichen", colours: ["#8b8f73", "#b7b79a"], goods: ["lichen"] }),
});

export const VOLCANO_FAUNA = Object.freeze({
    "lava-lizard": Object.freeze({ id: "lava-lizard", label: "Lava lizard", group: "reptile", kind: "lizard", seasons: ["spring", "summer", "autumn"] }),
    gecko: Object.freeze({ id: "gecko", label: "Rock gecko", group: "reptile", kind: "gecko", seasons: ["spring", "summer", "autumn"] }),
    kestrel: Object.freeze({ id: "kestrel", label: "Kestrel", group: "bird", kind: "kestrel", seasons: ["spring", "summer", "autumn", "winter"] }),
    raven: Object.freeze({ id: "raven", label: "Raven", group: "bird", kind: "raven", seasons: ["spring", "summer", "autumn", "winter"] }),
    finch: Object.freeze({ id: "finch", label: "Volcanic finch", group: "bird", kind: "finch", seasons: ["spring", "summer", "autumn"] }),
    beetle: Object.freeze({ id: "beetle", label: "Pioneer beetle", group: "insect", kind: "beetle", seasons: ["spring", "summer"] }),
    "solitary-bee": Object.freeze({ id: "solitary-bee", label: "Solitary bee", group: "insect", kind: "bee", seasons: ["spring", "summer"] }),
    bat: Object.freeze({ id: "bat", label: "Lava-tube bat", group: "cave", kind: "bat", seasons: ["spring", "summer", "autumn"] }),
    mouse: Object.freeze({ id: "mouse", label: "Volcanic mouse", group: "mammal", kind: "mouse", seasons: ["spring", "summer", "autumn", "winter"] }),
    fox: Object.freeze({ id: "fox", label: "Volcanic fox", group: "mammal", kind: "fox", seasons: ["spring", "summer", "autumn", "winter"] }),
    "feral-goat": Object.freeze({ id: "feral-goat", label: "Feral goat", group: "mammal", kind: "goat", seasons: ["spring", "summer", "autumn", "winter"] }),
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
        lavaQuarry: Boolean(explicit.lavaQuarry || explicit.basaltQuarry || state === "lava-quarry"),
        obsidianQuarry: Boolean(explicit.obsidianQuarry || state === "obsidian-quarry"),
        pumiceQuarry: Boolean(explicit.pumiceQuarry || state === "pumice-quarry"),
        sulfurMine: Boolean(explicit.sulfurMine || state === "sulfur-mine"),
        metalMine: Boolean(explicit.metalMine || state === "metal-mine"),
        mineralWorks: Boolean(explicit.mineralWorks || state === "mineral-works"),
        geothermalPlant: Boolean(explicit.geothermalPlant || state === "geothermal"),
        fertileTerrace: Boolean(explicit.fertileTerrace || explicit.terrace || state === "terraced"),
        craterExpedition: Boolean(explicit.craterExpedition || state === "crater-expedition"),
        observatory: Boolean(explicit.observatory || state === "observatory"),
        road: Boolean(explicit.road || state === "road"),
        bridge: Boolean(explicit.bridge || state === "bridged"),
        settlement: Boolean(explicit.settlement || explicit.village || state === "village"),
        refuge: Boolean(explicit.refuge || state === "refuge"),
        logged: Boolean(explicit.logged || state === "logged"),
        grazed: Boolean(explicit.grazed || state === "grazed"),
        burnt: Boolean(explicit.burnt || explicit.burned || state === "burnt"),
        intensity: clamp01(explicit.intensity ?? 0.12),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (state === "wild" ? "unmanaged volcanic land" : state.replace(/-/g, " ")),
    };
}

function mixColour(from, to, amount) {
    const t = clamp01(amount);
    return [0, 1, 2].map(index => Math.round(from[index] + (to[index] - from[index]) * t));
}

function hexColour(rgb) {
    return "#" + rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

function chooseFormation(scores) {
    if (scores.extinct > 0.82) return "extinct-volcano";
    if (scores.caldera > 0.86) return "caldera";
    if (scores.chain > 0.76) return "volcanic-chain";
    if (scores.fissure > 0.8) return "fissure-field";
    if (scores.field > 0.79) return "crater-field";
    if (scores.steep > 0.7) return "steep-cone";
    if (scores.crater > 0.62) return "large-crater";
    if (scores.shield > 0.56) return "shield-volcano";
    if (scores.cone > 0.42) return "single-cone";
    return "lava-field";
}

function vegetationStage(soilAge, fresh, active) {
    if (active || fresh > 0.55 || soilAge < 0.12) return "bare";
    if (soilAge < 0.24) return "lichen";
    if (soilAge < 0.38) return "pioneer";
    if (soilAge < 0.54) return "grass";
    if (soilAge < 0.7) return "shrub";
    if (soilAge < 0.86) return "young-forest";
    return "mature-forest";
}

const STAGE_RANK = Object.freeze({
    bare: 0, lichen: 1, pioneer: 2, grass: 3, shrub: 4, "young-forest": 5, "mature-forest": 6,
});

function buildTrees(seed, x, y, formation, season, stage) {
    if (!formation.trees.length || STAGE_RANK[stage] < 4) return [];
    const rank = STAGE_RANK[stage];
    const chance = rank >= 6 ? 0.7 : rank === 5 ? 0.34 : 0.12;
    const roll = unit(seed, x, y, 0x54524545);
    if (roll > chance) return [];
    const count = roll < chance * 0.22 ? 2 : 1;
    const trees = [];
    for (let index = 0; index < count; index++) {
        const tree = VOLCANO_TREES[pick(seed, x + index, y, formation.trees, 0x54524533 + index)];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x54524534) - 0.5) * 0.52,
            offsetY: (unit(seed, x, y + index, 0x54524535) - 0.5) * 0.28,
            scale: 0.66 + unit(seed, x, y + index, 0x54524536) * 0.42,
            seasonColour: tree.colours[season] || tree.colours.summer,
            windBent: formation.id === "volcanic-chain" || formation.id === "steep-cone",
            volcanic: true,
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, stage, rock, hot, water, cave, minerals, vegetation } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = VOLCANO_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(10, Math.round(count))) });
    };
    if (hot > 0.18 && unit(seed, x, y, 0x4c495a41) > 0.36) add("lava-lizard", 2);
    if (rock > 0.28 && unit(seed, x, y, 0x47454348) > 0.5) add("gecko");
    if (rock > 0.26 && unit(seed, x, y, 0x4b455354) > 0.48) add("kestrel");
    if (rock > 0.18 && unit(seed, x, y, 0x52415645) > 0.55) add("raven");
    if (vegetation > 0.16 && unit(seed, x, y, 0x46494e43) > 0.55) add("finch", 2);
    if (STAGE_RANK[stage] >= 2 && unit(seed, x, y, 0x42454554) > 0.42) add("beetle", 3);
    if (vegetation > 0.22 && unit(seed, x, y, 0x42454532) > 0.62) add("solitary-bee", 2);
    if (cave && unit(seed, x, y, 0x42415431) > 0.4) add("bat", 3);
    if (STAGE_RANK[stage] >= 3 && unit(seed, x, y, 0x4d4f5553) > 0.52) add("mouse", 2);
    if (STAGE_RANK[stage] >= 4 && unit(seed, x, y, 0x464f5832) > 0.68) add("fox");
    if (STAGE_RANK[stage] >= 3 && unit(seed, x, y, 0x474f4154) > 0.72) add("feral-goat", 2);
    if ((minerals > 0.55 || water > 0.3) && unit(seed, x, y, 0x53504543) > 0.74) add("raven");
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { season, stage, rock, basalt, pumice, obsidian, sulfur, ore, minerals, geothermal, fertile, rare, trees, herbs, water, fauna } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.05 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    if (rock > 0.16) add("stone", "Stone", "material", rock * 0.6);
    if (basalt > 0.2) add("basalt", "Basalt blocks", "material", basalt * 0.78);
    if (pumice > 0.28) add("pumice", "Pumice", "material", pumice * 0.7);
    if (obsidian > 0.4) add("obsidian", "Obsidian", "luxury", obsidian * 0.52);
    if (sulfur > 0.32) add("sulfur", "Sulfur", "material", sulfur * 0.7);
    if (ore > 0.32) add("iron-ore", "Iron ore", "material", ore * 0.6);
    if (ore > 0.42) add("copper-ore", "Copper ore", "material", ore * 0.42);
    if (minerals > 0.36) add("volcanic-minerals", "Volcanic minerals", "material", minerals * 0.62);
    if (rare > 0.48) add("crater-crystal", "Crater crystals", "luxury", rare * 0.5);
    if (geothermal > 0.4) add("geothermal-energy", "Geothermal energy", "material", geothermal * 0.54);
    if (fertile > 0.34 && STAGE_RANK[stage] >= 3 && season !== "winter") add("volcanic-soil", "Fertile volcanic soil", "material", fertile * 0.46);
    if (trees.length) add("firewood", "Firewood", "wood", 0.28 + trees.length * 0.08);
    if (herbs.length && season !== "winter") add("volcanic-minerals", "Volcanic minerals", "material", 0.28 + herbs.length * 0.05);
    if (water > 0.26) add("hot-spring-water", "Hot spring water", "medicine", 0.3 + water * 0.3);
    if (fauna.length > 2) add("game", "Wild game", "hunt", 0.18 + fauna.length * 0.055);
    if (fauna.some(entry => entry.group === "mammal") && stage !== "bare") add("fur", "Furs", "hunt", 0.16 + fauna.length * 0.025);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

/** How strongly a tile belongs to the volcanic climate. */
export function volcanoPotentialAt(x, y, context = {}) {
    const climate = context.climate || "temperate";
    if (climate !== "volcanic") return 0;
    const height = clamp01(context.height ?? 0.58);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height <= seaLevel + 0.002) return 0;
    return clamp01(0.78 + unit(Number(context.seed) || 1, x, y, 0x564f4c43) * 0.22);
}

export function isVolcanoSite(x, y, context = {}) {
    return volcanoPotentialAt(x, y, context) > 0.24;
}

/** Complete, pure volcanic profile for one tile. */
export function volcanoProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const height = clamp01(context.height ?? 0.62);
    const seaLevel = number(context.seaLevel, 0.33);
    const moisture = clamp01(context.moisture ?? 0.42);
    const temperature = clamp01(context.temperature ?? 0.7);
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, "volcanic");
    const use = normalizeUse(context.use);
    const aboveSea = Math.max(0, height - seaLevel);
    const relative = clamp01(aboveSea / 0.42);
    // Coarse fields make volcanoes regional forms rather than per-tile noise.
    const coneRoll = coarse(seed, x, y, 7, 0x434f4e45);
    const craterRoll = coarse(seed, x, y, 6, 0x43524154);
    const fieldRoll = coarse(seed, x, y, 11, 0x4649454c);
    const chainRoll = coarse(seed, x, y, 9, 0x43484149);
    const fissureRoll = coarse(seed, x, y, 8, 0x46495353);
    const shieldRoll = coarse(seed, x, y, 10, 0x53484945);
    const extinctRoll = coarse(seed, x, y, 13, 0x45585449);
    const calderaRoll = coarse(seed, x, y, 12, 0x43414c44);
    const rockRoll = coarse(seed, x, y, 5, 0x524f434b);
    const textureRoll = coarse(seed, x, y, 4, 0x54455854);
    const flowRoll = coarse(seed, x, y, 5, 0x464c4f57);
    const waterRoll = coarse(seed, x, y, 4, 0x57415452);
    const caveRoll = coarse(seed, x, y, 6, 0x43415645);
    const mineralRoll = coarse(seed, x, y, 6, 0x4d494e45);
    const oreRoll = coarse(seed, x, y, 5, 0x4f5245);
    const ageRoll = coarse(seed, x, y, 9, 0x414745);
    const cycleRoll = unit(seed, x, y, 0x4359434c);
    const stageRoll = unit(seed, x, y, 0x53544147);

    // Eruption cycles are derived from the seed and year, so a tile has a
    // changing hazard and regeneration stage without a second tick loop.
    const cycleYears = 5 + Math.floor(cycleRoll * 15);
    const cycleOffset = Math.floor(unit(seed, x, y, 0x4f464653) * cycleYears);
    const cycleDay = ((Math.floor(year) + cycleOffset) % cycleYears + cycleYears) % cycleYears;
    const cyclePhase = cycleDay / cycleYears;
    const eruption = clamp01(smoothstep(0.13, 0.005, cyclePhase) * (0.55 + ageRoll * 0.45));
    const yearsSinceEruption = Math.floor(cyclePhase * cycleYears);
    const active = eruption > 0.38;
    const youngLava = clamp01(eruption * 0.72 + smoothstep(0.72, 0.22, cyclePhase) * 0.28);
    const soilAge = clamp01(cyclePhase * 0.86 + ageRoll * 0.22 + (extinctRoll > 0.82 ? 0.18 : 0));
    const slope = clamp01(0.16 + relative * 0.34 + coneRoll * 0.28 + (calderaRoll > 0.86 ? 0.2 : 0));
    const cone = clamp01(smoothstep(0.28, 0.92, relative) * (0.48 + coneRoll * 0.52));
    const crater = clamp01(smoothstep(0.62, 0.95, relative) * (0.34 + craterRoll * 0.66) + (fieldRoll > 0.79 ? 0.14 : 0));
    const caldera = clamp01((calderaRoll > 0.86 ? 0.72 + relative * 0.2 : 0) + (extinctRoll > 0.92 ? 0.12 : 0));
    const fissure = clamp01(fissureRoll * 0.82 + (relative < 0.42 ? 0.16 : 0) - Math.abs(0.5 - flowRoll) * 0.4);
    const chain = clamp01(chainRoll * 0.86 + (relative > 0.34 ? 0.12 : 0));
    const shield = clamp01(shieldRoll * 0.82 + (1 - slope) * 0.18);
    const extinct = clamp01(extinctRoll * 0.92 + (soilAge > 0.68 ? 0.1 : 0));
    const formationId = chooseFormation({
        extinct,
        caldera,
        chain,
        fissure,
        field: fieldRoll,
        steep: relative * 0.46 + slope * 0.5,
        crater,
        shield,
        cone,
    });
    const formation = VOLCANO_FORMATIONS[formationId];
    const isCrater = formationId === "large-crater" || formationId === "caldera" || formationId === "crater-field";
    const isCone = formationId === "single-cone" || formationId === "steep-cone" || formationId === "shield-volcano";
    const lavaFlow = clamp01((isCone ? cone * 0.38 : 0.12) + flowRoll * 0.46 + eruption * 0.4);
    const lavaAge = clamp01(youngLava > 0.55 ? 0.08 + flowRoll * 0.16 : soilAge * 0.9 + 0.08);
    const freshLava = clamp01(youngLava * 0.86 + (eruption > 0.35 ? 0.28 : 0) + (formationId === "lava-field" ? 0.12 : 0));
    const oldLava = clamp01(soilAge * 0.8 + (formationId === "extinct-volcano" ? 0.22 : 0));
    const lavaColour = textureRoll < 0.24 ? "black" : textureRoll < 0.46 ? "rust" : textureRoll < 0.68 ? "grey" : textureRoll < 0.86 ? "ochre" : "violet";
    const basalt = clamp01(smoothstep(0.32, 0.78, relative) * 0.7 + (rockRoll > 0.62 ? 0.24 : 0) + (1 - pumiceLike(textureRoll)) * 0.12);
    const pumice = clamp01((textureRoll > 0.68 ? 0.58 : 0.12) + freshLava * 0.3 + (formationId === "steep-cone" ? 0.2 : 0));
    const obsidian = clamp01((textureRoll > 0.82 ? 0.54 : 0.04) + (formationId === "fissure-field" ? 0.2 : 0) + (rockRoll > 0.74 ? 0.16 : 0));
    const brokenRock = clamp01(slope * 0.5 + freshLava * 0.2 + (fissure > 0.45 ? 0.18 : 0));
    const spires = clamp01(smoothstep(0.55, 0.9, relative) * (rockRoll > 0.7 ? 0.8 : 0.18) + (formationId === "steep-cone" ? 0.18 : 0));
    const cave = caveRoll > 0.82;
    const crevice = clamp01(fissure * 0.55 + brokenRock * 0.25);
    const hotRock = clamp01((isCrater ? 0.3 : 0.08) + eruption * 0.5 + freshLava * 0.22);
    const ash = clamp01(eruption * 0.7 + (weather === "storm" ? 0.16 : 0) + (isCrater ? 0.12 : 0));
    const smoke = clamp01((isCrater ? 0.52 : 0.06) + hotRock * 0.28 + (formationId === "fissure-field" ? 0.18 : 0));
    const steam = clamp01((isCrater ? 0.28 : 0.05) + waterRoll * 0.4 + (formationId === "caldera" ? 0.22 : 0));
    const fumarole = clamp01(steam * 0.5 + smoke * 0.35 + (fissure > 0.5 ? 0.12 : 0));
    const hotSpring = clamp01(waterRoll * 0.55 + (formationId === "caldera" || formationId === "large-crater" ? 0.25 : 0) + (1 - slope) * 0.14);
    const geyser = clamp01(hotSpring * 0.58 + waterRoll * 0.24 + (formationId === "caldera" ? 0.18 : 0));
    const sulfur = clamp01((isCrater ? 0.42 : 0.04) + smoke * 0.28 + (fumarole > 0.42 ? 0.18 : 0) + mineralRoll * 0.14);
    const sulfurSpring = clamp01(sulfur * 0.5 + hotSpring * 0.3 + (formationId === "crater-field" ? 0.12 : 0));
    const mudPool = clamp01(hotSpring * 0.42 + (1 - slope) * 0.18 + (formationId === "caldera" ? 0.16 : 0));
    const heatedWater = clamp01(hotSpring * 0.74 + geyser * 0.2 + mudPool * 0.12);
    const mineralDeposit = clamp01(mineralRoll * 0.7 + sulfur * 0.18 + (isCrater ? 0.16 : 0) + (eruption > 0.3 ? 0.1 : 0));
    const ore = clamp01(oreRoll * 0.68 + mineralDeposit * 0.18 + (formationId === "volcanic-chain" ? 0.18 : 0) + relative * 0.12);
    const rare = clamp01((isCrater ? 0.38 : 0.04) + mineralDeposit * 0.26 + (cave ? 0.14 : 0) + textureRoll * 0.16 + (active ? 0.08 : 0));
    const geothermal = clamp01(hotRock * 0.4 + hotSpring * 0.35 + geyser * 0.22 + fumarole * 0.2);
    const newChannel = clamp01((1 - slope) * 0.28 + waterRoll * 0.5 + (soilAge > 0.4 ? 0.12 : 0) + (youngLava > 0.3 ? 0.12 : 0));
    const fertile = clamp01(soilAge * 0.62 + moisture * 0.22 + (1 - relative) * 0.18 - ash * 0.18
        + (use.fertileTerrace ? 0.18 : 0));
    const stage = vegetationStage(soilAge, freshLava, active);
    const stageRank = STAGE_RANK[stage];

    const trees = buildTrees(seed, x, y, formation, season, stage);
    const shrubs = formation.shrubs.map(id => VOLCANO_SHRUBS[id]).filter(Boolean)
        .filter((entry, index) => stageRank >= 4 && unit(seed, x, y, 0x53485255 + index) > 0.28 + ash * 0.24);
    const grasses = formation.grasses.map(id => VOLCANO_GRASSES[id]).filter(Boolean)
        .filter((entry, index) => stageRank >= 2 && unit(seed, x, y, 0x47524153 + index) > 0.2 + ash * 0.28);
    const flowers = formation.flowers.map(id => VOLCANO_FLOWERS[id]).filter(Boolean)
        .filter(flower => flower.seasons.includes(season))
        .filter((entry, index) => stageRank >= 2 && unit(seed, x, y, 0x464c4f57 + index) > 0.32 + ash * 0.36);
    const mosses = formation.mosses.map(id => VOLCANO_MOSSES[id]).filter(Boolean)
        .filter((entry, index) => stageRank >= 1 && unit(seed, x, y, 0x4d4f5353 + index) > 0.24 + ash * 0.28);
    const herbs = mosses.length || flowers.some(flower => flower.rare)
        ? [{ id: "volcanic-minerals", label: "Volcanic minerals" }] : [];
    const vegetation = clamp01(trees.length * 0.16 + shrubs.length * 0.08 + grasses.length * 0.06 + mosses.length * 0.04 - ash * 0.18 - freshLava * 0.2);
    const water = clamp01(hotSpring * 0.58 + heatedWater * 0.22 + newChannel * 0.18 + moisture * 0.1);
    const forestCover = clamp01(trees.length * 0.2 + (stageRank >= 5 ? 0.2 : 0));
    const hazardRockfall = clamp01(slope * 0.5 + spires * 0.2 + brokenRock * 0.2 + (weather === "storm" ? 0.08 : 0));
    const earthquake = clamp01(fissure * 0.45 + eruption * 0.4 + relative * 0.14);
    const toxicGas = clamp01(smoke * 0.55 + crater * 0.28 + fumarole * 0.28 + sulfur * 0.14);
    const unstable = clamp01(crevice * 0.48 + slope * 0.2 + hotSpring * 0.2 + earthquake * 0.14);
    const uninhabitable = clamp01(freshLava * 0.7 + eruption * 0.3 + crater * 0.16 - soilAge * 0.12);
    const destruction = clamp01(eruption * 0.65 + lavaFlow * 0.2 + ash * 0.15);
    const movement = clamp01(0.94 - freshLava * 0.34 - ash * 0.14 - slope * 0.22 - unstable * 0.12
        + (use.road ? 0.22 : 0) + (use.bridge ? 0.12 : 0) + (use.fertileTerrace ? 0.05 : 0));
    const transport = clamp01(0.26 + freshLava * 0.32 + slope * 0.34 + ash * 0.16 - (use.road ? 0.2 : 0) - (use.bridge ? 0.1 : 0));
    const defence = clamp01(0.3 + slope * 0.28 + crater * 0.18 + (use.refuge ? 0.16 : 0) + (use.observatory ? 0.08 : 0));
    const settlement = clamp01((1 - freshLava) * 0.42 + (1 - slope) * 0.28 + (1 - ash) * 0.14 + soilAge * 0.18
        + (use.settlement ? 0.18 : 0) + (use.fertileTerrace ? 0.16 : 0) - crater * 0.12);
    const regeneration = clamp01(soilAge * 0.7 + vegetation * 0.3);
    const soilFormation = clamp01(soilAge * 0.8 + mosses.length * 0.06 + (1 - freshLava) * 0.14);
    const longTermUse = clamp01(regeneration * 0.45 + settlement * 0.24 + (1 - destruction) * 0.18 + (use.observatory ? 0.2 : 0));
    const fauna = buildFauna(seed, x, y, {
        season, stage, rock: basalt, hot: hotRock, water: heatedWater, cave,
        minerals: mineralDeposit, vegetation,
    });
    const goods = buildGoods(seed, x, y, {
        season, stage, rock: basalt, basalt, pumice, obsidian, sulfur, ore, minerals: mineralDeposit,
        geothermal, fertile, rare, trees, herbs, water: heatedWater, fauna,
    });

    const ground = mixColour(lavaColour === "rust" ? [77, 55, 47] : lavaColour === "ochre" ? [78, 66, 48]
        : lavaColour === "violet" ? [55, 48, 58] : [45, 45, 44], [102, 93, 79], clamp01(soilAge * 0.5 + ash * 0.18));
    const grassColour = mixColour([84, 91, 59], [130, 126, 80], clamp01(soilAge * 0.5 + moisture * 0.2));
    const rockColour = basalt > 0.5 ? "#4b4c4b" : obsidian > 0.42 ? "#29292f" : pumice > 0.44 ? "#aaa293" : "#625d54";
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.16) * 0.64);
    const shadow = clamp01((1 - sunlight) * 0.14 + crater * 0.18);
    const cloud = clamp01(smoke * 0.28 + ash * 0.34 + steam * 0.12 + (weather === "fog" ? 0.3 : 0));

    const features = new Set();
    const add = (id, present = true) => { if (present) features.add("1.2.13." + id); };
    add(1, formationId === "single-cone");
    add(2, formationId === "large-crater");
    add(3, formationId === "crater-field");
    add(4, formationId === "shield-volcano");
    add(5, formationId === "steep-cone");
    add(6, formationId === "caldera");
    add(7, formationId === "fissure-field" || fissure > 0.55);
    add(8, formationId === "volcanic-chain");
    add(9, formationId === "extinct-volcano");
    add(10, freshLava > 0.48 || formationId === "lava-field");
    add(11, oldLava > 0.55 && freshLava < 0.3);
    add(12, lavaFlow > 0.42 && freshLava < 0.55);
    add(13, basalt > 0.3);
    add(14, pumice > 0.35);
    add(15, obsidian > 0.4);
    add(16, spires > 0.36);
    add(17, brokenRock > 0.34);
    add(18, basalt > 0.18 && textureRoll > 0.2);
    add(19, crater > 0.38 && smoke > 0.3);
    add(20, steam > 0.28);
    add(21, hotRock > 0.3 && (freshLava > 0.2 || active));
    add(22, lavaFlow > 0.32 && (youngLava > 0.24 || active));
    add(23, ash > 0.3);
    add(24, sulfur > 0.32);
    add(25, hotRock > 0.26);
    add(26, earthquake > 0.32 || brokenRock > 0.48);
    add(27, hotSpring > 0.36);
    add(28, geyser > 0.45);
    add(29, fumarole > 0.38);
    add(30, sulfurSpring > 0.34);
    add(31, mineralDeposit > 0.35);
    add(32, mudPool > 0.4);
    add(33, heatedWater > 0.32);
    add(34, steam > 0.2 && hotRock > 0.14);
    add(35, freshLava > 0.2 || stage === "bare");
    add(36, stageRank >= 1);
    add(37, stageRank >= 2 && (grasses.length > 0 || flowers.length > 0));
    add(38, stageRank >= 3 && grasses.length > 0);
    add(39, stageRank >= 4 && shrubs.length > 0);
    add(40, fertile > 0.42 && stageRank >= 3);
    add(41, stageRank >= 1 && stageRank <= 5);
    add(42, flowers.some(flower => flower.id === "sulfur-cinquefoil" || flower.id === "lava-coltsfoot") || (stageRank >= 2 && temperature > 0.68));
    add(43, fauna.some(entry => entry.group === "reptile"));
    add(44, fauna.some(entry => entry.group === "bird"));
    add(45, fauna.some(entry => entry.group === "insect"));
    add(46, fauna.some(entry => entry.group === "mammal"));
    add(47, fauna.some(entry => entry.group === "cave"));
    add(48, fauna.some(entry => entry.id === "lava-lizard" || entry.id === "gecko") || (fauna.length > 3 && mineralDeposit > 0.4));
    add(49, goods.some(entry => entry.id === "stone" || entry.id === "basalt") || use.lavaQuarry);
    add(50, goods.some(entry => entry.id === "obsidian") || use.obsidianQuarry);
    add(51, goods.some(entry => entry.id === "pumice") || use.pumiceQuarry);
    add(52, goods.some(entry => entry.id === "sulfur") || use.sulfurMine);
    add(53, goods.some(entry => entry.id === "iron-ore" || entry.id === "copper-ore") || use.metalMine);
    add(54, goods.some(entry => entry.id === "volcanic-minerals") || use.mineralWorks);
    add(55, geothermal > 0.28 || use.geothermalPlant);
    add(56, fertile > 0.35 || use.fertileTerrace);
    add(57, rare > 0.4 || use.craterExpedition);
    add(58, active);
    add(59, lavaFlow > 0.3 && (active || youngLava > 0.3));
    add(60, ash > 0.36);
    add(61, toxicGas > 0.38);
    add(62, earthquake > 0.4);
    add(63, hotSpring > 0.34 || unstable > 0.42);
    add(64, hazardRockfall > 0.42);
    add(65, uninhabitable > 0.55 || destruction > 0.55);
    add(66, destruction > 0.5 && (use.settlement || use.road || use.settlement || use.fertileTerrace
        || use.lavaQuarry || use.obsidianQuarry || use.pumiceQuarry || use.sulfurMine || use.metalMine
        || use.mineralWorks || use.geothermalPlant || use.observatory));
    add(67, oldLava > 0.45 && stageRank >= 2);
    add(68, soilFormation > 0.35 && soilAge > 0.2);
    add(69, newChannel > 0.44);
    add(70, formationId === "caldera" || active || (crater > 0.4 && oldLava > 0.4));
    add(71, stageRank >= 1 && yearsSinceEruption > 0 && freshLava < 0.42);
    add(72, eruption > 0.18 && (mineralDeposit > 0.32 || rare > 0.36));
    add(73, longTermUse > 0.5 || use.observatory || use.fertileTerrace);

    return {
        biome: "volcanic", volcanic: true, volcano: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate: context.climate || "volcanic", moisture, temperature, height,
        features: VOLCANO_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            relative, aboveSea, slope, relief: cone, cone, crater, craterRadius: clamp01(crater * 0.28 + 0.06),
            caldera, fissure, chain, shield, lavaFlow, lavaAge, freshLava, oldLava,
            lavaColour, basalt, pumice, obsidian, spires, brokenRock, cave, crevice, hotRock,
            label: caldera > 0.55 ? "collapsed caldera" : crater > 0.5 ? "crater rim"
                : formationId === "fissure-field" ? "open fissure" : freshLava > 0.5 ? "fresh lava field"
                    : oldLava > 0.55 ? "weathered lava" : slope > 0.55 ? "volcanic slope" : "lava plain",
        },
        soil: {
            rock: basalt, pumice, obsidian, ash, sulfur, minerals: mineralDeposit,
            thinSoil: clamp01(1 - soilAge), stability: clamp01(0.72 - slope * 0.3 - unstable * 0.18),
            fertility: fertile, organic: clamp01(vegetation * 0.4 + mosses.length * 0.04),
            ageYears: Math.round(soilAge * 260), formation: soilFormation,
        },
        water: {
            hotSpring, geyser, fumarole, sulfurSpring, mudPool, heatedWater, newChannel,
            water: clamp01(hotSpring * 0.6 + heatedWater * 0.24 + newChannel * 0.16), steam,
            waterLineM: Math.round((0.6 - relative * 0.18) * 1000),
            label: geyser > 0.5 ? "geyser basin" : hotSpring > 0.5 ? "hot spring"
                : fumarole > 0.5 ? "fumarole field" : newChannel > 0.5 ? "new meltwater channel" : "dry volcanic ground",
        },
        climate: {
            ash, smoke, steam, toxicGas, hotRock, temperature, sunlight, cloud, shadow,
            wind: clamp01(wind * 0.3), eruption, active, cycleYears, cyclePhase, yearsSinceEruption,
        },
        vegetation: {
            trees, shrubs, grasses, flowers, mosses, herbs, density: vegetation, cover: vegetation,
            stage, stageRank, soilAge, fertile, regeneration, bloom: clamp01((season === "summer" ? 0.8 : season === "spring" ? 0.58 : 0.14) * (1 - ash * 0.34)),
        },
        fauna, goods,
        economy: {
            stone: basalt, basalt, pumice, obsidian, sulfur, ore, metals: ore,
            minerals: mineralDeposit, rare, geothermal, fertileSoil: fertile,
            water: heatedWater, timber: clamp01(trees.length * 0.18), hunting: clamp01(fauna.length * 0.07 + vegetation * 0.2),
            settlement, defence, usability: longTermUse, quarry: clamp01(basalt * 0.55 + pumice * 0.2 + obsidian * 0.16),
            mine: clamp01(ore * 0.7 + sulfur * 0.2 + rare * 0.12),
            geothermalPlant: geothermal, craterExpedition: rare, development: clamp01(0.18 + settlement * 0.35 + (use.road ? 0.12 : 0)),
            carryingCapacity: clamp01(0.16 + fertile * 0.45 - freshLava * 0.18),
        },
        hazards: {
            movement, transport, defence, rockfall: hazardRockfall, earthquake, toxicGas, unstable,
            lava: lavaFlow, ash, eruption, uninhabitable, destruction,
            passability: clamp01(1 - freshLava * 0.3 - unstable * 0.18 - spires * 0.14 + (use.road ? 0.16 : 0) + (use.bridge ? 0.14 : 0)),
            warning: clamp01((use.observatory ? 0.26 : 0) + yearsSinceEruption * 0.02 + (1 - eruption) * 0.12),
        },
        workPotential: {
            lavaQuarry: basalt, obsidianQuarry: obsidian, pumiceQuarry: pumice, sulfurMine: sulfur,
            metalMine: clamp01(ore * 0.8 + rare * 0.15), mineralWorks: mineralDeposit,
            geothermalPlant: geothermal, fertileTerrace: clamp01(fertile * 0.8 + (1 - slope) * 0.2),
            craterExpedition: rare, observatory: clamp01(0.3 + (1 - eruption) * 0.3 + yearsSinceEruption * 0.02),
        },
        use,
        visual: {
            sunlight, openLight: clamp01(sunlight * (0.74 + (1 - ash) * 0.2)), shadow, cloud,
            smoke, steam, ash, hotRock, lavaGlow: clamp01(hotRock * 0.7 + lavaFlow * 0.3),
            wind: clamp01(wind * 0.3), windSway: clamp01(0.08 + wind * 0.14),
            rockColour, groundHex: hexColour(ground), grassHex: hexColour(grassColour),
            rockHex: rockColour, basaltHex: "#3f4143", ashHex: "#69645d", pumiceHex: "#b6ae9f",
            obsidianHex: "#24252b", sulfurHex: "#c6b84e", mineralHex: "#c9c4b2",
            lavaHex: freshLava > 0.55 ? "#ef6a24" : "#b34321", lavaCoreHex: "#ffd166",
            waterHex: "#4f9990", hotWaterHex: "#67b8a7", skyHex: "#a8a398",
            lightHex: hexColour(mixColour([196, 175, 153], [238, 222, 194], sunlight)),
            lightMood: smoke > 0.5 ? "ash-cloud" : freshLava > 0.45 ? "lava-glow"
                : hotSpring > 0.4 ? "steam" : trees.length ? "wooded" : "open",
        },
        grassHex: hexColour(grassColour), groundHex: hexColour(ground), leafColour: trees[0]?.seasonColour || hexColour(grassColour),
        sward: { height: grasses.length ? "short" : "sparse", density: clamp01(vegetation * 0.62) },
        trees, treeChance: trees.length ? clamp01(0.34 + vegetation * 0.44) : 0,
        seasonalNote: `${formation.label} · ${Math.round(soilAge * 100)}% soil age · ${Math.round(ash * 100)}% ash · ${goods[0]?.label || "bare lava"}`,
    };
}

function pumiceLike(roll) {
    return roll > 0.68 ? 0.8 : 0.2;
}

export function volcanoGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "volcanic-soil") return season !== "winter";
        return true;
    });
}

export function volcanoProductsAt(x, y, context = {}) {
    if (!isVolcanoSite(x, y, context)) return null;
    const profile = volcanoProfileAt(x, y, context);
    if (!profile?.volcanic) return null;
    const goods = volcanoGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length && !profile.fauna.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function volcanoSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const works = ["lavaQuarry", "obsidianQuarry", "pumiceQuarry", "sulfurMine", "metalMine",
        "mineralWorks", "geothermalPlant", "fertileTerrace", "craterExpedition", "observatory"]
        .filter(key => profile.use?.[key]);
    return `${profile.label} · ${profile.landform.label} · ${goods} · ${wildlife}`
        + (works.length ? " · works: " + works.join(", ") : "");
}

export function volcanoRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export function volcanoRequirementAudit(profile) {
    const present = new Set(profile?.features || []);
    return VOLCANO_REQUIREMENTS.map(requirement => ({ ...requirement, present: present.has(requirement.id) }));
}

export const VOLCANO_LIMITS = Object.freeze({
    requirements: VOLCANO_REQUIREMENTS.length,
    formations: Object.keys(VOLCANO_FORMATIONS).length,
    maxFauna: 8,
    maxFlowers: 4,
    maxGoods: 9,
    trees: Object.keys(VOLCANO_TREES).length,
});
