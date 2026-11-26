// Neighbouring realms: relations, treaties, gifts, war and peace. This state is
// deliberately bounded to the four market partners and updates once per year.
import { state } from "../core/state.js";
import { rand } from "../core/random.js";
import { DIPLOMATIC_REALMS, DIPLOMATIC_TREATIES, normalizeTreaty } from "./diplomacy-config.js";
import { addLog } from "./events.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { applyPoliticalEffects, normalizePoliticalState, POLITICAL_FACTIONS } from "./politics.js";
import { getCourtModifiers } from "./court.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { TYPE } from "../core/types.js";
import { getEndeavourModifiers } from "./endeavours.js";
import { getSpecialBiomeInfluence } from "./special-biome-couplings.js";
import { getCrownDread, getFrontierPressure } from "./crown-dread.js";
import { getDiplomaticStanding } from "./diplomatic-standing.js";

export const DIPLOMACY_COSTS = Object.freeze({ gift:12, tradePact:15, alliance:25, peaceGold:20, peaceFood:15, envoy:8, guarantee:12, guaranteeAidGold:18, guaranteeAidFood:12 });
export const TRADE_PACT_RELATION = 45;
export const ALLIANCE_RELATION = 70;
export const GUARANTEE_RELATION = 35;
export const GUARANTEE_TERM_YEARS = 8;
export const GUARANTEE_CREDIBILITY_DEFAULT = 60;
export const DIPLOMACY_MISSION_LIMIT = 6;
export const DIPLOMACY_MISSIONS_PER_REALM = 1;
export const DIPLOMACY_MISSION_COST = Object.freeze({ gold:6 });
export const DIPLOMACY_MISSION_GOALS = Object.freeze(["trade", "alliance"]);
export const DIPLOMACY_MISSION_STAGES = Object.freeze(["sent", "negotiated", "reported"]);
const DIPLOMACY_MISSION_LIFETIME_YEARS = 4;
const DIPLOMACY_MISSION_THRESHOLDS = Object.freeze({ trade:TRADE_PACT_RELATION, alliance:ALLIANCE_RELATION });

// A marriage bond is a standing discount on the same authored agreement. The
// saved realm record only holds runtime totals; every term below remains
// derived from diplomacy-config.js so a manipulated save cannot invent goods.
const TRADE_MARRIAGE_SIGNING_FACTOR = 0.5;
const TRADE_MARRIAGE_FEE_FACTOR = 0.75;
const TRADE_MARRIAGE_THRESHOLD_RELIEF = 5;

const TRADE_AGREEMENT_BREAKS = Object.freeze({
    war:{
        relation:-5, trust:-8, fear:4, legitimacy:-0.2, guilds:-0.4, morale:-0.5,
        kind:"trade-agreement-broken", label:"War breaks", color:"#d27b6d"
    },
    arrears:{
        relation:-4, trust:-10, fear:3, legitimacy:-0.6, guilds:-0.8, morale:-1,
        kind:"trade-agreement-lapsed", label:"An unpaid annual fee ends", color:"#d8a38a"
    },
    cancel:{
        relation:-5, trust:-9, fear:3, legitimacy:-0.4, guilds:-0.7, morale:-0.7,
        kind:"trade-agreement-cancelled", label:"The crown cancels", color:"#d8a38a"
    }
});

const REALM_BY_ID = new Map(DIPLOMATIC_REALMS.map(realm => [realm.id, realm]));
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const currentYear = () => Math.max(1, Math.floor(Number(state.year) || 1));
const currentTick = () => Math.max(0, Math.floor(Number(state.tick) || 0));

function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function guaranteeCrisisYear(realmId, year, salt = "") {
    return year + 2 + (hashText(`${realmId}:${year}:${salt}`) % 4);
}

function relationLabel(relation) {
    if (relation >= 85) return "Devoted";
    if (relation >= 70) return "Cordial";
    if (relation >= 45) return "Wary";
    if (relation >= 20) return "Strained";
    return "Hostile";
}

function normalizeGuarantee(input) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : null;
    if (!source) return null;
    const sinceYear = integer(source.sinceYear, 0);
    const expiresYear = integer(source.expiresYear, 0);
    if (!sinceYear || expiresYear <= sinceYear) return null;
    const savedCrisisYear = Number(source.nextCrisisYear);
    const nextCrisisYear = Number.isFinite(savedCrisisYear) && savedCrisisYear > 0
        ? Math.max(sinceYear + 1, Math.floor(savedCrisisYear))
        : sinceYear + 3;
    return {
        sinceYear,
        expiresYear,
        nextCrisisYear,
        honored: integer(source.honored, 0, 999),
        refused: integer(source.refused, 0, 999),
        lastCallYear: integer(source.lastCallYear, 0)
    };
}

function normalizeGuaranteeCall(input, realmId) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : null;
    if (!source) return null;
    const attackerId = String(source.attackerId || "").slice(0, 40);
    if (!REALM_BY_ID.has(attackerId) || attackerId === realmId) return null;
    const sinceYear = integer(source.sinceYear, 0);
    const deadlineYear = integer(source.deadlineYear, 0);
    if (!sinceYear || deadlineYear < sinceYear) return null;
    return {
        id: String(source.id || `${realmId}:${sinceYear}`).slice(0, 80),
        attackerId,
        sinceYear,
        deadlineYear
    };
}

function normalizeTradeAgreement(input, definition) {
    if (!definition?.tradeAgreement) return null;
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : null;
    if (!source) return null;
    const rawSinceYear = integer(source.sinceYear, 0);
    if (!rawSinceYear) return null;
    const year = currentYear();
    // A future year is a forged record, not a contract. Clamp it to the present
    // so the next ordinary review can settle it like any other agreement.
    const sinceYear = Math.min(rawSinceYear, year);
    return {
        sinceYear,
        lastSettledYear:Math.min(integer(source.lastSettledYear, 0), year),
        yearsServed:integer(source.yearsServed, 0, 9999),
        imports:integer(source.imports, 0),
        exports:integer(source.exports, 0),
        goldPaid:integer(source.goldPaid, 0),
        goldEarned:integer(source.goldEarned, 0)
    };
}

function tradeAgreementTerms(definition, marriageBond) {
    const base = definition?.tradeAgreement;
    if (!base) return null;
    const married = Boolean(marriageBond);
    const signingGold = married ? Math.ceil(base.signingGold * TRADE_MARRIAGE_SIGNING_FACTOR) : base.signingGold;
    const annualGold = married ? Math.ceil(base.annualGold * TRADE_MARRIAGE_FEE_FACTOR) : base.annualGold;
    const minRelation = Math.max(1, base.minRelation - (married ? TRADE_MARRIAGE_THRESHOLD_RELIEF : 0));
    const minTrust = Math.max(1, base.minTrust - (married ? TRADE_MARRIAGE_THRESHOLD_RELIEF : 0));
    return {
        importResource:base.importResource,
        importPerYear:base.importPerYear,
        exportResource:base.exportResource,
        exportCap:base.exportCap,
        exportKeep:base.exportKeep,
        exportUnitGold:base.exportUnitGold,
        signingGold,
        annualGold,
        minRelation,
        minTrust,
        marriageDiscount:married ? {
            signingGold:base.signingGold - signingGold,
            annualGold:base.annualGold - annualGold,
            relation:base.minRelation - minRelation,
            trust:base.minTrust - minTrust
        } : null
    };
}

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = String(entry.summary || "").trim().slice(0, 160);
    if (!summary) return null;
    const realmId=entry.realmId ? String(entry.realmId).slice(0, 40) : null;
    return {
        year:integer(entry.year, 0),
        tick:integer(entry.tick, 0),
        kind:String(entry.kind || "realm").slice(0, 24),
        ...(realmId ? {realmId} : {}),
        summary
    };
}

function normalizeMissionEntry(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const id = String(input.id || "").trim().slice(0, 100);
    const realmId = String(input.realmId || "").slice(0, 40);
    const goalTreaty = String(input.goalTreaty || "");
    const stage = String(input.stage || "");
    if (!id || !REALM_BY_ID.has(realmId) || !DIPLOMACY_MISSION_GOALS.includes(goalTreaty) || !DIPLOMACY_MISSION_STAGES.includes(stage)) return null;
    const sentYear = integer(input.sentYear, 1);
    if (!sentYear) return null;
    const negotiatedYear = integer(input.negotiatedYear, 0);
    const reportYear = integer(input.reportYear, 0);
    if ((stage === "negotiated" && (!negotiatedYear || negotiatedYear < sentYear)) ||
        (stage === "reported" && (!negotiatedYear || !reportYear || reportYear < negotiatedYear))) return null;
    const expiresYear = Math.max(sentYear + 1, integer(input.expiresYear, sentYear + DIPLOMACY_MISSION_LIFETIME_YEARS));
    const savedRoll = input.roll === undefined || input.roll === null || !Number.isFinite(Number(input.roll)) ? null : clamp(input.roll, 0, 1);
    const savedScore = input.score === undefined || input.score === null || !Number.isFinite(Number(input.score)) ? null : integer(input.score, -1000, 1000);
    const outcome = ["accepted", "rejected"].includes(String(input.outcome || "")) ? String(input.outcome) : null;
    const envoyId = input.envoyId ? String(input.envoyId).slice(0, 100) : null;
    if (!envoyId) return null;
    return {
        id,
        realmId,
        goalTreaty,
        stage,
        envoyId,
        envoyName:String(input.envoyName || "").slice(0, 90),
        envoySkill:clamp(input.envoySkill ?? 0),
        sentYear,
        negotiatedYear,
        reportYear,
        expiresYear,
        difficulty:integer(input.difficulty, 0, 100),
        chancellorGain:Number.isFinite(Number(input.chancellorGain)) && Number(input.chancellorGain) > 0
            ? Math.min(10, Number(input.chancellorGain)) : 1,
        foreignInsight:clamp(input.foreignInsight ?? 0),
        targetedForeignDesk:input.targetedForeignDesk === true || Number(input.targetedForeignDesk) === 1,
        roll:savedRoll,
        score:savedScore,
        outcome,
        summary:String(input.summary || "").trim().slice(0, 240)
    };
}

function normalizeMissionList(input) {
    const seen = new Set();
    const missions = [];
    for (const entry of Array.isArray(input) ? input : []) {
        const mission = normalizeMissionEntry(entry);
        if (!mission || seen.has(mission.realmId)) continue;
        seen.add(mission.realmId);
        missions.push(mission);
        if (missions.length >= DIPLOMACY_MISSION_LIMIT) break;
    }
    return missions;
}

export function createDiplomacyState() {
    return {
        version:1,
        lastUpdateYear:0,
        guaranteeCredibility:GUARANTEE_CREDIBILITY_DEFAULT,
        guaranteeHonored:0,
        guaranteeRefused:0,
        realms:DIPLOMATIC_REALMS.map(realm => ({
            id:realm.id,
            relation:realm.baseRelation,
            trust:realm.baseTrust,
            fear:realm.baseFear,
            treaty:"none",
            treatySinceYear:0,
            guarantee:null,
            guaranteeCall:null,
            tradeAgreement:null,
            envoyId:null,
            envoyName:"",
            envoySkill:0,
            envoySinceYear:0,
            warExhaustion:0,
            tradeVolume:0,
            lastTradeYear:0,
            lastContactYear:0,
            lastIncidentYear:0,
            relationHistory:[],
            history:[]
        })),
        history:[],
        missions:[],
        missionLastUpdateYear:0,
        missionLastSendYear:0,
        missionCounter:0
    };
}

export function normalizeDiplomacySnapshot(input) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const rawRealms = Array.isArray(source.realms) ? source.realms.filter(realm => realm && typeof realm === "object" && !Array.isArray(realm)) : [];
    const byId = new Map(rawRealms.map(realm => [String(realm.id || ""), realm]));
    const realms = DIPLOMATIC_REALMS.map(definition => {
        const saved = byId.get(definition.id) || {};
        const relation = clamp(saved.relation ?? definition.baseRelation);
        const relationHistory = (Array.isArray(saved.relationHistory) ? saved.relationHistory : [])
            .filter(value => Number.isFinite(Number(value)))
            .map(value => clamp(value))
            .slice(-12);
        if (relationHistory.length === 0) relationHistory.push(relation);
        return {
            id:definition.id,
            relation,
            trust:clamp(saved.trust ?? definition.baseTrust),
            fear:clamp(saved.fear ?? definition.baseFear),
            treaty:normalizeTreaty(saved.treaty),
            treatySinceYear:integer(saved.treatySinceYear, 0),
            guarantee:normalizeGuarantee(saved.guarantee),
            guaranteeCall:normalizeGuaranteeCall(saved.guaranteeCall, definition.id),
            tradeAgreement:normalizeTradeAgreement(saved.tradeAgreement, definition),
            envoyId:saved.envoyId ? String(saved.envoyId).slice(0, 100) : null,
            envoyName:String(saved.envoyName || "").slice(0, 90),
            envoySkill:clamp(saved.envoySkill ?? 0),
            envoySinceYear:integer(saved.envoySinceYear, 0),
            warExhaustion:clamp(saved.warExhaustion ?? 0),
            tradeVolume:integer(saved.tradeVolume, 0),
            lastTradeYear:integer(saved.lastTradeYear, 0),
            lastContactYear:integer(saved.lastContactYear, 0),
            lastIncidentYear:integer(saved.lastIncidentYear, 0),
            relationHistory,
            history:(Array.isArray(saved.history) ? saved.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, 16)
        };
    });
    return {
        version:1,
        lastUpdateYear:integer(source.lastUpdateYear, 0),
        guaranteeCredibility:clamp(source.guaranteeCredibility ?? GUARANTEE_CREDIBILITY_DEFAULT),
        guaranteeHonored:integer(source.guaranteeHonored, 0, 999999),
        guaranteeRefused:integer(source.guaranteeRefused, 0, 999999),
        realms,
        history:(Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, 30),
        missions:normalizeMissionList(source.missions),
        missionLastUpdateYear:integer(source.missionLastUpdateYear, 0),
        missionLastSendYear:integer(source.missionLastSendYear, 0),
        missionCounter:integer(source.missionCounter, 0, 1_000_000)
    };
}

export function ensureDiplomacy() {
    const current = state.diplomacy;
    const missingGuaranteeFields = current && Array.isArray(current.realms) && current.realms.some(realm =>
        !Object.hasOwn(realm, "guarantee") || !Object.hasOwn(realm, "guaranteeCall") ||
        !Object.hasOwn(realm, "tradeAgreement"));
    const missingMissionFields = current && (!Object.hasOwn(current, "missions") ||
        !Object.hasOwn(current, "missionLastUpdateYear") || !Object.hasOwn(current, "missionLastSendYear") ||
        !Object.hasOwn(current, "missionCounter"));
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== 1 ||
        !Array.isArray(current.realms) || !Number.isFinite(Number(current.guaranteeCredibility)) ||
        !Number.isFinite(Number(current.guaranteeHonored)) || !Number.isFinite(Number(current.guaranteeRefused)) ||
        missingGuaranteeFields || missingMissionFields) {
        state.diplomacy = normalizeDiplomacySnapshot(current);
    }
    return state.diplomacy;
}

function foreignMarriageBond(realmId) {
    const bond = state.royal?.foreignMarriage;
    if (!bond || String(bond.realmId) !== String(realmId)) return null;
    const consortId = String(state.royal?.consortId || "");
    if (!consortId) return null;
    const consort = (state.entities || []).find(entity => !entity.dead && String(entity.personId || entity.id) === consortId);
    return consort ? bond : null;
}

function missionRealmFor(diplomacy, mission) {
    return diplomacy.realms.find(realm => realm.id === mission.realmId) || null;
}

function missionEnvoyEntity(realm, mission) {
    if (!realm?.envoyId || !mission?.envoyId || String(realm.envoyId) !== String(mission.envoyId)) return null;
    return state.entities.find(entity => !entity.dead && String(entity.personId || entity.id) === String(mission.envoyId)) || null;
}

function missionLadderOpen(realm, goalTreaty) {
    if (!realm || realm.treaty === "war") return false;
    return goalTreaty === "trade" ? realm.treaty === "none" : realm.treaty === "trade";
}

function missionSnapshot(diplomacy, mission) {
    const definition = REALM_BY_ID.get(mission.realmId);
    const realm = missionRealmFor(diplomacy, mission);
    const year = currentYear();
    const envoyAlive = Boolean(missionEnvoyEntity(realm, mission));
    const open = missionLadderOpen(realm, mission.goalTreaty);
    const goalLabel = mission.goalTreaty === "trade" ? "TRADE PACT" : "ALLIANCE";
    let nextAction = "AWAIT NEXT YEAR";
    let note = "The envoy is waiting for the next annual court.";
    if (mission.stage === "sent") {
        nextAction = "NEGOTIATE";
        note = year > mission.sentYear ? "The court is ready to receive the negotiation." : "Negotiation opens in year " + (mission.sentYear + 1) + ".";
    } else if (mission.stage === "negotiated") {
        nextAction = "REPORT";
        note = year > mission.negotiatedYear
            ? (mission.outcome === "accepted" ? "The court accepted the terms; bring the report home." : "The court refused; report the failure and close the file.")
            : "The report waits for year " + (mission.negotiatedYear + 1) + ".";
    } else {
        nextAction = "RATIFY";
        note = year > mission.reportYear ? "The crown can ratify the negotiated treaty." : "Ratification opens in year " + (mission.reportYear + 1) + ".";
    }
    if (!envoyAlive) { nextAction = "CLOSED"; note = "The envoy is gone; the annual audit will close this file."; }
    else if (!open) { nextAction = "CLOSED"; note = "War or a changed treaty has closed this negotiation."; }
    return {
        ...mission,
        realmName:definition?.name || mission.realmId,
        goalLabel,
        stageLabel:String(mission.stage).toUpperCase(),
        outcomeLabel:mission.outcome ? String(mission.outcome).toUpperCase() : "PENDING",
        yearsLeft:Math.max(0, mission.expiresYear - year),
        nextAction,
        note,
        canNegotiate:mission.stage === "sent" && year > mission.sentYear && envoyAlive && open,
        canReport:mission.stage === "negotiated" && year > mission.negotiatedYear && envoyAlive && open,
        canRatify:mission.stage === "reported" && year > mission.reportYear && mission.outcome === "accepted" && envoyAlive && open
    };
}

export function getDiplomaticMissionSnapshot() {
    const diplomacy = ensureDiplomacy();
    return diplomacy.missions.map(mission => missionSnapshot(diplomacy, mission));
}

function realmSnapshot(realm) {
    const definition = REALM_BY_ID.get(realm.id);
    const year = currentYear();
    const standing = getDiplomaticStanding(realm, year);
    const bond = foreignMarriageBond(realm.id);
    const marriageBond = bond ? {
        house:String(bond.house || definition?.royalHouse?.house || "Foreign house"),
        name:String(bond.name || definition?.royalHouse?.name || "Foreign consort"),
        sinceYear:Math.max(1, Math.floor(Number(bond.sinceYear) || 1))
    } : null;
    const guarantee = realm.guarantee ? {
        ...realm.guarantee,
        active:realm.guarantee.expiresYear > year || Boolean(realm.guaranteeCall),
        yearsLeft:Math.max(0, realm.guarantee.expiresYear - year)
    } : null;
    const guaranteeCall = realm.guaranteeCall ? {
        ...realm.guaranteeCall,
        attackerName:REALM_BY_ID.get(realm.guaranteeCall.attackerId)?.name || realm.guaranteeCall.attackerId,
        yearsLeft:Math.max(0, realm.guaranteeCall.deadlineYear - year)
    } : null;
    const terms = tradeAgreementTerms(definition, bond);
    const savedAgreement = realm.tradeAgreement;
    let tradeAgreement = null;
    if (terms) {
        const affordable = (Number(state.resources?.gold) || 0) >= terms.signingGold;
        const relationReady = realm.relation >= terms.minRelation;
        const trustReady = realm.trust >= terms.minTrust;
        let signReason = null;
        if (savedAgreement) signReason = "agreement-active";
        else if (realm.treaty === "war") signReason = "war-closes-the-court";
        else if (!relationReady) signReason = "relation-below-" + terms.minRelation;
        else if (!trustReady) signReason = "trust-below-" + terms.minTrust;
        else if (!affordable) signReason = "not-enough-gold";
        tradeAgreement = {
            ...terms,
            active:Boolean(savedAgreement) && realm.treaty !== "war",
            sinceYear:savedAgreement?.sinceYear || 0,
            lastSettledYear:savedAgreement?.lastSettledYear || 0,
            yearsServed:savedAgreement?.yearsServed || 0,
            imports:savedAgreement?.imports || 0,
            exports:savedAgreement?.exports || 0,
            goldPaid:savedAgreement?.goldPaid || 0,
            goldEarned:savedAgreement?.goldEarned || 0,
            canSign:!savedAgreement && realm.treaty !== "war" && relationReady && trustReady && affordable,
            signReason
        };
    }
    return {
        ...definition,
        ...realm,
        guarantee,
        guaranteeCall,
        marriageBond,
        tradeAgreement,
        treatyLabel:DIPLOMATIC_TREATIES[realm.treaty]?.label || "Neutral",
        treatyTone:DIPLOMATIC_TREATIES[realm.treaty]?.tone || "neutral",
        standing,
        relationLabel:relationLabel(realm.relation),
        envoyLabel:realm.envoyId ? (realm.envoyName || "Envoy appointed") : "No envoy",
        envoyActive:Boolean(realm.envoyId),
        warExhaustionLabel:realm.warExhaustion >= 70 ? "Breaking" : realm.warExhaustion >= 35 ? "Wearing" : "Manageable"
    };
}

export function getDiplomacySnapshot() {
    const diplomacy = ensureDiplomacy();
    const realms = diplomacy.realms.map(realmSnapshot);
    const counts = { none:0, trade:0, alliance:0, war:0 };
    let relationTotal = 0;
    let envoys = 0;
    const tradeAgreements = { active:0, imports:0, exports:0, goldPaid:0, goldEarned:0 };
    let standingTotal = 0;
    let standingRealms = 0;
    let ententes = 0;
    let longestStanding = null;
    for (const realm of realms) {
        counts[realm.treaty] = (counts[realm.treaty] || 0) + 1;
        relationTotal += realm.relation;
        if (realm.envoyId) envoys++;
        const standing = realm.standing;
        if (standing && standing.treaty !== "war" && standing.years > 0) {
            standingTotal += standing.years;
            standingRealms++;
            if (standing.tier === "entente") ententes++;
            if (!longestStanding || standing.years > longestStanding.years) {
                longestStanding = {
                    realmId: realm.id,
                    name: realm.name,
                    years: standing.years,
                    tier: standing.tier,
                    tierLabel: standing.tierLabel
                };
            }
        }
        if (realm.tradeAgreement?.active) {
            tradeAgreements.active++;
            tradeAgreements.imports += realm.tradeAgreement.imports;
            tradeAgreements.exports += realm.tradeAgreement.exports;
            tradeAgreements.goldPaid += realm.tradeAgreement.goldPaid;
            tradeAgreements.goldEarned += realm.tradeAgreement.goldEarned;
        }
    }
    return {
        realms,
        counts,
        envoys,
        tradeAgreements,
        guarantees:{
            active:realms.filter(realm => realm.guarantee?.active).length,
            pending:realms.filter(realm => realm.guaranteeCall).length,
            credibility:Math.round(diplomacy.guaranteeCredibility),
            honored:diplomacy.guaranteeHonored,
            refused:diplomacy.guaranteeRefused,
            termYears:GUARANTEE_TERM_YEARS
        },
        averageRelation:realms.length ? Math.round((relationTotal / realms.length) * 10) / 10 : 0,
        standing:{
            realms:standingRealms,
            averageYears:standingRealms ? Math.round((standingTotal / standingRealms) * 10) / 10 : 0,
            ententes,
            longest:longestStanding,
            yearLimit:20
        },
        dread:getCrownDread(),
        pressure:getFrontierPressure(),
        lastUpdateYear:diplomacy.lastUpdateYear,
        history:diplomacy.history.slice(0, 12),
        missions:diplomacy.missions.map(mission => missionSnapshot(diplomacy, mission)),
        missionLastUpdateYear:diplomacy.missionLastUpdateYear,
        missionLastSendYear:diplomacy.missionLastSendYear,
        missionLimits:{ active:DIPLOMACY_MISSION_LIMIT, perRealm:DIPLOMACY_MISSIONS_PER_REALM, costGold:DIPLOMACY_MISSION_COST.gold, lifetimeYears:DIPLOMACY_MISSION_LIFETIME_YEARS },
        costs:DIPLOMACY_COSTS,
        thresholds:{ tradePact:TRADE_PACT_RELATION, alliance:ALLIANCE_RELATION, guarantee:GUARANTEE_RELATION },
        biomeInfluence:getSpecialBiomeInfluence().diplomacy
    };
}

function locate(id) {
    const diplomacy = ensureDiplomacy();
    const realm = diplomacy.realms.find(item => item.id === id) || null;
    return { diplomacy, realm, definition:REALM_BY_ID.get(id) || null };
}

function record(diplomacy, realm, kind, summary) {
    const entry = { year:currentYear(), tick:currentTick(), kind, realmId:realm?.id || null, summary };
    if (realm) {
        const realmHistory = Array.isArray(realm.history) ? realm.history : [];
        realmHistory.unshift(entry);
        if (realmHistory.length > 16) realmHistory.length = 16;
        realm.history = realmHistory;
        realm.lastContactYear = entry.year;
    }
    const history = Array.isArray(diplomacy.history) ? diplomacy.history : [];
    history.unshift(entry);
    if (history.length > 30) history.length = 30;
    diplomacy.history = history;
    return entry;
}

function adjustHiddenTension(delta) {
    if (state.hiddenRealm && typeof state.hiddenRealm === "object") {
        state.hiddenRealm.tension = clamp(Number(state.hiddenRealm.tension) + delta);
    }
}

export function sendGift(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.gift) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -DIPLOMACY_COSTS.gift);
    const court = getCourtModifiers();
    realm.relation = clamp(realm.relation + 5 * court.diplomacyGain);
    realm.trust = clamp(realm.trust + 4);
    realm.fear = clamp(realm.fear - 1);
    record(diplomacy, realm, "gift", "Royal gift sent to " + definition.name);
    applyPoliticalEffects({ legitimacy:0.2, guilds:0.8 });
    state.morale = clamp((Number(state.morale) || 0) + 0.5);
    addLog("A ROYAL GIFT REACHES " + definition.name.toUpperCase(), "#d8c18a", "diplomacy");
    return { ok:true, message:"Gift delivered to " + definition.name, realm:realmSnapshot(realm) };
}

export function proposeTradePact(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    if (realm.treaty !== "none") return { ok:false, reason:"a-treaty-is-already-in-force" };
    if (realm.relation < TRADE_PACT_RELATION) return { ok:false, reason:"relation-below-45" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.tradePact) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -DIPLOMACY_COSTS.tradePact);
    const court = getCourtModifiers();
    realm.treaty = "trade";
    realm.treatySinceYear = currentYear();
    realm.relation = clamp(realm.relation + 4 * court.diplomacyGain);
    realm.trust = clamp(realm.trust + 4);
    record(diplomacy, realm, "treaty", "Trade pact ratified with " + definition.name);
    applyPoliticalEffects({ legitimacy:0.3, guilds:1.1 });
    addLog("TRADE PACT RATIFIED WITH " + definition.name.toUpperCase(), "#a5d6a7", "diplomacy");
    return { ok:true, message:"Trade pact ratified with " + definition.name, realm:realmSnapshot(realm) };
}

export function proposeAlliance(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    if (realm.treaty !== "trade") return { ok:false, reason:"a-trade-pact-must-come-first" };
    if (realm.relation < ALLIANCE_RELATION) return { ok:false, reason:"relation-below-70" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.alliance) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -DIPLOMACY_COSTS.alliance);
    const court = getCourtModifiers();
    realm.treaty = "alliance";
    realm.treatySinceYear = currentYear();
    realm.relation = clamp(realm.relation + 6 * court.diplomacyGain);
    realm.trust = clamp(realm.trust + 5);
    realm.fear = clamp(realm.fear - 2);
    record(diplomacy, realm, "treaty", "Alliance sworn with " + definition.name);
    applyPoliticalEffects({ legitimacy:1, nobility:1.2, guilds:0.6 });
    state.morale = clamp((Number(state.morale) || 0) + 1);
    addLog("ALLIANCE SWORN WITH " + definition.name.toUpperCase(), "#e8c77b", "diplomacy");
    return { ok:true, message:"Alliance sworn with " + definition.name, realm:realmSnapshot(realm) };
}

export function grantGuarantee(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    const year = currentYear();
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    if (realm.guaranteeCall) return { ok:false, reason:"a-guarantee-call-is-pending" };
    if (realm.guarantee && !(realm.guarantee.expiresYear <= year)) return { ok:false, reason:"a-guarantee-is-already-in-force" };
    if (realm.relation < GUARANTEE_RELATION) return { ok:false, reason:"relation-below-35" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.guarantee) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -DIPLOMACY_COSTS.guarantee);
    realm.guarantee = {
        sinceYear:year,
        expiresYear:year + GUARANTEE_TERM_YEARS,
        nextCrisisYear:guaranteeCrisisYear(realm.id, year),
        honored:0,
        refused:0,
        lastCallYear:0
    };
    realm.relation = clamp(realm.relation + 6);
    realm.trust = clamp(realm.trust + 8);
    realm.fear = clamp(realm.fear - 3);
    record(diplomacy, realm, "guarantee", "Royal guarantee extended to " + definition.name + " until year " + realm.guarantee.expiresYear);
    applyPoliticalEffects({ legitimacy:0.6, nobility:0.3, guilds:0.4 });
    state.morale = clamp((Number(state.morale) || 0) + 0.5);
    addLog("ROYAL GUARANTEE EXTENDED TO " + definition.name.toUpperCase(), "#9fc5e8", "diplomacy");
    return { ok:true, message:"Royal guarantee extended to " + definition.name, realm:realmSnapshot(realm) };
}

function applyGuaranteeRefusal(diplomacy, realm, definition, automatic) {
    const call = realm.guaranteeCall;
    if (!call) return null;
    const attackerName = REALM_BY_ID.get(call.attackerId)?.name || call.attackerId;
    const guarantee = realm.guarantee;
    if (guarantee) guarantee.refused = integer(guarantee.refused, 0, 999) + 1;
    realm.guaranteeCall = null;
    realm.guarantee = null;
    realm.relation = clamp(realm.relation - 14);
    realm.trust = clamp(realm.trust - 20);
    realm.fear = clamp(realm.fear + 10);
    for (const other of diplomacy.realms) {
        if (other.id === realm.id) continue;
        other.relation = clamp(other.relation - 1);
        other.trust = clamp(other.trust - 2);
    }
    diplomacy.guaranteeCredibility = clamp(diplomacy.guaranteeCredibility - 16);
    diplomacy.guaranteeRefused = integer(diplomacy.guaranteeRefused, 0, 999999) + 1;
    const summary = automatic
        ? "Unanswered guarantee abandoned against " + attackerName
        : "Guarantee refused against " + attackerName;
    record(diplomacy, realm, "guarantee-refused", summary + "; " + definition.name + " is left exposed");
    applyPoliticalEffects({ legitimacy:-2, nobility:-1, guilds:-1.5, clergy:-0.5 });
    state.morale = clamp((Number(state.morale) || 0) - 2);
    adjustHiddenTension(5);
    addLog((automatic ? "GUARANTEE LAPSED UNANSWERED: " : "GUARANTEE REFUSED: ") + definition.name.toUpperCase(), "#d27b6d", "diplomacy");
    return { ok:true, message:summary + "; " + definition.name + " is left exposed", realmName:definition.name, attackerName };
}

export function refuseGuaranteeCall(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!realm.guaranteeCall) return { ok:false, reason:"no-guarantee-call" };
    const result = applyGuaranteeRefusal(diplomacy, realm, definition, false);
    return { ...result, realm:realmSnapshot(realm) };
}

export function honorGuaranteeCall(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    const call = realm.guaranteeCall;
    if (!call) return { ok:false, reason:"no-guarantee-call" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.guaranteeAidGold) return { ok:false, reason:"not-enough-gold" };
    if ((Number(state.resources?.food) || 0) < DIPLOMACY_COSTS.guaranteeAidFood) return { ok:false, reason:"not-enough-food" };
    addResource("gold", -DIPLOMACY_COSTS.guaranteeAidGold);
    addResource("food", -DIPLOMACY_COSTS.guaranteeAidFood);
    const year = currentYear();
    const attacker = diplomacy.realms.find(item => item.id === call.attackerId) || null;
    const attackerName = REALM_BY_ID.get(call.attackerId)?.name || call.attackerId;
    const guarantee = realm.guarantee;
    realm.guaranteeCall = null;
    realm.relation = clamp(realm.relation + 10);
    realm.trust = clamp(realm.trust + 12);
    realm.fear = clamp(realm.fear - 8);
    if (attacker) {
        attacker.relation = clamp(attacker.relation - 8);
        attacker.trust = clamp(attacker.trust - 4);
        attacker.fear = clamp(attacker.fear + 6);
    }
    for (const other of diplomacy.realms) {
        if (other.id === realm.id || other.id === call.attackerId) continue;
        other.relation = clamp(other.relation + 1);
        other.trust = clamp(other.trust + 2);
    }
    if (guarantee) {
        guarantee.honored = integer(guarantee.honored, 0, 999) + 1;
        guarantee.lastCallYear = year;
        guarantee.nextCrisisYear = guaranteeCrisisYear(realm.id, year, "honored");
    }
    diplomacy.guaranteeCredibility = clamp(diplomacy.guaranteeCredibility + 8);
    diplomacy.guaranteeHonored = integer(diplomacy.guaranteeHonored, 0, 999999) + 1;
    record(diplomacy, realm, "guarantee-honored", "Guarantee honored against " + attackerName + "; aid reaches " + definition.name);
    applyPoliticalEffects({ legitimacy:1.2, nobility:0.8, guilds:0.6, clergy:0.4 });
    state.morale = clamp((Number(state.morale) || 0) + 2);
    adjustHiddenTension(3);
    addLog("GUARANTEE HONORED: " + definition.name.toUpperCase() + " SHIELDED", "#9fc5e8", "diplomacy");
    const expired = Boolean(guarantee && guarantee.expiresYear <= year);
    if (expired) realm.guarantee = null;
    return {
        ok:true,
        message:"Guarantee honored against " + attackerName + "; " + definition.name + " is shielded",
        realmName:definition.name,
        attackerName,
        expired
    };
}

export function withdrawGuarantee(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!realm.guarantee) return { ok:false, reason:"no-guarantee-is-in-force" };
    if (realm.guaranteeCall) return { ok:false, reason:"resolve-the-guarantee-call-first" };
    const years = Math.max(0, currentYear() - realm.guarantee.sinceYear);
    realm.guarantee = null;
    realm.relation = clamp(realm.relation - 12);
    realm.trust = clamp(realm.trust - 15);
    realm.fear = clamp(realm.fear + 6);
    for (const other of diplomacy.realms) {
        if (other.id === realm.id) continue;
        other.relation = clamp(other.relation - 1);
        other.trust = clamp(other.trust - 2);
    }
    diplomacy.guaranteeCredibility = clamp(diplomacy.guaranteeCredibility - 8);
    record(diplomacy, realm, "guarantee-withdrawn", "Royal guarantee withdrawn from " + definition.name + " after " + years + " years");
    applyPoliticalEffects({ legitimacy:-1.5, nobility:-0.5, guilds:-0.8 });
    state.morale = clamp((Number(state.morale) || 0) - 1);
    addLog("ROYAL GUARANTEE WITHDRAWN FROM " + definition.name.toUpperCase(), "#d8a38a", "diplomacy");
    return { ok:true, message:"Royal guarantee withdrawn from " + definition.name, realm:realmSnapshot(realm) };
}

function updateGuarantees(diplomacy, year) {
    for (const realm of diplomacy.realms) {
        const definition = REALM_BY_ID.get(realm.id);
        if (!definition) continue;
        if (realm.guaranteeCall && year > realm.guaranteeCall.deadlineYear) {
            applyGuaranteeRefusal(diplomacy, realm, definition, true);
            continue;
        }
        if (realm.guaranteeCall) continue;
        if (!realm.guarantee) continue;
        if (realm.guarantee.expiresYear <= year) {
            realm.guarantee = null;
            record(diplomacy, realm, "guarantee-expired", "Royal guarantee to " + definition.name + " expired in year " + year);
            continue;
        }
        if (year < realm.guarantee.nextCrisisYear) continue;
        const attacker = diplomacy.realms
            .filter(other => other.id !== realm.id && other.treaty !== "war")
            .sort((a, b) => a.relation - b.relation || a.id.localeCompare(b.id))[0];
        if (!attacker) continue;
        const attackerDefinition = REALM_BY_ID.get(attacker.id);
        realm.guaranteeCall = {
            id:realm.id + ":" + year,
            attackerId:attacker.id,
            sinceYear:year,
            deadlineYear:year + 1
        };
        realm.guarantee.lastCallYear = year;
        realm.guarantee.nextCrisisYear = guaranteeCrisisYear(realm.id, year, "next");
        record(diplomacy, realm, "guarantee-call", definition.name + " calls on the crown against " + (attackerDefinition?.name || attacker.id));
        addLog("GUARANTEE CALL FROM " + definition.name.toUpperCase(), "#e0b36a", "diplomacy");
    }
}

export function declareWar(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"already-at-war" };
    if (foreignMarriageBond(id)) return { ok:false, reason:"royal-marriage-binds-the-crown" };
    if (realm.guarantee && !realm.guaranteeCall && realm.guarantee.expiresYear <= currentYear()) realm.guarantee = null;
    if (realm.guarantee) return { ok:false, reason:"withdraw-the-guarantee-first" };
    breakTradeAgreement(diplomacy, realm, definition, "war");
    realm.treaty = "war";
    realm.treatySinceYear = currentYear();
    realm.warExhaustion = 0;
    realm.envoyId = null;
    realm.envoyName = "";
    realm.envoySkill = 0;
    realm.envoySinceYear = 0;
    realm.relation = clamp(Math.min(25, realm.relation - 30));
    realm.trust = clamp(realm.trust - 30);
    realm.fear = clamp(realm.fear + 18);
    record(diplomacy, realm, "war", "War declared on " + definition.name);
    applyPoliticalEffects({ legitimacy:-1, guilds:-2.5, nobility:1.5, clergy:-1 });
    state.morale = clamp((Number(state.morale) || 0) - 5);
    adjustHiddenTension(8);
    addLog("WAR DECLARED AGAINST " + definition.name.toUpperCase(), "#e9857b", "diplomacy");
    return { ok:true, message:"War declared on " + definition.name, realm:realmSnapshot(realm) };
}

export function applyForeignMarriageBond(id, candidate = {}) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    const house = definition.royalHouse;
    realm.relation = clamp(realm.relation + 8);
    realm.trust = clamp(realm.trust + 10);
    realm.fear = clamp(realm.fear - 4);
    record(diplomacy, realm, "marriage", "Royal marriage with " + (candidate.house || house.house) + " binds " + definition.name + " to the crown");
    applyPoliticalEffects({ legitimacy:0.7, nobility:0.5, guilds:0.3 });
    state.morale = clamp((Number(state.morale) || 0) + 1);
    adjustHiddenTension(-2);
    addLog("ROYAL MARRIAGE BOND WITH " + definition.name.toUpperCase(), "#e8c77b", "diplomacy");
    return { ok:true, message:"Royal marriage bound to " + definition.name, realm:realmSnapshot(realm) };
}

export function sueForPeace(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty !== "war") return { ok:false, reason:"not-at-war" };
    const whitePeace = Number(realm.warExhaustion) >= 35;
    const goldCost = whitePeace ? 0 : DIPLOMACY_COSTS.peaceGold;
    const foodCost = whitePeace ? 0 : DIPLOMACY_COSTS.peaceFood;
    if ((Number(state.resources?.gold) || 0) < goldCost) return { ok:false, reason:"not-enough-gold" };
    if ((Number(state.resources?.food) || 0) < foodCost) return { ok:false, reason:"not-enough-food" };
    addResource("gold", -goldCost);
    addResource("food", -foodCost);
    realm.treaty = "none";
    realm.treatySinceYear = currentYear();
    realm.warExhaustion = 0;
    realm.relation = clamp(Math.max(28, realm.relation + 12));
    realm.trust = clamp(realm.trust + 2);
    realm.fear = clamp(realm.fear - 6);
    record(diplomacy, realm, "peace", (whitePeace ? "White peace concluded with " : "Peace concluded with ") + definition.name);
    applyPoliticalEffects({ legitimacy:1, guilds:1, clergy:1 });
    state.morale = clamp((Number(state.morale) || 0) + 2);
    adjustHiddenTension(-5);
    addLog((whitePeace ? "WHITE PEACE CONCLUDED WITH " : "PEACE CONCLUDED WITH ") + definition.name.toUpperCase(), "#a5d6a7", "diplomacy");
    return { ok:true, message:(whitePeace ? "White peace concluded with " : "Peace concluded with ") + definition.name, realm:realmSnapshot(realm) };
}

function envoySkillFor(person) {
    return clamp(
        (person?.traits?.sociability ?? 50) * 0.40 +
        (person?.traits?.patience ?? 50) * 0.30 +
        (person?.traits?.curiosity ?? 50) * 0.20 +
        (100 - (person?.traits?.distrust ?? 50)) * 0.10,
        5,
        100
    );
}

function livingEnvoy(realm) {
    if (!realm?.envoyId) return null;
    const entity = state.entities.find(item => !item.dead && String(item.personId || item.id) === String(realm.envoyId)) || null;
    if (!entity) {
        realm.envoyId = null;
        realm.envoyName = "";
        realm.envoySkill = 0;
        realm.envoySinceYear = 0;
        return null;
    }
    return entity;
}

export function appointEnvoy(id, personId) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    if (realm.envoyId) return { ok:false, reason:"an-envoy-is-already-appointed" };
    const entity = state.entities.find(item => !item.dead && String(item.personId || item.id) === String(personId)) || null;
    if (!entity) return { ok:false, reason:"eligible-envoy-not-found" };
    if (entity.isKing) return { ok:false, reason:"the-sovereign-cannot-serve-as-envoy" };
    if (entity.type !== TYPE.VILLAGER) return { ok:false, reason:"eligible-envoy-not-found" };
    const person = ensurePersonProfile(entity);
    const maturity = PERSON_SPECIES[person.species]?.maturation ?? 16;
    if (person.ageYears < maturity) return { ok:false, reason:"envoy-not-adult" };
    if (Object.values(state.court?.offices || {}).some(office => office && String(office.personId) === String(person.id))) {
        return { ok:false, reason:"court-minister-cannot-serve-as-envoy" };
    }
    if (diplomacy.realms.some(item => item.id !== id && String(item.envoyId || "") === String(person.id))) {
        return { ok:false, reason:"resident-already-serves-another-court" };
    }
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.envoy) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -DIPLOMACY_COSTS.envoy);
    realm.envoyId = String(person.id);
    realm.envoyName = person.name;
    realm.envoySkill = Math.round(envoySkillFor(person));
    realm.envoySinceYear = currentYear();
    record(diplomacy, realm, "envoy", "Envoy appointed to " + definition.name + ": " + person.name);
    applyPoliticalEffects({ guilds:0.4, legitimacy:0.1 });
    addPersonMemory(entity, {
        id:"diplomatic-envoy:" + definition.id + ":" + currentYear(),
        type:"diplomacy",
        text:"I was appointed envoy to " + definition.name + " in year " + currentYear() + ".",
        tick:state.tick,
        importance:72
    });
    return { ok:true, message:"Envoy appointed to " + definition.name, realm:realmSnapshot(realm) };
}

export function recallEnvoy(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!realm.envoyId) return { ok:false, reason:"no-envoy-is-appointed" };
    const entity = state.entities.find(item => !item.dead && String(item.personId || item.id) === String(realm.envoyId)) || null;
    if (entity) {
        addPersonMemory(entity, {
            id:"diplomatic-recall:" + definition.id + ":" + currentYear(),
            type:"diplomacy",
            text:"I was recalled from my post as envoy to " + definition.name + " in year " + currentYear() + ".",
            tick:state.tick,
            importance:48
        });
    }
    record(diplomacy, realm, "envoy", "Envoy recalled from " + definition.name);
    realm.envoyId = null;
    realm.envoyName = "";
    realm.envoySkill = 0;
    realm.envoySinceYear = 0;
    return { ok:true, message:"Envoy recalled from " + definition.name, realm:realmSnapshot(realm) };
}

function locateMission(id) {
    const diplomacy = ensureDiplomacy();
    const mission = diplomacy.missions.find(item => item.id === id) || null;
    const realm = mission ? diplomacy.realms.find(item => item.id === mission.realmId) || null : null;
    return { diplomacy, mission, realm, definition:mission ? REALM_BY_ID.get(mission.realmId) || null : null };
}

function removeMission(diplomacy, missionId) {
    const index = diplomacy.missions.findIndex(item => item.id === missionId);
    if (index >= 0) diplomacy.missions.splice(index, 1);
}

function closeMission(diplomacy, mission, realm, definition, reason, scar = false) {
    const name = definition?.name || mission.realmId;
    if (scar) {
        if (realm) {
            realm.relation = clamp(realm.relation - 2);
            realm.trust = clamp(realm.trust - 3);
        }
        applyPoliticalEffects({ legitimacy:-0.4, guilds:-0.3 });
        state.morale = clamp((Number(state.morale) || 0) - 1);
    }
    record(diplomacy, realm, "mission", "Envoy mission to " + name + " closed: " + reason);
    removeMission(diplomacy, mission.id);
    return reason;
}

function missionRequirementMet(realm, goalTreaty) {
    if (!realm || realm.treaty === "war") return false;
    return realm.relation >= Math.max(10, DIPLOMACY_MISSION_THRESHOLDS[goalTreaty] - 20);
}

export function sendEnvoyMission(realmId, goalTreaty) {
    const { diplomacy, realm, definition } = locate(realmId);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    const goal = String(goalTreaty || "");
    if (!DIPLOMACY_MISSION_GOALS.includes(goal)) return { ok:false, reason:"unknown-mission-goal" };
    if (!missionLadderOpen(realm, goal)) return { ok:false, reason:"treaty-ladder-closed" };
    if (!missionRequirementMet(realm, goal)) return { ok:false, reason:"relation-too-low-for-mission" };
    const envoy = livingEnvoy(realm);
    if (!envoy) return { ok:false, reason:"no-living-envoy" };
    if (diplomacy.missions.some(item => item.realmId === realm.id)) return { ok:false, reason:"mission-already-active-for-realm" };
    if (diplomacy.missions.length >= DIPLOMACY_MISSION_LIMIT) return { ok:false, reason:"mission-limit-reached" };
    const year = currentYear();
    if (diplomacy.missionLastSendYear >= year) return { ok:false, reason:"one-mission-per-year" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_MISSION_COST.gold) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -DIPLOMACY_MISSION_COST.gold);
    diplomacy.missionCounter = Math.min(1_000_000, diplomacy.missionCounter + 1);
    const mission = normalizeMissionEntry({
        id:"diplomacy-mission-" + year + "-" + diplomacy.missionCounter,
        realmId:realm.id,
        goalTreaty:goal,
        stage:"sent",
        envoyId:realm.envoyId,
        envoyName:realm.envoyName,
        envoySkill:realm.envoySkill,
        sentYear:year,
        expiresYear:year + DIPLOMACY_MISSION_LIFETIME_YEARS,
        summary:"Envoy " + (realm.envoyName || "unnamed") + " sent to " + definition.name + " to negotiate " + (goal === "trade" ? "a trade pact" : "an alliance") + "."
    });
    diplomacy.missions.push(mission);
    diplomacy.missionLastSendYear = year;
    record(diplomacy, realm, "mission", mission.summary);
    applyPoliticalEffects({ legitimacy:0.05, guilds:0.1 });
    addLog("ENVOY MISSION SENT TO " + definition.name.toUpperCase(), "#e8c77b", "diplomacy");
    return {
        ok:true,
        message:"DIPLOMATIC MISSION SENT · " + definition.name.toUpperCase() + " · " + (goal === "trade" ? "TRADE PACT" : "ALLIANCE"),
        mission:missionSnapshot(diplomacy, mission),
        realm:realmSnapshot(realm)
    };
}

export function negotiateEnvoyMission(id) {
    const { diplomacy, mission, realm, definition } = locateMission(id);
    if (!mission) return { ok:false, reason:"mission-not-found" };
    if (mission.stage !== "sent") return { ok:false, reason:"mission-not-ready-for-negotiation" };
    const year = currentYear();
    if (year <= mission.sentYear) return { ok:false, reason:"negotiation-waits-for-next-year" };
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!missionLadderOpen(realm, mission.goalTreaty)) return { ok:false, reason:"treaty-context-changed" };
    if (!missionEnvoyEntity(realm, mission)) return { ok:false, reason:"mission-envoy-unavailable" };
    const court = getCourtModifiers();
    const chancellorGain = clamp(Number(court.diplomacyGain) || 1, 1, 4);
    const foreignInsight = clamp(state.espionage?.foreignInsight ?? 0);
    const targetedForeignDesk = (Array.isArray(state.espionage?.agents) ? state.espionage.agents : [])
        .some(agent => String(agent?.desk) === "foreign" && String(agent?.targetId) === String(realm.id) && !agent.turned);
    const roll = rand(0, 1, "diplomacy");
    const score = Math.round(
        realm.relation + realm.trust * 0.15 + (mission.envoySkill - 50) * 0.30 +
        (chancellorGain - 1) * 40 + foreignInsight * 0.10 + (targetedForeignDesk ? 5 : 0) + (roll * 10 - 5)
    );
    const difficulty = DIPLOMACY_MISSION_THRESHOLDS[mission.goalTreaty];
    const outcome = score >= difficulty ? "accepted" : "rejected";
    mission.stage = "negotiated";
    mission.negotiatedYear = year;
    mission.chancellorGain = chancellorGain;
    mission.foreignInsight = foreignInsight;
    mission.targetedForeignDesk = targetedForeignDesk;
    mission.roll = roll;
    mission.score = score;
    mission.difficulty = difficulty;
    mission.outcome = outcome;
    mission.summary = "Negotiation with " + definition.name + " scored " + score + "/" + difficulty +
        " (envoy " + Math.round(mission.envoySkill) + ", chancellor ×" + chancellorGain.toFixed(2) +
        ", foreign insight " + Math.round(foreignInsight) + ", roll " + roll.toFixed(3) + "): " + outcome + ".";
    record(diplomacy, realm, "mission", mission.summary);
    addLog("DIPLOMATIC NEGOTIATION · " + definition.name.toUpperCase() + " · " + outcome.toUpperCase(), outcome === "accepted" ? "#a5d6a7" : "#d8a38a", "diplomacy");
    return {
        ok:true,
        message:"DIPLOMATIC NEGOTIATION · " + outcome.toUpperCase() + " · SCORE " + score + "/" + difficulty,
        mission:missionSnapshot(diplomacy, mission),
        realm:realmSnapshot(realm),
        roll,
        score,
        difficulty,
        outcome
    };
}

export function reportEnvoyMission(id) {
    const { diplomacy, mission, realm, definition } = locateMission(id);
    if (!mission) return { ok:false, reason:"mission-not-found" };
    if (mission.stage !== "negotiated") return { ok:false, reason:"mission-not-ready-to-report" };
    const year = currentYear();
    if (year <= mission.negotiatedYear) return { ok:false, reason:"report-waits-for-next-year" };
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!missionEnvoyEntity(realm, mission)) return { ok:false, reason:"mission-envoy-unavailable" };
    const name = definition.name;
    if (mission.outcome === "rejected") {
        const reason = "the court refused the " + (mission.goalTreaty === "trade" ? "trade pact" : "alliance");
        closeMission(diplomacy, mission, realm, definition, reason, true);
        return { ok:true, message:"DIPLOMATIC MISSION REJECTED · " + name.toUpperCase() + " · NO TREATY SIGNED", rejected:true };
    }
    mission.stage = "reported";
    mission.reportYear = year;
    mission.summary = "Terms accepted by " + name + " with score " + Math.round(Number(mission.score) || 0) + "/" +
        Math.round(Number(mission.difficulty) || 0) + ". The crown can ratify in year " + (year + 1) + ".";
    record(diplomacy, realm, "mission", mission.summary);
    addLog("ENVOY REPORT FROM " + name.toUpperCase() + " · RATIFICATION PENDING", "#e8c77b", "diplomacy");
    return { ok:true, message:"DIPLOMATIC REPORT FILED · " + name.toUpperCase() + " · RATIFY NEXT YEAR", mission:missionSnapshot(diplomacy, mission), realm:realmSnapshot(realm) };
}

export function ratifyEnvoyMission(id) {
    const { diplomacy, mission, realm, definition } = locateMission(id);
    if (!mission) return { ok:false, reason:"mission-not-found" };
    if (mission.stage !== "reported") return { ok:false, reason:"mission-not-ready-to-ratify" };
    if (mission.outcome !== "accepted") return { ok:false, reason:"mission-was-rejected" };
    const year = currentYear();
    if (year <= mission.reportYear) return { ok:false, reason:"ratification-waits-for-next-year" };
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!missionLadderOpen(realm, mission.goalTreaty)) return { ok:false, reason:"treaty-context-changed" };
    if (!missionEnvoyEntity(realm, mission)) return { ok:false, reason:"mission-envoy-unavailable" };
    const gain = clamp(Number(mission.chancellorGain) || 1, 1, 4);
    realm.treaty = mission.goalTreaty;
    realm.treatySinceYear = year;
    if (mission.goalTreaty === "trade") {
        realm.relation = clamp(realm.relation + 4 * gain);
        realm.trust = clamp(realm.trust + 4);
        applyPoliticalEffects({ legitimacy:0.3, guilds:1.1 });
    } else {
        realm.relation = clamp(realm.relation + 6 * gain);
        realm.trust = clamp(realm.trust + 5);
        realm.fear = clamp(realm.fear - 2);
        applyPoliticalEffects({ legitimacy:1, nobility:1.2, guilds:0.6 });
        state.morale = clamp((Number(state.morale) || 0) + 1);
    }
    const verdict = mission.goalTreaty === "trade" ? "TRADE PACT RATIFIED" : "ALLIANCE SWORN";
    record(diplomacy, realm, "treaty", verdict + " with " + definition.name + " after envoy negotiation");
    record(diplomacy, realm, "mission", "Envoy mission to " + definition.name + " concluded: " + verdict);
    removeMission(diplomacy, mission.id);
    addLog(verdict + " · " + definition.name.toUpperCase(), "#a5d6a7", "diplomacy");
    return { ok:true, message:"DIPLOMATIC " + verdict + " · " + definition.name.toUpperCase(), realm:realmSnapshot(realm), verdict };
}

export function updateDiplomaticMissions() {
    const diplomacy = ensureDiplomacy();
    const year = currentYear();
    if (diplomacy.missionLastUpdateYear >= year) {
        return { annual:false, year, closed:0, missions:getDiplomaticMissionSnapshot(), lastUpdateYear:diplomacy.missionLastUpdateYear };
    }
    let closed = 0;
    for (const mission of [...diplomacy.missions]) {
        if (!diplomacy.missions.includes(mission)) continue;
        const realm = missionRealmFor(diplomacy, mission);
        const definition = REALM_BY_ID.get(mission.realmId) || null;
        let reason = null;
        if (!realm || !definition) reason = "the realm no longer exists";
        else if (realm.treaty === "war") reason = "war closed the court";
        else if (year > mission.expiresYear) reason = "the negotiation mandate expired";
        else if (!missionEnvoyEntity(realm, mission)) reason = "the envoy died or was recalled";
        else if (!missionLadderOpen(realm, mission.goalTreaty)) reason = "the treaty ladder changed";
        if (reason) {
            closeMission(diplomacy, mission, realm, definition, reason, reason !== "the treaty ladder changed");
            closed++;
        }
    }
    diplomacy.missions = normalizeMissionList(diplomacy.missions);
    diplomacy.missionLastUpdateYear = year;
    return { annual:true, year, closed, missions:getDiplomaticMissionSnapshot(), lastUpdateYear:year };
}

function breakTradeAgreement(diplomacy, realm, definition, reason) {
    const runtime = realm.tradeAgreement;
    if (!runtime) return 0;
    const details = TRADE_AGREEMENT_BREAKS[reason] || TRADE_AGREEMENT_BREAKS.cancel;
    const years = Math.max(0, currentYear() - runtime.sinceYear);
    realm.tradeAgreement = null;
    realm.relation = clamp(realm.relation + details.relation);
    realm.trust = clamp(realm.trust + details.trust);
    realm.fear = clamp(realm.fear + details.fear);
    record(diplomacy, realm, details.kind, details.label + " the trade agreement with " + definition.name + " after " + years + " years");
    applyPoliticalEffects({ legitimacy:details.legitimacy, guilds:details.guilds });
    state.morale = clamp((Number(state.morale) || 0) + details.morale);
    addLog(details.label.toUpperCase() + ": " + definition.name.toUpperCase(), details.color, "diplomacy");
    return years;
}

export function signTradeAgreement(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"war-closes-the-court" };
    if (realm.tradeAgreement) return { ok:false, reason:"a-trade-agreement-is-already-in-force" };
    const terms = tradeAgreementTerms(definition, foreignMarriageBond(realm.id));
    if (!terms) return { ok:false, reason:"no-trade-agreement-offered" };
    if (realm.relation < terms.minRelation) return { ok:false, reason:"relation-below-" + terms.minRelation };
    if (realm.trust < terms.minTrust) return { ok:false, reason:"trust-below-" + terms.minTrust };
    if ((Number(state.resources?.gold) || 0) < terms.signingGold) return { ok:false, reason:"not-enough-gold" };
    addResource("gold", -terms.signingGold);
    const year = currentYear();
    realm.tradeAgreement = {
        sinceYear:year,
        lastSettledYear:year,
        yearsServed:0,
        imports:0,
        exports:0,
        goldPaid:terms.signingGold,
        goldEarned:0
    };
    realm.relation = clamp(realm.relation + 3);
    realm.trust = clamp(realm.trust + 2.5);
    realm.fear = clamp(realm.fear - 1);
    record(diplomacy, realm, "trade-agreement", "Trade agreement signed with " + definition.name + ": imports " + terms.importPerYear + " " + terms.importResource + " per year, exports surplus " + terms.exportResource + " at " + terms.exportUnitGold + " gold per unit");
    applyPoliticalEffects({ legitimacy:0.2, guilds:0.9 });
    state.morale = clamp((Number(state.morale) || 0) + 0.3);
    addLog("TRADE AGREEMENT SIGNED WITH " + definition.name.toUpperCase(), "#a5d6a7", "diplomacy");
    return { ok:true, message:"Trade agreement signed with " + definition.name, realm:realmSnapshot(realm) };
}

export function cancelTradeAgreement(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (!realm.tradeAgreement) return { ok:false, reason:"no-trade-agreement-is-in-force" };
    const years = breakTradeAgreement(diplomacy, realm, definition, "cancel");
    return { ok:true, message:"Trade agreement with " + definition.name + " cancelled after " + years + " years", realm:realmSnapshot(realm) };
}

function settleTradeAgreement(diplomacy, realm, definition, year, effects) {
    const runtime = realm.tradeAgreement;
    if (!runtime || realm.treaty === "war") return;
    if (runtime.lastSettledYear >= year) return;
    const terms = tradeAgreementTerms(definition, foreignMarriageBond(realm.id));
    if (!terms) { realm.tradeAgreement = null; return; }
    if ((Number(state.resources?.gold) || 0) < terms.annualGold) {
        breakTradeAgreement(diplomacy, realm, definition, "arrears");
        return;
    }
    addResource("gold", -terms.annualGold);
    runtime.goldPaid = Math.min(1_000_000_000, runtime.goldPaid + terms.annualGold);
    let imported = 0;
    let exported = 0;
    let earned = 0;
    const partner = Array.isArray(state.market?.partners)
        ? state.market.partners.find(item => item && item.id === realm.id) || null
        : null;
    if (partner) {
        partner.stock = partner.stock && typeof partner.stock === "object" ? partner.stock : {};
        const stock = Math.max(0, Math.floor(Number(partner.stock[terms.importResource]) || 0));
        imported = Math.min(terms.importPerYear, stock);
        if (imported > 0) {
            partner.stock[terms.importResource] = stock - imported;
            addResource(terms.importResource, imported);
            if (terms.importResource === "food") {
                recordResourceMovement("food", imported, "trade-agreement", {
                    from:{kind:"market", id:partner.id}, to:{kind:"realm", id:"royal-stores"}
                });
            }
        }
        const available = Math.max(0, Math.floor((Number(state.resources?.[terms.exportResource]) || 0) - terms.exportKeep));
        const affordable = Math.max(0, Math.floor((Number(partner.treasury) || 0) / terms.exportUnitGold));
        exported = Math.min(terms.exportCap, available, affordable);
        if (exported > 0) {
            earned = exported * terms.exportUnitGold;
            addResource(terms.exportResource, -exported);
            addResource("gold", earned);
            partner.stock[terms.exportResource] = Math.max(0, Number(partner.stock[terms.exportResource]) || 0) + exported;
            partner.treasury = Math.max(0, (Number(partner.treasury) || 0) - earned);
        }
    }
    runtime.lastSettledYear = year;
    runtime.yearsServed = Math.min(9999, runtime.yearsServed + 1);
    runtime.imports = Math.min(1_000_000_000, runtime.imports + imported);
    runtime.exports = Math.min(1_000_000_000, runtime.exports + exported);
    runtime.goldEarned = Math.min(1_000_000_000, runtime.goldEarned + earned);
    realm.tradeVolume = Math.min(1_000_000_000, realm.tradeVolume + imported + exported);
    if (imported > 0 || exported > 0) {
        realm.lastTradeYear = year;
        realm.lastContactYear = year;
    }
    realm.relation = clamp(realm.relation + 1.2);
    realm.trust = clamp(realm.trust + 0.8);
    effects.guilds += 0.12;
    effects.legitimacy += 0.02;
}

export function updateDiplomacy() {
    const diplomacy = ensureDiplomacy();
    const year = currentYear();
    if (diplomacy.lastUpdateYear >= year) return getDiplomacySnapshot();
    // One bounded reading of the standing army. It drifts fear, deters border
    // incidents and shortens a war the crown is visibly winning.
    const dread = getCrownDread();
    updateGuarantees(diplomacy, year);
    const court = getCourtModifiers();
    const biome = getSpecialBiomeInfluence().diplomacy;
    const credibilityDelta = (clamp(diplomacy.guaranteeCredibility) - 50) * 0.005;
    const effects = { legitimacy:0, commons:0, nobility:0, guilds:0, clergy:0 };
    let moraleDelta = 0;
    effects.commons += biome.commons;
    effects.nobility += biome.nobility;
    effects.guilds += biome.guilds;
    effects.clergy += biome.clergy;
    effects.legitimacy += biome.relationDrift * 0.08;

    for (const realm of diplomacy.realms) {
        const definition = REALM_BY_ID.get(realm.id);
        if (!definition) continue;
        // A treaty saved before the clock existed starts its clock here instead
        // of reading as an ancient pact the first time it is loaded.
        if (realm.treaty !== "none" && Number(realm.treatySinceYear) <= 0) realm.treatySinceYear = year;
        const standing = getDiplomaticStanding(realm, year);
        const envoy = livingEnvoy(realm);
        if (realm.treaty === "war") {
            if (realm.tradeAgreement) breakTradeAgreement(diplomacy, realm, definition, "war");
        } else {
            // The agreement settles only in the existing annual diplomacy pass.
            // It reads and writes the same market partner stock and treasury the
            // caravans use, so there is no second trade loop to keep in sync.
            settleTradeAgreement(diplomacy, realm, definition, year, effects);
        }
        if (realm.treaty === "war") {
            realm.warExhaustion = clamp(realm.warExhaustion + 2 + Math.min(2, Math.max(0, dread.dread - 50) * 0.04));
            realm.relation = clamp(realm.relation - 1.2 - realm.warExhaustion * 0.01);
            realm.trust = clamp(realm.trust - 0.2);
            realm.fear = clamp(realm.fear + 0.8);
            effects.guilds -= 0.08 + realm.warExhaustion * 0.002;
            effects.legitimacy -= 0.05 + realm.warExhaustion * 0.001;
            effects.nobility += 0.04;
            moraleDelta -= 0.08 + realm.warExhaustion * 0.002;
        } else if (realm.treaty === "alliance") {
            realm.relation = clamp(realm.relation + 1 + (envoy ? 0.6 : 0));
            realm.trust = clamp(realm.trust + 0.6);
            realm.fear = clamp(realm.fear - 0.4);
            effects.legitimacy += 0.08;
            effects.guilds += 0.04;
            // Standing raises the same annual aid rather than adding a second
            // reward loop: a long alliance is simply worth more each year.
            addResource("gold", 3 + standing.allianceGold);
            addResource("food", 4 + standing.allianceFood);
        } else if (realm.treaty === "trade") {
            realm.relation = clamp(realm.relation + 0.7 + (envoy ? 0.5 : 0));
            realm.trust = clamp(realm.trust + 0.4);
            realm.fear = clamp(realm.fear - 0.2);
            effects.guilds += 0.1;
        } else {
            realm.relation = clamp(realm.relation + (50 - realm.relation) * 0.04 + (envoy ? 0.4 : 0));
            realm.trust = clamp(realm.trust + (realm.relation - realm.trust) * 0.03);
            realm.fear = clamp(realm.fear - 0.3);
        }

        const marriageBond = foreignMarriageBond(realm.id);
        if (marriageBond && realm.treaty !== "war") {
            realm.relation = clamp(realm.relation + 1.2);
            realm.trust = clamp(realm.trust + 0.8);
            effects.legitimacy += 0.03;
        }
        if (realm.lastTradeYear >= year - 1 && realm.treaty !== "war") {
            realm.relation = clamp(realm.relation + 0.35);
        }
        const chancery = Math.max(0, Number(getEndeavourModifiers().diplomacy) || 0);
        if (chancery && realm.treaty !== "war") realm.relation = clamp(realm.relation + chancery);
        if (realm.guarantee && !realm.guaranteeCall) {
            realm.relation = clamp(realm.relation + 0.4);
            realm.trust = clamp(realm.trust + 0.2);
        }
        // The age of the treaty itself is the second reader of treatySinceYear.
        // A court that has kept faith for years trusts the crown more each
        // annual court; a war reads zero standing and never gains this.
        if (realm.treaty !== "war" && standing.trustGain > 0) {
            realm.trust = clamp(realm.trust + standing.trustGain);
        }
        // Standing is a long-term asset: honoured guarantees make every court
        // slightly more willing to trust the crown, while broken ones decay it.
        if (realm.treaty !== "war") realm.trust = clamp(realm.trust + credibilityDelta);
        // Charted rare goods, attunement and blight all colour the neighbouring
        // courts. This is one cached scalar, not a scan of the atlas per realm.
        realm.relation = clamp(realm.relation + biome.relationDrift);
        // A court tests a crown it does not fear. This threshold is the only
        // place the garrison changes how often the border is probed.
        const incidentThreshold = 20 + Math.max(0, 50 - dread.dread) * 0.12 - standing.incidentRelief;
        if (realm.treaty !== "war" && realm.relation < incidentThreshold && year - realm.lastIncidentYear >= 3) {
            const incidentScale = Math.max(0.2, 1 - court.incidentReduction);
            realm.lastIncidentYear = year;
            realm.relation = clamp(realm.relation - 2 * incidentScale);
            realm.fear = clamp(realm.fear + 3 * incidentScale);
            moraleDelta -= 0.5 * incidentScale;
            adjustHiddenTension(2 * incidentScale);
            record(diplomacy, realm, "incident", "Border incident with " + definition.name);
            addLog("BORDER TENSION WITH " + definition.name.toUpperCase(), "#d8a38a", "diplomacy");
        }

        // Fear finally has a reader: it drifts toward the crown's measured dread
        // once a year, and a crown feared past 60 pays for it in trust. Trade
        // terms read the same value in diplomacy-trade.js.
        realm.fear = clamp(realm.fear + Math.max(-2.5, Math.min(2.5, (dread.dread - realm.fear) * 0.35)));
        if (realm.fear > 60) realm.trust = clamp(realm.trust - (realm.fear - 60) * 0.02);
        const relationHistory = Array.isArray(realm.relationHistory) ? realm.relationHistory : [];
        relationHistory.push(Math.round(realm.relation * 10) / 10);
        if (relationHistory.length > 12) relationHistory.shift();
        realm.relationHistory = relationHistory;
    }

    diplomacy.lastUpdateYear = year;
    if (Object.values(effects).some(value => Math.abs(value) > 0.001)) {
        // Annual drift is not a royal decision, so it must not inflate the
        // political settlement counter the way an explicit decree does.
        const politics = normalizePoliticalState();
        politics.legitimacy = clamp(politics.legitimacy + effects.legitimacy);
        for (const faction of POLITICAL_FACTIONS) politics.factions[faction] = clamp(politics.factions[faction] + effects[faction]);
    }
    const morale = Number.isFinite(Number(state.morale)) ? Number(state.morale) : 72;
    state.morale = clamp(morale + moraleDelta);
    return getDiplomacySnapshot();
}
