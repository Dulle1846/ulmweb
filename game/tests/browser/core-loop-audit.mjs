// Fresh-start core-loop audit.
//
// The founding screen, construction menu, card panel, event choices and time
// controls are all driven through their real visible controls. Only read-only
// state probes are used to prove what those clicks changed. Playwright's fake
// clock advances the normal game loop so five full years can be played without
// adding a test-only game rule or mutating the simulation directly.
import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED = Number(process.env.CORE_LOOP_SEED || 20261111);
const OUT = resolve(process.cwd(), "..", "artifacts");
await mkdir(OUT, {recursive: true});

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({viewport: {width: 1400, height: 900}, reducedMotion: "reduce"});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const report = {
    seed: SEED,
    started: null,
    initial: null,
    build: null,
    road: null,
    card: null,
    event: null,
    recoveries: [],
    years: [],
    final: null,
    pageErrors,
    consoleErrors
};

async function stateProbe() {
    return page.evaluate(async () => {
        const [{state}, {getCoreCounsel}, {TYPE}, {getRoadCount}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/core-counsel.js"),
            import("./js/core/types.js"),
            import("./js/systems/roads.js")
        ]);
        const resources = Object.fromEntries(Object.entries(state.resources || {}).map(([key, value]) => [key, Math.round((Number(value) || 0) * 100) / 100]));
        const living = state.entities.filter(entity => !entity.dead);
        const counsel = getCoreCounsel(state);
        return {
            tick: state.tick,
            year: state.year,
            dayOfYear: state.dayOfYear,
            seasonIndex: state.seasonIndex,
            resources,
            resourceTotal: Object.values(resources).reduce((sum, value) => sum + value, 0),
            morale: Math.round((Number(state.morale) || 0) * 100) / 100,
            hand: state.hand.length,
            handNames: state.hand.map(card => card.name),
            currentCard: state.currentCard?.name || null,
            population: living.filter(entity => entity.type === TYPE.VILLAGER).length,
            cottages: living.filter(entity => entity.type === TYPE.HOUSE).length,
            farms: living.filter(entity => entity.type === TYPE.FARM).length,
            constructionSites: living.filter(entity => entity.construction && Number(entity.construction.stage) < 3).length,
            housesBuilt: Number(state.statistics?.totalHousesBuilt) || 0,
            cardsDrawn: Number(state.statistics?.totalCardsDrawn) || 0,
            firstSession: {
                count: document.querySelector("#first-session-count")?.textContent?.trim() || "",
                items: [...document.querySelectorAll("#first-session-list .first-session-step")].map(item => ({
                    label: item.querySelector(".first-session-label")?.textContent?.trim() || "",
                    done: item.classList.contains("is-done"),
                    current: item.getAttribute("aria-current") === "step"
                }))
            },
            roads: getRoadCount(),
            roadTilesBuilt: Number(state.statistics?.totalRoadTilesBuilt) || 0,
            eventsResolved: Number(state.statistics?.totalEventsResolved) || 0,
            trades: Number(state.statistics?.totalTrades) || 0,
            activeEvent: state.activeEvent ? {title: state.activeEvent.title, choices: state.activeEvent.choices.map(choice => choice.label)} : null,
            politics: {
                legitimacy: Math.round((Number(state.politics?.legitimacy) || 0) * 100) / 100,
                commons: Math.round((Number(state.politics?.factions?.commons) || 0) * 100) / 100
            },
            healthSick: Number(state.health?.sick) || 0,
            cardRewards: Array.isArray(state.cardRewardQueue) ? state.cardRewardQueue.length : 0,
            counsel: {
                id: counsel.id,
                text: counsel.text,
                action: counsel.actionLabel,
                panel: counsel.panel
            },
            counselText: document.querySelector("#ambition-counsel-text")?.textContent?.trim() || "",
            counselAction: document.querySelector("#ambition-counsel-action")?.textContent?.trim() || "",
            counselPanel: document.querySelector("#ambition-counsel-action")?.dataset?.kacPanel || "",
            counselVisible: Boolean(document.querySelector("#ambition-counsel-action")?.offsetParent)
        };
    });
}

async function read() {
    return stateProbe();
}

async function runFor(ms) {
    await page.clock.runFor(ms);
}

async function hasStarted() {
    return page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted);
}

async function dismissTransientMessage() {
    if (await page.locator("#big-message-close").isVisible().catch(() => false)) {
        await page.locator("#big-message-close").click().catch(() => {});
    }
}

function assertCounsel(snapshot, label) {
    assert.ok(snapshot.counselText.length > 0, label + ": NEXT MOVE text must not be empty");
    assert.ok(snapshot.counselAction.length > 0, label + ": NEXT MOVE action must name a real button");
    assert.ok(["build", "cards", "kingdom", "market"].includes(snapshot.counselPanel), label + ": NEXT MOVE must target an existing panel");
    assert.equal(snapshot.counselVisible, true, label + ": NEXT MOVE action must be visible after founding");
}

async function clickNextMove() {
    assert.equal(await page.locator("#ambition-counsel-action").isVisible(), true);
    const target = await page.locator("#ambition-counsel-action").getAttribute("data-kac-panel");
    await page.locator("#ambition-counsel-action").click();
    if (target === "build") {
        assert.equal(await page.locator("#build-modal").isVisible(), true, "NEXT MOVE build action must open the construction dialog");
    } else if (target === "market") {
        assert.equal(await page.locator("#tab-2").evaluate(el => el.classList.contains("is-active")), true, "NEXT MOVE market action must open the trade tab");
        assert.match(await page.locator("#tab-content").innerText(), /REGIONAL EXCHANGE/);
    } else {
        assert.equal(await page.locator("#command-modal").isVisible(), true, "NEXT MOVE " + target + " action must open management");
    }
    return target;
}

async function findBuildSite(type) {
    return page.evaluate(async type => {
        const [{state}, {canPlaceBuilding}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/construction.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        for (let radius = 2; radius < 30; radius++) {
            for (let x = 80 - radius; x <= 80 + radius; x++) {
                for (let y = 80 - radius; y <= 80 + radius; y++) {
                    if (x < 0 || y < 0 || x >= (state.worldW || 160) || y >= (state.worldH || 160)) continue;
                    if (!state.explored?.[x]?.[y]) continue;
                    if (!canPlaceBuilding(type, x, y).ok) continue;
                    const screenX = (x + .5) * 48 * state.zoom - state.camera.x + rect.left;
                    const screenY = (y + .5) * 48 * state.zoom - state.camera.y + rect.top;
                    if (screenX < rect.left + 8 || screenX > rect.right - 8 || screenY < rect.top + 8 || screenY > rect.bottom - 8) continue;
                    return {x, y, screenX, screenY};
                }
            }
        }
        throw new Error("No visible legal site for building " + type);
    }, type);
}

async function findRoadTile() {
    return page.evaluate(async () => {
        const [{state}, {isWaterAt}, {getRoadAt}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/world/world.js"),
            import("./js/systems/roads.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        for (let radius = 2; radius < 30; radius++) {
            for (let x = 80 - radius; x <= 80 + radius; x++) {
                for (let y = 80 - radius; y <= 80 + radius; y++) {
                    if (x < 0 || y < 0 || x >= (state.worldW || 160) || y >= (state.worldH || 160)) continue;
                    if (!state.explored?.[x]?.[y] || isWaterAt(x + .5, y + .5) || getRoadAt(x, y)) continue;
                    const occupied = state.entities.some(entity => {
                        if (entity.dead || !entity.isBuilding?.()) return false;
                        const size = entity.type === 1 ? {w: 4, h: 4} : {w: 1, h: 1};
                        return Math.abs(x + .5 - (entity.x + .5)) < size.w / 2 && Math.abs(y + .5 - (entity.y + .5)) < size.h / 2;
                    });
                    if (occupied) continue;
                    const screenX = (x + .5) * 48 * state.zoom - state.camera.x + rect.left;
                    const screenY = (y + .5) * 48 * state.zoom - state.camera.y + rect.top;
                    if (screenX < rect.left + 8 || screenX > rect.right - 8 || screenY < rect.top + 8 || screenY > rect.bottom - 8) continue;
                    return {x, y, screenX, screenY};
                }
            }
        }
        throw new Error("No visible legal road tile");
    });
}

async function settleVisibleEvent() {
    if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) await resolveVisibleEvent();
}

async function buyFoodFromMarket() {
    await settleVisibleEvent();
    const before = await read();
    const choice = await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        const partners = Array.isArray(state.market?.partners) ? state.market.partners : [];
        const price = Number(state.market?.prices?.food) || 2;
        const index = partners.findIndex(partner => (Number(partner?.stock?.food) || 0) >= 5);
        return {
            index,
            partnerId: index >= 0 ? partners[index].id : null,
            price,
            stock: index >= 0 ? Number(partners[index].stock.food) : 0,
            gold: Number(state.resources?.gold) || 0
        };
    });
    assert.ok(choice.index >= 0, "the visible market must have at least five food in stock");
    const buyButton = page.locator('#tab-content [data-trade="buy"][data-resource="food"]').nth(choice.index);
    assert.equal(await buyButton.count(), 1, "the market must expose a buy-food button for the selected partner");
    await buyButton.click();
    const after = await read();
    assert.equal(after.trades, before.trades + 1, "one market click must complete exactly one trade");
    assert.equal(after.resources.food, before.resources.food + 5, "one market click must add exactly five food");
    assert.ok(after.resources.gold < before.resources.gold, "the food purchase must be paid from the treasury");
    return {before, after, choice};
}

async function recoverFood(label) {
    // Give the ordinary render cadence a chance to expose a freshly triggered
    // event before the market is clicked. The simulation is still untouched.
    await runFor(220);
    await settleVisibleEvent();
    const before = await read();
    assert.equal(before.resources.food, 0, label + ": the recovery must start from a real food-zero state");
    await settleVisibleEvent();
    const target = await clickNextMove();
    assert.equal(target, "market", label + ": the food-zero NEXT MOVE must open the existing market");
    await settleVisibleEvent();
    const transaction = await buyFoodFromMarket();
    assert.ok(transaction.after.resources.food > 0, label + ": the paid market step must restore food");
    report.recoveries.push({
        label,
        target,
        partner: transaction.choice.partnerId,
        price: transaction.choice.price,
        stockBefore: transaction.choice.stock,
        goldBefore: transaction.before.resources.gold,
        goldAfter: transaction.after.resources.gold,
        foodBefore: transaction.before.resources.food,
        foodAfter: transaction.after.resources.food,
        tradesBefore: transaction.before.trades,
        tradesAfter: transaction.after.trades
    });
    return transaction.after;
}

async function resolveVisibleEvent() {
    const results = [];
    for (let guard = 0; guard < 20; guard++) {
        let visible = await page.locator("#realm-event-modal").isVisible().catch(() => false);
        if (!visible) {
            const active = await page.evaluate(async () => Boolean((await import("./js/core/state.js")).state.activeEvent));
            if (!active) break;
            await runFor(220);
            visible = await page.locator("#realm-event-modal").isVisible().catch(() => false);
            if (!visible) break;
        }
        const before = await read();
        if (!before.activeEvent) break;
        const title = await page.locator("#realm-event-title").innerText();
        const choices = before.activeEvent.choices;
        const choiceCount = await page.locator("#realm-event-choices .event-choice").count();
        let resolved = false;
        for (let index = 0; index < choiceCount && !resolved; index++) {
            await page.locator("#realm-event-choices .event-choice").nth(index).click();
            await runFor(20);
            const after = await read();
            if (after.eventsResolved > before.eventsResolved) resolved = true;
        }
        assert.equal(resolved, true, "an event choice must resolve the visible event");
        await runFor(20);
        const after = await read();
        assert.equal(after.eventsResolved, before.eventsResolved + 1);
        const changed = JSON.stringify({
            resources: after.resources,
            morale: after.morale,
            politics: after.politics,
            healthSick: after.healthSick,
            cardRewards: after.cardRewards
        }) !== JSON.stringify({
            resources: before.resources,
            morale: before.morale,
            politics: before.politics,
            healthSick: before.healthSick,
            cardRewards: before.cardRewards
        });
        assert.equal(changed, true, "resolving an event must change the realm state");
        const result = {
            title,
            choices,
            before: {resources: before.resources, morale: before.morale, politics: before.politics, resolved: before.eventsResolved},
            after: {resources: after.resources, morale: after.morale, politics: after.politics, resolved: after.eventsResolved},
            changed
        };
        results.push(result);
        report.event = result;
        // A new event can be ready immediately after a chronicle stage resolves.
        // The next guard iteration resolves it through the same visible buttons.
    }
    if (results.length === 0) return null;
    assert.equal(await page.locator("#realm-event-modal").isVisible().catch(() => false), false, "no blocking event modal may remain");
    return results.length === 1 ? results[0] : {count: results.length, events: results};
}

async function advance(ms) {
    await runFor(ms);
    // The UI redraws on its normal cadence; make sure a freshly triggered event
    // is actually on screen before deciding whether the audit must resolve it.
    await runFor(220);
    await dismissTransientMessage();
    const event = await resolveVisibleEvent();
    return {event, snapshot: await read()};
}

try {
    await page.clock.install({time: new Date("2026-01-01T00:00:00Z")});
    await page.goto(BASE + "/", {waitUntil: "domcontentloaded", timeout: 60000});
    await runFor(600);
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    assert.equal(await page.locator("#start-screen").isVisible(), true);

    await page.locator("#world-seed-input").fill(String(SEED));
    await page.locator("#player-name-input").fill("Core Loop Audit");
    await runFor(500);
    await page.locator("#start-new-game-btn").click();
    for (let attempt = 0; attempt < 40 && !(await hasStarted()); attempt++) await runFor(250);
    assert.equal(await hasStarted(), true, "the visible founding button must start a realm");
    await runFor(400);
    assert.equal(await page.locator("#start-screen").isVisible(), false);
    await dismissTransientMessage();

    const start = await read();
    assertCounsel(start, "start");
    report.started = {tick: start.tick, year: start.year, resources: start.resources, counsel: start.counsel};
    report.initial = start;
    assert.equal(start.firstSession.count, "1 / 5", "founding must be the first completed checklist step");
    assert.equal(start.firstSession.items.length, 5, "the first-session checklist must render all five steps");
    assert.deepEqual(start.firstSession.items.map(item => item.done), [true, false, false, false, false]);
    assert.equal(start.firstSession.items[1].current, true, "the first incomplete step must be marked current");

    // A fresh player can use the recommendation itself to enter the real build flow.
    const nextTarget = await clickNextMove();
    assert.equal(nextTarget, "build", "the initial counsel should ask for a road while the fresh realm has none");
    assert.equal(await page.locator("#build-modal").isVisible(), true);

    // Build a real cottage through the construction menu and a map click.
    await page.locator('[data-build-category="housing"]').click();
    const cottageOption = page.locator('[data-build-type="1"]');
    assert.equal(await cottageOption.count(), 1);
    await cottageOption.click();
    assert.equal(await page.locator("#build-modal").isVisible(), false);
    const cottageSite = await findBuildSite(1);
    const beforeCottage = await read();
    await page.mouse.click(cottageSite.screenX, cottageSite.screenY);
    await runFor(80);
    await runFor(200);
    const afterCottage = await read();
    assert.equal(afterCottage.cottages, beforeCottage.cottages + 1, "one build click must create exactly one cottage site");
    assert.equal(afterCottage.constructionSites, beforeCottage.constructionSites + 1, "one build click must create exactly one construction site");
    assert.ok(afterCottage.resourceTotal < beforeCottage.resourceTotal, "placing a cottage must charge material resources");
    await page.keyboard.press("Escape");
    assert.equal(afterCottage.housesBuilt, beforeCottage.housesBuilt + 1, "placing a house must update the first-house checklist counter");
    assert.equal(afterCottage.firstSession.count, "2 / 5", "the first house must complete the second checklist step");
    assert.equal(afterCottage.firstSession.items.find(item => item.label === "Build your first house")?.done, true);
    report.build = {
        type: "Timber Cottage",
        site: cottageSite,
        before: {resources: beforeCottage.resources, cottages: beforeCottage.cottages, sites: beforeCottage.constructionSites},
        after: {resources: afterCottage.resources, cottages: afterCottage.cottages, sites: afterCottage.constructionSites},
        counsel: afterCottage.counsel
    };
    assertCounsel(afterCottage, "after cottage");

    // The next recommendation should still be an executable step. Build the road
    // through the same visible menu, which then moves the recommendation to cards.
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    assert.equal(await page.locator("[data-road-type]").count(), 3);
    await page.locator('[data-road-type="dirt"]').click();
    const roadTile = await findRoadTile();
    await page.mouse.click(roadTile.screenX, roadTile.screenY);
    await runFor(80);
    await runFor(200);
    const afterRoad = await read();
    assert.equal(afterRoad.roads, afterCottage.roads + 1, "one road click must create exactly one road tile");
    assert.equal(afterRoad.roadTilesBuilt, 1, "one road click must update the build statistic exactly once");
    await page.keyboard.press("Escape");
    assert.equal(afterRoad.firstSession.count, "3 / 5", "the first road must complete the third checklist step");
    assert.equal(afterRoad.firstSession.items.find(item => item.label === "Lay your first road")?.done, true);
    assert.equal(afterRoad.counsel.panel, "cards", "with a road and an empty hand, the next move must point to cards");
    assert.notEqual(afterRoad.counsel.text, start.counsel.text, "NEXT MOVE must react to the built road");
    report.road = {
        tile: roadTile,
        roads: afterRoad.roads,
        roadTilesBuilt: afterRoad.roadTilesBuilt,
        counsel: afterRoad.counsel
    };
    assertCounsel(afterRoad, "after road");

    // Follow the next recommendation into the real Cards panel and draw once.
    assert.equal(await clickNextMove(), "cards");
    assert.match(await page.locator("#command-panel-content").innerText(), /royal deck/i);
    const drawButton = page.locator('[data-command="draw-card"]');
    assert.equal(await drawButton.isEnabled(), true);
    await drawButton.click();
    await runFor(30);
    await runFor(200);
    const afterCard = await read();
    assert.equal(afterCard.hand, afterRoad.hand + 1, "drawing a card must add exactly one card to the hand");
    assert.equal(afterCard.cardsDrawn, 1, "drawing the first card must update the checklist counter exactly once");
    assert.equal(afterCard.firstSession.count, "4 / 5", "the first card must complete the fourth checklist step");
    assert.equal(afterCard.firstSession.items.find(item => item.label === "Draw your first card")?.done, true);
    assert.equal(await page.locator("#command-panel-content .command-card").count(), 1);
    assert.notEqual(afterCard.counsel.text, afterRoad.counsel.text, "NEXT MOVE must react to the drawn card");
    assert.notEqual(afterCard.counsel.id, "cards", "a drawn card must remove the empty-hand recommendation");
    assertCounsel(afterCard, "after card");
    report.card = {
        handBefore: afterRoad.hand,
        handAfter: afterCard.hand,
        names: afterCard.handNames,
        counsel: afterCard.counsel
    };
    await page.locator("#command-close").click();
    assert.equal(await page.locator("#command-modal").isVisible(), false);

    // Speed up through the same visible speed control. Keep the render cap lower
    // so the fake clock advances three real simulation years in bounded time.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-frame-limit").selectOption("30");
    await page.locator("#settings-close").click();
    assert.equal(await page.locator("#settings-modal").isVisible(), false);
    await page.locator("#speed-4").click();
    assert.ok(await page.locator("#speed-4").evaluate(el => el.classList.contains("is-active")));

    let last = await read();
    let lastYear = last.year;
    report.years.push({year: last.year, tick: last.tick, resources: last.resources, counsel: last.counsel});
    let eventCount = report.event ? 1 : 0;

    // 1200 ticks = three completed years. At 4x this is 225 seconds of game
    // clock; 10-second chunks keep event handling and year-boundary capture exact.
    // The run then continues from the recovered state to Year 6.
    for (let chunk = 0; chunk < 28 && last.year < 4; chunk++) {
        const advanced = await advance(10000);
        if (advanced.event) eventCount++;
        last = advanced.snapshot;
        assertCounsel(last, "year " + last.year);
        if (last.year > lastYear) {
            report.years.push({year: last.year, tick: last.tick, resources: last.resources, counsel: last.counsel});
            lastYear = last.year;
        }
        if (last.activeEvent) await resolveVisibleEvent();
        assert.equal(await page.locator("#realm-event-modal").isVisible().catch(() => false), false, "the play audit must leave no unresolved blocking event");
    }

    assert.ok(last.year >= 4, "fresh start must reach at least Year 4 (three completed years)");
    assert.ok(last.tick >= 1200, "three full 400-day years must have been simulated");
    assert.ok(last.eventsResolved >= 1, "at least one realm event must be decided");
    assert.ok(eventCount >= 1);
    assert.ok(last.roads >= 1 && last.roadTilesBuilt >= 1);
    assert.ok(last.hand >= 1, "the drawn card must remain in the hand");
    assert.ok(last.cottages >= 1, "the built cottage must remain in the realm");
    assert.ok(last.resourceTotal !== report.initial.resourceTotal, "the run must change the realm economy");
    assert.ok(new Set(report.years.map(entry => entry.counsel.text)).size >= 2, "NEXT MOVE must adapt across the run");
    assert.equal(last.resources.food, 0, "the audit must reach a real food-zero state");
    assert.equal(last.counsel.panel, "market", "food-zero counsel must use the existing market");
    last = await recoverFood("Year 4");

    // Keep playing from the recovered state. Five completed years means Year 6.
    for (let chunk = 0; chunk < 28 && last.year < 6; chunk++) {
        const advanced = await advance(10000);
        if (advanced.event) eventCount++;
        last = advanced.snapshot;
        assertCounsel(last, "year " + last.year);
        if (last.year > lastYear) {
            report.years.push({year: last.year, tick: last.tick, resources: last.resources, counsel: last.counsel});
            lastYear = last.year;
        }
        if (last.activeEvent) await resolveVisibleEvent();
        assert.equal(await page.locator("#realm-event-modal").isVisible().catch(() => false), false, "the continued play audit must leave no unresolved blocking event");
    }

    assert.ok(last.year >= 6, "fresh start must reach at least Year 6 (five completed years)");
    assert.ok(last.housesBuilt >= 1, "the first-session house counter must survive the extended run");
    assert.equal(last.firstSession.items.find(item => item.label === "Build your first house")?.done, true, "the first house must remain complete after five years");
    assert.ok(last.tick >= 2000, "five full 400-day years must have been simulated");
    if (last.resources.food === 0) last = await recoverFood("Year 6");
    assert.ok(last.resources.food > 0, "the audit must finish with food restored or a paid recovery step");
    assert.ok(report.recoveries.length >= 1, "the audit must prove a paid recovery from food zero");
    assert.ok(new Set(report.years.map(entry => entry.counsel.text)).size >= 2, "NEXT MOVE must adapt across the full run");
    report.final = last;

    // The final recommendation must still open a real, usable panel.
    const finalTarget = await clickNextMove();
    assert.equal(finalTarget, last.counsel.panel, "the final NEXT MOVE must target its stated panel");
    if (finalTarget === "build") await page.locator("#build-close-btn").click();
    else if (finalTarget !== "market") await page.locator("#command-close").click();
    if (finalTarget === "build") assert.equal(await page.locator("#build-modal").isVisible(), false);
    else if (finalTarget !== "market") assert.equal(await page.locator("#command-modal").isVisible(), false);

    assert.deepEqual(pageErrors, [], "no page errors are allowed");
    assert.deepEqual(consoleErrors, [], "no console errors are allowed");
    report.ok = true;
    await writeFile(resolve(OUT, "core-loop-audit.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        ok: true,
        seed: SEED,
        years: report.years,
        build: report.build,
        road: report.road,
        card: report.card,
        event: report.event,
        recoveries: report.recoveries,
        final: {
            tick: last.tick,
            year: last.year,
            resources: last.resources,
            hand: last.hand,
            cottages: last.cottages,
            roads: last.roads,
            eventsResolved: last.eventsResolved,
            counsel: last.counsel
        },
        pageErrors,
        consoleErrors
    }, null, 2));
} catch (error) {
    report.ok = false;
    report.error = error.stack || error.message;
    await writeFile(resolve(OUT, "core-loop-audit.json"), JSON.stringify(report, null, 2)).catch(() => {});
    console.error(JSON.stringify({ok: false, error: error.message, report: {years: report.years, event: report.event, pageErrors, consoleErrors}}, null, 2));
    throw error;
} finally {
    await browser.close();
}
