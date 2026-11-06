// Shared furniture data and per-room assignment plans. Rooms, the workshop,
// the renderer and the economy all read these values so a purchase, a visual
// furnishing and a bonus stay in sync.
//
// A building stores its layout as `entity.roomFurniture`, a map of room name to
// item counts. Old saves only carry `entity.interior`; that flat interior is
// automatically spread across the reachable rooms, so nothing is lost.

export const FURNITURE_BONUS_CAP = 0.5;
export const FURNITURE_POINT_VALUE = 0.015;
// Realm-wide furniture contributions sit on top of the base room caps: a
// furnished room must still improve the realm even when its unfurnished
// neighbours already saturate the base cap. These values bound that extra.
export const FURNITURE_REALM_CAPS = Object.freeze({
    gold: 1.2,
    legitimacy: 0.25,
    morale: 0.3,
    growth: 1.5,
    defense: 0.08,
});
export const MAX_FURNITURE_PER_ROOM = 12;
export const FURNITURE_ITEM_IDS = Object.freeze([
    "bed", "table", "chair", "shelf", "hearth", "rug", "statue", "candle",
]);

// Which furnishings speak to which room function. The weights decide both the
// automatic legacy distribution and the per-room bonus multiplier.
export const FURNITURE_AFFINITY = Object.freeze({
    crown: Object.freeze({ chair: 2, table: 1, statue: 3, rug: 1, candle: 1 }),
    treasury: Object.freeze({ shelf: 3, statue: 1, candle: 2 }),
    household: Object.freeze({ bed: 4, rug: 2, hearth: 2, candle: 1 }),
    garrison: Object.freeze({ shelf: 2, table: 1, hearth: 1, bed: 1 }),
    faith: Object.freeze({ candle: 3, statue: 3, rug: 1, chair: 1 }),
    common: Object.freeze({ table: 2, chair: 1, hearth: 2, shelf: 1, rug: 1, candle: 1 }),
});

export const FURNITURE_COSTS = Object.freeze({
    bed: Object.freeze({ wood: 4, gold: 1 }),
    table: Object.freeze({ wood: 3 }),
    chair: Object.freeze({ wood: 1 }),
    shelf: Object.freeze({ wood: 2 }),
    hearth: Object.freeze({ stone: 3 }),
    rug: Object.freeze({ gold: 2 }),
    statue: Object.freeze({ stone: 5, gold: 2 }),
    candle: Object.freeze({ gold: 1 }),
});

// Upkeep is charged per 20-day economic ledger for every assigned item,
// including furniture that came with the starting realm.
export const FURNITURE_UPKEEP = Object.freeze({
    bed: 0.006,
    table: 0.004,
    chair: 0.002,
    shelf: 0.0025,
    hearth: 0.005,
    rug: 0.004,
    statue: 0.01,
    candle: 0.0015,
});

const ROLE_BY_NAME = new Map([
    ["THRONE ROOM", "crown"],
    ["TREASURY", "treasury"],
    ["VAULT", "treasury"],
    ["ROYAL CHAMBER", "household"],
    ["BEDCHAMBER", "household"],
    ["GUEST ROOM", "household"],
    ["BUNKS", "household"],
    ["ALCOVE", "household"],
    ["CHAMBER", "household"],
    ["GUARD HALL", "garrison"],
    ["DRILL HALL", "garrison"],
    ["ARMORY", "garrison"],
    ["LOOKOUT", "garrison"],
    ["TOWER ROOM", "garrison"],
    ["CELL", "garrison"],
    ["NAVE", "faith"],
    ["AISLE", "faith"],
    ["CHAPEL", "faith"],
    ["VESTRY", "faith"],
    ["SHRINE", "faith"],
]);

export function roomRoleId(name) {
    return ROLE_BY_NAME.get(String(name || "").trim().toUpperCase()) || "common";
}

export function normalizeRoomName(name) {
    return String(name || "").trim().toUpperCase();
}

export function isRoomFurnitureMap(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Drops unknown item ids and rooms, clamps every room to its capacity and
// keeps empty assignments out while still treating an empty object as an
// explicit "this building owns no furniture".
export function normalizeRoomFurniture(value) {
    if (!isRoomFurnitureMap(value)) return {};
    const result = {};
    for (const [rawName, rawItems] of Object.entries(value)) {
        const name = normalizeRoomName(rawName);
        if (!name || !rawItems || typeof rawItems !== "object" || Array.isArray(rawItems)) continue;
        const items = {};
        for (const id of FURNITURE_ITEM_IDS) {
            const count = Math.round(Number(rawItems[id]));
            if (!Number.isFinite(count) || count <= 0) continue;
            items[id] = Math.min(MAX_FURNITURE_PER_ROOM, count);
        }
        if (Object.keys(items).length) result[name] = items;
    }
    return result;
}

export function furnitureCount(items) {
    let total = 0;
    for (const id of FURNITURE_ITEM_IDS) total += Math.max(0, Math.round(Number(items?.[id]) || 0));
    return total;
}

export function furniturePoints(items, roleId) {
    const affinity = FURNITURE_AFFINITY[roleId];
    if (!affinity) return 0;
    let points = 0;
    for (const [id, weight] of Object.entries(affinity)) {
        points += Math.max(0, Number(items?.[id]) || 0) * weight;
    }
    return points;
}

// A room's own furniture strengthens that room's function. The cap is per
// room, so a dedicated throne room can be pushed twice as far as a building
// that spread its chairs across every chamber.
export function furnitureMultiplier(items, roleId) {
    return 1 + Math.min(FURNITURE_BONUS_CAP, furniturePoints(items, roleId) * FURNITURE_POINT_VALUE);
}

export function furnitureUpkeep(items) {
    let total = 0;
    for (const id of FURNITURE_ITEM_IDS) {
        total += Math.max(0, Number(items?.[id]) || 0) * (FURNITURE_UPKEEP[id] || 0);
    }
    return Math.round(total * 10000) / 10000;
}

export function roomFurnitureTotals(byRoom) {
    const totals = {};
    for (const items of Object.values(byRoom || {})) {
        for (const id of FURNITURE_ITEM_IDS) {
            const count = Math.max(0, Math.round(Number(items?.[id]) || 0));
            if (count > 0) totals[id] = (totals[id] || 0) + count;
        }
    }
    return totals;
}

export function roomFurnitureUpkeep(byRoom) {
    let total = 0;
    for (const items of Object.values(byRoom || {})) total += furnitureUpkeep(items);
    return Math.round(total * 10000) / 10000;
}

// Legacy saves only know a flat interior. Items go to the rooms with the
// strongest affinity first, which makes the starting furnishing read as a
// deliberately decorated keep instead of a random pile. Sealed rooms stay
// empty: their furniture could not contribute anything.
export function allocateInteriorToRooms(interior, rooms) {
    const byRoom = {};
    for (const room of rooms || []) {
        const name = normalizeRoomName(room?.name);
        if (name) byRoom[name] = {};
    }
    const accessible = (rooms || []).filter(room =>
        room && room.accessible !== false && byRoom[normalizeRoomName(room.name)]);
    if (!accessible.length) return byRoom;

    const remaining = {};
    for (const id of FURNITURE_ITEM_IDS) remaining[id] = Math.max(0, Math.round(Number(interior?.[id]) || 0));

    // Every reachable room first receives one item of the kind it uses best, so
    // a guard hall is never left bare just because the chambers have a stronger
    // claim on beds. The rest of the stock is then concentrated by affinity.
    const seedOrder = accessible.slice().sort((a, b) =>
        (Number(b.area) || 0) - (Number(a.area) || 0) ||
        normalizeRoomName(a.name).localeCompare(normalizeRoomName(b.name)));
    for (const room of seedOrder) {
        const affinity = FURNITURE_AFFINITY[roomRoleId(room.name)] || {};
        const best = Object.entries(affinity)
            .filter(([id]) => remaining[id] > 0)
            .sort((a, b) => b[1] - a[1] ||
                FURNITURE_ITEM_IDS.indexOf(a[0]) - FURNITURE_ITEM_IDS.indexOf(b[0]))[0];
        if (!best) continue;
        byRoom[normalizeRoomName(room.name)][best[0]] = 1;
        remaining[best[0]] -= 1;
    }

    for (const id of FURNITURE_ITEM_IDS) {
        let left = remaining[id];
        if (left <= 0) continue;
        const candidates = accessible.slice().sort((a, b) => {
            const weightA = FURNITURE_AFFINITY[roomRoleId(a.name)]?.[id] || 0;
            const weightB = FURNITURE_AFFINITY[roomRoleId(b.name)]?.[id] || 0;
            return weightB - weightA ||
                (Number(b.area) || 0) - (Number(a.area) || 0) ||
                normalizeRoomName(a.name).localeCompare(normalizeRoomName(b.name));
        });
        for (const room of candidates) {
            if (left <= 0) break;
            const items = byRoom[normalizeRoomName(room.name)];
            const space = MAX_FURNITURE_PER_ROOM - furnitureCount(items);
            if (space <= 0) continue;
            const amount = Math.min(left, space);
            items[id] = (items[id] || 0) + amount;
            left -= amount;
        }
    }
    return byRoom;
}

// One plan feeds the renderer, the workshop and the room ledger.
export function getRoomFurniturePlan({ rooms = [], interior = null, roomFurniture = null } = {}) {
    const explicit = isRoomFurnitureMap(roomFurniture);
    const stored = explicit ? normalizeRoomFurniture(roomFurniture) : {};
    const allocated = explicit ? null : allocateInteriorToRooms(interior, rooms);
    const byRoom = {};
    for (const room of rooms || []) {
        const name = normalizeRoomName(room?.name);
        if (!name) continue;
        byRoom[name] = explicit
            ? { ...(stored[name] || {}) }
            : { ...(allocated?.[name] || {}) };
    }
    const totals = roomFurnitureTotals(byRoom);
    return {
        explicit,
        byRoom,
        totals,
        totalItems: furnitureCount(totals),
        upkeep: roomFurnitureUpkeep(byRoom),
    };
}

export function furnitureCost(itemId) {
    return FURNITURE_COSTS[itemId] || null;
}
