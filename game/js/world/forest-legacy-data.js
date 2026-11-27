// 1.2.23.1.271–300 — long-term forest systems, events, modding and QA.
//
// This is a catalog, not a second forest simulator. The runtime reads the
// existing sixty regional forest types, their species and fauna, the shared
// climate drift and the ordinary province atlas. It adds only a bounded
// ten-region legacy ledger (one per world province) on a yearly cadence.
import { WORLD_REGION_CATALOG } from "./world-regions.js";

const freeze = value => Object.freeze(value);

export const FOREST_LEGACY_VERSION = 1;
export const FOREST_LEGACY_REGION_LIMIT = WORLD_REGION_CATALOG.length;
export const FOREST_LEGACY_SPECIES_LIMIT = 8;
export const FOREST_LEGACY_RING_LIMIT = 60;
export const FOREST_LEGACY_HISTORY_LIMIT = 40;
export const FOREST_LEGACY_ACTION_LIMIT = 80;
export const FOREST_LEGACY_INSTITUTION_LIMIT = 3;
export const FOREST_LEGACY_REFERENCE_SEEDS = freeze({
    "crown-heartland": 27101,
    "crown-march": 27102,
    "northmere-pines": 27103,
    "northmere-fen": 27104,
    "ironvale-crags": 27105,
    "ironvale-pass": 27106,
    "goldcoast-vines": 27107,
    "goldcoast-harbor": 27108,
    "redpass-gorge": 27109,
    "redpass-steppe": 27110,
});

const REGION_CLIMATE = freeze({
    "crown-heartland": "temperate",
    "crown-march": "temperate",
    "northmere-pines": "taiga",
    "northmere-fen": "swamp",
    "ironvale-crags": "mountain",
    "ironvale-pass": "mountain",
    "goldcoast-vines": "mediterranean",
    "goldcoast-harbor": "coastal",
    "redpass-gorge": "arid",
    "redpass-steppe": "savanna",
});

export const FOREST_LEGACY_REGIONS = freeze(WORLD_REGION_CATALOG.map(region => freeze({
    id: region.id,
    name: region.name,
    ownerId: region.ownerId,
    referenceSeed: FOREST_LEGACY_REFERENCE_SEEDS[region.id],
    climate: REGION_CLIMATE[region.id] || "temperate",
    elevationBand: region.id === "ironvale-crags" || region.id === "ironvale-pass" ? "high"
        : region.id === "northmere-fen" || region.id === "goldcoast-harbor" ? "low" : "middle",
})));

export const FOREST_LEGACY_REGION_IDS = freeze(FOREST_LEGACY_REGIONS.map(region => region.id));

export const FOREST_LEGACY_INSTITUTIONS = freeze({
    "seed-bank": freeze({
        id: "seed-bank", label: "Seed Bank", icon: "◈",
        description: "Stores viable seed of the region's trees. A backed-up species can return after local extinction.",
        effect: "Preserves seed, slows extinction, supplies reintroduction.",
        costs: freeze([{ gold: 24, wood: 8 }, { gold: 42, wood: 14 }, { gold: 70, wood: 22 }]),
        capacity: freeze([24, 56, 96]),
    }),
    "gene-bank": freeze({
        id: "gene-bank", label: "Gene Bank", icon: "❋",
        description: "Keeps breeding lines and genetic material from threatened trees and animals.",
        effect: "Raises genetic breadth and makes conservation breeding possible.",
        costs: freeze([{ gold: 30, wood: 6 }, { gold: 52, wood: 12 }, { gold: 84, wood: 20 }]),
        capacity: freeze([8, 18, 32]),
    }),
    nursery: freeze({
        id: "nursery", label: "Tree Nursery", icon: "♧",
        description: "Raises native seedlings for reforestation and for filling storm gaps.",
        effect: "Produces seedlings every year; required for afforestation.",
        costs: freeze([{ gold: 22, wood: 16 }, { gold: 40, wood: 26 }, { gold: 68, wood: 38 }]),
        capacity: freeze([12, 28, 48]),
    }),
    museum: freeze({
        id: "museum", label: "Forest Museum", icon: "⌂",
        description: "A natural-history collection of wood, seed, bone, rings and regional forest cultures.",
        effect: "Records specimens, expands the codex and turns observation into renown.",
        costs: freeze([{ gold: 28, wood: 14, stone: 8 }, { gold: 48, wood: 22, stone: 14 }, { gold: 80, wood: 34, stone: 22 }]),
        capacity: freeze([30, 70, 120]),
    }),
});

export const FOREST_LEGACY_INSTITUTION_IDS = freeze(Object.keys(FOREST_LEGACY_INSTITUTIONS));

export const FOREST_CONSERVATION_LAWS = freeze({
    none: freeze({
        id: "none", label: "Crown Discretion", short: "NONE",
        description: "Every wood is administered case by case. No standing protection budget.",
    }),
    protected: freeze({
        id: "protected", label: "Protected Woodland", short: "PROTECTED",
        description: "The crown funds wardens and reserves. Protected regions resist hazard and extinction, but salvage timber is forgone.",
        gold: 30, legitimacy: 3,
    }),
    community: freeze({
        id: "community", label: "Community Stewardship", short: "COMMUNITY",
        description: "Village commons hold the wood. Citizen observations and local seed work cost less; crown control is lighter.",
        gold: 12, legitimacy: 1,
    }),
});
export const FOREST_CONSERVATION_LAW_IDS = freeze(Object.keys(FOREST_CONSERVATION_LAWS));

export const FOREST_LEGACY_HAZARDS = freeze({
    fire: freeze({
        id: "fire", label: "Wildfire", icon: "🔥", kind: "regional catastrophe",
        description: "A crown fire crosses several stands, leaves char and opens a large regeneration gap.",
        salvage: "charred timber", climates: ["temperate", "mediterranean", "arid", "savanna", "coastal", "taiga"],
    }),
    drought: freeze({
        id: "drought", label: "Drought", icon: "☼", kind: "climate stress",
        description: "A multi-season drought thins the crown, writes a narrow ring and cuts the harvest.",
        salvage: null, climates: ["mediterranean", "arid", "savanna", "temperate", "coastal"],
    }),
    storm: freeze({
        id: "storm", label: "Great Storm", icon: "≋", kind: "windthrow",
        description: "Windthrow snaps trunks, tears root plates and leaves debris across roads and streams.",
        salvage: "windthrown logs", climates: ["coastal", "mountain", "taiga", "temperate", "tropical", "swamp"],
    }),
    insect: freeze({
        id: "insect", label: "Bark-beetle Calamity", icon: "⌁", kind: "insect outbreak",
        description: "A beetle wave finds pure conifer stands and kills them in patches.",
        salvage: "salvage logs", climates: ["taiga", "mountain", "temperate", "northern", "snow"],
    }),
    invasive: freeze({
        id: "invasive", label: "Invasive Species", icon: "◇", kind: "displacement",
        description: "An introduced plant or animal displaces native regeneration and simplifies the understorey.",
        salvage: null, climates: ["temperate", "coastal", "tropical", "swamp", "mediterranean"],
    }),
    fungus: freeze({
        id: "fungus", label: "Fungal Epidemic", icon: "✣", kind: "disease",
        description: "A root or needle fungus moves through a host species and leaves a regional gap.",
        salvage: null, climates: ["temperate", "taiga", "mountain", "tropical", "swamp", "coastal"],
    }),
});
export const FOREST_LEGACY_HAZARD_IDS = freeze(Object.keys(FOREST_LEGACY_HAZARDS));

export const FOREST_LEGACY_ACHIEVEMENTS = freeze([
    { id: "first-reserve", label: "First Reserve", detail: "Place one woodland under formal protection.", check: model => Object.values(model.regions).some(region => region.protection === "reserve") },
    { id: "seed-ark", label: "Seed Ark", detail: "Raise the seed bank to its highest level.", check: model => model.institutions["seed-bank"] >= FOREST_LEGACY_INSTITUTION_LIMIT },
    { id: "living-museum", label: "Living Museum", detail: "Raise the museum to its highest level and record twenty codex entries.", check: model => model.institutions.museum >= FOREST_LEGACY_INSTITUTION_LIMIT && Object.keys(model.codex).length >= 20 },
    { id: "climate-archive", label: "Climate Archive", detail: "Keep at least 25 annual rings in three regions.", check: model => Object.values(model.regions).filter(region => region.rings.length >= 25).length >= 3 },
    { id: "return-of-the-forest", label: "Return of the Forest", detail: "Reintroduce a locally extinct species.", check: model => model.stats.reintroduced > 0 },
    { id: "century-wood", label: "Century Wood", detail: "Guide one region into old-growth structure.", check: model => Object.values(model.regions).some(region => region.phase === "old-growth") },
    { id: "citizen-naturalist", label: "Citizen Naturalist", detail: "Build a citizen-science network of the highest level.", check: model => model.citizenScience >= FOREST_LEGACY_INSTITUTION_LIMIT },
    { id: "rare-refuge", label: "Rare Refuge", detail: "Protect a rare forest type.", check: model => Object.values(model.regions).some(region => region.rare && region.protection !== "none") },
]);
export const FOREST_LEGACY_ACHIEVEMENT_IDS = freeze(FOREST_LEGACY_ACHIEVEMENTS.map(entry => entry.id));

export const FOREST_LEGACY_CULTURES = freeze([
    { id: "woodlanders", label: "Woodlanders", detail: "Settled households who read the wood as a common larder, a boundary and a graveyard." },
    { id: "foresters", label: "Foresters & Wardens", detail: "Officers who mark trees, set coupes and answer for the regrowth of the next generation." },
    { id: "charcoal-burners", label: "Charcoal Burners", detail: "Kiln families whose slow smoke and wheel-ruts form a woodland season of their own." },
    { id: "herb-wives", label: "Herb-wives & Healers", detail: "Collectors of bark, flower and fungus who keep the wood's medicine in living memory." },
    { id: "hermits", label: "Hermits & Shrine Keepers", detail: "Solitary keepers of springs, stones and old trees at the edge of the cultivated land." },
    { id: "naturalists", label: "Naturalists & Surveyors", detail: "Clerks, hunters and schoolmasters who turn observation into a written record." },
]);
export const FOREST_LEGACY_CULTURE_IDS = freeze(FOREST_LEGACY_CULTURES.map(entry => entry.id));

export const FOREST_LEGACY_STAGES = freeze([
    { id: "pioneer", label: "Pioneer", minAge: 0, canopy: 0.38 },
    { id: "young", label: "Young Wood", minAge: 40, canopy: 0.56 },
    { id: "mature", label: "Mature Wood", minAge: 100, canopy: 0.76 },
    { id: "old-growth", label: "Old Growth", minAge: 220, canopy: 0.9 },
    { id: "retrogressive", label: "Retrogressive", minAge: 360, canopy: 0.68 },
]);

// Each reference seed names one deterministic world/province/forest pairing.
// The visual and ecological references use the same seed so a screenshot and a
// long-run assertion describe the same wood.
export const FOREST_LEGACY_REFERENCE_CASES = freeze(FOREST_LEGACY_REGIONS.map(region => freeze({
    regionId: region.id,
    seed: region.referenceSeed,
    climate: region.climate,
    label: region.name + " reference wood",
})));

// The catalog is intentionally the only place where the 30 ids are declared.
// Every runtime field below names the point it serves in `consumer`.
export const FOREST_LEGACY_REQUIREMENTS = freeze([
    { id: "1.2.23.1.271", title: "Century-scale forest succession", point: "Waldsukzession über mehrere Jahrhunderte", consumer: "forestLegacyCentury + annual phase", detail: "The region ledger advances age, canopy, gap and dominant cohort every year and projects a 100/200/300-year succession path from the live stand, not a separate timeline." },
    { id: "1.2.23.1.272", title: "Slow climate-driven forest-type shift", point: "Klimawandel mit langsamer Verschiebung von Waldtypen", consumer: "getClimateDrift + region.climateShift", detail: "The shared climate drift and a small annual warming signal raise the region's climate pressure; a cold forest gradually loses its analogue and records the type it is becoming." },
    { id: "1.2.23.1.273", title: "Species migration into cooler elevations", point: "Artenwanderung in kühlere Höhenlagen", consumer: "advanceSpeciesMigration", detail: "Every tree and animal cohort has an elevation band. Warming moves the band upward where the site has room; a species with no room accumulates climate stress instead." },
    { id: "1.2.23.1.274", title: "Local extinction of trees and animals", point: "Lokales Aussterben von Baum- und Tierarten", consumer: "advanceExtinctionRisk", detail: "Climate stress, hazard damage, low genetic breadth and absent seed or gene backup can extinguish a regional cohort. The loss is a saved, named event." },
    { id: "1.2.23.1.275", title: "Reintroduction of vanished species", point: "Wiederansiedlung verschwundener Arten", consumer: "reintroduceForestSpecies", detail: "A seed or gene bank can return a locally extinct species. The action spends gold and stored material and records a living population again." },
    { id: "1.2.23.1.276", title: "Conservation as a political decision", point: "Naturschutz als politische Entscheidung", consumer: "setForestConservationLaw", detail: "Crown discretion, protected woodland and community stewardship are once-a-year laws with real costs, legitimacy and different protection rules." },
    { id: "1.2.23.1.277", title: "Protected areas with their own rules", point: "Schutzgebiete mit eigenen Regeln", consumer: "protectForestRegion + forestLegacyRegionRules", detail: "A reserve forbids salvage logging, resists fire and disease, and receives priority in seed and gene programmes; its rules are shown beside every action." },
    { id: "1.2.23.1.278", title: "Afforestation and reforestation", point: "Aufforstung und Wiederbewaldung", consumer: "afforestForestRegion", detail: "The nursery raises native seedlings. A planting spends seedlings, wood and gold, raises canopy and linked biome vegetation, and lowers erosion and flood pressure." },
    { id: "1.2.23.1.279", title: "Wildfire as a regional emergency", point: "Waldbrand als regionales Großereignis", consumer: "applyForestHazard(fire) + advanceHazards", detail: "A wildfire burns a named region, kills cohorts, changes the linked biome's vegetation and leaves salvage timber only outside reserves." },
    { id: "1.2.23.1.280", title: "Drought with tree death and crop failure", point: "Dürre mit Baumsterben und Ernteausfällen", consumer: "applyForestHazard(drought) + advanceHazards", detail: "Drought narrows rings, raises tree stress, removes food from the royal stores and can kill a dry-site cohort." },
    { id: "1.2.23.1.281", title: "Storms with windthrow and debris", point: "Stürme mit Windwurf und Trümmern", consumer: "applyForestHazard(storm) + advanceHazards", detail: "A great storm moves through a region, lowers canopy, adds windthrown logs and leaves a debris/scar record on the same linked biome." },
    { id: "1.2.23.1.282", title: "Insect calamities in conifer woods", point: "Insektenkalamitäten in Nadelwäldern", consumer: "applyForestHazard(insect) + advanceHazards", detail: "Bark-beetle pressure finds pure conifer cohorts, kills trees, produces salvage and raises the region's outbreak memory." },
    { id: "1.2.23.1.283", title: "Invasive species with displacement", point: "Invasive Arten mit Verdrängungseffekten", consumer: "applyForestHazard(invasive) + advanceHazards", detail: "An invasive understorey or animal takes share from a native cohort, lowers regeneration and is visible in the codex as a named arrival." },
    { id: "1.2.23.1.284", title: "Fungal epidemics in regional hosts", point: "Pilzepidemien mit regionalen Baumarten", consumer: "applyForestHazard(fungus) + advanceHazards", detail: "A fungus selects a host species, damages its cohort and raises the linked biome's disease pressure; the museum records the outbreak." },
    { id: "1.2.23.1.285", title: "Seed banks for threatened forests", point: "Samenbanken für bedrohte Waldtypen", consumer: "buildForestInstitution(seed-bank)", detail: "The seed bank stores viable seed every year, backs up chosen species and supplies reintroduction." },
    { id: "1.2.23.1.286", title: "Gene banks and conservation breeding", point: "Genbanken und Erhaltungszucht", consumer: "buildForestInstitution(gene-bank)", detail: "The gene bank stores breeding lines, raises genetic breadth and is the second requirement for bringing a lost animal or tree back." },
    { id: "1.2.23.1.287", title: "Tree nurseries for reforestation", point: "Baumschulen für Wiederaufforstung", consumer: "buildForestInstitution(nursery)", detail: "The nursery produces a bounded seedling stock every year and gates every afforestation action." },
    { id: "1.2.23.1.288", title: "Forest museum and natural-history collection", point: "Waldmuseum und Naturkundesammlung", consumer: "buildForestInstitution(museum) + codex", detail: "The museum stores specimens, raises codex discovery and turns a completed collection into renown and an achievement." },
    { id: "1.2.23.1.289", title: "Natural monuments and protected old trees", point: "Naturdenkmäler und geschützte alte Bäume", consumer: "designateForestMonument", detail: "A living old tree can be designated as a monument with a name, age and story. It is permanent, protected and recorded in the codex." },
    { id: "1.2.23.1.290", title: "Tree rings as a climate archive", point: "Jahresringe als Klimaarchiv", consumer: "forestLegacyRingArchive", detail: "Every annual pass writes a ring with growth and stress from the same climate and hazard record the simulation used." },
    { id: "1.2.23.1.291", title: "Old trees with story and memory", point: "Alte Bäume mit eigener Geschichte und Erinnerung", consumer: "designateForestMonument + monument.story", detail: "Monuments carry a deterministic story and return as named anniversary entries in the region chronicle, not as a decorative label." },
    { id: "1.2.23.1.292", title: "Citizen science for species observation", point: "Bürgerwissenschaft für Artenbeobachtung", consumer: "fundCitizenScience + annual observations", detail: "A funded network records new species, adds codex entries and lowers the chance that a decline is discovered too late." },
    { id: "1.2.23.1.293", title: "Modding custom forest types and species", point: "Modding eigener Waldtypen und Arten", consumer: "data-packs forests + forestLegacyModdedTypes", detail: "A validated data pack can add a named forest formation and its tree/animal species; the legacy ledger and codex consume them without executable code." },
    { id: "1.2.23.1.294", title: "Community scenarios with regional forests", point: "Community-Szenarien mit regionalen Wäldern", consumer: "scenario.forestType + applyScenarioStart", detail: "A data-pack scenario can name one of its forest types as its opening wood. The chosen type, species and climate are carried into the legacy ledger." },
    { id: "1.2.23.1.295", title: "Achievements for discovery and protection", point: "Erfolge für Entdeckung und Schutz seltener Waldtypen", consumer: "evaluateAchievements", detail: "Eight saved achievements reward reserves, seed and gene work, museum collections, long ring archives, reintroduction and rare-type protection." },
    { id: "1.2.23.1.296", title: "Codex entries for trees, animals and cultures", point: "Codex-Einträge für Bäume, Tiere und Waldkulturen", consumer: "forestLegacyCodex", detail: "The codex is generated from the live region cohorts and six woodland cultures; museum and citizen science reveal more of it." },
    { id: "1.2.23.1.297", title: "Reference seeds for visual and ecological tests", point: "Referenz-Seeds für visuelle und ökologische Tests", consumer: "FOREST_LEGACY_REFERENCE_CASES", detail: "Ten fixed province seeds pair one forest region, climate and expected ecological reading for repeatable tests." },
    { id: "1.2.23.1.298", title: "Browser tests for every forest region", point: "Browser-Tests für jede Waldregion", consumer: "tests/browser/forest-legacy-mobile.mjs", detail: "The browser reference walks every legacy region, opens its card and verifies live DOM data, actions and 390×844 layout without console errors." },
    { id: "1.2.23.1.299", title: "Long-term soaks for growth and species shift", point: "Langzeit-Soaks für Waldwachstum und Artenverschiebung", consumer: "scripts/forest-legacy-soak.mjs", detail: "A 300-year deterministic soak checks canopy bounds, age progression, extinction/reintroduction, ring caps and save normalization." },
    { id: "1.2.23.1.300", title: "Roadmap guardrails for new forest types", point: "Roadmap-Leitplanken, damit neue Waldtypen Save-Kompatibilität, Determinismus und Performance nicht brechen", consumer: "forestLegacyGuardrails + tests", detail: "Guardrails and tests require a save-neutral additive ledger, a bounded yearly pass, a versioned data contract and no per-frame or per-tile work." },
]);

export const FOREST_LEGACY_REQUIREMENT_BY_ID = freeze(Object.fromEntries(
    FOREST_LEGACY_REQUIREMENTS.map(entry => [entry.id, entry])
));

export const FOREST_LEGACY_GROUPS = freeze([
    { id: "succession", label: "Long succession and climate", ids: ["1.2.23.1.271", "1.2.23.1.272", "1.2.23.1.273", "1.2.23.1.274", "1.2.23.1.275"] },
    { id: "conservation", label: "Conservation and restoration", ids: ["1.2.23.1.276", "1.2.23.1.277", "1.2.23.1.278"] },
    { id: "events", label: "Regional disturbances", ids: ["1.2.23.1.279", "1.2.23.1.280", "1.2.23.1.281", "1.2.23.1.282", "1.2.23.1.283", "1.2.23.1.284"] },
    { id: "memory", label: "Seed, gene, museum and memory", ids: ["1.2.23.1.285", "1.2.23.1.286", "1.2.23.1.287", "1.2.23.1.288", "1.2.23.1.289", "1.2.23.1.290", "1.2.23.1.291", "1.2.23.1.292"] },
    { id: "modding", label: "Modding, codex and QA", ids: ["1.2.23.1.293", "1.2.23.1.294", "1.2.23.1.295", "1.2.23.1.296", "1.2.23.1.297", "1.2.23.1.298", "1.2.23.1.299", "1.2.23.1.300"] },
]);

export const FOREST_LEGACY_GUARDRAILS = freeze([
    "The ledger is additive under state.forestLegacy; an absent or old field normalizes to a deterministic fresh ledger, so save schema 15 stays valid.",
    "The simulation advances once per year in the existing annual maintenance chain. No per-frame, per-tick or per-tile work is added.",
    "All random-looking choices use a stable hash of world seed, region, year and event kind; they never consume the shared RNG stream.",
    "Every array and count is bounded: ten regions, eight cohorts per region, sixty rings, forty history rows and eighty action records.",
    "A data pack is data only. It cannot add code, URLs, DOM or save mutations; custom types are namespaced and validated before use.",
    "A new forest type must declare a climate, a palette, at least two species and a reference seed, and must pass the 300-year soak and save round-trip.",
]);
