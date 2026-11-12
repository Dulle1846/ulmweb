// CK-style, non-blocking centre notices for small events. Presentation only:
// the timeline remains the durable record, and a notice never offers an action
// beyond reopening its page in the chronicle.
import { state } from "../core/state.js";

const MAX_QUEUE = 5;
const MIN_INTERVAL_MS = 1400;
const DISPLAY_MS = 5200;
const queue = [];
let active = null;
let hideTimer = null;
let nextTimer = null;
let lastShownAt = 0;

function root() { return typeof document === "undefined" ? null : document.getElementById("event-notification"); }
function setText(id, text) { const node = document.getElementById(id); if (node) node.textContent = text; }
function scheduleNext() {
    if (active || nextTimer || !queue.length) return;
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastShownAt));
    nextTimer = setTimeout(() => { nextTimer = null; showNext(); }, wait);
}
function dismiss() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    active = null;
    const element = root();
    if (element) {
        element.classList.remove("is-visible");
        element.classList.add("hidden");
    }
    setTimeout(scheduleNext, 240);
}
function showNext() {
    const element = root();
    if (!element) { queue.length = 0; return; }
    if (active || !queue.length) return;
    const event = queue.shift();
    active = event;
    lastShownAt = Date.now();
    setText("event-notification-category", String(event.category || "COURT") + " · " + (event.severity >= 3 ? "GREAT EVENT" : event.severity === 2 ? "NOTABLE EVENT" : "SMALL EVENT"));
    setText("event-notification-title", event.title || "A RECORDED EVENT");
    setText("event-notification-text", event.text || "");
    setText("event-notification-date", "YEAR " + (event.year || stateYear()) + " · DAY " + (event.day || 1) + " · " + String(event.location || "THE REALM"));
    const open = document.getElementById("event-notification-open");
    if (open) {
        open.onclick = () => {
            document.dispatchEvent(new CustomEvent("kac:open-timeline", { detail: { eventId: event.id } }));
            dismiss();
        };
    }
    const close = document.getElementById("event-notification-close");
    if (close) close.onclick = dismiss;
    element.classList.remove("hidden");
    element.classList.add("is-visible");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(dismiss, DISPLAY_MS);
}
function stateYear() { return Number(state.year) || 1; }
export function enqueueTimelineEvent(event) {
    if (!event || !event.id || !event.title) return;
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    scheduleNext();
}
export function clearTimelineNotifications() {
    queue.length = 0;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; }
    active = null;
    const element = root();
    if (element) {
        element.classList.remove("is-visible");
        element.classList.add("hidden");
    }
}
