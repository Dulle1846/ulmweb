import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,css,cardCss,ui,management,dossier,main]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/ui-design-system.css",root),"utf8"),
  readFile(new URL("css/medieval.css",root),"utf8"),
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


test("active realm issues can be dismissed without resolving and reopened from the chronicle",()=>{
  assert.ok(html.includes('id="realm-event-dismiss"'));
  assert.ok(html.includes('aria-labelledby="realm-event-title"'));
  assert.ok(html.includes('aria-describedby="realm-event-description"'));
  assert.ok(main.includes('state.activeEvent.dismissed=true'));
  assert.ok(ui.includes("if(issue.dismissed)"));
  assert.ok(management.includes("state.activeEvent.dismissed=false"));
  assert.ok(management.includes('data-command="show-active-event"'));
});


test("original royal portrait sprite is wired into roster, dossiers and dynasty cards",async()=>{
  const portraits=await readFile(new URL("assets/royal-portraits.svg",root),"utf8");
  for(const id of ["portrait-king","portrait-queen","portrait-nobleman","portrait-noblewoman","portrait-scholar","portrait-knight","portrait-villager"]){
    assert.ok(portraits.includes('id="'+id+'"'),"missing original portrait symbol "+id);
  }
  assert.ok(dossier.includes("portraitSymbol(entity)"));
  assert.ok(dossier.includes("assets/royal-portraits.svg#"));
  assert.ok(dossier.includes("person-list-portrait"));
  assert.ok(dossier.includes("dossier-portrait"));
  assert.ok(management.includes("assets/royal-portraits.svg#"));
  assert.ok(management.includes("dynasty-person-portrait"));
});

test("character relationship links navigate to real dossiers and dynasty uses verified collateral kin",()=>{
  assert.ok(dossier.includes("dossier-related-person"));
  assert.ok(dossier.includes('getElementById("person-dossier")?.addEventListener("click"'));
  assert.ok(management.includes("rootFamily.parents"));
  assert.ok(management.includes("rootFamily.siblings"));
  assert.ok(management.includes("getFamilySnapshot(auntId)?.children"));
  assert.ok(management.includes("No cousin links can be verified"));
});

test("building register uses existing illustrated building sprites",()=>{
  assert.ok(management.includes("buildingSprite(building.type)"));
  assert.ok(management.includes("assets/royal-building-atlas.svg#"));
  assert.ok(css.includes(".building-record-art"));
});

test("original royal building atlas covers every building type with dedicated art",async()=>{
  const atlas=await readFile(new URL("assets/royal-building-atlas.svg",root),"utf8");
  for(const id of ["keep","cottage","farm","lumber-yard","quarry","watchtower","wall","tavern","temple","barracks","windmill","stable","wonder","goldmine","storehouse"]){
    assert.ok(atlas.includes('id="'+id+'"'),"missing dedicated building illustration "+id);
  }
  assert.ok(management.includes("assets/royal-building-atlas.svg#"));
  assert.ok(management.includes('[TYPE.KEEP]:"keep"'));
  assert.ok(management.includes('[TYPE.WONDER]:"wonder"'));
});

test("main menu uses the original muted royal title illustration",async()=>{
  const art=await readFile(new URL("assets/royal-title-illustration.svg",root),"utf8");
  assert.ok(art.includes("The Crownlands at dusk"));
  assert.ok(html.includes('src="assets/royal-title-illustration.svg"'));
  assert.ok(!html.includes('src="assets/kingdom-illustration.svg"'));
  assert.ok(css.includes(".start-hero-art{display:block"));
});

test("card hand uses the original royal illustration atlas without emoji duplication",async()=>{
 const atlas=await readFile(new URL("assets/royal-card-atlas.svg",root),"utf8");
 for(const id of ["card-settlement","card-agriculture","card-industry","card-defense","card-military","card-nature","card-people","card-court","card-travel","card-magic","card-event","card-law","card-maritime","card-knowledge","card-faith","card-diplomacy","card-culture","card-monster","card-relic","card-weather","card-cuisine","card-communication","card-architecture","card-craft","card-husbandry","card-trade","card-engineering","card-medicine","card-mysteries"]){
  assert.ok(atlas.includes('id="'+id+'"'),"missing card illustration "+id);
 }
 assert.ok(ui.includes("assets/royal-card-atlas.svg#"));
 assert.ok(!ui.includes("esc(card.icon)"));
});

test("card frames use the restrained royal frame asset and rarity treatments",async()=>{
 const frame=await readFile(new URL("assets/royal-card-frame.svg",root),"utf8");
 assert.ok(frame.includes('viewBox="0 0 132 176"'));
 assert.ok(cardCss.includes("royal-card-frame.svg"));
 assert.ok(cardCss.includes(".rarity-legendary"));
});

test("dragon dossiers use original art for every persisted life stage",async()=>{
 const atlas=await readFile(new URL("assets/royal-dragon-atlas.svg",root),"utf8");
 for(const stage of ["hatchling","juvenile","adult","elder","ancient"])assert.ok(atlas.includes('id="dragon-'+stage+'"'));
 assert.ok(management.includes("assets/royal-dragon-atlas.svg#"));
 assert.ok(management.includes('dragonPortraitSymbol(d.lifeStage)'));
 assert.ok(management.includes("data-life-stage="));
});

test("reusable royal control primitives define variants, states, panels and tooltips",async()=>{
 const components=await readFile(new URL("css/ui-components.css",root),"utf8");
 for(const token of [".ui-button{",".ui-button--primary",".ui-button--secondary",".ui-button--tab",".ui-button--icon",":disabled",".ui-button:focus-visible",".ui-button[aria-pressed=",".ui-panel{",".ui-panel__header","[data-ui-tooltip]::after","prefers-reduced-motion"]){
  assert.ok(components.includes(token),"missing reusable UI primitive "+token);
 }
 assert.ok(html.includes('href="css/ui-components.css"'));
 assert.ok(html.includes('class="ui-button ui-button--primary primary-button"'));
 assert.ok(html.includes('class="ui-panel ui-window ui-window--large modal-panel command-panel"'));
 assert.ok(html.includes('data-ui-tooltip="Open character dossiers"'));
});

test("all principal overlays use the shared window sizing and scroll primitives",async()=>{
 const windowCss=await readFile(new URL("css/ui-components.css",root),"utf8");
 for(const size of ["ui-window--small","ui-window--medium","ui-window--large","ui-window--founding"])assert.ok(windowCss.includes("."+size));
 for(const part of [".ui-window{",".ui-window__header{",".ui-window__body{",".ui-window__footer{","@media(max-height:700px)"])assert.ok(windowCss.includes(part));
 for(const id of ["settings-panel","people-panel","command-panel","build-panel","event-panel"]){
  assert.ok(html.includes("ui-window "+(id==="settings-panel"?"ui-window--small":id==="build-panel"||id==="event-panel"?"ui-window--medium":"ui-window--large"))||html.includes("ui-window ui-window--"+(id==="settings-panel"?"small":id==="build-panel"||id==="event-panel"?"medium":"large")));
 }
 assert.ok(html.includes('class="ui-window__body people-browser"'));
 assert.ok(html.includes('class="ui-window__body command-panel-content"'));
});

test("character roster filters are data-driven and expose living, role and species selectors",async()=>{
 const html=await readFile(new URL("index.html",root),"utf8");
 const dossier=await readFile(new URL("js/presentation/character-dossier.js",root),"utf8");
 const css=await readFile(new URL("css/medieval.css",root),"utf8");
 for(const id of ["people-status-filter","people-role-filter","people-species-filter"])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(dossier.includes("syncPeopleFilterOptions(all)"));
 assert.ok(dossier.includes('data-person-status='));
 assert.ok(dossier.includes('data-person-role='));
 assert.ok(dossier.includes('data-person-species='));
 assert.ok(css.includes(".people-filter-grid"));
});


test("royal administration navigation exposes current-page semantics, not toggle semantics",()=>{
  assert.ok(management.includes('button.setAttribute("aria-current","page")'));
  assert.ok(management.includes('button.removeAttribute("aria-current")'));
  assert.ok(!management.includes('button.setAttribute("aria-pressed"'),"navigation links must not be announced as toggle buttons");
  for(const target of ["kingdom","government","people","dynasty","chronicle","politics","economy","buildings","cards","creatures","build","settings"]){
    assert.ok(html.includes('data-kac-panel="'+target+'"'),"missing navigation target "+target);
  }
});
