import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4175;
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
    await page.locator("#world-seed-input").fill("20261117");
    await page.locator("#player-name-input").fill("Guarantee Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    const beforeGrant = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.resources.gold = 500;
        state.resources.food = 500;
        state.year = 1;
        state.diplomacy.lastUpdateYear = 0;
        const target = state.diplomacy.realms.find(item => item.id === "northmere");
        target.relation = 60;
        target.trust = 60;
        return { gold: state.resources.gold, relation: target.relation };
    });

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="diplomacy"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("GUARANTEE STANDING"), null, { timeout: 10000 });
    const panelBefore = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panelBefore, /GUARANTEE STANDING/);
    assert.match(panelBefore, /GUARANTEE · 12G/);
    assert.ok(await page.locator('[data-command="diplomacy-guarantee"][data-value="northmere"]').count() === 1);

    await page.locator('[data-command="diplomacy-guarantee"][data-value="northmere"]').click();
    await page.waitForFunction(async () => Boolean((await import("./js/core/state.js")).state.diplomacy.realms.find(item => item.id === "northmere").guarantee), null, { timeout: 10000 });
    const afterGrant = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const target = state.diplomacy.realms.find(item => item.id === "northmere");
        return {
            gold: state.resources.gold,
            guarantee: JSON.parse(JSON.stringify(target.guarantee)),
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(afterGrant.gold, beforeGrant.gold - 12);
    assert.equal(afterGrant.guarantee.sinceYear, 1);
    assert.equal(afterGrant.guarantee.expiresYear, 9);
    assert.match(afterGrant.text, /ROYAL GUARANTEE/);
    assert.match(afterGrant.text, /THE CROWN SHIELDS THIS COURT/);

    const call = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { updateDiplomacy } = await import("./js/systems/diplomacy.js");
        const target = state.diplomacy.realms.find(item => item.id === "northmere");
        target.guarantee.nextCrisisYear = state.year;
        state.diplomacy.lastUpdateYear = state.year - 1;
        updateDiplomacy();
        return JSON.parse(JSON.stringify(target.guaranteeCall));
    });
    assert.ok(call, "the annual court must create a guarantee call");
    assert.equal(call.attackerId, "redpass");
    assert.equal(call.deadlineYear, 2);

    await page.locator('[data-command-tab="politics"]').click();
    await page.locator('[data-command-tab="diplomacy"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("GUARANTEE CALL"), null, { timeout: 10000 });
    const panelCall = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panelCall, /GUARANTEE CALL/);
    assert.match(panelCall, /Redpass Companies THREATENS THIS COURT/);
    assert.match(panelCall, /HONOR · 18G \/ 12F/);
    assert.match(panelCall, /REFUSE · BREAK GUARANTEE/);

    await page.locator('[data-command="diplomacy-honor"][data-value="northmere"]').click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        const target = state.diplomacy.realms.find(item => item.id === "northmere");
        return !target.guaranteeCall && state.diplomacy.guaranteeHonored === 1 &&
            (document.querySelector("#command-panel-content")?.textContent || "").includes("Honoured 1");
    }, null, { timeout: 10000 });
    const afterHonor = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const target = state.diplomacy.realms.find(item => item.id === "northmere");
        return {
            gold: state.resources.gold,
            food: state.resources.food,
            credibility: state.diplomacy.guaranteeCredibility,
            honored: state.diplomacy.guaranteeHonored,
            call: target.guaranteeCall,
            guarantee: JSON.parse(JSON.stringify(target.guarantee)),
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(afterHonor.gold, 470);
    assert.equal(afterHonor.food, 488);
    assert.equal(afterHonor.credibility, 68);
    assert.equal(afterHonor.honored, 1);
    assert.equal(afterHonor.call, null);
    assert.equal(afterHonor.guarantee.honored, 1);
    assert.match(afterHonor.text, /Honoured 1/);
    assert.match(afterHonor.text, /GUARANTEE STANDING · 68\/100/);

    await page.locator("#command-close").click();
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 15000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled && (button.textContent || "").includes("CONTINUE"));
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed");
    }, null, { timeout: 20000 });
    const loadStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the guarantee realm must load; actual: " + loadStatus);
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="diplomacy"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("GUARANTEE STANDING"), null, { timeout: 10000 });
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getDiplomacySnapshot } = await import("./js/systems/diplomacy.js");
        const snapshot = getDiplomacySnapshot();
        const target = snapshot.realms.find(item => item.id === "northmere");
        return {
            credibility: snapshot.guarantees.credibility,
            active: snapshot.guarantees.active,
            honored: snapshot.guarantees.honored,
            pending: snapshot.guarantees.pending,
            guarantee: target.guarantee,
            call: target.guaranteeCall,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(restored.credibility, 68);
    assert.equal(restored.active, 1);
    assert.equal(restored.honored, 1);
    assert.equal(restored.pending, 0);
    assert.equal(restored.guarantee.active, true);
    assert.equal(restored.call, null);
    assert.match(restored.text, /ROYAL GUARANTEE/);
    assert.match(restored.text, /GUARANTEE STANDING · 68\/100/);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        seed: 20261117,
        target: "northmere",
        attacker: call.attackerId,
        credibility: restored.credibility,
        honored: restored.honored,
        loaded: loadStatus,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
