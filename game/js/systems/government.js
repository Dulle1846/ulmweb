// Player-facing government policies with persistent fiscal and political consequences.
import { state } from "../core/state.js";
import { applyPoliticalEffects } from "./politics.js";

export const TAX_POLICIES = Object.freeze({
    light: { label: "Light taxes", multiplier: 0.75, effects: { legitimacy: 0.8, commons: 2, nobility: -1, guilds: 1 } },
    standard: { label: "Standard taxes", multiplier: 1, effects: {} },
    heavy: { label: "Heavy taxes", multiplier: 1.35, effects: { legitimacy: -1, commons: -3, nobility: 2, guilds: -2 } }
});
export const ROYAL_AUDIENCE_COST = 12;
export const ROYAL_AUDIENCE_COOLDOWN = 2;

export function normalizeGovernment(input = state.government) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const taxPolicy = Object.hasOwn(TAX_POLICIES, source.taxPolicy) ? source.taxPolicy : "standard";
    state.government = {
        taxPolicy,
        lastAudienceYear: Math.max(0, Math.min(1000000, Math.floor(Number(source.lastAudienceYear) || 0))),
        decreesIssued: Math.max(0, Math.min(1000000, Math.floor(Number(source.decreesIssued) || 0)))
    };
    return state.government;
}

export function getGovernmentSnapshot() {
    const government = normalizeGovernment();
    const policy = TAX_POLICIES[government.taxPolicy];
    return {
        taxPolicy: government.taxPolicy,
        taxLabel: policy.label,
        taxMultiplier: policy.multiplier,
        lastAudienceYear: government.lastAudienceYear,
        decreesIssued: government.decreesIssued,
        audienceCost: ROYAL_AUDIENCE_COST,
        audienceAvailable: government.lastAudienceYear === 0 ||
            Math.max(1, Number(state.year) || 1) - government.lastAudienceYear >= ROYAL_AUDIENCE_COOLDOWN
    };
}

export function setTaxPolicy(policyId) {
    if (!Object.hasOwn(TAX_POLICIES, policyId)) return { ok: false, reason: "invalid-tax-policy" };
    const government = normalizeGovernment();
    if (government.taxPolicy === policyId) return { ok: true, changed: false, policy: TAX_POLICIES[policyId] };
    government.taxPolicy = policyId;
    government.decreesIssued = Math.min(1000000, government.decreesIssued + 1);
    const policy = TAX_POLICIES[policyId];
    applyPoliticalEffects(policy.effects);
    return { ok: true, changed: true, policy };
}

export function holdRoyalAudience() {
    const government = normalizeGovernment();
    const year = Math.max(1, Math.floor(Number(state.year) || 1));
    if (government.lastAudienceYear > 0 && year - government.lastAudienceYear < ROYAL_AUDIENCE_COOLDOWN) {
        return { ok: false, reason: "audience-cooldown" };
    }
    if (!Number.isFinite(Number(state.resources?.gold)) || state.resources.gold < ROYAL_AUDIENCE_COST) {
        return { ok: false, reason: "insufficient-gold" };
    }
    state.resources.gold -= ROYAL_AUDIENCE_COST;
    government.lastAudienceYear = year;
    const politics = state.politics || {};
    const factions = politics.factions || {};
    const weakest = ["commons", "nobility", "guilds", "clergy"]
        .sort((a, b) => Number(factions[a] || 0) - Number(factions[b] || 0))[0];
    applyPoliticalEffects({ legitimacy: 2, [weakest]: 4 });
    return { ok: true, weakestFaction: weakest, cost: ROYAL_AUDIENCE_COST };
}
