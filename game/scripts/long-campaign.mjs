// Reproducible headless 25-year campaign audit.
// Run with: npm run test:campaign  (or node scripts/long-campaign.mjs)
//
// The real terrain generator, starting kingdom, construction, logistics,
// events, royal house and ambitions are used. The only stub is the canvas
// needed by the one-off terrain prerender during initWorld().
import { performance } from "node:perf_hooks";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";

const SEED = Number(process.env.CAMPAIGN_SEED || 20261108);
const YEARS = Math.max(1, Number(process.env.CAMPAIGN_YEARS || 25));
const ERA = process.env.CAMPAIGN_ERA || "common-weal";
const MIN_AGENDA_STAGES = Math.max(1, Math.min(3, Number(process.env.CAMPAIGN_MIN_AGENDA_STAGES || 1)));
const CLIMATE = process.env.CAMPAIGN_CLIMATE || "temperate";

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

let result;
try {
    result = runCampaign({
        seed: SEED, years: YEARS, era: ERA, minAgendaStages: MIN_AGENDA_STAGES,
        worldOptions: { climate: CLIMATE },
    });
} finally {
    globalThis.document = previousDocument;
}

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

const fuelBackfill = result.diagnostics?.fuelBackfill;
if (!result.ok) {
    console.error("LONG CAMPAIGN FAILED");
    process.exitCode = 1;
}
if (!fuelBackfill || fuelBackfill.orders < 1 || fuelBackfill.maxOrdersPerPhase > 1) {
    console.error("FUEL BACKFILL EVIDENCE FAILED", JSON.stringify(fuelBackfill || null));
    process.exitCode = 1;
}
