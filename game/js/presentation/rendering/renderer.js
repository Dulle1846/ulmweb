// ═══════════════════════════════════════════════════════════════
//  RENDERER — Haupt-Render-Pipeline mit Zoom-Levels
// ═══════════════════════════════════════════════════════════════

import { CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { drawTerrain } from './terrain.js';
import { drawEntity } from './entities.js';
import { drawPlacementPreview } from './placement-preview.js';

let visibleEntitiesCache=[];
let visibleEntitiesUntil=0;
let visibleEntitiesKey="";

// ═══════════════════════════════════════════════════════════════
//  WELT ZEICHNEN
// ═══════════════════════════════════════════════════════════════

export function drawWorld() {
    const { ctx, canvas, camera, zoom, tick } = state;

    // ── Terrain ──────────────────────────────────────────────
    drawTerrain(ctx);

    // ── Entities (sortiert nach Y für Pseudo-Tiefe) ──────────
    const cellPx = CELL * zoom;
    const margin = cellPx * 4;
    const left = camera.x - margin;
    const top = camera.y - margin;
    const right = camera.x + canvas.width + margin;
    const bottom = camera.y + canvas.height + margin;
    const cacheKey=[state.entities.length,Math.floor(camera.x/(cellPx*2)),Math.floor(camera.y/(cellPx*2)),canvas.width,canvas.height,Math.round(zoom*100)].join(":");
    const now=performance.now();
    if(now>=visibleEntitiesUntil||cacheKey!==visibleEntitiesKey){
        visibleEntitiesKey=cacheKey;visibleEntitiesUntil=now+100;
        visibleEntitiesCache=state.entities.filter(e=>{
            if(e.dead)return false;
            const x=e.x*cellPx,y=e.y*cellPx;
            return x>=left&&x<=right&&y>=top&&y<=bottom;
        }).sort((a,b)=>a.y-b.y);
    }
    visibleEntitiesCache.forEach(entity => {
        // Nur sichtbare (explored) Entities
        const ex = Math.floor(entity.x);
        const ey = Math.floor(entity.y);
        if (ex >= 0 && ey >= 0 && state.explored[ex] && state.explored[ex][ey]) {
            drawEntity(ctx, entity, tick, zoom, camera);
        }
    });

    // ── Card placement preview ───────────────────────────────
    drawPlacementPreview(ctx);

    // ── Partikel ─────────────────────────────────────────────
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

    const labels = ["", "LANDSCAPE", "DISTRICTS", "ROOFTOPS", "INTERIORS"];
    const label = labels[zl];

    ctx.save();
    ctx.fillStyle = "rgba(8, 15, 18, 0.82)";
    ctx.strokeStyle = "rgba(212, 175, 93, 0.38)";
    ctx.lineWidth = 1;
    ctx.fillRect(12, canvas.height - 40, 206, 28);
    ctx.strokeRect(12.5, canvas.height - 39.5, 205, 27);

    ctx.fillStyle = "#ead9b3";
    ctx.font = "700 10px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, 22, canvas.height - 22);
    ctx.fillStyle = "#b9a98a";
    ctx.font = "10px monospace";
    ctx.fillText(`×${zoom.toFixed(2)}`, 130, canvas.height - 22);

    for (let i = 1; i <= 4; i++) {
        ctx.fillStyle = i === zl ? "#dfba70" : "rgba(226, 216, 193, 0.28)";
        ctx.beginPath();
        ctx.arc(174 + i * 10, canvas.height - 26, i === zl ? 3.4 : 2.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}
