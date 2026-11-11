// Focused browser check for the folded 5/5 first-session confirmation.
// The realm is founded through the visible start control; the five completed
// facts are then applied as a deterministic UI fixture, without touching the
// simulation loop.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.clock.runFor(600);
    await page.locator("#world-seed-input").fill("20261112");
    await page.locator("#player-name-input").fill("First Session Audit");
    await page.clock.runFor(500);
    await page.locator("#start-new-game-btn").click();
    for (let attempt = 0; attempt < 40; attempt++) {
        const started = await page.evaluate(async () => (await import("./js/core/state.js")).state.hasStarted);
        if (started) break;
        await page.clock.runFor(250);
    }
    await page.clock.runFor(400);

    const initial = await page.evaluate(() => ({
        heading: document.querySelector("#first-session-heading")?.textContent?.trim(),
        count: document.querySelector("#first-session-count")?.textContent?.trim(),
        listHidden: document.querySelector("#first-session-list")?.hidden,
        completeHidden: document.querySelector("#first-session-complete")?.hidden,
        steps: document.querySelectorAll("#first-session-list .first-session-step").length
    }));
    assert.equal(initial.heading, "FIRST SESSION");
    assert.equal(initial.count, "1 / 5");
    assert.equal(initial.listHidden, false);
    assert.equal(initial.completeHidden, true);
    assert.equal(initial.steps, 5);

    const completed = await page.evaluate(async () => {
        const [{ state }, { renderUI }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        state.statistics.totalHousesBuilt = 1;
        state.statistics.totalRoadTilesBuilt = 1;
        state.statistics.totalCardsDrawn = 1;
        state.ambitions.completed["full-larder"] = state.tick || 1;
        const agendaTick = state.tick || 1;
        state.ambitions.era = {
            id: "common-weal",
            chosenTick: agendaTick,
            chosenYear: state.year || 1,
            agenda: {
                stage: 1,
                baseline: 100,
                target: 104,
                bestValue: 101,
                startedTick: agendaTick,
                startedYear: state.year || 1,
                completed: [{ id: "common-granary", title: "The Common Granary", tick: agendaTick, year: state.year || 1 }],
                modifiers: { foodDemandFactor: 0.97, taxEfficiency: 1, tradeFactor: 1, migrationFactor: 1, unrestFactor: 1, legitimacyYear: 0 },
                complete: false
            }
        };
        renderUI();
        return {
            heading: document.querySelector("#first-session-heading")?.textContent?.trim(),
            count: document.querySelector("#first-session-count")?.textContent?.trim(),
            listHidden: document.querySelector("#first-session-list")?.hidden,
            listVisible: Boolean(document.querySelector("#first-session-list")?.offsetParent),
            completeHidden: document.querySelector("#first-session-complete")?.hidden,
            completeVisible: Boolean(document.querySelector("#first-session-complete")?.offsetParent),
            completeText: document.querySelector("#first-session-complete")?.textContent?.trim(),
            completedClass: document.querySelector("#first-session-section")?.classList.contains("is-complete")
        };
    });
    assert.equal(completed.heading, "FIRST SESSION COMPLETE");
    assert.equal(completed.count, "5 / 5");
    assert.equal(completed.completedClass, true);
    assert.equal(completed.listHidden, true);
    assert.equal(completed.listVisible, false);
    assert.equal(completed.completeHidden, false);
    assert.equal(completed.completeVisible, true);
    assert.match(completed.completeText, /All five first steps are complete/);

    // Save through the visible HUD, discard the in-memory realm by reloading,
    // then continue the persisted realm from the real start screen.
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => document.querySelector("#save-status")?.textContent?.startsWith("LAST SAVED"), null, { timeout: 10000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled && (button.textContent || "").includes("CONTINUE"));
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed") || message.includes("No valid saved realm");
    }, null, { timeout: 15000 });
    const loadStatus = (await page.locator("#status-message").textContent() || "").trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the saved 5/5 realm must load; actual status: " + loadStatus);
    await page.locator("#first-session-complete").waitFor({ state: "visible", timeout: 5000 });
    const afterLoad = await page.evaluate(async () => ({
        heading: document.querySelector("#first-session-heading")?.textContent?.trim(),
        count: document.querySelector("#first-session-count")?.textContent?.trim(),
        listHidden: document.querySelector("#first-session-list")?.hidden,
        listVisible: Boolean(document.querySelector("#first-session-list")?.offsetParent),
        completeHidden: document.querySelector("#first-session-complete")?.hidden,
        completeVisible: Boolean(document.querySelector("#first-session-complete")?.offsetParent),
        completeText: document.querySelector("#first-session-complete")?.textContent?.trim(),
        completedClass: document.querySelector("#first-session-section")?.classList.contains("is-complete"),
        stats: await import("./js/core/state.js").then(module => ({
            housesBuilt: module.state.statistics.totalHousesBuilt,
            roadTilesBuilt: module.state.statistics.totalRoadTilesBuilt,
            cardsDrawn: module.state.statistics.totalCardsDrawn
        })),
        agenda: await import("./js/systems/ambitions.js").then(module => {
            const agenda = module.getCrownEraSnapshot()?.agenda;
            return {
                stage: agenda?.stage ?? null,
                completed: agenda?.completed?.map(entry => entry.id) ?? [],
                foodDemandFactor: agenda?.modifiers?.foodDemandFactor ?? null
            };
        })
    }));
    assert.equal(afterLoad.heading, "FIRST SESSION COMPLETE");
    assert.equal(afterLoad.count, "5 / 5");
    assert.equal(afterLoad.completedClass, true);
    assert.equal(afterLoad.listHidden, true);
    assert.equal(afterLoad.listVisible, false);
    assert.equal(afterLoad.completeHidden, false);
    assert.equal(afterLoad.completeVisible, true);
    assert.match(afterLoad.completeText, /All five first steps are complete/);
    assert.deepEqual(afterLoad.stats, { housesBuilt: 1, roadTilesBuilt: 1, cardsDrawn: 1 });
    assert.deepEqual(afterLoad.agenda, { stage: 1, completed: ["common-granary"], foodDemandFactor: 0.97 });

    // Export through the visible settings control, reload to discard memory,
    // then import the downloaded file from the start-screen settings dialog.
    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.locator("#export-save-btn").click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    assert.ok(exportPath, "the export action must produce a readable save file");
    const exportPayload = JSON.parse(await readFile(exportPath, "utf8"));
    await page.locator("#settings-close").click();
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.locator("#start-settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#import-save-input").setInputFiles(exportPath);
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Realm imported") || message.includes("Import failed");
    }, null, { timeout: 15000 });
    const importStatus = (await page.locator("#status-message").textContent() || "").trim();
    assert.ok(importStatus.includes("Realm imported"), "the exported 5/5 realm must import; actual status: " + importStatus);
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 5000 });
    await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });
    await page.locator("#first-session-complete").waitFor({ state: "visible", timeout: 5000 });
    const afterImport = await page.evaluate(async () => ({
        heading: document.querySelector("#first-session-heading")?.textContent?.trim(),
        count: document.querySelector("#first-session-count")?.textContent?.trim(),
        listHidden: document.querySelector("#first-session-list")?.hidden,
        listVisible: Boolean(document.querySelector("#first-session-list")?.offsetParent),
        completeHidden: document.querySelector("#first-session-complete")?.hidden,
        completeVisible: Boolean(document.querySelector("#first-session-complete")?.offsetParent),
        completeText: document.querySelector("#first-session-complete")?.textContent?.trim(),
        completedClass: document.querySelector("#first-session-section")?.classList.contains("is-complete"),
        stats: await import("./js/core/state.js").then(module => ({
            housesBuilt: module.state.statistics.totalHousesBuilt,
            roadTilesBuilt: module.state.statistics.totalRoadTilesBuilt,
            cardsDrawn: module.state.statistics.totalCardsDrawn
        })),
        agenda: await import("./js/systems/ambitions.js").then(module => {
            const agenda = module.getCrownEraSnapshot()?.agenda;
            return {
                stage: agenda?.stage ?? null,
                completed: agenda?.completed?.map(entry => entry.id) ?? [],
                foodDemandFactor: agenda?.modifiers?.foodDemandFactor ?? null
            };
        })
    }));
    assert.equal(afterImport.heading, "FIRST SESSION COMPLETE");
    assert.equal(afterImport.count, "5 / 5");
    assert.equal(afterImport.completedClass, true);
    assert.equal(afterImport.listHidden, true);
    assert.equal(afterImport.listVisible, false);
    assert.equal(afterImport.completeHidden, false);
    assert.equal(afterImport.completeVisible, true);
    assert.match(afterImport.completeText, /All five first steps are complete/);
    assert.deepEqual(afterImport.stats, { housesBuilt: 1, roadTilesBuilt: 1, cardsDrawn: 1 });
    assert.deepEqual(afterImport.agenda, { stage: 1, completed: ["common-granary"], foodDemandFactor: 0.97 });

    // A backup with the active profile id must remain importable while a realm
    // is already running. Change every checked value so success is observable.
    const runningBackup = JSON.parse(JSON.stringify(exportPayload));
    runningBackup.snapshot.tick = 7;
    runningBackup.snapshot.resources = { wood: 321, stone: 222, gold: 111, food: 99 };
    runningBackup.snapshot.statistics = {
        ...runningBackup.snapshot.statistics,
        totalTrades: 4,
        totalBuildingsBuilt: 3,
        totalHousesBuilt: 2,
        totalRoadTilesBuilt: 2,
        totalCardsDrawn: 2
    };
    runningBackup.snapshot.ambitions = {
        ...runningBackup.snapshot.ambitions,
        completed: { ...runningBackup.snapshot.ambitions.completed, "full-larder": 9 }
    };
    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#import-save-input").setInputFiles({
        name: "same-profile-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(runningBackup))
    });
    await page.waitForFunction(async expected => {
        const { state } = await import("./js/core/state.js");
        return state.tick === expected.tick && state.activeProfileId === expected.profileId;
    }, { tick: runningBackup.snapshot.tick, profileId: runningBackup.profileId }, { timeout: 15000 });
    const sameProfileStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(sameProfileStatus.includes("Realm imported"), "same-profile backup import must succeed; actual status: " + sameProfileStatus);
    await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });
    const afterSameProfileImport = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            tick: state.tick,
            resources: JSON.parse(JSON.stringify(state.resources)),
            statistics: JSON.parse(JSON.stringify(state.statistics)),
            ambitions: JSON.parse(JSON.stringify(state.ambitions.completed)),
            agendaStage: state.ambitions.era?.agenda?.stage ?? null,
            agendaFoodDemandFactor: state.ambitions.era?.agenda?.modifiers?.foodDemandFactor ?? null,
            activeProfileId: state.activeProfileId
        };
    });
    assert.equal(afterSameProfileImport.tick, runningBackup.snapshot.tick);
    assert.deepEqual(afterSameProfileImport.resources, runningBackup.snapshot.resources);
    assert.deepEqual(afterSameProfileImport.statistics, runningBackup.snapshot.statistics);
    assert.deepEqual(afterSameProfileImport.ambitions, runningBackup.snapshot.ambitions.completed);
    assert.equal(afterSameProfileImport.agendaStage, 1);
    assert.equal(afterSameProfileImport.agendaFoodDemandFactor, 0.97);
    assert.equal(afterSameProfileImport.activeProfileId, runningBackup.profileId);

    // loadSnapshotIntoGame resets the pause flag; pause again before comparing
    // rejected imports against an exact tick.
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.isPaused === true;
    }, null, { timeout: 5000 });

    // A corrupt file and a valid file from another profile must both fail
    // without changing the active realm or its local save.
    const guardBaseline = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const saveKey = Object.keys(localStorage).find(key => key.startsWith("kings-and-cards:save:v") && key.endsWith(":" + state.activeProfileId));
        return {
            tick: state.tick,
            resources: JSON.stringify(state.resources),
            statistics: JSON.stringify(state.statistics),
            ambitions: JSON.stringify(state.ambitions),
            activeProfileId: state.activeProfileId,
            saveRaw: saveKey ? localStorage.getItem(saveKey) : null,
            checklist: {
                heading: document.querySelector("#first-session-heading")?.textContent?.trim(),
                count: document.querySelector("#first-session-count")?.textContent?.trim(),
                listHidden: document.querySelector("#first-session-list")?.hidden,
                completeVisible: Boolean(document.querySelector("#first-session-complete")?.offsetParent)
            }
        };
    });
    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#import-save-input").setInputFiles({
        name: "corrupt-save.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ version: 1, profileId: guardBaseline.activeProfileId, snapshot: null }))
    });
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Import failed"), null, { timeout: 10000 });
    const corruptStatus = await page.locator("#status-message").innerText();
    assert.match(corruptStatus, /Import failed/);
    const afterCorrupt = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return { tick: state.tick, resources: JSON.stringify(state.resources), statistics: JSON.stringify(state.statistics) };
    });
    assert.deepEqual(afterCorrupt, { tick: guardBaseline.tick, resources: guardBaseline.resources, statistics: guardBaseline.statistics });

    await page.locator("#import-save-input").setInputFiles({
        name: "foreign-save.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ ...exportPayload, profileId: "foreign-profile", profileName: "Other Keeper" }))
    });
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("different local profile"), null, { timeout: 10000 });
    const foreignStatus = await page.locator("#status-message").innerText();
    assert.match(foreignStatus, /Import failed: This save belongs to a different local profile\. The current realm was not changed\./);
    const afterRejectedImports = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const saveKey = Object.keys(localStorage).find(key => key.startsWith("kings-and-cards:save:v") && key.endsWith(":" + state.activeProfileId));
        return {
            tick: state.tick,
            resources: JSON.stringify(state.resources),
            statistics: JSON.stringify(state.statistics),
            ambitions: JSON.stringify(state.ambitions),
            activeProfileId: state.activeProfileId,
            saveRaw: saveKey ? localStorage.getItem(saveKey) : null,
            checklist: {
                heading: document.querySelector("#first-session-heading")?.textContent?.trim(),
                count: document.querySelector("#first-session-count")?.textContent?.trim(),
                listHidden: document.querySelector("#first-session-list")?.hidden,
                completeVisible: Boolean(document.querySelector("#first-session-complete")?.offsetParent)
            }
        };
    });
    assert.deepEqual(afterRejectedImports, guardBaseline);

    // A fresh browser profile has no local profile and no running realm. A
    // valid export must restore the realm values and its original profile id.
    await page.locator("#settings-close").click();
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    const freshBefore = await page.evaluate(async () => {
        const [{ state }, { getActiveProfile, listLocalProfiles }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/persistence.js")
        ]);
        return {
            hasStarted: state.hasStarted,
            activeProfileId: state.activeProfileId,
            profiles: listLocalProfiles().map(profile => profile.id),
            activeProfile: getActiveProfile()?.id ?? null
        };
    });
    assert.equal(freshBefore.hasStarted, false);
    assert.equal(freshBefore.activeProfileId, null);
    assert.deepEqual(freshBefore.profiles, []);
    assert.equal(freshBefore.activeProfile, null);
    await page.locator("#start-settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#import-save-input").setInputFiles({
        name: "fresh-profile-save.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(exportPayload))
    });
    await page.waitForFunction(async expected => {
        const { state } = await import("./js/core/state.js");
        return state.hasStarted && state.tick === expected.tick && state.activeProfileId === expected.profileId;
    }, { tick: exportPayload.snapshot.tick, profileId: exportPayload.profileId }, { timeout: 15000 });
    const freshImportStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(freshImportStatus.includes("Realm imported"), "fresh-profile import must succeed; actual status: " + freshImportStatus);
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 5000 });
    await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });
    const afterFreshImport = await page.evaluate(async () => {
        const [{ state }, { getActiveProfile, listLocalProfiles, readLocalSave }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/persistence.js")
        ]);
        const save = readLocalSave(state.activeProfileId);
        return {
            tick: state.tick,
            resources: JSON.parse(JSON.stringify(state.resources)),
            statistics: JSON.parse(JSON.stringify(state.statistics)),
            ambitions: JSON.parse(JSON.stringify(state.ambitions.completed)),
            agendaStage: state.ambitions.era?.agenda?.stage ?? null,
            agendaCompleted: state.ambitions.era?.agenda?.completed?.map(entry => entry.id) ?? [],
            agendaFoodDemandFactor: state.ambitions.era?.agenda?.modifiers?.foodDemandFactor ?? null,
            activeProfileId: state.activeProfileId,
            profileName: getActiveProfile()?.displayName ?? null,
            profileIds: listLocalProfiles().map(profile => profile.id),
            saveProfileId: save?.profileId ?? null,
            saveVersion: save?.version ?? null,
            saveTick: save?.snapshot?.tick ?? null
        };
    });
    assert.equal(afterFreshImport.tick, exportPayload.snapshot.tick);
    assert.deepEqual(afterFreshImport.resources, exportPayload.snapshot.resources);
    assert.deepEqual(afterFreshImport.statistics, exportPayload.snapshot.statistics);
    assert.deepEqual(afterFreshImport.ambitions, exportPayload.snapshot.ambitions.completed);
    assert.equal(afterFreshImport.agendaStage, 1);
    assert.deepEqual(afterFreshImport.agendaCompleted, ["common-granary"]);
    assert.equal(afterFreshImport.agendaFoodDemandFactor, 0.97);
    assert.equal(afterFreshImport.activeProfileId, exportPayload.profileId);
    assert.deepEqual(afterFreshImport.profileIds, [exportPayload.profileId]);
    assert.equal(afterFreshImport.profileName, exportPayload.profileName);
    assert.equal(afterFreshImport.saveProfileId, exportPayload.profileId);
    assert.equal(afterFreshImport.saveVersion, 2);
    assert.equal(afterFreshImport.saveTick, exportPayload.snapshot.tick);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    const guardLog = value => ({ ...value, saveRaw: Boolean(value.saveRaw) });
    console.log(JSON.stringify({ ok: true, initial, completed, loadStatus, afterLoad, importStatus, download: download.suggestedFilename(), afterImport, sameProfileStatus, afterSameProfileImport, corruptStatus, foreignStatus, guardBaseline: guardLog(guardBaseline), afterRejectedImports: guardLog(afterRejectedImports), freshBefore, freshImportStatus, afterFreshImport, pageErrors, consoleErrors }, null, 2));
} finally {
    await browser.close();
}
