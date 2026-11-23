// Central biome registry for 1.2.22 — generation and visual quality.
//
// One stable, data-only definition per biome. The palette, silhouettes, ground
// texture, atmosphere, water treatment, seasonal faces, landmark, plants,
// habitat and hazards all live here, so a new biome is a data entry instead of
// a change in every renderer. Existing 1.2.19/1.2.21 catalogs remain the
// source for resources, wildlife and soil; this file links to them rather than
// duplicating their rows.
import { BIOME_PROFILES, BIOME_RESOURCES } from "./biome-resource-data.js";
import { HAZARD_CATALOG } from "./hazard-data.js";

export const BIOME_GENERATION_VERSION = 1;

const freeze = value => Object.freeze(value);
const list = value => freeze([...value]);
const range = (min, max) => freeze([min, max]);

function seasonal(id, label, base, accent, note) {
    return freeze({ id, label, base, accent, note });
}

function identity(id, label, family, data) {
    return freeze({
        id: "biome." + id,
        key: id,
        label,
        family,
        palette: freeze({
            base: data.palette[0],
            light: data.palette[1],
            dark: data.palette[2],
            accent: data.palette[3],
            water: data.palette[4] || data.palette[0],
            atmosphere: data.palette[5] || data.palette[1]
        }),
        texture: data.texture,
        silhouette: data.silhouette,
        atmosphere: data.atmosphere,
        waterLook: data.waterLook,
        landmark: data.landmark,
        magical: Boolean(data.magical),
        seasons: freeze(data.seasons),
        lod: freeze(data.lod),
        notes: data.notes || ""
    });
}

// ── visual identity ───────────────────────────────────────────
// Colours are the midpoint of each surface, not a single flat fill: the
// renderer mixes them with relief, season and weather. Every biome carries a
// different base hue, a different canopy silhouette and its own air/water
// treatment so it is readable from the normal play camera.
export const BIOME_IDENTITY = freeze({
    water: identity("water", "Open water", "aquatic", {
        palette: ["#2f5d72", "#6f9aa4", "#1c3c4e", "#9fc4c6", "#2f5d72", "#b7cfd2"],
        texture: "long wind ripples over dark silt",
        silhouette: ["reed fringe", "open horizon", "sun glint"],
        atmosphere: "cool water haze with a low horizon glare",
        waterLook: "deep blue-green, foam on the windward shore",
        landmark: freeze({ id: "drowned-tower", label: "Drowned tower", scale: 1.6, rarity: 0.18 }),
        seasons: [
            seasonal("spring", "Spring", "#35667a", "#a8cbc8", "snowmelt colour and high water"),
            seasonal("summer", "Summer", "#2d6074", "#c4d8cf", "warm surface and low flow"),
            seasonal("autumn", "Autumn", "#315a6c", "#a7bcb6", "grey light and drifting leaves"),
            seasonal("winter", "Winter", "#4a7284", "#d6e4e6", "pale ice and dark open leads")
        ],
        lod: { detail: 0.9, simplified: 0.4, impostor: 0.18, trees: 0, shadows: "none" }
    }),
    beach: identity("beach", "Sandy shore", "coastal", {
        palette: ["#c9b47e", "#e0d0a4", "#9e8a5c", "#d9e2d2", "#5f9aa4", "#d8cba8"],
        texture: "wind-graded sand with shingle ribs and drift lines",
        silhouette: ["marram tufts", "driftwood", "low dune crest"],
        atmosphere: "salt haze and bright reflected light",
        waterLook: "shallow turquoise with a white sand shelf",
        landmark: freeze({ id: "salt-spit", label: "Salt spit", scale: 1.3, rarity: 0.26 }),
        seasons: [
            seasonal("spring", "Spring", "#cdbb8c", "#e6dcc0", "cool sand and first marram"),
            seasonal("summer", "Summer", "#d6c18b", "#f0e4c2", "bleached sand and heat haze"),
            seasonal("autumn", "Autumn", "#bfae85", "#cfd6c2", "wet wrack and grey surf"),
            seasonal("winter", "Winter", "#b9b3a0", "#dbe3e4", "storm shingle and salt rime")
        ],
        lod: { detail: 0.8, simplified: 0.36, impostor: 0.16, trees: 1, shadows: "baked" }
    }),
    snow: identity("snow", "Snowfield", "polar", {
        palette: ["#dbe5e9", "#f4f8fa", "#aabcc4", "#8fb2c4", "#7fa8b8", "#e6eff3"],
        texture: "wind-carved drift and blue shadowed hollows",
        silhouette: ["low ice ridge", "buried shrub", "nunatak spike"],
        atmosphere: "fine spindrift and a pale white sky",
        waterLook: "frozen lid with dark pressure cracks",
        landmark: freeze({ id: "ice-cairn", label: "Ice cairn", scale: 1.5, rarity: 0.2 }),
        seasons: [
            seasonal("spring", "Spring", "#dfe8ea", "#f7fbfb", "wet snow and first meltwater"),
            seasonal("summer", "Summer", "#cfdde0", "#f2f7f6", "old snow and exposed gravel"),
            seasonal("autumn", "Autumn", "#d6e0e4", "#eaf2f4", "first fresh cover"),
            seasonal("winter", "Winter", "#e8f0f4", "#ffffff", "deep dry powder and long blue dusk")
        ],
        lod: { detail: 0.86, simplified: 0.4, impostor: 0.2, trees: 2, shadows: "baked" }
    }),
    rock: identity("rock", "Highland rock", "alpine", {
        palette: ["#8e897e", "#b3ada0", "#5f5c56", "#7d8d86", "#6b8a96", "#b9b3a4"],
        texture: "frost-shattered scree, bedding planes and lichen crust",
        silhouette: ["broken crag", "talus fan", "wind-bent juniper"],
        atmosphere: "thin clear air with sharp ridge shadows",
        waterLook: "cold tarns and white cataract threads",
        landmark: freeze({ id: "standing-stone", label: "Weathered standing stone", scale: 2.2, rarity: 0.24 }),
        seasons: [
            seasonal("spring", "Spring", "#969083", "#c2bba9", "snow patches in the gullies"),
            seasonal("summer", "Summer", "#8b877c", "#b8b2a4", "dry scree and alpine flowers"),
            seasonal("autumn", "Autumn", "#8f8778", "#a89d88", "wet rock and early rime"),
            seasonal("winter", "Winter", "#a5a8a5", "#d9e0e0", "snow ledges and dark exposed faces")
        ],
        lod: { detail: 0.84, simplified: 0.38, impostor: 0.18, trees: 1, shadows: "baked" }
    }),
    tundra: identity("tundra", "Tundra", "polar", {
        palette: ["#9da88d", "#c3c8ae", "#6b7563", "#8d7f9b", "#758c90", "#c8cbb2"],
        texture: "hummocky peat, frost boils and lichen pavement",
        silhouette: ["dwarf shrub mat", "frost mound", "solitary boulder"],
        atmosphere: "low grey cloud and a cold ground mist",
        waterLook: "dark thaw pools ringed with pale sedge",
        landmark: freeze({ id: "frost-mound", label: "Giant frost mound", scale: 1.4, rarity: 0.3 }),
        seasons: [
            seasonal("spring", "Spring", "#a9b094", "#d0d2b6", "thawing peat and standing water"),
            seasonal("summer", "Summer", "#9aa886", "#c6cbab", "flowering cushion and cotton grass"),
            seasonal("autumn", "Autumn", "#a2937c", "#c9b58f", "rust sedge and early frost"),
            seasonal("winter", "Winter", "#c2c4b4", "#e6e9df", "wind-scoured snow and dark scrub")
        ],
        lod: { detail: 0.8, simplified: 0.34, impostor: 0.16, trees: 1, shadows: "baked" }
    }),
    taiga: identity("taiga", "Taiga", "boreal", {
        palette: ["#41624f", "#718f78", "#284234", "#7b94a8", "#416579", "#9fb2ad"],
        texture: "needle litter, feather moss and wet hollows",
        silhouette: ["spire spruce", "snow-laden bough", "fallen trunk"],
        atmosphere: "blue spruce shade and low ground mist",
        waterLook: "black bog pools with a brown peat stain",
        landmark: freeze({ id: "great-spruce", label: "Great spruce", scale: 2.0, rarity: 0.2 }),
        seasons: [
            seasonal("spring", "Spring", "#4b7254", "#87a17d", "new candles and melting muskeg"),
            seasonal("summer", "Summer", "#3d6348", "#78966f", "deep green and dark shade"),
            seasonal("autumn", "Autumn", "#59694b", "#a89a62", "larch gold among the spruce"),
            seasonal("winter", "Winter", "#637a72", "#d8e4e2", "snow-laden spires and blue shade")
        ],
        lod: { detail: 0.88, simplified: 0.42, impostor: 0.2, trees: 3, shadows: "baked" }
    }),
    swamp: identity("swamp", "Wetland", "wetland", {
        palette: ["#667a59", "#8f9c79", "#3f513f", "#8d9b62", "#4c6a60", "#a8b79a"],
        texture: "saturated peat, root tangles and standing water",
        silhouette: ["bare alder", "reed wall", "moss-hung bough"],
        atmosphere: "warm marsh mist and drifting insects",
        waterLook: "still brown water with floating weed and bubbles",
        landmark: freeze({ id: "sunken-shrine", label: "Sunken shrine", scale: 1.4, rarity: 0.22 }),
        seasons: [
            seasonal("spring", "Spring", "#6f8460", "#a3b184", "flooded carr and frog song"),
            seasonal("summer", "Summer", "#5f7455", "#8fa46d", "thick reeds and green scum"),
            seasonal("autumn", "Autumn", "#7a7454", "#b19a68", "rust sedge and mist"),
            seasonal("winter", "Winter", "#7b877a", "#c9d3c7", "grey ice and bare stems")
        ],
        lod: { detail: 0.82, simplified: 0.36, impostor: 0.16, trees: 2, shadows: "baked" }
    }),
    desert: identity("desert", "Desert", "arid", {
        palette: ["#c4ab70", "#e0cb98", "#947b4c", "#a78a5c", "#5f8f96", "#e8d6a8"],
        texture: "rippled sand, desert varnish and cracked clay pans",
        silhouette: ["dune crest", "flat acacia", "eroded mesa"],
        atmosphere: "heat shimmer and blowing dust",
        waterLook: "clear spring pool under a bright salt rim",
        landmark: freeze({ id: "wind-arch", label: "Wind-cut arch", scale: 2.4, rarity: 0.16 }),
        seasons: [
            seasonal("spring", "Spring", "#c8b078", "#e6d3a0", "cool nights and a brief green flush"),
            seasonal("summer", "Summer", "#d2b477", "#f0dca6", "white heat and dust devils"),
            seasonal("autumn", "Autumn", "#c0a26c", "#dcc38d", "long shadows and dry wind"),
            seasonal("winter", "Winter", "#b8a776", "#dfd2b2", "cold clear air and frost at dawn")
        ],
        lod: { detail: 0.78, simplified: 0.32, impostor: 0.14, trees: 1, shadows: "baked" }
    }),
    steppe: identity("steppe", "Steppe", "dry", {
        palette: ["#a69a63", "#c9bd85", "#77703f", "#b39a5e", "#6f8f92", "#d6c891"],
        texture: "tight bunch grass, bare earth and shallow gullies",
        silhouette: ["feather-grass plume", "low thorn bush", "solitary grave stone"],
        atmosphere: "dry wind and a wide pale sky",
        waterLook: "shallow seasonal stream with muddy banks",
        landmark: freeze({ id: "kurgan", label: "Old kurgan", scale: 1.7, rarity: 0.24 }),
        seasons: [
            seasonal("spring", "Spring", "#a9a066", "#d0c78e", "green flush and wild tulips"),
            seasonal("summer", "Summer", "#b0a05f", "#ded092", "straw grass and hot wind"),
            seasonal("autumn", "Autumn", "#a08c55", "#c8af72", "seed heads and dust"),
            seasonal("winter", "Winter", "#a9a78f", "#d9d8c2", "dry snow over dark grass")
        ],
        lod: { detail: 0.8, simplified: 0.34, impostor: 0.15, trees: 1, shadows: "baked" }
    }),
    meadow: identity("meadow", "Meadow", "temperate", {
        palette: ["#7b9c5b", "#a3bd7c", "#55743f", "#c4b45c", "#5e8894", "#bcd3a6"],
        texture: "fine grass, herb rosettes and worm-cast soil",
        silhouette: ["rounded hedge tree", "flower drift", "hay stook"],
        atmosphere: "pollen haze and soft summer light",
        waterLook: "clear brook with cress and gravel",
        landmark: freeze({ id: "great-oak", label: "Great oak", scale: 1.9, rarity: 0.26 }),
        seasons: [
            seasonal("spring", "Spring", "#7fa35c", "#b8cf86", "fresh growth and blossom"),
            seasonal("summer", "Summer", "#77984f", "#a9bd72", "tall flower-rich hay meadow"),
            seasonal("autumn", "Autumn", "#9a9555", "#c0a96a", "seed heads and stubble"),
            seasonal("winter", "Winter", "#9aa58a", "#d6ddce", "pale frost and wet grass")
        ],
        lod: { detail: 0.82, simplified: 0.36, impostor: 0.16, trees: 2, shadows: "baked" }
    }),
    forest: identity("forest", "Woodland", "temperate", {
        palette: ["#47764f", "#739a6c", "#2c4f36", "#b08a54", "#4a6f74", "#9db79a"],
        texture: "leaf litter, wood anemone drifts and mossy stumps",
        silhouette: ["broad crown", "coppice stool", "arching bough"],
        atmosphere: "green shade with slanting light and faint mist",
        waterLook: "shaded stream with leaf drift and root undercut",
        landmark: freeze({ id: "hollow-tree", label: "Hollow tree", scale: 1.8, rarity: 0.26 }),
        seasons: [
            seasonal("spring", "Spring", "#4f7d55", "#86a86f", "bluebell floor and fresh leaf"),
            seasonal("summer", "Summer", "#3f6e48", "#6e9563", "deep shade and closed canopy"),
            seasonal("autumn", "Autumn", "#6f7446", "#b98a4c", "copper leaf fall and mast"),
            seasonal("winter", "Winter", "#6d7b6c", "#c8d2c4", "bare crowns and grey light")
        ],
        lod: { detail: 0.86, simplified: 0.4, impostor: 0.18, trees: 3, shadows: "baked" }
    }),
    "dense-forest": identity("dense-forest", "Deep forest", "tropical", {
        palette: ["#315e41", "#548662", "#1c3f2c", "#8dbb6a", "#3c6a67", "#89b39b"],
        texture: "deep humus, buttress roots and broad wet leaves",
        silhouette: ["emergent crown", "liana curtain", "fan palm"],
        atmosphere: "hot humid haze with shafts of light",
        waterLook: "dark tea-coloured creek under overhanging fern",
        landmark: freeze({ id: "giant-fig", label: "Giant fig", scale: 2.3, rarity: 0.22 }),
        seasons: [
            seasonal("spring", "Spring", "#356345", "#6d9f73", "flooded floor and new growth"),
            seasonal("summer", "Summer", "#2c5a3c", "#5d945f", "full canopy and heavy rain"),
            seasonal("autumn", "Autumn", "#3d6444", "#8ca45c", "fruit and scattered leaf drop"),
            seasonal("winter", "Winter", "#446a4d", "#a7c29a", "thinner light and mist")
        ],
        lod: { detail: 0.88, simplified: 0.42, impostor: 0.2, trees: 4, shadows: "baked" }
    })
});

export const BIOME_IDENTITY_IDS = freeze(Object.keys(BIOME_IDENTITY));

export function biomeIdentity(biome) {
    return BIOME_IDENTITY[biome] || BIOME_IDENTITY.meadow;
}

// ── fantastic biome looks (1.2.16 families) ───────────────────
// So the rare atlas is not a different visual language: each family gets a
// palette, atmosphere and landmark that a renderer can consume.
export const SPECIAL_BIOME_LOOKS = freeze({
    "enchanted-wood": freeze({ palette: ["#4b7a63", "#8fc7a0", "#2c5144", "#c6a6e6", "#4b7a8a", "#b9dcc9"], atmosphere: "drifting motes and a violet ground glow", landmark: "singing grove" }),
    "crystal-land": freeze({ palette: ["#9db8c9", "#e2f0f5", "#5f7f92", "#c9e8f2", "#7fb0c4", "#dcecf2"], atmosphere: "prismatic refraction and cold sparkle", landmark: "crystal spire" }),
    "fungal-wilds": freeze({ palette: ["#6a5a72", "#a08aac", "#453a4e", "#d8b46a", "#586a72", "#b6a6c0"], atmosphere: "spore haze and soft bioluminescence", landmark: "vast glowcap" }),
    "blighted-land": freeze({ palette: ["#6f6652", "#948a70", "#453f33", "#8a6a4a", "#5c5a4c", "#9b927c"], atmosphere: "grey ash fall and a sickly yellow light", landmark: "blight scar" }),
    "glass-desert": freeze({ palette: ["#c9b98f", "#eadfbd", "#9a8760", "#a8d8d4", "#7fb6b2", "#e4dcc4"], atmosphere: "glass glare and a wavering horizon", landmark: "glass field" }),
    "mist-moor": freeze({ palette: ["#77877e", "#a9b8ad", "#4e5c55", "#9a8fa8", "#6b838a", "#c2cec5"], atmosphere: "low mist banks and dim green light", landmark: "moor pearl pool" }),
    "ash-shadow": freeze({ palette: ["#5b5550", "#7d766c", "#37332f", "#c46a4a", "#586466", "#8a8178"], atmosphere: "ash cloud and a dull red underlight", landmark: "ash cone" }),
    "hollow-depths": freeze({ palette: ["#4c4a52", "#6e6b76", "#2c2a31", "#c9a15e", "#465a62", "#7d7a86"], atmosphere: "deep shadow and amber glimmers", landmark: "great cavern mouth" }),
    "magic-mountains": freeze({ palette: ["#6a6f86", "#9fa5ba", "#3f4358", "#c9b2ee", "#5f7d96", "#b2b7cc"], atmosphere: "thin air with floating light and aurora", landmark: "star-metal peak" })
});

// ── vegetation ────────────────────────────────────────────────
// Species are chosen by biome first, then by soil, moisture, light, altitude,
// season and human pressure. `variants`, `ages` and `orientations` are real
// render choices: the renderer already draws several crown/trunk forms.
function plant(id, label, form, biomes, data) {
    return freeze({
        id,
        label,
        form,
        biomes: list(biomes),
        variants: list(data.variants),
        ages: list(data.ages || ["sapling", "young", "mature", "ancient"]),
        orientations: list(data.orientations || ["radial", "leaning", "wind-bent"]),
        size: range(data.size[0], data.size[1]),
        soil: range(data.soil[0], data.soil[1]),
        moisture: range(data.moisture[0], data.moisture[1]),
        light: range(data.light[0], data.light[1]),
        height: range(data.height?.[0] ?? 0, data.height?.[1] ?? 1),
        seasons: list(data.seasons || [0, 1, 2, 3]),
        cluster: data.cluster ?? 0.5,
        density: data.density ?? 0.6,
        weight: data.weight ?? 1,
        layer: data.layer || (form === "tree" || form === "conifer" ? "canopy" : form === "shrub" ? "understory" : "ground"),
        silhouette: data.silhouette || form,
        color: data.color || "#4d7a45"
    });
}

export const BIOME_PLANTS = freeze({
    reed: plant("reed", "Reed", "grass", ["water", "swamp", "beach"], {
        variants: ["common reed", "bur-reed", "reed canary"], size: [0.5, 1.15],
        soil: [0.1, 0.8], moisture: [0.7, 1], light: [0.3, 1], cluster: 0.86, density: 0.9,
        silhouette: "feathery reed wall", color: "#8a9a5c"
    }),
    "water-lily": plant("water-lily", "Water lily", "aquatic", ["water", "swamp"], {
        variants: ["white lily", "yellow lily", "fringed lily"], size: [0.2, 0.5],
        ages: ["new pad", "flowering", "mature"], orientations: ["floating"], sizeNote: true,
        soil: [0.05, 0.5], moisture: [0.9, 1], light: [0.4, 1], cluster: 0.7, density: 0.55,
        silhouette: "flat floating pad", color: "#6d9a72"
    }),
    bulrush: plant("bulrush", "Bulrush", "grass", ["water", "swamp"], {
        variants: ["soft rush", "hard rush", "club rush"], size: [0.4, 1.0],
        soil: [0.1, 0.6], moisture: [0.8, 1], light: [0.35, 1], cluster: 0.8, density: 0.75,
        silhouette: "spike reed", color: "#7e8a58"
    }),
    eelgrass: plant("eelgrass", "Eelgrass", "aquatic", ["water", "beach"], {
        variants: ["dwarf eelgrass", "broad eelgrass", "tidal wrack"], size: [0.2, 0.6],
        orientations: ["current-drawn"], soil: [0.05, 0.5], moisture: [0.85, 1], light: [0.2, 0.9],
        cluster: 0.55, density: 0.5, silhouette: "submerged ribbon", color: "#5e8a6a"
    }),
    marram: plant("marram", "Marram grass", "grass", ["beach"], {
        variants: ["dune marram", "sand sedge", "sea couch"], size: [0.3, 0.8],
        soil: [0.05, 0.4], moisture: [0.15, 0.55], light: [0.6, 1], cluster: 0.75, density: 0.7,
        silhouette: "wind-swept tuft", color: "#b0a96a"
    }),
    "sea-holly": plant("sea-holly", "Sea holly", "herb", ["beach"], {
        variants: ["blue holly", "dune thistle", "sea lavender"], size: [0.2, 0.55],
        soil: [0.05, 0.4], moisture: [0.2, 0.5], light: [0.5, 1], cluster: 0.3, density: 0.3,
        silhouette: "spiny rosette", color: "#7a8fa0"
    }),
    saltwort: plant("saltwort", "Saltwort", "herb", ["beach", "swamp"], {
        variants: ["glasswort", "orache", "sea blite"], size: [0.15, 0.45],
        soil: [0.05, 0.45], moisture: [0.5, 0.9], light: [0.5, 1], cluster: 0.55, density: 0.45,
        silhouette: "fleshy low mat", color: "#8a9a6a"
    }),
    "sea-buckthorn": plant("sea-buckthorn", "Sea buckthorn", "shrub", ["beach", "meadow"], {
        variants: ["dune buckthorn", "bay willow", "sea currant"], size: [0.6, 1.4],
        soil: [0.15, 0.6], moisture: [0.25, 0.65], light: [0.4, 1], cluster: 0.6, density: 0.4,
        silhouette: "silver thorn bush", color: "#9aa87a"
    }),
    "dwarf-willow": plant("dwarf-willow", "Dwarf willow", "shrub", ["snow", "tundra"], {
        variants: ["polar willow", "net willow", "creeping willow"], size: [0.1, 0.4],
        ages: ["bud", "carpet", "mature mat"], orientations: ["creeping", "prostrate"],
        soil: [0.2, 0.6], moisture: [0.4, 0.85], light: [0.4, 1], cluster: 0.7, density: 0.5,
        silhouette: "prostrate mat", color: "#8b9a6a"
    }),
    "snow-lichen": plant("snow-lichen", "Snow lichen", "lichen", ["snow", "tundra", "rock"], {
        variants: ["reindeer moss", "crust lichen", "frost lichen"], size: [0.05, 0.25],
        ages: ["crust", "patch", "old mat"], orientations: ["flat"], soil: [0.05, 0.4],
        moisture: [0.2, 0.6], light: [0.5, 1], cluster: 0.8, density: 0.55,
        silhouette: "pale crust patch", color: "#c2cbb2"
    }),
    "arctic-grass": plant("arctic-grass", "Arctic grass", "grass", ["snow", "tundra"], {
        variants: ["polar grass", "snow bent", "frost sedge"], size: [0.15, 0.5],
        soil: [0.15, 0.5], moisture: [0.4, 0.8], light: [0.45, 1], cluster: 0.72, density: 0.55,
        silhouette: "short tussock", color: "#a8b08a"
    }),
    "mountain-avens": plant("mountain-avens", "Mountain avens", "herb", ["snow", "rock", "tundra"], {
        variants: ["white avens", "alpine cinquefoil", "saxifrage"], size: [0.1, 0.35],
        soil: [0.1, 0.45], moisture: [0.3, 0.7], light: [0.5, 1], cluster: 0.45, density: 0.3,
        silhouette: "cushion flower", color: "#d8d2b0"
    }),
    juniper: plant("juniper", "Juniper", "conifer", ["rock", "tundra", "meadow"], {
        variants: ["common juniper", "dwarf juniper", "spreading juniper"], size: [0.5, 1.5],
        soil: [0.15, 0.65], moisture: [0.2, 0.6], light: [0.4, 1], cluster: 0.5, density: 0.35,
        silhouette: "spreading evergreen", color: "#5f7a5c"
    }),
    saxifrage: plant("saxifrage", "Saxifrage", "herb", ["rock", "snow"], {
        variants: ["purple saxifrage", "mossy saxifrage", "stonecrop"], size: [0.05, 0.25],
        soil: [0.05, 0.35], moisture: [0.25, 0.65], light: [0.5, 1], cluster: 0.6, density: 0.35,
        silhouette: "rock cushion", color: "#9a8a9a"
    }),
    "alpine-grass": plant("alpine-grass", "Alpine grass", "grass", ["rock", "snow", "tundra"], {
        variants: ["fescue", "blue moor grass", "alpine oat"], size: [0.2, 0.6],
        soil: [0.15, 0.5], moisture: [0.3, 0.7], light: [0.5, 1], cluster: 0.7, density: 0.5,
        silhouette: "fine upland tussock", color: "#93a06a"
    }),
    "dwarf-pine": plant("dwarf-pine", "Dwarf pine", "conifer", ["rock", "tundra", "snow"], {
        variants: ["mugo pine", "krummholz pine", "wind pine"], size: [0.4, 1.3],
        soil: [0.15, 0.55], moisture: [0.3, 0.7], light: [0.4, 1], cluster: 0.6, density: 0.4,
        silhouette: "krummholz mat", color: "#43604a"
    }),
    "dwarf-birch": plant("dwarf-birch", "Dwarf birch", "shrub", ["tundra", "snow", "taiga"], {
        variants: ["bog birch", "mountain birch", "scrub birch"], size: [0.3, 1.1],
        soil: [0.2, 0.6], moisture: [0.45, 0.85], light: [0.35, 1], cluster: 0.7, density: 0.55,
        silhouette: "low twiggy scrub", color: "#7d8a5c"
    }),
    cottongrass: plant("cottongrass", "Cottongrass", "grass", ["tundra", "swamp"], {
        variants: ["hare's tail", "thin cottongrass", "sheathed cottongrass"], size: [0.25, 0.7],
        soil: [0.1, 0.5], moisture: [0.7, 1], light: [0.35, 1], cluster: 0.8, density: 0.65,
        silhouette: "white seed head", color: "#d6d6c4"
    }),
    "reindeer-moss": plant("reindeer-moss", "Reindeer moss", "lichen", ["tundra", "taiga"], {
        variants: ["grey reindeer moss", "star moss", "cup lichen"], size: [0.05, 0.3],
        ages: ["crust", "tuft", "old carpet"], orientations: ["flat"], soil: [0.05, 0.4],
        moisture: [0.25, 0.65], light: [0.4, 1], cluster: 0.85, density: 0.6,
        silhouette: "brittle pale tuft", color: "#b9bfa8"
    }),
    bearberry: plant("bearberry", "Bearberry", "shrub", ["tundra", "rock", "taiga"], {
        variants: ["red bearberry", "alpine bearberry", "crowberry"], size: [0.1, 0.35],
        orientations: ["creeping"], soil: [0.1, 0.45], moisture: [0.25, 0.65], light: [0.45, 1],
        cluster: 0.75, density: 0.45, silhouette: "creeping berry mat", color: "#6f7f52"
    }),
    spruce: plant("spruce", "Spruce", "conifer", ["taiga", "snow", "forest"], {
        variants: ["Norway spruce", "white spruce", "black spruce"], size: [1.0, 2.4],
        soil: [0.2, 0.7], moisture: [0.45, 0.9], light: [0.2, 0.9], cluster: 0.75, density: 0.8,
        silhouette: "narrow spire", color: "#3f6049"
    }),
    larch: plant("larch", "Larch", "conifer", ["taiga", "rock"], {
        variants: ["Siberian larch", "European larch", "mountain larch"], size: [0.9, 2.1],
        soil: [0.2, 0.7], moisture: [0.4, 0.85], light: [0.3, 1], cluster: 0.6, density: 0.55,
        silhouette: "open feathery conifer", color: "#6f8a4c"
    }),
    pine: plant("pine", "Pine", "conifer", ["taiga", "forest", "beach", "rock"], {
        variants: ["Scots pine", "stone pine", "shore pine"], size: [0.9, 2.2],
        soil: [0.15, 0.7], moisture: [0.3, 0.75], light: [0.4, 1], cluster: 0.55, density: 0.5,
        silhouette: "flat-topped pine", color: "#4f7048"
    }),
    birch: plant("birch", "Birch", "tree", ["taiga", "forest", "meadow", "tundra"], {
        variants: ["silver birch", "downy birch", "bog birch"], size: [0.7, 1.8],
        soil: [0.2, 0.75], moisture: [0.4, 0.85], light: [0.35, 1], cluster: 0.55, density: 0.5,
        silhouette: "pale airy crown", color: "#8aa85c"
    }),
    "feather-moss": plant("feather-moss", "Feather moss", "moss", ["taiga", "forest", "swamp"], {
        variants: ["red-stem moss", "sphagnum fringe", "haircap"], size: [0.03, 0.15],
        ages: ["patch", "carpet", "deep mat"], orientations: ["flat"], soil: [0.1, 0.6],
        moisture: [0.6, 1], light: [0.1, 0.7], cluster: 0.9, density: 0.85,
        silhouette: "deep green carpet", color: "#4f6d4c"
    }),
    cowberry: plant("cowberry", "Cowberry", "shrub", ["taiga", "forest"], {
        variants: ["lingonberry", "bilberry", "heather"], size: [0.1, 0.4],
        orientations: ["creeping"], soil: [0.15, 0.55], moisture: [0.4, 0.8], light: [0.2, 0.85],
        cluster: 0.8, density: 0.6, silhouette: "low berry carpet", color: "#6a7a4a"
    }),
    alder: plant("alder", "Alder", "tree", ["swamp", "forest", "water"], {
        variants: ["black alder", "grey alder", "carr alder"], size: [0.8, 1.9],
        soil: [0.35, 0.9], moisture: [0.7, 1], light: [0.3, 0.9], cluster: 0.7, density: 0.6,
        silhouette: "wet-ground broad crown", color: "#5c7a4c"
    }),
    willow: plant("willow", "Willow", "tree", ["swamp", "beach", "meadow", "water"], {
        variants: ["white willow", "crack willow", "osier"], size: [0.6, 1.8],
        soil: [0.25, 0.85], moisture: [0.6, 1], light: [0.4, 1], cluster: 0.6, density: 0.55,
        silhouette: "weeping crown", color: "#7d9460"
    }),
    sphagnum: plant("sphagnum", "Sphagnum", "moss", ["swamp", "tundra"], {
        variants: ["red bog moss", "flat bog moss", "hummock moss"], size: [0.03, 0.16],
        ages: ["patch", "mound", "deep bog"], orientations: ["flat"], soil: [0.05, 0.4],
        moisture: [0.85, 1], light: [0.2, 0.9], cluster: 0.92, density: 0.9,
        silhouette: "saturated bog mound", color: "#7a8a54"
    }),
    "marsh-marigold": plant("marsh-marigold", "Marsh marigold", "herb", ["swamp", "water"], {
        variants: ["kingcup", "bogbean", "water mint"], size: [0.15, 0.45],
        soil: [0.2, 0.7], moisture: [0.8, 1], light: [0.4, 1], cluster: 0.55, density: 0.4,
        silhouette: "gold flower clump", color: "#c9b84c"
    }),
    acacia: plant("acacia", "Acacia", "tree", ["desert", "steppe", "savanna"], {
        variants: ["umbrella thorn", "camel thorn", "whistling thorn"], size: [0.7, 1.9],
        soil: [0.1, 0.55], moisture: [0.08, 0.4], light: [0.6, 1], cluster: 0.35, density: 0.3,
        silhouette: "flat umbrella crown", color: "#6f7a44"
    }),
    sagebrush: plant("sagebrush", "Sagebrush", "shrub", ["desert", "steppe"], {
        variants: ["big sage", "dwarf sage", "silver sage"], size: [0.25, 0.8],
        soil: [0.05, 0.45], moisture: [0.05, 0.32], light: [0.6, 1], cluster: 0.55, density: 0.35,
        silhouette: "silver-grey scrub", color: "#8a8a6a"
    }),
    "sand-grass": plant("sand-grass", "Sand grass", "grass", ["desert", "steppe", "beach"], {
        variants: ["dune grass", "needle grass", "desert bunch"], size: [0.15, 0.5],
        soil: [0.03, 0.35], moisture: [0.03, 0.28], light: [0.6, 1], cluster: 0.6, density: 0.35,
        silhouette: "sparse needle tuft", color: "#b0a46a"
    }),
    "date-palm": plant("date-palm", "Date palm", "palm", ["desert"], {
        variants: ["date palm", "fan palm", "doum palm"], size: [1.0, 2.2],
        soil: [0.2, 0.7], moisture: [0.35, 0.75], light: [0.6, 1], cluster: 0.4, density: 0.25,
        height: [0.05, 0.45], silhouette: "single palm crown", color: "#5f7a3f"
    }),
    succulent: plant("succulent", "Succulent", "succulent", ["desert"], {
        variants: ["stonecrop", "aloe", "cactus"], size: [0.1, 0.5],
        soil: [0.05, 0.4], moisture: [0.03, 0.25], light: [0.6, 1], cluster: 0.4, density: 0.25,
        silhouette: "fleshy rosette", color: "#7a8a5a"
    }),
    "feather-grass": plant("feather-grass", "Feather grass", "grass", ["steppe"], {
        variants: ["needle grass", "porcupine grass", "silky grass"], size: [0.3, 0.85],
        soil: [0.25, 0.7], moisture: [0.15, 0.4], light: [0.5, 1], cluster: 0.85, density: 0.8,
        silhouette: "silver plume sea", color: "#c0b47a"
    }),
    fescue: plant("fescue", "Fescue", "grass", ["steppe", "meadow", "forest"], {
        variants: ["sheep fescue", "tall fescue", "red fescue"], size: [0.2, 0.6],
        soil: [0.2, 0.7], moisture: [0.2, 0.6], light: [0.45, 1], cluster: 0.8, density: 0.75,
        silhouette: "fine bunch grass", color: "#8a9a58"
    }),
    wormwood: plant("wormwood", "Wormwood", "herb", ["steppe"], {
        variants: ["silver wormwood", "santolina", "tansy"], size: [0.25, 0.7],
        soil: [0.1, 0.5], moisture: [0.1, 0.35], light: [0.55, 1], cluster: 0.45, density: 0.3,
        silhouette: "silver aromatic bush", color: "#a8a88a"
    }),
    "wild-tulip": plant("wild-tulip", "Wild tulip", "herb", ["steppe", "meadow"], {
        variants: ["wild tulip", "crocus", "anemone"], size: [0.1, 0.3],
        seasons: [0, 1], soil: [0.25, 0.7], moisture: [0.2, 0.45], light: [0.5, 1],
        cluster: 0.35, density: 0.18, silhouette: "spring flower drift", color: "#c98a5a"
    }),
    clover: plant("clover", "Clover", "herb", ["meadow", "forest"], {
        variants: ["red clover", "white clover", "birdsfoot"], size: [0.08, 0.25],
        soil: [0.3, 0.8], moisture: [0.3, 0.7], light: [0.4, 1], cluster: 0.6, density: 0.5,
        silhouette: "low flower mat", color: "#8aa060"
    }),
    daisy: plant("daisy", "Daisy", "herb", ["meadow"], {
        variants: ["ox-eye daisy", "buttercup", "knapweed"], size: [0.1, 0.4],
        seasons: [0, 1], soil: [0.3, 0.8], moisture: [0.3, 0.65], light: [0.5, 1],
        cluster: 0.55, density: 0.45, silhouette: "white flower drift", color: "#d8d8b8"
    }),
    hawthorn: plant("hawthorn", "Hawthorn", "shrub", ["meadow", "steppe"], {
        variants: ["common hawthorn", "blackthorn", "dog rose"], size: [0.5, 1.2],
        soil: [0.25, 0.75], moisture: [0.25, 0.6], light: [0.4, 1], cluster: 0.6, density: 0.4,
        silhouette: "hedge bush", color: "#6f8a4f"
    }),
    oak: plant("oak", "Oak", "tree", ["forest", "meadow"], {
        variants: ["pedunculate oak", "sessile oak", "gnarled oak"], size: [1.0, 2.2],
        soil: [0.35, 0.9], moisture: [0.35, 0.75], light: [0.3, 1], cluster: 0.45, density: 0.45,
        silhouette: "broad heavy crown", color: "#557a45"
    }),
    beech: plant("beech", "Beech", "tree", ["forest", "dense-forest"], {
        variants: ["common beech", "hornbeam", "sweet chestnut"], size: [0.9, 2.0],
        soil: [0.3, 0.85], moisture: [0.45, 0.85], light: [0.2, 0.85], cluster: 0.6, density: 0.6,
        silhouette: "smooth domed crown", color: "#5f7f48"
    }),
    hazel: plant("hazel", "Hazel", "shrub", ["forest", "meadow"], {
        variants: ["common hazel", "filbert", "guelder rose"], size: [0.4, 1.2],
        soil: [0.3, 0.8], moisture: [0.35, 0.75], light: [0.3, 0.95], cluster: 0.7, density: 0.55,
        silhouette: "multi-stem thicket", color: "#7a8a4a"
    }),
    bluebell: plant("bluebell", "Bluebell", "herb", ["forest"], {
        variants: ["bluebell", "wood anemone", "wild garlic"], size: [0.08, 0.3],
        seasons: [0], soil: [0.3, 0.8], moisture: [0.45, 0.85], light: [0.15, 0.65],
        cluster: 0.8, density: 0.5, silhouette: "violet spring carpet", color: "#7a6aa8"
    }),
    fern: plant("fern", "Fern", "fern", ["forest", "dense-forest", "swamp"], {
        variants: ["male fern", "bracken", "royal fern"], size: [0.25, 0.9],
        soil: [0.25, 0.8], moisture: [0.5, 0.95], light: [0.15, 0.75], cluster: 0.75, density: 0.6,
        silhouette: "arching frond clump", color: "#4f7a48"
    }),
    bramble: plant("bramble", "Bramble", "shrub", ["forest", "meadow"], {
        variants: ["blackberry", "raspberry", "dewberry"], size: [0.2, 0.7],
        orientations: ["arching", "creeping"], soil: [0.25, 0.75], moisture: [0.3, 0.7],
        light: [0.35, 1], cluster: 0.85, density: 0.55, silhouette: "tangled thorn arch", color: "#5f6f3f"
    }),
    mahogany: plant("mahogany", "Mahogany", "tree", ["dense-forest"], {
        variants: ["true mahogany", "ironwood", "rosewood"], size: [1.2, 2.5],
        soil: [0.4, 0.9], moisture: [0.6, 1], light: [0.2, 0.8], cluster: 0.5, density: 0.5,
        silhouette: "emergent broad crown", color: "#3f6a3c"
    }),
    bamboo: plant("bamboo", "Bamboo", "grass", ["dense-forest", "swamp"], {
        variants: ["giant bamboo", "clumping bamboo", "reed bamboo"], size: [0.7, 1.9],
        soil: [0.35, 0.85], moisture: [0.55, 1], light: [0.25, 0.9], cluster: 0.9, density: 0.7,
        silhouette: "feathery cane brake", color: "#7a9a4a"
    }),
    liana: plant("liana", "Liana", "vine", ["dense-forest"], {
        variants: ["rattan", "monkey ladder", "air potato"], size: [0.4, 1.6],
        orientations: ["hanging", "twining"], soil: [0.35, 0.85], moisture: [0.65, 1],
        light: [0.2, 0.8], cluster: 0.6, density: 0.45, layer: "understory",
        silhouette: "hanging rope vine", color: "#5f7a3f"
    }),
    orchid: plant("orchid", "Orchid", "herb", ["dense-forest", "swamp"], {
        variants: ["moth orchid", "slipper orchid", "vanilla"], size: [0.1, 0.4],
        soil: [0.25, 0.7], moisture: [0.6, 0.95], light: [0.15, 0.6], cluster: 0.3, density: 0.2,
        silhouette: "epiphyte flower spike", color: "#c08ab0"
    })
});

export const BIOME_PLANT_IDS = freeze(Object.keys(BIOME_PLANTS));

export const PLANTS_BY_BIOME = freeze(Object.fromEntries(
    BIOME_IDENTITY_IDS.map(biome => [biome, freeze(BIOME_PLANT_IDS.filter(id => BIOME_PLANTS[id].biomes.includes(biome)))]))
);

export function plantsForBiome(biome) {
    return PLANTS_BY_BIOME[biome] || PLANTS_BY_BIOME.meadow;
}

// ── habitats ─────────────────────────────────────────────────
// Habitat definitions describe the structural layers an animal species needs.
// Species themselves are linked from the existing 1.2.19 wildlife catalog.
function habitat(id, label, layers, data) {
    return freeze({
        id: "habitat." + id,
        biome: id,
        label,
        layers: list(layers),
        cover: data.cover,
        water: data.water,
        openness: data.openness,
        shelter: data.shelter,
        notes: data.notes
    });
}

export const BIOME_HABITATS = freeze({
    water: habitat("water", "Open water & shore", ["open water", "reed fringe", "gravel bed"], { cover: 0.18, water: 1, openness: 0.9, shelter: 0.2, notes: "Spawning gravel, deep pools and undisturbed banks." }),
    beach: habitat("beach", "Strand & dune", ["open sand", "drift line", "dune hollow"], { cover: 0.25, water: 0.7, openness: 0.85, shelter: 0.28, notes: "Nesting scrapes, wrack invertebrates and sheltering marram." }),
    snow: habitat("snow", "Snowfield & ice edge", ["open snow", "ice lead", "wind scoured ridge"], { cover: 0.1, water: 0.4, openness: 0.95, shelter: 0.12, notes: "Tracking cover, denning drifts and exposed forage." }),
    rock: habitat("rock", "Crag & scree", ["cliff ledge", "scree slope", "alpine turf"], { cover: 0.3, water: 0.35, openness: 0.55, shelter: 0.55, notes: "Eyries, ledges and stable boulders above open grazing." }),
    tundra: habitat("tundra", "Heath & thaw pool", ["lichen heath", "thaw pool", "dwarf scrub"], { cover: 0.42, water: 0.55, openness: 0.6, shelter: 0.35, notes: "Low cover, insect-rich pools and frost-free burrows." }),
    taiga: habitat("taiga", "Boreal forest", ["spruce canopy", "moss floor", "muskeg hollow"], { cover: 0.82, water: 0.55, openness: 0.25, shelter: 0.75, notes: "Deep winter cover, deadwood and bog openings." }),
    swamp: habitat("swamp", "Marsh & carr", ["reed bed", "alder carr", "open water"], { cover: 0.72, water: 0.95, openness: 0.35, shelter: 0.6, notes: "Nesting reed, wet cover and fish-rich pools." }),
    desert: habitat("desert", "Dune & oasis", ["open sand", "rock shade", "spring pool"], { cover: 0.15, water: 0.14, openness: 0.9, shelter: 0.22, notes: "Shade, rare water and long sightlines." }),
    steppe: habitat("steppe", "Grass plain", ["bunch grass", "burrow bank", "thorn scrub"], { cover: 0.38, water: 0.28, openness: 0.8, shelter: 0.3, notes: "Burrow ground, herd pasture and low lookout scrub." }),
    meadow: habitat("meadow", "Meadow & hedgerow", ["flower meadow", "hedge", "mown margin"], { cover: 0.55, water: 0.45, openness: 0.65, shelter: 0.42, notes: "Pollen, seed, hedge cover and undisturbed margins." }),
    forest: habitat("forest", "Woodland", ["canopy", "understory", "deadwood"], { cover: 0.78, water: 0.4, openness: 0.3, shelter: 0.7, notes: "Mast, browse, den trees and connected canopy." }),
    "dense-forest": habitat("dense-forest", "Rainforest", ["emergent canopy", "mid-story", "forest floor"], { cover: 0.95, water: 0.7, openness: 0.1, shelter: 0.85, notes: "Fruit, epiphytes and deep shade with little ground cover." })
});

// ── resource placement requirements ──────────────────────────
// Derived from the existing resource catalog instead of a second list. The
// requirement vector is the placement rule the atlas/tile sampler reads.
export const BIOME_RESOURCE_REQUIREMENTS = freeze(Object.fromEntries(BIOME_IDENTITY_IDS.map(biome => {
    const rows = BIOME_RESOURCES
        .filter(resource => resource.biomes.includes(biome))
        .map(resource => freeze({
            id: resource.id,
            category: resource.category,
            rarity: resource.rarity,
            stand: resource.stand || null,
            needs: freeze({
                soil: resource.quality?.soil ?? 0.35,
                moisture: resource.quality?.moisture ?? 0.3,
                temperature: resource.quality?.temperature ?? 0.2,
                height: resource.quality?.height ?? 0.15
            })
        }));
    return [biome, freeze(rows)];
})));

export function resourceRequirementsForBiome(biome) {
    return BIOME_RESOURCE_REQUIREMENTS[biome] || [];
}

// ── hazard triggers ──────────────────────────────────────────
// `hazard` names an existing 1.2.20 catalogue row; `when` explains the
// environmental condition in player terms. The trigger is a condition, not a
// second event table: the hazard pass still applies the catalogue mechanic.
function trigger(hazard, when, condition = {}) {
    return freeze({
        hazard,
        when,
        mechanic: HAZARD_CATALOG.find(row => row.id === hazard)?.mechanic || "hazard:storm",
        condition: freeze({
            season: condition.season ? list(condition.season) : null,
            moistureBelow: condition.moistureBelow ?? null,
            moistureAbove: condition.moistureAbove ?? null,
            temperatureBelow: condition.temperatureBelow ?? null,
            temperatureAbove: condition.temperatureAbove ?? null,
            slopeAbove: condition.slopeAbove ?? null,
            waterNear: condition.waterNear ?? null
        })
    });
}

export const BIOME_HAZARD_TRIGGERS = freeze({
    water: freeze([
        trigger("floods", "snowmelt or heavy rain raises the shore", { season: [0, 2], moistureAbove: 0.7 }),
        trigger("water-disease", "warm stagnant water beside settlement", { season: [1], temperatureAbove: 0.6 }),
        trigger("high-winds", "a storm crosses open water", { season: [2, 3] })
    ]),
    beach: freeze([
        trigger("floods", "spring tide and onshore storm", { season: [0, 2], waterNear: true }),
        trigger("sandstorms", "dry wind lifts the dunes", { season: [1], moistureBelow: 0.25 }),
        trigger("high-winds", "salt wind and blown shingle", { season: [3] })
    ]),
    snow: freeze([
        trigger("snowstorms", "a deep low crosses the snowfield", { season: [3, 0], temperatureBelow: 0.2 }),
        trigger("avalanches", "fresh snow loads a steep slope", { season: [0, 3], slopeAbove: 0.45 }),
        trigger("extreme-cold", "clear calm air after snowfall", { season: [3], temperatureBelow: 0.12 })
    ]),
    rock: freeze([
        trigger("rockfalls", "frost widens a joint on the crag", { season: [0, 3], slopeAbove: 0.4 }),
        trigger("landslides", "saturated scree loses its footing", { season: [0, 2], moistureAbove: 0.65 }),
        trigger("avalanches", "wind slab on a high gully", { season: [3, 0], slopeAbove: 0.5 })
    ]),
    tundra: freeze([
        trigger("extreme-cold", "a polar wind drops the night temperature", { season: [3], temperatureBelow: 0.15 }),
        trigger("snowstorms", "a blizzard scours the open heath", { season: [3, 0] }),
        trigger("frost-periods", "a late frost after the thaw", { season: [0], temperatureBelow: 0.3 })
    ]),
    taiga: freeze([
        trigger("snowstorms", "heavy snow bends the spruce", { season: [3, 0], temperatureBelow: 0.3 }),
        trigger("wildfire-zones", "a dry lightning strike in the spruce", { season: [1], moistureBelow: 0.35 }),
        trigger("plant-diseases", "dense even-aged conifer stands", { season: [1, 2] })
    ]),
    swamp: freeze([
        trigger("floods", "the fen backs up after rain", { season: [0, 2], moistureAbove: 0.75 }),
        trigger("water-disease", "warm standing water and biting insects", { season: [1], temperatureAbove: 0.55 }),
        trigger("poisonous-mushrooms", "a damp autumn flush", { season: [2], moistureAbove: 0.7 })
    ]),
    desert: freeze([
        trigger("drought", "the long dry season bites", { season: [1, 2], moistureBelow: 0.2 }),
        trigger("heatwaves", "the sun stands still over the sand", { season: [1], temperatureAbove: 0.75 }),
        trigger("sandstorms", "a dry front lifts the dune crest", { season: [1, 2], moistureBelow: 0.25 })
    ]),
    steppe: freeze([
        trigger("drought", "the spring rain fails", { season: [1], moistureBelow: 0.3 }),
        trigger("high-winds", "a dry gale crosses the open plain", { season: [0, 2] }),
        trigger("steppe-dangers", "herds and riders move through the grass", { season: [1] })
    ]),
    meadow: freeze([
        trigger("heavy-rain", "a slow summer front stalls", { season: [1], moistureAbove: 0.55 }),
        trigger("frost-periods", "a clear spring night freezes the blossom", { season: [0], temperatureBelow: 0.32 }),
        trigger("thunderstorms", "heat builds over the open field", { season: [1], temperatureAbove: 0.62 })
    ]),
    forest: freeze([
        trigger("wildfire-zones", "a dry litter layer under a warm wind", { season: [1], moistureBelow: 0.4 }),
        trigger("high-winds", "a gale opens the canopy", { season: [2, 3] }),
        trigger("plant-diseases", "dense shade and wet leaves", { season: [1, 2], moistureAbove: 0.55 })
    ]),
    "dense-forest": freeze([
        trigger("rainforest-dangers", "a heavy canopy brings flash flooding", { season: [0, 1], moistureAbove: 0.75 }),
        trigger("plant-diseases", "warm damp leaf litter", { season: [1, 2], temperatureAbove: 0.6 }),
        trigger("poisonous-snakes", "warm clearings beside the trail", { season: [1], temperatureAbove: 0.62 })
    ])
});

// ── ground grain and local atmosphere ─────────────────────────
// The bake mixes these amplitudes into the terrain colour. They are small on
// purpose: the base palette carries identity, the grain only breaks up a flat
// fill. Atmosphere rows are read by the landmark overlay, which draws a bounded
// number of motes around visible landmarks instead of simulating weather.
export const BIOME_GROUND_GRAIN = freeze({
    water: 0.018, beach: 0.07, snow: 0.026, rock: 0.062, tundra: 0.044,
    taiga: 0.036, swamp: 0.052, desert: 0.068, steppe: 0.05,
    meadow: 0.034, forest: 0.04, "dense-forest": 0.056
});

export const BIOME_ATMOSPHERE = freeze({
    water: freeze({ kind: "glint", color: "#d8eef0", count: 5, seasons: [0, 1, 2, 3] }),
    beach: freeze({ kind: "sand", color: "#eadfbe", count: 5, seasons: [0, 1, 2] }),
    snow: freeze({ kind: "spindrift", color: "#f4fbfd", count: 7, seasons: [0, 3] }),
    rock: freeze({ kind: "dust", color: "#cbc4b4", count: 4, seasons: [0, 2] }),
    tundra: freeze({ kind: "midge", color: "#d8d2b0", count: 4, seasons: [1] }),
    taiga: freeze({ kind: "needle", color: "#9eae8a", count: 4, seasons: [1, 2] }),
    swamp: freeze({ kind: "firefly", color: "#d8e58a", count: 7, seasons: [1] }),
    desert: freeze({ kind: "dust", color: "#ead6a4", count: 6, seasons: [1, 2] }),
    steppe: freeze({ kind: "pollen", color: "#e2d29a", count: 5, seasons: [0, 1] }),
    meadow: freeze({ kind: "pollen", color: "#f0df9a", count: 6, seasons: [0, 1] }),
    forest: freeze({ kind: "pollen", color: "#d7e3a0", count: 5, seasons: [0, 1] }),
    "dense-forest": freeze({ kind: "spore", color: "#b9e3b0", count: 6, seasons: [0, 1, 2] })
});

// ── level of detail / performance contract ───────────────────
// Values are the zoom thresholds the canvas renderer already uses; the audit
// and panel read them, so a new renderer path cannot silently break the
// detail budget.
export const BIOME_LOD = freeze({
    version: 1,
    detailZoom: 0.85,
    simplifiedZoom: 0.45,
    impostorZoom: 0.24,
    grassZoom: 0.95,
    maxTreesPerTile: 4,
    maxShrubsPerTile: 3,
    maxParticles: 140,
    shadowMode: "baked + contact",
    shadeCadence: "ground baked once; crown shadow at texture cadence",
    tiers: freeze([
        freeze({ id: "detail", zoom: 0.85, trees: "full crown, branch and seasonal leaf", ground: "texture and litter", particles: "mist, pollen and fauna" }),
        freeze({ id: "simplified", zoom: 0.45, trees: "crown silhouette and trunk", ground: "coarse texture tile", particles: "one ambient layer" }),
        freeze({ id: "impostor", zoom: 0.24, trees: "single canopy mark", ground: "biome colour patch", particles: "none" }),
        freeze({ id: "map", zoom: 0.08, trees: "density mark", ground: "biome tint", particles: "none" })
    ])
});

// ── requirement catalog (1.2.22.1–54) ────────────────────────
const requirementGroups = freeze({
    generation: "Generation & shape",
    vegetation: "Vegetation",
    identity: "Visual identity",
    performance: "Performance",
    architecture: "Architecture",
    verification: "Verification"
});

const requirementRows = [];
function requirement(id, key, label, group) {
    requirementRows.push(Object.freeze({
        id: "1.2.22." + id,
        number: id,
        key,
        label,
        labelDe: label,
        group,
        groupLabel: requirementGroups[group]
    }));
}

requirement(1, "multi-parameter", "Biomes are generated from several environmental parameters", "generation");
requirement(2, "no-rectangles", "No simple rectangular biome areas", "generation");
requirement(3, "no-checkerboard", "No artificial-looking chequerboard patterns", "generation");
requirement(4, "organic-boundaries", "Organic borders and intermediate zones", "generation");
requirement(5, "varied-patches", "Biome patches differ in size and shape", "generation");
requirement(6, "regional-coherence", "Regional coherence and plausible distribution", "generation");
requirement(7, "elevation-water", "Elevation and water bodies are taken into account", "generation");
requirement(8, "terrain-cooperation", "Generation cooperates with the terrain generator", "generation");
requirement(9, "plants-by-biome", "Plants are chosen according to biome", "vegetation");
requirement(10, "spatial-plausibility", "Spatially plausible plant distribution", "vegetation");
requirement(11, "plant-variants", "Several plant variants", "vegetation");
requirement(12, "size-orientation-age", "Different sizes, orientations and age stages", "vegetation");
requirement(13, "no-repetition", "No conspicuous repetition", "vegetation");
requirement(14, "natural-clusters", "Natural grouping into clumps and groves", "vegetation");
requirement(15, "soil-moisture-light", "Dependence on soil, moisture and light", "vegetation");
requirement(16, "seasonal-plants", "Seasonal plant variants", "vegetation");
requirement(17, "density-variation", "Different vegetation densities", "vegetation");
requirement(18, "settlement-impact", "Buildings and human intervention are respected", "vegetation");
requirement(19, "biome-readable", "Every biome is recognisable from the normal camera", "identity");
requirement(20, "palettes", "Its own colour palette per biome", "identity");
requirement(21, "silhouettes", "Its own vegetation silhouettes", "identity");
requirement(22, "ground-textures", "Its own ground and surface textures", "identity");
requirement(23, "atmosphere", "Its own atmospheric effects", "identity");
requirement(24, "water-look", "Its own water and moisture presentation", "identity");
requirement(25, "seasonal-looks", "Its own seasonal appearance", "identity");
requirement(26, "landmarks", "Distinct landmarks for important biomes", "identity");
requirement(27, "fantastic-biomes", "Visually independent fantastic biomes", "identity");
requirement(28, "distance-detail", "Vegetation detail depends on camera distance", "performance");
requirement(29, "tree-lod", "LOD system for trees and larger plants", "performance");
requirement(30, "distance-simplification", "Simplified representation of distant vegetation", "performance");
requirement(31, "instancing", "Instancing and efficient reuse of suitable resources", "performance");
requirement(32, "bounded-particles", "Dynamic particle effects are bounded", "performance");
requirement(33, "shadows", "Efficient shadow calculation", "performance");
requirement(34, "no-blade-simulation", "No unnecessary simulation of single grass blades", "performance");
requirement(35, "ecological-abstraction", "Ecological simulation on a suitable abstraction level", "performance");
requirement(36, "large-map-detail", "Detail without hurting large maps", "performance");
requirement(37, "stable-ids", "Unique internal identifier for every biome", "architecture");
requirement(38, "central-registry", "Central management of biome definitions", "architecture");
requirement(39, "plant-assignment", "Plants assigned to biomes and environmental conditions", "architecture");
requirement(40, "animal-habitats", "Own habitat definitions for animal species", "architecture");
requirement(41, "resource-placement", "Resources linked to biome and site requirements", "architecture");
requirement(42, "hazard-triggers", "Hazards triggered by traceable environmental conditions", "architecture");
requirement(43, "seasonal-variants", "Central definition of seasonal variants", "architecture");
requirement(44, "extensibility", "New biomes without extensive changes to existing systems", "architecture");
requirement(45, "per-biome-tests", "Every biome tested individually", "verification");
requirement(46, "season-tests", "Every biome checked in several seasons", "verification");
requirement(47, "transition-tests", "Transitions between relevant biome pairs checked", "verification");
requirement(48, "repetition-audit", "Vegetation distribution examined for repetition", "verification");
requirement(49, "resource-audit", "Resources checked for plausible distribution", "verification");
requirement(50, "fauna-audit", "Animal species checked against suitable habitats", "verification");
requirement(51, "hazard-audit", "Hazards checked for traceable triggering", "verification");
requirement(52, "performance-audit", "Performance checked on large maps", "verification");
requirement(53, "seam-audit", "No visible biome borders or rendering errors", "verification");
requirement(54, "regression-audit", "No regression of terrain, building or economy systems", "verification");

export const BIOME_GENERATION_REQUIREMENTS = freeze(requirementRows);
export const BIOME_GENERATION_REQUIREMENT_BY_ID = freeze(Object.fromEntries(requirementRows.map(row => [row.id, row])));
export const BIOME_GENERATION_REQUIREMENT_GROUPS = requirementGroups;

export function biomeProfileFor(biome) {
    return BIOME_PROFILES[biome] || BIOME_PROFILES.meadow;
}
