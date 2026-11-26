import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [html,css,gameCss,hud,main]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/start-cinematic.css",root),"utf8"),
  readFile(new URL("css/game.css",root),"utf8"),
  readFile(new URL("css/hud-v3.css",root),"utf8"),
  readFile(new URL("js/app/main.js",root),"utf8")
]);

test("the founding gate is one illustrated cover plus one chancery folio",()=>{
  assert.equal((html.match(/class="start-cover"/g)||[]).length,1);
  assert.equal((html.match(/class="start-cover__mast"/g)||[]).length,1);
  assert.equal((html.match(/id="start-vignettes"/g)||[]).length,1);
  assert.equal((html.match(/id="start-title"/g)||[]).length,1);
  assert.equal((html.match(/id="start-custom-game-btn"/g)||[]).length,1);
  assert.equal((html.match(/id="start-new-game-btn"/g)||[]).length,1);
  assert.ok(html.indexOf('class="start-quickstart"')<html.indexOf('class="realm-identity"')&&html.indexOf('class="realm-identity"')>0,
    "the quick start must sit above the detailed founding controls");
  assert.ok(!html.includes('src="assets/royal-title-illustration.svg" loading="lazy"'),
    "the title artwork must load eagerly");
  assert.equal((html.match(/assets\/royal-title-illustration\.svg/g)||[]).length,1);
  const cinematic=html.indexOf('href="css/start-cinematic.css"');
  assert.ok(cinematic>html.indexOf('href="css/hud-v3.css"'),"the cinematic layer must load after the HUD layout rules");
  assert.ok(css.includes("#start-screen>.start-panel>.start-form"),"the start form needs a specific override for the legacy grid");
  assert.ok(css.includes("@media(max-width:860px)"),"the cover must have a phone layout");
  assert.ok(css.includes("prefers-reduced-motion:reduce"),"the cinematic motion must respect reduced motion");
  assert.ok(gameCss.includes(".screen-overlay {\n    position:fixed;"),"the founding gate must remain a fixed, full-viewport overlay");
  assert.ok(hud.includes("#start-screen{"),"the legacy scroll container must remain in place for save-compatible dialogs");
});

test("the loading screen is inside the gate and exposes real phases",()=>{
  assert.equal((html.match(/id="start-loading"/g)||[]).length,1);
  assert.ok(html.indexOf('id="start-loading"')>html.indexOf('id="start-screen"'),"loading must belong to the start screen");
  assert.equal((html.match(/data-loading-step="/g)||[]).length,5);
  for(const step of ["survey","settle","chancery","chronicle","ready"])assert.ok(html.includes('data-loading-step="'+step+'"'));
  for(const id of ["start-loading-map","loading-realm-name","loading-seed","loading-climate","loading-percent","loading-heading","loading-copy","loading-progress-track","loading-progress","loading-chapter-title","loading-chapter-copy"]) {
    assert.equal((html.match(new RegExp('id="'+id+'"',"g"))||[]).length,1,"missing loading element "+id);
  }
  assert.ok(html.includes('role="progressbar"'),"the loading bar must expose progress semantics");
  assert.ok(html.includes('role="status" aria-live="polite" aria-label="Founding the realm"'),"loading must not be silent to assistive technology");
  assert.ok(css.includes(".start-loading[hidden]{display:none!important}"),"the loading layer must be dismissible");
});

test("possible chapters are deterministic flavour, clearly separated from the simulation",()=>{
  assert.ok(main.includes("POSSIBLE_CHAPTER_LANDSCAPES"));
  assert.ok(main.includes("function possibleChaptersFor(seedValue,climate)"));
  assert.ok(main.includes("function renderStartVignettes()"));
  assert.ok(main.includes("A POSSIBLE CHAPTER"),"the loader must label its chapters as possible futures");
  assert.ok(html.includes("Possible futures, not a forecast."),"the gate must not present vignettes as simulation output");
  assert.ok(!main.slice(main.indexOf("function possibleChaptersFor"),main.indexOf("function renderStartVignettes")).includes("Math.random()"),
    "possible chapters must derive from the seed and climate, not chance");
  assert.ok(main.includes("seed%5")&&main.includes("land[0]"),"the chapter generator must use both seed and climate");
});

test("starting a realm awaits the visible loader instead of revealing the world behind it",()=>{
  assert.ok(main.includes("async function beginRealmLoading"));
  assert.ok(main.includes("async function holdRealmLoading"));
  assert.ok(main.includes("function finishRealmLoading"));
  assert.ok(main.includes("function failRealmLoading"));
  assert.ok(main.includes("minMs:1600"),"the gate must stay up long enough to read the opening phases");
  assert.ok(main.includes("await beginRealmLoading({realmName:foundingName,seed,climate:worldOptions.climate})"));
  assert.ok(main.includes("await holdRealmLoading()"));
  assert.ok(main.indexOf("await holdRealmLoading()")<main.indexOf('document.getElementById("start-screen").classList.add("hidden")'),
    "the gate may only close after the loading sequence finishes");
  assert.ok(main.includes("failRealmLoading();showStatus(error.message)"),"a failed start must return the player to a usable folio");
  assert.ok(main.includes('getElementById("start-custom-game-btn")'),"the tailored start button must use the same start path");
  assert.ok(main.includes("start-loading-map")&&main.includes("drawImage(preview"),"the loader must show the exact world preview");
});
