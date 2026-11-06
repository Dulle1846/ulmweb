// Construction sites: every new structure starts with a visible site, then
// receives real material deliveries and builder labour before it becomes
// operational. Cancelling is deliberately recoverable but never free.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { WORLD_W, WORLD_H, BUILDING_SIZE } from "../core/config.js";
import { addResource } from "./resources.js";
import { spawnEntity, canSpawnEntity, buildingOverlaps } from "../world/entities.js";
import { isWaterAt, worldWidth, worldHeight, revealArea } from "../world/world.js";
import { getResourceNodeAt } from "./resource-geography.js";
import { getWorkforceSnapshot } from "./economy.js";
import {
    BUILDING_COSTS, CONSTRUCTION_STAGES, CONSTRUCTION_SHARE, buildingLabel,
    constructionMaterialNeed, costShare, isHousingType
} from "./city-config.js";
import {
    ensureCityState, ensureInventory, requestConstructionDelivery, cancelJobsForEntity,
    markConstructionDelivered, getWarehouseStock
} from "./logistics.js";

export const CONSTRUCTION_RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold", "food"]);

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function cleanCost(cost) {
    const result = {};
    for (const key of CONSTRUCTION_RESOURCE_KEYS) {
        const value = Number(cost?.[key]);
        if (Number.isFinite(value) && value > 0) result[key] = value;
    }
    return result;
}
function affordable(cost) {
    return Object.entries(cleanCost(cost)).every(([key, amount]) => (Number(state.resources?.[key]) || 0) + 1e-9 >= amount);
}
function chargeResources(cost) {
    if (!affordable(cost)) return false;
    for (const [key, amount] of Object.entries(cleanCost(cost))) state.resources[key] = Math.max(0, (Number(state.resources[key]) || 0) - amount);
    return true;
}
function refundResources(cost, ratio) {
    for (const [key, amount] of Object.entries(cleanCost(cost))) addResource(key, amount * ratio);
}
function entityById(id) { return state.entities.find(entity => !entity.dead && entity.id === id) || null; }
function distanceTo(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function getBuildingCost(type) {
    return { ...(BUILDING_COSTS[type] || {}) };
}

export function siteSuitability(type, tx, ty) {
    const x = Math.floor(Number(tx)), y = Math.floor(Number(ty));
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: "INVALID SITE" };
    let node = null;
    try {
        const raw = getResourceNodeAt(x, y);
        node = raw ? { forest: raw.forestStock, stone: raw.stoneStock, water: raw.waterAccess, fertility: raw.fertility } : null;
    } catch {
        // Unit fixtures may build before a world geography exists. The live
        // game always has one, so this only keeps pure placement tests usable.
        return { ok: true, reason: null };
    }
    if (!node) return { ok: false, reason: "NO SURVEYED LAND" };
    if (type === TYPE.LUMBER || type === TYPE.FORESTER) {
        if (!node.forest || node.forest <= 0) return { ok: false, reason: "NO FOREST WITHIN WORKING RANGE" };
    } else if (type === TYPE.QUARRY) {
        if (!node.stone || node.stone <= 0) return { ok: false, reason: "NO STONE DEPOSIT WITHIN WORKING RANGE" };
    } else if (type === TYPE.WELL) {
        if (!node.water) return { ok: false, reason: "NO WATER WITHIN WELL RANGE" };
    } else if (type === TYPE.FARM) {
        if (node.fertility < 30) return { ok: false, reason: "SOIL TOO POOR FOR A FIELD" };
    }
    return { ok: true, reason: null, node };
}



export function isOperational(entity) {
    return Boolean(entity && !entity.dead && (!entity.construction || entity.construction.stage >= 3));
}

export function isUnderConstruction(entity) {
    return Boolean(entity && !entity.dead && entity.construction && entity.construction.stage < 3);
}

export function constructionPercentage(entity) {
    const construction = entity?.construction;
    if (!construction) return 100;
    if (construction.stage >= 3) return 100;
    return clamp(Math.round(((construction.stage || 0) * 100 + (Number(construction.progress) || 0)) / 3), 0, 99);
}

export function constructionStatus(entity) {
    const construction = entity?.construction;
    if (!construction) return "COMPLETE";
    if (construction.stage >= 3) return "COMPLETE";
    if (construction.paused) return "PAUSED";
    return construction.reason || CONSTRUCTION_STAGES[construction.stage]?.label || "SITE PREPARATION";
}

export function beginConstruction(entity, cost, { source = "build" } = {}) {
    if (!entity || entity.dead) return { ok: false, reason: "Structure is no longer present" };
    const total = cleanCost(cost);
    if (!Object.keys(total).length) return { ok: false, reason: "No construction cost is recorded" };
    const first = costShare(total, CONSTRUCTION_SHARE);
    if (!affordable(first)) return { ok: false, reason: "Not enough materials to open the site" };
    if (!chargeResources(first)) return { ok: false, reason: "Not enough materials to open the site" };
    const materialNeed = constructionMaterialNeed(total);
    entity.construction = {
        version: 1, stage: 0, progress: 0, paused: false, source,
        totalCost: total, paid: { ...first }, delivered: {}, materialNeed,
        startedTick: state.tick || 0, completedTick: null,
        reason: CONSTRUCTION_STAGES[0].label, lastMaterial: null
    };
    entity.hp = Math.max(1, Math.round((Number(entity.maxHp) || 100) * 0.12));
    entity.inventory = null;
    state.city.constructionVersion = (state.city.constructionVersion || 0) + 1;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    return { ok: true, construction: entity.construction };
}

export function getStageNeed(entity) {
    const construction = entity?.construction;
    if (!construction || construction.stage >= 3) return null;
    const definition = CONSTRUCTION_STAGES[construction.stage];
    if (!definition?.material) return null;
    return { good: definition.material, quantity: Math.max(1, Number(construction.materialNeed?.[definition.material]) || 1) };
}

function stagePaid(construction) {
    return Object.values(construction.paid || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function assignBuilder(site) {
    const workforce = getWorkforceSnapshot();
    const existing = workforce.workersByBuilding.get(site) || 0;
    if (existing > 0) return existing;
    const candidates = state.entities
        .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && !entity.workplace && (entity.illnessUntilTick || 0) <= state.tick)
        .sort((a, b) => distanceTo(a, site) - distanceTo(b, site) || String(a.id).localeCompare(String(b.id)));
    for (const villager of candidates) {
        if (distanceTo(villager, site) > 24) continue;
        villager.workplace = site;
        villager.job = "builder";
        villager.anchor = { x: site.x, y: site.y };
        villager.routinePhase = 4;
        villager.routineTimer = 1;
        return 1;
    }
    return 0;
}

function advanceStage(site) {
    const construction = site.construction;
    if (!construction || construction.stage >= 3) return false;
    if (!chargeResources(costShare(construction.totalCost, CONSTRUCTION_SHARE))) {
        construction.reason = "TREASURY CANNOT FUND THE NEXT STAGE";
        return false;
    }
    for (const [key, amount] of Object.entries(costShare(construction.totalCost, CONSTRUCTION_SHARE))) {
        construction.paid[key] = (Number(construction.paid[key]) || 0) + amount;
    }
    construction.stage += 1;
    construction.progress = 0;
    construction.delivered = {};
    construction.reason = CONSTRUCTION_STAGES[construction.stage]?.label || "COMPLETED";
    const maxHp = Math.max(1, Number(site.maxHp) || 100);
    site.hp = Math.max(1, Math.round(maxHp * (0.12 + construction.stage * 0.29)));
    if (construction.stage >= 3) {
        construction.completedTick = state.tick || 0;
        construction.reason = "COMPLETED";
        site.hp = maxHp;
        ensureInventory(site);
        state.statistics.totalBuildingsBuilt = (state.statistics.totalBuildingsBuilt || 0) + 1;
        state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
        state.city.constructionVersion = (state.city.constructionVersion || 0) + 1;
        return true;
    }
    return false;
}

export function updateConstruction() {
    const city = ensureCityState();
    if (!city.enabled || state.tick <= 0 || state.isPaused || state.gameOver) return null;
    const sites = state.entities.filter(entity => !entity.dead && entity.isBuilding() && entity.construction && entity.construction.stage < 3);
    for (const site of sites) {
        const construction = site.construction;
        if (construction.paused) {
            construction.reason = "PAUSED BY THE CROWN";
            continue;
        }
        const need = getStageNeed(site);
        const delivered = Math.max(0, Number(construction.delivered?.[need?.good] || 0));
        if (need && delivered < need.quantity) {
            const active = requestConstructionDelivery(site, need.good, need.quantity - delivered);
            construction.reason = active ? "WAITING FOR " + need.good.toUpperCase() : "WAITING FOR " + need.good.toUpperCase() + " IN STORE";
            construction.lastMaterial = need.good;
            continue;
        }
        const builders = assignBuilder(site);
        if (builders <= 0) {
            construction.reason = "WAITING FOR BUILDERS";
            continue;
        }
        const definition = CONSTRUCTION_STAGES[construction.stage] || CONSTRUCTION_STAGES[0];
        const requiredDays = Math.max(1, definition.days || 1);
        construction.progress = Math.min(100, (Number(construction.progress) || 0) + (100 / requiredDays) * Math.min(2, builders));
        construction.reason = definition.label;
        if (construction.progress >= 100) advanceStage(site);
    }
    return sites.length;
}

export function pauseConstruction(entity) {
    if (!isUnderConstruction(entity)) return { ok: false, reason: "This structure is not under construction" };
    entity.construction.paused = true;
    entity.construction.reason = "PAUSED BY THE CROWN";
    state.city.constructionVersion = (state.city.constructionVersion || 0) + 1;
    return { ok: true };
}

export function resumeConstruction(entity) {
    if (!isUnderConstruction(entity)) return { ok: false, reason: "This structure is not under construction" };
    entity.construction.paused = false;
    entity.construction.reason = "SITE RESUMED";
    state.city.constructionVersion = (state.city.constructionVersion || 0) + 1;
    return { ok: true };
}

export function cancelConstruction(entity) {
    if (!entity || entity.dead || !entity.construction) return { ok: false, reason: "No construction site selected" };
    const paid = { ...(entity.construction.paid || {}) };
    const refund = Object.fromEntries(Object.entries(paid).map(([key, value]) => [key, value * 0.35]));
    refundResources(refund, 1);
    cancelJobsForEntity(entity.id);
    entity.dead = true;
    state.selectedBuildingId = null;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    state.city.constructionVersion = (state.city.constructionVersion || 0) + 1;
    return { ok: true, refund };
}

export function constructionSnapshot(entity) {
    if (!entity) return null;
    const construction = entity.construction;
    if (!construction) return { stage: 3, status: "COMPLETE", percent: 100 };
    return {
        stage: construction.stage,
        status: constructionStatus(entity),
        percent: constructionPercentage(entity),
        paused: Boolean(construction.paused),
        totalCost: { ...construction.totalCost },
        paid: { ...construction.paid },
        delivered: { ...construction.delivered },
        materialNeed: { ...construction.materialNeed },
        reason: construction.reason || null,
        startedTick: construction.startedTick,
        completedTick: construction.completedTick
    };
}

export function canPlaceBuilding(type, tx, ty) {
    const x = Math.floor(Number(tx)), y = Math.floor(Number(ty));
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: "INVALID SITE" };
    const base = BUILDING_SIZE[type] || { w: 1, h: 1 };
    const W = worldWidth() || WORLD_W, H = worldHeight() || WORLD_H;
    if (x + 0.5 - base.w / 2 < 0 || y + 0.5 - base.h / 2 < 0 || x + 0.5 + base.w / 2 > W || y + 0.5 + base.h / 2 > H) return { ok: false, reason: "OUTSIDE THE REALM" };
    if (isWaterAt(x + 0.5, y + 0.5)) return { ok: false, reason: "NEEDS DRY GROUND" };
    if (buildingOverlaps(x, y, type)) return { ok: false, reason: "SPACE OCCUPIED" };
    return siteSuitability(type, x, y);
}

export function placeDirectBuilding(type, tx, ty) {
    if (!Number.isInteger(type)) return { ok: false, reason: "UNKNOWN STRUCTURE" };
    const site = canPlaceBuilding(type, tx, ty);
    if (!site.ok) return site;
    const cost = getBuildingCost(type);
    if (!affordable(costShare(cost, CONSTRUCTION_SHARE))) return { ok: false, reason: "CANNOT AFFORD OPENING SHARE" };
    if (!canSpawnEntity(type)) return { ok: false, reason: "REALM CAPACITY REACHED" };
    const entity = spawnEntity(tx, ty, type);
    if (!entity) return { ok: false, reason: "REALM CAPACITY REACHED" };
    entity.footprintScale = 1;
    const started = beginConstruction(entity, cost, { source: "build" });
    if (!started.ok) {
        entity.dead = true;
        state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
        return started;
    }
    ensureInventory(entity);
    revealArea(tx, ty, 7);
    return { ok: true, entity, construction: started.construction, cost };
}

export function isHousingUnderConstruction(type) {
    return isHousingType(type);
}
