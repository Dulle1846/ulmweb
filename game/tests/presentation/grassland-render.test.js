// Headless proof for the grassland renderer.
//
// The browser reference tests cannot run in this workspace because Chromium is
// unavailable. These tests therefore drive the real Canvas2D functions from
// terrain.js with a recorder context. No production drawing is re-implemented
// here: every operation below is emitted by the same function the game calls.
import assert from "node:assert/strict";
import test from "node:test";

import { state } from "../../js/core/state.js";
import {
    GRASSLAND_FAUNA,
    grasslandProfileAt,
} from "../../js/world/grassland-ecology.js";
import {
    drawGrassland,
    drawGrasslandFauna,
    drawTerrain,
    drawGrasslandTree,
    drawGrasslandWindOverlay,
    GRASSLAND_WIND_LIMITS,
} from "../../js/presentation/rendering/terrain.js";

const SEASONS = Object.freeze([
    { name: "spring", day: 100 },
    { name: "summer", day: 170 },
    { name: "autumn", day: 260 },
    { name: "winter", day: 340 },
]);

// Flat, hill, wet, dry and rocky contexts are deliberately spread across the
// formations. More importantly, each profile is sampled from real terrain
// inputs rather than hand-built drawing objects.
const CONTEXTS = Object.freeze([
    { name: "flat", moisture: 0.5, temperature: 0.57, height: 0.44 },
    { name: "hill", moisture: 0.53, temperature: 0.55, height: 0.67 },
    { name: "wet", moisture: 0.82, temperature: 0.52, height: 0.46 },
    { name: "dry", moisture: 0.24, temperature: 0.72, height: 0.44 },
    { name: "rocky", moisture: 0.42, temperature: 0.5, height: 0.75 },
    { name: "mountain", moisture: 0.5, temperature: 0.48, height: 0.84 },
    { name: "near-forest", moisture: 0.56, temperature: 0.54, height: 0.52 },
]);

const SEED = 20261113;

function profileAt(x, y, context, overrides = {}) {
    return grasslandProfileAt(x + 0.5, y + 0.5, {
        seed: SEED,
        climate: "temperate",
        seaLevel: 0.33,
        forests: 52,
        year: 4,
        hour: 9,
        weather: "clear",
        wind: 1,
        ...context,
        ...overrides,
    });
}

function collectSamples() {
    const samples = [];
    for (const season of SEASONS) {
        for (const context of CONTEXTS) {
            for (let y = 0; y < 48; y += 2) {
                for (let x = 0; x < 48; x += 2) {
                    samples.push(profileAt(x, y, context, { dayOfYear: season.day, season }));
                }
            }
        }
    }
    return samples;
}

const SAMPLES = collectSamples();

function findProfile(predicate, message) {
    const found = SAMPLES.find(predicate);
    assert.ok(found, message);
    return found;
}

function findTree(kind) {
    for (const sample of SAMPLES) {
        const tree = sample.trees.find(candidate => candidate.kind === kind);
        if (tree) return { profile: sample, tree };
    }
    assert.fail("no sampled grassland profile contains a " + kind + " tree");
}

function createRecorder(canvas = { width: 640, height: 480 }) {
    const operations = [];
    const target = {
        canvas,
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        globalAlpha: 1,
        lineCap: "butt",
        lineJoin: "miter",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
    };

    const record = (name, args) => {
        operations.push({
            op: name,
            args: args.map(value => typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value),
            fillStyle: target.fillStyle,
            strokeStyle: target.strokeStyle,
            globalAlpha: target.globalAlpha,
            lineWidth: target.lineWidth,
        });
    };

    const methods = {
        save: [], restore: [], beginPath: [], closePath: [],
        moveTo: ["x", "y"], lineTo: ["x", "y"], quadraticCurveTo: ["cpx", "cpy", "x", "y"],
        bezierCurveTo: ["cp1x", "cp1y", "cp2x", "cp2y", "x", "y"],
        arc: ["x", "y", "radius", "start", "end", "ccw"],
        ellipse: ["x", "y", "rx", "ry", "rotation", "start", "end", "ccw"],
        rect: ["x", "y", "w", "h"], fill: [], stroke: [], clip: [],
        fillRect: ["x", "y", "w", "h"], strokeRect: ["x", "y", "w", "h"],
        clearRect: ["x", "y", "w", "h"], translate: ["x", "y"], scale: ["x", "y"],
        rotate: ["angle"], setTransform: ["a", "b", "c", "d", "e", "f"],
        drawImage: ["image", "sx", "sy", "sw", "sh", "dx", "dy", "dw", "dh"],
        putImageData: ["image", "dx", "dy"], fillText: ["text", "x", "y"],
        strokeText: ["text", "x", "y"], setLineDash: ["segments"],
        arcTo: ["x1", "y1", "x2", "y2", "radius"], roundRect: ["x", "y", "w", "h", "radii"],
    };
    for (const [name] of Object.entries(methods)) {
        target[name] = (...args) => record(name, args);
    }
    target.createLinearGradient = (...args) => {
        record("createLinearGradient", args);
        return { addColorStop: (offset, colour) => record("gradient.addColorStop", [offset, colour]) };
    };
    target.createRadialGradient = (...args) => {
        record("createRadialGradient", args);
        return { addColorStop: (offset, colour) => record("gradient.addColorStop", [offset, colour]) };
    };
    target.createPattern = (...args) => {
        record("createPattern", args);
        return {};
    };
    target.createImageData = (width, height) => ({
        width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4)),
    });
    target.getImageData = (x, y, width, height) => target.createImageData(width, height);
    target.measureText = text => ({ width: String(text).length * 6 });

    const ctx = new Proxy(target, {
        get(object, property) {
            if (property in object) return object[property];
            if (typeof property !== "string") return undefined;
            return (...args) => record(property, args);
        },
        set(object, property, value) {
            object[property] = value;
            return true;
        },
    });
    return { ctx, operations, canvas };
}

function renderProfile(profile, {
    tick = 900,
    zoom = 1.25,
    s1 = 0.2,
    s2 = 0.4,
    s3 = 0.99,
    dayOfYear = 170,
} = {}) {
    const recorder = createRecorder();
    drawGrassland(recorder.ctx, 90, 100, 48, profile, s1, s2, s3, tick, zoom, null, dayOfYear, "temperate");
    return recorder;
}

function renderTrees(profile, tick = 900) {
    const recorder = createRecorder();
    for (const tree of profile.trees) {
        drawGrasslandTree(recorder.ctx, 90, 100, 48, tree, profile, tick);
    }
    return recorder;
}

function styles(recorder, property, value) {
    return recorder.operations.some(operation => operation[property] === value);
}

function count(recorder, op) {
    return recorder.operations.filter(operation => operation.op === op).length;
}

function bladeSpan(recorder) {
    let lastMove = null;
    let span = 0;
    for (const operation of recorder.operations) {
        if (operation.op === "moveTo") lastMove = operation.args;
        if (operation.op === "quadraticCurveTo" && lastMove) {
            span = Math.max(span, lastMove[1] - operation.args[3]);
        }
    }
    return span;
}

function serialise(recorder) {
    return JSON.stringify(recorder.operations.map(operation => ({
        op: operation.op,
        args: operation.args,
        fillStyle: operation.fillStyle,
        strokeStyle: operation.strokeStyle,
        globalAlpha: operation.globalAlpha,
        lineWidth: operation.lineWidth,
    })));
}

test("the real terrain renderer paints every promised grassland layer", () => {
    const short = findProfile(profile => profile.sward.short && profile.features.includes("1.2.6.1"),
        "no short turf sample");
    const medium = findProfile(profile => profile.sward.medium && profile.features.includes("1.2.6.2"),
        "no medium meadow sample");
    const tall = findProfile(profile => profile.sward.tall && profile.features.includes("1.2.6.3"),
        "no tall meadow sample");
    const shortSpan = bladeSpan(renderProfile(short, { s3: 0 }));
    const mediumSpan = bladeSpan(renderProfile(medium, { s3: 0 }));
    const tallSpan = bladeSpan(renderProfile(tall, { s3: 0 }));
    assert.ok(shortSpan > 0 && mediumSpan > shortSpan && tallSpan > mediumSpan,
        `sward heights must be visibly distinct: short=${shortSpan}, medium=${mediumSpan}, tall=${tallSpan}`);
    assert.ok(renderProfile(tall, { s3: 0 }).operations.length > 20,
        "the tall sward must emit drawing operations");

    const flowerProfile = findProfile(profile => profile.flowers.length > 0 && profile.bloom > 0.1,
        "no flowering meadow sample");
    const flowerRecorder = renderProfile(flowerProfile);
    assert.ok(flowerProfile.flowers.some(flower => styles(flowerRecorder, "fillStyle", flower.colours[0])),
        "wildflower colour must reach the canvas");

    const herbProfile = findProfile(profile => profile.herbs.length > 0,
        "no herb sample");
    const herbRecorder = renderProfile(herbProfile);
    assert.ok(herbProfile.herbs.some(herb => styles(herbRecorder, "fillStyle", herb.colour)),
        "herb colour must reach the canvas");
    assert.ok(herbProfile.features.includes("1.2.6.10"), "herbs must be part of the profile features");

    const islandProfile = findProfile(profile => profile.features.includes("1.2.6.11"),
        "no flower-island sample");
    assert.ok(islandProfile.flowerPatch > 0.62 && islandProfile.bloom > 0.38,
        "flower islands need a coarse patch and enough bloom");
    assert.ok(renderProfile(islandProfile).operations.length > 30,
        "flower islands must actually draw");

    const rareProfile = findProfile(profile => profile.rarePlant && profile.bloom > 0.1,
        "no rare-plant sample");
    const rareRecorder = renderProfile(rareProfile);
    assert.ok(styles(rareRecorder, "fillStyle", rareProfile.rarePlant.colours[0]),
        "the rare plant must be drawn even when other flowers fill the list");

    const landforms = new Set();
    for (const sample of SAMPLES) {
        for (const [name, active] of Object.entries(sample.landform)) {
            if (active === true) landforms.add(name);
        }
    }
    for (const landform of ["flat", "plain", "hill", "hollow", "rocky", "nearForest", "nearSteppe", "nearMountain"]) {
        assert.ok(landforms.has(landform), "the render samples are missing landform " + landform);
    }

    const oldTree = findTree("old");
    assert.ok(renderTrees(oldTree.profile).operations.length > 10,
        "an old tree must actually draw");
    assert.ok(styles(renderTrees(oldTree.profile), "fillStyle", oldTree.tree.colours[oldTree.profile.season]),
        "an old tree must use its seasonal canopy colour");

    const groveTrees = SAMPLES.find(profile => profile.trees.filter(tree => tree.kind === "grove").length >= 2);
    assert.ok(groveTrees, "no tree-group sample");
    assert.ok(renderTrees(groveTrees).operations.length > 20,
        "a tree group must draw more than one crown");

    const hedgeTree = findTree("hedge");
    assert.ok(hedgeTree.profile.hedge, "a hedge tree must mark the profile as a hedge");
    assert.ok(renderTrees(hedgeTree.profile).operations.length > 8,
        "a hedge must actually draw");

    const fruitTree = findTree("fruit");
    const fruitRecorder = renderTrees(fruitTree.profile);
    assert.ok(fruitRecorder.operations.length > 8, "a fruit tree must actually draw");
    const autumnFruit = SAMPLES.find(profile => profile.season === "autumn"
        && profile.trees.some(tree => tree.kind === "fruit"));
    assert.ok(autumnFruit, "no autumn orchard sample");
    assert.ok(styles(renderTrees(autumnFruit), "fillStyle", "#b34f3d"),
        "an autumn fruit tree must draw its fruit");

    const windbreakTree = findTree("windbreak");
    assert.ok(windbreakTree.profile.windbreak, "a windbreak tree must mark the profile as a windbreak");
    assert.ok(renderTrees(windbreakTree.profile).operations.length > 20,
        "a windbreak group must draw multiple trees");

    const riparianTree = findTree("riparian");
    assert.ok(renderTrees(riparianTree.profile).operations.length > 8,
        "a riparian tree must actually draw");

    const lightProfile = findProfile(profile => profile.visual.sunlight > 0.3 && profile.bloom > 0.12,
        "no sunlight sample");
    assert.ok(styles(renderProfile(lightProfile), "strokeStyle", "#f3dd9b"),
        "sunlight accents must reach the canvas");

    const mistProfile = findProfile(profile => profile.visual.mist > 0.2,
        "no mist sample");
    assert.ok(styles(renderProfile(mistProfile, { zoom: 1.0 }), "fillStyle", "#dbe6df"),
        "mist must reach the canvas");

    const dewProfile = findProfile(profile => profile.visual.dew > 0.24,
        "no dew sample");
    assert.ok(styles(renderProfile(dewProfile), "fillStyle", "#eef4e9"),
        "morning dew must reach the canvas");

    // Use states are explicit inputs here so the test fails on a missing
    // renderer branch instead of merely finding another tile by chance.
    const grazed = profileAt(7, 11, CONTEXTS[0], {
        dayOfYear: 170,
        use: { grazed: true, livestock: ["cattle"] },
    });
    assert.ok(grazed.features.includes("1.2.6.46"), "grazed profile must carry the grazed feature");
    const grazedRecorder = renderProfile(grazed);
    assert.ok(count(grazedRecorder, "translate") >= 1, "grazed ground must draw livestock");

    const mowed = profileAt(7, 11, CONTEXTS[0], { dayOfYear: 170, use: { mowed: true } });
    assert.ok(styles(renderProfile(mowed), "strokeStyle", "#c1a96b"), "mown rows must be drawn");

    const trampled = profileAt(7, 11, CONTEXTS[0], { dayOfYear: 170, use: { trampled: true } });
    assert.ok(styles(renderProfile(trampled), "fillStyle", "#aa9871"), "trampled soil must be drawn");

    const overgrazed = profileAt(7, 11, CONTEXTS[0], { dayOfYear: 170, use: { overgrazed: true } });
    assert.ok(styles(renderProfile(overgrazed), "fillStyle", "#8b7854"), "overgrazed damage must be drawn");
    assert.ok(!overgrazed.features.includes("1.2.6.7"), "overgrazed sward must not claim flowering meadow");

    const path = profileAt(7, 11, CONTEXTS[0], { dayOfYear: 170, use: { path: true } });
    assert.ok(styles(renderProfile(path), "fillStyle", "#c9b68a"), "path surface must be drawn");
    assert.ok(styles(renderProfile(path), "strokeStyle", "#9e8a62"), "path ruts must be drawn");

    const wild = profileAt(7, 11, CONTEXTS[0], {
        dayOfYear: 170,
        use: { wild: true, yearsSinceUse: 12 },
    });
    assert.ok(wild.features.includes("1.2.6.48"), "wild profile must carry the wild feature");
    assert.ok(wild.features.includes("1.2.6.51") && wild.features.includes("1.2.6.52"),
        "long-unmanaged ground must expose encroachment and reforestation");
    const wildRecorder = renderProfile(wild, { s1: 0.9 });
    assert.ok(styles(wildRecorder, "fillStyle", wild.leafColour),
        "scrub saplings must use the grassland leaf colour");

    // Every fauna branch named in the mission is driven through the actual
    // drawGrasslandFauna function, not a mock.
    const requiredKinds = ["deer", "hare", "fox", "raptor", "songbird", "ground-bird", "butterfly", "bee"];
    for (const kind of requiredKinds) {
        const animal = Object.values(GRASSLAND_FAUNA).find(entry => entry.kind === kind);
        assert.ok(animal, "missing fauna definition for " + kind);
        const recorder = createRecorder();
        drawGrasslandFauna(recorder.ctx, 50, 50, 18, animal, 900, "summer");
        assert.ok(recorder.operations.length > 3, "fauna branch did not draw: " + kind);
    }
    for (const animal of Object.values(GRASSLAND_FAUNA).filter(entry => entry.group === "livestock")) {
        const recorder = createRecorder();
        drawGrasslandFauna(recorder.ctx, 50, 50, 18, animal, 900, "summer");
        assert.ok(recorder.operations.length > 3, "livestock branch did not draw: " + animal.kind);
    }

    const multiFauna = findProfile(profile => new Set(profile.fauna.map(entry => entry.group)).size >= 2,
        "no profile with two fauna groups");
    assert.ok(count(renderProfile(multiFauna), "translate") >= 2,
        "a meadow tile must be able to draw more than one fauna group");
});

test("grassland rendering is deterministic for the same world and tick", () => {
    const profile = findProfile(candidate => candidate.flowers.length && candidate.trees.length,
        "no rich deterministic sample");
    const first = renderProfile(profile);
    const second = renderProfile(profile);
    assert.equal(serialise(first), serialise(second),
        "same profile and tick must emit the identical Canvas2D operation sequence");

    const treeFirst = renderTrees(profile);
    const treeSecond = renderTrees(profile);
    assert.equal(serialise(treeFirst), serialise(treeSecond),
        "tree rendering must be deterministic");
});

test("grassland grass colour changes with the season", () => {
    const spring = profileAt(9, 13, CONTEXTS[0], { dayOfYear: 100 });
    const summer = profileAt(9, 13, CONTEXTS[0], { dayOfYear: 170 });
    const autumn = profileAt(9, 13, CONTEXTS[0], { dayOfYear: 260 });
    const winter = profileAt(9, 13, CONTEXTS[0], { dayOfYear: 340 });
    const profiles = [spring, summer, autumn, winter];
    const colours = profiles.map(profile => profile.grassHex);
    assert.ok(new Set(colours).size >= 3, "seasonal grass colours must differ: " + colours.join(", "));
    for (const profile of profiles) {
        // Deep winter snow deliberately hides the sward. Its grass colour is
        // still a distinct seasonal value, but the visible layer is snow.
        if (profile.visual.snowCover > 0.86) continue;
        const recorder = renderProfile(profile, { s3: 0 });
        assert.ok(styles(recorder, "fillStyle", profile.grassHex),
            "seasonal grass fill must reach the canvas: " + profile.grassHex);
    }
});

function installOverlayWorld(width = 512, height = 512) {
    const size = width * height;
    state.worldSeed = 918273;
    state.worldW = width;
    state.worldH = height;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = width;
    state.terrainPixH = height;
    state.heightMap = new Float32Array(size).fill(0.46);
    state.moistureMap = new Float32Array(size).fill(0.62);
    state.temperatureMap = new Float32Array(size).fill(0.56);
    state.explored = Array.from({ length: width }, () => Array(height).fill(true));
    state.dayOfYear = 170;
    state.year = 5;
    state.timeOfDay = 7;
    state.weather = "clear";
    state.tick = 1200;
    state.worldOptions = { climate: "temperate", forests: 0 };
    state.entities = [];
    state.roads = { revision: 0, tiles: {} };
    state.buildingCollisionVersion = 0;
    state.terrainCacheRevision = 0;
    state.forestVisualRevision = 0;
    state.exploredRevision = 1;
}

function renderOverlay(width, height, zoom, probe) {
    const recorder = createRecorder({ width, height });
    drawGrasslandWindOverlay(recorder.ctx, zoom, { x: 0, y: 0 }, recorder.canvas, probe);
    return recorder;
}

test("the wind overlay obeys its hard per-frame tuft and scan budget", () => {
    assert.deepEqual(
        { maxTufts: GRASSLAND_WIND_LIMITS.maxTufts, maxExamined: GRASSLAND_WIND_LIMITS.maxExamined },
        { maxTufts: 44, maxExamined: 260 },
        "the documented hard budget changed without updating the renderer test",
    );
    installOverlayWorld();
    const budgetProbe = {};
    const budgetRecorder = renderOverlay(1280, 720, 1.2, budgetProbe);
    assert.ok(budgetProbe.tufts > 0, "the full-view overlay must actually draw tall grass");
    assert.ok(budgetProbe.tufts <= GRASSLAND_WIND_LIMITS.maxTufts,
        `tuft cap exceeded: ${budgetProbe.tufts} > ${GRASSLAND_WIND_LIMITS.maxTufts}`);
    assert.ok(budgetProbe.examined <= GRASSLAND_WIND_LIMITS.maxExamined,
        `scan cap exceeded: ${budgetProbe.examined} > ${GRASSLAND_WIND_LIMITS.maxExamined}`);
    assert.ok(count(budgetRecorder, "stroke") <= GRASSLAND_WIND_LIMITS.maxTufts * 2,
        "the overlay emitted more strokes than the tuft cap allows");

    // Same world and tick must produce the same overlay sequence. This is the
    // per-frame animated path, so it gets its own determinism check.
    const overlayFirst = renderOverlay(1280, 720, 1.2, {});
    const overlaySecond = renderOverlay(1280, 720, 1.2, {});
    assert.equal(serialise(overlayFirst), serialise(overlaySecond),
        "the same world and tick must emit the identical wind overlay sequence");

    // A normal wooded world is not allowed to hide every meadow. Forest
    // clearings are open ground and must reach the same overlay path.
    state.worldOptions = { climate: "temperate", forests: 52 };
    state.moistureMap.fill(0.8);
    const woodedProbe = {};
    renderOverlay(1280, 720, 1.2, woodedProbe);
    assert.ok(woodedProbe.tufts > 0,
        "wooded worlds must render tall grass in forest clearings");
    assert.ok(woodedProbe.tufts <= GRASSLAND_WIND_LIMITS.maxTufts,
        "wooded overlay exceeded the tuft cap");
    // A 2560×1440 wooded view has sparse clearings. It reaches the scan cap
    // without filling the tuft cap, proving the two limits independently.
    const stressProbe = {};
    const stressRecorder = renderOverlay(2560, 1440, 0.62, stressProbe);
    assert.ok(stressProbe.tufts > 0,
        "the stress view did not exercise the overlay");
    assert.equal(stressProbe.examined, GRASSLAND_WIND_LIMITS.maxExamined,
        "the stress view must stop exactly at the examined-tile cap");
    assert.ok(stressProbe.examined <= GRASSLAND_WIND_LIMITS.maxExamined,
        `stress scan cap exceeded: ${stressProbe.examined} > ${GRASSLAND_WIND_LIMITS.maxExamined}`);
    assert.ok(stressProbe.tufts <= GRASSLAND_WIND_LIMITS.maxTufts,
        `stress tuft cap exceeded: ${stressProbe.tufts} > ${GRASSLAND_WIND_LIMITS.maxTufts}`);
    assert.ok(count(stressRecorder, "stroke") <= GRASSLAND_WIND_LIMITS.maxTufts * 2,
        "stress view emitted unbounded overlay strokes");

    // A no-forest world has tall grass in every scanned tile, so it hits the
    // separate 44-tuft cap before the scan budget is exhausted.
    state.worldOptions = { climate: "temperate", forests: 0 };
    const tuftProbe = {};
    const tuftRecorder = renderOverlay(2560, 1440, 0.62, tuftProbe);
    assert.equal(tuftProbe.tufts, GRASSLAND_WIND_LIMITS.maxTufts,
        "the dense view must stop exactly at the 44-tuft cap");
    assert.ok(count(tuftRecorder, "stroke") <= GRASSLAND_WIND_LIMITS.maxTufts * 2,
        "the dense view emitted more strokes than 44 tufts allow");

    // The budget is the low-end 60 Hz frame target. The recorder is much
    // cheaper than a real rasteriser, so this is a regression guard for the
    // CPU-side per-frame path, not a GPU benchmark.
    const FRAME_BUDGET_MS = 16;
    const samples = [budgetProbe.elapsedMs];
    for (let index = 0; index < 2; index++) {
        const probe = {};
        renderOverlay(1280, 720, 1.2, probe);
        samples.push(probe.elapsedMs);
    }
    samples.sort((a, b) => a - b);
    const median = samples[1];
    assert.ok(median < FRAME_BUDGET_MS,
        `per-frame overlay median ${median.toFixed(2)} ms exceeds the ${FRAME_BUDGET_MS} ms low-end budget`);
    console.log(`grassland overlay frame budget: median ${median.toFixed(2)} ms, ` +
        `tufts ${budgetProbe.tufts}/${GRASSLAND_WIND_LIMITS.maxTufts}, ` +
        `examined ${budgetProbe.examined}/${GRASSLAND_WIND_LIMITS.maxExamined}; ` +
        `stress tufts ${stressProbe.tufts}/${GRASSLAND_WIND_LIMITS.maxTufts}, ` +
        `examined ${stressProbe.examined}/${GRASSLAND_WIND_LIMITS.maxExamined}`);
});


test("drawTerrain reaches the real grassland detail and wind path end to end", () => {
    const W = 24;
    const H = 24;
    const main = createRecorder({ width: 640, height: 480 });
    const surface = createRecorder({ width: 640, height: 480 });
    surface.canvas.getContext = () => surface.ctx;
    surface.canvas.style = {};
    const source = { width: 640, height: 480 };
    const fog = { width: W, height: H };
    const created = [];
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement() {
            const canvasRecord = createRecorder({ width: 0, height: 0 });
            canvasRecord.canvas.getContext = () => canvasRecord.ctx;
            canvasRecord.canvas.style = {};
            created.push(canvasRecord);
            return canvasRecord.canvas;
        },
    };

    Object.assign(state, {
        worldSeed: 918273,
        worldW: W,
        worldH: H,
        seaLevel: 0.33,
        terrainResolution: 1,
        terrainPixW: W,
        terrainPixH: H,
        heightMap: new Float32Array(W * H).fill(0.46),
        moistureMap: new Float32Array(W * H).fill(0.8),
        temperatureMap: new Float32Array(W * H).fill(0.56),
        explored: Array.from({ length: W }, () => Array(H).fill(true)),
        exploredRevision: 1,
        dayOfYear: 170,
        year: 5,
        timeOfDay: 9,
        weather: "clear",
        tick: 1200,
        worldOptions: { climate: "temperate", forests: 0 },
        entities: [],
        roads: { revision: 0, tiles: {} },
        buildingCollisionVersion: 0,
        terrainCacheRevision: 0,
        forestVisualRevision: 0,
        terrainCanvas: source,
        terrainCanvasEl: surface.canvas,
        fogCanvas: fog,
        fogDirty: false,
        fogExploredRef: null,
        terrainRenderer: "canvas",
        terrainAutoMode: "canvas",
        terrainMode: "canvas",
        zoom: 1.2,
        camera: { x: 0, y: 0 },
        zoomLevel: 2,
        renderScale: 1,
        canvas: main.canvas,
    });
    state.fogExploredRef = state.explored;

    try {
        for (let frame = 0; frame < 40; frame++) {
            drawTerrain(main.ctx);
            if (state.terrainCanvasEl.style.opacity === "1"
                && state.terrainTreeDraws > 0
                && created[0]?.operations.some(operation => operation.op === "ellipse")) break;
        }
        const stage = created[0];
        assert.ok(stage, "the real drawTerrain path did not create its staging surface");
        assert.ok(stage.operations.some(operation => operation.op === "ellipse"),
            "the real detail build did not emit any grass/tree geometry");
        assert.ok(stage.operations.some(operation => operation.op === "quadraticCurveTo"),
            "the real detail build did not emit grass blades");
        const expectedGrass = grasslandProfileAt(0.5, 0.5, {
            seed: state.worldSeed, moisture: 0.8, temperature: 0.56, height: 0.46,
            climate: "temperate", forests: 0, seaLevel: 0.33, dayOfYear: 170,
            year: 5, hour: 9, weather: "clear", wind: 1,
        });
        assert.ok(stage.operations.some(operation => operation.op === "ellipse"
            && operation.fillStyle === expectedGrass.grassHex),
        "the real detail build did not paint the grassland sward colour");
        assert.ok(stage.operations.some(operation => operation.op === "translate"),
            "the real detail build did not emit a fauna/vegetation translate");
        assert.ok(state.terrainTreeDraws > 0, "the real renderer did not draw a tree");
        assert.ok(main.operations.some(operation => operation.op === "drawImage"),
            "the cached terrain layer was not copied to the visible canvas");
        assert.ok(count(main, "stroke") > 0,
            "the animated wind overlay was not drawn after the cached layer");

        // Once the static detail layer is settled, a full drawTerrain frame is
        // only the cached blit plus the bounded wind overlay. Measure that real
        // path, not the one-frame build slices.
        const frameTimes = [];
        for (let frame = 0; frame < 5; frame++) {
            const started = performance.now();
            drawTerrain(main.ctx);
            frameTimes.push(performance.now() - started);
        }
        frameTimes.sort((a, b) => a - b);
        const frameMedian = frameTimes[2];
        assert.ok(frameMedian < 16,
            `cached drawTerrain frame median ${frameMedian.toFixed(2)} ms exceeds the 16 ms budget`);
        console.log(`cached drawTerrain frame budget: median ${frameMedian.toFixed(2)} ms at 640×480`);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});
