import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetState, state } from "../../js/core/state.js";
import { getRandomStreamSnapshot } from "../../js/core/random.js";
import { prepareSaveSnapshot } from "../../js/core/save-runtime.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";
import { normalizeMilitaryState } from "../../js/systems/military.js";
import { normalizeNobilityState } from "../../js/systems/nobility.js";
import {
    CAMPAIGN_GOAL,
    MAX_ACTIVE_CAMPAIGNS,
    MAX_ACTIVE_CONTRACTS,
    WAR_AIMS,
    FEUDAL_CONTRACTS,
    createCampaignState,
    createContractState,
    normalizeCampaignState,
    normalizeContractState,
    validateCampaignState,
    validateContractState,
    getCampaignSnapshot,
    getContractSnapshot,
    aimCampaign,
    commitCampaign,
    updateCampaignProgress,
    settleAnnualCampaigns,
    settleReadyCampaigns
} from "../../js/systems/feudal-campaigns.js";

function startRealm(seed = 20261126) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.year = 3;
    state.tick = 0;
    state.resources = { wood: 200, stone: 100, gold: 240, food: 240 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.randomStreams = {};
    state.military = normalizeMilitaryState({ strengthPower: 40, lastMusterYear: 3 });
    state.nobility = normalizeNobilityState({
        houses: [{
            id: "house-test",
            familyName: "Ashford",
            loyalty: 62,
            power: 24,
            levy: 8,
            members: [],
            history: []
        }]
    });
    state.worldMap = {
        kingdoms: [
            { id: "realm-north", name: "Northern March", isCrown: false, regionCount: 3, control: 55, contested: 1 },
            { id: "crown", name: "The Crown", isCrown: true, regionCount: 4, control: 70, contested: 0 }
        ]
    };
}

function openAndCommit(aim = "watch", theatre = "realm-north", houseId = "house-test") {
    const aimed = aimCampaign({ aim, theatre, houseId });
    assert.equal(aimed.ok, true, aimed.reason);
    const committed = commitCampaign(aimed.campaign.id);
    assert.equal(committed.ok, true, committed.reason);
    return committed;
}

test("the registries expose three bounded aims and three distinct contracts", () => {
    assert.deepEqual(Object.keys(WAR_AIMS), ["watch", "relief", "tribute"]);
    assert.deepEqual(Object.keys(FEUDAL_CONTRACTS), ["watch", "relief", "tribute"]);
    assert.equal(WAR_AIMS.watch.contract, "watch");
    assert.equal(WAR_AIMS.relief.contract, "relief");
    assert.equal(WAR_AIMS.tribute.contract, "tribute");
    assert.deepEqual(createCampaignState().active, []);
    assert.deepEqual(createContractState().active, []);
});

test("aim, commit and settle follow the stage guards and pay through the real treasury", () => {
    startRealm();
    const aimed = aimCampaign({ aim: "watch", theatre: "realm-north", houseId: "house-test" });
    assert.equal(aimed.campaign.stage, "aim");
    assert.equal(aimed.snapshot.campaigns.length, 1);
    assert.equal(state.resources.gold, 240);

    const beforeGold = state.resources.gold;
    const committed = commitCampaign(aimed.campaign.id);
    assert.equal(committed.campaign.stage, "committed");
    assert.equal(state.resources.gold, beforeGold - FEUDAL_CONTRACTS.watch.cost.gold);
    assert.equal(commitCampaign(aimed.campaign.id).reason, "campaign-already-committed");
    assert.equal(aimCampaign({ aim: "watch", theatre: "realm-north", houseId: "house-test" }).reason, "aim-already-open");

    assert.equal(settleReadyCampaigns().reason, "no-ready-campaigns");
    for (let tick = 0; tick < 120; tick += 1) updateCampaignProgress();
    const snapshot = getCampaignSnapshot();
    assert.equal(snapshot.campaigns[0].progress, CAMPAIGN_GOAL);
    assert.equal(snapshot.campaigns[0].canSettle, true);
    const settled = settleReadyCampaigns();
    assert.equal(settled.ok, true);
    assert.equal(settled.settled.length, 1);
    assert.equal(state.military.campaigns.active.length, 0);
    assert.equal(state.military.campaigns.history.length, 1);
    assert.equal(state.nobility.contracts.active.length, 0);
    assert.equal(state.nobility.contracts.history.length, 1);
    assert.equal(state.nobility.contracts.history[0].stage, "settled");
});

test("progress is bounded to two active war bands and one scalar per tick", () => {
    startRealm();
    openAndCommit("watch", "realm-north");
    openAndCommit("relief", "realm-south");
    assert.equal(aimCampaign({ aim: "tribute", theatre: "realm-west" }).reason, "campaign-slot-full");
    const before = state.military.campaigns.active.map(entry => entry.progress);
    updateCampaignProgress();
    const after = state.military.campaigns.active.map(entry => entry.progress);
    assert.equal(after.length, 2);
    assert.ok(after.every((value, index) => value > before[index] && value <= CAMPAIGN_GOAL));
    for (let tick = 0; tick < 400; tick += 1) updateCampaignProgress();
    assert.ok(state.military.campaigns.active.every(entry => entry.progress === CAMPAIGN_GOAL));
});

test("annual reconciliation settles a committed campaign even when a long year stalls it", () => {
    startRealm();
    const committed = openAndCommit("tribute");
    state.military.campaigns.active[0].progress = 0;
    state.military.campaigns.active[0].committedYear = state.year - 2;
    const combatBefore = getRandomStreamSnapshot().combat || 0;
    const annual = settleAnnualCampaigns();
    assert.equal(annual.settled.length, 1);
    assert.equal(state.military.campaigns.settlements, 1);
    assert.equal(state.military.campaigns.lastSettledYear, state.year);
    assert.equal(getRandomStreamSnapshot().combat || 0, combatBefore, "campaign settlement must not advance combat RNG");
    assert.ok(state.military.campaigns.history[0].outcome);
    assert.ok(committed.campaign.id.startsWith("campaign-"));
});

test("the same seed and the same campaign produce the same outcome", () => {
    const run = () => {
        startRealm(20261126);
        openAndCommit("relief");
        for (let tick = 0; tick < 160; tick += 1) updateCampaignProgress();
        const result = settleAnnualCampaigns();
        return {
            outcome: result.settled[0].outcome,
            gold: state.resources.gold,
            food: state.resources.food,
            stream: getRandomStreamSnapshot().campaign
        };
    };
    assert.deepEqual(run(), run());
});

test("power and resource gates reject a premature commitment", () => {
    startRealm();
    state.military.strengthPower = 0;
    state.nobility.houses[0].levy = 0;
    state.nobility.houses[0].power = 0;
    state.nobility.warHosts = 0;
    const aimed = aimCampaign({ aim: "tribute", theatre: "realm-north" });
    assert.match(commitCampaign(aimed.campaign.id).reason, /campaign-needs-12-power/);

    state.military.strengthPower = 40;
    state.resources.gold = 0;
    assert.equal(commitCampaign(aimed.campaign.id).reason, "not-enough-gold");
});

test("legacy saves gain empty bounded fields and oversized records are capped", () => {
    const campaigns = normalizeCampaignState({ active: Array.from({ length: 5 }, (_, index) => ({
        id: "campaign-" + index, aim: "watch", theatre: "realm-" + index, stage: "committed"
    })) });
    assert.equal(campaigns.active.length, MAX_ACTIVE_CAMPAIGNS);
    assert.deepEqual(normalizeCampaignState({}).active, []);

    const contracts = normalizeContractState({ active: Array.from({ length: 9 }, (_, index) => ({
        id: "contract-" + index, campaignId: "campaign-" + index, aim: "watch"
    })) });
    assert.equal(contracts.active.length, MAX_ACTIVE_CONTRACTS);
    assert.deepEqual(normalizeContractState({}).active, []);
    assert.equal(normalizeCampaignState({ active: [{ id: "c", aim: "unknown", theatre: "x" }] }).active[0].aim, "watch");
    assert.doesNotThrow(() => validateCampaignState(undefined));
    assert.doesNotThrow(() => validateContractState(undefined));
    assert.throws(() => validateCampaignState({ active: Array(3).fill({}) }), /too many active campaigns/);
    assert.throws(() => validateContractState({ active: Array(7).fill({}) }), /too many active feudal contracts/);
});

test("campaigns and contracts survive a save preflight exactly", () => {
    startRealm();
    openAndCommit("watch");
    updateCampaignProgress();
    const savedMilitary = JSON.parse(JSON.stringify(state.military));
    const savedNobility = JSON.parse(JSON.stringify(state.nobility));
    const prepared = prepareSaveSnapshot({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: state.worldSeed,
        entities: [],
        resources: { ...state.resources },
        incomeThisTick: { ...state.incomeThisTick },
        military: savedMilitary,
        nobility: savedNobility
    });
    assert.deepEqual(prepared.military.campaigns, savedMilitary.campaigns);
    assert.deepEqual(prepared.nobility.contracts, savedNobility.contracts);
    assert.equal(getContractSnapshot().active.length, 1);
});

test("the command deck exposes the three campaign stages", async () => {
    const ui = await readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8");
    assert.match(ui, /data-command="campaign-aim"/);
    assert.match(ui, /data-command="campaign-commit"/);
    assert.match(ui, /data-command="campaign-settle"/);
    assert.match(ui, /FEUDAL CONTRACTS/);
    assert.match(ui, /AIM → COMMIT → SETTLE/);
});

test("save-runtime carries optional nested campaign and contract DTOs without a schema bump", async () => {
    const runtime = await readFile(new URL("../../js/core/save-runtime.js", import.meta.url), "utf8");
    assert.match(runtime, /serializeCampaignDto\(state\.military/);
    assert.match(runtime, /serializeContractDto\(state\.nobility/);
    assert.match(runtime, /restoreCampaignDto\(snapshot\.military\)/);
    assert.match(runtime, /restoreContractDto\(snapshot\.nobility\)/);
    assert.doesNotMatch(runtime, /SAVE_SCHEMA_VERSION \+ 1/);

    startRealm();
    openAndCommit("watch");
    const military = JSON.parse(JSON.stringify(state.military));
    const nobility = JSON.parse(JSON.stringify(state.nobility));
    const prepared = prepareSaveSnapshot({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: state.worldSeed,
        entities: [],
        resources: { ...state.resources },
        incomeThisTick: { ...state.incomeThisTick },
        military,
        nobility
    });
    assert.deepEqual(prepared.military.campaigns, military.campaigns);
    assert.deepEqual(prepared.nobility.contracts, nobility.contracts);
    assert.equal(prepared.saveSchemaVersion, SAVE_SCHEMA_VERSION);

    const legacy = prepareSaveSnapshot({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: state.worldSeed,
        entities: [],
        resources: { ...state.resources },
        incomeThisTick: { ...state.incomeThisTick },
        military: { strengthPower: 10 },
        nobility: { houses: [] }
    });
    assert.deepEqual(normalizeMilitaryState(legacy.military).campaigns.active, []);
    assert.deepEqual(normalizeNobilityState(legacy.nobility).contracts.active, []);
});
