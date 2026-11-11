// Play the two new long-form chronicles to their final stage in the real
// browser UI. The harness seeds the existing event queue (instead of waiting
// for the random thread roll), then every stage is opened, read and resolved
// through the same event modal a player uses.
//
// It verifies resources, morale, hidden prosperity/tension, political faction
// deltas, queued card rewards, that the queue is actually drawable, and the
// final completedThreads record. Run with the game served on E2E_BASE_URL.
import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED = Number(process.env.CHRONICLE_SEED || 20261108);
const root = process.cwd();
const outDir = resolve(root, "..", "artifacts");
await mkdir(outDir, {recursive: true});

const CHAINS = {
    wildlife: {
        titles: ["Tracks at the Boundary", "The Herd Returns", "The Warden's Charter"],
        labels: ["Set aside a winter grove", "Open a salt lick and a guarded path", "Appoint a royal warden"],
        resources: [{wood: -10}, {food: -8, wood: -6}, {gold: -12}],
        morale: [2, 3, 4],
        hidden: [{prosperity: 3, tension: -2}, {prosperity: 4, tension: -3}, {prosperity: 5, tension: -3}],
        politics: [{commons: 2}, {commons: 2, clergy: 1}, {commons: 2, legitimacy: 2}],
        cards: ["deer", null, "deer"]
    },
    fishing: {
        titles: ["The Silver Run", "Nets in the Shallows", "The River Compact"],
        labels: ["Repair the common weirs", "Set a joint river watch", "Renew the common fishery"],
        resources: [{wood: -8, food: 18}, {gold: -8}, {stone: -10, gold: -8, food: 20}],
        morale: [3, 2, 4],
        hidden: [{prosperity: 3, tension: -2}, {prosperity: 3, tension: -4}, {prosperity: 5, tension: -4}],
        politics: [{commons: 2, guilds: 1}, {commons: 2, legitimacy: 1}, {commons: 3, guilds: 1, legitimacy: 2}],
        cards: ["river-weirs", null, "river-weirs"]
    }
};

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, reducedMotion: "reduce"});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

const round = (value, digits = 4) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
function deltas(before, after, keys) {
    return Object.fromEntries(keys.map(key => [key, round((after[key] || 0) - (before[key] || 0))]));
}
function politicalDeltas(before, after) {
    return {
        legitimacy: round(after.legitimacy - before.legitimacy),
        commons: round(after.factions.commons - before.factions.commons),
        nobility: round(after.factions.nobility - before.factions.nobility),
        guilds: round(after.factions.guilds - before.factions.guilds),
        clergy: round(after.factions.clergy - before.factions.clergy)
    };
}
function compactPoliticalDeltas(delta) {
    return Object.fromEntries(Object.entries(delta).filter(([, value]) => Math.abs(value) > 0.00001));
}
async function realmSnapshot() {
    return page.evaluate(async () => {
        const [{state}, {getPoliticalSnapshot}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/politics.js")
        ]);
        return {
            tick: state.tick,
            resources: {...state.resources},
            morale: state.morale,
            hidden: {
                prosperity: state.hiddenRealm?.prosperity || 0,
                tension: state.hiddenRealm?.tension || 0,
                mystery: state.hiddenRealm?.mystery || 0
            },
            politics: getPoliticalSnapshot(),
            queue: (state.cardRewardQueue || []).map(card => ({category: card.category, categoryName: card.categoryName, name: card.name})),
            activeEvent: state.activeEvent ? {
                id: state.activeEvent.id,
                family: state.activeEvent.family,
                title: state.activeEvent.title,
                thread: state.activeEvent.thread || null,
                choices: state.activeEvent.choices.map(choice => choice.label)
            } : null,
            activeThreads: (state.hiddenRealm?.activeThreads || []).map(thread => ({id: thread.id, stage: thread.stage})),
            completedThreads: (state.hiddenRealm?.completedThreads || []).map(thread => ({...thread}))
        };
    });
}
async function beginChain(chain) {
    await page.evaluate(async chain => {
        const [{state}, {checkRandomEvents}, {renderUI}, {createEventParticipants}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/events.js"),
            import("./js/presentation/rendering/ui.js"),
            import("./js/systems/people.js")
        ]);
        state.isPaused = true;
        state.activeEvent = null;
        state.cardRewardQueue = [];
        state.hand = [];
        state.hiddenRealm = state.hiddenRealm || {tension: 0, prosperity: 0, mystery: 0, memories: [], activeThreads: [], completedThreads: []};
        state.hiddenRealm.activeThreads = [{
            id: chain,
            stage: 0,
            startedAtTick: state.tick,
            nextAtTick: state.tick,
            participants: createEventParticipants(chain)
        }];
        state.hiddenRealm.completedThreads = [];
        state.nextIssueAtTick = Number.MAX_SAFE_INTEGER;
        checkRandomEvents();
        renderUI();
    }, chain);
    await page.locator("#realm-event-modal").waitFor({state: "visible", timeout: 10000});
}
async function advanceToNextStage(chain) {
    await page.evaluate(async chain => {
        const [{state}, {checkRandomEvents}, {renderUI}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/events.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        const thread = (state.hiddenRealm?.activeThreads || []).find(item => item.id === chain);
        if (!thread) throw new Error("Missing active chronicle thread: " + chain);
        thread.nextAtTick = state.tick;
        checkRandomEvents();
        renderUI();
    }, chain);
    await page.locator("#realm-event-modal").waitFor({state: "visible", timeout: 10000});
}
async function clickFirstChoice() {
    const button = page.locator('[data-event-choice="0"]');
    await button.waitFor({state: "visible", timeout: 10000});
    const label = (await button.locator("strong").textContent())?.trim();
    await button.click();
    await page.waitForTimeout(120);
    return label;
}
async function drawQueuedRewards() {
    return page.evaluate(async () => {
        const [{state}, {drawPlayerCard}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/cards.js")
        ]);
        const queued = (state.cardRewardQueue || []).map(card => card.category);
        const drawn = [];
        while ((state.cardRewardQueue || []).length && state.hand.length < 5) {
            const result = drawPlayerCard();
            if (!result.ok) throw new Error("Queued reward could not be drawn: " + result.reason);
            drawn.push({category: result.card.category, name: result.card.name});
        }
        return {queued, drawn, hand: state.hand.map(card => ({category: card.category, name: card.name}))};
    });
}

const report = {seed: SEED, chains: [], pageErrors, consoleErrors};
let failure = null;
try {
    await page.goto(BASE + "/", {waitUntil: "networkidle", timeout: 60000});
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    await page.locator("#start-screen").waitFor({state: "visible", timeout: 30000});
    await page.locator("#world-seed-input").fill(String(SEED));
    await page.waitForFunction(seed => document.querySelector("#world-preview-status")?.textContent.includes("SEED " + seed), String(SEED), {timeout: 20000}).catch(() => {});
    await page.locator("#player-name-input").fill("Chronicle Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({state: "hidden", timeout: 30000});
    await page.waitForTimeout(900);
    await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = true;
        state.activeEvent = null;
    });
    const bigMessage = page.locator("#big-message-close");
    if (await bigMessage.isVisible().catch(() => false)) await bigMessage.click();

    for (const [chain, expected] of Object.entries(CHAINS)) {
        await beginChain(chain);
        const chainReport = {id: chain, stages: []};
        for (let stage = 0; stage < expected.titles.length; stage++) {
            if (stage > 0) await advanceToNextStage(chain);
            await page.waitForFunction(title => document.querySelector("#realm-event-title")?.textContent === title, expected.titles[stage], {timeout: 10000});
            assert.equal(await page.locator("#realm-event-modal").getAttribute("data-event-kind"), "chronicle", "chronicle modal must identify its kind");
            assert.equal(await page.locator('[data-event-choice]').count(), 2, "each chronicle stage must offer two choices");

            const before = await realmSnapshot();
            assert.equal(before.activeEvent?.family, "chronicle");
            assert.equal(before.activeEvent?.thread?.id, chain);
            assert.equal(before.activeEvent?.thread?.stage, stage);
            assert.equal(before.activeEvent?.title, expected.titles[stage]);
            assert.equal(before.activeEvent?.choices.length, 2, "each chronicle stage must offer two choices");
            assert.equal(before.activeEvent?.choices[0], expected.labels[stage], "unexpected first choice label");

            const label = await clickFirstChoice();
            assert.equal(label, expected.labels[stage], "clicked the intended chronicle choice");
            const after = await realmSnapshot();
            assert.equal(after.activeEvent, null, "resolving a stage must close the active event");

            const resourceDelta = deltas(before.resources, after.resources, ["wood", "stone", "gold", "food"]);
            assert.deepEqual(resourceDelta, {
                wood: round(expected.resources[stage].wood || 0),
                stone: round(expected.resources[stage].stone || 0),
                gold: round(expected.resources[stage].gold || 0),
                food: round(expected.resources[stage].food || 0)
            }, chain + " stage " + (stage + 1) + " resource delta");
            assert.equal(round(after.morale - before.morale), expected.morale[stage], chain + " stage " + (stage + 1) + " morale delta");
            assert.deepEqual({
                prosperity: round(after.hidden.prosperity - before.hidden.prosperity),
                tension: round(after.hidden.tension - before.hidden.tension)
            }, expected.hidden[stage], chain + " stage " + (stage + 1) + " hidden realm delta");

            const political = compactPoliticalDeltas(politicalDeltas(before.politics, after.politics));
            const expectedPolitical = compactPoliticalDeltas(expected.politics[stage]);
            assert.deepEqual(political, expectedPolitical, chain + " stage " + (stage + 1) + " faction delta");

            const reward = expected.cards[stage];
            if (reward) {
                const added = after.queue.slice(before.queue.length);
                assert.equal(added.length, 1, "expected one queued card after stage " + (stage + 1));
                assert.equal(added[0].category, reward);
            } else {
                assert.equal(after.queue.length, before.queue.length, "no card reward was expected at stage " + (stage + 1));
            }

            const thread = after.activeThreads.find(item => item.id === chain);
            if (stage < expected.titles.length - 1) {
                assert.equal(thread?.stage, stage + 1, "chronicle stage must advance");
                assert.equal(after.completedThreads.length, 0, "chronicle must not complete early");
            } else {
                assert.equal(thread, undefined, "chronicle must leave the active queue on the final choice");
                assert.equal(after.completedThreads.length, 1, "chronicle must be recorded as completed");
                assert.equal(after.completedThreads[0].id, chain);
                assert.equal(after.completedThreads[0].finalChoice, expected.labels[stage]);
                assert.ok(after.completedThreads[0].participants.length >= 1, "completed chronicle must remember its participants");
            }

            chainReport.stages.push({
                stage: stage + 1,
                title: expected.titles[stage],
                choice: label,
                resources: resourceDelta,
                morale: expected.morale[stage],
                hidden: expected.hidden[stage],
                politics: political,
                queuedReward: reward || null
            });
        }

        const rewards = await drawQueuedRewards();
        const expectedDraws = expected.cards.filter(Boolean);
        assert.deepEqual(rewards.queued, expectedDraws, "reward queue contents");
        assert.deepEqual(rewards.drawn.map(card => card.category), expectedDraws, "rewards must be drawable in queue order");
        chainReport.rewards = rewards;
        chainReport.completed = (await realmSnapshot()).completedThreads;
        report.chains.push(chainReport);

        const modal = page.locator("#realm-event-modal");
        if (await modal.isVisible().catch(() => false)) assert.ok(await modal.evaluate(node => node.classList.contains("hidden")), "modal must be closed after completion");
    }

    // The post-ambition fork is a real event, not a developer-only state flag.
    // Seed the completed royal ladder, let the normal event scheduler offer it,
    // and resolve it through the same modal used by players.
    await page.evaluate(async () => {
        const [{state}, {AMBITIONS, normalizeAmbitions}, {checkRandomEvents}, {renderUI}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/ambitions.js"),
            import("./js/systems/events.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        state.isPaused = true;
        state.activeEvent = null;
        state.ambitions = normalizeAmbitions({
            completed: Object.fromEntries(AMBITIONS.map(ambition => [ambition.id, 10])),
            lastEvaluatedTick: 0
        });
        state.hiddenRealm.activeThreads = [];
        state.nextIssueAtTick = Number.MAX_SAFE_INTEGER;
        checkRandomEvents();
        renderUI();
    });
    await page.waitForFunction(() => document.querySelector("#realm-event-title")?.textContent === "The Second Crown", {timeout: 10000});
    assert.equal(await page.locator("#realm-event-modal").getAttribute("data-event-kind"), "crown-era");
    assert.equal(await page.locator("[data-event-choice]").count(), 3);
    assert.deepEqual(await page.locator("[data-event-choice] strong").allTextContents(), ["The Common Weal", "The Guild Compact", "The Royal Ascendancy"]);
    const beforeEra = await page.evaluate(async () => {
        const [{state}, {getPoliticalSnapshot}] = await Promise.all([import("./js/core/state.js"), import("./js/systems/politics.js")]);
        return {gold: state.resources.gold, stone: state.resources.stone, politics: getPoliticalSnapshot()};
    });
    await page.locator('[data-event-choice="1"]').click();
    await page.waitForTimeout(180);
    const afterEra = await page.evaluate(async () => {
        const [{state}, {getAmbitionSnapshot, getCrownEraSnapshot}, {getPoliticalSnapshot}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/ambitions.js"),
            import("./js/systems/politics.js")
        ]);
        return {
            activeEvent: state.activeEvent,
            era: getCrownEraSnapshot(),
            snapshot: getAmbitionSnapshot(),
            gold: state.resources.gold,
            stone: state.resources.stone,
            politics: getPoliticalSnapshot(),
            ambitionKicker: document.querySelector("#ambition-kicker")?.textContent || "",
            ambitionDescription: document.querySelector("#ambition-description")?.textContent || "",
            ambitionCount: document.querySelector("#ambition-count")?.textContent || "",
            ambitionProgress: document.querySelector("#ambition-progress-label")?.textContent || "",
            ambitionReward: document.querySelector("#ambition-reward")?.textContent || "",
            counselText: document.querySelector("#ambition-counsel-text")?.textContent || "",
            counselAction: document.querySelector("#ambition-counsel-action")?.textContent || "",
            counselPanel: document.querySelector("#ambition-counsel-action")?.dataset?.kacPanel || ""
        };
    });
    assert.equal(afterEra.activeEvent, null);
    assert.equal(afterEra.era?.id, "guild-compact");
    assert.equal(afterEra.snapshot.era, "guild-compact");
    assert.equal(afterEra.snapshot.agenda, true);
    assert.equal(afterEra.snapshot.stageIndex, 0);
    assert.equal(afterEra.snapshot.stageTotal, 3);
    assert.equal(afterEra.ambitionKicker.trim(), "ERA AGENDA · 1 OF 3");
    assert.match(afterEra.ambitionDescription, /^The Guild Compact · Era Agenda 1 of 3\./);
    assert.equal(afterEra.ambitionCount.trim(), "13 / 13");
    assert.ok(afterEra.ambitionProgress.trim().length > 0);
    assert.match(afterEra.ambitionReward, /^STAGE REWARD · /);
    assert.ok(afterEra.counselText.trim().length > 20, "the next-move counsel must be visible");
    assert.ok(afterEra.counselAction.trim().length > 0, "the next-move action must name a real panel");
    assert.ok(["build", "cards", "kingdom"].includes(afterEra.counselPanel));
    assert.equal(afterEra.gold, beforeEra.gold + 120);
    assert.equal(afterEra.stone, beforeEra.stone + 30);
    assert.equal(afterEra.politics.factions.guilds, beforeEra.politics.factions.guilds + 6);
    assert.equal(afterEra.politics.factions.nobility, beforeEra.politics.factions.nobility + 2);
    assert.equal(afterEra.politics.legitimacy, beforeEra.politics.legitimacy + 1);
    report.secondCrown = {
        choice: "The Guild Compact",
        era: afterEra.era,
        ambitionCount: afterEra.ambitionCount.trim(),
        agenda: afterEra.era.agenda,
        kicker: afterEra.ambitionKicker.trim(),
        description: afterEra.ambitionDescription,
        progress: afterEra.ambitionProgress.trim(),
        reward: afterEra.ambitionReward.trim(),
        counsel: afterEra.counselText.trim(),
        counselAction: afterEra.counselAction.trim(),
        counselPanel: afterEra.counselPanel
    };
    await page.screenshot({path: resolve(outDir, "kac-second-crown.png"), fullPage: false});

    assert.deepEqual(pageErrors, [], "browser page errors");
    assert.deepEqual(consoleErrors, [], "browser console errors");
    await page.screenshot({path: resolve(outDir, "kac-chronicles-complete.png"), fullPage: false});
    report.ok = true;
} catch (error) {
    failure = error;
    report.ok = false;
    report.error = error?.stack || String(error);
    await page.screenshot({path: resolve(outDir, "kac-chronicles-failure.png"), fullPage: false}).catch(() => {});
} finally {
    report.pageErrors = pageErrors;
    report.consoleErrors = consoleErrors;
    await writeFile(resolve(outDir, "kac-chronicles-audit.json"), JSON.stringify(report, null, 2) + "\n");
    await browser.close();
}

if (failure) {
    console.error(report.error);
    process.exitCode = 1;
} else {
    console.log(JSON.stringify(report, null, 2));
    console.log("Chronicle browser audit passed: both chains completed, rewards drawn, faction deltas verified, and The Second Crown resolved into a saved era.");
}
