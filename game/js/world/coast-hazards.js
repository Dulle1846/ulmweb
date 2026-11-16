// Coastal hazards as a real annual event, not a survey-only value.
//
// Storms, tides, erosion, sand movement and salt accumulation are already
// derived by coast-ecology.js from seed, year, terrain and season. Once per
// year this module visits a bounded set of built and worked tiles plus a small
// deterministic sample of wild shore. A surge or flood on occupied ground can
// destroy one structure or road, consume stores and write the event to the
// shared chronicle. It never enters the frame loop.
import { BUILDING_SIZE } from "../core/config.js";
import { addLog } from "../core/event-log.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { buildingLabel } from "../systems/city-config.js";
import { addResource } from "../systems/resources.js";
import { destroyRoad, getRoadAt, getRoadTiles } from "../systems/roads.js";
import { coastProfileAt } from "./coast-ecology.js";
import { coastWorkUseAt } from "./coast-works.js";

export const COAST_HAZARD_CANDIDATE_LIMIT = 96;
const WILD_SAMPLES = 20;

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
    if (!state.heightMap || !width || !height) return { height: 0.36, moisture: 0.62, temperature: 0.58 };
    const res = Math.max(1, Number(state.terrainResolution) || 1);
    const px = Math.max(0, Math.min(width - 1, Math.floor((x + 0.5) * res)));
    const py = Math.max(0, Math.min(height - 1, Math.floor((y + 0.5) * res)));
    const index = py * width + px;
    return {
        height: Number(state.heightMap[index]) || 0,
        moisture: Number(state.moistureMap?.[index]) || 0.62,
        temperature: Number(state.temperatureMap?.[index]) || 0.58,
    };
}

function siteAt(x, y, extraUse = {}) {
    const terrain = terrainAt(x, y);
    return coastProfileAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        climate: "coastal",
        height: terrain.height,
        moisture: terrain.moisture,
        temperature: terrain.temperature,
        seaLevel: Number(state.seaLevel) || 0.33,
        dayOfYear: Number(state.dayOfYear) || 0,
        year: Math.max(1, Number(state.year) || 1),
        hour: Number(state.timeOfDay) || 12,
        weather: state.weather || "clear",
        wind: String(state.weather || "").toLowerCase() === "storm" ? 2 : 1.2,
        use: { settlement: true, ...coastWorkUseAt(x, y), ...extraUse },
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

/** Bounded candidate set: occupied buildings, coastal works, roads and wild shore. */
export function coastHazardCandidates() {
    const candidates = new Map();
    const add = (x, y, use = {}) => {
        const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
        if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0) return;
        const key = candidateKey(tx, ty);
        if (!candidates.has(key)) candidates.set(key, { x: tx, y: ty, use });
    };

    for (const entity of state.entities || []) {
        if (!isBuilding(entity)) continue;
        // The protected Keep and Wonder must not absorb a destructive event at
        // the realm's central tile. The same rule protects coastal campaigns
        // from an event that would otherwise destroy nothing.
        if (entity.type === TYPE.KEEP || entity.type === TYPE.WONDER) continue;
        add(entity.x, entity.y, { settlement: true });
    }
    for (const key of Object.keys(state.coastWorks?.tiles || {})) {
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
            const x = (index * 41 + Math.floor((Number(state.worldSeed) || 1) % 23) + Number(state.year || 1) * 13) % W;
            const y = (index * 59 + Number(state.year || 1) * 19) % H;
            add(x, y);
        }
    }
    return [...candidates.values()].slice(0, COAST_HAZARD_CANDIDATE_LIMIT);
}

/** Remove one real building or road at a coastal tile. Protected cores stay. */
export function destroyCoastalTargetAt(x, y, { cause = "storm-surge" } = {}) {
    const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
    const building = buildingAtTile(tx, ty);
    if (building && building.type !== TYPE.KEEP && building.type !== TYPE.WONDER) {
        building.dead = true;
        building.destroyedBy = "coastal-" + cause;
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
        const verb = cause === "flood" ? "FLOODING COLLAPSES " : cause === "erosion" ? "EROSION UNDERCUTS " : "STORM SURGE WRECKS ";
        addLog(verb + label.toUpperCase(), "#6bb5c4", "disaster");
        return { ok: true, kind: "building", label, x: tx, y: ty, cause };
    }
    if (getRoadAt(tx, ty)) {
        const removed = destroyRoad(tx, ty);
        if (removed.ok) {
            addLog("THE SEA BREAKS THE COASTAL ROAD · " + tx + "," + ty, "#6bb5c4", "disaster");
            return { ok: true, kind: "road", label: "road", x: tx, y: ty, cause };
        }
    }
    return { ok: false, kind: "none", x: tx, y: ty };
}

/**
 * One bounded annual coastal hazard pass. The deterministic roll is derived
 * from seed, year and tile, so a replay reaches the same damage.
 */
export function updateCoastHazards({ force = false, focus = null } = {}) {
    if ((state.worldOptions?.climate || "temperate") !== "coastal") {
        return {
            events: [], destroyed: null, candidates: 0,
            surge: null, erosion: null, flood: null, sandShift: null, salinisation: null,
        };
    }
    const candidates = coastHazardCandidates();
    let surge = null, erosion = null, flood = null, sandShift = null, salinisation = null;
    let damageTarget = null;
    for (const candidate of candidates) {
        const profile = siteAt(candidate.x, candidate.y, candidate.use);
        const occupied = Boolean(candidate.use?.settlement || candidate.use?.road);
        const weight = occupied ? 1 : 0;
        // Destruction must prefer a real occupied tile. A wild shallow-water
        // sample can have the highest surge value, but it cannot be wrecked;
        // choosing it would report a dramatic surge that damaged nothing.
        if (occupied && profile.hazards.damage > 0.18
            && (!damageTarget || profile.hazards.damage > damageTarget.profile.hazards.damage)) {
            damageTarget = { ...candidate, profile };
        }
        const consider = (current, value, threshold, score, key) => {
            if (focus && focus !== key) return current;
            if (value < threshold) return current;
            if (!current || score > current.score) return { ...candidate, profile, score, value };
            return current;
        };
        surge = consider(surge, profile.hazards.stormSurge, 0.3, profile.hazards.stormSurge + weight, "surge");
        erosion = consider(erosion, profile.hazards.erosion, 0.26, profile.hazards.erosion + weight, "erosion");
        flood = consider(flood, profile.hazards.flood, 0.24, profile.hazards.flood + weight, "flood");
        sandShift = consider(sandShift, profile.hazards.sandShift, 0.25, profile.hazards.sandShift + weight, "sandShift");
        salinisation = consider(salinisation, profile.hazards.salinisation, 0.26, profile.hazards.salinisation + weight, "salinisation");
    }

    const events = [];
    let destroyed = null;
    let damageChance = 0;
    if (surge) {
        const p = surge.profile;
        const text = "STORM SURGE ON " + p.label.toUpperCase() + " · SURGE " + p.water.stormSurgeM + " M · WAVES " + p.water.waveHeightM + " M";
        addLog(text, "#5aa8b8", "disaster");
        events.push(text);
        if (p.water.fog > 0.3) events.push("COASTAL FOG HIDES THE APPROACH");
        if (p.hazards.spray > 0.35) events.push("SALT SPRAY STRIPS THE EXPOSED FIELDS");
        if ((Number(state.resources?.food) || 0) > 0 && (surge.use.settlement || surge.use.road)) {
            addResource("food", -1);
            events.push("SURGE WASHES OUT STORED FOOD · FOOD -1");
        }
        damageChance = clamp01((p.hazards.stormSurge - 0.28) * 1.4);
    }
    if (erosion) {
        const p = erosion.profile;
        const text = "COASTAL EROSION AT " + p.label.toUpperCase() + " · " + Math.round(p.hazards.erosion * 100) + "%";
        addLog(text, "#a48b64", "disaster");
        events.push(text);
        if (p.hazards.sandShift > 0.3) events.push("SAND SHIFTS ACROSS THE SHORE");
        if (p.soil.salinisation > 0.3) events.push("SALT REMAINS IN THE SOIL");
        damageChance = Math.max(damageChance, clamp01((p.hazards.erosion - 0.26) * 1.25));
    }
    if (flood) {
        const p = flood.profile;
        events.push("FLOODWATER CROSSES THE LOW SHORE · " + p.label);
        if ((Number(state.resources?.food) || 0) > 0 && flood.use.settlement) addResource("food", -1);
        damageChance = Math.max(damageChance, clamp01((p.hazards.flood - 0.22) * 1.2));
    }
    if (salinisation) {
        const p = salinisation.profile;
        events.push("SALINISATION SPREADS THROUGH THE COASTAL SOIL · " + Math.round(p.hazards.salinisation * 100) + "%");
    }
    if (sandShift) {
        events.push("THE TIDE REBUILDS THE SANDBANKS · " + sandShift.profile.label);
    }
    const target = damageTarget || surge || erosion || flood || salinisation || sandShift;
    if (target) {
        const roll = unit(Number(state.worldSeed) || 1, target.x, target.y, 0x434f4153);
        const chance = damageTarget
            ? clamp01((damageTarget.profile.hazards.damage - 0.2) * 1.3)
            : damageChance;
        if (force || roll < chance) {
            destroyed = destroyCoastalTargetAt(target.x, target.y, { cause: surge ? "storm-surge" : erosion ? "erosion" : "flood" });
            if (destroyed.ok) events.push("DESTROYED " + destroyed.kind.toUpperCase());
        }
    }
    return {
        events, destroyed, candidates: candidates.length,
        surge: surge ? { x: surge.x, y: surge.y, value: surge.profile.hazards.stormSurge, heightM: surge.profile.water.stormSurgeM } : null,
        erosion: erosion ? { x: erosion.x, y: erosion.y, value: erosion.profile.hazards.erosion } : null,
        flood: flood ? { x: flood.x, y: flood.y, value: flood.profile.hazards.flood } : null,
        sandShift: sandShift ? { x: sandShift.x, y: sandShift.y, value: sandShift.profile.hazards.sandShift } : null,
        salinisation: salinisation ? { x: salinisation.x, y: salinisation.y, value: salinisation.profile.hazards.salinisation } : null,
    };
}
