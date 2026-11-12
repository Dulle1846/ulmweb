import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    generateResourceGeography, getForestMovementFactorAt, getJungleTacticsAt, getResourceNodeAt,
} from "../../js/systems/resource-geography.js";
import { forestProductsAt } from "../../js/systems/forest-gathering.js";
import { drawJungleFloor, drawJungleUnderstory } from "../../js/presentation/rendering/jungle-render.js";

function setup(seed = 20261111) {
    resetState();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 78, water: 48, climate: "tropical" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.86);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.86);
    state.seasonIndex = 1;
    state.weather = "rain";
    generateResourceGeography(seed);
}

function jungleTile() {
    for (let y = 2; y < state.worldH - 2; y++) {
        for (let x = 2; x < state.worldW - 2; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestJungle && node.forestStock > 0) return { x, y, node };
        }
    }
    return null;
}

function drawContext() {
    const calls = { fill: 0, stroke: 0 };
    return {
        calls,
        save() {}, restore() {}, beginPath() {}, closePath() {},
        moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
        ellipse() {}, arc() {}, setLineDash() {},
        fill() { calls.fill++; }, stroke() { calls.stroke++; },
        fillRect() {}, fillText() {},
        set fillStyle(value) {}, get fillStyle() { return "#000"; },
        set strokeStyle(value) {}, get strokeStyle() { return "#000"; },
        set lineWidth(value) {}, get lineWidth() { return 1; },
        set globalAlpha(value) {}, get globalAlpha() { return 1; },
        set lineCap(value) {}, set font(value) {},
    };
}

test("jungle navigation, movement and survey are real on generated geography", () => {
    setup();
    const tile = jungleTile();
    assert.ok(tile, "the tropical test world needs a jungle tile");
    const node = tile.node;
    assert.equal(node.forestJungle.points.length, 55);
    assert.ok(node.forestJungleNavigation.movementFactor >= 1);
    assert.ok(node.forestJungleNavigation.sightRadiusTiles >= 2);
    assert.ok(node.forestJungleNavigation.ambushChance > 0);
    assert.ok(node.forestJungleNavigation.supplyFactor <= 1);
    assert.deepEqual(getJungleTacticsAt(tile.x, tile.y), node.forestJungleNavigation);
    const movement = getForestMovementFactorAt(tile.x + 0.5, tile.y + 0.5);
    assert.ok(movement >= 0.55 && movement <= 1, "movement must remain bounded");
    assert.ok(movement < 1, "jungle undergrowth must add movement cost");
});

test("open jungle paths keep movement bounded and hidden glades render", () => {
    setup();
    let openPath = null;
    for (let y = 2; y < state.worldH - 2 && !openPath; y++) {
        for (let x = 2; x < state.worldW - 2; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestJungle?.landscape?.openPath && node.forestStock > 0) {
                openPath = { x, y, node, factor: getForestMovementFactorAt(x + 0.5, y + 0.5) };
                break;
            }
        }
    }
    assert.ok(openPath, "the tropical test world needs at least one open jungle path");
    assert.ok(openPath.factor >= 0.55 && openPath.factor <= 1, "open paths must stay bounded");
    assert.ok(openPath.node.forestJungleNavigation.movementFactor >= 1);

    const ctx = drawContext();
    const hiddenStand = {
        jungle: {
            features: { "1.2.5.12": 0.92, "1.2.5.23": 0.5, "1.2.5.31": 0.1 },
            landscape: { hiddenGlade: true, openPath: true, clearing: false, viewpoint: true },
        },
    };
    assert.equal(drawJungleUnderstory(ctx, 20, 20, 48, hiddenStand, 0.1, 0.2, 0.3), true);
    assert.ok(ctx.calls.fill + ctx.calls.stroke > 0, "a hidden glade must draw its blooms");

    const fernCtx = drawContext();
    const fernStand = {
        jungle: {
            features: { "1.2.5.17": 0.8 },
            landscape: {},
        },
    };
    assert.equal(drawJungleUnderstory(fernCtx, 20, 20, 48, fernStand, 0.4, 0.3, 0.5), true);
    assert.ok(fernCtx.calls.stroke > 0, "giant ferns must issue canvas work");
});

test("jungle products expose the same profile to gathering and the renderer", () => {
    setup();
    const tile = jungleTile();
    assert.ok(tile);
    const products = forestProductsAt(tile.x, tile.y, 150);
    assert.ok(products, "jungle tile must still produce seasonal goods");
    assert.ok(products.jungle);
    assert.equal(products.jungle.points.length, 55);
    assert.ok(products.jungleNavigation.movementFactor >= 1);
    assert.ok(products.goods.length > 0);

    const ctx = drawContext();
    const stand = tile.node.forestStand;
    const understory = drawJungleUnderstory(ctx, 20, 20, 48, stand, 0.1, 0.2, 0.3);
    const floor = drawJungleFloor(ctx, 20, 20, 48, stand, 0.1, 0.2, 0.3);
    assert.equal(typeof understory, "boolean");
    assert.equal(typeof floor, "boolean");
    assert.ok(ctx.calls.fill + ctx.calls.stroke > 0 || (!understory && !floor),
        "a drawn jungle feature must issue canvas work");
});
