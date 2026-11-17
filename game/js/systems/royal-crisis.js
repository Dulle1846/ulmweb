// Royal crisis: minor-heir regency, contested claims, abdication, usurpation
// and a bounded civil conflict. Every action reads the living entities and the
// existing political/noble state; the module never invents a parallel court.
import { state } from "../core/state.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { addPersonMemory, ensurePersonProfile } from "./people.js";
import { getFamilySnapshot } from "./families.js";
import { getSovereign, getRoyalPerson, royalAdultAge, updateRoyalSuccession } from "./royal-dynasty.js";
import {
    createCivilConflictState,
    createRegencyState,
    normalizeRoyalCrisisState,
    ROYAL_ABDICATION_HISTORY_LIMIT,
    ROYAL_CLAIM_LIMIT
} from "./royal-crisis-state.js";

export const ROYAL_REGENT_COST = Object.freeze({ gold: 8 });
export const ROYAL_SETTLE_CLAIM_COST = Object.freeze({ gold: 12 });
export const ROYAL_USURPATION_COST = Object.freeze({ gold: 20, food: 12 });
export const ROYAL_SUPPRESS_COST = Object.freeze({ gold: 18, food: 10 });
const CRISIS_HISTORY_LIMIT = 16;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max,
    Number.isFinite(Number(value)) ? Number(value) : min));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const personId = entity => String(entity?.personId || entity?.person?.id || entity?.id || "");
const alive = entity => Boolean(entity && !entity.dead);
const personName = entity => String(ensurePersonProfile(entity)?.name || "Unknown claimant").slice(0, 90);
const isAdult = entity => Boolean(entity && alive(entity) && Number(ensurePersonProfile(entity).ageYears) >= royalAdultAge(entity));

function royal() {
    if (!state.royal || typeof state.royal !== "object" || Array.isArray(state.royal)) state.royal = {};
    return normalizeRoyalCrisisState(state.royal);
}

function recordCrisis(kind, detail) {
    const s = royal();
    s.crisisHistory.push({
        year: yearNow(),
        kind: String(kind || "royal-crisis").slice(0, 32),
        detail: String(detail || "").slice(0, 180)
    });
    s.crisisHistory = s.crisisHistory.slice(-CRISIS_HISTORY_LIMIT);
}

function recordDynasty(kind, detail) {
    const s = royal();
    s.history.push({
        year: yearNow(),
        kind: String(kind || "dynasty").slice(0, 32),
        detail: String(detail || "").slice(0, 160)
    });
    s.history = s.history.slice(-48);
}

function canPay(cost) {
    return Object.entries(cost).every(([resource, amount]) =>
        (Number(state.resources?.[resource]) || 0) >= Number(amount || 0));
}

function pay(cost) {
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -Number(amount || 0));
}

function houseById(id) {
    return (Array.isArray(state.nobility?.houses) ? state.nobility.houses : [])
        .find(house => String(house.id) === String(id)) || null;
}

function nobleHeads() {
    const seen = new Set();
    return (Array.isArray(state.nobility?.houses) ? state.nobility.houses : [])
        .map(house => {
            const entity = getRoyalPerson(house.headId);
            if (!entity || !isAdult(entity) || seen.has(personId(entity))) return null;
            seen.add(personId(entity));
            return { entity, house };
        })
        .filter(Boolean);
}

function trait(person, key) {
    return clamp(person?.traits?.[key] ?? 50);
}

function regentQuality(entity) {
    if (!entity) return 0;
    const person = ensurePersonProfile(entity);
    return (trait(person, "discipline") * 0.30 + trait(person, "compassion") * 0.20 +
        trait(person, "sociability") * 0.20 + trait(person, "patience") * 0.15 +
        trait(person, "piety") * 0.15);
}

function regencySupport(s, minorKing, regent) {
    const politics = state.politics || {};
    const legitimacy = clamp(politics.legitimacy ?? 65);
    const factions = politics.factions || {};
    const claims = s.claims.filter(claim => claim.status === "pressing");
    const claimPressure = claims.reduce((sum, claim) => sum + Math.max(0, claim.support - 40) * 0.22, 0);
    const base = 34 + (legitimacy - 50) * 0.24 + (Number(factions.nobility) || 50) * 0.06 +
        (Number(factions.clergy) || 50) * 0.05 - claimPressure;
    if (!regent) return clamp(base - 18);
    return clamp(base + 10 + (regentQuality(regent) - 50) * 0.28);
}

function regentCandidates(s, minorKing) {
    if (!minorKing) return [];
    const found = new Map();
    const add = (entity, source, score, house = null) => {
        if (!entity || entity === minorKing || !isAdult(entity) || !alive(entity)) return;
        if (entity.isKing || entity.isAbdicated) return;
        if (s.regency.regentId && personId(entity) === String(s.regency.regentId)) return;
        const id = personId(entity);
        if (!id) return;
        const prior = found.get(id);
        if (prior && prior.score >= score) return;
        found.set(id, {
            entity,
            personId: id,
            name: personName(entity),
            ageYears: Math.floor(Number(ensurePersonProfile(entity).ageYears) || 0),
            source,
            score,
            houseId: house?.id || null,
            houseName: house?.familyName || ""
        });
    };
    const consort = getRoyalPerson(s.consortId);
    add(consort, "consort", 100);
    const family = getFamilySnapshot(personId(minorKing));
    for (const link of family.parents || []) {
        add(getRoyalPerson(link.personId), "parent", 95);
    }
    for (const link of family.siblings || []) {
        add(getRoyalPerson(link.personId), "royal-sibling", 75);
    }
    for (const entity of state.entities) {
        if (entity?.isRoyalFamily && entity !== minorKing) add(entity, "royal-house", 60);
    }
    for (const { entity, house } of nobleHeads()) {
        add(entity, "noble-house", 42 + (Number(house.loyalty) || 0) * 0.14 +
            (Number(house.power) || 0) * 0.04, house);
    }
    const offices = state.court?.offices && typeof state.court.offices === "object"
        ? Object.values(state.court.offices) : [];
    for (const office of offices) {
        add(getRoyalPerson(office?.personId), "court", 38);
    }
    return [...found.values()]
        .sort((a, b) => b.score - a.score || b.ageYears - a.ageYears ||
            a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId))
        .slice(0, 8);
}

function chooseRegent(s, minorKing) {
    return regentCandidates(s, minorKing)[0]?.entity || null;
}

function setRegent(s, candidate) {
    const previous = getRoyalPerson(s.regency.regentId);
    if (previous && previous !== candidate) {
        previous.isRegent = false;
        const previousPerson = ensurePersonProfile(previous);
        previousPerson.role = s.regency.regentPriorRole || "resident";
    }
    if (!candidate) {
        s.regency.regentId = null;
        s.regency.regentPriorRole = null;
        return null;
    }
    const person = ensurePersonProfile(candidate);
    candidate.isRegent = true;
    s.regency.regentPriorRole = String(person.role || "resident").slice(0, 40);
    person.role = "regent";
    s.regency.regentId = personId(candidate);
    return candidate;
}

function clearRegent(s) {
    const regent = getRoyalPerson(s.regency.regentId);
    if (regent) {
        regent.isRegent = false;
        const person = ensurePersonProfile(regent);
        person.role = s.regency.regentPriorRole || "resident";
    }
    s.regency.regentId = null;
    s.regency.regentPriorRole = null;
}

function seedClaims(s, minorKing) {
    if (!s.regency.active || s.regency.claimsSeeded || !minorKing) return s.claims;
    s.regency.claimsSeeded = true;
    const regentId = s.regency.regentId;
    const seen = new Set([personId(minorKing), regentId].filter(Boolean));
    const generated = [];
    const add = (entity, source, base, house = null) => {
        if (!entity || !alive(entity) || !isAdult(entity)) return;
        const id = personId(entity);
        if (!id || seen.has(id) || entity.isKing || entity.isAbdicated) return;
        seen.add(id);
        const houseFactor = house ? (Number(house.power) || 0) * 0.28 +
            Math.max(0, 100 - (Number(house.loyalty) || 0)) * 0.16 : 0;
        const claimStrength = clamp(Math.round(base + houseFactor));
        const support = clamp(Math.round(18 + claimStrength * 0.42 +
            (Number(state.politics?.factions?.nobility) || 50) * 0.12 +
            (house ? (Number(house.loyalty) || 0) * 0.12 : 0)));
        generated.push({
            id: "claim-" + id,
            personId: id,
            claimantName: personName(entity),
            source,
            claimStrength,
            support,
            status: "pressing",
            sinceYear: yearNow(),
            lastActionYear: yearNow(),
            houseId: house?.id || null,
            houseName: house?.familyName || ""
        });
    };
    const family = getFamilySnapshot(personId(minorKing));
    for (const link of family.siblings || []) add(getRoyalPerson(link.personId), "royal-sibling", 58);
    for (const entity of state.entities) {
        if (entity?.isRoyalFamily && entity !== minorKing) add(entity, "royal-kin", 44);
    }
    const houses = (Array.isArray(state.nobility?.houses) ? state.nobility.houses : [])
        .map(house => ({ house, entity: getRoyalPerson(house.headId) }))
        .filter(entry => entry.entity && isAdult(entry.entity))
        .sort((a, b) => (Number(a.house.loyalty) || 0) - (Number(b.house.loyalty) || 0) ||
            (Number(b.house.power) || 0) - (Number(a.house.power) || 0) ||
            String(a.house.id).localeCompare(String(b.house.id)));
    for (const { house, entity } of houses) {
        add(entity, "noble-house", 26, house);
    }
    s.claims = generated
        .sort((a, b) => b.claimStrength - a.claimStrength || b.support - a.support ||
            a.personId.localeCompare(b.personId))
        .slice(0, ROYAL_CLAIM_LIMIT);
    for (const claim of s.claims) {
        recordCrisis("claim", claim.claimantName + " advanced a claim to the crown (" + claim.claimStrength + " strength).");
    }
    return s.claims;
}

export function startRegency(minorKing, { reason = "minor-heir" } = {}) {
    const s = royal();
    if (!minorKing) return { ok: false, reason: "minor-sovereign-not-found" };
    if (s.regency.active && s.regency.minorKingId === personId(minorKing)) {
        return { ok: true, regency: { ...s.regency } };
    }
    if (s.regency.active) clearRegent(s);
    const history = Array.isArray(s.regency.history) ? s.regency.history.slice(-CRISIS_HISTORY_LIMIT) : [];
    s.regency = {
        ...createRegencyState(),
        active: true,
        minorKingId: personId(minorKing),
        sinceYear: yearNow(),
        reason: String(reason || "minor-heir").slice(0, 40),
        history
    };
    s.claims = [];
    s.civilConflict = { ...createCivilConflictState(), resolvedYear: 0 };
    const regent = chooseRegent(s, minorKing);
    if (regent) setRegent(s, regent);
    s.regency.claimsSeeded = false;
    seedClaims(s, minorKing);
    s.regency.councilSupport = regencySupport(s, minorKing, regent);
    s.regency.lastUpdateYear = yearNow();
    applyPoliticalEffects({ legitimacy: -6, nobility: -3, commons: -1, clergy: 1 });
    state.morale = clamp((Number(state.morale) || 72) - 3);
    recordCrisis("regency", personName(minorKing) + " is a minor; " +
        (regent ? personName(regent) + " was named regent." : "no regent could be agreed."));
    addPersonMemory(minorKing, {
        id: "regency:" + personId(minorKing) + ":" + yearNow(),
        type: "dynasty",
        text: "A regency was opened in my name in year " + yearNow() + " because I am still a minor.",
        tick: state.tick,
        importance: 100
    });
    if (!regent) {
        startCivilConflict(s, "regency-without-regent", s.claims[0] || null);
    }
    addLog("REGENCY OPENED FOR " + personName(minorKing).toUpperCase() +
        (regent ? " · REGENT " + personName(regent).toUpperCase() : " · NO REGENT AGREED"), "#d8c18a", "dynasty");
    return { ok: true, regency: { ...s.regency }, regent, claims: s.claims.map(claim => ({ ...claim })) };
}

export function endRegency(reason = "majority") {
    const s = royal();
    if (!s.regency.active) return { ok: false, reason: "no-active-regency" };
    const regent = getRoyalPerson(s.regency.regentId);
    const minor = getRoyalPerson(s.regency.minorKingId);
    clearRegent(s);
    s.regency.active = false;
    s.regency.sinceYear = s.regency.sinceYear || yearNow();
    s.regency.lastUpdateYear = yearNow();
    s.regency.reason = String(reason || "majority").slice(0, 40);
    s.claims = s.claims.map(claim => claim.status === "pressing"
        ? { ...claim, status: "settled", lastActionYear: yearNow() }
        : claim);
    s.regency.history.push({
        year: yearNow(),
        kind: "regency-ended",
        detail: "The regency ended by " + reason + (minor ? " for " + personName(minor) : "") + "."
    });
    s.regency.history = s.regency.history.slice(-CRISIS_HISTORY_LIMIT);
    if (reason === "majority") applyPoliticalEffects({ legitimacy: 2.5, nobility: 1, commons: 1 });
    recordCrisis("regency-ended", "The regency of " + (minor ? personName(minor) : "the crown") + " ended by " + reason + ".");
    addLog("REGENCY ENDED · " + String(reason).toUpperCase(), "#d8c18a", "dynasty");
    if (s.civilConflict.active) endCivilConflict(s, "regency-" + reason);
    return { ok: true, regent, minor, reason };
}

function phaseForSeverity(severity) {
    if (severity >= 55) return "civil-war";
    if (severity > 0) return "tension";
    return "peace";
}

export function startCivilConflict(s = royal(), cause = "dynasty", claim = null) {
    if (!s.civilConflict || typeof s.civilConflict !== "object") s.civilConflict = createCivilConflictState();
    const conflict = s.civilConflict;
    if (conflict.active) {
        conflict.severity = clamp(conflict.severity + 10);
        conflict.phase = phaseForSeverity(conflict.severity);
        conflict.lastUpdateYear = yearNow();
        recordCrisis("escalation", "The conflict around " + (cause || "the crown") + " escalated to " + Math.round(conflict.severity) + ".");
        return conflict;
    }
    const houses = [];
    const addHouse = (house, name) => {
        if (!house && !name) return;
        const id = String(house?.id || name);
        if (houses.some(entry => entry.id === id)) return;
        houses.push({ id, name: String(house?.familyName || name || id).slice(0, 90) });
    };
    if (claim?.houseId) addHouse(houseById(claim.houseId), claim.houseName);
    for (const house of (Array.isArray(state.nobility?.houses) ? state.nobility.houses : [])
        .filter(entry => Number(entry.loyalty) < 58)
        .sort((a, b) => Number(a.loyalty) - Number(b.loyalty) ||
            Number(b.power) - Number(a.power) || String(a.id).localeCompare(String(b.id)))) {
        if (houses.length >= 4) break;
        addHouse(house, house.familyName);
    }
    conflict.active = true;
    conflict.phase = phaseForSeverity(28);
    conflict.severity = clamp(28 + (Number(claim?.support) || 0) * 0.16 +
        Math.max(0, 55 - (Number(state.politics?.legitimacy) || 65)) * 0.2);
    conflict.phase = phaseForSeverity(conflict.severity);
    conflict.cause = String(cause || "dynasty").slice(0, 80);
    conflict.claimantId = claim?.personId || null;
    conflict.startedYear = yearNow();
    conflict.resolvedYear = 0;
    conflict.lastUpdateYear = yearNow();
    conflict.houses = houses;
    if (claim) claim.status = "pressing";
    for (const entry of houses) {
        const house = houseById(entry.id);
        if (!house) continue;
        house.loyalty = clamp(Number(house.loyalty) - 3);
    }
    applyPoliticalEffects({ legitimacy: -3, nobility: -1.5, commons: -1 });
    state.morale = clamp((Number(state.morale) || 72) - 2);
    recordCrisis("civil-conflict", "Civil conflict began: " + conflict.cause + ".");
    addLog("CIVIL CONFLICT · " + String(conflict.cause).toUpperCase(), "#d8a35f", "dynasty");
    return conflict;
}

export function endCivilConflict(s = royal(), reason = "settled") {
    if (!s.civilConflict?.active) return { ok: false, reason: "no-active-conflict" };
    const conflict = s.civilConflict;
    conflict.active = false;
    conflict.phase = "resolved";
    conflict.severity = 0;
    conflict.resolvedYear = yearNow();
    conflict.lastUpdateYear = yearNow();
    conflict.history.push({ year: yearNow(), kind: "resolved", detail: "Civil conflict ended: " + reason + "." });
    conflict.history = conflict.history.slice(-CRISIS_HISTORY_LIMIT);
    if (!["usurpation", "claim-conceded"].includes(reason)) {
        applyPoliticalEffects({ legitimacy: 2, nobility: 1, commons: 0.5 });
        state.morale = clamp((Number(state.morale) || 72) + 2);
    }
    recordCrisis("civil-conflict-ended", "Civil conflict ended: " + reason + ".");
    addLog("CIVIL CONFLICT ENDED · " + String(reason).toUpperCase(), "#8fbf8f", "dynasty");
    return { ok: true, reason, conflict };
}

function strongestClaim(s, pressingOnly = true) {
    return s.claims
        .filter(claim => !pressingOnly || claim.status === "pressing")
        .sort((a, b) => b.support - a.support || b.claimStrength - a.claimStrength ||
            a.personId.localeCompare(b.personId))[0] || null;
}

function applyCivilConflictEffects(s) {
    const conflict = s.civilConflict;
    if (!conflict?.active) return;
    const severity = clamp(conflict.severity);
    const goldDrain = Math.max(1, Math.round(2 + severity / 28));
    const foodDrain = Math.max(1, Math.round(2 + severity / 32));
    addResource("gold", -goldDrain);
    addResource("food", -foodDrain);
    state.morale = clamp((Number(state.morale) || 72) - 1.2);
    applyPoliticalEffects({ legitimacy: -0.9, commons: -0.7, nobility: -0.5, clergy: -0.2 });
    conflict.casualties += Math.max(1, Math.round(severity / 22));
    conflict.battles += 1;
    conflict.lastUpdateYear = yearNow();
    for (const entry of conflict.houses) {
        const house = houseById(entry.id);
        if (!house) continue;
        house.loyalty = clamp(Number(house.loyalty) - 1.5);
        if (severity >= 55 && house.host) {
            house.host.status = "revolted";
            house.host.morale = clamp(Number(house.host.morale) - 2);
        }
    }
    conflict.history.push({
        year: yearNow(),
        kind: "campaign",
        detail: "Civil conflict severity " + Math.round(severity) + "; " +
            (conflict.houses.length ? conflict.houses.map(entry => entry.name).join(", ") : "crown loyalists") + " engaged."
    });
    conflict.history = conflict.history.slice(-CRISIS_HISTORY_LIMIT);
}

function installSovereign(entity, { cause = "succession", law = "claim" } = {}) {
    const s = royal();
    const previous = getSovereign();
    if (previous && previous !== entity) {
        previous.isKing = false;
        previous.isRegent = false;
        previous.isAbdicated = true;
        const previousPerson = ensurePersonProfile(previous);
        previousPerson.role = "former sovereign";
    }
    for (const candidate of state.entities) if (candidate.isKing && candidate !== entity) candidate.isKing = false;
    clearRegent(s);
    s.regency.active = false;
    s.regency.minorKingId = null;
    s.regency.reason = String(cause).slice(0, 40);
    entity.isKing = true;
    entity.isRoyalFamily = true;
    entity.isAbdicated = false;
    const person = ensurePersonProfile(entity, { role: "king" });
    person.role = "king";
    s.heirId = null;
    state.kingHp = Math.max(1, Math.min(entity.maxHp || 300, entity.hp || 300));
    recordDynasty("succession", "The crown passed to " + personName(entity) + " by " + cause + ".");
    addPersonMemory(entity, {
        id: "crown:" + personId(entity) + ":" + yearNow() + ":" + cause,
        type: "dynasty",
        text: "I took the crown by " + cause + " in year " + yearNow() + ".",
        tick: state.tick,
        importance: 100
    });
    addLog("THE CROWN PASSED TO " + personName(entity).toUpperCase() + " · " + String(cause).toUpperCase(), "#d8c18a", "dynasty");
    return entity;
}

function abdicationCandidates(s, king) {
    if (!king) return [];
    const found = new Map();
    const add = entity => {
        if (!entity || entity === king || !alive(entity) || entity.isKing) return;
        const id = personId(entity);
        if (!id || found.has(id)) return;
        found.set(id, entity);
    };
    add(getRoyalPerson(s.heirId));
    const family = getFamilySnapshot(personId(king));
    for (const link of family.children || []) add(getRoyalPerson(link.personId));
    for (const link of family.siblings || []) add(getRoyalPerson(link.personId));
    return [...found.values()].sort((a, b) =>
        (Number(ensurePersonProfile(b).ageYears) || 0) - (Number(ensurePersonProfile(a).ageYears) || 0) ||
        personName(a).localeCompare(personName(b)) || personId(a).localeCompare(personId(b)));
}

export function appointRegent(id) {
    const s = royal();
    const minor = getRoyalPerson(s.regency.minorKingId) || getSovereign();
    if (!s.regency.active || !minor) return { ok: false, reason: "no-active-regency" };
    const candidate = getRoyalPerson(id);
    const eligible = regentCandidates(s, minor).find(entry => entry.personId === personId(candidate));
    if (!eligible) return { ok: false, reason: "not-an-eligible-regent" };
    if (s.regency.regentId === personId(candidate)) return { ok: false, reason: "already-regent" };
    if (!canPay(ROYAL_REGENT_COST)) return { ok: false, reason: "not-enough-gold" };
    pay(ROYAL_REGENT_COST);
    setRegent(s, candidate);
    const settled = s.claims.find(entry => entry.status === "pressing" && entry.personId === personId(candidate));
    if (settled) {
        settled.status = "settled";
        settled.lastActionYear = yearNow();
        recordCrisis("claim-settled", settled.claimantName + " accepted the regency and withdrew the claim.");
    }
    s.regency.councilSupport = clamp(regencySupport(s, minor, candidate) + 8);
    if (s.civilConflict.active) {
        s.civilConflict.severity = clamp(s.civilConflict.severity - 4);
        if (s.civilConflict.severity <= 0) endCivilConflict(s, "regent-appointed");
    }
    applyPoliticalEffects({ legitimacy: 1.2, nobility: 1 });
    recordCrisis("regent-appointed", personName(candidate) + " was appointed regent for " + personName(minor) + ".");
    addLog("REGENT APPOINTED · " + personName(candidate).toUpperCase(), "#d8c18a", "dynasty");
    return {
        ok: true,
        regent: candidate,
        message: "REGENT APPOINTED · " + personName(candidate).toUpperCase(),
        snapshot: getRoyalCrisisSnapshot()
    };
}

export function settleClaim(id) {
    const s = royal();
    const claim = s.claims.find(entry => entry.id === String(id) || entry.personId === String(id));
    if (!claim || claim.status !== "pressing") return { ok: false, reason: "claim-not-pressing" };
    if (!canPay(ROYAL_SETTLE_CLAIM_COST)) return { ok: false, reason: "not-enough-gold" };
    pay(ROYAL_SETTLE_CLAIM_COST);
    claim.support = clamp(claim.support - (24 + (Number(state.politics?.legitimacy) || 65) * 0.15));
    claim.claimStrength = clamp(claim.claimStrength - 8);
    claim.lastActionYear = yearNow();
    if (claim.support <= 25) claim.status = "settled";
    applyPoliticalEffects({ legitimacy: -0.5, nobility: 1.5, commons: 0.4 });
    state.morale = clamp((Number(state.morale) || 72) + 1);
    recordCrisis("claim-settled", claim.claimantName + " accepted a settlement; support fell to " + Math.round(claim.support) + ".");
    if (!s.claims.some(entry => entry.status === "pressing") && s.civilConflict.active) {
        endCivilConflict(s, "all-claims-settled");
    }
    return {
        ok: true,
        claim,
        message: claim.status === "settled" ? "CLAIM SETTLED" : "CLAIM SUPPORT REDUCED",
        snapshot: getRoyalCrisisSnapshot()
    };
}

function claimPower(s, claim) {
    const claimant = getRoyalPerson(claim.personId);
    const house = claim.houseId ? houseById(claim.houseId) : null;
    const legitimacy = Number(state.politics?.legitimacy) || 65;
    const crown = legitimacy * 0.55 + (s.regency.active ? s.regency.councilSupport * 0.30 : 25) +
        (getSovereign() ? 10 : 0) + (Number(house?.loyalty) || 0) * 0.05;
    const claimantPower = claim.support * 0.70 + claim.claimStrength * 0.18 +
        (s.civilConflict.active ? s.civilConflict.severity * 0.12 : 0) +
        (Number(house?.power) || 0) * 0.10 + (Number(house?.levy) || 0) * 0.25;
    return { claimantPower, crown, success: claimantPower > crown + 4 };
}

export function pressClaim(id, { automatic = false, ignoreCost = false } = {}) {
    const s = royal();
    const claim = s.claims.find(entry => entry.id === String(id) || entry.personId === String(id));
    if (!claim || claim.status !== "pressing") return { ok: false, reason: "claim-not-pressing" };
    const claimant = getRoyalPerson(claim.personId);
    if (!claimant || !isAdult(claimant)) return { ok: false, reason: "claimant-not-an-adult" };
    const king = getSovereign();
    if (!king) return { ok: false, reason: "no-sovereign" };
    if (claimant === king) return { ok: false, reason: "claimant-already-sovereign" };
    if (!ignoreCost) {
        if (!canPay(ROYAL_USURPATION_COST)) return { ok: false, reason: "not-enough-gold-or-food" };
        pay(ROYAL_USURPATION_COST);
    }
    const power = claimPower(s, claim);
    if (power.success) {
        clearRegent(s);
        installSovereign(claimant, { cause: "usurpation", law: "claim" });
        const stored = s.claims.find(entry => entry.id === claim.id || entry.personId === claim.personId);
        if (stored) stored.status = "won";
        for (const other of s.claims) {
            if (other !== stored && other.status === "pressing") other.status = "defeated";
        }
        endCivilConflict(s, "usurpation");
        applyPoliticalEffects({ legitimacy: -8, nobility: 3, commons: -2 });
        recordCrisis("usurpation", claim.claimantName + " took the crown by force.");
        return {
            ok: true,
            success: true,
            king: claimant,
            message: "USURPATION SUCCEEDED · " + claim.claimantName.toUpperCase(),
            snapshot: getRoyalCrisisSnapshot()
        };
    }
    startCivilConflict(s, "claim-pressed", claim);
    s.civilConflict.severity = clamp(s.civilConflict.severity + (automatic ? 18 : 8));
    s.civilConflict.phase = phaseForSeverity(s.civilConflict.severity);
    claim.support = clamp(claim.support + 4);
    claim.claimStrength = clamp(claim.claimStrength + 2);
    claim.lastActionYear = yearNow();
    applyPoliticalEffects({ legitimacy: -2, nobility: -1 });
    state.morale = clamp((Number(state.morale) || 72) - 1);
    recordCrisis("claim-pressed", claim.claimantName + " pressed the claim; the crown held for now.");
    return {
        ok: true,
        success: false,
        claim,
        conflict: { ...s.civilConflict },
        message: "CLAIM PRESSED · CIVIL CONFLICT ESCALATES",
        snapshot: getRoyalCrisisSnapshot()
    };
}

export function attemptUsurpation(id) {
    return pressClaim(id);
}

export function concedeCrown(id) {
    const s = royal();
    const claim = s.claims.find(entry => entry.id === String(id) || entry.personId === String(id));
    if (!claim || claim.status !== "pressing") return { ok: false, reason: "claim-not-pressing" };
    const claimant = getRoyalPerson(claim.personId);
    if (!claimant || !isAdult(claimant)) return { ok: false, reason: "claimant-not-an-adult" };
    const king = getSovereign();
    if (!king) return { ok: false, reason: "no-sovereign" };
    clearRegent(s);
    installSovereign(claimant, { cause: "claim conceded", law: "claim" });
    const stored = s.claims.find(entry => entry.id === claim.id || entry.personId === claim.personId);
    if (stored) stored.status = "won";
    for (const other of s.claims) {
        if (other !== stored && other.status === "pressing") other.status = "settled";
    }
    endCivilConflict(s, "claim-conceded");
    applyPoliticalEffects({ legitimacy: -4, nobility: 4, commons: -2 });
    recordCrisis("concession", "The crown conceded to " + claim.claimantName + " without a battle.");
    return {
        ok: true,
        success: true,
        king: claimant,
        message: "CROWN CONCEDED TO " + claim.claimantName.toUpperCase(),
        snapshot: getRoyalCrisisSnapshot()
    };
}

export function abdicateThrone() {
    const s = royal();
    const king = getSovereign();
    if (!king) return { ok: false, reason: "no-sovereign" };
    if (!isAdult(king) || s.regency.active) return { ok: false, reason: "minor-sovereign-cannot-abdicate" };
    const candidates = abdicationCandidates(s, king);
    if (!candidates.length) return { ok: false, reason: "no-eligible-successor" };
    const successor = candidates[0];
    const oldName = personName(king);
    const successorName = personName(successor);
    const regency = !isAdult(successor);
    s.abdicationHistory.push({
        year: yearNow(),
        fromId: personId(king),
        fromName: oldName,
        toId: personId(successor),
        toName: successorName,
        regency
    });
    s.abdicationHistory = s.abdicationHistory.slice(-ROYAL_ABDICATION_HISTORY_LIMIT);
    clearRegent(s);
    installSovereign(successor, { cause: "abdication", law: "abdication" });
    for (const claim of s.claims) if (claim.status === "pressing") claim.status = "settled";
    if (s.civilConflict.active) endCivilConflict(s, "abdication");
    applyPoliticalEffects({ legitimacy: -7, nobility: -1, clergy: -2, commons: 1 });
    recordCrisis("abdication", oldName + " abdicated in favour of " + successorName + ".");
    if (regency) startRegency(successor, { reason: "minor-heir" });
    return {
        ok: true,
        king: successor,
        regency,
        message: "CROWN ABDICATED · " + successorName.toUpperCase(),
        snapshot: getRoyalCrisisSnapshot()
    };
}

export function suppressCivilConflict() {
    const s = royal();
    if (!s.civilConflict?.active) return { ok: false, reason: "no-active-conflict" };
    if (!canPay(ROYAL_SUPPRESS_COST)) return { ok: false, reason: "not-enough-gold-or-food" };
    pay(ROYAL_SUPPRESS_COST);
    const legitimacy = Number(state.politics?.legitimacy) || 65;
    const loyalists = (Array.isArray(state.nobility?.houses) ? state.nobility.houses : [])
        .reduce((sum, house) => sum + (Number(house.loyalty) >= 50 ? Number(house.levy) || 0 : 0), 0);
    const reduction = 14 + Math.round(legitimacy * 0.24) +
        Math.round((s.regency.active ? s.regency.councilSupport : 30) * 0.12) +
        Math.round(Math.min(40, loyalists) * 0.18);
    s.civilConflict.severity = clamp(s.civilConflict.severity - reduction);
    s.civilConflict.phase = phaseForSeverity(s.civilConflict.severity);
    s.civilConflict.casualties += 2;
    s.civilConflict.battles += 1;
    s.civilConflict.lastUpdateYear = yearNow();
    for (const claim of s.claims) {
        if (claim.status === "pressing") claim.support = clamp(claim.support - 6);
    }
    applyPoliticalEffects({ legitimacy: 2, nobility: 1, commons: -1 });
    state.morale = clamp((Number(state.morale) || 72) + 1);
    if (s.civilConflict.severity <= 0) endCivilConflict(s, "suppressed");
    else recordCrisis("campaign", "The crown campaign reduced the civil conflict to " + Math.round(s.civilConflict.severity) + ".");
    return {
        ok: true,
        message: s.civilConflict.active ? "CROWN CAMPAIGN CONTINUES" : "CIVIL CONFLICT SUPPRESSED",
        snapshot: getRoyalCrisisSnapshot()
    };
}

function usurpationRisk(s, claim) {
    if (!claim) return 0;
    const legitimacy = Number(state.politics?.legitimacy) || 65;
    const claimSide = claim.support * 0.58 + claim.claimStrength * 0.12 +
        (s.civilConflict.active ? s.civilConflict.severity * 0.18 : 0) +
        Math.max(0, 60 - legitimacy) * 0.20;
    const crownSide = legitimacy * 0.42 + (s.regency.active ? s.regency.councilSupport * 0.18 : 18);
    return clamp(Math.round(claimSide - crownSide + 24));
}

export function updateRoyalCrisis() {
    const s = royal();
    const year = yearNow();
    if (s.lastCrisisYear >= year) return getRoyalCrisisSnapshot();
    s.lastCrisisYear = year;
    let king = getSovereign();
    if (!king) {
        updateRoyalSuccession();
        king = getSovereign();
    }
    if (!king) return getRoyalCrisisSnapshot();
    if (!isAdult(king)) {
        if (!s.regency.active || s.regency.minorKingId !== personId(king)) {
            startRegency(king, { reason: "minor-heir" });
        }
    } else if (s.regency.active) {
        endRegency("majority");
    }
    if (s.regency.active) {
        seedClaims(s, king);
        let regent = getRoyalPerson(s.regency.regentId);
        if (!regent) {
            regent = chooseRegent(s, king);
            if (regent) {
                setRegent(s, regent);
                recordCrisis("regent-appointed", personName(regent) + " was chosen to end the vacant regency.");
            }
        }
        s.regency.councilSupport = regencySupport(s, king, regent);
        for (const claim of s.claims) {
            if (claim.status !== "pressing") continue;
            const claimant = getRoyalPerson(claim.personId);
            if (!claimant || !isAdult(claimant)) {
                claim.status = "withdrawn";
                recordCrisis("claim-withdrawn", claim.claimantName + " no longer has a living adult claimant.");
                continue;
            }
            const house = claim.houseId ? houseById(claim.houseId) : null;
            const drift = 0.45 + (s.civilConflict.active ? 1.2 : 0) +
                (s.regency.councilSupport < 40 ? 1.0 : 0) +
                (Number(state.politics?.legitimacy) < 50 ? 0.5 : 0) -
                (claim.support >= 85 ? 1.1 : 0) +
                (house && Number(house.loyalty) < 40 ? 0.6 : 0);
            claim.support = clamp(claim.support + drift);
            claim.lastActionYear = year;
        }
        const pressing = strongestClaim(s);
        if (!s.civilConflict.active && pressing && pressing.support >= 68 &&
            (s.regency.councilSupport < 48 || !regent)) {
            startCivilConflict(s, "contested-regency", pressing);
        }
        s.regency.lastUpdateYear = year;
    }
    if (s.civilConflict.active) {
        const pressing = strongestClaim(s);
        const risk = usurpationRisk(s, pressing);
        s.civilConflict.severity = clamp(s.civilConflict.severity);
        s.civilConflict.phase = phaseForSeverity(s.civilConflict.severity);
        if ((pressing && risk >= 82) || s.civilConflict.severity >= 100) {
            if (pressing) {
                const result = pressClaim(pressing.id, { automatic: true, ignoreCost: true });
                if (!result.success) {
                    s.civilConflict.severity = 92;
                    s.civilConflict.phase = "civil-war";
                }
                return getRoyalCrisisSnapshot();
            }
            endCivilConflict(s, "crown-victory");
        } else {
            applyCivilConflictEffects(s);
            const legitimacy = Number(state.politics?.legitimacy) || 65;
            const drift = (legitimacy < 45 ? 2.4 : 1.0) +
                (pressing ? pressing.support * 0.025 : 0) -
                (legitimacy > 70 ? 1.6 : 0) - (pressing ? 0 : 2);
            s.civilConflict.severity = clamp(s.civilConflict.severity + drift);
            s.civilConflict.phase = phaseForSeverity(s.civilConflict.severity);
            if (s.civilConflict.severity <= 0 || (legitimacy >= 75 && s.civilConflict.severity <= 18)) {
                endCivilConflict(s, "crown-victory");
            } else {
                s.civilConflict.history.push({
                    year,
                    kind: "escalation",
                    detail: "Civil conflict severity " + Math.round(s.civilConflict.severity) +
                        (pressing ? "; " + pressing.claimantName + " remains the leading claimant." : ".")
                });
                s.civilConflict.history = s.civilConflict.history.slice(-CRISIS_HISTORY_LIMIT);
            }
        }
    }
    return getRoyalCrisisSnapshot();
}

export function getRoyalCrisisSnapshot() {
    const s = royal();
    const king = getSovereign();
    if (king && !isAdult(king) && !s.regency.active) startRegency(king, { reason: "minor-heir" });
    if (s.regency.active && king) seedClaims(s, king);
    const regent = getRoyalPerson(s.regency.regentId);
    const minorKing = getRoyalPerson(s.regency.minorKingId) || (king && !isAdult(king) ? king : null);
    const adultAge = minorKing ? royalAdultAge(minorKing) : 0;
    const age = minorKing ? Number(ensurePersonProfile(minorKing).ageYears) || 0 : 0;
    const majorityYear = minorKing ? Math.max(yearNow(), yearNow() + Math.max(1, Math.ceil(adultAge - age))) : 0;
    const claims = s.claims.map(claim => {
        const claimant = getRoyalPerson(claim.personId);
        return {
            ...claim,
            claimantName: claimant ? personName(claimant) : (claim.claimantName || "Unknown claimant"),
            claimant,
            houseName: claim.houseName || (claim.houseId ? houseById(claim.houseId)?.familyName || claim.houseName : "")
        };
    }).sort((a, b) => (a.status === "pressing" ? 0 : 1) - (b.status === "pressing" ? 0 : 1) ||
        b.support - a.support || b.claimStrength - a.claimStrength || a.personId.localeCompare(b.personId));
    const pressing = claims.filter(claim => claim.status === "pressing");
    const strongest = pressing[0] || null;
    const candidates = s.regency.active && minorKing ? regentCandidates(s, minorKing) : [];
    const abdicationOptions = king && isAdult(king) && !s.regency.active ? abdicationCandidates(s, king) : [];
    const conflict = {
        ...s.civilConflict,
        houses: s.civilConflict.houses.map(house => ({
            ...house,
            name: house.name || houseById(house.id)?.familyName || house.id
        })),
        claimantName: s.civilConflict.claimantId
            ? (claims.find(claim => claim.personId === s.civilConflict.claimantId)?.claimantName || "")
            : ""
    };
    return {
        year: yearNow(),
        regency: {
            ...s.regency,
            regent: regent || null,
            regentName: regent ? personName(regent) : "",
            minorKing: minorKing || null,
            minorKingName: minorKing ? personName(minorKing) : "",
            majorityYear
        },
        regentCandidates: candidates,
        claims,
        pressingClaims: pressing,
        strongestClaim: strongest,
        civilConflict: conflict,
        usurpationRisk: usurpationRisk(s, strongest),
        abdicationCandidates: abdicationOptions,
        canAbdicate: Boolean(king && isAdult(king) && !s.regency.active && abdicationOptions.length),
        kingName: king ? personName(king) : "",
        costs: {
            regent: { ...ROYAL_REGENT_COST },
            settleClaim: { ...ROYAL_SETTLE_CLAIM_COST },
            usurpation: { ...ROYAL_USURPATION_COST },
            suppress: { ...ROYAL_SUPPRESS_COST }
        },
        history: s.crisisHistory.slice(-8).reverse(),
        abdicationHistory: s.abdicationHistory.slice(-5).reverse(),
        lastCrisisYear: s.lastCrisisYear
    };
}
