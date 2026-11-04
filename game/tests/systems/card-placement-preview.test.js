import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { CARD_DECK, getCardPlacementPreview } from "../../js/systems/cards.js";
import { spawnEntity } from "../../js/world/entities.js";

beforeEach(() => {
    state.entities = [];
    state.currentCard = CARD_DECK.find(card => card.type === TYPE.FARM);
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    state.terrainResolution = 1;
    state.terrainPixW = 160;
    state.terrainPixH = 160;
    state.heightMap = new Float32Array(160 * 160).fill(0.5);
});

test("a farm preview is valid on clear terrain and reports its full footprint", () => {
    const preview = getCardPlacementPreview(40, 40);

    assert.equal(preview.valid, true);
    assert.equal(preview.reason, null);
    assert.equal(preview.type, TYPE.FARM);
    assert.equal(preview.width, 2);
    assert.equal(preview.height, 1.5);
});

test("water terrain is rejected by the placement preview", () => {
    state.heightMap.fill(0.1);
    const preview = getCardPlacementPreview(40, 40);

    assert.equal(preview.valid, false);
    assert.equal(preview.reason, "INVALID TERRAIN");
});

test("an occupied building footprint is rejected", () => {
    spawnEntity(40, 40, TYPE.KEEP);
    const preview = getCardPlacementPreview(40, 40);

    assert.equal(preview.valid, false);
    assert.equal(preview.reason, "SPACE OCCUPIED");
});

test("unaffordable cards are rejected without changing resources", () => {
    state.resources.wood = 0;
    const preview = getCardPlacementPreview(40, 40);

    assert.equal(preview.valid, false);
    assert.equal(preview.reason, "CANNOT AFFORD");
    assert.equal(state.resources.wood, 0);
});

test("the preview rejects footprints outside the world", () => {
    const preview = getCardPlacementPreview(0, 40);

    assert.equal(preview.valid, false);
    assert.equal(preview.reason, "INVALID TERRAIN");
});

test("no preview is returned when no card is selected", () => {
    state.currentCard = null;
    assert.equal(getCardPlacementPreview(40, 40), null);
});

test("instant effect cards do not require a free building footprint", () => {
    spawnEntity(40, 40, TYPE.KEEP);
    state.currentCard = {
        kind: "effect", type: undefined, effect: "harvest",
        name: "HARVEST", cost: {}, sizeMultiplier: 1
    };
    const preview = getCardPlacementPreview(40, 40);
    assert.equal(preview.valid, true);
});

