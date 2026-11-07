import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
    new URL("../../js/presentation/rendering/terrain-webgl.js", import.meta.url),
    "utf8",
);

test("the terrain shader keeps coastal sand and arid sand on the same material path", () => {
    assert.match(source, /float beachNoise = fbm2/);
    assert.match(source, /float sand = clamp\(beach \+ arid/);
    assert.match(source, /float arid = smoothstep/);
});

test("the terrain shader turns water crests into a close-view highlight", () => {
    assert.match(source, /float crest = smoothstep/);
    assert.match(source, /color \+= uFoam \* crest \*/);
});
