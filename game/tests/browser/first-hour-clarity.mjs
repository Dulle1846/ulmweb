// Real-browser proof for the two first-hour clarity gaps.
//
// A player with four residents and one unfinished cottage must be told that the
// site is open, not that they should start a second house. The NEXT MOVE action
// opens Buildings. The latest 20-day ledger is then shown as a plain-language
// line in FIRST SESSION and stays factual after the checklist is done.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4200;
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
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
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

async function flushUi() {
    await page.evaluate(async () => {
        const { renderUI } = await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
    await page.waitForTimeout(700);
}

async function hud() {
    return page.evaluate(() => {
        const text = selector => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
        const action = document.querySelector("#ambition-counsel-action");
        const current = [...document.querySelectorAll("#first-session-list .first-session-step")]
            .find(step => step.getAttribute("aria-current") === "step");
        return {
            counsel: text("#ambition-counsel-text"),
            evidence: text("#ambition-counsel-evidence"),
            action: text("#ambition-counsel-action"),
            panel: action?.dataset?.kacPanel || "",
            current: current?.querySelector(".first-session-label")?.textContent?.trim() || "",
            detail: current?.querySelector(".first-session-detail")?.textContent?.trim() || "",
            ledger: text("#first-session-ledger"),
            ledgerVisible: Boolean(document.querySelector("#first-session-ledger")?.offsetParent)
        };
    });
}

try {
    await page.goto(baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261127");
    await page.locator("#player-name-input").fill("First Hour Clarity");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    const site = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { spawnEntity }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js")
        ]);
        state.activeEvent = null;
        state.resources = { wood: 180, stone: 95, gold: 75, food: 200 };
        // spawnEntity() already appends to state.entities; clear first and never
        // push the returned entities a second time.
        state.entities = [];
        for (let index = 0; index < 4; index += 1) {
            if (!spawnEntity(28 + index, 30, TYPE.VILLAGER)) throw new Error("the proof villagers could not be placed");
        }
        const house = spawnEntity(31, 30, TYPE.HOUSE);
        const openSite = spawnEntity(32, 30, TYPE.HOUSE);
        openSite.construction = {
            version: 1, stage: 0, progress: 0, paused: false,
            totalCost: { wood: 20, stone: 10 }, paid: { wood: 20, stone: 10 },
            delivered: { planks: 1 }, materialNeed: { planks: 4 },
            startedTick: 0, completedTick: null, reason: "WAITING FOR PLANKS"
        };
        return { villagers: 4, houseId: house.id, siteId: openSite.id };
    });
    assert.ok(site.houseId && site.siteId);
    await flushUi();

    const withSite = await hud();
    assert.match(withSite.counsel, /site is open but not operational/i, "NEXT MOVE must not count the site as beds");
    assert.match(withSite.counsel, /beds arrive when construction completes/i);
    assert.match(withSite.evidence, /Site opened · stage 0/);
    assert.match(withSite.evidence, /WAITING FOR PLANKS/);
    assert.match(withSite.evidence, /needs 3 planks/);
    assert.equal(withSite.panel, "buildings", "the player must be sent to the stalled site");
    assert.match(withSite.detail, /Site opened · stage 0/, "the checklist must quote the same measured reason");
    await page.screenshot({ path: artifact("first-hour-site.png"), fullPage: false });

    await page.locator("#ambition-counsel-action").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
        () => document.querySelector("#command-panel-content")?.textContent.includes("Building register"),
        null, { timeout: 15000 }
    );
    await page.locator("#command-close").click();

    const ledger = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.economy.lastLedger = {
            foodInflow: 120, foodConsumed: 90, foodSpoiled: 4,
            wagesPaid: 12, upkeepPaid: 6, netGold: -18
        };
        return true;
    });
    assert.equal(ledger, true);
    await flushUi();
    const withLedger = await hud();
    assert.equal(withLedger.ledgerVisible, true, "the plain-language ledger line must be visible");
    assert.match(withLedger.ledger, /LAST 20-DAY SETTLEMENT/);
    assert.match(withLedger.ledger, /120 food in · 90 eaten · 4 spoiled/);
    assert.match(withLedger.ledger, /-18 gold net after 12 wages and 6 upkeep/);
    await page.screenshot({ path: artifact("first-hour-ledger.png"), fullPage: false });

    assert.deepEqual(pageErrors, [], "the first-hour clarity flow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the first-hour clarity flow must not raise console errors");
    console.log(JSON.stringify({ ok: true, withSite, withLedger, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
