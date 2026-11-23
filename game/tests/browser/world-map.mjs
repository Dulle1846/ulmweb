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

async function openPanel(page, panel, narrow = false) {
    const modal = page.locator("#command-modal");
    if (!(await modal.isVisible())) {
        await page.locator("#command-open-btn").click();
        await modal.waitFor({ state: "visible", timeout: 10000 });
    }
    if (narrow) await page.locator("#command-tab-select").selectOption(panel);
    else await page.locator('[data-command-tab="' + panel + '"]').click();
}

async function openKingdom(page, narrow = false) {
    await openPanel(page, "kingdom", narrow);
    await page.waitForFunction(() => {
        const panel = document.querySelector("#command-panel-content");
        return Boolean(panel && (panel.textContent || "").includes("THE WORLD BEYOND") &&
            (panel.textContent || "").includes("THE REALM AT A GLANCE"));
    }, null, { timeout: 20000 });
}

async function openWorld(page, narrow = false) {
    await openPanel(page, "worldmap", narrow);
    await page.waitForFunction(() => {
        const panel = document.querySelector("[data-world-map-panel]");
        // The narrow renderer hydrates the panel in bounded chunks; the world
        // record is the last section, so it proves the whole panel is mounted.
        return Boolean(panel && panel.querySelectorAll("[data-world-realm]").length === 4 &&
            (panel.textContent || "").includes("WORLD RECORD"));
    }, null, { timeout: 20000 });
    if (narrow) {
        assert.equal(await page.locator("#command-tab-select").inputValue(), "worldmap", "the narrow panel selector must show WORLD as the active panel");
    } else {
        await page.waitForFunction(() => document.querySelector('[data-command-tab="worldmap"]')?.getAttribute("aria-current") === "page", null, { timeout: 10000 });
    }
}

// Read the copy next to a section heading after scrolling it into the
// scrollport. Long ledgers use content-visibility:auto, so off-screen cards are
// intentionally not laid out until the player approaches them.
async function sectionCopy(page, title) {
    return page.evaluate(async headingText => {
        const heading = [...document.querySelectorAll("#command-panel-content .command-section-title")]
            .find(element => (element.textContent || "").trim().includes(headingText));
        if (!heading) return "";
        heading.scrollIntoView({ block: "start" });
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        return heading.nextElementSibling?.innerText || "";
    }, title);
}

// Measure page and panel overflow, plus any visible descendant whose content is
// wider than its box. Long archives use content-visibility:auto, so scroll every
// summary and card through the scrollport first, exactly as a player reads it.
// A real horizontal clip is a player-visible defect, not a rounding tolerance;
// the one-pixel allowance only covers sub-pixel layout.
async function layoutReport(page, selector) {
    return page.evaluate(async sel => {
        const panel = document.querySelector(sel);
        if (!panel) return { missing: true };
        const panelBox = panel.getBoundingClientRect();
        const ignoredTags = new Set(["SELECT", "OPTION", "INPUT", "TEXTAREA", "SCRIPT", "STYLE"]);
        const clipped = [];
        const seen = new Set();
        let panelOverflow = 0;
        let docOverflow = 0;
        let inspected = 0;
        const measure = root => {
            for (const element of [root, ...root.querySelectorAll("*")]) {
                if (seen.has(element)) continue;
                seen.add(element);
                if (element.closest("svg") || ignoredTags.has(element.tagName)) continue;
                const style = getComputedStyle(element);
                if (style.display === "none" || style.visibility === "hidden") continue;
                if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
                const box = element.getBoundingClientRect();
                if (!box.width && !box.height) continue;
                inspected += 1;
                const descriptor = {
                    tag: element.tagName,
                    className: String(element.className || "").slice(0, 70),
                    text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
                    scrollWidth: element.scrollWidth,
                    clientWidth: element.clientWidth
                };
                if (element.scrollWidth > element.clientWidth + 1) clipped.push(descriptor);
                else if (box.left < panelBox.left - 1 || box.right > Math.min(window.innerWidth, panelBox.right) + 1) {
                    clipped.push({ ...descriptor, outsidePanel: true });
                }
            }
        };
        const targets = [...panel.querySelectorAll(".command-summary, .world-map, .world-map__legend, .world-frontier, .world-route")];
        for (const target of targets) {
            target.scrollIntoView({ block: "center" });
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            panelOverflow = Math.max(panelOverflow, panel.scrollWidth - panel.clientWidth);
            docOverflow = Math.max(docOverflow, document.documentElement.scrollWidth - window.innerWidth);
            measure(target);
        }
        panel.scrollTop = 0;
        await new Promise(done => requestAnimationFrame(done));
        return {
            viewport: window.innerWidth,
            panelWidth: Math.round(panelBox.width * 100) / 100,
            docOverflow,
            panelOverflow,
            inspected,
            clipped: clipped.slice(0, 12)
        };
    }, selector);
}

function assertCleanLayout(report, label) {
    assert.ok(!report.missing, label + " must render its panel");
    assert.equal(report.docOverflow, 0, label + " must not overflow the page horizontally: " + JSON.stringify(report));
    assert.equal(report.panelOverflow, 0, label + " must not overflow its panel horizontally: " + JSON.stringify(report));
    assert.ok(report.panelWidth <= report.viewport, label + " must stay inside the viewport: " + JSON.stringify(report));
    assert.deepEqual(report.clipped, [], label + " must not clip any visible copy: " + JSON.stringify(report.clipped));
}

const errors = [];
try {
    const desktopContext = await browser.newContext({ viewport: { width: 1400, height: 960 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const desktop = await desktopContext.newPage();
    watch(desktop, "desktop", errors);
    await startRealm(desktop);

    await openKingdom(desktop);
    assert.equal(await desktop.locator("[data-command-tab]").count(), 28, "the desktop deck must expose all twenty-eight management tabs including WORLD");
    const worldTab = desktop.locator('[data-command-tab="worldmap"]');
    assert.equal((await worldTab.innerText()).trim(), "WORLD", "the WORLD tab must carry its complete label");
    assert.ok(await worldTab.isVisible(), "the WORLD tab must be reachable in the desktop deck");
    const kingdomText = await desktop.locator("#command-panel-content").textContent();
    assert.match(kingdomText, /THE WORLD BEYOND/, "the kingdom overview must expose the world section");
    assert.match(kingdomText, /Open WORLD in this deck/, "the kingdom overview must explain where the world map lives");
    assert.match(kingdomText, /raise the diplomacy border levy/, "the kingdom overview must explain the diplomatic consequence");
    assert.doesNotMatch(kingdomText, /undefined|NaN|Lorem ipsum|placeholder/i, "the kingdom overview must contain complete copy");
    const desktopWorldSummary = await sectionCopy(desktop, "THE WORLD BEYOND");
    assert.match(desktopWorldSummary, /STANDING ROUTES\s+0 \/ 6/, "the kingdom overview must visibly name the standing-route limit");
    assert.match(desktopWorldSummary, /GOODS MOVED\s+0/, "the kingdom overview must visibly report moved goods");
    assert.match(desktopWorldSummary, /FRONTIER PRESSURE\s+\d+ PRESSED/, "the kingdom overview must visibly report pressed frontiers");
    assert.match(desktopWorldSummary, /BORDER INCIDENTS\s+\d+/, "the kingdom overview must visibly report border incidents");
    const kingdomDesktop = await layoutReport(desktop, "#command-panel-content");
    assertCleanLayout(kingdomDesktop, "kingdom overview at 1400x960");
    await desktop.screenshot({ path: resolve(outDir, "kingdom-desktop.png"), animations: "disabled" });
    await openWorld(desktop);

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
    const worldDesktop = await layoutReport(desktop, "#command-panel-content");
    assertCleanLayout(worldDesktop, "world map at 1400x960");
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
    await openKingdom(narrow, true);
    assert.equal(await narrow.locator("#command-tab-select option").count(), 28, "the narrow selector must expose all twenty-eight management tabs including WORLD");
    assert.equal((await narrow.locator('#command-tab-select option[value="worldmap"]').innerText()).trim(), "WORLD", "the narrow WORLD option must carry its complete label");
    const narrowKingdomText = await narrow.locator("#command-panel-content").textContent();
    assert.match(narrowKingdomText, /THE WORLD BEYOND/, "the narrow kingdom overview must expose the world section");
    assert.match(narrowKingdomText, /Open WORLD in this deck/);
    assert.doesNotMatch(narrowKingdomText, /undefined|NaN|Lorem ipsum|placeholder/i, "the narrow kingdom overview must contain complete copy");
    const narrowWorldSummary = await sectionCopy(narrow, "THE WORLD BEYOND");
    assert.match(narrowWorldSummary, /STANDING ROUTES\s+0 \/ 6/);
    assert.match(narrowWorldSummary, /GOODS MOVED\s+0/);
    assert.match(narrowWorldSummary, /FRONTIER PRESSURE\s+\d+ PRESSED/);
    assert.match(narrowWorldSummary, /BORDER INCIDENTS\s+\d+/);
    const kingdomNarrow = await layoutReport(narrow, "#command-panel-content");
    assertCleanLayout(kingdomNarrow, "kingdom overview at 390 px");
    await narrow.screenshot({ path: resolve(outDir, "kingdom-narrow.png"), animations: "disabled" });
    await openWorld(narrow, true);
    const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.equal(overflow, 0, "the world map panel must not create horizontal page overflow at 390 px");
    const worldLayout = await layoutReport(narrow, "#command-panel-content");
    assertCleanLayout(worldLayout, "world map at 390 px");
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
        layout: {
            desktopKingdom: kingdomDesktop,
            desktopWorld: worldDesktop,
            narrowKingdom: kingdomNarrow,
            narrowWorld: worldLayout
        },
        narrowOverflow: overflow,
        errors
    }, null, 2));
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
