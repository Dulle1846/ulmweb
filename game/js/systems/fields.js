// Seasonal fields and forest stewardship. Farms visibly pass through fallow,
// sown, growing, ripe and harvested states; grain enters the physical chain
// only at harvest. Foresters plant new stock slowly and only on valid ground.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { getResourceNodeAt, plantForestAt } from "./resource-geography.js";
import { addLocalOutput, getAvailableOutput, requestHaul } from "./logistics.js";
import { getWorkforceSnapshot } from "./economy.js";

export const FIELD_STAGES = Object.freeze(["fallow", "sown", "growing", "ripe", "harvested"]);
export const FIELD_LABELS = Object.freeze({
    fallow: "Fallow", sown: "Sown", growing: "Growing", ripe: "Ripe", harvested: "Harvested"
});

function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function ensureField(farm) {
    if (!farm.field || typeof farm.field !== "object") {
        let fertility = 50;
        try { fertility = Number(getResourceNodeAt(farm.x, farm.y)?.fertility) || 50; } catch { /* legacy test fixture */ }
        farm.field = { stage: "fallow", growth: 0, fertility, harvests: 0, lastHarvestYear: 0, sownYear: 0, pendingHarvest: 0, harvestTotal: 0 };
    }
    farm.field.stage = FIELD_STAGES.includes(farm.field.stage) ? farm.field.stage : "fallow";
    farm.field.growth = Math.max(0, Math.min(100, number(farm.field.growth)));
    farm.field.fertility = Math.max(0, Math.min(100, number(farm.field.fertility, 50)));
    farm.field.harvests = Math.max(0, Math.floor(number(farm.field.harvests)));
    farm.field.pendingHarvest = Math.max(0, Math.floor(number(farm.field.pendingHarvest)));
    farm.field.harvestTotal = Math.max(0, Math.floor(number(farm.field.harvestTotal)));
    return farm.field;
}

export function ensureFields() {
    for (const entity of state.entities) {
        if (!entity.dead && entity.type === TYPE.FARM) ensureField(entity);
    }
}

export function prepareFieldsForSave() {
    ensureFields();
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.FARM).map(entity => ({
        id: entity.id,
        field: { ...entity.field }
    }));
}

export function restoreFields(snapshot) {
    if (!Array.isArray(snapshot)) return 0;
    let restored = 0;
    for (const row of snapshot) {
        if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.field || typeof row.field !== "object") continue;
        const farm = state.entities.find(entity => entity.id === row.id && !entity.dead && entity.type === TYPE.FARM);
        if (!farm) continue;
        farm.field = {
            stage: FIELD_STAGES.includes(row.field.stage) ? row.field.stage : "fallow",
            growth: Math.max(0, Math.min(100, number(row.field.growth))),
            fertility: Math.max(0, Math.min(100, number(row.field.fertility, 50))),
            harvests: Math.max(0, Math.floor(number(row.field.harvests))),
            lastHarvestYear: Math.max(0, Math.floor(number(row.field.lastHarvestYear))),
            sownYear: Math.max(0, Math.floor(number(row.field.sownYear))),
            pendingHarvest: Math.max(0, Math.floor(number(row.field.pendingHarvest))),
            harvestTotal: Math.max(0, Math.floor(number(row.field.harvestTotal)))
        };
        restored++;
    }
    return restored;
}

function continueHarvest(farm, field) {
    const pending = Math.max(0, Math.floor(number(field.pendingHarvest)));
    if (pending <= 0) return;
    const accepted = addLocalOutput(farm, "grain", pending);
    if (accepted > 0) {
        field.pendingHarvest = Math.max(0, pending - accepted);
        requestHaul(farm, "grain", accepted);
    }
    if (field.pendingHarvest > 0) {
        field.lastReason = "Harvest waiting for storage";
        return;
    }
    field.stage = "harvested";
    field.growth = 0;
    field.harvests++;
    field.lastHarvestYear = state.year;
    field.lastReason = FIELD_LABELS.harvested;
    state.statistics.totalHarvests = (state.statistics.totalHarvests || 0) + 1;
}

function seasonalFieldUpdate(farm) {
    const field = ensureField(farm);
    const season = Math.max(0, Math.min(3, Math.floor(number(state.seasonIndex))));
    const storedGrain = getAvailableOutput(farm, "grain");
    if (storedGrain > 0) requestHaul(farm, "grain", storedGrain);
    const operation = farm.construction && farm.construction.stage < 3 ? null : Boolean(farm.workerCount > 0);
    if (!operation) {
        field.lastReason = "No farmer assigned";
        return;
    }
    // A partial harvest is never discarded when the local store is full. The
    // field keeps the unaccepted grain as pending work and resumes as soon as
    // a carrier has made room.
    if (field.pendingHarvest > 0) {
        continueHarvest(farm, field);
        return;
    }
    if (season === 0) {
        if (field.stage === "fallow" || field.stage === "harvested") {
            field.stage = "sown";
            field.growth = 0;
            field.sownYear = state.year;
        } else if (field.stage === "sown") {
            field.growth = Math.min(90, field.growth + 0.45 + field.fertility * 0.006);
        }
    } else if (season === 1) {
        if (field.stage === "sown" || field.stage === "growing") {
            field.stage = "growing";
            field.growth = Math.min(100, field.growth + 0.9 + field.fertility * 0.009);
            if (field.growth >= 100) field.stage = "ripe";
        }
    } else if (season === 2) {
        if (field.stage === "ripe") {
            field.pendingHarvest = Math.max(3, Math.round(4 + field.fertility / 12 + Math.min(8, field.growth / 14)));
            field.harvestTotal = field.pendingHarvest;
            continueHarvest(farm, field);
        } else if (field.stage === "growing") {
            field.growth = Math.min(100, field.growth + 0.3);
            if (field.growth >= 100) field.stage = "ripe";
        }
    } else {
        if (field.stage === "harvested" || field.stage === "ripe") field.stage = "fallow";
        if (field.stage === "fallow") field.growth = 0;
    }
    field.lastReason = FIELD_LABELS[field.stage] || "Fallow";
}

function foresterUpdate(building) {
    if (building.construction && building.construction.stage < 3) return;
    const active = (Number(building.workerCount) || 0) > 0;
    if (!active) return;
    const radius = 5;
    const x = Math.floor(building.x), y = Math.floor(building.y);
    let planted = 0;
    for (let oy = -radius; oy <= radius && planted < 2; oy++) {
        for (let ox = -radius; ox <= radius && planted < 2; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) > radius) continue;
            const node = getResourceNodeAt(x + ox, y + oy);
            if (!node || node.forestCapacity <= 0 || node.forestStock >= node.forestCapacity) continue;
            if (plantForestAt(x + ox, y + oy, 1)) planted++;
        }
    }
    building.foresterPlanted = (Number(building.foresterPlanted) || 0) + planted;
    building.foresterReason = planted ? "Planting saplings" : "Forest is fully grown";
}

export function updateFields() {
    if (!state.hasStarted || state.isPaused || state.gameOver) return null;
    ensureFields();
    const workforce = getWorkforceSnapshot();
    const farms = state.entities.filter(entity => !entity.dead && entity.type === TYPE.FARM);
    for (const farm of farms) {
        farm.workerCount = workforce.workersByBuilding.get(farm) || 0;
        seasonalFieldUpdate(farm);
    }
    const foresters = state.entities.filter(entity => !entity.dead && entity.type === TYPE.FORESTER);
    for (const forester of foresters) {
        forester.workerCount = workforce.workersByBuilding.get(forester) || 0;
        foresterUpdate(forester);
    }
    return farms.length;
}

export function getFieldSnapshot() {
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.FARM)
        .map(farm => ({ id: farm.id, x: farm.x, y: farm.y, ...ensureField(farm) }));
}
