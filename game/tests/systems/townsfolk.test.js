import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { createAppearance, normalizeAppearance, appearanceSwatches, describeAppearance } from "../../js/systems/appearance.js";
import { SKILL_KEYS, createSkills, normalizeSkills, getJobSkill, advanceJobExperience } from "../../js/systems/skills.js";
import { normalizePersonProfile, getPersonSnapshot } from "../../js/systems/people.js";

test("appearance is deterministic, bounded and independent of the people RNG", () => {
    const first = createAppearance("person-aria", { species: "human", sex: "female", role: "resident" });
    const second = createAppearance("person-aria", { species: "human", sex: "female", role: "resident" });
    assert.deepEqual(first, second);
    for (const value of Object.values(first)) assert.ok(Number.isInteger(value) && value >= 0);
    const normalized = normalizeAppearance(first, "person-aria");
    assert.deepEqual(normalized, first);
    assert.equal(appearanceSwatches(first).length, 5);
    assert.match(describeAppearance(first), /skin .* hair .* eyes/);
});

test("legacy people gain normalized appearance and skills without losing their identity", () => {
    resetState();
    state.year = 7;
    state.tick = 1400;
    const entity = { personId: "legacy-1", id: "legacy-1" };
    const legacy = {
        id: "legacy-1", name: "Old Resident", firstName: "Old", familyName: "Resident",
        species: "human", sex: "female", role: "resident", ageYears: 30,
        traits: { curiosity: 75 }, needs: { food: 60 }, goals: ["family"],
        memories: [], relationships: [], kinship: {}, secrets: []
    };
    const profile = normalizePersonProfile(legacy, entity);
    assert.equal(profile.id, "legacy-1");
    assert.equal(profile.name, "Old Resident");
    assert.ok(profile.appearance);
    assert.deepEqual(Object.keys(profile.skills).sort(), [...SKILL_KEYS].sort());
    assert.equal(profile.jobExperience, 0);
    const restored = normalizePersonProfile(JSON.parse(JSON.stringify(profile)), entity);
    assert.deepEqual(restored.appearance, profile.appearance);
    assert.deepEqual(restored.skills, profile.skills);
    entity.person = profile;
    const snapshot = getPersonSnapshot(entity);
    assert.deepEqual(snapshot.appearance, profile.appearance);
    assert.deepEqual(snapshot.skills, profile.skills);
});

test("skills are stable, clamped and improve current job output with experience", () => {
    const traits = { discipline: 80, curiosity: 70, compassion: 30 };
    const skills = createSkills("person-mara", traits);
    assert.deepEqual(skills, createSkills("person-mara", traits));
    assert.deepEqual(Object.keys(skills).sort(), [...SKILL_KEYS].sort());
    const clamped = normalizeSkills({ farming: 140, crafting: -20 }, "person-mara", traits);
    assert.equal(clamped.farming, 100);
    assert.equal(clamped.crafting, 0);
    const person = { skills: { ...skills, farming: 80 }, jobExperience: 20, lifeStage: "adult" };
    const normal = getJobSkill({ person, job: "farmer" });
    person.jobExperience = 80;
    assert.ok(getJobSkill({ person, job: "farmer" }) > normal);
    assert.equal(getJobSkill({ job: "farmer" }), 50);
    person.jobExperience = 99;
    advanceJobExperience(person, "farmer", 3);
    assert.equal(person.jobExperience, 100);
});
