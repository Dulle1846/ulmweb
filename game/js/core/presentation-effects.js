// Cross-layer presentation requests. Domain code publishes data; presentation handles visuals.

import { state } from './state.js';

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
    state.pendingPresentationEffects.push(effect);
}

export function drainPresentationEffects() {
    return state.pendingPresentationEffects.splice(0);
}
