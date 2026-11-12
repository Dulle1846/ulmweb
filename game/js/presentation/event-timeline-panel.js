// Presentation-only view of the living event timeline. Selecting a year,
// scrubbing the range or opening an event never mutates the simulation.
import { state } from "../core/state.js";
import {
    TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABELS, findTimelineEvent,
    timelineDateLabel, timelineImpactLabel
} from "../core/event-timeline.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const view = { year: null, filter: "all", selectedId: null };
// Keep the rendered card count bounded. The archive itself may hold MAX_TIMELINE_EVENTS.
export const MAX_VISIBLE_TIMELINE_CARDS = 160;
export const TIMELINE_INITIAL_CARDS = 0;
export const TIMELINE_CARD_BATCH = 12;

function yearsWithEvents() {
    const years = new Set((state.eventTimeline?.events || []).map(event => Number(event.year)).filter(Number.isFinite));
    years.add(Math.max(1, Number(state.year) || 1));
    return [...years].sort((a, b) => a - b);
}
function bounds() {
    const years = yearsWithEvents();
    return {
        min: Math.min(1, ...years),
        max: Math.max(Math.max(1, Number(state.year) || 1), ...years)
    };
}
function selectedYear() {
    const { min, max } = bounds();
    return Math.max(min, Math.min(max, Number(view.year) || Math.max(1, Number(state.year) || 1)));
}
function selectedEvent() {
    return view.selectedId ? findTimelineEvent(state.eventTimeline, view.selectedId) : null;
}
function visibleEvents() {
    const year = selectedYear();
    return (state.eventTimeline?.events || []).filter(event =>
        Number(event.year) === year && (view.filter === "all" || event.category === view.filter)
    );
}
function cardBatch(rows, start, end) {
    return rows.slice(start, end).map(eventCard).join("");
}
export function renderTimelineCardBatch(start = 0, end = MAX_VISIBLE_TIMELINE_CARDS) {
    return cardBatch(visibleEvents(), Math.max(0, Math.floor(Number(start) || 0)), Math.max(0, Math.floor(Number(end) || 0)));
}
function eventCard(event) {
    const selected = view.selectedId === event.id;
    return '<button type="button" class="timeline-event-card' + (selected ? " is-selected" : "") + '" data-timeline-event="' + esc(event.id) + '">' +
        '<span class="timeline-event-date">' + esc(timelineDateLabel(event)) + '</span>' +
        '<strong>' + esc(event.title) + '</strong>' +
        '<p>' + esc(event.text) + '</p>' +
        '<span class="timeline-event-tags"><i>' + esc(TIMELINE_CATEGORY_LABELS[event.category] || event.category) + '</i><i>SEVERITY ' + event.severity + '</i><i>' + esc(timelineImpactLabel(event)) + '</i></span>' +
        '</button>';
}
function detailCard() {
    const event = selectedEvent();
    if (!event) {
        return '<aside class="timeline-detail timeline-detail--empty" data-timeline-detail="empty"><span>RECORD DETAIL</span><h5>Choose a page from the timeline</h5><p>Every recorded event can be reopened here. This is a reading view: it does not issue orders or change the realm.</p></aside>';
    }
    const participants = (event.participants || []).length
        ? event.participants.map(person => '<span>' + esc(person.name) + ' <small>' + esc(person.role) + '</small></span>').join("")
        : '<span>No named witness recorded</span>';
    return '<aside class="timeline-detail" data-timeline-detail="' + esc(event.id) + '">' +
        '<div class="timeline-detail-head"><span>RECORD ' + esc(event.id.toUpperCase()) + '</span><button type="button" data-timeline-clear aria-label="Close record detail">×</button></div>' +
        '<h5>' + esc(event.title) + '</h5>' +
        '<p>' + esc(event.text) + '</p>' +
        '<dl><dt>DATE</dt><dd>' + esc(timelineDateLabel(event)) + '</dd>' +
        '<dt>PLACE</dt><dd>' + esc(event.location || "The realm") + '</dd>' +
        '<dt>WITNESSES</dt><dd class="timeline-witnesses">' + participants + '</dd>' +
        '<dt>IMPACT</dt><dd>' + esc(timelineImpactLabel(event)) + '</dd></dl>' +
        '<small class="timeline-detail-source">' + (event.source === "simulation" ? "SIMULATION RECORD" : "PROCEDURAL CHRONICLER") + ' · STORED SIMULATION TICK ' + number(event.tick) + '</small>' +
        '</aside>';
}
export function resetTimelineView(year = null) {
    view.year = Number.isFinite(Number(year)) ? Math.max(1, Math.floor(Number(year))) : null;
    view.filter = "all";
    view.selectedId = null;
}
export function getTimelineView() { return { ...view }; }
export function setTimelineYear(year) {
    const { min, max } = bounds();
    view.year = Math.max(min, Math.min(max, Math.floor(Number(year) || min)));
}
export function setTimelineFilter(filter) {
    view.filter = TIMELINE_CATEGORIES.includes(String(filter)) ? String(filter) : "all";
}
export function focusTimelineEvent(eventId) {
    const event = findTimelineEvent(state.eventTimeline, eventId);
    if (!event) return false;
    view.year = event.year;
    view.filter = "all";
    view.selectedId = event.id;
    return true;
}
export function clearTimelineSelection() { view.selectedId = null; }
export function stepTimelineYear(direction) {
    setTimelineYear(selectedYear() + (Number(direction) < 0 ? -1 : 1));
}

export function renderTimelineDetailCard() {
    return detailCard();
}
export function renderLivingTimelineChunks({ cardLimit = MAX_VISIBLE_TIMELINE_CARDS } = {}) {
    const timeline = state.eventTimeline || { events: [], totalGenerated: 0 };
    const events = timeline.events || [];
    const { min, max } = bounds();
    const year = selectedYear();
    const currentYear = Math.max(1, Number(state.year) || 1);
    const years = yearsWithEvents();
    const selectedIndex = Math.max(0, years.indexOf(year));
    const railYears = years.length <= 9 ? years : years.slice(Math.max(0, Math.min(years.length - 9, selectedIndex - 4)), Math.max(9, Math.min(years.length, selectedIndex + 5)));
    const rows = visibleEvents();
    const limit = Math.max(0, Math.min(MAX_VISIBLE_TIMELINE_CARDS, Math.floor(Number(cardLimit) || 0)));
    const loading = limit === 0 && rows.length > 0;
    const hiddenCount = Math.max(0, rows.length - MAX_VISIBLE_TIMELINE_CARDS);
    const historical = year !== currentYear;
    const attributes = [
        ["class", "living-timeline"],
        ["data-timeline-root", String(events.length)],
        ["data-timeline-visible", String(rows.length)],
        ["data-timeline-rendered", String(limit)]
    ];
    const chunks = [
        () => '<div class="timeline-heading"><div><span class="command-ribbon">THE LIVING CHRONICLE</span><h4>Every small event, kept in order</h4><p>Drag the year back to reread a day exactly as the realm recorded it. Reading history never changes the present.</p></div><div class="timeline-status"><strong>' + number(events.length) + ' RETAINED</strong><span>' + number(timeline.totalGenerated || events.length) + ' GENERATED · CAP 2,400</span></div></div>',
        () => '<div class="timeline-summary"><span><small>VIEWING</small><strong>YEAR ' + year + (historical ? ' · HISTORY' : ' · PRESENT') + '</strong></span><span><small>EVENTS THIS YEAR</small><strong>' + number(rows.length) + '</strong></span><span><small>NAMED EVENTS</small><strong>' + number(rows.filter(event => event.participants?.length).length) + '</strong></span><span><small>LAST RECORD</small><strong>' + (events[0] ? esc(timelineDateLabel(events[0])) : "AWAITING THE FIRST PAGE") + '</strong></span></div>',
        () => '<div class="timeline-navigation"><button type="button" class="timeline-arrow" data-timeline-step="-1" aria-label="Previous year">◀</button><div class="timeline-year-rail" role="group" aria-label="Recorded years">' + (railYears.map(value =>
            '<button type="button" class="timeline-year' + (value === year ? " is-current" : "") + '" data-timeline-year="' + value + '"' + (value === year ? ' aria-current="date"' : '') + '>YEAR ' + value + '</button>'
        ).join("") || '<span class="timeline-empty-year">No year has been recorded yet.</span>') + '</div><button type="button" class="timeline-arrow" data-timeline-step="1" aria-label="Next year">▶</button></div>',
        () => '<div class="timeline-scrubber"><label for="timeline-year-range">SCRUB THE REIGN</label><input id="timeline-year-range" type="range" min="' + min + '" max="' + max + '" step="1" value="' + year + '" aria-label="Choose a year to view"><span>YEAR ' + min + ' — ' + max + '</span></div>',
        () => '<div class="timeline-toolbar"><label for="timeline-filter">EVENT FAMILY</label><select id="timeline-filter">' + ['<option value="all">All event families</option>', ...TIMELINE_CATEGORIES.map(category =>
            '<option value="' + category + '"' + (view.filter === category ? " selected" : "") + '>' + TIMELINE_CATEGORY_LABELS[category] + '</option>'
        )].join("") + '</select><button type="button" class="timeline-live-button" data-timeline-live' + (historical ? "" : " disabled") + '>RETURN TO THE PRESENT</button></div>',
        () => '<div class="timeline-layout"><div class="timeline-events">' + (limit > 0 ? cardBatch(rows, 0, limit) : (loading ? '<div class="timeline-loading">OPENING THE ARCHIVE…</div>' : '<div class="timeline-empty-year"><strong>NO PAGE IN THIS YEAR</strong><p>No event from this family was recorded in year ' + year + '. Move the scrubber or choose another family.</p></div>')) + (hiddenCount ? '<p class="command-note">Showing the newest ' + MAX_VISIBLE_TIMELINE_CARDS + ' of ' + number(rows.length) + ' events in this year. The remaining records stay in the save.</p>' : "") + '</div>' + detailCard() + '</div>',
        () => '<p class="timeline-note">The archive is a record, not a command. Events are generated from the realm’s actual people, settlements, resources and season; they are capped at 2,400 retained pages and retain their real simulation tick.</p>'
    ];
    return { attributes, chunks };
}
export function renderLivingTimeline(options = {}) {
    const { attributes, chunks } = renderLivingTimelineChunks(options);
    return '<section ' + attributes.map(([name, value]) => name + '="' + esc(value) + '"').join(" ") + '>' + chunks.map(chunk => chunk()).join("") + '</section>';
}
