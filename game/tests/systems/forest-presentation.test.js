// 1.2.23.1.241–270 — the presentation, audio, UI and accessibility contract.
//
// The data is pure and the system reads only state.settings, so these tests run
// without a browser or a canvas. They assert the parts that a screenshot alone
// cannot prove: all thirty points are real rows, all sixty regional woods get a
// profile, the guide has a live reading for every point, and the accessibility
// switches change presentation without touching the simulation state.
import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/core/state.js";
import {
    FOREST_DANGER_ICONS, FOREST_FILTER_GROUPS, FOREST_FOG_TYPES,
    FOREST_PRESENTATION_LIST, FOREST_PRESENTATION_POINTS, FOREST_PRESENTATION_PROFILES,
    FOREST_USE_ICONS, forestPresentationProfile,
} from "../../js/world/forest-presentation.js";
import {
    FOREST_PRESENTATION_SETTINGS, forestCanopyContrast, forestDangerLegend,
    FOREST_CUE_KINDS, forestFilterOptions, forestLegendEntries, forestMapFilters,
    forestMapSymbol, forestMatchesFilters, forestMotionScale, forestParticleScale,
    forestPresentationGuide, forestPresentationProfileForStand as systemProfileForStand,
    forestPresentationSettings, forestPresentationSummary, forestRenderTuning,
    forestSoundCue, forestSoundPreview, forestSoundscape, forestSymbolicMap,
    forestTypeSoundPreview, forestUseLegend, normalizeForestPresentationSettings,
    resetForestMapFilters, setForestMapFilter,
} from "../../js/systems/forest-presentation.js";
import { normalizeSettings } from "../../js/core/persistence.js";

const settingsWas = state.settings;

function withSettings(overrides, run) {
    state.settings = { ...(settingsWas || {}), ...overrides };
    try {
        return run();
    } finally {
        state.settings = settingsWas;
    }
}

test("the catalogue covers all thirty requested presentation points", () => {
    assert.equal(FOREST_PRESENTATION_POINTS.length, 30);
    const ids = FOREST_PRESENTATION_POINTS.map(entry => entry.id);
    assert.equal(new Set(ids).size, 30);
    for (let offset = 0; offset < 30; offset++) {
        assert.equal(ids[offset], "1.2.23.1." + (241 + offset));
    }
    const groups = new Set(FOREST_PRESENTATION_POINTS.map(entry => entry.group));
    assert.deepEqual([...groups].sort(), ["accessibility", "audio", "performance", "render", "ui"]);
    for (const entry of FOREST_PRESENTATION_POINTS) {
        assert.ok(entry.title.length > 5, entry.id + " needs a title");
        assert.ok(entry.point.length > 20, entry.id + " needs a player-facing description");
        assert.ok(entry.detail.length > 40, entry.id + " needs an implementation note");
        assert.match(entry.consumer, /\.(js|css|html)/, entry.id + " must name a real consumer");
    }
});

test("every regional woodland has a complete presentation profile", () => {
    assert.equal(FOREST_PRESENTATION_LIST.length, 60);
    assert.equal(Object.keys(FOREST_PRESENTATION_PROFILES).length, 60);
    const ids = new Set();
    const parallax = new Set();
    for (const profile of FOREST_PRESENTATION_LIST) {
        assert.ok(profile.id && !ids.has(profile.id), "profile ids must be unique");
        ids.add(profile.id);
        assert.ok(profile.silhouette && profile.family, profile.id + " needs a family silhouette");
        assert.ok(profile.icon && profile.pattern, profile.id + " needs a map icon and pattern");
        assert.ok(FOREST_FOG_TYPES[profile.fog.id], profile.id + " needs a known fog type");
        assert.ok(profile.ground.label && profile.ground.litter, profile.id + " needs a ground weave");
        assert.ok(profile.crown.tiers >= 2 && profile.crown.aspect > 0.4, profile.id + " needs crown geometry");
        assert.ok(profile.leaves.summer.startsWith("#") && profile.leaves.autumn.startsWith("#"));
        assert.ok(profile.parallax >= 0.015 && profile.parallax <= 0.095);
        parallax.add(profile.parallax.toFixed(3));
        assert.equal(profile.instruments.length, 3, profile.id + " names three regional instruments");
        for (const instrument of profile.instruments) {
            assert.ok(instrument.label && instrument.timbre && instrument.wood, profile.id + " instrument is incomplete");
        }
        assert.ok(profile.goods.length > 0, profile.id + " needs at least one forest good");
        assert.ok(profile.resources.length > 0, profile.id + " needs a resource filter value");
        assert.ok(profile.understory.fern + profile.understory.grass + profile.understory.shrub > 0);
        assert.ok(profile.fauna.bird && profile.fauna.insect, profile.id + " needs regional fauna");
        assert.ok(profile.sound.bed && profile.sound.birds.length > 0, profile.id + " needs a sound bed");
        assert.ok(profile.danger in FOREST_DANGER_ICONS);
        assert.ok(profile.useIcon in FOREST_USE_ICONS);
        assert.ok(profile.snow.retention >= 0 && profile.snow.bareShare >= 0);
    }
    // 1.2.23.1.241: the profiles are not sixty copies of one depth.
    assert.ok(parallax.size >= 20, "canopy parallax must vary by regional type");
});

test("stand lookup falls back deterministically and keeps species sway distinct", () => {
    const conifer = FOREST_PRESENTATION_LIST.find(profile => profile.family === "conifer");
    const broadleaf = FOREST_PRESENTATION_LIST.find(profile => profile.family === "broadleaf");
    assert.ok(conifer && broadleaf);
    assert.equal(systemProfileForStand({ regionalTypeId: conifer.id }).id, conifer.id);
    assert.equal(systemProfileForStand({ coniferShare: 0.9 }).family, "conifer");
    assert.equal(systemProfileForStand({ tropical: true }).family, "mangrove");
    const fallback = systemProfileForStand({});
    assert.ok(fallback && fallback.id, "an unknown stand still gets a deterministic profile");
    assert.equal(forestPresentationProfile(conifer.id).id, conifer.id);
    assert.equal(forestPresentationProfile("not-a-type"), null);

    const amplitudes = withSettings({}, () => {
        const a = forestRenderTuning({ regionalTypeId: conifer.id, forest: true });
        const b = forestRenderTuning({ regionalTypeId: broadleaf.id, forest: true });
        return { conifer: a.windScale, broadleaf: b.windScale };
    });
    assert.ok(amplitudes.conifer > 0 && amplitudes.broadleaf > 0);
    assert.notEqual(amplitudes.conifer, amplitudes.broadleaf);
});

test("settings normalize safely and survive a reload-shaped raw object", () => {
    const defaults = normalizeForestPresentationSettings({});
    assert.deepEqual(defaults, { ...FOREST_PRESENTATION_SETTINGS });
    const normalized = normalizeForestPresentationSettings({
        forestAmbience: false,
        forestAmbienceVolume: 4.2,
        forestSubtitles: "yes",
        forestColorblind: true,
        forestCanopyContrast: true,
        forestFontScale: "huge",
        forestPerformance: true,
        forestReducedParticles: true,
        forestMapView: "parchment",
    });
    assert.equal(normalized.forestAmbience, false);
    assert.equal(normalized.forestAmbienceVolume, 1);
    assert.equal(normalized.forestSubtitles, false);
    assert.equal(normalized.forestColorblind, true);
    assert.equal(normalized.forestCanopyContrast, true);
    assert.equal(normalized.forestFontScale, "normal");
    assert.equal(normalized.forestPerformance, true);
    assert.equal(normalized.forestReducedParticles, true);
    assert.equal(normalized.forestMapView, "detailed");

    const saved = normalizeSettings({});
    for (const key of Object.keys(FOREST_PRESENTATION_SETTINGS)) {
        assert.ok(key in saved, "normalizeSettings must persist " + key);
    }
    assert.equal(saved.forestMapView, "detailed");
});

test("accessibility switches change presentation only", () => {
    const baseline = withSettings({}, () => ({
        motion: forestMotionScale(),
        particles: forestParticleScale(),
        symbolic: forestSymbolicMap(),
        contrast: forestCanopyContrast(),
        tuning: forestRenderTuning({ regionalTypeId: FOREST_PRESENTATION_LIST[0].id, forest: true }),
    }));
    assert.equal(baseline.motion, 1);
    assert.equal(baseline.particles, 1);
    assert.equal(baseline.symbolic, false);
    assert.equal(baseline.contrast, false);

    withSettings({ reduceMotion: true, forestReducedParticles: true, forestMapView: "symbolic", forestCanopyContrast: true }, () => {
        assert.equal(forestMotionScale(), 0.18);
        assert.equal(forestParticleScale(), 0.34);
        assert.equal(forestSymbolicMap(), true);
        assert.equal(forestCanopyContrast(), true);
        const tuning = forestRenderTuning({ regionalTypeId: FOREST_PRESENTATION_LIST[0].id, forest: true });
        assert.equal(tuning.contrast, true);
        assert.ok(tuning.shade < 1, "canopy contrast must lift the ambient shade");
        assert.ok(tuning.mist < 1, "canopy contrast must thin the fog");
    });
    withSettings({ forestPerformance: true }, () => {
        assert.equal(forestMotionScale(), 0.55);
        assert.equal(forestParticleScale(), 0.6);
    });
    const after = forestPresentationSettings();
    assert.equal(after.forestMapView, "detailed", "leaving the test must not keep symbolic mode");
});

test("the three filter groups combine, reject unknown values and reset", () => {
    resetForestMapFilters();
    assert.deepEqual(forestMapFilters(), { family: "all", resource: "all", protection: "all" });
    const conifer = FOREST_PRESENTATION_LIST.find(profile => profile.family === "conifer");
    assert.equal(setForestMapFilter("family", "conifer"), true);
    assert.equal(setForestMapFilter("resource", "timber"), true);
    assert.equal(setForestMapFilter("protection", "unmanaged"), true);
    assert.equal(setForestMapFilter("family", "not-a-family"), false);
    assert.equal(setForestMapFilter("not-a-group", "conifer"), false);
    assert.equal(forestMatchesFilters({
        family: "conifer", resources: ["timber", "forage"], protection: "unmanaged",
    }), true);
    assert.equal(forestMatchesFilters({
        family: "conifer", resources: ["timber"], protection: "managed",
    }), false);
    assert.equal(forestMatchesFilters({
        family: "broadleaf", resources: ["timber"], protection: "unmanaged",
    }), false);
    assert.equal(forestMatchesFilters({
        family: "conifer", resources: ["water"], protection: "unmanaged",
    }), false);
    assert.ok(conifer.resources.includes("timber"));
    resetForestMapFilters();
    assert.equal(forestMatchesFilters({ family: "broadleaf", resources: [], protection: "protected" }), true);
    assert.equal(forestFilterOptions().length, 3);
    assert.ok(FOREST_FILTER_GROUPS.every(group => group.options.some(option => option.id === "all")));
});

test("every one of the thirty points has a live reading in the reference wood", () => {
    const profile = FOREST_PRESENTATION_LIST.find(entry => entry.family === "broadleaf");
    const scene = {
        profile,
        stand: { species: { oak: 0.7, beech: 0.3 } },
        weather: "rain",
        hour: 22,
        seasonIndex: 2,
        season: "autumn",
    };
    const rows = forestPresentationGuide(scene);
    assert.equal(rows.length, 30);
    for (const row of rows) {
        assert.equal(typeof row.value, "string", row.id + " needs a string reading");
        assert.ok(row.value.trim().length > 0, row.id + " must never read empty");
    }
    assert.match(rows[0].value, /broadleaf/);
    assert.match(rows.find(row => row.id === "1.2.23.1.249").value, /Wet floor active/);
    assert.match(rows.find(row => row.id === "1.2.23.1.261").value, /2 species/);
    assert.match(rows.find(row => row.id === "1.2.23.1.266").value, /sway/);
});

test("legend and summary are generated from the same profile tables", () => {
    const summary = forestPresentationSummary();
    assert.equal(summary.profiles, 60);
    assert.ok(summary.families.length >= 10);
    assert.ok(summary.patterns.length >= 7);
    assert.ok(summary.fogs.length >= 8);
    assert.equal(summary.requirements, 30);
    assert.equal(summary.guide.length, 30);
    const legend = forestLegendEntries();
    assert.ok(legend.length >= summary.families.length);
    for (const entry of legend) {
        assert.ok(entry.icon && entry.pattern && entry.label && entry.detail);
        assert.ok(entry.light && entry.ground);
    }
    const uses = forestUseLegend();
    const dangers = forestDangerLegend();
    assert.equal(uses.length, 3);
    assert.ok(dangers.length >= 3);
    const symbol = forestMapSymbol(FOREST_PRESENTATION_LIST[0]);
    assert.ok(symbol.type && symbol.use && symbol.danger && symbol.pattern);
});

test("the seasonal calendar is complete, dated and regional", () => {
    const turns = new Set();
    const blossoms = new Set();
    const notes = new Set();
    const winterColours = new Set();
    for (const profile of FOREST_PRESENTATION_LIST) {
        assert.equal(profile.seasons.length, 4, profile.id + " needs four seasons");
        assert.deepEqual(profile.seasons.map(season => season.id), ["spring", "summer", "autumn", "winter"]);
        for (const season of profile.seasons) {
            assert.ok(season.label && season.note.length > 20, profile.id + " season needs a note");
            assert.ok(season.keyDay >= 0 && season.keyDay < 400, profile.id + " season day must be in the realm year");
            assert.match(season.leaf, /^#[0-9a-f]{6}$/i);
            assert.ok(season.ground, profile.id + " season needs its ground weave");
            assert.ok(season.startDay < season.endDay);
        }
        assert.equal(profile.phenology.turn, profile.seasons[2].keyDay);
        assert.equal(profile.phenology.leafOut, profile.seasons[0].keyDay);
        assert.ok(profile.phenology.leafOut >= 0 && profile.phenology.leafOut < 400);
        assert.ok(profile.phenology.fruit >= 0 && profile.phenology.fruit < 400);
        assert.equal(profile.canopyLayers.length, 3, profile.id + " needs three depth layers");
        assert.equal(profile.canopyLayers[2].id, "roof");
        assert.ok(Math.abs(profile.canopyLayers[2].parallax - profile.parallax) < 0.001);
        assert.ok(profile.canopyLayers[0].parallax < profile.canopyLayers[2].parallax);
        assert.equal(profile.fieldMarks.length, 3, profile.id + " needs three field marks");
        assert.ok(profile.sound.scale.degrees.length >= 5, profile.id + " needs a playable mode");
        assert.equal(profile.sound.motif.length, 3, profile.id + " needs a three-note motif");
        assert.ok(profile.sound.tempo >= 40 && profile.sound.tempo <= 90);
        assert.ok(profile.weatherReaction.drip >= 0 && profile.weatherReaction.hush >= 0);
        turns.add(profile.phenology.turn);
        blossoms.add(profile.phenology.blossom);
        notes.add(profile.seasons[0].note);
        winterColours.add(profile.seasons[3].leaf);
    }
    assert.ok(turns.size >= 20, "autumn must not start on one day for every wood");
    assert.ok(blossoms.size >= 20, "blossom must not start on one day for every wood");
    assert.ok(notes.size >= 10, "season notes must differ by family");
    assert.ok(winterColours.size >= 8, "winter crowns must not all share one colour");
});

test("every sound cue can be previewed and weather changes the cue", () => {
    const profile = FOREST_PRESENTATION_LIST.find(entry => entry.family === "broadleaf") || FOREST_PRESENTATION_LIST[0];
    const seen = new Set();
    for (const entry of FOREST_CUE_KINDS) {
        const cue = forestSoundPreview(profile, { weather: "clear", hour: 12, season: "summer" }, entry.id);
        assert.equal(cue.kind, entry.id, "preview must return the requested cue kind");
        if (entry.id !== "silence") assert.ok(cue.text.length > 5, entry.id + " needs a printable line");
        seen.add(cue.kind);
    }
    assert.equal(seen.size, FOREST_CUE_KINDS.length);
    assert.equal(forestSoundCue(profile, { weather: "rain" }, 0.5, 0.96).kind, "drip");
    assert.equal(forestSoundCue(profile, { weather: "snow" }, 0.5, 0.96).kind, "hush");
    const typePreview = forestTypeSoundPreview(profile.id, "instrument", { weather: "clear", hour: 12 });
    assert.equal(typePreview.profile.id, profile.id);
    assert.equal(typePreview.cue.kind, "instrument");
    assert.ok(typePreview.cue.instrument.label.length > 3);
    const summary = forestPresentationSummary();
    assert.equal(summary.cueKinds.length, FOREST_CUE_KINDS.length);
    assert.equal(summary.seasons.length, 4);
    assert.equal(summary.canopyLayers.length, 3);
    assert.ok(summary.fieldMarks.length >= 2);
});

test("the soundscape chooses deterministic cues and can hold its silence", () => {
    const profile = FOREST_PRESENTATION_LIST.find(entry => entry.family === "broadleaf" && entry.sound.silence < 0.4)
        || FOREST_PRESENTATION_LIST[0];
    const scene = { weather: "clear", hour: 13, season: "summer" };
    const first = forestSoundCue(profile, scene, 0.37, 0.22);
    const second = forestSoundCue(profile, scene, 0.37, 0.22);
    assert.deepEqual(first, second);
    assert.equal(first.kind, "bird");
    assert.ok(first.bird);
    assert.ok(first.text.length > 5);

    const instrument = forestSoundCue(profile, scene, 0.8, 0.85);
    assert.equal(instrument.kind, "instrument");
    assert.ok(instrument.instrument.label.length > 3);
    assert.ok(instrument.text.includes(instrument.instrument.label));

    const silentProfile = {
        ...profile,
        sound: { ...profile.sound, silence: 1 },
    };
    const silent = forestSoundCue(silentProfile, scene, 0.2, 0.1);
    assert.equal(silent.kind, "silence");
    assert.equal(silent.text, "");

    const soundscape = forestSoundscape(profile, { weather: "rain", hour: 23 });
    assert.equal(soundscape.night, true);
    assert.ok(soundscape.birds.includes("owl"));
    assert.match(soundscape.bedText, /Rain/);
});
