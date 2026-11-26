// Bounded envoy-mission proof: one mandate per court, one send per year, a
// deterministic staged negotiation from real envoy skill, Chancellor quality,
// foreign-desk insight and a dedicated RNG stream, and real treaty effects on
// ratification. The nested diplomacy.missions DTO is save-compatible and capped.
import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { getRandomStreamSnapshot } from "../../js/core/random.js";
import { TYPE } from "../../js/core/types.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { getPoliticalSnapshot } from "../../js/systems/politics.js";
import {
    DIPLOMACY_MISSION_LIMIT, DIPLOMACY_MISSION_COST, createDiplomacyState,
    normalizeDiplomacySnapshot, getDiplomacySnapshot, getDiplomaticMissionSnapshot,
    sendEnvoyMission, negotiateEnvoyMission, reportEnvoyMission, ratifyEnvoyMission,
    updateDiplomaticMissions
} from "../../js/systems/diplomacy.js";
import { validateSaveSnapshot, SaveValidationError, SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";

function missionRow(overrides = {}) {
    return {
        id:"diplomacy-mission-1-1", realmId:"northmere", goalTreaty:"trade", stage:"sent",
        envoyId:"envoy-1", envoyName:"Aelia", envoySkill:80, sentYear:1,
        negotiatedYear:0, reportYear:0, expiresYear:5, difficulty:45,
        chancellorGain:1, foreignInsight:20, targetedForeignDesk:false,
        roll:null, score:null, outcome:null, summary:"Envoy sent.", ...overrides
    };
}

function startedRealm(realmId = "northmere") {
    resetState();
    state.hasStarted = true;
    state.year = 1;
    state.tick = 1;
    state.worldSeed = 20261126;
    state.resources = { wood:80, stone:80, gold:120, food:120 };
    state.incomeThisTick = { wood:0, stone:0, gold:0, food:0 };
    state.morale = 70;
    state.diplomacy = createDiplomacyState();
    state.espionage = { agents:[], foreignInsight:0 };
    state.court = { offices:{} };
    state.randomStreams = {};
    const entity = { id:"envoy-1", personId:"envoy-1", type:TYPE.VILLAGER, dead:false };
    ensurePersonProfile(entity);
    entity.person.name = "Aelia";
    entity.person.ageYears = 30;
    entity.person.species = "human";
    entity.person.traits = { sociability:90, patience:80, curiosity:70, distrust:20 };
    state.entities = [entity];
    const realm = state.diplomacy.realms.find(item => item.id === realmId);
    realm.envoyId = "envoy-1";
    realm.envoyName = "Aelia";
    realm.envoySkill = 90;
    realm.envoySinceYear = 1;
    realm.relation = 80;
    realm.trust = 75;
    return { realm, entity };
}

function send(realmId = "northmere", goal = "trade") {
    const result = sendEnvoyMission(realmId, goal);
    assert.equal(result.ok, true, result.reason || "mission must be sent");
    return result.mission;
}

function negotiate(missionId) {
    const result = negotiateEnvoyMission(missionId);
    assert.equal(result.ok, true, result.reason || "negotiation must succeed");
    return result;
}

function report(missionId) {
    const result = reportEnvoyMission(missionId);
    assert.equal(result.ok, true, result.reason || "report must succeed");
    return result;
}

function validSnapshot(overrides = {}) {
    return {
        saveSchemaVersion:SAVE_SCHEMA_VERSION,
        worldSeed:20261126,
        entities:[],
        resources:{ wood:10, stone:10, gold:10, food:10 },
        ...overrides
    };
}

test("diplomacy normalization rebuilds legacy mission fields and bounds malformed mandates", () => {
    const legacy = normalizeDiplomacySnapshot({});
    assert.deepEqual(legacy.missions, []);
    assert.equal(legacy.missionLastUpdateYear, 0);
    assert.equal(legacy.missionLastSendYear, 0);
    assert.equal(legacy.missionCounter, 0);

    const ids = ["northmere", "ironvale", "goldcoast", "redpass"];
    const rows = [
        null,
        "bad",
        missionRow({ id:"bad-goal", goalTreaty:"war" }),
        missionRow({ id:"bad-stage", stage:"done" }),
        missionRow({ id:"bad-envoy", envoyId:"" }),
        ...Array.from({ length:10 }, (_, index) => missionRow({
            id:"mission-" + index,
            realmId:ids[index % ids.length],
            roll:9,
            score:-9999,
            expiresYear:-4,
            summary:"x".repeat(500)
        }))
    ];
    const normalized = normalizeDiplomacySnapshot({ missions:rows, missionCounter:99, missionLastSendYear:4 });
    assert.equal(normalized.missions.length, 4, "four canonical courts mean at most four one-per-realm mandates");
    assert.equal(new Set(normalized.missions.map(item => item.realmId)).size, 4);
    assert.ok(normalized.missions.every(item => item.roll === 1 && item.score === -1000));
    assert.ok(normalized.missions.every(item => item.expiresYear >= item.sentYear + 1));
    assert.equal(normalized.missions[0].summary.length, 240);
    assert.equal(normalized.missionCounter, 99);
    assert.equal(normalized.missionLastSendYear, 4);
});

test("diplomacy snapshot exposes active missions, caps and annual state", () => {
    startedRealm();
    const snapshot = getDiplomacySnapshot();
    assert.deepEqual(snapshot.missions, []);
    assert.deepEqual(snapshot.missionLimits, { active:6, perRealm:1, costGold:6, lifetimeYears:4 });
    assert.equal(snapshot.missionLastSendYear, 0);
    send();
    const active = getDiplomacySnapshot();
    assert.equal(active.missions.length, 1);
    assert.equal(active.missions[0].realmName, "Northmere Guild");
    assert.equal(active.missions[0].goalLabel, "TRADE PACT");
    assert.equal(active.missions[0].nextAction, "NEGOTIATE");
    assert.equal(active.missions[0].canNegotiate, false, "negotiation must wait for the next year");
    assert.equal(getDiplomaticMissionSnapshot()[0].id, active.missions[0].id);
});

test("sending a mission charges once and obeys realm, goal, relation, envoy and annual guards", () => {
    startedRealm();
    assert.equal(sendEnvoyMission("nowhere", "trade").reason, "unknown-realm");
    assert.equal(sendEnvoyMission("northmere", "war").reason, "unknown-mission-goal");
    assert.equal(sendEnvoyMission("northmere", "alliance").reason, "treaty-ladder-closed");
    state.diplomacy.realms[0].relation = 5;
    assert.equal(sendEnvoyMission("northmere", "trade").reason, "relation-too-low-for-mission");
    state.diplomacy.realms[0].relation = 80;
    state.diplomacy.realms[0].envoyId = null;
    assert.equal(sendEnvoyMission("northmere", "trade").reason, "no-living-envoy");
    state.diplomacy.realms[0].envoyId = "envoy-1";
    state.resources.gold = 0;
    assert.equal(sendEnvoyMission("northmere", "trade").reason, "not-enough-gold");

    state.resources.gold = 120;
    const mission = send();
    assert.equal(mission.stage, "sent");
    assert.equal(mission.sentYear, 1);
    assert.equal(state.resources.gold, 120 - DIPLOMACY_MISSION_COST.gold);
    assert.equal(state.incomeThisTick.gold, -DIPLOMACY_MISSION_COST.gold);
    assert.equal(state.diplomacy.missionLastSendYear, 1);
    assert.ok(state.diplomacy.history.some(entry => entry.kind === "mission"));
    assert.equal(sendEnvoyMission("northmere", "trade").reason, "mission-already-active-for-realm");
    const ironvale = state.diplomacy.realms.find(item => item.id === "ironvale");
    ironvale.envoyId = "envoy-1";
    ironvale.envoyName = "Aelia";
    ironvale.envoySkill = 90;
    state.diplomacy.missions.length = 0;
    assert.equal(sendEnvoyMission("ironvale", "trade").reason, "one-mission-per-year");
});

test("negotiation waits a year, reads the settled inputs and advances only the diplomacy stream", () => {
    startedRealm();
    const mission = send();
    assert.equal(negotiateEnvoyMission(mission.id).reason, "negotiation-waits-for-next-year");
    state.year = 2;
    state.diplomacy.realms[0].relation = 84;
    state.diplomacy.realms[0].trust = 66;
    state.espionage.foreignInsight = 40;
    state.espionage.agents = [{ desk:"foreign", targetId:"northmere", turned:false }];
    state.court.offices.chancellor = { competence:100, loyalty:100, integrity:100 };
    state.randomStreams = { simulation:7, combat:11, court:4, council:2, campaign:3, espionage:5 };
    const before = getRandomStreamSnapshot();
    const result = negotiate(mission.id);
    const after = getRandomStreamSnapshot();
    assert.equal(result.roll >= 0 && result.roll < 1, true);
    assert.ok(result.score > 84, "envoy, chancellor and intelligence must improve the score");
    assert.equal(result.difficulty, 45);
    assert.equal(result.outcome, "accepted");
    assert.equal(after.diplomacy, (before.diplomacy || 0) + 1);
    for (const [name, value] of Object.entries(before)) {
        if (name !== "diplomacy") assert.equal(after[name], value, name + " must keep its draw order");
    }
    assert.equal(negotiateEnvoyMission(mission.id).reason, "mission-not-ready-for-negotiation");
});

test("the same seed and settled inputs replay the exact negotiation", () => {
    function run() {
        startedRealm();
        send();
        state.year = 2;
        state.diplomacy.realms[0].relation = 75;
        state.diplomacy.realms[0].trust = 60;
        state.espionage.foreignInsight = 33;
        state.randomStreams = { diplomacy:2 };
        const result = negotiate(state.diplomacy.missions[0].id);
        return { roll:result.roll, score:result.score, outcome:result.outcome };
    }
    assert.deepEqual(run(), run());
});

test("a rejected court report closes the mandate with a bounded political scar", () => {
    startedRealm();
    const mission = send();
    state.year = 2;
    negotiate(mission.id);
    state.diplomacy.missions[0].score = 0;
    state.diplomacy.missions[0].outcome = "rejected";
    const before = getPoliticalSnapshot();
    const relation = state.diplomacy.realms[0].relation;
    const trust = state.diplomacy.realms[0].trust;
    const morale = state.morale;
    assert.equal(reportEnvoyMission(mission.id).reason, "report-waits-for-next-year");
    state.year = 3;
    const result = report(mission.id);
    assert.equal(result.rejected, true);
    assert.equal(state.diplomacy.missions.length, 0);
    assert.equal(state.diplomacy.realms[0].treaty, "none");
    assert.ok(state.diplomacy.realms[0].relation < relation);
    assert.ok(state.diplomacy.realms[0].trust < trust);
    assert.ok(getPoliticalSnapshot().legitimacy < before.legitimacy);
    assert.ok(state.morale < morale);
    assert.ok(state.diplomacy.history.some(entry => entry.kind === "mission" && /closed|refused/.test(entry.summary)));
});

test("an accepted trade report is ratified into the real treaty without a second signing fee", () => {
    const { realm } = startedRealm();
    const mission = send();
    const goldAfterSend = state.resources.gold;
    state.year = 2;
    negotiate(mission.id);
    state.year = 3;
    const filed = report(mission.id);
    assert.equal(filed.mission.stage, "reported");
    assert.equal(ratifyEnvoyMission(mission.id).reason, "ratification-waits-for-next-year");
    state.year = 4;
    const beforeRelation = realm.relation;
    const result = ratifyEnvoyMission(mission.id);
    assert.equal(result.ok, true);
    assert.equal(realm.treaty, "trade");
    assert.equal(realm.treatySinceYear, 4);
    assert.ok(realm.relation > beforeRelation);
    assert.equal(state.diplomacy.missions.length, 0);
    assert.equal(state.resources.gold, goldAfterSend, "ratification must not pay the direct treaty fee again");
    assert.ok(state.diplomacy.history.some(entry => entry.kind === "treaty" && /RATIFIED/.test(entry.summary)));
});

test("an alliance mission follows the trade ladder and changes morale on ratification", () => {
    const { realm } = startedRealm();
    realm.treaty = "trade";
    realm.relation = 95;
    realm.trust = 95;
    const mission = send("northmere", "alliance");
    assert.equal(mission.goalTreaty, "alliance");
    state.year = 2;
    negotiate(mission.id);
    state.year = 3;
    report(mission.id);
    state.year = 4;
    const morale = state.morale;
    const result = ratifyEnvoyMission(mission.id);
    assert.equal(result.ok, true);
    assert.equal(realm.treaty, "alliance");
    assert.equal(realm.treatySinceYear, 4);
    assert.ok(state.morale > morale);
    assert.equal(state.resources.gold, 120 - DIPLOMACY_MISSION_COST.gold);
});

test("the annual mission audit closes expired, war-torn and envoy-less mandates exactly once", () => {
    startedRealm();
    const expired = send();
    assert.equal(updateDiplomaticMissions().annual, true);
    assert.equal(state.diplomacy.missionLastUpdateYear, 1);
    assert.equal(updateDiplomaticMissions().annual, false, "the audit must not run twice in one year");
    state.year = 6;
    const result = updateDiplomaticMissions();
    assert.equal(result.closed, 1);
    assert.equal(state.diplomacy.missions.length, 0);
    assert.equal(result.annual, true);

    state.resources.gold = 120;
    state.year = 7;
    const warMission = send();
    state.diplomacy.realms[0].treaty = "war";
    state.year = 8;
    const warAudit = updateDiplomaticMissions();
    assert.equal(warAudit.closed, 1);
    assert.ok(!state.diplomacy.missions.some(item => item.id === warMission.id));

    state.diplomacy.realms[0].treaty = "none";
    state.resources.gold = 120;
    state.year = 9;
    send();
    state.entities[0].dead = true;
    state.year = 10;
    const deadAudit = updateDiplomaticMissions();
    assert.equal(deadAudit.closed, 1);
    assert.equal(state.diplomacy.missions.length, 0);
});

test("the nested mandate survives JSON normalization without a schema bump", () => {
    startedRealm();
    const mission = send();
    const before = JSON.parse(JSON.stringify(state.diplomacy));
    const restored = normalizeDiplomacySnapshot(JSON.parse(JSON.stringify(before)));
    assert.equal(restored.version, 1);
    assert.deepEqual(restored.missions, before.missions);
    assert.equal(restored.missions[0].id, mission.id);
    assert.equal(restored.missionCounter, 1);
});

test("import validation rejects oversized, malformed and duplicated mission DTOs", () => {
    const validMission = missionRow();
    assert.equal(validateSaveSnapshot(validSnapshot({
        diplomacy:{ realms:[], missions:[validMission], missionCounter:1 }
    })), true);
    assert.throws(
        () => validateSaveSnapshot(validSnapshot({
            diplomacy:{ realms:[], missions:Array.from({ length:7 }, (_, index) => missionRow({ id:"m" + index })) }
        })),
        error => error instanceof SaveValidationError && error.code === "INVALID_DIPLOMACY_MISSIONS"
    );
    assert.throws(
        () => validateSaveSnapshot(validSnapshot({ diplomacy:{ realms:[], missions:[missionRow({ realmId:"nowhere" })] } })),
        error => error instanceof SaveValidationError && error.code === "INVALID_DIPLOMACY_MISSION"
    );
    assert.throws(
        () => validateSaveSnapshot(validSnapshot({ diplomacy:{ realms:[], missions:[validMission, validMission] } })),
        error => error instanceof SaveValidationError && error.code === "INVALID_DIPLOMACY_MISSION"
    );
    assert.throws(
        () => validateSaveSnapshot(validSnapshot({ diplomacy:{ realms:[], missions:[missionRow({ roll:2 })] } })),
        error => error instanceof SaveValidationError && error.code === "INVALID_DIPLOMACY_MISSION_ROLL"
    );
});
