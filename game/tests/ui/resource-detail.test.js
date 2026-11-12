// The live resource panel used to reference `cycle` from a neighbouring
// function without defining it. Opening STORES therefore threw
// "cycle is not defined" and left the command panel empty in the browser.
// Render the real panel function against a minimal live state so that missing
// bindings fail in the normal suite, not only in the long browser audit.
import test from "node:test";
import assert from "node:assert/strict";
import {resetState, state} from "../../js/core/state.js";
import {resources} from "../../js/presentation/management-ui.js";

test("the resource detail panel renders the live economy cycle", () => {
    resetState();
    state.hasStarted = true;
    state.resources = {wood: 180, stone: 95, gold: 75, food: 120};
    state.incomeThisTick = {wood: 2, stone: -1, gold: 3, food: 0};
    state.economy = {...state.economy, history: [], lastLedger: null};
    state.entities = [];

    const html = resources();

    assert.match(html, /THE ROYAL STORES/);
    assert.match(html, /GOLD/);
    assert.match(html, /75/);
    assert.match(html, /FOOD BALANCE \/ LEDGER/);
    assert.match(html, /STORAGE CAP/);
    assert.match(html, /CRISIS/);
});
