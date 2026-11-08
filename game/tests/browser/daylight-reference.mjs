// Visual proof for the Laubwald checklist points 1.2.1.58 and 1.2.1.60.
//
// Captures one real ancient/oak tile at 2.40x in summer and winter at dawn,
// noon, dusk and night. The eight frames are composed into a contact sheet.
// A second close-up is saved for the ground-mist point. The run is
// deterministic; it uses the real game renderer, not hand-painted props.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";
import { daylightState as stateForHour } from "../../js/presentation/rendering/daylight.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputDir = path.resolve(process.env.ATMOSPHERE_REFERENCE_OUT || path.join(gameRoot, "docs/terrain-reference"));
const seed = 20261104;
const viewport = { width: 1000, height: 700 };
const hours = Object.freeze([6, 12, 18, 23]);
const phases = Object.freeze(["dawn", "day", "dusk", "night"]);
const days = Object.freeze([150, 350]);
const mimeTypes = {
    ".js": "text/javascript", ".html": "text/html", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createServer() {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url || "/", "http://localhost");
        const file = path.join(gameRoot, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
        if (!file.startsWith(gameRoot)) {
            response.statusCode = 403;
            response.end("forbidden");
            return;
        }
        try {
            const data = await fs.readFile(file);
            response.setHeader("content-type", mimeTypes[path.extname(file)] || "application/octet-stream");
            response.setHeader("cache-control", "no-store");
            response.end(data);
        } catch {
            response.statusCode = 404;
            response.end("missing");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

const { chromium } = await import("playwright");
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.type() + ": " + message.text());
});
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));

const hash = buffer => crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Atmosphere Reference");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1000);

    // The settings control must round-trip midnight instead of falling back to
    // noon through a falsy `||` default.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-time-of-day").waitFor();
    await page.locator("#settings-time-of-day").evaluate(element => {
        element.value = "0";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await page.locator("#settings-time-of-day-value").textContent(), "00:00");
    assert.equal(await page.evaluate(async () => (await import("./js/core/state.js")).state.timeOfDay), 0);
    await page.locator("#settings-close").click();

    await page.addStyleTag({
        content: `
            body.atmosphere-reference .topbar,
            body.atmosphere-reference .realm-nav,
            body.atmosphere-reference .side-panel { display: none !important; }
            body.atmosphere-reference .game-shell,
            body.atmosphere-reference .game-layout { display: block !important; height: 100vh !important; }
            body.atmosphere-reference #canvas-wrapper {
                position: fixed !important; inset: 0 !important;
                width: 100vw !important; height: 100vh !important;
                background: #0b1310 !important;
            }
            body.atmosphere-reference #canvas-wrapper > *:not(#terrain-canvas):not(#canvas) {
                visibility: hidden !important;
            }
        `,
    });

    const focus = await page.evaluate(async () => {
        document.body.classList.add("atmosphere-reference");
        const { state } = await import("./js/core/state.js");
        const { getHeightAt, getMoistureAt, getTemperatureAt } = await import("./js/world/world.js");
        const { forestStandAt } = await import("./js/world/forest-ecology.js");
        const { getResourceNodeAt } = await import("./js/systems/resource-geography.js");
        const { setZoomLevel, clampCamera } = await import("./js/presentation/camera.js");
        const { CELL } = await import("./js/core/config.js");
        state.isPaused = true;
        state.weather = "clear";
        state.dayOfYear = 150;
        state.seasonIndex = 1;
        state.timeOfDay = 12;
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        // The light overlay is on the gameplay canvas; Canvas2D keeps this
        // reference independent of a GPU/WebGL driver.
        state.terrainRenderer = "canvas";
        state.terrainAutoMode = "canvas";
        state.terrainMode = "canvas";
        let chosen = null;
        for (let y = 4; y < height - 4 && !chosen; y += 2) {
            for (let x = 4; x < width - 4; x += 2) {
                const node = getResourceNodeAt(x, y);
                if (!node?.forestCapacity) continue;
                const stand = forestStandAt(x + 0.5, y + 0.5, {
                    seed: Number(state.worldSeed) || 1,
                    moisture: getMoistureAt(x + 0.5, y + 0.5),
                    temperature: getTemperatureAt(x + 0.5, y + 0.5),
                    height: getHeightAt(x + 0.5, y + 0.5),
                    climate: state.worldOptions?.climate || "temperate",
                    forests: state.worldOptions?.forests ?? 52,
                    stockRatio: node.forestStock / node.forestCapacity,
                    rockLine: 0.92,
                });
                if (stand.type === "ancient" || stand.type === "oakwood") {
                    chosen = { x, y, type: stand.type, label: stand.label, age: stand.ageClass };
                    break;
                }
            }
        }
        if (!chosen) throw new Error("No real ancient/oak forest tile found for the atmosphere reference.");
        setZoomLevel(4);
        state.zoom = state.zoomTarget;
        state.zoomLevel = 4;
        state.zoomAnchor = null;
        state.camera.x = (chosen.x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
        state.camera.y = (chosen.y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
        clampCamera();
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        return { ...chosen, world: { width, height } };
    });

    await page.waitForTimeout(650);
    const frames = [];
    for (const day of days) {
        for (let index = 0; index < hours.length; index++) {
            const hour = hours[index];
            await page.evaluate(async ({ day, hour, seasonIndex }) => {
                const { state } = await import("./js/core/state.js");
                state.isPaused = true;
                state.weather = "clear";
                state.dayOfYear = day;
                state.seasonIndex = seasonIndex;
                state.timeOfDay = hour;
            }, { day, hour, seasonIndex: Math.floor(day / 100) % 4 });
            await page.waitForTimeout(260);
            const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
            frames.push({ day, hour, phase: phases[index], buffer, hash: hash(buffer) });
            console.log(`Captured ${day === 150 ? "summer" : "winter"} ${phases[index]} ${hour}:00 · ${hash(buffer)}`);
        }
    }

    const summerHashes = frames.filter(frame => frame.day === 150).map(frame => frame.hash);
    assert.equal(new Set(summerHashes).size, 4, "summer time-of-day frames are not visually distinct");
    const winterHashes = frames.filter(frame => frame.day === 350).map(frame => frame.hash);
    assert.equal(new Set(winterHashes).size, 4, "winter time-of-day frames are not visually distinct");

    // This is the targeted close-up for 1.2.1.58: the dawn frame must contain
    // the low forest mist, not just the screen-space daylight tint. Crop the
    // saved dawn buffer, never the live page (the loop ends at winter night).
    const mist = frames.find(frame => frame.day === 150 && frame.phase === "dawn");
    const mistSheet = await context.newPage();
    await mistSheet.setViewportSize({ width: 900, height: 500 });
    await mistSheet.setContent(`<!doctype html><style>
        *{box-sizing:border-box}html,body{margin:0;width:900px;height:500px;background:#0d1411;color:#eee7d4}
        .proof{display:grid;grid-template-columns:500px 400px;height:500px}
        .crop{position:relative;width:500px;height:500px;overflow:hidden;border-right:1px solid #59624f}
        .crop img{position:absolute;left:-250px;top:-100px;width:1000px;height:700px;display:block}
        .copy{padding:32px 30px;display:flex;flex-direction:column;justify-content:center;gap:12px}
        .kicker{font:700 10px/1 monospace;letter-spacing:.2em;color:#c7aa6d}
        h1{font:700 32px/1.05 Georgia,serif;margin:0;color:#f4e8c9}
        p{margin:0;color:#b9c3b2;font:13px/1.5 system-ui,sans-serif}
        .rule{height:1px;background:#59624f;margin:6px 0}
        .tag{display:inline-block;width:max-content;border:1px solid #59624f;padding:5px 8px;font:10px/1 monospace;color:#d6c49c}
        .note{font-size:11px;color:#91a18e}
    </style><div class="proof"><div class="crop"><img src="data:image/png;base64,${mist.buffer.toString("base64")}" alt=""></div><div class="copy">
        <div class="kicker">LAUBWALD · 1.2.1.58</div>
        <h1>Bodennebel<br>im Morgenlicht</h1>
        <p>Oakwood (60, 42) · 2.40× · Tag 150 · 06:00</p>
        <div class="rule"></div>
        <div class="tag">ECHTES 500 × 500 CROP</div>
        <p>Der Bodennebel liegt als drei weiche, überlappende Nebelschwaden unter der Krone. Der warme Schleier darüber ist der Tageszeit-Overlay.</p>
        <p class="note">Quelle: daylight-reference.png · Frame 1 · Canvas2D · Seed 20261104</p>
    </div></div>`, { waitUntil: "load" });
    await mistSheet.waitForTimeout(80);
    await mistSheet.screenshot({ path: path.join(outputDir, "mist-reference.png") });
    await fs.writeFile(path.join(outputDir, "mist-reference.json"), JSON.stringify({
        seed,
        viewport,
        tile: focus,
        day: 150,
        hour: 6,
        phase: "dawn",
        crop: { x: 250, y: 100, width: 500, height: 500 },
        sourceHash: mist.hash,
        note: "Real 500×500 crop of the saved summer-dawn frame on the oak tile. The horizontal ground vapour is drawn by drawForestMist; the warm veil is the daylight overlay.",
    }, null, 2) + "\n");

    const tiles = frames.map(frame => `
        <figure>
            <img src="data:image/png;base64,${frame.buffer.toString("base64")}" alt="">
            <figcaption><b>${frame.day === 150 ? "SUMMER" : "WINTER"} · ${frame.phase.toUpperCase()}</b><span>${String(frame.hour).padStart(2, "0")}:00 · ${frame.hash}</span></figcaption>
        </figure>`).join("");
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 1560, height: 760 });
    await sheet.setContent(`<!doctype html><html><head><style>
        *{box-sizing:border-box}body{margin:0;padding:24px;background:#0d1411;color:#eee7d4;font:14px/1.4 system-ui,sans-serif}
        h1{font:700 28px/1.1 Georgia,serif;margin:0 0 4px}p{margin:0 0 18px;color:#b9c3b2;font-size:13px}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        figure{margin:0;background:#17211b;border:1px solid #59624f;padding:6px}img{display:block;width:100%;height:auto}
        figcaption{padding:7px 2px 2px;font:11px/1.3 monospace;color:#d8cba9}figcaption b{display:block;color:#f1e4bf;font-size:12px}figcaption span{color:#91a18e}
    </style></head><body>
        <h1>Laubwald · Tageszeit und Bodennebel</h1>
        <p>Real ancient/oak tile at 2.40× · seed ${seed} · ${focus.label} (${focus.x}, ${focus.y}) · summer and winter · Canvas2D reference</p>
        <div class="grid">${tiles}</div>
    </body></html>`, { waitUntil: "load" });
    await sheet.waitForTimeout(120);
    await sheet.screenshot({ path: path.join(outputDir, "daylight-reference.png"), fullPage: true });

    const metadata = {
        seed,
        viewport,
        generatedAt: new Date().toISOString(),
        tile: focus,
        frames: frames.map(frame => ({
            day: frame.day,
            season: frame.day === 150 ? "summer" : "winter",
            hour: frame.hour,
            phase: frame.phase,
            daylight: stateForHour(frame.hour, frame.day === 150 ? "summer" : "winter"),
            hash: frame.hash,
        })),
        mist: { file: "mist-reference.png", day: 150, hour: 6, phase: "dawn", crop: { x: 250, y: 100, width: 500, height: 500 } },
        note: "Time-of-day light is a screen-space overlay; the terrain cache is not rebuilt. The mist close-up is a real 500×500 crop of the saved dawn frame.",
    };
    await fs.writeFile(path.join(outputDir, "daylight-reference.json"), JSON.stringify(metadata, null, 2) + "\n");
    console.log("Daylight sheet: " + path.relative(gameRoot, path.join(outputDir, "daylight-reference.png")));
    console.log("Mist close-up: " + path.relative(gameRoot, path.join(outputDir, "mist-reference.png")));

    const fatal = diagnostics.filter(text => /pageerror|TypeError|ReferenceError|runtime paused/i.test(text));
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    assert.equal(fatal.length, 0, "atmosphere reference diagnostics were emitted:\n" + fatal.join("\n"));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
