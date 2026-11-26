// Real-browser proof for the Crown Commissary using actual stored food goods.
//
// Found a realm through the start screen, stocked a real warehouse with grain,
// flour and bread, signed a regional grain contract with an empty treasury,
// then pressed the real PROVISION button in the Economy tab. The food must come
// from the physical stores, both sides of the goods book must stay balanced,
// and the save snapshot must carry the result. No page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4223;
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
const provision = '[data-command="crown-provision"]';

async function openTab(id) {
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

async function openEconomy() {
    await openTab("economy");
    await page.waitForFunction(() => {
        const content = document.querySelector("#command-panel-content");
        return Boolean(content?.textContent?.includes("CROWN SUPPLY") && content.querySelector('[data-command="crown-provision"]'));
    }, null, { timeout: 15000 });
}

async function panelState() {
    return page.evaluate(selector => {
        const button = document.querySelector(selector);
        const notes = [...document.querySelectorAll("#command-panel-content .command-note")].map(node => node.textContent);
        return {
            text: button?.textContent.trim() || "",
            disabled: button?.disabled ?? null,
            storedNote: notes.find(note => note.includes("Real stores:")) || "",
            food: document.querySelector("#command-panel-content")?.textContent.includes("FOOD") || false
        };
    }, provision);
}

async function realmState() {
    return page.evaluate(async () => {
        const [{ state }, logistics, { getCrownSupplySnapshot }, { createSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/logistics.js"),
            import("./js/systems/crown-supply.js"), import("./js/core/save-runtime.js")
        ]);
        const audit = logistics.getGoodsAudit();
        const store = state.entities.find(entity => entity.id === "__proof_store");
        const snapshot = getCrownSupplySnapshot();
        const saved = createSaveSnapshot();
        return {
            food: Math.round((Number(state.resources.food) || 0) * 100) / 100,
            gold: state.resources.gold,
            wood: state.resources.wood,
            stone: state.resources.stone,
            stored: {
                grain: Number(store?.warehouse?.stored?.grain) || 0,
                flour: Number(store?.warehouse?.stored?.flour) || 0,
                bread: Number(store?.warehouse?.stored?.bread) || 0
            },
            physicalFlour: logistics.getPhysicalStock("flour"),
            physicalBread: logistics.getPhysicalStock("bread"),
            grainLevel: snapshot.grainLevel,
            ledger: state.city.logistics.ledger.filter(entry => entry.cause === "crown-requisition")
                .map(entry => ({ type: entry.type, good: entry.good, scope: entry.scope, quantity: entry.quantity })),
            auditBalanced: audit.balanced,
            grainBalanced: audit.rows.find(row => row.good === "grain")?.balanced || false,
            flourBalanced: audit.rows.find(row => row.good === "flour")?.balanced || false,
            breadBalanced: audit.rows.find(row => row.good === "bread")?.balanced || false,
            foodBalanced: audit.rows.find(row => row.good === "food")?.balanced || false,
            savedFood: Math.round((Number(saved.resources?.food) || 0) * 100) / 100
        };
    });
}

try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261127");
    await page.locator("#player-name-input").fill("Commissary Stores Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    const injected = await page.evaluate(async () => {
        const [{ state }, { TYPE }, logistics, crown, { setAuditOpening }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"), import("./js/systems/logistics.js"),
            import("./js/systems/crown-supply.js"), import("./js/systems/goods-book.js")
        ]);
        const store = { id: "__proof_store", type: TYPE.WAREHOUSE, x: 44, y: 44, dead: false, construction: { stage: 3, progress: 1 }, isBuilding: () => true };
        state.entities.push(store);
        logistics.ensureInventory(store);
        const deposited = {
            grain: logistics.depositGood("grain", 20, 44, 44),
            flour: logistics.depositGood("flour", 30, 44, 44),
            bread: logistics.depositGood("bread", 40, 44, 44)
        };
        state.resources.gold = 0;
        state.resources.wood = 500;
        state.resources.stone = 500;
        // Sign while the route still has food; with an empty treasury the
        // contract buys nothing. Then close the market so the 90 food can only
        // have come from the real stores.
        const contract = crown.setGrainContract(2);
        for (const partner of state.market.partners) partner.stock.food = 1;
        state.resources.food = 10;
        setAuditOpening(logistics.getPhysicalStockMap());
        const foodGoods = crown.getCrownSupplySnapshot().commissary.foodGoods;
        return {
            deposited, grainLevel: crown.getCrownSupplySnapshot().grainLevel,
            contract: { ok: contract.ok, reason: contract.reason || null },
            partners: state.market?.partners?.length || 0,
            foodGoods,
            expectedFood: 10 + foodGoods.grain + foodGoods.flour + foodGoods.bread,
            auditBalanced: logistics.getGoodsAudit().balanced
        };
    });
    console.log("fixture", JSON.stringify(injected));
    assert.deepEqual(injected.deposited, { grain: 20, flour: 30, bread: 40 });
    assert.equal(injected.grainLevel, 2);
    assert.equal(injected.auditBalanced, true, "the fixture starts with a balanced book");

    await openEconomy();
    const before = await panelState();
    assert.match(before.text, /PROVISION THE GRANARY · CALL IN STORED FOOD \/ BARTER GOODS/);
    assert.equal(before.disabled, false, "real stores must enable the provision button without material surplus");
    assert.match(before.storedNote, new RegExp(injected.foodGoods.grain + " grain · " + injected.foodGoods.flour + " flour · " + injected.foodGoods.bread + " bread, called in before any material is spent"));
    await page.screenshot({ path: artifact("crown-stores-ready.png"), fullPage: false });

    await page.locator(provision).click();
    await page.waitForFunction(() => {
        const toast = document.querySelector("#action-toast")?.textContent || "";
        return /GRANARY PROVISIONED · \d+ FOOD SECURED/.test(toast);
    }, null, { timeout: 15000 });
    const toast = await page.locator("#action-toast").textContent();
    const after = await realmState();
    const gained = after.food - 10;
    const bookedGoods = after.ledger.filter(entry => entry.scope === "good").reduce((sum, entry) => sum + entry.quantity, 0);
    const bookedFood = after.ledger.filter(entry => entry.scope === "resource").reduce((sum, entry) => sum + entry.quantity, 0);
    assert.ok(gained > 0, "the real stored food goods must become royal food");
    assert.match(toast, new RegExp("GRANARY PROVISIONED · " + gained + " FOOD SECURED"));
    assert.deepEqual(after.stored, { grain: 0, flour: 0, bread: 0 });
    assert.ok(after.physicalFlour < injected.foodGoods.flour, "real flour left a physical store");
    assert.ok(after.physicalBread < injected.foodGoods.bread, "real bread left a physical store");
    assert.equal(after.gold, 0, "an empty treasury did not buy food");
    assert.equal(after.wood, 500, "the construction timber reserve was not spent");
    assert.equal(after.stone, 500, "the construction stone reserve was not spent");
    assert.ok(after.ledger.length > 0, "each real store removal is booked");
    assert.equal(after.ledger.every(entry => entry.scope === "good" ? entry.type === "consumed" : entry.type === "produced"), true);
    assert.equal(bookedGoods, gained, "every unit of food came from a real good");
    assert.equal(bookedFood, gained, "every unit of food was booked on the resource side");
    assert.equal(after.auditBalanced, true, "both sides of the requisition must be booked");
    assert.equal(after.grainBalanced && after.flourBalanced && after.breadBalanced && after.foodBalanced, true);
    assert.equal(after.savedFood, after.food, "the save snapshot carries the provisioned reserve");
    await page.screenshot({ path: artifact("crown-stores-provisioned.png"), fullPage: false });

    const roundtrip = await page.evaluate(async () => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }, logistics] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js"), import("./js/systems/logistics.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        const store = state.entities.find(entity => entity.id === "__proof_store");
        return {
            food: Math.round((Number(state.resources.food) || 0) * 100) / 100,
            gold: state.resources.gold,
            stored: {
                grain: Number(store?.warehouse?.stored?.grain) || 0,
                flour: Number(store?.warehouse?.stored?.flour) || 0,
                bread: Number(store?.warehouse?.stored?.bread) || 0
            },
            ledger: state.city.logistics.ledger.filter(entry => entry.cause === "crown-requisition").length,
            auditBalanced: logistics.getGoodsAudit().balanced
        };
    });
    assert.equal(roundtrip.food, after.food, "save/load keeps the provisioned food");
    assert.deepEqual(roundtrip.stored, { grain: 0, flour: 0, bread: 0 }, "save/load keeps the emptied stores");
    assert.equal(roundtrip.gold, 0);
    assert.equal(roundtrip.ledger, after.ledger.length, "save/load keeps every paired booking");
    assert.equal(roundtrip.auditBalanced, true, "save/load keeps the audited book balanced");

    const visited = [];
    for (const tab of ["kingdom", "buildings", "economy", "resources", "worldmap", "biome", "atelier"]) {
        visited.push({ tab, preview: await openTab(tab) });
    }
    assert.equal(visited.length, 7);
    assert.equal(visited.every(entry => entry.preview.length > 40), true, "every visited panel renders real content");

    assert.deepEqual(pageErrors, [], "provisioning must not raise page errors");
    assert.deepEqual(consoleErrors, [], "provisioning must not raise console errors");
    console.log(JSON.stringify({ ok: true, injected, before, after, roundtrip, visited, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
