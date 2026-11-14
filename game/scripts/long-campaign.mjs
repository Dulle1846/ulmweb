// Reproducible headless 25-year campaign audit.
// Run with: npm run test:campaign  (or node scripts/long-campaign.mjs)
// Seed sweep: npm run test:campaign:sweep
//
// The real terrain generator, starting kingdom, construction, logistics,
// events, royal house and ambitions are used. The only stub is the canvas
// needed by the one-off terrain prerender during initWorld().
import { performance } from "node:perf_hooks";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";
import { evaluateCampaignSweep } from "../tests/campaign/sweep-results.mjs";

const SEED = Number(process.env.CAMPAIGN_SEED || 20261108);
const SEEDS = String(process.env.CAMPAIGN_SEEDS || "")
    .split(",")
    .map(value => Number(value.trim()))
    .filter(value => Number.isSafeInteger(value) && value > 0);
const YEARS = Math.max(1, Number(process.env.CAMPAIGN_YEARS || 25));
const ERA = process.env.CAMPAIGN_ERA || "common-weal";
const MIN_AGENDA_STAGES = Math.max(1, Math.min(3, Number(process.env.CAMPAIGN_MIN_AGENDA_STAGES || 1)));
const CLIMATE = process.env.CAMPAIGN_CLIMATE || "temperate";
const SWEEP_SEEDS = SEEDS.length ? SEEDS : [SEED];
const SWEEP_MODE = SWEEP_SEEDS.length > 1;

function makeCanvasStub() {
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

const previousDocument = globalThis.document;
globalThis.document = {
    createElement(tag) {
        if (tag !== "canvas") throw new Error("Unexpected DOM element in campaign: " + tag);
        return makeCanvasStub();
    }
};

const results = [];
try {
    for (const seed of SWEEP_SEEDS) {
        const result = runCampaign({
            seed, years: YEARS, era: ERA, minAgendaStages: MIN_AGENDA_STAGES,
            worldOptions: { climate: CLIMATE },
        });
        results.push(result);
        const fuel = result.diagnostics?.fuelBackfill || null;
        if (!SWEEP_MODE) {
            const summary = {
                ok: result.ok,
                seed: result.seed,
                years: result.years,
                totalTicks: result.totalTicks,
                elapsedMs: result.elapsedMs,
                tickCostMs: result.tickCostMs,
                finalYear: result.finalYear,
                requirements: result.requirements,
                completedIds: result.completedIds,
                final: result.final,
                yearly: result.yearly,
                diagnostics: result.diagnostics,
                gameOver: result.gameOver,
                ambition: result.ambition,
                era: result.era,
                agendaStages: result.agendaStages,
                campaignEra: result.campaignEra
            };
            console.log("LONG CAMPAIGN", JSON.stringify(summary, null, 2));
        } else {
            console.log("LONG CAMPAIGN SEED", JSON.stringify({
                seed: result.seed,
                ok: result.ok,
                years: result.years,
                totalTicks: result.totalTicks,
                elapsedMs: result.elapsedMs,
                tickCostMs: result.tickCostMs,
                finalYear: result.finalYear,
                requirements: result.requirements,
                gameOver: result.gameOver,
                final: {
                    population: result.final.population,
                    firewood: result.final.firewood,
                    food: result.final.resources.food,
                    gold: result.final.resources.gold,
                    built: result.final.built,
                    eventsResolved: result.final.eventsResolved
                },
                fuelBackfill: fuel ? {
                    orders: fuel.orders,
                    phases: fuel.phases,
                    extensions: fuel.extensions,
                    maxOrdersPerPhase: fuel.maxOrdersPerPhase
                } : null,
                stalledSites: result.diagnostics?.stalledSites?.length ?? 0
            }, null, 2));
        }
    }
} finally {
    globalThis.document = previousDocument;
}

const sweepResult = evaluateCampaignSweep(results, SWEEP_SEEDS);
const failures = sweepResult.failures;
const totalOrders = sweepResult.fuelBackfillOrders;
const totalPhases = sweepResult.fuelBackfillPhases;

if (SWEEP_MODE) {
    const sweep = {
        ok: failures.length === 0,
        climate: CLIMATE,
        seeds: SWEEP_SEEDS,
        years: YEARS,
        runs: results.length,
        allCampaignRequirementsTrue: sweepResult.allCampaignRequirementsTrue,
        fuelBackfillOrders: totalOrders,
        fuelBackfillPhases: totalPhases,
        maxOrdersPerPhase: sweepResult.maxOrdersPerPhase,
        gameOverAny: results.some(result => result.gameOver),
        stalledSitesAny: results.some(result => (result.diagnostics?.stalledSites?.length || 0) > 0),
        tickCostMs: results.map(result => result.tickCostMs),
        failures
    };
    console.log("LONG CAMPAIGN SWEEP", JSON.stringify(sweep, null, 2));
}

if (failures.length) {
    for (const failure of failures) console.error("CAMPAIGN FAILED:", failure);
    process.exitCode = 1;
}
