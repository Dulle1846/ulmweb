// ═══════════════════════════════════════════════════════════════
//  RENDERER — Haupt-Render-Pipeline mit Zoom-Levels
// ═══════════════════════════════════════════════════════════════

import { CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { TYPE } from '../../core/types.js';
import { drawTerrain } from './terrain.js';
import { drawEntity } from './entities.js';
import { drawPlacementPreview } from './placement-preview.js';
import { getRoadTiles,getRoadAt,ROAD_TYPES } from '../../systems/roads.js';
import { getResourceNodeAt } from '../../systems/resource-geography.js';
import { getServiceBuildingsForOverlay } from '../../systems/settlement.js';
import { getLogisticsSnapshot } from '../../systems/logistics.js';
import { worldWidth,worldHeight } from '../../world/world.js';
import { drawWeatherOverlay } from './weather-overlay.js';
import { drawDaylightOverlay } from './daylight.js';

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
    drawFieldPatches(ctx,zoom,camera,canvas);
    drawMapLayer(ctx,zoom,camera,canvas);
    drawForesterStewardshipOverlay(ctx,zoom,camera,canvas);
    drawLogisticsRoutes(ctx,zoom,camera,canvas);

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
    drawConstructionSites(ctx,zoom,camera,canvas);
    drawCarriers(ctx,zoom,camera,canvas);

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
    let snapshot;
    try{snapshot=getLogisticsSnapshot();}catch{return;}
    const tile=CELL*zoom;
    ctx.save();
    for(const carrier of snapshot.carriers||[]){
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

