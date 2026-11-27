// Player proof for 1.2.23.1.271–300 across phone, tablet and desktop.
// It opens every province wood, checks cohorts, hazards, rings, century
// projections and the 30-point field guide, then executes every action named
// in the release: reserve, seed bank, gene bank, nursery, museum,
// afforestation, citizen science and natural monument.
//
// Usage: npm run test:forest-legacy-mobile
//        FOREST_LEGACY_MOBILE_VIEWPORT=1440x900 node tests/browser/forest-legacy-mobile.mjs
//        FOREST_LEGACY_MOBILE_BASE_URL=https://kings-and-cards.pages.dev \
//        FOREST_LEGACY_MOBILE_VIEWPORT=820x1180 node tests/browser/forest-legacy-mobile.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const requestedViewport = /^(\d{3,4})x(\d{3,4})$/.exec((process.env.FOREST_LEGACY_MOBILE_VIEWPORT || "").trim());
const viewport = requestedViewport
    ? { width: Number(requestedViewport[1]), height: Number(requestedViewport[2]) }
    : { width: 390, height: 844 };
const touch = viewport.width <= 1024;
const mobile = viewport.width <= 640;
const artifactBase = `forest-legacy-${viewport.width}x${viewport.height}`;
const outputDir = resolve(process.env.FOREST_LEGACY_MOBILE_OUT
    || (mobile ? "artifacts/forest-legacy-mobile" : `artifacts/${artifactBase}`));
const reportPath = resolve(outputDir, `${artifactBase}.json`);
const seed = 20261127;
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
    isMobile: mobile, hasTouch: touch, deviceScaleFactor: mobile ? 2 : 1,
    reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const badResponses = [];
const screenshots = [];
const report = { seed, baseUrl, viewport, ok: false, checks: {} };
page.on("pageerror", error => errors.push("pageerror: " + error.message));
page.on("console", message => { if (message.type() === "error") errors.push("console: " + message.text()); });
page.on("response", response => { if (response.status() >= 400) badResponses.push(response.status() + " " + response.url()); });

const activate = async locator => {
    await locator.scrollIntoViewIfNeeded();
    if (touch) await locator.tap();
    else await locator.click();
};
const capture = async (name, locator = null) => {
    if (locator) await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const path = resolve(outputDir, `${artifactBase}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    screenshots.push(path);
};
const captureLegacyTop = async name => {
    await page.evaluate(() => {
        const content = document.querySelector("#command-panel-content");
        const title = document.querySelector("[data-forest-legacy] > .command-section-title");
        if (!content || !title) return;
        content.scrollTop += title.getBoundingClientRect().top - content.getBoundingClientRect().top - 6;
    });
    await capture(name);
};
const auditLayout = async () => page.evaluate(() => {
    const root = document.querySelector("[data-forest-legacy]");
    const content = document.querySelector("#command-panel-content");
    if (!root || !content) return { missing: true };
    const contentRect = content.getBoundingClientRect();
    const isVisible = element => {
        if (element.closest("details:not([open])")) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    const selectors = [
        ".forest-legacy__summary", ".forest-legacy__climate", ".forest-legacy__law-grid",
        ".forest-legacy__institutions", ".forest-legacy__stocks", ".forest-legacy__regions",
        ".forest-legacy__region", ".forest-legacy__factgrid", ".forest-legacy__hazards",
        ".forest-legacy__species-list", ".forest-legacy__rings", ".forest-legacy__century",
        ".forest-legacy__actions", ".forest-legacy__achievements", ".forest-legacy__details",
    ];
    const outside = [];
    for (const element of root.querySelectorAll(selectors.join(","))) {
        if (!isVisible(element)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.left < contentRect.left - 1 || rect.right > contentRect.right + 1) {
            outside.push({
                className: String(element.className), left: Math.round(rect.left),
                right: Math.round(rect.right), contentLeft: Math.round(contentRect.left),
                contentRight: Math.round(contentRect.right),
            });
        }
    }
    const actionOverlaps = [];
    const buttons = [...root.querySelectorAll(".forest-legacy__actions button")];
    for (let index = 0; index < buttons.length; index += 1) {
        if (!isVisible(buttons[index])) continue;
        const first = buttons[index].getBoundingClientRect();
        for (let other = index + 1; other < buttons.length; other += 1) {
            if (!isVisible(buttons[other])) continue;
            const second = buttons[other].getBoundingClientRect();
            if (first.left < second.right - 1 && second.left < first.right - 1
                && first.top < second.bottom - 1 && second.top < first.bottom - 1) {
                actionOverlaps.push({
                    first: buttons[index].dataset.legacyRegionAction,
                    second: buttons[other].dataset.legacyRegionAction,
                });
            }
        }
    }
    const ringClipped = [];
    for (const chart of root.querySelectorAll(".forest-legacy__rings")) {
        const chartRect = chart.getBoundingClientRect();
        for (const bar of chart.querySelectorAll("i")) {
            if (!isVisible(bar)) continue;
            const rect = bar.getBoundingClientRect();
            if (rect.left < chartRect.left - 1 || rect.right > chartRect.right + 1) {
                ringClipped.push({ chart: chart.getAttribute("aria-label"), width: Math.round(rect.width) });
            }
        }
    }
    return {
        viewport: [window.innerWidth, window.innerHeight],
        documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        contentOverflow: Math.max(0, content.scrollWidth - content.clientWidth),
        rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
        outside: outside.slice(0, 12),
        actionOverlaps: actionOverlaps.slice(0, 12),
        ringClipped: ringClipped.slice(0, 12),
    };
});

const openRegion = async id => {
    await page.evaluate(regionId => {
        const region = document.querySelector(`.forest-legacy__region[data-legacy-region="${regionId}"]`);
        if (region && !region.open) region.querySelector("summary")?.click();
    }, id);
    await page.waitForFunction(regionId => {
        const region = document.querySelector(`.forest-legacy__region[data-legacy-region="${regionId}"]`);
        return Boolean(region?.open);
    }, id, { timeout: 10000 });
};
const openAllRegions = async () => page.evaluate(async () => {
    const regions = [...document.querySelectorAll(".forest-legacy__region")];
    for (const region of regions) {
        if (!region.open) region.querySelector("summary")?.click();
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
    return regions.length;
});

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Legacy Warden");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
    await page.waitForTimeout(1000);

    // The browser proof provides a temporary budget so the player can exercise
    // every action in one review. It does not change forest mechanics or save
    // data; the action costs still go through the shared resources.
    const fixture = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        Object.assign(state.resources, {
            gold: Math.max(1600, Number(state.resources.gold) || 0),
            wood: Math.max(1600, Number(state.resources.wood) || 0),
            stone: Math.max(1600, Number(state.resources.stone) || 0),
            food: Math.max(1600, Number(state.resources.food) || 0),
        });
        return {
            year: state.year, paused: state.isPaused,
            resources: { ...state.resources },
        };
    });
    report.checks.fixture = fixture;

    await activate(page.locator("#command-open-btn"));
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    const panelSelect = page.locator("#command-tab-select");
    if (await panelSelect.isVisible()) await panelSelect.selectOption("forest");
    else await activate(page.locator('[data-command-tab="forest"]'));
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
            rings: Number((root.querySelector(".forest-legacy__summary > div:nth-child(4) strong")?.textContent || "").replace(/[^0-9]/g, "")),
            protectedCount: Number(root.dataset.legacyProtected),
            guide: Boolean(root.querySelector('[data-legacy-guide="30"]')),
            labels: regions.map(region => region.querySelector(".forest-legacy__region-title b")?.textContent?.trim() || ""),
            regionActions: regions.map(region => region.querySelectorAll("[data-legacy-region-action]").length),
            guideEntries: root.querySelectorAll("[data-legacy-point]").length,
            ringCharts: root.querySelectorAll(".forest-legacy__rings").length,
            centuryCards: root.querySelectorAll(".forest-legacy__century > span").length,
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
    assert.ok(initial.rings > 0, "founding rings must already be counted in the headline ledger");
    assert.equal(initial.guide, true);
    assert.equal(initial.guideEntries, 30);
    assert.equal(initial.ringCharts, 10);
    assert.equal(initial.centuryCards, 30);
    assert.ok(initial.labels.every(Boolean), "every province needs a readable name");
    assert.ok(initial.regionActions.every(count => count === 4), "every province needs four actions");
    report.checks.initial = initial;

    await captureLegacyTop("top");
    await capture("institutions", page.locator(".forest-legacy__institutions"));

    const initialLayout = await auditLayout();
    assert.equal(initialLayout.missing, undefined);
    assert.equal(initialLayout.documentOverflow, 0, "the page must not scroll horizontally");
    assert.equal(initialLayout.contentOverflow, 0, "the command content must not scroll horizontally");
    assert.equal(initialLayout.rootOverflow, 0, "the forest ledger must not overflow its own content box");
    assert.deepEqual(initialLayout.outside, [], "every legacy section must stay inside the command content");
    assert.deepEqual(initialLayout.actionOverlaps, [], "action buttons must not overlap");
    assert.deepEqual(initialLayout.ringClipped, [], "ring bars must not be clipped");
    report.checks.initialLayout = initialLayout;

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
                actions: region.querySelectorAll("[data-legacy-region-action]").length,
                visible: region.getBoundingClientRect().height > 0,
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
        assert.equal(region.actions, 4, region.id + " must expose four actions");
        assert.equal(region.visible, true);
    }
    report.checks.regions = opened;

    const allLayout = await auditLayout();
    assert.equal(allLayout.contentOverflow, 0, "all open regions must not create horizontal content overflow");
    assert.equal(allLayout.rootOverflow, 0);
    assert.deepEqual(allLayout.outside, [], "all open regions must stay inside the command content");
    assert.deepEqual(allLayout.actionOverlaps, []);
    assert.deepEqual(allLayout.ringClipped, []);
    report.checks.allRegionsLayout = allLayout;

    // Capture each province once so the review has a visible record of every
    // regional forest, not just the first open card.
    for (const region of opened) {
        const locator = page.locator(`.forest-legacy__region[data-legacy-region="${region.id}"]`);
        await capture(`region-${region.id}`, locator);
    }

    const guide = page.locator('[data-legacy-guide="30"]');
    await activate(guide.locator("summary"));
    await page.waitForFunction(() => document.querySelector('[data-legacy-guide="30"]')?.open === true);
    const guidePoints = await page.locator("[data-legacy-point]").count();
    assert.equal(guidePoints, 30, "the field guide must reveal all thirty points");
    await capture("field-guide", guide);
    report.checks.guide = { points: guidePoints, open: true };

    // Raise all four institutions. The nursery is raised twice so the realm
    // has exactly eight seedlings for the afforestation action.
    const institutions = [["seed-bank", 1], ["gene-bank", 1], ["nursery", 1], ["nursery", 2], ["museum", 1]];
    for (const [id, level] of institutions) {
        const button = page.locator(`[data-legacy-build="${id}"]`);
        assert.equal(await button.isDisabled(), false, `${id} level ${level} must be affordable in the review budget`);
        await activate(button);
        await page.waitForFunction(({ id: institutionId, level: expected }) => {
            const card = document.querySelector(`[data-legacy-institution="${institutionId}"]`);
            return card && Number(card.dataset.legacyLevel) === expected;
        }, { id, level }, { timeout: 15000 });
    }
    const institutionsAfter = await page.evaluate(() => {
        const root = document.querySelector("[data-forest-legacy]");
        const cards = [...root.querySelectorAll("[data-legacy-institution]")];
        const stocks = [...root.querySelectorAll(".forest-legacy__stocks > span")].map(span => ({
            label: span.querySelector("small")?.textContent?.trim() || "",
            value: Number((span.querySelector("b")?.textContent || "").replace(/[^0-9]/g, "")),
        }));
        return {
            levels: Object.fromEntries(cards.map(card => [card.dataset.legacyInstitution, Number(card.dataset.legacyLevel)])),
            filled: Object.fromEntries(cards.map(card => [card.dataset.legacyInstitution, card.querySelectorAll(".forest-legacy__levels i.is-filled").length])),
            stocks: Object.fromEntries(stocks.map(stock => [stock.label, stock.value])),
            citizen: root.querySelector("[data-legacy-citizen]")?.textContent?.trim() || "",
        };
    });
    console.log("FOREST LEGACY INSTITUTIONS", JSON.stringify(institutionsAfter));
    assert.deepEqual(institutionsAfter.levels, { "seed-bank": 1, "gene-bank": 1, nursery: 2, museum: 1 });
    assert.deepEqual(institutionsAfter.filled, { "seed-bank": 1, "gene-bank": 1, nursery: 2, museum: 1 });
    assert.ok(institutionsAfter.stocks["SEED STOCK"] >= 4, "the seed bank must add seed stock");
    assert.ok(institutionsAfter.stocks["GENE LINES"] >= 2, "the gene bank must add gene lines");
    assert.ok(institutionsAfter.stocks["SEEDLINGS"] >= 8, "the nursery must add seedlings");
    assert.ok(institutionsAfter.stocks.SPECIMENS >= 3, "the museum must add specimens");
    report.checks.institutions = institutionsAfter;

    await openRegion("crown-heartland");
    const protect = page.locator('[data-legacy-region="crown-heartland"] [data-legacy-region-action="protect"]');
    assert.equal(await protect.isDisabled(), false);
    await activate(protect);
    await page.waitForFunction(() => document.querySelector("[data-forest-legacy]")?.dataset.legacyProtected === "1");
    await openRegion("crown-heartland");
    const protectedState = await page.evaluate(() => {
        const root = document.querySelector("[data-forest-legacy]");
        const region = root.querySelector('.forest-legacy__region[data-legacy-region="crown-heartland"]');
        return {
            count: Number(root.dataset.legacyProtected),
            protection: region?.dataset.legacyProtection || "",
            rules: region?.querySelector(".forest-legacy__factgrid > span:last-child b")?.textContent?.trim() || "",
            note: region?.querySelector(".forest-legacy__region-body > .command-note")?.textContent?.trim() || "",
            protectDisabled: Boolean(region?.querySelector('[data-legacy-region-action="protect"]')?.disabled),
            afforestAfterProtectDisabled: Boolean(region?.querySelector('[data-legacy-region-action="afforest"]')?.disabled),
            afforestAfterProtectTitle: region?.querySelector('[data-legacy-region-action="afforest"]')?.title || "",
        };
    });
    assert.equal(protectedState.count, 1);
    assert.equal(protectedState.protection, "reserve");
    assert.match(protectedState.rules, /SALVAGE/i);
    assert.match(protectedState.note, /reserve|salvage/i);
    assert.equal(protectedState.protectDisabled, true, "a protected wood must disable its protect action");
    assert.equal(protectedState.afforestAfterProtectDisabled, true, "a reserve action must use the one-action-per-year slot");
    assert.match(protectedState.afforestAfterProtectTitle, /year/i);
    report.checks.protection = protectedState;
    await capture("action-protection", page.locator('.forest-legacy__region[data-legacy-region="crown-heartland"]'));

    const citizen = page.locator("[data-legacy-citizen]");
    assert.equal(await citizen.isDisabled(), false);
    await activate(citizen);
    await page.waitForFunction(() => document.querySelector("[data-legacy-citizen]")?.textContent?.includes("1 / 3"));
    const citizenAfter = await page.evaluate(() => ({
        text: document.querySelector("[data-legacy-citizen]")?.textContent?.trim() || "",
        level: Number((document.querySelector("[data-legacy-citizen]")?.textContent || "").match(/(\d+)\s*\/\s*3/)?.[1] || 0),
    }));
    assert.equal(citizenAfter.level, 1);
    report.checks.citizenScience = citizenAfter;
    await capture("action-citizen", page.locator(".forest-legacy__institutions"));

    await openRegion("crown-march");
    const afforest = page.locator('[data-legacy-region="crown-march"] [data-legacy-region-action="afforest"]');
    assert.equal(await afforest.isDisabled(), false);
    const beforeAfforest = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const region = state.forestLegacy.regions.find(entry => entry.id === "crown-march");
        return { canopy: region.canopy, seedlings: state.forestLegacy.seedlings, year: state.year };
    });
    await activate(afforest);
    await page.waitForFunction(async ({ canopy, seedlings }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.forestLegacy.regions.find(entry => entry.id === "crown-march");
        return region.canopy > canopy + 0.01 && state.forestLegacy.seedlings < seedlings;
    }, beforeAfforest, { timeout: 15000 });
    await openRegion("crown-march");
    const afterAfforest = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const region = state.forestLegacy.regions.find(entry => entry.id === "crown-march");
        const card = document.querySelector('.forest-legacy__region[data-legacy-region="crown-march"]');
        return {
            canopy: region.canopy, seedlings: state.forestLegacy.seedlings, planted: region.planted,
            actionDisabled: Boolean(card?.querySelector('[data-legacy-region-action="afforest"]')?.disabled),
            actionTitle: card?.querySelector('[data-legacy-region-action="afforest"]')?.title || "",
        };
    });
    assert.ok(afterAfforest.canopy > beforeAfforest.canopy + 0.01, "afforestation must raise canopy");
    assert.ok(afterAfforest.seedlings < beforeAfforest.seedlings, "afforestation must spend nursery seedlings");
    assert.ok(afterAfforest.planted >= 8, "afforestation must plant eight stems");
    assert.equal(afterAfforest.actionDisabled, true, "a wood action must disable until the next year");
    assert.match(afterAfforest.actionTitle, /year/i);
    report.checks.afforestation = { before: beforeAfforest, after: afterAfforest };
    await capture("action-afforestation", page.locator('.forest-legacy__region[data-legacy-region="crown-march"]'));

    const monumentRegionId = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const year = state.year;
        return state.forestLegacy.regions.find(region =>
            region.ageYears >= 100 && region.protection === "none" && region.lastActionYear !== year)?.id || null;
    });
    assert.ok(monumentRegionId, "the review needs a vacant old-growth province for a monument");
    await openRegion(monumentRegionId);
    const monument = page.locator(`[data-legacy-region="${monumentRegionId}"] [data-legacy-region-action="monument"]`);
    assert.equal(await monument.isDisabled(), false);
    await activate(monument);
    await page.waitForFunction(regionId => {
        const region = document.querySelector(`.forest-legacy__region[data-legacy-region="${regionId}"]`);
        return region?.querySelectorAll(".forest-legacy__monument").length >= 1;
    }, monumentRegionId, { timeout: 15000 });
    await openRegion(monumentRegionId);
    const monumentState = await page.evaluate(regionId => {
        const root = document.querySelector("[data-forest-legacy]");
        const region = root.querySelector(`.forest-legacy__region[data-legacy-region="${regionId}"]`);
        return {
            id: regionId,
            protection: region?.dataset.legacyProtection || "",
            rules: region?.querySelector(".forest-legacy__factgrid > span:last-child b")?.textContent?.trim() || "",
            monuments: [...region.querySelectorAll(".forest-legacy__monument")].map(monument => ({
                label: monument.querySelector("b")?.textContent?.trim() || "",
                story: monument.querySelector("p")?.textContent?.trim() || "",
            })),
            actionDisabled: Boolean(region?.querySelector('[data-legacy-region-action="monument"]')?.disabled),
            actionTitle: region?.querySelector('[data-legacy-region-action="monument"]')?.title || "",
            protectedCount: Number(root.dataset.legacyProtected),
        };
    }, monumentRegionId);
    assert.equal(monumentState.protection, "monument");
    assert.match(monumentState.rules, /MONUMENT/i);
    assert.equal(monumentState.monuments.length, 1);
    assert.ok(monumentState.monuments[0].label.length > 2);
    assert.ok(monumentState.monuments[0].story.length > 10);
    assert.equal(monumentState.actionDisabled, true);
    assert.match(monumentState.actionTitle, /year/i);
    assert.ok(monumentState.protectedCount >= 2);
    report.checks.monument = monumentState;
    await capture("action-monument", page.locator(`.forest-legacy__region[data-legacy-region="${monumentRegionId}"]`));

    await openAllRegions();
    const finalLayout = await auditLayout();
    assert.equal(finalLayout.contentOverflow, 0, "the completed ledger must not overflow horizontally");
    assert.equal(finalLayout.rootOverflow, 0);
    assert.deepEqual(finalLayout.outside, []);
    assert.deepEqual(finalLayout.actionOverlaps, []);
    assert.deepEqual(finalLayout.ringClipped, []);
    report.checks.finalLayout = finalLayout;
    await captureLegacyTop("final-top");
    await capture("final-institutions", page.locator(".forest-legacy__institutions"));
    await capture("final-region", page.locator(`.forest-legacy__region[data-legacy-region="${monumentRegionId}"]`));

    const finalState = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            year: state.year,
            protectedRegions: state.forestLegacy.regions.filter(region => region.protection !== "none").length,
            institutions: { ...state.forestLegacy.institutions },
            citizenScience: state.forestLegacy.citizenScience,
            planted: state.forestLegacy.stats.planted,
            monuments: state.forestLegacy.stats.monuments,
            rings: state.forestLegacy.stats.rings,
            seedlings: state.forestLegacy.seedlings,
        };
    });
    assert.equal(finalState.institutions["seed-bank"], 1);
    assert.equal(finalState.institutions["gene-bank"], 1);
    assert.equal(finalState.institutions.nursery, 2);
    assert.equal(finalState.institutions.museum, 1);
    assert.equal(finalState.citizenScience, 1);
    assert.ok(finalState.protectedRegions >= 2);
    assert.ok(finalState.planted >= 8);
    assert.ok(finalState.monuments >= 1);
    report.checks.finalState = finalState;

    assert.deepEqual(errors, [], "the legacy panel must not log a page or console error");
    assert.deepEqual(badResponses, [], "the legacy panel must not load a broken asset");
    report.checks.errors = errors;
    report.checks.screenshots = screenshots;
    report.ok = true;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log("FOREST LEGACY VIEWPORT OK", JSON.stringify({
        reportPath, viewport, checks: Object.keys(report.checks),
        regions: initial.regions, points: initial.points, screenshots: screenshots.length,
    }));
} finally {
    await context.close();
    await browser.close();
    if (server) await new Promise(done => server.close(done));
    if (!report.ok) {
        await writeFile(reportPath, JSON.stringify({ ...report, errors, badResponses, screenshots }, null, 2) + "\n").catch(() => {});
        console.error("FOREST LEGACY VIEWPORT FAILED", JSON.stringify({ viewport, errors, badResponses }));
        process.exitCode = 1;
    }
}
