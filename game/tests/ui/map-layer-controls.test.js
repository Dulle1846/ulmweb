import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hud = readFileSync(new URL("../../css/hud-v3.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../../css/game.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("the stage topline stays inert for map drags", () => {
    const rule = game.match(/\.stage-topline\s*\{([^}]*)\}/);
    assert.ok(rule, "the base topline rule must exist");
    assert.ok(/pointer-events:\s*none/.test(rule[1]), "the topline must not swallow map drags");
});

test("the map layer picker opts back into pointer events", () => {
    const rule = hud.match(/\.map-layer-chip\s*\{([^}]*)\}/);
    assert.ok(rule, "the layer chip rule must exist");
    assert.ok(/pointer-events:\s*auto/.test(rule[1]), "the select inside an inert topline can never be clicked");
    assert.ok(html.includes('id="map-layer-select"'), "the layer picker must be in the page");
    assert.ok(html.includes('id="map-layer-legend"'), "the legend must be in the page");
});
