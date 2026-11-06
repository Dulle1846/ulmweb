// Building floor-plan model: walls, doors, windows and derived rooms.
// A plan is a square grid stored as plain numbers so it survives save/load.
import { TYPE } from '../core/types.js';

export const PLAN = { EMPTY: 0, WALL: 1, DOOR: 2, WINDOW: 3 };
const MIN_N = 7;
const MAX_N = 15;
const NO_INTERIOR = new Set([TYPE.WALL, TYPE.BARREL]);

export function hasInterior(type, w = 1, h = 1) {
    return !NO_INTERIOR.has(type) && w >= 1.15 && h >= 1.15;
}

export function gridDimensions(w = 1, h = 1) {
    const span = Math.max(Number(w) || 1, Number(h) || 1);
    return Math.max(9, Math.min(MAX_N, Math.round(6.5 + span * 2)));
}

function blank(n) {
    return { w: n, h: n, cells: new Array(n * n).fill(PLAN.EMPTY) };
}

function put(layout, x, y, value) {
    if (x > 0 && y > 0 && x < layout.w - 1 && y < layout.h - 1) {
        layout.cells[y * layout.w + x] = value;
    }
}

function ring(layout) {
    const n = layout.w;
    for (let i = 0; i < n; i++) {
        layout.cells[i] = PLAN.WALL;
        layout.cells[(n - 1) * n + i] = PLAN.WALL;
        layout.cells[i * n] = PLAN.WALL;
        layout.cells[i * n + n - 1] = PLAN.WALL;
    }
}

function line(layout, x1, y1, x2, y2, doors = []) {
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    for (let guard = 0; guard < 64; guard++) {
        put(layout, x, y, PLAN.WALL);
        if (x === x2 && y === y2) break;
        x += dx;
        y += dy;
    }
    for (const [dxr, dyr] of doors) {
        const onLine = x1 === x2 ? dxr === x1 : dyr === y1;
        if (onLine) put(layout, dxr, dyr, PLAN.DOOR);
    }
}

function placePerimeterDoor(layout, row, inward) {
    const n = layout.w;
    const mid = Math.floor(n / 2);
    const xs = [];
    for (let x = 1; x < n - 1; x++) xs.push(x);
    xs.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    for (const x of xs) {
        const target = row * n + x;
        const inside = (row + inward) * n + x;
        if (layout.cells[target] === PLAN.WALL && layout.cells[inside] === PLAN.EMPTY) {
            layout.cells[target] = PLAN.DOOR;
            return true;
        }
    }
    return false;
}

export function defaultLayout(type, w = 1, h = 1) {
    const n = gridDimensions(w, h);
    const layout = blank(n);
    ring(layout);
    const mid = Math.floor(n / 2);

    switch (type) {
        case TYPE.KEEP: {
            const vx = Math.floor(n * 0.36);
            const hy = Math.floor(n * 0.52);
            line(layout, vx, 1, vx, n - 2, [[vx, Math.floor(n * 0.62)]]);
            line(layout, 1, hy, n - 2, hy, [[Math.floor(n * 0.24), hy], [Math.floor(n * 0.76), hy]]);
            line(layout, vx + 1, Math.floor(n * 0.3), n - 2, Math.floor(n * 0.3), [[n - 3, Math.floor(n * 0.3)]]);
            break;
        }
        case TYPE.HOUSE: {
            const vx = Math.floor(n * 0.56);
            line(layout, vx, 1, vx, n - 2, [[vx, Math.floor(n * 0.58)]]);
            break;
        }
        case TYPE.FARM: {
            const hy = Math.floor(n * 0.56);
            line(layout, 1, hy, n - 2, hy, [[Math.floor(n * 0.34), hy]]);
            break;
        }
        case TYPE.LUMBER:
        case TYPE.GOLDMINE: {
            const vx = Math.floor(n * (type === TYPE.LUMBER ? 0.64 : 0.42));
            line(layout, vx, 1, vx, n - 2, [[vx, mid]]);
            break;
        }
        case TYPE.QUARRY: {
            const hy = Math.floor(n * 0.64);
            line(layout, 1, hy, n - 2, hy, [[Math.floor(n * 0.4), hy]]);
            break;
        }
        case TYPE.TAVERN: {
            const vx = Math.floor(n * 0.44);
            const hy = Math.floor(n * 0.36);
            line(layout, vx, 1, vx, n - 2, [[vx, Math.floor(n * 0.6)]]);
            line(layout, vx + 1, hy, n - 2, hy, [[Math.floor(n * 0.76), hy]]);
            break;
        }
        case TYPE.TEMPLE: {
            line(layout, 2, 1, 2, n - 2, [[2, mid]]);
            line(layout, n - 3, 1, n - 3, n - 2, [[n - 3, mid]]);
            break;
        }
        case TYPE.BARRACKS: {
            const h1 = Math.floor(n * 0.36);
            const h2 = Math.floor(n * 0.68);
            line(layout, 1, h1, n - 2, h1, [[Math.floor(n * 0.3), h1]]);
            line(layout, 1, h2, n - 2, h2, [[Math.floor(n * 0.66), h2]]);
            break;
        }
        case TYPE.MILL: {
            const hy = Math.floor(n * 0.44);
            line(layout, 1, hy, n - 2, hy, [[Math.floor(n * 0.66), hy]]);
            break;
        }
        case TYPE.STABLE: {
            const hy = Math.floor(n * 0.62);
            line(layout, 1, hy, n - 2, hy, [[Math.floor(n * 0.3), hy]]);
            break;
        }
        case TYPE.TOWER: {
            line(layout, 1, mid, n - 2, mid, [[Math.floor(n * 0.62), mid]]);
            break;
        }
        case TYPE.WONDER: {
            line(layout, mid, 1, mid, n - 2, [[mid, Math.floor(n * 0.34)]]);
            line(layout, 1, mid, n - 2, mid, [[Math.floor(n * 0.7), mid]]);
            break;
        }
        default: {
            line(layout, mid, 1, mid, n - 2, [[mid, mid]]);
            break;
        }
    }

    for (const [x, y] of [
        [2, 0], [n - 3, 0], [0, 2], [n - 1, 2],
        [0, n - 3], [n - 1, n - 3], [2, n - 1], [n - 3, n - 1],
    ]) {
        if (layout.cells[y * n + x] === PLAN.WALL) layout.cells[y * n + x] = PLAN.WINDOW;
    }
    placePerimeterDoor(layout, n - 1, -1);
    if (type === TYPE.KEEP || type === TYPE.TEMPLE || type === TYPE.WONDER) {
        placePerimeterDoor(layout, 0, 1);
    }
    return layout;
}

// ── editing, rooms and persistence ─────────────────────────────

export function cloneLayout(layout) {
    return { w: layout.w, h: layout.h, cells: layout.cells.slice() };
}

export function normalizeLayout(type, raw, w = 1, h = 1) {
    const fallback = defaultLayout(type, w, h);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cells)) return fallback;
    const n = Math.round(Number(raw.w) || 0);
    if (n !== Math.round(Number(raw.h) || 0) || n < MIN_N || n > MAX_N) return fallback;
    const cells = new Array(n * n).fill(PLAN.EMPTY);
    for (let i = 0; i < cells.length; i++) {
        const value = Number(raw.cells[i]);
        if (value === PLAN.WALL || value === PLAN.DOOR || value === PLAN.WINDOW) cells[i] = value;
    }
    for (let i = 0; i < n; i++) {
        for (const index of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
            if (cells[index] === PLAN.EMPTY) cells[index] = PLAN.WALL;
        }
    }
    return { w: n, h: n, cells };
}

export function serializeLayout(type, raw, w = 1, h = 1) {
    const layout = normalizeLayout(type, raw, w, h);
    return { w: layout.w, h: layout.h, cells: layout.cells.slice() };
}

export function rotateLayout(layout) {
    const n = layout.w;
    const cells = new Array(n * n).fill(PLAN.EMPTY);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) cells[x * n + (n - 1 - y)] = layout.cells[y * n + x];
    }
    return { w: n, h: n, cells };
}

export function isBorder(layout, x, y) {
    return x === 0 || y === 0 || x === layout.w - 1 || y === layout.h - 1;
}

export function setPlanCell(layout, x, y, value, options = {}) {
    if (!layout || x < 0 || y < 0 || x >= layout.w || y >= layout.h) return false;
    if (![PLAN.EMPTY, PLAN.WALL, PLAN.DOOR, PLAN.WINDOW].includes(value)) return false;
    if (value === PLAN.EMPTY && isBorder(layout, x, y) && !options.allowBorderErase) return false;
    layout.cells[y * layout.w + x] = value;
    return true;
}

export function movePlanCell(layout, fromX, fromY, toX, toY) {
    if (!layout || isBorder(layout, fromX, fromY) || isBorder(layout, toX, toY)) return false;
    const from = layout.cells[fromY * layout.w + fromX];
    if (from !== PLAN.WALL && from !== PLAN.DOOR && from !== PLAN.WINDOW) return false;
    if (layout.cells[toY * layout.w + toX] !== PLAN.EMPTY) return false;
    layout.cells[fromY * layout.w + fromX] = PLAN.EMPTY;
    layout.cells[toY * layout.w + toX] = from;
    return true;
}

const ROOM_NAMES = {
    [TYPE.KEEP]: ['THRONE ROOM', 'ROYAL CHAMBER', 'GUARD HALL', 'TREASURY', 'ALCOVE', 'CHAMBER'],
    [TYPE.HOUSE]: ['LIVING ROOM', 'BEDCHAMBER', 'PANTRY', 'ALCOVE'],
    [TYPE.FARM]: ['FARMHOUSE', 'BARN', 'LOFT', 'STORE'],
    [TYPE.LUMBER]: ['WORKSHOP', 'LOG STORE', 'OFFICE'],
    [TYPE.QUARRY]: ['QUARRY FLOOR', 'OFFICE', 'STORE'],
    [TYPE.GOLDMINE]: ['MINE SHAFT', 'ORE STORE', 'OFFICE'],
    [TYPE.TAVERN]: ['COMMON ROOM', 'KITCHEN', 'GUEST ROOM', 'CELLAR'],
    [TYPE.TEMPLE]: ['NAVE', 'AISLE', 'CHAPEL', 'VESTRY'],
    [TYPE.BARRACKS]: ['DRILL HALL', 'BUNKS', 'ARMORY', 'MESS'],
    [TYPE.MILL]: ['MILL FLOOR', 'GRAIN STORE', 'OFFICE'],
    [TYPE.STABLE]: ['STABLE', 'TACK ROOM', 'LOFT'],
    [TYPE.TOWER]: ['TOWER ROOM', 'LOOKOUT', 'CELL'],
    [TYPE.WONDER]: ['GREAT HALL', 'GALLERY', 'VAULT', 'SHRINE'],
};
const DEFAULT_NAMES = ['MAIN HALL', 'CHAMBER', 'STORE', 'ALCOVE'];

export function roomsOf(layout, type) {
    const n = layout.w;
    const seen = new Uint8Array(n * n);
    const rooms = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
            const start = y * n + x;
            if (seen[start] || layout.cells[start] !== PLAN.EMPTY) continue;
            const queue = [start];
            seen[start] = 1;
            const cells = [];
            let minX = x, maxX = x, minY = y, maxY = y;
            while (queue.length) {
                const current = queue.pop();
                const cx = current % n;
                const cy = (current - cx) / n;
                cells.push({ x: cx, y: cy });
                minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                for (const [dx, dy] of dirs) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
                    const next = ny * n + nx;
                    if (seen[next] || layout.cells[next] !== PLAN.EMPTY) continue;
                    seen[next] = 1;
                    queue.push(next);
                }
            }
            rooms.push({ cells, area: cells.length, minX, maxX, minY, maxY });
        }
    }
    const reachable = reachableMask(layout);
    for (const room of rooms) {
        room.accessible = room.cells.some(cell => reachable[cell.y * n + cell.x] === 1);
        room.cx = (room.minX + room.maxX + 1) / 2;
        room.cy = (room.minY + room.maxY + 1) / 2;
    }
    rooms.sort((a, b) => b.area - a.area);
    const names = ROOM_NAMES[type] || DEFAULT_NAMES;
    rooms.forEach((room, index) => { room.name = names[index] || 'ROOM ' + (index + 1); });
    return rooms;
}

export function reachableMask(layout) {
    const n = layout.w;
    const mask = new Uint8Array(n * n);
    const queue = [];
    for (let i = 0; i < layout.cells.length; i++) {
        if (layout.cells[i] === PLAN.DOOR) { mask[i] = 1; queue.push(i); }
    }
    while (queue.length) {
        const current = queue.pop();
        const cx = current % n;
        const cy = (current - cx) / n;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
            const next = ny * n + nx;
            const value = layout.cells[next];
            if (mask[next] || (value !== PLAN.EMPTY && value !== PLAN.DOOR)) continue;
            mask[next] = 1;
            queue.push(next);
        }
    }
    return mask;
}

export function layoutStats(layout, type) {
    const rooms = roomsOf(layout, type);
    let walls = 0, doors = 0, windows = 0;
    for (const value of layout.cells) {
        if (value === PLAN.WALL) walls++;
        else if (value === PLAN.DOOR) doors++;
        else if (value === PLAN.WINDOW) windows++;
    }
    return { rooms, walls, doors, windows, unreachable: rooms.filter(room => !room.accessible).length };
}
