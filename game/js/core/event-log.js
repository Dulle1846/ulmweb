// Shared realm event log. Kept in core so domain systems can record a visible
// event without importing the event generator (and creating an import cycle).
import { state } from "./state.js";
import { appendTimelineEvent } from "./event-timeline.js";

const TIMELINE_CATEGORY = Object.freeze({
    realm: "COURT", dynasty: "COURT", issue: "COURT", resolution: "COURT",
    family: "PEOPLE", population: "PEOPLE", death: "PEOPLE", health: "DISASTER",
    military: "WAR", warfare: "WAR", raid: "WAR", diplomacy: "COURT",
    economy: "ECONOMY", trade: "ECONOMY", faith: "FAITH", justice: "COURT",
    nature: "NATURE", weather: "NATURE", disaster: "DISASTER", creature: "NATURE",
    chronicle: "COURT", milestone: "COURT"
});

function timelineSeverity(kind) {
    if (kind === "milestone" || kind === "dynasty" || kind === "warfare" || kind === "raid") return 3;
    if (kind === "death" || kind === "issue" || kind === "resolution" || kind === "military") return 2;
    return 1;
}

// Existing world events are part of the same living archive. The short event
// log remains the HUD/inbox queue; this bridge gives it a durable timeline page.
function appendWorldTimeline(text, kind) {
    if (!state.eventTimeline || typeof state.eventTimeline !== "object") return;
    const label = String(text || "A realm event").replace(/\s+/g, " ").trim();
    if (!label) return;
    const entry = appendTimelineEvent(state.eventTimeline, {
        tick: Number(state.tick) || 0,
        year: Math.max(1, Number(state.year) || 1),
        day: Math.min(400, Math.max(1, (Number(state.dayOfYear) || 0) + 1)),
        category: TIMELINE_CATEGORY[kind] || "COURT",
        severity: timelineSeverity(kind),
        title: label.slice(0, 96).toUpperCase(),
        text: label,
        location: "the realm",
        participants: [],
        templateId: "event-log:" + kind,
        source: "simulation"
    });
    return entry;
}

export function addLog(text, color = "#a3a3a3", kind = "realm") {
    const entry = {
        id: ++state.eventSequence,
        text: String(text),
        color,
        tick: state.tick,
        kind
    };
    state.eventLog.unshift(entry);
    if (state.eventLog.length > 100) state.eventLog.length = 100;
    // Save/load notifications are UI bookkeeping, not events in the living world.
    if (kind !== "system") appendWorldTimeline(text, kind);
    return entry;
}
