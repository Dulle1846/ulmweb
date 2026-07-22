// ── Terrain Generation & Exploration ───────────────────────────

import { WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { state } from '../state.js';
import { rand, randInt, distance } from '../utils.js';

export function initWorld() {
    state.world = [];
    state.explored = [];

    for (let x = 0; x < WORLD_WIDTH; x++) {
        state.world[x] = [];
        state.explored[x] = [];
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            state.explored[x][y] = false;

            const r = Math.random();

            if (r < 0.07) {
                state.world[x][y] = { terrain: "water", variant: randInt(0, 3) };
            } else if (r < 0.3) {
                state.world[x][y] = { terrain: "forest", variant: randInt(0, 4) };
            } else if (r < 0.37) {
                state.world[x][y] = { terrain: "rock", variant: randInt(0, 3) };
            } else if (r < 0.4) {
                state.world[x][y] = { terrain: "ruins", variant: randInt(0, 2) };
            } else {
                state.world[x][y] = { terrain: "grass", variant: randInt(0, 5) };
            }
        }
    }

    // Central fertile valley
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);

    for (let x = cx - 18; x <= cx + 18; x++) {
        for (let y = cy - 18; y <= cy + 18; y++) {
            if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue;
            if (state.world[x][y].terrain === "water") continue;
            state.world[x][y].terrain = "grass";
            state.world[x][y].variant = 0;
        }
    }

    revealArea(cx, cy, 22);
}

export function revealArea(tx, ty, radius) {
    for (let x = tx - radius; x <= tx + radius; x++) {
        for (let y = ty - radius; y <= ty + radius; y++) {
            if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue;
            if (distance(tx, ty, x, y) < radius) {
                state.explored[x][y] = true;
            }
        }
    }
}
