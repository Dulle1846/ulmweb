// Persistent, bounded history of the small events that make up a reign.
// This module is DOM-free: the simulation appends records, the presentation
// layer reads them, and the save pipeline stores a compact normalized copy.

export const MAX_TIMELINE_EVENTS = 2400;
export const TIMELINE_CATEGORIES = Object.freeze([
    "COURT", "WAR", "DISASTER", "NATURE", "ECONOMY", "FAITH", "PEOPLE", "OMENS", "EXPLORATION"
]);
export const TIMELINE_CATEGORY_LABELS = Object.freeze({
    COURT: "Court", WAR: "War", DISASTER: "Disaster", NATURE: "Nature",
    ECONOMY: "Economy", FAITH: "Faith", PEOPLE: "People", OMENS: "Omens",
    EXPLORATION: "Exploration"
});
const CATEGORY_SET = new Set(TIMELINE_CATEGORIES);
const RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold", "food"]);
const SEASONS = Object.freeze(["Spring", "Summer", "Autumn", "Winter"]);

function finiteInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}
function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function clampText(value, limit) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}
function round(value, places = 2) {
    const scale = 10 ** places;
    return Math.round((Number(value) || 0) * scale) / scale;
}
function normalizeParticipant(value) {
    if (!value) return null;
    if (typeof value === "string") {
        const name = clampText(value, 64);
        return name ? { personId: null, name, role: "witness" } : null;
    }
    if (typeof value !== "object" || Array.isArray(value)) return null;
    const name = clampText(value.name, 64);
    if (!name) return null;
    return {
        personId: value.personId == null ? null : clampText(value.personId, 80),
        name,
        role: clampText(value.role || "witness", 40)
    };
}
function normalizeParticipants(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const item of value) {
        const participant = normalizeParticipant(item);
        if (!participant) continue;
        const key = participant.personId || participant.name;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(participant);
        if (result.length >= 4) break;
    }
    return result;
}
function normalizeImpact(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const resources = {};
    if (value.resources && typeof value.resources === "object" && !Array.isArray(value.resources)) {
        for (const key of RESOURCE_KEYS) {
            const amount = Number(value.resources[key]);
            if (Number.isFinite(amount) && amount !== 0) resources[key] = round(amount);
        }
    }
    const morale = Number(value.morale);
    const impact = {
        morale: Number.isFinite(morale) && morale !== 0 ? round(morale) : 0,
        resources,
        summary: clampText(value.summary || "", 180)
    };
    if (!impact.morale && !Object.keys(impact.resources).length && !impact.summary) return null;
    return impact;
}
function normalizeEvent(value, fallbackSequence = 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const tick = finiteInt(value.tick);
    const year = Math.max(1, finiteInt(value.year, 1));
    const day = Math.min(400, Math.max(1, finiteInt(value.day, 1)));
    const sequence = finiteInt(value.sequence, fallbackSequence);
    const id = clampText(value.id || ("evt-" + tick + "-" + sequence), 80);
    if (!id) return null;
    const category = CATEGORY_SET.has(String(value.category)) ? String(value.category) : "COURT";
    return {
        id,
        sequence,
        tick,
        year,
        day,
        category,
        severity: Math.max(1, Math.min(3, finiteInt(value.severity, 1))),
        title: clampText(value.title || "A RECORDED EVENT", 96),
        text: clampText(value.text || "The chronicler recorded an unread page.", 520),
        location: clampText(value.location || "", 96),
        participants: normalizeParticipants(value.participants),
        impact: normalizeImpact(value.impact),
        templateId: clampText(value.templateId || "", 64),
        source: value.source === "simulation" ? "simulation" : "procedural"
    };
}

export function createEventTimelineState() {
    return {
        events: [],
        sequence: 0,
        totalGenerated: 0,
        nextEventTick: 0
    };
}

// Normalization is intentionally forgiving: an old save or an imported realm
// must never stop loading because a single narrative record was malformed.
export function normalizeEventTimelineState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const events = [];
    const seen = new Set();
    const input = Array.isArray(source.events) ? source.events : [];
    for (let index = 0; index < input.length && events.length < MAX_TIMELINE_EVENTS; index++) {
        const event = normalizeEvent(input[index], Math.max(0, input.length - index));
        if (!event || seen.has(event.id)) continue;
        seen.add(event.id);
        events.push(event);
    }
    events.sort((a, b) => (b.tick - a.tick) || (b.sequence - a.sequence));
    if (events.length > MAX_TIMELINE_EVENTS) events.length = MAX_TIMELINE_EVENTS;
    let sequence = finiteInt(source.sequence, 0);
    for (const event of events) sequence = Math.max(sequence, event.sequence);
    return {
        events,
        sequence,
        totalGenerated: Math.max(finiteInt(source.totalGenerated, 0), events.length, sequence),
        nextEventTick: Math.max(0, finiteInt(source.nextEventTick, 0))
    };
}

export function appendTimelineEvent(timeline, draft) {
    const target = timeline && typeof timeline === "object" ? timeline : createEventTimelineState();
    if (!Array.isArray(target.events)) target.events = [];
    const sequence = Math.max(0, finiteInt(target.sequence, 0)) + 1;
    const entry = normalizeEvent({ ...(draft || {}), id: "evt-" + sequence, sequence }, sequence);
    if (!entry) return null;
    target.events.unshift(entry);
    if (target.events.length > MAX_TIMELINE_EVENTS) target.events.length = MAX_TIMELINE_EVENTS;
    target.sequence = sequence;
    target.totalGenerated = Math.max(finiteInt(target.totalGenerated, 0) + 1, sequence);
    return entry;
}

export function serializeEventTimelineState(value) {
    const normalized = normalizeEventTimelineState(value);
    return {
        events: normalized.events.map(event => ({
            ...event,
            participants: event.participants.map(participant => ({ ...participant })),
            impact: event.impact ? {
                ...event.impact,
                resources: { ...event.impact.resources }
            } : null
        })),
        sequence: normalized.sequence,
        totalGenerated: normalized.totalGenerated,
        nextEventTick: normalized.nextEventTick
    };
}

export function validateEventTimelineState(value) {
    if (value === null || value === undefined) return true;
    if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Timeline state must be an object.");
    }
    const events = value.events;
    if (events !== undefined && (!Array.isArray(events) || events.length > MAX_TIMELINE_EVENTS)) {
        throw new Error("Timeline contains an invalid or oversized event list.");
    }
    if (Array.isArray(events)) {
        for (const event of events) {
            if (!event || typeof event !== "object" || Array.isArray(event)) {
                throw new Error("Timeline contains an invalid event record.");
            }
            if (!Number.isFinite(Number(event.tick)) || !Number.isFinite(Number(event.year)) || !Number.isFinite(Number(event.day))) {
                throw new Error("Timeline contains an event without a valid date.");
            }
            if (String(event.text || "").length > 520 || String(event.title || "").length > 96) {
                throw new Error("Timeline contains an oversized event record.");
            }
        }
    }
    if (value.nextEventTick !== undefined && (!Number.isFinite(Number(value.nextEventTick)) || Number(value.nextEventTick) < 0)) {
        throw new Error("Timeline contains an invalid next event tick.");
    }
    return true;
}

export function timelineSeason(event) {
    return SEASONS[Math.min(3, Math.max(0, Math.floor((finiteInt(event?.day, 1) - 1) / 100)))];
}

export function timelineDateLabel(event) {
    const year = Math.max(1, finiteInt(event?.year, 1));
    const day = Math.min(400, Math.max(1, finiteInt(event?.day, 1)));
    return "YEAR " + year + " · DAY " + day + " · " + timelineSeason(event).toUpperCase();
}

export function timelineImpactLabel(event) {
    const impact = event?.impact;
    if (!impact) return "NO MATERIAL CHANGE · OBSERVED ONLY";
    if (impact.summary) return impact.summary;
    const parts = [];
    if (impact.morale) parts.push("MORALE " + (impact.morale > 0 ? "+" : "") + impact.morale);
    for (const key of RESOURCE_KEYS) {
        const amount = impact.resources?.[key];
        if (amount) parts.push(key.toUpperCase() + " " + (amount > 0 ? "+" : "") + amount);
    }
    return parts.join(" · ") || "NO MATERIAL CHANGE · OBSERVED ONLY";
}

export function findTimelineEvent(timeline, eventId) {
    return (timeline?.events || []).find(event => event.id === String(eventId)) || null;
}
