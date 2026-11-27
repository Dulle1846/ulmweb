// Browser proof for 1.2.23.1.241–270: the Forest Atlas exposes the legend,
// filters, live thirty-point guide and forest-only accessibility controls; the
// settings change real presentation state and the map rebuilds; the subtitle
// live region receives an ambience cue.
//
// Usage: npm run test:forest-presentation-ui
// Output: artifacts/forest-presentation-ui/forest-presentation-ui.png
//         artifacts/forest-presentation-ui/forest-presentation-ui.json
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_PRESENTATION_OUT || "artifacts/forest-presentation-ui");
const screenshotPath = resolve(outputDir, "forest-presentation-ui.png");
const reportPath = resolve(outputDir, "forest-presentation-ui.json");
const seed = 20261127;
const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createStaticServer() {
    return createServer(async (request, response) => {
        try {
            const url = new URL(request.url || "/", "http://localhost");
            const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).slice(1);
            const file = resolve(gameRoot, relative);
            if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
                response.writeHead(403);
                response.end("Forbidden");
                return;
            }
            const body = await readFile(file);
            response.writeHead(200, {
                "content-type": mimeTypes[extname(file)] || "application/octet-stream",
                "cache-control": "no-store",
            });
            response.end(body);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" });
            response.end("Not found");
        }
    });
}

async function completedRender(page, minRevision = 0, ready = () => true) {
    let last = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        await page.waitForTimeout(500);
        last = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return {
                ...(state.terrainForestBuildStats || {}),
                liveRevision: state.terrainCacheRevision || 0,
                weather: state.weather,
                day: state.dayOfYear,
            };
        });
        if (last && last.at && last.revision >= minRevision && last.detailTiles > 0 && ready(last)) return last;
    }
    return last;
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const { chromium } = await import("playwright");
const server = createStaticServer();
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const evidence = { seed, ok: false, checks: {} };
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Forest Presentation UI");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    if (await page.locator("#realm-event-modal").isVisible()) await page.locator("#realm-event-dismiss").click();
    // Put the deterministic realm into a real spring rain morning at the
    // reference wood's blossom day. This is a normal in-game weather/season
    // state, used so the visual and work counters exercise the deepest forest
    // pass instead of an empty clear-sky frame.
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.dayOfYear = 56;
        state.seasonIndex = 0;
        state.weather = "rain";
        state.timeOfDay = 7;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
    });
    await page.waitForTimeout(1200);

    // Open the real player atlas. The presentation block is part of the panel,
    // not a test-only fixture.
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator("#command-panel-content .forest-atlas__card").first().waitFor({ state: "visible", timeout: 15000 });
    // Cards are the primary atlas content and mount before the reference
    // sections; wait for the guide before reading its rendered values.
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content [data-presentation-point]").length === 30, null, { timeout: 45000 });
    const baseline = await page.evaluate(() => {
        const guide = document.querySelector("[data-presentation-guide]");
        const point = guide?.querySelector("[data-presentation-point] p");
        const note = document.querySelector(".forest-atlas__presentation .command-note");
        return {
            cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
            presentation: document.querySelector("[data-forest-presentation]")?.dataset.forestPresentation,
            points: document.querySelectorAll("[data-presentation-point]").length,
            guidePoints: guide ? guide.querySelectorAll("[data-presentation-point]").length : 0,
            legends: document.querySelectorAll("[data-forest-legend]").length,
            uses: document.querySelectorAll("[data-forest-use]").length,
            dangers: document.querySelectorAll("[data-forest-danger]").length,
            filters: document.querySelectorAll("[data-forest-filter]").length,
            seasons: document.querySelectorAll("[data-forest-season]").length,
            canopyLayers: document.querySelectorAll("[data-forest-canopy-layer]").length,
            cueButtons: document.querySelectorAll("[data-forest-cue]").length,
            typeCueButtons: document.querySelectorAll("[data-forest-type-cue]").length,
            cueLive: document.querySelector("[data-forest-cue-text]")?.getAttribute("aria-live") || "",
            filterLive: document.querySelector("[data-forest-filter-status]")?.getAttribute("aria-live") || "",
            seasonDays: [...document.querySelectorAll("[data-forest-season]")].map(element => Number(element.dataset.forestSeasonDay)),
            currentSeason: document.querySelector(".forest-atlas__season.is-current")?.dataset.forestSeason || "",
            noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : 0,
            pointFont: point ? parseFloat(getComputedStyle(point).fontSize) : 0,
            guideText: guide ? (guide.textContent || "").replace(/\s+/g, " ").trim() : "",
            summaryText: document.querySelector(".forest-atlas__presentation-summary")?.innerText.replace(/\s+/g, " ").trim() || "",
        };
    });
    assert.equal(baseline.cards, 60, "the atlas must still list all sixty regional types");
    assert.equal(baseline.presentation, "30", "the presentation section must expose all thirty points");
    assert.equal(baseline.points, 30, "the guide must render thirty point cards");
    assert.equal(baseline.guidePoints, 30);
    assert.ok(baseline.legends >= 10, "the legend must cover the regional families");
    assert.equal(baseline.uses, 3, "three use icons must be explained");
    assert.equal(baseline.dangers, 4, "four danger marks must be explained");
    assert.ok(baseline.filters >= 18, "every family, resource and protection value must be filterable");
    assert.equal(baseline.seasons, 4, "the atlas must show a four-season phenology calendar");
    assert.equal(baseline.canopyLayers, 3, "the atlas must show all three canopy depth layers");
    assert.equal(baseline.cueButtons, 8, "every regional cue must be previewable");
    assert.equal(baseline.typeCueButtons, 60, "every regional card must offer its own wood");
    assert.equal(baseline.cueLive, "polite", "the cue line must be a polite live region");
    assert.equal(baseline.filterLive, "polite", "the filter count must be announced");
    assert.equal(baseline.currentSeason, "spring", "the sample starts in spring");
    assert.ok(baseline.seasonDays.every(day => day >= 0 && day < 400), "season days stay inside the realm year");
    assert.equal(new Set(baseline.seasonDays).size >= 2, true, "seasonal dates must differ within a wood");
    for (const label of ["CANOPY PARALLAX", "COLOUR-BLIND-SAFE", "REDUCED MOTION", "SUBTITLES", "ALTERNATIVE MAP VIEW"]) {
        assert.ok(baseline.guideText.toUpperCase().includes(label), "the guide must name " + label);
    }
    evidence.baseline = baseline;

    // Filter by family, then by resource; reset restores all sixty cards.
    await page.locator('[data-forest-filter="family"][data-forest-filter-value="conifer"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .forest-atlas__card").length < 60, null, { timeout: 5000 });
    const coniferCards = await page.locator("#command-panel-content .forest-atlas__card").count();
    assert.ok(coniferCards > 0 && coniferCards < 60);
    await page.locator('[data-forest-filter="resource"][data-forest-filter-value="timber"]').click();
    const coniferTimberCards = await page.locator("#command-panel-content .forest-atlas__card").count();
    assert.ok(coniferTimberCards > 0 && coniferTimberCards <= coniferCards);
    await page.locator("[data-forest-filter-reset]").click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .forest-atlas__card").length === 60, null, { timeout: 5000 });
    evidence.filters = { coniferCards, coniferTimberCards, resetCards: 60 };

    // The legend is a one-tap filter, not only a key. Tapping the active
    // family again clears it.
    const legendFilter = page.locator('[data-forest-family-filter="conifer"]');
    await legendFilter.click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .forest-atlas__card").length < 60, null, { timeout: 5000 });
    const legendActive = await page.evaluate(() => ({
        pressed: document.querySelector('[data-forest-family-filter="conifer"]')?.getAttribute("aria-pressed") || "",
        cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
        status: document.querySelector("[data-forest-filter-status]")?.textContent.trim() || "",
    }));
    assert.equal(legendActive.pressed, "true");
    assert.ok(legendActive.cards > 0 && legendActive.cards < 60);
    assert.equal(legendActive.status, "1 / 3");
    await legendFilter.click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .forest-atlas__card").length === 60, null, { timeout: 5000 });
    assert.equal(await legendFilter.getAttribute("aria-pressed"), "false");
    evidence.legendFilter = legendActive;

    // The atlas can audition the real regional soundscape. The printed line is
    // the cue the ambience engine receives, so it must update even if the
    // browser leaves the audio context suspended.
    await page.locator('[data-forest-cue="instrument"]').click();
    await page.waitForFunction(() => (document.querySelector("[data-forest-cue-text]")?.textContent || "").includes("sounds somewhere"), null, { timeout: 5000 });
    const cue = await page.evaluate(async () => ({
        text: document.querySelector("[data-forest-cue-text]")?.textContent.trim() || "",
        last: document.querySelector("[data-forest-last-cue]")?.textContent.trim() || "",
        history: (await import("./js/core/forest-ambience.js")).forestAmbienceHistory().length,
    }));
    assert.ok(cue.text.length > 10, "the instrument cue must print its real line");
    assert.match(cue.last, /LAST HEARD/);
    assert.ok(cue.history >= 1, "the cue must enter the ambience history");
    evidence.cue = cue;

    // A card can audition its own regional wood without changing the live bed.
    await page.locator("#command-panel-content .forest-atlas__card").first().locator("summary").click();
    await page.locator("[data-forest-type-cue]").first().click();
    await page.waitForFunction(() => (document.querySelector("[data-forest-cue-text]")?.textContent || "").includes("sounds somewhere"), null, { timeout: 5000 });
    evidence.typeCue = await page.locator("[data-forest-cue-text]").first().innerText();

    // The accessibility controls live in the real settings dialog.
    await page.locator("#command-close").click();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 5000 });
    // The normal path must be measured at a zoom that really draws the close
    // forest detail, otherwise a landscape overview legitimately has no floor
    // passes and the performance comparison would be meaningless.
    await page.locator('[data-zoom-level="3"]').click();
    await page.waitForTimeout(1200);
    const primeRainySpring = () => page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.dayOfYear = 56;
        state.seasonIndex = 0;
        state.weather = "rain";
        state.timeOfDay = 7;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        return state.terrainCacheRevision;
    });
    const normalRevision = await primeRainySpring();
    const normalRender = await completedRender(page, normalRevision, render => render.detailPasses > 0);
    assert.ok(normalRender?.detailPasses > 0, "the detailed normal pass must draw real forest decoration work");
    evidence.normalRender = normalRender;
    const revisionBefore = normalRender.liveRevision;
    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#settings-forest-colorblind-toggle").check({ force: true });
    await page.locator("#settings-forest-contrast-toggle").check({ force: true });
    await page.locator("#settings-forest-font-scale").selectOption("large");
    await page.locator("#settings-forest-performance-toggle").check({ force: true });
    await page.locator("#settings-motion-toggle").check({ force: true });
    await page.locator("#settings-forest-particles-toggle").check({ force: true });
    await page.locator("#settings-forest-subtitles-toggle").check({ force: true });
    await page.locator("#settings-close").click();
    await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });

    // Performance mode is still on the detailed map here. The counters are
    // written by the real cached raster, so the lower number is measured work,
    // not a copy of the settings flags.
    const performanceRevision = await primeRainySpring();
    const performanceRender = await completedRender(page, performanceRevision, render => render.detailPasses > 0);
    assert.ok(performanceRender.detailPasses < normalRender.detailPasses,
        "performance mode must schedule fewer decorative forest passes: " + performanceRender.detailPasses + " vs " + normalRender.detailPasses);
    assert.ok(performanceRender.mistPasses < normalRender.mistPasses,
        "performance mode must skip the far mist pass: " + performanceRender.mistPasses + " vs " + normalRender.mistPasses);
    assert.ok(normalRender.mistPasses > 0, "the normal rainy morning must draw mist");
    evidence.performanceRender = performanceRender;
    await page.screenshot({ path: resolve(outputDir, "forest-presentation-map-performance.png") });

    // Symbolic view is a separate second step so the performance counters
    // above are measured on the real detailed map, not on the flat fallback.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    const symbolicRevision = await page.evaluate(async () => (await import("./js/core/state.js")).state.terrainCacheRevision || 0);
    await page.locator("#settings-forest-map-view").selectOption("symbolic");
    await page.locator("#settings-close").click();
    await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });
    const symbolicRender = await completedRender(page, symbolicRevision + 1, render => render.detailPasses === 0);
    assert.equal(symbolicRender.detailPasses, 0, "symbolic view must replace the detailed forest pass with one flat patch");
    evidence.symbolicRender = symbolicRender;

    const classes = await page.evaluate(async () => {
        const [{ state }, presentation] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-presentation.js"),
        ]);
        return {
            colorblind: document.documentElement.classList.contains("ui-forest-colorblind"),
            contrast: document.documentElement.classList.contains("ui-forest-contrast"),
            fontLarge: document.documentElement.classList.contains("forest-font-large"),
            symbolic: document.body.classList.contains("ui-forest-symbolic"),
            fontScale: getComputedStyle(document.documentElement).getPropertyValue("--forest-font-scale").trim(),
            symbolicSetting: presentation.forestSymbolicMap(),
            motion: presentation.forestMotionScale(),
            particles: presentation.forestParticleScale(),
            revision: state.terrainCacheRevision || 0,
            ambience: (await import("./js/core/forest-ambience.js")).forestAmbienceStatus(),
        };
    });
    assert.equal(classes.colorblind, true);
    assert.equal(classes.contrast, true);
    assert.equal(classes.fontLarge, true);
    assert.equal(classes.symbolic, true);
    assert.equal(classes.symbolicSetting, true);
    assert.equal(classes.fontScale, "1.2");
    assert.ok(classes.motion < 0.3, "reduce-motion still applies together with performance mode");
    assert.ok(classes.particles < 0.4);
    assert.ok(classes.revision > revisionBefore, "the symbolic map view must schedule a terrain rebuild");
    assert.equal(classes.ambience.enabled, true);
    evidence.settings = classes;

    // Reopen the atlas with the accessibility presentation active.
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator("#command-panel-content [data-forest-presentation]").waitFor({ state: "visible", timeout: 15000 });
    const active = await page.evaluate(() => {
        const swatch = document.querySelector(".forest-atlas__legend-swatch");
        const note = document.querySelector(".forest-atlas__presentation .command-note");
        const point = document.querySelector("[data-presentation-point] p");
        const chip = document.querySelector('[data-forest-filter-group="family"] .forest-atlas__filter-chip');
        return {
            cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
            pattern: swatch ? getComputedStyle(swatch).backgroundImage : "",
            chipPattern: chip ? getComputedStyle(chip).backgroundImage : "",
            chipClass: chip ? chip.className : "",
            chipScope: chip ? Boolean(chip.closest(".ui-forest-colorblind")) : false,
            rootClass: document.documentElement.className,
            noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : 0,
            pointFont: point ? parseFloat(getComputedStyle(point).fontSize) : 0,
            guideText: (document.querySelector("[data-presentation-guide]")?.textContent || "").replace(/\s+/g, " ").trim(),
            settingsText: document.querySelector(".forest-atlas__presentation-settings")?.innerText.replace(/\s+/g, " ").trim() || "",
        };
    });
    evidence.active = active;
    assert.equal(active.cards, 60);
    assert.notEqual(active.pattern, "none", "colour-blind mode must draw a family pattern");
    assert.notEqual(active.chipPattern, "none", "filter chips must carry the pattern in colour-blind mode");
    assert.ok(active.noteFont > baseline.noteFont, "forest text scale must enlarge atlas notes");
    assert.ok(active.pointFont > baseline.pointFont, "forest text scale must enlarge guide text");
    assert.ok(active.settingsText.includes("SYMBOLIC"));
    assert.ok(active.settingsText.includes("ON"));
    await page.locator("[data-forest-presentation]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Subtitle live region: dispatch and read synchronously so a scheduled
    // ambience cue cannot replace the line between the two steps.
    const subtitle = await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent("kac:forest-ambience", {
            detail: { kind: "bird", text: "A capercaillie drums beyond the pines.", at: Date.now() },
        }));
        return document.querySelector("#forest-subtitle").innerText.trim();
    });
    assert.match(subtitle, /capercaillie/i);
    await page.locator("#forest-subtitle").waitFor({ state: "visible", timeout: 5000 });
    const live = await page.locator("#forest-subtitle").evaluate(element => ({
        role: element.getAttribute("role"),
        live: element.getAttribute("aria-live"),
    }));
    assert.equal(live.role, "status");
    assert.equal(live.live, "polite");
    evidence.subtitle = { text: subtitle.trim(), ...live };

    // Restore the default presentation so the evidence screenshot is not the
    // only state a following browser test inherits in this profile.
    await page.locator("#command-close").click();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 5000 });
    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#settings-forest-colorblind-toggle").uncheck({ force: true });
    await page.locator("#settings-forest-contrast-toggle").uncheck({ force: true });
    await page.locator("#settings-forest-font-scale").selectOption("normal");
    await page.locator("#settings-forest-performance-toggle").uncheck({ force: true });
    await page.locator("#settings-forest-particles-toggle").uncheck({ force: true });
    await page.locator("#settings-forest-map-view").selectOption("detailed");
    await page.locator("#settings-forest-subtitles-toggle").uncheck({ force: true });
    await page.locator("#settings-close").click();
    await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });

    assert.deepEqual(pageErrors, [], "no page errors are allowed");
    assert.deepEqual(consoleErrors, [], "no console errors are allowed");
    evidence.ok = true;
    await writeFile(reportPath, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ ok: true, checks: evidence }, null, 2));
} catch (error) {
    evidence.error = error?.stack || String(error);
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    await writeFile(reportPath, JSON.stringify(evidence, null, 2)).catch(() => {});
    console.error(evidence.error);
    process.exitCode = 1;
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
