import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {chromium} from "playwright";

const root=process.cwd();
const mime={
    ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
    ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".json":"application/json",
    ".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".mp3":"audio/mpeg",".wav":"audio/wav"
};
const server=createServer(async(req,res)=>{
    try{
        const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
        const relative=pathname==="/"?"index.html":pathname.slice(1);
        const file=resolve(root,relative);
        if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end("Forbidden");return;}
        const data=await readFile(file);
        res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream","cache-control":"no-store"});
        res.end(data);
    }catch{
        res.writeHead(404,{"content-type":"text/plain"}).end("Not found");
    }
});
await new Promise(resolveListen=>server.listen(4173,"127.0.0.1",resolveListen));
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const errors=[],consoleErrors=[];
try{
    const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:"reduce"});
    const page=await context.newPage();
    page.on("pageerror",error=>errors.push(error.message));
    page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"networkidle"});
    assert.equal(await page.title(),"KINGS & CARDS • Eternal Realm");
    assert.equal(await page.locator("#start-screen").isVisible(),true);

    for(const [id,value] of [["world-landmass","72"],["world-ruggedness","64"],["world-forests","81"],["world-water","43"]]){
        await page.locator("#"+id).evaluate((el,next)=>{
            el.value=next;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));
        },value);
    }
    await page.locator("#world-seed-input").fill("20261104");
    await page.locator("#player-name-input").fill("CI-Browser-Check");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({state:"hidden",timeout:15000});
    assert.equal((await page.locator("#hand-count").innerText()).trim(),"0 / 5","new realms must begin with an empty hand");

    // Character dossiers are read-only, searchable and expose stable person records.
    await page.locator("#people-btn").click();
    assert.equal(await page.locator("#people-modal").isVisible(),true);
    assert.ok(await page.locator("#people-list .person-list-item").count() >= 1);
    await page.locator("#people-list .person-list-item").first().click();
    assert.ok((await page.locator("#person-dossier").innerText()).includes("PERSONALITY"));
    assert.match(await page.locator("#person-dossier").innerText(), /\b(female|male)\b/);
    assert.ok((await page.locator("#person-dossier").innerText()).includes("PERSONAL CHRONICLE"));
    await page.locator("#people-search").fill("no-such-person-should-match");
    assert.equal(await page.locator("#people-list .person-list-item").count(),0);
    await page.locator("#people-search").fill("");
    await page.locator("#people-close").click();
    assert.equal(await page.locator("#people-modal").isVisible(),false);

    // A deceased resident remains inspectable as a memorial, not as a live entity.
    const memorialId=await page.evaluate(async()=>{
        const [{state},{recordNaturalDeath}]=await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/mortality.js")
        ]);
        const resident=state.entities.find(entity=>entity.type==="villager"&&!entity.dead);
        if(!resident)throw new Error("No living resident available for memorial E2E");
        resident.person.species="human";
        resident.person.ageYears=82;
        resident.person.lifeStage="elder";
        const death=recordNaturalDeath(resident,"old age");
        return death?.personId||null;
    });
    assert.ok(memorialId,"test fixture should create a deceased person's memorial");
    await page.locator("#people-btn").click();
    await page.locator("#people-search").fill(memorialId);
    assert.equal(await page.locator("#people-list .person-list-item").count(),1);
    await page.locator("#people-list .person-list-item").first().click();
    const memorialDossier=await page.locator("#person-dossier").innerText();
    assert.ok(memorialDossier.includes("DECEASED"));
    assert.ok(memorialDossier.includes("Died in year"));
    await page.locator("#people-close").click();

    await page.locator("#speed-4").click();
    await page.waitForFunction(()=>{
        const value=document.querySelector("#hand-count")?.textContent||"0 / 5";
        return Number.parseInt(value,10)>=3;
    },null,{timeout:45000});
    const countBeforeClick=Number.parseInt(await page.locator("#hand-count").innerText(),10);
    const cardButtons=page.locator("#card-hand .hand-card");
    assert.ok(countBeforeClick>=3);
    const eventModal=page.locator("#realm-event-modal");
    if(await eventModal.isVisible())await page.locator("#realm-event-choices button").first().click();
    await page.locator("#speed-1").click();

    // Clicking a card selects it; it must not accidentally place it merely
    // because the hand dock overlays the canvas element's bounding rectangle.
    let chosenIndex=-1;
    for(let i=0;i<await cardButtons.count();i++){
        await cardButtons.nth(i).click();
        const affordable=await page.evaluate(()=>{
            const resources={};
            for(const key of ["wood","stone","gold","food"])resources[key]=Number(document.querySelector("#res-"+key)?.textContent||0);
            return ["wood","stone","gold","food"].every(key=>{
                const amount=Number(document.querySelector("#card-cost-"+key+" span:nth-child(2)")?.textContent||0);
                return amount<=resources[key];
            });
        });
        if(affordable){chosenIndex=i;break;}
    }
    assert.ok(chosenIndex>=0,"at least one of the first three cards should be affordable");
    assert.equal(Number.parseInt(await page.locator("#hand-count").innerText(),10),countBeforeClick,"selecting a card must not remove it");
    const logBeforeClick=await page.locator("#tab-content").innerText();
    assert.equal(logBeforeClick.includes("PLAYED "),false,"clicking the hand must not play a card");

    // Exercise an actual pointer drag. Search a small safe interior grid for a
    // legal placement preview; the random map seed can change valid terrain.
    const cardBox=await cardButtons.nth(chosenIndex).boundingBox();
    const canvasBox=await page.locator("#canvas").boundingBox();
    assert.ok(cardBox&&canvasBox);
    await page.mouse.move(cardBox.x+cardBox.width/2,cardBox.y+cardBox.height/2);
    await page.mouse.down();
    let placed=false,lastTarget="none";
    for(const fy of [0.24,0.32,0.40,0.48,0.56,0.64,0.72]){
        for(const fx of [0.18,0.28,0.38,0.48,0.58,0.68,0.78,0.88]){
            const x=canvasBox.x+canvasBox.width*fx,y=canvasBox.y+canvasBox.height*fy;
            await page.mouse.move(x,y,{steps:3});
            await page.waitForTimeout(35);
            if(await page.locator("#placement-status").getAttribute("data-valid")==="true"){
                lastTarget=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id||document.elementFromPoint(x,y)?.tagName||"none",{x,y});
                if(lastTarget==="canvas"){await page.mouse.up();placed=true;break;}
            }
        }
        if(placed)break;
    }
    if(!placed){
        await page.mouse.up();
        throw new Error("no legal map canvas target was found; last target: "+lastTarget);
    }
    await page.waitForTimeout(150);
    const handAfterDrag=Number.parseInt(await page.locator("#hand-count").innerText(),10);
    console.log("Drag diagnostic:",JSON.stringify({
        lastTarget,
        selectedCard:await page.locator("#card-name").innerText(),
        handBefore:countBeforeClick,
        handAfter:handAfterDrag,
        toast:await page.locator("#action-toast").innerText(),
        placement:await page.locator("#placement-status").innerText(),
        eventVisible:await eventModal.isVisible()
    }));
    assert.equal(handAfterDrag,countBeforeClick-1,"a valid drag must consume exactly the selected card");
    assert.ok((await page.locator("#card-hand .hand-card").count())<countBeforeClick,"successful placement must remove the consumed card from the hand");

    // Event decisions can overlay the map during a long accelerated test.
    if(await eventModal.isVisible())await page.locator("#realm-event-choices button").first().click();

    await page.locator("#settings-btn").click();
    assert.equal(await page.locator("#settings-modal").isVisible(),true);
    await page.locator("#settings-close").click();
    assert.equal(await page.locator("#settings-modal").isVisible(),false);

    await page.locator("#pause-btn").click();
    // A simulation tick may already be queued when the pause action lands.
    // Let that in-flight frame settle, then assert that no later tick advances.
    await page.waitForTimeout(120);
    const pausedTick=(await page.locator("#tick-count").innerText()).trim();
    await page.waitForTimeout(500);
    assert.equal((await page.locator("#tick-count").innerText()).trim(),pausedTick,"paused simulation tick must remain fixed after the in-flight frame settles");
    await page.locator("#pause-btn").click();
    await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="PAUSE",null,{timeout:3000});
    try{
        await page.waitForFunction(previous=>Number(document.querySelector("#tick-count")?.textContent||0)>Number(previous),pausedTick,{timeout:5000});
    }catch(error){
        const diagnostic=await page.evaluate(()=>({
            tick:document.querySelector("#tick-count")?.textContent.trim(),
            pauseText:document.querySelector("#pause-text")?.textContent.trim(),
            toast:document.querySelector("#action-toast")?.textContent.trim(),
            eventVisible:!document.querySelector("#realm-event-modal")?.classList.contains("hidden")
        }));
        throw new Error("Simulation did not resume: "+JSON.stringify({diagnostic,consoleErrors})+"; "+error.message);
    }

    await page.locator("#pause-btn").click();
    const savedTick=(await page.locator("#tick-count").innerText()).trim();
    const savedHand=(await page.locator("#hand-count").innerText()).trim();
    await page.locator("#save-btn").click();
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Realm saved"),null,{timeout:5000});
    await page.locator("#load-btn").click();
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Loaded realm"),null,{timeout:5000});
    assert.equal((await page.locator("#tick-count").innerText()).trim(),savedTick,"save/load must restore the exact simulation tick");
    assert.equal((await page.locator("#hand-count").innerText()).trim(),savedHand,"save/load must restore the card hand");
    // The memorial archive must survive the same save/load round trip.
    await page.locator("#people-btn").click();
    await page.locator("#people-search").fill(memorialName);
    assert.equal(await page.locator("#people-list .person-list-item").count(),1);
    await page.locator("#people-list .person-list-item").first().click();
    assert.ok((await page.locator("#person-dossier").innerText()).includes("DECEASED"));
    await page.locator("#people-close").click();
    await page.locator("#pause-btn").click();

    assert.deepEqual(errors,[],"browser runtime must not emit uncaught page errors");
    assert.deepEqual(consoleErrors,[],"browser runtime must not emit console errors");
    console.log("Browser E2E passed: world forge, seed, empty/timed hand, safe card selection, real drag placement, settings, pause/resume, save/load; no page errors.");
    await context.close();
}finally{
    await browser.close();
    await new Promise(resolveClose=>server.close(resolveClose));
}
