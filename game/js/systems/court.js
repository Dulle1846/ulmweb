// Royal court: named ministers, concrete office effects, annual salaries,
// corruption and faction petitions. All work is bounded and yearly.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { random } from "../core/random.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { applyPoliticalEffects, getPoliticalSnapshot, POLITICAL_FACTIONS } from "./politics.js";
import { addPersonMemory, ensurePersonProfile, PERSON_SPECIES } from "./people.js";

export const COURT_APPOINTMENT_COST = 6;
export const COURT_HISTORY_LIMIT = 40;

export const COURT_OFFICES = Object.freeze({
    chancellor: Object.freeze({
        label: "Chancellor",
        description: "Guides envoys, gifts and treaty talks.",
        primary: "sociability",
        secondary: "patience",
        salary: 12,
        faction: "nobility",
        effect: "Stronger diplomatic gains and better trade terms"
    }),
    steward: Object.freeze({
        label: "Steward",
        description: "Runs the estates, stores and household accounts.",
        primary: "discipline",
        secondary: "curiosity",
        salary: 10,
        faction: "commons",
        effect: "Higher tax efficiency and annual estate savings"
    }),
    marshal: Object.freeze({
        label: "Marshal",
        description: "Commands the guard and keeps the realm battle-ready.",
        primary: "courage",
        secondary: "discipline",
        salary: 12,
        faction: "nobility",
        effect: "Stronger defenders and lower raid damage"
    }),
    spymaster: Object.freeze({
        label: "Spymaster",
        description: "Watches the border, the court and the ledgers.",
        primary: "distrust",
        secondary: "curiosity",
        salary: 9,
        faction: "guilds",
        effect: "Fewer border incidents and less corruption"
    }),
    chaplain: Object.freeze({
        label: "Chaplain",
        description: "Tends to the sick, the poor and the public rites.",
        primary: "piety",
        secondary: "compassion",
        salary: 8,
        faction: "clergy",
        effect: "Lower disease transmission in crowded households"
    }),
    jurist: Object.freeze({
        label: "Jurist",
        description: "Advises on law, petitions and the legitimacy of the crown.",
        primary: "discipline",
        secondary: "compassion",
        salary: 10,
        faction: "commons",
        effect: "More legitimacy and calmer faction politics"
    })
});

export const COURT_DEMANDS = Object.freeze({
    commons: Object.freeze({
        title: "Bread for the common table",
        description: "The commoners ask the crown to open the granary before the next winter.",
        cost: Object.freeze({ gold: 12, food: 16 }),
        effects: Object.freeze({ commons: 4, legitimacy: 0.6 }),
        morale: 1
    }),
    nobility: Object.freeze({
        title: "Confirm the ancient privileges",
        description: "The noble houses want their old rights confirmed with seal and pension.",
        cost: Object.freeze({ gold: 14 }),
        effects: Object.freeze({ nobility: 4, commons: -1, legitimacy: 0.3 }),
        morale: 0
    }),
    guilds: Object.freeze({
        title: "Charter a new market court",
        description: "The guilds ask for a chartered court and timber for a new market hall.",
        cost: Object.freeze({ gold: 18, wood: 8 }),
        effects: Object.freeze({ guilds: 4, nobility: -1, legitimacy: 0.4 }),
        morale: 0
    }),
    clergy: Object.freeze({
        title: "Endow the temple kitchens",
        description: "The clergy request grain and gold to keep the temple kitchens open.",
        cost: Object.freeze({ gold: 10, food: 12 }),
        effects: Object.freeze({ clergy: 4, commons: 1, legitimacy: 0.5 }),
        morale: 1
    })
});

const OFFICE_IDS = Object.freeze(Object.keys(COURT_OFFICES));
const FACTION_LABELS = Object.freeze({ commons: "Commons", nobility: "Nobility", guilds: "Guilds", clergy: "Clergy" });
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const currentYear = () => Math.max(1, Math.floor(Number(state.year) || 1));
const currentTick = () => Math.max(0, Math.floor(Number(state.tick) || 0));
const trait = (person, key) => clamp(person?.traits?.[key] ?? 50, 0, 100);
const need = (person, key) => clamp(person?.needs?.[key] ?? 50, 0, 100);
const maturityFor = person => PERSON_SPECIES[person?.species]?.maturation ?? 16;

function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const summary = String(entry.summary || "").trim().slice(0, 180);
    if (!summary) return null;
    return {
        year: integer(entry.year, 0),
        tick: integer(entry.tick, 0),
        kind: String(entry.kind || "court").slice(0, 32),
        summary
    };
}

function normalizeOffice(saved, officeId) {
    const definition = COURT_OFFICES[officeId];
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const personId = String(saved.personId || "").slice(0, 100);
    if (!personId) return null;
    return {
        personId,
        name: String(saved.name || "Unknown minister").slice(0, 90),
        appointedYear: integer(saved.appointedYear, 1),
        competence: clamp(saved.competence ?? 50, 1, 100),
        loyalty: clamp(saved.loyalty ?? 50, 0, 100),
        integrity: clamp(saved.integrity ?? 50, 0, 100),
        salary: integer(saved.salary ?? definition.salary, 0, 100),
        faction: POLITICAL_FACTIONS.includes(saved.faction) ? saved.faction : definition.faction
    };
}

function normalizeAudit(saved) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    return {
        year: integer(saved.year, 0),
        salaries: integer(saved.salaries, 0),
        paid: integer(saved.paid, 0),
        corruption: integer(saved.corruption, 0),
        vacancies: integer(saved.vacancies, 0),
        unpaid: integer(saved.unpaid, 0),
        estateSavings: integer(saved.estateSavings, 0)
    };
}

export function createCourtState() {
    return {
        version: 1,
        lastUpdateYear: 0,
        offices: Object.fromEntries(OFFICE_IDS.map(id => [id, null])),
        demand: null,
        history: [],
        lastAudit: null
    };
}

export function normalizeCourtState(input = state.court) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const rawOffices = source.offices && typeof source.offices === "object" && !Array.isArray(source.offices) ? source.offices : {};
    const rawDemand = source.demand && typeof source.demand === "object" && !Array.isArray(source.demand) ? source.demand : null;
    const demandFaction = rawDemand && POLITICAL_FACTIONS.includes(rawDemand.faction) ? rawDemand.faction : null;
    const normalized = {
        version: 1,
        lastUpdateYear: integer(source.lastUpdateYear, 0),
        offices: Object.fromEntries(OFFICE_IDS.map(id => [id, normalizeOffice(rawOffices[id], id)])),
        demand: demandFaction ? {
            faction: demandFaction,
            createdYear: Math.max(1, integer(rawDemand.createdYear, 1)),
            expiresYear: Math.max(1, integer(rawDemand.expiresYear, 1))
        } : null,
        history: (Array.isArray(source.history) ? source.history : []).map(normalizeHistoryEntry).filter(Boolean).slice(0, COURT_HISTORY_LIMIT),
        lastAudit: normalizeAudit(source.lastAudit)
    };
    if (state.court === input) state.court = normalized;
    return normalized;
}

export function ensureCourt() {
    const current = state.court;
    if (!current || typeof current !== "object" || Array.isArray(current) || current.version !== 1 ||
        !current.offices || typeof current.offices !== "object" || Array.isArray(current.offices)) {
        state.court = normalizeCourtState(current);
    }
    return state.court;
}

function record(court, kind, summary) {
    const entry = {
        year: currentYear(),
        tick: currentTick(),
        kind: String(kind || "court").slice(0, 32),
        summary: String(summary || "").slice(0, 180)
    };
    court.history.unshift(entry);
    if (court.history.length > COURT_HISTORY_LIMIT) court.history.length = COURT_HISTORY_LIMIT;
    addLog(summary, "#d8c18a", "court");
    return entry;
}

function findPerson(personId) {
    return state.entities.find(entity => !entity.dead && String(entity.personId || entity.id) === String(personId)) || null;
}

function dominantFaction(person) {
    const scores = {
        commons: trait(person, "compassion") * 0.55 + trait(person, "sociability") * 0.30 + (100 - trait(person, "greed")) * 0.15,
        nobility: trait(person, "ambition") * 0.45 + trait(person, "courage") * 0.35 + (100 - trait(person, "compassion")) * 0.20,
        guilds: trait(person, "greed") * 0.45 + trait(person, "discipline") * 0.30 + trait(person, "curiosity") * 0.25,
        clergy: trait(person, "piety") * 0.60 + trait(person, "compassion") * 0.25 + trait(person, "patience") * 0.15
    };
    return POLITICAL_FACTIONS.reduce((best, faction) => scores[faction] > scores[best] ? faction : best, "commons");
}

function officeFit(definition, person) {
    const experience = clamp((person.ageYears - maturityFor(person)) * 2.5, 0, 100);
    return clamp(
        trait(person, definition.primary) * 0.50 +
        trait(person, definition.secondary) * 0.25 +
        need(person, "purpose") * 0.15 +
        experience * 0.10,
        10,
        100
    );
}

function officeLoyalty(person) {
    const king = state.entities.find(entity => !entity.dead && entity.isKing) || null;
    const relation = king && Array.isArray(person.relationships)
        ? person.relationships.find(item => item.targetId === String(king.personId || king.id))
        : null;
    const trust = clamp(relation?.trust ?? 50, 0, 100);
    return clamp(
        trust * 0.35 +
        (100 - trait(person, "ambition")) * 0.20 +
        need(person, "belonging") * 0.25 +
        (100 - trait(person, "greed")) * 0.10 +
        trait(person, "discipline") * 0.10,
        5,
        100
    );
}

function officeIntegrity(person) {
    return clamp(
        (100 - trait(person, "greed")) * 0.45 +
        trait(person, "compassion") * 0.30 +
        trait(person, "discipline") * 0.15 +
        trait(person, "piety") * 0.10,
        5,
        100
    );
}

function reconcileOffice(officeId) {
    const court = ensureCourt();
    const office = court.offices[officeId] || null;
    if (!office) return null;
    const entity = findPerson(office.personId);
    if (!entity || entity.type !== TYPE.VILLAGER) {
        court.offices[officeId] = null;
        record(court, "vacancy", COURT_OFFICES[officeId].label + " office fell vacant");
        return null;
    }
    const person = ensurePersonProfile(entity);
    office.name = person.name;
    return office;
}

function officeQuality(office) {
    if (!office) return 0;
    return clamp((office.competence * 0.65 + office.loyalty * 0.20 + office.integrity * 0.15) / 100, 0, 1);
}

export function getCourtModifiers() {
    const court = ensureCourt();
    const qualities = {};
    for (const officeId of OFFICE_IDS) {
        qualities[officeId] = officeQuality(reconcileOffice(officeId));
    }
    const filled = OFFICE_IDS.filter(id => Boolean(court.offices[id]));
    const average = key => filled.length
        ? filled.reduce((sum, id) => sum + Number(court.offices[id][key] || 0), 0) / filled.length
        : 0;
    return {
        qualities,
        officesFilled: filled.length,
        vacancies: OFFICE_IDS.length - filled.length,
        avgLoyalty: Math.round(average("loyalty")),
        avgIntegrity: Math.round(average("integrity")),
        taxEfficiency: 1 + qualities.steward * 0.08,
        diplomacyGain: 1 + qualities.chancellor * 0.60,
        tradeBonus: qualities.chancellor * 0.05,
        incidentReduction: qualities.spymaster * 0.45,
        militaryReadiness: 1 + qualities.marshal * 0.18,
        healthContainment: qualities.chaplain * 0.18,
        legitimacyGain: qualities.jurist * 0.12,
        corruptionResistance: Math.min(0.80, qualities.spymaster * 0.50 + qualities.jurist * 0.20)
    };
}

function buildDemand(saved) {
    if (!saved || !POLITICAL_FACTIONS.includes(saved.faction)) return null;
    const definition = COURT_DEMANDS[saved.faction];
    return {
        faction: saved.faction,
        factionLabel: FACTION_LABELS[saved.faction],
        title: definition.title,
        description: definition.description,
        cost: { ...definition.cost },
        effects: { ...definition.effects },
        morale: definition.morale,
        createdYear: saved.createdYear,
        expiresYear: saved.expiresYear
    };
}

function candidatePool(court) {
    const occupied = new Set(Object.values(court.offices).filter(Boolean).map(office => String(office.personId)));
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && !entity.isKing && entity.personId && !occupied.has(String(entity.personId)))
        .map(entity => {
            const person = ensurePersonProfile(entity);
            const adult = person.ageYears >= maturityFor(person);
            return {
                personId: String(person.id),
                name: person.name,
                ageYears: person.ageYears,
                species: person.species,
                adult,
                faction: dominantFaction(person),
                fits: Object.fromEntries(OFFICE_IDS.map(id => [id, Math.round(officeFit(COURT_OFFICES[id], person))]))
            };
        })
        .filter(candidate => candidate.adult)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 12);
}

export function getCourtSnapshot() {
    const court = ensureCourt();
    const modifiers = getCourtModifiers();
    const offices = OFFICE_IDS.map(id => {
        const definition = COURT_OFFICES[id];
        const office = court.offices[id] || null;
        return {
            id,
            ...definition,
            holder: office ? { ...office, factionLabel: FACTION_LABELS[office.faction] } : null
        };
    });
    const demand = buildDemand(court.demand);
    const salaryTotal = offices.reduce((sum, office) => sum + (office.holder?.salary || 0), 0);
    return {
        ...court,
        offices,
        demand,
        candidates: candidatePool(court),
        modifiers,
        salaryTotal,
        history: court.history.slice(0, 16),
        lastAudit: court.lastAudit ? { ...court.lastAudit } : null,
        appointmentCost: COURT_APPOINTMENT_COST
    };
}

export function appointMinister(officeId, personId) {
    const definition = COURT_OFFICES[officeId];
    if (!definition) return { ok: false, reason: "unknown-office" };
    const entity = findPerson(personId);
    if (!entity) return { ok: false, reason: "eligible-resident-not-found" };
    if (entity.isKing) return { ok: false, reason: "the-sovereign-cannot-hold-an-office" };
    if (entity.type !== TYPE.VILLAGER) return { ok: false, reason: "eligible-resident-not-found" };
    const person = ensurePersonProfile(entity);
    if (person.ageYears < maturityFor(person)) return { ok: false, reason: "minister-not-adult" };
    const court = ensureCourt();
    if (court.offices[officeId]) return { ok: false, reason: "office-is-already-filled" };
    if (Object.values(court.offices).some(office => office && String(office.personId) === String(person.id))) {
        return { ok: false, reason: "resident-already-holds-an-office" };
    }
    if ((Number(state.resources?.gold) || 0) < COURT_APPOINTMENT_COST) return { ok: false, reason: "not-enough-gold" };
    addResource("gold", -COURT_APPOINTMENT_COST);
    const office = {
        personId: String(person.id),
        name: person.name,
        appointedYear: currentYear(),
        competence: Math.round(officeFit(definition, person)),
        loyalty: Math.round(officeLoyalty(person)),
        integrity: Math.round(officeIntegrity(person)),
        salary: definition.salary,
        faction: dominantFaction(person)
    };
    court.offices[officeId] = office;
    applyPoliticalEffects({ [office.faction]: 1.5, legitimacy: 0.2 });
    addPersonMemory(entity, {
        id: "court-appointment:" + officeId + ":" + currentYear(),
        type: "court",
        text: "I was appointed " + definition.label + " of the realm in year " + currentYear() + ".",
        tick: state.tick,
        importance: 80
    });
    record(court, "appointment", definition.label + " appointed: " + person.name);
    return { ok: true, office: { ...office }, snapshot: getCourtSnapshot() };
}

export function dismissMinister(officeId, reason = "dismissed") {
    const definition = COURT_OFFICES[officeId];
    if (!definition) return { ok: false, reason: "unknown-office" };
    const court = ensureCourt();
    const office = court.offices[officeId];
    if (!office) return { ok: false, reason: "office-is-vacant" };
    const entity = findPerson(office.personId);
    court.offices[officeId] = null;
    applyPoliticalEffects({ [office.faction]: -1.2, legitimacy: -0.2 });
    if (entity) {
        addPersonMemory(entity, {
            id: "court-dismissal:" + officeId + ":" + currentYear(),
            type: "court",
            text: "I was dismissed as " + definition.label + " of the realm in year " + currentYear() + ".",
            tick: state.tick,
            importance: 68
        });
    }
    record(court, "dismissal", definition.label + " dismissed: " + office.name);
    return { ok: true, reason, snapshot: getCourtSnapshot() };
}

function demandAffordable(demand) {
    return Object.entries(demand.cost).every(([resource, amount]) => (Number(state.resources?.[resource]) || 0) >= amount);
}

export function addressFactionDemand(factionId) {
    const court = ensureCourt();
    const demand = buildDemand(court.demand);
    if (!demand || demand.faction !== factionId) return { ok: false, reason: "no-such-petition" };
    if (!demandAffordable(demand)) return { ok: false, reason: "petition-cost-unaffordable" };
    for (const [resource, amount] of Object.entries(demand.cost)) addResource(resource, -amount);
    applyPoliticalEffects(demand.effects);
    state.morale = clamp((Number(state.morale) || 0) + demand.morale, 0, 100);
    const king = state.entities.find(entity => !entity.dead && entity.isKing) || null;
    if (king) {
        addPersonMemory(king, {
            id: "court-petition:" + demand.faction + ":" + currentYear(),
            type: "court",
            text: "I granted the " + demand.factionLabel + " petition “" + demand.title + "” in year " + currentYear() + ".",
            tick: state.tick,
            importance: 74
        });
    }
    record(court, "petition-granted", demand.factionLabel + " petition granted: " + demand.title);
    court.demand = null;
    return { ok: true, demand, snapshot: getCourtSnapshot() };
}

function expireDemand(court, year) {
    if (!court.demand || court.demand.expiresYear > year) return;
    const demand = buildDemand(court.demand);
    if (!demand) {
        court.demand = null;
        return;
    }
    applyPoliticalEffects({ [demand.faction]: -3, legitimacy: -0.5 });
    state.morale = clamp((Number(state.morale) || 0) - 0.8, 0, 100);
    record(court, "petition-ignored", demand.factionLabel + " petition ignored: " + demand.title);
    court.demand = null;
}

function createDemand(court, year) {
    const politics = getPoliticalSnapshot();
    const faction = POLITICAL_FACTIONS.reduce((lowest, candidate) => politics.factions[candidate] < politics.factions[lowest] ? candidate : lowest, POLITICAL_FACTIONS[0]);
    const definition = COURT_DEMANDS[faction];
    court.demand = { faction, createdYear: year, expiresYear: year + 1 };
    record(court, "petition", FACTION_LABELS[faction] + " petition: " + definition.title);
}

export function updateCourt() {
    const court = ensureCourt();
    const year = currentYear();
    if (court.lastUpdateYear >= year) return getCourtSnapshot();

    const active = [];
    let salaries = 0;
    let vacancies = 0;
    for (const officeId of OFFICE_IDS) {
        const office = reconcileOffice(officeId);
        if (!office) {
            vacancies++;
            continue;
        }
        active.push(office);
        salaries += office.salary;
    }

    const goldBefore = Math.max(0, Number(state.resources?.gold) || 0);
    const paid = Math.min(goldBefore, salaries);
    if (paid > 0) addResource("gold", -paid);
    const paidInFull = paid >= salaries;
    const modifiers = getCourtModifiers();
    let corruption = 0;
    let resignations = 0;
    const dismissed = new Set();
    for (const office of active) {
        const officeId = OFFICE_IDS.find(id => court.offices[id] === office);
        if (!officeId) continue;
        office.loyalty = clamp(office.loyalty + (paidInFull ? 1.5 : -6), 0, 100);
        const risk = Math.max(0, (45 - office.integrity) / 45) * (1 - modifiers.corruptionResistance);
        const available = Math.max(0, goldBefore - paid - corruption);
        const skim = Math.min(available, Math.round(office.salary * risk * 0.8));
        if (skim > 0) {
            addResource("gold", -skim);
            corruption += skim;
            office.integrity = clamp(office.integrity - 1, 0, 100);
        }
        if (office.loyalty < 25 && random("court") < 0.25) {
            court.offices[officeId] = null;
            dismissed.add(officeId);
            resignations++;
            record(court, "resignation", COURT_OFFICES[officeId].label + " resigned: " + office.name);
        }
    }

    let estateSavings = 0;
    if (court.offices.steward && paidInFull) {
        estateSavings = Math.round(4 + modifiers.qualities.steward * 6);
        addResource("gold", estateSavings);
    }
    if (modifiers.legitimacyGain > 0) applyPoliticalEffects({ legitimacy: modifiers.legitimacyGain * 2 });
    if (modifiers.healthContainment > 0) state.morale = clamp((Number(state.morale) || 0) + modifiers.healthContainment * 2, 0, 100);

    expireDemand(court, year);
    if (!court.demand) createDemand(court, year);

    court.lastUpdateYear = year;
    court.lastAudit = {
        year,
        salaries,
        paid,
        corruption,
        vacancies,
        unpaid: Math.max(0, salaries - paid),
        estateSavings
    };
    const parts = [];
    if (salaries > 0) parts.push(paid + "/" + salaries + " gold salaries");
    if (corruption > 0) parts.push(corruption + " gold lost to corruption");
    if (resignations > 0) parts.push(resignations + " resignation" + (resignations === 1 ? "" : "s"));
    if (estateSavings > 0) parts.push(estateSavings + " gold estate savings");
    record(court, "audit", "Court audit year " + year + (parts.length ? ": " + parts.join(", ") : ": no offices filled"));
    return getCourtSnapshot();
}
