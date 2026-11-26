// Player-facing proof for the 3.71.0 forestry interventions.
//
// Starts a real swamp realm, prepares four ordinary Lumber Yards beside real
// forest sites, then presses the four new management buttons as a player would:
// reforest a clearing, build a firebreak, set a controlled burn and drain a wet
// stand. It then runs two full years through the normal 4x speed control and
// reads the same stands, the live stewardship registers and the region history
// in the FORESTS atlas.
//
// Usage: npm run test:forest-stewardship-actions
// Output: artifacts/forest-stewardship-actions/forest-stewardship-actions.png
//         artifacts/forest-stewardship-actions/forest-stewardship-actions.json

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_ACTIONS_OUT || "artifacts/forest-stewardship-actions");
const screenshotPath = resolve(outputDir, "forest-stewardship-actions.png");
const reportPath = resolve(outputDir, "forest-stewardship-actions.json");
const progressPath = resolve(outputDir, "progress.log");
const seed = 20261126;
const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createStaticServer() {
    return createServer(async (request, response) => {
        try {
            const url = new URL(request.url || "/", "http://localhost");
            const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).slice(1);
            const file = resolve(gameRoot, relative);
            if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
                response.writeHead(403);
                response.end("Forbidden");
                return;
            }
            const body = await readFile(file);
            response.writeHead(200, {
                "content-type": mimeTypes[extname(file)] || "application/octet-stream",
                "cache-control": "no-store",
            });
            response.end(body);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" });
            response.end("Not found");
        }
    });
}

async function settleOverlays(page) {
    for (let guard = 0; guard < 8; guard++) {
        const action = await page.evaluate(() => {
            const visible = element => {
                if (!element) return false;
                const style = getComputedStyle(element);
                return style.display !== "none" && style.visibility !== "hidden"
                    && element.getClientRects().length > 0;
            };
            const modal = document.getElementById("realm-event-modal");
            if (visible(modal)) {
                const choice = modal.querySelector("#realm-event-choices .event-choice:not([disabled])");
                if (choice) { choice.click(); return "event-choice"; }
                const dismiss = modal.querySelector("#realm-event-dismiss");
                if (dismiss) { dismiss.click(); return "event-dismiss"; }
            }
            if (visible(document.getElementById("big-message-close"))) {
                document.getElementById("big-message-close").click();
                return "big-message";
            }
            return "none";
        });
        if (action === "none") return;
        await page.clock.runFor(150);
    }
}

async function pauseRealm(page) {
    const text = (await page.locator("#pause-text").innerText()).trim();
    if (text !== "RESUME") {
        await page.locator("#pause-btn").click();
        await page.clock.runFor(200);
    }
    assert.equal((await page.locator("#pause-text").innerText()).trim(), "RESUME");
}

async function resumeRealm(page) {
    const text = (await page.locator("#pause-text").innerText()).trim();
    if (text === "RESUME") {
        await page.locator("#pause-btn").click();
        await page.clock.runFor(200);
    }
    assert.equal((await page.locator("#pause-text").innerText()).trim(), "PAUSE");
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

await mkdir(outputDir, { recursive: true });
await writeFile(progressPath, "");
const { chromium } = await import("playwright");
const server = createStaticServer();
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const report = { seed, climate: "swamp", ok: false, actions: {}, atlas: {}, years: [] };
const log = message => appendFile(progressPath, new Date().toISOString() + " " + message + "\n").catch(() => {});
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", error => pageErrors.push(error.message));
page.on("requestfailed", request => failedRequests.push(request.url() + " — " + (request.failure()?.errorText || "failed")));

try {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.goto(baseUrl + "/?forest-stewardship-actions=" + seed, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
    });
    await page.clock.runFor(600);
    log("founding screen ready");
    await page.locator("#world-size").selectOption("compact");
    await page.locator("#world-climate").selectOption("swamp");
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Stewardship Player");
    await page.locator("#world-forests").evaluate(element => {
        element.value = "82";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#start-new-game-btn").click();
    for (let attempt = 0; attempt < 80; attempt++) {
        await page.clock.runFor(250);
        const started = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return state.hasStarted === true && state.entities.length > 0;
        });
        if (started && !(await page.locator("#start-screen").isVisible())) break;
    }
    assert.equal(await page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted), true);
    await page.clock.runFor(600);
    await settleOverlays(page);
    await pauseRealm(page);
    log("realm started and paused");

    const fixture = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { spawnEntity }, { getResourceNodeAt }, succession] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-succession.js"),
        ]);
        state.resources = { wood: 2000, stone: 2000, gold: 2000, food: 2000 };
        const width = Number(state.worldW) || 0;
        const height = Number(state.worldH) || 0;
        const geo = state.resourceGeography;
        const chosen = [];
        const far = (x, y, distance = 10) => chosen.every(site =>
            Math.max(Math.abs(site.x - x), Math.abs(site.y - y)) >= distance);
        let reforest = null, firebreak = null, burn = null, wet = null;
        for (let y = 3; y < height - 5; y += 2) {
            for (let x = 3; x < width - 5; x += 2) {
                if (!far(x, y, 8)) continue;
                const node = getResourceNodeAt(x, y);
                if (!node?.forestCapacity) continue;
                if (!reforest && node.forestStock > node.forestCapacity * 0.55) {
                    reforest = { x, y, capacity: node.forestCapacity, type: node.forestRegionalLabel };
                    chosen.push(reforest);
                    continue;
                }
                if (!burn && node.forestStock > node.forestCapacity * 0.6
                    && node.forestAge !== "young" && !succession.forestSuccessionAt(x, y)) {
                    burn = { x, y, capacity: node.forestCapacity, stock: node.forestStock, type: node.forestRegionalLabel };
                    chosen.push(burn);
                    continue;
                }
                if (!firebreak && node.forestStock > node.forestCapacity * 0.35) {
                    firebreak = { x, y, capacity: node.forestCapacity, stock: node.forestStock, type: node.forestRegionalLabel };
                    chosen.push(firebreak);
                    continue;
                }
                if (!wet && (node.forestWetness >= 0.55
                    || /floodplain|carr|mire|swamp|bog|alder|willow|alluvial/i.test(node.forestRegionalType?.key || ""))) {
                    const pressure = succession.forestStewardshipAt(x, y);
                    wet = {
                        x, y, capacity: node.forestCapacity, stock: node.forestStock,
                        wetness: node.forestWetness, drained: pressure.drained,
                        type: node.forestRegionalLabel,
                    };
                    chosen.push(wet);
                    continue;
                }
                if (reforest && firebreak && burn && wet) break;
            }
            if (reforest && firebreak && burn && wet) break;
        }
        if (!reforest || !firebreak || !burn || !wet) {
            throw new Error("The swamp fixture did not find four distinct stewardship sites");
        }
        // Make the reforestation site a real clearing. This is fixture setup only;
        // the button then uses the production action, costs and site model.
        const clearingBefore = {};
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const index = (reforest.y + dy) * width + (reforest.x + dx);
                if (!geo.forestCapacity[index]) continue;
                clearingBefore[index] = geo.forestStock[index];
                geo.forestStock[index] = Math.max(1, Math.floor(geo.forestCapacity[index] * 0.12));
            }
        }
        reforest.clearingBefore = clearingBefore;
        reforest.stockBefore = geo.forestStock[reforest.y * width + reforest.x];

        const buildings = [];
        const sites = [
            ["reforest", reforest],
            ["firebreak", firebreak],
            ["burn", burn],
            ["wet", wet],
        ];
        for (const [role, site] of sites) {
            const building = spawnEntity(site.x, site.y, TYPE.LUMBER);
            if (!building) throw new Error("Could not create the " + role + " lumber yard");
            building.x = site.x;
            building.y = site.y;
            building.dead = false;
            building.construction = { stage: 3, progress: 100, reason: "COMPLETED" };
            building.hp = Math.max(1, Number(building.hp) || 1);
            building.maxHp = Math.max(building.hp, Number(building.maxHp) || building.hp);
            buildings.push({ role, id: building.id, x: site.x, y: site.y });
        }
        const wetNode = getResourceNodeAt(wet.x, wet.y);
        const model = succession.ensureForestSuccession();
        return {
            width, height, buildings,
            sites: { reforest, firebreak, burn, wet },
            world: { forestTiles: Array.from(geo.forestCapacity).filter(Boolean).length },
            day: model.day,
            year: state.year,
            wetBefore: {
                flood: succession.forestSuccessionStats().drained,
                wetness: wetNode.forestWetness,
            },
            resourcesBefore: { ...state.resources },
        };
    });
    report.actions.fixture = fixture;
    log("fixture built: " + JSON.stringify(fixture.buildings));
    assert.equal(fixture.buildings.length, 4);
    assert.ok(fixture.world.forestTiles > 100, "the swamp realm must contain a real forest");

    async function openBuildingActions(buildingId, selector) {
        const record = page.locator("#command-panel-content .building-record").filter({
            has: page.locator("[" + selector + '="' + buildingId + '"]'),
        });
        await record.waitFor({ state: "visible", timeout: 8000 });
        if (!await record.evaluate(element => element.open)) {
            await record.locator("summary").click();
            await page.clock.runFor(120);
        }
        await record.evaluate(element => { element.open = true; });
        return record;
    }

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="buildings"]').click();
    await page.locator("#command-panel-content .building-record").first().waitFor({ state: "visible", timeout: 8000 });

    async function press(buildingId, selector, expect) {
        await openBuildingActions(buildingId, selector);
        const button = page.locator("[" + selector + '="' + buildingId + '"]');
        assert.equal(await button.count(), 1, "the lumber yard must expose " + selector);
        assert.equal(await button.isEnabled(), true, selector + " must be clickable");
        await button.scrollIntoViewIfNeeded();
        await button.click();
        await page.waitForFunction(text => document.querySelector("#action-toast")?.textContent.includes(text), expect, { timeout: 8000 });
        return (await page.locator("#action-toast").innerText()).trim();
    }

    const reforestToast = await press(fixture.buildings.find(row => row.role === "reforest").id,
        "data-reforest-forest", "REFORESTED");
    const firebreakToast = await press(fixture.buildings.find(row => row.role === "firebreak").id,
        "data-firebreak-forest", "FIREBREAK");
    const burnToast = await press(fixture.buildings.find(row => row.role === "burn").id,
        "data-burn-forest", "CONTROLLED BURN");
    const drainToast = await press(fixture.buildings.find(row => row.role === "wet").id,
        "data-drain-forest", "WETLAND DRAINED");
    report.actions.toasts = { reforestToast, firebreakToast, burnToast, drainToast };
    log("actions done: " + JSON.stringify(report.actions.toasts));
    assert.match(reforestToast, /^REFORESTED \d+ TILES · \+\d+ STAND UNITS/);
    assert.match(firebreakToast, /^FIREBREAK · \d+ TILES PROTECTED UNTIL DAY \d+/);
    assert.match(burnToast, /^CONTROLLED BURN · \+\d+ WOOD/);
    assert.match(drainToast, /^WETLAND DRAINED · FLOOD \d+% → \d+%/);

    const acted = await page.evaluate(async () => {
        const [{ state }, { getResourceNodeAt }, succession] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-succession.js"),
        ]);
        const model = state.forestSuccession;
        const stats = succession.forestSuccessionStats();
        const chronicle = succession.forestSuccessionChronicle();
        const event = kind => chronicle.entries.find(entry => entry.kind === kind);
        const reforest = event("reforest");
        const firebreak = event("firebreak");
        const burn = event("burn");
        const drain = event("drain");
        const reforestNode = getResourceNodeAt(reforest.x, reforest.y);
        const wetNode = getResourceNodeAt(drain.x, drain.y);
        const burnLive = succession.forestSuccessionAt(burn.x, burn.y);
        return {
            events: { reforest, firebreak, burn, drain },
            reforestStock: reforestNode.forestStock,
            firebreakUntil: succession.forestFirebreakAt(firebreak.x, firebreak.y),
            burnKind: model.tiles[burn.x + ":" + burn.y]?.kind || null,
            burnStage: burnLive?.stage || null,
            burnStock: getResourceNodeAt(burn.x, burn.y).forestStock,
            drained: wetNode.forestDrained,
            wetness: wetNode.forestWetness,
            stats, day: model.day, year: state.year,
            resources: { ...state.resources },
            stewardship: succession.forestStewardshipAt(drain.x, drain.y),
            chronicle,
        };
    });
    report.actions.after = acted;
    assert.ok(acted.events.reforest, "the reforestation order must enter the chronicle");
    assert.ok(acted.events.firebreak, "the firebreak order must enter the chronicle");
    assert.ok(acted.events.burn, "the controlled burn must enter the chronicle");
    assert.ok(acted.events.drain, "the wetland order must enter the chronicle");
    assert.ok(acted.events.reforest.stockAfter > acted.events.reforest.stockBefore,
        "the clearing must gain real stock");
    assert.ok(acted.firebreakUntil > acted.day, "the firebreak must be active in the saved model");
    assert.equal(acted.burnKind, "burned", "the controlled burn must create a real disturbance");
    assert.equal(acted.burnStage, "fresh");
    assert.equal(acted.drained, true, "the wetland order must persist on the stand");
    assert.ok(acted.events.drain.afterFlood < acted.events.drain.beforeFlood,
        "drainage must lower the real flood pressure");
    assert.ok(acted.events.drain.afterBiodiversity < acted.events.drain.beforeBiodiversity,
        "drainage must lower the real habitat index");
    assert.ok(acted.stats.stewardshipActions >= 4);
    assert.ok(acted.stats.planted > 0);
    assert.ok(acted.stats.drained >= 1);
    assert.ok(acted.chronicle.entries.some(entry => entry.kind === "reforest"));
    assert.ok(acted.chronicle.entries.some(entry => entry.kind === "firebreak"));
    assert.ok(acted.chronicle.entries.some(entry => entry.kind === "burn"));
    assert.ok(acted.chronicle.entries.some(entry => entry.kind === "drain"));
    const resolved = {
        reforest: { x: acted.events.reforest.x, y: acted.events.reforest.y },
        firebreak: { x: acted.events.firebreak.x, y: acted.events.firebreak.y },
        burn: { x: acted.events.burn.x, y: acted.events.burn.y },
        wet: { x: acted.events.drain.x, y: acted.events.drain.y },
    };
    report.actions.resolved = resolved;
    log("effects read: " + JSON.stringify(resolved));

    // Let the real simulation advance for two full years after the player's
    // orders. The presented loop spends most of a low-end run drawing frames;
    // this reference advances the same updateSimulation() path directly so the
    // ecological change can be read without a multi-minute render soak.
    await page.locator("#command-close").click();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 5000 });
    await resumeRealm(page);
    const startYear = acted.year;
    const advanced = await page.evaluate(async start => {
        const [{ state }, { updateSimulation }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/simulation/simulation.js"),
        ]);
        const tickStart = state.tick;
        let guard = 0;
        while (state.year < start + 2 && guard < 5000) {
            updateSimulation();
            guard++;
        }
        return { year: state.year, day: state.forestSuccession?.day || 0, guard, ticks: state.tick - tickStart };
    }, startYear);
    log("simulation advanced: " + JSON.stringify(advanced));
    report.years.push({ year: advanced.year, day: advanced.day, ticks: advanced.ticks });
    await page.locator("#pause-btn").click();
    await page.clock.runFor(200);
    await pauseRealm(page);
    const afterYears = await page.evaluate(async sites => {
        const [{ state }, { getResourceNodeAt }, succession] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-succession.js"),
        ]);
        const burnLive = succession.forestSuccessionAt(sites.burn.x, sites.burn.y);
        return {
            year: state.year, day: state.forestSuccession.day,
            reforestStock: getResourceNodeAt(sites.reforest.x, sites.reforest.y).forestStock,
            firebreakUntil: succession.forestFirebreakAt(sites.firebreak.x, sites.firebreak.y),
            burnAge: state.forestSuccession.tiles[sites.burn.x + ":" + sites.burn.y]?.age ?? null,
            burnStage: burnLive?.stage || null,
            drained: getResourceNodeAt(sites.wet.x, sites.wet.y).forestDrained,
            stats: succession.forestSuccessionStats(),
            chronicle: succession.forestSuccessionChronicle(),
        };
    }, resolved);
    report.years.after = afterYears;
    log("after years: " + JSON.stringify({ year: afterYears.year, day: afterYears.day, stats: afterYears.stats }));
    assert.ok(afterYears.year >= startYear + 2, "two full years must pass in fast-forward");
    assert.ok(afterYears.day > 700, "the succession clock must advance with the realm");
    assert.ok(afterYears.reforestStock > 0, "the planted stand must remain on the map");
    assert.ok(afterYears.firebreakUntil > afterYears.day, "the firebreak must remain saved across years");
    assert.ok(afterYears.burnAge !== null, "the burned stand must remain in the succession register");
    assert.ok(afterYears.burnStage, "the burned stand must still resolve a visible succession stage");
    assert.equal(afterYears.drained, true, "the wetland decision must survive the played years");
    assert.ok(afterYears.chronicle.entries.length >= 4);

    // The player opens the FORESTS atlas and reads the stewardship registers and
    // the region chronicle that groups the same orders by regional woodland.
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator("#command-panel-content .forest-atlas__card").first().waitFor({ state: "visible", timeout: 8000 });
    const stewardship = page.locator("#command-panel-content [data-forest-stewardship]");
    await stewardship.waitFor({ state: "visible", timeout: 5000 });
    const atlas = {
        stewardship: Number(await stewardship.getAttribute("data-forest-stewardship")),
        firebreaks: Number(await stewardship.getAttribute("data-forest-firebreaks")),
        drained: Number(await stewardship.getAttribute("data-forest-drained")),
        regions: await page.locator("#command-panel-content [data-forest-region]").count(),
    };
    assert.ok(atlas.stewardship >= 4, "the atlas must show the player's orders");
    assert.ok(atlas.firebreaks >= 1, "the atlas must show the maintained firebreak tiles");
    assert.ok(atlas.drained >= 1, "the atlas must show the drained wetland");
    assert.ok(atlas.regions >= 1, "the atlas must show at least one regional chronicle");
    const region = page.locator("#command-panel-content [data-forest-region]").filter({
        has: page.locator('[data-forest-chronicle="drain"]'),
    }).first();
    assert.ok(await region.count(), "a region chronicle must contain the wetland order");
    if (!await region.evaluate(element => element.open)) await region.locator("summary").click();
    await page.clock.runFor(120);
    const regionText = (await region.textContent() || "").replace(/\s+/g, " ").trim();
    for (const label of ["CURRENT", "Biodiversity", "Erosion", "Flood", "Wetness", "Wetland drainage"]) {
        assert.ok(regionText.includes(label), "the region chronicle must show " + label);
    }
    assert.ok(Number(await region.getAttribute("data-forest-region-biodiversity")) > 0,
        "the region chronicle must render a real percentage, not a 0..1 fraction");
    assert.ok(Number(await region.getAttribute("data-forest-region-flood")) >= 0);
    const allRegionText = await page.evaluate(() => Array.from(
        document.querySelectorAll("#command-panel-content [data-forest-region]")
    ).map(element => element.textContent || "").join("\n")).then(text => text.replace(/\s+/g, " ").trim());
    for (const label of ["Reforestation", "Firebreak belt", "Controlled burn", "Wetland drainage"]) {
        assert.ok(allRegionText.includes(label), "the regional chronicles must show the player's " + label);
    }
    report.atlas = { ...atlas, regionText: regionText.slice(0, 5000), allRegionText: allRegionText.slice(0, 8000) };
    log("atlas read: " + JSON.stringify(atlas));
    await stewardship.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshotPath, animations: "disabled" });

    assert.deepEqual(pageErrors, [], "the stewardship run must not emit page errors");
    assert.deepEqual(consoleErrors, [], "the stewardship run must not emit console errors");
    assert.deepEqual(failedRequests, [], "the stewardship run must not emit failed requests");
    report.ok = true;
    console.log("Forest stewardship action E2E passed:", JSON.stringify({
        fixture: { sites: fixture.sites, buildings: fixture.buildings.length },
        toasts: report.actions.toasts,
        years: report.years,
        atlas,
    }));
} finally {
    report.pageErrors = pageErrors;
    report.consoleErrors = consoleErrors;
    report.failedRequests = failedRequests;
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log("Forest stewardship action report:", reportPath);
    await browser.close().catch(() => {});
    await new Promise(resolveClose => server.close(resolveClose));
}
