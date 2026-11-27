import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { buildings, buildingsParts } from "../../js/presentation/management-ui.js";

function building(id, type) {
  return { id, type, x: 20, y: 20, hp: 100, maxHp: 100, dead: false, isBuilding: () => true };
}

function resolveParts(parts) {
  const queue = [...parts];
  let html = "";
  let insertAt = -1;
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const part = queue.shift();
    const value = typeof part === "function" ? part() : part;
    const markup = typeof value === "string" ? value
      : typeof value?.html === "function" ? value.html() : value?.html || "";
    if (Array.isArray(value?.more)) queue.unshift(...value.more);
    if (!markup) continue;
    const open = '<div class="building-register">';
    const shellAt = markup.indexOf(open);
    if (shellAt >= 0) insertAt = html.length + shellAt + open.length;
    if (value?.into === ".building-register") {
      assert.ok(insertAt >= 0, "register rows need an earlier register shell");
      html = html.slice(0, insertAt) + markup + html.slice(insertAt);
      insertAt += markup.length;
    } else {
      html += markup;
    }
  }
  assert.ok(guard < 500, "the staged producer must terminate");
  return html;
}

test("staged building parts join to the exact plain register markup", () => {
  resetState();
  state.hasStarted = true;
  state.entities = [building("b-keep", TYPE.KEEP), building("b-house", TYPE.HOUSE), building("b-farm", TYPE.FARM)];
  const staged = resolveParts(buildingsParts());
  const plain = buildings();
  if (staged !== plain) {
    let at = 0;
    while (at < Math.min(staged.length, plain.length) && staged[at] === plain[at]) at++;
    throw new Error(`first markup difference at ${at}: staged=${JSON.stringify(staged.slice(at, at + 180))} plain=${JSON.stringify(plain.slice(at, at + 180))}`);
  }
  assert.equal(staged, plain);
});
