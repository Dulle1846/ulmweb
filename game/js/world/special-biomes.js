// Fantastic and rare special biomes.
//
// This module owns the deterministic world atlas: nine biome families, the
// 1.2.16.1–100 feature manifest, rare-region placement, satellite islands,
// feature anchors and the compact tile lookup. It has no DOM or game-state
// imports, so the forge preview, tests and the renderer can reuse it without
// creating a second source of truth.
//
// Regions are few (normally 4–10 per world) and the tile lookup is one byte per
// tile. Nothing here scans the whole map every tick.

export const SPECIAL_BIOME_VERSION = 1;
export const SPECIAL_BIOME_MAX_REGIONS = 12;
export const SPECIAL_BIOME_MIN_REGIONS = 3;

const freeze = value => Object.freeze(value);
const clamp01 = value => Math.max(0, Math.min(1, value));

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

const unit = (seed, x, y, salt) => hash32(seed, x, y, salt) / 0x100000000;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const FAMILY_DEFINITIONS = [
    {
        id: "enchanted-wood",
        label: "Enchanted Wood",
        kicker: "THE UNCANNY GREEN",
        glyph: "✦",
        tint: [86, 58, 126],
        accent: "#c59bff",
        glow: "#e4c7ff",
        climates: ["temperate", "enchanted", "taiga", "tropical"],
        minMoisture: 0.45,
        weight: 1.15,
        radius: [3, 8],
        resource: "aether-herb",
        resourceLabel: "Aether herbs",
        resourceValue: 9,
        boon: "The wood answers its warden: morale and herb-gathering improve.",
        hazard: "Uncanny lights lead travellers astray when the veil thins.",
        variants: ["Violet Gloaming", "Whisperwood", "Moonlit Thicket", "The Prism Grove", "The Sleeping Court"],
        featureKinds: ["glowtree", "prismleaf", "glade", "glowcap", "spring", "runestone"],
        features: ["Luminous grove", "Colour-shifting trees", "Glowing undergrowth", "Moonlit clearing", "Rare old trees", "Unusual blossoms", "Glowing mushrooms", "Woodland spirits", "A spring of power", "A living ley-line"],
        origins: ["an old promise beneath the roots", "a star that fell into the canopy", "the first seed of the realm"],
        lore: [
            "The trees remember a colour that does not exist elsewhere.",
            "At dusk the undergrowth answers the wind with a faint, bell-like light.",
            "A ring of pale stones marks where the old warden last spoke."
        ]
    },
    {
        id: "crystal-land",
        label: "Crystal Land",
        kicker: "THE SINGING STONE",
        glyph: "◇",
        tint: [96, 183, 198],
        accent: "#b8f6ff",
        glow: "#d8fbff",
        climates: ["mountain", "arid", "volcanic", "enchanted"],
        minHeightAboveSea: 0.10,
        weight: 0.9,
        radius: [3, 7],
        resource: "crystal-shard",
        resourceLabel: "Crystal shards",
        resourceValue: 12,
        boon: "Crystal light clarifies stonework, trade and the court's sight.",
        hazard: "Splinter fields cut feet and horses; light can blind the unwary.",
        variants: ["Glass Basin", "The Singing Crags", "Prism Hollow", "The Pale Expanse", "The Lantern Field"],
        featureKinds: ["crystal", "crystal-grove", "mineral-field", "glass-rock", "crystal-cave", "vein"],
        features: ["Crystal landscape", "Great crystal formation", "Crystal grove", "Mineral field", "Translucent coloured rock", "Crystal cave", "Glowing mineral vein", "Rare crystal resource", "A hall of reflected light"],
        origins: ["a seam that grew toward the sky", "a mountain that cooled too slowly", "a buried star's bones"],
        lore: [
            "The crystals ring softly when the realm's bells are rung.",
            "A single shard can hold the colour of a whole winter afternoon.",
            "Miners leave bread at the cave mouth; the stone is said to prefer being asked."
        ]
    },
    {
        id: "fungal-wilds",
        label: "Fungal Wilds",
        kicker: "THE BREATHING FLOOR",
        glyph: "☘",
        tint: [116, 66, 123],
        accent: "#e6a9ed",
        glow: "#f6d0ff",
        climates: ["swamp", "temperate", "taiga", "tropical"],
        minMoisture: 0.52,
        weight: 1.0,
        radius: [3, 8],
        resource: "glowcap",
        resourceLabel: "Glowcaps",
        resourceValue: 8,
        boon: "A rich fungal harvest feeds the realm and yields medicine.",
        hazard: "Spore clouds cause fever, confusion and failed harvests.",
        variants: ["The Breathing Floor", "Crowncap Deep", "The Violet Hush", "Sporefall", "The Quiet Mycelium"],
        featureKinds: ["mushroom", "giant-mushroom", "fungal-colony", "fungal-carpet", "spore-cloud", "healing-mushroom"],
        features: ["Mushroom forest", "Giant mushrooms", "Glowing colonies", "Dense fungal carpet", "Underground mycelial network", "Great spore clouds", "Healing and poisonous caps", "Fungal fauna", "Strange soil"],
        origins: ["a root system older than the realm", "a warm, wet hollow beneath the hills", "a gift carried on a storm"],
        lore: [
            "The forest floor breathes once every hundred days.",
            "A hunter who eats the blue caps can hear the mycelium counting.",
            "The colony has its own roads, marked by threads of silver."
        ]
    },
    {
        id: "blighted-land",
        label: "Blighted Land",
        kicker: "THE WOUND THAT SPREADS",
        glyph: "✖",
        tint: [55, 54, 40],
        accent: "#a7c86a",
        glow: "#d8ff9b",
        climates: ["temperate", "taiga", "swamp", "volcanic"],
        weight: 0.8,
        radius: [3, 8],
        resource: "blight-resin",
        resourceLabel: "Blight resin",
        resourceValue: 7,
        boon: "The wound can be studied, cleansed or turned into a grim ward.",
        hazard: "Corruption spreads to neighbouring land, poisoning water and beasts.",
        variants: ["The Grey Wound", "Blackreed Fen", "The Hollowing", "Ashrot", "The Unmaking"],
        featureKinds: ["deadwood", "black-grass", "rot-pool", "unnatural-fog", "twisted-beast", "spreading-zone"],
        features: ["Dead trees", "Black and discoloured plants", "Rotten ground", "Unnatural fog", "Poisoned water", "Changed animals", "A spreading corruption", "A curse or supernatural danger", "A creeping boundary"],
        origins: ["a battle no one recorded", "a well that was sealed and then forgotten", "a promise broken under the old king"],
        lore: [
            "Birds avoid the place; the insects do not.",
            "The rot writes a slow map in the roots of healthy trees.",
            "At the centre, a stone still bears a name someone tried to erase."
        ]
    },
    {
        id: "glass-desert",
        label: "Glass Desert",
        kicker: "THE MIRROR OF NOON",
        glyph: "◆",
        tint: [196, 224, 205],
        accent: "#f4fff2",
        glow: "#d9fff4",
        climates: ["arid", "savanna", "volcanic", "coastal"],
        maxMoisture: 0.42,
        minHeightAboveSea: 0.08,
        weight: 0.75,
        radius: [3, 7],
        resource: "glass-sand",
        resourceLabel: "Glass sand",
        resourceValue: 10,
        boon: "Glass and gem trade brings coin, but the shards demand respect.",
        hazard: "Razor ground wounds workers; mirrored heat disorients travellers.",
        variants: ["The Mirror of Noon", "The White Silence", "Gemstone Reach", "The Splinter Sea", "The Sun's Table"],
        featureKinds: ["glass", "crystal-dune", "mirror-rock", "mineral-column", "gem", "sharp-ground"],
        features: ["Glass-like sand", "Crystalline dunes", "Mirroring rock", "Mineral columns", "Rare gemstones", "Shifting refraction", "Dry vegetation", "Dangerously sharp ground", "A false horizon"],
        origins: ["a furnace of sand and lightning", "a sea that dried with the sun in it", "a buried glassmaker's city"],
        lore: [
            "The dunes hold the sky upside down.",
            "A lost caravan's bells can be heard at noon, always behind you.",
            "The clearest glass is found where nothing has grown for a century."
        ]
    },
    {
        id: "mist-moor",
        label: "Mist Moor",
        kicker: "THE ISLANDS THAT MOVE",
        glyph: "☁",
        tint: [84, 119, 113],
        accent: "#a5ddd1",
        glow: "#c5fff1",
        climates: ["swamp", "coastal", "tundra", "temperate"],
        minMoisture: 0.56,
        weight: 0.95,
        radius: [3, 8],
        resource: "moor-pearl",
        resourceLabel: "Moor pearls",
        resourceValue: 11,
        boon: "Moor herbs and pearls sustain the realm through hard years.",
        hazard: "The mist hides paths, islands and the lights that lure travellers.",
        variants: ["The Moving Isles", "The Grey Veil", "Lantern Fen", "The Drowned Garden", "The Hushed Mere"],
        featureKinds: ["mist", "glowreed", "moorlight", "moor-herb", "moor-spring", "hidden-island"],
        features: ["Permanent mist banks", "Glowing water plants", "Unusual marsh lights", "Rare herbs", "A magical spring", "Hidden islands", "Changed waterfowl", "A path that loses itself"],
        origins: ["a drowned valley with no grave", "a pact between river and moon", "a winter that refused to end"],
        lore: [
            "The islands are never in the same place twice, but the herons always find them.",
            "A lantern on the water is a promise, not a guide.",
            "The moor keeps every footstep in its peat."
        ]
    },
    {
        id: "ash-shadow",
        label: "Ash & Shadow",
        kicker: "THE LAND AFTER FIRE",
        glyph: "▲",
        tint: [63, 55, 52],
        accent: "#c39a78",
        glow: "#f1b78c",
        climates: ["volcanic", "mountain", "tundra"],
        weight: 0.7,
        radius: [3, 7],
        resource: "ash-iron",
        resourceLabel: "Ash iron",
        resourceValue: 10,
        boon: "Ash iron and fire-hardened wood make unusually strong tools.",
        hazard: "Ashfall smothers fields and lungs; the ground remembers heat.",
        variants: ["The Land After Fire", "Cinder Reach", "The Black Garden", "Emberfall", "The Quiet Burn"],
        featureKinds: ["ash", "charred-tree", "black-grass", "ashfall", "strange-rock", "ash-vein"],
        features: ["Ashen and shadowed landscape", "Dark soils", "Charred tree remains", "Black grasses", "Ash rain", "Strange rock formations", "Changed light", "Hardy plants", "Rare mineral wealth"],
        origins: ["a mountain that spoke once", "a royal pyre that never went out", "a summer of burning sky"],
        lore: [
            "The black grass seeds only after the first rain.",
            "A road of fired clay runs under the ash, older than the realm.",
            "The wind here carries the smell of a forge and a grave."
        ]
    },
    {
        id: "hollow-depths",
        label: "Hollow Depths",
        kicker: "THE WORLD BENEATH",
        glyph: "⌘",
        tint: [52, 61, 82],
        accent: "#8fd6c7",
        glow: "#b6fff0",
        climates: ["mountain", "volcanic", "tundra", "temperate"],
        minHeightAboveSea: 0.12,
        weight: 0.7,
        radius: [3, 7],
        resource: "deep-amber",
        resourceLabel: "Deep amber",
        resourceValue: 13,
        boon: "Cave amber, blind fish and old stone enrich the realm's crafts.",
        hazard: "Collapses, blind predators and gas pockets make the deep hostile.",
        variants: ["The World Beneath", "The Sunless Wood", "The Amber Vault", "The Long Descent", "The Quiet River"],
        featureKinds: ["cave-mouth", "underground-forest", "underground-lake", "fungal-garden", "glowworm", "underground-river"],
        features: ["Large cave system", "Underground forest", "Crystal cave", "Subterranean lake", "Fungal landscape", "Glowing organisms", "Underground river", "Blind fauna and pale flora", "Rare stone and gas"],
        origins: ["a river that cut downward for an age", "a city that sank without falling", "a hollow left by a sleeping thing"],
        lore: [
            "The cave breathes in summer and exhales in winter.",
            "A pale forest grows around a lake that has never seen the sun.",
            "The amber holds insects from a world before the first king."
        ]
    },
    {
        id: "magic-mountains",
        label: "Magic Mountains",
        kicker: "THE WEIGHTLESS PEAKS",
        glyph: "⌁",
        tint: [92, 79, 132],
        accent: "#c9b8ff",
        glow: "#e8ddff",
        climates: ["mountain", "volcanic", "enchanted", "tundra"],
        minHeightAboveSea: 0.20,
        weight: 0.65,
        radius: [3, 6],
        resource: "star-metal",
        resourceLabel: "Star metal",
        resourceValue: 16,
        boon: "Star metal and mountain springs transform crafts and legitimacy.",
        hazard: "Unnatural weather, thin air and tumbling stone make access deadly.",
        variants: ["The Weightless Peaks", "The Hanging Crown", "Starfall Range", "The Glass Colossus", "The High Choir"],
        featureKinds: ["floating-rock", "mountain-vein", "crystal-peak", "mountain-spring", "strange-weather", "alpine-beast"],
        features: ["Magical mountains", "Floating or impossible rock", "Glowing mountain veins", "Crystal peaks", "A spring of power", "Unnatural weather", "Rare alpine plants and beasts", "Precious stone", "A pass that closes itself"],
        origins: ["a range that was lifted, not raised", "a song frozen into stone", "the spine of a sleeping giant"],
        lore: [
            "The peaks cast shadows that point toward the old capital.",
            "A stone thrown from the highest ledge never lands.",
            "The mountain springs taste of iron and starlight."
        ]
    }
];

export const SPECIAL_BIOME_FAMILIES = freeze(Object.fromEntries(
    FAMILY_DEFINITIONS.map(family => [family.id, freeze({
        ...family,
        tint: freeze(family.tint),
        climates: freeze(family.climates),
        radius: freeze(family.radius),
        variants: freeze(family.variants),
        featureKinds: freeze(family.featureKinds),
        features: freeze(family.features),
        origins: freeze(family.origins),
        lore: freeze(family.lore)
    })])
));

export const SPECIAL_BIOME_FAMILY_IDS = freeze(FAMILY_DEFINITIONS.map(family => family.id));

const manifestGroups = [
    ["enchanted-wood", 1, [
        "Enchanted forests", "Trees with unusual colours", "Glowing plants", "Magical clearings",
        "Rare tree species", "Unusual blossoms", "Glowing mushrooms", "Special woodland animals",
        "Magical springs and places of power", "Vegetation that reacts to magical influence"
    ]],
    ["crystal-land", 11, [
        "Crystal landscapes", "Great crystal formations", "Crystal forests", "Mineral fields",
        "Transparent or coloured rock structures", "Crystal caves", "Glowing mineral veins",
        "Rare crystal resources", "Special light reflections"
    ]],
    ["fungal-wilds", 20, [
        "Mushroom forests", "Giant mushrooms", "Glowing fungal colonies", "Dense fungal carpets",
        "Underground mycelial networks", "Great spore clouds", "Rare healing and poisonous mushrooms",
        "Specialised fungal animals", "Unusual soil structures"
    ]],
    ["blighted-land", 29, [
        "Cursed and corrupted landscapes", "Dead trees", "Black or discoloured plants",
        "Rotten ground", "Unnatural fog", "Poisoned water", "Changed animal species",
        "Spreading corruption zones", "Magical or supernatural dangers",
        "Long-term change in neighbouring biomes"
    ]],
    ["glass-desert", 39, [
        "Crystal deserts and glass landscapes", "Glass-like sand", "Crystalline dunes",
        "Mirroring rock formations", "Mineral columns", "Rare gemstone deposits",
        "Special light refraction", "Extremely dry vegetation", "Dangerous sharp surfaces"
    ]],
    ["mist-moor", 48, [
        "Magical mist moors", "Permanent mist layers", "Glowing water plants",
        "Unusual moor lights", "Rare herbs", "Magical springs", "Hidden islands",
        "Altered animal species", "Phenomena that make orientation difficult"
    ]],
    ["ash-shadow", 57, [
        "Ash and shadow landscapes", "Dark soils", "Charred tree remains", "Black grasses",
        "Ash rain", "Strange rock formations", "Changed light",
        "Resilient plants", "Rare mineral raw materials"
    ]],
    ["hollow-depths", 66, [
        "Underground biomes", "Large cave systems", "Underground forests", "Crystal grottoes",
        "Underground lakes", "Fungal landscapes", "Glowing organisms",
        "Underground rivers", "Unique animals and plants", "Special resources and dangers"
    ]],
    ["magic-mountains", 76, [
        "Magical mountains", "Floating or unusually shaped rock formations",
        "Glowing mountain veins", "Crystal peaks", "Springs of power",
        "Unnatural weather phenomena", "Rare plants and animals", "Special raw materials",
        "Difficult and dangerous access"
    ]],
    ["atlas", 85, [
        "Rare distribution of special biomes",
        "Distribution tied to world history, climate, magic and geology",
        "Small and large special-biome areas",
        "Individual special-biome islands inside ordinary landscapes",
        "Transitions to normal biomes",
        "Regional and procedurally generated variants"
    ]],
    ["integration", 91, [
        "Special discovery and exploration events",
        "Integration into quests, legends and historical events",
        "Special resources",
        "Rare building and crafting materials",
        "Unique animal species",
        "Special diseases and environmental hazards",
        "Magical advantages or disadvantages",
        "Special settlement conditions",
        "Special trade opportunities",
        "Rare technologies, crafting recipes or discoveries"
    ]]
];

export const SPECIAL_BIOME_MANIFEST = freeze(manifestGroups.flatMap(([family, start, labels]) =>
    labels.map((label, index) => freeze({
        id: "1.2.16." + (start + index),
        index: start + index,
        label,
        family
    }))
));

export const RARE_GOODS = freeze({
    "aether-herb": freeze({ id: "aether-herb", label: "Aether herbs", value: 9, family: "enchanted-wood", glyph: "✿", where: "Enchanted wood" }),
    "crystal-shard": freeze({ id: "crystal-shard", label: "Crystal shards", value: 12, family: "crystal-land", glyph: "◇", where: "Crystal land" }),
    "glowcap": freeze({ id: "glowcap", label: "Glowcaps", value: 8, family: "fungal-wilds", glyph: "☘", where: "Fungal wilds" }),
    "blight-resin": freeze({ id: "blight-resin", label: "Blight resin", value: 7, family: "blighted-land", glyph: "✖", where: "Blighted land" }),
    "glass-sand": freeze({ id: "glass-sand", label: "Glass sand", value: 10, family: "glass-desert", glyph: "▱", where: "Glass desert" }),
    "moor-pearl": freeze({ id: "moor-pearl", label: "Moor pearls", value: 11, family: "mist-moor", glyph: "◌", where: "Mist moor" }),
    "ash-iron": freeze({ id: "ash-iron", label: "Ash iron", value: 10, family: "ash-shadow", glyph: "▲", where: "Ash shadow" }),
    "deep-amber": freeze({ id: "deep-amber", label: "Deep amber", value: 13, family: "hollow-depths", glyph: "●", where: "Hollow depths" }),
    "star-metal": freeze({ id: "star-metal", label: "Star metal", value: 16, family: "magic-mountains", glyph: "✦", where: "Magic mountains" })
});

export const RARE_GOOD_IDS = freeze(Object.keys(RARE_GOODS));

function sampleWorld(world, x, y) {
    const res = Math.max(1, Number(world.resolution) || 1);
    const pixW = Math.max(1, Number(world.pixW) || Math.floor(world.W * res));
    const pixH = Math.max(1, Number(world.pixH) || Math.floor(world.H * res));
    const px = clamp(Math.floor(x * res), 0, pixW - 1);
    const py = clamp(Math.floor(y * res), 0, pixH - 1);
    const idx = py * pixW + px;
    return {
        height: finite(world.heights?.[idx], world.sea + 0.05),
        moisture: finite(world.moistures?.[idx], 0.5),
        temperature: finite(world.temperatures?.[idx], 0.55)
    };
}

const HISTORY_AFFINITY = Object.freeze({
    "enchanted-wood": { age: 0.12, magic: 0.46 },
    "crystal-land": { geology: 0.42, magic: 0.18 },
    "fungal-wilds": { age: 0.30, strife: 0.12 },
    "blighted-land": { strife: 0.72, magic: 0.22 },
    "glass-desert": { geology: 0.46, strife: 0.10 },
    "mist-moor": { age: 0.34, magic: 0.24 },
    "ash-shadow": { strife: 0.62, geology: 0.18 },
    "hollow-depths": { age: 0.44, geology: 0.24 },
    "magic-mountains": { magic: 0.62, geology: 0.26 }
});

// Distribution reads the realm's remembered age, conflicts, magical scars and
// geology when the caller provides them. Without a history object, seeded
// strata give each realm a stable, varied memory instead of a uniform sprinkle.
function historyProfile(world, options, seed) {
    const history = (world.history && typeof world.history === "object" && !Array.isArray(world.history))
        ? world.history
        : ((options.history && typeof options.history === "object" && !Array.isArray(options.history)) ? options.history : {});
    const memory = world.memory && typeof world.memory === "object" ? world.memory : {};
    return {
        age: clamp01(finite(history.age ?? world.worldAge ?? options.worldAge, unit(seed, 11, 13, 151))),
        strife: clamp01(finite(history.strife ?? world.strife ?? memory.strife, unit(seed, 17, 19, 157))),
        magic: clamp01(finite(history.magic ?? world.magic ?? memory.magic, unit(seed, 23, 29, 163))),
        geology: clamp01(finite(history.geology ?? world.geology ?? memory.geology, unit(seed, 31, 37, 167)))
    };
}

function historyBiasFor(family, profile) {
    const affinity = HISTORY_AFFINITY[family.id] || {};
    return 0.82
        + profile.age * (affinity.age || 0)
        + profile.strife * (affinity.strife || 0)
        + profile.magic * (affinity.magic || 0)
        + profile.geology * (affinity.geology || 0);
}

function familyScore(family, world, x, y, climate, historyFactor = 1) {
    if (family.climates && !family.climates.includes(climate)) return 0;
    const points = [
        [x, y], [x - 0.7, y - 0.4], [x + 0.6, y - 0.5],
        [x - 0.5, y + 0.6], [x + 0.55, y + 0.55]
    ];
    let score = 0;
    let land = 0;
    for (const [sx, sy] of points) {
        const sample = sampleWorld(world, sx, sy);
        if (sample.height <= world.sea + 0.008) continue;
        land++;
        const above = sample.height - world.sea;
        const heightOk = (family.minHeightAboveSea == null || above >= family.minHeightAboveSea)
            && (family.maxHeightAboveSea == null || above <= family.maxHeightAboveSea);
        const moistureOk = (family.minMoisture == null || sample.moisture >= family.minMoisture)
            && (family.maxMoisture == null || sample.moisture <= family.maxMoisture);
        if (!heightOk || !moistureOk) continue;
        score += 1;
    }
    if (land < 4) return 0;
    if (!score) return 0;
    // A small deterministic climate/geology bias makes rare regions feel like
    // part of the world rather than a uniform sprinkling of every family.
    const bias = 0.86 + unit(world.seed, x, y, family.id.length) * 0.28;
    return score * (family.weight || 1) * bias * historyFactor * (0.7 + world.resourceRichness * 0.3);
}

function pickFamily(scores, roll) {
    const entries = Object.entries(scores).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (!total) return null;
    let cursor = roll * total;
    for (const [id, weight] of entries) {
        cursor -= weight;
        if (cursor <= 0) return id;
    }
    return entries[entries.length - 1][0];
}

function makeFeatures(family, regionSeed, x, y, radius) {
    const count = 5 + (regionSeed % 4);
    const features = [];
    for (let index = 0; index < count; index++) {
        const angle = index * 2.399963229728653 + (regionSeed % 13) * 0.17;
        const distance = radius * (0.18 + unit(regionSeed, index, 3, 71) * 0.68);
        const kind = family.featureKinds[index % family.featureKinds.length];
        const label = family.features[index % family.features.length];
        features.push({
            kind,
            label,
            x: Math.round((x + Math.cos(angle) * distance) * 10) / 10,
            y: Math.round((y + Math.sin(angle) * distance) * 10) / 10,
            scale: Math.round((0.72 + unit(regionSeed, index, 5, 29) * 0.62) * 100) / 100,
            featureId: family.featureKinds[index % family.featureKinds.length] + "-" + (index + 1)
        });
    }
    return features;
}

function makeRegion(family, seed, index, x, y, radius, climate, variant) {
    const regionSeed = hash32(seed, x, y, index + 1);
    const satellites = [];
    if (radius >= 5 && unit(regionSeed, 3, 7, 91) > 0.5) {
        const count = 1 + (regionSeed % 2);
        for (let i = 0; i < count; i++) {
            const angle = i * 2.399 + unit(regionSeed, i, 11, 37) * 1.4;
            satellites.push({
                x: Math.round((x + Math.cos(angle) * (radius + 3.2)) * 10) / 10,
                y: Math.round((y + Math.sin(angle) * (radius + 3.2)) * 10) / 10,
                radius: 1.25 + unit(regionSeed, i, 13, 17) * 1.1
            });
        }
    }
    return {
        id: "special-biome-" + (index + 1),
        index,
        family: family.id,
        name: family.variants[variant % family.variants.length],
        kicker: family.kicker,
        glyph: family.glyph,
        tint: family.tint,
        accent: family.accent,
        glow: family.glow,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        radius: Math.round(radius * 10) / 10,
        transition: 1.4 + unit(regionSeed, 9, 2, 61) * 1.4,
        satellites,
        features: makeFeatures(family, regionSeed, x, y, radius),
        resource: family.resource,
        resourceLabel: family.resourceLabel,
        resourceValue: family.resourceValue,
        boon: family.boon,
        hazard: family.hazard,
        climate,
        variant,
        variantLabel: family.variants[variant % family.variants.length],
        origin: family.origins[variant % family.origins.length],
        lore: family.lore[variant % family.lore.length],
        discovered: false,
        discoveredYear: 0,
        attuned: false,
        cleansed: false,
        spread: 0,
        lastYieldYear: 0,
        richness: Math.round((0.78 + unit(regionSeed, 7, 5, 43) * 0.5) * 100) / 100
    };
}

export function generateSpecialBiomeRegions(seedValue, options = {}, world = {}) {
    const seed = Number(seedValue) >>> 0;
    const W = Math.max(1, Math.floor(Number(world.W) || Number(options.W) || 1));
    const H = Math.max(1, Math.floor(Number(world.H) || Number(options.H) || 1));
    const sea = finite(world.sea, 0.33);
    const climate = String(options.climate || world.climate || "temperate");
    const resourceRichness = clamp01(finite(options.resources, 50) / 100);
    const memory = historyProfile(world, options, seed);
    const context = { ...world, W, H, sea, seed, resourceRichness, memory };
    const target = clamp(Math.round((W * H) / 7600) + 2, SPECIAL_BIOME_MIN_REGIONS, SPECIAL_BIOME_MAX_REGIONS);
    const regions = [];
    const cx = W / 2;
    const cy = H / 2;
    const minimumCenterDistance = Math.max(15, W * 0.16);
    const tries = Math.max(80, target * 80);
    for (let attempt = 0; attempt < tries && regions.length < target; attempt++) {
        const x = 3 + Math.floor(unit(seed, attempt, 1, 101) * (W - 6));
        const y = 3 + Math.floor(unit(seed, attempt, 2, 103) * (H - 6));
        if (Math.hypot(x - cx, y - cy) < minimumCenterDistance) continue;
        const center = sampleWorld(context, x, y);
        if (center.height <= sea + 0.008) continue;
        const scores = {};
        for (const family of FAMILY_DEFINITIONS) {
            const score = familyScore(family, context, x, y, climate, historyBiasFor(family, memory));
            if (score > 0) scores[family.id] = score;
        }
        const familyId = pickFamily(scores, unit(seed, attempt, 3, 107));
        if (!familyId) continue;
        const family = SPECIAL_BIOME_FAMILIES[familyId];
        const radius = family.radius[0] + unit(seed, attempt, 4, 109) * (family.radius[1] - family.radius[0]);
        if (regions.some(region => Math.hypot(region.x - x, region.y - y) < region.radius + radius + 4.5)) continue;
        const variant = Math.floor(unit(seed, attempt, 5, 113) * family.variants.length);
        regions.push(makeRegion(family, seed, regions.length, x, y, radius, climate, variant));
    }
    // A very small or water-heavy world can exhaust the candidate loop. Keep
    // the atlas contract usable with one fallback region instead of an empty
    // panel, while never placing a region in the starting settlement.
    if (!regions.length && W > 12 && H > 12) {
        const family = SPECIAL_BIOME_FAMILIES["enchanted-wood"];
        const x = clamp(Math.floor(W * 0.82), 3, W - 4);
        const y = clamp(Math.floor(H * 0.22), 3, H - 4);
        regions.push(makeRegion(family, seed, 0, x, y, 3.5, climate, seed % family.variants.length));
    }
    return regions;
}

export function buildSpecialBiomeMap(regions, W, H) {
    const width = Math.max(1, Math.floor(Number(W) || 1));
    const height = Math.max(1, Math.floor(Number(H) || 1));
    const map = new Uint8Array(width * height);
    for (let index = 0; index < regions.length; index++) {
        const region = regions[index];
        const patches = [{ x: region.x, y: region.y, radius: region.radius + Math.max(0, finite(region.spread)) * 0.28 }, ...(region.satellites || [])];
        for (const patch of patches) {
            const r = Math.max(0.5, finite(patch.radius, region.radius));
            const minX = Math.max(0, Math.floor(patch.x - r));
            const maxX = Math.min(width - 1, Math.ceil(patch.x + r));
            const minY = Math.max(0, Math.floor(patch.y - r));
            const maxY = Math.min(height - 1, Math.ceil(patch.y + r));
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    if (!map[y * width + x] && Math.hypot(x + 0.5 - patch.x, y + 0.5 - patch.y) <= r) {
                        map[y * width + x] = index + 1;
                    }
                }
            }
        }
    }
    return map;
}

export function specialBiomeRegionAt(map, W, x, y) {
    if (!map || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const width = Math.max(1, Math.floor(Number(W) || 1));
    const height = Math.floor(map.length / width);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
    return map[iy * width + ix] || 0;
}

export function specialBiomeTintAt(map, regions, W, x, y) {
    const index = specialBiomeRegionAt(map, W, x, y);
    if (!index || !regions[index - 1]) return null;
    return regions[index - 1].tint;
}

export function specialBiomeSummary(regions = []) {
    const byFamily = {};
    for (const region of regions) byFamily[region.family] = (byFamily[region.family] || 0) + 1;
    return {
        total: regions.length,
        discovered: regions.filter(region => region.discovered).length,
        attuned: regions.filter(region => region.attuned).length,
        threatened: regions.filter(region => region.family === "blighted-land" && !region.cleansed).length,
        byFamily
    };
}

export const __internals = { hash32, sampleWorld, familyScore, makeFeatures };
