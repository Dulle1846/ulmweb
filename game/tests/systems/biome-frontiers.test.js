import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { initWorld } from "../../js/world/world.js";
import {
    BIOME_FRONTIER_FAMILIES, BIOME_FRONTIER_FAMILY_IDS, BIOME_FRONTIER_GROUPS,
    BIOME_FRONTIER_REQUIREMENTS, BIOME_FRONTIER_SITE_LIMIT,
} from "../../js/world/biome-frontiers.js";
import {
    applyBiomeFrontierCatastrophe, biomeFrontierActionAvailability, biomeFrontierGuardrails,
    biomeFrontierPhaseFor, biomeFrontierSite, biomeFrontierSummary, conserveBiomeFrontier,
    ensureBiomeFrontiers, harvestBiomeFrontier, resetBiomeFrontiers, restoreBiomeFrontier,
    restoreBiomeFrontierState, runBiomeFrontierAction, sellBiomeFrontierGood,
    serializeBiomeFrontierState, stabiliseBiomeFrontier, surveyBiomeFrontier,
    updateBiomeFrontiers, validateBiomeFrontierSnapshot, __internals,
} from "../../js/systems/biome-frontiers.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}
globalThis.document = { createElement: () => makeCanvas() };

const WORLD_OPTIONS = Object.freeze({
    size: "small", shape: "continent", water: 46, landmass: 58,
    fertility: 55, forests: 78, mountains: 55, ruggedness: 58, climate: "temperate",
});
const SEED = 20261228;

function setup(seed = SEED) {
    resetState();
    initWorld(seed, WORLD_OPTIONS);
    state.hasStarted = true;
    state.year = 1;
    state.dayOfYear = 0;
    state.seasonIndex = 0;
    state.resources = { wood: 1600, stone: 1600, gold: 1600, food: 500 };
    state.morale = 60;
    ensureBiomeFrontiers();
    return state.biomeFrontiers;
}

function fund() {
    Object.assign(state.resources, { gold: 1600, wood: 1600, stone: 1600 });
}

function siteByFamily(model, family) {
    return model.sites.find(site => site.family === family);
}

test("all fifteen frontier ecosystems and their 1.2.23.2–16 points are complete", () => {
    assert.equal(BIOME_FRONTIER_FAMILIES.length, 15);
    assert.equal(new Set(BIOME_FRONTIER_FAMILY_IDS).size, 15);
    assert.equal(BIOME_FRONTIER_SITE_LIMIT, 15);
    assert.deepEqual(
        BIOME_FRONTIER_REQUIREMENTS.map(entry => entry.id),
        Array.from({ length: 15 }, (_, index) => "1.2.23." + (index + 2)),
    );
    assert.equal(BIOME_FRONTIER_GROUPS.length, 3);
    assert.equal(new Set(BIOME_FRONTIER_GROUPS.flatMap(group => group.ids)).size, 15);
    for (const point of BIOME_FRONTIER_REQUIREMENTS) {
        assert.ok(point.title.length > 5, point.id + " needs a title");
        assert.ok(point.point.length > 5, point.id + " needs the roadmap wording");
        assert.ok(point.detail.length > 200, point.id + " needs a useful, detailed implementation note");
        assert.ok(point.consumer.includes("biomeFrontier") || point.consumer.includes("BIOME_FRONTIER"), point.id + " needs a live consumer");
    }
    for (const family of BIOME_FRONTIER_FAMILIES) {
        assert.ok(family.label && family.labelDe, family.id + " needs both names");
        assert.ok(family.profile.length > 120, family.id + " needs a player-facing profile");
        assert.ok(family.formation.length > 40, family.id + " needs a formation description");
        assert.equal(family.species.length, 24, family.id + " needs twenty-four species cohorts");
        assert.ok(family.species.some(row => row.kind === "tree" || row.kind === "plant"), family.id + " needs a plant layer");
        assert.ok(family.species.some(row => row.kind === "animal"), family.id + " needs an animal layer");
        assert.equal(family.specialists.length, 12, family.id + " needs twelve rare species");
        assert.equal(family.hazards.length, 12, family.id + " needs twelve disturbance regimes");
        assert.equal(family.goods.length, 8, family.id + " needs eight rare goods");
        assert.equal(family.journal.length, 12, family.id + " needs twelve field notes");
        assert.equal(new Set(family.journal.map(entry => entry.id)).size, 12, family.id + " field note ids must be unique");
        assert.deepEqual([1, 2, 3].map(tier => family.journal.filter(entry => entry.tier === tier).length), [4, 4, 4], family.id + " needs four notes per tier");
        for (const entry of family.journal) {
            assert.ok(entry.label.length > 3 && entry.detail.length > 40, family.id + " field notes need readable text");
            assert.ok(entry.goalLabel.length > 3, family.id + " field notes need a goal label");
            assert.ok(entry.reward.gold > 0, family.id + " field notes need a real reward");
            assert.ok(entry.tier >= 1 && entry.tier <= 3, family.id + " field notes need a tier");
        }
        const tierGold = [1, 2, 3].map(tier => family.journal.filter(entry => entry.tier === tier).reduce((sum, entry) => sum + entry.reward.gold, 0));
        assert.ok(tierGold[1] > tierGold[0] && tierGold[2] > tierGold[1], family.id + " tier rewards must rise");
        assert.ok(family.cycles.length === 2, family.id + " needs two recurring cycles");
        for (const cycle of family.cycles) {
            assert.equal(cycle.phaseLabels.length, 4, family.id + " cycles need four phases");
            assert.ok(cycle.period >= 4 && cycle.period <= 20, family.id + " cycles need a bounded period");
            assert.ok(cycle.reward.gold > 0, family.id + " cycles need a renewable reward");
        }
        assert.equal(family.palette.length, 3, family.id + " needs a palette");
        assert.ok(family.climateAnalog.length >= 3, family.id + " needs a climate sequence");
        assert.ok(family.referenceSeed > 0, family.id + " needs a reference seed");
        assert.equal(family.relics.length, 12, family.id + " needs twelve relict layers");
    }
    assert.equal(new Set(BIOME_FRONTIER_FAMILIES.map(row => row.referenceSeed)).size, 15);
    assert.ok(biomeFrontierGuardrails().length >= 5);
    assert.equal(biomeFrontierPhaseFor(0).id, "vanished");
    assert.equal(biomeFrontierPhaseFor(70).id, "resilient");
});

test("the ledger starts one linked site per family with species, hazards, goods and a rare community", () => {
    const model = setup();
    assert.equal(model.sites.length, 15);
    assert.equal(new Set(model.sites.map(site => site.family)).size, 15);
    assert.equal(new Set(model.sites.map(site => site.id)).size, 15);
    for (const site of model.sites) {
        assert.ok(site.atlasRegionId, site.family + " must bind to a province of the atlas");
        assert.ok(site.condition > 0 && site.condition <= 100);
        assert.ok(site.extent > 0 && site.extent <= 100);
        assert.equal(site.species.length, 24);
        assert.equal(site.specialists.length, 12);
        assert.equal(site.hazards.length, 12);
        assert.equal(site.goods.length, 8);
        assert.equal(site.journal.length, 0);
        assert.equal(biomeFrontierSite(site.id).journal.length, 12);
        assert.equal(site.cycles.seasonal !== undefined && site.cycles.long !== undefined, true);
        assert.equal(site.goods.every(good => good.stock === 0), true);
        assert.equal(site.phase, biomeFrontierPhaseFor(site.condition).id);
        assert.equal(site.layers.length >= 1, true);
    }
    const summary = biomeFrontierSummary();
    assert.equal(summary.sites.length, 15);
    assert.equal(summary.requirements.length, 15);
    assert.equal(summary.groups.length, 3);
    assert.equal(summary.stats.sites, 15);
    assert.equal(summary.stats.specialists, 180);
    assert.equal(summary.stats.journal, 180);
    assert.equal(summary.regions.length, 15);
    assert.equal(summary.referenceSeeds.length, 15);
    const first = biomeFrontierSite(model.sites[0].id);
    assert.equal(first.id, model.sites[0].id);
    assert.ok(first.actions.length >= 1);
    assert.equal(first.actedThisYear, false);
});

test("survey, deep survey, conservation, restoration, harvest and sale are real player actions", () => {
    const model = setup();
    const site = siteByFamily(model, "savanna-dry-woodland");
    const goldBefore = state.resources.gold;
    const surveyed = surveyBiomeFrontier(site.id);
    assert.equal(surveyed.ok, true);
    assert.equal(site.surveyed, true);
    // The survey fee is charged, then the first field note pays its fixed grant.
    assert.equal(state.resources.gold, goldBefore - 8 + 18, "survey fee and field-note grant must both settle");
    assert.equal(site.lastActionYear, 1);
    fund();
    assert.equal(conserveBiomeFrontier(site.id).reason, "one-frontier-action-per-year");
    assert.equal(runBiomeFrontierAction(site.id, "meteor").reason, "unknown-frontier-action");

    state.year = 2;
    const deep = surveyBiomeFrontier(site.id);
    assert.equal(deep.ok, true);
    assert.equal(site.deepSurveyed, true);
    assert.equal(site.history.some(row => row.kind === "survey"), true);
    assert.equal(site.specialists.every(row => row.status === "living"), true);
    assert.equal(site.layers.length >= 2, true);

    state.year = 3;
    const conserved = conserveBiomeFrontier(site.id);
    assert.equal(conserved.ok, true);
    assert.equal(site.protected, true);
    assert.equal(conserveBiomeFrontier(site.id).reason, "already-conserved");

    state.year = 4;
    site.condition = 50;
    const before = site.condition;
    const restored = restoreBiomeFrontier(site.id);
    assert.equal(restored.ok, true);
    assert.ok(site.condition > before);

    state.year = 5;
    const harvested = harvestBiomeFrontier(site.id);
    assert.equal(harvested.ok, true);
    assert.ok(harvested.amount >= 1);
    assert.ok(site.goods[0].stock > 0);
    assert.ok(site.condition < restored.condition + 9, "harvest must cost condition");

    const gold = state.resources.gold;
    const sold = sellBiomeFrontierGood(site.id, site.goods[0].id);
    assert.equal(sold.ok, true);
    assert.ok(state.resources.gold > gold);
    assert.equal(site.goods[0].stock, 0);
    assert.equal(sellBiomeFrontierGood(site.id, site.goods[0].id).reason, "no-good-stored");
});

test("stabilisation cuts wild magic and corruption, and transfigured sites begin shifted", () => {
    const model = setup();
    const magic = siteByFamily(model, "magic-primeval");
    magic.magic = 78;
    magic.corruption = 55;
    magic.aspect = "blighted";
    const result = stabiliseBiomeFrontier(magic.id);
    assert.equal(result.ok, true);
    assert.ok(magic.magic < 78);
    assert.ok(magic.corruption < 55);
    assert.equal(magic.aspect, "natural");
    const transfigured = siteByFamily(model, "magic-transfigured");
    assert.equal(transfigured.aspect, "transfigured");
    assert.ok(transfigured.transfiguredYear > 0);
    assert.equal(__internals.transfigureSite(model, magic, 2), true);
    assert.equal(magic.aspect, "transfigured");
    assert.equal(magic.transfiguredYear, 2);
});

test("a catastrophe damages a site, can erase it, and revival restores three founder cohorts", () => {
    const model = setup();
    const site = siteByFamily(model, "catastrophe-belt");
    const before = site.condition;
    const hit = applyBiomeFrontierCatastrophe(site.id, "coastal-collapse", { year: 8, severity: 0.8 });
    assert.equal(hit.ok, true);
    assert.ok(site.condition < before);
    assert.equal(site.hazards[0].memory, 1);
    assert.equal(site.hazards[0].year, 8);
    let guard = 0;
    while (site.phase !== "vanished" && guard++ < 30) {
        applyBiomeFrontierCatastrophe(site.id, "coastal-collapse", { year: 9 + guard, severity: 1 });
    }
    assert.equal(site.phase, "vanished");
    assert.equal(site.specialists.every(row => row.status === "vanished"), true);
    assert.equal(site.goods.every(good => good.stock === 0), true);
    assert.ok(site.vanishedYear > 0);
    fund();
    state.year = 40;
    const revived = restoreBiomeFrontier(site.id);
    assert.equal(revived.ok, true);
    assert.equal(site.condition, 16);
    assert.equal(site.species.filter(row => row.status === "living").length, 3);
    assert.equal(site.phase, "collapse");
    assert.equal(model.stats.revived, 1);
    assert.equal(site.history.some(row => row.kind === "revive"), true);
});

test("the annual pass shifts climate analogues, keeps sites bounded and is idempotent", () => {
    const model = setup();
    const climate = siteByFamily(model, "climate-shift");
    climate.climatePressure = 90;
    state.year = 2;
    const annual = updateBiomeFrontiers();
    assert.equal(annual.updated, true);
    assert.ok(climate.climateAnalogIndex >= 1);
    assert.ok(model.stats.climateShifts >= 1);
    assert.equal(updateBiomeFrontiers().updated, false);
    for (const site of model.sites) {
        assert.ok(site.condition >= 0 && site.condition <= 100);
        assert.ok(site.extent >= 0 && site.extent <= 100);
        assert.ok(site.magic >= 0 && site.magic <= 100);
        assert.ok(site.corruption >= 0 && site.corruption <= 100);
        assert.ok(site.history.length <= 12);
        assert.ok(site.goods.length <= 8);
        assert.ok(site.species.length <= 24);
        assert.ok(site.specialists.length <= 12);
        assert.ok(site.hazards.length <= 12);
    }
    assert.ok(model.history.length <= 48);
});

test("field notes unlock from real site work, pay once and stay in the save", () => {
    const model = setup();
    const site = siteByFamily(model, "savanna-dry-woodland");
    const beforeGold = state.resources.gold;
    assert.equal(site.journal.length, 0);
    assert.equal(biomeFrontierSite(site.id).journal.length, 12);
    assert.equal(biomeFrontierSite(site.id).journal.filter(entry => entry.unlocked).length, 0);

    const surveyed = surveyBiomeFrontier(site.id);
    assert.equal(surveyed.ok, true);
    assert.ok(site.journal.includes("fire-calendar"));
    assert.ok(state.resources.gold > beforeGold - 8, "the field note must pay its reward");
    const afterFirst = site.journal.length;
    state.year = 2;
    updateBiomeFrontiers();
    assert.equal(site.journal.length, afterFirst, "a field note must never unlock twice");
    assert.equal(biomeFrontierSummary().stats.discoveries >= 1, true);

    state.year = 3;
    assert.equal(surveyBiomeFrontier(site.id).ok, true);
    assert.ok(site.journal.includes("elephant-corridor"), "the deep survey must unlock its field note");
    const snapshot = serializeBiomeFrontierState();
    assert.equal(validateBiomeFrontierSnapshot(snapshot), true);
    resetState();
    restoreBiomeFrontierState(JSON.parse(JSON.stringify(snapshot)));
    const restored = siteByFamily(state.biomeFrontiers, "savanna-dry-woodland");
    assert.deepEqual(restored.journal, site.journal);
    const invalid = JSON.parse(JSON.stringify(snapshot));
    invalid.sites[0].journal = ["not-a-note"];
    assert.throws(() => validateBiomeFrontierSnapshot(invalid), /field journal/i);
});

test("the field-note ladder opens tier 2 only after tier 1, pays once and survives save/load", () => {
    const model = setup();
    const site = siteByFamily(model, "savanna-dry-woodland");
    assert.deepEqual(biomeFrontierSite(site.id).journalTiers.map(row => row.unlocked), [0, 0, 0]);

    state.year = 1;
    assert.equal(surveyBiomeFrontier(site.id).ok, true);
    state.year = 2;
    assert.equal(surveyBiomeFrontier(site.id).ok, true);
    state.year = 3;
    assert.equal(conserveBiomeFrontier(site.id).ok, true);
    state.year = 4;
    assert.equal(harvestBiomeFrontier(site.id).ok, true);
    let view = biomeFrontierSite(site.id);
    assert.deepEqual(view.journalTiers.map(row => row.unlocked), [4, 0, 0]);
    assert.equal(view.journalTier, 2, "four tier-1 notes open tier 2");
    assert.equal(view.journalTier, 2);
    assert.equal(view.journalTiers[2].unlocked, 0, "tier 3 stays closed while tier 2 is incomplete");

    state.year = 5;
    const goldBefore = state.resources.gold;
    assert.equal(restoreBiomeFrontier(site.id).ok, true);
    assert.equal(state.resources.gold, goldBefore - 12 + 46, "the first tier-2 note pays exactly once");
    view = biomeFrontierSite(site.id);
    assert.equal(view.journalTiers[1].unlocked, 1, "one tier-2 note opens, not a cascade");
    assert.equal(view.journalTiers[2].unlocked, 0);
    const saved = serializeBiomeFrontierState();
    assert.equal(validateBiomeFrontierSnapshot(saved), true);
    resetState();
    restoreBiomeFrontierState(JSON.parse(JSON.stringify(saved)));
    const restored = siteByFamily(state.biomeFrontiers, "savanna-dry-woodland");
    assert.ok(restored.journal.includes("restoration-line"));
    assert.equal(restored.journal.filter(id => id === "restoration-line").length, 1);
    assert.equal(biomeFrontierSite(restored.id).journalTier, 2);
    state.year = 6;
    updateBiomeFrontiers();
    assert.equal(restored.journal.filter(id => id === "restoration-line").length, 1, "save/load must not pay a field note twice");
});

test("recurring frontier cycles pay renewable harvests, regenerate the site and touch other systems", () => {
    const model = setup();
    state.morale = 55;
    state.entities.push({ id: "frontier-test-soldier", dead: false, military: { morale: 40 } });
    // A cycle is only legible to the crown after its first survey. Survey all
    // fifteen sites so the annual windows can actually pay and report.
    for (const site of model.sites) {
        state.year = 1;
        assert.equal(surveyBiomeFrontier(site.id).ok, true, site.family + " must be surveyable");
    }
    const beforeGold = state.resources.gold;
    for (let year = 2; year <= 25; year += 1) {
        state.year = year;
        updateBiomeFrontiers();
    }
    const summary = biomeFrontierSummary();
    assert.ok(summary.stats.cycleHarvests > 0, "short cycles must open real harvest windows");
    assert.ok(summary.stats.cycleRegenerations > 0, "cycles must have a regeneration window");
    assert.ok(summary.stats.cycleCompletions > 0, "a full rotation must complete");
    assert.ok(state.resources.gold > beforeGold || state.resources.food > 500, "cycle harvests must pay real resources");
    assert.ok(state.politics.settlements > 0, "long cycles must touch legitimacy and faction politics");
    assert.notEqual(state.morale, 55, "cycle harvests must affect morale");
    assert.ok(state.entities.find(entity => entity.id === "frontier-test-soldier").military.morale > 40, "a long cycle must reach the garrison");
    assert.ok(biomeFrontierSummary().sites.some(site => site.cycleHarvests > 0), "cycle counters must reach the site summary");
});

test("conservation feeds the linked atlas region instead of a parallel map", () => {
    const model = setup();
    const site = model.sites.find(entry => entry.atlasRegionId);
    assert.ok(site);
    const biome = state.biomeAtlas.regions.find(region => region.id === site.atlasRegionId);
    assert.ok(biome);
    const before = biome.vegetation;
    const result = conserveBiomeFrontier(site.id);
    assert.equal(result.ok, true);
    assert.ok(biome.vegetation > before, "a warden's agreement must raise linked vegetation");
});

test("the same seed and actions produce the same 25-year frontier ledger", () => {
    const run = () => {
        setup();
        for (let year = 2; year <= 25; year++) {
            state.year = year;
            updateBiomeFrontiers();
            updateBiomeFrontiers();
        }
        return JSON.stringify(serializeBiomeFrontierState());
    };
    const first = run();
    const second = run();
    assert.equal(first, second);
    assert.equal(state.biomeFrontiers.lastUpdateYear, 25);
});

test("a stored frontier ledger round-trips through JSON with the same sites and stats", () => {
    const model = setup();
    state.year = 2;
    updateBiomeFrontiers();
    const site = model.sites[0];
    fund();
    surveyBiomeFrontier(site.id);
    const snapshot = serializeBiomeFrontierState();
    assert.equal(validateBiomeFrontierSnapshot(snapshot), true);
    const before = JSON.stringify(biomeFrontierSummary().stats);
    resetState();
    restoreBiomeFrontierState(JSON.parse(JSON.stringify(snapshot)));
    const restored = state.biomeFrontiers;
    assert.equal(restored.sites.length, 15);
    assert.equal(JSON.stringify(biomeFrontierSummary().stats), before);
    assert.equal(Object.values(restored).some(value => typeof value === "function"), false);
    assert.throws(() => validateBiomeFrontierSnapshot({ version: 999, seed: 1, sites: [] }), /version/i);
    assert.throws(() => validateBiomeFrontierSnapshot({
        version: 1, seed: 1, sites: [{ family: "savanna-dry-woodland", condition: 101 }],
    }), /condition/i);
    const duplicate = JSON.parse(JSON.stringify(snapshot));
    duplicate.sites[1].family = duplicate.sites[0].family;
    assert.throws(() => validateBiomeFrontierSnapshot(duplicate), /duplicate/i);
});

test("a 300-year soak keeps every frontier archive bounded", { timeout: 120000 }, () => {
    const model = setup();
    for (let year = 2; year <= 300; year++) {
        state.year = year;
        const result = updateBiomeFrontiers();
        assert.equal(result.updated, true);
        assert.equal(model.sites.length, 15);
        for (const site of model.sites) {
            assert.ok(site.condition >= 0 && site.condition <= 100);
            assert.ok(site.extent >= 0 && site.extent <= 100);
            assert.ok(site.magic >= 0 && site.magic <= 100);
            assert.ok(site.corruption >= 0 && site.corruption <= 100);
            assert.ok(site.species.length <= 24);
            assert.ok(site.specialists.length <= 12);
            assert.ok(site.hazards.length <= 12);
            assert.ok(site.goods.length <= 8);
            assert.ok(site.goods.every(good => good.stock <= 999));
            assert.ok(site.history.length <= 12);
            assert.ok(site.journal.length <= 12);
            assert.ok(site.climateAnalogIndex >= 0);
            const family = BIOME_FRONTIER_FAMILIES.find(row => row.id === site.family);
            assert.ok(site.climateAnalogIndex < family.climateAnalog.length);
            assert.ok(site.layers.length <= family.relics.length);
        }
        assert.ok(model.history.length <= 48);
    }
    assert.ok(model.stats.catastrophes + model.stats.magicEvents > 0, "300 years must produce real events");
    assert.ok(model.sites.some(site => site.phase !== "vanished"), "the catalogue must not end wholly erased");
});

test("action availability explains every lock instead of hiding it", () => {
    const model = setup();
    const site = model.sites[0];
    const actions = biomeFrontierActionAvailability(site, model);
    assert.equal(actions.length >= 1, true);
    for (const action of actions) {
        assert.ok(action.label);
        assert.ok(action.cost);
        if (!action.enabled) assert.ok(action.reason.length > 8, action.id + " needs a reason");
    }
    state.resources.gold = 0;
    const poor = biomeFrontierActionAvailability(site, model);
    assert.equal(poor.find(action => action.id === "survey").enabled, false);
    assert.match(poor.find(action => action.id === "survey").reason, /gold/i);
});
