// End-to-end playability audit for the real starting kingdom.
//
// It opens the shipped start screen, starts a fresh realm on a chosen seed,
// then advances the actual fixed-step simulation while auto-resolving realm
// issues the way a player would. It records the resources, production chains,
// warehouse stock, carrier fleet, ambitions and household needs at every year
// boundary, takes desktop/tablet/mobile screenshots and measures the live
// render rate afterwards. Run with the game served on E2E_BASE_URL.
import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED = Number(process.env.PLAYABILITY_SEED || 20261108);
const TICKS = Math.max(400, Number(process.env.PLAYABILITY_TICKS || 1200));
const root = process.cwd();
const outDir = resolve(root, "..", "artifacts");
await mkdir(outDir, {recursive: true});

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, reducedMotion: "reduce"});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

async function dismissBlockingMessage() {
    const eventDismiss = page.locator("#realm-event-dismiss");
    if (await eventDismiss.isVisible().catch(() => false)) {
        await eventDismiss.click();
        await page.waitForTimeout(120);
    }
    const button = page.locator("#big-message-close");
    if (await button.isVisible().catch(() => false)) await button.click();
}

await page.goto(BASE + "/", {waitUntil: "networkidle", timeout: 60000});
assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
await page.locator("#start-screen").waitFor({state: "visible", timeout: 30000});
await page.locator("#world-seed-input").fill(String(SEED));
await page.waitForFunction(seed => document.querySelector("#world-preview-status")?.textContent.includes("SEED " + seed), String(SEED), {timeout: 20000}).catch(() => {});
await page.locator("#player-name-input").fill("Playability Audit");
await page.locator("#start-new-game-btn").click();
await page.locator("#start-screen").waitFor({state: "hidden", timeout: 30000});
await page.waitForTimeout(1800);
await dismissBlockingMessage();

const started = Date.now();
const report = await page.evaluate(async ({ticks}) => {
    const [{state}, {updateSimulation}, {updateLogisticsMovement, getLogisticsSnapshot, getWarehouseSnapshot}, {resolveEventChoice}, {getAmbitionSnapshot}, {updateServices}, {TYPE}] = await Promise.all([
        import("./js/core/state.js"),
        import("./js/simulation/simulation.js"),
        import("./js/systems/logistics.js"),
        import("./js/systems/events.js"),
        import("./js/systems/ambitions.js"),
        import("./js/systems/settlement.js"),
        import("./js/core/types.js")
    ]);
    const round = (value, digits = 1) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
    const buildings = type => state.entities.filter(entity => !entity.dead && entity.type === type).length;
    function snapshot() {
        const logistics = getLogisticsSnapshot();
        const warehouses = getWarehouseSnapshot();
        const ledger = state.economy?.lastLedger || {};
        return {
            tick: state.tick,
            year: state.year,
            season: state.seasonIndex,
            resources: Object.fromEntries(Object.entries(state.resources).map(([key, value]) => [key, round(value)])),
            morale: round(state.morale),
            population: state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length,
            satisfaction: round(state.city?.needs?.summary?.satisfaction, 3),
            foodDemand: round(ledger.foodDemand, 2),
            foodConsumed: round(ledger.foodConsumed, 2),
            foodShortage: round(ledger.foodShortage, 2),
            production: Object.fromEntries(Object.entries(state.economy?.productionChains || {}).map(([key, value]) => [key, Math.round(Number(value) || 0)])),
            warehouse: warehouses.stock,
            warehouseUsed: warehouses.used,
            warehouseCapacity: warehouses.capacity,
            carriers: logistics.carriers.length,
            jobs: logistics.counts,
            lastRejection: logistics.lastRejection,
            ambition: getAmbitionSnapshot(),
            farms: buildings(TYPE.FARM),
            mills: buildings(TYPE.MILL),
            bakeries: buildings(TYPE.BAKERY)
        };
    }

    state.isPaused = false;
    const marks = [];
    for (let index = 0; index < ticks; index++) {
        updateSimulation();
        if (state.activeEvent) resolveEventChoice(0);
        // One in-game day is 750 ms at 1x. Advancing carriers only 0.2 s per
        // day made hauling 3.75x slower than real play and starved the bakery.
        for (let step = 0; step < 4; step++) updateLogisticsMovement(0.1875);
        if (state.tick % 400 === 0) marks.push(snapshot());
        if (state.gameOver) break;
    }
    state.isPaused = true;
    updateServices();
    const milestones = state.eventLog
        .filter(entry => entry.kind === "milestone")
        .map(entry => ({tick: entry.tick, text: entry.text}));
    const finished = state.city.logistics.jobs.filter(job => job.status === "done");
    return {
        start: marks[0]?.year || 1,
        marks,
        final: snapshot(),
        milestones,
        eventLog: state.eventLog.slice(0, 12).map(entry => entry.text),
        completedJobs: finished.length,
        delivered: state.city.logistics.stats.delivered || 0,
        gameOver: Boolean(state.gameOver),
        victory: Boolean(state.victory),
        gameSpeed: state.gameSpeed
    };
}, {ticks: TICKS});
const simulationMs = Date.now() - started;

await page.waitForTimeout(700);
await dismissBlockingMessage();
const shots = [];
async function shot(width, height, name) {
    await page.setViewportSize({width, height});
    await page.waitForTimeout(500);
    await dismissBlockingMessage();
    const file = resolve(outDir, name);
    await page.screenshot({path: file});
    shots.push(file);
}
await shot(1600, 1000, "kac-playability-1600.png");
await shot(1024, 768, "kac-playability-1024.png");
await shot(864, 1000, "kac-playability-864.png");
await page.setViewportSize({width: 1600, height: 1000});
await page.waitForTimeout(400);

const layout = await page.evaluate(() => {
    const rect = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height)};
    };
    return {
        viewport: {width: innerWidth, height: innerHeight},
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        topbar: rect(".topbar"),
        sidePanel: rect(".side-panel"),
        ambition: rect("#ambition-section"),
        ambitionVisible: Boolean(document.querySelector("#ambition-section")?.offsetParent),
        ambitionTitle: document.querySelector("#ambition-title")?.textContent || null,
        ambitionCount: document.querySelector("#ambition-count")?.textContent || null,
        ambitionLabel: document.querySelector("#ambition-progress-label")?.textContent || null,
        ambitionBar: rect("#ambition-bar")
    };
});

await page.evaluate(async () => {
    const {state} = await import("./js/core/state.js");
    state.isPaused = false;
});
await page.waitForTimeout(3000);
const performanceSample = await page.evaluate(async () => {
    const {state} = await import("./js/core/state.js");
    const stats = {...(state.renderStats || {})};
    state.isPaused = true;
    return stats;
});
await dismissBlockingMessage();

const summary = {
    seed: SEED,
    ticks: TICKS,
    simulationMs,
    ticksPerSecond: Math.round(TICKS / Math.max(1, simulationMs / 1000)),
    marks: report.marks,
    final: report.final,
    milestones: report.milestones,
    eventLog: report.eventLog,
    completedJobs: report.completedJobs,
    delivered: report.delivered,
    gameOver: report.gameOver,
    victory: report.victory,
    performance: performanceSample,
    layout,
    shots,
    pageErrors,
    consoleErrors
};
await writeFile(resolve(outDir, "playability-audit.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();

const final = report.final;
const failures = [];
if (pageErrors.length) failures.push("page errors: " + pageErrors.join(" | "));
if (consoleErrors.length) failures.push("console errors: " + consoleErrors.join(" | "));
if (report.gameOver) failures.push("the realm collapsed during the audit");
if (!(Number(final.resources.food) > 0)) failures.push("royal food is empty at the end of the audit");
for (const good of ["logs", "stoneBlocks", "water", "grain", "flour", "bread"]) {
    const produced = Number(final.production[{logs: "logsHarvested", stoneBlocks: "stoneExtracted", water: "waterDrawn", grain: "grainHarvested", flour: "flourProduced", bread: "breadProduced"}[good]]) || 0;
    if (produced <= 0) failures.push("no production recorded for " + good);
}
if (Number(final.warehouse.bread) <= 0 && Number(final.production.breadProduced) <= 0) failures.push("bread never reached the store");
if (!(Number(final.carriers) > 0)) failures.push("no carriers are working");
if (layout.horizontalOverflow) failures.push("the layout overflows horizontally at 1600x1000");
if (!layout.ambitionVisible) failures.push("the ambition panel is not visible");
if (Number(performanceSample.fps) < 30) failures.push("live FPS fell below 30: " + performanceSample.fps);
if (failures.length) {
    console.error("PLAYABILITY AUDIT FAILED\n" + failures.join("\n"));
    process.exitCode = 1;
}
