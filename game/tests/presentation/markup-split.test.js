import test from "node:test";
import assert from "node:assert/strict";
import { splitMarkupForStagedRender } from "../../js/presentation/management-ui.js";

test("top-level sections are split without changing a single byte", () => {
  const html = '<div class="a" data-note="a &gt; b"><span>one</span></div>' +
    '<article><p>two</p><input value="x>y"></article>' +
    '<svg viewBox="0 0 2 2"><use href="assets/a.svg#b"></use></svg>' +
    '<!-- keep me --><p data-quote="a \' b">three</p>tail';
  const parts = splitMarkupForStagedRender(html);
  assert.ok(parts.length >= 5, `expected several sections, got ${parts.length}`);
  assert.equal(parts.join(""), html);
  assert.ok(parts.every(part => part.length > 0));
});

test("empty and whitespace-only renderers stay empty", () => {
  assert.deepEqual(splitMarkupForStagedRender(""), []);
  assert.equal(splitMarkupForStagedRender("   ").join(""), "   ");
});

test("nested tag depth is respected inside one section", () => {
  const html = '<section><div><div><button data-value="a>b">OK</button></div></div></section><p>after</p>';
  const parts = splitMarkupForStagedRender(html);
  assert.equal(parts.length, 2);
  assert.equal(parts.join(""), html);
});
