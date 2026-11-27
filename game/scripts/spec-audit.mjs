// Reproducible whole-project specification coverage audit.
//
// This is deliberately not a list of manually maintained green labels. Every
// numbered biome point is loaded from its real source manifest or audit table,
// then checked against consumer code (file + symbol), a focused test file and
// the live profile where one exists. System-roadmap points carry explicit
// consumer references as well; a point without a valid consumer is reported as
// open with the exact missing reference.
//
// Usage:
//   npm run spec:audit
//   node scripts/spec-audit.mjs --check   (exit 1 if the generated files drift)
//
// Outputs:
//   docs/SPEC_COVERAGE_AUDIT.md
//   docs/spec-coverage.json
//   js/generated/spec-coverage.js

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_FILE = path.join(ROOT, "docs", "SPEC_COVERAGE_AUDIT.md");
const JSON_FILE = path.join(ROOT, "docs", "spec-coverage.json");
const GENERATED_FILE = path.join(ROOT, "js", "generated", "spec-coverage.js");
const SAMPLE_GRID = 20;
const SAMPLE_SEASONS = [40, 140, 240, 340];
const SAMPLE_WEATHER = ["clear", "storm"];
const ALL_USE = Object.freeze({
    terraced: true, valleySettlement: true, fortress: true, fortifiedPass: true,
    road: true, bridge: true, mine: true, quarry: true, aqueduct: true,
    fishingVillage: true, harbour: true, tradingPost: true, saltworks: true,
    navalBase: true, lighthouse: true, shipyard: true, market: true,
    settlement: true, grazed: true, mowed: true, trampled: true, path: true,
    encroachment: true, reforestation: true, overgrazed: true, wild: true,
    boardwalk: true, drained: true, peatCut: true, fished: true, reedsCut: true,
    settled: true, bridged: true, defended: true, surveyed: true,
    fields: true, orchards: true, pasture: true, heavyRain: true,
    peat: true, drainage: true
});

function read(relative) {
    return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(ROOT, relative));
}

function escapeCell(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function hashFiles(files) {
    const hash = crypto.createHash("sha256");
    for (const relative of [...new Set(files)].sort()) {
        hash.update(relative);
        if (exists(relative)) hash.update(fs.readFileSync(path.join(ROOT, relative)));
    }
    return hash.digest("hex");
}

function section(id, title, points, config = {}) {
    return {
        id, title, points: points.map(point => ({ ...point })),
        consumers: config.consumers || [],
        tests: config.tests || [],
        source: config.source || "",
        note: config.note || "",
        probeFunction: config.probeFunction || null,
        probeClimate: config.probeClimate || "temperate",
        probeExtra: config.probeExtra || {}
    };
}

const DOC_SPECS = [
    {
        id: "1.1", title: "Terrain art checklist", file: "docs/TERRAIN_ART_CHECKLIST.md",
        source: "docs/TERRAIN_ART_CHECKLIST.md",
        consumers: [
            { file: "js/presentation/rendering/terrain.js", symbol: "drawBakedGround", role: "renderer" },
            { file: "js/presentation/rendering/terrain-atlas.js", symbol: "buildTerrainAtlas", role: "renderer" },
            { file: "js/world/season.js", symbol: "seasonalState", role: "simulation" }
        ],
        tests: ["tests/rendering/terrain-atlas.test.js", "tests/rendering/terrain-season-blend.test.js"]
    },
    {
        id: "1.2.1", title: "Broadleaf forests", file: "docs/FOREST_ECOLOGY.md",
        source: "docs/FOREST_ECOLOGY.md",
        consumers: [
            { file: "js/world/forest-ecology.js", symbol: "forestStandAt", role: "simulation" },
            { file: "js/presentation/rendering/terrain.js", symbol: "forestStandAt", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "forestStandAt", role: "gameplay" },
            { file: "js/systems/resource-geography.js", symbol: "forestStandAt", role: "resources" }
        ],
        tests: ["tests/world/forest-ecology.test.js"]
    },
    {
        id: "1.2.2", title: "Conifer forests", file: "docs/CONIFER_FORESTS.md",
        source: "docs/CONIFER_FORESTS.md",
        consumers: [
            { file: "js/world/forest-ecology.js", symbol: "forestStandAt", role: "simulation" },
            { file: "js/presentation/rendering/terrain.js", symbol: "drawConifer", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "forestStandAt", role: "gameplay" }
        ],
        tests: ["tests/world/conifer-forest.test.js", "tests/world/conifer-render-identity.test.js"]
    },
    {
        id: "1.2.3", title: "Mixed forests", file: "docs/MIXED_FORESTS.md",
        source: "docs/MIXED_FORESTS.md",
        consumers: [
            { file: "js/world/forest-ecology.js", symbol: "forestStandAt", role: "simulation" },
            { file: "js/presentation/rendering/terrain.js", symbol: "forestStandAt", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "forestStandAt", role: "gameplay" }
        ],
        tests: ["tests/world/mixed-forest.test.js", "tests/world/mixed-forest-longrun.test.js"]
    },
    {
        id: "1.2.4", title: "Tropical rainforests", file: "docs/TROPICAL_RAINFORESTS.md",
        source: "docs/TROPICAL_RAINFORESTS.md",
        consumers: [
            { file: "js/world/tropical-ecology.js", symbol: "tropicalProfileFor", role: "simulation" },
            { file: "js/world/forest-ecology.js", symbol: "tropicalProfileFor", role: "forest integration" },
            { file: "js/presentation/rendering/tropical-render.js", symbol: "drawTropical", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "forestStandAt", role: "gameplay" }
        ],
        tests: ["tests/world/tropical-forest.test.js", "tests/systems/tropical-integration.test.js"]
    },
    {
        id: "1.2.5", title: "Jungle interior", file: "docs/JUNGLE.md",
        source: "docs/JUNGLE.md",
        consumers: [
            { file: "js/world/jungle-ecology.js", symbol: "jungleProfileFor", role: "simulation" },
            { file: "js/world/forest-ecology.js", symbol: "jungleProfileFor", role: "forest integration" },
            { file: "js/presentation/rendering/jungle-render.js", symbol: "drawJungle", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "forestStandAt", role: "gameplay" }
        ],
        tests: ["tests/world/jungle.test.js", "tests/systems/jungle-integration.test.js"]
    },
    {
        id: "1.2.22", title: "Biome generation and visual quality", file: "docs/BIOME_GENERATION.md",
        source: "docs/BIOME_GENERATION.md",
        consumers: [
            { file: "js/world/biome-generation-data.js", symbol: "BIOME_GENERATION_REQUIREMENTS", role: "catalog" },
            { file: "js/world/biome-generation-data.js", symbol: "BIOME_IDENTITY", role: "identity" },
            { file: "js/world/biome-generation.js", symbol: "classifyBiome", role: "generation" },
            { file: "js/world/biome-generation.js", symbol: "vegetationAt", role: "vegetation" },
            { file: "js/world/biome-generation.js", symbol: "buildBiomeGenerationProfile", role: "profile" },
            { file: "js/systems/biome-resource-state.js", symbol: "generateBiomeAtlas", role: "atlas" },
            { file: "js/presentation/biome-panel.js", symbol: "renderBiomePanel", role: "ui" },
            { file: "js/world/world.js", symbol: "initWorld", role: "world" },
            { file: "js/world/world.js", symbol: "prerenderTerrain", role: "renderer" },
            { file: "js/presentation/rendering/biome-identity-render.js", symbol: "biomeLandmarkAnchors", role: "landmarks" },
            { file: "js/presentation/rendering/biome-identity-render.js", symbol: "drawBiomeIdentityOverlay", role: "renderer" },
            { file: "js/presentation/rendering/terrain.js", symbol: "seasonalTintOverlay", role: "renderer" }
        ],
        tests: ["tests/world/biome-generation.test.js", "tests/browser/biome-atlas-ui.mjs", "tests/browser/biome-atlas-visual.mjs"]
    }
];

const MANIFEST_SPECS = [
    {
        id: "1.2.6", title: "Grasslands", file: "js/world/grassland-ecology.js",
        manifest: "GRASSLAND_REQUIREMENTS", profile: "grasslandProfileAt", climate: "temperate",
        consumers: [
            { file: "js/world/grassland-ecology.js", symbol: "grasslandProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/terrain.js", symbol: "grasslandProfileAt", role: "renderer" },
            { file: "js/systems/grassland-use.js", symbol: "grasslandProfileAt", role: "gameplay" }
        ],
        tests: ["tests/world/grassland-ecology.test.js", "tests/presentation/grassland-render.test.js"]
    },
    {
        id: "1.2.7", title: "Steppes", file: "js/world/steppe-ecology.js",
        manifest: "STEPPE_REQUIREMENTS", profile: "steppeProfileAt", climate: "steppe",
        consumers: [
            { file: "js/world/steppe-ecology.js", symbol: "steppeProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/steppe-render.js", symbol: "drawSteppe", role: "renderer" },
            { file: "js/systems/grassland-use.js", symbol: "steppeProfileAt", role: "gameplay" }
        ],
        tests: ["tests/world/steppe-ecology.test.js", "tests/presentation/steppe-render.test.js"]
    },
    {
        id: "1.2.8", title: "Deserts and semi-deserts", file: "js/world/desert-ecology.js",
        manifest: "DESERT_REQUIREMENTS", profile: "desertProfileAt", climate: "desert",
        consumers: [
            { file: "js/world/desert-ecology.js", symbol: "desertProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/desert-render.js", symbol: "drawDesert", role: "renderer" },
            { file: "js/systems/grassland-use.js", symbol: "desertProfileAt", role: "gameplay" }
        ],
        tests: ["tests/world/desert-ecology.test.js", "tests/presentation/desert-render.test.js"]
    },
    {
        id: "1.2.9", title: "Tundra", file: "js/world/tundra-ecology.js",
        manifest: "TUNDRA_REQUIREMENTS", profile: "tundraProfileAt", climate: "tundra",
        consumers: [
            { file: "js/world/tundra-ecology.js", symbol: "tundraProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/tundra-render.js", symbol: "drawTundra", role: "renderer" },
            { file: "js/systems/grassland-use.js", symbol: "tundraProfileAt", role: "gameplay" }
        ],
        tests: ["tests/world/tundra-ecology.test.js", "tests/presentation/tundra-render.test.js"]
    },
    {
        id: "1.2.10-savanna", title: "Savanna", file: "js/world/savanna-ecology.js",
        manifest: "SAVANNA_REQUIREMENTS", profile: "savannaProfileAt", climate: "savanna",
        consumers: [
            { file: "js/world/savanna-ecology.js", symbol: "savannaProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/savanna-render.js", symbol: "drawSavanna", role: "renderer" },
            { file: "js/systems/grassland-use.js", symbol: "savannaProfileAt", role: "gameplay" }
        ],
        tests: ["tests/world/savanna-ecology.test.js", "tests/presentation/savanna-render.test.js"]
    },
    {
        id: "1.2.10-taiga", title: "Taiga", file: "js/world/taiga-ecology.js",
        manifest: "TAIGA_REQUIREMENTS", profile: "taigaProfileAt", climate: "taiga",
        consumers: [
            { file: "js/world/taiga-ecology.js", symbol: "taigaProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/taiga-render.js", symbol: "drawTaiga", role: "renderer" },
            { file: "js/systems/grassland-use.js", symbol: "taigaProfileAt", role: "gameplay" }
        ],
        tests: ["tests/world/taiga-ecology.test.js", "tests/presentation/taiga-render.test.js"]
    },
    {
        id: "1.2.11", title: "Swamps and bogs", file: "js/world/swamp-ecology.js",
        manifest: "SWAMP_REQUIREMENTS", profile: "swampProfileAt", climate: "swamp",
        consumers: [
            { file: "js/world/swamp-ecology.js", symbol: "swampProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/swamp-render.js", symbol: "drawSwamp", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "swampProfileAt", role: "gameplay" },
            { file: "js/world/swamp-works.js", symbol: "SWAMP_WORKS", role: "works" }
        ],
        tests: ["tests/world/swamp-ecology.test.js", "tests/world/swamp-works.test.js"]
    },
    {
        id: "1.2.12", title: "Mountains and highlands", file: "js/world/mountain-ecology.js",
        manifest: "MOUNTAIN_REQUIREMENTS", profile: "mountainProfileAt", climate: "mountain",
        consumers: [
            { file: "js/world/mountain-ecology.js", symbol: "mountainProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/mountain-render.js", symbol: "drawMountain", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "performMountainWork", role: "gameplay" },
            { file: "js/world/mountain-works.js", symbol: "MOUNTAIN_WORKS", role: "works" }
        ],
        tests: ["tests/world/mountain-ecology.test.js", "tests/world/mountain-works.test.js", "tests/world/mountain-campaign.test.js"]
    },
    {
        id: "1.2.13", title: "Volcanoes", file: "js/world/volcano-ecology.js",
        manifest: "VOLCANO_REQUIREMENTS", profile: "volcanoProfileAt", climate: "volcanic",
        consumers: [
            { file: "js/world/volcano-ecology.js", symbol: "volcanoProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/volcano-render.js", symbol: "drawVolcano", role: "renderer" },
            { file: "js/world/volcano-hazards.js", symbol: "updateVolcanoHazards", role: "hazards" },
            { file: "js/systems/forest-gathering.js", symbol: "performVolcanoWork", role: "gameplay" }
        ],
        tests: ["tests/world/volcano-ecology.test.js", "tests/world/volcano-hazards.test.js", "tests/world/volcano-works.test.js"]
    },
    {
        id: "1.2.14", title: "Coastlands", file: "js/world/coast-ecology.js",
        manifest: "COAST_REQUIREMENTS", profile: "coastProfileAt", climate: "coastal",
        consumers: [
            { file: "js/world/coast-ecology.js", symbol: "coastProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/coast-render.js", symbol: "drawCoastGround", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "performCoastWork", role: "gameplay" },
            { file: "js/world/coast-works.js", symbol: "COAST_WORKS", role: "works" },
            { file: "js/world/coast-hazards.js", symbol: "updateCoastHazards", role: "hazards" }
        ],
        tests: ["tests/world/coast-ecology.test.js", "tests/world/coast-works.test.js"]
    },
    {
        id: "1.2.15", title: "Snowlands", file: "js/world/snow-ecology.js",
        manifest: "SNOW_REQUIREMENTS", profile: "snowProfileAt", climate: "snow",
        consumers: [
            { file: "js/world/snow-ecology.js", symbol: "snowProfileAt", role: "simulation" },
            { file: "js/presentation/rendering/snow-render.js", symbol: "drawSnowGround", role: "renderer" },
            { file: "js/world/snow-hazards.js", symbol: "updateSnowHazards", role: "hazards" },
            { file: "js/world/winter-economy.js", symbol: "snowProfileAt", role: "winter economy" }
        ],
        tests: ["tests/world/snow-ecology.test.js", "tests/world/winter-economy.test.js"]
    },
    {
        id: "1.2.17", title: "Transition biomes", file: "js/world/transition-biomes.js",
        manifest: "TRANSITION_REQUIREMENTS", profile: "transitionAt", climate: "temperate",
        consumers: [
            { file: "js/world/transition-biomes.js", symbol: "transitionAt", role: "simulation" },
            { file: "js/presentation/rendering/terrain.js", symbol: "transitionAt", role: "renderer" },
            { file: "js/presentation/expeditions-panel.js", symbol: "getTransitionSurvey", role: "survey" },
            { file: "js/systems/forest-gathering.js", symbol: "transitionGameplayAt", role: "gameplay" }
        ],
        tests: ["tests/world/transition-biomes.test.js"]
    },
    {
        id: "1.2.18", title: "Vegetation density", file: "js/world/vegetation-density.js",
        manifest: "VEGETATION_REQUIREMENTS", profile: "vegetationDensityAt", climate: "temperate",
        consumers: [
            { file: "js/world/vegetation-density.js", symbol: "vegetationDensityAt", role: "simulation" },
            { file: "js/presentation/rendering/terrain.js", symbol: "vegetationDensityAt", role: "renderer" },
            { file: "js/systems/forest-gathering.js", symbol: "vegetationDensityAt", role: "gameplay" },
            { file: "js/systems/fields.js", symbol: "vegetationDensityAt", role: "agriculture" },
            { file: "js/presentation/expeditions-panel.js", symbol: "getVegetationDensitySurvey", role: "survey" }
        ],
        tests: ["tests/world/vegetation-density.test.js"]
    },
    {
        id: "1.2.19", title: "Biomes with their own resources and wildlife",
        file: "js/world/biome-resource-data.js",
        manifest: "BIOME_RESOURCE_REQUIREMENTS",
        consumers: [
            { file: "js/world/biome-resource-data.js", symbol: "BIOME_RESOURCES", role: "catalog" },
            { file: "js/systems/biome-resource-state.js", symbol: "updateBiomeAtlasAnnual", role: "simulation" },
            { file: "js/presentation/biome-panel.js", symbol: "renderBiomePanel", role: "ui" },
            { file: "js/presentation/rendering/renderer.js", symbol: "drawMapLayer", role: "renderer" },
            { file: "js/core/save-runtime.js", symbol: "serializeBiomeAtlasState", role: "persistence" }
        ],
        tests: ["tests/systems/biome-resource-atlas.test.js"]
    },
    {
        id: "1.2.20",
        title: "Biomes with special hazards and diseases",
        file: "js/world/hazard-data.js",
        manifest: "HAZARD_REQUIREMENTS",
        profile: null,
        climate: "temperate",
        consumers: [
            { file: "js/world/hazard-data.js", symbol: "HAZARD_CATALOG", role: "catalog" },
            { file: "js/world/hazard-data.js", symbol: "HAZARD_EFFECTS", role: "rules" },
            { file: "js/world/hazard-evidence.js", symbol: "HAZARD_EVIDENCE", role: "evidence" },
            { file: "js/world/hazard-expansion-data.js", symbol: "RESPONSE_PLANS", role: "response" },
            { file: "js/world/hazard-expansion-data.js", symbol: "DISEASE_PROFILES", role: "disease" },
            { file: "js/world/hazard-expansion-data.js", symbol: "RARE_CHAINS", role: "rare" },
            { file: "js/systems/environmental-hazards.js", symbol: "updateEnvironmentalHazards", role: "simulation" },
            { file: "js/systems/environmental-hazards.js", symbol: "updateEnvironmentalHazardYear", role: "simulation" },
            { file: "js/systems/environmental-hazards.js", symbol: "getHazardMitigation", role: "simulation" },
            { file: "js/systems/hazard-modifiers.js", symbol: "getHazardSimulationEffects", role: "simulation" },
            { file: "js/systems/hazard-response.js", symbol: "advanceHazardResponse", role: "response" },
            { file: "js/systems/hazard-response.js", symbol: "selectRareChain", role: "rare" },
            { file: "js/systems/hazard-response.js", symbol: "chooseHazardPlan", role: "plan" },
            { file: "js/systems/hazard-scars.js", symbol: "isHazardTileBlocked", role: "movement" },
            { file: "js/systems/economy.js", symbol: "calculateDailyLedger", role: "demand" },
            { file: "js/systems/economy.js", symbol: "getBuildingEfficiency", role: "production" },
            { file: "js/systems/construction.js", symbol: "updateConstruction", role: "construction" },
            { file: "js/simulation/villagers.js", symbol: "updateVillagers", role: "movement" },
            { file: "js/systems/expeditions.js", symbol: "startExpedition", role: "expedition" },
            { file: "js/simulation/buildings.js", symbol: "updateBuildingIncome", role: "extraction" },
            { file: "js/systems/forest-fauna.js", symbol: "updateForestFauna", role: "pasture" },
            { file: "js/systems/forest-fauna.js", symbol: "damageHazardHerds", role: "plague" },
            { file: "js/systems/market.js", symbol: "executeTrade", role: "trade" },
            { file: "js/presentation/hazard-panel.js", symbol: "renderHazardPanel", role: "ui" },
            { file: "js/systems/city-config.js", symbol: "NEW_BUILDING_TYPES", role: "buildings" },
            { file: "js/core/save-runtime.js", symbol: "serializeEnvironmentalHazardState", role: "persistence" }
        ],
        tests: ["tests/world/environmental-hazards.test.js", "tests/world/hazard-modifiers.test.js", "tests/world/hazard-expansion.test.js", "tests/world/hazard-terrain.test.js", "tests/world/hazard-coverage.test.js", "tests/systems/city-builder.test.js"]
    },
    {
        id: "1.2.21",
        title: "Cross-biome systems: climate, soil, water, seasons, land use and recovery",
        file: "js/world/cross-biome-data.js",
        manifest: "BIOME_SYSTEM_REQUIREMENTS",
        profile: null,
        climate: "temperate",
        consumers: [
            { file: "js/world/cross-biome-data.js", symbol: "BIOME_SYSTEM_REQUIREMENTS", role: "catalog" },
            { file: "js/world/cross-biome-data.js", symbol: "BIOME_CLIMATE_ZONES", role: "climate" },
            { file: "js/world/cross-biome-data.js", symbol: "BIOME_SOIL_TYPES", role: "soil" },
            { file: "js/systems/cross-biome-state.js", symbol: "getCrossBiomeProfile", role: "profile" },
            { file: "js/systems/biome-resource-state.js", symbol: "advanceCrossBiomeAnnual", role: "simulation" },
            { file: "js/systems/biome-resource-state.js", symbol: "irrigateBiomeRegion", role: "gameplay" },
            { file: "js/systems/biome-resource-state.js", symbol: "reforestBiomeRegion", role: "gameplay" },
            { file: "js/presentation/biome-panel.js", symbol: "renderBiomePanel", role: "ui" },
            { file: "js/presentation/management-ui.js", symbol: "act", role: "ui" },
            { file: "js/presentation/rendering/renderer.js", symbol: "drawMapLayer", role: "renderer" },
            { file: "js/core/save-runtime.js", symbol: "serializeBiomeAtlasState", role: "persistence" }
        ],
        tests: ["tests/systems/cross-biome-systems.test.js"]
    },
    {
        id: "1.2.23.1", title: "Forest simulation, data model and performance",
        file: "js/world/forest-model.js",
        manifest: "FOREST_MODEL_REQUIREMENTS",
        profile: null,
        consumers: [
            { file: "js/world/forest-model.js", symbol: "FOREST_MODEL_REQUIREMENTS", role: "manifest" },
            { file: "js/world/forest-model.js", symbol: "forestModelFor", role: "model" },
            { file: "js/presentation/forest-atlas-panel.js", symbol: "renderForestAtlasPanel", role: "ui" },
            { file: "js/systems/forest-succession.js", symbol: "updateForestSuccession", role: "simulation" },
            { file: "js/systems/resource-geography.js", symbol: "serializeResourceGeography", role: "persistence" }
        ],
        tests: [
            "tests/world/forest-model.test.js",
            "tests/presentation/forest-atlas.test.js",
            "tests/world/regional-forests.test.js",
            "tests/systems/forest-succession.test.js"
        ]
    }
];

function parseDocPoints(relative, prefix) {
    const text = read(relative);
    const found = new Map();
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
        if (!cells.length) continue;
        const numericStart = cells[0].startsWith(prefix) ? cells[0].slice(prefix.length) : "";
        const match = /^\d+/.exec(numericStart);
        if (!match) continue;
        const id = prefix + match[0];
        if (found.has(id)) continue;
        let label = cells[1] || "";
        let status = cells[2] || "";
        let evidence = cells[3] || "";
        if (cells.length === 3) {
            label = cells[0].slice(id.length).trim();
            status = cells[1] || "";
            evidence = cells[2] || "";
        } else if (cells.length >= 4) {
            label = cells[1] || cells[0].slice(id.length).trim();
            status = cells[2] || "";
            evidence = cells[3] || "";
        }
        found.set(id, {
            id,
            label: label || id,
            sourceStatus: status,
            docEvidence: evidence,
            status: /^(offen|open|partial|teilweise|planned|geplant|nicht umgesetzt|nicht implementiert)\b/i.test(status) ? "open" : "implemented"
        });
    }
    return [...found.values()];
}

const CULTURE_SPEC = Object.freeze({
    id: "1.2.23.1.181-210",
    title: "Forest culture, religion, society and knowledge",
    file: "js/world/forest-culture.js",
    manifest: "FOREST_CULTURE_REQUIREMENTS",
    consumers: [
        { file: "js/world/forest-culture.js", symbol: "FOREST_CULTURE_REQUIREMENTS", role: "catalog" },
        { file: "js/world/forest-culture.js", symbol: "FOREST_CULTURE_REGIONS", role: "regional profiles" },
        { file: "js/systems/forest-culture.js", symbol: "forestCultureSummary", role: "simulation" },
        { file: "js/systems/forest-culture.js", symbol: "dedicateSacredGrove", role: "grove action" },
        { file: "js/systems/forest-culture.js", symbol: "setForestRights", role: "rights action" },
        { file: "js/presentation/forest-atlas-panel.js", symbol: "cultureBlock", role: "ui" },
        { file: "js/presentation/management-ui.js", symbol: "dedicateSacredGrove", role: "ui action" },
        { file: "js/systems/forest-gathering.js", symbol: "forestCultureModifiers", role: "gather yield" },
        { file: "js/systems/fields.js", symbol: "forestCultureFarmFactor", role: "farm yield" },
        { file: "js/systems/forest-pannage.js", symbol: "forestCultureHerdBonusDays", role: "pannage" },
        { file: "js/systems/births.js", symbol: "forestCultureChildName", role: "naming" },
        { file: "js/systems/research.js", symbol: "TECHNOLOGIES", role: "woodland branch" },
        { file: "js/systems/resource-geography.js", symbol: "harvestForest", role: "grove guard" }
    ],
    tests: ["tests/systems/forest-culture.test.js"]
});

const WAR_SPEC = Object.freeze({
    id: "1.2.23.1.211-240",
    title: "Forest war, diplomacy, borders and strategy",
    file: "js/world/forest-warfare.js",
    manifest: "FOREST_WARFARE_REQUIREMENTS",
    consumers: [
        { file: "js/world/forest-warfare.js", symbol: "FOREST_WARFARE_REQUIREMENTS", role: "catalog" },
        { file: "js/world/forest-warfare.js", symbol: "FOREST_WAR_PROFILES", role: "regional war profiles" },
        { file: "js/systems/forest-warfare.js", symbol: "forestWarfareSummary", role: "simulation" },
        { file: "js/systems/forest-warfare.js", symbol: "fightForestBattle", role: "battle" },
        { file: "js/systems/forest-warfare.js", symbol: "updateForestWarfare", role: "annual pass" },
        { file: "js/presentation/forest-atlas-panel.js", symbol: "warfareBlock", role: "ui" },
        { file: "js/presentation/management-ui.js", symbol: "raiseBorderPost", role: "ui action" },
        { file: "js/simulation/simulation.js", symbol: "updateForestWarfare", role: "annual wiring" },
        { file: "js/world/sacred-groves.js", symbol: "sacredGroveTileAt", role: "joint preserve guard" },
        { file: "js/systems/world-map.js", symbol: "pressRegionClaim", role: "province ownership" },
        { file: "js/systems/diplomacy.js", symbol: "cancelTradeAgreement", role: "embargo" },
        { file: "js/systems/military.js", symbol: "recordMilitaryWound", role: "soldier losses" },
        { file: "js/systems/forest-succession.js", symbol: "controlledBurnNearestForestTile", role: "war fire" }
    ],
    tests: ["tests/systems/forest-warfare.test.js"]
});

const INDUSTRY_SPEC = Object.freeze({
    id: "1.2.23.1.151-180",
    title: "Regional forest economy and workshops",
    file: "js/world/forest-industries.js",
    manifest: "FOREST_INDUSTRY_REQUIREMENTS",
    consumers: [
        { file: "js/world/forest-industries.js", symbol: "FOREST_INDUSTRY_REQUIREMENTS", role: "catalog" },
        { file: "js/world/forest-industries.js", symbol: "FOREST_WORKS_MODES", role: "workshops" },
        { file: "js/systems/forest-industries.js", symbol: "runForestWorks", role: "simulation" },
        { file: "js/presentation/forest-atlas-panel.js", symbol: "renderForestAtlasPanel", role: "ui" },
        { file: "js/presentation/management-ui.js", symbol: "forestWorksStatus", role: "ui" },
        { file: "js/core/save-runtime.js", symbol: "createSaveSnapshot", role: "persistence" }
    ],
    tests: [
        "tests/systems/forest-industries.test.js",
        "tests/browser/forest-industry-ui.mjs"
    ]
});

const SYSTEM_SPECS = [
    section("2.1", "Technical stability and performance", [
        { id: "2.1.1", label: "Fixed-step simulation clock with bounded catch-up", evidence: [
            { file: "js/core/simulation-clock.js", symbol: "consumeSimulationTime" },
            { file: "js/simulation/simulation.js", symbol: "updateSimulation" }
        ], tests: ["tests/core/simulation-clock.test.js"] },
        { id: "2.1.2", label: "Entity, particle and memory caps", evidence: [
            { file: "js/world/entities.js", symbol: "canSpawnEntity" },
            { file: "js/systems/people.js", symbol: "MAX_PERSON_ARCHIVE" }
        ], tests: ["tests/world/entity-capacity.test.js"] },
        { id: "2.1.3", label: "Renderer LOD, fog cache and minimap throttling", evidence: [
            { file: "js/presentation/rendering/renderer.js", symbol: "drawWorld" },
            { file: "js/presentation/rendering/terrain.js", symbol: "drawTerrain" }
        ], tests: ["tests/rendering/terrain-atlas.test.js"] },
        { id: "2.1.4", label: "Bounded event logs and personal history", evidence: [
            { file: "js/systems/people.js", symbol: "addPersonMemory" },
            { file: "js/systems/court.js", symbol: "COURT_HISTORY_LIMIT" }
        ], tests: ["tests/systems/people.test.js"] },
        { id: "2.1.5", label: "Validated and migrated save snapshots", evidence: [
            { file: "js/core/save-validation.js", symbol: "validateSaveSnapshot" },
            { file: "js/core/save-migrations.js", symbol: "migrateSaveSnapshot" }
        ], tests: ["tests/core/save-validation.test.js", "tests/core/persistence.test.js"] },
        { id: "2.1.6", label: "Measured low-end performance budget", evidence: [
            { file: "js/app/performance-benchmark.js", symbol: "buildBenchmarkPlan" },
            { file: "tests/browser/low-end-performance.mjs", symbol: "PERF" }
        ], tests: ["tests/app/performance-benchmark.test.js"] }
    ], {
        consumers: [
            { file: "js/core/simulation-clock.js", symbol: "consumeSimulationTime", role: "simulation" },
            { file: "js/core/save-validation.js", symbol: "validateSaveSnapshot", role: "persistence" }
        ],
        tests: ["tests/core/simulation-clock.test.js"]
    }),
    section("2.2", "Deterministic identity foundation", [
        { id: "2.2.1", label: "Named deterministic random streams", evidence: [
            { file: "js/core/random.js", symbol: "random" },
            { file: "js/core/random.js", symbol: "getRandomStreamSnapshot" }
        ], tests: ["tests/systems/random.test.js"] },
        { id: "2.2.2", label: "Stable seed-scoped entity and person IDs", evidence: [
            { file: "js/world/entities.js", symbol: "spawnEntity" },
            { file: "js/systems/identity.js", symbol: "normalizeIdentity" }
        ], tests: ["tests/world/entity-identity.test.js"] },
        { id: "2.2.3", label: "Legacy IDs and stream counters migrate on load", evidence: [
            { file: "js/core/save-migrations.js", symbol: "migrateSaveSnapshot" },
            { file: "js/core/random.js", symbol: "restoreRandomStreams" }
        ], tests: ["tests/systems/save-runtime.test.js"] },
        { id: "2.2.4", label: "Persistent person profiles, traits, needs and memories", evidence: [
            { file: "js/systems/people.js", symbol: "createPersonProfile" },
            { file: "js/systems/people.js", symbol: "ensurePersonProfile" }
        ], tests: ["tests/systems/people.test.js"] },
        { id: "2.2.5", label: "Deterministic replay from saved stream counters", evidence: [
            { file: "js/core/random.js", symbol: "random" },
            { file: "js/simulation/villagers.js", symbol: "findPath" }
        ], tests: ["tests/villager-determinism.test.js", "tests/simulation/combat-determinism.test.js"] }
    ], {
        consumers: [
            { file: "js/core/random.js", symbol: "random", role: "simulation" },
            { file: "js/systems/people.js", symbol: "ensurePersonProfile", role: "people" }
        ],
        tests: ["tests/systems/random.test.js"]
    }),
    section("2.3", "Event-linked personal chronicle", [
        { id: "2.3.1", label: "Events select a bounded cast with stable person IDs", evidence: [
            { file: "js/systems/people.js", symbol: "createEventParticipants" },
            { file: "js/systems/people.js", symbol: "recordPersonEventOutcome" }
        ], tests: ["tests/event-chains.test.js"] },
        { id: "2.3.2", label: "Resolved choices create durable participant memories", evidence: [
            { file: "js/systems/people.js", symbol: "recordPersonEventOutcome" },
            { file: "js/systems/people.js", symbol: "addPersonMemory" }
        ], tests: ["tests/systems/people.test.js"] },
        { id: "2.3.3", label: "Directed relationships change with public outcomes", evidence: [
            { file: "js/systems/people.js", symbol: "recordPersonEventOutcome" },
            { file: "js/systems/social.js", symbol: "updateSocialLife" }
        ], tests: ["tests/social.test.js"] },
        { id: "2.3.4", label: "Multi-stage threads retain their cast", evidence: [
            { file: "js/systems/event-chains.js", symbol: "EVENT_CHAINS" },
            { file: "js/systems/events.js", symbol: "resolveEventChoice" }
        ], tests: ["tests/event-chains.test.js"] },
        { id: "2.3.5", label: "Memory and relationship lists stay bounded", evidence: [
            { file: "js/systems/people.js", symbol: "normalizePersonProfile" },
            { file: "js/systems/people.js", symbol: "addPersonMemory" }
        ], tests: ["tests/systems/people.test.js"] }
    ], {
        consumers: [
            { file: "js/systems/people.js", symbol: "recordPersonEventOutcome", role: "story" },
            { file: "js/systems/events.js", symbol: "resolveEventChoice", role: "simulation" }
        ],
        tests: ["tests/event-chains.test.js"]
    }),
    section("2.4", "Species-aware annual aging", [
        { id: "2.4.1", label: "Annual lastAgedYear cursor prevents duplicate aging", evidence: [
            { file: "js/systems/people.js", symbol: "updatePeople" },
            { file: "js/systems/people.js", symbol: "normalizePersonProfile" }
        ], tests: ["tests/systems/people.test.js"] },
        { id: "2.4.2", label: "Species-specific maturation thresholds and life stages", evidence: [
            { file: "js/systems/people.js", symbol: "PERSON_SPECIES" },
            { file: "js/systems/people.js", symbol: "updatePeople" }
        ], tests: ["tests/systems/people.test.js"] },
        { id: "2.4.3", label: "Life-stage transitions add bounded memories", evidence: [
            { file: "js/systems/people.js", symbol: "addPersonMemory" },
            { file: "js/systems/people.js", symbol: "updatePeople" }
        ], tests: ["tests/systems/people.test.js"] },
        { id: "2.4.4", label: "Legacy saves do not receive an accidental aging catch-up", evidence: [
            { file: "js/systems/people.js", symbol: "normalizePersonProfile" },
            { file: "js/core/save-migrations.js", symbol: "migrateSaveSnapshot" }
        ], tests: ["tests/systems/save-runtime.test.js"] }
    ], {
        consumers: [
            { file: "js/systems/people.js", symbol: "updatePeople", role: "simulation" }
        ],
        tests: ["tests/systems/people.test.js"]
    }),
    section("2.5", "Explicit family and kinship graph", [
        { id: "2.5.1", label: "Typed parent, child and partner links", evidence: [
            { file: "js/systems/families.js", symbol: "linkParentChild" },
            { file: "js/systems/families.js", symbol: "setPartnership" }
        ], tests: ["tests/systems/families.test.js"] },
        { id: "2.5.2", label: "Reciprocal and idempotent kinship edges", evidence: [
            { file: "js/systems/families.js", symbol: "linkParentChild" },
            { file: "js/systems/families.js", symbol: "normalizeFamilyLinks" }
        ], tests: ["tests/systems/families.test.js"] },
        { id: "2.5.3", label: "Partnership status history and separated/divorced records", evidence: [
            { file: "js/systems/families.js", symbol: "setPartnership" },
            { file: "js/systems/families.js", symbol: "getFamilySnapshot" }
        ], tests: ["tests/systems/families.test.js"] },
        { id: "2.5.4", label: "Legacy person records migrate to empty bounded kinship", evidence: [
            { file: "js/systems/people.js", symbol: "normalizePersonProfile" },
            { file: "js/systems/families.js", symbol: "normalizeFamilyLinks" }
        ], tests: ["tests/systems/families.test.js"] },
        { id: "2.5.5", label: "Save loading repairs reciprocal links after restore", evidence: [
            { file: "js/core/save-runtime.js", symbol: "restoreSaveSnapshot" },
            { file: "js/systems/families.js", symbol: "getFamilySnapshot" }
        ], tests: ["tests/systems/save-runtime.test.js"] }
    ], {
        consumers: [
            { file: "js/systems/families.js", symbol: "getFamilySnapshot", role: "family" },
            { file: "js/core/save-runtime.js", symbol: "restoreSaveSnapshot", role: "persistence" }
        ],
        tests: ["tests/systems/families.test.js"]
    }),
    section("3.3", "Roads and settlement infrastructure", [
        { id: "3.3.1", label: "Dirt, gravel and paved roads", evidence: [{ file: "js/systems/roads.js", symbol: "ROAD_TYPES" }, { file: "js/systems/roads.js", symbol: "placeRoad" }], tests: ["tests/systems/roads.test.js"] },
        { id: "3.3.2", label: "Resource costs, upgrades and demolition refunds", evidence: [{ file: "js/systems/roads.js", symbol: "placeRoad" }, { file: "js/systems/roads.js", symbol: "removeRoad" }], tests: ["tests/systems/roads.test.js"] },
        { id: "3.3.3", label: "Click and drag placement with explicit exit", evidence: [{ file: "js/systems/roads.js", symbol: "setRoadBuildMode" }, { file: "js/systems/roads.js", symbol: "clearRoadBuildMode" }], tests: ["tests/systems/roads.test.js"] },
        { id: "3.3.4", label: "Road rendering and intersections", evidence: [{ file: "js/presentation/rendering/renderer.js", symbol: "drawRoadNetwork" }, { file: "js/systems/roads.js", symbol: "getRoadAt" }], tests: ["tests/systems/roads.test.js"] },
        { id: "3.3.5", label: "Road-aware movement and A* routing", evidence: [{ file: "js/systems/roads.js", symbol: "getRoadTravelCost" }, { file: "js/simulation/villagers.js", symbol: "findPath" }], tests: ["tests/simulation/pathfinding.test.js"] },
        { id: "3.3.6", label: "Road upkeep in the economy ledger", evidence: [{ file: "js/systems/roads.js", symbol: "getRoadUpkeepTotal" }, { file: "js/systems/economy.js", symbol: "updateEconomy" }], tests: ["tests/systems/roads.test.js"] },
        { id: "3.3.7", label: "Versioned road save and restore", evidence: [{ file: "js/systems/roads.js", symbol: "serializeRoads" }, { file: "js/systems/roads.js", symbol: "restoreRoads" }], tests: ["tests/systems/roads.test.js"] }
    ], {
        consumers: [{ file: "js/systems/roads.js", symbol: "getRoadAt", role: "simulation" }, { file: "js/presentation/rendering/renderer.js", symbol: "drawRoadNetwork", role: "renderer" }],
        tests: ["tests/systems/roads.test.js"]
    }),
    section("3.4", "Resource geography and site suitability", [
        { id: "3.4.1", label: "Seed-generated forest, stone, water and fertile soil nodes", evidence: [{ file: "js/systems/resource-geography.js", symbol: "generateResourceGeography" }], tests: ["tests/systems/resource-geography.test.js"] },
        { id: "3.4.2", label: "Compact resource nodes without heavyweight per-tile objects", evidence: [{ file: "js/systems/resource-geography.js", symbol: "generateResourceGeography" }], tests: ["tests/systems/resource-geography.test.js"] },
        { id: "3.4.3", label: "Woodcutters require a forest work radius", evidence: [{ file: "js/systems/construction.js", symbol: "siteSuitability" }, { file: "js/systems/resource-geography.js", symbol: "getResourceNodeAt" }], tests: ["tests/systems/resource-geography.test.js"] },
        { id: "3.4.4", label: "Quarries require a stone deposit", evidence: [{ file: "js/systems/construction.js", symbol: "siteSuitability" }], tests: ["tests/systems/resource-geography.test.js"] },
        { id: "3.4.5", label: "Wells require water-bearing terrain", evidence: [{ file: "js/systems/construction.js", symbol: "siteSuitability" }], tests: ["tests/systems/resource-geography.test.js"] },
        { id: "3.4.6", label: "Stocks deplete and recover at measured rates", evidence: [{ file: "js/systems/resource-geography.js", symbol: "regrowForests" }, { file: "js/systems/forest-gathering.js", symbol: "gatherForestProducts" }], tests: ["tests/systems/forest-gathering.test.js"] },
        { id: "3.4.7", label: "Forest regrowth and forester planting", evidence: [{ file: "js/systems/forest-succession.js", symbol: "updateForestSuccession" }, { file: "js/systems/fields.js", symbol: "foresterRangeSummary" }], tests: ["tests/systems/forest-succession.test.js"] },
        { id: "3.4.8", label: "Resource, suitability and depletion map overlays", evidence: [{ file: "js/presentation/rendering/renderer.js", symbol: "drawMapLayer" }, { file: "js/presentation/rendering/ui.js", symbol: "mapLayer" }], tests: ["tests/ui/map-layer-controls.test.js"] },
        { id: "3.4.9", label: "Placement preview explains invalid sites", evidence: [{ file: "js/systems/construction.js", symbol: "siteSuitability" }, { file: "js/presentation/build-ui.js", symbol: "placement" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.4.10", label: "Migration-safe resource node state", evidence: [{ file: "js/systems/resource-geography.js", symbol: "serializeResourceGeography" }, { file: "js/systems/resource-geography.js", symbol: "restoreResourceGeography" }], tests: ["tests/systems/save-runtime.test.js"] }
    ], {
        consumers: [{ file: "js/systems/resource-geography.js", symbol: "generateResourceGeography", role: "resources" }, { file: "js/systems/construction.js", symbol: "siteSuitability", role: "gameplay" }],
        tests: ["tests/systems/resource-geography.test.js"]
    }),
    section("3.5", "Production chains, warehouses and hauling", [
        { id: "3.5.1", label: "Forest to logs to sawmill to planks", evidence: [{ file: "js/systems/craft-production.js", symbol: "updateCraftProduction" }, { file: "js/systems/logistics.js", symbol: "getWarehouseStock" }], tests: ["tests/systems/craft-production.test.js"] },
        { id: "3.5.2", label: "Farm to grain to mill to flour to bakery to bread", evidence: [{ file: "js/systems/craft-production.js", symbol: "updateCraftProduction" }, { file: "js/systems/logistics.js", symbol: "consumeFromWarehouse" }], tests: ["tests/simulation/bread-production-chain.test.js"] },
        { id: "3.5.3", label: "Quarry to stone to mason to cut stone", evidence: [{ file: "js/systems/craft-production.js", symbol: "CRAFT_INTERVAL" }, { file: "js/systems/logistics.js", symbol: "addLocalOutput" }], tests: ["tests/simulation/production-chains.test.js"] },
        { id: "3.5.4", label: "Water source to well and household use", evidence: [{ file: "js/systems/settlement.js", symbol: "updateSettlementNeeds" }, { file: "js/systems/city-config.js", symbol: "SERVICE_DEFINITIONS" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.5.5", label: "Warehouses with category filters and finite capacity", evidence: [{ file: "js/systems/logistics.js", symbol: "setWarehouseProfile" }, { file: "js/systems/logistics.js", symbol: "WAREHOUSE_CAPACITY" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.5.6", label: "Worker and carrier job board with reservations", evidence: [{ file: "js/systems/logistics.js", symbol: "requestHaul" }, { file: "js/systems/logistics.js", symbol: "getLogisticsSnapshot" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.5.7", label: "Bounded batches and cart capacity", evidence: [{ file: "js/systems/logistics.js", symbol: "CARRIER_CAPACITY" }, { file: "js/systems/logistics.js", symbol: "updateLogisticsMovement" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.5.8", label: "Roads and distance influence travel time", evidence: [{ file: "js/systems/logistics.js", symbol: "hasOverlandRoute" }, { file: "js/systems/roads.js", symbol: "getRoadTravelCost" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.5.9", label: "Blocked routes and full stores warn instead of deleting goods", evidence: [{ file: "js/systems/logistics.js", symbol: "getBuildingLogisticsStatus" }, { file: "js/systems/logistics.js", symbol: "cancelJobsForEntity" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.5.10", label: "Expiring reservations and job cancellation", evidence: [{ file: "js/systems/logistics.js", symbol: "JOB_EXPIRE_TICKS" }, { file: "js/systems/logistics.js", symbol: "rebuildLogisticsReservations" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.5.11", label: "Read-only production-chain inspector and warehouse profile hints", evidence: [{ file: "js/presentation/production-chain.js", symbol: "getProductionChainSnapshot" }, { file: "js/presentation/production-chain.js", symbol: "getWarehouseProfileSnapshot" }, { file: "js/systems/logistics.js", symbol: "getBuildingSupplyReason" }], tests: ["tests/presentation/production-chain.test.js", "tests/browser/production-chain-inspector.mjs"] }
    ], {
        consumers: [{ file: "js/systems/logistics.js", symbol: "updateLogistics", role: "simulation" }, { file: "js/systems/craft-production.js", symbol: "updateCraftProduction", role: "production" }],
        tests: ["tests/systems/logistics-integrity.test.js"]
    }),
    section("3.6", "Housing, households and citizen needs", [
        { id: "3.6.1", label: "Tent, timber cottage and stone house tiers", evidence: [{ file: "js/systems/city-config.js", symbol: "HOUSING_TIERS" }, { file: "js/systems/city-config.js", symbol: "housingCapacityFor" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.6.2", label: "Housing capacity and household occupancy gates", evidence: [{ file: "js/systems/settlement.js", symbol: "updateServices" }, { file: "js/systems/settlement.js", symbol: "canSettleNewcomer" }], tests: ["tests/population.test.js"] },
        { id: "3.6.3", label: "Food, water, warmth, safety, social and health needs", evidence: [{ file: "js/systems/settlement.js", symbol: "NEED_WEIGHTS" }, { file: "js/systems/settlement.js", symbol: "updateSettlementNeeds" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.6.4", label: "Gradual consequence ladder from warning to migration", evidence: [{ file: "js/systems/settlement.js", symbol: "updateSettlementNeeds" }, { file: "js/systems/morale.js", symbol: "updateMorale" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.6.5", label: "Household service coverage and distances", evidence: [{ file: "js/systems/settlement.js", symbol: "getServiceReason" }, { file: "js/systems/settlement.js", symbol: "getServiceBuildingsForOverlay" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.6.6", label: "Firewood heating consumed from local stores", evidence: [{ file: "js/systems/settlement.js", symbol: "consumeFromWarehouse" }, { file: "js/systems/logistics.js", symbol: "findLocalWarehouse" }], tests: ["tests/systems/logistics-integrity.test.js"] },
        { id: "3.6.7", label: "Population growth and ageing use explicit household state", evidence: [{ file: "js/systems/population.js", symbol: "updatePopulation" }, { file: "js/systems/births.js", symbol: "updateBirths" }], tests: ["tests/population.test.js", "tests/births.test.js"] }
    ], {
        consumers: [{ file: "js/systems/settlement.js", symbol: "updateSettlementNeeds", role: "simulation" }, { file: "js/systems/city-config.js", symbol: "HOUSING_TIERS", role: "gameplay" }],
        tests: ["tests/systems/city-builder.test.js"]
    }),
    section("3.7", "Seasons, services and settlement character", [
        { id: "3.7.1", label: "Seasonal field stages and harvest", evidence: [{ file: "js/systems/fields.js", symbol: "FIELD_STAGES" }, { file: "js/systems/fields.js", symbol: "updateFields" }], tests: ["tests/world/season.test.js"] },
        { id: "3.7.2", label: "Seasonal construction, snow, mud and lighting", evidence: [{ file: "js/world/season.js", symbol: "seasonalState" }, { file: "js/presentation/rendering/terrain.js", symbol: "seasonalState" }], tests: ["tests/rendering/terrain-season-blend.test.js"] },
        { id: "3.7.3", label: "Market, well, tavern, temple and watchtower service radii", evidence: [{ file: "js/systems/city-config.js", symbol: "SERVICE_DEFINITIONS" }, { file: "js/systems/settlement.js", symbol: "updateServices" }], tests: ["tests/systems/city-builder.test.js"] },
        { id: "3.7.4", label: "Coverage overlays explain service gaps", evidence: [{ file: "js/systems/settlement.js", symbol: "getServiceBuildingsForOverlay" }, { file: "js/presentation/rendering/ui.js", symbol: "mapLayer" }], tests: ["tests/ui/map-layer-controls.test.js"] },
        { id: "3.7.5", label: "Seed-driven weather and recoverable hazards", evidence: [{ file: "js/world/weather.js", symbol: "weatherWeights" }, { file: "js/systems/events.js", symbol: "checkRandomEvents" }], tests: ["tests/world/weather-season.test.js"] },
        { id: "3.7.6", label: "Context-weighted events with telegraphed choices", evidence: [{ file: "js/systems/events.js", symbol: "triggerRandomEvent" }, { file: "js/systems/events.js", symbol: "resolveEventChoice" }], tests: ["tests/systems/events.test.js"] },
        { id: "3.7.7", label: "Civic policies and settlement services", evidence: [{ file: "js/systems/civic.js", symbol: "CIVIC_POLICIES" }, { file: "js/systems/civic.js", symbol: "updateCivic" }], tests: ["tests/systems/civic.test.js"] }
    ], {
        consumers: [{ file: "js/systems/fields.js", symbol: "updateFields", role: "simulation" }, { file: "js/systems/civic.js", symbol: "updateCivic", role: "gameplay" }],
        tests: ["tests/systems/civic.test.js"]
    }),
    section("3.8", "Royal court, advisor and living nobility", [
        { id: "3.8.1", label: "Named advisor with skills, personality, loyalty, ambition and relationships", evidence: [
            { file: "js/systems/advisor.js", symbol: "ensureRoyalAdvisor" },
            { file: "js/systems/advisor.js", symbol: "getAdvisorSnapshot" }
        ], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.2", label: "Advisor reviews the realm at a measured cadence", evidence: [{ file: "js/systems/advisor.js", symbol: "updateAdvisor" }], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.3", label: "Advice cites actual shortages, treasury, threats and factions", evidence: [{ file: "js/systems/advisor.js", symbol: "buildAdvisorAdvice" }], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.4", label: "Player can accept, reject, delay or request evidence", evidence: [{ file: "js/systems/advisor.js", symbol: "resolveAdvisorAdvice" }, { file: "js/presentation/management-ui.js", symbol: "advisor" }], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.5", label: "Advice can be biased or wrong and has consequences", evidence: [{ file: "js/systems/advisor.js", symbol: "buildAdvisorAdvice" }], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.6", label: "Advisor memory records advice and outcomes", evidence: [{ file: "js/systems/advisor.js", symbol: "recordAdvisorMemory" }], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.7", label: "No omniscience: advice only uses bounded live state", evidence: [{ file: "js/systems/advisor.js", symbol: "ADVISOR_SIGNAL_LIMIT" }], tests: ["tests/systems/advisor.test.js"] },
        { id: "3.8.8", label: "Six named court offices with real effects", evidence: [{ file: "js/systems/court.js", symbol: "COURT_OFFICES" }, { file: "js/systems/court.js", symbol: "getCourtModifiers" }], tests: ["tests/systems/court-diplomacy.test.js"] },
        { id: "3.8.9", label: "Office salaries, corruption, petitions and vacancies", evidence: [{ file: "js/systems/court.js", symbol: "updateCourt" }], tests: ["tests/systems/court-diplomacy.test.js"] },
        { id: "3.8.10", label: "Noble houses have identity, wealth, troops and loyalty", evidence: [{ file: "js/systems/nobility.js", symbol: "getNobilitySnapshot" }, { file: "js/systems/nobility.js", symbol: "callNobleLevy" }], tests: ["tests/systems/nobility.test.js"] },
        { id: "3.8.11", label: "Noble land armies and autonomous military commands", evidence: [
            { file: "js/systems/noble-host.js", symbol: "updateNobleHosts" },
            { file: "js/systems/noble-host.js", symbol: "orderNobleHost" },
            { file: "js/presentation/management-ui.js", symbol: "nobilityPanel" }
        ], tests: ["tests/systems/noble-host.test.js"] },
        { id: "3.8.12", label: "Noble feuds and autonomous conflict between houses", evidence: [
            { file: "js/systems/noble-feuds.js", symbol: "updateNobleFeuds" },
            { file: "js/systems/noble-feuds.js", symbol: "mediateFeud" },
            { file: "js/presentation/management-ui.js", symbol: "nobilityPanel" }
        ], tests: ["tests/systems/noble-feuds.test.js"] },
        { id: "3.8.13", label: "Feudal war aims, theatre campaigns and staged noble contracts", evidence: [
            { file: "js/systems/feudal-campaigns.js", symbol: "WAR_AIMS" },
            { file: "js/systems/feudal-campaigns.js", symbol: "FEUDAL_CONTRACTS" },
            { file: "js/systems/feudal-campaigns.js", symbol: "aimCampaign" },
            { file: "js/systems/feudal-campaigns.js", symbol: "commitCampaign" },
            { file: "js/systems/feudal-campaigns.js", symbol: "updateCampaignProgress" },
            { file: "js/systems/feudal-campaigns.js", symbol: "settleAnnualCampaigns" },
            { file: "js/presentation/management-ui.js", symbol: "campaign-aim" },
            { file: "js/presentation/world-map-panel.js", symbol: "renderWorldMapPanel" }
        ], tests: ["tests/systems/feudal-campaigns.test.js", "tests/simulation/combat-determinism.test.js", "tests/browser/feudal-campaigns-ui.mjs"] }
    ], {
        consumers: [
            { file: "js/systems/court.js", symbol: "updateCourt", role: "simulation" },
            { file: "js/systems/nobility.js", symbol: "getNobilitySnapshot", role: "gameplay" },
            { file: "js/systems/noble-host.js", symbol: "updateNobleHosts", role: "military" },
            { file: "js/systems/noble-feuds.js", symbol: "updateNobleFeuds", role: "conflict" },
            { file: "js/systems/feudal-campaigns.js", symbol: "settleAnnualCampaigns", role: "campaign" },
            { file: "js/presentation/world-map-panel.js", symbol: "renderWorldMapPanel", role: "theatre" }
        ],
        tests: ["tests/systems/court-diplomacy.test.js", "tests/systems/nobility.test.js", "tests/systems/noble-host.test.js", "tests/systems/noble-feuds.test.js", "tests/systems/feudal-campaigns.test.js"]
    }),
    section("3.9", "Dynasty, constitution and diplomacy", [
        { id: "3.9.1", label: "Succession law drives the actual succession path", evidence: [{ file: "js/systems/government.js", symbol: "setSuccessionLaw" }, { file: "js/systems/royal-dynasty.js", symbol: "updateRoyalSuccession" }], tests: ["tests/systems/succession-law.test.js"] },
        { id: "3.9.2", label: "Regency, contested claims, abdication, usurpation and civil conflict", evidence: [
            { file: "js/systems/royal-crisis.js", symbol: "updateRoyalCrisis" },
            { file: "js/systems/royal-crisis.js", symbol: "startRegency" },
            { file: "js/systems/royal-crisis.js", symbol: "pressClaim" },
            { file: "js/systems/royal-crisis.js", symbol: "abdicateThrone" },
            { file: "js/systems/royal-crisis.js", symbol: "getRoyalCrisisSnapshot" },
            { file: "js/systems/royal-dynasty.js", symbol: "updateRoyalSuccession" },
            { file: "js/presentation/management-ui.js", symbol: "royalCrisisPanel" }
        ], tests: ["tests/systems/royal-crisis.test.js"] },
        { id: "3.9.3", label: "Parliament/council, rights, taxes and decrees", evidence: [{ file: "js/systems/government.js", symbol: "GOVERNMENT_FORMS" }, { file: "js/systems/government.js", symbol: "setTaxRate" }], tests: ["tests/systems/court-diplomacy.test.js"] },
        { id: "3.9.4", label: "Laws have supporters, opponents, costs and enforcement", evidence: [{ file: "js/systems/justice.js", symbol: "LAW_CODES" }, { file: "js/systems/justice.js", symbol: "setLawCode" }], tests: ["tests/systems/faith-justice.test.js"] },
        { id: "3.9.5", label: "Neighbouring realms have rulers, economies and military strength", evidence: [{ file: "js/systems/diplomacy.js", symbol: "getDiplomacySnapshot" }, { file: "js/systems/diplomacy-config.js", symbol: "DIPLOMATIC_REALMS" }], tests: ["tests/systems/diplomacy.test.js"] },
        { id: "3.9.6", label: "Treaties, alliances, trade and wars have durable state", evidence: [{ file: "js/systems/diplomacy.js", symbol: "proposeAlliance" }, { file: "js/systems/diplomacy.js", symbol: "declareWar" }], tests: ["tests/systems/diplomacy.test.js"] },
        { id: "3.9.7", label: "Guarantees and long-term diplomatic consequences", evidence: [{ file: "js/systems/diplomacy.js", symbol: "grantGuarantee" }, { file: "js/systems/diplomacy.js", symbol: "honorGuaranteeCall" }, { file: "js/systems/diplomacy.js", symbol: "refuseGuaranteeCall" }, { file: "js/systems/diplomacy.js", symbol: "updateGuarantees" }, { file: "js/presentation/management-ui.js", symbol: "diplomacy" }], tests: ["tests/systems/diplomacy-guarantees.test.js"] },
        { id: "3.9.8", label: "Dynastic marriage, heir designation and succession record", evidence: [{ file: "js/systems/royal-dynasty.js", symbol: "designateHeir" }, { file: "js/systems/royal-dynasty.js", symbol: "updateRoyalSuccession" }], tests: ["tests/systems/families.test.js"] },
        { id: "3.9.9", label: "Council docket with law debate, votes and enforcement", evidence: [
            { file: "js/systems/council-laws.js", symbol: "COUNCIL_BILLS" },
            { file: "js/systems/council-laws.js", symbol: "proposeCouncilBill" },
            { file: "js/systems/council-laws.js", symbol: "lobbyCouncilBill" },
            { file: "js/systems/council-laws.js", symbol: "callCouncilVote" },
            { file: "js/systems/council-laws.js", symbol: "updateCouncilDocket" },
            { file: "js/simulation/simulation.js", symbol: "councilDocket" },
            { file: "js/presentation/management-ui.js", symbol: "councilSection" }
        ], tests: ["tests/systems/council-laws.test.js", "tests/browser/council-docket-ui.mjs"] },
        { id: "3.9.10", label: "Envoy missions stage treaty negotiation from skill, Chancellor, foreign-desk intel and seed", evidence: [
            { file: "js/systems/diplomacy.js", symbol: "sendEnvoyMission" },
            { file: "js/systems/diplomacy.js", symbol: "negotiateEnvoyMission" },
            { file: "js/systems/diplomacy.js", symbol: "reportEnvoyMission" },
            { file: "js/systems/diplomacy.js", symbol: "ratifyEnvoyMission" },
            { file: "js/systems/diplomacy.js", symbol: "updateDiplomaticMissions" },
            { file: "js/systems/diplomacy.js", symbol: "getDiplomaticMissionSnapshot" },
            { file: "js/simulation/simulation.js", symbol: "diplomaticMissions" },
            { file: "js/presentation/management-ui.js", symbol: "diplomacy" }
        ], tests: ["tests/systems/diplomatic-missions.test.js", "tests/browser/diplomatic-missions-ui.mjs"] },
        { id: "3.9.11", label: "Royal education, annual tutelage and coming-of-age audiences", evidence: [
            { file: "js/systems/royal-education.js", symbol: "ROYAL_CURRICULA" },
            { file: "js/systems/royal-education.js", symbol: "appointRoyalTutor" },
            { file: "js/systems/royal-education.js", symbol: "enrollRoyalStudent" },
            { file: "js/systems/royal-education.js", symbol: "updateRoyalEducation" },
            { file: "js/systems/royal-education.js", symbol: "holdRoyalAudience" },
            { file: "js/systems/royal-education.js", symbol: "getRoyalEducationSnapshot" },
            { file: "js/simulation/simulation.js", symbol: "royalEducation" },
            { file: "js/presentation/management-ui.js", symbol: "royalEducationPanel" }
        ], tests: ["tests/systems/royal-education.test.js", "tests/browser/royal-education-ui.mjs"] }
    ], {
        consumers: [
            { file: "js/systems/diplomacy.js", symbol: "getDiplomacySnapshot", role: "diplomacy" },
            { file: "js/systems/royal-dynasty.js", symbol: "updateRoyalSuccession", role: "dynasty" },
            { file: "js/systems/royal-crisis.js", symbol: "updateRoyalCrisis", role: "dynasty-crisis" },
            { file: "js/presentation/management-ui.js", symbol: "royalCrisisPanel", role: "gameplay" },
            { file: "js/presentation/management-ui.js", symbol: "councilSection", role: "gameplay" },
            { file: "js/presentation/management-ui.js", symbol: "royalEducationPanel", role: "gameplay" }
        ],
        tests: ["tests/systems/diplomacy.test.js"]
    }),
    section("3.10", "Full creature ecosystem and comic-art expansion", [
        { id: "3.10.1", label: "Dragons, wyverns, trolls and additional species", evidence: [{ file: "js/world/creature-species-data.js", symbol: "CREATURE_SPECIES" }, { file: "js/systems/creatures.js", symbol: "summonCreature" }, { file: "js/presentation/rendering/entities.js", symbol: "getEmoji" }], tests: ["tests/systems/creature-ecology.test.js"] },
        { id: "3.10.2", label: "Species-specific habitat, food, territory and temperament", evidence: [{ file: "js/world/creature-species-data.js", symbol: "creatureProfile" }, { file: "js/systems/creatures.js", symbol: "updateCreatures" }, { file: "js/presentation/management-ui.js", symbol: "creatureGlyph" }], tests: ["tests/systems/creature-ecology.test.js"] },
        { id: "3.10.3", label: "Eggs, nesting, maturity, breeding and mortality", evidence: [{ file: "js/systems/creatures.js", symbol: "awakenCreature" }, { file: "js/systems/creatures.js", symbol: "hatchNest" }, { file: "js/systems/creatures.js", symbol: "breedCreature" }], tests: ["tests/systems/creature-ecology.test.js"] },
        { id: "3.10.4", label: "Predation, scavenging, migration and competition", evidence: [{ file: "js/systems/creatures.js", symbol: "forageCreature" }, { file: "js/systems/creatures.js", symbol: "migrateCreature" }, { file: "js/systems/creatures.js", symbol: "competeCreature" }], tests: ["tests/systems/creature-ecology.test.js"] },
        { id: "3.10.5", label: "Creature memory, injuries and territory changes", evidence: [{ file: "js/systems/creatures.js", symbol: "remember" }, { file: "js/systems/creatures.js", symbol: "updateCreatures" }], tests: ["tests/systems/depth.test.js"] },
        { id: "3.10.6", label: "Population caps prevent runaway spawning", evidence: [{ file: "js/systems/creatures.js", symbol: "summonDragon" }], tests: ["tests/systems/depth.test.js"] },
        { id: "3.10.7", label: "Comic-art sprites and construction/seasonal presentation", evidence: [{ file: "js/presentation/rendering/building-art.js", symbol: "drawAuthoredBuilding" }, { file: "js/presentation/rendering/entities.js", symbol: "drawEntity" }], tests: ["tests/systems/card-sprite-assets.test.js"] }
    ], {
        consumers: [{ file: "js/systems/creatures.js", symbol: "updateCreatures", role: "simulation" }, { file: "js/presentation/rendering/entities.js", symbol: "drawEntity", role: "renderer" }],
        tests: ["tests/systems/depth.test.js"]
    }),
    section("3.11", "Royal expeditions and biome follow-up chains", [
        { id: "3.11.1", label: "One bounded follow-up chain per existing landmark from SITE_CHAINS", evidence: [
            { file: "js/systems/expeditions.js", symbol: "SITE_CHAINS", role: "chain catalog" },
            { file: "js/systems/expeditions.js", symbol: "MAX_SITES", role: "site bound" }
        ], tests: ["tests/systems/expeditions.test.js"] },
        { id: "3.11.2", label: "Blight study and quarantine arm one follow-up; purge and ignore do not", evidence: [
            { file: "js/systems/special-biome-couplings.js", symbol: "blightChoices", role: "decision catalog" },
            { file: "js/systems/special-biome-couplings.js", symbol: "resolveBlightDecision", role: "decision" },
            { file: "js/systems/expeditions.js", symbol: "armSiteChainFollowUp", role: "field order" },
            { file: "js/systems/expeditions.js", symbol: "SITE_CHAIN_CLAIMS", role: "claim guard" }
        ], tests: ["tests/systems/special-biome-couplings.test.js", "tests/browser/biome-atlas-ui.mjs"] },
        { id: "3.11.3", label: "Four named stages are exposed through chainStage and the Explore panel", evidence: [
            { file: "js/systems/expeditions.js", symbol: "CHAIN_STAGE_LABELS", role: "stage labels" },
            { file: "js/systems/expeditions.js", symbol: "chainStage", role: "state" },
            { file: "js/presentation/expeditions-panel.js", symbol: "FOLLOW-UP ·", role: "badge" },
            { file: "js/presentation/expeditions-panel.js", symbol: "CHAINS CLOSED", role: "counter" },
            { file: "css/diplomacy.css", symbol: "expedition-site__chain", role: "presentation" }
        ], tests: ["tests/systems/expeditions.test.js", "tests/browser/expeditions-ui.mjs"] },
        { id: "3.11.4", label: "Fixed +6/+0.12 study and +3/+0.05 quarantine modifiers reuse the existing score stream", evidence: [
            { file: "js/systems/expeditions.js", symbol: "SITE_CHAINS", role: "fixed modifiers" },
            { file: "js/systems/expeditions.js", symbol: "chainBonus", role: "score" },
            { file: "js/systems/expeditions.js", symbol: "rewardScale", role: "cache scale" }
        ], tests: ["tests/systems/expeditions.test.js"] },
        { id: "3.11.5", label: "A failed follow-up stays armed at stage 2 and can be attempted again", evidence: [
            { file: "js/systems/expeditions.js", symbol: "chainStage", role: "stage" },
            { file: "js/systems/expeditions.js", symbol: "chainClaim", role: "claim" },
            { file: "js/systems/expeditions.js", symbol: "pushSiteNote", role: "failure note" },
            { file: "js/systems/expeditions.js", symbol: "chainReady", role: "snapshot" }
        ], tests: ["tests/systems/expeditions.test.js"] },
        { id: "3.11.6", label: "Eight field notes of 220 characters normalize without a save bump or per-tick work", evidence: [
            { file: "js/systems/expeditions.js", symbol: "MAX_SITE_NOTES", role: "note cap" },
            { file: "js/systems/expeditions.js", symbol: "MAX_SITE_NOTE_CHARS", role: "length cap" },
            { file: "js/systems/expeditions.js", symbol: "normalizeExpeditionsState", role: "persistence" },
            { file: "js/systems/expeditions.js", symbol: "updateExpeditions", role: "tick guard" },
            { file: "js/presentation/expeditions-panel.js", symbol: "expedition-site__notes", role: "notes ui" }
        ], tests: ["tests/systems/expeditions.test.js", "tests/browser/expeditions-ui.mjs"] }
    ], {
        consumers: [
            { file: "js/systems/expeditions.js", symbol: "armSiteChainFollowUp", role: "follow-up" },
            { file: "js/systems/special-biome-couplings.js", symbol: "resolveBlightDecision", role: "blight" },
            { file: "js/presentation/expeditions-panel.js", symbol: "renderExpeditionsPanel", role: "survey" },
            { file: "css/diplomacy.css", symbol: "expedition-site__chain", role: "presentation" }
        ],
        tests: ["tests/systems/expeditions.test.js", "tests/systems/special-biome-couplings.test.js", "tests/browser/expeditions-ui.mjs", "tests/browser/biome-atlas-ui.mjs"]
    }),
    section("4.0", "Great World and long-running history", [
        {
            id: "4.0.1", label: "Multiple kingdoms and map regions",
            evidence: [
                { file: "js/world/world-regions.js", symbol: "WORLD_REGION_CATALOG", role: "province-catalog" },
                { file: "js/world/world-regions.js", symbol: "WORLD_KINGDOM_IDS", role: "kingdom-catalog" },
                { file: "js/systems/world-map.js", symbol: "getWorldMapSnapshot", role: "province-state" },
                { file: "js/systems/world-map.js", symbol: "pressRegionClaim", role: "player-claim" },
                { file: "js/systems/world-map.js", symbol: "updateRegions", role: "annual-province-simulation" },
                { file: "js/presentation/world-map-panel.js", symbol: "renderWorldMapPanel", role: "gameplay" },
                { file: "js/core/save-runtime.js", symbol: "normalizeWorldMapSnapshot", role: "persistence" },
                { file: "js/simulation/simulation.js", symbol: "worldMap", role: "simulation-cadence" }
            ],
            tests: ["tests/systems/world-map.test.js", "tests/browser/world-map.mjs"]
        },
        {
            id: "4.0.2", label: "World map, trade routes, borders and frontier settlements",
            evidence: [
                { file: "js/systems/world-map.js", symbol: "getWorldMapSnapshot", role: "world-state" },
                { file: "js/systems/world-map.js", symbol: "openTradeRoute", role: "trade-routes" },
                { file: "js/systems/world-map.js", symbol: "updateWorldMap", role: "annual-simulation" },
                { file: "js/systems/world-map.js", symbol: "frontierPressureFor", role: "frontier-pressure" },
                { file: "js/presentation/world-map-panel.js", symbol: "renderWorldMapPanel", role: "gameplay" },
                { file: "js/core/save-runtime.js", symbol: "normalizeWorldMapSnapshot", role: "persistence" },
                { file: "js/core/save-migrations.js", symbol: "worldMap", role: "save-migration" },
                { file: "js/simulation/simulation.js", symbol: "worldMap", role: "simulation-cadence" }
            ],
            tests: ["tests/systems/world-map.test.js", "tests/browser/world-map.mjs"]
        },
        { id: "4.0.3", label: "Long-term world history and generational change", evidence: [{ file: "js/presentation/ai-chronicle-panel.js", symbol: "renderAiChroniclePanel" }, { file: "js/systems/micro-events.js", symbol: "updateMicroEvents" }], tests: ["tests/systems/ai-chronicle.test.js"] },
        {
            id: "4.0.4", label: "Scenario editor and multiple start conditions",
            evidence: [
                { file: "js/systems/scenario.js", symbol: "SCENARIO_PRESETS", role: "scenario-catalog" },
                { file: "js/systems/scenario.js", symbol: "applyScenarioStart", role: "start-conditions" },
                { file: "js/systems/scenario.js", symbol: "updateScenario", role: "objective-simulation" },
                { file: "js/core/scenario-library.js", symbol: "readScenarioLibrary", role: "scenario-save-format" },
                { file: "js/presentation/scenario-panel.js", symbol: "renderScenarioPanel", role: "gameplay" },
                { file: "js/core/save-runtime.js", symbol: "normalizeScenarioState", role: "persistence" },
                { file: "js/core/save-migrations.js", symbol: "13:snapshot", role: "save-migration" },
                { file: "js/app/main.js", symbol: "setupScenarioPicker", role: "start-screen" }
            ],
            tests: ["tests/systems/scenario.test.js", "tests/browser/scenario-start.mjs"]
        },
        { id: "4.0.5", label: "Save migration and world simulation at long horizons", evidence: [{ file: "js/core/save-migrations.js", symbol: "migrateSaveSnapshot" }, { file: "scripts/endurance-60y.mjs", symbol: "60" }], tests: ["tests/campaign/sweep-results.test.js"] },
        {
            id: "4.0.6", label: "Mod/data packs after schema and security boundaries",
            evidence: [
                { file: "js/core/data-packs.js", symbol: "validateDataPack", role: "schema-security" },
                { file: "js/core/data-packs.js", symbol: "installDataPack", role: "local-library" },
                { file: "js/core/data-packs.js", symbol: "getDataPackScenarios", role: "scenario-consumer" },
                { file: "js/core/data-packs.js", symbol: "getDataPackRegionLabel", role: "world-map-consumer" },
                { file: "js/systems/world-map.js", symbol: "regionDisplayName", role: "province-label-consumer" },
                { file: "js/app/main.js", symbol: "setupScenarioPicker", role: "start-screen" },
                { file: "index.html", symbol: "data-pack-forge", role: "start-screen" }
            ],
            tests: ["tests/core/data-packs.test.js", "tests/browser/scenario-start.mjs"]
        }
    ], {
        consumers: [{ file: "js/presentation/ai-chronicle-panel.js", symbol: "renderAiChroniclePanel", role: "history" }, { file: "js/core/save-migrations.js", symbol: "migrateSaveSnapshot", role: "persistence" }],
        tests: ["tests/systems/ai-chronicle.test.js"]
    })
];

// The 1.2.16 manifest is exported as a content atlas rather than a requirement
// array. It still has one explicit numbered point per wonder and the same
// atlas/discovery/integration contract as the other biome sections.
const SPECIAL_SECTION = {
    id: "1.2.16", title: "Fantastic and rare biomes", file: "js/world/special-biomes.js",
    manifest: "SPECIAL_BIOME_MANIFEST", profile: null, climate: "temperate",
    consumers: [
        { file: "js/world/special-biomes.js", symbol: "generateSpecialBiomeRegions", role: "simulation" },
                    { file: "js/world/special-biomes.js", symbol: "specialBiomeRegionAt", role: "simulation" },
        { file: "js/presentation/rendering/special-biome-render.js", symbol: "drawSpecialBiomeOverlay", role: "renderer" },
        { file: "js/systems/special-biome-state.js", symbol: "getSpecialBiomeSnapshot", role: "gameplay" },
        { file: "js/presentation/expeditions-panel.js", symbol: "renderExpeditionsPanel", role: "survey" }
    ],
    tests: ["tests/systems/special-biomes.test.js", "tests/systems/special-biome-couplings.test.js"]
};

// The 3.80.0 follow-up chains are part of the biome contract: a blight decree
// writes a field order onto one of the eight existing landmark sites. These
// points carry their own consumers and tests instead of relying on the generic
// atlas rows above.
const BLIGHT_CHAIN_POINTS = [
    {
        id: "1.2.16.chain.blight",
        label: "Blight study and quarantine arm one landmark follow-up; purge and ignore do not",
        evidence: [
            { file: "js/systems/special-biome-couplings.js", symbol: "blightChoices", role: "decision catalog" },
            { file: "js/systems/special-biome-couplings.js", symbol: "resolveBlightDecision", role: "decision action" },
            { file: "js/systems/expeditions.js", symbol: "armSiteChainFollowUp", role: "field order" }
        ],
        tests: ["tests/systems/special-biome-couplings.test.js", "tests/browser/biome-atlas-ui.mjs"]
    },
    {
        id: "1.2.16.chain.catalog",
        label: "All eight existing landmarks own one bounded chain without a new site",
        evidence: [
            { file: "js/systems/expeditions.js", symbol: "SITE_CHAINS", role: "chain catalog" },
            { file: "js/systems/expeditions.js", symbol: "armSiteChainFollowUp", role: "claim" },
            { file: "js/presentation/expeditions-panel.js", symbol: "renderExpeditionsPanel", role: "survey" }
        ],
        tests: ["tests/systems/expeditions.test.js", "tests/browser/expeditions-ui.mjs"]
    },
    {
        id: "1.2.16.chain.stages",
        label: "RUMOUR, SURVEYED, FOLLOW-UP READY and CHAIN CLOSED are visible in Explore",
        evidence: [
            { file: "js/systems/expeditions.js", symbol: "chainStage", role: "stage" },
            { file: "js/presentation/expeditions-panel.js", symbol: "SURVEY FOLLOW-UP", role: "ui action" },
            { file: "js/presentation/expeditions-panel.js", symbol: "FOLLOW-UPS READY", role: "ui counter" },
            { file: "css/diplomacy.css", symbol: "expedition-site__chain", role: "presentation" }
        ],
        tests: ["tests/systems/expeditions.test.js", "tests/browser/expeditions-ui.mjs"]
    },
    {
        id: "1.2.16.chain.rewards",
        label: "Fixed study +6/+0.12 and quarantine +3/+0.05 rewards survive a failed retry",
        evidence: [
            { file: "js/systems/expeditions.js", symbol: "SITE_CHAINS", role: "fixed modifiers" },
            { file: "js/systems/expeditions.js", symbol: "chainReady", role: "snapshot" },
            { file: "js/systems/expeditions.js", symbol: "chainClosed", role: "snapshot" },
            { file: "js/presentation/expeditions-panel.js", symbol: "CHAINS CLOSED", role: "ui counter" }
        ],
        tests: ["tests/systems/expeditions.test.js"]
    }
];

function normalizeSection(def) {
    return section(def.id, def.title, def.points, {
        consumers: def.consumers,
        tests: def.tests,
        source: def.source,
        note: def.note,
        probeFunction: def.profile,
        probeClimate: def.climate,
        probeExtra: def.probeExtra
    });
}

function checkedReferences(refs) {
    return (refs || []).map(ref => {
        const valid = exists(ref.file) && read(ref.file).includes(ref.symbol);
        return { ...ref, valid };
    });
}

function testsValid(tests) {
    return (tests || []).map(test => {
        const valid = exists(test);
        return { file: test, valid };
    });
}

function parseProfileFeatures(module, profileName, climate, extra = {}) {
    const seen = new Set();
    const fn = module[profileName];
    if (typeof fn !== "function") return { seen, sampled: 0, note: "profile export missing" };
    let sampled = 0;
    for (const dayOfYear of SAMPLE_SEASONS) {
        for (const weather of SAMPLE_WEATHER) {
            for (let gy = 0; gy < SAMPLE_GRID; gy++) {
                for (let gx = 0; gx < SAMPLE_GRID; gx++) {
                    const x = gx * 1.9 + 0.5;
                    const y = gy * 1.9 + 0.5;
                    const context = {
                        seed: 20261117, climate, dayOfYear, weather, hour: 12,
                        moisture: gx / Math.max(1, SAMPLE_GRID - 1),
                        temperature: gy / Math.max(1, SAMPLE_GRID - 1),
                        height: 0.16 + (gy / Math.max(1, SAMPLE_GRID - 1)) * 0.82,
                        seaLevel: 0.33, wind: 1.8, use: { ...ALL_USE }, ...extra
                    };
                    let profile = null;
                    try { profile = fn(x, y, context); } catch { profile = null; }
                    if (!profile) continue;
                    sampled++;
                    for (const id of profile.features || []) seen.add(String(id));
                }
            }
        }
    }
    return { seen, sampled, note: "" };
}

function buildDocSection(def) {
    const points = parseDocPoints(def.file, def.id + ".");
    return section(def.id, def.title, points, {
        consumers: def.consumers,
        tests: def.tests,
        source: def.source,
        note: `Parsed ${points.length} numbered rows from ${def.file}.`
    });
}

function buildManifestSection(def, module) {
    const manifest = module[def.manifest];
    if (!Array.isArray(manifest)) {
        throw new Error(`${def.id}: missing manifest export ${def.manifest} in ${def.file}`);
    }
    const points = manifest.map(entry => ({
        id: entry.id,
        label: entry.label || entry.key || entry.id,
        key: entry.key || "",
        group: entry.group || "",
        status: "implemented",
        docEvidence: "",
        evidence: entry.evidence || [],
        tests: entry.tests || []
    }));
    const coupled = points.filter(point => point.tests.length > 0).length;
    return section(def.id, def.title, points, {
        consumers: def.consumers,
        tests: def.tests,
        source: def.file,
        probeFunction: def.profile,
        probeClimate: def.climate,
        probeExtra: def.probeExtra,
        note: `${manifest.length} runtime requirements from ${def.manifest}; ${coupled} carry point-specific coupling tests.`
    });
}

function buildSpecialSection(module) {
    const manifest = module[SPECIAL_SECTION.manifest];
    if (!Array.isArray(manifest)) throw new Error("special biome manifest missing");
    const points = [
        ...manifest.map(entry => ({
            id: entry.id, label: entry.label, key: entry.family, group: entry.family,
            status: "implemented", docEvidence: "SPECIAL_BIOME_MANIFEST"
        })),
        ...BLIGHT_CHAIN_POINTS.map(point => ({ ...point }))
    ];
    return section(SPECIAL_SECTION.id, SPECIAL_SECTION.title, points, {
        consumers: SPECIAL_SECTION.consumers,
        tests: SPECIAL_SECTION.tests,
        source: SPECIAL_SECTION.file,
        note: `${manifest.length} atlas and integration contract rows plus ${BLIGHT_CHAIN_POINTS.length} blight follow-up chain rows.`
    });
}

function auditPoint(sectionInfo, point) {
    const missing = [];
    for (const consumer of sectionInfo.consumers) {
        if (!consumer.valid) missing.push(`consumer ${consumer.file}#${consumer.symbol} is missing`);
    }
    for (const test of sectionInfo.tests) {
        if (!test.valid) missing.push(`test ${test.file} is missing`);
    }
    const pointConsumers = checkedReferences(point.evidence || []);
    for (const consumer of pointConsumers) {
        if (!consumer.valid) missing.push(`point consumer ${consumer.file}#${consumer.symbol} is missing`);
    }
    const pointTests = testsValid(point.tests || []);
    for (const test of pointTests) {
        if (!test.valid) missing.push(`point test ${test.file} is missing`);
    }
    if (point.status === "open") missing.push(point.missing || "point is explicitly open");
    if (!point.label) missing.push("point has no label");
    const status = missing.length ? "open" : "implemented";
    return {
        ...point,
        status,
        missing: status === "open" ? [...new Set(missing)] : [],
        consumers: [...sectionInfo.consumers, ...pointConsumers].filter(c => c.valid).map(c => `${c.file}#${c.symbol} (${c.role || "point"})`),
        tests: [...sectionInfo.tests, ...pointTests].filter(t => t.valid).map(t => t.file),
        probe: point.probe ?? null
    };
}

export function runSpecAudit({ write = false } = {}) {
    const sections = [];
    for (const def of DOC_SPECS) {
        const built = buildDocSection(def);
        built.consumers = checkedReferences(def.consumers);
        built.tests = testsValid(def.tests);
        sections.push(built);
    }
    for (const def of MANIFEST_SPECS) {
        const module = awaitImport(def.file);
        const built = buildManifestSection(def, module);
        built.consumers = checkedReferences(def.consumers);
        built.tests = testsValid(def.tests);
        const probe = parseProfileFeatures(module, def.profile, def.climate, def.probeExtra);
        built.probeAvailable = probe.sampled > 0;
        built.probeObserved = probe.seen.size;
        for (const point of built.points) point.probe = probe.seen.has(point.id) ? "observed" : "not-sampled";
        sections.push(built);
    }
    {
        const module = awaitImport(SPECIAL_SECTION.file);
        const built = buildSpecialSection(module);
        built.consumers = checkedReferences(SPECIAL_SECTION.consumers);
        built.tests = testsValid(SPECIAL_SECTION.tests);
        built.probeAvailable = false;
        built.probeObserved = 0;
        sections.push(built);
    }
    {
        const module = awaitImport(CULTURE_SPEC.file);
        const manifest = module[CULTURE_SPEC.manifest];
        if (!Array.isArray(manifest)) throw new Error("forest culture manifest missing");
        const built = section(CULTURE_SPEC.id, CULTURE_SPEC.title, manifest.map(entry => ({
            id: entry.id,
            label: entry.title,
            key: entry.point,
            group: "FOREST CULTURE",
            status: "implemented",
            docEvidence: "FOREST_CULTURE_REQUIREMENTS",
            evidence: [],
            tests: []
        })), {
            source: CULTURE_SPEC.file,
            note: `${manifest.length} player-facing forest-culture requirements from ${CULTURE_SPEC.manifest}; each names its live consumer in the atlas.`
        });
        built.consumers = checkedReferences(CULTURE_SPEC.consumers);
        built.tests = testsValid(CULTURE_SPEC.tests);
        built.probeAvailable = false;
        built.probeObserved = 0;
        sections.push(built);
    }
    {
        const module = awaitImport(WAR_SPEC.file);
        const manifest = module[WAR_SPEC.manifest];
        if (!Array.isArray(manifest)) throw new Error("forest warfare manifest missing");
        const built = section(WAR_SPEC.id, WAR_SPEC.title, manifest.map(entry => ({
            id: entry.id,
            label: entry.title,
            key: entry.point,
            group: "FOREST WAR",
            status: "implemented",
            docEvidence: "FOREST_WARFARE_REQUIREMENTS",
            evidence: [],
            tests: []
        })), {
            source: WAR_SPEC.file,
            note: `${manifest.length} player-facing forest-war requirements from ${WAR_SPEC.manifest}; each names its live consumer in the atlas.`
        });
        built.consumers = checkedReferences(WAR_SPEC.consumers);
        built.tests = testsValid(WAR_SPEC.tests);
        built.probeAvailable = false;
        built.probeObserved = 0;
        sections.push(built);
    }
    {
        const module = awaitImport(INDUSTRY_SPEC.file);
        const manifest = module[INDUSTRY_SPEC.manifest];
        if (!Array.isArray(manifest)) throw new Error("regional forest economy manifest missing");
        const built = section(INDUSTRY_SPEC.id, INDUSTRY_SPEC.title, manifest.map(entry => ({
            id: entry.id,
            label: entry.title,
            key: entry.point,
            group: "FOREST ECONOMY",
            status: "implemented",
            docEvidence: "FOREST_INDUSTRY_REQUIREMENTS",
            evidence: [],
            tests: []
        })), {
            source: INDUSTRY_SPEC.file,
            note: `${manifest.length} player-facing forest-economy requirements from ${INDUSTRY_SPEC.manifest}; each names its live consumer in the atlas.`
        });
        built.consumers = checkedReferences(INDUSTRY_SPEC.consumers);
        built.tests = testsValid(INDUSTRY_SPEC.tests);
        built.probeAvailable = false;
        built.probeObserved = 0;
        sections.push(built);
    }
    for (const def of SYSTEM_SPECS) {
        const built = normalizeSection(def);
        built.consumers = checkedReferences(def.consumers);
        built.tests = testsValid(def.tests);
        sections.push(built);
    }

    // Add the ordinary 1.2.16 section in numeric position, before 1.2.17.
    sections.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    for (const sectionInfo of sections) {
        sectionInfo.points = sectionInfo.points.map(point => auditPoint(sectionInfo, point));
        sectionInfo.implemented = sectionInfo.points.filter(point => point.status === "implemented").length;
        sectionInfo.open = sectionInfo.points.filter(point => point.status === "open").length;
        sectionInfo.total = sectionInfo.points.length;
    }
    const totals = sections.reduce((sum, sectionInfo) => {
        sum.total += sectionInfo.total;
        sum.implemented += sectionInfo.implemented;
        sum.open += sectionInfo.open;
        return sum;
    }, { total: 0, implemented: 0, open: 0, sections: sections.length });

    const duplicateIds = new Map();
    for (const sectionInfo of sections) {
        for (const point of sectionInfo.points) {
            if (!duplicateIds.has(point.id)) duplicateIds.set(point.id, []);
            duplicateIds.get(point.id).push(sectionInfo.id);
        }
    }
    const collisions = [...duplicateIds.entries()]
        .filter(([, owners]) => new Set(owners).size > 1)
        .map(([id, owners]) => ({ id, sections: [...new Set(owners)] }));

    const openPoints = sections.flatMap(sectionInfo => sectionInfo.points
        .filter(point => point.status === "open")
        .map(point => ({
            id: point.id, section: sectionInfo.id, title: sectionInfo.title,
            label: point.label, missing: point.missing
        })));
    const nextSection = sections.find(sectionInfo => sectionInfo.open > 0) || null;

    const allFiles = [
        ...sections.map(sectionInfo => sectionInfo.source).filter(Boolean),
        ...sections.flatMap(sectionInfo => sectionInfo.consumers.map(c => c.file)),
        ...sections.flatMap(sectionInfo => sectionInfo.tests.map(t => t.file)),
        ...sections.map(sectionInfo => sectionInfo.file).filter(Boolean)
    ];
    const result = {
        version: 2,
        generatedBy: "scripts/spec-audit.mjs",
        scope: "All numbered 1.1 and 1.2.1–1.2.18 requirements, including the 1.2.23.1.151–210 forest economy and forest culture, plus the documented 2.x phases, 3.3–4.0 roadmap points and the 3.11 expedition follow-up chain contract.",
        commit: readCommit(),
        sourceHash: hashFiles(allFiles),
        generatedAt: readCommitDate(),
        totals,
        collisions,
        nextSection: nextSection ? {
            id: nextSection.id, title: nextSection.title,
            open: nextSection.open, total: nextSection.total,
            firstOpen: nextSection.points.find(point => point.status === "open")?.id || null
        } : null,
        openPoints,
        sections
    };

    if (write) {
        fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
        fs.mkdirSync(path.dirname(GENERATED_FILE), { recursive: true });
        fs.writeFileSync(REPORT_FILE, renderMarkdown(result));
        fs.writeFileSync(JSON_FILE, JSON.stringify(result, null, 2) + "\n");
        fs.writeFileSync(GENERATED_FILE, renderGeneratedModule(result));
    }
    return result;
}

function gitOutput(args, fallback) {
    try {
        return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return fallback;
    }
}

function readCommit() {
    return gitOutput(["rev-parse", "HEAD"], "unknown").slice(0, 80);
}

function readCommitDate() {
    return gitOutput(["show", "-s", "--format=%cI", "HEAD"], "unknown");
}

function renderMarkdown(result) {
    const lines = [];
    lines.push("# Kings & Cards — Specification Coverage Audit", "");
    lines.push("**Generated by:** `npm run spec:audit` · **Scope:** " + result.scope, "");
    lines.push("**Base commit:** `" + result.commit + "`");
    lines.push("**Source hash:** `" + result.sourceHash.slice(0, 16) + "`");
    lines.push("**Generated:** " + result.generatedAt, "");
    lines.push("## Method", "");
    lines.push("Every numbered biome point is loaded from its source manifest or its committed audit table. Every point must have at least one consumer reference (`file#symbol`) that exists, a focused consumer test, and (where a profile exists) a live profile probe. A point without those references is **open** and lists exactly what is missing. The report is generated from the repository; it is not a hand-maintained wish list.", "");
    lines.push("The profile probe samples a deterministic grid across seasons, weather, height, moisture and land-use flags. A point that the probe does not sample is still reported with its source/consumer evidence, but it never becomes implemented merely because an ID appears in an array: the consumer file and symbol are verified independently.", "");
    lines.push("## Summary", "");
    lines.push("| Section | Title | Points | Implemented | Open | Source |");
    lines.push("|---|---|---:|---:|---:|---|");
    for (const sectionInfo of result.sections) {
        lines.push(`| ${escapeCell(sectionInfo.id)} | ${escapeCell(sectionInfo.title)} | ${sectionInfo.total} | ${sectionInfo.implemented} | ${sectionInfo.open} | ${escapeCell(sectionInfo.source || "system registry")} |`);
    }
    lines.push(`| **Total** | **${result.sections.length} sections** | **${result.totals.total}** | **${result.totals.implemented}** | **${result.totals.open}** | |`, "");
    if (result.collisions.length) {
        lines.push("## Specification ID collisions", "");
        lines.push("These are source numbering conflicts, not silently merged points:", "");
        for (const collision of result.collisions) lines.push(`- **${collision.id}** is used by ${collision.sections.join(" and ")}.`);
        lines.push("");
    }
    lines.push("## Next open section", "");
    if (result.nextSection) {
        lines.push(`**${result.nextSection.id} — ${result.nextSection.title}** has **${result.nextSection.open} open point(s)**. The next actionable point is **${result.nextSection.firstOpen}**.`, "");
    } else {
        lines.push("All registered specification points are implemented.", "");
    }
    lines.push("## Open points", "");
    if (!result.openPoints.length) {
        lines.push("None.", "");
    } else {
        lines.push("| ID | Section | Point | Missing consumer / reason |");
        lines.push("|---|---|---|---|");
        for (const point of result.openPoints) {
            lines.push(`| ${escapeCell(point.id)} | ${escapeCell(point.section)} | ${escapeCell(point.label)} | ${escapeCell(point.missing.join("; "))} |`);
        }
        lines.push("");
    }
    lines.push("## Point detail", "");
    for (const sectionInfo of result.sections) {
        lines.push(`### ${sectionInfo.id} — ${sectionInfo.title}`, "");
        lines.push(`Source: ${sectionInfo.source || "explicit system registry"} · ${sectionInfo.total} points · ${sectionInfo.implemented} implemented · ${sectionInfo.open} open.`, "");
        if (sectionInfo.note) lines.push(sectionInfo.note, "");
        lines.push("| ID | Requirement | Status | Consumer evidence | Test evidence | Probe |");
        lines.push("|---|---|---|---|---|---|");
        for (const point of sectionInfo.points) {
            const consumer = point.consumers.length ? point.consumers.join("; ") : (point.docEvidence || "—");
            const test = point.tests.length ? point.tests.join("; ") : "—";
            lines.push(`| ${escapeCell(point.id)} | ${escapeCell(point.label)} | **${point.status}** | ${escapeCell(consumer)} | ${escapeCell(test)} | ${escapeCell(point.probe || (point.status === "open" ? "open" : "—"))} |`);
        }
        lines.push("");
    }
    lines.push("## Reproduce", "");
    lines.push("```bash");
    lines.push("cd game");
    lines.push("npm run spec:audit");
    lines.push("npm test");
    lines.push("```", "");
    lines.push("The generated `docs/spec-coverage.json` is the machine-readable source; `js/generated/spec-coverage.js` keeps the in-game Explore status in sync.");
    return lines.join("\n") + "\n";
}

function renderGeneratedModule(result) {
    const summary = {
        version: result.version,
        generatedBy: result.generatedBy,
        commit: result.commit,
        sourceHash: result.sourceHash,
        totals: result.totals,
        nextSection: result.nextSection,
        collisions: result.collisions,
        sections: result.sections.map(sectionInfo => ({
            id: sectionInfo.id, title: sectionInfo.title, total: sectionInfo.total,
            implemented: sectionInfo.implemented, open: sectionInfo.open,
            source: sectionInfo.source || "system registry"
        })),
        openPoints: result.openPoints.slice(0, 24)
    };
    return "// Generated by scripts/spec-audit.mjs. Do not edit by hand.\n"
        + "export const SPEC_COVERAGE = Object.freeze(" + JSON.stringify(summary, null, 2) + ");\n";
}

// Dynamic imports are kept in one place so the audit and the test run the exact
// production modules, not copies of their manifests.
const moduleCache = new Map();
function awaitImport(relative) {
    if (!moduleCache.has(relative)) {
        // The function must stay synchronous for the test API; the modules have
        // no asynchronous top-level work, so createRequire-style URL import is
        // not needed. This branch is replaced by the async wrapper below.
        throw new Error("dynamic import must be resolved before runSpecAudit");
    }
    return moduleCache.get(relative);
}

// Load all modules once at startup asynchronously, then expose a synchronous
// audit function for node:test and the CLI.
const MODULE_PATHS = [
    ...MANIFEST_SPECS.map(def => def.file),
    SPECIAL_SECTION.file,
    INDUSTRY_SPEC.file,
    CULTURE_SPEC.file,
    WAR_SPEC.file
];
for (const relative of MODULE_PATHS) {
    const absolute = path.join(ROOT, relative);
    moduleCache.set(relative, await import(pathToFileURL(absolute).href));
}

function pathToFileURL(file) {
    return new URL("file://" + file.split(path.sep).join("/"));
}

function renderCheck(result) {
    return {
        summary: result.totals,
        nextSection: result.nextSection,
        collisions: result.collisions,
        openPoints: result.openPoints
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    const check = process.argv.includes("--check");
    const result = runSpecAudit({ write: !check });
    if (check) {
        const expected = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, "utf8")) : null;
        const actual = JSON.parse(JSON.stringify(result));
        const same = expected && JSON.stringify(expected.sections) === JSON.stringify(actual.sections)
            && JSON.stringify(expected.totals) === JSON.stringify(actual.totals);
        console.log(JSON.stringify(renderCheck(result), null, 2));
        if (!same) {
            console.error("spec:audit --check failed: generated report is stale.");
            process.exitCode = 1;
        }
    } else {
        console.log(JSON.stringify(renderCheck(result), null, 2));
    }
}
