// Cross-layer presentation requests. Domain code publishes data; presentation handles visuals.

import { state } from './state.js';

export const MAX_PENDING_PRESENTATION_EFFECTS = 1200;

export function queueParticle(x, y, color, life, vx = null, vy = null, size = 4) {
    queuePresentationEffect({ type: "particle", x, y, color, life, vx, vy, size });
}

export function queueFloater(x, y, text, color = "#ffeb9c") {
    queuePresentationEffect({ type: "floater", x, y, text, color });
}

export function queueMessage(title, subtitle, timeout = 1800) {
    queuePresentationEffect({ type: "message", title, subtitle, timeout });
}

export function queuePresentationEffect(effect) {
    if (!effect || typeof effect.type !== "string") {
        throw new TypeError("A presentation effect requires a type.");
    }
    const queue = Array.isArray(state.pendingPresentationEffects)
        ? state.pendingPresentationEffects
        : (state.pendingPresentationEffects = []);
    // Presentation requests are transient. Under extreme simulation speeds,
    // discard the oldest visual particle/floater before allowing the queue to
    // grow without bound; important modal messages are retained whenever possible.
    if (queue.length >= MAX_PENDING_PRESENTATION_EFFECTS) {
        const expendable = queue.findIndex(item => item?.type === "particle" || item?.type === "floater");
        queue.splice(expendable >= 0 ? expendable : 0, 1);
    }
    queue.push(effect);
}

export function drainPresentationEffects() {
    return state.pendingPresentationEffects.splice(0);
}
