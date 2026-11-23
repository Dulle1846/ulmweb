// Noble feuds: durable disputes between two living houses. Causes are selected
// deterministically from the houses' identities and year, escalation is annual
// and bounded, and every court action has a real treasury/political cost.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { addPersonMemory } from "./people.js";
import { ensureNobility, getNobilitySnapshot } from "./nobility.js";
import {
    NOBLE_ACTIVE_FEUD_LIMIT,
    NOBLE_FEUD_LIMIT,
    createNobleFeud,
    nobleFeudHistory
} from "./noble-state.js";

export const FEUD_MEDIATION_COST = 12;
export const FEUD_INFLAME_COST = 5;
export const FEUD_IGNORE_LEGITIMACY_COST = 0.2;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const tickNow = () => Math.max(0, Math.floor(Number(state.tick) || 0));
const CAUSES = Object.freeze([
    "competing land claims",
    "a disputed inheritance",
    "an insult remembered at court",
    "grazing and mill rights",
    "a broken marriage pact",
    "a contested border toll"
]);

function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < String(value).length; index++) {
        hash ^= String(value).charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function causeFor(firstId, secondId, year) {
    return CAUSES[hashText(firstId + ":" + secondId + ":" + year) % CAUSES.length];
}

function houseById(id) {
    const nobility = ensureNobility();
    return nobility.houses.find(house => house.id === String(id)) || null;
}

function feudPenaltyFromSeverity(severity) {
    return clamp(Number(severity) || 0, 0, 5) * 0.036;
}

export function activeFeudSeverityFor(houseId) {
    const nobility = ensureNobility();
    let severity = 0;
    for (const feud of Array.isArray(nobility.feuds) ? nobility.feuds : []) {
        if (feud.status !== "active") continue;
        if (feud.houses.includes(String(houseId))) severity = Math.max(severity, Number(feud.severity) || 0);
    }
    return severity;
}

export function nobleFeudPenaltyFor(houseId) {
    return feudPenaltyFromSeverity(activeFeudSeverityFor(houseId));
}

function recordFeudState(nobility, kind, summary) {
    if (!Array.isArray(nobility.history)) nobility.history = [];
    nobility.history.unshift({
        year: yearNow(),
        kind: String(kind).slice(0, 32),
        summary: String(summary).slice(0, 180)
    });
    nobility.history = nobility.history.slice(0, 24);
    addLog(summary, "#d8c18a", "nobility");
}

function settle(feud, reason) {
    if (!feud || feud.status === "settled") return false;
    feud.status = "settled";
    feud.settledYear = yearNow();
    nobleFeudHistory(feud, "settled", reason, yearNow());
    return true;
}

function compactFeuds(nobility) {
    const active = (nobility.feuds || []).filter(feud => feud.status === "active")
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, NOBLE_ACTIVE_FEUD_LIMIT);
    const settled = (nobility.feuds || []).filter(feud => feud.status === "settled")
        .sort((a, b) => b.settledYear - a.settledYear || a.id.localeCompare(b.id))
        .slice(0, Math.max(0, NOBLE_FEUD_LIMIT - active.length));
    nobility.feuds = [...active, ...settled].slice(0, NOBLE_FEUD_LIMIT);
}

function applyEscalation(feud, delta) {
    const before = feud.severity;
    feud.severity = clamp(before + delta, 0, 5);
    feud.lastEscalationYear = yearNow();
    for (const houseId of feud.houses) {
        const house = houseById(houseId);
        if (!house) continue;
        house.loyalty = clamp(Number(house.loyalty) - Math.max(0.5, delta * 0.8));
        house.wealth = clamp(Number(house.wealth) - Math.max(0.5, delta * 0.6));
    }
    applyPoliticalEffects({nobility: -0.3 * Math.max(1, delta), legitimacy: -0.15 * Math.max(1, delta)});
    state.morale = clamp((Number(state.morale) || 0) - 0.35 * Math.max(1, delta), 0, 100);
    nobleFeudHistory(feud, delta > 0 ? "escalated" : "deescalated",
        "Feud severity " + before + " -> " + feud.severity + ".", yearNow());
}

function createFeud(nobility, snapshot) {
    const houses = snapshot.houses
        .filter(house => house.memberCount > 0 && house.head)
        .sort((a, b) => a.id.localeCompare(b.id));
    if (houses.length < 2) return null;
    if (!Array.isArray(nobility.feuds)) nobility.feuds = [];
    const activePairs = new Set((nobility.feuds || []).filter(feud => feud.status === "active")
        .map(feud => [...feud.houses].sort().join("|")));
    let best = null;
    for (let first = 0; first < houses.length; first++) {
        for (let second = first + 1; second < houses.length; second++) {
            const a = houses[first], b = houses[second];
            if (activePairs.has([a.id, b.id].sort().join("|"))) continue;
            const hostA = Number(a.host?.strength) || 0;
            const hostB = Number(b.host?.strength) || 0;
            const score = Math.abs(Number(a.wealth) - Number(b.wealth)) +
                (100 - Math.min(Number(a.loyalty) || 0, Number(b.loyalty) || 0)) * 0.45 +
                (hostA + hostB) * 0.20 +
                hashText(a.id + ":" + b.id + ":" + yearNow()) % 9;
            if (!best || score > best.score || (score === best.score && a.id + b.id < best.a.id + best.b.id)) {
                best = {a, b, score};
            }
        }
    }
    if (!best) return null;
    const feud = createNobleFeud({
        id: "feud-" + best.a.id + "-" + best.b.id + "-" + yearNow(),
        houses: [best.a.id, best.b.id],
        cause: causeFor(best.a.id, best.b.id, yearNow()),
        year: yearNow()
    });
    nobleFeudHistory(feud, "opened", "A feud opened over " + feud.cause + ".", yearNow());
    nobility.feuds.unshift(feud);
    nobility.lastFeudYear = yearNow();
    compactFeuds(nobility);
    recordFeudState(nobility, "feud-opened", "Houses " + best.a.familyName + " and " + best.b.familyName + " opened a feud over " + feud.cause + ".");
    return feud;
}

export function updateNobleFeuds() {
    const nobility = ensureNobility();
    const year = yearNow();
    if (!Array.isArray(nobility.feuds)) nobility.feuds = [];
    const snapshot = getNobilitySnapshot();
    const living = new Set(snapshot.houses.filter(house => house.memberCount > 0 && house.head).map(house => house.id));

    for (const feud of nobility.feuds.filter(entry => entry.status === "active")) {
        if (!feud.houses.every(id => living.has(id))) {
            settle(feud, "One house no longer has a living head.");
            continue;
        }
        if (feud.lastEscalationYear >= year) continue;
        const averageLoyalty = feud.houses.reduce((sum, id) => {
            const house = snapshot.houses.find(entry => entry.id === id);
            return sum + (Number(house?.loyalty) || 0);
        }, 0) / 2;
        const ignored = Number(feud.ignoredYear) === year || Number(feud.ignoredYear) === year - 1;
        if (averageLoyalty >= 68 && Number(state.politics?.legitimacy || 0) >= 58 && !ignored) {
            applyEscalation(feud, -1);
            if (feud.severity <= 0) {
                settle(feud, "The houses accepted a quiet settlement.");
                recordFeudState(nobility, "feud-settled", "The feud between the houses cooled without a formal mediation.");
            }
        } else {
            applyEscalation(feud, ignored ? 2 : 1);
            if (feud.severity >= 5) {
                const feudNames = feud.houses
                    .map(id => snapshot.houses.find(house => house.id === id)?.familyName)
                    .filter(Boolean);
                const feudLabel = feudNames.length === 2
                    ? "Houses " + feudNames[0] + " and " + feudNames[1]
                    : "The noble houses";
                recordFeudState(nobility, "feud-crisis", feudLabel + " reached open confrontation; both houses withhold their strength.");
            }
        }
    }

    const active = nobility.feuds.filter(feud => feud.status === "active");
    const canOpen = living.size >= 2 && active.length < NOBLE_ACTIVE_FEUD_LIMIT &&
        (!active.length || year % 3 === 0) && Number(nobility.lastFeudYear || 0) < year;
    if (canOpen) createFeud(nobility, snapshot);
    nobility.feudPenalty = active.length
        ? Math.max(...active.map(feud => feudPenaltyFromSeverity(feud.severity)))
        : 0;
    nobility.activeFeuds = active.length;
    compactFeuds(nobility);
    return getNobleFeudSnapshot();
}

export function getNobleFeudSnapshot() {
    const nobility = ensureNobility();
    const houses = new Map(nobility.houses.map(house => [house.id, house]));
    const feuds = (Array.isArray(nobility.feuds) ? nobility.feuds : []).map(feud => ({
        ...feud,
        houses: feud.houses.map(id => {
            const house = houses.get(id);
            return {id, familyName: house?.familyName || id, loyalty: Math.round(Number(house?.loyalty) || 0)};
        }),
        penalty: feudPenaltyFromSeverity(feud.severity)
    }));
    return {
        feuds,
        active: feuds.filter(feud => feud.status === "active").length,
        settled: feuds.filter(feud => feud.status === "settled").length,
        penalty: Math.max(0, ...feuds.filter(feud => feud.status === "active").map(feud => feud.penalty), 0),
        activeLimit: NOBLE_ACTIVE_FEUD_LIMIT,
        feudLimit: NOBLE_FEUD_LIMIT,
        mediationCost: FEUD_MEDIATION_COST,
        inflameCost: FEUD_INFLAME_COST
    };
}

export function mediateFeud(feudId) {
    const nobility = ensureNobility();
    const feud = (nobility.feuds || []).find(entry => entry.id === String(feudId) && entry.status === "active");
    if (!feud) return {ok: false, reason: "no-active-feud"};
    if ((Number(state.resources?.gold) || 0) < FEUD_MEDIATION_COST) return {ok: false, reason: "not-enough-gold"};
    addResource("gold", -FEUD_MEDIATION_COST);
    applyEscalation(feud, -2);
    for (const houseId of feud.houses) {
        const house = houseById(houseId);
        if (house) house.loyalty = clamp(Number(house.loyalty) + 3);
    }
    applyPoliticalEffects({legitimacy: 0.5, nobility: 0.3});
    const king = state.entities.find(entity => !entity.dead && entity.isKing) || null;
    if (king) {
        addPersonMemory(king, {
            id: "feud-mediation:" + feud.id + ":" + yearNow(),
            type: "nobility",
            text: "I mediated the feud between " + feud.houses.map(id => houseById(id)?.familyName || id).join(" and ") + " in year " + yearNow() + ".",
            tick: tickNow(),
            importance: 76
        });
    }
    nobleFeudHistory(feud, "mediated", "The crown paid " + FEUD_MEDIATION_COST + " gold to mediate the dispute.", yearNow());
    if (feud.severity <= 0) {
        settle(feud, "Mediation ended the feud.");
        recordFeudState(nobility, "feud-settled", "The crown mediated a noble feud to a settlement.");
    } else {
        recordFeudState(nobility, "feud-mediation", "The crown mediated a noble feud; severity is now " + feud.severity + ".");
    }
    compactFeuds(nobility);
    return {ok: true, feud: { ...feud }, snapshot: getNobleFeudSnapshot()};
}

export function inflameFeud(feudId) {
    const nobility = ensureNobility();
    const feud = (nobility.feuds || []).find(entry => entry.id === String(feudId) && entry.status === "active");
    if (!feud) return {ok: false, reason: "no-active-feud"};
    if ((Number(state.resources?.gold) || 0) < FEUD_INFLAME_COST) return {ok: false, reason: "not-enough-gold"};
    addResource("gold", -FEUD_INFLAME_COST);
    applyEscalation(feud, 1);
    applyPoliticalEffects({legitimacy: -0.4});
    nobleFeudHistory(feud, "inflamed", "Crown agents inflamed the dispute for " + FEUD_INFLAME_COST + " gold.", yearNow());
    recordFeudState(nobility, "feud-inflamed", "The crown secretly inflamed a noble feud.");
    compactFeuds(nobility);
    return {ok: true, feud: { ...feud }, snapshot: getNobleFeudSnapshot()};
}

export function ignoreFeud(feudId) {
    const nobility = ensureNobility();
    const feud = (nobility.feuds || []).find(entry => entry.id === String(feudId) && entry.status === "active");
    if (!feud) return {ok: false, reason: "no-active-feud"};
    feud.ignoredYear = yearNow();
    applyEscalation(feud, 1);
    applyPoliticalEffects({legitimacy: -FEUD_IGNORE_LEGITIMACY_COST});
    nobleFeudHistory(feud, "ignored", "The crown left the dispute unanswered.", yearNow());
    recordFeudState(nobility, "feud-ignored", "An unanswered noble feud escalated.");
    compactFeuds(nobility);
    return {ok: true, feud: { ...feud }, snapshot: getNobleFeudSnapshot()};
}
