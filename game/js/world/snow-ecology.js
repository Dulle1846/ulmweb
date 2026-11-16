// Snowland ecology (spec 1.2.15.1–1.2.15.69).
//
// Snow is a landscape with its own material, not a white recolour of tundra.
// One deterministic profile derived from seed, height, slope, aspect, season,
// weather, wind and shelter drives the renderer, survey, gathering, movement,
// supply, frostbite risk, avalanches and the spring thaw. No per-tile mutable
// state and no second tick loop are introduced.
import { seasonalState } from "./season.js";

const req = (id, key, label, group) => ({ id: "1.2.15." + id, key, label, group });

export const SNOW_REQUIREMENTS = Object.freeze([
    req(1, "snowy-forests", "Snowy forests", "landform"),
    req(2, "open-snowfields", "Open snowfields", "landform"),
    req(3, "snow-grasslands", "Snow-covered grasslands", "landform"),
    req(4, "alpine-snowfields", "Alpine snowfields", "landform"),
    req(5, "frozen-plateaus", "Frozen high plateaus", "landform"),
    req(6, "frozen-valleys", "Frozen valleys", "landform"),
    req(7, "wind-blown-snow", "Wind-blown snow surfaces", "landform"),
    req(8, "permanent-snow", "Permanent snow regions", "landform"),
    req(9, "snowy-coasts", "Snow-covered coastal landscapes", "landform"),
    req(10, "fresh-powder", "Fresh powder snow", "surface"),
    req(11, "packed-snow", "Compacted snow", "surface"),
    req(12, "icy-snow", "Icy snow", "surface"),
    req(13, "wet-snow", "Wet snow", "surface"),
    req(14, "drifts", "Wind drifts", "surface"),
    req(15, "snow-mounds", "Snow mounds", "surface"),
    req(16, "exposed-ground", "Exposed ground patches", "surface"),
    req(17, "snow-depths", "Different snow depths", "surface"),
    req(18, "tracks", "Tracks and footprint patterns", "surface"),
    req(19, "building-drifts", "Drifts against buildings and rocks", "surface"),
    req(20, "frozen-lakes", "Frozen lakes", "water"),
    req(21, "frozen-rivers", "Frozen rivers", "water"),
    req(22, "icicles", "Icicles", "water"),
    req(23, "ice-sheets", "Ice sheets", "water"),
    req(24, "icefalls", "Small icefalls", "water"),
    req(25, "icy-rocks", "Icy rocks", "water"),
    req(26, "frost-patterns", "Frost patterns", "water"),
    req(27, "ice-edges", "Ice edges along waters", "water"),
    req(28, "spring-ice-breakup", "Breaking ice in spring", "water"),
    req(29, "snowy-conifers", "Snow-laden conifers", "vegetation"),
    req(30, "bare-deciduous", "Leafless deciduous trees", "vegetation"),
    req(31, "snow-covered-shrubs", "Snow-covered shrubs", "vegetation"),
    req(32, "winter-grasses", "Low winter grasses", "vegetation"),
    req(33, "exposed-lichen-moss", "Exposed lichens and mosses", "vegetation"),
    req(34, "plants-under-snow", "Plants beneath the snow", "vegetation"),
    req(35, "sheltered-vegetation", "Visible vegetation in wind-sheltered places", "vegetation"),
    req(36, "snow-loads", "Different snow loads on plants", "vegetation"),
    req(37, "winter-fur", "Animals with winter coats", "fauna"),
    req(38, "ptarmigan", "Ptarmigan", "fauna"),
    req(39, "foxes", "Foxes", "fauna"),
    req(40, "wolves", "Wolves", "fauna"),
    req(41, "winter-herbivores", "Deer and other winter-active herbivores", "fauna"),
    req(42, "subnivean-animals", "Small animals beneath the snow", "fauna"),
    req(43, "migrations", "Seasonal animal migrations", "fauna"),
    req(44, "hibernation", "Hibernation and rest periods", "fauna"),
    req(45, "snowfall-intensity", "Snowfall of varying intensity", "weather"),
    req(46, "snowstorms", "Snowstorms", "weather"),
    req(47, "icy-wind", "Icy wind", "weather"),
    req(48, "fog", "Fog", "weather"),
    req(49, "frost", "Frost", "weather"),
    req(50, "hoarfrost", "Hoarfrost", "weather"),
    req(51, "blizzards", "Blizzards", "weather"),
    req(52, "visibility-loss", "Obstructed visibility", "weather"),
    req(53, "winter-sky", "Alternating clear and overcast winter sky", "weather"),
    req(54, "deep-snow-movement", "Higher movement cost in deep snow", "hazard"),
    req(55, "icy-roads", "Icy roads and paths", "hazard"),
    req(56, "supply-restriction", "Restricted supply", "hazard"),
    req(57, "frostbite", "Risk of frostbite", "hazard"),
    req(58, "blizzard-visibility", "Snowstorms with loss of visibility", "hazard"),
    req(59, "avalanche", "Avalanche danger in the mountains", "hazard"),
    req(60, "frozen-springs", "Frozen water sources", "hazard"),
    req(61, "pass-closures", "Seasonal closure of passes", "hazard"),
    req(62, "winter-resilience", "Different winter resilience of buildings and units", "hazard"),
    req(63, "spring-melt", "Spring snowmelt", "thaw"),
    req(64, "thawed-ground", "Exposed ground after the thaw", "thaw"),
    req(65, "muddy-roads", "Muddy roads", "thaw"),
    req(66, "swollen-rivers", "Swollen rivers", "thaw"),
    req(67, "meltwater-lakes", "Temporary meltwater lakes", "thaw"),
    req(68, "elevation-sun-retreat", "Snow retreat by elevation and sunlight", "thaw"),
    req(69, "north-south-melt", "Different melt speeds on north and south slopes", "thaw"),
]);

export const SNOW_REQUIREMENT_IDS = Object.freeze(SNOW_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(SNOW_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const SNOW_FORMATIONS = Object.freeze({
    "snow-forest": Object.freeze({
        id: "snow-forest", label: "Snowy forest",
        note: "snow-laden spruce and pine above a buried floor, with bare birch and aspen between them",
        trees: ["snow-spruce", "snow-pine", "bare-birch", "bare-aspen"],
        shrubs: ["snow-willow", "juniper"], grasses: ["winter-sedge", "fescue"], lichens: ["reindeer-lichen"],
    }),
    "open-snowfield": Object.freeze({
        id: "open-snowfield", label: "Open snowfield",
        note: "a broad, windswept field of deep snow with low hummocks and exposed grass tips",
        trees: [], shrubs: ["snow-willow"], grasses: ["winter-sedge", "fescue"], lichens: ["crustose-lichen"],
    }),
    "snow-grassland": Object.freeze({
        id: "snow-grassland", label: "Snow-covered grassland",
        note: "buried winter grass, seed heads and low shrubs emerging through a shallow snow cover",
        trees: [], shrubs: ["snow-willow", "bearberry"], grasses: ["winter-sedge", "bluegrass", "fescue"], lichens: ["reindeer-lichen"],
    }),
    "alpine-snowfield": Object.freeze({
        id: "alpine-snowfield", label: "Alpine snowfield",
        note: "high, wind-scoured snow above the tree line, broken by rock and ice",
        trees: [], shrubs: [], grasses: ["fescue"], lichens: ["crustose-lichen"],
    }),
    "frozen-plateau": Object.freeze({
        id: "frozen-plateau", label: "Frozen plateau",
        note: "a flat highland of hard-packed snow, shallow melt pools and frost-cracked ground",
        trees: [], shrubs: ["bearberry"], grasses: ["fescue"], lichens: ["crustose-lichen"],
    }),
    "frozen-valley": Object.freeze({
        id: "frozen-valley", label: "Frozen valley",
        note: "a sheltered valley floor under deep snow, with a frozen stream and snow-laden trees",
        trees: ["snow-spruce", "bare-birch"], shrubs: ["snow-willow"], grasses: ["winter-sedge"], lichens: ["feather-moss"],
    }),
    "wind-scoured-snow": Object.freeze({
        id: "wind-scoured-snow", label: "Wind-scoured snow",
        note: "bare ice and exposed ground where the wind has stripped the snow into long drifts",
        trees: [], shrubs: [], grasses: ["fescue"], lichens: ["crustose-lichen"],
    }),
    "permanent-snow": Object.freeze({
        id: "permanent-snow", label: "Permanent snow",
        note: "year-round snow and old ice above the permanent snow line",
        trees: [], shrubs: [], grasses: [], lichens: [],
    }),
    "snowy-coast": Object.freeze({
        id: "snowy-coast", label: "Snowy coast",
        note: "a frozen shore of snow-covered shingle, ice-footed rocks and a pale frozen sea",
        trees: [], shrubs: ["snow-willow"], grasses: ["fescue"], lichens: ["crustose-lichen"],
    }),
    "frozen-lake": Object.freeze({
        id: "frozen-lake", label: "Frozen lake",
        note: "a lake sealed under grey-white ice, with pressure ridges and wind-blown snow",
        trees: [], shrubs: [], grasses: [], lichens: [],
    }),
    "frozen-river": Object.freeze({
        id: "frozen-river", label: "Frozen river",
        note: "a river locked under ice, its banks buried and its channel marked by snow-lined cracks",
        trees: [], shrubs: ["snow-willow"], grasses: ["winter-sedge"], lichens: [],
    }),
    "drift-field": Object.freeze({
        id: "drift-field", label: "Drift field",
        note: "long, sculpted snowdrifts with a hard wind crust and deep lee-side hollows",
        trees: [], shrubs: ["bearberry"], grasses: ["fescue"], lichens: ["reindeer-lichen"],
    }),
    "exposed-ground": Object.freeze({
        id: "exposed-ground", label: "Exposed ground",
        note: "wind-stripped earth, frozen moss and bare stones between patches of old snow",
        trees: [], shrubs: ["bearberry"], grasses: ["fescue"], lichens: ["crustose-lichen", "feather-moss"],
    }),
    "rocky-snow": Object.freeze({
        id: "rocky-snow", label: "Rocky snow",
        note: "icy outcrops and frost-shattered boulders holding snow on their windward faces",
        trees: [], shrubs: ["juniper"], grasses: [], lichens: ["crustose-lichen"],
    }),
    "frozen-marsh": Object.freeze({
        id: "frozen-marsh", label: "Frozen marsh",
        note: "a frozen fen of dead reeds, ice patches and snow-covered tussocks",
        trees: [], shrubs: ["snow-willow"], grasses: ["winter-sedge", "reed"], lichens: ["feather-moss"],
    }),
    "snowbound-pass": Object.freeze({
        id: "snowbound-pass", label: "Snowbound pass",
        note: "a high pass choked by drift and avalanche debris, open only in the brief summer",
        trees: [], shrubs: [], grasses: ["fescue"], lichens: ["crustose-lichen"],
    }),
    "powder-basin": Object.freeze({
        id: "powder-basin", label: "Powder basin",
        note: "a sheltered basin of deep, light powder snow behind a wind-scoured rim",
        trees: ["snow-spruce"], shrubs: ["snow-willow"], grasses: ["winter-sedge"], lichens: ["feather-moss"],
    }),
});

export const SNOW_TREES = Object.freeze({
    "snow-spruce": Object.freeze({
        id: "snow-spruce", label: "Snow-laden spruce", kind: "conifer", heightMeters: 18, crown: 0.58,
        colours: { spring: "#4b6152", summer: "#425846", autumn: "#4b5f4b", winter: "#45564a" },
        goods: ["firewood", "resin"], snowLoad: 0.82,
    }),
    "snow-pine": Object.freeze({
        id: "snow-pine", label: "Snow-laden pine", kind: "conifer", heightMeters: 16, crown: 0.52,
        colours: { spring: "#59684c", summer: "#4b5f45", autumn: "#596346", winter: "#4d5b49" },
        goods: ["firewood", "resin"], snowLoad: 0.68,
    }),
    "bare-birch": Object.freeze({
        id: "bare-birch", label: "Bare birch", kind: "broadleaf", heightMeters: 11, crown: 0.44,
        colours: { spring: "#b6b4a0", summer: "#798a63", autumn: "#c0a76d", winter: "#a5a08e" },
        goods: ["firewood", "bark"], snowLoad: 0.32, bare: true,
    }),
    "bare-aspen": Object.freeze({
        id: "bare-aspen", label: "Bare aspen", kind: "broadleaf", heightMeters: 12, crown: 0.42,
        colours: { spring: "#b5b29c", summer: "#77865d", autumn: "#c1a568", winter: "#a9a491" },
        goods: ["firewood"], snowLoad: 0.26, bare: true,
    }),
});

export const SNOW_SHRUBS = Object.freeze({
    "snow-willow": Object.freeze({
        id: "snow-willow", label: "Snow-buried willow", colours: ["#777b65", "#a3a184"], goods: ["firewood"],
        snowLoad: 0.78,
    }),
    juniper: Object.freeze({
        id: "juniper", label: "Snow-laden juniper", colours: ["#4d604e", "#7e8b72"], goods: ["juniper-berries", "firewood"],
        snowLoad: 0.6,
    }),
    bearberry: Object.freeze({
        id: "bearberry", label: "Bearberry under snow", colours: ["#775f58", "#9c8978"], goods: ["berymeal"],
        snowLoad: 0.48,
    }),
});

export const SNOW_GRASSES = Object.freeze({
    "winter-sedge": Object.freeze({ id: "winter-sedge", label: "Winter sedge", colours: ["#9b9674", "#c5bd95"], goods: ["hay"], snowLoad: 0.62 }),
    fescue: Object.freeze({ id: "fescue", label: "Frosted fescue", colours: ["#8f9372", "#b9b89b"], goods: ["hay"], snowLoad: 0.44 }),
    bluegrass: Object.freeze({ id: "bluegrass", label: "Winter bluegrass", colours: ["#818b70", "#a9ab8c"], goods: ["hay"], snowLoad: 0.38 }),
    reed: Object.freeze({ id: "reed", label: "Frozen reed", colours: ["#a69b73", "#d0c49a"], goods: ["reed"], snowLoad: 0.7 }),
});

export const SNOW_LICHENS = Object.freeze({
    "reindeer-lichen": Object.freeze({ id: "reindeer-lichen", label: "Reindeer lichen", colours: ["#c9c7ab", "#e1dec7"], goods: ["lichen"] }),
    "crustose-lichen": Object.freeze({ id: "crustose-lichen", label: "Crustose lichen", colours: ["#a5aa99", "#c9cdbf"], goods: ["lichen"] }),
    "feather-moss": Object.freeze({ id: "feather-moss", label: "Frozen feather moss", colours: ["#6f8069", "#a8b29b"], goods: ["lichen"] }),
});

export const SNOW_FAUNA = Object.freeze({
    "winter-stoat": Object.freeze({ id: "winter-stoat", label: "Winter stoat", group: "fur", seasons: ["spring", "summer", "autumn", "winter"], winterFur: true }),
    ptarmigan: Object.freeze({ id: "ptarmigan", label: "Ptarmigan", group: "bird", seasons: ["spring", "summer", "autumn", "winter"], winterFur: true, groundBird: true }),
    fox: Object.freeze({ id: "fox", label: "Snow fox", group: "predator", seasons: ["spring", "summer", "autumn", "winter"], winterFur: true }),
    wolf: Object.freeze({ id: "wolf", label: "Wolf", group: "predator", seasons: ["spring", "summer", "autumn", "winter"], winterFur: true }),
    elk: Object.freeze({ id: "elk", label: "Winter elk", group: "herbivore", seasons: ["spring", "summer", "autumn", "winter"], winterFur: true, herd: true }),
    reindeer: Object.freeze({ id: "reindeer", label: "Reindeer", group: "herbivore", seasons: ["spring", "summer", "autumn", "winter"], winterFur: true, herd: true, migratory: true }),
    "snow-vole": Object.freeze({ id: "snow-vole", label: "Snow vole", group: "small", seasons: ["spring", "summer", "autumn", "winter"], subnivean: true }),
    lemming: Object.freeze({ id: "lemming", label: "Lemming", group: "small", seasons: ["spring", "summer", "autumn", "winter"], subnivean: true }),
    "migrating-goose": Object.freeze({ id: "migrating-goose", label: "Migrating goose", group: "migratory", seasons: ["spring", "autumn"], migratory: true }),
    bear: Object.freeze({ id: "bear", label: "Hibernating bear", group: "hibernator", seasons: ["spring", "summer", "autumn"], hibernates: true }),
});

export const SNOW_GOODS = Object.freeze({
    fish: Object.freeze({ id: "fish", label: "Ice fish", category: "food" }),
    "arctic-char": Object.freeze({ id: "arctic-char", label: "Arctic char", category: "food" }),
    cloudberry: Object.freeze({ id: "cloudberry", label: "Cloudberries", category: "food" }),
    game: Object.freeze({ id: "game", label: "Winter game", category: "hunt" }),
    fur: Object.freeze({ id: "fur", label: "Winter fur", category: "hunt" }),
    hides: Object.freeze({ id: "hides", label: "Hides", category: "hunt" }),
    firewood: Object.freeze({ id: "firewood", label: "Firewood", category: "wood" }),
    lichen: Object.freeze({ id: "lichen", label: "Lichen", category: "gather" }),
    peat: Object.freeze({ id: "peat", label: "Peat", category: "material" }),
    antler: Object.freeze({ id: "antler", label: "Antler", category: "material" }),
    qiviut: Object.freeze({ id: "qiviut", label: "Qiviut", category: "fibre" }),
    resin: Object.freeze({ id: "resin", label: "Resin", category: "material" }),
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
        settlement: Boolean(explicit.settlement || explicit.house || state === "settlement"),
        road: Boolean(explicit.road || state === "road"),
        bridge: Boolean(explicit.bridge || state === "bridge"),
        insulated: Boolean(explicit.insulated || state === "insulated"),
        stable: Boolean(explicit.stable || explicit.byre || state === "stable"),
        shelter: Boolean(explicit.shelter || state === "shelter"),
        cleared: Boolean(explicit.cleared || state === "cleared"),
        drained: Boolean(explicit.drained || state === "drained"),
        pass: Boolean(explicit.pass || state === "pass"),
        worked: Boolean(explicit.worked || state === "worked"),
    };
}

function chooseFormation(s) {
    if (s.water) return s.river ? "frozen-river" : "frozen-lake";
    // Order is a landscape decision, not a score: the coast is a coast even
    // when the sea ice is thick, a high pass stays a pass above the tree line,
    // and the permanent snow line is the last landform to claim a peak.
    if (s.coastal > 0.6) return "snowy-coast";
    if (s.permanent > 0.55) return "permanent-snow";
    if (s.plateau > 0.48) return "frozen-plateau";
    if (s.pass > 0.58) return "snowbound-pass";
    if (s.alpine > 0.55) return "alpine-snowfield";
    if (s.forest > 0.44) return s.shelter > 0.56 ? "powder-basin" : "snow-forest";
    if (s.marsh > 0.54) return "frozen-marsh";
    if (s.rock > 0.56) return "rocky-snow";
    if (s.exposed > 0.5) return "exposed-ground";
    if (s.drift > 0.52) return "drift-field";
    if (s.wind > 0.54) return "wind-scoured-snow";
    if (s.valley > 0.56 && s.relative < 0.48) return "frozen-valley";
    if (s.grass > 0.56 && s.snowDepth < 0.48) return "snow-grassland";
    // Deep, flat, unwooded ground is an open snowfield even when a buried
    // grass layer survives beneath it.
    if (s.snowDepth > 0.4 && s.relative < 0.55) return "open-snowfield";
    if (s.shelter > 0.58) return "powder-basin";
    return "open-snowfield";
}

function buildTrees(seed, x, y, formation, season, forest, shelter) {
    if (!formation.trees.length || forest < 0.32) return [];
    const chance = clamp01(0.18 + forest * 0.66 - shelter * 0.05);
    if (unit(seed, x, y, 0x534e4f57) > chance) return [];
    const trees = [];
    const count = chance > 0.72 && unit(seed, x, y, 0x534e4f58) > 0.42 ? 2 : 1;
    for (let index = 0; index < count; index++) {
        const definition = SNOW_TREES[pick(seed, x + index, y, formation.trees, 0x54524545 + index)];
        if (!definition) continue;
        trees.push({
            ...definition,
            offsetX: (unit(seed, x + index, y, 0x4f464653) - 0.5) * 0.48,
            offsetY: (unit(seed, x, y + index, 0x4f464654) - 0.5) * 0.24,
            scale: 0.72 + unit(seed, x, y + index, 0x5343414c) * 0.34,
            seasonColour: definition.colours[season] || definition.colours.winter,
            snowLoad: clamp01(definition.snowLoad * (0.65 + shelter * 0.45)),
            windBent: true,
            bare: Boolean(definition.bare || (definition.kind === "broadleaf" && season === "winter")),
            snowy: true,
        });
    }
    return trees;
}

function buildFlora(seed, x, y, formation, season, context) {
    const { snowDepth, exposure, shelter } = context;
    const shrubs = formation.shrubs.map(id => SNOW_SHRUBS[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x53485255 + index) > 0.24 + exposure * 0.16)
        .slice(0, 3);
    const grasses = formation.grasses.map(id => SNOW_GRASSES[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x47524153 + index) > 0.28 + Math.min(0.4, snowDepth * 0.22))
        .slice(0, 3);
    const lichens = formation.lichens.map(id => SNOW_LICHENS[id]).filter(Boolean)
        .filter((entry, index) => unit(seed, x, y, 0x4c494348 + index) > 0.18 + snowDepth * 0.08)
        .slice(0, 3);
    return { shrubs, grasses, lichens, shelter, exposed: exposure };
}

function buildFauna(seed, x, y, context) {
    const { season, forest, snowDepth, water, rock, shelter } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = SNOW_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(10, Math.round(count))) });
    };
    if (forest > 0.32 && unit(seed, x, y, 0x53544f41) > 0.44) add("winter-stoat");
    if ((shelter > 0.38 || forest > 0.42) && unit(seed, x, y, 0x50544152) > 0.48) add("ptarmigan", 2);
    if (unit(seed, x, y, 0x464f5832) > 0.58) add("fox");
    if (forest > 0.55 && snowDepth > 0.25 && unit(seed, x, y, 0x574f4c46) > 0.7) add("wolf");
    if ((forest > 0.26 || shelter > 0.42) && unit(seed, x, y, 0x454c4b32) > 0.4) add("elk", 3);
    if (forest > 0.3 && unit(seed, x, y, 0x5245494e) > 0.5) add("reindeer", 3);
    if (unit(seed, x, y, 0x564f4c45) > 0.4) add("snow-vole");
    if (unit(seed, x, y, 0x4c454d4d) > 0.62) add("lemming");
    if ((season === "spring" || season === "autumn") && unit(seed, x, y, 0x474f4f53) > 0.48) add("migrating-goose", 4);
    if (forest > 0.42 && season !== "winter" && unit(seed, x, y, 0x42454152) > 0.78) add("bear");
    if (water > 0.2 && unit(seed, x, y, 0x46495348) > 0.34) add("fish", 3);
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { water, forest, snowDepth, rocks, grass, game, season, use } = context;
    const goods = [];
    const add = (id, abundance) => {
        const definition = SNOW_GOODS[id];
        const amount = clamp01(abundance);
        if (!definition || amount <= 0.08 || goods.some(entry => entry.id === id)) return;
        goods.push({ ...definition, abundance: amount });
    };
    if (water > 0.2 && (season !== "winter" || use.cleared)) add("fish", 0.25 + water * 0.3);
    if (water > 0.2 && season === "winter" && use.cleared) add("arctic-char", 0.3);
    if (grass > 0.22) add("cloudberry", 0.12 + grass * 0.18);
    if (game > 0.24) add("game", 0.24 + game * 0.28);
    if (game > 0.35) add("hides", 0.18 + game * 0.16);
    if (game > 0.42) add("fur", 0.18 + game * 0.2);
    if (forest > 0.28) add("firewood", 0.2 + forest * 0.28);
    if (treeLichen(context)) add("lichen", 0.18 + snowDepth * 0.16);
    if (context.marsh > 0.4) add("peat", 0.22 + context.marsh * 0.2);
    if (game > 0.5) add("antler", 0.18);
    if (game > 0.55) add("qiviut", 0.14);
    if (forest > 0.4) add("resin", 0.14 + forest * 0.12);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

function treeLichen(context) {
    return context.forest > 0.25 || context.rocks > 0.3 || context.snowDepth > 0.4;
}

export function snowPotentialAt(x, y, context = {}) {
    const climate = context.climate || "temperate";
    if (climate !== "snow") return 0;
    const height = clamp01(context.height ?? 0.55);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height < seaLevel - 0.15) return 0;
    return clamp01(0.86 + unit(Number(context.seed) || 1, x, y, 0x534e4f57) * 0.14);
}

export function isSnowSite(x, y, context = {}) {
    return snowPotentialAt(x, y, context) > 0.24;
}

/** Complete, pure snow profile for one tile. */
export function snowProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const height = clamp01(context.height ?? 0.55);
    const seaLevel = number(context.seaLevel, 0.33);
    const moisture = clamp01(context.moisture ?? 0.55);
    const temperature = clamp01(context.temperature ?? 0.12);
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.15, Math.min(2.6, number(context.wind, 1)));
    const use = normalizeUse(context.use);
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, "snow");
    const aboveSea = height - seaLevel;
    const water = aboveSea < 0;
    const depth = Math.max(0, -aboveSea);
    const relative = clamp01(Math.max(0, aboveSea) / 0.5);
    const slopeRoll = coarse(seed, x, y, 5, 0x534c4f50);
    const ridgeRoll = coarse(seed, x, y, 7, 0x52494447);
    const valleyRoll = coarse(seed, x, y, 8, 0x56414c4c);
    const forestRoll = coarse(seed, x, y, 6, 0x464f5245);
    const rockRoll = coarse(seed, x, y, 4, 0x524f434b);
    const driftRoll = coarse(seed, x, y, 5, 0x44524946);
    const marshRoll = coarse(seed, x, y, 6, 0x4d415253);
    const aspectRoll = unit(seed, x, y, 0x41535054);
    const waterRoll = unit(seed, x, y, 0x57415452);
    const exposure = clamp01(wind * 0.2 + slopeRoll * 0.42 + relative * 0.22 - forestRoll * 0.28);
    const shelter = clamp01(1 - exposure * 0.72 - forestRoll * 0.24 + valleyRoll * 0.2);
    const slope = clamp01(0.12 + slopeRoll * 0.48 + ridgeRoll * 0.22 + relative * 0.26);
    const aspectName = aspectRoll < 0.25 ? "north" : aspectRoll < 0.5 ? "east" : aspectRoll < 0.75 ? "south" : "west";
    const northness = aspectName === "north" || aspectName === "west" ? 0.72 : 0.28;
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.16) * 0.64);
    const aspectSun = clamp01((northness < 0.5 ? 0.7 : 0.24) + sunlight * 0.3);
    const melt = clamp01((season === "spring" ? base.greenUp * 0.78 : season === "summer" ? 0.34 : 0.02)
        + aspectSun * 0.24 + Math.max(0, 0.28 - relative) * 0.18 - northness * 0.1);
    // Permanent snow is a true high-altitude belt, not a cold-season blanket.
    // A low valley can be below freezing all year and still lose its snow in
    // summer; only the high shoulders keep their snow through the melt.
    const permanent = clamp01(smoothstep(0.52, 0.9, relative) * 0.9
        + (temperature < 0.06 ? 0.12 : 0) + base.snowCover * 0.06 - melt * 0.32);
    const snowCoverage = clamp01(Math.min(1, base.snowCover * 0.82 + 0.22));
    const fresh = clamp01((weather === "snow" ? 0.62 : 0.18) + (season === "winter" ? 0.16 : 0) - wind * 0.08);
    const packed = clamp01(wind * 0.3 + (use.road ? 0.36 : 0) + (use.cleared ? 0.25 : 0) + slope * 0.12);
    const icy = clamp01((temperature < 0.18 ? 0.24 : 0) + (season === "winter" ? 0.2 : 0) + (use.road ? 0.18 : 0)
        + Math.max(0, 0.1 - moisture) * 0.3 + (weather === "storm" ? 0.12 : 0));
    const wet = clamp01((season === "spring" ? 0.38 : 0) + (weather === "rain" ? 0.3 : 0) + melt * 0.42 - icy * 0.2);
    const drift = clamp01(exposure * 0.62 + (weather === "storm" ? 0.22 : 0) + slope * 0.12);
    const mound = clamp01(drift * 0.72 + shelter * 0.24 + (use.settlement ? 0.12 : 0));
    const exposedGround = clamp01(exposure * 0.7 + slope * 0.24 + (season === "spring" ? melt * 0.28 : 0) - snowCoverage * 0.22);
    const snowDepth = clamp01(0.18 + snowCoverage * 0.38 + relative * 0.28 + (forestRoll > 0.6 ? 0.08 : 0)
        - exposure * 0.22 - melt * 0.3 + (season === "winter" ? 0.1 : 0));
    const depthM = Math.round((0.08 + snowDepth * 3.2 + Math.max(0, relative - 0.5) * 1.6) * 10) / 10;
    const forest = clamp01(forestRoll * 0.66 + moisture * 0.22 + shelter * 0.16 - relative * 0.22);
    const alpine = clamp01(smoothstep(0.34, 0.72, relative) * 0.88 + slope * 0.18);
    const plateau = clamp01(smoothstep(0.5, 0.8, relative) * (1 - slope) * 1.8);
    const valley = clamp01((1 - relative) * 1.2 + valleyRoll * 0.2);
    const coastal = clamp01(1 - smoothstep(0.005, 0.075, Math.max(0, aboveSea)));
    const rock = clamp01(rockRoll * 0.66 + slope * 0.3 + relative * 0.16);
    const marsh = clamp01(marshRoll * 0.72 + moisture * 0.3 + (relative < 0.035 ? 0.12 : 0) - exposure * 0.12);
    const grass = clamp01((1 - forest) * 0.64 + moisture * 0.16 + (1 - rock) * 0.18);
    const pass = clamp01((ridgeRoll > 0.55 ? 0.52 : 0.18) + relative * 0.42 + snowDepth * 0.16 - forest * 0.18);
    const river = water && waterRoll > 0.52;
    const formationId = chooseFormation({
        water, river, permanent, coastal, pass, alpine, plateau, valley, forest, marsh, rock,
        exposed: exposedGround, drift, wind: exposure, grass, shelter, relative, snowDepth,
    });
    const formation = SNOW_FORMATIONS[formationId];
    const trees = buildTrees(seed, x, y, formation, season, forest, shelter);
    const flora = buildFlora(seed, x, y, formation, season, { snowDepth, exposure, shelter });
    const cover = clamp01(trees.length * 0.18 + flora.shrubs.length * 0.08 + flora.grasses.length * 0.06
        + flora.lichens.length * 0.03 - snowDepth * 0.14);
    const tracks = clamp01((trees.length || forest > 0.24 ? 0.18 : 0.06) + (use.settlement ? 0.22 : 0) + snowDepth * 0.18);
    const snowLoad = clamp01(trees[0]?.snowLoad ?? flora.shrubs[0]?.snowLoad ?? snowDepth * 0.7);
    const snowLoadVariation = clamp01(Math.abs(snowLoad - (flora.grasses[0]?.snowLoad || 0)) * 1.5);
    const underSnow = clamp01(flora.grasses.length * 0.16 + flora.shrubs.length * 0.18 + snowDepth * 0.3 - exposedGround * 0.18);
    const shelterVegetation = clamp01(flora.shrubs.length * 0.2 + flora.grasses.length * 0.12 + shelter * 0.32 - exposure * 0.1);
    const fauna = buildFauna(seed, x, y, {
        season, forest, snowDepth, water: Math.max(water ? 0.7 : 0, water ? 1 : 0), rock, shelter,
    });
    const winterFur = fauna.some(entry => entry.winterFur);
    const migration = fauna.some(entry => entry.migratory) || (season === "spring" || season === "autumn");
    const hibernation = fauna.some(entry => entry.hibernates) || (season === "winter" && forest > 0.32);
    const game = clamp01(forest * 0.34 + grass * 0.2 + fauna.filter(entry => entry.group === "herbivore").length * 0.16);
    const goods = buildGoods(seed, x, y, {
        water: water ? 1 : 0, forest, snowDepth, rocks: rock, grass, game, season, use, marsh,
    });
    const snowIntensity = clamp01((weather === "snow" ? 0.58 : weather === "storm" ? 0.4 : 0.08)
        + (season === "winter" ? 0.16 : 0) + wind * 0.08);
    const snowstorm = clamp01((weather === "storm" ? 0.42 : 0) + wind * 0.2 + snowIntensity * 0.2 + drift * 0.16);
    const blizzard = clamp01(snowstorm * 0.68 + wind * 0.18 + (weather === "storm" ? 0.1 : 0));
    const fog = clamp01((hour < 9 || weather === "fog" ? 0.28 : 0.02) + moisture * 0.24 + snowIntensity * 0.08);
    const frost = clamp01((temperature < 0.22 ? (0.22 - temperature) * 2.1 : 0.1) + (hour < 7 || hour > 20 ? 0.24 : 0));
    const hoarfrost = clamp01(frost * 0.7 + moisture * 0.16 + (weather === "clear" ? 0.12 : 0));
    const visibility = clamp01(1 - blizzard * 0.74 - fog * 0.34 - snowIntensity * 0.18);
    const overcast = weather !== "clear" || snowIntensity > 0.3 || fog > 0.3;
    const icyRoads = clamp01(icy * 0.72 + packed * 0.2 + (use.road ? 0.25 : 0) - melt * 0.22);
    const supply = clamp01(0.92 - snowDepth * 0.38 - blizzard * 0.18 - pass * 0.12
        + (use.road ? 0.24 : 0) + (use.cleared ? 0.12 : 0) + (use.insulated ? 0.06 : 0));
    const frostbite = clamp01((0.1 - temperature) * 1.8 + wind * 0.12 + snowDepth * 0.14
        - (use.insulated ? 0.2 : 0) - (use.shelter ? 0.14 : 0));
    const avalanche = clamp01(snowDepth * 0.46 + slope * 0.42 + relative * 0.18 - forest * 0.28
        + (weather === "storm" ? 0.1 : 0));
    const frozenSprings = clamp01((water || moisture > 0.56 ? 0.35 : 0.1) + icy * 0.34 + relative * 0.12);
    const passClosed = clamp01(pass * 0.6 + snowDepth * 0.42 + (season === "winter" ? 0.2 : 0) - melt * 0.4);
    const winterHardiness = clamp01(0.42 + (use.insulated ? 0.28 : 0) + (use.stable ? 0.12 : 0)
        + (1 - snowDepth) * 0.12 + (1 - blizzard) * 0.12 - (1 - use.shelter ? 0.03 : 0));
    const springMelt = clamp01(melt * 0.88 + (season === "spring" ? base.greenUp * 0.22 : 0));
    const thawedGround = clamp01(exposedGround * 0.7 + springMelt * 0.4 - snowCoverage * 0.12);
    const muddyRoads = clamp01(springMelt * 0.62 + (use.road ? 0.2 : 0) + moisture * 0.12 - icy * 0.18);
    const swollenRivers = clamp01(springMelt * 0.62 + (water ? 0.26 : 0) + moisture * 0.2);
    const meltwaterLakes = clamp01(springMelt * 0.44 + (relative < 0.2 ? 0.2 : 0) + (marsh > 0.35 ? 0.18 : 0)
        + (valley > 0.4 ? 0.12 : 0));
    const snowRetreat = clamp01(springMelt * 0.7 + aspectSun * 0.18 + Math.max(0, 0.34 - relative) * 0.16);
    const northSouthMelt = clamp01(springMelt * (0.32 + northness * 0.24) + 0.12);
    const iceCover = clamp01(water ? 0.52 + icy * 0.42 - springMelt * 0.54 : 0);
    const iceEdge = clamp01(water ? 0.44 + (1 - depth) * 0.28 : 0);
    const breakup = clamp01(water ? springMelt * 0.86 : springMelt * 0.18);
    const icicles = clamp01((rock > 0.36 || use.settlement ? 0.34 : 0.08) + frost * 0.36 + slope * 0.18);
    const iceSheets = clamp01(water ? iceCover * 0.8 : 0);
    const icefalls = clamp01((!water && moisture > 0.5 ? 0.26 : 0) + slope * 0.28 + icy * 0.22);
    const icyRocks = clamp01(rock * 0.4 + icy * 0.42 + frost * 0.18);
    const frostPatterns = clamp01(frost * 0.62 + hoarfrost * 0.2 + (relative > 0.25 ? 0.08 : 0));
    const driftAtStructures = clamp01((use.settlement ? 0.44 : 0) + (rock > 0.35 ? 0.2 : 0) + drift * 0.32);
    const sunMeltDifference = clamp01(Math.abs(springMelt - northSouthMelt) * 1.4);

    const sunlightHex = sunlight > 0.5 ? "#e8edf1" : "#b5c5d1";
    const visual = {
        sunlight, sunlightHex,
        shadow: clamp01((1 - sunlight) * 0.12 + northness * 0.08),
        snowHex: icy > 0.35 ? "#c7d5dc" : wet > 0.3 ? "#dce4e4" : "#eef4f7",
        freshHex: "#f7fbfd", packedHex: "#d6e1e6", iceHex: "#a9c7d2", groundHex: "#5b5d52",
        rockHex: "#747a78", waterHex: iceCover > 0.35 ? "#b7d2da" : "#3f6c80",
        skyHex: overcast ? "#aebbc3" : "#c9dbe8", fogHex: "#c5d2d7",
        mood: blizzard > 0.5 ? "whiteout" : fog > 0.4 ? "fogbound" : snowstorm > 0.4 ? "storm-light"
            : wet > 0.3 ? "thaw" : fresh > 0.5 ? "powder-light" : "cold-light",
        wind: clamp01(wind * 0.36), windSway: clamp01(0.08 + wind * 0.14 + drift * 0.12),
        snowCover: snowCoverage, snowLoad,
    };

    const features = new Set();
    const add = (id, present = true) => { if (present) features.add("1.2.15." + id); };
    add(1, formationId === "snow-forest" || trees.some(tree => tree.kind === "conifer"));
    add(2, ["open-snowfield", "permanent-snow", "alpine-snowfield", "wind-scoured-snow", "drift-field"].includes(formationId));
    add(3, formationId === "snow-grassland");
    add(4, formationId === "alpine-snowfield" || alpine > 0.55);
    add(5, formationId === "frozen-plateau" || plateau > 0.5);
    add(6, formationId === "frozen-valley" || valley > 0.55);
    add(7, formationId === "wind-scoured-snow" || exposure > 0.38);
    add(8, formationId === "permanent-snow" || permanent > 0.48);
    add(9, formationId === "snowy-coast" || coastal > 0.45);
    add(10, fresh > 0.35);
    add(11, packed > 0.34);
    add(12, icy > 0.26);
    add(13, wet > 0.28);
    add(14, drift > 0.32);
    add(15, mound > 0.3);
    add(16, exposedGround > 0.22);
    add(17, snowDepth > 0.08);
    add(18, tracks > 0.2);
    add(19, driftAtStructures > 0.24);
    add(20, water && !river && iceCover > 0.3);
    add(21, water && river && iceCover > 0.3);
    add(22, icicles > 0.24);
    add(23, iceSheets > 0.3);
    add(24, icefalls > 0.28);
    add(25, icyRocks > 0.3);
    add(26, frostPatterns > 0.28);
    add(27, water && iceEdge > 0.3);
    add(28, water && breakup > 0.24);
    add(29, trees.some(tree => tree.kind === "conifer"));
    add(30, trees.some(tree => tree.kind === "broadleaf" && (tree.bare || season === "winter")));
    add(31, flora.shrubs.length > 0 && snowLoad > 0.24);
    add(32, flora.grasses.length > 0);
    add(33, flora.lichens.length > 0 && exposedGround > 0.15);
    add(34, underSnow > 0.22);
    add(35, shelterVegetation > 0.2);
    add(36, snowLoadVariation > 0.12);
    add(37, winterFur);
    add(38, fauna.some(entry => entry.id === "ptarmigan"));
    add(39, fauna.some(entry => entry.id === "fox"));
    add(40, fauna.some(entry => entry.id === "wolf"));
    add(41, fauna.some(entry => entry.group === "herbivore"));
    add(42, fauna.some(entry => entry.subnivean));
    add(43, migration);
    add(44, hibernation);
    add(45, snowIntensity > 0.1);
    add(46, snowstorm > 0.28);
    add(47, wind > 1.15 || exposure > 0.4);
    add(48, fog > 0.24);
    add(49, frost > 0.2);
    add(50, hoarfrost > 0.24);
    add(51, blizzard > 0.38);
    add(52, visibility < 0.72);
    add(53, true);
    add(54, snowDepth > 0.3 || slope > 0.4);
    add(55, icyRoads > 0.28);
    add(56, supply < 0.72);
    add(57, frostbite > 0.18);
    add(58, visibility < 0.58 && snowstorm > 0.25);
    add(59, avalanche > 0.28);
    add(60, frozenSprings > 0.3);
    add(61, passClosed > 0.32);
    add(62, winterHardiness > 0.42 || use.insulated || use.stable);
    add(63, springMelt > 0.2);
    add(64, thawedGround > 0.2);
    add(65, muddyRoads > 0.2);
    add(66, swollenRivers > 0.28);
    add(67, meltwaterLakes > 0.26);
    add(68, snowRetreat > 0.24);
    add(69, sunMeltDifference > 0.12);

    return {
        biome: "snow", snow: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate: context.climate || "snow", moisture, temperature, height,
        features: SNOW_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            aboveSea, depth, relative, slope, exposure, shelter, aspectName, northness,
            alpine, plateau, valley, coastal, rock, forest, marsh, grass, pass, permanent,
            label: water ? (river ? "frozen river" : "frozen lake") : formation.label.toLowerCase(),
        },
        surface: {
            fresh, packed, icy, wet, drift, mound, exposed: exposedGround,
            coverage: snowCoverage, depth: snowDepth, depthM, tracks,
            snowLoad, snowLoadVariation, underSnow, shelterVegetation,
            driftAtStructures, state: icy > 0.45 ? "ice" : wet > 0.42 ? "wet"
                : fresh > 0.45 ? "powder" : drift > 0.45 ? "drift"
                    : exposedGround > 0.42 ? "exposed" : "packed",
            label: icy > 0.45 ? "ice crust" : wet > 0.42 ? "wet snow"
                : fresh > 0.45 ? "fresh powder" : drift > 0.45 ? "wind drift" : "snow cover",
        },
        water: {
            frozen: water || iceCover > 0.4, lake: water && !river, river: water && river,
            iceCover, iceEdge, breakup, icicles, iceSheets, icefalls, icyRocks,
            frostPatterns, frozenSprings, meltwater: springMelt, meltwaterLakes,
            label: water ? (river ? "frozen river ice" : "frozen lake ice")
                : iceCover > 0.2 ? "ice-edged water" : "frozen ground",
        },
        vegetation: {
            trees, shrubs: flora.shrubs, grasses: flora.grasses, lichens: flora.lichens,
            cover, snowLoad, snowLoadVariation, underSnow, shelter: shelterVegetation,
            bareDeciduous: trees.some(tree => tree.kind === "broadleaf" && tree.bare),
            conifers: trees.filter(tree => tree.kind === "conifer"),
            windShelter: flora.shrubs.filter(entry => entry.id === "snow-willow"),
        },
        fauna,
        goods,
        weather: {
            snowIntensity, snowfall: snowIntensity, snowstorm, blizzard, wind, icyWind: wind > 1.15,
            fog, frost, hoarfrost, visibility, overcast, clear: !overcast,
            sky: overcast ? "overcast" : "clear winter sky",
        },
        hazards: {
            movement: clamp01(1 - snowDepth * 0.45 - icy * 0.24 - slope * 0.18 + (use.road ? 0.16 : 0)),
            deepSnow: snowDepth, icyRoads, supply, frostbite, avalanche, frozenSprings,
            passClosed, winterHardiness, visibility,
            passability: clamp01(1 - passClosed * 0.42 - avalanche * 0.28 - drift * 0.16 + (use.road ? 0.16 : 0)),
        },
        thaw: {
            springMelt, thawedGround, muddyRoads, swollenRivers, meltwaterLakes,
            snowRetreat, northSouthMelt, sunMeltDifference,
            aspect: aspectName, elevationMelt: clamp01(1 - relative) * springMelt,
        },
        economy: {
            game, fish: water ? clamp01(0.32 + moisture * 0.2) : 0,
            timber: clamp01(forest * 0.3), fuel: clamp01(forest * 0.36 + marsh * 0.18),
            fibres: clamp01(qiviutPotential(fauna)), food: clamp01(grass * 0.24 + game * 0.2),
            carryingCapacity: clamp01(0.16 + grass * 0.24 + forest * 0.16 - snowDepth * 0.12),
            winterHardiness,
        },
        use,
        visual,
        grassHex: "#8e9475", groundHex: "#6a6e63",
        trees,
        treeChance: trees.length ? clamp01(0.3 + forest * 0.4) : 0,
        seasonalNote: `${formation.label} · ${depthM} m snow · ${Math.round(snowCoverage * 100)}% cover · ${goods[0]?.label || "bare ice"}`,
    };
}

function qiviutPotential(fauna) {
    return fauna.some(entry => entry.id === "reindeer") ? 0.34 : fauna.some(entry => entry.winterFur) ? 0.16 : 0;
}

export function snowGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "cloudberry") return season !== "winter";
        if (good.id === "arctic-char") return season === "winter" || season === "spring";
        return true;
    });
}

export function snowProductsAt(x, y, context = {}) {
    if (!isSnowSite(x, y, context)) return null;
    const profile = snowProfileAt(x, y, context);
    if (!profile?.snow || profile.water.lake || profile.water.river) return null;
    const goods = snowGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length && !profile.fauna.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function snowSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const hazards = ["frostbite", "avalanche", "passClosed"]
        .filter(key => profile.hazards[key] > 0.3)
        .map(key => key === "passClosed" ? "pass closed" : key);
    return `${profile.label} · ${profile.surface.depthM} m snow · ${goods} · ${wildlife}`
        + (hazards.length ? " · " + hazards.join(", ") : "");
}

export function snowRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export function snowRequirementAudit(profile) {
    const present = new Set(profile?.features || []);
    return SNOW_REQUIREMENTS.map(requirement => ({ ...requirement, present: present.has(requirement.id) }));
}

export const SNOW_LIMITS = Object.freeze({
    requirements: SNOW_REQUIREMENTS.length,
    formations: Object.keys(SNOW_FORMATIONS).length,
    maxFauna: 8,
    maxGoods: 9,
    trees: Object.keys(SNOW_TREES).length,
});
