// ═══════════════════════════════════════════════════════════════
//  RENDERER — Haupt-Render-Pipeline mit Zoom-Levels
// ═══════════════════════════════════════════════════════════════

import { CELL } from '../../config.js';
import { state } from '../../state.js';
import { drawTerrain } from './terrain.js';
import { drawEntity } from './entities.js';

// ═══════════════════════════════════════════════════════════════
//  WELT ZEICHNEN
// ═══════════════════════════════════════════════════════════════

export function drawWorld() {
    const { ctx, canvas, camera, zoom, tick } = state;

    // ── Terrain ──────────────────────────────────────────────
    drawTerrain(ctx);

    // ── Entities (sortiert nach Y für Pseudo-Tiefe) ──────────
    const sorted = [...state.entities]
        .filter(e => !e.dead)
        .sort((a, b) => a.y - b.y);

    sorted.forEach(entity => {
        // Nur sichtbare (explored) Entities
        const ex = Math.floor(entity.x);
        const ey = Math.floor(entity.y);
        if (ex >= 0 && ey >= 0 && state.explored[ex] && state.explored[ex][ey]) {
            drawEntity(ctx, entity, tick, zoom, camera);
        }
    });

    // ── Partikel ─────────────────────────────────────────────
    const cellPx = CELL * zoom;

    state.particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        const px = p.x * zoom - camera.x;
        const py = p.y * zoom - camera.y;

        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        ctx.fillRect(px, py, p.size * zoom, p.size * 0.6 * zoom);
    });
    ctx.globalAlpha = 1;

    // ── Floater ──────────────────────────────────────────────
    ctx.textAlign = "center";
    const floaterSize = Math.max(10, Math.floor(13 * Math.min(zoom, 1.5)));
    ctx.font = `600 ${floaterSize}px monospace`;

    state.floaters.forEach(f => {
        const alpha = Math.max(0, f.life / 44);
        const px = f.x * zoom - camera.x;
        const py = f.y * zoom - camera.y;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, px, py);
    });

    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // ── Zoom-Level-Indikator ─────────────────────────────────
    drawZoomIndicator(ctx, canvas);
}

// ═══════════════════════════════════════════════════════════════
//  VIGNETTE
// ═══════════════════════════════════════════════════════════════

export function drawVignette() {
    const { ctx, canvas } = state;

    const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2,
        Math.min(canvas.width, canvas.height) * 0.6,
        canvas.width / 2, canvas.height / 2,
        Math.max(canvas.width, canvas.height) * 0.9
    );
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, "rgba(9, 13, 9, 0.6)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ═══════════════════════════════════════════════════════════════
//  ZOOM-INDIKATOR (dezent links unten)
// ═══════════════════════════════════════════════════════════════

function drawZoomIndicator(ctx, canvas) {
    const zl = state.zoomLevel;
    const zoom = state.zoom;

    const labels = ["", "KINGDOM", "SETTLEMENT", "INTERIOR"];
    const label = labels[zl];

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(8, canvas.height - 32, 140, 24);

    ctx.fillStyle = "#fcd34d";
    ctx.font = "600 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${label}  ×${zoom.toFixed(1)}`, 14, canvas.height - 16);

    // Drei kleine Punkte für die Levels
    for (let i = 1; i <= 3; i++) {
        ctx.fillStyle = i === zl ? "#fcd34d" : "#444";
        ctx.beginPath();
        ctx.arc(120 + i * 12, canvas.height - 20, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}
