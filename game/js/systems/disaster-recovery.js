// Disaster recovery: the realm remembers what the weather took.
//
// Coastal surges, snowslides and eruptions already marked every wrecked
// building with destroyedBy/destroyedYear, but nothing in the living world
// read those tags. A storm therefore erased a granary, the crown paid the full
// price for a replacement, and the loss left no trace after a reload.
//
// This module turns those tags into one small persisted register. The annual
// audit reads the capped entity list, records each tagged wreck once, salvages
// its timber and stone at a later audit, and rebuilding the same structure
// within three tiles of the wreck earns a real material discount. Pending
// wrecks are capped and the pass settles at most a handful of entries, so the
// cost stays bounded on low-end devices.
import { state } from "../core/state.js";
import { BUILDING_COSTS, buildingLabel } from "./city-config.js";
import { addResource } from "./resources.js";
import { addLog } from "../core/event-log.js";

export const DISASTER_RECOVERY_VERSION = 1;
export const DISASTER_PENDING_LIMIT = 8;
export const DISASTER_HISTORY_LIMIT = 8;
export const DISASTER_SALVAGE_LIMIT = 4;
export const DISASTER_SCAN_LIMIT = 900;
export const REBUILD_DISCOUNT = 0.25;
export const REBUILD_RADIUS = 3;
const SALVAGE_SHARE = 0.25;
const SALVAGE_MATERIAL_LIMIT = 24;

const clampInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : min;
};
const text = (value, length = 60) => String(value ?? "").trim().slice(0, length);

export function disasterCauseLabel(cause) {
    const words = String(cause || "disaster").replace(/[-_]+/g, " ").trim();
    if (!words) return "Disaster";
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function salvageFor(type) {
    const base = BUILDING_COSTS[type] || {};
    const wood = clampInt((Number(base.wood) || 0) * SALVAGE_SHARE, 0, SALVAGE_MATERIAL_LIMIT);
    const stone = clampInt((Number(base.stone) || 0) * SALVAGE_SHARE, 0, SALVAGE_MATERIAL_LIMIT);
    return { wood, stone };
}

function sanitizeEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const x = Number(value.x), y = Number(value.y), type = Number(value.type);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(type)) return null;
    const materials = value.materials && typeof value.materials === "object" ? value.materials : {};
    return {
        id: text(value.id, 90) || "wreck-" + Math.floor(x) + "-" + Math.floor(y),
        buildingId: text(value.buildingId, 60) || null,
        type: Math.floor(type),
        label: text(value.label, 60) || buildingLabel(type),
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        cause: text(value.cause, 40) || "disaster",
        causeLabel: text(value.causeLabel, 60) || disasterCauseLabel(value.cause),
        year: clampInt(value.year, 1, 9999),
        materials: {
            wood: clampInt(materials.wood, 0, SALVAGE_MATERIAL_LIMIT),
            stone: clampInt(materials.stone, 0, SALVAGE_MATERIAL_LIMIT)
        },
        salvagedYear: clampInt(value.salvagedYear, 0, 9999)
    };
}

export function createDisasterRecoveryState() {
    return {
        version: DISASTER_RECOVERY_VERSION,
        revision: 0,
        pending: [],
        history: [],
        salvage: { wood: 0, stone: 0 },
        lastSalvage: { year: 0, wood: 0, stone: 0, wrecks: 0 },
        rebuilt: 0,
        lastYear: 0
    };
}

export function ensureDisasterRecovery() {
    if (!state.disasterRecovery || typeof state.disasterRecovery !== "object" || Array.isArray(state.disasterRecovery)) {
        state.disasterRecovery = createDisasterRecoveryState();
    }
    return state.disasterRecovery;
}

export function normalizeDisasterRecoveryState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const pending = (Array.isArray(source.pending) ? source.pending : [])
        .map(sanitizeEntry).filter(Boolean).slice(0, DISASTER_PENDING_LIMIT);
    const history = (Array.isArray(source.history) ? source.history : [])
        .map(sanitizeEntry).filter(Boolean).slice(0, DISASTER_HISTORY_LIMIT);
    const salvage = source.salvage && typeof source.salvage === "object" ? source.salvage : {};
    const lastSalvage = source.lastSalvage && typeof source.lastSalvage === "object" ? source.lastSalvage : {};
    return {
        version: DISASTER_RECOVERY_VERSION,
        revision: clampInt(source.revision, 0),
        pending,
        history,
        salvage: {
            wood: clampInt(salvage.wood, 0),
            stone: clampInt(salvage.stone, 0)
        },
        lastSalvage: {
            year: clampInt(lastSalvage.year, 0, 9999),
            wood: clampInt(lastSalvage.wood, 0),
            stone: clampInt(lastSalvage.stone, 0),
            wrecks: clampInt(lastSalvage.wrecks, 0, DISASTER_PENDING_LIMIT)
        },
        rebuilt: clampInt(source.rebuilt, 0),
        lastYear: clampInt(source.lastYear, 0, 9999)
    };
}

export function validateDisasterRecoveryState(input) {
    if (input === undefined || input === null) return true;
    if (typeof input !== "object" || Array.isArray(input)) throw new Error("Disaster recovery must be an object.");
    if (input.pending !== undefined && (!Array.isArray(input.pending) || input.pending.length > DISASTER_PENDING_LIMIT)) {
        throw new Error("Disaster recovery has an invalid wreck list.");
    }
    if (input.history !== undefined && (!Array.isArray(input.history) || input.history.length > DISASTER_HISTORY_LIMIT)) {
        throw new Error("Disaster recovery has an invalid history.");
    }
    if (input.salvage !== undefined && (typeof input.salvage !== "object" || Array.isArray(input.salvage))) {
        throw new Error("Disaster recovery has an invalid salvage total.");
    }
    return true;
}

// The only reader of the destruction tags. The entity list is capped by the
// world, and this pass marks each dead building once, so the annual work stays
// bounded even after a long campaign.
export function ingestDisasterTags(year = state.year) {
    const recovery = ensureDisasterRecovery();
    const wreckYear = clampInt(year, 1, 9999);
    const known = new Set([...recovery.pending, ...recovery.history]
        .map(entry => entry.buildingId).filter(Boolean));
    let added = 0, scanned = 0;
    for (const entity of state.entities || []) {
        if (added >= DISASTER_PENDING_LIMIT || ++scanned > DISASTER_SCAN_LIMIT) break;
        if (!entity || !entity.dead || entity.recoveryRecorded) continue;
        if (!entity.destroyedBy || !entity.destroyedYear) continue;
        if (typeof entity.isBuilding === "function" && !entity.isBuilding()) continue;
        const buildingId = text(entity.id, 60);
        entity.recoveryRecorded = true;
        if (buildingId && known.has(buildingId)) continue;
        const entry = sanitizeEntry({
            id: "wreck-" + wreckYear + "-" + Math.floor(entity.x) + "-" + Math.floor(entity.y) + "-" + recovery.revision,
            buildingId,
            type: entity.type,
            label: buildingLabel(entity.type),
            x: entity.x,
            y: entity.y,
            cause: entity.destroyedBy,
            year: entity.destroyedYear,
            materials: salvageFor(entity.type)
        });
        if (!entry) continue;
        recovery.pending.unshift(entry);
        known.add(buildingId);
        added += 1;
    }
    while (recovery.pending.length > DISASTER_PENDING_LIMIT) {
        const dropped = recovery.pending.pop();
        recovery.history.unshift({ ...dropped, droppedYear: wreckYear });
        recovery.history.length = Math.min(recovery.history.length, DISASTER_HISTORY_LIMIT);
    }
    if (added > 0) recovery.revision += 1;
    return added;
}

// One bounded annual read. The pass first ingests any hazard-tagged dead
// building, then wrecks from an earlier year yield their salvage exactly once.
// At most four entries are settled per audit. The wreck itself stays on the
// register so the player can still rebuild on the scar.
export function updateDisasterRecovery() {
    if (!state.hasStarted) return { ok: false, reason: "no-realm" };
    const recovery = ensureDisasterRecovery();
    const year = clampInt(state.year, 1, 9999);
    const ingested = ingestDisasterTags(year);
    let wood = 0, stone = 0, wrecks = 0;
    for (const entry of recovery.pending) {
        if (wrecks >= DISASTER_SALVAGE_LIMIT) break;
        if (entry.salvagedYear) continue;
        if (year <= entry.year) continue;
        entry.salvagedYear = year;
        if (entry.materials.wood > 0) { addResource("wood", entry.materials.wood); wood += entry.materials.wood; }
        if (entry.materials.stone > 0) { addResource("stone", entry.materials.stone); stone += entry.materials.stone; }
        wrecks += 1;
        addLog("RUIN SALVAGE · " + entry.label.toUpperCase() + " · " + entry.causeLabel.toUpperCase()
            + " · " + (entry.materials.wood ? entry.materials.wood + " WOOD " : "")
            + (entry.materials.stone ? entry.materials.stone + " STONE" : ""), "#c8b184", "disaster");
    }
    recovery.salvage.wood += wood;
    recovery.salvage.stone += stone;
    recovery.lastYear = year;
    if (wrecks > 0) recovery.lastSalvage = { year, wood, stone, wrecks };
    recovery.revision += 1;
    return { ok: true, year, ingested, wrecks, wood, stone };
}

export function rebuildDiscountFor(type, x, y) {
    const wx = Number(x), wy = Number(y);
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    const recovery = ensureDisasterRecovery();
    let best = null, bestDistance = REBUILD_RADIUS + 1;
    for (const entry of recovery.pending) {
        if (entry.type !== Number(type)) continue;
        const distance = Math.hypot(entry.x - wx, entry.y - wy);
        if (distance <= REBUILD_RADIUS && distance < bestDistance) {
            best = entry;
            bestDistance = distance;
        }
    }
    return best;
}

export function consumeRebuildRuin(type, x, y) {
    const entry = rebuildDiscountFor(type, x, y);
    if (!entry) return false;
    const recovery = ensureDisasterRecovery();
    const index = recovery.pending.indexOf(entry);
    if (index >= 0) recovery.pending.splice(index, 1);
    recovery.history.unshift({ ...entry, rebuiltYear: clampInt(state.year, 1, 9999) });
    recovery.history.length = Math.min(recovery.history.length, DISASTER_HISTORY_LIMIT);
    recovery.rebuilt += 1;
    recovery.revision += 1;
    addLog("THE WRECK OF " + entry.label.toUpperCase() + " IS REBUILT · " + Math.round(REBUILD_DISCOUNT * 100)
        + "% MATERIALS RECOVERED ON SITE", "#a8c79a", "disaster");
    return true;
}

export function getDisasterRecoverySnapshot() {
    const recovery = ensureDisasterRecovery();
    const lastWreck = recovery.pending[0] || recovery.history[0] || null;
    return {
        pendingCount: recovery.pending.length,
        pending: recovery.pending.map(entry => ({ ...entry, materials: { ...entry.materials } })),
        history: recovery.history.map(entry => ({ ...entry, materials: { ...entry.materials } })),
        salvage: { ...recovery.salvage },
        lastSalvage: { ...recovery.lastSalvage },
        rebuilt: recovery.rebuilt,
        discountPercent: Math.round(REBUILD_DISCOUNT * 100),
        radius: REBUILD_RADIUS,
        lastWreck: lastWreck ? { ...lastWreck, materials: { ...lastWreck.materials } } : null
    };
}
