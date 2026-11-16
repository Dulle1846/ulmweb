// Deterministic multi-year volcanic settlement campaign.
//
// This is not a destruction unit test. It starts the shipped realm with the
// real world, city, logistics, population, weather and event systems, then
// drives years of ordinary simulation. Two annual hazard passes are focused
// (one eruption, one earthquake) so the campaign can prove both branches
// without depending on a lucky roll; every other part of the hazard, including
// the candidate scan, event log, real building removal, construction and
// recovery, runs unchanged.
//
// Run with: node scripts/volcano-campaign.mjs
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { initWorld } from "../js/world/world.js";
import { initStartingKingdom } from "../js/world/entities.js";
import {
    initializeCityForRealm, openGoodsBookForNewRealm, updateLogisticsMovement,
} from "../js/systems/logistics.js";
import { initializeSettlementForRealm } from "../js/systems/settlement.js";
import { normalizeHouseholdAssignments } from "../js/systems/population.js";
import { canPlaceBuilding, isUnderConstruction, placeDirectBuilding } from "../js/systems/construction.js";
import { buildingLabel } from "../js/systems/city-config.js";
import { updateVolcanoHazards } from "../js/world/volcano-hazards.js";
import { updateSimulation } from "../js/simulation/simulation.js";
import { resolveEventChoice } from "../js/systems/events.js";

export const VOLCANO_CAMPAIGN_SEED = 20260004;
export const VOLCANO_CAMPAIGN_YEARS = 9;

const YEAR_DAYS = 400;
const LOGISTICS_STEPS = 4;
const LOGISTICS_DT = 0.1875;

function makeCanvasStub() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {},
            };
        },
    };
}

function withCanvasStub(callback) {
    const previousDocument = globalThis.document;
    globalThis.document = {
        createElement(tag) {
            if (tag !== "canvas") throw new Error("Unexpected DOM element in volcano campaign: " + tag);
            return makeCanvasStub();
        },
    };
    try {
        return callback();
    } finally {
        globalThis.document = previousDocument;
    }
}

const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
};
const aliveBuildings = () => state.entities.filter(entity => entity.isBuilding?.() && !entity.dead);
const population = () => state.entities.filter(entity => entity.type === TYPE.VILLAGER && !entity.dead).length;
const activeSites = () => aliveBuildings().filter(entity => isUnderConstruction(entity)).length;

function snapshot() {
    return {
        year: state.year,
        tick: state.tick,
        population: population(),
        buildings: aliveBuildings().length,
        activeSites: activeSites(),
        resources: {
            wood: round(state.resources.wood),
            stone: round(state.resources.stone),
            gold: round(state.resources.gold),
            food: round(state.resources.food),
        },
        disasters: state.eventLog
            .filter(entry => /ERUPTION|EARTH TREMOR|LAVA|ASHFALL|COLLAPS|DESTROYED/i.test(entry.text))
            .slice(-8)
            .map(entry => entry.text),
    };
}

function incomingEvent(entity) {
    if (!entity?.isBuilding?.()) return null;
    return {
        id: entity.id,
        type: entity.type,
        label: buildingLabel(entity.type),
        x: entity.x,
        y: entity.y,
    };
}

function buildingAt(x, y) {
    return state.entities.find(entity => entity.isBuilding?.() && entity.x === x && entity.y === y) || null;
}

function resolvePendingEvent() {
    if (!state.activeEvent) return false;
    const choices = Array.isArray(state.activeEvent.choices) ? state.activeEvent.choices : [];
    for (let index = 0; index < Math.max(1, choices.length); index++) {
        if (resolveEventChoice(index)) return true;
    }
    return false;
}

function findRecoverySite(type, origin) {
    const exact = canPlaceBuilding(type, origin.x, origin.y);
    if (exact.ok) return { x: origin.x, y: origin.y, exact: true, reason: null };
    for (let radius = 1; radius <= 18; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const x = origin.x + dx, y = origin.y + dy;
                if (x < 2 || y < 2 || x >= state.worldW - 2 || y >= state.worldH - 2) continue;
                const verdict = canPlaceBuilding(type, x, y);
                if (verdict.ok) return { x, y, exact: false, reason: null };
            }
        }
    }
    return { x: origin.x, y: origin.y, exact: false, reason: exact.reason || "NO BUILDABLE SITE NEARBY" };
}

function initialiseCampaignRealm() {
    resetState();
    state.worldSeed = VOLCANO_CAMPAIGN_SEED;
    state.worldOptions = {
        size: "small", shape: "continent", climate: "volcanic",
        landmass: 50, ruggedness: 55, forests: 52, water: 48,
        fertility: 55, resources: 50,
    };
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.victory = false;
    initWorld(state.worldSeed, state.worldOptions);
    initStartingKingdom();
    initializeCityForRealm();
    normalizeHouseholdAssignments();
    initializeSettlementForRealm();
    openGoodsBookForNewRealm();
}

function captureHazard({ year, focus }) {
    const before = snapshot();
    const result = updateVolcanoHazards({ force: true, focus });
    const after = snapshot();
    const target = result.destroyed?.ok ? buildingAt(result.destroyed.x, result.destroyed.y) : null;
    return {
        year,
        focus,
        events: result.events,
        eruption: result.eruption,
        earthquake: result.earthquake,
        destroyed: result.destroyed,
        target: incomingEvent(target),
        buildingsBefore: before.buildings,
        buildingsAfter: after.buildings,
        resourcesBefore: before.resources,
        resourcesAfter: after.resources,
    };
}

/**
 * Run the campaign and return evidence. A failed run is returned, not thrown,
 * so the audit can show the failure instead of silently omitting a row.
 */
export function runVolcanoSettlementCampaign() {
    return withCanvasStub(() => {
        initialiseCampaignRealm();
        const started = snapshot();
        const years = [started];
        const hazards = [];
        const pendingRebuilds = [];
        const rebuilds = [];
        let lastYear = state.year;
        const failures = [];

        for (let tick = 0; tick < (VOLCANO_CAMPAIGN_YEARS - 1) * YEAR_DAYS; tick++) {
            updateSimulation();
            resolvePendingEvent();
            for (let step = 0; step < LOGISTICS_STEPS; step++) updateLogisticsMovement(LOGISTICS_DT);

            if (state.year === lastYear) continue;
            lastYear = state.year;

            if (state.year === 3) {
                const hazard = captureHazard({ year: 3, focus: "eruption" });
                hazards.push(hazard);
                if (!hazard.destroyed?.ok || hazard.destroyed.kind !== "building" || !hazard.target) {
                    failures.push("year 3 eruption did not destroy a real building");
                } else {
                    pendingRebuilds.push({ cause: "eruption", ...hazard.target, year: 3 });
                }
            }
            if (state.year === 4) {
                const hazard = captureHazard({ year: 4, focus: "earthquake" });
                hazards.push(hazard);
                if (!hazard.destroyed?.ok || hazard.destroyed.kind !== "building" || !hazard.target) {
                    failures.push("year 4 earthquake did not destroy a real building");
                } else {
                    pendingRebuilds.push({ cause: "earthquake", ...hazard.target, year: 4 });
                }
            }

            // The dead entities leave state.entities on the next simulation
            // tick. Rebuild in year five, after both hazards, through the same
            // direct-construction path the player uses.
            if (state.year === 5) {
                for (const original of pendingRebuilds) {
                    if (!original.type) continue;
                    const site = findRecoverySite(original.type, original);
                    if (site.reason) {
                        failures.push(original.cause + " recovery site unavailable: " + site.reason);
                        rebuilds.push({ ...original, site, ok: false, newId: null, reason: site.reason });
                        continue;
                    }
                    const placed = placeDirectBuilding(original.type, site.x, site.y);
                    if (!placed.ok) {
                        failures.push(original.cause + " rebuild rejected: " + placed.reason);
                        rebuilds.push({ ...original, site, ok: false, newId: null, reason: placed.reason });
                        continue;
                    }
                    rebuilds.push({
                        cause: original.cause,
                        label: original.label,
                        originalId: original.id,
                        original: { x: original.x, y: original.y },
                        site: { x: site.x, y: site.y, exact: site.exact },
                        newId: placed.entity.id,
                        placedYear: state.year,
                        ok: true,
                        reason: null,
                    });
                }
            }

            years.push({
                ...snapshot(),
                rebuilds: rebuilds.map(rebuild => {
                    const entity = state.entities.find(candidate => candidate.id === rebuild.newId);
                    return {
                        cause: rebuild.cause,
                        newId: rebuild.newId,
                        alive: Boolean(entity && !entity.dead),
                        stage: entity?.construction?.stage ?? null,
                        complete: Boolean(entity && !isUnderConstruction(entity)),
                        reason: entity?.construction?.reason ?? rebuild.reason ?? null,
                    };
                }),
            });
        }

        for (const rebuild of rebuilds) {
            if (!rebuild.ok) continue;
            const entity = state.entities.find(candidate => candidate.id === rebuild.newId);
            if (!entity || entity.dead) {
                failures.push(rebuild.cause + " rebuilt structure is not alive");
                continue;
            }
            if (isUnderConstruction(entity)) {
                failures.push(rebuild.cause + " rebuilt structure never completed");
                continue;
            }
            const completed = years.find(year => year.rebuilds?.some(row =>
                row.newId === rebuild.newId && row.complete
            ));
            rebuild.completedYear = completed?.year ?? null;
            rebuild.complete = true;
            rebuild.stage = entity.construction?.stage ?? 3;
        }

        const final = snapshot();
        const eruption = hazards.find(row => row.focus === "eruption");
        const earthquake = hazards.find(row => row.focus === "earthquake");
        const recoveryComplete = rebuilds.length === 2 && rebuilds.every(row => row.complete === true);
        if (!recoveryComplete) failures.push("both destroyed settlement buildings were not rebuilt to completion");

        return {
            ok: failures.length === 0,
            seed: VOLCANO_CAMPAIGN_SEED,
            years: VOLCANO_CAMPAIGN_YEARS,
            totalTicks: state.tick,
            initial: started,
            final,
            hazards,
            rebuilds,
            yearly: years,
            summary: {
                eruptionDestroyed: eruption?.target?.label ?? null,
                earthquakeDestroyed: earthquake?.target?.label ?? null,
                rebuilt: rebuilds.filter(row => row.complete).map(row => row.label),
                recoveryComplete,
                populationStart: started.population,
                populationFinal: final.population,
                buildingsStart: started.buildings,
                buildingsFinal: final.buildings,
                resourcesStart: started.resources,
                resourcesFinal: final.resources,
            },
            failures,
        };
    });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const result = runVolcanoSettlementCampaign();
    console.log("VOLCANO_CAMPAIGN " + JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
}
