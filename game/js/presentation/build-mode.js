// ═══════════════════════════════════════════════════════════════
//  BUILD MODE — the realm workshop
//  Select any structure, move it, rotate it, rebuild it, and furnish
//  its interior. Everything is written back into the entity, so the
//  changes survive save/load and are visible at interior zoom.
// ═══════════════════════════════════════════════════════════════

import { state } from '../core/state.js';
import { TYPE } from '../core/types.js';
import { buildingOverlaps, spawnEntity } from '../world/entities.js';
import { isWaterAt, worldWidth, worldHeight } from '../world/world.js';
import {
    defaultInterior, normalizeInterior, INTERIOR_ITEMS, INTERIOR_ITEM_IDS,
    REBUILD_COST, buildingName, footprintOf,
} from './rendering/building-art.js';
import { normalizeLayout, cloneLayout, rotateLayout } from './building-layout.js';
import { renderPlanEditor, setupPlanEditor } from './plan-editor.js';

const RADIUS_SEARCH = 9;

function toast(message) {
    const el = document.getElementById('action-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.classList.remove('is-visible'), 2200);
}

export function isWorkshopOpen() {
    return Boolean(state.workshopOpen);
}

export function selectedBuilding() {
    if (!state.selectedBuildingId) return null;
    return state.entities.find(entity => entity.id === state.selectedBuildingId && !entity.dead && entity.isBuilding()) || null;
}

export function buildingAtTile(tx, ty) {
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        const size = footprintOf(entity);
        const left = entity.x + 0.5 - size.w / 2;
        const right = entity.x + 0.5 + size.w / 2;
        const top = entity.y + 0.5 - size.h / 2;
        const bottom = entity.y + 0.5 + size.h / 2;
        if (tx + 0.5 >= left && tx + 0.5 <= right && ty + 0.5 >= top && ty + 0.5 <= bottom) return entity;
    }
    return null;
}

function validPlacement(tx, ty, entity) {
    const W = worldWidth(), H = worldHeight();
    const size = footprintOf(entity);
    if (tx - size.w / 2 < 0 || ty - size.h / 2 < 0) return 'Outside the realm';
    if (tx + size.w / 2 > W || ty + size.h / 2 > H) return 'Outside the realm';
    for (const [ox, oy] of [[0, 0], [-size.w / 2, -size.h / 2], [size.w / 2, size.h / 2], [-size.w / 2, size.h / 2], [size.w / 2, -size.h / 2]]) {
        if (isWaterAt(tx + ox, ty + oy)) return 'Needs dry ground';
    }
    if (buildingOverlaps(tx, ty, entity.type, entity.footprintScale, entity)) return 'Another structure is in the way';
    return null;
}

function pushUndo(entity) {
    state.buildUndo = state.buildUndo || [];
    const dims = footprintOf(entity);
    state.buildUndo.push({
        id: entity.id,
        x: entity.x,
        y: entity.y,
        rotation: entity.rotation || 0,
        interior: { ...normalizeInterior(entity.type, entity.interior) },
        layout: cloneLayout(normalizeLayout(entity.type, entity.layout, dims.w, dims.h)),
    });
    if (state.buildUndo.length > 30) state.buildUndo.shift();
}

export function undoBuildAction() {
    const entry = state.buildUndo?.pop();
    if (!entry) { toast('NOTHING TO UNDO'); return false; }
    const entity = state.entities.find(candidate => candidate.id === entry.id && !candidate.dead);
    if (!entity) { toast('THAT STRUCTURE IS GONE'); return false; }
    entity.x = entry.x;
    entity.y = entry.y;
    entity.rotation = entry.rotation;
    entity.interior = { ...entry.interior };
    if (entry.layout) {
        const dims = footprintOf(entity);
        entity.layout = normalizeLayout(entity.type, entry.layout, dims.w, dims.h);
    }
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    renderWorkshop();
    toast('CHANGE REVERTED');
    return true;
}

export function selectBuilding(entity) {
    state.selectedBuildingId = entity ? entity.id : null;
    state.buildTool = null;
    renderWorkshop();
}

export function openWorkshop() {
    state.workshopOpen = true;
    document.getElementById('workshop-panel')?.classList.remove('hidden');
    document.getElementById('workshop-open-btn')?.classList.add('is-active');
    document.body.classList.add('workshop-open');
    renderWorkshop();
}

export function closeWorkshop() {
    state.workshopOpen = false;
    state.buildTool = null;
    state.buildMoveFrom = null;
    document.getElementById('workshop-panel')?.classList.add('hidden');
    document.getElementById('workshop-open-btn')?.classList.remove('is-active');
    document.body.classList.remove('workshop-open');
}

export function toggleWorkshop() {
    if (isWorkshopOpen()) closeWorkshop(); else openWorkshop();
}

export function cancelWorkshopTool() {
    state.buildTool = null;
    state.buildMoveFrom = null;
    renderWorkshop();
}

export function handleWorkshopClick(tx, ty) {
    if (!isWorkshopOpen()) return false;
    const selected = selectedBuilding();

    if (state.buildTool === 'move' && selected) {
        const fromX = state.buildMoveFrom?.x ?? selected.x;
        const fromY = state.buildMoveFrom?.y ?? selected.y;
        const reason = validPlacement(tx, ty, selected);
        if (reason) { toast(reason.toUpperCase()); return true; }
        pushUndo(selected);
        selected.x = fromX;
        selected.y = fromY;
        selected.x = tx;
        selected.y = ty;
        selected.footprintScale = Number(selected.footprintScale) || 1;
        state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
        state.buildTool = null;
        state.buildMoveFrom = null;
        renderWorkshop();
        toast('STRUCTURE MOVED · ' + tx + ', ' + ty);
        return true;
    }

    const building = buildingAtTile(tx, ty);
    if (building) selectBuilding(building);
    else selectBuilding(null);
    return true;
}

export function rotateSelected() {
    const entity = selectedBuilding();
    if (!entity) return;
    pushUndo(entity);
    entity.rotation = ((Number(entity.rotation) || 0) + 1) % 4;
    const dims = footprintOf(entity);
    entity.layout = rotateLayout(normalizeLayout(entity.type, entity.layout, dims.w, dims.h));
    renderWorkshop();
    toast('ROTATED · ' + entity.rotation * 90 + '°');
}

export function beginMoveSelected() {
    const entity = selectedBuilding();
    if (!entity) return;
    state.buildTool = state.buildTool === 'move' ? null : 'move';
    state.buildMoveFrom = { x: entity.x, y: entity.y };
    renderWorkshop();
}

function findFreeTileAround(entity) {
    for (let radius = 1; radius <= RADIUS_SEARCH; radius++) {
        for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                const tx = Math.round(entity.x + ox), ty = Math.round(entity.y + oy);
                if (!validPlacement(tx, ty, entity)) return { x: tx, y: ty };
            }
        }
    }
    return null;
}

export function duplicateSelected() {
    const entity = selectedBuilding();
    if (!entity) return;
    const spot = findFreeTileAround(entity);
    if (!spot) { toast('NO FREE GROUND NEARBY'); return; }
    const cost = REBUILD_COST[entity.type] || REBUILD_COST[TYPE.HOUSE];
    for (const [resource, amount] of Object.entries(cost)) {
        if ((state.resources[resource] || 0) < amount) { toast('CANNOT AFFORD · ' + resource.toUpperCase()); return; }
    }
    for (const [resource, amount] of Object.entries(cost)) state.resources[resource] -= amount;

    const copy = spawnEntity(spot.x, spot.y, entity.type);
    if (!copy) { toast('REALM CAPACITY REACHED'); return; }
    copy.rotation = entity.rotation || 0;
    copy.interior = { ...normalizeInterior(entity.type, entity.interior) };
    copy.layout = entity.layout ? cloneLayout(entity.layout) : null;
    copy.footprintScale = entity.footprintScale || 1;
    selectBuilding(copy);
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    toast('REBUILT · ' + buildingName(entity.type));
}

export function demolishSelected() {
    const entity = selectedBuilding();
    if (!entity) return;
    pushUndo(entity);
    const cost = REBUILD_COST[entity.type] || REBUILD_COST[TYPE.HOUSE];
    for (const [resource, amount] of Object.entries(cost)) {
        state.resources[resource] = (state.resources[resource] || 0) + Math.round(amount * 0.3);
    }
    entity.dead = true;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    state.selectedBuildingId = null;
    state.buildTool = null;
    renderWorkshop();
    toast('DEMOLISHED · MATERIALS RECOVERED');
}

export function adjustInterior(itemId, delta) {
    const entity = selectedBuilding();
    if (!entity) return;
    const interior = normalizeInterior(entity.type, entity.interior);
    interior[itemId] = Math.max(0, Math.min(12, (interior[itemId] || 0) + delta));
    entity.interior = interior;
    state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
    renderWorkshop();
}

export function interiorSummary(entity) {
    const interior = normalizeInterior(entity.type, entity.interior);
    return INTERIOR_ITEM_IDS
        .filter(id => interior[id] > 0)
        .map(id => `${INTERIOR_ITEMS[id].label} ${interior[id]}`)
        .join(' · ');
}

// ── UI ────────────────────────────────────────────────────────

export function renderWorkshop() {
    const panel = document.getElementById('workshop-panel');
    if (!panel) return;
    const entity = selectedBuilding();
    const title = document.getElementById('workshop-title');
    const meta = document.getElementById('workshop-meta');
    const actions = document.getElementById('workshop-actions');
    const items = document.getElementById('workshop-items');
    const hint = document.getElementById('workshop-hint');

    if (title) title.textContent = entity ? buildingName(entity.type) : 'REALM WORKSHOP';
    if (meta) {
        meta.textContent = entity
            ? `TILE ${entity.x}, ${entity.y} · ROTATION ${(entity.rotation || 0) * 90}° · ${entity.type === TYPE.WALL ? 'WALL' : 'INTERIOR ' + (state.zoomLevel >= 4 ? 'OPEN' : 'AT ZOOM 4')}`
            : 'Click any structure on the map to inspect and reshape it.';
    }
    if (actions) actions.classList.toggle('is-disabled', !entity);
    if (items) {
        if (!entity) {
            items.innerHTML = '<div class="workshop-empty">No structure selected.</div>';
        } else {
            const interior = normalizeInterior(entity.type, entity.interior);
            items.innerHTML = INTERIOR_ITEM_IDS.map(id => {
                const item = INTERIOR_ITEMS[id];
                const count = interior[id] || 0;
                return `<div class="workshop-item">
                    <span class="workshop-item-icon" aria-hidden="true">${item.icon}</span>
                    <span class="workshop-item-label">${item.label}</span>
                    <span class="workshop-stepper">
                        <button type="button" data-furniture="${id}" data-delta="-1" aria-label="Remove ${item.label}">−</button>
                        <strong>${count}</strong>
                        <button type="button" data-furniture="${id}" data-delta="1" aria-label="Add ${item.label}">+</button>
                    </span>
                </div>`;
            }).join('');
        }
    }
    if (hint) {
        hint.textContent = state.buildTool === 'move'
            ? 'MOVE MODE · CLICK ANY DRY TILE TO PLACE · ESC TO CANCEL'
            : entity ? 'MOVE, ROTATE, REBUILD OR FURNISH THIS STRUCTURE' : 'SELECT A STRUCTURE TO BEGIN';
    }
    panel.classList.toggle('is-moving', state.buildTool === 'move');
    document.querySelectorAll('[data-build-action]').forEach(button => {
        const action = button.dataset.buildAction;
        const disabled = !entity && action !== 'undo' && action !== 'close';
        button.disabled = disabled;
        button.classList.toggle('is-active', action === 'move' && state.buildTool === 'move');
    });
    renderPlanEditor();
}

export function setupWorkshopUI() {
    if (state.workshopUiBound) return;
    state.workshopUiBound = true;

    document.getElementById('workshop-open-btn')?.addEventListener('click', toggleWorkshop);
    document.getElementById('workshop-close')?.addEventListener('click', closeWorkshop);

    document.getElementById('workshop-actions')?.addEventListener('click', event => {
        const button = event.target.closest('[data-build-action]');
        if (!button) return;
        switch (button.dataset.buildAction) {
            case 'move': beginMoveSelected(); break;
            case 'rotate': rotateSelected(); break;
            case 'duplicate': duplicateSelected(); break;
            case 'demolish': demolishSelected(); break;
            case 'undo': undoBuildAction(); break;
            case 'close': closeWorkshop(); break;
            default: break;
        }
    });

    document.getElementById('workshop-items')?.addEventListener('click', event => {
        const button = event.target.closest('[data-furniture]');
        if (!button) return;
        adjustInterior(button.dataset.furniture, Number(button.dataset.delta) || 0);
    });

    setupPlanEditor({ beforeChange: entity => pushUndo(entity), toast });
    renderWorkshop();
}
