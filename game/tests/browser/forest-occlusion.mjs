// Real-browser proof for dense-forest occlusion.
//
// The test places a recording building behind a dense conifer tile and another
// at the same distance in open ground. It runs the real drawWorld() pipeline
// and inspects the exact visible-entity set that is passed to drawEntity(). The
// behind entity must be absent; the open control must be present. If the
// line-of-sight filter is removed and only the atmospheric vignette remains,
// the behind entity appears in this set and the test fails.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

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
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("console", message => {
    if (message.type() === "error") diagnostics.push("console: " + message.text());
});
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill("20261104");
    await page.locator("#player-name-input").fill("Occlusion Audit");
    await page.locator("#world-climate").selectOption("northern");
    await page.locator("#world-forests").evaluate(element => {
        element.value = "82";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(900);

    const result = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { TYPE } = await import("./js/core/types.js");
        const { CELL } = await import("./js/core/config.js");
        const { drawWorld, visibleEntityIdsForTest, visibleCarrierIdsForTest, visibleParticleCountForTest, visibleFloaterCountForTest } = await import("./js/presentation/rendering/renderer.js");
        const { getResourceNodeAt } = await import("./js/systems/resource-geography.js");
        const { ensureCityState } = await import("./js/systems/logistics.js");
        const { forestLineOfSightBlocked } = await import("./js/world/forest-ecology.js");
        const { clampCamera } = await import("./js/presentation/camera.js");

        state.isPaused = true;
        state.weather = "clear";
        state.timeOfDay = 12;
        state.dayOfYear = 150;
        state.seasonIndex = 1;
        state.explored = Array.from({ length: state.worldW }, () => Array(state.worldH).fill(true));
        state.fogDirty = true;
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        state.cardPreview = null;
        state.selectedBuildingId = null;
        state.mapLayer = "terrain";
        state.zoom = 2;
        state.zoomTarget = 2;
        state.zoomLevel = 3;
        state.zoomAnchor = null;
        state.renderScale = 1;

        const W = Number(state.worldW) || 1;
        const H = Number(state.worldH) || 1;
        const cellPx = CELL * state.zoom;
        const nodeCache = new Map();
        const nodeAt = (x, y) => {
            const key = y * W + x;
            if (nodeCache.has(key)) return nodeCache.get(key);
            const node = getResourceNodeAt(x, y);
            nodeCache.set(key, node);
            return node;
        };
        const strengthAt = (x, y) => Number(nodeAt(x, y)?.forestSightStrength) || 0;
        const blocked = (ax, ay, bx, by) => forestLineOfSightBlocked(ax, ay, bx, by, strengthAt);

        let geometry = null;
        for (let y = 10; y < H - 10 && !geometry; y++) {
            for (let x = 10; x < W - 10; x++) {
                const strength = strengthAt(x, y);
                if (strength <= 0.1) continue;
                const anchor = { x: x - 3 + 0.5, y: y + 0.5 };
                const behind = { x: x + 3.5, y: y + 0.5 };
                const targetDistance = Math.hypot(behind.x - anchor.x, behind.y - anchor.y);
                if (strengthAt(x - 3, y) > 0.01 || strengthAt(x + 3, y) > 0.01) continue;
                if (!blocked(anchor.x, anchor.y, behind.x, behind.y)) continue;
                let open = null;
                for (let i = 0; i < 32 && !open; i++) {
                    const angle = (i / 32) * Math.PI * 2;
                    const ox = Math.round(anchor.x + Math.cos(angle) * targetDistance);
                    const oy = Math.round(anchor.y + Math.sin(angle) * targetDistance);
                    if (ox < 4 || oy < 4 || ox >= W - 4 || oy >= H - 4) continue;
                    if (Math.abs(Math.hypot(ox + 0.5 - anchor.x, oy + 0.5 - anchor.y) - targetDistance) > 0.35) continue;
                    if (strengthAt(ox, oy) > 0.01) continue;
                    if (blocked(anchor.x, anchor.y, ox + 0.5, oy + 0.5)) continue;
                    open = { x: ox + 0.5, y: oy + 0.5 };
                }
                if (!open) continue;
                const openDistance = Math.hypot(open.x - anchor.x, open.y - anchor.y);
                const alignedBehind = {
                    x: anchor.x + (behind.x - anchor.x) / targetDistance * openDistance,
                    y: anchor.y + (behind.y - anchor.y) / targetDistance * openDistance,
                };
                if (!blocked(anchor.x, anchor.y, alignedBehind.x, alignedBehind.y)) continue;
                geometry = { anchor, behind: alignedBehind, open, wall: { x, y, strength } };
                break;
            }
        }
        if (!geometry) throw new Error("No dense conifer wall with an open anchor and an open control ray was found.");

        state.camera.x = geometry.anchor.x * cellPx - state.canvas.width / 2;
        state.camera.y = geometry.anchor.y * cellPx - state.canvas.height / 2;
        clampCamera();

        const marker = (x, y, id) => ({
            id, x, y, type: TYPE.WONDER, hp: 1, maxHp: 1, dead: false,
            rotation: 0, isBuilding: () => true, isFriendly: () => false, isEnemy: () => false,
        });
        const behindEntity = marker(geometry.behind.x, geometry.behind.y, "behind");
        const openEntity = marker(geometry.open.x, geometry.open.y, "open");
        const city = ensureCityState();
        city.logistics.carriers = [
            { id: "carrier-behind", x: geometry.behind.x, y: geometry.behind.y, cargo: null },
            { id: "carrier-open", x: geometry.open.x, y: geometry.open.y, cargo: null },
        ];

        // Keep the entity count constant. The WebGL terrain cache keys a
        // collision pass on entities.length, so changing 0 <-> 1 would change
        // the ground between captures and turn that into false evidence.
        const scene = [{ dead: true, x: -100, y: -100 }];
        const drawAfter = async (entity, selectedId) => {
            scene[0] = entity;
            state.selectedBuildingId = selectedId;
            await new Promise(resolve => setTimeout(resolve, 140));
            state.entities = scene;
            state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
            drawWorld();
        };

        await drawAfter(behindEntity, behindEntity.id);
        const behindIds = visibleEntityIdsForTest();
        const behindCarrierIds = visibleCarrierIdsForTest();
        await drawAfter(openEntity, openEntity.id);
        const openIds = visibleEntityIdsForTest();
        const openCarrierIds = visibleCarrierIdsForTest();

        const drawEffectAfter = async (x, y) => {
            state.particles = [{
                x: x * CELL, y: y * CELL, vx: 0, vy: 0,
                life: 20, maxLife: 20, color: "#ffffff", size: 2,
            }];
            state.floaters = [{
                x: x * CELL, y: y * CELL, text: "audit", color: "#ffffff",
                life: 10, vy: 0,
            }];
            await new Promise(resolve => setTimeout(resolve, 140));
            state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
            drawWorld();
            return {
                particles: visibleParticleCountForTest(),
                floaters: visibleFloaterCountForTest(),
            };
        };
        const behindEffect = await drawEffectAfter(geometry.behind.x, geometry.behind.y);
        const openEffect = await drawEffectAfter(geometry.open.x, geometry.open.y);
        const behindDistance = Math.hypot(behindEntity.x - geometry.anchor.x, behindEntity.y - geometry.anchor.y);
        const openDistance = Math.hypot(openEntity.x - geometry.anchor.x, openEntity.y - geometry.anchor.y);

        return {
            geometry,
            canvas: { width: state.canvas.width, height: state.canvas.height },
            behindIds,
            openIds,
            behindCarrierIds,
            openCarrierIds,
            behindEffect,
            openEffect,
            behindDistance,
            openDistance,
            behindVisible: (await import("./js/presentation/rendering/terrain.js"))
                .isForestSightVisible(behindEntity.x, behindEntity.y),
            openVisible: (await import("./js/presentation/rendering/terrain.js"))
                .isForestSightVisible(openEntity.x, openEntity.y),
        };
    });

    console.log("Occlusion geometry " + JSON.stringify(result.geometry));
    console.log("Visible ids: behind " + JSON.stringify(result.behindIds) + " · open " + JSON.stringify(result.openIds));
    console.log("Visible carriers: behind " + JSON.stringify(result.behindCarrierIds) + " · open " + JSON.stringify(result.openCarrierIds));
    console.log("Visible effects: behind " + JSON.stringify(result.behindEffect) + " · open " + JSON.stringify(result.openEffect));
    console.log("Canvas " + result.canvas.width + "×" + result.canvas.height
        + " · behind distance " + result.behindDistance.toFixed(2)
        + " · open distance " + result.openDistance.toFixed(2));
    if (result.behindVisible !== false) throw new Error("The behind entity was not rejected by the sight query.");
    if (result.openVisible !== true) throw new Error("The open entity was rejected by the sight query.");
    if (result.behindIds.includes("behind")) {
        throw new Error("The behind entity entered the real draw set; it is visible through the dense stand.");
    }
    if (!result.openIds.includes("open")) {
        throw new Error("The open control did not enter the real draw set at the same distance.");
    }
    if (result.behindCarrierIds.includes("carrier-behind")) {
        throw new Error("A logistics carrier entered the draw set through the dense stand.");
    }
    if (!result.openCarrierIds.includes("carrier-open")) {
        throw new Error("The open logistics carrier did not enter the draw set.");
    }
    if (result.behindEffect.particles !== 0 || result.behindEffect.floaters !== 0) {
        throw new Error("A particle or floater entered the draw set through the dense stand.");
    }
    if (result.openEffect.particles !== 1 || result.openEffect.floaters !== 1) {
        throw new Error("The open particle/floater did not enter the draw set.");
    }
    if (Math.abs(result.openDistance - result.behindDistance) > 0.05) {
        throw new Error("The open control is not at the same distance as the occluded entity.");
    }
    if (diagnostics.length) throw new Error("Browser diagnostics were emitted:\n" + diagnostics.join("\n"));
    console.log("Dense conifer occlusion verified: behind hidden, open visible at the same distance.");
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
