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
const indexSource = await readFile(
    new URL("../../index.html", import.meta.url),
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

test("no user-reachable path creates a WebGL context", () => {
    assert.doesNotMatch(mainSource, /terrainRendererInfo\(/);
    assert.doesNotMatch(mainSource, /navigator\.gpu|requestAdapter/);
    assert.doesNotMatch(mainSource, /settings-terrain-renderer/);
    assert.match(mainSource, /state\.terrainRenderer="canvas";/);
    assert.doesNotMatch(indexSource, /settings-terrain-renderer/);
    assert.doesNotMatch(indexSource, /WebGL \(hardware\)/);
    assert.match(indexSource, /Measure the live Canvas 2D scene/);
    assert.doesNotMatch(source, /console\.warn\("Terrain WebGL2 unavailable/);
    assert.doesNotMatch(source, /\.readPixels\s*\(/, "the runtime must never read pixels back from WebGL");
});
