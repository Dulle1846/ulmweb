import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    BIOME_FOCUSES, BIOME_POLICIES, BIOME_PROFILES, BIOME_RESOURCES,
    BIOME_RESOURCE_BY_ID, BIOME_RESOURCE_REQUIREMENTS, BIOME_WILDLIFE,
    BIOME_WILDLIFE_BY_ID
} from "../../js/world/biome-resource-data.js";
import {
    forestPointTier, generateBiomeAtlas, getBiomeAtlasSnapshot, getBiomeEconomySnapshot,
    harvestBiomeResource, huntBiomeSpecies, normalizeBiomeAtlasState, restoreBiomeRegion,
    restoreBiomeAtlasState, sellBiomeGoods, serializeBiomeAtlasState, setBiomeFocus,
    setBiomePolicy, shouldDrawForestPoints, surveyBiomeRegion, syncBiomeDiscovery,
    updateBiomeAtlasAnnual, validateBiomeAtlasSnapshot
} from "../../js/systems/biome-resource-state.js";

const W = 160, H = 160, RES = 2, PIX = W * RES;

function contextForBands() {
    const heights = new Float32Array(PIX * PIX);
    const moistures = new Float32Array(PIX * PIX);
    const temperatures = new Float32Array(PIX * PIX);
    const bands = [
        { h: 0.2, m: 0.9, t: 0.7 },       // water
        { h: 0.345, m: 0.4, t: 0.7 },     // beach
        { h: 0.55, m: 0.55, t: 0.1 },     // snow
        { h: 0.86, m: 0.3, t: 0.5 },      // rock
        { h: 0.52, m: 0.5, t: 0.23 },     // tundra
        { h: 0.52, m: 0.55, t: 0.33 },    // taiga
        { h: 0.36, m: 0.86, t: 0.55 },    // swamp
        { h: 0.52, m: 0.2, t: 0.8 },      // desert
        { h: 0.52, m: 0.35, t: 0.65 },    // steppe
        { h: 0.52, m: 0.82, t: 0.56 },    // dense forest
        { h: 0.52, m: 0.55, t: 0.5 },     // forest
        { h: 0.5, m: 0.36, t: 0.5 }       // meadow
    ];
    for (let y = 0; y < PIX; y++) {
        const band = bands[Math.min(bands.length - 1, Math.floor(y / PIX * bands.length))];
        for (let x = 0; x < PIX; x++) {
            const index = y * PIX + x;
            heights[index] = band.h;
            moistures[index] = band.m;
            temperatures[index] = band.t;
        }
    }
    return {
        heights, moistures, temperatures, resolution: RES, pixW: PIX, pixH: PIX,
        sea: 0.33, width: W, height: H
    };
}

function setup(seed = 20261119) {
    resetState();
    state.worldSeed = seed;
    state.worldW = W;
    state.worldH = H;
    state.terrainResolution = RES;
    state.terrainPixW = PIX;
    state.terrainPixH = PIX;
    state.explored = Array.from({ length: W }, () => new Array(H).fill(false));
    return generateBiomeAtlas(seed, contextForBands());
}

function discoveredRegion(atlas) {
    return atlas.regions.find(region => region.discovered);
}

test("1.2.19 catalog: all 84 requirements and complete resource and wildlife families", () => {
    assert.equal(BIOME_RESOURCE_REQUIREMENTS.length, 84);
    assert.deepEqual(
        BIOME_RESOURCE_REQUIREMENTS.map(requirement => requirement.id),
        Array.from({ length: 84 }, (_, index) => "1.2.19." + (index + 1))
    );
    assert.equal(new Set(BIOME_RESOURCE_REQUIREMENTS.map(requirement => requirement.key)).size, 84);
    assert.ok(BIOME_RESOURCES.length >= 60, "the resource catalog must cover every requested material family");
    assert.ok(BIOME_WILDLIFE.length >= 20, "the wildlife catalog must cover ordinary and fantastic species");
    for (const resource of BIOME_RESOURCES) {
        assert.ok(Array.isArray(resource.biomes) && resource.biomes.length >= 2, resource.id + " needs several biomes");
        for (const biome of resource.biomes) assert.ok(BIOME_PROFILES[biome], resource.id + " references an unknown biome");
        assert.ok(resource.quality && typeof resource.quality === "object", resource.id + " needs quality sensitivities");
    }
    for (const species of BIOME_WILDLIFE) {
        assert.ok(species.biomes.length >= 1, species.id + " needs a habitat");
        assert.ok(Array.isArray(species.breeding) && species.breeding.length >= 1, species.id + " needs a breeding season");
        assert.ok(species.refuge && species.description, species.id + " needs refuge and ecology notes");
        if (species.role === "predator") assert.ok(species.prey.length >= 1, species.id + " needs prey");
    }
    const categories = new Set(BIOME_RESOURCES.map(resource => resource.category));
    for (const required of ["wood", "fruit", "herb", "spice", "fiber", "dye", "poison", "fungus", "resin",
        "fantastic-plant", "stone", "ore", "salt", "sulfur", "gem", "clay", "sand", "volcanic", "crystal",
        "special-mineral", "meat", "hide", "fur", "wool", "feather", "bone", "horn", "fish", "honey", "egg",
        "dairy", "rare-animal"]) {
        assert.ok(categories.has(required), "missing catalog category " + required);
    }
    assert.ok(BIOME_RESOURCES.some(resource => resource.strategic && resource.rare));
    assert.ok(BIOME_RESOURCES.some(resource => !resource.renewable));
    assert.ok(BIOME_WILDLIFE.some(species => species.fantastic && species.rare));
    assert.ok(BIOME_WILDLIFE.some(species => species.role === "pollinator"));
    assert.ok(BIOME_WILDLIFE.some(species => species.role === "engineer"));
    assert.ok(BIOME_WILDLIFE.some(species => species.role === "scavenger"));
    assert.ok(BIOME_WILDLIFE.some(species => species.role === "soil"));
    assert.ok(BIOME_WILDLIFE.some(species => species.role === "pest"));
});

test("1.2.19 generation is deterministic and creates distinct biome economies", () => {
    const first = setup(777);
    const firstSnapshot = serializeBiomeAtlasState();
    const firstBiomes = new Set(first.regions.map(region => region.rawBiome));
    assert.ok(first.regions.length === 36);
    assert.ok(firstBiomes.size >= 6, "the synthetic world should sample several different biomes");
    assert.ok(first.regions.some(region => region.resources.some(row => BIOME_RESOURCE_BY_ID[row.id]?.renewable)));
    assert.ok(first.regions.some(region => region.resources.some(row => BIOME_RESOURCE_BY_ID[row.id] && !BIOME_RESOURCE_BY_ID[row.id].renewable)));
    const second = setup(777);
    assert.deepEqual(serializeBiomeAtlasState(), firstSnapshot);
    const third = setup(778);
    assert.notDeepEqual(
        third.regions.map(region => region.resources.map(row => row.id).join(",")),
        second.regions.map(region => region.resources.map(row => row.id).join(","))
    );
});

test("1.2.19 preferred biomes, quality and rare deposits are honoured", () => {
    const atlas = setup(9012);
    for (const region of atlas.regions) {
        for (const row of region.resources) {
            const resource = BIOME_RESOURCE_BY_ID[row.id];
            if (!resource || resource.fauna) continue;
            assert.ok(resource.biomes.includes(region.rawBiome), row.id + " appeared outside a preferred biome");
            assert.ok(row.quality >= 0 && row.quality <= 100);
        }
    }
    const qualities = new Set(atlas.regions.map(region => region.quality));
    assert.ok(qualities.size > 3, "quality must vary by location");
    for (const region of atlas.regions) {
        const possible = BIOME_RESOURCES.filter(resource => resource.rare && !resource.fauna && resource.biomes.includes(region.rawBiome));
        if (possible.length) {
            assert.ok(region.resources.some(row => BIOME_RESOURCE_BY_ID[row.id]?.rare),
                region.rawBiome + " region " + region.id + " must offer one guaranteed rare site");
        }
    }
    const rare = atlas.regions.flatMap(region => region.resources
        .filter(row => BIOME_RESOURCE_BY_ID[row.id]?.rare && !BIOME_RESOURCE_BY_ID[row.id]?.fauna)
        .map(row => ({ region, row })));
    if (rare.length) {
        const example = rare[0];
        assert.equal(example.row.discovered, false, "rare deposits start hidden");
        example.region.discovered = true;
        state.resources.gold = 100;
        const surveyed = surveyBiomeRegion(example.region.id);
        assert.equal(surveyed.ok, true);
        assert.equal(example.row.discovered, false, "the first survey still keeps rare deposits hidden");
        const rareSurvey = surveyBiomeRegion(example.region.id);
        assert.equal(rareSurvey.ok, true);
        assert.equal(example.row.discovered, true, "the dedicated rare survey reveals rare deposits");
    }
});

test("1.2.19 discovery follows real exploration and all regions remain bounded", () => {
    const atlas = setup(3333);
    const hidden = atlas.regions.find(region => !region.discovered);
    assert.ok(hidden);
    for (let x = hidden.x; x < hidden.x + hidden.width; x++) {
        for (let y = hidden.y; y < hidden.y + hidden.height; y++) state.explored[x][y] = true;
    }
    const result = syncBiomeDiscovery({ silent: true });
    assert.ok(result.discovered >= 2);
    assert.equal(hidden.discovered, true);
    assert.ok(atlas.regions.length <= 36);
    assert.ok(atlas.regions.every(region => region.resources.length <= 24 && region.fauna.length <= 12));
});

test("1.2.19 seasonal stock, depletion, regeneration and non-renewable minerals", () => {
    const atlas = setup(4242);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 500;
    const renewable = region.resources.find(row => {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        return resource?.renewable && resource.seasons.includes(state.seasonIndex) && row.stock > 4;
    });
    assert.ok(renewable, "a renewable in-season resource must exist");
    const before = renewable.stock;
    const harvest = harvestBiomeResource(region.id, renewable.id);
    assert.equal(harvest.ok, true);
    assert.ok(renewable.stock < before, "harvesting depletes the stock");
    const afterHarvest = renewable.stock;
    setBiomePolicy(region.id, "conservation");
    state.year += 1;
    const annual = updateBiomeAtlasAnnual();
    assert.equal(annual.updated, true);
    assert.ok(renewable.stock > afterHarvest, "renewable stock must regenerate");
    const mineral = atlas.regions.flatMap(entry => entry.resources)
        .find(row => BIOME_RESOURCE_BY_ID[row.id] && !BIOME_RESOURCE_BY_ID[row.id].renewable && row.stock > 0);
    if (mineral) {
        const mineralBefore = mineral.stock;
        state.year += 1;
        updateBiomeAtlasAnnual();
        assert.ok(mineral.stock <= mineralBefore, "non-renewable mineral stock must not grow");
    }
    const outOfSeason = region.resources.find(row => {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        return resource && !resource.seasons.includes(state.seasonIndex) && row.stock > 0;
    });
    if (outOfSeason) {
        const blocked = harvestBiomeResource(region.id, outOfSeason.id);
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, "out-of-season");
    }
});

test("1.2.19 wildlife populations, predation, hunting and annual recovery", () => {
    const atlas = setup(5151);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.fauna) row.discovered = true;
    const predator = region.fauna.find(row => BIOME_WILDLIFE_BY_ID[row.id]?.role === "predator");
    const prey = region.fauna.find(row => row.id === "red-deer" || row.id === "hare" || row.id === "wildfowl");
    assert.ok(prey, "a herbivore must be generated");
    if (predator) {
        const species = BIOME_WILDLIFE_BY_ID[predator.id];
        assert.ok(species.prey.some(id => region.fauna.some(row => row.id === id)), "predator needs actual prey");
    }
    const target = region.fauna.find(row => row.population > 3);
    assert.ok(target);
    state.resources.gold = 300;
    const before = target.population;
    const hunt = huntBiomeSpecies(region.id, target.id);
    assert.equal(hunt.ok, true);
    assert.ok(target.population < before);
    setBiomePolicy(region.id, "conservation");
    state.year += 1;
    updateBiomeAtlasAnnual();
    assert.ok(target.population >= 0 && target.population <= target.capacity * 1.25);
    assert.ok(target.capacity > 0);
    assert.ok(target.breeding === true || target.breeding === false);
    assert.ok(target.migrating === true || target.migrating === false);
});

test("1.2.19 extraction, habitat restoration and rare-goods trade are real actions", () => {
    const atlas = setup(6161);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 400;
    state.resources.wood = 200;
    state.year = Math.max(2, state.year);
    const storedResource = region.resources.find(row => {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        return resource && !resource.yieldResource && resource.seasons.includes(state.seasonIndex) && row.stock > 3;
    });
    assert.ok(storedResource, "a tradeable non-ledger resource must exist");
    const harvest = harvestBiomeResource(region.id, storedResource.id);
    assert.equal(harvest.ok, true);
    assert.ok(storedResource.stored > 0);
    const sold = sellBiomeGoods(region.id, storedResource.id);
    assert.equal(sold.ok, true);
    assert.ok(sold.gold > 0);
    const woodBefore = state.resources.wood;
    const restored = restoreBiomeRegion(region.id);
    assert.equal(restored.ok, true);
    assert.equal(state.resources.wood, woodBefore - 8);
    const nextFocus = region.focus === "mining" ? "forestry" : "mining";
    assert.equal(setBiomeFocus(region.id, nextFocus).ok, true);
    assert.equal(region.focus, nextFocus);
    const focused = getBiomeEconomySnapshot();
    assert.ok(Array.isArray(focused.focusCounts ? Object.keys(focused.focusCounts) : []));
    assert.ok(focused.supplySecurity >= 0 && focused.supplySecurity <= 100);
    assert.ok(focused.productionCost > 0);
});

test("1.2.19 save round-trip preserves stocks, policies, discoveries and old saves remain safe", () => {
    const atlas = setup(7171);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 200;
    setBiomePolicy(region.id, "intensive");
    setBiomeFocus(region.id, "forestry");
    const snapshot = serializeBiomeAtlasState();
    const savedStock = region.resources[0].stock;
    const savedPolicy = region.policy;
    const savedDiscovered = atlas.regions.filter(entry => entry.discovered).length;
    region.resources[0].stock = 0;
    region.policy = "fallow";
    region.discovered = false;
    const restored = restoreBiomeAtlasState(snapshot);
    assert.ok(restored);
    const restoredRegion = restored.regions.find(entry => entry.id === region.id);
    assert.equal(restoredRegion.resources[0].stock, savedStock);
    assert.equal(restoredRegion.policy, savedPolicy);
    assert.equal(restored.regions.filter(entry => entry.discovered).length, savedDiscovered);
    assert.equal(normalizeBiomeAtlasState(undefined), restored);
    assert.throws(() => validateBiomeAtlasSnapshot({ version: 1, regions: [{ id: "bad" }] }));
    assert.throws(() => restoreBiomeAtlasState({ version: 1, regions: [{ id: "biome-00", policy: "nope", focus: "forestry", resources: [], fauna: [] }] }));
});

test("1.2.19 third detail level condenses forests into green survey points", () => {
    assert.equal(forestPointTier(3), 3);
    assert.equal(forestPointTier(4), 3);
    assert.equal(forestPointTier(2), 2);
    assert.equal(shouldDrawForestPoints(3, "biomes"), true);
    assert.equal(shouldDrawForestPoints(1, "biomes"), false);
    assert.equal(shouldDrawForestPoints(3, "terrain"), false);
    assert.ok(BIOME_POLICIES.sustainable && BIOME_POLICIES.intensive && BIOME_POLICIES.conservation && BIOME_POLICIES.fallow);
    assert.ok(BIOME_FOCUSES.forestry && BIOME_FOCUSES.mining && BIOME_FOCUSES.fishing);
});
