// Royal advisor: one named resident who reads the living realm, states the
// numbers behind a recommendation, and can be accepted, rejected, delayed or
// asked for evidence. The advisor is deliberately fallible: faction ties and
// personal ambition move the recommendation away from the raw pressure score.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects, getPoliticalSnapshot } from "./politics.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { ensureCourt } from "./court.js";

export const ADVISOR_SIGNAL_LIMIT = 24;
export const ADVISOR_ADVICE_INTERVAL_TICKS = 600;
export const ADVISOR_APPOINTMENT_COST = 8;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const tickNow = () => Math.max(0, Math.floor(Number(state.tick) || 0));
const trait = (person, key) => clamp(person?.traits?.[key] ?? 50);
const need = (person, key) => clamp(person?.needs?.[key] ?? 50);
const personId = entity => String(entity?.personId || entity?.id || "");
const maturityFor = person => PERSON_SPECIES[person?.species]?.maturation ?? 16;

const FACTION_LABELS = Object.freeze({ commons: "Commons", nobility: "Nobility", guilds: "Guilds", clergy: "Clergy" });

function livingPerson(id) {
    return state.entities.find(entity => !entity.dead && personId(entity) === String(id)) || null;
}

function king() {
    return state.entities.find(entity => !entity.dead && entity.isKing) || null;
}

function dominantFaction(person) {
    const scores = {
        commons: trait(person, "compassion") * 0.55 + trait(person, "sociability") * 0.30 + (100 - trait(person, "greed")) * 0.15,
        nobility: trait(person, "ambition") * 0.45 + trait(person, "courage") * 0.35 + (100 - trait(person, "compassion")) * 0.20,
        guilds: trait(person, "greed") * 0.45 + trait(person, "discipline") * 0.30 + trait(person, "curiosity") * 0.25,
        clergy: trait(person, "piety") * 0.60 + trait(person, "compassion") * 0.25 + trait(person, "patience") * 0.15
    };
    return Object.keys(scores).reduce((best, faction) => scores[faction] > scores[best] ? faction : best, "commons");
}

function relationshipWithKing(person) {
    const sovereign = king();
    if (!sovereign) return 50;
    const link = Array.isArray(person.relationships)
        ? person.relationships.find(item => String(item.targetId) === personId(sovereign))
        : null;
    return clamp(link?.trust ?? 50);
}

function advisorFit(person) {
    const experience = clamp((person.ageYears - maturityFor(person)) * 2, 0, 100);
    return clamp(
        trait(person, "ambition") * 0.22 +
        trait(person, "sociability") * 0.22 +
        trait(person, "curiosity") * 0.20 +
        trait(person, "discipline") * 0.20 +
        (100 - trait(person, "greed")) * 0.10 +
        experience * 0.06,
        10,
        100
    );
}

function advisorLoyalty(person) {
    return clamp(
        relationshipWithKing(person) * 0.35 +
        (100 - trait(person, "ambition")) * 0.20 +
        need(person, "belonging") * 0.25 +
        (100 - trait(person, "greed")) * 0.10 +
        trait(person, "discipline") * 0.10,
        5,
        100
    );
}

function advisorIntegrity(person) {
    return clamp((100 - trait(person, "greed")) * 0.45 + trait(person, "compassion") * 0.30 + trait(person, "discipline") * 0.15 + trait(person, "piety") * 0.10, 5, 100);
}

function biasReason(person, faction) {
    const keys = faction === "nobility" ? ["ambition", "courage", "compassion"]
        : faction === "guilds" ? ["greed", "discipline", "curiosity"]
            : faction === "clergy" ? ["piety", "compassion", "patience"]
                : ["compassion", "sociability", "greed"];
    return `${FACTION_LABELS[faction]} ties (${keys.map(key => `${key} ${Math.round(trait(person, key))}`).join(", ")})`;
}

function createAdvisorRecord(entity) {
    const person = ensurePersonProfile(entity);
    const faction = dominantFaction(person);
    return {
        version: 1,
        personId: personId(entity),
        name: person.name,
        appointedYear: yearNow(),
        faction,
        factionLabel: FACTION_LABELS[faction],
        biasReason: biasReason(person, faction),
        competence: Math.round(advisorFit(person)),
        loyalty: Math.round(advisorLoyalty(person)),
        integrity: Math.round(advisorIntegrity(person)),
        relationship: Math.round(relationshipWithKing(person)),
        ambition: Math.round(trait(person, "ambition")),
        lastAdviceYear: 0,
        lastAdviceTick: 0,
        lastUpdateYear: 0,
        advice: null,
        memory: []
    };
}

function eligibleCandidates() {
    const court = ensureCourt();
    const occupied = new Set(Object.values(court.offices || {}).filter(Boolean).map(office => String(office.personId)));
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && !entity.isKing && entity.personId && !occupied.has(personId(entity)))
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return { entity, person, fit: advisorFit(person) };
        })
        .filter(candidate => candidate.person.ageYears >= maturityFor(candidate.person))
        .sort((a, b) => b.fit - a.fit || a.person.name.localeCompare(b.person.name) || personId(a.entity).localeCompare(personId(b.entity)));
}

function normalizeAdvice(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const status = ["pending", "evidence", "accepted", "rejected", "delayed", "expired"].includes(source.status) ? source.status : "pending";
    return {
        id: String(source.id || "advice").slice(0, 80),
        kind: String(source.kind || "granary").slice(0, 24),
        title: String(source.title || "Council advice").slice(0, 120),
        recommendation: String(source.recommendation || "").slice(0, 240),
        evidence: (Array.isArray(source.evidence) ? source.evidence : []).slice(0, 8).map(item => ({
            label: String(item?.label || "").slice(0, 60),
            value: String(item?.value ?? "").slice(0, 80)
        })).filter(item => item.label),
        cost: source.cost && typeof source.cost === "object" && !Array.isArray(source.cost)
            ? Object.fromEntries(Object.entries(source.cost).filter(([, value]) => Number(value) > 0).map(([key, value]) => [String(key).slice(0, 20), integer(value)]))
            : {},
        effects: source.effects && typeof source.effects === "object" && !Array.isArray(source.effects)
            ? Object.fromEntries(Object.entries(source.effects).filter(([, value]) => Number(value) !== 0).map(([key, value]) => [String(key).slice(0, 20), Math.round(Number(value) * 100) / 100]))
            : {},
        effectsLabel: String(source.effectsLabel || "").slice(0, 180),
        createdYear: integer(source.createdYear, 1),
        createdTick: integer(source.createdTick),
        expiresTick: integer(source.expiresTick),
        status,
        confidence: clamp(source.confidence ?? 50, 0, 100),
        bias: String(source.bias || "").slice(0, 180),
        revealed: Boolean(source.revealed),
        outcome: String(source.outcome || "").slice(0, 180)
    };
}

function normalizeMemoryItem(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const text = String(source.text || "").trim().slice(0, 180);
    if (!text) return null;
    return {
        id: String(source.id || "signal").slice(0, 100),
        year: integer(source.year, 1),
        kind: String(source.kind || "advice").slice(0, 24),
        outcome: String(source.outcome || "").slice(0, 24),
        text
    };
}

export function normalizeAdvisorRecord(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const id = String(source.personId || "").slice(0, 100);
    if (!id) return null;
    return {
        version: 1,
        personId: id,
        name: String(source.name || "Unknown advisor").slice(0, 90),
        appointedYear: integer(source.appointedYear, 1),
        faction: FACTION_LABELS[source.faction] ? source.faction : "commons",
        factionLabel: FACTION_LABELS[source.faction] || FACTION_LABELS.commons,
        biasReason: String(source.biasReason || "").slice(0, 180),
        competence: clamp(source.competence ?? 50, 1, 100),
        loyalty: clamp(source.loyalty ?? 50, 0, 100),
        integrity: clamp(source.integrity ?? 50, 0, 100),
        relationship: clamp(source.relationship ?? 50, 0, 100),
        ambition: clamp(source.ambition ?? 50, 0, 100),
        lastAdviceYear: integer(source.lastAdviceYear, 0),
        lastAdviceTick: integer(source.lastAdviceTick, 0),
        lastUpdateYear: integer(source.lastUpdateYear, 0),
        advice: normalizeAdvice(source.advice),
        memory: (Array.isArray(source.memory) ? source.memory : []).map(normalizeMemoryItem).filter(Boolean).slice(0, ADVISOR_SIGNAL_LIMIT)
    };
}

function recordAdvisorMemoryTo(advisor, kind, text, { adviceId = "", outcome = "" } = {}) {
    if (!advisor) return null;
    const entry = {
        id: String(adviceId || kind + "-" + tickNow()),
        year: yearNow(),
        kind: String(kind).slice(0, 24),
        outcome: String(outcome).slice(0, 24),
        text: String(text).slice(0, 180)
    };
    advisor.memory = [entry, ...(Array.isArray(advisor.memory) ? advisor.memory : [])].slice(0, ADVISOR_SIGNAL_LIMIT);
    return entry;
}

export function recordAdvisorMemory(kind, text, options = {}) {
    const advisor = ensureRoyalAdvisor();
    if (!advisor) return null;
    return recordAdvisorMemoryTo(advisor, kind, text, options);
}

export function ensureRoyalAdvisor({ auto = true } = {}) {
    const court = ensureCourt();
    const current = court.advisor && typeof court.advisor === "object" ? court.advisor : null;
    if (current?.personId && livingPerson(current.personId)) {
        const person = ensurePersonProfile(livingPerson(current.personId));
        current.name = person.name;
        current.relationship = Math.round(relationshipWithKing(person));
        return current;
    }
    if (current) court.advisor = null;
    if (!auto) return null;
    const candidate = eligibleCandidates()[0];
    if (!candidate) return null;
    court.advisor = createAdvisorRecord(candidate.entity);
    addLog("A royal advisor enters the council: " + court.advisor.name, "#d8c18a", "court");
    return court.advisor;
}

export function appointRoyalAdvisor(id) {
    const entity = livingPerson(id);
    if (!entity || entity.type !== TYPE.VILLAGER || entity.isKing) return { ok: false, reason: "eligible-advisor-not-found" };
    const person = ensurePersonProfile(entity);
    if (person.ageYears < maturityFor(person)) return { ok: false, reason: "advisor-not-adult" };
    const court = ensureCourt();
    if (court.advisor?.personId === personId(entity)) return { ok: false, reason: "already-royal-advisor" };
    if ((Number(state.resources?.gold) || 0) < ADVISOR_APPOINTMENT_COST) return { ok: false, reason: "not-enough-gold" };
    const occupied = Object.values(court.offices || {}).some(office => office && String(office.personId) === personId(entity));
    if (occupied) return { ok: false, reason: "resident-already-holds-a-court-office" };
    addResource("gold", -ADVISOR_APPOINTMENT_COST);
    const previous = court.advisor;
    court.advisor = createAdvisorRecord(entity);
    if (previous) recordAdvisorMemoryTo(court.advisor, "replacement", "I replaced " + previous.name + " as royal advisor in year " + yearNow() + ".", { outcome: "appointed" });
    addPersonMemory(entity, {
        id: "advisor-appointment:" + yearNow(),
        type: "court",
        text: "I was appointed royal advisor in year " + yearNow() + " and now answer directly to the crown.",
        tick: tickNow(),
        importance: 88
    });
    addLog("ROYAL ADVISOR APPOINTED: " + court.advisor.name, "#e8c77b", "court");
    return { ok: true, advisor: getAdvisorSnapshot(), snapshot: getAdvisorSnapshot() };
}

function pressureSignals() {
    const politics = getPoliticalSnapshot();
    const resources = state.resources || {};
    const food = Number(resources.food) || 0;
    const gold = Number(resources.gold) || 0;
    const wars = (state.diplomacy?.realms || []).filter(realm => worldTreaty(realm) === "war").length;
    const garrison = state.entities.filter(entity => !entity.dead && [TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT].includes(entity.type)).length;
    const pendingCases = Array.isArray(state.justice?.pendingCases) ? state.justice.pendingCases.length : 0;
    const minFaction = Math.min(...Object.values(politics.factions || {}));
    const morale = Number(state.morale) || 0;
    const unemployed = Math.max(0, Number(state.economy?.unemployed) || 0);
    const crisis = Math.max(0, Number(state.foodCrisis?.severity) || 0);
    const warRisk = wars > 0 ? 70 + wars * 10 : garrison < 4 ? 38 : 12;
    const signals = [
        { kind: "granary", score: (food < 100 ? 100 - food : 8) + crisis * 22, evidence: [["Crown food", food + " units"], ["Food crisis", Math.round(crisis) + " / 100"], ["Households", Math.round(Number(state.population?.households) || 0)]] },
        { kind: "levy", score: (gold < 90 ? 90 - gold : 8) + Math.max(0, Number(state.economy?.debt) || 0) * 0.8, evidence: [["Treasury", Math.round(gold) + " gold"], ["Debt", Math.round(Number(state.economy?.debt) || 0) + " gold"], ["Tax rate", Math.round(Number(state.government?.taxRate) || 10) + " %"]] },
        { kind: "muster", score: warRisk, evidence: [["Wars", wars + " active"], ["Garrison", garrison + " soldiers"], ["Readiness pressure", Math.round(warRisk) + " / 100"]] },
        { kind: "festival", score: Math.max(0, 60 - minFaction) * 1.6 + Math.max(0, 55 - morale), evidence: [["Lowest faction", Math.round(minFaction) + " / 100"], ["Morale", Math.round(morale) + " / 100"], ["Legitimacy", Math.round(Number(politics.legitimacy) || 0) + " / 100"]] },
        { kind: "circuit", score: pendingCases * 9 + Math.max(0, 60 - Number(politics.legitimacy || 0)), evidence: [["Pending cases", pendingCases + " in the docket"], ["Legitimacy", Math.round(Number(politics.legitimacy) || 0) + " / 100"], ["Judges", Array.isArray(state.justice?.judges) ? state.justice.judges.length + " appointed" : "0 appointed"]] },
        { kind: "works", score: Math.max(0, Number(state.politics?.factions?.guilds) || 0) < 50 ? 55 - (Number(state.politics?.factions?.guilds) || 0) : 10, evidence: [["Unemployed", unemployed + " residents"], ["Guild support", Math.round(Number(state.politics?.factions?.guilds) || 0) + " / 100"], ["Wood", Math.round(Number(resources.wood) || 0) + " units"]] }
    ];
    for (const signal of signals) {
        signal.score = Math.round(clamp(signal.score, 0, 120));
        signal.evidence = signal.evidence.map(([label, value]) => ({ label, value: String(value) }));
    }
    return signals;
}

function worldTreaty(realm) {
    return String(realm?.treaty || realm?.relationType || "none");
}

function biasedChoice(signals, advisor) {
    const factionBias = {
        commons: ["granary", "festival"],
        nobility: ["muster", "levy"],
        guilds: ["works", "levy"],
        clergy: ["festival", "circuit"]
    }[advisor.faction] || [];
    const ranked = signals.map(signal => ({
        ...signal,
        biasedScore: signal.score + (factionBias.includes(signal.kind) ? 14 : 0)
    })).sort((a, b) => b.biasedScore - a.biasedScore || a.kind.localeCompare(b.kind));
    const chosen = ranked[0];
    return {
        kind: chosen.kind,
        evidence: chosen.evidence,
        score: chosen.score,
        biasedScore: chosen.biasedScore,
        bias: factionBias.includes(chosen.kind) && chosen.score < 70
            ? `${advisor.factionLabel} sympathy lifts this option above the raw pressure score.`
            : advisor.biasReason
    };
}

function adviceTemplate(kind, advisor, signal) {
    const evidence = signal.evidence;
    const confidence = Math.round(clamp(42 + advisor.competence * 0.38 + (signal.score >= 70 ? 12 : 0) - (advisor.faction === "nobility" && kind === "levy" ? 4 : 0), 20, 95));
    const common = { kind, evidence, confidence, bias: signal.bias };
    if (kind === "granary") {
        return {
            ...common,
            title: "Open the crown granary",
            recommendation: "Release 24 food at a capped price before the next settlement. The reserve is smaller than the households can safely absorb.",
            cost: { gold: 8 },
            effects: { resources: { food: 24 }, politics: { commons: 3 }, morale: 1 },
            effectsLabel: "+24 food, +3 commons, +1 morale"
        };
    }
    if (kind === "levy") {
        return {
            ...common,
            title: "Raise a temporary hearth levy",
            recommendation: "Collect 18 gold from the hearths now. It closes the immediate gap but the commons will remember the extra demand.",
            cost: {},
            effects: { resources: { gold: 18 }, politics: { commons: -3, guilds: -1, legitimacy: -0.4 }, morale: 0 },
            effectsLabel: "+18 gold, -3 commons, -1 guilds, -0.4 legitimacy"
        };
    }
    if (kind === "muster") {
        return {
            ...common,
            title: "Pay the border captains",
            recommendation: "Send 12 gold to the march captains and put the household guard on the walls. This is visible deterrence, not a permanent army.",
            cost: { gold: 12 },
            effects: { politics: { nobility: 3, legitimacy: 0.5 }, morale: 1 },
            effectsLabel: "+3 nobility, +0.5 legitimacy, +1 morale"
        };
    }
    if (kind === "festival") {
        return {
            ...common,
            title: "Hold a court festival",
            recommendation: "Spend bread and gold on a public festival. The lowest faction needs a reason to believe the crown is listening.",
            cost: { gold: 10, food: 6 },
            effects: { politics: { clergy: 3, commons: 2, legitimacy: 0.3 }, morale: 4 },
            effectsLabel: "+3 clergy, +2 commons, +0.3 legitimacy, +4 morale"
        };
    }
    if (kind === "circuit") {
        return {
            ...common,
            title: "Send the jurist on circuit",
            recommendation: "Fund a circuit court and hear the pending docket in public. Justice delayed is already costing the crown legitimacy.",
            cost: { gold: 6 },
            effects: { politics: { commons: 2, guilds: 1, legitimacy: 0.8 }, morale: 0 },
            effectsLabel: "+2 commons, +1 guilds, +0.8 legitimacy"
        };
    }
    return {
        ...common,
        title: "Fund a crown works programme",
        recommendation: "Put idle hands on a bounded royal works programme. It costs timber and gold, but the guilds and the commons both see the result.",
        cost: { gold: 14, wood: 10 },
        effects: { politics: { guilds: 3, commons: 2, legitimacy: 0.2 }, morale: 2 },
        effectsLabel: "+3 guilds, +2 commons, +0.2 legitimacy, +2 morale"
    };
}

function adviceAffordable(cost) {
    return Object.entries(cost || {}).every(([key, value]) => (Number(state.resources?.[key]) || 0) >= Number(value));
}

export function buildAdvisorAdvice({ force = false } = {}) {
    const advisor = ensureRoyalAdvisor();
    if (!advisor) return null;
    const tick = tickNow();
    const current = advisor.advice;
    if (!force && current && ["pending", "evidence"].includes(current.status) && tick < current.expiresTick) return current;
    const signal = biasedChoice(pressureSignals(), advisor);
    const template = adviceTemplate(signal.kind, advisor, signal);
    const advice = {
        id: "advisor-" + yearNow() + "-" + signal.kind,
        kind: template.kind,
        title: template.title,
        recommendation: template.recommendation,
        evidence: template.evidence,
        cost: template.cost,
        effects: template.effects,
        effectsLabel: template.effectsLabel,
        createdYear: yearNow(),
        createdTick: tick,
        expiresTick: tick + ADVISOR_ADVICE_INTERVAL_TICKS,
        status: "pending",
        confidence: template.confidence,
        bias: template.bias,
        revealed: false,
        outcome: ""
    };
    advisor.advice = advice;
    advisor.lastAdviceYear = yearNow();
    advisor.lastAdviceTick = tick;
    recordAdvisorMemoryTo(advisor, "advice", advisor.name + " proposed: " + advice.title + ".", { adviceId: advice.id, outcome: "pending" });
    return advice;
}

function applyAdviceEffects(advice) {
    for (const [resource, amount] of Object.entries(advice.cost || {})) addResource(resource, -Number(amount));
    for (const [resource, amount] of Object.entries(advice.effects?.resources || {})) addResource(resource, Number(amount));
    if (advice.effects?.politics) applyPoliticalEffects(advice.effects.politics);
    if (Number(advice.effects?.morale)) state.morale = clamp((Number(state.morale) || 0) + Number(advice.effects.morale), 0, 100);
}

export function resolveAdvisorAdvice(action) {
    const advisor = ensureRoyalAdvisor();
    if (!advisor) return { ok: false, reason: "no-royal-advisor" };
    const advice = advisor.advice || buildAdvisorAdvice();
    if (!advice) return { ok: false, reason: "no-advice-available" };
    if (!["pending", "evidence"].includes(advice.status)) return { ok: false, reason: "advice-already-resolved" };
    const choice = String(action || "").toLowerCase();
    if (!["accept", "reject", "delay", "evidence"].includes(choice)) return { ok: false, reason: "unknown-advisor-action" };

    if (choice === "evidence") {
        advice.status = "evidence";
        advice.revealed = true;
        advisor.loyalty = clamp(advisor.loyalty + 1, 0, 100);
        recordAdvisorMemoryTo(advisor, "evidence", "I laid out the numbers behind “" + advice.title + "”.", { adviceId: advice.id, outcome: "evidence" });
        return { ok: true, action: choice, advice: { ...advice }, snapshot: getAdvisorSnapshot() };
    }
    if (choice === "delay") {
        advice.status = "delayed";
        advice.outcome = "delayed";
        advice.expiresTick = tickNow() + ADVISOR_ADVICE_INTERVAL_TICKS;
        recordAdvisorMemoryTo(advisor, "delay", "The crown delayed “" + advice.title + "” without a decision.", { adviceId: advice.id, outcome: "delayed" });
        addLog("ROYAL ADVICE DELAYED: " + advice.title, "#b99a9a", "court");
        return { ok: true, action: choice, advice: { ...advice }, snapshot: getAdvisorSnapshot() };
    }
    if (choice === "reject") {
        advice.status = "rejected";
        advice.outcome = "rejected";
        advisor.loyalty = clamp(advisor.loyalty - 4, 0, 100);
        applyPoliticalEffects({ legitimacy: -0.2 });
        recordAdvisorMemoryTo(advisor, "rejection", "The crown rejected “" + advice.title + "” in year " + yearNow() + ".", { adviceId: advice.id, outcome: "rejected" });
        addLog("ROYAL ADVICE REJECTED: " + advice.title, "#b99a9a", "court");
        return { ok: true, action: choice, advice: { ...advice }, snapshot: getAdvisorSnapshot() };
    }

    if (!adviceAffordable(advice.cost)) {
        const missing = Object.entries(advice.cost || {}).find(([key, value]) => (Number(state.resources?.[key]) || 0) < Number(value));
        return { ok: false, reason: "advisor-" + (missing?.[0] || "cost") + "-short" };
    }
    applyAdviceEffects(advice);
    advice.status = "accepted";
    advice.outcome = "accepted";
    advisor.loyalty = clamp(advisor.loyalty + 3, 0, 100);
    const sovereign = king();
    if (sovereign) {
        addPersonMemory(sovereign, {
            id: "advisor-accepted:" + advice.id,
            type: "court",
            text: "I accepted the royal advisor's counsel: " + advice.title + ". " + advice.effectsLabel + ".",
            tick: tickNow(),
            importance: 76
        });
    }
    const advisorEntity = livingPerson(advisor.personId);
    if (advisorEntity) {
        addPersonMemory(advisorEntity, {
            id: "advisor-accepted:" + advice.id,
            type: "court",
            text: "The crown accepted my counsel: " + advice.title + ".",
            tick: tickNow(),
            importance: 82
        });
    }
    recordAdvisorMemoryTo(advisor, "decision", "The crown accepted “" + advice.title + "”. " + advice.effectsLabel, { adviceId: advice.id, outcome: "accepted" });
    addLog("ROYAL ADVICE ACCEPTED: " + advice.title, "#e8c77b", "court");
    return { ok: true, action: choice, advice: { ...advice }, snapshot: getAdvisorSnapshot() };
}

export function getAdvisorSnapshot() {
    const advisor = ensureRoyalAdvisor();
    if (!advisor) {
        return {
            advisor: null,
            advice: null,
            memory: [],
            candidates: eligibleCandidates().slice(0, 10).map(candidate => ({
                personId: personId(candidate.entity),
                name: candidate.person.name,
                ageYears: candidate.person.ageYears,
                fit: Math.round(candidate.fit),
                faction: FACTION_LABELS[dominantFaction(candidate.person)]
            })),
            appointmentCost: ADVISOR_APPOINTMENT_COST
        };
    }
    const advice = advisor.advice || buildAdvisorAdvice();
    return {
        ...advisor,
        advisor: { ...advisor },
        advice: advice ? { ...advice, affordable: adviceAffordable(advice.cost) } : null,
        memory: (advisor.memory || []).slice(0, 8),
        candidates: eligibleCandidates().slice(0, 10).map(candidate => ({
            personId: personId(candidate.entity),
            name: candidate.person.name,
            ageYears: candidate.person.ageYears,
            fit: Math.round(candidate.fit),
            faction: FACTION_LABELS[dominantFaction(candidate.person)]
        })),
        appointmentCost: ADVISOR_APPOINTMENT_COST
    };
}

export function updateAdvisor() {
    const advisor = ensureRoyalAdvisor();
    if (!advisor) return null;
    const year = yearNow();
    const current = advisor.advice;
    if (current && ["pending", "evidence"].includes(current.status) && year > current.createdYear) {
        current.status = "expired";
        current.outcome = "expired";
        recordAdvisorMemoryTo(advisor, "expiry", "The crown let “" + current.title + "” expire without an answer.", { adviceId: current.id, outcome: "expired" });
    }
    const stale = !advisor.advice || !["pending", "evidence"].includes(advisor.advice.status);
    if (stale && advisor.lastUpdateYear < year) buildAdvisorAdvice({ force: true });
    advisor.lastUpdateYear = year;
    return getAdvisorSnapshot();
}
