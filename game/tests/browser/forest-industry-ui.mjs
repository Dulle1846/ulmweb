// Browser proof for 1.2.23.1.151–180: the player can reach the new FOREST
// build category, select a Forest Works industry, run a real batch, read the
// 30-point field guide and sell a finished good from a real warehouse.
//
// Usage: npm run test:forest-industry-ui
// Output: artifacts/forest-industry-ui/forest-industry-ui.png
//         artifacts/forest-industry-ui/forest-industry-ui.json
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_INDUSTRY_OUT || "artifacts/forest-industry-ui");
const screenshotPath = resolve(outputDir, "forest-industry-ui.png");
const reportPath = resolve(outputDir, "forest-industry-ui.json");
const seed = 20261123;
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

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const { chromium } = await import("playwright");
const server = createStaticServer();
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const evidence = { seed, ok: false, checks: {} };
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Forest Industry UI");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });

    if (await page.locator("#realm-event-modal").isVisible()) await page.locator("#realm-event-dismiss").click();
    const pauseText = (await page.locator("#pause-text").innerText()).trim();
    if (pauseText !== "RESUME") {
        await page.locator("#pause-btn").click();
        await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent.trim() === "RESUME", null, { timeout: 3000 });
    }

    // Place one working Forest Works beside a real forest, give it a woodwright
    // and one batch of firewood, and put a real charcoal lot in a warehouse.
    const fixture = await page.evaluate(async () => {
        const [
            { state },
            { TYPE },
            { ensureInventory },
            { getForestHabitatAt },
            { ensureForestGuild },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-guild.js"),
        ]);
        const index = state.resourceGeography.forestStock.findIndex(stock => stock > 4);
        if (index < 0) throw new Error("The seeded realm has no working forest");
        const x = index % state.worldW;
        const y = Math.floor(index / state.worldW);
        const stand = getForestHabitatAt(x, y)?.forestStand;
        if (!stand?.forest) throw new Error("The fixture tile has no forest stand");

        const works = {
            id: "forest-ui-works", type: TYPE.FOREST_WORKS, x, y, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 240, maxHp: 240,
            isBuilding() { return true; },
            isEnemy() { return false; },
        };
        ensureInventory(works);
        works.inventory.input.firewood = 9;
        const villager = state.entities.find(entity => !entity.dead && entity.type === TYPE.VILLAGER);
        if (!villager) throw new Error("The seeded realm has no woodwright");
        villager.workplace = works;
        state.entities.push(works);

        const store = {
            id: "forest-ui-store", type: TYPE.WAREHOUSE, x: x + 2, y, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 200, maxHp: 200,
            isBuilding() { return true; },
            isEnemy() { return false; },
        };
        ensureInventory(store);
        const commission = ensureForestGuild().active[0];
        store.warehouse.filters = [...new Set([...store.warehouse.filters, "charcoal", "medicine", commission.good])];
        store.warehouse.stored.charcoal = 5 + (commission.good === "charcoal" ? commission.quantity : 0);
        store.warehouse.stored[commission.good] = (Number(store.warehouse.stored[commission.good]) || 0) + commission.quantity;
        store.warehouse.stored.medicine = 8;
        store.warehouse.used = (Number(store.warehouse.used) || 0) + 13 + commission.quantity;
        state.entities.push(store);
        return {
            x, y, stand: stand.regionalType?.short || stand.regionalType?.label || stand.type,
            gold: state.resources.gold,
            commission: { id: commission.id, good: commission.good, quantity: commission.quantity, rewardGold: commission.rewardGold, rewardRenown: commission.rewardRenown },
        };
    });
    evidence.fixture = fixture;

    // The new build category is a real button and the sawmill moved with it.
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="forest"]').click();
    await page.locator('[data-build-type="89"]').waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-build-type="89"]').count(), 1);
    assert.match(await page.locator('[data-build-type="89"]').innerText(), /Forest Works/i);
    assert.equal(await page.locator('[data-build-type="63"]').count(), 1, "the sawmill must remain reachable in the forest category");
    evidence.checks.buildCategory = true;
    await page.locator("#build-close-btn").click();

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator('[data-forest-industry="1"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-industry-mode-card]").count(), 17);
    assert.equal(await page.locator("[data-industry-requirement]").count(), 30);
    assert.equal(await page.locator('[data-industry-catalogue="17"]').count(), 1);
    assert.equal(await page.locator('[data-industry-guide="30"]').count(), 1);
    assert.equal(await page.locator('[data-industry-good="charcoal"]').count(), 1);
    evidence.checks.atlas = {
        modes: await page.locator("[data-industry-mode-card]").count(),
        requirements: await page.locator("[data-industry-requirement]").count(),
        charcoalMarket: await page.locator('[data-industry-good="charcoal"]').count(),
    };
    const guide = page.locator('[data-industry-guide="30"]');
    await guide.locator("summary").click();
    await page.waitForTimeout(250);
    assert.ok(await guide.evaluate(element => element.open), "the thirty-point field guide must open from its summary");
    const firstGuidePoint = page.locator('[data-industry-requirement="1.2.23.1.151"]');
    await firstGuidePoint.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(outputDir, "forest-atlas.png") });

    // Living guild board: fill a real warehouse-backed commission and then move
    // medicine into the clinic. Both are recurring consumers, not catalogue text.
    assert.equal(await page.locator("[data-forest-commission-card]").count(), 3);
    assert.equal(await page.locator('[data-forest-guild-active="3"]').count(), 1);
    const commissionBefore = await page.evaluate(async () => {
        const [{ state }, { forestGuildSummary }, { industryWarehouseStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-guild.js"),
            import("./js/systems/forest-guild.js"),
        ]);
        const guild = forestGuildSummary();
        return {
            gold: state.resources.gold, renown: guild.renown, completed: guild.completed,
            order: guild.active[0], warehouse: industryWarehouseStock(guild.active[0].good),
        };
    });
    assert.ok(commissionBefore.order.ready, "the seeded commission must have enough warehouse stock");
    await page.locator("[data-forest-commission-card] [data-forest-commission]").first().click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("GUILD COMMISSION FILLED"), null, { timeout: 5000 });
    const commissionAfter = await page.evaluate(async () => {
        const [{ state }, { forestGuildSummary }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-guild.js"),
        ]);
        const guild = forestGuildSummary();
        return { gold: state.resources.gold, renown: guild.renown, completed: guild.completed, active: guild.active.length, history: guild.history[0] };
    });
    assert.ok(commissionAfter.gold > commissionBefore.gold);
    assert.ok(commissionAfter.renown > commissionBefore.renown);
    assert.equal(commissionAfter.completed, commissionBefore.completed + 1);
    assert.equal(commissionAfter.active, 3);
    assert.equal(commissionAfter.history.outcome, "delivered");
    evidence.checks.commission = { before: commissionBefore, after: commissionAfter };
    await page.screenshot({ path: resolve(outputDir, "forest-guild.png") });

    const clinicBefore = await page.evaluate(async () => {
        const [{ state }] = await Promise.all([import("./js/core/state.js")]);
        return state.health?.medicineStock || 0;
    });
    await page.locator("[data-clinic-medicine]").click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("CLINIC SUPPLIED"), null, { timeout: 5000 });
    const clinicAfter = await page.evaluate(async () => {
        const [{ state }] = await Promise.all([import("./js/core/state.js")]);
        return state.health?.medicineStock || 0;
    });
    assert.equal(clinicAfter, clinicBefore + 6);
    evidence.checks.clinic = { before: clinicBefore, after: clinicAfter };

    // Real warehouse sale through the atlas exchange.
    const beforeSale = await page.evaluate(async () => {
        const [{ state }, { getPhysicalStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/logistics.js"),
        ]);
        return { gold: state.resources.gold, charcoal: getPhysicalStock("charcoal") };
    });
    await page.locator('[data-industry-market] summary').click();
    await page.locator('[data-industry-sell="charcoal"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("SOLD"), null, { timeout: 5000 });
    const afterSale = await page.evaluate(async () => {
        const [{ state }, { getPhysicalStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/logistics.js"),
        ]);
        return { gold: state.resources.gold, charcoal: getPhysicalStock("charcoal") };
    });
    assert.equal(afterSale.charcoal, beforeSale.charcoal - 5);
    assert.ok(afterSale.gold > beforeSale.gold);
    evidence.checks.sale = { beforeSale, afterSale };

    // Building dossier: the real select has all 17 paths and the batch button
    // consumes firewood and produces charcoal.
    await page.locator('[data-command-tab="buildings"]').click();
    const record = page.locator('[data-building-id="forest-ui-works"]');
    await record.locator("summary").click();
    const modeSelect = page.locator('[data-forest-mode="forest-ui-works"]');
    await modeSelect.waitFor({ state: "visible" });
    assert.equal(await modeSelect.locator("option").count(), 17);
    await modeSelect.selectOption("charcoal");
    await page.waitForFunction(() => document.querySelector('[data-forest-mode="forest-ui-works"]')?.value === "charcoal", null, { timeout: 3000 });
    await record.locator("summary").click();
    const batchButton = page.locator('[data-run-forest-works="forest-ui-works"]');
    await batchButton.waitFor({ state: "visible" });
    assert.ok(await batchButton.isEnabled(), "the prepared Forest Works must accept a batch");
    await batchButton.click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("FOREST BATCH"), null, { timeout: 5000 });
    const batch = await page.evaluate(async () => {
        const [{ state }] = await Promise.all([import("./js/core/state.js")]);
        const works = state.entities.find(entity => entity.id === "forest-ui-works");
        return {
            firewood: works.inventory.input.firewood,
            charcoal: works.inventory.output.charcoal,
            last: works.lastForestBatch,
        };
    });
    assert.equal(batch.firewood, 6);
    assert.equal(batch.charcoal, 2);
    assert.equal(batch.last.mode, "charcoal");
    const form = await page.evaluate(async () => {
        const [{ state }, { buildingFormFor }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/world/building-forms.js"),
        ]);
        return buildingFormFor(state.entities.find(entity => entity.id === "forest-ui-works"));
    });
    assert.ok(form?.label, "a Forest Works needs its regional building form");
    await record.locator("summary").click();
    await batchButton.waitFor({ state: "visible" });
    const dossierText = await record.innerText();
    assert.match(dossierText, /Mastery:\s*Apprentice\s*·\s*1 batches/, "the dossier must show the earned workshop mastery");
    assert.equal(await page.locator('[data-forest-mastery="1"]').count(), 1);
    const formSection = dossierText.slice(Math.max(0, dossierText.indexOf("Building form")), dossierText.indexOf("Building form") + 240);
    assert.match(dossierText, new RegExp("Building form\\s*" + form.label), "the dossier must show the regional form; got: " + formSection);
    const formSpan = record.locator(".building-detail-grid > span").filter({ hasText: "Building form" }).first();
    assert.ok(await formSpan.isVisible(), "the regional form field must be visible in the open dossier");
    evidence.checks.buildingForm = form;
    evidence.checks.batch = batch;
    await page.screenshot({ path: screenshotPath, fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    evidence.ok = true;
    await writeFile(reportPath, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ ok: true, screenshot: screenshotPath, report: reportPath, checks: evidence.checks }, null, 2));
} catch (error) {
    evidence.error = error.stack || error.message;
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    await writeFile(reportPath, JSON.stringify(evidence, null, 2));
    console.error(evidence.error);
    process.exitCode = 1;
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
