// Smartphone player proof for 1.2.23.2–16.
// Every viewport reads all fifteen field-guide points, opens and closes site
// cards, and executes survey, deep survey, conservation, restoration, revival,
// harvest, stabilisation and sale through the real buttons. It audits touch
// target sizes, horizontal overflow, button overlap, clipped text and the
// visible result after each action.
//
// Usage: npm run test:biome-frontiers-mobile
//        FRONTIER_MOBILE_VIEWPORTS=360x640,640x360 \
//        FRONTIER_MOBILE_BASE_URL=https://kings-and-cards.pages.dev \
//        node tests/browser/biome-frontiers-mobile.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const defaultViewports = ["360x640", "390x844", "414x896", "640x360", "844x390", "896x414"];
const requested = (process.env.FRONTIER_MOBILE_VIEWPORTS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
const viewports = (requested.length ? requested : defaultViewports).map(value => {
    const match = /^(\d{3,4})x(\d{3,4})$/.exec(value);
    if (!match) throw new Error("Invalid FRONTIER_MOBILE_VIEWPORTS entry: " + value);
    return { width: Number(match[1]), height: Number(match[2]) };
});
const outputDir = resolve(process.env.FRONTIER_MOBILE_OUT || "artifacts/biome-frontiers-mobile");
const seed = 20261228;
const remoteBase = (process.env.FRONTIER_MOBILE_BASE_URL || "").trim().replace(/\/$/, "");
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
const report = { seed, baseUrl, ok: false, viewports: [] };

async function runViewport(viewport, index) {
    const artifactBase = `frontier-mobile-${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    const badResponses = [];
    const screenshots = [];
    const checks = {};
    page.on("pageerror", error => errors.push("pageerror: " + error.message));
    page.on("console", message => { if (message.type() === "error") errors.push("console: " + message.text()); });
    page.on("response", response => { if (response.status() >= 400) badResponses.push(response.status() + " " + response.url()); });

    const capture = async name => {
        await page.waitForTimeout(160);
        const path = resolve(outputDir, `${artifactBase}-${name}.png`);
        await page.screenshot({ path, fullPage: false });
        screenshots.push(path);
    };
    const selectBiome = async () => {
        const select = page.locator("#command-tab-select");
        if (await select.isVisible()) await select.selectOption("biome");
        else await page.locator('[data-command-tab="biome"]').tap();
    };
    const openBiome = async () => {
        if (!(await page.locator("#command-modal").isVisible())) {
            await page.locator("#command-open-btn").tap();
            await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
        }
        await selectBiome();
        await page.locator("#command-panel-content [data-biome-frontier]").waitFor({ state: "visible", timeout: 60000 });
        await page.waitForFunction(() => document.querySelectorAll("[data-frontier-site]").length === 15, null, { timeout: 60000 });
    };
    const closeModal = async () => {
        await page.locator("#command-close").tap();
        await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 10000 });
    };
    const advanceYear = async () => {
        await closeModal();
        await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            state.year = Math.max(2, Number(state.year) + 1);
        });
        await openBiome();
    };
    const card = family => page.locator(`[data-frontier-family="${family}"]`);
    const openCard = async family => {
        const target = card(family);
        if (!(await target.evaluate(element => element.open))) {
            await target.locator("summary").tap();
            await page.waitForFunction(id => document.querySelector(`[data-frontier-family="${id}"]`)?.open === true, family, { timeout: 10000 });
        }
        await target.scrollIntoViewIfNeeded();
        return card(family);
    };
    const closeCard = async family => {
        const target = card(family);
        if (await target.evaluate(element => element.open)) {
            await target.locator("summary").tap();
            await page.waitForFunction(id => document.querySelector(`[data-frontier-family="${id}"]`)?.open === false, family, { timeout: 10000 });
        }
    };
    const clickAction = async (family, action) => {
        const target = await openCard(family);
        const button = target.locator(`[data-frontier-action="${action}"]`);
        assert.equal(await button.count(), 1, `${family} must expose ${action}`);
        assert.equal(await button.isDisabled(), false, `${family} ${action} must be enabled for the review budget`);
        const box = await button.boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44, `${family} ${action} must be a 44px touch target`);
        await button.scrollIntoViewIfNeeded();
        const beforeScroll = await page.evaluate(() => document.querySelector("#command-panel-content")?.scrollTop || 0);
        await button.tap();
        await page.waitForTimeout(450);
        assert.equal(await card(family).evaluate(element => element.open), true, `${family} must stay open after ${action}`);
        const afterScroll = await page.evaluate(({ family: familyId, action: actionId }) => {
            const content = document.querySelector("#command-panel-content");
            const result = document.querySelector(`[data-frontier-family="${familyId}"] .biome-frontier__actions`);
            const contentRect = content.getBoundingClientRect();
            const resultRect = result.getBoundingClientRect();
            return {
                scrollTop: content.scrollTop,
                visible: resultRect.top < contentRect.bottom && resultRect.bottom > contentRect.top,
            };
        }, { family, action });
        assert.ok(Math.abs(afterScroll.scrollTop - beforeScroll) <= 80, `${family} ${action} must keep the scroll position`);
        assert.equal(afterScroll.visible, true, `${family} ${action} result must stay in the visible scrollport`);
        return card(family);
    };
    const readCard = async family => card(family).evaluate(element => ({
        open: element.open,
        phase: element.dataset.frontierPhase,
        condition: Number(element.dataset.frontierCondition),
        extent: Number(element.dataset.frontierExtent),
        magic: Number(element.dataset.frontierMagic),
        corruption: Number(element.dataset.frontierCorruption),
        surveyed: element.dataset.frontierSurveyed,
        deep: element.dataset.frontierDeepSurveyed,
        protected: element.dataset.frontierProtected || "",
        goods: Number(element.dataset.frontierGoods),
        journal: Number(element.dataset.frontierJournalCount),
        journalEntries: element.querySelectorAll("[data-frontier-journal]").length,
        species: element.querySelectorAll("[data-frontier-species]").length,
        livingSpecies: element.querySelectorAll('[data-frontier-species-status="living"]').length,
        specialists: element.querySelectorAll('[data-frontier-specialist-status="living"]').length,
        history: element.querySelector(".biome-frontier__history")?.textContent?.replace(/\s+/g, " ").trim() || "",
        lastDecision: element.querySelector(".biome-frontier__last")?.textContent?.replace(/\s+/g, " ").trim() || "",
        actions: [...element.querySelectorAll("[data-frontier-action]")].map(button => ({
            action: button.dataset.frontierAction, disabled: button.disabled, title: button.title,
        })),
    }));
    const auditLayout = async (label, includeGuide = false) => page.evaluate(({ label: auditLabel, includeGuide: withGuide }) => {
        const root = document.querySelector("[data-biome-frontier]");
        const content = document.querySelector("#command-panel-content");
        if (!root || !content) return { label: auditLabel, missing: true };
        const contentRect = content.getBoundingClientRect();
        const isVisible = element => {
            const inSummary = Boolean(element.closest("summary"));
            if (element.closest("details:not([open])") && !inSummary) return false;
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };
        const outside = [];
        const selectors = [
            ".biome-frontier__summary", ".biome-frontier__climate", ".biome-frontier__card",
            ".biome-frontier__body", ".biome-frontier__meters", ".biome-frontier__hazards",
            ".biome-frontier__species", ".biome-frontier__specialist", ".biome-frontier__good",
            ".biome-frontier__journal-entry", ".biome-frontier__actions", ".biome-frontier__history", ".biome-frontier__guide article",
        ];
        for (const element of root.querySelectorAll(selectors.join(","))) {
            if (!isVisible(element)) continue;
            const rect = element.getBoundingClientRect();
            if (rect.left < contentRect.left - 1 || rect.right > contentRect.right + 1) {
                outside.push({ className: String(element.className), left: Math.round(rect.left), right: Math.round(rect.right) });
            }
        }
        const buttons = [...root.querySelectorAll("button, [data-frontier-site] > summary, [data-frontier-guide] > summary"),
            document.querySelector("#command-close"), document.querySelector("#command-tab-select")]
            .filter(Boolean).filter(isVisible);
        const smallTargets = buttons.map(button => {
            const rect = button.getBoundingClientRect();
            return { label: button.id || button.dataset.frontierAction || button.parentElement?.dataset?.frontierFamily || button.textContent.trim().slice(0, 22), width: Math.round(rect.width), height: Math.round(rect.height) };
        }).filter(target => target.width < 44 || target.height < 44);
        const overlaps = [];
        const actionButtons = [...root.querySelectorAll(".biome-frontier__actions button, .biome-frontier__good button")].filter(isVisible);
        for (let first = 0; first < actionButtons.length; first += 1) {
            const a = actionButtons[first].getBoundingClientRect();
            for (let second = first + 1; second < actionButtons.length; second += 1) {
                const b = actionButtons[second].getBoundingClientRect();
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
                    overlaps.push({ first: actionButtons[first].dataset.frontierAction, second: actionButtons[second].dataset.frontierAction });
                }
            }
        }
        const fontChecks = [];
        if (withGuide) {
            for (const entry of root.querySelectorAll("[data-frontier-point]")) {
                const detail = entry.querySelector("p");
                const consumer = entry.querySelector("em");
                if (!detail || !consumer) continue;
                const detailSize = parseFloat(getComputedStyle(detail).fontSize);
                const consumerSize = parseFloat(getComputedStyle(consumer).fontSize);
                if (detailSize < 10 || consumerSize < 8.5) {
                    fontChecks.push({ id: entry.dataset.frontierPoint, detailSize, consumerSize });
                }
            }
        }
        const clipped = [];
        for (const element of root.querySelectorAll(".biome-frontier__title b, .biome-frontier__title small, .biome-frontier__species b, .biome-frontier__specialist b, .biome-frontier__journal-entry b, .biome-frontier__journal-entry small, .biome-frontier__good b, .biome-frontier__guide article p, .biome-frontier__guide article em")) {
            if (!isVisible(element)) continue;
            if (element.scrollWidth > element.clientWidth + 1) {
                clipped.push({ className: String(element.className), text: element.textContent.trim().slice(0, 40) });
            }
        }
        return {
            label: auditLabel,
            viewport: [window.innerWidth, window.innerHeight],
            documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            contentOverflow: Math.max(0, content.scrollWidth - content.clientWidth),
            rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
            guideOpen: Boolean(root.querySelector('[data-frontier-guide="15"]')?.open),
            outside: outside.slice(0, 12), smallTargets: smallTargets.slice(0, 16),
            buttonOverlaps: overlaps.slice(0, 12), fontChecks: fontChecks.slice(0, 15), clipped: clipped.slice(0, 12),
        };
    }, { label, includeGuide });
    const assertLayout = async (label, includeGuide = false) => {
        const audit = await auditLayout(label, includeGuide);
        assert.equal(audit.documentOverflow, 0, label + ": page overflow");
        assert.equal(audit.contentOverflow, 0, label + ": command content overflow");
        assert.equal(audit.rootOverflow, 0, label + ": frontier register overflow");
        assert.deepEqual(audit.outside, [], label + ": frontier block outside the content");
        assert.deepEqual(audit.smallTargets, [], label + ": touch target below 44px");
        assert.deepEqual(audit.buttonOverlaps, [], label + ": overlapping buttons");
        assert.deepEqual(audit.clipped, [], label + ": clipped text");
        if (includeGuide) assert.deepEqual(audit.fontChecks, [], label + ": unreadable guide text");
        checks[label] = audit;
        return audit;
    };

    try {
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(900);
        await page.locator("#world-seed-input").fill(String(seed));
        await page.locator("#player-name-input").fill("Mobile Warden");
        await page.locator("#start-new-game-btn").tap();
        await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
        await page.waitForTimeout(700);

        await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            state.isPaused = true;
            Object.assign(state.resources, {
                gold: Math.max(1600, Number(state.resources.gold) || 0),
                wood: Math.max(1600, Number(state.resources.wood) || 0),
                stone: Math.max(1600, Number(state.resources.stone) || 0),
                food: Math.max(1600, Number(state.resources.food) || 0),
            });
            const ice = state.biomeFrontiers.sites.find(site => site.family === "ice-desert");
            ice.condition = 0;
            ice.extent = 4;
            ice.phase = "vanished";
            ice.vanishedYear = state.year;
            ice.lastActionYear = 0;
            ice.protected = false;
            ice.surveyed = false;
            ice.deepSurveyed = false;
            ice.history = [];
            ice.species.forEach(row => { row.status = "vanished"; row.cover = 0; });
            ice.specialists.forEach(row => { row.status = "vanished"; });
        });

        await openBiome();
        await page.waitForFunction(() => document.querySelectorAll("[data-frontier-point]").length === 15, null, { timeout: 60000 });
        const initial = await page.evaluate(() => ({
            cards: document.querySelectorAll("[data-frontier-site]").length,
            journal: document.querySelectorAll("[data-frontier-journal]").length,
            points: document.querySelectorAll("[data-frontier-point]").length,
            requirements: [...document.querySelectorAll("[data-frontier-point]")].map(entry => entry.dataset.frontierPoint),
        }));
        assert.equal(initial.cards, 15);
        assert.equal(initial.journal, 90, "all fifteen field journals must mount six notes");
        assert.equal(initial.points, 15);
        assert.deepEqual(initial.requirements, Array.from({ length: 15 }, (_, offset) => "1.2.23." + (offset + 2)));
        checks.initial = initial;
        await page.locator("[data-biome-frontier] > .command-section-title").scrollIntoViewIfNeeded();
        await capture("initial");
        await assertLayout("initial");

        const guide = page.locator('[data-frontier-guide="15"]');
        if (!(await guide.evaluate(element => element.open))) await guide.locator("summary").tap();
        await page.waitForFunction(() => document.querySelector('[data-frontier-guide="15"]')?.open === true);
        const points = Array.from({ length: 15 }, (_, offset) => "1.2.23." + (offset + 2));
        const pointReads = [];
        for (const [offset, id] of points.entries()) {
            const entry = page.locator(`[data-frontier-point="${id}"]`);
            await entry.scrollIntoViewIfNeeded();
            const read = await entry.evaluate(element => {
                const content = document.querySelector("#command-panel-content").getBoundingClientRect();
                const rect = element.getBoundingClientRect();
                const title = element.querySelector("strong")?.textContent?.trim() || "";
                const detail = element.querySelector("p")?.textContent?.trim() || "";
                const consumer = element.querySelector("em")?.textContent?.trim() || "";
                return {
                    id: element.dataset.frontierPoint, title, detailLength: detail.length, consumer,
                    left: Math.round(rect.left), right: Math.round(rect.right),
                    contentLeft: Math.round(content.left), contentRight: Math.round(content.right),
                    overflow: Math.max(0, element.scrollWidth - element.clientWidth),
                };
            });
            assert.ok(read.title.length > 3, id + " must have a readable title");
            assert.ok(read.detailLength > 40, id + " must have a readable detail paragraph");
            assert.match(read.consumer, /^LIVE:/, id + " must name its live consumer");
            assert.ok(read.left >= read.contentLeft - 1 && read.right <= read.contentRight + 1, id + " must stay inside the content");
            assert.equal(read.overflow, 0, id + " must not clip its text");
            pointReads.push(read);
            if (offset === 0) await capture("guide-first");
            if (offset === 14) await capture("guide-last");
        }
        checks.guide = { points: pointReads.length, reads: pointReads };
        await assertLayout("guide", true);
        await guide.locator("summary").tap();
        await page.waitForFunction(() => document.querySelector('[data-frontier-guide="15"]')?.open === false);

        const goldStart = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
        const beforeSurvey = await readCard("savanna-dry-woodland");
        await clickAction("savanna-dry-woodland", "survey");
        const afterSurvey = await readCard("savanna-dry-woodland");
        assert.equal(afterSurvey.surveyed, "1");
        assert.ok(afterSurvey.journal >= 1, "the survey must unlock its first field note");
        assert.equal(afterSurvey.journalEntries, 6, "the field journal must mount all six notes");
        assert.ok(afterSurvey.history.includes("survey"), "the survey result must be readable");
        assert.match(afterSurvey.lastDecision, /LAST DECISION · YEAR 1 · SURVEY Redpass Thornsea surveyed/);
        assert.equal(afterSurvey.actions.every(action => action.disabled), true, "a site must allow one action per year");
        const goldAfterSurvey = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
        assert.equal(goldAfterSurvey, goldStart - 8 + 18, "the survey fee and its field-note grant must both settle");
        checks.survey = { before: beforeSurvey, after: afterSurvey, gold: [goldStart, goldAfterSurvey] };
        await capture("survey-result");
        await assertLayout("survey");
        await closeCard("savanna-dry-woodland");

        await clickAction("mangrove", "conserve");
        const conserved = await readCard("mangrove");
        assert.equal(conserved.protected, "1");
        assert.ok(conserved.history.includes("warden's agreement"));
        checks.conserve = conserved;
        await closeCard("mangrove");

        const restoreBefore = await readCard("alpine-grassland");
        await clickAction("alpine-grassland", "restore");
        const restored = await readCard("alpine-grassland");
        assert.ok(restored.condition >= restoreBefore.condition + 8, "restoration must raise condition");
        assert.ok(restored.history.includes("Restoration work"));
        checks.restore = { before: restoreBefore, after: restored };
        await closeCard("alpine-grassland");

        const magicBefore = await readCard("magic-primeval");
        await clickAction("magic-primeval", "stabilise");
        const stabilised = await readCard("magic-primeval");
        assert.ok(stabilised.magic < magicBefore.magic, "stabilisation must lower wild magic");
        assert.ok(stabilised.history.includes("Stabilisation"));
        checks.stabilise = { before: magicBefore, after: stabilised };
        await closeCard("magic-primeval");

        const vanishedBefore = await readCard("ice-desert");
        assert.equal(vanishedBefore.phase, "vanished");
        await clickAction("ice-desert", "revive");
        const revived = await readCard("ice-desert");
        assert.notEqual(revived.phase, "vanished");
        assert.equal(revived.livingSpecies, 3, "revival must restore three founder cohorts");
        assert.ok(revived.history.includes("revived"));
        checks.revive = { before: vanishedBefore, after: revived };
        await capture("revive-result");
        await assertLayout("revive");
        await closeCard("ice-desert");

        await advanceYear();
        const harvestBefore = await readCard("savanna-dry-woodland");
        await clickAction("savanna-dry-woodland", "harvest");
        const harvested = await readCard("savanna-dry-woodland");
        assert.ok(harvested.goods > 0, "harvest must store a rare good");
        assert.ok(harvested.condition < harvestBefore.condition, "harvest must cost condition");
        assert.ok(harvested.history.includes("taken from"));
        assert.match(harvested.lastDecision, /LAST DECISION · YEAR 2 · HARVEST/);
        checks.harvest = { before: harvestBefore, after: harvested };
        const sell = card("savanna-dry-woodland").locator("[data-command='frontier-sell']");
        assert.equal(await sell.count(), 1, "a stored frontier good must expose its sale");
        const sellBox = await sell.boundingBox();
        assert.ok(sellBox && sellBox.width >= 44 && sellBox.height >= 44, "the sale must be a 44px touch target");
        const goldBeforeSale = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
        await sell.scrollIntoViewIfNeeded();
        await sell.tap();
        await page.waitForTimeout(450);
        const sold = await readCard("savanna-dry-woodland");
        assert.equal(sold.goods, 0, "sale must empty the stored good");
        const goldAfterSale = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
        assert.ok(goldAfterSale > goldBeforeSale, "sale must pay gold");
        assert.ok(sold.history.includes("sold for"));
        checks.sale = { before: goldBeforeSale, after: goldAfterSale, card: sold };
        await capture("harvest-sale-result");
        await assertLayout("harvest-sale");
        await closeCard("savanna-dry-woodland");

        await advanceYear();
        const beforeDeep = await readCard("savanna-dry-woodland");
        await clickAction("savanna-dry-woodland", "deepSurvey");
        const afterDeep = await readCard("savanna-dry-woodland");
        assert.equal(afterDeep.deep, "1");
        assert.equal(afterDeep.specialists, 6, "deep survey must read the living rare community");
        assert.ok(afterDeep.history.includes("deep survey"));
        checks.deepSurvey = { before: beforeDeep, after: afterDeep };
        await capture("deep-survey-result");
        await closeCard("savanna-dry-woodland");

        await capture("final");
        await assertLayout("final");
        assert.deepEqual(errors, [], "no console or page errors");
        assert.deepEqual(badResponses, [], "no missing assets");

        const summary = {
            viewport, baseUrl, screenshots, checks,
            pointsRead: pointReads.length,
            actions: ["survey", "conserve", "restore", "stabilise", "revive", "harvest", "sale", "deepSurvey"],
            errors, badResponses,
        };
        console.log("MOBILE FRONTIER PASS", JSON.stringify({
            viewport: `${viewport.width}x${viewport.height}`,
            guide: pointReads.length,
            survey: afterSurvey.surveyed,
            journal: afterSurvey.journal,
            conserved: conserved.protected,
            restored: [restoreBefore.condition, restored.condition],
            magic: [magicBefore.magic, stabilised.magic],
            revived: revived.phase,
            harvested: harvested.goods,
            sold: sold.goods,
            deep: afterDeep.deep,
            screenshotCount: screenshots.length,
            errors: errors.length, badResponses: badResponses.length,
        }));
        return summary;
    } catch (error) {
        const failed = { viewport, ok: false, error: String(error?.stack || error), checks, screenshots, errors, badResponses };
        report.viewports.push(failed);
        await writeFile(resolve(outputDir, `frontier-mobile-${viewport.width}x${viewport.height}.json`), JSON.stringify(failed, null, 2));
        throw error;
    } finally {
        await context.close().catch(() => {});
    }
    return null;
}

let failed = false;
for (const [index, viewport] of viewports.entries()) {
    console.log("MOBILE VIEWPORT", viewport.width + "x" + viewport.height);
    try {
        const result = await runViewport(viewport, index);
        report.viewports.push(result);
    } catch (error) {
        failed = true;
        console.error("MOBILE VIEWPORT FAIL", viewport.width + "x" + viewport.height, error);
        break;
    }
}
report.ok = !failed;
await writeFile(resolve(outputDir, "frontier-mobile-report.json"), JSON.stringify(report, null, 2));
await browser.close().catch(() => {});
if (server) await new Promise(done => server.close(done));
if (failed) process.exitCode = 1;
