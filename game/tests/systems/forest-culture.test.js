import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initWorld } from "../../js/world/world.js";
import { getForestHabitatAt, harvestForest } from "../../js/systems/resource-geography.js";
import {
    FOREST_CULTURE_BY_REGION, FOREST_CULTURE_LORE_LABELS, FOREST_CULTURE_REGIONS, FOREST_CULTURE_REQUIREMENTS,
    FOREST_GROVE_TRAITS, forestCultureCalendarFor, forestCultureLoreEntriesFor, forestCultureNameFor, forestCultureProfileFor,
} from "../../js/world/forest-culture.js";
import {
    FOREST_CULTURE_TECH_LIST, FOREST_CULTURE_TECHS, brewForestRemedies, collectForestLore,
    consultForestHermit, dedicateSacredGrove, ensureForestCulture, forestCultureChildName, forestCultureGroveLimit,
    forestCultureModifiers, forestCultureRoles, forestCultureSummary, holdForestFestival, holdForestSchool,
    isSacredGroveTile, makeForestOffering, mediateForestConflict, normalizeForestCulture,
    performHuntRite, performTreeWedding, setForestDoctrine, setForestRights, tendSacredGrove, updateForestCulture,
} from "../../js/systems/forest-culture.js";
import { TECHNOLOGIES, RESEARCH_BRANCHES, createResearchState } from "../../js/systems/research.js";
import { JOB_MAP } from "../../js/simulation/villagers.js";

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
const SEED = 20261123;

function plainBuilding(type, id, x, y, extra = {}) {
    return {
        id, type, x, y, dead: false,
        construction: { stage: 3, progress: 100 }, hp: 200, maxHp: 200,
        isBuilding() { return true; }, isEnemy() { return false; },
        ...extra,
    };
}

function setup() {
    resetState();
    initWorld(SEED, WORLD_OPTIONS);
    const index = state.resourceGeography.forestStock.findIndex(stock => stock > 4);
    assert.ok(index >= 0, "the seeded world needs a working forest");
    const x = index % state.worldW;
    const y = Math.floor(index / state.worldW);
    const stand = getForestHabitatAt(x, y)?.forestStand;
    assert.ok(stand?.forest, "the fixture tile needs a forest stand");
    state.hasStarted = true;
    state.year = 8;
    state.dayOfYear = 40;
    state.seasonIndex = 0;
    state.tick = 8 * 400 + 40;
    state.resources = { wood: 500, stone: 200, gold: 200, food: 200 };
    state.morale = 55;
    state.research = createResearchState({});
    state.entities = [];
    const shrine = plainBuilding(TYPE.SHRINE, "culture-shrine", x, y);
    const druid = {
        id: "culture-druid", type: TYPE.VILLAGER, x, y, dead: false,
        job: "druid", workplace: shrine,
    };
    const forester = {
        id: "culture-forester", type: TYPE.VILLAGER, x, y, dead: false,
        job: "forester", workplace: plainBuilding(TYPE.FORESTER, "culture-forest-office", x + 1, y),
    };
    state.entities.push(shrine, druid, forester);
    state.forestGathering = {
        version: 1, stock: { honey: 20, herbs: 20, mushrooms: 20 }, totalGathered: {},
        quality: {}, history: [], lastGather: {},
    };
    return { x, y, stand, shrine, druid, forester };
}

test("the thirty culture points are numbered 181–210 and each has a live consumer", () => {
    assert.equal(FOREST_CULTURE_REQUIREMENTS.length, 30);
    assert.deepEqual(
        FOREST_CULTURE_REQUIREMENTS.map(entry => Number(entry.id.split(".").pop())),
        Array.from({ length: 30 }, (_, index) => 181 + index),
    );
    for (const entry of FOREST_CULTURE_REQUIREMENTS) {
        assert.match(entry.id, /^1\.2\.23\.1\.(18[1-9]|19[0-9]|20[0-9]|210)$/);
        for (const key of ["title", "point", "consumer", "detail"]) {
            assert.ok(entry[key] && entry[key].length > 20, entry.id + " needs a meaningful " + key);
        }
    }
});

test("all sixty regional forests have a distinct, deterministic culture profile", () => {
    assert.equal(FOREST_CULTURE_REGIONS.length, 60);
    assert.equal(Object.keys(FOREST_CULTURE_BY_REGION).length, 60);
    assert.equal(new Set(FOREST_CULTURE_REGIONS.map(profile => profile.spirit)).size, 60);
    for (const profile of FOREST_CULTURE_REGIONS) {
        assert.ok(profile.spirit && profile.sacredTree && profile.taboo);
        assert.ok(profile.workTechnique && profile.huntRule && profile.philosophy);
        assert.ok(profile.tale.title && profile.legend.text && profile.song.verse);
        assert.ok(profile.omen.text && profile.custom.text && profile.herbLore.text);
        assert.deepEqual(profile.festivals.map(entry => entry.id), ["spring", "woodcut", "harvest"]);
        assert.deepEqual(profile.festivals.map(entry => entry.season), [0, 3, 2]);
        assert.equal(forestCultureLoreEntriesFor(profile).length, 6);
        assert.equal(FOREST_GROVE_TRAITS.length, 3);
        assert.ok(FOREST_CULTURE_LORE_LABELS.herbLore);
        assert.ok(profile.names.female.length >= 3 && profile.names.male.length >= 3);
        assert.equal(forestCultureProfileFor(profile.id), profile);
        const calendar = forestCultureCalendarFor(profile, 2);
        assert.equal(calendar.seasonLabel, "Autumn");
        assert.equal(calendar.huntSeason, profile.calendar.huntSeason);
        assert.ok(forestCultureNameFor(profile, "female", "seed-1"));
    }
});

test("a shrine employs a real druid and the culture census sees it", () => {
    setup();
    assert.ok(JOB_MAP.some(entry => entry.building === TYPE.SHRINE && entry.job === "druid"));
    const roles = forestCultureRoles();
    assert.equal(roles.druids, 1);
    assert.equal(roles.foresters, 1);
    assert.equal(roles.hunters, 0);
});

test("consecrating a grove protects its real forest tile and feeds favour", () => {
    const site = setup();
    const before = harvestForest(site.x, site.y, 4);
    assert.ok(before > 0, "the unprotected control tile must still yield timber");
    const result = dedicateSacredGrove();
    assert.ok(result.ok, result.reason);
    const grove = result.grove;
    assert.equal(isSacredGroveTile(grove.x, grove.y), true);
    assert.equal(harvestForest(grove.x, grove.y, 6), 0, "the grove guard must refuse every axe");
    const summary = forestCultureSummary();
    assert.equal(summary.groves.length, 1);
    assert.equal(summary.groves[0].protected, true);
    assert.equal(summary.requirements.length, 30);
    assert.equal(summary.regions, 60);
    assert.ok(summary.favor > 50);
    assert.ok(forestCultureGroveLimit() >= 4);
});

test("offerings, festival, hunt rite and tree wedding are bounded and real", () => {
    const site = setup();
    assert.ok(dedicateSacredGrove().ok);
    const offering = makeForestOffering();
    assert.ok(offering.ok, offering.reason);
    const offeringGood = forestCultureSummary().profile.offeringGood;
    assert.equal(offering.good, offeringGood);
    assert.equal(state.forestGathering.stock[offeringGood], 18);
    const favor = offering.favor;
    const repeat = makeForestOffering();
    assert.equal(repeat.ok, false, "one offering per season");
    state.seasonIndex = 1;
    assert.ok(makeForestOffering().ok, "a new season allows a new offering");
    assert.ok(forestCultureSummary().favor > favor);

    state.seasonIndex = 0;
    const food = state.resources.food;
    const festival = holdForestFestival();
    assert.ok(festival.ok, festival.reason);
    assert.equal(state.resources.food, food - 8);
    assert.equal(holdForestFestival().ok, false, "one spring festival per year");
    assert.ok(state.morale > 55);
    const hunt = performHuntRite();
    assert.ok(hunt.ok);
    assert.equal(hunt.initiates.length, 2);
    assert.equal(forestCultureSummary().initiates, 2);
    assert.equal(performHuntRite().ok, false, "one hunt rite per year");
    assert.ok(performTreeWedding().ok);
    assert.equal(performTreeWedding().ok, false, "one tree wedding per year");
    assert.ok(forestCultureModifiers().hunt > 1);
});

test("forest rights need a forester, change once a year and create conflicts", () => {
    setup();
    assert.ok(dedicateSacredGrove().ok);
    const initial = setForestRights("commons");
    assert.equal(initial.ok, true, "the appointed forester can change the law");
    assert.equal(forestCultureSummary().rights.priority, "commons");
    assert.equal(setForestRights("hunt").ok, false, "the law changes once a year");
    state.year++;
    assert.equal(setForestRights("timber").ok, true, "a new year allows a new right");
    updateForestCulture();
    const summary = forestCultureSummary();
    assert.ok(summary.conflicts.some(conflict => !conflict.resolved && conflict.kind === "grove"), "timber priority beside a grove must create a named conflict");
    const gold = state.resources.gold;
    const mediated = mediateForestConflict();
    assert.ok(mediated.ok, mediated.reason);
    assert.equal(state.resources.gold, gold - 6);
    assert.equal(forestCultureSummary().counts.openConflicts, 0);
});

test("woodlore is bounded, deterministic and gives children regional names", () => {
    setup();
    assert.ok(dedicateSacredGrove().ok);
    const result = collectForestLore();
    assert.ok(result.ok, result.reason);
    assert.equal(result.added, 6);
    assert.equal(collectForestLore().ok, false, "the home region is collected once");
    assert.equal(forestCultureSummary().lore.length, 6);
    const name = forestCultureChildName("female", "child-42");
    assert.ok(name);
    assert.equal(name, forestCultureChildName("female", "child-42"));
    const ledger = state.economy.productionChains.forestCulture;
    ledger.lore = ledger.lore.filter(entry => !["omen", "custom", "herbLore"].includes(entry.kind));
    const rest = collectForestLore();
    assert.ok(rest.ok, "a v1 archive with three entries can collect the three new kinds");
    assert.equal(rest.added, 3);
    assert.equal(forestCultureSummary().lore.length, 6);
});

test("the woodland branch adds five real technologies and its modifiers are bounded", () => {
    setup();
    assert.equal(FOREST_CULTURE_TECH_LIST.length, 5);
    for (const id of FOREST_CULTURE_TECH_LIST) {
        const tech = TECHNOLOGIES.find(entry => entry.id === id);
        assert.ok(tech, id + " must be a real technology");
        assert.equal(tech.branch, "woodland");
    }
    assert.ok(RESEARCH_BRANCHES.some(branch => branch.id === "woodland"));
    const mods = forestCultureModifiers();
    for (const key of ["forage", "hunt", "farm", "herd", "medicine", "charcoal", "timber", "knowledge", "morale"]) {
        assert.ok(mods[key] >= 0.8 && mods[key] <= 1.35, key + " must stay bounded");
    }
    assert.equal(mods.forage, 1, "an untouched realm keeps its historical forage");
    state.research.completed[FOREST_CULTURE_TECHS.herbalism] = true;
    assert.ok(forestCultureModifiers().forage > mods.forage);
});

test("groves live, age and respond to a yearly tending crew", () => {
    setup();
    assert.ok(dedicateSacredGrove().ok);
    let grove = forestCultureSummary().groves[0];
    assert.equal(grove.vitality, 62);
    assert.equal(grove.ageYears, 1);
    assert.ok(["refuge", "mast", "spring"].includes(grove.trait));
    assert.ok(grove.traitLabel && grove.traitDetail);
    const food = state.resources.food;
    const tended = tendSacredGrove(grove.id);
    assert.ok(tended.ok, tended.reason);
    assert.equal(state.resources.food, food - 2);
    grove = forestCultureSummary().groves[0];
    assert.equal(grove.vitality, 70);
    assert.equal(tendSacredGrove(grove.id).ok, false, "one tending per grove per year");
    state.year = 9;
    updateForestCulture();
    grove = forestCultureSummary().groves[0];
    assert.equal(grove.ageYears, 2, "the grove ages once per year");
    assert.equal(grove.vitality, 69, "an untended year costs one vitality");
});

test("the three seasonal festivals are separate yearly decisions", () => {
    setup();
    assert.ok(dedicateSacredGrove().ok);
    assert.equal(holdForestFestival("woodcut").ok, false, "the woodcut feast belongs to winter");
    state.seasonIndex = 3;
    let food = state.resources.food;
    let gold = state.resources.gold;
    const woodcut = holdForestFestival("woodcut");
    assert.ok(woodcut.ok, woodcut.reason);
    assert.equal(state.resources.food, food - 5);
    assert.equal(state.resources.gold, gold - 6);
    assert.equal(holdForestFestival("woodcut").ok, false, "one woodcut feast per year");
    assert.equal(forestCultureSummary().festivalYears.woodcut, 8);
    state.seasonIndex = 2;
    food = state.resources.food;
    gold = state.resources.gold;
    const harvest = holdForestFestival("harvest");
    assert.ok(harvest.ok, harvest.reason);
    assert.equal(state.resources.food, food - 9);
    assert.equal(state.resources.gold, gold - 6);
    assert.equal(holdForestFestival("harvest").ok, false, "one harvest feast per year");
    assert.equal(forestCultureSummary().festivals.length, 3);
    assert.equal(forestCultureSummary().festivals.filter(entry => entry.season === 2).length, 1);
});

test("each forest gift has a different ritual effect", () => {
    setup();
    assert.ok(dedicateSacredGrove().ok);
    const herbs = makeForestOffering("herbs");
    assert.ok(herbs.ok, herbs.reason);
    assert.equal(herbs.good, "herbs");
    assert.equal(state.forestGathering.stock.herbs, 18);
    assert.ok(state.health.medicineStock >= 3, "herb offerings feed the clinic store");
    assert.equal(makeForestOffering("honey").ok, false, "one offering per season");
    state.seasonIndex = 1;
    const honey = makeForestOffering("honey");
    assert.ok(honey.ok, honey.reason);
    assert.equal(honey.good, "honey");
    assert.equal(state.forestGathering.stock.honey, 18);
});

test("hermit omens, forest school, remedies and doctrine are real bounded actions", () => {
    const site = setup();
    assert.ok(dedicateSacredGrove().ok);
    const dense = (() => {
        const geo = state.resourceGeography;
        for (let index = 0; index < geo.forestStock.length; index++) {
            if (geo.forestStock[index] <= 4) continue;
            const x = index % state.worldW;
            const y = Math.floor(index / state.worldW);
            let count = 0;
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
                if (geo.forestStock[(y + dy) * state.worldW + (x + dx)] > 0) count++;
            }
            if (count >= 20) return { x, y };
        }
        return null;
    })();
    assert.ok(dense, "the test world needs a deep-forest shrine site");
    site.shrine.x = dense.x;
    site.shrine.y = dense.y;
    assert.ok(forestCultureRoles().hermits >= 1);
    const omen = consultForestHermit();
    assert.ok(omen.ok, omen.reason);
    assert.ok(forestCultureSummary().lore.some(entry => entry.kind === "omen"));
    assert.equal(consultForestHermit().ok, false, "one hermit visit per year");

    const school = holdForestSchool();
    assert.ok(school.ok, school.reason);
    assert.equal(school.apprentices, 2);
    assert.equal(holdForestSchool().ok, false, "one forest school per year");

    state.entities.push({
        id: "culture-healer", type: TYPE.VILLAGER, x: site.x, y: site.y, dead: false,
        job: "healer", workplace: plainBuilding(TYPE.CLINIC, "culture-clinic", site.x + 2, site.y),
    });
    state.research.completed[FOREST_CULTURE_TECHS.herbalism] = true;
    const remedy = brewForestRemedies();
    assert.ok(remedy.ok, remedy.reason);
    assert.ok(remedy.medicine >= 3);
    assert.equal(brewForestRemedies().ok, false, "one remedy batch per season");

    state.research.completed[FOREST_CULTURE_TECHS.philosophy] = true;
    const before = forestCultureModifiers();
    const doctrine = setForestDoctrine("refuge");
    assert.ok(doctrine.ok, doctrine.reason);
    const after = forestCultureModifiers();
    assert.equal(after.doctrine, "refuge");
    assert.ok(after.timber < before.timber, "refuge doctrine trades timber for protection");
    assert.ok(after.forage >= before.forage, "refuge doctrine supports forage");
    assert.equal(setForestDoctrine("balance").ok, false, "doctrine changes once a year");
});

test("old saves normalize to safe empty culture state and all counters stay bounded", () => {
    resetState();
    const normalized = normalizeForestCulture(null);
    assert.equal(normalized.version, 2);
    assert.equal(normalized.groves.length, 0);
    assert.equal(normalized.lore.length, 0);
    assert.equal(normalized.rights.priority, "balance");
    assert.equal(normalized.favor, 50);
    assert.deepEqual(normalized.festivalYears, { spring: 0, woodcut: 0, harvest: 0 });
    assert.equal(normalized.doctrine, "balance");
    assert.equal(normalized.initiates, 0);
    state.economy = {};
    const ensured = ensureForestCulture();
    assert.equal(ensured.version, 2);
    state.economy.productionChains.forestCulture.groves = Array.from({ length: 100 }, (_, index) => ({ x: index, y: 0, label: "g" + index }));
    state.economy.productionChains.forestCulture.lore = Array.from({ length: 100 }, (_, index) => ({ kind: "tale", title: "t" + index, text: "x" }));
    state.economy.productionChains.forestCulture.conflicts = Array.from({ length: 100 }, (_, index) => ({ kind: "hunt", label: "c" + index, sinceYear: 1 }));
    const capped = normalizeForestCulture(state.economy.productionChains.forestCulture);
    assert.equal(capped.groves.length, 8);
    assert.equal(capped.lore.length, 60);
    assert.equal(capped.conflicts.length, 8);
});
