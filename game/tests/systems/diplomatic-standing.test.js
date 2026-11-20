import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { createDiplomacyState, getDiplomacySnapshot, normalizeDiplomacySnapshot, updateDiplomacy } from "../../js/systems/diplomacy.js";
import { getDiplomaticStanding, getStandingYears, STANDING_YEAR_LIMIT } from "../../js/systems/diplomatic-standing.js";
import { getDiplomaticTradeTerms } from "../../js/systems/diplomacy-trade.js";

function setupRealm(year = 12) {
    resetState();
    state.hasStarted = true;
    state.year = year;
    state.resources = { wood: 200, stone: 200, gold: 600, food: 300 };
    state.morale = 72;
    state.diplomacy = createDiplomacyState();
    return state.diplomacy;
}

const realmOf = (diplomacy, id = "northmere") => diplomacy.realms.find(realm => realm.id === id);

test("a fresh court has no standing and therefore no hidden bonus", () => {
    const diplomacy = setupRealm();
    const realm = realmOf(diplomacy);
    const standing = getDiplomaticStanding(realm);
    assert.equal(standing.years, 0);
    assert.equal(standing.tier, "new");
    assert.equal(standing.tradeBonus, 0);
    assert.equal(standing.trustGain, 0);
    assert.equal(standing.incidentRelief, 0);
    assert.equal(standing.allianceGold, 0);
    assert.equal(standing.allianceFood, 0);
    assert.equal(getStandingYears({ treatySinceYear: 0 }), 0, "a legacy treaty with no clock is neutral");
});

test("a treaty's saved year becomes a bounded standing reading", () => {
    const diplomacy = setupRealm(12);
    const realm = realmOf(diplomacy);
    realm.treaty = "alliance";
    realm.treatySinceYear = 2;
    const tenYears = getDiplomaticStanding(realm);
    assert.equal(tenYears.years, 10);
    assert.equal(tenYears.tier, "settled");
    assert.equal(tenYears.tradeBonus, 0.015);
    assert.equal(tenYears.trustGain, 0.3);
    assert.equal(tenYears.incidentRelief, 2);
    assert.equal(tenYears.allianceGold, 1);
    assert.equal(tenYears.allianceFood, 2);
    assert.equal(tenYears.capped, false);

    realm.treatySinceYear = 1;
    state.year = 80;
    const capped = getDiplomaticStanding(realm);
    assert.equal(capped.years, STANDING_YEAR_LIMIT);
    assert.equal(capped.tier, "entente");
    assert.equal(capped.tradeBonus, 0.03);
    assert.equal(capped.trustGain, 0.6);
    assert.equal(capped.incidentRelief, 4);
    assert.equal(capped.allianceGold, 3);
    assert.equal(capped.allianceFood, 4);
    assert.equal(capped.capped, true);
});

test("war earns no standing and a future year cannot inflate one", () => {
    const diplomacy = setupRealm(12);
    const realm = realmOf(diplomacy);
    realm.treaty = "war";
    realm.treatySinceYear = 2;
    assert.equal(getDiplomaticStanding(realm).years, 0);
    assert.equal(getDiplomaticStanding(realm).tradeBonus, 0);

    realm.treaty = "alliance";
    realm.treatySinceYear = 20;
    assert.equal(getDiplomaticStanding(realm, 12).years, 0, "a forged future year reads as zero");
});

test("the annual court pays a long alliance more than a new one", () => {
    const diplomacy = setupRealm(25);
    const veteran = realmOf(diplomacy, "northmere");
    const fresh = realmOf(diplomacy, "redpass");
    for (const realm of [veteran, fresh]) {
        realm.treaty = "alliance";
        realm.relation = 60;
        realm.trust = 40;
        realm.lastIncidentYear = 0;
    }
    veteran.treatySinceYear = 5;
    fresh.treatySinceYear = 24;
    diplomacy.lastUpdateYear = 24;

    const trustBefore = { veteran: veteran.trust, fresh: fresh.trust };
    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    updateDiplomacy();

    const veteranTrust = veteran.trust - trustBefore.veteran;
    const freshTrust = fresh.trust - trustBefore.fresh;
    assert.ok(veteranTrust > freshTrust + 0.2, "standing must add meaningfully more trust to the old alliance");
    assert.equal(getDiplomaticStanding(veteran, 25).years, 20);
    assert.ok(state.resources.gold > goldBefore);
    assert.ok(state.resources.food > foodBefore);
    assert.equal(veteran.treatySinceYear, 5, "the annual court must not rewrite a recorded clock");
});

test("standing improves the market's buy and sell terms", () => {
    const diplomacy = setupRealm(25);
    const veteran = realmOf(diplomacy, "northmere");
    const fresh = realmOf(diplomacy, "redpass");
    for (const realm of [veteran, fresh]) {
        realm.treaty = "alliance";
        realm.relation = 60;
        realm.fear = 20;
        realm.envoySkill = 0;
    }
    veteran.treatySinceYear = 5;
    fresh.treatySinceYear = 24;
    const longTerms = getDiplomaticTradeTerms(diplomacy, veteran.id);
    const newTerms = getDiplomaticTradeTerms(diplomacy, fresh.id);
    assert.equal(longTerms.standingYears, 20);
    assert.equal(newTerms.standingYears, 1);
    assert.ok(longTerms.standingBonus > newTerms.standingBonus);
    assert.ok(longTerms.buyFactor < newTerms.buyFactor, "a long treaty buys cheaper");
    assert.ok(longTerms.sellFactor > newTerms.sellFactor, "a long treaty sells dearer");
});

test("a long peace keeps the border quieter than a fresh treaty", () => {
    const diplomacy = setupRealm(25);
    const veteran = realmOf(diplomacy, "northmere");
    const fresh = realmOf(diplomacy, "redpass");
    for (const realm of [veteran, fresh]) {
        realm.treaty = "alliance";
        realm.relation = 24;
        realm.trust = 50;
        realm.lastIncidentYear = 0;
    }
    veteran.treatySinceYear = 5;
    fresh.treatySinceYear = 24;
    diplomacy.lastUpdateYear = 24;

    updateDiplomacy();
    assert.equal(fresh.lastIncidentYear, 25, "a new alliance is still probed at this relation");
    assert.notEqual(veteran.lastIncidentYear, 25, "twenty years of standing calms the border");
});

test("the standing reading survives a save-shaped round trip and legacy saves stay neutral", () => {
    const diplomacy = setupRealm(25);
    const realm = realmOf(diplomacy);
    realm.treaty = "trade";
    realm.treatySinceYear = 5;

    const restored = normalizeDiplomacySnapshot(JSON.parse(JSON.stringify(state.diplomacy)));
    const restoredRealm = realmOf(restored);
    assert.equal(restoredRealm.treaty, "trade");
    assert.equal(restoredRealm.treatySinceYear, 5);
    assert.deepEqual(getDiplomaticStanding(restoredRealm, 25), getDiplomaticStanding(realm, 25));

    const legacy = normalizeDiplomacySnapshot({ realms: [{ id: "northmere", treaty: "alliance", relation: 70 }] });
    const legacyRealm = realmOf(legacy);
    assert.equal(legacyRealm.treatySinceYear, 0);
    const standing = getDiplomaticStanding(legacyRealm, 25);
    assert.equal(standing.years, 0);
    assert.equal(standing.tradeBonus, 0);

    state.diplomacy = legacy;
    state.diplomacy.lastUpdateYear = 24;
    updateDiplomacy();
    assert.equal(state.diplomacy.realms.find(item => item.id === "northmere").treatySinceYear, 25,
        "a legacy treaty starts its clock at the next annual court");
});

test("the diplomacy snapshot exposes the strongest standing for the panel", () => {
    const diplomacy = setupRealm(25);
    const veteran = realmOf(diplomacy, "northmere");
    veteran.treaty = "alliance";
    veteran.treatySinceYear = 5;
    const snapshot = getDiplomacySnapshot();
    assert.equal(snapshot.standing.realms, 1);
    assert.equal(snapshot.standing.averageYears, 20);
    assert.equal(snapshot.standing.ententes, 1);
    assert.equal(snapshot.standing.longest.name, snapshot.realms.find(item => item.id === veteran.id).name);
    assert.equal(snapshot.standing.longest.years, 20);
    assert.equal(snapshot.realms.find(item => item.id === veteran.id).standing.years, 20);
});
