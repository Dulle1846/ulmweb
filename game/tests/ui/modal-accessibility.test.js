import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {activateSkipLink,createBackgroundInert} from "../../js/presentation/modal-accessibility.js";

const root=new URL("../../",import.meta.url);
const [html,css,main,modal]=await Promise.all([
  readFile(new URL("index.html",root),"utf8"),
  readFile(new URL("css/ui-design-system.css",root),"utf8"),
  readFile(new URL("js/app/main.js",root),"utf8"),
  readFile(new URL("js/presentation/modal-accessibility.js",root),"utf8")
]);

class FakeElement{
  constructor(tagName){
    this.tagName=tagName;
    this.children=[];
    this.parentElement=null;
    this.attributes=new Map();
  }
  append(...nodes){
    for(const node of nodes){
      node.parentElement=this;
      this.children.push(node);
    }
  }
  contains(node){
    return node===this||this.children.some(child=>child.contains(node));
  }
  hasAttribute(name){
    return this.attributes.has(name);
  }
  getAttribute(name){
    return this.attributes.has(name)?this.attributes.get(name):null;
  }
  setAttribute(name,value){
    this.attributes.set(name,String(value));
  }
  removeAttribute(name){
    this.attributes.delete(name);
  }
}

test("all full-screen overlays expose accessible modal names",()=>{
  assert.match(html,/<div id="start-screen"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="start-title"/);
  assert.match(html,/<div id="settings-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="settings-title"/);
  for(const id of ["people-modal","realm-event-modal","command-modal","big-message","build-modal"]){
    const start=html.indexOf('id="'+id+'"');
    assert.ok(start>=0,"missing modal "+id);
    const tag=html.slice(start,html.indexOf(">",start)+1);
    assert.ok(tag.includes('role="dialog"')&&tag.includes('aria-modal="true"'),id+" must expose dialog semantics");
    assert.ok(tag.includes("aria-labelledby="),id+" must have an accessible name");
  }
});

test("modal focus manager traps tab navigation and restores the opener",()=>{
  assert.ok(main.includes('setupModalAccessibility();'));
  assert.ok(modal.includes("new MutationObserver"));
  assert.ok(modal.includes('event.key!=="Tab"'));
  assert.ok(modal.includes("event.shiftKey"));
  assert.ok(modal.includes("entry.opener.focus"));
  assert.ok(modal.includes("focusInside(next)"));
  assert.ok(modal.includes("fallbackFocus"));
  assert.ok(html.includes('id="main-container" class="game-layout" tabindex="-1"'));
});

test("dialog layout remains scrollable and usable on narrow and short screens",()=>{
  assert.ok(css.includes("body.ui-modal-open{overflow:hidden}"));
  assert.ok(css.includes("max-height:calc(100dvh - 24px)"));
  assert.ok(css.includes("@media(max-width:720px)"));
  assert.ok(css.includes("@media(max-height:700px)"));
  assert.ok(css.includes("overscroll-behavior:contain"));
});

test("the skip link is first, focus-visible and moves focus to the game content",()=>{
  assert.match(html,/<body>\s*<a id="skip-to-game" class="skip-to-game" href="#main-container">Skip to game content<\/a>/);
  assert.ok(html.indexOf('id="skip-to-game"')<html.indexOf('class="game-shell"'),"skip link must precede the game shell");
  assert.ok(css.includes(".skip-to-game:focus"));
  assert.ok(css.includes("transform:translateY(0)"));
  assert.ok(css.includes("outline:3px solid"));
  assert.ok(modal.includes('getElementById("skip-to-game")'));
  assert.ok(modal.includes("activateSkipLink(event,mainContent)"));

  const target={
    focusOptions:null,
    scrollOptions:null,
    focus(options){this.focusOptions=options;},
    scrollIntoView(options){this.scrollOptions=options;}
  };
  let prevented=false;
  assert.equal(activateSkipLink({preventDefault(){prevented=true;}},target),true);
  assert.equal(prevented,true);
  assert.deepEqual(target.focusOptions,{preventScroll:true});
  assert.deepEqual(target.scrollOptions,{block:"start"});
});

test("background inert follows the top dialog and restores every prior state",()=>{
  const body=new FakeElement("BODY");
  const header=new FakeElement("HEADER");
  const mainContent=new FakeElement("MAIN");
  const skip=new FakeElement("A");
  const start=new FakeElement("DIV");
  const settings=new FakeElement("DIV");
  const command=new FakeElement("DIV");
  body.append(header,mainContent,skip,start,settings,command);
  command.setAttribute("inert","");
  command.setAttribute("aria-hidden","false");

  const manager=createBackgroundInert(body);
  const inert=element=>element.hasAttribute("inert");
  const hidden=element=>element.getAttribute("aria-hidden")==="true";

  manager.sync(start);
  assert.equal(inert(start),false,"the top dialog itself must stay active");
  for(const element of [header,mainContent,skip,settings,command]){
    assert.equal(inert(element),true,"background element must be inert");
    assert.equal(hidden(element),true,"background element must be hidden from AT");
  }

  manager.sync(settings);
  assert.equal(inert(start),true,"the previous dialog becomes background");
  assert.equal(inert(settings),false,"the newly opened dialog must not stay inert");
  assert.equal(hidden(settings),false,"the newly opened dialog must not stay aria-hidden");
  assert.equal(inert(mainContent),true);

  manager.sync(start);
  assert.equal(inert(start),false,"going back restores the start dialog");
  assert.equal(inert(settings),true,"the closed settings dialog is background again");

  manager.sync(null);
  for(const element of [header,mainContent,skip,start,settings]){
    assert.equal(inert(element),false,"no inert may leak after the last dialog closes");
    assert.equal(element.getAttribute("aria-hidden"),null,"no aria-hidden may leak");
  }
  assert.equal(inert(command),true,"pre-existing inert state must survive");
  assert.equal(command.getAttribute("aria-hidden"),"false","pre-existing aria-hidden must survive exactly");
  assert.ok(modal.includes("createBackgroundInert(document.body)"));
  assert.ok(modal.includes("background.sync(top)"));
});
