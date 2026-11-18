// Fresh-start browser proof for road condition.
//
// A player builds the first road, lets the normal game clock cross two annual
// surveys, and sees the road panel report real wear, slower travel and higher
// upkeep. The worn condition must survive save/reload. Repairing from the same
// panel must restore 100% and the full speed bonus.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4193;
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
            console.error("load attempt " + attempt + " failed: " + error.message.split("\n")[0]);
            await page.waitForTimeout(4000);
        }
    }
}

async function runFor(ms) {
    await page.clock.runFor(ms);
}

async function hasStarted() {
    return page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted);
}

async function settleEvent() {
    for (let guard = 0; guard < 8; guard++) {
        const visible = await page.locator("#realm-event-modal").isVisible().catch(() => false);
        if (!visible) return;
        const choice = page.locator("#realm-event-choices .event-choice").first();
        if (await choice.count()) await choice.click().catch(() => {});
        await runFor(60);
    }
}

async function dismissBigMessage() {
    if (await page.locator("#big-message-close").isVisible().catch(() => false)) {
        await page.locator("#big-message-close").click().catch(() => {});
        await runFor(40);
    }
    if (await page.locator("#event-notification-close").isVisible().catch(() => false)) {
        await page.locator("#event-notification-close").click().catch(() => {});
        await runFor(40);
    }
}

async function findRoadTile() {
    return page.evaluate(async () => {
        const [{ state }, { isWaterAt }, { getRoadAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/world/world.js"),
            import("./js/systems/roads.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        for (let radius = 2; radius < 30; radius++) {
            for (let x = 80 - radius; x <= 80 + radius; x++) {
                for (let y = 80 - radius; y <= 80 + radius; y++) {
                    if (x < 0 || y < 0 || x >= (state.worldW || 160) || y >= (state.worldH || 160)) continue;
                    if (!state.explored?.[x]?.[y] || isWaterAt(x + .5, y + .5) || getRoadAt(x, y)) continue;
                    const occupied = state.entities.some(entity => {
                        if (entity.dead || !entity.isBuilding?.()) return false;
                        const size = entity.type === 1 ? { w: 4, h: 4 } : { w: 1, h: 1 };
                        return Math.abs(x + .5 - (entity.x + .5)) < size.w / 2 && Math.abs(y + .5 - (entity.y + .5)) < size.h / 2;
                    });
                    if (occupied) continue;
                    const screenX = (x + .5) * 48 * state.zoom - state.camera.x + rect.left;
                    const screenY = (y + .5) * 48 * state.zoom - state.camera.y + rect.top;
                    if (screenX < rect.left + 8 || screenX > rect.right - 8 || screenY < rect.top + 8 || screenY > rect.bottom - 8) continue;
                    return { x, y, screenX, screenY };
                }
            }
        }
        throw new Error("No visible legal road tile");
    });
}

async function roadProbe(tile) {
    return page.evaluate(async ({ x, y }) => {
        const [{ state }, roads] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/roads.js")
        ]);
        const road = roads.getRoadAt(x, y);
        const snapshot = roads.getRoadConditionSnapshot();
        return {
            year: state.year,
            tick: state.tick,
            condition: road?.condition ?? null,
            speed: roads.getRoadSpeedMultiplier(x + .5, y + .5),
            travelCost: roads.getRoadTravelCost(x + .5, y + .5),
            upkeep: roads.getRoadUpkeepTotal(),
            resources: { ...state.resources },
            survey: snapshot.lastWear,
            repair: snapshot.lastRepair,
            panel: {
                text: document.querySelector(".road-condition")?.textContent?.replace(/\s+/g, " ").trim() || "",
                button: document.querySelector("[data-repair-roads]")?.textContent?.trim() || "",
                disabled: document.querySelector("[data-repair-roads]")?.disabled ?? null
            }
        };
    }, tile);
}

try {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await gotoWithRetry(baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/");
    let version = null;
    if (baseUrl) {
        const response = await page.request.get(baseUrl + "/version.json?cb=" + Date.now());
        if (response.ok()) version = await response.json();
    }
    await runFor(600);
    await page.locator("#world-seed-input").fill("20261122");
    await page.locator("#player-name-input").fill("Road Surveyor");
    await page.locator("#start-new-game-btn").click();
    for (let attempt = 0; attempt < 40 && !(await hasStarted()); attempt++) await runFor(250);
    assert.equal(await hasStarted(), true, "the visible founding button must start a realm");
    await runFor(600);
    await dismissBigMessage();

    // Pause through the real control so the first player actions cannot race
    // the clock. The panel must not show a zero placeholder before any road.
    if ((await page.locator("#pause-btn").innerText()).trim() === "PAUSE") await page.locator("#pause-btn").click();
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const emptyPanel = await page.locator(".road-condition").innerText();
    assert.match(emptyPanel, /NO ROADS/, "a fresh realm must name the empty network, not show 0%");
    assert.doesNotMatch(emptyPanel, /\b(undefined|null|NaN)\b/);
    await page.screenshot({ path: artifact("road-condition-empty.png"), fullPage: false });
    await page.locator("#build-close-btn").click();

    // Build the first road through the same visible Roads panel and map click.
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    await page.locator('[data-road-type="dirt"]').click();
    if ((await page.locator("#pause-btn").innerText()).trim() === "RESUME") await page.locator("#pause-btn").click();
    const road = await findRoadTile();
    await page.mouse.click(road.screenX, road.screenY);
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return (Number(state.statistics?.totalRoadTilesBuilt) || 0) > 0;
    }, null, { timeout: 5000 });
    if ((await page.locator("#pause-btn").innerText()).trim() === "PAUSE") await page.locator("#pause-btn").click();
    await page.keyboard.press("Escape");
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const freshRoad = await roadProbe(road);
    assert.equal(freshRoad.condition, 100, "a newly built road must start sound");
    assert.match(freshRoad.panel.text, /100\.0%/, "the panel must surface the real condition");
    assert.match(freshRoad.panel.text, /SOUND/);
    assert.equal(freshRoad.panel.disabled, true, "sound roads must not show an active repair");
    await dismissBigMessage();
    await page.screenshot({ path: artifact("road-condition-new.png"), fullPage: false });
    await page.locator("#build-close-btn").click();

    // Run the normal clock at 4x until two annual surveys have happened.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-frame-limit").selectOption("30");
    await page.locator("#settings-render-scale").selectOption("25");
    await page.locator("#settings-close").click();
    await page.locator("#speed-4").click();
    if ((await page.locator("#pause-btn").innerText()).trim() === "RESUME") await page.locator("#pause-btn").click();
    let current = await roadProbe(road);
    let chunks = 0;
    while (current.year < 3 && chunks < 12) {
        await runFor(20000);
        await runFor(220);
        await settleEvent();
        await dismissBigMessage();
        current = await roadProbe(road);
        chunks++;
        console.log("advance " + chunks + " · year " + current.year + " · condition " + current.condition);
    }
    assert.ok(current.year >= 3, "two full annual surveys must run before the proof reads wear (year " + current.year + " after " + chunks + " chunks)");
    assert.ok(current.condition < 95, "two surveys must leave the first dirt road visibly worn");
    assert.ok(current.speed < freshRoad.speed, "worn roads must slow the same carrier route");
    assert.ok(current.travelCost > freshRoad.travelCost, "worn roads must cost more route time");
    assert.ok(current.upkeep > freshRoad.upkeep, "worn roads must add emergency upkeep");
    assert.equal(current.survey.year, current.year, "the last survey must belong to the current year");
    assert.ok(current.survey.carriers >= 0);
    if ((await page.locator("#pause-btn").innerText()).trim() === "PAUSE") await page.locator("#pause-btn").click();
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const wornPanel = await roadProbe(road);
    assert.match(wornPanel.panel.text, new RegExp(current.condition.toFixed(1) + "%"), "the panel must show the measured worn percentage");
    assert.match(wornPanel.panel.text, /WORN|BADLY WORN/);
    assert.match(wornPanel.panel.text, /carrier/i, "the reason line must name the hauling cause");
    assert.match(wornPanel.panel.text, /repair/i, "the panel must state what the player can do");
    assert.equal(wornPanel.panel.disabled, false, "a worn road must offer an affordable repair");
    await dismissBigMessage();
    await page.screenshot({ path: artifact("road-condition-worn.png"), fullPage: false });

    // Save the worn network, reload, and compare the exact condition and panel.
    const beforeSave = await roadProbe(road);
    await page.locator("#build-close-btn").click();
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Loaded realm"), null, { timeout: 20000 });
    await runFor(700);
    if ((await page.locator("#pause-btn").innerText()).trim() === "PAUSE") await page.locator("#pause-btn").click();
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const restored = await roadProbe(road);
    assert.equal(restored.condition, beforeSave.condition, "save/reload must preserve the exact road condition");
    assert.equal(restored.survey.year, beforeSave.survey.year, "save/reload must preserve the annual survey year");
    assert.equal(restored.speed, beforeSave.speed, "save/reload must preserve the worn movement multiplier");
    assert.equal(restored.upkeep, beforeSave.upkeep, "save/reload must preserve the worn upkeep");
    assert.match(restored.panel.text, new RegExp(beforeSave.condition.toFixed(1) + "%"));
    await page.screenshot({ path: artifact("road-condition-restored.png"), fullPage: false });

    // Repair from the same panel. The button must charge materials and restore
    // the full speed and the base upkeep.
    const beforeRepair = await roadProbe(road);
    await page.locator("[data-repair-roads]").click();
    await runFor(100);
    const repaired = await roadProbe(road);
    assert.equal(repaired.condition, 100, "repair must restore the road to 100%");
    assert.equal(repaired.speed, freshRoad.speed, "repair must restore the full movement bonus");
    assert.equal(repaired.travelCost, freshRoad.travelCost, "repair must restore the base route cost");
    assert.equal(repaired.upkeep, freshRoad.upkeep, "repair must remove the emergency upkeep");
    assert.ok(repaired.resources.wood <= beforeRepair.resources.wood, "repair must spend real materials");
    assert.equal(repaired.panel.disabled, true, "a repaired network must no longer offer a paid repair");
    assert.match(repaired.panel.text, /100\.0%/);
    assert.match(repaired.panel.text, /SOUND/);
    await page.screenshot({ path: artifact("road-condition-repaired.png"), fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        target: baseUrl || "local",
        version,
        emptyPanel,
        road,
        fresh: { condition: freshRoad.condition, speed: freshRoad.speed, cost: freshRoad.travelCost, upkeep: freshRoad.upkeep },
        worn: { year: wornPanel.year, condition: wornPanel.condition, speed: wornPanel.speed, cost: wornPanel.travelCost, upkeep: wornPanel.upkeep, survey: wornPanel.survey, panel: wornPanel.panel },
        restored: { condition: restored.condition, speed: restored.speed, cost: restored.travelCost, upkeep: restored.upkeep, survey: restored.survey },
        repaired: { condition: repaired.condition, speed: repaired.speed, cost: repaired.travelCost, upkeep: repaired.upkeep, resources: repaired.resources, repair: repaired.repair },
        chunks,
        pageErrors,
        consoleErrors
    }));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
