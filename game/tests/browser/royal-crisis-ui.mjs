import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4174;
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
    await page.locator("#player-name-input").fill("Royal Crisis Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    const setup = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { TYPE } = await import("./js/core/types.js");
        const { ensurePersonProfile } = await import("./js/systems/people.js");
        const { appointRoyalConsort, createRoyalChild, updateRoyalSuccession } = await import("./js/systems/royal-dynasty.js");
        const { getNobilitySnapshot } = await import("./js/systems/nobility.js");
        const { getRoyalCrisisSnapshot, updateRoyalCrisis } = await import("./js/systems/royal-crisis.js");
        const king = state.entities.find(entity => entity.isKing);
        const consort = state.entities.find(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
        const consortPerson = ensurePersonProfile(consort);
        consortPerson.species = "human";
        consortPerson.ageYears = 30;
        consortPerson.lifeStage = "adult";
        getNobilitySnapshot();
        const marriage = appointRoyalConsort(consort.personId);
        if (!marriage.ok) throw new Error("royal marriage failed: " + marriage.reason);
        const child = createRoyalChild().child;
        child.person.ageYears = 0;
        child.person.lifeStage = "young";
        king.dead = true;
        state.personArchive.push({
            personId: king.personId,
            isKing: true,
            person: JSON.parse(JSON.stringify(king.person))
        });
        const succession = updateRoyalSuccession();
        updateRoyalCrisis();
        const crisis = getRoyalCrisisSnapshot();
        return {
            kingName: king.person.name,
            minorName: child.person.name,
            minorKingId: child.personId,
            regentId: crisis.regency.regentId,
            regentName: crisis.regency.regentName,
            claims: crisis.pressingClaims.map(claim => ({ id: claim.id, name: claim.claimantName, support: claim.support })),
            houseCount: getNobilitySnapshot().houseCount,
            succession: { changed: succession.changed, minor: succession.minor }
        };
    });
    assert.equal(setup.succession.changed, true);
    assert.equal(setup.succession.minor, true);
    assert.ok(setup.houseCount >= 1);
    assert.ok(setup.claims.length >= 1, "the minor succession must create a visible claim");
    assert.ok(setup.regentName, "the regency must name a regent");

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="decisions"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("DYNASTIC CRISIS"), null, { timeout: 10000 });
    const panelBefore = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panelBefore, /REGENCY/);
    assert.match(panelBefore, /PRESSING CLAIMS/);
    assert.match(panelBefore, /APPOINT REGENT/);
    assert.match(panelBefore, /PRESS CLAIM/);

    const firstClaim = setup.claims[0];
    const goldBeforeSettle = await page.evaluate(async () => (await import("./js/core/state.js")).state.resources.gold);
    await page.locator('[data-command="royal-settle-claim"]').first().click();
    await page.waitForFunction(async ({ id, support }) => {
        const { state } = await import("./js/core/state.js");
        const claim = state.royal.claims.find(entry => entry.id === id);
        return !claim || claim.support < support || claim.status !== "pressing";
    }, { id: firstClaim.id, support: firstClaim.support }, { timeout: 10000 });
    const afterSettle = await page.evaluate(async id => {
        const { state } = await import("./js/core/state.js");
        const claim = state.royal.claims.find(entry => entry.id === id);
        return { gold: state.resources.gold, support: claim?.support, status: claim?.status };
    }, firstClaim.id);
    assert.equal(afterSettle.gold, goldBeforeSettle - 12);
    assert.ok(afterSettle.support < firstClaim.support);

    const secondClaim = setup.claims.find(claim => claim.id !== firstClaim.id);
    assert.ok(secondClaim, "the panel must expose more than one claim for the conflict proof");
    await page.evaluate(async id => {
        const { state } = await import("./js/core/state.js");
        const claim = state.royal.claims.find(entry => entry.id === id);
        claim.support = 5;
        claim.claimStrength = 5;
        state.politics.legitimacy = 60;
    }, secondClaim.id);
    await page.locator('[data-command="royal-press-claim"][data-value="' + secondClaim.id + '"]').click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.royal.civilConflict.active, null, { timeout: 10000 });
    const conflictText = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(conflictText, /CIVIL CONFLICT/);
    assert.match(conflictText, /CROWN CAMPAIGN/);

    const beforeCampaign = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { gold: state.resources.gold, food: state.resources.food, severity: state.royal.civilConflict.severity };
    });
    await page.locator('[data-command="royal-suppress"]').click();
    await page.waitForFunction(async () => !(await import("./js/core/state.js")).state.royal.civilConflict.active, null, { timeout: 10000 });
    const afterCampaign = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { gold: state.resources.gold, food: state.resources.food, active: state.royal.civilConflict.active, regency: state.royal.regency.active };
    });
    assert.equal(afterCampaign.gold, beforeCampaign.gold - 18);
    assert.equal(afterCampaign.food, beforeCampaign.food - 10);
    assert.equal(afterCampaign.active, false);
    assert.equal(afterCampaign.regency, true);

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
    assert.ok(loadStatus.includes("Loaded realm"), "the royal crisis realm must load; actual: " + loadStatus);
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="decisions"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("DYNASTIC CRISIS"), null, { timeout: 10000 });
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getRoyalCrisisSnapshot } = await import("./js/systems/royal-crisis.js");
        const crisis = getRoyalCrisisSnapshot();
        return {
            regency: crisis.regency.active,
            regentName: crisis.regency.regentName,
            minorName: crisis.regency.minorKingName,
            claims: crisis.claims.length,
            conflict: crisis.civilConflict.active,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(restored.regency, true);
    assert.equal(restored.regentName, setup.regentName);
    assert.equal(restored.minorName, setup.minorName);
    assert.equal(restored.claims, setup.claims.length);
    assert.equal(restored.conflict, false);
    assert.match(restored.text, /REGENCY/);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        seed: 20261117,
        minor: setup.minorName,
        regent: setup.regentName,
        claims: setup.claims.length,
        settled: afterSettle.status,
        conflictSuppressed: !afterCampaign.active,
        loaded: loadStatus,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
