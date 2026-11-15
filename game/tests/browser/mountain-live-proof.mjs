// Real-browser proof for the 1.2.12 mountain release.
//
// It founds a fresh realm in the Mountains & Highlands climate, moves the real map to
// an explored wet tile, screenshots the rendered terrain, asks the same survey
// used by the farm/stable panel for the site summary, and performs the same
// player-triggered meadow gathering used by that panel. The resulting ledger
// must contain a good from MOUNTAIN_GOODS, not a generic temperate product.
//
// Defaults to a local static server. Point it at a hosted build with:
//   MOUNTAIN_PROOF_BASE_URL=https://kings-and-cards.pages.dev npm run test:mountain-live
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const ROOT = resolve(process.cwd());
const BASE = process.env.MOUNTAIN_PROOF_BASE_URL || null;
const SEED = Number(process.env.MOUNTAIN_PROOF_SEED || 20261108);
const VIEWPORT = { width: 1440, height: 1000 };
const OUT = resolve(ROOT, "..", "artifacts");
const FULL_SHOT = resolve(OUT, "mountain-live-proof.png");
const MAP_SHOT = resolve(OUT, "mountain-live-proof-map.png");
const REPORT = resolve(OUT, "mountain-live-proof.json");
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
    ".wav": "audio/wav"
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
            const data = await readFile(file);
            response.writeHead(200, {
                "content-type": MIME[extname(file)] || "application/octet-stream",
                "cache-control": "no-store"
            });
            response.end(data);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        }
    });
}

async function settleOverlays(page) {
    for (let guard = 0; guard < 5; guard++) {
        const action = await page.evaluate(() => {
            const visible = element => {
                if (!element) return false;
                const style = getComputedStyle(element);
                return style.display !== "none" && style.visibility !== "hidden" &&
                    element.getClientRects().length > 0;
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
            for (const button of document.querySelectorAll("#command-close, #settings-close")) {
                if (visible(button)) button.click();
            }
            return "none";
        });
        if (action === "none") return;
        await page.waitForTimeout(120);
    }
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
    await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    base = "http://127.0.0.1:" + server.address().port;
}
base = base.replace(/\/$/, "");

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", request => failedRequests.push(request.url() + " — " + (request.failure()?.errorText || "failed")));

try {
    await page.goto(base + "/?mountain-proof=" + encodeURIComponent(String(SEED)), {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });
    await page.locator("#world-climate").selectOption("mountain");
    await page.locator("#world-seed-input").fill(String(SEED));
    await page.locator("#player-name-input").fill("Mountain Warden");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 60000 });
    await page.waitForFunction(async () => {
        const { state } = await import("/js/core/state.js");
        return state.hasStarted === true && state.entities.length > 0;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await settleOverlays(page);

    const world = await page.evaluate(async () => {
        const [{ state }, { CELL }, { getHeightAt, getMoistureAt, getTemperatureAt }] = await Promise.all([
            import("/js/core/state.js"),
            import("/js/core/config.js"),
            import("/js/world/world.js")
        ]);
        const { mountainProfileAt } = await import("/js/world/mountain-ecology.js");
        state.isPaused = true;

        const cell = CELL * (Number(state.zoom) || 1);
        const centerX = Math.floor((state.camera.x + state.canvas.width / 2) / cell);
        const centerY = Math.floor((state.camera.y + state.canvas.height / 2) / cell);
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const exploredAt = (x, y) => {
            const column = state.explored?.[x];
            return Array.isArray(column) ? column[y] !== false : true;
        };
        const contextAt = (x, y) => ({
            seed: Number(state.worldSeed) || 1,
            climate: state.worldOptions?.climate || "",
            height: getHeightAt(x + 0.5, y + 0.5),
            moisture: getMoistureAt(x + 0.5, y + 0.5),
            temperature: getTemperatureAt(x + 0.5, y + 0.5),
            seaLevel: Number(state.seaLevel) || 0.33,
            dayOfYear: Number(state.dayOfYear) || 1,
            year: Number(state.year) || 1,
            hour: Number(state.timeOfDay) || 12,
            weather: state.weather || "clear",
            wind: 1
        });

        let sight = null;
        let gather = [];
        for (let radius = 12; radius <= 42 && !sight; radius += 6) {
            for (let y = Math.max(1, centerY - radius); y <= Math.min(height - 2, centerY + radius); y++) {
                for (let x = Math.max(1, centerX - radius); x <= Math.min(width - 2, centerX + radius); x++) {
                    if (!exploredAt(x, y)) continue;
                    const profile = mountainProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
                    if (!profile?.mountain) continue;
                    const trees = profile.trees?.length || 0;
                    const flowers = profile.vegetation?.flowers?.length || 0;
                    const shrubs = profile.vegetation?.shrubs?.length || 0;
                    const snow = Number(profile.climate?.snow) || 0;
                    const rock = Number(profile.rock?.exposure) || 0;
                    const water = Number(profile.water?.water) || 0;
                    const distance = Math.hypot(x - centerX, y - centerY);
                    // Prefer a genuine highland outside the built-up core: the
                    // proof needs exposed rock, snow and trees, not roof cutaways.
                    const score = snow * 3 + rock * 2 + water * 2 + trees * 1.1 +
                        flowers * 0.7 + shrubs * 0.5 + (profile.features?.length || 0) * 0.05 +
                        Math.min(5, distance * 0.2);
                    if (!sight || score > sight.score) {
                        sight = {
                            x, y, score, distance,
                            formation: profile.formation,
                            label: profile.label,
                            height: Number(profile.height) || 0,
                            snow: snow,
                            rock: rock,
                            water: water,
                            trees: trees,
                            flowers: flowers,
                            shrubs: shrubs,
                            features: profile.features?.slice(0, 8) || []
                        };
                    }
                    if (gather.length < 40 && (trees || flowers || shrubs)) gather.push({ x, y });
                }
            }
        }
        if (!sight) throw new Error("No explored mountain tile was found around the new realm");
        return {
            climate: state.worldOptions?.climate,
            seed: state.worldSeed,
            center: { x: centerX, y: centerY },
            sight,
            gather
        };
    });
    assert.equal(world.climate, "mountain", "the live realm must use the mountain climate");

    await page.evaluate(async ({ tile }) => {
        const [{ state }, { CELL }, { clampCamera }] = await Promise.all([
            import("/js/core/state.js"),
            import("/js/core/config.js"),
            import("/js/presentation/camera.js")
        ]);
        // Just below the interior threshold: enough pixels for snow, rock,
        // alpine flowers and conifer crowns, without roof cutaways.
        const zoom = 1.45;
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomAnchor = null;
        state.camera.x = (tile.x + 0.5) * CELL * zoom - state.canvas.width / 2;
        state.camera.y = (tile.y + 0.5) * CELL * zoom - state.canvas.height / 2;
        clampCamera();
        state.isPaused = true;
        state.weather = "fog";
        state.weatherTimer = 0;
        const { renderUI } = await import("/js/presentation/rendering/ui.js");
        renderUI();
    }, { tile: world.sight });
    await page.waitForTimeout(500);
    await settleOverlays(page);

    const survey = await page.evaluate(async ({ tile }) => {
        const { grasslandSiteSummaryAt } = await import("/js/systems/grassland-use.js");
        return grasslandSiteSummaryAt(tile.x, tile.y);
    }, { tile: world.sight });
    assert.match(survey, /mountain|alpine|highland|ridge|peak|valley|plateau|gorge/i,
        "the live survey must describe the mountain site, got: " + survey);

    const gathered = await page.evaluate(async ({ preferred, candidates }) => {
        const [{ gatherMeadowProducts, forestGatheringSummary, forestDeliveryChannel }, { MOUNTAIN_GOODS }, { state }] =
            await Promise.all([
                import("/js/systems/forest-gathering.js"),
                import("/js/world/mountain-ecology.js"),
                import("/js/core/state.js")
            ]);
        const attempts = [];
        const ordered = [preferred, ...candidates].filter((entry, index, list) =>
            list.findIndex(other => other.x === entry.x && other.y === entry.y) === index);
        for (const tile of ordered.slice(0, 24)) {
            const result = gatherMeadowProducts(tile.x, tile.y);
            attempts.push({
                x: tile.x,
                y: tile.y,
                ok: Boolean(result.ok),
                reason: result.reason || null,
                goods: result.goods?.map(good => good.id) || []
            });
            if (!result.ok) continue;
            const specific = (result.goods || []).filter(good => MOUNTAIN_GOODS[good.id]);
            if (!specific.length) continue;
            const stock = state.forestGathering?.stock || {};
            return {
                ok: true,
                tile: result.tile,
                goods: result.goods,
                specific,
                fauna: result.fauna || [],
                use: result.use || null,
                summary: forestGatheringSummary(8),
                delivery: forestDeliveryChannel(result.goods[0].id),
                ledgerSpecific: specific.map(good => ({
                    id: good.id,
                    label: MOUNTAIN_GOODS[good.id].label,
                    stock: Number(stock[good.id]) || 0
                })),
                attempts
            };
        }
        return { ok: false, attempts, summary: forestGatheringSummary(8) };
    }, { preferred: world.sight, candidates: world.gather });
    assert.equal(gathered.ok, true,
        "a real meadow gathering must return a mountain-specific good: " + JSON.stringify(gathered.attempts));
    assert.ok(gathered.specific.length > 0, "the returned goods must include MOUNTAIN_GOODS");
    assert.ok(gathered.ledgerSpecific.every(entry => entry.stock > 0),
        "the gathered mountain goods must persist in the live ledger");
    assert.ok(gathered.summary.length > 0, "the live gathering ledger summary must not be empty");
    assert.ok(gathered.delivery,
        "the gathered mountain good must have an existing delivery channel: " + JSON.stringify(gathered.delivery));

    // A quarry, terrace, road or conduit makes the player-built layer visible
    // in the same screenshot as the natural mountain. It must spend real
    // resources, persist in state.mountainWorks, change the site profile and
    // remain queryable through the same availability gate the UI uses.
    const mountainWorks = await page.evaluate(async ({ tile }) => {
        const [{ state }, { performMountainWork, mountainWorkAvailability }, { MOUNTAIN_WORK_FLAGS }] = await Promise.all([
            import("/js/core/state.js"),
            import("/js/systems/forest-gathering.js"),
            import("/js/world/mountain-works.js")
        ]);
        const before = mountainWorkAvailability(tile.x, tile.y);
        const woodBefore = Number(state.resources.wood) || 0;
        const stoneBefore = Number(state.resources.stone) || 0;
        const affordable = before.ok
            ? Object.entries(before.works).filter(([, work]) => work.ok).map(([kind]) => kind) : [];
        const chosen = ["quarry", "terrace", "road", "aqueduct", "mine", "bridge"]
            .find(kind => affordable.includes(kind)) || affordable[0] || null;
        if (!chosen) return { ok: false, before, affordable, reason: "No affordable mountain work on this tile" };
        const result = performMountainWork(tile.x, tile.y, chosen, { dayOfYear: state.dayOfYear });
        const after = mountainWorkAvailability(tile.x, tile.y);
        const record = state.mountainWorks?.tiles?.[tile.x + ":" + tile.y] || null;
        return {
            ok: true,
            before: before.ok ? { title: before.title, summary: before.summary, audit: before.audit } : before,
            after: after.ok ? { title: after.title, summary: after.summary, audit: after.audit } : after,
            affordable, chosen, expectedFlag: MOUNTAIN_WORK_FLAGS[chosen],
            result: result.ok ? { ok: true, kind: result.kind, label: result.label, message: result.message, goods: result.goods } : result,
            record,
            woodSpent: woodBefore - (Number(state.resources.wood) || 0),
            stoneSpent: stoneBefore - (Number(state.resources.stone) || 0)
        };
    }, { tile: world.sight });
    assert.equal(mountainWorks.ok, true, "the selected mountain tile must offer an affordable work");
    assert.equal(mountainWorks.result.ok, true,
        "a mountain farm/stable must be able to build a work: " + JSON.stringify(mountainWorks.result));
    assert.equal(mountainWorks.record?.[mountainWorks.expectedFlag], true);
    assert.ok(mountainWorks.woodSpent + mountainWorks.stoneSpent >= 4, "the mountain work must spend real resources");
    assert.match(mountainWorks.after.summary, /terrace|quarry|road|conduit|bridge|mine|village|fort/i,
        "the survey must report the built mountain work: " + JSON.stringify(mountainWorks.after));

    await settleOverlays(page);
    await page.evaluate(async () => {
        const { clearTimelineNotifications } = await import("/js/presentation/event-notifications.js");
        clearTimelineNotifications();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: FULL_SHOT });
    await page.locator("#canvas-wrapper").screenshot({ path: MAP_SHOT });

    const performance = await page.evaluate(async () => {
        const { state } = await import("/js/core/state.js");
        state.performanceProbe = { frames: [], limit: 240 };
        state.isPaused = true;
        const startFrames = Number(state.renderedFrames) || 0;
        const started = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1800));
        const elapsed = (performance.now() - started) / 1000;
        const frames = state.performanceProbe.frames || [];
        const durations = frames.map(frame => frame.drawMs).filter(Number.isFinite);
        const intervals = frames.map(frame => frame.intervalMs).filter(Number.isFinite);
        const average = values => values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        const percentile = (values, fraction) => {
            if (!values.length) return null;
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
        };
        return {
            frames: Math.max(0, (Number(state.renderedFrames) || 0) - startFrames),
            sampleCount: frames.length,
            averageDrawMs: average(durations),
            p95DrawMs: percentile(durations, 0.95),
            averageIntervalMs: average(intervals),
            p95IntervalMs: percentile(intervals, 0.95),
            lastDrawMs: Number(state.lastDrawMs) || 0,
            lastWorldDrawMs: Number(state.lastWorldDrawMs) || 0,
            lastUiRenderMs: Number(state.lastUiRenderMs) || 0,
            fps: elapsed > 0 ? Math.max(0, (Number(state.renderedFrames) || 0) - startFrames) / elapsed : 0,
            elapsedSeconds: elapsed
        };
    });
    assert.ok(performance.sampleCount >= 60, "the performance probe must collect at least 60 rendered frames");
    assert.ok(performance.averageDrawMs < 16.7,
        "average mountain frame draw must fit the 60 FPS frame: " + performance.averageDrawMs);
    assert.ok(performance.p95DrawMs < 16.7,
        "p95 mountain frame draw must fit the 60 FPS frame: " + performance.p95DrawMs);
    assert.ok(performance.averageIntervalMs < 24,
        "rendered frames must stay near a smooth cadence: " + performance.averageIntervalMs);
    assert.deepEqual(pageErrors, [], "the proof must have no page errors");
    assert.deepEqual(consoleErrors, [], "the proof must have no console errors");
    assert.deepEqual(failedRequests, [], "the proof must have no failed requests");

    const report = {
        schema: 1,
        ok: true,
        base,
        seed: world.seed,
        climate: world.climate,
        tile: world.sight,
        survey,
        gathering: gathered,
        mountainWorks,
        performance,
        screenshots: [FULL_SHOT, MAP_SHOT],
        pageErrors,
        consoleErrors,
        failedRequests
    };
    await mkdir(OUT, { recursive: true });
    await writeFile(REPORT, JSON.stringify(report, null, 2));
    console.log("MOUNTAIN_LIVE_PROOF " + JSON.stringify({
        ok: true,
        base,
        climate: world.climate,
        tile: {
            x: world.sight.x,
            y: world.sight.y,
            formation: world.sight.formation,
            height: world.sight.height,
            snow: world.sight.snow,
            rock: world.sight.rock,
            trees: world.sight.trees,
            flowers: world.sight.flowers
        },
        survey,
        goods: gathered.goods.map(good => ({ id: good.id, amount: good.amount, label: good.label })),
        mountainSpecific: gathered.ledgerSpecific,
        summary: gathered.summary,
        delivery: gathered.delivery,
        performance,
        screenshots: report.screenshots,
        errors: { page: pageErrors.length, console: consoleErrors.length, failedRequests: failedRequests.length }
    }));
} finally {
    await browser.close().catch(() => {});
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
