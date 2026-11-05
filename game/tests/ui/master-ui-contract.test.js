import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,css,ui,management,dossier,main]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/ui-design-system.css",root),"utf8"),
  readFile(new URL("js/presentation/rendering/ui.js",root),"utf8"),
  readFile(new URL("js/presentation/management-ui.js",root),"utf8"),
  readFile(new URL("js/presentation/character-dossier.js",root),"utf8"),
  readFile(new URL("js/app/main.js",root),"utf8")
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
  const supported=new Set(["kingdom","government","people","dynasty","chronicle","politics","economy","buildings","cards","creatures","build","settings"]);
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

test("pre-campaign UI does not present placeholder stores as live values",()=>{
  for(const key of ["wood","stone","gold","food"])assert.ok(html.includes('data-resource-value="'+key+'">—'));
  assert.ok(html.includes("data-population>—"));
  assert.ok(management.includes("if(!state.hasStarted)"),"kingdom overview must distinguish an unfounded realm from a running campaign");
});


test("contextual action dock exposes only wired, existing game actions",()=>{
  for(const action of ["people","dynasty","cards","events","save"]){
    assert.ok(html.includes('data-kac-dock-action="'+action+'"'),"missing dock action "+action);
  }
  assert.ok(management.includes('action==="people"'));
  assert.ok(management.includes('action==="dynasty"'));
  assert.ok(management.includes('action==="cards"'));
  assert.ok(management.includes('action==="events"'));
  assert.ok(management.includes('action==="save"'));
});

test("dynasty view follows explicit kinship links and limits rendered depth",()=>{
  assert.ok(management.includes('import { getFamilySnapshot } from "../systems/families.js"'));
  assert.ok(management.includes("getFamilySnapshot(id)"),"tree must read the authoritative kinship graph");
  assert.ok(management.includes("depth<4"),"tree must cap depth to avoid unbounded DOM growth");
  assert.ok(management.includes('data-open-person="'),"family cards must expose a person id for dossier navigation");
  assert.ok(management.includes('window.dispatchEvent(new CustomEvent("kac:open-person"'));
  assert.ok(dossier.includes('window.addEventListener("kac:open-person"'));
});

test("save status reflects actual save/load outcomes, not an autosave promise",()=>{
  assert.ok(html.includes('id="save-status"'));
  assert.ok(main.includes('setSaveStatus("LAST SAVED'));
  assert.ok(main.includes('setSaveStatus("SAVE FAILED'));
  assert.ok(main.includes('setSaveStatus("LOADED'));
  assert.ok(!html.toLowerCase().includes("autosave"));
});


test("economy panel distinguishes stock, current-tick flow and the actual latest ledger",()=>{
  assert.ok(management.includes("state.incomeThisTick"));
  assert.ok(management.includes("state.economy?.lastLedger"));
  assert.ok(management.includes("daysElapsed"));
  assert.ok(management.includes("latest completed ledger"));
  assert.ok(management.includes("historical time series"));
  assert.ok(management.includes("No forecasts are inferred"));
});

test("building register uses live entities, staffing, footprint and site data without inventing output",()=>{
  assert.ok(html.includes('data-kac-panel="buildings"'));
  assert.ok(html.includes('data-command-tab="buildings"'));
  assert.ok(management.includes('state.entities.filter(entity=>!entity.dead&&entity.isBuilding())'));
  assert.ok(management.includes("getBuildingEfficiency(building,workforce)"));
  assert.ok(management.includes("BUILDING_SIZE[building.type]"));
  assert.ok(management.includes("getResourceNodeAt(building.x,building.y)"));
  assert.ok(management.includes("Per-building production output, storage and upkeep are not currently exposed"));
  assert.ok(management.includes('id="building-search"'));
});


test("creature dossiers use actual living and memorial records",()=>{
  assert.ok(management.includes("getCreatureSnapshot()"));
  assert.ok(management.includes("d.memories"));
  assert.ok(management.includes("d.abilities"));
  assert.ok(management.includes("d.goals"));
  assert.ok(management.includes("c.archive"));
  assert.ok(management.includes('assets/dragon-companion.svg'));
  assert.ok(management.includes("CREATURE MEMORIALS"));
});

test("chronicle inbox uses stored event log data and opens the existing active issue",()=>{
  assert.ok(html.includes('data-kac-panel="chronicle"'));
  assert.ok(html.includes('data-command-tab="chronicle"'));
  assert.ok(management.includes("state.eventLog"));
  assert.ok(management.includes("entry.tick"));
  assert.ok(management.includes("entry.kind"));
  assert.ok(management.includes('id="chronicle-search"'));
  assert.ok(management.includes('id="chronicle-kind-filter"'));
  assert.ok(management.includes('data-command="show-active-event"'));
  assert.ok(management.includes("renderUI()"));
  assert.ok(management.includes("does not claim unread tracking"));
  assert.ok(!main.includes("command-chronicles-btn"),"obsolete chronicle-to-people shortcut must be removed");
});
