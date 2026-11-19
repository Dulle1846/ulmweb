// The Whisper Court: a small, bounded intelligence service. Agents are real
// adult residents with their own guile and loyalty. Every annual audit pays
// their wages, resolves one mission per agent, and turns the results into
// remembered insight that other systems read: raid warning in combat, better
// market terms, exposed noble plots and a watch that steadies morale.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { random } from "../core/random.js";
import { DIPLOMATIC_REALMS } from "./diplomacy-config.js";

export const ESPIONAGE_VERSION = 1;
export const AGENT_LIMIT = 6;
export const AGENT_RECRUIT_COST = Object.freeze({ gold: 14 });
export const AGENT_WAGE = 3;
export const INSIGHT_LIMIT = 100;
export const REPORT_LIMIT = 14;
export const ESPIONAGE_HISTORY_LIMIT = 12;
export const ESPIONAGE_DESKS = Object.freeze(["foreign", "nobles", "market", "watch", "counter"]);
export const ESPIONAGE_DESK_LABELS = Object.freeze({
    foreign: "FOREIGN COURT",
    nobles: "NOBLE HOUSES",
    market: "MARKET WATCH",
    watch: "CITY WATCH",
    counter: "COUNTER-INTELLIGENCE"
});

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max,
    Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const deskOf = value => ESPIONAGE_DESKS.includes(String(value)) ? String(value) : "";
const personKeyOf = entity => String(entity?.personId || entity?.person?.id || entity?.id || "");
const REALM_NAMES = new Map(DIPLOMATIC_REALMS.map(realm => [String(realm.id), String(realm.name)]));
const realmNameOf = realm => cleanText(realm?.name || REALM_NAMES.get(String(realm?.id)) || realm?.id, 120);

function cleanText(value, limit = 160) {
    return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, limit);
}

export function createEspionageState() {
    return {
        version: ESPIONAGE_VERSION,
        agents: [],
        reports: [],
        history: [],
        suspicion: 0,
        foreignInsight: 0,
        marketInsight: 0,
        nobleInsight: 0,
        watchStrength: 0,
        lastUpdateYear: 0,
        lastAudit: null,
        totals: {
            recruited: 0, dismissed: 0, missions: 0, successes: 0, captures: 0,
            seizedGold: 0, plotsExposed: 0, incidents: 0, wagesPaid: 0
        }
    };
}

function normalizeAgent(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const personId = cleanText(value.personId, 80);
    const name = cleanText(value.name, 80);
    if (!personId || !name) return null;
    return {
        id: cleanText(value.id, 80) || ("agent-" + personId),
        personId,
        name,
        guile: Math.round(clamp(value.guile, 10, 95)),
        loyalty: Math.round(clamp(value.loyalty, 0, 100)),
        desk: deskOf(value.desk),
        targetId: cleanText(value.targetId, 80),
        targetName: cleanText(value.targetName, 120),
        joinedYear: integer(value.joinedYear, 1),
        missions: integer(value.missions, 0, 1000),
        successes: integer(value.successes, 0, 1000),
        lastMissionYear: integer(value.lastMissionYear, 0)
    };
}

function normalizeReport(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
        year: integer(value.year, 1),
        desk: deskOf(value.desk),
        kind: ["success", "failure", "incident", "capture", "wage"].includes(String(value.kind))
            ? String(value.kind) : "success",
        targetId: cleanText(value.targetId, 80),
        targetName: cleanText(value.targetName, 120),
        detail: cleanText(value.detail, 220),
        gold: integer(value.gold, 0, 1_000_000)
    };
}

function normalizeHistory(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
        year: integer(value.year, 1),
        agents: integer(value.agents, 0, AGENT_LIMIT),
        paid: integer(value.paid, 0, AGENT_LIMIT),
        missions: integer(value.missions, 0, AGENT_LIMIT),
        successes: integer(value.successes, 0, AGENT_LIMIT),
        captured: integer(value.captured, 0, AGENT_LIMIT),
        seizedGold: integer(value.seizedGold, 0, 1_000_000),
        suspicion: Math.round(clamp(value.suspicion, 0, 100)),
        foreignInsight: Math.round(clamp(value.foreignInsight, 0, INSIGHT_LIMIT)),
        marketInsight: Math.round(clamp(value.marketInsight, 0, INSIGHT_LIMIT)),
        nobleInsight: Math.round(clamp(value.nobleInsight, 0, INSIGHT_LIMIT))
    };
}

export function normalizeEspionageState(input = state.espionage) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const seen = new Set();
    const agents = (Array.isArray(source.agents) ? source.agents : [])
        .map(normalizeAgent)
        .filter(Boolean)
        .filter(agent => {
            if (seen.has(agent.personId)) return false;
            seen.add(agent.personId);
            return true;
        })
        .slice(0, AGENT_LIMIT);
    const rawTotals = source.totals && typeof source.totals === "object" && !Array.isArray(source.totals)
        ? source.totals : {};
    return {
        version: ESPIONAGE_VERSION,
        agents,
        reports: (Array.isArray(source.reports) ? source.reports : []).map(normalizeReport)
            .filter(Boolean).slice(0, REPORT_LIMIT),
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeHistory)
            .filter(Boolean).slice(0, ESPIONAGE_HISTORY_LIMIT),
        suspicion: Math.round(clamp(source.suspicion, 0, 100)),
        foreignInsight: Math.round(clamp(source.foreignInsight, 0, INSIGHT_LIMIT)),
        marketInsight: Math.round(clamp(source.marketInsight, 0, INSIGHT_LIMIT)),
        nobleInsight: Math.round(clamp(source.nobleInsight, 0, INSIGHT_LIMIT)),
        watchStrength: Math.round(clamp(source.watchStrength, 0, INSIGHT_LIMIT)),
        lastUpdateYear: integer(source.lastUpdateYear, 0),
        lastAudit: normalizeHistory(source.lastAudit),
        totals: {
            recruited: integer(rawTotals.recruited, 0),
            dismissed: integer(rawTotals.dismissed, 0),
            missions: integer(rawTotals.missions, 0),
            successes: integer(rawTotals.successes, 0),
            captures: integer(rawTotals.captures, 0),
            seizedGold: integer(rawTotals.seizedGold, 0),
            plotsExposed: integer(rawTotals.plotsExposed, 0),
            incidents: integer(rawTotals.incidents, 0),
            wagesPaid: integer(rawTotals.wagesPaid, 0)
        }
    };
}

export function validateEspionageState(value) {
    if (value === undefined || value === null) return true;
    if (typeof value !== "object" || Array.isArray(value)) throw new Error("Espionage state must be an object.");
    if (value.version !== undefined && Number(value.version) !== ESPIONAGE_VERSION) {
        throw new Error("Espionage state has an unsupported version.");
    }
    if (value.agents !== undefined) {
        if (!Array.isArray(value.agents) || value.agents.length > AGENT_LIMIT) {
            throw new Error("Espionage agents exceed the supported limit.");
        }
        for (const agent of value.agents) {
            if (!agent || typeof agent !== "object" || Array.isArray(agent) ||
                !cleanText(agent.personId, 80) || !cleanText(agent.name, 80)) {
                throw new Error("Espionage contains an invalid agent record.");
            }
        }
    }
    if (value.reports !== undefined && (!Array.isArray(value.reports) || value.reports.length > REPORT_LIMIT)) {
        throw new Error("Espionage reports exceed the supported limit.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > ESPIONAGE_HISTORY_LIMIT)) {
        throw new Error("Espionage history exceeds the supported limit.");
    }
    for (const key of ["suspicion", "foreignInsight", "marketInsight", "nobleInsight", "watchStrength"]) {
        if (value[key] !== undefined && (!Number.isFinite(Number(value[key])) || Number(value[key]) < 0 || Number(value[key]) > 100)) {
            throw new Error("Espionage " + key + " is invalid.");
        }
    }
    return true;
}

export function ensureEspionage() {
    const current = state.espionage;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== ESPIONAGE_VERSION ||
        !Array.isArray(current.agents)) {
        state.espionage = normalizeEspionageState(current);
    }
    return state.espionage;
}

function adultEntities() {
    return (Array.isArray(state.entities) ? state.entities : []).filter(entity =>
        entity && !entity.dead && entity.person &&
        Number(entity.person.ageYears) >= 16 && entity.person.lifeStage !== "child");
}

function guileOf(entity) {
    const skills = entity?.person?.skills || {};
    const values = [skills.learning, skills.trade, skills.command]
        .map(Number).filter(value => Number.isFinite(value));
    if (!values.length) return 45;
    return Math.round(clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 10, 95));
}

function realmRecords() {
    return (Array.isArray(state.diplomacy?.realms) ? state.diplomacy.realms : [])
        .filter(realm => realm && realm.id);
}

function houseRecords() {
    return (Array.isArray(state.nobility?.houses) ? state.nobility.houses : [])
        .filter(house => house && house.id);
}

function realmView(realm) {
    return {
        id: String(realm.id),
        name: realmNameOf(realm),
        treaty: cleanText(realm.treaty || "none", 20),
        relation: Math.round(Number(realm.relation) || 0),
        trust: Math.round(Number(realm.trust) || 0),
        fear: Math.round(Number(realm.fear) || 0),
        strengthText: cleanText(realm.strength || realm.army || "unknown", 40)
    };
}

function houseView(house) {
    return {
        id: String(house.id),
        familyName: cleanText(house.familyName || house.id, 80),
        loyalty: Math.round(Number(house.loyalty) || 0),
        memberCount: Array.isArray(house.members) ? house.members.length : integer(house.memberCount, 0),
        status: cleanText(house.status || (Number(house.loyalty) < 30 ? "withholding" : "watching"), 24)
    };
}

function missionChance(agent) {
    const espionage = ensureEspionage();
    const difficulty = agent.desk === "foreign" ? 0.06 : agent.desk === "nobles" ? 0.04 : agent.desk === "market" ? 0.02 : 0;
    return clamp(0.30 + (Number(agent.guile) - 50) / 150 - Number(espionage.suspicion) / 300 - difficulty, 0.10, 0.92);
}

export function getEspionageEffects() {
    const espionage = ensureEspionage();
    const foreign = clamp(espionage.foreignInsight, 0, INSIGHT_LIMIT);
    const market = clamp(espionage.marketInsight, 0, INSIGHT_LIMIT);
    return {
        raidDamageFactor: Math.round((1 - Math.min(0.18, foreign * 0.0018)) * 1000) / 1000,
        raidReductionPercent: Math.round(Math.min(0.18, foreign * 0.0018) * 1000) / 10,
        marketBuyFactor: Math.round((1 - Math.min(0.035, market * 0.00035)) * 1000) / 1000,
        marketSellFactor: Math.round((1 + Math.min(0.035, market * 0.00035)) * 1000) / 1000,
        marketTermPercent: Math.round(Math.min(0.035, market * 0.00035) * 1000) / 10,
        incidentRisk: Math.round(clamp(espionage.suspicion, 0, 100))
    };
}

export function getEspionageWarModifiers() {
    const espionage = ensureEspionage();
    return {
        raidDamageFactor: getEspionageEffects().raidDamageFactor,
        foreignInsight: Math.round(clamp(espionage.foreignInsight, 0, INSIGHT_LIMIT))
    };
}

export function getEspionageMarketTerms() {
    const effects = getEspionageEffects();
    return { buyFactor: effects.marketBuyFactor, sellFactor: effects.marketSellFactor };
}

function successRateFor(agent) {
    if (!agent.desk || agent.desk === "counter") return 0;
    return Math.round(missionChance(agent) * 100);
}

export function getEspionageSnapshot() {
    const espionage = ensureEspionage();
    const year = yearNow();
    const assigned = new Set(espionage.agents.map(agent => agent.personId));
    const candidates = adultEntities()
        .filter(entity => !assigned.has(personKeyOf(entity)))
        .map(entity => ({
            personId: personKeyOf(entity),
            name: cleanText(entity.person.name || "Resident", 80),
            job: cleanText(entity.person.job || entity.job || "resident", 40),
            age: Math.floor(Number(entity.person.ageYears) || 0),
            guile: guileOf(entity)
        }))
        .sort((a, b) => b.guile - a.guile || a.name.localeCompare(b.name))
        .slice(0, 48);
    const realms = realmRecords().map(realmView);
    const houses = houseRecords().map(houseView);
    const effects = getEspionageEffects();
    return {
        year,
        capacity: AGENT_LIMIT,
        agentCount: espionage.agents.length,
        agents: espionage.agents.map(agent => ({
            ...agent,
            deskLabel: ESPIONAGE_DESK_LABELS[agent.desk] || "UNASSIGNED",
            targetLabel: agent.targetName || (agent.desk === "foreign" ? "No realm chosen"
                : agent.desk === "nobles" ? "No house chosen" : "No target needed"),
            successRate: successRateFor(agent)
        })),
        candidates,
        realms,
        houses,
        wages: AGENT_WAGE,
        annualWages: espionage.agents.length * AGENT_WAGE,
        recruitCost: { ...AGENT_RECRUIT_COST },
        suspicion: Math.round(clamp(espionage.suspicion, 0, 100)),
        suspicionLabel: espionage.suspicion >= 70 ? "EXPOSED" : espionage.suspicion >= 40 ? "WATCHED" : "QUIET",
        foreignInsight: Math.round(clamp(espionage.foreignInsight, 0, INSIGHT_LIMIT)),
        marketInsight: Math.round(clamp(espionage.marketInsight, 0, INSIGHT_LIMIT)),
        nobleInsight: Math.round(clamp(espionage.nobleInsight, 0, INSIGHT_LIMIT)),
        watchStrength: Math.round(clamp(espionage.watchStrength, 0, INSIGHT_LIMIT)),
        totals: { ...espionage.totals },
        reports: espionage.reports.map(report => ({ ...report })),
        history: espionage.history.map(entry => ({ ...entry })),
        lastAudit: espionage.lastAudit ? { ...espionage.lastAudit } : null,
        lastUpdateYear: espionage.lastUpdateYear,
        effects,
        moraleBonus: Math.round(Math.min(2, espionage.watchStrength * 0.02) * 10) / 10,
        targetCounts: { realms: realms.length, houses: houses.length }
    };
}

function recordReport(espionage, report) {
    espionage.reports.unshift({
        year: yearNow(),
        desk: deskOf(report.desk),
        kind: report.kind || "success",
        targetId: cleanText(report.targetId, 80),
        targetName: cleanText(report.targetName, 120),
        detail: cleanText(report.detail, 220),
        gold: integer(report.gold, 0, 1_000_000)
    });
    espionage.reports = espionage.reports.slice(0, REPORT_LIMIT);
}

function agentById(agentId) {
    const espionage = ensureEspionage();
    return espionage.agents.find(agent => agent.id === String(agentId)) || null;
}

export function recruitAgent(personId) {
    const espionage = ensureEspionage();
    if (espionage.agents.length >= AGENT_LIMIT) return {ok: false, reason: "the-whisper-court-is-full"};
    const entity = adultEntities().find(candidate => personKeyOf(candidate) === String(personId));
    if (!entity) return {ok: false, reason: "choose-a-living-adult"};
    const personKey = personKeyOf(entity);
    if (espionage.agents.some(agent => agent.personId === personKey)) {
        return {ok: false, reason: "that-resident-already-serves"};
    }
    if ((Number(state.resources?.gold) || 0) < AGENT_RECRUIT_COST.gold) {
        return {ok: false, reason: "not-enough-gold"};
    }
    addResource("gold", -AGENT_RECRUIT_COST.gold);
    const agent = {
        id: "agent-" + yearNow() + "-" + (espionage.totals.recruited + 1),
        personId: personKey,
        name: cleanText(entity.person.name || "Resident", 80),
        guile: guileOf(entity),
        loyalty: 58,
        desk: "",
        targetId: "",
        targetName: "",
        joinedYear: yearNow(),
        missions: 0,
        successes: 0,
        lastMissionYear: 0
    };
    espionage.agents.push(agent);
    espionage.totals.recruited += 1;
    addLog(agent.name + " entered the Whisper Court for " + AGENT_RECRUIT_COST.gold + " gold.", "#9b8ec4", "espionage");
    return {ok: true, agent: { ...agent }, snapshot: getEspionageSnapshot()};
}

export function dismissAgent(agentId) {
    const espionage = ensureEspionage();
    const agent = agentById(agentId);
    if (!agent) return {ok: false, reason: "unknown-agent"};
    espionage.agents = espionage.agents.filter(entry => entry.id !== agent.id);
    espionage.totals.dismissed += 1;
    addLog(agent.name + " left the Whisper Court.", "#9b8ec4", "espionage");
    return {ok: true, snapshot: getEspionageSnapshot()};
}

export function assignAgent(agentId, desk, targetId = "") {
    const espionage = ensureEspionage();
    const agent = agentById(agentId);
    if (!agent) return {ok: false, reason: "unknown-agent"};
    const nextDesk = deskOf(desk);
    if (!nextDesk) return {ok: false, reason: "choose-a-desk"};
    let target = "";
    let targetName = "";
    if (nextDesk === "foreign") {
        const realm = realmRecords().find(entry => String(entry.id) === String(targetId));
        if (!realm) return {ok: false, reason: "choose-a-foreign-realm"};
        target = String(realm.id);
        targetName = realmNameOf(realm);
    } else if (nextDesk === "nobles") {
        const house = houseRecords().find(entry => String(entry.id) === String(targetId));
        if (!house) return {ok: false, reason: "choose-a-noble-house"};
        target = String(house.id);
        targetName = cleanText(house.familyName || house.id, 120);
    }
    agent.desk = nextDesk;
    agent.targetId = target;
    agent.targetName = targetName;
    addLog(agent.name + " was assigned to " + ESPIONAGE_DESK_LABELS[nextDesk].toLowerCase()
        + (targetName ? " against " + targetName : "") + ".", "#9b8ec4", "espionage");
    return {ok: true, snapshot: getEspionageSnapshot()};
}

export function updateEspionage() {
    const espionage = ensureEspionage();
    const year = yearNow();
    if (espionage.lastUpdateYear >= year) return getEspionageSnapshot();

    // Insight fades when it is not renewed; this year's missions then add to
    // the reduced base. The pass is bounded by the six-agent roster.
    espionage.foreignInsight = Math.round(clamp(espionage.foreignInsight * 0.88, 0, INSIGHT_LIMIT));
    espionage.marketInsight = Math.round(clamp(espionage.marketInsight * 0.88, 0, INSIGHT_LIMIT));
    espionage.nobleInsight = Math.round(clamp(espionage.nobleInsight * 0.88, 0, INSIGHT_LIMIT));
    espionage.watchStrength = Math.round(clamp(espionage.watchStrength * 0.90, 0, INSIGHT_LIMIT));

    let paid = 0;
    let missions = 0;
    let successes = 0;
    let captured = 0;
    let seizedGold = 0;
    const paidAgents = [];
    for (const agent of espionage.agents.slice()) {
        if ((Number(state.resources?.gold) || 0) >= AGENT_WAGE) {
            addResource("gold", -AGENT_WAGE);
            paid += 1;
            paidAgents.push(agent);
        } else {
            agent.loyalty = Math.round(clamp(agent.loyalty - 12, 0, 100));
            recordReport(espionage, {
                desk: agent.desk, kind: "wage", targetName: agent.name,
                detail: "The treasury could not pay " + agent.name + "'s yearly wage; loyalty falls."
            });
        }
    }
    espionage.totals.wagesPaid += paid * AGENT_WAGE;

    // Counter-intelligence is resolved before the missions it protects. Every
    // counter agent lowers the chance that a field agent is caught this year.
    const counterGuile = espionage.agents
        .filter(agent => agent.desk === "counter")
        .reduce((sum, agent) => sum + Number(agent.guile || 0), 0);
    const missionAgents = espionage.agents.filter(agent => agent.desk && agent.desk !== "counter");
    espionage.suspicion = Math.round(clamp(Number(espionage.suspicion) + missionAgents.length * 2.5 - counterGuile * 0.09, 0, 100));

    for (const agent of missionAgents) {
        const targetRealm = agent.desk === "foreign"
            ? realmRecords().find(realm => String(realm.id) === agent.targetId) : null;
        const targetHouse = agent.desk === "nobles"
            ? houseRecords().find(house => String(house.id) === agent.targetId) : null;
        if (agent.desk === "foreign" && !targetRealm) {
            recordReport(espionage, {
                desk: agent.desk, kind: "failure", targetName: agent.targetName || "lost contact",
                detail: agent.name + " found no court to observe; the assignment lapsed."
            });
            continue;
        }
        if (agent.desk === "nobles" && !targetHouse) {
            recordReport(espionage, {
                desk: agent.desk, kind: "failure", targetName: agent.targetName || "lost contact",
                detail: agent.name + " found no noble house to watch; the assignment lapsed."
            });
            continue;
        }
        missions += 1;
        agent.missions += 1;
        agent.lastMissionYear = year;
        const chance = missionChance(agent);
        if (random("espionage") <= chance) {
            successes += 1;
            agent.successes += 1;
            espionage.totals.successes += 1;
            const gain = 5 + Math.round(Number(agent.guile) / 14);
            if (agent.desk === "foreign") {
                espionage.foreignInsight = Math.round(clamp(espionage.foreignInsight + gain, 0, INSIGHT_LIMIT));
                recordReport(espionage, {
                    desk: agent.desk, kind: "success", targetId: targetRealm.id,
                    targetName: realmNameOf(targetRealm),
                    detail: agent.name + " reports " + realmNameOf(targetRealm) + ": "
                        + (targetRealm.treaty || "no treaty") + ", relation " + Math.round(Number(targetRealm.relation) || 0)
                        + ", trust " + Math.round(Number(targetRealm.trust) || 0)
                        + ", fear " + Math.round(Number(targetRealm.fear) || 0) + "."
                });
            } else if (agent.desk === "nobles") {
                espionage.nobleInsight = Math.round(clamp(espionage.nobleInsight + gain, 0, INSIGHT_LIMIT));
                const before = Math.round(Number(targetHouse.loyalty) || 0);
                const plot = before < 40;
                targetHouse.loyalty = Math.round(clamp(before + (plot ? 4 : 1.5), 0, 100));
                if (plot) espionage.totals.plotsExposed += 1;
                recordReport(espionage, {
                    desk: agent.desk, kind: "success", targetId: targetHouse.id,
                    targetName: cleanText(targetHouse.familyName || targetHouse.id, 120),
                    detail: plot
                        ? "A plot in House " + (targetHouse.familyName || targetHouse.id) + " was exposed; its head returns to the crown's peace."
                        : agent.name + " found no conspiracy in House " + (targetHouse.familyName || targetHouse.id) + "; loyalty improves."
                });
            } else if (agent.desk === "market") {
                espionage.marketInsight = Math.round(clamp(espionage.marketInsight + gain, 0, INSIGHT_LIMIT));
                const gold = 2 + Math.round(Number(agent.guile) / 12);
                addResource("gold", gold);
                seizedGold += gold;
                espionage.totals.seizedGold += gold;
                recordReport(espionage, {
                    desk: agent.desk, kind: "success", targetName: "Market contraband",
                    detail: agent.name + " uncovered a smuggling ring; " + gold + " gold in contraband was seized.",
                    gold
                });
            } else if (agent.desk === "watch") {
                espionage.watchStrength = Math.round(clamp(espionage.watchStrength + gain, 0, INSIGHT_LIMIT));
                state.morale = clamp(Number(state.morale) + 0.4, 0, 100);
                recordReport(espionage, {
                    desk: agent.desk, kind: "success", targetName: "City watch",
                    detail: agent.name + " broke up a theft ring; the streets are calmer and morale rises."
                });
            }
        } else {
            espionage.suspicion = Math.round(clamp(Number(espionage.suspicion) + (agent.desk === "foreign" ? 6 : 4), 0, 100));
            recordReport(espionage, {
                desk: agent.desk, kind: "failure", targetId: agent.targetId, targetName: agent.targetName,
                detail: agent.name + "'s approach was noticed; suspicion rises."
            });
            if (Number(espionage.suspicion) >= 50 &&
                random("espionage") < Math.min(0.28, Number(espionage.suspicion) / 400)) {
                espionage.agents = espionage.agents.filter(entry => entry.id !== agent.id);
                captured += 1;
                espionage.totals.captures += 1;
                espionage.suspicion = Math.round(clamp(Number(espionage.suspicion) + 8, 0, 100));
                const incidentRealm = targetRealm || realmRecords()
                    .slice().sort((a, b) => (Number(b.fear) || 0) - (Number(a.fear) || 0))[0] || null;
                if (incidentRealm) {
                    incidentRealm.relation = clamp(Number(incidentRealm.relation) - 3, 0, 100);
                    recordReport(espionage, {
                        desk: agent.desk, kind: "incident", targetId: String(incidentRealm.id),
                        targetName: realmNameOf(incidentRealm),
                        detail: agent.name + " was captured; " + realmNameOf(incidentRealm)
                            + " protests and its relation with the crown falls."
                    });
                    espionage.totals.incidents += 1;
                } else {
                    recordReport(espionage, {
                        desk: agent.desk, kind: "capture", targetName: agent.targetName,
                        detail: agent.name + " was captured and the court lost the agent."
                    });
                }
            }
        }
    }

    espionage.totals.missions += missions;
    espionage.suspicion = Math.round(clamp(Number(espionage.suspicion) - 1, 0, 100));
    espionage.lastUpdateYear = year;
    const audit = {
        year,
        agents: espionage.agents.length,
        paid,
        missions,
        successes,
        captured,
        seizedGold,
        suspicion: Math.round(Number(espionage.suspicion) || 0),
        foreignInsight: Math.round(Number(espionage.foreignInsight) || 0),
        marketInsight: Math.round(Number(espionage.marketInsight) || 0),
        nobleInsight: Math.round(Number(espionage.nobleInsight) || 0)
    };
    espionage.lastAudit = audit;
    espionage.history.unshift(audit);
    espionage.history = espionage.history.slice(0, ESPIONAGE_HISTORY_LIMIT);
    if (missions > 0) {
        addLog("THE WHISPER COURT · " + paidAgents.length + " PAID · " + successes + "/" + missions
            + " MISSIONS SUCCEEDED · SUSPICION " + audit.suspicion, "#9b8ec4", "espionage");
    }
    return getEspionageSnapshot();
}
