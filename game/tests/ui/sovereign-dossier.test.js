import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [dossier,styles,heraldry]=await Promise.all([
  readFile(new URL("js/presentation/character-dossier.js",root),"utf8"),
  readFile(new URL("css/sovereign-dossier.css",root),"utf8"),
  readFile(new URL("assets/royal-heraldry.svg",root),"utf8")
]);

test("living sovereign receives a dedicated dossier backed by the royal-house model",()=>{
  assert.ok(dossier.includes('import { getRoyalHouse } from "../systems/royal-dynasty.js"'));
  assert.ok(dossier.includes("function renderSovereignDossier(entity, family)"));
  assert.ok(dossier.includes('data-royal-dossier="current"'));
  assert.ok(dossier.includes("getRoyalHouse()"));
  assert.ok(dossier.includes("currentHouse.heir"));
  assert.ok(dossier.includes("currentHouse.consort"));
  assert.ok(dossier.includes("currentHouse.children"));
});

test("royal dossier links navigate through the existing recorded-person handler",()=>{
  assert.ok(dossier.includes('renderLinks("ROYAL CONSORT"'));
  assert.ok(dossier.includes('renderLinks("DESIGNATED SUCCESSOR"'));
  assert.ok(dossier.includes('renderLinks("ROYAL CHILDREN"'));
  assert.ok(dossier.includes('data-person-id="'));
  assert.ok(dossier.includes('getElementById("person-dossier")?.addEventListener("click"'));
});

test("former sovereign memorials do not display the living monarch's current succession data",()=>{
  assert.ok(dossier.includes('data-royal-dossier="former"'));
  assert.ok(dossier.includes("if (!isReigningSovereign)"));
  assert.ok(dossier.includes("Current succession details are shown only on the living sovereign"));
});

test("royal chronicle is bounded and uses recorded royal-house history only",()=>{
  assert.ok(dossier.includes("(currentHouse.history || []).slice(-8).reverse()"));
  assert.ok(dossier.includes("entry.detail"));
  assert.ok(dossier.includes("No royal-house events have been recorded yet."));
});

test("sovereign styling is local, responsive and respects reduced motion",()=>{
  assert.ok(dossier.includes('link.href = "css/sovereign-dossier.css"'));
  assert.ok(styles.includes(".royal-dossier__masthead"));
  assert.ok(styles.includes("@media(max-width:720px)"));
  assert.ok(styles.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(!styles.includes("http://")&&!styles.includes("https://"));
});


test("royal heraldry uses eight original local symbols and a stable dynasty mapping",()=>{
  for(let i=1;i<=8;i++)assert.ok(heraldry.includes('id="crest-'+String(i).padStart(2,"0")+'"'));
  assert.ok(dossier.includes("function royalCrestId(name)"));
  assert.ok(dossier.includes("assets/royal-heraldry.svg#"));
  assert.ok(styles.includes(".royal-dossier__crest"));
  assert.ok(!heraldry.includes("http://")&&!heraldry.includes("https://"));
});
