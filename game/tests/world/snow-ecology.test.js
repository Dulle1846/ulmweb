import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateWorldData, CLIMATES, TERRAIN_PALETTES } from "../../js/world/terrain-model.js";
import {
    SNOW_REQUIREMENTS, SNOW_REQUIREMENT_IDS, SNOW_FORMATIONS, SNOW_GOODS, SNOW_LIMITS,
    isSnowSite, snowPotentialAt, snowProfileAt, snowProductsAt, snowRequirementAudit, snowSummary,
} from "../../js/world/snow-ecology.js";
import { drawSnowDetails, drawSnowGround, drawSnowTree, drawSnowWater } from "../../js/presentation/rendering/snow-render.js";

const SEED = 20261215;
const OPTIONS = {
    size: "small", shape: "continents", climate: "snow", landmass: 50,
    ruggedness: 58, forests: 52, water: 48, fertility: 50, resources: 60, coastline: 60,
};
const world = generateWorldData(SEED, OPTIONS);
const DAYS = [20, 120, 150, 220, 320];
const WEATHER = ["clear", "snow", "storm", "fog"];

function contextAt(x, y, overrides = {}) {
    const px = Math.min(world.pixW - 1, Math.floor(x * world.resolution));
    const py = Math.min(world.pixH - 1, Math.floor(y * world.resolution));
    const index = py * world.pixW + px;
    return {
        seed: SEED, climate: "snow", height: world.heights[index],
        moisture: world.moistures[index], temperature: world.temperatures[index],
        seaLevel: world.sea, dayOfYear: 150, year: 3, hour: 12,
        weather: "clear", wind: 1, use: {}, ...overrides,
    };
}

function survey() {
    const formations = new Set();
    const features = new Set();
    let land = null;
    for (const day of DAYS) {
        for (const weather of WEATHER) {
            for (let y = 0; y < world.dims.h; y += 2) {
                for (let x = 0; x < world.dims.w; x += 2) {
                    const profile = snowProfileAt(x + 0.5, y + 0.5, contextAt(x + 0.5, y + 0.5, {
                        dayOfYear: day, weather, wind: weather === "storm" ? 2 : 1,
                    }));
                    formations.add(profile.formation);
                    for (const id of profile.features) features.add(id);
                    if (!land && !profile.water.frozen && profile.formation === "snow-forest") land = { x, y, profile };
                }
            }
        }
    }
    return { formations, features, land };
}

const samples = survey();

test("Snowlands is selectable in the shipped world forge and climate palette", async () => {
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    assert.match(html, /<option value="snow">Snowlands<\/option>/);
    assert.ok(CLIMATES.some(entry => entry.id === "snow"));
    assert.ok(TERRAIN_PALETTES.snow);
    assert.equal(TERRAIN_PALETTES.snow.snow[0] >= 220, true);
});

test("snow requirements cover every id from 1.2.15.1 through 1.2.15.69", () => {
    assert.equal(SNOW_REQUIREMENTS.length, 69);
    assert.equal(SNOW_REQUIREMENT_IDS.length, 69);
    assert.equal(new Set(SNOW_REQUIREMENT_IDS).size, 69);
    assert.deepEqual(SNOW_REQUIREMENT_IDS, Array.from({ length: 69 }, (_, index) => "1.2.15." + (index + 1)));
    assert.equal(Object.keys(SNOW_FORMATIONS).length, 17);
    assert.equal(SNOW_LIMITS.formations, 17);
    assert.equal(SNOW_LIMITS.requirements, 69);
});

test("the snow climate produces all 17 formations and all 69 observable features", () => {
    assert.equal(samples.formations.size, 17);
    assert.equal(samples.features.size, 69);
    for (const id of SNOW_REQUIREMENT_IDS) assert.ok(samples.features.has(id), id);
    const audit = snowRequirementAudit({ features: [...samples.features] });
    assert.equal(audit.length, 69);
    assert.ok(audit.every(entry => entry.present));
});

test("the same snow context returns the same profile, including melt and fauna", () => {
    const site = samples.land;
    assert.ok(site, "a snow forest sample is required");
    const a = snowProfileAt(site.x + 0.5, site.y + 0.5, contextAt(site.x + 0.5, site.y + 0.5));
    const b = snowProfileAt(site.x + 0.5, site.y + 0.5, contextAt(site.x + 0.5, site.y + 0.5));
    assert.deepEqual(a, b);
    const winter = snowProfileAt(site.x + 0.5, site.y + 0.5, contextAt(site.x + 0.5, site.y + 0.5, {
        dayOfYear: 320, weather: "storm", wind: 2,
    }));
    const spring = snowProfileAt(site.x + 0.5, site.y + 0.5, contextAt(site.x + 0.5, site.y + 0.5, {
        dayOfYear: 20, weather: "clear",
    }));
    assert.equal(winter.season, "winter");
    assert.equal(spring.season, "spring");
    assert.ok(winter.surface.depth > 0);
    assert.ok(spring.thaw.springMelt >= 0);
    assert.ok(winter.weather.blizzard >= 0 && winter.weather.visibility <= 1);
    assert.ok(a.features.includes("1.2.15.17"));
});

test("snow products are climate-gated, finite and mapped to the shared goods catalog", () => {
    const site = samples.land;
    assert.ok(site);
    const products = snowProductsAt(site.x + 0.5, site.y + 0.5, contextAt(site.x + 0.5, site.y + 0.5));
    assert.ok(products, "snow land must yield products");
    assert.ok(products.goods.length <= 9);
    for (const product of products.goods) {
        assert.ok(SNOW_GOODS[product.id], product.id);
        assert.ok(product.abundance > 0 && product.abundance <= 1);
    }
    assert.ok(products.goods.some(product => ["game", "firewood", "lichen", "fur", "hides", "cloudberry"].includes(product.id)));
    assert.equal(snowProductsAt(10.5, 10.5, { ...contextAt(10.5, 10.5), climate: "temperate" }), null);
    assert.equal(snowPotentialAt(10.5, 10.5, { ...contextAt(10.5, 10.5), climate: "temperate" }), 0);
    assert.equal(isSnowSite(10.5, 10.5, { ...contextAt(10.5, 10.5), climate: "temperate" }), false);
    assert.match(snowSummary(products.profile), /snow/);
});

test("snow surface states and frozen water produce the detail renderer without errors", () => {
    const calls = [];
    const ctx = {
        save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
        moveTo() {}, lineTo() {}, quadraticCurveTo() {}, ellipse() {},
        set globalAlpha(value) { calls.push(value); }, set fillStyle(value) { calls.push(value); },
        set strokeStyle(value) { calls.push(value); }, set lineWidth(value) { calls.push(value); },
    };
    const site = samples.land;
    const profile = snowProfileAt(site.x + 0.5, site.y + 0.5, contextAt(site.x + 0.5, site.y + 0.5));
    drawSnowGround(ctx, 10, 10, 48, profile, 0.4, 0.6, 0.2);
    drawSnowDetails(ctx, 10, 10, 48, profile, 0.4, 0.6, 0.2, 1000, 1);
    for (const tree of profile.trees) drawSnowTree(ctx, 10, 10, 48, tree, profile, 0.5);
    const water = snowProfileAt(0.5, 0.5, contextAt(0.5, 0.5, { dayOfYear: 20 }));
    drawSnowWater(ctx, 10, 10, 48, water, 0.4, 0.6, 0.2);
    assert.ok(calls.length > 0);
});
