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
            { runForestWorks, setForestWorksMode, forestMasterworkArchive, furnitureLotsSnapshot },
            { runGrandConsumer },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-guild.js"),
            import("./js/systems/forest-industries.js"),
            import("./js/systems/grand-consumers.js"),
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
        works.inventory.input.planks = 500;
        works.inventory.input["holm-timber"] = 500;
        const villager = state.entities.find(entity => !entity.dead && entity.type === TYPE.VILLAGER);
        if (!villager) throw new Error("The seeded realm has no woodwright");
        villager.workplace = works;
        state.entities.push(works);

        // Run a mastered furniture workshop until it leaves one rare masterwork,
        // then keep its ordinary level low so the existing dossier check still
        // observes the first charcoal batch as Apprentice.
        if (!setForestWorksMode(works, "furniture").ok) throw new Error("Furniture mode unavailable");
        works.forestBatches = 80;
        let masterwork = null;
        for (let attempt = 0; attempt < 140 && !masterwork; attempt++) {
            const batch = runForestWorks(works, { force: true });
            if (!batch.ok) throw new Error(batch.reason);
            masterwork = batch.masterwork;
            works.inventory.output.furniture = 0;
        }
        if (!masterwork) throw new Error("No masterwork was produced by the fixture");
        // At least three certified pieces for the style order.
        while (furnitureLotsSnapshot().length < 3) {
            const batch = runForestWorks(works, { force: true });
            if (!batch.ok) throw new Error(batch.reason);
            works.inventory.output.furniture = 0;
        }
        const lot = furnitureLotsSnapshot()[0];
        works.forestBatches = 0;
        works.inventory.output.furniture = 0;

        const store = {
            id: "forest-ui-store", type: TYPE.WAREHOUSE, x: x + 2, y, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 200, maxHp: 200,
            isBuilding() { return true; },
            isEnemy() { return false; },
        };
        ensureInventory(store);
        const guild = ensureForestGuild();
        const normal = guild.active[0];
        normal.good = "charcoal"; normal.quantity = 4; normal.patronId = "goldsmiths";
        normal.requirement = null; normal.deadlineTick = 99999;
        normal.caravan = { status: "arrived", departTick: 0, arrivalTick: 0, event: "clear", eventApplied: true };
        guild.patrons.goldsmiths = { deliveries: 2, pacts: 0, active: false, lastTick: 0 };
        const certified = guild.active[1];
        certified.good = "furniture"; certified.quantity = 3; certified.patronId = "great-household";
        certified.deadlineTick = 99999;
        certified.requirement = {
            kind: "furniture", styleId: lot.styleId, style: lot.style,
            qualityClass: lot.qualityClass, quality: lot.quality,
            minScore: Math.max(0, lot.score - 0.0001), minGrade: lot.grade,
        };
        certified.caravan = { status: "arrived", departTick: 0, arrivalTick: 0, event: "clear", eventApplied: true };
        const travelling = guild.active[2];
        travelling.good = "pitch"; travelling.quantity = 5; travelling.deadlineTick = 99999;
        travelling.requirement = null;
        travelling.caravan = { status: "enroute", departTick: 0, arrivalTick: state.tick + 4, event: "delay", eventApplied: false, delayDays: 2 };
        store.warehouse.filters = [...new Set([...store.warehouse.filters, "charcoal", "furniture", "medicine"])];
        store.warehouse.stored.charcoal = 12;
        store.warehouse.stored.furniture = 6;
        store.warehouse.stored.medicine = 8;
        state.entities.push(store);

        const shipyard = {
            id: "grand-shipyard", type: TYPE.SHIPYARD, x: x + 3, y, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 360, maxHp: 360,
            isBuilding() { return true; }, isEnemy() { return false; },
        };
        ensureInventory(shipyard);
        Object.assign(shipyard.inventory.input, { shipTimber: 10, pitch: 5, tar: 5, charcoal: 5, potash: 5 });
        const paperMill = {
            id: "grand-paper-mill", type: TYPE.PAPER_MILL, x: x + 4, y, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 300, maxHp: 300,
            isBuilding() { return true; }, isEnemy() { return false; },
        };
        ensureInventory(paperMill);
        Object.assign(paperMill.inventory.input, { paper: 8, potash: 4, charcoal: 4 });
        const starvedMill = {
            id: "grand-paper-mill-starved", type: TYPE.PAPER_MILL, x: x + 5, y, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 300, maxHp: 300,
            isBuilding() { return true; }, isEnemy() { return false; },
        };
        ensureInventory(starvedMill);
        const workers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).slice(1, 9);
        for (const worker of workers.slice(0, 3)) worker.workplace = shipyard;
        for (const worker of workers.slice(3, 6)) worker.workplace = paperMill;
        for (const worker of workers.slice(6, 9)) worker.workplace = starvedMill;
        // 1.2.23.1.181–210: a real shrine and its druid beside the same wood,
        // plus the ritual goods and a forester for the wood-right.
        const shrine = {
            id: "culture-shrine", type: TYPE.SHRINE, x, y: y + 1, dead: false,
            construction: { stage: 3, progress: 100 }, hp: 160, maxHp: 160,
            isBuilding() { return true; }, isEnemy() { return false; },
        };
        const cultureWorkers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && entity !== villager).slice(0, 2);
        if (cultureWorkers[0]) { cultureWorkers[0].workplace = shrine; cultureWorkers[0].job = "druid"; }
        if (cultureWorkers[1]) { cultureWorkers[1].job = "forester"; }
        state.entities.push(shrine);
        state.resources.wood = Math.max(240, Number(state.resources.wood) || 0);
        state.resources.gold = Math.max(160, Number(state.resources.gold) || 0);
        state.resources.food = Math.max(160, Number(state.resources.food) || 0);
        state.forestGathering = state.forestGathering || { version: 1, stock: {}, totalGathered: {}, quality: {}, history: [], lastGather: {} };
        state.forestGathering.stock = state.forestGathering.stock || {};
        state.forestGathering.stock.honey = Math.max(12, Number(state.forestGathering.stock.honey) || 0);
        state.forestGathering.stock.herbs = Math.max(12, Number(state.forestGathering.stock.herbs) || 0);
        state.forestGathering.stock.mushrooms = Math.max(12, Number(state.forestGathering.stock.mushrooms) || 0);
        state.entities.push(shipyard, paperMill, starvedMill);
        const shipResult = runGrandConsumer(shipyard, { force: true });
        const paperResult = runGrandConsumer(paperMill, { force: true });
        if (!shipResult.ok || !paperResult.ok) throw new Error(shipResult.reason || paperResult.reason);
        // Refill the input stores so the atlas shows running, stocked consumers;
        // the third mill remains deliberately starved.
        Object.assign(shipyard.inventory.input, { shipTimber: 8, pitch: 4, tar: 4, charcoal: 4, potash: 4 });
        Object.assign(paperMill.inventory.input, { paper: 6, potash: 3, charcoal: 3 });
        return {
            x, y, stand: stand.regionalType?.short || stand.regionalType?.label || stand.type,
            gold: state.resources.gold,
            masterwork: { id: masterwork.id, style: masterwork.style, master: masterwork.master, region: masterwork.region, year: masterwork.year },
            commission: { id: normal.id, good: normal.good, quantity: normal.quantity, rewardGold: normal.rewardGold, rewardRenown: normal.rewardRenown },
            certified: { id: certified.id, style: lot.style, quality: lot.quality, proof: furnitureLotsSnapshot().length },
            ships: shipResult.ships, reserve: paperResult.reserve,
            culture: { shrine: shrine.id, druid: cultureWorkers[0]?.id || null, forester: cultureWorkers[1]?.id || null },
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
    await page.locator('[data-build-category="grand"]').click();
    await page.locator('[data-build-type="90"]').waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-build-type="90"]').count(), 1);
    assert.equal(await page.locator('[data-build-type="91"]').count(), 1);
    assert.match(await page.locator('[data-build-type="90"]').innerText(), /Shipyard/i);
    assert.match(await page.locator('[data-build-type="91"]').innerText(), /Paper Mill/i);
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
    const certifiedCard = page.locator('[data-forest-commission-card="' + fixture.certified.id + '"]');
    const certifiedText = await certifiedCard.innerText();
    assert.match(certifiedText, /REQUIRED STYLE/);
    assert.match(certifiedText, new RegExp(fixture.certified.style.split(" ")[0], "i"));
    assert.match(certifiedText, /CERTIFIED/);
    const certifiedButton = certifiedCard.locator("[data-forest-commission]");
    assert.ok(await certifiedButton.isEnabled(), "three certified pieces must unlock the style order");
    assert.equal(await page.locator('[data-forest-caravan-status="enroute"]').count(), 1, "an unarrived caravan must be visible on the board");
    evidence.checks.certifiedOrder = { text: certifiedText, fixture: fixture.certified };
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
    const pactAfter = await page.evaluate(async () => {
        const [{ forestGuildSummary }] = await Promise.all([import("./js/systems/forest-guild.js")]);
        const guild = forestGuildSummary();
        return { pacts: guild.pacts, goldsmiths: guild.patrons.find(entry => entry.id === "goldsmiths") };
    });
    assert.equal(pactAfter.goldsmiths.active, true, "the third delivery must sign the patron pact");
    assert.ok(pactAfter.pacts >= 1);
    const pactDetails = page.locator('[data-patron-pacts]');
    await pactDetails.locator('summary').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[data-patron-pact]').count(), 16, "all sixteen patron relationships must be visible");
    const signedPact = page.locator('[data-patron-pact="goldsmiths"]');
    assert.match(await signedPact.innerText(), /PACT/);
    assert.equal(await signedPact.getAttribute("data-patron-active"), "1");
    const pactPaint = await signedPact.locator("b").first().evaluate(node => {
        const style = getComputedStyle(node);
        const details = node.closest("details");
        const detailsStyle = getComputedStyle(details);
        return {
            color: style.color,
            opacity: style.opacity,
            visibility: style.visibility,
            detailsOpacity: detailsStyle.opacity,
            detailsFilter: detailsStyle.filter,
            detailsContentVisibility: detailsStyle.contentVisibility,
            open: details.open,
        };
    });
    evidence.checks.pactPaint = pactPaint;
    assert.equal(pactPaint.opacity, "1");
    assert.equal(pactPaint.detailsOpacity, "1");
    evidence.checks.commission = { before: commissionBefore, after: commissionAfter, pact: pactAfter };
    await page.screenshot({ path: resolve(outputDir, "forest-guild.png") });
    await signedPact.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(outputDir, "patron-pacts.png") });

    const certifiedBefore = await page.evaluate(async id => {
        const [{ forestGuildSummary }, { furnitureLotProof, furnitureLotsSnapshot }] = await Promise.all([
            import("./js/systems/forest-guild.js"),
            import("./js/systems/forest-industries.js"),
        ]);
        const order = forestGuildSummary().active.find(entry => entry.id === id);
        return {
            proof: furnitureLotProof(order.requirement.styleId, order.requirement.minScore),
            stock: order.stock,
            totalLots: furnitureLotsSnapshot().reduce((sum, lot) => sum + Number(lot.amount || 0), 0),
        };
    }, fixture.certified.id);
    await certifiedButton.click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("GUILD COMMISSION FILLED"), null, { timeout: 5000 });
    const certifiedAfter = await page.evaluate(async () => {
        const [{ forestGuildSummary }, { furnitureLotsSnapshot }] = await Promise.all([
            import("./js/systems/forest-guild.js"),
            import("./js/systems/forest-industries.js"),
        ]);
        return {
            guild: forestGuildSummary(),
            totalLots: furnitureLotsSnapshot().reduce((sum, lot) => sum + Number(lot.amount || 0), 0),
        };
    });
    assert.equal(certifiedAfter.totalLots, certifiedBefore.totalLots - 3, "delivery must consume exactly three certified lots");
    evidence.checks.certifiedDelivery = { before: certifiedBefore, after: certifiedAfter };

    await page.locator('[data-command-tab="forest"]').click();
    await page.waitForTimeout(150);
    const grand = await page.evaluate(async () => {
        const [{ grandConsumersSummary }] = await Promise.all([import("./js/systems/grand-consumers.js")]);
        return grandConsumersSummary();
    });
    assert.equal(grand.shipyards, 1);
    assert.equal(grand.paperMills, 2);
    assert.ok(grand.ships >= 1);
    assert.ok(grand.shipBatches >= 1);
    assert.ok(grand.paperBatches >= 1);
    assert.ok(grand.rows.some(row => row.status === "starved"), "the empty mill must show a visible shortage");
    assert.equal(await page.locator('[data-grand-consumers]').count(), 1, "the atlas must render the grand-consumer block");
    assert.equal(await page.locator('[data-grand-consumer-card="grand-shipyard"]').count(), 1);
    assert.equal(await page.locator('[data-grand-status="starved"]').count(), 1);
    evidence.checks.grandConsumers = { ships: grand.ships, reserve: grand.reserve, rows: grand.rows.map(row => ({ id: row.id, status: row.status })) };
    await page.locator("[data-grand-consumers]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(outputDir, "grand-consumers.png") });

    // 1.2.23.1.181–210: culture profile, protected grove, festival, woodlore,
    // rights and the thirty-point field guide are reachable from the same atlas.
    await page.locator('[data-forest-culture="30"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-culture-requirement]").count(), 30);
    assert.equal(await page.locator('[data-culture-guide="30"]').count(), 1);
    assert.equal(await page.locator("[data-culture-role]").count(), 12);
    assert.equal(await page.locator("[data-culture-tech]").count(), 5);
    assert.equal(await page.locator("[data-culture-action^='festival-']").count(), 3);
    assert.equal(await page.locator("[data-culture-action^='offering-']").count(), 3);
    assert.equal(await page.locator("[data-culture-doctrine]").count(), 3);
    assert.equal(await page.locator("[data-culture-action='hermit']").count(), 1);
    assert.equal(await page.locator("[data-culture-action='school']").count(), 1);
    assert.equal(await page.locator("[data-culture-action='remedy']").count(), 1);
    const profileText = await page.locator("[data-culture-profile]").innerText();
    assert.match(profileText, /TABOO/);
    assert.match(profileText, /REGIONAL TALE/);
    assert.match(profileText, /WORK SONG/);
    const cultureBefore = await page.evaluate(async () => {
        const [{ state }, { forestCultureSummary }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-culture.js"),
        ]);
        return { summary: forestCultureSummary(), honey: state.forestGathering?.stock?.honey || 0 };
    });
    assert.ok(cultureBefore.summary.roles.druids >= 1, "the shrine must employ the seeded druid");
    assert.ok(cultureBefore.summary.roles.foresters >= 1, "the seeded warden must hold the wood-right");
    await page.locator('[data-culture-action="grove"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("SACRED GROVE CONSECRATED"), null, { timeout: 5000 });
    const groveAfter = await page.evaluate(async () => {
        const [{ forestCultureSummary }, { harvestForest }] = await Promise.all([
            import("./js/systems/forest-culture.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const summary = forestCultureSummary();
        const grove = summary.groves[0];
        return { summary, grove, guarded: grove ? harvestForest(grove.x, grove.y, 5) : -1 };
    });
    assert.equal(groveAfter.summary.groves.length, 1);
    assert.equal(groveAfter.guarded, 0, "the real harvest guard must refuse the sacred tile");
    assert.equal(groveAfter.grove.vitality, 62);
    assert.ok(groveAfter.grove.trait && groveAfter.grove.traitLabel);
    await page.locator("[data-culture-tend]").click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("GROVE TENDED"), null, { timeout: 5000 });
    const tended = await page.evaluate(async () => {
        const [{ state }, { forestCultureSummary }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-culture.js"),
        ]);
        const summary = forestCultureSummary();
        return { vitality: summary.groves[0].vitality, tendedYear: summary.groves[0].tendedYear, year: state.year };
    });
    assert.equal(tended.vitality, 70, "tending a grove must restore real vitality");
    assert.equal(tended.tendedYear, tended.year);
    await page.locator('[data-culture-action="lore"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("WOODLORE COLLECTED"), null, { timeout: 5000 });
    const loreAfter = await page.evaluate(async () => {
        const [{ forestCultureSummary }] = await Promise.all([import("./js/systems/forest-culture.js")]);
        const summary = forestCultureSummary();
        return { lore: summary.lore.length, names: summary.profile.names.female.length, tale: summary.profile.tale.title };
    });
    assert.equal(loreAfter.lore, 6);
    await page.locator('[data-culture-action="offering-herbs"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("OFFERING MADE"), null, { timeout: 5000 });
    await page.locator('[data-culture-action="festival-spring"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("FOREST FESTIVAL"), null, { timeout: 5000 });
    await page.locator('[data-culture-action="school"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("WOODLAND SCHOOL"), null, { timeout: 5000 });
    await page.locator('[data-culture-action="hermit"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("HERMIT'S OMEN"), null, { timeout: 5000 });
    await page.locator('[data-culture-action="hunt"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("HUNT RITE"), null, { timeout: 5000 });
    await page.locator('[data-culture-action="wedding"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("TREE WEDDING"), null, { timeout: 5000 });
    await page.locator('[data-culture-rights="commons"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("FOREST RIGHT"), null, { timeout: 5000 });
    const cultureAfter = await page.evaluate(async () => {
        const [{ forestCultureSummary }] = await Promise.all([import("./js/systems/forest-culture.js")]);
        return forestCultureSummary();
    });
    assert.equal(cultureAfter.rights.priority, "commons");
    assert.equal(cultureAfter.counts.offerings, 1);
    assert.equal(cultureAfter.counts.festivals, 1);
    assert.equal(cultureAfter.counts.rites, 1);
    assert.equal(cultureAfter.counts.weddings, 1);
    assert.equal(cultureAfter.counts.apprentices, 2);
    assert.equal(cultureAfter.lore.length, 6);
    assert.equal(cultureAfter.doctrine.id, "balance");
    assert.equal(cultureAfter.groves[0].vitality, 70);
    await page.locator(".culture-roles").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(outputDir, "forest-culture-roles.png") });
    assert.equal(await page.locator('[data-culture-guide="30"]').count(), 1);
    await page.locator('[data-culture-guide="30"] > summary').click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('[data-culture-guide="30"]').evaluate(element => element.open));
    assert.equal(await page.locator('[data-culture-requirement="1.2.23.1.210"]').count(), 1);
    await page.locator('[data-culture-requirement="1.2.23.1.210"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(outputDir, "forest-culture-guide.png") });
    await page.locator('[data-culture-profile]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(outputDir, "forest-culture.png") });
    evidence.checks.forestCulture = {
        before: { favor: cultureBefore.summary.favor, groves: cultureBefore.summary.groves.length, roles: cultureBefore.summary.roles },
        grove: groveAfter.grove, guarded: groveAfter.guarded, tended,
        after: { favor: cultureAfter.favor, rights: cultureAfter.rights.priority, counts: cultureAfter.counts, lore: cultureAfter.lore.length, doctrine: cultureAfter.doctrine.id, groveVitality: cultureAfter.groves[0].vitality },
        lore: loreAfter,
    };

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

    // Masterwork provenance lives in the dynasty archive, not only in the shop.
    await page.locator('[data-command-tab="dynasty"]').click();
    const masterworkRecord = page.locator('[data-dynasty-masterwork="' + fixture.masterwork.id + '"]');
    await masterworkRecord.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(id => document.querySelector('[data-dynasty-masterwork="' + id + '"]')?.textContent.includes("MASTERWORK"), fixture.masterwork.id, { timeout: 5000 });
    const masterworkText = await masterworkRecord.evaluate(node => node.textContent);
    assert.match(masterworkText, new RegExp(fixture.masterwork.master.split(" ")[0], "i"));
    assert.match(masterworkText, new RegExp(fixture.masterwork.year));
    assert.match(masterworkText, /prestige/i);
    assert.equal(await page.locator("[data-dynasty-masterwork]").count() >= 1, true);
    evidence.checks.masterwork = { fixture: fixture.masterwork, text: masterworkText };
    await masterworkRecord.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(outputDir, "dynasty-masterwork.png") });

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
