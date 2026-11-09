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
    FOREST_SPECIES, forestFaunaFor, forestMicrofaunaAt, forestPotentialAt, forestStandAt, forestTreeCopies,
    pickAgeClass, pickSpecies,
} from '../../world/forest-ecology.js';
import {
    DETAIL_SETTLE_MS, alignToWorldGrid, detailLayerTransform, detailStepForZoom,
    transformedLayerRect, treeStepForZoom, visibleTileBounds,
} from './terrain-detail-grid.js';
import { getResourceNodeAt } from '../../systems/resource-geography.js';
import { forestFaunaAt, forestFaunaSignAt } from '../../systems/forest-fauna.js';
import { forestMistFactor, solarVector } from './daylight.js';

const worldW = () => Number(state.worldW) || WORLD_W;
const worldH = () => Number(state.worldH) || WORLD_H;

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
        return;
    }

    // The cached surface contains baked ground, fog and every decoration. It
    // stays on the compositor as its own layer, so panning only moves it; the
    // layer is rebuilt once after the view settles.
    if (drawCachedDecorations(ctx, zoom, cam, canvas)) return;
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
let observedView = "";
let lastViewChangeAt = 0;
let overlayCanvas = null;
let overlayCtx = null;
let overlayState = null;
let overlayView = "";
let overlayLastChangeAt = 0;

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
    return [
        detailWorldKey(),
        Math.floor(day / dayBucket),
        Number(state.exploredRevision) || 0,
        Number(state.terrainCacheRevision) || 0,
        Number(state.forestVisualRevision) || 0,
    ].join("|");
}

function rebuildDetailLayer(surfaceCtx, canvas, zoom, cam, key, worldKey) {
    const renderScale = Number(state.renderScale) || 1;
    surfaceCtx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
    drawBakedGround(surfaceCtx, zoom, cam, canvas);
    if (state.zoomLevel >= 3) drawGroundGrain(surfaceCtx, zoom, cam, canvas);
    state.terrainTreeDraws = 0;
    drawTerrainDecorations(surfaceCtx, zoom, cam, canvas);
    drawFogOfWar(surfaceCtx, zoom, cam, canvas);
    detailState = {
        key, worldKey, zoom, camX: cam.x, camY: cam.y, renderScale,
        width: canvas.width, height: canvas.height,
    };
    state.terrainCacheMisses = (Number(state.terrainCacheMisses) || 0) + 1;
    state.terrainCanvasEl.style.transformOrigin = "0 0";
    state.terrainCanvasEl.style.transform = "translate(0px, 0px) scale(1)";
    state.terrainCanvasEl.style.opacity = "1";
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
        drawTerrainDecorations(overlayCtx, zoom, cam, canvas);
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
        drawTerrainDecorations(overlayCtx, zoom, cam, canvas);
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
    const worldKey = detailWorldKey();
    const renderScale = Number(state.renderScale) || 1;

    // The first frame has no cached layer yet. Build it immediately; a resize
    // or renderer switch can wait for the short settle window instead.
    if (!detailState) {
        rebuildDetailLayer(surfaceCtx, canvas, zoom, cam, key, worldKey);
        return true;
    }

    const surfaceMatches = detailState.width === canvas.width
        && detailState.height === canvas.height
        && detailState.renderScale === renderScale;
    const worldMatches = detailState.worldKey === worldKey;
    if (!surfaceMatches || !worldMatches) {
        state.terrainCanvasEl.style.transformOrigin = "0 0";
        state.terrainCanvasEl.style.opacity = "0";
        if (!settled) return false;
        rebuildDetailLayer(surfaceCtx, canvas, zoom, cam, key, worldKey);
        return true;
    }

    const contentStale = detailState.key !== key;
    const viewMoved = Math.abs(detailState.zoom - zoom) > 0.00005
        || Math.abs(detailState.camX - cam.x) > 0.02
        || Math.abs(detailState.camY - cam.y) > 0.02;
    if (settled && (contentStale || viewMoved)) {
        rebuildDetailLayer(surfaceCtx, canvas, zoom, cam, key, worldKey);
        return true;
    }

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
    state.terrainCanvasEl.style.transformOrigin = "0 0";
    state.terrainCanvasEl.style.transform =
        `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    state.terrainCanvasEl.style.opacity = "1";
    drawDetailLayerGaps(ctx, zoom, cam, canvas, transform);
    state.terrainCacheHits = (Number(state.terrainCacheHits) || 0) + 1;
    return true;
}

function drawDetailLayerGaps(ctx, zoom, cam, canvas, transform) {
    const rect = transformedLayerRect(transform, canvas.width, canvas.height, Number(state.renderScale) || 1);
    if (rect.width <= 0 || rect.height <= 0) return;
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
    const ageScale = stand?.forest ? Math.max(0.55, Number(stand.ageScale) || 1) : 1;
    const sway = Math.sin(tick * 0.045 + s2 * 13) * Math.min(1.2, s * 0.9);
    const trunkH = (10 + definition.height * 3) * s * ageScale;
    const baseY = py + 5.5 * s;
    const crownY = baseY - trunkH * 0.78;
    const radius = Math.max(0.9, (8.4 + s2 * 2.5) * s * definition.crown * ageScale);
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
        const height = (11 + definition.height * 16) * s * ageScale;
        const trunkW = Math.max(0.65, definition.trunk * 1.7 * s);
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
                const width = (8.4 - tier * 1.18) * s * definition.crown * ageScale;
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

function drawTerrainDecorations(ctx, zoom, cam, canvas) {
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

    for (let x = bounds.startX; x < bounds.endX; x++) {
        const detailColumn = x >= gridX && (x - gridX) % step === 0;
        const treeColumn = x >= treeGridX && (x - treeGridX) % treeStep === 0;
        for (let y = bounds.startY; y < bounds.endY; y++) {
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
            const cluster = 0.5 + 0.5 * Math.sin(x * 0.19 + y * 0.13) * Math.sin(x * 0.06 - y * 0.11);
            const loneTree = treeSample && !potentialForest && cluster > 0.74 && m > 0.3 && temp > 0.28 && s1 > 0.925;
            if (!potentialForest && !loneTree && !detail) continue;

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

            // A forest is an ecosystem, not a tree sprinkle: floor, understorey,
            // gaps, deadwood and fauna are drawn from the same stand definition.
            if (stand?.forest) {
                const tree = treeSample && s1 < stand.treeChance;
                if (detail && zoom >= 0.55) {
                    drawForestGround(ctx, px, py, cellPx, stand, s1, s2, dayOfYear, climateKey);
                    drawForestFloor(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey, tick, zoom);
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
                    if (detail && zoom >= 0.9 && s3 > 0.7) drawForestFaunaScene(ctx, px, py, cellPx, stand, dayOfYear, climateKey, s2, zoom, x, y, tick);
                    continue;
                }
                if (!detail) continue;
                if (stand.clearing > 0.28) {
                    if (zoom >= 0.34) drawForestClearing(ctx, px, py, cellPx, stand, s1, s2, dayOfYear, climateKey);
                    if (zoom >= 0.8 && s2 > 0.55) drawCanopyLight(ctx, px, py, cellPx, stand, s1, tick, sun);
                } else if (zoom >= 0.5) {
                    drawUnderstory(ctx, px, py, cellPx, stand, s1, s2, s3, dayOfYear, climateKey);
                }
                if (zoom >= 0.75 && s1 > 0.95) drawForestFaunaScene(ctx, px, py, cellPx, stand, dayOfYear, climateKey, s3, zoom, x, y, tick);
                if (zoom >= 0.9 && s1 > 0.972) drawFallenLog(ctx, px, py, cellPx, stand, s2, s3, dayOfYear, climateKey);
                continue;
            }

            if (loneTree) {
                const loneStand = { forest: true, treeChance: 1, ageClass: 'mature', ageScale: 0.92, clearing: 0 };
                state.terrainTreeDraws = (Number(state.terrainTreeDraws) || 0) + 1;
                if (distant) drawDistantTree(ctx, px, py, cellPx, tick, s2, s3, loneStand, climate, dayOfYear, sun);
                else drawTree(ctx, px, py, cellPx, tick, s1, s2, s3, zoom, temp, m, dayOfYear, climateKey, shoreDir, loneStand, sun);
                continue;
            }
            if (!detail) continue;

            if (cluster > 0.6 && m > 0.34 && s1 > 0.8) {
                drawShrub(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey);
                continue;
            }

            // Desert and steppe flora.
            if (temp > 0.66 && m < 0.36) {
                if (s1 > 0.74) drawCactus(ctx, px, py, cellPx, s1);
                else if (s1 > 0.6) drawGrassTufts(ctx, px, py, cellPx, s1, s2, true, climate.foliageTurn, climate.snowCover);
                continue;
            }

            // Meadows: flower drifts, tufts and the occasional boulder.
            if (h >= sea && h < 0.62 && zoom >= 0.34) {
                if (s1 > 0.9) drawFlowerCluster(ctx, px, py, cellPx, s1, s2, dayOfYear, climateKey);
                else if (s1 > 0.76) drawFlower(ctx, px, py, cellPx, s1, dayOfYear, climateKey);
                else if (s1 > 0.64) drawGrassTufts(ctx, px, py, cellPx, s1, s2, false, climate.foliageTurn, climate.snowCover);
                else if (s1 > 0.625) drawRock(ctx, px, py, cellPx, zoom, false);
            }
        }
    }
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
    const sway = Math.sin(tick * 0.045 + s1 * 10 + s2 * 7) * 1.6 * s;
    const ageScale = stand?.forest ? Math.max(0.52, Number(stand.ageScale) || 1) : 1;
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

    // A conifer inside a defined conifer formation is the stand's real
    // dominant tree, not a decorative substitute. Its species controls the
    // silhouette, needle colour, autumn behaviour and timber identity.
    if (speciesDefinition.conifer) {
        drawConifer(ctx, px, py, s, sway, s2, dayOfYear, climateKey, ageScale, species, stand);
        return;
    }
    // Outside closed woodland, a cold or rocky edge may still carry a stray
    // spruce or pine. This remains a landscape accent, never an intrusion into
    // a mapped oakwood or beechwood.
    const coniferChance = stand?.forest ? 0 : (temp < 0.4 ? 0.85 : temp < 0.54 ? 0.24 : 0);
    if (s3 < coniferChance) { drawConifer(ctx, px, py, s, sway, s2, dayOfYear, climateKey, ageScale, "spruce", null); return; }
    if (!stand?.forest && temp > 0.68 && moisture < 0.45) { drawPalm(ctx, px, py, s, sway, s2); return; }
    if (stand?.disturbance === 'burned' && s3 < 0.3) { drawSnag(ctx, px, py, s, sway, s2, true); return; }
    if (!stand?.forest && moisture > 0.76 && temp > 0.5 && s1 > 0.9) { drawDeadTree(ctx, px, py, s, sway); return; }
    if (stand?.disturbance === 'diseased' && s3 > 0.78) { drawSnag(ctx, px, py, s, sway, s2, false); return; }

    if (species === 'birch') {
        drawBirch(ctx, px, py, s, sway, s2, dayOfYear, climateKey, ageScale);
        return;
    }
    drawBroadleaf(ctx, px, py, s, sway, tick, s2, dayOfYear, Math.floor(s3 * 4) % 4, species, climateKey, ageScale, stand);
}

function drawBroadleaf(ctx, px, py, s, sway, tick, seed, dayOfYear, variant = 0, species = "oak", climateKey = "temperate", ageScale = 1, stand = null) {
    const definition = FOREST_SPECIES[species] || FOREST_SPECIES.oak;
    const foliage = foliageState(dayOfYear, { seed, species, climate: climateKey });
    const seasonal = seasonalState(dayOfYear, climateKey);
    // Give the whole stand a gentle autumn pull even where an individual
    // marcescent tree is late. The per-tree timing still wins, but the canopy
    // no longer looks like isolated green trees floating in a brown wood.
    const turn = Math.min(1, foliage.turn + seasonal.foliageTurn * 0.12);
    const trunkH = (10 + definition.height * 3) * s * ageScale;
    const trunkW = Math.max(1.3, 4.2 * definition.trunk * s * (0.72 + ageScale * 0.28));
    const baseY = py + 8 * s;
    const crownY = py - (7 + definition.height * 4.6) * s * ageScale;
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
    const radius = (9 + seed * 4) * s * definition.crown * ageScale * (0.62 + 0.38 * cover);
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

function drawBirch(ctx, px, py, s, sway, seed, dayOfYear, climateKey = "temperate", ageScale = 1) {
    const foliage = foliageState(dayOfYear, { seed, species: "birch", climate: climateKey });
    const trunkW = Math.max(1.1, 3.6 * s * (0.72 + ageScale * 0.28));
    const trunkH = 13 * s * ageScale;
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
    const crownY = py - (5 + 2 * ageScale) * s;
    const radius = (8.5 + seed * 3) * s * (0.68 + 0.32 * foliage.leaf) * Math.max(0.7, ageScale);
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
    ctx.save();
    if (close) {
        // Three overlapping puffs form a soft bank below the canopy. A single
        // large pool either left a pale ring around the crown or, when
        // feathered with a transform, read as a rectangular wash. Small
        // overlapping radial puffs have no hard edge in either axis.
        const alpha = (0.05 + stand.canopy * 0.022) * strength;
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
        ctx.globalAlpha = (0.035 + stand.canopy * 0.025) * strength;
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

function drawForestGround(ctx, px, py, cellPx, stand, s1, s2, dayOfYear, climateKey) {
    const s = cellPx / 48;
    const season = seasonalState(dayOfYear, climateKey);
    const snow = season.snowCover;
    const turn = season.foliageTurn;
    ctx.save();
    // Ground is a soft soil/humus wash, never a hard dark disc. The old broad
    // circle read as a hole under every tree; a smaller, layered patch lets the
    // shader's litter texture and the scattered leaves do the work.
    if (snow >= 0.45) {
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
    const palette = coniferFloor
        ? (turn > 0.5 ? ["#59402a", "#75512f", "#8b6538", "#4d3826", "#6d5a3b"]
            : ["#4a3e2c", "#665033", "#7a5a37", "#3f4c35", "#8b7447"])
        : turn > 0.42 ? ["#704b2b", "#986130", "#8c7138", "#5d472b", "#a8793a"]
            : ["#4c6538", "#70733a", "#57462d", "#7a5b36", "#617b40"];
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
    const season = seasonalState(dayOfYear, climateKey);
    const roll = s1;
    if (stand.coniferShare > 0.45) {
        if (stand.ground.trail && s2 > 0.54) { drawDeerTrail(ctx, px, py, cellPx, stand, s2); return; }
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
    if (stand.coniferShare > 0.45) {
        const coniferOptions = [
            ['fern', stand.understory.fern], ['berry', stand.understory.berry],
            ['lichen', stand.understory.lichen], ['heather', stand.understory.heather],
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
        else drawConiferSapling(ctx, px, py, s, s2, season.snowCover);
        return;
    }
    const options = [
        ['fern', stand.understory.fern], ['bramble', stand.understory.bramble],
        ['shrub', stand.understory.shrub], ['heather', stand.understory.heather],
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
    ctx.globalAlpha = 0.05 + stand.light * 0.08;
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

function drawForestFauna(ctx, px, py, cellPx, stand, dayOfYear, climateKey, seed, zoom, tileX = null, tileY = null) {
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
        const pelt = animal.id === 'wolf' ? "#59605c" : animal.id === 'lynx' ? "#b68a5a" : "#a85b2f";
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
            ctx.fillStyle = animal.id === 'owl' ? "#8d7a5e" : animal.id === 'crossbill' ? "#a6533f" : animal.id === 'capercaillie' ? "#3f3a31" : "#655946";
            ctx.beginPath();
            ctx.ellipse(x, y - 4 * s, (animal.id === 'capercaillie' ? 2.2 : 1.5) * s, (animal.id === 'capercaillie' ? 2.8 : 2.1) * s, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + (animal.id === 'woodpecker' ? 1.4 : animal.id === 'crossbill' ? 1.6 : 0.8) * s, y - 5.6 * s, 0.9 * s, 0, Math.PI * 2);
            ctx.fill();
            if (animal.id === 'crossbill') {
                ctx.strokeStyle = "#d8c18a";
                ctx.lineWidth = 0.55 * s;
                ctx.beginPath();
                ctx.moveTo(x + 1.8 * s, y - 5.8 * s);
                ctx.lineTo(x + 3.2 * s, y - 5.2 * s);
                ctx.stroke();
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
    const season = seasonalState(dayOfYear, climateKey);
    const herds = tileX !== null && tileY !== null ? forestFaunaAt(tileX, tileY, stand, dayOfYear) : [];
    const signs = tileX !== null && tileY !== null ? forestFaunaSignAt(tileX, tileY, stand, dayOfYear, herds) : null;
    // Microfauna is only legible at close zoom and is capped at three groups
    // of at most three marks, so a dense wood cannot spend hundreds of path
    // operations per frame on insects the player cannot resolve.
    const micro = zoom >= 1.05 ? forestMicrofaunaAt(stand, dayOfYear, climateKey, seed).slice(0, 3) : [];
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
        ctx.fillStyle = "#a85b2f";
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
            ctx.fillStyle = animal.id === 'owl' ? "#8d7a5e" : "#655946";
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
function drawConifer(ctx, px, py, s, sway, seed, dayOfYear, climateKey = "temperate", ageScale = 1, species = "spruce", stand = null) {
    const definition = FOREST_SPECIES[species] || FOREST_SPECIES.spruce;
    const foliage = foliageState(dayOfYear, { seed, species, climate: climateKey });
    // Local snow depth is derived from elevation and exposure, so a high, open
    // ridge holds visibly more snow than a sheltered lowland stand on the same
    // winter day. The weather-driven cover remains the outer bound.
    const snowPotential = Number(stand?.snowPotential);
    if (Number.isFinite(snowPotential)) foliage.snow = Math.min(1, foliage.snow * (0.78 + snowPotential * 0.38));
    const shape = definition.crownShape || "spire";
    const height = (17 + definition.height * 13) * s * ageScale;
    const baseY = py + 8 * s;
    const lean = sway + (seed - 0.5) * 1.8 * s + (stand?.disturbance === 'windthrow' ? 3.8 * s : 0);
    const trunkW = Math.max(1.1, definition.trunk * 3.3 * s * (0.7 + ageScale * 0.3));
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
    const crownBase = shape === 'crown' ? 0.42 : shape === 'scrub' ? 0.08 : 0.17;
    const tierSpan = shape === 'crown' ? 0.42 : shape === 'scrub' ? 0.52 : 0.73;
    const widthScale = shape === 'scrub' ? 1.22 : shape === 'crown' ? 0.84 : 1;
    const tiers = shape === 'crown' ? 3 : shape === 'scrub' ? 3 : tierCount;
    for (let tier = 0; tier < tiers; tier++) {
        const t = tiers === 1 ? 0 : tier / (tiers - 1);
        const layerBase = py + 2 * s - height * (crownBase + t * tierSpan);
        const top = layerBase - height * (0.3 - t * 0.055);
        const width = (11.4 - t * (shape === 'crown' ? 4 : 7.2)) * s * widthScale * definition.crown * ageScale;
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

function drawSnowTuft(ctx, px, py, cellPx, s1) {
    const s = cellPx / 48;
    ctx.fillStyle = "rgba(236,242,246,0.5)";
    ctx.beginPath();
    ctx.ellipse(px, py + 2 * s, (4 + s1 * 5) * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
}
