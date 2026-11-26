// Real-browser proof for the general goods market.
//
// Found a realm through the start screen, checked the live HUD and workshop,
// opened the real Trade tab, bought planks with the BUY button that moves goods
// into a warehouse, sold them back with the SELL button that withdraws the
// unreserved units, then saved and restored the realm. No page or console
// errors, and the goods book stays balanced through both physical trades.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4231;
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

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const url = baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/";
const good = "planks";

async function openPanel(id) {
    if (await page.locator("#command-modal").evaluate(element => element.classList.contains("hidden"))) {
        await page.locator("#command-open-btn").click();
        await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    }
    await page.locator('[data-command-tab="' + id + '"]').click();
    await page.waitForFunction(tab => {
        const button = document.querySelector('[data-command-tab="' + tab + '"]');
        const content = document.querySelector("#command-panel-content");
        return Boolean(button?.classList.contains("is-active") && content?.textContent.trim().length > 40);
    }, id, { timeout: 15000 });
    return page.evaluate(() => document.querySelector("#command-panel-content")?.textContent.replace(/\s+/g, " ").trim().slice(0, 120) || "");
}

async function marketState() {
    return page.evaluate(async good => {
        const [{ state }, logistics, market, { createSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/logistics.js"),
            import("./js/systems/market.js"), import("./js/core/save-runtime.js")
        ]);
        const store = state.entities.find(entity => entity.id === "__goods_market_store");
        const partner = state.market.partners.find(item => item.id === state.market.partners[0].id);
        const audit = logistics.getGoodsAudit();
        const totals = (await import("./js/systems/goods-book.js")).readAuditTotals(good, "good");
        const saved = createSaveSnapshot();
        return {
            gold: state.resources.gold,
            store: Number(store?.warehouse?.stored?.[good]) || 0,
            physical: logistics.getPhysicalStock(good),
            partnerStock: Number(partner?.stock?.[good]) || 0,
            price: state.market.prices[good],
            historyLength: state.market.priceHistory[good]?.length || 0,
            deposits: state.city.logistics.ledger.filter(entry => entry.good === good && entry.cause === "manual-deposit").length,
            withdrawals: state.city.logistics.ledger.filter(entry => entry.good === good && entry.cause === "manual-withdrawal").length,
            produced: totals.produced,
            consumed: totals.consumed,
            auditBalanced: audit.balanced,
            goodBalanced: audit.rows.find(row => row.good === good)?.balanced || false,
            savedPrice: saved.market?.prices?.[good],
            savedStock: saved.market?.partners?.[0]?.stock?.[good]
        };
    }, good);
}

try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261131");
    await page.locator("#player-name-input").fill("Goods Market Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    const hud = await page.evaluate(() => ({
        season: document.querySelector("#season")?.textContent.trim() || "",
        year: document.querySelector("#year")?.textContent.trim() || "",
        gold: document.querySelector("#res-gold")?.textContent.trim() || "",
        food: document.querySelector("#res-food")?.textContent.trim() || "",
        tick: document.querySelector("#tick-count")?.textContent.trim() || ""
    }));
    assert.ok(hud.year.includes("YEAR 1") && hud.gold && hud.food && hud.tick, "the live HUD must show a started realm");

    if (!(await page.locator("#workshop-panel").isVisible())) await page.locator("#workshop-open-btn").click();
    await page.locator("#workshop-panel").waitFor({ state: "visible", timeout: 15000 });
    const workshopTitle = await page.locator("#workshop-title").textContent();
    await page.locator("#workshop-close").click();
    await page.locator("#workshop-panel").waitFor({ state: "hidden", timeout: 15000 });
    assert.ok(workshopTitle && workshopTitle.trim().length > 0, "the workshop must open with a real title");

    const fixture = await page.evaluate(async good => {
        const [{ state }, { TYPE }, logistics, market, { setAuditOpening }, { createSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"), import("./js/systems/logistics.js"),
            import("./js/systems/market.js"), import("./js/systems/goods-book.js"), import("./js/core/save-runtime.js")
        ]);
        const store = { id: "__goods_market_store", type: TYPE.WAREHOUSE, x: 44, y: 44, dead: false,
            construction: { stage: 3, progress: 1 }, isBuilding: () => true, isEnemy: () => false };
        state.entities.push(store);
        logistics.ensureInventory(store);
        state.resources.gold = 500;
        const partner = state.market.partners[0];
        const quote = market.getGoodTradeQuote(partner.id, good, "buy", market.GOOD_MARKET_LOT);
        setAuditOpening(logistics.getPhysicalStockMap());
        return {
            partnerId: partner.id,
            partnerName: partner.name,
            quote,
            gold: state.resources.gold,
            physical: logistics.getPhysicalStock(good),
            store: Number(store.warehouse.stored[good]) || 0,
            partnerStock: Number(partner.stock[good]) || 0,
            savedMarketKeys: Object.keys(createSaveSnapshot().market?.prices || {}).length,
            auditBalanced: logistics.getGoodsAudit().balanced
        };
    }, good);
    assert.equal(fixture.quote.ok, true, "the first partner must quote a real plank purchase");
    assert.equal(fixture.store, 0);
    assert.equal(fixture.auditBalanced, true, "the fixture starts with a balanced goods book");
    assert.ok(fixture.savedMarketKeys >= 28, "the save carries general goods prices");

    const panels = [];
    for (const panel of ["kingdom", "buildings", "economy", "resources", "worldmap", "biome", "atelier"]) {
        panels.push({ panel, preview: await openPanel(panel) });
    }
    assert.equal(panels.length, 7);
    assert.equal(panels.every(entry => entry.preview.length > 40), true, "every management panel renders real content");
    await page.locator("#command-close").click();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 15000 });

    await page.locator("#tab-2").click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#tab-content")?.textContent || "";
        return text.includes("REGIONAL EXCHANGE") && text.includes("GENERAL GOODS · PHYSICAL STOCK");
    }, null, { timeout: 15000 });
    const firstCard = page.locator("#tab-content .trade-partner").first();
    const buyButton = firstCard.locator('[data-trade="buy"][data-good="' + good + '"]');
    const sellButton = firstCard.locator('[data-trade="sell"][data-good="' + good + '"]');
    await buyButton.waitFor({ state: "visible", timeout: 15000 });
    await sellButton.waitFor({ state: "visible", timeout: 15000 });
    assert.match(await buyButton.textContent(), /BUY 5 · \d+G/);
    assert.match(await sellButton.textContent(), /SELL [\d.]+/);
    await page.screenshot({ path: artifact("goods-market-ready.png"), fullPage: false });

    await buyButton.click();
    await page.waitForFunction(() => /GOODS TRADE COMPLETED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const afterBuy = await marketState();
    assert.equal(afterBuy.store, fixture.quote.amount, "the click deposits the quoted lot in a real store");
    assert.equal(afterBuy.physical - fixture.physical, fixture.quote.amount, "real physical stock increases");
    assert.equal(afterBuy.gold, fixture.gold - fixture.quote.gold, "the player pays the quoted gold");
    assert.equal(afterBuy.partnerStock, fixture.partnerStock - fixture.quote.amount, "the partner loses the goods sold");
    assert.equal(afterBuy.deposits, 1, "the purchase is booked as a physical deposit");
    assert.equal(afterBuy.produced, fixture.quote.amount);
    assert.equal(afterBuy.auditBalanced, true);
    assert.equal(afterBuy.goodBalanced, true);
    assert.equal(afterBuy.savedPrice, afterBuy.price, "the save carries the traded price");
    assert.equal(afterBuy.savedStock, afterBuy.partnerStock, "the save carries the partner stock");

    const sellQuote = await page.evaluate(async good => {
        const [{ state }, market] = await Promise.all([import("./js/core/state.js"), import("./js/systems/market.js")]);
        return market.getGoodTradeQuote(state.market.partners[0].id, good, "sell", market.GOOD_MARKET_LOT);
    }, good);
    assert.equal(sellQuote.ok, true);
    assert.equal(sellQuote.amount, fixture.quote.amount, "the same lot can be sold back");

    await page.locator("#tab-0").click();
    await page.locator("#tab-2").click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#tab-content")?.textContent || "";
        return text.includes("GENERAL GOODS · PHYSICAL STOCK");
    }, null, { timeout: 15000 });
    await page.locator("#tab-content .trade-partner").first().locator('[data-trade="sell"][data-good="' + good + '"]').click();
    await page.waitForFunction(() => /GOODS TRADE COMPLETED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const afterSell = await marketState();
    assert.equal(afterSell.store, 0, "the sale withdraws the stored lot");
    assert.equal(afterSell.physical, fixture.physical, "physical stock returns to its starting total");
    assert.equal(afterSell.gold, afterBuy.gold + sellQuote.gold, "the player receives the quoted payout");
    assert.equal(afterSell.partnerStock, fixture.partnerStock, "the partner gets the lot back");
    assert.equal(afterSell.withdrawals, 1, "the sale is booked as a physical withdrawal");
    assert.equal(afterSell.consumed, fixture.quote.amount);
    assert.equal(afterSell.auditBalanced, true);
    assert.equal(afterSell.goodBalanced, true);
    assert.ok(afterBuy.historyLength <= 16 && afterSell.historyLength <= 16, "price history stays bounded");
    await page.screenshot({ path: artifact("goods-market-settled.png"), fullPage: false });

    const roundtrip = await page.evaluate(async good => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }, logistics, market] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js"),
            import("./js/systems/logistics.js"), import("./js/systems/market.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        const store = state.entities.find(entity => entity.id === "__goods_market_store");
        const quote = market.getGoodTradeQuote(state.market.partners[0].id, good, "buy", market.GOOD_MARKET_LOT);
        return {
            gold: state.resources.gold,
            store: Number(store?.warehouse?.stored?.[good]) || 0,
            price: state.market.prices[good],
            quoteOk: quote.ok,
            auditBalanced: logistics.getGoodsAudit().balanced,
            savedKeys: Object.keys(state.market.prices).length
        };
    }, good);
    assert.equal(roundtrip.gold, afterSell.gold);
    assert.equal(roundtrip.store, 0);
    assert.equal(roundtrip.price, afterSell.price);
    assert.equal(roundtrip.quoteOk, true, "save/load keeps a usable general goods market");
    assert.equal(roundtrip.auditBalanced, true, "save/load keeps the goods book balanced");
    assert.ok(roundtrip.savedKeys >= 28);

    assert.deepEqual(pageErrors, [], "goods trading must not raise page errors");
    assert.deepEqual(consoleErrors, [], "goods trading must not raise console errors");
    console.log(JSON.stringify({ ok: true, hud, workshopTitle, fixture, panels, afterBuy, sellQuote, afterSell, roundtrip, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
