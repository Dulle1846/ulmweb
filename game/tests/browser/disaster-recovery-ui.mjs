// Real browser proof for the disaster-recovery link: a wreck is recorded with
// its cause and year, the city panel shows it, the next annual audit salvages
// real timber and stone, rebuilding nearby is cheaper, and the register is
// identical after save/reload.
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

async function openPanel(tab) {
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="' + tab + '"]').click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        return text.length > 40;
    }, null, { timeout: 15000 });
}

async function panelText() {
    return page.locator("#command-panel-content").evaluate(element => element.textContent || "");
}

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261122");
    await page.locator("#player-name-input").fill("Recovery Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    // A hazard wreck: the coastal, snow and volcanic passes mark the building
    // dead and leave destroyedBy/destroyedYear behind. The annual recovery pass
    // is the only reader of those tags.
    const wreck = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { TYPE } = await import("./js/core/types.js");
        const { updateDisasterRecovery } = await import("./js/systems/disaster-recovery.js");
        const building = state.entities.find(entity => !entity.dead
            && entity.isBuilding?.() && entity.type !== TYPE.KEEP && entity.type !== TYPE.WONDER);
        if (!building) return null;
        building.dead = true;
        building.destroyedBy = "snow-avalanche";
        building.destroyedYear = state.year;
        const annual = updateDisasterRecovery();
        return {
            type: building.type, x: building.x, y: building.y,
            label: building.label, year: state.year, ingested: annual.ingested
        };
    });
    assert.ok(wreck, "a fresh realm must own a building that can be wrecked");
    assert.equal(wreck.ingested, 1, "the annual pass must read the hazard tags");

    await openPanel("city");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("DISASTER RECOVERY"), null, { timeout: 15000 });
    const freshPanel = await panelText();
    assert.match(freshPanel, /DISASTER RECOVERY/);
    assert.match(freshPanel, /WRECKS AWAITING REBUILD/);
    assert.match(freshPanel, /Snow avalanche/);
    assert.match(freshPanel, /25% NEAR A WRECK/);
    assert.match(freshPanel, /next annual audit salvages a quarter of its timber and stone/);
    const wreckCell = page.locator("#command-panel-content .command-summary > div", { hasText: "WRECKS AWAITING REBUILD" }).first();
    await wreckCell.scrollIntoViewIfNeeded();
    assert.match(await wreckCell.innerText(), /WRECKS AWAITING REBUILD\s+1/);
    await page.screenshot({ path: "artifacts/disaster-recovery-panel.png", fullPage: false });

    const audit = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getDisasterRecoverySnapshot, updateDisasterRecovery } = await import("./js/systems/disaster-recovery.js");
        state.year += 1;
        state.dayOfYear = 1;
        const woodBefore = Number(state.resources.wood) || 0;
        const stoneBefore = Number(state.resources.stone) || 0;
        const annual = updateDisasterRecovery();
        return {
            annual,
            woodGain: (Number(state.resources.wood) || 0) - woodBefore,
            stoneGain: (Number(state.resources.stone) || 0) - stoneBefore,
            snapshot: getDisasterRecoverySnapshot()
        };
    });
    assert.equal(audit.annual.wrecks, 1, "the annual audit must settle the recorded wreck");
    assert.ok(audit.woodGain > 0, "salvage must return real timber to the crown");
    assert.ok(audit.stoneGain > 0, "salvage must return real stone to the crown");
    assert.equal(audit.snapshot.lastSalvage.year, wreck.year + 1);
    assert.equal(audit.snapshot.pendingCount, 1, "a wreck stays rebuildable after its salvage");

    await page.locator("#command-close").click();
    await openPanel("city");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("LAST SALVAGE"), null, { timeout: 15000 });
    const salvagePanel = await panelText();
    assert.match(salvagePanel, new RegExp("YEAR " + (wreck.year + 1) + " · \\d+ WOOD · \\d+ STONE"));
    await page.screenshot({ path: "artifacts/disaster-recovery-salvage.png", fullPage: false });

    const discount = await page.evaluate(async ({ type, x, y }) => {
        const { getBuildingCost } = await import("./js/systems/construction.js");
        const { rebuildDiscountFor } = await import("./js/systems/disaster-recovery.js");
        const base = getBuildingCost(type);
        const near = getBuildingCost(type, x + 1, y);
        const far = getBuildingCost(type, x + 8, y + 8);
        return { base, near, far, entry: rebuildDiscountFor(type, x + 1, y) };
    }, wreck);
    assert.ok(discount.near.wood < discount.base.wood, "rebuilding beside a wreck must cost less timber");
    assert.equal(discount.far.wood, discount.base.wood, "the discount must not leak across the realm");
    assert.ok(discount.entry, "the wreck must be discoverable from the build site");

    const beforeSave = await page.evaluate(async () => {
        const { getDisasterRecoverySnapshot } = await import("./js/systems/disaster-recovery.js");
        return getDisasterRecoverySnapshot();
    });
    await page.locator("#command-close").click();
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
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForTimeout(250);

    await openPanel("city");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("DISASTER RECOVERY"), null, { timeout: 15000 });
    const restored = await page.evaluate(async ({ type, x, y }) => {
        const { getDisasterRecoverySnapshot } = await import("./js/systems/disaster-recovery.js");
        const { getBuildingCost } = await import("./js/systems/construction.js");
        return {
            snapshot: getDisasterRecoverySnapshot(),
            base: getBuildingCost(type),
            near: getBuildingCost(type, x + 1, y),
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    }, wreck);
    assert.equal(restored.snapshot.pendingCount, beforeSave.pendingCount, "the wreck register must survive a reload");
    assert.deepEqual(restored.snapshot.salvage, beforeSave.salvage, "salvage totals must survive a reload");
    assert.equal(restored.snapshot.lastWreck.cause, beforeSave.lastWreck.cause);
    assert.equal(restored.snapshot.lastWreck.year, beforeSave.lastWreck.year);
    assert.ok(restored.near.wood < restored.base.wood, "the rebuild discount must survive a reload");
    assert.match(restored.text, /DISASTER RECOVERY/);
    assert.match(restored.text, /Snow avalanche/);
    assert.match(restored.text, /YEAR \d+ · \d+ WOOD · \d+ STONE/);
    await page.screenshot({ path: "artifacts/disaster-recovery-restored.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true, seed: 20261122, wreck, annual: audit.annual,
        salvage: audit.snapshot.lastSalvage,
        discount: { base: discount.base, near: discount.near, far: discount.far },
        restored: restored.snapshot
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
