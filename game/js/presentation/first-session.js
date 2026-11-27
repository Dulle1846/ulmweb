// A compact, read-only first-session checklist derived from existing state.
// It never grants rewards or introduces a second progression track. The NEXT
// marker follows the same live counsel as the realm's NEXT MOVE so a new
// player is never told to build two different things at once.
import { state } from "../core/state.js";
import { getAmbitionSnapshot } from "../systems/ambitions.js";
import { getCoreCounsel } from "./core-counsel.js";

export const FIRST_SESSION_STEPS = Object.freeze([
    Object.freeze({ id: "founded", label: "Found your realm" }),
    Object.freeze({ id: "house", label: "Build your first house" }),
    Object.freeze({ id: "road", label: "Lay your first road" }),
    Object.freeze({ id: "card", label: "Draw your first card" }),
    Object.freeze({ id: "ambition", label: "Complete your first ambition" })
]);

function safeNumber(value) {
    return Math.max(0, Number(value) || 0);
}

function ledgerNumber(value) {
    const amount = Number(value) || 0;
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function ledgerBrief(ledger) {
    if (!ledger || typeof ledger !== "object") return "";
    const net = Number(ledger.netGold) || 0;
    return "LAST 20-DAY SETTLEMENT · " + ledgerNumber(ledger.foodInflow) + " food in · " +
        ledgerNumber(ledger.foodConsumed) + " eaten · " + ledgerNumber(ledger.foodSpoiled) + " spoiled · " +
        (net >= 0 ? "+" : "") + ledgerNumber(net) + " gold net after " +
        ledgerNumber(ledger.wagesPaid) + " wages and " + ledgerNumber(ledger.upkeepPaid) + " upkeep";
}

export function getFirstSessionSnapshot() {
    const statistics = state.statistics || {};
    const ambition = getAmbitionSnapshot();
    const completedAmbitions = Math.max(0, Number(ambition.completedCount) || 0);
    const done = {
        founded: Boolean(state.hasStarted),
        house: safeNumber(statistics.totalHousesBuilt) > 0,
        road: safeNumber(statistics.totalRoadTilesBuilt) > 0,
        card: safeNumber(statistics.totalCardsDrawn) > 0,
        ambition: completedAmbitions > 0
    };
    const detail = {
        founded: state.hasStarted
            ? (state.kingdomName || "New Realm") + " · YEAR " + safeNumber(state.year)
            : "No realm founded yet",
        house: safeNumber(statistics.totalHousesBuilt) + " built",
        road: safeNumber(statistics.totalRoadTilesBuilt) + " road tiles",
        card: safeNumber(statistics.totalCardsDrawn) + " drawn · " + safeNumber(state.hand?.length) + " in hand",
        ambition: completedAmbitions + " / " + safeNumber(ambition.total) + " completed · " + (ambition.title || "royal ledger")
    };
    const items = FIRST_SESSION_STEPS.map(step => ({
        ...step,
        done: Boolean(done[step.id]),
        detail: detail[step.id]
    }));
    const completed = items.filter(item => item.done).length;
    const allComplete = completed === items.length;
    const counsel = getCoreCounsel(state);
    const mapped = !allComplete && counsel.stepId
        ? items.find(item => item.id === counsel.stepId && !item.done) || null
        : null;
    // A steady realm simply continues with the first open milestone. A live
    // survival need (food, morale) is not one of the five milestones, so the
    // checklist stops claiming a NEXT step and names the realm need instead.
    const fallback = !allComplete && !mapped && counsel.id === "steady"
        ? items.find(item => !item.done) || null
        : null;
    const current = mapped || fallback;
    const needText = !allComplete && !current && counsel.id !== "found" && counsel.id !== "steady"
        ? counsel.text
        : null;
    const continuationText = allComplete &&
        (counsel.id === "scenario" || counsel.id === "next-ambition" || counsel.id === "campaign" || counsel.id === "council" || counsel.id === "envoy-mission" || counsel.id === "expedition-chain") &&
        counsel.text && counsel.evidence
        ? counsel.text + " · " + counsel.evidence
        : null;
    return {
        items,
        completed,
        total: items.length,
        allComplete,
        currentId: current ? current.id : null,
        currentDetail: current ? (counsel.evidence || current.detail) : null,
        counselId: counsel.id,
        needText,
        continuationText,
        ledgerBrief: ledgerBrief(state.economy?.lastLedger)
    };
}
