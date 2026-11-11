import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const MIXED_TYPES = Object.freeze([
    "mixed-oak-beech-spruce", "mixed-fir-beech-maple", "pine-broadleaf",
    "mixed-alluvial", "mixed-montane", "mixed-open", "mixed-dense",
    "mixed-ancient", "mixed-young", "mixed-ecotone",
    "coppice-with-standards", "selection-forest",
]);
const REFERENCE_URL = new URL("../../docs/terrain-reference/mixed-reference.json", import.meta.url);
const IMAGE_NAMES = Object.freeze(["mixed-reference.png", "mixed-seasons.png"]);

test("the mixed reference captures all twelve formations and their real mixture data", async () => {
    const metadata = JSON.parse(await readFile(REFERENCE_URL, "utf8"));
    assert.equal(metadata.formations?.length, MIXED_TYPES.length,
        "the mixed reference must capture all twelve mixed formations");
    assert.deepEqual(metadata.formations.map(entry => entry.type).sort(), [...MIXED_TYPES].sort());
    assert.equal(metadata.seed, 20261104);
    assert.equal(metadata.world.climate, "temperate");
    assert.equal(metadata.world.forests, 64);
    assert.ok(MIXED_TYPES.includes(metadata.seasonalFocus?.type),
        "the seasonal strip must follow a real mixed formation");

    for (const formation of metadata.formations) {
        assert.equal(formation.mixed, true, formation.type + " must record its mixed flag");
        assert.ok(formation.mixtureLabel, formation.type + " must record the actual mixture label");
        assert.ok(["grouped", "even", "mosaic"].includes(formation.mixturePattern),
            formation.type + " recorded an invalid distribution pattern");
        assert.ok(formation.broadleafShare > 0, formation.type + " must contain broadleaf trees");
        assert.ok(Math.abs(formation.broadleafShare + formation.coniferShare - 1) < 1e-6,
            formation.type + " broadleaf and conifer shares must sum to one");
        if (formation.type !== "coppice-with-standards") {
            assert.ok(formation.coniferShare > 0, formation.type + " must contain conifers");
        }
        assert.ok(Array.isArray(formation.canopyLayers) && formation.canopyLayers.length >= 2,
            formation.type + " must record at least two canopy layers");
        assert.ok(formation.understoryType, formation.type + " must record its understorey type");
        assert.ok(Array.isArray(formation.silviculture) && formation.silviculture.length >= 3,
            formation.type + " must record its silvicultural uses");
        assert.ok(Array.isArray(formation.autumnPalette) && formation.autumnPalette.length >= 2,
            formation.type + " must record several autumn colours");
    }

    assert.ok(metadata.artifactHashes, "the mixed reference must hash its tracked artifacts");
    for (const name of IMAGE_NAMES) {
        const bytes = await readFile(new URL("../../docs/terrain-reference/" + name, import.meta.url));
        assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            name + " must be a real PNG");
        assert.ok(bytes.length > 1000, name + " must contain visible artwork");
        const key = name.startsWith("mixed-reference") ? "formation" : "seasonal";
        assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.artifactHashes[key],
            name + " must match the artifact hash recorded in the same reference run");
    }
});
