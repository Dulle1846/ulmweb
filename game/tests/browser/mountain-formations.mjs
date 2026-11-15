// Visual reference for the ten mountain formations.
//
// Starts a real realm in the Mountains & Highlands climate, finds the nearest
// example of every formation, captures a clean canvas crop (no HUD or cards)
// and stitches the ten crops into one contact sheet. This is intentionally
// separate from the gameplay proof: it answers "can a player tell the
// formations apart?" rather than "does a quarry work?".
//
//   node tests/browser/mountain-formations.mjs
//   MOUNTAIN_FORMATION_SEED=20261212 node tests/browser/mountain-formations.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const ROOT = resolve(process.cwd());
const BASE = process.env.MOUNTAIN_FORMATION_BASE_URL || null;
const SEED = Number(process.env.MOUNTAIN_FORMATION_SEED || 20261212);
const VIEWPORT = { width: 1440, height: 1000 };
const OUT = resolve(ROOT, "..", "artifacts");
const TILE_DIR = resolve(OUT, "mountain-formations");
const SHEET = resolve(OUT, "mountain-formations.png");
const REPORT = resolve(OUT, "mountain-formations.json");
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

try {
    await mkdir(TILE_DIR, { recursive: true });
    await page.goto(base + "/?mountain-formations=" + encodeURIComponent(String(SEED)), {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });
    await page.locator("#world-climate").selectOption("mountain");
    await page.locator("#world-seed-input").fill(String(SEED));
    await page.locator("#player-name-input").fill("Formation Survey");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 60000 });
    await page.waitForFunction(async () => {
        const { state } = await import("/js/core/state.js");
        return state.hasStarted === true && state.entities.length > 0;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await settleOverlays(page);

    const survey = await page.evaluate(async () => {
        const [{ state }, { mountainProfileAt }, { getHeightAt, getMoistureAt, getTemperatureAt }] = await Promise.all([
            import("/js/core/state.js"),
            import("/js/world/mountain-ecology.js"),
            import("/js/world/world.js")
        ]);
        state.isPaused = true;
        state.weather = "clear";
        state.weatherTimer = 0;
        state.dayOfYear = 140;
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        // The sheet is a renderer reference, so reveal the whole highland.
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);
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
        const found = new Map();
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const profile = mountainProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
                if (!profile?.mountain) continue;
                const distance = Math.hypot(x - centerX, y - centerY);
                // Stay outside the starting settlement so no roof or HUD card
                // obscures the natural formation.
                if (distance < 14) continue;
                const existing = found.get(profile.formation);
                if (!existing || distance < existing.distance) {
                    found.set(profile.formation, {
                        x, y, distance,
                        formation: profile.formation,
                        label: profile.label,
                        height: Number(profile.height) || 0,
                        snow: Number(profile.visual?.snow) || 0,
                        rock: Number(profile.landform?.rock) || 0,
                        cliff: Number(profile.landform?.cliff) || 0,
                        ridge: Number(profile.landform?.ridge) || 0
                    });
                }
            }
        }
        return {
            seed: state.worldSeed,
            world: { width, height },
            formations: [...found.values()].sort((a, b) => a.formation.localeCompare(b.formation))
        };
    });
    assert.equal(survey.formations.length, 10,
        "the reference seed must expose all ten formations: " + JSON.stringify(survey.formations.map(row => row.formation)));

    // Hide HUD, cards and minimap, but keep both world canvases and the grain
    // layer: a page clip then composites the baked terrain and living detail
    // exactly the way the player sees them.
    await page.addStyleTag({ content: "#canvas-wrapper > *:not(canvas) { visibility: hidden !important; }" });
    const box = await page.locator("#canvas-wrapper").boundingBox();
    const captureWidth = 560;
    const captureHeight = 400;
    const clip = {
        x: Math.max(0, box.x + Math.round((box.width - captureWidth) / 2)),
        y: Math.max(0, box.y + Math.round((box.height - captureHeight) / 2)),
        width: captureWidth,
        height: captureHeight
    };
    const captures = [];
    for (const formation of survey.formations) {
        await page.evaluate(async ({ tile }) => {
            const [{ state }, { CELL }, { clampCamera }] = await Promise.all([
                import("/js/core/state.js"),
                import("/js/core/config.js"),
                import("/js/presentation/camera.js")
            ]);
            const zoom = 1.35;
            state.isPaused = true;
            state.weather = "clear";
            state.weatherTimer = 0;
            state.zoom = zoom;
            state.zoomTarget = zoom;
            state.zoomAnchor = null;
            state.camera.x = (tile.x + 0.5) * CELL * zoom - state.canvas.width / 2;
            state.camera.y = (tile.y + 0.5) * CELL * zoom - state.canvas.height / 2;
            clampCamera();
            const { drawWorld } = await import("/js/presentation/rendering/renderer.js");
            drawWorld();
        }, { tile: formation });
        await page.waitForTimeout(1100);
        const file = resolve(TILE_DIR, formation.formation + ".png");
        const buffer = await page.screenshot({ clip });
        await writeFile(file, buffer);
        const dataUrl = "data:image/png;base64," + buffer.toString("base64");
        captures.push({ ...formation, file, dataUrl });
    }

    // A direct renderer atlas at a large cell size makes the silhouette itself
    // reviewable, independent of the map's tile lattice and camera.
    const atlasUrl = await page.evaluate(async () => {
        const [{ state }, { mountainProfileAt }, { getHeightAt, getMoistureAt, getTemperatureAt }, { drawMountain }] =
            await Promise.all([
                import("/js/core/state.js"),
                import("/js/world/mountain-ecology.js"),
                import("/js/world/world.js"),
                import("/js/presentation/rendering/mountain-render.js")
            ]);
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const contextAt = (x, y) => ({
            seed: Number(state.worldSeed) || 1, climate: state.worldOptions?.climate || "",
            height: getHeightAt(x + 0.5, y + 0.5), moisture: getMoistureAt(x + 0.5, y + 0.5),
            temperature: getTemperatureAt(x + 0.5, y + 0.5), seaLevel: Number(state.seaLevel) || 0.33,
            dayOfYear: Number(state.dayOfYear) || 1, year: Number(state.year) || 1,
            hour: Number(state.timeOfDay) || 12, weather: state.weather || "clear", wind: 1
        });
        const found = new Map();
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const profile = mountainProfileAt(x + 0.5, y + 0.5, contextAt(x, y));
                if (!profile?.mountain) continue;
                const distance = Math.hypot(x - width / 2, y - height / 2);
                if (distance < 14) continue;
                const existing = found.get(profile.formation);
                if (!existing || distance < existing.distance) found.set(profile.formation, { profile, distance });
            }
        }
        const rows = [...found.values()].sort((a, b) => a.profile.formation.localeCompare(b.profile.formation));
        const cell = 220;
        const canvas = document.createElement("canvas");
        canvas.width = cell * 5;
        canvas.height = cell * 2;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#778079";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let index = 0; index < rows.length; index++) {
            const col = index % 5;
            const row = Math.floor(index / 5);
            const profile = rows[index].profile;
            ctx.fillStyle = profile.groundHex || "#8d938b";
            ctx.fillRect(col * cell, row * cell, cell, cell);
            const cx = col * cell + cell / 2;
            const cy = row * cell + cell / 2;
            drawMountain(ctx, cx, cy, cell, profile, 0.35, 0.55, 0.7, 0, 1.35);
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#1b2321";
            ctx.fillRect(col * cell, row * cell + cell - 24, cell, 24);
            ctx.fillStyle = "#f3eee0";
            ctx.font = "12px monospace";
            ctx.fillText(profile.formation, col * cell + 8, row * cell + cell - 8);
        }
        return canvas.toDataURL("image/png");
    });
    const atlasFile = resolve(OUT, "mountain-formation-atlas.png");
    await writeFile(atlasFile, Buffer.from(atlasUrl.split(",")[1], "base64"));

    const cards = captures.map(capture => `
        <figure>
            <img src="${capture.dataUrl}" alt="${capture.formation}">
            <figcaption>
                <strong>${capture.formation}</strong>
                <span>${capture.label || ""} · snow ${(capture.snow * 100).toFixed(0)}% · cliff ${(capture.cliff * 100).toFixed(0)}%</span>
            </figcaption>
        </figure>`).join("");
    const sheet = await browser.newPage({ viewport: { width: 1720, height: 1220 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await sheet.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        @font-face { font-family: Cards; src: local("Georgia"); }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 30px 34px 34px; background: #151a19; color: #e9e2cf; font-family: Georgia, serif; }
        header { display: flex; align-items: end; justify-content: space-between; border-bottom: 1px solid #6f6a58; padding-bottom: 12px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 26px; letter-spacing: .08em; font-weight: 500; }
        header p { margin: 0; color: #a9a38f; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; }
        main { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
        figure { margin: 0; background: #202725; border: 1px solid #4b5148; }
        img { display: block; width: 100%; aspect-ratio: 1.4; object-fit: cover; }
        figcaption { padding: 8px 10px 9px; border-top: 1px solid #4b5148; }
        strong { display: block; font-size: 14px; letter-spacing: .04em; }
        span { display: block; margin-top: 3px; color: #9e9a89; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
    </style></head><body>
        <header><h1>MOUNTAIN FORMATIONS</h1><p>seed ${survey.seed} · ${survey.world.width}×${survey.world.height} · 10 / 10</p></header>
        <main>${cards}</main>
    </body></html>`);
    await sheet.screenshot({ path: SHEET, fullPage: true });
    await sheet.close();

    const report = {
        schema: 1,
        seed: survey.seed,
        world: survey.world,
        formations: captures.map(({ dataUrl, ...capture }) => capture),
        sheet: SHEET,
        atlas: atlasFile
    };
    await writeFile(REPORT, JSON.stringify(report, null, 2));
    console.log("MOUNTAIN_FORMATIONS " + JSON.stringify({
        ok: true,
        seed: survey.seed,
        count: captures.length,
        formations: captures.map(capture => capture.formation),
        sheet: SHEET
    }));
} finally {
    await browser.close().catch(() => {});
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
