// ═══════════════════════════════════════════════════════════════
//  TERRAIN RENDERING — baked ground, living detail
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { getHeightAt, getMoistureAt, getTemperatureAt, worldWidth, worldHeight } from '../../world/world.js';
import { drawTerrainGL } from './terrain-webgl.js';
import { flowerBloom, foliageState } from './seasonal-foliage.js';
import { seasonalState } from '../../world/season.js';
import {
    FOREST_SPECIES, forestCanopyShade, forestFaunaFor, forestLineOfSightBlocked, forestMicrofaunaAt,
    forestClearingAt, forestPotentialAt, forestSightProfile, forestStandAt, forestTreeCopies, forestTreeForm,
    pickAgeClass, pickSpecies,
} from '../../world/forest-ecology.js';
import { grasslandProfileAt } from '../../world/grassland-ecology.js';
import { isSteppeSite, steppeProfileAt } from '../../world/steppe-ecology.js';
import { drawSteppe } from './steppe-render.js';
import { grasslandUseAt } from '../../systems/grassland-use.js';
import {
    DETAIL_SETTLE_MS, alignToWorldGrid, detailLayerTransform, detailStepForZoom,
    transformedLayerRect, treeStepForZoom, visibleTileBounds,
} from './terrain-detail-grid.js';
import { getResourceNodeAt } from '../../systems/resource-geography.js';
import { forestFaunaAt, forestFaunaSignAt, forestInsectAt } from '../../systems/forest-fauna.js';
import { forestMistFactor, solarVector } from './daylight.js';
import { drawTropicalBamboo, drawTropicalFloor, drawTropicalPalm, drawTropicalTree, drawTropicalUnderstory } from './tropical-render.js';
import { drawJungleUnderstory } from './jungle-render.js';

const worldW = () => Number(state.worldW) || WORLD_W;
const worldH = () => Number(state.worldH) || WORLD_H;

// Wind is a weather state, not a permanent sine wave. Storms visibly bend the
// canopy; calm weather leaves only the tree's own slow breathing motion.
function windMultiplier() {
    const weather = String(state.weather || "clear").toLowerCase();
    if (weather === "storm") return 2.35;
    if (weather === "rain") return 1.28;
    if (weather === "fog") return 0.72;
    return 1;
}

// ═══════════════════════════════════════════════════════════════
//  GROUND
// ═══════════════════════════════════════════════════════════════

export function drawTerrain(ctx) {
    const zoom = state.zoom;
    const cam = state.camera;
    const canvas = state.canvas;
    const mode = state.terrainRenderer === "canvas"
        ? "canvas"
        : state.terrainRenderer === "webgl"
            ? "webgl"
            : state.terrainAutoMode === "canvas" ? "canvas" : "webgl";

    let glActive = false;
    if (mode === "webgl") glActive = drawTerrainGL();
    if (mode === "webgl" && !glActive) {
        // If the automatic choice guessed wrong, keep the run alive on the
        // Canvas2D path and remember the fallback for the options readout.
        state.terrainAutoMode = "canvas";
        if (state.terrainRenderer === "auto") state.terrainFallback = true;
    }
    state.terrainMode = glActive ? "webgl" : "canvas";

    if (glActive) {
        drawFogOfWar(ctx, zoom, cam, canvas);
        // Trees exist at every zoom level. The overlay is cached and keeps its
        // old raster transformed while the camera moves, then re-rasterises at
        // the settled view instead of blinking out of existence.
        drawOverlayDecorations(ctx, zoom, cam, canvas);
        drawGrasslandWindOverlay(ctx, zoom, cam, canvas);
        return;
    }

    // The cached surface contains baked ground, fog and every decoration. It
    // stays on the compositor as its own layer, so panning only moves it; the
    // layer is rebuilt once after the view settles.
    if (drawCachedDecorations(ctx, zoom, cam, canvas)) {
        drawGrasslandWindOverlay(ctx, zoom, cam, canvas);
        return;
    }
    if (state.terrainCanvasEl) state.terrainCanvasEl.style.opacity = "0";
    drawBakedGround(ctx, zoom, cam, canvas);
    drawFogOfWar(ctx, zoom, cam, canvas);
}

function drawBakedGround(ctx, zoom, cam, canvas) {
    // Safety net for browsers without WebGL2. Smoothing stays on even at the
    // closest zoom; the old hard nearest-neighbour switch was the main source
    // of the visible block pattern.
    const tc = state.terrainCanvas;
    ctx.save();
    ctx.fillStyle = "#0a120a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!tc) {
        ctx.restore();
        return;
    }

    const res = state.terrainResolution || 1;
    const pxPerWorld = CELL * zoom;

    const srcX = Math.max(0, (cam.x / pxPerWorld) * res);
    const srcY = Math.max(0, (cam.y / pxPerWorld) * res);
    const srcW = (canvas.width / pxPerWorld) * res;
    const srcH = (canvas.height / pxPerWorld) * res;

    const sx = Math.max(0, Math.floor(srcX));
    const sy = Math.max(0, Math.floor(srcY));
    const sw = Math.min(tc.width - sx, Math.ceil(srcW) + 2);
    const sh = Math.min(tc.height - sy, Math.ceil(srcH) + 2);

    if (sw <= 0 || sh <= 0) {
        ctx.restore();
        return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
        tc,
        sx, sy, sw, sh,
        Math.floor((sx / res) * pxPerWorld - cam.x),
        Math.floor((sy / res) * pxPerWorld - cam.y),
        Math.ceil((sw / res) * pxPerWorld),
        Math.ceil((sh / res) * pxPerWorld)
    );
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  FOG OF WAR
// ═══════════════════════════════════════════════════════════════

function getFogCanvas() {
    let fog = state.fogCanvas;
    const W = worldW(), H = worldH();
    if (!fog || fog.width !== W || fog.height !== H) {
        fog = document.createElement('canvas');
        fog.width = W;
        fog.height = H;
        state.fogCanvas = fog;
        state.fogDirty = true;
        state.fogExploredRef = null;
    }
    if (state.fogDirty || state.fogExploredRef !== state.explored) {
        const fctx = fog.getContext('2d');
        const image = fctx.createImageData(W, H);
        const pixels = image.data;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (state.explored[x]?.[y]) continue;
                const i = (y * W + x) * 4;
                pixels[i] = 8; pixels[i + 1] = 10; pixels[i + 2] = 8; pixels[i + 3] = 235;
            }
        }
        fctx.putImageData(image, 0, 0);
        state.fogDirty = false;
        state.fogExploredRef = state.explored;
    }
    return fog;
}

function drawFogOfWar(ctx, zoom, cam, canvas) {
    const fog = getFogCanvas();
    const cellPx = CELL * zoom;
    ctx.save();
    // The exploration mask is one cell per tile. Bilinear display would soften
    // the old hard cell edges; the fog itself is still authoritative.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fog, 0, 0, fog.width, fog.height, -cam.x, -cam.y, fog.width * cellPx, fog.height * cellPx);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  CACHED DETAIL LAYER
// ═══════════════════════════════════════════════════════════════

// Trees, understory, rocks, ground grain and shore detail are static for a
// given view. Rasterising them every frame costs hundreds of milliseconds on
// software rendering, so they live on an offscreen canvas and are copied in.
// While the camera or zoom is moving the existing layer is merely shifted;
// once the view settles, it is rebuilt once at the new position.
let detailCanvas = null;
let detailCtx = null;
let detailState = null;
// A detail rebuild is staged offscreen and resumed across frames. The visible
// layer keeps serving the compositor until the replacement is complete, so a
// cold start or a season transition never freezes the frame for the cost of
// the whole decoration raster.
let detailBuild = null;
// Reuse one staging surface. Creating a full canvas for every seasonal rebuild
// produced avoidable graphics/GC churn on the low-end profile. The visible
// detail surface is still separate and remains untouched until the swap.
let detailStageCanvas = null;
let detailStageCtx = null;
const DETAIL_BUILD_SLICE_MS = 4;
// One slice per frame made a rebuild take many wall-clock frames. That kept
// the old layer visible longer and left staging work running into the next
// seasonal window. Spend the remaining frame headroom on another slice while
// keeping a hard per-frame build budget.
const DETAIL_BUILD_FRAME_MS = 4;
// Terrain content changes (exploration, forest growth, roads, seasons) can
// arrive many times per second. Aborting an in-progress multi-frame build on
// every content-key change starves the cache forever: the detail layer never
// finishes and every frame pays for the expensive baked-ground fallback. A
// running build is therefore only abandoned when its viewport or world
// changes. Once a layer is available, content-only refreshes wait for a quiet
// moment, with a bounded maximum age so a changing realm still catches up.
const DETAIL_CONTENT_SETTLE_MS = 500;
const DETAIL_CONTENT_REFRESH_MS = 4000;
let observedView = "";
let lastViewChangeAt = 0;
let lastContentKey = null;
let lastContentChangeAt = 0;
let lastDetailBuildStartedAt = 0;
let overlayCanvas = null;
let overlayCtx = null;
let overlayState = null;
let overlayView = "";
let overlayLastChangeAt = 0;
let canopyShadeSprite = null;
let canopyShadeSpriteColor = "";
let forestVisibilityCache = { key: "", profile: null };
let forestVisibilitySprite = null;
let forestVisibilitySpriteKey = "";
let forestOcclusionField = null;
let forestOcclusionFieldW = 0;
let forestOcclusionFieldH = 0;
let forestOcclusionFieldSeed = -1;
let forestOcclusionFieldTerrain = -1;
let forestOcclusionFieldVisual = -1;
let forestOcclusionFieldEpoch = -1;
let forestOcclusionFieldClimate = "";
let forestOcclusionFieldForests = -1;
let forestSightOriginActive = false;
let forestSightOriginX = 0;
let forestSightOriginY = 0;
let forestSightTileVisibility = null;
let forestSightTileGenerations = null;
let forestSightTileGeneration = 1;
let forestSightTileW = 0;
let forestSightTileH = 0;
let forestSightTileX = NaN;
let forestSightTileY = NaN;
let forestSightTileSeed = -1;
let forestSightTileTerrain = -1;
let forestSightTileVisual = -1;
let forestSightTileEpoch = -1;
let forestSightTileClimate = "";
let forestSightTileForests = -1;
const FOREST_SIGHT_MIN_DISTANCE = 2.1;

function detailWorldKey() {
    return [
        Number(state.worldSeed) || 0,
        worldW(), worldH(),
        Number(state.terrainVersion) || 0,
        Number(state.seaLevel) || 0,
        state.worldOptions?.climate || "temperate",
        Number(state.worldOptions?.forests) || 0,
        state.terrainMode,
    ].join("|");
}

function detailContentKey() {
    const day = Number.isFinite(Number(state.dayOfYear))
        ? Number(state.dayOfYear)
        : (Number(state.seasonIndex) || 0) * 100;
    // Snow and foliage turn slowly. A multi-day bucket avoids a complete
    // re-rasterisation at every day boundary while still following seasons.
    const dayBucket = state.terrainMode === "canvas" ? 12 : 4;
    const hour = Number.isFinite(Number(state.timeOfDay)) ? Number(state.timeOfDay) : 12;
    return [
        detailWorldKey(),
        Math.floor(day / dayBucket),
        // The time-of-day control is manual, not a running clock. A two-hour
        // bucket keeps the canopy shade honest when the player moves the sun
        // without forcing a terrain rebuild on every frame.
        Math.floor(hour / 2),
        Number(state.exploredRevision) || 0,
        Number(state.terrainCacheRevision) || 0,
        Number(state.forestVisualRevision) || 0,
        Number(state.roads?.revision) || 0,
        Number(state.buildingCollisionVersion) || 0,
        // Entity count is not a terrain input. Living units, particles and
        // caravans change constantly; keying the decoration cache on the raw
        // array length rebuilt the whole raster many times per second on a
        // low-end device. Buildings and roads already bump their own revisions.
        Math.max(1, Math.floor(Number(state.year) || 1)),
    ].join("|");
}

function beginDetailBuild(zoom, cam, canvas, key, worldKey) {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    if (!detailStageCanvas || detailStageCanvas.width !== width || detailStageCanvas.height !== height) {
        detailStageCanvas = document.createElement("canvas");
        detailStageCanvas.width = width;
        detailStageCanvas.height = height;
        detailStageCtx = detailStageCanvas.getContext("2d", { alpha: false });
    }
    const staging = detailStageCanvas;
    const stagingCtx = detailStageCtx;
    if (!stagingCtx) return null;
    const setupStart = performance.now();
    stagingCtx.clearRect(0, 0, staging.width, staging.height);
    drawBakedGround(stagingCtx, zoom, cam, canvas);
    if (state.zoomLevel >= 3) drawGroundGrain(stagingCtx, zoom, cam, canvas);
    state.terrainTreeDraws = 0;
    const setupMs = performance.now() - setupStart;
    detailBuild = {
        staging, stagingCtx, zoom,
        camX: cam.x, camY: cam.y,
        key, worldKey,
        renderScale: Number(state.renderScale) || 1,
        width: canvas.width, height: canvas.height,
        cursor: { x: null, y: null },
        startedAt: setupStart,
        workMs: setupMs,
        steps: 1,
    };
    state.terrainDecorationBuildMs = Math.round(setupMs);
    state.terrainBuildThisFrame = setupMs;
    state.terrainCanvasEl.style.opacity = detailState ? "1" : "0";
    return detailBuild;
}

function finishDetailBuild(surfaceCtx) {
    const build = detailBuild;
    if (!build) return false;
    const finishStart = performance.now();
    drawFogOfWar(build.stagingCtx, build.zoom, { x: build.camX, y: build.camY }, {
        width: build.width, height: build.height,
    });
    surfaceCtx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
    surfaceCtx.drawImage(build.staging, 0, 0);
    const finishMs = performance.now() - finishStart;
    build.workMs += finishMs;
    detailState = {
        key: build.key, worldKey: build.worldKey, zoom: build.zoom,
        camX: build.camX, camY: build.camY, renderScale: build.renderScale,
        width: build.width, height: build.height,
    };
    state.terrainDecorationBuildMs = Math.round(build.workMs);
    state.terrainBuildThisFrame = finishMs;
    state.terrainCacheMisses = (Number(state.terrainCacheMisses) || 0) + 1;
    state.terrainCanvasEl.style.transformOrigin = "0 0";
    state.terrainCanvasEl.style.transform = "translate(0px, 0px) scale(1)";
    state.terrainCanvasEl.style.opacity = "1";
    detailBuild = null;
    return true;
}

function advanceDetailBuild(surfaceCtx, canvas) {
    const build = detailBuild;
    if (!build) return false;
    const stepStart = performance.now();
    let done = false;
    // Process at most one hard frame budget. Each slice still stops at a tile
    // boundary, so a single expensive tile can never split its canvas state.
    while (!done && performance.now() - stepStart < DETAIL_BUILD_FRAME_MS) {
        const sliceStart = performance.now();
        const sliceDeadline = Math.min(
            sliceStart + DETAIL_BUILD_SLICE_MS,
            stepStart + DETAIL_BUILD_FRAME_MS
        );
        done = drawTerrainDecorations(
            build.stagingCtx,
            build.zoom,
            { x: build.camX, y: build.camY },
            canvas,
            build.cursor,
            sliceDeadline
        );
        build.steps += 1;
        build.workMs += performance.now() - sliceStart;
    }
    const stepMs = performance.now() - stepStart;
    if (done) return finishDetailBuild(surfaceCtx);
    state.terrainDecorationBuildMs = Math.round(build.workMs);
    state.terrainBuildThisFrame = stepMs;
    state.terrainCanvasEl.style.opacity = detailState ? "1" : "0";
    return false;
}


function ensureTerrainSurface(canvas) {
    let surface = state.terrainCanvasEl || document.getElementById("terrain-canvas");
    if (!surface) return null;
    if (surface.width !== canvas.width || surface.height !== canvas.height) {
        surface.width = Math.max(1, canvas.width);
        surface.height = Math.max(1, canvas.height);
        surface.style.transformOrigin = "0 0";
        surface.style.transform = "";
        detailState = null;
        detailBuild = null;
        observedView = "";
    }
    let context = null;
    try {
        context = surface.getContext("2d", { alpha: false });
    } catch { /* a WebGL canvas cannot become a 2D surface */ }
    if (!context) {
        // Switching renderer at runtime needs a fresh DOM canvas because a
        // canvas keeps its first context type for its whole lifetime.
        const replacement = surface.cloneNode(false);
        replacement.width = surface.width;
        replacement.height = surface.height;
        replacement.style.opacity = "";
        replacement.style.transform = "";
        surface.replaceWith(replacement);
        surface = replacement;
        state.terrainCanvasEl = surface;
        context = surface.getContext("2d", { alpha: false });
    }
    if (!context) return null;
    if (detailCanvas !== surface) {
        detailCanvas = surface;
        detailCtx = context;
        detailState = null;
        detailBuild = null;
        observedView = "";
    }
    return detailCtx;
}

// WebGL paints the ground itself, but the authored trees, understory, rocks
// and shore props are still Canvas artwork. Keep that transparent overlay in
// its own cache so switching to WebGL does not lose a single decoration.
function drawOverlayDecorations(ctx, zoom, cam, canvas) {
    if (!overlayCanvas || overlayCanvas.width !== canvas.width || overlayCanvas.height !== canvas.height) {
        overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = Math.max(1, canvas.width);
        overlayCanvas.height = Math.max(1, canvas.height);
        overlayCtx = overlayCanvas.getContext("2d");
        overlayState = null;
        overlayView = "";
    }
    if (!overlayCtx) return;

    const now = performance.now();
    // Use sub-pixel precision here. Rounding the zoom to three decimals made a
    // slow final interpolation step look "settled" for several frames while
    // the view was still creeping, which rebuilt the cache repeatedly.
    const signature = [
        canvas.width, canvas.height,
        Math.round(cam.x * 10), Math.round(cam.y * 10),
        Math.round(zoom * 100000),
    ].join(":");
    if (signature !== overlayView) {
        overlayView = signature;
        overlayLastChangeAt = now;
    }
    const settled = now - overlayLastChangeAt >= DETAIL_SETTLE_MS;
    const renderScale = Number(state.renderScale) || 1;
    const key = detailContentKey();
    const worldKey = detailWorldKey();
    const surfaceMatches = Boolean(overlayState
        && overlayState.width === canvas.width
        && overlayState.height === canvas.height
        && overlayState.renderScale === renderScale);
    const sameWorld = surfaceMatches && overlayState.worldKey === worldKey;

    if (!sameWorld) {
        // A new realm or canvas cannot be reused. Wait for the view to settle
        // before spending a full decoration rasterisation on a moving camera.
        if (overlayState && !settled) return;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        state.terrainTreeDraws = 0;
        const buildStart = performance.now();
        drawTerrainDecorations(overlayCtx, zoom, cam, canvas);
        state.terrainDecorationBuildMs = Math.round(performance.now() - buildStart);
        state.terrainBuildThisFrame = state.terrainDecorationBuildMs;
        overlayState = {
            key, worldKey, zoom, camX: cam.x, camY: cam.y, renderScale,
            width: canvas.width, height: canvas.height,
        };
        state.terrainCacheMisses = (Number(state.terrainCacheMisses) || 0) + 1;
        ctx.drawImage(overlayCanvas, 0, 0);
        return;
    }

    const contentStale = overlayState.key !== key;
    const viewMoved = Math.abs(overlayState.zoom - zoom) > 0.00005
        || Math.abs(overlayState.camX - cam.x) > 0.02
        || Math.abs(overlayState.camY - cam.y) > 0.02;
    if (settled && (contentStale || viewMoved)) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        state.terrainTreeDraws = 0;
        const buildStart = performance.now();
        drawTerrainDecorations(overlayCtx, zoom, cam, canvas);
        state.terrainDecorationBuildMs = Math.round(performance.now() - buildStart);
        state.terrainBuildThisFrame = state.terrainDecorationBuildMs;
        overlayState = {
            key, worldKey, zoom, camX: cam.x, camY: cam.y, renderScale,
            width: canvas.width, height: canvas.height,
        };
        state.terrainCacheMisses = (Number(state.terrainCacheMisses) || 0) + 1;
        ctx.drawImage(overlayCanvas, 0, 0);
        return;
    }

    // Keep the old raster on screen while panning or zooming. Its world-space
    // positions are preserved by the transform, so trees do not vanish during
    // the 140 ms settle window.
    const transform = detailLayerTransform({
        previousZoom: overlayState.zoom,
        previousCameraX: overlayState.camX,
        previousCameraY: overlayState.camY,
        previousRenderScale: overlayState.renderScale,
        zoom, cameraX: cam.x, cameraY: cam.y, renderScale,
    });
    ctx.drawImage(
        overlayCanvas,
        transform.backingX, transform.backingY,
        overlayCanvas.width * transform.backingScale,
        overlayCanvas.height * transform.backingScale
    );
    state.terrainCacheHits = (Number(state.terrainCacheHits) || 0) + 1;
}

// One screen-space fog/occlusion wall for a closed conifer stand. The profile
// is sampled once per centre tile and day bucket, never per pixel or per tile.
function forestVisibilityProfile(canvas, camera, zoom) {
    if (!state.heightMap) return null;
    const cellPx = CELL * zoom;
    if (!(cellPx > 0)) return null;
    const tx = Math.max(0, Math.min(worldW() - 1, Math.floor((camera.x + canvas.width * 0.5) / cellPx)));
    const ty = Math.max(0, Math.min(worldH() - 1, Math.floor((camera.y + canvas.height * 0.5) / cellPx)));
    const day = Number.isFinite(Number(state.dayOfYear))
        ? Number(state.dayOfYear)
        : (Number(state.seasonIndex) || 0) * 100;
    const key = [
        state.worldSeed, state.terrainVersion, tx, ty, Math.floor(day / 4),
        state.worldOptions?.climate || "temperate", state.worldOptions?.forests ?? 52,
        state.weather || "clear", Math.floor((Number(state.timeOfDay) || 12) * 2),
        Math.round(zoom * 100), canvas.width, canvas.height,
    ].join("|");
    if (forestVisibilityCache.key === key) return forestVisibilityCache.profile;

    const wx = tx + 0.5, wy = ty + 0.5;
    const h = getHeightAt(wx, wy);
    const m = getMoistureAt(wx, wy);
    const temp = getTemperatureAt(wx, wy);
    const forests = state.worldOptions?.forests ?? 52;
    const climate = state.worldOptions?.climate || "temperate";
    let profile = null;
    if (forestPotentialAt({ moisture: m, temperature: temp, height: h, forests, rockLine: 0.92 })) {
        let stockRatio = 1;
        let succession = null;
        try {
            const node = getResourceNodeAt(tx, ty);
            if (node?.forestCapacity > 0) stockRatio = node.forestStock / node.forestCapacity;
            succession = node?.forestSuccession || null;
        } catch { /* a preview can render before resource geography exists */ }
        const stand = forestStandAt(wx, wy, {
            seed: Number(state.worldSeed) || 1, moisture: m, temperature: temp,
            height: h, climate, forests, stockRatio, rockLine: 0.92, succession,
        });
        profile = forestSightProfile(stand, { tileSize: cellPx, viewportWidth: canvas.width, viewportHeight: canvas.height });
    }
    forestVisibilityCache = { key, profile };
    return profile;
}

// A compact Uint8Array is the only allocation in this pass. 0 is unknown, 1 is
// open, and 2..255 stores the quantised sight block. It is rebuilt only when
// the world or the forest stock changes, never per frame or per entity.
function prepareForestOcclusionField() {
    const W = worldW();
    const H = worldH();
    if (!(W > 0 && H > 0)) return false;
    const seed = Number(state.worldSeed) || 0;
    const terrain = Number(state.terrainVersion) || 0;
    const visual = Number(state.forestVisualRevision) || 0;
    const epoch = Number(state.worldEpoch) || 0;
    const climate = String(state.worldOptions?.climate || "temperate");
    const forests = Number(state.worldOptions?.forests ?? 52);
    if (!forestOcclusionField || W !== forestOcclusionFieldW || H !== forestOcclusionFieldH
        || seed !== forestOcclusionFieldSeed || terrain !== forestOcclusionFieldTerrain
        || visual !== forestOcclusionFieldVisual || epoch !== forestOcclusionFieldEpoch
        || climate !== forestOcclusionFieldClimate || forests !== forestOcclusionFieldForests) {
        forestOcclusionField = new Uint8Array(W * H);
        if (!forestSightTileVisibility || W !== forestSightTileW || H !== forestSightTileH) {
            forestSightTileVisibility = new Uint8Array(W * H);
            forestSightTileGenerations = new Uint32Array(W * H);
            forestSightTileGeneration = 1;
            forestSightTileW = W;
            forestSightTileH = H;
        }
        forestOcclusionFieldW = W;
        forestOcclusionFieldH = H;
        forestOcclusionFieldSeed = seed;
        forestOcclusionFieldTerrain = terrain;
        forestOcclusionFieldVisual = visual;
        forestOcclusionFieldEpoch = epoch;
        forestOcclusionFieldClimate = climate;
        forestOcclusionFieldForests = forests;
    }
    return Boolean(state.resourceGeography);
}

function forestOcclusionAt(tx, ty) {
    const W = worldW();
    const H = worldH();
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
    if (!prepareForestOcclusionField()) return 0;
    const index = ty * W + tx;
    const cached = forestOcclusionField[index];
    if (cached) return cached === 1 ? 0 : (cached - 1) / 254;
    let strength = 0;
    const geo = state.resourceGeography;
    if (geo?.forestCapacity && geo.forestCapacity[index] > 0) {
        try {
            const node = getResourceNodeAt(tx, ty);
            strength = Number(node?.forestSightStrength) || 0;
        } catch { strength = 0; }
    }
    if (strength <= 0.01) forestOcclusionField[index] = 1;
    else forestOcclusionField[index] = Math.min(255, 2 + Math.round(Math.min(1, strength) * 252));
    return strength;
}

// The camera centre is the sight anchor because this game has no separate
// avatar entity. The origin is mutable and updated once per rendered frame, so
// the per-entity DDA below allocates nothing.
export function updateForestSightOrigin(canvas, camera, zoom) {
    const cellPx = CELL * zoom;
    if (!canvas || !camera || !(cellPx > 0) || !state.heightMap || !prepareForestOcclusionField()) {
        forestSightOriginActive = false;
        return false;
    }
    const x = (camera.x + canvas.width * 0.5) / cellPx;
    const y = (camera.y + canvas.height * 0.5) / cellPx;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        forestSightOriginActive = false;
        return false;
    }
    forestSightOriginX = Math.max(0, Math.min(worldW(), x));
    forestSightOriginY = Math.max(0, Math.min(worldH(), y));
    forestSightOriginActive = true;

    // Cache line-of-sight per target tile. The generation changes when the
    // camera looks from another tile or the forest changes; a query inside one
    // generation never repeats the DDA. This is the shared cache for entities,
    // markers, effects and cached terrain fauna.
    const tileX = Math.floor(forestSightOriginX);
    const tileY = Math.floor(forestSightOriginY);
    const seed = Number(state.worldSeed) || 0;
    const terrain = Number(state.terrainVersion) || 0;
    const visual = Number(state.forestVisualRevision) || 0;
    const epoch = Number(state.worldEpoch) || 0;
    const climate = String(state.worldOptions?.climate || "temperate");
    const forests = Number(state.worldOptions?.forests ?? 52);
    if (tileX !== forestSightTileX || tileY !== forestSightTileY
        || seed !== forestSightTileSeed || terrain !== forestSightTileTerrain
        || visual !== forestSightTileVisual || epoch !== forestSightTileEpoch
        || climate !== forestSightTileClimate || forests !== forestSightTileForests) {
        forestSightTileX = tileX;
        forestSightTileY = tileY;
        forestSightTileSeed = seed;
        forestSightTileTerrain = terrain;
        forestSightTileVisual = visual;
        forestSightTileEpoch = epoch;
        forestSightTileClimate = climate;
        forestSightTileForests = forests;
        forestSightTileGeneration = (forestSightTileGeneration + 1) >>> 0;
        if (forestSightTileGeneration === 0) {
            forestSightTileGeneration = 1;
            forestSightTileGenerations?.fill(0);
        }
    }
    return true;
}

// True when the target is visible from the camera anchor. Dense conifer tiles
// between the two points block it; the same distance through open ground does
// not. The renderer caches the resulting entity list for 100 ms, so this scan
// never runs once per frame for a moving crowd.
export function isForestSightVisible(x, y) {
    if (!forestSightOriginActive) return true;
    const tx = Math.floor(Number(x));
    const ty = Math.floor(Number(y));
    const W = worldW();
    const H = worldH();
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    if (!forestSightTileVisibility || forestSightTileW !== W || forestSightTileH !== H) {
        return !forestLineOfSightBlocked(
            forestSightOriginX, forestSightOriginY, Number(x), Number(y),
            forestOcclusionAt, FOREST_SIGHT_MIN_DISTANCE
        );
    }
    const index = ty * W + tx;
    if (forestSightTileGenerations[index] !== forestSightTileGeneration) {
        const visible = !forestLineOfSightBlocked(
            forestSightOriginX, forestSightOriginY, Number(x), Number(y),
            forestOcclusionAt, FOREST_SIGHT_MIN_DISTANCE
        );
        forestSightTileVisibility[index] = visible ? 1 : 0;
        forestSightTileGenerations[index] = forestSightTileGeneration;
    }
    return forestSightTileVisibility[index] === 1;
}

function forestVisibilitySpriteFor(color, strength) {
    const key = color + "|" + strength.toFixed(3);
    if (forestVisibilitySprite && forestVisibilitySpriteKey === key) return forestVisibilitySprite;
    const sprite = document.createElement("canvas");
    sprite.width = 256;
    sprite.height = 256;
    const sctx = sprite.getContext("2d");
    if (!sctx) return sprite;
    const gradient = sctx.createRadialGradient(128, 128, 4, 128, 128, 126);
    gradient.addColorStop(0, `rgba(${color},0)`);
    gradient.addColorStop(0.52, `rgba(${color},0)`);
    gradient.addColorStop(0.78, `rgba(${color},${strength * 0.4})`);
    gradient.addColorStop(1, `rgba(${color},${strength})`);
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, 256, 256);
    forestVisibilitySprite = sprite;
    forestVisibilitySpriteKey = key;
    return sprite;
}

// Draw after entities so the atmospheric wall sits over the world, while the
// real per-entity occlusion happens before drawing. It is a single cached
// radial sprite plus four solid edge rectangles: cheap on a low-end GPU and
// independent of how many trees are in the stand. Open stands return
// `limited: false` and cost only the profile lookup.
export function drawForestVisibility(ctx, canvas, camera, zoom) {
    if (!ctx || !canvas || !camera) return;
    const profile = forestVisibilityProfile(canvas, camera, zoom);
    if (!profile?.limited || profile.strength <= 0.01) return;
    const width = canvas.width;
    const height = canvas.height;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const radius = Math.max(1, profile.radiusPx);
    const left = cx - radius;
    const top = cy - radius;
    const size = radius * 2;
    const right = left + size;
    const bottom = top + size;
    ctx.save();
    ctx.fillStyle = `rgba(${profile.color},${profile.strength})`;
    // Fill only outside the sprite. Filling the whole screen and drawing a
    // transparent centre over it would not clear the haze again.
    if (left > 0) ctx.fillRect(0, 0, left, height);
    if (right < width) ctx.fillRect(right, 0, width - right, height);
    const bandLeft = Math.max(0, left);
    const bandWidth = Math.max(0, Math.min(width, right) - bandLeft);
    if (top > 0 && bandWidth > 0) ctx.fillRect(bandLeft, 0, bandWidth, top);
    if (bottom < height && bandWidth > 0) ctx.fillRect(bandLeft, bottom, bandWidth, height - bottom);
    ctx.drawImage(forestVisibilitySpriteFor(profile.color, profile.strength), left, top, size, size);
    ctx.restore();
}

function drawPreviousDetailLayer(ctx, zoom, cam, canvas) {
    if (!detailState) return false;
    const renderScale = Number(state.renderScale) || 1;
    // Keep the existing raster visible while the camera or zoom is moving.
    // Trees and ground detail are world objects, so the whole layer can be
    // translated and scaled without losing any of them. Newly exposed strips
    // are filled with the cheap baked surface until the settled rebuild.
    const transform = detailLayerTransform({
        previousZoom: detailState.zoom,
        previousCameraX: detailState.camX,
        previousCameraY: detailState.camY,
        previousRenderScale: detailState.renderScale,
        zoom, cameraX: cam.x, cameraY: cam.y, renderScale,
    });
    // A stationary camera produces the same transform every frame. Reassigning
    // it anyway marks the large terrain layer dirty and forces a compositor
    // commit on software renderers. Only write when the composited value
    // actually changes; a moving camera still updates immediately.
    const surface = state.terrainCanvasEl;
    if (surface) {
        const transformValue = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
        if (surface.style.transformOrigin !== "0 0") surface.style.transformOrigin = "0 0";
        if (surface.style.transform !== transformValue) surface.style.transform = transformValue;
        if (surface.style.opacity !== "1") surface.style.opacity = "1";
    }
    drawDetailLayerGaps(ctx, zoom, cam, canvas, transform);
    state.terrainCacheHits = (Number(state.terrainCacheHits) || 0) + 1;
    return true;
}

function drawCachedDecorations(ctx, zoom, cam, canvas) {
    const surfaceCtx = ensureTerrainSurface(canvas);
    if (!surfaceCtx) return false;

    const now = performance.now();
    const signature = [
        canvas.width, canvas.height,
        Math.round(cam.x * 10), Math.round(cam.y * 10),
        Math.round(zoom * 100000),
    ].join(":");
    if (signature !== observedView) {
        observedView = signature;
        lastViewChangeAt = now;
    }
    const settled = now - lastViewChangeAt >= DETAIL_SETTLE_MS;
    const key = detailContentKey();
    if (key !== lastContentKey) {
        lastContentKey = key;
        lastContentChangeAt = now;
    }
    const contentSettled = now - lastContentChangeAt >= DETAIL_CONTENT_SETTLE_MS;
    const worldKey = detailWorldKey();
    const renderScale = Number(state.renderScale) || 1;

    // Resume or abandon the staged layer before deciding whether a new one is
    // needed. A changed camera, content key or surface can never be mixed into
    // the raster that is currently being built.
    if (detailBuild) {
        const build = detailBuild;
        // The staged raster belongs to its viewport. A changed content key is
        // not a reason to discard that work: the completed layer stays visible
        // and a later refresh picks up newer content. Only a different
        // surface, world, zoom or camera invalidates the staged pixels.
        const matches = build.width === canvas.width
            && build.height === canvas.height
            && build.renderScale === renderScale
            && build.worldKey === worldKey
            && Math.abs(build.zoom - zoom) <= 0.00005
            && Math.abs(build.camX - cam.x) <= 0.02
            && Math.abs(build.camY - cam.y) <= 0.02;
        if (!matches) {
            detailBuild = null;
        } else {
            const finished = advanceDetailBuild(surfaceCtx, canvas);
            if (finished) return true;
            // Without a previous visible layer the cheap baked surface is the
            // fallback until the staged layer is complete.
            return detailState ? drawPreviousDetailLayer(ctx, zoom, cam, canvas) : false;
        }
    }

    if (!detailState) {
        // The first layer is started immediately; later rebuilds wait for the
        // camera to settle so a moving view does not create throwaway rasters.
        lastDetailBuildStartedAt = now;
        beginDetailBuild(zoom, cam, canvas, key, worldKey);
        return false;
    }

    const surfaceMatches = detailState.width === canvas.width
        && detailState.height === canvas.height
        && detailState.renderScale === renderScale;
    const worldMatches = detailState.worldKey === worldKey;
    if (!surfaceMatches || !worldMatches) {
        state.terrainCanvasEl.style.transformOrigin = "0 0";
        state.terrainCanvasEl.style.opacity = "0";
        detailState = null;
        if (!settled) return false;
        beginDetailBuild(zoom, cam, canvas, key, worldKey);
        return false;
    }

    const contentStale = detailState.key !== key;
    const viewMoved = Math.abs(detailState.zoom - zoom) > 0.00005
        || Math.abs(detailState.camX - cam.x) > 0.02
        || Math.abs(detailState.camY - cam.y) > 0.02;
    // Never replace a usable layer just because content is still changing.
    // The old raster keeps the world visible and cheap while a refresh waits
    // for a quiet window (or for the bounded maximum age).
    const contentRefreshDue = settled && contentStale
        && (contentSettled || now - lastDetailBuildStartedAt >= DETAIL_CONTENT_REFRESH_MS);
    if (contentRefreshDue || (settled && viewMoved)) {
        lastDetailBuildStartedAt = now;
        beginDetailBuild(zoom, cam, canvas, key, worldKey);
        return drawPreviousDetailLayer(ctx, zoom, cam, canvas);
    }

    return drawPreviousDetailLayer(ctx, zoom, cam, canvas);
}

function drawDetailLayerGaps(ctx, zoom, cam, canvas, transform) {
    const rect = transformedLayerRect(transform, canvas.width, canvas.height, Number(state.renderScale) || 1);
    if (rect.width <= 0 || rect.height <= 0) return;
    // A settled layer covers the whole viewport. There is no uncovered strip
    // to fill; the clipped ground/fog blit would otherwise reprocess a
    // full-screen texture every frame on a low-end software rasteriser.
    if (rect.x <= 0 && rect.y <= 0 && rect.x + rect.width >= canvas.width && rect.y + rect.height >= canvas.height) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    // The detail layer covers the inner rectangle. Everything outside it has
    // to show the baked ground and fog immediately; otherwise a fast pan or a
    // zoom reveals the dark stage background.
    ctx.clip("evenodd");
    drawBakedGround(ctx, zoom, cam, canvas);
    drawFogOfWar(ctx, zoom, cam, canvas);
    ctx.restore();
}

// At rooftop distance the full bark, lobe and twig artwork is smaller than a
// few pixels. This impostor keeps the tree's position, species colour and
// silhouette, but avoids thousands of invisible path operations. It is still
// a tree at that tile: it never fades out because the camera moved.
function drawDistantTree(ctx, px, py, cellPx, tick, s2, s3, stand, climate, dayOfYear, sun = null) {
    const s = Math.max(0.35, cellPx / 48);
    const definition = FOREST_SPECIES[stand?.forest ? pickSpecies(stand, s3) : 'oak'] || FOREST_SPECIES.oak;
    const treeForm = stand?.forest ? forestTreeForm(stand, s2) : null;
    const ageScale = treeForm?.ageScale ?? (stand?.forest ? Math.max(0.55, Number(stand.ageScale) || 1) : 1);
    const heightScale = treeForm?.heightScale || 1;
    const crownScale = treeForm?.crownScale || 1;
    const trunkScale = treeForm?.trunkScale || 1;
    const sway = Math.sin(tick * 0.045 + s2 * 13) * Math.min(1.2, s * 0.9) * windMultiplier()
        + (treeForm?.lean || 0) * s * 0.6;
    const trunkH = (10 + definition.height * 3) * s * ageScale * heightScale;
    const baseY = py + 5.5 * s;
    const crownY = baseY - trunkH * 0.78;
    const radius = Math.max(0.9, (8.4 + s2 * 2.5) * s * definition.crown * ageScale * crownScale);
    const bare = !definition.conifer && climate.snowCover > 0.55 && !['oak', 'beech', 'linden'].includes(definition.id);
    const turn = Math.max(0, Math.min(1, climate.foliageTurn + (definition.id === 'birch' ? 0.12 : 0)));

    ctx.save();
    ctx.lineCap = 'round';
    if (definition.conifer) {
        // At impostor distance the full seasonal sampler is unnecessary; the
        // climate state already carries the same turn and snow values. Larch is
        // the only conifer that drops its silhouette in winter.
        const foliage = {
            turn: climate.foliageTurn,
            leaf: definition.deciduousNeedles ? Math.max(0, 1 - climate.foliageTurn * 1.15) : 1,
            snow: climate.snowCover * (definition.snowRetention || 1),
            bare: Boolean(definition.deciduousNeedles && climate.snowCover > 0.45),
        };
        const height = (11 + definition.height * 16) * s * ageScale * heightScale * (stand?.treeline ? 0.62 : 1);
        const trunkW = Math.max(0.65, definition.trunk * 1.7 * s * trunkScale);
        ctx.fillStyle = definition.bark;
        ctx.fillRect(px - trunkW * 0.5, py + 2 * s, trunkW, height * 0.9);
        if (foliage.bare) {
            ctx.strokeStyle = definition.barkLight;
            ctx.lineWidth = Math.max(0.55, s * 0.8);
            for (let tier = 0; tier < 4; tier++) {
                const y = py + 2 * s - height * (0.18 + tier * 0.19);
                const reach = (8 - tier * 1.1) * s * ageScale;
                ctx.beginPath();
                ctx.moveTo(px, y);
                ctx.lineTo(px - reach, y + reach * 0.34);
                ctx.moveTo(px, y);
                ctx.lineTo(px + reach, y + reach * 0.34);
                ctx.stroke();
            }
        } else {
            const needle = mixHex(definition.summer[0], definition.autumn[0], foliage.turn);
            const light = mixHex(definition.summer[1], definition.autumn[1], foliage.turn);
            const tiers = definition.crownShape === 'crown' ? 3 : 5;
            for (let tier = 0; tier < tiers; tier++) {
                const base = py + 2 * s - height * (0.12 + tier * 0.19);
                const top = base - height * 0.36;
                const width = (8.4 - tier * 1.18) * s * definition.crown * ageScale * crownScale;
                ctx.fillStyle = tier % 2 ? light : needle;
                ctx.beginPath();
                ctx.moveTo(px + sway, top);
                ctx.lineTo(px - width, base);
                ctx.lineTo(px + width, base);
                ctx.closePath();
                ctx.fill();
            }
            if (foliage.snow > 0.22) {
                ctx.globalAlpha = Math.min(0.85, foliage.snow);
                ctx.fillStyle = '#eef6fb';
                ctx.beginPath();
                ctx.ellipse(px + sway, py + 2 * s - height * 0.76, 3.4 * s * definition.crown, 1.2 * s, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
        return;
    }
    if (bare) {
        ctx.strokeStyle = definition.bark;
        ctx.lineWidth = Math.max(0.65, s * (definition.trunk + 0.4));
        ctx.beginPath();
        ctx.moveTo(px, baseY);
        ctx.lineTo(px + sway, crownY + radius * 0.25);
        ctx.moveTo(px + sway * 0.5, crownY + radius * 0.55);
        ctx.lineTo(px - radius * 0.65, crownY - radius * 0.1);
        ctx.moveTo(px + sway * 0.5, crownY + radius * 0.35);
        ctx.lineTo(px + radius * 0.7, crownY - radius * 0.2);
        ctx.stroke();
        if (definition.id === 'oak' || definition.id === 'beech') {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#85562e';
            ctx.beginPath();
            ctx.ellipse(px + sway, crownY - radius * 0.1, radius * 0.8, radius * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        const crown = mixHex(definition.summer[0], definition.autumn[0], turn);
        const light = mixHex(definition.summer[1], definition.autumn[1], turn);
        ctx.fillStyle = definition.bark;
        ctx.fillRect(px - Math.max(0.5, s * 0.75), baseY - trunkH * 0.72, Math.max(0.9, s * 1.5), trunkH * 0.78);
        ctx.fillStyle = crown;
        ctx.beginPath();
        ctx.ellipse(px + sway, crownY, radius, radius * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = light;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.ellipse(px - radius * 0.24 + sway, crownY - radius * 0.22, radius * 0.52, radius * 0.4, -0.2, 0, Math.PI * 2);
        ctx.fill();
        if (climate.snowCover > 0.18) {
            ctx.globalAlpha = Math.min(0.9, climate.snowCover * 0.9);
            ctx.fillStyle = '#eef6fb';
            ctx.beginPath();
            ctx.ellipse(px + sway, crownY - radius * 0.48, radius * 0.62, radius * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawTerrainDecorations(ctx, zoom, cam, canvas, cursor = null, deadline = Infinity) {
    if (!state.heightMap) return;
    const cellPx = CELL * zoom;
    const tick = state.tick;
    const sea = state.seaLevel ?? 0.33;
    const dayOfYear = Number.isFinite(Number(state.dayOfYear))
        ? Number(state.dayOfYear)
        : (Number(state.seasonIndex) || 0) * 100;
    const climateKey = state.worldOptions?.climate || "temperate";
    const climate = seasonalState(dayOfYear, climateKey);
    const seasonName = ["spring", "summer", "autumn", "winter"][climate.season] || "summer";
    const hour = Number(state.timeOfDay);
    const sun = solarVector(Number.isFinite(hour) ? hour : 12, seasonName);
    const forests = state.worldOptions?.forests ?? 52;
    const bounds = visibleTileBounds({
        cellPx, cameraX: cam.x, cameraY: cam.y, width: canvas.width, height: canvas.height,
        worldWidth: worldW(), worldHeight: worldH(),
    });
    // The ground-detail lattice is anchored to the world. Its phase therefore
    // cannot change when the camera moves; the old implementation restarted
    // the grid at the viewport edge and made trees jump between frames.
    const step = detailStepForZoom(zoom);
    const gridX = alignToWorldGrid(bounds.startX, step);
    const gridY = alignToWorldGrid(bounds.startY, step);
    // Trees use their own world-anchored lattice. At landscape distance a
    // 2×2-tile sample is enough to read as woodland; at district distance and
    // closer every tree is present. The lattice is independent of the camera,
    // so panning can never add or remove a tree from the sampled set.
    const treeStep = treeStepForZoom(zoom);
    const treeGridX = alignToWorldGrid(bounds.startX, treeStep);
    const treeGridY = alignToWorldGrid(bounds.startY, treeStep);
    const distant = cellPx < 19;

    let x = Number.isInteger(cursor?.x) ? cursor.x : bounds.startX;
    let y = Number.isInteger(cursor?.y) ? cursor.y : bounds.startY;
    for (; x < bounds.endX; x++) {
        const detailColumn = x >= gridX && (x - gridX) % step === 0;
        const treeColumn = x >= treeGridX && (x - treeGridX) % treeStep === 0;
        for (; y < bounds.endY; y++) {
            // Resume at a tile boundary. The expensive work for one tile stays
            // inside this frame; the next chunk starts exactly here.
            if (deadline !== Infinity && performance.now() >= deadline) {
                if (cursor) { cursor.x = x; cursor.y = y; }
                return false;
            }
            if (!state.explored[x]?.[y]) continue;
            const detail = detailColumn && y >= gridY && (y - gridY) % step === 0;
            const treeSample = treeColumn && y >= treeGridY && (y - treeGridY) % treeStep === 0;
            // Most tiles are neither on the coarse ground lattice nor on the
            // tree lattice. Do not pay for three world samples, four hashes and
            // an ecosystem query only to discard the tile afterwards.
            if (!detail && !treeSample) continue;

            const wx = x + 0.5, wy = y + 0.5;
            const h = getHeightAt(wx, wy);
            const m = getMoistureAt(wx, wy);
            const temp = getTemperatureAt(wx, wy);
            const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            const s1 = (seed % 1000) / 1000;
            // Keep the derived rolls unsigned. A signed right shift made s3
            // negative on roughly half the tiles, so `s3 < coniferChance` was
            // true even when the chance was zero and every broadleaf forest
            // filled with conifer silhouettes.
            const s2 = ((seed >>> 7) % 1000) / 1000;
            const s3 = ((seed >>> 13) % 1000) / 1000;

            const px = x * cellPx - cam.x + cellPx * (0.25 + s2 * 0.5);
            const py = y * cellPx - cam.y + cellPx * (0.3 + s3 * 0.45);
            const above = h - sea;

            // Only the sampled ground grid needs animated water and shoreline
            // dressing; tree placement is independent of that grid.
            if (above < 0) {
                if (detail && zoom >= 0.5 && s1 > 0.72) drawWaterGlint(ctx, px, py, cellPx, tick, s1);
                if (detail && above > -0.02 && s1 > 0.5) drawShoreFoam(ctx, px, py, cellPx, tick, s2, zoom);
                continue;
            }

            const shoreDir = detail && above > -0.01 && above < 0.09 ? shoreDirection(x, y, sea) : null;
            if (above < 0.055 && m > 0.3) {
                if (detail) {
                    if (shoreDir && above < 0.016) drawWetEdge(ctx, px, py, cellPx, shoreDir, s1);
                    if (s1 > 0.42) drawReeds(ctx, px, py, cellPx, s1, s2, temp, shoreDir, climate.foliageTurn, climate.snowCover);
                    else if (s1 > 0.30) drawShoreStones(ctx, px, py, cellPx, s1, s2);
                    else if (s1 > 0.27) drawDriftwood(ctx, px, py, cellPx, s1, shoreDir);
                }
                continue;
            }

            // A stand can reach above the summer snow line. Test the forest
            // potential before the snow/rock exits below: otherwise the early
            // `continue` erased mountain-conifer, mixed-conifer and snowbreak
            // crowns from the high-altitude formations entirely.
            const potentialForest = forestPotentialAt({ moisture: m, height: h, forests, rockLine: 0.92 });
            // Neither the detail lattice nor the tree lattice needs this tile.
            // Do this before forestStandAt(), whose species wave is much more
            // expensive than the profile or the cheap forest gate.
            if (!detail && !treeSample) continue;

            // Snowfields get sparse rocks and drifts, not grass. The alpine
            // line rises in summer and sinks in winter, so peaks do not stay
            // painted white through July while the lowlands are green.
            if (temp < 0.22 || h > 0.92 - climate.snowCover * 0.05) {
                if (!potentialForest) {
                    if (detail) {
                        if (s1 > 0.72) drawSnowTuft(ctx, px, py, cellPx, s1);
                        else if (s1 > 0.62) drawRock(ctx, px, py, cellPx, zoom, true);
                    }
                    continue;
                }
            }

            // Mountain rock and scree sit above the woodland belt.
            if (h > 0.88 && s1 > 0.4 && !potentialForest) {
                if (detail) drawRock(ctx, px, py, cellPx, zoom, false);
                continue;
            }

            // Most of the landscape is bare ground. Skip the ecosystem work
            // entirely unless this tile is on either the ground-detail or the
            // tree lattice. This keeps a full-world landscape rebuild cheap.
            // A forest clearance is meadow too: the same profile and the same
            // wind overlay must be reachable inside a wooded landscape, not
            // only in worlds where the forest slider is at zero. The forest
            // gate is kept cheap and exact via forestClearingAt().
            let stand = null;
            if (potentialForest) {
                let stockRatio = 1;
                let succession = null;
                try {
                    const node = getResourceNodeAt(x, y);
                    if (node?.forestCapacity > 0) stockRatio = node.forestStock / node.forestCapacity;
                    succession = node?.forestSuccession || null;
                } catch { /* a preview can render before resource geography exists */ }
                stand = forestStandAt(x + 0.5, y + 0.5, {
                    seed: Number(state.worldSeed) || 1, moisture: m, temperature: temp,
                    height: h, climate: climateKey, forests, stockRatio, rockLine: 0.92,
                    succession,
                });
            }
            const clearingMeadow = Boolean(stand?.forest && stand.clearing > 0.22);
            const grassContext = (!potentialForest || clearingMeadow) && h >= sea && h < 0.86
                ? {
                    seed: Number(state.worldSeed) || 1, moisture: m, temperature: temp, height: h,
                    climate: climateKey, aridity: state.worldOptions?.aridity ?? 50, forests, seaLevel: sea, dayOfYear, year: Number(state.year) || 1,
                    hour, weather: state.weather || "clear", wind: windMultiplier(),
                    use: grasslandUseAt(x, y),
                }
                : null;
            // Steppe is open, arid grassland, not a meadow recoloured. It keeps
            // the same terrain lattice but owns its grasses, thorn scrub,
            // fauna, hazards and seasonal colour. Forest clearings stay meadow.
            const steppe = grassContext && !potentialForest && isSteppeSite(x + 0.5, y + 0.5, grassContext)
                ? steppeProfileAt(x + 0.5, y + 0.5, grassContext)
                : null;
            const grass = grassContext ? (steppe || grasslandProfileAt(x + 0.5, y + 0.5, grassContext)) : null;
            const meadowTree = Boolean(treeSample && grass && grass.treeChance > 0 && s1 < grass.treeChance);
            if (!potentialForest && !meadowTree && !detail) continue;

            // A forest is an ecosystem, not a tree sprinkle: floor, understorey,
            // gaps, deadwood and fauna are drawn from the same stand definition.
            if (stand?.forest) {
                const tree = treeSample && s1 < stand.treeChance;
                if (detail && zoom >= 0.55) {
                    drawForestGround(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey);
                    drawForestFloor(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey, tick, zoom);
                    // The canopy shade belongs on the floor, below trunks and
                    // understorey. One cached soft sprite per tile is far cheaper
                    // than a per-pixel screen pass and follows the same world
                    // lattice as the floor it darkens.
                    drawCanopyShade(ctx, px, py, cellPx, stand, sun, climate.snowCover);
                    if (zoom >= 0.8) drawMast(ctx, px, py, cellPx, stand, dayOfYear, climateKey);
                    const mist = forestMistFactor(Number.isFinite(hour) ? hour : 12, m, seasonName, state.weather);
                    if (zoom >= 0.85 && mist > 0.04) drawForestMist(ctx, px, py, cellPx, stand, s2, tick, mist);
                }
                if (tree) {
                    // Dense stands need overlapping crowns to read as a wood. The
                    // extra copies are deterministic per tile and stay inside the
                    // tile, so panning cannot reveal or hide a tree. At landscape
                    // distance a single LOD tree is enough and much cheaper.
                    const copies = distant ? 1 : forestTreeCopies(stand);
                    for (let copy = 0; copy < copies; copy++) {
                        const spread = copy === 0 ? 0 : cellPx * 0.24;
                        const ox = copy === 0 ? 0 : (copy === 1 ? (s2 - 0.5) * spread : (s3 - 0.5) * -spread);
                        const oy = copy === 0 ? 0 : (copy === 1 ? (s3 - 0.5) * spread * 0.7 : (s1 - 0.5) * -spread * 0.6);
                        const r1 = (s1 + copy * 0.31) % 1;
                        const r2 = (s2 + copy * 0.27) % 1;
                        const r3 = (s3 + copy * 0.43) % 1;
                        state.terrainTreeDraws = (Number(state.terrainTreeDraws) || 0) + 1;
                        if (distant) drawDistantTree(ctx, px + ox, py + oy, cellPx, tick, r2, r3, stand, climate, dayOfYear, sun);
                        else drawTree(ctx, px + ox, py + oy, cellPx, tick, r1, r2, r3, zoom, temp, m, dayOfYear, climateKey, shoreDir, stand, sun);
                    }
                    // Jungle thickets live below and between crowns. The normal
                    // tree branch skips understorey entirely, which would hide
                    // walls, bamboo and thorn scrub on the densest tiles. Draw
                    // this one bounded foreground pass after the trunks so the
                    // interior still reads as jungle rather than lawn.
                    if (stand.jungle && detail && zoom >= 0.5) {
                        // Optional browser-proof timing. This is the bounded
                        // foreground pass that runs after the crowns; it is
                        // deliberately measured at the call site so the cost
                        // cannot hide inside the whole-world draw timer.
                        const jungleProbe = state.performanceProbe?.jungle;
                        const jungleStarted = jungleProbe ? performance.now() : 0;
                        drawJungleUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3);
                        if (jungleStarted) {
                            const elapsed = performance.now() - jungleStarted;
                            jungleProbe.understoryCalls += 1;
                            jungleProbe.understoryDirectCalls += 1;
                            jungleProbe.understoryMs += elapsed;
                            if (elapsed > jungleProbe.understoryMaxMs) jungleProbe.understoryMaxMs = elapsed;
                        }
                    }
                    if (detail && zoom >= 0.9 && s3 > 0.7) drawForestFaunaScene(ctx, px, py, cellPx, stand, dayOfYear, climateKey, s2, zoom, x, y, tick);
                    // A shaft belongs between trunks too, not only in an empty
                    // clearing. Dense stands still lose most of it to the canopy.
                    if (detail && zoom >= 0.8 && s2 > 0.62) drawCanopyLight(ctx, px, py, cellPx, stand, s1, tick, sun);
                    continue;
                }
                if (!detail) continue;
                if (stand.clearing > 0.28) {
                    if (zoom >= 0.34) drawForestClearing(ctx, px, py, cellPx, stand, s1, s2, dayOfYear, climateKey);
                    if (zoom >= 0.8 && s2 > 0.55) drawCanopyLight(ctx, px, py, cellPx, stand, s1, tick, sun);
                } else if (zoom >= 0.5) {
                    drawUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey);
                }
                if (clearingMeadow && grass && zoom >= 0.34) {
                    drawGrassland(ctx, px, py, cellPx, grass, s1, s2, s3, tick, zoom, sun, dayOfYear, climateKey);
                }
                if (zoom >= 0.75 && s1 > 0.95) drawForestFaunaScene(ctx, px, py, cellPx, stand, dayOfYear, climateKey, s3, zoom, x, y, tick);
                if (zoom >= 0.9 && s1 > 0.972) drawFallenLog(ctx, px, py, cellPx, stand, s2, s3, dayOfYear, climateKey);
                continue;
            }

            if (meadowTree && grass.trees.length) {
                state.terrainTreeDraws = (Number(state.terrainTreeDraws) || 0) + grass.trees.length;
                for (const tree of grass.trees) {
                    drawGrasslandTree(ctx, px, py, cellPx, tree, grass, tick);
                }
                continue;
            }
            if (!detail) continue;

            // Open grass, meadow, steppe and hill pasture are one ecological
            // surface. The profile decides whether this tile is short turf,
            // tall hay, wet meadow, dry chalk, orchard or mountain pasture.
            if (grass && zoom >= 0.34) {
                if (grass.steppe) drawSteppe(ctx, px, py, cellPx, grass, s1, s2, s3, tick, zoom, sun, dayOfYear, climateKey);
                else if (temp > 0.68 && m < 0.3 && s1 > 0.86) drawCactus(ctx, px, py, cellPx, s1);
                else drawGrassland(ctx, px, py, cellPx, grass, s1, s2, s3, tick, zoom, sun, dayOfYear, climateKey);
            }
        }
        y = bounds.startY;
    }
    if (cursor) { cursor.x = x; cursor.y = y; }
    return true;
}

// High-frequency ground grain: the baked texture carries the broad colour
// field, this adds tile-scale variation so close inspection never reads as
// one blurred gradient.
function drawGroundGrain(ctx, zoom, cam, canvas) {
    if (!state.heightMap) return;
    const cellPx = CELL * zoom;
    if (cellPx < 14) return;
    const W = worldW(), H = worldH();
    const sea = state.seaLevel ?? 0.33;
    const startX = Math.max(0, Math.floor(cam.x / cellPx) - 1);
    const startY = Math.max(0, Math.floor(cam.y / cellPx) - 1);
    const endX = Math.min(W, Math.ceil((cam.x + canvas.width) / cellPx) + 1);
    const endY = Math.min(H, Math.ceil((cam.y + canvas.height) / cellPx) + 1);

    ctx.save();
    for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
            if (!state.explored[x]?.[y]) continue;
            const h = getHeightAt(x + 0.5, y + 0.5);
            if (h < sea) continue;
            const m = getMoistureAt(x + 0.5, y + 0.5);
            const temp = getTemperatureAt(x + 0.5, y + 0.5);
            const seed = ((x * 2654435761) ^ (y * 40503)) >>> 0;
            const a = (seed % 1000) / 1000;
            const b = ((seed >> 8) % 1000) / 1000;
            const px = x * cellPx - cam.x;
            const py = y * cellPx - cam.y;

            const dry = m < 0.42;
            const cold = temp < 0.3;
            const tone = cold ? "235,242,246" : dry ? "226,206,150" : m > 0.66 ? "22,50,26" : "42,74,38";
            ctx.fillStyle = `rgba(${tone},${0.028 + a * 0.04})`;
            const size = cellPx * (0.14 + b * 0.24);
            ctx.fillRect(px + a * cellPx * 0.62, py + b * cellPx * 0.52, size, size * (0.65 + a * 0.6));

            if (zoom >= 0.9 && a > 0.55) {
                ctx.fillStyle = `rgba(${cold ? "250,252,255" : "14,32,16"},${0.05 + b * 0.06})`;
                for (let i = 0; i < 2; i++) {
                    const sx = px + ((a * 13 + i * 7) % 10) / 10 * cellPx;
                    const sy = py + ((b * 17 + i * 11) % 10) / 10 * cellPx;
                    ctx.fillRect(sx, sy, Math.max(1, cellPx * 0.05), Math.max(1, cellPx * 0.03));
                }
            }
        }
    }
    ctx.restore();
}

function drawWaterGlint(ctx, px, py, cellPx, tick, s1) {
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(tick * 0.03 + s1 * 9));
    const width = cellPx * (0.1 + s1 * 0.16);
    ctx.strokeStyle = `rgba(206,236,240,${0.10 + pulse * 0.16})`;
    ctx.lineWidth = Math.max(0.8, cellPx * 0.022);
    ctx.beginPath();
    ctx.moveTo(px - width, py);
    ctx.quadraticCurveTo(px, py - cellPx * 0.05, px + width, py);
    ctx.stroke();
}

function drawShoreFoam(ctx, px, py, cellPx, tick, s2, zoom) {
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(tick * 0.04 + s2 * 11));
    ctx.strokeStyle = `rgba(232,244,240,${0.18 + pulse * 0.18})`;
    ctx.lineWidth = Math.max(0.8, cellPx * 0.03);
    ctx.beginPath();
    ctx.arc(px, py, cellPx * (0.18 + pulse * 0.1), Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
}

const COLOR_CACHE = new Map();

function rgbTriplet(hex) {
    let value = COLOR_CACHE.get(hex);
    if (value) return value;
    const raw = hex.replace("#", "");
    value = [
        parseInt(raw.slice(0, 2), 16),
        parseInt(raw.slice(2, 4), 16),
        parseInt(raw.slice(4, 6), 16),
    ];
    COLOR_CACHE.set(hex, value);
    return value;
}

function mixHex(from, to, amount) {
    const t = Math.max(0, Math.min(1, amount));
    const a = rgbTriplet(from);
    const b = rgbTriplet(to);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

// Snow settles on the upper crown first; the alpha follows the snow-cover
// curve so a dusting in late autumn is visibly thinner than deep winter.
function drawSnowCaps(ctx, px, py, s, sway, seed, snow, topY, spread) {
    if (snow <= 0.12) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.95, snow * 1.05);
    ctx.fillStyle = "#eef6fb";
    const caps = 1 + Math.floor(seed * 2);
    for (let i = 0; i < caps; i++) {
        const ox = (i - (caps - 1) / 2) * spread * 0.45 * s + sway;
        ctx.beginPath();
        ctx.ellipse(px + ox, topY + i * 1.7 * s, (3.8 - i * 0.7) * s, (1.8 - i * 0.25) * s, -0.18, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// A leafless crown is a real silhouette, not a grey ball: a tapered trunk,
// primary limbs and fine twigs. Birch keeps an upright broom, oak spreads wide
// and gnarled, and marcescent species keep a few leaves at the branch tips.
function drawBareCrown(ctx, px, py, s, sway, seed, foliage, ink = "#6b5138", scale = 1) {
    // Young trees keep a compact winter silhouette and ancient trees cast a
    // genuinely larger one. Scaling here keeps the branch geometry coherent.
    s *= Math.max(0.5, Number(scale) || 1);
    const species = foliage.species || "broadleaf";
    const slender = species === "birch" || species === "alder";
    const wide = species === "oak" || species === "chestnut";
    const tall = species === "elm" || species === "linden";
    const crownY = py - (slender ? 13 : tall ? 14 : 11) * s;
    const spread = (wide ? 12.5 : slender ? 8 : tall ? 10.8 : 9.5 + seed * 3) * s;
    const topY = crownY - (slender ? 7 : tall ? 6.4 : 5) * s;
    const lean = sway * (slender ? 0.6 : 0.45);
    const tips = [];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;

    // The trunk tapers into the fork instead of ending in a straight stick.
    ctx.lineWidth = Math.max(1.2, (wide ? 2 : 1.55) * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 8 * s);
    ctx.quadraticCurveTo(px + lean * 0.35, py + 1 * s, px + lean, topY);
    ctx.stroke();

    const branches = wide ? 7 : slender ? 5 : 6;
    for (let i = 0; i < branches; i++) {
        const pair = Math.floor(i / 2);
        const side = i % 2 === 0 ? -1 : 1;
        const baseY = crownY + (1.8 - pair * 2.3) * s;
        const reach = spread * (slender ? 0.78 : wide ? 1.06 : 0.95)
            * (0.66 + ((i * 37) % 10) / 28);
        const angle = -Math.PI / 2 + side * (slender ? 0.55 : wide ? 0.95 : 0.74)
            * (0.72 + ((i * 53) % 7) / 22);
        const baseX = px + lean * 0.6;
        const endX = baseX + Math.cos(angle) * reach;
        const endY = baseY + Math.sin(angle) * reach;
        const controlX = baseX + Math.cos(angle) * reach * 0.42 + side * 1.6 * s;
        const controlY = baseY + Math.sin(angle) * reach * 0.42 - 1.8 * s;

        ctx.lineWidth = Math.max(1.1, (wide ? 1.8 : 1.4) * s);
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();

        // Two short twigs per limb break up the silhouette without turning it
        // into a solid fan; the upper twig leans out, the lower one lifts.
        for (const at of [0.56, 0.82]) {
            const inv = 1 - at;
            const twigX = inv * inv * baseX + 2 * inv * at * controlX + at * at * endX;
            const twigY = inv * inv * baseY + 2 * inv * at * controlY + at * at * endY;
            const twigAngle = angle + side * (at < 0.7 ? -0.5 : 0.45);
            const twigLength = (wide ? 4.2 : slender ? 2.8 : 3.6) * s * (1.05 - at * 0.3);
            ctx.lineWidth = Math.max(0.7, 0.9 * s);
            ctx.beginPath();
            ctx.moveTo(twigX, twigY);
            ctx.lineTo(twigX + Math.cos(twigAngle) * twigLength, twigY + Math.sin(twigAngle) * twigLength);
            ctx.stroke();
        }
        tips.push({ x: endX, y: endY, angle, index: i });
    }

    // A short leader above the fork keeps the crown from looking cut off.
    ctx.lineWidth = Math.max(0.9, 1.05 * s);
    ctx.beginPath();
    ctx.moveTo(px + lean, topY);
    ctx.lineTo(px + lean + sway * 0.25, topY - (slender ? 3.2 : 2.2) * s);
    ctx.stroke();
    ctx.restore();

    // Snow rests on the upper twigs before it covers the whole crown.
    if (foliage.snow > 0.18) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.85, foliage.snow * 0.9);
        ctx.fillStyle = "#edf6fb";
        for (let i = 0; i < tips.length; i++) {
            const tip = tips[i];
            ctx.beginPath();
            ctx.ellipse(tip.x, tip.y - 0.5 * s, (1.7 + (i % 2) * 0.5) * s, 0.62 * s, tip.angle, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Marcescent oaks and beeches hold their leaves at the branch tips rather
    // than floating a brown cloud around the trunk.
    if (foliage.holding) {
        ctx.save();
        ctx.globalAlpha = 0.68;
        ctx.fillStyle = "#8a5c30";
        for (let i = 0; i < tips.length; i++) {
            const tip = tips[i];
            for (let j = 0; j < 2; j++) {
                const ox = ((i * 13 + j * 7) % 7 - 3) * 0.55 * s;
                const oy = ((i * 17 + j * 5) % 5 - 2) * 0.45 * s;
                ctx.beginPath();
                ctx.ellipse(tip.x + ox, tip.y + oy, 1.45 * s, 0.9 * s, 0.35 + j * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function drawTree(ctx, px, py, cellPx, tick, s1, s2, s3, zoom, temp, moisture, dayOfYear, climateKey = "temperate", shore = null, stand = null, sun = null) {
    const s = cellPx / 48;
    const treeForm = stand?.forest ? forestTreeForm(stand, s2) : null;
    const sway = Math.sin(tick * 0.045 + s1 * 10 + s2 * 7) * 1.6 * s * windMultiplier()
        + (treeForm?.lean || 0) * s * 0.35;
    const ageScale = treeForm?.ageScale ?? (stand?.forest ? Math.max(0.52, Number(stand.ageScale) || 1) : 1);
    const species = stand?.forest ? pickSpecies(stand, s3 ?? s2) : "oak";
    const speciesDefinition = FOREST_SPECIES[species] || FOREST_SPECIES.oak;

    // A soft grounded shadow is enough to lift trees off the surface without
    // baking hard directional shadows into the seasonal ground. Ancient trees
    // cast a broader, softer pool than saplings; its offset follows the same
    // solar vector as the WebGL ground shadow, so morning and evening agree.
    const shadow = sun || { shadowX: 0.35, shadowY: -0.2 };
    const shadowReach = (4.5 + ageScale * 2.2) * s;
    ctx.fillStyle = shore ? "rgba(5, 12, 8, 0.14)" : "rgba(7, 15, 8, 0.11)";
    ctx.beginPath();
    ctx.ellipse(
        px + 2.2 * s + (shore ? shore.x * 4 * s : 0) + shadow.shadowX * shadowReach,
        py + 5.8 * s + (shore ? shore.y * 4 * s : 0) + shadow.shadowY * shadowReach * 0.55,
        (shore ? 9.5 : 7.4) * s * ageScale,
        (shore ? 2.9 : 2.5) * s * (0.7 + ageScale * 0.3),
        0.15, 0, Math.PI * 2
    );
    ctx.fill();

    // Tropical crowns are not temperate oaks with a different palette. Each
    // species carries buttresses, emergent height, leaf size, lianas and
    // epiphytes into a dedicated silhouette.
    if (speciesDefinition.tropical) {
        if (speciesDefinition.palm) {
            drawTropicalPalm(ctx, px, py, s, sway, s2, ageScale, speciesDefinition);
        } else if (speciesDefinition.grass) {
            drawTropicalBamboo(ctx, px, py, s, sway, s2, ageScale);
        } else {
            drawTropicalTree(ctx, px, py, s, sway, s2, ageScale, speciesDefinition, stand, treeForm);
        }
        return;
    }
    // A conifer inside a defined conifer formation is the stand's real
    // dominant tree, not a decorative substitute. Its species controls the
    // silhouette, needle colour, autumn behaviour and timber identity.
    if (speciesDefinition.conifer) {
        drawConifer(ctx, px, py, s, sway, s2, dayOfYear, climateKey, ageScale, species, stand, treeForm);
        return;
    }
    // Outside closed woodland, a cold or rocky edge may still carry a stray
    // spruce or pine. This remains a landscape accent, never an intrusion into
    // a mapped oakwood or beechwood.
    const coniferChance = stand?.forest ? 0 : (temp < 0.4 ? 0.85 : temp < 0.54 ? 0.24 : 0);
    if (s3 < coniferChance) { drawConifer(ctx, px, py, s, sway, s2, dayOfYear, climateKey, ageScale, "spruce", null, treeForm); return; }
    if (!stand?.forest && temp > 0.68 && moisture < 0.45) { drawPalm(ctx, px, py, s, sway, s2); return; }
    if (stand?.disturbance === 'burned' && s3 < 0.3) { drawSnag(ctx, px, py, s, sway, s2, true); return; }
    if (!stand?.forest && moisture > 0.76 && temp > 0.5 && s1 > 0.9) { drawDeadTree(ctx, px, py, s, sway); return; }
    if (stand?.disturbance === 'diseased' && s3 > 0.78) { drawSnag(ctx, px, py, s, sway, s2, false); return; }

    if (species === 'birch') {
        drawBirch(ctx, px, py, s, sway, s2, dayOfYear, climateKey, ageScale, treeForm);
        return;
    }
    drawBroadleaf(ctx, px, py, s, sway, tick, s2, dayOfYear, Math.floor(s3 * 4) % 4, species, climateKey, ageScale, stand, treeForm);
}

function drawBroadleaf(ctx, px, py, s, sway, tick, seed, dayOfYear, variant = 0, species = "oak", climateKey = "temperate", ageScale = 1, stand = null, treeForm = null) {
    const definition = FOREST_SPECIES[species] || FOREST_SPECIES.oak;
    const heightScale = treeForm?.heightScale || 1;
    const trunkScale = treeForm?.trunkScale || 1;
    const crownScale = treeForm?.crownScale || 1;
    const foliage = foliageState(dayOfYear, { seed, species, climate: climateKey });
    const seasonal = seasonalState(dayOfYear, climateKey);
    // Give the whole stand a gentle autumn pull even where an individual
    // marcescent tree is late. The per-tree timing still wins, but the canopy
    // no longer looks like isolated green trees floating in a brown wood.
    const turn = Math.min(1, foliage.turn + seasonal.foliageTurn * 0.12);
    const trunkH = (10 + definition.height * 3) * s * ageScale * heightScale;
    const trunkW = Math.max(1.3, 4.2 * definition.trunk * s * (0.72 + ageScale * 0.28) * trunkScale);
    const baseY = py + 8 * s;
    const crownY = py - (7 + definition.height * 4.6) * s * ageScale * heightScale;
    const lean = sway * 0.35;

    // Exposed roots anchor old trees to the humus instead of leaving a stick on
    // top of the ground.
    if (ageScale > 0.82) {
        ctx.strokeStyle = mixHex(definition.bark, "#3e2c1d", 0.25);
        ctx.lineWidth = Math.max(0.8, 1.05 * s);
        ctx.lineCap = "round";
        for (let i = 0; i < (ageScale > 1.1 ? 4 : 2); i++) {
            const side = i % 2 === 0 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(px, baseY - 1.5 * s);
            ctx.quadraticCurveTo(px + side * (3 + i) * s, baseY + 1.5 * s, px + side * (5 + i * 1.8) * s, baseY + 4.5 * s);
            ctx.stroke();
        }
        ctx.lineCap = "butt";
    }

    // Trunk with a lit edge and a darker heart. Beech and birch get a smoother,
    // cooler bark than oak and chestnut.
    ctx.fillStyle = definition.bark;
    ctx.beginPath();
    ctx.moveTo(px - trunkW * 0.5, baseY);
    ctx.quadraticCurveTo(px - trunkW * 0.42 + lean, py + 2 * s, px - trunkW * 0.3 + lean, crownY + 5 * s);
    ctx.lineTo(px + trunkW * 0.3 + lean, crownY + 5 * s);
    ctx.quadraticCurveTo(px + trunkW * 0.48 + lean, py + 2 * s, px + trunkW * 0.5, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = definition.barkLight;
    ctx.globalAlpha = 0.52;
    ctx.fillRect(px - trunkW * 0.38 + lean * 0.4, py + 1.5 * s, Math.max(0.7, trunkW * 0.2), trunkH * 0.78);
    ctx.globalAlpha = 1;

    // Ancient trees carry hollows and broken limbs; these also become nesting
    // sites in the fauna layer. Keep the hollow on the clear lower trunk: any
    // higher and the summer crown hides it completely.
    if (ageScale > 1.05) {
        const hollowY = py - trunkH * 0.24;
        ctx.fillStyle = "rgba(26, 18, 11, 0.84)";
        ctx.beginPath();
        ctx.ellipse(px + trunkW * 0.18 + lean, hollowY, Math.max(1, s * 1.05), s * 1.9, 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = mixHex(definition.bark, "#2f2115", 0.4);
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.beginPath();
        ctx.ellipse(px + trunkW * 0.18 + lean, hollowY, Math.max(1.2, s * 1.35), s * 2.2, 0.12, Math.PI * 0.12, Math.PI * 1.45);
        ctx.stroke();
        ctx.strokeStyle = definition.bark;
        ctx.lineWidth = Math.max(1, 1.4 * s);
        ctx.beginPath();
        ctx.moveTo(px + lean, crownY + 10 * s);
        ctx.lineTo(px + lean - 5 * s, crownY + 4 * s);
        ctx.moveTo(px + lean, crownY + 8 * s);
        ctx.lineTo(px + lean + 6 * s, crownY + 1 * s);
        ctx.stroke();
    }

    if (foliage.bare) {
        drawBareCrown(ctx, px, py, s, sway, seed, foliage, definition.bark, ageScale);
        if (ageScale > 1.05 && seed > 0.58) drawNest(ctx, px + lean + 5 * s, crownY + 9 * s, s, seed);
        drawSnowCaps(ctx, px, py, s * ageScale, sway, seed, foliage.snow, py - 12 * s * ageScale, 10);
        return;
    }

    let crown = mixHex(definition.summer[0], definition.autumn[0], turn);
    let light = mixHex(definition.summer[1], definition.autumn[1], turn);
    // The darkest summer greens read as holes at rooftop zoom once several
    // transparent lobes overlap. Pulling a little of the sunlit tone into the
    // base keeps oak and beech crowns legible without bleaching the canopy.
    crown = mixHex(crown, light, 0.24);
    if (foliage.holding && turn > 0.68) {
        crown = mixHex(crown, "#82552d", 0.38);
        light = mixHex(light, "#a7763d", 0.32);
    }
    if (foliage.fresh > 0) {
        crown = mixHex(crown, "#73b352", foliage.fresh * 0.22);
        light = mixHex(light, "#9ed070", foliage.fresh * 0.18);
    }

    const cover = Math.max(0.18, foliage.leaf) * (stand?.disturbance === 'diseased' ? 0.78 : 1);
    const radius = (9 + seed * 4) * s * definition.crown * ageScale * crownScale * (0.62 + 0.38 * cover);
    // Crown aspect is species-readable at a glance: oak and chestnut spread,
    // elm and linden rise, birch is airy, and maple fills a rounded dome.
    const aspect = definition.form === 'spreading' ? 0.76 : definition.form === 'vase' ? 1.18
        : definition.form === 'oval' ? 1.1 : definition.form === 'airy' ? 1.04 : 0.9;
    // A few limbs show through the crown edge. They make an old tree read as a
    // tree rather than a green circle, especially against the pale autumn sky.
    ctx.save();
    ctx.strokeStyle = mixHex(definition.bark, "#32261c", 0.36);
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = Math.max(0.8, 1.05 * s);
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(px + lean, crownY + 9 * s);
        ctx.quadraticCurveTo(px + side * radius * 0.38, crownY + radius * 0.18, px + side * radius * (0.62 + i * 0.1), crownY + (i % 2 ? -1 : 1) * radius * 0.12);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.36 + 0.64 * cover;
    ctx.fillStyle = crown;
    // Layered lobes form a rounded, irregular crown. The old single circle is
    // still underneath so a sparse tree never turns into a floating ring.
    ctx.beginPath();
    ctx.ellipse(px + sway, crownY, radius, radius * aspect, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < definition.lobes; i++) {
        const angle = i * 2.399 + seed * 4 + variant * 0.42;
        const ox = Math.cos(angle) * radius * 0.44;
        const oy = Math.sin(angle) * radius * 0.3;
        ctx.fillStyle = i % 2 === 0 ? crown : light;
        ctx.beginPath();
        ctx.ellipse(px + ox + sway, crownY + oy, radius * (0.48 + (i % 3) * 0.08), radius * aspect * (0.38 + (i % 2) * 0.09), angle * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }
    // Small edge clumps break the silhouette into leaves and give each species
    // a different outline without turning the canopy into a repeated stamp.
    for (let i = 0; i < 5; i++) {
        const angle = i * 1.79 + seed * 6 + variant;
        const edge = 0.62 + (i % 3) * 0.1;
        ctx.fillStyle = i % 2 === 0 ? light : crown;
        ctx.globalAlpha = (0.28 + 0.33 * cover) * (0.78 + (i % 2) * 0.2);
        ctx.beginPath();
        ctx.ellipse(px + sway + Math.cos(angle) * radius * edge, crownY + Math.sin(angle) * radius * aspect * edge * 0.74,
            radius * (0.18 + (i % 2) * 0.06), radius * (0.13 + (i % 3) * 0.03), angle * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 0.36 + 0.64 * cover;
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(px - radius * 0.28 + sway, crownY - radius * 0.25, radius * 0.48 * (0.7 + 0.3 * cover), radius * 0.36 * (0.7 + 0.3 * cover), -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Thinning crowns drop visible leaves around the trunk; this is the local
    // expression of the same seasonal leaf curve used by the larger canopy.
    if (foliage.leaf > 0.2 && foliage.leaf < 0.78) {
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - foliage.leaf);
        ctx.fillStyle = mixHex(definition.autumn[0], "#6d4c24", 0.4);
        for (let i = 0; i < 7; i++) {
            const ox = ((i * 43) % 15 - 7) / 7 * 9 * s;
            const oy = ((i * 67) % 11 - 5) / 5 * 7 * s;
            const fall = (tick * (0.2 + (i % 3) * 0.07) + i) % 7;
            ctx.beginPath();
            ctx.ellipse(px + ox + sway, py + oy - fall * s * 0.5, 1.5 * s, 0.9 * s, i * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    if (foliage.holding && foliage.leaf < 0.9) {
        drawBareCrown(ctx, px, py, s, sway, seed, { ...foliage, holding: false, snow: 0 }, "#5f442c", ageScale);
    }

    if (stand?.disturbance === 'windthrow' && seed > 0.55) {
        ctx.strokeStyle = "rgba(93, 73, 50, 0.82)";
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.beginPath();
        ctx.moveTo(px + lean, crownY + 8 * s);
        ctx.lineTo(px + lean + 9 * s, crownY + 14 * s);
        ctx.stroke();
    }

    // Nests sit on the canopy, so they must be painted after the crown lobes;
    // previously they were drawn underneath and vanished in the foliage.
    if (ageScale > 1.05 && seed > 0.58) {
        drawNest(ctx, px + lean - radius * 0.34, crownY - radius * 0.04, s, seed);
    }
    drawSnowCaps(ctx, px, py, s * ageScale, sway, seed, foliage.snow, crownY + radius * 0.25, 9 * ageScale);
}

function drawBirch(ctx, px, py, s, sway, seed, dayOfYear, climateKey = "temperate", ageScale = 1, treeForm = null) {
    const foliage = foliageState(dayOfYear, { seed, species: "birch", climate: climateKey });
    const heightScale = treeForm?.heightScale || 1;
    const trunkScale = treeForm?.trunkScale || 1;
    const crownScale = treeForm?.crownScale || 1;
    const trunkW = Math.max(1.1, 3.6 * s * (0.72 + ageScale * 0.28) * trunkScale);
    const trunkH = 13 * s * ageScale * heightScale;
    ctx.fillStyle = "#e9e3d4";
    ctx.fillRect(px - trunkW * 0.5, py + 1 * s, trunkW, trunkH);
    ctx.fillStyle = "#4a4136";
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(px - trunkW * 0.5, py + (3 + i * 3.4) * s, (trunkW * 0.44 + (i % 2) * 0.8) * s, 0.9 * s);
    }
    if (foliage.bare) {
        drawBareCrown(ctx, px, py, s, sway, seed, foliage, "#8a7f6e", ageScale);
        drawSnowCaps(ctx, px, py, s * ageScale, sway, seed, foliage.snow, py - 12 * s * ageScale, 9);
        return;
    }
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * foliage.leaf;
    const crownY = py - (5 + 2 * ageScale) * s * heightScale;
    const radius = (8.5 + seed * 3) * s * (0.68 + 0.32 * foliage.leaf) * Math.max(0.7, ageScale) * crownScale;
    ctx.fillStyle = mixHex("#6a9e3e", "#c9a83a", foliage.turn);
    ctx.beginPath();
    ctx.ellipse(px + sway, crownY, radius * 0.82, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mixHex("#a3c463", "#e0c25a", foliage.turn);
    ctx.beginPath();
    ctx.ellipse(px - 3 * s + sway, crownY - 3 * s, radius * 0.44, radius * 0.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawSnowCaps(ctx, px, py, s * ageScale, sway, seed, foliage.snow, py - 10 * s * ageScale, 9);
}

// ---------------------------------------------------------------------------
// Forest floor and canopy detail
// ---------------------------------------------------------------------------

function drawLeafCarpet(ctx, px, py, cellPx, stand, roll, seed, dayOfYear, climateKey) {
    const s = cellPx / 48;
    const season = seasonalState(dayOfYear, climateKey);
    const turned = Math.max(season.foliageTurn, 0.35);
    const colors = turned > 0.48
        ? ['#7d4a24', '#9c6433', '#6f4a2a', '#a87535', '#5f4327']
        : ['#5f7a37', '#8b8a42', '#6f7e3b', '#9a8438'];
    ctx.save();
    ctx.globalAlpha = 0.48 + stand.ground.litter * 0.26;
    for (let i = 0; i < 13; i++) {
        const angle = i * 2.1 + seed * 7 + roll * 2;
        const radius = (1.3 + ((i * 17) % 13)) * s;
        const ox = Math.cos(angle) * radius;
        const oy = 2.5 * s + Math.sin(angle) * radius * 0.62;
        ctx.fillStyle = colors[(i + Math.floor(roll * 3)) % colors.length];
        ctx.beginPath();
        ctx.ellipse(px + ox, py + oy, (1.15 + (i % 3) * 0.38) * s, (0.55 + (i % 2) * 0.18) * s, angle + (i % 4) * 0.22, 0, Math.PI * 2);
        ctx.fill();
    }
    // The dominant species leaves a few recognisable silhouettes in the
    // carpet: lobed oak, heart-shaped linden, triangular birch, palmate maple.
    // This keeps species-specific woodland readable at close zoom without a
    // new per-tile texture.
    const species = FOREST_SPECIES[stand.dominantSpecies];
    if (species?.leafShape) {
        ctx.globalAlpha = 0.46 + stand.ground.litter * 0.22;
        for (let i = 0; i < 3; i++) {
            const angle = i * 2.7 + seed * 5;
            drawSpeciesLeaf(ctx, px + Math.cos(angle) * (2.4 + i * 1.5) * s, py + (2.8 + i * 0.8) * s,
                (2.1 + i * 0.3) * s, angle, species.leafShape, colors[(i + 2) % colors.length]);
        }
    }
    // Two pale veins of exposed twig keep the carpet from reading as flat
    // confetti, especially at the close rooftop zoom.
    ctx.strokeStyle = "rgba(86, 65, 42, 0.52)";
    ctx.lineWidth = Math.max(0.55, 0.65 * s);
    ctx.beginPath();
    ctx.moveTo(px - 5 * s, py + 1 * s);
    ctx.quadraticCurveTo(px, py + 4 * s, px + 7 * s, py + 2 * s);
    ctx.moveTo(px - 2 * s, py + 4.5 * s);
    ctx.lineTo(px + 3 * s, py + 1.5 * s);
    ctx.stroke();
    ctx.restore();
}

// Leaf silhouettes for the species that actually dominates the stand. The
// shapes stay small and flat; they are floor litter, not floating icons.
function drawSpeciesLeaf(ctx, x, y, size, angle, shape, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (shape === 'lobed' || shape === 'palmate') {
        const lobes = shape === 'lobed' ? 6 : 5;
        for (let i = 0; i <= lobes * 2; i++) {
            const a = -Math.PI / 2 + (i / (lobes * 2)) * Math.PI * 2;
            const r = size * (i % 2 === 0 ? 1 : 0.55);
            const lx = Math.cos(a) * r * 0.7;
            const ly = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(lx, ly);
            else ctx.lineTo(lx, ly);
        }
    } else if (shape === 'heart') {
        ctx.moveTo(0, size * 0.9);
        ctx.bezierCurveTo(-size * 0.9, size * 0.2, -size * 0.7, -size * 0.8, 0, -size * 0.35);
        ctx.bezierCurveTo(size * 0.7, -size * 0.8, size * 0.9, size * 0.2, 0, size * 0.9);
    } else if (shape === 'triangular') {
        ctx.moveTo(0, size);
        ctx.lineTo(-size * 0.62, -size * 0.55);
        ctx.quadraticCurveTo(0, -size * 0.95, size * 0.62, -size * 0.55);
    } else if (shape === 'serrated') {
        for (let i = 0; i <= 10; i++) {
            const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
            const r = size * (i % 2 === 0 ? 0.54 : 0.42);
            const lx = Math.cos(a) * r * 0.62;
            const ly = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(lx, ly);
            else ctx.lineTo(lx, ly);
        }
    } else {
        const width = shape === 'lance' ? size * 0.26 : size * 0.46;
        ctx.ellipse(0, 0, width, size * (shape === 'lance' ? 0.95 : 0.78), 0, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(52, 40, 28, 0.35)";
    ctx.lineWidth = Math.max(0.35, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(0, size * 0.6);
    ctx.stroke();
    ctx.restore();
}

function drawMossPatch(ctx, px, py, cellPx, stand, seed, climateKey, dayOfYear) {
    const s = cellPx / 48;
    const season = seasonalState(dayOfYear, climateKey);
    const cold = season.snowCover > 0.45;
    ctx.save();
    ctx.globalAlpha = cold ? 0.25 : 0.38 + stand.ground.moss * 0.3;
    ctx.fillStyle = cold ? "#8f9b8b" : "#4c6e3b";
    ctx.beginPath();
    ctx.ellipse(px, py + 4 * s, (5.5 + seed * 3) * s, (2.8 + seed * 2) * s, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cold ? "rgba(210,226,224,0.5)" : "rgba(108,137,73,0.55)";
    ctx.beginPath();
    ctx.ellipse(px - 2 * s, py + 3 * s, (3 + seed * 2) * s, 1.5 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawNeedleCarpet(ctx, px, py, cellPx, stand, roll, seed) {
    const s = cellPx / 48;
    ctx.save();
    ctx.globalAlpha = 0.34 + (stand.ground.needles || 0) * 0.32;
    const colors = ["#6d4d2e", "#8a633a", "#9a7443", "#5b422b", "#7d6744"];
    for (let i = 0; i < 15; i++) {
        const angle = i * 2.37 + seed * 5 + roll;
        const radius = (1.4 + ((i * 13) % 11)) * s;
        const ox = Math.cos(angle) * radius;
        const oy = Math.sin(angle) * radius * 0.66 + 3 * s;
        ctx.fillStyle = colors[(i + Math.floor(roll * 4)) % colors.length];
        ctx.beginPath();
        ctx.ellipse(px + ox, py + oy, (2.4 + (i % 3) * 0.45) * s, 0.5 * s, angle + 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    // A few needles still attached to a fallen twig read as conifer litter,
    // not as the broadleaf carpet used elsewhere in the wood.
    ctx.strokeStyle = "rgba(85, 61, 38, 0.56)";
    ctx.lineWidth = Math.max(0.45, 0.55 * s);
    ctx.beginPath();
    ctx.moveTo(px - 7 * s, py + 1 * s);
    ctx.quadraticCurveTo(px, py + 4.5 * s, px + 8 * s, py + 1.8 * s);
    ctx.stroke();
    ctx.restore();
}

function drawLichen(ctx, px, py, s, seed, snow) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.12, 0.55 - snow * 0.34);
    ctx.fillStyle = seed > 0.5 ? "#9ba585" : "#b3b48f";
    for (let i = 0; i < 4; i++) {
        const ox = ((i * 17) % 13 - 6) * s;
        const oy = ((i * 11) % 9 - 4) * s;
        ctx.beginPath();
        ctx.ellipse(px + ox, py + 3 * s + oy, (1.7 + (i % 2) * 0.5) * s, 0.7 * s, i * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawBerryShrub(ctx, px, py, s, seed, autumn, snow) {
    if (snow > 0.55) return;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = "#4e633d";
    ctx.lineWidth = Math.max(0.55, 0.7 * s);
    for (let i = 0; i < 3; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(px, py + 4 * s);
        ctx.quadraticCurveTo(px + side * 3 * s, py, px + side * (5 + seed * 3) * s, py - 3 * s);
        ctx.stroke();
    }
    if (autumn > 0.35 || seed > 0.58) {
        ctx.fillStyle = seed > 0.5 ? "#5b476f" : "#943f42";
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(px + ((i * 13) % 11 - 5) * s, py - 1 * s + ((i * 7) % 7 - 3) * s, 0.65 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawConiferSapling(ctx, px, py, s, seed, snow) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.24, 1 - snow * 0.5);
    const height = (7 + seed * 5) * s;
    ctx.fillStyle = "#57442d";
    ctx.fillRect(px - 0.7 * s, py + 2 * s, 1.4 * s, height * 0.55);
    for (let tier = 0; tier < 3; tier++) {
        const base = py + 2 * s - tier * height * 0.22;
        const width = (4.6 - tier * 1.1) * s;
        ctx.fillStyle = tier % 2 ? "#356345" : "#264f39";
        ctx.beginPath();
        ctx.moveTo(px, base - height * 0.3);
        ctx.lineTo(px - width, base);
        ctx.lineTo(px + width, base);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function drawFern(ctx, px, py, s, seed, turn, snow) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.2, 1 - snow * 0.72);
    ctx.strokeStyle = mixHex("#3d7034", "#8b7134", turn);
    ctx.lineWidth = Math.max(0.7, 0.95 * s);
    ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
        const angle = -Math.PI * 0.9 + i * Math.PI * 0.38 + seed * 0.5;
        const length = (5 + seed * 4 + (i % 2)) * s;
        const tipX = px + Math.cos(angle) * length;
        const tipY = py + 2 * s + Math.sin(angle) * length * 0.6;
        ctx.beginPath();
        ctx.moveTo(px, py + 2.5 * s);
        ctx.quadraticCurveTo(px + Math.cos(angle) * length * 0.48, py - length * 0.25, tipX, tipY);
        ctx.stroke();
        for (let j = 1; j < 4; j++) {
            const at = j / 4;
            const leafX = px + Math.cos(angle) * length * at;
            const leafY = py + 2 * s + Math.sin(angle) * length * at * 0.6 - length * 0.13;
            ctx.beginPath();
            ctx.moveTo(leafX, leafY);
            ctx.lineTo(leafX + Math.cos(angle - 0.9) * 1.2 * s, leafY + Math.sin(angle - 0.9) * 1.2 * s);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawBramble(ctx, px, py, s, seed, turn, snow) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.18, 1 - snow * 0.8);
    ctx.strokeStyle = mixHex("#5b4e38", "#8d6934", turn);
    ctx.lineWidth = Math.max(0.7, 0.9 * s);
    for (let i = 0; i < 3; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(px, py + 4 * s);
        ctx.quadraticCurveTo(px + side * 3 * s, py + (1 + i) * s, px + side * (6 + seed * 3) * s, py - (2 + i) * s);
        ctx.stroke();
    }
    if (turn < 0.55 && snow < 0.5) {
        ctx.fillStyle = "rgba(130, 70, 80, 0.75)";
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + (i - 1) * 3 * s, py + (i % 2 ? -1 : 2) * s, 0.75 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawMast(ctx, px, py, cellPx, stand, dayOfYear, climateKey) {
    const season = seasonalState(dayOfYear, climateKey);
    if (season.snowCover > 0.4 || season.foliageTurn < 0.35) return;
    const fruits = (stand.goods || []).filter(id => ["acorns", "beechnuts", "chestnuts", "berries", "spruce-cones", "fir-cones", "pine-cones", "juniper-berries", "blueberries", "lingonberries"].includes(id));
    if (!fruits.length) return;
    const s = cellPx / 48;
    const colors = { acorns: "#9b6a32", beechnuts: "#8b5c34", chestnuts: "#7d432b", berries: "#8f3e4a", "spruce-cones": "#6b4e34", "fir-cones": "#76543b", "pine-cones": "#9b6a32", "juniper-berries": "#5b476f", blueberries: "#4f527e", lingonberries: "#9a3e46" };
    ctx.save();
    for (let i = 0; i < 9; i++) {
        const id = fruits[i % fruits.length];
        const ox = px + ((i * 17) % 29 - 14) * s * 0.62;
        const oy = py + ((i * 11) % 17 - 7) * s * 0.5 + 3 * s;
        ctx.fillStyle = colors[id] || "#7d5a32";
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.ellipse(ox, oy, Math.max(1, 1.35 * s), Math.max(0.7, 0.9 * s), i * 0.4, 0, Math.PI * 2);
        ctx.fill();
        if (id !== "berries") {
            // A pale cup makes the mast read against brown autumn litter
            // instead of merging into it.
            ctx.fillStyle = "rgba(211, 180, 128, 0.8)";
            ctx.beginPath();
            ctx.ellipse(ox, oy - 0.35 * s, Math.max(0.7, 0.85 * s), Math.max(0.3, 0.4 * s), i * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawMushroomCluster(ctx, px, py, s, seed, snow) {
    if (snow > 0.6) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 2.2 * s + (seed - 0.5) * 2 * s;
        const oy = (i % 2 === 0 ? 0.3 : 1.5) * s;
        ctx.fillStyle = i === 1 ? "#d7cdb9" : "#c9b99d";
        ctx.fillRect(px + ox - 0.35 * s, py + oy, 0.7 * s, 2.2 * s);
        ctx.fillStyle = i === 1 ? "#a04f37" : "#8d5a37";
        ctx.beginPath();
        ctx.ellipse(px + ox, py + oy, (1.4 + (i % 2) * 0.3) * s, 0.7 * s, 0.1, 0, Math.PI);
        ctx.fill();
    }
    ctx.restore();
}

function drawNest(ctx, px, py, s, seed) {
    ctx.save();
    // A twig basket needs a solid warm fill to separate from the leaf mass; a
    // bare outline disappeared against both summer green and autumn brown.
    ctx.fillStyle = "rgba(122, 88, 51, 0.94)";
    ctx.beginPath();
    ctx.ellipse(px, py, 2.4 * s, 1.4 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(52, 36, 21, 0.95)";
    ctx.lineWidth = Math.max(0.7, 0.8 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 2.4 * s, py + 0.2 * s);
    ctx.lineTo(px + (seed - 0.5) * 3 * s, py - 1.8 * s);
    ctx.moveTo(px + 1.8 * s, py + 0.5 * s);
    ctx.lineTo(px - 1.2 * s, py - 1.4 * s);
    ctx.stroke();
    ctx.restore();
}

function drawRoots(ctx, px, py, s, seed) {
    ctx.save();
    ctx.strokeStyle = "rgba(83, 60, 39, 0.8)";
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(px, py + 2 * s);
        ctx.quadraticCurveTo(px + side * (2 + i) * s, py + 4 * s, px + side * (6 + seed * 3) * s, py + (1 + i) * s);
        ctx.stroke();
    }
    ctx.restore();
}

function drawStump(ctx, px, py, s, seed, burned) {
    const trunk = burned ? "#3e352c" : "#6d5136";
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.moveTo(px - 3.2 * s, py + 4 * s);
    ctx.lineTo(px - 2.4 * s, py - 1.5 * s);
    ctx.quadraticCurveTo(px, py - 2.8 * s, px + 2.4 * s, py - 1.5 * s);
    ctx.lineTo(px + 3.2 * s, py + 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = burned ? "#5b4b3d" : "#9b7a54";
    ctx.beginPath();
    ctx.ellipse(px, py - 1.8 * s, 2.5 * s, 0.9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (seed > 0.55 && !burned) drawMushroomCluster(ctx, px + 2.6 * s, py + 1.4 * s, s * 0.8, seed, 0);
}

function drawFallenLog(ctx, px, py, cellPx, stand, roll, seed, dayOfYear, climateKey) {
    const s = cellPx / 48;
    const season = seasonalState(dayOfYear, climateKey);
    const angle = -0.35 + roll * 0.75;
    const length = (10 + seed * 8) * s;
    ctx.save();
    ctx.translate(px, py + 4 * s);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(67, 48, 31, 0.9)";
    ctx.beginPath();
    ctx.roundRect(-length * 0.5, -1.7 * s, length, 3.4 * s, 1.7 * s);
    ctx.fill();
    ctx.strokeStyle = "rgba(143, 105, 68, 0.65)";
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(-length * 0.42, -0.6 * s);
    ctx.lineTo(length * 0.42, -0.4 * s);
    ctx.stroke();
    // A torn root plate is the signature of a windthrown giant.
    if (stand.disturbance === 'windthrow') {
        ctx.strokeStyle = "rgba(88, 64, 41, 0.9)";
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(length * 0.48, 0);
            ctx.lineTo(length * (0.58 + i * 0.05), (i - 1.5) * 2.2 * s);
            ctx.stroke();
        }
    }
    if (stand.ground.moss > 0.3 && season.snowCover < 0.5) {
        ctx.fillStyle = "rgba(74, 107, 55, 0.55)";
        ctx.beginPath();
        ctx.ellipse(-length * 0.1, -1.2 * s, length * 0.3, 1.1 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawSnag(ctx, px, py, s, sway, seed, burned) {
    const bark = burned ? "#40372d" : "#76634d";
    const height = (10 + seed * 8) * s;
    ctx.save();
    ctx.strokeStyle = bark;
    ctx.lineWidth = Math.max(1.4, 2.4 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py + 7 * s);
    ctx.lineTo(px + sway * 0.4, py - height);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const y = py - height * (0.35 + i * 0.13);
        ctx.beginPath();
        ctx.moveTo(px + sway * 0.2, y);
        ctx.lineTo(px + side * (3 + (i % 2) * 2) * s, y - (2 + i) * s);
        ctx.stroke();
    }
    // Broken crown: a jagged top rather than a clean pole.
    ctx.lineWidth = Math.max(1.2, 1.8 * s);
    ctx.beginPath();
    ctx.moveTo(px + sway * 0.4, py - height);
    ctx.lineTo(px + sway * 0.4 - 2.6 * s, py - height - 2.2 * s);
    ctx.lineTo(px + sway * 0.4 + 1.4 * s, py - height - 3.4 * s);
    ctx.stroke();
    ctx.restore();
    if (!burned && seed > 0.4) drawMushroomCluster(ctx, px + 2.8 * s, py + 1.5 * s, s * 0.75, seed, 0);
}

function drawSapling(ctx, px, py, s, seed, turn, snow, ageScale = 1) {
    if (snow > 0.72) return;
    ctx.save();
    ctx.strokeStyle = "#6b5238";
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 3 * s);
    ctx.lineTo(px + (seed - 0.5) * 2 * s, py - 6 * s * ageScale);
    ctx.stroke();
    ctx.fillStyle = mixHex("#5f963d", "#b28a39", turn);
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.ellipse(px + side * (1.7 + (i % 2)) * s, py - (2 + i * 1.4) * s * ageScale,
            1.5 * s, 0.8 * s, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawDeerTrail(ctx, px, py, cellPx, stand, seed) {
    const s = cellPx / 48;
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#7c6a4c";
    ctx.beginPath();
    ctx.ellipse(px, py + 2.5 * s, (8 + seed * 5) * s, (1.2 + seed) * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(63, 49, 33, 0.62)";
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(px + (i - 1.5) * 4 * s, py + 2.5 * s + (i % 2) * 1.2 * s, 0.7 * s, 0.4 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawForestMist(ctx, px, py, cellPx, stand, seed, tick, strength = 1) {
    const s = cellPx / 48;
    if (strength <= 0.02) return;
    const drift = Math.sin(tick * 0.006 + seed * 9) * 4 * s;
    const close = cellPx > 68;
    // Dense stands trap more vapour. Visibility is a derived stand property,
    // so mist and the canopy-light pass agree about which woods are closed.
    const visibility = Math.max(0.15, Math.min(1, Number(stand.visibility) || 0.7));
    const veil = 1 + (1 - visibility) * 0.7;
    ctx.save();
    if (close) {
        // Three overlapping puffs form a soft bank below the canopy. A single
        // large pool either left a pale ring around the crown or, when
        // feathered with a transform, read as a rectangular wash. Small
        // overlapping radial puffs have no hard edge in either axis.
        const alpha = (0.05 + stand.canopy * 0.022) * strength * veil;
        for (let i = 0; i < 3; i++) {
            const ox = (i - 1) * cellPx * 0.34 + drift + (seed - 0.5) * cellPx * 0.12;
            const oy = py + (11 + i * 2) * s;
            const radius = cellPx * (0.34 + (i % 2) * 0.08);
            ctx.save();
            ctx.translate(px + ox, oy);
            ctx.scale(1, 0.28);
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            gradient.addColorStop(0, `rgba(220, 230, 223, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(220, 230, 223, ${alpha * 0.55})`);
            gradient.addColorStop(1, "rgba(220, 230, 223, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else {
        ctx.globalAlpha = (0.035 + stand.canopy * 0.025) * strength * veil;
        ctx.fillStyle = "#dce6df";
        ctx.beginPath();
        ctx.ellipse(px + drift, py + 3 * s, (8 + seed * 5) * s, (2.2 + seed * 1.5) * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawSoilWash(ctx, px, py, cellPx, stand, seed) {
    const s = cellPx / 48;
    const soil = stand.ground?.soil || "loam";
    const palettes = {
        dry: ["#9b8152", "#b29a63", "#7d633e"],
        alluvial: ["#53613f", "#6e7148", "#3f4b35"],
        humus: ["#4c3827", "#6b4d34", "#3b2d20"],
        loam: ["#6b5438", "#8a6c46", "#55422d"],
        latosol: ["#3e3824", "#54452b", "#2d2d1e"],
    };
    const palette = palettes[soil] || palettes.loam;
    ctx.save();
    ctx.globalAlpha = 0.13 + (stand.ground?.humus || 0) * 0.17;
    for (let i = 0; i < 3; i++) {
        const angle = i * 2.3 + seed * 5;
        ctx.fillStyle = palette[i % palette.length];
        ctx.beginPath();
        ctx.ellipse(
            px + Math.cos(angle) * cellPx * (0.13 + i * 0.06),
            py + 3.5 * s + Math.sin(angle) * cellPx * 0.1,
            (5.2 + i * 1.5) * s, (1.5 + i * 0.5) * s, angle * 0.2, 0, Math.PI * 2
        );
        ctx.fill();
    }
    if (soil === "dry") {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#675238";
        ctx.lineWidth = Math.max(0.55, 0.65 * s);
        ctx.beginPath();
        ctx.moveTo(px - 6 * s, py + 3 * s);
        ctx.lineTo(px - 2 * s, py + 4 * s);
        ctx.lineTo(px + 1 * s, py + 2.5 * s);
        ctx.moveTo(px + 2 * s, py + 5 * s);
        ctx.lineTo(px + 5 * s, py + 4 * s);
        ctx.stroke();
    }
    ctx.restore();
}

function drawLocalSnowDrifts(ctx, px, py, cellPx, stand, s1, s2) {
    const s = cellPx / 48;
    const depth = Math.max(0, Math.min(1, Number(stand?.snowPotential) || 0));
    if (depth <= 0.05) return;
    ctx.save();
    // Drifts gather on the lee side of trunks and in shallow hollows. Their
    // low, overlapping alpha is deliberate: a single opaque stamp would read
    // as the same white dot on every tile.
    ctx.fillStyle = "#9db6c1";
    ctx.globalAlpha = 0.06 + depth * 0.1;
    for (let i = 0; i < 2; i++) {
        const ox = ((s1 - 0.5) * 18 + (i === 0 ? -9 : 8)) * s;
        const oy = ((s2 - 0.5) * 9 + i * 4) * s;
        ctx.beginPath();
        ctx.ellipse(px + ox, py + 5 * s + oy, (9 - i * 2.2) * s, (2.1 + i * 0.5) * s, 0.06 + i * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "#eef6fa";
    ctx.globalAlpha = 0.14 + depth * 0.3;
    for (let i = 0; i < 2; i++) {
        const ox = ((s1 - 0.5) * 15 + (i === 0 ? -6 : 7)) * s;
        const oy = ((s2 - 0.5) * 6 + i * 4) * s;
        ctx.beginPath();
        ctx.ellipse(px + ox, py + 3.5 * s + oy, (6.5 - i * 1.4) * s, (1.2 + i * 0.35) * s, 0.02, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawBogPool(ctx, px, py, cellPx, stand, s1, s2) {
    const s = cellPx / 48;
    const wet = Math.max(0, Math.min(1, Number(stand?.wetness) || 0));
    const ox = (s1 - 0.5) * 8 * s;
    const oy = (s2 - 0.5) * 5 * s;
    const cx = px + ox;
    const cy = py + 4 * s + oy;
    ctx.save();
    // A soaked mud rim first: the hollow is waterlogged before it holds open
    // water, and the darker edge separates the pool from the mossy floor.
    ctx.fillStyle = "#463a26";
    ctx.globalAlpha = 0.34 + wet * 0.22;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 11.4 * s, 4.5 * s, 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Standing water stays opaque enough to read as a surface against moss.
    // It is a flat fill rather than a per-tile gradient to keep the draw cheap
    // on low-end devices where a wide view can show dozens of pools.
    ctx.fillStyle = "#15323a";
    ctx.globalAlpha = 0.72 + wet * 0.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9.6 * s, 3.5 * s, 0.04, 0, Math.PI * 2);
    ctx.fill();
    // A pale sky reflection and a sphagnum rim keep the pool from reading as
    // a shadow or a hole in the ground.
    ctx.fillStyle = "#a9c9c4";
    ctx.globalAlpha = 0.24 + wet * 0.24;
    ctx.beginPath();
    ctx.ellipse(cx - 1.3 * s, cy - 1 * s, 4.4 * s, 0.9 * s, 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7f9a5c";
    ctx.globalAlpha = 0.28 + wet * 0.16;
    ctx.lineWidth = Math.max(0.7, 0.85 * s);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.4 * s, 10.4 * s, 4 * s, 0.04, 0, Math.PI * 2);
    ctx.stroke();
    // Sedge and reeds break the outline where the water meets the moss.
    ctx.strokeStyle = "#6d7f45";
    ctx.globalAlpha = 0.52;
    ctx.lineWidth = Math.max(0.6, 0.7 * s);
    for (let i = 0; i < 4; i++) {
        const rx = cx + (i - 1.5) * 2.7 * s;
        const base = cy + (i % 2) * 0.6 * s;
        ctx.beginPath();
        ctx.moveTo(rx, base);
        ctx.lineTo(rx - 0.9 * s, base - 3.2 * s);
        ctx.stroke();
    }
    ctx.restore();
}

function canopyShadeSpriteFor(color) {
    if (canopyShadeSprite && canopyShadeSpriteColor === color) return canopyShadeSprite;
    const sprite = document.createElement("canvas");
    sprite.width = 128;
    sprite.height = 128;
    const sctx = sprite.getContext("2d");
    if (!sctx) return sprite;
    const [r, g, b] = rgbTriplet(color);
    const gradient = sctx.createRadialGradient(64, 64, 3, 64, 64, 62);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.94)`);
    gradient.addColorStop(0.46, `rgba(${r},${g},${b},0.76)`);
    gradient.addColorStop(0.78, `rgba(${r},${g},${b},0.34)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, 128, 128);
    canopyShadeSprite = sprite;
    canopyShadeSpriteColor = color;
    return sprite;
}

// A soft local ambient-occlusion stamp under a closed conifer canopy. The
// profile follows crown cover, stem density, sun elevation and snow cover; the
// art is a single cached sprite so a dense forest does not turn into a
// per-pixel full-screen shader on low-end devices.
function drawCanopyShade(ctx, px, py, cellPx, stand, sun, snowCover) {
    const shade = forestCanopyShade(stand, { sun, snowCover });
    if (shade.alpha <= 0.004) return;
    const sprite = canopyShadeSpriteFor(shade.color);
    const size = cellPx * (1.7 + shade.reach * 1.25);
    ctx.save();
    ctx.globalAlpha = shade.alpha;
    ctx.drawImage(sprite,
        px + shade.offsetX * cellPx - size * 0.5,
        py + shade.offsetY * cellPx - size * 0.5,
        size, size);
    ctx.restore();
}

function drawForestGround(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey) {
    const s = cellPx / 48;
    const season = seasonalState(dayOfYear, climateKey);
    if (stand.tropical) {
        // The tropical floor owns its water, fields, huts and leaf litter. Do
        // not let the temperate soil/leaf pass paint over those features.
        drawTropicalFloor(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey);
        return;
    }
    const snow = season.snowCover;
    const turn = season.foliageTurn;
    ctx.save();
    // Ground is a soft soil/humus wash, never a hard dark disc. The old broad
    // circle read as a hole under every tree; a smaller, layered patch lets the
    // shader's litter texture and the scattered leaves do the work.
    if (snow >= 0.45) {
        drawLocalSnowDrifts(ctx, px, py, cellPx, stand, s1, s2);
        ctx.restore();
        return;
    }
    drawSoilWash(ctx, px, py, cellPx, stand, s1);
    // No per-tile fill here. A large circle under every tree read as polka dots,
    // and a full cell tint exposed the tile grid. Instead the floor is built from
    // leaf litter and humus specks, letting the baked ground and the leaf carpet
    // blend across tile borders.
    ctx.globalAlpha = 0.4 + stand.ground.litter * 0.22;
    const coniferFloor = stand.coniferShare > 0.45;
    const rawPalette = stand.tropical
        ? ["#2f4c2d", "#3b5d32", "#4c4a2a", "#2a3d26", "#5a5632"]
        : coniferFloor
        ? (turn > 0.5 ? ["#59402a", "#75512f", "#8b6538", "#4d3826", "#6d5a3b"]
            : ["#4a3e2c", "#665033", "#7a5a37", "#3f4c35", "#8b7447"])
        : turn > 0.42 ? ["#704b2b", "#986130", "#8c7138", "#5d472b", "#a8793a"]
            : ["#4c6538", "#70733a", "#57462d", "#7a5b36", "#617b40"];
    // Dense interiors are genuinely darker. This is a palette shift, not a
    // translucent disc per tile, so it cannot expose the ground lattice.
    const gloom = Math.max(0, Math.min(0.42, (0.58 - (Number(stand.visibility) || 0.7)) * 0.8));
    const palette = gloom > 0.01
        ? rawPalette.map(color => mixHex(color, "#17251b", gloom))
        : rawPalette;
    // Fifteen, not nineteen, litter marks: the removed four were always covered
    // by neighbours at normal zoom and cost a path fill per tile.
    for (let i = 0; i < 15; i++) {
        const angle = i * 2.4 + s1 * 7;
        const ox = (Math.cos(angle) * (cellPx * 0.34) + (s2 - 0.5) * cellPx * 0.5) * (0.7 + (i % 3) * 0.12);
        const oy = (Math.sin(angle) * (cellPx * 0.25) + (s1 - 0.5) * cellPx * 0.32) * (0.8 + (i % 2) * 0.15);
        ctx.fillStyle = palette[(i + Math.floor(s2 * 4)) % palette.length];
        ctx.beginPath();
        ctx.ellipse(px + ox, py + 2.5 * s + oy,
            (1.1 + (i % 3) * 0.45) * s, (0.5 + (i % 2) * 0.18) * s, angle + i * 0.17, 0, Math.PI * 2);
        ctx.fill();
    }
    // Darker pockets of wet humus and bright moss give the litter depth without
    // introducing another large stamp.
    ctx.globalAlpha = 0.24 + stand.ground.moss * 0.12;
    ctx.fillStyle = turn > 0.55 ? "#7b6538" : "#607c42";
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(px + ((i * 17) % 15 - 7) * s + (s1 - 0.5) * 8 * s,
            py + ((i * 11) % 9 - 4) * s + (s2 - 0.5) * 8 * s, 1.8 * s, 0.8 * s, i * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawForestFloor(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey, tick, zoom) {
    // The tropical floor already carries its own understorey, water, tracks and
    // land use. The generic leaf/moss/fern pass would cover them again.
    if (stand.tropical) return;
    const season = seasonalState(dayOfYear, climateKey);
    // Deep winter hides the needle/leaf carpet under the baked snow ground.
    // Do not stamp a snow shape here: ground detail is drawn on a coarse world
    // lattice, so a per-tile stamp can only produce visible dots or a grid.
    // Skipping the summer floor also costs less than drawing an overlay.
    if (season.snowCover >= 0.55) return;
    const roll = s1;
    if (stand.coniferShare > 0.45) {
        if (stand.ground.trail && s2 > 0.54) { drawDeerTrail(ctx, px, py, cellPx, stand, s2); return; }
        // Saturated hollows hold standing water. The chance is highest in the
        // wet-conifer formation but also follows site moisture, so a damp
        // spruce wood gets the occasional bog pool without becoming a swamp.
        if ((Number(stand.wetness) || 0) > 0.48
            && roll < (stand.type === 'wet-conifer' ? 0.42 : 0.14)) {
            drawBogPool(ctx, px, py, cellPx, stand, s2, s3);
            return;
        }
        let cursor = (stand.ground.needles || 0) * 0.7;
        if (roll < cursor) { drawNeedleCarpet(ctx, px, py, cellPx, stand, s2, s3); return; }
        cursor += (stand.understory.lichen || 0) * 0.4;
        if (roll < cursor) { drawLichen(ctx, px, py, cellPx / 48, s2, season.snowCover); return; }
        cursor += (stand.understory.berry || 0) * 0.34;
        if (roll < cursor) { drawBerryShrub(ctx, px, py, cellPx / 48, s2, season.foliageTurn, season.snowCover); return; }
        cursor += stand.understory.fern * 0.28;
        if (roll < cursor) { drawFern(ctx, px, py, cellPx / 48, s3, season.foliageTurn, season.snowCover); return; }
        cursor += stand.ground.moss * 0.24;
        if (roll < cursor) { drawMossPatch(ctx, px, py, cellPx, stand, s3, climateKey, dayOfYear); return; }
        cursor += stand.ground.mushrooms * 0.2;
        if (roll < cursor) { drawMushroomCluster(ctx, px, py, cellPx / 48, s2, season.snowCover); return; }
        cursor += stand.ground.stones * 0.18;
        if (roll < cursor) { drawRock(ctx, px, py, cellPx, zoom, season.snowCover > 0.5); return; }
        cursor += stand.ground.logs * 0.22;
        if (roll < cursor) { drawFallenLog(ctx, px, py, cellPx, stand, s2, s3, dayOfYear, climateKey); return; }
        cursor += stand.ground.roots * 0.16;
        if (roll < cursor) { drawRoots(ctx, px, py, cellPx / 48, s3); return; }
        cursor += stand.understory.shrub * 0.18;
        if (roll < cursor) { drawShrub(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey); return; }
        if (stand.ground.stumps > 0.2 && s3 > 0.58) { drawStump(ctx, px, py, cellPx / 48, s2, false); return; }
        drawNeedleCarpet(ctx, px, py, cellPx, stand, s2, s3);
        return;
    }
    if (stand.ground.trail && s2 > 0.54) { drawDeerTrail(ctx, px, py, cellPx, stand, s2); return; }
    if (roll < stand.ground.litter * 0.62) { drawLeafCarpet(ctx, px, py, cellPx, stand, s2, s3, dayOfYear, climateKey); return; }
    if (roll < stand.ground.litter * 0.62 + stand.ground.moss * 0.5) { drawMossPatch(ctx, px, py, cellPx, stand, s3, climateKey, dayOfYear); return; }
    const fernChance = stand.understory.fern * 0.65;
    const brambleChance = stand.understory.bramble * 0.44;
    if (roll < 0.32 + fernChance) { drawFern(ctx, px, py, cellPx / 48, s2, season.foliageTurn, season.snowCover); return; }
    if (roll < 0.32 + fernChance + brambleChance) { drawBramble(ctx, px, py, cellPx / 48, s3, season.foliageTurn, season.snowCover); return; }
    if (roll < 0.78 && stand.ground.mushrooms > 0.25) { drawMushroomCluster(ctx, px, py, cellPx / 48, s2, season.snowCover); return; }
    if (roll < 0.85 && stand.ground.roots > 0.2) { drawRoots(ctx, px, py, cellPx / 48, s3); return; }
    if (roll < 0.91 && stand.ground.stones > 0.18) { drawRock(ctx, px, py, cellPx, zoom, season.snowCover > 0.5); return; }
    if (roll < 0.96 && stand.ground.stumps > 0.2) { drawStump(ctx, px, py, cellPx / 48, s2, stand.disturbance === 'burned'); return; }
    if (stand.ground.logs > 0.2) { drawFallenLog(ctx, px, py, cellPx, stand, s2, s3, dayOfYear, climateKey); return; }
    if (stand.understory.shrub > 0.2 && s3 > 0.55) { drawShrub(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey); return; }
    if (stand.ground.flowers > 0.3) drawFlowerCluster(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey);
    else drawGrassTufts(ctx, px, py, cellPx, s1, s2, season.foliageTurn > 0.55, season.foliageTurn, season.snowCover);
}

function drawUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey) {
    const season = seasonalState(dayOfYear, climateKey);
    const s = cellPx / 48;
    if (stand.tropical) {
        // A third of the floor stays low herb and leaf litter. Without the
        // gaps the dense understorey competed with the giant crowns and the
        // stand read as a field of saplings instead of a closed rainforest.
        if (s3 < 0.3) return;
        drawTropicalUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey, state.performanceProbe?.jungle || null);
        return;
    }
    if (stand.coniferShare > 0.45) {
        const coniferOptions = [
            ['fern', stand.understory.fern], ['berry', stand.understory.berry],
            ['lichen', stand.understory.lichen], ['heather', stand.understory.heather],
            ['shrub', stand.understory.shrub], ['grass', stand.understory.grass],
            ['sapling', 0.26 + (stand.type === 'regenerating' ? 0.3 : 0)],
        ];
        const total = coniferOptions.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0) || 1;
        let cursor = s1 * total;
        let chosen = 'sapling';
        for (const [id, weight] of coniferOptions) {
            cursor -= Math.max(0, weight);
            if (cursor <= 0) { chosen = id; break; }
        }
        if (chosen === 'fern') drawFern(ctx, px, py, s, s2, season.foliageTurn, season.snowCover);
        else if (chosen === 'berry') drawBerryShrub(ctx, px, py, s, s2, season.foliageTurn, season.snowCover);
        else if (chosen === 'lichen') drawLichen(ctx, px, py, s, s3, season.snowCover);
        else if (chosen === 'heather') drawGrassTufts(ctx, px, py, cellPx, s1, s2, true, season.foliageTurn, season.snowCover);
        else if (chosen === 'shrub') drawShrub(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey);
        else if (chosen === 'grass') drawGrassTufts(ctx, px, py, cellPx, s1, s2, false, season.foliageTurn, season.snowCover);
        else drawConiferSapling(ctx, px, py, s, s2, season.snowCover);
        return;
    }
    const options = [
        ['fern', stand.understory.fern], ['bramble', stand.understory.bramble],
        ['shrub', stand.understory.shrub], ['heather', stand.understory.heather],
        ['grass', stand.understory.grass],
        ['sapling', stand.type === 'regenerating' || stand.type === 'cutover' ? 0.65 : 0.18],
    ];
    const total = options.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    let cursor = s1 * total;
    let chosen = 'fern';
    for (const [id, weight] of options) {
        cursor -= Math.max(0, weight);
        if (cursor <= 0) { chosen = id; break; }
    }
    if (chosen === 'fern') drawFern(ctx, px, py, s, s2, season.foliageTurn, season.snowCover);
    else if (chosen === 'bramble') drawBramble(ctx, px, py, s, s2, season.foliageTurn, season.snowCover);
    else if (chosen === 'shrub') drawShrub(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey);
    else if (chosen === 'heather') drawGrassTufts(ctx, px, py, cellPx, s1, s2, true, season.foliageTurn, season.snowCover);
    else if (chosen === 'grass') drawGrassTufts(ctx, px, py, cellPx, s1, s2, false, season.foliageTurn, season.snowCover);
    else drawSapling(ctx, px, py, s, s2, season.foliageTurn, season.snowCover, 0.7 + s3 * 0.4);
}

function drawForestClearing(ctx, px, py, cellPx, stand, s1, s2, dayOfYear, climateKey) {
    const season = seasonalState(dayOfYear, climateKey);
    const bloom = flowerBloom(dayOfYear, climateKey);
    drawGrassTufts(ctx, px, py, cellPx, s1, s2, season.foliageTurn > 0.48, season.foliageTurn, season.snowCover);
    if (bloom > 0.12 && stand.ground.flowers > 0.2) drawFlowerCluster(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey);
    if (bloom > 0.25 && s2 > 0.45) {
        // A few butterflies working the sunny gap.
        const s = cellPx / 48;
        ctx.fillStyle = "rgba(226, 190, 88, 0.9)";
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * 8 * s, py - 4 * s, 1.5 * s, 0.7 * s, 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCanopyLight(ctx, px, py, cellPx, stand, seed, tick, sun = null) {
    const s = cellPx / 48;
    const beam = sun || { shadowX: -0.35, shadowY: 0.2 };
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const beamLight = Number(stand.lightShaft ?? stand.light) || 0;
    const visibility = Math.max(0, Math.min(1, Number(stand.visibility) || 0.7));
    ctx.globalAlpha = (0.045 + beamLight * 0.075) * (0.55 + visibility * 0.45);
    ctx.fillStyle = "#f2e7aa";
    ctx.beginPath();
    ctx.moveTo(px + (seed - 0.5) * 4 * s, py - 18 * s);
    ctx.lineTo(px + (seed - 0.5) * 9 * s - 4 * s + beam.shadowX * 12 * s, py + 4 * s + beam.shadowY * 5 * s);
    ctx.lineTo(px + (seed - 0.5) * 9 * s + 5 * s + beam.shadowX * 12 * s, py + 4 * s + beam.shadowY * 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.1 + 0.08 * Math.abs(Math.sin(tick * 0.01 + seed * 5));
    ctx.fillStyle = "#fff4c4";
    ctx.beginPath();
    ctx.ellipse(px + (seed - 0.5) * 4 * s + beam.shadowX * 8 * s, py + 2 * s, 3.5 * s, 1.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}


function drawTropicalFaunaShape(ctx, animal, x, y, s) {
    const group = animal?.group;
    if (!['primate', 'reptile', 'fish', 'amphibian', 'bird', 'insect'].includes(group)) return false;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.8;
    if (group === 'primate') {
        const fur = animal.id === 'howler-monkey' ? '#4a3627' : '#2c2822';
        ctx.fillStyle = fur;
        ctx.beginPath();
        ctx.ellipse(0, -4.2 * s, 2.4 * s, 1.5 * s, -0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2.2 * s, -5.3 * s, 1.05 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = fur;
        ctx.lineWidth = Math.max(0.55, 0.65 * s);
        ctx.beginPath();
        ctx.moveTo(-1.8 * s, -3.8 * s);
        ctx.quadraticCurveTo(-5.2 * s, -2.2 * s, -4.5 * s, 0.4 * s);
        ctx.moveTo(0, -3.6 * s);
        ctx.lineTo(-1.2 * s, -0.6 * s);
        ctx.moveTo(1.3 * s, -3.6 * s);
        ctx.lineTo(2.2 * s, -0.8 * s);
        ctx.stroke();
        if (animal.id === 'spider-monkey') {
            ctx.beginPath();
            ctx.moveTo(-2.4 * s, -4.6 * s);
            ctx.quadraticCurveTo(-6 * s, -6 * s, -8 * s, -3.2 * s);
            ctx.stroke();
        }
    } else if (group === 'reptile') {
        if (animal.id === 'caiman') {
            ctx.fillStyle = '#3f5142';
            ctx.beginPath();
            ctx.ellipse(0, -1.4 * s, 4.2 * s, 1.2 * s, 0.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(3.4 * s, -1.6 * s);
            ctx.lineTo(6.4 * s, -2.1 * s);
            ctx.lineTo(6.1 * s, -0.8 * s);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#b49a58';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(-1.4 * s + i * 1.6 * s, -2.2 * s, 0.35 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.strokeStyle = '#4e6b38';
            ctx.lineWidth = Math.max(0.8, 1.2 * s);
            ctx.beginPath();
            ctx.moveTo(-5 * s, 0.2 * s);
            ctx.bezierCurveTo(-2 * s, -2.8 * s, 2 * s, 1.2 * s, 5 * s, -1.2 * s);
            ctx.stroke();
            ctx.strokeStyle = '#71834a';
            ctx.lineWidth = Math.max(0.35, 0.45 * s);
            ctx.beginPath();
            ctx.moveTo(-4.2 * s, 0.1 * s);
            ctx.bezierCurveTo(-1 * s, -2 * s, 2.2 * s, 1 * s, 4.4 * s, -1 * s);
            ctx.stroke();
        }
    } else if (group === 'fish') {
        const bright = animal.id === 'piranha' ? '#b85b43' : '#9eb9ac';
        ctx.fillStyle = bright;
        ctx.beginPath();
        ctx.ellipse(0, -1 * s, 2.8 * s, 1.15 * s, 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-2.3 * s, -1 * s);
        ctx.lineTo(-4.3 * s, -2.4 * s);
        ctx.lineTo(-4.3 * s, 0.4 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d7e2c7';
        ctx.beginPath();
        ctx.arc(1.8 * s, -1.2 * s, 0.32 * s, 0, Math.PI * 2);
        ctx.fill();
    } else if (group === 'bird') {
        if (!['toucan', 'macaw', 'harpy-eagle'].includes(animal.id)) { ctx.restore(); return false; }
        if (animal.id === 'harpy-eagle') {
            ctx.fillStyle = '#756b57';
            ctx.beginPath();
            ctx.ellipse(0, -4 * s, 2.4 * s, 1.4 * s, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d8d4c2';
            ctx.beginPath();
            ctx.arc(1.8 * s, -5.1 * s, 1.1 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#514a3d';
            ctx.lineWidth = Math.max(0.7, 0.9 * s);
            ctx.beginPath();
            ctx.moveTo(-1.2 * s, -4.6 * s);
            ctx.quadraticCurveTo(-6 * s, -7.6 * s, -8.4 * s, -4.2 * s);
            ctx.moveTo(0.8 * s, -4.5 * s);
            ctx.quadraticCurveTo(5.4 * s, -7.2 * s, 7.8 * s, -4 * s);
            ctx.stroke();
        } else if (animal.id === 'toucan') {
            ctx.fillStyle = '#202724';
            ctx.beginPath();
            ctx.ellipse(0, -3.2 * s, 1.9 * s, 1.3 * s, 0.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(1.5 * s, -4.1 * s, 0.9 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e9a33f';
            ctx.beginPath();
            ctx.moveTo(2.1 * s, -4.4 * s);
            ctx.quadraticCurveTo(5.8 * s, -4.3 * s, 6.4 * s, -3.2 * s);
            ctx.quadraticCurveTo(4.8 * s, -2.9 * s, 2.1 * s, -3.6 * s);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#c94a38';
            ctx.beginPath();
            ctx.arc(1.2 * s, -4.2 * s, 0.28 * s, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#c84436';
            ctx.beginPath();
            ctx.ellipse(0, -3.3 * s, 2.1 * s, 1.35 * s, 0.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(1.7 * s, -4.2 * s, 0.9 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2e5f9a';
            ctx.beginPath();
            ctx.moveTo(-1.2 * s, -3.3 * s);
            ctx.lineTo(-5.4 * s, -2.2 * s);
            ctx.lineTo(-1.4 * s, -2.1 * s);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#e2c26a';
            ctx.beginPath();
            ctx.moveTo(-0.8 * s, -2.6 * s);
            ctx.lineTo(-4.2 * s, -1.4 * s);
            ctx.lineTo(-0.6 * s, -1.5 * s);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#c84436';
            ctx.lineWidth = Math.max(0.45, 0.55 * s);
            ctx.beginPath();
            ctx.moveTo(-2 * s, -3 * s);
            ctx.lineTo(-6.4 * s, -1.2 * s);
            ctx.stroke();
        }
    } else if (group === 'insect') {
        if (!['morpho-butterfly', 'butterfly', 'bee'].includes(animal.id)) { ctx.restore(); return false; }
        ctx.fillStyle = animal.id === 'bee' ? '#d6a943' : '#3f83bd';
        ctx.globalAlpha = 0.86;
        ctx.beginPath();
        ctx.ellipse(-1.2 * s, -2.2 * s, 1.5 * s, 0.7 * s, -0.35, 0, Math.PI * 2);
        ctx.ellipse(1.2 * s, -2.2 * s, 1.5 * s, 0.7 * s, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#25352f';
        ctx.beginPath();
        ctx.ellipse(0, -2.2 * s, 0.4 * s, 0.9 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = animal.id === 'poison-dart-frog' ? '#ce5c3f' : '#6f8f4e';
        ctx.beginPath();
        ctx.ellipse(0, -0.8 * s, 1.5 * s, 0.95 * s, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8d46d';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(-0.8 * s + i * 0.8 * s, -1.3 * s, 0.22 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
    return true;
}

function drawForestFauna(ctx, px, py, cellPx, stand, dayOfYear, climateKey, seed, zoom, tileX = null, tileY = null) {
    if (tileX !== null && tileY !== null && !isForestSightVisible(tileX + 0.5, tileY + 0.5)) return;
    const season = seasonalState(dayOfYear, climateKey);
    // A simulated herd owns this tile when one is present. The old habitat
    // pick remains a fallback for forest edges and fresh worlds before the
    // first fauna update has run.
    const simulated = tileX !== null && tileY !== null ? forestFaunaAt(tileX, tileY, stand, dayOfYear) : [];
    const fauna = simulated.length ? simulated : forestFaunaFor(stand, dayOfYear, climateKey, seed);
    if (!fauna.length) return;
    const s = cellPx / 56;
    const animal = fauna[0];
    const x = px + (seed - 0.5) * 8 * s;
    const y = py + 1.5 * s;
    ctx.save();
    ctx.globalAlpha = 0.72;
    if (animal.group === 'large') {
        const body = animal.id === 'boar' ? "#493d31" : animal.id === 'roe-deer' ? "#a77b52" : "#8d6947";
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(x, y - 3 * s, 4.2 * s, 2 * s, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 2.6 * s, y - 2 * s, 0.8 * s, 3.6 * s);
        ctx.fillRect(x + 2 * s, y - 2 * s, 0.8 * s, 3.6 * s);
        ctx.beginPath();
        ctx.ellipse(x + 4.4 * s, y - 4.5 * s, 1.4 * s, 1.2 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
        if (animal.id !== 'boar') {
            ctx.strokeStyle = "#6b4e32";
            ctx.lineWidth = Math.max(0.5, 0.6 * s);
            ctx.beginPath();
            ctx.moveTo(x + 4.6 * s, y - 5.5 * s);
            ctx.lineTo(x + 5.6 * s, y - 8 * s);
            ctx.moveTo(x + 5.1 * s, y - 5.5 * s);
            ctx.lineTo(x + 7 * s, y - 7.2 * s);
            ctx.stroke();
        }
    } else if (animal.group === 'predator') {
        const pelt = animal.id === 'wolf' ? "#59605c" : animal.id === 'lynx' ? "#b68a5a" : animal.id === 'jaguar' ? "#c39a55" : "#b18454";
        ctx.fillStyle = pelt;
        ctx.beginPath();
        ctx.ellipse(x, y - 2.5 * s, (animal.id === 'wolf' ? 4.2 : 3.6) * s, 1.6 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 3.3 * s, y - 3.5 * s, 1.2 * s, 1 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 3.2 * s, y - 2.5 * s);
        ctx.quadraticCurveTo(x - 8 * s, y - 4 * s, x - 8 * s, y - 1 * s);
        ctx.strokeStyle = pelt;
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
        if (animal.id === 'jaguar' || animal.id === 'ocelot') {
            ctx.fillStyle = 'rgba(40, 31, 20, 0.75)';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(x - 1 * s + i * 2.1 * s, y - 3.1 * s + (i % 2) * 0.8 * s, 0.28 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (drawTropicalFaunaShape(ctx, animal, x, y, s)) {
    } else if (animal.group === 'small') {
        ctx.fillStyle = animal.id === 'hare' ? "#a38b68" : animal.id === 'squirrel' ? "#9a633a" : "#76604d";
        ctx.beginPath();
        ctx.ellipse(x, y - 1.5 * s, 2.2 * s, 1.3 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 1.8 * s, y - 2.4 * s, 0.9 * s, 0, Math.PI * 2);
        ctx.fill();
        if (animal.id === 'hare') {
            ctx.strokeStyle = "#a38b68";
            ctx.lineWidth = 0.7 * s;
            ctx.beginPath();
            ctx.moveTo(x + 2 * s, y - 3 * s);
            ctx.lineTo(x + 2.6 * s, y - 5.2 * s);
            ctx.stroke();
        }
    } else if (animal.group === 'bird') {
        if (animal.id === 'raptor') {
            ctx.strokeStyle = "#564b3c";
            ctx.lineWidth = 1.2 * s;
            ctx.beginPath();
            ctx.moveTo(x - 5 * s, y - 12 * s);
            ctx.quadraticCurveTo(x, y - 15 * s, x + 5 * s, y - 12 * s);
            ctx.stroke();
        } else {
            ctx.fillStyle = animal.id === 'owl' ? "#8d7a5e" : animal.id === 'crossbill' ? "#a6533f" : animal.id === 'capercaillie' ? "#3f3a31" : animal.id === 'toucan' ? "#1f2422" : animal.id === 'macaw' ? "#c84436" : animal.id === 'harpy-eagle' ? "#6b6252" : "#655946";
            ctx.beginPath();
            ctx.ellipse(x, y - 4 * s, (animal.id === 'capercaillie' ? 2.2 : 1.5) * s, (animal.id === 'capercaillie' ? 2.8 : 2.1) * s, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + (animal.id === 'woodpecker' ? 1.4 : animal.id === 'crossbill' ? 1.6 : 0.8) * s, y - 5.6 * s, 0.9 * s, 0, Math.PI * 2);
            ctx.fill();
            if (animal.id === 'toucan' || animal.id === 'macaw' || animal.id === 'crossbill') {
                ctx.strokeStyle = animal.id === 'toucan' ? "#e9a33f" : animal.id === 'macaw' ? "#e2c26a" : "#d8c18a";
                ctx.lineWidth = Math.max(0.55, 0.7 * s);
                ctx.beginPath();
                ctx.moveTo(x + 1.8 * s, y - 5.8 * s);
                ctx.lineTo(x + (animal.id === 'toucan' ? 5 : 3.2) * s, y - (animal.id === 'toucan' ? 5.1 : 5.2) * s);
                ctx.stroke();
            }
            if (animal.id === 'macaw') {
                ctx.fillStyle = "#2e5f9a";
                ctx.beginPath();
                ctx.ellipse(x - 1.5 * s, y - 4.2 * s, 1.2 * s, 0.7 * s, -0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else {
        ctx.fillStyle = animal.id === 'butterfly' ? "#d9b24d" : animal.id === 'bee' ? "#c9a33e" : "#554637";
        ctx.beginPath();
        ctx.ellipse(x, y - 3 * s, 1.1 * s, 0.6 * s, 0.3, 0, Math.PI * 2);
        ctx.fill();
        if (animal.id === 'butterfly') {
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.ellipse(x - 1.1 * s, y - 4 * s, 1.3 * s, 0.9 * s, -0.6, 0, Math.PI * 2);
            ctx.ellipse(x + 1.1 * s, y - 4 * s, 1.3 * s, 0.9 * s, 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
    if (zoom > 1.4 && season.snowCover < 0.4 && animal.group === 'large') {
        ctx.fillStyle = "rgba(62, 48, 32, 0.55)";
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(x + (i - 2) * 2.6 * s, y + 3.2 * s + (i % 2) * 0.5 * s, 0.55 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// P1 fauna: one herd is now read as a group. Population sets the number of
// silhouettes, the solar tick gives them a small in-tile walk, and the same
// tile carries the signs a hunter or naturalist would actually see: tracks,
// browsed shoots, a recent carcass and a hollow-nesting bird's nest.
function drawForestFaunaScene(ctx, px, py, cellPx, stand, dayOfYear, climateKey, seed, zoom, tileX, tileY, tick) {
    if (tileX !== null && tileY !== null && !isForestSightVisible(tileX + 0.5, tileY + 0.5)) return;
    const season = seasonalState(dayOfYear, climateKey);
    const herds = tileX !== null && tileY !== null ? forestFaunaAt(tileX, tileY, stand, dayOfYear) : [];
    const signs = tileX !== null && tileY !== null ? forestFaunaSignAt(tileX, tileY, stand, dayOfYear, herds) : null;
    // Saved ant/beetle colonies drive the close-up marks. The old habitat
    // fallback remains for butterflies, bees and fresh worlds where the fauna
    // update has not run yet; simulated species are not drawn twice.
    const savedInsects = tileX !== null && tileY !== null ? forestInsectAt(tileX, tileY) : [];
    const simulatedInsectIds = new Set(savedInsects.map(entry => entry.id));
    const fallbackMicro = forestMicrofaunaAt(stand, dayOfYear, climateKey, seed)
        .filter(entry => !simulatedInsectIds.has(entry.id));
    const micro = zoom >= 1.05
        ? [...savedInsects.map(entry => ({
            ...entry,
            count: Math.max(1, Math.min(3, Math.round(Number(entry.population) * 2))),
        })), ...fallbackMicro].slice(0, 3)
        : [];
    if (!herds.length && !micro.length) return;
    const s = cellPx / 56;
    const jitter = (hashA, hashB) => ((hashA * 37 + hashB * 17 + Math.floor(seed * 997)) % 100) / 100 - 0.5;

    if (signs?.tracks) drawFaunaTracks(ctx, px, py, cellPx, signs, s);
    if (signs?.territory > 0) drawFaunaTerritory(ctx, px, py, cellPx, signs, s);
    if (signs?.browse > 0) drawBrowseLine(ctx, px, py, cellPx, signs.browse, s);
    if (signs?.carcass) drawFaunaCarcass(ctx, px, py, cellPx, signs, s);
    if (signs?.nest) drawFaunaNest(ctx, px, py, cellPx, signs.nest, s);

    const animals = herds.length ? herds : forestFaunaFor(stand, dayOfYear, climateKey, seed).slice(0, 2);
    for (let herdIndex = 0; herdIndex < animals.length; herdIndex++) {
        const animal = animals[herdIndex];
        const population = Math.max(1, Number(animal.population) || 4);
        const count = animal.group === 'large' ? Math.max(1, Math.min(4, Math.round(population / 3)))
            : animal.group === 'bird' ? Math.max(1, Math.min(3, Math.round(population / 2)))
                : animal.group === 'fish' ? Math.max(2, Math.min(5, Math.round(population / 2)))
                    : Math.max(1, Math.min(3, Math.round(population / 4)));
        for (let i = 0; i < count; i++) {
            const phase = seed * 11 + herdIndex * 7 + i * 2.7;
            const spread = cellPx * (animal.group === 'large' ? 0.19 : 0.14);
            const ox = (i - (count - 1) / 2) * spread + Math.sin(tick * 0.018 + phase) * 1.7 * s + jitter(herdIndex + 1, i + 1) * 2 * s;
            const oy = ((i % 2) - 0.5) * cellPx * 0.08 + Math.cos(tick * 0.014 + phase) * 1.1 * s + jitter(i + 2, herdIndex + 1) * 1.5 * s;
            drawFaunaShape(ctx, animal, px + ox, py + 1.5 * s + oy, s, Math.sin(tick * 0.012 + phase) * 0.08, season, zoom);
        }
    }

    // Small mammals and insects are population groups too, not one symbolic
    // icon per tile. Their counts come from deadwood, flowers and moisture.
    for (let entryIndex = 0; entryIndex < micro.length; entryIndex++) {
        const entry = micro[entryIndex];
        const count = Math.min(3, Math.max(1, entry.count));
        for (let i = 0; i < count; i++) {
            const phase = seed * 7 + entryIndex * 9 + i * 3.1;
            const ox = jitter(entryIndex + 3, i + 5) * cellPx * 0.6 + Math.sin(tick * 0.018 + phase) * s;
            const oy = 3.2 * s + jitter(i + 4, entryIndex + 2) * cellPx * 0.32 + Math.cos(tick * 0.015 + phase) * 0.7 * s;
            drawMicroFauna(ctx, entry, px + ox, py + oy, s);
        }
    }
}

function drawFaunaShape(ctx, animal, x, y, s, rotation, season, zoom) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = 0.78;
    if (animal.group === 'large') {
        const body = animal.id === 'boar' ? "#493d31" : animal.id === 'roe-deer' ? "#a77b52" : "#8d6947";
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, -3 * s, 4.2 * s, 2 * s, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-2.6 * s, -2 * s, 0.8 * s, 3.6 * s);
        ctx.fillRect(2 * s, -2 * s, 0.8 * s, 3.6 * s);
        ctx.beginPath();
        ctx.ellipse(4.4 * s, -4.5 * s, 1.4 * s, 1.2 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
        if (animal.id !== 'boar') {
            ctx.strokeStyle = "#6b4e32";
            ctx.lineWidth = Math.max(0.5, 0.6 * s);
            ctx.beginPath();
            ctx.moveTo(4.6 * s, -5.5 * s);
            ctx.lineTo(5.6 * s, -8 * s);
            ctx.moveTo(5.1 * s, -5.5 * s);
            ctx.lineTo(7 * s, -7.2 * s);
            ctx.stroke();
        }
    } else if (animal.group === 'predator') {
        ctx.fillStyle = animal.id === 'jaguar' ? "#c39a55" : animal.id === 'ocelot' ? "#b18454" : "#a85b2f";
        ctx.beginPath();
        ctx.ellipse(0, -2.5 * s, 3.6 * s, 1.6 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(3.3 * s, -3.5 * s, 1.2 * s, 1 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#a85b2f";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(-3.2 * s, -2.5 * s);
        ctx.quadraticCurveTo(-8 * s, -4 * s, -8 * s, -1 * s);
        ctx.stroke();
        if (animal.id === 'jaguar' || animal.id === 'ocelot') {
            ctx.fillStyle = 'rgba(40, 31, 20, 0.75)';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(-1 * s + i * 2.1 * s, -3.1 * s + (i % 2) * 0.8 * s, 0.28 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (drawTropicalFaunaShape(ctx, animal, 0, 0, s)) {
    } else if (animal.group === 'small') {
        ctx.fillStyle = animal.id === 'hare' ? "#a38b68" : animal.id === 'squirrel' ? "#9a633a" : "#76604d";
        ctx.beginPath();
        ctx.ellipse(0, -1.5 * s, 2.2 * s, 1.3 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(1.8 * s, -2.4 * s, 0.9 * s, 0, Math.PI * 2);
        ctx.fill();
        if (animal.id === 'hare') {
            ctx.strokeStyle = "#a38b68";
            ctx.lineWidth = 0.7 * s;
            ctx.beginPath();
            ctx.moveTo(2 * s, -3 * s);
            ctx.lineTo(2.6 * s, -5.2 * s);
            ctx.stroke();
        }
    } else if (animal.group === 'bird') {
        if (animal.id === 'raptor') {
            ctx.strokeStyle = "#564b3c";
            ctx.lineWidth = 1.2 * s;
            ctx.beginPath();
            ctx.moveTo(-5 * s, -12 * s);
            ctx.quadraticCurveTo(0, -15 * s, 5 * s, -12 * s);
            ctx.stroke();
        } else {
            ctx.fillStyle = animal.id === 'owl' ? "#8d7a5e" : animal.id === 'toucan' ? "#1f2422" : animal.id === 'macaw' ? "#c84436" : "#655946";
            ctx.beginPath();
            ctx.ellipse(0, -4 * s, 1.5 * s, 2.1 * s, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc((animal.id === 'woodpecker' ? 1.4 : 0.8) * s, -5.6 * s, 0.9 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        ctx.fillStyle = animal.id === 'butterfly' ? "#d9b24d" : animal.id === 'bee' ? "#c9a33e" : "#554637";
        ctx.beginPath();
        ctx.ellipse(0, -3 * s, 1.1 * s, 0.6 * s, 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    if (zoom > 1.4 && season.snowCover < 0.4 && animal.group === 'large') {
        ctx.fillStyle = "rgba(62, 48, 32, 0.55)";
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(x + (i - 2) * 2.6 * s, y + 3.2 * s + (i % 2) * 0.5 * s, 0.55 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawMicroFauna(ctx, entry, x, y, s) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    if (entry.id === 'butterfly') {
        ctx.fillStyle = "#d9b24d";
        ctx.beginPath();
        ctx.ellipse(x - 0.9 * s, y - 1.2 * s, 1 * s, 0.65 * s, -0.6, 0, Math.PI * 2);
        ctx.ellipse(x + 0.9 * s, y - 1.2 * s, 1 * s, 0.65 * s, 0.6, 0, Math.PI * 2);
        ctx.fill();
    } else if (entry.id === 'bee') {
        ctx.fillStyle = "#c9a33e";
        ctx.beginPath();
        ctx.arc(x, y - 1.5 * s, 0.7 * s, 0, Math.PI * 2);
        ctx.fill();
    } else if (entry.id === 'ant') {
        ctx.fillStyle = "#4b3b2c";
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x + (i - 1) * 0.65 * s, y + (i % 2) * 0.25 * s, 0.3 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (entry.id === 'mouse') {
        ctx.fillStyle = "#76604d";
        ctx.beginPath();
        ctx.ellipse(x, y - 0.8 * s, 1.2 * s, 0.65 * s, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 1 * s, y - 1.2 * s, 0.45 * s, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = "#554637";
        ctx.beginPath();
        ctx.ellipse(x, y - 0.5 * s, 0.8 * s, 0.45 * s, 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawFaunaTracks(ctx, px, py, cellPx, signs, s) {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.min(0.24, signs.browse * 0.2);
    ctx.fillStyle = "#554431";
    for (let i = 0; i < 4; i++) {
        const x = px - cellPx * 0.2 + i * cellPx * 0.13;
        const y = py + cellPx * 0.3 + (i % 2) * 1.2 * s;
        ctx.beginPath();
        ctx.ellipse(x, y, 0.65 * s, 0.35 * s, 0.25, 0, Math.PI * 2);
        ctx.ellipse(x + 1.3 * s, y + 1.1 * s, 0.55 * s, 0.3 * s, 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Territory is not a painted polygon: a fox leaves scent and scratch marks at
// a boundary tree, a bird keeps a song post above its nest. Both are small and
// read as sign, not as a glowing range indicator.
function drawFaunaTerritory(ctx, px, py, cellPx, signs, s) {
    ctx.save();
    ctx.globalAlpha = 0.22 + signs.territory * 0.2;
    ctx.strokeStyle = signs.territoryKind === "bird" ? "#5e5140" : "#6d5335";
    ctx.lineWidth = Math.max(0.6, 0.75 * s);
    if (signs.territoryKind === "bird") {
        ctx.beginPath();
        ctx.moveTo(px - cellPx * 0.26, py + cellPx * 0.18);
        ctx.lineTo(px - cellPx * 0.26, py - cellPx * 0.03);
        ctx.moveTo(px - cellPx * 0.3, py - cellPx * 0.03);
        ctx.lineTo(px - cellPx * 0.22, py - cellPx * 0.03);
        ctx.stroke();
        ctx.fillStyle = "#5e5140";
        ctx.beginPath();
        ctx.arc(px - cellPx * 0.17, py - cellPx * 0.05, 0.8 * s, 0, Math.PI * 2);
        ctx.arc(px - cellPx * 0.13, py - cellPx * 0.09, 0.6 * s, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.moveTo(px + cellPx * 0.27, py + cellPx * 0.22);
        ctx.lineTo(px + cellPx * 0.27, py + cellPx * 0.13);
        for (let i = 0; i < 3; i++) {
            ctx.moveTo(px + cellPx * 0.23 + i * 2.2 * s, py + cellPx * 0.2);
            ctx.lineTo(px + cellPx * 0.24 + i * 2.2 * s, py + cellPx * 0.14);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawBrowseLine(ctx, px, py, cellPx, strength, s) {
    ctx.save();
    ctx.globalAlpha = 0.24 + strength * 0.18;
    ctx.strokeStyle = "#6e5938";
    ctx.lineWidth = Math.max(0.65, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(px - cellPx * 0.28, py + cellPx * 0.18);
    ctx.lineTo(px + cellPx * 0.26, py + cellPx * 0.21);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
        const x = px - cellPx * 0.22 + i * cellPx * 0.13;
        ctx.beginPath();
        ctx.moveTo(x, py + cellPx * 0.2);
        ctx.lineTo(x + 1.5 * s, py + cellPx * 0.25);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFaunaCarcass(ctx, px, py, cellPx, signs, s) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.translate(px + cellPx * 0.14, py + cellPx * 0.24);
    ctx.rotate(-0.18);
    ctx.fillStyle = "#6f5138";
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.8 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d4c6a2";
    ctx.lineWidth = 0.55 * s;
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-2 * s + i * 1.3 * s, -0.4 * s, 0.65 * s, 0.1, Math.PI - 0.1);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFaunaNest(ctx, px, py, cellPx, kind, s) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = kind === 'hollow' ? "#2f2418" : "#6d5539";
    ctx.beginPath();
    ctx.ellipse(px + cellPx * 0.2, py + cellPx * 0.09, 1.7 * s, 1.0 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#93744c";
    ctx.lineWidth = Math.max(0.45, 0.5 * s);
    ctx.beginPath();
    ctx.arc(px + cellPx * 0.2, py + cellPx * 0.09, 2.1 * s, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
}

function drawShrub(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey = "temperate") {
    const s = cellPx / 48;
    // Roughly a quarter of the shrubs are evergreen; the rest lose their
    // leaves on the same continuous schedule as the broadleaf trees.
    const evergreen = s1 > 0.72;
    const foliage = foliageState(dayOfYear, { seed: s2, species: evergreen ? "conifer" : "shrub", climate: climateKey });
    if (!evergreen && foliage.bare) {
        ctx.strokeStyle = "rgba(120,112,96,0.8)";
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px, py + 2 * s);
            ctx.lineTo(px + (i - 1) * 4 * s, py - 4 * s);
            ctx.stroke();
        }
        drawSnowCaps(ctx, px, py, s, 1, s2, foliage.snow, py - 4 * s, 5);
        return;
    }
    const cover = evergreen ? 1 : Math.max(0.2, foliage.leaf);
    const crown = mixHex(s1 > 0.5 ? "#3c7238" : "#4c7f3e", "#8a6a34", evergreen ? 0 : foliage.turn);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * cover;
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.ellipse(px, py, (6 + s2 * 3) * s * (0.7 + 0.3 * cover), (4.2 + s1 * 2) * s * (0.7 + 0.3 * cover), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = evergreen ? "rgba(146,190,96,0.65)" : `rgba(146,190,96,${0.25 + 0.4 * (1 - foliage.turn)})`;
    ctx.beginPath();
    ctx.ellipse(px - 2 * s, py - 2 * s, 2.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (s2 > 0.7 && cover > 0.6) {
        ctx.fillStyle = "rgba(190,74,74,0.9)";
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + (i - 1) * 2.4 * s, py + (i % 2 ? -1 : 1) * 1.6 * s, 0.8 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    drawSnowCaps(ctx, px, py, s, 1, s2, foliage.snow * 0.7, py - 4 * s, 6);
}

function drawFlowerCluster(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey = "temperate") {
    drawFlower(ctx, px, py, cellPx, s1, dayOfYear, climateKey);
    drawFlower(ctx, px + (s2 - 0.5) * 7 * (cellPx / 48), py + 3 * (cellPx / 48), cellPx, 1 - s1, dayOfYear, climateKey);
    drawFlower(ctx, px - 4 * (cellPx / 48), py + (s1 - 0.5) * 5 * (cellPx / 48), cellPx, s2, dayOfYear, climateKey);
}

// A conifer is not one repeated triangle. Spruce is a narrow, drooping spire;
// fir is a dense broad tier stack; pine lifts a crown above a long bare trunk;
// larch is airy and drops its needles; juniper is a low, many-stemmed scrub.
// Age, wind exposure, snow load and damage all change the same species form.
export function drawConifer(ctx, px, py, s, sway, seed, dayOfYear, climateKey = "temperate", ageScale = 1, species = "spruce", stand = null, treeForm = null) {
    const definition = FOREST_SPECIES[species] || FOREST_SPECIES.spruce;
    const heightScale = treeForm?.heightScale || 1;
    const trunkScale = treeForm?.trunkScale || 1;
    const crownScale = treeForm?.crownScale || 1;
    const krummholz = Boolean(stand?.treeline);
    const foliage = foliageState(dayOfYear, { seed, species, climate: climateKey });
    // Local snow depth is derived from elevation and exposure, so a high, open
    // ridge holds visibly more snow than a sheltered lowland stand on the same
    // winter day. The weather-driven cover remains the outer bound.
    const snowPotential = Number(stand?.snowPotential);
    if (Number.isFinite(snowPotential)) foliage.snow = Math.min(1, foliage.snow * (0.78 + snowPotential * 0.38));
    const shape = definition.crownShape || "spire";
    const height = (17 + definition.height * 13) * s * ageScale * heightScale * (krummholz ? 0.62 : 1);
    const baseY = py + 8 * s;
    const lean = sway + (seed - 0.5) * 1.8 * s + (treeForm?.lean || 0) * s
        + (krummholz ? 2.2 * s : 0) + (stand?.disturbance === 'windthrow' ? 3.8 * s : 0);
    const trunkW = Math.max(1.1, definition.trunk * 3.3 * s * (0.7 + ageScale * 0.3) * trunkScale);
    let crown = mixHex(definition.summer[0], definition.autumn[0], foliage.turn * 0.88);
    let light = mixHex(definition.summer[1], definition.autumn[1], foliage.turn * 0.88);
    if (stand?.disturbance === 'bark-beetle') {
        crown = mixHex(crown, "#81543a", 0.78);
        light = mixHex(light, "#a06a43", 0.7);
    } else if (stand?.disturbance === 'drought-stressed') {
        crown = mixHex(crown, "#8f803f", 0.48);
        light = mixHex(light, "#b39b55", 0.36);
    }
    const cover = foliage.evergreen ? 1 : Math.max(0.06, foliage.leaf);

    // The trunk is visible between the lower tiers and through the deep shade.
    // A subtle light edge and a few resin glints make wet bark readable.
    ctx.fillStyle = definition.bark;
    ctx.beginPath();
    ctx.moveTo(px - trunkW * 0.5, baseY);
    ctx.quadraticCurveTo(px - trunkW * 0.4 + lean * 0.3, py, px - trunkW * 0.22 + lean, py - height * 0.74);
    ctx.lineTo(px + trunkW * 0.22 + lean, py - height * 0.74);
    ctx.quadraticCurveTo(px + trunkW * 0.44 + lean * 0.3, py, px + trunkW * 0.5, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = definition.barkLight;
    ctx.globalAlpha = 0.48;
    ctx.fillRect(px - trunkW * 0.3 + lean * 0.25, py - height * 0.58, Math.max(0.7, trunkW * 0.18), height * 0.55);
    // Wet bark catches a narrow cool specular edge. Resin beads only appear on
    // the warmer, drier side, so a wet conifer does not become a painted gloss.
    const wetness = Math.max(0, Math.min(1, Number(stand?.wetness) || 0));
    if (wetness > 0.1) {
        ctx.fillStyle = "#d6e7e1";
        ctx.globalAlpha = 0.08 + wetness * 0.28;
        ctx.fillRect(px + trunkW * 0.08 + lean * 0.18, py - height * 0.5,
            Math.max(0.45, trunkW * 0.1), height * 0.4);
        if (wetness > 0.42) {
            ctx.fillStyle = "#c89a52";
            ctx.globalAlpha = 0.38 + wetness * 0.25;
            for (let i = 0; i < 2; i++) {
                ctx.beginPath();
                ctx.ellipse(px + trunkW * 0.26 + lean * 0.2, py - height * (0.24 + i * 0.13),
                    Math.max(0.45, 0.55 * s), Math.max(0.75, 1.1 * s), 0.18, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.globalAlpha = 1;
    if (ageScale > 1.02) {
        ctx.strokeStyle = mixHex(definition.bark, "#1e1610", 0.35);
        ctx.lineWidth = Math.max(0.55, 0.72 * s);
        ctx.beginPath();
        ctx.moveTo(px - trunkW * 0.18, baseY - height * 0.12);
        ctx.lineTo(px + trunkW * 0.2, baseY - height * 0.3);
        ctx.stroke();
    }

    // Larch is the deciduous conifer: in winter only its fine branch skeleton
    // remains. The other four keep their needles and only carry more snow.
    if (foliage.bare) {
        ctx.save();
        ctx.strokeStyle = definition.barkLight;
        ctx.lineCap = "round";
        const branches = shape === 'scrub' ? 4 : 6;
        for (let i = 0; i < branches; i++) {
            const t = i / Math.max(1, branches - 1);
            const y = py - height * (0.18 + t * 0.65);
            const reach = (10 - t * 5.5) * s * ageScale;
            ctx.lineWidth = Math.max(0.55, (1.15 - t * 0.45) * s);
            ctx.beginPath();
            ctx.moveTo(px + lean * t, y + 1.2 * s);
            ctx.lineTo(px + lean * t - reach, y + 3.2 * s - t * 1.4 * s);
            ctx.moveTo(px + lean * t, y + 1.2 * s);
            ctx.lineTo(px + lean * t + reach, y + 3.2 * s - t * 1.4 * s);
            ctx.stroke();
        }
        ctx.restore();
        if (foliage.snow > 0.18) drawSnowCaps(ctx, px, py, s * ageScale * 0.72, sway, seed, foliage.snow, py - height * 0.65, 7);
        return;
    }

    // Tier geometry: from a full lower skirt to a narrow leader. A pine keeps a
    // long bare trunk before its crown; juniper starts at the ground and fans
    // out from several stems.
    const tierCount = Math.max(3, Math.min(9, Number(definition.tiers) || 5));
    const crownBase = shape === 'crown' ? 0.42 : shape === 'scrub' ? 0.08 : shape === 'yew' ? 0.2 : 0.17;
    const tierSpan = shape === 'crown' ? 0.42 : shape === 'scrub' ? 0.52 : shape === 'yew' ? 0.58 : 0.73;
    const widthScale = shape === 'scrub' ? 1.22 : shape === 'yew' ? 0.96 : shape === 'crown' ? 0.84 : 1;
    const tiers = shape === 'crown' || shape === 'scrub' || shape === 'yew' ? 3 : tierCount;
    for (let tier = 0; tier < tiers; tier++) {
        const t = tiers === 1 ? 0 : tier / (tiers - 1);
        const layerBase = py + 2 * s - height * (crownBase + t * tierSpan);
        const top = layerBase - height * (0.3 - t * 0.055);
        const width = (11.4 - t * (shape === 'crown' ? 4 : shape === 'yew' ? 5.5 : 7.2)) * s * widthScale * definition.crown * ageScale * crownScale;
        const droop = (definition.branchDrop || 0.1) * s * (1 - t * 0.55);
        ctx.fillStyle = tier % 2 === 0 ? crown : light;
        ctx.globalAlpha = 0.58 + cover * 0.42;
        ctx.beginPath();
        ctx.moveTo(px + lean * (0.4 + t * 0.6), top);
        ctx.lineTo(px + lean * 0.4 - width, layerBase + droop);
        ctx.lineTo(px + lean * 0.4 - width * 0.55, layerBase + 2.4 * s + droop);
        ctx.lineTo(px + lean * 0.4, layerBase - 1.4 * s);
        ctx.lineTo(px + lean * 0.4 + width * 0.55, layerBase + 2.4 * s + droop);
        ctx.lineTo(px + lean * 0.4 + width, layerBase + droop);
        ctx.closePath();
        ctx.fill();

        if (foliage.snow > 0.1) {
            const snow = Math.min(1, foliage.snow * (1.02 - t * 0.08));
            const snowLine = top + (layerBase - top) * (0.38 + snow * 0.3);
            const snowWidth = width * ((snowLine - top) / Math.max(0.001, layerBase - top));
            ctx.save();
            ctx.globalAlpha = Math.min(0.94, snow);
            ctx.fillStyle = "#edf6fb";
            ctx.beginPath();
            ctx.moveTo(px + lean * 0.5, top + 0.8 * s);
            ctx.lineTo(px + lean * 0.4 - snowWidth, snowLine);
            for (let i = 1; i < 5; i++) {
                const u = i / 5;
                ctx.lineTo(px + lean * 0.4 - snowWidth + u * snowWidth * 2, snowLine + (i % 2 === 0 ? 0.85 : 0.15) * s);
            }
            ctx.lineTo(px + lean * 0.4 + snowWidth, snowLine);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }
    ctx.globalAlpha = 1;

    // Evergreens do shoot new needles in spring; the seasonal sampler already
    // computes `fresh`, so show it as a pale fringe on the upper branch tips.
    const fresh = Math.max(0, Math.min(1, Number(foliage.fresh) || 0));
    if (fresh > 0.12 && !foliage.bare) {
        ctx.save();
        ctx.fillStyle = mixHex(light, "#b9d47a", 0.62);
        ctx.globalAlpha = 0.2 + fresh * 0.55;
        for (let i = 0; i < 4; i++) {
            const t = 0.44 + i * 0.12;
            const y = py - height * t;
            const x = px + lean * 0.38 + (i % 2 === 0 ? -1 : 1) * (5.2 - i * 0.6) * s;
            ctx.beginPath();
            ctx.ellipse(x, y, Math.max(0.7, 1.6 * s), Math.max(0.45, 0.7 * s), 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Cones, snow clumps and broken leaders are small but species-readable at
    // close zoom. Only a handful of marks are drawn per tree to keep the tile
    // budget bounded.
    if ((definition.id === 'pine' || definition.id === 'spruce' || definition.id === 'fir') && seed > 0.45) {
        ctx.fillStyle = definition.id === 'pine' ? "#9b6a32" : "#6b4e34";
        for (let i = 0; i < 3; i++) {
            const y = py - height * (0.34 + i * 0.11);
            const x = px + lean * 0.4 + (i % 2 === 0 ? -1 : 1) * (5.2 - i * 0.7) * s;
            ctx.beginPath();
            ctx.ellipse(x, y, 1.05 * s, 1.7 * s, 0.25, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (foliage.snow > 0.22) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, foliage.snow);
        ctx.fillStyle = "#eef6fb";
        for (let i = 0; i < 3; i++) {
            const y = py - height * (0.2 + i * 0.19);
            const x = px + lean * 0.4 + (i % 2 === 0 ? -1 : 1) * (7 - i * 1.5) * s;
            ctx.beginPath();
            ctx.ellipse(x, y, (2.6 - i * 0.35) * s, 0.8 * s, 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    if (stand?.disturbance === 'snowbreak' && seed > 0.4) {
        ctx.strokeStyle = definition.bark;
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.beginPath();
        ctx.moveTo(px + lean * 0.7, py - height * 0.58);
        ctx.lineTo(px + lean * 0.7 + 4.6 * s, py - height * 0.5);
        ctx.stroke();
    }
}

function drawPalm(ctx, px, py, s, sway, seed) {
    ctx.strokeStyle = "#6b5232";
    ctx.lineWidth = Math.max(1.4, 2.6 * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 8 * s);
    ctx.quadraticCurveTo(px + 2 * s, py - 2 * s, px + sway * 0.6, py - 10 * s);
    ctx.stroke();
    ctx.fillStyle = "#3f7a3f";
    for (let i = 0; i < 5; i++) {
        const angle = -Math.PI * 0.9 + i * Math.PI * 0.45;
        const tipX = px + Math.cos(angle) * (12 + seed * 4) * s + sway;
        const tipY = py - 10 * s + Math.sin(angle) * 8 * s;
        ctx.beginPath();
        ctx.moveTo(px + sway, py - 10 * s);
        ctx.quadraticCurveTo(px + Math.cos(angle) * 7 * s, py - 12 * s + Math.sin(angle) * 4 * s, tipX, tipY);
        ctx.quadraticCurveTo(px + Math.cos(angle) * 6 * s, py - 8 * s, px + sway, py - 10 * s);
        ctx.fill();
    }
    ctx.fillStyle = "#8a6a34";
    ctx.beginPath();
    ctx.arc(px + sway, py - 9 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawDeadTree(ctx, px, py, s, sway) {
    ctx.strokeStyle = "#6a5a44";
    ctx.lineWidth = Math.max(1.2, 2.2 * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 9 * s);
    ctx.lineTo(px + sway * 0.5, py - 9 * s);
    ctx.moveTo(px + sway * 0.3, py - 2 * s);
    ctx.lineTo(px - 6 * s, py - 7 * s);
    ctx.moveTo(px + sway * 0.3, py - 4 * s);
    ctx.lineTo(px + 6 * s, py - 11 * s);
    ctx.stroke();
}

function drawRock(ctx, px, py, cellPx, zoom, snowy) {
    const s = cellPx / 48;
    ctx.fillStyle = snowy ? "#9aa2a4" : "#6e6e64";
    ctx.beginPath();
    ctx.moveTo(px - 9 * s, py + 7 * s);
    ctx.lineTo(px - 5 * s, py - 5 * s);
    ctx.lineTo(px + 5 * s, py - 3 * s);
    ctx.lineTo(px + 9 * s, py + 7 * s);
    ctx.closePath();
    ctx.fill();
    if (zoom > 0.9) {
        ctx.fillStyle = snowy ? "#c8d0d2" : "#9a9a90";
        ctx.beginPath();
        ctx.moveTo(px - 4 * s, py);
        ctx.lineTo(px - 1 * s, py - 4 * s);
        ctx.lineTo(px + 3 * s, py - 2 * s);
        ctx.lineTo(px - 1 * s, py + 2 * s);
        ctx.closePath();
        ctx.fill();
    }
    if (snowy) {
        ctx.fillStyle = "rgba(244,248,250,0.9)";
        ctx.beginPath();
        ctx.ellipse(px, py - 5 * s, 5 * s, 2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCactus(ctx, px, py, cellPx, s1) {
    const s = cellPx / 48;
    ctx.fillStyle = s1 > 0.5 ? "#5f7f4a" : "#6f8a52";
    ctx.fillRect(px - 2 * s, py - 8 * s, 4 * s, 14 * s);
    ctx.fillRect(px - 7 * s, py - 4 * s, 3 * s, 6 * s);
    ctx.fillRect(px - 7 * s, py + 1 * s, 6 * s, 2.4 * s);
    ctx.fillRect(px + 4 * s, py - 6 * s, 3 * s, 5 * s);
    ctx.fillRect(px + 2 * s, py - 6 * s, 5 * s, 2.2 * s);
}

// Direction from a land tile towards the nearest water, or null inland. One
// step is enough for the shoreline dressing band and keeps this cheap.
function shoreDirection(x, y, sea) {
    let dx = 0, dy = 0;
    if (getHeightAt(x + 1.5, y + 0.5) < sea) dx += 1;
    if (getHeightAt(x - 0.5, y + 0.5) < sea) dx -= 1;
    if (getHeightAt(x + 0.5, y + 1.5) < sea) dy += 1;
    if (getHeightAt(x + 0.5, y - 0.5) < sea) dy -= 1;
    if (!dx && !dy) return null;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
}

function drawWetEdge(ctx, px, py, cellPx, shore, s1) {
    const s = cellPx / 48;
    const angle = Math.atan2(shore.y, shore.x);
    ctx.save();
    ctx.fillStyle = `rgba(26, 38, 33, ${0.08 + s1 * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(px + shore.x * cellPx * 0.22, py + shore.y * cellPx * 0.22,
        cellPx * 0.40, cellPx * 0.17, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(196, 214, 204, 0.14)";
    ctx.lineWidth = Math.max(0.7, 0.9 * s);
    ctx.beginPath();
    ctx.ellipse(px + shore.x * cellPx * 0.44, py + shore.y * cellPx * 0.44,
        cellPx * 0.36, cellPx * 0.14, angle, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawShoreStones(ctx, px, py, cellPx, s1, s2) {
    const s = cellPx / 48;
    ctx.fillStyle = "rgba(94, 100, 96, 0.82)";
    for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 4.5 * s + (s1 - 0.5) * 3 * s;
        const oy = (i % 2 === 0 ? 1 : -1) * 2.2 * s + (s2 - 0.5) * 2 * s;
        ctx.beginPath();
        ctx.ellipse(px + ox, py + oy, (2.6 + (i % 2) * 1.2) * s, (1.7 + (i % 3)) * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "rgba(198, 206, 198, 0.32)";
    ctx.beginPath();
    ctx.ellipse(px - 3 * s, py - 1 * s, 1.6 * s, 0.8 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawDriftwood(ctx, px, py, cellPx, s1, shore) {
    const s = cellPx / 48;
    const angle = Math.atan2(shore?.y ?? 0.4, shore?.x ?? 0.8) + Math.PI * 0.5;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(104, 86, 62, 0.85)";
    ctx.lineWidth = Math.max(1.2, 2 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-7 * s, 0);
    ctx.quadraticCurveTo(0, (-1.2 + s1) * s, 8 * s, 0.6 * s);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    ctx.beginPath();
    ctx.moveTo(2 * s, 0);
    ctx.lineTo(5 * s, -3.4 * s);
    ctx.stroke();
    ctx.restore();
}

function drawReeds(ctx, px, py, cellPx, s1, s2, temp, shore = null, turn = 0, snow = 0) {
    const s = cellPx / 48;
    const height = (8 + s2 * 8) * s;
    if (shore) {
        // A faint reflection keeps the cluster attached to the bank.
        ctx.strokeStyle = temp < 0.4 ? "rgba(110,120,104,0.18)" : "rgba(58,84,48,0.20)";
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        for (let i = 0; i < 3; i++) {
            const offset = (i - 1) * 2.6 * s;
            ctx.beginPath();
            ctx.moveTo(px + offset + shore.x * 4 * s, py + 5 * s + shore.y * 4 * s);
            ctx.lineTo(px + offset + shore.x * 7 * s, py + 8 * s + shore.y * 7 * s);
            ctx.stroke();
        }
    }
    const reedBase = temp < 0.4 ? [142, 150, 120] : [84, 112, 58];
    const reedWarm = [160, 128, 66];
    const rr = Math.round(reedBase[0] + (reedWarm[0] - reedBase[0]) * turn);
    const rg = Math.round(reedBase[1] + (reedWarm[1] - reedBase[1]) * turn);
    const rb = Math.round(reedBase[2] + (reedWarm[2] - reedBase[2]) * turn);
    ctx.strokeStyle = `rgba(${rr},${rg},${rb},${0.85 * (1 - snow * 0.5)})`;
    ctx.lineWidth = Math.max(1, 1.25 * s);
    for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * 1.9 * s;
        const lean = (s1 - 0.5) * (4 + i * 0.7) * s;
        const tall = height * (0.72 + ((i * 37) % 10) / 18);
        ctx.beginPath();
        ctx.moveTo(px + offset, py + 4 * s);
        ctx.quadraticCurveTo(px + offset + lean * 0.4, py - tall * 0.55, px + offset + lean, py - tall);
        ctx.stroke();
    }
    ctx.fillStyle = "#7b5d34";
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * 3 * s + i * 2.4 * s, py - height * (0.92 - i * 0.1), 1.3 * s, 2.8 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFlower(ctx, px, py, cellPx, s1, dayOfYear, climateKey = "temperate") {
    const bloom = flowerBloom(dayOfYear, climateKey);
    if (bloom < 0.08) return;
    const climate = seasonalState(dayOfYear, climateKey);
    const r = cellPx * 0.045;
    const color = climate.foliageTurn > 0.35
        ? "rgba(196,132,64,0.8)"
        : s1 > 0.5 ? "rgba(214,96,132,0.8)" : "rgba(244,239,208,0.85)";
    ctx.save();
    ctx.globalAlpha = bloom;
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(px + Math.cos(angle) * r * 0.7, py + Math.sin(angle) * r * 0.7, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "rgba(226,182,60,0.9)";
    ctx.beginPath();
    ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawGrassTufts(ctx, px, py, cellPx, s1, s2, dry, turn = 0, snow = 0) {
    if (snow > 0.7) return;
    const s = cellPx / 48;
    const lean = (s2 - 0.5) * 4 * s;
    // Grass browns off with the same curve as the trees instead of staying
    // green until the first day of autumn and then snapping to ochre.
    const base = dry ? [150, 132, 78] : [38, 82, 36];
    const warm = [156, 112, 52];
    const r = Math.round(base[0] + (warm[0] - base[0]) * turn);
    const g = Math.round(base[1] + (warm[1] - base[1]) * turn);
    const b = Math.round(base[2] + (warm[2] - base[2]) * turn);
    ctx.strokeStyle = `rgba(${r},${g},${b},${(dry ? 0.55 : 0.5) * (1 - snow * 0.55)})`;
    ctx.lineWidth = Math.max(1, 1.05 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py + 3.4 * s);
    ctx.quadraticCurveTo(px - 1.4 * s + lean, py - 0.8 * s, px - 2 * s + lean, py - 4.6 * s);
    ctx.moveTo(px + 1.8 * s, py + 3.4 * s);
    ctx.quadraticCurveTo(px + 3 * s + lean, py - 0.6 * s, px + 2.4 * s + lean, py - 3.8 * s);
    ctx.stroke();
    ctx.lineCap = "butt";
}


// ── Grassland ecology renderer ──────────────────────────────────────────────
// The profile already knows whether this tile is short turf, a hay meadow, wet
// ground, chalk downland, a hillside, an orchard or a mountain pasture. The
// renderer only turns that shared description into strokes: no second biome
// decision can disagree with gathering or the survey.
function drawMeadowFlower(ctx, x, y, size, flower, alpha = 0.85, glow = 0) {
    if (!flower) return;
    const colour = flower.colours?.[0] || "#e7d9a4";
    const centre = flower.colours?.[1] || "#dfae42";
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(72,92,47,0.62)";
    ctx.lineWidth = Math.max(0.5, 0.55 * size);
    ctx.beginPath();
    ctx.moveTo(x, y + 4 * size);
    ctx.lineTo(x + 0.4 * size, y);
    ctx.stroke();
    if (glow > 0.08) {
        ctx.globalAlpha = alpha * (0.16 + glow * 0.2);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = colour;
    for (let petal = 0; petal < 4; petal++) {
        const angle = petal * Math.PI / 2 + 0.35;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(angle) * 1.35 * size, y + Math.sin(angle) * 1.35 * size,
            1.25 * size, 0.8 * size, angle, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = centre;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawMeadowHerb(ctx, x, y, size, herb) {
    if (!herb) return;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = "rgba(79,106,56,0.8)";
    ctx.lineWidth = Math.max(0.45, 0.5 * size);
    ctx.beginPath();
    ctx.moveTo(x, y + 4 * size);
    ctx.quadraticCurveTo(x + 0.7 * size, y + 1 * size, x + 0.2 * size, y - 1.6 * size);
    ctx.stroke();
    ctx.fillStyle = herb.colour || "#d9d0ad";
    for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x + 0.2 * size + Math.cos(angle) * 1.2 * size, y - 1.6 * size + Math.sin(angle) * 1.2 * size,
            0.55 * size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawMeadowSapling(ctx, x, y, size, profile) {
    ctx.save();
    ctx.strokeStyle = "rgba(87,107,57,0.72)";
    ctx.lineWidth = Math.max(0.5, 0.55 * size);
    ctx.beginPath();
    ctx.moveTo(x, y + 2.8 * size);
    ctx.lineTo(x + 0.3 * size, y - 2.6 * size);
    ctx.stroke();
    ctx.fillStyle = profile.leafColour || "#6d8c4c";
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.ellipse(x + 0.2 * size, y - 2.5 * size, 1.4 * size, 0.68 * size, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export function drawGrasslandFauna(ctx, x, y, size, animal, tick, season) {
    if (!animal) return;
    const kind = animal.kind;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.82;
    const bob = Math.sin(tick * 0.012 + x * 0.02) * 0.3 * size;
    if (kind === "deer") {
        ctx.fillStyle = season === "winter" ? "#756e5b" : "#92724e";
        ctx.beginPath();
        ctx.ellipse(0, -3.4 * size + bob, 3.5 * size, 1.8 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-2.2 * size, -2.2 * size, 0.7 * size, 3.1 * size);
        ctx.fillRect(1.7 * size, -2.2 * size, 0.7 * size, 3.1 * size);
        ctx.beginPath();
        ctx.ellipse(3.7 * size, -5 * size + bob, 1.2 * size, 1.05 * size, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#654d36";
        ctx.lineWidth = Math.max(0.45, 0.45 * size);
        ctx.beginPath();
        ctx.moveTo(4.1 * size, -6 * size + bob);
        ctx.lineTo(5.6 * size, -8.6 * size + bob);
        ctx.moveTo(4.6 * size, -6 * size + bob);
        ctx.lineTo(6.2 * size, -7.4 * size + bob);
        ctx.stroke();
    } else if (kind === "hare") {
        ctx.fillStyle = season === "winter" ? "#d9d6c8" : "#a98d66";
        ctx.beginPath();
        ctx.ellipse(0, -1.8 * size + bob, 2.8 * size, 1.55 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(2.4 * size, -3.1 * size + bob, 0.9 * size, 0.7 * size, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(2.6 * size, -5.2 * size + bob, 0.34 * size, 1.6 * size, -0.3, 0, Math.PI * 2);
        ctx.fill();
    } else if (kind === "fox" || kind === "stoat") {
        const stoat = kind === "stoat";
        ctx.fillStyle = stoat ? (season === "winter" ? "#e5e2d6" : "#b28d5c") : "#ad6234";
        ctx.beginPath();
        ctx.ellipse(0, -2 * size + bob, stoat ? 2.5 * size : 3.2 * size, 1.15 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(2.4 * size, -3 * size + bob, 0.9 * size, 0.72 * size, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.8 * size;
        ctx.beginPath();
        ctx.moveTo(-2.2 * size, -1.8 * size + bob);
        ctx.quadraticCurveTo(-4.8 * size, -1.2 * size + bob, -5.2 * size, -3.2 * size + bob);
        ctx.stroke();
    } else if (kind === "butterfly") {
        const wing = Math.sin(tick * 0.09 + x) * 0.35 + 0.75;
        ctx.fillStyle = animal.id === "meadow-brown" ? "#8f6b45" : "#c48544";
        ctx.beginPath();
        ctx.ellipse(-0.9 * size, -1.2 * size, 1.2 * size * wing, 1.5 * size, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0.9 * size, -1.2 * size, 1.2 * size * wing, 1.5 * size, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4e3e2c";
        ctx.fillRect(-0.18 * size, -2.4 * size, 0.36 * size, 2.4 * size);
    } else if (kind === "bee") {
        ctx.fillStyle = "#d4a62e";
        ctx.beginPath();
        ctx.ellipse(0, -1.6 * size, 1.2 * size, 0.8 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(232,235,218,0.7)";
        ctx.beginPath();
        ctx.ellipse(-0.55 * size, -2.2 * size, 0.9 * size, 0.55 * size, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0.55 * size, -2.2 * size, 0.9 * size, 0.55 * size, 0.4, 0, Math.PI * 2);
        ctx.fill();
    } else if (kind === "raptor") {
        ctx.strokeStyle = "#66523d";
        ctx.lineWidth = Math.max(0.6, 0.65 * size);
        ctx.beginPath();
        ctx.moveTo(-4 * size, -4 * size + bob);
        ctx.quadraticCurveTo(-1 * size, -2.8 * size + bob, 0, -3.6 * size + bob);
        ctx.quadraticCurveTo(1 * size, -2.8 * size + bob, 4 * size, -4 * size + bob);
        ctx.stroke();
    } else if (kind === "songbird" || kind === "ground-bird") {
        ctx.fillStyle = kind === "ground-bird" ? "#9a8762" : "#6d6754";
        ctx.beginPath();
        ctx.ellipse(0, -1.8 * size + bob, 1.5 * size, 1.05 * size, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(1.4 * size, -2.8 * size + bob, 0.65 * size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7a5e38";
        ctx.lineWidth = 0.4 * size;
        ctx.beginPath();
        ctx.moveTo(-0.3 * size, -0.7 * size);
        ctx.lineTo(-0.3 * size, 1.6 * size);
        ctx.moveTo(0.5 * size, -0.7 * size);
        ctx.lineTo(0.5 * size, 1.6 * size);
        ctx.stroke();
    } else if (kind === "mouse") {
        ctx.fillStyle = "#8c7655";
        ctx.beginPath();
        ctx.ellipse(0, -0.9 * size, 1.35 * size, 0.75 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(1.1 * size, -1.4 * size, 0.5 * size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8c7655";
        ctx.lineWidth = 0.35 * size;
        ctx.beginPath();
        ctx.moveTo(-1.2 * size, -0.7 * size);
        ctx.quadraticCurveTo(-2.3 * size, -0.5 * size, -2.8 * size, 0.2 * size);
        ctx.stroke();
    } else if (kind === "cattle" || kind === "sheep" || kind === "goat" || kind === "horse") {
        const horse = kind === "horse";
        const sheep = kind === "sheep";
        const goat = kind === "goat";
        const body = horse ? "#6c5440" : sheep ? "#ddd8c6" : goat ? "#a18a67" : "#795540";
        ctx.fillStyle = body;
        if (sheep) {
            for (let index = 0; index < 3; index++) {
                ctx.beginPath();
                ctx.ellipse((index - 1) * 1.25 * size, -2.4 * size + bob, 1.8 * size, 1.35 * size, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.beginPath();
            ctx.ellipse(0, -2.6 * size + bob, 3.6 * size, 1.65 * size, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = sheep ? "#6f604e" : body;
        ctx.beginPath();
        ctx.ellipse(3.1 * size, -3.5 * size + bob, 1.05 * size, 0.85 * size, horse ? 0.3 : 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-2.2 * size, -1.5 * size, 0.65 * size, 3.8 * size);
        ctx.fillRect(1.7 * size, -1.5 * size, 0.65 * size, 3.8 * size);
        if (goat || sheep) {
            ctx.strokeStyle = "#6d5b45";
            ctx.lineWidth = 0.4 * size;
            ctx.beginPath();
            ctx.moveTo(3.2 * size, -4.2 * size + bob);
            ctx.lineTo(4.1 * size, -5.8 * size + bob);
            ctx.stroke();
        }
    }
    ctx.restore();
}

export function drawGrasslandTree(ctx, px, py, cellPx, tree, profile, tick) {
    if (!tree) return;
    const s = cellPx / 48;
    const scale = Number(tree.scale) || 1;
    const x = px + (Number(tree.offsetX) || 0) * cellPx;
    const baseY = py + (Number(tree.offsetY) || 0) * cellPx + 4 * s;
    const sway = Math.sin(tick * 0.0016 + profile.visual.phase + x * 0.01) * 1.2 * s * (0.4 + profile.visual.windSway);
    const kind = tree.kind || "old";
    const hedge = kind === "hedge";
    const trunkHeight = (hedge ? 5 : 12) * s * scale;
    const crownY = baseY - trunkHeight * (hedge ? 0.62 : 0.86);
    const crownWidth = (hedge ? 8.2 : 6.8) * s * scale * (tree.crown || 0.7);
    const crownHeight = (hedge ? 4.2 : 5.2) * s * scale * (tree.crown || 0.7);
    const colour = tree.colours?.[profile.season] || profile.leafColour;
    const light = profile.season === "winter" ? "#ddd9ca" : profile.season === "autumn" ? "#c6a05d" : "#8daa61";
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = "#5e4832";
    ctx.fillStyle = "#5e4832";
    ctx.lineWidth = Math.max(0.8, (hedge ? 0.9 : 1.5) * s * scale);
    if (!hedge) {
        ctx.beginPath();
        ctx.moveTo(x - 0.8 * s, baseY);
        ctx.quadraticCurveTo(x + sway * 0.4, baseY - trunkHeight * 0.55, x + sway, crownY + crownHeight * 0.25);
        ctx.stroke();
        ctx.fillRect(x - 1.2 * s, baseY - 1.2 * s, 2.4 * s, 1.1 * s);
    }
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(x + sway, crownY, crownWidth, crownHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.48;
    ctx.beginPath();
    ctx.ellipse(x + sway - crownWidth * 0.22, crownY - crownHeight * 0.28,
        crownWidth * 0.52, crownHeight * 0.46, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.92;
    if (kind === "fruit" && profile.season === "autumn") {
        ctx.fillStyle = "#b34f3d";
        for (let fruit = 0; fruit < 4; fruit++) {
            ctx.beginPath();
            ctx.arc(x + sway + (fruit - 1.5) * crownWidth * 0.26, crownY + (fruit % 2 ? 1 : -1) * crownHeight * 0.2,
                0.7 * s * scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (profile.visual.snowCover > 0.18) {
        ctx.globalAlpha = Math.min(0.8, profile.visual.snowCover * 0.9);
        ctx.fillStyle = "#eef5f4";
        ctx.beginPath();
        ctx.ellipse(x + sway, crownY - crownHeight * 0.44, crownWidth * 0.68, crownHeight * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

export function drawGrassland(ctx, px, py, cellPx, profile, s1, s2, s3, tick, zoom, sun, dayOfYear, climateKey) {
    if (!profile) return;
    const s = cellPx / 48;
    const snow = profile.visual.snowCover;
    if (snow > 0.86) return;
    const use = profile.use;
    const density = Math.max(0.2, profile.sward.density);
    const tall = profile.sward.tall;
    const medium = profile.sward.medium;
    const useScale = use.overgrazed ? 0.34 : use.grazed ? 0.48 : use.mowed ? 0.54 : use.trampled ? 0.28 : 1;
    const bladeCount = Math.max(2, Math.min(8, Math.round(3 + density * 5)));
    const phase = profile.visual.phase;
    const grassList = profile.grasses.length ? profile.grasses : [{ colours: [profile.grassHex, profile.grassHex] }];
    ctx.save();
    // The sward base supplies the hill colour gradient and the broad seasonal
    // tint; the individual blades then break it up at close range.
    ctx.globalAlpha = 0.13 + density * 0.08;
    ctx.fillStyle = profile.grassHex;
    ctx.beginPath();
    ctx.ellipse(px, py + 2.5 * s, (5 + density * 3.4) * s, (2.2 + density * 1.4) * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (use.bareSoil) {
        ctx.globalAlpha = use.overgrazed ? 0.48 : 0.32;
        ctx.fillStyle = use.overgrazed ? "#8b7854" : "#aa9871";
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * 4 * s, py + 2.4 * s, (3.4 + density * 1.8) * s, 1.8 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const seasonOffset = profile.seasonIndex;
    for (let index = 0; index < bladeCount; index++) {
        const grass = grassList[index % grassList.length];
        const colour = grass.colours?.[(seasonOffset + index) % 2] || profile.grassHex;
        const bladePhase = phase + index * 1.37 + py * 0.01;
        const wave = Math.sin(tick * 0.0024 + bladePhase + (px + py) * 0.006);
        const sway = wave * profile.visual.windSway * 2.7 * s;
        const heightScale = tall ? 1 : medium ? 0.78 : 0.56;
        const bladeHeight = (3.4 + (index % 4) * 1.25) * s * heightScale * useScale;
        const baseY = py + 2.8 * s + (index % 2) * 0.8 * s;
        const offset = (index - (bladeCount - 1) / 2) * 1.28 * s;
        ctx.globalAlpha = (use.overgrazed ? 0.34 : 0.62) * (1 - snow * 0.78);
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(0.65, (tall ? 1.08 : 0.88) * s);
        ctx.beginPath();
        ctx.moveTo(px + offset, baseY);
        ctx.quadraticCurveTo(px + offset + sway * 0.28, baseY - bladeHeight * 0.55,
            px + offset + sway, baseY - bladeHeight);
        ctx.stroke();
    }

    if (use.mowed) {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = "#c1a96b";
        ctx.lineWidth = Math.max(0.45, 0.5 * s);
        for (let row = 0; row < 3; row++) {
            ctx.beginPath();
            ctx.moveTo(px - 5 * s, py + (row - 1) * 1.7 * s);
            ctx.lineTo(px + 5 * s, py + (row - 1) * 1.7 * s);
            ctx.stroke();
        }
    }

    if (use.path) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = "#c9b68a";
        ctx.beginPath();
        ctx.ellipse(px, py + 2.8 * s, 7 * s, 1.5 * s, -0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#9e8a62";
        ctx.lineWidth = Math.max(0.45, 0.45 * s);
        for (let rut = -1; rut <= 1; rut += 2) {
            ctx.beginPath();
            ctx.moveTo(px - 6 * s, py + 2.4 * s + rut * 0.55 * s);
            ctx.quadraticCurveTo(px, py + 2.1 * s + rut * 0.4 * s, px + 6 * s, py + 2.5 * s + rut * 0.5 * s);
            ctx.stroke();
        }
    }

    if (profile.bloom > 0.1 && profile.flowers.length && !use.overgrazed) {
        // A rare plant is part of the promise of 1.2.6.15. It arrives at the
        // end of the flower list, so a plain slice(0, 3) could hide it forever.
        // Put the rare flower first while keeping the per-tile cap at three.
        const flowerList = profile.rarePlant
            ? [profile.rarePlant, ...profile.flowers.filter(flower => flower.id !== profile.rarePlant.id)]
            : profile.flowers;
        const flowerCount = Math.min(3, flowerList.length);
        for (let index = 0; index < flowerCount; index++) {
            const flower = flowerList[index];
            const fx = px + ((index - (flowerCount - 1) / 2) * 3.5 + (s1 - 0.5) * 2.2) * s;
            const fy = py - (1.4 + index * 1.1 + density * 1.2) * s;
            drawMeadowFlower(ctx, fx, fy, s * (tall ? 1.06 : 0.9), flower, 0.76 + profile.visual.flowerGlow * 0.18, profile.visual.flowerGlow);
        }
    }

    if (profile.herbs.length) {
        const herbCount = Math.min(2, profile.herbs.length);
        for (let index = 0; index < herbCount; index++) {
            drawMeadowHerb(ctx, px + (index ? 3.2 : -4.2) * s, py - 0.4 * s, s * 0.92, profile.herbs[index]);
        }
    }

    if (profile.pollinator > 0.54 && profile.bloom > 0.16 && s3 > 0.36) {
        const wing = Math.sin(tick * 0.09 + s1 * 12) * 0.2 + 0.8;
        ctx.globalAlpha = 0.56;
        ctx.fillStyle = profile.flowers[0]?.colours?.[0] || "#d8aa3c";
        ctx.beginPath();
        ctx.ellipse(px + (s2 - 0.5) * 7 * s, py - 5 * s, 1.15 * s * wing, 1.35 * s, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6b593b";
        ctx.fillRect(px + (s2 - 0.5) * 7 * s - 0.12 * s, py - 6 * s, 0.24 * s, 2.3 * s);
    }

    if ((profile.hedge || profile.shrubPatches > 0.56) && s1 > 0.44) {
        drawShrub(ctx, px + (s2 - 0.5) * 6 * s, py - 0.8 * s, cellPx * 0.86, s1, s2, dayOfYear, climateKey);
    }
    if (profile.use.encroachment && s1 > 0.62) {
        drawMeadowSapling(ctx, px + (s2 - 0.5) * 7 * s, py + 1.2 * s, s, profile);
        if (s3 > 0.55) drawMeadowSapling(ctx, px - 3.6 * s, py + 2.4 * s, s * 0.84, profile);
    }
    if (profile.use.reforestation && s1 > 0.5) {
        drawMeadowSapling(ctx, px - 4.6 * s, py + 1.8 * s, s * 1.08, profile);
        drawMeadowSapling(ctx, px + 2.8 * s, py - 0.4 * s, s * 0.9, profile);
    }

    if (profile.landform.rocky && s1 > 0.58) drawRock(ctx, px, py, cellPx, zoom, false);

    if (profile.visual.dew > 0.24 && zoom >= 0.75) {
        ctx.globalAlpha = Math.min(0.72, profile.visual.dew * 0.8);
        ctx.fillStyle = "#eef4e9";
        for (let drop = 0; drop < 3; drop++) {
            ctx.beginPath();
            ctx.arc(px + (drop - 1) * 3.2 * s + (s1 - 0.5) * 2 * s, py - (1.8 + drop * 0.7) * s,
                Math.max(0.42, 0.5 * s), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (profile.visual.mist > 0.2 && zoom >= 0.6) {
        ctx.globalAlpha = Math.min(0.22, profile.visual.mist * 0.19);
        ctx.fillStyle = "#dbe6df";
        ctx.beginPath();
        ctx.ellipse(px, py - 1.5 * s, 8 * s, 4.2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (profile.visual.sunlight > 0.3 && profile.bloom > 0.12) {
        ctx.globalAlpha = Math.min(0.46, profile.visual.sunlight * 0.35);
        ctx.strokeStyle = "#f3dd9b";
        ctx.lineWidth = Math.max(0.5, 0.48 * s);
        ctx.beginPath();
        ctx.moveTo(px - 3 * s, py - 1 * s);
        ctx.lineTo(px - 2 * s, py - 4 * s);
        ctx.moveTo(px + 3 * s, py - 0.8 * s);
        ctx.lineTo(px + 3.6 * s, py - 3.5 * s);
        ctx.stroke();
    }
    ctx.restore();

    if (zoom >= 0.95 && s3 > 0.92 && profile.fauna.length) {
        // A meadow is not a single animal. Drawing only fauna[0] made foxes,
        // birds and insects unreachable whenever a deer or hare came first in
        // the list. Pick at most three distinct groups per tile: livestock is
        // preferred on grazed ground, then the next groups in profile order.
        // The cap keeps a close-up cluster bounded while making every group
        // visible across a meadow.
        const maxVisible = zoom >= 1.15 ? 3 : 2;
        const ordered = profile.use.grazed
            ? [...profile.fauna].sort((a, b) => Number(b.group === "livestock") - Number(a.group === "livestock"))
            : profile.fauna;
        const visibleFauna = [];
        const groups = new Set();
        for (const animal of ordered) {
            if (visibleFauna.length >= maxVisible) break;
            if (groups.has(animal.group)) continue;
            visibleFauna.push(animal);
            groups.add(animal.group);
        }
        for (let index = 0; index < visibleFauna.length; index++) {
            const spread = index === 0 ? 0 : (index === 1 ? 0.26 : -0.24);
            drawGrasslandFauna(
                ctx,
                px + (s1 - 0.5) * cellPx * 0.3 + spread * cellPx,
                py + (s2 - 0.5) * cellPx * 0.18 + (index === 2 ? 0.15 : 0) * cellPx,
                s * (index === 0 ? 1 : 0.82),
                visibleFauna[index],
                tick,
                profile.season,
            );
        }
    }
}

// A bounded animated overlay on top of the cached detail layer. Only wind is
// redrawn per frame: a small, fixed number of tall-grass tufts near the camera
// gives the meadow its wave motion without re-rasterising every planted tile.
export const GRASSLAND_WIND_LIMITS = Object.freeze({ maxTufts: 44, maxExamined: 260 });

// `probe` is optional instrumentation for the headless renderer test. It is
// never allocated by the game loop; production calls pass no probe.
export function drawGrasslandWindOverlay(ctx, zoom, cam, canvas, probe = null) {
    const startedAt = performance.now();
    if (probe) { probe.examined = 0; probe.tufts = 0; probe.elapsedMs = 0; }
    if (!state.heightMap || zoom < 0.62) return;
    const cellPx = CELL * zoom;
    if (cellPx < 14) return;
    const sea = state.seaLevel ?? 0.33;
    const dayOfYear = Number.isFinite(Number(state.dayOfYear))
        ? Number(state.dayOfYear)
        : (Number(state.seasonIndex) || 0) * 100;
    const climateKey = state.worldOptions?.climate || "temperate";
    const hour = Number(state.timeOfDay);
    const tick = Number(state.tick) || 0;
    const wind = windMultiplier();
    const forests = state.worldOptions?.forests ?? 52;
    const bounds = visibleTileBounds({
        cellPx, cameraX: cam.x, cameraY: cam.y, width: canvas.width, height: canvas.height,
        worldWidth: worldW(), worldHeight: worldH(),
    });
    const step = zoom >= 1.1 ? 2 : 3;
    const startX = Math.max(0, Math.floor(bounds.startX / step) * step);
    const startY = Math.max(0, Math.floor(bounds.startY / step) * step);
    let drawn = 0;
    let examined = 0;
    const { maxTufts, maxExamined } = GRASSLAND_WIND_LIMITS;
    ctx.save();
    for (let x = startX; x < bounds.endX && drawn < maxTufts && examined < maxExamined; x += step) {
        for (let y = startY; y < bounds.endY && drawn < maxTufts && examined < maxExamined; y += step) {
            examined += 1;
            if (!state.explored?.[x]?.[y]) continue;
            const h = getHeightAt(x + 0.5, y + 0.5);
            if (h < sea + 0.03 || h > sea + 0.52) continue;
            const m = getMoistureAt(x + 0.5, y + 0.5);
            const temp = getTemperatureAt(x + 0.5, y + 0.5);
            if (forestPotentialAt({ moisture: m, height: h, forests, rockLine: 0.92 })
                && !forestClearingAt(x, y, {
                    seed: Number(state.worldSeed) || 1, moisture: m, height: h, forests, rockLine: 0.92,
                })) continue;
            const windContext = {
                seed: Number(state.worldSeed) || 1, moisture: m, temperature: temp, height: h,
                climate: climateKey, aridity: state.worldOptions?.aridity ?? 50, forests, seaLevel: sea,
                dayOfYear, year: Number(state.year) || 1,
                hour: Number.isFinite(hour) ? hour : 12, weather: state.weather || "clear", wind,
                use: grasslandUseAt(x, y),
            };
            const steppeWind = isSteppeSite(x + 0.5, y + 0.5, windContext)
                ? steppeProfileAt(x + 0.5, y + 0.5, windContext)
                : null;
            const profile = steppeWind || grasslandProfileAt(x + 0.5, y + 0.5, windContext);
            if (!profile.sward.tall || profile.visual.windSway < 0.14) continue;
            const s = cellPx / 48;
            const px = x * cellPx - cam.x + cellPx * (0.28 + ((x * 7 + y * 3) % 10) / 22);
            const py = y * cellPx - cam.y + cellPx * (0.35 + ((x * 3 + y * 7) % 10) / 28);
            if (px < -10 || py < -10 || px > canvas.width + 10 || py > canvas.height + 10) continue;
            const wave = Math.sin(tick * 0.0019 + x * 0.17 + y * 0.11);
            const sway = wave * (2.6 + profile.visual.windSway * 3.4) * s;
            ctx.globalAlpha = 0.2 + profile.visual.windSway * 0.16;
            ctx.strokeStyle = profile.grassHex;
            ctx.lineWidth = Math.max(0.7, 0.8 * s);
            ctx.beginPath();
            ctx.moveTo(px - 2.2 * s, py + 3 * s);
            ctx.quadraticCurveTo(px - 1.2 * s + sway * 0.4, py - 2 * s, px - 1.4 * s + sway, py - 6.2 * s);
            ctx.moveTo(px + 1.8 * s, py + 3 * s);
            ctx.quadraticCurveTo(px + 2.4 * s + sway * 0.35, py - 1.5 * s, px + 2.1 * s + sway * 0.82, py - 5.2 * s);
            ctx.stroke();
            drawn += 1;
        }
    }
    ctx.restore();
    if (probe) {
        probe.examined = examined;
        probe.tufts = drawn;
        probe.elapsedMs = performance.now() - startedAt;
    }
}

function drawSnowTuft(ctx, px, py, cellPx, s1) {
    const s = cellPx / 48;
    ctx.fillStyle = "rgba(236,242,246,0.5)";
    ctx.beginPath();
    ctx.ellipse(px, py + 2 * s, (4 + s1 * 5) * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
}
