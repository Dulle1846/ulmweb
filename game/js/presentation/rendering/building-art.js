// ═══════════════════════════════════════════════════════════════
//  BUILDING ART — every structure has its own silhouette
//  Rooftop plans (detail level 3) and interiors (detail level 4).
// ═══════════════════════════════════════════════════════════════

import { CELL, BUILDING_SIZE, BUILDING_ROOF_COLOR, BUILDING_ICON } from '../../core/config.js';
import { TYPE } from '../../core/types.js';
import { state } from '../../core/state.js';
import { PLAN, normalizeLayout, roomsOf } from '../building-layout.js';
import { getRoomFurniturePlan, MAX_FURNITURE_PER_ROOM } from '../../systems/furniture.js';

// Cost of rebuilding a structure in the workshop, in materials.
export const REBUILD_COST = {
    [TYPE.KEEP]: { wood: 60, stone: 60, gold: 20 },
    [TYPE.HOUSE]: { wood: 22, stone: 8 },
    [TYPE.FARM]: { wood: 16, food: 10 },
    [TYPE.LUMBER]: { wood: 26, stone: 6 },
    [TYPE.QUARRY]: { wood: 24, stone: 12 },
    [TYPE.TOWER]: { wood: 18, stone: 24 },
    [TYPE.WALL]: { stone: 10 },
    [TYPE.TAVERN]: { wood: 30, stone: 10, gold: 8 },
    [TYPE.TEMPLE]: { stone: 30, gold: 10 },
    [TYPE.BARRACKS]: { wood: 28, stone: 16, gold: 6 },
    [TYPE.MILL]: { wood: 24, stone: 8 },
    [TYPE.STABLE]: { wood: 24, food: 8 },
    [TYPE.WONDER]: { stone: 70, gold: 40 },
    [TYPE.GOLDMINE]: { wood: 30, stone: 18 },
    [TYPE.BARREL]: { wood: 4 },
    [TYPE.TENT]: { wood: 8, food: 8 },
    [TYPE.STONE_HOUSE]: { wood: 18, stone: 30 },
    [TYPE.WAREHOUSE]: { wood: 34, stone: 14 },
    [TYPE.SAWMILL]: { wood: 28, stone: 10 },
    [TYPE.BAKERY]: { wood: 22, stone: 14 },
    [TYPE.WELL]: { wood: 8, stone: 18 },
    [TYPE.MASON]: { wood: 20, stone: 22 },
    [TYPE.FORESTER]: { wood: 16, stone: 4 },
    [TYPE.CLINIC]: { wood: 24, stone: 18, gold: 6 },
    [TYPE.MARKET]: { wood: 26, stone: 8 },
    [TYPE.SHRINE]: { wood: 6, stone: 18, gold: 4 },
    [TYPE.COURT]: { wood: 30, stone: 24, gold: 10 },
    [TYPE.PRISON]: { wood: 22, stone: 30, gold: 8 },
};

export const INTERIOR_ITEM_IDS = ['bed', 'table', 'chair', 'shelf', 'hearth', 'rug', 'statue', 'candle'];

export const INTERIOR_ITEMS = {
    bed:    { label: 'Bed',    icon: '🛏️' },
    table:  { label: 'Table',  icon: '🪵' },
    chair:  { label: 'Chair',  icon: '🪑' },
    shelf:  { label: 'Shelf',  icon: '📚' },
    hearth: { label: 'Hearth', icon: '🔥' },
    rug:    { label: 'Rug',    icon: '🧶' },
    statue: { label: 'Statue', icon: '🗿' },
    candle: { label: 'Candle', icon: '🕯️' },
};

const DEFAULT_INTERIOR = {
    [TYPE.KEEP]:     { bed: 2, table: 2, chair: 4, shelf: 2, hearth: 1, rug: 2, statue: 3, candle: 6 },
    [TYPE.HOUSE]:    { bed: 2, table: 1, chair: 2, shelf: 1, hearth: 1, rug: 1, statue: 0, candle: 2 },
    [TYPE.FARM]:     { bed: 1, table: 1, chair: 1, shelf: 2, hearth: 1, rug: 0, statue: 0, candle: 1 },
    [TYPE.LUMBER]:   { bed: 0, table: 1, chair: 1, shelf: 2, hearth: 0, rug: 0, statue: 0, candle: 1 },
    [TYPE.QUARRY]:   { bed: 0, table: 1, chair: 1, shelf: 1, hearth: 0, rug: 0, statue: 0, candle: 1 },
    [TYPE.GOLDMINE]: { bed: 0, table: 1, chair: 1, shelf: 1, hearth: 0, rug: 0, statue: 0, candle: 1 },
    [TYPE.TOWER]:    { bed: 1, table: 1, chair: 1, shelf: 1, hearth: 0, rug: 0, statue: 1, candle: 2 },
    [TYPE.WALL]:     { bed: 0, table: 0, chair: 0, shelf: 0, hearth: 0, rug: 0, statue: 1, candle: 1 },
    [TYPE.TAVERN]:   { bed: 3, table: 3, chair: 6, shelf: 2, hearth: 1, rug: 2, statue: 0, candle: 4 },
    [TYPE.TEMPLE]:   { bed: 0, table: 1, chair: 4, shelf: 2, hearth: 0, rug: 2, statue: 3, candle: 6 },
    [TYPE.BARRACKS]: { bed: 6, table: 2, chair: 4, shelf: 2, hearth: 1, rug: 1, statue: 1, candle: 3 },
    [TYPE.MILL]:     { bed: 1, table: 1, chair: 1, shelf: 2, hearth: 1, rug: 1, statue: 0, candle: 2 },
    [TYPE.STABLE]:   { bed: 1, table: 1, chair: 1, shelf: 2, hearth: 0, rug: 0, statue: 0, candle: 1 },
    [TYPE.WONDER]:   { bed: 0, table: 0, chair: 0, shelf: 0, hearth: 0, rug: 1, statue: 6, candle: 8 },
    [TYPE.BARREL]:   { bed: 0, table: 0, chair: 0, shelf: 1, hearth: 0, rug: 0, statue: 0, candle: 0 },
    [TYPE.TENT]:     { bed: 2, table: 0, chair: 1, shelf: 0, hearth: 1, rug: 1, statue: 0, candle: 1 },
    [TYPE.STONE_HOUSE]: { bed: 3, table: 2, chair: 3, shelf: 2, hearth: 1, rug: 2, statue: 1, candle: 4 },
    [TYPE.WAREHOUSE]: { bed: 0, table: 1, chair: 1, shelf: 5, hearth: 0, rug: 0, statue: 0, candle: 2 },
    [TYPE.SAWMILL]:  { bed: 0, table: 1, chair: 1, shelf: 3, hearth: 0, rug: 0, statue: 0, candle: 1 },
    [TYPE.BAKERY]:   { bed: 1, table: 1, chair: 1, shelf: 3, hearth: 2, rug: 0, statue: 0, candle: 2 },
    [TYPE.WELL]:     { bed: 0, table: 0, chair: 0, shelf: 0, hearth: 0, rug: 0, statue: 0, candle: 1 },
    [TYPE.MASON]:    { bed: 0, table: 1, chair: 1, shelf: 3, hearth: 0, rug: 0, statue: 1, candle: 1 },
    [TYPE.FORESTER]: { bed: 1, table: 1, chair: 1, shelf: 2, hearth: 1, rug: 0, statue: 0, candle: 1 },
    [TYPE.CLINIC]:   { bed: 4, table: 1, chair: 2, shelf: 3, hearth: 1, rug: 1, statue: 0, candle: 3 },
    [TYPE.MARKET]:   { bed: 0, table: 1, chair: 2, shelf: 3, hearth: 0, rug: 0, statue: 1, candle: 2 },
};

export function defaultInterior(type) {
    return { ...(DEFAULT_INTERIOR[type] || DEFAULT_INTERIOR[TYPE.HOUSE]) };
}

export function normalizeInterior(type, interior) {
    const merged = defaultInterior(type);
    for (const id of INTERIOR_ITEM_IDS) {
        const value = Number(interior?.[id]);
        if (Number.isFinite(value)) merged[id] = Math.max(0, Math.min(12, Math.round(value)));
    }
    return merged;
}

export function buildingName(type) {
    return (BUILDING_ICON[type] ? BUILDING_ICON[type] + ' ' : '') + (TYPE_NAMES[type] || 'STRUCTURE');
}

const TYPE_NAMES = {
    [TYPE.KEEP]: 'ROYAL KEEP',
    [TYPE.HOUSE]: 'COTTAGE',
    [TYPE.FARM]: 'FARMSTEAD',
    [TYPE.LUMBER]: 'LUMBER CAMP',
    [TYPE.QUARRY]: 'STONE QUARRY',
    [TYPE.TOWER]: 'WATCH TOWER',
    [TYPE.WALL]: 'CURTAIN WALL',
    [TYPE.TAVERN]: 'TAVERN',
    [TYPE.TEMPLE]: 'TEMPLE',
    [TYPE.BARRACKS]: 'BARRACKS',
    [TYPE.MILL]: 'WINDMILL',
    [TYPE.STABLE]: 'STABLE',
    [TYPE.WONDER]: 'WONDER',
    [TYPE.GOLDMINE]: 'GOLD MINE',
    [TYPE.BARREL]: 'SUPPLY BARREL',
    [TYPE.TENT]: 'TENT',
    [TYPE.STONE_HOUSE]: 'STONE HOUSE',
    [TYPE.WAREHOUSE]: 'WAREHOUSE',
    [TYPE.SAWMILL]: 'SAWMILL',
    [TYPE.BAKERY]: 'BAKERY',
    [TYPE.WELL]: 'WELL',
    [TYPE.MASON]: "MASON'S YARD",
    [TYPE.FORESTER]: "FORESTER'S LODGE",
    [TYPE.CLINIC]: 'CLINIC',
    [TYPE.MARKET]: 'MARKET',
};

const ROOF_STYLES = {
    [TYPE.KEEP]:     { roof: '#6d6152', wall: '#b8ab90', trim: '#e0c078' },
    [TYPE.HOUSE]:    { roof: '#a94a34', wall: '#d9c7a2', trim: '#6b4a2c' },
    [TYPE.FARM]:     { roof: '#8e7538', wall: '#c9b58a', trim: '#6f5834' },
    [TYPE.LUMBER]:   { roof: '#4d5c3a', wall: '#baa985', trim: '#5c4630' },
    [TYPE.QUARRY]:   { roof: '#6c655c', wall: '#b8b2a4', trim: '#4b4740' },
    [TYPE.GOLDMINE]: { roof: '#8c6c34', wall: '#b3a184', trim: '#e3bc62' },
    [TYPE.TAVERN]:   { roof: '#5f4630', wall: '#d3bd94', trim: '#8e3a2c' },
    [TYPE.TEMPLE]:   { roof: '#d7cfba', wall: '#eee6d2', trim: '#c9a644' },
    [TYPE.BARRACKS]: { roof: '#4c3d2e', wall: '#b8a488', trim: '#8e3a2c' },
    [TYPE.MILL]:     { roof: '#7d5636', wall: '#cdb68e', trim: '#4d3524' },
    [TYPE.STABLE]:   { roof: '#6a4e34', wall: '#c5b08a', trim: '#8f6a3c' },
    [TYPE.WONDER]:   { roof: '#d8b34c', wall: '#efe1b8', trim: '#f8e39a' },
    [TYPE.TOWER]:    { roof: '#6e695c', wall: '#b9b1a0', trim: '#8d8576' },
    [TYPE.WALL]:     { roof: '#8a8578', wall: '#a8a292', trim: '#6c675c' },
    [TYPE.BARREL]:   { roof: '#795a3b', wall: '#a98254', trim: '#4e3a26' },
    [TYPE.TENT]:     { roof: '#8c6d47', wall: '#cbb58b', trim: '#5f4a32' },
    [TYPE.STONE_HOUSE]: { roof: '#5f6258', wall: '#c3bca8', trim: '#6b5a3e' },
    [TYPE.WAREHOUSE]: { roof: '#6d4d32', wall: '#c8b58d', trim: '#4c3927' },
    [TYPE.SAWMILL]:  { roof: '#4d5c3a', wall: '#baa985', trim: '#5c4630' },
    [TYPE.BAKERY]:   { roof: '#9a5538', wall: '#dcc9a0', trim: '#6e442e' },
    [TYPE.WELL]:     { roof: '#5d6b6e', wall: '#aaa99c', trim: '#4b5557' },
    [TYPE.MASON]:    { roof: '#6c655c', wall: '#b8b2a4', trim: '#4b4740' },
    [TYPE.FORESTER]: { roof: '#3f5637', wall: '#b7a781', trim: '#5c4630' },
    [TYPE.CLINIC]:   { roof: '#856c73', wall: '#ddd2c3', trim: '#9a6d7e' },
    [TYPE.MARKET]:   { roof: '#8a5638', wall: '#d3bd94', trim: '#b99a59' },
};

function sizeOf(e) {
    const base = BUILDING_SIZE[e.type] || { w: 1, h: 1 };
    const scale = Math.max(0.25, Math.min(6, Number(e.footprintScale) || 1));
    return { w: base.w * scale, h: base.h * scale };
}

export function footprintOf(e) {
    return sizeOf(e);
}

export function drawAuthoredBuilding(ctx, e, sx, sy, cellPx, tick, options = {}) {
    const { w: bw, h: bh } = sizeOf(e);
    const w = bw * cellPx;
    const h = bh * cellPx;
    const cx = sx + cellPx / 2;
    const cy = sy + cellPx / 2;
    const left = cx - w / 2;
    const top = cy - h / 2;
    const scale = cellPx / CELL;
    const style = variantStyle(ROOF_STYLES[e.type] || ROOF_STYLES[TYPE.HOUSE], e);
    const detail = Math.max(0, Math.min(1.4, ((Math.min(w, h) - 16) / 40)));
    const box = { left, top, w, h, cx, cy, scale, detail, tick, style, e, cellPx };

    ctx.save();
    // Soft two-step shadow keeps footprints grounded.
    roundRect(ctx, left + 5 * scale, top + 5 * scale, w, h, 3 * scale);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fill();
    roundRect(ctx, left + 2 * scale, top + 2 * scale, w, h, 3 * scale);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fill();

    if (options.interior && state.zoomLevel >= 4) drawAuthoredInterior(ctx, box);
    else drawRooftopPlan(ctx, box);

    // Selection ring from the workshop.
    if (state.selectedBuildingId && e.id === state.selectedBuildingId) {
        ctx.strokeStyle = 'rgba(246,214,132,0.95)';
        ctx.lineWidth = Math.max(1.4, 2.2 * scale);
        ctx.setLineDash([5 * scale, 4 * scale]);
        roundRect(ctx, left - 3 * scale, top - 3 * scale, w + 6 * scale, h + 6 * scale, 4 * scale);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

// ── rooftop plans ─────────────────────────────────────────────

function drawRooftopPlan(ctx, box) {
    const { e } = box;
    switch (e.type) {
        case TYPE.KEEP: drawKeep(ctx, box); break;
        case TYPE.FARM: drawFarm(ctx, box); break;
        case TYPE.LUMBER: drawLumber(ctx, box); break;
        case TYPE.QUARRY: drawQuarry(ctx, box); break;
        case TYPE.GOLDMINE: drawGoldMine(ctx, box); break;
        case TYPE.TAVERN: drawTavern(ctx, box); break;
        case TYPE.TEMPLE: drawTemple(ctx, box); break;
        case TYPE.BARRACKS: drawBarracks(ctx, box); break;
        case TYPE.MILL: drawMill(ctx, box); break;
        case TYPE.STABLE: drawStable(ctx, box); break;
        case TYPE.WONDER: drawWonder(ctx, box); break;
        case TYPE.TOWER: drawTower(ctx, box); break;
        case TYPE.WALL: drawWall(ctx, box); break;
        case TYPE.BARREL: drawBarrels(ctx, box); break;
        case TYPE.TENT: drawTent(ctx, box); break;
        case TYPE.WELL: drawWell(ctx, box); break;
        case TYPE.WAREHOUSE: drawWarehouse(ctx, box); break;
        case TYPE.MARKET: drawMarket(ctx, box); break;
        case TYPE.CLINIC: drawClinic(ctx, box); break;
        case TYPE.STONE_HOUSE: drawStoneHouse(ctx, box); break;
        case TYPE.SAWMILL: drawSawmill(ctx, box); break;
        case TYPE.BAKERY: drawBakery(ctx, box); break;
        case TYPE.MASON: drawMason(ctx, box); break;
        case TYPE.FORESTER: drawForester(ctx, box); break;
        default: drawCottage(ctx, box); break;
    }
    drawDoor(ctx, box);
    drawOrientation(ctx, box);
}

function drawTent(ctx, box) {
    const { left, top, w, h, scale, style } = box;
    ctx.fillStyle = style.wall;
    ctx.beginPath();
    ctx.moveTo(left + w * 0.08, top + h * 0.86);
    ctx.lineTo(left + w * 0.5, top + h * 0.12);
    ctx.lineTo(left + w * 0.92, top + h * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.65)';
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.stroke();
    ctx.strokeStyle = style.trim;
    ctx.beginPath();
    ctx.moveTo(left + w * 0.5, top + h * 0.12);
    ctx.lineTo(left + w * 0.5, top + h * 0.09);
    ctx.moveTo(left + w * 0.24, top + h * 0.86);
    ctx.lineTo(left + w * 0.5, top + h * 0.36);
    ctx.lineTo(left + w * 0.76, top + h * 0.86);
    ctx.stroke();
}
function drawStoneHouse(ctx, box) {
    drawCottage(ctx, box);
    const { left, top, w, h, scale } = box;
    ctx.strokeStyle = 'rgba(74,70,60,0.55)';
    ctx.lineWidth = Math.max(0.6, 0.8 * scale);
    for (let row = 1; row < 5; row++) {
        const y = top + h * (0.28 + row * 0.12);
        ctx.beginPath(); ctx.moveTo(left + w * 0.1, y); ctx.lineTo(left + w * 0.9, y); ctx.stroke();
    }
}
function drawWarehouse(ctx, box) {
    baseBuild(ctx, box, 0.12);
    const { left, top, w, h, scale, style } = box;
    ctx.fillStyle = style.trim;
    ctx.fillRect(left + w * 0.17, top + h * 0.45, w * 0.66, h * 0.3);
    ctx.strokeStyle = 'rgba(45,32,22,0.6)';
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeRect(left + w * 0.17, top + h * 0.45, w * 0.66, h * 0.3);
    ctx.beginPath();
    ctx.moveTo(left + w * 0.5, top + h * 0.45);
    ctx.lineTo(left + w * 0.5, top + h * 0.75);
    ctx.stroke();
}
function drawMarket(ctx, box) {
    baseBuild(ctx, box, 0.12);
    const { left, top, w, h, scale, style } = box;
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 1 ? '#d8c59d' : style.roof;
        ctx.fillRect(left + w * (0.12 + i * 0.27), top + h * 0.24, w * 0.26, h * 0.13);
        ctx.strokeStyle = 'rgba(50,35,22,0.5)';
        ctx.lineWidth = Math.max(0.6, 0.8 * scale);
        ctx.strokeRect(left + w * (0.12 + i * 0.27), top + h * 0.24, w * 0.26, h * 0.13);
    }
    ctx.fillStyle = '#c9a24a';
    ctx.beginPath();
    ctx.arc(left + w * 0.5, top + h * 0.62, Math.max(1.5, w * 0.08), 0, Math.PI * 2);
    ctx.fill();
}
function drawWell(ctx, box) {
    const { left, top, w, h, scale, style } = box;
    ctx.fillStyle = style.wall;
    ctx.beginPath();
    ctx.arc(left + w * 0.5, top + h * 0.56, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(42,36,28,0.75)';
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.stroke();
    ctx.fillStyle = '#365e70';
    ctx.beginPath();
    ctx.arc(left + w * 0.5, top + h * 0.56, Math.min(w, h) * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = style.trim;
    ctx.beginPath();
    ctx.moveTo(left + w * 0.28, top + h * 0.5);
    ctx.lineTo(left + w * 0.28, top + h * 0.2);
    ctx.lineTo(left + w * 0.72, top + h * 0.2);
    ctx.lineTo(left + w * 0.72, top + h * 0.5);
    ctx.stroke();
}
function drawClinic(ctx, box) {
    drawTemple(ctx, box);
    const { left, top, w, h, scale } = box;
    ctx.fillStyle = '#f0e6d2';
    ctx.fillRect(left + w * 0.18, top + h * 0.48, w * 0.64, h * 0.22);
    ctx.strokeStyle = '#8e3a2c';
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(left + w * 0.5, top + h * 0.52);
    ctx.lineTo(left + w * 0.5, top + h * 0.66);
    ctx.moveTo(left + w * 0.4, top + h * 0.59);
    ctx.lineTo(left + w * 0.6, top + h * 0.59);
    ctx.stroke();
}
const drawSawmill = (ctx, box) => drawLumber(ctx, box);
const drawBakery = (ctx, box) => drawTavern(ctx, box);
const drawMason = (ctx, box) => drawQuarry(ctx, box);
const drawForester = (ctx, box) => drawLumber(ctx, box);

function baseBuild(ctx, box, roofInset = 0.12) {
    const { left, top, w, h, style, scale } = box;
    ctx.fillStyle = style.wall;
    roundRect(ctx, left, top, w, h, 2.4 * scale);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.55)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.stroke();

    const inset = Math.max(1.5, Math.min(w, h) * roofInset);
    const rx = left + inset, ry = top + inset;
    const rw = w - inset * 2, rh = h - inset * 2;
    ctx.fillStyle = style.roof;
    roundRect(ctx, rx, ry, rw, rh, 2 * scale);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,220,0.18)';
    ctx.fillRect(rx, ry, rw, Math.max(1, rh * 0.1));
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rx, ry + rh - Math.max(1, rh * 0.08), rw, Math.max(1, rh * 0.08));

    // Tile / shingle courses give every roof a readable material at a glance.
    if (Math.min(w, h) > 26) {
        ctx.strokeStyle = 'rgba(20,14,8,0.13)';
        ctx.lineWidth = Math.max(0.6, 0.8 * scale);
        const rows = Math.max(2, Math.min(5, Math.floor(rh / (9 * scale))));
        for (let i = 1; i < rows; i++) {
            const y = ry + rh * i / rows;
            ctx.beginPath();
            ctx.moveTo(rx + rw * 0.06, y);
            ctx.lineTo(rx + rw * 0.94, y);
            ctx.stroke();
        }
    }
    return { rx, ry, rw, rh };
}

function drawKeep(ctx, box) {
    const { cx, cy, scale, tick, style } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.03);
    const tower = Math.min(rw, rh) * 0.2;
    const wall = Math.max(2.5, tower * 0.5);

    // Curtain wall and courtyard.
    ctx.fillStyle = lighten(style.wall, 8);
    ctx.fillRect(rx, ry, rw, wall);
    ctx.fillRect(rx, ry + rh - wall, rw, wall);
    ctx.fillRect(rx, ry, wall, rh);
    ctx.fillRect(rx + rw - wall, ry, wall, rh);
    ctx.fillStyle = 'rgba(104, 88, 62, 0.62)';
    ctx.fillRect(rx + wall, ry + wall, rw - wall * 2, rh - wall * 2);
    ctx.fillStyle = 'rgba(255,246,220,0.08)';
    ctx.fillRect(rx + wall, ry + wall, rw - wall * 2, Math.max(1, rh * 0.04));

    // Crenellations along the curtain wall.
    ctx.fillStyle = lighten(style.wall, 20);
    const merlon = Math.max(2, rw * 0.035);
    for (let x = rx + merlon * 0.4; x < rx + rw - merlon; x += merlon * 2) {
        ctx.fillRect(x, ry, merlon, Math.max(1.6, rh * 0.035));
        ctx.fillRect(x, ry + rh - Math.max(1.6, rh * 0.035), merlon, Math.max(1.6, rh * 0.035));
    }

    // Corner towers with slate caps and gold finials.
    for (const [tx, ty] of [
        [rx + tower * 0.55, ry + tower * 0.55],
        [rx + rw - tower * 0.55, ry + tower * 0.55],
        [rx + tower * 0.55, ry + rh - tower * 0.55],
        [rx + rw - tower * 0.55, ry + rh - tower * 0.55],
    ]) {
        ctx.fillStyle = style.wall;
        ctx.beginPath();
        ctx.arc(tx, ty, tower * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,20,0.55)';
        ctx.lineWidth = Math.max(1, 1.1 * scale);
        ctx.stroke();
        ctx.fillStyle = '#534b41';
        ctx.beginPath();
        ctx.arc(tx, ty, tower * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8c46a';
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1.2, tower * 0.13), 0, Math.PI * 2);
        ctx.fill();
    }

    // Central keep with a pitched roof.
    const kw = rw * 0.36, kh = rh * 0.4;
    const kx = cx - kw / 2, ky = cy - kh / 2;
    ctx.fillStyle = lighten(style.wall, 14);
    ctx.fillRect(kx, ky, kw, kh);
    ctx.strokeStyle = 'rgba(50,38,24,0.55)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.strokeRect(kx, ky, kw, kh);
    ctx.fillStyle = '#7f3a2d';
    ctx.beginPath();
    ctx.moveTo(kx - kw * 0.1, ky + kh * 0.18);
    ctx.lineTo(cx, ky - kh * 0.08);
    ctx.lineTo(kx + kw * 1.1, ky + kh * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,226,170,0.55)';
    ctx.fillRect(kx + kw * 0.18, ky + kh * 0.42, kw * 0.16, kh * 0.14);
    ctx.fillRect(kx + kw * 0.66, ky + kh * 0.42, kw * 0.16, kh * 0.14);

    // Royal banner above the gate.
    const flag = Math.sin(tick * 0.09) * 2 * scale;
    ctx.strokeStyle = '#4a3a26';
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    ctx.beginPath();
    ctx.moveTo(cx, ry - 3 * scale);
    ctx.lineTo(cx, ry - 15 * scale);
    ctx.stroke();
    ctx.fillStyle = '#8e3a2c';
    ctx.beginPath();
    ctx.moveTo(cx + 1, ry - 15 * scale);
    ctx.lineTo(cx + 10 * scale + flag, ry - 12 * scale);
    ctx.lineTo(cx + 1, ry - 8 * scale);
    ctx.closePath();
    ctx.fill();
}

// Small per-instance palette shifts keep repeated buildings from looking
// stamped from one template without abandoning each type's identity.
function variantStyle(style, e) {
    const seed = Math.abs(Math.floor((Number(e.id) || 0) * 2654435761 + (Number(e.x) || 0) * 97 + (Number(e.y) || 0) * 131)) % 997;
    return {
        ...style,
        wall: lighten(style.wall, (seed % 7) - 3),
        roof: lighten(style.roof, ((seed >> 3) % 13) - 6),
    };
}

function lighten(color, amount) {
    const value = String(color).replace('#', '');
    const num = parseInt(value.length === 3 ? value.split('').map(c => c + c).join('') : value, 16);
    if (!Number.isFinite(num)) return color;
    const r = Math.min(255, ((num >> 16) & 255) + amount);
    const g = Math.min(255, ((num >> 8) & 255) + amount);
    const b = Math.min(255, (num & 255) + amount);
    return `rgb(${r},${g},${b})`;
}

function drawCottage(ctx, box) {
    const { style, detail, tick, scale, cx } = box;
    const roof = baseBuild(ctx, box, 0.14);
    const { rx, ry, rw, rh } = roof;
    // Ridge beam and timber frame.
    ctx.strokeStyle = 'rgba(60,40,24,0.55)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.beginPath();
    ctx.moveTo(roof.rx, box.cy);
    ctx.lineTo(roof.rx + roof.rw, box.cy);
    ctx.stroke();
    if (detail > 0.3) {
        ctx.strokeStyle = 'rgba(92,68,42,0.75)';
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.1, ry + rh * 0.12);
        ctx.lineTo(rx + rw * 0.1, ry + rh * 0.88);
        ctx.moveTo(rx + rw * 0.9, ry + rh * 0.12);
        ctx.lineTo(rx + rw * 0.9, ry + rh * 0.88);
        ctx.stroke();
        // Chimney placement varies per building, with a lazy smoke plume.
        const variant = (Math.abs(Math.floor((Number(box.e.id) || 0) + (Number(box.e.x) || 0) * 7)) % 4);
        const chx = rx + rw * (variant % 2 ? 0.2 : 0.76), chy = ry + rh * 0.08;
        ctx.fillStyle = '#5a4530';
        ctx.fillRect(chx, chy, 5 * scale, 7 * scale);
        const puff = (tick * 0.018 + box.e.x * 0.1) % 1;
        ctx.fillStyle = `rgba(228,222,208,${0.26 - puff * 0.2})`;
        ctx.beginPath();
        ctx.arc(chx + 2.5 * scale, chy - 4 * scale - puff * 12 * scale, (2 + puff * 3.5) * scale, 0, Math.PI * 2);
        ctx.fill();
        if (variant === 2) {
            // Dormer window tucked into the roof.
            ctx.fillStyle = '#d9c7a2';
            ctx.fillRect(cx - 5 * scale, ry + rh * 0.1, 10 * scale, 5 * scale);
            ctx.fillStyle = '#7b4a30';
            ctx.beginPath();
            ctx.moveTo(cx - 7 * scale, ry + rh * 0.1);
            ctx.lineTo(cx, ry + rh * 0.1 - 5 * scale);
            ctx.lineTo(cx + 7 * scale, ry + rh * 0.1);
            ctx.closePath();
            ctx.fill();
        } else if (variant === 3) {
            // Diagonal timber bracing.
            ctx.strokeStyle = 'rgba(80,56,34,0.6)';
            ctx.beginPath();
            ctx.moveTo(rx + rw * 0.12, ry + rh * 0.14);
            ctx.lineTo(rx + rw * 0.32, ry + rh * 0.5);
            ctx.moveTo(rx + rw * 0.88, ry + rh * 0.14);
            ctx.lineTo(rx + rw * 0.68, ry + rh * 0.5);
            ctx.stroke();
        }
    }
    // Flower boxes under the eaves.
    ctx.fillStyle = 'rgba(190,86,104,0.8)';
    ctx.fillRect(rx + rw * 0.18, ry + rh - 3 * scale, rw * 0.14, 2 * scale);
    ctx.fillStyle = 'rgba(232,196,94,0.85)';
    ctx.fillRect(rx + rw * 0.62, ry + rh - 3 * scale, rw * 0.12, 2 * scale);
    if (style.trim) {
        ctx.fillStyle = style.trim;
        ctx.fillRect(cx - 1.5 * scale, ry - 3 * scale, 3 * scale, 4 * scale);
    }
}

function drawFarm(ctx, box) {
    const { scale, tick, detail } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.16);
    // Barn roof with a hay loft hatch.
    ctx.fillStyle = '#6f5834';
    ctx.fillRect(rx + rw * 0.12, ry + rh * 0.16, rw * 0.32, rh * 0.42);
    ctx.fillStyle = '#3f2f1c';
    ctx.fillRect(rx + rw * 0.22, ry + rh * 0.28, rw * 0.12, rh * 0.18);
    // Furrows.
    ctx.strokeStyle = 'rgba(70,48,24,0.45)';
    ctx.lineWidth = Math.max(1, 1 * scale);
    for (let i = 0; i < 5; i++) {
        const y = ry + rh * (0.62 + i * 0.07);
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.1, y);
        ctx.lineTo(rx + rw * 0.9, y);
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(226,196,110,0.7)';
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(rx + rw * (0.2 + i * 0.2), ry + rh * 0.7, 1.8 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
    // Scarecrow with a waving sleeve.
    if (detail > 0.35) {
        const sx = rx + rw * 0.86, sy = ry + rh * 0.42;
        ctx.strokeStyle = '#4f3a24';
        ctx.lineWidth = Math.max(1, 1.4 * scale);
        ctx.beginPath();
        ctx.moveTo(sx, sy + 8 * scale);
        ctx.lineTo(sx, sy - 6 * scale);
        ctx.moveTo(sx - 5 * scale, sy - 2 * scale);
        ctx.lineTo(sx + 5 * scale, sy - 4 * scale + Math.sin(tick * 0.08) * 2 * scale);
        ctx.stroke();
        ctx.fillStyle = '#c9a24a';
        ctx.beginPath();
        ctx.arc(sx, sy - 7 * scale, 2.6 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawLumber(ctx, box) {
    const { scale, tick } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.2);
    // Saw blade.
    const bx = rx + rw * 0.34, by = ry + rh * 0.4;
    ctx.fillStyle = '#b9b4a8';
    ctx.beginPath();
    ctx.arc(bx, by, Math.min(rw, rh) * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5b564c';
    ctx.lineWidth = Math.max(1, 1 * scale);
    for (let i = 0; i < 8; i++) {
        const angle = tick * 0.05 + i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(angle) * 2 * scale, by + Math.sin(angle) * 2 * scale);
        ctx.lineTo(bx + Math.cos(angle) * 5 * scale, by + Math.sin(angle) * 5 * scale);
        ctx.stroke();
    }
    // Log pile.
    for (let i = 0; i < 4; i++) {
        const ly = ry + rh * (0.62 + (i % 2) * 0.12);
        const lx = rx + rw * (0.58 + i * 0.09);
        ctx.fillStyle = '#6b4a2c';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.6 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a87f4e';
        ctx.beginPath();
        ctx.arc(lx, ly, 1.4 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawQuarry(ctx, box) {
    const { scale } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.12);
    // Terraced pit.
    const levels = 3;
    for (let i = 0; i < levels; i++) {
        const inset = (i + 1) * Math.min(rw, rh) * 0.11;
        ctx.fillStyle = i % 2 ? '#8c877a' : '#767165';
        ctx.beginPath();
        ctx.ellipse(rx + rw / 2, ry + rh / 2, Math.max(2, rw / 2 - inset), Math.max(2, rh / 2 - inset), 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // Crane.
    const cx = rx + rw * 0.78, cy = ry + rh * 0.24;
    ctx.strokeStyle = '#5a4a32';
    ctx.lineWidth = Math.max(1, 1.6 * scale);
    ctx.beginPath();
    ctx.moveTo(cx, cy + 12 * scale);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - 11 * scale, cy + 3 * scale);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,34,26,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx - 11 * scale, cy + 3 * scale);
    ctx.lineTo(cx - 11 * scale, cy + 9 * scale);
    ctx.stroke();
}

function drawGoldMine(ctx, box) {
    const { scale } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.18);
    // Adit entrance and rails.
    ctx.fillStyle = '#2f2a22';
    roundRect(ctx, rx + rw * 0.3, ry + rh * 0.36, rw * 0.34, rh * 0.34, 2 * scale);
    ctx.fill();
    ctx.strokeStyle = '#8c7a4e';
    ctx.lineWidth = Math.max(1, 1 * scale);
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.33, ry + rh * 0.5);
    ctx.lineTo(rx + rw * 0.33, ry + rh * 0.86);
    ctx.moveTo(rx + rw * 0.61, ry + rh * 0.5);
    ctx.lineTo(rx + rw * 0.61, ry + rh * 0.86);
    ctx.stroke();
    // Ore cart and gold flecks.
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(rx + rw * 0.42, ry + rh * 0.66, rw * 0.16, rh * 0.12);
    ctx.fillStyle = '#e8c46a';
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(rx + rw * (0.14 + i * 0.06), ry + rh * (0.2 + (i % 2) * 0.08), 1.6 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawTavern(ctx, box) {
    const { scale, tick } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.12);
    // Two roof planes.
    ctx.strokeStyle = 'rgba(38,28,18,0.5)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.4);
    ctx.lineTo(rx + rw, ry + rh * 0.4);
    ctx.stroke();
    // Hanging sign that swings.
    const swing = Math.sin(tick * 0.06) * 2 * scale;
    ctx.strokeStyle = '#3f2f1e';
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.84, ry + rh * 0.16);
    ctx.lineTo(rx + rw * 0.84 + swing, ry + rh * 0.36);
    ctx.stroke();
    ctx.fillStyle = '#8e3a2c';
    ctx.fillRect(rx + rw * 0.78 + swing, ry + rh * 0.34, rw * 0.12, rh * 0.16);
    ctx.fillStyle = '#e7cf94';
    ctx.fillRect(rx + rw * 0.81 + swing, ry + rh * 0.39, rw * 0.06, 1.6 * scale);
    // Barrels by the door.
    for (let i = 0; i < 2; i++) {
        ctx.fillStyle = '#7a5a34';
        ctx.beginPath();
        ctx.arc(rx + rw * (0.14 + i * 0.1), ry + rh * 0.8, 2.8 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawTemple(ctx, box) {
    const { scale, tick } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.1);
    // Cross plan and a rose window.
    ctx.fillStyle = 'rgba(250,246,232,0.72)';
    ctx.fillRect(rx + rw * 0.44, ry + rh * 0.12, rw * 0.12, rh * 0.76);
    ctx.fillRect(rx + rw * 0.16, ry + rh * 0.4, rw * 0.68, rh * 0.12);
    ctx.strokeStyle = 'rgba(120,98,64,0.5)';
    ctx.lineWidth = Math.max(1, 1 * scale);
    ctx.strokeRect(rx + rw * 0.44, ry + rh * 0.12, rw * 0.12, rh * 0.76);
    ctx.strokeRect(rx + rw * 0.16, ry + rh * 0.4, rw * 0.68, rh * 0.12);
    const glow = 0.6 + Math.sin(tick * 0.05) * 0.2;
    ctx.fillStyle = `rgba(226,186,92,${glow})`;
    ctx.beginPath();
    ctx.arc(rx + rw * 0.5, ry + rh * 0.5, Math.min(rw, rh) * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Bell tower.
    ctx.fillStyle = '#c9bfa4';
    ctx.fillRect(rx + rw * 0.46, ry - 2 * scale, rw * 0.08, rh * 0.16);
    ctx.fillStyle = '#8e3a2c';
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.44, ry - 2 * scale);
    ctx.lineTo(rx + rw * 0.5, ry - 8 * scale);
    ctx.lineTo(rx + rw * 0.56, ry - 2 * scale);
    ctx.closePath();
    ctx.fill();
}

function drawBarracks(ctx, box) {
    const { scale } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.14);
    // Long hall ridge.
    ctx.strokeStyle = 'rgba(30,22,14,0.5)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.34);
    ctx.lineTo(rx + rw, ry + rh * 0.34);
    ctx.stroke();
    // Training ring.
    ctx.strokeStyle = 'rgba(226,212,180,0.4)';
    ctx.beginPath();
    ctx.arc(rx + rw * 0.28, ry + rh * 0.72, Math.min(rw, rh) * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    // Weapon rack and banners.
    ctx.fillStyle = '#6b5438';
    ctx.fillRect(rx + rw * 0.62, ry + rh * 0.66, 2 * scale, 10 * scale);
    ctx.fillRect(rx + rw * 0.78, ry + rh * 0.66, 2 * scale, 10 * scale);
    ctx.strokeStyle = '#c9b28a';
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.62, ry + rh * 0.68);
    ctx.lineTo(rx + rw * 0.82, ry + rh * 0.7);
    ctx.stroke();
    for (const bx of [0.16, 0.88]) {
        ctx.fillStyle = '#8e3a2c';
        ctx.fillRect(rx + rw * bx, ry + rh * 0.05, 3 * scale, 8 * scale);
    }
}

function drawMill(ctx, box) {
    const { scale, tick, cx, cy } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.24);
    const arm = Math.min(rw, rh) * 0.52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tick * 0.035);
    for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(238,228,204,0.85)';
        ctx.fillRect(-2 * scale, -arm, 4 * scale, arm * 0.55);
        ctx.strokeStyle = '#5b4630';
        ctx.lineWidth = Math.max(1, 1.4 * scale);
        ctx.strokeRect(-2 * scale, -arm, 4 * scale, arm * 0.55);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -arm);
        ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#e8c46a';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6 * scale, 0, Math.PI * 2);
    ctx.fill();
}

function drawStable(ctx, box) {
    const { scale } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.18);
    // Paddock fence.
    ctx.strokeStyle = '#7a5c38';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    for (let i = 0; i < 4; i++) {
        const fx = rx + rw * (0.08 + i * 0.22);
        ctx.beginPath();
        ctx.moveTo(fx, ry + rh * 0.72);
        ctx.lineTo(fx, ry + rh * 0.96);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.08, ry + rh * 0.8);
    ctx.lineTo(rx + rw * 0.74, ry + rh * 0.8);
    ctx.stroke();
    // Hay bales and a horse silhouette.
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(rx + rw * 0.12, ry + rh * 0.44, 6 * scale, 4 * scale);
    ctx.fillStyle = '#5a4632';
    ctx.beginPath();
    ctx.ellipse(rx + rw * 0.86, ry + rh * 0.82, 5 * scale, 2.6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(rx + rw * 0.9, ry + rh * 0.7, 1.6 * scale, 6 * scale);
}

function drawWonder(ctx, box) {
    const { scale, tick, cx, cy } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.06);
    const radius = Math.min(rw, rh) * 0.3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tick * 0.01);
    ctx.strokeStyle = 'rgba(250,226,150,0.9)';
    ctx.lineWidth = Math.max(1, 1.6 * scale);
    for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * i * 0.55, radius * i * 0.3, i * 0.4, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#f6e6a8';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 ? radius * 0.42 : radius;
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,244,190,0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.1, 0, Math.PI * 2);
    ctx.fill();
}

function drawTower(ctx, box) {
    const { scale } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.22);
    // Round tower footprint and crenellations.
    const cx = rx + rw / 2, cy = ry + rh / 2;
    const radius = Math.min(rw, rh) * 0.38;
    ctx.fillStyle = box.style.wall;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,32,24,0.55)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.stroke();
    ctx.fillStyle = box.style.roof;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        ctx.fillStyle = box.style.wall;
        ctx.fillRect(cx + Math.cos(angle) * radius * 0.9 - 2 * scale, cy + Math.sin(angle) * radius * 0.9 - 2 * scale, 4 * scale, 4 * scale);
    }
    ctx.fillStyle = 'rgba(28,22,16,0.75)';
    ctx.fillRect(cx - 1.5 * scale, cy - 5 * scale, 3 * scale, 4 * scale);
}

function drawWall(ctx, box) {
    const { scale } = box;
    const { rx, ry, rw, rh } = baseBuild(ctx, box, 0.06);
    ctx.fillStyle = 'rgba(220,214,198,0.55)';
    const merlon = Math.max(2, rw * 0.1);
    for (let x = rx; x < rx + rw - merlon * 0.6; x += merlon * 1.9) {
        ctx.fillRect(x, ry, merlon, Math.max(2, rh * 0.4));
    }
    ctx.strokeStyle = 'rgba(70,62,50,0.5)';
    ctx.lineWidth = Math.max(0.8, 1 * scale);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.62);
    ctx.lineTo(rx + rw, ry + rh * 0.62);
    ctx.stroke();
}

function drawBarrels(ctx, box) {
    const { left: rx, top: ry, w: rw, h: rh, scale } = box;
    const count = 3;
    for (let i = 0; i < count; i++) {
        const bx = rx + rw * (0.28 + (i % 2) * 0.3);
        const by = ry + rh * (0.36 + Math.floor(i / 2) * 0.26);
        ctx.fillStyle = '#7d5b37';
        ctx.beginPath();
        ctx.ellipse(bx, by, rw * 0.15, rh * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,28,16,0.6)';
        ctx.lineWidth = Math.max(0.8, 1 * scale);
        ctx.beginPath();
        ctx.arc(bx, by, rw * 0.1, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawDoor(ctx, box) {
    const { left, top, w, h, scale, e } = box;
    const rotation = ((Number(e.rotation) || 0) % 4 + 4) % 4;
    ctx.fillStyle = '#4a3320';
    const doorW = Math.max(3, Math.min(w, h) * 0.16);
    const doorD = Math.max(1.5, 2.2 * scale);
    if (rotation === 0) ctx.fillRect(left + w / 2 - doorW / 2, top + h - doorD, doorW, doorD);
    else if (rotation === 1) ctx.fillRect(left + w - doorD, top + h / 2 - doorW / 2, doorD, doorW);
    else if (rotation === 2) ctx.fillRect(left + w / 2 - doorW / 2, top, doorW, doorD);
    else ctx.fillRect(left, top + h / 2 - doorW / 2, doorD, doorW);
}

function drawOrientation(ctx, box) {
    if (!state.selectedBuildingId || box.e.id !== state.selectedBuildingId) return;
    const { cx, cy, scale } = box;
    ctx.fillStyle = 'rgba(246,214,132,0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.8 * scale, 0, Math.PI * 2);
    ctx.fill();
}

// ── interiors ─────────────────────────────────────────────────

function drawAuthoredInterior(ctx, box) {
    const { left, top, w, h, scale, e, tick } = box;
    const dims = sizeOf(e);
    const layout = normalizeLayout(e.type, e.layout, dims.w, dims.h);
    const n = layout.w;
    const cw = w / n;
    const ch = h / n;
    const rooms = roomsOf(layout, e.type);
    const tints = ['rgba(86,58,30,0.05)', 'rgba(255,248,220,0.10)', 'rgba(70,48,26,0.06)', 'rgba(255,246,214,0.07)'];

    ctx.save();
    ctx.fillStyle = '#c9b184';
    roundRect(ctx, left, top, w, h, 2 * scale);
    ctx.fill();

    // Floorboards run beneath the room tints.
    ctx.strokeStyle = 'rgba(96,72,42,0.18)';
    ctx.lineWidth = Math.max(0.5, 0.7 * scale);
    const plank = Math.max(3, 5 * scale);
    for (let y = top + plank; y < top + h - 1; y += plank) {
        ctx.beginPath();
        ctx.moveTo(left + 1, y);
        ctx.lineTo(left + w - 1, y);
        ctx.stroke();
    }

    rooms.forEach((room, index) => {
        ctx.fillStyle = room.accessible ? tints[index % tints.length] : 'rgba(140,52,40,0.16)';
        for (const cell of room.cells) {
            ctx.fillRect(left + cell.x * cw, top + cell.y * ch, cw + 0.5, ch + 0.5);
        }
    });

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const value = layout.cells[y * n + x];
            if (value === PLAN.EMPTY) continue;
            const px = left + x * cw;
            const py = top + y * ch;
            if (value === PLAN.WALL || value === PLAN.WINDOW) {
                const border = x === 0 || y === 0 || x === n - 1 || y === n - 1;
                ctx.fillStyle = border ? '#6d5739' : '#7d6441';
                ctx.fillRect(px, py, cw + 0.4, ch + 0.4);
                ctx.fillStyle = 'rgba(255,246,220,0.14)';
                ctx.fillRect(px, py, cw + 0.4, Math.max(1, ch * 0.16));
                if (value === PLAN.WINDOW) {
                    const horizontal = y === 0 || y === n - 1;
                    ctx.fillStyle = '#a8ced6';
                    if (horizontal) ctx.fillRect(px + cw * 0.16, py + ch * 0.34, cw * 0.68, Math.max(1.4, ch * 0.32));
                    else ctx.fillRect(px + cw * 0.34, py + ch * 0.16, Math.max(1.4, cw * 0.32), ch * 0.68);
                    ctx.strokeStyle = '#4d3c26';
                    ctx.lineWidth = Math.max(0.6, 0.7 * scale);
                    ctx.strokeRect(px + 0.5, py + 0.5, cw - 1, ch - 1);
                }
            } else if (value === PLAN.DOOR) {
                ctx.fillStyle = '#c9b184';
                ctx.fillRect(px + 0.5, py + 0.5, cw - 1, ch - 1);
                ctx.strokeStyle = 'rgba(74,51,32,0.9)';
                ctx.lineWidth = Math.max(1, 1.1 * scale);
                const neighbour = (nx, ny) => nx >= 0 && ny >= 0 && nx < n && ny < n &&
                    (layout.cells[ny * n + nx] === PLAN.WALL || layout.cells[ny * n + nx] === PLAN.WINDOW);
                const horizontalWall = neighbour(x - 1, y) || neighbour(x + 1, y);
                ctx.beginPath();
                if (horizontalWall) {
                    ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + ch);
                    ctx.moveTo(px + cw - 1, py); ctx.lineTo(px + cw - 1, py + ch);
                    ctx.moveTo(px + 1.5, py + ch * 0.85);
                    ctx.lineTo(px + cw * 0.72, py + ch * 0.4);
                } else {
                    ctx.moveTo(px, py + 1); ctx.lineTo(px + cw, py + 1);
                    ctx.moveTo(px, py + ch - 1); ctx.lineTo(px + cw, py + ch - 1);
                    ctx.moveTo(px + cw * 0.15, py + ch - 1.5);
                    ctx.lineTo(px + cw * 0.6, py + ch * 0.28);
                }
                ctx.stroke();
            }
        }
    }

    // Furnishings belong to individual rooms, never to the walls. The same
    // plan that drives the room bonuses decides what is drawn where, so a
    // furnished throne room is visibly furnished and the treasury is not.
    const items = normalizeInterior(e.type, e.interior);
    const plan = getRoomFurniturePlan({ rooms, interior: items, roomFurniture: e.roomFurniture });
    const furnitureScale = Math.min(cw, ch) / 14;
    for (const room of rooms) {
        const assigned = plan.byRoom[room.name] || {};
        const used = new Set();
        let stacked = 0;
        for (const id of ['hearth', 'bed', 'table', 'chair', 'shelf', 'rug', 'statue', 'candle']) {
            const count = Math.min(MAX_FURNITURE_PER_ROOM, Math.max(0, Number(assigned[id]) || 0));
            for (let i = 0; i < count; i++) {
                let cell = null;
                for (const candidate of room.cells) {
                    const key = candidate.y * n + candidate.x;
                    if (used.has(key)) continue;
                    used.add(key);
                    cell = candidate;
                    break;
                }
                // A room with more items than floor cells stacks the last ones
                // on its first tile instead of silently dropping them.
                if (!cell) {
                    cell = room.cells[stacked % Math.max(1, room.cells.length)];
                    stacked++;
                }
                if (!cell) break;
                drawFurniture(ctx, id, left + cell.x * cw + cw / 2, top + cell.y * ch + ch / 2, furnitureScale, tick, id === 'hearth');
            }
        }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of rooms) {
        if (room.area < 4) continue;
        const font = Math.max(5, Math.min(8, cw * 0.52));
        const label = room.name;
        ctx.font = '700 ' + font.toFixed(1) + 'px "Trebuchet MS", sans-serif';
        const width = ctx.measureText(label).width + 5;
        if (width > (room.maxX - room.minX + 1) * cw) continue;
        const cx = left + room.cx * cw;
        const cy = top + room.cy * ch;
        ctx.fillStyle = 'rgba(36,26,16,0.55)';
        ctx.fillRect(cx - width / 2, cy - font * 0.75, width, font * 1.5);
        ctx.fillStyle = room.accessible ? '#f4e8cc' : '#ffd2c6';
        ctx.fillText(label, cx, cy);
    }

    drawInteriorLabel(ctx, box);
    ctx.restore();
}

function drawFurniture(ctx, id, x, y, scale, tick, lit) {
    switch (id) {
        case 'bed':
            ctx.fillStyle = '#f0e6cf';
            ctx.fillRect(x - 6 * scale, y - 4 * scale, 12 * scale, 8 * scale);
            ctx.fillStyle = '#b5432e';
            ctx.fillRect(x - 6 * scale, y + 1 * scale, 12 * scale, 3 * scale);
            ctx.fillStyle = '#fff8ea';
            ctx.fillRect(x - 5 * scale, y - 3 * scale, 4 * scale, 3 * scale);
            break;
        case 'table':
            ctx.fillStyle = '#8a6136';
            ctx.fillRect(x - 6 * scale, y - 3 * scale, 12 * scale, 6 * scale);
            ctx.strokeStyle = 'rgba(60,40,24,0.5)';
            ctx.lineWidth = Math.max(0.6, 0.8 * scale);
            ctx.strokeRect(x - 6 * scale, y - 3 * scale, 12 * scale, 6 * scale);
            break;
        case 'chair':
            ctx.fillStyle = '#6b4a2c';
            ctx.fillRect(x - 2.6 * scale, y - 2.6 * scale, 5.2 * scale, 5.2 * scale);
            ctx.fillStyle = '#a57c4c';
            ctx.fillRect(x - 2.6 * scale, y - 4 * scale, 5.2 * scale, 1.6 * scale);
            break;
        case 'shelf':
            ctx.fillStyle = '#6b4a2c';
            ctx.fillRect(x - 6 * scale, y - 2 * scale, 12 * scale, 4 * scale);
            ctx.fillStyle = '#c9a24a';
            for (let i = 0; i < 4; i++) ctx.fillRect(x - 5 * scale + i * 2.7 * scale, y - 3.2 * scale, 1.4 * scale, 2.4 * scale);
            break;
        case 'hearth':
            ctx.fillStyle = '#6c675c';
            ctx.fillRect(x - 6 * scale, y - 4 * scale, 12 * scale, 8 * scale);
            ctx.fillStyle = lit ? `rgba(246,168,64,${0.65 + Math.sin(tick * 0.15) * 0.2})` : '#3f3328';
            ctx.beginPath();
            ctx.arc(x, y, 3 * scale, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'rug':
            ctx.fillStyle = 'rgba(150,54,52,0.55)';
            ctx.beginPath();
            ctx.ellipse(x, y, 8 * scale, 5 * scale, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(226,196,120,0.6)';
            ctx.lineWidth = Math.max(0.6, 0.8 * scale);
            ctx.stroke();
            break;
        case 'statue':
            ctx.fillStyle = '#b9b1a0';
            ctx.fillRect(x - 2.4 * scale, y - 1 * scale, 4.8 * scale, 3 * scale);
            ctx.beginPath();
            ctx.arc(x, y - 3 * scale, 2.2 * scale, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'candle':
            ctx.fillStyle = 'rgba(250,214,130,0.35)';
            ctx.beginPath();
            ctx.arc(x, y, 4 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f6e2a8';
            ctx.fillRect(x - 0.7 * scale, y - 2 * scale, 1.4 * scale, 3.4 * scale);
            break;
        default:
            break;
    }
}

function drawInteriorLabel(ctx, box) {
    const { left, top, w, scale, style } = box;
    if (w < 60 * scale) return;
    ctx.fillStyle = 'rgba(28,22,16,0.4)';
    const labelW = Math.min(w * 0.7, 90 * scale);
    ctx.fillRect(left + w / 2 - labelW / 2, top + 2, labelW, 8 * scale);
    ctx.fillStyle = '#f4ead5';
    ctx.font = `700 ${Math.max(6, 7 * scale)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(TYPE_NAMES[box.e.type] || 'ROOM', left + w / 2, top + 2 + 4 * scale);
}
