// Real-browser proof for the Buildings panel repair workflow.
//
// Found a realm through the start screen, damaged two finished structures,
// opened the Buildings register, repaired one from its row, then used
// "REPAIR ALL DAMAGED STRUCTURES" for the survivor. HP, the exact advertised
// material bills and the visible damage count are checked along the way.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4198;
const baseUrl = "http://127.0.0.1:" + port;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json"
};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404).end("Not found");
    }
});
await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
const report = { ok: false, pageErrors, consoleErrors };

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261125");
    await page.locator("#player-name-input").fill("Bulk Repair Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });

    const before = await page.evaluate(async () => {
        const [
            { state }, { TYPE }, { spawnEntity },
            { getBulkRepairSnapshot, getBuildingRepairSnapshot },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/systems/building-repair.js"),
        ]);
        state.isPaused = true;
        const wall = spawnEntity(40, 40, TYPE.WALL);
        const house = spawnEntity(42, 40, TYPE.HOUSE);
        const sound = spawnEntity(44, 40, TYPE.WALL);
        const site = spawnEntity(46, 40, TYPE.WALL);
        if (!wall || !house || !sound || !site) throw new Error("a proof structure could not be placed");
        wall.hp = Math.round(wall.maxHp * 0.5);
        house.hp = Math.round(house.maxHp * 0.6);
        site.construction = { stage: 2 };
        site.hp = 10;
        const bulk = getBulkRepairSnapshot();
        const row = getBuildingRepairSnapshot(house);
        return {
            wall: { id: wall.id, hp: wall.hp, maxHp: wall.maxHp },
            house: { id: house.id, hp: house.hp, maxHp: house.maxHp },
            sound: { id: sound.id, hp: sound.hp, maxHp: sound.maxHp },
            site: { id: site.id, hp: site.hp },
            resources: { ...state.resources },
            bulkCount: bulk.count,
            bulkCost: bulk.cost,
            rowCost: row.cost,
        };
    });
    assert.equal(before.bulkCount, 2, "only the two damaged finished structures belong in the bill");
    assert.equal(before.rowCost.wood > 0, true, "the row repair must advertise a real material bill");

    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible" });
    await page.locator('[data-command-tab="buildings"]').click();
    await page.locator('[data-command="repair-all"]').waitFor({ state: "visible", timeout: 15000 });
    // The register hydrates one DOM node per frame. The bulk button can be
    // visible before its neighbouring summary and row buttons are appended, so
    // wait for the real register content before reading the player's panel.
    await page.waitForFunction(
        () => /DAMAGED STRUCTURES\s*2/.test(document.querySelector("#command-panel-content")?.textContent || ""),
        null,
        { timeout: 15000 }
    );
    await page.waitForFunction(
        () => document.querySelectorAll('#command-panel-content [data-command="repair-building"]').length >= 2,
        null,
        { timeout: 15000 }
    );
    const panelText = await page.locator("#command-panel-content").innerText();
    assert.match(panelText, /DAMAGED STRUCTURES\s+2/, "the register must show the live damaged count");
    assert.match(panelText, /REPAIR ALL DAMAGED STRUCTURES/, "the register must offer one bulk order");
    const rowButtons = page.locator('#command-panel-content [data-command="repair-building"]');
    assert.ok(await rowButtons.count() >= 2, "damaged rows must offer their own repair button");
    await page.locator('details.building-record[data-building-id="' + before.house.id + '"] > summary').click();

    await page.locator('[data-command="repair-building"][data-value="' + before.house.id + '"]').click();
    await page.waitForFunction(
        () => /DAMAGED STRUCTURES\s*1/.test(document.querySelector("#command-panel-content")?.textContent || ""),
        null,
        { timeout: 15000 }
    );
    const afterRow = await page.evaluate(async id => {
        const { state } = await import("./js/core/state.js");
        const house = state.entities.find(entity => entity.id === id);
        return { hp: house.hp, maxHp: house.maxHp, resources: { ...state.resources } };
    }, before.house.id);
    assert.equal(afterRow.hp, afterRow.maxHp, "the row repair must restore the house");
    for (const [resource, amount] of Object.entries(before.rowCost)) {
        assert.equal(afterRow.resources[resource], before.resources[resource] - amount, "the row repair must spend exactly its shown bill");
    }

    await page.locator('[data-command="repair-all"]').click();
    await page.waitForFunction(
        () => /DAMAGED STRUCTURES\s*0/.test(document.querySelector("#command-panel-content")?.textContent || ""),
        null,
        { timeout: 15000 }
    );
    const afterBulk = await page.evaluate(async ids => {
        const { state } = await import("./js/core/state.js");
        const byId = id => state.entities.find(entity => entity.id === id);
        return {
            wall: { hp: byId(ids.wall).hp, maxHp: byId(ids.wall).maxHp },
            house: { hp: byId(ids.house).hp, maxHp: byId(ids.house).maxHp },
            sound: { hp: byId(ids.sound).hp, maxHp: byId(ids.sound).maxHp },
            site: { hp: byId(ids.site).hp },
            resources: { ...state.resources },
        };
    }, { wall: before.wall.id, house: before.house.id, sound: before.sound.id, site: before.site.id });
    assert.equal(afterBulk.wall.hp, afterBulk.wall.maxHp, "the bulk order must restore the damaged wall");
    assert.equal(afterBulk.house.hp, afterBulk.house.maxHp, "the bulk order must leave the repaired house sound");
    assert.equal(afterBulk.sound.hp, afterBulk.sound.maxHp, "a sound structure must stay untouched");
    assert.equal(afterBulk.site.hp, before.site.hp, "an unfinished site must stay untouched");
    assert.equal(
        afterBulk.resources.stone,
        before.resources.stone - (before.bulkCost.stone || 0),
        "the bulk order must spend exactly the advertised stone"
    );
    assert.equal(await page.locator('[data-command="repair-all"]').count(), 0, "no bulk button remains once everything is sound");

    assert.deepEqual(pageErrors, [], "the repair workflow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the repair workflow must not raise console errors");
    report.ok = true;
    console.log(JSON.stringify({ ok: true, before, afterRow, afterBulk, rowRepairs: true, bulkRepairs: true }, null, 2));
} finally {
    await browser.close();
    server.close();
}
if (!report.ok) process.exitCode = 1;
