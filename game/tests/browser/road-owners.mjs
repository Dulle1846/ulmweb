// Player-seat proof for settlement-owned road maintenance.
//
// The player starts a realm, builds a Town Hall through the normal civic menu,
// waits for it to complete, lays roads near both seats, and lets the annual
// surveys wear them. The Roads panel must name both settlements and their
// separate bills, show the settlement that cannot cover its road, keep that
// road worn after a repair, and move each seat's own stores by the quoted
// amount. Save/reload must preserve the split and the balances.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4194;
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
        if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end("Forbidden"); return; }
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch { res.writeHead(404, { "content-type": "text/plain" }).end("Not found"); }
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
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

async function gotoWithRetry(url) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); return; }
        catch (error) {
            if (attempt === 3) throw error;
            console.error("load attempt " + attempt + " failed: " + error.message.split("\n")[0]);
            await page.waitForTimeout(4000);
        }
    }
}
const runFor = ms => page.clock.runFor(ms);
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
async function pause() {
    if ((await page.locator("#pause-btn").innerText()).trim() === "PAUSE") await page.locator("#pause-btn").click();
}
async function resume() {
    if ((await page.locator("#pause-btn").innerText()).trim() === "RESUME") await page.locator("#pause-btn").click();
}

async function realmSummary() {
    return page.evaluate(async () => {
        const [{ state }, roads, owners] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/roads.js"),
            import("./js/systems/settlement-owners.js")
        ]);
        const keep = state.entities.find(entity => !entity.dead && entity.type === 0);
        const hall = state.entities.find(entity => !entity.dead && entity.type === 73);
        return {
            year: state.year, tick: state.tick,
            keep: keep ? { id: keep.id, x: keep.x, y: keep.y } : null,
            hall: hall ? { id: hall.id, x: hall.x, y: hall.y, stage: hall.construction?.stage ?? 3, reason: hall.construction?.reason ?? "COMPLETE", progress: hall.construction?.progress ?? 100, delivered: hall.construction?.delivered ?? null } : null,

            roads: roads.getRoadCount(),
            seats: owners.getSettlementSeats().map(seat => ({ id: seat.id, name: seat.name, x: seat.x, y: seat.y, stores: { ...seat.stores }, treasury: { ...seat.treasury } })),
            resources: { ...state.resources }
        };
    });
}

async function panelState() {
    return page.evaluate(async () => {
        const [{ state }, roads, owners] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/roads.js"),
            import("./js/systems/settlement-owners.js")
        ]);
        const snapshot = roads.getRoadConditionSnapshot();
        return {
            year: state.year,
            average: snapshot.average,
            worn: snapshot.worn,
            panels: {
                text: document.querySelector(".road-condition")?.textContent?.replace(/\s+/g, " ").trim() || "",
                button: document.querySelector("[data-repair-roads]")?.textContent?.trim() || "",
                disabled: document.querySelector("[data-repair-roads]")?.disabled ?? null,
                owners: [...document.querySelectorAll(".road-owner")].map(row => ({
                    id: row.dataset.roadOwner,
                    text: row.textContent.replace(/\s+/g, " ").trim(),
                    short: row.classList.contains("is-short")
                }))
            },
            owners: snapshot.settlements,
            wilderness: snapshot.wilderness,
            obligation: snapshot.obligation,
            seats: owners.getSettlementSeats().map(seat => ({
                id: seat.id, name: seat.name,
                stores: { ...seat.stores }, treasury: { ...seat.treasury },
                lastRepair: seat.lastRepair ? JSON.parse(JSON.stringify(seat.lastRepair)) : null
            })),
            resources: { ...state.resources }
        };
    });
}

async function roadConditions(tiles) {
    return page.evaluate(async ({ tiles }) => {
        const roads = await import("./js/systems/roads.js");
        return tiles.map(tile => ({ ...tile, condition: roads.getRoadAt(tile.x, tile.y)?.condition ?? null }));
    }, { tiles });
}

async function findBuildSpot(type) {
    return page.evaluate(async ({ type }) => {
        const [{ state }, { canPlaceBuilding }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/construction.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        const keep = state.entities.find(entity => !entity.dead && entity.type === 0);
        const cx = keep ? keep.x : Math.floor((state.worldW || 160) / 2);
        const cy = keep ? keep.y : Math.floor((state.worldH || 160) / 2);
        for (let radius = 6; radius < 26; radius++) {
            for (let x = cx + radius; x >= cx - radius; x--) {
                for (let y = cy - radius; y <= cy + radius; y++) {
                    if (Math.abs(x - cx) < 10 || x < 0 || y < 0 || x >= (state.worldW || 160) || y >= (state.worldH || 160)) continue;
                    if (!state.explored?.[x]?.[y] || !canPlaceBuilding(type, x, y).ok) continue;
                    const screenX = ((x + .5) * 48 * state.zoom - state.camera.x) / (state.renderScale || 1) + rect.left;
                    const screenY = ((y + .5) * 48 * state.zoom - state.camera.y) / (state.renderScale || 1) + rect.top;
                    if (screenX < rect.left + 8 || screenX > rect.right - 8 || screenY < rect.top + 8 || screenY > rect.bottom - 8) continue;
                    if (document.elementFromPoint(screenX, screenY)?.id !== "canvas") continue;
                    return { x, y, screenX, screenY, hit: document.elementFromPoint(screenX, screenY)?.id || document.elementFromPoint(screenX, screenY)?.tagName || null };
                }
            }
        }
        throw new Error("No visible legal site for building " + type);
    }, { type });
}

async function builtRoadTiles(keepSeat, hallSeat) {
    return page.evaluate(async ({ keepSeat, hallSeat }) => {
        const roads = await import("./js/systems/roads.js");
        const distance = (tile, seat) => Math.hypot(tile.x - seat.x, tile.y - seat.y);
        const tiles = roads.getRoadTiles();
        const keep = tiles.filter(tile => distance(tile, keepSeat) <= distance(tile, hallSeat))
            .sort((a, b) => distance(a, keepSeat) - distance(b, keepSeat));
        const hall = tiles.filter(tile => distance(tile, hallSeat) < distance(tile, keepSeat))
            .sort((a, b) => distance(a, hallSeat) - distance(b, hallSeat));
        return { keep: keep.slice(0, 1), hall: hall.slice(0, 10), total: tiles.length };
    }, { keepSeat, hallSeat });
}

async function findRoadTiles(centerX, centerY, count, maxDistance = 10) {
    return page.evaluate(async ({ centerX, centerY, count, maxDistance }) => {
        const [{ state }, { isWaterAt }, roads, { BUILDING_SIZE }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/world/world.js"),
            import("./js/systems/roads.js"),
            import("./js/core/config.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        const found = [];
        for (let radius = 1; radius < 16 && found.length < count; radius++) {
            for (let x = centerX - radius; x <= centerX + radius && found.length < count; x++) {
                for (let y = centerY - radius; y <= centerY + radius && found.length < count; y++) {
                    if (x < 0 || y < 0 || x >= (state.worldW || 160) || y >= (state.worldH || 160)) continue;
                    if (!state.explored?.[x]?.[y] || isWaterAt(x + .5, y + .5) || roads.getRoadAt(x, y)) continue;
                    if (Math.hypot(x - centerX, y - centerY) > maxDistance) continue;
                    const occupied = state.entities.some(entity => {
                        if (entity.dead || !entity.isBuilding?.()) return false;
                        const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
                        const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
                        const halfW = base.w * scale / 2, halfH = base.h * scale / 2;
                        return x + .5 >= entity.x + .5 - halfW && x + .5 < entity.x + .5 + halfW &&
                            y + .5 >= entity.y + .5 - halfH && y + .5 < entity.y + .5 + halfH;
                    });
                    if (occupied) continue;
                    const screenX = ((x + .5) * 48 * state.zoom - state.camera.x) / (state.renderScale || 1) + rect.left;
                    const screenY = ((y + .5) * 48 * state.zoom - state.camera.y) / (state.renderScale || 1) + rect.top;
                    if (screenX < rect.left + 8 || screenX > rect.right - 8 || screenY < rect.top + 8 || screenY > rect.bottom - 8) continue;
                    if (document.elementFromPoint(screenX, screenY)?.id !== "canvas") continue;
                    found.push({ x, y, screenX, screenY });
                }
            }
        }
        return found;
    }, { centerX, centerY, count, maxDistance });
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
    await page.locator("#player-name-input").fill("Road Steward");
    await page.locator("#start-new-game-btn").click();
    for (let attempt = 0; attempt < 40 && !(await hasStarted()); attempt++) await runFor(250);
    assert.equal(await hasStarted(), true, "the visible founding button must start a realm");
    await runFor(700);
    await dismissBigMessage();

    // The starting keep is already a maintenance seat.
    let summary = await realmSummary();
    assert.ok(summary.keep, "the realm must start with a keep");
    assert.equal(summary.seats.length, 1, "the opening keep must own the first settlement seat");
    assert.equal(summary.seats[0].name, "Crown Keep");

    // Found a second settlement through the normal civic build menu.
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="civic"]').click();
    assert.equal(await page.locator('[data-build-type="73"]').count(), 1, "the civic menu must offer a Town Hall");
    await page.locator('[data-build-type="73"]').click();
    const hallSpot = await findBuildSpot(73);
    await page.mouse.click(hallSpot.screenX, hallSpot.screenY);
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.entities.some(entity => !entity.dead && entity.type === 73 && entity.construction && Number(entity.construction.stage) < 3);
    }, null, { timeout: 8000 });
    await page.keyboard.press("Escape");
    await page.locator("#speed-4").click();
    await resume();
    let completed = false;
    let hallChunks = 0;
    for (; hallChunks < 30; hallChunks++) {
        const hall = (await realmSummary()).hall;
        if (hall && Number(hall.stage) >= 3) { completed = true; break; }
        await runFor(20000);
        await runFor(240);
        await settleEvent();
        await dismissBigMessage();
    }
    assert.equal(completed, true, "the Town Hall must finish construction through normal deliveries and builder labour");
    summary = await realmSummary();
    assert.equal(summary.seats.length, 2, "the completed Town Hall must become a second settlement seat");
    const hallSeat = summary.seats.find(seat => seat.id.includes(summary.hall.id));
    const keepSeat = summary.seats.find(seat => seat.id.includes(summary.keep.id));
    assert.ok(hallSeat && keepSeat, "both seats must expose stable building ids");
    assert.equal(hallSeat.name, "Northgate");

    // Lay one road by the keep and ten by the new settlement.
    await pause();
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    await page.locator('[data-road-type="dirt"]').click();
    await resume();
    const ownedBy = (tile, seat, other) => Math.hypot(tile.x - seat.x, tile.y - seat.y) < Math.hypot(tile.x - other.x, tile.y - other.y);
    const keepCandidates = (await findRoadTiles(summary.keep.x, summary.keep.y + 6, 4, 4))
        .filter(tile => ownedBy(tile, summary.keep, hallSeat));
    const hallCandidates = (await findRoadTiles(hallSeat.x, hallSeat.y, 24, 10))
        .filter(tile => ownedBy(tile, hallSeat, summary.keep));
    assert.ok(keepCandidates.length >= 1, "a visible legal road tile must exist beside the keep");
    assert.ok(hallCandidates.length >= 10, "ten visible legal road tiles must exist beside the new settlement");
    const roadCount = async () => page.evaluate(async () => (await import("./js/systems/roads.js")).getRoadCount());
    const clickCandidates = async (candidates, target) => {
        for (const tile of candidates) {
            if (await roadCount() >= target) return;
            const reachable = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id === "canvas", { x: tile.screenX, y: tile.screenY });
            if (!reachable) { await runFor(500); await dismissBigMessage(); continue; }
            await page.mouse.click(tile.screenX, tile.screenY);
            await runFor(300);
            await dismissBigMessage();
        }
    };
    await clickCandidates(keepCandidates, 1);
    await clickCandidates(hallCandidates, 11);
    const built = await builtRoadTiles(summary.keep, hallSeat);
    const keepRoads = built.keep, hallRoads = built.hall;
    assert.ok(built.total >= 11, "the player's clicks must build the road network (built " + built.total + ")");
    assert.equal(keepRoads.length, 1, "the keep must own a built road");
    assert.equal(hallRoads.length, 10, "the new settlement must own ten built roads");
    await pause();
    await page.keyboard.press("Escape");
    await page.locator("#settings-btn").click();
    await page.locator("#settings-frame-limit").selectOption("30");
    await page.locator("#settings-render-scale").selectOption("25");
    await page.locator("#settings-close").click();

    // Two annual surveys after the roads exist must wear tiles in both
    // territories. The target year is relative so late construction cannot
    // shorten the proof.
    const startYear = (await realmSummary()).year;
    const targetYear = startYear + 2;
    await page.locator("#speed-4").click();
    await resume();
    let current = await realmSummary();
    let chunks = 0;
    while (current.year < targetYear && chunks < 16) {
        await runFor(20000);
        await runFor(240);
        await settleEvent();
        await dismissBigMessage();
        current = await realmSummary();
        chunks++;
        console.log("advance " + chunks + " · year " + current.year + " · roads " + current.roads);
    }
    assert.ok(current.year >= targetYear, "two annual surveys must run after the roads (year " + current.year + ")");
    await pause();
    const keepConditions = await roadConditions(keepRoads);
    const hallConditions = await roadConditions(hallRoads);
    assert.ok(keepConditions[0].condition < 95, "the keep road must be worn");
    assert.ok(hallConditions.every(tile => tile.condition < 95), "every new-settlement road must be worn");

    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const beforeRepair = await panelState();
    console.log("owners before repair", JSON.stringify({ owners: beforeRepair.owners, seats: beforeRepair.seats, button: beforeRepair.panels.button }));
    assert.match(beforeRepair.panels.text, /MAINTENANCE BY OWNER/, "the panel must show the per-owner split");
    assert.match(beforeRepair.panels.text, /Crown Keep/);
    assert.match(beforeRepair.panels.text, /Northgate/);
    const keepRow = beforeRepair.owners.find(row => row.name === "Crown Keep");
    const hallRow = beforeRepair.owners.find(row => row.name === "Northgate");
    assert.ok(keepRow && hallRow, "both settlements must appear as owners");
    assert.equal(keepRow.worn, 1);
    assert.equal(hallRow.worn, 10);
    assert.equal(keepRow.affordable, true, "the keep's single road must be covered by its stores");
    assert.equal(hallRow.affordable, false, "the new settlement's ten worn roads must exceed its stores");
    assert.ok(hallRow.shortfall.wood > 0, "the panel must quote the shortfall");
    assert.deepEqual(beforeRepair.obligation.shortSeats, ["Northgate"]);
    assert.match(beforeRepair.panels.text, /SHORT/);
    assert.equal(beforeRepair.panels.disabled, false, "the affordable half must still offer a repair");
    assert.match(beforeRepair.panels.button, /REPAIR/);
    await dismissBigMessage();
    await page.screenshot({ path: artifact("road-owners-shortfall.png"), fullPage: false });

    // Save the split, reload, and compare the owners and exact balances.
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
    await pause();
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const restored = await panelState();
    assert.deepEqual(restored.owners.map(row => ({ name: row.name, worn: row.worn, cost: row.cost, affordable: row.affordable, shortfall: row.shortfall })), beforeRepair.owners.map(row => ({ name: row.name, worn: row.worn, cost: row.cost, affordable: row.affordable, shortfall: row.shortfall })), "save/reload must preserve the per-owner split");
    assert.deepEqual(restored.seats, beforeRepair.seats, "save/reload must preserve every seat balance");
    assert.equal((await roadConditions(keepRoads))[0].condition, keepConditions[0].condition);
    assert.deepEqual((await roadConditions(hallRoads)).map(tile => tile.condition), hallConditions.map(tile => tile.condition));

    // Repair what is affordable. The keep pays from its own stores; Northgate
    // stays worn and its stores stay untouched.
    const beforeRepairRoads = await roadConditions([...keepRoads, ...hallRoads]);
    const keepSeatBefore = restored.seats.find(seat => seat.id === keepSeat.id);
    const hallSeatBefore = restored.seats.find(seat => seat.id === hallSeat.id);
    await page.locator("[data-repair-roads]").click();
    await runFor(120);
    const repaired = await panelState();
    const afterRepairRoads = await roadConditions([...keepRoads, ...hallRoads]);
    const keepSeatAfter = repaired.seats.find(seat => seat.id === keepSeat.id);
    const hallSeatAfter = repaired.seats.find(seat => seat.id === hallSeat.id);
    console.log("owners after repair", JSON.stringify({ owners: repaired.owners, seats: repaired.seats, button: repaired.panels.button }));
    assert.equal(afterRepairRoads[0].condition, 100, "the covered settlement's road must be repaired");
    for (const tile of afterRepairRoads.slice(1)) assert.ok(tile.condition < 100, "the short settlement's roads must stay worn");
    assert.ok(Math.abs((keepSeatBefore.stores.wood - keepRow.cost.wood) - keepSeatAfter.stores.wood) < 1e-5, "the keep must pay exactly its quoted wood bill");
    assert.ok(Math.abs((keepSeatBefore.stores.stone - keepRow.cost.stone) - keepSeatAfter.stores.stone) < 1e-5, "the keep must pay exactly its quoted stone bill");
    assert.ok(Math.abs((keepSeatBefore.treasury.gold - keepRow.cost.gold) - keepSeatAfter.treasury.gold) < 1e-5, "the keep must pay exactly its quoted gold bill");
    assert.deepEqual(hallSeatAfter.stores, hallSeatBefore.stores, "the short settlement's stores must not be spent");
    assert.deepEqual(hallSeatAfter.treasury, hallSeatBefore.treasury);
    assert.deepEqual(repaired.obligation.shortSeats, ["Northgate"]);
    assert.equal(repaired.panels.disabled, true, "no affordable owner remains after the covered half is repaired");
    assert.match(repaired.panels.text, /SHORT/);
    assert.ok(repaired.seats.find(seat => seat.id === keepSeat.id).lastRepair, "the repaired seat must record its own last repair");
    assert.equal(repaired.seats.find(seat => seat.id === hallSeat.id).lastRepair, null, "the short seat must not record a repair");
    assert.deepEqual(beforeRepairRoads.slice(0, 1).map(tile => tile.condition), keepConditions.map(tile => tile.condition));
    await page.screenshot({ path: artifact("road-owners-repaired.png"), fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        target: baseUrl || "local",
        version,
        hallSpot,
        keepRoads, hallRoads,
        seats: { keep: keepSeat, hall: hallSeat },
        beforeRepair: { year: beforeRepair.year, average: beforeRepair.average, owners: beforeRepair.owners, obligation: beforeRepair.obligation, button: beforeRepair.panels.button },
        repaired: { year: repaired.year, owners: repaired.owners, obligation: repaired.obligation, button: repaired.panels.button, seats: repaired.seats },
        hallChunks, chunks,
        pageErrors, consoleErrors
    }));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
