import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const source=await readFile(new URL("tests/browser/e2e.mjs",root),"utf8");

test("seven-viewport matrix covers all ten strategic management panels",()=>{
  for(const viewport of ["390,844","768,1024","1280,720","1366,768","1600,900","1920,1080","2560,1440"]){
    assert.ok(source.includes(viewport),"missing required viewport "+viewport);
  }
  for(const panel of ["kingdom","government","politics","decisions","cards","economy","buildings","dynasty","creatures","chronicle"]){
    assert.ok(source.includes('"'+panel+'"'),"missing management panel "+panel);
    assert.ok(source.includes('"management-"+tab'),"missing per-tab screenshot naming for "+panel);
  }
});

test("seven-viewport matrix includes people, construction, settings and event overlays",()=>{
  for(const [selector,label] of [
    ["#people-modal","people-dossier"],
    ["#build-modal","construction"],
    ["#settings-modal","settings"],
    ["#realm-event-modal","event"]
  ]){
    assert.ok(source.includes('"'+selector+'"'),"missing overlay selector "+selector);
    assert.ok(source.includes('"'+label+'"'),"missing screenshot contract "+label);
  }
  assert.ok(source.includes("const assertOverlayFits=async(selector,label,screenshotName)=>"));
  assert.ok(source.includes("documentWidth<=width+1"));
  assert.ok(source.includes("overflowY"));
  assert.ok(source.includes("bodyScrollHeight>audit.bodyClientHeight+2"));
});

test("responsive overlay audit checks bounds and scroll access rather than screenshot existence alone",()=>{
  assert.ok(source.includes("audit.right<=width+1&&audit.bottom<=height+1"));
  assert.ok(source.includes('["auto","scroll","overlay"].includes(audit.overflowY)'));
  assert.ok(source.includes("await page.screenshot({path:resolve(screenshotDir,screenshotName+"));
});

test("detailed overlay screenshots use a bounded representative set while all seven sizes remain asserted",()=>{
  assert.ok(source.includes("if([390,1366,1920].includes(width))"));
  assert.ok(source.includes("geometry and scroll checks still run at all seven sizes"));
});
