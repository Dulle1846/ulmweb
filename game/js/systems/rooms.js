// Room functions: accessible floor-plan rooms provide realm-wide bonuses.
// Everything here is derived from the authored layouts and interiors and is
// never stored separately, so save/load and the workshop stay the single
// source of truth.
import { BUILDING_SIZE } from "../core/config.js";
import { state } from "../core/state.js";
import { hasInterior, normalizeLayout, roomsOf } from "../presentation/building-layout.js";
import { normalizeInterior } from "../presentation/rendering/building-art.js";
import { addResource } from "./resources.js";
import { normalizePoliticalState } from "./politics.js";

export const ROOM_BONUS_INTERVAL = 20;
export const ROOM_BONUS_CAPS = Object.freeze({
    gold: 4,
    legitimacy: 0.7,
    morale: 0.7,
    growth: 5,
    defense: 0.5,
});

// Furniture makes a room's function stronger. The affinity weights decide
// which furnishings matter most for each role; the result is a percentage
// bonus on that role's base effects, capped so furniture never dwarfs rooms.
export const FURNITURE_BONUS_CAP = 0.35;
export const FURNITURE_POINT_VALUE = 0.015;
export const FURNITURE_AFFINITY = Object.freeze({
    crown: Object.freeze({ chair: 2, table: 1, statue: 3, rug: 1, candle: 1 }),
    treasury: Object.freeze({ shelf: 3, statue: 1, candle: 2 }),
    household: Object.freeze({ bed: 4, rug: 2, hearth: 2, candle: 1 }),
    garrison: Object.freeze({ shelf: 2, table: 1, hearth: 1, bed: 1 }),
    faith: Object.freeze({ candle: 3, statue: 3, rug: 1, chair: 1 }),
    common: Object.freeze({ table: 2, chair: 1, hearth: 2, shelf: 1, rug: 1, candle: 1 }),
});

// Each role has a clear purpose in the realm. Area scales the contribution,
// but every room type remains useful through at least one effect.
export const ROOM_ROLES = Object.freeze({
    crown: Object.freeze({
        label: "CROWN AUTHORITY",
        short: "THRONE",
        icon: "♛",
        description: "The throne room turns ceremony into legitimacy and steadies the court.",
        effects: Object.freeze({ legitimacy: 0.22, morale: 0.25 }),
    }),
    treasury: Object.freeze({
        label: "TREASURY",
        short: "TREASURY",
        icon: "◉",
        description: "Vaults turn stored wealth into a steady flow of coin.",
        effects: Object.freeze({ gold: 1.1 }),
    }),
    household: Object.freeze({
        label: "HOUSEHOLD",
        short: "CHAMBERS",
        icon: "⌂",
        description: "Comfortable chambers lift morale and make families more willing to grow.",
        effects: Object.freeze({ morale: 0.18, growth: 1.8 }),
    }),
    garrison: Object.freeze({
        label: "GARRISON",
        short: "GUARD",
        icon: "♜",
        description: "Guards and watch posts blunt the force of raids against the realm.",
        effects: Object.freeze({ defense: 0.055 }),
    }),
    faith: Object.freeze({
        label: "FAITH",
        short: "FAITH",
        icon: "✦",
        description: "Chapels and shrines comfort the people and lend the crown moral authority.",
        effects: Object.freeze({ morale: 0.28, legitimacy: 0.07 }),
    }),
    common: Object.freeze({
        label: "COMMON QUARTERS",
        short: "COMMON",
        icon: "●",
        description: "Halls, kitchens and workshops make everyday life easier.",
        effects: Object.freeze({ morale: 0.055 }),
    }),
});

const ROLE_ORDER = Object.keys(ROOM_ROLES);
const EFFECT_KEYS = Object.keys(ROOM_BONUS_CAPS);
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

const round = value => Math.round(value * 1000) / 1000;
const zeroEffects = () => Object.fromEntries(EFFECT_KEYS.map(effect => [effect, 0]));

export function roomRoleId(name) {
    return ROLE_BY_NAME.get(String(name || "").trim().toUpperCase()) || "common";
}

export function roomWeight(area) {
    const value = Number(area);
    return Number.isFinite(value) ? Math.max(0.5, Math.min(3, value / 12)) : 0.5;
}

function footprintDims(entity) {
    const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
    const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
    return { w: base.w * scale, h: base.h * scale };
}

export function getFurnitureMultiplier(entity, roleId) {
    const affinity = FURNITURE_AFFINITY[roleId];
    if (!affinity || !entity) return 1;
    const interior = normalizeInterior(entity.type, entity.interior);
    let points = 0;
    for (const [item, weight] of Object.entries(affinity)) {
        points += Math.max(0, Number(interior[item]) || 0) * weight;
    }
    return 1 + Math.min(FURNITURE_BONUS_CAP, points * FURNITURE_POINT_VALUE);
}

// The workshop needs the same numbers the realm ledger uses. This breakdown
// keeps sealed rooms visible (with zero effects) and separates base room value
// from the part contributed by furniture.
export function getBuildingRoomBreakdown(entity) {
    if (!entity || entity.dead || typeof entity.isBuilding !== "function" || !entity.isBuilding()) return null;
    const dims = footprintDims(entity);
    if (!hasInterior(entity.type, dims.w, dims.h)) return null;
    const layout = normalizeLayout(entity.type, entity.layout, dims.w, dims.h);
    const multipliers = Object.fromEntries(ROLE_ORDER.map(role => [role, getFurnitureMultiplier(entity, role)]));
    const rooms = roomsOf(layout, entity.type).map(room => {
        const role = roomRoleId(room.name);
        const weight = roomWeight(room.area);
        const baseEffects = zeroEffects();
        const furnitureEffects = zeroEffects();
        const effects = zeroEffects();
        if (room.accessible) {
            const base = ROOM_ROLES[role].effects;
            const multiplier = multipliers[role];
            for (const effect of EFFECT_KEYS) {
                baseEffects[effect] = round((base[effect] || 0) * weight);
                furnitureEffects[effect] = round(baseEffects[effect] * (multiplier - 1));
                effects[effect] = round(baseEffects[effect] + furnitureEffects[effect]);
            }
        }
        return {
            ...room,
            role,
            roleLabel: ROOM_ROLES[role].label,
            roleShort: ROOM_ROLES[role].short,
            roleIcon: ROOM_ROLES[role].icon,
            weight,
            baseEffects,
            furnitureEffects,
            effects,
            furnitureMultiplier: room.accessible ? multipliers[role] : 1,
        };
    });
    const totals = zeroEffects();
    for (const room of rooms) {
        if (!room.accessible) continue;
        for (const effect of EFFECT_KEYS) totals[effect] += room.effects[effect];
    }
    for (const effect of EFFECT_KEYS) totals[effect] = round(totals[effect]);
    return {
        layout,
        rooms,
        totals,
        sealed: rooms.filter(room => !room.accessible).length,
        accessible: rooms.filter(room => room.accessible).length,
        furniture: multipliers,
    };
}

let cacheKey = "";
let cachedSnapshot = null;

export function invalidateRoomBonusCache() {
    cacheKey = "";
    cachedSnapshot = null;
}

function snapshotKey() {
    return [
        state.worldEpoch || 0,
        state.buildingLayoutVersion || 0,
        state.buildingInteriorVersion || 0,
        state.buildingCollisionVersion || 0,
        state.entities?.length || 0,
        state.nextEntityId || 0,
    ].join(":");
}

export function getRoomBonusSnapshot() {
    const key = snapshotKey();
    if (cachedSnapshot && key === cacheKey) return cachedSnapshot;

    const roleMap = new Map(ROLE_ORDER.map(id => [id, {
        id,
        label: ROOM_ROLES[id].label,
        short: ROOM_ROLES[id].short,
        icon: ROOM_ROLES[id].icon,
        description: ROOM_ROLES[id].description,
        roomCount: 0,
        weight: 0,
        baseEffects: zeroEffects(),
        furnitureEffects: zeroEffects(),
        effects: zeroEffects(),
    }]));

    let rooms = 0;
    let sealed = 0;
    let buildings = 0;
    const entities = Array.isArray(state.entities) ? state.entities : [];
    for (const entity of entities) {
        const breakdown = getBuildingRoomBreakdown(entity);
        if (!breakdown) continue;
        buildings++;
        sealed += breakdown.sealed;
        for (const room of breakdown.rooms) {
            if (!room.accessible) continue;
            const role = roleMap.get(room.role);
            role.roomCount++;
            role.weight += room.weight;
            rooms++;
            for (const effect of EFFECT_KEYS) {
                role.baseEffects[effect] += room.baseEffects[effect];
                role.furnitureEffects[effect] += room.furnitureEffects[effect];
                role.effects[effect] += room.effects[effect];
            }
        }
    }

    const rawTotals = zeroEffects();
    for (const role of roleMap.values()) {
        for (const effect of EFFECT_KEYS) {
            role.baseEffects[effect] = round(role.baseEffects[effect]);
            role.furnitureEffects[effect] = round(role.furnitureEffects[effect]);
            role.effects[effect] = round(role.effects[effect]);
            rawTotals[effect] += role.effects[effect];
        }
    }
    const totals = zeroEffects();
    const capped = {};
    for (const effect of EFFECT_KEYS) {
        rawTotals[effect] = round(rawTotals[effect]);
        capped[effect] = rawTotals[effect] > ROOM_BONUS_CAPS[effect] + 0.0001;
        totals[effect] = round(Math.min(ROOM_BONUS_CAPS[effect], Math.max(0, rawTotals[effect])));
    }

    const snapshot = {
        rooms,
        sealed,
        buildings,
        interval: ROOM_BONUS_INTERVAL,
        roles: [...roleMap.values()],
        rawTotals,
        totals,
        capped,
    };
    cacheKey = key;
    cachedSnapshot = snapshot;
    return snapshot;
}

export function roomBonusSignature() {
    const snapshot = getRoomBonusSnapshot();
    return [
        snapshot.rooms,
        snapshot.sealed,
        snapshot.buildings,
        ...EFFECT_KEYS.map(effect => snapshot.totals[effect]),
        ...snapshot.roles.map(role => role.roomCount),
    ].join("|");
}

// Called once per 20-day economic ledger. Growth and defense are passive
// modifiers read by population and combat, so they are not applied here.
export function applyRoomBonuses() {
    const snapshot = getRoomBonusSnapshot();
    if (!state.hasStarted || snapshot.rooms === 0) return snapshot;
    if (snapshot.totals.gold > 0) addResource("gold", snapshot.totals.gold);
    if (snapshot.totals.morale > 0) {
        state.morale = Math.min(100, (Number(state.morale) || 0) + snapshot.totals.morale);
    }
    if (snapshot.totals.legitimacy > 0) {
        const politics = normalizePoliticalState();
        politics.legitimacy = Math.min(100, politics.legitimacy + snapshot.totals.legitimacy);
    }
    const economy = state.economy || (state.economy = {});
    economy.roomGold = round((Number(economy.roomGold) || 0) + snapshot.totals.gold);
    economy.roomMorale = round((Number(economy.roomMorale) || 0) + snapshot.totals.morale);
    economy.roomLegitimacy = round((Number(economy.roomLegitimacy) || 0) + snapshot.totals.legitimacy);
    return snapshot;
}

export function getRaidDamageMultiplier() {
    const defense = Math.max(0, Math.min(ROOM_BONUS_CAPS.defense, Number(getRoomBonusSnapshot().totals.defense) || 0));
    return Math.max(0.4, 1 - defense);
}
