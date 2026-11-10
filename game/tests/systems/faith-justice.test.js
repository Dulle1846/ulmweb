// Focused tests for the two annual systems added in schema 6: faith & culture
// and law & justice. Every assertion reads real state produced by the systems,
// not a label rendered by the UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { getPoliticalSnapshot } from "../../js/systems/politics.js";
import {
    createFaithState, normalizeFaithState, validateFaithState,
    getFaithSnapshot, getFaithModifiers, appointClergy, dismissClergy,
    holdFestival, fundPilgrimage, setCultureBudget, addressHeresy, updateFaith,
    FESTIVALS, CLERGY_APPOINTMENT_COST
} from "../../js/systems/faith.js";
import {
    createJusticeState, normalizeJusticeState, validateJusticeState,
    getJusticeSnapshot, getJusticeModifiers, appointJudge, dismissJudge,
    setLawCode, grantCharter, tryCase, investigateCorruption, updateJustice,
    LAW_CODES, JUDGE_SALARY, JUDGE_APPOINTMENT_COST, LAW_CHANGE_COST
} from "../../js/systems/justice.js";
import { SAVE_SCHEMA_VERSION, normalizeSaveSnapshot, validateSaveSnapshot } from "../../js/core/save-validation.js";

function setupRealm({ tick = 20, year = 1, gold = 600, food = 600 } = {}) {
    resetState();
    state.worldSeed = 9917;
    state.tick = tick;
    state.year = year;
    state.dayOfYear = tick % 400;
    state.resources = { wood: 500, stone: 500, gold, food };
    state.morale = 60;
    initStartingKingdom();
    state.economy = state.economy || {};
    state.economy.unemployed = 0;
    state.economy.lastLedger = { foodDemand: 20, foodShortage: 0, foodConsumed: 20 };
    return state;
}

function firstCandidate(snapshot, field = "personId") {
    return snapshot.candidates[0]?.[field];
}

function villagerWithoutOffice() {
    const clergy = new Set((state.faith?.clergy || []).map(entry => String(entry.personId)));
    const judges = new Set((state.justice?.judges || []).map(entry => String(entry.personId)));
    return state.entities.find(entity => {
        if (entity.dead || entity.type !== TYPE.VILLAGER || entity.isKing) return false;
        const id = String(entity.personId || entity.id);
        return !clergy.has(id) && !judges.has(id);
    });
}

function insertCase(overrides = {}) {
    const defendant = villagerWithoutOffice();
    const entry = {
        id: "case:test:" + (overrides.id || "1"),
        defendantId: String(defendant.personId || defendant.id),
        defendantName: defendant.person.name,
        crime: "theft",
        crimeLabel: "Theft",
        cause: "inequality",
        severity: 2,
        createdYear: state.year,
        victim: "the crown",
        status: "pending",
        ...overrides
    };
    state.justice.cases.push(entry);
    return { entry, defendant };
}

// ── Faith & culture ─────────────────────────────────────────────

test("the opening realm owns a shrine and a court, and both open real appointment capacity", () => {
    setupRealm();
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.SHRINE), "opening realm must own a shrine");
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.COURT), "opening realm must own a court");
    const faith = getFaithSnapshot();
    assert.equal(faith.capacity, 3, "one temple and one shrine must open three clergy posts");
    assert.equal(faith.candidates.length > 0, true, "the realm must expose named adult residents as candidates");
    const justice = getJusticeSnapshot();
    assert.equal(justice.capacity, 2, "one court must open two judicial seats");
});

test("faith appoints a named cleric with a real conviction and removes every effect when the person dies", () => {
    setupRealm();
    const faith = getFaithSnapshot();
    const candidate = faith.candidates[0];
    const goldBefore = state.resources.gold;
    const appointment = appointClergy(candidate.personId);
    assert.equal(appointment.ok, true, appointment.reason);
    assert.equal(appointment.entry.name, candidate.name);
    assert.ok(appointment.entry.competence > 0 && appointment.entry.competence <= 100);
    assert.ok(["orthodox", "reformist", "mystic", "ascetic"].includes(appointment.entry.conviction));
    assert.equal(state.resources.gold, goldBefore - CLERGY_APPOINTMENT_COST, "appointment must cost gold");
    const withClergy = getFaithModifiers();
    assert.equal(withClergy.clergyCount, 1);
    assert.ok(withClergy.coverage > 0, "a serving cleric must produce measurable coverage");
    assert.ok(withClergy.militaryMorale >= 0);
    const entity = state.entities.find(item => String(item.personId || item.id) === String(candidate.personId));
    entity.dead = true;
    const afterDeath = getFaithModifiers();
    assert.equal(afterDeath.clergyCount, 0, "a dead cleric must lose every effect immediately");
    assert.equal(getFaithSnapshot().clergy.length, 0, "the vacancy must be visible in the snapshot");
    const replacement = getFaithSnapshot().candidates[0];
    if (replacement) {
        assert.equal(appointClergy(replacement.personId).ok, true, "the vacant post must be refillable");
    }
});

test("a funded festival consumes real goods and raises morale, legitimacy and market demand", () => {
    setupRealm();
    const candidate = getFaithSnapshot().candidates[0];
    appointClergy(candidate.personId);
    state.morale = 50;
    const cost = FESTIVALS.harvest.cost;
    const before = { food: state.resources.food, gold: state.resources.gold, legitimacy: getPoliticalSnapshot().legitimacy };
    const result = holdFestival("harvest");
    assert.equal(result.ok, true, result.reason);
    assert.equal(state.resources.food, before.food - cost.food);
    assert.equal(state.resources.gold, before.gold - cost.gold);
    assert.ok(state.morale > 50, "a festival must raise morale");
    assert.ok(getPoliticalSnapshot().legitimacy > before.legitimacy, "a festival must raise legitimacy");
    assert.equal(state.faith.festival.lastKind, "harvest");
    assert.ok(getFaithModifiers().festivalDemand > 0, "the market must see real festival demand");
    assert.equal(holdFestival("harvest").ok, false, "a second festival in the same year must be refused");
});

test("a pilgrimage returns gold, trade access and settles a resident when housing allows", () => {
    setupRealm();
    appointClergy(getFaithSnapshot().candidates[0].personId);
    const funded = fundPilgrimage();
    assert.equal(funded.ok, true, funded.reason);
    assert.equal(state.faith.pilgrimage.pendingYear, 2);
    state.year = 2;
    state.tick = 420;
    // Free one bed so the returning pilgrim can actually settle.
    const house = state.entities.find(entity => !entity.dead && entity.type === TYPE.STONE_HOUSE);
    if (house) {
        for (const villager of state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)) {
            if (villager.home?.x === house.x && villager.home?.y === house.y) villager.dead = true;
        }
    }
    const populationBefore = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const snapshot = updateFaith();
    assert.ok(snapshot.lastAudit.pilgrims > 0, "pilgrims must return in the annual audit");
    assert.ok(snapshot.lastAudit.pilgrimageGold > 0, "pilgrims must spend gold in the realm");
    assert.ok(getFaithModifiers().tradeFactor > 0.95, "a returning pilgrimage must improve trade terms");
    assert.ok(state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length >= populationBefore,
        "a returning pilgrimage must not reduce the population");
});

test("the culture budget is paid yearly and an unpaid budget raises tension", () => {
    setupRealm();
    setCultureBudget(3);
    const yearGold = state.resources.gold;
    state.year = 2;
    state.tick = 420;
    updateFaith();
    assert.equal(state.faith.lastAudit.budgetDue, 24);
    assert.equal(state.faith.lastAudit.budgetPaid, 24);
    assert.equal(state.resources.gold, yearGold - 24, "a splendid budget must leave the treasury");
    const tension = state.faith.heresy.tension;
    setupRealm({ gold: 5 });
    setCultureBudget(3);
    state.year = 2;
    state.tick = 420;
    updateFaith();
    assert.equal(state.faith.lastAudit.budgetPaid, 5);
    assert.ok(state.faith.heresy.tension > tension, "an unpaid budget must increase religious tension");
});

test("hunger, low legitimacy and war raise heresy, which then reduces tax and migration", () => {
    setupRealm();
    const baseline = getFaithModifiers();
    state.politics.legitimacy = 5;
    state.economy.lastLedger = { foodDemand: 20, foodShortage: 15, foodConsumed: 5 };
    state.raidActive = true;
    state.faith.heresy.tension = 55;
    state.year = 2;
    state.tick = 420;
    updateFaith();
    assert.ok(state.faith.heresy.tension > 55, "real hardship must increase heresy pressure");
    const strained = getFaithModifiers();
    assert.ok(strained.taxEfficiency < baseline.taxEfficiency, "heresy must reduce the tax yield");
    assert.ok(strained.migrationFactor < baseline.migrationFactor, "heresy must discourage migration");
    const beforeReconcile = state.faith.heresy.tension;
    const result = addressHeresy("reconcile");
    assert.equal(result.ok, true, result.reason);
    assert.ok(state.faith.heresy.tension < beforeReconcile, "reconciliation must lower tension");
});

// ── Law & justice ──────────────────────────────────────────────

test("justice appoints a named judge, pays a yearly salary and clears the bench on death", () => {
    setupRealm();
    const candidate = getJusticeSnapshot().candidates[0];
    const goldBefore = state.resources.gold;
    const appointment = appointJudge(candidate.personId);
    assert.equal(appointment.ok, true, appointment.reason);
    assert.equal(appointment.judge.name, candidate.name);
    assert.equal(state.resources.gold, goldBefore - JUDGE_APPOINTMENT_COST);
    state.year = 2;
    state.tick = 420;
    updateJustice();
    assert.equal(state.justice.lastAudit.salaries, JUDGE_SALARY);
    assert.equal(state.justice.lastAudit.paid, JUDGE_SALARY);
    const entity = state.entities.find(item => String(item.personId || item.id) === String(candidate.personId));
    entity.dead = true;
    assert.equal(getJusticeSnapshot().judges.length, 0, "a dead judge must leave the bench at once");
    assert.equal(getJusticeModifiers().judges, 0, "a dead judge must lose every modifier at once");
    const replacement = getJusticeSnapshot().candidates[0];
    if (replacement) assert.equal(appointJudge(replacement.personId).ok, true, "the vacant seat must be refillable");
});

test("crime emerges from real hunger, unemployment, war and quarantine and names living defendants", () => {
    setupRealm();
    appointJudge(getJusticeSnapshot().candidates[0].personId);
    state.economy.unemployed = 12;
    state.economy.lastLedger = { foodDemand: 30, foodShortage: 21, foodConsumed: 9 };
    state.raidActive = true;
    state.health.quarantine = { level: 3, untilTick: state.tick + 300, startedYear: 1, orders: 1 };
    state.tick++;
    const context = getJusticeModifiers();
    assert.ok(context.crimeRate > 0.25, "stacked hardship must produce a high crime rate");
    assert.equal(context.crimeLevel, "lawless");
    state.year = 2;
    updateJustice();
    const snapshot = getJusticeSnapshot();
    assert.ok(snapshot.pendingCases.length >= 1 && snapshot.pendingCases.length <= 3, "a yearly audit must open a bounded case roll");
    for (const entry of snapshot.pendingCases) {
        const defendant = state.entities.find(entity => !entity.dead && String(entity.personId || entity.id) === String(entry.defendantId));
        assert.ok(defendant, "every case must accuse a living named resident");
        assert.equal(defendant.person.name, entry.defendantName);
        assert.ok(entry.severity >= 1 && entry.severity <= 4);
    }
});

test("a fine, forced labour, banishment, galley service and acquittal each change real state", () => {
    const apply = sentence => {
        setupRealm();
        state.year = 2;
        state.tick = 420;
        appointJudge(getJusticeSnapshot().candidates[0].personId);
        const fixture = insertCase({ id: sentence });
        const before = {
            gold: state.resources.gold,
            wood: state.resources.wood,
            stone: state.resources.stone,
            morale: state.morale,
            population: state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length
        };
        const result = tryCase(fixture.entry.id, sentence);
        assert.equal(result.ok, true, sentence + ": " + result.reason);
        assert.equal(result.judge.length > 0, true, "a named judge must decide the case");
        assert.equal(state.justice.cases.some(entry => entry.id === fixture.entry.id), false, "the case must leave the roll");
        assert.equal(state.justice.sentenceTotals[sentence], 1);
        return { result, before, defendant: fixture.defendant };
    };
    let run = apply("fine");
    assert.ok(state.resources.gold > run.before.gold, "a fine must add gold");
    run = apply("labor");
    assert.ok(state.resources.wood > run.before.wood && state.resources.stone > run.before.stone, "forced labour must add materials");
    run = apply("exile");
    assert.equal(run.defendant.dead, true, "banishment must remove the resident");
    assert.ok(state.personArchive.some(entry => entry.personId === run.result.case.defendantId), "banishment must be recorded in the archive");
    run = apply("galley");
    assert.equal(run.defendant.dead, true, "galley service must remove the resident");
    assert.ok(state.resources.gold > run.before.gold, "galley service must add gold");
    run = apply("acquit");
    assert.ok(state.morale > run.before.morale, "acquittal must raise morale");
    assert.ok(state.justice.crime.offset > 0, "acquittal must increase underlying disorder");
});

test("legal codes and charters bend taxes, trade and desertion while costing a real treasury", () => {
    setupRealm();
    state.year = 2;
    state.tick = 420;
    appointJudge(getJusticeSnapshot().candidates[0].personId);
    const customary = getJusticeModifiers();
    const goldBefore = state.resources.gold;
    const law = setLawCode("royal");
    assert.equal(law.ok, true, law.reason);
    assert.equal(state.resources.gold, goldBefore - LAW_CHANGE_COST);
    const royal = getJusticeModifiers();
    assert.ok(royal.taxEfficiency > customary.taxEfficiency, "royal law must raise the tax yield");
    assert.ok(royal.desertionFactor < customary.desertionFactor, "royal law must reduce desertion");
    assert.equal(setLawCode("guild").ok, false, "the code may only change once a year");
    const charters = grantCharter("guild");
    assert.equal(charters.ok, true, charters.reason);
    const chartered = getJusticeModifiers();
    assert.ok(chartered.tradeFactor > royal.tradeFactor, "a guild charter must improve trade terms");
    assert.equal(grantCharter("town").ok, false, "only one charter may be granted each year");
});

test("corrupt judges skim gold and an investigation can remove and recover it", () => {
    setupRealm({ gold: 400 });
    state.year = 2;
    state.tick = 420;
    appointJudge(getJusticeSnapshot().candidates[0].personId);
    state.justice.judges[0].integrity = 18;
    const goldBefore = state.resources.gold;
    updateJustice();
    assert.ok(state.resources.gold < goldBefore, "a corrupt bench must cost the treasury");
    assert.ok(state.justice.corruption.lostGold > 0, "the audit must record the loss");
    assert.ok(state.justice.corruption.level > 0, "the corruption level must rise from real integrity");
    const investigation = investigateCorruption(state.justice.judges[0].personId);
    assert.equal(investigation.ok, true, investigation.reason);
    assert.equal(investigation.corrupt, true);
    assert.ok(investigation.recovered > 0, "a successful investigation must recover gold");
    assert.equal(state.justice.judges.length, 0, "a corrupt judge must leave the bench");
});

test("modifier caches follow state changes, not ticks, and reset when a load replaces the live state", () => {
    setupRealm();
    appointClergy(getFaithSnapshot().candidates[0].personId);
    appointJudge(getJusticeSnapshot().candidates[0].personId);
    state.tick = 240;
    const faithBefore = getFaithModifiers();
    const justiceBefore = getJusticeModifiers();
    state.tick += 137;
    assert.equal(getFaithModifiers(), faithBefore, "an unchanged faith state must reuse its cached modifiers across ticks");
    assert.equal(getJusticeModifiers(), justiceBefore, "an unchanged justice state must reuse its cached modifiers across ticks");

    // A load assigns fresh state objects. Even when every persisted field is
    // identical, the cache must not belong to the previous object identity.
    state.faith = JSON.parse(JSON.stringify(state.faith));
    state.justice = JSON.parse(JSON.stringify(state.justice));
    const faithAfter = getFaithModifiers();
    const justiceAfter = getJusticeModifiers();
    assert.notEqual(faithAfter, faithBefore, "a replaced faith object must force a fresh modifier calculation");
    assert.notEqual(justiceAfter, justiceBefore, "a replaced justice object must force a fresh modifier calculation");
    assert.deepEqual(faithAfter, faithBefore, "the restored faith modifiers must equal the persisted ones");
    assert.deepEqual(justiceAfter, justiceBefore, "the restored justice modifiers must equal the persisted ones");
});

test("year rollover and quarantine expiry invalidate without a tick-keyed cache", () => {
    setupRealm();
    const festival = holdFestival("harvest");
    assert.equal(festival.ok, true, festival.reason);
    assert.ok(getFaithModifiers().festivalDemand > 0, "the festival must be active in its year");
    state.year = state.faith.festival.expiresYear + 1;
    assert.equal(getFaithModifiers().festivalDemand, 0, "festival demand must expire when the year passes its expiry");

    setupRealm();
    state.health.quarantine = { level: 3, untilTick: state.tick + 10, startedYear: state.year, orders: 1 };
    assert.ok(getJusticeModifiers().quarantine > 0, "an active quarantine must raise the crime context");
    state.tick += 11;
    assert.equal(getJusticeModifiers().quarantine, 0, "an expired quarantine must clear without another state edit");
});

// ── Persistence ───────────────────────────────────────────────

test("faith and justice normalize, validate and survive a JSON save/load round trip", () => {
    setupRealm();
    appointClergy(getFaithSnapshot().candidates[0].personId);
    holdFestival("harvest");
    state.year = 2;
    state.tick = 420;
    appointJudge(getJusticeSnapshot().candidates[0].personId);
    insertCase({ id: "roundtrip" });
    const faithBefore = JSON.parse(JSON.stringify(state.faith));
    const justiceBefore = JSON.parse(JSON.stringify(state.justice));
    assert.doesNotThrow(() => validateFaithState(faithBefore));
    assert.doesNotThrow(() => validateJusticeState(justiceBefore));
    assert.doesNotThrow(() => assert.equal(validateFaithState(normalizeFaithState({ garbage: true })), true));
    assert.doesNotThrow(() => assert.equal(validateJusticeState(normalizeJusticeState({ lawCode: "nonsense" })), true));
    assert.equal(normalizeJusticeState({ lawCode: "nonsense" }).lawCode, "customary");

    const restored = {
        faith: normalizeFaithState(JSON.parse(JSON.stringify(faithBefore))),
        justice: normalizeJusticeState(JSON.parse(JSON.stringify(justiceBefore)))
    };
    assert.deepEqual(restored.faith.clergy.map(entry => entry.name), faithBefore.clergy.map(entry => entry.name));
    assert.deepEqual(restored.faith.history.map(entry => entry.summary), faithBefore.history.map(entry => entry.summary));
    assert.deepEqual(restored.justice.judges.map(entry => entry.name), justiceBefore.judges.map(entry => entry.name));
    assert.deepEqual(restored.justice.history.map(entry => entry.summary), justiceBefore.history.map(entry => entry.summary));
    assert.deepEqual(restored.justice.cases.map(entry => entry.defendantName), justiceBefore.cases.map(entry => entry.defendantName));
    assert.equal(restored.justice.lawCode, justiceBefore.lawCode);
    assert.equal(restored.faith.festival.lastKind, "harvest");

    assert.equal(SAVE_SCHEMA_VERSION, 7, "schema 7 adds identity, research and legacy on top of the annual systems");
    const snapshot = normalizeSaveSnapshot({
        worldSeed: 9917,
        entities: [],
        resources: { wood: 1, stone: 2, gold: 3, food: 4 },
        incomeThisTick: { wood: 0, stone: 0, gold: 0, food: 0 },
        faith: faithBefore,
        justice: justiceBefore
    });
    assert.equal(validateSaveSnapshot(snapshot), true);
    assert.equal(snapshot.faith.clergy[0].name, faithBefore.clergy[0].name);
    assert.equal(snapshot.justice.judges[0].name, justiceBefore.judges[0].name);
    assert.throws(() => validateSaveSnapshot({ ...snapshot, faith: { ...faithBefore, clergy: Array(9).fill(faithBefore.clergy[0]) } }), /clergy list/);
    assert.throws(() => validateSaveSnapshot({ ...snapshot, justice: { ...justiceBefore, lawCode: "nonsense" } }), /legal code/);
});

test("the save, load and UI source contracts include both annual systems", async () => {
    const main = await readFile(new URL("../../js/app/main.js", import.meta.url), "utf8");
    const validation = await readFile(new URL("../../js/core/save-validation.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    const ui = await readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8");
    assert.ok(main.includes("faith:JSON.parse"), "the save snapshot must persist faith");
    assert.ok(main.includes("justice:JSON.parse"), "the save snapshot must persist justice");
    assert.ok(main.includes("state.faith=normalizeFaithState"), "loading must normalize faith");
    assert.ok(main.includes("state.justice=normalizeJusticeState"), "loading must normalize justice");
    assert.ok(main.includes("4:snapshot=>") && main.includes("5:snapshot=>"), "schema 4 and 5 saves must migrate into schema 6");
    assert.ok(validation.includes("validateFaithState") && validation.includes("validateJusticeState"));
    assert.equal((html.match(/data-command-tab=/g) || []).length, 18, "the command deck must expose eighteen tabs");
    assert.ok(ui.includes("faith:faithPanel") && ui.includes("justice:justicePanel"));
    assert.ok(ui.includes("faith-festival") && ui.includes("justice-verdict"));
    const faith = await readFile(new URL("../../js/systems/faith.js", import.meta.url), "utf8");
    const justice = await readFile(new URL("../../js/systems/justice.js", import.meta.url), "utf8");
    assert.ok(faith.includes("export function updateFaith"), "faith must run from the yearly simulation");
    assert.ok(justice.includes("export function updateJustice"), "justice must run from the yearly simulation");
    assert.ok(!faith.includes("requestAnimationFrame") && !justice.includes("requestAnimationFrame"), "annual systems must not add frame work");
});
