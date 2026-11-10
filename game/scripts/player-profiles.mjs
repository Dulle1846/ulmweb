// Four-seed, three-playstyle 25-year campaign audit.
//
// Run with: npm run test:campaign:players
//
// The driver uses the real simulation, construction, logistics, events and
// ambitions. The only stub is the offscreen canvas used during world
// generation. The three profiles differ in build order and review cadence:
//   builder  - food and housing first, annual needs review
//   settler  - expands farms and cottages before luxury buildings
//   ignorer  - reviews building every sixteen days, relief every second year
//
// Relief is invoked only when the visible population gate is blocked. It is
// the same applyCrownRelief() action the population panel exposes; no test
// mutates resources or ambitions directly.
import { performance } from "node:perf_hooks";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";
import { getCrownReliefOffer, applyCrownRelief } from "../js/systems/crown-relief.js";
import { getPhysicalStock } from "../js/systems/logistics.js";
import { getTradePartners, executeTrade } from "../js/systems/market.js";
import { state } from "../js/core/state.js";

const SEEDS = (process.env.PROFILE_SEEDS || "20261108,7,99,42")
    .split(",").map(value => Number(value.trim())).filter(Number.isFinite);
const PROFILES = (process.env.PROFILE_STYLES || "builder,settler,ignorer")
    .split(",").map(value => value.trim()).filter(value => ["builder", "settler", "ignorer"].includes(value));
const YEARS = Math.max(1, Number(process.env.PROFILE_YEARS || 25));

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

// A mature realm can convert surplus timber and stone into coin through the
// same market trades the economy UI exposes. This is a real player action, not
// a resource grant: it only sells goods above a construction reserve.
function coverGoldReserve() {
    if ((Number(state.resources.gold) || 0) >= 2400) return { sold: 0, gold: 0 };
    const partners = getTradePartners();
    let sold = 0;
    let gold = 0;
    for (const resource of ["wood", "stone"]) {
        while ((Number(state.resources.gold) || 0) < 2400 && (Number(state.resources[resource]) || 0) > 1200) {
            const partner = partners.find(item => item && item.treasury > 0);
            if (!partner) break;
            const result = executeTrade(partner.id, resource, "sell", 25);
            if (!result.ok) break;
            sold += result.amount || 0;
            gold += result.gold || 0;
        }
        if ((Number(state.resources.gold) || 0) >= 2400) break;
    }
    return { sold, gold };
}

const started = performance.now();
const rows = [];
let failed = false;
try {
    for (const seed of SEEDS) {
        for (const profile of PROFILES) {
            let lastYear = 0;
            const relief = { attempts: 0, applied: 0, failed: 0, kinds: {} };
            const result = runCampaign({
                seed,
                profile,
                years: YEARS,
                onTick(snapshot) {
                    if (snapshot.year === lastYear) return;
                    lastYear = snapshot.year;
                    const reviewEvery = profile === "ignorer" ? 2 : 1;
                    if (snapshot.year >= 20) coverGoldReserve();
                    if (snapshot.year < 2 || snapshot.year % reviewEvery !== 0) return;
                    const offer = getCrownReliefOffer();
                    if (!offer || !offer.available) return;
                    relief.attempts++;
                    relief.kinds[offer.kind] = (relief.kinds[offer.kind] || 0) + 1;
                    const action = applyCrownRelief();
                    if (action.ok) relief.applied++;
                    else relief.failed++;
                }
            });
            const row = {
                seed,
                profile,
                ok: result.ok,
                population: result.final.population,
                year: result.finalYear,
                completed: result.completedIds.length,
                tickCostMs: result.tickCostMs,
                stalls: result.diagnostics.stalledSites.length,
                gameOver: result.gameOver,
                relief,
                diagnostics: result.diagnostics,
                stock: { planks: getPhysicalStock("planks"), cutStone: getPhysicalStock("cutStone"), logs: getPhysicalStock("logs"), firewood: getPhysicalStock("firewood") },
                yearly: result.yearly,
                final: result.final,
                requirements: result.requirements
            };
            rows.push(row);
            if (!result.ok) failed = true;
            console.log("PROFILE RESULT", JSON.stringify(row));
        }
    }
} finally {
    globalThis.document = previousDocument;
}

const summary = {
    ok: !failed,
    seeds: SEEDS,
    profiles: PROFILES,
    elapsedMs: Math.round(performance.now() - started),
    rows
};
console.log("PLAYER PROFILE CAMPAIGN", JSON.stringify(summary, null, 2));
if (failed) process.exitCode = 1;
