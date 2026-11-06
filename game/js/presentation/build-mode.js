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
import { getBuildingRoomBreakdown } from '../systems/rooms.js';
import {
    FURNITURE_COSTS, FURNITURE_UPKEEP, MAX_FURNITURE_PER_ROOM,
    furnitureCost, getRoomFurniturePlan, normalizeRoomFurniture,
} from '../systems/furniture.js';

const RADIUS_SEARCH = 9;

function toast(message) {
    const el = document.getElementById('action-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => el.classList.remove('is-visible'), 2200);
}

function cloneRoomFurniture(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return JSON.parse(JSON.stringify(value));
}

// The selected room is resolved against the current layout, so changing a plan
// can never leave the workshop pointing at a room that no longer exists.
function activeRoom(entity, breakdown) {
    if (!breakdown) return null;
    return breakdown.rooms.find(room => room.name === state.selectedRoom) ||
        breakdown.rooms.find(room => room.accessible) ||
        breakdown.rooms[0] || null;
}

// Auto-distributed legacy furniture is materialised before the first purchase,
// so buying a chair never discards the beds the realm already owned.
function roomFurnitureMap(entity, breakdown) {
    if (entity.roomFurniture && typeof entity.roomFurniture === 'object' && !Array.isArray(entity.roomFurniture)) {
        return normalizeRoomFurniture(entity.roomFurniture);
    }
    const plan = getRoomFurniturePlan({
        rooms: breakdown.rooms,
        interior: normalizeInterior(entity.type, entity.interior),
        roomFurniture: null,
    });
    return normalizeRoomFurniture(plan.byRoom);
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
        roomFurniture: cloneRoomFurniture(entity.roomFurniture),
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
    entity.roomFurniture = cloneRoomFurniture(entry.roomFurniture);
    state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
    if (entry.layout) {
        const dims = footprintOf(entity);
        entity.layout = normalizeLayout(entity.type, entry.layout, dims.w, dims.h);
    }
    state.buildingLayoutVersion = (state.buildingLayoutVersion || 0) + 1;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    renderWorkshop();
    toast('CHANGE REVERTED');
    return true;
}

export function selectBuilding(entity) {
    state.selectedBuildingId = entity ? entity.id : null;
    state.selectedRoom = null;
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
    state.buildingLayoutVersion = (state.buildingLayoutVersion || 0) + 1;
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
    copy.roomFurniture = cloneRoomFurniture(entity.roomFurniture);
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

export function selectedRoomName(entity = selectedBuilding()) {
    if (!entity) return null;
    const room = activeRoom(entity, getBuildingRoomBreakdown(entity));
    if (room) state.selectedRoom = room.name;
    return room ? room.name : null;
}

// Buying furniture is a real cost: materials leave the stores immediately and
// the item then draws upkeep every settlement period. Removing it is free but
// refunds nothing; it only ends the upkeep.
export function adjustFurniture(itemId, delta, roomName = null) {
    const entity = selectedBuilding();
    if (!entity) return false;
    const breakdown = getBuildingRoomBreakdown(entity);
    const room = breakdown?.rooms.find(entry => entry.name === (roomName || state.selectedRoom)) || activeRoom(entity, breakdown);
    if (!room) { toast('THIS STRUCTURE HAS NO INTERIOR'); return false; }
    state.selectedRoom = room.name;
    const cost = furnitureCost(itemId);
    if (!cost) return false;

    if (delta > 0) {
        if (!room.accessible) { toast('SEALED ROOM · ADD A DOOR FIRST'); return false; }
        if (room.furnitureCount >= MAX_FURNITURE_PER_ROOM) { toast('ROOM FULL · ' + MAX_FURNITURE_PER_ROOM + ' ITEMS'); return false; }
        for (const [resource, amount] of Object.entries(cost)) {
            if ((state.resources[resource] || 0) < amount) { toast('CANNOT AFFORD · ' + resource.toUpperCase()); return false; }
        }
        const map = roomFurnitureMap(entity, breakdown);
        pushUndo(entity);
        for (const [resource, amount] of Object.entries(cost)) state.resources[resource] -= amount;
        const assigned = map[room.name] || (map[room.name] = {});
        assigned[itemId] = (assigned[itemId] || 0) + 1;
        entity.roomFurniture = map;
        state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
        renderWorkshop();
        toast(INTERIOR_ITEMS[itemId].label.toUpperCase() + ' PLACED · ' + room.name);
        return true;
    }

    if (delta < 0) {
        const map = roomFurnitureMap(entity, breakdown);
        const assigned = map[room.name];
        if (!assigned || !(assigned[itemId] > 0)) { toast('NONE IN ' + room.name); return false; }
        pushUndo(entity);
        assigned[itemId] -= 1;
        if (assigned[itemId] <= 0) delete assigned[itemId];
        if (!Object.keys(assigned).length) delete map[room.name];
        entity.roomFurniture = map;
        state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
        renderWorkshop();
        toast('REMOVED · NO REFUND · UPKEEP −' + (FURNITURE_UPKEEP[itemId] || 0).toFixed(3));
        return true;
    }
    return false;
}

export function adjustInterior(itemId, delta) {
    return adjustFurniture(itemId, delta);
}

export function interiorSummary(entity) {
    const breakdown = getBuildingRoomBreakdown(entity);
    if (!breakdown) return '';
    const totals = {};
    for (const room of breakdown.rooms) {
        for (const [id, count] of Object.entries(room.furnitureItems)) totals[id] = (totals[id] || 0) + count;
    }
    return INTERIOR_ITEM_IDS
        .filter(id => totals[id] > 0)
        .map(id => `${INTERIOR_ITEMS[id].label} ${totals[id]}`)
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
            const breakdown = getBuildingRoomBreakdown(entity);
            if (!breakdown) {
                items.innerHTML = '<div class="workshop-empty">This structure has no interior.</div>';
            } else {
                const room = activeRoom(entity, breakdown);
                if (room) state.selectedRoom = room.name;
                const assigned = room?.furnitureItems || {};
                const percent = room ? Math.round((room.furnitureMultiplier - 1) * 100) : 0;
                const tabs = breakdown.rooms.map(entry =>
                    `<button type="button" class="workshop-room${entry.name === room?.name ? ' is-active' : ''}${entry.accessible ? '' : ' is-sealed'}" data-room="${entry.name}" aria-pressed="${entry.name === room?.name}" title="${entry.roleLabel}${entry.accessible ? ' · +' + Math.round((entry.furnitureMultiplier - 1) * 100) + '% furniture' : ' · sealed, no bonus'}">${entry.roleIcon} ${entry.name}</button>`
                ).join('');
                const rows = INTERIOR_ITEM_IDS.map(id => {
                    const item = INTERIOR_ITEMS[id];
                    const count = assigned[id] || 0;
                    const cost = FURNITURE_COSTS[id] || {};
                    const price = Object.entries(cost).map(([resource, amount]) => amount + ' ' + resource.toUpperCase()).join(' + ');
                    const upkeep = (FURNITURE_UPKEEP[id] || 0).toFixed(3);
                    const canAdd = Boolean(room?.accessible) && (room?.furnitureCount || 0) < MAX_FURNITURE_PER_ROOM;
                    const affordable = Object.entries(cost).every(([resource, amount]) => (state.resources[resource] || 0) >= amount);
                    return `<div class="workshop-item">
                        <span class="workshop-item-icon" aria-hidden="true">${item.icon}</span>
                        <span class="workshop-item-label">${item.label}<small>${price} · ${upkeep} G / 20D</small></span>
                        <span class="workshop-stepper">
                            <button type="button" data-furniture="${id}" data-delta="-1" aria-label="Remove ${item.label}"${count > 0 ? '' : ' disabled'}>−</button>
                            <strong>${count}</strong>
                            <button type="button" data-furniture="${id}" data-delta="1" aria-label="Buy ${item.label}"${canAdd && affordable ? '' : ' disabled'}>+</button>
                        </span>
                    </div>`;
                }).join('');
                items.innerHTML = `<div class="workshop-rooms" role="tablist" aria-label="Rooms">${tabs}</div>
                    <div class="workshop-room-head"><span>${room ? room.roleIcon + ' ' + room.roleShort : 'NO ROOM'}</span><span>${room ? '+' + percent + '% ROOM BONUS · ' + room.furnitureCount + '/' + MAX_FURNITURE_PER_ROOM : ''}</span></div>
                    ${rows}
                    <div class="workshop-upkeep"><span>FURNITURE UPKEEP</span><strong>${breakdown.furnitureUpkeep.toFixed(3)} GOLD / 20 DAYS</strong></div>`;
            }
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
        const roomButton = event.target.closest('[data-room]');
        if (roomButton) {
            state.selectedRoom = roomButton.dataset.room;
            renderWorkshop();
            return;
        }
        const button = event.target.closest('[data-furniture]');
        if (!button || button.disabled) return;
        adjustFurniture(button.dataset.furniture, Number(button.dataset.delta) || 0);
    });

    setupPlanEditor({ beforeChange: entity => pushUndo(entity), toast });
    renderWorkshop();
}
