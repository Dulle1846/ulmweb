import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { getFirstSessionSnapshot } from "../../js/presentation/first-session.js";
import { getCoreCounsel } from "../../js/presentation/core-counsel.js";

test("the first-session checklist starts with founding and exposes all five steps", () => {
    resetState();
    const before = getFirstSessionSnapshot();
    assert.equal(before.completed, 0);
    assert.deepEqual(before.items.map(item => item.id), ["founded", "house", "road", "card", "ambition"]);
    assert.equal(before.currentId, "founded");

    state.hasStarted = true;
    const founded = getFirstSessionSnapshot();
    assert.equal(founded.completed, 1);
    assert.deepEqual(founded.items.map(item => item.done), [true, false, false, false, false]);
    assert.ok(founded.currentDetail.length > 0, "the current step must carry a measured detail");
});

test("the NEXT marker follows the live counsel instead of a conflicting checklist order", () => {
    resetState();
    state.hasStarted = true;
    state.resources = { food: 200, wood: 180, stone: 95, gold: 75 };
    state.entities = [
        { dead: false, type: TYPE.VILLAGER },
        { dead: false, type: TYPE.VILLAGER },
        { dead: false, type: TYPE.HOUSE }
    ];
    state.hand = [{ id: "card" }];
    assert.equal(getCoreCounsel(state).id, "roads");
    const roads = getFirstSessionSnapshot();
    assert.equal(roads.currentId, "road");
    assert.match(roads.currentDetail, /Road tiles 0/);
    assert.equal(roads.items.find(item => item.id === "house").done, false);
    assert.equal(roads.items.find(item => item.id === "road").done, false);

    state.resources = { food: 0, wood: 0, stone: 0, gold: 0 };
    state.economy.lastLedger = { foodShortage: 5 };
    const hungry = getFirstSessionSnapshot();
    assert.equal(hungry.currentId, null, "a survival need outside the five milestones must not claim a milestone as NEXT");
    assert.match(hungry.needText, /granary is empty/i);
});

test("the first-session checklist follows the existing house, road, card and ambition facts", () => {
    resetState();
    state.hasStarted = true;
    state.statistics.totalHousesBuilt = 1;
    state.statistics.totalRoadTilesBuilt = 1;
    state.statistics.totalCardsDrawn = 1;
    state.ambitions.completed["full-larder"] = 1;
    const snapshot = getFirstSessionSnapshot();
    assert.equal(snapshot.completed, 5);
    assert.equal(snapshot.allComplete, true);
    assert.ok(snapshot.items.every(item => item.done));
});

test("the HUD section, CSS states and on-demand renderer are wired", async () => {
    const root = new URL("../../", import.meta.url);
    const [html, hud, ui] = await Promise.all([
        readFile(new URL("index.html", root), "utf8"),
        readFile(new URL("css/hud-v3.css", root), "utf8"),
        readFile(new URL("js/presentation/rendering/ui.js", root), "utf8")
    ]);
    assert.ok(html.includes('id="first-session-section"'));
    assert.ok(html.includes('id="first-session-list"'));
    assert.ok(html.includes('id="first-session-complete"'));
    assert.ok(html.includes('id="first-session-need"'));
    assert.ok(html.includes('id="ambition-counsel-evidence"'));
    assert.ok(hud.includes(".first-session-step.is-done"));
    assert.ok(hud.includes(".first-session-step.is-current"));
    assert.ok(hud.includes(".first-session-complete"));
    assert.ok(hud.includes(".first-session-list[hidden]"));
    assert.ok(ui.includes("renderFirstSession"));
    assert.ok(ui.includes('setText("first-session-count"'));
    assert.ok(ui.includes('"FIRST SESSION COMPLETE"'));
    assert.ok(ui.includes("list.hidden=snapshot.allComplete"));
    assert.ok(ui.includes("complete.hidden=!snapshot.allComplete"));
});
