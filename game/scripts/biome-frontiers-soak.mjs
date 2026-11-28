// 1.2.23.2–16 — deterministic long-term soak for the frontier biome ledger.
// Three world seeds, three centuries each, the real annual chain without the
// renderer, bounded arrays and a finite JSON round-trip.
//
// Usage: npm run test:biome-frontiers-soak
//        FRONTIER_SOAK_YEARS=300 FRONTIER_SOAK_OUT=artifacts/biome-frontiers-soak node scripts/biome-frontiers-soak.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { state, resetState } from "../js/core/state.js";
import { initWorld } from "../js/world/world.js";
import {
    BIOME_FRONTIER_FAMILIES, BIOME_FRONTIER_GOODS_CAP,
    BIOME_FRONTIER_SITE_HISTORY_LIMIT, BIOME_FRONTIER_SPECIALIST_LIMIT,
    BIOME_FRONTIER_SPECIES_LIMIT,
} from "../js/world/biome-frontiers.js";
import {
    ensureBiomeFrontiers, serializeBiomeFrontierState, updateBiomeFrontiers,
} from "../js/systems/biome-frontiers.js";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(gameRoot);
const years = Math.max(25, Math.min(500, Number(process.env.FRONTIER_SOAK_YEARS || 300)));
const outputDir = resolve(process.env.FRONTIER_SOAK_OUT || "artifacts/biome-frontiers-soak");
const seeds = [20261228, 27109, 20261215];
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

const results = [];
for (const seed of seeds) {
    resetState();
    initWorld(seed, worldOptions);
    state.hasStarted = true;
    state.year = 1;
    state.dayOfYear = 0;
    state.resources = { wood: 900, stone: 500, gold: 900, food: 300 };
    state.morale = 55;
    ensureBiomeFrontiers();
    let maxSpecies = 0;
    let maxSpecialists = 0;
    let maxHistory = 0;
    let maxGoods = 0;
    let vanished = 0;
    for (let year = 2; year <= years; year++) {
        state.year = year;
        updateBiomeFrontiers();
        const model = state.biomeFrontiers;
        if (model.sites.length !== 15) throw new Error("Frontier site count changed at year " + year);
        for (const site of model.sites) {
            for (const key of ["condition", "extent", "magic", "corruption", "climatePressure"]) {
                const value = Number(site[key]);
                if (!Number.isFinite(value) || value < 0 || value > 100) {
                    throw new Error("Invalid frontier " + key + " in " + site.family + " at year " + year);
                }
            }
            maxSpecies = Math.max(maxSpecies, site.species.length);
            maxSpecialists = Math.max(maxSpecialists, site.specialists.length);
            maxHistory = Math.max(maxHistory, site.history.length);
            maxGoods = Math.max(maxGoods, site.goods.reduce((sum, good) => sum + good.stock, 0));
            if (site.goods.some(good => good.stock < 0 || good.stock > BIOME_FRONTIER_GOODS_CAP)) {
                throw new Error("Frontier goods exceeded their bound at year " + year);
            }
        }
        if (model.history.length > 32) throw new Error("Frontier history grew without a bound.");
    }
    const model = state.biomeFrontiers;
    const serialized = serializeBiomeFrontierState();
    const json = JSON.stringify(serialized);
    if (json.includes("NaN") || json.includes("Infinity")) throw new Error("Soak produced a non-finite saved value.");
    vanished = model.sites.filter(site => site.phase === "vanished").length;
    if (maxSpecies > BIOME_FRONTIER_SPECIES_LIMIT) throw new Error("Species grew past the bound.");
    if (maxSpecialists > BIOME_FRONTIER_SPECIALIST_LIMIT) throw new Error("Specialists grew past the bound.");
    if (maxHistory > BIOME_FRONTIER_SITE_HISTORY_LIMIT) throw new Error("Site history grew past the bound.");
    results.push({
        seed,
        years,
        sites: model.sites.length,
        warming: model.climate.warming,
        averageCondition: Math.round(model.sites.reduce((sum, site) => sum + site.condition, 0) / model.sites.length * 10) / 10,
        surveyed: model.sites.filter(site => site.surveyed).length,
        conserved: model.sites.filter(site => site.protected).length,
        vanished,
        transfigured: model.sites.filter(site => site.aspect === "transfigured").length,
        blighted: model.sites.filter(site => site.aspect === "blighted").length,
        catastrophes: model.stats.catastrophes,
        magicEvents: model.stats.magicEvents,
        climateShifts: model.stats.climateShifts,
        maxSpecies,
        maxSpecialists,
        maxHistory,
        maxGoodsPerSite: maxGoods,
        families: BIOME_FRONTIER_FAMILIES.length,
        phases: Object.fromEntries(BIOME_FRONTIER_FAMILIES.map(family => [
            family.id, model.sites.find(site => site.family === family.id)?.phase || "missing",
        ])),
    });
}

await mkdir(outputDir, { recursive: true });
const reportPath = resolve(outputDir, "biome-frontiers-soak.json");
await writeFile(reportPath, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), years, results }, null, 2));
const worst = results.reduce((sum, row) => sum + row.vanished, 0);
console.log("BIOME FRONTIER SOAK PASS", JSON.stringify({
    seeds: seeds.length, years, sites: 15,
    vanished: results.map(row => row.vanished), catastrophes: results.map(row => row.catastrophes),
    magicEvents: results.map(row => row.magicEvents), climateShifts: results.map(row => row.climateShifts),
    report: reportPath,
}));
if (worst >= 45) throw new Error("Every frontier site vanished in the soak; the catalogue lost its living baseline.");
