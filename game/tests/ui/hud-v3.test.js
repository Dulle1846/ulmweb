import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,hud,ui,world,entities,renderer,favicon]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/hud-v3.css",root),"utf8"),
  readFile(new URL("js/presentation/rendering/ui.js",root),"utf8"),
  readFile(new URL("js/world/world.js",root),"utf8"),
  readFile(new URL("js/presentation/rendering/entities.js",root),"utf8"),
  readFile(new URL("js/presentation/rendering/renderer.js",root),"utf8"),
  readFile(new URL("assets/favicon.svg",root),"utf8")
]);

test("HUD 3.8 layer loads after every legacy and component stylesheet",()=>{
  const components=html.indexOf('href="css/ui-components.css"');
  const hudIndex=html.indexOf('href="css/hud-v3.css"');
  assert.ok(components>=0,"shared component layer must remain loaded");
  assert.ok(hudIndex>components,"the HUD layout layer must win the cascade");
  assert.ok(!html.includes('href="css/hud-v3.css"\n    <link rel="stylesheet" href="css/ui-design-system.css"'),"the HUD layer must not load before the design system");
});

test("the banner header is a two-row royal grid with a resource ledger",()=>{
  assert.ok(hud.includes('"brand middle resources"'));
  assert.ok(hud.includes('"actions actions actions"'));
  assert.ok(hud.includes(".topbar{"));
  assert.ok(hud.includes("grid-template-areas"));
  for(const key of ["wood","stone","gold","food"]){
    assert.ok(html.includes('data-resource-income="'+key+'"'),"missing income mirror for "+key);
  }
  assert.ok(ui.includes('document.querySelectorAll("[data-resource-income]")'),"income mirrors must be driven by live simulation flow");
  assert.ok(ui.includes("node.textContent=income(value)"),"income mirrors must reuse the rounded flow formatter");
  assert.ok(ui.includes("Math.round(value*10)/10"),"flow values must not leak raw floating point digits into the HUD");
  assert.ok(hud.includes(".resource-delta.is-positive"));
  assert.ok(hud.includes(".resource-delta.is-negative"));
});

test("administration rail reserves readable width for every label",()=>{
  assert.ok(hud.includes("--hud-rail-width:96px"));
  assert.ok(hud.includes(".realm-nav-button span{"));
  assert.ok(hud.includes("white-space:nowrap"));
  assert.ok(hud.includes("overflow-y:auto"));
  assert.ok(html.includes('class="realm-nav-divider"'));
});

test("the hand renders five explicit slots and an honest empty state",()=>{
  assert.ok(ui.includes("const HAND_SLOTS=5"));
  assert.ok(ui.includes("SLOT_NUMERALS"));
  assert.ok(ui.includes("emptySlotMarkup(index)"));
  assert.ok(ui.includes('class="hand-slot"'));
  assert.ok(hud.includes(".card-hand{"));
  assert.ok(hud.includes("repeat(5,minmax(0,1fr))"),"the dock must reserve five equal slots");
  assert.ok(hud.includes(".hand-slot{"));
  assert.ok(hud.includes(".hand-slot-label"));
  assert.ok(ui.includes('setText("hand-count",state.hand.length+" / "+HAND_SLOTS)'));
  assert.ok(ui.includes('classList.toggle("is-empty",state.hand.length===0)'));
});

test("the card inspector shows a real empty state instead of a PLAY ribbon",()=>{
  assert.ok(html.includes('id="card-container" class="card-container is-empty"'));
  assert.ok(html.includes('class="card-empty-state"'));
  assert.ok(html.includes("No card selected"));
  assert.ok(hud.includes(".card-container.is-empty .card-play-tag{display:none}"));
  assert.ok(hud.includes(".card-container.is-empty .card-empty-state{display:grid}"));
  assert.ok(ui.includes('cardPanel?.classList.add("is-empty")'));
  assert.ok(ui.includes('cardPanel?.classList.remove("is-empty")'));
  assert.ok(ui.includes("NO CARD SELECTED"));
});

test("the minimap is docked above the hand and cannot overlap it",()=>{
  assert.ok(hud.includes("--hud-dock-height"));
  assert.ok(hud.includes("bottom:calc(var(--hud-dock-height) + 16px)"));
  assert.ok(hud.includes(".stage-compass{"));
  assert.ok(html.includes('class="stage-grain"'));
  assert.ok(html.includes('class="stage-compass"'));
});

test("terrain gains hillshade, coastal shading and water depth without per-frame work",()=>{
  assert.ok(world.includes("hillshade"));
  assert.ok(world.includes("terrainHeight(px - 1, py, h)"));
  assert.ok(world.includes("waterTone"));
  assert.ok(world.includes("const coast ="));
  assert.ok(world.includes("function clampByte"));
  assert.ok(world.includes("prerenderTerrain"),"shading must be baked during prerender");
});

test("every building type draws its own roof silhouette",()=>{
  assert.ok(entities.includes("function drawRoofDetail"));
  assert.ok(entities.includes("function drawBuildingLevel2"));
  for(const type of ["KEEP","HOUSE","FARM","LUMBER","QUARRY","GOLDMINE","TEMPLE","TOWER","WALL","MILL","WONDER","BARREL","TAVERN","BARRACKS","STABLE"]){
    assert.ok(entities.includes("case TYPE."+type),"missing roof detail for "+type);
  }
  assert.ok(entities.includes("const detail = Math.max(0, Math.min(1"),"detail must fade out on tiny footprints");
});

test("the duplicate canvas zoom indicator is gone while HTML zoom controls remain",()=>{
  assert.ok(!renderer.includes("drawZoomIndicator"));
  assert.ok(!renderer.includes("zoom.toFixed(2)"));
  assert.ok(html.includes('data-zoom-level="1"'));
  assert.ok(html.includes('id="zoom-level-name"'));
  assert.ok(html.includes('id="zoom-value"'));
});

test("a locally bundled favicon replaces the missing browser icon request",()=>{
  assert.ok(html.includes('rel="icon"'));
  assert.ok(html.includes('href="assets/favicon.svg"'));
  assert.ok(favicon.includes("<svg"));
  assert.ok(favicon.includes('xmlns="http://www.w3.org/2000/svg"'),"the SVG namespace is required");
  assert.ok(!/href\s*=\s*"https?:/.test(favicon),"the favicon must not load an external resource");
});

test("the hidden contract actually hides conditional controls",()=>{
  assert.ok(hud.includes(".hidden{display:none !important}"),"a global hidden rule is required for conditional controls");
  assert.ok(html.includes('id="road-build-cancel" class="control-button hidden"'));
  assert.ok(html.includes('id="build-modal" class="screen-overlay build-overlay hidden"'));
});

test("the founding plate becomes a two-column illuminated screen on desktop",()=>{
  assert.ok(hud.includes("@media(min-width:1000px) and (min-height:740px)"));
  assert.ok(hud.includes('grid-template-areas:\n      "emblem form"'));
  assert.ok(hud.includes(".start-panel .start-form{"));
  assert.ok(hud.includes("max-height:calc(100vh - 76px)"));
  assert.ok(hud.includes(".world-forge{display:grid;grid-template-columns:1fr 1fr;"));
});
