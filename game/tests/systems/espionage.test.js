import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Entity, TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import {
    AGENT_LIMIT, AGENT_RECRUIT_COST, AGENT_WAGE, SCREEN_COST, WARN_HOUSE_COST, CONCESSION_COST,
    FALSE_TRAIL_COST, FALSE_TRAIL_BONUS, assignAgent, demandConcession, dismissAgent,
    getEspionageEffects, getEspionageMarketTerms, getEspionageSnapshot,
    getEspionageWarModifiers, normalizeEspionageState, plantFalseTrail, recruitAgent,
    screenCourt, updateEspionage, warnHouse
} from "../../js/systems/espionage.js";

function resident(index, skills = { learning: 70, trade: 60, command: 50 }) {
    const entity = new Entity(index, 1, TYPE.VILLAGER);
    entity.id = "entity-" + index;
    entity.person = {
        id: "person-" + index,
        name: "Resident " + index,
        ageYears: 30,
        lifeStage: "adult",
        skills: { ...skills }
    };
    return entity;
}

function setup({ gold = 300, count = 7, houseLoyalty = 24 } = {}) {
    resetState();
    state.hasStarted = true;
    state.year = 2;
    state.tick = 100;
    state.resources.gold = gold;
    state.entities = Array.from({ length: count }, (_, index) => resident(index + 1));
    state.diplomacy = {
        realms: [{ id: "northmere", name: "Northmere Guild", treaty: "none", relation: 55, trust: 50, fear: 20 }]
    };
    state.nobility = {
        version: 1,
        houses: [{ id: "house-vane", familyName: "Vane", loyalty: houseLoyalty, members: ["person-1"] }],
        feuds: [],
        history: []
    };
    state.market = {
        partners: [{ id: "northmere", name: "Northmere Guild", treasury: 120, stock: { food: 30, wood: 20, stone: 20 } }]
    };
    return state;
}

function recruit(personId = "person-1") {
    const result = recruitAgent(personId);
    assert.equal(result.ok, true, result.reason);
    return result.agent;
}

test("recruiting a resident spends gold, records guile and respects the roster limit", () => {
    setup();
    const agent = recruit();
    assert.equal(agent.personId, "person-1");
    assert.equal(agent.name, "Resident 1");
    assert.equal(agent.guile, 60);
    assert.equal(state.resources.gold, 300 - AGENT_RECRUIT_COST.gold);
    assert.equal(getEspionageSnapshot().agentCount, 1);

    const duplicate = recruitAgent("person-1");
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.reason, "that-resident-already-serves");

    for (let index = 2; index <= AGENT_LIMIT; index++) recruit("person-" + index);
    assert.equal(getEspionageSnapshot().agentCount, AGENT_LIMIT);
    const overflow = recruitAgent("person-7");
    assert.equal(overflow.ok, false);
    assert.equal(overflow.reason, "the-whisper-court-is-full");
});

test("a foreign or noble desk requires a real target; market and watch work the realm", () => {
    setup();
    const agent = recruit();
    assert.equal(assignAgent(agent.id, "foreign", "").ok, false);
    assert.equal(assignAgent(agent.id, "foreign", "northmere").ok, true);
    assert.equal(getEspionageSnapshot().agents[0].targetName, "Northmere Guild");

    assert.equal(assignAgent(agent.id, "nobles", "missing-house").ok, false);
    assert.equal(assignAgent(agent.id, "nobles", "house-vane").ok, true);
    assert.equal(getEspionageSnapshot().agents[0].targetName, "Vane");

    assert.equal(assignAgent(agent.id, "market").ok, true);
    assert.equal(getEspionageSnapshot().agents[0].targetLabel, "No target needed");
    assert.equal(assignAgent(agent.id, "nowhere").ok, false);
});

test("the annual audit pays wages, runs one mission per field agent and builds insight", () => {
    setup();
    const agent = recruit();
    assignAgent(agent.id, "foreign", "northmere");
    state.year = 2;
    updateEspionage();
    assert.equal(state.espionage.lastUpdateYear, 2);
    assert.equal(state.espionage.totals.missions, 1);
    assert.equal(state.resources.gold, 300 - AGENT_RECRUIT_COST.gold - AGENT_WAGE);
    assert.ok(state.espionage.suspicion > 0, "a field mission must raise suspicion");

    for (let year = 3; year <= 12 && state.espionage.foreignInsight === 0; year++) {
        state.year = year;
        updateEspionage();
    }
    assert.ok(state.espionage.foreignInsight > 0, "repeated missions must eventually build foreign insight");
    assert.ok(getEspionageEffects().raidDamageFactor < 1);
    assert.ok(getEspionageWarModifiers().raidDamageFactor < 1);
});

test("insight changes real combat and market readings", () => {
    setup();
    state.espionage = normalizeEspionageState({ foreignInsight: 100, marketInsight: 100 });
    const effects = getEspionageEffects();
    assert.equal(effects.raidDamageFactor, 0.82, "full foreign insight must cut raid damage by 18%");
    assert.equal(effects.raidReductionPercent, 18);
    assert.equal(effects.marketBuyFactor, 0.965);
    assert.equal(effects.marketSellFactor, 1.035);
    const terms = getEspionageMarketTerms();
    assert.equal(terms.buyFactor, 0.965);
    assert.equal(terms.sellFactor, 1.035);
});

test("a noble report can expose a plot and return a wavering house to the peace", () => {
    setup({ houseLoyalty: 20 });
    const agent = recruit();
    assignAgent(agent.id, "nobles", "house-vane");
    for (let year = 2; year <= 16 && state.espionage.totals.plotsExposed === 0; year++) {
        state.year = year;
        updateEspionage();
    }
    assert.ok(state.espionage.totals.plotsExposed > 0, "the noble desk must eventually expose a plot");
    assert.ok(state.nobility.houses[0].loyalty > 20, "an exposed plot must raise the house's loyalty");
    assert.ok(state.espionage.nobleInsight > 0);
});

test("the same realm and orders produce the same intelligence audit", () => {
    const run = () => {
        setup();
        const first = recruit("person-1");
        const second = recruit("person-3");
        assignAgent(first.id, "foreign", "northmere");
        assignAgent(second.id, "market");
        state.year = 2;
        updateEspionage();
        return JSON.stringify({ espionage: state.espionage, gold: state.resources.gold });
    };
    const firstRun = run();
    const secondRun = run();
    assert.equal(firstRun, secondRun);
});

test("espionage state survives a save-style normalization round-trip", () => {
    const saved = normalizeEspionageState({
        agents: [{
            id: "agent-2-1", personId: "person-1", name: "Resident 1", guile: 72, loyalty: 55,
            desk: "foreign", targetId: "northmere", targetName: "Northmere Guild",
            joinedYear: 2, missions: 3, successes: 2
        }],
        reports: [{
            year: 4, desk: "market", kind: "success", targetName: "Market contraband",
            detail: "A smuggling ring was uncovered.", gold: 7
        }],
        history: [{
            year: 4, agents: 1, paid: 1, missions: 1, successes: 1, captured: 0,
            seizedGold: 7, suspicion: 12, foreignInsight: 20, marketInsight: 15, nobleInsight: 0
        }],
        suspicion: 12, rivalPressure: 34, foreignInsight: 20, marketInsight: 15, nobleInsight: 4, watchStrength: 6,
        lastUpdateYear: 4, screenedYear: 4, lastScreen: { year: 4, revealed: 1, clean: false },
        plays: { warnHouse: 4, concession: 0, falseTrail: 3 },
        lastPlays: {
            warnHouse: { year: 4, play: "warnHouse", targetId: "house-vane", targetName: "Vane", detail: "Vane loyalty 24 -> 30.", costInsight: WARN_HOUSE_COST },
            falseTrail: { year: 3, play: "falseTrail", targetId: "rival-courts", targetName: "Rival courts", detail: "A false trail cut rival pressure.", costInsight: FALSE_TRAIL_COST }
        },
        missionBonus: FALSE_TRAIL_BONUS, missionBonusYear: 5,
        totals: { recruited: 1, missions: 3, successes: 2, captures: 0, seizedGold: 7, plotsExposed: 1, turned: 1, screened: 1, goldLost: 4, falseReports: 2, plays: 2, insightSpent: 38, goldGained: 17, foodGained: 5 }
    });
    const restored = normalizeEspionageState(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.agents[0].guile, 72);
    assert.equal(restored.agents[0].desk, "foreign");
    assert.equal(restored.agents[0].targetName, "Northmere Guild");
    assert.equal(restored.reports[0].gold, 7);
    assert.equal(restored.history[0].seizedGold, 7);
    assert.equal(restored.foreignInsight, 20);
    assert.equal(restored.rivalPressure, 34);
    assert.equal(restored.totals.plotsExposed, 1);
    assert.equal(restored.totals.turned, 1);
    assert.equal(restored.totals.goldLost, 4);
    assert.equal(restored.lastScreen.revealed, 1);
    assert.equal(restored.screenedYear, 4);
    assert.equal(restored.plays.warnHouse, 4);
    assert.equal(restored.lastPlays.warnHouse.targetName, "Vane");
    assert.equal(restored.lastPlays.falseTrail.costInsight, FALSE_TRAIL_COST);
    assert.equal(restored.missionBonus, FALSE_TRAIL_BONUS);
    assert.equal(restored.totals.insightSpent, 38);
    assert.equal(restored.totals.goldGained, 17);
    assert.equal(restored.agents[0].cover, 70, "a legacy agent without cover normalizes to solid cover");
    assert.equal(restored.lastUpdateYear, 4);
});

test("a legacy save without espionage normalizes to a neutral court", () => {
    const legacy = normalizeEspionageState({});
    assert.deepEqual(legacy.agents, []);
    assert.deepEqual(legacy.reports, []);
    assert.equal(legacy.suspicion, 0);
    assert.equal(legacy.foreignInsight, 0);
    assert.equal(legacy.marketInsight, 0);
    assert.equal(legacy.nobleInsight, 0);
    assert.equal(legacy.lastUpdateYear, 0);
    assert.deepEqual(legacy.plays, { warnHouse: 0, concession: 0, falseTrail: 0 });
    assert.deepEqual(legacy.lastPlays, { warnHouse: null, concession: null, falseTrail: null });
    assert.equal(legacy.missionBonus, 0);
    assert.equal(legacy.missionBonusYear, 0);
});

test("rival pressure can turn an agent, and a turned agent leaks gold instead of insight", () => {
    setup();
    const agent = recruit();
    assignAgent(agent.id, "foreign", "northmere");
    state.diplomacy.realms[0].fear = 100;
    state.espionage.rivalPressure = 80;
    state.espionage.agents[0].loyalty = 10;
    state.espionage.agents[0].cover = 70;
    for (let year = 2; year <= 14 && state.espionage.totals.turned === 0; year++) {
        state.year = year;
        updateEspionage();
    }
    assert.ok(state.espionage.totals.turned > 0, "rival courts must eventually turn a pressured agent");
    assert.ok(state.espionage.lastScreen === null, "turning must not reveal itself as a screening result");

    const goldBefore = state.resources.gold;
    state.year += 1;
    updateEspionage();
    assert.ok(state.espionage.totals.falseReports > 0, "a turned agent must file a false report");
    assert.ok(state.espionage.totals.goldLost > 0, "a turned agent must leak gold");
    assert.ok(state.resources.gold < goldBefore, "the leaked gold must leave the treasury");
    assert.ok(getEspionageSnapshot().agents.every(entry => entry.turned === undefined),
        "the panel must not hand the player the hidden turned flag");
});

test("screening the court unmasks turned agents, costs gold and is limited to once a year", () => {
    setup();
    const agent = recruit();
    state.espionage.agents[0].turned = true;
    state.espionage.agents[0].cover = 15;
    state.espionage.rivalPressure = 60;
    const goldBefore = state.resources.gold;
    const result = screenCourt();
    assert.equal(result.ok, true);
    assert.equal(result.revealed, 1);
    assert.equal(state.resources.gold, goldBefore - SCREEN_COST);
    assert.equal(state.espionage.agents[0].turned, false);
    assert.equal(state.espionage.agents[0].cover, 55);
    assert.equal(state.espionage.lastScreen.revealed, 1);
    assert.equal(state.espionage.lastScreen.clean, false);
    assert.ok(state.espionage.reports.some(report => report.kind === "screened"));

    const again = screenCourt();
    assert.equal(again.ok, false);
    assert.equal(again.reason, "already-screened-this-year");
    state.year += 1;
    assert.equal(screenCourt().ok, true, "a new year must allow a new screening");
    assert.equal(state.espionage.lastScreen.clean, true);
});

test("warning a threatened house spends noble insight, raises loyalty and eases its feud", () => {
    setup();
    state.nobility.houses.push({ id: "house-other", familyName: "Other", loyalty: 60, members: ["person-2"] });
    state.nobility.feuds = [{ id: "feud-1", houses: ["house-vane", "house-other"], status: "active", severity: 2, history: [] }];
    state.espionage = normalizeEspionageState({ nobleInsight: WARN_HOUSE_COST + 5 });

    const result = warnHouse("house-vane");
    assert.equal(result.ok, true, result.reason);
    assert.equal(state.nobility.houses[0].loyalty, 30);
    assert.equal(state.nobility.feuds[0].severity, 1);
    assert.equal(state.espionage.nobleInsight, 5);
    assert.equal(state.espionage.plays.warnHouse, 2);
    assert.equal(state.espionage.lastPlays.warnHouse.targetName, "Vane");
    assert.match(state.espionage.lastPlays.warnHouse.detail, /loyalty 24 -> 30/);
    assert.ok(state.espionage.reports.some(report => report.kind === "play" && report.desk === "nobles"));
    assert.equal(getEspionageSnapshot().canWarn, false, "the play is once per year");

    const again = warnHouse("house-vane");
    assert.equal(again.ok, false);
    assert.equal(again.reason, "already-warned-this-year");
    state.year = 3;
    state.espionage.nobleInsight = WARN_HOUSE_COST;
    assert.equal(warnHouse("house-vane").ok, true, "a new year allows another warning");
});

 test("insight plays refuse to spend when the pool is short and leave the world untouched", () => {
    setup();
    state.espionage = normalizeEspionageState({ nobleInsight: 0, foreignInsight: 0, marketInsight: 0 });
    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    assert.equal(warnHouse("house-vane").reason, "not-enough-noble-insight");
    assert.equal(demandConcession("northmere").reason, "not-enough-foreign-insight");
    assert.equal(plantFalseTrail().reason, "not-enough-market-insight");
    assert.equal(state.nobility.houses[0].loyalty, 24);
    assert.equal(state.market.partners[0].treasury, 120);
    assert.equal(state.resources.gold, goldBefore);
    assert.equal(state.resources.food, foodBefore);
    assert.equal(state.espionage.totals.plays, 0);
});

test("demanding a concession transfers real treasury and stock through the trade partner", () => {
    setup();
    state.espionage = normalizeEspionageState({ foreignInsight: CONCESSION_COST + 10 });
    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    const result = demandConcession("northmere");
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.gold, 17);
    assert.equal(result.food, 5);
    assert.equal(state.resources.gold, goldBefore + 17);
    assert.equal(state.resources.food, foodBefore + 5);
    assert.equal(state.market.partners[0].treasury, 103);
    assert.equal(state.market.partners[0].stock.food, 25);
    assert.equal(state.diplomacy.realms[0].relation, 51);
    assert.equal(state.diplomacy.realms[0].fear, 23);
    assert.equal(state.espionage.foreignInsight, 10);
    assert.equal(state.espionage.totals.goldGained, 17);
    assert.equal(state.espionage.totals.foodGained, 5);
    assert.match(state.espionage.lastPlays.concession.detail, /relation 55 -> 51/);
    assert.equal(demandConcession("northmere").reason, "already-demanded-this-year");
    state.year = 3;
    state.espionage.foreignInsight = CONCESSION_COST;
    assert.equal(demandConcession("northmere").ok, true, "a new year allows another demand");
});

test("a false trail cuts rival pressure and raises the next audit's mission odds once", () => {
    setup();
    const agent = recruit();
    assignAgent(agent.id, "foreign", "northmere");
    state.espionage.marketInsight = FALSE_TRAIL_COST;
    state.espionage.rivalPressure = 50;
    state.espionage.suspicion = 40;
    const before = getEspionageSnapshot().agents[0].successRate;
    const result = plantFalseTrail();
    assert.equal(result.ok, true, result.reason);
    assert.equal(state.espionage.rivalPressure, 32);
    assert.equal(state.espionage.suspicion, 36);
    assert.equal(state.espionage.marketInsight, 0);
    assert.equal(state.espionage.missionBonus, FALSE_TRAIL_BONUS);
    assert.equal(state.espionage.missionBonusYear, 3);
    assert.equal(state.espionage.plays.falseTrail, 2);
    const after = getEspionageSnapshot();
    assert.equal(after.missionBonusActive, true);
    assert.ok(after.agents[0].successRate >= before + 8, "next year's mission odds must visibly improve");
    assert.equal(plantFalseTrail().reason, "already-planted-this-year");

    state.year = 3;
    updateEspionage();
    assert.equal(state.espionage.missionBonus, 0, "the trail bonus is consumed by the next audit");
    assert.equal(state.espionage.missionBonusYear, 0);
});

test("the save, simulation and UI contracts include the Whisper Court", async () => {
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    const ui = await readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8");
    const saveRuntime = (await readFile(new URL("../../js/core/save-runtime.js", import.meta.url), "utf8")).replace(/\s+/g, "");
    const simulation = await readFile(new URL("../../js/simulation/simulation.js", import.meta.url), "utf8");
    const combat = await readFile(new URL("../../js/simulation/combat.js", import.meta.url), "utf8");
    const market = await readFile(new URL("../../js/systems/market.js", import.meta.url), "utf8");
    assert.ok(html.includes('data-command-tab="espionage"'), "the command deck must expose the Whisper Court");
    assert.ok(ui.includes("espionage:espionagePanel") && ui.includes("spy-recruit") && ui.includes("spy-assign"), "the panel and its actions must be wired");
    assert.ok(ui.includes("spy-screen") && ui.includes("COURT SCREENED"), "the counter-intelligence action must be wired");
    assert.ok(ui.includes("spy-warn") && ui.includes("spy-concession") && ui.includes("spy-false-trail"), "all three intelligence plays must be wired");
    assert.ok(ui.includes("ACTIONABLE INTELLIGENCE") && ui.includes("DEMAND A CONCESSION") && ui.includes("PLANT A FALSE TRAIL"), "the panel must expose costs and last results");
    assert.ok(saveRuntime.includes("espionage:JSON.parse") && saveRuntime.includes("state.espionage=normalizeEspionageState"), "saves must persist and normalize the court");
    assert.ok(simulation.includes("updateEspionage()"), "the court must run from the annual simulation");
    assert.ok(combat.includes("getEspionageWarModifiers") && market.includes("getEspionageMarketTerms"), "combat and trade must read the court's insight");
});

test("dismissing an agent removes the post without refunding the recruit cost", () => {
    setup();
    const agent = recruit();
    const goldAfterRecruit = state.resources.gold;
    const result = dismissAgent(agent.id);
    assert.equal(result.ok, true);
    assert.equal(getEspionageSnapshot().agentCount, 0);
    assert.equal(state.resources.gold, goldAfterRecruit);
    assert.equal(dismissAgent("missing").ok, false);
});
