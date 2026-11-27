import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { applyScenarioStart, SCENARIO_PRESETS } from "../../js/systems/scenario.js";
import { getFirstSessionSnapshot } from "../../js/presentation/first-session.js";
import { getCoreCounsel } from "../../js/presentation/core-counsel.js";
import { AMBITIONS } from "../../js/systems/ambitions.js";

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

test("the first-session marker stays on the next milestone while NEXT MOVE teaches card play", () => {
    resetState();
    state.hasStarted = true;
    state.entities = [{ dead: false, type: TYPE.HOUSE }];
    state.statistics.totalRoadTilesBuilt = 1;
    state.statistics.totalCardsDrawn = 1;
    state.hand = [{ instanceId: "card-1", name: "Cottage" }];
    assert.equal(getCoreCounsel(state).id, "card-select");
    const select = getFirstSessionSnapshot();
    assert.equal(select.currentId, "ambition");
    assert.equal(select.counselId, "card-select");

    state.currentCard = { instanceId: "card-1", name: "Cottage" };
    state.selectedCardInstanceId = "card-1";
    assert.equal(getCoreCounsel(state).id, "card-play");
    assert.equal(getFirstSessionSnapshot().currentId, "ambition");
});

test("a completed first session names the real scenario or next ambition", () => {
    resetState();
    state.hasStarted = true;
    state.entities = [{ dead: false, type: TYPE.HOUSE }];
    state.statistics.totalHousesBuilt = 1;
    state.statistics.totalRoadTilesBuilt = 1;
    state.statistics.totalCardsDrawn = 1;
    state.ambitions.completed["full-larder"] = 1;
    const free = getFirstSessionSnapshot();
    assert.equal(free.counselId, "next-ambition");
    assert.match(free.continuationText, /Next royal ambition:/);
    assert.match(free.continuationText, /24 housing/);

    applyScenarioStart(SCENARIO_PRESETS["first-winter"]);
    const authored = getFirstSessionSnapshot();
    assert.equal(authored.counselId, "scenario");
    assert.match(authored.continuationText, /150 food by Spring, year 2/i);
    assert.match(authored.continuationText, /SPRING · YEAR 2/);
    resetState();
});

test("a completed first session continues into a live theatre campaign", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        state.hasStarted = true;
        state.entities = [{ dead: false, type: TYPE.HOUSE }];
        state.statistics.totalHousesBuilt = 1;
        state.statistics.totalRoadTilesBuilt = 1;
        state.statistics.totalCardsDrawn = 1;
        state.military = {
            campaigns: {
                active: [{
                    id: "campaign-1", aim: "watch", theatre: "realm-north",
                    theatreName: "Northern March", stage: "aim", progress: 0
                }]
            }
        };
        const snapshot = getFirstSessionSnapshot();
        assert.equal(snapshot.allComplete, true);
        assert.equal(snapshot.counselId, "campaign");
        assert.match(snapshot.continuationText, /BORDER WATCH aim in Military/);
        assert.match(snapshot.continuationText, /Northern March · BORDER WATCH/);
    } finally {
        resetState();
    }
});

test("a completed first session continues into a live council docket", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        state.hasStarted = true;
        state.entities = [{ dead: false, type: TYPE.HOUSE }];
        state.statistics.totalHousesBuilt = 1;
        state.statistics.totalRoadTilesBuilt = 1;
        state.statistics.totalCardsDrawn = 1;
        state.year = 2;
        state.government = {
            council: {
                docket: [{
                    id: "bill-1-1", billId: "bread-ordinance", stage: "lobbied",
                    support: 58, threshold: 50, proposedYear: 1
                }]
            }
        };
        const snapshot = getFirstSessionSnapshot();
        assert.equal(snapshot.allComplete, true);
        assert.equal(snapshot.counselId, "council");
        assert.match(snapshot.continuationText, /Call the BREAD ORDINANCE council vote in Government/);
        assert.match(snapshot.continuationText, /SUPPORT 58\/50/);
    } finally {
        resetState();
    }
});

test("a completed first session continues into a ready envoy mission", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        state.hasStarted = true;
        state.entities = [{ dead: false, type: TYPE.HOUSE }];
        state.statistics.totalHousesBuilt = 1;
        state.statistics.totalRoadTilesBuilt = 1;
        state.statistics.totalCardsDrawn = 1;
        state.year = 2;
        state.diplomacy = {
            missions: [{
                id: "diplomacy-mission-1-1", realmId: "northmere", goalTreaty: "trade",
                stage: "sent", sentYear: 1
            }]
        };
        const snapshot = getFirstSessionSnapshot();
        assert.equal(snapshot.allComplete, true);
        assert.equal(snapshot.counselId, "envoy-mission");
        assert.match(snapshot.continuationText, /Negotiate the envoy mission in Diplomacy/);
        assert.match(snapshot.continuationText, /NORTHMERE · TRADE · SENT/);
    } finally {
        resetState();
    }
});

test("a completed first session continues into a ready expedition follow-up", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        state.hasStarted = true;
        state.entities = [{ dead: false, type: TYPE.HOUSE }];
        state.statistics.totalHousesBuilt = 1;
        state.statistics.totalRoadTilesBuilt = 1;
        state.statistics.totalCardsDrawn = 1;
        state.expeditions = {
            sites: [{
                id: "site-4", name: "Broken Watchtower", chainStage: 2,
                claim: "quarantine", notes: ["The beacon floor is quarantined."]
            }]
        };
        const snapshot = getFirstSessionSnapshot();
        assert.equal(snapshot.allComplete, true);
        assert.equal(snapshot.counselId, "expedition-chain");
        assert.match(snapshot.continuationText, /quarantine follow-up at Broken Watchtower in Explore/i);
        assert.match(snapshot.continuationText, /FOLLOW-UP READY · 1 field notes/);
    } finally {
        resetState();
    }
});

test("the first-session HUD carries the real latest twenty-day ledger in plain language", () => {
    resetState();
    state.hasStarted = true;
    state.economy.lastLedger = {
        foodInflow: 120,
        foodConsumed: 90,
        foodSpoiled: 4,
        wagesPaid: 12,
        upkeepPaid: 6,
        netGold: -18
    };
    const snapshot = getFirstSessionSnapshot();
    assert.match(snapshot.ledgerBrief, /LAST 20-DAY SETTLEMENT/);
    assert.match(snapshot.ledgerBrief, /120 food in/);
    assert.match(snapshot.ledgerBrief, /90 eaten/);
    assert.match(snapshot.ledgerBrief, /4 spoiled/);
    assert.match(snapshot.ledgerBrief, /-18 gold net after 12 wages and 6 upkeep/);
    delete state.economy.lastLedger;
    assert.equal(getFirstSessionSnapshot().ledgerBrief, "", "no ledger must not invent a settlement");
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
    assert.ok(html.includes('id="first-session-ledger"'));
    assert.ok(html.includes('id="ambition-counsel-evidence"'));
    assert.ok(hud.includes(".first-session-step.is-done"));
    assert.ok(hud.includes(".first-session-step.is-current"));
    assert.ok(hud.includes(".first-session-complete"));
    assert.ok(hud.includes(".first-session-ledger"));
    assert.ok(hud.includes(".first-session-list[hidden]"));
    assert.ok(ui.includes("renderFirstSession"));
    assert.ok(ui.includes('setText("first-session-count"'));
    assert.ok(ui.includes('"FIRST SESSION COMPLETE"'));
    assert.ok(ui.includes("list.hidden=snapshot.allComplete"));
    assert.ok(ui.includes("complete.hidden=!snapshot.allComplete"));
    assert.ok(ui.includes('setText("first-session-complete"'));
    assert.ok(ui.includes("snapshot.continuationText"));
    assert.ok(ui.includes('setText("first-session-ledger"'));
    assert.ok(ui.includes("snapshot.ledgerBrief"));
});
