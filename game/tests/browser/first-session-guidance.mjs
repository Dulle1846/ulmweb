// Fresh-start browser proof for the first-session direction.
//
// A first-time player founds a realm through the visible start screen. The
// NEXT MOVE and the FIRST SESSION checklist must name the same step, state the
// measured reason, and open the exact construction category. The proof then
// follows that guidance: lay the recommended road, draw a card, and reload the
// saved realm. The restored screen must show the same guidance and state.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4191;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : null;
const label = process.env.E2E_LABEL || "local";
const artifact = name => label === "local" ? "artifacts/" + name : "artifacts/" + name.replace(/\.png$/, "-" + label + ".png");
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

async function gotoWithRetry(url) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            return;
        } catch (error) {
            if (attempt === 3) throw error;
            console.error("load attempt " + attempt + " failed: " + error.message.split("\n")[0]);
            await page.waitForTimeout(4000);
        }
    }
}

async function snapshot() {
    return page.evaluate(() => {
        const text = selector => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
        const visible = selector => Boolean(document.querySelector(selector)?.offsetParent);
        const action = document.querySelector("#ambition-counsel-action");
        const steps = [...document.querySelectorAll("#first-session-list .first-session-step")].map(step => ({
            label: step.querySelector(".first-session-label")?.textContent?.trim() || "",
            status: step.querySelector(".first-session-status")?.textContent?.trim() || "",
            current: step.getAttribute("aria-current") === "step",
            detail: step.querySelector(".first-session-detail")?.textContent?.trim() || ""
        }));
        return {
            counsel: text("#ambition-counsel-text"),
            evidence: text("#ambition-counsel-evidence"),
            action: text("#ambition-counsel-action"),
            actionVisible: visible("#ambition-counsel-action"),
            panel: action?.dataset?.kacPanel || null,
            buildCategory: action?.dataset?.kacBuildCategory || null,
            buildType: action?.dataset?.kacBuildType || null,
            count: text("#first-session-count"),
            need: text("#first-session-need"),
            needVisible: visible("#first-session-need"),
            completeVisible: visible("#first-session-complete"),
            steps
        };
    });
}

function assertGuidance(state, labelText) {
    assert.ok(state.counsel.length > 0, labelText + ": NEXT MOVE must explain the need");
    assert.ok(state.evidence.length > 0, labelText + ": NEXT MOVE must show measured evidence");
    assert.ok(state.actionVisible, labelText + ": NEXT MOVE action must be visible");
    const visibleText = [state.counsel, state.evidence, state.action, state.count, state.need,
        ...state.steps.flatMap(step => [step.label, step.status, step.detail])].join(" ");
    assert.doesNotMatch(visibleText, /\b(undefined|null|NaN)\b/, labelText + ": guidance must not expose placeholders");
    const current = state.steps.filter(step => step.current);
    assert.equal(current.length, 1, labelText + ": exactly one first-session step must be NEXT");
    assert.equal(current[0].status, "NEXT");
    assert.ok(current[0].detail.length > 0, labelText + ": the NEXT step must explain why it is next");
    assert.equal(state.completeVisible, false, labelText + ": the checklist must still be open");
}

async function flushUi() {
    await page.evaluate(async () => {
        const { renderUI } = await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
    await page.waitForTimeout(600);
}

async function findRoadTile() {
    return page.evaluate(async () => {
        const [{ state }, { isWaterAt }, { getRoadAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/world/world.js"),
            import("./js/systems/roads.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        for (let radius = 2; radius < 30; radius++) {
            for (let x = 80 - radius; x <= 80 + radius; x++) {
                for (let y = 80 - radius; y <= 80 + radius; y++) {
                    if (x < 0 || y < 0 || x >= (state.worldW || 160) || y >= (state.worldH || 160)) continue;
                    if (!state.explored?.[x]?.[y] || isWaterAt(x + .5, y + .5) || getRoadAt(x, y)) continue;
                    const occupied = state.entities.some(entity => {
                        if (entity.dead || !entity.isBuilding?.()) return false;
                        const size = entity.type === 1 ? { w: 4, h: 4 } : { w: 1, h: 1 };
                        return Math.abs(x + .5 - (entity.x + .5)) < size.w / 2 && Math.abs(y + .5 - (entity.y + .5)) < size.h / 2;
                    });
                    if (occupied) continue;
                    const screenX = (x + .5) * 48 * state.zoom - state.camera.x + rect.left;
                    const screenY = (y + .5) * 48 * state.zoom - state.camera.y + rect.top;
                    if (screenX < rect.left + 8 || screenX > rect.right - 8 || screenY < rect.top + 8 || screenY > rect.bottom - 8) continue;
                    return { x, y, screenX, screenY };
                }
            }
        }
        throw new Error("No visible legal road tile");
    });
}

try {
    await gotoWithRetry(baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/");
    let version = null;
    if (baseUrl) {
        const response = await page.request.get(baseUrl + "/version.json?cb=" + Date.now());
        if (response.ok()) version = await response.json();
    }
    await page.locator("#world-seed-input").fill("20261122");
    await page.locator("#player-name-input").fill("First Session Guide");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (state.activeEvent) { state.activeEvent.dismissed = true; }
    });

    const fresh = await snapshot();
    assertGuidance(fresh, "fresh start");
    assert.equal(fresh.count, "1 / 5");
    assert.equal(fresh.action, "LAY ROAD");
    assert.equal(fresh.panel, "build");
    assert.equal(fresh.buildCategory, "roads");
    assert.equal(fresh.buildType, "dirt");
    assert.match(fresh.evidence, /Road tiles 0/);
    assert.equal(fresh.needVisible, false);
    const currentFresh = fresh.steps.find(step => step.current);
    assert.equal(currentFresh.label, "Lay your first road", "the checklist must follow the live road counsel");
    assert.equal(fresh.steps.find(step => step.label === "Build your first house").status, "OPEN", "the later house milestone must not compete");
    assert.equal(currentFresh.detail, fresh.evidence, "both panels must show the same measured reason");
    await page.screenshot({ path: artifact("first-session-guidance.png"), fullPage: false });

    await page.locator("#ambition-counsel-action").click();
    await page.waitForFunction(() => !document.querySelector("#build-modal")?.classList.contains("hidden"), null, { timeout: 5000 });
    const opened = await page.evaluate(() => ({
        category: document.querySelector("[data-build-category].is-active")?.dataset.buildCategory || null,
        recommended: document.querySelector("#build-options .build-option.is-recommended")?.textContent?.replace(/\s+/g, " ").trim() || "",
        badge: document.querySelector("#build-options .build-option-recommend")?.textContent?.trim() || ""
    }));
    assert.equal(opened.category, "roads", "LAY ROAD must open the road category, not the default first tab");
    assert.match(opened.recommended, /Dirt path/);
    assert.equal(opened.badge, "NEXT MOVE");
    await page.screenshot({ path: artifact("first-session-build-target.png"), fullPage: false });

    await page.locator('[data-road-type="dirt"]').click();
    // Road placement is a real player action and the input layer rejects map
    // clicks while paused. Resume only for the click, then pause again for a
    // stable DOM and save comparison.
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = false; });
    const road = await findRoadTile();
    await page.mouse.click(road.screenX, road.screenY);
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return (Number(state.statistics?.totalRoadTilesBuilt) || 0) > 0;
    }, null, { timeout: 5000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await flushUi();
    await page.waitForFunction(() => (document.querySelector("#first-session-count")?.textContent || "").trim() === "2 / 5", null, { timeout: 5000 });
    await page.keyboard.press("Escape");

    const afterRoad = await snapshot();
    assertGuidance(afterRoad, "after road");
    assert.equal(afterRoad.count, "2 / 5");
    assert.equal(afterRoad.steps.find(step => step.label === "Lay your first road").status, "DONE");
    assert.equal(afterRoad.action, "OPEN CARDS");
    assert.equal(afterRoad.panel, "cards");
    assert.match(afterRoad.evidence, /Hand 0 cards/);
    assert.equal(afterRoad.steps.find(step => step.current)?.label, "Draw your first card", "NEXT must move with the road completion");
    await page.screenshot({ path: artifact("first-session-after-road.png"), fullPage: false });

    await page.locator("#ambition-counsel-action").click();
    await page.waitForFunction(() => !document.querySelector("#command-modal")?.classList.contains("hidden"), null, { timeout: 5000 });
    assert.match(await page.locator("#command-panel-content").innerText(), /royal deck/i);
    await page.locator('[data-command="draw-card"]').click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hand.length === 1, null, { timeout: 5000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.locator("#command-close").click();
    await flushUi();
    await page.waitForFunction(() => (document.querySelector("#first-session-count")?.textContent || "").trim() === "3 / 5", null, { timeout: 5000 });

    const afterCard = await snapshot();
    assertGuidance(afterCard, "after card");
    assert.equal(afterCard.count, "3 / 5");
    assert.equal(afterCard.action, "OPEN CARDS");
    assert.equal(afterCard.panel, "cards");
    assert.match(afterCard.counsel, /select it before you place it/i);
    assert.match(afterCard.evidence, /Hand 1 card/);
    assert.equal(afterCard.steps.find(step => step.current)?.label, "Complete your first ambition");

    const beforeSave = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            roads: Number(state.statistics?.totalRoadTilesBuilt) || 0,
            cards: Number(state.statistics?.totalCardsDrawn) || 0,
            hand: state.hand.length,
            year: state.year
        };
    });
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Loaded realm"), null, { timeout: 20000 });
    await page.waitForTimeout(700);

    const restored = await snapshot();
    const afterReload = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (!state.isPaused) state.isPaused = true;
        return {
            roads: Number(state.statistics?.totalRoadTilesBuilt) || 0,
            cards: Number(state.statistics?.totalCardsDrawn) || 0,
            hand: state.hand.length,
            year: state.year
        };
    });
    assertGuidance(restored, "after reload");
    assert.equal(restored.counsel, afterCard.counsel, "reload must restore the same NEXT MOVE text");
    assert.equal(restored.evidence, afterCard.evidence, "reload must restore the same measured evidence");
    assert.equal(restored.action, afterCard.action);
    assert.equal(restored.panel, afterCard.panel);
    assert.equal(restored.count, afterCard.count);
    assert.equal(restored.steps.find(step => step.current)?.label, "Complete your first ambition");
    assert.deepEqual(afterReload, beforeSave, "reload must restore the same road, card and hand state");
    await page.screenshot({ path: artifact("first-session-restored.png"), fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        target: baseUrl || "local",
        version,
        fresh: { counsel: fresh.counsel, evidence: fresh.evidence, action: fresh.action, current: currentFresh.label, detail: currentFresh.detail },
        opened,
        afterRoad: { count: afterRoad.count, action: afterRoad.action, evidence: afterRoad.evidence, current: afterRoad.steps.find(step => step.current)?.label },
        afterCard: { count: afterCard.count, action: afterCard.action, evidence: afterCard.evidence, current: afterCard.steps.find(step => step.current)?.label },
        saved: beforeSave,
        restored: { counsel: restored.counsel, evidence: restored.evidence, current: restored.steps.find(step => step.current)?.label, state: afterReload },
        pageErrors,
        consoleErrors
    }));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
