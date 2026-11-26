// Real-browser proof for the 3.76.0 council docket. Found a realm, paused it,
// opened Government, proposed and paid a real Bread Ordinance lobby, advanced
// to the next year, called the visible council vote, verified enactment in the
// government record and council history, ran the bounded annual session on a
// second bill, then save/loaded the nested government.council DTO. No page or
// console errors are tolerated.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4282;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : null;
const label = process.env.E2E_LABEL || "local";
const artifact = name => label === "local" ? "artifacts/" + name : "artifacts/" + name.replace(/\.png$/, "-" + label + ".png");
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = baseUrl ? null : createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
if (server) await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
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
        await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    }
    await page.locator('[data-command-tab="' + id + '"]').click();
    await page.waitForFunction(tab => {
        const button = document.querySelector('[data-command-tab="' + tab + '"]');
        const content = document.querySelector("#command-panel-content");
        return Boolean(button?.classList.contains("is-active") && content?.textContent.trim().length > 40);
    }, id, { timeout: 15000 });
}

async function councilState() {
    return page.evaluate(async () => {
        const [{ state }, council] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/council-laws.js")
        ]);
        const c = council.getCouncilSnapshot();
        return {
            year: state.year,
            gold: Math.round(Number(state.resources.gold) || 0),
            food: Math.round(Number(state.resources.food) || 0),
            morale: Math.round(Number(state.morale) || 0),
            councilCounter: Number(state.randomStreams?.council || 0),
            combatCounter: Number(state.randomStreams?.combat || 0),
            simulationCounter: Number(state.randomStreams?.simulation || 0),
            docket: c.docket.map(row => ({
                id: row.id, billId: row.billId, stage: row.stage, support: row.support,
                threshold: row.threshold, canLobby: row.canLobby, canVote: row.canVote
            })),
            history: c.history.map(row => ({
                id: row.id, billId: row.billId, stage: row.stage, roll: row.roll,
                margin: row.margin, summary: row.summary
            })),
            totals: { ...c.totals },
            governmentHistory: JSON.parse(JSON.stringify(state.government.history.filter(row => row.kind === "council-law")))
        };
    });
}

async function setYear(year) {
    await page.evaluate(async value => {
        const { state } = await import("./js/core/state.js");
        state.year = value;
    }, year);
    await page.waitForFunction(value => document.querySelector("#year")?.textContent.includes("YEAR " + value), year, { timeout: 15000 }).catch(() => {});
}

let proof = {};
try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Council Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 10000 });

    const hud = await page.evaluate(() => ({
        season: document.querySelector("#season")?.textContent.trim() || "",
        year: document.querySelector("#year")?.textContent.trim() || "",
        gold: document.querySelector("#res-gold")?.textContent.trim() || "",
        food: document.querySelector("#res-food")?.textContent.trim() || "",
        tick: document.querySelector("#tick-count")?.textContent.trim() || ""
    }));
    assert.ok(hud.year.includes("YEAR 1") && hud.gold && hud.food && hud.tick, "the live HUD must show a started realm");

    await openPanel("government");
    const initialText = await page.locator("#command-panel-content").innerText();
    assert.match(initialText, /COUNCIL DOCKET · 0 \/ 3 BILLS · 3 SEATS/);
    assert.match(initialText, /A bill is proposed once a year/);
    assert.equal(await page.locator('[data-command="council-propose"]').count(), 4);
    const before = await councilState();
    assert.equal(before.docket.length, 0);

    await page.locator('[data-command="council-propose"][data-value="bread-ordinance"]').click();
    await page.waitForFunction(() => /COUNCIL BILL PROPOSED · BREAD ORDINANCE/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const proposed = await councilState();
    assert.equal(proposed.docket.length, 1);
    assert.equal(proposed.docket[0].billId, "bread-ordinance");
    assert.equal(proposed.docket[0].stage, "proposed");
    assert.equal(proposed.gold, before.gold, "proposal itself must not spend stores");
    const billId = proposed.docket[0].id;
    await page.screenshot({ path: artifact("council-proposed.png"), fullPage: false });

    await page.locator('[data-command="council-lobby"][data-value="' + billId + '"]').click();
    await page.waitForFunction(() => /COUNCIL LOBBY PAID · BREAD ORDINANCE/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const lobbied = await councilState();
    assert.equal(lobbied.docket[0].stage, "lobbied");
    assert.equal(lobbied.gold, proposed.gold - 12);
    assert.equal(lobbied.food, proposed.food - 8);
    assert.ok(lobbied.docket[0].support > proposed.docket[0].support);
    await page.screenshot({ path: artifact("council-lobbied.png"), fullPage: false });

    assert.equal((await councilState()).docket[0].canVote, false, "the vote must wait for the next year");
    await setYear(2);
    await openPanel("government");
    await page.waitForFunction(id => {
        const button = document.querySelector('[data-command="council-vote"][data-value="' + id + '"]');
        return Boolean(button && !button.disabled);
    }, billId, { timeout: 15000 });
    await page.screenshot({ path: artifact("council-ready.png"), fullPage: false });

    await page.locator('[data-command="council-vote"][data-value="' + billId + '"]').click();
    await page.waitForFunction(() => /COUNCIL ENACTED · BREAD ORDINANCE/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const voted = await councilState();
    assert.equal(voted.docket.length, 0);
    assert.equal(voted.history.length, 1);
    assert.equal(voted.history[0].billId, "bread-ordinance");
    assert.equal(voted.history[0].stage, "enacted");
    assert.equal(voted.history[0].margin >= 0, true);
    assert.ok(voted.history[0].roll >= 0 && voted.history[0].roll < 1);
    assert.equal(voted.governmentHistory.length, 1);
    assert.equal(voted.governmentHistory[0].result, "enacted");
    assert.equal(voted.totals.enacted, 1);
    assert.equal(voted.councilCounter, 1);
    assert.equal(voted.combatCounter, before.combatCounter, "the council stream must not advance combat");
    assert.equal(voted.simulationCounter, before.simulationCounter, "the council stream must not advance simulation");
    await page.screenshot({ path: artifact("council-enacted.png"), fullPage: false });

    await setYear(3);
    await openPanel("government");
    await page.locator('[data-command="council-propose"][data-value="temple-relief"]').click();
    await page.waitForFunction(() => /COUNCIL BILL PROPOSED · TEMPLE RELIEF/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const annualBill = (await councilState()).docket[0];
    await page.locator('[data-command="council-lobby"][data-value="' + annualBill.id + '"]').click();
    await page.waitForFunction(() => /COUNCIL LOBBY PAID · TEMPLE RELIEF/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    await setYear(4);
    await page.evaluate(async () => {
        const { updateCouncilDocket } = await import("./js/systems/council-laws.js");
        updateCouncilDocket();
    });
    await page.waitForFunction(() => {
        const text = document.querySelector("#command-panel-content")?.textContent || "";
        return /COUNCIL RECORD · LAST 2/.test(text);
    }, null, { timeout: 15000 }).catch(() => {});
    await openPanel("government");
    const annual = await councilState();
    assert.equal(annual.docket.length, 0, "the annual session must clear lobbied bills");
    assert.equal(annual.history.length, 2);
    assert.equal(annual.totals.votes, 2);
    assert.equal(annual.councilCounter, 2);
    assert.equal(annual.combatCounter, before.combatCounter);

    const roundtrip = await page.evaluate(async () => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        const beforeCouncil = JSON.parse(JSON.stringify(state.government.council));
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        return { beforeCouncil, afterCouncil: JSON.parse(JSON.stringify(state.government.council)) };
    });
    assert.deepEqual(roundtrip.afterCouncil, roundtrip.beforeCouncil, "the nested council DTO must survive a save/load");
    assert.equal(roundtrip.afterCouncil.history.length, 2);

    assert.deepEqual(pageErrors, [], "the council proof must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the council proof must not raise console errors");
    console.log(JSON.stringify({
        ok: true, hud, before, proposed, lobbied, voted, annual,
        initialPreview: initialText.replace(/\s+/g, " ").trim().slice(0, 180),
        roundtrip, pageErrors, consoleErrors
    }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
