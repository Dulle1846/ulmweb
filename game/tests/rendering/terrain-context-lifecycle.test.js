import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
    new URL("../../js/presentation/rendering/terrain-webgl.js", import.meta.url),
    "utf8",
);
const mainSource = await readFile(
    new URL("../../js/app/main.js", import.meta.url),
    "utf8",
);
const auditSource = await readFile(
    new URL("../browser/renderer-recycle-audit.mjs", import.meta.url),
    "utf8",
);

test("the terrain renderer never forces a WebGL context loss", () => {
    assert.doesNotMatch(
        source,
        /\.loseContext\s*\(/,
        "loseContext() makes Chrome and some ANGLE drivers log a CONTEXT_LOST_WEBGL warning",
    );
    assert.doesNotMatch(
        source,
        /getExtension\(\s*["']WEBGL_lose_context["']\s*\)/,
        "the renderer must not request the context-loss extension",
    );
});

test("the renderer probe is cached instead of creating a context per settings change", () => {
    assert.match(source, /let rendererInfoCache = null;/);
    assert.match(source, /if \(rendererInfoCache\) return rendererInfoCache;/);
    assert.match(source, /export function terrainRendererInfo\(canvas = null\)/);
});

test("Auto never probes WebGL, so software GPUs cannot log a fallback warning", () => {
    assert.match(mainSource, /const nextMode=settings\.terrainRenderer==="webgl"\?"webgl":"canvas";/);
    assert.match(mainSource, /if\(nextMode==="webgl"\)info=terrainRendererInfo\(\);/);
    assert.doesNotMatch(mainSource, /navigator\.gpu|requestAdapter/);
    assert.doesNotMatch(source, /console\.warn\("Terrain WebGL2 unavailable/);
    assert.doesNotMatch(source, /\.readPixels\s*\(/, "the runtime must never read pixels back from WebGL");
});

test("renderer switches recycle one prepared surface per context type", () => {
    assert.match(mainSource, /let terrainCanvas2D=null;/);
    assert.match(mainSource, /let terrainCanvasWebGL=null;/);
    assert.match(mainSource, /function selectTerrainCanvas\(nextMode,previousMode\)/);
    assert.match(mainSource, /terrainCanvasWebGL=active/);
    assert.match(mainSource, /terrainCanvas2D=active/);
    assert.match(mainSource, /terrainRendererInfo\(\)/);
    assert.doesNotMatch(mainSource, /terrainRendererInfo\([^)]/);
    assert.doesNotMatch(mainSource, /resetTerrainWebGL/);
    assert.doesNotMatch(mainSource, /replaceTerrainCanvas/);
    // Resizing the cached surface on activation clears a Canvas2D backing
    // store without invalidating terrain.js's detail cache. The draw paths
    // resize and invalidate when they actually need to.
    assert.doesNotMatch(mainSource, /next\.width=Math\.max/);
    assert.doesNotMatch(mainSource, /next\.height=Math\.max/);
});

test("the browser audit uses the real settings controls instead of a renderer shortcut", () => {
    assert.match(auditSource, /data-kac-panel="settings"/);
    assert.match(auditSource, /#settings-terrain-renderer/);
    assert.match(auditSource, /\.selectOption\(mode\)/);
    assert.doesNotMatch(auditSource, /resetTerrainWebGL|replaceTerrainCanvas/);
    assert.doesNotMatch(auditSource, /dispatchEvent\(new Event\("change"/);
});
