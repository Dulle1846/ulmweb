// Real browser proof for the treaty-age link: a player can see how long each
// pact has held, the annual court rewards the older treaty with more trust and
// aid, the market quotes better terms to it, and the whole reading survives a
// save and reload.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4183;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : "http://127.0.0.1:" + port;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const localServer = process.env.E2E_BASE_URL ? null : createServer(async (req, res) => {
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
if (localServer) await new Promise(resolveListen => localServer.listen(port, "127.0.0.1", resolveListen));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

async function openDiplomacy() {
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="diplomacy"]').click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        const card = document.querySelector('[data-diplomacy-realm="northmere"]');
        const fresh = document.querySelector('[data-diplomacy-realm="redpass"]');
        return text.includes("ENTENTE STANDING") &&
            Boolean(card && card.textContent.includes("TREATY STANDING")) &&
            Boolean(fresh && fresh.textContent.includes("TREATY STANDING"));
    }, null, { timeout: 20000 });
}

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    if (process.env.E2E_EXPECT_VERSION) {
        const marker = await page.evaluate(async () => {
            try {
                const response = await fetch("./version.json?standing=" + Date.now(), { cache: "no-store" });
                return response.ok ? await response.json() : null;
            } catch { return null; }
        });
        assert.ok(marker, "the deployed build must expose a runtime version marker");
        assert.equal(marker.version, process.env.E2E_EXPECT_VERSION);
        if (process.env.E2E_EXPECTED_COMMIT) assert.equal(marker.commit, process.env.E2E_EXPECTED_COMMIT);
    }
    await page.locator("#world-seed-input").fill("20261122");
    await page.locator("#player-name-input").fill("Standing Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    // Two identical alliances at the same relation: one signed sixteen years
    // ago, one signed last year. Only the saved year differs.
    const reading = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { updateDiplomacy } = await import("./js/systems/diplomacy.js");
        const { getDiplomaticStanding } = await import("./js/systems/diplomatic-standing.js");
        const { getDiplomaticTradeTerms } = await import("./js/systems/diplomacy-trade.js");
        state.year = 20;
        state.diplomacy.lastUpdateYear = 19;
        const veteran = state.diplomacy.realms.find(realm => realm.id === "northmere");
        const fresh = state.diplomacy.realms.find(realm => realm.id === "redpass");
        for (const realm of [veteran, fresh]) {
            realm.treaty = "alliance";
            realm.relation = 60;
            realm.trust = 40;
            realm.fear = 20;
            realm.envoySkill = 0;
            realm.lastIncidentYear = 0;
        }
        veteran.treatySinceYear = 4;
        fresh.treatySinceYear = 19;
        const trustBefore = { veteran: veteran.trust, fresh: fresh.trust };
        const longTerms = getDiplomaticTradeTerms(state.diplomacy, veteran.id);
        const newTerms = getDiplomaticTradeTerms(state.diplomacy, fresh.id);
        const goldBefore = state.resources.gold;
        const foodBefore = state.resources.food;
        updateDiplomacy();
        return {
            veteran: {
                years: getDiplomaticStanding(veteran, 20).years,
                tier: getDiplomaticStanding(veteran, 20).tier,
                trustGain: Math.round((veteran.trust - trustBefore.veteran) * 1000) / 1000,
                sinceYear: veteran.treatySinceYear
            },
            fresh: {
                years: getDiplomaticStanding(fresh, 20).years,
                tier: getDiplomaticStanding(fresh, 20).tier,
                trustGain: Math.round((fresh.trust - trustBefore.fresh) * 1000) / 1000,
                sinceYear: fresh.treatySinceYear
            },
            terms: {
                veteran: { buy: longTerms.buyFactor, sell: longTerms.sellFactor, bonus: longTerms.standingBonus },
                fresh: { buy: newTerms.buyFactor, sell: newTerms.sellFactor, bonus: newTerms.standingBonus }
            },
            aid: { gold: state.resources.gold - goldBefore, food: state.resources.food - foodBefore },
            snapshotStanding: (await import("./js/systems/diplomacy.js")).getDiplomacySnapshot().standing
        };
    });

    assert.equal(reading.veteran.years, 16);
    assert.equal(reading.veteran.tier, "entente");
    assert.equal(reading.fresh.years, 1);
    assert.equal(reading.veteran.sinceYear, 4, "the annual court must not rewrite the saved clock");
    assert.ok(reading.veteran.trustGain > reading.fresh.trustGain + 0.3,
        "the veteran alliance must gain meaningfully more trust each year");
    assert.ok(reading.terms.veteran.bonus > reading.terms.fresh.bonus, "the veteran treaty must earn a standing bonus");
    assert.ok(reading.terms.veteran.buy < reading.terms.fresh.buy, "the veteran treaty must buy cheaper");
    assert.ok(reading.terms.veteran.sell > reading.terms.fresh.sell, "the veteran treaty must sell dearer");
    assert.ok(reading.aid.gold >= 8, "both alliances must pay aid, with the veteran paying more");
    assert.ok(reading.aid.food >= 11, "the veteran alliance must also ship more food");
    assert.equal(reading.snapshotStanding.longest.name, "Northmere Guild");
    assert.equal(reading.snapshotStanding.longest.years, 16);
    assert.equal(reading.snapshotStanding.ententes, 1);

    await openDiplomacy();
    const panel = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panel, /ENTENTE STANDING/);
    assert.match(panel, /NORTHMERE GUILD 16 YEARS/);
    assert.match(panel, /TREATY STANDING · 16 YEARS · ENTENTE/);
    assert.match(panel, /TREATY STANDING · 1 YEAR · NEW/);
    assert.match(panel, /War resets this clock/);
    assert.match(panel, /2\.4% better buy and sell terms/);
    const veteranCard = await page.locator('[data-diplomacy-realm="northmere"]').innerText();
    assert.match(veteranCard, /STANDING/);
    assert.match(veteranCard, /16 YRS/);
    const veteranHead = await page.locator('[data-diplomacy-realm="northmere"] .diplomacy-realm__head').innerText();
    assert.match(veteranHead, /16 YRS/);
    await page.screenshot({ path: "artifacts/diplomacy-standing-summary.png", fullPage: false });
    await page.locator('[data-diplomacy-realm="northmere"] .diplomacy-realm__standing').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/diplomacy-standing.png", fullPage: false });

    const beforeSave = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getDiplomaticStanding } = await import("./js/systems/diplomatic-standing.js");
        const { getDiplomaticTradeTerms } = await import("./js/systems/diplomacy-trade.js");
        const veteran = state.diplomacy.realms.find(realm => realm.id === "northmere");
        const terms = getDiplomaticTradeTerms(state.diplomacy, veteran.id);
        return {
            year: state.year,
            sinceYear: veteran.treatySinceYear,
            standing: getDiplomaticStanding(veteran),
            terms: { buy: terms.buyFactor, sell: terms.sellFactor, bonus: terms.standingBonus },
            panel: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });

    await page.locator("#command-close").click();
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Loaded realm"), null, { timeout: 20000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForTimeout(250);

    await openDiplomacy();
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getDiplomaticStanding } = await import("./js/systems/diplomatic-standing.js");
        const { getDiplomaticTradeTerms } = await import("./js/systems/diplomacy-trade.js");
        const veteran = state.diplomacy.realms.find(realm => realm.id === "northmere");
        const terms = getDiplomaticTradeTerms(state.diplomacy, veteran.id);
        return {
            year: state.year,
            sinceYear: veteran.treatySinceYear,
            standing: getDiplomaticStanding(veteran),
            terms: { buy: terms.buyFactor, sell: terms.sellFactor, bonus: terms.standingBonus },
            panel: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(restored.year, beforeSave.year);
    assert.equal(restored.sinceYear, beforeSave.sinceYear, "the treaty clock must survive a reload");
    assert.deepEqual(restored.standing, beforeSave.standing, "the standing reading must be identical after a reload");
    assert.deepEqual(restored.terms, beforeSave.terms, "the market terms must be identical after a reload");
    assert.match(restored.panel, /TREATY STANDING · 16 YEARS · ENTENTE/);
    assert.match(restored.panel, /ENTENTE STANDING · NORTHMERE GUILD 16 YEARS/);
    await page.locator('[data-diplomacy-realm="northmere"] .diplomacy-realm__standing').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/diplomacy-standing-restored.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        baseUrl,
        seed: 20261122,
        veteran: reading.veteran,
        fresh: reading.fresh,
        terms: reading.terms,
        aid: reading.aid,
        snapshotStanding: reading.snapshotStanding,
        restored: { year: restored.year, sinceYear: restored.sinceYear, years: restored.standing.years },
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    if (localServer) await new Promise(resolveClose => localServer.close(resolveClose));
}
