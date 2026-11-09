import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {chromium} from "playwright";

// Five game years on one real Forester range. Each year starts with a fresh
// cut of three stands, is thinned every twenty days and receives one annual
// clear-cut. The audit reads the rendered stewardship block, counts the real
// map markers on the canvas and hashes the terrain raster before and after
// each yearly recovery. It is deliberately separate from the short
// stewardship audit: a Forester can look healthy for 200 ticks and still lose
// a multi-year race against repeated harvest.
const YEARS = 5;
const DAYS_PER_YEAR = 400;
const SEED = "20261108";
const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4176;
const remoteOrigin = process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).origin : null;
const outDir = resolve(root, process.env.FORESTER_LONGTERM_OUT || "docs/forester-stewardship-longrun");
await mkdir(outDir, {recursive: true});

const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav"
};
const server = remoteOrigin ? null : createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end("Forbidden"); return; }
        const data = await readFile(file);
        res.writeHead(200, {"content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store"});
        res.end(data);
    } catch {
        res.writeHead(404, {"content-type": "text/plain"}).end("Not found");
    }
});
if (server) await new Promise(resolveListen => server.listen(port, "127.0.0.1", resolveListen));
const baseUrl = remoteOrigin || ("http://127.0.0.1:" + port);
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, reducedMotion: "reduce"});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

async function dismissBlockingMessage() {
    const eventDismiss = page.locator("#realm-event-dismiss");
    if (await eventDismiss.isVisible().catch(() => false)) {
        await eventDismiss.click();
        await page.waitForTimeout(120);
    }
    const button = page.locator("#big-message-close");
    if (await button.isVisible().catch(() => false)) await button.click();
}

async function advanceForestDays(days, options = {}) {
    const result = await page.evaluate(async ({days, startDay, thinning, clearCut, foresterId}) => {
        const [{state}, {updateFields}, {harvestForest, regrowForests}, {updateBuildingIncome}, {foresterRangeSummary}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/fields.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/simulation/buildings.js"),
            import("./js/systems/fields.js")
        ]);
        const forester = state.entities.find(entity => !entity.dead && String(entity.id) === String(foresterId));
        if (!forester) throw new Error("The audited Forester disappeared from the live realm");
        state.isPaused = false;
        let harvested = 0;
        let plantingDays = 0;
        let grownDays = 0;
        let lowestFill = 1;
        const badReasons = new Set();
        for (let index = 0; index < days; index++) {
            const day = startDay + index;
            state.tick++;
            state.dayOfYear++;
            if (state.dayOfYear >= 400) {
                state.dayOfYear = 0;
                state.year++;
            }
            state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
            updateFields();
            regrowForests(400, {slice: state.tick % 400, slices: 400});
            if (state.tick % 6 === 0) updateBuildingIncome();
            if (thinning && day % 20 === 0) {
                for (const tile of thinning) harvested += harvestForest(tile.x, tile.y, 2);
            }
            if (clearCut && day === 180) {
                for (const tile of clearCut) harvested += harvestForest(tile.x, tile.y, tile.capacity);
            }
            const range = foresterRangeSummary(forester);
            lowestFill = Math.min(lowestFill, range.fill);
            if (forester.foresterReason === "Planting saplings") plantingDays++;
            if (forester.foresterReason === "Forest is fully grown") grownDays++;
            if (forester.foresterReason === "Waiting for planting space") badReasons.add("Waiting for planting space");
            if (String(forester.foresterReason).includes("depleted")) badReasons.add(String(forester.foresterReason));
        }
        state.isPaused = true;
        return {
            harvested,
            plantingDays,
            grownDays,
            lowestFill,
            badReasons: [...badReasons],
            tick: state.tick,
            year: state.year,
            dayOfYear: state.dayOfYear,
            visualRevision: Number(state.forestVisualRevision) || 0,
            cacheMisses: Number(state.terrainCacheMisses) || 0
        };
    }, {days, startDay: options.startDay ?? 0, thinning: options.thinning || null, clearCut: options.clearCut || null, foresterId: options.foresterId});
    await page.waitForTimeout(80);
    await dismissBlockingMessage();
    return result;
}

async function cutStands(tiles) {
    return page.evaluate(async coords => {
        const [{state}, {harvestForest, getResourceNodeAt}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js")
        ]);
        let taken = 0;
        for (const tile of coords) {
            const node = getResourceNodeAt(tile.x, tile.y);
            taken += harvestForest(tile.x, tile.y, node.forestCapacity);
        }
        return {taken, tick: state.tick, year: state.year, dayOfYear: state.dayOfYear};
    }, tiles);
}

async function canvasDigests() {
    return page.evaluate(() => {
        const digest = (canvas) => {
            const context = canvas?.getContext?.("2d");
            if (!context) return null;
            try {
                const {width, height} = canvas;
                const pixels = context.getImageData(0, 0, width, height).data;
                let hash = 2166136261 >>> 0;
                let samples = 0;
                const stride = Math.max(4, Math.floor((width * height) / 18000) * 4);
                for (let index = 0; index < pixels.length; index += stride) {
                    hash ^= pixels[index]; hash = Math.imul(hash, 16777619) >>> 0;
                    hash ^= pixels[index + 1] || 0; hash = Math.imul(hash, 16777619) >>> 0;
                    hash ^= pixels[index + 2] || 0; hash = Math.imul(hash, 16777619) >>> 0;
                    samples++;
                }
                return {hash: hash.toString(16).padStart(8, "0"), samples, width, height};
            } catch { return null; }
        };
        return {
            terrain: digest(document.getElementById("terrain-canvas")),
            interactive: digest(document.getElementById("canvas"))
        };
    });
}

// Markers are painted in the main canvas after the terrain, so a marker pixel
// is exactly 92% marker colour over the unselected baseline pixel. Sampling the
// tile centres and comparing against that blend distinguishes a real marker
// from a tree crown or a terrain tint without touching game code.
async function markerAudit(foresterId, tiles) {
    return page.evaluate(async ({id, tiles}) => {
        const [{state}, {drawWorld}, {getResourceNodeAt}, {CELL}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/rendering/renderer.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/core/config.js")
        ]);
        const ctx = state.ctx;
        const positions = tiles.map(tile => ({
            x: Math.round((tile.x + 0.5) * CELL * state.zoom - state.camera.x),
            y: Math.round((tile.y + 0.5) * CELL * state.zoom - state.camera.y)
        })).map(point => ({
            ...point,
            visible: point.x >= 2 && point.y >= 2 && point.x < state.canvas.width - 2 && point.y < state.canvas.height - 2
        }));
        const sample = point => Array.from(ctx.getImageData(point.x, point.y, 1, 1).data).slice(0, 3);
        const previousSelection = state.selectedBuildingId;
        state.selectedBuildingId = null;
        drawWorld();
        const baseline = positions.map(point => point.visible ? sample(point) : null);
        state.selectedBuildingId = id;
        drawWorld();
        const counts = {total: 0, matched: 0, red: 0, yellow: 0, green: 0, visible: 0};
        const rows = tiles.map((tile, index) => {
            const point = positions[index];
            const node = getResourceNodeAt(tile.x, tile.y);
            const restorable = node.forestCapacity > 0 && node.forestStock < node.forestCapacity;
            if (!restorable || !point.visible || !baseline[index]) return {x: tile.x, y: tile.y, visible: false, restorable};
            counts.visible++;
            counts.total++;
            const ratio = node.forestStock / Math.max(1, node.forestCapacity);
            const marker = ratio <= 0 ? [233, 133, 123] : ratio < 0.5 ? [228, 189, 114] : [163, 214, 167];
            const expected = marker.map((value, channel) => Math.round(value * 0.92 + baseline[index][channel] * 0.08));
            const actual = sample(point);
            const delta = Math.max(...expected.map((value, channel) => Math.abs(value - actual[channel])));
            const matched = delta <= 8;
            if (matched) {
                counts.matched++;
                if (ratio <= 0) counts.red++;
                else if (ratio < 0.5) counts.yellow++;
                else counts.green++;
            }
            return {x: tile.x, y: tile.y, visible: true, restorable, stock: node.forestStock, capacity: node.forestCapacity, ratio, matched, delta};
        });
        state.selectedBuildingId = previousSelection;
        drawWorld();
        return {counts, rows};
    }, {id: foresterId, tiles});
}

async function refreshBuildingRegister() {
    await dismissBlockingMessage();
    if (await page.locator("#command-modal").evaluate(element => element.classList.contains("hidden"))) {
        await page.locator("#command-open-btn").click();
    }
    await page.locator('[data-command-tab="buildings"]').click();
    await page.locator("#command-panel-content .building-register").waitFor({timeout: 10000});
}

async function readForesterRecord(foresterId) {
    await refreshBuildingRegister();
    const record = page.locator("#command-panel-content .building-record").filter({hasText: foresterId});
    assert.equal(await record.count(), 1, "the Forester must have exactly one building-register row");
    await record.scrollIntoViewIfNeeded();
    if (!await record.evaluate(element => element.open)) await record.locator("summary").click();
    await page.waitForTimeout(80);
    const recordText = (await record.innerText()).replace(/\s+/g, " ").trim();
    const block = record.locator("[data-forester-stewardship]");
    assert.equal(await block.count(), 1, "the Forester record must contain a dedicated stewardship block");
    const values = await block.evaluate(element => ({
        stock: Number(element.dataset.forestStock),
        capacity: Number(element.dataset.forestCapacity),
        restorable: Number(element.dataset.forestRestorable),
        status: String(element.dataset.forestStatus || "")
    }));
    const blockText = (await block.innerText()).replace(/\s+/g, " ").trim();
    assert.ok(blockText.includes("FOREST STEWARDSHIP"), "the stewardship block must identify itself to a player");
    assert.ok(["Planting saplings", "Waiting for planting space", "Forest is fully grown"].includes(values.status),
        "the block must expose a real live stewardship status");
    const percent = Number((blockText.match(/(\d+)%/) || [])[1]);
    assert.ok(Number.isFinite(percent), "the stewardship block must expose a visible percentage");
    return {element: record, block, recordText, blockText, percent, ...values};
}

async function stageForCapture() {
    const previous = await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        const before = {
            dayOfYear: state.dayOfYear,
            seasonIndex: state.seasonIndex,
            timeOfDay: state.timeOfDay,
            weather: state.weather,
            weatherTimer: state.weatherTimer
        };
        // Fixed daylight and season keep every yearly frame comparable; forest
        // cover, never foliage timing, is what the screenshots must prove.
        state.dayOfYear = 150;
        state.seasonIndex = 1;
        state.timeOfDay = 12;
        state.weather = "clear";
        state.weatherTimer = 0;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        return before;
    });
    await page.waitForTimeout(1100);
    return previous;
}

async function restoreAfterCapture(previous) {
    await page.evaluate(async before => {
        const {state} = await import("./js/core/state.js");
        state.dayOfYear = before.dayOfYear;
        state.seasonIndex = before.seasonIndex;
        state.timeOfDay = before.timeOfDay;
        state.weather = before.weather;
        state.weatherTimer = before.weatherTimer;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
    }, previous);
    await page.waitForTimeout(180);
}

async function captureMapCloseup(path, site) {
    const box = await page.locator("#canvas-wrapper").boundingBox();
    if (!box) throw new Error("The map stage has no bounding box");
    const point = await page.evaluate(async ({site, coords}) => {
        const [{state}, {CELL}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/config.js")
        ]);
        return {
            x: (coords.x + 0.5) * CELL * state.zoom - state.camera.x,
            y: (coords.y + 0.5) * CELL * state.zoom - state.camera.y
        };
    }, {site, coords: site});
    const width = Math.min(720, box.width - 30);
    const height = Math.min(570, box.height - 30);
    const x = Math.min(Math.max(box.x + point.x - width / 2, box.x), box.x + box.width - width);
    const y = Math.min(Math.max(box.y + point.y - height / 2, box.y), box.y + box.height - height);
    await page.screenshot({path, clip: {x, y, width, height}});
}

async function stateSample(foresterId, targets) {
    return page.evaluate(async ({id, coords}) => {
        const [{state}, {foresterRangeSummary}, {getResourceNodeAt}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/fields.js"),
            import("./js/systems/resource-geography.js")
        ]);
        const forester = state.entities.find(entity => !entity.dead && String(entity.id) === String(id));
        if (!forester) throw new Error("Forester disappeared from the live realm");
        const range = foresterRangeSummary(forester);
        return {
            tick: state.tick,
            dayOfYear: state.dayOfYear,
            year: state.year,
            isPaused: state.isPaused,
            mode: state.terrainMode,
            workerCount: Number(forester.workerCount) || 0,
            planted: Number(forester.foresterPlanted) || 0,
            reason: forester.foresterReason || "",
            productionReason: forester.productionReason || "",
            range,
            visualRevision: Number(state.forestVisualRevision) || 0,
            cacheMisses: Number(state.terrainCacheMisses) || 0,
            targets: coords.map(tile => {
                const node = getResourceNodeAt(tile.x, tile.y);
                return {x: tile.x, y: tile.y, stock: node.forestStock, capacity: node.forestCapacity};
            })
        };
    }, {id: foresterId, coords: targets});
}

function parseDomValues(record) {
    return {
        stock: record.stock,
        capacity: record.capacity,
        percent: record.percent,
        restorable: record.restorable,
        status: record.status
    };
}

function assertRenderedState(record, sample, label) {
    assert.ok(!record.recordText.includes("Forest stand is depleted"),
        `${label}: a planting Forester must never show the false depletion status`);
    assert.deepEqual(parseDomValues(record), {
        stock: sample.range.stock,
        capacity: sample.range.capacity,
        percent: Math.round(sample.range.fill * 100),
        restorable: sample.range.restorable,
        status: sample.reason
    }, `${label}: the rendered stewardship block must match the live simulation`);
}

try {
    await page.goto(baseUrl + "/", {waitUntil: "networkidle", timeout: 60000});
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    await page.locator("#start-screen").waitFor({state: "visible", timeout: 30000});
    await page.locator("#world-seed-input").fill(SEED);
    await page.waitForFunction(seed => document.querySelector("#world-preview-status")?.textContent.includes("SEED " + seed), SEED, {timeout: 20000}).catch(() => {});
    await page.locator("#player-name-input").fill("Forester Long-Term Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({state: "hidden", timeout: 30000});
    await page.waitForTimeout(1600);
    await dismissBlockingMessage();
    await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = true;
    });

    const setup = await page.evaluate(async ({year}) => {
        const [{state}, {TYPE}, {CELL}, {spawnEntity, buildingAt}, {getResourceNodeAt, plantForestAt}, {foresterRangeSummary}, {updateFields}] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"), import("./js/core/config.js"),
            import("./js/world/entities.js"), import("./js/systems/resource-geography.js"),
            import("./js/systems/fields.js"), import("./js/systems/fields.js")
        ]);
        const canvas = state.canvas;
        const centerX = (state.camera.x + canvas.width / 2) / (CELL * state.zoom);
        const centerY = (state.camera.y + canvas.height / 2) / (CELL * state.zoom);
        const occupied = (x, y) => Boolean(buildingAt(x, y));
        const clearOfBuildings = (x, y, radius) => {
            for (let oy = -radius; oy <= radius; oy++) {
                for (let ox = -radius; ox <= radius; ox++) {
                    if (occupied(x + ox, y + oy)) return false;
                }
            }
            return true;
        };
        const candidates = [];
        for (let y = 8; y < state.worldH - 8; y++) {
            for (let x = 8; x < state.worldW - 8; x++) {
                if (!state.explored?.[x]?.[y] || !clearOfBuildings(x, y, 2)) continue;
                const siteNode = getResourceNodeAt(x, y);
                if (!siteNode || siteNode.forestCapacity <= 0) continue;
                const distance = Math.hypot(x - centerX, y - centerY);
                if (distance < 5 || distance > 20) continue;
                const forest = [];
                const low = [];
                for (let oy = -5; oy <= 5; oy++) {
                    for (let ox = -5; ox <= 5; ox++) {
                        if (Math.max(Math.abs(ox), Math.abs(oy)) > 5) continue;
                        const tx = x + ox, ty = y + oy;
                        const node = getResourceNodeAt(tx, ty);
                        if (!node || node.forestCapacity <= 0 || occupied(tx, ty) || !state.explored?.[tx]?.[ty]) continue;
                        forest.push({x: tx, y: ty, capacity: node.forestCapacity, stock: node.forestStock});
                        if (Math.max(Math.abs(ox), Math.abs(oy)) <= 2 && node.forestCapacity <= 110 && clearOfBuildings(tx, ty, 1)) {
                            low.push({x: tx, y: ty, capacity: node.forestCapacity});
                        }
                    }
                }
                if (forest.length < 16 || low.length < 4) continue;
                candidates.push({x, y, distance, forest, lowCount: low.length});
            }
        }
        const siteScore = site => site.forest.length + site.lowCount * 3 - site.distance * 0.2;
        candidates.sort((a, b) => siteScore(b) - siteScore(a));
        const site = candidates[0];
        if (!site) throw new Error("Could not find an explored forest site with sixteen stands near the camera");
        const range = [];
        for (let oy = -5; oy <= 5; oy++) {
            for (let ox = -5; ox <= 5; ox++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) > 5) continue;
                const node = getResourceNodeAt(site.x + ox, site.y + oy);
                if (!node || node.forestCapacity <= 0 || occupied(site.x + ox, site.y + oy)) continue;
                range.push({x: site.x + ox, y: site.y + oy, capacity: node.forestCapacity});
            }
        }
        const targetCandidates = range
            .filter(tile => Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= 2 && (tile.x !== site.x || tile.y !== site.y) && clearOfBuildings(tile.x, tile.y, 1))
            .sort((a, b) => a.capacity - b.capacity || Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y));
        if (targetCandidates.length < 4) throw new Error("The forest site needs four low-capacity neighbour stands");
        const targets = targetCandidates.slice(0, 4);
        const clearCut = targets.slice(0, 3);
        // Start from a complete woodland so every later gap is harvest damage.
        for (const tile of range) plantForestAt(tile.x, tile.y, tile.capacity);
        const forester = spawnEntity(site.x, site.y, TYPE.FORESTER);
        if (!forester) throw new Error("Could not place the Forester");
        forester.construction = null;
        for (let index = 0; index < 2; index++) {
            const worker = spawnEntity(site.x + (index ? 2 : -2), site.y + 3, TYPE.VILLAGER);
            if (!worker) throw new Error("Could not place a Forester worker");
            worker.workplace = forester;
            worker.job = "forester";
            worker.anchor = {x: site.x, y: site.y};
            worker.jobRefreshTimer = 1_000_000;
        }
        // A clean year boundary makes the five yearly rows comparable.
        state.year = year;
        state.dayOfYear = 0;
        state.seasonIndex = 0;
        state.weather = "clear";
        state.weatherTimer = 0;
        const zoom = 2.45;
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomLevel = 3;
        state.camera.x = (site.x + 0.5) * CELL * zoom - canvas.width / 2;
        state.camera.y = (site.y + 0.5) * CELL * zoom - canvas.height / 2;
        state.selectedBuildingId = forester.id;
        updateFields();
        return {
            seed: state.worldSeed,
            world: [state.worldW, state.worldH],
            site: {x: site.x, y: site.y},
            foresterId: forester.id,
            targets,
            clearCut,
            range,
            rangeStart: foresterRangeSummary(forester),
            camera: {...state.camera},
            zoom
        };
    }, {year: 1});
    assert.equal(setup.rangeStart.restorable, 0, "the fixture range must start fully grown");
    assert.equal(setup.rangeStart.stock, setup.rangeStart.capacity);
    const initialSample = await stateSample(setup.foresterId, setup.clearCut);

    const rows = [];
    let harvestedTotal = 0;
    let plantedAtStart = 0;
    let lastVisualRevision = initialSample.visualRevision;
    const screenshots = [];

    for (let year = 1; year <= YEARS; year++) {
        // A fresh yearly cut gives the player an unmistakable marker frame
        // before the Forester starts repairing it.
        const cut = await cutStands(setup.clearCut);
        harvestedTotal += cut.taken;
        assert.equal(cut.taken > 0, true, `year ${year}: the yearly cut must remove real stock`);

        const cutStage = await stageForCapture();
        const cutDigest = await canvasDigests();
        const cutMarkers = await markerAudit(setup.foresterId, setup.clearCut);
        await captureMapCloseup(resolve(outDir, `map-year-${year}-cut.png`), setup.site);
        screenshots.push(`map-year-${year}-cut.png`);
        assert.equal(cutMarkers.counts.matched, 3, `year ${year}: every freshly cut stand must carry a visible marker`);
        assert.equal(cutMarkers.counts.red, 3, `year ${year}: freshly cut stands must be marked red`);
        await restoreAfterCapture(cutStage);

        // One real day lets the Forester answer the cut before the panel is read.
        await advanceForestDays(1, {foresterId: setup.foresterId});
        const planting = await stateSample(setup.foresterId, setup.clearCut);
        assert.equal(planting.reason, "Planting saplings", `year ${year}: the cut must start replanting`);
        assert.ok(planting.range.restorable >= 2, `year ${year}: the cut must leave restorable stands`);
        const plantingRecord = await readForesterRecord(setup.foresterId);
        assertRenderedState(plantingRecord, planting, `year ${year} planting`);
        if (year === 1 || year === YEARS) {
            await plantingRecord.block.screenshot({path: resolve(outDir, `stewardship-year-${year}-planting.png`)});
            screenshots.push(`stewardship-year-${year}-planting.png`);
        }
        await page.locator("#command-close").click();

        // The remaining 399 days carry the repeated harvest schedule. The last
        // thinning is on day 380, leaving nineteen days to refill before the
        // yearly measurement.
        const season = await advanceForestDays(DAYS_PER_YEAR - 1, {
            startDay: 1,
            thinning: setup.targets,
            clearCut: setup.clearCut,
            foresterId: setup.foresterId
        });
        assert.deepEqual(season.badReasons, [],
            `year ${year}: the range must never report depletion or wait for space`);
        assert.ok(season.harvested > 0, `year ${year}: the repeated harvest must remove stock`);
        harvestedTotal += season.harvested;

        const grown = await stateSample(setup.foresterId, setup.clearCut);
        assert.equal(grown.reason, "Forest is fully grown", `year ${year}: the range must end fully grown`);
        assert.equal(grown.range.restorable, 0, `year ${year}: every stand must be restored at year end`);
        assert.equal(grown.range.stock, grown.range.capacity, `year ${year}: the range must end at full stock`);
        assert.equal(grown.workerCount, 2, `year ${year}: both Foresters must remain employed`);
        assert.ok(grown.planted - plantedAtStart > 0, `year ${year}: the Forester must have planted stock`);
        assert.ok(grown.visualRevision > lastVisualRevision,
            `year ${year}: harvest and regrowth must invalidate the cached woodland`);
        const grownRecord = await readForesterRecord(setup.foresterId);
        assertRenderedState(grownRecord, grown, `year ${year} grown`);
        if (year === 1 || year === YEARS) {
            await grownRecord.block.screenshot({path: resolve(outDir, `stewardship-year-${year}-grown.png`)});
            screenshots.push(`stewardship-year-${year}-grown.png`);
        }
        if (year === YEARS) {
            await page.screenshot({path: resolve(outDir, "panel-year-5-grown.png")});
            screenshots.push("panel-year-5-grown.png");
        }
        await page.locator("#command-close").click();

        const grownStage = await stageForCapture();
        const grownDigest = await canvasDigests();
        const grownMarkers = await markerAudit(setup.foresterId, setup.clearCut);
        await captureMapCloseup(resolve(outDir, `map-year-${year}-grown.png`), setup.site);
        screenshots.push(`map-year-${year}-grown.png`);
        await restoreAfterCapture(grownStage);

        assert.equal(grownMarkers.counts.matched, 0,
            `year ${year}: a fully grown range must not leave stale markers on the map`);
        assert.notEqual(cutDigest.terrain?.hash, grownDigest.terrain?.hash,
            `year ${year}: the terrain raster must change between the cut and the recovered wood`);
        assert.notEqual(cutDigest.interactive?.hash, grownDigest.interactive?.hash,
            `year ${year}: the visible map must change between the cut and the recovered wood`);

        rows.push({
            year,
            tick: grown.tick,
            dayOfYear: grown.dayOfYear,
            cutStockRemoved: cut.taken,
            seasonHarvested: season.harvested,
            planted: grown.planted - plantedAtStart,
            workers: grown.workerCount,
            stock: grown.range.stock,
            capacity: grown.range.capacity,
            fill: grown.range.fill,
            restorable: grown.range.restorable,
            status: grown.reason,
            plantingDays: season.plantingDays,
            grownDays: season.grownDays,
            lowestFill: season.lowestFill,
            visualRevision: grown.visualRevision,
            visualDelta: grown.visualRevision - lastVisualRevision,
            cacheMisses: grown.cacheMisses,
            cutMarkers: cutMarkers.counts,
            grownMarkers: grownMarkers.counts,
            hashes: {cut: cutDigest, grown: grownDigest},
            dom: parseDomValues(grownRecord)
        });
        plantedAtStart = grown.planted;
        lastVisualRevision = grown.visualRevision;
    }

    const final = rows[rows.length - 1];
    assert.equal(rows.length, YEARS);
    assert.ok(rows.every(row => row.lowestFill > 0.6),
        "repeated yearly cuts must not collapse the range below 60%");
    assert.ok(rows.every(row => row.planted > 0 && row.plantingDays > 0),
        "the Forester must answer every yearly cut with real planting days");
    // A yearly clear-cut of three stands plus the starting Lumber Yard's
    // recurring harvest occupies most of the planting season. Seventy-one
    // fully grown days per year are still a substantial, repeated window.
    assert.ok(rows.every(row => row.grownDays > 40),
        "every year must contain a substantial fully grown window");
    assert.ok(rows.every(row => row.visualDelta > 0),
        "every year must invalidate the cached woodland at least once");
    assert.ok(final.visualRevision > initialSample.visualRevision,
        "the five-year run must advance the forest visual revision");
    assert.ok(harvestedTotal > 3000, `the audit harvested only ${harvestedTotal} stock`);
    assert.ok(!rows.some(row => row.status.includes("depleted")));

    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        seed: setup.seed,
        world: setup.world,
        years: YEARS,
        daysPerYear: DAYS_PER_YEAR,
        site: setup.site,
        foresterId: setup.foresterId,
        targets: setup.targets,
        clearCut: setup.clearCut,
        initial: {
            range: initialSample.range,
            visualRevision: initialSample.visualRevision,
            cacheMisses: initialSample.cacheMisses
        },
        rows,
        harvestedTotal,
        final: {
            year: final.year,
            tick: final.tick,
            stock: final.stock,
            capacity: final.capacity,
            fill: final.fill,
            status: final.status,
            markers: final.grownMarkers,
            dom: final.dom
        },
        renderer: initialSample.mode,
        screenshots,
        pageErrors,
        consoleErrors
    };
    await writeFile(resolve(outDir, "forester-stewardship-longrun.json"), JSON.stringify(report, null, 2));
    assert.deepEqual(pageErrors, [], "the browser run must not raise page errors");
    console.log(JSON.stringify({
        ok: true,
        url: baseUrl,
        years: YEARS,
        harvestedTotal,
        final: report.final,
        rows: rows.map(row => ({
            year: row.year, lowestFill: Number(row.lowestFill.toFixed(3)),
            planted: row.planted, visualDelta: row.visualDelta,
            cutMarkers: row.cutMarkers.matched, grownMarkers: row.grownMarkers.matched
        })),
        screenshots,
        outDir
    }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
