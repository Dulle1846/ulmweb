// Seasonal fields and forest stewardship. Farms visibly pass through fallow,
// sown, growing, ripe and harvested states; grain enters the physical chain
// only at harvest. Foresters plant new stock slowly and only on valid ground.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { getForestStockAt, getResourceSiteAt, plantForestAt } from "./resource-geography.js";
import { addLocalOutput, getAvailableOutput, getPhysicalStock, requestHaul } from "./logistics.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { getBuildingEfficiency, getWorkforceSnapshot } from "./economy.js";
import { ECONOMY_TUNING, getHarvestYieldFactor } from "./economy-cycle.js";

export const FIELD_STAGES = Object.freeze(["fallow", "sown", "growing", "ripe", "harvested"]);
export const FIELD_LABELS = Object.freeze({
    fallow: "Fallow", sown: "Sown", growing: "Growing", ripe: "Ripe", harvested: "Harvested"
});
// Farmers stop sowing a new field when the granary already holds a year of
// grain. Without this the annual harvest buried the food chain in overflow.
const GRAIN_RESERVE = 120;
// Soil is a slow resource. A harvest removes fertility; fallow time and stable
// manure restore it; an exhausted field rests for a year instead of sowing.
const MIN_FERTILITY = 12;
const REST_THRESHOLD_RATIO = 0.35;
const REST_RECOVERY = 0.22;
const FALLOW_RECOVERY = 0.08;
const MANURE_RECOVERY = 0.05;
const MANURE_RADIUS = 6;
const BASE_DEPLETION = 6.5;
const DEPLETION_PER_YIELD = 0.16;

function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function ensureField(farm) {
    let terrainFertility = 50;
    try { terrainFertility = Number(getResourceSiteAt(farm.x, farm.y)?.fertility) || 50; } catch { /* legacy test fixture */ }
    if (!farm.field || typeof farm.field !== "object") {
        farm.field = {
            stage: "fallow", growth: 0, fertility: terrainFertility, harvests: 0,
            lastHarvestYear: 0, sownYear: 0, pendingHarvest: 0, harvestTotal: 0,
            maxFertility: terrainFertility, resting: false, lastDepletion: 0, lastReason: "Fallow"
        };
    }
    farm.field.stage = FIELD_STAGES.includes(farm.field.stage) ? farm.field.stage : "fallow";
    farm.field.growth = Math.max(0, Math.min(100, number(farm.field.growth)));
    const maxFertility = Math.max(
        number(farm.field.fertility, terrainFertility),
        number(farm.field.maxFertility, terrainFertility),
        terrainFertility
    );
    farm.field.maxFertility = Math.max(1, Math.min(100, maxFertility));
    farm.field.fertility = Math.max(0, Math.min(farm.field.maxFertility, number(farm.field.fertility, terrainFertility)));
    farm.field.harvests = Math.max(0, Math.floor(number(farm.field.harvests)));
    farm.field.pendingHarvest = Math.max(0, Math.floor(number(farm.field.pendingHarvest)));
    farm.field.harvestTotal = Math.max(0, Math.floor(number(farm.field.harvestTotal)));
    farm.field.resting = Boolean(farm.field.resting);
    farm.field.lastDepletion = Math.max(0, number(farm.field.lastDepletion));
    farm.field.lastReason = typeof farm.field.lastReason === "string" ? farm.field.lastReason : "Fallow";
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
        const fertility = Math.max(0, Math.min(100, number(row.field.fertility, 50)));
        farm.field = {
            stage: FIELD_STAGES.includes(row.field.stage) ? row.field.stage : "fallow",
            growth: Math.max(0, Math.min(100, number(row.field.growth))),
            fertility,
            harvests: Math.max(0, Math.floor(number(row.field.harvests))),
            lastHarvestYear: Math.max(0, Math.floor(number(row.field.lastHarvestYear))),
            sownYear: Math.max(0, Math.floor(number(row.field.sownYear))),
            pendingHarvest: Math.max(0, Math.floor(number(row.field.pendingHarvest))),
            harvestTotal: Math.max(0, Math.floor(number(row.field.harvestTotal))),
            maxFertility: Math.max(1, Math.min(100, Math.max(fertility, number(row.field.maxFertility, fertility)))),
            resting: Boolean(row.field.resting),
            lastDepletion: Math.max(0, number(row.field.lastDepletion)),
            lastReason: typeof row.field.lastReason === "string" ? row.field.lastReason : "Fallow"
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
        const production = state.economy?.productionChains;
        if (production) production.grainHarvested = Math.max(0, number(production.grainHarvested)) + accepted;
        // Farm households keep a measured share of the crop. It reaches the
        // royal food store at the harvest, so a settlement with fields can feed
        // itself before a mill and bakery chain exists. The rest remains grain
        // in the physical store and still needs carriers, a mill and a bakery.
        const subsistence = Math.min(accepted, Math.floor(accepted * ECONOMY_TUNING.farmSubsistenceShare));
        if (subsistence > 0) {
            recordResourceMovement("food", subsistence, "farm-subsistence", {
                from: { kind: "building", id: farm.id },
                to: { kind: "realm", id: "royal-stores" },
                key: "food:farm-subsistence:" + farm.id + ":" + field.sownYear + ":" + state.year
            });
            addResource("food", subsistence);
        }
    }
    if (field.pendingHarvest > 0) {
        field.lastReason = "Harvest waiting for storage";
        return;
    }
    field.stage = "harvested";
    field.growth = 0;
    field.harvests++;
    field.lastHarvestYear = state.year;
    const harvested = Math.max(1, number(field.harvestTotal, 1));
    const depletion = BASE_DEPLETION + harvested * DEPLETION_PER_YIELD;
    field.fertility = Math.max(MIN_FERTILITY, field.fertility - depletion);
    field.lastDepletion = depletion;
    const restThreshold = Math.max(15, field.maxFertility * REST_THRESHOLD_RATIO);
    if (field.fertility <= restThreshold) {
        field.resting = true;
        field.lastReason = "Soil exhausted — resting";
    } else {
        field.lastReason = FIELD_LABELS.harvested;
    }
    state.statistics.totalHarvests = (state.statistics.totalHarvests || 0) + 1;
}

function stableManureNear(farm) {
    const x = Number(farm.x), y = Number(farm.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return state.entities.some(entity => {
        if (!entity || entity.dead || entity.type !== TYPE.STABLE) return false;
        if (entity.construction && entity.construction.stage < 3) return false;
        return Math.hypot(Number(entity.x) - x, Number(entity.y) - y) <= MANURE_RADIUS;
    });
}

function recoverSoil(field, amount) {
    field.fertility = Math.min(field.maxFertility, field.fertility + amount);
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
    const manure = stableManureNear(farm);
    if (field.resting) {
        // A resting field is fallow ground, not a standing harvested crop. The
        // status must be visible before the next winter boundary.
        field.stage = "fallow";
        recoverSoil(field, REST_RECOVERY + (manure ? MANURE_RECOVERY : 0));
        if (field.fertility >= field.maxFertility * 0.65) {
            field.resting = false;
            field.lastReason = "Soil recovered — ready to sow";
        } else {
            field.lastReason = "Resting — soil recovering";
            return;
        }
    } else if (field.stage === "fallow" || field.stage === "harvested") {
        recoverSoil(field, FALLOW_RECOVERY + (manure ? MANURE_RECOVERY : 0));
    }
    if (season === 0) {
        if ((field.stage === "fallow" || field.stage === "harvested") && getPhysicalStock("grain") >= GRAIN_RESERVE) {
            field.lastReason = "Granary is full";
            return;
        }
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
            const yieldFactor = getHarvestYieldFactor();
            field.lastYieldFactor = yieldFactor;
            field.pendingHarvest = Math.max(8, Math.round((10 + field.fertility / 8 + Math.min(12, field.growth / 10)) * yieldFactor));
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

export function foresterRangeSummary(building, radius = 5) {
    const limit = Math.max(0, Math.floor(Number(radius) || 0));
    const empty = { radius: limit, tiles: 0, stock: 0, capacity: 0, fill: 0, restorable: 0, depleted: 0 };
    if (!building || !Number.isFinite(Number(building.x)) || !Number.isFinite(Number(building.y))) return empty;
    const x = Math.floor(Number(building.x)), y = Math.floor(Number(building.y));
    let tiles = 0, stock = 0, capacity = 0, restorable = 0, depleted = 0;
    for (let oy = -limit; oy <= limit; oy++) {
        for (let ox = -limit; ox <= limit; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) > limit) continue;
            const node = getForestStockAt(x + ox, y + oy);
            if (!node || node.forestCapacity <= 0) continue;
            tiles++;
            stock += node.forestStock;
            capacity += node.forestCapacity;
            if (node.forestStock < node.forestCapacity) restorable++;
            if (node.forestStock <= 0) depleted++;
        }
    }
    return { radius: limit, tiles, stock, capacity, fill: capacity > 0 ? stock / capacity : 0, restorable, depleted };
}

function foresterUpdate(building, workforce) {
    if (building.construction && building.construction.stage < 3) return;
    const efficiency = getBuildingEfficiency(building, workforce);
    if (efficiency <= 0) {
        building.foresterReason = "No staff assigned";
        return;
    }
    const radius = 5;
    const x = Math.floor(building.x), y = Math.floor(building.y);
    const candidates = [];
    for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) > radius) continue;
            const node = getForestStockAt(x + ox, y + oy);
            if (!node || node.forestCapacity <= 0 || node.forestStock >= node.forestCapacity) continue;
            candidates.push({
                x: x + ox, y: y + oy,
                ratio: node.forestStock / Math.max(1, node.forestCapacity),
                distance: Math.hypot(ox, oy),
            });
        }
    }
    // A Forester first repairs the most cut-over stands, then the nearest
    // remaining gaps. The old row-major scan always started at the northwest
    // corner and left the worst damage untouched until last.
    candidates.sort((a, b) => a.ratio - b.ratio || a.distance - b.distance || a.y - b.y || a.x - b.x);
    const plantingLimit = Math.max(1, Math.round(2 * efficiency));
    let planted = 0;
    for (const tile of candidates.slice(0, plantingLimit)) {
        if (plantForestAt(tile.x, tile.y, 1)) planted++;
    }
    building.foresterPlanted = (Number(building.foresterPlanted) || 0) + planted;
    building.foresterReason = planted ? "Planting saplings" : candidates.length ? "Waiting for planting space" : "Forest is fully grown";
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
        foresterUpdate(forester, workforce);
    }
    return farms.length;
}

export function getFieldSnapshot() {
    return state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.FARM)
        .map(farm => {
            const field = ensureField(farm);
            return {
                id: farm.id, x: farm.x, y: farm.y, ...field,
                status: field.resting ? "Resting" : (FIELD_LABELS[field.stage] || "Fallow")
            };
        });
}
