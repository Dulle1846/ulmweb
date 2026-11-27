import test from "node:test";
import assert from "node:assert/strict";
import { TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import { applyScenarioStart, SCENARIO_PRESETS } from "../../js/systems/scenario.js";
import { getCoreCounsel } from "../../js/presentation/core-counsel.js";
import { AMBITIONS } from "../../js/systems/ambitions.js";

function realm(overrides = {}) {
    return {
        hasStarted: true,
        resources: { food: 200, wood: 180, stone: 95, gold: 75 },
        entities: [{ dead: false, type: TYPE.HOUSE }],
        economy: { lastLedger: { foodShortage: 0 } },
        statistics: { totalRoadTilesBuilt: 12 },
        market: { prices: { wood: 2, stone: 3, food: 2 }, partners: [{ stock: { wood: 20, stone: 20, food: 20 } }] },
        hand: [{ id: "card" }],
        morale: 80,
        ...overrides
    };
}

test("core counsel prioritizes food, housing, roads and cards", () => {
    assert.equal(getCoreCounsel(realm({ resources: { food: 20 } })).id, "food");
    assert.equal(getCoreCounsel(realm({ resources: { food: 200 }, entities: [] })).id, "housing");
    assert.equal(getCoreCounsel(realm({ statistics: { totalRoadTilesBuilt: 0 } })).id, "roads");
    assert.equal(getCoreCounsel(realm({ hand: [] })).id, "cards");
});

test("core counsel points to the existing panels and stays quiet once the loop is steady", () => {
    const food = getCoreCounsel(realm({ resources: { food: 20, wood: 180, stone: 95, gold: 75 } }));
    assert.equal(food.panel, "build");
    assert.equal(food.actionLabel, "BUILD FARM");
    assert.equal(food.buildCategory, "production");
    assert.equal(food.buildType, TYPE.FARM);
    assert.match(food.evidence, /Granary 20 food/);

    const cards = getCoreCounsel(realm({ hand: [] }));
    assert.equal(cards.panel, "cards");
    assert.equal(cards.actionLabel, "OPEN CARDS");
    assert.equal(cards.stepId, "card");
    assert.match(cards.evidence, /Hand 0 cards/);

    assert.equal(getCoreCounsel(realm()).id, "steady");
    assert.equal(getCoreCounsel(realm()).panel, "cards");
});

test("core counsel reads the existing food shortage and housing capacity signals", () => {
    assert.equal(getCoreCounsel(realm({
        economy: { lastLedger: { foodShortage: 8 } }
    })).id, "food");

    const villages = Array.from({ length: 4 }, () => ({ dead: false, type: TYPE.VILLAGER }));
    assert.equal(getCoreCounsel(realm({ entities: [...villages, { dead: false, type: TYPE.HOUSE }] })).id, "housing");
});

test("core counsel never recommends an unaffordable farm when the granary is empty", () => {
    const counsel = getCoreCounsel(realm({
        resources: { food: 0, wood: 0, stone: 0, gold: 0 },
        hand: [{ id: "card" }]
    }));
    assert.equal(counsel.id, "food");
    assert.equal(counsel.panel, "cards");
    assert.equal(counsel.actionLabel, "OPEN CARDS");
    assert.match(counsel.text, /open the cards/i);
});

test("core counsel uses the existing market when the granary is empty and food can be bought", () => {
    const counsel = getCoreCounsel(realm({
        resources: { food: 0, wood: 0, stone: 0, gold: 100 },
        hand: [{ id: "card" }]
    }));
    assert.equal(counsel.id, "food");
    assert.equal(counsel.panel, "market");
    assert.equal(counsel.actionLabel, "OPEN MARKET");
    assert.match(counsel.text, /market/i);
});

test("core counsel does not recommend an unaffordable cottage or road", () => {
    const villages = Array.from({ length: 4 }, () => ({ dead: false, type: TYPE.VILLAGER }));
    const housing = getCoreCounsel(realm({
        resources: { food: 200, wood: 0, stone: 0, gold: 0 },
        entities: [...villages, { dead: false, type: TYPE.HOUSE }],
        hand: [{ id: "card" }]
    }));
    assert.equal(housing.id, "housing");
    assert.equal(housing.panel, "cards");

        const roads = getCoreCounsel(realm({ resources: { food: 200, wood: 0, stone: 0, gold: 0 }, statistics: { totalRoadTilesBuilt: 0 }, hand: [{ id: "card" }] }));
    assert.equal(roads.id, "roads");
    assert.equal(roads.panel, "cards");
    assert.match(roads.evidence, /short/);
});

test("core counsel carries the exact build target and measured evidence for an affordable step", () => {
    const roads = getCoreCounsel(realm({ statistics: { totalRoadTilesBuilt: 0 } }));
    assert.equal(roads.buildCategory, "roads");
    assert.equal(roads.buildType, "dirt");
    assert.equal(roads.stepId, "road");
    assert.match(roads.evidence, /Road tiles 0/);

    const villagers = Array.from({ length: 4 }, () => ({ dead: false, type: TYPE.VILLAGER }));
    const housing = getCoreCounsel(realm({ entities: [...villagers, { dead: false, type: TYPE.HOUSE }] }));
    assert.equal(housing.buildCategory, "housing");
    assert.equal(housing.buildType, TYPE.HOUSE);
    assert.equal(housing.stepId, "house");
    assert.match(housing.evidence, /Beds 4 · 4 residents/);
});

test("core counsel explains an open cottage site instead of counting it as beds", () => {
    const villagers = Array.from({ length: 4 }, () => ({ dead: false, type: TYPE.VILLAGER }));
    const site = {
        dead: false,
        type: TYPE.HOUSE,
        construction: { stage: 0, reason: "WAITING FOR PLANKS", materialNeed: { planks: 4 }, delivered: { planks: 1 } }
    };
    const counsel = getCoreCounsel(realm({ entities: [...villagers, { dead: false, type: TYPE.HOUSE }, site] }));
    assert.equal(counsel.id, "housing-site");
    assert.equal(counsel.stepId, "house", "the checklist step stays open until the site is complete");
    assert.equal(counsel.panel, "buildings", "the player must see the stalled site, not start a second one");
    assert.match(counsel.text, /site is open but not operational/i);
    assert.match(counsel.text, /beds arrive when construction completes/i);
    assert.match(counsel.evidence, /Site opened · stage 0/);
    assert.match(counsel.evidence, /WAITING FOR PLANKS/);
    assert.match(counsel.evidence, /needs 3 planks/);
});

test("core counsel does not recommend a step before the realm is founded", () => {
    const counsel = getCoreCounsel({ hasStarted: false });
    assert.equal(counsel.id, "found");
    assert.equal(counsel.panel, null);
});

test("core counsel teaches the first drawn card to be selected without auto-selecting it", () => {
    const before = realm({
        statistics: { totalRoadTilesBuilt: 12, totalCardsDrawn: 1 },
        hand: [{ instanceId: "card-1", name: "Cottage" }]
    });
    const snapshot = JSON.stringify(before);
    const counsel = getCoreCounsel(before);
    assert.equal(counsel.id, "card-select");
    assert.equal(counsel.stepId, "ambition");
    assert.equal(counsel.panel, "cards");
    assert.equal(counsel.actionLabel, "OPEN CARDS");
    assert.match(counsel.text, /select it before you place it/i);
    assert.match(counsel.evidence, /Hand 1 card · no card selected/);
    assert.equal(JSON.stringify(before), snapshot, "counsel must not arm or mutate the card");
});

test("core counsel teaches placement of an explicitly selected card without playing it", () => {
    const before = realm({
        statistics: { totalRoadTilesBuilt: 12, totalCardsDrawn: 1 },
        hand: [{ instanceId: "card-1", name: "Cottage" }],
        currentCard: { instanceId: "card-1", name: "Cottage" },
        selectedCardInstanceId: "card-1"
    });
    const snapshot = JSON.stringify(before);
    const counsel = getCoreCounsel(before);
    assert.equal(counsel.id, "card-play");
    assert.equal(counsel.stepId, "ambition");
    assert.equal(counsel.panel, "cards");
    assert.equal(counsel.actionLabel, "REVIEW CARDS");
    assert.match(counsel.text, /drag it onto a valid map tile/i);
    assert.match(counsel.text, /tap a tile on touch controls/i);
    assert.match(counsel.evidence, /Selected: Cottage/);
    assert.equal(JSON.stringify(before), snapshot, "counsel must not play the armed card");
});

test("core counsel stops first-card teaching after the card leaves the hand", () => {
    const counsel = getCoreCounsel(realm({
        statistics: { totalRoadTilesBuilt: 12, totalCardsDrawn: 2 },
        hand: [{ instanceId: "card-2", name: "Cottage" }]
    }));
    assert.notEqual(counsel.id, "card-select");
    assert.notEqual(counsel.id, "card-play");
});

test("core counsel keeps the checklist target valid after the first drawn card is played", () => {
    const counsel = getCoreCounsel(realm({
        statistics: { totalRoadTilesBuilt: 12, totalCardsDrawn: 1 },
        hand: []
    }));
    assert.equal(counsel.id, "cards");
    assert.equal(counsel.stepId, "ambition");
});

test("core counsel continues an authored scenario after the first five steps", () => {
    resetState();
    try {
        state.hasStarted = true;
        state.entities = [{ dead: false, type: TYPE.HOUSE }];
        state.statistics.totalRoadTilesBuilt = 1;
        state.ambitions.completed["full-larder"] = 1;
        applyScenarioStart(SCENARIO_PRESETS["first-winter"]);
        const counsel = getCoreCounsel(state);
        assert.equal(counsel.id, "scenario");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "kingdom");
        assert.match(counsel.text, /150 food by Spring, year 2/i);
        assert.match(counsel.evidence, /SPRING · YEAR 2/);
        assert.match(counsel.evidence, /IN PROGRESS/);
    } finally {
        resetState();
    }
});

test("core counsel continues a free realm with the next measured ambition", () => {
    resetState();
    try {
        state.hasStarted = true;
        state.entities = [{ dead: false, type: TYPE.HOUSE }];
        state.statistics.totalRoadTilesBuilt = 1;
        state.ambitions.completed["full-larder"] = 1;
        const counsel = getCoreCounsel(state);
        assert.equal(counsel.id, "next-ambition");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "kingdom");
        assert.match(counsel.text, /Next royal ambition:/);
        assert.match(counsel.evidence, /24 housing/);
    } finally {
        resetState();
    }
});

test("core counsel extends a completed opening into a live council bill", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        const docket = [{
            id: "bill-1-1", billId: "bread-ordinance", stage: "proposed",
            support: 53, threshold: 50, proposedYear: 1
        }];
        const counsel = getCoreCounsel(realm({ year: 1, government: { council: { docket } } }));
        assert.equal(counsel.id, "council");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "government");
        assert.equal(counsel.actionLabel, "OPEN GOVERNMENT");
        assert.match(counsel.text, /Pay the BREAD ORDINANCE lobby in Government/);
        assert.match(counsel.evidence, /SUPPORT 53\/50/);

        docket[0].stage = "lobbied";
        const ready = getCoreCounsel(realm({ year: 2, government: { council: { docket } } }));
        assert.equal(ready.id, "council");
        assert.match(ready.text, /Call the BREAD ORDINANCE council vote in Government/);
    } finally {
        resetState();
    }
});

test("core counsel extends a completed opening into royal education", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        const child = { dead: false, type: TYPE.KNIGHT, isRoyalFamily: true, person: { role: "royal-child" } };
        const sibling = { dead: false, type: TYPE.KNIGHT, isRoyalFamily: true, person: { role: "royal-child" } };
        const noTutor = getCoreCounsel(realm({
            entities: [child, sibling, { dead: false, type: TYPE.HOUSE }],
            royal: { education: { tutorId: null, students: [] } }
        }));
        assert.equal(noTutor.id, "royal-education");
        assert.equal(noTutor.panel, "decisions");
        assert.equal(noTutor.actionLabel, "OPEN DECISIONS");
        assert.match(noTutor.text, /Appoint a royal Tutor in Decisions/);

        const student = { id: "student-1", curriculumId: "letters", stage: "tutelage", yearsTaught: 1, yearsRequired: 3 };
        const enrolled = getCoreCounsel(realm({
            entities: [child, sibling, { dead: false, type: TYPE.HOUSE }],
            royal: { education: { tutorId: "tutor-1", students: [student] } }
        }));
        assert.equal(enrolled.id, "royal-education");
        assert.match(enrolled.text, /Enrol a royal child in a curriculum in Decisions/);

        const ready = getCoreCounsel(realm({
            entities: [child, sibling, { dead: false, type: TYPE.HOUSE }],
            royal: { education: { tutorId: "tutor-1", students: [{ ...student, stage: "ready", yearsTaught: 3 }] } }
        }));
        assert.equal(ready.id, "royal-education");
        assert.match(ready.text, /Hold the coming-of-age audience in Decisions/);
        assert.match(ready.evidence, /LETTERS & CHANCERY · READY · 3\/3 YEARS/);
    } finally {
        resetState();
    }
});

test("core counsel extends a completed opening into a ready envoy mission", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        const mission = {
            id: "diplomacy-mission-1-1", realmId: "northmere", goalTreaty: "trade",
            stage: "sent", sentYear: 1
        };
        const counsel = getCoreCounsel(realm({ year: 2, diplomacy: { missions: [mission] } }));
        assert.equal(counsel.id, "envoy-mission");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "diplomacy");
        assert.equal(counsel.actionLabel, "OPEN DIPLOMACY");
        assert.match(counsel.text, /Negotiate the envoy mission in Diplomacy/);
        assert.match(counsel.evidence, /NORTHMERE · TRADE · SENT/);

        mission.stage = "negotiated";
        mission.negotiatedYear = 2;
        mission.score = 52;
        const report = getCoreCounsel(realm({ year: 3, diplomacy: { missions: [mission] } }));
        assert.equal(report.id, "envoy-mission");
        assert.match(report.text, /File the envoy report in Diplomacy/);
        assert.match(report.evidence, /SCORE 52/);

        mission.stage = "reported";
        mission.reportYear = 3;
        mission.outcome = "accepted";
        const ratify = getCoreCounsel(realm({ year: 4, diplomacy: { missions: [mission] } }));
        assert.equal(ratify.id, "envoy-mission");
        assert.match(ratify.text, /Ratify the negotiated treaty in Diplomacy/);
    } finally {
        resetState();
    }
});

test("core counsel extends a completed opening into a ready expedition follow-up", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        const site = {
            id: "site-3", name: "Whispering Cave", chainStage: 2,
            claim: "study", notes: ["A blight sample must be taken from the pale vein."]
        };
        const realmState = realm({ expeditions: { sites: [site] } });
        const before = JSON.stringify(realmState);
        const counsel = getCoreCounsel(realmState);
        assert.equal(counsel.id, "expedition-chain");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "explore");
        assert.equal(counsel.actionLabel, "OPEN EXPLORE");
        assert.match(counsel.text, /study follow-up at Whispering Cave in Explore/i);
        assert.match(counsel.evidence, /FOLLOW-UP READY · 1 field notes/);
        assert.equal(JSON.stringify(realmState), before, "counsel must not arm or mutate the chain");
        site.chainStage = 3;
        assert.notEqual(getCoreCounsel(realmState).id, "expedition-chain", "a closed chain must leave the next step");
    } finally {
        resetState();
    }
});

test("core counsel extends a completed opening into an open atlas follow-up", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        const followUp = {
            id: "biome-follow:1", kind: "trail", title: "Map the feeder trails",
            regionName: "Violet Gloaming", stage: "open", expiresYear: 5
        };
        const realmState = realm({ specialBiomes: { couplings: { questFollowUps: [followUp] } } });
        const before = JSON.stringify(realmState);
        const counsel = getCoreCounsel(realmState);
        assert.equal(counsel.id, "biome-follow-up");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "explore");
        assert.equal(counsel.actionLabel, "OPEN EXPLORE");
        assert.match(counsel.text, /atlas follow-up at Violet Gloaming in Explore/i);
        assert.match(counsel.evidence, /TRAIL · MAP THE FEEDER TRAILS · OPEN · EXPIRES YEAR 5/);
        assert.equal(JSON.stringify(realmState), before, "counsel must not arm or mutate the follow-up");
        followUp.stage = "resolved";
        assert.notEqual(getCoreCounsel(realmState).id, "biome-follow-up", "a closed follow-up must leave the next step");
    } finally {
        resetState();
    }
});

test("core counsel extends a completed opening into the live theatre campaign", () => {
    resetState();
    try {
        for (const ambition of AMBITIONS) state.ambitions.completed[ambition.id] = 1;
        const campaign = {
            id: "campaign-1", aim: "watch", theatre: "realm-north",
            theatreName: "Northern March", stage: "aim", progress: 0
        };
        const counsel = getCoreCounsel(realm({ military: { campaigns: { active: [campaign] } } }));
        assert.equal(counsel.id, "campaign");
        assert.equal(counsel.stepId, null);
        assert.equal(counsel.panel, "military");
        assert.equal(counsel.actionLabel, "OPEN MILITARY");
        assert.match(counsel.text, /BORDER WATCH aim in Military/);
        assert.match(counsel.evidence, /Northern March · BORDER WATCH/);

        campaign.stage = "committed";
        campaign.progress = 100;
        const ready = getCoreCounsel(realm({ military: { campaigns: { active: [campaign] } } }));
        assert.equal(ready.id, "campaign");
        assert.match(ready.text, /Settle the Northern March war band in Military/);
        assert.match(ready.evidence, /100\/100 progress/);
    } finally {
        resetState();
    }
});
