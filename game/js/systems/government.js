// Player-facing constitutional choices with persistent, measurable realm effects.
import { state } from "../core/state.js";
import { applyPoliticalEffects, getPoliticalSnapshot } from "./politics.js";
import { addLog } from "./events.js";

export const GOVERNMENT_FORMS = Object.freeze({
    feudal_monarchy: {
        label: "Feudal monarchy",
        description: "The crown relies on noble houses and inherited privileges.",
        effects: { legitimacy: 1, nobility: 5, commons: -1, guilds: 0, clergy: 1 }
    },
    council_monarchy: {
        label: "Crowned council",
        description: "A royal council shares influence with the crown and chartered estates.",
        effects: { legitimacy: 2, nobility: -1, commons: 2, guilds: 3, clergy: 0 }
    },
    elective_monarchy: {
        label: "Elective crown",
        description: "Great estates confirm the monarch; consent matters more than blood alone.",
        effects: { legitimacy: 3, nobility: 3, commons: 1, guilds: 0, clergy: -1 }
    }
});

export const TAX_POLICIES = Object.freeze({
    light: { label: "Light", rate: 0.75, effects: { legitimacy: 1, commons: 3, nobility: 0, guilds: 1, clergy: 0 } },
    standard: { label: "Standard", rate: 1, effects: { legitimacy: 0, commons: 0, nobility: 0, guilds: 0, clergy: 0 } },
    heavy: { label: "Heavy", rate: 1.3, effects: { legitimacy: -2, commons: -5, nobility: 1, guilds: -2, clergy: 0 } }
});

export const LAW_CODES = Object.freeze({
    customary: { label: "Customary law", effects: { legitimacy: 1, commons: 0, nobility: 2, guilds: 0, clergy: 1 } },
    charter: { label: "Chartered rights", effects: { legitimacy: 2, commons: 3, nobility: -1, guilds: 3, clergy: 0 } },
    royal: { label: "Royal ordinances", effects: { legitimacy: -1, commons: -2, nobility: 0, guilds: -1, clergy: 0 } }
});

const DEFAULT_GOVERNMENT = Object.freeze({
    form: "feudal_monarchy",
    taxPolicy: "standard",
    lawCode: "customary",
    taxRate: 1,
    decisionsMade: 0,
    lastDecisionYear: 1
});
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value))
    ? Math.max(min, Math.min(max, Number(value))) : fallback;

export function normalizeGovernment(input = state.government) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const taxPolicy = Object.hasOwn(TAX_POLICIES, source.taxPolicy) ? source.taxPolicy : DEFAULT_GOVERNMENT.taxPolicy;
    state.government = {
        form: Object.hasOwn(GOVERNMENT_FORMS, source.form) ? source.form : DEFAULT_GOVERNMENT.form,
        taxPolicy,
        lawCode: Object.hasOwn(LAW_CODES, source.lawCode) ? source.lawCode : DEFAULT_GOVERNMENT.lawCode,
        taxRate: clamp(source.taxRate, 0.5, 1.5, TAX_POLICIES[taxPolicy].rate),
        decisionsMade: Math.floor(clamp(source.decisionsMade, 0, 1000000, 0)),
        lastDecisionYear: Math.floor(clamp(source.lastDecisionYear, 1, 1000000, 1))
    };
    return state.government;
}

function recordChange(label, effects) {
    applyPoliticalEffects(effects);
    const government = normalizeGovernment();
    government.decisionsMade++;
    government.lastDecisionYear = Math.max(1, Math.floor(Number(state.year) || 1));
    addLog("ROYAL DECREE: " + label, "#e4bd72", "politics");
    return { ok: true, government: { ...government }, politics: getPoliticalSnapshot() };
}

export function setGovernmentForm(form) {
    if (!Object.hasOwn(GOVERNMENT_FORMS, form)) return { ok: false, reason: "unknown-government-form" };
    const government = normalizeGovernment();
    if (government.form === form) return { ok: false, reason: "already-selected" };
    government.form = form;
    return recordChange(GOVERNMENT_FORMS[form].label, GOVERNMENT_FORMS[form].effects);
}

export function setTaxPolicy(policy) {
    if (!Object.hasOwn(TAX_POLICIES, policy)) return { ok: false, reason: "unknown-tax-policy" };
    const government = normalizeGovernment();
    if (government.taxPolicy === policy) return { ok: false, reason: "already-selected" };
    government.taxPolicy = policy;
    government.taxRate = TAX_POLICIES[policy].rate;
    return recordChange("Tax policy: " + TAX_POLICIES[policy].label, TAX_POLICIES[policy].effects);
}

export function setLawCode(code) {
    if (!Object.hasOwn(LAW_CODES, code)) return { ok: false, reason: "unknown-law-code" };
    const government = normalizeGovernment();
    if (government.lawCode === code) return { ok: false, reason: "already-selected" };
    government.lawCode = code;
    return recordChange("Law code: " + LAW_CODES[code].label, LAW_CODES[code].effects);
}

export function getGovernmentSnapshot() {
    const government = normalizeGovernment();
    return {
        ...government,
        formLabel: GOVERNMENT_FORMS[government.form].label,
        taxLabel: TAX_POLICIES[government.taxPolicy].label,
        lawLabel: LAW_CODES[government.lawCode].label,
        political: getPoliticalSnapshot()
    };
}

export const ROYAL_DECISIONS = Object.freeze({
    grain_relief: {
        label: "Fund grain relief",
        description: "Spend food reserves to calm the commons and restore confidence.",
        cost: { food: 12 },
        effects: { legitimacy: 3, commons: 8, nobility: -1, guilds: 0, clergy: 1 },
        morale: 3
    },
    guild_charter: {
        label: "Grant a guild charter",
        description: "Spend royal gold to recognize guild privileges and stimulate trade.",
        cost: { gold: 10 },
        effects: { legitimacy: 2, commons: 1, nobility: -3, guilds: 9, clergy: 0 },
        morale: 1
    },
    noble_privilege: {
        label: "Confirm noble privileges",
        description: "Strengthen noble loyalty at the cost of popular confidence.",
        cost: {},
        effects: { legitimacy: -1, commons: -5, nobility: 9, guilds: -1, clergy: 1 },
        morale: -1
    },
    temple_festival: {
        label: "Sponsor a temple festival",
        description: "Spend food on a public celebration that wins clergy and popular support.",
        cost: { food: 8 },
        effects: { legitimacy: 1, commons: 3, nobility: 0, guilds: 0, clergy: 8 },
        morale: 3
    }
});

export function resolveRoyalDecision(decisionId) {
    const decision = ROYAL_DECISIONS[decisionId];
    if (!decision) return { ok: false, reason: "unknown-decision" };
    for (const [resource, amount] of Object.entries(decision.cost)) {
        if (!Number.isFinite(Number(state.resources?.[resource])) || state.resources[resource] < amount) {
            return { ok: false, reason: "insufficient-" + resource };
        }
    }
    for (const [resource, amount] of Object.entries(decision.cost)) state.resources[resource] -= amount;
    const politics = applyPoliticalEffects(decision.effects);
    state.morale = Math.max(0, Math.min(100, Number(state.morale || 0) + decision.morale));
    const government = normalizeGovernment();
    government.decisionsMade++;
    government.lastDecisionYear = Math.max(1, Math.floor(Number(state.year) || 1));
    addLog("ROYAL DECISION: " + decision.label, "#e4bd72", "politics");
    return { ok: true, politics, morale: state.morale };
}
