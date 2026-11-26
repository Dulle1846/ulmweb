// Real-browser proof for manual carrier orders in the Buildings register.
//
// Found a realm through the start screen, place a real warehouse and mill,
// deposit audited grain, advertise the mill's declared supply and haul goods,
// click both buttons, confirm the active jobs disable their own buttons, then
// run the real logistics movement until both jobs finish and the physical goods
// audit stays balanced. No page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4222;
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
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
if (server) await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const url = baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/";
const rowSelector = id => `.building-record[data-building-id="${id}"]`;
const supplySelector = id => `${rowSelector(id)} [data-command="manual-order"][data-manual-order="supply"][data-good="grain"]`;
const haulSelector = id => `${rowSelector(id)} [data-command="manual-order"][data-manual-order="haul"][data-good="flour"]`;

async function openBuildings(millId) {
    if (await page.locator("#command-modal").evaluate(element => element.classList.contains("hidden"))) {
        await page.locator("#command-open-btn").click();
        await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    }
    await page.locator('[data-command-tab="buildings"]').click();
    await page.waitForFunction(({ selector, id }) => {
        const row = document.querySelector(selector);
        return Boolean(row && row.querySelector('[data-manual-order="supply"][data-good="grain"]') &&
            row.querySelector('[data-manual-order="haul"][data-good="flour"]') && row.dataset.buildingId === id);
    }, { selector: rowSelector(millId), id: millId }, { timeout: 15000 });
}

async function expandMill(millId) {
    const row = page.locator(rowSelector(millId));
    if (await row.evaluate(element => !element.open)) {
        await page.locator(`${rowSelector(millId)} > summary`).click();
        await page.waitForFunction(({ selector }) => document.querySelector(selector)?.open === true, { selector: rowSelector(millId) }, { timeout: 15000 });
    }
}

async function panelState(millId) {
    return page.evaluate(({ id, selectors }) => {
        const row = document.querySelector(selectors.row);
        const supply = row?.querySelector(selectors.supply);
        const haul = row?.querySelector(selectors.haul);
        return {
            buildingId: row?.dataset.buildingId || null,
            orderSummary: row?.querySelector("[data-manual-logistics] small")?.textContent || "",
            supply: supply ? { text: supply.textContent.trim(), disabled: supply.disabled, title: supply.title, quantity: supply.dataset.quantity } : null,
            haul: haul ? { text: haul.textContent.trim(), disabled: haul.disabled, title: haul.title, quantity: haul.dataset.quantity } : null
        };
    }, { id: millId, selectors: { row: rowSelector(millId), supply: supplySelector(millId), haul: haulSelector(millId) } });
}

async function simulationState(millId, warehouseId) {
    return page.evaluate(async ({ id, warehouse }) => {
        const [{ state }, { getLogisticsSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/logistics.js")
        ]);
        const snapshot = getLogisticsSnapshot();
        const mill = state.entities.find(entity => entity.id === id);
        const store = state.entities.find(entity => entity.id === warehouse);
        return {
            active: snapshot.jobs.filter(job => job.from?.id === id || job.to?.id === id).map(job => ({
                id: job.id, kind: job.kind, good: job.good, quantity: job.quantity,
                from: job.from?.id, to: job.to?.id, status: job.status
            })),
            completed: snapshot.completed.filter(job => job.from?.id === id || job.to?.id === id).map(job => ({
                id: job.id, kind: job.kind, good: job.good, quantity: job.quantity, status: job.status
            })),
            auditBalanced: snapshot.audit.balanced,
            grainBalanced: snapshot.audit.rows.find(row => row.good === "grain")?.balanced || false,
            flourBalanced: snapshot.audit.rows.find(row => row.good === "flour")?.balanced || false,
            lastRejection: snapshot.lastRejection,
            millInputGrain: Number(mill?.inventory?.input?.grain) || 0,
            millOutputFlour: Number(mill?.inventory?.output?.flour) || 0,
            warehouseGrain: Number(store?.warehouse?.stored?.grain) || 0,
            warehouseFlour: Number(store?.warehouse?.stored?.flour) || 0
        };
    }, { id: millId, warehouse: warehouseId });
}

let millId;
let warehouseId;
try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Manual Carrier Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    const injected = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { spawnEntity }, logistics] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"),
            import("./js/world/entities.js"), import("./js/systems/logistics.js")
        ]);
        const warehouse = spawnEntity(40, 40, TYPE.WAREHOUSE);
        const mill = spawnEntity(42, 40, TYPE.MILL);
        if (!warehouse || !mill) throw new Error("the proof warehouse and mill could not be placed");
        logistics.ensureInventory(warehouse);
        logistics.ensureInventory(mill);
        return {
            warehouseId: warehouse.id,
            millId: mill.id,
            deposited: logistics.depositGood("grain", 24, 42, 40),
            produced: logistics.addLocalOutput(mill, "flour", 5),
            auditBalanced: logistics.getGoodsAudit().balanced
        };
    });
    millId = injected.millId;
    warehouseId = injected.warehouseId;
    assert.equal(injected.deposited, 24, "audited grain must reach a real warehouse");
    assert.equal(injected.produced, 5, "audited flour must reach the mill's real output store");
    assert.equal(injected.auditBalanced, true, "the fixture must not create a goods-book difference");

    await openBuildings(millId);
    // A building row is a native details card. A real player expands the mill
    // before reading its manual order buttons; the buttons are not interactive
    // while the card is folded. A successful order rerenders the register, so
    // expand it again before placing the second order.
    await expandMill(millId);
    const before = await panelState(millId);
    assert.equal(before.buildingId, millId);
    assert.match(before.orderSummary, /2 recipe goods · 2 ready · max 12 per cart/);
    assert.match(before.supply.text, /^SUPPLY 12 GRAIN$/);
    assert.equal(before.supply.disabled, false);
    assert.match(before.haul.text, /^HAUL 5 FLOUR$/);
    assert.equal(before.haul.disabled, false);
    await page.screenshot({ path: artifact("manual-logistics-ready.png"), fullPage: false });

    await page.locator(supplySelector(millId)).click();
    await page.waitForFunction(() => /SUPPLY ORDERED · 12 GRAIN/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    await page.waitForFunction(({ selector }) => document.querySelector(selector)?.disabled === true, { selector: supplySelector(millId) }, { timeout: 15000 });
    await expandMill(millId);
    const afterSupply = await simulationState(millId, warehouseId);
    assert.equal(afterSupply.active.length, 1);
    assert.deepEqual(afterSupply.active[0], {
        id: afterSupply.active[0].id, kind: "supply", good: "grain", quantity: 12,
        from: warehouseId, to: millId, status: "pending"
    });
    assert.equal(afterSupply.auditBalanced, true, "reserving a real job must not move physical stock");
    await page.screenshot({ path: artifact("manual-logistics-supply.png"), fullPage: false });

    await page.locator(haulSelector(millId)).click();
    await page.waitForFunction(() => /HAUL ORDERED · 5 FLOUR/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    await page.waitForFunction(({ selector }) => document.querySelector(selector)?.disabled === true, { selector: haulSelector(millId) }, { timeout: 15000 });
    const afterHaul = await simulationState(millId, warehouseId);
    assert.equal(afterHaul.active.length, 2, "both player orders must be live jobs");
    assert.equal(afterHaul.active.some(job => job.kind === "supply" && job.good === "grain"), true);
    assert.equal(afterHaul.active.some(job => job.kind === "haul" && job.good === "flour" && job.from === millId), true);
    assert.equal(afterHaul.auditBalanced, true);
    await page.screenshot({ path: artifact("manual-logistics-active.png"), fullPage: false });

    const completed = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { updateLogistics, updateLogisticsMovement } = await import("./js/systems/logistics.js");
        for (let tick = 0; tick < 180; tick++) {
            state.tick += 1;
            if (state.tick % 2 === 0) updateLogistics();
            updateLogisticsMovement(0.2);
        }
        return state.tick;
    });
    assert.ok(completed > 2);
    const delivered = await simulationState(millId, warehouseId);
    assert.equal(delivered.active.length, 0, "both player orders must finish");
    assert.equal(delivered.completed.some(job => job.kind === "supply" && job.good === "grain" && job.quantity === 12 && job.status === "done"), true);
    assert.equal(delivered.completed.some(job => job.kind === "haul" && job.good === "flour" && job.quantity === 5 && job.status === "done"), true);
    assert.equal(delivered.millInputGrain, 12, "the supply must land in the mill's real input store");
    assert.equal(delivered.warehouseGrain, 12, "the warehouse must keep the unspent grain");
    assert.equal(delivered.millOutputFlour, 0, "the haul must empty the mill's local output");
    assert.equal(delivered.warehouseFlour, 5, "the haul must land in the real warehouse");
    assert.equal(delivered.auditBalanced, true, "real deliveries must leave every goods book balanced");
    assert.equal(delivered.grainBalanced, true);
    assert.equal(delivered.flourBalanced, true);

    assert.deepEqual(pageErrors, [], "manual orders must not raise page errors");
    assert.deepEqual(consoleErrors, [], "manual orders must not raise console errors");
    console.log(JSON.stringify({
        ok: true, injected, before, afterSupply, afterHaul, delivered, pageErrors, consoleErrors
    }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
