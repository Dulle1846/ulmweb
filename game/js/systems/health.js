// Public health simulation: water, sanitation, immunity, healers, medicine and
// household transmission. The system is annual/event driven plus a bounded
// twenty-day treatment cadence, never per-frame work.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { random } from "../core/random.js";
import { getCourtModifiers } from "./court.js";
import { addLog } from "../core/event-log.js";
import { addResource } from "./resources.js";
import { ensurePersonProfile, addPersonMemory } from "./people.js";
import { getEndeavourModifiers } from "./endeavours.js";

export const HEALTH_INTERVAL = 20;
export const HEALTH_HISTORY_LIMIT = 24;
export const MAX_HEALERS_PER_FACILITY = 2;
export const MEDICINE_MAX_STOCK = 60;
export const SANITATION_MAX = 100;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = value => Math.max(0, Math.round(Number(value) || 0));
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));
const residents = () => state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
const isSick = person => Number(person?.illnessUntilTick) > state.tick;

function defaultHealth() {
    return {
        outbreakActive: false,
        disease: "none",
        severity: 0,
        containment: 0,
        cases: 0,
        recovered: 0,
        outbreaks: 0,
        herbalDoses: 0,
        herbalTreated: 0,
        treatedTotal: 0,
        lastUpdateTick: 0,
        startedAtTick: 0,
        lastYear: yearNow(),
        lastAudit: null,
        sanitation: {
            score: 0,
            latrines: 0,
            waterPoints: 0,
            waste: 0,
            investments: 0,
            lastInvestmentYear: 0
        },
        healers: [],
        medicineStock: 0,
        medicineBrewed: 0,
        medicineUsed: 0,
        medicineSold: 0,
        medicinePrice: 2,
        quarantine: { level: 0, untilTick: 0, startedYear: 0, orders: 0 },
        mortality: {
            lastYear: 0,
            total: 0,
            byAge: { child: 0, adult: 0, elder: 0 },
            byOccupation: {},
            lastDeaths: []
        },
        history: []
    };
}

export function createHealthState() {
    return defaultHealth();
}

export function normalizeHealthState(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const base = defaultHealth();
    const sanitation = source.sanitation && typeof source.sanitation === "object" && !Array.isArray(source.sanitation)
        ? source.sanitation : {};
    const quarantine = source.quarantine && typeof source.quarantine === "object" && !Array.isArray(source.quarantine)
        ? source.quarantine : {};
    const mortality = source.mortality && typeof source.mortality === "object" && !Array.isArray(source.mortality)
        ? source.mortality : {};
    const byAge = mortality.byAge && typeof mortality.byAge === "object" && !Array.isArray(mortality.byAge)
        ? mortality.byAge : {};
    const healers = (Array.isArray(source.healers) ? source.healers : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, 24)
        .map(entry => ({
            personId: String(entry.personId || "").slice(0, 100),
            name: String(entry.name || "Unnamed healer").slice(0, 90),
            competence: clamp(entry.competence, 0, 100),
            appointedYear: clamp(entry.appointedYear || yearNow(), 1, 1000000),
            treated: round(entry.treated)
        }))
        .filter(entry => entry.personId);
    const history = (Array.isArray(source.history) ? source.history : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, HEALTH_HISTORY_LIMIT)
        .map(entry => ({
            year: clamp(entry.year, 1, 1000000),
            population: round(entry.population),
            sanitation: clamp(entry.sanitation, 0, 100),
            sick: round(entry.sick),
            cases: round(entry.cases),
            outbreak: String(entry.outbreak || "none").slice(0, 48),
            healers: round(entry.healers),
            medicineStock: round(entry.medicineStock),
            medicinePrice: clamp(entry.medicinePrice, 0.5, 50)
        }));
    const byOccupation = {};
    if (mortality.byOccupation && typeof mortality.byOccupation === "object" && !Array.isArray(mortality.byOccupation)) {
        for (const [key, value] of Object.entries(mortality.byOccupation).slice(0, 24)) {
            byOccupation[String(key).slice(0, 40)] = round(value);
        }
    }
    const lastDeaths = (Array.isArray(mortality.lastDeaths) ? mortality.lastDeaths : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, 12)
        .map(entry => ({
            name: String(entry.name || "Unknown resident").slice(0, 90),
            age: clamp(entry.age, 0, 1000),
            group: String(entry.group || "adult").slice(0, 16),
            occupation: String(entry.occupation || "resident").slice(0, 40),
            cause: String(entry.cause || "illness").slice(0, 48)
        }));
    return {
        ...base,
        outbreakActive: Boolean(source.outbreakActive),
        disease: String(source.disease || "none").slice(0, 48) || "none",
        severity: clamp(source.severity ?? 0, 0, 3),
        containment: clamp(source.containment ?? 0, 0, 3),
        cases: round(source.cases),
        recovered: round(source.recovered),
        outbreaks: round(source.outbreaks),
        herbalDoses: round(source.herbalDoses),
        herbalTreated: round(source.herbalTreated),
        treatedTotal: round(source.treatedTotal),
        lastUpdateTick: round(source.lastUpdateTick),
        startedAtTick: round(source.startedAtTick),
        lastYear: clamp(source.lastYear || yearNow(), 1, 1000000),
        lastAudit: source.lastAudit && typeof source.lastAudit === "object" && !Array.isArray(source.lastAudit)
            ? { ...source.lastAudit } : null,
        sanitation: {
            score: clamp(sanitation.score, 0, SANITATION_MAX),
            latrines: round(sanitation.latrines),
            waterPoints: round(sanitation.waterPoints),
            waste: clamp(sanitation.waste, 0, 100),
            investments: round(sanitation.investments),
            lastInvestmentYear: round(sanitation.lastInvestmentYear)
        },
        healers,
        medicineStock: clamp(source.medicineStock, 0, MEDICINE_MAX_STOCK),
        medicineBrewed: round(source.medicineBrewed),
        medicineUsed: round(source.medicineUsed),
        medicineSold: round(source.medicineSold),
        medicinePrice: clamp(source.medicinePrice ?? 2, 0.5, 50),
        quarantine: {
            level: clamp(quarantine.level, 0, 3),
            untilTick: round(quarantine.untilTick),
            startedYear: round(quarantine.startedYear),
            orders: round(quarantine.orders)
        },
        mortality: {
            lastYear: round(mortality.lastYear),
            total: round(mortality.total),
            byAge: {
                child: round(byAge.child),
                adult: round(byAge.adult),
                elder: round(byAge.elder)
            },
            byOccupation,
            lastDeaths
        },
        history
    };
}

function ensureHealth() {
    if (!state.health || typeof state.health !== "object" || Array.isArray(state.health)) {
        state.health = createHealthState();
    }
    const current = state.health;
    const normalized = normalizeHealthState(current);
    for (const key of Object.keys(normalized)) current[key] = normalized[key];
    return current;
}

export function addMedicineStock(amount = 0) {
    const health = ensureHealth();
    const wanted = Math.max(0, Math.floor(Number(amount) || 0));
    const accepted = Math.min(wanted, MEDICINE_MAX_STOCK - health.medicineStock);
    if (accepted <= 0) return 0;
    health.medicineStock += accepted;
    return accepted;
}

function householdKey(villager) {
    if (typeof villager.householdId === "string" && villager.householdId) return villager.householdId;
    const home = villager.home || { x: villager.x, y: villager.y };
    return "home:" + Number(home.x).toFixed(2) + ":" + Number(home.y).toFixed(2);
}

function waterWells() {
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.WELL &&
        !(entity.construction && Number(entity.construction.stage) < 3)).length;
}

function completedCareBuildings() {
    return state.entities.filter(entity => !entity.dead &&
        (entity.type === TYPE.CLINIC || entity.type === TYPE.TEMPLE) &&
        !(entity.construction && Number(entity.construction.stage) < 3));
}

function completedHouses() {
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.HOUSE &&
        !(entity.construction && Number(entity.construction.stage) < 3));
}

function crowdingLevel() {
    const people = residents().length;
    const capacity = completedHouses().length * 4;
    return capacity > 0 ? Math.max(0, people - capacity) / Math.max(1, capacity) : 0;
}

export function getWaterCoverage() {
    const people = Math.max(1, residents().length);
    return clamp(waterWells() * 6 / people, 0, 1);
}

export function getSanitationScore() {
    const health = ensureHealth();
    const civic = Number(getEndeavourModifiers().health) || 0;
    return clamp(Number(health.sanitation.score) + getWaterCoverage() * 35 + civic, 0, 100);
}

function activeHealerEntries() {
    const health = ensureHealth();
    const alive = new Map(state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)
        .map(entity => [String(entity.personId || entity.id), entity]));
    return health.healers.filter(entry => alive.has(String(entry.personId)));
}

export function getHealerCoverage() {
    const healers = activeHealerEntries();
    if (!healers.length) return 0;
    const sick = residents().filter(isSick).length;
    const competence = healers.reduce((sum, entry) => sum + Number(entry.competence || 0), 0);
    if (sick <= 0) return clamp(competence / 190, 0, 0.65);
    return clamp(competence / (sick * 42 + 55), 0, 1);
}

export function getQuarantineLevel() {
    const health = ensureHealth();
    return health.quarantine.untilTick > state.tick ? health.quarantine.level : 0;
}

export function getHealthEconomicEffects() {
    const health = ensureHealth();
    const quarantine = getQuarantineLevel();
    const active = Boolean(health.outbreakActive);
    return {
        outbreakActive: active,
        severity: Number(health.severity) || 0,
        quarantineLevel: quarantine,
        sanitation: getSanitationScore(),
        medicinePrice: Number(health.medicinePrice) || 2,
        medicineStock: Number(health.medicineStock) || 0,
        tradePenalty: clamp(quarantine * 0.09 + (active ? 0.025 : 0), 0, 0.35)
    };
}

export function getMortalityContext() {
    return {
        sanitation: getSanitationScore(),
        healerCoverage: getHealerCoverage(),
        medicineStock: Number(ensureHealth().medicineStock) || 0,
        quarantineLevel: getQuarantineLevel(),
        outbreakActive: Boolean(ensureHealth().outbreakActive),
        severity: Number(ensureHealth().severity) || 0
    };
}

export function getHealthSnapshot() {
    const people = residents();
    const sick = people.filter(isSick);
    const health = ensureHealth();
    const healers = activeHealerEntries();
    const immunityAverage = people.length
        ? people.reduce((sum, person) => sum + clamp(person.immunity, 0, 100), 0) / people.length
        : 0;
    const quarantine = getQuarantineLevel();
    return {
        population: people.length,
        sick: sick.length,
        recovered: health.recovered,
        cases: health.cases,
        disease: health.disease,
        outbreaks: health.outbreaks,
        active: health.outbreakActive,
        severity: health.severity,
        containment: health.containment,
        herbalDoses: health.herbalDoses,
        herbalTreated: health.herbalTreated,
        treatedTotal: health.treatedTotal,
        sanitation: Math.round(getSanitationScore()),
        sanitationInvestments: health.sanitation.investments,
        sanitationLastYear: health.sanitation.lastInvestmentYear,
        waterCoverage: Math.round(getWaterCoverage() * 100),
        wells: waterWells(),
        crowding: Math.round(crowdingLevel() * 100),
        healerCoverage: Math.round(getHealerCoverage() * 100),
        healers: healers.map(entry => ({ ...entry })),
        healerCapacity: completedCareBuildings().length * MAX_HEALERS_PER_FACILITY,
        immunityAverage: Math.round(immunityAverage),
        medicineStock: health.medicineStock,
        medicinePrice: health.medicinePrice,
        medicineBrewed: health.medicineBrewed,
        medicineUsed: health.medicineUsed,
        medicineSold: health.medicineSold,
        quarantineLevel: quarantine,
        quarantineUntilTick: health.quarantine.untilTick,
        tradePenalty: getHealthEconomicEffects().tradePenalty,
        mortality: JSON.parse(JSON.stringify(health.mortality)),
        history: health.history.slice(0, 12),
        lastAudit: health.lastAudit ? { ...health.lastAudit } : null
    };
}

// Herbs and lichen are not just market goods. When people are ill, the public
// health system consumes a bounded number of stored medicinal units and turns
// them into measurable recovery time and lower disease severity. This is the
// bridge from the forest-gathering ledger into the population model.
const MEDICINAL_GOODS = Object.freeze([
    Object.freeze({ id: "herbs", potency: 1 }),
    Object.freeze({ id: "lichen", potency: 0.6 }),
    // Tropical forest medicine (1.2.4.47). These are real gathered goods, so a
    // rainforest realm can treat fevers with its own pharmacopoeia instead of
    // depending on temperate herbs.
    Object.freeze({ id: "quinine-bark", potency: 1.25 }),
    Object.freeze({ id: "fever-bark", potency: 1.2 }),
    Object.freeze({ id: "cat-claw", potency: 1.05 }),
    Object.freeze({ id: "copaiba-oil", potency: 1.1 }),
]);

export function applyHerbalRemedy(maxDoses = 2) {
    const health = ensureHealth();
    const people = residents();
    const sick = people.filter(isSick);
    const ledger = state.forestGathering;
    const stock = ledger && typeof ledger === "object" && ledger.stock && typeof ledger.stock === "object"
        ? ledger.stock : null;
    if (!sick.length) return { ok: false, used: 0, treated: 0, strength: 0 };
    let remaining = Math.max(0, Math.min(8, Math.floor(Number(maxDoses) || 2)));
    let strength = 0;
    const used = [];
    const medicineTake = Math.min(remaining, Math.max(0, Math.floor(Number(health.medicineStock) || 0)));
    if (medicineTake > 0) {
        health.medicineStock -= medicineTake;
        health.medicineUsed += medicineTake;
        remaining -= medicineTake;
        strength += medicineTake * 1.35;
        used.push({ id: "medicine", amount: medicineTake, potency: 1.35 });
    }
    if (stock) {
        for (const medicine of MEDICINAL_GOODS) {
            if (remaining <= 0) break;
            const available = Math.max(0, Math.floor(Number(stock[medicine.id]) || 0));
            const take = Math.min(remaining, available);
            if (take <= 0) continue;
            stock[medicine.id] = available - take;
            remaining -= take;
            strength += take * medicine.potency;
            used.push({ id: medicine.id, amount: take, potency: medicine.potency });
        }
    }
    if (strength <= 0) return { ok: false, used: 0, treated: 0, strength: 0 };
    const reliefTicks = Math.max(1, Math.round(14 * strength));
    for (const person of sick) {
        person.illnessUntilTick = Math.max(state.tick + HEALTH_INTERVAL,
            person.illnessUntilTick - reliefTicks);
        person.immunity = clamp((Number(person.immunity) || 0) + strength * 0.7, 0, 100);
    }
    health.severity = clamp(health.severity - strength * 0.3, 0, 3);
    health.herbalDoses += used.reduce((sum, entry) => sum + entry.amount, 0);
    health.herbalTreated += sick.length;
    health.treatedTotal += sick.length;
    return { ok: true, used, treated: sick.length, strength, reliefTicks };
}

export function startOutbreak({ severity = 1, containment = 0, disease = "common-fever" } = {}) {
    const health = ensureHealth();
    const people = residents();
    const alreadyActive = health.outbreakActive && people.some(person => isSick(person));
    health.outbreakActive = true;
    health.disease = String(disease).slice(0, 48) || "common-fever";
    health.severity = Math.max(health.severity, clamp(severity, 1, 3));
    health.containment = Math.max(health.containment, clamp(containment, 0, 3));
    if (!alreadyActive) {
        health.startedAtTick = state.tick;
        health.outbreaks++;
        if (people.length) {
            const patient = people.find(person => !isSick(person)) || people[0];
            if (!isSick(patient)) {
                patient.illnessStartedTick = state.tick;
                patient.illnessUntilTick = state.tick + 80 + health.severity * 20;
                patient.illnessSeverity = health.severity;
                patient.infectionSource = "outbreak";
                health.cases++;
            }
        }
        addLog("OUTBREAK DECLARED: " + health.disease.toUpperCase() + " · SEVERITY " + health.severity, "#c48a8a", "health");
    }
    return getHealthSnapshot();
}

function injureResident(source, severity = 1) {
    const people = residents().filter(person => !isSick(person));
    if (!people.length) return null;
    const patient = people[Math.floor(random("health") * people.length)];
    patient.illnessStartedTick = state.tick;
    patient.illnessUntilTick = state.tick + 40 + severity * 20;
    patient.illnessSeverity = clamp(severity, 1, 3);
    patient.infectionSource = String(source).slice(0, 32);
    addLog("FOREST INJURY · " + (patient.person?.name || "A resident")
        + " · " + String(source).toUpperCase(), "#c48a8a", "health");
    return patient;
}

export function tropicalExposure(hazard = {}, context = {}) {
    const people = residents();
    if (!people.length || !hazard || typeof hazard !== "object") {
        return { outbreak: false, injury: false, foodLost: 0 };
    }
    const health = ensureHealth();
    const h = {
        disease: clamp(Number(hazard.disease) || 0, 0, 1),
        parasites: clamp(Number(hazard.parasites) || 0, 0, 1),
        poison: clamp(Number(hazard.poison) || 0, 0, 1),
        predators: clamp(Number(hazard.predators) || 0, 0, 1),
        thorns: clamp(Number(hazard.thorns) || 0, 0, 1),
        storm: clamp(Number(hazard.storm) || 0, 0, 1),
    };
    const result = { outbreak: false, injury: false, foodLost: 0 };
    const diseaseChance = clamp(h.disease * 0.18 + h.parasites * 0.12, 0, 0.3);
    if (!health.outbreakActive && diseaseChance > 0 && random("health") < diseaseChance) {
        startOutbreak({
            severity: h.disease > 0.78 ? 2 : 1,
            disease: String(hazard.diseaseLabel || context.diseaseLabel || "tropical forest fever").slice(0, 48),
        });
        result.outbreak = true;
    } else if (h.parasites > 0.6 && random("health") < 0.1) {
        result.injury = Boolean(injureResident("parasites", 1));
    }
    if (h.poison > 0.55 && random("health") < 0.08 + h.poison * 0.1) {
        result.injury = Boolean(injureResident("poison", 1)) || result.injury;
    }
    if (h.predators > 0.55 && random("health") < 0.03 + h.predators * 0.08) {
        result.injury = Boolean(injureResident("predator", 2)) || result.injury;
    }
    // Thorn scrub is a real work hazard, not only a dark patch in the tile art.
    if (h.thorns > 0.55 && random("health") < 0.05 + h.thorns * 0.09) {
        result.injury = Boolean(injureResident("thorns", 1)) || result.injury;
    }
    if (h.storm > 0.6 && random("health") < 0.12) {
        const food = Math.max(0, Math.floor(Number(state.resources?.food) || 0));
        const loss = Math.min(food, Math.max(0, Math.round(food * 0.02)));
        if (loss > 0) {
            addResource("food", -loss);
            state.morale = Math.max(0, (Number(state.morale) || 0) - 1);
            result.foodLost = loss;
            addLog("STORM AND FLOOD DAMAGE · " + loss + " FOOD LOST", "#c48a8a", "health");
        }
    }
    return result;
}

export function applyHealthEffects(effects = {}) {
    let health = ensureHealth();
    if (effects.outbreak) {
        startOutbreak({
            severity: effects.severity ?? 1,
            containment: effects.containment ?? 0,
            disease: effects.disease || "common-fever"
        });
        health = ensureHealth();
    }
    if (Number.isFinite(effects.treatment)) {
        const treatment = clamp(effects.treatment, 0, 3);
        health.severity = clamp(health.severity - treatment, 0, 3);
        if (treatment > 0) {
            for (const person of residents()) {
                if (isSick(person)) {
                    person.illnessUntilTick = Math.max(state.tick + HEALTH_INTERVAL, person.illnessUntilTick - treatment * 20);
                    person.immunity = clamp((Number(person.immunity) || 0) + treatment * 2, 0, 100);
                }
            }
            health.treatedTotal += residents().filter(isSick).length;
        }
    }
    if (Number.isFinite(effects.containment) && !effects.outbreak) health.containment = clamp(health.containment + effects.containment, 0, 3);
    return getHealthSnapshot();
}

export function improveSanitation() {
    const health = ensureHealth();
    if (health.sanitation.lastInvestmentYear === state.year) {
        return { ok: false, reason: "SANITARY WORKS ARE ALREADY UNDERWAY THIS YEAR" };
    }
    const cost = { wood: 18, stone: 12, gold: 6 };
    for (const [resource, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[resource]) || 0) < amount) return { ok: false, reason: "NOT ENOUGH " + resource.toUpperCase() };
    }
    for (const [resource, amount] of Object.entries(cost)) addResource(resource, -amount);
    health.sanitation.score = clamp(health.sanitation.score + 18, 0, SANITATION_MAX);
    health.sanitation.latrines++;
    health.sanitation.waterPoints++;
    health.sanitation.investments++;
    health.sanitation.lastInvestmentYear = state.year;
    health.sanitation.waste = Math.max(0, health.sanitation.waste - 8);
    addLog("SANITARY WORKS COMPLETED · DRAINS AND LATRINES IMPROVED · SCORE " + Math.round(getSanitationScore()), "#9ab7a1", "health");
    return { ok: true, cost, sanitation: Math.round(getSanitationScore()), message: "sanitary works completed" };
}

export function appointHealer(personId) {
    const health = ensureHealth();
    const livingVillagerIds = new Set(state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)
        .map(entity => String(entity.personId || entity.id)));
    health.healers = health.healers.filter(entry => livingVillagerIds.has(String(entry.personId)));
    const candidates = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER &&
        (String(entity.personId || entity.id) === String(personId) || String(entity.id) === String(personId)));
    const entity = candidates[0];
    if (!entity) return { ok: false, reason: "RESIDENT NOT FOUND" };
    if (health.healers.some(entry => String(entry.personId) === String(entity.personId || entity.id))) {
        return { ok: false, reason: "THIS RESIDENT ALREADY SERVES AS A HEALER" };
    }
    const capacity = completedCareBuildings().length * MAX_HEALERS_PER_FACILITY;
    if (health.healers.length >= capacity) {
        return { ok: false, reason: capacity > 0 ? "ALL HEALER POSTS ARE FILLED" : "BUILD A TEMPLE OR CLINIC FIRST" };
    }
    if ((Number(state.resources.gold) || 0) < 12) return { ok: false, reason: "NOT ENOUGH GOLD" };
    const person = ensurePersonProfile(entity);
    if (person.ageYears < 16) return { ok: false, reason: "THE RESIDENT IS TOO YOUNG TO SERVE" };
    if (isSick(entity)) return { ok: false, reason: "THE RESIDENT IS ILL" };
    addResource("gold", -12);
    const traits = person.traits || {};
    const competence = Math.round(clamp(
        24 + Number(traits.compassion || 40) * 0.32 + Number(traits.discipline || 40) * 0.22 +
        Number(traits.curiosity || 40) * 0.18 + Math.min(18, Math.max(0, person.ageYears - 16) * 0.45),
        18, 96
    ));
    health.healers.push({
        personId: String(entity.personId || entity.id),
        name: person.name,
        competence,
        appointedYear: yearNow(),
        treated: 0
    });
    health.healers = health.healers.slice(-24);
    entity.isHealer = true;
    entity.healthRole = "healer";
    addPersonMemory(entity, {
        id: "health:healer:" + state.year,
        type: "health",
        text: "I was appointed a public healer in year " + yearNow() + ".",
        tick: state.tick,
        importance: 78
    });
    addLog(person.name + " WAS APPOINTED A PUBLIC HEALER · COMPETENCE " + competence, "#9ab7a1", "health");
    return { ok: true, name: person.name, competence, cost: { gold: 12 }, message: "healer appointed" };
}

export function dismissHealer(personId) {
    const health = ensureHealth();
    const entry = health.healers.find(item => String(item.personId) === String(personId));
    if (!entry) return { ok: false, reason: "HEALER NOT FOUND" };
    health.healers = health.healers.filter(item => String(item.personId) !== String(personId));
    const entity = state.entities.find(item => String(item.personId || item.id) === String(personId));
    if (entity) {
        entity.isHealer = false;
        entity.healthRole = null;
    }
    addLog(entry.name + " WAS RELIEVED OF THE HEALER POST", "#a3b18a", "health");
    return { ok: true, name: entry.name, message: "healer dismissed" };
}

export function brewMedicine() {
    const health = ensureHealth();
    const ledger = state.forestGathering;
    const stock = ledger && typeof ledger === "object" && ledger.stock && typeof ledger.stock === "object"
        ? ledger.stock : null;
    if (!stock) return { ok: false, reason: "NO FOREST MEDICINE LEDGER" };
    const herbs = Math.max(0, Math.floor(Number(stock.herbs) || 0));
    if (herbs < 3) return { ok: false, reason: "NEED 3 HERBS FROM THE FOREST" };
    if ((Number(state.resources.gold) || 0) < 4) return { ok: false, reason: "NOT ENOUGH GOLD" };
    const lichen = Math.min(2, Math.max(0, Math.floor(Number(stock.lichen) || 0)));
    const made = 5 + Math.min(3, lichen);
    if (health.medicineStock + made > MEDICINE_MAX_STOCK) return { ok: false, reason: "THE MEDICINE STORE IS FULL" };
    stock.herbs = herbs - 3;
    stock.lichen = Math.max(0, Math.floor(Number(stock.lichen) || 0) - lichen);
    addResource("gold", -4);
    health.medicineStock += made;
    health.medicineBrewed += made;
    health.medicinePrice = Math.max(0.75, Math.round((Number(health.medicinePrice) || 2) * 0.94 * 100) / 100);
    addLog("REMEDIES BREWED · " + made + " DOSES ADDED TO THE PUBLIC STORE", "#9ab7a1", "health");
    return { ok: true, made, stock: health.medicineStock, herbCost: 3, lichenCost: lichen, cost: { gold: 4 }, message: "medicine brewed" };
}

export function treatSick() {
    const health = ensureHealth();
    const sick = residents().filter(isSick);
    if (!sick.length) return { ok: false, reason: "NO ONE IS CURRENTLY ILL" };
    if (health.medicineStock <= 0) return { ok: false, reason: "NO MEDICINE IN THE PUBLIC STORE" };
    const doses = Math.min(4, health.medicineStock, sick.length);
    health.medicineStock -= doses;
    health.medicineUsed += doses;
    const coverage = getHealerCoverage();
    const relief = Math.round(16 + coverage * 30);
    for (const person of sick.slice(0, doses)) {
        person.illnessUntilTick = Math.max(state.tick + HEALTH_INTERVAL, person.illnessUntilTick - relief);
        person.immunity = clamp((Number(person.immunity) || 0) + 4, 0, 100);
    }
    health.severity = clamp(health.severity - doses * 0.18, 0, 3);
    health.treatedTotal += doses;
    for (const entry of health.healers) entry.treated += 1;
    addLog("PUBLIC TREATMENT · " + doses + " DOSES ADMINISTERED · " + relief + " DAYS OF ILLNESS LIFTED", "#9ab7a1", "health");
    return { ok: true, treated: doses, relief, stock: health.medicineStock, message: "treatment administered" };
}

export function sellMedicine(quantity = 2) {
    const health = ensureHealth();
    const amount = Math.max(1, Math.min(10, Math.floor(Number(quantity) || 2)));
    if (health.medicineStock < amount) return { ok: false, reason: "NOT ENOUGH MEDICINE IN STORE" };
    const price = Math.max(0.75, Number(health.medicinePrice) || 2);
    const gold = Math.max(1, Math.round(price * amount * 0.9));
    health.medicineStock -= amount;
    health.medicineSold += amount;
    addResource("gold", gold);
    addLog("SOLD " + amount + " MEDICINE DOSES FOR " + gold + " GOLD", "#c9b17a", "health");
    return { ok: true, amount, gold, stock: health.medicineStock, message: "medicine sold" };
}

export function setQuarantine(level = 1) {
    const health = ensureHealth();
    const next = clamp(level, 0, 3);
    if (next === 0) {
        health.quarantine.level = 0;
        health.quarantine.untilTick = 0;
        health.containment = 0;
        addLog("QUARANTINE LIFTED · THE TRADE ROADS REOPEN", "#a3b18a", "health");
        return { ok: true, level: 0, message: "quarantine lifted" };
    }
    health.quarantine.level = next;
    health.quarantine.untilTick = state.tick + HEALTH_INTERVAL * 12;
    health.quarantine.startedYear = yearNow();
    health.quarantine.orders++;
    health.containment = Math.max(health.containment, next);
    state.morale = Math.max(0, Number(state.morale || 0) - next * 1.5);
    addLog("QUARANTINE ORDER " + next + " · TRADE SLOWED, CONTAGION CONTAINED", "#c48a8a", "health");
    return { ok: true, level: next, tradePenalty: getHealthEconomicEffects().tradePenalty, message: "quarantine ordered" };
}

export function recordHealthMortality(entity, person, cause = "illness") {
    const health = ensureHealth();
    const age = Math.max(0, Number(person?.ageYears) || 0);
    const group = age < 16 ? "child" : age >= 60 ? "elder" : "adult";
    const occupation = String(person?.role || entity?.job || "resident").slice(0, 40) || "resident";
    health.mortality.total++;
    health.mortality.byAge[group] = round(health.mortality.byAge[group]) + 1;
    health.mortality.byOccupation[occupation] = round(health.mortality.byOccupation[occupation]) + 1;
    health.mortality.lastDeaths.unshift({
        name: String(person?.name || "Unknown resident").slice(0, 90),
        age,
        group,
        occupation,
        cause: String(cause).slice(0, 48)
    });
    health.mortality.lastDeaths = health.mortality.lastDeaths.slice(0, 12);
    health.mortality.lastYear = yearNow();
    return health.mortality.lastDeaths[0];
}

function auditHealthYear() {
    const health = ensureHealth();
    const year = yearNow();
    if (health.lastYear >= year) return;
    health.lastYear = year;
    const aliveIds = new Set(state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER)
        .map(entity => String(entity.personId || entity.id)));
    health.healers = health.healers.filter(entry => aliveIds.has(String(entry.personId)));
    for (const person of residents()) {
        person.immunity = clamp((Number(person.immunity) || 0) - 4, 0, 100);
    }
    const population = residents().length;
    const crowding = crowdingLevel();
    const wells = waterWells();
    const waste = Math.max(0, population - wells * 5) * 0.35 + crowding * 14;
    health.sanitation.waste = clamp(health.sanitation.waste * 0.55 + waste, 0, 100);
    health.sanitation.score = clamp(health.sanitation.score - 2 - health.sanitation.waste * 0.12, 0, SANITATION_MAX);
    const sick = residents().filter(isSick).length;
    const demand = sick * 1.3 + (health.outbreakActive ? 6 : 0) + getQuarantineLevel() * 2;
    health.medicinePrice = clamp(
        (1.55 + demand / Math.max(2, health.medicineStock + 3)) * (1 + Number(health.severity) * 0.14),
        0.75, 24
    );
    health.medicinePrice = Math.round(health.medicinePrice * 100) / 100;
    const sanitation = getSanitationScore();
    const coverage = getHealerCoverage();
    const foodShortage = Math.max(0, Number(state.economy?.lastLedger?.foodShortage) || 0);
    if (population > 0 && !health.outbreakActive) {
        const risk = clamp(
            0.018 + Math.max(0, 58 - sanitation) / 100 * 0.26 + crowding * 0.12 +
            Math.min(0.08, foodShortage * 0.01) - coverage * 0.06,
            0, 0.62
        );
        if (random("health") < risk) {
            const disease = sanitation < 40
                ? (getWaterCoverage() < 0.45 ? "dysentery" : "typhoid")
                : state.seasonIndex === 3 ? "winter-fever" : "common-fever";
            startOutbreak({ severity: sanitation < 35 ? 2 : 1, disease });
        }
    }
    const audit = {
        year,
        population,
        sanitation: Math.round(sanitation),
        waste: Math.round(health.sanitation.waste),
        sick,
        healers: health.healers.length,
        medicineStock: health.medicineStock,
        medicinePrice: health.medicinePrice,
        outbreak: health.outbreakActive ? health.disease : "none"
    };
    health.lastAudit = audit;
    health.history.unshift(audit);
    health.history = health.history.slice(0, HEALTH_HISTORY_LIMIT);
    addLog("PUBLIC HEALTH AUDIT · YEAR " + year + " · SANITATION " + audit.sanitation + " · " + sick + " ILL · " + health.healers.length + " HEALERS · MEDICINE " + health.medicineStock, "#9ab7a1", "health");
}

// Run the first annual health audit while the start screen still covers the
// realm. It is the same audit the opening tick performs; moving it one frame
// earlier keeps its result and removes a one-off block from visible play.
export function warmHealthCaches() {
    const health = ensureHealth();
    if (health.lastYear < state.year) auditHealthYear();
    return true;
}

export function updateHealth() {
    if (state.tick <= 0) return null;
    const health = ensureHealth();
    if (health.lastYear < state.year) auditHealthYear();
    const due = state.tick % HEALTH_INTERVAL === 0 && health.lastUpdateTick !== state.tick;
    if (!due) return null;
    if (health.quarantine.level > 0 && health.quarantine.untilTick <= state.tick) {
        health.quarantine.level = 0;
        health.quarantine.untilTick = 0;
        health.containment = 0;
        addLog("QUARANTINE EXPIRED · TRADE RESUMES", "#a3b18a", "health");
    }
    const people = residents();
    let recoveredNow = 0;
    for (const person of people) {
        if ((person.illnessUntilTick || 0) > 0 && person.illnessUntilTick <= state.tick) {
            person.immunity = clamp((Number(person.immunity) || 0) + 15 + Number(person.illnessSeverity || 1) * 6, 0, 100);
            delete person.illnessUntilTick;
            delete person.illnessStartedTick;
            delete person.illnessSeverity;
            delete person.infectionSource;
            recoveredNow++;
        }
    }
    health.recovered += recoveredNow;
    if (!health.outbreakActive) return recoveredNow ? getHealthSnapshot() : null;
    health.lastUpdateTick = state.tick;
    applyHerbalRemedy(2);
    const groups = new Map();
    for (const person of people) {
        const key = householdKey(person);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(person);
    }
    const foodShortage = Math.max(0, Number(state.economy?.lastLedger?.foodShortage) || 0);
    const crowding = people.length > 0 && people.length > completedHouses().length * 4;
    const careBuildings = completedCareBuildings().length;
    const chaplainContainment = Math.max(0, Math.min(0.14, getCourtModifiers().healthContainment * 0.8));
    const sanitation = getSanitationScore();
    const coverage = getHealerCoverage();
    const quarantine = getQuarantineLevel();
    const transmissionRisk = clamp(
        0.12 + health.severity * 0.13 + (crowding ? 0.08 : 0) + Math.min(0.12, foodShortage * 0.01)
        - health.containment * 0.075 - Math.min(0.12, careBuildings * 0.025) - chaplainContainment
        + Math.max(0, 45 - sanitation) / 100 * 0.1 - coverage * 0.07 - quarantine * 0.035,
        0, 0.8
    );
    for (const household of groups.values()) {
        const infectious = household.some(isSick);
        if (!infectious) continue;
        const susceptible = household.filter(person => !isSick(person));
        if (!susceptible.length) continue;
        if (random("health") < transmissionRisk) {
            const patient = susceptible[Math.floor(random("health") * susceptible.length)];
            const immunity = clamp((Number(patient.immunity) || 0) / 100, 0, 1);
            if (random("health") < 1 - immunity * 0.55) {
                patient.illnessStartedTick = state.tick;
                patient.illnessSeverity = health.severity;
                patient.illnessUntilTick = state.tick + 80 + health.severity * 20;
                patient.infectionSource = "household";
                health.cases++;
            }
        }
    }
    // Community contact spreads the outbreak beyond a single roof. The pass is
    // bounded to one candidate per period and is suppressed by quarantine,
    // sanitation and healers.
    const susceptible = people.filter(person => !isSick(person));
    const communityRisk = clamp(
        health.cases / Math.max(6, people.length) * 0.18 + health.severity * 0.012
        - sanitation / 100 * 0.055 - quarantine * 0.022 - coverage * 0.035,
        0, 0.16
    );
    if (susceptible.length && random("health") < communityRisk) {
        const patient = susceptible[Math.floor(random("health") * susceptible.length)];
        patient.illnessStartedTick = state.tick;
        patient.illnessSeverity = health.severity;
        patient.illnessUntilTick = state.tick + 80 + health.severity * 20;
        patient.infectionSource = "community";
        health.cases++;
    }
    const sick = people.filter(isSick).length;
    if (sick > 0) state.morale = Math.max(0, Number(state.morale || 0) - Math.min(0.45, sick * 0.06));
    if (sick === 0) {
        health.outbreakActive = false;
        health.containment = getQuarantineLevel();
        health.severity = 0;
        health.disease = "none";
        addLog("THE OUTBREAK HAS PASSED · " + health.recovered + " RECOVERIES RECORDED", "#9ab7a1", "health");
    }
    return getHealthSnapshot();
}

export function validateHealthState(value) {
    if (value === undefined || value === null) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Save data contains an invalid health state.");
    }
    if (value.healers !== undefined && (!Array.isArray(value.healers) || value.healers.length > 24)) {
        throw new Error("Save data contains an invalid healer list.");
    }
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > HEALTH_HISTORY_LIMIT)) {
        throw new Error("Save data contains an invalid health history.");
    }
    if (value.medicineStock !== undefined && (!Number.isFinite(Number(value.medicineStock)) || Number(value.medicineStock) < 0 || Number(value.medicineStock) > MEDICINE_MAX_STOCK)) {
        throw new Error("Save data contains an invalid medicine stock.");
    }
    if (value.quarantine !== undefined && value.quarantine !== null &&
        (typeof value.quarantine !== "object" || Array.isArray(value.quarantine) || !Number.isFinite(Number(value.quarantine.level ?? 0)))) {
        throw new Error("Save data contains an invalid quarantine order.");
    }
    return true;
}
