import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,css,main,modal]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/ui-design-system.css",root),"utf8"),
  readFile(new URL("js/app/main.js",root),"utf8"),
  readFile(new URL("js/presentation/modal-accessibility.js",root),"utf8")
]);

test("all full-screen overlays expose accessible modal names",()=>{
  assert.match(html,/<div id="start-screen"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="start-title"/);
  assert.match(html,/<div id="settings-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="settings-title"/);
  for(const id of ["people-modal","realm-event-modal","command-modal","big-message","build-modal"]){
    const start=html.indexOf('id="'+id+'"');
    assert.ok(start>=0,"missing modal "+id);
    const tag=html.slice(start,html.indexOf(">",start)+1);
    assert.ok(tag.includes('role="dialog"')&&tag.includes('aria-modal="true"'),id+" must expose dialog semantics");
    assert.ok(tag.includes("aria-labelledby="),id+" must have an accessible name");
  }
});

test("modal focus manager traps tab navigation and restores the opener",()=>{
  assert.ok(main.includes('setupModalAccessibility();'));
  assert.ok(modal.includes("new MutationObserver"));
  assert.ok(modal.includes('event.key!=="Tab"'));
  assert.ok(modal.includes("event.shiftKey"));
  assert.ok(modal.includes("entry.opener.focus"));
  assert.ok(modal.includes("focusInside(next)"));
  assert.ok(modal.includes("focusFallback"));
  assert.ok(html.includes('id="main-container" class="game-layout" tabindex="-1"'));
});

test("dialog layout remains scrollable and usable on narrow and short screens",()=>{
  assert.ok(css.includes("body.ui-modal-open{overflow:hidden}"));
  assert.ok(css.includes("max-height:calc(100dvh - 24px)"));
  assert.ok(css.includes("@media(max-width:720px)"));
  assert.ok(css.includes("@media(max-height:700px)"));
  assert.ok(css.includes("overscroll-behavior:contain"));
});
