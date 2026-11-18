// Static 1.2.19 atlas: biome profiles, resource species and wildlife.
//
// This file is deliberately data-only. The runtime in
// systems/biome-resource-state.js turns these definitions into one bounded
// region graph per realm; renderers and panels read the same definitions so a
// resource can never appear in a biome that its own catalog entry disallows.
// Keeping the catalog here also lets the specification audit verify every
// requested family without scanning generated save state.

export const BIOME_RESOURCE_VERSION = 1;
export const BIOME_REGION_GRID = 6;
export const BIOME_REGION_MAX = BIOME_REGION_GRID * BIOME_REGION_GRID;
export const BIOME_RESOURCE_HISTORY_LIMIT = 28;
export const BIOME_RESOURCE_STORE_LIMIT = 1000000;

const freeze = value => Object.freeze(value);
const list = value => freeze([...value]);

export const BIOME_PROFILES = freeze({
    water: freeze({
        id: "water", label: "Open water", short: "Water", color: "#3c6578",
        soil: 0.18, water: 1, vegetation: 0.06, fertility: 0.16,
        production: "fishing", productionLabel: "Fishing & coastal trade",
        crafts: ["netmaking", "boatbuilding", "salting"], climate: "aquatic"
    }),
    beach: freeze({
        id: "beach", label: "Sandy shore", short: "Shore", color: "#c9b47e",
        soil: 0.32, water: 0.78, vegetation: 0.18, fertility: 0.3,
        production: "fishing", productionLabel: "Coastal fishing & salt",
        crafts: ["saltmaking", "ropewalking", "glassmaking"], climate: "coastal"
    }),
    snow: freeze({
        id: "snow", label: "Snowfield", short: "Snow", color: "#d9e4e8",
        soil: 0.22, water: 0.48, vegetation: 0.06, fertility: 0.14,
        production: "hunting", productionLabel: "Fur hunting & ice fishing",
        crafts: ["furrier", "icehouse", "bonecarving"], climate: "polar"
    }),
    rock: freeze({
        id: "rock", label: "Highland rock", short: "Rock", color: "#8e897e",
        soil: 0.28, water: 0.34, vegetation: 0.12, fertility: 0.18,
        production: "mining", productionLabel: "Mining & quarrying",
        crafts: ["masonry", "smithing", "gemcutting"], climate: "alpine"
    }),
    tundra: freeze({
        id: "tundra", label: "Tundra", short: "Tundra", color: "#9da88d",
        soil: 0.36, water: 0.52, vegetation: 0.28, fertility: 0.3,
        production: "hunting", productionLabel: "Herding & lichen harvest",
        crafts: ["feltmaking", "bonecarving", "tanning"], climate: "tundra"
    }),
    taiga: freeze({
        id: "taiga", label: "Taiga", short: "Taiga", color: "#4e7157",
        soil: 0.48, water: 0.62, vegetation: 0.78, fertility: 0.48,
        production: "forestry", productionLabel: "Conifer timber & fur",
        crafts: ["sawmilling", "pitchmaking", "furrier"], climate: "boreal"
    }),
    swamp: freeze({
        id: "swamp", label: "Wetland", short: "Marsh", color: "#667a59",
        soil: 0.62, water: 0.96, vegetation: 0.72, fertility: 0.58,
        production: "herbalism", productionLabel: "Reeds, herbs & peat",
        crafts: ["thatching", "alchemy", "peatcutting"], climate: "wetland"
    }),
    desert: freeze({
        id: "desert", label: "Desert", short: "Desert", color: "#c4ab70",
        soil: 0.2, water: 0.12, vegetation: 0.08, fertility: 0.12,
        production: "mining", productionLabel: "Salt, glass & caravan trade",
        crafts: ["glassmaking", "saltmaking", "dyeworks"], climate: "arid"
    }),
    steppe: freeze({
        id: "steppe", label: "Steppe", short: "Steppe", color: "#a69a63",
        soil: 0.54, water: 0.38, vegetation: 0.42, fertility: 0.46,
        production: "pastoralism", productionLabel: "Pasture, wool & horses",
        crafts: ["feltmaking", "leatherwork", "bowyery"], climate: "dry"
    }),
    meadow: freeze({
        id: "meadow", label: "Meadow", short: "Meadow", color: "#7b9c5b",
        soil: 0.68, water: 0.56, vegetation: 0.54, fertility: 0.66,
        production: "agriculture", productionLabel: "Grain, flax & orchards",
        crafts: ["milling", "brewing", "weaving"], climate: "temperate"
    }),
    forest: freeze({
        id: "forest", label: "Woodland", short: "Forest", color: "#47764f",
        soil: 0.64, water: 0.64, vegetation: 0.86, fertility: 0.58,
        production: "forestry", productionLabel: "Timber, fruit & venison",
        crafts: ["sawmilling", "cooperage", "herbalism"], climate: "temperate"
    }),
    "dense-forest": freeze({
        id: "dense-forest", label: "Deep forest", short: "Deep wood", color: "#315e41",
        soil: 0.72, water: 0.76, vegetation: 1, fertility: 0.62,
        production: "forestry", productionLabel: "Hardwood, resin & rare herbs",
        crafts: ["joinery", "pitchmaking", "alchemy"], climate: "rainforest"
    })
});

export const BIOME_PROFILE_IDS = freeze(Object.keys(BIOME_PROFILES));

// R(...) keeps the catalog readable while still producing immutable records.
// `biomes` is ordered by preference: the first entry is the primary habitat.
function R(id, label, category, biomes, extra = {}) {
    return freeze({
        id,
        label,
        category,
        biomes: list(biomes),
        rarity: 0.55,
        seasons: [0, 1, 2, 3],
        renewable: true,
        regen: 0.12,
        yieldResource: null,
        tradeValue: 1,
        strategic: false,
        rare: false,
        surveyOnly: false,
        kind: "plant",
        stand: null,
        fauna: null,
        quality: { soil: 0.35, moisture: 0.3, temperature: 0.2, height: 0.15 },
        description: "",
        ...extra
    });
}

export const BIOME_RESOURCES = freeze([
    // ── Timber and tree products ────────────────────────────────
    R("oak", "Oak timber", "wood", ["forest", "dense-forest", "meadow"], {
        rarity: 0.82, regen: 0.1, yieldResource: "wood", kind: "wood", stand: "broadleaf",
        tradeValue: 1.2, description: "Dense broadleaf heartwood for frames, barrels and ships."
    }),
    R("pine", "Pine timber", "wood", ["taiga", "forest", "rock"], {
        rarity: 0.78, regen: 0.12, yieldResource: "wood", kind: "wood", stand: "conifer",
        quality: { soil: 0.2, moisture: 0.2, temperature: -0.25, height: 0.3 },
        description: "Fast-growing conifer used for beams, pitch and mine props."
    }),
    R("birch", "Birch timber", "wood", ["forest", "taiga", "meadow"], {
        rarity: 0.66, regen: 0.14, yieldResource: "wood", kind: "wood", stand: "mixed",
        tradeValue: 1.1, description: "Light hardwood for tools, turnery and charcoal."
    }),
    R("cedar", "Cedar timber", "wood", ["forest", "dense-forest", "taiga"], {
        rarity: 0.46, regen: 0.08, yieldResource: "wood", kind: "wood", stand: "conifer",
        tradeValue: 1.6, description: "Aromatic rot-resistant wood reserved for shrines and palaces."
    }),
    R("ironwood", "Ironwood", "wood", ["dense-forest", "swamp", "taiga"], {
        rarity: 0.16, regen: 0.045, yieldResource: "wood", kind: "wood", stand: "broadleaf",
        tradeValue: 4.2, rare: true, strategic: true,
        description: "Black, close-grained hardwood that blunts ordinary axes."
    }),
    R("bamboo", "Bamboo", "wood", ["swamp", "dense-forest", "beach"], {
        rarity: 0.42, regen: 0.2, yieldResource: "wood", kind: "wood", stand: "tropical",
        tradeValue: 1.3, quality: { soil: 0.2, moisture: 0.5, temperature: 0.4, height: -0.3 },
        description: "Hollow stems for scaffolding, pipes, weaving and light spears."
    }),
    R("resin", "Pine resin", "resin", ["forest", "taiga", "dense-forest"], {
        rarity: 0.56, regen: 0.1, kind: "tree", stand: "conifer", tradeValue: 1.8,
        description: "Sticky oleoresin tapped for pitch, medicine and waterproofing."
    }),
    R("amber", "Amber", "resin", ["beach", "forest", "swamp"], {
        rarity: 0.14, renewable: false, kind: "mineral", tradeValue: 6, rare: true,
        description: "Fossil tree resin washed out of coastal cliffs and bog seams."
    }),
    R("birch-tar", "Birch tar", "resin", ["taiga", "forest", "tundra"], {
        rarity: 0.38, regen: 0.09, kind: "tree", stand: "mixed", tradeValue: 2.4,
        description: "Slow-burned bark tar for leather, glue and preservative coatings."
    }),

    // ── Fruit, nuts and gathered food ───────────────────────────
    R("apples", "Wild apples", "fruit", ["forest", "meadow", "dense-forest"], {
        rarity: 0.62, seasons: [1, 2], regen: 0.18, yieldResource: "food", kind: "tree",
        tradeValue: 1.1, description: "Orchard fruit gathered in late summer and autumn."
    }),
    R("berries", "Berries", "fruit", ["forest", "dense-forest", "taiga", "meadow"], {
        rarity: 0.8, seasons: [1, 2], regen: 0.22, yieldResource: "food", kind: "understory",
        tradeValue: 0.9, description: "Bramble, bilberry and rowan berries for preserves and medicine."
    }),
    R("hazelnuts", "Hazelnuts", "fruit", ["forest", "meadow", "dense-forest"], {
        rarity: 0.58, seasons: [2], regen: 0.12, yieldResource: "food", kind: "tree",
        tradeValue: 1.3, description: "Oil- and protein-rich mast, also fed to pigs and fowl."
    }),
    R("wild-grain", "Wild grain", "fruit", ["meadow", "steppe", "forest"], {
        rarity: 0.72, seasons: [1, 2], regen: 0.2, yieldResource: "food", kind: "grass",
        tradeValue: 0.7, description: "Ancestral cereal stands that support early farming."
    }),
    R("roots", "Wild roots", "fruit", ["meadow", "forest", "swamp", "tundra"], {
        rarity: 0.7, seasons: [0, 2, 3], regen: 0.16, yieldResource: "food", kind: "understory",
        tradeValue: 0.6, description: "Burdock, cattail and turnip-like roots for winter stores."
    }),
    R("seaweed", "Seaweed", "fruit", ["water", "beach", "swamp"], {
        rarity: 0.5, seasons: [0, 1], regen: 0.18, yieldResource: "food", kind: "aquatic",
        tradeValue: 0.8, description: "Coastal kelp and laver used as food, fodder and fertiliser."
    }),
    R("mushrooms", "Mushrooms", "fungus", ["forest", "dense-forest", "taiga", "swamp"], {
        rarity: 0.64, seasons: [1, 2, 3], regen: 0.16, yieldResource: "food", kind: "fungus",
        tradeValue: 1.2, description: "Blewit, chanterelle and other edible fungi after rain."
    }),
    R("truffle", "Truffle", "fungus", ["forest", "dense-forest"], {
        rarity: 0.13, seasons: [2, 3], regen: 0.05, yieldResource: "food", kind: "fungus",
        tradeValue: 7.5, rare: true, description: "Buried delicacy found only beneath mature broadleaf stands."
    }),

    // ── Herbs, spices, dyes, fibre and poison ──────────────────
    R("herbs", "Healing herbs", "herb", ["meadow", "forest", "dense-forest", "swamp"], {
        rarity: 0.7, seasons: [0, 1, 2], regen: 0.2, kind: "understory", tradeValue: 1.5,
        description: "Yarrow, sage and woundwort for poultices, tonics and temple incense."
    }),
    R("lichen", "Lichen", "herb", ["taiga", "tundra", "rock", "snow"], {
        rarity: 0.55, seasons: [0, 1, 2, 3], regen: 0.1, kind: "fungus", tradeValue: 1.3,
        quality: { soil: 0.1, moisture: 0.2, temperature: -0.4, height: 0.25 },
        description: "Slow-growing medicinal and dye lichen scraped from cold stone."
    }),
    R("moonbloom", "Moonbloom", "fantastic-plant", ["dense-forest", "swamp"], {
        rarity: 0.08, seasons: [2], regen: 0.035, kind: "fantastic", tradeValue: 14,
        rare: true, strategic: true, surveyOnly: true,
        description: "Silver-petalled night flower whose nectar steadies fever and fear."
    }),
    R("frostlotus", "Frost lotus", "fantastic-plant", ["snow", "tundra"], {
        rarity: 0.07, seasons: [1], regen: 0.03, kind: "fantastic", tradeValue: 16,
        rare: true, surveyOnly: true, quality: { soil: 0.1, moisture: 0.4, temperature: -0.5, height: 0.2 },
        description: "Ice-cupped bloom that opens for one week after the spring thaw."
    }),
    R("glowmoss", "Glowmoss", "fantastic-plant", ["swamp", "dense-forest"], {
        rarity: 0.1, seasons: [0, 1, 2, 3], regen: 0.05, kind: "fantastic", tradeValue: 9,
        rare: true, surveyOnly: true, description: "Luminous moss used by miners and night surveyors."
    }),
    R("starflower", "Starflower", "fantastic-plant", ["meadow", "rock"], {
        rarity: 0.11, seasons: [1, 2], regen: 0.04, kind: "fantastic", tradeValue: 11,
        rare: true, surveyOnly: true, description: "A five-pointed alpine flower that tracks the night sky."
    }),
    R("wild-pepper", "Wild pepper", "spice", ["dense-forest", "swamp"], {
        rarity: 0.34, seasons: [2], regen: 0.09, kind: "understory", tradeValue: 3.4,
        quality: { soil: 0.2, moisture: 0.5, temperature: 0.5, height: -0.3 },
        description: "Pungent vine berries that preserve meat and anchor caravan trade."
    }),
    R("saffron", "Wild saffron", "spice", ["steppe", "meadow"], {
        rarity: 0.17, seasons: [1], regen: 0.06, kind: "understory", tradeValue: 6.5, rare: true,
        description: "Hand-gathered crocus threads worth more than silver by weight."
    }),
    R("juniper", "Juniper", "spice", ["taiga", "rock", "tundra"], {
        rarity: 0.46, seasons: [2, 3], regen: 0.1, kind: "shrub", tradeValue: 2.1,
        description: "Aromatic berries for gin, smoke and winter preserves."
    }),
    R("flax", "Flax", "fiber", ["meadow", "steppe"], {
        rarity: 0.62, seasons: [2], regen: 0.16, kind: "grass", tradeValue: 1.7,
        description: "Linen fibre and oilseed from cultivated and wild flax."
    }),
    R("hemp", "Hemp", "fiber", ["meadow", "forest", "steppe"], {
        rarity: 0.54, seasons: [2], regen: 0.15, kind: "grass", tradeValue: 1.6,
        description: "Strong cordage, canvas and coarse cloth."
    }),
    R("cotton", "Cotton", "fiber", ["dense-forest", "swamp", "steppe"], {
        rarity: 0.38, seasons: [2], regen: 0.14, kind: "shrub", tradeValue: 2.4,
        quality: { soil: 0.2, moisture: 0.3, temperature: 0.6, height: -0.4 },
        description: "Warm-climate seed fibre for fine cloth and padding."
    }),
    R("reeds", "Reeds", "fiber", ["swamp", "water", "beach"], {
        rarity: 0.66, seasons: [1, 2], regen: 0.18, kind: "aquatic", tradeValue: 1.1,
        description: "Thatch, baskets, mats and light fishing floats."
    }),
    R("woad", "Woad", "dye", ["meadow", "steppe"], {
        rarity: 0.36, seasons: [1, 2], regen: 0.1, kind: "understory", tradeValue: 2.6,
        description: "Blue dye whose cultivation was a guarded guild secret."
    }),
    R("madder", "Madder", "dye", ["meadow", "forest"], {
        rarity: 0.42, seasons: [2], regen: 0.11, kind: "understory", tradeValue: 2.2,
        description: "Red root dye for wool, leather and military cloth."
    }),
    R("indigo", "Indigo", "dye", ["swamp", "dense-forest"], {
        rarity: 0.25, seasons: [2], regen: 0.08, kind: "shrub", tradeValue: 3.8,
        quality: { soil: 0.2, moisture: 0.4, temperature: 0.5, height: -0.3 },
        description: "Deep-blue dye traded over long distances."
    }),
    R("wolfsbane", "Wolfsbane", "poison", ["forest", "taiga", "rock"], {
        rarity: 0.31, seasons: [1, 2], regen: 0.08, kind: "understory", tradeValue: 3.1,
        description: "Potent poison used against wolves and, more darkly, against people."
    }),
    R("nightshade", "Nightshade", "poison", ["forest", "swamp", "dense-forest"], {
        rarity: 0.29, seasons: [2], regen: 0.07, kind: "understory", tradeValue: 3.4,
        description: "Belladonna and henbane for anaesthesia, arrow poison and intrigue."
    }),
    R("deathcap", "Deathcap", "poison", ["forest", "dense-forest", "taiga"], {
        rarity: 0.22, seasons: [2, 3], regen: 0.06, kind: "fungus", tradeValue: 2.8,
        description: "A beautiful and lethal fungus collected only by licensed apothecaries."
    }),
    R("cinnabar", "Cinnabar", "special-mineral", ["rock", "desert"], {
        rarity: 0.09, renewable: false, kind: "mineral", tradeValue: 8.5, rare: true,
        strategic: true, description: "Mercury ore and red pigment; profitable and poisonous."
    }),

    // ── Stone, ore and mineral wealth ──────────────────────────
    R("granite", "Granite", "stone", ["rock", "snow"], {
        rarity: 0.72, yieldResource: "stone", renewable: false, kind: "stone", tradeValue: 1,
        description: "Hard igneous building stone for walls, piers and monuments."
    }),
    R("marble", "Marble", "stone", ["rock", "beach"], {
        rarity: 0.24, yieldResource: "stone", renewable: false, kind: "stone", tradeValue: 4.4,
        rare: true, description: "Fine white and veined stone for temples and palaces."
    }),
    R("slate", "Slate", "stone", ["rock", "taiga"], {
        rarity: 0.48, yieldResource: "stone", renewable: false, kind: "stone", tradeValue: 1.8,
        description: "Split roofing slate and durable floor flags."
    }),
    R("limestone", "Limestone", "stone", ["rock", "beach", "meadow"], {
        rarity: 0.62, yieldResource: "stone", renewable: false, kind: "stone", tradeValue: 1.1,
        description: "Mortar, lime and flux for furnaces."
    }),
    R("sandstone", "Sandstone", "stone", ["desert", "beach", "steppe"], {
        rarity: 0.58, yieldResource: "stone", renewable: false, kind: "stone", tradeValue: 1.3,
        description: "Soft, easily carved building stone."
    }),
    R("flint", "Flint", "stone", ["rock", "steppe", "beach"], {
        rarity: 0.44, yieldResource: "stone", renewable: false, kind: "stone", tradeValue: 1.7,
        description: "Sharp edges for tools and fire-starting."
    }),
    R("iron-ore", "Iron ore", "ore", ["rock", "taiga", "tundra"], {
        rarity: 0.52, renewable: false, kind: "ore", tradeValue: 3.2, strategic: true,
        description: "The backbone of tools, nails, arms and armour."
    }),
    R("copper-ore", "Copper ore", "ore", ["rock", "steppe"], {
        rarity: 0.38, renewable: false, kind: "ore", tradeValue: 4.1, strategic: true,
        description: "Kettles, coinage, bronze and bright ornaments."
    }),
    R("tin-ore", "Tin ore", "ore", ["rock", "beach"], {
        rarity: 0.22, renewable: false, kind: "ore", tradeValue: 5.3, rare: true, strategic: true,
        description: "The rare partner of copper; bronze wealth follows its seams."
    }),
    R("gold-ore", "Gold ore", "ore", ["rock", "desert"], {
        rarity: 0.12, renewable: false, kind: "ore", tradeValue: 9.2, rare: true, strategic: true,
        description: "Native gold in quartz veins, a direct source of royal revenue."
    }),
    R("silver-ore", "Silver ore", "ore", ["rock", "taiga", "snow"], {
        rarity: 0.16, renewable: false, kind: "ore", tradeValue: 7.3, rare: true, strategic: true,
        description: "Silver-bearing galena for coin and sacred vessels."
    }),
    R("saltpeter", "Saltpeter", "special-mineral", ["desert", "rock", "swamp"], {
        rarity: 0.11, renewable: false, kind: "mineral", tradeValue: 6.1, rare: true,
        strategic: true, description: "Nitrate crusts for preservation, medicine and later gunnery."
    }),
    R("sulfur", "Sulfur", "sulfur", ["rock", "desert"], {
        rarity: 0.27, renewable: false, kind: "mineral", tradeValue: 3.7,
        description: "Yellow volcanic crusts used in medicine, dye and smoke."
    }),
    R("rock-salt", "Rock salt", "salt", ["desert", "rock"], {
        rarity: 0.34, renewable: false, kind: "mineral", tradeValue: 2.9, strategic: true,
        description: "Underground salt beds essential for preserving meat and fish."
    }),
    R("sea-salt", "Sea salt", "salt", ["beach", "water"], {
        rarity: 0.56, renewable: true, regen: 0.16, kind: "mineral", tradeValue: 1.6,
        description: "Solar-evaporated salt from coastal pans."
    }),
    R("garnet", "Garnet", "gem", ["rock", "steppe"], {
        rarity: 0.2, renewable: false, kind: "gem", tradeValue: 5.8, rare: true,
        description: "Deep red stones for jewellery and fine grinding."
    }),
    R("sapphire", "Sapphire", "gem", ["rock", "snow"], {
        rarity: 0.07, renewable: false, kind: "gem", tradeValue: 13.5, rare: true, strategic: true,
        description: "Blue corundum prized by crowns and temple treasuries."
    }),
    R("emerald", "Emerald", "gem", ["rock", "swamp"], {
        rarity: 0.06, renewable: false, kind: "gem", tradeValue: 15.2, rare: true, strategic: true,
        description: "Green beryl found in rare fault veins."
    }),
    R("ruby", "Ruby", "gem", ["rock", "desert"], {
        rarity: 0.05, renewable: false, kind: "gem", tradeValue: 16.8, rare: true, strategic: true,
        description: "Red corundum of legendary hardness and price."
    }),
    R("quartz", "Quartz", "crystal", ["rock", "beach", "snow"], {
        rarity: 0.5, renewable: false, kind: "crystal", tradeValue: 2.2,
        description: "Clear crystal for lenses, ornaments and precision tools."
    }),
    R("amethyst", "Amethyst", "crystal", ["rock", "taiga"], {
        rarity: 0.14, renewable: false, kind: "crystal", tradeValue: 6.9, rare: true,
        description: "Violet crystal clusters in geodes and old lava cavities."
    }),
    R("mana-crystal", "Mana crystal", "crystal", ["rock", "snow", "swamp"], {
        rarity: 0.04, renewable: false, kind: "fantastic", tradeValue: 24, rare: true,
        strategic: true, surveyOnly: true, description: "A humming crystal that stores arcane charge."
    }),
    R("meteoric-iron", "Meteoric iron", "special-mineral", ["rock", "desert", "snow"], {
        rarity: 0.035, renewable: false, kind: "fantastic", tradeValue: 26, rare: true,
        strategic: true, surveyOnly: true, description: "Sky-metal from a fallen star, coveted by master smiths."
    }),
    R("clay", "Clay", "clay", ["swamp", "meadow", "beach"], {
        rarity: 0.66, renewable: true, regen: 0.08, kind: "mineral", tradeValue: 1.2,
        description: "Pottery, tile, brick and kiln lining."
    }),
    R("loam", "Rich loam", "clay", ["meadow", "forest"], {
        rarity: 0.6, renewable: true, regen: 0.1, kind: "soil", tradeValue: 1.4,
        description: "Dark topsoil and daub for wattle-and-daub houses."
    }),
    R("sand", "Sand", "sand", ["beach", "desert"], {
        rarity: 0.76, renewable: true, regen: 0.05, kind: "mineral", tradeValue: 1,
        description: "Glassmaking, mortar and foundry casting."
    }),
    R("gravel", "Gravel", "sand", ["rock", "beach"], {
        rarity: 0.7, renewable: true, regen: 0.04, kind: "mineral", tradeValue: 0.9,
        description: "Road metal, drainage and concrete aggregate."
    }),
    R("basalt", "Basalt", "volcanic", ["rock", "snow"], {
        rarity: 0.4, renewable: false, kind: "stone", tradeValue: 2.3,
        description: "Dense dark stone for hard-wearing roads and millstones."
    }),
    R("obsidian", "Obsidian", "volcanic", ["rock", "desert", "snow"], {
        rarity: 0.12, renewable: false, kind: "stone", tradeValue: 5.6, rare: true,
        description: "Volcanic glass that takes a sharper edge than steel."
    }),
    R("pumice", "Pumice", "volcanic", ["rock", "beach"], {
        rarity: 0.3, renewable: false, kind: "stone", tradeValue: 2.7,
        description: "Light abrasive stone for polishing and hygiene."
    }),

    // ── Animal products (generated only when the host species lives here) ──
    R("meat", "Meat", "meat", ["forest", "meadow", "steppe", "taiga"], {
        rarity: 0.8, regen: 0.16, yieldResource: "food", kind: "animal",
        fauna: ["red-deer", "wild-boar", "aurochs", "hare", "giant-elk"],
        tradeValue: 1.1, description: "Venison, pork and small game from managed hunting."
    }),
    R("hides", "Hides", "hide", ["forest", "meadow", "steppe", "swamp"], {
        rarity: 0.64, regen: 0.1, kind: "animal", fauna: ["red-deer", "wild-boar", "aurochs"],
        tradeValue: 2.2, description: "Raw hides for leather, harness and shields."
    }),
    R("fur", "Fur", "fur", ["taiga", "tundra", "forest", "snow"], {
        rarity: 0.55, regen: 0.075, kind: "animal", fauna: ["hare", "wolf", "fox", "beaver", "lynx", "direwolf"],
        tradeValue: 3.4, description: "Winter pelts traded for coins, cloaks and royal gifts."
    }),
    R("wool", "Wool", "wool", ["meadow", "steppe", "rock"], {
        rarity: 0.52, regen: 0.15, kind: "animal", fauna: ["wild-sheep", "mountain-goat"],
        tradeValue: 2.8, description: "Fleece for cloth, felt, rope and bedding."
    }),
    R("feathers", "Feathers", "feather", ["rock", "forest", "meadow", "water"], {
        rarity: 0.48, regen: 0.12, kind: "animal", fauna: ["eagle", "raven", "vulture", "wildfowl"],
        tradeValue: 2.4, description: "Quills, fletching and down for arrows and bedding."
    }),
    R("bone", "Bone", "bone", ["forest", "meadow", "steppe", "rock", "tundra"], {
        rarity: 0.6, regen: 0.1, kind: "animal", fauna: ["red-deer", "aurochs", "wolf", "bear", "cave-troll"],
        tradeValue: 1.5, description: "Tools, needles, glue, dice and carved ornament."
    }),
    R("horn", "Horn & antler", "horn", ["forest", "meadow", "rock", "tundra"], {
        rarity: 0.42, regen: 0.09, kind: "animal", fauna: ["red-deer", "aurochs", "mountain-goat", "giant-elk"],
        tradeValue: 2.9, description: "Bow tips, combs, drinking horns and alchemical ingredients."
    }),
    R("fish", "Fresh fish", "fish", ["water", "beach", "swamp"], {
        rarity: 0.78, regen: 0.2, yieldResource: "food", kind: "fish",
        fauna: ["salmon", "trout"], tradeValue: 1.2,
        description: "River and coastal catch, best smoked or salted before spoiling."
    }),
    R("honey", "Honey", "honey", ["meadow", "forest", "dense-forest"], {
        rarity: 0.49, seasons: [1, 2], regen: 0.12, kind: "animal", fauna: ["honeybee"],
        tradeValue: 3.8, description: "Wild and hived honey for food, mead and medicine."
    }),
    R("wax", "Beeswax", "honey", ["meadow", "forest", "dense-forest"], {
        rarity: 0.44, seasons: [2], regen: 0.09, kind: "animal", fauna: ["honeybee"],
        tradeValue: 3.2, description: "Candles, seals, salves and lost-wax casting."
    }),
    R("eggs", "Eggs", "egg", ["rock", "forest", "meadow", "swamp", "water"], {
        rarity: 0.52, seasons: [0, 1], regen: 0.14, yieldResource: "food", kind: "animal",
        fauna: ["eagle", "wildfowl", "vulture"], tradeValue: 1.4,
        description: "Bird eggs gathered under strict seasonal rules."
    }),
    R("milk", "Milk", "dairy", ["meadow", "steppe", "rock"], {
        rarity: 0.36, seasons: [0, 1, 2], regen: 0.18, kind: "animal",
        fauna: ["aurochs", "mountain-goat", "wild-sheep"], tradeValue: 2.1,
        description: "Milk, curds and cheese from semi-wild herds."
    }),
    R("tallow", "Tallow", "tallow", ["forest", "meadow", "steppe", "water"], {
        rarity: 0.55, regen: 0.1, kind: "animal", fauna: ["red-deer", "wild-boar", "fish"],
        tradeValue: 1.9, description: "Rendered fat for candles, soap and greasing."
    }),
    R("venom", "Venom", "venom", ["swamp", "forest", "desert"], {
        rarity: 0.2, seasons: [1, 2], regen: 0.05, kind: "animal", fauna: ["river-adder", "sand-wyrm"],
        tradeValue: 7.2, rare: true, description: "Carefully milked poison for medicine, hunting and war."
    }),
    R("wyvern-scale", "Wyvern scale", "rare-animal", ["snow", "rock", "desert"], {
        rarity: 0.055, regen: 0.025, kind: "fantastic", fauna: ["frost-wyvern", "sand-wyrm"],
        tradeValue: 18, rare: true, strategic: true, surveyOnly: true,
        description: "Heat- and cold-resistant scale from a living legendary predator."
    }),
    R("moon-silk", "Moon silk", "rare-animal", ["dense-forest", "forest", "swamp"], {
        rarity: 0.06, regen: 0.04, kind: "fantastic", fauna: ["moonmoth"],
        tradeValue: 15, rare: true, surveyOnly: true,
        description: "Pale cocoon thread spun by moonmoths on old-growth trees."
    })
]);

export const BIOME_RESOURCE_IDS = freeze(BIOME_RESOURCES.map(resource => resource.id));

// F(...) describes one animal's ecological niche. The runtime uses these
// fields literally: prey lists drive predation, pollinators boost plant
// regeneration, engineers alter wetlands and scavengers remove carcass load.
function F(id, label, role, biomes, extra = {}) {
    return freeze({
        id,
        label,
        role,
        biomes: list(biomes),
        rarity: 0.45,
        capacity: 90,
        reproduction: 0.16,
        diet: ["plants"],
        prey: [],
        water: true,
        migratory: false,
        breeding: [0, 1],
        refuge: "Sheltered cover near fresh water.",
        rare: false,
        fantastic: false,
        endangered: false,
        products: [],
        description: "",
        ...extra
    });
}

export const BIOME_WILDLIFE = freeze([
    F("red-deer", "Red deer", "herbivore", ["forest", "meadow", "dense-forest"], {
        rarity: 0.82, capacity: 150, reproduction: 0.14, diet: ["grass", "browse"],
        breeding: [2], products: ["meat", "hides", "bone", "horn"], migratory: true,
        refuge: "Open glades beside mature woodland.",
        description: "Browsing herds that shape woodland edges and feed wolves."
    }),
    F("wild-boar", "Wild boar", "omnivore", ["forest", "swamp", "meadow"], {
        rarity: 0.72, capacity: 110, reproduction: 0.18, diet: ["roots", "mast", "insects"],
        products: ["meat", "hides", "bone"], refuge: "Mud wallows and dense undergrowth.",
        description: "Rooting omnivores that turn soil and spread mast."
    }),
    F("hare", "Hare", "herbivore", ["meadow", "steppe", "forest"], {
        rarity: 0.78, capacity: 180, reproduction: 0.24, diet: ["grass", "herbs"],
        products: ["meat", "fur", "bone"], breeding: [0, 1, 2], refuge: "Tall grass and hedgerow.",
        description: "Fast breeders and the staple prey of foxes and lynx."
    }),
    F("aurochs", "Aurochs", "herbivore", ["meadow", "steppe"], {
        rarity: 0.34, capacity: 70, reproduction: 0.09, diet: ["grass"],
        products: ["meat", "hides", "horn", "milk"], breeding: [2],
        refuge: "Wide pasture and river meadows.", description: "Great wild cattle, powerful and increasingly rare."
    }),
    F("wild-sheep", "Wild sheep", "herbivore", ["rock", "meadow"], {
        rarity: 0.42, capacity: 80, reproduction: 0.12, diet: ["grass", "herbs"],
        products: ["wool", "meat", "horn", "milk"], breeding: [0],
        refuge: "Rock ledges above open grazing.", description: "Sure-footed mountain grazers."
    }),
    F("mountain-goat", "Mountain goat", "herbivore", ["rock", "snow"], {
        rarity: 0.36, capacity: 65, reproduction: 0.1, diet: ["grass", "lichen"],
        products: ["wool", "meat", "horn", "milk"], breeding: [0],
        refuge: "High cliffs and snow-covered ledges.", description: "Hardy climbers that reach herbage no other grazer can."
    }),
    F("beaver", "Beaver", "engineer", ["forest", "swamp", "water"], {
        rarity: 0.3, capacity: 60, reproduction: 0.1, diet: ["bark", "roots"],
        products: ["fur", "meat", "bone"], breeding: [1], water: true,
        refuge: "Slow streams and willow thickets.", description: "Dam builders that create ponds, wetlands and new habitat."
    }),
    F("salmon", "Salmon", "fish", ["water", "beach"], {
        rarity: 0.52, capacity: 220, reproduction: 0.22, diet: ["insects"], water: true,
        products: ["fish", "eggs"], migratory: true, breeding: [2],
        refuge: "Cold gravel spawning beds.", description: "Anadromous fish that carry marine nutrients upriver."
    }),
    F("trout", "Trout", "fish", ["water", "swamp"], {
        rarity: 0.6, capacity: 160, reproduction: 0.18, diet: ["insects"], water: true,
        products: ["fish"], breeding: [0], refuge: "Cold pools and shaded streams.",
        description: "Sensitive fish whose health reveals water quality."
    }),
    F("eagle", "Eagle", "predator", ["rock", "forest"], {
        rarity: 0.26, capacity: 26, reproduction: 0.06, diet: ["meat"], prey: ["hare", "wildfowl"],
        products: ["feathers", "eggs", "meat"], breeding: [0],
        refuge: "Cliff eyries and tall old trees.", description: "Apex aerial hunter needing undisturbed nesting sites."
    }),
    F("wolf", "Wolf", "predator", ["forest", "taiga", "tundra", "steppe"], {
        rarity: 0.38, capacity: 45, reproduction: 0.1, diet: ["meat"],
        prey: ["red-deer", "wild-boar", "hare", "giant-elk"], products: ["fur", "bone"],
        breeding: [0], refuge: "Remote dens and undisturbed forest.", migratory: true,
        description: "Pack predator that keeps herbivore herds moving and healthy."
    }),
    F("bear", "Brown bear", "omnivore", ["forest", "taiga"], {
        rarity: 0.22, capacity: 28, reproduction: 0.05, diet: ["meat", "berries", "fish"],
        prey: ["red-deer", "salmon"], products: ["meat", "fur", "bone"], breeding: [1],
        refuge: "Old-growth denning sites.", description: "Powerful omnivore that also spreads seeds and carrion."
    }),
    F("lynx", "Lynx", "predator", ["taiga", "forest"], {
        rarity: 0.18, capacity: 24, reproduction: 0.055, diet: ["meat"], prey: ["hare", "red-deer"],
        products: ["fur", "bone"], breeding: [1], refuge: "Dense cover and rocky lairs.",
        description: "Solitary ambush hunter; rare and sensitive to logging."
    }),
    F("fox", "Red fox", "predator", ["forest", "meadow", "taiga", "steppe"], {
        rarity: 0.56, capacity: 55, reproduction: 0.16, diet: ["meat", "berries"],
        prey: ["hare", "wildfowl"], products: ["fur", "bone"], breeding: [0],
        refuge: "Burrows at field edges.", description: "Adaptable mesopredator linking rodents and songbirds."
    }),
    F("honeybee", "Honeybee", "pollinator", ["meadow", "forest", "dense-forest"], {
        rarity: 0.5, capacity: 400, reproduction: 0.28, diet: ["nectar"], water: true,
        products: ["honey", "wax"], breeding: [1, 2], refuge: "Hollow trees and sheltered hives.",
        description: "Critical pollinator whose swarms follow mass flowering."
    }),
    F("bark-beetle", "Bark beetle", "pest", ["forest", "taiga"], {
        rarity: 0.44, capacity: 500, reproduction: 0.34, diet: ["cambium"],
        products: [], breeding: [1], refuge: "Stressed and dying trees.",
        description: "A natural woodland recycler that becomes a plague after drought."
    }),
    F("earthworm", "Earthworm", "soil", ["meadow", "forest", "swamp"], {
        rarity: 0.7, capacity: 900, reproduction: 0.3, diet: ["detritus"], water: true,
        products: [], breeding: [0, 1], refuge: "Cool damp topsoil.",
        description: "Soil engineers whose burrows aerate and enrich the ground."
    }),
    F("raven", "Raven", "scavenger", ["forest", "rock", "meadow", "tundra"], {
        rarity: 0.54, capacity: 70, reproduction: 0.16, diet: ["carrion", "eggs"],
        products: ["feathers"], breeding: [1], refuge: "Cliffs and tall dead trees.",
        description: "Intelligent scavenger that finds every carcass."
    }),
    F("vulture", "Vulture", "scavenger", ["desert", "steppe", "rock"], {
        rarity: 0.36, capacity: 38, reproduction: 0.08, diet: ["carrion"],
        products: ["feathers"], breeding: [1], refuge: "High thermal cliffs.",
        description: "Long-ranging scavenger that removes disease-bearing carrion."
    }),
    F("wildfowl", "Wildfowl", "omnivore", ["swamp", "water", "meadow", "beach"], {
        rarity: 0.68, capacity: 220, reproduction: 0.24, diet: ["roots", "insects", "grass"],
        products: ["eggs", "feathers", "meat"], water: true, migratory: true, breeding: [0],
        refuge: "Reedbeds and open shallows.", description: "Migratory ducks, geese and waders linking wetlands."
    }),
    F("cave-troll", "Cave troll", "predator", ["rock", "snow"], {
        rarity: 0.07, capacity: 12, reproduction: 0.025, diet: ["meat"],
        prey: ["mountain-goat", "wild-sheep"], products: ["bone", "horn", "hides"],
        breeding: [2], rare: true, fantastic: true, refuge: "Deep limestone caves.",
        description: "A rare, territorial giant that returns to the same cave for centuries."
    }),
    F("frost-wyvern", "Frost wyvern", "predator", ["snow", "rock"], {
        rarity: 0.04, capacity: 8, reproduction: 0.018, diet: ["meat"],
        prey: ["mountain-goat", "red-deer", "giant-elk"], products: ["wyvern-scale", "meat", "bone"],
        breeding: [0], rare: true, fantastic: true, surveyOnly: true,
        refuge: "Glacier caves and storm-scoured peaks.",
        description: "A legendary alpine hunter that deposits rare scale at its roost."
    }),
    F("sand-wyrm", "Sand wyrm", "predator", ["desert", "rock"], {
        rarity: 0.045, capacity: 9, reproduction: 0.02, diet: ["meat"],
        prey: ["hare", "wildfowl"], products: ["wyvern-scale", "venom"],
        breeding: [2], rare: true, fantastic: true, surveyOnly: true,
        refuge: "Deep desert sinkholes.", description: "A serpentine ambusher that leaves venom and glass-like scale."
    }),
    F("ember-drake", "Ember drake", "predator", ["rock", "desert"], {
        rarity: 0.05, capacity: 10, reproduction: 0.022, diet: ["meat"],
        prey: ["wild-sheep", "hare", "wild-boar"], products: ["wyvern-scale", "bone"],
        breeding: [1], rare: true, fantastic: true, surveyOnly: true,
        refuge: "Volcanic vents and hot caves.", description: "A small fire-touched drake that nests where stone stays warm."
    }),
    F("direwolf", "Direwolf", "predator", ["taiga", "tundra"], {
        rarity: 0.09, capacity: 20, reproduction: 0.05, diet: ["meat"],
        prey: ["red-deer", "hare", "giant-elk"], products: ["fur", "bone"],
        breeding: [0], rare: true, fantastic: true, refuge: "Frozen dens and old burn sites.",
        description: "A larger, rarer cousin of the wolf with a slow breeding cycle."
    }),
    F("giant-elk", "Giant elk", "herbivore", ["forest", "taiga"], {
        rarity: 0.12, capacity: 30, reproduction: 0.05, diet: ["browse", "grass"],
        products: ["meat", "horn", "hides"], breeding: [2], rare: true,
        refuge: "Deep old growth and bog edges.", description: "A rare giant deer whose antlers are a lordly trophy."
    }),
    F("moonmoth", "Moonmoth", "pollinator", ["dense-forest"], {
        rarity: 0.075, capacity: 55, reproduction: 0.12, diet: ["nectar"],
        products: ["moon-silk"], breeding: [1, 2], rare: true, fantastic: true,
        surveyOnly: true, refuge: "Ancient hollow trees and moonlit clearings.",
        description: "A rare night pollinator whose silk is gathered, never farmed."
    }),
    F("river-adder", "River adder", "predator", ["swamp", "water", "forest"], {
        rarity: 0.24, capacity: 45, reproduction: 0.12, diet: ["meat"],
        prey: ["trout", "hare", "wildfowl"], products: ["venom"], breeding: [1], water: true,
        refuge: "Sun-warmed banks and reed rafts.", description: "A venomous ambush hunter that controls small prey."
    }),
    F("glacier-bear", "Glacier bear", "predator", ["snow", "tundra"], {
        rarity: 0.06, capacity: 14, reproduction: 0.03, diet: ["meat", "fish"],
        prey: ["salmon", "mountain-goat"], products: ["fur", "meat", "bone"],
        breeding: [1], rare: true, fantastic: true, surveyOnly: true,
        refuge: "Ice caves and frozen coastlines.", description: "A pale bear that follows the spring fish runs."
    }),
    F("spectral-stag", "Spectral stag", "herbivore", ["dense-forest", "swamp"], {
        rarity: 0.035, capacity: 7, reproduction: 0.015, diet: ["browse", "moss"],
        products: ["moon-silk", "horn"], breeding: [2], rare: true, fantastic: true,
        surveyOnly: true, refuge: "Fog-bound ancient groves.",
        description: "A ghostly rare herbivore whose shed antler is prized in alchemy."
    })
]);

export const BIOME_WILDLIFE_IDS = freeze(BIOME_WILDLIFE.map(species => species.id));

// Coarse diet vocabulary from the wildlife catalog. Each token points at the
// actual plant or animal resource categories that sustain a species; the
// annual pass consumes those local stocks instead of one abstract vegetation
// number. Predators also keep their explicit prey[] links.
export const BIOME_DIET_CATEGORIES = freeze({
    grass: ["fruit", "fiber"],
    browse: ["wood", "resin"],
    roots: ["fruit"],
    mast: ["fruit"],
    herbs: ["herb"],
    lichen: ["herb", "fungus"],
    moss: ["herb", "fungus"],
    berries: ["fruit"],
    fish: ["fish"],
    insects: ["fiber"],
    carrion: ["meat"],
    nectar: ["honey"],
    bark: ["wood"],
    cambium: ["wood", "resin"],
    detritus: ["fungus"],
    eggs: ["egg"],
    meat: ["meat"]
});

// Map-facing resource families. Six stable colours make abundance readable at
// a glance without turning the atlas into a rainbow of 32 category labels.
// Every catalog category must belong to one family; the audit test enforces it.
export const BIOME_RESOURCE_MAP_FAMILIES = freeze({
    timber: freeze({ id: "timber", label: "Timber & resin", color: "#75a958", categories: ["wood", "resin"] }),
    stone: freeze({ id: "stone", label: "Stone, ore & salt", color: "#b8b0a0", categories: ["stone", "ore", "gem", "salt", "sulfur", "clay", "sand", "volcanic", "crystal", "special-mineral"] }),
    flora: freeze({ id: "flora", label: "Fruit, herbs & fungi", color: "#a98bd6", categories: ["fruit", "herb", "fungus", "spice", "dye", "poison", "venom", "fantastic-plant"] }),
    fiber: freeze({ id: "fiber", label: "Fibre", color: "#d8c070", categories: ["fiber"] }),
    fish: freeze({ id: "fish", label: "Fish & coast", color: "#78b6d0", categories: ["fish"] }),
    animal: freeze({ id: "animal", label: "Animal goods", color: "#c98a6a", categories: ["meat", "hide", "fur", "wool", "feather", "bone", "horn", "tallow", "honey", "egg", "dairy", "rare-animal"] })
});
export const BIOME_RESOURCE_FAMILY_BY_CATEGORY = freeze(Object.fromEntries(
    Object.values(BIOME_RESOURCE_MAP_FAMILIES).flatMap(family => family.categories.map(category => [category, family.id]))
));

// The regional exchange only quotes three commodity ledgers. Biome resource
// categories are mapped explicitly so the atlas and market cannot drift apart
// when a new food or mineral family is added.
export const BIOME_MARKET_CATEGORY_BY_RESOURCE_CATEGORY = freeze({
    wood: "wood", stone: "stone",
    fruit: "food", fish: "food", meat: "food", dairy: "food", egg: "food", honey: "food", fungus: "food"
});
export const BIOME_MARKET_CATEGORIES = freeze(["wood", "stone", "food"]);

export const BIOME_RESOURCE_CATEGORIES = freeze({
    wood: "Timber", fruit: "Fruit & nuts", fungus: "Fungi", herb: "Herbs & medicine",
    "fantastic-plant": "Fantastic flora", spice: "Spices", fiber: "Fibre", dye: "Dyes",
    poison: "Poisons", resin: "Resin & tree products", stone: "Building stone", ore: "Ores & metals",
    salt: "Salt", sulfur: "Sulfur", gem: "Gemstones", clay: "Clay & soil", sand: "Sand & gravel",
    volcanic: "Volcanic stone", crystal: "Crystals", "special-mineral": "Special minerals",
    meat: "Meat", hide: "Hides & leather", fur: "Fur", wool: "Wool", feather: "Feathers",
    bone: "Bone", horn: "Horn", fish: "Fish", honey: "Honey & wax", egg: "Eggs", dairy: "Dairy",
    tallow: "Tallow", venom: "Venom", "rare-animal": "Legendary animal goods", craft: "Crafted goods"
});

// Local craft chains. A recipe is only available when the region actually
// carries every input category; the output is a separate processed good, not a
// natural resource, so it can never be generated by the biome picker.
function CR(id, outputLabel, inputs, value, demand, focusCategory, description) {
    return freeze({
        id,
        craft: id,
        outputId: "craft-" + id,
        outputLabel,
        inputs: freeze(inputs.map(input => freeze({ category: input[0], amount: input[1] }))),
        value,
        demand,
        focusCategory,
        description
    });
}

export const BIOME_CRAFT_RECIPES = freeze([
    CR("sawmilling", "Sawn timber", [["wood", 8]], 7, 1.05, "wood", "Square beams and boards for building and export."),
    CR("cooperage", "Barrels", [["wood", 6]], 6, 1.0, "wood", "Watertight casks for beer, salt fish and wine."),
    CR("joinery", "Fine joinery", [["wood", 10], ["resin", 2]], 12, 1.2, "wood", "Doors, shutters and furniture for wealthy halls."),
    CR("pitchmaking", "Pitch", [["resin", 3], ["wood", 2]], 8, 1.0, "resin", "Waterproofing for ships, roofs and barrels."),
    CR("boatbuilding", "River boat", [["wood", 10], ["resin", 2]], 14, 1.15, "wood", "Shallow-draught boats for river and coastal trade."),
    CR("bowyery", "Bows", [["wood", 4], ["horn", 2]], 10, 1.15, "wood", "Laminated hunting and war bows."),
    CR("masonry", "Cut stone", [["stone", 8]], 7, 1.0, "stone", "Dressed blocks for walls, piers and monuments."),
    CR("smithing", "Iron wares", [["ore", 6], ["wood", 2]], 12, 1.25, "ore", "Tools, nails, fittings and weapon blanks."),
    CR("gemcutting", "Cut gems", [["gem", 2]], 18, 1.3, "gem", "Faceted stones for jewellery and crown regalia."),
    CR("glassmaking", "Glassware", [["sand", 6], ["sulfur", 1]], 10, 1.2, "sand", "Window glass, bottles and lenses."),
    CR("saltmaking", "Refined salt", [["salt", 4], ["wood", 2]], 6, 1.05, "salt", "Clean, graded salt for preservation and trade."),
    CR("netmaking", "Fishing nets", [["fiber", 4]], 5, 1.1, "fiber", "Knotted nets and lines for the coastal fleet."),
    CR("ropewalking", "Rope", [["fiber", 6]], 5, 1.0, "fiber", "Hemp and flax cordage for ships and carts."),
    CR("salting", "Salted fish", [["fish", 6], ["salt", 2]], 9, 1.15, "fish", "Barrel-salted catch that survives long journeys."),
    CR("icehouse", "Preserved fish", [["fish", 5], ["wood", 2]], 8, 1.0, "fish", "Ice-packed and smoked catch for inland markets."),
    CR("furrier", "Fur cloaks", [["fur", 4]], 8, 1.1, "fur", "Warm cloaks and trim for cold courts."),
    CR("tanning", "Leather", [["hide", 4]], 7, 1.1, "hide", "Tanned hides for harness, boots and armour."),
    CR("leatherwork", "Leather goods", [["hide", 3], ["bone", 1]], 9, 1.1, "hide", "Belts, saddles and tool sheaths."),
    CR("feltmaking", "Felt", [["wool", 5]], 6, 1.0, "wool", "Weatherproof felt for tents and winter clothing."),
    CR("weaving", "Cloth", [["fiber", 6]], 7, 1.05, "fiber", "Bolts of woven cloth for tailors and trade."),
    CR("dyeworks", "Dyed cloth", [["dye", 3], ["fiber", 2]], 10, 1.15, "dye", "Bright, colour-fast cloth for export."),
    CR("thatching", "Thatch", [["fiber", 5], ["clay", 2]], 5, 0.9, "fiber", "Reed and straw roofing for cottages and barns."),
    CR("peatcutting", "Peat", [["fiber", 4], ["clay", 2]], 4, 0.9, "clay", "Dried fuel for cold, wood-poor settlements."),
    CR("alchemy", "Remedies", [["herb", 4], ["fungus", 2]], 12, 1.2, "herb", "Tinctures, salves and rare medicines."),
    CR("herbalism", "Herbal wares", [["herb", 3], ["honey", 1]], 9, 1.1, "herb", "Cough syrups and preserved remedies."),
    CR("bonecarving", "Carved bone", [["bone", 4]], 5, 0.95, "bone", "Combs, dice, needles and devotional carvings."),
    CR("milling", "Flour", [["fruit", 5]], 5, 1.0, "fruit", "Stone-ground grain and root flour."),
    CR("brewing", "Ale", [["fruit", 4], ["honey", 2]], 8, 1.1, "fruit", "Strong ale and mead for taverns and feasts.")
]);

export const BIOME_CRAFT_RECIPE_BY_ID = freeze(Object.fromEntries(BIOME_CRAFT_RECIPES.map(recipe => [recipe.id, recipe])));
export const BIOME_CRAFT_RECIPE_BY_CRAFT = freeze(Object.fromEntries(BIOME_CRAFT_RECIPES.map(recipe => [recipe.craft, recipe])));
export const BIOME_CRAFT_GOODS = freeze(BIOME_CRAFT_RECIPES.map(recipe => freeze({
    id: recipe.outputId,
    label: recipe.outputLabel,
    category: "craft",
    baseValue: recipe.value,
    demand: recipe.demand,
    recipe: recipe.id
})));
export const BIOME_CRAFT_GOOD_BY_ID = freeze(Object.fromEntries(BIOME_CRAFT_GOODS.map(good => [good.id, good])));

export const BIOME_POLICIES = freeze({
    sustainable: freeze({
        id: "sustainable", label: "Sustained yield", short: "SUSTAIN",
        description: "Take only what regrows; full regeneration and healthier habitat.",
        yield: 0.82, regen: 1.2, pressure: 0.55, cost: 1
    }),
    intensive: freeze({
        id: "intensive", label: "Intensive harvest", short: "INTENSIVE",
        description: "Maximise immediate output at the cost of stock, soil and wildlife.",
        yield: 1.32, regen: 0.62, pressure: 1.45, cost: 0.9
    }),
    conservation: freeze({
        id: "conservation", label: "Conservation", short: "CONSERVE",
        description: "Close the region to extraction; ecology recovers and rare species return.",
        yield: 0.22, regen: 1.75, pressure: 0.15, cost: 1.35
    }),
    fallow: freeze({
        id: "fallow", label: "Fallow", short: "FALLOW",
        description: "Pause production entirely for a year so soil and vegetation can recover.",
        yield: 0, regen: 1.5, pressure: 0, cost: 1
    })
});
export const BIOME_POLICY_IDS = freeze(Object.keys(BIOME_POLICIES));

export const BIOME_FOCUSES = freeze({
    forestry: freeze({ id: "forestry", label: "Forestry", resourceCategories: ["wood", "resin"], description: "Timber, fuel and tree products." }),
    hunting: freeze({ id: "hunting", label: "Hunting", resourceCategories: ["meat", "hide", "fur", "horn"], description: "Meat, pelts and wild game." }),
    fishing: freeze({ id: "fishing", label: "Fishing", resourceCategories: ["fish", "salt"], description: "Catch, cure and coastal trade." }),
    mining: freeze({ id: "mining", label: "Mining", resourceCategories: ["ore", "stone", "gem", "salt", "sulfur", "crystal", "special-mineral", "volcanic", "sand"], description: "Ore, stone and mineral wealth." }),
    herbalism: freeze({ id: "herbalism", label: "Herbalism", resourceCategories: ["herb", "fungus", "spice", "dye", "poison", "fantastic-plant"], description: "Medicine, dye and rare plants." }),
    agriculture: freeze({ id: "agriculture", label: "Agriculture", resourceCategories: ["fruit", "fiber", "clay"], description: "Food, fibre and fertile ground." }),
    pastoralism: freeze({ id: "pastoralism", label: "Pastoralism", resourceCategories: ["wool", "dairy", "meat"], description: "Herds, wool and dairy." })
});
export const BIOME_FOCUS_IDS = freeze(Object.keys(BIOME_FOCUSES));

// The public requirement manifest. It is intentionally one row per numbered
// 1.2.19 point, so the audit can prove coverage instead of treating the whole
// block as one checkbox.
const requirement = (id, label, key, group) => freeze({
    id, label, key, group,
    evidence: [
        { file: "js/world/biome-resource-data.js", symbol: "BIOME_RESOURCES", role: "catalog" },
        { file: "js/systems/biome-resource-state.js", symbol: "updateBiomeAtlasAnnual", role: "simulation" },
        { file: "js/presentation/biome-panel.js", symbol: "renderBiomePanel", role: "ui" }
    ]
});

export const BIOME_RESOURCE_REQUIREMENTS = freeze([
    requirement("1.2.19.1", "Every resource has preferred biomes", "preferred-biomes", "habitat"),
    requirement("1.2.19.2", "Resources occur in several biomes", "multi-biome", "habitat"),
    requirement("1.2.19.3", "Different resource abundance per biome", "biome-abundance", "habitat"),
    requirement("1.2.19.4", "Rare resources in specific regions", "rare-regions", "habitat"),
    requirement("1.2.19.5", "Distribution depends on soil, climate, moisture and elevation", "distribution", "habitat"),
    requirement("1.2.19.6", "Resource quality depends on location", "location-quality", "habitat"),
    requirement("1.2.19.7", "Seasonal resource availability", "seasonality", "habitat"),
    requirement("1.2.19.8", "Resource stock depletion and regeneration", "depletion", "habitat"),
    requirement("1.2.19.9", "Strategically valuable rare deposits", "strategic-deposits", "habitat"),
    requirement("1.2.19.10", "Timber species depend on the tree stand", "timber-stand", "flora"),
    requirement("1.2.19.11", "Fruit, berries and nuts", "fruit", "flora"),
    requirement("1.2.19.12", "Medicinal plants and herbs", "herbs", "flora"),
    requirement("1.2.19.13", "Spices", "spices", "flora"),
    requirement("1.2.19.14", "Fibre plants", "fibre", "flora"),
    requirement("1.2.19.15", "Dye plants", "dyes", "flora"),
    requirement("1.2.19.16", "Poisonous plants", "poisons", "flora"),
    requirement("1.2.19.17", "Mushrooms", "fungi", "flora"),
    requirement("1.2.19.18", "Resins and tree products", "resins", "flora"),
    requirement("1.2.19.19", "Rare and fantastic plants", "fantastic-flora", "flora"),
    requirement("1.2.19.20", "Stone types depend on geology", "stone", "minerals"),
    requirement("1.2.19.21", "Ores and metals", "ores", "minerals"),
    requirement("1.2.19.22", "Salt", "salt", "minerals"),
    requirement("1.2.19.23", "Sulfur", "sulfur", "minerals"),
    requirement("1.2.19.24", "Gemstones", "gems", "minerals"),
    requirement("1.2.19.25", "Clay and loam", "clay", "minerals"),
    requirement("1.2.19.26", "Sand and gravel", "sand", "minerals"),
    requirement("1.2.19.27", "Volcanic rock", "volcanic", "minerals"),
    requirement("1.2.19.28", "Rare crystals", "crystals", "minerals"),
    requirement("1.2.19.29", "Special mineral deposits", "special-minerals", "minerals"),
    requirement("1.2.19.30", "Meat", "meat", "fauna-products"),
    requirement("1.2.19.31", "Fells and pelts", "fur", "fauna-products"),
    requirement("1.2.19.32", "Hides and leather", "hides", "fauna-products"),
    requirement("1.2.19.33", "Wool", "wool", "fauna-products"),
    requirement("1.2.19.34", "Feathers", "feathers", "fauna-products"),
    requirement("1.2.19.35", "Bone", "bone", "fauna-products"),
    requirement("1.2.19.36", "Horn", "horn", "fauna-products"),
    requirement("1.2.19.37", "Fish", "fish", "fauna-products"),
    requirement("1.2.19.38", "Honey and beeswax", "honey", "fauna-products"),
    requirement("1.2.19.39", "Eggs and other animal products", "animal-products", "fauna-products"),
    requirement("1.2.19.40", "Every animal species has a preferred habitat", "habitat", "wildlife"),
    requirement("1.2.19.41", "Animals need suitable food and water", "food-water", "wildlife"),
    requirement("1.2.19.42", "Populations depend on vegetation density and climate", "vegetation-climate", "wildlife"),
    requirement("1.2.19.43", "Predators need suitable prey populations", "predator-prey", "wildlife"),
    requirement("1.2.19.44", "Some species live only in limited climate zones", "climate-zones", "wildlife"),
    requirement("1.2.19.45", "Seasonal migrations", "migration", "wildlife"),
    requirement("1.2.19.46", "Different breeding seasons", "breeding", "wildlife"),
    requirement("1.2.19.47", "Refuges and breeding grounds", "refuge", "wildlife"),
    requirement("1.2.19.48", "Rare and endangered species", "rare-species", "wildlife"),
    requirement("1.2.19.49", "Fantastic species with ecological needs", "fantastic-species", "wildlife"),
    requirement("1.2.19.50", "Plants as food for herbivores", "plants-food", "ecology"),
    requirement("1.2.19.51", "Herbivores affect vegetation density", "grazing", "ecology"),
    requirement("1.2.19.52", "Predators affect prey populations", "predation", "ecology"),
    requirement("1.2.19.53", "Pollinators and plant reproduction", "pollination", "ecology"),
    requirement("1.2.19.54", "Scavengers remove carcasses", "scavenging", "ecology"),
    requirement("1.2.19.55", "Beavers and other landscape engineers", "engineering", "ecology"),
    requirement("1.2.19.56", "Soil organisms and soil quality", "soil-life", "ecology"),
    requirement("1.2.19.57", "Insects as pollinators and pests", "insects", "ecology"),
    requirement("1.2.19.58", "Timber regrowth", "timber-regrowth", "recovery"),
    requirement("1.2.19.59", "Long-term forest damage from logging", "logging-damage", "recovery"),
    requirement("1.2.19.60", "Wildlife recovery depends on habitat and hunting pressure", "wildlife-recovery", "recovery"),
    requirement("1.2.19.61", "Fish stock decline from overfishing", "overfishing", "recovery"),
    requirement("1.2.19.62", "Local extinction of rare plants", "plant-extinction", "recovery"),
    requirement("1.2.19.63", "Plant recovery after disturbance", "plant-recovery", "recovery"),
    requirement("1.2.19.64", "Seasonal resource fluctuations", "seasonal-fluctuation", "recovery"),
    requirement("1.2.19.65", "Non-renewable mineral deposits", "non-renewable", "recovery"),
    requirement("1.2.19.66", "Long-term ecological change with economic consequences", "ecological-economy", "recovery"),
    requirement("1.2.19.67", "Different production priorities per biome", "biome-production", "economy"),
    requirement("1.2.19.68", "Regional settlement specialisation", "specialisation", "economy"),
    requirement("1.2.19.69", "Trade in rare regional goods", "rare-trade", "economy"),
    requirement("1.2.19.70", "Different production costs", "production-costs", "economy"),
    requirement("1.2.19.71", "Regional supply advantages", "supply-advantage", "economy"),
    requirement("1.2.19.72", "Dependence on imported raw materials", "imports", "economy"),
    requirement("1.2.19.73", "Hunting and forestry", "hunting-forestry", "economy"),
    requirement("1.2.19.74", "Fishing and coastal economy", "fishing", "economy"),
    requirement("1.2.19.75", "Mining and quarries", "mining", "economy"),
    requirement("1.2.19.76", "Special crafts from local resources", "crafts", "economy"),
    requirement("1.2.19.77", "Visually recognisable resources", "visual-resources", "presentation"),
    requirement("1.2.19.78", "Plants and animals suited to their environment", "visual-habitat", "presentation"),
    requirement("1.2.19.79", "Legible resource abundance on the world map", "map-abundance", "presentation"),
    requirement("1.2.19.80", "Rare deposits are not visible everywhere", "hidden-rare", "presentation"),
    requirement("1.2.19.81", "Resource discovery through exploration", "discovery", "presentation"),
    requirement("1.2.19.82", "Understandable resource information in the UI", "ui-info", "presentation"),
    requirement("1.2.19.83", "Recognisable regional economic profiles", "regional-profile", "presentation"),
    requirement("1.2.19.84", "Forest is condensed as green dots at detail level 3", "forest-points", "presentation")
]);

// Convenience indexes used by the runtime and by tests.
export const BIOME_RESOURCE_BY_ID = freeze(Object.fromEntries(BIOME_RESOURCES.map(resource => [resource.id, resource])));
export const BIOME_WILDLIFE_BY_ID = freeze(Object.fromEntries(BIOME_WILDLIFE.map(species => [species.id, species])));

export function resourcesForBiome(biome, stand = null) {
    return BIOME_RESOURCES.filter(resource => resource.biomes.includes(biome)
        && (!resource.stand || !stand || resource.stand === stand));
}

export function wildlifeForBiome(biome) {
    return BIOME_WILDLIFE.filter(species => species.biomes.includes(biome));
}
