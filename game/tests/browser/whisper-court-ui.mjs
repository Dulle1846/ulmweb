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

    // Build the full court from a fresh realm: recruit living residents, staff
    // all three desks plus three counter-intelligence posts, and run the annual
    // audit until every play is affordable. The proof funds wages so they never
    // mask a mission result, and replaces a captured agent through public actions.
    const grownAll = await page.evaluate(async realmId => {
        const { state } = await import("./js/core/state.js");
        const { assignAgent, getEspionageSnapshot, recruitAgent, updateEspionage } = await import("./js/systems/espionage.js");
        let snapshot = getEspionageSnapshot();
        const house = snapshot.houses.slice().sort((a, b) => a.loyalty - b.loyalty || b.feudSeverity - a.feudSeverity)[0];
        if (!house) throw new Error("no noble house to warn");
        state.resources.gold = Math.max(1200, Number(state.resources.gold) || 0);
        const desired = [
            { desk: "foreign", target: realmId },
            { desk: "nobles", target: house.id },
            { desk: "market", target: "" },
            { desk: "counter", target: "" },
            { desk: "counter", target: "" },
            { desk: "counter", target: "" }
        ];
        for (const order of desired.slice(1)) {
            snapshot = getEspionageSnapshot();
            const candidate = snapshot.candidates.find(entry => !snapshot.agents.some(agent => agent.personId === entry.personId));
            if (!candidate) break;
            const recruitedAgent = recruitAgent(candidate.personId);
            if (recruitedAgent.ok) assignAgent(recruitedAgent.agent.id, order.desk, order.target);
        }
        let years = 0;
        for (let index = 0; index < 40; index++) {
            state.resources.gold = Math.max(1000, Number(state.resources.gold) || 0);
            state.year = Number(state.year) + 1;
            state.tick = Number(state.tick) + 1;
            updateEspionage();
            years += 1;
            snapshot = getEspionageSnapshot();
            for (const order of desired) {
                if (snapshot.agents.some(agent => agent.desk === order.desk)) continue;
                const candidate = snapshot.candidates.find(entry => !snapshot.agents.some(agent => agent.personId === entry.personId));
                if (!candidate) continue;
                const replacement = recruitAgent(candidate.personId);
                if (replacement.ok) assignAgent(replacement.agent.id, order.desk, order.target);
            }
            snapshot = getEspionageSnapshot();
            if (snapshot.foreignInsight >= snapshot.costs.concession &&
                snapshot.nobleInsight >= snapshot.costs.warnHouse &&
                snapshot.marketInsight >= snapshot.costs.falseTrail) break;
        }
        snapshot = getEspionageSnapshot();
        return {
            years,
            agents: snapshot.agentCount,
            desks: snapshot.agents.map(agent => ({ desk: agent.desk, target: agent.targetId, loyalty: agent.loyalty, cover: agent.cover, turned: agent.turned })),
            foreignInsight: snapshot.foreignInsight,
            nobleInsight: snapshot.nobleInsight,
            marketInsight: snapshot.marketInsight,
            suspicion: snapshot.suspicion,
            rivalPressure: snapshot.rivalPressure,
            reports: snapshot.reports.length,
            raidReduction: snapshot.effects.raidReductionPercent,
            raidFactor: snapshot.effects.raidDamageFactor,
            lastAudit: snapshot.lastAudit,
            house: { id: house.id, familyName: house.familyName, loyalty: house.loyalty, feudSeverity: house.feudSeverity },
            costs: snapshot.costs,
            canWarn: snapshot.canWarn,
            canConcession: snapshot.canConcession,
            canFalseTrail: snapshot.canFalseTrail
        };
    }, firstRealm.id);
    assert.ok(grownAll.foreignInsight >= grownAll.costs.concession, "the foreign desk must build enough insight: " + JSON.stringify(grownAll));
    assert.ok(grownAll.nobleInsight >= grownAll.costs.warnHouse, "the noble desk must build enough insight: " + JSON.stringify(grownAll));
    assert.ok(grownAll.marketInsight >= grownAll.costs.falseTrail, "the market desk must build enough insight: " + JSON.stringify(grownAll));
    assert.equal(grownAll.agents, 6, "all six posts must be staffed");
    assert.ok(grownAll.reports > 0, "the court must record reports");
    assert.ok(grownAll.raidReduction > 0, "foreign insight must lower raid damage");
    assert.ok(grownAll.raidFactor < 1);
    assert.equal(grownAll.canWarn, true);
    assert.equal(grownAll.canConcession, true);
    assert.equal(grownAll.canFalseTrail, true);

    // Stage a live feud and rival pressure so the warning and false trail have
    // something real to move in this deterministic proof.
    const stagedThreat = await page.evaluate(async houseId => {
        const { state } = await import("./js/core/state.js");
        const other = state.nobility.houses.find(house => house.id !== houseId);
        if (!other) throw new Error("no second house for a feud");
        state.espionage.rivalPressure = 55;
        state.nobility.feuds = [{
            id: "browser-proof-feud", houses: [houseId, other.id], status: "active", severity: 2, history: []
        }];
        return { other: other.familyName, pressure: 55, severity: 2 };
    }, grownAll.house.id);
    assert.equal(stagedThreat.severity, 2);

    await closePanel();
    await openPanel("espionage");
    const grownText = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(grownText, new RegExp("FOREIGN INSIGHT"));
    assert.match(grownText, /RAID WARNING/);
    assert.match(grownText, /LATEST REPORTS/);
    assert.match(grownText, /Loyalty/);
    assert.match(grownText, /AGENT ROSTER · 6 \/ 6/);
    assert.match(grownText, /ACTIONABLE INTELLIGENCE/);
    assert.match(grownText, /WARN A THREATENED HOUSE/);
    assert.match(grownText, /DEMAND A CONCESSION/);
    assert.match(grownText, /PLANT A FALSE TRAIL/);
    assert.doesNotMatch(grownText, /−0% RAID DAMAGE/);
    await scrollSpySection("AGENT ROSTER");
    await page.screenshot({ path: "artifacts/whisper-court-grown.png", fullPage: false });

    // Execute all three intelligence plays through the panel's own controls.
    const beforePlay = await page.evaluate(async houseId => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        const house = state.nobility.houses.find(entry => entry.id === houseId);
        const realm = state.diplomacy.realms[0];
        const partner = state.market.partners.find(entry => entry.id === realm.id);
        return {
            gold: Number(state.resources.gold), food: Number(state.resources.food),
            houseLoyalty: Number(house.loyalty), houseFeud: snapshot.houses.find(entry => entry.id === houseId)?.feudSeverity || 0,
            relation: Number(realm.relation), fear: Number(realm.fear),
            partnerGold: Number(partner.treasury), partnerFood: Number(partner.stock.food),
            pressure: snapshot.rivalPressure, suspicion: snapshot.suspicion,
            foreignInsight: snapshot.foreignInsight, nobleInsight: snapshot.nobleInsight, marketInsight: snapshot.marketInsight
        };
    }, grownAll.house.id);

    await scrollSpySection("ACTIONABLE INTELLIGENCE");
    await page.locator("#spy-warn-house").selectOption(grownAll.house.id);
    await page.locator('[data-command="spy-warn"]').click();
    await page.waitForFunction(async () => Boolean((await import("./js/systems/espionage.js")).getEspionageSnapshot().lastPlays.warnHouse), null, { timeout: 10000 });
    const warned = await page.evaluate(async houseId => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        const house = state.nobility.houses.find(entry => entry.id === houseId);
        return {
            play: snapshot.lastPlays.warnHouse, nobleInsight: snapshot.nobleInsight,
            loyalty: Number(house.loyalty), feud: snapshot.houses.find(entry => entry.id === houseId)?.feudSeverity || 0,
            canWarn: snapshot.canWarn, text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    }, grownAll.house.id);
    assert.equal(warned.play.targetId, grownAll.house.id);
    assert.equal(warned.nobleInsight, beforePlay.nobleInsight - grownAll.costs.warnHouse, "a warning must spend its noble insight cost");
    assert.equal(warned.loyalty, Math.min(100, beforePlay.houseLoyalty + 6), "a warning must raise house loyalty");
    assert.equal(warned.feud, Math.max(0, beforePlay.houseFeud - 1), "a warning must ease the house's worst feud");
    assert.match(warned.play.detail, /feud severity/);
    assert.equal(warned.canWarn, false, "a warning is once per year");
    assert.match(warned.text, /Last: year/);

    const concessionRealm = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return state.diplomacy.realms[0].id;
    });
    await page.locator("#spy-concession-realm").selectOption(concessionRealm);
    await page.locator('[data-command="spy-concession"]').click();
    await page.waitForFunction(async () => Boolean((await import("./js/systems/espionage.js")).getEspionageSnapshot().lastPlays.concession), null, { timeout: 10000 });
    const conceded = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        const realm = state.diplomacy.realms[0];
        const partner = state.market.partners.find(entry => entry.id === realm.id);
        return {
            play: snapshot.lastPlays.concession, gold: Number(state.resources.gold), food: Number(state.resources.food),
            relation: Number(realm.relation), fear: Number(realm.fear),
            partnerGold: Number(partner.treasury), partnerFood: Number(partner.stock.food),
            foreignInsight: snapshot.foreignInsight, canConcession: snapshot.canConcession
        };
    });
    assert.ok(conceded.play.gold > 0 && conceded.play.food > 0, "a concession must yield real goods");
    assert.equal(conceded.gold, beforePlay.gold + conceded.play.gold, "gold must move into the treasury");
    assert.equal(conceded.food, beforePlay.food + conceded.play.food, "food must move into the stores");
    assert.equal(conceded.partnerGold, beforePlay.partnerGold - conceded.play.gold, "gold must leave the partner treasury");
    assert.equal(conceded.partnerFood, beforePlay.partnerFood - conceded.play.food, "food must leave the partner stock");
    assert.equal(conceded.relation, beforePlay.relation - 4, "a demand must cost relation");
    assert.equal(conceded.fear, beforePlay.fear + 3, "a demand must raise fear");
    assert.equal(conceded.foreignInsight, beforePlay.foreignInsight - grownAll.costs.concession, "a concession must spend its foreign insight cost");
    assert.equal(conceded.canConcession, false, "a concession is once per year");

    await page.locator('[data-command="spy-false-trail"]').click();
    await page.waitForFunction(async () => Boolean((await import("./js/systems/espionage.js")).getEspionageSnapshot().lastPlays.falseTrail), null, { timeout: 10000 });
    const trailed = await page.evaluate(async () => {
        const { getEspionageSnapshot } = await import("./js/systems/espionage.js");
        const snapshot = getEspionageSnapshot();
        return {
            play: snapshot.lastPlays.falseTrail, pressure: snapshot.rivalPressure, suspicion: snapshot.suspicion,
            marketInsight: snapshot.marketInsight, missionBonus: snapshot.missionBonus,
            missionBonusActive: snapshot.missionBonusActive, canFalseTrail: snapshot.canFalseTrail,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    });
    assert.equal(trailed.play.ok ?? true, true);
    assert.equal(trailed.pressure, Math.max(0, beforePlay.pressure - 18), "a false trail must cut rival pressure by 18");
    assert.equal(trailed.suspicion, Math.max(0, beforePlay.suspicion - 4), "a false trail must reduce suspicion");
    assert.equal(trailed.marketInsight, beforePlay.marketInsight - grownAll.costs.falseTrail, "a false trail must spend its market insight cost");
    assert.equal(trailed.missionBonus, 0.08, "a false trail must grant next year's mission bonus");
    assert.equal(trailed.missionBonusActive, true);
    assert.equal(trailed.canFalseTrail, false, "a false trail is once per year");
    assert.match(trailed.text, /NEXT AUDIT\s*\+8% MISSION ODDS/);
    assert.match(trailed.text, /Last: year/);

    const cooldowns = await page.evaluate(() => ({
        warn: document.querySelector('[data-command="spy-warn"]')?.disabled,
        concession: document.querySelector('[data-command="spy-concession"]')?.disabled,
        trail: document.querySelector('[data-command="spy-false-trail"]')?.disabled
    }));
    assert.deepEqual(cooldowns, { warn: true, concession: true, trail: true }, "all three plays must lock for the rest of the year");
    await scrollSpySection("ACTIONABLE INTELLIGENCE");
    await page.screenshot({ path: "artifacts/whisper-court-plays.png", fullPage: false });

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
    const beforeSave = await page.evaluate(async houseId => {
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
            food: Number(state.resources.food),
            plays: snapshot.plays,
            lastPlays: snapshot.lastPlays,
            missionBonus: snapshot.missionBonus,
            missionBonusYear: snapshot.missionBonusYear,
            houseLoyalty: snapshot.houses.find(entry => entry.id === houseId)?.loyalty,
            relation: snapshot.realms[0]?.relation,
            fear: snapshot.realms[0]?.fear,
            pressure: snapshot.rivalPressure,
            suspicion: snapshot.suspicion
        };
    }, grownAll.house.id);
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
    const restored = await page.evaluate(async houseId => {
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
            food: Number(state.resources.food),
            plays: snapshot.plays,
            lastPlays: snapshot.lastPlays,
            missionBonus: snapshot.missionBonus,
            missionBonusYear: snapshot.missionBonusYear,
            houseLoyalty: snapshot.houses.find(entry => entry.id === houseId)?.loyalty,
            relation: snapshot.realms[0]?.relation,
            fear: snapshot.realms[0]?.fear,
            pressure: snapshot.rivalPressure,
            suspicion: snapshot.suspicion,
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    }, grownAll.house.id);
    assert.deepEqual(restored.agent, beforeSave.agent, "the agent record must survive reload");
    assert.equal(restored.agents, beforeSave.agents);
    assert.equal(restored.foreignInsight, beforeSave.foreignInsight);
    assert.equal(restored.suspicion, beforeSave.suspicion);
    assert.equal(restored.reports, beforeSave.reports);
    assert.deepEqual(restored.audit, beforeSave.audit, "the annual audit must survive reload");
    assert.equal(restored.gold, beforeSave.gold);
    assert.equal(restored.food, beforeSave.food);
    assert.deepEqual(restored.plays, beforeSave.plays, "play cooldowns must survive reload");
    assert.deepEqual(restored.lastPlays, beforeSave.lastPlays, "last play results must survive reload");
    assert.equal(restored.missionBonus, beforeSave.missionBonus);
    assert.equal(restored.missionBonusYear, beforeSave.missionBonusYear);
    assert.equal(restored.houseLoyalty, beforeSave.houseLoyalty);
    assert.equal(restored.relation, beforeSave.relation);
    assert.equal(restored.fear, beforeSave.fear);
    assert.equal(restored.pressure, beforeSave.pressure);
    assert.equal(restored.suspicion, beforeSave.suspicion);
    assert.match(restored.text, /AGENT ROSTER · 6 \/ 6/);
    assert.match(restored.text, /RAID WARNING/);
    assert.match(restored.text, /ACTIONABLE INTELLIGENCE/);
    assert.match(restored.text, /NEXT AUDIT\s*\+8% MISSION ODDS/);
    await scrollSpySection("AGENT ROSTER");
    await page.screenshot({ path: "artifacts/whisper-court-restored.png", fullPage: false });

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true, seed: 20261126,
        fresh: { agents: fresh.agents, capacity: fresh.capacity, candidates: fresh.candidates, realms: fresh.realms },
        recruited: { name: recruited.agent.name, guile: recruited.agent.guile, goldSpent: goldBefore - recruited.gold },
        assigned: { desk: "foreign", target: firstRealm.name },
        grown: grownAll,
        stagedThreat,
        plays: {
            warned: warned.play,
            concession: conceded.play,
            trail: trailed.play,
            cooldowns
        },
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
