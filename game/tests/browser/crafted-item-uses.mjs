// Real-browser proof for active crafted item uses.
//
// Found a realm, verified the live HUD and the real workshops, made one weapon
// and one book in the actual smithy/scriptorium loop, opened the Lexicon as a
// player, committed the weapon with USE and sold the book, checked that a
// second click cannot pay twice, then saved and restored the realm. No page or
// console errors, and the archive keeps its bounded 500-record shape.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4237;
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

async function archiveState() {
    return page.evaluate(async () => {
        const [{ state }, { craftedUseAmount }, { CRAFTED_ITEM_USES }] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/item-lexicon.js"),
            import("./js/systems/city-config.js")
        ]);
        const weapon = state.craftedItems.find(item => item.kind === "weapon");
        const book = state.craftedItems.find(item => item.kind === "book");
        const snapshot = (await import("./js/core/save-runtime.js")).prepareSaveSnapshot(
            JSON.parse(JSON.stringify((await import("./js/core/save-runtime.js")).createSaveSnapshot()))
        );
        return {
            total: state.craftedItems.length,
            weapon: weapon ? { id: weapon.id, label: weapon.label, status: weapon.status, quality: weapon.quality,
                expectedFood: craftedUseAmount(CRAFTED_ITEM_USES.weapon.use, weapon.quality),
                expectedGold: craftedUseAmount(CRAFTED_ITEM_USES.weapon.sell, weapon.quality) } : null,
            book: book ? { id: book.id, label: book.label, status: book.status, quality: book.quality,
                expectedGold: craftedUseAmount(CRAFTED_ITEM_USES.book.sell, book.quality) } : null,
            food: state.resources.food,
            gold: state.resources.gold,
            itemsUsed: state.economy.crafting.itemsUsed || 0,
            itemsSold: state.economy.crafting.itemsSold || 0,
            savedWeaponStatus: snapshot.craftedItems?.find(item => item.id === weapon?.id)?.status || null,
            savedBookStatus: snapshot.craftedItems?.find(item => item.id === book?.id)?.status || null
        };
    });
}

async function openCraftedEntry(id) {
    await page.waitForSelector('[data-item-id="' + id + '"]', { state: "visible", timeout: 15000 });
    const entry = page.locator('[data-item-id="' + id + '"]');
    await entry.locator("summary").click();
    await entry.locator("[data-item-detail]").waitFor({ state: "visible", timeout: 15000 });
    return entry;
}

try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261119");
    await page.locator("#player-name-input").fill("Crafted Uses Proof");
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
    const workshopTitle = (await page.locator("#workshop-title").textContent() || "").trim();
    await page.locator("#workshop-close").click();
    await page.locator("#workshop-panel").waitFor({ state: "hidden", timeout: 15000 });
    assert.ok(workshopTitle, "the workshop must open with a real title");

    // Produce through the real workshop loop; the pause is lifted only for the
    // duration of this single synchronous call, then restored immediately.
    const produced = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { ensureInventory }, { updateCraftProduction, CRAFT_INTERVAL, CRAFT_SUPPLY_INTERVAL }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"), import("./js/systems/logistics.js"),
            import("./js/systems/craft-production.js")
        ]);
        const smithy = state.entities.find(entity => entity.type === TYPE.SMITHY && !entity.dead);
        const scriptorium = state.entities.find(entity => entity.type === TYPE.SCRIPTORIUM && !entity.dead);
        if (!smithy || !scriptorium) return { made: -1 };
        ensureInventory(smithy).input.planks = 4;
        smithy.inventory.input.firewood = 4;
        ensureInventory(scriptorium).input.planks = 4;
        scriptorium.inventory.input.water = 4;
        state.tick = CRAFT_INTERVAL;
        const wasPaused = state.isPaused;
        state.isPaused = false;
        const made = updateCraftProduction();
        state.isPaused = wasPaused;
        return { made, interval: CRAFT_INTERVAL, supplyInterval: CRAFT_SUPPLY_INTERVAL,
            statuses: state.craftedItems.map(item => item.status) };
    });
    assert.equal(produced.made, 2, "both real workshops must record a unique item");
    assert.equal(produced.interval, 90);
    assert.equal(produced.supplyInterval, 30);
    assert.deepEqual(produced.statuses, ["owned", "owned"]);

    const before = await archiveState();
    assert.ok(before.weapon && before.book);
    assert.equal(before.total, 2);
    assert.equal(before.savedWeaponStatus, "owned", "the save carries the owned status");

    const panels = [];
    for (const panel of ["buildings", "economy", "resources", "items"]) panels.push({ panel, preview: await openPanel(panel) });
    assert.equal(panels.length, 4);
    assert.ok(panels.every(entry => entry.preview.length > 40), "every opened panel renders real content");
    await page.locator('[data-item-category="crafted"]').click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        return text.includes("PLAYER-MADE") && text.includes("CRAFTED");
    }, null, { timeout: 15000 });

    let weaponEntry = await openCraftedEntry(before.weapon.id);
    const weaponButtons = weaponEntry.locator("[data-crafted-use]");
    assert.equal(await weaponButtons.count(), 2, "an owned record offers a real use and a real sale");
    assert.match(await weaponButtons.first().textContent(), /ISSUE TO THE HUNT · \+\d+ FOOD/);
    assert.match(await weaponButtons.nth(1).textContent(), /SELL TO AN ARMS DEALER · \+\d+ GOLD/);
    assert.match(await weaponEntry.locator("[data-item-detail]").textContent(), /STATUS.*OWNED/s);
    await page.screenshot({ path: artifact("crafted-item-uses-ready.png"), fullPage: false });

    await weaponButtons.first().click();
    await page.waitForFunction(id => {
        const row = document.querySelector('[data-item-id="' + id + '"]');
        return Boolean(row && (row.textContent || "").includes("USED"));
    }, before.weapon.id, { timeout: 15000 });
    const afterUse = await archiveState();
    assert.equal(afterUse.food, before.food + before.weapon.expectedFood, "the active use pays real food once");
    assert.equal(afterUse.gold, before.gold, "using the weapon does not touch gold");
    assert.equal(afterUse.itemsUsed, 1);
    assert.equal(afterUse.weapon.status, "used");
    assert.equal(afterUse.savedWeaponStatus, "used", "the new status is already in the save snapshot");
    assert.match(await page.locator(".item-lexicon__use-notice").textContent(), /PUT TO WORK.*\+.*FOOD.*USED/);

    weaponEntry = await openCraftedEntry(before.weapon.id);
    assert.equal(await weaponEntry.locator("[data-crafted-use]").count(), 0, "a committed record cannot be used again");

    let bookEntry = await openCraftedEntry(before.book.id);
    assert.equal(await bookEntry.locator("[data-crafted-use]").count(), 2);
    await bookEntry.locator('[data-crafted-use="sell"]').click();
    await page.waitForFunction(id => {
        const row = document.querySelector('[data-item-id="' + id + '"]');
        return Boolean(row && (row.textContent || "").includes("SOLD"));
    }, before.book.id, { timeout: 15000 });
    const afterSell = await archiveState();
    assert.equal(afterSell.gold, afterUse.gold + before.book.expectedGold, "the sale pays real gold once");
    assert.equal(afterSell.food, afterUse.food, "selling the book does not touch food");
    assert.equal(afterSell.itemsSold, 1);
    assert.equal(afterSell.book.status, "sold");
    assert.equal(afterSell.savedBookStatus, "sold");
    bookEntry = await openCraftedEntry(before.book.id);
    assert.equal(await bookEntry.locator("[data-crafted-use]").count(), 0);
    await page.screenshot({ path: artifact("crafted-item-uses-settled.png"), fullPage: false });

    const roundtrip = await page.evaluate(async () => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }, { normalizeCraftedItems }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js"), import("./js/systems/item-lexicon.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        return {
            statuses: state.craftedItems.map(item => item.status).sort(),
            total: state.craftedItems.length,
            normalized: normalizeCraftedItems(JSON.parse(JSON.stringify(state.craftedItems))).length,
            gold: state.resources.gold,
            food: state.resources.food
        };
    });
    assert.deepEqual(roundtrip.statuses, ["sold", "used"]);
    assert.equal(roundtrip.total, 2);
    assert.equal(roundtrip.normalized, 2, "the 500-record archive survives a save/load");
    assert.equal(roundtrip.gold, afterSell.gold);
    assert.equal(roundtrip.food, afterSell.food);

    assert.deepEqual(pageErrors, [], "crafted item uses must not raise page errors");
    assert.deepEqual(consoleErrors, [], "crafted item uses must not raise console errors");
    console.log(JSON.stringify({ ok: true, hud, workshopTitle, produced, before, panels, afterUse, afterSell, roundtrip, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
