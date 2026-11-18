// Deterministic Endless Realm campaign.
//
// This is the long-horizon counterpart to the 25-year release campaign. It
// keeps using the real simulation, starting kingdom, construction, logistics,
// events, ambitions, eternal deeds and endeavours; the only stub is the canvas
// used during the one-off terrain prerender.
//
// Run with: npm run test:endless
// Longer run: ENDLESS_YEARS=500 npm run test:endless
import { performance } from "node:perf_hooks";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";
import { state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { getWarehouseSnapshot } from "../js/systems/logistics.js";
import { createEndlessState, getEndlessSnapshot } from "../js/systems/endless.js";

const SEED = Number(process.env.ENDLESS_SEED || process.env.CAMPAIGN_SEED || 20261215);
const YEARS = Math.max(25, Number(process.env.ENDLESS_YEARS || 250));
const CLIMATE = process.env.ENDLESS_CLIMATE || process.env.CAMPAIGN_CLIMATE || "snow";
const ERA = process.env.ENDLESS_ERA || "common-weal";

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
        if (tag !== "canvas") throw new Error("Unexpected DOM element in endless campaign: " + tag);
        return makeCanvasStub();
    }
};

const started = performance.now();
let result;
let failure = null;
try {
    result = runCampaign({
        seed: SEED,
        years: YEARS,
        era: ERA,
        worldOptions: { climate: CLIMATE },
        sampleTicks: 120,
        onInitialized(runtimeState) {
            runtimeState.endless = createEndlessState({ enabled: true });
        }
    });
} catch (error) {
    failure = error?.stack || error?.message || String(error);
} finally {
    globalThis.document = previousDocument;
}

if (!result) {
    console.error("ENDLESS CAMPAIGN FAILED:", failure);
    process.exitCode = 1;
} else {
    const endless = getEndlessSnapshot();
    const entities = state.entities.filter(entity => !entity.dead);
    const livingPopulation = entities.filter(entity => entity.type === TYPE.VILLAGER).length;
    const warehouse = getWarehouseSnapshot();
    const firewood = Number(warehouse.stock?.firewood) || 0;
    const ids = entities.map(entity => entity.id).filter(Boolean);
    const expectedAge = Math.floor((state.year - 1) / 25) + 1;
    const resources = ["wood", "stone", "gold", "food"].map(key => Number(state.resources?.[key]));
    const checks = {
        horizon: state.year >= YEARS,
        noGameOver: !state.gameOver,
        endlessEnabled: endless.enabled,
        ageMatchesCalendar: endless.age === expectedAge,
        ageProgress: endless.age >= Math.max(1, Math.floor(YEARS / 25)),
        bestYear: endless.bestYear >= state.year,
        historyBounded: endless.historyLength <= 12,
        entityCap: entities.length <= 900,
        uniqueIds: new Set(ids).size === ids.length,
        finiteCoordinates: entities.every(entity => Number.isFinite(entity.x) && Number.isFinite(entity.y)),
        resourcesFinite: resources.every(value => Number.isFinite(value) && value >= 0),
        moraleRange: Number.isFinite(state.morale) && state.morale >= 0 && state.morale <= 100,
        campaignNotTerminal: !result.gameOver,
        // A technically running simulation with no residents is not an endless
        // realm. These checks keep the old green-but-dead result from passing.
        livingPopulation: livingPopulation > 0,
        populationFloor: livingPopulation >= 20,
        foodStore: Number(state.resources?.food) > 0,
        woodStore: Number(state.resources?.wood) > 0,
        firewoodStore: firewood > 0,
        housing: Boolean(result.requirements?.housing),
        farms: Boolean(result.requirements?.farms),
        bakeries: Boolean(result.requirements?.bakeries),
        mills: Boolean(result.requirements?.mills),
        tower: Boolean(result.requirements?.tower),
        rescueBound: endless.rescues <= 25
    };
    const ok = Object.values(checks).every(Boolean);
    const summary = {
        ok,
        seed: SEED,
        climate: CLIMATE,
        era: ERA,
        years: YEARS,
        totalTicks: result.totalTicks,
        elapsedMs: Math.round(performance.now() - started),
        tickCostMs: result.tickCostMs,
        finalYear: state.year,
        finalTick: state.tick,
        endless,
        checks,
        campaignRequirements: result.requirements,
        population: result.final?.population ?? null,
        livingPopulation,
        firewood,
        entities: entities.length,
        eternalDeeds: result.ambition?.eternalCount ?? state.ambitions?.eternal?.count ?? 0,
        completedAmbitions: result.ambition?.completedCount ?? null,
        resources: Object.fromEntries(["wood", "stone", "gold", "food"].map(key => [key, state.resources?.[key]])),
        gameOver: Boolean(state.gameOver),
        failure
    };
    console.log("ENDLESS CAMPAIGN", JSON.stringify(summary, null, 2));
    if (!ok) process.exitCode = 1;
}
