// Neighbouring realms: relations, treaties, gifts, war and peace. This state is
// deliberately bounded to the four market partners and updates once per year.
import { state } from "../core/state.js";
import { DIPLOMATIC_REALMS, DIPLOMATIC_TREATIES, normalizeTreaty } from "./diplomacy-config.js";
import { addLog } from "./events.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects, normalizePoliticalState, POLITICAL_FACTIONS } from "./politics.js";
import { getCourtModifiers } from "./court.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { TYPE } from "../core/types.js";

export const DIPLOMACY_COSTS = Object.freeze({ gift:12, tradePact:15, alliance:25, peaceGold:20, peaceFood:15, envoy:8 });
export const TRADE_PACT_RELATION = 45;
export const ALLIANCE_RELATION = 70;

const REALM_BY_ID = new Map(DIPLOMATIC_REALMS.map(realm => [realm.id, realm]));
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const currentYear = () => Math.max(1, Math.floor(Number(state.year) || 1));
const currentTick = () => Math.max(0, Math.floor(Number(state.tick) || 0));

function relationLabel(relation) {
    if (relation >= 85) return "Devoted";
    if (relation >= 70) return "Cordial";
    if (relation >= 45) return "Wary";
    if (relation >= 20) return "Strained";
    return "Hostile";
}

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = String(entry.summary || "").trim().slice(0, 160);
    if (!summary) return null;
    return {
        year:integer(entry.year, 0),
        tick:integer(entry.tick, 0),
        kind:String(entry.kind || "realm").slice(0, 24),
        realmId:entry.realmId ? String(entry.realmId).slice(0, 40) : null,
        summary
    };
}

export function createDiplomacyState() {
    return {
        version:1,
        lastUpdateYear:0,
        realms:DIPLOMATIC_REALMS.map(realm => ({
            id:realm.id,
            relation:realm.baseRelation,
            trust:realm.baseTrust,
            fear:realm.baseFear,
            treaty:"none",
            treatySinceYear:0,
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
        history:[]
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
        realms,
        history:(Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, 30)
    };
}

export function ensureDiplomacy() {
    const current = state.diplomacy;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== 1 || !Array.isArray(current.realms)) {
        state.diplomacy = normalizeDiplomacySnapshot(current);
    }
    return state.diplomacy;
}

function realmSnapshot(realm) {
    const definition = REALM_BY_ID.get(realm.id);
    return {
        ...definition,
        ...realm,
        treatyLabel:DIPLOMATIC_TREATIES[realm.treaty]?.label || "Neutral",
        treatyTone:DIPLOMATIC_TREATIES[realm.treaty]?.tone || "neutral",
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
    for (const realm of realms) {
        counts[realm.treaty] = (counts[realm.treaty] || 0) + 1;
        relationTotal += realm.relation;
        if (realm.envoyId) envoys++;
    }
    return {
        realms,
        counts,
        envoys,
        averageRelation:realms.length ? Math.round((relationTotal / realms.length) * 10) / 10 : 0,
        lastUpdateYear:diplomacy.lastUpdateYear,
        history:diplomacy.history.slice(0, 12),
        costs:DIPLOMACY_COSTS,
        thresholds:{ tradePact:TRADE_PACT_RELATION, alliance:ALLIANCE_RELATION }
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

export function declareWar(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty === "war") return { ok:false, reason:"already-at-war" };
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

export function sueForPeace(id) {
    const { diplomacy, realm, definition } = locate(id);
    if (!realm || !definition) return { ok:false, reason:"unknown-realm" };
    if (realm.treaty !== "war") return { ok:false, reason:"not-at-war" };
    if ((Number(state.resources?.gold) || 0) < DIPLOMACY_COSTS.peaceGold) return { ok:false, reason:"not-enough-gold" };
    if ((Number(state.resources?.food) || 0) < DIPLOMACY_COSTS.peaceFood) return { ok:false, reason:"not-enough-food" };
    addResource("gold", -DIPLOMACY_COSTS.peaceGold);
    addResource("food", -DIPLOMACY_COSTS.peaceFood);
    realm.treaty = "none";
    realm.treatySinceYear = currentYear();
    realm.warExhaustion = 0;
    realm.relation = clamp(Math.max(28, realm.relation + 12));
    realm.trust = clamp(realm.trust + 2);
    realm.fear = clamp(realm.fear - 6);
    record(diplomacy, realm, "peace", "Peace concluded with " + definition.name);
    applyPoliticalEffects({ legitimacy:1, guilds:1, clergy:1 });
    state.morale = clamp((Number(state.morale) || 0) + 2);
    adjustHiddenTension(-5);
    addLog("PEACE CONCLUDED WITH " + definition.name.toUpperCase(), "#a5d6a7", "diplomacy");
    return { ok:true, message:"Peace concluded with " + definition.name, realm:realmSnapshot(realm) };
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

export function updateDiplomacy() {
    const diplomacy = ensureDiplomacy();
    const year = currentYear();
    if (diplomacy.lastUpdateYear >= year) return getDiplomacySnapshot();
    const court = getCourtModifiers();
    const effects = { legitimacy:0, commons:0, nobility:0, guilds:0, clergy:0 };
    let moraleDelta = 0;

    for (const realm of diplomacy.realms) {
        const definition = REALM_BY_ID.get(realm.id);
        if (!definition) continue;
        const envoy = livingEnvoy(realm);
        if (realm.treaty === "war") {
            realm.warExhaustion = clamp(realm.warExhaustion + 2);
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
            addResource("gold", 3);
            addResource("food", 4);
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

        if (realm.lastTradeYear >= year - 1 && realm.treaty !== "war") {
            realm.relation = clamp(realm.relation + 0.35);
        }
        if (realm.treaty !== "war" && realm.relation < 20 && year - realm.lastIncidentYear >= 3) {
            const incidentScale = Math.max(0.2, 1 - court.incidentReduction);
            realm.lastIncidentYear = year;
            realm.relation = clamp(realm.relation - 2 * incidentScale);
            realm.fear = clamp(realm.fear + 3 * incidentScale);
            moraleDelta -= 0.5 * incidentScale;
            adjustHiddenTension(2 * incidentScale);
            record(diplomacy, realm, "incident", "Border incident with " + definition.name);
            addLog("BORDER TENSION WITH " + definition.name.toUpperCase(), "#d8a38a", "diplomacy");
        }

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
