import test from "node:test";
import assert from "node:assert/strict";
import {
    KEYBOARD_PAN_STEP, KEYBOARD_ZOOM_DELTA, mapKeyboardIntent, mapModifiedKeyboardIntent,
    isTextEntryTarget, isInteractiveTarget
} from "../../js/presentation/keyboard-map.js";

test("arrow keys and WASD pan the camera in the pressed direction", () => {
    for (const key of ["ArrowLeft", "a", "A"]) {
        assert.deepEqual(mapKeyboardIntent(key), { panX: -KEYBOARD_PAN_STEP, panY: 0 });
    }
    for (const key of ["ArrowRight", "d", "D"]) {
        assert.deepEqual(mapKeyboardIntent(key), { panX: KEYBOARD_PAN_STEP, panY: 0 });
    }
    for (const key of ["ArrowUp", "w", "W"]) {
        assert.deepEqual(mapKeyboardIntent(key), { panX: 0, panY: -KEYBOARD_PAN_STEP });
    }
    for (const key of ["ArrowDown", "s", "S"]) {
        assert.deepEqual(mapKeyboardIntent(key), { panX: 0, panY: KEYBOARD_PAN_STEP });
    }
});

test("card placement, pause, zoom and help match the advertised shortcuts", () => {
    assert.deepEqual(mapKeyboardIntent("Enter"), { place: true });
    assert.deepEqual(mapKeyboardIntent(" "), { place: true });
    assert.deepEqual(mapKeyboardIntent("p"), { togglePause: true });
    assert.deepEqual(mapKeyboardIntent("P"), { togglePause: true });
    assert.deepEqual(mapKeyboardIntent("1"), { zoomLevel: 1 });
    assert.deepEqual(mapKeyboardIntent("4"), { zoomLevel: 4 });
    assert.deepEqual(mapKeyboardIntent("+"), { zoomDelta: -KEYBOARD_ZOOM_DELTA });
    assert.deepEqual(mapKeyboardIntent("-"), { zoomDelta: KEYBOARD_ZOOM_DELTA });
    assert.deepEqual(mapKeyboardIntent("?"), { help: true });
    assert.equal(mapKeyboardIntent("x"), null);
    assert.equal(mapKeyboardIntent("Escape"), null);
    assert.equal(mapKeyboardIntent("Tab"), null);
});

test("save and load shortcuts use modifier keys without stealing plain typing", () => {
    assert.deepEqual(mapModifiedKeyboardIntent("s", { ctrlKey: true }), { save: true });
    assert.deepEqual(mapModifiedKeyboardIntent("O", { metaKey: true }), { load: true });
    assert.equal(mapModifiedKeyboardIntent("s", {}), null);
    assert.equal(mapModifiedKeyboardIntent("o", { ctrlKey: true, altKey: true }), null);
    assert.equal(mapModifiedKeyboardIntent("x", { ctrlKey: true }), null);
});

test("text entry targets never receive map keyboard controls", () => {
    assert.equal(isTextEntryTarget({ tagName: "INPUT" }), true);
    assert.equal(isTextEntryTarget({ tagName: "TEXTAREA" }), true);
    assert.equal(isTextEntryTarget({ tagName: "SELECT" }), true);
    assert.equal(isTextEntryTarget({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(isTextEntryTarget({ tagName: "BUTTON" }), false);
    assert.equal(isTextEntryTarget(null), false);
});

test("focused controls never double-fire with card placement", () => {
    assert.equal(isInteractiveTarget({ tagName: "BUTTON" }), true);
    assert.equal(isInteractiveTarget({ tagName: "A" }), true);
    assert.equal(isInteractiveTarget({ tagName: "DIV", getAttribute: () => "button" }), true);
    assert.equal(isInteractiveTarget({ tagName: "INPUT" }), true);
    assert.equal(isInteractiveTarget({ tagName: "MAIN", getAttribute: () => null }), false);
    assert.equal(isInteractiveTarget(null), false);
});
