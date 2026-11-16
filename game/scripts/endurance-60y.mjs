// Deterministic 60-year endurance audit.
//
// Runs the real campaign driver (terrain, construction, logistics, events,
// royal house, economy, diplomacy, realm cycle and the rare-biome atlas),
// then proves the real save pipeline restores the coupling block exactly.
// A second pass removes specialBiomes entirely, as an old save would, and
// checks that loading generates a fresh atlas and coupling block.
//
// Run with: npm run test:endurance:60
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";
import { resetState, state } from "../js/core/state.js";
import { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot } from "../js/core/save-runtime.js";
import { createIdentityState } from "../js/systems/identity.js";
import { createLegacyState } from "../js/systems/legacy.js";
import { onSpecialBiomeDiscovered, onSpecialBiomeAttuned, updateSpecialBiomeCouplings, getSpecialBiomeInfluence } from "../js/systems/special-biome-couplings.js";

const YEARS = Math.max(60, Number(process.env.ENDURANCE_YEARS || 60));
const SEED = Number(process.env.ENDURANCE_SEED || 20261108);
const OUT = resolve(process.cwd(), "reports");

function canvasStub() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {}
            };
        }
    };
}

function initializeAuditRealm() {
    state.activeProfileId = "biome-60y-audit";
    state.playerName = "Sixty Year Audit";
    state.identity = createIdentityState({
        kingdomName: "The Living Atlas",
        dynastyName: "Royal House",
        foundedYear: 1
    });
    state.kingdomName = state.identity.kingdomName;
    state.royal.dynastyName = state.identity.dynastyName;
    state.legacy = createLegacyState({ foundedYear: 1 });
}

function differences(a, b, path = "snapshot", out = []) {
    if (out.length >= 24) return out;
    if (Object.is(a, b)) return out;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
        out.push(path + ": " + JSON.stringify(a) + " != " + JSON.stringify(b));
        return out;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            out.push(path + ": array " + a?.length + " != " + b?.length);
            return out;
        }
        for (let index = 0; index < a.length; index++) differences(a[index], b[index], path + "[" + index + "]", out);
        return out;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(key in a)) out.push(path + "." + key + ": missing on saved");
        else if (!(key in b)) out.push(path + "." + key + ": missing on restored");
        else differences(a[key], b[key], path + "." + key, out);
        if (out.length >= 24) break;
    }
    return out;
}

function seedCouplingState() {
    const atlas = state.specialBiomes;
    assert.ok(atlas && atlas.regions.length, "the 60-year realm must have an atlas");
    const region = atlas.regions[0];
    region.discovered = true;
    region.discoveredYear = Math.max(1, state.year - 1);
    atlas.rareGoods[region.resource] = Math.max(3, Number(atlas.rareGoods[region.resource]) || 0);
    onSpecialBiomeDiscovered(region);
    const attuned = onSpecialBiomeAttuned(region);
    assert.ok(attuned, "the fixture must open a rite");
    region.attuned = true;
    atlas.couplings.rites = Math.max(1, atlas.couplings.rites);
    const blight = atlas.regions.find(entry => entry.family === "blighted-land");
    if (blight) {
        blight.discovered = true;
        blight.spread = Math.max(3, blight.spread);
        atlas.couplings.lastYear = Math.max(1, state.year - 1);
        atlas.couplings.lastDecisionYear = 0;
        updateSpecialBiomeCouplings();
    }
    assert.ok(atlas.couplings.quests.length >= 2, "the fixture must persist quest and rite state");
    return atlas;
}

const previousDocument = globalThis.document;
globalThis.document = { createElement: () => canvasStub() };
try {
    await mkdir(OUT, { recursive: true });
    const campaign = runCampaign({ seed: SEED, years: YEARS, onInitialized: initializeAuditRealm });
    assert.equal(campaign.ok, true, "the 60-year campaign must meet every existing requirement");
    assert.equal(campaign.gameOver, false, "the realm must not end during the endurance run");

    const atlas = seedCouplingState();
    const saved = JSON.parse(JSON.stringify(createSaveSnapshot()));
    assert.ok(saved.specialBiomes?.couplings, "the save must contain the coupling block");
    assert.ok(saved.specialBiomes.couplings.quests.length >= 2);
    assert.ok(saved.specialBiomes.couplings.rites >= 1);
    const savedInfluence = getSpecialBiomeInfluence();

    const prepared = prepareSaveSnapshot(JSON.parse(JSON.stringify(saved)));
    assert.equal(prepared.saveSchemaVersion, saved.saveSchemaVersion);
    resetState();
    state.activeProfileId = "biome-60y-audit";
    state.playerName = saved.playerName;
    state.hasStarted = true;
    state.isPaused = false;
    restoreSaveSnapshot(prepared);
    const restored = JSON.parse(JSON.stringify(createSaveSnapshot()));
    const couplingDelta = differences(saved.specialBiomes, restored.specialBiomes, "specialBiomes");
    assert.deepEqual(couplingDelta, [], "the full atlas and coupling block must restore exactly");
    assert.deepEqual(restored.specialBiomes.couplings, saved.specialBiomes.couplings);
    assert.equal(getSpecialBiomeInfluence().signature, savedInfluence.signature);
    assert.ok(restored.specialBiomes.regions.some(region => region.discovered && region.attuned));

    const legacy = JSON.parse(JSON.stringify(saved));
    delete legacy.specialBiomes;
    const preparedLegacy = prepareSaveSnapshot(legacy);
    resetState();
    state.activeProfileId = "biome-60y-audit";
    state.playerName = legacy.playerName;
    state.hasStarted = true;
    state.isPaused = false;
    restoreSaveSnapshot(preparedLegacy);
    const legacyRestored = JSON.parse(JSON.stringify(createSaveSnapshot()));
    assert.ok(legacyRestored.specialBiomes, "an old save without the block must regenerate the atlas");
    assert.ok(legacyRestored.specialBiomes.regions.length > 0, "the fresh atlas must contain regions");
    assert.ok(legacyRestored.specialBiomes.couplings, "the fresh atlas must contain a coupling block");
    assert.equal(legacyRestored.specialBiomes.couplings.version, 1);

    const report = {
        schema: 1,
        ok: true,
        generatedAt: new Date().toISOString(),
        seed: SEED,
        years: YEARS,
        totalTicks: campaign.totalTicks,
        finalYear: campaign.finalYear,
        tickCostMs: campaign.tickCostMs,
        budgetMs: 6,
        budgetMet: campaign.tickCostMs <= 6,
        campaignRequirements: campaign.requirements,
        population: campaign.final.population,
        specialBiomes: {
            regions: saved.specialBiomes.regions.length,
            discovered: saved.specialBiomes.regions.filter(region => region.discovered).length,
            attuned: saved.specialBiomes.regions.filter(region => region.attuned).length,
            quests: saved.specialBiomes.couplings.quests.length,
            rites: saved.specialBiomes.couplings.rites,
            blightDecision: saved.specialBiomes.couplings.blightDecision ? saved.specialBiomes.couplings.blightDecision.regionName : null,
            savedInfluence: savedInfluence.signature
        },
        saveRoundtrip: {
            withBiomeBlock: couplingDelta.length === 0,
            withoutBiomeBlock: legacyRestored.specialBiomes.regions.length > 0 && Boolean(legacyRestored.specialBiomes.couplings)
        }
    };
    assert.equal(report.budgetMet, true, "the mature 60-year realm must stay inside the 6 ms/tick budget");
    await writeFile(resolve(OUT, "endurance-60y.json"), JSON.stringify(report, null, 2) + "\n");
    await writeFile(resolve(OUT, "endurance-60y.md"), [
        "# 60-year biome endurance audit",
        "",
        "| Measure | Result |",
        "| --- | --- |",
        "| Campaign | " + (campaign.ok ? "green" : "failed") + " |",
        "| Years / ticks | " + report.years + " / " + report.totalTicks.toLocaleString("en-US") + " |",
        "| Final year | " + report.finalYear + " |",
        "| Mature tick cost | **" + report.tickCostMs.toFixed(3) + " ms/tick** |",
        "| Budget | " + report.budgetMs + " ms/tick · " + (report.budgetMet ? "met" : "over") + " |",
        "| Save/load with biome block | " + (report.saveRoundtrip.withBiomeBlock ? "exact" : "failed") + " |",
        "| Save/load without biome block | " + (report.saveRoundtrip.withoutBiomeBlock ? "fresh atlas and couplings" : "failed") + " |",
        "| Coupling state | " + report.specialBiomes.quests + " quests · " + report.specialBiomes.rites + " rites · blight decree " + (report.specialBiomes.blightDecision || "none") + " |",
        "",
        "The run uses the real campaign driver and the real save pipeline. It has no browser canvas dependency beyond the terrain prerender stub.",
        ""
    ].join("\n"));
    console.log("BIOME ENDURANCE 60Y", JSON.stringify(report, null, 2));
} finally {
    globalThis.document = previousDocument;
}
