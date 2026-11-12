import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { BUILDING_LABELS, BUILD_MENU, GOODS, RECIPES, SERVICE_DEFINITIONS } from "../../js/systems/city-config.js";
import { CITY_CODEX } from "../../js/systems/city-codex.js";
import { serializeCity, restoreCity, validateCitySnapshot } from "../../js/systems/logistics.js";
import {
    CIVIC_EVENTS, CIVIC_POLICIES, ensureCivic, getCivicModifiers, getCivicSlots,
    getCivicSnapshot, enactCivicPolicy, repealCivicPolicy, resolveCivicChoice, updateCivic
} from "../../js/systems/civic.js";
import { renderCityPanel } from "../../js/presentation/city-panel.js";

beforeEach(() => {
    resetState();
    state.hasStarted = true;
    state.tick = 20;
    state.year = 1;
    state.resources = { wood: 200, stone: 200, gold: 300, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 70;
    state.city = { version: 1, enabled: true, logistics: null, fields: null, services: null, needs: null };
    ensureCivic();
});

test("all city codex portraits exist for the four seasons", () => {
    const files = new Set(fs.readdirSync("assets/city-codex"));
    for (const entry of CITY_CODEX) {
        for (const season of ["spring", "summer", "autumn", "winter"]) {
            assert.ok(files.has(entry.slug + "-" + season + ".svg"), "missing portrait " + entry.slug + "-" + season);
        }
    }
    assert.ok(files.size >= CITY_CODEX.length * 4);
});

test("the city content pack exposes six civic buildings, ale and four new service categories", () => {
    for (const type of [TYPE.TOWN_HALL, TYPE.SCHOOL, TYPE.BATHHOUSE, TYPE.BREWERY, TYPE.GUILDHALL, TYPE.WATCHHOUSE]) {
        assert.ok(BUILDING_LABELS[type], "missing label for " + type);
        assert.ok(BUILD_MENU.some(category => category.types?.includes(type)), "missing build menu entry for " + type);
    }
    assert.equal(RECIPES[TYPE.BREWERY].output.ale, 2);
    assert.equal(GOODS.ale.label, "Ale");
    for (const category of ["civic", "education", "sanitation", "trade"]) {
        assert.ok(SERVICE_DEFINITIONS[category], "missing service category " + category);
    }
    assert.ok(CITY_CODEX.length >= 34);
    assert.equal(CIVIC_POLICIES.length, 24);
    assert.equal(CIVIC_EVENTS.length, 40);
});

test("a town hall expands ordinance slots and enacted laws change live modifiers", () => {
    assert.equal(getCivicSlots(), 2);
    state.entities.push({
        id: "hall-test", type: TYPE.TOWN_HALL, x: 40, y: 40, dead: false,
        construction: { stage: 3 }, isBuilding: () => true
    });
    assert.equal(getCivicSlots(), 4);

    const goldBefore = state.resources.gold;
    const enacted = enactCivicPolicy("market_charter");
    assert.equal(enacted.ok, true);
    assert.equal(state.resources.gold, goldBefore - 30);
    const modifiers = getCivicModifiers();
    assert.ok(modifiers.tax > 0);
    assert.ok(modifiers.trade > 0);
    assert.equal(modifiers.upkeep, 4);
    assert.equal(repealCivicPolicy("market_charter").ok, true);
    assert.equal(getCivicModifiers().tax, 0);
});

test("annual civic upkeep is charged once and a city event can resolve a real choice", () => {
    assert.equal(enactCivicPolicy("open_granaries").ok, true);
    state.year = 2;
    const goldBefore = state.resources.gold;
    const snapshot = updateCivic();
    assert.equal(snapshot.lastUpdateYear, 2);
    assert.equal(state.resources.gold, goldBefore - 3, "annual upkeep must be charged exactly once");
    const afterAudit = state.resources.gold;
    updateCivic();
    assert.equal(state.resources.gold, afterAudit, "a repeated annual call must not charge twice");

    const civic = ensureCivic();
    civic.pendingEvent = { id: CIVIC_EVENTS[0].id, year: 2, resolved: false };
    const foodBefore = state.resources.food;
    const moraleBefore = state.morale;
    const result = resolveCivicChoice(0);
    assert.equal(result.ok, true);
    assert.equal(civic.pendingEvent, null);
    assert.equal(state.resources.food, foodBefore - 12);
    assert.ok(state.morale > moraleBefore, "the generous choice must genuinely lift morale");
});

test("old or malformed civic saves normalize without duplicating or inventing laws", () => {
    state.city.civic = {
        active: ["market_charter", "market_charter", "not-a-law"],
        history: [{ year: "bad", kind: 4, summary: 8 }],
        pendingEvent: { id: "not-an-event", year: 99 }
    };
    const snapshot = getCivicSnapshot();
    assert.deepEqual(snapshot.active, ["market_charter"]);
    assert.equal(snapshot.pendingEvent, null);
    assert.equal(snapshot.activePolicies.length, 1);
    assert.ok(snapshot.history.length <= 1);
});

test("civic state survives the city save round trip and the panel renders its controls", () => {
    assert.equal(enactCivicPolicy("craft_halls").ok, true);
    const snapshot = serializeCity();
    assert.equal(validateCitySnapshot(snapshot), true);
    resetState();
    state.hasStarted = true;
    state.city = { version: 1, enabled: true, logistics: null, fields: null, services: null, needs: null };
    restoreCity(snapshot);
    assert.deepEqual(ensureCivic().active, ["craft_halls"]);
    const html = renderCityPanel();
    assert.match(html, /CITY EVENT/);
    assert.match(html, /CITY CODEX/);
    assert.match(html, /Town Hall/);
    assert.match(html, /data-civic-action="repeal"/);
});
