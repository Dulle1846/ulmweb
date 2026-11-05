// ── Utility Functions ──────────────────────────────────────────

export function rand(min, max) {
    return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
    return Math.floor(rand(min, max));
}

export function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}
