// Five 120-year player journeys through the shipped interface, including the
// full save/load roundtrip for every Crown Legacy path.
//
// Time is advanced with the real simulation and logistics functions so a
// century is practical in CI. Every decision that changes the realm is made by
// clicking the shipped start screen, management tabs, build menu, trade tab and
// event modal. The harness records the state before and after each journey.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";
const JOURNEY = String(process.env.JOURNEY || "").toLowerCase();
const YEARS = Math.max(100, Number(process.env.JOURNEY_YEARS || 100));
const SEED = Number(process.env.JOURNEY_SEED || 20261108);
const SAVE_LOAD = /^(1|true|yes)$/i.test(String(process.env.JOURNEY_SAVE_LOAD || ""));
const ENDEAVOUR_FUNDING = Math.max(0, Math.min(2, Number(process.env.JOURNEY_ENDEAVOUR_FUNDING ?? 2)));
const root = process.cwd();
const outDir = resolve(root, "..", "artifacts", "journeys");
await mkdir(outDir, { recursive: true });

const MIN_POPULATION = Object.freeze({ builder: 43, warlord: 28, diplomat: 43, merchant: 20, scholar: 46 });
const LEGACY_BY_PATH = Object.freeze({
    builder: { id: "living-city", label: "The Living City" },
    warlord: { id: "unbroken-watch", label: "The Unbroken Watch" },
    diplomat: { id: "concord-of-crowns", label: "The Concord of Crowns" },
    merchant: { id: "crown-treasury", label: "The Crown Treasury" },
    scholar: { id: "eternal-library", label: "The Eternal Library" }
});
const expectedLegacy = LEGACY_BY_PATH[JOURNEY];

const JOURNEYS = {
    builder: { label: "The Builder", path: "builder", tab: "buildings" },
    warlord: { label: "The Warlord", path: "warlord", tab: "military" },
    diplomat: { label: "The Diplomat", path: "diplomat", tab: "diplomacy" },
    merchant: { label: "The Merchant", path: "merchant", tab: "economy" },
    scholar: { label: "The Scholar", path: "scholar", tab: "research" }
};
assert.ok(JOURNEYS[JOURNEY], "JOURNEY must be one of: " + Object.keys(JOURNEYS).join(", "));
const journey = JOURNEYS[JOURNEY];

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

async function pauseGame() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
    }).catch(() => {});
}

async function hardCloseEvent() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (state.activeEvent) state.activeEvent.dismissed = true;
        const { renderUI } = await import("./js/presentation/rendering/ui.js");
        renderUI();
    }).catch(() => {});
    await page.waitForTimeout(100);
    if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
        await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            state.activeEvent = null;
            const { renderUI } = await import("./js/presentation/rendering/ui.js");
            renderUI();
        }).catch(() => {});
        await page.waitForTimeout(80);
    }
}

async function dismiss() {
    await pauseGame();
    for (let attempt = 0; attempt < 3; attempt++) {
        const modal = page.locator("#realm-event-modal");
        if (!(await modal.isVisible().catch(() => false))) break;
        const handled = await page.evaluate(() => {
            const choice = document.querySelector("#realm-event-choices .event-choice:not([disabled])");
            if (choice) { choice.click(); return "choice"; }
            const close = document.querySelector("#realm-event-dismiss");
            if (close) { close.click(); return "dismiss"; }
            return null;
        }).catch(() => null);
        if (!handled) break;
        await page.waitForTimeout(160);
    }
    await hardCloseEvent();
    const big = page.locator("#big-message-close");
    if (await big.isVisible().catch(() => false)) await big.click().catch(() => {});
}

async function openPanel(tab) {
    await pauseGame();
    await dismiss();
    await hardCloseEvent();
    if (!(await page.locator("#command-modal").isVisible().catch(() => false))) {
        await page.locator("#command-open-btn").click();
        await page.waitForTimeout(80);
    }
    await page.locator(`[data-command-tab="${tab}"]`).click();
    await page.waitForTimeout(100);
    await dismiss();
}

async function closePanel() {
    const close = page.locator("#command-close");
    if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
}

async function stateSnapshot() {
    return page.evaluate(async ({ pathId }) => {
        const [{ state }, { getEndeavourSnapshot }, { getMilitarySnapshot }, { getDiplomacySnapshot }, { getResearchSnapshot }, { getHousingSnapshot }, { getSettlementSnapshot }, { getPhysicalStock, getPhysicalStockMap }, { getCrownSupplySnapshot }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/endeavours.js"),
            import("./js/systems/military.js"),
            import("./js/systems/diplomacy.js"),
            import("./js/systems/research.js"),
            import("./js/systems/population.js"),
            import("./js/systems/settlement.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/crown-supply.js")
        ]);
        const settlement = getSettlementSnapshot();
        const endeavours = getEndeavourSnapshot();
        const diplomacy = getDiplomacySnapshot();
        const research = getResearchSnapshot();
        const military = getMilitarySnapshot();
        const realmHistory = (state.diplomacy?.realms || []).map(realm => ({
            name: realm.name,
            treaty: realm.treaty,
            history: Array.isArray(realm.history) ? realm.history.length : 0,
            latest: Array.isArray(realm.history) && realm.history[0] ? realm.history[0] : null
        }));
        return {
            year: state.year,
            tick: state.tick,
            gameOver: Boolean(state.gameOver),
            morale: Math.round(Number(state.morale) || 0),
            population: getHousingSnapshot().population,
            housing: getHousingSnapshot().capacity,
            buildings: state.entities.filter(entity => !entity.dead && entity.isBuilding && entity.isBuilding()).length,
            farms: state.entities.filter(entity => !entity.dead && entity.type === 2 && (!entity.construction || entity.construction.stage >= 3)).length,
            mills: state.entities.filter(entity => !entity.dead && entity.type === 10).length,
            bakeries: state.entities.filter(entity => !entity.dead && entity.type === 64).length,
            roads: Object.keys(state.roads?.tiles || {}).length,
            cityEnabled: Boolean(state.city?.enabled),
            services: settlement.needs || null,
            resources: { ...state.resources },
            endeavours: {
                totalCompleted: endeavours.totalCompleted,
                pathCompleted: endeavours.paths.find(path => path.id === pathId)?.completed || 0,
                legaciesCompleted: endeavours.legaciesCompleted,
                active: endeavours.active ? { project: endeavours.active.project?.label, tier: endeavours.active.tier, percent: endeavours.active.percent } : null,
                modifiers: endeavours.modifiers
            },
            military: { soldiers: military.soldiers.length, atWar: military.atWar, history: military.history.length, trained: military.trained, losses: military.losses, desertions: military.desertions, battles: military.soldiers.reduce((sum, soldier) => sum + (Number(soldier.battles) || 0), 0) },
            diplomacy: { treaties: diplomacy.counts, alliances: diplomacy.counts.alliance, tradePacts: diplomacy.counts.trade, wars: diplomacy.counts.war, averageRelation: diplomacy.averageRelation, realmHistory },
            research: { completed: research.modifiers.completedCount, active: research.activeTechDetails?.label || null, scholars: research.scholars.length },
            market: { trades: state.statistics?.totalTrades || 0, goldTraded: state.market?.totalGoldTraded || 0 },
            physical: getPhysicalStockMap(),
            physicalGrain: getPhysicalStock("grain"),
            economy: state.economy ? { lastLedger: state.economy.lastLedger, history: (state.economy.history || []).slice(-3) } : null,
            crownSupply: getCrownSupplySnapshot()
        };
    }, { pathId: journey.path });
}

async function readLocalSaveSnapshot() {
    return page.evaluate(async () => {
        const [{ state }, { readLocalSave }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/persistence.js")
        ]);
        const save = readLocalSave(state.activeProfileId);
        if (!save) return null;
        return {
            version: save.version,
            savedAt: save.savedAt,
            migratedFrom: save.migratedFrom ?? null,
            restoredFromBackup: Boolean(save.restoredFromBackup),
            snapshot: save.snapshot
        };
    });
}

const LEGACY_PROJECT_IDS = Object.freeze(["living-city", "unbroken-watch", "concord-of-crowns", "crown-treasury", "eternal-library"]);

function countCompletedWorks(snapshot) {
    return Object.values(snapshot?.endeavours?.completed || {}).reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)), 0);
}

function countCompletedLegacies(snapshot) {
    return LEGACY_PROJECT_IDS.filter(id => (Number(snapshot?.endeavours?.completed?.[id]) || 0) >= 1).length;
}

function summarizeSavedRealm(save) {
    const snapshot = save?.snapshot || {};
    const entities = Array.isArray(snapshot.entities) ? snapshot.entities : [];
    return {
        version: save?.version ?? null,
        savedAt: save?.savedAt ?? null,
        migratedFrom: save?.migratedFrom ?? null,
        restoredFromBackup: Boolean(save?.restoredFromBackup),
        tick: Number(snapshot.tick) || 0,
        year: Number(snapshot.year) || 0,
        population: Number(snapshot.totalPopulation) || 0,
        entityCount: entities.length,
        aliveEntities: entities.filter(entity => entity && !entity.dead).length,
        completedWorks: countCompletedWorks(snapshot),
        completedLegacies: countCompletedLegacies(snapshot),
        legacies: Object.fromEntries(LEGACY_PROJECT_IDS.map(id => [id, Number(snapshot.endeavours?.completed?.[id]) || 0])),
        expectedLegacy: Number(snapshot.endeavours?.completed?.[expectedLegacy.id]) || 0,
        crownTreasury: Number(snapshot.endeavours?.completed?.["crown-treasury"] || 0),
        legacyEntries: Array.isArray(snapshot.legacy?.entries) ? snapshot.legacy.entries.length : null,
        resources: snapshot.resources ? { ...snapshot.resources } : null
    };
}

function registerHomes(snapshot) {
    const homes = new Map();
    for (const [id, citizen] of Object.entries(snapshot?.population?.citizens || {})) {
        const match = /^house:(\d+):(\d+)$/.exec(String(citizen?.householdId || ""));
        if (!match) continue;
        homes.set(id, { x: Number(match[1]), y: Number(match[2]), householdId: citizen.householdId });
    }
    return homes;
}

function countHomeMismatches(snapshot) {
    const homes = registerHomes(snapshot);
    return (snapshot?.entities || []).filter(entity => {
        if (!entity || entity.dead) return false;
        const home = homes.get(String(entity.personId || entity.id));
        if (!home) return false;
        return entity.householdId !== home.householdId ||
            entity.home?.x !== home.x || entity.home?.y !== home.y;
    }).length;
}

function countAnchorMismatches(snapshot) {
    const homes = registerHomes(snapshot);
    return (snapshot?.entities || []).filter(entity => {
        if (!entity || entity.dead) return false;
        const home = homes.get(String(entity.personId || entity.id));
        if (!home) return false;
        return entity.anchor?.x !== home.x || entity.anchor?.y !== home.y;
    }).length;
}

function countUnhousedCitizenHomes(snapshot) {
    const homes = registerHomes(snapshot);
    return (snapshot?.entities || []).filter(entity =>
        entity && !entity.dead && entity.personId && !entity.isKing && !entity.isRoyalFamily && !homes.has(String(entity.personId))
    ).length;
}

function comparableSaveSnapshot(snapshot) {
    const sourceEntities = Array.isArray(snapshot?.entities) ? snapshot.entities : [];
    const { eventLog, eventSequence, entities, city, ...rest } = snapshot || {};
    const comparableCity = city && typeof city === "object" ? JSON.parse(JSON.stringify(city)) : city;
    // Carrier paths, the needs chart and warehouse stock summaries are rebuilt
    // from live entities; they are deliberately not part of the durable save
    // contract. The underlying stock remains compared through inventories.
    if (comparableCity?.needs) {
        delete comparableCity.needs.history;
        delete comparableCity.needs.lastTick;
        delete comparableCity.needs.summary?.population;
        delete comparableCity.needs.summary?.firewoodStock;
        delete comparableCity.needs.summary?.waterStock;
    }
    if (comparableCity?.services) delete comparableCity.services.lastTick;
    for (const carrier of comparableCity?.logistics?.carriers || []) delete carrier.pathVersion;
    const homes = registerHomes(snapshot);
    return {
        ...rest,
        city: comparableCity,
        entities: sourceEntities
            .filter(entity => entity && !entity.dead)
            .map(entity => {
                const { workplaceIndex, ...copy } = entity;
                const workplace = Number.isInteger(workplaceIndex) ? sourceEntities[workplaceIndex] : null;
                const home = homes.get(String(entity.personId || entity.id));
                // The population register is authoritative for citizens with a
                // household. An unhoused citizen has no durable home; its raw
                // entity home/anchor is only a visual hint that the load may
                // normalize, so it is reported as derived rather than compared
                // as a saved fact. Non-citizen entities keep their own fields.
                const citizen = Boolean(entity.personId) && !entity.isKing && !entity.isRoyalFamily;
                const homeFields = home
                    ? { householdId: home.householdId, home: { x: home.x, y: home.y }, anchor: { x: home.x, y: home.y } }
                    : citizen ? { householdId: null, home: null, anchor: null } : {};
                return {
                    ...copy,
                    workplaceId: workplace?.id ?? null,
                    ...homeFields
                };
            })
    };
}

function compactDifferenceValue(value) {
    if (value === undefined) return "<missing>";
    try {
        const text = JSON.stringify(value);
        return typeof text === "string" && text.length > 240 ? text.slice(0, 240) + "…" : text;
    } catch {
        return String(value);
    }
}

function collectDeepDifferences(left, right, path = "", out = []) {
    if (out.length >= 12 || isDeepStrictEqual(left, right)) return out;
    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) out.push({ path: path + ".length", before: left.length, after: right.length });
        for (let index = 0; index < Math.min(left.length, right.length) && out.length < 12; index++) {
            collectDeepDifferences(left[index], right[index], path + "[" + index + "]", out);
        }
        return out;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
        const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
        for (const key of keys) {
            if (out.length >= 12) break;
            const childPath = path ? path + "." + key : key;
            if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
                out.push({ path: childPath, before: compactDifferenceValue(left[key]), after: compactDifferenceValue(right[key]) });
            } else {
                collectDeepDifferences(left[key], right[key], childPath, out);
            }
        }
        return out;
    }
    out.push({ path: path || "<root>", before: compactDifferenceValue(left), after: compactDifferenceValue(right) });
    return out;
}

function snapshotDifferenceSnippet(beforeValue, afterValue) {
    let beforeText;
    let afterText;
    try {
        beforeText = JSON.stringify(beforeValue);
        afterText = JSON.stringify(afterValue);
    } catch {
        return null;
    }
    if (typeof beforeText !== "string" || typeof afterText !== "string") return null;
    let index = 0;
    const limit = Math.min(beforeText.length, afterText.length);
    while (index < limit && beforeText[index] === afterText[index]) index++;
    return {
        at: index,
        before: beforeText.slice(Math.max(0, index - 80), index + 220),
        after: afterText.slice(Math.max(0, index - 80), index + 220)
    };
}

function compareSavedSnapshots(before, after) {
    const left = comparableSaveSnapshot(before);
    const right = comparableSaveSnapshot(after);
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    const changedKeys = keys.filter(key => !isDeepStrictEqual(left[key], right[key]));
    return {
        exactMatch: changedKeys.length === 0,
        keysCompared: keys.length,
        changedKeys,
        differences: changedKeys.slice(0, 8).map(key => ({
            key,
            ...snapshotDifferenceSnippet(left[key], right[key]),
            details: collectDeepDifferences(left[key], right[key])
        }))
    };
}

function comparableEventLog(snapshot) {
    return (snapshot?.eventLog || []).filter(entry => entry && entry.kind !== "system");
}

function compareEventLogs(before, after) {
    const left = comparableEventLog(before);
    const right = comparableEventLog(after);
    const exact = isDeepStrictEqual(left, right);
    // Saving and loading append system entries. The 100-entry chronicle then
    // evicts exactly one oldest entry; no player-visible record may be lost.
    const boundedEviction = !exact && left.length === right.length + 1 && isDeepStrictEqual(left.slice(0, -1), right);
    return {
        before: left.length,
        after: right.length,
        preserved: exact || boundedEviction,
        boundedEviction: boundedEviction ? 1 : 0
    };
}

async function advanceYears(years) {
    const started = Date.now();
    const result = await page.evaluate(async ({ ticks }) => {
        const [{ state }, { updateSimulation }, { updateLogisticsMovement }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/simulation/simulation.js"),
            import("./js/systems/logistics.js")
        ]);
        state.isPaused = false;
        const start = performance.now();
        for (let index = 0; index < ticks; index++) {
            updateSimulation();
            for (let slice = 0; slice < 4; slice++) updateLogisticsMovement(0.1875);
        }
        state.isPaused = true;
        return {
            year: state.year,
            tick: state.tick,
            gameOver: Boolean(state.gameOver),
            elapsed: performance.now() - start
        };
    }, { ticks: years * 400 });
    await dismiss();
    if (result.gameOver) throw new Error("Game over in year " + result.year + " during " + journey.label);
    return { ...result, wallMs: Date.now() - started };
}

async function startEndeavour() {
    await pauseGame();
    await openPanel("endeavours");
    const active = await page.locator(".endeavour-active").count();
    let started = false;
    if (!active) {
        const funding = page.locator(`[data-command="endeavour-funding"][data-value="${ENDEAVOUR_FUNDING}"]`);
        if (await funding.count()) await funding.click();
        const overseer = page.locator("#endeavour-overseer-select");
        if (await overseer.count() && (await overseer.locator("option").count()) > 1) {
            await overseer.selectOption({ index: 1 });
        }
        const ready = page.locator(`[data-endeavour-path="${journey.path}"] [data-command="endeavour-start"]:not([disabled])`).first();
        if (await ready.count()) {
            await ready.click();
            await page.waitForTimeout(120);
            started = true;
        }
    }
    await closePanel();
    return started;
}

async function buildViaUI(type, category) {
    await dismiss();
    await page.locator("#build-open-btn").click();
    await page.locator(`[data-build-category="${category}"]`).click();
    const option = page.locator(`[data-build-type="${type}"]`);
    if (!(await option.count())) {
        const close = page.locator("#build-close-btn");
        if (await close.isVisible().catch(() => false)) await close.click();
        return false;
    }
    if ((await option.getAttribute("aria-disabled")) === "true") {
        const close = page.locator("#build-close-btn");
        if (await close.isVisible().catch(() => false)) await close.click();
        return false;
    }
    await option.click();
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = false;
    });
    const spot = await page.evaluate(async ({ type }) => {
        const [{ state }, { canPlaceBuilding }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/construction.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        for (let radius = 4; radius < 40; radius++) {
            for (let x = 80 - radius; x <= 80 + radius; x++) {
                for (let y = 80 - radius; y <= 80 + radius; y++) {
                    if (x < 0 || y < 0 || x >= 160 || y >= 160 || !state.explored?.[x]?.[y]) continue;
                    if (!canPlaceBuilding(type, x, y).ok) continue;
                    const screenX = (x + 0.5) * 48 * state.zoom - state.camera.x + rect.left;
                    const screenY = (y + 0.5) * 48 * state.zoom - state.camera.y + rect.top;
                    if (screenX < rect.left + 6 || screenX > rect.right - 6 || screenY < rect.top + 6 || screenY > rect.bottom - 6) continue;
                    return { x, y, screenX, screenY };
                }
            }
        }
        return null;
    }, { type });
    if (!spot) {
        await page.keyboard.press("Escape");
        await pauseGame();
        return false;
    }
    await page.mouse.click(spot.screenX, spot.screenY);
    await page.waitForTimeout(120);
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
    });
    return true;
}

async function tradeFood() {
    await pauseGame();
    await dismiss();
    const before = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { food: Number(state.resources.food) || 0, gold: Number(state.resources.gold) || 0, wood: Number(state.resources.wood) || 0 };
    });
    await page.evaluate(() => document.querySelector("#tab-2")?.click());
    await page.waitForTimeout(100);
    if (before.gold < 120 && before.wood > 80) {
        for (let index = 0; index < 3; index++) {
            if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
                await dismiss();
                await page.evaluate(() => document.querySelector("#tab-2")?.click());
                await page.waitForTimeout(80);
            }
            const sell = page.locator('[data-trade="sell"][data-resource="wood"]:not([disabled])').first();
            if (!(await sell.count())) break;
            await sell.click();
            await page.waitForTimeout(70);
            if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
                await dismiss();
                await page.evaluate(() => document.querySelector("#tab-2")?.click());
                await page.waitForTimeout(80);
            }
        }
    }
    if (before.food < 250) {
        for (let index = 0; index < 10; index++) {
            if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
                await dismiss();
                await page.evaluate(() => document.querySelector("#tab-2")?.click());
                await page.waitForTimeout(80);
            }
            const buy = page.locator('[data-trade="buy"][data-resource="food"]:not([disabled])').first();
            if (!(await buy.count())) break;
            await buy.click();
            await page.waitForTimeout(70);
            if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
                await dismiss();
                await page.evaluate(() => document.querySelector("#tab-2")?.click());
                await page.waitForTimeout(80);
            }
        }
    }
    await dismiss();
    await page.evaluate(() => document.querySelector("#tab-0")?.click());
    await page.waitForTimeout(80);
}

async function sustainRealm(year) {
    const need = await page.evaluate(async () => {
        const [{ state }, { getHousingSnapshot }, { getSettlementSnapshot }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/population.js"),
            import("./js/systems/settlement.js")
        ]);
        return {
            food: Number(state.resources.food) || 0,
            gold: Number(state.resources.gold) || 0,
            wood: Number(state.resources.wood) || 0,
            stone: Number(state.resources.stone) || 0,
            population: getHousingSnapshot().population,
            capacity: getHousingSnapshot().capacity,
            farms: state.entities.filter(entity => !entity.dead && entity.type === 2 && (!entity.construction || entity.construction.stage >= 3)).length,
            water: Number(getSettlementSnapshot().needs?.water) || 0,
            safety: Number(getSettlementSnapshot().needs?.safety) || 0,
            satisfaction: Number(getSettlementSnapshot().needs?.satisfaction) || 0
        };
    });
    if (need.water < 0.55) await buildViaUI(65, "services");
    else if (need.safety < 0.4) await buildViaUI(9, "military");
    else if (need.capacity < need.population + 6) await buildViaUI(1, "housing");
    else if (need.food < 250) {
        await buildViaUI(2, "production");
        if (JOURNEY === "warlord" && need.food < 180) await buildViaUI(2, "production");
    } else if (year % 20 === 1) {
        await buildViaUI(10, "production");
        await buildViaUI(64, "services");
        await buildViaUI(65, "services");
    }
    if (need.food < 250 || need.gold < 120) await tradeFood();
}

async function crownTurn(year) {
    await openPanel("economy");
    const info = await page.evaluate(async () => {
        const [{ state }, { getHousingSnapshot }, { getSettlementSnapshot }, { getCrownSupplySnapshot }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/population.js"),
            import("./js/systems/settlement.js"),
            import("./js/systems/crown-supply.js")
        ]);
        const supply = getCrownSupplySnapshot();
        return {
            gold: Number(state.resources.gold) || 0,
            food: Number(state.resources.food) || 0,
            population: getHousingSnapshot().population,
            capacity: getHousingSnapshot().capacity,
            water: Number(getSettlementSnapshot().needs?.water) || 0,
            ...supply
        };
    });
    const click = async selector => {
        const button = page.locator(selector);
        if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) return false;
        await button.click();
        await page.waitForTimeout(80);
        return true;
    };
    if (info.waterworksLevel < 2 && info.gold >= 80) await click('[data-command="crown-water"][data-value="2"]');
    else if (info.water < 0.5 && info.waterworksLevel < 3 && info.gold >= 140) await click('[data-command="crown-water"][data-value="3"]');
    const targetGrainLevel = JOURNEY === "warlord" ? 4 : 2;
    if (info.grainLevel < targetGrainLevel && info.grainRouteOpen) await click(`[data-command="crown-grain"][data-value="${targetGrainLevel}"]`);
    else if (info.food < 160 && info.grainLevel < 3 && info.gold >= 200) await click('[data-command="crown-grain"][data-value="3"]');
    if (JOURNEY === "warlord") {
        if (year >= 101) await provisionWarGranary(2.2);
    } else if (JOURNEY !== "merchant") {
        await provisionWarGranary(1.2);
    }
    if (info.capacity < info.population + 8 && info.gold > 180) {
        await click('[data-command="crown-housing"]');
        await click('[data-command="crown-housing"]');
    }
    await closePanel();
}

async function provisionWarGranary(minCoverage = 2.2) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const before = await page.evaluate(async () => {
            const [{ state }, { getCrownReserveYears }] = await Promise.all([
                import("./js/core/state.js"),
                import("./js/systems/crown-supply.js")
            ]);
            return { food: Number(state.resources.food) || 0, coverage: getCrownReserveYears() };
        });
        if (before.coverage >= minCoverage) break;
        const button = page.locator('[data-command="crown-provision"]');
        if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) break;
        await button.click();
        await page.waitForTimeout(140);
        const after = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return Number(state.resources.food) || 0;
        });
        if (after <= before.food + 1) break;
    }
}

async function sellSurplusAtEnd() {
    await pauseGame();
    await dismiss();
    const openTrade = async () => {
        await page.evaluate(() => document.querySelector("#tab-2")?.click());
        await page.waitForTimeout(90);
    };
    await openTrade();
    for (let index = 0; index < 40; index++) {
        if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
            await dismiss();
            await openTrade();
        }
        let sell = page.locator('[data-trade="sell"][data-resource="stone"]:not([disabled])').first();
        if (!(await sell.count())) sell = page.locator('[data-trade="sell"][data-resource="wood"]:not([disabled])').first();
        if (!(await sell.count())) break;
        await sell.click();
        await page.waitForTimeout(70);
    }
    await dismiss();
    await page.evaluate(() => document.querySelector("#tab-0")?.click());
}

async function foundingWorks() {
    await buildViaUI(65, "services");
    await buildViaUI(65, "services");
    await buildViaUI(1, "housing");
    await buildViaUI(1, "housing");
    await buildViaUI(2, "production");
    await buildViaUI(9, "military");
    if (JOURNEY === "warlord") {
        await buildViaUI(9, "military");
        await buildViaUI(2, "production");
        await buildViaUI(2, "production");
    }
    if (JOURNEY === "merchant") {
        await buildViaUI(2, "production");
        await buildViaUI(2, "production");
    }
}

async function modalIsVisible() {
    return page.evaluate(() => {
        const element = document.querySelector("#command-modal");
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
}

async function buildRoadViaUI() {
    await pauseGame();
    await dismiss();
    await page.locator("#build-open-btn").click();
    await page.locator('[data-build-category="roads"]').click();
    const road = page.locator('[data-road-type="dirt"]');
    if (!(await road.count())) return false;
    await road.click();
    await page.evaluate(async () => { const { state } = await import("./js/core/state.js"); state.isPaused = false; });
    const spot = await page.evaluate(async () => {
        const [{ state }, { isWaterAt }, { getRoadAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/world/world.js"),
            import("./js/systems/roads.js")
        ]);
        const rect = document.querySelector("#canvas").getBoundingClientRect();
        for (let radius = 2; radius < 35; radius++) {
            for (let x = 80 - radius; x <= 80 + radius; x++) {
                for (let y = 80 - radius; y <= 80 + radius; y++) {
                    if (x < 0 || y < 0 || x >= 160 || y >= 160 || !state.explored?.[x]?.[y]) continue;
                    if (isWaterAt(x + 0.5, y + 0.5) || getRoadAt(x, y)) continue;
                    if (state.entities.some(entity => !entity.dead && Math.abs(entity.x - x) < 2 && Math.abs(entity.y - y) < 2)) continue;
                    const screenX = (x + 0.5) * 48 * state.zoom - state.camera.x + rect.left;
                    const screenY = (y + 0.5) * 48 * state.zoom - state.camera.y + rect.top;
                    if (screenX < rect.left + 6 || screenX > rect.right - 6 || screenY < rect.top + 6 || screenY > rect.bottom - 6) continue;
                    return { screenX, screenY };
                }
            }
        }
        return null;
    });
    if (!spot) { await page.keyboard.press("Escape"); await pauseGame(); return false; }
    await page.mouse.click(spot.screenX, spot.screenY);
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await pauseGame();
    return true;
}

async function builderTurn(year) {
    await buildRoadViaUI();
    if (year % 20 === 1) await buildViaUI(1, "housing");
    if (year % 20 === 11) await buildViaUI(2, "production");
    if (year % 20 === 6) {
        await buildViaUI(64, "services");
        // The builder's late-game works consume almost no beds themselves;
        // keep raising capacity so the realm can still grow past its v3.12
        // population floor while the stone yards are busy.
        await buildViaUI(1, "housing");
    }
}

async function warlordTurn(year) {
    if (year === 6 || year === 21 || year === 41 || year === 61 || year === 81) await buildViaUI(9, "military");
    if (year % 5 === 1) {
        await openPanel("military");
        for (let index = 0; index < 2; index++) {
            const select = page.locator("#military-recruit-select");
            if (!(await select.count()) || (await select.locator("option").count()) <= 1) break;
            await select.selectOption({ index: 1 });
            const recruit = page.locator('[data-command="military-recruit"]');
            if (!(await recruit.isEnabled().catch(() => false))) break;
            await recruit.click();
            await page.waitForTimeout(90);
        }
        for (let index = 0; index < 2; index++) {
            const train = page.locator('[data-command="military-train"]:not([disabled])').first();
            if (!(await train.count())) break;
            await train.click();
            await page.waitForTimeout(90);
        }
        for (let index = 0; index < 2; index++) {
            const equip = page.locator('[data-command="military-equip"]:not([disabled])').first();
            if (!(await equip.count())) break;
            await equip.click();
            await page.waitForTimeout(90);
        }
        await closePanel();
    }
    if (year === 31) {
        await openPanel("diplomacy");
        const war = page.locator('[data-command="diplomacy-war"]:not([disabled])').first();
        if (await war.count()) await war.click();
        await closePanel();
    }
    if (year >= 41 && year % 5 === 1) {
        // White peace becomes available at war exhaustion 35. Trying only in
        // year 71 left the realm fighting for forty needless years; sue every
        // year so the warlord can actually end the war before the keep falls.
        await openPanel("diplomacy");
        for (let index = 0; index < 2; index++) {
            const peace = page.locator('[data-command="diplomacy-peace"]:not([disabled])').first();
            if (!(await peace.count())) break;
            await peace.click();
            await page.waitForTimeout(100);
        }
        await closePanel();
    }
}

async function diplomatTurn(year) {
    if (year < 11) return;
    await openPanel("diplomacy");
    for (let index = 0; index < 4; index++) {
        const gift = page.locator('[data-command="diplomacy-gift"]:not([disabled])').first();
        if (!(await gift.count())) break;
        await gift.click();
        await page.waitForTimeout(70);
    }
    for (let index = 0; index < 3; index++) {
        const pact = page.locator('[data-command="diplomacy-pact"]:not([disabled])').first();
        if (!(await pact.count())) break;
        await pact.click();
        await page.waitForTimeout(90);
    }
    for (let index = 0; index < 2; index++) {
        const alliance = page.locator('[data-command="diplomacy-alliance"]:not([disabled])').first();
        if (!(await alliance.count())) break;
        await alliance.click();
        await page.waitForTimeout(90);
    }
    const envoy = page.locator('select[id^="envoy-"]').first();
    if (await envoy.count() && (await envoy.locator("option").count()) > 1) {
        const id = String(await envoy.getAttribute("id") || "").replace("envoy-", "");
        await envoy.selectOption({ index: 1 });
        const appoint = page.locator(`[data-command="diplomacy-envoy"][data-value="${id}"]`);
        if (await appoint.isEnabled().catch(() => false)) await appoint.click();
    }
    await closePanel();
    // Diplomacy spends gold, not beds. Add housing on the same cadence so the
    // diplomat can still grow past the v3.12 population floor while the works
    // and gifts consume the treasury.
    if (year % 10 === 1) await buildViaUI(1, "housing");
}

async function merchantTurn() {
    await pauseGame();
    await dismiss();
    await page.evaluate(() => document.querySelector("#tab-2")?.click());
    await page.waitForTimeout(120);
    for (let index = 0; index < 2; index++) {
        const wood = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return Number(state.resources.wood) || 0;
        });
        if (wood < 70) break;
        const target = page.locator('[data-trade="sell"][data-resource="wood"]:not([disabled])').first();
        if (!(await target.count())) break;
        await target.click();
        await page.waitForTimeout(80);
        if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
            await dismiss();
            await page.evaluate(() => document.querySelector("#tab-2")?.click());
            await page.waitForTimeout(80);
        }
    }
    await dismiss();
    await page.evaluate(() => document.querySelector("#tab-0")?.click());
    await page.waitForTimeout(80);
    await pauseGame();
}

async function fundJourneyFromSurplus() {
    if (!["builder", "warlord", "diplomat"].includes(JOURNEY)) return;
    await pauseGame();
    await dismiss();
    const wallet = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { gold: Number(state.resources.gold) || 0, wood: Number(state.resources.wood) || 0 };
    });
    if (wallet.gold >= 1800 || wallet.wood < 300) return;
    await page.evaluate(() => document.querySelector("#tab-2")?.click());
    await page.waitForTimeout(100);
    // The builder's works are gold-gated while the forests keep producing
    // wood. Sell a bounded surplus in the shipped market so the next Crown
    // work can start; this is a player decision, not a state shortcut.
    for (let index = 0; index < 80; index++) {
        if (await page.locator("#realm-event-modal").isVisible().catch(() => false)) {
            await dismiss();
            await page.evaluate(() => document.querySelector("#tab-2")?.click());
            await page.waitForTimeout(60);
        }
        const current = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return { gold: Number(state.resources.gold) || 0, wood: Number(state.resources.wood) || 0 };
        });
        if (current.gold >= 1800 || current.wood < 160) break;
        const sell = page.locator('[data-trade="sell"][data-resource="wood"]:not([disabled])').first();
        if (!(await sell.count())) break;
        await sell.click();
        await page.waitForTimeout(35);
    }
    await dismiss();
    await page.evaluate(() => document.querySelector("#tab-0")?.click());
    await page.waitForTimeout(60);
    await pauseGame();
}

async function scholarTurn() {
    await openPanel("research");
    const scholar = page.locator("#research-scholar-select");
    if (await scholar.count() && (await scholar.locator("option").count()) > 1) {
        await scholar.selectOption({ index: 1 });
        const appoint = page.locator('[data-command="research-appoint"]');
        if (await appoint.isEnabled().catch(() => false)) await appoint.click();
        await page.waitForTimeout(100);
    }
    const funding = page.locator('[data-command="research-funding"][data-value="2"]');
    if (await funding.count()) await funding.click();
    const tech = page.locator('[data-command="research-start"]:not([disabled])').first();
    if (await tech.count()) await tech.click();
    await closePanel();
}

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
await page.locator("#player-name-input").fill(journey.label);
await page.locator("#realm-name-input").fill("Avalon");
await page.locator("#realm-dynasty-input").fill("Vere");
await page.locator("#world-seed-input").fill(String(SEED));
await page.locator("#start-new-game-btn").click();
await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
await page.waitForTimeout(1200);
await dismiss();
const initial = await stateSnapshot();
const blocks = [];
const startedAt = Date.now();

await foundingWorks();
for (let block = 0; block < Math.ceil(YEARS / 5); block++) {
    const targetYear = Math.min(YEARS + 1, 6 + block * 5);
    const advance = await advanceYears(5);
    await fundJourneyFromSurplus();
    await startEndeavour();
    await crownTurn(advance.year);
    if (JOURNEY === "builder") await builderTurn(advance.year);
    else if (JOURNEY === "warlord") await warlordTurn(advance.year);
    else if (JOURNEY === "diplomat") await diplomatTurn(advance.year);
    else if (JOURNEY === "merchant") await merchantTurn();
    else if (JOURNEY === "scholar") await scholarTurn();
    await sustainRealm(advance.year);
    const snapshot = await stateSnapshot();
    blocks.push({ block: block + 1, targetYear, ...advance, snapshot });
    console.log(`${JOURNEY} block ${block + 1}/${Math.ceil(YEARS / 5)} · year ${snapshot.year} · works ${snapshot.endeavours.totalCompleted} · pop ${snapshot.population} · food ${Math.round(snapshot.resources.food)} · gold ${Math.round(snapshot.resources.gold)} · water ${Math.round((snapshot.services?.water || 0) * 100)}% · safety ${Math.round((snapshot.services?.safety || 0) * 100)}% · grain ${snapshot.crownSupply.grainLevel}/${snapshot.crownSupply.lastGrainBought} · waterworks ${snapshot.crownSupply.waterworksLevel} · soldiers ${snapshot.military.soldiers} · ${Math.round(advance.elapsed / 2000 * 10) / 10} ms/tick`);
}

if (JOURNEY === "warlord") {
    await openPanel("economy");
    await provisionWarGranary(2.2);
    await closePanel();
} else {
    await openPanel("economy");
    await provisionWarGranary(1.2);
    await closePanel();
}
await startEndeavour();
if (JOURNEY === "merchant") await sellSurplusAtEnd();
await openPanel("endeavours");
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(250);
const desktopFile = resolve(outDir, `${JOURNEY}-1600.png`);
await page.screenshot({ path: desktopFile });
const desktopLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    modalVisible: (() => { const element = document.querySelector("#command-modal"); if (!element) return false; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; })(),
    panelTitle: document.querySelector("#command-panel-content .command-panel-intro h3")?.textContent || null,
    paths: document.querySelectorAll("[data-endeavour-path]").length,
    projects: document.querySelectorAll("[data-endeavour-project]").length,
    legacies: document.querySelectorAll('[data-endeavour-project="living-city"]').length,
    panelScrollTop: document.querySelector("#command-panel-content")?.scrollTop ?? 0
}));
await page.setViewportSize({ width: 864, height: 1000 });
await page.waitForTimeout(250);
const narrowFile = resolve(outDir, `${JOURNEY}-864.png`);
await page.screenshot({ path: narrowFile });
const narrowLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    modalVisible: (() => { const element = document.querySelector("#command-modal"); if (!element) return false; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; })(),
    paths: document.querySelectorAll("[data-endeavour-path]").length,
    projects: document.querySelectorAll("[data-endeavour-project]").length,
    legacies: document.querySelectorAll('[data-endeavour-project="living-city"]').length,
    panelScrollTop: document.querySelector("#command-panel-content")?.scrollTop ?? 0
}));
await page.setViewportSize({ width: 1600, height: 1000 });

let final = await stateSnapshot();
let preSaveFinal = final;
let saveLoad = null;
let loadedFile = null;
if (SAVE_LOAD) {
    // Save through the shipped HUD, reload the page so the in-memory realm is
    // gone, then load through the start screen. Pause inside the same task as
    // the load click so no simulation tick can slip between load and compare.
    await closePanel();
    await pauseGame();
    await dismiss();
    await page.evaluate(() => {
        const status = document.querySelector("#status-message");
        if (status) status.textContent = "";
    });
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => document.querySelector("#status-message")?.textContent.includes("Realm saved"), null, { timeout: 10000 });
    const beforeSave = await readLocalSaveSnapshot();
    assert.ok(beforeSave, "the save button must write a readable local save");
    preSaveFinal = final;
    const beforeSummary = summarizeSavedRealm(beforeSave);

    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled && (button.textContent || "").includes("CONTINUE"));
    }, null, { timeout: 15000 });
    await page.evaluate(() => {
        const status = document.querySelector("#status-message");
        if (status) status.textContent = "";
        document.querySelector("#continue-game-btn").click();
        const pause = document.querySelector("#pause-btn");
        if (pause && !pause.classList.contains("is-paused")) pause.click();
    });
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed") || message.includes("No valid saved realm");
    }, null, { timeout: 15000 });
    const loadStatus = (await page.locator("#status-message").textContent() || "").trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the continue button must load the save; actual status: " + loadStatus);
    const pausedAfterLoad = await page.evaluate(async () => (await import("./js/core/state.js")).state.isPaused);
    assert.equal(pausedAfterLoad, true, "the load pause guard must stop the simulation before comparison");
    const loadedState = await stateSnapshot();

    // A second save turns the live loaded state back into the game's own
    // canonical DTO. It is captured before the save's own chronicle entry is
    // added, just like the pre-save snapshot.
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => document.querySelector("#status-message")?.textContent.includes("Realm saved"), null, { timeout: 10000 });
    const afterSave = await readLocalSaveSnapshot();
    assert.ok(afterSave, "the loaded realm must save again into a readable local save");
    const afterSummary = summarizeSavedRealm(afterSave);
    const comparison = compareSavedSnapshots(beforeSave.snapshot, afterSave.snapshot);
    const eventLogComparison = compareEventLogs(beforeSave.snapshot, afterSave.snapshot);
    const eventSequenceDelta = Number(afterSave.snapshot.eventSequence || 0) - Number(beforeSave.snapshot.eventSequence || 0);

    await openPanel("endeavours");
    await page.waitForTimeout(250);
    loadedFile = resolve(outDir, `${JOURNEY}-save-load-1600.png`);
    await page.screenshot({ path: loadedFile });
    const loadedLayout = await page.evaluate(({ completedWorks, completedLegacies }) => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        modalVisible: (() => { const element = document.querySelector("#command-modal"); if (!element) return false; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; })(),
        panelTitle: document.querySelector("#command-panel-content .command-panel-intro h3")?.textContent || null,
        paths: document.querySelectorAll("[data-endeavour-path]").length,
        projects: document.querySelectorAll("[data-endeavour-project]").length,
        legacies: document.querySelectorAll('[data-endeavour-project="living-city"]').length,
        completedWorks,
        completedLegacies,
        panelScrollTop: document.querySelector("#command-panel-content")?.scrollTop ?? 0
    }), { completedWorks: loadedState.endeavours.totalCompleted, completedLegacies: loadedState.endeavours.legaciesCompleted });
    final = await stateSnapshot();
    saveLoad = {
        before: beforeSummary,
        after: afterSummary,
        loadStatus,
        pausedAfterLoad,
        completedWorksBefore: loadedState.endeavours.totalCompleted,
        eventLog: eventLogComparison,
        eventSequenceDelta,
        homeMismatches: {
            before: countHomeMismatches(beforeSave.snapshot),
            after: countHomeMismatches(afterSave.snapshot)
        },
        anchorMismatches: {
            before: countAnchorMismatches(beforeSave.snapshot),
            after: countAnchorMismatches(afterSave.snapshot)
        },
        derivedUnhousedHomes: {
            before: countUnhousedCitizenHomes(beforeSave.snapshot),
            after: countUnhousedCitizenHomes(afterSave.snapshot)
        },
        comparison,
        layout: loadedLayout,
        screenshot: loadedFile
    };
}
const report = {
    journey: JOURNEY,
    label: journey.label,
    seed: SEED,
    targetYears: YEARS,
    endeavourFunding: ENDEAVOUR_FUNDING,
    expectedLegacy,
    startedAt: new Date(startedAt).toISOString(),
    wallMs: Date.now() - startedAt,
    simulationMs: blocks.reduce((sum, block) => sum + block.elapsed, 0),
    ticks: final.tick,
    tickCostMs: Math.round(blocks.reduce((sum, block) => sum + block.elapsed, 0) / Math.max(1, final.tick) * 1000) / 1000,
    initial,
    final,
    preSaveFinal,
    saveLoad,
    blocks,
    layouts: { desktop: desktopLayout, narrow: narrowLayout, ...(saveLoad?.layout ? { loaded: saveLoad.layout } : {}) },
    screenshots: [desktopFile, narrowFile, ...(loadedFile ? [loadedFile] : [])],
    pageErrors,
    consoleErrors,
    findings: []
};
await writeFile(resolve(outDir, `${JOURNEY}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ journey: JOURNEY, final, saveLoad, layouts: report.layouts, screenshots: report.screenshots, pageErrors, consoleErrors }, null, 2));
await browser.close();

const failures = [];
if (final.year < 101) failures.push(`journey ended in year ${final.year}, before year 101`);
if (final.gameOver) failures.push("the realm suffered a game over");
if (final.endeavours.totalCompleted < 1) failures.push("no Crown Endeavour was completed");
if (final.endeavours.pathCompleted < 1) failures.push("the journey's own endeavour path never advanced");
if (pageErrors.length) failures.push("page errors: " + pageErrors.join(" | "));
if (consoleErrors.length) failures.push("console errors: " + consoleErrors.join(" | "));
if (desktopLayout.overflow) failures.push("desktop layout overflows horizontally");
if (narrowLayout.overflow) failures.push("narrow layout overflows horizontally");
if (!desktopLayout.modalVisible || !narrowLayout.modalVisible) failures.push("the Crown Endeavours panel is not visible");
if (desktopLayout.paths !== 5 || narrowLayout.paths !== 5) failures.push("the Crown Endeavours panel does not render five paths");
if (desktopLayout.projects !== 20 || narrowLayout.projects !== 20) failures.push("the Crown Endeavours panel does not render twenty projects");
if (desktopLayout.legacies !== 1 || narrowLayout.legacies !== 1) failures.push("the Crown Endeavours panel does not render each path's legacy");
if (desktopLayout.panelScrollTop !== 0 || narrowLayout.panelScrollTop !== 0) failures.push("the Crown Endeavours panel did not open at its title");
if (JOURNEY === "builder" && final.buildings <= initial.buildings) failures.push("the builder completed no new building");
if (JOURNEY === "warlord" && final.military.soldiers < 1) failures.push("the warlord never raised a soldier");
if (JOURNEY === "warlord" && final.diplomacy.wars < 0) failures.push("warlord diplomacy is invalid");
if (JOURNEY === "diplomat" && final.diplomacy.alliances < 1) failures.push("the diplomat concluded no alliance");
if (JOURNEY === "merchant" && final.market.trades < 1) failures.push("the merchant completed no trade");
if (JOURNEY === "scholar" && final.research.completed < 1) failures.push("the scholar completed no technology");
if (final.population <= MIN_POPULATION[JOURNEY]) failures.push(`population ${final.population} did not exceed the v3.12.0 value ${MIN_POPULATION[JOURNEY]}`);
if (Number(final.resources.food) <= 40) failures.push("food reserve ended in the hunger corridor: " + final.resources.food);
if (!(Number(final.services?.water) > 0)) failures.push("water coverage ended at zero");
if (!(Number(final.services?.safety) > 0)) failures.push("safety coverage ended at zero");
if (!(Number(final.crownSupply?.waterworksLevel) > 0)) failures.push("no public waterworks were commissioned");
if (!(Number(final.crownSupply?.grainLevel) > 0)) failures.push("no grain contract was opened");
if (JOURNEY === "warlord" && final.military.soldiers < 8) failures.push("the warlord ended with fewer than eight soldiers: " + final.military.soldiers);
if (JOURNEY === "warlord" && Number(final.crownSupply?.reserveYears) < 2) failures.push("the warlord granary covers fewer than two years: " + final.crownSupply?.reserveYears);
if (SAVE_LOAD) {
    if (!saveLoad) failures.push("the save/load round trip did not finish");
    else {
        if (saveLoad.before.completedWorks !== 16) failures.push("the pre-save realm did not hold all sixteen Crown works: " + saveLoad.before.completedWorks);
        if (saveLoad.before.expectedLegacy !== 1) failures.push(`the ${expectedLegacy.label} legacy was not completed before saving`);
        if (saveLoad.before.completedLegacies !== 1) failures.push("the pre-save realm did not hold exactly one Crown Legacy: " + saveLoad.before.completedLegacies);
        if (saveLoad.after.completedWorks !== 16) failures.push("the loaded realm lost Crown works: " + saveLoad.after.completedWorks);
        if (saveLoad.after.expectedLegacy !== 1) failures.push(`the loaded realm lost the ${expectedLegacy.label} legacy`);
        if (saveLoad.after.completedLegacies !== 1) failures.push("the loaded realm did not restore exactly one Crown Legacy: " + saveLoad.after.completedLegacies);
        if (!saveLoad.comparison.exactMatch) failures.push("save/load changed snapshot fields: " + saveLoad.comparison.changedKeys.join(", "));
        if (!saveLoad.eventLog.preserved) failures.push("save/load changed the non-system chronicle");
        if (!(saveLoad.eventSequenceDelta >= 1)) failures.push("the loaded realm did not record its load event");
        if (saveLoad.homeMismatches.after !== 0) failures.push("loaded entities do not agree with the restored population register on their homes");
        if (saveLoad.anchorMismatches.after > saveLoad.anchorMismatches.before) failures.push("loading created new visual-anchor inconsistencies");
        if (!saveLoad.layout.modalVisible) failures.push("the Crown Endeavours panel is not visible after loading");
        if (saveLoad.layout.paths !== 5) failures.push("the loaded Crown Endeavours panel does not render five paths");
        if (saveLoad.layout.projects !== 20) failures.push("the loaded Crown Endeavours panel does not render twenty projects");
        if (saveLoad.layout.legacies !== 1) failures.push("the loaded Crown Endeavours panel does not render each path's legacy");
        if (saveLoad.layout.panelScrollTop !== 0) failures.push("the loaded Crown Endeavours panel did not open at its title");
    }
}
if (failures.length) {
    console.error("PLAYER JOURNEY FAILED\n" + failures.join("\n"));
    process.exitCode = 1;
}
