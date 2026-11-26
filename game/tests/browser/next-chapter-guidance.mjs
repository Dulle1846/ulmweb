// Real-browser proof that NEXT MOVE teaches the first card without playing it,
// and that a completed first session continues with a measured chapter: either
// the live authored scenario or the next real royal ambition. The realm is
// founded through the visible start screen; the fixtures only close unrelated
// early needs so the new guidance itself is what the player sees.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4196;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : null;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = baseUrl ? null : createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) {
            res.writeHead(403).end("Forbidden");
            return;
        }
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
if (server) await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

async function read() {
    return page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getCoreCounsel } = await import("./js/presentation/core-counsel.js");
        const text = selector => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
        const action = document.querySelector("#ambition-counsel-action");
        const counsel = getCoreCounsel(state);
        return {
            counselId: counsel.id,
            counsel: text("#ambition-counsel-text"),
            evidence: text("#ambition-counsel-evidence"),
            action: text("#ambition-counsel-action"),
            panel: action?.dataset?.kacPanel || null,
            completeText: text("#first-session-complete"),
            completeVisible: Boolean(document.querySelector("#first-session-complete")?.offsetParent),
            hand: state.hand.length,
            currentCard: state.currentCard?.name || null,
            selectedId: state.selectedCardInstanceId || null,
            cardsDrawn: Number(state.statistics?.totalCardsDrawn) || 0
        };
    });
}

async function flushUi() {
    await page.evaluate(async () => {
        const { renderUI } = await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
    await page.waitForTimeout(500);
}

async function openCards() {
    await page.locator("#ambition-counsel-action").click();
    await page.waitForFunction(() => !document.querySelector("#command-modal")?.classList.contains("hidden"), null, { timeout: 10000 });
    await page.waitForFunction(() => /royal deck/i.test(document.querySelector("#command-panel-content")?.textContent || ""), null, { timeout: 10000 });
}

try {
    await page.goto(baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261125");
    await page.locator("#player-name-input").fill("Next Chapter Guide");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.evaluate(async () => {
        const [{ state }, { TYPE, Entity }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js")
        ]);
        state.isPaused = true;
        if (state.activeEvent) state.activeEvent.dismissed = true;
        state.resources = { food: 300, wood: 300, stone: 200, gold: 200 };
        // Use a real Entity so the live minimap and renderer see the same
        // isEnemy/isBuilding contract as a founded realm.
        state.entities = [new Entity(0, 0, TYPE.HOUSE)];
        state.statistics.totalRoadTilesBuilt = 1;
        state.statistics.totalCardsDrawn = 0;
        state.hand = [];
        state.currentCard = null;
        state.selectedCardInstanceId = null;
        state.ambitions.completed = {};
    });
    await flushUi();
    await page.waitForFunction(() => document.querySelector("#ambition-counsel-text")?.textContent.includes("hand is empty"), null, { timeout: 10000 });

    await openCards();
    await page.locator('[data-command="draw-card"]').click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hand.length === 1, null, { timeout: 10000 });
    await page.locator("#command-close").click();
    await flushUi();
    await page.waitForFunction(() => document.querySelector("#ambition-counsel-text")?.textContent.includes("not armed"), null, { timeout: 10000 });
    const afterDraw = await read();
    assert.equal(afterDraw.counselId, "card-select");
    assert.equal(afterDraw.action, "OPEN CARDS");
    assert.equal(afterDraw.panel, "cards");
    assert.equal(afterDraw.hand, 1);
    assert.equal(afterDraw.currentCard, null, "drawing must never arm the card");
    assert.match(afterDraw.evidence, /Hand 1 card · no card selected/);
    await page.screenshot({ path: "artifacts/next-chapter-card-select.png", fullPage: false });

    await openCards();
    await page.locator('[data-command="select-card"]').first().click();
    await page.waitForFunction(async () => Boolean((await import("./js/core/state.js")).state.currentCard), null, { timeout: 10000 });
    await flushUi();
    await page.waitForFunction(() => document.querySelector("#ambition-counsel-text")?.textContent.includes("Drag it onto a valid map tile"), null, { timeout: 10000 });
    const afterSelect = await read();
    assert.equal(afterSelect.counselId, "card-play");
    assert.equal(afterSelect.action, "REVIEW CARDS");
    assert.match(afterSelect.text || afterSelect.counsel, /drag it onto a valid map tile/i);
    assert.match(afterSelect.counsel, /tap a tile on touch controls/i);
    assert.equal(afterSelect.hand, 1, "selecting must never play the card");
    assert.ok(afterSelect.selectedId, "the player's explicit selection must be visible");
    await page.screenshot({ path: "artifacts/next-chapter-card-play.png", fullPage: false });

    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.currentCard = null;
        state.selectedCardInstanceId = null;
        state.hand = [];
        state.statistics.totalHousesBuilt = 1;
        state.statistics.totalCardsDrawn = 1;
        state.ambitions.completed["full-larder"] = 1;
    });
    await flushUi();
    await page.waitForFunction(() => document.querySelector("#first-session-complete")?.textContent.includes("Next royal ambition"), null, { timeout: 10000 });
    const free = await read();
    assert.equal(free.counselId, "next-ambition");
    assert.equal(free.completeVisible, true);
    assert.match(free.completeText, /Next royal ambition:/);
    assert.match(free.completeText, /24 housing/);

    await page.evaluate(async () => {
        const [{ applyScenarioStart, SCENARIO_PRESETS }] = await Promise.all([
            import("./js/systems/scenario.js")
        ]);
        applyScenarioStart(SCENARIO_PRESETS["first-winter"]);
    });
    await flushUi();
    await page.waitForFunction(() => document.querySelector("#first-session-complete")?.textContent.includes("150 food by Spring, year 2"), null, { timeout: 10000 });
    const authored = await read();
    assert.equal(authored.counselId, "scenario");
    assert.match(authored.completeText, /150 food by Spring, year 2/i);
    assert.match(authored.completeText, /SPRING · YEAR 2/);
    assert.match(authored.completeText, /IN PROGRESS/);
    await page.screenshot({ path: "artifacts/next-chapter-scenario.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({ afterDraw, afterSelect, free, authored, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
