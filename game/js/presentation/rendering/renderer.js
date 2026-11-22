// ═══════════════════════════════════════════════════════════════
//  RENDERER — Haupt-Render-Pipeline mit Zoom-Levels
// ═══════════════════════════════════════════════════════════════

import { CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { TYPE } from '../../core/types.js';
import { drawTerrain, drawForestVisibility, updateForestSightOrigin, isForestSightVisible } from './terrain.js';
import { forestCoverShareAt, getBiomeDensityCells, getBiomeOverlayCells, shouldDrawForestPoints } from '../../systems/biome-resource-state.js';
import { drawEntity } from './entities.js';
import { drawPlacementPreview } from './placement-preview.js';
import { getRoadTiles,getRoadAt,ROAD_TYPES } from '../../systems/roads.js';
import { getResourceNodeAt } from '../../systems/resource-geography.js';
import { getServiceBuildingsForOverlay } from '../../systems/settlement.js';
import { getLogisticsSnapshot, getCarriersForRender } from '../../systems/logistics.js';
import { worldWidth,worldHeight } from '../../world/world.js';
import { drawWeatherOverlay } from './weather-overlay.js';
import { drawDaylightOverlay } from './daylight.js';
import { HAZARD_TERRAIN_STYLES, refreshHazardTerrainBake } from '../../systems/hazard-scars.js';

let visibleEntitiesCache=[];
let visibleEntitiesUntil=0;
let visibleEntitiesKey="";
let visibleCarrierIdsCache=new Set();
let visibleCarrierIdsUntil=0;
let particleDrawCount=0;
let floaterDrawCount=0;

// Read-only diagnostics for the real-browser occlusion audit.
export function visibleEntityIdsForTest(){return visibleEntitiesCache.map(entity=>entity.id);}
export function visibleCarrierIdsForTest(){return [...visibleCarrierIdsCache];}
export function visibleParticleCountForTest(){return particleDrawCount;}
export function visibleFloaterCountForTest(){return floaterDrawCount;}

// Bounded hazard map layer: the saved scar list is culled to the viewport.
// The same marks drive the baked-canvas repaint, movement, gathering and the
// resource survey, so the map is never a second source of truth. The base
// damage tint is always visible; the toggle adds the strong survey treatment
// and the legend.
function drawHazardTerrainMarks(ctx, zoom, camera, canvas, highlight) {
    const scars = state.environmentalHazards?.scars;
    if (!scars || typeof scars !== "object") return;
    const cellPx = CELL * zoom;
    if (cellPx <= 0) return;
    ctx.save();
    ctx.globalAlpha = highlight ? 1 : 0.72;
    for (const kind of Object.keys(HAZARD_TERRAIN_STYLES)) {
        const style = HAZARD_TERRAIN_STYLES[kind];
        const marks = Array.isArray(scars[kind]) ? scars[kind] : [];
        ctx.fillStyle = style.fill;
        for (const mark of marks) {
            const sx = Number(mark.x) * cellPx - camera.x;
            const sy = Number(mark.y) * cellPx - camera.y;
            if (sx < -cellPx || sy < -cellPx || sx > canvas.width || sy > canvas.height) continue;
            const size = Math.max(1, cellPx + 0.5);
            ctx.fillRect(sx, sy, size, size);
            // A small deterministic mark tells the three terrain states apart
            // even when the player is colour-blind or the view is very small.
            if (cellPx >= 5) {
                ctx.save();
                ctx.strokeStyle = style.accent;
                ctx.fillStyle = style.accent;
                ctx.globalAlpha = highlight ? 0.95 : 0.58;
                ctx.lineWidth = Math.max(0.7, cellPx * 0.055);
                if (kind === "lava") {
                    ctx.beginPath();
                    ctx.moveTo(sx + cellPx * 0.18, sy + cellPx * 0.24);
                    ctx.lineTo(sx + cellPx * 0.44, sy + cellPx * 0.56);
                    ctx.lineTo(sx + cellPx * 0.34, sy + cellPx * 0.82);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(sx + cellPx * 0.62, sy + cellPx * 0.18);
                    ctx.lineTo(sx + cellPx * 0.7, sy + cellPx * 0.46);
                    ctx.stroke();
                } else if (kind === "flooded") {
                    ctx.beginPath();
                    ctx.moveTo(sx + cellPx * 0.14, sy + cellPx * 0.42);
                    ctx.quadraticCurveTo(sx + cellPx * 0.32, sy + cellPx * 0.3, sx + cellPx * 0.5, sy + cellPx * 0.42);
                    ctx.quadraticCurveTo(sx + cellPx * 0.68, sy + cellPx * 0.54, sx + cellPx * 0.86, sy + cellPx * 0.42);
                    ctx.stroke();
                } else if (kind === "burnt") {
                    for (let dot = 0; dot < 3; dot++) {
                        ctx.beginPath();
                        ctx.arc(sx + cellPx * (0.3 + dot * 0.2), sy + cellPx * (0.36 + (dot % 2) * 0.28), Math.max(0.6, cellPx * 0.035), 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else {
                    ctx.beginPath();
                    ctx.moveTo(sx + cellPx * 0.2, sy + cellPx * 0.3);
                    ctx.lineTo(sx + cellPx * 0.8, sy + cellPx * 0.7);
                    ctx.moveTo(sx + cellPx * 0.8, sy + cellPx * 0.3);
                    ctx.lineTo(sx + cellPx * 0.2, sy + cellPx * 0.7);
                    ctx.stroke();
                }
                ctx.restore();
            }
            if (highlight) {
                ctx.strokeStyle = "rgba(255,255,255,0.32)";
                ctx.lineWidth = Math.max(0.5, zoom * 0.5);
                ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(1, cellPx - 1), Math.max(1, cellPx - 1));
            }
        }
    }
    ctx.restore();
}

function drawHazardOverlay(ctx, zoom, camera, canvas) {
    if (!state.hazardOverlay) return;
    drawHazardTerrainMarks(ctx, zoom, camera, canvas, true);
    const fog = Number(state.environmentalHazards?.magic?.fog) || 0;
    if (fog > 0.15) {
        ctx.fillStyle = "rgba(188, 196, 205, " + (Math.min(0.3, fog * 0.24)).toFixed(3) + ")";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// ═══════════════════════════════════════════════════════════════
//  WELT ZEICHNEN
// ═══════════════════════════════════════════════════════════════

export function drawWorld() {
    const { ctx, canvas, camera, zoom, tick } = state;
    if (state.hazardTerrainDirty) refreshHazardTerrainBake();
    // Sight is anchored to the camera centre. This is the world point the
    // player is actually looking from; panning the camera moves the anchor.
    updateForestSightOrigin(canvas, camera, zoom);

    // ── Terrain ──────────────────────────────────────────────
    drawTerrain(ctx);
    drawRoadNetwork(ctx,zoom,camera,canvas);
    drawFieldPatches(ctx,zoom,camera,canvas);
    drawMapLayer(ctx,zoom,camera,canvas);
    drawForesterStewardshipOverlay(ctx,zoom,camera,canvas);
    drawHazardTerrainMarks(ctx,zoom,camera,canvas,false);
    drawHazardOverlay(ctx,zoom,camera,canvas);
    drawLogisticsRoutes(ctx,zoom,camera,canvas);

    // ── Entities (sortiert nach Y für Pseudo-Tiefe) ──────────
    const cellPx = CELL * zoom;
    const margin = cellPx * 4;
    const left = camera.x - margin;
    const top = camera.y - margin;
    const right = camera.x + canvas.width + margin;
    const bottom = camera.y + canvas.height + margin;
    const cacheKey=[state.entities.length,state.forestVisualRevision||0,state.terrainVersion||0,Math.floor(camera.x/(cellPx*2)),Math.floor(camera.y/(cellPx*2)),canvas.width,canvas.height,Math.round(zoom*100)].join(":");
    const now=performance.now();
    if(now>=visibleEntitiesUntil||cacheKey!==visibleEntitiesKey){
        visibleEntitiesKey=cacheKey;visibleEntitiesUntil=now+100;
        visibleEntitiesCache=state.entities.filter(e=>{
            if(e.dead)return false;
            const x=e.x*cellPx,y=e.y*cellPx;
            if(!(x>=left&&x<=right&&y>=top&&y<=bottom))return false;
            // A dense stand between the camera anchor and the entity hides the
            // entity (and its selection ring) completely. Open ground at the
            // same distance returns true and keeps the old draw path.
            return isForestSightVisible(e.x,e.y);
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
    drawConstructionSites(ctx,zoom,camera,canvas);
    drawCarriers(ctx,zoom,camera,canvas);

    // ── Card placement preview ───────────────────────────────
    if (!state.cardPreview || isForestSightVisible(state.cardPreview.tx + 0.5, state.cardPreview.ty + 0.5)) {
        drawPlacementPreview(ctx);
    }

    // ── Partikel ─────────────────────────────────────────────
    particleDrawCount=0;
    state.particles.forEach(p => {
        if(!isForestSightVisible(p.x / CELL, p.y / CELL))return;
        particleDrawCount++;
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

    floaterDrawCount=0;
    state.floaters.forEach(f => {
        if(!isForestSightVisible(f.x / CELL, f.y / CELL))return;
        floaterDrawCount++;
        const alpha = Math.max(0, f.life / 44);
        const px = f.x * zoom - camera.x;
        const py = f.y * zoom - camera.y;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, px, py);
    });

    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // This screen-space wall is atmosphere only. Entities behind a dense stand
    // were already removed from visibleEntitiesCache above; the wall still
    // tints the reduced sight below daily light and weather.
    drawForestVisibility(ctx, canvas, camera, zoom);

    // Daily light sits above the terrain and units, but below the weather and
    // vignette. At noon its alpha is zero, so the 100% default look is intact.
    const seasonName = ["spring", "summer", "autumn", "winter"][Number(state.seasonIndex) || 0] || "summer";
    drawDaylightOverlay(ctx, canvas, state.timeOfDay, seasonName);
    // Screen-space weather sits above the map but below the vignette.
    drawWeatherOverlay(ctx, canvas);
}

function drawRoadNetwork(ctx,zoom,camera,canvas){
    const tileSize=CELL*zoom;
    if(tileSize<1.5)return;
    const minX=Math.max(0,Math.floor(camera.x/tileSize)-1);
    const minY=Math.max(0,Math.floor(camera.y/tileSize)-1);
    const maxX=Math.min(worldWidth()-1,Math.ceil((camera.x+canvas.width)/tileSize)+1);
    const maxY=Math.min(worldHeight()-1,Math.ceil((camera.y+canvas.height)/tileSize)+1);
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

// ── Map intelligence overlays ────────────────────────────────────
// These are presentation-only readings of the existing geography and road
// records. They never mutate world state and are sampled coarsely so the
// overlay stays cheap even on the colossal world sizes.
function drawMapLayer(ctx,zoom,camera,canvas){
    const layer=state.mapLayer;
    if(!layer||layer==="terrain")return;
    const tileSize=CELL*zoom;
    if(tileSize<1)return;
    const minX=Math.max(0,Math.floor(camera.x/tileSize)-1);
    const minY=Math.max(0,Math.floor(camera.y/tileSize)-1);
    const maxX=Math.min(worldWidth()-1,Math.ceil((camera.x+canvas.width)/tileSize)+1);
    const maxY=Math.min(worldHeight()-1,Math.ceil((camera.y+canvas.height)/tileSize)+1);
    ctx.save();
    if(layer==="services"||layer==="fields"){
        if(layer==="services"){
            for(const service of getServiceBuildingsForOverlay()){
                if(!service.active)continue;
                if(!isForestSightVisible(service.x,service.y))continue;
                const x=service.x*CELL*zoom-camera.x+CELL*zoom*.5;
                const y=service.y*CELL*zoom-camera.y+CELL*zoom*.5;
                const radius=service.radius*CELL*zoom;
                const colors={water:"rgba(84,140,168,",social:"rgba(181,121,66,",safety:"rgba(123,139,87,",health:"rgba(154,109,126,"};
                ctx.fillStyle=(colors[service.category]||"rgba(228,189,114,")+"0.12)";
                ctx.strokeStyle=(colors[service.category]||"rgba(228,189,114,")+"0.58)";
                ctx.lineWidth=1.2;
                ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
            }
        }else{
            for(const entity of state.entities){
                if(entity.dead||!entity.field)continue;
                drawFieldTile(ctx,entity,zoom,camera,0.72);
            }
        }
        ctx.restore();
        return;
    }
    if(layer==="biomes"){
        const cells=getBiomeOverlayCells();
        const showForestPoints=shouldDrawForestPoints(state.zoomLevel,layer);
        // A separate budgeted reading of the same discovered regions. Bars are
        // the low-detail aggregate; detail 3 adds a few clustered points per
        // family, so the atlas never paints every sampled tile at once.
        const densityById=new Map(getBiomeDensityCells(state.renderedFrames).map(cell=>[cell.id,cell]));
        for(const cell of cells){
            const left=cell.x*tileSize-camera.x,top=cell.y*tileSize-camera.y;
            const width=cell.width*tileSize,height=cell.height*tileSize;
            if(left+width<0||top+height<0||left>canvas.width||top>canvas.height)continue;
            ctx.globalAlpha=.08+Math.max(0,Math.min(100,Number(cell.health)||0))/600;
            ctx.fillStyle=cell.color;
            ctx.fillRect(left,top,width,height);
            if(cell.seasonTint){
                // A low-alpha seasonal wash changes the biome face without
                // replacing the region colour or adding per-tile draw work.
                ctx.globalAlpha=Math.max(0,Math.min(.2,Number(cell.seasonTintAlpha)||.08));
                ctx.fillStyle=cell.seasonTint;
                ctx.fillRect(left,top,width,height);
            }
            ctx.globalAlpha=.48;
            ctx.strokeStyle=cell.color;
            ctx.lineWidth=Math.max(1,tileSize*.04);
            ctx.strokeRect(left,top,width,height);
            const markerColors={ore:"#c3b7a2",stone:"#d0c7b7",gem:"#9fd0e0",salt:"#f0ece3",herb:"#8fbf7a",wood:"#75a958",fish:"#78b6d0",fruit:"#d9a05b",fungus:"#b58b6a",fiber:"#c6c08a",dye:"#b07cc6",poison:"#9a6fa8",animal:"#c98a6a",fantastic:"#9fd7ff",grain:"#d8c070",spice:"#d98d4a"};
            const markerSize=Math.max(1.5,Math.min(4,tileSize*.16));
            const families=densityById.get(cell.id)?.families||[];
            if(families.length){
                // One compact bar segment per discovered family. The bar is
                // the quantitative aggregate and stays legible at low zoom.
                const gap=Math.max(1,tileSize*.06);
                const barHeight=Math.max(2,Math.min(6,tileSize*.42));
                const usableWidth=Math.max(2,width-gap*(families.length+1));
                const weights=families.map(family=>Math.max(0,Number(family.capacity)||0) || Math.max(1,family.value||0));
                const weightTotal=weights.reduce((sum,weight)=>sum+weight,0) || 1;
                let barX=left+gap;
                const barY=top+height-barHeight-gap;
                for(let index=0;index<families.length;index++){
                    const family=families[index];
                    // Segment length is the sampled capacity share; opacity
                    // keeps the local suitability readable on top of it.
                    const barWidth=Math.max(2,usableWidth*weights[index]/weightTotal);
                    ctx.globalAlpha=.18+Math.max(0,Math.min(100,family.value||0))/180;
                    ctx.fillStyle=family.color;
                    ctx.fillRect(barX,barY,barWidth,barHeight);
                    barX+=barWidth+gap;
                }
                if(showForestPoints){
                    const pointSize=Math.max(1.2,Math.min(3.2,tileSize*.075));
                    for(const family of families){
                        for(const point of family.points||[]){
                            const px=point.x*tileSize-camera.x,py=point.y*tileSize-camera.y;
                            if(px<-pointSize||py<-pointSize||px>canvas.width+pointSize||py>canvas.height+pointSize)continue;
                            ctx.globalAlpha=.32+Math.max(0,Math.min(100,point.value||0))/190;
                            ctx.fillStyle=family.color;
                            ctx.fillRect(px-pointSize*.5,py-pointSize*.5,pointSize,pointSize);
                        }
                    }
                }
            }
            for(const marker of cell.markers||[]){
                const mx=marker.x*tileSize-camera.x,my=marker.y*tileSize-camera.y;
                if(mx<-markerSize||my<-markerSize||mx>canvas.width+markerSize||my>canvas.height+markerSize)continue;
                ctx.globalAlpha=marker.rare?.95:.66;
                ctx.fillStyle=markerColors[marker.category]||"#e4bd72";
                ctx.fillRect(mx-markerSize*.5,my-markerSize*.5,markerSize,markerSize);
            }
            for(const refuge of cell.refuges||[]){
                const mx=refuge.x*tileSize-camera.x,my=refuge.y*tileSize-camera.y;
                if(mx<-4||my<-4||mx>canvas.width+4||my>canvas.height+4)continue;
                ctx.globalAlpha=.9;
                ctx.fillStyle=refuge.endangered?"#d98282":"#e9dfc8";
                ctx.beginPath();ctx.moveTo(mx,my-markerSize*.8);ctx.lineTo(mx+markerSize*.8,my);ctx.lineTo(mx,my+markerSize*.8);ctx.lineTo(mx-markerSize*.8,my);ctx.closePath();ctx.fill();
            }
            if(cell.protectedArea){
                ctx.globalAlpha=.8;ctx.strokeStyle="#8fd0a0";ctx.lineWidth=Math.max(1,tileSize*.06);
                ctx.setLineDash([Math.max(3,tileSize*.4),Math.max(2,tileSize*.24)]);
                ctx.strokeRect(left+2,top+2,Math.max(2,width-4),Math.max(2,height-4));
                ctx.setLineDash([]);
            }
        }
        ctx.globalAlpha=1;
        // Forest survey stipple. Levels 1 and 2 keep a sparse reading so the
        // region fill remains legible; the third tier switches to one point per
        // forest tile, which is the condensed green carpet the atlas promises.
        // Reading the compact geography arrays avoids rebuilding a forest
        // stand per sampled tile and keeps this bounded to the visible window.
        const forestTier=showForestPoints?3:(state.zoomLevel===2?2:1);
        if(layer==="biomes"){
            if(forestTier===3){
                // Detail 3 is a stipple, not four oversized beads per tile. A
                // 3x3-5x5 grid with a hashed phase fills the woodland with fine
                // points; immediate fillRect calls keep the draw bounded.
                const side=Math.max(3,Math.min(5,Math.round(tileSize/15)));
                const total=side*side;
                const radius=Math.max(1.45,Math.min(2.6,tileSize*.04));
                const size=radius*2;
                ctx.fillStyle="#a9ee7a";
                ctx.globalAlpha=.9;
                for(let y=minY;y<=maxY;y++){
                    for(let x=minX;x<=maxX;x++){
                        if(!state.explored?.[x]?.[y])continue;
                        const share=forestCoverShareAt(x,y);
                        if(share<.08)continue;
                        const left=x*tileSize-camera.x,top=y*tileSize-camera.y;
                        const noise=(Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b))>>>0;
                        const count=Math.max(1,Math.round(total*(.4+share*.6)));
                        const phase=noise%total;
                        for(let i=0;i<count;i++){
                            // 7 is coprime with 16, 25 and 36, so each slot is
                            // visited once before the chosen points wrap.
                            const slot=(phase+i*7)%total;
                            const col=slot%side,row=Math.floor(slot/side);
                            const ox=(col+.5)/side;
                            const oy=(row+.5)/side;
                            const jitterX=(((noise>>(i*3+4))&7)/7-.5)*.16;
                            const jitterY=(((noise>>(i*3+7))&7)/7-.5)*.16;
                            const px=left+(ox+jitterX)*tileSize-size*.5;
                            const py=top+(oy+jitterY)*tileSize-size*.5;
                            ctx.fillRect(px,py,size,size);
                        }
                    }
                }
            }else{
                const sample=forestTier===2?3:6;
                const radius=forestTier===2
                    ?Math.max(1.8,tileSize*sample*.075)
                    :Math.max(1.8,tileSize*sample*.13);
                ctx.fillStyle=forestTier===2?"#80c26e":"#6ea45e";
                for(let y=minY;y<=maxY;y+=sample){
                    for(let x=minX;x<=maxX;x+=sample){
                        if(!state.explored?.[x]?.[y])continue;
                        const share=forestCoverShareAt(x,y);
                        if(share<.08)continue;
                        const left=x*tileSize-camera.x,top=y*tileSize-camera.y;
                        const noise=(Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b))>>>0;
                        const driftX=((noise&7)/7-.5)*.2;
                        const driftY=(((noise>>3)&7)/7-.5)*.2;
                        ctx.globalAlpha=.44+share*.44;
                        const px=left+(.5+driftX)*tileSize;
                        const py=top+(.5+driftY)*tileSize;
                        ctx.beginPath();
                        ctx.arc(px,py,radius,0,Math.PI*2);
                        ctx.fill();
                    }
                }
            }
        }
        ctx.globalAlpha=1;
        ctx.restore();
        return;
    }
    if(layer==="roads"){
        const roads=getRoadTiles();
        ctx.globalAlpha=.42;
        for(const road of roads){
            if(road.x<minX||road.x>maxX||road.y<minY||road.y>maxY)continue;
            if(!state.explored?.[road.x]?.[road.y])continue;
            const style=ROAD_TYPES[road.type];
            if(!style)continue;
            const x=road.x*tileSize-camera.x+tileSize*.5;
            const y=road.y*tileSize-camera.y+tileSize*.5;
            ctx.fillStyle=style.color;
            ctx.beginPath();
            ctx.arc(x,y,Math.max(2.5,tileSize*.52),0,Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
        return;
    }
    const sample=Math.max(2,Math.ceil(4/Math.max(.35,zoom)));
    for(let y=minY;y<=maxY;y+=sample){
        for(let x=minX;x<=maxX;x+=sample){
            if(!state.explored?.[x]?.[y])continue;
            if(!isForestSightVisible(x+.5,y+.5))continue;
            let node;
            try{node=getResourceNodeAt(x,y);}catch{continue;}
            if(!node)continue;
            const px=x*tileSize-camera.x+tileSize*.5;
            const py=y*tileSize-camera.y+tileSize*.5;
            const size=Math.max(3,tileSize*sample*.62);
            if(layer==="resources"){
                const forest=node.forestCapacity?Math.max(0,Math.min(1,node.forestStock/node.forestCapacity)):0;
                const stone=node.stoneCapacity?Math.max(0,Math.min(1,node.stoneStock/node.stoneCapacity)):0;
                if(forest>.03){
                    ctx.globalAlpha=.18+forest*.62;
                    ctx.fillStyle="#5f8f54";
                    ctx.fillRect(px-size*.5,py-size*.5,size,size);
                }
                if(stone>.03){
                    ctx.globalAlpha=.16+stone*.58;
                    ctx.fillStyle="#a9a39a";
                    ctx.beginPath();
                    ctx.moveTo(px,py-size*.42);ctx.lineTo(px+size*.4,py);
                    ctx.lineTo(px,py+size*.42);ctx.lineTo(px-size*.4,py);ctx.closePath();ctx.fill();
                }
                if(Number(node.fertility)>=55){
                    ctx.globalAlpha=.35;
                    ctx.fillStyle="#d2b262";
                    ctx.beginPath();ctx.arc(px,py,Math.max(1.5,size*.16),0,Math.PI*2);ctx.fill();
                }
            }else if(layer==="fertility"){
                const fertility=Math.max(0,Math.min(1,Number(node.fertility)/100));
                ctx.globalAlpha=.18+fertility*.52;
                ctx.fillStyle="rgb("+(Math.round(93+55*fertility))+","+(Math.round(75+105*fertility))+","+(Math.round(50+35*fertility))+")";
                ctx.fillRect(px-size*.5,py-size*.5,size,size);
            }
        }
    }
    ctx.globalAlpha=1;
    ctx.restore();
}

function fieldColor(stage){
    return {fallow:"#9b8156",sown:"#b9a45c",growing:"#71934d",ripe:"#d8ac45",harvested:"#8a7450"}[stage]||"#9b8156";
}
function drawForesterStewardshipOverlay(ctx,zoom,camera,canvas){
    const selected=state.entities.find(entity=>!entity.dead&&entity.type===TYPE.FORESTER&&String(entity.id)===String(state.selectedBuildingId));
    if(!selected)return;
    if(!isForestSightVisible(selected.x,selected.y))return;
    const cellPx=CELL*zoom;
    if(cellPx<10)return;
    const x=Math.floor(selected.x),y=Math.floor(selected.y),radius=5;
    const left=(x-radius)*cellPx-camera.x,top=(y-radius)*cellPx-camera.y;
    const size=(radius*2+1)*cellPx;
    if(left+size<0||top+size<0||left>canvas.width||top>canvas.height)return;
    ctx.save();
    ctx.setLineDash([Math.max(4,cellPx*.13),Math.max(3,cellPx*.09)]);
    ctx.lineWidth=Math.max(1,zoom*1.1);
    ctx.strokeStyle="rgba(209,180,118,.5)";
    ctx.strokeRect(left,top,size,size);
    ctx.setLineDash([]);
    for(let oy=-radius;oy<=radius;oy++){
        for(let ox=-radius;ox<=radius;ox++){
            const node=getResourceNodeAt(x+ox,y+oy);
            if(!node||node.forestCapacity<=0||node.forestStock>=node.forestCapacity)continue;
            const ratio=node.forestStock/Math.max(1,node.forestCapacity);
            const px=(x+ox+.5)*cellPx-camera.x;
            const py=(y+oy+.5)*cellPx-camera.y;
            if(px< -cellPx||py< -cellPx||px>canvas.width+cellPx||py>canvas.height+cellPx)continue;
            ctx.beginPath();
            ctx.arc(px,py,Math.max(3,cellPx*.085),0,Math.PI*2);
            ctx.fillStyle=ratio<=0?"#e9857b":ratio<.5?"#e4bd72":"#a3d6a7";
            ctx.globalAlpha=.92;
            ctx.fill();
            ctx.globalAlpha=1;
            ctx.lineWidth=Math.max(1,cellPx*.018);
            ctx.strokeStyle="rgba(15,22,13,.85)";
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawFieldTile(ctx,entity,zoom,camera,alpha=1){
    if(!isForestSightVisible(entity.x,entity.y))return;
    const tile=CELL*zoom,x=entity.x*tile-camera.x,y=entity.y*tile-camera.y;
    const size=tile*1.9;
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=fieldColor(entity.field?.stage);
    ctx.fillRect(x-size*.5+tile*.5,y-size*.5+tile*.5,size,size);
    ctx.strokeStyle="rgba(54,43,26,.55)";ctx.lineWidth=Math.max(.7,tile*.035);
    for(let row=0;row<4;row++){
        const yy=y-size*.5+tile*.5+size*(row+.5)/4;
        ctx.beginPath();ctx.moveTo(x-size*.42+tile*.5,yy);ctx.lineTo(x+size*.42+tile*.5,yy);ctx.stroke();
    }
    ctx.restore();
}
function drawFieldPatches(ctx,zoom,camera,canvas){
    const tile=CELL*zoom;
    if(tile<2)return;
    for(const entity of state.entities){
        if(entity.dead||!entity.field)continue;
        const px=entity.x*tile-camera.x,py=entity.y*tile-camera.y;
        if(px< -tile*4||py< -tile*4||px>canvas.width+tile*4||py>canvas.height+tile*4)continue;
        drawFieldTile(ctx,entity,zoom,camera,0.55);
    }
}
function drawConstructionSites(ctx,zoom,camera,canvas){
    const tile=CELL*zoom;
    if(tile<3)return;
    ctx.save();
    for(const entity of state.entities){
        const construction=entity.construction;
        if(entity.dead||!construction||construction.stage>=3)continue;
        if(!isForestSightVisible(entity.x,entity.y))continue;
        const px=entity.x*tile-camera.x,py=entity.y*tile-camera.y;
        if(px< -tile*4||py< -tile*4||px>canvas.width+tile*4||py>canvas.height+tile*4)continue;
        const width=tile*1.65,height=tile*1.65;
        const x=px-width*.32,y=py-height*.32;
        ctx.fillStyle="rgba(52,41,28,.34)";ctx.fillRect(x,y,width,height);
        ctx.strokeStyle="rgba(228,189,114,.9)";ctx.lineWidth=Math.max(1,tile*.06);
        ctx.setLineDash([Math.max(2,tile*.16),Math.max(2,tile*.12)]);
        ctx.strokeRect(x,y,width,height);ctx.setLineDash([]);
        for(let i=0;i<3;i++){
            ctx.beginPath();ctx.moveTo(x+width*(.2+i*.28),y+height*.8);ctx.lineTo(x+width*(.2+i*.28),y+height*.2);ctx.stroke();
        }
        const percent=Math.max(0,Math.min(1,((construction.stage||0)+(Number(construction.progress)||0))/3));
        const barW=Math.max(24,tile*1.4),barH=Math.max(3,tile*.1);
        ctx.fillStyle="rgba(27,22,16,.78)";ctx.fillRect(x,y-7,barW,barH);
        ctx.fillStyle=construction.paused?"#b57942":"#8dbd72";ctx.fillRect(x,y-7,barW*percent,barH);
    }
    ctx.restore();
}
function drawLogisticsRoutes(ctx,zoom,camera,canvas){
    if(state.mapLayer!=="logistics")return;
    const tile=CELL*zoom;
    if(tile<2)return;
    let snapshot;
    try{snapshot=getLogisticsSnapshot();}catch{return;}
    ctx.save();ctx.lineWidth=Math.max(1.2,tile*.07);
    for(const job of snapshot.jobs||[]){
        const from=state.entities.find(entity=>!entity.dead&&entity.id===job.from?.id);
        const to=state.entities.find(entity=>!entity.dead&&entity.id===job.to?.id);
        if(!from||!to)continue;
        if(!isForestSightVisible(from.x,from.y)||!isForestSightVisible(to.x,to.y))continue;
        const x1=from.x*tile-camera.x+tile*.5,y1=from.y*tile-camera.y+tile*.5;
        const x2=to.x*tile-camera.x+tile*.5,y2=to.y*tile-camera.y+tile*.5;
        ctx.strokeStyle=job.status==="blocked"||job.reason?"rgba(164,71,57,.8)":"rgba(93,124,137,.82)";
        ctx.setLineDash(job.status==="blocked"||job.reason?[6,5]:[2,4]);
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
        ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x1,y1,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x2,y2,2.5,0,Math.PI*2);ctx.fill();
    }
    ctx.setLineDash([]);ctx.restore();
}
function drawCarriers(ctx,zoom,camera,canvas){
    if(zoom<.45)return;
    let carriers;
    try{carriers=getCarriersForRender();}catch{return;}
    const now=performance.now();
    if(now>=visibleCarrierIdsUntil){
        visibleCarrierIdsUntil=now+100;
        visibleCarrierIdsCache=new Set(carriers
            .filter(carrier=>isForestSightVisible(carrier.x,carrier.y))
            .map(carrier=>carrier.id));
    }
    const tile=CELL*zoom;
    ctx.save();
    for(const carrier of carriers){
        if(!visibleCarrierIdsCache.has(carrier.id))continue;
        const x=carrier.x*tile-camera.x,y=carrier.y*tile-camera.y;
        if(x< -tile||y< -tile||x>canvas.width+tile||y>canvas.height+tile)continue;
        ctx.fillStyle="rgba(228,189,114,.95)";ctx.strokeStyle="#4a3425";ctx.lineWidth=Math.max(1,tile*.05);
        ctx.beginPath();ctx.arc(x,y,Math.max(3,tile*.2),0,Math.PI*2);ctx.fill();ctx.stroke();
        if(carrier.cargo){ctx.fillStyle="#d8c59d";ctx.fillRect(x-tile*.13,y-tile*.28,tile*.26,tile*.2);ctx.strokeRect(x-tile*.13,y-tile*.28,tile*.26,tile*.2);}
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

