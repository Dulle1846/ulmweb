// Snowland hazards as bounded annual events.
//
// Avalanche, pass closure, frostbite, frozen springs and supply loss are
// derived by snow-ecology.js from the same seed, terrain, season and weather
// used by the renderer. Once per year this module visits a bounded set of
// occupied buildings, roads and wild ground. It never enters the frame loop.
import { BUILDING_SIZE } from "../core/config.js";
import { addLog } from "../core/event-log.js";
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { buildingLabel } from "../systems/city-config.js";
import { addResource } from "../systems/resources.js";
import { destroyRoad, getRoadAt, getRoadTiles } from "../systems/roads.js";
import { snowProfileAt } from "./snow-ecology.js";

export const SNOW_HAZARD_CANDIDATE_LIMIT = 96;
const WILD_SAMPLES = 18;

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
    if (!state.heightMap || !width || !height) return { height: 0.58, moisture: 0.55, temperature: 0.12 };
    const res = Math.max(1, Number(state.terrainResolution) || 1);
    const px = Math.max(0, Math.min(width - 1, Math.floor((x + 0.5) * res)));
    const py = Math.max(0, Math.min(height - 1, Math.floor((y + 0.5) * res)));
    const index = py * width + px;
    return {
        height: Number(state.heightMap[index]) || 0.58,
        moisture: Number(state.moistureMap?.[index]) || 0.55,
        temperature: Number(state.temperatureMap?.[index]) || 0.12,
    };
}

function siteAt(x, y, extraUse = {}) {
    const terrain = terrainAt(x, y);
    return snowProfileAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        climate: "snow",
        height: terrain.height,
        moisture: terrain.moisture,
        temperature: terrain.temperature,
        seaLevel: Number(state.seaLevel) || 0.33,
        dayOfYear: Number(state.dayOfYear) || 0,
        year: Math.max(1, Number(state.year) || 1),
        hour: Number(state.timeOfDay) || 12,
        weather: state.weather || "clear",
        wind: String(state.weather || "").toLowerCase() === "storm" ? 2 : 1.25,
        use: { settlement: true, ...extraUse },
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

/** Bounded candidate set: occupied buildings, roads and wild snow. */
export function snowHazardCandidates() {
    const candidates = new Map();
    const add = (x, y, use = {}) => {
        const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
        if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0) return;
        const key = tx + ":" + ty;
        if (!candidates.has(key)) candidates.set(key, { x: tx, y: ty, use });
    };
    for (const entity of state.entities || []) {
        if (!isBuilding(entity)) continue;
        if (entity.type === TYPE.KEEP || entity.type === TYPE.WONDER) continue;
        add(entity.x, entity.y, {
            settlement: true,
            insulated: Boolean(entity.insulated || entity.winterised || entity.heated),
        });
    }
    const roads = getRoadTiles();
    const stride = Math.max(1, Math.ceil(roads.length / 32));
    for (let index = 0; index < roads.length; index += stride) {
        add(roads[index].x, roads[index].y, { road: true });
    }
    const W = Number(state.worldW) || 0, H = Number(state.worldH) || 0;
    if (W > 2 && H > 2) {
        for (let index = 0; index < WILD_SAMPLES; index++) {
            const x = (index * 43 + Math.floor((Number(state.worldSeed) || 1) % 29) + Number(state.year || 1) * 17) % W;
            const y = (index * 61 + Number(state.year || 1) * 23) % H;
            add(x, y);
        }
    }
    return [...candidates.values()].slice(0, SNOW_HAZARD_CANDIDATE_LIMIT);
}

/** Remove one real building or road at a snow tile. Protected cores stay. */
export function destroySnowTargetAt(x, y, { cause = "avalanche" } = {}) {
    const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
    const building = buildingAtTile(tx, ty);
    if (building && building.type !== TYPE.KEEP && building.type !== TYPE.WONDER) {
        building.dead = true;
        building.destroyedBy = "snow-" + cause;
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
        addLog((cause === "blizzard" ? "A BLIZZARD BURIES " : "AN AVALANCHE CRUSHES ") + label.toUpperCase(), "#a9c7d2", "disaster");
        return { ok: true, kind: "building", label, x: tx, y: ty, cause };
    }
    if (getRoadAt(tx, ty)) {
        const removed = destroyRoad(tx, ty);
        if (removed.ok) {
            addLog("THE SNOW TAKES THE ROAD · " + tx + "," + ty, "#a9c7d2", "disaster");
            return { ok: true, kind: "road", label: "road", x: tx, y: ty, cause };
        }
    }
    return { ok: false, kind: "none", x: tx, y: ty };
}

function frostbiteExposure(profile) {
    const residents = (state.entities || []).filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
    if (!residents.length) return null;
    const risk = Number(profile?.hazards?.frostbite) || 0;
    if (risk < 0.26) return null;
    const victim = residents[Math.floor(unit(Number(state.worldSeed) || 1, Math.floor(profile.x), Math.floor(profile.y), 0x46524f53) * residents.length)];
    if (!victim) return null;
    const lasting = Math.max(1, Math.round(risk * 18));
    victim.hp = Math.max(1, (Number(victim.hp) || 1) - Math.max(4, Math.round(risk * 20)));
    victim.frostbiteUntilTick = Math.max(Number(victim.frostbiteUntilTick) || 0, Number(state.tick) + 40 + lasting);
    victim.illnessStartedTick = state.tick;
    victim.illnessUntilTick = Math.max(Number(victim.illnessUntilTick) || 0, Number(state.tick) + 30 + lasting);
    victim.illnessSeverity = Math.max(1, Number(victim.illnessSeverity) || 0, risk > 0.55 ? 2 : 1);
    victim.infectionSource = "frostbite";
    addLog("FROSTBITE · " + (victim.person?.name || "A RESIDENT") + " · EXPOSURE " + Math.round(risk * 100) + "%", "#b6d7e4", "health");
    return { name: victim.person?.name || "resident", risk: Math.round(risk * 100), hp: victim.hp };
}

/**
 * One bounded annual snow hazard pass. Damage prefers occupied ground. This is
 * the same profile the renderer and survey read, so a safe-looking valley does
 * not hide an avalanche that the survey calls safe.
 */
export function updateSnowHazards({ force = false, focus = null } = {}) {
    if ((state.worldOptions?.climate || "temperate") !== "snow") {
        return {
            events: [], destroyed: null, candidates: 0,
            avalanche: null, blizzard: null, pass: null, frostbite: null, supply: null,
        };
    }
    const candidates = snowHazardCandidates();
    let avalanche = null, blizzard = null, pass = null, frostbite = null, supply = null;
    let damageTarget = null;
    for (const candidate of candidates) {
        const profile = siteAt(candidate.x, candidate.y, candidate.use);
        const occupied = Boolean(candidate.use?.settlement || candidate.use?.road);
        const consider = (current, value, threshold, score, key) => {
            if (focus && focus !== key) return current;
            if (value < threshold) return current;
            return !current || score > current.score ? { ...candidate, profile, score, value } : current;
        };
        avalanche = consider(avalanche, profile.hazards.avalanche, 0.28, profile.hazards.avalanche + (occupied ? 1 : 0), "avalanche");
        blizzard = consider(blizzard, profile.weather.blizzard, 0.3, profile.weather.blizzard + (occupied ? 1 : 0), "blizzard");
        pass = consider(pass, profile.hazards.passClosed, 0.3, profile.hazards.passClosed + (occupied ? 1 : 0), "pass");
        frostbite = consider(frostbite, profile.hazards.frostbite, 0.2, profile.hazards.frostbite + (occupied ? 1 : 0), "frostbite");
        supply = consider(supply, 1 - profile.hazards.supply, 0.22, (1 - profile.hazards.supply) + (occupied ? 1 : 0), "supply");
        if (occupied && profile.hazards.avalanche > 0.2
            && (!damageTarget || profile.hazards.avalanche > damageTarget.profile.hazards.avalanche)) {
            damageTarget = { ...candidate, profile };
        }
    }

    const events = [];
    let destroyed = null;
    let damageChance = 0;
    if (avalanche) {
        const p = avalanche.profile;
        events.push("AVALANCHE RISK ON " + p.label.toUpperCase() + " · " + Math.round(p.hazards.avalanche * 100) + "%");
        if (p.weather.blizzard > 0.4) events.push("A BLIZZARD HIDES THE SLOPE");
        if (p.surface.snowLoad > 0.55) events.push("THE NEW SNOW LOAD IS UNSTABLE");
        damageChance = Math.max(damageChance, Math.min(0.55, (p.hazards.avalanche - 0.2) * 0.9));
    }
    if (blizzard) {
        const p = blizzard.profile;
        events.push("BLIZZARD · VISIBILITY " + Math.round(p.weather.visibility * 100) + "% · WIND " + Math.round(p.weather.wind * 100) + "%");
        if ((Number(state.resources?.food) || 0) > 0) {
            addResource("food", -1);
            events.push("DRIFTS CUT THE SUPPLY ROAD · FOOD -1");
        }
        damageChance = Math.max(damageChance, Math.min(0.4, (p.weather.blizzard - 0.3) * 0.7));
    }
    if (pass) {
        events.push("PASS CLOSED BY SNOW · " + Math.round(pass.profile.hazards.passClosed * 100) + "%");
        state.snowLastPassClosure = { year: state.year, x: pass.x, y: pass.y };
    }
    if (frostbite) {
        events.push("FROSTBITE DANGER · " + Math.round(frostbite.profile.hazards.frostbite * 100) + "%");
    }
    if (supply) {
        events.push("WINTER SUPPLY STRAIN · " + Math.round((1 - supply.profile.hazards.supply) * 100) + "%");
    }
    if (frostbite && (frostbite.profile.season === "winter" || force)) {
        const injury = frostbiteExposure(frostbite.profile);
        if (injury) events.push("A RESIDENT SUFFERS FROSTBITE · " + injury.name + " · " + injury.risk + "%");
    }

    const target = damageTarget || avalanche || blizzard || pass;
    if (target) {
        const p = target.profile;
        const roll = unit(Number(state.worldSeed) || 1, target.x, target.y, 0x534e4f48);
        const hardiness = Number(p.hazards.winterHardiness) || 0;
        const chance = damageChance * Math.max(0.2, 1 - hardiness * 0.55);
        if (roll < chance) {
            const result = destroySnowTargetAt(target.x, target.y, {
                cause: (blizzard && target === blizzard) ? "blizzard" : "avalanche",
            });
            if (result.ok) destroyed = result;
        }
    }

    if (p_spring(state.dayOfYear)) {
        const thawTarget = candidates.find(candidate => candidate.use?.road) || candidates[0];
        if (thawTarget) {
            const thaw = siteAt(thawTarget.x, thawTarget.y, thawTarget.use);
            if (thaw.thaw.meltwaterLakes > 0.25) events.push("MELTWATER PONDS CLOSE THE LOW ROAD");
            if (thaw.thaw.swollenRivers > 0.3) events.push("THE RIVERS RUN HIGH WITH MELTWATER");
        }
    }
    return { events, destroyed, candidates: candidates.length, avalanche, blizzard, pass, frostbite, supply };
}

function p_spring(dayOfYear) {
    const day = ((Number(dayOfYear) % 400) + 400) % 400;
    return day >= 0 && day < 100;
}
