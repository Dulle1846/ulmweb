// Real-browser proof for the living noble houses. The realm is founded through
// the start screen; the charter and levy are clicked in the real management
// panel; the annual audit runs through the exported system entry point; then the
// visible save button, reload and continue button prove persistence.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4173;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = createServer(async (req, res) => {
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
await new Promise(resolveListen => server.listen(port, "127.0.0.1", resolveListen));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261114");
    await page.locator("#player-name-input").fill("Noble Houses Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.hasStarted;
    }, null, { timeout: 15000 });

    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="nobility"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .noble-house").length === 4, null, { timeout: 10000 });
    const before = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getNobilitySnapshot } = await import("./js/systems/nobility.js");
        const snapshot = getNobilitySnapshot();
        return {
            houses: snapshot.houses.map(house => ({
                id: house.id, familyName: house.familyName, head: house.head?.name || null,
                members: house.memberCount, loyalty: house.loyalty, levy: house.levyActive
            })),
            gold: state.resources.gold,
            wood: state.resources.wood,
            defense: snapshot.defenseBonus,
            panelHeadings: document.querySelectorAll("#command-panel-content .noble-house h4").length,
            charterButtons: document.querySelectorAll('#command-panel-content [data-command="noble-charter"]').length
        };
    });
    assert.equal(before.houses.length, 4);
    assert.equal(before.panelHeadings, 4);
    assert.equal(before.charterButtons, 4);
    for (const house of before.houses) {
        assert.ok(house.head, "every noble house must name a living resident as its head");
        assert.ok(house.members >= 1);
    }

    const selected = before.houses[0];
    await page.locator('[data-noble-house="' + selected.id + '"] [data-command="noble-charter"]').click();
    await page.waitForFunction(async id => {
        const { state } = await import("./js/core/state.js");
        return state.nobility?.houses?.find(house => house.id === id)?.charter === true;
    }, selected.id, { timeout: 10000 });
    const afterCharter = await page.evaluate(async id => {
        const { state } = await import("./js/core/state.js");
        const { getNobilitySnapshot } = await import("./js/systems/nobility.js");
        return {
            house: state.nobility.houses.find(house => house.id === id),
            gold: state.resources.gold,
            wood: state.resources.wood,
            defense: getNobilitySnapshot().defenseBonus,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    }, selected.id);
    assert.equal(afterCharter.house.charter, true);
    assert.equal(afterCharter.gold, before.gold - 30);
    assert.equal(afterCharter.wood, before.wood - 10);
    assert.ok(afterCharter.house.loyalty > selected.loyalty);
    assert.match(afterCharter.text, /CHARTER GRANTED/);

    await page.locator('[data-noble-house="' + selected.id + '"] [data-command="noble-levy"]').click();
    await page.waitForFunction(async id => {
        const { state } = await import("./js/core/state.js");
        return (state.nobility?.houses?.find(house => house.id === id)?.musteredUntilYear || 0) > state.year;
    }, selected.id, { timeout: 10000 });
    const afterLevy = await page.evaluate(async id => {
        const { getNobilitySnapshot } = await import("./js/systems/nobility.js");
        const { state } = await import("./js/core/state.js");
        const snapshot = getNobilitySnapshot();
        return {
            house: snapshot.houses.find(house => house.id === id),
            defense: snapshot.defenseBonus,
            year: state.year,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    }, selected.id);
    assert.equal(afterLevy.house.mustered, true);
    assert.ok(afterLevy.defense > afterCharter.defense || afterLevy.defense >= 1.1);
    assert.match(afterLevy.text, /LEVY MUSTERED/);

    await page.locator("#command-close").click();
    const annual = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { updateNobility } = await import("./js/systems/nobility.js");
        const goldBefore = state.resources.gold;
        state.year = 2;
        const snapshot = updateNobility();
        return {
            goldBefore,
            goldAfter: state.resources.gold,
            dues: snapshot.duesThisYear,
            defense: snapshot.defenseBonus,
            houses: snapshot.houseCount,
            mustered: snapshot.houses.find(house => house.charter)?.mustered ?? false
        };
    });
    assert.equal(annual.houses, 4);
    assert.ok(annual.dues > 0, "the annual noble audit must collect real dues");
    assert.equal(annual.goldAfter, annual.goldBefore + annual.dues);
    assert.ok(annual.mustered, "the mustered levy must survive the annual audit");

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="nobility"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("DUES LAST AUDIT"), null, { timeout: 10000 });
    const panelText = await page.locator("#command-panel-content").innerText();
    assert.match(panelText, /Last audit year 2/);
    assert.match(panelText, /gold dues/);

    await page.locator("#command-close").click();
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 15000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled && (button.textContent || "").includes("CONTINUE"));
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed");
    }, null, { timeout: 20000 });
    const loadStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the noble-house realm must load; actual status: " + loadStatus);

    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
    });
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="nobility"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .noble-house").length === 4, null, { timeout: 10000 });
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getNobilitySnapshot } = await import("./js/systems/nobility.js");
        const snapshot = getNobilitySnapshot();
        return {
            year: state.year,
            gold: state.resources.gold,
            houses: snapshot.houses.map(house => ({ id: house.id, charter: house.charter, mustered: house.mustered, loyalty: house.loyalty })),
            dues: snapshot.duesThisYear,
            defense: snapshot.defenseBonus,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(restored.houses.length, 4);
    assert.equal(restored.houses.find(house => house.id === selected.id)?.charter, true, "the charter must survive save/load");
    assert.equal(restored.houses.find(house => house.id === selected.id)?.mustered, true, "the mustered levy must survive save/load");
    assert.equal(restored.dues, annual.dues);
    assert.equal(restored.defense, annual.defense);
    assert.match(restored.text, /CHARTER GRANTED/);
    assert.match(restored.text, /LEVY MUSTERED/);

    assert.deepEqual(pageErrors, [], "the noble-house browser run must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the noble-house browser run must not raise console errors");
    console.log(JSON.stringify({
        ok: true,
        seed: 20261114,
        houses: before.houses.map(house => house.familyName),
        selected: selected.familyName,
        dues: annual.dues,
        defense: restored.defense,
        loaded: loadStatus,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
