// Interactive floor-plan editor for the Realm Workshop.
// The canvas works on the same grid model the interior renderer uses.
import { state } from '../core/state.js';
import { footprintOf } from './rendering/building-art.js';
import { getBuildingRoomBreakdown } from '../systems/rooms.js';
import {
    PLAN, hasInterior, normalizeLayout, roomsOf, layoutStats,
    setPlanCell, movePlanCell, isBorder,
} from './building-layout.js';

const TOOL_COLORS = {
    wall: '240,200,105',
    door: '168,206,214',
    window: '140,196,220',
    erase: '214,106,86',
    move: '196,164,222',
};

let tool = 'wall';
let hover = null;
let gesture = null;
let moveSource = null;
let hooks = {};
let bound = false;
let lastEntityId = null;

function selectedEntity() {
    if (!state.selectedBuildingId) return null;
    return state.entities.find(entity => entity.id === state.selectedBuildingId && !entity.dead && entity.isBuilding()) || null;
}

function layoutOf(entity) {
    const dims = footprintOf(entity);
    const layout = normalizeLayout(entity.type, entity.layout, dims.w, dims.h);
    entity.layout = layout;
    return layout;
}

function canvasPoint(event, layout) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const pad = 8;
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    const size = canvas.width - pad * 2;
    const x = Math.floor((px - pad) / (size / layout.w));
    const y = Math.floor((py - pad) / (size / layout.h));
    if (x < 0 || y < 0 || x >= layout.w || y >= layout.h) return null;
    return { x, y };
}

function drawPlan(ctx, layout, rooms) {
    const canvas = ctx.canvas;
    const pad = 8;
    const n = layout.w;
    const size = (canvas.width - pad * 2) / n;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#efe1c1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Room floors first, so walls read as the structure.
    rooms.forEach((room, index) => {
        ctx.fillStyle = room.accessible
            ? (index % 2 ? 'rgba(148,112,68,0.16)' : 'rgba(255,248,226,0.34)')
            : 'rgba(158,62,48,0.22)';
        for (const cell of room.cells) {
            ctx.fillRect(pad + cell.x * size, pad + cell.y * size, size, size);
        }
    });

    ctx.strokeStyle = 'rgba(108,80,44,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
        ctx.beginPath();
        ctx.moveTo(pad + i * size, pad);
        ctx.lineTo(pad + i * size, pad + n * size);
        ctx.moveTo(pad, pad + i * size);
        ctx.lineTo(pad + n * size, pad + i * size);
        ctx.stroke();
    }

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const value = layout.cells[y * n + x];
            if (value === PLAN.EMPTY) continue;
            const px = pad + x * size;
            const py = pad + y * size;
            if (value === PLAN.WALL || value === PLAN.WINDOW) {
                const border = isBorder(layout, x, y);
                ctx.fillStyle = border ? '#5f4a30' : '#755c3a';
                ctx.fillRect(px, py, size, size);
                ctx.fillStyle = 'rgba(255,246,218,0.15)';
                ctx.fillRect(px, py, size, Math.max(1, size * 0.16));
                if (value === PLAN.WINDOW) {
                    const horizontal = y === 0 || y === n - 1;
                    ctx.fillStyle = '#9ecdd8';
                    if (horizontal) ctx.fillRect(px + size * 0.16, py + size * 0.34, size * 0.68, Math.max(2, size * 0.32));
                    else ctx.fillRect(px + size * 0.34, py + size * 0.16, Math.max(2, size * 0.32), size * 0.68);
                }
            } else if (value === PLAN.DOOR) {
                ctx.fillStyle = '#e4d2ad';
                ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
                ctx.strokeStyle = '#5a4028';
                ctx.lineWidth = Math.max(1, size * 0.08);
                const horizontal = (x > 0 && layout.cells[y * n + x - 1] !== PLAN.EMPTY) ||
                    (x < n - 1 && layout.cells[y * n + x + 1] !== PLAN.EMPTY);
                ctx.beginPath();
                if (horizontal) {
                    ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + size);
                    ctx.moveTo(px + size - 1, py); ctx.lineTo(px + size - 1, py + size);
                    ctx.moveTo(px + 2, py + size * 0.82);
                    ctx.lineTo(px + size * 0.68, py + size * 0.32);
                } else {
                    ctx.moveTo(px, py + 1); ctx.lineTo(px + size, py + 1);
                    ctx.moveTo(px, py + size - 1); ctx.lineTo(px + size, py + size - 1);
                    ctx.moveTo(px + size * 0.18, py + size - 2);
                    ctx.lineTo(px + size * 0.6, py + size * 0.3);
                }
                ctx.stroke();
            }
        }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of rooms) {
        if (room.area < 4) continue;
        const font = Math.max(5, Math.min(7, size * 0.5));
        ctx.font = '700 ' + font.toFixed(1) + 'px "Trebuchet MS", sans-serif';
        const label = room.name;
        if (ctx.measureText(label).width > (room.maxX - room.minX + 1) * size - 2) continue;
        const cx = pad + room.cx * size;
        const cy = pad + room.cy * size;
        ctx.fillStyle = room.accessible ? 'rgba(46,34,20,0.8)' : 'rgba(120,36,28,0.9)';
        ctx.fillText(label, cx, cy);
    }

    if (moveSource) {
        ctx.strokeStyle = 'rgba(196,164,222,0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(pad + moveSource.x * size + 1, pad + moveSource.y * size + 1, size - 2, size - 2);
    }
    if (hover) {
        const color = TOOL_COLORS[tool] || '240,200,105';
        ctx.fillStyle = 'rgba(' + color + ',0.28)';
        ctx.fillRect(pad + hover.x * size, pad + hover.y * size, size, size);
        ctx.strokeStyle = 'rgba(' + color + ',0.95)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pad + hover.x * size + 0.75, pad + hover.y * size + 0.75, size - 1.5, size - 1.5);
    }
}

function roomEffectText(effect, value) {
    if (!(value > 0.0001)) return '';
    return effect === 'defense'
        ? Math.round(value * 100) + '% defense'
        : '+' + (Math.round(value * 10) / 10) + ' ' + effect;
}

function setBuildingBonuses(entity) {
    const statusEl = document.getElementById('building-bonus-status');
    const roomsEl = document.getElementById('building-bonus-rooms');
    const furnitureEl = document.getElementById('building-bonus-furniture');
    if (!statusEl || !roomsEl || !furnitureEl) return;
    if (!entity) {
        statusEl.textContent = '—';
        roomsEl.innerHTML = '';
        furnitureEl.innerHTML = '';
        return;
    }
    const breakdown = getBuildingRoomBreakdown(entity);
    if (!breakdown) {
        statusEl.textContent = 'NO ROOM BONUSES';
        roomsEl.innerHTML = '<div class="building-bonus-empty">This structure has no interior.</div>';
        furnitureEl.innerHTML = '';
        return;
    }
    statusEl.textContent = breakdown.accessible + ' ACCESSIBLE' +
        (breakdown.sealed ? ' · ' + breakdown.sealed + ' SEALED' : ' · ALL REACHABLE');
    roomsEl.innerHTML = breakdown.rooms.map(room => {
        const effects = Object.entries(room.effects)
            .filter(([, value]) => value > 0.0001)
            .map(([effect, value]) => roomEffectText(effect, value));
        const base = Object.entries(room.baseEffects)
            .filter(([, value]) => value > 0.0001)
            .map(([effect, value]) => roomEffectText(effect, value));
        const furnished = room.furnitureMultiplier > 1
            ? Math.round((room.furnitureMultiplier - 1) * 100) + '%'
            : '0%';
        const title = room.accessible
            ? 'Base: ' + (base.join(' · ') || 'none') + ' · Furniture: +' + furnished
            : 'Sealed rooms provide no bonuses until a door connects them.';
        return '<div class="building-room-row' + (room.accessible ? '' : ' is-sealed') + '" title="' + title + '">' +
            '<div class="building-room-head"><span>' + room.roleIcon + ' ' + room.name + '</span><span>' +
            (room.accessible ? 'AREA ' + room.area : 'SEALED · NO BONUS') + '</span></div>' +
            '<div class="building-room-effects">' + (effects.join('') || '<span>NO EFFECT</span>') +
            (room.accessible && room.furnitureMultiplier > 1
                ? '<span class="is-furnished">FURNISHED +' + furnished + '</span>'
                : '') + '</div></div>';
    }).join('') || '<div class="building-bonus-empty">No rooms detected.</div>';
    const roleRows = [...new Map(breakdown.rooms.filter(room => room.accessible).map(room => [room.role, room])).values()];
    furnitureEl.innerHTML = roleRows.length
        ? '<span>FURNISHINGS</span>' + roleRows.map(room => {
            const percent = Math.round((room.furnitureMultiplier - 1) * 100);
            return '<span>' + room.roleIcon + ' ' + room.roleShort + ' +' + percent + '%</span>';
        }).join('')
        : '<span>FURNISHINGS · NO ACCESSIBLE ROOMS</span>';
}

function setStats(entity, layout, rooms) {
    const statsEl = document.getElementById('plan-stats');
    const roomsEl = document.getElementById('plan-rooms');
    if (!entity || !layout) {
        if (statsEl) statsEl.textContent = '—';
        if (roomsEl) roomsEl.innerHTML = '';
        setBuildingBonuses(null);
        return;
    }
    const stats = layoutStats(layout, entity.type);
    if (statsEl) {
        statsEl.textContent = stats.rooms.length + ' ROOMS · ' + stats.doors + ' DOORS · ' + stats.windows + ' WINDOWS' +
            (stats.unreachable ? ' · ' + stats.unreachable + ' NO DOOR' : '');
    }
    if (roomsEl) {
        roomsEl.innerHTML = rooms.slice(0, 7).map(room =>
            '<span class="plan-room' + (room.accessible ? '' : ' is-warning') + '">' + room.name + ' · ' + room.area + '</span>'
        ).join('');
    }
    setBuildingBonuses(entity);
}

function setToolbar(enabled) {
    document.querySelectorAll('[data-plan-tool]').forEach(button => {
        button.disabled = !enabled;
        button.classList.toggle('is-active', enabled && button.dataset.planTool === tool);
    });
    const canvas = document.getElementById('plan-editor');
    if (canvas) canvas.classList.toggle('is-disabled', !enabled);
}

function showEmpty(message) {
    const canvas = document.getElementById('plan-editor');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#efe1c1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(76,58,34,0.7)';
    ctx.font = '700 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    setToolbar(false);
}

export function renderPlanEditor() {
    const entity = selectedEntity();
    if ((entity ? entity.id : null) !== lastEntityId) {
        lastEntityId = entity ? entity.id : null;
        moveSource = null;
        gesture = null;
        hover = null;
    }
    if (!entity) {
        showEmpty('SELECT A STRUCTURE');
        setStats(null, null, []);
        return;
    }
    const dims = footprintOf(entity);
    if (!hasInterior(entity.type, dims.w, dims.h)) {
        showEmpty('NO FLOOR PLAN FOR THIS STRUCTURE');
        setStats(null, null, []);
        return;
    }
    const layout = layoutOf(entity);
    const rooms = roomsOf(layout, entity.type);
    const canvas = document.getElementById('plan-editor');
    if (!canvas) return;
    drawPlan(canvas.getContext('2d'), layout, rooms);
    setStats(entity, layout, rooms);
    setToolbar(true);
}

export function setupPlanEditor(nextHooks = {}) {
    hooks = { ...hooks, ...nextHooks };
    if (bound) return;
    bound = true;
    bindTools();
    bindCanvas();
}

// ── interaction ───────────────────────────────────────────────

function toolValue() {
    if (tool === 'wall') return PLAN.WALL;
    if (tool === 'door') return PLAN.DOOR;
    if (tool === 'window') return PLAN.WINDOW;
    return PLAN.EMPTY;
}

function paintCell(layout, x, y) {
    if (!gesture) return;
    const key = x + ':' + y;
    if (gesture.last === key) return;
    gesture.last = key;
    const value = toolValue();
    if (value === PLAN.EMPTY && isBorder(layout, x, y)) {
        hooks.toast?.('OUTER WALLS STAY · USE A DOOR OR WINDOW');
        return;
    }
    if (layout.cells[y * layout.w + x] === value) return;
    if (!gesture.pushed) {
        hooks.beforeChange?.(gesture.entity);
        gesture.pushed = true;
    }
    if (setPlanCell(layout, x, y, value)) {
        state.buildingLayoutVersion = (state.buildingLayoutVersion || 0) + 1;
        renderPlanEditor();
    }
}

function handleMovePiece(entity, layout, cell) {
    if (isBorder(layout, cell.x, cell.y)) {
        hooks.toast?.('OUTER WALLS CANNOT BE MOVED · USE WINDOW OR DOOR');
        return;
    }
    if (!moveSource) {
        if (layout.cells[cell.y * layout.w + cell.x] === PLAN.EMPTY) {
            hooks.toast?.('PICK A WALL, DOOR OR WINDOW');
            return;
        }
        moveSource = { x: cell.x, y: cell.y };
        renderPlanEditor();
        return;
    }
    if (moveSource.x === cell.x && moveSource.y === cell.y) {
        moveSource = null;
        renderPlanEditor();
        return;
    }
    if (layout.cells[cell.y * layout.w + cell.x] !== PLAN.EMPTY) {
        hooks.toast?.('TARGET CELL IS NOT EMPTY');
        return;
    }
    hooks.beforeChange?.(entity);
    if (movePlanCell(layout, moveSource.x, moveSource.y, cell.x, cell.y)) {
        state.buildingLayoutVersion = (state.buildingLayoutVersion || 0) + 1;
        moveSource = null;
        renderPlanEditor();
    }
}

function bindCanvas() {
    const canvas = document.getElementById('plan-editor');
    if (!canvas) return;
    canvas.addEventListener('pointerdown', event => {
        const entity = selectedEntity();
        if (!entity) return;
        const dims = footprintOf(entity);
        if (!hasInterior(entity.type, dims.w, dims.h)) return;
        const layout = layoutOf(entity);
        const cell = canvasPoint(event, layout);
        if (!cell) return;
        event.preventDefault();
        try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
        if (tool === 'move') {
            handleMovePiece(entity, layout, cell);
            return;
        }
        gesture = { entity, layout, pushed: false, last: null };
        paintCell(layout, cell.x, cell.y);
    });
    canvas.addEventListener('pointermove', event => {
        const entity = selectedEntity();
        if (!entity) return;
        const dims = footprintOf(entity);
        if (!hasInterior(entity.type, dims.w, dims.h)) return;
        const layout = layoutOf(entity);
        const cell = canvasPoint(event, layout);
        const changed = (!cell && hover) || (cell && (!hover || hover.x !== cell.x || hover.y !== cell.y));
        hover = cell;
        if (changed) renderPlanEditor();
        if (gesture && cell && event.buttons === 1) paintCell(layout, cell.x, cell.y);
    });
    canvas.addEventListener('pointerup', () => {
        if (!gesture) return;
        gesture = null;
        renderPlanEditor();
    });
    canvas.addEventListener('pointercancel', () => { gesture = null; });
    canvas.addEventListener('pointerleave', () => {
        hover = null;
        if (!gesture) renderPlanEditor();
    });
    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();
        const entity = selectedEntity();
        if (!entity) return;
        const dims = footprintOf(entity);
        if (!hasInterior(entity.type, dims.w, dims.h)) return;
        const layout = layoutOf(entity);
        const cell = canvasPoint(event, layout);
        if (!cell) return;
        if (isBorder(layout, cell.x, cell.y)) {
            hooks.toast?.('OUTER WALLS STAY · USE A WINDOW OR DOOR');
            return;
        }
        if (layout.cells[cell.y * layout.w + cell.x] === PLAN.EMPTY) return;
        hooks.beforeChange?.(entity);
        if (setPlanCell(layout, cell.x, cell.y, PLAN.EMPTY)) {
            state.buildingLayoutVersion = (state.buildingLayoutVersion || 0) + 1;
            renderPlanEditor();
        }
    });
}

function bindTools() {
    document.getElementById('plan-tools')?.addEventListener('click', event => {
        const button = event.target.closest('[data-plan-tool]');
        if (!button) return;
        tool = button.dataset.planTool;
        moveSource = null;
        renderPlanEditor();
    });
}
