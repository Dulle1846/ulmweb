// Real-browser proof that a newly founded realm is immediately resumable.
//
// The player enters a name and seed, starts a realm and never touches Save.
// A reload must offer Continue, restore the same seed, name, year, hand and
// first-session checklist, and keep the same deterministic opening state.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4199;
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

async function gotoWithRetry(url) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            return;
        } catch (error) {
            if (attempt === 3) throw error;
            await page.waitForTimeout(4000);
        }
    }
}

async function realmState() {
    return page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            seed: state.worldSeed,
            playerName: state.playerName,
            year: state.year,
            hand: state.hand.length,
            roads: Number(state.statistics?.totalRoadTilesBuilt) || 0,
            cardsDrawn: Number(state.statistics?.totalCardsDrawn) || 0,
            eventLogLength: state.eventLog.length,
            hasStarted: state.hasStarted
        };
    });
}

try {
    await gotoWithRetry(baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/");
    await page.locator("#world-seed-input").fill("20261125");
    await page.locator("#player-name-input").fill("Founding Save Proof");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });

    const foundingStatus = (await page.locator("#save-status").textContent() || "").trim();
    assert.match(foundingStatus, /^FOUNDING REALM SAVED/, "the founding must write a save without a Save click");
    const found = await realmState();
    assert.equal(found.seed, 20261125);
    assert.equal(found.playerName, "Founding Save Proof");
    assert.equal(found.hasStarted, true);
    const stored = await page.evaluate(() => {
        const id = localStorage.getItem("kings-and-cards:active-profile:v1");
        const raw = localStorage.getItem("kings-and-cards:save:v2:" + id);
        if (!raw) return null;
        const envelope = JSON.parse(raw);
        return { profileId: envelope.profileId, version: envelope.version, hasSnapshot: Boolean(envelope.snapshot?.worldSeed) };
    });
    assert.ok(stored, "the local save slot must exist immediately after founding");
    assert.equal(stored.profileId, await page.evaluate(() => localStorage.getItem("kings-and-cards:active-profile:v1")));
    assert.equal(stored.version, 2, "the founding save must use the existing save version");
    assert.equal(stored.hasSnapshot, true, "the snapshot must contain the founded realm");
    await page.screenshot({ path: artifact("founding-autosave.png"), fullPage: false });

    // No Save click: reload straight into the start screen and resume.
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Loaded realm"), null, { timeout: 30000 });
    await page.waitForTimeout(700);

    const restored = await realmState();
    assert.deepEqual(restored, found, "Continue without an explicit Save must restore the founded realm exactly");
    const loadedStatus = (await page.locator("#save-status").textContent() || "").trim();
    assert.match(loadedStatus, /^LOADED/, "the HUD must report the loaded save, not a fresh founding");
    assert.equal(await page.locator("#first-session-count").textContent().then(t => t.trim()), "1 / 5");
    assert.match(await page.locator("#ambition-counsel-text").textContent(), /Road|road/);
    await page.screenshot({ path: artifact("founding-autosave-restored.png"), fullPage: false });

    assert.deepEqual(pageErrors, [], "the founding/reload flow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the founding/reload flow must not raise console errors");
    console.log(JSON.stringify({ ok: true, foundingStatus, found, stored, loadedStatus, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
