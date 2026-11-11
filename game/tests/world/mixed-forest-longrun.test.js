import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    generateResourceGeography, getResourceNodeAt, regrowForests,
    restoreResourceGeography, serializeResourceGeography,
} from "../../js/systems/resource-geography.js";
import {
    ensureForestSuccession, resetForestSuccession, restoreForestSuccession,
    serializeForestSuccession, updateForestSuccession,
} from "../../js/systems/forest-succession.js";

// Pure islands are deliberately derived from the saved world, stock ratio and
// succession record rather than stored as a separate island list. This long
// audit proves the derivation survives the real save/load boundaries: restore
// the resource deltas and succession state after every ten years, then compare
// the complete stand fingerprint for every island found on day zero.
const SEED = 20261108;
const WORLD_SIZE = 64;
const RESOLUTION = 2;
const FORESTS = 70;

function setupWorld() {
    resetState();
    resetForestSuccession();
    state.worldSeed = SEED;
    state.worldW = WORLD_SIZE;
    state.worldH = WORLD_SIZE;
    state.terrainResolution = RESOLUTION;
    state.terrainPixW = WORLD_SIZE * RESOLUTION;
    state.terrainPixH = WORLD_SIZE * RESOLUTION;
    state.worldOptions = {
        landmass: 50, ruggedness: 55, forests: FORESTS, water: 48, climate: "temperate",
    };
    const pixels = state.terrainPixW * state.terrainPixH;
    state.heightMap = new Float32Array(pixels).fill(0.62);
    state.moistureMap = new Float32Array(pixels).fill(0.68);
    state.temperatureMap = new Float32Array(pixels).fill(0.55);
    state.weather = "clear";
    state.year = 1;
    state.dayOfYear = 0;
    state.tick = 0;
    state.seasonIndex = 0;
    generateResourceGeography(SEED);
    ensureForestSuccession();
}

function tileFingerprint(x, y) {
    const node = getResourceNodeAt(x, y);
    if (!node?.forestStand) return null;
    const stand = node.forestStand;
    return {
        type: stand.type,
        mixed: stand.mixed,
        pattern: stand.mixture?.pattern || null,
        pureIsland: stand.mixture?.pureIsland ? {
            active: stand.mixture.pureIsland.active,
            species: stand.mixture.pureIsland.species,
            label: stand.mixture.pureIsland.label,
            broadleaf: stand.mixture.pureIsland.broadleaf,
        } : null,
        stock: node.forestStock,
        succession: node.forestSuccession ? {
            kind: node.forestSuccession.kind,
            age: node.forestSuccession.age,
            stage: node.forestSuccession.stage,
        } : null,
    };
}

function findPureIslands() {
    const islands = [];
    for (let y = 0; y < WORLD_SIZE; y++) {
        for (let x = 0; x < WORLD_SIZE; x++) {
            const node = getResourceNodeAt(x, y);
            const mixture = node?.forestStand?.mixture;
            if (!mixture?.pureIsland?.active) continue;
            assert.notEqual(mixture.pattern, "even",
                "an evenly mixed stand must never receive a pure island");
            islands.push({ x, y, broadleaf: mixture.pureIsland.broadleaf });
        }
    }
    return islands;
}

function saveReloadRoundTrip() {
    const clock = {
        year: state.year,
        dayOfYear: state.dayOfYear,
        tick: state.tick,
        seasonIndex: state.seasonIndex,
        weather: state.weather,
    };
    const resources = serializeResourceGeography();
    const succession = serializeForestSuccession();
    assert.ok(resources);
    assert.ok(succession);

    // Rebuild the deterministic world from its seed, then apply exactly the
    // saved deltas and succession records. The clock is part of the snapshot
    // because regrowth slicing and disturbance scheduling are tick-based.
    setupWorld();
    restoreResourceGeography(resources);
    restoreForestSuccession(succession);
    Object.assign(state, clock);
}

function advanceYear() {
    for (let day = 0; day < 400; day++) {
        state.tick++;
        state.dayOfYear++;
        if (state.dayOfYear >= 400) {
            state.dayOfYear = 0;
            state.year++;
        }
        state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
        updateForestSuccession(1);
        regrowForests(400, { slice: state.tick % 400, slices: 400 });
    }
}

test("pure islands survive save reloads across a century of forest succession", () => {
    setupWorld();
    const islands = findPureIslands();
    assert.ok(islands.length >= 20, "the audit world must contain a meaningful pure-island population");
    assert.ok(islands.some(island => island.broadleaf), "the audit world needs a pure broadleaf island");
    assert.ok(islands.some(island => !island.broadleaf), "the audit world needs a pure conifer island");

    let remaining = islands.length;
    let remainingBroadleaf = 0;
    let remainingConifer = 0;
    for (let year = 1; year <= 100; year++) {
        advanceYear();
        if (year % 10 !== 0) continue;

        const before = islands.map(island => tileFingerprint(island.x, island.y));
        saveReloadRoundTrip();
        const after = islands.map(island => tileFingerprint(island.x, island.y));
        assert.deepEqual(after, before,
            "save/reload at year " + year + " changed a pure-island stand or its succession state");

        remaining = after.filter(entry => entry?.pureIsland?.active).length;
        remainingBroadleaf = after.filter(entry => entry?.pureIsland?.active && entry.pureIsland.broadleaf).length;
        remainingConifer = after.filter(entry => entry?.pureIsland?.active && !entry.pureIsland.broadleaf).length;
        assert.ok(remainingBroadleaf > 0, "broadleaf islands disappeared by year " + year);
        assert.ok(remainingConifer > 0, "conifer islands disappeared by year " + year);
    }

    // Natural disturbances may remove a few islands; the pure-island pattern
    // itself must remain a stable, recoverable part of the saved landscape.
    assert.ok(remaining >= Math.ceil(islands.length * 0.75),
        "only " + remaining + " of " + islands.length + " pure islands remained after a century");
    assert.ok(remainingBroadleaf > 0 && remainingConifer > 0,
        "both pure-island crown types must survive the century");
});
