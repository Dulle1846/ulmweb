import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { createDiplomacyState, getDiplomacySnapshot, updateDiplomacy } from "../../js/systems/diplomacy.js";
import { createMilitaryState, getMilitarySnapshot, normalizeMilitaryState, warmMilitaryCaches } from "../../js/systems/military.js";
import { getDiplomaticTradeTerms } from "../../js/systems/diplomacy-trade.js";
import {
    getCrownDread, getFrontierPressure, invalidateCrownDread, normalizeCrownDreadReading
} from "../../js/systems/crown-dread.js";

function setupRealm({ year = 2, gold = 600, food = 600 } = {}) {
    resetState();
    state.worldSeed = 4242;
    state.tick = 20;
    state.year = year;
    state.dayOfYear = 20;
    state.seasonIndex = 0;
    state.resources = { wood: 400, stone: 300, gold, food };
    initStartingKingdom();
    return state.entities.filter(entity => !entity.dead).length;
}

test("the muster's measured power becomes one bounded dread reading", () => {
    setupRealm();
    state.military = { ...createMilitaryState(), strengthPower: 0, strengthSoldiers: 0, strengthYear: 2 };
    const quiet = getCrownDread();
    assert.equal(quiet.dread, 0);
    assert.equal(quiet.band, "QUIET");
    assert.equal(quiet.soldiers, 0);

    state.military.strengthPower = 60;
    state.military.strengthSoldiers = 4;
    const respected = getCrownDread();
    assert.equal(respected.dread, 50);
    assert.equal(respected.band, "RESPECTED");

    state.military.strengthPower = 240;
    state.military.strengthSoldiers = 8;
    const dreaded = getCrownDread();
    assert.equal(dreaded.dread, 80);
    assert.equal(dreaded.band, "DREADED");
    assert.equal(dreaded.year, 2);
});

test("war, hostile courts, incidents and a thin garrison raise a bounded border levy", () => {
    setupRealm();
    state.military = { ...createMilitaryState(), strengthPower: 240, strengthSoldiers: 8, strengthYear: 2 };
    // No neighbours: the levy stays neutral so early realms keep their payroll.
    invalidateCrownDread();
    assert.equal(getFrontierPressure().factor, 1);

    state.diplomacy = createDiplomacyState();
    const [first, second] = state.diplomacy.realms;
    invalidateCrownDread();
    const strongPeace = getFrontierPressure();
    assert.equal(strongPeace.wars, 0);
    assert.equal(strongPeace.factor, 1);

    first.treaty = "war";
    second.relation = 12;
    second.lastIncidentYear = state.year;
    invalidateCrownDread();
    const pressed = getFrontierPressure();
    assert.ok(pressed.factor > strongPeace.factor);
    assert.equal(pressed.wars, 1);
    assert.equal(pressed.hostile, 1);
    assert.equal(pressed.incidents, 1);
    assert.ok(pressed.factor <= 1.45, "the levy must stay bounded");

    // A thin garrison is priced too: dread 0 adds the weakness term.
    state.military.strengthPower = 0;
    state.military.strengthSoldiers = 0;
    invalidateCrownDread();
    const weak = getFrontierPressure();
    assert.ok(weak.factor > strongPeace.factor);
    assert.ok(weak.weakness > 0.9);
});

test("annual diplomacy drifts fear toward the army and a feared crown deters incidents", () => {
    setupRealm({ year: 6 });
    state.diplomacy = createDiplomacyState();
    const realm = state.diplomacy.realms[0];
    realm.fear = 20;
    realm.relation = 25;
    realm.lastIncidentYear = 0;
    state.military = { ...createMilitaryState(), strengthPower: 240, strengthSoldiers: 8, strengthYear: 6 };
    state.diplomacy.lastUpdateYear = 5;
    invalidateCrownDread();
    updateDiplomacy();
    assert.ok(realm.fear > 20, "fear must drift toward the standing army's dread");
    assert.notEqual(realm.lastIncidentYear, 6, "a dreaded crown is not probed at 25 relation");

    // The same relation with no army crosses the higher incident threshold.
    state.diplomacy = createDiplomacyState();
    const weakRealm = state.diplomacy.realms[0];
    weakRealm.fear = 20;
    weakRealm.relation = 24;
    weakRealm.lastIncidentYear = 0;
    state.military = { ...createMilitaryState(), strengthPower: 0, strengthSoldiers: 0, strengthYear: 6 };
    state.diplomacy.lastUpdateYear = 5;
    invalidateCrownDread();
    updateDiplomacy();
    assert.equal(weakRealm.lastIncidentYear, 6, "a thin garrison invites a border incident");
    assert.ok(weakRealm.fear > 20);
});

test("fear above 60 worsens trade terms while ordinary fear stays neutral", () => {
    state.diplomacy = createDiplomacyState();
    const realm = state.diplomacy.realms.find(entry => entry.id === "northmere") || state.diplomacy.realms[0];
    realm.relation = 80;
    realm.envoySkill = 0;
    realm.fear = 40;
    const calm = getDiplomaticTradeTerms(state.diplomacy, realm.id);
    assert.equal(calm.dreadPenalty, 0);

    realm.fear = 85;
    const feared = getDiplomaticTradeTerms(state.diplomacy, realm.id);
    assert.ok(feared.dreadPenalty > 0);
    assert.ok(feared.buyFactor > calm.buyFactor, "a feared court charges the crown more");
    assert.ok(feared.sellFactor < calm.sellFactor, "a feared court pays the crown less");

    realm.treaty = "war";
    assert.equal(getDiplomaticTradeTerms(state.diplomacy, realm.id).blocked, true);
});

test("the annual muster pays the diplomatic levy and saves the dread reading", () => {
    setupRealm({ year: 2 });
    state.military = { ...createMilitaryState(), lastMusterYear: 1 };
    warmMilitaryCaches();
    const base = state.military.lastPayroll;
    assert.ok(base, "the muster must run");
    assert.equal(base.levyFactor, 1, "no neighbours means no border levy");
    assert.ok(state.military.strengthPower > 0, "the muster must measure real power");
    assert.ok(state.military.strengthSoldiers >= 2);
    assert.equal(state.military.strengthYear, 2);

    setupRealm({ year: 2 });
    state.diplomacy = createDiplomacyState();
    state.diplomacy.realms.forEach(realm => { realm.relation = 10; });
    state.diplomacy.realms[0].treaty = "war";
    state.military = { ...createMilitaryState(), lastMusterYear: 1 };
    invalidateCrownDread();
    warmMilitaryCaches();
    const levied = state.military.lastPayroll;
    assert.ok(levied.levyFactor > 1, "war and hostility must raise the levy");
    assert.ok(levied.goldNeed > base.goldNeed, "the levy must reach the gold need");
    assert.ok(levied.foodNeed >= base.foodNeed, "the levy must reach the food need");
    assert.equal(levied.dread, getCrownDread().dread);

    const saved = JSON.parse(JSON.stringify(state.military));
    const restored = normalizeMilitaryState(saved);
    assert.equal(restored.strengthPower, state.military.strengthPower);
    assert.equal(restored.strengthSoldiers, state.military.strengthSoldiers);
    assert.equal(restored.lastPayroll.levyFactor, levied.levyFactor);
    assert.deepEqual(normalizeCrownDreadReading(saved), {
        strengthPower: saved.strengthPower,
        strengthSoldiers: saved.strengthSoldiers,
        strengthYear: saved.strengthYear
    });

    const snapshot = getMilitarySnapshot();
    assert.ok(snapshot.dread.dread >= 0 && snapshot.pressure.factor >= 1);
    const diplomacy = getDiplomacySnapshot();
    assert.equal(diplomacy.dread.dread, snapshot.dread.dread);
    assert.equal(diplomacy.pressure.factor, snapshot.pressure.factor);
});

test("legacy military saves normalize to an unmeasured garrison, not a fabricated army", () => {
    const legacy = normalizeMilitaryState({ horses: 2, lastMusterYear: 3 });
    assert.equal(legacy.strengthPower, 0);
    assert.equal(legacy.strengthSoldiers, 0);
    assert.equal(legacy.strengthYear, 0);
    assert.equal(legacy.lastPayroll, null);
    const malformed = normalizeMilitaryState({ strengthPower: "bad", strengthSoldiers: -4, strengthYear: 2.9 });
    assert.equal(malformed.strengthPower, 0);
    assert.equal(malformed.strengthSoldiers, 0);
    assert.equal(malformed.strengthYear, 2);
});
