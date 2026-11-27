// Player proof for 1.2.23.1.271–300: every long-term forest region opens at
// 390×844, the shared actions work, and the 30-point field guide is complete.
//
// Usage: npm run test:forest-legacy-mobile
//        FOREST_LEGACY_MOBILE_BASE_URL=https://kings-and-cards.pages.dev node tests/browser/forest-legacy-mobile.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_LEGACY_MOBILE_OUT || "artifacts/forest-legacy-mobile");
const reportPath = resolve(outputDir, "forest-legacy-mobile.json");
const seed = 20261127;
const viewport = { width: 390, height: 844 };
const remoteBase = (process.env.FOREST_LEGACY_MOBILE_BASE_URL || "").trim().replace(/\/$/, "");
const mimeTypes = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
    ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

function staticServer() {
    return createServer(async (request, response) => {
        try {
            const url = new URL(request.url || "/", "http://localhost");
            const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).slice(1);
            const file = resolve(gameRoot, relative);
            if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
                response.writeHead(403); response.end("Forbidden"); return;
            }
            const body = await readFile(file);
            response.writeHead(200, { "content-type": mimeTypes[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
            response.end(body);
        } catch {
            response.writeHead(404); response.end("Not found");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) { printBrowserHelp(probe.error); process.exit(1); }
await mkdir(outputDir, { recursive: true });
const { chromium } = await import("playwright");
const server = remoteBase ? null : staticServer();
if (server) await new Promise(done => server.listen(0, "127.0.0.1", done));
const baseUrl = remoteBase || "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const badResponses = [];
const report = { seed, baseUrl, viewport, ok: false, checks: {} };
page.on("pageerror", error => errors.push("pageerror: " + error.message));
page.on("console", message => { if (message.type() === "error") errors.push("console: " + message.text()); });
page.on("response", response => { if (response.status() >= 400) badResponses.push(response.status() + " " + response.url()); });

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Legacy Warden");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
    await page.waitForTimeout(1000);

    await page.locator("#command-open-btn").tap();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    const panelSelect = page.locator("#command-tab-select");
    if (await panelSelect.isVisible()) await panelSelect.selectOption("forest");
    else await page.locator('[data-command-tab="forest"]').tap();
    await page.locator("#command-panel-content [data-forest-legacy]").waitFor({ state: "visible", timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll(".forest-legacy__region").length === 10
        && document.querySelectorAll("[data-legacy-point]").length === 30, null, { timeout: 60000 });

    const initial = await page.evaluate(() => {
        const root = document.querySelector("[data-forest-legacy]");
        const regions = [...root.querySelectorAll(".forest-legacy__region")];
        return {
            rootRegions: Number(root.dataset.legacyRegions),
            regions: regions.length,
            uniqueRegions: new Set(regions.map(region => region.dataset.legacyRegion)).size,
            species: regions.reduce((sum, region) => sum + Number(region.dataset.legacySpeciesCount || 0), 0),
            hazards: root.querySelectorAll(".forest-legacy__hazard").length,
            actions: root.querySelectorAll("[data-legacy-region-action]").length,
            points: root.querySelectorAll("[data-legacy-point]").length,
            institutions: root.querySelectorAll("[data-legacy-institution]").length,
            protected: Number(root.dataset.legacyProtected),
            guide: Boolean(root.querySelector('[data-legacy-guide="30"]')),
            labels: regions.map(region => region.querySelector(".forest-legacy__region-title b")?.textContent?.trim() || ""),
            overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            panelOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
            innerLength: root.innerHTML.length,
            childClasses: [...root.children].map(child => child.className).slice(0, 6),
        };
    });
    console.log("FOREST LEGACY INITIAL", JSON.stringify(initial));
    assert.equal(initial.rootRegions, 10);
    assert.equal(initial.regions, 10);
    assert.equal(initial.uniqueRegions, 10);
    assert.equal(initial.species, 60, "all ten provinces must mount their six starting cohorts");
    assert.equal(initial.hazards, 60, "all six hazard records must mount for every province");
    assert.equal(initial.actions, 40, "four real actions must mount on every province");
    assert.equal(initial.points, 30, "all thirty long-term requirements must be present");
    assert.equal(initial.institutions, 4);
    assert.equal(initial.guide, true);
    assert.ok(initial.labels.every(Boolean), "every province needs a readable name");
    assert.ok(initial.overflow <= 1, "the page must not scroll horizontally at 390px");
    assert.ok(initial.panelOverflow <= 1, "the forest legacy panel must not overflow its own content box");
    report.checks.initial = initial;
    await page.evaluate(() => document.querySelector("[data-forest-legacy]").scrollIntoView({ block: "start" }));
    await page.screenshot({ path: resolve(outputDir, "forest-legacy-mobile-top.png"), fullPage: false });

    // Open every province through its real summary control. This proves the
    // details markup, species list, ring chart and century projection mount for
    // each regional forest rather than only the first open card.
    const opened = await page.evaluate(async () => {
        const regions = [...document.querySelectorAll(".forest-legacy__region")];
        const results = [];
        for (const region of regions) {
            const summary = region.querySelector("summary");
            if (!region.open) summary.click();
            await new Promise(resolve => requestAnimationFrame(() => resolve()));
            results.push({
                id: region.dataset.legacyRegion,
                open: region.open,
                species: region.querySelectorAll(".forest-legacy__species").length,
                hazards: region.querySelectorAll(".forest-legacy__hazard").length,
                rings: region.querySelectorAll(".forest-legacy__rings i").length,
                century: region.querySelectorAll(".forest-legacy__century > span").length,
            });
        }
        return results;
    });
    assert.equal(opened.length, 10);
    for (const region of opened) {
        assert.equal(region.open, true, region.id + " must open from its summary");
        assert.ok(region.species >= 6, region.id + " must show its cohorts");
        assert.equal(region.hazards, 6, region.id + " must show all six hazards");
        assert.ok(region.rings >= 1, region.id + " must show a tree-ring archive");
        assert.equal(region.century, 3, region.id + " must show three century projections");
    }
    report.checks.regions = opened;

    // Real expenditures: a seed bank and a reserve. Both buttons go through the
    // management dispatcher, the shared economy and the eventual save snapshot.
    const seedBank = page.locator('[data-legacy-build="seed-bank"]');
    await seedBank.scrollIntoViewIfNeeded();
    const seedDisabled = await seedBank.isDisabled();
    assert.equal(seedDisabled, false, "a starting realm can afford the first seed bank");
    await seedBank.tap();
    await page.waitForFunction(() => document.querySelector('[data-legacy-institution="seed-bank"]')?.dataset.legacyLevel === "1", null, { timeout: 10000 });
    const reserveButton = page.locator('[data-legacy-region-action="protect"]').first();
    await reserveButton.scrollIntoViewIfNeeded();
    assert.equal(await reserveButton.isDisabled(), false, "a starting realm can afford the first reserve");
    await reserveButton.tap();
    await page.waitForFunction(() => {
        const root = document.querySelector("[data-forest-legacy]");
        return root?.dataset.legacyProtected === "1";
    }, null, { timeout: 10000 });
    const afterActions = await page.evaluate(() => {
        const root = document.querySelector("[data-forest-legacy]");
        const region = root.querySelector(".forest-legacy__region[data-legacy-protection='reserve']");
        return {
            seedLevel: root.querySelector('[data-legacy-institution="seed-bank"]')?.dataset.legacyLevel,
            protected: Number(root.dataset.legacyProtected),
            law: root.dataset.legacyLaw,
            reserveRegion: region?.dataset.legacyRegion || null,
            reserveRules: region?.querySelector(".command-note")?.textContent?.trim() || "",
            overflow: Math.max(0, root.scrollWidth - root.clientWidth),
        };
    });
    assert.equal(afterActions.seedLevel, "1");
    assert.equal(afterActions.protected, 1);
    assert.ok(afterActions.reserveRegion, "the protected province must expose its new rule state");
    assert.match(afterActions.reserveRules, /reserve|salvage/i);
    assert.ok(afterActions.overflow <= 1);
    report.checks.actions = afterActions;

    await page.screenshot({ path: resolve(outputDir, "forest-legacy-mobile.png"), fullPage: false });
    assert.deepEqual(errors, [], "the legacy panel must not log a page or console error");
    assert.deepEqual(badResponses, [], "the legacy panel must not load a broken asset");
    report.checks.errors = errors;
    report.ok = true;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log("FOREST LEGACY MOBILE OK", JSON.stringify({ reportPath, checks: Object.keys(report.checks), regions: initial.regions, points: initial.points }));
} finally {
    await context.close();
    await browser.close();
    if (server) await new Promise(done => server.close(done));
    if (!report.ok) {
        await writeFile(reportPath, JSON.stringify({ ...report, errors, badResponses }, null, 2) + "\n").catch(() => {});
        console.error("FOREST LEGACY MOBILE FAILED", JSON.stringify({ errors, badResponses }));
        process.exitCode = 1;
    }
}
