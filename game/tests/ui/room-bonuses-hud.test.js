import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [html, css, ui, rooms] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("css/hud-v3.css", root), "utf8"),
    readFile(new URL("js/presentation/rendering/ui.js", root), "utf8"),
    readFile(new URL("js/systems/rooms.js", root), "utf8"),
]);

test("the royal HUD exposes room bonuses and their source rooms", () => {
    for (const id of ["room-bonus-section", "room-bonus-status", "room-bonus-grid", "room-bonus-rooms"]) {
        assert.ok(html.includes('id="' + id + '"'), "missing room bonus HUD element " + id);
    }
    assert.ok(css.includes(".room-bonus-grid"));
    assert.ok(css.includes(".room-bonus-room.is-warning"));
    assert.ok(ui.includes("renderRoomBonuses()"));
    assert.ok(ui.includes("ROOM BONUSES · EVERY 20 DAYS"));
    assert.ok(ui.includes("getRoomBonusSnapshot"));
    assert.ok(rooms.includes("ROOM_BONUS_INTERVAL = 20"));
    assert.ok(rooms.includes("applyRoomBonuses"));
});
