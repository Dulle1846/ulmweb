// Real-browser proof for the named-goods board in STORES.
//
// A player opens Management → STORES and sees every physical good, its realm
// stock and its audit status. Then a real audited consumption is recorded for
// grain without any grain in store; reopening STORES must name grain as a need
// instead of inventing a market trend. No page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4201;
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

async function openStores() {
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    await page.locator('[data-command-tab="resources"]').click();
    await page.locator("#command-panel-content .goods-detail-grid").waitFor({ state: "visible", timeout: 15000 });
}

async function board() {
    return page.evaluate(() => ({
        title: document.querySelector("#command-panel-content .command-section-title")?.textContent || "",
        goods: [...document.querySelectorAll("#command-panel-content .goods-detail-card")].map(card => ({
            good: card.dataset.good || "",
            label: card.querySelector("header strong")?.textContent || "",
            stock: card.querySelector("div b")?.textContent || ""
        })),
        needs: [...document.querySelectorAll("#command-panel-content .goods-shortage-row")].map(row => ({
            good: row.dataset.goodNeed || null,
            text: row.textContent.replace(/\s+/g, " ").trim()
        }))
    }));
}

try {
    await page.goto(baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Goods Board Proof");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    await openStores();
    const fresh = await board();
    assert.match(fresh.title, /PHYSICAL GOODS/, "STORES must expose the physical-goods ledger");
    assert.ok(fresh.goods.length >= 10, "the named goods must be listed, not only the four royal resources");
    assert.ok(fresh.goods.some(row => row.good === "grain"), "grain must have a real ledger line");
    assert.ok(fresh.goods.some(row => row.good === "planks"), "crafting inputs must have a real ledger line");
    assert.ok(fresh.needs.some(row => /NOTHING URGENT/.test(row.text)), "a fresh audited realm must not invent a shortage");
    await page.screenshot({ path: artifact("goods-board-fresh.png"), fullPage: false });
    await page.locator("#command-close").click();

    const injected = await page.evaluate(async () => {
        const [{ state }, { ensureCityState }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/logistics.js")
        ]);
        const logistics = ensureCityState().logistics;
        // Empty the physical grain held by buildings and carriers, then record a
        // real audited consumption. This is the honest shortage the board must
        // name; it does not invent a market forecast.
        for (const entity of state.entities) {
            if (entity.warehouse?.stored) entity.warehouse.stored.grain = 0;
            if (entity.inventory?.output) entity.inventory.output.grain = 0;
            if (entity.inventory?.input) entity.inventory.input.grain = 0;
        }
        for (const carrier of logistics.carriers) {
            if (carrier.cargo?.good === "grain") carrier.cargo.quantity = 0;
        }
        logistics.audit.consumed.grain = 5;
        return { consumed: logistics.audit.consumed.grain };
    });
    assert.equal(injected.consumed, 5);

    await openStores();
    const withNeed = await board();
    const grainNeed = withNeed.needs.find(row => row.good === "grain");
    assert.ok(grainNeed, "an empty store with real consumption must be named as a need");
    assert.match(grainNeed.text, /Store empty/);
    assert.match(grainNeed.text, /5 consumed/);
    assert.ok(withNeed.goods.find(row => row.good === "grain"), "the need must stay linked to the physical-goods ledger");
    await page.screenshot({ path: artifact("goods-board-need.png"), fullPage: false });

    assert.deepEqual(pageErrors, [], "the goods board must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the goods board must not raise console errors");
    console.log(JSON.stringify({ ok: true, goods: fresh.goods.length, freshNeeds: fresh.needs, injected, grainNeed, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
