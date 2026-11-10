import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state, resetState } from "../../js/core/state.js";
import {
    EDICT_DEFINITIONS,
    activateEdict,
    ensureEdicts,
    getActiveEdicts,
    getEdictModifiers,
    updateEdicts
} from "../../js/systems/edicts.js";
import { CARD_PROTOTYPES } from "../../js/systems/card-catalog.js";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const cardsSource = read("../../js/systems/cards.js");
const economySource = read("../../js/systems/economy.js");
const simulationSource = read("../../js/simulation/simulation.js");

const DEPTH_CARD_IDS = [
    "granary-reserve", "irrigation-works", "orchard", "village-well",
    "scholar-patronage", "royal-mint", "harvest-law", "guild-charter",
    "merchant-charter", "signal-fire", "quarantine", "festival-week",
    "tax-levy", "pilgrim-road", "stone-road-works", "land-clearance",
    "dragon-tribute", "star-chart", "healers-round", "militia-muster",
    "apiary", "vineyard", "scriptorium", "harbor"
];

test("every edict is a complete, timed policy", () => {
    const ids = Object.keys(EDICT_DEFINITIONS);
    assert.ok(ids.length >= 6, "at least six edicts ship with the realm");
    for (const id of ids) {
        const edict = EDICT_DEFINITIONS[id];
        assert.match(edict.name, /^[A-Z][A-Z ' -]+$/, id + " needs a readable name");
        assert.ok(Number.isInteger(edict.years) && edict.years >= 1 && edict.years <= 10, id + " needs a bounded term");
        assert.ok(edict.description.length > 10, id + " needs a description");
        assert.equal(typeof edict.modifiers, "object");
        for (const [key, value] of Object.entries(edict.modifiers)) {
            assert.ok(["tax", "food", "morale"].includes(key), id + " uses an unknown modifier " + key);
            assert.ok(Number.isFinite(value), id + " has a non-finite modifier");
        }
    }
});

test("an unknown edict is refused without touching state", () => {
    resetState();
    const result = activateEdict("burn-the-realm");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "UNKNOWN EDICT");
    assert.equal(ensureEdicts().length, 0);
});

test("an edict is recorded with a term and a chronicle entry", () => {
    resetState();
    state.year = 3;
    const result = activateEdict("harvest-law");
    assert.equal(result.ok, true);
    const active = getActiveEdicts();
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "harvest-law");
    assert.equal(active[0].startedYear, 3);
    assert.equal(active[0].expiresYear, 6);
    assert.ok(state.eventLog.some(entry => String(entry.text).includes("HARVEST LAW")));
});

test("a second proclamation of the same edict is refused", () => {
    resetState();
    assert.equal(activateEdict("watch-fires").ok, true);
    const again = activateEdict("watch-fires");
    assert.equal(again.ok, false);
    assert.equal(again.reason, "ALREADY IN FORCE");
    assert.equal(getActiveEdicts().length, 1);
});

test("edict modifiers compound across active laws", () => {
    resetState();
    activateEdict("harvest-law");
    activateEdict("royal-mint");
    const modifiers = getEdictModifiers();
    assert.ok(Math.abs(modifiers.food - 0.82) < 1e-9, "the harvest law lowers household demand");
    assert.ok(Math.abs(modifiers.tax - 1.32) < 1e-9, "the mint raises tax collection");
    assert.ok(modifiers.morale < 0);
});

test("an edict lapses when its term ends", () => {
    resetState();
    state.year = 1;
    activateEdict("watch-fires", { years: 2 });
    state.year = 2;
    assert.equal(updateEdicts().length, 0, "still in force in its first year");
    state.year = 3;
    const expired = updateEdicts();
    assert.equal(expired.length, 1);
    assert.equal(getActiveEdicts().length, 0);
    assert.ok(state.eventLog.some(entry => String(entry.text).includes("LAPSED")));
});

test("the economy applies edict modifiers before settling the ledger", () => {
    assert.ok(economySource.includes("getEdictModifiers"));
    assert.ok(economySource.includes("ledger.foodDemand *= edicts.food"));
    assert.ok(economySource.includes("ledger.taxesCollected *= edicts.tax"));
});

test("the simulation expires edicts with the yearly cycle", () => {
    assert.ok(simulationSource.includes("updateEdicts"));
    assert.match(simulationSource, /if\(state\.year>previousYear\)\{[\s\S]*?updateEdicts\(\);/);
});

test("the catalog ships the curated depth cards exactly once", () => {
    const ids = CARD_PROTOTYPES.map(card => card.id);
    for (const id of DEPTH_CARD_IDS) {
        assert.equal(ids.filter(value => value === id).length, 1, id + " must exist exactly once");
    }
    assert.ok(CARD_PROTOTYPES.length >= 48, "the curated catalog keeps growing");
});

test("every curated card effect has a resolver", () => {
    const effects = new Set(CARD_PROTOTYPES.map(card => card.effect).filter(Boolean));
    assert.ok(effects.size >= 12, "the deck uses a broad set of effects");
    for (const effect of effects) {
        assert.ok(cardsSource.includes('card.effect==="' + effect + '"'), "missing resolver for " + effect);
    }
});

test("curated cards only ask for real resources", () => {
    for (const card of CARD_PROTOTYPES) {
        for (const [resource, amount] of Object.entries(card.cost || {})) {
            assert.ok(["wood", "stone", "gold", "food"].includes(resource), card.id + " asks for " + resource);
            assert.ok(Number.isFinite(amount) && amount >= 0, card.id + " has a broken cost");
        }
    }
});

test("edict records survive a save round-trip", () => {
    resetState();
    activateEdict("guild-charter");
    const saved = JSON.parse(JSON.stringify(state.edicts));
    resetState();
    state.edicts = saved;
    const active = getActiveEdicts();
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "guild-charter");
});

test("interface settings ship with safe defaults and persist", () => {
    const persistence = read("../../js/core/persistence.js");
    const html = read("../../index.html");
    const main = read("../../js/app/main.js");
    assert.ok(persistence.includes("showDeltas: true"));
    assert.ok(persistence.includes("reduceMotion: false"));
    assert.ok(persistence.includes("showDeltas: settings.showDeltas !== false"));
    assert.ok(persistence.includes("reduceMotion: settings.reduceMotion === true"));
    for (const id of ["settings-deltas-toggle", "settings-motion-toggle"]) {
        assert.ok(html.includes('id="' + id + '"'), id + " must exist in the settings modal");
    }
    assert.ok(main.includes("hide-resource-deltas"));
    assert.ok(main.includes("reduce-interface-motion"));
});

test("cards are drawn on request instead of on a hidden timer", () => {
    const cards = read("../../js/systems/cards.js");
    assert.equal(cards.includes("updateCardDraw"), false, "no automatic draw loop may remain");
    assert.equal(cards.includes("cardPace"), false, "a manual draw ignores the old pace setting");
    assert.ok(cards.includes("drawPlayerCard"), "the deck panel must use the explicit draw helper");
});

test("delta and motion settings have real CSS contracts", () => {
    const hud = read("../../css/hud-v3.css");
    assert.ok(hud.includes("body.hide-resource-deltas .resource-delta{display:none}"));
    assert.ok(hud.includes("body.reduce-interface-motion"));
    assert.ok(hud.includes(".settings-select{"));
});
