// Deterministic 25-year audit for the four ecosystem processes (117–120).
// It uses the shipped herd model, the real resource geography and the same
// bounded daily update as the game. Every fortieth day it removes one animal
// from the largest huntable herd so carcass, parasite and migration effects
// are exercised by actual play rather than by a test-only mutation.
//
// Run with: node scripts/forest-process-audit.mjs
import { resetState, state } from "../js/core/state.js";
import { generateResourceGeography } from "../js/systems/resource-geography.js";
import {
    ensureForestFauna, updateForestFauna, harvestForestGameAt, FOREST_FAUNA_LIMITS,
} from "../js/systems/forest-fauna.js";
import { forestFaunaEcologyFor } from "../js/world/forest-fauna-ecology.js";
import { forestStandAt } from "../js/world/forest-ecology.js";

const SEED = Number(process.env.AUDIT_SEED || 20261108);
const YEARS = Math.max(1, Number(process.env.AUDIT_YEARS || 25));
const DAYS = YEARS * 400;

function setup() {
    resetState();
    state.worldSeed = SEED;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    generateResourceGeography(SEED);
    return ensureForestFauna();
}

function standFor(herd, day) {
    return forestStandAt(herd.x + 0.5, herd.y + 0.5, {
        seed: SEED,
        moisture: 0.8,
        temperature: 0.55,
        height: 0.7,
        climate: "temperate",
        forests: 70,
        stockRatio: 1,
        rockLine: 0.92,
    }) || null;
}

function round(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

const model = setup();
const initial = {
    herds: model.herds.length,
    population: model.herds.reduce((sum, herd) => sum + herd.population, 0),
    capacity: model.herds.reduce((sum, herd) => sum + herd.capacity, 0),
};
const qualities = { prime: 0, good: 0, lean: 0 };
let hunts = 0, taken = 0, harvestChecks = 0;

for (let day = 0; day < DAYS; day++) {
    updateForestFauna(1);
    if (day % 40 !== 0) continue;
    const candidates = model.herds
        .filter(herd => ["deer", "roe-deer", "boar", "moose", "reindeer", "hare"].includes(herd.species))
        .filter(herd => herd.population >= 2)
        .sort((a, b) => b.population - a.population || String(a.id).localeCompare(String(b.id)));
    const target = candidates[0];
    if (!target) continue;
    const harvest = harvestForestGameAt(target.x, target.y, 1);
    if (harvest) {
        hunts++;
        taken += harvest.taken;
        qualities[harvest.quality] = (qualities[harvest.quality] || 0) + 1;
    }
    harvestChecks++;
}

const samples = [];
const seen = new Set();
for (const herd of model.herds) {
    const key = herd.x + ":" + herd.y;
    if (seen.has(key)) continue;
    seen.add(key);
    const stand = standFor(herd, model.day);
    if (!stand?.forest) continue;
    const record = forestFaunaEcologyFor(stand, { day: model.day, seed: SEED, x: herd.x, y: herd.y });
    if (!record) continue;
    samples.push({
        parasiteLoad: record.parasites.load,
        herdCondition: record.parasites.herdCondition,
        capacityBrake: record.parasites.capacityBrake,
        meatQuality: record.parasites.meatQuality,
        scavenging: record.scavengers.abundance,
        carcassSites: record.scavengers.carcassSites,
        cycleHare: record.cycles.hareLynx.hareIndex,
        cycleLynx: record.cycles.hareLynx.lynxIndex,
        corridor: record.corridors.quality,
        migration: record.corridors.migration,
    });
}

const mean = key => samples.length
    ? round(samples.reduce((sum, row) => sum + Number(row[key] || 0), 0) / samples.length)
    : 0;

const final = {
    seed: SEED,
    years: YEARS,
    days: DAYS,
    herdLimit: FOREST_FAUNA_LIMITS.maxHerds,
    initial: {
        herds: initial.herds,
        population: round(initial.population, 1),
        capacity: round(initial.capacity, 1),
    },
    final: {
        day: model.day,
        herds: model.herds.length,
        population: round(model.herds.reduce((sum, herd) => sum + herd.population, 0), 1),
        deerBoar: round(model.herds
            .filter(herd => ["deer", "roe-deer", "boar", "moose", "reindeer"].includes(herd.species))
            .reduce((sum, herd) => sum + herd.population, 0), 1),
        capacity: round(model.herds.reduce((sum, herd) => sum + herd.capacity, 0), 1),
        fill: round(model.herds.reduce((sum, herd) => sum + herd.population, 0)
            / Math.max(1, model.herds.reduce((sum, herd) => sum + herd.capacity, 0)), 3),
    },
    stats: { ...model.stats },
    harvest: { hunts, taken, checks: harvestChecks, qualities },
    ecology: {
        samples: samples.length,
        meanParasiteLoad: mean("parasiteLoad"),
        meanHerdCondition: mean("herdCondition"),
        meanCapacityBrake: mean("capacityBrake"),
        meanMeatQuality: mean("meatQuality"),
        meanScavenging: mean("scavenging"),
        meanCarcassSites: mean("carcassSites"),
        meanHareIndex: mean("cycleHare"),
        meanLynxIndex: mean("cycleLynx"),
        meanCorridor: mean("corridor"),
        meanMigration: mean("migration"),
    },
    allFinite: [...model.herds.flatMap(herd => [herd.population, herd.capacity])]
        .every(value => Number.isFinite(value)),
};

console.log("FOREST PROCESS AUDIT", JSON.stringify(final, null, 2));
if (!final.allFinite) process.exitCode = 1;
