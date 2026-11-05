import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,css,ui,management]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/ui-design-system.css",root),"utf8"),
  readFile(new URL("js/presentation/rendering/ui.js",root),"utf8"),
  readFile(new URL("js/presentation/management-ui.js",root),"utf8")
]);

test("master UI stylesheet is loaded after the legacy visual layers",()=>{
  const legacy=html.indexOf('href="css/comic-strategy.css"');
  const design=html.indexOf('href="css/ui-design-system.css"');
  assert.ok(legacy>=0&&design>legacy,"design-system overrides must load after legacy styles");
});

test("the approved royal palette is represented by central design tokens",()=>{
  for(const token of [
    "--color-royal-dark:#24221f",
    "--color-dark-wood:#403326",
    "--color-parchment:#d8c6a0",
    "--color-light-parchment:#efe3c8",
    "--color-antique-gold:#b99a59",
    "--color-bronze:#80633f",
    "--color-royal-red:#762f35",
    "--color-deep-blue:#344b65"
  ])assert.ok(css.includes(token),"missing design token "+token);
});

test("every visible royal navigation action has a real handler",()=>{
  const targets=[...html.matchAll(/data-kac-panel="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(targets.length>=10,"expected the administration rail and resource shortcuts");
  const supported=new Set(["government","people","dynasty","politics","economy","cards","creatures","build","settings"]);
  for(const target of targets)assert.ok(supported.has(target),"unwired navigation target: "+target);
  for(const target of supported)assert.ok(html.includes('data-kac-panel="'+target+'"'),"missing visible navigation target: "+target);
  assert.ok(management.includes('addEventListener("click"'),"navigation must use real click handlers");
  assert.ok(management.includes('activePanel=target'),"management navigation must select the requested panel");
});

test("resource and population mirrors are synchronized from live simulation state",()=>{
  for(const key of ["wood","stone","gold","food"])assert.ok(html.includes('data-resource-value="'+key+'"'));
  assert.ok(ui.includes('querySelectorAll("[data-resource-value]")'));
  assert.ok(ui.includes('querySelectorAll("[data-population]")'));
});
