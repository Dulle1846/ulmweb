// Real-browser proof for the 3.77.0 envoy missions. Start a deterministic realm,
// pause it, appoint a resident envoy through Diplomacy, send a paid mission,
// advance one year to negotiate with the dedicated RNG stream, one year to file
// the report, save/load the nested diplomacy.missions DTO, then ratify the
// accepted trade pact into the real treaty. No page or console errors are allowed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4288;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : null;
const label = process.env.E2E_LABEL || "local";
const artifact = name => label === "local" ? "artifacts/" + name : "artifacts/" + name.replace(/\.png$/, "-" + label + ".png");
const mime = {
    ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
    ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".json":"application/json",
    ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp"
};
const server = baseUrl ? null : createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type":mime[extname(file)] || "application/octet-stream", "cache-control":"no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type":"text/plain" }).end("Not found");
    }
});
if (server) await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport:{ width:1600, height:1000 }, reducedMotion:"reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const url = baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/";

async function openPanel(id) {
    if (await page.locator("#command-modal").evaluate(element => element.classList.contains("hidden"))) {
        await page.locator("#command-open-btn").click();
        await page.locator("#command-modal").waitFor({ state:"visible", timeout:15000 });
    }
    await page.locator('[data-command-tab="' + id + '"]').click();
    await page.waitForFunction(tab => {
        const button = document.querySelector('[data-command-tab="' + tab + '"]');
        const content = document.querySelector("#command-panel-content");
        return Boolean(button?.classList.contains("is-active") && content?.textContent.trim().length > 40);
    }, id, { timeout:15000 });
}

async function missionState(realmId = "northmere") {
    return page.evaluate(async courtRealmId => {
        const [{ state }, diplomacy] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/diplomacy.js")
        ]);
        const d = diplomacy.getDiplomacySnapshot();
        const realm = d.realms.find(item => item.id === courtRealmId) || null;
        return {
            year:state.year,
            gold:Math.round(Number(state.resources.gold) || 0),
            morale:Math.round(Number(state.morale) || 0),
            streams:{ ...(state.randomStreams || {}) },
            limits:{ ...d.missionLimits },
            missions:d.missions.map(mission => ({
                id:mission.id, realmId:mission.realmId, goalTreaty:mission.goalTreaty,
                stage:mission.stage, envoyName:mission.envoyName, envoySkill:mission.envoySkill,
                sentYear:mission.sentYear, negotiatedYear:mission.negotiatedYear,
                reportYear:mission.reportYear, expiresYear:mission.expiresYear,
                score:mission.score, difficulty:mission.difficulty, roll:mission.roll,
                outcome:mission.outcome, nextAction:mission.nextAction,
                canNegotiate:mission.canNegotiate, canReport:mission.canReport, canRatify:mission.canRatify
            })),
            treaty:realm?.treaty || null,
            treatySinceYear:realm?.treatySinceYear || 0,
            history:d.history.filter(entry => entry.kind === "mission").slice(0, 6).map(entry => ({ ...entry }))
        };
    }, realmId);
}

async function setYear(year) {
    await page.evaluate(value => import("./js/core/state.js").then(({ state }) => { state.year = value; }), year);
    await page.waitForFunction(value => document.querySelector("#year")?.textContent.includes("YEAR " + value), year, { timeout:15000 }).catch(() => {});
}

let proof = {};
try {
    await page.goto(url, { waitUntil:"domcontentloaded", timeout:60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Envoy Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter:true, timeout:120000 });
    await page.locator("#start-screen").waitFor({ state:"hidden", timeout:120000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout:10000 });

    await openPanel("diplomacy");
    await page.waitForFunction(() => /ENVOY MISSIONS · 0 \/ 6 ACTIVE/.test(
        document.querySelector("#command-panel-content")?.textContent || ""
    ), null, { timeout:15000 });
    const intro = await page.locator("#command-panel-content").textContent();
    assert.match(intro, /ENVOY MISSIONS · 0 \/ 6 ACTIVE/);
    assert.match(intro, /Send → Negotiate → Report → Ratify/);

    // A freshly founded realm has no adult court candidates yet. Give it one
    // real resident through the same person profile used by the court, then
    // re-render the panel from the tab contract. The mission itself is still
    // appointed and played through the visible UI.
    await page.evaluate(async () => {
        const [{ state }, { TYPE, Entity }, { ensurePersonProfile }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"), import("./js/systems/people.js")
        ]);
        const entity = new Entity(10, 10, TYPE.VILLAGER);
        entity.id = "proof-envoy";
        entity.personId = "proof-envoy";
        ensurePersonProfile(entity);
        entity.person.name = "Aelia";
        entity.person.ageYears = 30;
        entity.person.species = "human";
        entity.person.traits = { sociability:90, patience:85, curiosity:75, distrust:15 };
        state.entities.push(entity);
    });
    await openPanel("kingdom");
    await openPanel("diplomacy");
    const envoySelect = page.locator("#envoy-northmere");
    await envoySelect.waitFor({ state:"visible", timeout:15000 });
    assert.ok(await envoySelect.locator("option").count() > 1, "an eligible envoy must exist");
    const realmId = "northmere";
    await envoySelect.selectOption({ label:"Aelia · human · 0 fit" }).catch(async () => {
        await envoySelect.selectOption({ index:1 });
    });
    await page.locator('[data-command="diplomacy-envoy"][data-value="' + realmId + '"]').click();
    await page.waitForFunction(() => /ENVOY APPOINTED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout:15000 });
    await openPanel("diplomacy");

    const before = await missionState();
    assert.equal(before.missions.length, 0);
    const sendButton = page.locator('[data-command="diplomacy-mission-send"][data-value="' + realmId + '"]');
    assert.equal(await sendButton.count(), 1, "an appointed envoy must unlock a mission");
    const goalSelect = page.locator("#mission-goal-" + realmId);
    await goalSelect.selectOption("trade");
    await sendButton.click();
    await page.waitForFunction(() => /DIPLOMATIC MISSION SENT/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout:15000 });
    const sent = await missionState();
    assert.equal(sent.missions.length, 1);
    assert.equal(sent.missions[0].realmId, realmId);
    assert.equal(sent.missions[0].goalTreaty, "trade");
    assert.equal(sent.missions[0].stage, "sent");
    assert.equal(sent.gold, before.gold - before.limits.costGold);
    assert.equal(sent.streams.diplomacy || 0, 0, "sending must not roll");
    const missionId = sent.missions[0].id;
    await page.screenshot({ path:artifact("diplomatic-mission-sent.png"), fullPage:false });

    assert.equal((await missionState()).missions[0].canNegotiate, false, "negotiation must wait for the next year");
    await setYear(2);
    await openPanel("diplomacy");
    await page.waitForFunction(id => {
        const button = document.querySelector('[data-command="diplomacy-mission-negotiate"][data-value="' + id + '"]');
        return Boolean(button && !button.disabled);
    }, missionId, { timeout:15000 });
    await page.locator('[data-command="diplomacy-mission-negotiate"][data-value="' + missionId + '"]').click();
    await page.waitForFunction(() => /DIPLOMATIC NEGOTIATION/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout:15000 });
    const negotiated = await missionState();
    assert.equal(negotiated.missions[0].stage, "negotiated");
    assert.ok(negotiated.missions[0].roll >= 0 && negotiated.missions[0].roll < 1);
    assert.ok(negotiated.missions[0].score >= 45, "the starting envoy should earn a trade verdict");
    assert.equal(negotiated.missions[0].difficulty, 45);
    assert.equal(negotiated.missions[0].outcome, "accepted");
    assert.equal(negotiated.streams.diplomacy, 1, "exactly one diplomacy draw must occur");
    assert.equal(negotiated.streams.simulation || 0, sent.streams.simulation || 0, "simulation stream must stay untouched");
    assert.equal(negotiated.streams.combat || 0, sent.streams.combat || 0, "combat stream must stay untouched");
    await page.screenshot({ path:artifact("diplomatic-mission-negotiated.png"), fullPage:false });

    await setYear(3);
    await openPanel("diplomacy");
    await page.locator('[data-command="diplomacy-mission-report"][data-value="' + missionId + '"]').click();
    await page.waitForFunction(() => /DIPLOMATIC REPORT FILED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout:15000 });
    const reported = await missionState();
    assert.equal(reported.missions[0].stage, "reported");
    assert.equal(reported.missions[0].reportYear, 3);
    assert.equal(reported.gold, sent.gold, "reporting must not spend gold");

    const roundtrip = await page.evaluate(async () => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        const beforeMissions = JSON.parse(JSON.stringify(state.diplomacy.missions));
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        return { beforeMissions, afterMissions:JSON.parse(JSON.stringify(state.diplomacy.missions)) };
    });
    assert.deepEqual(roundtrip.afterMissions, roundtrip.beforeMissions, "the nested mission DTO must survive save/load");
    assert.equal(roundtrip.afterMissions[0].stage, "reported");

    await setYear(4);
    await openPanel("diplomacy");
    await page.waitForFunction(id => {
        const button = document.querySelector('[data-command="diplomacy-mission-ratify"][data-value="' + id + '"]');
        return Boolean(button && !button.disabled);
    }, missionId, { timeout:15000 });
    await page.locator('[data-command="diplomacy-mission-ratify"][data-value="' + missionId + '"]').click();
    await page.waitForFunction(() => /DIPLOMATIC TRADE PACT RATIFIED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout:15000 });
    const ratified = await missionState();
    assert.equal(ratified.missions.length, 0);
    assert.equal(ratified.treaty, "trade");
    assert.equal(ratified.treatySinceYear, 4);
    assert.equal(ratified.gold, sent.gold, "ratification must not charge the direct trade-pact fee");
    assert.ok(ratified.history.some(entry => /RATIFIED/.test(entry.summary)));
    await page.screenshot({ path:artifact("diplomatic-mission-ratified.png"), fullPage:false });

    assert.deepEqual(pageErrors, [], "the mission proof must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the mission proof must not raise console errors");
    console.log(JSON.stringify({
        ok:true, intro:intro.replace(/\s+/g, " ").trim().slice(0, 180), realmId, before, sent, negotiated,
        reported, roundtrip, ratified, pageErrors, consoleErrors
    }, null, 2));
} finally {
    if (pageErrors.length || consoleErrors.length) {
        console.error(JSON.stringify({ pageErrors, consoleErrors }, null, 2));
    }
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
