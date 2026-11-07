import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,hud,ui,world,entities,renderer,favicon,terrainModel,management]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/hud-v3.css",root),"utf8"),
  readFile(new URL("js/presentation/rendering/ui.js",root),"utf8"),
  readFile(new URL("js/world/world.js",root),"utf8"),
  readFile(new URL("js/presentation/rendering/entities.js",root),"utf8"),
  readFile(new URL("js/presentation/rendering/renderer.js",root),"utf8"),
  readFile(new URL("assets/favicon.svg",root),"utf8"),
  readFile(new URL("js/world/terrain-model.js",root),"utf8"),
  readFile(new URL("js/presentation/management-ui.js",root),"utf8")
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

test("short desktop windows compact the rail so every destination stays visible",()=>{
  assert.ok(hud.includes("@media(max-height:800px) and (min-width:901px)"));
  assert.ok(hud.includes(".realm-nav-button{min-height:36px"));
});

test("the card hotbar is gone and cards are drawn only on request",()=>{
  assert.equal(html.includes('id="hand-dock"'),false,"the permanent hand hotbar must not exist");
  assert.equal(html.includes('id="card-hand"'),false);
  assert.equal(ui.includes("renderHand"),false,"the UI must not render a hand dock");
  assert.ok(management.includes('data-command="draw-card"'),"the deck panel must offer an explicit draw action");
  assert.ok(management.includes("drawPlayerCard"),"the draw action must go through the on-demand draw helper");
  assert.ok(management.includes('data-command="select-card"'));
  assert.ok(html.includes("DRAW IN THE CARDS TAB"));
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

test("the minimap and compass sit in the stage corner without reserving hand space",()=>{
  assert.ok(hud.includes(".minimap-frame{"));
  assert.ok(hud.includes("Hand hotbar removed"),"the removed dock must hand its space back to the stage");
  assert.ok(hud.includes(".stage-compass{bottom:18px}"));
  assert.ok(hud.includes(".minimap-frame{bottom:16px}"));
  assert.ok(html.includes('class="stage-grain"'));
  assert.ok(html.includes('class="stage-compass"'));
});

test("terrain gains hillshade, coastal shading and water depth without per-frame work",()=>{
  assert.ok(world.includes("hillshade"));
  assert.ok(world.includes("terrainHeight(px - 1, py, h)"));
  assert.ok(terrainModel.includes("waterDeep"),"deep water palette must exist");
  assert.ok(terrainModel.includes("const shore"),"coastal shading must blend into the water");
  assert.ok(terrainModel.includes("P.foam"),"shore foam must be part of the baked colour field");
  assert.ok(terrainModel.includes("carveWaterFeatures"),"rivers and lakes come from the shared terrain model");
  assert.ok(world.includes("prerenderTerrain"),"shading must be baked during prerender");
  assert.ok(world.includes("state.temperatureMap"),"climate must feed the baked colour field");
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

test("the founding plate never traps the form on short or narrow screens",()=>{
  assert.ok(hud.includes("#start-screen{"),"the overlay must own the founding scroll");
  assert.ok(hud.includes("overflow-y:auto;overflow-x:hidden"),"the overlay scrolls the plate");
  assert.ok(hud.includes("#start-screen>.ui-window.start-panel{"),"the plate must be allowed to grow past the viewport");
  assert.ok(hud.includes("max-height:none"),"a capped plate clips the founding button");
  assert.ok(!hud.includes("min-height:740px"),"height must not gate the two-column layout");
  assert.ok(hud.includes("@media(min-width:960px)"),"the plate splits into two columns from 960px");
  assert.ok(hud.includes("@media(max-height:760px)"),"short windows get a compact plate");
  assert.ok(hud.includes('grid-template-areas:\n      "emblem form"'),"the two-column map must survive");
  assert.ok(hud.includes(".start-panel .start-form{"));
  assert.ok(hud.includes(".world-forge{display:grid;grid-template-columns:1fr 1fr;"));
});
