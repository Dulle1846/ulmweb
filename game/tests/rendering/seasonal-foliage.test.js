import test from "node:test";
import assert from "node:assert/strict";
import { flowerBloom, foliageState, treeTiming } from "../../js/presentation/rendering/seasonal-foliage.js";
import { seasonalState } from "../../js/world/season.js";

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

test("climate zones shift leaf fall, snow and spring green-up", () => {
    assert.ok(seasonalState(50, "northern").snowCover > seasonalState(50, "temperate").snowCover);
    assert.equal(seasonalState(150, "arid").snowCover, 0);
    assert.ok(seasonalState(350, "northern").snowCover >= seasonalState(350, "temperate").snowCover);
    assert.ok(seasonalState(350, "arid").snowCover < seasonalState(350, "temperate").snowCover);
    assert.ok(seasonalState(0, "northern").greenUp < seasonalState(0, "temperate").greenUp);

    const temperate = foliageState(300, { seed: 0.5, species: "broadleaf", climate: "temperate" });
    const northern = foliageState(300, { seed: 0.5, species: "broadleaf", climate: "northern" });
    const arid = foliageState(300, { seed: 0.5, species: "broadleaf", climate: "arid" });
    assert.ok(northern.leaf < temperate.leaf, "northern trees drop earlier");
    assert.ok(arid.turn < temperate.turn, "arid canopies turn less");

    const oakTemperate = foliageState(350, { seed: 0.5, species: "oak", climate: "temperate" });
    const oakArid = foliageState(350, { seed: 0.5, species: "oak", climate: "arid" });
    assert.ok(oakArid.leaf < oakTemperate.leaf, "arid oaks hold fewer leaves");
});

test("species and climates change how long leaf fall takes", () => {
    const broadleaf = treeTiming(0.5, "broadleaf", "temperate");
    const oak = treeTiming(0.5, "oak", "temperate");
    const birch = treeTiming(0.5, "birch", "temperate");
    assert.ok(oak.dropEnd - oak.dropStart > broadleaf.dropEnd - broadleaf.dropStart, "oaks drop slowly");
    assert.ok(birch.dropEnd - birch.dropStart < broadleaf.dropEnd - broadleaf.dropStart, "birches drop quickly");

    const northern = treeTiming(0.5, "broadleaf", "northern");
    const arid = treeTiming(0.5, "broadleaf", "arid");
    assert.ok(northern.dropEnd - northern.dropStart > arid.dropEnd - arid.dropStart, "northern leaf fall lasts longer");
});

test("conifers hold snow longer than birches during the melt", () => {
    const conifer = foliageState(30, { seed: 0.5, species: "conifer" });
    const birch = foliageState(30, { seed: 0.5, species: "birch" });
    const broadleaf = foliageState(30, { seed: 0.5, species: "broadleaf" });
    assert.ok(conifer.snow > broadleaf.snow, "conifers keep their snow");
    assert.ok(birch.snow < broadleaf.snow, "birches shed it early");
});

test("flowers fade with the leaves and disappear under snow", () => {
    assert.ok(flowerBloom(150) > 0.5);
    assert.equal(flowerBloom(350), 0);
    assert.ok(flowerBloom(250) < flowerBloom(150));
});
