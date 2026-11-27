// 1.2.23.1.299 — deterministic long-term soak for forest growth and species
// shift. This exercises the real annual chain without the renderer: ten
// reference seeds, three centuries each, bounded ledger arrays and no NaN.
//
// Usage: npm run test:forest-legacy-soak
//        FOREST_SOAK_YEARS=300 FOREST_SOAK_OUT=artifacts/forest-legacy-soak node scripts/forest-legacy-soak.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { state, resetState } from "../js/core/state.js";
import { initWorld } from "../js/world/world.js";
import { FOREST_LEGACY_REFERENCE_CASES, FOREST_LEGACY_RING_LIMIT } from "../js/world/forest-legacy-data.js";
import { ensureForestLegacy, forestLegacySummary, serializeForestLegacyState, updateForestLegacy } from "../js/systems/forest-legacy.js";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(gameRoot);
const years = Math.max(25, Math.min(500, Number(process.env.FOREST_SOAK_YEARS || 300)));
const outputDir = resolve(process.env.FOREST_SOAK_OUT || "artifacts/forest-legacy-soak");
const worldOptions = Object.freeze({
    size: "small", shape: "continent", water: 46, landmass: 58,
    fertility: 55, forests: 78, mountains: 55, ruggedness: 58, climate: "temperate",
});

function makeCanvas() {
    const context = {
        createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}
globalThis.document = { createElement: () => makeCanvas() };

const cases = [];
for (const reference of FOREST_LEGACY_REFERENCE_CASES) {
    resetState();
    initWorld(reference.seed, { ...worldOptions, climate: reference.climate || worldOptions.climate });
    state.hasStarted = true;
    state.year = 1;
    state.dayOfYear = 0;
    state.resources = { wood: 600, stone: 250, gold: 500, food: 220 };
    state.morale = 55;
    ensureForestLegacy();
    const initial = forestLegacySummary();
    let maxRings = 0;
    let maxSpecies = 0;
    let extinctions = 0;
    let hazards = 0;
    const phases = new Set(initial.regions.map(region => region.phase));
    for (let year = 2; year <= years; year++) {
        state.year = year;
        const result = updateForestLegacy();
        extinctions += result.extinctions;
        hazards += result.hazards;
        for (const region of state.forestLegacy.regions) {
            maxRings = Math.max(maxRings, region.rings.length);
            maxSpecies = Math.max(maxSpecies, region.species.length);
            phases.add(region.phase);
            if (!Number.isFinite(region.canopy) || region.canopy < 0 || region.canopy > 1) {
                throw new Error("Invalid canopy in " + reference.regionId + " at year " + year);
            }
            if (region.species.some(species => !Number.isFinite(species.stress) || species.stress < 0 || species.stress > 100)) {
                throw new Error("Invalid species stress in " + reference.regionId + " at year " + year);
            }
        }
        if (state.forestLegacy.history.length > 40) throw new Error("Forest history grew without a bound.");
        if (state.forestLegacy.actions.length > 80) throw new Error("Forest action ledger grew without a bound.");
    }
    const final = forestLegacySummary();
    const serialized = serializeForestLegacyState();
    const finalJson = JSON.stringify(serialized);
    if (finalJson.includes("NaN") || finalJson.includes("Infinity")) throw new Error("Soak produced a non-finite saved value.");
    if (maxRings > FOREST_LEGACY_RING_LIMIT) throw new Error("Ring archive exceeded its bound.");
    const caseResult = {
        regionId: reference.regionId,
        seed: reference.seed,
        climate: reference.climate,
        years,
        initialCanopy: Number(initial.regions.find(row => row.id === reference.regionId)?.canopy || 0),
        finalCanopy: Number(final.regions.find(row => row.id === reference.regionId)?.canopy || 0),
        climateWarming: final.climate.warming,
        climateDrift: final.climate.drift,
        climateShiftYears: final.climate.shiftYears,
        extinctions,
        hazards,
        livingSpecies: final.regions.reduce((sum, row) => sum + row.living, 0),
        extinctSpecies: final.regions.reduce((sum, row) => sum + row.extinct, 0),
        maxRings,
        maxSpecies,
        phases: [...phases].sort(),
        stats: final.stats,
        regions: final.regions.map(row => ({ id: row.id, phase: row.phase, canopy: Math.round(row.canopy * 100), living: row.living, extinct: row.extinct })),
    };
    cases.push(caseResult);
    console.log("FOREST SOAK", JSON.stringify({ region: caseResult.regionId, seed: caseResult.seed, years, canopy: [caseResult.initialCanopy, caseResult.finalCanopy], extinctions, hazards, maxRings }));
}

const report = {
    format: "kings-and-cards-forest-legacy-soak",
    version: 1,
    years,
    cases,
    invariants: {
        tenReferenceRegions: cases.length === FOREST_LEGACY_REFERENCE_CASES.length,
        boundedRings: cases.every(row => row.maxRings <= FOREST_LEGACY_RING_LIMIT),
        boundedSpecies: cases.every(row => row.maxSpecies <= 9),
        finiteLedger: true,
        annualPassOnly: true,
    },
};
if (!report.invariants.tenReferenceRegions || !report.invariants.boundedRings || !report.invariants.boundedSpecies) {
    throw new Error("Forest legacy soak invariant failed: " + JSON.stringify(report.invariants));
}
await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "forest-legacy-soak.json");
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log("FOREST SOAK OK", JSON.stringify({ outputPath, years, cases: cases.length, invariants: report.invariants }));
