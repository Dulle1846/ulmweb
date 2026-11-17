import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import { normalizeGovernment } from "../../js/systems/government.js";
import { resetRandomStreams } from "../../js/core/random.js";
import {
    appointRoyalConsort,
    createRoyalChild,
    getRoyalPerson,
    normalizeRoyalState,
    updateRoyalSuccession
} from "../../js/systems/royal-dynasty.js";
import { getNobilitySnapshot } from "../../js/systems/nobility.js";
import {
    abdicateThrone,
    appointRegent,
    concedeCrown,
    getRoyalCrisisSnapshot,
    pressClaim,
    settleClaim,
    suppressCivilConflict,
    updateRoyalCrisis
} from "../../js/systems/royal-crisis.js";

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
    person.relationships = [];
    return person;
}

function startRealm() {
    resetState();
    resetRandomStreams();
    state.worldSeed = 20261117;
    state.hasStarted = true;
    state.year = 4;
    state.tick = 400;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    initStartingKingdom();
    state.government = normalizeGovernment({ form: "feudal", taxRate: 10, succession: "primogeniture" });
    state.politics = { legitimacy: 60, factions: { commons: 60, nobility: 60, guilds: 55, clergy: 55 }, settlements: 0 };
    for (const villager of state.entities.filter(entity => entity.type === TYPE.VILLAGER)) preparePerson(villager);
    getNobilitySnapshot();
    return state.entities.find(entity => entity.isKing) || null;
}

function minorRealm() {
    const king = startRealm();
    const consort = state.entities.find(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
    assert.ok(consort, "the realm must contain an eligible consort");
    preparePerson(consort, 30);
    assert.equal(appointRoyalConsort(consort.personId).ok, true);
    const child = createRoyalChild().child;
    assert.ok(child);
    child.person.ageYears = 0;
    child.person.lifeStage = "young";
    king.dead = true;
    state.personArchive.push({
        personId: king.personId,
        isKing: true,
        person: JSON.parse(JSON.stringify(king.person))
    });
    const succession = updateRoyalSuccession();
    assert.equal(succession.changed, true);
    assert.equal(succession.minor, true);
    assert.equal(child.isKing, true);
    const snapshot = getRoyalCrisisSnapshot();
    return { king, consort, child, succession, snapshot };
}

function activeClaim(snapshot) {
    const claim = snapshot.pressingClaims[0];
    assert.ok(claim, "the regency must expose at least one pressing claim");
    return claim;
}

function failedPress() {
    const realm = minorRealm();
    const claim = activeClaim(realm.snapshot);
    state.politics.legitimacy = 60;
    const stored = state.royal.claims.find(entry => entry.id === claim.id);
    stored.support = 5;
    stored.claimStrength = 5;
    const result = pressClaim(claim.id);
    assert.equal(result.ok, true);
    assert.equal(result.success, false);
    assert.equal(state.royal.civilConflict.active, true);
    return { ...realm, claim, result };
}

beforeEach(() => {
    startRealm();
});

test("minor succession installs a real regency with a named regent and pressing claims", () => {
    const { consort, child, snapshot } = minorRealm();
    assert.equal(snapshot.regency.active, true);
    assert.equal(snapshot.regency.minorKingId, child.personId);
    assert.equal(snapshot.regency.regentId, consort.personId);
    assert.equal(snapshot.regency.regentName, consort.person.name);
    assert.ok(snapshot.regency.councilSupport > 0);
    assert.ok(snapshot.regency.majorityYear > state.year);
    assert.ok(snapshot.pressingClaims.length >= 1);
    assert.ok(snapshot.pressingClaims.every(claim => getRoyalPerson(claim.personId)));
    assert.ok(state.politics.legitimacy < 60, "opening a regency must cost legitimacy");
    assert.equal(state.entities.filter(entity => entity.isKing && !entity.dead).length, 1);
});

test("appointing a different regent charges gold, swaps roles and withdraws that claimant", () => {
    const { consort, snapshot } = minorRealm();
    const candidate = snapshot.regentCandidates.find(entry => entry.personId !== consort.personId);
    assert.ok(candidate, "the regency must offer an alternative eligible regent");
    const beforeGold = state.resources.gold;
    const result = appointRegent(candidate.personId);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, beforeGold - 8);
    assert.equal(state.royal.regency.regentId, candidate.personId);
    assert.equal(getRoyalPerson(candidate.personId).isRegent, true);
    assert.equal(consort.isRegent, false);
    assert.equal(consort.person.role, "royal-consort");
    assert.equal(state.royal.claims.find(claim => claim.personId === candidate.personId)?.status, "settled");
});

test("settling a claim costs treasury and lowers its actual support", () => {
    const { snapshot } = minorRealm();
    const claim = activeClaim(snapshot);
    const beforeGold = state.resources.gold;
    const beforeSupport = claim.support;
    const beforeNobility = state.politics.factions.nobility;
    const result = settleClaim(claim.id);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, beforeGold - 12);
    assert.ok(result.claim.support < beforeSupport);
    assert.ok(state.royal.claims.find(entry => entry.id === claim.id).support < beforeSupport);
    assert.ok(state.politics.factions.nobility > beforeNobility, "settling a claim must buy noble goodwill");
});

test("a strong claim with weak legitimacy transfers the crown by usurpation", () => {
    const { child, snapshot } = minorRealm();
    const claim = activeClaim(snapshot);
    const stored = state.royal.claims.find(entry => entry.id === claim.id);
    stored.support = 100;
    stored.claimStrength = 100;
    state.politics.legitimacy = 5;
    const claimant = getRoyalPerson(claim.personId);
    const beforeGold = state.resources.gold;
    const beforeFood = state.resources.food;
    const result = pressClaim(claim.id);
    assert.equal(result.ok, true);
    assert.equal(result.success, true);
    assert.equal(result.king, claimant);
    assert.equal(claimant.isKing, true);
    assert.equal(child.isKing, false);
    assert.equal(state.royal.regency.active, false);
    assert.equal(state.royal.claims.find(entry => entry.id === claim.id).status, "won");
    assert.equal(state.resources.gold, beforeGold - 20);
    assert.equal(state.resources.food, beforeFood - 12);
});

test("a weak claim starts a civil conflict whose annual pass drains real state", () => {
    const { claim } = failedPress();
    assert.equal(state.royal.civilConflict.active, true);
    assert.ok(state.royal.civilConflict.severity > 0);
    const goldAfterPress = state.resources.gold;
    const foodAfterPress = state.resources.food;
    const moraleAfterPress = state.morale;
    const legitimacyAfterPress = state.politics.legitimacy;
    const houseLoyalty = state.nobility.houses.map(house => [house.id, house.loyalty]);
    state.year = 5;
    const updated = updateRoyalCrisis();
    assert.equal(updated.civilConflict.active, true);
    assert.ok(state.royal.civilConflict.battles > 0);
    assert.ok(state.royal.civilConflict.casualties > 0);
    assert.ok(state.resources.gold < goldAfterPress);
    assert.ok(state.resources.food < foodAfterPress);
    assert.ok(state.morale < moraleAfterPress);
    assert.ok(state.politics.legitimacy < legitimacyAfterPress);
    assert.ok(state.nobility.houses.some(house => {
        const prior = houseLoyalty.find(([id]) => id === house.id)?.[1] || 0;
        return house.loyalty < prior;
    }));
    assert.ok(state.royal.civilConflict.history.some(entry => entry.kind === "campaign"));
    assert.equal(claim.status, "pressing");
});

test("a crown campaign charges its cost and can end the active conflict", () => {
    failedPress();
    const beforeGold = state.resources.gold;
    const beforeFood = state.resources.food;
    const beforeSeverity = state.royal.civilConflict.severity;
    const result = suppressCivilConflict();
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, beforeGold - 18);
    assert.equal(state.resources.food, beforeFood - 10);
    assert.ok(state.royal.civilConflict.severity < beforeSeverity);
    assert.equal(state.royal.civilConflict.active, false);
});

test("an adult sovereign abdicates to the designated living heir and records the act", () => {
    const king = startRealm();
    const consort = state.entities.find(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
    preparePerson(consort, 30);
    assert.equal(appointRoyalConsort(consort.personId).ok, true);
    const child = createRoyalChild().child;
    child.person.ageYears = 20;
    child.person.lifeStage = "adult";
    const beforeLegitimacy = state.politics.legitimacy;
    const result = abdicateThrone();
    assert.equal(result.ok, true);
    assert.equal(result.king, child);
    assert.equal(child.isKing, true);
    assert.equal(king.isKing, false);
    assert.equal(king.isAbdicated, true);
    assert.equal(state.politics.legitimacy, beforeLegitimacy - 7);
    assert.equal(state.royal.abdicationHistory.length, 1);
    assert.equal(state.royal.abdicationHistory[0].fromId, king.personId);
    assert.equal(state.royal.abdicationHistory[0].toId, child.personId);
    assert.equal(state.royal.regency.active, false);
});

test("a claimant can receive the crown by concession and the claim ledger records the result", () => {
    const { child, snapshot } = minorRealm();
    const claim = activeClaim(snapshot);
    const claimant = getRoyalPerson(claim.personId);
    const result = concedeCrown(claim.id);
    assert.equal(result.ok, true);
    assert.equal(result.king, claimant);
    assert.equal(claimant.isKing, true);
    assert.equal(child.isKing, false);
    assert.equal(state.royal.regency.active, false);
    assert.equal(state.royal.claims.find(entry => entry.id === claim.id).status, "won");
});

test("the crisis state survives a save-shape round-trip and legacy saves normalize safely", () => {
    const { snapshot } = minorRealm();
    const saved = JSON.parse(JSON.stringify(state.royal));
    const restored = normalizeRoyalState(saved);
    assert.equal(restored.regency.active, true);
    assert.equal(restored.regency.regentId, snapshot.regency.regentId);
    assert.equal(restored.claims.length, snapshot.claims.length);
    assert.equal(restored.claims[0].support, snapshot.claims[0].support);
    assert.equal(restored.civilConflict.phase, "peace");
    assert.ok(Array.isArray(restored.abdicationHistory));

    const legacy = JSON.parse(JSON.stringify(saved));
    delete legacy.regency;
    delete legacy.claims;
    delete legacy.civilConflict;
    delete legacy.crisisHistory;
    delete legacy.abdicationHistory;
    const normalizedLegacy = normalizeRoyalState(legacy);
    assert.equal(normalizedLegacy.regency.active, false);
    assert.deepEqual(normalizedLegacy.claims, []);
    assert.equal(normalizedLegacy.civilConflict.active, false);
    assert.equal(normalizedLegacy.civilConflict.phase, "peace");
    assert.deepEqual(normalizedLegacy.crisisHistory, []);
    assert.deepEqual(normalizedLegacy.abdicationHistory, []);
});

test("the same seed and inputs produce the same regency and civil-conflict result", () => {
    const fingerprint = () => {
        const realm = minorRealm();
        const claim = activeClaim(realm.snapshot);
        const stored = state.royal.claims.find(entry => entry.id === claim.id);
        stored.support = 5;
        stored.claimStrength = 5;
        state.politics.legitimacy = 60;
        pressClaim(claim.id);
        state.year = 5;
        updateRoyalCrisis();
        return JSON.parse(JSON.stringify({
            regentId: state.royal.regency.regentId,
            claims: state.royal.claims.map(entry => [entry.personId, entry.support, entry.status]),
            conflict: {
                active: state.royal.civilConflict.active,
                severity: state.royal.civilConflict.severity,
                battles: state.royal.civilConflict.battles,
                casualties: state.royal.civilConflict.casualties
            },
            gold: state.resources.gold,
            food: state.resources.food,
            morale: state.morale,
            legitimacy: state.politics.legitimacy
        }));
    };
    const first = fingerprint();
    const second = fingerprint();
    assert.deepEqual(second, first);
});
