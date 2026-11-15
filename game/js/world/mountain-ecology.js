// Mountains and highlands (spec 1.2.12.1–1.2.12.77).
//
// A mountain is not a hill with grey paint. Altitude changes temperature,
// snowline, vegetation belts, rock, water, wildlife, movement, supply and the
// value of a pass. This module derives one bounded, deterministic profile per
// tile from the same seed, terrain and season inputs as every other ecosystem.
// The renderer, survey, gathering ledger, movement costs and the persistent
// mountain works all read this single profile.
import { seasonalState } from "./season.js";

const req = (id, key, label, group) => ({ id: "1.2.12." + id, key, label, group });

export const MOUNTAIN_REQUIREMENTS = Object.freeze([
    req(1, "low-mid-ranges", "Low and middle mountain ranges", "landform"),
    req(2, "high-chains", "High mountain chains", "landform"),
    req(3, "jagged-peaks", "Sharp-edged mountain peaks", "landform"),
    req(4, "rounded-summits", "Rounded mountain tops", "landform"),
    req(5, "sheer-walls", "Steep rock walls", "landform"),
    req(6, "ridges", "Mountain ridges", "landform"),
    req(7, "deep-valleys", "Deep valleys", "landform"),
    req(8, "gorges", "Gorges", "landform"),
    req(9, "high-plateaus", "High plateaus", "landform"),
    req(10, "isolated-massifs", "Free-standing mountain massifs", "landform"),
    req(11, "lower-forests", "Low-lying mountain forests", "vegetation"),
    req(12, "montane-mixed", "Montane mixed forests", "vegetation"),
    req(13, "subalpine-conifer", "Subalpine conifer forests", "vegetation"),
    req(14, "alpine-meadows", "Alpine meadows", "vegetation"),
    req(15, "rock-scree-zones", "Rock and scree zones", "landform"),
    req(16, "snowy-summits", "Snow-covered summit areas", "climate"),
    req(17, "permanent-ice", "Permanent ice and snow zones", "climate"),
    req(18, "climate-aspect-treeline", "Vegetation limits shaped by climate and aspect", "vegetation"),
    req(19, "granite", "Granite formations", "rock"),
    req(20, "limestone-walls", "Limestone walls", "rock"),
    req(21, "slate-slopes", "Slate slopes", "rock"),
    req(22, "boulder-fields", "Boulder fields", "rock"),
    req(23, "scree", "Boulders and scree slopes", "rock"),
    req(24, "weathered-ledges", "Weathered rock ledges", "rock"),
    req(25, "crevices", "Rock crevices", "rock"),
    req(26, "caves-overhangs", "Caves and natural overhangs", "rock"),
    req(27, "rock-colours", "Different rock colours and surfaces", "rock"),
    req(28, "mountain-forests", "Mountain forests", "vegetation"),
    req(29, "krummholz", "Krummholz and low shrubs", "vegetation"),
    req(30, "alpine-grasses", "Alpine grasses", "vegetation"),
    req(31, "mountain-flowers", "Mountain flowers", "vegetation"),
    req(32, "mosses-lichens", "Mosses and lichens", "vegetation"),
    req(33, "rare-high-plants", "Rare high-mountain plants", "vegetation"),
    req(34, "sparse-rock-vegetation", "Sparsely vegetated rock faces", "vegetation"),
    req(35, "snowfield-transitions", "Transitions to snowfields", "climate"),
    req(36, "springs", "Mountain springs", "water"),
    req(37, "streams", "Small mountain streams", "water"),
    req(38, "waterfalls", "Waterfalls", "water"),
    req(39, "mountain-lakes", "Mountain lakes", "water"),
    req(40, "glaciers", "Glaciers", "water"),
    req(41, "meltwater-channels", "Meltwater channels", "water"),
    req(42, "snowfields", "Snowfields", "climate"),
    req(43, "ice-caves", "Ice caves and frozen waterfalls", "water"),
    req(44, "ibex-chamois", "Ibex and chamois", "fauna"),
    req(45, "marmots", "Marmots", "fauna"),
    req(46, "eagles-vultures", "Mountain eagles and vultures", "fauna"),
    req(47, "mountain-foxes", "Mountain foxes", "fauna"),
    req(48, "wolves-lynx", "Wolves and lynx", "fauna"),
    req(49, "ptarmigan", "Ptarmigan", "fauna"),
    req(50, "small-rodents", "Small rodents", "fauna"),
    req(51, "stone-materials", "Stone and building materials", "economy"),
    req(52, "ores-metals", "Ores and metals", "economy"),
    req(53, "gemstones", "Gemstones", "economy"),
    req(54, "salt-deposits", "Salt deposits", "economy"),
    req(55, "mountain-herbs", "Mountain herbs", "economy"),
    req(56, "mountain-water", "Mountain water", "economy"),
    req(57, "high-timber", "Timber in wooded altitudes", "economy"),
    req(58, "hunting-products", "Hunting products", "economy"),
    req(59, "rare-minerals", "Rare mineral raw materials", "economy"),
    req(60, "gradient-cost", "Rising movement costs with steepness", "hazard"),
    req(61, "steep-crossing", "Difficult crossing of steep slopes", "hazard"),
    req(62, "limited-rock-passage", "Limited passability of certain rock sections", "hazard"),
    req(63, "strategic-passes", "Mountain passes as strategic chokepoints", "hazard"),
    req(64, "height-defence", "Height advantages for defenders", "hazard"),
    req(65, "heavy-transport", "Difficult transport of heavy equipment", "hazard"),
    req(66, "avalanche", "Avalanche danger", "hazard"),
    req(67, "supply-lines", "Difficult supply and troop movement", "hazard"),
    req(68, "mountain-troops", "Advantages for mountain-experienced units", "hazard"),
    req(69, "terraced-villages", "Terraced mountain villages", "economy"),
    req(70, "valley-settlements", "Settlements in sheltered valleys", "economy"),
    req(71, "summit-fortresses", "Fortresses on mountain tops", "economy"),
    req(72, "fortified-passes", "Mountain passes with fortified works", "economy"),
    req(73, "switchbacks", "Switchbacks and narrow paths", "economy"),
    req(74, "gorge-bridges", "Bridges over gorges", "economy"),
    req(75, "mines", "Mines", "economy"),
    req(76, "quarries", "Quarries", "economy"),
    req(77, "water-conduits", "Water conduits and small dams", "economy"),
]);

export const MOUNTAIN_REQUIREMENT_IDS = Object.freeze(MOUNTAIN_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(MOUNTAIN_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const MOUNTAIN_FORMATIONS = Object.freeze({
    foothills: Object.freeze({
        id: "foothills", label: "Forested foothills", zone: "lower",
        note: "low, wooded ridges rising out of the valley, with orchards, terraces and scattered farms",
        trees: ["beech", "maple", "fir", "spruce"], shrubs: ["hazel", "juniper"],
        grasses: ["alpine-bluegrass", "sheep-fescue"], flowers: ["mountain-avens", "alpine-aster"],
        mosses: ["feather-moss"],
    }),
    "high-chain": Object.freeze({
        id: "high-chain", label: "High mountain chain", zone: "subalpine",
        note: "long grey ridges and deep saddles, forested below and bare above the snow line",
        trees: ["spruce", "fir", "larch", "rowan"], shrubs: ["dwarf-pine", "juniper"],
        grasses: ["tufted-hairgrass", "alpine-bluegrass"], flowers: ["gentian", "edelweiss"],
        mosses: ["reindeer-lichen", "crustose-lichen"],
    }),
    "jagged-peaks": Object.freeze({
        id: "jagged-peaks", label: "Jagged peaks", zone: "nival",
        note: "saw-toothed summits, black crevices and snow clinging to the north faces",
        trees: [], shrubs: ["dwarf-pine"], grasses: ["alpine-bluegrass"],
        flowers: ["glacier-buttercup"], mosses: ["crustose-lichen"],
    }),
    "rounded-summits": Object.freeze({
        id: "rounded-summits", label: "Rounded summits", zone: "alpine",
        note: "broad grassy tops and weathered domes where the wind never stops",
        trees: ["larch"], shrubs: ["juniper", "alpenrose"], grasses: ["sheep-fescue", "tufted-hairgrass"],
        flowers: ["mountain-avens", "alpine-aster", "gentian"], mosses: ["moss-campion", "reindeer-lichen"],
    }),
    "sheer-walls": Object.freeze({
        id: "sheer-walls", label: "Sheer rock walls", zone: "alpine",
        note: "vertical limestone and granite faces broken by ledges, crevices and caves",
        trees: [], shrubs: ["dwarf-pine"], grasses: ["alpine-bluegrass"],
        flowers: ["edelweiss"], mosses: ["crustose-lichen"],
    }),
    ridges: Object.freeze({
        id: "ridges", label: "Wind-scoured ridge", zone: "subalpine",
        note: "a narrow crest of broken stone, krummholz and wind-bent larch",
        trees: ["larch", "spruce"], shrubs: ["dwarf-pine", "juniper"],
        grasses: ["tufted-hairgrass"], flowers: ["mountain-avens", "gentian"],
        mosses: ["reindeer-lichen"],
    }),
    "deep-valleys": Object.freeze({
        id: "deep-valleys", label: "Deep valley", zone: "montane",
        note: "a sheltered valley floor of mixed forest, meadows, streams and small settlements",
        trees: ["beech", "maple", "spruce", "ash"], shrubs: ["hazel", "juniper"],
        grasses: ["alpine-bluegrass", "sheep-fescue"], flowers: ["mountain-avens", "alpine-aster"],
        mosses: ["feather-moss"],
    }),
    gorge: Object.freeze({
        id: "gorge", label: "Gorge", zone: "montane",
        note: "a river cutting between sheer walls, with spray, boulders and a single hard crossing",
        trees: ["pine", "birch"], shrubs: ["juniper"],
        grasses: ["tufted-hairgrass"], flowers: ["alpine-aster"],
        mosses: ["feather-moss", "crustose-lichen"],
    }),
    plateau: Object.freeze({
        id: "plateau", label: "High plateau", zone: "alpine",
        note: "an open table of thin grass, peat, boulders and shallow tarns under a huge sky",
        trees: ["larch", "birch"], shrubs: ["dwarf-pine", "alpenrose"],
        grasses: ["sheep-fescue", "tufted-hairgrass"], flowers: ["gentian", "alpine-aster"],
        mosses: ["moss-campion", "reindeer-lichen"],
    }),
    "isolated-massif": Object.freeze({
        id: "isolated-massif", label: "Isolated massif", zone: "subalpine",
        note: "a free-standing mountain rising from the surrounding land, with its own weather and tree line",
        trees: ["spruce", "fir", "beech", "rowan"], shrubs: ["juniper", "dwarf-pine"],
        grasses: ["alpine-bluegrass"], flowers: ["edelweiss", "mountain-avens"],
        mosses: ["reindeer-lichen", "feather-moss"],
    }),
});

// Only genuinely new goods live here. Stone, copper, gemstones, salt, timber,
// firewood, herbs, game, fur and hides already exist in the shared catalogue.
export const MOUNTAIN_GOODS = Object.freeze({
    granite: Object.freeze({ id: "granite", label: "Granite blocks", category: "material" }),
    limestone: Object.freeze({ id: "limestone", label: "Limestone", category: "material" }),
    slate: Object.freeze({ id: "slate", label: "Slate", category: "material" }),
    marble: Object.freeze({ id: "marble", label: "Marble", category: "luxury" }),
    "iron-ore": Object.freeze({ id: "iron-ore", label: "Iron ore", category: "material" }),
    "mountain-herb": Object.freeze({ id: "mountain-herb", label: "Mountain herbs", category: "medicine" }),
    "mountain-water": Object.freeze({ id: "mountain-water", label: "Mountain spring water", category: "material" }),
    "alpine-flower": Object.freeze({ id: "alpine-flower", label: "Rare alpine flower", category: "luxury" }),
});

export const MOUNTAIN_TREES = Object.freeze({
    spruce: Object.freeze({ id: "spruce", label: "Spruce", kind: "conifer", heightMeters: 26, crown: 0.7, colours: { spring: "#315a43", summer: "#254735", autumn: "#1f3b2e", winter: "#244032" }, goods: ["spruce-timber", "resin", "firewood"] }),
    fir: Object.freeze({ id: "fir", label: "Silver fir", kind: "conifer", heightMeters: 30, crown: 0.76, colours: { spring: "#2e5843", summer: "#234636", autumn: "#1d3a2e", winter: "#213d31" }, goods: ["fir-timber", "resin", "firewood"] }),
    larch: Object.freeze({ id: "larch", label: "Larch", kind: "conifer", heightMeters: 22, crown: 0.66, colours: { spring: "#6f9455", summer: "#4f7e45", autumn: "#c39a3a", winter: "#7e6e55" }, goods: ["larch-timber", "resin", "firewood"] }),
    pine: Object.freeze({ id: "pine", label: "Mountain pine", kind: "conifer", heightMeters: 18, crown: 0.72, colours: { spring: "#557a4d", summer: "#3d663f", autumn: "#3a5d39", winter: "#445f40" }, goods: ["pine-timber", "resin", "firewood"] }),
    beech: Object.freeze({ id: "beech", label: "Beech", kind: "broadleaf", heightMeters: 24, crown: 0.9, colours: { spring: "#7b9a5c", summer: "#4f7b45", autumn: "#b18838", winter: "#776e5c" }, goods: ["beech-timber", "firewood", "beechnuts"] }),
    maple: Object.freeze({ id: "maple", label: "Mountain maple", kind: "broadleaf", heightMeters: 20, crown: 0.84, colours: { spring: "#86a05f", summer: "#557f46", autumn: "#b05a31", winter: "#7a6a57" }, goods: ["maple-timber", "firewood", "maple-syrup"] }),
    ash: Object.freeze({ id: "ash", label: "Mountain ash", kind: "broadleaf", heightMeters: 21, crown: 0.8, colours: { spring: "#7a9b5e", summer: "#527e48", autumn: "#aa8438", winter: "#7c7260" }, goods: ["ash-timber", "firewood", "herbs"] }),
    birch: Object.freeze({ id: "birch", label: "Mountain birch", kind: "broadleaf", heightMeters: 12, crown: 0.64, colours: { spring: "#91a567", summer: "#6a8b51", autumn: "#bea044", winter: "#8a8370" }, goods: ["birch-timber", "firewood", "birch-sap"] }),
    rowan: Object.freeze({ id: "rowan", label: "Rowan", kind: "broadleaf", heightMeters: 9, crown: 0.58, colours: { spring: "#849b5e", summer: "#5c7f49", autumn: "#b45630", winter: "#7c7059" }, goods: ["rowan-timber", "firewood", "rowan-berries"] }),
});

export const MOUNTAIN_SHRUBS = Object.freeze({
    juniper: Object.freeze({ id: "juniper", label: "Juniper", colours: ["#4b6548", "#71805c"], goods: ["juniper-berries", "firewood"] }),
    "dwarf-pine": Object.freeze({ id: "dwarf-pine", label: "Dwarf pine", colours: ["#3e5e42", "#6a7e57"], goods: ["dwarf-pine-cones", "firewood"] }),
    alpenrose: Object.freeze({ id: "alpenrose", label: "Alpenrose", colours: ["#6d794a", "#b96679"], goods: ["alpine-flower"] }),
    hazel: Object.freeze({ id: "hazel", label: "Hazel", colours: ["#657a4a", "#95a06a"], goods: ["hazelnuts", "firewood"] }),
});

export const MOUNTAIN_GRASSES = Object.freeze({
    "alpine-bluegrass": Object.freeze({ id: "alpine-bluegrass", label: "Alpine bluegrass", colours: ["#71835b", "#9ba477"], goods: ["hay"] }),
    "sheep-fescue": Object.freeze({ id: "sheep-fescue", label: "Sheep fescue", colours: ["#7d8556", "#a9a276"], goods: ["hay"] }),
    "tufted-hairgrass": Object.freeze({ id: "tufted-hairgrass", label: "Tufted hairgrass", colours: ["#687b52", "#9a9d6b"], goods: ["hay"] }),
});

export const MOUNTAIN_FLOWERS = Object.freeze({
    edelweiss: Object.freeze({ id: "edelweiss", label: "Edelweiss", seasons: ["summer"], colours: ["#d9d7c0", "#f2eedb"], rare: true, goods: ["alpine-flower"] }),
    gentian: Object.freeze({ id: "gentian", label: "Blue gentian", seasons: ["summer", "autumn"], colours: ["#3f5c9c", "#7181bb"], goods: [] }),
    "alpine-aster": Object.freeze({ id: "alpine-aster", label: "Alpine aster", seasons: ["summer", "autumn"], colours: ["#8d76b1", "#baa4d1"], goods: [] }),
    "glacier-buttercup": Object.freeze({ id: "glacier-buttercup", label: "Glacier buttercup", seasons: ["summer"], colours: ["#d8d49a", "#f0eabf"], rare: true, goods: ["alpine-flower"] }),
    "mountain-avens": Object.freeze({ id: "mountain-avens", label: "Mountain avens", seasons: ["spring", "summer"], colours: ["#e2d7b9", "#cbbf9f"], goods: [] }),
});

export const MOUNTAIN_MOSSES = Object.freeze({
    "reindeer-lichen": Object.freeze({ id: "reindeer-lichen", label: "Reindeer lichen", colours: ["#8a8f72", "#b7b79a"], goods: ["lichen"] }),
    "crustose-lichen": Object.freeze({ id: "crustose-lichen", label: "Crustose lichen", colours: ["#7b8471", "#a7ab91"], goods: ["lichen"] }),
    "moss-campion": Object.freeze({ id: "moss-campion", label: "Moss campion", colours: ["#617b55", "#8c9c70"], goods: ["mountain-herb"] }),
    "feather-moss": Object.freeze({ id: "feather-moss", label: "Feather moss", colours: ["#537049", "#84956a"], goods: ["mountain-herb"] }),
});

export const MOUNTAIN_FAUNA = Object.freeze({
    ibex: Object.freeze({ id: "ibex", label: "Alpine ibex", group: "goat", kind: "ibex", seasons: ["spring", "summer", "autumn", "winter"] }),
    chamois: Object.freeze({ id: "chamois", label: "Chamois", group: "goat", kind: "chamois", seasons: ["spring", "summer", "autumn", "winter"] }),
    marmot: Object.freeze({ id: "marmot", label: "Alpine marmot", group: "small", kind: "marmot", seasons: ["spring", "summer", "autumn"] }),
    "golden-eagle": Object.freeze({ id: "golden-eagle", label: "Golden eagle", group: "bird", kind: "eagle", seasons: ["spring", "summer", "autumn", "winter"] }),
    vulture: Object.freeze({ id: "vulture", label: "Griffon vulture", group: "bird", kind: "vulture", seasons: ["spring", "summer", "autumn"] }),
    fox: Object.freeze({ id: "fox", label: "Mountain fox", group: "predator", kind: "fox", seasons: ["spring", "summer", "autumn", "winter"] }),
    wolf: Object.freeze({ id: "wolf", label: "Wolf", group: "predator", kind: "wolf", seasons: ["spring", "summer", "autumn", "winter"] }),
    lynx: Object.freeze({ id: "lynx", label: "Lynx", group: "predator", kind: "lynx", seasons: ["spring", "summer", "autumn", "winter"] }),
    ptarmigan: Object.freeze({ id: "ptarmigan", label: "Ptarmigan", group: "bird", kind: "ptarmigan", seasons: ["spring", "summer", "autumn", "winter"] }),
    "snow-vole": Object.freeze({ id: "snow-vole", label: "Snow vole", group: "small", kind: "vole", seasons: ["spring", "summer", "autumn", "winter"] }),
    "mountain-hare": Object.freeze({ id: "mountain-hare", label: "Mountain hare", group: "small", kind: "hare", seasons: ["spring", "summer", "autumn", "winter"] }),
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
        terraced: Boolean(explicit.terraced || explicit.terrace || state === "terraced"),
        valleySettlement: Boolean(explicit.valleySettlement || explicit.village || state === "village"),
        fortress: Boolean(explicit.fortress || explicit.fort || state === "fortress"),
        fortifiedPass: Boolean(explicit.fortifiedPass || explicit.passFort || state === "pass-fort"),
        road: Boolean(explicit.road || state === "road"),
        bridge: Boolean(explicit.bridge || state === "bridged"),
        mine: Boolean(explicit.mine || state === "mined"),
        quarry: Boolean(explicit.quarry || state === "quarried"),
        aqueduct: Boolean(explicit.aqueduct || state === "irrigated"),
        logged: Boolean(explicit.logged || state === "logged"),
        grazed: Boolean(explicit.grazed || state === "grazed"),
        burnt: Boolean(explicit.burnt || explicit.burned || state === "burnt"),
        intensity: clamp01(explicit.intensity ?? 0.12),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (state === "wild" ? "unmanaged mountain" : state.replace(/-/g, " ")),
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
    // The lowest belt is a real foothill or gorge, not merely a failed peak.
    if (scores.relative < 0.2) return scores.gorge > 0.52 ? "gorge" : "foothills";
    if (scores.walls > 0.78) return "sheer-walls";
    if (scores.jagged > 0.74) return "jagged-peaks";
    if (scores.plateau > 0.72) return "plateau";
    if (scores.gorge > 0.72) return "gorge";
    if (scores.rounded > 0.65) return "rounded-summits";
    if (scores.isolated > 0.7) return "isolated-massif";
    if (scores.ridge > 0.6) return "ridges";
    if (scores.deepValley > 0.58) return "deep-valleys";
    if (scores.highChain > 0.5) return "high-chain";
    return "foothills";
}

function buildTrees(seed, x, y, formation, season, treeCover, zone) {
    if (!formation.trees.length || zone === "nival") return [];
    const chance = zone === "subalpine" ? 0.62 : zone === "alpine" ? 0.2 : 0.88;
    const roll = unit(seed, x, y, 0x4d545245);
    if (roll > chance * (0.72 + treeCover * 0.34)) return [];
    const count = roll < chance * 0.18 ? 3 : roll < chance * 0.54 ? 2 : 1;
    const trees = [];
    for (let index = 0; index < count; index++) {
        const tree = MOUNTAIN_TREES[pick(seed, x + index, y, formation.trees, 0x4d545233 + index)];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x4d545234) - 0.5) * 0.56,
            offsetY: (unit(seed, x, y + index, 0x4d545235) - 0.5) * 0.3,
            scale: 0.68 + unit(seed, x, y + index, 0x4d545236) * 0.42,
            seasonColour: tree.colours[season] || tree.colours.summer,
            snowy: zone !== "lower" && (season === "winter" || zone === "subalpine") && unit(seed, x, y + index, 0x534e4f57) > 0.4,
            windBent: formation.id === "ridges" || formation.id === "isolated-massif",
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, zone, cover, snow, rock, water } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = MOUNTAIN_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(12, Math.round(count))) });
    };
    if (rock > 0.3 && unit(seed, x, y, 0x49424558) > 0.34) add("ibex", 2);
    if (rock > 0.26 && unit(seed, x, y, 0x4348414d) > 0.46) add("chamois", 2);
    if (zone !== "nival" && cover > 0.2 && unit(seed, x, y, 0x4d41524d) > 0.58) add("marmot", 2);
    if (zone !== "lower" && unit(seed, x, y, 0x4541474c) > 0.52) add("golden-eagle");
    if (zone === "nival" || zone === "alpine") add("vulture");
    if (cover > 0.28 && unit(seed, x, y, 0x464f5831) > 0.44) add("fox");
    if (cover > 0.38 && unit(seed, x, y, 0x574f4c46) > 0.7) add("wolf", 2);
    if (cover > 0.34 && unit(seed, x, y, 0x4c594e58) > 0.76) add("lynx");
    if (zone === "alpine" || zone === "nival") add("ptarmigan", 2);
    if (rock > 0.2 && unit(seed, x, y, 0x564f4c45) > 0.52) add("snow-vole", 2);
    if (snow > 0.2 && unit(seed, x, y, 0x48415245) > 0.6) add("mountain-hare");
    if (water > 0.2 && unit(seed, x, y, 0x54524f55) > 0.72) add("golden-eagle");
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { season, rockType, rock, ore, gems, salt, trees, herbs, water, snow, cover, zone } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.05 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    if (rock > 0.18) add("stone", "Stone", "material", rock * 0.7);
    if (rockType === "granite" && rock > 0.28) add("granite", "Granite blocks", "material", rock * 0.62);
    if (rockType === "limestone" && rock > 0.28) add("limestone", "Limestone", "material", rock * 0.64);
    if (rockType === "slate" && rock > 0.26) add("slate", "Slate", "material", rock * 0.58);
    if (rockType === "marble" && rock > 0.34) add("marble", "Marble", "luxury", rock * 0.4);
    if (ore > 0.26) add("iron-ore", "Iron ore", "material", ore * 0.62);
    if (ore > 0.34) add("copper-ore", "Copper ore", "material", ore * 0.44);
    if (gems > 0.44) add("gemstones", "Gemstones", "luxury", gems * 0.42);
    if (salt > 0.4) add("salt", "Rock salt", "material", salt * 0.6);
    if (trees.some(tree => tree.goods?.includes("spruce-timber"))) add("spruce-timber", "Spruce timber", "wood", 0.4);
    if (trees.some(tree => tree.goods?.includes("fir-timber"))) add("fir-timber", "Fir timber", "wood", 0.36);
    if (trees.some(tree => tree.goods?.includes("larch-timber"))) add("larch-timber", "Larch timber", "wood", 0.34);
    if (trees.some(tree => tree.goods?.includes("beech-timber"))) add("beech-timber", "Beech timber", "wood", 0.34);
    if (trees.length) add("firewood", "Firewood", "wood", 0.3 + cover * 0.2);
    if (herbs.length && season !== "winter") add("mountain-herb", "Mountain herbs", "medicine", 0.28 + herbs.length * 0.04);
    if (water > 0.16) add("mountain-water", "Mountain spring water", "material", 0.32 + water * 0.3);
    if (water > 0.3 && season !== "winter") add("alpine-flower", "Rare alpine flower", "luxury", 0.18);
    if (cover > 0.28) add("game", "Wild game", "hunt", 0.28 + cover * 0.2);
    if (cover > 0.34) add("fur", "Furs", "hunt", 0.2 + cover * 0.12);
    if (rock > 0.3 && zone === "nival" && snow > 0.3) add("gemstones", "Gemstones", "luxury", 0.18);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

/** How strongly a tile belongs to the mountain climate. */
export function mountainPotentialAt(x, y, context = {}) {
    const climate = context.climate || "temperate";
    if (climate !== "mountain") return 0;
    const height = clamp01(context.height ?? 0.55);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height <= seaLevel + 0.002) return 0;
    return clamp01(0.76 + unit(Number(context.seed) || 1, x, y, 0x4d4f554e) * 0.24);
}

export function isMountainSite(x, y, context = {}) {
    return mountainPotentialAt(x, y, context) > 0.24;
}

/** Complete, pure mountain profile for one tile. */
export function mountainProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const height = clamp01(context.height ?? 0.58);
    const seaLevel = number(context.seaLevel, 0.33);
    const moisture = clamp01(context.moisture ?? 0.48);
    const temperature = clamp01(context.temperature ?? 0.42);
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, "mountain");
    const use = normalizeUse(context.use);
    const aboveSea = Math.max(0, height - seaLevel);
    const relative = clamp01(aboveSea / 0.62);
    const roughness = coarse(seed, x, y, 4, 0x524f5547);
    const ridgeRoll = coarse(seed, x, y, 5, 0x52494447);
    const valleyRoll = coarse(seed, x, y, 6, 0x56414c4c);
    const massifRoll = coarse(seed, x, y, 9, 0x4d415353);
    const rockRoll = coarse(seed, x, y, 7, 0x524f434b);
    const waterRoll = coarse(seed, x, y, 4, 0x57415452);
    const caveRoll = coarse(seed, x, y, 6, 0x43415645);
    const gemRoll = coarse(seed, x, y, 8, 0x47454d53);
    const saltRoll = coarse(seed, x, y, 7, 0x53414c54);
    const oreRoll = coarse(seed, x, y, 5, 0x4f5245);
    const aspect = unit(seed, x, y, 0x41535054);
    const aspectName = aspect < 0.25 ? "north" : aspect < 0.5 ? "east" : aspect < 0.75 ? "south" : "west";
    const northness = aspect < 0.25 || aspect > 0.75 ? 0.72 : 0.34;
    const slope = clamp01(0.18 + roughness * 0.42 + relative * 0.34 + (ridgeRoll > 0.68 ? 0.16 : 0));
    const climateSnow = base.snowCover;
    const snowLine = clamp01(0.58 - climateSnow * 0.16 - northness * 0.04);
    const treeLine = clamp01(0.39 + moisture * 0.06 + (aspect > 0.62 && aspect < 0.88 ? 0.03 : 0) - (temperature < 0.3 ? 0.03 : 0));
    const snow = clamp01(smoothstep(snowLine, snowLine + 0.16, relative) + climateSnow * 0.2);
    const permanentIce = clamp01(smoothstep(0.8, 0.94, relative) * (0.72 + northness * 0.2) - climateSnow * 0.06);
    const zone = relative < 0.24 ? "lower" : relative < 0.44 ? "montane" : relative < 0.63 ? "subalpine" : relative < 0.82 ? "alpine" : "nival";
    const rock = clamp01(smoothstep(0.35, 0.8, relative) * 0.8 + slope * 0.24 + roughness * 0.1);
    const scree = clamp01(smoothstep(0.25, 0.7, slope) * 0.7 + roughness * 0.22 - snow * 0.12);
    const cliff = clamp01(smoothstep(0.66, 0.92, slope) * 0.88 + (formationWall(slope, roughness) ? 0.18 : 0));
    const plateau = clamp01(smoothstep(0.62, 0.84, relative) * (1 - slope) * 1.8);
    const valley = clamp01((1 - relative) * 1.2 + valleyRoll * 0.24);
    const gorge = clamp01((1 - relative) * 0.42 + slope * 0.38 + riverPotential(hash32(seed, x, y, 0x474f5247)) * 0.18 - 0.18);
    const pass = clamp01((1 - slope) * 0.72 + (ridgeRoll > 0.58 && ridgeRoll < 0.78 ? 0.22 : 0) - snow * 0.1);
    const rockType = rockRoll < 0.36 ? "granite" : rockRoll < 0.6 ? "limestone" : rockRoll < 0.82 ? "slate" : "marble";
    const formationId = chooseFormation({
        relative,
        walls: cliff * (slope > 0.72 ? 1 : 0.52),
        jagged: relative > 0.74 ? smoothstep(0.7, 0.95, relative) * (0.5 + roughness * 0.55) : 0,
        plateau,
        gorge,
        rounded: relative > 0.56 ? (1 - roughness) * 0.72 + (1 - slope) * 0.22 : 0,
        isolated: massifRoll > 0.78 ? 0.76 + relative * 0.18 : relative > 0.7 ? relative * 0.8 : 0,
        ridge: ridgeRoll > 0.55 ? 0.52 + ridgeRoll * 0.3 : 0,
        deepValley: valley > 0.56 && gorge < 0.62 ? valley : 0,
        highChain: relative > 0.52 ? relative * 0.9 : 0,
    });
    const formation = MOUNTAIN_FORMATIONS[formationId];

    const trees = buildTrees(seed, x, y, formation, season, clamp01(1 - relative / Math.max(0.2, treeLine)), zone);
    const grasses = formation.grasses.map(id => MOUNTAIN_GRASSES[id]).filter(Boolean);
    const shrubs = formation.shrubs.map(id => MOUNTAIN_SHRUBS[id]).filter(Boolean);
    const flowers = formation.flowers.map(id => MOUNTAIN_FLOWERS[id]).filter(Boolean)
        .filter(flower => flower.seasons.includes(season))
        .filter((entry, index) => unit(seed, x, y, 0x464c4f57 + index) > 0.3 + snow * 0.34);
    const mosses = formation.mosses.map(id => MOUNTAIN_MOSSES[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x4d4f5353 + index) > 0.24 + snow * 0.3);
    const herbs = mosses.length || flowers.some(flower => flower.rare)
        ? [{ id: "mountain-herb", label: "Mountain herbs" }] : [];
    const cover = clamp01(trees.length * 0.14 + shrubs.length * 0.06 + grasses.length * 0.05 + mosses.length * 0.03 - snow * 0.1);
    const water = clamp01(waterRoll * 0.32 + moisture * 0.28 + (zone === "alpine" || zone === "nival" ? 0.1 : 0) - snow * 0.08);
    const spring = clamp01(water * 0.62 + waterRoll * 0.28);
    const stream = clamp01(water * 0.7 + valley * 0.2);
    const waterfall = clamp01(stream * 0.44 + slope * 0.3);
    const lake = clamp01(water * 0.52 + plateau * 0.24 + (1 - slope) * 0.12);
    const glacier = clamp01(permanentIce * 0.9 + northness * 0.12);
    const meltwater = clamp01(glacier * 0.72 + snow * 0.28);
    const snowfield = clamp01(snow * 0.9 + climateSnow * 0.2);
    const iceCave = clamp01(glacier * 0.52 + caveRoll * 0.32);
    const frozenFalls = clamp01(waterfall * 0.44 + (season === "winter" ? 0.3 : 0));
    const ore = clamp01(smoothstep(0.32, 0.82, relative) * (0.28 + oreRoll * 0.66));
    const gems = clamp01((rockType === "granite" || rockType === "marble" ? 0.2 : 0.08) + gemRoll * 0.44 + relative * 0.16);
    const salt = clamp01(saltRoll * 0.5 + (rockType === "limestone" ? 0.16 : 0) + (1 - moisture) * 0.22);
    const forestCover = clamp01(trees.length * 0.2 + (zone === "lower" || zone === "montane" ? 0.18 : 0));
    const avalanche = clamp01(snow * 0.6 + slope * 0.38 - forestCover * 0.45 + (weather === "storm" ? 0.1 : 0));
    const movement = clamp01(0.9 - slope * 0.48 - relative * 0.18 - snow * 0.1
        + (use.road ? 0.28 : 0) + (use.bridge ? 0.16 : 0) + (use.terraced ? 0.06 : 0));
    const transport = clamp01(0.28 + slope * 0.44 + snow * 0.18 - (use.road ? 0.2 : 0) - (use.bridge ? 0.12 : 0));
    const supply = clamp01(0.65 - relative * 0.26 - snow * 0.14 - avalanche * 0.08 + (use.road ? 0.22 : 0) + (use.aqueduct ? 0.04 : 0));
    const defence = clamp01(0.32 + cliff * 0.28 + smoothstep(0.35, 0.8, relative) * 0.2 + (use.fortress ? 0.18 : 0) + (use.fortifiedPass ? 0.14 : 0));
    const mountainTroops = clamp01(0.16 + relative * 0.3
        + (zone === "subalpine" || zone === "alpine" || zone === "nival" ? 0.1 : 0)
        + (use.terraced ? 0.08 : 0));
    const settlement = clamp01((1 - relative) * 0.58 + (1 - slope) * 0.3 + moisture * 0.12 + (use.valleySettlement ? 0.18 : 0) + (use.terraced ? 0.12 : 0) - snow * 0.1);
    const terraced = clamp01((1 - relative) * 0.44 + slope * 0.22 + (use.terraced ? 0.34 : 0));
    const passScore = clamp01(pass * 0.82 + (use.fortifiedPass ? 0.2 : 0));
    const minePotential = clamp01(ore * 0.8 + gems * 0.22 + (use.mine ? 0.2 : 0));
    const quarryPotential = clamp01(rock * 0.78 + (use.quarry ? 0.2 : 0));
    const aqueductPotential = clamp01(spring * 0.7 + (use.aqueduct ? 0.3 : 0));
    const fauna = buildFauna(seed, x, y, { season, zone, cover: forestCover, snow, rock, water });
    const goods = buildGoods(seed, x, y, {
        season, rockType, rock, ore, gems, salt, trees, herbs, water, snow, cover: forestCover, zone,
    });

    const ground = mixColour([93, 91, 81], [143, 139, 124], clamp01(rock * 0.55 + scree * 0.2 + 0.1));
    const grassColour = mixColour([99, 112, 73], [139, 139, 97], clamp01(1 - relative + moisture * 0.2));
    const rockColour = rockType === "granite" ? "#8b8175" : rockType === "limestone" ? "#a9a28b"
        : rockType === "slate" ? "#5f6667" : "#b8b0a2";
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.16) * 0.64);
    const shadow = clamp01(northness * 0.22 + cliff * 0.18);
    const openLight = clamp01(sunlight * (0.72 + (1 - snow) * 0.22));
    const cloud = clamp01((zone === "alpine" || zone === "nival" ? 0.24 : 0.08) + moisture * 0.18 + (weather === "fog" ? 0.38 : 0));
    const treeline = treeLine;
    const crevice = clamp01(cliff * 0.5 + (1 - roughness) * 0.16);
    const boulders = clamp01(scree * 0.7 + rock * 0.2);
    const cave = caveRoll > 0.76;
    const overhang = caveRoll > 0.86;
    const treelineVariation = clamp01(Math.abs(treeLine - 0.42) * 3
        + (aspectName === "north" ? 0.15 : aspectName === "south" ? 0.08 : 0));
    const broadleaf = trees.some(tree => tree.kind === "broadleaf");
    const conifer = trees.some(tree => tree.kind === "conifer");
    const rarePlant = flowers.some(flower => flower.rare);
    const faunaIds = new Set(fauna.map(entry => entry.id));
    const goodIds = new Set(goods.map(entry => entry.id));
    const features = new Set();
    // A feature is emitted only when the tile actually has the terrain, water,
    // plant, animal, resource or effect. The old formation checklists made a
    // cave appear on every "sheer wall" and a glacier on every jagged peak,
    // which made the requirement survey green without matching the renderer.
    const add = (numberId, present = true) => { if (present) features.add("1.2.12." + numberId); };
    add(1, relative < 0.3);
    add(2, relative >= 0.55);
    add(3, formation.id === "jagged-peaks" || (relative > 0.72 && cliff > 0.42));
    add(4, formation.id === "rounded-summits");
    add(5, cliff > 0.42);
    add(6, ridgeRoll > 0.5 || formation.id === "ridges");
    add(7, valley > 0.52);
    add(8, gorge > 0.48);
    add(9, plateau > 0.42);
    add(10, formation.id === "isolated-massif");
    add(11, trees.length > 0 && relative < 0.3);
    add(12, trees.length > 0 && broadleaf && (zone === "lower" || zone === "montane"));
    add(13, trees.length > 0 && conifer && zone === "subalpine");
    add(14, grasses.length > 0 && relative >= 0.52);
    add(15, rock > 0.42 || scree > 0.36);
    add(16, snow > 0.26);
    add(17, permanentIce > 0.3);
    add(18, treelineVariation > 0.1 || use.terraced);
    add(19, rockType === "granite" && rock > 0.26);
    add(20, rockType === "limestone" && rock > 0.26);
    add(21, rockType === "slate" && rock > 0.24);
    add(22, boulders > 0.38);
    add(23, scree > 0.32);
    add(24, cliff > 0.28 && rock > 0.24);
    add(25, crevice > 0.3);
    add(26, cave);
    add(27, rock > 0.18);
    add(28, trees.length > 0);
    add(29, (zone === "subalpine" || zone === "alpine") && shrubs.length > 0);
    add(30, grasses.length > 0);
    add(31, flowers.length > 0);
    add(32, mosses.length > 0);
    add(33, rarePlant);
    add(34, rock > 0.38 && cover < 0.16);
    add(35, snow > 0.1 && snow < 0.66);
    add(36, spring > 0.22);
    add(37, stream > 0.28);
    add(38, waterfall > 0.32);
    add(39, lake > 0.4);
    add(40, glacier > 0.4);
    add(41, meltwater > 0.28);
    add(42, snowfield > 0.34);
    add(43, iceCave > 0.3 || frozenFalls > 0.38);
    add(44, faunaIds.has("ibex") || faunaIds.has("chamois"));
    add(45, faunaIds.has("marmot"));
    add(46, faunaIds.has("golden-eagle") || faunaIds.has("vulture"));
    add(47, faunaIds.has("fox"));
    add(48, faunaIds.has("wolf") || faunaIds.has("lynx"));
    add(49, faunaIds.has("ptarmigan"));
    add(50, faunaIds.has("snow-vole") || faunaIds.has("mountain-hare"));
    add(51, goodIds.has("stone") || goodIds.has("granite") || goodIds.has("limestone") || goodIds.has("slate") || goodIds.has("marble"));
    add(52, ore > 0.24 || goodIds.has("iron-ore") || goodIds.has("copper-ore"));
    add(53, gems > 0.38 || goodIds.has("gemstones"));
    add(54, salt > 0.34 || goodIds.has("salt"));
    add(55, herbs.length > 0);
    add(56, water > 0.18);
    add(57, trees.length > 0 && zone !== "nival");
    add(58, cover > 0.2 || goodIds.has("game") || goodIds.has("fur"));
    add(59, gems > 0.4 || ore > 0.55);
    add(60, movement < 0.72);
    add(61, slope > 0.52);
    add(62, cliff > 0.34 || scree > 0.5);
    add(63, passScore > 0.45);
    add(64, defence > 0.5);
    add(65, transport > 0.55);
    add(66, avalanche > 0.34);
    add(67, supply < 0.5);
    add(68, mountainTroops > 0.45);
    add(69, use.terraced);
    add(70, use.valleySettlement);
    add(71, use.fortress);
    add(72, use.fortifiedPass);
    add(73, use.road);
    add(74, use.bridge);
    add(75, use.mine);
    add(76, use.quarry);
    add(77, use.aqueduct);

    return {
        biome: "mountain", mountain: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate: context.climate || "mountain", moisture, temperature, height,
        features: MOUNTAIN_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            relative, aboveSea, altitudeM: Math.round(relative * 3200), slope, relief: roughness,
            ridge: clamp01(smoothstep(0.52, 0.86, ridgeRoll) + relative * 0.18), valley: clamp01(valley + gorge * 0.2),
            gorge, cliff, scree, boulders, plateau,
            cave, overhang, crevice,
            aspect, aspectName, northness, rock, rockType, treeline, treeLineVariation: treelineVariation, snowLine,
            label: zone === "nival" ? "nival rock and ice" : cliff > 0.55 ? "sheer rock face"
                : gorge > 0.55 ? "gorge floor" : plateau > 0.5 ? "open plateau"
                : valley > 0.55 ? "sheltered valley" : "mountain slope",
        },
        soil: {
            rock, scree, thinSoil: clamp01(0.5 - grassCoverFor(cover) * 0.3 - trees.length * 0.04),
            erosion: clamp01(slope * 0.5 + snow * 0.16 + (1 - cover) * 0.18),
            stability: clamp01(0.7 - slope * 0.34 - scree * 0.18 + (use.terraced ? 0.12 : 0)),
            minerals: clamp01(ore * 0.72 + gems * 0.2 + rock * 0.1), salt,
            permafrost: clamp01(relative > 0.7 ? 0.45 + snow * 0.3 : 0.06), organic: clamp01(cover * 0.4 + moisture * 0.12),
        },
        water: {
            spring, stream, waterfall, lake, glacier, meltwater, snowfield, iceCave, frozenFalls,
            water: clamp01(spring * 0.6 + lake * 0.24 + stream * 0.16), snow, ice: permanentIce,
            avalanche, supply: clamp01(water * 0.7 + (use.aqueduct ? 0.24 : 0)),
            waterLineM: Math.round(clamp01(0.58 - snow * 0.2) * 3200),
            label: glacier > 0.5 ? "glacier and meltwater" : lake > 0.5 ? "mountain tarn"
                : waterfall > 0.5 ? "falling stream" : spring > 0.4 ? "spring-fed stream" : "thin snowmelt",
        },
        vegetation: {
            trees, shrubs, grasses, flowers, mosses, herbs,
            density: cover, cover, bloom: clamp01((season === "summer" ? 0.82 : season === "spring" ? 0.5 : 0.12) * (1 - snow * 0.4)),
            forestCover, treeline, krummholz: clamp01(zone === "subalpine" ? 0.5 + shrubs.length * 0.08 : 0.12),
            rarePlants: clamp01(flowers.some(flower => flower.rare) ? 0.4 + flowers.length * 0.08 : 0.08),
        },
        climate: {
            snow, ice: permanentIce, zone, treeline, snowLine, climateSnow,
            exposure: clamp01(relative * 0.5 + (aspectName === "north" ? 0.2 : 0) + wind * 0.12),
            wind: clamp01(wind * 0.3), sunlight, cloud, shadow,
        },
        fauna, goods,
        economy: {
            stone: clamp01(rock * 0.8), granite: rockType === "granite" ? rock : 0, limestone: rockType === "limestone" ? rock : 0,
            slate: rockType === "slate" ? rock : 0, marble: rockType === "marble" ? rock : 0,
            ore, metals: ore, gems, salt, herbs: clamp01(herbs.length * 0.2 + flowers.length * 0.08),
            water: clamp01(spring * 0.7 + lake * 0.2), timber: clamp01(trees.length * 0.2 + forestCover * 0.2),
            hunting: clamp01(fauna.length * 0.08 + cover * 0.24), rareMinerals: clamp01(gems * 0.5 + ore * 0.18),
            terraced, settlement, defence, pass: passScore, mine: minePotential, quarry: quarryPotential,
            aqueduct: aqueductPotential, development: clamp01(0.3 + settlement * 0.4 + (use.road ? 0.16 : 0) - snow * 0.06),
            carryingCapacity: clamp01(0.24 + settlement * 0.5 - slope * 0.12),
        },
        hazards: {
            movement, steepCrossing: slope, cliff, passability: clamp01(1 - cliff * 0.55 - scree * 0.16 + (use.road ? 0.2 : 0) + (use.bridge ? 0.18 : 0)),
            pass: passScore, defenderBonus: defence, transport, avalanche, supply,
            orientation: clamp01(0.24 + snow * 0.24 + cloud * 0.28 + cliff * 0.18),
            mountainTroops, rockfall: clamp01(scree * 0.5 + slope * 0.24),
        },
        workPotential: { terrace: terraced, village: settlement, fort: defence, passFort: passScore, road: clamp01(slope * 0.7), bridge: gorge, mine: minePotential, quarry: quarryPotential, aqueduct: aqueductPotential },
        use,
        visual: {
            sunlight, openLight, shadow, snow, ice: permanentIce, cloud, wind: clamp01(wind * 0.3), windSway: clamp01(0.12 + wind * 0.18 + snow * 0.1),
            rockColour, groundHex: hexColour(ground), grassHex: hexColour(grassColour), rockHex: rockColour,
            snowHex: "#e4e7e2", iceHex: "#b9d2d5", waterHex: "#55777a", skyHex: "#aab8c4",
            lightHex: hexColour(mixColour([183, 190, 181], [235, 231, 211], sunlight)),
            lightMood: snow > 0.45 ? "snow-bright" : cliff > 0.5 ? "stone-shadow" : trees.length ? "wooded" : "open",
        },
        grassHex: hexColour(grassColour), groundHex: hexColour(ground), leafColour: trees[0]?.seasonColour || hexColour(grassColour),
        sward: { height: grasses.length ? "short" : "sparse", density: clamp01(cover * 0.6) },
        trees, treeChance: trees.length ? clamp01(0.42 + cover * 0.4) : 0,
        seasonalNote: `${formation.label} · ${Math.round(relative * 100)}% relief · ${Math.round(snow * 100)}% snow · ${goods[0]?.label || "bare rock"}`,
    };
}

function grassCoverFor(cover) {
    return clamp01(cover * 0.7);
}

function formationWall(slope, roughness) {
    return slope > 0.74 && roughness > 0.45;
}

function riverPotential(hash) {
    return (hash % 997) / 997;
}

export function mountainGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "alpine-flower") return season === "spring" || season === "summer";
        return true;
    });
}

export function mountainProductsAt(x, y, context = {}) {
    if (!isMountainSite(x, y, context)) return null;
    const profile = mountainProfileAt(x, y, context);
    if (!profile?.mountain) return null;
    const goods = mountainGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length && !profile.fauna.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function mountainSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const works = ["terraced", "valleySettlement", "fortress", "fortifiedPass", "road", "bridge", "mine", "quarry", "aqueduct"]
        .filter(key => profile.use?.[key]);
    return `${profile.label} · ${profile.landform.label} · ${goods} · ${wildlife}`
        + (works.length ? " · works: " + works.join(", ") : "");
}

export function mountainRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export function mountainRequirementAudit(profile) {
    const present = new Set(profile?.features || []);
    return MOUNTAIN_REQUIREMENTS.map(requirement => ({ ...requirement, present: present.has(requirement.id) }));
}

export const MOUNTAIN_LIMITS = Object.freeze({
    requirements: MOUNTAIN_REQUIREMENTS.length,
    formations: Object.keys(MOUNTAIN_FORMATIONS).length,
    maxFauna: 8,
    maxFlowers: 5,
    maxGoods: 9,
    trees: Object.keys(MOUNTAIN_TREES).length,
});
