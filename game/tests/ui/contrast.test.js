import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [css,hud]=await Promise.all([
  readFile(new URL("../../css/comic-strategy.css",import.meta.url),"utf8"),
  readFile(new URL("../../css/hud-v3.css",import.meta.url),"utf8")
]);

function luminance(hex){
  const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255);
  const linear=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrastRatio(foreground,background){
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}

test("management panel introduction title and body copy use accessible dark colors against parchment",()=>{
  const title=css.match(/\.command-panel-intro h3\{color:(#[0-9a-f]{6})\}/i)?.[1];
  const body=css.match(/\.command-panel-intro p\{color:(#[0-9a-f]{6})\}/i)?.[1];
  assert.ok(title,"management panel title color must be explicitly set");
  assert.ok(body,"management panel description color must be explicitly set");
  for(const background of ["#efe3c8","#d8c6a0"]){
    assert.ok(contrastRatio(title,background)>=4.5,"title contrast below WCAG AA against "+background);
    assert.ok(contrastRatio(body,background)>=4.5,"body contrast below WCAG AA against "+background);
  }
});

test("management panel header retains its separate parchment-banner treatment",()=>{
  assert.ok(css.includes(".command-panel-header h2"));
  assert.ok(css.includes(".command-panel-intro h3{color:#203c58}"));
});

test("narrow master UI keeps all management tabs reachable and clears decorations",()=>{
  assert.ok(hud.includes(".command-deck{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))"));
  assert.ok(hud.includes(".modal-panel::before,.modal-panel::after{display:none}"));
  assert.ok(hud.includes(".map-layer-legend{top:72px"));
  assert.ok(hud.includes(".placement-status{top:130px"));
});
