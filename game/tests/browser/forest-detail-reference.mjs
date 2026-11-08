// Deterministic close-up reference for the thirteen Laubwald checklist gaps.
//
// The formation sheet proves which woods exist. This sheet proves the small
// things inside them: a sunny clearing, a deer trail, wet versus dry forest
// floor, exposed roots, fungi on a stump, autumn mast, a squirrel, an owl, an
// ant, a nest and a lone tree. Every frame is a real generated tile rendered by
// the normal terrain pass. Nothing is hand-placed and nothing is a data card
// standing in for a picture.
//
// Usage: npm run test:forest-detail
// Output: docs/terrain-reference/forest-detail-reference.png
//         docs/terrain-reference/forest-detail-reference.json

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputDir = path.resolve(process.env.FOREST_DETAIL_OUT || path.join(gameRoot, "docs/terrain-reference"));
const framesDir = process.env.FOREST_DETAIL_FRAMES ? path.resolve(process.env.FOREST_DETAIL_FRAMES) : null;
const seed = 20261104;
const viewport = { width: 900, height: 900 };
const summerDay = 150;
const springDay = 60;
const autumnDay = 250;

const mimeTypes = {
    ".js": "text/javascript", ".html": "text/html", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createServer() {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url || "/", "http://localhost");
        const file = path.join(gameRoot, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
        if (!file.startsWith(gameRoot)) {
            response.statusCode = 403;
            response.end("forbidden");
            return;
        }
        try {
            const data = await fs.readFile(file);
            response.setHeader("content-type", mimeTypes[path.extname(file)] || "application/octet-stream");
            response.setHeader("cache-control", "no-store");
            response.end(data);
        } catch {
            response.statusCode = 404;
            response.end("missing");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

const { chromium } = await import("playwright");
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.type() + ": " + message.text());
});
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Forest Detail Reference");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1200);

    await page.addStyleTag({
        content: `
            body.forest-detail .topbar,
            body.forest-detail .realm-nav,
            body.forest-detail .side-panel { display: none !important; }
            body.forest-detail .game-shell,
            body.forest-detail .game-layout { display: block !important; height: 100vh !important; }
            body.forest-detail #canvas-wrapper {
                position: fixed !important; inset: 0 !important;
                width: 100vw !important; height: 100vh !important;
                background: #0b1310 !important;
            }
            body.forest-detail #canvas-wrapper > *:not(#terrain-canvas):not(#canvas) {
                visibility: hidden !important;
            }
        `,
    });

    const webgl = await page.evaluate(async () => {
        document.body.classList.add("forest-detail");
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.weather = "clear";
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        const { resize, centerCamera } = await import("./js/presentation/camera.js");
        resize();
        centerCamera();
        // Same reason as the formation sheet: on a software renderer the
        // automatic quality pick may have created a Canvas2D context first.
        const { resetTerrainWebGL } = await import("./js/presentation/rendering/terrain-webgl.js");
        resetTerrainWebGL();
        state.terrainRenderer = "webgl";
        state.terrainAutoMode = "webgl";
        state.terrainMode = "webgl";
        state.terrainFallback = false;
        const previousCanvas = document.getElementById("terrain-canvas");
        const canvas = previousCanvas.cloneNode(false);
        canvas.width = state.canvas.width;
        canvas.height = state.canvas.height;
        canvas.style.opacity = "";
        canvas.style.transform = "";
        previousCanvas.replaceWith(canvas);
        state.terrainCanvasEl = canvas;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        const gl = canvas.getContext("webgl2");
        return {
            hasGl: Boolean(gl),
            width: canvas.width,
            height: canvas.height,
            worldWidth: width,
            worldHeight: height,
            renderer: gl ? gl.getParameter(gl.RENDERER) : null,
            maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
        };
    });
    if (!webgl.hasGl) throw new Error("The forest detail reference requires WebGL2; the terrain fell back to Canvas2D.");

    const scan = await page.evaluate(async ({ summerDay, springDay, autumnDay }) => {
        const { state } = await import("./js/core/state.js");
        const { getHeightAt, getMoistureAt, getTemperatureAt } = await import("./js/world/world.js");
        const {
            forestStandAt, forestPotentialAt, forestFaunaFor, pickSpecies,
        } = await import("./js/world/forest-ecology.js");
        const { seasonalState } = await import("./js/world/season.js");
        const { flowerBloom } = await import("./js/presentation/rendering/seasonal-foliage.js");
        const { getResourceNodeAt } = await import("./js/systems/resource-geography.js");
        const { ensureForestFauna, forestFaunaAt } = await import("./js/systems/forest-fauna.js");
        ensureForestFauna();

        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const worldSeed = Number(state.worldSeed) || 1;
        const climateKey = state.worldOptions?.climate || "temperate";
        const forests = state.worldOptions?.forests ?? 52;
        const sea = state.seaLevel ?? 0.33;
        const cache = new Map();
        const collections = {};
        const push = (key, tile, score, extra = {}) => {
            (collections[key] ||= []).push({ tile, score, extra });
        };

        function floorBranch(stand, s1, s2, s3) {
            if (stand.ground.trail && s2 > 0.54) return "trail";
            if (s1 < stand.ground.litter * 0.62) return "litter";
            if (s1 < stand.ground.litter * 0.62 + stand.ground.moss * 0.5) return "moss";
            const fern = stand.understory.fern * 0.65;
            const bramble = stand.understory.bramble * 0.44;
            if (s1 < 0.32 + fern) return "fern";
            if (s1 < 0.32 + fern + bramble) return "bramble";
            if (s1 < 0.78 && stand.ground.mushrooms > 0.25) return "mushrooms";
            if (s1 < 0.85 && stand.ground.roots > 0.2) return "roots";
            if (s1 < 0.91 && stand.ground.stones > 0.18) return "stones";
            if (s1 < 0.96 && stand.ground.stumps > 0.2) return "stumps";
            if (stand.ground.logs > 0.2) return "log";
            if (stand.understory.shrub > 0.2 && s3 > 0.55) return "shrub";
            if (stand.ground.flowers > 0.3) return "flowers";
            return "grass";
        }

        function tileInfo(x, y) {
            const key = x + ":" + y;
            if (cache.has(key)) return cache.get(key);
            const node = getResourceNodeAt(x, y);
            const moisture = getMoistureAt(x + 0.5, y + 0.5);
            const temperature = getTemperatureAt(x + 0.5, y + 0.5);
            const terrainHeight = getHeightAt(x + 0.5, y + 0.5);
            const stockRatio = node?.forestCapacity ? node.forestStock / node.forestCapacity : 1;
            const stand = forestStandAt(x + 0.5, y + 0.5, {
                seed: worldSeed, moisture, temperature, height: terrainHeight,
                climate: climateKey, forests, stockRatio, rockLine: 0.92,
            });
            const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            const s1 = (hash % 1000) / 1000;
            const s2 = ((hash >>> 7) % 1000) / 1000;
            const s3 = ((hash >>> 13) % 1000) / 1000;
            const potentialForest = forestPotentialAt({ moisture, height: terrainHeight, forests, rockLine: 0.92 });
            const tree = Boolean(stand.forest) && s1 < stand.treeChance;
            const renderable = terrainHeight >= sea && temperature >= 0.22 && terrainHeight <= 0.92;
            const cluster = 0.5 + 0.5 * Math.sin(x * 0.19 + y * 0.13) * Math.sin(x * 0.06 - y * 0.11);
            const info = {
                x, y, node, stand, moisture, temperature, height: terrainHeight,
                stockRatio, s1, s2, s3, tree, potentialForest, renderable, cluster,
            };
            cache.set(key, info);
            return info;
        }

        const summerFlora = seasonalState(summerDay, climateKey);
        const springBloom = flowerBloom(springDay, climateKey);
        const autumnFlora = seasonalState(autumnDay, climateKey);

        for (let y = 10; y < height - 10; y++) {
            for (let x = 10; x < width - 10; x++) {
                const tile = tileInfo(x, y);
                if (!tile.renderable) continue;
                const { stand, s1, s2, s3, tree } = tile;

                if (tile.potentialForest === false
                    && tile.cluster > 0.74 && tile.moisture > 0.3 && tile.temperature > 0.28 && s1 > 0.925) {
                    push("loneTree", tile, tile.cluster + s1 * 0.1, { branch: "loneTree" });
                }

                if (!stand.forest) continue;

                const branch = floorBranch(stand, s1, s2, s3);
                const clearing = stand.clearing > 0.28;

                if (!tree && clearing && stand.ground.flowers > 0.28) {
                    push("clearing", tile, stand.clearing + stand.light * 0.2 + stand.ground.flowers, { branch });
                    if (springBloom > 0.3) push("blossom", tile, stand.ground.flowers + stand.clearing, { branch });
                }
                if (!tree && clearing && s2 > 0.6 && stand.clearing > 0.32) {
                    push("sunbeam", tile, s2 + stand.clearing + stand.light * 0.1, { branch });
                }
                if (!tree && clearing && s2 <= 0.52 && stand.ground.flowers > 0.2) {
                    push("meadow", tile, stand.clearing + stand.ground.flowers * 0.6, { branch });
                }
                if (!tree && stand.ground.trail && s2 > 0.6) {
                    push("trail", tile, s2 + stand.ground.compaction, { branch });
                }
                if (!tree && stand.ground.soil === "alluvial" && ["litter", "moss", "fern"].includes(branch)) {
                    push("wetFloor", tile, tile.moisture + stand.ground.litter, { branch });
                }
                if (!tree && stand.ground.soil === "loam" && tile.moisture < 0.47 && ["litter", "moss", "fern"].includes(branch)) {
                    push("loamFloor", tile, 0.5 - tile.moisture + stand.ground.litter * 0.4, { branch });
                }
                if (!tree && branch === "roots") {
                    push("roots", tile, stand.ground.roots + (stand.ageClass === "ancient" ? 0.5 : 0), { branch });
                }
                if (!tree && branch === "stones") {
                    push("stones", tile, stand.ground.stones, { branch });
                }
                if (!tree && s1 > 0.972 && stand.ground.logs > 0) {
                    push("log", tile, stand.ground.logs, { branch: "log" });
                }
                if (!tree && branch === "mushrooms") {
                    push("fungiFloor", tile, stand.ground.mushrooms, { branch, mode: "floor" });
                }
                if (!tree && branch === "stumps" && s2 > 0.58) {
                    push("fungiStump", tile, stand.ground.stumps + 0.3, { branch, mode: "stump" });
                }
                if (!tree && stand.goods.some(id => ["acorns", "beechnuts", "chestnuts", "berries"].includes(id))
                    && autumnFlora.foliageTurn >= 0.35 && autumnFlora.snowCover < 0.4) {
                    const weight = stand.type === "oakwood" ? 0.35 : stand.type === "chestnut-grove" ? 0.3 : 0.15;
                    push("mast", tile, weight + stand.ground.litter, { branch });
                }
                if (tree && stand.ageClass === "ancient" && s2 > 0.58 && pickSpecies(stand, s3) !== "birch") {
                    push("nest", tile, s2 + 0.2, { branch: "canopy" });
                }

                const faunaGate = (tree && s3 > 0.7) || (!tree && s1 > 0.95);
                if (faunaGate) {
                    const herd = forestFaunaAt(x, y, stand, summerDay);
                    if (herd.length) {
                        const animal = herd[0];
                        const score = 2 + Math.min(1, Number(animal.population) / 30);
                        if (animal.group === "small") push("small", tile, score, { herd: true, animal });
                        if (animal.group === "bird") push("bird", tile, score + 0.1, { herd: true, animal });
                    } else {
                        const fallback = forestFaunaFor(stand, summerDay, climateKey, tree ? s2 : s3);
                        const animal = fallback[0];
                        if (animal) {
                            if (animal.group === "small") push("small", tile, 0.8, { herd: false, animal });
                            if (animal.group === "bird") push("bird", tile, 0.8, { herd: false, animal });
                            if (animal.group === "insect") push("insect", tile, 0.8, { herd: false, animal });
                        }
                    }
                }
            }
        }

        const result = {};
        for (const [key, list] of Object.entries(collections)) {
            result[key] = list
                .sort((a, b) => b.score - a.score || a.tile.y - b.tile.y || a.tile.x - b.tile.x)
                .slice(0, 8)
                .map(({ tile, score, extra }) => ({
                    score: Number(score.toFixed(4)),
                    tile: {
                        x: tile.x, y: tile.y, tree: tile.tree,
                        s1: Number(tile.s1.toFixed(3)), s2: Number(tile.s2.toFixed(3)), s3: Number(tile.s3.toFixed(3)),
                        moisture: Number(tile.moisture.toFixed(3)),
                        temperature: Number(tile.temperature.toFixed(3)),
                        height: Number(tile.height.toFixed(3)),
                        stockRatio: Number(tile.stockRatio.toFixed(3)),
                        type: tile.stand.type, label: tile.stand.label,
                        age: tile.stand.ageClass, soil: tile.stand.ground.soil,
                        clearing: Number(tile.stand.clearing.toFixed(3)),
                        treeChance: Number(tile.stand.treeChance.toFixed(3)),
                        light: Number(tile.stand.light.toFixed(3)),
                        compaction: Number(tile.stand.ground.compaction.toFixed(3)),
                        huntingPressure: Number(tile.stand.ground.huntingPressure.toFixed(3)),
                        flowers: Number(tile.stand.ground.flowers.toFixed(3)),
                        roots: Number(tile.stand.ground.roots.toFixed(3)),
                        stones: Number(tile.stand.ground.stones.toFixed(3)),
                        mushrooms: Number(tile.stand.ground.mushrooms.toFixed(3)),
                        stumps: Number(tile.stand.ground.stumps.toFixed(3)),
                        logs: Number(tile.stand.ground.logs.toFixed(3)),
                        trail: Boolean(tile.stand.ground.trail),
                        goods: tile.stand.goods.slice(0, 12),
                        species: tile.stand.species.slice(0, 3).map(entry => entry.label),
                    },
                    ...extra,
                }));
        }
        return {
            world: { width, height, climate: climateKey, forests },
            summerFlora: { foliageTurn: Number(summerFlora.foliageTurn.toFixed(3)), snowCover: Number(summerFlora.snowCover.toFixed(3)) },
            springBloom: Number(springBloom.toFixed(3)),
            autumnFlora: { foliageTurn: Number(autumnFlora.foliageTurn.toFixed(3)), snowCover: Number(autumnFlora.snowCover.toFixed(3)) },
            candidates: result,
        };
    }, { summerDay, springDay, autumnDay });

    const required = [
        "clearing", "meadow", "sunbeam", "trail", "wetFloor", "loamFloor", "roots", "stones",
        "log", "mast", "blossom", "small", "bird", "insect", "nest", "loneTree",
    ];
    const missing = required.filter(key => !(scan.candidates[key] || []).length);
    if (missing.length) throw new Error("No real tile found for detail motifs: " + missing.join(", "));
    const fungi = [...(scan.candidates.fungiFloor || []), ...(scan.candidates.fungiStump || [])];
    if (!fungi.length) throw new Error("No real tile found for fungi on the forest floor or a stump.");

    const used = new Set();
    const pick = (key, options = {}) => {
        const list = scan.candidates[key] || [];
        const candidate = list.find(entry => options.reuse
            || !used.has(entry.tile.x + ":" + entry.tile.y)) || list[0];
        if (!candidate) throw new Error("Missing candidate for " + key);
        used.add(candidate.tile.x + ":" + candidate.tile.y);
        return candidate;
    };
    const pickAll = (keys, count) => {
        const chosen = [];
        for (const key of keys) {
            for (const candidate of scan.candidates[key] || []) {
                const id = candidate.tile.x + ":" + candidate.tile.y;
                if (used.has(id) || chosen.some(entry => entry.tile.x === candidate.tile.x && entry.tile.y === candidate.tile.y)) continue;
                chosen.push(candidate);
                break;
            }
            if (chosen.length >= count) break;
        }
        for (const candidate of chosen) used.add(candidate.tile.x + ":" + candidate.tile.y);
        return chosen;
    };

    const clearingTile = pick("clearing");
    const meadowTile = pick("meadow");
    const sunbeamTile = pick("sunbeam");
    const trailTile = pick("trail");
    const wetTile = pick("wetFloor");
    const loamTile = pick("loamFloor");
    const rootsTile = pick("roots");
    const stonesTile = pick("stones");
    const logTile = pick("log");
    const mastTile = pick("mast");
    const blossomTile = pick("blossom");
    const smallTile = pick("small");
    const birdTile = pick("bird");
    const insectTile = pick("insect");
    const nestTile = pick("nest");
    const loneTile = pick("loneTree");
    const fungiTiles = pickAll(["fungiStump", "fungiFloor"], 2);

    // Decorations are drawn at a jittered point inside the tile, not at its
    // geometric centre. A tight crop has to follow that point or it frames the
    // neighbouring tree instead of the root, stump or trail.
    const motifFocus = tile => ({
        x: tile.x + 0.25 + tile.s2 * 0.5,
        y: tile.y + 0.3 + tile.s3 * 0.45,
    });
    const animalFocus = tile => {
        // Mirror drawForestFauna: the animal sits off the motif point by a
        // deterministic hash offset. The close-up is a native render centred on
        // that point, not an upscaled crop.
        const animalSeed = tile.tree ? tile.s2 : tile.s3;
        const base = motifFocus(tile);
        return {
            x: base.x + (animalSeed - 0.5) * (8 / 56),
            // The body ellipse is centred on the tile anchor; the feet extend
            // below it, so centring on 1.5 units lower would miss the animal.
            y: base.y,
        };
    };
    // Ancient-tree anchors for the two separate proofs. The nest sits on the
    // left of the crown; the hollow is on the clear lower trunk.
    const nestFocus = tile => ({
        x: motifFocus(tile).x - 0.02,
        y: motifFocus(tile).y - 0.33,
    });
    const hollowFocus = tile => ({
        x: motifFocus(tile).x - 0.09,
        y: motifFocus(tile).y - 0.09,
    });
    const flowerFocus = tile => ({
        x: motifFocus(tile).x + 0.12,
        y: motifFocus(tile).y + 0.15,
    });

    const panels = [
        {
            id: "1.2.1.13", title: "A light-flooded clearing",
            note: "Open sky over flowering grass in the middle of a regenerating wood.",
            frames: [{
                tile: clearingTile.tile, day: summerDay, zoom: 2.4, crop: 700,
                label: "CLEARING", focus: motifFocus(clearingTile.tile),
            }],
        },
        {
            id: "1.2.1.14", title: "A small natural meadow",
            note: "A grassy gap inside the canopy, next to the taller regeneration.",
            frames: [{
                tile: meadowTile.tile, day: summerDay, zoom: 2.4, crop: 700,
                label: "MEADOW", focus: motifFocus(meadowTile.tile),
            }],
        },
        {
            id: "1.2.1.20", title: "Deer trail through the stand",
            note: "The trail branch replaces the leaf carpet on this tile; hooves compact the litter.",
            frames: [{
                tile: trailTile.tile, day: summerDay, zoom: 4.2, crop: 360,
                label: "TRAIL", mark: "TRAIL",
                focus: { ...motifFocus(trailTile.tile), y: motifFocus(trailTile.tile).y + 0.04 },
            }],
        },
        {
            id: "1.2.1.21", title: "Two forest soils",
            note: "Alluvial floor beside the water against a well-drained loam floor; moisture, humus and litter are measured on the tile.",
            frames: [
                { tile: wetTile.tile, day: summerDay, zoom: 3.9, crop: 560, label: "ALLUVIAL · WET", focus: motifFocus(wetTile.tile) },
                { tile: loamTile.tile, day: summerDay, zoom: 3.9, crop: 560, label: "LOAM · WELL-DRAINED", focus: motifFocus(loamTile.tile) },
            ],
        },
        {
            id: "1.2.1.24", title: "Roots, stones and weathered wood",
            note: "Root flares under an ancient tree, scree on a hillside tile, and a storm-thrown log in the litter.",
            frames: [
                { tile: rootsTile.tile, day: summerDay, zoom: 4.2, crop: 420, label: "ROOTS", focus: { ...motifFocus(rootsTile.tile), y: motifFocus(rootsTile.tile).y + 0.04 } },
                { tile: stonesTile.tile, day: summerDay, zoom: 4.2, crop: 420, label: "STONES", focus: motifFocus(stonesTile.tile) },
                { tile: logTile.tile, day: summerDay, zoom: 4.2, crop: 420, label: "FALLEN LOG", focus: { ...motifFocus(logTile.tile), y: motifFocus(logTile.tile).y + 0.05 } },
            ],
        },
        {
            id: "1.2.1.25", title: "Fungi on stumps and deadwood",
            note: "Mushroom clusters on the floor and on a stump left by windthrow.",
            frames: fungiTiles.map(entry => ({
                tile: entry.tile, day: summerDay, zoom: 4.6, crop: 340,
                label: entry.mode === "stump" ? "STUMP" : "FLOOR",
                mark: entry.mode === "stump" ? "STUMP FUNGI" : "FLOOR FUNGI",
                focus: motifFocus(entry.tile),
            })),
        },
        {
            id: "1.2.1.31", title: "Blossom and autumn mast",
            note: "Spring flowers in the light, then acorns and nuts scattered under the same wood in autumn.",
            frames: [
                { tile: blossomTile.tile, day: springDay, zoom: 4.4, crop: 360, label: "SPRING BLOSSOM", mark: "BLOSSOM", focus: flowerFocus(blossomTile.tile) },
                { tile: mastTile.tile, day: autumnDay, zoom: 4.4, crop: 360, label: "AUTUMN MAST", mark: "MAST", focus: { ...motifFocus(mastTile.tile), y: motifFocus(mastTile.tile).y + 0.06 } },
            ],
        },
        {
            id: "1.2.1.33", title: "Squirrels and small mammals",
            note: "A simulated squirrel herd on its home tile, plus a native close-up of the same animal.",
            frames: [
                { tile: smallTile.tile, day: summerDay, zoom: 2.4, crop: 700, label: "TILE", focus: motifFocus(smallTile.tile), animal: smallTile.animal, herd: smallTile.herd },
                { tile: smallTile.tile, day: summerDay, zoom: 5.2, crop: 320, label: "CLOSE-UP", mark: smallTile.animal?.label || "SMALL MAMMAL", focus: animalFocus(smallTile.tile), animal: smallTile.animal, herd: smallTile.herd },
            ],
        },
        {
            id: "1.2.1.34", title: "Owls, woodpeckers and songbirds",
            note: "A resident bird herd drawn on its wood; the habitat fallback is used when no herd owns the tile.",
            frames: [
                { tile: birdTile.tile, day: summerDay, zoom: 2.4, crop: 700, label: "TILE", focus: motifFocus(birdTile.tile), animal: birdTile.animal, herd: birdTile.herd },
                { tile: birdTile.tile, day: summerDay, zoom: 5.2, crop: 320, label: "CLOSE-UP", mark: birdTile.animal?.label || "BIRD", focus: animalFocus(birdTile.tile), animal: birdTile.animal, herd: birdTile.herd },
            ],
        },
        {
            id: "1.2.1.35", title: "Insects, beetles, butterflies and ants",
            note: "A habitat insect mark on a forest tile; it is deliberately small, so the second frame is a native 4.2× close-up.",
            frames: [
                { tile: insectTile.tile, day: summerDay, zoom: 2.4, crop: 700, label: "TILE", focus: motifFocus(insectTile.tile), animal: insectTile.animal, herd: insectTile.herd },
                { tile: insectTile.tile, day: summerDay, zoom: 6.4, crop: 320, label: "CLOSE-UP", mark: insectTile.animal?.label || "INSECT", focus: animalFocus(insectTile.tile), animal: insectTile.animal, herd: insectTile.herd },
            ],
        },
        {
            id: "1.2.1.36", title: "Nests and hollows in ancient trees",
            note: "A nest in the crown and a dark hollow in the trunk of the same old tree; trails and mast supply the feeding places.",
            frames: [
                { tile: nestTile.tile, day: summerDay, zoom: 3.2, crop: 620, label: "CROWN", focus: motifFocus(nestTile.tile) },
                { tile: nestTile.tile, day: summerDay, zoom: 5.0, crop: 360, label: "NEST", mark: "NEST", focus: nestFocus(nestTile.tile) },
                { tile: nestTile.tile, day: summerDay, zoom: 5.0, crop: 360, label: "HOLLOW", mark: "HOLLOW", focus: hollowFocus(nestTile.tile) },
            ],
        },
        {
            id: "1.2.1.50", title: "A lone tree in open country",
            note: "The lone-tree branch outside closed forest, with the same species and crown code as the wood.",
            frames: [{ tile: loneTile.tile, day: summerDay, zoom: 2.4, crop: 700, label: "LONE TREE", focus: motifFocus(loneTile.tile) }],
        },
        {
            id: "1.2.1.57", title: "Sunbeams through a canopy gap",
            note: "The screen-blended shaft and warm pool are drawn only on a clearing tile with the right gap hash.",
            frames: [{
                tile: sunbeamTile.tile, day: summerDay, zoom: 2.4, crop: 620,
                label: "SUN SHAFT", mark: "SUN SHAFT", focus: { ...motifFocus(sunbeamTile.tile), y: motifFocus(sunbeamTile.tile).y - 0.06 },
            }],
        },
    ];
    for (const key of ["small", "bird", "insect"]) {
        const entry = key === "small" ? smallTile : key === "bird" ? birdTile : insectTile;
        console.log("Fauna " + key + ": " + (entry.animal?.label || "none")
            + " (" + (entry.animal?.group || "?") + ", herd=" + Boolean(entry.herd) + ")"
            + " on tile " + entry.tile.x + ", " + entry.tile.y);
    }

    const captured = [];
    for (const panel of panels) {
        const frames = [];
        for (const frame of panel.frames) {
            const focus = frame.focus || { x: frame.tile.x + 0.5, y: frame.tile.y + 0.5 };
            const missesBefore = await page.evaluate(async ({ day, zoom, focusX, focusY }) => {
                const { state } = await import("./js/core/state.js");
                const { clampCamera } = await import("./js/presentation/camera.js");
                const { CELL } = await import("./js/core/config.js");
                const before = Number(state.terrainCacheMisses) || 0;
                state.isPaused = true;
                state.weather = "clear";
                state.dayOfYear = day;
                state.seasonIndex = Math.floor(day / 100) % 4;
                state.zoom = zoom;
                state.zoomTarget = zoom;
                state.zoomLevel = 4;
                state.zoomAnchor = null;
                state.camera.x = focusX * CELL * zoom - state.canvas.width / 2;
                state.camera.y = focusY * CELL * zoom - state.canvas.height / 2;
                state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
                clampCamera();
                return before;
            }, { day: frame.day, zoom: frame.zoom, focusX: focus.x, focusY: focus.y });
            // The decoration layer is cached behind a 140 ms settle window. On a
            // software renderer a single frame can take longer than that, so a
            // fixed timeout occasionally captured the previous view. Wait for the
            // cache miss that proves the new view was rasterised.
            let rebuilt = false;
            for (let attempt = 0; attempt < 50; attempt++) {
                rebuilt = await page.evaluate(async (before) => {
                    const { state } = await import("./js/core/state.js");
                    return (Number(state.terrainCacheMisses) || 0) > before;
                }, missesBefore);
                if (rebuilt) break;
                await page.waitForTimeout(120);
            }
            if (!rebuilt) throw new Error("The terrain decoration cache did not rebuild for " + panel.id + " " + frame.label);
            await page.waitForTimeout(160);
            const crop = frame.crop;
            const buffer = await page.screenshot({
                clip: {
                    x: Math.round((viewport.width - crop) / 2),
                    y: Math.round((viewport.height - crop) / 2),
                    width: crop, height: crop,
                },
                animations: "disabled",
            });
            frames.push({ ...frame, buffer, sha256: crypto.createHash("sha256").update(buffer).digest("hex") });
            if (framesDir) {
                await fs.mkdir(framesDir, { recursive: true });
                await fs.writeFile(path.join(framesDir,
                    panel.id.replace(/\./g, "-") + "-" + frame.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png"), buffer);
            }
            console.log("Captured " + panel.id + " · " + frame.label + " at " + frame.tile.x + ", " + frame.tile.y + " · " + frame.zoom + "×");
        }
        captured.push({ ...panel, frames });
    }

    const sheet = await renderSheet(context, captured, {
        seed, renderer: webgl.renderer, world: scan.world,
        generatedAt: new Date().toISOString(),
        summerDay, springDay, autumnDay,
    });
    const sheetPath = path.join(outputDir, "forest-detail-reference.png");
    await fs.writeFile(sheetPath, sheet);

    const metadata = {
        seed,
        viewport,
        canvas: { width: webgl.width, height: webgl.height },
        renderer: webgl.renderer,
        maxTextureSize: webgl.maxTextureSize,
        generatedAt: new Date().toISOString(),
        world: scan.world,
        days: { summer: summerDay, spring: springDay, autumn: autumnDay },
        flora: { summer: scan.summerFlora, springBloom: scan.springBloom, autumn: scan.autumnFlora },
        panels: captured.map(panel => ({
            id: panel.id,
            title: panel.title,
            note: panel.note,
            frames: panel.frames.map(frame => ({
                label: frame.label,
                tile: frame.tile,
                day: frame.day,
                zoom: frame.zoom,
                crop: frame.crop,
                mark: frame.mark || null,
                focus: frame.focus || { x: frame.tile.x + 0.5, y: frame.tile.y + 0.5 },
                sha256: frame.sha256,
                animal: frame.animal ? {
                    id: frame.animal.id, label: frame.animal.label, group: frame.animal.group,
                    activity: frame.animal.activity, simulatedHerd: Boolean(frame.herd),
                    population: frame.animal.population ?? null,
                } : null,
            })),
        })),
        note: "HUD, entities, fog and weather hidden; simulation paused. Every frame is a real generated tile rendered by the normal terrain pass. Close-ups are native renders centred on the motif, not upscaled crops. No demo props were placed by hand.",
    };
    await fs.writeFile(path.join(outputDir, "forest-detail-reference.json"), JSON.stringify(metadata, null, 2) + "\n");

    const fatal = diagnostics.filter(text => /Terrain WebGL|atlas upload|shader compilation|runtime paused|pageerror/i.test(text));
    console.log("Detail sheet: " + path.relative(gameRoot, sheetPath));
    console.log("Detail metadata: " + path.relative(gameRoot, path.join(outputDir, "forest-detail-reference.json")));
    console.log("Renderer: " + (webgl.renderer || "unknown") + " · canvas " + webgl.width + "×" + webgl.height);
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    if (fatal.length) throw new Error("Forest detail rendering diagnostics were emitted:\n" + fatal.join("\n"));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}

async function renderSheet(browserContext, panels, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 2280, height: 1200 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const cells = panels.map(panel => {
        const frames = panel.frames.map(frame => `
            <div class="shot">
                <img src="${dataUrl(frame.buffer)}" alt="${escapeHtml(panel.title)} — ${escapeHtml(frame.label)}">
                ${frame.mark ? `<i class="marker"><b>${escapeHtml(frame.mark)}</b></i>` : ""}
                <span class="tag">${escapeHtml(frame.label)}</span>
            </div>`).join("");
        const first = panel.frames[0].tile;
        const metrics = [
            "tile " + first.x + ", " + first.y,
            escapeHtml(first.label),
            escapeHtml(first.age),
            escapeHtml(first.soil) + " soil",
            Math.round(first.moisture * 100) + "% moisture",
            first.stockRatio < 1 ? "stock " + Math.round(first.stockRatio * 100) + "%" : null,
            panel.frames.length > 1 && panel.frames[1].tile !== first
                ? "compare " + panel.frames[1].tile.label : null,
        ].filter(Boolean).join(" · ");
        return `
        <figure class="n${panel.frames.length}">
            <div class="shots">${frames}</div>
            <figcaption>
                <span class="id">${escapeHtml(panel.id)}</span>
                <strong>${escapeHtml(panel.title)}</strong>
                <small>${metrics}</small>
                <em>${escapeHtml(panel.note)}</em>
                <span class="frame">SEED ${meta.seed} · ${panel.frames.map(frame => frame.zoom + "×").join(" / ")}</span>
            </figcaption>
        </figure>`;
    }).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet { width: 2220px; padding: 34px 42px 30px; background: radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .13), transparent 48%), linear-gradient(180deg, #0d1719, #081012); }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; max-width: 2000px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
    figure { margin: 0; padding: 7px; border: 1px solid #4d3e29; border-radius: 4px; background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28); display: flex; flex-direction: column; }
    .shots { display: grid; gap: 6px; }
    .n1 .shots { grid-template-columns: 1fr; }
    .n2 .shots { grid-template-columns: repeat(2, 1fr); }
    .n3 .shots { grid-template-columns: repeat(3, 1fr); }
    .shot { position: relative; }
    .shot img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #263330; }
    .tag { position: absolute; left: 5px; bottom: 5px; padding: 2px 5px; border-radius: 2px; background: rgba(6, 12, 10, .72); color: #e6d3a3; font: 700 8px/1.2 Arial, sans-serif; letter-spacing: .1em; }
    .marker { position: absolute; left: 50%; top: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px; border: 1.5px solid rgba(230, 196, 120, .95); border-radius: 50%; box-shadow: 0 0 0 1px rgba(10, 16, 12, .55), 0 0 18px rgba(230, 196, 120, .22); pointer-events: none; }
    .marker::before { content: ""; position: absolute; left: 50%; top: -8px; width: 1px; height: 8px; background: rgba(230, 196, 120, .95); }
    .marker b { position: absolute; left: 50%; bottom: calc(100% + 7px); transform: translateX(-50%); padding: 2px 5px; border: 1px solid rgba(230, 196, 120, .35); border-radius: 2px; background: rgba(6, 12, 10, .86); color: #f0d79a; font: 700 8px/1.2 Arial, sans-serif; letter-spacing: .12em; white-space: nowrap; }
    figcaption { display: flex; flex-direction: column; gap: 4px; padding: 9px 3px 2px; }
    figcaption .id { color: #b6935b; font: 700 9px/1.2 Arial, sans-serif; letter-spacing: .18em; }
    figcaption strong { color: #e3c88f; font: 800 13px/1.25 Arial, sans-serif; letter-spacing: .04em; }
    figcaption small { color: #b9c5b3; font: 10px/1.4 Arial, sans-serif; }
    figcaption em { color: #8eaa7a; font: italic 10.5px/1.35 Georgia, serif; }
    figcaption .frame { color: #7f8d83; font: 8.5px/1.2 Arial, sans-serif; letter-spacing: .1em; margin-top: auto; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · LAUBWALD DETAIL REFERENCE</div>
    <h1>Thirteen close-ups from real forest tiles</h1>
    <p class="deck">Seed ${meta.seed} · ${meta.world.width} × ${meta.world.height} world · ${escapeHtml(meta.world.climate)} climate · ${meta.world.forests}% forest slider · one fixed realm · simulation paused · HUD, entities, fog and weather hidden · summer day ${meta.summerDay}, spring day ${meta.springDay}, autumn day ${meta.autumnDay}</p>
    <div class="grid">${cells}</div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span>
        <span>Real generated tiles, not hand-placed demo props. Close-ups are native renders, not upscaled crops. Human-review reference, not a pixel-diff test.</span>
    </footer>
</div>
</body></html>`;
    await sheet.setContent(html, { waitUntil: "load" });
    await waitForImages(sheet);
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

async function waitForImages(sheet) {
    await sheet.evaluate(() => Promise.all([...document.images].map(image => image.complete
        ? Promise.resolve()
        : new Promise(resolve => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
        }))));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    }[character]));
}
