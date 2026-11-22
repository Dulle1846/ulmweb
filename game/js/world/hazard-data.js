// 1.2.20 — Biome hazards, diseases and their countermeasures.
//
// Every numbered requirement of the spec table gets exactly one row here, and
// every row names the mechanic that implements it. The catalogue is pure data:
// it is imported by the simulation, the panel and the spec audit, so a new
// hazard cannot exist as a UI label without a rule behind it.
//
// `mechanic` groups:
//   hazard:<key>   one environmental event the seasonal pass can roll
//   bundle:<key>   a regional combination of those events
//   effect:<key>   a standing modifier the realm feels while hazards are active
//   work:<key>     a mitigation the player builds or researches
//   chronic:<key>  a multi-year process settled once per year
//   magic:<key>    a magical burden, corruption or antidote

export const HAZARD_CATEGORIES = Object.freeze({
    weather: Object.freeze({ id: "weather", label: "Weather", glyph: "☀" }),
    geology: Object.freeze({ id: "geology", label: "Geological", glyph: "⛰" }),
    flora: Object.freeze({ id: "flora", label: "Flora & wildlife", glyph: "☘" }),
    disease: Object.freeze({ id: "disease", label: "Disease", glyph: "☣" }),
    regional: Object.freeze({ id: "regional", label: "Regional", glyph: "◈" }),
    effect: Object.freeze({ id: "effect", label: "Realm effect", glyph: "≈" }),
    works: Object.freeze({ id: "works", label: "Protection", glyph: "⌂" }),
    chronic: Object.freeze({ id: "chronic", label: "Long term", glyph: "⧗" }),
    magic: Object.freeze({ id: "magic", label: "Arcane", glyph: "✦" })
});

export const HAZARD_CLIMATES = Object.freeze([
    "temperate", "northern", "taiga", "tundra", "snow", "mountain", "volcanic",
    "coastal", "savanna", "swamp", "mediterranean", "arid", "enchanted", "tropical"
]);

const ALL = HAZARD_CLIMATES;
const COLD = ["snow", "tundra", "taiga", "northern", "mountain"];
const HOT = ["arid", "savanna", "volcanic", "mediterranean", "tropical"];
const WET = ["tropical", "coastal", "swamp", "temperate", "enchanted"];
const HIGH = ["mountain", "volcanic"];
const FOREST = ["temperate", "northern", "taiga", "mountain", "enchanted", "tropical"];
const SEASONS = Object.freeze({
    spring: 0, summer: 1, autumn: 2, winter: 3,
    warm: [0, 1, 2], coldSeason: [2, 3], growing: [0, 1, 2]
});

// Compact row constructor keeps the 102-entry table readable and makes a
// missing requirement impossible to hide in prose.
function row(spec, id, label, category, mechanic, options = {}) {
    return Object.freeze({
        spec: "1.2.20." + spec,
        id,
        label,
        category,
        mechanic,
        climates: options.climates ? [...options.climates] : [...ALL],
        seasons: options.seasons ? [...options.seasons] : null,
        severity: Number.isFinite(options.severity) ? options.severity : 1,
        effect: options.effect || "",
        works: options.works ? [...options.works] : [],
        magical: Boolean(options.magical)
    });
}

export const HAZARD_CATALOG = Object.freeze([
    // ── Weather extremes 1–12 ────────────────────────────────────────────
    row(1, "extreme-heat", "Extreme heat", "weather", "hazard:heat",
        { climates: HOT, seasons: [1, 2], severity: 1.15, effect: "Heat sickness and water strain" }),
    row(2, "extreme-cold", "Extreme cold", "weather", "hazard:cold",
        { climates: COLD, seasons: [3, 0], severity: 1.15, effect: "Frostbite and fuel demand" }),
    row(3, "frost-periods", "Frost periods", "weather", "hazard:frost",
        { climates: [...COLD, "temperate", "mediterranean"], seasons: [0, 3], severity: 0.95, effect: "Frost kills seedlings and late crops" }),
    row(4, "heatwaves", "Heatwaves", "weather", "hazard:heatwave",
        { climates: [...HOT, "temperate"], seasons: [1], severity: 1.2, effect: "Work stops, water and food demand rise" }),
    row(5, "drought", "Drought", "weather", "hazard:drought",
        { climates: ["arid", "savanna", "mediterranean", "volcanic"], seasons: [1, 2], severity: 1.25, effect: "Harvest failure and pasture loss" }),
    row(6, "snowstorms", "Snowstorms", "weather", "hazard:snowstorm",
        { climates: COLD, seasons: [3, 0], severity: 1.1, effect: "Supply roads close, stock is buried" }),
    row(7, "sandstorms", "Sandstorms", "weather", "hazard:sandstorm",
        { climates: ["arid", "savanna"], seasons: [1, 2], severity: 1.05, effect: "Soil is stripped, lungs and tools suffer" }),
    row(8, "heavy-rain", "Heavy rain", "weather", "hazard:rain",
        { climates: WET, seasons: [0, 2], severity: 0.85, effect: "Sowing is delayed and stores dampen" }),
    row(9, "floods", "Floods", "weather", "hazard:flood",
        { climates: [...WET, "mountain"], seasons: [0, 2], severity: 1.3, effect: "Fields, roads and buildings are damaged" }),
    row(10, "thunderstorms", "Thunderstorms", "weather", "hazard:storm",
        { seasons: [1, 2], severity: 0.9, effect: "Lightning injures workers and starts fires" }),
    row(11, "high-winds", "High altitude winds", "weather", "hazard:wind",
        { climates: ["mountain", "coastal", "tundra"], seasons: [2, 3], severity: 0.9, effect: "Roofs and caravans are exposed" }),
    row(12, "temperature-swings", "Sudden temperature swings", "weather", "hazard:swing",
        { climates: ["northern", "temperate", "mountain", "taiga"], seasons: [0, 3], severity: 0.8, effect: "Illness and spoiled stores" }),

    // ── Geological 13–22 ────────────────────────────────────────────────
    row(13, "landslides", "Landslides", "geology", "hazard:landslide",
        { climates: [...HIGH, "coastal", "tropical"], seasons: [0, 2], severity: 1.2, effect: "Roads and hillside structures collapse" }),
    row(14, "rockfalls", "Rockfalls", "geology", "hazard:rockfall",
        { climates: HIGH, severity: 1.05, effect: "Quarries and mountain roads are struck" }),
    row(15, "avalanches", "Avalanches", "geology", "hazard:avalanche",
        { climates: ["snow", "mountain", "tundra", "taiga"], seasons: [3, 0], severity: 1.25, effect: "Slope structures and passes are buried" }),
    row(16, "earthquakes", "Earthquakes", "geology", "hazard:quake",
        { climates: [...HIGH, "coastal"], severity: 1.3, effect: "Walls crack, roads break, wells silt" }),
    row(17, "eruptions", "Volcanic eruptions", "geology", "hazard:eruption",
        { climates: ["volcanic", "mountain"], severity: 1.5, effect: "Ash buries pasture, lava consumes structures" }),
    row(18, "lava-flows", "Lava flows", "geology", "hazard:lava",
        { climates: ["volcanic"], severity: 1.5, effect: "Ground is lost permanently" }),
    row(19, "subsidence", "Ground subsidence", "geology", "hazard:subsidence",
        { climates: ["arid", "volcanic", "coastal"], severity: 0.85, effect: "Foundations sink and cisterns crack" }),
    row(20, "unstable-rock", "Unstable rock formations", "geology", "hazard:unstable-rock",
        { climates: HIGH, severity: 0.9, effect: "Mining and building are unsafe" }),
    row(21, "cave-ins", "Cave-ins", "geology", "hazard:cave-in",
        { climates: [...HIGH, "arid"], severity: 1.1, effect: "Mine galleries collapse with the shift inside" }),
    row(22, "geothermal", "Geothermal hazards", "geology", "hazard:geothermal",
        { climates: ["volcanic", "mountain"], severity: 0.9, effect: "Scalding vents, sulphur gas and poisoned springs" }),

    // ── Flora, fauna and poison 23–32 ───────────────────────────────────
    row(23, "poisonous-plants", "Poisonous plants", "flora", "hazard:poison-plant",
        { climates: [...FOREST, "swamp"], severity: 0.85, effect: "Foragers and children are poisoned" }),
    row(24, "poisonous-mushrooms", "Poisonous mushrooms", "flora", "hazard:poison-mushroom",
        { climates: ["temperate", "northern", "taiga", "mountain", "enchanted"], seasons: [2], severity: 0.8, effect: "Autumn foraging turns deadly" }),
    row(25, "poisonous-snakes", "Poisonous snakes", "flora", "hazard:poison-snake",
        { climates: ["arid", "savanna", "tropical", "swamp"], seasons: [1], severity: 0.95, effect: "Field and road work is dangerous" }),
    row(26, "poisonous-insects", "Poisonous insects", "flora", "hazard:poison-insect",
        { climates: ["tropical", "swamp", "savanna"], severity: 0.9, effect: "Stings injure workers" }),
    row(27, "predators", "Dangerous predators", "flora", "hazard:predator",
        { climates: ["taiga", "tropical", "mountain", "temperate", "northern"], seasons: [2, 3], severity: 1.0, effect: "Livestock and isolated residents are taken" }),
    row(28, "parasites", "Parasites", "flora", "hazard:parasite",
        { climates: ["tropical", "swamp", "coastal"], severity: 1.0, effect: "Chronic weakness and weight loss" }),
    row(29, "pathogens", "Pathogens", "flora", "hazard:pathogen",
        { severity: 0.95, effect: "Outbreaks start from contaminated ground" }),
    row(30, "animal-plagues", "Animal plagues", "flora", "hazard:epizootic",
        { climates: ["temperate", "savanna", "northern"], severity: 1.1, effect: "Herds and draught animals die" }),
    row(31, "plant-diseases", "Plant diseases", "flora", "hazard:plant-disease",
        { climates: ["temperate", "tropical", "savanna", "mediterranean"], severity: 1.0, effect: "Fields and orchards fail" }),
    row(32, "pests", "Pests and insect plagues", "flora", "hazard:pest",
        { climates: ["savanna", "temperate", "tropical"], seasons: [1, 2], severity: 1.0, effect: "Stores and standing crops are eaten" }),

    // ── Disease 33–42 ───────────────────────────────────────────────────
    row(33, "vector-disease", "Insect-borne diseases", "disease", "hazard:vector-disease",
        { climates: ["tropical", "swamp", "savanna"], seasons: [1, 2], severity: 1.1, effect: "Fever spreads from standing water" }),
    row(34, "water-disease", "Water-borne diseases", "disease", "hazard:water-disease",
        { severity: 1.15, effect: "Wells and rivers carry infection" }),
    row(35, "parasite-disease", "Parasitic diseases", "disease", "hazard:parasite-disease",
        { climates: ["tropical", "swamp"], severity: 1.0, effect: "Long illness that resists treatment" }),
    row(36, "hygiene-disease", "Damp and unhygienic infections", "disease", "hazard:hygiene-disease",
        { severity: 1.0, effect: "Crowded, wet housing breeds infection" }),
    row(37, "respiratory", "Dust and ash respiratory illness", "disease", "hazard:respiratory",
        { climates: ["arid", "volcanic"], severity: 1.0, effect: "Lungs fail where dust and ash settle" }),
    row(38, "frostbite", "Frostbite and cold illness", "disease", "hazard:frostbite",
        { climates: COLD, seasons: [3, 0], severity: 1.1, effect: "Exposed residents lose working time" }),
    row(39, "heat-illness", "Heat illness", "disease", "hazard:heat-illness",
        { climates: HOT, seasons: [1], severity: 1.05, effect: "Exhaustion and collapse in the fields" }),
    row(40, "deficiency", "Deficiency diseases", "disease", "hazard:deficiency",
        { severity: 1.0, effect: "A thin store weakens the whole realm" }),
    row(41, "spoiled-food", "Illness from spoiled food", "disease", "hazard:spoiled-food",
        { severity: 0.9, effect: "Warm, damp store rooms poison their keepers" }),
    row(42, "regional-disease", "Regional diseases", "disease", "hazard:regional-disease",
        { severity: 1.1, effect: "Each climate carries its own recurring sickness" }),

    // ── Regional bundles 43–51 ──────────────────────────────────────────
    row(43, "swamp-dangers", "Swamp dangers", "regional", "bundle:swamp",
        { climates: ["swamp"], effect: "Sinking ground, insects, fever and bad sight" }),
    row(44, "desert-dangers", "Desert dangers", "regional", "bundle:desert",
        { climates: ["arid"], effect: "Water shortage, heat, sandstorms, cold nights" }),
    row(45, "mountain-dangers", "Mountain dangers", "regional", "bundle:mountain",
        { climates: ["mountain"], effect: "Avalanche, rockfall, altitude and cold" }),
    row(46, "tundra-dangers", "Tundra dangers", "regional", "bundle:tundra",
        { climates: ["tundra"], effect: "Hypothermia, frost and a short supply season" }),
    row(47, "rainforest-dangers", "Rainforest dangers", "regional", "bundle:rainforest",
        { climates: ["tropical"], effect: "Parasites, disease, venom and poor navigation" }),
    row(48, "taiga-dangers", "Taiga dangers", "regional", "bundle:taiga",
        { climates: ["taiga"], effect: "Long winters, snowstorms and forest fire" }),
    row(49, "steppe-dangers", "Steppe dangers", "regional", "bundle:steppe",
        { climates: ["savanna"], effect: "Drought, dust storms and water scarcity" }),
    row(50, "volcano-dangers", "Volcano dangers", "regional", "bundle:volcano",
        { climates: ["volcanic"], effect: "Gas, ash, lava and tremors" }),
    row(51, "coast-dangers", "Coast dangers", "regional", "bundle:coast",
        { climates: ["coastal"], effect: "Storm surge, flood and coastal erosion" }),

    // ── Standing effects 52–62 ──────────────────────────────────────────
    row(52, "magic-burden", "Magical burdens and curses", "magic", "magic:burden",
        { climates: ["enchanted"], magical: true, effect: "The land reacts to old magic" }),
    row(53, "disease-risk", "Higher disease chance in some environments", "effect", "effect:disease-risk",
        { effect: "Local conditions raise the chance of an outbreak" }),
    row(54, "resistance", "Resistance from equipment and experience", "effect", "effect:resistance",
        { effect: "Clothing, tools and veteran crews reduce losses" }),
    row(55, "needs", "Higher food and water demand", "effect", "effect:needs",
        { effect: "Extreme conditions consume more stores" }),
    row(56, "movement", "Restricted movement", "effect", "effect:movement",
        { effect: "Deep snow, flood and fog slow every journey" }),
    row(57, "losses", "Losses from environmental hazards", "effect", "effect:losses",
        { effect: "Structures, stores and stock are destroyed" }),
    row(58, "work", "Lower work output in extreme climate", "effect", "effect:work",
        { effect: "Labour yields less while the hazard lasts" }),
    row(59, "clothing", "Clothing and shelter requirements", "effect", "effect:clothing",
        { effect: "Unadapted housing costs lives" }),
    row(60, "adaptation", "Regional adaptation", "effect", "effect:adaptation",
        { effect: "Local families endure their own climate better" }),
    row(61, "morale", "Effects on morale and contentment", "effect", "effect:morale",
        { effect: "Visible hazards erode confidence" }),
    row(62, "medical", "Need for supply and medical facilities", "effect", "effect:medical",
        { effect: "Clinics, medicine and healers limit the damage" }),

    // ── Harvest and economy damage 63–71 ───────────────────────────────
    row(63, "crop-failure", "Harvest failure through drought", "effect", "effect:crop-failure",
        { effect: "Fields lose growth and yield" }),
    row(64, "frost-damage", "Frost damage", "effect", "effect:frost-damage",
        { effect: "Sown and growing fields are cut back" }),
    row(65, "flood-damage", "Flood damage", "effect", "effect:flood-damage",
        { effect: "Topsoil is washed out and fields need years to recover" }),
    row(66, "crop-disease", "Plant disease in the fields", "effect", "effect:crop-disease",
        { effect: "Infected fields yield less until cleaned" }),
    row(67, "crop-pest", "Pest infestation", "effect", "effect:crop-pest",
        { effect: "Pests eat the standing crop and the store" }),
    row(68, "pasture-loss", "Loss of pasture", "effect", "effect:pasture-loss",
        { effect: "Stables and herds lose their grazing" }),
    row(69, "herd-plague", "Animal plague", "effect", "effect:herd-plague",
        { effect: "Draught and dairy animals die" }),
    row(70, "trade-damage", "Damaged trade routes", "effect", "effect:trade-damage",
        { effect: "Roads and bridges fail, caravans are delayed" }),
    row(71, "extraction", "Harder raw material extraction", "effect", "effect:extraction",
        { effect: "Quarries, mines and lumber camps produce less" }),

    // ── Protection works 72–83 ──────────────────────────────────────────
    row(72, "work-clothing", "Adapted clothing", "works", "work:clothing",
        { works: ["clinic", "bathhouse"] }),
    row(73, "work-medical", "Medical care", "works", "work:medical",
        { works: ["clinic", "healer", "medicine"] }),
    row(74, "work-well", "Wells and water reservoirs", "works", "work:well",
        { works: ["well", "bathhouse"] }),
    row(75, "work-irrigation", "Irrigation systems", "works", "work:irrigation",
        { works: ["mill", "farm"] }),
    row(76, "work-dam", "Protective walls and dams", "works", "work:dam",
        { works: ["wall", "mason"] }),
    row(77, "work-avalanche", "Avalanche protection", "works", "work:avalanche",
        { works: ["forester", "wall"] }),
    row(78, "work-drainage", "Drainage", "works", "work:drainage",
        { works: ["bathhouse", "sanitation"] }),
    row(79, "work-roads", "Roads and bridges", "works", "work:roads",
        { works: ["roads"] }),
    row(80, "work-warehouse", "Warehouses and storage", "works", "work:warehouse",
        { works: ["warehouse"] }),
    row(81, "work-research", "Regional research and knowledge", "works", "work:research",
        { works: ["school", "scriptorium", "research"] }),
    row(82, "work-units", "Specialised units and equipment", "works", "work:units",
        { works: ["barracks", "smithy"] }),
    row(83, "work-siting", "Adapted settlement siting", "works", "work:siting",
        { works: ["keep"] }),

    // ── Seasonal and long-term dynamics 84–92 ──────────────────────────
    row(84, "seasonal-dynamics", "Hazards change with season and weather", "chronic", "chronic:seasonal",
        { effect: "The same ground is safe in one season and deadly in another" }),
    row(85, "multi-year-drought", "Multi-year droughts", "chronic", "chronic:drought-years",
        { climates: ["arid", "savanna", "mediterranean"], effect: "Drought compounds across years" }),
    row(86, "plague-trade", "Disease spreads along trade routes", "chronic", "chronic:plague-trade",
        { effect: "An outbreak reaches neighbours through caravans" }),
    row(87, "epizootic-regions", "Animal plagues across settlements", "chronic", "chronic:epizootic-regions",
        { effect: "Herds fall in several places in the same year" }),
    row(88, "wildfire-zones", "Wildfires and new danger zones", "chronic", "chronic:wildfire",
        { climates: [...FOREST, "savanna"], seasons: [1, 2], effect: "Burnt ground stays dangerous for years" }),
    row(89, "flood-scars", "Floods reshape land and infrastructure", "chronic", "chronic:flood-scars",
        { effect: "Channels move and fields carry scars" }),
    row(90, "volcanic-region", "Regional volcanic effects", "chronic", "chronic:volcanic-region",
        { climates: ["volcanic"], effect: "Ash and gas reach neighbouring regions" }),
    row(91, "climate-trend", "Climate change and new hazards", "chronic", "chronic:climate-trend",
        { effect: "The realm's baseline shifts over decades" }),
    row(92, "long-term-economy", "Long-term economic consequences", "chronic", "chronic:long-term-economy",
        { effect: "Repeated disasters leave a lasting drag" }),

    // ── Magic 93–102 ───────────────────────────────────────────────────
    row(93, "magic-contamination", "Magically contaminated ground", "magic", "magic:corruption",
        { climates: ["enchanted"], magical: true, effect: "Corruption seeps into soil and water" }),
    row(94, "cursed-life", "Cursed plants and animals", "magic", "magic:cursed",
        { climates: ["enchanted"], magical: true, effect: "Harvests and hunts turn hostile" }),
    row(95, "toxic-fog", "Toxic magical fog", "magic", "magic:fog",
        { climates: ["enchanted", "swamp"], magical: true, effect: "Sight, movement and lungs suffer" }),
    row(96, "unnatural-weather", "Unnatural weather", "magic", "magic:unnatural-weather",
        { climates: ["enchanted"], magical: true, effect: "Weather ignores the season" }),
    row(97, "magic-disease", "Magical diseases", "magic", "magic:disease",
        { climates: ["enchanted"], magical: true, effect: "Illness that medicine cannot fully explain" }),
    row(98, "animal-shift", "Changed animal populations", "magic", "magic:animal-shift",
        { climates: ["enchanted"], magical: true, effect: "Wildlife changes behaviour and range" }),
    row(99, "corruption-spread", "Spreading corruption", "magic", "magic:spread",
        { climates: ["enchanted"], magical: true, effect: "Untreated ground taints its neighbours" }),
    row(100, "forbidden-plants", "Forbidden or dangerous plants", "magic", "magic:forbidden",
        { climates: ["enchanted", "tropical"], magical: true, effect: "Some plants must not be gathered" }),
    row(101, "wards", "Special protections and antidotes", "magic", "magic:wards",
        { climates: ["enchanted"], magical: true, effect: "Wards and antidotes hold the taint back" }),
    row(102, "rare-events", "Rare events with lasting regional consequences", "magic", "magic:rare",
        { climates: ["enchanted"], magical: true, effect: "One event can shape a region for decades" })
]);

// Manifest consumed by the spec audit. It carries the numbered requirement, its
// label, its stable key and the category group, so 1.2.20 is audited against
// the same table the simulation reads instead of a separately maintained list.
export const HAZARD_REQUIREMENTS = Object.freeze(HAZARD_CATALOG.map(entry => Object.freeze({
    id: entry.spec, label: entry.label, key: entry.id, group: entry.category
})));

export const HAZARD_BY_SPEC = Object.freeze(Object.fromEntries(HAZARD_CATALOG.map(entry => [entry.spec, entry])));
export const HAZARD_BY_ID = Object.freeze(Object.fromEntries(HAZARD_CATALOG.map(entry => [entry.id, entry])));

// The mechanics the engine actually evaluates. A catalogue row whose mechanic
// is missing here would be a label without a rule, so the test suite compares
// both lists instead of trusting the table.
export const HAZARD_MECHANICS = Object.freeze([
    "hazard:heat", "hazard:cold", "hazard:frost", "hazard:heatwave", "hazard:drought",
    "hazard:snowstorm", "hazard:sandstorm", "hazard:rain", "hazard:flood", "hazard:storm",
    "hazard:wind", "hazard:swing", "hazard:landslide", "hazard:rockfall", "hazard:avalanche",
    "hazard:quake", "hazard:eruption", "hazard:lava", "hazard:subsidence", "hazard:unstable-rock",
    "hazard:cave-in", "hazard:geothermal", "hazard:poison-plant", "hazard:poison-mushroom",
    "hazard:poison-snake", "hazard:poison-insect", "hazard:predator", "hazard:parasite",
    "hazard:pathogen", "hazard:epizootic", "hazard:plant-disease", "hazard:pest",
    "hazard:vector-disease", "hazard:water-disease", "hazard:parasite-disease",
    "hazard:hygiene-disease", "hazard:respiratory", "hazard:frostbite", "hazard:heat-illness",
    "hazard:deficiency", "hazard:spoiled-food", "hazard:regional-disease",
    "bundle:swamp", "bundle:desert", "bundle:mountain", "bundle:tundra", "bundle:rainforest",
    "bundle:taiga", "bundle:steppe", "bundle:volcano", "bundle:coast",
    "effect:disease-risk", "effect:resistance", "effect:needs", "effect:movement",
    "effect:losses", "effect:work", "effect:clothing", "effect:adaptation", "effect:morale",
    "effect:medical", "effect:crop-failure", "effect:frost-damage", "effect:flood-damage",
    "effect:crop-disease", "effect:crop-pest", "effect:pasture-loss", "effect:herd-plague",
    "effect:trade-damage", "effect:extraction",
    "work:clothing", "work:medical", "work:well", "work:irrigation", "work:dam",
    "work:avalanche", "work:drainage", "work:roads", "work:warehouse", "work:research",
    "work:units", "work:siting",
    "chronic:seasonal", "chronic:drought-years", "chronic:plague-trade", "chronic:epizootic-regions",
    "chronic:wildfire", "chronic:flood-scars", "chronic:volcanic-region", "chronic:climate-trend",
    "chronic:long-term-economy",
    "magic:burden", "magic:corruption", "magic:cursed", "magic:fog", "magic:unnatural-weather",
    "magic:disease", "magic:animal-shift", "magic:spread", "magic:forbidden", "magic:wards",
    "magic:rare"
]);

// Concrete hazards the seasonal pass can roll. Effects are the actual numbers
// the engine applies, so a hazard cannot be stronger in prose than in play.
export const HAZARD_EFFECTS = Object.freeze({
    "hazard:heat": Object.freeze({ illness: 0.34, water: 2, work: 0.16, morale: 1, field: 0.05 }),
    "hazard:cold": Object.freeze({ illness: 0.3, wood: 2, work: 0.18, morale: 1, field: 0.02 }),
    "hazard:frost": Object.freeze({ field: 0.28, food: 1, work: 0.1, morale: 0 }),
    "hazard:heatwave": Object.freeze({ illness: 0.38, water: 3, work: 0.26, morale: 2, field: 0.12 }),
    "hazard:drought": Object.freeze({ illness: 0.16, water: 4, work: 0.12, morale: 2, field: 0.34, pasture: 0.3 }),
    "hazard:snowstorm": Object.freeze({ illness: 0.24, food: 2, work: 0.24, morale: 1, field: 0.04, trade: 0.2 }),
    "hazard:sandstorm": Object.freeze({ illness: 0.3, water: 2, work: 0.2, morale: 1, field: 0.16, trade: 0.16 }),
    "hazard:rain": Object.freeze({ illness: 0.16, work: 0.08, morale: 0, field: 0.06 }),
    "hazard:flood": Object.freeze({ illness: 0.22, food: 3, work: 0.16, morale: 2, field: 0.32, trade: 0.24 }),
    "hazard:storm": Object.freeze({ illness: 0.14, wood: 1, work: 0.14, morale: 1, field: 0.05 }),
    "hazard:wind": Object.freeze({ illness: 0.1, wood: 1, work: 0.18, morale: 0, trade: 0.18 }),
    "hazard:swing": Object.freeze({ illness: 0.24, food: 1, work: 0.08, morale: 1 }),
    "hazard:landslide": Object.freeze({ injury: 0.3, food: 1, work: 0.2, morale: 2, trade: 0.34, destroy: 0.34 }),
    "hazard:rockfall": Object.freeze({ injury: 0.32, work: 0.18, morale: 1, destroy: 0.26 }),
    "hazard:avalanche": Object.freeze({ injury: 0.36, food: 2, work: 0.2, morale: 2, destroy: 0.36 }),
    "hazard:quake": Object.freeze({ injury: 0.34, work: 0.16, morale: 3, destroy: 0.4, trade: 0.2 }),
    "hazard:eruption": Object.freeze({ illness: 0.4, food: 4, work: 0.3, morale: 4, field: 0.4, destroy: 0.46, ash: 0.5 }),
    "hazard:lava": Object.freeze({ injury: 0.4, work: 0.2, morale: 4, destroy: 0.5, permanent: 0.1 }),
    "hazard:subsidence": Object.freeze({ work: 0.12, morale: 2, destroy: 0.2, trade: 0.14 }),
    "hazard:unstable-rock": Object.freeze({ injury: 0.24, work: 0.22, destroy: 0.2 }),
    "hazard:cave-in": Object.freeze({ injury: 0.34, work: 0.2, morale: 2, destroy: 0.24 }),
    "hazard:geothermal": Object.freeze({ illness: 0.3, water: 1, work: 0.14, morale: 1 }),
    "hazard:poison-plant": Object.freeze({ illness: 0.3, food: 1, work: 0.06, morale: 1 }),
    "hazard:poison-mushroom": Object.freeze({ illness: 0.34, food: 2, odd: 0.1 }),
    "hazard:poison-snake": Object.freeze({ injury: 0.3, work: 0.1, morale: 1 }),
    "hazard:poison-insect": Object.freeze({ illness: 0.24, injury: 0.12, work: 0.1, morale: 1 }),
    "hazard:predator": Object.freeze({ injury: 0.2, food: 2, work: 0.06, morale: 2 }),
    "hazard:parasite": Object.freeze({ illness: 0.34, work: 0.14, morale: 1 }),
    "hazard:pathogen": Object.freeze({ outbreak: 0.26, illness: 0.3, morale: 1 }),
    "hazard:epizootic": Object.freeze({ food: 3, work: 0.14, morale: 2, herd: 0.34 }),
    "hazard:plant-disease": Object.freeze({ field: 0.26, food: 1, work: 0.04, morale: 1 }),
    "hazard:pest": Object.freeze({ field: 0.2, food: 3, work: 0.06, morale: 1 }),
    "hazard:vector-disease": Object.freeze({ outbreak: 0.24, illness: 0.34, work: 0.08, morale: 1 }),
    "hazard:water-disease": Object.freeze({ outbreak: 0.22, illness: 0.36, work: 0.06, morale: 1 }),
    "hazard:parasite-disease": Object.freeze({ illness: 0.4, work: 0.16, morale: 1 }),
    "hazard:hygiene-disease": Object.freeze({ outbreak: 0.2, illness: 0.3, work: 0.06, morale: 1 }),
    "hazard:respiratory": Object.freeze({ illness: 0.32, work: 0.12, morale: 1 }),
    "hazard:frostbite": Object.freeze({ illness: 0.3, work: 0.2, morale: 1 }),
    "hazard:heat-illness": Object.freeze({ illness: 0.32, work: 0.18, morale: 1 }),
    "hazard:deficiency": Object.freeze({ illness: 0.3, work: 0.2, morale: 2 }),
    "hazard:spoiled-food": Object.freeze({ illness: 0.26, food: 2, morale: 1 }),
    "hazard:regional-disease": Object.freeze({ outbreak: 0.16, illness: 0.28, morale: 1 })
});

export const HAZARD_LIMITS = Object.freeze({
    maxActive: 6,
    // A season carries at most this many real events; the rest of the climate's
    // dangers stay potential. Without it every climate hit with six disasters
    // every season and the economy never recovered between them.
    maxApplied: 3,
    maxHistory: 24,
    maxDiseases: 6,
    maxZones: 12,
    maxEventsPerSeason: 8,
    maxFieldsPerPass: 24,
    maxBuildingsPerPass: 64,
    maxTradePartners: 6,
    // Per-season budgets. A hazard season is meant to cost the realm something
    // real, not to empty the granary or destroy a district in one afternoon.
    foodPerSeason: 6,
    // Hazards take the surplus, never the seed grain.
    foodReserve: 30,
    moralePerSeason: 1,
    // Hazards foul the water and the ground, but they never declare a plague
    // by themselves: the floor keeps the health system's own outbreak threshold
    // (40) out of reach, so a hazard can tip a neglected realm but not doom a
    // well-run one.
    sanitationFloor: 46
});

// Regional bundles turn one climate into its real combination of dangers. The
// percentages are weights inside the climate profile, not a second simulation.
export const REGIONAL_BUNDLES = Object.freeze({
    "bundle:swamp": Object.freeze({ climate: "swamp", hazards: ["water-disease", "parasite", "poison-plant", "flood", "vector-disease"], exposure: 1.15 }),
    "bundle:desert": Object.freeze({ climate: "arid", hazards: ["heat", "drought", "sandstorm", "cold", "heat-illness"], exposure: 1.2 }),
    "bundle:mountain": Object.freeze({ climate: "mountain", hazards: ["avalanche", "rockfall", "landslide", "cold", "wind"], exposure: 1.2 }),
    "bundle:tundra": Object.freeze({ climate: "tundra", hazards: ["cold", "frost", "snowstorm", "frostbite", "deficiency"], exposure: 1.2 }),
    "bundle:rainforest": Object.freeze({ climate: "tropical", hazards: ["parasite", "vector-disease", "poison-snake", "rain", "predator"], exposure: 1.2 }),
    "bundle:taiga": Object.freeze({ climate: "taiga", hazards: ["snowstorm", "cold", "predator", "plant-disease", "frost"], exposure: 1.15 }),
    "bundle:steppe": Object.freeze({ climate: "savanna", hazards: ["drought", "sandstorm", "wind", "epizootic", "heat-illness"], exposure: 1.15 }),
    "bundle:volcano": Object.freeze({ climate: "volcanic", hazards: ["eruption", "lava", "quake", "respiratory", "geothermal"], exposure: 1.3 }),
    "bundle:coast": Object.freeze({ climate: "coastal", hazards: ["storm", "flood", "wind", "water-disease", "subsidence"], exposure: 1.1 })
});

// Name used in the chronicle and panel for each mechanic. Kept next to the data
// so a renamed hazard cannot leave the log with an old label.
export const HAZARD_LABELS = Object.freeze(Object.fromEntries(
    HAZARD_CATALOG.map(entry => [entry.mechanic, entry.label])
));

export function hazardRowsForClimate(climate) {
    const key = HAZARD_CLIMATES.includes(climate) ? climate : "temperate";
    return HAZARD_CATALOG.filter(entry => entry.climates.includes(key));
}

export function hazardRowForMechanic(mechanic) {
    return HAZARD_CATALOG.find(entry => entry.mechanic === mechanic) || null;
}
