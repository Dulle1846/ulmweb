// Fresh-player proof for 1.2.23.1.061–120 on the deployed forest build.
//
// Starts a new temperate realm without a save, inspects the opening lumber
// yard through the real buildings panel, thins a nearby stand and gathers its
// products through the player buttons, reads several ecology cards in the real
// forest atlas, then runs three full years at 4x through the normal speed
// control. Only read-only state probes are used to compare what the visible
// actions changed; the simulation is never advanced or edited directly.
//
// Local static server by default. Prove the hosted build with:
//   FOREST_PROOF_BASE_URL=https://kings-and-cards.pages.dev npm run test:forest-dynamics-live
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const ROOT = resolve(process.cwd());
const BASE = process.env.FOREST_PROOF_BASE_URL || null;
const SEED = Number(process.env.FOREST_PROOF_SEED || 20261123);
const OUT = resolve(ROOT, "..", "artifacts", "forest-dynamics-live");
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
};

function serveGame() {
    return createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
            const relative = pathname === "/" ? "index.html" : pathname.slice(1);
            const file = resolve(ROOT, relative);
            if (file !== ROOT && !file.startsWith(ROOT + sep)) {
                response.writeHead(403).end("Forbidden");
                return;
            }
            const body = await readFile(file);
            response.writeHead(200, {
                "content-type": MIME[extname(file)] || "application/octet-stream",
                "cache-control": "no-store",
            });
            response.end(body);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
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
            if (visible(document.getElementById("event-notification-close"))) {
                document.getElementById("event-notification-close").click();
                return "event-notification";
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
        assert.equal((await page.locator("#pause-text").innerText()).trim(), "RESUME");
    }
}

async function resumeRealm(page) {
    const text = (await page.locator("#pause-text").innerText()).trim();
    if (text === "RESUME") {
        await page.locator("#pause-btn").click();
        await page.clock.runFor(200);
        assert.equal((await page.locator("#pause-text").innerText()).trim(), "PAUSE");
    }
}

async function readYear(page) {
    return page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { year: state.year, tick: state.tick, paused: state.isPaused };
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

let server = null;
let base = BASE;
if (!base) {
    server = serveGame();
    await new Promise(listen => server.listen(0, "127.0.0.1", listen));
    base = "http://127.0.0.1:" + server.address().port;
}
base = base.replace(/\/$/, "");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", request => failedRequests.push(request.url() + " — " + (request.failure()?.errorText || "failed")));

const report = {
    base, seed: SEED, climate: "temperate", ok: false,
    started: null, world: null, systems: null, samples: {}, actions: {},
    atlasBefore: null, years: [], atlasAfter: null, points: {},
    pageErrors, consoleErrors, failedRequests,
};

try {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.goto(base + "/?forest-dynamics-proof=" + encodeURIComponent(String(SEED)), {
        waitUntil: "domcontentloaded",
        timeout: 60000,
    });
    await page.clock.runFor(600);
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    assert.equal(await page.locator("#start-screen").isVisible(), true, "a fresh player must see the founding screen");
    // The fresh context has no save. These are the visible founding controls.
    await page.locator("#world-climate").selectOption("temperate");
    await page.locator("#world-seed-input").fill(String(SEED));
    await page.locator("#player-name-input").fill("Forest Dynamics Player");
    await page.locator("#world-forests").evaluate(element => {
        element.value = "78";
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
    assert.equal(await page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted), true,
        "the visible founding button must start a realm");
    await page.clock.runFor(600);
    await settleOverlays(page);
    await pauseRealm(page);

    const scan = await page.evaluate(async () => {
        const [{ state }, { getResourceNodeAt }, { TYPE }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/core/types.js"),
        ]);
        const lumber = state.entities.find(entity => !entity.dead && entity.isBuilding?.() && entity.type === TYPE.LUMBER);
        if (!lumber) throw new Error("The opening realm did not expose a lumber yard");
        const standing = entity => !entity.dead && entity.isBuilding?.() === true;
        const width = Number(state.worldW) || 0;
        const height = Number(state.worldH) || 0;
        const bySystem = {};
        const samples = [];
        let forestTiles = 0;
        let untyped = 0;
        let stockTotal = 0;
        let burned = null;
        let ancient = null;
        let wet = null;
        let highLiana = null;
        let highEpiphyte = null;
        let light = null;
        let gapSample = null;
        let disturbed = null;
        let successionWatch = null;
        const regimes = new Set();
        const phases = new Set();
        const mixtures = new Set();
        const systems = new Set();
        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                const node = getResourceNodeAt(x, y);
                if (!node?.forestCapacity) continue;
                forestTiles++;
                stockTotal += Number(node.forestStock) || 0;
                if (!node.forestDynamics) {
                    untyped++;
                    continue;
                }
                const d = node.forestDynamics;
                systems.add(d.silviculture.system);
                phases.add(d.age.phase);
                mixtures.add(d.composition.mixtureClass);
                regimes.add(d.hazard.regime.label);
                const row = {
                    x, y, type: node.forestType, regional: node.forestRegionalLabel,
                    stock: Number(node.forestStock) || 0, capacity: Number(node.forestCapacity) || 0,
                    system: d.silviculture.system, systemLabel: d.silviculture.label,
                    phase: d.age.phase, mixture: d.composition.mixtureClass,
                    purity: d.composition.purity, pioneer: d.composition.pioneerShare, climax: d.composition.climaxShare,
                    seedBank: d.regeneration.seedBank, motherTrees: d.regeneration.motherTrees,
                    motherTreesPerHa: d.regeneration.motherTreesPerHa, motherTreesBySpecies: d.regeneration.motherTreesBySpecies,
                    seedQuality: d.regeneration.seedQuality,
                    seedBankViability: d.regeneration.seedBankViability, buriedSeedYears: d.regeneration.buriedSeedYears,
                    seedRain: d.regeneration.seedRain, germination: d.regeneration.germination,
                    seedlingBank: d.regeneration.seedlingBank, saplingRecruitment: d.regeneration.saplingRecruitment,
                    seedSource: d.regeneration.seedSource,
                    geneticDiversity: d.regeneration.geneticDiversity, regeneration: d.regeneration.factor,
                    diseaseResistance: d.health.diseaseResistance, siteFitness: d.health.siteFitness,
                    rotationYears: d.age.rotationYears, systemRotation: d.silviculture.rotationYears,
                    cohorts: d.age.cohorts, standAge: d.age.standAgeYears, spread: d.age.spreadYears,
                    timberFactor: d.silviculture.timberFactor, browsePressure: d.silviculture.browsePressure,
                    retention: d.silviculture.retentionTreesPerHa, standards: d.silviculture.standardsPerHa,
                    stools: d.silviculture.stoolsPerHa, harvestIntensity: d.silviculture.harvestIntensity,
                    canopyTarget: d.silviculture.canopyTarget, rotationProgress: d.silviculture.rotationProgress,
                    regime: d.hazard.regime.label, regimeFire: d.hazard.regime.fire,
                    regimeWind: d.hazard.regime.wind, regimeIce: d.hazard.regime.ice,
                    regimeWater: d.hazard.regime.water, regimeSeverity: d.hazard.regime.severity,
                    regimePatch: d.hazard.regime.patchSizeHa, regimeReturn: d.hazard.regime.returnIntervalYears,
                    deadwood: d.structure.deadwood ?? node.forestDeadwood, deadwoodProfile: d.structure.deadwoodProfile,
                    gap: d.structure.canopyGap, gapAge: d.structure.gapAge,
                    gapOrigin: d.structure.gapProfile?.origin, gapSize: d.structure.gapProfile?.sizeClass,
                    lightWoodland: d.structure.lightWoodland, edgeDiversity: d.structure.edgeDiversity,
                    edgeWidth: d.structure.edgeProfile?.widthM, mantle: d.structure.edgeProfile?.mantleCover,
                    liana: d.structure.lianaCover, epiphyte: d.structure.epiphyteCover,
                    lianaTypes: d.structure.lianaProfile?.types, epiphyteGroups: d.structure.epiphyteProfile?.groups,
                    herb: d.structure.herbLayer, medicinal: d.structure.medicinalHerbs,
                    herbFood: d.structure.herbProfile?.food, herbFlowering: d.structure.herbProfile?.flowering,
                    understoryBrowse: d.structure.understoryProfile?.browse,
                    roots: d.soil.rootDepth, waterUptake: d.soil.waterUptake, rootingType: d.soil.rootingType,
                    litter: d.soil.litterQuality, humus: d.soil.humusForm,
                    humusDepth: d.soil.humusDepthCm, litterDepth: d.soil.litterProfile?.depthCm,
                    decomposition: d.soil.decomposition, mycorrhiza: d.soil.mycorrhiza,
                    mycorrhizaType: d.soil.mycorrhizaType, networkReach: d.soil.networkReachM,
                    goods: d.goods.boost, disturbance: node.forestDisturbance || null,
                    succession: node.forestSuccession,
                };
                if (!bySystem[d.silviculture.system] && samples.length < 8) {
                    bySystem[d.silviculture.system] = row;
                    samples.push(row);
                }
                if (node.forestType === "burned" && !burned) burned = row;
                if (d.age.phase === "old-growth" && !ancient) ancient = row;
                if (!wet || d.soil.waterUptake > wet.waterUptake) wet = row;
                if (!highLiana || d.structure.lianaCover > highLiana.liana) highLiana = row;
                if (!highEpiphyte || d.structure.epiphyteCover > highEpiphyte.epiphyte) highEpiphyte = row;
                if (d.structure.lightWoodland && !light) light = row;
                if (!gapSample || d.structure.canopyGap > gapSample.gap) gapSample = row;
                if (d.silviculture.browsePressure > 0.15 && !disturbed) disturbed = row;
                if (node.forestSuccession?.kind && !successionWatch) successionWatch = row;
            }
        }
        const lumberNode = getResourceNodeAt(lumber.x, lumber.y);
        return {
            width, height, forestTiles, untyped, stockTotal,
            systems: [...systems], phases: [...phases], mixtures: [...mixtures], regimes: [...regimes],
            lumber: { id: lumber.id, x: lumber.x, y: lumber.y, type: lumber.type },
            lumberNode: lumberNode?.forestDynamics ? {
                x: lumber.x, y: lumber.y, type: lumberNode.forestType,
                stock: lumberNode.forestStock, capacity: lumberNode.forestCapacity,
            } : null,
            samples, burned, ancient, wet, highLiana, highEpiphyte, light, gapSample, disturbed, successionWatch,
            buildingFields: (() => {
                const b = lumber;
                return {
                    type: b.type,
                    construction: b.construction?.stage ?? null,
                    staff: b.staff ?? null,
                    output: b.output ?? null,
                    inventory: b.inventory ?? null,
                };
            })(),
        };
    });

    report.started = { tick: (await readYear(page)).tick, year: (await readYear(page)).year };
    report.world = {
        width: scan.width, height: scan.height, forestTiles: scan.forestTiles,
        untyped: scan.untyped, stockTotal: scan.stockTotal,
    };
    report.systems = scan.systems;
    report.samples = scan.samples;
    assert.equal(scan.untyped, 0, "every harvestable forest tile must carry a dynamics record");
    assert.ok(scan.forestTiles > 500, "the player realm must contain a real forest");
    assert.equal(scan.systems.length, 6, "a fresh temperate realm must expose all six silvicultural systems");
    assert.ok(scan.phases.length >= 5, "several succession phases must be observable");
    assert.ok(scan.mixtures.length >= 3, "several mixture classes must be observable");
    assert.ok(scan.regimes.length >= 3, "several disturbance regimes must be observable");
    assert.ok(scan.lumberNode, "the opening lumber yard must stand on a forest tile");
    assert.ok(scan.burned, "the realm must contain a burned stand");
    assert.ok(scan.ancient, "the realm must contain an old-growth stand");
    assert.ok(scan.light, "the realm must contain a light woodland");
    assert.ok(scan.highLiana && scan.highEpiphyte, "the realm must contain real liana and epiphyte cover");
    assert.ok(scan.gapSample && scan.gapSample.gapAge > 0, "the realm must contain a canopy gap with a real gap age");
    assert.ok(scan.successionWatch, "the realm must contain an active disturbance for the succession observation");

    // The player opens the buildings register and reads the lumber yard's site
    // data. Every new point on this release must be present in that visible text.
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="buildings"]').click();
    const record = page.locator("#command-panel-content .building-record").filter({
        has: page.locator('[data-gather-forest="' + scan.lumber.id + '"]'),
    });
    await record.waitFor({ state: "visible", timeout: 5000 });
    await record.evaluate(element => { element.open = true; });
    await page.clock.runFor(300);
    const inspectorFields = await record.evaluate(element => ({
        open: Boolean(element.open),
        text: (element.textContent || "").trim(),
        inner: (element.innerText || "").trim(),
    }));
    const inspector = inspectorFields.text || inspectorFields.inner;
    report.inspector = { ...inspectorFields, text: inspector };
    if (!inspector) {
        await page.screenshot({ path: resolve(OUT, "inspector-debug.png"), fullPage: false });
        throw new Error("The lumber inspector rendered no text; open=" + inspectorFields.open);
    }
    for (const [label, pattern] of [
        ["regional type", /Forest type:/],
        ["mixture class", /Mix class:/],
        ["phase", /Phase:/],
        ["pioneer/climax", /Pioneer\/climax:/],
        ["seed bank", /Seed bank:/],
        ["mother trees", /Mother trees:/],
        ["genetic diversity", /Genetic diversity:/],
        ["site fit", /Site fit:/],
        ["disease resistance", /Disease resistance:/],
        ["regime", /Regime: .*\(fire \d+% \/ wind \d+%\)/],
        ["silvicultural system", /System:/],
        ["regeneration", /Regeneration:/],
        ["roots", /Roots:/],
        ["humus", /Humus:/],
        ["water uptake", /Water uptake: \d+%/],
        ["decomposition", /Decomposition: \d+%/],
        ["mycorrhiza", /Mycorrhiza:/],
        ["lianas and epiphytes", /Lianas\/epiphytes:/],
        ["herb layer", /Herb layer: \d+%/],
        ["medicine", /Medicine: \d+%/],
        ["gap age", /Gap age: \d+d/],
        ["light woodland", /Light woodland: (yes|no)/],
        ["deadwood", /Deadwood: \d+%/],
        ["browse pressure", /Browse: \d+%/],
        ["age cohorts", /Cohorts \d+\/\d+\/\d+%/],
        ["seed source", /Seed source (mother trees|stand seed bank|soil seed bank|edge seed drift)/],
        ["regeneration niche", /rain \d+% · germ \d+% · seedlings \d+% · recruit \d+%/],
        ["deadwood classes", /standing \d+% \/ fallen \d+% \/ stumps \d+%/],
        ["gap origin", /Gap \d+% (large|medium|small|none) (storm|fire|cutting|age|none)/],
        ["edge mantle", /Edge (\d+m mantle|interior)/],
        ["litter depth", /Litter \d+\/\d+ leaf\/needle · \d+cm litter/],
        ["rooting type", /Rooting (Deep taproot|Heart root|Sinker roots|Shallow plate)/],
        ["liana and epiphyte groups", /Liana (Ivy|Honeysuckle|Rattan|Liana vines|none)/],
        ["herb profile", /Herb food\/medicine \d+%\/\d+%/],
        ["working timber", /Working sawlogs \d+% · firewood \d+% · specialty \d+% · quality \d+% · log share \d+% · volume \d+%/],
        ["working forage and habitat", /mushrooms \d+% · herbs \d+% · mast \d+% · game \d+% · honey \d+% · berries \d+% · fibre \d+% · habitat \d+%/],
        ["treatment detail", /Treatment rotation \d+% · retention \d+\/ha/],
        ["fauna ecology", /FAUNA ECOLOGY: .*browse \d+%/],
        ["food web", /FOOD WEB: .*\(\d+ guilds \/ \d+ links\)/],
        ["fauna indicators", /INDICATORS: health \d+% · water \d+% · deadwood \d+% · old growth \d+% · biodiversity \d+%/],
        ["regional deer", /(Red deer|Black-tailed deer|Fallow deer|Moose|Reindeer|Sambar|Chital|Muntjac|Kudu|Impala|Saiga|Red brocket) \d+/],
    ]) {
        assert.match(inspector, pattern, "the lumber inspector must expose " + label);
    }
    assert.ok(scan.samples.some(sample => inspector.includes(sample.phase)) || /Phase:/.test(inspector));

    // Thin the nearest stand through the visible button; the forest stock has
    // to fall while the yard's local log store rises. A background rerender can
    // close the details element, so reopen it if the player would have to.
    if (!await record.evaluate(element => element.open)) {
        await record.locator("summary").click();
        await page.clock.runFor(250);
    }
    const thinButton = page.locator('[data-thin-forest="' + scan.lumber.id + '"]');
    await thinButton.waitFor({ state: "visible", timeout: 5000 });
    if (await thinButton.isDisabled()) {
        const deliver = page.locator('[data-deliver-forest="' + scan.lumber.id + '"]');
        if (await deliver.isEnabled().catch(() => false)) await deliver.click();
        await page.clock.runFor(300);
    }
    const beforeThin = await page.evaluate(async lumberId => {
        const [{ state }, { getResourceNodeAt }, { TYPE }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/core/types.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        const node = b ? getResourceNodeAt(b.x, b.y) : null;
        return {
            stock: Number(node?.forestStock) || 0,
            localLogs: Number(b?.inventory?.output?.logs) || 0,
            stockAtSite: Number(node?.forestStock) || 0,
        };
    }, scan.lumber.id);
    await thinButton.click();
    await page.clock.runFor(600);
    const afterThin = await page.evaluate(async lumberId => {
        const [{ state }, { getResourceNodeAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        const node = b ? getResourceNodeAt(b.x, b.y) : null;
        return {
            stock: Number(node?.forestStock) || 0,
            localLogs: Number(b?.inventory?.output?.logs) || 0,
            toast: document.querySelector("#action-toast")?.textContent?.trim() || "",
        };
    }, scan.lumber.id);
    report.actions.thin = { before: beforeThin, after: afterThin };
    assert.ok(afterThin.stock < beforeThin.stock, "THIN NEAREST STAND must remove real standing timber");
    assert.ok(afterThin.localLogs > beforeThin.localLogs, "the thinned timber must arrive in the lumber yard's log store");
    assert.match(afterThin.toast, /THINNED .*LOGS.*FIREWOOD.*·/, "the player must see the log/firewood split and the system used");

    // Thin rerenders the building register and closes its details. A player
    // opens the same lumber record again before using the gathering action.
    if (!await record.evaluate(element => element.open)) {
        await record.locator("summary").click();
        await page.clock.runFor(250);
    }
    // Gather a forest bundle through the same inspector. The visible ledger
    // must grow; at least one returned good must be a real forest product.
    const gatherButton = page.locator('[data-gather-forest="' + scan.lumber.id + '"]');
    await gatherButton.waitFor({ state: "visible", timeout: 5000 });
    const beforeGather = await page.evaluate(async () => {
        const { forestGatheringSummary } = await import("./js/systems/forest-gathering.js");
        return { summary: forestGatheringSummary() };
    });
    await gatherButton.click();
    await page.clock.runFor(600);
    const afterGather = await page.evaluate(async () => {
        const { forestGatheringSummary } = await import("./js/systems/forest-gathering.js");
        return { summary: forestGatheringSummary(), toast: document.querySelector("#action-toast")?.textContent?.trim() || "" };
    });
    report.actions.gather = { before: beforeGather, after: afterGather };
    assert.ok(afterGather.summary.length > 0, "GATHER FOREST PRODUCTS must produce real goods");

    // The gathered food and medicine goods must have a way to become player
    // value. Sell the non-timber lot through the visible market button and
    // check the real treasury delta before delivering the wood to the yard.
    if (!await record.evaluate(element => element.open)) {
        await record.locator("summary").click();
        await page.clock.runFor(250);
    }
    const sellButton = page.locator('[data-sell-forest="' + scan.lumber.id + '"]');
    await sellButton.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await sellButton.isDisabled(), false, "the visible sale must be available for gathered non-timber goods");
    assert.match((await sellButton.innerText()).trim(), /SELL FOREST GOODS \(\+\d+G\)/,
        "the player must see the market quote before pressing sell");
    const beforeSell = await page.evaluate(async lumberId => {
        const [{ state }, { forestSellAvailability, forestDeliveryChannel, serializeForestGathering }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-gathering.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        const snapshot = serializeForestGathering();
        const nonWood = Object.entries(snapshot.stock || {})
            .filter(([id]) => forestDeliveryChannel(id) !== "wood")
            .reduce((sum, [, amount]) => sum + Math.max(0, Math.floor(Number(amount) || 0)), 0);
        return {
            gold: Math.round(Number(state.resources?.gold) || 0), nonWood,
            stock: { ...snapshot.stock }, availability: forestSellAvailability(b),
        };
    }, scan.lumber.id);
    await sellButton.click();
    await page.clock.runFor(600);
    const afterSell = await page.evaluate(async lumberId => {
        const [{ state }, { forestSellAvailability, forestDeliveryChannel, serializeForestGathering }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-gathering.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        const snapshot = serializeForestGathering();
        const nonWood = Object.entries(snapshot.stock || {})
            .filter(([id]) => forestDeliveryChannel(id) !== "wood")
            .reduce((sum, [, amount]) => sum + Math.max(0, Math.floor(Number(amount) || 0)), 0);
        return {
            gold: Math.round(Number(state.resources?.gold) || 0), nonWood,
            stock: { ...snapshot.stock }, availability: forestSellAvailability(b),
            toast: document.querySelector("#action-toast")?.textContent?.trim() || "",
        };
    }, scan.lumber.id);
    report.actions.sell = { before: beforeSell, after: afterSell };
    assert.ok(afterSell.gold > beforeSell.gold, "SELL FOREST GOODS must raise the real treasury");
    assert.ok(afterSell.nonWood < beforeSell.nonWood, "the sold food/market goods must leave the forest ledger");
    assert.equal(afterSell.stock.timber, beforeSell.stock.timber, "timber must stay for the productive log chain");
    assert.equal(afterSell.stock.firewood, beforeSell.stock.firewood);
    assert.match(afterSell.toast, /SOLD .*\+\d+ GOLD/, "the player must see the sold goods and the gold paid");

    // Deliver the remaining timber and firewood into the ordinary yard store.
    if (!await record.evaluate(element => element.open)) {
        await record.locator("summary").click();
        await page.clock.runFor(250);
    }
    const beforeDeliver = await page.evaluate(async lumberId => {
        const [{ state }, { serializeForestGathering }, { getWarehouseStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-gathering.js"),
            import("./js/systems/logistics.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        return {
            stock: { ...serializeForestGathering().stock },
            logs: Math.round(Number(b?.inventory?.output?.logs) || 0),
            firewood: Math.round(Number(b?.inventory?.output?.firewood) || 0),
            warehouseLogs: Math.round(Number(getWarehouseStock("logs")) || 0),
            warehouseFirewood: Math.round(Number(getWarehouseStock("firewood")) || 0),
        };
    }, scan.lumber.id);
    const deliverButton = page.locator('[data-deliver-forest="' + scan.lumber.id + '"]');
    assert.equal(await deliverButton.isDisabled(), false, "the remaining wood must be deliverable");
    await deliverButton.click();
    await page.clock.runFor(600);
    const afterDeliver = await page.evaluate(async lumberId => {
        const [{ state }, { serializeForestGathering }, { getWarehouseStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/forest-gathering.js"),
            import("./js/systems/logistics.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        return {
            stock: { ...serializeForestGathering().stock },
            logs: Math.round(Number(b?.inventory?.output?.logs) || 0),
            firewood: Math.round(Number(b?.inventory?.output?.firewood) || 0),
            warehouseLogs: Math.round(Number(getWarehouseStock("logs")) || 0),
            warehouseFirewood: Math.round(Number(getWarehouseStock("firewood")) || 0),
            toast: document.querySelector("#action-toast")?.textContent?.trim() || "",
        };
    }, scan.lumber.id);
    report.actions.delivery = { before: beforeDeliver, after: afterDeliver };
    const deliveredWood = (afterDeliver.logs - beforeDeliver.logs) + (afterDeliver.firewood - beforeDeliver.firewood)
        + (afterDeliver.warehouseLogs - beforeDeliver.warehouseLogs)
        + (afterDeliver.warehouseFirewood - beforeDeliver.warehouseFirewood);
    assert.ok(deliveredWood > 0,
        "DELIVER FOREST GOODS must put real wood into the lumber yard or the royal warehouse");
    assert.ok((afterDeliver.stock.timber || 0) < (beforeDeliver.stock.timber || 0)
        || (afterDeliver.stock.firewood || 0) < (beforeDeliver.stock.firewood || 0),
    "delivered wood must leave the forest ledger");
    assert.match(afterDeliver.toast, /DELIVERED/);

    // Open the player's forest atlas and read several different stands. The
    // cards are the actual catalogue used by the player, not a test fixture.
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator("#command-panel-content .forest-atlas__card").first().waitFor({ state: "visible", timeout: 5000 });
    const atlasCards = await page.locator("#command-panel-content .forest-atlas__card").count();
    const atlasText = (await page.locator("#command-panel-content").evaluate(element =>
        (element.textContent || "").replace(/\s+/g, " ").trim()));
    const systemRows = await page.locator("#command-panel-content [data-forest-system]").count();
    assert.equal(atlasCards, 60, "the atlas must list all 60 regional types");
    assert.equal(systemRows, 6, "the atlas must show all six silvicultural systems");
    const ecologyCards = page.locator("#command-panel-content .forest-atlas__card")
        .filter({ has: page.locator(".forest-atlas__dynamics") });
    const ecologyCount = await ecologyCards.count();
    assert.ok(ecologyCount >= 6, "the atlas must sample several ecology blocks");
    const cardTexts = [];
    for (let index = 0; index < ecologyCount; index++) {
        const card = ecologyCards.nth(index);
        if (!await card.evaluate(element => element.open)) await card.locator("summary").click();
        await page.clock.runFor(40);
        cardTexts.push((await card.innerText()).trim());
    }
    const atlasCorpus = atlasText + "\n" + cardTexts.join("\n");
    const missingSystems = ["Hochwald", "Dauerwald", "Waldweide", "Plenterwald", "Niederwald", "Mittelwald"]
        .filter(label => !atlasCorpus.includes(label));
    report.atlasBefore = { text: atlasText.slice(0, 4000), missingSystems };
    if (missingSystems.length) console.error("ATLAS DEBUG", JSON.stringify({ missingSystems, atlasText: atlasText.slice(0, 3000) }));
    assert.deepEqual(missingSystems, [], "the player atlas must expose every silvicultural system");
    for (const label of ["MIX", "COHORTS", "PHASE", "PIONEER / CLIMAX", "SEED BANK", "REGEN", "GENETICS", "SITE FIT", "SYSTEM", "WORKING", "REGIME", "DEADWOOD", "SOIL", "MYCORRHIZA", "STRUCTURE", "EDGE", "LIGHT", "GAPS", "HERB", "WILDLIFE", "PREDATORS", "WATER FAUNA", "INSECTS", "DEADWOOD LIFE", "CYCLE", "CORRIDOR", "HARVEST"]) {
        assert.ok(atlasCorpus.includes(label), "the atlas must expose " + label);
    }
    assert.match(atlasCorpus, /fire \d+% · wind \d+%/);
    assert.match(atlasCorpus, /young\/mature\/ancient · spread \d+y/);
    assert.match(atlasCorpus, /rain \d+% · germ \d+% · recruit \d+%/);
    assert.match(atlasCorpus, /standing \d+% · fallen \d+% · decay \d+%/);
    assert.match(atlasCorpus, /return \d+y/);
    assert.match(atlasCorpus, /retention \d+\/ha/);
    assert.match(atlasCorpus, /sawlogs \d+% · firewood \d+%/);
    assert.match(atlasCorpus, /specialty \d+% · quality \d+% · log share \d+%/);
    assert.match(atlasCorpus, /logs → planks|food \/ market|pannage \/ market/);
    assert.match(atlasCorpus, /uptake \d+%/);
    assert.match(atlasCorpus, /decomposition \d+%/);
    assert.match(atlasCorpus, /gap age \d+d/);
    assert.match(atlasCorpus, /medicine \d+%/);
    assert.match(atlasCorpus, /liana \d+%/);
    assert.match(atlasCorpus, /epiphyte \d+%/);
    assert.match(atlasCorpus, /wolf pack \d+|no wolf pack/);
    assert.match(atlasCorpus, /pollinators \d+%/);
    assert.match(atlasCorpus, /pests \d+%/);
    assert.match(atlasCorpus, /ants \d+\/ha/);
    assert.match(atlasCorpus, /game \d+ kg\/ha/);
    assert.match(atlasCorpus, /(trough|building|peak|decline)/);
    for (const card of cardTexts) {
        for (const match of card.matchAll(/\b(browse|health|water|pollinators|pests|hare|lynx|corridor) (\d+)/g)) {
            assert.ok(Number(match[2]) <= 100,
                "the atlas must render fauna " + match[1] + " as a percent, got " + match[2]);
        }
    }
    const surveySystems = await page.evaluate(async () => {
        const { forestAtlasSurvey } = await import("./js/presentation/forest-atlas-panel.js");
        return forestAtlasSurvey().systems;
    });
    assert.equal(surveySystems.length, 6);
    assert.ok(surveySystems.every(row => row.count > 0), "every reachable system must appear in the bounded atlas sample");
    report.atlasBefore = { cards: atlasCards, ecology: ecologyCount, cardTexts, systems: surveySystems };
    await page.screenshot({ path: resolve(OUT, "forest-atlas-ecology.png"), fullPage: false });

    // Read several distinct sampled stands before time advances.
    const beforeAtlasSamples = await page.evaluate(async () => {
        const { forestAtlasSurvey } = await import("./js/presentation/forest-atlas-panel.js");
        const survey = forestAtlasSurvey();
        return survey.types.filter(type => type.count > 0 && type.dynamics).slice(0, 12).map(type => ({
            id: type.id, count: type.count, system: type.dynamics.silviculture.system,
            phase: type.dynamics.age.phase, mixture: type.dynamics.composition.mixtureClass,
            regime: type.dynamics.hazard.regime.label, gapAge: type.dynamics.structure.gapAge,
            medicinal: type.dynamics.structure.medicinalHerbs, waterUptake: type.dynamics.soil.waterUptake,
            decomposition: type.dynamics.soil.decomposition, liana: type.dynamics.structure.lianaCover,
            epiphyte: type.dynamics.structure.epiphyteCover, deadwood: type.dynamics.structure.deadwood,
            sawlog: type.dynamics.working.timber.sawlog, firewood: type.dynamics.working.timber.firewood,
            mushrooms: type.dynamics.working.forage.mushrooms, mast: type.dynamics.working.forage.mast,
            game: type.dynamics.working.forage.game, habitat: type.dynamics.working.habitat.score,
            faunaDeer: type.fauna?.deer.primary || null,
            faunaDeerDensity: type.fauna?.deer.densityPer100Ha || 0,
            faunaWolf: type.fauna?.wolf.packSize || 0,
            faunaBear: type.fauna?.bear.densityPer100Km2 || 0,
            faunaBeaver: type.fauna?.beavers.colonies || 0,
            faunaOtter: type.fauna?.otters.individuals || 0,
            faunaFish: type.fauna?.fish.biomassKgHa || 0,
            faunaPollinators: type.fauna?.insects.pollinators || 0,
            faunaPests: type.fauna?.insects.pests || 0,
            faunaWater: type.fauna?.indicators.waterQuality || 0,
            faunaCycle: type.fauna?.cycles.hareLynx.label || null,
            faunaCorridor: type.fauna?.corridors.quality || 0,
            faunaGame: type.fauna?.products.venisonKgHa || 0,
            faunaGuilds: type.fauna?.foodWeb.nodes.length || 0,
            faunaLinks: type.fauna?.foodWeb.links.length || 0,
            faunaBoarRooting: type.fauna?.boar.rooting || 0,
            faunaBearDensity: type.fauna?.bear.densityPer100Km2 || 0,
            faunaLynx: Boolean(type.fauna?.lynx.present),
            faunaRaptors: type.fauna?.raptors.pairs || 0,
            faunaOwls: type.fauna?.owls.pairs || 0,
            faunaWoodpeckers: type.fauna?.woodpeckers.pairs || 0,
            faunaSongbirds: type.fauna?.songbirds.speciesRichness || 0,
            faunaBatRoosts: type.fauna?.bats.roosts || 0,
            faunaAmphibianPools: type.fauna?.amphibians.pools || 0,
            faunaReptileBasking: type.fauna?.reptiles.baskingSites || 0,
            faunaFungiYield: type.fauna?.fungi.yieldKgHa || 0,
            faunaMossHumidity: type.fauna?.mossLichen.humidityIndicator || 0,
            faunaParasiteLoad: type.fauna?.parasites.load || 0,
            faunaScavengerDays: type.fauna?.scavengers.carcassRemovalDays || 0,
            faunaAntMounds: type.fauna?.ants.moundsPerHa || 0,
            faunaBeeRichness: type.fauna?.wildBees.speciesRichness || 0,
            faunaButterflyWeeks: type.fauna?.butterflies.flightWeeks || 0,
            faunaBeetleRichness: type.fauna?.deadwoodBeetles.speciesRichness || 0,
            faunaDeerBrowse: type.fauna?.deer.browsePressure || 0,
            faunaBeaverPonds: type.fauna?.beavers.pondsHa || 0,
            faunaOtterFishShare: type.fauna?.otters.fishShare || 0,
            faunaWaterFilters: type.fauna?.waterFilters.indicator || 0,
            faunaKeystone: type.fauna?.foodWeb.keystone || null,
        }));
    });
    report.atlasBefore.samples = beforeAtlasSamples;
    assert.ok(new Set(beforeAtlasSamples.map(row => row.mixture)).size >= 2, "the atlas must show more than one mixture class");
    assert.ok(new Set(beforeAtlasSamples.map(row => row.phase)).size >= 2, "the atlas must show more than one phase");
    assert.ok(beforeAtlasSamples.every(row => row.faunaDeer), "every sampled stand must name a regional deer");
    assert.ok(beforeAtlasSamples.every(row => row.faunaGuilds >= 8 && row.faunaLinks >= 10), "every sampled stand must expose a food web");
    assert.ok(new Set(beforeAtlasSamples.map(row => row.faunaDeer)).size >= 2, "the atlas must show more than one regional deer species");
    assert.ok(new Set(beforeAtlasSamples.map(row => row.regime)).size >= 2, "the atlas must show more than one regime");
    assert.ok(beforeAtlasSamples.every(row => row.sawlog >= 0 && row.firewood >= 0
        && row.mushrooms >= 0 && row.mast >= 0 && row.game >= 0 && row.habitat >= 0),
    "every sampled stand must expose its working-wood yields");
    assert.ok(new Set(beforeAtlasSamples.map(row => row.sawlog)).size >= 2,
        "the atlas must show more than one sawlog profile");

    // Close the panel, configure a low render cap through Settings, then use
    // the ordinary 4x speed button for three completed years.
    await page.locator("#command-close").click();
    await page.locator("#settings-btn").click();
    await page.locator("#settings-frame-limit").selectOption("30");
    // A low internal render scale is a normal player setting for a weak
    // machine and keeps the fake-clock run bounded without changing the
    // simulation tick rate or any forest rule.
    await page.locator("#settings-render-scale").selectOption("25");
    await page.locator("#settings-close").click();
    await resumeRealm(page);
    await page.locator("#speed-4").click();
    assert.ok(await page.locator("#speed-4").evaluate(element => element.classList.contains("is-active")));
    let current = await readYear(page);
    report.years.push({ year: current.year, tick: current.tick, stock: scan.stockTotal });
    for (let chunk = 0; chunk < 40 && current.year < 4; chunk++) {
        await page.clock.runFor(20000);
        await settleOverlays(page);
        await page.clock.runFor(240);
        await settleOverlays(page);
        current = await readYear(page);
        if (current.year > report.years[report.years.length - 1].year) {
            const row = await page.evaluate(async () => {
                const { state } = await import("./js/core/state.js");
                let stock = 0;
                const geo = state.resourceGeography;
                if (geo?.forestStock) for (const value of geo.forestStock) stock += Number(value) || 0;
                let succession = 0;
                if (Array.isArray(geo?.forestSuccession)) {
                    for (const row of geo.forestSuccession) if (row?.kind) succession++;
                }
                return {
                    year: state.year, tick: state.tick, stock,
                    succession,
                    resources: { wood: Math.round(Number(state.resources?.wood) || 0), logs: Math.round(Number(state.resources?.logs) || 0) },
                };
            });
            report.years.push(row);
        }
    }
    assert.ok(current.year >= 4, "three full years must pass in fast-forward");
    await page.locator("#speed-1").click();
    await pauseRealm(page);
    await settleOverlays(page);

    // Read the same forest and atlas after the years; at least one stand must
    // have changed stock (regrowth or harvest), and the ecology values must
    // still be present and non-generic.
    const after = await page.evaluate(async ({ lumberId, watchX, watchY }) => {
        const [{ state }, { getResourceNodeAt }, { forestAtlasSurvey }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/presentation/forest-atlas-panel.js"),
        ]);
        const b = state.entities.find(entity => String(entity.id) === String(lumberId));
        const node = b ? getResourceNodeAt(b.x, b.y) : null;
        const watched = Number.isFinite(watchX) ? getResourceNodeAt(watchX, watchY) : null;
        const survey = forestAtlasSurvey();
        let stock = 0;
        if (state.resourceGeography?.forestStock) for (const value of state.resourceGeography.forestStock) stock += Number(value) || 0;
        return {
            year: state.year, tick: state.tick, stock,
            lumberSite: node ? {
                stock: node.forestStock, phase: node.forestPhase,
                seedBank: node.forestSeedBank, gapAge: node.forestGapAge,
                medicinal: node.forestMedicinalHerbs, waterUptake: node.forestWaterUptake,
                decomposition: node.forestDecomposition, regime: node.forestRegime,
            } : null,
            sampled: survey.sampled,
            systems: survey.systems.filter(row => row.count > 0).map(row => row.id),
            systemCounts: survey.systems,
            successionWatch: watched?.forestSuccession ? {
                x: watchX, y: watchY, age: watched.forestSuccession.age,
                stage: watched.forestSuccession.stage, phase: watched.forestPhase,
                seedBank: watched.forestSeedBank,
            } : null,
        };
    }, { lumberId: scan.lumber.id, watchX: scan.successionWatch.x, watchY: scan.successionWatch.y });
    report.atlasAfter = after;
    assert.ok(after.stock !== scan.stockTotal, "the forest stock must move across the played years");
    assert.equal(after.systems.length, 6, "the later atlas must still expose all six silvicultural systems");
    assert.ok(after.lumberSite?.seedBank >= 0 && after.lumberSite.seedBank <= 1);
    assert.ok(after.lumberSite?.gapAge >= 0);
    assert.ok(after.successionWatch, "the watched disturbance must still be readable after three years");
    assert.ok(after.successionWatch.age > scan.successionWatch.succession.age
        || after.successionWatch.phase !== scan.successionWatch.phase,
        "three years must advance the watched disturbance's succession age or phase");

    // Every one of the 30 points gets a concrete, player-visible observation.
    const sample = rows => rows.find(Boolean);
    const burned = scan.burned;
    const ancient = scan.ancient;
    const coppice = scan.samples.find(row => row.system === "coppice");
    const standards = scan.samples.find(row => row.system === "coppice-with-standards");
    const high = scan.samples.find(row => row.system === "high-forest");
    const selection = scan.samples.find(row => row.system === "selection");
    const continuous = scan.samples.find(row => row.system === "continuous-cover");
    const pasture = scan.samples.find(row => row.system === "wood-pasture");
    const edge = scan.samples.find(row => row.edgeWidth > 0) || scan.highLiana;
    assert.ok(burned && ancient && coppice && standards && high && selection && continuous && pasture && edge);
    const points = {
        "061": { observed: scan.samples.map(row => row.type).join(" / "), effect: "regional species chips, mixture, timber and goods" },
        "062": { observed: scan.mixtures.join(" / "), effect: "atlas MIX and inspector mix class" },
        "063": { observed: burned?.phase + " / " + burned?.type, effect: "burned pioneer stand, seed bank " + Math.round(burned.seedBank * 100) + "%" },
        "064": { observed: ancient?.phase + " / " + ancient?.type, effect: "old-growth stand, climax share " + Math.round(ancient.climax * 100) + "%" },
        "065": { observed: scan.phases.join(" / "), effect: "phase and rotation in atlas and inspector" },
        "066": { observed: "deadwood " + Math.round(ancient.deadwood * 100) + "% (standing " + Math.round(ancient.deadwoodProfile.standing * 100) + "% / fallen " + Math.round(ancient.deadwoodProfile.fallen * 100) + "% / stumps " + Math.round(ancient.deadwoodProfile.stumps * 100) + "%)", effect: "fire load, humus, habitat and cavity trees" },
        "067": { observed: "seed rain " + Math.round(ancient.seedRain * 100) + "% · germ " + Math.round(ancient.germination * 100) + "% · seedlings " + Math.round(ancient.seedlingBank * 100) + "% · recruit " + Math.round(ancient.saplingRecruitment * 100) + "%", effect: "natural regeneration from the existing stand" },
        "068": { observed: "burned seed bank " + Math.round(burned.seedBank * 100) + "% · viable " + Math.round(burned.seedBankViability * 100) + "% · buried " + burned.buriedSeedYears + "y", effect: "post-disturbance seed source" },
        "069": { observed: "mother trees " + ancient.motherTreesPerHa + "/ha across " + ancient.motherTreesBySpecies.length + " species", effect: "seed quality and natural regeneration" },
        "070": { observed: "genetic diversity " + Math.round(ancient.geneticDiversity * 100) + "% · " + (ancient.geneticDiversity >= 0.5 ? "regional provenance" : "local provenance"), effect: "inbreeding risk and resistance" },
        "071": { observed: "disease resistance " + Math.round(ancient.diseaseResistance * 100) + "%", effect: "real pest risk" },
        "072": { observed: "site fit " + Math.round(ancient.siteFitness * 100) + "%", effect: "stand productivity" },
        "073": { observed: "succession " + scan.successionWatch.succession.age + "d → " + after.successionWatch.age + "d / " + scan.phases.join(" / "), effect: "three years of real succession and regrowth" },
        "074": { observed: scan.regimes.join(" / ") + " · severity " + Math.round(ancient.regimeSeverity * 100) + "% · patch " + ancient.regimePatch + "ha · return " + ancient.regimeReturn + "y", effect: "fire risk, wind exposure and atlas REGIME" },
        "075": { observed: pasture?.systemLabel + " / browse " + Math.round(pasture.browsePressure * 100) + "% · retention " + pasture?.retention + "/ha", effect: "browsing pressure and slower regeneration" },
        "076": { observed: coppice?.systemLabel + " / " + coppice?.type + " · " + coppice?.stools + " stools/ha", effect: "short rotation and coppice regeneration" },
        "077": { observed: standards?.systemLabel + " / " + standards?.type + " · " + standards?.standards + " standards/ha", effect: "standards and underwood rotation" },
        "078": { observed: high?.systemLabel + " / " + high?.rotationYears + "y · age " + high?.standAge + "y", effect: "long rotation and timber factor" },
        "079": { observed: selection?.systemLabel + " / " + selection?.type, effect: "selection felling" },
        "080": { observed: continuous?.systemLabel + " / " + continuous?.type, effect: "permanent cover and regeneration" },
        "081": { observed: "edge " + edge.edgeWidth + "m mantle · " + Math.round(edge.mantle * 100) + "% cover · diversity " + Math.round(edge.edgeDiversity * 100) + "%", effect: "edge forage, light and liana structure" },
        "082": { observed: scan.light ? "light woodland at " + scan.light.x + "," + scan.light.y + " · canopy target " + Math.round(scan.light.canopyTarget * 100) + "%" : "light woodland", effect: "open canopy and herb layer" },
        "083": { observed: "gap " + Math.round(scan.gapSample.gap * 100) + "% · " + scan.gapSample.gapOrigin + " " + scan.gapSample.gapSize + " / age " + scan.gapSample.gapAge + "d", effect: "real canopy gap, origin and age" },
        "084": { observed: "liana " + Math.round(scan.highLiana.liana * 100) + "% (" + (scan.highLiana.lianaTypes || []).join(", ") + ")", effect: "rattan/willow goods and rendered climbers" },
        "085": { observed: "epiphyte " + Math.round(scan.highEpiphyte.epiphyte * 100) + "% (" + (scan.highEpiphyte.epiphyteGroups || []).join(", ") + ")", effect: "moss, lichen and orchid goods and trunk patches" },
        "086": { observed: "understorey " + scan.highLiana.type + " · browse " + Math.round(edge.understoryBrowse * 100) + "%", effect: "shrub/sapling habitat and browse" },
        "087": { observed: "herb " + Math.round(scan.highLiana.herb * 100) + "% / medicine " + Math.round(scan.highLiana.medicinal * 100) + "% · food " + Math.round(scan.highLiana.herbFood * 100) + "% / flowering " + Math.round(scan.highLiana.herbFlowering * 100) + "%", effect: "herb and medicine gathering yield" },
        "088": { observed: scan.wet.rootingType + " · roots " + Math.round(scan.wet.roots * 100) + "% / uptake " + Math.round(scan.wet.waterUptake * 100) + "%", effect: "wetness reduction and drought resilience" },
        "089": { observed: scan.wet.humus + " · " + scan.wet.litterDepth + "cm litter / " + scan.wet.humusDepth + "cm humus · decomposition " + Math.round(scan.wet.decomposition * 100) + "%", effect: "mushroom yield and humus" },
        "090": { observed: scan.highEpiphyte.mycorrhizaType + " · " + Math.round(scan.highEpiphyte.mycorrhiza * 100) + "% network / " + scan.highEpiphyte.networkReach + "m reach", effect: "regeneration, resistance and mushroom yield" },
    };
    for (const [id, row] of Object.entries(points)) {
        assert.ok(row.observed && row.effect, "point " + id + " must have player evidence");
    }
    report.points = points;

    // 091–120: the same player-visible atlas and inspector text, read from the
    // real fauna record attached to each sampled regional card.
    const faunaRows = beforeAtlasSamples.filter(row => row.faunaDeer);
    assert.ok(faunaRows.length >= 6, "the atlas must expose fauna ecology on several cards");
    const highest = key => Math.max(...faunaRows.map(row => Number(row[key]) || 0));
    const deerNames = [...new Set(faunaRows.map(row => row.faunaDeer))];
    assert.ok(deerNames.length >= 1, "the atlas must name a regional deer");
    const faunaPoints = {
        "091": { observed: deerNames.join(" / ") + " · " + highest("faunaDeerDensity") + "/100ha", effect: "regional deer in atlas and inspector" },
        "092": { observed: "rooting " + highest("faunaBoarRooting") + "%", effect: "boar soil damage and mast use" },
        "093": { observed: "bear " + highest("faunaBearDensity") + "/100km²", effect: "rare apex predator and prey list" },
        "094": { observed: "wolf pack " + highest("faunaWolf"), effect: "pack size and hunt chance" },
        "095": { observed: "lynx " + (faunaRows.some(row => row.faunaLynx) ? "present" : "absent"), effect: "solitary ambush hunter" },
        "096": { observed: highest("faunaRaptors") + " raptor pairs", effect: "forest-health indicator" },
        "097": { observed: highest("faunaOwls") + " owl pairs", effect: "hollows and old trees" },
        "098": { observed: highest("faunaWoodpeckers") + " woodpecker pairs", effect: "standing deadwood and cavities" },
        "099": { observed: highest("faunaSongbirds") + " songbird species", effect: "dawn/midday/dusk chorus" },
        "100": { observed: "beaver ponds " + highest("faunaBeaverPonds") + " ha", effect: "dams, water storage and flood risk" },
        "101": { observed: "otter fish share " + highest("faunaOtterFishShare") + "%", effect: "clean-water requirement" },
        "102": { observed: "marten/weasel guilds", effect: "small predators and rodent control" },
        "103": { observed: "hare/rabbit guilds", effect: "open-edge prey and cultural follower" },
        "104": { observed: "seed caches in the food web", effect: "rodent seed dispersal" },
        "105": { observed: highest("faunaBatRoosts") + " bat roosts", effect: "cavities and nightly insect take" },
        "106": { observed: "pollinators " + highest("faunaPollinators") + "% · pests " + highest("faunaPests") + "%", effect: "pollination, pest pressure and bird food" },
        "107": { observed: highest("faunaAntMounds") + " ant mounds/ha", effect: "soil turnover and pest defence" },
        "108": { observed: highest("faunaBeeRichness") + " wild bee species", effect: "deadwood, ground and cavity nests" },
        "109": { observed: highest("faunaButterflyWeeks") + " flight weeks", effect: "seasonal colour and nectar" },
        "110": { observed: highest("faunaBeetleRichness") + " deadwood beetle species", effect: "old-growth indicator" },
        "111": { observed: highest("faunaAmphibianPools") + " amphibian pools", effect: "wet hollows and spring chorus" },
        "112": { observed: highest("faunaReptileBasking") + " basking sites", effect: "sunny clearings" },
        "113": { observed: highest("faunaFish") + " kg/ha fish", effect: "clear, shaded water" },
        "114": { observed: "water-filter indicator " + highest("faunaWaterFilters") + "%", effect: "crayfish and mussel quality" },
        "115": { observed: highest("faunaFungiYield") + " kg/ha fungi", effect: "food, medicine and decomposition" },
        "116": { observed: "moss humidity " + highest("faunaMossHumidity") + "%", effect: "moisture and old-growth indicator" },
        "117": { observed: "parasite load " + highest("faunaParasiteLoad") + "%", effect: "four host-specific parasites" },
        "118": { observed: highest("faunaScavengerDays") + " days to remove a carcass", effect: "nutrient return" },
        "119": { observed: "cycle " + faunaRows.map(row => row.faunaCycle).filter(Boolean).slice(0, 3).join(" / "), effect: "hare/lynx, vole/owl and mast cycles" },
        "120": { observed: "corridor " + highest("faunaCorridor") + "%", effect: "links, pinch points and nearest wood" },
    };
    for (const [id, row] of Object.entries(faunaPoints)) {
        assert.ok(row.observed && row.effect, "fauna point " + id + " must have player evidence");
    }
    report.faunaPoints = faunaPoints;
    report.fauna = {
        points: Object.keys(faunaPoints).length,
        deerSpecies: deerNames,
        guilds: highest("faunaGuilds"),
        links: highest("faunaLinks"),
        keystone: faunaRows.map(row => row.faunaKeystone).filter(Boolean)[0] || null,
    };
    report.actions.harvestedTimber = {
        stockBefore: beforeThin.stock, stockAfter: afterThin.stock,
        logsBefore: beforeThin.localLogs, logsAfter: afterThin.localLogs,
    };
    report.final = { year: current.year, tick: current.tick, stock: after.stock, atlasSampled: after.sampled };
    // Return the settings to the normal 100 % render scale and dismiss the
    // chronicle notice so the final player frame shows the ordinary realm.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-render-scale").selectOption("100");
    await page.locator("#settings-close").click();
    await page.clock.runFor(200);
    await settleOverlays(page);
    await page.screenshot({ path: resolve(OUT, "forest-dynamics-live.png"), fullPage: false });
    assert.deepEqual(pageErrors, [], "no page errors are allowed");
    assert.deepEqual(consoleErrors, [], "no console errors are allowed");
    report.ok = true;
    await writeFile(resolve(OUT, "forest-dynamics-live.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        ok: true, base, seed: SEED, world: report.world, systems: report.systems,
        actions: report.actions, years: report.years, atlas: { cards: atlasCards, ecology: ecologyCount, samples: beforeAtlasSamples.length },
        final: report.final, points: Object.keys(points).length, pageErrors, consoleErrors,
    }, null, 2));
} catch (error) {
    report.ok = false;
    report.error = error.stack || error.message;
    await writeFile(resolve(OUT, "forest-dynamics-live.json"), JSON.stringify(report, null, 2)).catch(() => {});
    console.error(JSON.stringify({ ok: false, error: error.message, report: { started: report.started, world: report.world, systems: report.systems, actions: report.actions, years: report.years, pageErrors, consoleErrors } }, null, 2));
    throw error;
} finally {
    await browser.close();
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
