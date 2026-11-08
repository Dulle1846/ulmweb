// Deterministic woodland fauna simulation.
//
// The first forest pass drew one habitat-appropriate animal per tile. That is
// useful decoration, but it cannot starve, breed, move or respond to hunting.
// This module keeps a bounded set of real herds. Each herd has a home tile, a
// population, a carrying capacity and a seasonal migration step. All choices
// use stable hashes of the world seed and herd id, so the same realm and the
// same number of elapsed days always produce the same wildlife.
//
// It deliberately does not model every insect. Large mammals and resident birds
// form populations; butterflies, beetles, ants and bees remain habitat markers
// in the renderer. That keeps the simulation observable without turning each
// forest tile into a separate ecosystem solver.

import { state } from "../core/state.js";
import { WORLD_W, WORLD_H } from "../core/config.js";
import { forestStandAt, FOREST_FAUNA } from "../world/forest-ecology.js";
import { getResourceNodeAt } from "./resource-geography.js";
import { getHeightAt, getMoistureAt, getTemperatureAt } from "../world/world.js";
import { seasonalState } from "../world/season.js";

const VERSION = 1;
const MAX_HERDS = 240;
const MAX_DAY_STEP = 30;
const DAYS_PER_YEAR = 400;

const SIMULATED_SPECIES = Object.freeze({
    // Periods are seasonal movement intervals, not animation frames. With the
    // old 6–14 day cadence every herd was constantly roaming, which produced
    // thousands of migrations per year and stacked several herds on one tile.
    deer: { base: 18, reproduction: 0.085, mortality: 0.032, mobility: 2, period: 80 },
    "roe-deer": { base: 10, reproduction: 0.11, mortality: 0.038, mobility: 2, period: 70 },
    boar: { base: 9, reproduction: 0.09, mortality: 0.04, mobility: 2, period: 90 },
    fox: { base: 4, reproduction: 0.085, mortality: 0.052, mobility: 3, period: 65, winterReproduction: 0.9 },
    hare: { base: 8, reproduction: 0.14, mortality: 0.075, mobility: 2, period: 55 },
    squirrel: { base: 10, reproduction: 0.1, mortality: 0.04, mobility: 1, period: 75 },
    owl: { base: 3, reproduction: 0.06, mortality: 0.035, mobility: 2, period: 95, winterReproduction: 0.9 },
    woodpecker: { base: 4, reproduction: 0.065, mortality: 0.03, mobility: 2, period: 85, winterReproduction: 0.9 },
});

export const SIMULATED_FAUNA_IDS = Object.freeze(Object.keys(SIMULATED_SPECIES));

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function hash32(seed, a, b, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, a, b, salt = 0) {
    return hash32(seed, a, b, salt) / 0x100000000;
}

function worldWidth() {
    return Math.max(1, Math.floor(number(state.worldW, WORLD_W) || WORLD_W));
}

function worldHeight() {
    return Math.max(1, Math.floor(number(state.worldH, WORLD_H) || WORLD_H));
}

function seasonFor(day) {
    return ["spring", "summer", "autumn", "winter"][seasonalState(day).season] || "spring";
}

function herdHash(herd) {
    return hash32(state.forestFauna?.seed || state.worldSeed, herd.x, herd.y, 0x48455244);
}

function nodeAt(x, y) {
    try {
        return getResourceNodeAt(x, y);
    } catch {
        return null;
    }
}

function standAt(x, y, node = null) {
    const h = node ? Math.max(0, Math.min(1, Number(node.forestStock) / Math.max(1, Number(node.forestCapacity)))) : 1;
    try {
        return forestStandAt(x + 0.5, y + 0.5, {
            seed: state.forestFauna?.seed || state.worldSeed,
            moisture: getMoistureAt(x + 0.5, y + 0.5),
            temperature: getTemperatureAt(x + 0.5, y + 0.5),
            height: getHeightAt(x + 0.5, y + 0.5),
            climate: state.worldOptions?.climate || "temperate",
            forests: state.worldOptions?.forests ?? 52,
            stockRatio: h,
            rockLine: 0.92,
            succession: node?.forestSuccession || null,
        });
    } catch {
        return null;
    }
}

function speciesMeta(id) {
    return FOREST_FAUNA[id] || { label: id, group: "small", note: "moving through the wood" };
}

function preferenceScore(stand, species, day) {
    const season = seasonFor(day);
    let score = 0.32 + (stand?.density || 0.55) * 0.2
        + (stand?.canopy || 0.5) * 0.1 + (stand?.ground?.litter || 0.3) * 0.09
        + (stand?.understory?.fern || 0.2) * 0.08;
    if (!stand) return 0.35;

    if (["deer", "roe-deer", "hare"].includes(species)) {
        score += stand.edge ? 0.18 : 0;
        score += stand.clearing > 0.25 ? 0.14 : 0;
        score += stand.ageClass === "young" ? 0.08 : 0;
    }
    if (species === "boar") {
        score += stand.ground?.mushrooms || 0;
        score += season === "autumn" ? 0.18 : 0;
        score += stand.ground?.litter || 0;
    }
    if (species === "fox") {
        score += stand.edge ? 0.22 : 0;
        score += stand.disturbance === "diseased" ? 0.06 : 0;
    }
    if (species === "squirrel") {
        score += stand.type === "beechwood" || stand.type === "oakwood" ? 0.16 : 0;
        score += stand.ageClass === "ancient" ? 0.1 : 0;
    }
    if (species === "owl" || species === "woodpecker") {
        score += stand.ageClass === "ancient" ? 0.22 : 0;
        score += stand.ground?.logs || 0;
        score += stand.disturbance === "diseased" ? 0.08 : 0;
    }
    if (season === "winter") score *= 0.82;
    if (season === "spring") score *= 1.04;
    return clamp(score, 0.08, 1);
}

function carryingCapacity(herd, stand, node, day) {
    const spec = SIMULATED_SPECIES[herd.species];
    if (!spec) return 1;
    const stock = node?.forestCapacity ? Number(node.forestStock) / Number(node.forestCapacity) : 0.55;
    const season = seasonFor(day);
    const seasonal = season === "winter" ? 0.62 : season === "spring" ? 0.94 : season === "autumn" ? 1.06 : 1;
    const score = preferenceScore(stand, herd.species, day);
    const capacity = spec.base * (0.52 + score * 0.88) * (0.72 + stock * 0.28) * seasonal;
    return Math.max(1, capacity);
}

function resolveHerd(herd, day) {
    const node = nodeAt(herd.x, herd.y);
    if (!node || !node.forestCapacity) return null;
    const stand = standAt(herd.x, herd.y, node);
    const capacity = carryingCapacity(herd, stand, node, day);
    return { node, stand, capacity };
}

function chooseSpecies(stand) {
    const candidates = (stand?.fauna || []).filter(id => SIMULATED_SPECIES[id]);
    if (!candidates.length) return stand?.edge ? "hare" : "squirrel";
    const roll = unit(state.forestFauna?.seed || state.worldSeed, stand.x * 17, stand.y * 19, 0x53504543);
    return candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
}

function initialHerd(tile) {
    const species = chooseSpecies(tile.stand);
    const spec = SIMULATED_SPECIES[species];
    const score = preferenceScore(tile.stand, species, Number(state.dayOfYear) || 0);
    const stock = tile.node.forestCapacity ? tile.node.forestStock / tile.node.forestCapacity : 0.55;
    const roll = unit(state.worldSeed, tile.x, tile.y, 0x48455244);
    const population = Math.max(2, Math.round(spec.base * (0.45 + score * 0.8) * (0.62 + roll * 0.55) * (0.72 + stock * 0.28) * 10) / 10);
    return {
        id: "h" + tile.x.toString(36) + "-" + tile.y.toString(36),
        species, x: tile.x, y: tile.y,
        population,
        capacity: Math.max(population, Math.round(carryingCapacity({ species, x: tile.x, y: tile.y }, tile.stand, tile.node, Number(state.dayOfYear) || 0) * 10) / 10),
        trend: "stable",
        // Hunting pressure is real offtake pressure, not a habitat proxy. It
        // rises when this herd loses animals and decays during quiet days.
        huntingPressure: 0,
        lastHuntedDay: 0,
        // A newly built wood starts settled; it should not migrate on the very
        // first day merely because its lastMoved value is the year origin.
        lastMoved: Number(state.dayOfYear) || 0,
    };
}

function buildModel() {
    const width = worldWidth();
    const height = worldHeight();
    const seed = Number(state.worldSeed) >>> 0;
    if (!seed || !state.resourceGeography) return null;
    const step = Math.max(4, Math.floor(Math.sqrt((width * height) / MAX_HERDS)));
    const herds = [];
    for (let y = Math.floor(step / 2); y < height && herds.length < MAX_HERDS; y += step) {
        for (let x = Math.floor(step / 2); x < width && herds.length < MAX_HERDS; x += step) {
            const node = nodeAt(x, y);
            if (!node?.forestCapacity) continue;
            const stand = standAt(x, y, node);
            if (!stand?.forest) continue;
            const roll = unit(seed, x, y, 0x48455244);
            // Leave real gaps between herds; the result is a metapopulation,
            // not one herd on every forest tile.
            if (roll > 0.72) continue;
            herds.push(initialHerd({ x, y, node, stand }));
        }
    }
    return {
        version: VERSION,
        seed,
        day: Number(state.dayOfYear) || 0,
        herds,
        stats: { births: 0, deaths: 0, migrations: 0, splits: 0, hunts: 0 },
        history: [],
    };
}

export function ensureForestFauna() {
    const existing = state.forestFauna;
    if (existing?.version === VERSION && Array.isArray(existing.herds)) return existing;
    const model = buildModel();
    if (model) state.forestFauna = model;
    return model;
}

export function resetForestFauna() {
    state.forestFauna = null;
}

function addHistory(model, entry) {
    model.history = Array.isArray(model.history) ? model.history : [];
    model.history.push(entry);
    if (model.history.length > 32) model.history.splice(0, model.history.length - 32);
}

function neighbourCandidates(herd, radius) {
    const candidates = [];
    const seen = new Set();
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (!dx && !dy) continue;
            if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
            const x = herd.x + dx;
            const y = herd.y + dy;
            if (x < 0 || y < 0 || x >= worldWidth() || y >= worldHeight()) continue;
            const key = x + ":" + y;
            if (seen.has(key)) continue;
            seen.add(key);
            const node = nodeAt(x, y);
            if (!node?.forestCapacity) continue;
            const stand = standAt(x, y, node);
            if (!stand?.forest) continue;
            candidates.push({ x, y, node, stand });
        }
    }
    return candidates;
}

function daysSince(lastMoved, day) {
    return ((Number(day) || 0) - (Number(lastMoved) || 0) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
}

function maybeMigrate(model, herd, current, day, additions = []) {
    const spec = SIMULATED_SPECIES[herd.species];
    if (!spec) return false;
    const lastMoved = Number(herd.lastMoved) || 0;
    // Compare in calendar days. A plain subtraction stops matching when the
    // 400-day calendar wraps, which used to freeze migration for most of the
    // following year.
    const due = daysSince(lastMoved, model.day) >= spec.period;
    const crowded = herd.population > current.capacity * 0.94;
    const season = seasonFor(model.day);
    if (!crowded && !due) return false;
    // Outside the two movement seasons only a genuinely crowded herd moves.
    // This keeps ordinary herds in their home wood and reserves roaming for
    // spring dispersal and autumn range shifts.
    if (!crowded && season !== "spring" && season !== "autumn") return false;
    const occupied = new Set(model.herds
        .filter(other => other !== herd)
        .map(other => other.x + ":" + other.y));
    // Splits are appended only after the daily herd loop. Reserve their target
    // tiles now so a later migration cannot land on the same wood today.
    for (const addition of additions) occupied.add(addition.x + ":" + addition.y);
    const candidates = neighbourCandidates(herd, spec.mobility)
        .filter(candidate => !occupied.has(candidate.x + ":" + candidate.y));
    if (!candidates.length) return false;
    const currentScore = preferenceScore(current.stand, herd.species, model.day);
    let best = null;
    // An empty wood may be better, but a herd must gain a meaningful amount of
    // habitat quality to leave. Without this margin the random tie-breaker made
    // almost every due herd move every season.
    let bestScore = currentScore + (crowded ? 0.015 : 0.08);
    for (const candidate of candidates) {
        const score = preferenceScore(candidate.stand, herd.species, model.day)
            + unit(model.seed, candidate.x + herd.x, candidate.y + herd.y, day + hash32(model.seed, herd.x, herd.y, 0x4d494752)) * 0.02;
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    if (!best) return false;
    addHistory(model, { day: model.day, kind: "migration", species: herd.species, from: [herd.x, herd.y], to: [best.x, best.y], population: Math.round(herd.population * 10) / 10 });
    herd.x = best.x;
    herd.y = best.y;
    herd.lastMoved = model.day;
    model.stats.migrations++;
    return true;
}

// The daily population step is pure so the over-hunting model can be tested
// without advancing a whole realm. `mortality` is the already season-adjusted
// rate; hunting pressure adds a loss proportional to the herd.
export function forestHerdGrowth({ population, capacity, reproduction, mortality, huntingPressure = 0 }) {
    const crowding = population / Math.max(1, capacity);
    const gain = reproduction * population * Math.max(-0.2, 1 - crowding);
    const loss = mortality * population + Math.max(0, Number(huntingPressure) || 0) * population * 0.025;
    return gain - loss;
}

// Player hunting removes animals from one concrete herd. The returned quality
// is the condition of that herd at the moment of the shot, not a fixed loot
// tier. Pressure rises with the share removed and only decays over later days.
export function harvestForestGameAt(x, y, requested = 1) {
    const model = ensureForestFauna();
    if (!model) return null;
    const tx = Math.floor(number(x, -1));
    const ty = Math.floor(number(y, -1));
    if (tx < 0 || ty < 0) return null;
    const herds = model.herds
        .filter(herd => herd.x === tx && herd.y === ty && herd.population >= 1)
        .sort((a, b) => b.population - a.population || String(a.id).localeCompare(String(b.id)));
    const herd = herds[0];
    if (!herd) return null;
    const before = Math.max(1, Number(herd.population) || 0);
    const wanted = Math.max(1, Math.min(3, Math.floor(number(requested, 1))));
    const taken = Math.min(wanted, Math.max(0, Math.floor(before - 0.8)));
    if (taken <= 0) return null;
    const after = Math.round((before - taken) * 10) / 10;
    const share = taken / before;
    herd.population = after;
    herd.huntingPressure = Math.min(2, Math.max(0, number(herd.huntingPressure)) + share * 2);
    herd.lastHuntedDay = model.day;
    herd.trend = "declining";
    model.stats.hunts = Math.max(0, Math.floor(number(model.stats.hunts))) + 1;
    const condition = before / Math.max(1, Number(herd.capacity) || before);
    const quality = condition >= 0.72 && herd.huntingPressure < 0.85 ? "prime"
        : condition >= 0.4 ? "good" : "lean";
    addHistory(model, {
        day: model.day, kind: "hunt", species: herd.species,
        at: [tx, ty], taken, populationBefore: before, populationAfter: after, quality,
    });
    return {
        ok: true, herdId: herd.id, species: herd.species, label: speciesMeta(herd.species).label,
        taken, populationBefore: before, populationAfter: after, quality,
    };
}

export function updateForestFauna(days = 1) {
    const model = ensureForestFauna();
    if (!model) return null;
    const steps = Math.max(1, Math.min(MAX_DAY_STEP, Math.floor(number(days, 1))));
    for (let step = 0; step < steps; step++) {
        model.day = (model.day + 1) % DAYS_PER_YEAR;
        const season = seasonFor(model.day);
        const additions = [];
        for (const herd of model.herds) {
            const resolved = resolveHerd(herd, model.day);
            if (!resolved) {
                herd.population = Math.max(0, herd.population - 1);
                continue;
            }
            const spec = SIMULATED_SPECIES[herd.species];
            const { stand, node, capacity } = resolved;
            herd.capacity = Math.round(capacity * 10) / 10;
            const crowding = herd.population / Math.max(1, capacity);
            const winterReproduction = Number(spec.winterReproduction ?? 0.85);
            const reproduction = spec.reproduction * (season === "spring" ? 1.18 : season === "winter" ? winterReproduction : 1);
            const hunting = clamp(number(herd.huntingPressure), 0, 2);
            // Winter is a lean season, not a population reset. The old 1.55
            // multiplier removed roughly seven eighths of every herd by spring.
            const mortality = spec.mortality * (season === "winter" ? 0.95 : 0.9);
            const before = herd.population;
            const next = clamp(before + forestHerdGrowth({
                population: before, capacity, reproduction, mortality, huntingPressure: hunting,
            }), 0, capacity * 1.35);
            if (next > before + 0.05) model.stats.births++;
            if (next < before - 0.05) model.stats.deaths++;
            herd.population = Math.round(next * 10) / 10;
            herd.huntingPressure = Math.max(0, Math.round(hunting * 0.985 * 1000) / 1000);
            herd.trend = herd.population > before + 0.2 ? "growing" : herd.population < before - 0.2 ? "declining" : "stable";
            maybeMigrate(model, herd, resolved, model.day, additions);

            // A crowded herd disperses a small satellite group into a
            // neighbouring wood. The cap is a hard save/performance bound.
            if (herd.population > capacity * 1.18 && model.herds.length + additions.length < MAX_HERDS) {
                const candidates = neighbourCandidates(herd, 1);
                const target = candidates.find(candidate =>
                    !model.herds.some(other => other.x === candidate.x && other.y === candidate.y)
                    && !additions.some(other => other.x === candidate.x && other.y === candidate.y));
                if (target) {
                    const split = Math.max(1, Math.round(herd.population * 0.26 * 10) / 10);
                    herd.population = Math.round((herd.population - split) * 10) / 10;
                    const splitSequence = Number(model.stats.splits) || 0;
                    additions.push({
                        id: herd.id + "s" + splitSequence.toString(36),
                        species: herd.species, x: target.x, y: target.y,
                        population: split,
                        capacity: Math.max(split, Math.round(carryingCapacity({ species: herd.species, x: target.x, y: target.y }, target.stand, target.node, model.day) * 10) / 10),
                        trend: "growing", lastMoved: model.day,
                        huntingPressure: 0, lastHuntedDay: model.day,
                    });
                    model.stats.splits++;
                    addHistory(model, { day: model.day, kind: "dispersal", species: herd.species, from: [herd.x, herd.y], to: [target.x, target.y], population: split });
                }
            }
        }
        if (additions.length) model.herds.push(...additions);
        model.herds = model.herds.filter(herd => herd.population >= 0.4);
    }
    model.herds = model.herds.slice(0, MAX_HERDS);
    return model;
}

export function forestFaunaAt(x, y, stand = null, day = state.dayOfYear) {
    const model = ensureForestFauna();
    if (!model) return [];
    const tx = Math.floor(number(x, -1));
    const ty = Math.floor(number(y, -1));
    if (tx < 0 || ty < 0) return [];
    const herds = model.herds
        .filter(herd => herd.x === tx && herd.y === ty && herd.population >= 0.8)
        // `id` must name the species: the renderer keys its animal shapes and
        // colours off it. The herd's stable id lives on as `herdId`.
        .map(herd => ({ ...herd, ...speciesMeta(herd.species), herdId: String(herd.id), id: herd.species, day: model.day }));
    if (herds.length || !stand) return herds;
    return [];
}

export function forestFaunaSummaryAt(x, y, fallback = []) {
    const herds = forestFaunaAt(x, y);
    if (!herds.length) return fallback.slice(0, 3).map(id => speciesMeta(id).label).join(" · ");
    return herds
        .sort((a, b) => b.population - a.population)
        .slice(0, 3)
        .map(herd => herd.label + " " + Math.round(herd.population))
        .join(" · ");
}

export function serializeForestFauna() {
    const model = state.forestFauna;
    if (!model || model.version !== VERSION) return null;
    return {
        version: VERSION,
        seed: model.seed,
        day: model.day,
        herds: model.herds.map(herd => ({
            id: String(herd.id), species: herd.species, x: Math.floor(herd.x), y: Math.floor(herd.y),
            population: Math.round(number(herd.population) * 10) / 10,
            capacity: Math.round(number(herd.capacity) * 10) / 10,
            trend: ["growing", "stable", "declining"].includes(herd.trend) ? herd.trend : "stable",
            lastMoved: Math.max(0, Math.floor(number(herd.lastMoved))),
            huntingPressure: Math.round(clamp(number(herd.huntingPressure), 0, 2) * 1000) / 1000,
            lastHuntedDay: Math.max(0, Math.floor(number(herd.lastHuntedDay))),
        })),
        stats: { ...model.stats },
        history: (model.history || []).slice(-16).map(entry => ({ ...entry })),
    };
}

export function validateForestFaunaSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== VERSION) {
        throw new Error("Save data contains an invalid forest-fauna state.");
    }
    if (!Array.isArray(snapshot.herds) || snapshot.herds.length > MAX_HERDS) {
        throw new Error("Save data contains an invalid forest-fauna herd list.");
    }
    for (const herd of snapshot.herds) {
        if (!herd || typeof herd !== "object" || !SIMULATED_SPECIES[herd.species]
            || !Number.isFinite(Number(herd.x)) || !Number.isFinite(Number(herd.y))
            || !Number.isFinite(Number(herd.population)) || Number(herd.population) < 0 || Number(herd.population) > 500
            || !Number.isFinite(Number(herd.capacity)) || Number(herd.capacity) < 0 || Number(herd.capacity) > 2000
            || (herd.huntingPressure !== undefined && (!Number.isFinite(Number(herd.huntingPressure)) || Number(herd.huntingPressure) < 0 || Number(herd.huntingPressure) > 5))) {
            throw new Error("Save data contains an invalid forest-fauna herd entry.");
        }
    }
    if (!Number.isFinite(Number(snapshot.day)) || Number(snapshot.day) < 0 || Number(snapshot.day) >= DAYS_PER_YEAR) {
        throw new Error("Save data contains an invalid forest-fauna day.");
    }
    return true;
}

export function restoreForestFauna(snapshot) {
    state.forestFauna = null;
    if (!snapshot) return 0;
    validateForestFaunaSnapshot(snapshot);
    state.forestFauna = {
        version: VERSION,
        seed: Number(state.worldSeed) >>> 0,
        day: Number(snapshot.day) || 0,
        herds: snapshot.herds.map(herd => ({
            ...herd,
            x: Math.floor(Number(herd.x)), y: Math.floor(Number(herd.y)),
            population: Math.round(Number(herd.population) * 10) / 10,
            capacity: Math.round(Number(herd.capacity) * 10) / 10,
            lastMoved: Math.max(0, Math.floor(Number(herd.lastMoved) || 0)),
            huntingPressure: Math.max(0, Math.min(2, Number(herd.huntingPressure) || 0)),
            lastHuntedDay: Math.max(0, Math.floor(Number(herd.lastHuntedDay) || 0)),
        })),
        stats: { births: 0, deaths: 0, migrations: 0, splits: 0, hunts: 0, ...(snapshot.stats || {}) },
        history: Array.isArray(snapshot.history) ? snapshot.history.slice(-32) : [],
    };
    return state.forestFauna.herds.length;
}

export const FOREST_FAUNA_LIMITS = Object.freeze({ maxHerds: MAX_HERDS, version: VERSION });
