import test from "node:test";
import assert from "node:assert/strict";
import { generateWorldData } from "../../js/world/terrain-model.js";
import {
    COAST_REQUIREMENTS, COAST_REQUIREMENT_IDS, COAST_FORMATIONS, COAST_GOODS,
    coastProfileAt, coastProductsAt, coastRequirementAudit, coastPotentialAt,
} from "../../js/world/coast-ecology.js";

const SEED = 20261214;
const OPTIONS = {
    size: "standard", shape: "coast", climate: "coastal", landmass: 50,
    ruggedness: 55, forests: 52, water: 48, fertility: 55, resources: 50, coastline: 65,
};
const world = generateWorldData(SEED, OPTIONS);

function contextAt(x, y, overrides = {}) {
    const px = Math.min(world.pixW - 1, Math.floor(x * world.resolution));
    const py = Math.min(world.pixH - 1, Math.floor(y * world.resolution));
    const index = py * world.pixW + px;
    return {
        seed: SEED, climate: "coastal", height: world.heights[index],
        moisture: world.moistures[index], temperature: world.temperatures[index],
        seaLevel: world.sea, dayOfYear: 150, year: 3, hour: 12,
        weather: "clear", wind: 1.2, ...overrides,
    };
}

test("coastal requirements cover every id from 1.2.14.1 through 1.2.14.71", () => {
    assert.equal(COAST_REQUIREMENTS.length, 71);
    assert.equal(new Set(COAST_REQUIREMENT_IDS).size, 71);
    assert.deepEqual(COAST_REQUIREMENT_IDS, Array.from({ length: 71 }, (_, index) => "1.2.14." + (index + 1)));
    for (const requirement of COAST_REQUIREMENTS) {
        assert.ok(requirement.label.length >= 3, requirement.id);
        assert.ok(requirement.group.length > 2, requirement.id);
    }
    assert.equal(Object.keys(COAST_FORMATIONS).length, 17);
});

test("the coastal climate generates every shore formation deterministically", () => {
    const formations = new Set();
    const first = [];
    for (let y = 0; y < world.dims.h; y += 2) {
        for (let x = 0; x < world.dims.w; x += 2) {
            const context = contextAt(x + 0.5, y + 0.5);
            const profile = coastProfileAt(x + 0.5, y + 0.5, context);
            formations.add(profile.formation);
            if (first.length < 10) first.push([profile.label, profile.features.length]);
        }
    }
    assert.equal(formations.size, Object.keys(COAST_FORMATIONS).length);
    for (const [label] of first) assert.ok(label.length > 3);
    const a = coastProfileAt(31.5, 22.5, contextAt(31.5, 22.5));
    const b = coastProfileAt(31.5, 22.5, contextAt(31.5, 22.5));
    assert.deepEqual(a, b);
});

test("tide, season, weather and salinity change the same coastal profile", () => {
    let site = null;
    for (let y = 2; y < world.dims.h && !site; y++) {
        for (let x = 2; x < world.dims.w; x++) {
            const context = contextAt(x + 0.5, y + 0.5);
            const profile = coastProfileAt(x + 0.5, y + 0.5, context);
            if (!profile.water.sea && profile.formation.includes("beach")) { site = { x, y, context }; break; }
        }
    }
    assert.ok(site, "a beach sample is required");
    const summer = coastProfileAt(site.x + 0.5, site.y + 0.5, { ...site.context, dayOfYear: 160 });
    const winter = coastProfileAt(site.x + 0.5, site.y + 0.5, { ...site.context, dayOfYear: 350, weather: "storm" });
    assert.notEqual(summer.tide.level, winter.tide.level);
    assert.notEqual(summer.tide.rangeM, winter.tide.rangeM);
    assert.ok(summer.features.includes("1.2.14.49"));
    assert.ok(winter
        .features.includes("1.2.14.48"));
    assert.notEqual(summer.season, winter.season);
    assert.ok(summer.hazards.spray > 0 && winter.hazards.spray > 0);
});

test("coastal products are climate-gated, finite and mapped to the sea economy", () => {
    let productSite = null;
    for (let y = 2; y < world.dims.h && !productSite; y++) {
        for (let x = 2; x < world.dims.w; x++) {
            const context = contextAt(x + 0.5, y + 0.5);
            const products = coastProductsAt(x + 0.5, y + 0.5, context);
            if (products?.goods?.length) { productSite = { x, y, context, products }; break; }
        }
    }
    assert.ok(productSite, "coastal land must yield products");
    assert.ok(productSite.products.goods.length <= 9);
    for (const product of productSite.products.goods) {
        assert.ok(COAST_GOODS[product.id], product.id);
        assert.ok(product.abundance > 0 && product.abundance <= 1);
    }
    assert.ok(productSite.products.goods.some(product => ["fish", "shellfish", "salt", "seaweed"].includes(product.id)));
    const inland = coastProductsAt(10.5, 10.5, { ...productSite.context, climate: "temperate" });
    assert.equal(inland, null);
    assert.equal(coastPotentialAt(10.5, 10.5, { ...productSite.context, climate: "temperate" }), 0);
});

test("the requirement audit reports all 71 ids and marks the ecological evidence it finds", () => {
    let profile = null;
    for (let y = 0; y < world.dims.h; y++) {
        for (let x = 0; x < world.dims.w; x++) {
            const candidate = coastProfileAt(x + 0.5, y + 0.5, contextAt(x + 0.5, y + 0.5));
            if (candidate.coastal && !candidate.water.sea && (!profile || candidate.features.length > profile.features.length)) profile = candidate;
        }
    }
    profile = coastProfileAt(profile.x + 0.5, profile.y + 0.5, {
        ...contextAt(profile.x + 0.5, profile.y + 0.5),
        use: {
            fishingVillage: true, harbour: true, tradingPost: true, fortress: true, lighthouse: true,
            shipyard: true, saltworks: true, market: true, navalBase: true, settlement: true,
        },
    });
    const audit = coastRequirementAudit(profile);
    assert.equal(audit.length, 71);
    assert.equal(new Set(audit.map(entry => entry.id)).size, 71);
    assert.ok(audit.filter(entry => entry.present).length >= 55);
    for (const entry of audit) {
        assert.equal(typeof entry.present, "boolean");
        assert.ok(entry.label);
    }
});
