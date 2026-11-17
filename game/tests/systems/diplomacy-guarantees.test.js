import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    createDiplomacyState,
    normalizeDiplomacySnapshot,
    getDiplomacySnapshot,
    grantGuarantee,
    withdrawGuarantee,
    declareWar,
    honorGuaranteeCall,
    refuseGuaranteeCall,
    updateDiplomacy
} from "../../js/systems/diplomacy.js";

function prepareRealm() {
    resetState();
    state.hasStarted = true;
    state.year = 1;
    state.tick = 0;
    state.resources = { wood: 100, stone: 100, gold: 500, food: 500 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 70;
    state.diplomacy = createDiplomacyState();
}

function realm(id) {
    return state.diplomacy.realms.find(item => item.id === id);
}

function guaranteeNorthmere() {
    const target = realm("northmere");
    const result = grantGuarantee(target.id);
    assert.equal(result.ok, true);
    return target;
}

function queueCall(target, year = 2) {
    target.guarantee.nextCrisisYear = year;
    state.year = year;
    state.diplomacy.lastUpdateYear = year - 1;
    updateDiplomacy();
    assert.ok(target.guaranteeCall, "the annual court must raise a guarantee call");
    return target.guaranteeCall;
}

beforeEach(() => {
    prepareRealm();
});

test("a royal guarantee costs gold, raises trust and persists in the diplomacy snapshot", () => {
    const target = realm("northmere");
    const relationBefore = target.relation;
    const trustBefore = target.trust;
    const result = grantGuarantee("northmere");

    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, 488);
    assert.equal(target.guarantee.sinceYear, 1);
    assert.equal(target.guarantee.expiresYear, 9);
    assert.ok(target.guarantee.nextCrisisYear >= 3 && target.guarantee.nextCrisisYear <= 6);
    assert.ok(target.relation > relationBefore);
    assert.ok(target.trust > trustBefore);

    const snapshot = getDiplomacySnapshot();
    assert.equal(snapshot.guarantees.active, 1);
    assert.equal(snapshot.guarantees.credibility, 60);
    assert.equal(snapshot.realms.find(item => item.id === "northmere").guarantee.active, true);
    assert.equal(snapshot.realms.find(item => item.id === "northmere").guarantee.yearsLeft, 8);
    assert.equal(snapshot.realms.find(item => item.id === "northmere").history[0].kind, "guarantee");
});

test("a guaranteed realm cannot be attacked until the guarantee is withdrawn", () => {
    guaranteeNorthmere();
    const target = realm("northmere");
    const refused = declareWar("northmere");
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, "withdraw-the-guarantee-first");
    assert.equal(target.treaty, "none");
    assert.equal(target.guarantee.sinceYear, 1);
});

test("the annual court raises exactly one deterministic guarantee call", () => {
    const target = guaranteeNorthmere();
    const call = queueCall(target, 2);

    assert.equal(call.attackerId, "redpass");
    assert.equal(call.sinceYear, 2);
    assert.equal(call.deadlineYear, 3);
    assert.equal(target.guarantee.lastCallYear, 2);
    assert.equal(getDiplomacySnapshot().guarantees.pending, 1);
    assert.equal(target.history[0].kind, "guarantee-call");

    const serialized = JSON.stringify(call);
    const goldAfterAnnual = state.resources.gold;
    updateDiplomacy();
    assert.equal(JSON.stringify(target.guaranteeCall), serialized, "a second review in the same year must not repeat the call");
    assert.equal(state.resources.gold, goldAfterAnnual);
});

test("honouring a call pays aid, rewards the protected realm and raises standing", () => {
    const target = guaranteeNorthmere();
    const call = queueCall(target, 2);
    const attacker = realm(call.attackerId);
    const targetTrust = target.trust;
    const attackerRelation = attacker.relation;
    const result = honorGuaranteeCall("northmere");

    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, 470);
    assert.equal(state.resources.food, 488);
    assert.equal(target.guaranteeCall, null);
    assert.equal(target.guarantee.honored, 1);
    assert.equal(state.diplomacy.guaranteeHonored, 1);
    assert.equal(state.diplomacy.guaranteeCredibility, 68);
    assert.ok(target.trust > targetTrust);
    assert.ok(attacker.relation < attackerRelation);
    assert.equal(target.history[0].kind, "guarantee-honored");
    assert.ok(target.guarantee.nextCrisisYear > 2);
    assert.equal(getDiplomacySnapshot().guarantees.pending, 0);
});

test("refusing a call breaks the guarantee and damages legitimacy and standing", () => {
    const target = guaranteeNorthmere();
    queueCall(target, 2);
    const relationBefore = target.relation;
    const trustBefore = target.trust;
    const legitimacyBefore = state.politics.legitimacy;
    const result = refuseGuaranteeCall("northmere");

    assert.equal(result.ok, true);
    assert.equal(target.guarantee, null);
    assert.equal(target.guaranteeCall, null);
    assert.equal(state.diplomacy.guaranteeRefused, 1);
    assert.equal(state.diplomacy.guaranteeCredibility, 44);
    assert.ok(target.relation < relationBefore);
    assert.ok(target.trust < trustBefore);
    assert.ok(state.politics.legitimacy < legitimacyBefore);
    assert.equal(target.history[0].kind, "guarantee-refused");
    assert.match(target.history[0].summary, /Guarantee refused/);
});

test("an ignored call is refused automatically by the next annual review", () => {
    const target = guaranteeNorthmere();
    queueCall(target, 2);
    state.year = 4;
    state.diplomacy.lastUpdateYear = 3;

    updateDiplomacy();

    assert.equal(target.guarantee, null);
    assert.equal(target.guaranteeCall, null);
    assert.equal(state.diplomacy.guaranteeRefused, 1);
    assert.equal(state.diplomacy.guaranteeCredibility, 44);
    assert.match(target.history[0].summary, /Unanswered guarantee abandoned/);
});

test("withdrawing a guarantee has a reputation cost and removes the war block", () => {
    const target = guaranteeNorthmere();
    state.year = 4;
    const relationBefore = target.relation;
    const result = withdrawGuarantee("northmere");

    assert.equal(result.ok, true);
    assert.equal(target.guarantee, null);
    assert.equal(state.diplomacy.guaranteeCredibility, 52);
    assert.ok(target.relation < relationBefore);
    assert.equal(target.history[0].kind, "guarantee-withdrawn");
    assert.equal(getDiplomacySnapshot().guarantees.active, 0);
});

test("an expired guarantee is cleared once, without being mistaken for a refusal", () => {
    const target = guaranteeNorthmere();
    target.guarantee.expiresYear = 3;
    state.year = 3;
    state.diplomacy.lastUpdateYear = 2;

    updateDiplomacy();

    assert.equal(target.guarantee, null);
    assert.equal(state.diplomacy.guaranteeRefused, 0);
    assert.equal(state.diplomacy.guaranteeCredibility, 60);
    assert.equal(target.history[0].kind, "guarantee-expired");
});

test("legacy saves receive safe guarantee defaults and malformed records are bounded", () => {
    const legacy = normalizeDiplomacySnapshot({});
    assert.equal(legacy.guaranteeCredibility, 60);
    assert.equal(legacy.guaranteeHonored, 0);
    assert.equal(legacy.guaranteeRefused, 0);
    assert.ok(legacy.realms.every(item => item.guarantee === null && item.guaranteeCall === null));

    const malformed = normalizeDiplomacySnapshot({
        guaranteeCredibility: 999,
        guaranteeHonored: -4,
        guaranteeRefused: "7",
        realms: [
            {
                id: "northmere",
                guarantee: { sinceYear: "2", expiresYear: "9", nextCrisisYear: 3, honored: 999, refused: -2 },
                guaranteeCall: { attackerId: "northmere", sinceYear: 4, deadlineYear: 6 }
            },
            {
                id: "redpass",
                guaranteeCall: { attackerId: "goldcoast", sinceYear: "5", deadlineYear: "6" }
            }
        ]
    });

    assert.equal(malformed.guaranteeCredibility, 100);
    assert.equal(malformed.guaranteeHonored, 0);
    assert.equal(malformed.guaranteeRefused, 7);
    const northmere = malformed.realms.find(item => item.id === "northmere");
    assert.equal(northmere.guarantee.nextCrisisYear, 3);
    assert.equal(northmere.guarantee.honored, 999);
    assert.equal(northmere.guarantee.refused, 0);
    assert.equal(northmere.guaranteeCall, null, "a realm cannot threaten itself");
    const redpass = malformed.realms.find(item => item.id === "redpass");
    assert.equal(redpass.guaranteeCall.attackerId, "goldcoast");
    assert.equal(redpass.guaranteeCall.deadlineYear, 6);
});

test("guarantee standing changes long-term trust, and replaying the same years is deterministic", () => {
    const run = (credibility, honorCall) => {
        prepareRealm();
        const target = guaranteeNorthmere();
        state.diplomacy.guaranteeCredibility = credibility;
        target.trust = 50;
        queueCall(target, 2);
        const call = JSON.parse(JSON.stringify(target.guaranteeCall));
        if (honorCall) honorGuaranteeCall("northmere");
        return {
            trust: target.trust,
            credibility: state.diplomacy.guaranteeCredibility,
            honored: state.diplomacy.guaranteeHonored,
            call
        };
    };

    const high = run(100, true);
    const low = run(0, false);
    assert.ok(high.trust > low.trust, "high standing must build trust faster than low standing");
    assert.equal(high.credibility, 100);
    assert.equal(low.credibility, 0);

    const replay = run(100, true);
    assert.deepEqual(replay, high, "identical seeds and choices must produce identical guarantee outcomes");
});
