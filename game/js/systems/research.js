// Research & knowledge: named scholars, an annual research budget and a real
// technology tree. Completed technologies change taxation, trade, food demand,
// mortality, construction cost, military power and the pace of later research.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { addResource } from "./resources.js";
import { addLog } from "../core/event-log.js";
import { applyPoliticalEffects, normalizePoliticalState } from "./politics.js";
import { ensurePersonProfile, PERSON_SPECIES } from "./people.js";
import { getGovernmentModifiers } from "./government.js";
import { getCultureModifiers } from "./identity.js";
import { getLegacyModifiers, recordDiscovery } from "./legacy.js";
import { getEndeavourModifiers } from "./endeavours.js";

export const RESEARCH_VERSION = 1;
export const RESEARCH_HISTORY_LIMIT = 24;
export const MAX_SCHOLARS = 6;
export const SCHOLAR_APPOINTMENT_COST = 12;
export const SCHOLAR_SALARY = 5;
export const FUNDING_LEVELS = Object.freeze([
    Object.freeze({ level: 0, label: "None", gold: 0, multiplier: 0.55 }),
    Object.freeze({ level: 1, label: "Modest", gold: 8, multiplier: 1.0 }),
    Object.freeze({ level: 2, label: "Generous", gold: 18, multiplier: 1.5 }),
    Object.freeze({ level: 3, label: "Splendid", gold: 30, multiplier: 2.0 })
]);

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = value => Math.max(0, Math.round(Number(value) || 0));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const trait = (person, key) => clamp(person?.traits?.[key] ?? 50, 0, 100);
const maturityFor = person => PERSON_SPECIES[person?.species]?.maturation ?? 16;
const isComplete = entity => Boolean(entity && !entity.dead && !(entity.construction && Number(entity.construction.stage) < 3));

export const TECHNOLOGIES = Object.freeze([
    { id: "crop-rotation", branch: "agriculture", label: "Crop rotation", cost: 18, requires: [], effects: { foodDemand: -0.05 }, description: "Alternating legumes and grain restores the field and lowers household demand." },
    { id: "irrigation", branch: "agriculture", label: "Irrigation", cost: 32, requires: ["crop-rotation"], effects: { foodDemand: -0.06, tax: 0.01 }, description: "Water reaches the dry fields; farms support a larger population." },
    { id: "livestock", branch: "agriculture", label: "Livestock husbandry", cost: 46, requires: ["irrigation"], effects: { foodDemand: -0.04, mortality: 0.02 }, description: "Milk, wool and manure make the household year less fragile." },
    { id: "granaries", branch: "agriculture", label: "Granary survey", cost: 64, requires: ["livestock"], effects: { foodDemand: -0.05, tax: 0.02 }, description: "Measured stores and seed reserves turn a good year into a reserve." },
    { id: "masonry", branch: "craft", label: "Masonry", cost: 20, requires: [], effects: { buildCost: 0.04 }, description: "Standard courses and better mortar reduce the material wasted on every site." },
    { id: "metallurgy", branch: "craft", label: "Metallurgy", cost: 34, requires: ["masonry"], effects: { military: 0.08 }, description: "Better blooms, rivets and edge geometry reach the garrison." },
    { id: "guild-halls", branch: "craft", label: "Guild halls", cost: 48, requires: ["metallurgy"], effects: { trade: 0.06, tax: 0.02 }, description: "Chartered workshops coordinate standards, credit and export." },
    { id: "mechanical-arts", branch: "craft", label: "Mechanical arts", cost: 66, requires: ["guild-halls"], effects: { buildCost: 0.04, trade: 0.04, research: 0.05 }, description: "Gears, pulleys and measured patterns cross from the workshop into the archive." },
    { id: "herb-lore", branch: "medicine", label: "Herb lore", cost: 18, requires: [], effects: { mortality: 0.03 }, description: "A written materia medica turns a healer's memory into a shared practice." },
    { id: "anatomy", branch: "medicine", label: "Anatomy", cost: 32, requires: ["herb-lore"], effects: { mortality: 0.04 }, description: "Careful dissection and observation make treatment less speculative." },
    { id: "sanitation", branch: "medicine", label: "Sanitary survey", cost: 48, requires: ["anatomy"], effects: { mortality: 0.04, legitimacy: 0.02 }, description: "Drains, clean water and burial rules reach the whole settlement." },
    { id: "epidemiology", branch: "medicine", label: "Epidemiology", cost: 68, requires: ["sanitation"], effects: { mortality: 0.06, research: 0.04 }, description: "A case map and an isolation rule break the chain before the ward empties." },
    { id: "written-law", branch: "statecraft", label: "Written law", cost: 20, requires: [], effects: { legitimacy: 0.03, tax: 0.02 }, description: "A published code makes the crown's judgment predictable." },
    { id: "census", branch: "statecraft", label: "Census", cost: 34, requires: ["written-law"], effects: { tax: 0.04 }, description: "Names, households and fields are counted, not guessed." },
    { id: "diplomacy", branch: "statecraft", label: "Diplomatic correspondence", cost: 50, requires: ["census"], effects: { trade: 0.04, legitimacy: 0.02 }, description: "A permanent chancery remembers every promise across a reign." },
    { id: "administration", branch: "statecraft", label: "Administration", cost: 70, requires: ["diplomacy"], effects: { research: 0.15, tax: 0.02, legitimacy: 0.02 }, description: "Departments, archives and procedure let the realm learn faster than one ruler can." },
    { id: "deep-plough", branch: "agriculture", label: "Deep plough", cost: 120, requires: ["granaries"], effects: { foodDemand: -0.04, tax: 0.02 }, description: "Heavier shares and drained furrows open the deeper soils to grain." },
    { id: "seed-banks", branch: "agriculture", label: "Seed banks", cost: 180, requires: ["deep-plough"], effects: { foodDemand: -0.05, mortality: 0.02 }, description: "Every district stores tested seed against a failed harvest, not only a bad week." },
    { id: "blast-furnace", branch: "craft", label: "Blast furnace", cost: 140, requires: ["mechanical-arts"], effects: { military: 0.08, buildCost: 0.03 }, description: "A hotter charge makes stronger iron for tools, hinges and armour." },
    { id: "printing-press", branch: "craft", label: "Printing press", cost: 200, requires: ["blast-furnace"], effects: { research: 0.08, trade: 0.04 }, description: "Movable type multiplies every written discovery and price list." },
    { id: "hospitals", branch: "medicine", label: "Hospitals", cost: 150, requires: ["epidemiology"], effects: { mortality: 0.05, legitimacy: 0.02 }, description: "Wards, trained nurses and a common casebook keep the sick out of the household." },
    { id: "vaccination", branch: "medicine", label: "Vaccination", cost: 220, requires: ["hospitals"], effects: { mortality: 0.08, foodDemand: -0.02 }, description: "A deliberate, recorded exposure turns a lethal season into a mild one." },
    { id: "standing-bureaucracy", branch: "statecraft", label: "Standing bureaucracy", cost: 160, requires: ["administration"], effects: { tax: 0.03, research: 0.05 }, description: "Salaried clerks outlive the minister who appointed them." },
    { id: "great-charter", branch: "statecraft", label: "Great charter", cost: 240, requires: ["standing-bureaucracy"], effects: { legitimacy: 0.04, trade: 0.04, tax: 0.02 }, description: "A sealed charter binds the crown's successor, the guilds and the towns in one law." }
]);

export const RESEARCH_BRANCHES = Object.freeze([
    { id: "agriculture", label: "Agriculture", description: "Fields, water, animals and stored grain." },
    { id: "craft", label: "Craft", description: "Materials, workshops, standards and machines." },
    { id: "medicine", label: "Medicine", description: "Herbs, anatomy, sanitation and public health." },
    { id: "statecraft", label: "Statecraft", description: "Law, census, diplomacy and administration." }
]);

const TECH_BY_ID = new Map(TECHNOLOGIES.map(tech => [tech.id, tech]));

export function createResearchState(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const completed = {};
    if (source.completed && typeof source.completed === "object" && !Array.isArray(source.completed)) {
        for (const id of Object.keys(source.completed)) if (TECH_BY_ID.has(id) && source.completed[id]) completed[id] = true;
    }
    const activeTech = TECH_BY_ID.has(source.activeTech) && !completed[source.activeTech] ? source.activeTech : null;
    const scholars = Array.isArray(source.scholars) ? source.scholars.map(normalizeScholar).filter(Boolean).slice(0, MAX_SCHOLARS) : [];
    const seen = new Set();
    const deduped = scholars.filter(entry => {
        if (seen.has(entry.personId)) return false;
        seen.add(entry.personId);
        return true;
    });
    return {
        version: RESEARCH_VERSION,
        reserve: clamp(source.reserve, 0, 240),
        progress: activeTech ? clamp(source.progress, 0, 500) : 0,
        activeTech,
        completed,
        scholars: deduped,
        funding: clamp(Math.floor(Number(source.funding) || 0), 0, FUNDING_LEVELS.length - 1),
        lastAudit: source.lastAudit && typeof source.lastAudit === "object" ? { ...source.lastAudit } : null,
        history: Array.isArray(source.history) ? source.history.filter(entry => entry && typeof entry === "object").slice(0, RESEARCH_HISTORY_LIMIT) : [],
        revision: Math.max(0, Math.floor(Number(source.revision) || 0))
    };
}

function normalizeScholar(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const personId = String(entry.personId || "").trim().slice(0, 80);
    if (!personId) return null;
    return {
        personId,
        name: String(entry.name || "Unnamed scholar").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 64),
        fit: clamp(entry.fit, 0, 100),
        appointedYear: Math.max(1, Math.floor(Number(entry.appointedYear) || 1)),
        salary: SCHOLAR_SALARY
    };
}

export function normalizeResearchState(input = state.research) {
    state.research = createResearchState(input && typeof input === "object" ? input : {});
    return state.research;
}

export function validateResearchState(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Research state must be an object.");
    if (input.activeTech != null && !TECH_BY_ID.has(input.activeTech)) throw new Error("Active research project is invalid.");
    if (!input.completed || typeof input.completed !== "object" || Array.isArray(input.completed)) throw new Error("Completed research is invalid.");
    if (!Array.isArray(input.scholars) || input.scholars.length > MAX_SCHOLARS) throw new Error("Scholar list is invalid.");
    for (const entry of input.scholars) {
        if (!entry || typeof entry !== "object" || typeof entry.personId !== "string" || !entry.personId) throw new Error("Scholar record is invalid.");
    }
    if (!Number.isFinite(Number(input.reserve)) || Number(input.reserve) < 0) throw new Error("Research reserve is invalid.");
    return true;
}

function ensureResearch() {
    const research = state.research;
    if (research?.version === RESEARCH_VERSION && research.completed && Array.isArray(research.scholars)) return research;
    return normalizeResearchState(research);
}

function countCompleted(type) {
    return state.entities.filter(entity => isComplete(entity) && entity.type === type).length;
}

export function getResearchBuildings() {
    return {
        temples: countCompleted(TYPE.TEMPLE),
        courts: countCompleted(TYPE.COURT),
        markets: countCompleted(TYPE.MARKET),
        clinics: countCompleted(TYPE.CLINIC)
    };
}

export function scholarCapacity() {
    const { temples, courts } = getResearchBuildings();
    return Math.min(MAX_SCHOLARS, 1 + temples + courts);
}

function findResident(personId) {
    return state.entities.find(entity => !entity.dead && (String(entity.personId || entity.id) === String(personId) || String(entity.id) === String(personId))) || null;
}

function servesElsewhere(entity) {
    if (!entity || entity.dead || entity.type !== TYPE.VILLAGER || entity.isKing) return true;
    const id = String(entity.personId || entity.id);
    if (entity.isHealer || entity.healthRole === "healer") return true;
    if ((state.health?.healers || []).some(entry => String(entry.personId) === id)) return true;
    if (state.court?.offices && Object.values(state.court.offices).some(office => office && String(office.personId) === id)) return true;
    if (Array.isArray(state.faith?.clergy) && state.faith.clergy.some(entry => String(entry.personId) === id)) return true;
    if (Array.isArray(state.justice?.judges) && state.justice.judges.some(entry => String(entry.personId) === id)) return true;
    if (Array.isArray(state.research?.scholars) && state.research.scholars.some(entry => String(entry.personId) === id)) return true;
    if (entity.military && typeof entity.military === "object") return true;
    return false;
}

function fitFor(person) {
    const experience = clamp((Number(person?.ageYears) - maturityFor(person)) * 1.6, 0, 100);
    return Math.round(clamp(
        trait(person, "curiosity") * 0.34 +
        trait(person, "discipline") * 0.24 +
        trait(person, "ambition") * 0.14 +
        trait(person, "piety") * 0.10 +
        experience * 0.18,
        10, 98
    ));
}

export function getScholarCandidates() {
    const research = ensureResearch();
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)
        .filter(entity => {
            const person = ensurePersonProfile(entity);
            return person && Number(person.ageYears) >= maturityFor(person) && !servesElsewhere(entity);
        })
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return {
                personId: String(entity.personId || entity.id),
                name: person.name,
                ageYears: Number(person.ageYears) || 0,
                fit: fitFor(person)
            };
        })
        .filter(entry => !research.scholars.some(scholar => String(scholar.personId) === String(entry.personId)))
        .sort((a, b) => b.fit - a.fit || a.name.localeCompare(b.name))
        .slice(0, 12);
}

export function appointScholar(personId) {
    const research = ensureResearch();
    const entity = findResident(personId);
    if (!entity) return { ok: false, reason: "person-not-found" };
    if (servesElsewhere(entity)) return { ok: false, reason: "already-serving" };
    if (research.scholars.length >= scholarCapacity()) return { ok: false, reason: "no-research-post" };
    if ((Number(state.resources?.gold) || 0) < SCHOLAR_APPOINTMENT_COST) return { ok: false, reason: "insufficient-gold" };
    const person = ensurePersonProfile(entity);
    if (!person || Number(person.ageYears) < maturityFor(person)) return { ok: false, reason: "not-adult" };
    addResource("gold", -SCHOLAR_APPOINTMENT_COST);
    const entry = {
        personId: String(entity.personId || entity.id),
        name: person.name,
        fit: fitFor(person),
        appointedYear: yearNow(),
        salary: SCHOLAR_SALARY
    };
    research.scholars.push(entry);
    research.revision++;
    addLog("SCHOLAR APPOINTED — " + person.name.toUpperCase() + " · FIT " + entry.fit, "#8fae9a", "research");
    return { ok: true, scholar: entry, snapshot: getResearchSnapshot() };
}

export function dismissScholar(personId) {
    const research = ensureResearch();
    const index = research.scholars.findIndex(entry => String(entry.personId) === String(personId));
    if (index < 0) return { ok: false, reason: "scholar-not-found" };
    const [removed] = research.scholars.splice(index, 1);
    research.revision++;
    addLog("SCHOLAR DISMISSED — " + removed.name.toUpperCase(), "#8fae9a", "research");
    return { ok: true, scholar: removed };
}

export function setResearchFunding(level) {
    const research = ensureResearch();
    const next = clamp(Math.floor(Number(level) || 0), 0, FUNDING_LEVELS.length - 1);
    if (research.funding === next) return { ok: false, reason: "already-selected" };
    research.funding = next;
    research.revision++;
    return { ok: true, funding: next };
}

export function startResearch(techId) {
    const research = ensureResearch();
    const tech = TECH_BY_ID.get(techId);
    if (!tech) return { ok: false, reason: "unknown-technology" };
    if (research.completed[tech.id]) return { ok: false, reason: "already-complete" };
    if (research.activeTech) return { ok: false, reason: "project-in-progress" };
    if (tech.requires.some(id => !research.completed[id])) return { ok: false, reason: "prerequisite-missing" };
    research.activeTech = tech.id;
    research.progress = Math.min(tech.cost, research.reserve);
    research.reserve = Math.max(0, research.reserve - research.progress);
    research.revision++;
    const completed = completeResearchIfReady(research);
    return { ok: true, tech, completed, snapshot: getResearchSnapshot() };
}

function completeResearchIfReady(research) {
    const tech = TECH_BY_ID.get(research.activeTech);
    if (!tech || research.progress < tech.cost) return null;
    research.completed[tech.id] = true;
    research.reserve = Math.min(240, research.reserve + Math.max(0, research.progress - tech.cost));
    research.activeTech = null;
    research.progress = 0;
    research.revision++;
    recordDiscovery(tech);
    applyPoliticalEffects({ legitimacy: 0.4, guilds: tech.branch === "craft" ? 0.4 : 0, clergy: tech.branch === "medicine" ? 0.2 : 0 });
    addLog("RESEARCH COMPLETE — " + tech.label.toUpperCase(), "#8fae9a", "research");
    return tech;
}

let modifierCache = { signature: "", value: null };

function researchSignature(research) {
    return [
        research.revision,
        research.activeTech || "",
        Object.keys(research.completed).sort().join(","),
        research.funding,
        state.government?.form || "feudal",
        state.government?.taxRate ?? "",
        state.identity?.culture || "frontier",
        state.identity?.religion || "ancestral",
        state.identity?.tradition || "hearth",
        state.identity?.law || "customary",
        state.identity?.legitimacy || "lineage",
        state.legacy?.prestige || 0,
        JSON.stringify(state.endeavours?.completed || {})
    ].join(":");
}

export function getResearchModifiers() {
    const research = ensureResearch();
    const signature = researchSignature(research);
    if (modifierCache.signature === signature && modifierCache.value) return modifierCache.value;
    const government = getGovernmentModifiers();
    const culture = getCultureModifiers();
    const legacy = getLegacyModifiers();
    let tax = Number(government.tax) || 0;
    let trade = Number(government.trade) || 0;
    let military = Number(government.military) || 0;
    let researchBonus = Number(government.research) || 0;
    let legitimacy = Number(government.legitimacy) || 0;
    let foodDemand = 0;
    let mortality = 0;
    let buildCost = 0;
    tax += culture.tax;
    trade += culture.trade;
    researchBonus += culture.research;
    military += culture.military;
    foodDemand += culture.foodDemand;
    legitimacy += culture.legitimacy;
    mortality += culture.mortality;
    trade += legacy.tradeFactor - 1;
    legitimacy += legacy.legitimacyYear;
    researchBonus += legacy.research;
    for (const id of Object.keys(research.completed)) {
        const tech = TECH_BY_ID.get(id);
        if (!tech) continue;
        tax += Number(tech.effects.tax) || 0;
        trade += Number(tech.effects.trade) || 0;
        military += Number(tech.effects.military) || 0;
        researchBonus += Number(tech.effects.research) || 0;
        legitimacy += Number(tech.effects.legitimacy) || 0;
        foodDemand += Number(tech.effects.foodDemand) || 0;
        mortality += Number(tech.effects.mortality) || 0;
        buildCost += Number(tech.effects.buildCost) || 0;
    }
    const value = {
        taxEfficiency: Math.max(0.6, 1 + tax),
        tradeFactor: Math.max(0.6, 1 + trade),
        militaryBonus: Math.max(0.65, 1 + military),
        researchSpeed: Math.max(0.4, (1 + researchBonus) * (1 + getEndeavourModifiers().research)),
        legitimacyYear: legitimacy,
        foodDemandFactor: Math.max(0.65, 1 + foodDemand),
        mortalityRelief: Math.max(0.65, 1 - mortality),
        buildDiscount: Math.min(0.25, Math.max(0, buildCost)),
        completedCount: Object.keys(research.completed).length,
        government,
        culture,
        legacy
    };
    modifierCache = { signature, value };
    return value;
}

export function researchOutputPerYear() {
    const research = ensureResearch();
    const { temples, courts, markets, clinics } = getResearchBuildings();
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const base = 2 + temples * 0.7 + courts * 0.4 + markets * 0.25 + clinics * 0.3 + population * 0.005;
    const scholars = research.scholars.reduce((sum, entry) => sum + Number(entry.fit || 0), 0) / 55;
    const funding = FUNDING_LEVELS[research.funding] || FUNDING_LEVELS[0];
    return Math.max(0, (base + scholars) * funding.multiplier * getResearchModifiers().researchSpeed);
}

export function updateResearch() {
    const research = ensureResearch();
    const mods = getResearchModifiers();
    const gold = Math.max(0, Number(state.resources?.gold) || 0);
    const salaryDue = research.scholars.length * SCHOLAR_SALARY;
    const fundingDue = (FUNDING_LEVELS[research.funding] || FUNDING_LEVELS[0]).gold;
    const salariesPaid = Math.min(gold, salaryDue);
    const fundingPaid = Math.min(gold - salariesPaid, fundingDue);
    if (salariesPaid > 0) addResource("gold", -salariesPaid);
    if (fundingPaid > 0) addResource("gold", -fundingPaid);
    const salaryRatio = salaryDue ? salariesPaid / salaryDue : 1;
    const fundingRatio = fundingDue ? fundingPaid / fundingDue : 1;
    const paidRatio = Math.max(0, Math.min(1, (salaryRatio + fundingRatio) / 2));
    const points = researchOutputPerYear() * paidRatio;
    let completed = null;
    if (research.activeTech) {
        research.progress += points;
        completed = completeResearchIfReady(research);
    } else {
        research.reserve = Math.min(240, research.reserve + points);
    }
    const politics = normalizePoliticalState();
    if (mods.legitimacyYear) politics.legitimacy = clamp(politics.legitimacy + mods.legitimacyYear);
    const active = research.activeTech ? TECH_BY_ID.get(research.activeTech) : null;
    const audit = {
        year: yearNow(),
        points: Math.round(points * 10) / 10,
        speed: Math.round(mods.researchSpeed * 1000) / 1000,
        salariesPaid,
        fundingPaid,
        funding: research.funding,
        scholars: research.scholars.length,
        active: active?.label || null,
        completed: completed?.label || null
    };
    research.lastAudit = audit;
    research.history.unshift(audit);
    if (research.history.length > RESEARCH_HISTORY_LIMIT) research.history.length = RESEARCH_HISTORY_LIMIT;
    research.revision++;
    addLog("RESEARCH AUDIT — " + audit.points + " POINTS" + (completed ? " · " + completed.label.toUpperCase() + " COMPLETE" : ""), "#8fae9a", "research");
    return audit;
}

export function getResearchSnapshot() {
    const research = ensureResearch();
    const mods = getResearchModifiers();
    const active = research.activeTech ? TECH_BY_ID.get(research.activeTech) : null;
    const techs = TECHNOLOGIES.map(tech => {
        const complete = Boolean(research.completed[tech.id]);
        const isActive = research.activeTech === tech.id;
        const unlocked = tech.requires.every(id => research.completed[id]);
        return {
            ...tech,
            status: complete ? "complete" : isActive ? "active" : unlocked ? "available" : "locked",
            progress: isActive ? research.progress : 0
        };
    });
    const branches = RESEARCH_BRANCHES.map(branch => ({ ...branch, techs: techs.filter(tech => tech.branch === branch.id) }));
    return {
        ...research,
        activeTechDetails: active,
        branches,
        techs,
        capacity: scholarCapacity(),
        candidates: getScholarCandidates(),
        pointsPerYear: Math.round(researchOutputPerYear() * 10) / 10,
        fundingDetails: FUNDING_LEVELS[research.funding] || FUNDING_LEVELS[0],
        fundingLevels: FUNDING_LEVELS,
        modifiers: mods
    };
}
