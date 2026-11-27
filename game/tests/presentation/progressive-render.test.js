import test from "node:test";
import assert from "node:assert/strict";
import { renderProgressive } from "../../js/presentation/progressive-render.js";

function harness(partRoots = []) {
  const frames = [];
  const roots = [...partRoots];
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame
  };
  globalThis.window = {};
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "template");
      return { innerHTML: "", content: { childNodes: roots.shift() || [], querySelector: () => null } };
    }
  };
  globalThis.requestAnimationFrame = callback => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  const container = {
    isConnected: true,
    scrollTop: 0,
    children: [],
    replaceChildren() { this.children.length = 0; },
    querySelector: () => null,
    appendChild(child) { this.children.push(child); }
  };
  return {
    container,
    frames,
    drain() {
      let guard = 0;
      while (frames.length && guard++ < 1000) frames.shift()();
      assert.ok(guard < 1000, "the scheduler must terminate");
    },
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  };
}

function element(className) {
  const children = [];
  return {
    nodeType: 1,
    className,
    childNodes: children,
    matches(selector) { return selector === "." + className; },
    querySelectorAll() { return { length: children.length }; },
    cloneNode() { return element(className); },
    appendChild(child) { children.push(child); }
  };
}

test("part thunks, html descriptors and continuations all stay in one bounded run", () => {
  const h = harness();
  try {
    let generated = 0;
    const parts = [
      () => ({
        html: () => { generated++; return ""; },
        more: [() => { generated++; return ""; }, { html: () => { generated++; return ""; } }]
      }),
      () => { generated++; return ""; },
      { html: () => { generated++; return ""; } }
    ];
    let stats = null;
    renderProgressive(h.container, parts, { onDone: result => { stats = result; } });
    h.drain();

    assert.equal(generated, 5, "every original and continued part is generated once");
    assert.equal(parts.length, 5, "continuations are inserted into the live part list");
    assert.equal(stats.parts, 5);
    assert.equal(globalThis.window.__progressiveTiming.parts, 5);
    assert.ok(stats.prepareMs >= 0);
    assert.ok(stats.maxPartMs >= 0);
    assert.equal(stats.maxTaskMs, Math.max(stats.maxChunkMs, stats.maxPartMs));
    assert.ok(stats.totalMs >= stats.prepareMs);
  } finally {
    h.restore();
  }
});

test("an empty html result can still publish a continuation without parsing", () => {
  const h = harness();
  try {
    let continued = false;
    const parts = [() => ({ html: "", more: [() => { continued = true; return ""; }] })];
    let stats = null;
    renderProgressive(h.container, parts, { onDone: result => { stats = result; } });
    h.drain();
    assert.equal(continued, true);
    assert.equal(stats.parts, 2);
    assert.equal(stats.mountedNodes, 0);
  } finally {
    h.restore();
  }
});

test("a queued shell registers as the target before its rows are generated", () => {
  const shell = element("shell");
  const row = element("row");
  const h = harness([[shell], [row]]);
  try {
    let stats = null;
    renderProgressive(h.container, [
      { html: '<div class="shell"></div>' },
      { into: ".shell", html: '<b>row</b>' }
    ], { onDone: result => { stats = result; } });
    h.drain();

    assert.equal(h.container.children.length, 1);
    assert.equal(h.container.children[0], shell);
    assert.deepEqual(shell.childNodes, [row]);
    assert.equal(stats.complete ?? true, true);
  } finally {
    h.restore();
  }
});

test("a nested row target is registered before the rows that fill it", () => {
  const shell = element("shell");
  const group = element("group");
  const rows = element("rows");
  const row = element("row");
  group.appendChild(rows);
  const h = harness([[shell], [group], [row]]);
  try {
    renderProgressive(h.container, [
      { html: '<div class="shell"></div>' },
      { into: ".shell", html: '<div class="group"><div class="rows"></div></div>' },
      { into: ".rows", html: '<b>row</b>' }
    ]);
    h.drain();

    assert.equal(h.container.children.length, 1);
    assert.deepEqual(shell.childNodes, [group]);
    assert.deepEqual(rows.childNodes, [row]);
  } finally {
    h.restore();
  }
});
