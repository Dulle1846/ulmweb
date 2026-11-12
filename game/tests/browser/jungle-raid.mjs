// Real-browser jungle raid proof.
//
// Starts the shipped tropical realm through the real start screen, recruits a
// local levy through the production military system, declares a war realm,
// lets updateSimulation launch the production war front, then plays the raid
// through the complete fixed-step simulation. It verifies ambush, supply
// attrition, cover and the local guerrilla bonus against the values actually
// observed in combat, not against a separate combat fixture.
//
// Usage:
//   npm run build:runtime
//   npm run test:jungle-raid
//
// Environment:
//   E2E_CHROMIUM_EXECUTABLE  optional Chromium executable
//   JUNGLE_RAID_SEED         realm seed (default 20261104)
//   JUNGLE_RAID_OUT          output directory (default artifacts/jungle-raid)

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.JUNGLE_RAID_OUT || "artifacts/jungle-raid");
const builtRoot = resolve("artifacts/kings-and-cards-deploy/public");
const seed = Number(process.env.JUNGLE_RAID_SEED || 20261104);
await mkdir(outputDir, { recursive: true });
try {
    await access(resolve(builtRoot, "index.html"));
} catch {
    throw new Error("The compiled runtime bundle is missing. Run `npm run build:runtime` first.");
}

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url || "/", "http://localhost");
        const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).slice(1);
        const file = resolve(builtRoot, relative);
        if (file !== builtRoot && !file.startsWith(builtRoot + sep)) {
            response.writeHead(403, { "content-type": "text/plain" });
            response.end("Forbidden");
            return;
        }
        const body = await readFile(file);
        response.writeHead(200, {
            "content-type": mimeTypes[extname(file)] || "application/octet-stream",
            "cache-control": "no-store",
        });
        response.end(body);
    } catch {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
    }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = "http://127.0.0.1:" + server.address().port;

let browser;
const report = {
    ok: false, seed, proof: "real-browser-jungle-war-front",
    generatedAt: new Date().toISOString(),
    environment: { viewport: { width: 720, height: 540 }, softwareGL: true, cpuThrottle: 4 },
    observations: null, failures: [], errors: [],
};
try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
        ...browserLaunchOptions(),
        args: [...(browserLaunchOptions().args || []), "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    });
} catch (error) {
    printBrowserHelp(error);
    throw error;
}
const context = await browser.newContext({ viewport: { width: 720, height: 540 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const client = await context.newCDPSession(page);
await client.send("Emulation.setCPUThrottlingRate", { rate: report.environment.cpuThrottle });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    console.log("[jungle-raid] starting bundled game");
    await page.goto(baseUrl + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Jungle Raid Proof");
    if (await page.locator("#world-climate").count()) await page.locator("#world-climate").selectOption("tropical");
    await page.locator("#world-forests").evaluate(element => {
        element.value = "78";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
    await page.waitForTimeout(900);
    const dismiss = page.locator("#realm-event-dismiss");
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    report.environment.bundle = "artifacts/kings-and-cards-deploy/public";
    report.environment.bundleIndexSha256 = createHash("sha256")
        .update(await readFile(resolve(builtRoot, "index.html")))
        .digest("hex");

    console.log("[jungle-raid] tropical realm started; recruiting levy and declaring war");
    const observations = await page.evaluate(async () => {
        const [
            { state }, { TYPE }, { spawnEntity }, { recruitVillager },
            { getJungleTacticsAt }, { isWalkable }, { ensurePersonProfile },
            { updateSimulation }, { addLog },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/systems/military.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/simulation/villagers.js"),
            import("./js/systems/people.js"),
            import("./js/simulation/simulation.js"),
            import("./js/core/event-log.js"),
        ]);

        state.isPaused = true;
        state.gameOver = false;
        state.hasStarted = true;
        state.entities = state.entities.filter(entity => !entity.isEnemy());
        state.pendingPresentationEffects = [];

        // Find a real dense-jungle tile with all four navigation values.
        let dense = null;
        for (let y = 4; y < Number(state.worldH) - 4 && !dense; y++) {
            for (let x = 4; x < Number(state.worldW) - 4; x++) {
                const tactics = getJungleTacticsAt(x + 0.5, y + 0.5);
                if (!tactics) continue;
                if (!(Number(tactics.ambushChance) > 0.25)) continue;
                if (!(Number(tactics.supplyFactor) < 0.72)) continue;
                if (!(Number(tactics.defenceBonus) > 0.1)) continue;
                if (!(Number(tactics.localAdvantage) > 0.1)) continue;
                if (!isWalkable(x + 0.5, y + 0.5)) continue;
                dense = {
                    x, y, tactics: {
                        ambushChance: Number(tactics.ambushChance),
                        supplyFactor: Number(tactics.supplyFactor),
                        defenceBonus: Number(tactics.defenceBonus),
                        guerrillaBonus: Number(tactics.guerrillaBonus),
                        localAdvantage: Number(tactics.localAdvantage),
                        movementFactor: Number(tactics.movementFactor),
                    },
                };
                break;
            }
        }
        if (!dense) throw new Error("No dense jungle tile offered every raid tactic.");

        const keep = state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP);
        if (!keep) throw new Error("The realm has no keep.");
        keep.x = dense.x;
        keep.y = dense.y;
        keep.hp = keep.maxHp = 1200;

        const barracks = spawnEntity(dense.x + 1, dense.y + 1, TYPE.BARRACKS);
        if (!barracks) throw new Error("Could not place the recruiting barracks.");
        state.resources.gold = Math.max(500, Number(state.resources.gold) || 0);
        state.resources.food = Math.max(500, Number(state.resources.food) || 0);

        const levy = [];
        for (let index = 0; index < 6 && levy.length < 6; index++) {
            const villager = spawnEntity(dense.x + 0.15 + index * 0.08, dense.y + 0.15, TYPE.VILLAGER);
            if (!villager) break;
            villager.x = dense.x + 0.5 + (index % 3) * 0.08;
            villager.y = dense.y + 0.5 + Math.floor(index / 3) * 0.08;
            const person = ensurePersonProfile(villager);
            person.ageYears = 27;
            const recruited = recruitVillager(villager.personId || villager.id);
            if (!recruited.ok) throw new Error("Production recruitment failed: " + recruited.reason);
            const guard = recruited.entity;
            guard.x = dense.x + 0.5 + (index % 3) * 0.08;
            guard.y = dense.y + 0.5 + Math.floor(index / 3) * 0.08;
            guard.routineTimer = 999999;
            guard.movePause = 999999;
            guard.anchor = { x: guard.x, y: guard.y };
            guard.home = { ...guard.anchor };
            levy.push({ id: String(guard.id), name: recruited.name, origin: guard.military?.origin, hp: guard.hp, x: guard.x, y: guard.y });
        }
        if (levy.length < 4) throw new Error("Too few local levies could be recruited: " + levy.length);
        const guards = state.entities.filter(entity => !entity.dead && entity.type === TYPE.GUARD);
        // The opening garrison is far away and would otherwise consume barracks
        // capacity; it also proves the raid defenders are the recruited levy.
        for (const guard of guards) {
            if (!levy.some(entry => entry.id === String(guard.id))) guard.dead = true;
        }

        state.year = 2;
        state.dayOfYear = 10;
        state.tick = 0;
        state.morale = 80;
        state.eventLog = [];
        state.totalRaidsSurvived = 0;
        state.raidActive = false;
        state.military.lastMusterYear = 2;
        state.military.lastWarRaidYear = 0;
        state.diplomacy = state.diplomacy && typeof state.diplomacy === "object" ? state.diplomacy : { realms: [] };
        state.diplomacy.realms = [{
            id: "jungle-raid-war", name: "THE JUNGLE MARCHES", treaty: "war",
            relation: -80, power: 50, aggression: 0.8,
        }];
        addLog("RAID READY", "#a3e635", "military");

        const enemySnapshot = () => state.entities
            .filter(entity => !entity.dead && entity.isEnemy())
            .map(entity => ({
                id: String(entity.id), type: entity.type, hp: Number(entity.hp) || 0,
                x: Number(entity.x) || 0, y: Number(entity.y) || 0,
                tactics: getJungleTacticsAt(entity.x, entity.y) ? {
                    ambushChance: Number(getJungleTacticsAt(entity.x, entity.y).ambushChance),
                    supplyFactor: Number(getJungleTacticsAt(entity.x, entity.y).supplyFactor),
                } : null,
            }));
        const defenderSnapshot = () => state.entities
            .filter(entity => !entity.dead && entity.type === TYPE.GUARD && levy.some(entry => entry.id === String(entity.id)))
            .map(entity => ({ id: String(entity.id), hp: Number(entity.hp) || 0, x: entity.x, y: entity.y }));

        const events = [];
        const timeline = [];
        let launched = null;
        let completed = null;
        let maxTicks = 900;
        state.isPaused = false;
        let previousEnemies = [];
        let previousDefenders = [];
        for (let step = 0; step < maxTicks; step++) {
            state.isPaused = false;
            state.pendingPresentationEffects = [];
            updateSimulation();
            state.isPaused = true;
            const allEffects = (state.pendingPresentationEffects || [])
                .map(effect => ({ type: String(effect?.type), text: effect?.text == null ? null : String(effect.text), color: effect?.color || null, x: Number(effect?.x), y: Number(effect?.y) }));
            const effects = allEffects.filter(effect => effect.type === "floater");
            const enemies = enemySnapshot();
            const defenders = defenderSnapshot();
            const logEntries = state.eventLog
                .filter(entry => Number(entry.tick) === Number(state.tick))
                .map(entry => String(entry.text));
            if (!launched && state.raidActive) {
                launched = {
                    tick: state.tick, dayOfYear: state.dayOfYear, year: state.year,
                    enemies: enemies.map(enemy => ({ ...enemy })),
                    defenders: defenders.map(defender => ({ ...defender })),
                    log: state.eventLog.filter(entry => /WAR FRONT/i.test(entry.text || "")).map(entry => entry.text),
                };
            }
            const damageToDefenders = defenders.map(defender => {
                const before = previousDefenders.find(entry => entry.id === defender.id);
                return before ? { id: defender.id, damage: before.hp - defender.hp, hp: defender.hp } : null;
            }).filter(entry => entry && entry.damage > 0);
            const damageToEnemies = enemies.map(enemy => {
                const before = previousEnemies.find(entry => entry.id === enemy.id);
                return before ? { id: enemy.id, damage: before.hp - enemy.hp, hp: enemy.hp } : null;
            }).filter(entry => entry && entry.damage > 0);
            const tactical = effects.length || damageToDefenders.length || damageToEnemies.length || logEntries.length;
            if (tactical) {
                timeline.push({
                    step, tick: state.tick, dayOfYear: state.dayOfYear,
                    effects, allEffects, damageToDefenders, damageToEnemies,
                    enemies: enemies.length, defenders: defenders.length,
                    enemyDetails: enemies.map(enemy => ({
                        ...enemy,
                        nearestDefender: defenders.reduce((best, defender) => {
                            const distance = Math.hypot(defender.x - enemy.x, defender.y - enemy.y);
                            return !best || distance < best.distance ? { id: defender.id, distance } : best;
                        }, null),
                    })),
                    defenderDetails: defenders.map(defender => ({
                        ...defender,
                        enemiesWithinMelee: enemies.filter(enemy =>
                            Math.hypot(enemy.x - defender.x, enemy.y - defender.y) <= 1.8).map(enemy => enemy.id),
                    })),
                    log: logEntries,
                });
                if (effects.length) events.push({ step, tick: state.tick, effects });
            }
            previousEnemies = enemies;
            previousDefenders = defenders;
            if (launched && !state.raidActive) {
                completed = {
                    step, tick: state.tick, dayOfYear: state.dayOfYear, year: state.year,
                    totalRaidsSurvived: state.totalRaidsSurvived,
                    log: state.eventLog.filter(entry => /RAID DEFEATED|WAR FRONT/i.test(entry.text || "")).map(entry => entry.text),
                    survivingDefenders: defenders,
                };
                break;
            }
            if (state.gameOver) break;
        }
        state.isPaused = true;
        const [
            { getRaidDamageMultiplier }, { getCourtModifiers },
            { getSoldierArmor }, { getSoldierPower },
        ] = await Promise.all([
            import("./js/systems/rooms.js"),
            import("./js/systems/court.js"),
            import("./js/systems/military.js"),
            import("./js/systems/military.js"),
        ]);
        const survivingGuards = state.entities.filter(entity => !entity.dead && entity.type === TYPE.GUARD
            && levy.some(entry => entry.id === String(entity.id)));
        const readiness = Math.max(1, Math.min(1.25, Number(getCourtModifiers().militaryReadiness) || 1));
        const raidMultiplier = getRaidDamageMultiplier();
        const combatMath = survivingGuards.map(guard => {
            const armor = getSoldierArmor(guard);
            const cover = getJungleTacticsAt(guard.x, guard.y);
            const local = Boolean(guard.military?.origin === "levy");
            const coverMultiplier = cover
                ? 1 - Math.min(.32, (Number(cover.defenceBonus) || 0) * .35 + (local ? (Number(cover.localAdvantage) || 0) * .08 : 0))
                : 1;
            const rawIncoming = 32 * raidMultiplier / readiness * (1 - armor);
            const power = getSoldierPower(guard);
            const junglePower = cover
                ? 1 + Math.min(.38, (Number(cover.guerrillaBonus) || 0) * .3 + (local ? (Number(cover.localAdvantage) || 0) * .12 : 0))
                : 1;
            return {
                id: String(guard.id), origin: guard.military?.origin, armor,
                coverMultiplier, rawIncoming: Math.round(rawIncoming),
                coveredIncoming: Math.max(1, Math.round(rawIncoming * coverMultiplier)),
                power, baselineOutgoing: Math.max(1, Math.round(power * readiness)),
                boostedOutgoing: Math.max(1, Math.round(power * readiness * junglePower)),
                junglePower, cover: cover ? {
                    defenceBonus: Number(cover.defenceBonus), localAdvantage: Number(cover.localAdvantage),
                    guerrillaBonus: Number(cover.guerrillaBonus),
                } : null,
            };
        });
        const reset = {
            warFrontLog: state.eventLog.filter(entry => /WAR FRONT/i.test(entry.text || "")).map(entry => entry.text),
            raidLog: state.eventLog.filter(entry => /RAID|AMBUSH|SUPPLY/i.test(entry.text || "")).map(entry => entry.text),
        };
        return {
            dense,
            keep: { id: String(keep.id), x: keep.x, y: keep.y, hp: keep.hp, maxHp: keep.maxHp },
            levy,
            launched,
            completed,
            gameOver: state.gameOver,
            raidActive: state.raidActive,
            tick: state.tick,
            year: state.year,
            dayOfYear: state.dayOfYear,
            totalRaidsSurvived: state.totalRaidsSurvived,
            enemies: enemySnapshot(),
            defenders: defenderSnapshot(),
            eventLog: state.eventLog.slice(0, 30).map(entry => ({ text: entry.text, kind: entry.kind })),
            effects: events,
            timeline,
            warFrontLog: reset.warFrontLog,
            raidLog: reset.raidLog,
            keepAfter: { hp: keep.hp, maxHp: keep.maxHp },
            combatMath: { readiness, raidMultiplier, guards: combatMath },
        };
    });

    report.observations = observations;
    report.pageErrors = pageErrors;
    report.consoleErrors = consoleErrors;

    const failures = report.failures;
    const fail = message => failures.push(message);
    const floater = step => (step.effects || []).map(effect => String(effect.text));
    const redParticleCount = step => (step.allEffects || []).filter(effect =>
        effect.type === "particle" && effect.color === "#f43f5e").length;

    if (!observations.launched) fail("the production war front never launched a raid");
    if (!observations.completed) fail("the raid never resolved through updateSimulation");
    if (observations.raidActive) fail("raidActive is still true after the raid loop");
    if (observations.gameOver) fail("the realm fell during the raid");
    if (observations.enemies.length) fail("raiders remain after the raid was reported complete");
    if (observations.keepAfter.hp <= 0) fail("the keep was destroyed");
    if (!observations.warFrontLog.some(text => /WAR FRONT/i.test(text))) fail("the WAR FRONT log entry is missing");
    if (!observations.completed || observations.completed.totalRaidsSurvived < 1) fail("totalRaidsSurvived did not increment");
    if (observations.levy.length < 4) fail("fewer than four local levies were recruited through recruitVillager");
    if (observations.levy.some(entry => entry.origin !== "levy")) fail("a raid defender was not a production levy");
    if (!(observations.dense.tactics.ambushChance > 0.25
        && observations.dense.tactics.supplyFactor < 0.72
        && observations.dense.tactics.defenceBonus > 0
        && observations.dense.tactics.guerrillaBonus > 0
        && observations.dense.tactics.localAdvantage > 0)) {
        fail("the selected raid tile does not expose all four jungle tactics");
    }

    const ambushStep = observations.timeline.find(step =>
        floater(step).includes("AMBUSH") && step.damageToEnemies.length > 0);
    const supplyStep = observations.timeline.find(step =>
        floater(step).includes("SUPPLY") && step.damageToEnemies.length > 0);
    const trapStep = observations.timeline.find(step =>
        floater(step).includes("TRAP") && step.damageToEnemies.length > 0);
    if (!ambushStep) fail("AMBUSH never produced visible damage during the real raid");
    if (!supplyStep) fail("SUPPLY attrition never produced visible damage during the real raid");
    if (!trapStep) fail("the raid never exercised the now-visible trap damage");

    // A guard must close to melee. Environmental trap (22), ambush (<=14) and
    // supply (1) are the only legitimate damage sources outside 1.8 tiles.
    const maxUnengagedEnemyDamage = Math.max(0, ...observations.timeline
        .filter(step => !step.defenderDetails.some(defender => defender.enemiesWithinMelee.length))
        .flatMap(step => step.damageToEnemies.map(hit => hit.damage)));
    if (maxUnengagedEnemyDamage > 37) {
        fail("defenders dealt more than environmental damage outside melee range: " + maxUnengagedEnemyDamage);
    }

    const coverCandidates = observations.timeline.flatMap(step => {
        const particles = redParticleCount(step);
        if (!particles) return [];
        return step.damageToDefenders.map(hit => ({ ...hit, tick: step.tick, particles, enemies: step.enemies }));
    });
    const coverHit = coverCandidates.find(hit => hit.enemies === 1) || coverCandidates.at(-1);
    const coverMath = coverHit && observations.combatMath.guards.find(guard => guard.id === coverHit.id);
    const coverPerHit = coverHit ? coverHit.damage / Math.max(1, coverHit.particles) : null;
    if (!coverHit || !coverMath) {
        fail("a raider never reached cover and damaged a levy in melee");
    } else {
        if (!(coverMath.coveredIncoming < coverMath.rawIncoming)) fail("the cover multiplier is not reducing incoming damage");
        if (coverPerHit !== coverMath.coveredIncoming) {
            fail("observed cover damage " + coverPerHit + " does not match the production cover calculation " + coverMath.coveredIncoming);
        }
    }

    const boostedOutgoing = Math.max(0, ...observations.combatMath.guards.map(guard => guard.boostedOutgoing));
    const baselineOutgoing = Math.max(0, ...observations.combatMath.guards.map(guard => guard.baselineOutgoing));
    const cleanOutgoing = observations.timeline
        .filter(step => step.effects.length === 0)
        .flatMap(step => step.damageToEnemies.map(hit => ({ ...hit, tick: step.tick })));
    // Two or more levies can strike the same raider on the same tick. The
    // snapshot records the enemy's HP delta, so a clean 48 is two 24-damage
    // guerrilla hits, not a different combat result. Accept exact multiples
    // while still rejecting any hit that does not contain the boosted value.
    const guerrillaHit = cleanOutgoing.find(hit => hit.damage === boostedOutgoing
        || (hit.damage > boostedOutgoing && hit.damage % boostedOutgoing === 0));
    if (!(boostedOutgoing > baselineOutgoing)) fail("the jungle guerrilla multiplier does not exceed baseline damage");
    if (!guerrillaHit) fail("no clean levy damage matched the boosted guerrilla damage " + boostedOutgoing);

    const summary = {
        denseTile: observations.dense,
        warFront: observations.launched ? {
            tick: observations.launched.tick, log: observations.launched.log,
            raiders: observations.launched.enemies.map(enemy => ({ id: enemy.id, hp: enemy.hp, tacticsAtSpawn: enemy.tactics })),
        } : null,
        raidResolved: observations.completed ? {
            tick: observations.completed.tick, totalRaidsSurvived: observations.completed.totalRaidsSurvived,
            log: observations.completed.log,
        } : null,
        ambush: ambushStep ? { tick: ambushStep.tick, damage: ambushStep.damageToEnemies.map(hit => hit.damage) } : null,
        supply: supplyStep ? { tick: supplyStep.tick, damage: supplyStep.damageToEnemies.map(hit => hit.damage) } : null,
        trap: trapStep ? { tick: trapStep.tick, damage: trapStep.damageToEnemies.map(hit => hit.damage) } : null,
        cover: coverMath ? {
            tick: coverHit.tick, rawIncoming: coverMath.rawIncoming,
            coveredIncoming: coverMath.coveredIncoming, observedPerHit: coverPerHit,
            coverMultiplier: coverMath.coverMultiplier, tactics: coverMath.cover,
        } : null,
        guerrilla: guerrillaHit ? {
            tick: guerrillaHit.tick, baselineOutgoing, boostedOutgoing,
            observedDamage: guerrillaHit.damage, junglePower: observations.combatMath.guards[0]?.junglePower,
            tactics: observations.combatMath.guards[0]?.cover,
        } : null,
        maxUnengagedEnemyDamage,
        survivingLevies: observations.defenders.map(defender => ({ id: defender.id, hp: defender.hp })),
        errors: { page: pageErrors, console: consoleErrors },
    };
    report.summary = summary;

    console.log("[jungle-raid] dense tile " + observations.dense.x + "," + observations.dense.y
        + " · " + JSON.stringify(observations.dense.tactics));
    console.log("[jungle-raid] WAR FRONT at tick " + (observations.launched?.tick ?? "-")
        + " · " + (observations.launched?.enemies.length ?? 0) + " raiders");
    console.log("[jungle-raid] raid resolved at tick " + (observations.completed?.tick ?? "-")
        + " · survived " + observations.totalRaidsSurvived + " · keep " + observations.keepAfter.hp);
    console.log("[jungle-raid] ambush " + JSON.stringify(summary.ambush)
        + " · supply " + JSON.stringify(summary.supply)
        + " · trap " + JSON.stringify(summary.trap));
    console.log("[jungle-raid] cover " + JSON.stringify(summary.cover));
    console.log("[jungle-raid] guerrilla " + JSON.stringify(summary.guerrilla));
    console.log("[jungle-raid] max enemy damage outside melee " + maxUnengagedEnemyDamage);
    if (!observations.launched?.enemies.length) fail("the war front spawned no raiders");
    if (pageErrors.length) fail("page errors: " + pageErrors.join(" | "));
    if (consoleErrors.length) fail("console errors: " + consoleErrors.join(" | "));
    report.ok = failures.length === 0;
    if (failures.length) console.error("[jungle-raid] FAILED\n" + failures.join("\n"));
    else console.log("[jungle-raid] PASS — real war-front raid exercised all four jungle tactics");
} catch (error) {
    report.errors.push(String(error?.stack || error));
    console.error(error);
} finally {
    await writeFile(resolve(outputDir, "jungle-raid.json"), JSON.stringify(report, null, 2) + "\n");
    await browser.close().catch(() => {});
    await new Promise(resolveClose => server.close(resolveClose));
}
if (!report.ok) process.exitCode = 1;
