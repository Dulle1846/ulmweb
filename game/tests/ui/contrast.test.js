import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const css=await readFile(new URL("../../css/comic-strategy.css",import.meta.url),"utf8");

function luminance(hex){
  const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255);
  const linear=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrastRatio(foreground,background){
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}

test("management panel introduction title and body copy use accessible light colors",()=>{
  const title=css.match(/\.command-panel-intro h3\{color:(#[0-9a-f]{6})\}/i)?.[1];
  const body=css.match(/\.command-panel-intro p\{color:(#[0-9a-f]{6})\}/i)?.[1];
  assert.ok(title,"management panel title color must be explicitly set");
  assert.ok(body,"management panel description color must be explicitly set");
  for(const background of ["#24221f","#30271f","#403326"]){
    assert.ok(contrastRatio(title,background)>=4.5,"title contrast below WCAG AA against "+background);
    assert.ok(contrastRatio(body,background)>=4.5,"body contrast below WCAG AA against "+background);
  }
});

test("management panel header retains its separate parchment-banner treatment",()=>{
  assert.ok(css.includes(".command-panel-header h2"));
  assert.ok(css.includes(".command-panel-intro h3{color:#f1d79f}"));
});
