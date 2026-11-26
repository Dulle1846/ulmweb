// Bounded council docket proof: one proposal and one paid lobby per year, an
// annual vote with an isolated RNG stream, real faction/ledger effects and an
// optional nested government DTO that survives normalization and save/load.
import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { getRandomStreamSnapshot } from "../../js/core/random.js";
import { normalizeGovernment } from "../../js/systems/government.js";
import { getPoliticalSnapshot } from "../../js/systems/politics.js";
import {
    COUNCIL_BILLS, COUNCIL_DOCKET_LIMIT, COUNCIL_HISTORY_LIMIT,
    createCouncilState, normalizeCouncilState, getCouncilSnapshot,
    proposeCouncilBill, lobbyCouncilBill, callCouncilVote, updateCouncilDocket
} from "../../js/systems/council-laws.js";

function startedRealm() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 20261126;
    state.resources = { wood: 180, stone: 95, gold: 75, food: 120 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    return normalizeGovernment();
}

function proposeBill(id = "bread-ordinance") {
    const result = proposeCouncilBill(id);
    assert.equal(result.ok, true, result.reason || "proposal must succeed");
    return result.bill;
}

function lobbyBill(id) {
    const row = id ? state.government.council.docket.find(entry => entry.billId === id) : state.government.council.docket[0];
    assert.ok(row, "the bill must be on the docket");
    const result = lobbyCouncilBill(row.id);
    assert.equal(result.ok, true, result.reason || "lobby must succeed");
    return result.bill;
}

function row(overrides = {}) {
    return normalizeCouncilState({
        docket: [{
            id: "bill-1-1", billId: "bread-ordinance", stage: "lobbied",
            proposedYear: 1, lobbyYear: 1, support: 70, opposition: 55,
            threshold: 50, supporters: ["commons"], opponents: ["guilds"], ...overrides
        }]
    }).docket[0];
}

test("council normalization bounds malformed dockets, history and counters", () => {
    const council = normalizeCouncilState({
        docket: [null, "bad", { billId: "unknown-law", stage: "weird", support: 999, opposition: -5 }, row(), row({ id: "bill-1-2" }), row({ id: "bill-1-3" })],
        history: Array.from({ length: 30 }, (_, index) => ({ billId: "nope", stage: "odd", roll: 9, margin: -999, summary: "x".repeat(500) })),
        counters: { proposals: -3, lobbies: 1.9, votes: "bad", enacted: 2, rejected: 1 },
        lastProposalYear: -4, lastLobbyYear: "x", lastVoteYear: 1.8
    });
    assert.equal(council.version, 1);
    assert.equal(council.docket.length, COUNCIL_DOCKET_LIMIT);
    assert.equal(council.docket[0].billId, "bread-ordinance");
    assert.equal(council.docket[0].stage, "proposed");
    assert.equal(council.docket[0].support, 100);
    assert.equal(council.history.length, COUNCIL_HISTORY_LIMIT);
    assert.equal(council.history[0].billId, "bread-ordinance");
    assert.equal(council.history[0].stage, "rejected");
    assert.equal(council.history[0].roll, 1);
    assert.equal(council.history[0].margin, -100);
    assert.equal(council.history[0].summary.length, 240);
    assert.deepEqual(council.counters, { proposals: 0, lobbies: 1, votes: 0, enacted: 2, rejected: 1 });
    assert.equal(council.lastProposalYear, 0);
    assert.equal(council.lastLobbyYear, 0);
    assert.equal(council.lastVoteYear, 1);
    assert.deepEqual(createCouncilState().docket, []);
});

test("government normalization keeps the optional council DTO instead of dropping it", () => {
    const government = startedRealm();
    government.council = normalizeCouncilState({ docket: [row()], history: [] });
    const normalized = normalizeGovernment();
    assert.equal(normalized.council, state.government.council);
    assert.equal(normalized.council.docket.length, 1);
    assert.equal(normalized.council.docket[0].billId, "bread-ordinance");
});

test("proposal guards reject unknown bills, unstarted realms, duplicates and a full docket", () => {
    startedRealm();
    assert.equal(proposeCouncilBill("not-a-bill").reason, "unknown-council-bill");
    resetState();
    assert.equal(proposeCouncilBill("bread-ordinance").reason, "realm-not-started");

    startedRealm();
    const bill = proposeBill("bread-ordinance");
    assert.equal(bill.stage, "proposed");
    assert.equal(bill.proposedYear, 1);
    assert.ok(bill.threshold > 0 && bill.threshold < 100);
    assert.equal(proposeCouncilBill("guild-charter").reason, "one-proposal-per-year");
    state.government.council.lastProposalYear = 0;
    assert.equal(proposeCouncilBill("bread-ordinance").reason, "bill-already-on-docket");

    state.government.council.docket = [row({ id: "a" }), row({ id: "b", billId: "guild-charter" }), row({ id: "c", billId: "march-levy" })];
    assert.equal(proposeCouncilBill("temple-relief").reason, "docket-full");
    assert.equal(state.government.council.docket.length, COUNCIL_DOCKET_LIMIT);
});

test("a paid lobby spends real stores, raises declared support and cannot repeat in one year", () => {
    startedRealm();
    const bill = proposeBill("bread-ordinance");
    const before = { gold: state.resources.gold, food: state.resources.food, support: bill.support };
    const lobbied = lobbyBill();
    assert.equal(lobbied.stage, "lobbied");
    assert.equal(lobbied.lobbyYear, 1);
    assert.equal(state.resources.gold, before.gold - COUNCIL_BILLS["bread-ordinance"].cost.gold);
    assert.equal(state.resources.food, before.food - COUNCIL_BILLS["bread-ordinance"].cost.food);
    assert.equal(state.incomeThisTick.gold, -COUNCIL_BILLS["bread-ordinance"].cost.gold);
    assert.equal(state.incomeThisTick.food, -COUNCIL_BILLS["bread-ordinance"].cost.food);
    assert.ok(lobbied.support > before.support);
    assert.equal(lobbyCouncilBill(lobbied.id).reason, "bill-already-lobbied");

    state.government.council.docket.push(row({ id: "bill-1-2", billId: "guild-charter", stage: "proposed" }));
    assert.equal(lobbyCouncilBill("bill-1-2").reason, "one-lobby-per-year");
});

test("lobby affordability is checked before any resource is spent", () => {
    startedRealm();
    state.resources.gold = 0;
    const bill = proposeBill("march-levy");
    assert.equal(lobbyCouncilBill(bill.id).reason, "not-enough-resources");
    assert.equal(bill.stage, "proposed");
    assert.equal(state.resources.gold, 0);
});

test("a crown vote waits for the next year, then enforces a supported bill", () => {
    startedRealm();
    const bill = proposeBill("bread-ordinance");
    lobbyBill();
    assert.equal(callCouncilVote(bill.id).reason, "vote-waits-for-next-year");

    state.year = 2;
    const politics = getPoliticalSnapshot();
    const morale = state.morale;
    const streams = getRandomStreamSnapshot();
    state.government.council.docket[0].support = 100;
    state.government.council.docket[0].threshold = 1;
    const result = callCouncilVote(bill.id);
    assert.equal(result.ok, true);
    assert.equal(result.result, "enacted");
    assert.equal(result.record.roll >= 0 && result.record.roll < 1, true);
    assert.equal(result.record.margin >= 95, true);
    assert.equal(state.government.council.docket.length, 0);
    assert.equal(state.government.council.history.length, 1);
    assert.equal(state.government.history.filter(entry => entry.kind === "council-law").length, 1);
    assert.equal(state.government.decrees, 1);
    assert.ok(getPoliticalSnapshot().factions.commons > politics.factions.commons);
    assert.ok(state.morale > morale);
    assert.equal(state.government.council.counters.enacted, 1);
    assert.equal(state.government.council.counters.votes, 1);
    assert.equal(getRandomStreamSnapshot().council, (streams.council || 0) + 1);
    assert.equal(callCouncilVote(bill.id).reason, "bill-not-on-docket");
});

test("an unsupported bill is rejected with a bounded political scar", () => {
    startedRealm();
    const bill = proposeBill("guild-charter");
    lobbyBill();
    state.year = 2;
    state.government.council.docket[0].support = 0;
    state.government.council.docket[0].threshold = 100;
    const legitimacy = state.politics.legitimacy;
    const result = callCouncilVote(bill.id);
    assert.equal(result.result, "rejected");
    assert.ok(state.politics.legitimacy < legitimacy);
    assert.equal(state.government.council.counters.rejected, 1);
    assert.equal(state.government.decrees, 0);
    assert.equal(state.government.history[0].result, "rejected");
});

test("the annual session settles lobbied bills once and leaves proposed bills alone", () => {
    startedRealm();
    proposeBill("bread-ordinance");
    lobbyBill();
    state.year = 2;
    const annual = updateCouncilDocket();
    assert.equal(annual.annual, true);
    assert.equal(annual.settled.length, 1);
    assert.equal(annual.council.docket.length, 0);
    assert.equal(annual.council.lastVoteYear, 2);
    assert.equal(updateCouncilDocket().settled.length, 0, "a second call in the same year must not vote twice");

    state.year = 3;
    const next = proposeBill("temple-relief");
    assert.equal(next.stage, "proposed");
    const quiet = updateCouncilDocket();
    assert.equal(quiet.settled.length, 0);
    assert.equal(quiet.council.docket.length, 1);
});

test("only the council stream advances; combat, court and simulation counters stay untouched", () => {
    startedRealm();
    proposeBill("bread-ordinance");
    lobbyBill();
    state.year = 2;
    state.randomStreams = { simulation: 7, combat: 11, court: 4, campaign: 2 };
    const before = getRandomStreamSnapshot();
    const result = updateCouncilDocket();
    assert.equal(result.settled.length, 1);
    const after = getRandomStreamSnapshot();
    assert.equal(after.council, 1);
    for (const [name, value] of Object.entries(before)) {
        if (name !== "council") assert.equal(after[name], value, name + " must keep its draw order");
    }
});

test("snapshots expose real bills, votes and bounded totals for the player", () => {
    startedRealm();
    const snapshot = getCouncilSnapshot();
    assert.equal(snapshot.seats, 3);
    assert.equal(snapshot.year, 1);
    assert.equal(snapshot.bills.length, 4);
    assert.ok(snapshot.bills.every(bill => bill.supporters.length > 0 && bill.opponents.length > 0 && bill.cost));
    assert.equal(snapshot.docket.length, 0);
    assert.deepEqual(snapshot.limits, { docket: COUNCIL_DOCKET_LIMIT, history: COUNCIL_HISTORY_LIMIT });

    const bill = proposeBill("march-levy");
    lobbyBill();
    const ready = getCouncilSnapshot().docket[0];
    assert.equal(ready.id, bill.id);
    assert.equal(ready.stage, "lobbied");
    assert.equal(ready.voteNote, "The vote opens next year.");
    assert.equal(ready.canVote, false);
    assert.ok(ready.cost.gold > 0 && ready.enforcement.length > 20);
    assert.equal(getCouncilSnapshot().bills.filter(item => item.onDocket).length, 1);
});

test("the nested DTO survives JSON save normalization without a schema change", () => {
    startedRealm();
    proposeBill("bread-ordinance");
    lobbyBill();
    state.year = 2;
    updateCouncilDocket();
    const before = JSON.parse(JSON.stringify(state.government.council));
    const restored = normalizeCouncilState(JSON.parse(JSON.stringify(before)));
    assert.deepEqual(restored, before);
    assert.equal(restored.history.length, 1);
    assert.equal(restored.counters.votes, 1);
    assert.equal(JSON.parse(JSON.stringify(normalizeGovernment(state.government))).council.counters.votes, 1);
});
