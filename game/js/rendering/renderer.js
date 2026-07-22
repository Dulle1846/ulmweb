// ── Main Render Pipeline ───────────────────────────────────────

import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { state } from '../state.js';
import { drawTerrain } from './terrain.js';
import { drawEntity } from './entities.js';

export function drawWorld() {
    const { ctx, camera, canvas } = state;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    const startX = Math.floor(camera.x / TILE_SIZE) - 1;
    const startY = Math.floor(camera.y / TILE_SIZE) - 1;
    const endX   = Math.floor((camera.x + canvas.width) / TILE_SIZE) + 3;
    const endY   = Math.floor((camera.y + canvas.height) / TILE_SIZE) + 3;

    for (let x = Math.max(0, startX); x < Math.min(WORLD_WIDTH, endX); x++) {
        for (let y = Math.max(0, startY); y < Math.min(WORLD_HEIGHT, endY); y++) {
            if (!state.explored[x][y]) {
                ctx.fillStyle = "#111111";
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                continue;
            }
            drawTerrain(ctx, x, y, state.world[x][y], state.tick);
        }
    }

    // sort entities by Y for pseudo-depth
    const sortedEntities = [...state.entities].sort((a, b) => a.y - b.y);

    sortedEntities.forEach(entity => {
        if (state.explored[Math.floor(entity.x)] && state.explored[Math.floor(entity.x)][Math.floor(entity.y)]) {
            drawEntity(ctx, entity, state.tick);
        }
    });

    // particles
    state.particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
    });
    ctx.globalAlpha = 1;

    // floaters
    ctx.textAlign = "center";
    ctx.font = "600 13px monospace";
    state.floaters.forEach(f => {
        const alpha = Math.max(0, f.life / 44);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    ctx.restore();
}

export function drawVignette() {
    const { ctx, canvas } = state;

    const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.6,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.9
    );
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, "rgba(9, 13, 9, 0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
