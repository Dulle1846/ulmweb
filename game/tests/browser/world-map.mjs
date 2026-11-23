// Player reference for 4.0.2: world map, standing trade routes and frontiers.
//
// The test starts a real realm from the start screen, opens the WORLD panel
// through the normal management deck, charters a route with the real selects
// and button, raises a frontier watch, advances the annual world survey, then
// saves and reloads the realm. It repeats the panel reading at 390 px. It never
// injects a route or a frontier into state directly.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4192;
const outDir = resolve(root, "artifacts", "world-map");
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
    page.on("console", message => {
        if (message.type() === "error") errors.push(label + " console: " + message.text());
    });
}

async function startRealm(page) {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#start-new-game-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 60000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 10000 });
}

async function openWorld(page, narrow = false) {
    await page.locator("#command-open-btn").click();
    await page.locator("#command-modal").waitFor({ state: "visible", timeout: 10000 });
    if (narrow) await page.locator("#command-tab-select").selectOption("worldmap");
    else await page.locator('[data-command-tab="worldmap"]').click();
    await page.waitForFunction(() => {
        const panel = document.querySelector("[data-world-map-panel]");
        // The narrow renderer hydrates the panel in bounded chunks; the world
        // record is the last section, so it proves the whole panel is mounted.
        return Boolean(panel && panel.querySelectorAll("[data-world-realm]").length === 4 &&
            (panel.textContent || "").includes("WORLD RECORD"));
    }, null, { timeout: 20000 });
}

const errors = [];
try {
    const desktopContext = await browser.newContext({ viewport: { width: 1400, height: 960 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const desktop = await desktopContext.newPage();
    watch(desktop, "desktop", errors);
    await startRealm(desktop);

    const initial = await desktop.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getSettlementSeats } = await import("./js/systems/settlement-owners.js");
        return {
            seats: getSettlementSeats().map(seat => ({ id: seat.buildingId, name: seat.name, wood: seat.stores.wood })),
            gold: state.resources.gold,
            wood: state.resources.wood,
            partnerStock: state.market.partners.find(row => row.id === "northmere")?.stock.wood,
            year: state.year
        };
    });
    assert.ok(initial.seats.length >= 1, "a started realm exposes at least one settlement seat");
    assert.ok(initial.gold >= 15 && initial.wood >= 8, "the opening realm can afford a charter");

    await openWorld(desktop);
    const panel = desktop.locator("[data-world-map-panel]");
    const panelText = await panel.innerText();
    assert.match(panelText, /World map, trade routes & frontiers/);
    assert.match(panelText, /FRONTIERS ·/);
    assert.match(panelText, /STANDING CARAVANS · 0 \/ 6/);
    assert.match(panelText, /Beyond the realm/i);
    assert.match(panelText, /SCHEMATIC/);
    assert.doesNotMatch(panelText, /undefined|NaN|Lorem ipsum|placeholder/i);
    assert.equal(await desktop.locator(".world-map__realm").count(), 4, "all four neighbouring regions are on the map");
    assert.equal(await desktop.locator(".world-map__seat").count(), initial.seats.length, "the real settlement seats are on the map");

    const northmere = desktop.locator('[data-world-realm="northmere"]');
    const seatValue = await northmere.locator("#world-seat-northmere option").first().getAttribute("value");
    await northmere.locator("#world-seat-northmere").selectOption(seatValue);
    await northmere.locator("#world-resource-northmere").selectOption("wood");
    await northmere.locator("#world-direction-northmere").selectOption("import");
    await northmere.locator('[data-command="world-route-open"]').click();
    await desktop.waitForFunction(() => document.querySelectorAll("[data-world-route]").length === 1, null, { timeout: 10000 });
    assert.match(await desktop.locator("[data-world-route]").innerText(), /IMPORT · WOOD · NORTHERN MARCHES/);

    const redpassPin = desktop.locator('[data-world-realm="redpass"] [data-command="world-watch"][data-level="1"]');
    await redpassPin.click();
    await desktop.waitForFunction(() => {
        const pin = document.querySelector('[data-world-realm="redpass"] [data-command="world-watch"][data-level="1"]');
        return Boolean(pin && pin.classList.contains("is-current"));
    }, null, { timeout: 10000 });

    const chartered = await desktop.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getSettlementSeats } = await import("./js/systems/settlement-owners.js");
        const { getWorldMapSnapshot } = await import("./js/systems/world-map.js");
        const snapshot = getWorldMapSnapshot();
        return {
            routes: snapshot.routes.map(route => ({ id: route.id, status: route.status, seat: route.seatName })),
            watch: snapshot.realms.find(row => row.id === "redpass")?.watch,
            redpassPressure: snapshot.realms.find(row => row.id === "redpass")?.pressure,
            gold: state.resources.gold,
            seatStores: getSettlementSeats()[0]?.stores.wood,
            partnerStock: state.market.partners.find(row => row.id === "northmere")?.stock.wood
        };
    });
    assert.equal(chartered.routes.length, 1);
    assert.equal(chartered.routes[0].status, "open");
    assert.equal(chartered.watch, 1, "the watch level is real saved state");
    assert.ok(chartered.gold < initial.gold, "the charter and the watch were paid from the crown treasury");

    // Advance the annual survey through the same system the year boundary runs.
    const settled = await desktop.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getWorldMapSnapshot, updateWorldMap } = await import("./js/systems/world-map.js");
        const { getSettlementSeats } = await import("./js/systems/settlement-owners.js");
        const before = getWorldMapSnapshot();
        state.year += 1;
        state.dayOfYear = 0;
        const after = updateWorldMap();
        const partner = state.market.partners.find(row => row.id === "northmere");
        return {
            route: after.routes[0],
            seatStores: getSettlementSeats()[0]?.stores.wood,
            partnerStock: partner?.stock.wood,
            realm: state.diplomacy.realms.find(row => row.id === "northmere"),
            beforePressure: before.realms.find(row => row.id === "northmere")?.pressure,
            afterPressure: after.realms.find(row => row.id === "northmere")?.pressure
        };
    });
    assert.equal(settled.route.delivered, 6, "the annual caravan moved six wood");
    assert.match(settled.route.lastResult, /Unloaded 6 wood/);
    assert.ok(settled.seatStores >= 6, "the goods reached the settlement depot");
    assert.ok(settled.partnerStock < initial.partnerStock, "the partner stock fell by the caravan load");
    assert.ok(settled.realm.tradeVolume >= 6, "the diplomatic realm record saw the trade");
    assert.equal(settled.realm.lastTradeYear, initial.year + 1);

    await desktop.locator('[data-command-tab="worldmap"]').click();
    await desktop.waitForFunction(() => (document.querySelector("[data-world-route]")?.textContent || "").includes("Unloaded 6 wood"), null, { timeout: 10000 });
    const routeCard = await desktop.locator("[data-world-route]").innerText();
    assert.match(routeCard, /DELIVERED/);
    assert.match(routeCard, /6/);
    assert.match(routeCard, /CARAVAN READY/);
    assert.equal(await desktop.locator(".world-map__route").count(), 1, "the map draws the standing caravan");
    await desktop.screenshot({ path: resolve(outDir, "desktop.png"), animations: "disabled" });
    await panel.scrollIntoViewIfNeeded();
    await desktop.locator(".world-map").screenshot({ path: resolve(outDir, "map-desktop.png"), animations: "disabled" });

    await desktop.locator("#command-close").click();
    await desktop.locator("#save-btn").click();
    await desktop.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").includes("SAVED"), null, { timeout: 15000 });
    await desktop.reload({ waitUntil: "domcontentloaded" });
    await desktop.locator("#start-screen").waitFor({ state: "visible", timeout: 15000 });
    await desktop.waitForFunction(() => !document.querySelector("#continue-game-btn")?.disabled, null, { timeout: 10000 });
    await desktop.locator("#continue-game-btn").click();
    await desktop.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 60000 });
    await desktop.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await openWorld(desktop);
    const restored = await desktop.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getWorldMapSnapshot } = await import("./js/systems/world-map.js");
        const snapshot = getWorldMapSnapshot();
        return {
            routes: snapshot.routes.map(route => ({ id: route.id, delivered: route.delivered })),
            watch: snapshot.realms.find(row => row.id === "redpass")?.watch,
            incidents: snapshot.realms.find(row => row.id === "redpass")?.incidents,
            panel: document.querySelector("[data-world-map-panel]")?.textContent || ""
        };
    });
    assert.equal(restored.routes.length, 1, "the route survives save and reload");
    assert.equal(restored.routes[0].delivered, 6);
    assert.equal(restored.watch, 1, "the frontier watch survives save and reload");
    assert.match(restored.panel, /Unloaded 6 wood/, "the saved caravan result is shown after reload");
    assert.match(restored.panel, /FRONTIER WATCH/);
    await desktop.locator(".world-map").screenshot({ path: resolve(outDir, "map-restored.png"), animations: "disabled" });

    const narrowContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const narrow = await narrowContext.newPage();
    watch(narrow, "narrow", errors);
    await startRealm(narrow);
    await openWorld(narrow, true);
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, "the world map panel must not create horizontal page overflow at 390 px");
    const panelBox = await narrow.locator("[data-world-map-panel]").boundingBox();
    assert.ok(panelBox && panelBox.width <= 390, "the narrow world map panel must stay inside the viewport");
    const canvasBox = await narrow.locator(".world-map__canvas").boundingBox();
    assert.ok(canvasBox && canvasBox.width <= 390, "the schematic map must scale to the narrow viewport");
    const narrowText = await narrow.locator("[data-world-map-panel]").innerText();
    assert.doesNotMatch(narrowText, /undefined|NaN|Lorem ipsum|placeholder/i);
    assert.match(narrowText, /STANDING CARAVANS/);
    assert.equal(await narrow.locator("[data-world-realm]").count(), 4);
    await narrow.screenshot({ path: resolve(outDir, "narrow.png"), animations: "disabled" });
    await narrow.locator(".world-map").scrollIntoViewIfNeeded();
    await narrow.locator(".world-map").screenshot({ path: resolve(outDir, "map-narrow.png"), animations: "disabled" });

    assert.deepEqual(errors, [], "the real browser session must have no page or console errors");
    console.log(JSON.stringify({
        ok: true,
        seats: initial.seats.map(seat => seat.name),
        route: { id: chartered.routes[0].id, status: chartered.routes[0].status, seat: chartered.routes[0].seat },
        settled: { delivered: settled.route.delivered, seatStores: settled.seatStores, partnerStock: settled.partnerStock, tradeVolume: settled.realm.tradeVolume },
        restored: { routes: restored.routes.length, watch: restored.watch, incidents: restored.incidents },
        narrowOverflow: overflow,
        errors
    }, null, 2));
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
