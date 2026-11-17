import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { createMarketState } from "../../js/systems/market.js";
import { DIPLOMATIC_REALMS } from "../../js/systems/diplomacy-config.js";
import {
    createDiplomacyState,
    normalizeDiplomacySnapshot,
    getDiplomacySnapshot,
    signTradeAgreement,
    cancelTradeAgreement,
    declareWar,
    updateDiplomacy
} from "../../js/systems/diplomacy.js";

function prepareRealm() {
    resetState();
    state.hasStarted = true;
    state.year = 1;
    state.tick = 0;
    state.resources = { wood: 100, stone: 100, gold: 200, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 70;
    state.diplomacy = createDiplomacyState();
    state.market = createMarketState();
}

function realm(id) {
    return state.diplomacy.realms.find(item => item.id === id);
}

function partner(id) {
    return state.market.partners.find(item => item.id === id);
}

function marketSnapshot(id) {
    const item = partner(id);
    return {
        stock: { ...item.stock },
        treasury: item.treasury
    };
}

function signNorthmere() {
    const result = signTradeAgreement("northmere");
    assert.equal(result.ok, true);
    return realm("northmere");
}

beforeEach(() => {
    prepareRealm();
});

test("all four neighbouring courts expose one deterministic annual trade offer", () => {
    const snapshot = getDiplomacySnapshot();
    assert.equal(snapshot.realms.length, 4);
    assert.equal(snapshot.tradeAgreements.active, 0);
    for (const definition of DIPLOMATIC_REALMS) {
        const offer = snapshot.realms.find(item => item.id === definition.id).tradeAgreement;
        assert.ok(offer, definition.id + " must offer an agreement");
        assert.ok(["wood", "stone", "food"].includes(offer.importResource));
        assert.ok(["wood", "stone", "food"].includes(offer.exportResource));
        assert.ok(offer.importPerYear > 0);
        assert.ok(offer.exportCap > 0);
        assert.ok(offer.exportUnitGold > 0);
        assert.ok(offer.annualGold > 0);
        assert.ok(offer.signingGold > 0);
        assert.equal(offer.active, false);
        assert.equal(offer.canSign, true);
    }
});

test("signing a trade agreement pays the authored fee and persists its bounded runtime record", () => {
    const target = signNorthmere();
    assert.equal(state.resources.gold, 188);
    assert.deepEqual(target.tradeAgreement, {
        sinceYear: 1,
        lastSettledYear: 1,
        yearsServed: 0,
        imports: 0,
        exports: 0,
        goldPaid: 12,
        goldEarned: 0
    });

    const snapshot = getDiplomacySnapshot();
    const offer = snapshot.realms.find(item => item.id === "northmere").tradeAgreement;
    assert.equal(snapshot.tradeAgreements.active, 1);
    assert.equal(snapshot.tradeAgreements.goldPaid, 12);
    assert.equal(offer.active, true);
    assert.equal(offer.canSign, false);
    assert.equal(offer.signReason, "agreement-active");
    assert.equal(offer.importResource, "wood");
    assert.equal(offer.exportResource, "stone");
    assert.equal(offer.exportUnitGold, 2);
    assert.match(target.history[0].summary, /Trade agreement signed/);
    assert.equal(signTradeAgreement("northmere").reason, "a-trade-agreement-is-already-in-force");
});

test("a royal marriage lowers signing cost, annual fee and relation thresholds", () => {
    state.royal.foreignMarriage = {
        realmId: "northmere",
        house: "House Vane",
        name: "Lady Elowen Vane",
        sinceYear: 1
    };
    state.royal.consortId = "test-consort";
    state.entities.push({ id: "test-consort", personId: "test-consort", x: 0, y: 0, dead: false });
    const target = realm("northmere");
    target.relation = 48;
    target.trust = 44;

    const offer = getDiplomacySnapshot().realms.find(item => item.id === "northmere").tradeAgreement;
    assert.equal(offer.signingGold, 6);
    assert.equal(offer.annualGold, 4);
    assert.equal(offer.minRelation, 47);
    assert.equal(offer.minTrust, 43);
    assert.deepEqual(offer.marriageDiscount, { signingGold: 6, annualGold: 1, relation: 5, trust: 5 });
    assert.equal(offer.canSign, true);

    state.resources.gold = 100;
    assert.equal(signTradeAgreement("northmere").ok, true);
    assert.equal(state.resources.gold, 94);

    state.year = 2;
    state.diplomacy.lastUpdateYear = 1;
    updateDiplomacy();
    assert.equal(state.resources.gold, 94 - 4 + 24);
    assert.equal(target.tradeAgreement.goldPaid, 10);
    assert.equal(target.tradeAgreement.yearsServed, 1);
});

test("the annual court imports goods and buys export surplus once, using the shared market partner", () => {
    const target = signNorthmere();
    const beforePartner = marketSnapshot("northmere");
    const beforeGold = state.resources.gold;
    const beforeWood = state.resources.wood;
    const beforeStone = state.resources.stone;

    state.year = 2;
    state.diplomacy.lastUpdateYear = 1;
    updateDiplomacy();

    assert.equal(state.resources.gold, beforeGold - 5 + 24);
    assert.equal(state.resources.wood, beforeWood + 18);
    assert.equal(state.resources.stone, beforeStone - 12);
    assert.equal(partner("northmere").stock.wood, beforePartner.stock.wood - 18);
    assert.equal(partner("northmere").stock.stone, beforePartner.stock.stone + 12);
    assert.equal(partner("northmere").treasury, beforePartner.treasury - 24);
    assert.deepEqual(target.tradeAgreement, {
        sinceYear: 1,
        lastSettledYear: 2,
        yearsServed: 1,
        imports: 18,
        exports: 12,
        goldPaid: 17,
        goldEarned: 24
    });
    assert.equal(target.tradeVolume, 30);
    assert.equal(target.lastTradeYear, 2);
    assert.equal(getDiplomacySnapshot().tradeAgreements.goldEarned, 24);

    const afterGold = state.resources.gold;
    const afterGoods = { ...target.tradeAgreement };
    updateDiplomacy();
    assert.equal(state.resources.gold, afterGold, "a second review in the same year must not settle twice");
    assert.deepEqual(target.tradeAgreement, afterGoods);
});

test("agreement imports and exports stay inside partner stock, partner treasury and the export reserve", () => {
    const target = signNorthmere();
    partner("northmere").stock.wood = 5;
    partner("northmere").treasury = 10;
    state.resources.wood = 500;
    state.resources.stone = 500;
    const beforeGold = state.resources.gold;

    state.year = 2;
    state.diplomacy.lastUpdateYear = 1;
    updateDiplomacy();

    assert.equal(target.tradeAgreement.imports, 5);
    assert.equal(target.tradeAgreement.exports, 5);
    assert.equal(state.resources.wood, 505);
    assert.equal(state.resources.stone, 495);
    assert.equal(state.resources.gold, beforeGold - 5 + 10);
    assert.equal(partner("northmere").stock.wood, 0);
    assert.equal(partner("northmere").treasury, 0);
    assert.equal(partner("northmere").stock.stone, 40);
});

test("cancelling an agreement clears it and lowers trust", () => {
    const target = signNorthmere();
    const trustBefore = target.trust;
    const relationBefore = target.relation;
    const result = cancelTradeAgreement("northmere");

    assert.equal(result.ok, true);
    assert.equal(target.tradeAgreement, null);
    assert.ok(target.trust < trustBefore);
    assert.ok(target.relation < relationBefore);
    assert.equal(target.history[0].kind, "trade-agreement-cancelled");
    assert.equal(getDiplomacySnapshot().tradeAgreements.active, 0);
    assert.equal(cancelTradeAgreement("northmere").reason, "no-trade-agreement-is-in-force");
});

test("war breaks an active agreement and records the breach", () => {
    const target = signNorthmere();
    const trustBefore = target.trust;
    const result = declareWar("northmere");

    assert.equal(result.ok, true);
    assert.equal(target.treaty, "war");
    assert.equal(target.tradeAgreement, null);
    assert.ok(target.trust < trustBefore);
    assert.equal(target.history[0].kind, "war");
    assert.ok(target.history.some(entry => entry.kind === "trade-agreement-broken"));
});

test("an unpaid annual fee lapses the agreement without importing or exporting", () => {
    const target = signNorthmere();
    state.resources.gold = 0;
    const woodBefore = state.resources.wood;
    const stoneBefore = state.resources.stone;
    const trustBefore = target.trust;

    state.year = 2;
    state.diplomacy.lastUpdateYear = 1;
    updateDiplomacy();

    assert.equal(target.tradeAgreement, null);
    assert.equal(state.resources.gold, 0);
    assert.equal(state.resources.wood, woodBefore);
    assert.equal(state.resources.stone, stoneBefore);
    assert.ok(target.trust < trustBefore);
    assert.equal(target.history[0].kind, "trade-agreement-lapsed");
    assert.match(target.history[0].summary, /unpaid annual fee/);
});

test("legacy saves gain safe agreement defaults and forged terms are replaced by authored runtime data", () => {
    state.year = 7;
    const legacy = normalizeDiplomacySnapshot({});
    assert.ok(legacy.realms.every(item => item.tradeAgreement === null));

    const normalized = normalizeDiplomacySnapshot({
        realms: [
            {
                id: "northmere",
                tradeAgreement: {
                    sinceYear: "2",
                    lastSettledYear: 9999,
                    yearsServed: -1,
                    imports: "12",
                    exports: -2,
                    goldPaid: 6,
                    goldEarned: 15,
                    importResource: "gold",
                    exportResource: "gold",
                    annualGold: 0
                }
            },
            {
                id: "unknown-realm",
                tradeAgreement: { sinceYear: 3, imports: 999 }
            },
            {
                id: "redpass",
                tradeAgreement: { sinceYear: 0, imports: 999 }
            }
        ]
    });
    const northmere = normalized.realms.find(item => item.id === "northmere");
    assert.deepEqual(northmere.tradeAgreement, {
        sinceYear: 2,
        lastSettledYear: 7,
        yearsServed: 0,
        imports: 12,
        exports: 0,
        goldPaid: 6,
        goldEarned: 15
    });
    assert.equal(normalized.realms.find(item => item.id === "redpass").tradeAgreement, null);
    assert.equal(normalized.realms.some(item => item.id === "unknown-realm"), false);

    state.diplomacy = createDiplomacyState();
    delete state.diplomacy.realms[0].tradeAgreement;
    const repaired = getDiplomacySnapshot();
    assert.ok(repaired.realms.every(item => Object.hasOwn(item, "tradeAgreement")));
    assert.equal(repaired.realms[0].tradeAgreement.active, false);
});

test("replaying identical years and choices produces identical agreement results", () => {
    const run = () => {
        prepareRealm();
        signTradeAgreement("goldcoast");
        for (let year = 2; year <= 4; year++) {
            state.year = year;
            state.diplomacy.lastUpdateYear = year - 1;
            state.resources.gold = 300;
            state.resources.stone = 180;
            updateDiplomacy();
        }
        const target = realm("goldcoast");
        return {
            agreement: { ...target.tradeAgreement },
            relation: target.relation,
            trust: target.trust,
            gold: state.resources.gold,
            stone: state.resources.stone,
            food: state.resources.food,
            partner: marketSnapshot("goldcoast")
        };
    };

    assert.deepEqual(run(), run());
});
