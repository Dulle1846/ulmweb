import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [html, css, ui, rooms, plan, workshopCss] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("css/hud-v3.css", root), "utf8"),
    readFile(new URL("js/presentation/rendering/ui.js", root), "utf8"),
    readFile(new URL("js/systems/rooms.js", root), "utf8"),
    readFile(new URL("js/presentation/plan-editor.js", root), "utf8"),
    readFile(new URL("css/world-workshop.css", root), "utf8"),
]);

test("the royal HUD exposes room bonuses and their source rooms", () => {
    for (const id of ["room-bonus-section", "room-bonus-status", "room-bonus-grid", "room-bonus-rooms", "building-bonus-status", "building-bonus-rooms", "building-bonus-furniture"]) {
        assert.ok(html.includes('id="' + id + '"'), "missing room bonus HUD element " + id);
    }
    assert.ok(css.includes(".room-bonus-grid"));
    assert.ok(css.includes(".room-bonus-room.is-warning"));
    assert.ok(ui.includes("renderRoomBonuses()"));
    assert.ok(ui.includes("ROOM BONUSES · EVERY 20 DAYS"));
    assert.ok(ui.includes("getRoomBonusSnapshot"));
    assert.ok(ui.includes("ROOM_BONUS_CAPS"));
    assert.ok(rooms.includes("ROOM_BONUS_INTERVAL = 20"));
    assert.ok(rooms.includes("applyRoomBonuses"));
    assert.ok(rooms.includes("FURNITURE_AFFINITY"));
});

test("the workshop shows per-room bonuses, furnishings and sealed rooms", () => {
    assert.ok(plan.includes("getBuildingRoomBreakdown"));
    assert.ok(plan.includes("setBuildingBonuses"));
    assert.ok(plan.includes("FURNISHED"));
    assert.ok(plan.includes("SEALED · NO BONUS"));
    assert.ok(workshopCss.includes(".building-bonus-rooms"));
    assert.ok(workshopCss.includes(".building-room-row"));
    assert.ok(workshopCss.includes(".building-room-effects span.is-furnished"));
    assert.ok(workshopCss.includes(".building-room-row.is-sealed"));
});
