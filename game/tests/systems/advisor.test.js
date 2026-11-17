import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { normalizeCourtState, ensureCourt } from "../../js/systems/court.js";
import {
    ADVISOR_SIGNAL_LIMIT,
    appointRoyalAdvisor,
    buildAdvisorAdvice,
    ensureRoyalAdvisor,
    getAdvisorSnapshot,
    resolveAdvisorAdvice,
    updateAdvisor
} from "../../js/systems/advisor.js";

function preparePerson(entity, overrides = {}) {
    const person = ensurePersonProfile(entity);
    person.species = "human";
    person.ageYears = 34;
    person.lifeStage = "adult";
    person.traits = {
        ambition: 40,
        courage: 60,
        compassion: 60,
        greed: 30,
        sociability: 70,
        discipline: 65,
        curiosity: 55,
        piety: 45,
        distrust: 35,
        patience: 60,
        ...overrides
    };
    person.needs = { food: 60, rest: 60, safety: 60, belonging: 60, purpose: 70 };
    person.relationships = [];
    return person;
}

function startRealm() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 31105;
    state.year = 4;
    state.tick = 400;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    initStartingKingdom();
    state.politics = { legitimacy: 65, factions: { commons: 68, nobility: 58, guilds: 55, clergy: 62 }, settlements: 2 };
    for (const villager of state.entities.filter(entity => entity.type === TYPE.VILLAGER)) preparePerson(villager);
}

beforeEach(() => {
    startRealm();
});

test("the advisor is a named resident and every recommendation cites live state", () => {
    const advisor = ensureRoyalAdvisor();
    assert.ok(advisor);
    const resident = state.entities.find(entity => String(entity.personId) === advisor.personId);
    assert.ok(resident);
    assert.equal(advisor.name, ensurePersonProfile(resident).name);
    assert.ok(["commons", "nobility", "guilds", "clergy"].includes(advisor.faction));
    const advice = buildAdvisorAdvice({ force: true });
    assert.ok(advice);
    assert.ok(advice.evidence.length >= 2);
    for (const item of advice.evidence) {
        assert.ok(item.label);
        assert.ok(String(item.value).length > 0);
    }
    assert.match(advice.evidence.map(item => item.label + " " + item.value).join(" "), /Treasury|Crown food|Garrison|Morale|Pending cases|Guild support/);
});

test("the advisor's counsel is deterministic for the same state and changes with pressure", () => {
    state.resources.food = 10;
    state.foodCrisis = { severity: 80 };
    const first = buildAdvisorAdvice({ force: true });
    const second = buildAdvisorAdvice({ force: true });
    assert.equal(first.kind, second.kind);
    assert.deepEqual(first.evidence, second.evidence);
    assert.equal(first.kind, "granary");
    state.resources.food = 200;
    state.foodCrisis = { severity: 0 };
    state.resources.gold = 5;
    const treasury = buildAdvisorAdvice({ force: true });
    assert.equal(treasury.kind, "levy");
});

test("accepting advice spends its real cost and applies its real effects", () => {
    const advisor = ensureRoyalAdvisor();
    advisor.advice = {
        id: "test-granary",
        kind: "granary",
        title: "Open the crown granary",
        recommendation: "Release food.",
        evidence: [{ label: "Crown food", value: "10 units" }],
        cost: { gold: 8 },
        effects: { resources: { food: 24 }, politics: { commons: 3 }, morale: 1 },
        effectsLabel: "+24 food",
        createdYear: 4,
        createdTick: 400,
        expiresTick: 1000,
        status: "pending",
        confidence: 70,
        bias: "",
        revealed: false,
        outcome: ""
    };
    state.resources.food = 10;
    state.resources.gold = 100;
    state.morale = 50;
    const result = resolveAdvisorAdvice("accept");
    assert.equal(result.ok, true);
    assert.equal(state.resources.food, 34);
    assert.equal(state.resources.gold, 92);
    assert.ok(state.morale > 50);
    assert.equal(result.advice.status, "accepted");
    assert.ok(advisor.memory.some(entry => entry.kind === "decision" && entry.outcome === "accepted"));
});

test("reject, delay and evidence are distinct recorded decisions", () => {
    ensureRoyalAdvisor();
    buildAdvisorAdvice({ force: true });
    const evidence = resolveAdvisorAdvice("evidence");
    assert.equal(evidence.ok, true);
    assert.equal(evidence.advice.status, "evidence");
    assert.equal(evidence.advice.revealed, true);
    const delayed = resolveAdvisorAdvice("delay");
    assert.equal(delayed.ok, true);
    assert.equal(delayed.advice.status, "delayed");
    buildAdvisorAdvice({ force: true });
    const rejected = resolveAdvisorAdvice("reject");
    assert.equal(rejected.ok, true);
    assert.equal(rejected.advice.status, "rejected");
    const snapshot = getAdvisorSnapshot();
    assert.ok(snapshot.memory.some(entry => entry.outcome === "rejected"));
    assert.equal(resolveAdvisorAdvice("accept").ok, false);
});

test("advisor and advice survive court save normalization with bounded memory", () => {
    const advisor = ensureRoyalAdvisor();
    buildAdvisorAdvice({ force: true });
    const saved = JSON.parse(JSON.stringify(ensureCourt()));
    saved.advisor.memory = Array.from({ length: ADVISOR_SIGNAL_LIMIT + 5 }, (_, index) => ({
        id: "signal-" + index,
        year: 4,
        kind: "advice",
        outcome: "recorded",
        text: "Signal " + index
    }));
    const normalized = normalizeCourtState(saved);
    assert.equal(normalized.advisor.personId, advisor.personId);
    assert.ok(normalized.advisor.advice);
    assert.ok(normalized.advisor.advice.evidence.length > 0);
    assert.equal(normalized.advisor.memory.length, ADVISOR_SIGNAL_LIMIT);
    assert.equal(normalized.advisor.memory[0].text, "Signal 0");
});

test("a new advisor can only be appointed from a living adult resident and costs gold", () => {
    const advisor = ensureRoyalAdvisor();
    const candidate = state.entities.find(entity => entity.type === TYPE.VILLAGER && String(entity.personId) !== advisor.personId);
    assert.ok(candidate);
    const before = state.resources.gold;
    const result = appointRoyalAdvisor(candidate.personId);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, before - 8);
    assert.equal(ensureCourt().advisor.personId, String(candidate.personId));
    assert.equal(appointRoyalAdvisor(candidate.personId).ok, false);
});

test("annual updates expire stale counsel and produce fresh advice", () => {
    ensureRoyalAdvisor();
    const advice = buildAdvisorAdvice({ force: true });
    assert.equal(advice.status, "pending");
    state.year += 1;
    const updated = updateAdvisor();
    assert.ok(updated.advice);
    assert.equal(updated.advice.status, "pending");
    assert.notEqual(updated.advice.id, advice.id);
    assert.ok(updated.memory.some(entry => entry.outcome === "expired"));
});
