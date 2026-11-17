import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4176;
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const readForm = () => page.evaluate(async () => {
    const { state } = await import("./js/core/state.js");
    const value = id => document.getElementById(id)?.value || "";
    return {
        seed: value("world-seed-input"),
        realm: value("realm-name-input"),
        dynasty: value("realm-dynasty-input"),
        culture: value("realm-culture"),
        government: value("realm-government"),
        size: value("world-size"),
        shape: value("world-shape"),
        climate: value("world-climate"),
        endless: Boolean(document.getElementById("world-endless")?.checked),
        summary: document.getElementById("random-realm-summary")?.textContent || "",
        started: Boolean(state.hasStarted)
    };
});

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.locator("#player-name-input").fill("Random Audit");
    await page.evaluate(() => {
        // Keep the offer on compact worlds and exercise non-default choices.
        // The seed still comes from crypto, so reroll remains visible.
        Math.random = () => 0.2;
    });
    const baseline = await readForm();
    assert.equal(await page.locator("#random-realm-btn").getAttribute("aria-expanded"), "false");

    await page.locator("#random-realm-btn").click();
    await page.locator("#random-realm-confirm").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await page.locator("#random-realm-btn").getAttribute("aria-expanded"), "true");
    const draft = await readForm();
    assert.equal(draft.started, false, "opening the offer must not start the realm");
    assert.match(draft.summary, /KEEPER Random Audit/);
    assert.match(draft.summary, /WORLD seed \d+/);
    assert.match(draft.summary, /∞ ENDLESS REALM|CLASSIC FINITE CAMPAIGN/);
    assert.notEqual(draft.culture, baseline.culture);
    assert.notEqual(draft.government, baseline.government);
    assert.equal(draft.size, "compact", "the test keeps the generated world compact");
    assert.notEqual(draft.shape, baseline.shape);
    assert.notEqual(draft.climate, baseline.climate);
    assert.equal(draft.endless, true);
    assert.notEqual(draft.realm, baseline.realm);
    assert.notEqual(draft.dynasty, baseline.dynasty);
    assert.notEqual(draft.seed, baseline.seed);

    await page.locator("#random-realm-reroll").click();
    await page.waitForFunction(previous => {
        const value = document.getElementById("world-seed-input")?.value;
        return value && value !== previous;
    }, draft.seed, { timeout: 10000 });
    const rerolled = await readForm();
    assert.equal(rerolled.started, false);
    assert.notEqual(rerolled.seed, draft.seed);
    assert.equal(rerolled.realm, draft.realm, "a reroll should keep the same test-controlled choices");

    await page.locator("#random-realm-cancel").click();
    await page.locator("#random-realm-confirm").waitFor({ state: "hidden", timeout: 5000 });
    const restored = await readForm();
    assert.deepEqual(
        { seed: restored.seed, realm: restored.realm, dynasty: restored.dynasty, culture: restored.culture, government: restored.government, size: restored.size, shape: restored.shape, climate: restored.climate, endless: restored.endless },
        { seed: baseline.seed, realm: baseline.realm, dynasty: baseline.dynasty, culture: baseline.culture, government: baseline.government, size: baseline.size, shape: baseline.shape, climate: baseline.climate, endless: baseline.endless },
        "cancel must restore every founding control"
    );
    assert.equal(await page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted), false);

    await page.locator("#random-realm-btn").click();
    await page.locator("#random-realm-confirm").waitFor({ state: "visible", timeout: 10000 });
    const acceptedDraft = await readForm();
    assert.match(acceptedDraft.summary, /KEEPER Random Audit/);
    assert.match(acceptedDraft.summary, /CHARTER .+ · .+ · .+/);

    await page.locator("#random-realm-accept").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 30000 });
    const started = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            seed: state.worldSeed,
            playerName: state.playerName,
            realm: state.identity?.kingdomName,
            dynasty: state.identity?.dynastyName,
            culture: state.identity?.culture,
            government: state.government?.form,
            size: state.worldOptions?.size,
            shape: state.worldOptions?.shape,
            climate: state.worldOptions?.climate,
            endless: state.endless?.enabled
        };
    });
    assert.equal(started.seed, Number(acceptedDraft.seed));
    assert.equal(started.playerName, "Random Audit");
    assert.equal(started.realm, acceptedDraft.realm);
    assert.equal(started.dynasty, acceptedDraft.dynasty);
    assert.equal(started.culture, acceptedDraft.culture);
    assert.equal(started.government, acceptedDraft.government);
    assert.equal(started.size, acceptedDraft.size);
    assert.equal(started.shape, acceptedDraft.shape);
    assert.equal(started.climate, acceptedDraft.climate);
    assert.equal(started.endless, acceptedDraft.endless);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        seed: started.seed,
        realm: started.realm,
        dynasty: started.dynasty,
        culture: started.culture,
        government: started.government,
        size: started.size,
        shape: started.shape,
        climate: started.climate,
        endless: started.endless,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
