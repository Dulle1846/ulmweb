// Browser proof of the full 25-year campaign at real logistics speed.
//
// Starts the shipped realm through the actual start screen, then hands the
// live state to the shared campaign driver. Every day advances logistics by
// 0.75 seconds, matching 1x play, while the simulation runs as fast as the
// machine allows. After the last ambition, the mature realm is unpaused for a
// live FPS sample. Run with the game served on E2E_BASE_URL.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED = Number(process.env.CAMPAIGN_SEED || 20261108);
const YEARS = Math.max(1, Number(process.env.CAMPAIGN_YEARS || 25));
const root = process.cwd();
const outDir = resolve(root, "..", "artifacts");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

async function dismissBlockingMessage() {
    const eventDismiss = page.locator("#realm-event-dismiss");
    if (await eventDismiss.isVisible().catch(() => false)) {
        await eventDismiss.click();
        await page.waitForTimeout(80);
    }
    const button = page.locator("#big-message-close");
    if (await button.isVisible().catch(() => false)) await button.click();
}

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
await page.locator("#world-seed-input").fill(String(SEED));
await page.waitForFunction(seed => document.querySelector("#world-preview-status")?.textContent.includes("SEED " + seed), String(SEED), { timeout: 20000 }).catch(() => {});
await page.locator("#player-name-input").fill("Long Campaign Audit");
await page.locator("#start-new-game-btn").click();
await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
await page.waitForTimeout(1500);
await dismissBlockingMessage();

const started = Date.now();
const report = await page.evaluate(async ({ years }) => {
    const [{ runCampaign }, { state }] = await Promise.all([
        import("./tests/campaign/campaign-driver.mjs"),
        import("./js/core/state.js")
    ]);
    state.isPaused = true;
    const result = runCampaign({ initialize: false, years });
    state.isPaused = true;
    return result;
}, { years: YEARS });
const simulationMs = Date.now() - started;

await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(500);
await dismissBlockingMessage();
const shots = [];
async function shot(width, height, name) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    await dismissBlockingMessage();
    const file = resolve(outDir, name);
    await page.screenshot({ path: file });
    shots.push(file);
}
await shot(1600, 1000, "kac-long-campaign-1600.png");
await shot(1024, 768, "kac-long-campaign-1024.png");
await shot(864, 1000, "kac-long-campaign-864.png");
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(400);

const layout = await page.evaluate(async () => {
    const { state } = await import("./js/core/state.js");
    const rect = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    return {
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        topbar: rect(".topbar"),
        sidePanel: rect(".side-panel"),
        ambition: rect("#ambition-section"),
        ambitionVisible: Boolean(document.querySelector("#ambition-section")?.offsetParent),
        ambitionTitle: document.querySelector("#ambition-title")?.textContent || null,
        ambitionCount: document.querySelector("#ambition-count")?.textContent || null,
        ambitionKicker: document.querySelector("#ambition-kicker")?.textContent || null,
        ambitionLabel: document.querySelector("#ambition-progress-label")?.textContent || null,
        ambitionReward: document.querySelector("#ambition-reward")?.textContent || null,
        year: state.year,
        population: state.entities.filter(entity => !entity.dead && entity.type === 20).length
    };
});

await page.evaluate(async () => {
    const { state } = await import("./js/core/state.js");
    state.isPaused = false;
});
await page.waitForTimeout(3200);
const performanceSample = await page.evaluate(async () => {
    const { state } = await import("./js/core/state.js");
    const stats = { ...(state.renderStats || {}) };
    state.isPaused = true;
    return stats;
});
await dismissBlockingMessage();

const summary = {
    seed: SEED,
    years: YEARS,
    simulationMs,
    ticks: report.totalTicks,
    ticksPerSecond: Math.round(report.totalTicks / Math.max(1, simulationMs / 1000)),
    tickCostMs: report.tickCostMs,
    ok: report.ok,
    requirements: report.requirements,
    completedIds: report.completedIds,
    final: report.final,
    yearly: report.yearly,
    diagnostics: report.diagnostics,
    gameOver: report.gameOver,
    performance: performanceSample,
    layout,
    shots,
    pageErrors,
    consoleErrors
};
await writeFile(resolve(outDir, "long-campaign-audit.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();

const failures = [];
if (!report.ok) failures.push("campaign requirements failed: " + JSON.stringify(report.requirements));
if (pageErrors.length) failures.push("page errors: " + pageErrors.join(" | "));
if (consoleErrors.length) failures.push("console errors: " + consoleErrors.join(" | "));
if (layout.horizontalOverflow) failures.push("the layout overflows horizontally at 1600x1000");
if (!layout.ambitionVisible) failures.push("the ambition panel is not visible");
if (String(layout.ambitionCount).trim() !== "13 / 13") failures.push("ambition panel does not show 13 / 13: " + layout.ambitionCount);
if (!/ETERNAL DEED/.test(String(layout.ambitionKicker))) failures.push("the eternal deed is not presented after the royal ladder: " + layout.ambitionKicker);
if (!String(layout.ambitionLabel || "").trim()) failures.push("the eternal deed has no progress label");
if (!/ETERNAL REWARD/.test(String(layout.ambitionReward))) failures.push("the eternal deed has no eternal reward line: " + layout.ambitionReward);
if (Number(performanceSample.fps) < 50) failures.push("mature-realm FPS fell below 50: " + performanceSample.fps);
if (Number(performanceSample.frameMs) > 20) failures.push("mature-realm frame time exceeded 20ms: " + performanceSample.frameMs);
if (failures.length) {
    console.error("LONG CAMPAIGN BROWSER AUDIT FAILED\n" + failures.join("\n"));
    process.exitCode = 1;
}
