// Player reference for 4.0.4: authored scenarios and multiple start conditions.
//
// The test uses the real start screen and real game loop. It selects a preset,
// authors a custom opening, founds that realm, checks the scenario card against
// live stores/legitimacy, saves, reloads, and repeats the reading on a narrow
// viewport. It never injects a scenario into state directly.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4190;
const outDir = resolve(root, "artifacts", "scenario-start");
await mkdir(outDir, { recursive: true });
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403).end("forbidden");
        const data = await readFile(file);
        response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(data);
    } catch {
        response.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
});
await new Promise(done => server.listen(port, "127.0.0.1", done));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

function watch(page, label, errors) {
    page.on("pageerror", error => errors.push(label + " pageerror: " + error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(label + " console: " + message.text()); });
}

async function openStart(page) {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-scenario-card]").length >= 6, null, { timeout: 10000 });
}

async function startRealm(page) {
    await page.locator("#start-new-game-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 60000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 10000 });
}

async function openKingdom(page) {
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        return text.toLowerCase().includes("kingdom overview") || text.toLowerCase().includes("awaiting its founding");
    }, null, { timeout: 10000 });
    // The kingdom deck hydrates progressively: wait for the panel's text and
    // progress bar, not just for the empty section shell to appear.
    await waitForScenarioPanel(page);
}

async function waitForScenarioPanel(page) {
    await page.waitForFunction(() => {
        const panel = document.querySelector("[data-scenario-panel]");
        return Boolean(panel && panel.querySelector(".scenario-objective__note") && /SCENARIO ·/.test(panel.textContent || ""));
    }, null, { timeout: 10000 });
}

const errors = [];
try {
    const desktopContext = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const desktop = await desktopContext.newPage();
    watch(desktop, "desktop", errors);
    await openStart(desktop);
    const presets = await desktop.locator("[data-scenario-card]").count();
    assert.equal(presets, 6, "the start screen exposes the free realm and five authored openings");
    assert.equal(await desktop.locator("#scenario-preset-list [data-scenario-card=\"free-realm\"]").getAttribute("aria-pressed"), "true");

    await desktop.locator("[data-scenario-card=\"first-winter\"]").click();
    assert.equal(await desktop.locator("#scenario-preset-list [data-scenario-card=\"first-winter\"]").getAttribute("aria-pressed"), "true");
    assert.equal(await desktop.locator("#world-climate").inputValue(), "northern", "the recommended climate reaches the existing world forge");
    const presetBriefing = await desktop.locator("#scenario-briefing").innerText();
    assert.match(presetBriefing, /The First Winter/);
    assert.match(presetBriefing, /150 food/);
    assert.match(presetBriefing, /Autumn/);
    assert.match(presetBriefing, /MORALE \/ LEGITIMACY/);

    await desktop.locator("#scenario-editor summary").click();
    await desktop.locator("#scenario-name-input").fill("Granary Watch");
    await desktop.locator("#scenario-description-input").fill("A late-summer crown inherits full coffers and an empty granary. Raise eight hundred food before the second winter closes.");
    await desktop.locator("#scenario-climate-select").selectOption("temperate");
    await desktop.locator("#scenario-season-select").selectOption("1");
    await desktop.locator("#scenario-food-input").fill("400");
    await desktop.locator("#scenario-wood-input").fill("220");
    await desktop.locator("#scenario-stone-input").fill("120");
    await desktop.locator("#scenario-gold-input").fill("160");
    await desktop.locator("#scenario-morale-input").fill("58");
    await desktop.locator("#scenario-legitimacy-input").fill("42");
    await desktop.locator("#scenario-objective-select").selectOption("food");
    await desktop.locator("#scenario-target-input").fill("800");
    await desktop.locator("#scenario-deadline-year-input").fill("2");
    await desktop.locator("#scenario-save-custom").click();
    await desktop.waitForFunction(() => document.querySelector("#scenario-editor-status")?.textContent.includes("Saved in this browser"));
    assert.equal(await desktop.locator("#scenario-editor-status").innerText(), "Saved in this browser · Granary Watch is selected.");
    const customCard = desktop.locator("[data-scenario-card^=\"custom-\"]").first();
    assert.equal(await customCard.getAttribute("aria-pressed"), "true");
    assert.match(await desktop.locator("#scenario-briefing").innerText(), /Granary Watch/);
    await desktop.locator(".scenario-forge").scrollIntoViewIfNeeded();
    await desktop.locator(".scenario-forge").screenshot({ path: resolve(outDir, "forge-desktop.png"), animations: "disabled" });

    await startRealm(desktop);
    const started = await desktop.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            id: state.scenario?.id,
            name: state.scenario?.name,
            status: state.scenario?.status,
            target: state.scenario?.objective?.target,
            current: state.scenario?.current,
            season: state.seasonIndex,
            day: state.dayOfYear,
            legitimacyDefinition: state.scenario?.legitimacy,
            legitimacyLive: state.politics?.legitimacy,
            food: state.resources?.food,
            panel: document.querySelector("#command-panel-content")?.textContent || "",
            hud: document.querySelector("#scenario-hud")?.textContent || ""
        };
    });
    assert.match(started.id, /^custom-granary-watch-/);
    assert.equal(started.name, "Granary Watch");
    assert.equal(started.target, 800);
    assert.equal(started.status, "active");
    assert.equal(started.season, 1, "the custom summer opening reaches the live season");
    assert.ok(started.day >= 180, "the scenario opens in summer after the fixed warm-up");
    assert.equal(started.legitimacyDefinition, 42);
    assert.ok(started.legitimacyLive < 60, "the authored legitimacy changes the live political state");
    assert.match(started.hud, /GRANARY WATCH/);
    assert.match(started.hud, /800/);
    await openKingdom(desktop);
    const panel = await desktop.locator("[data-scenario-panel]").innerText();
    assert.match(panel, /SCENARIO · CUSTOM/);
    assert.match(panel, /GRANARY WATCH/i);
    assert.match(panel, /800 food/);
    assert.match(panel, /STARTING STORES/);
    assert.match(panel, /42/);
    const progressNow = await desktop.locator("[data-scenario-panel] .scenario-progress").getAttribute("aria-valuenow");
    assert.ok(Number(progressNow) >= 0 && Number(progressNow) <= 800);
    await desktop.locator("[data-scenario-panel]").scrollIntoViewIfNeeded();
    await desktop.screenshot({ path: resolve(outDir, "desktop.png"), animations: "disabled" });
    await desktop.locator("#command-close").click();

    await desktop.locator("#save-btn").click();
    await desktop.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").includes("SAVED"), null, { timeout: 10000 });
    await desktop.reload({ waitUntil: "domcontentloaded" });
    await desktop.locator("#start-screen").waitFor({ state: "visible", timeout: 15000 });
    await desktop.waitForFunction(() => !document.querySelector("#continue-game-btn")?.disabled, null, { timeout: 10000 });

    // Install a real local data pack through the start-screen file input,
    // select its scenario and remove it again before continuing the realm.
    const beforePack = await desktop.locator("[data-scenario-card]").count();
    await desktop.locator("#data-pack-forge summary").click();
    const browserPack = {
        format: "kings-and-cards-data-pack",
        formatVersion: 1,
        id: "browser-pack",
        name: "Browser Pack",
        author: "Gate Keeper",
        version: "1.0.0",
        gameVersion: "3.68.0",
        description: "A local browser fixture pack with one authored opening.",
        scenarios: [{
            id: "harvest-watch",
            name: "Harvest Watch",
            description: "A packed harvest opening that must be visible before a realm is founded.",
            difficulty: "NORMAL",
            recommendedClimate: "temperate",
            startDay: 0,
            resources: { food: 111, wood: 80, stone: 40, gold: 60 },
            morale: 55,
            legitimacy: 50,
            objective: { type: "food", target: 140, deadlineYear: 2, deadlineDay: 0 }
        }],
        regions: [{ id: "northmere-pines", name: "Browser Pines" }]
    };
    await desktop.locator("#data-pack-file").setInputFiles({
        name: "browser-pack.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(browserPack))
    });
    await desktop.locator("#data-pack-import").click();
    await desktop.waitForFunction(() => (document.querySelector("#data-pack-status")?.textContent || "").includes("Installed"));
    assert.equal(await desktop.locator("[data-scenario-card]").count(), beforePack + 1, "the installed pack adds one visible scenario card");
    assert.equal(await desktop.locator("[data-data-pack=\"browser-pack\"]").count(), 1, "the installed pack is listed by name");
    await desktop.locator("[data-scenario-card=\"browser-pack-harvest-watch\"]").click();
    assert.match(await desktop.locator("#scenario-briefing").innerText(), /Harvest Watch/);
    assert.match(await desktop.locator("#scenario-briefing").innerText(), /140 food/);
    await desktop.locator("[data-data-pack-remove=\"browser-pack\"]").click();
    await desktop.waitForFunction(() => document.querySelectorAll("[data-scenario-card=\"browser-pack-harvest-watch\"]").length === 0);
    assert.equal(await desktop.locator("[data-scenario-card]").count(), beforePack, "removing the pack removes its scenario card");
    assert.equal(await desktop.locator("#scenario-preset-list [data-scenario-card=\"free-realm\"]").getAttribute("aria-pressed"), "true", "removing the selected pack returns the picker to the free realm");
    assert.doesNotMatch(await desktop.locator("#start-screen").innerText(), /undefined|\bNaN\b|Lorem ipsum/);

    await desktop.locator("#continue-game-btn").click();
    await desktop.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 60000 });
    const loaded = await desktop.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { id: state.scenario?.id, status: state.scenario?.status, target: state.scenario?.objective?.target, name: state.scenario?.name };
    });
    assert.deepEqual(loaded, { id: started.id, status: started.status, target: 800, name: "Granary Watch" });
    await desktop.locator("#command-open-btn").click();
    await waitForScenarioPanel(desktop);
    assert.match(await desktop.locator("[data-scenario-panel]").innerText(), /Granary Watch/);

    const narrowContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const narrow = await narrowContext.newPage();
    watch(narrow, "narrow", errors);
    await openStart(narrow);
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, "the scenario picker must not create horizontal page overflow at 390 px");
    await narrow.locator("[data-scenario-card=\"first-winter\"]").click();
    const narrowBriefing = await narrow.locator("#scenario-briefing").boundingBox();
    assert.ok(narrowBriefing && narrowBriefing.width <= 390, "the narrow scenario briefing must stay inside the viewport");
    await narrow.locator(".scenario-forge").scrollIntoViewIfNeeded();
    await narrow.locator(".scenario-forge").screenshot({ path: resolve(outDir, "forge-narrow.png"), animations: "disabled" });
    await startRealm(narrow);
    await narrow.waitForFunction(() => Boolean(document.querySelector("#scenario-hud:not(.hidden)")), null, { timeout: 10000 });
    const hudBox = await narrow.locator("#scenario-hud").boundingBox();
    assert.ok(hudBox && hudBox.x + hudBox.width <= 390 + 1, "the narrow scenario HUD must stay inside the viewport");
    await narrow.screenshot({ path: resolve(outDir, "narrow-hud.png"), animations: "disabled" });
    await openKingdom(narrow);
    const narrowPanel = narrow.locator("[data-scenario-panel]");
    assert.match(await narrowPanel.innerText(), /THE FIRST WINTER/i);
    const panelBox = await narrowPanel.boundingBox();
    assert.ok(panelBox && panelBox.width <= 390, "the narrow scenario panel must stay inside the viewport");
    await narrowPanel.scrollIntoViewIfNeeded();
    await narrow.screenshot({ path: resolve(outDir, "narrow.png"), animations: "disabled" });
    assert.deepEqual(errors, [], "the real browser session must have no page or console errors");

    console.log(JSON.stringify({
        ok: true,
        presets,
        custom: { id: started.id, name: started.name, target: started.target, season: started.season, legitimacy: started.legitimacyLive },
        savedAndLoaded: loaded,
        narrowOverflow: overflow,
        errors
    }, null, 2));
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
