// ── Particle & Floater System ──────────────────────────────────

import { state } from '../../state.js';
import { rand } from '../../utils.js';

export function createParticle(x, y, color, life, vx = null, vy = null, size = 4) {
    state.particles.push({
        x,
        y,
        vx: vx ?? rand(-1.5, 1.5),
        vy: vy ?? rand(-2.5, 0.5),
        life,
        maxLife: life,
        color,
        size,
    });
}

export function createFloater(x, y, text, color = "#ffeb9c") {
    state.floaters.push({
        x,
        y,
        text,
        vy: -1.2,
        life: 55,
        color,
    });
}

export function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life--;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

export function updateFloaters() {
    for (let i = state.floaters.length - 1; i >= 0; i--) {
        const f = state.floaters[i];
        f.y += f.vy;
        f.life--;
        if (f.life <= 0) state.floaters.splice(i, 1);
    }
}
