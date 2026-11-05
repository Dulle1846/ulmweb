import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const [management,styles]=await Promise.all([
  readFile(new URL("js/presentation/management-ui.js",root),"utf8"),
  readFile(new URL("css/dynasty-network.css",root),"utf8")
]);

test("dynasty network is built from explicit saved kinship records",()=>{
  assert.ok(management.includes("function lineageGraph(king,heirId)"));
  assert.ok(management.includes("rootFamily.parents"));
  assert.ok(management.includes("rootFamily.siblings"));
  assert.ok(management.includes("getFamilySnapshot(auntId)?.children"));
  assert.ok(management.includes('familyRecord(cousinLink.personId)'));
  assert.ok(management.includes('familyRecord(childLink.personId)'));
});

test("dynasty graph exposes sovereign, parents, siblings, collateral relatives, cousins and children",()=>{
  for(const lane of ["grandparents","parents","royal-generation","collateral","cousins","children"]){
    assert.ok(management.includes('id:"'+lane+'"'),"missing lineage lane "+lane);
  }
  assert.ok(management.includes('data-lineage-node-id='));
  assert.ok(management.includes('data-lineage-from='));
  assert.ok(management.includes('data-lineage-to='));
  assert.ok(management.includes('aria-label="Verified royal family relationship graph"'));
});

test("connector paths are computed from live element bounds and refresh on resize",()=>{
  assert.ok(management.includes("function drawDynastyConnectors()"));
  assert.ok(management.includes("getBoundingClientRect()"));
  assert.ok(management.includes("requestAnimationFrame(drawDynastyConnectors)"));
  assert.ok(management.includes('window.addEventListener("resize"'));
});

test("lineage graph styling distinguishes partnership, sibling and guardianship links",()=>{
  for(const token of [".dynasty-lineage-edge--partner",".dynasty-lineage-edge--sibling",".dynasty-lineage-edge--guardian",".dynasty-lineage-lane__nodes","@media(max-width:720px)","@media(prefers-reduced-motion:reduce)"]){
    assert.ok(styles.includes(token),"missing graph style "+token);
  }
  assert.ok(!styles.includes("http://")&&!styles.includes("https://"));
});

test("the graph keeps the existing descendant depth and node limits",()=>{
  assert.ok(management.includes("depth<4"));
  assert.ok(management.includes(".slice(0,24)"));
});


test("lineage network enforces hard node and edge limits",()=>{
  assert.ok(management.includes("MAX_NODES=80"));
  assert.ok(management.includes("MAX_EDGES=120"));
  assert.ok(management.includes("nodes.size>=MAX_NODES"));
  assert.ok(management.includes("edges.length>=MAX_EDGES"));
});

test("partner and sibling connectors switch to vertical geometry when cards stack on mobile",()=>{
  assert.ok(management.includes("const stacked=Math.abs(a.top-b.top)>Math.min(a.height,b.height)*.6"));
  assert.ok(management.includes("if(stacked){"));
  assert.ok(management.includes("x1=a.left-bounds.left+a.width/2;y1=a.bottom-bounds.top"));
  assert.ok(management.includes("x2=b.left-bounds.left+b.width/2;y2=b.top-bounds.top"));
});
