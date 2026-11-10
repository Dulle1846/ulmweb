// Law & justice: named judges, emergent crime, real trials and sentences,
// charters, legal codes and judicial corruption. Cases are generated and
// judged once per year; taxes, trade, migration and desertion read a small
// cached modifier block.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { random } from "../core/random.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects } from "./politics.js";
import { addPersonMemory, ensurePersonProfile, createPersonMemorial, PERSON_SPECIES, MAX_PERSON_ARCHIVE } from "./people.js";

export const JUSTICE_VERSION = 1;
export const JUSTICE_HISTORY_LIMIT = 24;
export const MAX_JUDGES = 6;
export const MAX_PENDING_CASES = 6;
export const JUDGE_APPOINTMENT_COST = 10;
export const JUDGE_SALARY = 6;
export const LAW_CHANGE_COST = 20;
export const CHARTER_LIMIT = 4;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = value => Math.max(0, Math.round(Number(value) || 0));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const trait = (person, key) => clamp(person?.traits?.[key] ?? 50, 0, 100);
const maturityFor = person => PERSON_SPECIES[person?.species]?.maturation ?? 16;
const residents = () => state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
const isComplete = entity => Boolean(entity && !entity.dead && !(entity.construction && Number(entity.construction.stage) < 3));

export const LAW_CODES = Object.freeze({
    customary: Object.freeze({
        label: "Customary law", description: "Local custom and the lord's memory. Nothing is gained and nothing is risked.",
        tax: 1, trade: 1, morale: 0, migration: 1, desertion: 1, crime: 1, legitimacy: 0
    }),
    royal: Object.freeze({
        label: "Royal law", description: "One written code from the crown. Firm taxes and firmer garrisons, at the cost of trade and goodwill.",
        tax: 1.06, trade: 0.97, morale: -0.5, migration: 0.92, desertion: 0.86, crime: 0.84, legitimacy: 0.5
    }),
    guild: Object.freeze({
        label: "Guild law", description: "Merchant courts and chartered privileges. Trade and tax reach grow; the poor see less protection.",
        tax: 0.98, trade: 1.07, morale: -0.1, migration: 1.03, desertion: 1.05, crime: 1.10, legitimacy: -0.2
    }),
    common: Object.freeze({
        label: "Common law", description: "Juries of householders and public courts. Calmer streets and new settlers, but lower tax yield.",
        tax: 0.95, trade: 1, morale: 0.7, migration: 1.10, desertion: 0.95, crime: 0.90, legitimacy: 0.3
    })
});

export const SENTENCES = Object.freeze({
    fine: Object.freeze({ label: "Fine", description: "The defendant pays the crown. Treasury gain, small deterrent." }),
    labor: Object.freeze({ label: "Forced labour", description: "Walls, roads and timber yards gain work. Morale suffers a little." }),
    exile: Object.freeze({ label: "Banishment", description: "The defendant leaves the realm. Population falls, crime falls more." }),
    galley: Object.freeze({ label: "Galley service", description: "The crown sells the sentence to a galley master. Gold now, hard justice." }),
    acquit: Object.freeze({ label: "Acquit", description: "No punishment. Public goodwill rises; disorder grows." })
});

export const CHARTERS = Object.freeze({
    guild: Object.freeze({
        label: "Guild charter", cost: Object.freeze({ gold: 20, wood: 10 }),
        trade: 0.05, tax: 0.02, crime: -0.04, morale: 0.4,
        description: "Charter the guilds' own court and market seals. Trade and tax rise, crime falls."
    }),
    town: Object.freeze({
        label: "Town charter", cost: Object.freeze({ gold: 16, stone: 10 }),
        tax: 0.04, migration: 0.06, crime: -0.02, morale: 0.25,
        description: "Grant the township its own council and rolls. Tax reach and settlement grow."
    })
});

export const CRIMES = Object.freeze({
    theft: Object.freeze({ label: "Theft", cause: "inequality", severity: 1 }),
    riot: Object.freeze({ label: "Grain riot", cause: "hunger", severity: 2 }),
    poaching: Object.freeze({ label: "Poaching", cause: "hunger", severity: 1 }),
    desertion: Object.freeze({ label: "Desertion", cause: "war", severity: 2 }),
    breach: Object.freeze({ label: "Quarantine breach", cause: "quarantine", severity: 1 }),
    fraud: Object.freeze({ label: "Market fraud", cause: "unemployment", severity: 1 })
});

export const CRIME_CAUSES = Object.freeze({
    inequality: Object.freeze({ label: "Inequality" }),
    hunger: Object.freeze({ label: "Hunger" }),
    war: Object.freeze({ label: "War" }),
    quarantine: Object.freeze({ label: "Quarantine" }),
    unemployment: Object.freeze({ label: "Unemployment" })
});

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = String(entry.summary || "").trim().slice(0, 200);
    if (!summary) return null;
    return {
        year: round(entry.year),
        tick: round(entry.tick),
        kind: String(entry.kind || "justice").slice(0, 32),
        summary
    };
}

function normalizeJudge(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const personId = String(entry.personId || "").slice(0, 100);
    if (!personId) return null;
    return {
        personId,
        name: String(entry.name || "Unnamed judge").slice(0, 90),
        competence: clamp(entry.competence ?? 50, 1, 100),
        integrity: clamp(entry.integrity ?? 50, 0, 100),
        appointedYear: Math.max(1, round(entry.appointedYear) || 1),
        salary: clamp(entry.salary ?? JUDGE_SALARY, 0, 100),
        convictions: round(entry.convictions),
        investigatedYear: round(entry.investigatedYear)
    };
}

function normalizeCase(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const id = String(entry.id || "").slice(0, 100);
    const defendantName = String(entry.defendantName || "").slice(0, 90);
    if (!id || !defendantName) return null;
    return {
        id,
        defendantId: String(entry.defendantId || "").slice(0, 100),
        defendantName,
        crime: CRIMES[entry.crime] ? entry.crime : "theft",
        crimeLabel: CRIMES[entry.crime] ? CRIMES[entry.crime].label : "Theft",
        cause: CRIME_CAUSES[entry.cause] ? entry.cause : "inequality",
        severity: clamp(entry.severity ?? 1, 1, 4),
        createdYear: Math.max(1, round(entry.createdYear) || 1),
        victim: String(entry.victim || "the crown").slice(0, 60),
        status: entry.status === "closed" ? "closed" : "pending"
    };
}

export function createJusticeState() {
    return {
        version: JUSTICE_VERSION,
        revision: 1,
        lastUpdateYear: 0,
        judges: [],
        lawCode: "customary",
        lastLawChangeYear: 0,
        charters: [],
        lastCharterYear: 0,
        cases: [],
        crime: { rate: 0.04, offset: 0, level: "low", causes: { inequality: 0, hunger: 0, war: 0, quarantine: 0, unemployment: 0 } },
        corruption: { level: 0, lostGold: 0, recovered: 0, investigations: 0 },
        sentenceTotals: { fine: 0, labor: 0, exile: 0, galley: 0, acquit: 0 },
        history: [],
        lastAudit: null,
        totals: { judges: 0, cases: 0, closed: 0 }
    };
}

export function normalizeJusticeState(input = state.justice) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const crime = source.crime && typeof source.crime === "object" && !Array.isArray(source.crime) ? source.crime : {};
    const causes = crime.causes && typeof crime.causes === "object" && !Array.isArray(crime.causes) ? crime.causes : {};
    const corruption = source.corruption && typeof source.corruption === "object" && !Array.isArray(source.corruption) ? source.corruption : {};
    const totals = source.totals && typeof source.totals === "object" && !Array.isArray(source.totals) ? source.totals : {};
    const sentenceTotals = source.sentenceTotals && typeof source.sentenceTotals === "object" && !Array.isArray(source.sentenceTotals) ? source.sentenceTotals : {};
    const rate = clamp(crime.rate ?? 0.04, 0, 1);
    const normalized = {
        version: JUSTICE_VERSION,
        revision: Math.max(1, round(source.revision) || 1),
        lastUpdateYear: round(source.lastUpdateYear),
        judges: (Array.isArray(source.judges) ? source.judges : []).map(normalizeJudge).filter(Boolean).slice(0, MAX_JUDGES),
        lawCode: LAW_CODES[source.lawCode] ? source.lawCode : "customary",
        lastLawChangeYear: round(source.lastLawChangeYear),
        charters: (Array.isArray(source.charters) ? source.charters : [])
            .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry) && CHARTERS[entry.kind])
            .slice(0, CHARTER_LIMIT)
            .map(entry => ({
                kind: entry.kind,
                grantedYear: Math.max(1, round(entry.grantedYear) || 1),
                label: CHARTERS[entry.kind].label
            })),
        lastCharterYear: round(source.lastCharterYear),
        cases: (Array.isArray(source.cases) ? source.cases : []).map(normalizeCase).filter(entry => entry && entry.status === "pending").slice(0, MAX_PENDING_CASES),
        crime: {
            rate,
            offset: clamp(crime.offset ?? 0, -0.2, 0.2),
            level: typeof crime.level === "string" ? crime.level.slice(0, 24) : "low",
            causes: {
                inequality: clamp(causes.inequality, 0, 1),
                hunger: clamp(causes.hunger, 0, 1),
                war: clamp(causes.war, 0, 1),
                quarantine: clamp(causes.quarantine, 0, 1),
                unemployment: causes.unemployment == null ? null : clamp(causes.unemployment, 0, 1)
            }
        },
        corruption: {
            level: clamp(corruption.level, 0, 100),
            lostGold: round(corruption.lostGold),
            recovered: round(corruption.recovered),
            investigations: round(corruption.investigations)
        },
        sentenceTotals: {
            fine: round(sentenceTotals.fine),
            labor: round(sentenceTotals.labor),
            exile: round(sentenceTotals.exile),
            galley: round(sentenceTotals.galley),
            acquit: round(sentenceTotals.acquit)
        },
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, JUSTICE_HISTORY_LIMIT),
        lastAudit: source.lastAudit && typeof source.lastAudit === "object" && !Array.isArray(source.lastAudit) ? { ...source.lastAudit } : null,
        totals: {
            judges: round(totals.judges),
            cases: round(totals.cases),
            closed: round(totals.closed)
        }
    };
    if (state.justice === input) state.justice = normalized;
    return normalized;
}

export function ensureJustice() {
    const current = state.justice;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== JUSTICE_VERSION ||
        !Array.isArray(current.judges) || !Array.isArray(current.cases) || !current.crime) {
        state.justice = normalizeJusticeState(current);
    }
    return state.justice;
}

function touch(justice) {
    justice.revision = Math.max(1, Number(justice.revision) || 1) + 1;
}

function record(justice, kind, summary) {
    justice.history.unshift({ year: yearNow(), tick: round(state.tick), kind: String(kind).slice(0, 32), summary: String(summary).slice(0, 200) });
    if (justice.history.length > JUSTICE_HISTORY_LIMIT) justice.history.length = JUSTICE_HISTORY_LIMIT;
    addLog(summary, "#b99a8a", "justice");
}

function findResident(personId) {
    return state.entities.find(entity => !entity.dead && (String(entity.personId || entity.id) === String(personId) || String(entity.id) === String(personId))) || null;
}

function countCompleted(type) {
    return state.entities.filter(entity => isComplete(entity) && entity.type === type).length;
}

export function getJusticeBuildings() {
    return { courts: countCompleted(TYPE.COURT), prisons: countCompleted(TYPE.PRISON) };
}

export function judgeCapacity() {
    const { courts, prisons } = getJusticeBuildings();
    return Math.min(MAX_JUDGES, courts * 2 + prisons * 1);
}

function servesElsewhere(entity) {
    const id = String(entity.personId || entity.id);
    if (entity.isKing || entity.type !== TYPE.VILLAGER) return true;
    if (entity.isHealer || entity.healthRole === "healer") return true;
    if ((state.health?.healers || []).some(entry => String(entry.personId) === id)) return true;
    if (state.court?.offices && Object.values(state.court.offices).some(office => office && String(office.personId) === id)) return true;
    if (Array.isArray(state.faith?.clergy) && state.faith.clergy.some(entry => String(entry.personId) === id)) return true;
    return false;
}

function competenceFor(person) {
    const experience = clamp((person.ageYears - maturityFor(person)) * 1.8, 0, 100);
    return Math.round(clamp(
        trait(person, "discipline") * 0.34 +
        trait(person, "curiosity") * 0.24 +
        trait(person, "compassion") * 0.20 +
        trait(person, "ambition") * 0.12 +
        experience * 0.10,
        12, 98
    ));
}

function integrityFor(person) {
    return Math.round(clamp(
        (100 - trait(person, "greed")) * 0.44 +
        trait(person, "compassion") * 0.28 +
        trait(person, "discipline") * 0.18 +
        trait(person, "piety") * 0.10,
        5, 100
    ));
}

function pruneJudges(justice) {
    let changed = false;
    justice.judges = justice.judges.filter(entry => {
        const entity = findResident(entry.personId);
        if (!entity || entity.type !== TYPE.VILLAGER) {
            changed = true;
            record(justice, "vacancy", entry.name + " no longer holds a judicial office");
            return false;
        }
        entry.name = ensurePersonProfile(entity).name;
        return true;
    });
    if (changed) touch(justice);
    return justice.judges;
}

function atWar() {
    return Boolean(state.raidActive || (state.diplomacy?.realms || []).some(realm => realm.treaty === "war"));
}

function quarantineLevel() {
    const quarantine = state.health?.quarantine;
    if (!quarantine) return 0;
    return Number(quarantine.untilTick) > state.tick ? clamp(quarantine.level, 0, 3) : 0;
}

function crimeContextFor(justice) {
    const population = residents().length;
    const ledger = state.economy?.lastLedger;
    const workforce = state.economy || {};
    const unemployed = Math.max(0, Number(workforce.unemployed) || 0);
    const inequality = population ? clamp(unemployed / population, 0, 1) : 0;
    const hunger = ledger && Number(ledger.foodDemand) > 0 ? clamp(Number(ledger.foodShortage) / Number(ledger.foodDemand), 0, 1) : 0;
    const war = atWar() ? 1 : 0;
    const quarantine = clamp(quarantineLevel() / 3, 0, 1);
    const judges = pruneJudges(justice);
    const competence = judges.reduce((sum, entry) => sum + Number(entry.competence || 0), 0);
    const judgeCoverage = clamp(competence / Math.max(20, population * 11), 0, 1);
    const charters = justice.charters.length;
    const law = LAW_CODES[justice.lawCode] || LAW_CODES.customary;
    const base = (0.03 + inequality * 0.30 + hunger * 0.34 + war * 0.10 + quarantine * 0.08 + unemployed * 0.002) -
        judgeCoverage * 0.22 - charters * 0.02;
    const rate = clamp((base * law.crime) + Number(justice.crime.offset || 0), 0.01, 0.9);
    return {
        population, inequality, hunger, war, quarantine, unemployed,
        judgeCoverage: Math.round(judgeCoverage * 1000) / 1000,
        crimeRate: Math.round(rate * 1000) / 1000,
        crimeLevel: rate < 0.08 ? "low" : rate < 0.18 ? "watchful" : rate < 0.32 ? "high" : "lawless"
    };
}

// The cache follows the inputs, not the clock. `source` changes when a load
// replaces the justice object, quarantine is evaluated at the current tick so
// an expiring order invalidates immediately, and judges/population are read
// live so a death or vacancy takes effect in the same call.
let modifierCache = { source: null, signature: "", value: null };

export function getJusticeModifiers() {
    const justice = ensureJustice();
    pruneJudges(justice);
    const { courts, prisons } = getJusticeBuildings();
    const context = crimeContextFor(justice);
    const signature = [
        yearNow(), state.worldEpoch || 0, state.buildingCollisionVersion || 0,
        justice.revision, justice.lawCode, justice.judges.length, justice.charters.length,
        courts, prisons, justice.crime.offset, justice.corruption.level,
        context.population, context.inequality, context.hunger, context.war,
        context.quarantine, context.judgeCoverage, context.crimeRate
    ].join(":");
    if (modifierCache.source === justice && modifierCache.signature === signature && modifierCache.value) {
        return modifierCache.value;
    }

    const law = LAW_CODES[justice.lawCode] || LAW_CODES.customary;
    const charterTrade = justice.charters.reduce((sum, entry) => sum + (CHARTERS[entry.kind]?.trade || 0), 0);
    const charterTax = justice.charters.reduce((sum, entry) => sum + (CHARTERS[entry.kind]?.tax || 0), 0);
    const charterCrime = justice.charters.reduce((sum, entry) => sum + (CHARTERS[entry.kind]?.crime || 0), 0);
    const charterMorale = justice.charters.reduce((sum, entry) => sum + (CHARTERS[entry.kind]?.morale || 0), 0);
    const crimeRate = clamp(context.crimeRate + charterCrime, 0.01, 0.9);
    const corruption = clamp(justice.corruption.level, 0, 100) / 100;
    const value = {
        ...context,
        crimeRate: Math.round(crimeRate * 1000) / 1000,
        crimeLevel: crimeRate < 0.08 ? "low" : crimeRate < 0.18 ? "watchful" : crimeRate < 0.32 ? "high" : "lawless",
        lawCode: justice.lawCode,
        lawLabel: law.label,
        courts,
        prisons,
        judges: justice.judges.length,
        judgeCapacity: judgeCapacity(),
        charters: justice.charters.length,
        corruption: Math.round(justice.corruption.level),
        taxEfficiency: Math.max(0.7, law.tax * (1 + charterTax) * (1 - corruption * 0.08)),
        tradeFactor: Math.max(0.7, law.trade * (1 + charterTrade) * (1 - crimeRate * 0.15)),
        moraleYear: Math.round((law.morale + charterMorale - crimeRate * 4 - corruption * 0.5) * 100) / 100,
        legitimacyYear: Math.round((0.35 + context.judgeCoverage * 0.45 - crimeRate * 0.8) * 100) / 100,
        migrationFactor: Math.max(0.4, Math.min(1.25, law.migration * (1 - crimeRate * 0.35) + justice.charters.filter(entry => entry.kind === "town").length * 0.06)),
        desertionFactor: Math.max(0.5, Math.min(1.8, law.desertion * (0.85 + crimeRate * 0.5))),
        prisonCapacity: prisons * 8,
        pendingCases: justice.cases.length
    };
    modifierCache = { source: justice, signature, value };
    return value;
}

export function justiceCandidatePool() {
    const justice = ensureJustice();
    const occupied = new Set(justice.judges.map(entry => String(entry.personId)));
    return residents()
        .filter(entity => !occupied.has(String(entity.personId || entity.id)) && !servesElsewhere(entity))
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return {
                personId: String(person.id),
                name: person.name,
                ageYears: person.ageYears,
                species: person.species,
                adult: person.ageYears >= maturityFor(person),
                fit: competenceFor(person),
                integrity: integrityFor(person)
            };
        })
        .filter(candidate => candidate.adult)
        .sort((a, b) => b.fit - a.fit || a.name.localeCompare(b.name))
        .slice(0, 12);
}

export function getJusticeSnapshot() {
    const justice = ensureJustice();
    const modifiers = getJusticeModifiers();
    const { courts, prisons } = getJusticeBuildings();
    return {
        ...justice,
        judges: justice.judges.map(entry => ({ ...entry })),
        candidates: justiceCandidatePool(),
        modifiers,
        courts,
        prisons,
        capacity: judgeCapacity(),
        lawCodes: Object.entries(LAW_CODES).map(([id, code]) => ({ id, ...code })),
        charterTypes: Object.entries(CHARTERS).map(([id, charter]) => ({ id, ...charter, cost: { ...charter.cost } })),
        sentences: Object.entries(SENTENCES).map(([id, sentence]) => ({ id, ...sentence })),
        pendingCases: justice.cases.filter(entry => entry.status === "pending"),
        appointmentCost: JUDGE_APPOINTMENT_COST,
        salary: JUDGE_SALARY,
        lawChangeCost: LAW_CHANGE_COST,
        history: justice.history.slice(0, 16),
        lastAudit: justice.lastAudit ? { ...justice.lastAudit } : null
    };
}

export function appointJudge(personId) {
    const justice = ensureJustice();
    const entity = findResident(personId);
    if (!entity) return { ok: false, reason: "RESIDENT NOT FOUND" };
    if (servesElsewhere(entity)) return { ok: false, reason: "THIS RESIDENT ALREADY HOLDS AN OFFICE" };
    const person = ensurePersonProfile(entity);
    if (person.ageYears < maturityFor(person)) return { ok: false, reason: "THE RESIDENT IS TOO YOUNG TO SERVE" };
    if (justice.judges.some(entry => String(entry.personId) === String(person.id))) return { ok: false, reason: "THIS RESIDENT ALREADY SITS ON THE BENCH" };
    const capacity = judgeCapacity();
    if (capacity <= 0) return { ok: false, reason: "BUILD A COURT FIRST" };
    if (justice.judges.length >= capacity) return { ok: false, reason: "ALL JUDICIAL SEATS ARE FILLED" };
    if ((Number(state.resources?.gold) || 0) < JUDGE_APPOINTMENT_COST) return { ok: false, reason: "NOT ENOUGH GOLD" };
    addResource("gold", -JUDGE_APPOINTMENT_COST);
    const entry = {
        personId: String(person.id),
        name: person.name,
        competence: competenceFor(person),
        integrity: integrityFor(person),
        appointedYear: yearNow(),
        salary: JUDGE_SALARY,
        convictions: 0,
        investigatedYear: 0
    };
    justice.judges.push(entry);
    justice.totals.judges++;
    touch(justice);
    applyPoliticalEffects({ commons: 1.0, legitimacy: 0.2 });
    addPersonMemory(entity, {
        id: "justice:judge:" + state.year,
        type: "justice",
        text: "I was appointed a judge of the realm in year " + yearNow() + ".",
        tick: state.tick,
        importance: 80
    });
    record(justice, "appointment", person.name + " was appointed to the bench · competence " + entry.competence + " · integrity " + entry.integrity);
    return { ok: true, judge: { ...entry }, message: person.name + " appointed", name: person.name };
}

export function dismissJudge(personId) {
    const justice = ensureJustice();
    const entry = justice.judges.find(item => String(item.personId) === String(personId));
    if (!entry) return { ok: false, reason: "JUDGE NOT FOUND" };
    justice.judges = justice.judges.filter(item => String(item.personId) !== String(personId));
    touch(justice);
    applyPoliticalEffects({ commons: -0.6, legitimacy: -0.15 });
    record(justice, "dismissal", entry.name + " was removed from the bench");
    return { ok: true, name: entry.name, message: entry.name + " dismissed" };
}

export function setLawCode(code) {
    const definition = LAW_CODES[code];
    if (!definition) return { ok: false, reason: "UNKNOWN LEGAL CODE" };
    const justice = ensureJustice();
    if (justice.lawCode === code) return { ok: false, reason: "THIS LEGAL CODE IS ALREADY IN FORCE" };
    if (justice.lastLawChangeYear >= yearNow()) return { ok: false, reason: "THE CODE WAS ALREADY AMENDED THIS YEAR" };
    if (justice.judges.length === 0 || getJusticeBuildings().courts === 0) return { ok: false, reason: "A COURT AND A JUDGE ARE NEEDED TO AMEND THE CODE" };
    if ((Number(state.resources?.gold) || 0) < LAW_CHANGE_COST) return { ok: false, reason: "NOT ENOUGH GOLD" };
    addResource("gold", -LAW_CHANGE_COST);
    justice.lawCode = code;
    justice.lastLawChangeYear = yearNow();
    touch(justice);
    applyPoliticalEffects({ legitimacy: definition.legitimacy * 0.4 });
    record(justice, "law", "The realm adopted " + definition.label.toLowerCase() + " · trade " + Math.round((definition.trade - 1) * 100) + "% · tax " + Math.round((definition.tax - 1) * 100) + "%");
    return { ok: true, message: definition.label + " in force", law: definition };
}

export function grantCharter(kind) {
    const definition = CHARTERS[kind];
    if (!definition) return { ok: false, reason: "UNKNOWN CHARTER" };
    const justice = ensureJustice();
    if (justice.charters.length >= CHARTER_LIMIT) return { ok: false, reason: "ALL CHARTERS HAVE BEEN GRANTED" };
    if (justice.lastCharterYear >= yearNow()) return { ok: false, reason: "A CHARTER WAS ALREADY GRANTED THIS YEAR" };
    if (getJusticeBuildings().courts === 0) return { ok: false, reason: "BUILD A COURT FIRST" };
    for (const [resource, amount] of Object.entries(definition.cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(definition.cost)) addResource(resource, -amount);
    justice.charters.push({ kind, grantedYear: yearNow(), label: definition.label });
    justice.lastCharterYear = yearNow();
    touch(justice);
    applyPoliticalEffects({ guilds: kind === "guild" ? 2.2 : 0.8, commons: kind === "town" ? 1.4 : 0, legitimacy: 0.25 });
    record(justice, "charter", definition.label + " granted · trade +" + Math.round(definition.trade * 100) + "% · tax +" + Math.round(definition.tax * 100) + "%");
    return { ok: true, message: definition.label + " granted", cost: { ...definition.cost } };
}

function removeResident(entity, reason) {
    if (!entity || entity.dead) return null;
    const person = ensurePersonProfile(entity);
    addPersonMemory(entity, {
        id: "justice:removed:" + state.year + ":" + reason,
        type: "justice",
        text: "I was removed from the realm in year " + yearNow() + " (" + reason + ").",
        tick: state.tick,
        importance: 96
    });
    const memorial = createPersonMemorial(entity, { cause: reason, deathYear: state.year, deathTick: state.tick });
    if (memorial) {
        if (!Array.isArray(state.personArchive)) state.personArchive = [];
        if (!state.personArchive.some(entry => entry.personId === memorial.personId)) {
            state.personArchive.push(memorial);
            if (state.personArchive.length > MAX_PERSON_ARCHIVE) state.personArchive.splice(0, state.personArchive.length - MAX_PERSON_ARCHIVE);
        }
    }
    entity.dead = true;
    entity.justiceRemoved = String(reason).slice(0, 48);
    return { personId: memorial?.personId || String(person.id), name: person.name };
}

function bestJudge(justice) {
    return justice.judges.slice().sort((a, b) => (b.competence + b.integrity) - (a.competence + a.integrity))[0] || null;
}

export function tryCase(caseId, sentenceId) {
    const justice = ensureJustice();
    const sentence = SENTENCES[sentenceId];
    if (!sentence) return { ok: false, reason: "UNKNOWN SENTENCE" };
    const entry = justice.cases.find(item => String(item.id) === String(caseId) && item.status === "pending");
    if (!entry) return { ok: false, reason: "CASE NOT FOUND" };
    if (getJusticeBuildings().courts === 0) return { ok: false, reason: "BUILD A COURT FIRST" };
    const judge = bestJudge(justice);
    if (!judge) return { ok: false, reason: "APPOINT A JUDGE FIRST" };
    const defendant = findResident(entry.defendantId);
    const quality = clamp((judge.competence * 0.7 + judge.integrity * 0.3) / 100, 0, 1);
    const harsh = sentenceId === "galley" || sentenceId === "exile";
    const result = { case: { ...entry }, sentence: sentenceId, judge: judge.name, quality: Math.round(quality * 100) };

    if (sentenceId === "fine") {
        const gold = Math.max(2, Math.round((3 + entry.severity * 3) * (0.6 + quality * 0.8)));
        addResource("gold", gold);
        result.gold = gold;
        justice.crime.offset = clamp(Number(justice.crime.offset) - 0.02 - entry.severity * 0.005, -0.2, 0.2);
        applyPoliticalEffects({ legitimacy: 0.25, guilds: 0.2 });
        state.morale = clamp(state.morale + 0.2, 0, 100);
    } else if (sentenceId === "labor") {
        const wood = Math.max(2, entry.severity * 2 + Math.round(quality * 2));
        const stone = Math.max(1, entry.severity + Math.round(quality));
        addResource("wood", wood);
        addResource("stone", stone);
        result.wood = wood;
        result.stone = stone;
        justice.crime.offset = clamp(Number(justice.crime.offset) - 0.025 - entry.severity * 0.005, -0.2, 0.2);
        state.morale = clamp(state.morale - 0.8, 0, 100);
    } else if (sentenceId === "exile") {
        removeResident(defendant, "banished");
        result.removed = entry.defendantName;
        justice.crime.offset = clamp(Number(justice.crime.offset) - 0.045 - entry.severity * 0.005, -0.2, 0.2);
        state.morale = clamp(state.morale + 0.4, 0, 100);
        applyPoliticalEffects({ legitimacy: 0.2 });
    } else if (sentenceId === "galley") {
        const gold = Math.max(4, Math.round(entry.severity * 4 * (0.7 + quality * 0.6)));
        addResource("gold", gold);
        removeResident(defendant, "sent to the galleys");
        result.gold = gold;
        result.removed = entry.defendantName;
        justice.crime.offset = clamp(Number(justice.crime.offset) - 0.04 - entry.severity * 0.005, -0.2, 0.2);
        state.morale = clamp(state.morale - 1.2, 0, 100);
        applyPoliticalEffects({ nobility: 0.3, legitimacy: 0.15 });
    } else {
        justice.crime.offset = clamp(Number(justice.crime.offset) + 0.025 + entry.severity * 0.005, -0.2, 0.2);
        state.morale = clamp(state.morale + 0.6, 0, 100);
        applyPoliticalEffects({ legitimacy: 0.2, commons: 0.4 });
    }

    if (harsh && judge.integrity < 45) {
        const skim = Math.max(1, Math.round(entry.severity + (45 - judge.integrity) / 12));
        if ((Number(state.resources?.gold) || 0) >= skim) {
            addResource("gold", -skim);
            justice.corruption.lostGold += skim;
            result.skim = skim;
        }
    }
    justice.sentenceTotals[sentenceId] = (Number(justice.sentenceTotals[sentenceId]) || 0) + 1;
    justice.totals.closed++;
    justice.cases = justice.cases.filter(item => item.id !== entry.id);
    judge.convictions++;
    touch(justice);
    record(justice, "verdict", entry.defendantName + " · " + entry.crimeLabel + " · " + sentence.label + " · judge " + judge.name);
    return { ok: true, ...result, message: sentence.label + " imposed" };
}

export function investigateCorruption(personId) {
    const justice = ensureJustice();
    const judge = justice.judges.find(entry => String(entry.personId) === String(personId));
    if (!judge) return { ok: false, reason: "JUDGE NOT FOUND" };
    if (judge.investigatedYear >= yearNow()) return { ok: false, reason: "THIS JUDGE WAS ALREADY INVESTIGATED THIS YEAR" };
    if ((Number(state.resources?.gold) || 0) < 8) return { ok: false, reason: "NOT ENOUGH GOLD" };
    addResource("gold", -8);
    judge.investigatedYear = yearNow();
    justice.corruption.investigations++;
    if (judge.integrity < 52) {
        const recovered = 10 + Math.round((52 - judge.integrity) * 0.8);
        addResource("gold", recovered);
        justice.corruption.recovered += recovered;
        justice.judges = justice.judges.filter(entry => entry !== judge);
        justice.corruption.level = clamp(Number(justice.corruption.level) - 12, 0, 100);
        applyPoliticalEffects({ commons: 1.0, legitimacy: 0.4 });
        touch(justice);
        record(justice, "corruption", judge.name + " was removed for corruption · " + recovered + " gold recovered");
        return { ok: true, corrupt: true, recovered, message: judge.name + " removed for corruption" };
    }
    state.morale = clamp(state.morale - 1, 0, 100);
    applyPoliticalEffects({ commons: -0.4, legitimacy: -0.2 });
    touch(justice);
    record(justice, "investigation", judge.name + " was cleared of corruption · the crown lost the cost of the inquiry");
    return { ok: true, corrupt: false, message: judge.name + " cleared" };
}

function generateCases(justice, context) {
    const open = justice.cases.filter(entry => entry.status === "pending").length;
    const allowance = Math.min(MAX_PENDING_CASES - open, 3);
    if (allowance <= 0) return [];
    const expected = context.crimeRate * 8;
    let count = Math.min(allowance, Math.floor(expected));
    if (random("justice") < expected - Math.floor(expected)) count++;
    if (count <= 0) return [];
    const occupied = new Set(justice.judges.map(entry => String(entry.personId)));
    const clergy = new Set((state.faith?.clergy || []).map(entry => String(entry.personId)));
    const candidates = residents().filter(entity => {
        const id = String(entity.personId || entity.id);
        const person = ensurePersonProfile(entity);
        return person.ageYears >= maturityFor(person) && !occupied.has(id) && !clergy.has(id) && !entity.isKing;
    });
    if (!candidates.length) return [];
    const causes = [];
    if (context.hunger > 0.15) causes.push("riot", "poaching");
    if (context.war) causes.push("desertion");
    if (context.quarantine > 0) causes.push("breach");
    if (context.inequality > 0.18) causes.push("theft");
    if (context.unemployed > 0) causes.push("fraud");
    if (!causes.length) causes.push("theft", "poaching");
    const created = [];
    for (let index = 0; index < count; index++) {
        const defendant = candidates[Math.floor(random("justice") * candidates.length) % candidates.length];
        if (!defendant) continue;
        const crimeKey = causes[Math.floor(random("justice") * causes.length) % causes.length];
        const crime = CRIMES[crimeKey];
        const severity = clamp(crime.severity + (random("justice") < 0.35 ? 1 : 0) + (context.crimeRate > 0.3 ? 1 : 0), 1, 4);
        const entry = {
            id: "case:" + yearNow() + ":" + (justice.totals.cases + index + 1),
            defendantId: String(defendant.personId || defendant.id),
            defendantName: ensurePersonProfile(defendant).name,
            crime: crimeKey,
            crimeLabel: crime.label,
            cause: crime.cause,
            severity,
            createdYear: yearNow(),
            victim: crimeKey === "fraud" ? "the market" : crimeKey === "desertion" ? "the garrison" : "the crown",
            status: "pending"
        };
        justice.cases.push(entry);
        created.push(entry);
        justice.totals.cases++;
    }
    if (created.length) {
        record(justice, "crime", created.length + " new case" + (created.length === 1 ? "" : "s") + " entered the court roll · " + created.map(entry => entry.crimeLabel).join(", "));
    }
    return created;
}

export function updateJustice() {
    const justice = ensureJustice();
    const year = yearNow();
    if (justice.lastUpdateYear >= year) return getJusticeSnapshot();
    pruneJudges(justice);
    let salaries = 0;
    for (const judge of justice.judges) salaries += Number(judge.salary) || JUDGE_SALARY;
    const available = Math.max(0, Number(state.resources?.gold) || 0);
    const paid = Math.min(available, salaries);
    if (paid > 0) addResource("gold", -paid);
    const paidInFull = paid >= salaries;
    if (!paidInFull) {
        for (const judge of justice.judges) judge.integrity = clamp(judge.integrity - 2, 0, 100);
        state.morale = clamp(state.morale - 0.4, 0, 100);
    }
    const context = crimeContextFor(justice);
    justice.crime.rate = context.crimeRate;
    justice.crime.level = context.crimeLevel;
    justice.crime.causes = {
        inequality: Math.round(context.inequality * 1000) / 1000,
        hunger: Math.round(context.hunger * 1000) / 1000,
        war: context.war,
        quarantine: Math.round(context.quarantine * 1000) / 1000,
        unemployment: Math.round(context.unemployment * 1000) / 1000
    };
    justice.crime.offset = clamp(Number(justice.crime.offset) * 0.8, -0.2, 0.2);
    // Corrupt judges skim part of the year's fines and salaries. The risk is
    // derived from their real integrity, not a scripted event.
    let lost = 0;
    for (const judge of justice.judges) {
        const risk = Math.max(0, (55 - judge.integrity) / 55);
        if (risk <= 0) continue;
        const skim = Math.min(Math.max(0, available - paid - lost), Math.round((judge.salary + 4) * risk * 0.7));
        if (skim <= 0) continue;
        addResource("gold", -skim);
        lost += skim;
        judge.integrity = clamp(judge.integrity - 1, 0, 100);
    }
    justice.corruption.lostGold += lost;
    justice.corruption.level = clamp(
        justice.judges.length
            ? justice.judges.reduce((sum, judge) => sum + Math.max(0, (55 - judge.integrity) / 55), 0) / justice.judges.length * 100
            : 0,
        0, 100
    );
    generateCases(justice, context);
    const modifiers = getJusticeModifiers();
    state.morale = clamp(state.morale + modifiers.moraleYear, 0, 100);
    applyPoliticalEffects({ legitimacy: modifiers.legitimacyYear, commons: context.judgeCoverage * 0.5 });
    justice.lastAudit = {
        year,
        population: context.population,
        judges: justice.judges.length,
        judgeCapacity: judgeCapacity(),
        courts: getJusticeBuildings().courts,
        prisons: getJusticeBuildings().prisons,
        crimeRate: modifiers.crimeRate,
        crimeLevel: modifiers.crimeLevel,
        cases: justice.cases.length,
        closed: justice.totals.closed,
        salaries,
        paid,
        corruptionLost: lost,
        corruptionLevel: Math.round(justice.corruption.level),
        taxEfficiency: Math.round(modifiers.taxEfficiency * 1000) / 1000,
        tradeFactor: Math.round(modifiers.tradeFactor * 1000) / 1000,
        migrationFactor: Math.round(modifiers.migrationFactor * 1000) / 1000,
        desertionFactor: Math.round(modifiers.desertionFactor * 1000) / 1000,
        moraleChange: modifiers.moraleYear,
        legitimacyChange: modifiers.legitimacyYear,
        causes: { ...justice.crime.causes }
    };
    justice.lastUpdateYear = year;
    touch(justice);
    const parts = [];
    if (justice.judges.length) parts.push(justice.judges.length + " judges · " + paid + "/" + salaries + " gold salaries");
    if (lost) parts.push(lost + " gold lost to corruption");
    parts.push("crime " + Math.round(modifiers.crimeRate * 100) + "% (" + modifiers.crimeLevel + ")");
    if (justice.cases.length) parts.push(justice.cases.length + " cases pending");
    record(justice, "audit", "Justice audit year " + year + ": " + parts.join(" · "));
    return getJusticeSnapshot();
}

export function validateJusticeState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Save data contains an invalid justice state.");
    if (value.judges !== undefined && (!Array.isArray(value.judges) || value.judges.length > MAX_JUDGES)) {
        throw new Error("Save data contains an invalid judge list.");
    }
    if (value.cases !== undefined && (!Array.isArray(value.cases) || value.cases.length > MAX_PENDING_CASES)) {
        throw new Error("Save data contains an invalid case roll.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > JUSTICE_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid justice history.");
    }
    if (value.lawCode !== undefined && !LAW_CODES[value.lawCode]) {
        throw new Error("Save data contains an unknown legal code.");
    }
    if (value.charters !== undefined && (!Array.isArray(value.charters) || value.charters.length > CHARTER_LIMIT)) {
        throw new Error("Save data contains an invalid charter list.");
    }
    if (value.crime !== undefined && value.crime !== null) {
        if (typeof value.crime !== "object" || Array.isArray(value.crime)) throw new Error("Save data contains an invalid crime record.");
        if (value.crime.rate !== undefined && (!Number.isFinite(Number(value.crime.rate)) || Number(value.crime.rate) < 0 || Number(value.crime.rate) > 1)) {
            throw new Error("Save data contains an invalid crime rate.");
        }
    }
    if (value.corruption !== undefined && value.corruption !== null && (typeof value.corruption !== "object" || Array.isArray(value.corruption))) {
        throw new Error("Save data contains an invalid corruption record.");
    }
    return true;
}
