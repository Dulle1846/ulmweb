// ═══════════════════════════════════════════════════════════════
//  RENDERER — Haupt-Render-Pipeline mit Zoom-Levels
// ═══════════════════════════════════════════════════════════════

import { CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { drawTerrain } from './terrain.js';
import { drawEntity } from './entities.js';
import { drawPlacementPreview } from './placement-preview.js';
import { getRoadTiles,getRoadAt,ROAD_TYPES } from '../../systems/roads.js';

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
    drawRoadNetwork(ctx,zoom,camera,canvas);

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
}

function drawRoadNetwork(ctx,zoom,camera,canvas){
    const tileSize=CELL*zoom;
    if(tileSize<1.5)return;
    const minX=Math.max(0,Math.floor(camera.x/tileSize)-1);
    const minY=Math.max(0,Math.floor(camera.y/tileSize)-1);
    const maxX=Math.min(159,Math.ceil((camera.x+canvas.width)/tileSize)+1);
    const maxY=Math.min(159,Math.ceil((camera.y+canvas.height)/tileSize)+1);
    const roads=getRoadTiles();
    if(!roads.length)return;
    ctx.save();
    ctx.lineCap="round";
    ctx.lineJoin="round";
    for(const road of roads){
        if(road.x<minX||road.x>maxX||road.y<minY||road.y>maxY)continue;
        if(!state.explored?.[road.x]?.[road.y])continue;
        const style=ROAD_TYPES[road.type];
        if(!style)continue;
        const x=road.x*tileSize-camera.x;
        const y=road.y*tileSize-camera.y;
        const width=Math.max(2,tileSize*(road.type==="dirt"?0.24:road.type==="gravel"?0.31:0.38));
        const centerX=x+tileSize*.5,centerY=y+tileSize*.5;
        const neighbors=[
            [0,-1,getRoadAt(road.x,road.y-1)],
            [1,0,getRoadAt(road.x+1,road.y)],
            [0,1,getRoadAt(road.x,road.y+1)],
            [-1,0,getRoadAt(road.x-1,road.y)]
        ];
        const drawStroke=(color,lineWidth)=>{
            ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();
            for(const [dx,dy,neighbor] of neighbors){
                if(!neighbor)continue;
                ctx.moveTo(centerX,centerY);
                ctx.lineTo(centerX+dx*tileSize*.5,centerY+dy*tileSize*.5);
            }
            if(neighbors.every(([, ,neighbor])=>!neighbor)){
                ctx.moveTo(x+tileSize*.08,centerY);ctx.lineTo(x+tileSize*.92,centerY);
            }
            ctx.stroke();
            ctx.fillStyle=color;ctx.beginPath();ctx.arc(centerX,centerY,lineWidth*.5,0,Math.PI*2);ctx.fill();
        };
        drawStroke("rgba(35,25,17,.72)",width+Math.max(1,tileSize*.07));
        drawStroke(style.color,width);
        if(zoom>=0.7&&road.type!=="dirt"){
            ctx.strokeStyle=style.edge;ctx.lineWidth=Math.max(1,tileSize*.025);
            ctx.beginPath();ctx.arc(centerX,centerY,width*.5,0,Math.PI*2);ctx.stroke();
        }
    }
    ctx.restore();
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

