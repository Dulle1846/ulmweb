// Tundra ecology (spec 1.2.9.1–1.2.9.48).
//
// Tundra is not a cold meadow with the trees removed. Permafrost locks the
// subsoil, only a shallow active layer thaws in the short summer, frost forms
// polygons and cracks, and water collects in countless small hollows. Low
// grasses, sedges, dwarf shrubs, lichens, mosses and tiny willow/birch forms
// replace the woodland canopy. The same deterministic profile drives terrain,
// gathering, farm/stable surveys, movement costs and the shared good ledger.
//
// No per-tile state and no extra tick loop are added. Every caller supplies
// seed, terrain, season, weather and land-use inputs and receives a bounded,
// pure profile.

import { seasonalState } from "./season.js";

export const TUNDRA_REQUIREMENTS = Object.freeze([
    { id: "1.2.9.1", key: "moose-lichen", label: "Moose and lichens", group: "vegetation" },
    { id: "1.2.9.2", key: "low-grasses", label: "Low grasses", group: "vegetation" },
    { id: "1.2.9.3", key: "dwarf-shrubs", label: "Dwarf shrubs", group: "vegetation" },
    { id: "1.2.9.4", key: "small-willow-birch", label: "Small willow and birch forms", group: "vegetation" },
    { id: "1.2.9.5", key: "berry-shrubs", label: "Berry shrubs", group: "vegetation" },
    { id: "1.2.9.6", key: "low-herbs", label: "Low herbs", group: "vegetation" },
    { id: "1.2.9.7", key: "seasonal-flowers", label: "Seasonal flowering plants", group: "vegetation" },
    { id: "1.2.9.8", key: "no-tall-trees", label: "Few or no tall trees", group: "vegetation" },
    { id: "1.2.9.9", key: "permafrost", label: "Permanently or long-frozen ground", group: "soil" },
    { id: "1.2.9.10", key: "thawing-topsoil", label: "Thawing topsoil in summer", group: "soil" },
    { id: "1.2.9.11", key: "small-wetlands", label: "Small wetlands", group: "water" },
    { id: "1.2.9.12", key: "shallow-water", label: "Shallow water pools", group: "water" },
    { id: "1.2.9.13", key: "frost-soil", label: "Frost-formed soil structures", group: "soil" },
    { id: "1.2.9.14", key: "small-hills", label: "Small hills and hollows", group: "landform" },
    { id: "1.2.9.15", key: "frost-patterns", label: "Cracks and frost patterns", group: "soil" },
    { id: "1.2.9.16", key: "variable-stability", label: "Variable substrate stability", group: "soil" },
    { id: "1.2.9.17", key: "long-winter", label: "Long, cold winters", group: "climate" },
    { id: "1.2.9.18", key: "short-summer", label: "Short summers", group: "climate" },
    { id: "1.2.9.19", key: "short-growing-season", label: "Short growing season", group: "climate" },
    { id: "1.2.9.20", key: "spring-bloom", label: "Rapid spring bloom", group: "climate" },
    { id: "1.2.9.21", key: "thawing-soil", label: "Thawing soils", group: "soil" },
    { id: "1.2.9.22", key: "seasonal-water", label: "Seasonal water surfaces", group: "water" },
    { id: "1.2.9.23", key: "snow-outside-summer", label: "Frost and snow outside summer", group: "climate" },
    { id: "1.2.9.24", key: "colour-change", label: "Clear vegetation colour changes", group: "visual" },
    { id: "1.2.9.25", key: "cold-herbivores", label: "Reindeer and other cold-adapted herbivores", group: "fauna" },
    { id: "1.2.9.26", key: "arctic-fox", label: "Arctic foxes", group: "fauna" },
    { id: "1.2.9.27", key: "ground-birds", label: "Ptarmigan and ground birds", group: "fauna" },
    { id: "1.2.9.28", key: "small-rodents", label: "Small rodents", group: "fauna" },
    { id: "1.2.9.29", key: "large-predators", label: "Wolves and larger predators", group: "fauna" },
    { id: "1.2.9.30", key: "migratory-birds", label: "Migratory birds in the warm months", group: "fauna" },
    { id: "1.2.9.31", key: "summer-insects", label: "Insects during the short summer", group: "fauna" },
    { id: "1.2.9.32", key: "migratory-herds", label: "Migrating animal herds", group: "fauna" },
    { id: "1.2.9.33", key: "berries-hardy-plants", label: "Berries and hardy plants", group: "economy" },
    { id: "1.2.9.34", key: "pelts-hides", label: "Pelts and hides", group: "economy" },
    { id: "1.2.9.35", key: "meat", label: "Meat and animal products", group: "economy" },
    { id: "1.2.9.36", key: "bone-horn", label: "Bone and horn", group: "economy" },
    { id: "1.2.9.37", key: "fish", label: "Fish from rivers and lakes", group: "economy" },
    { id: "1.2.9.38", key: "peat", label: "Peat in suitable wetlands", group: "economy" },
    { id: "1.2.9.39", key: "stone-minerals", label: "Stone and mineral raw materials", group: "economy" },
    { id: "1.2.9.40", key: "adapted-livestock", label: "Specially adapted livestock", group: "economy" },
    { id: "1.2.9.41", key: "short-farming", label: "Short agricultural season", group: "economy" },
    { id: "1.2.9.42", key: "limited-building", label: "Limited building materials", group: "economy" },
    { id: "1.2.9.43", key: "difficult-soil", label: "Difficult soil conditions", group: "economy" },
    { id: "1.2.9.44", key: "hypothermia", label: "Danger from cold and hypothermia", group: "hazard" },
    { id: "1.2.9.45", key: "winter-mobility", label: "Reduced mobility in winter", group: "hazard" },
    { id: "1.2.9.46", key: "remote-supply", label: "Difficult supply of remote settlements", group: "economy" },
    { id: "1.2.9.47", key: "hunting-migration", label: "Seasonal hunting and migration economy", group: "economy" },
    { id: "1.2.9.48", key: "building-clothing", label: "Special building and clothing requirements", group: "economy" },
]);

export const TUNDRA_REQUIREMENT_IDS = Object.freeze(TUNDRA_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(TUNDRA_REQUIREMENTS.map(entry => [entry.id, entry])));
const SEASON_KEYS = Object.freeze(["spring", "summer", "autumn", "winter"]);

export const TUNDRA_FORMATIONS = Object.freeze({
    "moss-tundra": Object.freeze({
        id: "moss-tundra", label: "Moss tundra", height: "low",
        note: "a soft carpet of moss and sedge over shallow, wet hummocks",
        lichens: ["feather-moss", "reindeer-lichen"], grasses: ["tufted-sedge", "arctic-fescue"],
        shrubs: ["dwarf-willow"], herbs: ["labrador-tea"],
    }),
    "lichen-tundra": Object.freeze({
        id: "lichen-tundra", label: "Lichen tundra", height: "flat",
        note: "grey-white lichen crust on thin, wind-scoured ground",
        lichens: ["reindeer-lichen", "crustose-lichen"], grasses: ["arctic-fescue"],
        shrubs: ["crowberry"], herbs: ["arctic-thyme"],
    }),
    "dwarf-shrub-tundra": Object.freeze({
        id: "dwarf-shrub-tundra", label: "Dwarf-shrub tundra", height: "low",
        note: "low birch and willow scrub with a patchwork of moss and stone",
        lichens: ["reindeer-lichen"], grasses: ["alpine-bluegrass", "tufted-sedge"],
        shrubs: ["dwarf-birch", "dwarf-willow", "bearberry"], herbs: ["moss-campion"],
    }),
    "willow-thicket": Object.freeze({
        id: "willow-thicket", label: "Willow thicket", height: "low",
        note: "waist-high willow and birch forms sheltering a damp hollow",
        lichens: ["feather-moss"], grasses: ["tufted-sedge", "cotton-sedge"],
        shrubs: ["dwarf-willow", "dwarf-birch"], herbs: ["labrador-tea"],
    }),
    "berry-heath": Object.freeze({
        id: "berry-heath", label: "Berry heath", height: "low",
        note: "crowberry and bearberry mats on acidic, well-drained ground",
        lichens: ["crustose-lichen"], grasses: ["arctic-fescue", "alpine-bluegrass"],
        shrubs: ["crowberry", "bearberry", "dwarf-birch"], herbs: ["arctic-thyme"],
    }),
    "sedge-wetland": Object.freeze({
        id: "sedge-wetland", label: "Sedge wetland", height: "flat",
        note: "a small fen of sedges, cotton grass, moss and shallow open water",
        lichens: ["sphagnum-moss", "feather-moss"], grasses: ["cotton-sedge", "tufted-sedge"],
        shrubs: ["dwarf-willow"], herbs: ["labrador-tea"],
    }),
    "frost-polygon": Object.freeze({
        id: "frost-polygon", label: "Frost-polygon ground", height: "flat",
        note: "stone-rimmed polygons and cracked peat over frozen subsoil",
        lichens: ["reindeer-lichen", "crustose-lichen"], grasses: ["arctic-fescue", "cotton-sedge"],
        shrubs: ["dwarf-willow"], herbs: ["arctic-thyme"],
    }),
    "rocky-tundra": Object.freeze({
        id: "rocky-tundra", label: "Rocky tundra", height: "high",
        note: "bare stone, scree and wind-polished slabs above the shrub line",
        lichens: ["crustose-lichen", "reindeer-lichen"], grasses: ["arctic-fescue"],
        shrubs: ["dwarf-birch"], herbs: ["moss-campion"],
    }),
    "coastal-tundra": Object.freeze({
        id: "coastal-tundra", label: "Coastal tundra", height: "low",
        note: "salt-tolerant turf, driftwood and shallow pools behind the shore",
        lichens: ["feather-moss"], grasses: ["alpine-bluegrass", "tufted-sedge"],
        shrubs: ["dwarf-willow", "crowberry"], herbs: ["arctic-thyme"],
    }),
    "snowfield-tundra": Object.freeze({
        id: "snowfield-tundra", label: "Snowfield tundra", height: "high",
        note: "late-lying snow, frost-shattered stone and a thin fringe of moss",
        lichens: ["crustose-lichen", "reindeer-lichen"], grasses: ["arctic-fescue"],
        shrubs: ["dwarf-birch"], herbs: ["moss-campion"],
    }),
});

export const TUNDRA_LICHENS = Object.freeze({
    "reindeer-lichen": Object.freeze({ id: "reindeer-lichen", label: "Reindeer lichen", goods: ["lichen"], colours: ["#c8c6a1", "#ddd8ae"] }),
    "crustose-lichen": Object.freeze({ id: "crustose-lichen", label: "Crustose lichen", goods: ["lichen"], colours: ["#9aa08a", "#c0c4ad"] }),
    "sphagnum-moss": Object.freeze({ id: "sphagnum-moss", label: "Sphagnum moss", goods: ["peat"], colours: ["#7d8a5c", "#a4ad78"], wetland: true }),
    "feather-moss": Object.freeze({ id: "feather-moss", label: "Feather moss", goods: [], colours: ["#79876a", "#a4ad8c"] }),
});

export const TUNDRA_GRASSES = Object.freeze({
    "tufted-sedge": Object.freeze({ id: "tufted-sedge", label: "Tufted sedge", height: "short", colours: ["#8f9a6a", "#b6bb86"], goods: ["meadow-grass"] }),
    "cotton-sedge": Object.freeze({ id: "cotton-sedge", label: "Cotton grass", height: "short", colours: ["#a8ad8a", "#e4e1c6"], goods: ["hay"], wetland: true }),
    "arctic-fescue": Object.freeze({ id: "arctic-fescue", label: "Arctic fescue", height: "short", colours: ["#9aa06b", "#c2c18e"], goods: ["hay"] }),
    "alpine-bluegrass": Object.freeze({ id: "alpine-bluegrass", label: "Alpine bluegrass", height: "short", colours: ["#87936b", "#b2b98d"], goods: ["meadow-grass"] }),
});

export const TUNDRA_SHRUBS = Object.freeze({
    "dwarf-willow": Object.freeze({ id: "dwarf-willow", label: "Dwarf willow", goods: ["willow-bark", "willow-withies"], colours: ["#7f8b62", "#aeb082"] }),
    "dwarf-birch": Object.freeze({ id: "dwarf-birch", label: "Dwarf birch", goods: ["bark", "willow-bark"], colours: ["#839066", "#b3b58a"] }),
    crowberry: Object.freeze({ id: "crowberry", label: "Crowberry", goods: ["crowberry"], colours: ["#68785c", "#8e9e74"] }),
    bearberry: Object.freeze({ id: "bearberry", label: "Bearberry", goods: ["tundra-herb"], colours: ["#748260", "#a0a77c"] }),
    "dwarf-juniper": Object.freeze({ id: "dwarf-juniper", label: "Dwarf juniper", goods: ["juniper-berries"], colours: ["#61725c", "#8e9a7a"] }),
});

export const TUNDRA_HERBS = Object.freeze({
    "labrador-tea": Object.freeze({ id: "labrador-tea", label: "Labrador tea", seasons: ["spring", "summer"], medicine: true, colour: "#b9b78f" }),
    "arctic-thyme": Object.freeze({ id: "arctic-thyme", label: "Arctic thyme", seasons: ["spring", "summer"], medicine: true, colour: "#a9a685" }),
    lousewort: Object.freeze({ id: "lousewort", label: "Lousewort", seasons: ["summer", "autumn"], medicine: true, colour: "#b8a67f" }),
    "moss-campion": Object.freeze({ id: "moss-campion", label: "Moss campion", seasons: ["spring", "summer"], medicine: true, colour: "#b7b394" }),
});

export const TUNDRA_FLOWERS = Object.freeze({
    "arctic-poppy": Object.freeze({ id: "arctic-poppy", label: "Arctic poppy", seasons: ["spring", "summer"], colours: ["#e2c96e", "#f1e3ac"] }),
    "snow-buttercup": Object.freeze({ id: "snow-buttercup", label: "Snow buttercup", seasons: ["spring"], colours: ["#e3d99d", "#f5efcc"] }),
    fireweed: Object.freeze({ id: "fireweed", label: "Fireweed", seasons: ["summer", "autumn"], colours: ["#b77aa0", "#d7a9c3"] }),
    "arctic-bluebell": Object.freeze({ id: "arctic-bluebell", label: "Arctic bluebell", seasons: ["summer"], colours: ["#8c9ac0", "#bdcaeb"] }),
});

export const TUNDRA_TREES = Object.freeze({
    "arctic-willow": Object.freeze({
        id: "arctic-willow", label: "Arctic willow", kind: "willow", heightMeters: 1.2, crown: 0.5,
        colours: { spring: "#8b9a68", summer: "#748b61", autumn: "#a8955d", winter: "#777960" },
        goods: ["willow-bark", "willow-withies"],
    }),
    "dwarf-birch-tree": Object.freeze({
        id: "dwarf-birch-tree", label: "Dwarf birch", kind: "birch", heightMeters: 2.1, crown: 0.58,
        colours: { spring: "#96a06d", summer: "#7b8e63", autumn: "#b19758", winter: "#7c7c66" },
        goods: ["bark", "willow-bark"],
    }),
    "netleaf-willow": Object.freeze({
        id: "netleaf-willow", label: "Netleaf willow", kind: "willow", heightMeters: 2.4, crown: 0.55,
        colours: { spring: "#8c9b6b", summer: "#71865f", autumn: "#a38f5a", winter: "#747a64" },
        goods: ["willow-bark"],
    }),
});

export const TUNDRA_FAUNA = Object.freeze({
    moose: Object.freeze({ id: "moose", label: "Moose", group: "herbivore", kind: "moose", seasons: ["spring", "summer", "autumn", "winter"], herd: false }),
    reindeer: Object.freeze({ id: "reindeer", label: "Reindeer", group: "herbivore", kind: "reindeer", seasons: ["spring", "summer", "autumn", "winter"], herd: true, migratory: true, herded: true }),
    "musk-ox": Object.freeze({ id: "musk-ox", label: "Musk ox", group: "herbivore", kind: "musk-ox", seasons: ["spring", "summer", "autumn", "winter"], herd: true }),
    "arctic-fox": Object.freeze({ id: "arctic-fox", label: "Arctic fox", group: "predator", kind: "fox", seasons: ["spring", "summer", "autumn", "winter"] }),
    wolf: Object.freeze({ id: "wolf", label: "Wolf", group: "predator", kind: "wolf", seasons: ["spring", "summer", "autumn", "winter"] }),
    wolverine: Object.freeze({ id: "wolverine", label: "Wolverine", group: "predator", kind: "wolverine", seasons: ["spring", "summer", "autumn", "winter"] }),
    ptarmigan: Object.freeze({ id: "ptarmigan", label: "Ptarmigan", group: "bird", kind: "ptarmigan", seasons: ["spring", "summer", "autumn", "winter"], groundBird: true }),
    "snowy-owl": Object.freeze({ id: "snowy-owl", label: "Snowy owl", group: "bird", kind: "owl", seasons: ["spring", "summer", "autumn", "winter"] }),
    "migratory-goose": Object.freeze({ id: "migratory-goose", label: "Migratory goose", group: "bird", kind: "goose", seasons: ["spring", "summer", "autumn"], migratoryBird: true }),
    "arctic-hare": Object.freeze({ id: "arctic-hare", label: "Arctic hare", group: "small", kind: "hare", seasons: ["spring", "summer", "autumn", "winter"] }),
    lemming: Object.freeze({ id: "lemming", label: "Lemming", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn", "winter"] }),
    "tundra-vole": Object.freeze({ id: "tundra-vole", label: "Tundra vole", group: "rodent", kind: "rodent", seasons: ["spring", "summer", "autumn", "winter"] }),
    mosquito: Object.freeze({ id: "mosquito", label: "Mosquito swarm", group: "insect", kind: "insect", seasons: ["summer"] }),
});

// Only genuinely new goods live here. Lichen, bark, juniper berries, wool,
// hides, fur, game and willow withies reuse the shared catalogue.
export const TUNDRA_GOODS = Object.freeze({
    cloudberry: Object.freeze({ id: "cloudberry", label: "Cloudberries", category: "gather" }),
    crowberry: Object.freeze({ id: "crowberry", label: "Crowberries", category: "gather" }),
    "arctic-char": Object.freeze({ id: "arctic-char", label: "Arctic char", category: "gather" }),
    antler: Object.freeze({ id: "antler", label: "Antler", category: "material" }),
    bone: Object.freeze({ id: "bone", label: "Bone and horn", category: "material" }),
    peat: Object.freeze({ id: "peat", label: "Peat", category: "material" }),
    soapstone: Object.freeze({ id: "soapstone", label: "Soapstone", category: "material" }),
    "bog-iron": Object.freeze({ id: "bog-iron", label: "Bog iron", category: "material" }),
    "tundra-herb": Object.freeze({ id: "tundra-herb", label: "Tundra herbs", category: "medicine" }),
    "willow-bark": Object.freeze({ id: "willow-bark", label: "Willow bark", category: "medicine" }),
    qiviut: Object.freeze({ id: "qiviut", label: "Qiviut", category: "fibre" }),
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
        bareSoil: Boolean(explicit.bareSoil || grazed || state === "trampled"),
        intensity: clamp01(explicit.intensity ?? (grazed ? 0.62 : explicit.trampled ? 0.8 : 0.12)),
        yearsSinceUse: Math.max(0, number(explicit.yearsSinceUse)),
        label: explicit.label || (grazed ? "grazed tundra pasture" : explicit.trampled
            ? "trampled tundra ground" : "open tundra"),
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
    if (scores.snowfield > 0.72) return "snowfield-tundra";
    // A low, damp shore is a coastal tundra even when it is also wet enough
    // for a fen; the salt-laden turf and driftwood are the defining surface.
    if (scores.coastal > 0.62) return "coastal-tundra";
    if (scores.wetland > 0.66) return "sedge-wetland";
    if (scores.willow > 0.64) return "willow-thicket";
    if (scores.berry > 0.58) return "berry-heath";
    // Lichen and moss are not leftovers. Dry, exposed ground reads first as a
    // lichen crust; damp, rock-free ground reads as a moss carpet before the
    // frost-pattern and dwarf-shrub types.
    if (scores.lichen > 0.7 && scores.rocky < 0.72) return "lichen-tundra";
    if (scores.moss > 0.76 && scores.lichen < 0.62 && scores.rocky < 0.56) return "moss-tundra";
    if (scores.shrub > 0.54) return "dwarf-shrub-tundra";
    if (scores.rocky > 0.64) return "rocky-tundra";
    if (scores.frost > 0.8) return "frost-polygon";
    if (scores.lichen > 0.55) return "lichen-tundra";
    return "moss-tundra";
}

function buildFlowers(seed, x, y, season, bloom) {
    if (bloom <= 0.045) return [];
    const pool = Object.values(TUNDRA_FLOWERS).filter(flower => flower.seasons.includes(season));
    if (!pool.length) return [];
    const count = 1 + Math.floor(unit(seed, x, y, 0x464c4f58) * (bloom > 0.38 ? 3 : 2));
    const chosen = [];
    for (let index = 0; index < count; index++) {
        const flower = pick(seed, x + index * 3, y - index, pool, 0x464c4f59 + index);
        if (flower && !chosen.some(entry => entry.id === flower.id)) chosen.push(flower);
    }
    return chosen;
}

function buildSmallTrees(seed, x, y, formation, season, cover) {
    if (!["willow-thicket", "berry-heath", "dwarf-shrub-tundra", "moss-tundra", "coastal-tundra"].includes(formation.id)) return [];
    if (cover < 0.22) return [];
    const pool = ["arctic-willow", "dwarf-birch-tree", "netleaf-willow"];
    const count = clamp01(0.4 + cover) > unit(seed, x, y, 0x54524545) ? (cover > 0.62 ? 2 : 1) : 0;
    const trees = [];
    for (let index = 0; index < count; index++) {
        const tree = TUNDRA_TREES[pool[hash32(seed, x, y, 0x54524546 + index) % pool.length]];
        if (!tree) continue;
        trees.push({
            ...tree,
            offsetX: (unit(seed, x + index, y, 0x54524547) - 0.5) * 0.62,
            offsetY: (unit(seed, x, y + index, 0x54524548) - 0.5) * 0.34,
            scale: 0.58 + unit(seed, x, y + index, 0x54524549) * 0.25,
            seasonColour: tree.colours[season] || tree.colours.summer,
        });
    }
    return trees;
}

function buildFauna(seed, x, y, context) {
    const { season, cover, woody, water, rocky, openness, cold } = context;
    const fauna = [];
    const add = (id, count = 1) => {
        const definition = TUNDRA_FAUNA[id];
        if (!definition || !definition.seasons.includes(season) || fauna.some(entry => entry.id === id)) return;
        fauna.push({ ...definition, count: Math.max(1, Math.min(9, Math.round(count))) });
    };
    if (cover > 0.2 && unit(seed, x, y, 0x4d4f4f53) > 0.42) add("moose", 1);
    if (openness > 0.18 && unit(seed, x, y, 0x5245494e) > 0.12) add("reindeer", 3 + Math.floor(unit(seed, x, y, 0x48455244) * 5));
    if (cold > 0.5 && unit(seed, x, y, 0x4d55534b) > 0.5) add("musk-ox", 2);
    if (unit(seed, x, y, 0x464f5831) > 0.38) add("arctic-fox");
    if ((cover > 0.18 || water > 0.2) && unit(seed, x, y, 0x574f4c46) > 0.52) add("wolf");
    if (rocky > 0.34 && unit(seed, x, y, 0x574f4c56) > 0.62) add("wolverine");
    if (cover > 0.14 && unit(seed, x, y, 0x50544152) > 0.34) add("ptarmigan", 2);
    if (openness > 0.28 && unit(seed, x, y, 0x4f574c31) > 0.68) add("snowy-owl");
    if (season !== "winter" && unit(seed, x, y, 0x474f4f53) > 0.42) add("migratory-goose", 2);
    if (unit(seed, x, y, 0x48415245) > 0.35) add("arctic-hare");
    if (unit(seed, x, y, 0x4c454d4d) > 0.38) add("lemming", 2);
    if (unit(seed, x, y, 0x564f4c45) > 0.56) add("tundra-vole");
    if (season === "summer" && unit(seed, x, y, 0x4d4f5351) > 0.35) add("mosquito", 4 + Math.floor(unit(seed, x, y, 0x494e5345) * 5));
    return fauna.slice(0, 8);
}

function buildGoods(seed, x, y, context) {
    const { season, wetland, pool, peat, rocky, minerals, wood, fauna, berries, openWater } = context;
    const goods = [];
    const add = (id, label, category, abundance) => {
        const amount = clamp01(abundance);
        if (amount > 0.06 && !goods.some(entry => entry.id === id)) goods.push({ id, label, category, abundance: amount });
    };
    add("lichen", "Lichen", "gather", 0.24 + (1 - wetland) * 0.12);
    if (berries > 0.3 && (season === "summer" || season === "autumn")) {
        add("cloudberry", "Cloudberries", "gather", berries * (season === "summer" ? 0.82 : 0.62));
    }
    if (berries > 0.38 && (season === "autumn" || season === "winter")) {
        add("crowberry", "Crowberries", "gather", berries * (season === "autumn" ? 0.72 : 0.46));
    }
    if (openWater && season !== "winter") add("arctic-char", "Arctic char", "gather", 0.34 + pool * 0.3);
    if (wood > 0.3) add("willow-bark", "Willow bark", "medicine", 0.24 + wood * 0.24);
    if (berries > 0.24) add("tundra-herb", "Tundra herbs", "medicine", 0.24 + berries * 0.2);
    if (fauna.some(entry => entry.group === "herbivore")) add("game", "Wild game", "hunt", 0.3);
    if (fauna.some(entry => entry.group === "herbivore")) add("hides", "Hides", "hunt", 0.3);
    if (fauna.some(entry => entry.group === "predator") || season === "winter") add("fur", "Furs", "hunt", 0.24);
    if (fauna.some(entry => entry.id === "reindeer" || entry.id === "moose")) add("antler", "Antler", "material", 0.28);
    if (fauna.some(entry => entry.id === "reindeer" || entry.id === "moose" || entry.id === "musk-ox")) add("bone", "Bone and horn", "material", 0.22);
    if (fauna.some(entry => entry.id === "musk-ox")) add("qiviut", "Qiviut", "fibre", 0.22);
    if (peat > 0.32) add("peat", "Peat", "material", peat * 0.72);
    if (rocky > 0.28 || minerals > 0.3) add("soapstone", "Soapstone", "material", Math.max(rocky, minerals) * 0.64);
    if (wetland > 0.34 && minerals > 0.22) add("bog-iron", "Bog iron", "material", wetland * minerals * 0.9);
    if (wood > 0.22) add("willow-withies", "Willow withies", "gather", wood * 0.5);
    return goods.sort((a, b) => b.abundance - a.abundance).slice(0, 9);
}

/**
 * How strongly a tile belongs to the tundra. Tundra is the dedicated cold
 * climate; northern and temperate realms keep their established taiga and
 * meadow ecology, so existing saves render exactly as before.
 */
export function tundraPotentialAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const climate = context.climate || "temperate";
    if (climate !== "tundra") return 0;
    const moisture = clamp01(context.moisture ?? 0.55);
    const temperature = clamp01(context.temperature ?? 0.22);
    const height = clamp01(context.height ?? 0.42);
    const seaLevel = number(context.seaLevel, 0.33);
    if (height < seaLevel + 0.008 || height > 0.94) return 0;
    const warmth = smoothstep(0.18, 0.34, temperature);
    const roll = coarse(seed, x, y, 6, 0x54554e44);
    return clamp01(0.78 + warmth * 0.08 + (1 - moisture) * 0.04 + roll * 0.12);
}

export function isTundraSite(x, y, context = {}) {
    return tundraPotentialAt(x, y, context) > 0.24;
}

/**
 * Derive the complete tundra profile for one tile. Pure and deterministic for
 * the same inputs; `use` is optional and comes from real buildings and roads.
 */
export function tundraProfileAt(x, y, context = {}) {
    const seed = Number(context.seed) || 1;
    const moisture = clamp01(context.moisture ?? 0.55);
    const temperature = clamp01(context.temperature ?? 0.22);
    const height = clamp01(context.height ?? 0.42);
    const seaLevel = number(context.seaLevel, 0.33);
    const climate = context.climate || "tundra";
    const dayOfYear = number(context.dayOfYear, 150);
    const year = Math.max(1, Math.floor(number(context.year, 1)));
    const hour = Math.max(0, Math.min(24, number(context.hour, 12)));
    const weather = String(context.weather || "clear").toLowerCase();
    const wind = Math.max(0.2, Math.min(2.5, number(context.wind, 1)));
    const season = seasonKeyFor(dayOfYear);
    const seasonIndex = SEASON_KEYS.indexOf(season);
    const base = seasonalState(dayOfYear, climate === "tundra" ? "tundra" : climate);
    const use = normalizeUse(context.use);
    const aboveSea = Math.max(0, height - seaLevel);
    const relief = coarse(seed, x, y, 7, 0x52454c49);
    const frostRoll = coarse(seed, x, y, 5, 0x46524f53);
    const wetRoll = coarse(seed, x, y, 4, 0x5745544c);
    const rockRoll = coarse(seed, x, y, 6, 0x524f434b);
    const berryRoll = coarse(seed, x, y, 5, 0x42455252);
    const lichenRoll = coarse(seed, x, y, 4, 0x4c494348);
    const shrubRoll = coarse(seed, x, y, 4, 0x53485242);
    const treeRoll = coarse(seed, x, y, 3, 0x54524545);
    const coastal = clamp01(smoothstep(0.09, 0.01, aboveSea) * (0.3 + moisture * 0.45) + (aboveSea < 0.05 && moisture > 0.34 ? 0.24 : 0));
    const flat = 1 - smoothstep(0.18, 0.42, aboveSea);
    const hill = relief > 0.64 && aboveSea > 0.13;
    const depression = relief < 0.3 && aboveSea < 0.12;
    const permafrost = clamp01(0.5 + smoothstep(0.34, 0.14, temperature) * 0.42
        + aboveSea * 0.18 - flat * 0.05 - (climate === "tundra" ? 0 : 0.22));
    const activeLayer = clamp01(permafrost * (0.2 + base.warmth * 0.62 + base.greenUp * 0.16 + relief * 0.08));
    const thawing = activeLayer > 0.18;
    const snowCover = clamp01(Math.max(base.snowCover, climate === "tundra" ? base.snowCover : 0));
    const wetland = clamp01(smoothstep(0.48, 0.76, moisture) * (0.4 + flat * 0.46)
        + (moisture > 0.66 ? 0.18 : 0) - aboveSea * 0.2 + wetRoll * 0.12);
    const shallowPool = wetland > 0.3 && unit(seed, x, y, 0x504f4f4c) > 0.38
        && (season !== "winter" || unit(seed, x, y, 0x49434531) > 0.4);
    const seasonalWater = wetland > 0.24 && (season === "spring" || season === "summer") && unit(seed, x, y, 0x57415452) > 0.3;
    const frozenWater = wetland > 0.24 && season === "winter";
    const frostPolygon = permafrost > 0.38 && flat > 0.28 && frostRoll > 0.3;
    const frostCrack = permafrost > 0.46 && (relief > 0.36 || frostRoll > 0.48);
    const polygonCount = frostPolygon ? 3 + Math.floor(unit(seed, x, y, 0x504f4c59) * 4) : 0;
    const hummock = frostPolygon && unit(seed, x, y, 0x48554d4d) > 0.34;
    const stability = clamp01(0.5 + (1 - permafrost) * 0.28 + (1 - wetland) * 0.18
        - aboveSea * 0.1 + (unit(seed, x, y, 0x53544142) - 0.5) * 0.3);
    const bearing = clamp01(stability * (1 - activeLayer * 0.34) * (1 - wetland * 0.26));
    const erosion = clamp01(permafrost * 0.2 + activeLayer * 0.28 + (1 - stability) * 0.2);
    const peat = clamp01(wetland * 0.72 + (season === "summer" ? 0.08 : 0) - 0.08);
    const nutrients = clamp01(0.24 + moisture * 0.24 + (season === "summer" ? 0.08 : 0)
        - permafrost * 0.1 - aboveSea * 0.2);
    const agriculture = clamp01(0.16 + moisture * 0.18 + nutrients * 0.28 + base.warmth * 0.22
        - permafrost * 0.16 - aboveSea * 0.14);
    const growingSeasonDays = Math.round(clamp01(0.08 + base.warmth * 0.42 + (1 - permafrost) * 0.2) * 70 + 62);
    const cold = clamp01((season === "winter" ? 0.82 : 0.38) + (0.27 - temperature) * 1.2
        + wind * 0.09 + snowCover * 0.1);
    const hypothermia = clamp01(cold * (0.62 + wetland * 0.22 + (season === "winter" ? 0.16 : 0)));
    const frostbite = clamp01(cold * (0.48 + wind * 0.16));
    const blizzard = clamp01((weather === "storm" ? 0.66 : 0) + snowCover * 0.3
        + (weather === "snow" ? 0.2 : 0) + wind * 0.12);
    const thaw = clamp01(activeLayer * (season === "spring" ? 1 : 0.76) * (1 - snowCover * 0.3));
    const insects = season === "summer" ? clamp01(base.warmth * 0.48 + wetland * 0.34 + moisture * 0.16) : 0;
    const snowblindness = clamp01(snowCover * 0.4 + (hour >= 9 && hour <= 16 ? 0.18 : 0));
    const unstableGround = clamp01(thaw * 0.52 + permafrost * 0.18 + wetland * 0.16 + (1 - stability) * 0.2);
    const bloom = clamp01((season === "spring" ? 0.94 : season === "summer" ? 0.48 : season === "autumn" ? 0.12 : 0)
        * (0.32 + base.greenUp * 0.48) * (0.55 + moisture * 0.35) * (1 - snowCover * 0.66));
    const colourShift = clamp01(season === "winter" ? 0.84 : season === "autumn" ? 0.68
        : season === "spring" ? 0.46 : 0.12);
    const moss = clamp01(0.38 + moisture * 0.38 + (1 - temperature) * 0.18 + unit(seed, x, y, 0x4d4f5353) * 0.24);
    const lichen = clamp01(0.28 + (1 - moisture) * 0.34 + relief * 0.22 + lichenRoll * 0.26);
    const shrub = clamp01(0.16 + moisture * 0.3 + base.greenUp * 0.22 + shrubRoll * 0.3 - aboveSea * 0.18);
    const willow = clamp01(moisture * 0.68 + flat * 0.22 + treeRoll * 0.24 + wetland * 0.16 - aboveSea * 0.2);
    const berry = clamp01(shrub * 0.74 + berryRoll * 0.3 + (season === "summer" || season === "autumn" ? 0.08 : 0));
    const rocky = clamp01(aboveSea * 1.16 + rockRoll * 0.38 + (1 - moisture) * 0.18);
    const frost = clamp01(permafrost * 0.7 + flat * 0.2 + frostRoll * 0.2 - aboveSea * 0.12);
    const snowfield = clamp01(snowCover * 0.62 + aboveSea * 0.3 + (season === "winter" ? 0.18 : 0) + (relief > 0.5 ? 0.08 : 0));
    const formation = TUNDRA_FORMATIONS[chooseFormation({ snowfield, wetland, coastal, willow, berry, shrub, rocky, frost, lichen, moss })];
    const cover = clamp01(0.2 + shrub * 0.3 + moss * 0.18 + willow * 0.14 + lichen * 0.12 - rocky * 0.22 + wetland * 0.08);
    const grasses = formation.grasses.map(id => TUNDRA_GRASSES[id]).filter(Boolean);
    const shrubs = formation.shrubs.map(id => TUNDRA_SHRUBS[id]).filter(Boolean);
    const lichens = formation.lichens.map(id => TUNDRA_LICHENS[id]).filter(Boolean);
    const herbs = Object.values(TUNDRA_HERBS).filter(herb => herb.seasons.includes(season))
        .filter((entry, index) => unit(seed, x, y, 0x48455242 + index) > 0.5 - cover * 0.32);
    const flowers = buildFlowers(seed, x, y, season, bloom);
    const trees = buildSmallTrees(seed, x, y, formation, season, cover);
    const woody = clamp01(shrubs.length * 0.16 + (trees.length ? 0.22 : 0) + willow * 0.24);
    const openWater = shallowPool || seasonalWater || (wetland > 0.46 && season !== "winter");
    const fauna = buildFauna(seed, x, y, {
        season, cover, woody, water: wetland, rocky,
        openness: clamp01((1 - cover) * 0.6 + grasses.length * 0.14 + 0.24),
        cold,
    });
    const minerals = clamp01(rocky * 0.64 + (1 - moisture) * 0.16 + unit(seed, x, y, 0x4d494e45) * 0.24);
    const berries = clamp01(berry * (season === "summer" ? 0.7 : season === "autumn" ? 1 : season === "winter" ? 0.35 : 0.18));
    const goods = buildGoods(seed, x, y, {
        season, wetland, pool: shallowPool ? 1 : 0, peat, rocky, minerals, wood: woody,
        fauna, berries, openWater,
    });
    const stone = clamp01(rocky * 0.86 + (1 - moisture) * 0.12);
    const buildingMaterials = clamp01(0.14 + (1 - cover) * 0.12 + stone * 0.16 + woody * 0.12 - permafrost * 0.06);
    const fuelDemand = clamp01(0.42 + cold * 0.44 + snowCover * 0.08);
    const clothingNeed = clamp01(0.46 + cold * 0.4 + wind * 0.08);
    const housingInsulation = clamp01(0.4 + cold * 0.38 + permafrost * 0.12);
    const winterMobility = clamp01(1 - snowCover * 0.34 - cold * 0.12 - thaw * 0.1);
    const supplyCost = clamp01(0.38 + (1 - bearing) * 0.2 + snowCover * 0.12 + (1 - cover) * 0.1);
    const huntingSeason = clamp01((season === "autumn" ? 0.78 : season === "winter" ? 0.68 : season === "summer" ? 0.28 : 0.4)
        + (fauna.some(entry => entry.group === "herbivore") ? 0.18 : 0) + (1 - cover) * 0.08);
    const migrationEconomy = clamp01((season === "spring" || season === "autumn" ? 0.7 : 0.26)
        + (fauna.some(entry => entry.migratory) ? 0.2 : 0));
    const adaptedLivestock = clamp01((fauna.some(entry => entry.herded) ? 0.62 : 0.14) + (use.grazed ? 0.16 : 0));
    const fishing = clamp01(openWater ? 0.4 + wetland * 0.4 : season === "winter" && wetland > 0.2 ? 0.2 : 0.04);
    const storage = clamp01(0.36 + cold * 0.24 + (1 - bearing) * 0.1);
    const remoteSupply = clamp01(supplyCost * 0.72 + (1 - buildingMaterials) * 0.12 + snowCover * 0.1);
    const features = new Set();
    const mark = (...ids) => { for (const id of ids) features.add(id); };
    if (fauna.some(entry => entry.id === "moose") && lichens.length) mark("1.2.9.1");
    if (grasses.length) mark("1.2.9.2");
    if (shrubs.length) mark("1.2.9.3");
    if (trees.length) mark("1.2.9.4");
    if (shrubs.some(entry => entry.id === "crowberry" || entry.id === "bearberry")
        || goods.some(good => good.id === "cloudberry" || good.id === "crowberry")) mark("1.2.9.5");
    if (herbs.length) mark("1.2.9.6");
    if (flowers.length) mark("1.2.9.7");
    if (trees.every(tree => tree.heightMeters < 3)) mark("1.2.9.8");
    if (permafrost > 0.32) mark("1.2.9.9");
    if (season === "summer" && activeLayer > 0.18) mark("1.2.9.10");
    if (wetland > 0.3) mark("1.2.9.11");
    if (shallowPool) mark("1.2.9.12");
    if (frostPolygon) mark("1.2.9.13");
    if (hill || depression || hummock) mark("1.2.9.14");
    if (frostCrack) mark("1.2.9.15");
    if (stability < 0.56 || stability > 0.68) mark("1.2.9.16");
    if (cold > 0.62) mark("1.2.9.17");
    if (growingSeasonDays <= 118) mark("1.2.9.18");
    if (growingSeasonDays <= 118) mark("1.2.9.19");
    if (bloom > 0.3) mark("1.2.9.20");
    if (thawing) mark("1.2.9.21");
    if (seasonalWater) mark("1.2.9.22");
    if (snowCover > 0.05 && season !== "summer") mark("1.2.9.23");
    if (colourShift > 0.3) mark("1.2.9.24");
    if (fauna.some(entry => entry.group === "herbivore")) mark("1.2.9.25");
    if (fauna.some(entry => entry.id === "arctic-fox")) mark("1.2.9.26");
    if (fauna.some(entry => entry.groundBird)) mark("1.2.9.27");
    if (fauna.some(entry => entry.group === "rodent")) mark("1.2.9.28");
    if (fauna.some(entry => entry.id === "wolf" || entry.id === "wolverine")) mark("1.2.9.29");
    if (fauna.some(entry => entry.migratoryBird)) mark("1.2.9.30");
    if (fauna.some(entry => entry.group === "insect")) mark("1.2.9.31");
    if (fauna.some(entry => entry.herd)) mark("1.2.9.32");
    if (goods.some(good => ["cloudberry", "crowberry", "lichen"].includes(good.id))) mark("1.2.9.33");
    if (goods.some(good => good.id === "fur" || good.id === "hides")) mark("1.2.9.34");
    if (goods.some(good => good.id === "game" || good.id === "qiviut")) mark("1.2.9.35");
    if (goods.some(good => good.id === "antler" || good.id === "bone")) mark("1.2.9.36");
    if (goods.some(good => good.id === "arctic-char")) mark("1.2.9.37");
    if (peat > 0.28 || goods.some(good => good.id === "peat")) mark("1.2.9.38");
    if (stone > 0.24 || goods.some(good => good.id === "soapstone" || good.id === "bog-iron")) mark("1.2.9.39");
    if (adaptedLivestock > 0.4) mark("1.2.9.40");
    if (agriculture < 0.42 || growingSeasonDays <= 118) mark("1.2.9.41");
    if (buildingMaterials < 0.46) mark("1.2.9.42");
    if (stability < 0.56 || agriculture < 0.34) mark("1.2.9.43");
    if (hypothermia > 0.38) mark("1.2.9.44");
    if (winterMobility < 0.74) mark("1.2.9.45");
    if (remoteSupply > 0.42) mark("1.2.9.46");
    if (huntingSeason > 0.4 || migrationEconomy > 0.4) mark("1.2.9.47");
    if (housingInsulation > 0.4 || clothingNeed > 0.42) mark("1.2.9.48");

    const ground = mixColour([116, 124, 100], [139, 135, 110], clamp01(lichen * 0.24 + (1 - moisture) * 0.2 + snowCover * 0.2));
    const green = mixColour([124, 140, 96], [155, 153, 104], clamp01(colourShift * 0.72 + (1 - moisture) * 0.1));
    const mossHex = hexColour(mixColour([98, 118, 78], [151, 150, 104], colourShift * 0.62));
    const lichenHex = hexColour(mixColour([178, 178, 148], [214, 211, 180], snowCover * 0.25));
    const grassColour = hexColour(green);
    const sunlight = clamp01((Math.sin(((hour - 6) / 24) * Math.PI * 2) + 0.15) * 0.66);
    const windSway = clamp01(0.16 + wind * 0.14 + (1 - cover) * 0.12);
    const phase = unit(seed, x, y, 0x57494e44) * Math.PI * 2;
    const leafColour = trees[0]?.seasonColour || grassColour;
    const waterHex = frozenWater ? "#c6d7dc" : openWater ? "#557f8c" : "#7b8d88";

    return {
        biome: "tundra", tundra: true, x: Math.floor(number(x)), y: Math.floor(number(y)), seed, year,
        formation: formation.id, label: formation.label, note: formation.note,
        season, seasonIndex, climate, moisture, temperature, height,
        features: TUNDRA_REQUIREMENT_IDS.filter(id => features.has(id)),
        landform: {
            hill, depression, hummock, frostPolygon, frostCrack, polygonCount,
            relief: clamp01(relief), coastal: coastal > 0.5, stability,
            label: hill ? "tundra hill" : depression ? "shallow hollow" : "level tundra",
        },
        soil: {
            permafrost, activeLayer, thawDepthCm: Math.round(activeLayer * 80), stability, bearing,
            organic: clamp01(moss * 0.38 + peat * 0.4), peat, nutrients, agriculture,
            drainage: clamp01((1 - wetland) * 0.7 + aboveSea * 0.2), erosion, frostCrack,
        },
        water: {
            wetland, shallowPool, seasonalPool: seasonalWater, openWater, frozen: frozenWater,
            depthCm: shallowPool ? Math.round(12 + wetland * 34) : 0, waterTable: clamp01(moisture * 0.76 + wetland * 0.24),
        },
        vegetation: {
            lichens, mosses: lichens.filter(entry => entry.id.includes("moss")), grasses, shrubs, herbs, flowers, trees,
            density: clamp01(grasses.length * 0.16 + moss * 0.22 + shrub * 0.2), cover, bloom,
            lowGrowth: true, noTallTrees: trees.every(tree => tree.heightMeters < 3),
            berry: berries, woody, colourShift, treeChance: trees.length ? 0.14 : 0,
        },
        fauna, goods,
        economy: {
            agriculture, growingSeasonDays, buildingMaterials, fuelDemand, clothingNeed,
            housingInsulation, winterMobility, supplyCost, huntingSeason, migrationEconomy,
            adaptedLivestock, fishing, storage, remoteSupply,
            buildingRequirement: clamp01(housingInsulation * 0.68 + buildingMaterials * 0.12),
        },
        materials: { stone, minerals, peat, wood: woody },
        hazards: { cold, hypothermia, frostbite, blizzard, thaw, insects, unstableGround, snowblindness },
        use,
        visual: {
            sunlight, wind, windSway, snowCover, colourShift, phase,
            groundHex: hexColour(ground), mossHex, lichenHex, grassHex: grassColour,
            leafHex: leafColour, waterHex, snowHex: "#e8eef2", rockHex: "#7d827c",
            flowerHex: flowers[0]?.colours?.[0] || "#d8c989",
            noonLight: clamp01(0.36 + sunlight * 0.5 - snowCover * 0.2),
            haze: clamp01(snowCover * 0.18 + blizzard * 0.2),
        },
        grassHex: grassColour, groundHex: hexColour(ground), leafColour,
        trees, treeChance: trees.length ? 0.14 : 0,
        sward: { height: "short", density: clamp01(0.28 + cover * 0.42) },
        seasonalMovement: hasHerds(fauna) ? "herds follow the open ground between snowfields" : "wildlife shelters from wind and cold",
        seasonalNote: `${formation.label} · ${Math.round(permafrost * 100)}% permafrost · ${shallowPool ? "shallow pool" : wetland > 0.3 ? "wet ground" : "thin soil"}`,
    };
}

function hasHerds(fauna) {
    return fauna.some(entry => entry.herd || entry.group === "herbivore");
}

export function tundraGoodsFor(profile, dayOfYear = 150) {
    if (!profile) return [];
    const season = seasonKeyFor(dayOfYear);
    return profile.goods.filter(good => {
        if (good.id === "arctic-char") return season !== "winter";
        if (good.id === "cloudberry") return season === "summer" || season === "autumn";
        if (good.id === "crowberry") return season === "autumn" || season === "winter";
        return true;
    });
}

export function tundraProductsAt(x, y, context = {}) {
    const profile = tundraProfileAt(x, y, context);
    if (!profile || profile.height < (context.seaLevel ?? 0.33) + 0.02) return null;
    const goods = tundraGoodsFor(profile, context.dayOfYear ?? 150);
    if (!goods.length) return null;
    return { x: profile.x, y: profile.y, profile, goods, label: profile.label, use: profile.use, fauna: profile.fauna };
}

export function tundraSummary(profile) {
    if (!profile) return "";
    const goods = profile.goods.slice(0, 4).map(good => good.label).join(", ") || "no surface harvest";
    const wildlife = profile.fauna.slice(0, 3).map(entry => entry.label).join(", ") || "no wildlife observed";
    const water = profile.water.openWater ? " · open water" : profile.water.wetland > 0.3 ? " · wetland" : " · dry ground";
    const soil = profile.soil.permafrost > 0.5 ? "permafrost" : "seasonal frost";
    return `${profile.label} · ${soil} · ${goods} · ${wildlife}${water}`;
}

export function tundraRequirement(id) {
    return REQUIREMENT_BY_ID[id] || null;
}

export const TUNDRA_LIMITS = Object.freeze({
    requirements: TUNDRA_REQUIREMENTS.length,
    maxFauna: 8,
    maxFlowers: 3,
    maxGoods: 9,
    formations: Object.keys(TUNDRA_FORMATIONS).length,
    lichens: Object.keys(TUNDRA_LICHENS).length,
    grasses: Object.keys(TUNDRA_GRASSES).length,
    shrubs: Object.keys(TUNDRA_SHRUBS).length,
    trees: Object.keys(TUNDRA_TREES).length,
});
