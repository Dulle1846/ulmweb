// Crown Endeavours: the long work of a mature realm.
//
// The thirteen ambitions end the told campaign; the eternal deeds continue it.
// Endeavours give the five player fantasies — building, war, diplomacy, trade
// and scholarship — a repeatable late-game decision that spends real resources,
// names a real resident as overseer, and changes live systems rather than a
// counter. Every path is a short chain of three projects, and each project can
// be renewed up to five times with rising cost and work.
import { state } from "../core/state.js";
import { addResource } from "./resources.js";
import { ensurePersonProfile } from "./people.js";
import { recordLegacy } from "./legacy.js";

export const ENDEAVOUR_VERSION = 1;
export const ENDEAVOUR_TIER_LIMIT = 5;
const HISTORY_LIMIT = 24;

export const ENDEAVOUR_FUNDING = Object.freeze([
    Object.freeze({ id: 0, label: "Thrifty", gold: 0, multiplier: 1, detail: "No annual grant. The work advances on the overseer's own labour." }),
    Object.freeze({ id: 1, label: "Steady", gold: 18, multiplier: 1.7, detail: "18 gold a year. Materials arrive on schedule and the yard keeps full hours." }),
    Object.freeze({ id: 2, label: "Grand", gold: 48, multiplier: 2.6, detail: "48 gold a year. A second shift, paid carriers and the finest stone." })
]);

const EFFECT_LABELS = Object.freeze({
    housing: { label: "housing", scale: 1, suffix: " beds" },
    health: { label: "sanitation", scale: 1, suffix: "" },
    morale: { label: "morale", scale: 1, suffix: "/tick" },
    tax: { label: "tax yield", scale: 100, suffix: "%" },
    trade: { label: "trade terms", scale: 100, suffix: "%" },
    research: { label: "research rate", scale: 100, suffix: "%" },
    military: { label: "soldier power", scale: 100, suffix: "%" },
    diplomacy: { label: "annual relation", scale: 1, suffix: "" },
    legitimacy: { label: "legitimacy/year", scale: 1, suffix: "" },
    food: { label: "household food demand", scale: -100, suffix: "%" }
});

const MODIFIER_CAPS = Object.freeze({
    housing: 40,
    health: 25,
    morale: 3,
    tax: 0.3,
    trade: 0.25,
    research: 0.4,
    military: 0.35,
    diplomacy: 8,
    legitimacy: 0.5,
    food: 0.15
});

export const ENDEAVOUR_PATHS = Object.freeze([
    Object.freeze({
        id: "builder",
        label: "The King's Stone",
        focus: "Housing, sanitation and the shape of the capital",
        accent: "#8eaa7a",
        projects: Object.freeze([
            Object.freeze({
                id: "aqueduct", label: "Grand Aqueduct", description: "Bring clean water from the high valleys into every household.",
                cost: Object.freeze({ wood: 90, stone: 70, gold: 25 }), work: 48,
                effects: Object.freeze({ health: 4, food: 0.01 }), requires: null
            }),
            Object.freeze({
                id: "bathhouse", label: "Public Baths", description: "A civic bathhouse where the poor and the guilds share the same warm water.",
                cost: Object.freeze({ wood: 60, stone: 100, gold: 35 }), work: 56,
                effects: Object.freeze({ health: 4, morale: 0.3 }), requires: "aqueduct"
            }),
            Object.freeze({
                id: "pleasure-garden", label: "Royal Garden", description: "A walled garden, orchard and promenade that outlives its gardener.",
                cost: Object.freeze({ wood: 80, stone: 40, gold: 45 }), work: 64,
                effects: Object.freeze({ morale: 0.5, legitimacy: 0.02, food: 0.01 }), requires: "bathhouse"
            })
        ])
    }),
    Object.freeze({
        id: "warlord",
        label: "The Iron Crown",
        focus: "Garrison quality, border works and the economics of war",
        accent: "#c48a7a",
        projects: Object.freeze([
            Object.freeze({
                id: "arsenal", label: "Royal Arsenal", description: "Forges, stores and drill yards that turn raw recruits into a standing army.",
                cost: Object.freeze({ wood: 100, stone: 60, gold: 40 }), work: 48,
                effects: Object.freeze({ military: 0.03 }), requires: null
            }),
            Object.freeze({
                id: "border-citadel", label: "Border Citadel", description: "A fortified road-fort that watches the pass and answers raids before they reach the farms.",
                cost: Object.freeze({ wood: 60, stone: 130, gold: 50 }), work: 56,
                effects: Object.freeze({ military: 0.02, diplomacy: 0.5 }), requires: "arsenal"
            }),
            Object.freeze({
                id: "campaign-road", label: "Campaign Road", description: "A military road that moves grain, horses and reinforcements in the same season.",
                cost: Object.freeze({ wood: 120, stone: 40, gold: 35 }), work: 64,
                effects: Object.freeze({ military: 0.02, legitimacy: 0.01, food: 0.01 }), requires: "border-citadel"
            })
        ])
    }),
    Object.freeze({
        id: "diplomat",
        label: "The Silver Tongue",
        focus: "Envoys, treaties and the reputation of the crown abroad",
        accent: "#8f9ec4",
        projects: Object.freeze([
            Object.freeze({
                id: "chancery", label: "Royal Chancery", description: "A permanent corps of clerks, translators and envoys who remember every promise.",
                cost: Object.freeze({ wood: 80, stone: 50, gold: 55 }), work: 48,
                effects: Object.freeze({ diplomacy: 1.2 }), requires: null
            }),
            Object.freeze({
                id: "summit-hall", label: "Hall of Summits", description: "A neutral hall where rival crowns can meet without surrendering precedence.",
                cost: Object.freeze({ wood: 70, stone: 110, gold: 65 }), work: 56,
                effects: Object.freeze({ diplomacy: 0.8, legitimacy: 0.02 }), requires: "chancery"
            }),
            Object.freeze({
                id: "alliance-archive", label: "Archive of Alliances", description: "Every treaty, sealed letter and secret clause kept where no successor can lose it.",
                cost: Object.freeze({ wood: 70, stone: 80, gold: 60 }), work: 64,
                effects: Object.freeze({ diplomacy: 0.5, trade: 0.02 }), requires: "summit-hall"
            })
        ])
    }),
    Object.freeze({
        id: "merchant",
        label: "The Golden Ledger",
        focus: "Taxes, markets and the long chain of caravans",
        accent: "#d5b76e",
        projects: Object.freeze([
            Object.freeze({
                id: "exchange", label: "Merchants' Exchange", description: "A licensed exchange with public prices, honest weights and a royal clerk at the door.",
                cost: Object.freeze({ wood: 70, stone: 60, gold: 65 }), work: 48,
                effects: Object.freeze({ tax: 0.02 }), requires: null
            }),
            Object.freeze({
                id: "caravan-road", label: "Caravan Road", description: "Waystations, wells and guarded halts that cut the cost of every inland journey.",
                cost: Object.freeze({ wood: 110, stone: 50, gold: 45 }), work: 56,
                effects: Object.freeze({ trade: 0.03 }), requires: "exchange"
            }),
            Object.freeze({
                id: "royal-mint", label: "Royal Mint", description: "One coin, one weight, one crown. The mint makes the realm's money trustworthy abroad.",
                cost: Object.freeze({ stone: 90, gold: 80 }), work: 64,
                effects: Object.freeze({ tax: 0.025, trade: 0.01 }), requires: "caravan-road"
            })
        ])
    }),
    Object.freeze({
        id: "scholar",
        label: "The Open Book",
        focus: "Research, observation and the archive of the realm",
        accent: "#9aae9a",
        projects: Object.freeze([
            Object.freeze({
                id: "university", label: "Royal University", description: "Chairs of law, medicine and natural philosophy, open to any resident who can pass the gate.",
                cost: Object.freeze({ wood: 90, stone: 70, gold: 55 }), work: 48,
                effects: Object.freeze({ research: 0.05 }), requires: null
            }),
            Object.freeze({
                id: "observatory", label: "Observatory", description: "A tower of lenses and tables that turns the night sky into a calendar for farmers and sailors.",
                cost: Object.freeze({ wood: 50, stone: 100, gold: 70 }), work: 56,
                effects: Object.freeze({ research: 0.04, legitimacy: 0.015 }), requires: "university"
            }),
            Object.freeze({
                id: "archive", label: "Great Archive", description: "A fireproof archive where every discovery and every failure is kept for the next generation.",
                cost: Object.freeze({ wood: 80, stone: 60, gold: 50 }), work: 64,
                effects: Object.freeze({ research: 0.03, diplomacy: 0.4, legitimacy: 0.015 }), requires: "observatory"
            })
        ])
    })
]);

const PATH_BY_ID = new Map(ENDEAVOUR_PATHS.map(path => [path.id, path]));
const PROJECTS = ENDEAVOUR_PATHS.flatMap(path => path.projects.map(project => ({ ...project, path: path.id })));
const PROJECT_BY_ID = new Map(PROJECTS.map(project => [project.id, project]));

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const yearNow = () => Math.max(1, Math.floor(Number(state.year) || 1));

export function createEndeavoursState(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const completed = {};
    const rawCompleted = source.completed && typeof source.completed === "object" && !Array.isArray(source.completed) ? source.completed : {};
    for (const project of PROJECTS) {
        const count = Math.floor(Number(rawCompleted[project.id]) || 0);
        if (count > 0) completed[project.id] = Math.min(ENDEAVOUR_TIER_LIMIT, count);
    }
    let active = null;
    const rawActive = source.active && typeof source.active === "object" && !Array.isArray(source.active) ? source.active : null;
    if (rawActive) {
        const project = PROJECT_BY_ID.get(String(rawActive.projectId || ""));
        if (project) {
            const tier = clamp(Math.floor(Number(rawActive.tier) || (completed[project.id] || 0) + 1), 1, ENDEAVOUR_TIER_LIMIT);
            const required = Math.max(1, Number(rawActive.required) || requiredWork(project, tier));
            active = {
                projectId: project.id,
                tier,
                startedYear: Math.max(1, Math.floor(Number(rawActive.startedYear) || yearNow())),
                lastWorkYear: Math.max(0, Math.floor(Number(rawActive.lastWorkYear) || 0)),
                progress: Math.max(0, Math.min(required, Number(rawActive.progress) || 0)),
                required,
                funding: clamp(Math.floor(Number(rawActive.funding) || 0), 0, ENDEAVOUR_FUNDING.length - 1),
                overseerId: rawActive.overseerId ? clean(rawActive.overseerId, 100) : null,
                overseerName: clean(rawActive.overseerName || "The crown's own steward", 90),
                overseerSkill: clamp(rawActive.overseerSkill, 0, 100),
                lastWork: Math.max(0, Number(rawActive.lastWork) || 0),
                totalWork: Math.max(0, Number(rawActive.totalWork) || 0)
            };
        }
    }
    const history = Array.isArray(source.history) ? source.history.map(normalizeHistory).filter(Boolean).slice(0, HISTORY_LIMIT) : [];
    return {
        version: ENDEAVOUR_VERSION,
        active,
        completed,
        history,
        lastUpdateYear: Math.max(0, Math.floor(Number(source.lastUpdateYear) || 0))
    };
}

function normalizeHistory(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const project = PROJECT_BY_ID.get(String(entry.projectId || ""));
    if (!project) return null;
    return {
        projectId: project.id,
        label: clean(entry.label || project.label, 90),
        tier: clamp(Math.floor(Number(entry.tier) || 1), 1, ENDEAVOUR_TIER_LIMIT),
        year: Math.max(1, Math.floor(Number(entry.year) || 1)),
        kind: ["completed", "abandoned"].includes(entry.kind) ? entry.kind : "completed",
        overseerName: clean(entry.overseerName || "The crown's own steward", 90),
        effectsText: clean(entry.effectsText, 180)
    };
}

export function ensureEndeavours() {
    if (state.endeavours?.version === ENDEAVOUR_VERSION && state.endeavours.completed && Array.isArray(state.endeavours.history)) return state.endeavours;
    return normalizeEndeavoursState(state.endeavours);
}

export function normalizeEndeavoursState(input = state.endeavours) {
    state.endeavours = createEndeavoursState(input && typeof input === "object" ? input : {});
    return state.endeavours;
}

export function validateEndeavoursState(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Endeavours must be an object.");
    if (!input.completed || typeof input.completed !== "object" || Array.isArray(input.completed)) throw new Error("Endeavour completions are invalid.");
    for (const [id, count] of Object.entries(input.completed)) {
        if (!PROJECT_BY_ID.has(id)) throw new Error("Unknown endeavour project in save: " + id);
        if (!Number.isFinite(Number(count)) || Number(count) < 0 || Number(count) > ENDEAVOUR_TIER_LIMIT) throw new Error("Endeavour tier is invalid.");
    }
    if (input.active != null) {
        if (typeof input.active !== "object" || Array.isArray(input.active)) throw new Error("Active endeavour is invalid.");
        if (!PROJECT_BY_ID.has(String(input.active.projectId))) throw new Error("Active endeavour project is invalid.");
    }
    if (input.history != null && (!Array.isArray(input.history) || input.history.length > HISTORY_LIMIT)) throw new Error("Endeavour history is invalid.");
    return true;
}

export function projectTier(projectId, completed = ensureEndeavours().completed) {
    return Math.min(ENDEAVOUR_TIER_LIMIT, Math.floor(Number(completed?.[projectId]) || 0) + 1);
}

export function requiredWork(project, tier = projectTier(project.id)) {
    return Math.round(project.work * (1 + 0.35 * Math.max(0, tier - 1)));
}

export function projectCost(project, tier = projectTier(project.id)) {
    const scale = 1 + 0.55 * Math.max(0, tier - 1);
    return Object.fromEntries(Object.entries(project.cost).map(([key, value]) => [key, Math.ceil(value * scale)]));
}

export function effectsText(effects) {
    return Object.entries(effects || {}).map(([key, value]) => {
        const meta = EFFECT_LABELS[key] || { label: key, scale: 1, suffix: "" };
        const scaled = Number(value) * meta.scale;
        const shown = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        return (scaled >= 0 ? "+" : "") + shown + meta.suffix + " " + meta.label;
    }).join(" · ");
}

function projectStatus(project) {
    const completed = ensureEndeavours().completed;
    const tier = projectTier(project.id, completed);
    const previous = project.requires ? (completed[project.requires] || 0) : 1;
    const maxed = (completed[project.id] || 0) >= ENDEAVOUR_TIER_LIMIT;
    const locked = Boolean(project.requires && previous < 1);
    return { tier, maxed, locked, completed: completed[project.id] || 0 };
}

export function canAfford(cost) {
    return Object.entries(cost).every(([key, value]) => (Number(state.resources?.[key]) || 0) >= value);
}

function skillFor(person) {
    const traits = person?.traits || {};
    const experience = clamp((Number(person?.ageYears) - 18) * 0.8, 0, 30);
    return Math.round(clamp(
        (Number(traits.discipline) || 50) * 0.3 +
        (Number(traits.ambition) || 50) * 0.22 +
        (Number(traits.sociability) || 50) * 0.16 +
        (Number(traits.curiosity) || 50) * 0.14 +
        (Number(traits.piety) || 50) * 0.08 +
        experience,
        10, 98
    ));
}

export function getEndeavourCandidates() {
    const activeId = ensureEndeavours().active?.overseerId || null;
    return state.entities
        .filter(entity => !entity.dead && entity.type === 20 && !entity.isKing && String(entity.id) !== String(activeId))
        .map(entity => {
            const person = ensurePersonProfile(entity);
            return {
                personId: String(entity.personId || entity.id),
                name: person.name,
                ageYears: Math.floor(Number(person.ageYears) || 0),
                species: person.species,
                skill: skillFor(person)
            };
        })
        .filter(entry => entry.ageYears >= 16)
        .sort((a, b) => b.skill - a.skill || a.name.localeCompare(b.name))
        .slice(0, 24);
}

export function startEndeavour(projectId, { overseerId = null, funding = 0 } = {}) {
    const endeavours = ensureEndeavours();
    if (endeavours.active) return { ok: false, reason: "another-endeavour-is-underway" };
    const project = PROJECT_BY_ID.get(String(projectId));
    if (!project) return { ok: false, reason: "unknown-endeavour" };
    const status = projectStatus(project);
    if (status.maxed) return { ok: false, reason: "this-work-is-mastered" };
    if (status.locked) return { ok: false, reason: "complete-the-earlier-work-first" };
    const tier = status.tier;
    const cost = projectCost(project, tier);
    if (!canAfford(cost)) return { ok: false, reason: "the-royal-stores-cannot-pay-for-this" };
    const candidates = getEndeavourCandidates();
    const chosen = (overseerId && candidates.find(entry => entry.personId === String(overseerId))) || candidates[0] || null;
    const fundingLevel = clamp(Math.floor(Number(funding) || 0), 0, ENDEAVOUR_FUNDING.length - 1);
    for (const [key, value] of Object.entries(cost)) addResource(key, -value);
    const required = requiredWork(project, tier);
    const overseer = chosen ? chosen.name : "The crown's own steward";
    endeavours.active = {
        projectId: project.id,
        tier,
        startedYear: yearNow(),
        lastWorkYear: yearNow() - 1,
        progress: 0,
        required,
        funding: fundingLevel,
        overseerId: chosen?.personId || null,
        overseerName: overseer,
        overseerSkill: chosen?.skill || 35,
        lastWork: 0,
        totalWork: 0
    };
    recordLegacy("endeavour", "Crown Endeavour Begun — " + project.label,
        overseer + " takes charge of the " + project.label.toLowerCase() + " in year " + yearNow() + ".", { importance: 1 });
    return { ok: true, project, active: { ...endeavours.active }, cost };
}

export function updateEndeavours() {
    const endeavours = ensureEndeavours();
    const year = yearNow();
    if (endeavours.lastUpdateYear >= year) return null;
    const modifiers = getEndeavourModifiers();
    if (modifiers.legitimacy > 0 && state.politics && Number.isFinite(Number(state.politics.legitimacy))) {
        state.politics.legitimacy = clamp(Number(state.politics.legitimacy) + modifiers.legitimacy, 0, 100);
    }
    endeavours.lastUpdateYear = year;
    const active = endeavours.active;
    if (!active) return null;
    const project = PROJECT_BY_ID.get(active.projectId);
    if (!project) {
        endeavours.active = null;
        return null;
    }
    const funding = ENDEAVOUR_FUNDING[active.funding] || ENDEAVOUR_FUNDING[0];
    const gold = Math.max(0, Number(state.resources?.gold) || 0);
    const paid = Math.min(gold, funding.gold);
    if (paid > 0) addResource("gold", -paid);
    const paidRatio = funding.gold > 0 ? paid / funding.gold : 1;
    const overseer = active.overseerId
        ? state.entities.find(entity => !entity.dead && String(entity.personId || entity.id) === String(active.overseerId))
        : null;
    const overseerPresent = Boolean(overseer);
    const skill = overseerPresent ? skillFor(ensurePersonProfile(overseer)) : active.overseerSkill * 0.45;
    const path = PATH_BY_ID.get(project.path);
    const pathCompleted = path.projects.reduce((sum, entry) => sum + (endeavours.completed[entry.id] || 0), 0);
    const work = Math.max(0, (7 + skill * 0.11) * funding.multiplier * Math.max(0.35, paidRatio) * (1 + Math.min(0.25, pathCompleted * 0.008)));
    active.progress = Math.min(active.required, active.progress + work);
    active.lastWork = Math.round(work * 10) / 10;
    active.totalWork = Math.round((active.totalWork + work) * 10) / 10;
    active.lastWorkYear = year;
    active.overseerSkill = Math.round(skill);
    if (active.progress < active.required) return { completed: null, work: active.lastWork, progress: active.progress, required: active.required };

    const completedTier = active.tier;
    endeavours.completed[project.id] = Math.min(ENDEAVOUR_TIER_LIMIT, (endeavours.completed[project.id] || 0) + 1);
    const summary = effectsText(project.effects);
    endeavours.history.unshift({
        projectId: project.id,
        label: project.label,
        tier: completedTier,
        year,
        kind: "completed",
        overseerName: active.overseerName,
        effectsText: summary
    });
    if (endeavours.history.length > HISTORY_LIMIT) endeavours.history.length = HISTORY_LIMIT;
    endeavours.active = null;
    state.morale = clamp(Number(state.morale) + 2, 0, 100);
    if (state.politics && Number.isFinite(Number(state.politics.legitimacy))) {
        state.politics.legitimacy = clamp(Number(state.politics.legitimacy) + 0.4, 0, 100);
    }
    try {
        recordLegacy("endeavour", "Crown Endeavour Complete — " + project.label,
            "Tier " + completedTier + " finished in year " + year + ". " + summary + ".", { importance: 2 });
    } catch {
        // A chronicle failure must not undo a completed project.
    }
    return { completed: project, tier: completedTier, effectsText: summary, work: active.lastWork };
}

export function abandonEndeavour() {
    const endeavours = ensureEndeavours();
    const active = endeavours.active;
    if (!active) return { ok: false, reason: "no-endeavour-is-underway" };
    const project = PROJECT_BY_ID.get(active.projectId);
    endeavours.history.unshift({
        projectId: active.projectId,
        label: project?.label || active.projectId,
        tier: active.tier,
        year: yearNow(),
        kind: "abandoned",
        overseerName: active.overseerName,
        effectsText: "The crown set the work aside."
    });
    if (endeavours.history.length > HISTORY_LIMIT) endeavours.history.length = HISTORY_LIMIT;
    endeavours.active = null;
    return { ok: true };
}

export function setEndeavourFunding(level) {
    const endeavours = ensureEndeavours();
    if (!endeavours.active) return { ok: false, reason: "no-endeavour-is-underway" };
    const next = clamp(Math.floor(Number(level) || 0), 0, ENDEAVOUR_FUNDING.length - 1);
    if (endeavours.active.funding === next) return { ok: false, reason: "already-selected" };
    endeavours.active.funding = next;
    return { ok: true, funding: next };
}

export function setEndeavourOverseer(personId) {
    const endeavours = ensureEndeavours();
    if (!endeavours.active) return { ok: false, reason: "no-endeavour-is-underway" };
    const candidate = getEndeavourCandidates().find(entry => entry.personId === String(personId));
    if (!candidate) return { ok: false, reason: "overseer-not-available" };
    endeavours.active.overseerId = candidate.personId;
    endeavours.active.overseerName = candidate.name;
    endeavours.active.overseerSkill = candidate.skill;
    return { ok: true, overseer: candidate };
}

let modifierCache = { signature: "", value: null };

export function getEndeavourModifiers() {
    const endeavours = ensureEndeavours();
    const signature = Object.entries(endeavours.completed).sort().map(([id, count]) => id + ":" + count).join("|");
    if (modifierCache.signature === signature && modifierCache.value) return modifierCache.value;
    const totals = { housing: 0, health: 0, morale: 0, tax: 0, trade: 0, research: 0, military: 0, diplomacy: 0, legitimacy: 0, food: 0 };
    for (const project of PROJECTS) {
        const count = Number(endeavours.completed[project.id]) || 0;
        if (!count) continue;
        for (const [key, value] of Object.entries(project.effects)) {
            if (!(key in totals)) continue;
            totals[key] += Number(value) * count;
        }
    }
    for (const key of Object.keys(totals)) totals[key] = clamp(totals[key], 0, MODIFIER_CAPS[key]);
    const completed = PROJECTS.reduce((sum, project) => sum + (Number(endeavours.completed[project.id]) || 0), 0);
    const value = { ...totals, completed, paths: ENDEAVOUR_PATHS.length };
    modifierCache = { signature, value };
    return value;
}

export function getEndeavourSnapshot() {
    const endeavours = ensureEndeavours();
    const modifiers = getEndeavourModifiers();
    const activeProject = endeavours.active ? PROJECT_BY_ID.get(endeavours.active.projectId) : null;
    const paths = ENDEAVOUR_PATHS.map(path => {
        const completedInPath = path.projects.reduce((sum, project) => sum + (endeavours.completed[project.id] || 0), 0);
        const projects = path.projects.map(project => {
            const status = projectStatus(project);
            const cost = projectCost(project, status.tier);
            const affordable = canAfford(cost);
            return {
                ...project,
                path: path.id,
                ...status,
                cost,
                affordable,
                required: requiredWork(project, status.tier),
                effectsText: effectsText(project.effects),
                startable: !status.maxed && !status.locked && affordable && !endeavours.active
            };
        });
        return {
            id: path.id,
            label: path.label,
            focus: path.focus,
            accent: path.accent,
            completed: completedInPath,
            maximum: path.projects.length * ENDEAVOUR_TIER_LIMIT,
            projects
        };
    });
    const funding = ENDEAVOUR_FUNDING[endeavours.active?.funding || 0];
    return {
        active: endeavours.active ? {
            ...endeavours.active,
            project: activeProject,
            percent: Math.round((endeavours.active.progress / Math.max(1, endeavours.active.required)) * 100),
            fundingDetails: funding,
            overseerPresent: Boolean(endeavours.active.overseerId && state.entities.some(entity => !entity.dead && String(entity.personId || entity.id) === String(endeavours.active.overseerId))),
            effectsText: activeProject ? effectsText(activeProject.effects) : ""
        } : null,
        paths,
        candidates: getEndeavourCandidates(),
        fundingLevels: ENDEAVOUR_FUNDING,
        modifiers,
        history: endeavours.history.slice(0, 12),
        totalCompleted: modifiers.completed,
        tierLimit: ENDEAVOUR_TIER_LIMIT
    };
}
