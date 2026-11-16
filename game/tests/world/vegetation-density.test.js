import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    VEGETATION_DENSITY_BANDS, VEGETATION_REQUIREMENTS,
    getVegetationDensitySurvey, vegetationDensityAt, vegetationDetailForZoom,
    vegetationForestStand, vegetationGameplayAt, vegetationGrassProfile, __internals
} from "../../js/world/vegetation-density.js";

const SIZE = 64;
const SEED = 20261180;

function setup() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = SEED;
    state.worldW = SIZE;
    state.worldH = SIZE;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = SIZE;
    state.terrainPixH = SIZE;
    state.heightMap = new Float32Array(SIZE * SIZE);
    state.moistureMap = new Float32Array(SIZE * SIZE);
    state.temperatureMap = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const index = y * SIZE + x;
            state.heightMap[index] = 0.45 + ((x + y) % 20) * 0.006;
            state.moistureMap[index] = 0.08 + (x / (SIZE - 1)) * 0.86;
            state.temperatureMap[index] = 0.4 + (y / (SIZE - 1)) * 0.3;
        }
    }
    state.worldOptions = { climate: "temperate" };
    state.year = 4;
    state.dayOfYear = 150;
    return state;
}

function baseContext(overrides = {}) {
    return {
        seed: SEED,
        climate: "temperate",
        height: 0.55,
        moisture: 0.52,
        temperature: 0.55,
        dayOfYear: 150,
        year: 4,
        ...overrides,
    };
}

function grassProfile(overrides = {}) {
    return {
        bloom: 0.5,
        shrubPatches: 0.5,
        sward: { density: 0.6, height: "tall", tall: true },
        use: { grazed: true },
        trees: [{ kind: "hedge" }],
        ...overrides,
    };
}

function forestStand(overrides = {}) {
    return {
        forest: true,
        density: 0.75,
        canopy: 0.75,
        clearing: 0.05,
        treeChance: 0.7,
        visibility: 0.7,
        ageClass: "mature",
        browsingPressure: 0.4,
        type: "oakwood",
        understory: { fern: 0.4, bramble: 0.3, shrub: 0.35, grass: 0.2, herb: 0.2, sapling: 0.4 },
        ground: { logs: 0.4, stumps: 0.3, flowers: 0.2 },
        ...overrides,
    };
}

test("the 1.2.18 manifest contains exactly the seventy requested points", () => {
    assert.equal(VEGETATION_REQUIREMENTS.length, 70);
    assert.deepEqual(VEGETATION_REQUIREMENTS.map(entry => entry.id),
        Array.from({ length: 70 }, (_, index) => "1.2.18." + (index + 1)));
    assert.equal(new Set(VEGETATION_REQUIREMENTS.map(entry => entry.key)).size, 70);
    assert.equal(VEGETATION_DENSITY_BANDS.length, 5);
    assert.deepEqual(VEGETATION_DENSITY_BANDS.map(entry => entry.requirement), [1, 2, 3, 4, 5]);
    for (const entry of VEGETATION_REQUIREMENTS) {
        assert.ok(entry.label.length > 3, entry.id);
        assert.ok(entry.labelDe.length > 3, entry.id);
        assert.ok(entry.group.length > 2, entry.id);
    }
    assert.match(VEGETATION_REQUIREMENTS[0].labelDe, /Sehr geringe Vegetationsdichte/);
    assert.match(VEGETATION_REQUIREMENTS[30].labelDe, /Oasenvegetation/);
    assert.match(VEGETATION_REQUIREMENTS[69].labelDe, /Kameraentfernung/);
});

test("density is deterministic and forms all five bands inside the same landscape", () => {
    setup();
    const first = vegetationDensityAt(17.5, 22.5, baseContext());
    const second = vegetationDensityAt(17.5, 22.5, baseContext());
    assert.deepEqual(first, second);

    const bands = new Set();
    for (let index = 0; index < 80; index++) {
        const profile = vegetationDensityAt(1.5 + index * 1.7, 2.5 + index * 2.3, baseContext({
            moisture: 0.18 + (index % 20) * 0.04,
            temperature: 0.35 + (index % 12) * 0.04,
            height: 0.4 + (index % 8) * 0.03,
            dayOfYear: (index * 37) % 400,
        }));
        bands.add(profile.band);
        assert.equal(profile.activeCount, profile.requirements.length);
        assert.notEqual(profile.habitatLabel, "");
    }
    assert.deepEqual([...bands].sort(), [0, 1, 2, 3, 4]);
});

test("coherent groups and gaps replace even distribution", () => {
    setup();
    const values = [];
    for (let y = 0; y < 40; y++) {
        const row = [];
        for (let x = 0; x < 40; x++) {
            row.push(vegetationDensityAt(x + 0.5, y + 0.5, baseContext({
                moisture: 0.52, temperature: 0.55, height: 0.55,
            })).density);
        }
        values.push(row);
    }
    const flat = values.flat();
    const mean = flat.reduce((sum, value) => sum + value, 0) / flat.length;
    const variance = flat.reduce((sum, value) => sum + (value - mean) ** 2, 0) / flat.length;
    const coefficient = Math.sqrt(variance) / mean;
    let near = 0, nearCount = 0, far = 0, farCount = 0;
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
            if (x < 39) { near += Math.abs(values[y][x] - values[y][x + 1]); nearCount++; }
            if (y < 39) { near += Math.abs(values[y][x] - values[y + 1][x]); nearCount++; }
            const fx = (x * 17 + 11) % 40;
            const fy = (y * 23 + 7) % 40;
            far += Math.abs(values[y][x] - values[fy][fx]);
            farCount++;
        }
    }
    assert.ok(coefficient > 0.18, "density must vary inside one landscape");
    assert.ok(near / nearCount < far / farCount, "near tiles must be more alike than distant tiles");
    assert.ok(new Set(flat.map(value => value < 0.11 ? 0 : value < 0.28 ? 1 : value < 0.48 ? 2 : value < 0.70 ? 3 : 4)).size >= 4);
    assert.ok(__internals.valueNoise(SEED, 4, 9, 5.8, 12) === __internals.valueNoise(SEED, 4, 9, 5.8, 12));
});

test("all seventy density, habitat, driver, gameplay and visual points are reachable", () => {
    setup();
    const active = new Set();
    const bands = new Set();
    const habitats = new Set();
    const add = profile => {
        bands.add(profile.band);
        habitats.add(profile.habitat);
        for (const id of profile.requirements) active.add(id);
    };
    for (let index = 0; index < 120; index++) {
        const moisture = 0.10 + (index % 20) * 0.04;
        const temperature = 0.25 + ((index * 7) % 20) * 0.03;
        const height = 0.34 + ((index * 3) % 20) * 0.02;
        add(vegetationDensityAt(index * 1.7 + 0.5, index * 2.3 + 0.5, baseContext({
            moisture, temperature, height, dayOfYear: (index * 37) % 400,
            climate: ["temperate", "savanna", "taiga", "tundra", "coastal"][index % 5],
        })));
        add(vegetationDensityAt(index * 1.7 + 0.5, index * 2.3 + 0.5, baseContext({
            moisture, temperature, height, climate: "temperate", dayOfYear: (index * 37) % 400,
            grass: grassProfile({
                use: index % 2 ? { grazed: true } : { overgrazed: true },
                bloom: (index % 6) / 6,
                shrubPatches: (index % 5) / 5,
            }),
        })));
        add(vegetationDensityAt(index * 1.7 + 0.5, index * 2.3 + 0.5, baseContext({
            moisture: 0.10 + (index % 10) * 0.02, temperature: 0.75, height: 0.36,
            climate: "arid", dayOfYear: (index * 31) % 400, grass: grassProfile({ use: {} }),
        })));
        add(vegetationDensityAt(index * 1.7 + 0.5, index * 2.3 + 0.5, baseContext({
            moisture: 0.72 + (index % 10) * 0.025, temperature: 0.58, height: 0.34,
            climate: "swamp", dayOfYear: (index * 29) % 400,
            grass: grassProfile({ use: {} }),
            stand: forestStand({ density: 0.6, canopy: 0.6, type: "alder-carr" }),
        })));
        add(vegetationDensityAt(index * 1.7 + 0.5, index * 2.3 + 0.5, baseContext({
            moisture: 0.55, temperature: 0.55, height: 0.55,
            stand: forestStand({
                disturbance: ["burned", "cutover", "diseased", "windthrow"][index % 4],
                ageClass: ["young", "mature", "ancient"][index % 3],
                density: 0.3 + (index % 6) * 0.1,
                canopy: 0.3 + (index % 6) * 0.1,
                clearing: index % 4 === 1 ? 0.6 : 0.05,
            }),
        })));
        add(vegetationDensityAt(index * 1.7 + 0.5, index * 2.3 + 0.5, baseContext({
            moisture: 0.78 + (index % 5) * 0.02, temperature: 0.6, height: 0.34,
            grass: grassProfile({ use: {} }),
        })));
    }
    assert.deepEqual([...bands].sort(), [0, 1, 2, 3, 4]);
    assert.ok(habitats.size >= 12);
    const missing = Array.from({ length: 70 }, (_, index) => index + 1).filter(id => !active.has(id));
    assert.deepEqual(missing, [], "every 1.2.18 point must be reachable");
});

test("forest and grass adapters carry density without mutating the source profile", () => {
    setup();
    const dense = vegetationDensityAt(20.5, 20.5, baseContext({
        moisture: 0.72, temperature: 0.58, height: 0.55,
        stand: forestStand({ density: 0.9, canopy: 0.9, clearing: 0.02 }),
    }));
    const open = vegetationDensityAt(20.5, 20.5, baseContext({
        moisture: 0.28, temperature: 0.55, height: 0.55,
        stand: forestStand({ density: 0.2, canopy: 0.2, clearing: 0.65 }),
    }));
    assert.ok(dense.density > open.density);
    const base = forestStand();
    const denseStand = vegetationForestStand(base, dense);
    const openStand = vegetationForestStand(base, open);
    assert.equal(base.vegetation, undefined, "the source stand must not be mutated");
    assert.ok(denseStand.treeChance > openStand.treeChance);
    assert.ok(denseStand.canopy > openStand.canopy);
    assert.ok(denseStand.understory.fern > openStand.understory.fern);
    assert.equal(denseStand.vegetation, dense);
    assert.equal(denseStand.densityOverlay, dense);
    assert.ok(Number.isFinite(denseStand.sightRadius));

    const grass = {
        x: 20, y: 20, grassHex: "#71854f", bloom: 0.5, shrubPatches: 0.2,
        sward: { density: 0.6, height: "medium", medium: true }, trees: [],
    };
    const denseGrass = vegetationGrassProfile(grass, dense);
    const openGrass = vegetationGrassProfile(grass, open);
    assert.ok(denseGrass.sward.density > openGrass.sward.density);
    assert.equal(denseGrass.grassHex, grass.grassHex);
    assert.match(denseGrass.vegetation.tint, /^#[0-9a-f]{6}$/i);
    assert.equal(grass.vegetation, undefined);
    assert.equal(denseGrass.vegetation.densityOverlay, dense);

    const desert = {
        desert: true, grassHex: "#b8a477",
        vegetation: { grasses: ["bunch-grass"], shrubs: ["acacia"], density: 0.2, cover: 0.2, treeChance: 0.1 },
        sward: { density: 0.2, height: "short", short: true },
    };
    const desertGrass = vegetationGrassProfile(desert, dense);
    assert.deepEqual(desertGrass.vegetation.grasses, ["bunch-grass"]);
    assert.ok(desertGrass.vegetation.density > desert.vegetation.density);
});

test("dense vegetation changes sight, movement, cover, concealment, hunting and resources", () => {
    setup();
    const dense = vegetationGameplayAt(20.5, 20.5, baseContext({
        moisture: 0.72, temperature: 0.58, height: 0.55,
        stand: forestStand({ density: 0.92, canopy: 0.92, clearing: 0.02, understory: {
            fern: 0.8, bramble: 0.7, shrub: 0.7, grass: 0.4, herb: 0.5, sapling: 0.7,
        } }),
    }));
    const open = vegetationGameplayAt(20.5, 20.5, baseContext({
        moisture: 0.28, temperature: 0.55, height: 0.55,
        stand: forestStand({ density: 0.12, canopy: 0.12, clearing: 0.8, understory: {
            fern: 0.02, bramble: 0.02, shrub: 0.02, grass: 0.2, herb: 0.02, sapling: 0.02,
        } }),
    }));
    assert.ok(dense.cover > open.cover);
    assert.ok(dense.concealment > open.concealment);
    assert.ok(dense.sight < open.sight);
    assert.ok(dense.movement < open.movement);
    assert.ok(dense.wood > open.wood);
    assert.ok(dense.hunting >= 0 && dense.hunting <= 1);
    assert.ok(dense.fireRisk >= 0 && dense.fireRisk <= 1);
    assert.ok(dense.agriculture >= 0 && dense.agriculture <= 1);
});

test("desert and wetland samples expose their own density habitats", () => {
    setup();
    const bare = vegetationDensityAt(10.5, 10.5, baseContext({
        climate: "arid", moisture: 0.06, temperature: 0.82, height: 0.36,
    }));
    const oasis = vegetationDensityAt(10.5, 10.5, baseContext({
        climate: "arid", moisture: 0.94, temperature: 0.82, height: 0.34,
    }));
    assert.ok(oasis.density > bare.density);
    assert.ok(["bare-sand", "rock-desert", "desert-shrub"].includes(bare.habitat));
    assert.equal(oasis.habitat, "oasis");
    assert.ok(bare.requirements.includes(27));
    assert.ok(oasis.requirements.includes(31));

    let sawReed = null;
    let sawOpen = null;
    let sawMud = null;
    let sawSwampForest = null;
    for (let index = 0; index < 80; index++) {
        const profile = vegetationDensityAt(index * 1.3 + 0.5, index * 1.9 + 0.5, baseContext({
            climate: "swamp", moisture: 0.72 + (index % 12) * 0.02,
            temperature: 0.58, height: 0.34, dayOfYear: (index * 29) % 400,
            grass: grassProfile({ use: {} }),
            stand: forestStand({ density: 0.55, canopy: 0.55, type: "alder-carr" }),
        }));
        if (profile.requirements.includes(35)) sawReed = profile;
        if (profile.requirements.includes(34)) sawOpen = profile;
        if (profile.requirements.includes(41)) sawMud = profile;
        if (profile.requirements.includes(40)) sawSwampForest = profile;
    }
    assert.ok(sawReed, "loose reeds must be reachable");
    assert.ok(sawOpen, "open water must be reachable");
    assert.ok(sawMud, "bare mud must be reachable");
    assert.ok(sawSwampForest, "dense swamp forest must be reachable");
});

test("season and camera distance change the rendered density detail", () => {
    setup();
    const summer = vegetationDensityAt(20.5, 20.5, baseContext({ dayOfYear: 150 }));
    const winter = vegetationDensityAt(20.5, 20.5, baseContext({ dayOfYear: 350 }));
    assert.equal(summer.season, "summer");
    assert.equal(winter.season, "winter");
    assert.notEqual(summer.tint, winter.tint);
    assert.ok(vegetationDetailForZoom(0.2) < vegetationDetailForZoom(0.7));
    assert.ok(vegetationDetailForZoom(0.7) < vegetationDetailForZoom(1.4));
    assert.equal(vegetationDetailForZoom(1.4), 1);
});

test("the survey reports the manifest, five density samples and the active tile", () => {
    setup();
    const survey = getVegetationDensitySurvey(32.5, 32.5, { radius: 12 });
    assert.equal(survey.manifestCount, 70);
    assert.equal(survey.bandCount, 5);
    assert.equal(survey.bands.length, 5);
    assert.equal(survey.bands.filter(Boolean).length, 5);
    assert.equal(survey.active, true);
    assert.ok(survey.sample);
    assert.equal(survey.tile.x, 32);
    assert.equal(survey.tile.y, 32);
    assert.ok(survey.sample.activeCount >= 15);
    assert.ok(survey.labelDe.length > 4);
    assert.ok(survey.sample.requirements.includes(70));
    const exact = getVegetationDensitySurvey(32.5, 32.5, { radius: 4 });
    assert.equal(exact.tile.x, 32);
    assert.equal(exact.tile.y, 32);
});
