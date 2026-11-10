// Shared realm event log. Kept in core so domain systems can record a visible
// event without importing the event generator (and creating an import cycle).
import { state } from "./state.js";

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
    return entry;
}
