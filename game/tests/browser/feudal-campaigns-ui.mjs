// Real-browser proof for the 3.74.0 feudal campaign loop. Found a realm, paused
// it, opened a BORDER WATCH aim on a real neighbouring kingdom in Military,
// committed the contract, verified the same theatre in World Map and the signed
// contract in Nobility, advanced the bounded progress entries, settled through
// the visible Military button, then save/loaded the nested DTOs. No page or
// console errors are tolerated.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4281;
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

async function campaignState() {
    return page.evaluate(async () => {
        const [{ state }, campaigns, nobility] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/feudal-campaigns.js"),
            import("./js/systems/nobility.js")
        ]);
        return {
            gold: Math.round(Number(state.resources.gold) || 0),
            food: Math.round(Number(state.resources.food) || 0),
            tick: state.tick,
            campaigns: campaigns.getCampaignSnapshot().campaigns.map(entry => ({
                id: entry.id, aim: entry.aim, theatre: entry.theatre, theatreName: entry.theatreName,
                stage: entry.stage, progress: entry.progress, progressPercent: entry.progressPercent,
                canSettle: entry.canSettle, power: entry.power, risk: entry.risk
            })),
            history: campaigns.getCampaignSnapshot().history.map(entry => ({
                id: entry.id, stage: entry.stage, result: entry.outcome?.result || null,
                roll: entry.outcome?.roll ?? null, gold: entry.outcome?.gold ?? null,
                food: entry.outcome?.food ?? null
            })),
            counters: campaigns.getCampaignSnapshot().counters,
            contracts: campaigns.getContractSnapshot().active.map(entry => ({
                id: entry.id, campaignId: entry.campaignId, stage: entry.stage, result: entry.result
            })),
            contractHistory: campaigns.getContractSnapshot().history.map(entry => ({
                id: entry.id, stage: entry.stage, result: entry.result, summary: entry.summary
            })),
            nobleHouseCount: nobility.getNobilitySnapshot().houseCount
        };
    });
}

let proof = {};
try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Campaign Proof");
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

    await openPanel("military");
    const militaryText = await page.locator("#command-panel-content").innerText();
    assert.match(militaryText, /FEUDAL CAMPAIGNS · 0 \/ 2 ACTIVE/);
    assert.match(militaryText, /AIM → COMMIT → SETTLE/);
    assert.equal(await page.locator('[data-command="campaign-aim"]').count(), 3);
    const theatre = await page.locator("#campaign-theatre-watch").inputValue();
    assert.ok(theatre && theatre.length > 2, "the real world map must provide a theatre");
    const beforeAim = await campaignState();
    await page.locator('[data-command="campaign-aim"][data-value="watch"]').click();
    await page.waitForFunction(() => /WAR AIM OPENED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const aimed = await campaignState();
    assert.equal(aimed.campaigns.length, 1);
    assert.equal(aimed.campaigns[0].aim, "watch");
    assert.equal(aimed.campaigns[0].theatre, theatre);
    assert.equal(aimed.campaigns[0].stage, "aim");
    assert.equal(aimed.gold, beforeAim.gold, "opening an aim must not spend gold");
    const campaignId = aimed.campaigns[0].id;
    await page.screenshot({ path: artifact("feudal-campaign-aim.png"), fullPage: false });

    await page.locator('[data-command="campaign-commit"][data-value="' + campaignId + '"]').click();
    await page.waitForFunction(() => /FEUDAL CONTRACT SIGNED · WATCH COVENANT/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const committed = await campaignState();
    assert.equal(committed.campaigns[0].stage, "committed");
    assert.equal(committed.gold, aimed.gold - 8, "the watch covenant must spend eight real gold");
    assert.equal(committed.contracts.length, 1);
    assert.equal(committed.contracts[0].campaignId, campaignId);
    assert.ok(committed.campaigns[0].power >= 0);
    await page.screenshot({ path: artifact("feudal-campaign-commit.png"), fullPage: false });

    await openPanel("worldmap");
    const worldText = await page.locator("#command-panel-content").innerText();
    assert.match(worldText, /THEATRE CAMPAIGNS · 1 \/ 2 ACTIVE/);
    const worldCard = page.locator('[data-world-campaign="' + campaignId + '"]');
    assert.equal(await worldCard.count(), 1);
    assert.match(await worldCard.innerText(), /COMMITTED · BORDER WATCH/);
    await page.screenshot({ path: artifact("feudal-campaign-theatre.png"), fullPage: false });

    await openPanel("nobility");
    await page.waitForFunction(() => /FEUDAL CONTRACTS/.test(document.querySelector("#command-panel-content")?.textContent || ""), null, { timeout: 15000 });
    const nobilityText = await page.locator("#command-panel-content").innerText();
    assert.match(nobilityText, /FEUDAL CONTRACTS · 1 SIGNED \/ 0 SETTLED/);
    const contractCard = page.locator('[data-feudal-contract="' + committed.contracts[0].id + '"]');
    await contractCard.waitFor({ state: "attached", timeout: 10000 });
    const contractText = await contractCard.textContent();
    assert.match(contractText, /WATCH/);
    assert.match(contractText, new RegExp(theatre));

    await page.evaluate(async () => {
        const { updateCampaignProgress } = await import("./js/systems/feudal-campaigns.js");
        for (let tick = 0; tick < 160; tick += 1) updateCampaignProgress();
    });
    await openPanel("military");
    await page.waitForFunction(id => {
        const card = document.querySelector('[data-campaign-id="' + id + '"]');
        return Boolean(card && card.querySelector('[data-command="campaign-settle"]:not([disabled])'));
    }, campaignId, { timeout: 15000 });
    const ready = await campaignState();
    assert.equal(ready.campaigns[0].progressPercent, 100);
    assert.equal(ready.campaigns[0].canSettle, true);
    await page.screenshot({ path: artifact("feudal-campaign-ready.png"), fullPage: false });

    await page.locator('[data-command="campaign-settle"][data-value="' + campaignId + '"]').click();
    await page.waitForFunction(() => /CAMPAIGN SETTLED · 1 WAR BAND/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const settled = await campaignState();
    assert.equal(settled.campaigns.length, 0);
    assert.equal(settled.history.length, 1);
    assert.ok(settled.history[0].result === "victory" || settled.history[0].result === "setback");
    assert.ok(Number.isFinite(settled.history[0].roll));
    assert.equal(settled.contracts.length, 0);
    assert.equal(settled.contractHistory.length, 1);
    assert.equal(settled.contractHistory[0].stage, "settled");
    assert.equal(settled.counters.settlements, 1);
    await page.screenshot({ path: artifact("feudal-campaign-settled.png"), fullPage: false });

    await openPanel("nobility");
    await page.waitForFunction(() => /FEUDAL CONTRACTS · 1 SIGNED \/ 1 SETTLED/.test(document.querySelector("#command-panel-content")?.textContent || ""), null, { timeout: 15000 });
    const settledNobilityText = await page.locator("#command-panel-content").innerText();
    assert.match(settledNobilityText, /FEUDAL CONTRACTS · 1 SIGNED \/ 1 SETTLED/);

    const roundtrip = await page.evaluate(async () => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        const before = {
            campaigns: JSON.parse(JSON.stringify(state.military.campaigns)),
            contracts: JSON.parse(JSON.stringify(state.nobility.contracts))
        };
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        return {
            before,
            after: {
                campaigns: JSON.parse(JSON.stringify(state.military.campaigns)),
                contracts: JSON.parse(JSON.stringify(state.nobility.contracts))
            }
        };
    });
    assert.deepEqual(roundtrip.after, roundtrip.before, "the nested campaign and contract DTOs must survive a save/load");

    assert.deepEqual(pageErrors, [], "the campaign proof must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the campaign proof must not raise console errors");
    console.log(JSON.stringify({
        ok: true, hud, theatre, beforeAim, aimed, committed, campaignId,
        worldPreview: worldText.replace(/\s+/g, " ").trim().slice(0, 160),
        ready, settled, settledNobilityPreview: settledNobilityText.replace(/\s+/g, " ").trim().slice(0, 160),
        roundtrip, pageErrors, consoleErrors
    }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
