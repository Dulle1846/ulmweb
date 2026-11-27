// Real browser check for the Explore tab and the full management deck. It
// founds a realm through the visible controls, verifies every deck button
// against the exported MANAGEMENT_TABS contract at both required viewports,
// equips a named leader, charters a real expedition, waits for its return and
// verifies the report, archive and save state in the rendered game.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED = Number(process.env.EXPEDITION_SEED || 20261114);
const OUT = resolve(process.cwd(), "docs", "expeditions-reference");
const EVIDENCE = resolve(process.cwd(), "..", "artifacts", "expeditions-audit");
await mkdir(OUT, { recursive: true });
await mkdir(EVIDENCE, { recursive: true });

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", ...(process.env.E2E_SOFTWARE_GL === "1" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"] : [])]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

const runFor = ms => page.clock.runFor(ms);
const hasStarted = () => page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted);
async function quietScene(pause = true) {
    // A live event notice must not obscure the reference frame. Clear the
    // presentation queue and pause through the real control, then let the
    // scheduled frame repaint the stable scene.
    await page.evaluate(async pause => {
        const [{ state }, notifications] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/event-notifications.js")
        ]);
        notifications.clearTimelineNotifications();
        document.querySelector("#action-toast")?.classList.add("hidden");
        if (pause && !state.isPaused) document.querySelector("#pause-btn")?.click();
        if (document.querySelector("#big-message-close")) document.querySelector("#big-message-close").click?.();
    }, pause);
    await runFor(80);
    await page.evaluate(async () => (await import("./js/presentation/event-notifications.js")).clearTimelineNotifications());
}
async function resumeScene() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (state.isPaused) document.querySelector("#pause-btn")?.click();
    });
    await runFor(120);
}

async function auditDeck(label) {
    const expected = await page.evaluate(async () => {
        const { MANAGEMENT_TABS } = await import("./js/presentation/management-tabs.js");
        return MANAGEMENT_TABS;
    });
    const deck = await page.evaluate(() => {
        const rect = element => element.getBoundingClientRect().toJSON();
        const modal = document.querySelector("#command-modal");
        const panel = document.querySelector("#command-modal .command-panel");
        const nav = document.querySelector("#command-modal .command-deck");
        const select = document.querySelector("#command-tab-select");
        return {
            viewport: { width: innerWidth, height: innerHeight },
            documentScrollWidth: document.documentElement.scrollWidth,
            navVisible: Boolean(nav && nav.getClientRects().length),
            modal: rect(modal),
            panel: rect(panel),
            nav: rect(nav),
            navScrollWidth: nav.scrollWidth,
            navClientWidth: nav.clientWidth,
            navScrollHeight: nav.scrollHeight,
            navClientHeight: nav.clientHeight,
            buttons: [...nav.querySelectorAll("[data-command-tab]")].map(button => ({
                id: button.dataset.commandTab,
                label: button.querySelector("span")?.textContent?.trim() || "",
                rect: rect(button),
                visible: button.getClientRects().length > 0 && getComputedStyle(button).visibility !== "hidden"
            })),
            options: [...(select?.options || [])].map(option => ({ value: option.value, label: option.textContent.trim() }))
        };
    });
    assert.equal(deck.buttons.length, expected.length, label + ": the deck must expose exactly the exported contract");
    assert.deepEqual(deck.buttons.map(button => button.id), expected.map(tab => tab.id), label + ": deck order and ids must match MANAGEMENT_TABS");
    assert.deepEqual(deck.buttons.map(button => button.label), expected.map(tab => tab.label), label + ": deck labels must match MANAGEMENT_TABS");
    assert.deepEqual(deck.options.map(option => option.value), expected.map(tab => tab.id), label + ": the narrow selector must expose every contract panel");
    assert.deepEqual(deck.options.map(option => option.label), expected.map(tab => tab.label), label + ": the narrow selector labels must match the contract");
    assert.equal(deck.navVisible, true, label + ": the deck must be visible");
    assert.ok(deck.navScrollWidth <= deck.navClientWidth + 1, label + ": the deck must not overflow horizontally: " + JSON.stringify(deck));
    assert.ok(deck.navScrollHeight <= deck.navClientHeight + 1, label + ": the deck must not overflow vertically: " + JSON.stringify(deck));
    assert.ok(deck.documentScrollWidth <= deck.viewport.width + 1, label + ": the page must not scroll horizontally: " + JSON.stringify(deck));
    assert.ok(deck.nav.left >= deck.panel.left - 1 && deck.nav.right <= deck.panel.right + 1 && deck.nav.top >= deck.panel.top - 1 && deck.nav.bottom <= deck.panel.bottom + 1,
        label + ": the deck must sit inside the management panel: " + JSON.stringify(deck));
    for (const button of deck.buttons) {
        assert.equal(button.visible, true, label + ": every tab must be rendered: " + button.id);
        assert.ok(button.rect.width > 0 && button.rect.height > 0, label + ": every tab needs a hit area: " + button.id);
        assert.ok(button.rect.left >= deck.nav.left - 1 && button.rect.right <= deck.nav.right + 1 && button.rect.top >= deck.nav.top - 1 && button.rect.bottom <= deck.nav.bottom + 1,
            label + ": every tab must remain inside the deck: " + button.id + " " + JSON.stringify(button.rect));
    }
    return { viewport: deck.viewport, tabCount: deck.buttons.length, contractCount: expected.length, nav: deck.nav };
}

try {
    await page.clock.install({ time: new Date("2026-11-14T09:00:00Z") });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await runFor(700);
    assert.equal(await page.locator("#start-screen").isVisible(), true);
    await page.locator("#world-seed-input").fill(String(SEED));
    await page.locator("#player-name-input").fill("Expedition Audit");
    await runFor(300);
    await page.locator("#start-new-game-btn").click();
    for (let attempt = 0; attempt < 40 && !(await hasStarted()); attempt++) {
        await runFor(250);
        // Let one real animation frame run so the clock-driven loading chapters
        // can paint between virtual-time steps.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
    }
    assert.equal(await hasStarted(), true, "the visible founding button must start a realm");
    await runFor(1200);
    await quietScene(false);

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="explore"]').click();
    assert.equal(await page.locator('[data-command-tab="explore"]').isVisible(), true, "the Explore tab must be visible in the command deck");
    await page.locator(".expedition-site").first().waitFor({ timeout: 15000 });
    assert.equal(await page.locator("#command-panel-content .command-panel-intro h3").innerText(), "Royal expeditions");
    assert.equal(await page.locator(".expedition-site").count(), 8, "the survey must expose eight landmark cards");
    assert.match(await page.locator("#command-panel-content").innerText(), /THE EIGHT LANDMARKS/);
    const leaderOptions = await page.locator("#expedition-leader-select option").count();
    assert.ok(leaderOptions >= 2, "the leader select must contain a named resident");
    const leaderId = await page.evaluate(() => [...document.querySelectorAll("#expedition-leader-select option")]
        .slice(1)
        .map(option => ({ value: option.value, skill: Number((option.textContent.match(/skill (\d+)/) || [])[1]) || 0 }))
        .sort((a, b) => b.skill - a.skill)[0].value);

    // The deck is part of the management surface, so prove every tab fits at
    // the tablet and desktop sizes this game supports. The same contract list
    // drives the visible grid and the narrow panel selector.
    const decks = [];
    await page.setViewportSize({ width: 820, height: 1180 });
    await runFor(250);
    decks.push(await auditDeck("820x1180"));
    const tabletExplore = await page.evaluate(() => {
        const content = document.querySelector("#command-panel-content");
        const cards = [...document.querySelectorAll(".expedition-site")].map(card => card.getBoundingClientRect().toJSON());
        const launch = [...document.querySelectorAll('[data-command="expedition-start"]')];
        return {
            content: content.getBoundingClientRect().toJSON(),
            scrollWidth: content.scrollWidth,
            clientWidth: content.clientWidth,
            cardsInsideWidth: cards.every(card => card.left >= content.getBoundingClientRect().left - 1 && card.right <= content.getBoundingClientRect().right + 1),
            launchButtons: launch.length,
            leaderVisible: Boolean(document.querySelector("#expedition-leader-select")?.getClientRects().length),
            supplyVisible: Boolean(document.querySelector("#expedition-supply-select")?.getClientRects().length)
        };
    });
    assert.ok(tabletExplore.scrollWidth <= tabletExplore.clientWidth + 1, "the Explore panel must not overflow horizontally at 820x1180: " + JSON.stringify(tabletExplore));
    assert.equal(tabletExplore.cardsInsideWidth, true, "every landmark card must fit inside the Explore panel at 820x1180: " + JSON.stringify(tabletExplore));
    assert.equal(tabletExplore.launchButtons, 8, "all eight landmarks must expose a launch control at 820x1180");
    assert.equal(tabletExplore.leaderVisible, true, "the leader control must remain visible at 820x1180");
    assert.equal(tabletExplore.supplyVisible, true, "the supply control must remain visible at 820x1180");
    await page.screenshot({ path: resolve(EVIDENCE, "expedition-deck-820x1180.png"), animations: "disabled" });

    await page.setViewportSize({ width: 1440, height: 900 });
    await runFor(250);
    decks.push(await auditDeck("1440x900"));
    await page.screenshot({ path: resolve(EVIDENCE, "expedition-deck-1440x900.png"), animations: "disabled" });

    // Backlog 25: answer a live blight decree through the rendered Explore
    // panel. This seed has no guaranteed pressure-2 blight, so the decree is
    // created with the app's own exported internals; the study answer and the
    // expedition that closes the chain are still real clicks on real controls.
    const chainSetup = await page.evaluate(async () => {
        const [{ state }, { getExpeditionSnapshot }, couplings] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/expeditions.js"),
            import("./js/systems/special-biome-couplings.js")
        ]);
        const target = [...getExpeditionSnapshot().sites]
            .sort((a, b) => a.danger - b.danger || a.distance - b.distance)[0];
        // Surveyed sites are preferred when a decree arms a follow-up. Mark
        // exactly one so the field order lands on the party we already equip.
        for (const entry of state.expeditions.sites) entry.chainStage = entry.id === target.id ? 1 : 0;
        // The card only prints field notes for a known landmark; the survey
        // already knows this site, so keep that flag explicit for determinism.
        const targetSite = state.expeditions.sites.find(entry => entry.id === target.id);
        targetSite.known = true;
        targetSite.cleared = false;
        const blight = state.specialBiomes.regions.find(region => region.family === "blighted-land")
            || state.specialBiomes.regions[0];
        blight.family = "blighted-land";
        blight.discovered = true;
        blight.cleansed = false;
        blight.spread = 4;
        couplings.invalidateSpecialBiomeInfluence();
        const decision = couplings.__internals.createBlightDecision();
        window.dispatchEvent(new Event("kac:special-biome-change"));
        return { targetId: target.id, decisionId: decision?.id || null, regionId: blight.id };
    });
    assert.ok(chainSetup.decisionId, "the seeded blight decree must exist");
    await page.locator('[data-blight-decree="' + chainSetup.decisionId + '"]').waitFor({ timeout: 15000 });
    const studyButton = page.locator('[data-blight-decree="' + chainSetup.decisionId + '"] [data-command="special-blight-choice"][data-value="study"]:not([disabled])');
    assert.equal(await studyButton.count(), 1, "the rendered decree must offer an affordable study choice");
    await studyButton.click();
    await page.waitForFunction(async siteId => {
        const { getExpeditionSnapshot } = await import("./js/systems/expeditions.js");
        const site = getExpeditionSnapshot().sites.find(entry => entry.id === siteId);
        return site?.chainStage === 2 && site.claim === "study";
    }, chainSetup.targetId, { timeout: 15000 });

    const readChainUI = siteId => page.evaluate(async id => {
        const { getExpeditionSnapshot } = await import("./js/systems/expeditions.js");
        const site = getExpeditionSnapshot().sites.find(entry => entry.id === id);
        const card = document.querySelector('[data-expedition-site="' + id + '"]');
        const badge = card?.querySelector(".expedition-site__chain");
        return {
            snapshot: {
                stage: site.chainStage, label: site.chainLabel, claim: site.claim,
                claimLabel: site.claimLabel, notes: [...site.notes],
                ready: getExpeditionSnapshot().stats.chainReady,
                closed: getExpeditionSnapshot().stats.chainClosed
            },
            card: {
                stage: card?.dataset.chainStage || "",
                claim: card?.dataset.siteClaim || "",
                hasFollowUp: Boolean(card?.classList.contains("has-follow-up")),
                badgeStage: badge?.dataset.chainStage || "",
                badgeClaim: badge?.dataset.siteClaim || "",
                badgeText: badge?.textContent?.trim() || "",
                claimLabel: badge?.querySelector("strong")?.textContent?.trim() || "",
                notes: card?.querySelector(".expedition-site__notes")?.textContent?.trim() || "",
                button: card?.querySelector('[data-command="expedition-start"]')?.textContent?.trim() || ""
            },
            summary: [...document.querySelectorAll("#command-panel-content .command-summary > div")].map(entry => ({
                label: entry.querySelector("small")?.textContent?.trim(),
                value: entry.querySelector("strong")?.textContent?.trim()
            }))
        };
    }, siteId);
    const chainReady = await readChainUI(chainSetup.targetId);
    const summaryValue = (proof, label) => proof.summary.find(entry => entry.label === label)?.value;
    assert.equal(chainReady.snapshot.stage, 2);
    assert.equal(chainReady.snapshot.label, "FOLLOW-UP READY");
    assert.equal(chainReady.snapshot.claim, "study");
    assert.ok(chainReady.snapshot.claimLabel, "the snapshot must expose the study claim label");
    assert.ok(chainReady.snapshot.notes.length >= 1, "the field order must add a site note");
    assert.equal(chainReady.snapshot.ready, 1);
    assert.equal(chainReady.snapshot.closed, 0);
    assert.equal(chainReady.card.stage, "2");
    assert.equal(chainReady.card.claim, "study");
    assert.equal(chainReady.card.badgeStage, "2");
    assert.equal(chainReady.card.badgeClaim, "study");
    assert.equal(chainReady.card.hasFollowUp, true);
    assert.match(chainReady.card.badgeText, /FOLLOW-UP · FOLLOW-UP READY/);
    assert.equal(chainReady.card.claimLabel, chainReady.snapshot.claimLabel, "the badge must render the exported claim label");
    assert.ok(chainReady.card.notes.includes(chainReady.snapshot.notes[0]), "the notes block must render the field order");
    assert.match(chainReady.card.button, /SURVEY FOLLOW-UP/);
    assert.equal(summaryValue(chainReady, "FOLLOW-UPS READY"), "1", "the summary must count the armed chain");
    assert.equal(summaryValue(chainReady, "CHAINS CLOSED"), "0");
    await page.screenshot({ path: resolve(EVIDENCE, "expedition-chain-follow-up-ready.png"), animations: "disabled" });

    // Answering the decree re-rendered the Explore panel, so equip after that
    // render instead of holding a stale select value.
    await page.locator("#expedition-leader-select").selectOption(leaderId);
    await page.locator("#expedition-supply-select").selectOption("grand");
    await quietScene();
    await page.screenshot({ path: resolve(OUT, "explore-before.png"), animations: "disabled" });
    await resumeScene();

    const firstSiteId = await page.evaluate(async () => {
        const { getExpeditionSnapshot } = await import("./js/systems/expeditions.js");
        return [...getExpeditionSnapshot().sites].sort((a, b) => a.danger - b.danger || a.distance - b.distance)[0].id;
    });
    assert.equal(firstSiteId, chainSetup.targetId, "the answered decree must arm the site this proof charters");
    await page.locator('[data-expedition-site="' + firstSiteId + '"] [data-command="expedition-start"]').click();
    await page.locator(".expedition-active[data-expedition-active]").waitFor({ timeout: 10000 });
    const active = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            tick: state.tick,
            active: state.expeditions?.active ? { ...state.expeditions.active } : null,
            leader: state.entities.find(entity => String(entity.personId || entity.id) === state.expeditions?.active?.leaderId)
        };
    });
    assert.ok(active.active, "the click must create one active expedition in the simulation");
    assert.equal(active.active.siteId, firstSiteId);
    assert.equal(active.active.leaderId, leaderId);
    assert.equal(active.active.phase, "outbound");
    assert.equal(active.leader?.expeditionId, active.active.id, "the chosen resident must be linked to the active party");
    assert.equal(await page.locator(".expedition-launch:enabled").count(), 0, "no second party may leave while one is away");
    assert.match(await page.locator(".expedition-active").innerText(), /OUTBOUND/);
    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
    await quietScene();
    await page.screenshot({ path: resolve(OUT, "explore-active.png"), animations: "disabled" });
    await resumeScene();

    const waitMs = Math.max(0, active.active.returnTick - active.tick + 3) * 780;
    await runFor(waitMs);
    let returned = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { tick: state.tick, paused: state.isPaused, activeTick: state.expeditions?.active?.returnTick || 0, history: state.expeditions?.history?.length || 0 };
    });
    for (let attempt = 0; attempt < 6 && returned.history === 0; attempt++) {
        await runFor(4000);
        returned = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return { tick: state.tick, paused: state.isPaused, activeTick: state.expeditions?.active?.returnTick || 0, history: state.expeditions?.history?.length || 0 };
        });
    }
    assert.equal(returned.history > 0, true, "the simulation must resolve the expedition: " + JSON.stringify(returned));
    await page.locator(".expedition-history__row").first().waitFor({ timeout: 15000 });
    returned = await page.evaluate(async () => {
        const [{ state }, { getExpeditionSnapshot }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/expeditions.js")
        ]);
        return {
            active: Boolean(state.expeditions?.active),
            history: state.expeditions?.history?.length || 0,
            lore: state.expeditions?.lore?.length || 0,
            snapshotHistory: getExpeditionSnapshot().history.length,
            completed: getExpeditionSnapshot().stats.completed,
            tier: state.expeditions?.history?.[0]?.tier || null,
            saveHasExpeditions: Boolean((await import("./js/core/save-runtime.js")).createSaveSnapshot().expeditions)
        };
    });
    console.log("returned state", JSON.stringify(returned));
    assert.equal(returned.active, false, "the active party must be cleared after its return");
    assert.ok(returned.history >= 1, "a returned expedition must add a history report");
    assert.equal(returned.snapshotHistory, returned.history);
    assert.equal(returned.completed, 1, "the completed party must be counted once");
    assert.equal(returned.lore, ["success", "triumph"].includes(returned.tier) ? 1 : 0,
        "a first successful discovery must add exactly one lore fragment");
    assert.equal(returned.saveHasExpeditions, true, "the save snapshot must carry expedition state");
    assert.match(await page.locator(".expedition-history__row").first().innerText(), /YEAR/);
    if (returned.lore > 0) assert.match(await page.locator(".expedition-lore").first().innerText(), /YEAR/);
    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
    await quietScene();
    await page.screenshot({ path: resolve(OUT, "explore-report-top.png"), animations: "disabled" });
    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: resolve(OUT, "explore-report.png"), animations: "disabled" });

    // The claimed follow-up is closed by the successful party that just
    // returned; the same card must now show the terminal stage.
    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
    const chainClosed = await readChainUI(firstSiteId);
    assert.ok(["success", "triumph"].includes(returned.tier), "the audited follow-up must be a successful party: " + returned.tier);
    assert.equal(chainClosed.snapshot.stage, 3);
    assert.equal(chainClosed.snapshot.label, "CHAIN CLOSED");
    assert.equal(chainClosed.snapshot.claim, "study");
    assert.ok(chainClosed.snapshot.claimLabel, "the closed chain must retain its claim label");
    assert.ok(chainClosed.snapshot.notes.length > chainReady.snapshot.notes.length, "closure must append a field note");
    assert.equal(chainClosed.snapshot.ready, 0);
    assert.equal(chainClosed.snapshot.closed, 1);
    assert.equal(chainClosed.card.stage, "3");
    assert.equal(chainClosed.card.badgeStage, "3");
    assert.equal(chainClosed.card.badgeClaim, "study");
    assert.match(chainClosed.card.badgeText, /FOLLOW-UP · CHAIN CLOSED/);
    assert.equal(chainClosed.card.claimLabel, chainClosed.snapshot.claimLabel);
    assert.ok(chainClosed.card.notes.includes(chainClosed.snapshot.notes[chainClosed.snapshot.notes.length - 1]));
    assert.match(chainClosed.card.button, /SURVEY AGAIN/);
    assert.equal(summaryValue(chainClosed, "FOLLOW-UPS READY"), "0");
    assert.equal(summaryValue(chainClosed, "CHAINS CLOSED"), "1");
    await page.screenshot({ path: resolve(EVIDENCE, "expedition-chain-closed.png"), animations: "disabled" });

    const savedChain = await page.evaluate(async siteId => {
        const { createSaveSnapshot } = await import("./js/core/save-runtime.js");
        const save = createSaveSnapshot();
        const site = save.expeditions.sites.find(entry => entry.id === siteId);
        return { stage: site?.chainStage, claim: site?.claim, notes: [...(site?.notes || [])], closed: save.expeditions.sites.filter(entry => Number(entry.chainStage) === 3).length };
    }, firstSiteId);
    assert.equal(savedChain.stage, 3, "the save snapshot must carry the closed chain stage");
    assert.equal(savedChain.claim, "study");
    assert.deepEqual(savedChain.notes, chainClosed.snapshot.notes, "the save snapshot must carry the chain notes");
    assert.equal(savedChain.closed, 1);

    // Save through the visible control and prove the chain survives a real
    // reload/continue, not just an in-memory snapshot.
    await page.locator("#command-close").click();
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 20000 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Loaded realm"), null, { timeout: 20000 });
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="explore"]').click();
    await page.waitForFunction(siteId => document.querySelector('[data-expedition-site="' + siteId + '"]')?.dataset.chainStage === "3", firstSiteId, { timeout: 15000 });
    const restoredChain = await readChainUI(firstSiteId);
    assert.equal(restoredChain.snapshot.stage, 3, "the closed chain must survive reload");
    assert.equal(restoredChain.snapshot.label, "CHAIN CLOSED");
    assert.equal(restoredChain.snapshot.claim, "study");
    assert.equal(restoredChain.snapshot.claimLabel, chainClosed.snapshot.claimLabel);
    assert.deepEqual(restoredChain.snapshot.notes, chainClosed.snapshot.notes, "chain notes must survive reload");
    assert.equal(restoredChain.card.badgeStage, "3");
    assert.equal(restoredChain.card.claimLabel, chainClosed.snapshot.claimLabel);
    assert.ok(restoredChain.card.notes.includes(chainClosed.snapshot.notes[chainClosed.snapshot.notes.length - 1]));
    assert.equal(summaryValue(restoredChain, "CHAINS CLOSED"), "1");
    await page.screenshot({ path: resolve(EVIDENCE, "expedition-chain-restored.png"), animations: "disabled" });

    assert.deepEqual(pageErrors, [], "the Explore flow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the Explore flow must not raise console errors");
    console.log(JSON.stringify({ seed: SEED, siteCount: 8, leaderId, activeId: active.active.id, decks, history: returned.history, lore: returned.lore, chain: { siteId: chainSetup.targetId, claim: chainClosed.snapshot.claim, stage: restoredChain.snapshot.stage, notes: restoredChain.snapshot.notes.length }, screenshots: OUT }, null, 2));
} finally {
    await browser.close();
}
