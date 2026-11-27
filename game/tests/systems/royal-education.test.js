// Bounded royal-education proof: one Tutor, three active students, authored
// curricula, annual tutelage with no random draw, a coming-of-age audience with
// advertised effects, and a save-compatible optional royal.education DTO.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { resetRandomStreams, getRandomStreamSnapshot } from "../../js/core/random.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import { createIdentityState } from "../../js/systems/identity.js";
import { createResearchState } from "../../js/systems/research.js";
import { createLegacyState } from "../../js/systems/legacy.js";
import { normalizeGovernment } from "../../js/systems/government.js";
import { appointRoyalConsort, createRoyalChild, normalizeRoyalState } from "../../js/systems/royal-dynasty.js";
import { createSaveSnapshot, prepareSaveSnapshot } from "../../js/core/save-runtime.js";
import {
    ROYAL_CURRICULA, ROYAL_EDUCATION_HISTORY_LIMIT, ROYAL_EDUCATION_LIMIT,
    ROYAL_TUTOR_COST, normalizeRoyalEducationState, appointRoyalTutor,
    enrollRoyalStudent, updateRoyalEducation, holdRoyalAudience,
    dismissRoyalStudent, getRoyalEducationSnapshot
} from "../../js/systems/royal-education.js";

function preparePerson(entity, ageYears = 30) {
    const person = ensurePersonProfile(entity);
    person.species = "human";
    person.ageYears = ageYears;
    person.lifeStage = ageYears >= 16 ? "adult" : "young";
    person.traits = {
        ambition: 60, courage: 60, compassion: 55, greed: 30, sociability: 60,
        discipline: 65, curiosity: 50, piety: 45, distrust: 30, patience: 60
    };
    person.needs = { food: 60, rest: 60, safety: 60, belonging: 60, purpose: 65 };
    return person;
}

function startRealm() {
    resetState();
    resetRandomStreams();
    state.worldSeed = 20261127;
    state.hasStarted = true;
    state.year = 1;
    state.tick = 100;
    state.resources = { wood: 200, stone: 200, gold: 400, food: 400 };
    const size = 80;
    state.worldW = size;
    state.worldH = size;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = size;
    state.terrainPixH = size;
    state.heightMap = new Float32Array(size * size).fill(0.62);
    state.moistureMap = new Float32Array(size * size).fill(0.45);
    state.temperatureMap = new Float32Array(size * size).fill(0.55);
    state.explored = Array.from({ length: size }, () => Array(size).fill(false));
    generateResourceGeography(state.worldSeed);
    initStartingKingdom();
    state.identity = createIdentityState({ kingdomName: "Education Realm", dynastyName: "Royal House", foundedYear: 1 });
    state.kingdomName = state.identity.kingdomName;
    state.royal.dynastyName = state.identity.dynastyName;
    state.research = createResearchState();
    state.legacy = createLegacyState({ foundedYear: 1 });
    state.government = normalizeGovernment({ form: "feudal", taxRate: 10, succession: "primogeniture" });
    state.politics = {
        legitimacy: 60,
        factions: { commons: 60, nobility: 60, guilds: 55, clergy: 55 },
        settlements: 0
    };
    const villagers = state.entities.filter(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
    for (const villager of villagers) preparePerson(villager);
    return { king: state.entities.find(entity => entity.isKing), villagers };
}

function royalHousehold() {
    const { king, villagers } = startRealm();
    const consort = villagers[0];
    assert.equal(appointRoyalConsort(consort.personId).ok, true);
    const child = createRoyalChild().child;
    assert.ok(child);
    preparePerson(child, 18);
    return { king, consort, child, villagers };
}

beforeEach(() => resetState());

test("the authored curricula and the optional DTO stay bounded", () => {
    assert.deepEqual(Object.keys(ROYAL_CURRICULA), ["letters", "stewardship", "command", "law"]);
    assert.deepEqual(Object.values(ROYAL_CURRICULA).map(course => course.years), [3, 4, 5, 4]);
    const empty = normalizeRoyalEducationState(null);
    assert.deepEqual(empty.students, []);
    assert.deepEqual(empty.history, []);
    assert.equal(empty.tutorId, null);

    const students = Array.from({ length: ROYAL_EDUCATION_LIMIT + 2 }, (_, index) => ({
        id: "student-" + index,
        personId: "person-" + index,
        curriculumId: "letters",
        stage: "tutelage",
        startYear: 1,
        yearsTaught: 1
    }));
    const capped = normalizeRoyalEducationState({
        students,
        history: Array.from({ length: ROYAL_EDUCATION_HISTORY_LIMIT + 3 }, () => ({ year: 1, kind: "x", detail: "x" }))
    });
    assert.equal(capped.students.length, ROYAL_EDUCATION_LIMIT);
    assert.equal(capped.history.length, ROYAL_EDUCATION_HISTORY_LIMIT);
    assert.equal(capped.students[0].yearsRequired, 3);
});

test("a Tutor costs gold, is required before enrolment, and the active roster is capped", () => {
    const { child, consort, villagers } = royalHousehold();
    assert.equal(enrollRoyalStudent(child.personId, "letters").reason, "tutor-required");
    assert.equal(enrollRoyalStudent(child.personId, "unknown").reason, "unknown-curriculum");

    const tutor = villagers.find(entity => entity !== consort);
    const before = state.resources.gold;
    const appointed = appointRoyalTutor(tutor.personId);
    assert.equal(appointed.ok, true);
    assert.equal(appointed.tutor.name, ensurePersonProfile(tutor).name);
    assert.equal(state.resources.gold, before - ROYAL_TUTOR_COST);
    assert.match(appointed.message, /ROYAL TUTOR APPOINTED/);

    const goldAfterTutor = state.resources.gold;
    const enrolled = enrollRoyalStudent(child.personId, "letters");
    assert.equal(enrolled.ok, true);
    assert.equal(enrolled.student.curriculumId, "letters");
    assert.equal(state.resources.gold, goldAfterTutor - 6);
    assert.equal(enrollRoyalStudent(child.personId, "law").reason, "already-in-tutelage");

    const snapshot = getRoyalEducationSnapshot();
    assert.equal(snapshot.tutorPresent, true);
    assert.equal(snapshot.active, 1);
    assert.equal(snapshot.students[0].name, ensurePersonProfile(child).name);
    assert.equal(snapshot.children.some(entry => entry.id === child.personId), false);
    assert.equal(snapshot.ready, 0);
});

test("annual tutelage is bounded, needs both study and age, and ends in a real audience", () => {
    const { child, consort, villagers } = royalHousehold();
    const tutor = villagers.find(entity => entity !== consort);
    assert.equal(appointRoyalTutor(tutor.personId).ok, true);
    const student = enrollRoyalStudent(child.personId, "letters").student;
    const streamsBefore = getRandomStreamSnapshot();

    assert.equal(updateRoyalEducation().changed, false, "a repeated year must not advance tutelage");
    state.year = 2;
    let annual = updateRoyalEducation();
    assert.equal(annual.advanced, 1);
    assert.equal(state.royal.education.students[0].yearsTaught, 1);
    assert.equal(state.royal.education.students[0].stage, "tutelage");
    state.year = 3;
    updateRoyalEducation();
    assert.equal(state.royal.education.students[0].yearsTaught, 2);

    child.person.ageYears = 10;
    state.year = 4;
    annual = updateRoyalEducation();
    assert.deepEqual(annual.ready, [], "a finished course still waits for coming of age");
    assert.equal(state.royal.education.students[0].stage, "tutelage");

    child.person.ageYears = 18;
    state.year = 5;
    annual = updateRoyalEducation();
    assert.deepEqual(annual.ready, [student.id]);
    assert.equal(state.royal.education.students[0].stage, "ready");
    assert.equal(getRoyalEducationSnapshot().ready, 1);
    assert.deepEqual(getRandomStreamSnapshot(), streamsBefore, "authored tutelage must not draw a random number");

    const politicsBefore = JSON.parse(JSON.stringify(state.politics));
    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    const memoryBefore = ensurePersonProfile(child).memories.length;
    const result = holdRoyalAudience(student.id);
    assert.equal(result.ok, true);
    assert.equal(result.office, "Royal Chancellor");
    assert.equal(state.resources.gold, goldBefore - 18 + 6);
    assert.equal(state.resources.food, foodBefore - 12);
    assert.equal(state.politics.legitimacy, politicsBefore.legitimacy + 1.5);
    assert.equal(state.politics.factions.nobility, politicsBefore.factions.nobility + 0.8);
    assert.equal(state.politics.factions.guilds, politicsBefore.factions.guilds + 0.4);
    assert.equal(ensurePersonProfile(child).role, "Royal Chancellor");
    assert.equal(ensurePersonProfile(child).memories.length, memoryBefore + 1);
    assert.equal(state.royal.education.students[0].stage, "completed");
    assert.equal(state.royal.education.students[0].audienceYear, 5);
    assert.equal(state.royal.education.audienceCounter, 1);
    assert.ok(state.royal.education.history.some(entry => entry.kind === "audience"));
    assert.equal(holdRoyalAudience(student.id).reason, "audience-not-ready");
});

test("tutelage survives succession and a save/load without a schema bump", () => {
    const { child, consort, villagers } = royalHousehold();
    assert.equal(appointRoyalTutor(villagers.find(entity => entity !== consort).personId).ok, true);
    const student = enrollRoyalStudent(child.personId, "stewardship").student;
    state.year = 2;
    updateRoyalEducation();

    const beforeDossier = JSON.parse(JSON.stringify(state.royal.education));
    const snapshot = JSON.parse(JSON.stringify(createSaveSnapshot()));
    assert.equal(snapshot.saveSchemaVersion, 15);
    assert.deepEqual(snapshot.royal.education, beforeDossier);
    const prepared = prepareSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
    assert.equal(prepared.saveSchemaVersion, 15);
    normalizeRoyalState(prepared.royal);
    assert.deepEqual(state.royal.education, beforeDossier);

    const malformed = JSON.parse(JSON.stringify(snapshot));
    for (let index = 0; index < ROYAL_EDUCATION_LIMIT; index++) {
        malformed.royal.education.students.push({
            ...malformed.royal.education.students[0],
            id: "overflow-" + index,
            personId: "overflow-person-" + index
        });
    }
    assert.throws(() => prepareSaveSnapshot(malformed), /invalid royal education dossier/i);

    state.year = 3;
    updateRoyalEducation();
    assert.equal(state.royal.education.students[0].yearsTaught, 2);
    assert.equal(state.royal.education.students[0].personId, student.personId);
    assert.equal(dismissRoyalStudent(student.id).ok, true);
    assert.equal(state.royal.education.students[0].stage, "dismissed");
});
