// One-click building repair. A damaged finished structure is restored from the
// royal stores; the cost scales with the missing fraction of its rebuild bill.
// This writes only entity.hp and existing resources, so old saves stay valid.
import { state } from "../core/state.js";
import { TILE_SIZE } from "../core/config.js";
import { TYPE } from "../core/types.js";
import { addLog } from "../core/event-log.js";
import { queueFloater } from "../core/presentation-effects.js";
import { isUnderConstruction } from "./construction.js";
import { REBUILD_COST, buildingName } from "../presentation/rendering/building-art.js";

const REPAIR_RATE = 0.5;
const FALLBACK_COST = { wood: 6, stone: 4 };
const DEFENSIVE_TYPES = new Set([TYPE.WALL, TYPE.TOWER, TYPE.WATCHHOUSE]);

function resolveEntity(target) {
    if (target && typeof target === "object") return target;
    if (typeof target !== "string") return null;
    return state.entities.find(entity => entity.id === target && !entity.dead) || null;
}

export function getBuildingRepairSnapshot(target) {
    const entity = resolveEntity(target);
    if (!entity || !entity.isBuilding?.() || entity.dead) {
        return { ok: false, reason: "no-building", cost: {}, entity: null };
    }
    if (isUnderConstruction(entity)) {
        return { ok: false, reason: "under-construction", cost: {}, entity };
    }
    const maxHp = Math.max(1, Number(entity.maxHp) || 100);
    const hp = Math.max(0, Math.min(maxHp, Number(entity.hp) || 0));
    const missing = maxHp - hp;
    if (missing <= 0) {
        return { ok: false, reason: "sound", cost: {}, entity, hp, maxHp, missing: 0 };
    }
    const ratio = missing / maxHp;
    const bill = REBUILD_COST[entity.type] || FALLBACK_COST;
    const cost = {};
    for (const [resource, amount] of Object.entries(bill)) {
        const due = Math.ceil(Number(amount) * ratio * REPAIR_RATE);
        if (due > 0) cost[resource] = due;
    }
    const affordable = Object.entries(cost).every(([resource, amount]) =>
        (Number(state.resources?.[resource]) || 0) >= amount);
    return {
        ok: affordable,
        reason: affordable ? "ready" : "short-resources",
        affordable,
        cost,
        entity,
        hp,
        maxHp,
        missing,
    };
}

// Derived, read-only survey for the Kingdom Overview. One bounded pass over
// live entities, and only while that panel renders — never inside a sim tick.
export function getRealmDamageSnapshot() {
    let damaged = 0;
    let defensive = 0;
    let missingHp = 0;
    let worst = null;
    for (const entity of state.entities || []) {
        if (!entity || entity.dead || typeof entity.isBuilding !== "function" || !entity.isBuilding()) continue;
        if (isUnderConstruction(entity)) continue;
        const maxHp = Math.max(1, Number(entity.maxHp) || 100);
        const hp = Math.max(0, Math.min(maxHp, Number(entity.hp) || 0));
        if (hp >= maxHp) continue;
        damaged += 1;
        missingHp += maxHp - hp;
        if (DEFENSIVE_TYPES.has(entity.type)) defensive += 1;
        const ratio = hp / maxHp;
        if (!worst || ratio < worst.ratio) {
            worst = { id: entity.id, name: buildingName(entity.type), ratio, hp, maxHp };
        }
    }
    return { damaged, defensive, missingHp: Math.round(missingHp), worst };
}

// A read-only bill for the Buildings panel. Raid and flood damage often lands
// on several structures at once, so the player needs one visible total instead
// of opening every inspector by hand. One bounded pass over live entities.
export function getBulkRepairSnapshot() {
    const cost = {};
    let count = 0;
    let missingHp = 0;
    for (const entity of state.entities || []) {
        const snapshot = getBuildingRepairSnapshot(entity);
        if (!snapshot.entity || (snapshot.reason !== "ready" && snapshot.reason !== "short-resources")) continue;
        count += 1;
        missingHp += snapshot.missing;
        for (const [resource, amount] of Object.entries(snapshot.cost)) {
            cost[resource] = (cost[resource] || 0) + amount;
        }
    }
    const affordable = Object.entries(cost).every(([resource, amount]) =>
        (Number(state.resources?.[resource]) || 0) >= amount);
    return {
        count,
        missingHp: Math.round(missingHp),
        cost,
        affordable,
        ok: count > 0 && affordable,
        reason: count === 0 ? "no-damaged-buildings" : affordable ? "ready" : "short-resources",
    };
}

// Repairs every damaged finished structure only when the whole bill is
// affordable. No partial spend: the player sees the total before committing and
// each entity still goes through the same single-building repair path.
export function repairAllDamaged() {
    const bill = getBulkRepairSnapshot();
    if (!bill.count) return { ok: false, reason: bill.reason, cost: {}, repaired: 0, restored: 0 };
    if (!bill.ok) return { ok: false, reason: bill.reason, cost: bill.cost, repaired: 0, restored: 0 };
    let repaired = 0;
    let restored = 0;
    for (const entity of state.entities || []) {
        const result = repairBuilding(entity);
        if (!result.ok) continue;
        repaired += 1;
        restored += result.restored;
    }
    return { ok: repaired > 0, reason: repaired ? "ready" : "no-damaged-buildings", cost: bill.cost, repaired, restored: Math.round(restored) };
}

export function repairBuilding(target) {
    const snapshot = getBuildingRepairSnapshot(target);
    if (!snapshot.entity) return { ok: false, reason: snapshot.reason, cost: {} };
    if (snapshot.reason === "sound") return { ok: false, reason: "sound", cost: {}, entity: snapshot.entity };
    if (snapshot.reason === "under-construction") {
        return { ok: false, reason: "under-construction", cost: {}, entity: snapshot.entity };
    }
    if (!snapshot.affordable) {
        return { ok: false, reason: "short-resources", cost: snapshot.cost, entity: snapshot.entity };
    }
    for (const [resource, amount] of Object.entries(snapshot.cost)) {
        state.resources[resource] = Math.max(0, Number(state.resources[resource]) - amount);
    }
    const restored = snapshot.missing;
    snapshot.entity.hp = snapshot.maxHp;
    const label = buildingName(snapshot.entity.type);
    queueFloater(snapshot.entity.x * TILE_SIZE, snapshot.entity.y * TILE_SIZE - 16, "REPAIRED", "#a3e635");
    addLog(label.toUpperCase() + " REPAIRED · " + Math.round(restored) + " HP", "#a3e635", "construction");
    return { ok: true, cost: snapshot.cost, entity: snapshot.entity, restored, hp: snapshot.maxHp };
}
