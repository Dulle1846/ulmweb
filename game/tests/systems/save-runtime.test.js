// Exact round-trip proof for the real save pipeline. The browser and the
// long-run audit both call the same create/prepare/restore functions.
import test from "node:test";
import assert from "node:assert/strict";
import { runCampaign } from "../campaign/campaign-driver.mjs";
import { resetState, state } from "../../js/core/state.js";
import { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot } from "../../js/core/save-runtime.js";
import { createIdentityState } from "../../js/systems/identity.js";
import { TYPE } from "../../js/core/types.js";
import { createLegacyState } from "../../js/systems/legacy.js";

function makeCanvas() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {}
            };
        }
    };
}

function differences(a, b, path = "snapshot", out = []) {
    if (out.length >= 30) return out;
    if (Object.is(a, b)) return out;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
        out.push(path + ": " + JSON.stringify(a) + " != " + JSON.stringify(b));
        return out;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            out.push(path + ": array " + a?.length + " != " + b?.length);
            return out;
        }
        for (let index = 0; index < a.length; index++) differences(a[index], b[index], path + "[" + index + "]", out);
        return out;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(key in a)) out.push(path + "." + key + ": missing on saved");
        else if (!(key in b)) out.push(path + "." + key + ": missing on restored");
        else differences(a[key], b[key], path + "." + key, out);
        if (out.length >= 30) break;
    }
    return out;
}

function initializeAuditRealm() {
    state.identity = createIdentityState({ kingdomName: "Endurance Realm", dynastyName: "Royal House", foundedYear: 1 });
    state.kingdomName = state.identity.kingdomName;
    state.royal.dynastyName = state.identity.dynastyName;
    state.legacy = createLegacyState({ foundedYear: 1 });
}

test("a mature realm survives an exact save/load round-trip through schema 8 and 9 into schema 11", () => {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => makeCanvas() };
    try {
        const campaign = runCampaign({ years: 25, onInitialized: initializeAuditRealm });
        assert.equal(campaign.ok, true, "the fixture campaign must remain healthy");
        const saved = JSON.parse(JSON.stringify(createSaveSnapshot()));
        // The browser validates an import before initWorld replaces the current
        // realm. Its initial 160×160 world is smaller than this 176×176 fixture;
        // geography indices above 160×160 used to be rejected even though they
        // are valid for the saved world. Keep this mismatch in the regression.
        assert.ok(saved.resourceGeography.forest.some(([index]) => index >= 160 * 160),
            "the fixture must contain a forest tile beyond a stale 160×160 world");

        for (const schema of [9, 8]) {
            const legacy = JSON.parse(JSON.stringify(saved));
            legacy.saveSchemaVersion = schema;
            state.worldW = 160;
            state.worldH = 160;
            const prepared = prepareSaveSnapshot(legacy);
            assert.equal(prepared.saveSchemaVersion, 11, "the load path must migrate to the current schema");

            resetState();
            state.activeProfileId = "save-runtime-test";
            state.playerName = saved.playerName;
            state.hasStarted = true;
            state.isPaused = false;
            restoreSaveSnapshot(prepared);

            const restored = JSON.parse(JSON.stringify(createSaveSnapshot()));
            const delta = differences(saved, restored);
            assert.deepEqual(delta, [], "schema " + schema + " round-trip must reproduce the exact snapshot");
            assert.equal(restored.tick, saved.tick);
            assert.equal(restored.year, saved.year);
            assert.deepEqual(restored.resources, saved.resources);
            assert.deepEqual(restored.population, saved.population);
            assert.deepEqual(restored.entities.map(entity => [entity.id, entity.x, entity.y]),
                saved.entities.map(entity => [entity.id, entity.x, entity.y]));
        }

        // A saved home/anchor can legitimately differ from the house chosen by
        // household normalization (a worker posted to a construction site).
        // The restore must keep the persisted anchors, not silently rehome the
        // resident during every load.
        const probeSaved = JSON.parse(JSON.stringify(saved));
        const probeVillager = probeSaved.entities.find(entity =>
            entity.type === TYPE.VILLAGER && !entity.dead && entity.home && entity.anchor);
        assert.ok(probeVillager, "the fixture must contain a housed villager");
        probeVillager.home = { x: 1, y: 1 };
        probeVillager.anchor = { x: 1, y: 1 };
        const probePrepared = prepareSaveSnapshot(probeSaved);
        resetState();
        state.activeProfileId = "save-runtime-test";
        state.playerName = saved.playerName;
        state.hasStarted = true;
        state.isPaused = false;
        restoreSaveSnapshot(probePrepared);
        const probeRestored = state.entities.find(entity => entity.id === probeVillager.id);
        assert.ok(probeRestored, "the probe villager must survive restoration");
        assert.deepEqual(probeRestored.home, { x: 1, y: 1 },
            "restore must keep the saved home after household normalization");
        assert.deepEqual(probeRestored.anchor, { x: 1, y: 1 },
            "restore must keep the saved anchor after household normalization");
    } finally {
        globalThis.document = previousDocument;
    }
});
