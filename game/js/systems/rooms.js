// Room functions: accessible floor-plan rooms provide realm-wide bonuses.
// Everything here is derived from the authored layouts and is never stored
// separately, so save/load and the workshop stay the single source of truth.
import { BUILDING_SIZE } from "../core/config.js";
import { state } from "../core/state.js";
import { hasInterior, normalizeLayout, roomsOf } from "../presentation/building-layout.js";
import { addResource } from "./resources.js";
import { normalizePoliticalState } from "./politics.js";

export const ROOM_BONUS_INTERVAL = 20;
export const ROOM_BONUS_CAPS = Object.freeze({
    gold: 6,
    legitimacy: 2,
    morale: 4,
    growth: 8,
    defense: 0.6,
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
        effects: Object.fromEntries(EFFECT_KEYS.map(effect => [effect, 0])),
    }]));

    let rooms = 0;
    let sealed = 0;
    let buildings = 0;
    const entities = Array.isArray(state.entities) ? state.entities : [];
    for (const entity of entities) {
        if (!entity || entity.dead || typeof entity.isBuilding !== "function" || !entity.isBuilding()) continue;
        const dims = footprintDims(entity);
        if (!hasInterior(entity.type, dims.w, dims.h)) continue;
        const layout = normalizeLayout(entity.type, entity.layout, dims.w, dims.h);
        const roomList = roomsOf(layout, entity.type);
        buildings++;
        for (const room of roomList) {
            if (!room.accessible) {
                sealed++;
                continue;
            }
            const role = roleMap.get(roomRoleId(room.name));
            role.roomCount++;
            role.weight += roomWeight(room.area);
            rooms++;
        }
    }

    const totals = Object.fromEntries(EFFECT_KEYS.map(effect => [effect, 0]));
    for (const id of ROLE_ORDER) {
        const role = roleMap.get(id);
        for (const [effect, base] of Object.entries(ROOM_ROLES[id].effects)) {
            role.effects[effect] = round(base * role.weight);
            totals[effect] += role.effects[effect];
        }
    }
    for (const effect of EFFECT_KEYS) {
        totals[effect] = round(Math.min(ROOM_BONUS_CAPS[effect], Math.max(0, totals[effect])));
    }

    const snapshot = {
        rooms,
        sealed,
        buildings,
        interval: ROOM_BONUS_INTERVAL,
        roles: [...roleMap.values()],
        totals,
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
