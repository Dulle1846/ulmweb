import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    createIdentityState,
    normalizeIdentity,
    validateIdentity,
    getFoundingModifiersFor,
    getCultureModifiers,
    applyFoundingProfile,
    CULTURES,
    RELIGIONS,
    TRADITIONS,
    LEGAL_TRADITIONS,
    LEGITIMACY_DOCTRINES,
} from "../../js/systems/identity.js";
import { GOVERNMENT_FORMS, setGovernmentForm } from "../../js/systems/government.js";

const allEffects = () => ({ food: 0, tax: 0, trade: 0, research: 0, military: 0, legitimacy: 0, mortality: 0 });
const rounded = value => Math.round(value * 10000) / 10000;

test("realm identity normalizes every founding choice and keeps neutral defaults", () => {
    resetState();
    const identity = createIdentityState({
        kingdomName: "Avalon", dynastyName: "House Vere", culture: "mercantile",
        religion: "solar", tradition: "guild", law: "common", legitimacy: "consent",
        startProfile: "mercantile", background: "A river compact between three free towns.",
    });
    assert.equal(identity.religion, "solar");
    assert.equal(identity.tradition, "guild");
    assert.equal(identity.law, "common");
    assert.equal(identity.legitimacy, "consent");
    assert.equal(identity.startProfile, "mercantile");
    assert.equal(identity.background, "A river compact between three free towns.");
    assert.equal(validateIdentity(identity), true);

    const defaults = createIdentityState({});
    assert.equal(defaults.religion, "ancestral");
    assert.equal(defaults.tradition, "hearth");
    assert.equal(defaults.law, "customary");
    assert.equal(defaults.legitimacy, "lineage");
    assert.equal(defaults.startProfile, "balanced");
    assert.equal(defaults.background, "");
});

test("founding choices aggregate into the real tax, trade, research, food, legitimacy, military and mortality modifiers", () => {
    const identity = createIdentityState({
        culture: "mercantile", religion: "harvest", tradition: "guild",
        law: "common", legitimacy: "consent",
    });
    const expected = allEffects();
    const chosen = [
        CULTURES[identity.culture], RELIGIONS[identity.religion], TRADITIONS[identity.tradition],
        LEGAL_TRADITIONS[identity.law], LEGITIMACY_DOCTRINES[identity.legitimacy],
    ];
    for (const source of chosen) {
        for (const key of Object.keys(expected)) expected[key] += Number(source[key]) || 0;
    }
    const modifiers = getFoundingModifiersFor(identity);
    assert.equal(modifiers.tax, rounded(expected.tax));
    assert.equal(modifiers.trade, rounded(expected.trade));
    assert.equal(modifiers.research, rounded(expected.research));
    assert.equal(modifiers.military, rounded(expected.military));
    assert.equal(modifiers.foodDemand, rounded(-expected.food));
    assert.equal(modifiers.legitimacy, rounded(expected.legitimacy));
    assert.equal(modifiers.mortality, rounded(expected.mortality));
    assert.equal(modifiers.sources.religion.id, "harvest");

    state.identity = identity;
    const legacyView = getCultureModifiers();
    assert.equal(legacyView.tax, modifiers.tax);
    assert.equal(legacyView.foodDemand, modifiers.foodDemand);
    assert.equal(legacyView.id, "mercantile");
});

test("the neutral default identity contributes no extra modifiers to old gameplay", () => {
    resetState();
    state.identity = createIdentityState({});
    const modifiers = getFoundingModifiersFor(state.identity);
    assert.deepEqual(
        { tax: modifiers.tax, trade: modifiers.trade, research: modifiers.research, military: modifiers.military, foodDemand: modifiers.foodDemand, legitimacy: modifiers.legitimacy, mortality: modifiers.mortality },
        { tax: 0, trade: 0, research: 0, military: 0.03, foodDemand: -0.06, legitimacy: 0, mortality: 0 },
    );
});

test("a starting charter grants real resources and records its choice", () => {
    resetState();
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 50;
    state.politics.legitimacy = 50;
    state.research = { reserve: 0 };
    state.identity = createIdentityState({ startProfile: "mercantile" });
    const result = applyFoundingProfile("mercantile");
    assert.equal(result.ok, true);
    assert.deepEqual(result.resources, { wood: 5, gold: 30 });
    assert.equal(state.resources.gold, 30);
    assert.equal(state.resources.wood, 5);
    assert.equal(state.identity.startProfile, "mercantile");

    resetState();
    state.morale = 50;
    state.politics.legitimacy = 50;
    state.research = { reserve: 0 };
    state.identity = createIdentityState({ startProfile: "sanctuary" });
    applyFoundingProfile("sanctuary");
    assert.equal(state.politics.legitimacy, 52);
    state.identity = createIdentityState({ startProfile: "scholarly" });
    applyFoundingProfile("scholarly");
    assert.equal(state.research.reserve, 12);
});

test("oligarchy and mixed constitution are real supported governments", () => {
    resetState();
    state.resources.gold = 100;
    const oligarchy = setGovernmentForm("oligarchy");
    assert.equal(oligarchy.ok, true);
    assert.equal(state.government.form, "oligarchy");
    assert.ok(GOVERNMENT_FORMS.oligarchy.factions.nobility > GOVERNMENT_FORMS.oligarchy.factions.commons);

    resetState();
    state.resources.gold = 100;
    const mixed = setGovernmentForm("mixed");
    assert.equal(mixed.ok, true);
    assert.equal(state.government.form, "mixed");
    assert.ok(Object.values(GOVERNMENT_FORMS.mixed.factions).every(value => value > 0));
});

test("old saves without the new fields remain valid and normalize additively", () => {
    resetState();
    const oldIdentity = {
        kingdomName: "Old Realm", dynastyName: "Old House", rulerTitle: "Sovereign",
        culture: "frontier", banner: "gold", emblem: "crown",
        motto: "We keep what we build.", foundedYear: 1,
    };
    assert.doesNotThrow(() => validateIdentity(oldIdentity));
    const normalized = normalizeIdentity(JSON.parse(JSON.stringify(oldIdentity)));
    assert.equal(normalized.religion, "ancestral");
    assert.equal(normalized.law, "customary");
    assert.equal(normalized.startProfile, "balanced");
    assert.equal(state.identity.background, "");
});

test("identity and its aggregated modifiers survive a JSON save/load round trip", () => {
    const identity = createIdentityState({
        kingdomName: "Avalon", dynastyName: "House Vere", culture: "scholarly",
        religion: "rational", tradition: "pilgrimage", law: "guild",
        legitimacy: "prosperity", startProfile: "scholarly",
        background: "The archive was founded before the walls.",
    });
    const restored = normalizeIdentity(JSON.parse(JSON.stringify(identity)));
    assert.equal(restored.religion, "rational");
    assert.equal(restored.tradition, "pilgrimage");
    assert.equal(restored.law, "guild");
    assert.equal(restored.legitimacy, "prosperity");
    assert.equal(restored.background, identity.background);
    assert.deepEqual(getFoundingModifiersFor(restored), getFoundingModifiersFor(identity));
});

test("unknown founding choices are rejected instead of silently changing the realm", () => {
    const identity = createIdentityState({});
    assert.throws(() => validateIdentity({ ...identity, religion: "void" }), /Religion/);
    assert.throws(() => validateIdentity({ ...identity, background: "x".repeat(281) }), /background/);
    assert.throws(() => validateIdentity({ ...identity, startProfile: "unknown" }), /profile/);
});
