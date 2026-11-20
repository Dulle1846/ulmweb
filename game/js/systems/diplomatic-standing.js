// Diplomatic standing: the age of the present treaty, war or peace.
//
// Every trade pact, alliance, declaration of war and peace deal already writes
// realm.treatySinceYear, but before this module nothing ever read it. A
// twenty-year alliance therefore behaved exactly like one signed last spring:
// the same annual aid, the same prices and the same border risk. This reading
// turns that saved year into one bounded value that the annual court and the
// market can act on.
//
// The whole link is one subtraction per realm. No entity scan, no per-frame
// work and no new state: the year is already persisted, so a save keeps its
// clock across a reload. A legacy treaty that never recorded a year reads as
// zero years (neutral) until the next annual court starts its clock.
import { state } from "../core/state.js";

export const DIPLOMATIC_STANDING_VERSION = 1;
export const STANDING_YEAR_LIMIT = 20;
export const STANDING_TRADE_LIMIT = 0.03;
export const STANDING_TRUST_LIMIT = 0.6;
export const STANDING_INCIDENT_RELIEF = 4;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const integer = (value, min = 0, max = 1_000_000) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
const round = (value, places = 3) => {
    const scale = 10 ** places;
    return Math.round((Number(value) || 0) * scale) / scale;
};

export const STANDING_TIERS = Object.freeze([
    Object.freeze({ id: "new", label: "NEW", min: 0 }),
    Object.freeze({ id: "steady", label: "STEADY", min: 4 }),
    Object.freeze({ id: "settled", label: "SETTLED", min: 10 }),
    Object.freeze({ id: "entente", label: "ENTENTE", min: 16 })
]);

function tierFor(years) {
    let tier = STANDING_TIERS[0];
    for (const entry of STANDING_TIERS) if (years >= entry.min) tier = entry;
    return tier;
}

// A future "since" year is a forged or clock-shifted record, not a treaty that
// began before the realm did. Treat it as zero standing instead of inflating it.
export function getStandingYears(realm, year = state.year) {
    const current = Math.max(1, Math.floor(Number(year) || 1));
    const since = integer(realm?.treatySinceYear, 0);
    if (since <= 0 || since > current) return 0;
    return Math.min(STANDING_YEAR_LIMIT, current - since);
}

// One bounded reading per realm. The trade bonus and trust gain both grow with
// the same capped year count, so a very old save cannot compound without limit.
export function getDiplomaticStanding(realm, year = state.year) {
    const treaty = String(realm?.treaty || "none");
    const war = treaty === "war";
    const years = war ? 0 : getStandingYears(realm, year);
    const tier = tierFor(years);
    const tradeBonus = war ? 0 : round(Math.min(STANDING_TRADE_LIMIT, years * 0.0015), 4);
    const trustGain = war ? 0 : round(Math.min(STANDING_TRUST_LIMIT, years * 0.03), 3);
    const incidentRelief = war ? 0 : round(Math.min(STANDING_INCIDENT_RELIEF, years * 0.2), 2);
    return {
        version: DIPLOMATIC_STANDING_VERSION,
        treaty,
        years,
        capped: years >= STANDING_YEAR_LIMIT,
        tier: tier.id,
        tierLabel: tier.label,
        tradeBonus,
        trustGain,
        incidentRelief,
        // Alliances already pay annual aid; standing adds a small, capped raise
        // so a long peace is felt in the treasury as well as in the ledger.
        allianceGold: treaty === "alliance" ? Math.min(3, Math.floor(years / 6)) : 0,
        allianceFood: treaty === "alliance" ? Math.min(4, Math.floor(years / 5)) : 0
    };
}

export function describeStanding(standing = {}) {
    const years = integer(standing.years, 0, STANDING_YEAR_LIMIT);
    if (standing.treaty === "war") return "War resets the clock; no standing accrues while the war lasts.";
    if (!years) return "Signed this year. Standing starts with the next annual court.";
    const yearsText = years === 1 ? "1 year" : years + " years";
    return "Held for " + yearsText + ": +" + Number(standing.trustGain || 0).toFixed(2) +
        " trust a year, " + (Number(standing.tradeBonus || 0) * 100).toFixed(1) +
        "% better buy and sell terms, border incidents " + Number(standing.incidentRelief || 0).toFixed(1) +
        " points less likely. War resets this clock.";
}
