import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { getPoliticalSnapshot } from "../../js/systems/politics.js";
import { prepareSaveSnapshot } from "../../js/core/save-runtime.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";
import {
    NOBILITY_CHARTER_COST,
    NOBILITY_HOUSE_LIMIT,
    callNobleLevy,
    createNobilityState,
    getNobilityDefenseMultiplier,
    getNobilitySnapshot,
    grantNobleCharter,
    normalizeNobilityState,
    updateNobility
} from "../../js/systems/nobility.js";

function startRealm() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 20261114;
    state.year = 1;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    initStartingKingdom();
}

test("noble houses are drawn from real resident families and bounded to four", () => {
    startRealm();
    const snapshot = getNobilitySnapshot();
    assert.equal(snapshot.houseCount, NOBILITY_HOUSE_LIMIT);
    assert.equal(snapshot.houses.length, NOBILITY_HOUSE_LIMIT);
    assert.equal(new Set(snapshot.houses.map(house => house.familyName)).size, NOBILITY_HOUSE_LIMIT);
    for (const house of snapshot.houses) {
        assert.ok(house.head, "every founded house must have a recorded head");
        const head = state.entities.find(entity => entity.personId === house.head.personId);
        assert.ok(head, "the head must be a real resident");
        assert.equal(Boolean(head.dead), false);
        assert.equal(house.head.name, head.person.name);
        assert.ok(house.memberCount >= 1);
        assert.ok(house.loyalty >= 0 && house.loyalty <= 100);
        assert.ok(house.wealth >= 0 && house.wealth <= 100);
    }
});

test("a royal charter spends real goods, binds the house and changes faction politics", () => {
    startRealm();
    const house = getNobilitySnapshot().houses[0];
    const before = getPoliticalSnapshot();
    const result = grantNobleCharter(house.id);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, 200 - NOBILITY_CHARTER_COST.gold);
    assert.equal(state.resources.wood, 200 - NOBILITY_CHARTER_COST.wood);
    assert.equal(state.nobility.houses[0].charter, true);
    assert.ok(result.house.loyalty > house.loyalty);
    assert.ok(getPoliticalSnapshot().factions.nobility > before.factions.nobility);
    assert.equal(grantNobleCharter(house.id).reason, "house-already-chartered");
});

test("calling a levy costs loyalty, raises real combat defence and respects the cooldown", () => {
    startRealm();
    const house = getNobilitySnapshot().houses[0];
    const before = getNobilityDefenseMultiplier();
    const result = callNobleLevy(house.id);
    assert.equal(result.ok, true);
    assert.equal(result.house.mustered, true);
    assert.ok(result.house.loyalty < house.loyalty);
    assert.ok(getNobilityDefenseMultiplier() >= before);
    assert.match(callNobleLevy(house.id).reason, /^levy-cooldown-until-year-/);
    state.year += 1;
    updateNobility();
    assert.equal(state.nobility.houses.find(entry => entry.id === house.id).musteredUntilYear > state.year, true);
});

test("annual noble dues reach the treasury and disloyal houses withhold them", () => {
    startRealm();
    state.year = 2;
    const first = updateNobility();
    assert.equal(first.lastAudit.houses, NOBILITY_HOUSE_LIMIT);
    assert.ok(first.lastAudit.dues > 0);
    assert.equal(first.withheldHouses, 0);
    assert.ok(state.resources.gold > 200);

    const goldBefore = state.resources.gold;
    const politicsBefore = getPoliticalSnapshot();
    state.year = 3;
    for (const house of state.nobility.houses) {
        house.loyalty = 5;
        house.lastUpdateYear = 0;
    }
    const second = updateNobility();
    assert.equal(second.lastAudit.dues, 0);
    assert.equal(second.withheldHouses, NOBILITY_HOUSE_LIMIT);
    assert.equal(state.resources.gold, goldBefore);
    assert.ok(getPoliticalSnapshot().factions.nobility < politicsBefore.factions.nobility);
});

test("malformed noble state normalizes without inventing houses", () => {
    resetState();
    const normalized = normalizeNobilityState({
        version: 99,
        houses: [
            { id: "house-a", familyName: "Ashford", members: Array(80).fill("p"), wealth: 900, loyalty: -4, history: [{ year: "2", kind: "audit", summary: "A house record" }] },
            { id: "house-a", familyName: "Duplicate" },
            { id: "", familyName: "" }
        ],
        defenseBonus: 9,
        history: [{ year: "3", kind: "audit", summary: "Realm record" }]
    });
    assert.equal(normalized.houses.length, 1);
    assert.equal(normalized.houses[0].wealth, 100);
    assert.equal(normalized.houses[0].loyalty, 0);
    assert.equal(normalized.houses[0].members.length, 48);
    assert.equal(normalized.defenseBonus, 1.2);
    assert.equal(normalized.history.length, 1);
    assert.equal(normalized.lastUpdateYear, 0);
    assert.deepEqual(createNobilityState().houses, []);
});

test("the save snapshot carries noble houses through preflight unchanged", () => {
    startRealm();
    state.year = 2;
    updateNobility();
    grantNobleCharter(state.nobility.houses[0].id);
    callNobleLevy(state.nobility.houses[1].id);
    const saved = JSON.parse(JSON.stringify(state.nobility));
    assert.ok(Array.isArray(saved.houses));
    assert.equal(saved.houses.length, NOBILITY_HOUSE_LIMIT);
    assert.ok(saved.houses.some(house => house.charter));
    assert.ok(saved.houses.some(house => house.musteredUntilYear > 0));
    const prepared = prepareSaveSnapshot({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: state.worldSeed,
        entities: [],
        resources: { ...state.resources },
        incomeThisTick: { wood: 0, stone: 0, gold: 0, food: 0 },
        nobility: JSON.parse(JSON.stringify(saved))
    });
    assert.deepEqual(prepared.nobility, saved);
});

test("the command deck and source contracts expose the noble-house panel", async () => {
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    const ui = await readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8");
    const simulation = await readFile(new URL("../../js/simulation/simulation.js", import.meta.url), "utf8");
    assert.match(html, /data-command-tab="nobility"/);
    assert.match(ui, /nobility:nobilityPanel/);
    assert.match(ui, /data-command="noble-charter"/);
    assert.match(ui, /data-command="noble-levy"/);
    assert.match(simulation, /name: "nobility"/);
});
