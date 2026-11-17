import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    BIOME_FOCUSES, BIOME_POLICIES, BIOME_PROFILES, BIOME_RESOURCES,
    BIOME_RESOURCE_BY_ID, BIOME_RESOURCE_FAMILY_BY_CATEGORY, BIOME_RESOURCE_MAP_FAMILIES,
    BIOME_RESOURCE_REQUIREMENTS, BIOME_WILDLIFE, BIOME_WILDLIFE_BY_ID, BIOME_CRAFT_RECIPE_BY_ID
} from "../../js/world/biome-resource-data.js";
import {
    beginBiomeDensityFrame, craftBiomeGoods, estimateBiomePotentialYield, forestCoverShareAt, forestPointTier, generateBiomeAtlas, getBiomeAtlasSnapshot, getBiomeDensityCells, getBiomeEconomySnapshot, getBiomeOverlayCells, getBiomeRegionSnapshot, getBiomeRegionTileSnapshot, getBiomeResourceTileSamples, getBiomeTileSampleStats,
    harvestBiomeResource, huntBiomeSpecies, normalizeBiomeAtlasState, reintroduceBiomeSpecies, restoreBiomeRegion,
    invalidateBiomeTileCache, restoreBiomeAtlasState, sellBiomeCraft, sellBiomeGoods, serializeBiomeAtlasState, setBiomeFocus,
    setBiomePolicy, setBiomeProtection, shouldDrawForestPoints, surveyBiomeRegion, syncBiomeDiscovery,
    updateBiomeAtlasAnnual, updateBiomeAtlasSeason, validateBiomeAtlasSnapshot
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
    const context = contextForBands();
    state.worldSeed = seed;
    state.worldW = W;
    state.worldH = H;
    state.heightMap = context.heights;
    state.moistureMap = context.moistures;
    state.temperatureMap = context.temperatures;
    state.seaLevel = context.sea;
    state.terrainResolution = RES;
    state.terrainPixW = PIX;
    state.terrainPixH = PIX;
    state.explored = Array.from({ length: W }, () => new Array(H).fill(false));
    return generateBiomeAtlas(seed, context);
}

function discoveredRegion(atlas) {
    return atlas.regions.find(region => region.discovered);
}

function ensureCoreCategories(region) {
    for (const category of ["wood", "stone", "food", "ore", "fiber", "herb", "salt"]) {
        const existing = region.resources.find(row => BIOME_RESOURCE_BY_ID[row.id]?.category === category);
        if (existing) {
            existing.discovered = true;
            continue;
        }
        const definition = BIOME_RESOURCES.find(resource => resource.category === category && !resource.fauna);
        if (!definition) continue;
        region.resources.push({
            id: definition.id, stock: 100, capacity: 100, quality: 70, stored: 0,
            discovered: true, locallyExtinct: false, lastHarvestYear: 0
        });
    }
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
        assert.equal(getBiomeAtlasSnapshot().surveyed, 0, "discovering a region is not a survey");
        const surveyed = surveyBiomeRegion(example.region.id);
        assert.equal(surveyed.ok, true);
        assert.equal(example.row.discovered, false, "the first survey still keeps rare deposits hidden");
        assert.equal(getBiomeAtlasSnapshot().surveyed, 1, "the first survey is counted once");
        const rareSurvey = surveyBiomeRegion(example.region.id);
        assert.equal(rareSurvey.ok, true);
        assert.equal(example.row.discovered, true, "the dedicated rare survey reveals rare deposits");
        assert.equal(getBiomeAtlasSnapshot().surveyed, 1, "the second survey does not double-count the region");
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
    assert.ok(harvest.tileQuality >= 8 && harvest.tileQuality <= 100);
    assert.ok(harvest.tileSuitability >= 0 && harvest.tileSuitability <= 1.3);
    assert.ok(storedResource.stored > 0);
    const sold = sellBiomeGoods(region.id, storedResource.id);
    assert.equal(sold.ok, true);
    assert.ok(sold.gold > 0);
    assert.equal(atlas.stats.rareSold, BIOME_RESOURCE_BY_ID[storedResource.id].rare ? sold.amount : 0,
        "the rare-goods counter must not claim ordinary goods");
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

test("1.2.19 focus, production cost, supply and imports change real harvest economics", () => {
    const atlas = setup(8181);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 10000;
    const wood = region.resources.find(row => BIOME_RESOURCE_BY_ID[row.id]?.category === "wood"
        && BIOME_RESOURCE_BY_ID[row.id]?.seasons.includes(state.seasonIndex) && row.stock > 20);
    assert.ok(wood, "the fixture needs an in-season timber row");
    // Isolate one resource so the annual potential check cannot be hidden by
    // rounding a dozen unrelated rows into the same whole number.
    region.resources = [wood];
    wood.discovered = true;
    const rowSnapshot = () => getBiomeRegionSnapshot(region.id).resources.find(row => row.id === wood.id);

    // A focused wood region must produce more timber and charge less gold for
    // the same harvest. The old UI-only focus did neither.
    setBiomeFocus(region.id, "forestry");
    const focusedSnapshot = rowSnapshot();
    const focusedPotential = estimateBiomePotentialYield();
    wood.stock = 100;
    const focusedHarvest = harvestBiomeResource(region.id, wood.id);
    assert.equal(focusedHarvest.ok, true);
    assert.equal(focusedHarvest.focusMatch, true);
    assert.ok(focusedSnapshot.focusMatch, "timber must be marked as a focus resource");

    setBiomeFocus(region.id, "mining");
    const unfocusedSnapshot = rowSnapshot();
    const unfocusedPotential = estimateBiomePotentialYield();
    wood.stock = 100;
    const unfocusedHarvest = harvestBiomeResource(region.id, wood.id);
    assert.equal(unfocusedHarvest.ok, true);
    assert.equal(unfocusedHarvest.focusMatch, false);
    assert.ok(focusedHarvest.amount > unfocusedHarvest.amount,
        "forestry focus must raise the timber harvest: " + focusedHarvest.amount + " vs " + unfocusedHarvest.amount);
    assert.ok(focusedHarvest.cost < unfocusedHarvest.cost,
        "forestry focus must lower the timber action cost: " + focusedHarvest.cost + " vs " + unfocusedHarvest.cost);
    assert.ok(focusedPotential > unfocusedPotential,
        "focus must raise annual potential output: " + focusedPotential + " vs " + unfocusedPotential);

    // Restore the core categories before testing import dependence.
    ensureCoreCategories(region);
    // Quality/vegetation create a real supply bonus; it must move both the
    // displayed economy and the harvest, not just the panel number.
    region.quality = 92;
    region.vegetation = 0.95;
    const richSnapshot = getBiomeRegionSnapshot(region.id);
    const richBonus = richSnapshot.economy.supplyBonus;
    wood.stock = 100;
    const richHarvest = harvestBiomeResource(region.id, wood.id);
    region.quality = 18;
    region.vegetation = 0.05;
    const poorSnapshot = getBiomeRegionSnapshot(region.id);
    const poorBonus = poorSnapshot.economy.supplyBonus;
    wood.stock = 100;
    const poorHarvest = harvestBiomeResource(region.id, wood.id);
    assert.ok(richBonus > poorBonus, "rich habitat must have the larger supply bonus");
    assert.ok(richHarvest.amount > poorHarvest.amount,
        "the supply bonus must raise the actual harvest: " + richHarvest.amount + " vs " + poorHarvest.amount);
    assert.ok(richHarvest.cost <= poorHarvest.cost,
        "the rich supply must not cost more per action");

    // Hiding local core categories raises real import dependence and makes
    // the same action more expensive. This is the cost side of scarcity.
    for (const row of region.resources) {
        if (row.id !== wood.id) row.discovered = false;
    }
    const importSnapshot = getBiomeRegionSnapshot(region.id);
    assert.ok(importSnapshot.economy.importDependency > 0, "missing categories must create import dependence");
    wood.stock = 100;
    const importHarvest = harvestBiomeResource(region.id, wood.id);
    assert.ok(importHarvest.cost >= poorHarvest.cost,
        "an import-dependent region must charge at least as much for the same action");
});

test("1.2.19 sale prices reflect scarcity, surplus, focus and import dependence", () => {
    const atlas = setup(8282);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    const wood = region.resources.find(row => BIOME_RESOURCE_BY_ID[row.id]?.category === "wood" && row.capacity > 20);
    assert.ok(wood);
    state.resources.gold = 1000;
    ensureCoreCategories(region);
    region.quality = 80;
    region.vegetation = 0.8;
    setBiomeFocus(region.id, "forestry");

    wood.stock = wood.capacity;
    wood.stored = 20;
    const surplus = sellBiomeGoods(region.id, wood.id);
    assert.equal(surplus.ok, true);
    wood.stock = 1;
    wood.stored = 20;
    const scarce = sellBiomeGoods(region.id, wood.id);
    assert.ok(scarce.market.unitPrice > surplus.market.unitPrice,
        "scarce stock must sell above a surplus: " + scarce.market.unitPrice + " vs " + surplus.market.unitPrice);

    wood.stock = 100;
    wood.stored = 20;
    setBiomeFocus(region.id, "mining");
    const offFocus = sellBiomeGoods(region.id, wood.id);
    wood.stock = 100;
    wood.stored = 20;
    setBiomeFocus(region.id, "forestry");
    const onFocus = sellBiomeGoods(region.id, wood.id);
    assert.ok(onFocus.market.unitPrice > offFocus.market.unitPrice,
        "a focused local good must earn a premium");

    for (const row of region.resources) if (row.id !== wood.id) row.discovered = false;
    wood.stock = 100;
    wood.stored = 20;
    const importPenalty = sellBiomeGoods(region.id, wood.id);
    assert.ok(importPenalty.market.unitPrice < onFocus.market.unitPrice,
        "import dependence must compress the sale margin: " + importPenalty.market.unitPrice + " vs " + onFocus.market.unitPrice
        + " (import " + importPenalty.market.importMargin + " vs " + onFocus.market.importMargin + ")");
    assert.ok(atlas.trade.gold > 0);
});

test("1.2.19 local recipes consume real region inputs and create a sellable good", () => {
    const atlas = setup(8383);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 2000;
    const craft = getBiomeRegionSnapshot(region.id).recipes.find(recipe => recipe.available);
    assert.ok(craft, "the fixture must expose at least one locally supplied recipe");
    const recipe = BIOME_CRAFT_RECIPE_BY_ID[craft.id];
    for (const input of recipe.inputs) {
        const row = region.resources.find(entry => BIOME_RESOURCE_BY_ID[entry.id]?.category === input.category);
        assert.ok(row, "recipe input category must exist locally: " + input.category);
        row.stock = Math.max(row.stock, input.amount + 20);
    }
    const beforeGold = state.resources.gold;
    const made = craftBiomeGoods(region.id, recipe.id);
    assert.equal(made.ok, true);
    assert.ok(made.cost > 0);
    assert.ok(state.resources.gold < beforeGold, "crafting must charge gold");
    assert.equal(region.crafted[recipe.outputId], 1);
    const afterCraft = getBiomeRegionSnapshot(region.id).recipes.find(entry => entry.id === recipe.id);
    assert.equal(afterCraft.stored, 1);

    const sold = sellBiomeCraft(region.id, recipe.id);
    assert.equal(sold.ok, true);
    assert.ok(sold.gold > 0);
    assert.equal(region.crafted[recipe.outputId], 0);

    const foreign = BIOME_CRAFT_RECIPE_BY_ID[Object.keys(BIOME_CRAFT_RECIPE_BY_ID).find(id => id !== recipe.id)];
    const rejected = craftBiomeGoods(region.id, foreign.id);
    assert.equal(rejected.ok, false);
    assert.ok(["craft-not-local", "missing-local-input"].includes(rejected.reason));
});

test("1.2.19 old saves default the new craft and cost fields and keep them across load", () => {
    const atlas = setup(8484);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 1000;
    const recipe = BIOME_CRAFT_RECIPE_BY_ID[Object.keys(BIOME_CRAFT_RECIPE_BY_ID).find(id =>
        getBiomeRegionSnapshot(region.id).recipes.some(entry => entry.id === id && entry.available))];
    assert.ok(recipe);
    for (const input of recipe.inputs) {
        const row = region.resources.find(entry => BIOME_RESOURCE_BY_ID[entry.id]?.category === input.category);
        row.stock = Math.max(row.stock, input.amount + 5);
    }
    assert.equal(craftBiomeGoods(region.id, recipe.id).ok, true);
    const saved = serializeBiomeAtlasState();
    assert.ok(saved.regions.find(entry => entry.id === region.id).crafted[recipe.outputId] > 0);
    const modern = JSON.parse(JSON.stringify(saved));
    const oldSave = JSON.parse(JSON.stringify(saved));
    delete oldSave.regions.find(entry => entry.id === region.id).crafted;
    delete oldSave.regions.find(entry => entry.id === region.id).productionCost;
    const restored = restoreBiomeAtlasState(oldSave);
    const restoredRegion = restored.regions.find(entry => entry.id === region.id);
    assert.deepEqual(restoredRegion.crafted, {}, "old saves get an empty craft store");
    assert.ok(restoredRegion.productionCost > 0, "old saves get a safe production cost default");
    const modernRestored = restoreBiomeAtlasState(modern).regions.find(entry => entry.id === region.id);
    assert.ok(modernRestored.crafted[recipe.outputId] > 0, "new craft stores survive save/load");
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

test("1.2.19 map dots keep a visible forest cover without harvestable timber", () => {
    setup();
    const capacity = new Uint16Array(W * H);
    const stock = new Uint16Array(W * H);
    state.resourceGeography = { forestCapacity: capacity, forestStock: stock };
    // The synthetic bands put forest across the lower-middle rows.
    assert.ok(forestCoverShareAt(10, 140) >= 0.18, "woodland without a resource stand still needs atlas points");
    assert.equal(forestCoverShareAt(10, 10), 0, "open water must stay free of forest points");
    const index = 140 * W + 10;
    capacity[index] = 100;
    stock[index] = 100;
    assert.equal(forestCoverShareAt(10, 140), 1, "a full stand keeps its own stock density");
    stock[index] = 20;
    assert.ok(forestCoverShareAt(10, 140) >= 0.18, "a logged stand keeps a visible survey footprint");
});

test("1.2.19 tile deposits, named diets, refuges and map markers are concrete", () => {
    const atlas = setup(9191);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    for (const row of region.fauna) row.discovered = true;
    const snapshot = getBiomeRegionSnapshot(region.id);
    for (const row of snapshot.resources) {
        assert.ok(Array.isArray(row.deposits) && row.deposits.length >= 1 && row.deposits.length <= 3,
            row.id + " needs concrete tile deposits");
        for (const site of row.deposits) {
            assert.ok(site.x >= region.x && site.x < region.x + region.width);
            assert.ok(site.y >= region.y && site.y < region.y + region.height);
        }
    }
    for (const row of snapshot.fauna) {
        assert.ok(Array.isArray(row.refuges) && row.refuges.length >= 1 && row.refuges.length <= 3,
            row.id + " needs concrete refuge sites");
        assert.ok(Array.isArray(row.diet) && row.diet.length >= 1, row.id + " needs a named diet");
        assert.ok(row.forage >= 0 && row.forage <= 1);
    }
    const cell = getBiomeOverlayCells().find(entry => entry.id === region.id);
    assert.ok(cell);
    assert.ok(cell.markers.length >= snapshot.resources.length, "discovered resources need map markers");
    assert.ok(cell.refuges.length >= snapshot.fauna.length, "discovered species need refuge markers");
});

test("1.2.19 seasonal migration moves real populations and records a route", () => {
    const atlas = setup(9292);
    const species = BIOME_WILDLIFE.find(entry => entry.migratory);
    assert.ok(species);
    const season = [0, 1, 2, 3].find(index => !species.breeding.includes(index));
    assert.ok(season >= 0);
    state.seasonIndex = season;
    const source = atlas.regions.find(region => region.fauna.some(row => row.id === species.id));
    assert.ok(source);
    source.discovered = true;
    source.quality = 8;
    source.vegetation = 0.05;
    source.water = 0.05;
    source.resources = [];
    const sourceRow = source.fauna.find(row => row.id === species.id);
    sourceRow.population = 60;
    sourceRow.capacity = 100;
    source.fauna = [sourceRow];
    const target = atlas.regions[source.index % 6 < 5 ? source.index + 1 : source.index - 1];
    target.discovered = true;
    target.quality = 100;
    target.vegetation = 1;
    target.water = 1;
    target.protectedArea = true;
    target.resources = [];
    const targetRow = {
        id: species.id, population: 10, baseCapacity: 100, capacity: 100, health: 80,
        breeding: false, migrating: false, pressure: 0, refugeSites: 1,
        refuges: [{ x: target.x + 2, y: target.y + 2, kind: "thicket" }], discovered: true
    };
    target.fauna = [targetRow];
    atlas.lastSeasonKey = 0;
    const before = sourceRow.population;
    const moved = updateBiomeAtlasSeason();
    assert.equal(moved.updated, true);
    assert.ok(moved.routes >= 1, "at least one migration route must be recorded");
    assert.ok(sourceRow.population < before, "the source population must fall");
    assert.ok(targetRow.population > 10, "the target population must grow");
    assert.ok(atlas.migration.some(route => route.species === species.id && route.from === source.id && route.to === target.id));

    const away = targetRow.population;
    const homeBefore = sourceRow.population;
    state.seasonIndex = species.breeding[0];
    atlas.lastSeasonKey = 0;
    const returned = updateBiomeAtlasSeason();
    assert.equal(returned.updated, true);
    assert.ok(targetRow.population < away, "the breeding season must return part of the herd");
    assert.ok(sourceRow.population > homeBefore, "the home region must receive the returning cohort");
    assert.ok(atlas.migration.some(route => route.returning === true
        && route.from === target.id && route.to === source.id && route.species === species.id));
});

test("1.2.19 protection blocks hunting, refuges soften quotas and clear-cut leaves erosion", () => {
    const atlas = setup(9393);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    for (const row of region.fauna) row.discovered = true;
    state.resources.gold = 5000;
    state.resources.wood = 100;
    const target = region.fauna.find(row => row.population > 4);
    assert.ok(target);
    assert.equal(setBiomeProtection(region.id, true).ok, true);
    assert.equal(region.protectedArea, true);
    const blocked = huntBiomeSpecies(region.id, target.id);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "protected-area");
    assert.equal(setBiomeProtection(region.id, false).ok, true);
    const hunted = huntBiomeSpecies(region.id, target.id);
    assert.equal(hunted.ok, true);
    assert.ok(hunted.protection <= 1);
    assert.ok(hunted.refugeSites >= 1);

    const wood = region.resources.find(row => BIOME_RESOURCE_BY_ID[row.id]?.kind === "wood");
    assert.ok(wood, "a woodland fixture is needed for clear-cut");
    wood.stock = 400;
    wood.capacity = 400;
    wood.baseCapacity = 400;
    region.resources = [wood];
    region.clearCut = 0;
    region.erosion = 0;
    for (let index = 0; index < 8; index++) {
        wood.stock = Math.max(wood.stock, 120);
        const cut = harvestBiomeResource(region.id, wood.id);
        assert.equal(cut.ok, true);
    }
    assert.ok(region.clearCut > 0, "repeated timber harvest must leave a clear-cut state");
    assert.ok(region.erosion >= 0);
    const beforeRestore = region.clearCut;
    const restored = restoreBiomeRegion(region.id);
    assert.equal(restored.ok, true);
    assert.ok(region.clearCut < beforeRestore, "restoration must reduce the clear-cut state");
    assert.equal(region.protectedArea, true, "restoration declares a protected habitat");

    const species = BIOME_WILDLIFE.find(entry => (entry.rare || entry.endangered) && entry.biomes.includes(region.rawBiome));
    assert.ok(species, "the fixture needs a rare species for reintroduction");
    let depleted = region.fauna.find(row => row.id === species.id);
    if (!depleted) {
        depleted = {
            id: species.id, population: 0, baseCapacity: 20, capacity: 20, health: 20,
            breeding: false, migrating: false, pressure: 0, refugeSites: 0, refuges: [], discovered: true
        };
        region.fauna.push(depleted);
    }
    depleted.population = 0;
    depleted.discovered = true;
    const sourceRegion = atlas.regions.find(entry => entry !== region);
    sourceRegion.discovered = true;
    sourceRegion.fauna = [{
        id: species.id, population: 50, baseCapacity: 100, capacity: 100, health: 80,
        breeding: false, migrating: false, pressure: 0, refugeSites: 1, refuges: [], discovered: true
    }];
    state.resources.gold = 100;
    const revived = reintroduceBiomeSpecies(region.id, species.id);
    assert.equal(revived.ok, true);
    assert.ok(depleted.population > 0, "reintroduction must release a real cohort");
    assert.equal(state.resources.gold, 80);
});

test("1.2.19 caravans pay for real stock transfers and reduce import dependence", () => {
    const atlas = setup(9494);
    const categories = ["wood", "stone", "ore", "fiber", "herb", "salt", "fruit"];
    const buyer = atlas.regions.find(region => {
        region.discovered = true;
        for (const row of region.resources) row.discovered = true;
        const present = new Set(region.resources.map(row => BIOME_RESOURCE_BY_ID[row.id]?.category));
        return categories.some(category => !present.has(category));
    });
    assert.ok(buyer, "a tested region must still have an import gap");
    const need = categories.find(category => !buyer.resources.some(row => BIOME_RESOURCE_BY_ID[row.id]?.category === category));
    assert.ok(need);
    const donor = atlas.regions.find(region => region !== buyer);
    donor.discovered = true;
    donor.fauna = [];
    donor.resources = categories.map(category => {
        const definition = BIOME_RESOURCES.find(resource => resource.category === category && !resource.fauna);
        return {
            id: definition?.id || "wood", stock: 100, baseCapacity: 100, capacity: 100,
            quality: 60, stored: 0, deposits: [], discovered: true, locallyExtinct: false, lastHarvestYear: 0
        };
    }).filter(row => row.id);
    state.resources.gold = 1000;
    state.year += 1;
    atlas.lastYear = state.year - 1;
    const beforeDependency = getBiomeRegionSnapshot(buyer.id).economy.importDependency;
    const beforeStock = donor.resources.find(row => BIOME_RESOURCE_BY_ID[row.id]?.category === need).stock;
    const result = updateBiomeAtlasAnnual();
    assert.equal(result.updated, true);
    assert.ok(result.caravans >= 1, "the annual pass must send at least one caravan");
    assert.ok(atlas.caravans.some(route => route.to === buyer.id && route.category === need));
    assert.ok(buyer.importCoverage.some(entry => entry.category === need));
    assert.ok(donor.resources.find(row => BIOME_RESOURCE_BY_ID[row.id]?.category === need).stock < beforeStock,
        "the donor stock must actually fall");
    assert.ok(getBiomeRegionSnapshot(buyer.id).economy.importDependency <= beforeDependency);
    assert.ok(atlas.trade.caravanSpend > 0);
});

test("1.2.19 save keeps tile deposits, refuges, import coverage and migration ledgers", () => {
    const atlas = setup(9595);
    const region = discoveredRegion(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    for (const row of region.fauna) row.discovered = true;
    const resource = region.resources[0];
    const fauna = region.fauna[0];
    region.importCoverage = [{ category: "wood", untilYear: 12 }];
    region.caravanImports = 7;
    region.protectedArea = true;
    region.clearCut = 0.4;
    region.erosion = 0.2;
    atlas.lastSeasonKey = 123;
    atlas.migration = [{ year: 4, season: 2, species: fauna.id, from: region.id, to: "biome-00", amount: 3 }];
    atlas.caravans = [{ year: 4, from: "biome-00", to: region.id, category: "wood", resource: resource.id, amount: 4, price: 6 }];
    const saved = serializeBiomeAtlasState();
    const savedRegion = saved.regions.find(entry => entry.id === region.id);
    assert.ok(savedRegion.resources[0].deposits.length >= 1);
    assert.ok(savedRegion.fauna[0].refuges.length >= 1);
    const restored = restoreBiomeAtlasState(saved);
    const restoredRegion = restored.regions.find(entry => entry.id === region.id);
    assert.deepEqual(restoredRegion.resources[0].deposits, savedRegion.resources[0].deposits);
    assert.deepEqual(restoredRegion.fauna[0].refuges, savedRegion.fauna[0].refuges);
    assert.deepEqual(restoredRegion.importCoverage, [{ category: "wood", untilYear: 12 }]);
    assert.equal(restoredRegion.caravanImports, 7);
    assert.equal(restoredRegion.protectedArea, true);
    assert.equal(restored.lastSeasonKey, 123);
    assert.equal(restored.migration[0].amount, 3);
    assert.equal(restored.caravans[0].price, 6);

    const oldSave = JSON.parse(JSON.stringify(saved));
    const oldRegion = oldSave.regions.find(entry => entry.id === region.id);
    delete oldRegion.protectedArea;
    delete oldRegion.importCoverage;
    delete oldRegion.caravanImports;
    delete oldRegion.clearCut;
    delete oldRegion.erosion;
    delete oldRegion.resources[0].deposits;
    delete oldRegion.resources[0].baseCapacity;
    delete oldRegion.fauna[0].refuges;
    delete oldSave.lastSeasonKey;
    delete oldSave.migration;
    delete oldSave.caravans;
    const migrated = restoreBiomeAtlasState(oldSave).regions.find(entry => entry.id === region.id);
    assert.ok(migrated.resources[0].deposits.length >= 1, "old saves receive deterministic tile deposits");
    assert.ok(migrated.fauna[0].refuges.length >= 1, "old saves receive real refuge sites");
    assert.deepEqual(migrated.importCoverage, []);
    assert.equal(migrated.protectedArea, false);
});

test("1.2.19.5 tile suitability is deterministic, bounded and drives the regional sample aggregate", () => {
    const atlas = setup(7717);
    const region = discoveredRegion(atlas);
    const row = region.resources.find(entry => entry.discovered) || region.resources[0];
    const first = getBiomeResourceTileSamples(region.id, row.id);
    assert.equal(first.ok, true);
    assert.equal(first.samples.length, 25);
    for (const sample of first.samples) {
        assert.ok(sample.x >= region.x && sample.x < region.x + region.width);
        assert.ok(sample.y >= region.y && sample.y < region.y + region.height);
        assert.ok(sample.suitability >= 0 && sample.suitability <= 1.3);
        assert.ok(sample.capacity >= 0);
        assert.ok(sample.quality >= 8 && sample.quality <= 100);
    }
    const capacitySum = first.samples.reduce((sum, sample) => sum + sample.capacity, 0);
    assert.ok(Math.abs(capacitySum - row.capacity) <= row.capacity * 0.03 + 25, "tile capacities preserve the region total");
    const second = getBiomeResourceTileSamples(region.id, row.id);
    assert.equal(second.cached, true);
    assert.deepEqual(second.samples, first.samples);

    const before = first.samples.map(sample => sample.suitability);
    region.soilHealth = Math.max(0.04, region.soilHealth - 0.2);
    row.capacity += 31;
    const changed = getBiomeResourceTileSamples(region.id, row.id);
    assert.equal(changed.cached, false, "a changed resource/ecology signature must miss the cache");
    assert.notDeepEqual(changed.samples.map(sample => sample.suitability), before);

    const aggregate = getBiomeRegionTileSnapshot(region.id);
    assert.equal(aggregate.ok, true);
    const beforeSurvey = getBiomeResourceTileSamples(region.id, row.id);
    state.resources.gold = 50;
    assert.equal(surveyBiomeRegion(region.id).ok, true);
    assert.equal(getBiomeResourceTileSamples(region.id, row.id).cached, false,
        "a survey must invalidate the tile cache even before the next density frame");
    assert.ok(beforeSurvey.samples.length === 25);
    assert.ok(aggregate.tileCapacity >= 0);
    assert.ok(aggregate.tileQuality >= 8 && aggregate.tileQuality <= 100);
    assert.ok(aggregate.resources.every(entry => entry.samples === 25));

    resetState();
    const fresh = setup(7717);
    const freshRegion = discoveredRegion(fresh);
    const freshRow = freshRegion.resources.find(entry => entry.discovered) || freshRegion.resources[0];
    const repeated = getBiomeResourceTileSamples(freshRegion.id, freshRow.id);
    assert.deepEqual(repeated.samples.map(sample => sample.suitability), first.samples.map(sample => sample.suitability),
        "the same seed must produce the same tile samples");
});

test("1.2.19.79 density cells are budgeted, clustered and never expose undiscovered rows", () => {
    const atlas = setup(8123);
    const region = discoveredRegion(atlas);
    ensureCoreCategories(region);
    invalidateBiomeTileCache();
    beginBiomeDensityFrame("density-start");
    const beforeStats = getBiomeTileSampleStats();
    const cells = getBiomeDensityCells("density-start");
    const afterStats = getBiomeTileSampleStats();
    assert.equal(cells.length, atlas.regions.filter(entry => entry.discovered).length);
    assert.ok(afterStats.cacheMisses > 0);
    assert.ok(afterStats.cacheMisses <= beforeStats.frameSize, "a frame may only force the fixed sample budget");
    assert.ok(afterStats.frameBudget >= 0);
    const cell = cells.find(entry => entry.id === region.id);
    assert.ok(cell.families.length >= 1);
    for (const family of cell.families) {
        assert.ok(BIOME_RESOURCE_MAP_FAMILIES[family.id]);
        assert.ok(family.value >= 0 && family.value <= 100);
        assert.ok(family.points.length <= 2, "detail points are clustered to a bounded set");
        for (const point of family.points) {
            assert.ok(point.x >= region.x && point.x < region.x + region.width);
            assert.ok(point.y >= region.y && point.y < region.y + region.height);
            assert.ok(point.value >= 0 && point.value <= 100);
        }
    }
    assert.ok(cell.families.some(family => family.id === "timber"), "the survey must show a discovered family");

    for (const row of region.resources) {
        const resource = BIOME_RESOURCE_BY_ID[row.id];
        if (resource && BIOME_RESOURCE_FAMILY_BY_CATEGORY[resource.category] === "timber") row.discovered = false;
    }
    invalidateBiomeTileCache();
    const hiddenCells = getBiomeDensityCells("density-hidden");
    const hiddenCell = hiddenCells.find(entry => entry.id === region.id);
    assert.ok(hiddenCell);
    assert.equal(hiddenCell.families.some(family => family.id === "timber"), false,
        "an undiscovered timber row must not leak through the density aggregate");

    for (const resource of BIOME_RESOURCES) {
        assert.ok(BIOME_RESOURCE_FAMILY_BY_CATEGORY[resource.category], resource.id + " needs a density family");
    }
    assert.deepEqual(Object.keys(BIOME_RESOURCE_MAP_FAMILIES).sort(), ["animal", "fiber", "fish", "flora", "stone", "timber"]);
});

test("1.2.19.5 tile samples survive a save round-trip without shifting old saves", () => {
    const atlas = setup(6621);
    const region = discoveredRegion(atlas);
    ensureCoreCategories(region);
    invalidateBiomeTileCache();
    beginBiomeDensityFrame("roundtrip-before");
    const before = getBiomeDensityCells("roundtrip-before").find(entry => entry.id === region.id);
    const beforeSamples = getBiomeResourceTileSamples(region.id, region.resources[0].id);
    const saved = serializeBiomeAtlasState();
    const restored = restoreBiomeAtlasState(saved);
    const restoredRegion = restored.regions.find(entry => entry.id === region.id);
    beginBiomeDensityFrame("roundtrip-after");
    const after = getBiomeDensityCells("roundtrip-after").find(entry => entry.id === region.id);
    const afterSamples = getBiomeResourceTileSamples(restoredRegion.id, restoredRegion.resources[0].id);
    assert.equal(afterSamples.samples.length, beforeSamples.samples.length);
    assert.ok(Math.abs(afterSamples.capacity - beforeSamples.capacity) <= Math.max(25, beforeSamples.capacity * 0.04));
    assert.deepEqual(after.families.map(family => family.id), before.families.map(family => family.id));

    const oldSave = JSON.parse(JSON.stringify(saved));
    const oldRegion = oldSave.regions.find(entry => entry.id === region.id);
    delete oldRegion.resources[0].discovered;
    const migrated = restoreBiomeAtlasState(oldSave).regions.find(entry => entry.id === region.id);
    assert.ok(migrated.resources.length > 0, "old saves still load their region rows");
    assert.equal(getBiomeResourceTileSamples(migrated.id, migrated.resources[0].id).samples.length, 25);
});
