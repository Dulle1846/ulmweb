// Builds the mature-realm browser fixture with the real campaign driver.
// This module is only imported by the short-lived fixture child process: the
// campaign allocates a large mature-realm graph, and keeping that graph in the
// long-lived test process leaves the host looking memory-constrained to
// Chromium even after V8 has cleared it.
import assert from "node:assert/strict";
import { runCampaign } from "../campaign/campaign-driver.mjs";
import { state as campaignState } from "../../js/core/state.js";
import { createSaveSnapshot } from "../../js/core/save-runtime.js";
import { createLocalProfile, writeLocalSave } from "../../js/core/persistence.js";
import { createIdentityState } from "../../js/systems/identity.js";
import { createLegacyState } from "../../js/systems/legacy.js";

class MemoryStorage {
    #values = new Map();
    get length() { return this.#values.size; }
    key(index) { return [...this.#values.keys()][index] ?? null; }
    getItem(key) { return this.#values.has(String(key)) ? this.#values.get(String(key)) : null; }
    setItem(key, value) { this.#values.set(String(key), String(value)); }
    removeItem(key) { this.#values.delete(String(key)); }
    clear() { this.#values.clear(); }
    entries() { return [...this.#values.entries()]; }
}

function campaignCanvasStub() {
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

function initializeAdvancedRealm(profileId) {
    campaignState.activeProfileId = profileId;
    campaignState.playerName = "Low-End Advanced Audit";
    campaignState.identity = createIdentityState({
        kingdomName: "Advanced Performance Realm",
        dynastyName: "Royal House",
        foundedYear: 1
    });
    campaignState.kingdomName = campaignState.identity.kingdomName;
    campaignState.royal.dynastyName = campaignState.identity.dynastyName;
    campaignState.legacy = createLegacyState({ foundedYear: 1 });
}

export function buildAdvancedSaveFixture({ origin, seed, climate, years, profileId }) {
    const previousDocument = globalThis.document;
    const previousStorage = globalThis.localStorage;
    try {
        globalThis.document = { createElement: () => campaignCanvasStub() };
        globalThis.localStorage = new MemoryStorage();
        createLocalProfile("Low-End Advanced Audit", profileId);
        const campaign = runCampaign({
            seed,
            years,
            profile: "builder",
            era: "common-weal",
            worldOptions: { climate },
            onInitialized: () => initializeAdvancedRealm(profileId)
        });
        assert.equal(campaign.ok, true, "the advanced performance campaign must be healthy");
        assert.equal(campaign.gameOver, false, "the advanced performance campaign must not end in defeat");
        const snapshot = createSaveSnapshot();
        writeLocalSave(profileId, snapshot);
        const entries = [...globalThis.localStorage.entries()];
        const population = Number(campaign.final?.population ?? snapshot.totalPopulation) || 0;
        const buildings = Number(campaign.final?.buildings) || 0;
        assert.ok(population >= 50, "advanced fixture must contain a populated realm, got " + population);
        assert.ok(buildings >= 40, "advanced fixture must contain a built realm, got " + buildings);
        return {
            campaignYears: years,
            campaignSeed: seed,
            climate,
            profileId,
            year: snapshot.year,
            tick: snapshot.tick,
            population,
            buildings,
            entities: snapshot.entities.filter(entity => !entity.dead).length,
            saveBytes: JSON.stringify(snapshot).length,
            storageState: {
                cookies: [],
                origins: [{
                    origin,
                    localStorage: entries.map(([name, value]) => ({ name, value }))
                }]
            }
        };
    } finally {
        globalThis.document = previousDocument;
        globalThis.localStorage = previousStorage;
    }
}
