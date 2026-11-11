// A compact, read-only first-session checklist derived from existing state.
// It never grants rewards or introduces a second progression track.
import { state } from "../core/state.js";
import { getAmbitionSnapshot } from "../systems/ambitions.js";

export const FIRST_SESSION_STEPS = Object.freeze([
    Object.freeze({ id: "founded", label: "Found your realm" }),
    Object.freeze({ id: "house", label: "Build your first house" }),
    Object.freeze({ id: "road", label: "Lay your first road" }),
    Object.freeze({ id: "card", label: "Draw your first card" }),
    Object.freeze({ id: "ambition", label: "Complete your first ambition" })
]);

export function getFirstSessionSnapshot() {
    const statistics = state.statistics || {};
    const completedAmbitions = Math.max(0, Number(getAmbitionSnapshot().completedCount) || 0);
    const done = {
        founded: Boolean(state.hasStarted),
        house: (Number(statistics.totalHousesBuilt) || 0) > 0,
        road: (Number(statistics.totalRoadTilesBuilt) || 0) > 0,
        card: (Number(statistics.totalCardsDrawn) || 0) > 0,
        ambition: completedAmbitions > 0
    };
    const items = FIRST_SESSION_STEPS.map(step => ({ ...step, done: Boolean(done[step.id]) }));
    const completed = items.filter(item => item.done).length;
    return { items, completed, total: items.length, allComplete: completed === items.length };
}
