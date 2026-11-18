// Player-seat proof for the field-medicine loop. A fresh realm starts with no
// practice, treated cases are remembered at the annual audit, the memory fades
// when left untended, and the same reading survives a real save/reload.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const liveBaseUrl = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const port = Number(process.env.E2E_PORT) || 4183;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = liveBaseUrl ? null : createServer(async (req, res) => {
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
if (server) await new Promise(resolveListen => server.listen(port, "127.0.0.1", resolveListen));
const baseUrl = liveBaseUrl || "http://127.0.0.1:" + port;
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

async function scrollFieldSection() {
    await page.evaluate(() => {
        const title = [...document.querySelectorAll("#command-panel-content .command-section-title")]
            .find(element => (element.textContent || "").includes("FIELD MEDICINE"));
        title?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(150);
}

async function closePanel() {
    if (await page.locator("#command-close").count()) {
        const visible = await page.locator("#command-close").isVisible().catch(() => false);
        if (visible) await page.locator("#command-close").click();
    }
}

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Field Medicine Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    await openPanel("health");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("FIELD MEDICINE"), null, { timeout: 15000 });
    const fresh = await page.evaluate(async () => {
        const { getHealthSnapshot } = await import("./js/systems/health.js");
        const snapshot = getHealthSnapshot();
        return {
            medicine: snapshot.fieldMedicine,
            treated: snapshot.fieldTreatedLastYear,
            relief: snapshot.fieldOutbreakReduction,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(fresh.medicine, 0, "a fresh realm must not invent field practice");
    assert.equal(fresh.treated, 0);
    assert.match(fresh.text, /FIELD MEDICINE · 0 \/ 24/);
    assert.match(fresh.text, /No field practice yet/);
    assert.match(fresh.text, /TREAT WITH FIELD REMEDIES/);
    assert.doesNotMatch(fresh.text, /−0%/);
    await scrollFieldSection();
    await page.screenshot({ path: "artifacts/field-medicine-fresh.png", fullPage: false });

    // Stage one real outbreak and gathered stock. The player-facing action then
    // spends the herbs through the normal health command, not a test-only path.
    await closePanel();
    const staged = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { startOutbreak, getHealthSnapshot } = await import("./js/systems/health.js");
        state.forestGathering = state.forestGathering || { version: 1, stock: {}, totalGathered: {}, quality: {}, history: [], lastGather: {} };
        state.forestGathering.stock = { ...(state.forestGathering.stock || {}), herbs: 4 };
        state.health.medicineStock = 0;
        startOutbreak({ severity: 2, disease: "field-fever" });
        const snapshot = getHealthSnapshot();
        return { sick: snapshot.sick, stock: snapshot.fieldStock, treated: snapshot.herbalTreated };
    });
    assert.ok(staged.sick >= 1, "the staged outbreak must create a sick resident");
    assert.equal(staged.stock, 4);

    await openPanel("health");
    await page.waitForFunction(() => {
        const button = document.querySelector('[data-command="health-field"]');
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator('[data-command="health-field"]').click();
    await page.waitForFunction(async () => {
        const { getHealthSnapshot } = await import("./js/systems/health.js");
        return getHealthSnapshot().herbalTreated > 0;
    }, null, { timeout: 10000 });
    const treated = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getHealthSnapshot } = await import("./js/systems/health.js");
        const snapshot = getHealthSnapshot();
        return {
            herbalTreated: snapshot.herbalTreated,
            stock: snapshot.fieldStock,
            medicine: snapshot.fieldMedicine,
            text: document.querySelector("#command-panel-content")?.textContent || "",
            stateHealth: state.health
        };
    });
    assert.ok(treated.herbalTreated >= 1);
    assert.ok(treated.stock < 4, "the action must consume the gathered remedy");
    assert.equal(treated.medicine, 0, "treatment is not remembered until the annual audit");

    // Advance one year and run the same annual health audit used by the realm.
    const grown = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getHealthSnapshot, updateHealth } = await import("./js/systems/health.js");
        state.tick = 1;
        state.year = Math.max(2, (Number(state.year) || 1) + 1);
        state.health.lastYear = state.year - 1;
        updateHealth();
        const snapshot = getHealthSnapshot();
        return {
            medicine: snapshot.fieldMedicine,
            treatedLastYear: snapshot.fieldTreatedLastYear,
            outbreakReduction: snapshot.fieldOutbreakReduction,
            mortalityReduction: snapshot.fieldMortalityReduction,
            severityRelief: snapshot.fieldSeverityRelief,
            herbalTreated: snapshot.herbalTreated
        };
    });
    assert.ok(grown.medicine > 0, "the annual audit must turn treatment into practice");
    assert.equal(grown.treatedLastYear, treated.herbalTreated);
    assert.ok(grown.outbreakReduction > 0, "practice must lower outbreak risk");
    assert.ok(grown.mortalityReduction > 0, "practice must lower illness mortality");

    await closePanel();
    await openPanel("health");
    const grownText = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(grownText, new RegExp("FIELD MEDICINE · " + grown.medicine + " / 24"));
    assert.match(grownText, /TREATED CASES/);
    assert.match(grownText, /OUTBREAK RISK/);
    assert.match(grownText, /ILLNESS MORTALITY/);
    assert.match(grownText, /Every annual audit turns treatments actually given/);
    await scrollFieldSection();
    await page.screenshot({ path: "artifacts/field-medicine-grown.png", fullPage: false });

    // Leave the practice untended for a year: the remembered score must fade.
    const faded = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getHealthSnapshot, updateHealth } = await import("./js/systems/health.js");
        state.tick = 1;
        state.year = Math.max(3, (Number(state.year) || 1) + 1);
        state.health.lastYear = state.year - 1;
        updateHealth();
        const snapshot = getHealthSnapshot();
        return {
            medicine: snapshot.fieldMedicine,
            treatedLastYear: snapshot.fieldTreatedLastYear,
            outbreakReduction: snapshot.fieldOutbreakReduction,
            mortalityReduction: snapshot.fieldMortalityReduction
        };
    });
    assert.ok(faded.medicine < grown.medicine, "untended practice must decay");
    assert.equal(faded.treatedLastYear, 0);
    assert.ok(faded.outbreakReduction > 0);
    assert.ok(faded.mortalityReduction > 0);

    await closePanel();
    await openPanel("health");
    const fadedText = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(fadedText, new RegExp("FIELD MEDICINE · " + faded.medicine + " / 24"));
    assert.match(fadedText, /TREATED CASES/);
    await scrollFieldSection();
    await page.screenshot({ path: "artifacts/field-medicine-faded.png", fullPage: false });

    const beforeSave = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getFieldMedicineRelief, getHealthSnapshot } = await import("./js/systems/health.js");
        const snapshot = getHealthSnapshot();
        return {
            medicine: state.health.fieldMedicine,
            seen: state.health.fieldTreatedSeen,
            lastYear: state.health.fieldTreatedLastYear,
            herbalTreated: state.health.herbalTreated,
            relief: getFieldMedicineRelief(),
            snapshot: {
                fieldMedicine: snapshot.fieldMedicine,
                fieldTreatedLastYear: snapshot.fieldTreatedLastYear,
                fieldOutbreakReduction: snapshot.fieldOutbreakReduction,
                fieldMortalityReduction: snapshot.fieldMortalityReduction
            }
        };
    });
    await closePanel();
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

    await openPanel("health");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("FIELD MEDICINE"), null, { timeout: 15000 });
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getFieldMedicineRelief, getHealthSnapshot } = await import("./js/systems/health.js");
        const snapshot = getHealthSnapshot();
        return {
            medicine: state.health.fieldMedicine,
            seen: state.health.fieldTreatedSeen,
            lastYear: state.health.fieldTreatedLastYear,
            herbalTreated: state.health.herbalTreated,
            relief: getFieldMedicineRelief(),
            snapshot: {
                fieldMedicine: snapshot.fieldMedicine,
                fieldTreatedLastYear: snapshot.fieldTreatedLastYear,
                fieldOutbreakReduction: snapshot.fieldOutbreakReduction,
                fieldMortalityReduction: snapshot.fieldMortalityReduction
            },
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.deepEqual(restored.snapshot, beforeSave.snapshot, "the player-visible reading and effects must survive reload");
    assert.deepEqual(restored.relief, beforeSave.relief);
    assert.equal(restored.medicine, beforeSave.medicine);
    assert.equal(restored.seen, beforeSave.seen);
    assert.equal(restored.lastYear, beforeSave.lastYear);
    assert.equal(restored.herbalTreated, beforeSave.herbalTreated);
    assert.match(restored.text, new RegExp("FIELD MEDICINE · " + beforeSave.snapshot.fieldMedicine + " / 24"));
    assert.match(restored.text, /TREATED CASES/);
    await scrollFieldSection();
    await page.screenshot({ path: "artifacts/field-medicine-restored.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true, seed: 20261126,
        fresh: { medicine: fresh.medicine, treated: fresh.treated },
        staged,
        afterTreatment: { herbalTreated: treated.herbalTreated, stock: treated.stock },
        grown,
        faded,
        restored: beforeSave.snapshot,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
