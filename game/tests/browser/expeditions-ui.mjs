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
    for (let attempt = 0; attempt < 40 && !(await hasStarted()); attempt++) await runFor(250);
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

    await page.locator("#expedition-leader-select").selectOption(leaderId);
    await page.locator("#expedition-supply-select").selectOption("grand");
    await quietScene();
    await page.screenshot({ path: resolve(OUT, "explore-before.png"), animations: "disabled" });
    await resumeScene();

    const firstSiteId = await page.evaluate(async () => {
        const { getExpeditionSnapshot } = await import("./js/systems/expeditions.js");
        return [...getExpeditionSnapshot().sites].sort((a, b) => a.danger - b.danger || a.distance - b.distance)[0].id;
    });
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

    assert.deepEqual(pageErrors, [], "the Explore flow must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the Explore flow must not raise console errors");
    console.log(JSON.stringify({ seed: SEED, siteCount: 8, leaderId, activeId: active.active.id, decks, history: returned.history, lore: returned.lore, screenshots: OUT }, null, 2));
} finally {
    await browser.close();
}
