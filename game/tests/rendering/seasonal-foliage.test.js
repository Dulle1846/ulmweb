import test from "node:test";
import assert from "node:assert/strict";
import { flowerBloom, foliageState, treeTiming } from "../../js/presentation/rendering/seasonal-foliage.js";

test("deciduous trees are leafy in summer and bare in midwinter", () => {
    const summer = foliageState(150, { seed: 0.5, species: "broadleaf" });
    const winter = foliageState(350, { seed: 0.5, species: "broadleaf" });
    assert.equal(summer.leaf, 1);
    assert.equal(summer.turn, 0);
    assert.ok(winter.leaf < 0.1);
    assert.equal(winter.bare, true);
});

test("spring leaf-out restores a full crown", () => {
    assert.ok(foliageState(0, { seed: 0.5 }).leaf < 0.3, "trees are still budding on the first spring day");
    assert.equal(foliageState(50, { seed: 0.5 }).leaf, 1);
    assert.ok(foliageState(30, { seed: 0.5 }).leaf > 0.4);
});

test("neighbouring trees turn and drop on their own schedule", () => {
    const early = foliageState(285, { seed: 0.05, species: "broadleaf" });
    const late = foliageState(285, { seed: 0.95, species: "broadleaf" });
    assert.ok(Math.abs(early.leaf - late.leaf) > 0.05, "per-tree timing must differ");

    const earlyTiming = treeTiming(0.05);
    const lateTiming = treeTiming(0.95);
    assert.ok(lateTiming.dropStart > earlyTiming.dropStart + 10);
});

test("oaks hold brown leaves into winter while plain broadleaf trees are bare", () => {
    const oak = foliageState(320, { seed: 0.4, species: "oak" });
    const broadleaf = foliageState(320, { seed: 0.4, species: "broadleaf" });
    assert.ok(oak.leaf > 0.4);
    assert.equal(oak.holding, true);
    assert.ok(broadleaf.leaf < 0.2);
    assert.equal(broadleaf.holding, false);
});

test("conifers keep their needles all year and only gain snow", () => {
    for (const day of [0, 50, 150, 250, 300, 350]) {
        const conifer = foliageState(day, { seed: 0.5, species: "conifer" });
        assert.equal(conifer.leaf, 1);
        assert.equal(conifer.evergreen, true);
    }
    assert.equal(foliageState(150, { species: "conifer" }).snow, 0);
    assert.ok(foliageState(350, { species: "conifer" }).snow > 0.5);
});

test("leaf loss is gradual instead of a one-day switch", () => {
    let previous = foliageState(240, { seed: 0.5 }).leaf;
    for (let day = 241; day <= 360; day++) {
        const current = foliageState(day, { seed: 0.5 }).leaf;
        assert.ok(Math.abs(current - previous) < 0.12, "leaf changed too fast on day " + day);
        previous = current;
    }
});

test("flowers fade with the leaves and disappear under snow", () => {
    assert.ok(flowerBloom(150) > 0.5);
    assert.equal(flowerBloom(350), 0);
    assert.ok(flowerBloom(250) < flowerBloom(150));
});
