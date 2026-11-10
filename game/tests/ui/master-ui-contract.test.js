import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,css,cardCss,ui,management,populationPanel,dossier,main,economy,renderer,hud]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/ui-design-system.css",root),"utf8"),
  readFile(new URL("css/medieval.css",root),"utf8"),
  readFile(new URL("js/presentation/rendering/ui.js",root),"utf8"),
  readFile(new URL("js/presentation/management-ui.js",root),"utf8"),
  readFile(new URL("js/presentation/population-panel.js",root),"utf8"),
  readFile(new URL("js/presentation/character-dossier.js",root),"utf8"),
  readFile(new URL("js/app/main.js",root),"utf8"),
  readFile(new URL("js/systems/economy.js",root),"utf8"),
  readFile(new URL("js/presentation/rendering/renderer.js",root),"utf8"),
  readFile(new URL("css/hud-v3.css",root),"utf8")
]);

test("master UI stylesheet is loaded after the legacy visual layers",()=>{
  const legacy=html.indexOf('href="css/comic-strategy.css"');
  const design=html.indexOf('href="css/ui-design-system.css"');
  assert.ok(legacy>=0&&design>legacy,"design-system overrides must load after legacy styles");
});

test("the smallest icon controls meet the WCAG 2.2 AA target size",()=>{
  assert.ok(css.includes("#help-btn{min-width:28px;min-height:28px}"));
  assert.ok(css.includes("#skip-card-btn{min-height:28px}"));
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
  const supported=new Set(["kingdom","government","people","dynasty","chronicle","politics","diplomacy","economy","resources","buildings","cards","creatures","build","settings"]);
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
  assert.ok(management.includes("state.economy?.history"));
  assert.ok(management.includes("treasuryCharts(history)"));
  assert.ok(economy.includes("ECONOMY_HISTORY_LIMIT"));
  assert.ok(economy.includes("totals.history.push"));
  assert.ok(economy.includes("netGold: Number(ledger.netGold)"));
});

test("the sovereign banner exposes identity, treasury trend and a live warning inbox",()=>{
  assert.ok(html.includes('id="ruler-dossier-btn"'));
  assert.ok(html.includes('id="ruler-portrait-use"'));
  assert.ok(html.includes('id="ruler-name"'));
  assert.ok(html.includes('id="treasury-trend"'));
  assert.ok(html.includes('id="warning-inbox-btn"'));
  assert.ok(html.includes('id="warning-count"'));
  assert.ok(ui.includes("getRoyalHouse"));
  assert.ok(ui.includes("renderTopStatus"));
  assert.ok(ui.includes("state.economy?.history"));
  assert.ok(ui.includes("warning-count"));
  assert.ok(dossier.includes("ruler-dossier-btn"));
  assert.ok(hud.includes(".ruler-status"));
  assert.ok(hud.includes(".warning-inbox"));
});

test("resource details expose real stocks, flows, related buildings and bounded history",()=>{
  assert.ok(html.includes('data-kac-panel="resources"'));
  assert.ok(html.includes('data-command-tab="resources"'));
  assert.ok(html.includes('id="map-layer-select"'));
  assert.ok(management.includes("function resources()"));
  assert.ok(management.includes("function resourceCard("));
  assert.ok(management.includes("RESOURCE_ORDER"));
  assert.ok(management.includes("state.economy?.history"));
  assert.ok(management.includes("At least two completed settlements"));
  assert.ok(management.includes("Latest settlement:"));
  assert.ok(hud.includes(".resource-detail-grid"));
  assert.ok(hud.includes(".command-trend"));
});

test("diplomacy exposes persistent neighbours, treaties and trade consequences",()=>{
  assert.ok(html.includes('data-command-tab="diplomacy"'));
  assert.ok(html.includes('data-kac-panel="diplomacy"'));
  assert.ok(management.includes("function diplomacy()"));
  assert.ok(management.includes("data-diplomacy-realm"));
  assert.ok(management.includes('data-command="diplomacy-gift"'));
  assert.ok(management.includes('data-command="diplomacy-pact"'));
  assert.ok(management.includes('data-command="diplomacy-alliance"'));
  assert.ok(management.includes('data-command="diplomacy-war"'));
  assert.ok(management.includes('data-command="diplomacy-peace"'));
  assert.ok(main.includes("normalizeDiplomacySnapshot(snapshot.diplomacy)"));
  assert.ok(main.includes("diplomacy:JSON.parse(JSON.stringify(state.diplomacy"));
});

test("the population panel explains a stalled growth gate and its recovery hint",()=>{
  assert.ok(populationPanel.includes("population-growth-gate"));
  assert.ok(populationPanel.includes("GROWTH GATE · BLOCKED"));
  assert.ok(populationPanel.includes("Local safety is too low"));
  assert.ok(populationPanel.includes("Build a watchtower covering occupied homes."));
  assert.ok(populationPanel.includes("getPopulationGrowthGate"));
});

test("map layer selector and legend are wired to real geography overlays",()=>{
  assert.ok(html.includes('id="map-layer-select"'));
  assert.ok(html.includes('id="map-layer-legend"'));
  assert.ok(renderer.includes("drawMapLayer"));
  assert.ok(renderer.includes("getResourceNodeAt"));
  assert.ok(renderer.includes("state.mapLayer"));
  assert.ok(ui.includes("MAP_LAYER_LEGENDS"));
  assert.ok(ui.includes("setupMapViewControls"));
  assert.ok(hud.includes(".map-layer-legend"));
});

test("settings expose local save slots, import/export and version/credits metadata",()=>{
  assert.ok(html.includes('id="save-slot-list"'));
  assert.ok(html.includes('id="export-save-btn"'));
  assert.ok(html.includes('id="import-save-input"'));
  assert.ok(html.includes('id="save-archive-status"'));
  assert.ok(html.includes("KINGS &amp; CARDS · <b>v3.13.2</b>"));
  assert.ok(management.includes('data-command="crown-grain"'));
  assert.ok(management.includes('data-command="crown-water"'));
  assert.ok(management.includes('data-command="crown-housing"'));
  assert.ok(management.includes('data-command="crown-provision"'));
  assert.ok(management.includes("WAR GRANARY"));
  assert.ok(main.includes("function renderSaveSlots()"));
  assert.ok(main.includes("function exportRealm()"));
  assert.ok(main.includes("async function importRealm(file)"));
  assert.ok(main.includes("ECONOMY_HISTORY_LIMIT"));
  assert.ok(hud.includes(".save-slot"));
  for(const label of ["Original soundtrack enabled","Music volume","Show resource change badges","Reduce interface motion"]){
    assert.ok(html.includes('aria-label="'+label+'"'),"settings control needs an accessible name: "+label);
  }
});

test("settings expose a live device benchmark with visible results and safe restoration",()=>{
  for(const id of ["run-performance-benchmark","performance-benchmark-status","performance-benchmark-progress","performance-benchmark-results","performance-benchmark-body","performance-benchmark-live","performance-benchmark-live-status","performance-benchmark-live-progress","performance-benchmark-cancel"]){
    assert.ok(html.includes('id="'+id+'"'),"benchmark UI is missing "+id);
  }
  assert.ok(html.includes('aria-label="Benchmark progress"'));
  assert.ok(html.includes('id="settings-modal" class="screen-overlay hidden"'));
  assert.ok(main.includes("async function runPerformanceBenchmark()"));
  assert.ok(main.includes("summarizeBenchmarkSamples"));
  assert.ok(main.includes("Object.assign(settings,originalSettings)"),"benchmark must restore the player's settings");
  assert.ok(main.includes("BENCHMARK_MIN_FRAMES"));
  assert.ok(main.includes("setBenchmarkLiveVisible(true)"));
  assert.ok(main.includes("setBenchmarkLiveVisible(false)"));
  assert.ok(hud.includes(".performance-benchmark__table"));
  assert.ok(hud.includes(".benchmark-live__panel"));
});

test("realm issue presentation exposes real participants and the chronicle record",()=>{
  assert.ok(html.includes('id="realm-event-participants"'));
  assert.ok(html.includes('id="realm-event-chronicle"'));
  assert.ok(ui.includes("issue.family"));
  assert.ok(ui.includes("data-event-person"));
  assert.ok(main.includes("realm-event-participants"));
  assert.ok(main.includes("realm-event-chronicle"));
  assert.ok(hud.includes(".event-participants"));
});

test("building register uses live entities, staffing, footprint and site data without inventing output",()=>{
  assert.ok(html.includes('data-kac-panel="buildings"'));
  assert.ok(html.includes('data-command-tab="buildings"'));
  assert.ok(management.includes('state.entities.filter(entity=>!entity.dead&&entity.isBuilding())'));
  assert.ok(management.includes("getBuildingEfficiency(building,workforce)"));
  assert.ok(management.includes("BUILDING_SIZE[building.type]"));
  assert.ok(management.includes("getResourceNodeAt(building.x,building.y)"));
  assert.ok(management.includes("constructionSnapshot(building)"));
  assert.ok(management.includes("getInventorySummary(building)"));
  assert.ok(management.includes("Local store"));
  assert.ok(management.includes("getBuildingLogisticsStatus(building)"));
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
  assert.ok(dossier.includes('data-dossier-action="locate"'));
  assert.ok(dossier.includes('data-dossier-action="dynasty"'));
  assert.ok(main.includes('window.addEventListener("kac:focus-map"'));
  assert.ok(hud.includes(".dossier-actions"));
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
  for(const target of ["kingdom","government","people","dynasty","chronicle","politics","economy","resources","buildings","cards","creatures","build","settings"]){
    assert.ok(html.includes('data-kac-panel="'+target+'"'),"missing navigation target "+target);
  }
});


test("accessibility preferences are visible, persistent and applied as document modes",async()=>{
  const persistence=await readFile(new URL("js/core/persistence.js",root),"utf8");
  for(const id of ["settings-tooltips-toggle","settings-motion-toggle","settings-high-contrast-toggle"]){
    assert.ok(html.includes('id="'+id+'"'),"missing accessibility control "+id);
  }
  for(const key of ["showTooltips","reduceMotion","highContrast"]){
    assert.ok(persistence.includes(key),"settings persistence must retain "+key);
  }
  for(const id of ["settings-tooltips-toggle","settings-motion-toggle","settings-high-contrast-toggle"]){
    assert.ok(main.includes('getElementById("'+id+'")'),"settings binding missing "+id);
  }
  assert.ok(main.includes("applyInterfaceSettings()"));
  for(const mode of ["ui-hide-tooltips","ui-reduced-motion","ui-high-contrast"]){
    assert.ok(css.includes("html."+mode),"missing document mode "+mode);
  }
  assert.ok(css.includes("html.ui-hide-tooltips [data-tooltip]::after"));
  assert.ok(css.includes("html.ui-hide-tooltips [data-ui-tooltip]::after"));
  assert.ok(css.includes(".settings-accessibility"));
});
