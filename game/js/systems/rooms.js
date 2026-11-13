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
import {
    FURNITURE_BONUS_CAP,
    FURNITURE_POINT_VALUE,
    FURNITURE_REALM_CAPS,
    getRoomFurniturePlan,
    furnitureCount,
    furnitureMultiplier,
    furnitureUpkeep,
    normalizeRoomName,
    roomRoleId,
} from "./furniture.js";

export { FURNITURE_BONUS_CAP, FURNITURE_POINT_VALUE, FURNITURE_REALM_CAPS, roomRoleId };

export const ROOM_BONUS_INTERVAL = 20;
export const ROOM_BONUS_CAPS = Object.freeze({
    gold: 4,
    legitimacy: 0.7,
    morale: 0.7,
    growth: 5,
    defense: 0.5,
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

const round = value => Math.round(value * 1000) / 1000;
const zeroEffects = () => Object.fromEntries(EFFECT_KEYS.map(effect => [effect, 0]));

export function roomWeight(area) {
    const value = Number(area);
    return Number.isFinite(value) ? Math.max(0.5, Math.min(3, value / 12)) : 0.5;
}

function footprintDims(entity) {
    const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
    const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
    return { w: base.w * scale, h: base.h * scale };
}

export function getFurnitureMultiplier(entity, roomName, roleId = roomRoleId(roomName)) {
    if (!entity) return 1;
    const dims = footprintDims(entity);
    if (!hasInterior(entity.type, dims.w, dims.h)) return 1;
    const rooms = roomsOf(normalizeLayout(entity.type, entity.layout, dims.w, dims.h), entity.type);
    const plan = getRoomFurniturePlan({
        rooms,
        interior: normalizeInterior(entity.type, entity.interior),
        roomFurniture: entity.roomFurniture,
    });
    return furnitureMultiplier(plan.byRoom[normalizeRoomName(roomName)] || {}, roleId);
}

// The workshop needs the same numbers the realm ledger uses. This breakdown
// keeps sealed rooms visible (with zero effects) and separates base room value
// from the part contributed by furniture.
export function getBuildingRoomBreakdown(entity) {
    if (!entity || entity.dead || typeof entity.isBuilding !== "function" || !entity.isBuilding()) return null;
    const dims = footprintDims(entity);
    if (!hasInterior(entity.type, dims.w, dims.h)) return null;
    const layout = normalizeLayout(entity.type, entity.layout, dims.w, dims.h);
    const detected = roomsOf(layout, entity.type);
    const plan = getRoomFurniturePlan({
        rooms: detected,
        interior: normalizeInterior(entity.type, entity.interior),
        roomFurniture: entity.roomFurniture,
    });
    const multipliers = {};
    const rooms = detected.map(room => {
        const role = roomRoleId(room.name);
        const weight = roomWeight(room.area);
        const assigned = plan.byRoom[room.name] || {};
        const multiplier = room.accessible ? furnitureMultiplier(assigned, role) : 1;
        multipliers[room.name] = multiplier;
        const baseEffects = zeroEffects();
        const furnitureEffects = zeroEffects();
        const effects = zeroEffects();
        if (room.accessible) {
            const base = ROOM_ROLES[role].effects;
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
            furnitureItems: { ...assigned },
            furnitureCount: furnitureCount(assigned),
            furnitureUpkeep: furnitureUpkeep(assigned),
            furnitureMultiplier: multiplier,
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
        furnitureExplicit: plan.explicit,
        furnitureTotal: plan.totalItems,
        furnitureUpkeep: plan.upkeep,
    };
}

// Furniture is maintained whether or not its room is currently reachable; the
// ledger charges every assigned item once per settlement period.
export function getFurnitureUpkeepTotal() {
    // The room snapshot already walks every building and sums the same
    // per-building furniture upkeep. Reusing it avoids a second full layout /
    // furniture plan pass on every settlement tick; the cached value is exact,
    // not an approximation.
    return getRoomBonusSnapshot().furnitureUpkeep;
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
        // Room layout and furniture are covered by these three revisions.
        // Entity count and nextEntityId change when residents, animals or
        // caravans spawn; they are not room inputs and used to invalidate the
        // whole snapshot on every population change.
        state.buildingLayoutVersion || 0,
        state.buildingInteriorVersion || 0,
        state.buildingCollisionVersion || 0,
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
    let furnitureUpkeep = 0;
    const entities = Array.isArray(state.entities) ? state.entities : [];
    for (const entity of entities) {
        const breakdown = getBuildingRoomBreakdown(entity);
        if (!breakdown) continue;
        buildings++;
        sealed += breakdown.sealed;
        furnitureUpkeep += breakdown.furnitureUpkeep;
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
    const baseRawTotals = zeroEffects();
    const furnitureRawTotals = zeroEffects();
    for (const role of roleMap.values()) {
        for (const effect of EFFECT_KEYS) {
            role.baseEffects[effect] = round(role.baseEffects[effect]);
            role.furnitureEffects[effect] = round(role.furnitureEffects[effect]);
            role.effects[effect] = round(role.effects[effect]);
            baseRawTotals[effect] += role.baseEffects[effect];
            furnitureRawTotals[effect] += role.furnitureEffects[effect];
            rawTotals[effect] += role.effects[effect];
        }
    }
    const baseTotals = zeroEffects();
    const furnitureTotals = zeroEffects();
    const totals = zeroEffects();
    const capped = {};
    const furnitureCapped = {};
    for (const effect of EFFECT_KEYS) {
        rawTotals[effect] = round(rawTotals[effect]);
        baseRawTotals[effect] = round(baseRawTotals[effect]);
        furnitureRawTotals[effect] = round(furnitureRawTotals[effect]);
        capped[effect] = baseRawTotals[effect] > ROOM_BONUS_CAPS[effect] + 0.0001;
        furnitureCapped[effect] = furnitureRawTotals[effect] > FURNITURE_REALM_CAPS[effect] + 0.0001;
        baseTotals[effect] = round(Math.min(ROOM_BONUS_CAPS[effect], Math.max(0, baseRawTotals[effect])));
        furnitureTotals[effect] = round(Math.min(FURNITURE_REALM_CAPS[effect], Math.max(0, furnitureRawTotals[effect])));
        totals[effect] = round(baseTotals[effect] + furnitureTotals[effect]);
    }

    const snapshot = {
        rooms,
        sealed,
        buildings,
        interval: ROOM_BONUS_INTERVAL,
        roles: [...roleMap.values()],
        rawTotals,
        baseRawTotals,
        furnitureRawTotals,
        baseTotals,
        furnitureTotals,
        totals,
        capped,
        furnitureCapped,
        furnitureUpkeep: round(furnitureUpkeep),
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
        snapshot.furnitureUpkeep,
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
