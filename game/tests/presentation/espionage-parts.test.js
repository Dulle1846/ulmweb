import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { espionagePanel, espionageParts } from "../../js/presentation/management-ui.js";

function resolveParts(parts) {
  const queue = [...parts];
  let html = "";
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const part = queue.shift();
    const value = typeof part === "function" ? part() : part;
    const markup = typeof value === "string" ? value
      : typeof value?.html === "function" ? value.html() : value?.html || "";
    if (Array.isArray(value?.more)) queue.unshift(...value.more);
    if (!markup) continue;
    if (value?.into === ".spy-agent-list" || value?.into === ".spy-report-list") {
      const at = html.lastIndexOf('<div class="' + value.into.slice(1) + '">');
      assert.ok(at >= 0, "staged cards need an earlier list shell");
      const insertAt = at + '<div class="' + value.into.slice(1) + '">'.length;
      html = html.slice(0, insertAt) + markup + html.slice(insertAt);
    } else {
      html += markup;
    }
  }
  assert.ok(guard < 500, "the staged producer must terminate");
  return html;
}

test("staged espionage parts join to the exact plain panel markup", () => {
  resetState();
  state.hasStarted = true;
  state.resources = { wood: 40, stone: 40, gold: 120, food: 90 };
  state.entities = [];
  const staged = resolveParts(espionageParts());
  const plain = espionagePanel();
  if (staged !== plain) {
    let at = 0;
    while (at < Math.min(staged.length, plain.length) && staged[at] === plain[at]) at++;
    throw new Error(`first markup difference at ${at}: staged=${JSON.stringify(staged.slice(at, at + 180))} plain=${JSON.stringify(plain.slice(at, at + 180))}`);
  }
  assert.equal(staged, plain);
});
