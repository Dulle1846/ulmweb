// Real browser proof for 1.2.19: open the atlas, survey, harvest, hunt, change
// policy, switch to the biome map layer and survive a save/reload with no
// page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4181;
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261119");
    await page.locator("#player-name-input").fill("Biome Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    const initial = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.resources.gold = 800;
        state.resources.wood = 300;
        const region = state.biomeAtlas.regions.find(entry => entry.discovered);
        return {
            atlas: Boolean(state.biomeAtlas),
            regions: state.biomeAtlas.regions.length,
            discovered: state.biomeAtlas.regions.filter(entry => entry.discovered).length,
            regionId: region.id,
            resources: region.resources.filter(row => row.discovered).length,
            fauna: region.fauna.filter(row => row.discovered).length
        };
    });
    assert.equal(initial.atlas, true);
    assert.equal(initial.regions, 36);
    assert.ok(initial.discovered >= 1);
    assert.ok(initial.resources >= 3);
    assert.ok(initial.fauna >= 1);

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="biome"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("ECOLOGICAL RECORD"), null, { timeout: 20000 });
    const panel = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panel, /REGIONS SURVEYED/);
    assert.match(panel, /REGIONAL ECONOMY/);
    assert.match(panel, /KNOWN RESOURCES/);
    assert.match(panel, /WILDLIFE/);

    const firstRegion = page.locator("[data-biome-region]").first();
    const ecoRegion = page.locator('[data-biome-region="' + initial.regionId + '"]');
    if (!await ecoRegion.evaluate(details => details.open)) await ecoRegion.locator("summary").first().click();
    const firstRegionText = await ecoRegion.innerText();
    assert.match(firstRegionText, /BIOME SYSTEM/);
    assert.match(firstRegionText, /FULL ECOLOGY LEDGER · 66 PARAMETERS/);
    assert.match(firstRegionText, /PREVAILING BIOME/);
    assert.match(firstRegionText, /ECOLOGICAL CHANGE/);
    const ledgerProof = await ecoRegion.evaluate(element => {
        const rows = [...element.querySelectorAll("[data-biome-requirement]")];
        const unique = new Set(rows.map(row => row.dataset.biomeRequirement));
        const required = Array.from({ length: 66 }, (_, index) => "1.2.21." + (index + 1));
        return {
            unique: unique.size,
            missing: required.filter(id => !unique.has(id)),
            empty: [...element.querySelectorAll(".biome-system-row[data-biome-requirement]")].filter(row => row.dataset.biomeValue === "" || row.dataset.biomeValue === "—").length,
            readout: [...element.querySelectorAll(".biome-system-readout [data-biome-requirement]")].map(row => row.textContent)
        };
    });
    assert.equal(ledgerProof.unique, 66, "the player panel must show all 66 point IDs");
    assert.deepEqual(ledgerProof.missing, []);
    assert.equal(ledgerProof.empty, 0, "no player-facing requirement may render an empty value");
    assert.equal(ledgerProof.readout.length, 10);

    assert.match(firstRegionText, /BIOME GENERATION · 1\.2\.22/);
    assert.match(firstRegionText, /FULL GENERATION LEDGER · 54 PARAMETERS/);
    const generationProof = await ecoRegion.evaluate(element => {
        const rows = [...element.querySelectorAll("[data-biome-generation-requirement]")];
        const unique = new Set(rows.map(row => row.dataset.biomeGenerationRequirement));
        const required = Array.from({ length: 54 }, (_, index) => "1.2.22." + (index + 1));
        return {
            unique: unique.size,
            missing: required.filter(id => !unique.has(id)),
            empty: rows.filter(row => !row.dataset.biomeGenerationValue || row.dataset.biomeGenerationValue === "—").length,
            readout: [...element.querySelectorAll("[data-biome-generation-readout] [data-biome-generation-requirement], [data-biome-generation-readout] span")].length,
            seasons: [...element.querySelectorAll("[data-biome-season-swatch]")].map(row => ({
                id: row.dataset.biomeSeasonSwatch,
                base: getComputedStyle(row).getPropertyValue("--season-base").trim(),
                accent: getComputedStyle(row).getPropertyValue("--season-accent").trim(),
                height: row.querySelector("i")?.getBoundingClientRect().height || 0
            })),
            plants: [...element.querySelectorAll("[data-biome-plant-chip]")].map(row => ({
                id: row.dataset.biomePlantChip,
                color: getComputedStyle(row).getPropertyValue("--plant-color").trim(),
                text: row.textContent.trim()
            }))
        };
    });
    assert.equal(generationProof.unique, 54, "the player panel must show all 54 generation point IDs");
    assert.deepEqual(generationProof.missing, []);
    assert.equal(generationProof.empty, 0, "no generation requirement may render an empty value");
    assert.ok(generationProof.readout >= 6);
    assert.equal(new Set(generationProof.seasons.map(row => row.id)).size, 4, "all four seasonal faces must be visible");
    assert.ok(generationProof.seasons.every(row => /^#[0-9a-f]{6}$/i.test(row.base) && /^#[0-9a-f]{6}$/i.test(row.accent)));
    assert.ok(generationProof.seasons.every(row => row.height >= 20), "season swatches must render as real colours");
    assert.ok(generationProof.plants.length >= 3, "the biome panel must show real plant species");
    assert.ok(generationProof.plants.every(row => /^#[0-9a-f]{6}$/i.test(row.color)), "plant chips must show their real colour");

    const ecoBefore = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { serializeCrossBiomeState } = await import("./js/systems/cross-biome-state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return { gold: state.resources.gold, systems: serializeCrossBiomeState(region.systems) };
    }, initial.regionId);
    await ecoRegion.locator('[data-command="biome-irrigate"]').click();
    await page.waitForFunction(async regionId => (await import("./js/core/state.js")).state.biomeAtlas.regions.find(entry => entry.id === regionId)?.systems.landUse.irrigation > 0, initial.regionId, { timeout: 15000 });
    await ecoRegion.locator('[data-command="biome-reforest"]').click();
    await page.waitForFunction(async regionId => (await import("./js/core/state.js")).state.biomeAtlas.regions.find(entry => entry.id === regionId)?.systems.landUse.reforestation > 0, initial.regionId, { timeout: 15000 });
    await ecoRegion.locator('[data-command="biome-clean-water"]').click();
    await ecoRegion.locator('[data-command="biome-slash-burn"]').click();
    const ecoAfter = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { serializeCrossBiomeState } = await import("./js/systems/cross-biome-state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return { gold: state.resources.gold, systems: serializeCrossBiomeState(region.systems), text: document.querySelector("#command-panel-content")?.textContent || "" };
    }, initial.regionId);
    assert.ok(ecoAfter.gold < ecoBefore.gold, "ecological actions must cost real gold");
    assert.ok(ecoAfter.systems.legacy > ecoBefore.systems.legacy, "slash-and-burn must leave a lasting legacy");
    assert.match(ecoAfter.text, /FULL ECOLOGY LEDGER/);

    await firstRegion.locator('[data-command="biome-survey"]').click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.surveyLevel >= 1;
    }, initial.regionId, { timeout: 15000 });

    // Pick a real local recipe and a harvested focus resource in the same
    // region. The old reference stopped at a generic first harvest; the craft
    // chain needs a region whose recipe is actually supplied by local rows.
    const craftTarget = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { getBiomeRegionSnapshot } = await import("./js/systems/biome-resource-state.js");
        const { BIOME_FOCUSES } = await import("./js/world/biome-resource-data.js");
        const first = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const ordered = [first, ...state.biomeAtlas.regions.filter(entry => entry.discovered && entry.id !== regionId)];
        for (const region of ordered) {
            if (!region || !region.discovered) continue;
            const snapshot = getBiomeRegionSnapshot(region.id);
            for (const recipe of snapshot.recipes) {
                if (!recipe.available) continue;
                const focusId = Object.keys(BIOME_FOCUSES).find(id => BIOME_FOCUSES[id].resourceCategories.includes(recipe.focusCategory));
                if (!focusId) continue;
                const categories = new Set(BIOME_FOCUSES[focusId].resourceCategories);
                const inputs = new Set(recipe.inputs.map(input => input.category));
                const resources = snapshot.resources.filter(row => row.discovered && row.seasonal && row.stock > 0 && categories.has(row.category));
                const resource = resources.find(row => !inputs.has(row.category)) || resources[0];
                if (!resource) continue;
                return {
                    regionId: region.id, recipeId: recipe.id, recipeLabel: recipe.label,
                    focusId, resourceId: resource.id, resourceCategory: resource.category,
                    craftCost: recipe.cost
                };
            }
        }
        return null;
    }, initial.regionId);
    assert.ok(craftTarget, "the seed needs a discovered local recipe with a matching focus resource");

    const craftRegionCard = page.locator('[data-biome-region="' + craftTarget.regionId + '"]');
    if (!await craftRegionCard.evaluate(details => details.open)) {
        await craftRegionCard.locator("summary").first().click();
    }
    const focusBefore = await page.evaluate(async regionId =>
        (await import("./js/core/state.js")).state.biomeAtlas.regions.find(entry => entry.id === regionId)?.focus,
    craftTarget.regionId);
    if (focusBefore !== craftTarget.focusId) {
        await craftRegionCard.locator('[data-biome-focus="' + craftTarget.focusId + '"]').click();
        await page.waitForFunction(async ({ regionId, focusId }) =>
            (await import("./js/core/state.js")).state.biomeAtlas.regions.find(entry => entry.id === regionId)?.focus === focusId,
        craftTarget, { timeout: 15000 });
    }

    const harvestButton = craftRegionCard.locator('[data-command="biome-harvest"][data-biome-resource="' + craftTarget.resourceId + '"]:not([disabled])');
    const stockBefore = await page.evaluate(async ({ regionId, resourceId }) => {
        const { state } = await import("./js/core/state.js");
        const { getBiomeRegionSnapshot } = await import("./js/systems/biome-resource-state.js");
        const snapshot = getBiomeRegionSnapshot(regionId);
        const row = snapshot.resources.find(entry => entry.id === resourceId);
        return { id: row.id, stock: row.stock, focusMatch: row.focusMatch, actionCost: row.actionCost };
    }, craftTarget);
    assert.equal(stockBefore.focusMatch, true, "the craft target requires a focus-matched harvest");
    await harvestButton.click();
    await page.waitForFunction(async ({ regionId, resourceId, before }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.resources.find(entry => entry.id === resourceId);
        return row && row.stock < before;
    }, { ...craftTarget, before: stockBefore.stock }, { timeout: 15000 });

    const craftState = () => page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return {
            gold: state.resources.gold,
            crafted: { ...(region.crafted || {}) },
            crafts: Number(state.biomeAtlas.stats.crafts) || 0,
            craftsSold: Number(state.biomeAtlas.stats.craftsSold) || 0,
            tradeGold: Number(state.biomeAtlas.trade?.gold) || 0
        };
    }, craftTarget.regionId);
    const craftBefore = await craftState();
    const craftButton = craftRegionCard.locator('[data-command="biome-craft"][data-biome-recipe="' + craftTarget.recipeId + '"]:not([disabled])');
    const craftButtonText = await craftButton.innerText();
    const craftCost = Number((craftButtonText.match(/(\d+)\s*G/) || [])[1] || craftTarget.craftCost);
    await craftButton.click();
    await page.waitForFunction(async ({ regionId, before }) => {
        const { state } = await import("./js/core/state.js");
        return Number(state.biomeAtlas.stats.crafts) === before;
    }, { regionId: craftTarget.regionId, before: craftBefore.crafts + 1 }, { timeout: 15000 });
    const afterCraft = await craftState();
    assert.equal(afterCraft.crafts, craftBefore.crafts + 1);
    assert.equal(afterCraft.crafted["craft-" + craftTarget.recipeId], 1);
    assert.equal(afterCraft.gold, craftBefore.gold - craftCost, "crafting must charge the displayed gold cost");

    const sellButton = craftRegionCard.locator('[data-command="biome-sell-craft"][data-biome-recipe="' + craftTarget.recipeId + '"]');
    await sellButton.click();
    await page.waitForFunction(async ({ regionId, before }) => {
        const { state } = await import("./js/core/state.js");
        return Number(state.biomeAtlas.stats.craftsSold) === before;
    }, { regionId: craftTarget.regionId, before: craftBefore.craftsSold + 1 }, { timeout: 15000 });
    const afterSale = await craftState();
    assert.equal(afterSale.craftsSold, craftBefore.craftsSold + 1);
    assert.equal(afterSale.crafted["craft-" + craftTarget.recipeId], 0);
    assert.ok(afterSale.tradeGold > craftBefore.tradeGold, "selling a crafted good must book trade revenue");
    assert.equal(afterSale.gold, afterCraft.gold + afterSale.tradeGold - craftBefore.tradeGold,
        "sale gold must equal the booked trade revenue");

    // Leave one processed good in the local store so the reload proves the
    // crafted state itself survives, not just an empty map.
    await craftButton.click();
    await page.waitForFunction(async ({ regionId, before }) => {
        const { state } = await import("./js/core/state.js");
        return Number(state.biomeAtlas.stats.crafts) === before;
    }, { regionId: craftTarget.regionId, before: craftBefore.crafts + 2 }, { timeout: 15000 });
    const afterSecondCraft = await craftState();
    assert.equal(afterSecondCraft.crafts, craftBefore.crafts + 2);
    assert.equal(afterSecondCraft.crafted["craft-" + craftTarget.recipeId], 1);
    assert.equal(afterSecondCraft.gold, afterSale.gold - craftCost, "the second craft must charge the same gold cost");
    const craftSummary = {
        region: craftTarget.regionId, recipe: craftTarget.recipeId, label: craftTarget.recipeLabel,
        focus: craftTarget.focusId, harvested: stockBefore.id, focusMatch: stockBefore.focusMatch,
        actionCost: stockBefore.actionCost, craftCost,
        crafted: afterSecondCraft.crafted, crafts: afterSecondCraft.crafts,
        craftsSold: afterSecondCraft.craftsSold, tradeGold: afterSecondCraft.tradeGold
    };

    const huntButton = page.locator('#command-panel-content [data-command="biome-hunt"]:not([disabled])').first();
    const huntTarget = await huntButton.evaluate(button => ({
        regionId: button.dataset.value, speciesId: button.dataset.biomeSpecies
    }));
    const faunaBefore = await page.evaluate(async ({ regionId, speciesId }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.fauna.find(entry => entry.id === speciesId);
        return { id: row.id, population: row.population };
    }, huntTarget);
    await huntButton.click();
    await page.waitForFunction(async ({ regionId, speciesId, before }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.fauna.find(entry => entry.id === speciesId);
        return row && row.population < before;
    }, { ...huntTarget, before: faunaBefore.population }, { timeout: 15000 });

    await page.locator('[data-biome-policy="conservation"]').first().click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.policy === "conservation";
    }, initial.regionId, { timeout: 15000 });

    const protectButton = craftRegionCard.locator('[data-command="biome-protect"]');
    await protectButton.click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.protectedArea === true;
    }, craftTarget.regionId, { timeout: 15000 });
    assert.match(await craftRegionCard.innerText(), /PROTECTED HABITAT|LIFT PROTECTION/);

    // 1.2.20 frontier exchange: a real harvest reduces surveyed stock and
    // extraction health, and the next market pass must quote the same pressure
    // the Trade tab explains to the player.
    const frontierTarget = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getBiomeMarketCategory } = await import("./js/systems/biome-market-link.js");
        const { getBiomeRegionSnapshot } = await import("./js/systems/biome-resource-state.js");
        // Pick the best-stocked commodity that is actually in season: the
        // reference must harvest several times without hitting an empty row.
        // Seasonal availability lives on the computed snapshot, not the raw row.
        const candidates = [];
        for (const region of state.biomeAtlas.regions) {
            if (!region.discovered) continue;
            for (const row of getBiomeRegionSnapshot(region.id).resources) {
                if (!row.discovered || row.locallyExtinct || row.stock <= 0 || !row.seasonal) continue;
                const market = getBiomeMarketCategory(row.category);
                if (market) candidates.push({ regionId: region.id, resourceId: row.id, market, stock: Math.round(row.stock) });
            }
        }
        candidates.sort((left, right) => right.stock - left.stock);
        return candidates[0] || null;
    });
    assert.ok(frontierTarget, "the opening realm needs one discovered commodity for the frontier link");
    const frontierBefore = await page.evaluate(async market => {
        const { getBiomeFrontierSupply } = await import("./js/systems/biome-market-link.js");
        return getBiomeFrontierSupply().categories[market];
    }, frontierTarget.market);
    const frontierCard = page.locator('[data-biome-region="' + frontierTarget.regionId + '"]');
    if (!await frontierCard.evaluate(details => details.open)) await frontierCard.locator("summary").first().click();
    const frontierHarvest = frontierCard.locator('[data-command="biome-harvest"][data-biome-resource="' + frontierTarget.resourceId + '"]');
    let frontierHarvests = 0;
    for (let index = 0; index < 3; index++) {
        // Each harvest re-renders the panel, so re-open the card and re-read the
        // button instead of holding a handle that may now be disabled.
        if (!await frontierCard.evaluate(details => details.open)) await frontierCard.locator("summary").first().click();
        if (await frontierHarvest.count() === 0) break;
        if (await frontierHarvest.isDisabled()) break;
        const harvestsBefore = await page.evaluate(async () => Number((await import("./js/core/state.js")).state.biomeAtlas.stats.harvests) || 0);
        await frontierHarvest.click();
        await page.waitForFunction(async before =>
            Number((await import("./js/core/state.js")).state.biomeAtlas.stats.harvests) >= before,
        harvestsBefore + 1, { timeout: 15000 });
        frontierHarvests++;
    }
    assert.ok(frontierHarvests >= 2, "the frontier proof needs at least two real harvests; got " + frontierHarvests);
    const frontierAfter = await page.evaluate(async ({ market, before }) => {
        const { state } = await import("./js/core/state.js");
        const { getBiomeFrontierSupply } = await import("./js/systems/biome-market-link.js");
        const { updateMarket } = await import("./js/systems/market.js");
        const live = getBiomeFrontierSupply().categories[market];
        if (live.pressure <= before.pressure) throw new Error("three harvests did not tighten the frontier");
        state.market.lastUpdateTick = 0;
        state.tick = Math.max(90, Number(state.tick) || 0);
        updateMarket();
        return {
            live,
            quoted: state.market.frontierSupply.categories[market],
            price: state.market.prices[market],
            gold: state.resources.gold
        };
    }, { market: frontierTarget.market, before: frontierBefore });
    assert.ok(frontierAfter.live.pressure > frontierBefore.pressure);
    assert.ok(frontierAfter.quoted.priceFactor > 1, "the next exchange quote must carry frontier pressure");
    assert.ok(frontierAfter.price > 0);

    await page.locator("#command-close").click();
    await page.locator("#tab-2").click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#tab-content")?.textContent || "";
        return text.includes("FRONTIER SUPPLY") && text.includes("CHARTED BIOMES");
    }, null, { timeout: 10000 });
    const frontierPanel = await page.locator("#tab-content").innerText();
    assert.match(frontierPanel, /FRONTIER SUPPLY/);
    assert.match(frontierPanel, /NEXT QUOTE/);
    assert.match(frontierPanel, new RegExp(frontierTarget.market.toUpperCase()));
    assert.match(frontierPanel, /STOCK ·/);
    // The proof shot must show the block itself, not the top of a long tab.
    await page.locator(".frontier-supply").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/biome-market-link.png", fullPage: false });
    await page.locator("#map-layer-select").selectOption("biomes");
    await page.locator('[data-zoom-level="3"]').click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        const { shouldDrawForestPoints } = await import("./js/systems/biome-resource-state.js");
        return state.mapLayer === "biomes" && shouldDrawForestPoints(state.zoomLevel, state.mapLayer);
    }, null, { timeout: 5000 });

    const mapProof = await page.evaluate(async regionId => {
        const { getBiomeOverlayCells } = await import("./js/systems/biome-resource-state.js");
        const cell = getBiomeOverlayCells().find(entry => entry.id === regionId);
        return { markers: cell?.markers?.length || 0, refuges: cell?.refuges?.length || 0, seasonTint: cell?.seasonTint || "", seasonLook: cell?.seasonLook || "" };
    }, craftTarget.regionId);
    assert.ok(mapProof.markers >= 1, "the biome layer needs resource markers for the surveyed region");
    assert.ok(mapProof.refuges >= 1, "the biome layer needs refuge markers for the surveyed region");
    assert.match(mapProof.seasonTint, /^#[0-9a-f]{6}$/i, "the biome layer needs a real seasonal tint");
    assert.ok(mapProof.seasonLook.length > 4, "the biome layer needs a seasonal face label");

    const densityProof = await page.evaluate(async regionId => {
        const atlas = await import("./js/systems/biome-resource-state.js");
        const { state } = await import("./js/core/state.js");
        atlas.invalidateBiomeTileCache();
        atlas.beginBiomeDensityFrame("browser-budget");
        const before = atlas.getBiomeTileSampleStats();
        atlas.getBiomeDensityCells("browser-budget");
        const firstFrame = atlas.getBiomeTileSampleStats();
        let cell = null;
        for (let frame = 0; frame < 48 && !cell?.families?.length; frame++) {
            const key = "browser-density-" + frame;
            atlas.beginBiomeDensityFrame(key);
            cell = atlas.getBiomeDensityCells(key).find(entry => entry.id === regionId) || null;
        }
        return {
            budget: before.frameSize,
            firstFrameMisses: firstFrame.cacheMisses,
            families: cell?.families?.map(family => ({
                id: family.id, value: family.value, points: family.points.length, color: family.color
            })) || [],
            region: { x: cell?.x, y: cell?.y, width: cell?.width, height: cell?.height },
            renderedFrames: Number(state.renderedFrames) || 0
        };
    }, craftTarget.regionId);
    assert.ok(densityProof.families.length >= 1, "the biome layer needs a discovered resource-density reading");
    assert.ok(densityProof.firstFrameMisses <= densityProof.budget, "density sampling stays inside its per-frame budget");
    for (const family of densityProof.families) {
        assert.ok(["timber", "stone", "flora", "fiber", "fish", "animal"].includes(family.id));
        assert.ok(family.value >= 0 && family.value <= 100);
        assert.ok(family.points <= 2, "detail points stay clustered");
        assert.match(family.color, /^#[0-9a-f]{6}$/i);
    }
    await page.waitForFunction(() => {
        const text = document.querySelector("#map-layer-legend")?.textContent || "";
        return text.includes("Timber & resin") && text.includes("Fish & coast");
    }, null, { timeout: 5000 });
    const legendText = await page.locator("#map-layer-legend").innerText();
    assert.match(legendText, /SEASONAL FACE/);
    assert.match(legendText, /Survey bars/);
    assert.match(legendText, /stay above the wash/);
    assert.match(legendText, /obey survey visibility/);

    const beforeSave = await page.evaluate(async ({ regionId, craftRegionId, market }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const craftRegion = state.biomeAtlas.regions.find(entry => entry.id === craftRegionId);
        return {
            policy: region.policy,
            surveyLevel: region.surveyLevel,
            protectedArea: craftRegion.protectedArea,
            stock: region.resources.map(row => [row.id, Math.round(row.stock)]),
            fauna: region.fauna.map(row => [row.id, Math.round(row.population * 10) / 10]),
            craft: {
                crafted: { ...(craftRegion.crafted || {}) },
                crafts: Number(state.biomeAtlas.stats.crafts) || 0,
                craftsSold: Number(state.biomeAtlas.stats.craftsSold) || 0,
                gold: state.resources.gold
            },
            frontier: (await import("./js/systems/biome-market-link.js")).getBiomeFrontierSupply().categories[market],
            marketFrontier: state.market.frontierSupply.categories[market],
            marketPrice: state.market.prices[market],
            ecology: (await import("./js/systems/cross-biome-state.js")).serializeCrossBiomeState(region.systems)
        };
    }, { regionId: initial.regionId, craftRegionId: craftTarget.regionId, market: frontierTarget.market });
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed");
    }, null, { timeout: 20000 });
    const loadStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the biome realm must load; actual: " + loadStatus);
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });

    // Give the save pipeline a beat to finish any sliced annual work before the
    // panel reads its restored records. Then prove the frontier quote is
    // legible in the same Trade tab a player uses after reload.
    await page.waitForTimeout(250);
    await page.locator("#tab-2").click();
    await page.waitForFunction(() => (document.querySelector("#tab-content")?.textContent || "").includes("FRONTIER SUPPLY"), null, { timeout: 10000 });
    const restoredTrade = await page.locator("#tab-content").innerText();
    assert.match(restoredTrade, /FRONTIER SUPPLY/);
    assert.match(restoredTrade, /STOCK ·/);
    await page.locator(".frontier-supply").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/biome-market-link-restored.png", fullPage: false });
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="biome"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("ECOLOGICAL RECORD"), null, { timeout: 20000 });
    const restored = await page.evaluate(async ({ regionId, craftRegionId, market }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const craftRegion = state.biomeAtlas.regions.find(entry => entry.id === craftRegionId);
        return {
            policy: region.policy,
            surveyLevel: region.surveyLevel,
            protectedArea: craftRegion.protectedArea,
            stock: region.resources.map(row => [row.id, Math.round(row.stock)]),
            fauna: region.fauna.map(row => [row.id, Math.round(row.population * 10) / 10]),
            craft: {
                crafted: { ...(craftRegion.crafted || {}) },
                crafts: Number(state.biomeAtlas.stats.crafts) || 0,
                craftsSold: Number(state.biomeAtlas.stats.craftsSold) || 0,
                gold: state.resources.gold
            },
            frontier: (await import("./js/systems/biome-market-link.js")).getBiomeFrontierSupply().categories[market],
            marketFrontier: state.market.frontierSupply.categories[market],
            marketPrice: state.market.prices[market],
            text: document.querySelector("#command-panel-content")?.textContent || "",
            ecology: (await import("./js/systems/cross-biome-state.js")).serializeCrossBiomeState(region.systems)
        };
    }, { regionId: initial.regionId, craftRegionId: craftTarget.regionId, market: frontierTarget.market });
    assert.equal(restored.policy, "conservation");
    assert.equal(restored.protectedArea, true, "protected-habitat status must survive reload");
    assert.ok(restored.surveyLevel >= 1);
    assert.deepEqual(restored.stock, beforeSave.stock);
    assert.deepEqual(restored.fauna, beforeSave.fauna);
    assert.deepEqual(restored.craft, beforeSave.craft, "crafted stock, counters and gold must survive reload");
    assert.deepEqual(restored.frontier, beforeSave.frontier, "the frontier reading must survive reload");
    assert.deepEqual(restored.marketFrontier, beforeSave.marketFrontier, "the saved market quote must survive reload");
    assert.equal(restored.marketPrice, beforeSave.marketPrice);
    assert.deepEqual(restored.ecology, beforeSave.ecology, "soil, water, land-use and legacy state must survive reload");
    assert.equal(restored.craft.crafts, 2);
    assert.equal(restored.craft.craftsSold, 1);
    assert.deepEqual(restored.craft.crafted, { ["craft-" + craftTarget.recipeId]: 1 });
    assert.match(restored.text, /CONSERVE/);
    assert.match(restored.text, /LOCAL CRAFTS/);
    const restoredCraftCard = page.locator('[data-biome-region="' + craftTarget.regionId + '"]');
    if (!await restoredCraftCard.evaluate(details => details.open)) await restoredCraftCard.locator("summary").first().click();
    const restoredCraftText = await restoredCraftCard.innerText();
    assert.match(restoredCraftText, /LOCAL CRAFT RECIPES/);
    assert.match(restoredCraftText, /SELL · 1/);
    assert.match(restoredCraftText, /CRAFT · \d+G/);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        seed: 20261119,
        region: initial.regionId,
        regions: initial.regions,
        harvest: stockBefore.id,
        hunted: faunaBefore.id,
        craft: craftSummary,
        policy: restored.policy,
        markers: mapProof.markers,
        refuges: mapProof.refuges,
        densityFamilies: densityProof.families.map(family => family.id),
        frontier: {
            market: frontierTarget.market, resource: frontierTarget.resourceId,
            beforePressure: frontierBefore.pressure, afterPressure: restored.frontier.pressure,
            band: restored.frontier.band, quotedPrice: restored.marketPrice
        },
        protectedArea: restored.protectedArea,
        loaded: loadStatus,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
