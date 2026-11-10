import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import {
    ENDEAVOUR_LEGACY_TIER_LIMIT,
    ENDEAVOUR_PATHS,
    ENDEAVOUR_TIER_LIMIT,
    abandonEndeavour,
    createEndeavoursState,
    getEndeavourCandidates,
    getEndeavourModifiers,
    getEndeavourSnapshot,
    normalizeEndeavoursState,
    requiredWork,
    setEndeavourFunding,
    startEndeavour,
    updateEndeavours
} from "../../js/systems/endeavours.js";

function fixture() {
    resetState();
    state.hasStarted = true;
    state.year = 10;
    state.tick = 4000;
    state.resources = { wood: 2000, stone: 2000, gold: 2000, food: 2000 };
    state.morale = 70;
    state.politics = { legitimacy: 65, factions: { commons: 60, nobility: 60, guilds: 60, clergy: 60 }, settlements: 0 };
    state.entities = [];
    for (let index = 0; index < 3; index++) {
        const entity = {
            id: "person-" + index,
            personId: "person-" + index,
            type: TYPE.VILLAGER,
            x: 10 + index,
            y: 10,
            dead: false,
            hp: 100,
            maxHp: 100
        };
        state.entities.push(entity);
        const person = ensurePersonProfile(entity, { role: "resident" });
        person.ageYears = 34 + index;
        person.traits = { ...person.traits, discipline: 80, ambition: 70, sociability: 60, curiosity: 70, piety: 50 };
    }
    normalizeEndeavoursState({});
    return state.endeavours;
}

function advanceYear() {
    state.year++;
    state.tick = state.year * 400;
    return updateEndeavours();
}

test("crown endeavours start only when the stores and an overseer can carry the work", () => {
    const endeavours = fixture();
    const before = { ...state.resources };
    const result = startEndeavour("aqueduct", { funding: 1 });
    assert.equal(result.ok, true);
    assert.ok(endeavours.active);
    assert.equal(endeavours.active.projectId, "aqueduct");
    assert.equal(endeavours.active.tier, 1);
    assert.ok(endeavours.active.overseerName);
    assert.ok(endeavours.active.overseerSkill > 0);
    assert.ok(state.resources.wood < before.wood);
    assert.ok(state.resources.stone < before.stone);
    assert.ok(state.resources.gold < before.gold);
    assert.equal(startEndeavour("bathhouse").ok, false, "only one crown work may be underway");

    const candidates = getEndeavourCandidates();
    assert.ok(candidates.length >= 2);
    assert.ok(candidates[0].skill >= candidates[1].skill);
});

test("the chain unlocks in order and each tier costs and requires more work", () => {
    const endeavours = fixture();
    assert.equal(getEndeavourSnapshot().paths.find(path => path.id === "builder").projects.find(project => project.id === "bathhouse").locked, true);
    assert.equal(startEndeavour("bathhouse").ok, false, "the baths require the aqueduct");

    assert.equal(startEndeavour("aqueduct", { funding: 1 }).ok, true);
    const firstRequired = endeavours.active.required;
    const firstCost = { ...state.resources };
    while (endeavours.active) advanceYear();
    const afterFirst = { ...state.resources };
    assert.equal(endeavours.completed.aqueduct, 1);
    assert.ok(afterFirst.gold < firstCost.gold);

    const project = ENDEAVOUR_PATHS.find(path => path.id === "builder").projects.find(entry => entry.id === "aqueduct");
    const tierTwo = startEndeavour("aqueduct", { funding: 2 });
    assert.equal(tierTwo.ok, true);
    assert.equal(endeavours.active.tier, 2);
    assert.ok(endeavours.active.required > firstRequired);
    assert.ok(state.resources.wood < afterFirst.wood);
    assert.ok(requiredWork(project, 2) > requiredWork(project, 1));
    assert.equal(getEndeavourSnapshot().paths.find(path => path.id === "builder").projects.find(entry => entry.id === "bathhouse").locked, false);
});

test("annual funding changes the pace of the work and completion pays a live modifier", () => {
    fixture();
    startEndeavour("university", { funding: 0 });
    advanceYear();
    const thrifty = state.endeavours.active.lastWork;
    fixture();
    startEndeavour("university", { funding: 2 });
    advanceYear();
    const grand = state.endeavours.active.lastWork;
    assert.ok(grand > thrifty * 2, "grand funding must materially accelerate the work");

    const endeavours = fixture();
    startEndeavour("university", { funding: 2 });
    while (endeavours.active) advanceYear();
    assert.equal(endeavours.completed.university, 1);
    assert.ok(getEndeavourModifiers().research > 0);
    assert.ok(getEndeavourSnapshot().modifiers.research > 0);
    assert.match(getEndeavourSnapshot().history[0].effectsText, /research/);
    assert.ok(state.morale >= 70);
});

test("a completed project can be abandoned without paying a completion", () => {
    const endeavours = fixture();
    startEndeavour("exchange", { funding: 1 });
    assert.equal(abandonEndeavour().ok, true);
    assert.equal(endeavours.active, null);
    assert.equal(endeavours.completed.exchange || 0, 0);
    assert.equal(endeavours.history[0].kind, "abandoned");
});

test("endeavour save state is bounded and older saves load with no works", () => {
    const endeavours = fixture();
    startEndeavour("chancery", { funding: 1 });
    advanceYear();
    const active = JSON.parse(JSON.stringify(endeavours));
    normalizeEndeavoursState({});
    assert.equal(state.endeavours.active, null);
    assert.deepEqual(state.endeavours.completed, {});
    assert.deepEqual(state.endeavours.history, []);

    normalizeEndeavoursState(active);
    assert.equal(state.endeavours.active.projectId, "chancery");
    assert.equal(state.endeavours.active.funding, 1);
    assert.ok(state.endeavours.active.progress > 0);
    assert.ok(state.endeavours.active.required >= state.endeavours.active.progress);

    const clamped = createEndeavoursState({
        completed: { aqueduct: 99, "not-a-project": 4, bathhouse: -2 },
        active: { projectId: "not-a-project", tier: 99 },
        history: [{ projectId: "aqueduct", tier: 99, year: -1, kind: "nonsense" }]
    });
    assert.equal(clamped.completed.aqueduct, ENDEAVOUR_TIER_LIMIT);
    assert.equal(clamped.completed["not-a-project"], undefined);
    assert.equal(clamped.completed.bathhouse, undefined);
    assert.equal(clamped.history.length, 1);
    assert.equal(clamped.history[0].tier, ENDEAVOUR_TIER_LIMIT);

    const legacyClamped = createEndeavoursState({
        completed: { "living-city": 99 },
        active: { projectId: "living-city", tier: 99, required: 1 }
    });
    assert.equal(legacyClamped.completed["living-city"], ENDEAVOUR_LEGACY_TIER_LIMIT);
    assert.equal(legacyClamped.active.tier, ENDEAVOUR_LEGACY_TIER_LIMIT);
});

test("all five paths expose three works and a one-time legacy", () => {
    assert.equal(ENDEAVOUR_PATHS.length, 5);
    const totalTiers = ENDEAVOUR_PATHS.flatMap(path => path.projects)
        .reduce((sum, project) => sum + (project.tierLimit || ENDEAVOUR_TIER_LIMIT), 0);
    assert.equal(totalTiers, 80);
    for (const path of ENDEAVOUR_PATHS) {
        assert.equal(path.projects.length, 4);
        const legacies = path.projects.filter(project => project.legacy);
        assert.equal(legacies.length, 1);
        assert.equal(legacies[0].tierLimit, ENDEAVOUR_LEGACY_TIER_LIMIT);
        assert.equal(legacies[0].requiresMastery, true);
        for (const project of path.projects) {
            assert.ok(project.label && project.description);
            assert.ok(Object.keys(project.effects).length >= 1);
        }
    }
    const endeavours = fixture();
    for (const project of ENDEAVOUR_PATHS.flatMap(path => path.projects)) {
        endeavours.completed[project.id] = project.tierLimit || ENDEAVOUR_TIER_LIMIT;
    }
    const modifiers = getEndeavourModifiers();
    assert.ok(modifiers.tax <= 0.3 + 1e-9);
    assert.ok(modifiers.trade <= 0.25 + 1e-9);
    assert.ok(modifiers.research <= 0.4 + 1e-9);
    assert.ok(modifiers.military <= 0.35 + 1e-9);
    assert.ok(modifiers.health <= 25 + 1e-9);
    assert.ok(modifiers.diplomacy <= 8 + 1e-9);
    assert.equal(modifiers.completed, totalTiers);
});

test("a path legacy unlocks only after all three works are mastered and can be completed once", () => {
    const endeavours = fixture();
    const builder = ENDEAVOUR_PATHS.find(path => path.id === "builder");
    const legacy = builder.projects.find(project => project.legacy);
    let snapshot = getEndeavourSnapshot();
    let legacySnapshot = snapshot.paths.find(path => path.id === "builder").projects.find(project => project.id === legacy.id);
    assert.equal(legacySnapshot.locked, true);
    assert.equal(startEndeavour(legacy.id).ok, false);

    for (const project of builder.projects.filter(project => !project.legacy)) {
        endeavours.completed[project.id] = ENDEAVOUR_TIER_LIMIT;
    }
    snapshot = getEndeavourSnapshot();
    legacySnapshot = snapshot.paths.find(path => path.id === "builder").projects.find(project => project.id === legacy.id);
    assert.equal(legacySnapshot.locked, false);
    assert.equal(legacySnapshot.startable, true);
    assert.equal(legacySnapshot.tierLimit, ENDEAVOUR_LEGACY_TIER_LIMIT);
    assert.equal(startEndeavour(legacy.id, { funding: 2 }).ok, true);
    assert.equal(endeavours.active.tier, 1);
    while (endeavours.active) advanceYear();
    assert.equal(endeavours.completed[legacy.id], 1);
    assert.equal(getEndeavourSnapshot().legaciesCompleted, 1);
    assert.equal(getEndeavourSnapshot().paths.find(path => path.id === "builder").completed, 16);
    assert.equal(startEndeavour(legacy.id).ok, false);
    assert.match(getEndeavourSnapshot().history[0].effectsText, /housing/);
    assert.equal(getEndeavourSnapshot().allLegacies, false);
});

test("all five legacies expose the completed Eternal Crown milestone", () => {
    const endeavours = fixture();
    for (const path of ENDEAVOUR_PATHS) {
        const legacy = path.projects.find(project => project.legacy);
        endeavours.completed[legacy.id] = ENDEAVOUR_LEGACY_TIER_LIMIT;
    }
    const snapshot = getEndeavourSnapshot();
    assert.equal(snapshot.legaciesCompleted, 5);
    assert.equal(snapshot.legaciesTotal, 5);
    assert.equal(snapshot.allLegacies, true);
    assert.equal(snapshot.totalCompleted, 5);
});

test("a vacant overseer slows but does not stop the work", () => {
    const endeavours = fixture();
    startEndeavour("arsenal", { funding: 1 });
    state.entities = state.entities.filter(entity => entity.id !== endeavours.active.overseerId);
    advanceYear();
    assert.ok(endeavours.active.progress > 0);
    assert.ok(endeavours.active.progress < endeavours.active.required);
    assert.equal(endeavours.active.overseerPresent, undefined, "the raw state stores no derived flag");
    assert.equal(getEndeavourSnapshot().active.overseerPresent, false);
});

test("funding can be changed while the work is underway", () => {
    fixture();
    startEndeavour("exchange", { funding: 0 });
    assert.equal(setEndeavourFunding(2).ok, true);
    assert.equal(state.endeavours.active.funding, 2);
    advanceYear();
    assert.ok(state.endeavours.active.lastWork > 0);
});
