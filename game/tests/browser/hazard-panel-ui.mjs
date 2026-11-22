// Real browser proof for 1.2.20: open the hazard panel, read the readiness
// survey, prepare a season, let a real hazard settle, then save, reload and
// confirm the same hazard state comes back with no page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4183;
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
    channel: process.env.E2E_CHANNEL || "chromium",
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer"]
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
    await page.locator("#world-seed-input").fill("20261120");
    await page.locator("#player-name-input").fill("Hazard Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    const seeded = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getHazardSnapshot } = await import("./js/systems/environmental-hazards.js");
        state.resources.gold = 900;
        state.resources.wood = 400;
        state.resources.stone = 300;
        return {
            climate: state.worldOptions.climate,
            hazards: Boolean(state.environmentalHazards),
            catalog: getHazardSnapshot().catalog.total,
            season: state.seasonIndex
        };
    });
    assert.equal(seeded.hazards, true, "the run must start with the hazard layer");
    assert.equal(seeded.catalog, 102, "the whole 1.2.20 catalogue must be live");

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="hazards"]').click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        return text.includes("Hazards of the realm") && text.includes("a reload in the middle of a drought keeps the drought");
    }, null, { timeout: 15000 });
    const panel = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panel, /102 hazards are modelled/);
    assert.match(panel, /PROTECTION · READINESS/);
    assert.match(panel, /REALM RESILIENCE/);
    assert.match(panel, /DISEASE PRESSURE/);
    assert.match(panel, /INJURY RESISTANCE/);
    assert.match(panel, /RARE PRESSURE/);
    assert.match(panel, /LOSSES[\s\S]*?HERDS/);
    assert.match(panel, /DISEASES & OUTBREAKS/);
    assert.match(panel, /LONG-TERM CONSEQUENCES/);
    assert.match(panel, /ARCANE BURDEN/);
    assert.match(panel, /REGIONAL DANGERS/);
    assert.match(panel, /DERIVED CONSEQUENCES/);
    assert.match(panel, /VISIBLE EFFECTS · LIVE/);
    assert.match(panel, /FOOD & WATER DRAW/);
    assert.match(panel, /CARAVAN SPEED/);
    assert.match(panel, /CARAVAN BUY/);
    assert.match(panel, /ADAPTATION RELIEF/);
    assert.match(panel, /SEASONAL FORECAST/);
    assert.match(panel, /CHOOSE A PLAN/);
    assert.match(panel, /SPECIALIST CREWS & EQUIPMENT/);
    assert.match(panel, /HAZARD SCARS ON THE MAP/);
    assert.match(panel, /REBUILD ECONOMY/);
    assert.match(panel, /NEIGHBOURING REALMS/);

    // A plan and a crew are real player decisions, not display rows.
    await page.locator('#command-panel-content [data-command="hazard-plan-stockpile"]').click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.environmentalHazards?.response?.plan === "stockpile"
            && state.environmentalHazards.response.stockpile === 2;
    }, null, { timeout: 15000 });
    await page.locator('#command-panel-content [data-command="hazard-crew-fire"]').click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.environmentalHazards?.response?.crews?.fire === 1;
    }, null, { timeout: 15000 });
    await page.locator('#command-panel-content [data-command="hazard-overlay"]').first().click();
    assert.equal(await page.evaluate(async () => (await import("./js/core/state.js")).state.hazardOverlay), true);

    const prepare = page.locator('#command-panel-content [data-command="hazard-prepare"]');
    assert.equal(await prepare.isDisabled(), false, "a fresh season can be prepared");
    await prepare.click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.environmentalHazards?.preparedness?.season === state.seasonIndex;
    }, null, { timeout: 15000 });

    // Let real seasons settle until a hazard is actually pressing, then reopen
    // the panel and prove the row, the loss counters and the record all render.
    const settled = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { updateEnvironmentalHazards } = await import("./js/systems/environmental-hazards.js");
        state.weather = "storm";
        // Advancing the year changes every hazard roll; forcing the pass only
        // skips the once-per-season guard.
        for (let step = 0; step < 12; step++) {
            state.year += 1;
            updateEnvironmentalHazards({ force: true });
            if (state.environmentalHazards.active.length > 0) break;
        }
        return {
            active: state.environmentalHazards.active.map(row => row.mechanic),
            history: state.environmentalHazards.history.length,
            losses: { ...state.environmentalHazards.losses },
            stockpile: state.environmentalHazards.response?.stockpile,
            season: state.seasonIndex
        };
    });
    assert.ok(settled.active.length > 0, "twenty-four real seasons must produce at least one hazard");
    assert.ok(settled.history > 0, "the hazard record must be written");

    await page.locator('[data-command-tab="kingdom"]').click();
    await page.locator('[data-command-tab="hazards"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content .hazard-row").length > 0, null, { timeout: 15000 });
    // The panel is drawn from the live state, so compare against the state as
    // it is now rather than against the snapshot taken before the re-render.
    const live = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return state.environmentalHazards.active.map(row => row.mechanic);
    });
    assert.ok(live.length > 0, "the reopened panel must have hazards to show");
    await page.waitForFunction(mechanics => mechanics.every(mechanic =>
        document.querySelector('#command-panel-content [data-hazard-active="' + mechanic + '"]')), live, { timeout: 15000 });
    const activeRows = await page.locator("#command-panel-content .hazard-row").evaluateAll(rows => rows.map(row => row.dataset.hazardActive));
    for (const mechanic of live) {
        assert.ok(activeRows.includes(mechanic), "the panel must list the active hazard " + mechanic);
    }
    assert.ok(await page.locator("#command-panel-content [data-hazard-surface]").count() > 0,
        "the real HAZARDS tab must render at least one state-bound surface row");
    assert.ok(await page.locator("#command-panel-content [data-hazard-surface][data-hazard-value]").count() > 0,
        "surface rows must carry the live state value");

    await page.locator("#command-close").click();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 15000 });
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 15000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#continue-game-btn").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector("#continue-game-btn")?.disabled, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });

    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            season: state.seasonIndex,
            active: state.environmentalHazards.active.map(row => row.mechanic),
            history: state.environmentalHazards.history.length,
            preparedness: state.environmentalHazards.preparedness.season,
            losses: { ...state.environmentalHazards.losses },
            plan: state.environmentalHazards.response?.plan,
            stockpile: state.environmentalHazards.response?.stockpile,
            fireCrew: state.environmentalHazards.response?.crews?.fire
        };
    });
    assert.equal(restored.season, settled.season);
    assert.deepEqual(restored.active, settled.active, "the reloaded realm must keep the same hazards");
    assert.equal(restored.history, settled.history, "the hazard record must survive the reload");
    assert.deepEqual(restored.losses, settled.losses, "the loss ledger must survive the reload");
    assert.equal(restored.plan, "stockpile", "the chosen plan must survive the reload");
    assert.equal(restored.stockpile, settled.stockpile, "the stockpiled supplies must survive the reload");
    assert.equal(restored.fireCrew, 1, "the trained crew must survive the reload");

    // The panel must show the player the same multipliers the simulation uses,
    // and the numbers must move between calm weather and an active hazard.
    const readConsequences = async () => {
        if (!(await page.locator("#command-modal").isVisible().catch(() => false))) {
            await page.locator("#command-open-btn").click();
        }
        await page.locator('[data-command-tab="kingdom"]').click();
        await page.locator('[data-command-tab="hazards"]').click();
        await page.waitForFunction(() => {
            const text = document.querySelector("#command-panel-content")?.textContent || "";
            return text.includes("DERIVED CONSEQUENCES") && text.includes("a reload in the middle of a drought keeps the drought");
        }, null, { timeout: 15000 });
        return page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    };
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.environmentalHazards.active = [];
        state.environmentalHazards.modifiers = {
            diseaseRisk: 0, work: 0, movement: 0, needs: 0, morale: 0,
            resistance: 0, adaptation: 0, medical: 0, trade: 0, extraction: 0, pasture: 0
        };
    });
    const calmPanel = await readConsequences();
    assert.match(calmPanel, /DERIVED CONSEQUENCES · NEUTRAL/);
    assert.match(calmPanel, /FOOD & WATER DRAW[\s\S]*?0%/);
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.environmentalHazards.active = [{
            id: "heatwave", mechanic: "hazard:heatwave", label: "Heatwaves", category: "weather",
            spec: "1.2.20.4", severity: 0.8, startedYear: state.year, effects: {}
        }];
        state.environmentalHazards.modifiers = {
            diseaseRisk: 0, work: 0.5, movement: 0.5, needs: 0.5, morale: 0,
            resistance: 0, adaptation: 0, medical: 0, trade: 0.5, extraction: 0.5, pasture: 0.5
        };
    });
    const hazardPanel = await readConsequences();
    assert.match(hazardPanel, /DERIVED CONSEQUENCES · APPLIED TO THE REALM/);
    assert.match(hazardPanel, /FOOD & WATER DRAW[\s\S]*?\+23%/);
    assert.match(hazardPanel, /WORK & BUILDING[\s\S]*?−20%/);
    assert.match(hazardPanel, /WORK −21%/);
    assert.notEqual(calmPanel, hazardPanel, "the player must see the numbers change with the hazard");

    assert.deepEqual(pageErrors, [], "no page errors");
    assert.deepEqual(consoleErrors, [], "no console errors");
    console.log(JSON.stringify({ seed: 20261120, climate: seeded.climate, preparedSeason: seeded.season, active: settled.active, history: settled.history, losses: settled.losses }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
