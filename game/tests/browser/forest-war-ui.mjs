// Browser proof for 1.2.23.1.211–240: the player can reach the Forest War
// block in the real Forest Atlas, raise border works, sign a treaty, create a
// protected border tile, open a route and customs, then fight an ambush battle
// with the named garrison after the court declares war.
//
// Usage: npm run test:forest-war-ui
// Output: artifacts/forest-war-ui/forest-war-ui.png
//         artifacts/forest-war-ui/forest-war-ui.json
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_WAR_OUT || "artifacts/forest-war-ui");
const screenshotPath = resolve(outputDir, "forest-war-ui.png");
const reportPath = resolve(outputDir, "forest-war-ui.json");
const seed = 20261127;
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
    await page.locator("#player-name-input").fill("Forest War UI");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    if (await page.locator("#realm-event-modal").isVisible()) await page.locator("#realm-event-dismiss").click();
    const pauseText = (await page.locator("#pause-text").innerText()).trim();
    if (pauseText !== "RESUME") {
        await page.locator("#pause-btn").click();
        await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent.trim() === "RESUME", null, { timeout: 3000 });
    }

    // Real campaign state: a rich store, a working court and six named guards.
    // The fixture only prepares the peace; every war action below is a real UI click.
    const fixture = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { ensureDiplomacy }, { ensureWorldMap }, { createMilitaryState }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/systems/diplomacy.js"),
            import("./js/systems/world-map.js"),
            import("./js/systems/military.js"),
        ]);
        state.resources.wood = 1200;
        state.resources.stone = 800;
        state.resources.gold = 1200;
        state.resources.food = 1200;
        state.year = 12;
        state.dayOfYear = 140;
        state.seasonIndex = 1;
        state.tick = 12 * 400 + 140;
        state.morale = 60;
        if (state.research && typeof state.research === "object") state.research.reserve = 80;
        if (!state.military) state.military = createMilitaryState();
        const diplomacy = ensureDiplomacy();
        for (const realm of diplomacy.realms) realm.treaty = "none";
        const northmere = diplomacy.realms.find(realm => realm.id === "northmere");
        northmere.relation = 78;
        northmere.trust = 70;
        northmere.fear = 22;
        const map = ensureWorldMap();
        const province = map.regions.find(region => region.id === "northmere-pines");
        for (let index = 0; index < 6; index++) {
            state.entities.push({
                id: "war-ui-guard-" + index,
                personId: "war-ui-guard-" + index,
                type: TYPE.GUARD,
                x: 30 + index,
                y: 30,
                dead: false,
                isKing: false,
                isBuilding() { return false; },
                isEnemy() { return false; },
                military: {
                    recruitId: "war-ui-guard-" + index,
                    origin: "opening-garrison",
                    sessions: 5,
                    rank: "veteran",
                    equipment: 92,
                    morale: 88,
                    mounted: false,
                    woundedUntilTick: 0,
                },
            });
        }
        return {
            provinceId: province.id,
            control: province.control,
            garrison: province.garrison,
        };
    });

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator('[data-forest-war="30"]').waitFor({ state: "visible", timeout: 15000 });
    assert.equal(await page.locator("[data-war-front]").count(), 4, "four real fronts must render");
    assert.equal(await page.locator("[data-war-requirement]").count(), 30, "the thirty-point war guide must render");
    assert.equal(await page.locator('[data-war-guide="30"]').count(), 1);
    assert.equal(await page.locator('[data-war-front="northmere"] [data-war-action="post"]').count(), 1);
    assert.equal(await page.locator('[data-war-front="northmere"] [data-war-action="battle"]').count(), 1);
    assert.equal(await page.locator('[data-war-front="northmere"] .war-roads > div').count(), 4);
    evidence.checks.atlas = {
        fronts: await page.locator("[data-war-front]").count(),
        requirements: await page.locator("[data-war-requirement]").count(),
        actions: await page.locator("[data-war-action]").count(),
    };
    await page.locator("[data-war-front]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(outputDir, "forest-war-fronts.png") });

    // Peace works: a post, a watch, a scout band, a road, maps, a treaty and a
    // joint preserve. Each is a real click with a real cost and a real waiter.
    const northmere = page.locator('[data-war-front="northmere"]');
    const clickAndWait = async (selector, expected) => {
        await page.locator(selector).click();
        await page.waitForFunction(text => document.querySelector("#action-toast")?.textContent.includes(text), expected, { timeout: 5000 });
    };
    await clickAndWait('[data-war-front="northmere"] [data-war-action="post"]', "BORDER POST");
    await clickAndWait('[data-war-front="northmere"] [data-war-action="watch"]', "FOREST WATCH");
    await clickAndWait('[data-war-front="northmere"] [data-war-action="scouts"]', "FOREST SCOUTS");
    await clickAndWait('[data-war-front="northmere"] [data-war-action="road"]', "FOREST ROAD");
    await clickAndWait('[data-war-front="northmere"] [data-war-action="maps"]', "WAR MAPS");
    await page.locator('[data-war-front="northmere"] [data-war-customs="10"]').click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("FOREST CUSTOMS"), null, { timeout: 5000 });
    await clickAndWait('[data-war-front="northmere"] [data-war-action="treaty"]', "BORDER TREATY");
    await clickAndWait('[data-war-front="northmere"] [data-war-action="preserve"]', "JOINT PRESERVE");
    await clickAndWait('[data-war-front="northmere"] [data-war-action="route"]', "FOREST ROUTE");

    const peace = await page.evaluate(async () => {
        const [{ ensureForestWarfare }, { sacredGroveTileAt }, { harvestForest }, { state }] = await Promise.all([
            import("./js/systems/forest-warfare.js"),
            import("./js/world/sacred-groves.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/core/state.js"),
        ]);
        const front = ensureForestWarfare().fronts.find(entry => entry.realmId === "northmere");
        const preserve = front.preserve;
        return {
            posts: front.posts,
            watch: front.watch,
            scouts: front.scouts,
            road: front.road,
            maps: front.maps,
            customs: front.customs,
            route: front.route,
            treaty: front.treaty ? { ...front.treaty } : null,
            preserve: preserve ? { ...preserve } : null,
            protectedTile: preserve ? Boolean(sacredGroveTileAt(preserve.x, preserve.y)) : false,
            timber: preserve ? harvestForest(preserve.x, preserve.y, 4) : -1,
            gold: state.resources.gold,
        };
    });
    assert.equal(peace.posts, 1);
    assert.equal(peace.watch, 1);
    assert.equal(peace.scouts, 1);
    assert.equal(peace.road, 1);
    assert.equal(peace.maps, true);
    assert.equal(peace.customs, 10);
    assert.equal(peace.route, true);
    assert.ok(peace.treaty && peace.treaty.untilYear > 12);
    assert.ok(peace.preserve, "the preserve must record a real tile");
    assert.equal(peace.protectedTile, true);
    assert.equal(peace.timber, 0, "the joint preserve must refuse the axe");
    evidence.checks.peace = peace;
    await northmere.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(outputDir, "forest-war-treaty.png") });

    // War breaks the treaty in the annual court; the battle then reads the same
    // soldiers the military panel lists. Re-open the tab to repaint availability.
    await page.evaluate(async () => {
        const [{ ensureDiplomacy }, { state }, { updateForestWarfare }] = await Promise.all([
            import("./js/systems/diplomacy.js"),
            import("./js/core/state.js"),
            import("./js/systems/forest-warfare.js"),
        ]);
        const realm = ensureDiplomacy().realms.find(entry => entry.id === "northmere");
        realm.treaty = "war";
        realm.warExhaustion = 12;
        state.year = 13;
        updateForestWarfare();
    });
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator('[data-forest-war="30"]').waitFor({ state: "visible", timeout: 15000 });
    await clickAndWait('[data-war-front="northmere"] [data-war-action="ambush"]', "AMBUSH LAID");
    const controlBefore = await page.evaluate(async () => {
        const [{ ensureWorldMap }] = await Promise.all([import("./js/systems/world-map.js")]);
        return ensureWorldMap().regions.find(region => region.id === "northmere-pines").control;
    });
    await clickAndWait('[data-war-front="northmere"] [data-war-action="battle"]', "FOREST");
    const war = await page.evaluate(async () => {
        const [{ ensureForestWarfare }] = await Promise.all([import("./js/systems/forest-warfare.js")]);
        const front = ensureForestWarfare().fronts.find(entry => entry.realmId === "northmere");
        return {
            battles: front.battles,
            victories: front.victories,
            ambushYear: front.ambushYear,
            treaty: front.treaty,
            scars: front.scars.length,
        };
    });
    assert.equal(war.battles, 1, "one real forest battle must resolve");
    assert.equal(war.ambushYear, 0, "the ambush must be consumed by the battle");
    assert.equal(war.treaty, null, "war must break the border treaty");
    evidence.checks.war = { ...war, controlBefore };
    await page.locator('[data-war-front="northmere"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: screenshotPath });

    // The guide opens like every other atlas guide and names the last point.
    await page.locator('[data-war-guide="30"] > summary').click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('[data-war-guide="30"]').evaluate(element => element.open));
    assert.equal(await page.locator('[data-war-requirement="1.2.23.1.240"]').count(), 1);
    await page.locator('[data-war-requirement="1.2.23.1.240"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(outputDir, "forest-war-guide.png") });

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
