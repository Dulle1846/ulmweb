// Player-view visual audit for 1.2.21.
//
// Captures real Chromium pixels for the seasonal biome layer and the full
// ecology panel: a wide atlas at four seasons, close views of coast, mountain
// and desert regions, the 66-row ledger at desktop size and the actions/ledger
// at a phone-sized window. Every image lands in artifacts/biome-seasonal/.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = resolve(root, "artifacts", "biome-seasonal");
await mkdir(outDir, { recursive: true });
const port = Number(process.env.E2E_PORT) || 4188;
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

async function dismissOverlays() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (state.activeEvent) state.activeEvent.dismissed = true;
        document.getElementById("realm-event-modal")?.classList.add("hidden");
        document.getElementById("event-notification")?.classList.add("hidden");
        document.getElementById("big-message")?.classList.add("hidden");
        document.getElementById("action-toast")?.classList.remove("is-visible");
        const placement = document.getElementById("placement-status");
        if (placement && !state.currentCard && !state.directBuildType) placement.classList.add("hidden");
    });
    await page.waitForTimeout(80);
}
async function shot(name, selector = null) {
    await dismissOverlays();
    const path = resolve(outDir, name + ".png");
    if (selector) await page.locator(selector).screenshot({ path, animations: "disabled" });
    else await page.screenshot({ path, animations: "disabled" });
    return path;
}
async function setView(level, x, y) {
    await page.evaluate(async ({ level, x, y }) => {
        const { state } = await import("./js/core/state.js");
        const { ZOOM_PRESETS } = await import("./js/core/zoom-model.js");
        const { clampCamera } = await import("./js/presentation/camera.js");
        const { CELL } = await import("./js/core/config.js");
        const { drawWorld } = await import("./js/presentation/rendering/renderer.js");
        const zoom = ZOOM_PRESETS[level - 1];
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomLevel = level;
        state.zoomAnchor = null;
        state.camera.x = x * CELL * zoom - state.canvas.width / 2;
        state.camera.y = y * CELL * zoom - state.canvas.height / 2;
        clampCamera();
        drawWorld();
    }, { level, x, y });
    await page.waitForTimeout(400);
}
async function setSeason(season) {
    await page.evaluate(async seasonIndex => {
        const { state } = await import("./js/core/state.js");
        const { drawWorld } = await import("./js/presentation/rendering/renderer.js");
        state.seasonIndex = seasonIndex;
        state.dayOfYear = seasonIndex * 100 + 40;
        state.year = 3;
        state.timeOfDay = 12;
        state.weather = "clear";
        drawWorld();
        const { renderUI } = await import("./js/presentation/rendering/ui.js");
        renderUI();
    }, season);
    await page.waitForTimeout(300);
}

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261119");
    await page.locator("#player-name-input").fill("Biome Seasons");
    // A varied realm is the player-facing review surface: savanna's warm
    // equatorial ground gives true desert, high ridges cross the rock line, and
    // the sea still supplies water/beach regions. Dense forest remains in the
    // wet lowlands so the atlas proves all four faces in one realm.
    await page.locator("#world-climate").selectOption("savanna");
    for (const [id, value] of [["world-mountains", "100"], ["world-ruggedness", "82"], ["world-aridity", "70"], ["world-water", "42"]]) {
        const slider = page.locator("#" + id);
        await slider.fill(value);
        await slider.dispatchEvent("input");
    }
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });
    for (const selector of ["#realm-event-dismiss", "#big-message-close"]) {
        const button = page.locator(selector);
        if (await button.isVisible().catch(() => false)) await button.click();
    }
    await page.waitForTimeout(200);
    const skip = page.locator("#skip-card-btn");
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.waitForTimeout(200);

    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        for (let x = 0; x < state.worldW; x++) {
            for (let y = 0; y < state.worldH; y++) state.explored[x][y] = true;
        }
        state.resources.gold = 1600;
        state.resources.wood = 500;
        const { syncBiomeDiscovery } = await import("./js/systems/biome-resource-state.js");
        syncBiomeDiscovery({ silent: true });
    });
    await page.waitForTimeout(300);

    const atlas = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const regions = state.biomeAtlas.regions.filter(region => region.discovered);
        const pick = biomes => regions.find(region => biomes.includes(region.rawBiome)) || null;
        const row = region => region && ({
            id: region.id, name: region.name, biome: region.rawBiome,
            x: region.centerX, y: region.centerY, width: region.width, height: region.height
        });
        const desertRegion = pick(["desert"]) || pick(["steppe"]);
        return {
            count: regions.length,
            coast: row(pick(["beach", "water", "swamp"])),
            mountain: row(pick(["rock", "snow", "taiga"])),
            desert: row(desertRegion),
            forest: row(pick(["forest", "dense-forest"])),
            center: { x: state.worldW / 2, y: state.worldH / 2 },
            world: { width: state.worldW, height: state.worldH },
            biomes: regions.map(region => [region.id, region.name, region.rawBiome])
        };
    });
    console.log("ATLAS " + JSON.stringify(atlas));

    await page.locator("#map-layer-select").selectOption("biomes");
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.mapLayer === "biomes", null, { timeout: 5000 });
    await page.waitForTimeout(400);

    // One wide crop per season, same camera. The image proves the map's
    // seasonal reading and the legibility of terrain, markers and the legend.
    await setView(1, atlas.center.x, atlas.center.y);
    for (const [index, name] of ["spring", "summer", "autumn", "winter"].entries()) {
        await setSeason(index);
        await shot("map-wide-" + name);
    }

    // Region close-ups with their biome tint in the foreground. Each image
    // also contains terrain edges and at least one marker or refuge so the
    // tint is judged against real map symbols, not a flat colour field.
    const views = [
        ["coast", atlas.coast, 0], ["mountain", atlas.mountain, 3],
        ["desert", atlas.desert, 1], ["forest", atlas.forest, 2]
    ].filter(([, region]) => region);
    for (const [name, region, season] of views) {
        await setSeason(season);
        await setView(2, region.x, region.y);
        await shot("region-" + name + "-" + ["spring", "summer", "autumn", "winter"][season]);
    }

    // A real city and its selection ring inside the seasonal wash. This is the
    // player check for "does the tint cover buildings or selection highlights?"
    if (atlas.desert) {
        const selected = await page.evaluate(async regionId => {
            const { state } = await import("./js/core/state.js");
            const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
            const candidates = state.entities.filter(entity => !entity.dead && entity.type !== "villager");
            const nearest = candidates.sort((a, b) =>
                Math.hypot(a.x - region.centerX, a.y - region.centerY) - Math.hypot(b.x - region.centerX, b.y - region.centerY))[0];
            if (!nearest) return null;
            state.selectedBuildingId = nearest.id;
            return { id: nearest.id, x: nearest.x, y: nearest.y, type: nearest.type };
        }, atlas.desert.id);
        if (selected) {
            await setSeason(2);
            await setView(2, selected.x, selected.y);
            await shot("region-city-selection-autumn");
            console.log("SELECTION " + JSON.stringify(selected));
        }
    }

    // A true seasonal comparison of one region removes the camera variable.
    if (atlas.forest) {
        await setView(2, atlas.forest.x, atlas.forest.y);
        for (const [index, name] of ["spring", "summer", "autumn", "winter"].entries()) {
            await setSeason(index);
            await shot("region-forest-" + name);
        }
    }

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    await page.locator('[data-command-tab="biome"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("DISCOVERED REGIONS"), null, { timeout: 20000 });
    await page.waitForTimeout(500);
    console.log("PANEL " + JSON.stringify(await page.evaluate(() => ({
        modalHidden: document.querySelector("#command-modal")?.classList.contains("hidden"),
        activeTab: document.querySelector("[data-command-tab].is-active")?.getAttribute("data-command-tab"),
        textLength: (document.querySelector("#command-panel-content")?.textContent || "").length,
        textStart: (document.querySelector("#command-panel-content")?.textContent || "").slice(0, 160)
    }))));

    const panelRegionId = atlas.desert?.id || atlas.coast?.id || atlas.forest?.id;
    const region = page.locator('[data-biome-region="' + panelRegionId + '"]');
    if (!(await region.evaluate(element => element.open))) await region.locator("summary").first().click();
    await page.waitForTimeout(300);
    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
    await shot("panel-region-top");

    await page.locator("#command-panel-content").evaluate((element, regionId) => {
        const regionNode = element.querySelector('[data-biome-region="' + regionId + '"]');
        const heading = regionNode && [...regionNode.querySelectorAll(".biome-system-readout")][0];
        if (heading) heading.scrollIntoView({ block: "start" });
    }, panelRegionId);
    await page.waitForTimeout(250);
    await shot("panel-system-readout");

    // The player must be able to trust that the panel's movement, harvest and
    // danger badges are the same values the simulation just computed. This is
    // not a canvas-only check: it reads the live module profile behind the DOM.
    const coupling = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { getCrossBiomeProfile } = await import("./js/systems/cross-biome-state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const profile = getCrossBiomeProfile(region);
        const node = document.querySelector('[data-biome-region="' + regionId + '"]');
        const badge = key => node?.querySelector('[data-biome-world-effect="' + key + '"]');
        const readout = id => node?.querySelector('[data-biome-requirement="1.2.21.' + id + '"]');
        const details = id => [...(node?.querySelectorAll('[data-biome-requirement="1.2.21.' + id + '"] small') || [])]
            .map(entry => entry.textContent || "");
        return {
            panelMovement: badge("movement")?.dataset.biomeWorldValue || null,
            panelHarvest: badge("agriculture")?.dataset.biomeWorldValue || null,
            panelHazard: badge("hazard")?.dataset.biomeWorldValue || null,
            panelWater: badge("water")?.dataset.biomeWorldValue || null,
            panelScarcity: badge("scarcity")?.dataset.biomeWorldValue || null,
            panelFloodplain: badge("floodplain")?.dataset.biomeWorldValue || null,
            panelFrost: badge("frost")?.dataset.biomeWorldValue || null,
            worldMovement: profile.ecology.movement,
            worldHarvest: profile.ecology.agricultureFactor,
            worldHazard: profile.ecology.pressure?.hazard || profile.ecology.hazards[0]?.id || "none",
            worldPressure: profile.ecology.pressure,
            movementReadout: readout("65")?.querySelector("strong")?.textContent || "",
            agricultureReadout: details("64").find(text => /harvest/i.test(text)) || "",
            floodplainReadout: details("23").join(" "),
            waterReadout: details("24").join(" "),
            scarcityReadout: details("26").join(" "),
            frostReadout: details("33").join(" "),
            waterLevelsReadout: details("34").join(" "),
            hazardReadout: readout("63")?.querySelector("strong")?.textContent || "",
            lastHazard: profile.ecology.lastHazard || null
        };
    }, panelRegionId);
    console.log("COUPLING " + JSON.stringify(coupling));
    assert.equal(coupling.panelMovement, coupling.worldMovement.toFixed(2),
        "the panel movement badge must equal the route/caravan multiplier");
    assert.equal(coupling.panelHarvest, coupling.worldHarvest.toFixed(2),
        "the panel harvest badge must equal the field-yield multiplier");
    assert.equal(coupling.panelHazard, coupling.worldHazard,
        "the panel danger badge must name the hazard the world can actually roll");
    assert.equal(coupling.panelWater, String(coupling.worldPressure.waterLevel),
        "the panel water badge must equal the pressure model's water level");
    assert.equal(coupling.panelScarcity, String(coupling.worldPressure.waterScarcity),
        "the panel scarcity badge must equal the pressure model's scarcity");
    assert.equal(coupling.panelFloodplain, String(coupling.worldPressure.floodplain),
        "the panel floodplain badge must equal the pressure model's exposure");
    assert.equal(coupling.panelFrost, String(coupling.worldPressure.frostRisk),
        "the panel frost badge must equal the pressure model's frost risk");
    assert.match(coupling.agricultureReadout, /harvest ×.*water\/frost ×/,
        "the agricultural readout must explain the real harvest pressure coupling");
    assert.match(coupling.floodplainReadout, /flood risk.*fields\/buildings exposed/i,
        "the floodplain readout must name the real field/building consequence");
    assert.match(coupling.waterReadout, /harvest ×/,
        "seasonal water must show its harvest multiplier");
    assert.match(coupling.scarcityReadout, /harvest ×/,
        "water scarcity must show its harvest multiplier");
    assert.match(coupling.frostReadout, /frost risk.*harvest ×/,
        "the frost line must show its frost risk and harvest multiplier");
    assert.match(coupling.waterLevelsReadout, /flood risk.*harvest ×/,
        "water levels must show flood risk and harvest pressure");
    assert.ok(coupling.movementReadout.includes(coupling.panelMovement + "×"),
        "the movement readout must show the same multiplier as the badge");
    if (coupling.lastHazard) {
        assert.match(coupling.hazardReadout, new RegExp(coupling.lastHazard.label, "i"),
            "a struck region must name its last regional hazard");
    }

    // 1.2.22 added a second, generation-specific ledger to the same region
    // card. Keep this audit on the 66-parameter ecology ledger; a bare class
    // selector now resolves to both and strict mode rejects the click.
    const ledger = page.locator('[data-biome-region="' + panelRegionId + '"] .biome-system-ledger')
        .filter({ hasText: "FULL ECOLOGY LEDGER" });
    await ledger.locator("summary").click();
    await page.waitForTimeout(250);
    await ledger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot("panel-ledger-desktop", "#command-modal");
    const ledgerStats = await page.evaluate(regionId => {
        const modal = document.querySelector("#command-modal");
        const regionNode = modal?.querySelector('[data-biome-region="' + regionId + '"]');
        const ledgerNode = [...(regionNode?.querySelectorAll(".biome-system-ledger") || [])]
            .find(node => (node.textContent || "").includes("FULL ECOLOGY LEDGER"));
        const rows = [...(ledgerNode?.querySelectorAll(".biome-system-row") || [])];
        const panel = document.querySelector("#command-panel-content");
        return {
            rows: rows.length,
            emptyValues: rows.filter(node => !(node.querySelector("strong")?.textContent || "").trim()).length,
            clippedRows: rows.filter(node => {
                const detail = node.querySelector("small");
                return detail && detail.scrollWidth > detail.clientWidth + 1;
            }).length,
            panelOverflowX: panel ? panel.scrollWidth - panel.clientWidth : null,
            modalOverflowX: modal ? modal.scrollWidth - modal.clientWidth : null,
            ledgerOpen: Boolean(ledgerNode?.open)
        };
    }, panelRegionId);
    console.log("LEDGER " + JSON.stringify(ledgerStats));

    const actions = page.locator('[data-biome-region="' + panelRegionId + '"] .biome-actions').first();
    await actions.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot("panel-actions-desktop", "#command-modal");
    const before = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { getBiomeAtlasSnapshot } = await import("./js/systems/biome-resource-state.js");
        const regionData = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const snapshot = getBiomeAtlasSnapshot().regions.find(entry => entry.id === regionId);
        const regionNode = document.querySelector('[data-biome-region="' + regionId + '"]');
        const panel = document.querySelector("#command-panel-content");
        const irrigationRow = regionNode && [...regionNode.querySelectorAll(".biome-system-row")]
            .find(node => (node.querySelector("b")?.textContent || "").trim() === "Irrigation");
        return {
            gold: state.resources.gold,
            irrigation: regionData.systems.landUse.irrigation,
            groundwater: snapshot.systems.water.groundwater,
            panelText: panel?.textContent || "",
            regionOpen: Boolean(regionNode?.open),
            ledgerOpen: Boolean(regionNode?.querySelector(".biome-system-ledger")?.open),
            scrollTop: panel?.scrollTop ?? null,
            irrigationText: irrigationRow?.textContent || ""
        };
    }, panelRegionId);
    const irrigate = page.locator('#command-panel-content [data-command="biome-irrigate"][data-value="' + panelRegionId + '"]');
    if (await irrigate.count()) {
        await irrigate.click();
        await page.waitForTimeout(700);
        await shot("panel-actions-after-irrigate", "#command-modal");
    }
    const after = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { getBiomeAtlasSnapshot } = await import("./js/systems/biome-resource-state.js");
        const regionData = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const snapshot = getBiomeAtlasSnapshot().regions.find(entry => entry.id === regionId);
        const regionNode = document.querySelector('[data-biome-region="' + regionId + '"]');
        const panel = document.querySelector("#command-panel-content");
        const irrigationRow = regionNode && [...regionNode.querySelectorAll(".biome-system-row")]
            .find(node => (node.querySelector("b")?.textContent || "").trim() === "Irrigation");
        return {
            gold: state.resources.gold,
            irrigation: regionData.systems.landUse.irrigation,
            groundwater: snapshot.systems.water.groundwater,
            panelText: panel?.textContent || "",
            regionOpen: Boolean(regionNode?.open),
            ledgerOpen: Boolean(regionNode?.querySelector(".biome-system-ledger")?.open),
            scrollTop: panel?.scrollTop ?? null,
            irrigationText: irrigationRow?.textContent || "",
            focusedCommand: document.activeElement?.dataset?.command || null
        };
    }, panelRegionId);
    assert.equal(after.regionOpen, true, "an action must leave the edited region open");
    assert.equal(after.ledgerOpen, true, "an action must leave the ecology ledger open");
    assert.ok(Math.abs(after.scrollTop - before.scrollTop) <= 2, "an action must preserve the panel scroll position");
    assert.match(after.irrigationText, /22%/, "the ledger must show the new irrigation value immediately");
    assert.equal(after.focusedCommand, "biome-irrigate", "keyboard focus must stay on the action after the update");
    console.log("AFTER_ACTION " + JSON.stringify({
        regionId: panelRegionId,
        goldSpent: before.gold - after.gold,
        irrigationBefore: before.irrigation,
        irrigationAfter: after.irrigation,
        groundwaterBefore: before.groundwater,
        groundwaterAfter: after.groundwater,
        panelChanged: before.panelText !== after.panelText,
        regionOpen: after.regionOpen,
        ledgerOpen: after.ledgerOpen,
        scrollDelta: after.scrollTop - before.scrollTop,
        irrigationText: after.irrigationText,
        focusedCommand: after.focusedCommand
    }));

    // Phone-sized player view. The command panel is the same surface a player
    // gets on a small tablet; both overflow and clipping are measured.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
    await page.waitForTimeout(250);
    await shot("panel-phone-top", "#command-modal");
    const phoneRegion = page.locator('[data-biome-region="' + panelRegionId + '"]');
    if (!(await phoneRegion.evaluate(element => element.open))) await phoneRegion.locator("summary").first().click();
    await page.waitForTimeout(250);
    const phoneActions = phoneRegion.locator(".biome-actions").first();
    await phoneActions.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot("panel-phone-actions", "#command-modal");
    const phoneLedger = phoneRegion.locator(".biome-system-ledger")
        .filter({ hasText: "FULL ECOLOGY LEDGER" });
    if (!(await phoneLedger.evaluate(element => element.open))) await phoneLedger.locator("summary").click();
    await page.waitForTimeout(250);
    await phoneLedger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot("panel-phone-ledger", "#command-modal");
    const smallStats = await page.evaluate(regionId => {
        const modal = document.querySelector("#command-modal");
        const panel = document.querySelector("#command-panel-content");
        const regionNode = modal?.querySelector('[data-biome-region="' + regionId + '"]');
        const rows = [...(regionNode?.querySelectorAll(".biome-system-row") || [])];
        const buttons = [...(regionNode?.querySelectorAll(".biome-actions button") || [])];
        const summary = regionNode?.querySelector("summary");
        return {
            viewport: { width: innerWidth, height: innerHeight },
            panelOverflowX: panel ? panel.scrollWidth - panel.clientWidth : null,
            modalOverflowX: modal ? modal.scrollWidth - modal.clientWidth : null,
            ledgerRows: rows.length,
            clippedLedgerDetails: rows.filter(node => {
                const detail = node.querySelector("small");
                return detail && detail.scrollWidth > detail.clientWidth + 1;
            }).length,
            clippedButtons: buttons.filter(button => button.scrollWidth > button.clientWidth + 1).length,
            summaryClipped: summary ? summary.scrollWidth > summary.clientWidth + 1 : null,
            actionsVisible: buttons.filter(button => button.getBoundingClientRect().width > 0).length,
            panelRect: panel ? { width: panel.getBoundingClientRect().width, right: panel.getBoundingClientRect().right } : null
        };
    }, panelRegionId);
    console.log("PHONE " + JSON.stringify(smallStats));
    assert.equal(smallStats.panelOverflowX, 0, "the biome panel must not overflow horizontally on a phone");
    assert.equal(smallStats.modalOverflowX, 0, "the management modal must not overflow on a phone");
    assert.equal(smallStats.clippedButtons, 0, "phone action buttons must not clip their labels");
    assert.ok(smallStats.actionsVisible >= 8, "all biome actions must remain reachable on a phone");

    // A real harvest in the dry panel region must produce the player-facing
    // pressure note, not only change a number. The control is temporary and
    // the realm is paused again immediately afterwards.
    const playerNote = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { spawnEntity } = await import("./js/world/entities.js");
        const { TYPE } = await import("./js/core/types.js");
        const { updateFields } = await import("./js/systems/fields.js");
        const { getCrossBiomeProfile } = await import("./js/systems/cross-biome-state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const previousSeason = state.seasonIndex;
        state.isPaused = false;
        state.gameOver = false;
        state.hasStarted = true;
        state.seasonIndex = 2;
        state.year = 33;
        const profile = getCrossBiomeProfile(region);
        const farm = spawnEntity(Math.floor(region.centerX), Math.floor(region.centerY), TYPE.FARM);
        farm.construction = { stage: 3 };
        farm.field = { stage: "ripe", growth: 100, fertility: 60, maxFertility: 100 };
        const farmer = spawnEntity(Math.floor(region.centerX) + 1, Math.floor(region.centerY), TYPE.VILLAGER);
        farmer.workplace = farm;
        farmer.job = "farmer";
        updateFields();
        state.isPaused = true;
        state.seasonIndex = previousSeason;
        return {
            note: state.eventLog.find(entry => /BIOME HARVEST/.test(entry.text))?.text || "",
            pressure: profile.ecology.pressure,
            harvestTotal: farm.field.harvestTotal
        };
    }, panelRegionId);
    console.log("PLAYER_NOTE " + JSON.stringify(playerNote));
    assert.ok(playerNote.pressure.waterScarcity > 55, "the message check needs a genuinely dry region");
    assert.ok(playerNote.harvestTotal > 0, "the temporary farm must actually harvest");
    assert.match(playerNote.note, /BIOME HARVEST · .*water scarcity.*LESS GRAIN/,
        "a dry harvest must produce the player-facing pressure note");
    // The sidebar EVENT LOG is the normal player path for this message. Close
    // the management overlay so the log is visible, then use its real tab.
    if (await page.locator("#command-modal").isVisible().catch(() => false)) {
        await page.locator("#command-close").click();
        await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 5000 });
    }
    await page.evaluate(() => document.getElementById("tab-0")?.click());
    await page.waitForFunction(() => (document.querySelector("#tab-content")?.textContent || "").includes("BIOME HARVEST"), null, { timeout: 5000 });
    const visibleNote = await page.locator("#tab-content").textContent();
    assert.match(visibleNote, /BIOME HARVEST · .*LESS GRAIN/,
        "the player event log must render the harvest pressure note");

    const final = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            version: document.querySelector("#version-label")?.textContent || null,
            season: state.seasonIndex,
            mapLayer: state.mapLayer,
            mapLegend: document.querySelector("#map-layer-legend")?.textContent || "",
            tintedRegions: (await import("./js/systems/biome-resource-state.js")).getBiomeOverlayCells().filter(cell => cell.seasonTint).length
        };
    });
    console.log("FINAL " + JSON.stringify(final));
    assert.equal(final.tintedRegions, 36, "every discovered region must carry a seasonal tint");
    assert.match(final.mapLegend, /WINTER SEASONAL FACE/, "the map legend must name the current season");
    assert.equal(atlas.desert?.biome, "desert", "the visual review needs a real desert region");
    assert.equal(ledgerStats.rows, 66, "the player ledger must render all 66 rows");
    assert.equal(ledgerStats.emptyValues, 0, "no ledger row may render an empty value");
    assert.equal(ledgerStats.clippedRows, 0, "no ledger detail may be clipped on desktop");

    // A mountain realm supplies the true rock/snow face that the warm savanna
    // atlas does not contain. The same real map layer and camera are used, so
    // the seasonal wash is judged on alpine terrain rather than a green field.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-climate").selectOption("mountain");
    await page.locator("#world-seed-input").fill("20261108");
    await page.locator("#player-name-input").fill("Mountain Seasons");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 60000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 30000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });
    for (const selector of ["#realm-event-dismiss", "#big-message-close"]) {
        const button = page.locator(selector);
        if (await button.isVisible().catch(() => false)) await button.click();
    }
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        for (let x = 0; x < state.worldW; x++) {
            for (let y = 0; y < state.worldH; y++) state.explored[x][y] = true;
        }
        const { syncBiomeDiscovery } = await import("./js/systems/biome-resource-state.js");
        syncBiomeDiscovery({ silent: true });
    });
    await page.waitForTimeout(300);
    const mountainAtlas = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const regions = state.biomeAtlas.regions.filter(region => region.discovered);
        const peak = regions.find(region => region.rawBiome === "snow") || regions.find(region => region.rawBiome === "rock");
        return {
            biomes: [...new Set(regions.map(region => region.rawBiome))],
            peak: peak && { id: peak.id, name: peak.name, biome: peak.rawBiome, x: peak.centerX, y: peak.centerY }
        };
    });
    console.log("MOUNTAIN_ATLAS " + JSON.stringify(mountainAtlas));
    assert.ok(mountainAtlas.peak && ["rock", "snow"].includes(mountainAtlas.peak.biome), "the review needs a real mountain peak region");
    await page.locator("#map-layer-select").selectOption("biomes");
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.mapLayer === "biomes", null, { timeout: 5000 });
    await page.waitForTimeout(300);
    if (mountainAtlas.peak) {
        for (const [index, name] of [[2, "autumn"], [3, "winter"]]) {
            await setSeason(index);
            await setView(2, mountainAtlas.peak.x, mountainAtlas.peak.y);
            await shot("region-mountain-" + name);
        }
    }
    assert.equal(pageErrors.length, 0, "the seasonal biome audit must be free of page errors");
    assert.equal(consoleErrors.length, 0, "the seasonal biome audit must be free of console errors");
    console.log(JSON.stringify({
        ok: true,
        outDir,
        pageErrors,
        consoleErrors,
        ledgerStats,
        smallStats,
        mountain: mountainAtlas
    }));
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
