// Static 1.2.21 cross-biome system data.
//
// This is deliberately a data-only layer over the existing 1.2.19 biome atlas.
// The atlas already owns the 6×6 region graph, resource stocks, wildlife and
// annual pass. Here we describe the climate envelopes, soil parent materials,
// regional variants and seasonal appearances that the existing regions read.
// No per-tile object graph and no second simulation loop is introduced.

export const CROSS_BIOME_VERSION = 1;

const freeze = value => Object.freeze(value);
const list = value => freeze([...value]);

// Climate zones may contain several related biomes. A biome can appear in more
// than one zone because the same formation occurs under different regional
// climates; `primary` is the zone used for the compact atlas label.
export const BIOME_CLIMATE_ZONES = freeze({
    polar: freeze({
        id: "polar", label: "Polar", temp: [-38, 8], precip: [20, 650],
        biomes: ["snow", "tundra"], description: "Long frost, low evaporation and a short growing window."
    }),
    boreal: freeze({
        id: "boreal", label: "Boreal", temp: [-28, 18], precip: [220, 1300],
        biomes: ["taiga", "snow", "tundra"], description: "Cold winters, conifer cover and spring meltwater."
    }),
    temperate: freeze({
        id: "temperate", label: "Temperate", temp: [-8, 28], precip: [380, 1800],
        biomes: ["meadow", "forest", "dense-forest", "beach"], description: "Four clear seasons with reliable soil moisture."
    }),
    dry: freeze({
        id: "dry", label: "Dry", temp: [-8, 42], precip: [0, 620],
        biomes: ["steppe", "desert"], description: "Water balance is the limiting factor for plants and farms."
    }),
    tropical: freeze({
        id: "tropical", label: "Tropical", temp: [8, 38], precip: [700, 4200],
        biomes: ["dense-forest", "swamp", "beach"], description: "High humidity, fast growth and rapid decomposition."
    }),
    alpine: freeze({
        id: "alpine", label: "Alpine", temp: [-24, 18], precip: [120, 1800],
        biomes: ["rock", "taiga", "snow"], description: "Elevation lowers temperature and exposes rock and scree."
    }),
    aquatic: freeze({
        id: "aquatic", label: "Aquatic", temp: [-4, 30], precip: [180, 4200],
        biomes: ["water", "swamp", "beach"], description: "Open water, saturated margins and floodplain ecology."
    }),
    coastal: freeze({
        id: "coastal", label: "Coastal", temp: [0, 32], precip: [120, 2600],
        biomes: ["beach", "water", "meadow"], description: "Salt spray, wind exposure and a shallow freshwater lens."
    })
});

const envelope = (zone, temp, precip, humidity, insolation, wind, soils, variants) => freeze({
    zone, temp: list(temp), precip: list(precip), humidity: list(humidity),
    insolation: list(insolation), wind: list(wind), soils: list(soils), variants: list(variants)
});

export const BIOME_CLIMATE_ENVELOPES = freeze({
    water: envelope("aquatic", [-3, 31], [180, 4300], [0.78, 1], [0.2, 0.9], [0.25, 1],
        ["silt", "clay", "peat"], ["reed-bed", "open-lake", "tidal-channel", "frozen-mere"]),
    beach: envelope("coastal", [2, 33], [120, 2700], [0.4, 0.95], [0.32, 1], [0.4, 1],
        ["sand", "silt", "chalk"], ["dune", "salt-marsh", "shingle-spit", "sheltered-cove"]),
    snow: envelope("polar", [-38, 8], [25, 720], [0.28, 0.92], [0.08, 0.7], [0.25, 1],
        ["permafrost", "rocky", "peat"], ["wind-scoured-ice", "deep-snow-basin", "meltwater-fen", "nunatak"]),
    rock: envelope("alpine", [-25, 20], [120, 1700], [0.2, 0.75], [0.28, 1], [0.42, 1],
        ["rocky", "chalk", "volcanic"], ["summit", "scree", "alpine-meadow", "shadowed-cirque"]),
    tundra: envelope("polar", [-33, 12], [55, 640], [0.28, 0.85], [0.18, 0.82], [0.3, 1],
        ["permafrost", "peat", "rocky"], ["dry-lichen-heath", "thaw-pond", "wind-scoured-ridge", "dwarf-birch-stand"]),
    taiga: envelope("boreal", [-29, 18], [230, 1250], [0.38, 0.9], [0.16, 0.82], [0.18, 0.95],
        ["podzol", "peat", "silt"], ["old-growth-spruce", "burnt-regeneration", "muskeg", "windthrow"]),
    swamp: envelope("tropical", [1, 34], [600, 4400], [0.72, 1], [0.18, 0.82], [0, 0.58],
        ["peat", "clay", "silt"], ["reed-fen", "alder-carr", "peat-bog", "drained-marsh"]),
    desert: envelope("dry", [3, 47], [0, 260], [0.03, 0.38], [0.68, 1], [0.2, 1],
        ["sand", "saline", "rocky"], ["sand-sea", "salt-pan", "stony-hamada", "spring-oasis"]),
    steppe: envelope("dry", [-12, 35], [120, 720], [0.18, 0.64], [0.46, 1], [0.32, 1],
        ["chernozem", "saline", "silt"], ["feather-grass", "chernozem-meadow", "saline-depression", "eroded-gully"]),
    meadow: envelope("temperate", [-8, 30], [360, 1650], [0.38, 0.86], [0.4, 0.98], [0.12, 0.82],
        ["loam", "chernozem", "chalk"], ["hay-meadow", "wet-flush", "chalk-downland", "rough-pasture"]),
    forest: envelope("temperate", [-10, 28], [450, 2000], [0.44, 0.94], [0.25, 0.85], [0.08, 0.72],
        ["loam", "silt", "podzol"], ["old-mixed-wood", "coppice", "hillside-wood", "alluvial-wood"]),
    "dense-forest": envelope("tropical", [4, 35], [820, 4300], [0.65, 1], [0.12, 0.76], [0, 0.55],
        ["laterite", "loam", "peat"], ["rainforest", "cloud-forest", "bamboo-brake", "monsoon-wood"])
});

export const BIOME_CLIMATE_ENVELOPE_BY_BIOME = BIOME_CLIMATE_ENVELOPES;

export const BIOME_SOIL_TYPES = freeze({
    sand: freeze({ id: "sand", label: "Sand", parent: "weathered sandstone", nutrients: 0.18, waterCapacity: 0.22, drainage: 0.92, erosion: 0.78, organic: 0.08, compaction: 0.3, saltTolerance: 0.72, frostProne: 0.25, acidity: 0.35 }),
    loam: freeze({ id: "loam", label: "Loam", parent: "mixed glacial till", nutrients: 0.68, waterCapacity: 0.62, drainage: 0.56, erosion: 0.36, organic: 0.52, compaction: 0.42, saltTolerance: 0.4, frostProne: 0.3, acidity: 0.48 }),
    clay: freeze({ id: "clay", label: "Heavy clay", parent: "lake clay", nutrients: 0.58, waterCapacity: 0.82, drainage: 0.2, erosion: 0.24, organic: 0.4, compaction: 0.72, saltTolerance: 0.3, frostProne: 0.55, acidity: 0.55 }),
    silt: freeze({ id: "silt", label: "Silt", parent: "river silt", nutrients: 0.62, waterCapacity: 0.7, drainage: 0.38, erosion: 0.58, organic: 0.46, compaction: 0.52, saltTolerance: 0.35, frostProne: 0.48, acidity: 0.5 }),
    peat: freeze({ id: "peat", label: "Peat", parent: "waterlogged plant remains", nutrients: 0.4, waterCapacity: 0.94, drainage: 0.12, erosion: 0.18, organic: 0.96, compaction: 0.26, saltTolerance: 0.2, frostProne: 0.62, acidity: 0.28 }),
    chalk: freeze({ id: "chalk", label: "Chalk", parent: "marine limestone", nutrients: 0.4, waterCapacity: 0.3, drainage: 0.84, erosion: 0.42, organic: 0.2, compaction: 0.34, saltTolerance: 0.46, frostProne: 0.28, acidity: 0.78 }),
    volcanic: freeze({ id: "volcanic", label: "Volcanic ash", parent: "weathered lava and ash", nutrients: 0.78, waterCapacity: 0.5, drainage: 0.52, erosion: 0.46, organic: 0.3, compaction: 0.36, saltTolerance: 0.32, frostProne: 0.24, acidity: 0.42 }),
    laterite: freeze({ id: "laterite", label: "Laterite", parent: "tropical weathered rock", nutrients: 0.32, waterCapacity: 0.42, drainage: 0.62, erosion: 0.66, organic: 0.24, compaction: 0.58, saltTolerance: 0.34, frostProne: 0.06, acidity: 0.28 }),
    saline: freeze({ id: "saline", label: "Saline soil", parent: "evaporite basin", nutrients: 0.2, waterCapacity: 0.34, drainage: 0.46, erosion: 0.6, organic: 0.1, compaction: 0.5, saltTolerance: 0.9, frostProne: 0.4, acidity: 0.7 }),
    permafrost: freeze({ id: "permafrost", label: "Permafrost", parent: "frozen loess and till", nutrients: 0.3, waterCapacity: 0.58, drainage: 0.24, erosion: 0.42, organic: 0.38, compaction: 0.3, saltTolerance: 0.2, frostProne: 0.96, acidity: 0.44 }),
    rocky: freeze({ id: "rocky", label: "Rocky scree", parent: "broken bedrock", nutrients: 0.22, waterCapacity: 0.2, drainage: 0.9, erosion: 0.7, organic: 0.12, compaction: 0.22, saltTolerance: 0.28, frostProne: 0.76, acidity: 0.52 }),
    podzol: freeze({ id: "podzol", label: "Podzol", parent: "conifer litter over sand", nutrients: 0.34, waterCapacity: 0.44, drainage: 0.64, erosion: 0.54, organic: 0.58, compaction: 0.4, saltTolerance: 0.22, frostProne: 0.7, acidity: 0.24 }),
    chernozem: freeze({ id: "chernozem", label: "Chernozem", parent: "deep grassland humus", nutrients: 0.9, waterCapacity: 0.66, drainage: 0.5, erosion: 0.32, organic: 0.86, compaction: 0.46, saltTolerance: 0.42, frostProne: 0.38, acidity: 0.58 }),
    alluvial: freeze({ id: "alluvial", label: "Alluvial soil", parent: "seasonal river deposits", nutrients: 0.74, waterCapacity: 0.76, drainage: 0.44, erosion: 0.5, organic: 0.6, compaction: 0.4, saltTolerance: 0.38, frostProne: 0.36, acidity: 0.54 })
});

const variant = (id, label, tag) => freeze({ id, label, tag });

export const BIOME_VARIANTS = freeze({
    water: freeze([
        variant("reed-bed", "Reed bed", "wet"), variant("open-lake", "Open lake", "all"),
        variant("tidal-channel", "Tidal channel", "windy"), variant("frozen-mere", "Frozen mere", "cold")
    ]),
    beach: freeze([
        variant("dune", "Dune belt", "windy"), variant("salt-marsh", "Salt marsh", "saline"),
        variant("shingle-spit", "Shingle spit", "low"), variant("sheltered-cove", "Sheltered cove", "sheltered")
    ]),
    snow: freeze([
        variant("wind-scoured-ice", "Wind-scoured ice", "windy"), variant("deep-snow-basin", "Deep-snow basin", "low"),
        variant("meltwater-fen", "Meltwater fen", "wet"), variant("nunatak", "Nunatak", "high")
    ]),
    rock: freeze([
        variant("summit", "Summit", "high"), variant("scree", "Frost-shattered scree", "cold"),
        variant("alpine-meadow", "Alpine meadow", "fertile"), variant("shadowed-cirque", "Shadowed cirque", "sheltered")
    ]),
    tundra: freeze([
        variant("dry-lichen-heath", "Dry lichen heath", "dry"), variant("thaw-pond", "Thaw pond", "wet"),
        variant("wind-scoured-ridge", "Wind-scoured ridge", "windy"), variant("dwarf-birch-stand", "Dwarf-birch stand", "sheltered")
    ]),
    taiga: freeze([
        variant("old-growth-spruce", "Old-growth spruce", "ancient"), variant("burnt-regeneration", "Burnt regeneration", "disturbed"),
        variant("muskeg", "Muskeg", "wet"), variant("windthrow", "Windthrow gap", "windy")
    ]),
    swamp: freeze([
        variant("reed-fen", "Reed fen", "wet"), variant("alder-carr", "Alder carr", "ancient"),
        variant("peat-bog", "Peat bog", "poor"), variant("drained-marsh", "Drained marsh", "managed")
    ]),
    desert: freeze([
        variant("sand-sea", "Sand sea", "windy"), variant("salt-pan", "Salt pan", "saline"),
        variant("stony-hamada", "Stony hamada", "poor"), variant("spring-oasis", "Spring oasis", "wet")
    ]),
    steppe: freeze([
        variant("feather-grass", "Feather-grass plain", "dry"), variant("chernozem-meadow", "Chernozem meadow", "fertile"),
        variant("saline-depression", "Saline depression", "saline"), variant("eroded-gully", "Eroded gully", "disturbed")
    ]),
    meadow: freeze([
        variant("hay-meadow", "Hay meadow", "managed"), variant("wet-flush", "Wet flush", "wet"),
        variant("chalk-downland", "Chalk downland", "dry"), variant("rough-pasture", "Rough pasture", "managed")
    ]),
    forest: freeze([
        variant("old-mixed-wood", "Old mixed wood", "ancient"), variant("coppice", "Coppice", "young"),
        variant("hillside-wood", "Hillside wood", "high"), variant("alluvial-wood", "Alluvial wood", "wet")
    ]),
    "dense-forest": freeze([
        variant("rainforest", "Lowland rainforest", "wet"), variant("cloud-forest", "Cloud forest", "high"),
        variant("bamboo-brake", "Bamboo brake", "young"), variant("monsoon-wood", "Monsoon wood", "dry")
    ])
});

// Map-visible seasonal tints share the same spring/summer/autumn/winter
// indices as BIOME_SEASONAL_APPEARANCE. They are drawn as a low-alpha wash
// over the existing biome overlay, so the map changes face without replacing
// the region colour or adding per-tile work.
export const BIOME_SEASONAL_TINTS = freeze({
    water: freeze(["#8fb9c9", "#6fa8c0", "#7c9bab", "#c4dbe6"]),
    beach: freeze(["#d8c98c", "#e6d39a", "#c9ad82", "#b8c9d2"]),
    snow: freeze(["#dfeef5", "#e8f3f7", "#d5e3ea", "#f2f8fb"]),
    rock: freeze(["#aaa69a", "#b8b09d", "#9e9488", "#d6dde4"]),
    tundra: freeze(["#9fae82", "#b8b78a", "#b58a5c", "#d8e4ea"]),
    taiga: freeze(["#6f9560", "#5d8a57", "#8a7b4e", "#c9dce4"]),
    swamp: freeze(["#7f9b65", "#6f9862", "#9b8b55", "#b7c6c7"]),
    desert: freeze(["#d8b978", "#e3c47c", "#c99a62", "#d8d2c1"]),
    steppe: freeze(["#b8b877", "#c9bf76", "#b88f55", "#c5c2b0"]),
    meadow: freeze(["#8fbf6a", "#c9c56b", "#c28a4f", "#c4d5dc"]),
    forest: freeze(["#6fa35f", "#5d8f55", "#a66f3f", "#c4d3d7"]),
    "dense-forest": freeze(["#4f8a4f", "#3f7f48", "#8a6f3e", "#b7c8c2"])
});

// Each biome has four own seasonal faces. The indices are spring, summer,
// autumn and winter, matching the game's 400-day calendar.
export const BIOME_SEASONAL_APPEARANCE = freeze({
    water: freeze(["thawing shallows and reeds", "warm open water and algal blooms", "grey water and migrating fowl", "ice cover with dark open leads"]),
    beach: freeze(["salt-washed sand and nesting birds", "hot dunes and dry wrack", "storm wrack and high tide", "cold shingle and salt frost"]),
    snow: freeze(["glare, meltwater and exposed moss", "low sun on wet snow", "first fresh snow over old crust", "deep drift and blue shadow"]),
    rock: freeze(["thawing fissures and alpine flowers", "dry scree and strong thermals", "cold rock and early snow", "rimed crags and avalanche fans"]),
    tundra: freeze(["thaw ponds and lichen colour", "short grass and cloud of insects", "red dwarf birch and migrating birds", "wind-cropped snow and frozen ground"]),
    taiga: freeze(["snowmelt bogs and black spruce", "dense green needles and long light", "rusty larch and mushroom flush", "snow-laden conifers and tracked game"]),
    swamp: freeze(["flooded reeds and frog chorus", "warm stagnant channels and lush growth", "seed heads and low water", "bare alder and ice pockets"]),
    desert: freeze(["rare rain and fast desert bloom", "white heat and dust haze", "cool nights and dry seed", "cold sand and clear stars"]),
    steppe: freeze(["green feather-grass and larks", "silver grass and dust", "golden seed heads and migrating herds", "brown stubble and frost"]),
    meadow: freeze(["new grass and orchard blossom", "tall hay and buzzing insects", "seed heads and turning hedges", "damp stubble and bare trees"]),
    forest: freeze(["bluebell floor and leaf-out", "deep shade and high canopy", "copper leaf fall and mast", "bare crowns and wet leaf litter"]),
    "dense-forest": freeze(["orchid flush and canopy gap", "humid green cathedral and fruit", "heavy mast and mist", "saturated shade and evergreen dark"])
});

export const BIOME_SEASONS = freeze([
    freeze({
        id: "spring", label: "Spring", sun: 0.55, growth: 1, snowLineShiftM: 0, waterFactor: 1.14, farmFactor: 1,
        plants: "leaf-out, flowering and root growth", animals: "breeding, return and first young",
        water: "snowmelt, high flow and full surface water", farm: "sowing, thaw and first pasture",
        hazard: "late frost, flood and wet-ground disease"
    }),
    freeze({
        id: "summer", label: "Summer", sun: 0.86, growth: 1.12, snowLineShiftM: 620, waterFactor: 0.84, farmFactor: 1.04,
        plants: "peak canopy, seed set and deep roots", animals: "young rearing, insect abundance and high activity",
        water: "low flow, warm water and falling groundwater", farm: "hay, irrigation and ripening grain",
        hazard: "drought, wildfire, heat and water scarcity"
    }),
    freeze({
        id: "autumn", label: "Autumn", sun: 0.45, growth: 0.7, snowLineShiftM: -180, waterFactor: 1.02, farmFactor: 0.66,
        plants: "senescence, mast and leaf fall", animals: "fattening, migration and winter stores",
        water: "receding flow and returning rain", farm: "harvest, autumn sowing and stubble grazing",
        hazard: "storm, flood, early frost and crop rot"
    }),
    freeze({
        id: "winter", label: "Winter", sun: 0.24, growth: 0.2, snowLineShiftM: -860, waterFactor: 0.86, farmFactor: 0.12,
        plants: "dormancy, frost hardiness and stored reserves", animals: "shelter, tracking and food scarcity",
        water: "ice, low flow and frozen ground", farm: "fallow, stored fodder and limited fieldwork",
        hazard: "deep frost, avalanche, hunger and frozen water"
    })
]);

const requirementGroups = freeze({
    climate: "Climate & local form",
    soil: "Soil",
    water: "Water",
    season: "Seasons",
    "land-use": "Land use",
    recovery: "Recovery",
    display: "Player readout"
});

const requirementRows = [
    ["temperature-range", "Each biome has a climatic temperature range", "climate"],
    ["precipitation-range", "Each biome has a typical precipitation range", "climate"],
    ["humidity-growth-soil", "Humidity affects plant growth and soil", "climate"],
    ["elevation-temperature-vegetation", "Elevation changes temperature and vegetation", "climate"],
    ["insolation-plants", "Insolation affects local plant development", "climate"],
    ["wind-vegetation-erosion", "Wind affects vegetation and erosion", "climate"],
    ["climate-zones-multiple-biomes", "Climate zones contain several related biomes", "climate"],
    ["local-variants", "Local deviations create regional variants", "climate"],
    ["soil-types", "Different soil types", "soil"],
    ["nutrients", "Different nutrient contents", "soil"],
    ["water-capacity", "Different water storage capacity", "soil"],
    ["compaction", "Soil compaction", "soil"],
    ["erosion", "Soil erosion", "soil"],
    ["humus", "Humus formation", "soil"],
    ["soil-organisms", "Soil organisms", "soil"],
    ["salinity", "Soil salinity", "soil"],
    ["frost-thaw", "Frost and thaw processes", "soil"],
    ["soil-regeneration", "Regeneration and long-term soil change", "soil"],
    ["precipitation-evaporation", "Precipitation and evaporation", "water"],
    ["surface-water", "Surface water", "water"],
    ["groundwater", "Groundwater", "water"],
    ["rivers-lakes", "River and lake systems", "water"],
    ["floodplains", "Floodplain areas", "water"],
    ["seasonal-water", "Seasonal water availability", "water"],
    ["water-quality", "Water quality", "water"],
    ["water-scarcity", "Water scarcity", "water"],
    ["moisture-gradients", "Moisture gradients", "water"],
    ["plants-animals-agriculture", "Effects on plants, animals and agriculture", "water"],
    ["seasonal-appearance", "Each biome has its own seasonal appearance", "season"],
    ["plant-season-reactions", "Different plant reactions to the seasons", "season"],
    ["animal-activity", "Changes in animal activity", "season"],
    ["seasonal-resources", "Seasonal resource availability", "season"],
    ["snow-frost-line", "Changing snow and frost lines", "season"],
    ["water-levels", "Changing water levels", "season"],
    ["farm-use", "Changing agricultural use", "season"],
    ["seasonal-hazards", "Seasonal hazards and diseases", "season"],
    ["clearing", "Clearing", "land-use"],
    ["afforestation", "Afforestation", "land-use"],
    ["grazing", "Overgrazing", "land-use"],
    ["farming", "Agricultural use", "land-use"],
    ["irrigation", "Irrigation", "land-use"],
    ["drainage", "Drainage", "land-use"],
    ["mining", "Mining", "land-use"],
    ["roads-settlement", "Road and settlement building", "land-use"],
    ["pollution", "Pollution", "land-use"],
    ["slash-burn", "Slash-and-burn", "land-use"],
    ["habitat-restoration", "Restoration of natural habitats", "land-use"],
    ["long-term-landscape", "Long-term landscape change through intensive use", "land-use"],
    ["vegetation-recovery", "Vegetation regeneration after disturbance", "recovery"],
    ["forest-regrowth", "Forest regrowth after clearing", "recovery"],
    ["colonization", "Plant colonisation of bare ground", "recovery"],
    ["fauna-return", "Return of animal populations", "recovery"],
    ["soil-recovery", "Long-term soil regeneration", "recovery"],
    ["water-recovery", "Water recovery after pollution", "recovery"],
    ["recovery-context", "Recovery depends on climate, soil and human use", "recovery"],
    ["irreversible-damage", "Not all damage is short-lived or fully reversible", "recovery"],
    ["display-biome", "Display the prevailing biome", "display"],
    ["display-variants", "Display biome variants", "display"],
    ["display-density", "Display vegetation density", "display"],
    ["display-resources", "Display typical resources", "display"],
    ["display-fauna", "Display the most important animal species", "display"],
    ["display-climate", "Display climatic conditions", "display"],
    ["display-hazards", "Display special hazards", "display"],
    ["display-agriculture", "Display agricultural suitability", "display"],
    ["display-movement", "Display movement modifiers", "display"],
    ["display-changes", "Display ecological changes", "display"]
].map(([key, label, group], index) => freeze({
    id: "1.2.21." + (index + 1), key, label, group,
    groupLabel: requirementGroups[group],
    evidence: [
        { file: "js/world/cross-biome-data.js", symbol: "BIOME_SYSTEM_REQUIREMENTS", role: "catalog" },
        { file: "js/systems/cross-biome-state.js", symbol: "getCrossBiomeProfile", role: "simulation" },
        { file: "js/presentation/biome-panel.js", symbol: "renderBiomePanel", role: "ui" }
    ]
}));

export const BIOME_SYSTEM_REQUIREMENTS = freeze(requirementRows);
export const BIOME_SYSTEM_REQUIREMENT_BY_ID = freeze(Object.fromEntries(requirementRows.map(row => [row.id, row])));
export const BIOME_SYSTEM_REQUIREMENT_GROUPS = requirementGroups;

export function climateEnvelopeFor(biome) {
    return BIOME_CLIMATE_ENVELOPES[biome] || BIOME_CLIMATE_ENVELOPES.meadow;
}

export function climateZoneFor(biome) {
    const current = climateEnvelopeFor(biome);
    return BIOME_CLIMATE_ZONES[current.zone] || BIOME_CLIMATE_ZONES.temperate;
}

export function seasonalAppearanceFor(biome, season = 0) {
    const looks = BIOME_SEASONAL_APPEARANCE[biome] || BIOME_SEASONAL_APPEARANCE.meadow;
    return looks[Math.max(0, Math.min(3, Math.floor(Number(season) || 0)))];
}
