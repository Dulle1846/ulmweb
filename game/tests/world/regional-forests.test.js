import test from "node:test";
import assert from "node:assert/strict";
import { initWorld } from "../../js/world/world.js";
import { state } from "../../js/core/state.js";
import { FOREST_GOODS, forestStandAt } from "../../js/world/forest-ecology.js";
import {
    REGIONAL_BOUNTY_SEASONS, REGIONAL_FORESTS_TEST_SITES, REGIONAL_FOREST_CHARACTER,
    REGIONAL_FOREST_TYPES, REGIONAL_FOREST_TYPE_IDS, REGIONAL_SPECIES,
    regionalCharacterFor, regionalForestSelectionFor, regionalForestTypeFor,
} from "../../js/world/regional-forests.js";
import {
    getResourceNodeAt, harvestForest, restoreResourceGeography, serializeResourceGeography,
} from "../../js/systems/resource-geography.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}

globalThis.document = { createElement: () => makeCanvas() };

const WORLD_OPTIONS = Object.freeze({
    size: "small", shape: "continent", water: 46, landmass: 58,
    fertility: 55, forests: 70, mountains: 55, ruggedness: 58,
});
const CLIMATES = Object.freeze([
    "temperate", "taiga", "snow", "mountain", "swamp", "savanna",
    "coastal", "tropical", "tundra",
]);
const SEED = 20261123;

test("the catalogue declares all sixty ids exactly once", () => {
    assert.equal(REGIONAL_FOREST_TYPES.length, 60);
    assert.equal(new Set(REGIONAL_FOREST_TYPE_IDS).size, 60);
    for (const id of REGIONAL_FOREST_TYPE_IDS) assert.match(id, /^1\.2\.23\.1\.0(0[1-9]|[1-5][0-9]|60)$/);
});

test("every regional type is produced by its documented site window", () => {
    assert.equal(REGIONAL_FORESTS_TEST_SITES.length, 60);
    for (const site of REGIONAL_FORESTS_TEST_SITES) {
        const selection = regionalForestSelectionFor({ x: 11, y: 13, seed: SEED, ...site });
        const selected = regionalForestTypeFor({ x: 11, y: 13, seed: SEED, ...site });
        assert.equal(selection.primary?.id, site.id, site.key);
        assert.equal(selected?.id, site.id, site.key);
        assert.ok(selection.secondary === null || selection.secondary.id !== selection.primary.id);
        assert.ok(selection.share >= 0 && selection.share <= 0.5);
        assert.ok(selected.timber > 0.5 && selected.timber < 1.5);
        assert.ok(selected.effects.regrowth > 0 && selected.effects.regrowth <= 1.45);
        assert.ok(selected.effects.fire >= -0.1 && selected.effects.fire <= 0.3);
        assert.ok(selected.goods.length >= 3);
        assert.ok(selected.fauna.length >= 3);
        assert.ok(selected.render.palette.length >= 3);
    }
});

test("every regional type has field marks, a real signature good and a bounty season", () => {
    assert.equal(Object.keys(REGIONAL_FOREST_CHARACTER).length, 60);
    for (const type of REGIONAL_FOREST_TYPES) {
        const character = regionalCharacterFor(type);
        assert.equal(character.key, type.key);
        assert.ok(character.traits.length >= 3, type.key + " must carry three field marks");
        assert.ok(character.traits.every(trait => typeof trait === "string" && trait.length > 2));
        assert.ok(Number.isInteger(character.season) && character.season >= 0 && character.season <= 3);
        assert.equal(character.seasonLabel, REGIONAL_BOUNTY_SEASONS[character.season]);
        assert.ok(type.goods.includes(character.signature), type.key + " signature must be one of its own goods");
        assert.ok(FOREST_GOODS[character.signature], type.key + " signature must be a registered good");
    }
});

test("every good named by a regional type or species is registered in the shared ledger", () => {
    const ids = new Set();
    for (const type of REGIONAL_FOREST_TYPES) for (const good of type.goods) ids.add(good);
    for (const species of Object.values(REGIONAL_SPECIES)) for (const good of species.goods) ids.add(good);
    const missing = [...ids].filter(id => !FOREST_GOODS[id]).sort();
    assert.deepEqual(missing, [], "unregistered forest goods: " + missing.join(", "));
});

test("the sixty types do not collapse into one multiplier or one palette", () => {
    const effects = new Set(REGIONAL_FOREST_TYPES.map(type => [
        type.effects.timber, type.effects.regrowth, type.effects.fire,
        type.effects.fauna, type.effects.forage, type.effects.work,
    ].join("|")));
    const palettes = new Set(REGIONAL_FOREST_TYPES.map(type => type.render.palette.join("|")));
    assert.ok(effects.size >= 55, "types must have differentiated effects");
    assert.ok(palettes.size >= 55, "types must have differentiated ground palettes");
});

test("range edges produce real transition stands without changing the primary owner", () => {
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "temperate" });
    let transitions = 0, forests = 0;
    for (let y = 0; y < state.worldH; y += 2) {
        for (let x = 0; x < state.worldW; x += 2) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            forests++;
            const transition = node.forestStand?.regionalTransition;
            if (!transition) continue;
            transitions++;
            assert.notEqual(transition.id, node.forestRegionalType);
            assert.ok(transition.share > 0 && transition.share <= 0.5);
            assert.ok(REGIONAL_FOREST_TYPE_IDS.includes(transition.id));
            assert.equal(node.forestRegionalTransitionId, transition.id);
            assert.equal(node.forestRegionalTransitionLabel, transition.label);
            assert.ok(node.forestRegionalSignature);
            assert.ok(node.forestRegionalSignatureLabel);
            assert.ok(node.forestRegionalCharacter?.traits.length >= 3);
        }
    }
    assert.ok(forests > 100);
    assert.ok(transitions > 0, "a generated realm must expose at least one transition belt");
});

test("a generated world leaves no harvestable forest tile untyped", () => {
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "temperate" });
    let forestTiles = 0;
    for (let y = 0; y < state.worldH; y += 2) {
        for (let x = 0; x < state.worldW; x += 2) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            forestTiles++;
            assert.ok(node.forestRegionalType, `untyped forest at ${x},${y}`);
            assert.ok(node.forestRegionalLabel.length > 3);
            assert.ok(node.forestStand.regionalTypeId === node.forestRegionalType);
        }
    }
    assert.ok(forestTiles > 100);
});

test("a nine-climate sweep reaches all sixty regional types", () => {
    const observed = new Set();
    for (const climate of CLIMATES) {
        initWorld(SEED, { ...WORLD_OPTIONS, climate });
        for (let y = 0; y < state.worldH; y++) {
            for (let x = 0; x < state.worldW; x++) {
                const node = getResourceNodeAt(x, y);
                if (node?.forestCapacity && node.forestRegionalType) observed.add(node.forestRegionalType);
            }
        }
    }
    assert.equal(observed.size, 60, "missing: " + REGIONAL_FOREST_TYPE_IDS.filter(id => !observed.has(id)).join(", "));
});

test("the regional assignment and its effects survive a resource save/load round trip", () => {
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "taiga" });
    let target = null;
    for (let y = 0; y < state.worldH && !target; y++) {
        for (let x = 0; x < state.worldW && !target; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestCapacity && node.forestRegionalType) target = { x, y, node };
        }
    }
    assert.ok(target);
    const first = forestStandAt(target.x + 0.5, target.y + 0.5, {
        seed: SEED, climate: "taiga", moisture: target.node.forestStand.moisture,
        temperature: target.node.forestStand.temperature, height: target.node.forestStand.height,
        forests: 70, stockRatio: 1, rockLine: 0.92,
    });
    const second = forestStandAt(target.x + 0.5, target.y + 0.5, {
        seed: SEED, climate: "taiga", moisture: target.node.forestStand.moisture,
        temperature: target.node.forestStand.temperature, height: target.node.forestStand.height,
        forests: 70, stockRatio: 1, rockLine: 0.92,
    });
    assert.equal(first.regionalTypeId, second.regionalTypeId);
    assert.deepEqual(first.regionalEffects, second.regionalEffects);

    assert.ok(harvestForest(target.x, target.y, 7) > 0);
    const snapshot = serializeResourceGeography();
    assert.equal(snapshot.forestModelVersion, 1, "new saves carry the forest-model marker");
    const before = getResourceNodeAt(target.x, target.y);
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "taiga" });
    restoreResourceGeography(snapshot);
    const after = getResourceNodeAt(target.x, target.y);
    assert.equal(after.forestRegionalType, before.forestRegionalType);
    assert.equal(after.forestRegionalLabel, before.forestRegionalLabel);
    assert.deepEqual(after.forestRegionalEffects, before.forestRegionalEffects);
    assert.equal(after.forestStock, before.forestStock);

    // A 3.66 save predates the marker. Restoring it must not drop or re-roll the
    // regional woodland; only the optional metadata is missing.
    const legacy = { ...snapshot };
    delete legacy.forestModelVersion;
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "taiga" });
    restoreResourceGeography(legacy);
    const migrated = getResourceNodeAt(target.x, target.y);
    assert.equal(migrated.forestRegionalType, before.forestRegionalType);
    assert.equal(migrated.forestStock, before.forestStock);
});
