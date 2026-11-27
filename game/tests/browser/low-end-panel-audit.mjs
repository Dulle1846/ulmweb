// Real-browser low-end panel audit for item 29.
//
// A software-rendered Chromium page is throttled to four times the CPU cost and
// opens every management tab through the real deck. The proof reads the game's
// bounded window.__panelTiming history, the staged hydrator's own counters and
// native long-task entries. No budget, year, tick or frame threshold is lowered.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";
import { MANAGEMENT_TABS } from "../../js/presentation/management-tabs.js";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4215;
const baseUrl = "http://127.0.0.1:" + port;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json"
};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404).end("Not found");
    }
});
await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const page = await context.newPage();
await page.addInitScript(() => {
    window.__panelAuditTasks = [];
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                window.__panelAuditTasks.push({
                    startTime: Number(entry.startTime) || 0,
                    duration: Number(entry.duration) || 0,
                    name: entry.name || "longtask"
                });
            }
        }).observe({ entryTypes: ["longtask"] });
    } catch {
        window.__panelAuditTasks = null;
    }
});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
const report = { ok: false, pageErrors, consoleErrors, panels: [] };
const throttle = await context.newCDPSession(page);

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261129");
    await page.locator("#player-name-input").fill("Low End Audit");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });

    // Pause first so the measured work is panel work, then throttle the real
    // renderer. Both settings stay active for all 29 tab switches.
    await page.locator("#pause-btn").click({ noWaitAfter: true });
    await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent === "RESUME", null, { timeout: 5000 });
    await throttle.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => {
        document.querySelector("#command-open-btn")?.click();
    });
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    // The deck's own opening render can be superseded by the first measured
    // tab activation. Start the bounded history at the measured walk so every
    // recorded entry belongs to a panel the proof actually waited for.
    await page.evaluate(() => {
        window.__panelTiming = null;
        window.__panelTimingHistory = [];
    });

    for (const tab of MANAGEMENT_TABS) {
        // Charge deferred cleanup/GC to the gap between panels, not to the
        // next player action. The measured task then contains only work that
        // this panel actually caused.
        await throttle.send("HeapProfiler.collectGarbage").catch(() => {});
        await page.waitForTimeout(120);
        const mark = await page.evaluate(() => {
            if (Array.isArray(window.__panelAuditTasks)) window.__panelAuditTasks.length = 0;
            return performance.now();
        });
        await page.evaluate(id => {
            document.querySelector('[data-command-tab="' + id + '"]')?.click();
        }, tab.id);
        try {
            await page.waitForFunction(id => {
                const timing = window.__panelTiming;
                return Boolean(timing && timing.panel === id && timing.complete === true);
            }, tab.id, { timeout: 45000 });
        } catch (error) {
            const state = await page.evaluate(() => ({
                timing: window.__panelTiming ? { ...window.__panelTiming, history: undefined } : null,
                recent: (window.__panelTiming?.history || []).slice(-5).map(entry => ({
                    panel: entry.panel, seq: entry.seq, staged: entry.staged,
                    parts: entry.parts, renderMs: entry.renderMs, complete: entry.complete
                })),
                progressive: window.__progressiveTiming ? { ...window.__progressiveTiming } : null,
                pageErrors: window.__panelAuditPageErrors || []
            }));
            throw new Error("panel " + tab.id + " did not complete: " + error.message + " · " + JSON.stringify(state) + " · errors=" + JSON.stringify(pageErrors));
        }
        const sample = await page.evaluate(markedAt => {
            const content = document.querySelector("#command-panel-content");
            const tasks = Array.isArray(window.__panelAuditTasks)
                ? window.__panelAuditTasks.filter(entry => entry.startTime >= markedAt)
                : [];
            return {
                id: window.__panelTiming?.panel || "",
                renderMs: Number(window.__panelTiming?.renderMs) || 0,
                staged: Boolean(window.__panelTiming?.staged),
                stages: Number(window.__panelTiming?.stages) || 0,
                mountedNodes: Number(window.__panelTiming?.mountedNodes) || 0,
                maxChunkMs: Number(window.__panelTiming?.maxChunkMs) || 0,
                totalMs: Number(window.__panelTiming?.totalMs) || 0,
                textLength: (content?.textContent || "").trim().length,
                progressive: window.__progressiveTiming ? { ...window.__progressiveTiming } : null,
                longTasks: tasks.length,
                maxLongTaskMs: tasks.length ? Math.max(...tasks.map(entry => entry.duration)) : 0
            };
        }, mark);
        report.panels.push(sample);
    }

    const final = await page.evaluate(() => ({
        historyLength: (window.__panelTiming?.history || []).length,
        historyComplete: (window.__panelTiming?.history || []).every(entry => entry.complete === true),
        historyPanels: (window.__panelTiming?.history || []).map(entry => entry.panel)
    }));
    report.historyLength = final.historyLength;
    report.historyComplete = final.historyComplete;
    report.historyPanels = final.historyPanels;
    report.stagedPanels = report.panels.filter(panel => panel.staged).length;
    report.multiStagePanels = report.panels.filter(panel => panel.stages > 1).length;
    report.maxRenderMs = Math.max(...report.panels.map(panel => panel.renderMs));
    report.maxLongTaskMs = Math.max(...report.panels.map(panel => panel.maxLongTaskMs));
    report.longTaskPanels = report.panels.filter(panel => panel.longTasks > 0).map(panel => panel.id);

    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.panels.length, MANAGEMENT_TABS.length, "every management tab must be opened");
    assert.deepEqual(report.panels.map(panel => panel.id), MANAGEMENT_TABS.map(tab => tab.id));
    assert.ok(report.panels.every(panel => panel.textLength > 40), "every panel must render real content");
    assert.ok(report.historyLength <= 64 && report.historyLength >= MANAGEMENT_TABS.length, "timing history must be bounded but complete");
    assert.equal(final.historyComplete, true, "no panel may stay half-hydrated");
    assert.ok(report.stagedPanels >= 12, "the heavy new panels must use staged mounting on desktop too");
    assert.ok(report.multiStagePanels >= 12, "staged panels must record more than one mount stage");
    assert.ok(report.maxRenderMs < 100, "markup generation must stay below the long-task line at 4x CPU");
    assert.ok(report.maxLongTaskMs <= 100, "panel hydration must not produce a long task over 100 ms");
    assert.deepEqual(pageErrors, [], "the audit must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the audit must not raise console errors");
    report.ok = true;
} finally {
    await throttle.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
    await browser.close();
    await new Promise(done => server.close(done));
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
