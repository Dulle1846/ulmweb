// Real browser proof for the army-diplomacy link: a player sees the crown's
// dread in the military panel, the neighbouring courts react to it, and the
// border levy appears in the annual muster before and after a save/reload.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4182;
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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

async function openPanel(tab) {
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="' + tab + '"]').click();
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        return text.length > 40;
    }, null, { timeout: 15000 });
}

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261121");
    await page.locator("#player-name-input").fill("Dread Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    await openPanel("military");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("CROWN DREAD"), null, { timeout: 15000 });
    const militaryPanel = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(militaryPanel, /CROWN DREAD/);
    assert.match(militaryPanel, /BORDER LEVY/);
    assert.match(militaryPanel, /measured at the last muster/);
    const militaryVisible = await page.locator("#command-panel-content").innerText();
    assert.match(militaryVisible, /CROWN DREAD · \d+\/100/);
    assert.match(militaryVisible, /border levy at ×/i);
    await page.locator("#command-panel-content .command-note").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/crown-dread-military.png", fullPage: false });

    // Raise the standing army, then let the annual court read it. A relation of
    // 25 would normally be probed; a dreaded crown is left alone.
    const reading = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { ensureDiplomacy, updateDiplomacy } = await import("./js/systems/diplomacy.js");
        const { getDiplomaticTradeTerms } = await import("./js/systems/diplomacy-trade.js");
        const { invalidateCrownDread, getCrownDread } = await import("./js/systems/crown-dread.js");
        const { getMilitarySnapshot, settleOpeningMuster } = await import("./js/systems/military.js");
        state.year = 5;
        state.military.strengthPower = 200;
        state.military.strengthSoldiers = 8;
        state.military.strengthYear = 5;
        invalidateCrownDread();
        const diplomacy = ensureDiplomacy();
        const realm = diplomacy.realms[0];
        realm.fear = 20;
        realm.relation = 25;
        realm.lastIncidentYear = 0;
        diplomacy.lastUpdateYear = 4;
        const dreadBefore = getCrownDread();
        updateDiplomacy();
        const fearAfter = realm.fear;
        const incidentYear = realm.lastIncidentYear;

        const calmTerms = (() => {
            const saved = realm.fear;
            realm.fear = 40;
            const terms = getDiplomaticTradeTerms(diplomacy, realm.id);
            realm.fear = saved;
            return terms;
        })();
        const fearedTerms = (() => {
            const saved = realm.fear;
            realm.fear = 85;
            const terms = getDiplomaticTradeTerms(diplomacy, realm.id);
            realm.fear = saved;
            return terms;
        })();

        // A war and two hostile courts now price the border into the muster.
        diplomacy.realms[1].treaty = "war";
        diplomacy.realms[2].relation = 8;
        state.year = 6;
        state.military.lastMusterYear = 5;
        invalidateCrownDread();
        settleOpeningMuster();
        const payroll = state.military.lastPayroll;
        const snapshot = getMilitarySnapshot();
        return {
            dreadBefore, fearAfter, incidentYear,
            calm: { buy: calmTerms.buyFactor, sell: calmTerms.sellFactor, penalty: calmTerms.dreadPenalty },
            feared: { buy: fearedTerms.buyFactor, sell: fearedTerms.sellFactor, penalty: fearedTerms.dreadPenalty },
            payroll: payroll ? {
                levyFactor: payroll.levyFactor, dread: payroll.dread,
                goldNeed: payroll.goldNeed, foodNeed: payroll.foodNeed, year: payroll.year
            } : null,
            snapshot: { dread: snapshot.dread.dread, band: snapshot.dread.band, pressure: snapshot.pressure.factor }
        };
    });
    assert.ok(reading.dreadBefore.dread >= 60, "a strong garrison must read as feared; got " + reading.dreadBefore.dread);
    assert.notEqual(reading.incidentYear, 5, "a dreaded crown must deter the border incident at relation 25");
    assert.ok(reading.fearAfter > 20, "fear must drift toward the army reading");
    assert.ok(reading.feared.penalty > 0);
    assert.ok(reading.feared.buy > reading.calm.buy, "a feared court charges more");
    assert.ok(reading.feared.sell < reading.calm.sell, "a feared court pays less");
    assert.ok(reading.payroll, "the annual muster must settle");
    assert.ok(reading.payroll.levyFactor > 1, "war and hostility must raise the border levy");
    // The muster measures the real garrison, so the saved dread is the army's
    // true reading rather than the simulated one used for the deterrence check.
    assert.equal(reading.payroll.dread, reading.snapshot.dread);
    assert.ok(reading.payroll.dread >= 20, "the opening garrison must register some dread");
    assert.equal(reading.snapshot.pressure, reading.payroll.levyFactor);

    await page.locator("#command-close").click();
    await openPanel("diplomacy");
    await page.waitForFunction(() => document.querySelectorAll("#command-panel-content [data-diplomacy-realm]").length === 4, null, { timeout: 15000 });
    const diplomacyPanel = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(diplomacyPanel, /CROWN DREAD/);
    assert.match(diplomacyPanel, /FEAR/);
    assert.match(diplomacyPanel, /drifts toward/i);
    const diplomacyVisible = await page.locator("#command-panel-content").innerText();
    assert.match(diplomacyVisible, /CROWN DREAD · \d+\/100/);
    await page.locator("#command-panel-content .command-note").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/crown-dread-diplomacy.png", fullPage: false });

    const beforeSave = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getCrownDread, getFrontierPressure } = await import("./js/systems/crown-dread.js");
        return {
            strengthPower: state.military.strengthPower,
            strengthSoldiers: state.military.strengthSoldiers,
            levyFactor: state.military.lastPayroll?.levyFactor,
            dread: getCrownDread().dread,
            pressure: getFrontierPressure().factor,
            fear: state.diplomacy.realms.map(realm => Math.round(realm.fear * 10) / 10),
            wars: state.diplomacy.realms.filter(realm => realm.treaty === "war").length
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

    await openPanel("military");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("CROWN DREAD"), null, { timeout: 15000 });
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getCrownDread, getFrontierPressure } = await import("./js/systems/crown-dread.js");
        return {
            strengthPower: state.military.strengthPower,
            strengthSoldiers: state.military.strengthSoldiers,
            levyFactor: state.military.lastPayroll?.levyFactor,
            dread: getCrownDread().dread,
            pressure: getFrontierPressure().factor,
            fear: state.diplomacy.realms.map(realm => Math.round(realm.fear * 10) / 10),
            wars: state.diplomacy.realms.filter(realm => realm.treaty === "war").length,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(restored.strengthPower, beforeSave.strengthPower);
    assert.equal(restored.strengthSoldiers, beforeSave.strengthSoldiers);
    assert.equal(restored.levyFactor, beforeSave.levyFactor, "the border levy must survive a reload");
    assert.equal(restored.dread, beforeSave.dread);
    assert.equal(restored.pressure, beforeSave.pressure);
    assert.deepEqual(restored.fear, beforeSave.fear, "the courts must remember their fear");
    assert.equal(restored.wars, 1);
    assert.match(restored.text, /CROWN DREAD/);
    assert.match(restored.text, /BORDER LEVY/);
    await page.screenshot({ path: "artifacts/crown-dread-restored.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true, seed: 20261121,
        dread: { before: reading.dreadBefore.dread, band: reading.dreadBefore.band, power: reading.dreadBefore.power, soldiers: reading.dreadBefore.soldiers },
        fear: { before: 20, after: Math.round(reading.fearAfter * 10) / 10 },
        incidentYear: reading.incidentYear,
        terms: { calm: reading.calm, feared: reading.feared },
        muster: reading.payroll,
        restored: { levyFactor: restored.levyFactor, dread: restored.dread, pressure: restored.pressure, wars: restored.wars },
        pageErrors: pageErrors.length, consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
