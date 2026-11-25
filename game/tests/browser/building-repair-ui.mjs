// Real-browser proof for the building repair action.
//
// Found a realm through the start screen, damage a finished wall, inspect it in
// the workshop, click the repair button and verify the HP and royal stone bill
// from the player-visible panel and the live state. No page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4197;
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
    await page.locator("#player-name-input").fill("Repair Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });

    const before = await page.evaluate(async () => {
        const [
            { state }, { TYPE }, { spawnEntity }, { openWorkshop }, { getBuildingRepairSnapshot },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/presentation/build-mode.js"),
            import("./js/systems/building-repair.js"),
        ]);
        state.isPaused = true;
        const wall = spawnEntity(30, 30, TYPE.WALL);
        if (!wall) throw new Error("the test wall could not be placed");
        wall.hp = Math.round(wall.maxHp / 2);
        state.selectedBuildingId = wall.id;
        openWorkshop();
        const repair = getBuildingRepairSnapshot(wall);
        return {
            id: wall.id, hp: wall.hp, maxHp: wall.maxHp,
            stone: Number(state.resources.stone), cost: repair.cost, ready: repair.ok,
        };
    });
    assert.equal(before.ready, true, "a damaged finished wall must be repairable");
    assert.ok(before.cost.stone > 0, "the repair bill must include stone");
    assert.match(await page.locator("#workshop-meta").innerText(), /HP\s+\d+\/\d+/, "the inspector must show structure HP");
    const button = page.locator("[data-repair-building]");
    assert.equal(await button.isEnabled(), true, "the visible repair button must be enabled");
    await button.click();

    const after = await page.evaluate(async id => {
        const { state } = await import("./js/core/state.js");
        const wall = state.entities.find(entity => entity.id === id);
        return { hp: wall.hp, maxHp: wall.maxHp, stone: Number(state.resources.stone) };
    }, before.id);
    assert.equal(after.hp, after.maxHp, "the clicked repair must restore full HP");
    assert.equal(after.stone, before.stone - before.cost.stone, "the clicked repair must spend the shown stone bill");
    assert.equal(await button.isEnabled(), false, "a sound wall must no longer offer repair");

    // The front page must signal surviving damage and show the newest record first.
    await page.evaluate(async () => {
        const [{ state }, { TYPE }, { spawnEntity }, { addLog }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/core/event-log.js"),
        ]);
        const house = spawnEntity(32, 30, TYPE.HOUSE);
        house.hp = Math.round(house.maxHp / 2);
        addLog("CHRONICLE ORDER OLD MARKER", "#ffffff", "realm");
        addLog("CHRONICLE ORDER NEW MARKER", "#ffffff", "realm");
    });
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible" });
    await page.locator('[data-command-tab="kingdom"]').click();
    await page.waitForFunction(
        () => document.querySelector("#command-panel-content")?.textContent.includes("DAMAGED STRUCTURES"),
        null,
        { timeout: 15000 }
    );
    const overview = await page.locator("#command-panel-content").innerText();
    assert.match(overview, /STRUCTURE DAMAGE/, "Kingdom Overview must expose the damage survey");
    assert.match(overview, /DAMAGED STRUCTURES\s+1/, "the survey must count the surviving damaged house");
    await page.waitForFunction(() => {
        const titles = [...document.querySelectorAll("#command-panel-content .command-section-title")];
        const title = titles.find(node => node.textContent.trim() === "RECENT CHRONICLE");
        return Boolean(title?.nextElementSibling?.textContent.includes("CHRONICLE ORDER NEW MARKER"));
    }, null, { timeout: 15000 });
    const newest = await page.evaluate(() => {
        const titles = [...document.querySelectorAll("#command-panel-content .command-section-title")];
        const title = titles.find(node => node.textContent.trim() === "RECENT CHRONICLE");
        return title.nextElementSibling.querySelector(".command-history").textContent.trim();
    });
    assert.match(newest, /CHRONICLE ORDER NEW MARKER/, "the chronicle must lead with the newest record");
    assert.doesNotMatch(newest, /CHRONICLE ORDER OLD MARKER/, "the chronicle must not lead with an older record");

    assert.deepEqual(pageErrors, [], "the repair flow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the repair flow must not raise console errors");
    report.ok = true;
    console.log(JSON.stringify({ ok: true, before, after, overview: true }, null, 2));
} finally {
    await browser.close();
    server.close();
}
if (!report.ok) process.exitCode = 1;
