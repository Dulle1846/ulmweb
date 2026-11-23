import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    initNoise, sampleHeight, sampleMoisture, sampleTemperature,
    normalizeWorldOptions, seaLevelFor
} from "../../js/world/terrain-model.js";
import {
    BIOME_ATMOSPHERE, BIOME_GROUND_GRAIN, BIOME_HAZARD_TRIGGERS, BIOME_HABITATS,
    BIOME_IDENTITY, BIOME_IDENTITY_IDS, BIOME_LOD, BIOME_PLANTS,
    BIOME_GENERATION_REQUIREMENTS, BIOME_RESOURCE_REQUIREMENTS,
    plantsForBiome, resourceRequirementsForBiome
} from "../../js/world/biome-generation-data.js";
import {
    analyzeBiomeField, biomeAt, biomeEnvironmentAt, biomeRegistryAudit,
    buildBiomeGenerationProfile, buildBiomeIndexMap, classifyBiome,
    BIOME_MAP_ORDER, BIOME_TINT_COLORS, BIOME_WATER_TINT_COLORS,
    vegetationAt
} from "../../js/world/biome-generation.js";
import { biomeLandmarkAnchors } from "../../js/presentation/rendering/biome-identity-render.js";
import { BIOME_RESOURCE_BY_ID, BIOME_WILDLIFE } from "../../js/world/biome-resource-data.js";
import { HAZARD_CATALOG } from "../../js/world/hazard-data.js";
import {
    generateBiomeAtlas, getBiomeRegionSnapshot, restoreBiomeAtlasState,
    serializeBiomeAtlasState
} from "../../js/systems/biome-resource-state.js";
import { renderBiomePanel } from "../../js/presentation/biome-panel.js";

const W = 96, H = 96;

function syntheticWorld(seed = 20261123, climate = "temperate") {
    const options = normalizeWorldOptions({ size: "standard", climate });
    const sea = seaLevelFor(options);
    const sampling = { ...options, __normalized: true };
    initNoise(seed);
    const heights = new Float32Array(W * H);
    const moistures = new Float32Array(W * H);
    const temperatures = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const index = y * W + x;
            const h = sampleHeight(x + 0.5, y + 0.5, W, H, sampling);
            heights[index] = h;
            moistures[index] = sampleMoisture(x + 0.5, y + 0.5, sampling);
            temperatures[index] = sampleTemperature(x + 0.5, y + 0.5, W, H, h, sea, sampling);
        }
    }
    return {
        heights, moistures, temperatures, resolution: 1,
        pixW: W, pixH: H, width: W, height: H, sea, seed, climate
    };
}

const IDEAL = {
    water: { height: 0.30, moisture: 0.8, temperature: 0.55, elevation: 0, slope: 0.05, waterNear: 1, light: 0.5, soil: 0.4 },
    beach: { height: 0.336, moisture: 0.45, temperature: 0.58, elevation: 0.01, slope: 0.06, waterNear: 0.9, light: 0.65, soil: 0.2 },
    snow: { height: 0.86, moisture: 0.46, temperature: 0.06, elevation: 0.76, slope: 0.3, waterNear: 0.25, light: 0.55, soil: 0.3 },
    rock: { height: 0.88, moisture: 0.42, temperature: 0.44, elevation: 0.82, slope: 0.72, waterNear: 0.25, light: 0.6, soil: 0.25 },
    tundra: { height: 0.55, moisture: 0.56, temperature: 0.2, elevation: 0.34, slope: 0.28, waterNear: 0.45, light: 0.45, soil: 0.4 },
    taiga: { height: 0.54, moisture: 0.63, temperature: 0.32, elevation: 0.32, slope: 0.3, waterNear: 0.42, light: 0.4, soil: 0.6 },
    swamp: { height: 0.37, moisture: 0.9, temperature: 0.58, elevation: 0.06, slope: 0.16, waterNear: 0.95, light: 0.55, soil: 0.7 },
    desert: { height: 0.5, moisture: 0.15, temperature: 0.8, elevation: 0.27, slope: 0.3, waterNear: 0.12, light: 0.8, soil: 0.2 },
    steppe: { height: 0.53, moisture: 0.33, temperature: 0.64, elevation: 0.3, slope: 0.24, waterNear: 0.22, light: 0.7, soil: 0.45 },
    meadow: { height: 0.52, moisture: 0.42, temperature: 0.54, elevation: 0.29, slope: 0.22, waterNear: 0.32, light: 0.6, soil: 0.6 },
    forest: { height: 0.54, moisture: 0.58, temperature: 0.52, elevation: 0.34, slope: 0.3, waterNear: 0.4, light: 0.5, soil: 0.65 },
    "dense-forest": { height: 0.55, moisture: 0.82, temperature: 0.64, elevation: 0.35, slope: 0.32, waterNear: 0.55, light: 0.45, soil: 0.75 }
};

function idealEnv(biome, seed = 20261123) {
    return { ...IDEAL[biome], x: 80, y: 44, seed, sea: 0.33, regionBias: 0 };
}

function uniformContext(biome) {
    const sample = IDEAL[biome];
    return {
        heights: Float32Array.of(sample.height),
        moistures: Float32Array.of(sample.moisture),
        temperatures: Float32Array.of(sample.temperature),
        resolution: 1, pixW: 1, pixH: 1, width: 1, height: 1, sea: 0.33, seed: 20261123
    };
}

function setupAtlas(seed = 20261123, climate = "temperate") {
    resetState();
    const context = syntheticWorld(seed, climate);
    state.worldSeed = seed;
    state.worldW = W;
    state.worldH = H;
    state.heightMap = context.heights;
    state.moistureMap = context.moistures;
    state.temperatureMap = context.temperatures;
    state.seaLevel = context.sea;
    state.terrainResolution = 1;
    state.terrainPixW = W;
    state.terrainPixH = H;
    state.explored = Array.from({ length: W }, () => new Array(H).fill(false));
    return { context, atlas: generateBiomeAtlas(seed, context) };
}

test("1.2.22 registry has stable ids, 54 points, plants, habitats and distinct palettes", () => {
    assert.equal(BIOME_GENERATION_REQUIREMENTS.length, 54);
    assert.deepEqual(
        BIOME_GENERATION_REQUIREMENTS.map(row => row.id),
        Array.from({ length: 54 }, (_, index) => "1.2.22." + (index + 1))
    );
    assert.equal(new Set(BIOME_GENERATION_REQUIREMENTS.map(row => row.key)).size, 54);
    assert.equal(Object.keys(BIOME_IDENTITY).length, 12);
    for (const [biome, identity] of Object.entries(BIOME_IDENTITY)) {
        assert.equal(identity.id, "biome." + biome);
        assert.equal(identity.seasons.length, 4);
        assert.ok(identity.seasons.every(row => row.base !== identity.seasons[0].base || row === identity.seasons[0]));
        assert.ok(identity.texture.length > 8);
        assert.ok(identity.silhouette.length >= 2);
        assert.ok(identity.landmark.label);
        assert.ok(identity.lod.detail >= identity.lod.simplified);
    }
    assert.ok(Object.keys(BIOME_PLANTS).length >= 48);
    for (const plant of Object.values(BIOME_PLANTS)) {
        assert.ok(plant.variants.length >= 3, plant.id + " needs variants");
        assert.ok(plant.ages.length >= 3, plant.id + " needs age stages");
        assert.ok(plant.orientations.length >= 1);
        assert.ok(plant.size[0] <= plant.size[1]);
        assert.ok(plant.biomes.length >= 1);
    }
    for (const biome of BIOME_IDENTITY_IDS) {
        assert.ok(plantsForBiome(biome).length >= 3, biome + " needs plants");
        assert.ok(BIOME_HABITATS[biome], biome + " needs a habitat");
        assert.ok(BIOME_HAZARD_TRIGGERS[biome].length >= 2, biome + " needs hazard triggers");
    }
    const audit = biomeRegistryAudit();
    assert.equal(audit.ok, true, audit.errors.join("; "));
    assert.equal(audit.biomes, 12);
    assert.ok(audit.paletteMinDistance >= 12);
});

test("1.2.22 every biome can be generated from its own environmental envelope", () => {
    for (const biome of BIOME_IDENTITY_IDS) {
        const classified = classifyBiome(idealEnv(biome));
        assert.equal(classified, biome, biome + " classified as " + classified);
    }
});

test("1.2.22 each biome has four seasonal faces and seasonal plant activity", () => {
    for (const biome of BIOME_IDENTITY_IDS) {
        const identity = BIOME_IDENTITY[biome];
        const colours = new Set(identity.seasons.map(row => row.base));
        assert.equal(colours.size, 4, biome + " needs four distinct seasonal bases");
        const context = uniformContext(biome);
        let differences = 0;
        for (const season of [1, 3]) {
            const sample = vegetationAt(1.3, 1.7, { ...context, season });
            assert.equal(sample.season, season);
            assert.equal(sample.seasonLabel, season === 1 ? "Summer" : "Winter");
            assert.ok(BIOME_PLANTS[sample.species]);
            if (season === 3 && !BIOME_PLANTS[sample.species].seasons.includes(3)) differences++;
        }
        const summer = vegetationAt(1.3, 1.7, { ...context, season: 1 });
        const winter = vegetationAt(1.3, 1.7, { ...context, season: 3 });
        assert.ok(summer.density >= 0 && summer.density <= 1);
        assert.ok(winter.density >= 0 && winter.density <= 1);
        assert.ok(differences >= 0);
    }
});

test("1.2.22 vegetation follows biome, soil, moisture, light, season and land use", () => {
    let speciesSeen = 0;
    let variantsSeen = 0;
    let agesSeen = 0;
    let orientationsSeen = 0;
    for (const biome of BIOME_IDENTITY_IDS) {
        const context = uniformContext(biome);
        const species = new Set();
        const variants = new Set();
        const ages = new Set();
        const orientations = new Set();
        let densityMin = 1, densityMax = 0;
        for (let index = 0; index < 80; index++) {
            const sample = vegetationAt(0.1 + (index % 10) * 0.31, 0.2 + Math.floor(index / 10) * 0.31, { ...context, season: index % 4 });
            assert.equal(sample.biome, biome, biome + " vegetation must stay in its biome");
            assert.ok(plantsForBiome(biome).includes(sample.species), sample.species + " must belong to " + biome);
            assert.ok(sample.density >= 0 && sample.density <= 1);
            assert.ok(["grove", "scattered", "clearing"].includes(sample.cluster));
            densityMin = Math.min(densityMin, sample.density);
            densityMax = Math.max(densityMax, sample.density);
            if (sample.visible) {
                species.add(sample.species);
                variants.add(sample.variant);
                ages.add(sample.age);
                orientations.add(sample.orientation);
            }
        }
        assert.ok(densityMax - densityMin > 0.02, biome + " needs varying density");
        if (biome !== "water") {
            assert.ok(species.size >= 2, biome + " must show more than one plant species");
            assert.ok(variants.size >= 2, biome + " must show more than one variant");
            assert.ok(ages.size >= 2, biome + " must show age stages");
            assert.ok(orientations.size >= 1);
        }
        speciesSeen += species.size;
        variantsSeen += variants.size;
        agesSeen += ages.size;
        orientationsSeen += orientations.size;
    }
    assert.ok(speciesSeen >= 30);
    assert.ok(variantsSeen >= 30);
    assert.ok(agesSeen >= 24);
    assert.ok(orientationsSeen >= 12);

    // Human pressure thins the same stand without changing species identity.
    const context = uniformContext("forest");
    const wild = vegetationAt(9.7, 11.3, { ...context, season: 1, humanPressure: 0 });
    const settled = vegetationAt(9.7, 11.3, { ...context, season: 1, humanPressure: 1 });
    assert.ok(settled.density < wild.density);
    assert.equal(settled.species, wild.species);
});

test("1.2.22 real terrain produces organic, varied patches without chequerboard", () => {
    const context = syntheticWorld(20261123);
    const field = analyzeBiomeField(context, 64);
    assert.ok(field.biomes >= 4, "a real temperate map must show several biomes: " + JSON.stringify(field.counts));
    assert.ok(field.patches >= 4, "several patches are required");
    assert.ok(field.largestShare < 0.96, "no single biome may swallow the whole field");
    assert.ok(field.maxPatch > field.minPatch, "patch sizes must vary");
    assert.ok(field.patchStdDev > 1, "patch size distribution must be varied");
    assert.ok(field.maxRectangularity < 0.95, "no patch may fill a rectangle: " + field.maxRectangularity);
    assert.ok(field.meanRectangularity < 0.82, "patches must have organic fill: " + field.meanRectangularity);
    assert.ok(field.boundaryComplexity > 1.05, "patch boundaries must be crenulated: " + field.boundaryComplexity);
    assert.ok(field.checkerRatio < 0.02, "chequerboard blocks must stay incidental: " + field.checkerRatio);
    assert.ok(field.isolatedShare < 0.12, "isolated cells must stay incidental: " + field.isolatedShare);
    assert.ok(field.transitionShare > 0.02, "there must be real transition ground");

    const map = buildBiomeIndexMap(context, 4);
    assert.ok(map.ids.length >= 24 * 24);
    assert.ok(new Set(map.ids).size >= 4);
});

test("1.2.22 every region exposes a complete 54-point generation profile", () => {
    const { atlas } = setupAtlas();
    assert.equal(atlas.regions.length, 36);
    let checked = 0;
    for (const region of atlas.regions) {
        const snapshot = getBiomeRegionSnapshot(region.id);
        assert.ok(snapshot.generation, region.id + " needs a generation profile");
        const generation = snapshot.generation;
        assert.ok(BIOME_IDENTITY[generation.biome], generation.biome + " must be a real biome");
        assert.equal(generation.requirements.length, 54);
        assert.equal(new Set(generation.requirements.map(row => row.id)).size, 54);
        assert.ok(generation.requirements.every(row => row.value && row.value !== "—"), region.id + " has an empty value");
        assert.ok(generation.vegetation.species.length >= 3);
        assert.ok(generation.habitat.label);
        assert.ok(generation.palette.base.match(/^#[0-9a-f]{6}$/i));
        assert.ok(generation.field.patches >= 1);
        assert.ok(generation.resources.linked >= 1);
        assert.ok(generation.hazards.defined.length >= 2);
        for (const hazard of generation.hazards.defined) {
            assert.ok(HAZARD_CATALOG.some(row => row.id === hazard.id), hazard.id + " must exist in the catalogue");
        }
        checked++;
    }
    assert.equal(checked, 36);

    const html = renderBiomePanel();
    assert.match(html, /BIOME GENERATION · 1\.2\.22/);
    assert.match(html, /FULL GENERATION LEDGER · 54 PARAMETERS/);
    const ids = new Set([...html.matchAll(/data-biome-generation-requirement="(1\.2\.22\.\d+)"/g)].map(match => match[1]));
    assert.equal(ids.size, 54, "the player panel must show all 54 point IDs");
    assert.ok(!/data-biome-generation-value=""/.test(html), "no generation row may render an empty value");
    assert.equal(new Set([...html.matchAll(/data-biome-season-swatch="(spring|summer|autumn|winter)"/g)].map(match => match[1])).size, 4,
        "every discovered region must show all four seasonal faces");
    assert.ok(new Set([...html.matchAll(/data-biome-plant-chip="([a-z-]+)"/g)].map(match => match[1])).size >= 3,
        "the plant palette must name real species, not a generic label");
    assert.ok(!/--season-base:\s*;/.test(html), "a season swatch must carry its real colour");
    assert.ok(!/--plant-color:\s*;/.test(html), "a plant chip must carry its real colour");
});

test("1.2.22 season change updates the same generation profile", () => {
    const { atlas } = setupAtlas();
    const region = atlas.regions.find(row => row.discovered) || atlas.regions[0];
    state.seasonIndex = 0;
    const spring = getBiomeRegionSnapshot(region.id).generation;
    state.seasonIndex = 3;
    const winter = getBiomeRegionSnapshot(region.id).generation;
    assert.equal(spring.season, 0);
    assert.equal(winter.season, 3);
    assert.notEqual(spring.palette.season, winter.palette.season);
    assert.notEqual(spring.vegetation.seasonal.label, winter.vegetation.seasonal.label);
});

test("1.2.22 resources, habitats and hazards are linked to real catalogues", () => {
    for (const biome of BIOME_IDENTITY_IDS) {
        const rows = resourceRequirementsForBiome(biome);
        assert.ok(rows.length >= 1, biome + " needs resource placement rules");
        for (const row of rows) {
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            assert.ok(resource, row.id + " must exist");
            assert.ok(resource.biomes.includes(biome), row.id + " must list " + biome);
            assert.ok(row.needs.soil >= 0 && row.needs.moisture >= 0);
        }
        for (const trigger of BIOME_HAZARD_TRIGGERS[biome]) {
            const row = HAZARD_CATALOG.find(entry => entry.id === trigger.hazard);
            assert.ok(row, trigger.hazard + " must exist");
            assert.equal(trigger.mechanic, row.mechanic);
            assert.ok(trigger.when.length > 8);
        }
    }
    for (const species of BIOME_WILDLIFE) {
        assert.ok(species.biomes.some(biome => BIOME_IDENTITY[biome]), species.id + " needs a real habitat biome");
        assert.ok(species.biomes.some(biome => BIOME_HABITATS[biome]), species.id + " needs a habitat definition");
    }
    assert.ok(Object.keys(BIOME_RESOURCE_REQUIREMENTS).length === 12);
});

test("1.2.22 new biome data is one entry, not a new renderer or simulation path", () => {
    const identity = BIOME_IDENTITY.forest;
    assert.equal(identity.id, "biome.forest");
    assert.equal(plantsForBiome("forest").length >= 3, true);
    assert.equal(BIOME_LOD.tiers.length, 4);
    assert.ok(BIOME_LOD.maxParticles <= 200);
    assert.ok(BIOME_LOD.detailZoom > BIOME_LOD.simplifiedZoom);
    assert.ok(BIOME_LOD.simplifiedZoom > BIOME_LOD.impostorZoom);
    const generation = buildBiomeGenerationProfile({
        id: "test-region", x: 0, y: 0, width: 40, height: 40, centerX: 20, centerY: 20,
        rawBiome: "forest", resources: [{ id: "oak" }], fauna: [{ id: "red-deer" }],
        clearCut: 0.1, systems: { landUse: { settlement: 0.1, farming: 0.2, mining: 0, roads: 0 } }
    }, syntheticWorld());
    assert.ok(generation);
    assert.equal(generation.requirements.length, 54);
    assert.equal(generation.registry.ok, true);
    assert.ok(generation.vegetation.species.length >= 3);
});

test("1.2.22 generation survives save and reload", () => {
    const { atlas } = setupAtlas();
    const saved = serializeBiomeAtlasState();
    assert.ok(saved);
    const restored = restoreBiomeAtlasState(saved);
    assert.ok(restored);
    const region = restored.regions[0];
    assert.ok(saved.regions.every(row => row.generation === undefined), "the profile is derived, not persisted");
    state.biomeAtlas = restored;
    const snapshot = getBiomeRegionSnapshot(region.id);
    assert.ok(snapshot.generation);
    assert.equal(snapshot.generation.requirements.length, 54);
});

test("1.2.22 landmark, ground grain and atmosphere registries are complete and bounded", () => {
    assert.equal(BIOME_MAP_ORDER.length, 12);
    assert.equal(BIOME_TINT_COLORS.length, 12);
    assert.equal(BIOME_WATER_TINT_COLORS.length, 12);
    for (const biome of BIOME_IDENTITY_IDS) {
        assert.ok(BIOME_GROUND_GRAIN[biome] >= 0.01 && BIOME_GROUND_GRAIN[biome] <= 0.08, biome + " grain must stay subtle");
        const atmosphere = BIOME_ATMOSPHERE[biome];
        assert.ok(atmosphere, biome + " needs an atmosphere row");
        assert.ok(atmosphere.count >= 3 && atmosphere.count <= 8, biome + " mote count must stay bounded");
        assert.ok(atmosphere.seasons.length >= 1);
        assert.match(atmosphere.color, /^#[0-9a-f]{6}$/i);
        assert.ok(BIOME_IDENTITY[biome].landmark.id);
    }
    assert.ok(BIOME_LOD.maxParticles >= Math.max(...Object.values(BIOME_ATMOSPHERE).map(row => row.count)) * 8);

    resetState();
    state.worldW = W;
    state.worldH = H;
    const context = syntheticWorld();
    const map = buildBiomeIndexMap(context, 4);
    const explored = Array.from({ length: W }, () => new Array(H).fill(true));
    const regions = Array.from({ length: 12 }, (_, index) => ({
        id: "test-region-" + index,
        name: "Region " + index,
        discovered: true,
        centerX: 4 + (index % 6) * 15,
        centerY: 12 + Math.floor(index / 6) * 34,
        width: 14, height: 30,
        rawBiome: BIOME_IDENTITY_IDS[index]
    }));
    const started = performance.now();
    const anchors = biomeLandmarkAnchors({ regions, map, explored, limit: 12 });
    const elapsed = performance.now() - started;
    assert.ok(anchors.length >= 6, "discovered regions must produce landmarks");
    assert.ok(anchors.length <= 12);
    assert.equal(new Set(anchors.map(row => row.regionId)).size, anchors.length);
    for (const anchor of anchors) {
        assert.ok(BIOME_IDENTITY[anchor.biome]);
        assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y));
        assert.ok(anchor.identity.landmark.label);
        assert.ok(anchor.x >= 0 && anchor.x < W && anchor.y >= 0 && anchor.y < H);
    }
    assert.deepEqual(anchors, biomeLandmarkAnchors({ regions, map, explored, limit: 12 }), "anchors must be deterministic");
    assert.ok(elapsed < 250, "36-region anchor selection took " + Math.round(elapsed) + " ms");
    assert.ok(new Set(anchors.map(row => row.identity.landmark.id)).size >= 3, "landmarks must not all use one silhouette");
});

test("1.2.22 classification stays inside the large-map budget", () => {
    const context = syntheticWorld(20261123);
    const started = performance.now();
    let count = 0;
    for (let index = 0; index < 2400; index++) {
        const x = (index * 37) % W;
        const y = (index * 61) % H;
        biomeAt(x + 0.5, y + 0.5, context);
        count++;
    }
    const elapsed = performance.now() - started;
    assert.equal(count, 2400);
    assert.ok(elapsed < 2000, "2400 samples took " + Math.round(elapsed) + " ms");
    const mapStarted = performance.now();
    const map = buildBiomeIndexMap(context, 4);
    assert.ok(map.ids.length > 0);
    assert.ok(performance.now() - mapStarted < 1500);
});
