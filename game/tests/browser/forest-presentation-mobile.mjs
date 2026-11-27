// Mobile/small-screen player proof for 1.2.23.1.241–270: the Forest Atlas and
// every released control are exercised with real touch taps at a phone and a
// tablet viewport, in detailed and symbolic map views, through founding,
// saving and continuing a realm.
//
// Usage:
//   npm run test:forest-presentation-mobile
//   FOREST_MOBILE_BASE_URL=https://kings-and-cards.pages.dev node tests/browser/forest-presentation-mobile.mjs
// Output:
//   artifacts/forest-presentation-mobile/forest-presentation-mobile.json
//   artifacts/forest-presentation-mobile/forest-mobile-<viewport>-*.png
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_MOBILE_OUT || "artifacts/forest-presentation-mobile");
const reportPath = resolve(outputDir, "forest-presentation-mobile.json");
const seed = 20261127;
const remoteBase = (process.env.FOREST_MOBILE_BASE_URL || "").trim().replace(/\/$/, "");
const allViewports = [
    { id: "390x844", width: 390, height: 844 },
    { id: "768x1024", width: 768, height: 1024 },
];
const requestedViewports = (process.env.FOREST_MOBILE_VIEWPORTS || "").split(",").map(value => value.trim()).filter(Boolean);
const viewports = requestedViewports.length ? allViewports.filter(viewport => requestedViewports.includes(viewport.id)) : allViewports;
if (!viewports.length) throw new Error("No known FOREST_MOBILE_VIEWPORTS: " + requestedViewports.join(", "));
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

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const { chromium } = await import("playwright");
const server = remoteBase ? null : createStaticServer();
if (server) await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = remoteBase || ("http://127.0.0.1:" + server.address().port);
const browser = await chromium.launch(browserLaunchOptions());
const evidence = { seed, baseUrl, ok: false, viewports: {} };
let failed = false;

async function selectPanel(page, panel) {
    const select = page.locator("#command-tab-select");
    if (await select.isVisible()) await select.selectOption(panel);
    else await page.locator(`[data-command-tab="${panel}"]`).tap();
}

async function openAtlas(page) {
    await page.locator("#command-open-btn").tap();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    await selectPanel(page, "forest");
    await page.locator("#command-panel-content .forest-atlas__card").first().waitFor({ state: "visible", timeout: 40000 });
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .forest-atlas__card").length === 60, null, { timeout: 45000 });
}

async function closeAtlas(page) {
    await page.locator("#command-close").tap();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 5000 });
}

async function tapToggle(page, id) {
    const input = page.locator("#" + id);
    await input.scrollIntoViewIfNeeded();
    const label = input.locator("xpath=ancestor::label[1]");
    const box = await label.boundingBox();
    assert.ok(box, id + " must have a visible touch target");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(120);
    return box;
}

async function waitForFilterSettled(page) {
    await page.waitForFunction(() => {
        const status = document.querySelector("[data-forest-filter-status]");
        const cards = document.querySelectorAll("#command-panel-content .forest-atlas__card").length;
        const empty = document.querySelector("[data-forest-filter-empty]");
        return Boolean(status) && (cards > 0 || empty);
    }, null, { timeout: 15000 });
}

for (const viewport of viewports) {
    const pageErrors = [];
    const consoleErrors = [];
    const report = { viewport, ok: false, checks: {} };
    evidence.viewports[viewport.id] = report;
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });

    try {
        // Found a realm with a deterministic world, exactly as a player does.
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);
        await page.locator("#world-seed-input").fill(String(seed));
        await page.locator("#player-name-input").fill("Forest Mobile " + viewport.id);
        await page.locator("#start-new-game-btn").tap();
        await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 40000 });
        if (await page.locator("#realm-event-modal").isVisible()) await page.locator("#realm-event-dismiss").tap();

        await openAtlas(page);
        await page.waitForTimeout(3500);

        const baseline = await page.evaluate(() => {
            const card = document.querySelector("#command-panel-content .forest-atlas__card");
            const point = document.querySelector("[data-presentation-point] p");
            const note = document.querySelector(".forest-atlas__presentation .command-note");
            const chip = document.querySelector("[data-forest-filter]");
            const presentation = document.querySelector(".forest-atlas__presentation");
            const filterBar = document.querySelector(".forest-atlas__filter-bar");
            const panel = document.querySelector("#command-panel-content");
            const filterRects = [...document.querySelectorAll("[data-forest-filter]")].map(element => {
                const rect = element.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
            });
            return {
                cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
                points: document.querySelectorAll("[data-presentation-point]").length,
                pointHeadings: [...document.querySelectorAll("[data-presentation-point] h4")].map(element => element.textContent.trim()),
                pointTexts: [...document.querySelectorAll("[data-presentation-point] p")].map(element => element.textContent.replace(/\s+/g, " ").trim()),
                legends: document.querySelectorAll("[data-forest-legend]").length,
                uses: document.querySelectorAll("[data-forest-use]").length,
                dangers: document.querySelectorAll("[data-forest-danger]").length,
                filters: document.querySelectorAll("[data-forest-filter]").length,
                seasons: document.querySelectorAll("[data-forest-season]").length,
                canopyLayers: document.querySelectorAll("[data-forest-canopy-layer]").length,
                cueButtons: document.querySelectorAll("[data-forest-cue]").length,
                typeCueButtons: document.querySelectorAll("[data-forest-type-cue]").length,
                cueHeight: document.querySelector("[data-forest-cue]")?.getBoundingClientRect().height || 0,
                cueRight: Math.max(...[...document.querySelectorAll("[data-forest-cue]")].map(element => element.getBoundingClientRect().right)),
                seasonOverflow: [...document.querySelectorAll("[data-forest-season]")].filter(element => element.scrollWidth > element.clientWidth + 1).length,
                canopyOverflow: [...document.querySelectorAll("[data-forest-canopy-layer]")].filter(element => element.scrollWidth > element.clientWidth + 1).length,
                yearColumns: document.querySelector("[data-forest-year]") ? getComputedStyle(document.querySelector("[data-forest-year]")).gridTemplateColumns.split(" ").length : 0,
                filterRects,
                filterHeight: chip.getBoundingClientRect().height,
                filterFont: parseFloat(getComputedStyle(chip).fontSize),
                pointFont: point ? parseFloat(getComputedStyle(point).fontSize) : 0,
                noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : 0,
                cardFont: card ? parseFloat(getComputedStyle(card).fontSize) : 0,
                summaryText: document.querySelector(".forest-atlas__presentation-summary")?.innerText.replace(/\s+/g, " ").trim() || "",
                settingsText: document.querySelector(".forest-atlas__presentation-settings")?.innerText.replace(/\s+/g, " ").trim() || "",
                docWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth,
                viewWidth: window.innerWidth,
                viewHeight: window.innerHeight,
                panelWidth: panel?.clientWidth || 0,
                panelScrollWidth: panel?.scrollWidth || 0,
                filterBarWidth: filterBar?.getBoundingClientRect().width || 0,
                filterBarRight: filterBar?.getBoundingClientRect().right || 0,
                filterBarScrollWidth: filterBar?.scrollWidth || 0,
                presentationScrollWidth: presentation?.scrollWidth || 0,
                presentationClientWidth: presentation?.clientWidth || 0,
                symbolic: document.body.classList.contains("ui-forest-symbolic"),
                subtitleOpacity: getComputedStyle(document.querySelector("#forest-subtitle")).opacity,
                modalOpen: document.body.classList.contains("ui-modal-open"),
                closeRect: (() => { const rect = document.querySelector("#command-close").getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }; })(),
                panelRect: (() => { const rect = document.querySelector(".command-panel").getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width }; })(),
            };
        });
        assert.equal(baseline.cards, 60, "all sixty regional types must render");
        assert.equal(baseline.points, 30, "all thirty guide points must render");
        assert.ok(baseline.pointTexts.every(text => text.length > 20), "every guide point must carry readable text");
        assert.equal(new Set(baseline.pointHeadings).size, 30, "the thirty guide points must be distinct");
        assert.equal(baseline.legends, 16, "sixteen forest-family legend entries");
        assert.equal(baseline.uses, 3, "three use symbols");
        assert.equal(baseline.dangers, 4, "four danger symbols");
        assert.equal(baseline.legends + baseline.uses + baseline.dangers, 23, "the complete ecological legend has twenty-three entries");
        assert.equal(baseline.filters, 18, "eighteen filters across family, resource and protection");
        assert.equal(baseline.seasons, 4, "the four-season calendar must lay out on a phone");
        assert.equal(baseline.canopyLayers, 3, "all three canopy depth layers must lay out on a phone");
        assert.equal(baseline.cueButtons, 8, "all eight regional cues must be tappable on a phone");
        assert.equal(baseline.typeCueButtons, 60, "every card must keep its own listen action");
        assert.ok(baseline.cueHeight >= 44, "cue buttons must be a 44px touch target, got " + baseline.cueHeight);
        assert.ok(baseline.cueRight <= baseline.panelRect.right + 1, "cue buttons must stay inside the panel");
        assert.equal(baseline.seasonOverflow, 0, "no season card may clip horizontally");
        assert.equal(baseline.canopyOverflow, 0, "no canopy layer may clip horizontally");
        assert.equal(baseline.yearColumns, 2, "the phone calendar uses two readable columns");
        assert.ok(baseline.filterHeight >= 44, "filter chips must be at least a 44px touch target, got " + baseline.filterHeight);
        assert.ok(baseline.pointFont >= 10, "guide text must be legible on a small screen, got " + baseline.pointFont);
        assert.ok(baseline.noteFont >= 10, "atlas notes must be legible on a small screen, got " + baseline.noteFont);
        assert.equal(baseline.symbolic, false, "the first session starts in detailed view");
        assert.equal(baseline.modalOpen, true);
        assert.equal(baseline.subtitleOpacity, "0", "the subtitle must not cover an open atlas");
        assert.ok(baseline.docWidth <= viewport.width + 1, "no document horizontal overflow: " + baseline.docWidth);
        assert.ok(baseline.bodyWidth <= viewport.width + 1, "no body horizontal overflow: " + baseline.bodyWidth);
        assert.ok(baseline.panelScrollWidth <= baseline.panelWidth + 1, "the command panel must not scroll horizontally");
        assert.ok(baseline.filterBarScrollWidth <= baseline.filterBarWidth + 1, "filter chips must wrap, not overflow");
        assert.ok(baseline.presentationScrollWidth <= baseline.presentationClientWidth + 1, "the presentation block must fit its panel");
        assert.ok(baseline.panelRect.x >= 0 && baseline.panelRect.right <= viewport.width + 1, "the panel must stay inside the viewport");
        assert.ok(baseline.panelRect.y >= 0 && baseline.panelRect.bottom <= viewport.height + 1, "the panel must not be clipped vertically");
        for (const rect of baseline.filterRects) {
            assert.ok(rect.height >= 44, "every filter chip needs a 44px touch target");
            assert.ok(rect.x >= 0 && rect.right <= baseline.filterBarRight + 1, "every filter chip must stay inside the filter bar");
        }
        for (let index = 0; index < baseline.filterRects.length; index += 1) {
            for (let other = index + 1; other < baseline.filterRects.length; other += 1) {
                const a = baseline.filterRects[index], b = baseline.filterRects[other];
                const overlaps = a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
                assert.equal(overlaps, false, "filter chips must not overlap each other");
            }
        }
        report.checks.baseline = baseline;

        // Every cue is a real touch action, and the printed line is the same
        // cue the ambience engine receives. This is the smallest player proof
        // that the soundscape is reachable on a phone, not only in Settings.
        const cueButton = page.locator('[data-forest-cue="instrument"]');
        await cueButton.scrollIntoViewIfNeeded();
        const cueBox = await cueButton.boundingBox();
        await page.touchscreen.tap(cueBox.x + cueBox.width / 2, cueBox.y + cueBox.height / 2);
        await page.waitForFunction(() => (document.querySelector("[data-forest-cue-text]")?.textContent || "").includes("sounds somewhere"), null, { timeout: 5000 });
        const cue = await page.evaluate(() => ({
            text: document.querySelector("[data-forest-cue-text]")?.textContent.trim() || "",
            last: document.querySelector("[data-forest-last-cue]")?.textContent.trim() || "",
            live: document.querySelector("[data-forest-cue-text]")?.getAttribute("aria-live") || "",
        }));
        assert.ok(cue.text.length > 10, "a tap must print the real cue line");
        assert.match(cue.last, /LAST HEARD/);
        assert.equal(cue.live, "polite");
        report.checks.cue = cue;
        await page.locator(".forest-atlas__year").scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(outputDir, `forest-mobile-${viewport.id}-presentation.png`) });

        // Read the whole field guide through a touch-expanded details element.
        await page.locator("[data-presentation-guide] > summary").tap();
        await page.waitForTimeout(250);
        assert.equal(await page.locator("[data-presentation-guide]").evaluate(element => element.open), true, "the guide must open on tap");
        const guide = await page.evaluate(() => {
            const details = document.querySelector("[data-presentation-guide]");
            const points = [...details.querySelectorAll("[data-presentation-point]")];
            return {
                open: details.open,
                count: points.length,
                visible: points.filter(element => element.getBoundingClientRect().width > 0).length,
                overflow: points.filter(element => element.scrollWidth > element.clientWidth + 1).length,
                firstTop: points[0]?.getBoundingClientRect().top,
                lastBottom: points.at(-1)?.getBoundingClientRect().bottom,
                guideBottom: details.getBoundingClientRect().bottom,
            };
        });
        assert.equal(guide.open, true);
        assert.equal(guide.count, 30);
        assert.equal(guide.visible, 30, "all guide points must have layout");
        assert.equal(guide.overflow, 0, "no guide point may clip horizontally");
        await page.locator("[data-presentation-point]").last().scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        assert.equal(await page.locator("[data-presentation-point]").last().isVisible(), true, "the last guide point must be reachable");
        report.checks.guide = guide;

        // The 23-entry legend is fully laid out; the last danger entry is reachable.
        await page.locator("[data-forest-danger]").last().scrollIntoViewIfNeeded();
        const legend = await page.evaluate(() => {
            const entries = [...document.querySelectorAll("[data-forest-legend], [data-forest-use], [data-forest-danger]")];
            return {
                count: entries.length,
                overflow: entries.filter(element => element.scrollWidth > element.clientWidth + 1).length,
                blank: entries.filter(element => !element.textContent.trim()).length,
                labels: entries.map(element => element.textContent.replace(/\s+/g, " ").trim()),
            };
        });
        assert.equal(legend.count, 23);
        assert.equal(legend.overflow, 0);
        assert.equal(legend.blank, 0);
        assert.equal(new Set(legend.labels).size, 23, "every legend entry must explain a distinct symbol");
        assert.equal(await page.locator("[data-forest-danger]").last().isVisible(), true);
        report.checks.legend = { ...legend, labels: undefined };

        // Species tooltip by touch: no hover is available, so a tap must open the
        // shared tooltip, keep it inside the viewport, and an outside tap closes it.
        const firstCard = page.locator("#command-panel-content .forest-atlas__card").first();
        await firstCard.locator("summary").first().tap();
        await page.waitForTimeout(150);
        const species = firstCard.locator(".forest-atlas__chip").first();
        await species.scrollIntoViewIfNeeded();
        await species.tap();
        await page.waitForTimeout(200);
        const speciesTip = await page.evaluate(() => {
            const tip = document.querySelector("#forest-tip");
            const target = document.querySelector("[data-forest-tip][aria-describedby='forest-tip']");
            const rect = tip.getBoundingClientRect();
            return {
                text: tip.textContent,
                hidden: tip.classList.contains("hidden"),
                ariaHidden: tip.getAttribute("aria-hidden"),
                anchor: target?.getAttribute("data-forest-tip") || "",
                rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
                viewWidth: window.innerWidth,
                viewHeight: window.innerHeight,
                targetHeight: target?.getBoundingClientRect().height || 0,
            };
        });
        assert.equal(speciesTip.hidden, false, "a tap must show the species tooltip");
        assert.equal(speciesTip.ariaHidden, "false");
        assert.ok(speciesTip.text.length > 20);
        assert.equal(speciesTip.text, speciesTip.anchor);
        assert.ok(speciesTip.rect.x >= 0 && speciesTip.rect.right <= speciesTip.viewWidth + 1, "tooltip must fit horizontally");
        assert.ok(speciesTip.rect.y >= 0 && speciesTip.rect.bottom <= speciesTip.viewHeight + 1, "tooltip must fit vertically");
        assert.ok(speciesTip.targetHeight >= 40, "species chips must be touch-sized");
        await page.screenshot({ path: resolve(outputDir, `forest-mobile-${viewport.id}-tooltip.png`) });

        const goodsCard = page.locator(".forest-atlas__card:has(.forest-atlas__good)").first();
        if (!(await goodsCard.evaluate(element => element.open))) await goodsCard.locator("summary").first().tap();
        const goods = goodsCard.locator(".forest-atlas__good").first();
        assert.ok(await goods.count() > 0, "the opened card must expose at least one goods entry");
        await goods.scrollIntoViewIfNeeded();
        await goods.tap();
        await page.waitForTimeout(150);
        const goodsTip = await page.evaluate(() => ({
            text: document.querySelector("#forest-tip").textContent,
            hidden: document.querySelector("#forest-tip").classList.contains("hidden"),
            targetHeight: document.querySelector("[data-forest-tip][aria-describedby='forest-tip']")?.getBoundingClientRect().height || 0,
        }));
        assert.equal(goodsTip.hidden, false, "a tap must show the goods tooltip");
        assert.ok(goodsTip.text.length > 12);
        assert.ok(goodsTip.targetHeight >= 40, "goods buttons must be touch-sized");
        await page.locator(".forest-atlas__presentation-summary").first().tap({ position: { x: 8, y: 8 } });
        await page.waitForTimeout(120);
        assert.equal(await page.locator("#forest-tip").evaluate(element => element.classList.contains("hidden")), true, "an outside tap must close the tooltip");
        report.checks.tooltips = { species: speciesTip, goods: goodsTip };

        // Exercise every one of the eighteen filters with a real touch, then the
        // three-way combination and the reset back to sixty types.
        const filterDefs = await page.evaluate(() => [...document.querySelectorAll("[data-forest-filter]")].map(element => ({
            group: element.dataset.forestFilter,
            value: element.dataset.forestFilterValue,
            label: element.textContent.replace(/\s+/g, " ").trim(),
        })));
        assert.equal(filterDefs.length, 18);
        const filterRuns = [];
        for (const definition of filterDefs) {
            const selector = `[data-forest-filter="${definition.group}"][data-forest-filter-value="${definition.value}"]`;
            const chip = page.locator(selector);
            await chip.scrollIntoViewIfNeeded();
            await chip.tap();
            await page.waitForFunction(({ selector, value }) => {
                const element = document.querySelector(selector);
                return element?.classList.contains("is-current") && element.getAttribute("aria-pressed") === "true"
                    && (document.querySelectorAll("#command-panel-content .forest-atlas__card").length > 0 || document.querySelector("[data-forest-filter-empty]"));
            }, { selector, value: definition.value }, { timeout: 15000 });
            await waitForFilterSettled(page);
            const state = await page.evaluate(selector => {
                const element = document.querySelector(selector);
                const status = document.querySelector("[data-forest-filter-status]")?.textContent.trim() || "";
                const cards = document.querySelectorAll("#command-panel-content .forest-atlas__card").length;
                return {
                    pressed: element.getAttribute("aria-pressed"),
                    current: element.classList.contains("is-current"),
                    status,
                    cards,
                    empty: Boolean(document.querySelector("[data-forest-filter-empty]")),
                    height: element.getBoundingClientRect().height,
                    right: element.getBoundingClientRect().right,
                    viewWidth: window.innerWidth,
                    panelRight: document.querySelector("#command-panel-content").getBoundingClientRect().right,
                };
            }, selector);
            assert.equal(state.pressed, "true", definition.group + "/" + definition.value + " must report pressed");
            assert.equal(state.current, true);
            assert.match(state.status, /^[0-3] \/ 3$/);
            assert.ok(state.height >= 44);
            assert.ok(state.right <= state.panelRight + 1, "filter chip must stay inside the panel");
            assert.ok(state.cards > 0 || state.empty, "a filter must show cards or the empty state");
            filterRuns.push({ ...definition, ...state });
            const measured = await page.evaluate(() => {
                const element = document.querySelector("[data-forest-filter-status]");
                return element?.dataset.forestFilterStatus || "";
            });
            assert.match(measured, /^[0-3]$/);
        }
        await page.locator("[data-forest-filter-reset]").tap();
        await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .forest-atlas__card").length === 60, null, { timeout: 45000 });
        const afterReset = await page.evaluate(() => ({
            cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
            current: [...document.querySelectorAll("[data-forest-filter]")].filter(element => element.classList.contains("is-current")).length,
            active: [...document.querySelectorAll("[data-forest-filter]")].filter(element => element.dataset.forestFilterValue === "all").length,
            status: document.querySelector("[data-forest-filter-status]")?.textContent.trim(),
        }));
        assert.equal(afterReset.cards, 60);
        assert.equal(afterReset.current, 3);
        assert.equal(afterReset.active, 3);
        assert.equal(afterReset.status, "0 / 3");
        report.checks.filters = { runs: filterRuns, afterReset };

        await closeAtlas(page);
        await page.screenshot({ path: resolve(outputDir, `forest-mobile-${viewport.id}-detailed.png`) });

        // All nine forest settings plus reduced interface motion, reached by
        // scrolling the real settings panel and toggled with touch.
        const revisionBefore = await page.evaluate(async () => (await import("./js/core/state.js")).state.terrainCacheRevision || 0);
        await page.locator("#settings-btn").tap();
        await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 10000 });
        const settingsLayout = await page.evaluate(() => {
            const panel = document.querySelector("#settings-modal .settings-panel") || document.querySelector("#settings-modal");
            const forestControls = [...document.querySelectorAll("#settings-modal .settings-forest input, #settings-modal .settings-forest select")];
            return {
                controls: forestControls.length,
                panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
                docWidth: document.documentElement.scrollWidth,
                controlRight: Math.max(...forestControls.map(control => control.getBoundingClientRect().right)),
                viewWidth: window.innerWidth,
            };
        });
        assert.equal(settingsLayout.controls, 9, "all nine forest settings must be present");
        assert.equal(settingsLayout.panelOverflow, false, "the settings panel must not scroll horizontally");
        assert.ok(settingsLayout.docWidth <= viewport.width + 1);
        assert.ok(settingsLayout.controlRight <= viewport.width + 1, "every setting must stay inside the viewport");
        const controlBoxes = {};
        controlBoxes.ambience = await tapToggle(page, "settings-forest-ambience-toggle");
        assert.equal(await page.locator("#settings-forest-ambience-toggle").isChecked(), false);
        controlBoxes.ambience = await tapToggle(page, "settings-forest-ambience-toggle");
        assert.equal(await page.locator("#settings-forest-ambience-toggle").isChecked(), true);
        const volume = page.locator("#settings-forest-ambience-volume");
        await volume.scrollIntoViewIfNeeded();
        const volumeBox = await volume.boundingBox();
        // A range input accepts a tap as focus; the native thumb is then moved
        // with the keyboard so the check also covers non-pointer adjustment.
        await page.touchscreen.tap(volumeBox.x + volumeBox.width * 0.62, volumeBox.y + volumeBox.height / 2);
        await volume.focus();
        for (let step = 0; step < 25; step += 1) await page.keyboard.press("ArrowRight");
        const volumeValue = Number(await volume.inputValue());
        assert.ok(volumeValue >= 40, "the volume slider must move after a touch, got " + volumeValue);
        controlBoxes.subtitles = await tapToggle(page, "settings-forest-subtitles-toggle");
        assert.equal(await page.locator("#settings-forest-subtitles-toggle").isChecked(), true);
        controlBoxes.colorblind = await tapToggle(page, "settings-forest-colorblind-toggle");
        assert.equal(await page.locator("#settings-forest-colorblind-toggle").isChecked(), true);
        controlBoxes.contrast = await tapToggle(page, "settings-forest-contrast-toggle");
        assert.equal(await page.locator("#settings-forest-contrast-toggle").isChecked(), true);
        const fontSelect = page.locator("#settings-forest-font-scale");
        await fontSelect.scrollIntoViewIfNeeded();
        await fontSelect.selectOption("large");
        controlBoxes.performance = await tapToggle(page, "settings-forest-performance-toggle");
        assert.equal(await page.locator("#settings-forest-performance-toggle").isChecked(), true);
        controlBoxes.particles = await tapToggle(page, "settings-forest-particles-toggle");
        assert.equal(await page.locator("#settings-forest-particles-toggle").isChecked(), true);
        const mapSelect = page.locator("#settings-forest-map-view");
        await mapSelect.scrollIntoViewIfNeeded();
        await mapSelect.selectOption("symbolic");
        controlBoxes.map = await mapSelect.boundingBox();
        controlBoxes.motion = await tapToggle(page, "settings-motion-toggle");
        assert.equal(await page.locator("#settings-motion-toggle").isChecked(), true);
        for (const [name, box] of Object.entries(controlBoxes)) {
            assert.ok(box && box.height >= 32 && box.width >= 32, name + " control must be touch-reachable");
        }
        assert.ok(controlBoxes.ambience.height >= 44, "toggle labels must expose a 44px touch target");
        await page.locator("#settings-close").tap();
        await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });

        const settings = await page.evaluate(async () => {
            const [{ state }, presentation, ambience] = await Promise.all([
                import("./js/core/state.js"),
                import("./js/systems/forest-presentation.js"),
                import("./js/core/forest-ambience.js"),
            ]);
            return {
                colorblind: document.documentElement.classList.contains("ui-forest-colorblind"),
                contrast: document.documentElement.classList.contains("ui-forest-contrast"),
                fontLarge: document.documentElement.classList.contains("forest-font-large"),
                symbolic: document.body.classList.contains("ui-forest-symbolic"),
                symbolicSetting: presentation.forestSymbolicMap(),
                motion: presentation.forestMotionScale(),
                particles: presentation.forestParticleScale(),
                volume: ambience.forestAmbienceStatus().volume,
                ambience: ambience.forestAmbienceStatus(),
                revision: state.terrainCacheRevision || 0,
                fontScale: getComputedStyle(document.documentElement).getPropertyValue("--forest-font-scale").trim(),
            };
        });
        assert.equal(settings.colorblind, true);
        assert.equal(settings.contrast, true);
        assert.equal(settings.fontLarge, true);
        assert.equal(settings.symbolic, true);
        assert.equal(settings.symbolicSetting, true);
        assert.ok(settings.motion < 0.3);
        assert.ok(settings.particles < 0.4);
        assert.ok(settings.volume >= 0.4, "ambience volume must survive the slider change, got " + settings.volume);
        assert.equal(settings.ambience.enabled, true);
        assert.ok(settings.revision > revisionBefore, "symbolic view must rebuild the map");
        report.checks.settings = { ...settings, ambience: settings.ambience.enabled, volumeValue, layout: settingsLayout };

        // Both map presentations must keep the full atlas usable. Re-open in the
        // symbolic, colour-blind, high-contrast, large-text presentation.
        await openAtlas(page);
        await page.waitForTimeout(2500);
        const symbolic = await page.evaluate(() => {
            const swatch = document.querySelector(".forest-atlas__legend-swatch");
            const chip = document.querySelector('[data-forest-filter-group="family"] .forest-atlas__filter-chip');
            const point = document.querySelector("[data-presentation-point] p");
            const note = document.querySelector(".forest-atlas__presentation .command-note");
            const panel = document.querySelector("#command-panel-content");
            return {
                cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
                points: document.querySelectorAll("[data-presentation-point]").length,
                legends: document.querySelectorAll("[data-forest-legend], [data-forest-use], [data-forest-danger]").length,
                symbolic: document.body.classList.contains("ui-forest-symbolic"),
                pattern: swatch ? getComputedStyle(swatch).backgroundImage : "",
                chipPattern: chip ? getComputedStyle(chip).backgroundImage : "",
                pointFont: point ? parseFloat(getComputedStyle(point).fontSize) : 0,
                noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : 0,
                settingsText: document.querySelector(".forest-atlas__presentation-settings")?.innerText.replace(/\s+/g, " ").trim() || "",
                panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
                docWidth: document.documentElement.scrollWidth,
            };
        });
        assert.equal(symbolic.symbolic, true);
        assert.equal(symbolic.cards, 60);
        assert.equal(symbolic.points, 30);
        assert.equal(symbolic.legends, 23);
        assert.notEqual(symbolic.pattern, "none", "colour-blind mode must draw legend patterns");
        assert.notEqual(symbolic.chipPattern, "none", "colour-blind mode must draw filter-chip patterns");
        assert.ok(symbolic.pointFont > baseline.pointFont, "large text must enlarge the guide");
        assert.ok(symbolic.noteFont > baseline.noteFont, "large text must enlarge atlas notes");
        assert.ok(symbolic.settingsText.includes("SYMBOLIC"));
        assert.ok(symbolic.settingsText.includes("ON"));
        assert.equal(symbolic.panelOverflow, false);
        assert.ok(symbolic.docWidth <= viewport.width + 1);
        await page.screenshot({ path: resolve(outputDir, `forest-mobile-${viewport.id}-symbolic.png`) });
        report.checks.symbolic = symbolic;

        // The subtitle cue still fires: while the atlas is open it is visually
        // clear of the panel, and it is visible on the map again after closing.
        // Dispatch and read in one synchronous step so a scheduled ambience cue
        // cannot replace the line in between.
        const subtitleOpen = await page.evaluate(() => {
            document.dispatchEvent(new CustomEvent("kac:forest-ambience", {
                detail: { kind: "bird", text: "A capercaillie drums beyond the pines.", at: Date.now() },
            }));
            const subtitle = document.querySelector("#forest-subtitle");
            const panel = document.querySelector(".command-panel").getBoundingClientRect();
            const rect = subtitle.getBoundingClientRect();
            return {
                text: subtitle.textContent.trim(),
                role: subtitle.getAttribute("role"),
                live: subtitle.getAttribute("aria-live"),
                opacity: getComputedStyle(subtitle).opacity,
                hidden: subtitle.classList.contains("hidden"),
                overlapsPanel: rect.x < panel.right && rect.right > panel.x && rect.y < panel.bottom && rect.bottom > panel.y,
                rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
            };
        });
        assert.match(subtitleOpen.text, /capercaillie/i);
        assert.equal(subtitleOpen.role, "status");
        assert.equal(subtitleOpen.live, "polite");
        assert.equal(subtitleOpen.hidden, false);
        assert.equal(subtitleOpen.opacity, "0", "the subtitle must fade while the atlas owns the viewport");
        assert.equal(subtitleOpen.overlapsPanel, true, "the un-faded live region would cover the atlas, so opacity must be zero");
        await closeAtlas(page);
        await page.waitForTimeout(350);
        const subtitleMap = await page.evaluate(() => {
            const subtitle = document.querySelector("#forest-subtitle");
            const rect = subtitle.getBoundingClientRect();
            return {
                text: subtitle.textContent.trim(),
                opacity: getComputedStyle(subtitle).opacity,
                hidden: subtitle.classList.contains("hidden"),
                visible: subtitle.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
                inside: rect.x >= 0 && rect.right <= window.innerWidth + 1 && rect.y >= 0 && rect.bottom <= window.innerHeight + 1,
            };
        });
        assert.equal(subtitleMap.hidden, false);
        assert.equal(subtitleMap.opacity, "1");
        assert.equal(subtitleMap.visible, true, "the subtitle must be visible on the map");
        assert.equal(subtitleMap.inside, true);
        await page.screenshot({ path: resolve(outputDir, `forest-mobile-${viewport.id}-subtitle.png`) });
        report.checks.subtitle = { open: subtitleOpen, map: subtitleMap };

        // Save the realm, reload the start screen and continue it. Every setting
        // must come back, and the symbolic map must still be active.
        await page.locator("#save-btn").tap();
        await page.waitForTimeout(800);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
        const persistedControls = await page.evaluate(() => ({
            map: document.querySelector("#settings-forest-map-view").value,
            font: document.querySelector("#settings-forest-font-scale").value,
            colorblind: document.querySelector("#settings-forest-colorblind-toggle").checked,
            contrast: document.querySelector("#settings-forest-contrast-toggle").checked,
            subtitles: document.querySelector("#settings-forest-subtitles-toggle").checked,
            performance: document.querySelector("#settings-forest-performance-toggle").checked,
            particles: document.querySelector("#settings-forest-particles-toggle").checked,
            motion: document.querySelector("#settings-motion-toggle").checked,
            ambience: document.querySelector("#settings-forest-ambience-toggle").checked,
            volume: Number(document.querySelector("#settings-forest-ambience-volume").value),
        }));
        assert.equal(persistedControls.map, "symbolic");
        assert.equal(persistedControls.font, "large");
        assert.equal(persistedControls.colorblind, true);
        assert.equal(persistedControls.contrast, true);
        assert.equal(persistedControls.subtitles, true);
        assert.equal(persistedControls.performance, true);
        assert.equal(persistedControls.particles, true);
        assert.equal(persistedControls.motion, true);
        assert.equal(persistedControls.ambience, true);
        assert.ok(persistedControls.volume >= 40);
        await page.locator("#continue-game-btn").tap();
        await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
        if (await page.locator("#realm-event-modal").isVisible()) await page.locator("#realm-event-dismiss").tap();
        await page.waitForTimeout(800);
        const continued = await page.evaluate(() => ({
            started: document.querySelector("#start-screen").classList.contains("hidden"),
            symbolic: document.body.classList.contains("ui-forest-symbolic"),
            colorblind: document.documentElement.classList.contains("ui-forest-colorblind"),
            contrast: document.documentElement.classList.contains("ui-forest-contrast"),
            fontLarge: document.documentElement.classList.contains("forest-font-large"),
        }));
        assert.equal(continued.symbolic, true, "the saved symbolic view must survive continue");
        assert.equal(continued.colorblind, true);
        assert.equal(continued.contrast, true);
        assert.equal(continued.fontLarge, true);
        await openAtlas(page);
        const continuedAtlas = await page.evaluate(() => ({
            cards: document.querySelectorAll("#command-panel-content .forest-atlas__card").length,
            points: document.querySelectorAll("[data-presentation-point]").length,
            filters: document.querySelectorAll("[data-forest-filter]").length,
            legends: document.querySelectorAll("[data-forest-legend], [data-forest-use], [data-forest-danger]").length,
            symbolic: document.body.classList.contains("ui-forest-symbolic"),
        }));
        assert.equal(continuedAtlas.cards, 60);
        assert.equal(continuedAtlas.points, 30);
        assert.equal(continuedAtlas.filters, 18);
        assert.equal(continuedAtlas.legends, 23);
        assert.equal(continuedAtlas.symbolic, true);
        report.checks.persistence = { persistedControls, continued, continuedAtlas };

        assert.deepEqual(pageErrors, [], "no page errors are allowed");
        assert.deepEqual(consoleErrors, [], "no console errors are allowed");
        report.checks.pageErrors = pageErrors;
        report.checks.consoleErrors = consoleErrors;
        report.ok = true;
    } catch (error) {
        failed = true;
        report.error = error?.stack || String(error);
        report.pageErrors = pageErrors;
        report.consoleErrors = consoleErrors;
        await page.screenshot({ path: resolve(outputDir, `forest-mobile-${viewport.id}-failure.png`) }).catch(() => {});
        console.error(`[${viewport.id}] ${report.error}`);
    } finally {
        await context.close();
    }
}

await browser.close();
if (server) await new Promise(resolveClose => server.close(resolveClose));
evidence.ok = !failed && Object.values(evidence.viewports).every(viewport => viewport.ok);
await writeFile(reportPath, JSON.stringify(evidence, null, 2));
if (!evidence.ok) {
    console.error(JSON.stringify({ ok: false, viewports: Object.fromEntries(Object.entries(evidence.viewports).map(([id, viewport]) => [id, { ok: viewport.ok, error: viewport.error }])) }, null, 2));
    process.exitCode = 1;
} else {
    console.log(JSON.stringify({
        ok: true,
        viewports: Object.fromEntries(Object.entries(evidence.viewports).map(([id, viewport]) => [id, {
            cards: viewport.checks.baseline?.cards,
            filters: viewport.checks.filters?.runs?.length,
            legend: viewport.checks.legend?.count,
            tooltip: viewport.checks.tooltips?.species?.text,
            symbolic: viewport.checks.symbolic?.symbolic,
            persisted: viewport.checks.persistence?.persistedControls?.map,
        }])),
    }, null, 2));
}
