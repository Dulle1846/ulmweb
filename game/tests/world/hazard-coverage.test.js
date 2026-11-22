// 1.2.20 — the evidence contract and the behaviours that were previously only
// implied by a catalogue label.
//
// The first test walks every one of the 102 rows: every row must name a real
// simulation rule, a HAZARDS/EVENT LOG surface that exists in the shipped UI,
// and a focused test whose title is present in the repository. The remaining
// tests prove the paths that used to have no world consumer: real herd losses,
// magic rare pressure, the targeted protection works, cursed/forbidden magic,
// and the volcanic/economic annual consequences.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    HAZARD_CATALOG, HAZARD_EFFECTS, REGIONAL_BUNDLES
} from "../../js/world/hazard-data.js";
import {
    HAZARD_EVIDENCE, HAZARD_EVIDENCE_BY_MECHANIC, HAZARD_SURFACES
} from "../../js/world/hazard-evidence.js";
import {
    awakenCursedCreature
} from "../../js/systems/hazard-response.js";
import {
    createEnvironmentalHazardState, getHazardExposureRelief,
    updateEnvironmentalHazardYear
} from "../../js/systems/environmental-hazards.js";
import { getHazardScarSnapshot } from "../../js/systems/hazard-scars.js";
import {
    damageHazardHerds, ensureForestFauna, resetForestFauna
} from "../../js/systems/forest-fauna.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    getHazardSimulationEffects, invalidateHazardModifierCache
} from "../../js/systems/hazard-modifiers.js";

function baseRealm(climate = "temperate") {
    resetState();
    resetForestFauna();
    state.worldSeed = 20261122;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 55, ruggedness: 55, forests: 72, water: 45, climate };
    state.heightMap = new Float32Array(96 * 96).fill(0.72);
    state.moistureMap = new Float32Array(96 * 96).fill(0.78);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.56);
    state.resources = { wood: 400, stone: 300, gold: 500, food: 180 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.entities = [];
    state.year = 5;
    state.seasonIndex = 1;
    state.tick = 900;
    state.hasStarted = true;
    state.gameOver = false;
    state.health = {
        outbreakActive: false, disease: "none", severity: 0, containment: 0,
        cases: 0, recovered: 0, outbreaks: 0, herbalDoses: 0, herbalTreated: 0,
        lastUpdateTick: 0, startedAtTick: 0, healers: [], medicine: 0,
        sanitation: { score: 60 }
    };
    state.diplomacy = { realms: [] };
    state.environmentalHazards = createEnvironmentalHazardState();
    generateResourceGeography(state.worldSeed);
    return state.environmentalHazards;
}

function addBuilding(type, index) {
    const entity = {
        id: "proof-" + type + "-" + index, type, x: 8 + index, y: 8,
        hp: 120, maxHp: 120, dead: false, isBuilding() { return true; }
    };
    state.entities.push(entity);
    return entity;
}

function herdTotal() {
    const model = ensureForestFauna();
    return (model?.herds || []).reduce((sum, herd) => sum + Math.max(0, Number(herd.population) || 0), 0);
}

test("1.2.20 evidence contract covers all 102 catalogue points", () => {
    assert.equal(HAZARD_CATALOG.length, 102);
    assert.equal(Object.keys(HAZARD_EVIDENCE).length, 102);
    const panel = readFileSync(resolve(process.cwd(), "js/presentation/hazard-panel.js"), "utf8");
    const index = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const hazardSource = readFileSync(resolve(process.cwd(), "js/systems/environmental-hazards.js"), "utf8");
    const primitiveKeys = ["outbreak", "illness", "injury", "food", "wood", "stone", "water",
        "work", "morale", "field", "pasture", "trade", "herd", "ash", "destroy", "permanent", "odd"];
    for (const row of HAZARD_CATALOG) {
        const evidence = HAZARD_EVIDENCE[row.spec];
        assert.ok(evidence, "missing evidence for " + row.spec);
        assert.equal(evidence.mechanic, row.mechanic);
        assert.ok(evidence.effect && evidence.effect.length > 12,
            row.spec + " must name a simulation effect");
        assert.equal(evidence.passive, false, row.spec + " is not allowed to be passive without a reason");
        assert.equal(evidence.passiveReason, "");
        assert.ok(evidence.surfaces.length > 0, row.spec + " needs a visible surface");
        assert.ok(evidence.tests.length > 0, row.spec + " needs a focused test");
        for (const surface of evidence.surfaces) {
            const marker = surface.includes(" > ") ? surface.split(" > ").pop() : surface;
            const source = marker === "EVENT LOG" ? index : panel;
            assert.ok(source.includes(marker), row.spec + " surface marker missing: " + marker);
        }
        for (const ref of evidence.tests) {
            const source = readFileSync(resolve(process.cwd(), ref.file), "utf8");
            assert.ok(source.includes(ref.name), row.spec + " test missing: " + ref.file + " · " + ref.name);
        }
        if (row.mechanic.startsWith("hazard:")) {
            const effects = HAZARD_EFFECTS[row.mechanic];
            assert.ok(effects && Object.keys(effects).length > 0, row.spec + " has no effect values");
            for (const key of Object.keys(effects)) {
                assert.ok(primitiveKeys.includes(key), row.spec + " uses an unknown primitive " + key);
                assert.ok(hazardSource.includes("effects." + key), row.spec + " primitive has no applyHazard branch: " + key);
                assert.ok(evidence.effect.includes(key), row.spec + " omits effect " + key);
            }
        }
        if (row.mechanic.startsWith("bundle:")) {
            const bundle = REGIONAL_BUNDLES[row.mechanic];
            assert.ok(bundle && bundle.hazards.length > 0);
            for (const key of bundle.hazards) assert.ok(evidence.effect.includes(key), row.spec + " omits bundle hazard " + key);
        }
    }
    for (const [mechanic, evidence] of Object.entries(HAZARD_EVIDENCE_BY_MECHANIC)) {
        assert.ok(evidence.effect, mechanic + " has no evidence entry");
    }
    assert.equal(HAZARD_SURFACES.active, "HAZARDS > ACTIVE HAZARDS");
});

test("1.2.20 animal plague culls real herds and persists across settlements", () => {
    const entry = baseRealm("savanna");
    const model = ensureForestFauna();
    assert.ok(model?.herds?.length > 0, "fixture needs real herds");
    const before = herdTotal();
    const direct = damageHazardHerds(0.12, "proof:epizootic");
    assert.ok(direct.affected > 0, "the disease must reach at least one herd");
    assert.ok(direct.lost > 0, "the disease must remove real animals");
    assert.ok(herdTotal() < before, "the saved herd population must fall");

    entry.active = [{
        id: "epizootic", mechanic: "hazard:epizootic", label: "Animal plagues",
        category: "flora", spec: "1.2.20.30", severity: 0.9, startedYear: state.year, effects: {}
    }];
    entry.lastYear = 0;
    state.year = 6;
    const secondBefore = herdTotal();
    const result = updateEnvironmentalHazardYear();
    assert.ok(entry.losses.herds > 0, "the annual plague must write real herd losses");
    assert.ok(herdTotal() < secondBefore, "a plague that lasts into the next year keeps taking animals");
    assert.ok(entry.chronic.epizooticRegions.includes("royal pasture"),
        "the annual state names the affected region");
    assert.ok(result.events.some(line => /ANIMAL PLAGUE/.test(line)));
});

test("1.2.20 magic rare pressure seeds a real rare chain", () => {
    const entry = baseRealm("enchanted");
    entry.magic.rareYears = 8;
    entry.lastYear = 0;
    state.year = 6;
    const result = updateEnvironmentalHazardYear();
    assert.ok(entry.rare?.chainId, "magic:rare must create a real rare chain");
    assert.ok(entry.rare.endsYear >= state.year, "the chain must own a multi-year window");
    assert.equal(entry.magic.rareYears, 0, "the pressure is spent when the chain is drawn");
    assert.ok(result.events.some(line => /RARE EVENT|OLD MAGIC/.test(line)));
});

test("1.2.20 targeted works change their own risk and loss path", () => {
    baseRealm("temperate");
    const bare = getHazardExposureRelief("hazard:drought");
    assert.equal(bare.illness, 1);
    assert.equal(bare.outbreak, 1);
    assert.equal(bare.foodLoss, 1);
    assert.equal(bare.waterLoss, 1);
    assert.equal(bare.field, 1);
    assert.equal(bare.trade, 1);
    assert.equal(bare.movement, 1);

    const types = [TYPE.WELL, TYPE.MILL, TYPE.FARM, TYPE.DRAINAGE, TYPE.BATHHOUSE,
        TYPE.WEATHER_HOUSE, TYPE.WAREHOUSE, TYPE.SCHOOL, TYPE.SCRIPTORIUM,
        TYPE.BARRACKS, TYPE.SMITHY, TYPE.KEEP];
    for (let index = 0; index < types.length; index++) addBuilding(types[index], index);
    for (let index = 0; index < 40; index++) {
        state.roads.tiles[index + ":0"] = { type: "dirt", builtAtTick: 0, condition: 100 };
    }
    const drought = getHazardExposureRelief("hazard:drought");
    const water = getHazardExposureRelief("hazard:water-disease");
    const cold = getHazardExposureRelief("hazard:cold");
    const storm = getHazardExposureRelief("hazard:storm");

    assert.ok(drought.field < 1, "irrigation must cut the drought field damage");
    assert.ok(drought.waterLoss < 1, "wells and warehouses must cut water loss");
    assert.ok(drought.foodLoss < 1, "warehouses must cut food loss");
    assert.ok(water.outbreak < 1, "medical care, wells and drainage must cut water-borne outbreak pressure");
    assert.ok(cold.illness < 1, "insulated clothing and homes must cut cold illness");
    assert.ok(cold.illness < getHazardExposureRelief("hazard:parasite", undefined).illness + 0.001,
        "cold protection must be stronger than the generic clothing relief");
    assert.ok(storm.trade < 1, "built roads must cut caravan terms");
    assert.ok(storm.movement < 1, "built roads must cut movement penalties");
});

test("1.2.20 cursed and forbidden burdens reach real consumers", () => {
    baseRealm("enchanted");
    state.entities = [{ id: "king-proof", isKing: true, dead: false, x: 10, y: 10, type: TYPE.VILLAGER }];
    const entry = state.environmentalHazards;
    entry.magic.cursed = 0.6;
    entry.magic.forbidden = 0.8;
    invalidateHazardModifierCache();
    const events = [];
    const creature = awakenCursedCreature(entry, events);
    assert.ok(creature?.isCursedCreature, "a strong curse must raise a real cursed creature");
    assert.ok(events.some(line => /CURSED BEAST/.test(line)));
    const effects = getHazardSimulationEffects();
    assert.ok(effects.raw.extraction > 0, "forbidden growth must enter the saved modifier block");
    assert.ok(effects.extraction < 1, "forbidden growth must lower real extraction");
});

test("1.2.20 volcanic ash and long-term debt reach the annual state", () => {
    const entry = baseRealm("volcanic");
    entry.active = [{
        id: "eruption", mechanic: "hazard:eruption", label: "Volcanic eruptions",
        category: "geology", spec: "1.2.20.17", severity: 1, startedYear: state.year, effects: {}
    }];
    entry.chronic.economicDrag = 0.5;
    entry.lastYear = 0;
    state.year = 6;
    const gold = state.resources.gold;
    const result = updateEnvironmentalHazardYear();
    assert.ok(entry.chronic.volcanicYears >= 3, "an eruption must leave regional ash years");
    assert.ok(getHazardScarSnapshot().counts.lava > 0, "the eruption must convert real terrain");
    assert.ok(state.resources.gold < gold, "the economic drag must take real treasury gold");
    assert.ok(result.events.some(line => /LAVA|ASH|DEBT/.test(line)));
});
