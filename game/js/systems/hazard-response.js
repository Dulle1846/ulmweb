// 1.2.20 — the player's answer to the weather.
//
// The hazard layer already rolls the season. This module owns what the realm
// does about it: a forecast from research, four real preparation plans,
// specialists and equipment, quarantine and aid, a per-disease ledger, partner
// realms with their own outbreaks, rare-event chains and the rebuild fund.
// It runs once per season and once per year over capped lists only.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { startOutbreak } from "./health.js";
import { invalidateHazardModifierCache } from "./hazard-modifiers.js";
import { DIPLOMATIC_REALMS } from "./diplomacy-config.js";
import {
    DISEASE_DEFAULT, HAZARD_CREWS, HAZARD_CREW_ORDER, RARE_CHAIN_BY_ID,
    RARE_CHAINS, RESPONSE_PLANS, RESPONSE_PLAN_ORDER, diseaseProfileFor, rareChainFor
} from "../world/hazard-expansion-data.js";
import { hazardRowsForClimate } from "../world/hazard-data.js";
import {
    addHazardScar, clearOneHazardScar, normalizeHazardScars, recordCorruptionScar,
    spreadHazardCorruption
} from "./hazard-scars.js";
import { canSpawnEntity, spawnEntity } from "../world/entities.js";
import { awakenCreature } from "./creatures.js";
import { getHouseholdSnapshot, getPopulationGrowthAllowance, getPopulationGrowthGate, recordPopulationGrowth } from "./population.js";
import { ensurePersonProfile } from "./people.js";

export const HAZARD_RESPONSE_VERSION = 1;
export const PARTNER_LIMIT = 4;
export const DISEASE_LIMIT = 6;
export const ACTION_HISTORY_LIMIT = 10;
export const INSURANCE_CAP = 120;
export const LOAN_AMOUNT = 60;
export const LOAN_PRINCIPAL = 72;
export const LOAN_TERM = 3;
export const LOAN_PAYMENT = 24;
export const MIGRANT_SETTLE_LIMIT = 2;

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const int = (value, fallback = 0) => Math.trunc(Number.isFinite(Number(value)) ? Number(value) : fallback);
const positive = value => Math.max(0, int(value));
const text = (value, length = 90) => String(value ?? "").trim().slice(0, length);
const seasonName = season => ["spring", "summer", "autumn", "winter"][season] || "spring";

function hash32(seed, salt, a = 0, b = 0) {
    let value = (Number(seed) >>> 0) ^ (Number(salt) >>> 0)
        ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b)
        ^ Math.imul((Number(state.year) | 0) + 1, 0xc2b2ae35);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

const roll01 = (key, a = 0, b = 0) => hash32(Number(state.worldSeed) || 1,
    Array.from(String(key)).reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7), a, b) / 0x100000000;

function pushAction(response, action) {
    response.lastActions.push({
        year: positive(state.year), season: int(state.seasonIndex, -1),
        kind: text(action.kind, 24), label: text(action.label, 80), text: text(action.text, 140)
    });
    if (response.lastActions.length > ACTION_HISTORY_LIMIT) {
        response.lastActions.splice(0, response.lastActions.length - ACTION_HISTORY_LIMIT);
    }
}

export function createHazardResponseState() {
    return {
        version: HAZARD_RESPONSE_VERSION,
        plan: null,
        planSeason: -1,
        planYear: 0,
        forecast: null,
        stockpile: 0,
        relief: 0,
        evacuationSeason: -1,
        evacuationYear: 0,
        quarantine: {
            active: false, disease: "", untilYear: 0, untilSeason: -1,
            tradeBan: false, startedYear: 0
        },
        crews: { fire: 0, rescue: 0, medical: 0, equipment: 0, veterans: 0 },
        insurance: 0,
        loan: { principal: 0, takenYear: 0, dueYear: 0 },
        resettled: 0,
        migrants: 0,
        arrivals: 0,
        lastActions: [],
        lastYear: 0
    };
}

function normalizeForecast(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const risks = (Array.isArray(value.risks) ? value.risks : []).slice(0, 4).map(entry => ({
        id: text(entry?.id, 48),
        label: text(entry?.label || entry?.id, 80),
        spec: text(entry?.spec, 16),
        risk: clamp01(entry?.risk),
        low: clamp01(entry?.low),
        high: clamp01(entry?.high)
    })).filter(entry => entry.label);
    return {
        season: clamp(int(value.season, -1), -1, 3),
        year: Math.min(9999, positive(value.year)),
        confidence: clamp01(value.confidence),
        risks,
        issuedYear: Math.min(9999, positive(value.issuedYear))
    };
}

export function normalizeHazardResponse(value) {
    const base = createHazardResponseState();
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    base.plan = RESPONSE_PLAN_ORDER.includes(source.plan) ? source.plan : null;
    base.planSeason = clamp(int(source.planSeason, -1), -1, 3);
    base.planYear = Math.min(9999, positive(source.planYear));
    base.forecast = normalizeForecast(source.forecast);
    base.stockpile = clamp(positive(source.stockpile), 0, 8);
    base.relief = clamp(positive(source.relief), 0, 4);
    base.evacuationSeason = clamp(int(source.evacuationSeason, -1), -1, 3);
    base.evacuationYear = Math.min(9999, positive(source.evacuationYear));
    const quarantine = source.quarantine && typeof source.quarantine === "object" ? source.quarantine : {};
    base.quarantine = {
        active: Boolean(quarantine.active),
        disease: text(quarantine.disease, 70),
        untilYear: Math.min(9999, positive(quarantine.untilYear)),
        untilSeason: clamp(int(quarantine.untilSeason, -1), -1, 3),
        tradeBan: Boolean(quarantine.tradeBan),
        startedYear: Math.min(9999, positive(quarantine.startedYear))
    };
    const crews = source.crews && typeof source.crews === "object" ? source.crews : {};
    for (const id of HAZARD_CREW_ORDER) {
        base.crews[id] = clamp(positive(crews[id]), 0, HAZARD_CREWS[id].max);
    }
    base.insurance = clamp(positive(source.insurance), 0, INSURANCE_CAP);
    const loan = source.loan && typeof source.loan === "object" ? source.loan : {};
    base.loan = {
        principal: clamp(positive(loan.principal), 0, LOAN_PRINCIPAL),
        takenYear: Math.min(9999, positive(loan.takenYear)),
        dueYear: Math.min(9999, positive(loan.dueYear))
    };
    base.resettled = Math.min(9999, positive(source.resettled));
    base.migrants = Math.min(9999, positive(source.migrants));
    base.arrivals = Math.min(9999, positive(source.arrivals));
    base.lastActions = Array.isArray(source.lastActions) ? source.lastActions.slice(-ACTION_HISTORY_LIMIT).map(entry => ({
        year: Math.min(9999, positive(entry?.year)),
        season: clamp(int(entry?.season, -1), -1, 3),
        kind: text(entry?.kind, 24),
        label: text(entry?.label, 80),
        text: text(entry?.text, 140)
    })).filter(entry => entry.text) : [];
    base.lastYear = Math.min(9999, positive(source.lastYear));
    return base;
}

export function ensureHazardResponse(entry) {
    if (!entry || typeof entry !== "object") return createHazardResponseState();
    entry.response = normalizeHazardResponse(entry.response);
    return entry.response;
}

function actionLocked(response, season, year) {
    return response.plan && response.planSeason === season && response.planYear === year;
}

function canPay(cost) {
    for (const [resource, amount] of Object.entries(cost || {})) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return resource;
    }
    return null;
}

function pay(cost) {
    for (const [resource, amount] of Object.entries(cost || {})) addResource(resource, -amount);
}

function pushHistory(entry, kind, line) {
    if (!Array.isArray(entry.history)) entry.history = [];
    entry.history.push({ year: positive(state.year), season: int(state.seasonIndex, -1), kind, text: text(line, 220) });
    if (entry.history.length > 48) entry.history.splice(0, entry.history.length - 48);
}

/** Player-chosen preparation for the current season. One plan per season. */
export function chooseHazardPlan(planId) {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const response = ensureHazardResponse(entry);
    const plan = RESPONSE_PLANS[planId];
    if (!plan) return { ok: false, reason: "UNKNOWN PLAN" };
    if (actionLocked(response, state.seasonIndex, state.year)) {
        return { ok: false, reason: "A PLAN IS ALREADY SET FOR THIS SEASON" };
    }
    const missing = canPay(plan.cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(plan.cost);
    response.plan = plan.id;
    response.planSeason = state.seasonIndex;
    response.planYear = state.year;
    if (plan.id === "stockpile") response.stockpile = clamp(response.stockpile + 2, 0, 8);
    if (plan.id === "relief") response.relief = clamp(response.relief + 1, 0, 4);
    if (plan.id === "evacuate") {
        response.evacuationSeason = state.seasonIndex;
        response.evacuationYear = state.year;
    }
    pushAction(response, { kind: "plan", label: plan.label, text: plan.note });
    pushHistory(entry, "plan", "PLAN · " + plan.label.toUpperCase() + " · " + plan.note);
    addLog("HAZARD PLAN · " + plan.label.toUpperCase(), "#9ab7a1", "hazard");
    return { ok: true, plan: plan.id, label: plan.label, cost: plan.cost, message: plan.note };
}

export function planReadiness(entry) {
    const response = normalizeHazardResponse(entry?.response);
    if (!response.plan || response.planSeason !== state.seasonIndex || response.planYear !== state.year) return 0;
    return RESPONSE_PLANS[response.plan]?.readiness || 0;
}

function forecastWeight(row, mitigation, confidenceRelief) {
    let weight = row.severity * 0.55;
    if (row.climates.length <= 6) weight += 0.12;
    weight -= clamp01(mitigation.score) * 0.22;
    weight += Number(state.environmentalHazards?.chronic?.climateDrift || 0) * 0.004;
    return clamp01(weight * confidenceRelief);
}

/**
 * The scriptorium's uncertain seasonal forecast. Confidence comes from real
 * research and from the protection survey; the same seed, season and year
 * always produce the same forecast.
 */
export function buildHazardForecast(entry, { season = state.seasonIndex, year = state.year } = {}) {
    const mitigation = entry?.mitigation || { score: 0, research: 0 };
    const climate = state.worldOptions?.climate || "temperate";
    const nextSeason = (int(season, 0) + 1) % 4;
    const nextYear = nextSeason === 0 ? Math.max(1, positive(year) + 1) : Math.max(1, positive(year));
    const confidence = clamp01(0.3 + clamp01(mitigation.research) * 0.5 + clamp01(mitigation.score) * 0.15);
    const rows = hazardRowsForClimate(climate).filter(row =>
        (row.mechanic.startsWith("hazard:") || row.mechanic.startsWith("magic:"))
        && (!row.seasons || row.seasons.includes(nextSeason))
    );
    const risks = [];
    for (const row of rows) {
        const noise = roll01("forecast:" + row.id, nextSeason, nextYear);
        const central = forecastWeight(row, mitigation, 1 - (1 - confidence) * 0.3);
        const risk = clamp01(central * (0.82 + noise * 0.36));
        if (risk < 0.03) continue;
        const band = (1 - confidence) * 0.26;
        risks.push({
            id: row.id, label: row.label, spec: row.spec,
            risk,
            low: clamp01(risk - band),
            high: clamp01(risk + band)
        });
    }
    risks.sort((a, b) => b.risk - a.risk || a.spec.localeCompare(b.spec));
    return {
        season: nextSeason,
        year: nextYear,
        confidence,
        risks: risks.slice(0, 4),
        issuedYear: Math.max(1, positive(year))
    };
}

export function refreshHazardForecast(entry) {
    if (!entry || typeof entry !== "object") return null;
    const response = ensureHazardResponse(entry);
    response.forecast = buildHazardForecast(entry, { season: state.seasonIndex, year: state.year });
    return response.forecast;
}

export function getHazardForecast() {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return buildHazardForecast(null);
    return normalizeHazardResponse(entry.response).forecast || buildHazardForecast(entry);
}

/** A disease record with route, contagion, lethality and duration. */
export function createDiseaseRecord(mechanic, label, severity, source = "hazard") {
    const profile = diseaseProfileFor(mechanic);
    return {
        id: String(mechanic || profile.id).slice(0, 48),
        label: text(label || profile.label, 80),
        cases: Math.max(1, Math.round(1 + clamp01(severity) * 4)),
        year: positive(state.year),
        source: text(source, 32),
        profile: profile.id,
        vector: profile.vector,
        water: Boolean(profile.water),
        contagion: profile.contagion,
        lethality: profile.lethality,
        duration: profile.duration,
        deaths: 0,
        recovered: 0,
        active: true,
        lastYear: positive(state.year)
    };
}

export function registerHazardDisease(entry, record) {
    if (!entry || !record) return null;
    if (!Array.isArray(entry.diseases)) entry.diseases = [];
    const existing = entry.diseases.find(item => item.id === record.id);
    if (existing) {
        existing.cases = Math.min(99, positive(existing.cases) + positive(record.cases));
        existing.year = Math.min(positive(existing.year) || positive(state.year), positive(state.year));
        existing.lastYear = positive(state.year);
        existing.active = true;
        return existing;
    }
    entry.diseases.push(record);
    if (entry.diseases.length > DISEASE_LIMIT) entry.diseases.splice(0, entry.diseases.length - DISEASE_LIMIT);
    return record;
}

function quarantineActive(entry) {
    const response = normalizeHazardResponse(entry?.response);
    const q = response.quarantine;
    if (!q.active) return false;
    if (q.untilYear > positive(state.year)) return true;
    if (q.untilYear === positive(state.year) && q.untilSeason >= int(state.seasonIndex, 0)) return true;
    return false;
}

/** Quarantine the realm, or lift an existing order. */
export function setHazardQuarantine(active = true, { tradeBan = true } = {}) {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const response = ensureHazardResponse(entry);
    if (!active) {
        response.quarantine.active = false;
        response.quarantine.tradeBan = false;
        pushAction(response, { kind: "quarantine", label: "Quarantine lifted", text: "Trade and movement resume." });
        addLog("THE QUARANTINE IS LIFTED", "#9ab7a1", "health");
        return { ok: true, active: false, message: "quarantine lifted" };
    }
    if (response.quarantine.active && quarantineActive(entry)) {
        return { ok: false, reason: "A QUARANTINE IS ALREADY IN FORCE" };
    }
    const cost = { gold: 14, food: 6 };
    const missing = canPay(cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(cost);
    const disease = entry.diseases?.find(item => item.active && positive(item.cases) > 0);
    response.quarantine = {
        active: true,
        disease: disease ? text(disease.label, 70) : "all fevers",
        untilYear: positive(state.year) + 1,
        untilSeason: int(state.seasonIndex, 0),
        tradeBan: Boolean(tradeBan),
        startedYear: positive(state.year)
    };
    if (state.health) state.health.containment = Math.max(Number(state.health.containment) || 0, 55);
    for (const partner of state.environmentalHazards.partners || []) {
        if (partner.outbreak) partner.request = false;
    }
    pushAction(response, { kind: "quarantine", label: "Quarantine declared", text: "Sick households are isolated and caravans are held." });
    pushHistory(entry, "health", "QUARANTINE · " + response.quarantine.disease.toUpperCase());
    addLog("QUARANTINE DECLARED · " + response.quarantine.disease.toUpperCase(), "#c48a8a", "health");
    return { ok: true, active: true, disease: response.quarantine.disease, message: "quarantine declared" };
}

export function advanceHazardDiseases(entry, events = []) {
    if (!entry || !Array.isArray(entry.diseases)) return { cases: 0, deaths: 0, spread: 0 };
    const response = ensureHazardResponse(entry);
    const year = positive(state.year);
    const medical = clamp01(entry.mitigation?.medical);
    const sanitation = clamp01((Number(state.health?.sanitation?.score) || 0) / 100);
    const quarantined = quarantineActive(entry);
    let cases = 0, deaths = 0, spread = 0;
    const surviving = [];
    for (const disease of entry.diseases) {
        if (!disease || !disease.id) continue;
        const profile = diseaseProfileFor(disease.id);
        disease.vector = disease.vector || profile.vector;
        disease.water = disease.water ?? profile.water;
        disease.contagion = Number.isFinite(Number(disease.contagion)) ? Number(disease.contagion) : profile.contagion;
        disease.lethality = Number.isFinite(Number(disease.lethality)) ? Number(disease.lethality) : profile.lethality;
        disease.duration = Math.max(1, positive(disease.duration) || profile.duration);
        disease.deaths = positive(disease.deaths);
        disease.recovered = positive(disease.recovered);
        if (!disease.active) {
            if (year - positive(disease.lastYear) <= 2) surviving.push(disease);
            continue;
        }
        disease.lastYear = year;
        const age = year - positive(disease.year);
        const crowding = 0.45 + (1 - sanitation) * 0.55;
        const quarantineRelief = quarantined ? 0.28 : 1;
        const growth = clamp(disease.contagion * crowding * quarantineRelief * (1 - medical * 0.45), 0, 1.4);
        const current = Math.max(1, positive(disease.cases));
        const nextCases = clamp(Math.round(current * (1 + growth * 0.34)), 1, 99);
        const deathsNow = Math.round(nextCases * disease.lethality * (quarantined ? 0.04 : 0.08));
        const recoveredNow = Math.round(nextCases * 0.12 * medical);
        disease.cases = Math.max(0, nextCases + (age > disease.duration ? -Math.max(1, Math.round(nextCases * 0.35)) : 0));
        disease.deaths += deathsNow;
        disease.recovered += recoveredNow;
        cases += disease.cases;
        deaths += deathsNow;
        if (disease.cases >= 7 && !state.health?.outbreakActive) {
            startOutbreak({ severity: clamp(Math.ceil(disease.cases / 6), 1, 3), disease: disease.label });
            if (state.health) state.health.containment = quarantined ? 70 : Number(state.health.containment) || 0;
            events.push("OUTBREAK DECLARED · " + disease.label.toUpperCase());
        }
        if (quarantined) {
            disease.cases = Math.max(0, Math.round(disease.cases * 0.72));
            if (state.health) state.health.containment = Math.max(Number(state.health.containment) || 0, 60 + response.crews.medical * 4);
        }
        if (!quarantined && !response.quarantine.tradeBan && roll01("disease-spread:" + disease.id, year, disease.cases) < disease.contagion * (disease.trade ?? profile.trade) * 0.5) {
            spread++;
            for (const partner of entry.partners || []) {
                if (!partner.outbreak && roll01("partner-spread:" + partner.id + ":" + disease.id, year, 1) < 0.45) partner.outbreak = true;
            }
        }
        if (disease.cases <= 0 || age > disease.duration + 2) {
            disease.active = false;
            disease.cases = 0;
            surviving.push(disease);
        } else {
            surviving.push(disease);
        }
        if (deathsNow > 0 && entry.losses) entry.losses.ill = positive(entry.losses.ill) + deathsNow;
    }
    entry.diseases = surviving.slice(-DISEASE_LIMIT);
    return { cases, deaths, spread };
}

export function treatHazardDisease(diseaseId = null) {
    const entry = state.environmentalHazards;
    if (!entry || !Array.isArray(entry.diseases)) return { ok: false, reason: "NO DISEASE LEDGER" };
    const target = diseaseId ? entry.diseases.find(item => item.id === diseaseId) : entry.diseases.find(item => item.active);
    if (!target) return { ok: false, reason: "NO ACTIVE DISEASE" };
    const cost = { gold: 10, food: 4 };
    const missing = canPay(cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(cost);
    target.cases = Math.max(0, positive(target.cases) - 3);
    target.recovered = positive(target.recovered) + 3;
    if (entry.response) pushAction(entry.response, { kind: "medicine", label: "Treat " + target.label, text: "Three cases treated." });
    if (state.health) state.health.containment = Math.max(Number(state.health.containment) || 0, 45);
    addLog("DISEASE TREATED · " + target.label.toUpperCase(), "#9ab7a1", "health");
    return { ok: true, disease: target.id, label: target.label, cases: target.cases, message: "cases treated" };
}

export function trainHazardCrew(crewId) {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const response = ensureHazardResponse(entry);
    const crew = HAZARD_CREWS[crewId];
    if (!crew) return { ok: false, reason: "UNKNOWN CREW" };
    if (response.crews[crew.id] >= crew.max) return { ok: false, reason: "CREW IS AT FULL STRENGTH" };
    const missing = canPay(crew.cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(crew.cost);
    response.crews[crew.id] += 1;
    pushAction(response, { kind: "crew", label: crew.label, text: crew.note });
    pushHistory(entry, "crew", "CREW · " + crew.label.toUpperCase() + " · " + response.crews[crew.id] + "/" + crew.max);
    addLog("HAZARD CREW READY · " + crew.label.toUpperCase(), "#9ab7a1", "hazard");
    return { ok: true, crew: crew.id, level: response.crews[crew.id], message: crew.note };
}

export function payHazardInsurance(entry, amount) {
    const response = ensureHazardResponse(entry);
    const claim = Math.min(response.insurance, Math.max(0, Math.round(Number(amount) || 0)));
    if (claim <= 0) return 0;
    response.insurance -= claim;
    addResource("gold", claim);
    if (entry.losses) entry.losses.gold = Math.max(0, positive(entry.losses.gold) - claim);
    if (entry.response) pushAction(entry.response, { kind: "insurance", label: "Insurance claim", text: claim + " gold released from the reserve." });
    return claim;
}

export function fundHazardInsurance() {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const response = ensureHazardResponse(entry);
    if (response.insurance >= INSURANCE_CAP) return { ok: false, reason: "THE EMERGENCY FUND IS FULL" };
    const cost = { gold: 20 };
    const missing = canPay(cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(cost);
    response.insurance = Math.min(INSURANCE_CAP, response.insurance + 20);
    pushAction(response, { kind: "insurance", label: "Emergency fund", text: "20 gold set aside for repairs." });
    addLog("EMERGENCY FUND · " + response.insurance + "G RESERVED", "#c8b184", "disaster");
    return { ok: true, fund: response.insurance, message: "emergency fund increased" };
}

export function takeHazardLoan() {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const response = ensureHazardResponse(entry);
    if (response.loan.principal > 0) return { ok: false, reason: "AN EMERGENCY LOAN IS ALREADY OPEN" };
    response.loan = {
        principal: LOAN_PRINCIPAL,
        takenYear: positive(state.year),
        dueYear: positive(state.year) + LOAN_TERM
    };
    addResource("gold", LOAN_AMOUNT);
    pushAction(response, { kind: "loan", label: "Emergency loan", text: LOAN_AMOUNT + " gold borrowed; " + LOAN_PRINCIPAL + " gold due over three years." });
    addLog("EMERGENCY LOAN · +" + LOAN_AMOUNT + "G", "#c8b184", "disaster");
    return { ok: true, gold: LOAN_AMOUNT, principal: LOAN_PRINCIPAL, message: "loan taken" };
}

export function resettleHazardGround() {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const scars = normalizeHazardScars(entry.scars);
    if (!scars.lost.length) return { ok: false, reason: "NO LOST GROUND TO RESETTLE" };
    const cost = { wood: 12, gold: 10 };
    const missing = canPay(cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(cost);
    const mark = clearOneHazardScar(entry, "lost");
    const response = ensureHazardResponse(entry);
    response.resettled = Math.min(9999, response.resettled + 1);
    state.morale = Math.min(100, (Number(state.morale) || 0) + 2);
    if (entry.chronic) entry.chronic.lostGround = Math.max(0, positive(entry.chronic.lostGround) - 1);
    pushAction(response, { kind: "resettle", label: "Ground resettled", text: "A lost plot is cleared and returned to use." });
    addLog("LOST GROUND RESETTLED", "#a8c79a", "disaster");
    return { ok: true, cleared: mark ? { x: mark.x, y: mark.y } : null, message: "lost ground resettled" };
}

function partnerName(definition) {
    return text(definition?.name || definition?.label || definition?.id || "Neighbour", 60);
}

export function normalizeHazardPartners(value) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const partners = [];
    for (const item of source) {
        const id = text(item?.id, 48);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const outbreak = Boolean(item?.outbreak);
        const epizootic = Boolean(item?.epizootic);
        const savedCrisis = ["none", "outbreak", "epizootic", "drought", "flood", "fire"].includes(item?.crisis)
            ? item.crisis : "none";
        partners.push({
            id,
            name: text(item?.name || item?.id, 60),
            relation: clamp(int(item?.relation, 0), 0, 100),
            outbreak,
            epizootic,
            crisis: outbreak ? "outbreak" : epizootic ? "epizootic" : savedCrisis,
            refugees: Math.min(99, positive(item?.refugees)),
            tradePenalty: clamp(Number(item?.tradePenalty) || 0, 0, 0.25),
            request: Boolean(item?.request),
            aidYear: Math.min(9999, positive(item?.aidYear)),
            lastYear: Math.min(9999, positive(item?.lastYear)),
            pressure: clamp01(item?.pressure)
        });
        if (partners.length >= PARTNER_LIMIT) break;
    }
    return partners;
}

function diplomacyRealm(id) {
    const realms = state.diplomacy?.realms;
    if (!Array.isArray(realms)) return null;
    return realms.find(realm => String(realm.id) === String(id)) || null;
}

function findPartner(entry, id) {
    const partners = normalizeHazardPartners(entry.partners);
    return partners.find(partner => partner.id === String(id)) || null;
}

export function advanceHazardPartners(entry, events = []) {
    if (!entry || typeof entry !== "object") return [];
    const year = positive(state.year);
    const response = ensureHazardResponse(entry);
    const previous = normalizeHazardPartners(entry.partners);
    const byId = new Map(previous.map(partner => [partner.id, partner]));
    const partners = [];
    const climate = state.worldOptions?.climate || "temperate";
    const crisisOptions = climate === "arid" || climate === "savanna"
        ? ["drought", "fire"]
        : climate === "coastal" || climate === "swamp"
            ? ["flood", "outbreak"] : ["drought", "flood", "fire"];
    for (const definition of DIPLOMATIC_REALMS.slice(0, PARTNER_LIMIT)) {
        const saved = byId.get(definition.id) || {};
        const realm = diplomacyRealm(definition.id);
        const relation = clamp(int(realm?.relation ?? saved.relation, 35), 0, 100);
        const partner = {
            id: definition.id,
            name: partnerName(definition),
            relation,
            outbreak: Boolean(saved.outbreak),
            epizootic: Boolean(saved.epizootic),
            crisis: saved.crisis || "none",
            crisisYear: positive(saved.crisisYear),
            refugees: Math.min(99, positive(saved.refugees)),
            tradePenalty: clamp(Number(saved.tradePenalty) || 0, 0, 0.25),
            request: Boolean(saved.request),
            aidYear: positive(saved.aidYear),
            lastYear: positive(saved.lastYear),
            pressure: clamp01(saved.pressure)
        };
        const hadCrisis = partner.crisis !== "none";
        if (state.health?.outbreakActive && !quarantineActive(entry)
            && roll01("partner-outbreak:" + partner.id, year, 1) < 0.38) {
            if (!partner.outbreak) events.push("THE FEVER REACHES " + partner.name.toUpperCase());
            partner.outbreak = true;
        }
        if (entry.active?.some(hazard => hazard.mechanic === "hazard:epizootic")
            && roll01("partner-epizootic:" + partner.id, year, 2) < 0.34) {
            partner.epizootic = true;
        }
        if (partner.outbreak) partner.crisis = "outbreak";
        else if (partner.epizootic) partner.crisis = "epizootic";
        else if (partner.crisis !== "none") {
            // A drought, flood or fire in a neighbour burns out after about two
            // years unless the player keeps sending aid and the realm stays open.
            if (!partner.crisisYear) partner.crisisYear = year;
            if (year - partner.crisisYear >= 2 && roll01("partner-recovery:" + partner.id, year, 6) < 0.45) {
                partner.crisis = "none";
                partner.crisisYear = 0;
                partner.tradePenalty = 0;
                events.push(partner.name.toUpperCase() + " RECOVERS FROM THE " + String(saved.crisis || "crisis").toUpperCase());
            }
        }
        if (partner.crisis === "none" && !hadCrisis && roll01("partner-crisis:" + partner.id, year, 4) < 0.16) {
            partner.crisis = crisisOptions[Math.floor(roll01("partner-crisis-kind:" + partner.id, year, 5) * crisisOptions.length)];
            partner.crisisYear = year;
            events.push(partner.name.toUpperCase() + " SUFFERS A " + partner.crisis.toUpperCase());
        }
        if (partner.crisis !== "none") {
            partner.pressure = clamp01(partner.pressure + 0.18);
            partner.tradePenalty = Math.max(partner.tradePenalty,
                partner.crisis === "outbreak" || partner.crisis === "epizootic" ? 0.08 : 0.05);
            if (realm && partner.lastYear < year) realm.relation = clamp((Number(realm.relation) || 0) - 1, 0, 100);
            partner.request = relation >= 25;
            if (relation >= 35 && partner.refugees < 3 && response.migrants < 8
                && roll01("partner-refugees:" + partner.id, year, 7) < 0.55) {
                partner.refugees += 1;
                response.migrants = Math.min(9999, response.migrants + 1);
                events.push("REFUGEES FROM " + partner.name.toUpperCase() + " ARRIVE AT THE BORDER");
            }
            if (partner.crisis === "outbreak" && !quarantineActive(entry) && !state.health?.outbreakActive
                && roll01("import-fever:" + partner.id, year, 3) < 0.3) {
                registerHazardDisease(entry, createDiseaseRecord(
                    "hazard:regional-disease",
                    "Fever from " + partner.name,
                    0.5,
                    "partner:" + partner.id
                ));
                events.push("A FEVER ARRIVES FROM " + partner.name.toUpperCase());
            }
        } else {
            partner.pressure = clamp01(partner.pressure * 0.72);
            partner.request = false;
            partner.tradePenalty = 0;
            partner.refugees = Math.max(0, partner.refugees - 1);
        }
        if (partner.aidYear && year - partner.aidYear > 3) {
            partner.outbreak = false;
            partner.epizootic = false;
            partner.crisis = "none";
            partner.crisisYear = 0;
            partner.tradePenalty = 0;
        }
        partner.lastYear = year;
        partners.push(partner);
    }
    entry.partners = partners;
    return partners;
}

export function sendHazardAid(partnerId) {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const partner = findPartner(entry, partnerId);
    if (!partner) return { ok: false, reason: "UNKNOWN NEIGHBOUR" };
    if (!partner.outbreak && (!partner.crisis || partner.crisis === "none")) {
        return { ok: false, reason: "THIS NEIGHBOUR HAS NO CRISIS" };
    }
    const cost = { food: 10, gold: 8 };
    const missing = canPay(cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(cost);
    partner.outbreak = false;
    partner.epizootic = false;
    partner.crisis = "none";
    partner.crisisYear = 0;
    partner.tradePenalty = 0;
    partner.refugees = Math.max(0, partner.refugees - 1);
    partner.request = false;
    partner.aidYear = positive(state.year);
    partner.relation = clamp(partner.relation + 5, 0, 100);
    entry.partners = normalizeHazardPartners(entry.partners).map(item => item.id === partner.id ? { ...partner } : item);
    const realm = diplomacyRealm(partner.id);
    if (realm) realm.relation = clamp((Number(realm.relation) || 0) + 5, 0, 100);
    state.morale = Math.min(100, (Number(state.morale) || 0) + 1);
    const response = ensureHazardResponse(entry);
    pushAction(response, { kind: "aid", label: "Aid to " + partner.name, text: "Stores and healers sent across the border." });
    pushHistory(entry, "partner", "AID SENT TO " + partner.name.toUpperCase());
    addLog("AID SENT TO " + partner.name.toUpperCase(), "#9ab7a1", "diplomacy");
    invalidateHazardModifierCache();
    return { ok: true, partner: partner.id, relation: partner.relation, message: "aid sent" };
}

export function requestHazardAid() {
    const entry = state.environmentalHazards;
    if (!entry || typeof entry !== "object") return { ok: false, reason: "NO REALM HAZARD STATE" };
    const response = ensureHazardResponse(entry);
    const partner = (entry.partners || []).find(item => item.relation >= 45
        && !item.outbreak && (!item.crisis || item.crisis === "none"));
    if (!partner) return { ok: false, reason: "NO FRIENDLY NEIGHBOUR CAN HELP" };
    if (positive(state.year) - positive(partner.aidYear) < 2) return { ok: false, reason: "THIS NEIGHBOUR ALREADY HELPED RECENTLY" };
    partner.aidYear = positive(state.year);
    partner.relation = clamp(partner.relation - 3, 0, 100);
    const realm = diplomacyRealm(partner.id);
    if (realm) realm.relation = clamp((Number(realm.relation) || 0) - 3, 0, 100);
    const food = Math.min(18, 8 + Math.round(partner.relation / 8));
    addResource("food", food);
    response.migrants = Math.min(9999, response.migrants + 2);
    state.morale = Math.min(100, (Number(state.morale) || 0) + 1);
    pushAction(response, { kind: "aid", label: "Aid from " + partner.name, text: food + " food and two households arrive." });
    addLog("AID FROM " + partner.name.toUpperCase() + " · FOOD +" + food, "#9ab7a1", "diplomacy");
    invalidateHazardModifierCache();
    return { ok: true, partner: partner.id, food, message: "aid received" };
}

/** Spawn one cursed beast when the animal shift is strong enough. */
export function awakenCursedCreature(entry, events = []) {
    const magic = entry?.magic;
    if (!magic || Number(magic.cursed) < 0.3) return null;
    const existing = (state.entities || []).filter(entity => !entity.dead && entity.isCursedCreature).length;
    if (existing >= 2) return null;
    if (!canSpawnEntity(TYPE.DRAGON)) return null;
    const king = (state.entities || []).find(entity => !entity.dead && entity.isKing);
    if (!king) return null;
    const creature = spawnEntity(Math.round(king.x) + 2 + existing, Math.round(king.y) + 1, TYPE.DRAGON);
    if (!creature) return null;
    awakenCreature(creature, "troll", { name: "Cursed Beast" });
    creature.isCursedCreature = true;
    if (creature.creature) {
        creature.creature.name = "Cursed Beast";
        creature.creature.temperament = "twisted by the old ground";
        creature.creature.health = 70;
    }
    events.push("A CURSED BEAST WALKS OUT OF THE OLD GROUND");
    return creature;
}

export function selectRareChain(entry, roll = roll01("rare-chain", state.year, 1)) {
    const chain = rareChainFor(roll);
    entry.rare = {
        id: "rare-" + positive(state.year),
        label: chain.label,
        year: positive(state.year),
        years: 0,
        chainId: chain.id,
        stage: 0,
        endsYear: positive(state.year) + chain.years,
        choice: null,
        resolved: false,
        lastYear: 0
    };
    if (entry.scars && (chain.id === "ore-vein" || chain.id === "harvest-curse" || chain.id === "plague-valley")) {
        const keep = (state.entities || []).find(entity => !entity.dead && entity.type === TYPE.KEEP);
        recordCorruptionScar(entry, Math.floor((keep?.x || (Number(state.worldW) || 2) / 2)) + 2, Math.floor((keep?.y || (Number(state.worldH) || 2) / 2)) + 1);
    }
    return chain;
}

export function advanceRareChain(entry, events = [], hooks = {}) {
    const rare = entry?.rare;
    if (!rare || !rare.chainId || rare.resolved) return null;
    const chain = RARE_CHAIN_BY_ID[rare.chainId];
    if (!chain) {
        rare.resolved = true;
        return null;
    }
    const year = positive(state.year);
    if (year > positive(rare.endsYear)) {
        rare.resolved = true;
        rare.outcome = "faded";
        events.push("THE " + chain.label.toUpperCase() + " FADES WITHOUT AN ANSWER");
        return null;
    }
    if (positive(rare.lastYear) >= year) return null;
    rare.lastYear = year;
    rare.stage = Math.min(chain.years, Math.max(0, year - positive(rare.year)));
    const annual = chain.annual || {};
    if (annual.food) {
        const loss = Math.min(Number(state.resources?.food) || 0, Math.abs(annual.food));
        if (loss > 0) { addResource("food", -loss); if (entry.losses) entry.losses.food = positive(entry.losses.food) + loss; }
    }
    if (annual.gold > 0) addResource("gold", annual.gold);
    if (annual.gold < 0) {
        const loss = Math.min(Number(state.resources?.gold) || 0, Math.abs(annual.gold));
        if (loss > 0) { addResource("gold", -loss); if (entry.losses) entry.losses.gold = positive(entry.losses.gold) + loss; }
    }
    if (annual.stone > 0) addResource("stone", annual.stone);
    if (annual.morale) state.morale = clamp((Number(state.morale) || 0) + annual.morale, 0, 100);
    if (annual.corruption) entry.magic.corruption = clamp01(entry.magic.corruption + annual.corruption);
    if (annual.disease && roll01("rare-disease:" + chain.id, year, 1) < annual.disease) {
        registerHazardDisease(entry, createDiseaseRecord("hazard:regional-disease", chain.label + " fever", 0.5, "rare"));
    }
    if (annual.fields && typeof hooks.damageFields === "function") hooks.damageFields(annual.fields, chain.label);
    events.push("RARE EVENT · " + chain.label.toUpperCase() + " · YEAR " + Math.max(1, rare.stage + 1));
    return chain;
}

export function chooseRareEvent(choiceId) {
    const entry = state.environmentalHazards;
    const rare = entry?.rare;
    if (!rare || !rare.chainId) return { ok: false, reason: "NO RARE EVENT IS ACTIVE" };
    if (rare.resolved) return { ok: false, reason: "THIS RARE EVENT IS ALREADY SETTLED" };
    const chain = RARE_CHAIN_BY_ID[rare.chainId];
    const choice = chain?.choices?.find(item => item.id === choiceId);
    if (!choice) return { ok: false, reason: "UNKNOWN DECISION" };
    const missing = canPay(choice.cost);
    if (missing) return { ok: false, reason: "NOT ENOUGH " + missing.toUpperCase() };
    pay(choice.cost);
    const response = ensureHazardResponse(entry);
    if (choice.effect === "cleanse") {
        entry.magic.corruption = clamp01(entry.magic.corruption - 0.3);
        clearOneHazardScar(entry, "corruption");
        entry.magic.wards = clamp01(entry.magic.wards + 0.15);
    } else if (choice.effect === "quarantine") {
        response.quarantine = {
            active: true, disease: chain.label, untilYear: positive(state.year) + 2,
            untilSeason: int(state.seasonIndex, 0), tradeBan: true, startedYear: positive(state.year)
        };
        for (const disease of entry.diseases || []) disease.cases = Math.round(positive(disease.cases) * 0.6);
    } else if (choice.effect === "treat") {
        for (const disease of entry.diseases || []) {
            disease.cases = Math.max(0, positive(disease.cases) - 3);
            disease.recovered = positive(disease.recovered) + 3;
        }
        state.morale = clamp((Number(state.morale) || 0) + 2, 0, 100);
    } else if (choice.effect === "settle") {
        response.resettled = Math.min(9999, response.resettled + 4);
        response.migrants = Math.min(9999, response.migrants + 4);
        state.morale = clamp((Number(state.morale) || 0) + 4, 0, 100);
    } else if (choice.effect === "extend") {
        rare.endsYear = positive(rare.endsYear) + 2;
        response.insurance = Math.min(INSURANCE_CAP, response.insurance + 12);
    } else if (choice.effect === "corruption") {
        entry.magic.corruption = clamp01(entry.magic.corruption + 0.1);
        addResource("stone", 10);
    }
    rare.resolved = true;
    rare.choice = choice.id;
    rare.outcome = choice.text;
    pushAction(response, { kind: "rare", label: chain.label + " · " + choice.label, text: choice.text });
    pushHistory(entry, "rare", chain.label.toUpperCase() + " · " + choice.label.toUpperCase());
    addLog("RARE DECISION · " + chain.label.toUpperCase() + " · " + choice.label.toUpperCase(), "#b08cc4", "hazard");
    return { ok: true, rare: rare.chainId, choice: choice.id, resolved: rare.resolved, message: choice.text };
}

function serviceLoan(entry, events = []) {
    const response = ensureHazardResponse(entry);
    if (response.loan.principal <= 0) return 0;
    const payment = Math.min(LOAN_PAYMENT, response.loan.principal, Math.max(0, Number(state.resources?.gold) || 0));
    if (payment > 0) addResource("gold", -payment);
    response.loan.principal = Math.max(0, response.loan.principal - payment);
    if (payment < LOAN_PAYMENT && state.morale != null) {
        state.morale = Math.max(0, Number(state.morale) - 2);
        events.push("THE EMERGENCY LOAN IS UNPAID · MORALE FALLS");
    } else if (response.loan.principal > 0) {
        events.push("EMERGENCY LOAN REPAID · " + payment + "G");
    } else {
        response.loan = { principal: 0, takenYear: 0, dueYear: 0 };
        events.push("THE EMERGENCY LOAN IS CLEARED");
    }
    return payment;
}

/** Use one point of dry stock to soften a food or water loss. */
export function consumeHazardStockpile(entry) {
    const response = normalizeHazardResponse(entry?.response);
    if (response.stockpile <= 0) return 0;
    response.stockpile -= 1;
    if (entry) entry.response = response;
    return 1;
}

export function hazardEvacuationActive(entry) {
    const response = normalizeHazardResponse(entry?.response);
    return response.evacuationSeason === state.seasonIndex && response.evacuationYear === state.year;
}

export function hazardReliefActive(entry) {
    return normalizeHazardResponse(entry?.response).relief > 0;
}

export function consumeHazardRelief(entry) {
    const response = normalizeHazardResponse(entry?.response);
    if (response.relief <= 0) return false;
    response.relief -= 1;
    if (entry) entry.response = response;
    return true;
}

export function isHazardQuarantined(entry) {
    return quarantineActive(entry);
}

/**
 * Turn waiting refugee households into real residents. This is deliberately
 * annual and capped: it uses the same housing, food, morale and yearly-growth
 * gates as ordinary immigration, so a hazard cannot spawn a parallel village.
 * The waiting pool stays in `response.migrants`; only a successfully housed
 * person is removed from it.
 */
export function settleHazardMigrants(entry, events = []) {
    if (!entry || typeof entry !== "object") return 0;
    const response = ensureHazardResponse(entry);
    if (response.migrants <= 0) return 0;
    const economy = state.economy || (state.economy = {});
    if (Number(economy.growthYear) !== positive(state.year)) {
        economy.growthYear = positive(state.year);
        economy.growthThisYear = 0;
    }
    if ((Number(economy.growthThisYear) || 0) >= getPopulationGrowthAllowance()) return 0;
    const gate = getPopulationGrowthGate();
    if (!gate.ok) return 0;

    let settled = 0;
    while (response.migrants > 0 && settled < MIGRANT_SETTLE_LIMIT) {
        if ((Number(economy.growthThisYear) || 0) >= getPopulationGrowthAllowance()) break;
        const home = getHouseholdSnapshot().homes
            .filter(item => item.residents < item.capacity)
            .sort((a, b) => a.residents - b.residents || a.y - b.y || a.x - b.x)[0];
        if (!home || !canSpawnEntity(TYPE.VILLAGER)) break;
        const offset = hash32(Number(state.worldSeed) || 1, 0x53455454, positive(state.year), settled);
        const villager = spawnEntity(
            home.x + (offset % 3) - 1,
            home.y + (Math.floor(offset / 3) % 3) - 1,
            TYPE.VILLAGER
        );
        if (!villager) break;
        villager.home = { x: home.x, y: home.y };
        villager.anchor = { x: home.x, y: home.y };
        villager.householdId = "house:" + home.x + ":" + home.y;
        villager.civicOrigin = "hazard-arrival";
        villager.jobRefreshTimer = 0;
        villager.lastAgedYear = positive(state.year);
        const person = ensurePersonProfile(villager);
        person.role = "newcomer";
        person.goals = ["security", "family"];
        response.migrants -= 1;
        response.arrivals += 1;
        recordPopulationGrowth({ immigration: true });
        settled++;
    }
    if (settled > 0) {
        events.push(settled + " REFUGEE HOUSEHOLD" + (settled === 1 ? "" : "S") + " SETTLE IN THE REALM");
        pushAction(response, {
            kind: "settle", label: "Refugees housed",
            text: settled + " household" + (settled === 1 ? "" : "s") + " moved from the border into real homes."
        });
        pushHistory(entry, "partner", settled + " REFUGEE HOUSEHOLD" + (settled === 1 ? "" : "S") + " SETTLED");
        addLog(settled + " REFUGEE HOUSEHOLD" + (settled === 1 ? "" : "S") + " SETTLED", "#9ab7a1", "diplomacy");
    }
    return settled;
}

/**
 * One bounded annual response pass. Called after the hazard year has rolled so
 * the forecast reflects the new burden and every counter uses the same year.
 */
export function advanceHazardResponse(entry, events = [], hooks = {}) {
    if (!entry || typeof entry !== "object") return { skipped: true };
    const response = ensureHazardResponse(entry);
    if (response.lastYear === positive(state.year)) return { skipped: true };
    response.lastYear = positive(state.year);
    const disease = advanceHazardDiseases(entry, events);
    const partners = advanceHazardPartners(entry, events);
    advanceRareChain(entry, events, hooks);
    awakenCursedCreature(entry, events);
    if (entry.magic?.corruption > 0.35) spreadHazardCorruption(entry, entry.magic.corruption > 0.7 ? 2 : 1);
    serviceLoan(entry, events);
    const settled = settleHazardMigrants(entry, events);
    refreshHazardForecast(entry);
    invalidateHazardModifierCache();
    return {
        skipped: false,
        disease,
        partners: partners.length,
        settled,
        plan: response.plan,
        fund: response.insurance,
        loan: response.loan.principal,
        forecast: response.forecast
    };
}

/** Read-only snapshot for the panel and tests. */
export function getHazardResponseSnapshot() {
    const entry = state.environmentalHazards || {};
    const response = normalizeHazardResponse(entry.response);
    const forecast = response.forecast || buildHazardForecast(entry);
    return {
        ...response,
        forecast,
        planDefinition: response.plan ? RESPONSE_PLANS[response.plan] : null,
        plans: RESPONSE_PLAN_ORDER.map(id => ({ ...RESPONSE_PLANS[id], cost: { ...RESPONSE_PLANS[id].cost } })),
        crewsDefinition: HAZARD_CREW_ORDER.map(id => ({ ...HAZARD_CREWS[id], cost: { ...HAZARD_CREWS[id].cost } })),
        partners: normalizeHazardPartners(entry.partners),
        diseases: (entry.diseases || []).map(item => ({ ...item })),
        rare: entry.rare ? { ...entry.rare } : null,
        scars: normalizeHazardScars(entry.scars),
        quarantineActive: quarantineActive(entry),
        stockpile: response.stockpile,
        evacuationActive: hazardEvacuationActive(entry),
        reliefActive: response.relief,
        loanPayment: LOAN_PAYMENT,
        insuranceCap: INSURANCE_CAP
    };
}

export const __hazardResponseInternals = {
    roll01, forecastWeight, diseaseProfileFor, createDiseaseRecord,
    quarantineActive, pushHistory, addHazardScar, DISEASE_DEFAULT
};
