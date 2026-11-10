import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
    FOREST_GOODS, FOREST_SPECIES, FOREST_TYPES, forestStandAt,
} from "../../js/world/forest-ecology.js";

const CONIFERS = Object.freeze(["spruce", "fir", "pine", "larch", "juniper", "yew", "dwarf-pine"]);
const REFERENCE_URL = new URL("../../docs/terrain-reference/conifer-reference.json", import.meta.url);
const SPECIES_IMAGE_URL = new URL("../../docs/terrain-reference/conifer-species.png", import.meta.url);
const REFERENCE_IMAGES = Object.freeze({
    formation: "conifer-reference.png",
    seasonal: "conifer-seasons.png",
    species: "conifer-species.png",
});
const FORMATION_MEMBERSHIP = Object.freeze({
    yew: Object.freeze(["sprucewood", "firwood", "larchwood", "subalpine-scrub", "mixed-conifer"]),
    "dwarf-pine": Object.freeze(["pinewood", "pine-heath", "mountain-conifer", "subalpine-scrub", "mixed-conifer"]),
});
const LABELS = Object.freeze({ yew: "Yew", "dwarf-pine": "Dwarf pine" });
const CONTEXT = Object.freeze({
    seed: 20261109, moisture: 0.56, temperature: 0.55, height: 0.55,
    climate: "temperate", forests: 64, stockRatio: 1, rockLine: 0.92,
});

// These are exactly the inputs drawConifer() reads from FOREST_SPECIES:
// silhouette shape, tier count, proportions, palette and snow behaviour.
function renderSignature(id) {
    const species = FOREST_SPECIES[id];
    return [
        species.form, species.crownShape, species.tiers, species.branchDrop, species.snowRetention,
        species.height, species.crown, species.trunk,
        species.summer.join(","), species.autumn.join(","),
    ].join("|");
}

function findStandWithSpecies(id) {
    for (const temperature of [0.3, 0.36, 0.44, 0.55]) {
        for (const moisture of [0.4, 0.5, 0.62, 0.76]) {
            for (const height of [0.5, 0.7, 0.84, 0.91]) {
                for (let y = 0; y < 72; y += 3) {
                    for (let x = 0; x < 72; x += 3) {
                        const stand = forestStandAt(x + 0.5, y + 0.5, { ...CONTEXT, temperature, moisture, height });
                        if (!stand.forest || !stand.conifer) continue;
                        const entry = stand.species.find(candidate => candidate.id === id);
                        if (entry && entry.weight > 0) return { stand, entry };
                    }
                }
            }
        }
    }
    return null;
}

test("yew and dwarf pine have distinct registered conifer render identities", () => {
    const signatures = CONIFERS.map(id => renderSignature(id));
    assert.equal(new Set(signatures).size, CONIFERS.length,
        "every conifer must own a distinct render signature: " + JSON.stringify(CONIFERS.map((id, index) => [id, signatures[index]])));
    assert.equal(new Set(CONIFERS.map(id => FOREST_SPECIES[id].summer.join(","))).size, CONIFERS.length,
        "every conifer needs its own summer palette");
    assert.equal(new Set(CONIFERS.map(id => FOREST_SPECIES[id].autumn.join(","))).size, CONIFERS.length,
        "every conifer needs its own autumn palette");

    const yew = FOREST_SPECIES.yew;
    const dwarfPine = FOREST_SPECIES["dwarf-pine"];
    assert.equal(yew.conifer, true);
    assert.equal(dwarfPine.conifer, true);
    assert.equal(yew.crownShape, "yew", "yew needs its own crown shape, not the generic spruce spire");
    assert.equal(dwarfPine.crownShape, "scrub");
    assert.ok(yew.height < FOREST_SPECIES.spruce.height);
    assert.ok(dwarfPine.height < yew.height);
    assert.ok(yew.tiers >= 3 && dwarfPine.tiers >= 3);
    assert.ok(yew.branchDrop > dwarfPine.branchDrop);
    assert.ok(yew.snowRetention > dwarfPine.snowRetention);
    assert.ok(FOREST_GOODS[yew.wood] && FOREST_GOODS[dwarfPine.wood]);
});

test("yew and dwarf pine occur with positive weight in their conifer formations", () => {
    for (const [id, formations] of Object.entries(FORMATION_MEMBERSHIP)) {
        for (const formation of formations) {
            const weights = FOREST_TYPES[formation]?.species || {};
            assert.ok(Number(weights[id]) > 0,
                id + " must occur in " + formation + " with a positive weight, got " + weights[id]);
        }
        assert.ok(FOREST_GOODS[FOREST_SPECIES[id].wood], id + " needs its own timber good");
    }

    for (const id of Object.keys(FORMATION_MEMBERSHIP)) {
        const found = findStandWithSpecies(id);
        assert.ok(found, id + " must occur in a generated stand, not only in the species registry");
        assert.equal(found.stand.conifer, true);
        assert.ok(found.entry.weight > 0, id + " must carry a positive weight inside the generated stand");
        assert.ok(found.stand.species.some(entry => entry.id === id));
    }
});

test("the conifer reference proves both new species occur and render distinct pixels", async () => {
    const metadata = JSON.parse(await readFile(REFERENCE_URL, "utf8"));
    assert.equal(metadata.formations?.length, 12, "the conifer reference must capture all twelve conifer formations");

    for (const [id, label] of Object.entries(LABELS)) {
        const captured = metadata.formations.filter(formation => Array.isArray(formation.species) && formation.species.includes(label));
        assert.ok(captured.length > 0,
            "the conifer reference must capture at least one formation containing " + label);
        for (const formation of captured) {
            assert.ok(Number(FOREST_TYPES[formation.type]?.species?.[id]) > 0,
                formation.type + " lists " + label + " but its formation weight is not positive");
        }
    }

    const plate = metadata.speciesPlate;
    assert.ok(plate, "the conifer reference must record the production species plate");
    assert.equal(plate.image, "conifer-species.png");
    assert.ok(plate.species?.length === CONIFERS.length,
        "the species plate must cover exactly the seven conifers, got " + plate.species?.length);
    assert.deepEqual(plate.species.map(entry => entry.id).sort(), [...CONIFERS].sort());

    const hashes = plate.species.map(entry => entry.hash);
    assert.ok(hashes.every(hash => /^[0-9a-f]{8}$/.test(hash)), "every species hash must be a stable 32-bit pixel hash");
    assert.equal(new Set(hashes).size, hashes.length,
        "every conifer must produce a distinct pixel hash: " + JSON.stringify(plate.species.map(entry => [entry.id, entry.hash])));

    for (const id of Object.keys(LABELS)) {
        const entry = plate.species.find(candidate => candidate.id === id);
        assert.ok(entry, id + " must be present in the rendered species plate");
        assert.ok(entry.ink > 100, id + " must render a visible silhouette, got " + entry.ink + " ink pixels");
        assert.ok(entry.bbox.width >= 20 && entry.bbox.height >= 30,
            id + " must render a recognisable silhouette, got " + JSON.stringify(entry.bbox));
        for (const other of CONIFERS.filter(candidate => candidate !== id)) {
            const otherEntry = plate.species.find(candidate => candidate.id === other);
            assert.notEqual(entry.hash, otherEntry.hash, id + " must not render as " + other);
        }
    }

    assert.ok(metadata.artifactHashes, "the conifer reference must record the hashes of every tracked artifact");
    for (const [key, name] of Object.entries(REFERENCE_IMAGES)) {
        const bytes = await readFile(new URL("../../docs/terrain-reference/" + name, import.meta.url));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.artifactHashes[key],
            name + " must match the artifact hash recorded in the same reference run");
    }

    const png = await readFile(SPECIES_IMAGE_URL);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "the rendered species plate must be a real PNG artifact");
    assert.ok(png.length > 1000, "the rendered species plate must contain visible artwork");
});
