import test from "node:test";
import assert from "node:assert/strict";
import {
  PANEL_TIMING_HISTORY_LIMIT,
  getPanelTimingSnapshot,
  recordPanelTiming,
  updatePanelTiming
} from "../../js/presentation/panel-timing.js";

function reset() {
  delete globalThis.__panelTiming;
  delete globalThis.__panelTimingHistory;
}

test("a panel activation publishes the legacy shape plus a bounded history", () => {
  reset();
  const seq = recordPanelTiming({ panel: "biome", renderMs: 12.34, staged: true });
  const current = globalThis.__panelTiming;

  assert.equal(current.panel, "biome");
  assert.equal(current.renderMs, 12.3);
  assert.equal(current.staged, true);
  assert.equal(current.parts, 0);
  assert.equal(current.prepareMs, 0);
  assert.equal(current.maxPartMs, 0);
  assert.equal(current.maxParseMs, 0);
  assert.equal(current.maxTaskMs, 0);
  assert.equal(current.complete, false);
  assert.equal(current.seq, seq);
  assert.ok(Array.isArray(current.history));
  assert.equal(current.history.length, 1);
  assert.equal(current.history[0].panel, "biome");
});

test("a staged completion updates the same entry instead of appending a second one", () => {
  reset();
  const seq = recordPanelTiming({ panel: "forest", renderMs: 8, staged: true, complete: false });
  assert.equal(updatePanelTiming(seq, { renderMs: 16.66, stages: 31, mountedNodes: 88, parts: 48, prepareMs: 21.25, maxChunkMs: 3.7, maxPartMs: 2.4, maxParseMs: 3.1, maxTaskMs: 3.7, totalMs: 96.4, complete: true }), true);

  const snapshot = getPanelTimingSnapshot();
  assert.equal(snapshot.history.length, 1, "a staged mount is one player-visible activation");
  assert.equal(snapshot.current.renderMs, 16.7);
  assert.equal(snapshot.current.stages, 31);
  assert.equal(snapshot.current.mountedNodes, 88);
  assert.equal(snapshot.current.parts, 48);
  assert.equal(snapshot.current.prepareMs, 21.3);
  assert.equal(snapshot.current.maxChunkMs, 3.7);
  assert.equal(snapshot.current.maxPartMs, 2.4);
  assert.equal(snapshot.current.maxParseMs, 3.1);
  assert.equal(snapshot.current.maxTaskMs, 3.7);
  assert.equal(snapshot.current.totalMs, 96.4);
  assert.equal(snapshot.current.complete, true);
  assert.equal(snapshot.history[0].complete, true);
});

test("a late completion cannot overwrite the newest activation", () => {
  reset();
  const first = recordPanelTiming({ panel: "forest", staged: true });
  const second = recordPanelTiming({ panel: "city", staged: true });
  updatePanelTiming(first, { complete: true, stages: 8 });
  assert.equal(globalThis.__panelTiming.panel, "city");
  assert.equal(globalThis.__panelTiming.seq, second);
  assert.equal(globalThis.__panelTimingHistory[0].complete, true);
  assert.equal(globalThis.__panelTimingHistory[1].complete, false);
});

test("history never grows past the fixed bound and stale updates are ignored", () => {
  reset();
  for (let i = 0; i < PANEL_TIMING_HISTORY_LIMIT + 12; i++) {
    recordPanelTiming({ panel: "panel-" + i, renderMs: i });
  }
  assert.equal(globalThis.__panelTiming.history.length, PANEL_TIMING_HISTORY_LIMIT);
  assert.equal(globalThis.__panelTiming.panel, "panel-" + (PANEL_TIMING_HISTORY_LIMIT + 11));
  assert.equal(updatePanelTiming(Number.MAX_SAFE_INTEGER, { complete: true }), false);
});

test("snapshots are copies so callers cannot mutate the live telemetry", () => {
  reset();
  recordPanelTiming({ panel: "government", renderMs: 4 });
  const snapshot = getPanelTimingSnapshot();
  snapshot.history[0].panel = "tampered";
  snapshot.current.renderMs = 999;
  assert.equal(globalThis.__panelTiming.panel, "government");
  assert.equal(globalThis.__panelTiming.renderMs, 4);
});
