// Player-seat proof for the Whisper Court. A fresh realm starts with no
// agents. The player recruits a resident and assigns a foreign desk through the
// panel, the annual audit builds real insight, and the same reading survives a
// real save/reload with no page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const liveBaseUrl = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const port = Number(process.env.E2E_PORT) || 4184;
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
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").length > 40, null, { timeout: 15000 });
}

async function closePanel() {
    if (await page.locator("#command-close").count()) {
        const visible = await page.locator("#command-close").isVisible().catch(() => false);
        if (visible) await page.locator("#command-close").click();
    }
}

async function scrollSpySection(titleText) {
    await page.evaluate(text => {
        const title = [...document.querySelectorAll("#command-panel-content .command-section-title")]
            .find(element => (element.textContent || "").includes(text));
        title?.scrollIntoView({ block: "center" });
    }, titleText);
    await page.waitForTimeout(150);
}

try {
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Whisper Court Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    await openPanel("espionage");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("THE WHISPER COURT"), null, { timeout: 15000 });
    const fresh = await page.evaluate(async () => {
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return {
            agents: snapshot.agentCount,
            capacity: snapshot.capacity,
            suspicion: snapshot.suspicion,
            foreignInsight: snapshot.foreignInsight,
            candidates: snapshot.candidates.length,
            realms: snapshot.realms.length,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(fresh.agents, 0, "a fresh realm must not invent agents");
    assert.equal(fresh.suspicion, 0);
    assert.equal(fresh.foreignInsight, 0);
    assert.match(fresh.text, /THE WHISPER COURT/);
    assert.match(fresh.text, /AGENTS/);
    assert.match(fresh.text, /0 \/ 6/);
    assert.match(fresh.text, /No agents serve yet/);
    assert.match(fresh.text, /No reports yet/);
    assert.match(fresh.text, /RECRUIT AGENT/);
    await scrollSpySection("AGENT ROSTER");
    await page.screenshot({ path: "artifacts/whisper-court-fresh.png", fullPage: false });

    // Recruit through the real panel control, using the first living candidate.
    assert.ok(fresh.candidates > 0, "a started realm must offer adult recruits");
    const goldBefore = await page.evaluate(async () => Number((await import("./js/core/state.js")).state.resources.gold));
    const candidateValue = await page.locator("#spy-recruit-select option").nth(1).getAttribute("value");
    assert.ok(candidateValue, "the recruit select must carry a real resident id");
    await page.locator("#spy-recruit-select").selectOption(candidateValue);
    await page.locator('[data-command="spy-recruit"]').click();
    await page.waitForFunction(async () => (await import("./js/systems/espionage.js")).getEspionageSnapshot().agentCount === 1, null, { timeout: 10000 });
    const recruited = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return { agent: snapshot.agents[0], gold: Number(state.resources.gold) };
    });
    assert.equal(recruited.agent.personId, candidateValue);
    assert.ok(recruited.gold < goldBefore, "recruiting must spend gold");

    // Assign the foreign desk through the panel's own selects.
    await closePanel();
    await openPanel("espionage");
    const agentId = recruited.agent.id;
    const firstRealm = await page.evaluate(async () => {
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return snapshot.realms[0] || null;
    });
    assert.ok(firstRealm, "a started realm must have a foreign court to watch");
    await page.locator("#spy-desk-" + agentId).selectOption("foreign");
    await page.locator("#spy-target-" + agentId).selectOption(firstRealm.id);
    await page.locator('[data-command="spy-assign"][data-value="' + agentId + '"]').click();
    await page.waitForFunction(async ([id, target]) => {
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const agent = getEspionageSnapshot().agents.find(entry => entry.id === id);
        return agent?.desk === "foreign" && agent?.targetId === target;
    }, [agentId, firstRealm.id], { timeout: 10000 });

    // Advance annual audits until the foreign desk produces real insight. The
    // proof funds the treasury so wages never mask the mission result, and it
    // replaces a captured agent through the same public actions a player uses.
    const grown = await page.evaluate(async targetId => {
        const { state } = await import("./js/core/state.js");
        const { assignAgent, getEspionageSnapshot, recruitAgent, updateEspionage } = await import("./js/systems/espionage.js");
        state.resources.gold = Math.max(300, Number(state.resources.gold) || 0);
        let recoveries = 0;
        for (let index = 0; index < 20; index++) {
            state.year = Number(state.year) + 1;
            state.tick = Number(state.tick) + 1;
            updateEspionage();
            let snapshot = getEspionageSnapshot();
            if (snapshot.agentCount === 0 && snapshot.candidates.length) {
                const replacement = recruitAgent(snapshot.candidates[0].personId);
                if (replacement.ok) {
                    assignAgent(replacement.agent.id, "foreign", targetId);
                    recoveries += 1;
                }
            }
            if (getEspionageSnapshot().foreignInsight > 0) break;
        }
        const snapshot = getEspionageSnapshot();
        return {
            foreignInsight: snapshot.foreignInsight,
            suspicion: snapshot.suspicion,
            reports: snapshot.reports.length,
            agents: snapshot.agentCount,
            recoveries,
            raidReduction: snapshot.effects.raidReductionPercent,
            raidFactor: snapshot.effects.raidDamageFactor,
            lastUpdateYear: snapshot.lastUpdateYear,
            audit: snapshot.lastAudit
        };
    }, firstRealm.id);
    assert.ok(grown.foreignInsight > 0, "the annual audit must turn a foreign mission into insight");
    assert.ok(grown.suspicion > 0, "field missions must raise suspicion");
    assert.ok(grown.reports > 0, "the court must record at least one report");
    assert.ok(grown.raidReduction > 0, "foreign insight must lower raid damage");
    assert.ok(grown.raidFactor < 1);

    await closePanel();
    await openPanel("espionage");
    const grownText = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(grownText, new RegExp("FOREIGN INSIGHT"));
    assert.match(grownText, /RAID WARNING/);
    assert.match(grownText, /LATEST REPORTS/);
    assert.match(grownText, /Loyalty/);
    assert.match(grownText, /AGENT ROSTER · 1 \/ 6/);
    assert.doesNotMatch(grownText, /−0% RAID DAMAGE/);
    await scrollSpySection("AGENT ROSTER");
    await page.screenshot({ path: "artifacts/whisper-court-grown.png", fullPage: false });

    // Stage a turned agent and clear it through the panel's screening action.
    const beforeScreen = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.resources.gold = Math.max(300, Number(state.resources.gold) || 0);
        state.espionage.agents[0].turned = true;
        state.espionage.agents[0].cover = 15;
        state.espionage.rivalPressure = 60;
        state.espionage.screenedYear = 0;
        return { gold: Number(state.resources.gold) };
    });
    await closePanel();
    await openPanel("espionage");
    await page.waitForFunction(() => {
        const button = document.querySelector('[data-command="spy-screen"]');
        return Boolean(button && !button.disabled);
    }, null, { timeout: 10000 });
    await page.locator('[data-command="spy-screen"]').click();
    await page.waitForFunction(async () => {
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        return getEspionageSnapshot().lastScreen?.revealed === 1;
    }, null, { timeout: 10000 });
    const screened = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return {
            revealed: snapshot.lastScreen.revealed,
            clean: snapshot.lastScreen.clean,
            gold: Number(state.resources.gold),
            turned: state.espionage.agents[0].turned,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(screened.revealed, 1, "screening must unmask the turned agent");
    assert.equal(screened.clean, false);
    assert.equal(screened.turned, false, "screening must turn the agent back");
    assert.equal(screened.gold, beforeScreen.gold - 18, "screening must cost 18 gold");
    assert.match(screened.text, /unmasked 1 turned agent/);

    // Save and reload the realm through the normal player controls.
    const beforeSave = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return {
            agents: snapshot.agentCount,
            agent: snapshot.agents[0],
            foreignInsight: snapshot.foreignInsight,
            suspicion: snapshot.suspicion,
            reports: snapshot.reports.length,
            audit: snapshot.lastAudit,
            gold: Number(state.resources.gold)
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

    await openPanel("espionage");
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").includes("THE WHISPER COURT"), null, { timeout: 15000 });
    const restored = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return {
            agents: snapshot.agentCount,
            agent: snapshot.agents[0],
            foreignInsight: snapshot.foreignInsight,
            suspicion: snapshot.suspicion,
            reports: snapshot.reports.length,
            audit: snapshot.lastAudit,
            gold: Number(state.resources.gold),
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.deepEqual(restored.agent, beforeSave.agent, "the agent record must survive reload");
    assert.equal(restored.agents, beforeSave.agents);
    assert.equal(restored.foreignInsight, beforeSave.foreignInsight);
    assert.equal(restored.suspicion, beforeSave.suspicion);
    assert.equal(restored.reports, beforeSave.reports);
    assert.deepEqual(restored.audit, beforeSave.audit, "the annual audit must survive reload");
    assert.equal(restored.gold, beforeSave.gold);
    assert.match(restored.text, /AGENT ROSTER · 1 \/ 6/);
    assert.match(restored.text, /RAID WARNING/);
    await scrollSpySection("AGENT ROSTER");
    await page.screenshot({ path: "artifacts/whisper-court-restored.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true, seed: 20261126,
        fresh: { agents: fresh.agents, capacity: fresh.capacity, candidates: fresh.candidates, realms: fresh.realms },
        recruited: { name: recruited.agent.name, guile: recruited.agent.guile, goldSpent: goldBefore - recruited.gold },
        assigned: { desk: "foreign", target: firstRealm.name },
        grown,
        screened: { revealed: screened.revealed, clean: screened.clean, cost: beforeScreen.gold - screened.gold },
        restored: {
            agents: restored.agents, foreignInsight: restored.foreignInsight,
            suspicion: restored.suspicion, reports: restored.reports
        },
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
