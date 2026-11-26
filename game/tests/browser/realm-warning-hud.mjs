// Real-browser player proof for the living HUD warning inbox.
//
// A player damages two finished structures, sees one warning source in the top
// bar, clicks the badge into the Buildings register, repairs both structures
// and watches the warning clear. A deferred realm issue then returns the badge
// and opens the Chronicle, where the live OPEN ISSUE control actually lives.
// No page or console errors.
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

async function hud() {
    return page.evaluate(() => {
        const button = document.getElementById("warning-inbox-btn");
        return {
            count: document.getElementById("warning-count")?.textContent || "",
            title: button?.title || "",
            aria: button?.getAttribute("aria-label") || "",
            panel: button?.dataset.kacPanel || "",
            buildCategory: button?.dataset.kacBuildCategory || ""
        };
    });
}

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261125");
    await page.locator("#player-name-input").fill("Warning Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    // The first year's sliced maintenance still runs while the realm is paused;
    // it can refresh hazards after our fixture. Wait for it to drain first.
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    const damaged = await page.evaluate(async () => {
        const [
            { state }, { TYPE }, { spawnEntity }, { renderUI },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        state.isPaused = true;
        state.resources = { wood: 300, stone: 300, gold: 300, food: 300 };
        state.activeEvent = null;
        state.health.outbreakActive = false;
        state.raidActive = false;
        state.environmentalHazards = { active: [], warnings: [] };
        state.economy.foodCrisis.severity = 0;
        state.economy.debt = 0;
        state.roads = { version: 1, revision: 1, tiles: {}, lastWearYear: 0, lastWear: null, lastRepairYear: 0, lastRepair: null };
        const wall = spawnEntity(30, 30, TYPE.WALL);
        const house = spawnEntity(32, 30, TYPE.HOUSE);
        if (!wall || !house) throw new Error("the proof structures could not be placed");
        wall.hp = Math.round(wall.maxHp * 0.25);
        house.hp = Math.round(house.maxHp * 0.6);
        renderUI();
        return { wallId: wall.id, houseId: house.id };
    });

    // renderUI() refreshes one HUD chunk per task, so wait for the visible
    // badge to catch up with the fixture instead of reading a stale tooltip.
    await page.waitForFunction(
        () => document.getElementById("warning-inbox-btn")?.title.includes("STRUCTURE DAMAGE · 2"),
        null, { timeout: 15000 }
    );
    const withDamage = await hud();
    assert.equal(withDamage.count, "1", "two damaged buildings are one warning source");
    assert.match(withDamage.title, /STRUCTURE DAMAGE · 2/, "the tooltip must name the damaged count");
    assert.match(withDamage.aria, /STRUCTURE DAMAGE · 2/, "screen readers get the same warning");
    assert.equal(withDamage.panel, "buildings", "the badge must navigate into the Buildings register");

    await page.locator("#warning-inbox-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
        () => document.querySelector("#command-panel-content")?.textContent.includes("Building register"),
        null, { timeout: 15000 }
    );
    await page.locator("#command-close").click();

    const repaired = await page.evaluate(async ids => {
        const [{ state }, { repairBuilding }, { renderUI }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/building-repair.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        const results = ids.map(id => repairBuilding(id));
        renderUI();
        return results.map(result => result.ok);
    }, [damaged.wallId, damaged.houseId]);
    assert.deepEqual(repaired, [true, true], "both visible repairs must succeed");
    await page.waitForFunction(
        () => document.getElementById("warning-count")?.textContent === "0",
        null, { timeout: 15000 }
    );
    const afterRepair = await hud();
    assert.equal(afterRepair.count, "0", "the badge clears when the last warning is gone");
    assert.doesNotMatch(afterRepair.title, /STRUCTURE DAMAGE/);
    assert.equal(afterRepair.panel, "chronicle", "a quiet realm keeps the original inbox target");

    const deferred = await page.evaluate(async () => {
        const [{ state }, { renderUI }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        state.activeEvent = {
            id: "issue-proof", title: "The grain tally is disputed",
            description: "A deferred decision is still waiting for the crown.",
            choices: [], dismissed: true
        };
        renderUI();
        return true;
    });
    assert.equal(deferred, true);
    await page.waitForFunction(
        () => document.getElementById("warning-inbox-btn")?.title.includes("REALM ISSUE DEFERRED"),
        null, { timeout: 15000 }
    );
    const withIssue = await hud();
    assert.equal(withIssue.count, "1");
    assert.match(withIssue.title, /REALM ISSUE DEFERRED/);
    assert.match(withIssue.aria, /The grain tally is disputed/);
    assert.equal(withIssue.panel, "chronicle");

    await page.locator("#warning-inbox-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    // Chronicle sections hydrate one node per frame. The ribbon can be visible
    // before the button in the same article has been appended, so wait for the
    // real control instead of reading the panel mid-hydration.
    await page.waitForFunction(
        () => Boolean(document.querySelector("#command-panel-content [data-command='show-active-event']"))
            && document.querySelector("#command-panel-content")?.textContent.includes("CURRENTLY AWAITING THE CROWN"),
        null, { timeout: 15000 }
    );
    assert.equal(await page.locator('[data-command="show-active-event"]').count() > 0, true,
        "The Chronicle must expose the reopened issue control");

    assert.deepEqual(pageErrors, [], "the warning flow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the warning flow must not raise console errors");
    report.ok = true;
    console.log(JSON.stringify({ ok: true, withDamage, afterRepair, withIssue }, null, 2));
} finally {
    await browser.close();
    server.close();
}
if (!report.ok) process.exitCode = 1;
