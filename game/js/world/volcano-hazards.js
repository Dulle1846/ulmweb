// Volcanic hazards as a real annual event, not a survey-only value.
//
// The eruption cycle is already derived from seed and year by
// volcano-ecology.js. Once per year this module visits a bounded set of built
// and worked tiles, plus a small deterministic sample of wild ground. An
// eruption or earthquake on occupied ground destroys one structure or road,
// ashfall consumes food, and the event reaches the shared chronicle. The scan
// is capped and runs only at the year boundary; it never enters the frame loop.
import { BUILDING_SIZE } from "../core/config.js";
import { addLog } from "../core/event-log.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { buildingLabel } from "../systems/city-config.js";
import { addResource } from "../systems/resources.js";
import { destroyRoad, getRoadAt, getRoadTiles } from "../systems/roads.js";
import { volcanoProfileAt } from "./volcano-ecology.js";
import { volcanoWorkUseAt } from "./volcano-works.js";

export const VOLCANO_HAZARD_CANDIDATE_LIMIT = 96;
const WILD_SAMPLES = 18;

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function hash32(seed, x, y, salt) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0)
        ^ Math.imul((Number(state.year) | 0) + 1, 0xc2b2ae35);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, x, y, salt) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

function terrainAt(x, y) {
    const width = Math.max(1, Number(state.terrainPixW) || 0);
    const height = Math.max(1, Number(state.terrainPixH) || 0);
    if (!state.heightMap || !width || !height) return { height: 0.62, moisture: 0.42, temperature: 0.7 };
    const res = Math.max(1, Number(state.terrainResolution) || 1);
    const px = Math.max(0, Math.min(width - 1, Math.floor((x + 0.5) * res)));
    const py = Math.max(0, Math.min(height - 1, Math.floor((y + 0.5) * res)));
    const index = py * width + px;
    return {
        height: Number(state.heightMap[index]) || 0,
        moisture: Number(state.moistureMap?.[index]) || 0.42,
        temperature: Number(state.temperatureMap?.[index]) || 0.7,
    };
}

function siteAt(x, y, extraUse = {}) {
    const terrain = terrainAt(x, y);
    return volcanoProfileAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        climate: "volcanic",
        height: terrain.height,
        moisture: terrain.moisture,
        temperature: terrain.temperature,
        seaLevel: Number(state.seaLevel) || 0.33,
        dayOfYear: Number(state.dayOfYear) || 0,
        year: Math.max(1, Number(state.year) || 1),
        hour: Number(state.timeOfDay) || 12,
        weather: state.weather || "clear",
        wind: 1,
        use: { settlement: true, ...volcanoWorkUseAt(x, y), ...extraUse },
    });
}

function isBuilding(entity) {
    if (!entity || entity.dead) return false;
    try { return typeof entity.isBuilding === "function" && entity.isBuilding(); } catch { return false; }
}

function footprintContains(entity, x, y) {
    const base = BUILDING_SIZE[entity.type] || { w: 1, h: 1 };
    const scale = Math.max(0.25, Math.min(6, Number(entity.footprintScale) || 1));
    const halfW = base.w * scale / 2, halfH = base.h * scale / 2;
    const centerX = Number(entity.x) + 0.5, centerY = Number(entity.y) + 0.5;
    return x + 0.5 >= centerX - halfW && x + 0.5 < centerX + halfW
        && y + 0.5 >= centerY - halfH && y + 0.5 < centerY + halfH;
}

function buildingAtTile(x, y) {
    return state.entities.find(entity => isBuilding(entity) && footprintContains(entity, x, y)) || null;
}

function candidateKey(x, y) { return x + ":" + y; }

/** Bounded candidate set: occupied buildings, volcanic works, roads and wild ground. */
export function volcanoHazardCandidates() {
    const candidates = new Map();
    const add = (x, y, use = {}) => {
        const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
        if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0) return;
        const key = candidateKey(tx, ty);
        if (!candidates.has(key)) candidates.set(key, { x: tx, y: ty, use });
    };

    for (const entity of state.entities || []) {
        if (!isBuilding(entity)) continue;
        add(entity.x, entity.y, { settlement: true });
    }
    for (const key of Object.keys(state.volcanoWorks?.tiles || {})) {
        const match = /^(\d+):(\d+)$/.exec(key);
        if (match) add(Number(match[1]), Number(match[2]));
    }
    const roads = getRoadTiles();
    const stride = Math.max(1, Math.ceil(roads.length / 32));
    for (let index = 0; index < roads.length; index += stride) {
        add(roads[index].x, roads[index].y, { road: true });
    }
    const W = Number(state.worldW) || 0, H = Number(state.worldH) || 0;
    if (W > 2 && H > 2) {
        for (let index = 0; index < WILD_SAMPLES; index++) {
            const x = (index * 37 + Math.floor((Number(state.worldSeed) || 1) % 19) + Number(state.year || 1) * 11) % W;
            const y = (index * 53 + Number(state.year || 1) * 17) % H;
            add(x, y);
        }
    }
    return [...candidates.values()].slice(0, VOLCANO_HAZARD_CANDIDATE_LIMIT);
}

/**
 * Remove one real building or road at a volcanic tile. Keeps and wonders are
 * protected so a single bad roll cannot delete the realm's core.
 */
export function destroyVolcanicTargetAt(x, y, { cause = "eruption" } = {}) {
    const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
    const building = buildingAtTile(tx, ty);
    if (building && building.type !== TYPE.KEEP && building.type !== TYPE.WONDER) {
        building.dead = true;
        building.destroyedBy = "volcanic-" + cause;
        building.destroyedYear = Math.max(1, Number(state.year) || 1);
        for (const villager of state.entities || []) {
            if (villager.workplace !== building) continue;
            villager.workplace = null;
            if (villager.job === "builder") villager.job = "idle";
        }
        if (state.selectedBuildingId === building.id) state.selectedBuildingId = null;
        state.buildingCollisionVersion = (Number(state.buildingCollisionVersion) || 0) + 1;
        if (state.city) state.city.constructionVersion = (Number(state.city.constructionVersion) || 0) + 1;
        const label = buildingLabel(building.type);
        addLog((cause === "earthquake" ? "EARTHQUAKE COLLAPSES " : "LAVA BURIES ")
            + label.toUpperCase(), cause === "earthquake" ? "#d6b37a" : "#e9857b", "disaster");
        return { ok: true, kind: "building", label, x: tx, y: ty };
    }
    if (getRoadAt(tx, ty)) {
        const removed = destroyRoad(tx, ty);
        if (removed.ok) {
            addLog((cause === "earthquake" ? "EARTHQUAKE BREAKS THE ROAD" : "LAVA BURIES THE ROAD")
                + " · " + tx + "," + ty, cause === "earthquake" ? "#d6b37a" : "#e9857b", "disaster");
            return { ok: true, kind: "road", label: "road", x: tx, y: ty };
        }
    }
    return { ok: false, kind: "none", x: tx, y: ty };
}

/**
 * One bounded annual hazard pass. The deterministic roll is derived from seed,
 * year and tile, so a replay reaches the same destruction.
 */
export function updateVolcanoHazards({ force = false } = {}) {
    if ((state.worldOptions?.climate || "temperate") !== "volcanic") {
        return { events: [], destroyed: null, candidates: 0, eruption: null, earthquake: null };
    }
    const candidates = volcanoHazardCandidates();
    let eruption = null, earthquake = null;
    for (const candidate of candidates) {
        const profile = siteAt(candidate.x, candidate.y, candidate.use);
        // Prefer occupied ground for the named event. A settlement eruption is
        // the event the player can see and repair; wild lava still reports when
        // no building or road is exposed.
        const occupied = Boolean(candidate.use?.settlement || candidate.use?.road);
        const eruptionScore = profile.hazards.destruction + (occupied ? 1 : 0);
        if (profile.climate.active && profile.hazards.destruction > 0.45
            && (!eruption || eruptionScore > eruption.score)) {
            eruption = { ...candidate, profile, score: eruptionScore };
        }
        const quakeScore = profile.hazards.earthquake + (occupied ? 1 : 0);
        if (profile.hazards.earthquake > 0.45
            && (!earthquake || quakeScore > earthquake.score)) {
            earthquake = { ...candidate, profile, score: quakeScore };
        }
    }

    const events = [];
    let destroyed = null;
    if (eruption) {
        const { profile, x, y, use } = eruption;
        const text = "ERUPTION IN " + profile.label.toUpperCase() + " · ASH " + Math.round(profile.climate.ash * 100) + "%";
        addLog(text, "#f97316", "disaster");
        events.push(text);
        if (profile.hazards.ash > 0.35 && (use.settlement || use.road) && (Number(state.resources?.food) || 0) > 0) {
            addResource("food", -1);
            const ashText = "ASHFALL BURIES THE PASTURE · FOOD -1";
            addLog(ashText, "#c4a484", "disaster");
            events.push(ashText);
        }
        const chance = clamp01((profile.hazards.destruction - 0.42) * 1.8);
        const roll = unit(Number(state.worldSeed) || 1, x, y, 0x45525550);
        if (force || roll < chance) {
            destroyed = destroyVolcanicTargetAt(x, y, { cause: "eruption" });
            if (destroyed.ok) events.push("DESTROYED " + destroyed.kind.toUpperCase());
        }
    }
    if (earthquake && earthquake.profile.hazards.earthquake > 0.58) {
        const { profile, x, y } = earthquake;
        const text = "EARTH TREMOR SHAKES " + profile.label.toUpperCase() + " · " + Math.round(profile.hazards.earthquake * 100) + "%";
        addLog(text, "#d6b37a", "disaster");
        events.push(text);
        if ((Number(state.resources?.stone) || 0) > 0) addResource("stone", -1);
        if (!destroyed) {
            const chance = clamp01((profile.hazards.earthquake - 0.5) * 1.4);
            const roll = unit(Number(state.worldSeed) || 1, x, y, 0x5155414b);
            if (force || roll < chance) {
                destroyed = destroyVolcanicTargetAt(x, y, { cause: "earthquake" });
                if (destroyed.ok) events.push("COLLAPSED " + destroyed.kind.toUpperCase());
            }
        }
    }
    return {
        events,
        destroyed,
        candidates: candidates.length,
        eruption: eruption ? { x: eruption.x, y: eruption.y, destruction: eruption.profile.hazards.destruction } : null,
        earthquake: earthquake ? { x: earthquake.x, y: earthquake.y, magnitude: earthquake.profile.hazards.earthquake } : null,
    };
}
