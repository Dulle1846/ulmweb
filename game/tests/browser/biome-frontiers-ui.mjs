// Player proof for 1.2.23.2–16 on desktop and tablet.
// It opens the biome register, verifies all fifteen ecosystems, their species,
// hazards, rare communities, goods and the fifteen-point field guide, then
// exercises survey, conservation and stabilisation through the real buttons.
//
// Usage: npm run test:biome-frontiers
//        FRONTIER_UI_VIEWPORT=1440x900 node tests/browser/biome-frontiers-ui.mjs
//        FRONTIER_UI_BASE_URL=https://kings-and-cards.pages.dev \
//        FRONTIER_UI_VIEWPORT=820x1180 node tests/browser/biome-frontiers-ui.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const requested = /^(\d{3,4})x(\d{3,4})$/.exec((process.env.FRONTIER_UI_VIEWPORT || "").trim());
const viewport = requested ? { width: Number(requested[1]), height: Number(requested[2]) } : { width: 1440, height: 900 };
const touch = viewport.width <= 1024;
const mobile = viewport.width <= 640;
const artifactBase = `biome-frontiers-${viewport.width}x${viewport.height}`;
const outputDir = resolve(process.env.FRONTIER_UI_OUT || `artifacts/${artifactBase}`);
const reportPath = resolve(outputDir, `${artifactBase}.json`);
const seed = 20261228;
const remoteBase = (process.env.FRONTIER_UI_BASE_URL || "").trim().replace(/\/$/, "");
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
    await page.waitForTimeout(120);
    const path = resolve(outputDir, `${artifactBase}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    screenshots.push(path);
};
const captureTop = async name => capture(name, page.locator("[data-biome-frontier] > .command-section-title"));
const openCard = async family => {
    await page.evaluate(familyId => {
        const card = document.querySelector(`[data-frontier-family="${familyId}"]`);
        if (card && !card.open) card.querySelector("summary")?.click();
    }, family);
    await page.waitForFunction(familyId => {
        const card = document.querySelector(`[data-frontier-family="${familyId}"]`);
        return Boolean(card?.open);
    }, family, { timeout: 10000 });
};
const openAllCards = async () => page.evaluate(async () => {
    const cards = [...document.querySelectorAll("[data-frontier-site]")];
    for (const card of cards) {
        if (!card.open) card.querySelector("summary")?.click();
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
    return cards.length;
});
const auditLayout = async () => page.evaluate(() => {
    const root = document.querySelector("[data-biome-frontier]");
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
        ".biome-frontier__summary", ".biome-frontier__climate", ".biome-frontier__card",
        ".biome-frontier__meters", ".biome-frontier__hazards", ".biome-frontier__species-list",
        ".biome-frontier__specialists", ".biome-frontier__goods", ".biome-frontier__actions",
        ".biome-frontier__details", ".biome-frontier__guide",
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
    const buttons = [...root.querySelectorAll(".biome-frontier__actions button, .biome-frontier__good button")];
    const overlaps = [];
    for (let index = 0; index < buttons.length; index += 1) {
        if (!isVisible(buttons[index])) continue;
        const first = buttons[index].getBoundingClientRect();
        for (let other = index + 1; other < buttons.length; other += 1) {
            if (!isVisible(buttons[other])) continue;
            const second = buttons[other].getBoundingClientRect();
            if (first.left < second.right - 1 && second.left < first.right - 1
                && first.top < second.bottom - 1 && second.top < first.bottom - 1) {
                overlaps.push({
                    first: buttons[index].dataset.frontierAction || buttons[index].dataset.command,
                    second: buttons[other].dataset.frontierAction || buttons[other].dataset.command,
                });
            }
        }
    }
    return {
        viewport: [window.innerWidth, window.innerHeight],
        documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        contentOverflow: Math.max(0, content.scrollWidth - content.clientWidth),
        rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
        outside: outside.slice(0, 12),
        buttonOverlaps: overlaps.slice(0, 12),
    };
});

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Frontier Warden");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
    await page.waitForTimeout(1000);

    const fixture = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        Object.assign(state.resources, {
            gold: Math.max(1600, Number(state.resources.gold) || 0),
            wood: Math.max(1600, Number(state.resources.wood) || 0),
            stone: Math.max(1600, Number(state.resources.stone) || 0),
            food: Math.max(1600, Number(state.resources.food) || 0),
        });
        return { year: state.year, resources: { ...state.resources }, paused: state.isPaused };
    });
    report.checks.fixture = fixture;

    await activate(page.locator("#command-open-btn"));
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    const panelSelect = page.locator("#command-tab-select");
    if (await panelSelect.isVisible()) await panelSelect.selectOption("biome");
    else await activate(page.locator('[data-command-tab="biome"]'));
    await page.locator("#command-panel-content [data-biome-frontier]").waitFor({ state: "visible", timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-frontier-site]").length === 15
        && document.querySelectorAll("[data-frontier-point]").length === 15, null, { timeout: 60000 });

    const initial = await page.evaluate(() => {
        const root = document.querySelector("[data-biome-frontier]");
        const cards = [...root.querySelectorAll("[data-frontier-site]")];
        return {
            rootSites: Number(root.dataset.frontierSites),
            cards: cards.length,
            families: new Set(cards.map(card => card.dataset.frontierFamily)).size,
            species: cards.reduce((sum, card) => sum + Number(card.dataset.frontierSpeciesCount || 0), 0),
            specialists: root.querySelectorAll("[data-frontier-specialist]").length,
            hazards: root.querySelectorAll("[data-frontier-hazard]").length,
            goods: root.querySelectorAll("[data-frontier-good-row]").length,
            actions: root.querySelectorAll("[data-frontier-action]").length,
            points: root.querySelectorAll("[data-frontier-point]").length,
            guide: Boolean(root.querySelector('[data-frontier-guide="15"]')),
            labels: cards.map(card => card.querySelector(".biome-frontier__title b")?.textContent?.trim() || ""),
            requirements: [...root.querySelectorAll("[data-frontier-point]")].map(entry => entry.dataset.frontierPoint),
        };
    });
    console.log("FRONTIER INITIAL", JSON.stringify(initial));
    assert.equal(initial.rootSites, 15);
    assert.equal(initial.cards, 15);
    assert.equal(initial.families, 15);
    assert.ok(initial.species >= 90, "the fifteen sites must mount at least six living cohorts each");
    assert.equal(initial.specialists, 45);
    assert.equal(initial.hazards, 45);
    assert.equal(initial.goods, 30);
    assert.ok(initial.actions >= 15, "every site must expose its action set");
    assert.equal(initial.points, 15);
    assert.equal(initial.guide, true);
    assert.ok(initial.labels.every(Boolean));
    assert.deepEqual([...initial.requirements].sort(), Array.from({ length: 15 }, (_, index) => "1.2.23." + (index + 2)).sort());
    report.checks.initial = initial;

    await captureTop("top");
    const initialLayout = await auditLayout();
    assert.equal(initialLayout.documentOverflow, 0, "the page must not scroll horizontally");
    assert.equal(initialLayout.contentOverflow, 0, "the command content must not scroll horizontally");
    assert.equal(initialLayout.rootOverflow, 0, "the frontier register must not overflow its own box");
    assert.deepEqual(initialLayout.outside, [], "every frontier block must stay inside the command content");
    assert.deepEqual(initialLayout.buttonOverlaps, [], "frontier buttons must not overlap");
    report.checks.initialLayout = initialLayout;

    const opened = await openAllCards();
    assert.equal(opened, 15);
    const cards = await page.evaluate(() => [...document.querySelectorAll("[data-frontier-site]")].map(card => ({
        family: card.dataset.frontierFamily,
        phase: card.dataset.frontierPhase,
        condition: Number(card.dataset.frontierCondition),
        species: card.querySelectorAll("[data-frontier-species]").length,
        specialists: card.querySelectorAll("[data-frontier-specialist]").length,
        hazards: card.querySelectorAll("[data-frontier-hazard]").length,
        goods: card.querySelectorAll("[data-frontier-good-row]").length,
        actions: card.querySelectorAll("[data-frontier-action]").length,
    })));
    for (const card of cards) {
        assert.ok(card.species >= 6, card.family + " must show its species roster");
        assert.equal(card.specialists, 3, card.family + " must show its rare community");
        assert.equal(card.hazards, 3, card.family + " must show its hazard record");
        assert.equal(card.goods, 2, card.family + " must show two rare goods");
        assert.ok(card.actions >= 1, card.family + " must expose an action");
        assert.ok(card.condition >= 0 && card.condition <= 100);
    }
    report.checks.cards = cards;
    await capture("savanna", page.locator('[data-frontier-family="savanna-dry-woodland"]'));

    const guide = page.locator('[data-frontier-guide="15"]');
    await activate(guide.locator("summary"));
    await page.waitForFunction(() => document.querySelector('[data-frontier-guide="15"]')?.open === true);
    assert.equal(await page.locator("[data-frontier-point]").count(), 15);
    await capture("field-guide", guide);
    report.checks.guide = { points: 15, open: true };

    await openCard("savanna-dry-woodland");
    const surveyButton = page.locator('[data-frontier-family="savanna-dry-woodland"] [data-frontier-action="survey"]');
    assert.equal(await surveyButton.isDisabled(), false, "the first site must offer a survey");
    const goldBefore = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
    await activate(surveyButton);
    await page.waitForFunction(() => document.querySelector('[data-frontier-family="savanna-dry-woodland"]')?.dataset.frontierSurveyed === "1", null, { timeout: 20000 });
    const afterSurvey = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const card = document.querySelector('[data-frontier-family="savanna-dry-woodland"]');
        return {
            gold: state.resources.gold,
            surveyed: card?.dataset.frontierSurveyed,
            deep: card?.dataset.frontierDeepSurveyed,
            phase: card?.dataset.frontierPhase,
            condition: Number(card?.dataset.frontierCondition),
            actions: [...card.querySelectorAll("[data-frontier-action]")].map(button => ({
                action: button.dataset.frontierAction, disabled: button.disabled, title: button.title,
            })),
        };
    });
    assert.ok(afterSurvey.gold < goldBefore, "the survey must spend real gold");
    assert.equal(afterSurvey.surveyed, "1");
    assert.equal(afterSurvey.deep, "0");
    assert.equal(afterSurvey.actions.every(action => action.disabled), true,
        "one action per site each year must disable the rest, including the deep survey");
    report.checks.survey = { goldBefore, after: afterSurvey };
    await capture("action-survey", page.locator('[data-frontier-family="savanna-dry-woodland"]'));

    // Reopening the panel is the ordinary player route to a fresh year's
    // availability; the test advances the year only as a review fixture.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.year = Math.max(2, Number(state.year) + 1);
    });
    if (!(await page.locator("#command-modal").isVisible())) {
        await activate(page.locator("#command-open-btn"));
        await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    }
    if (await panelSelect.isVisible()) await panelSelect.selectOption("biome");
    else await activate(page.locator('[data-command-tab="biome"]'));
    await page.waitForFunction(() => document.querySelectorAll("[data-frontier-site]").length === 15, null, { timeout: 60000 });
    await openCard("savanna-dry-woodland");
    const deepButton = page.locator('[data-frontier-family="savanna-dry-woodland"] [data-frontier-action="deepSurvey"]');
    assert.equal(await deepButton.isDisabled(), false, "the next year must unlock the deep survey");
    const deepGoldBefore = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
    await activate(deepButton);
    await page.waitForFunction(() => document.querySelector('[data-frontier-family="savanna-dry-woodland"]')?.dataset.frontierDeepSurveyed === "1", null, { timeout: 20000 });
    const afterDeep = await page.evaluate(async () => ({
        gold: (await import("./js/core/state.js")).state.resources.gold,
        deep: document.querySelector('[data-frontier-family="savanna-dry-woodland"]')?.dataset.frontierDeepSurveyed,
        specials: document.querySelectorAll('[data-frontier-family="savanna-dry-woodland"] [data-frontier-specialist]').length,
    }));
    assert.equal(afterDeep.deep, "1");
    assert.ok(afterDeep.gold < deepGoldBefore, "the deep survey must spend real gold");
    assert.equal(afterDeep.specials, 3);
    report.checks.deepSurvey = { before: deepGoldBefore, after: afterDeep };
    await capture("action-deep-survey", page.locator('[data-frontier-family="savanna-dry-woodland"]'));

    await openCard("mangrove");
    const conserveButton = page.locator('[data-frontier-family="mangrove"] [data-frontier-action="conserve"]');
    assert.equal(await conserveButton.isDisabled(), false, "mangrove conservation must be affordable");
    await activate(conserveButton);
    await page.waitForFunction(() => document.querySelector('[data-frontier-family="mangrove"]')?.dataset.frontierProtected === "1", null, { timeout: 20000 });
    const conserved = await page.evaluate(() => {
        const card = document.querySelector('[data-frontier-family="mangrove"]');
        return { protected: card?.dataset.frontierProtected, actions: [...card.querySelectorAll("[data-frontier-action]")].map(button => button.dataset.frontierAction) };
    });
    assert.equal(conserved.protected, "1");
    assert.equal(conserved.actions.includes("conserve"), false, "a conserved site must stop offering conservation");
    report.checks.conserve = conserved;
    await capture("action-conserve", page.locator('[data-frontier-family="mangrove"]'));

    await openCard("magic-primeval");
    const magicBefore = Number(await page.locator('[data-frontier-family="magic-primeval"]').getAttribute("data-frontier-magic"));
    const stabiliseButton = page.locator('[data-frontier-family="magic-primeval"] [data-frontier-action="stabilise"]');
    assert.equal(await stabiliseButton.isDisabled(), false, "the magical wood must offer stabilisation");
    await activate(stabiliseButton);
    await page.waitForFunction(before => Number(document.querySelector('[data-frontier-family="magic-primeval"]')?.dataset.frontierMagic) < before, magicBefore, { timeout: 20000 });
    const magicAfter = Number(await page.locator('[data-frontier-family="magic-primeval"]').getAttribute("data-frontier-magic"));
    assert.ok(magicAfter < magicBefore, "stabilisation must lower wild magic");
    report.checks.stabilise = { before: magicBefore, after: magicAfter };
    await capture("action-stabilise", page.locator('[data-frontier-family="magic-primeval"]'));

    await openAllCards();
    const finalLayout = await auditLayout();
    assert.equal(finalLayout.contentOverflow, 0);
    assert.equal(finalLayout.rootOverflow, 0);
    assert.deepEqual(finalLayout.outside, []);
    assert.deepEqual(finalLayout.buttonOverlaps, []);
    report.checks.finalLayout = finalLayout;
    await captureTop("final-top");

    assert.deepEqual(errors, [], "the register must not log console or page errors");
    assert.deepEqual(badResponses, [], "the register must not request a missing asset");
    report.ok = true;
    report.screenshots = screenshots;
    await import("node:fs/promises").then(fs => fs.writeFile(reportPath, JSON.stringify(report, null, 2)));
    console.log("FRONTIER REGISTER PASS", JSON.stringify({
        viewport, sites: initial.cards, species: initial.species, points: initial.points,
        survey: afterSurvey.surveyed, conserved: conserved.protected, magic: magicAfter,
        documentOverflow: finalLayout.documentOverflow, contentOverflow: finalLayout.contentOverflow,
        screenshots: screenshots.length, errors: errors.length, badResponses: badResponses.length,
    }));
} catch (error) {
    report.error = String(error?.stack || error);
    await import("node:fs/promises").then(fs => fs.writeFile(reportPath, JSON.stringify(report, null, 2))).catch(() => {});
    console.error("FRONTIER REGISTER FAIL", error);
    process.exitCode = 1;
} finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (server) await new Promise(done => server.close(done));
}
