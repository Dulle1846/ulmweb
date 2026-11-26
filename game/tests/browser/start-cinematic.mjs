// Player-facing reference for the 3.72.0 founding gate.
// Verifies the illustrated start cover, the possible-chapter cards, the quick
// start, a real loading screen between menu and realm, and a phone layout that
// does not overflow horizontally.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const root = process.cwd();
const outDir = resolve(process.env.START_CINEMATIC_OUT || "artifacts/start-cinematic");
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        const body = await readFile(file);
        response.writeHead(200, {
            "content-type": mime[extname(file)] || "application/octet-stream",
            "cache-control": "no-store",
        });
        response.end(body);
    } catch {
        response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = "http://127.0.0.1:" + server.address().port;

await mkdir(outDir, { recursive: true });
const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}
const { chromium } = await import("playwright");
const browser = await chromium.launch(browserLaunchOptions());
const report = { ok: false, desktop: {}, mobile: {}, consoleErrors: [], pageErrors: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("console", message => {
        if (message.type() === "error") report.consoleErrors.push(message.text());
    });
    page.on("pageerror", error => report.pageErrors.push(error.message));

    await page.goto(baseUrl + "/?start-cinematic=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.locator("#start-screen .start-hero-art").waitFor({ state: "visible", timeout: 10000 });

    assert.equal(await page.locator("#start-screen .start-cover").count(), 1, "the start screen needs the illustrated cover");
    assert.equal(await page.locator("#start-screen .start-vignette").count(), 3, "the gate must show three possible chapters");
    const vignetteText = (await page.locator("#start-vignettes").innerText()).replace(/\s+/g, " ").trim();
    assert.match(vignetteText, /YEAR \d+/, "possible chapters need a year");
    assert.match(vignetteText, /THE LAND|THE CROWN|THE CHRONICLE/, "possible chapters need player-facing themes");
    assert.doesNotMatch(vignetteText, /undefined|NaN/);
    assert.equal(await page.locator("#start-new-game-btn").isVisible(), true, "the quick start must be visible without scrolling the folio");
    assert.equal(await page.locator("#start-custom-game-btn").count(), 1, "the tailored start must remain available");
    assert.equal(await page.locator("#start-screen").evaluate(element => element.scrollWidth <= element.clientWidth + 1), true,
        "the desktop start screen must not overflow horizontally");
    await page.screenshot({ path: outDir + "/start-gate.png" });

    await page.locator("#player-name-input").fill("Cinematic Player");
    await page.locator("#world-size").selectOption("compact");
    await page.locator("#world-climate").selectOption("swamp");
    const startedAt = Date.now();
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-loading").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await page.locator("#start-screen").getAttribute("aria-busy"), "true");
    assert.equal(await page.locator("#start-screen .start-panel").isVisible(), false,
        "the founding folio must hand the whole overlay to the loading screen");
    assert.equal(await page.locator("#start-loading-map").isVisible(), true, "the loading screen must show the chosen world");
    const mapPixels = await page.locator("#start-loading-map").evaluate(canvas => {
        const ctx = canvas.getContext("2d");
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        for (let index = 0; index < data.length; index += 4000) {
            colors.add(data[index] + ":" + data[index + 1] + ":" + data[index + 2]);
        }
        return colors.size;
    });
    assert.ok(mapPixels >= 4, "the loading map must contain the real world preview, not a blank canvas");
    const loadingText = (await page.locator("#start-loading").innerText()).replace(/\s+/g, " ").trim();
    for (const label of ["FOUNDING THE REALM", "SURVEY THE LAND", "RAISE THE FIRST SETTLEMENT", "OPEN THE ROYAL CHANCERY", "WRITE THE FIRST CHRONICLE", "OPEN THE GATES"]) {
        assert.ok(loadingText.toLowerCase().includes(label.toLowerCase()), "the loading screen must show " + label);
    }
    assert.ok(Number(await page.locator("#loading-progress-track").getAttribute("aria-valuenow")) >= 8,
        "the loading screen must expose real progress");
    assert.equal(await page.locator("#loading-steps .is-current").count(), 1, "one loading step must be active");
    assert.match(await page.locator("#loading-chapter-title").innerText(), /\S/, "a possible chapter must be visible while loading");
    assert.doesNotMatch(loadingText, /undefined|NaN/);
    await page.screenshot({ path: outDir + "/start-loading.png" });
    report.desktop.loading = {
        text: loadingText.slice(0, 3000),
        progress: Number(await page.locator("#loading-progress-track").getAttribute("aria-valuenow")),
        mapColors: mapPixels,
    };

    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 60000 });
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed >= 1000, "the loading screen must be a real sequence, not a single-frame flash");
    assert.equal(await page.locator("#start-loading").isVisible(), false, "the loading screen must leave with the gate");
    assert.equal(await page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted), true);
    assert.equal(await page.locator("#command-open-btn").isVisible(), true, "the realm must be interactive after loading");
    await page.screenshot({ path: outDir + "/started-realm.png" });
    report.desktop.elapsedMs = elapsed;
    report.desktop.started = true;
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const mobile = await mobileContext.newPage();
    mobile.on("console", message => {
        if (message.type() === "error") report.consoleErrors.push("mobile: " + message.text());
    });
    mobile.on("pageerror", error => report.pageErrors.push("mobile: " + error.message));
    await mobile.goto(baseUrl + "/?start-cinematic=mobile", { waitUntil: "domcontentloaded", timeout: 60000 });
    await mobile.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    assert.equal(await mobile.locator("#start-vignettes .start-vignette").count(), 3);
    assert.equal(await mobile.locator("#start-screen").evaluate(element => element.scrollWidth <= element.clientWidth + 1), true,
        "the phone start screen must not overflow horizontally");
    const quickBox = await mobile.locator("#start-new-game-btn").boundingBox();
    assert.ok(quickBox && quickBox.width >= 180, "the phone quick start must remain a full-sized target");
    await mobile.screenshot({ path: outDir + "/start-mobile.png" });
    await mobile.locator("#player-name-input").scrollIntoViewIfNeeded();
    await mobile.screenshot({ path: outDir + "/start-mobile-form.png" });
    report.mobile = {
        width: await mobile.locator("#start-screen").evaluate(element => element.scrollWidth),
        height: await mobile.locator("#start-screen").evaluate(element => element.scrollHeight),
        quickStartWidth: Math.round(quickBox.width),
    };
    await mobileContext.close();

    assert.deepEqual(report.pageErrors, [], "start experience produced page errors: " + report.pageErrors.join(" | "));
    assert.deepEqual(report.consoleErrors, [], "start experience produced console errors: " + report.consoleErrors.join(" | "));
    report.ok = true;
    console.log("Start cinematic E2E passed:", JSON.stringify(report));
} finally {
    await writeFile(outDir + "/start-cinematic.json", JSON.stringify(report, null, 2) + "\n");
    await browser.close().catch(() => {});
    await new Promise(resolveClose => server.close(resolveClose));
}
