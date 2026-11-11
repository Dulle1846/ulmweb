import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {tmpdir} from "node:os";
import {chromium} from "playwright";

const root=process.cwd();
const port=Number(process.env.E2E_PORT)||4173;
const remoteOrigin=process.env.E2E_BASE_URL?new URL(process.env.E2E_BASE_URL).origin:null;
const screenshotDir=process.env.E2E_SCREENSHOT_DIR?resolve(root,process.env.E2E_SCREENSHOT_DIR):resolve(tmpdir(),"kac-ui-viewport-review");
await mkdir(screenshotDir,{recursive:true});

// Capture the active campaign, not just the counters used by older smoke tests.
// Raw canvases and transient animation queues are omitted, but persistent world
// arrays are hashed in full. Any value that cannot be compared reliably aborts
// the test instead of being replaced by a mask that could hide a change.
async function captureRealmState(page){
    return page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        // Render telemetry changes every animation frame even while the realm
        // is paused. It is not persistent world state, so comparing it makes
        // this probe depend on when the screenshot happened to land.
        const ignored=new Set(["canvas","ctx","minimapCanvas","minimapCtx","terrainCanvas","terrainCanvasEl","fogCanvas","fogExploredRef","lastFrameTime","lastUiRender","lastMinimapRender","tickAccumulator","particles","floaters","pendingPresentationEffects","lastDrawMs","renderedFrames","renderStats","terrainCacheHits","terrainCacheMisses","terrainCacheRevision","forestVisualRevision","terrainDirty","fogDirty"]);
        const hashed=new Set(["heightMap","moistureMap","temperatureMap","explored"]);
        const hashPersistent=(value,label)=>{
            let hashA=2166136261>>>0,hashB=5381>>>0;
            const addByte=byte=>{
                hashA^=byte;hashA=Math.imul(hashA,16777619)>>>0;
                hashB=((hashB<<5)+hashB+byte)>>>0;
            };
            const addText=text=>{
                addByte(255);
                for(let index=0;index<text.length;index++){
                    const code=text.charCodeAt(index);
                    addByte(code&255);addByte((code>>>8)&255);
                }
            };
            const walk=(item,path)=>{
                if(item===null){addText("null");return;}
                if(item===undefined){addText("undefined");return;}
                if(typeof item==="number"){
                    if(!Number.isFinite(item))throw new Error("Cannot hash non-finite persistent value at "+path);
                    addText("number:"+String(item));return;
                }
                if(typeof item==="boolean"){addText("boolean:"+(item?"1":"0"));return;}
                if(typeof item==="string"){addText("string:"+item);return;}
                if(ArrayBuffer.isView(item)){
                    addText("typed:"+item.constructor.name+":"+item.length);
                    const bytes=new Uint8Array(item.buffer,item.byteOffset,item.byteLength);
                    for(const byte of bytes)addByte(byte);
                    return;
                }
                if(Array.isArray(item)){
                    addText("array:"+item.length);
                    for(let index=0;index<item.length;index++)walk(item[index],path+"["+index+"]");
                    return;
                }
                if(typeof item==="object"){
                    const keys=Object.keys(item).sort();
                    addText("object:"+keys.length);
                    for(const key of keys){
                        addText("key:"+key);
                        walk(item[key],path+"."+key);
                    }
                    return;
                }
                throw new Error("Cannot hash persistent value at "+path+" of type "+typeof item);
            };
            walk(value,label);
            return {
                kind:value===null?"null":Array.isArray(value)?"array":ArrayBuffer.isView(value)?value.constructor.name:typeof value,
                length:Array.isArray(value)||ArrayBuffer.isView(value)?value.length:null,
                hashA:hashA.toString(16).padStart(8,"0"),
                hashB:hashB.toString(16).padStart(8,"0")
            };
        };
        const comparable=(value,path,stack=[])=>{
            if(value===undefined)return {__undefined:true};
            if(value===null||typeof value==="string"||typeof value==="boolean")return value;
            if(typeof value==="number"){
                if(!Number.isFinite(value))throw new Error("Cannot compare non-finite persistent value at "+path);
                return value;
            }
            if(typeof value==="function"||typeof value==="symbol"||typeof value==="bigint"){
                throw new Error("Cannot compare persistent value at "+path+" of type "+typeof value);
            }
            if(ArrayBuffer.isView(value))return hashPersistent(value,path);
            if(Array.isArray(value)){
                if(stack.includes(value))throw new Error("Circular persistent array at "+path);
                return value.map((item,index)=>comparable(item,path+"["+index+"]",[...stack,value]));
            }
            if(typeof value==="object"){
                if(value.id&&value.type&&"x" in value)return {__entityRef:String(value.id)};
                if(stack.includes(value))throw new Error("Circular persistent object at "+path);
                const result={};
                for(const key of Object.keys(value).sort())result[key]=comparable(value[key],path+"."+key,[...stack,value]);
                return result;
            }
            throw new Error("Cannot compare persistent value at "+path+" of type "+typeof value);
        };
        const entityRows=state.entities.map(entity=>{
            const row={};
            for(const key of Object.keys(entity).sort()){
                row[key]=comparable(entity[key],"entities."+String(entity.id||"unknown")+"."+key);
            }
            return row;
        }).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
        const result={};
        for(const key of Object.keys(state).sort()){
            if(ignored.has(key))continue;
            if(key==="entities"){result.entities=entityRows;continue;}
            const value=state[key];
            if(hashed.has(key)||ArrayBuffer.isView(value)){result[key]=hashPersistent(value,key);continue;}
            result[key]=comparable(value,key);
        }
        return result;
    });
}
// Read the persisted ecology fields that the save schema carries directly:
// insect colonies and the public-health herbal dose counters. The values are
// normalised exactly as serializeForestFauna()/ensureHealth() normalise them,
// so a restored snapshot can be compared without masking any field.
async function captureEcology(page){
    return page.evaluate(async()=>{
        const [{state},{FOREST_FAUNA_LIMITS}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/forest-fauna.js")
        ]);
        const model=state.forestFauna;
        const round2=value=>Math.round(Number(value)*100)/100;
        const round3=value=>Math.round(Number(value)*1000)/1000;
        const insects=(model?.insects||[]).slice(0,FOREST_FAUNA_LIMITS.maxInsects).map(insect=>({
            id:String(insect.id),species:insect.species,
            x:Math.floor(Number(insect.x)),y:Math.floor(Number(insect.y)),
            population:round2(Math.max(0,Math.min(1000,Number(insect.population)||0))),
            capacity:round2(Math.max(0.15,Math.min(1000,Number(insect.capacity)||0.15))),
            density:round3(Math.max(0,Math.min(1.5,Number(insect.density)||0))),
            droughtStress:round3(Math.max(0,Math.min(1,Number(insect.droughtStress)||0))),
            monocultureStress:round3(Math.max(0,Math.min(1,Number(insect.monocultureStress)||0))),
            trend:["growing","stable","declining"].includes(insect.trend)?insect.trend:"stable"
        })).sort((a,b)=>a.id.localeCompare(b.id));
        const health=state.health||{};
        const military=state.military||{};
        return {
            insects,
            herbalDoses:Math.max(0,Math.floor(Number(health.herbalDoses)||0)),
            herbalTreated:Math.max(0,Math.floor(Number(health.herbalTreated)||0)),
            disease:String(health.disease||"none"),
            outbreakActive:Boolean(health.outbreakActive),
            publicHealth:{
                sanitation:Number(state.health?.sanitation?.score)||0,
                medicineBrewed:Number(state.health?.medicineBrewed)||0,
                healers:(state.health?.healers||[]).map(entry=>String(entry.name)).sort(),
                mortalityTotal:Number(state.health?.mortality?.total)||0
            },
            military:{
                soldiers:state.entities.filter(entity=>!entity.dead&&entity.military).map(entity=>String(entity.person?.name||entity.military?.name||entity.id)).sort(),
                horses:Number(state.military?.horses)||0,
                trained:Number(state.military?.recruitsTrained)||0
            },
            forestDay:Number(model?.day)||0,
            forestSeed:Number(model?.seed)||0
        };
    });
}

const mime={
    ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
    ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".json":"application/json",
    ".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".mp3":"audio/mpeg",".wav":"audio/wav"
};
const server=remoteOrigin?null:createServer(async(req,res)=>{
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
if(server)await new Promise(resolveListen=>server.listen(port,"127.0.0.1",resolveListen));
const baseUrl=remoteOrigin||("http://127.0.0.1:"+port);
const browser=await chromium.launch({
    headless:process.env.E2E_HEADED!=="1",
    executablePath:process.env.E2E_CHROMIUM_EXECUTABLE||undefined,
    args:["--no-sandbox","--disable-dev-shm-usage"]
});
const errors=[],consoleErrors=[];
try{
    const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:"reduce"});
    const page=await context.newPage();
    await page.addInitScript(()=>{globalThis.__KAC_RESET_PROBE__={calls:0};});
    // The reset counter is injected only into the test server's module response.
    // It makes the negative import assertion explicit without adding test-only
    // hooks to production code.
    const resetMarker="function resetForRun(profile){";
    const afterImportMarker="const savedAt=writeLocalSave(profile.id,createSaveSnapshot());";
    await page.route("**/js/app/main.js",async route=>{
        const response=await route.fetch();
        const source=await response.text();
        if(!source.includes(resetMarker))throw new Error("Could not instrument resetForRun for the E2E reset probe");
        if(!source.includes(afterImportMarker))throw new Error("Could not instrument the successful-import boundary for the E2E continuity probe");
        let body=source.replace(resetMarker,resetMarker+" if(globalThis.__KAC_RESET_PROBE__)globalThis.__KAC_RESET_PROBE__.calls++;");
        body=body.replace(afterImportMarker,"globalThis.__KAC_AFTER_IMPORT__?.(state);"+afterImportMarker);
        const headers={...response.headers()};
        delete headers["content-encoding"];
        delete headers["content-length"];
        delete headers["transfer-encoding"];
        await route.fulfill({status:response.status(),headers,body});
    });
    page.on("pageerror",error=>errors.push(error.message));
    page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
    await page.goto(baseUrl+"/",{waitUntil:"networkidle"});
    assert.equal(await page.title(),"KINGS & CARDS • Eternal Realm");
    assert.equal(await page.locator("#start-screen").isVisible(),true);
    assert.equal(await page.locator("#start-screen .start-hero-art").getAttribute("src"),"assets/royal-title-illustration.svg","the founding screen must use the original muted royal title artwork");

    assert.equal(await page.locator("#start-screen").getAttribute("role"),"dialog","the founding screen must expose dialog semantics");
    await page.waitForFunction(()=>document.activeElement?.id==="player-name-input",null,{timeout:3000});


    for(const [id,value] of [["world-landmass","72"],["world-ruggedness","64"],["world-forests","81"],["world-water","43"]]){
        await page.locator("#"+id).evaluate((el,next)=>{
            el.value=next;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));
        },value);
    }
    await page.locator("#world-seed-input").fill("20261104");
    assert.equal(await page.locator("#world-size option").count(),7,"the forge must offer seven map sizes");
    await page.waitForFunction(()=>document.querySelector("#world-preview-status")?.textContent.includes("SEED 20261104"),null,{timeout:10000});
    assert.match(await page.locator("#world-preview-status").innerText(),/EXACT PREVIEW/,"the forge must report an exact preview");
    await page.locator("#player-name-input").fill("CI-Browser-Check");
    assert.ok((await page.locator("#start-new-game-btn").getAttribute("class")).includes("ui-button--primary"),"founding action must use the shared primary button");
    await page.locator("#start-new-game-btn").click();
    try{
        await page.locator("#start-screen").waitFor({state:"hidden",timeout:15000});
    }catch(error){
        console.error("Startup page errors:",JSON.stringify(errors));
        console.error("Startup console errors:",JSON.stringify(consoleErrors));
        throw error;
    }
    assert.equal(await page.locator("#hand-dock").count(),0,"new realms must not show a permanent card hotbar");
    assert.equal(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.length;}),0,"new realms must begin with an empty hand");
    const panBefore=await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return {x:state.camera.x,y:state.camera.y};});
    const panCanvasBox=await page.locator("#canvas").boundingBox();
    assert.ok(panCanvasBox);
    await page.mouse.move(panCanvasBox.x+panCanvasBox.width*0.45,panCanvasBox.y+panCanvasBox.height*0.4);
    await page.mouse.down();
    await page.mouse.move(panCanvasBox.x+panCanvasBox.width*0.45+90,panCanvasBox.y+panCanvasBox.height*0.4+40,{steps:6});
    await page.mouse.up();
    const panAfter=await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return {x:state.camera.x,y:state.camera.y};});
    assert.ok(Math.abs((panBefore.x-panAfter.x)-90)<=3,"dragging the map must pan it horizontally: "+JSON.stringify({panBefore,panAfter}));
    assert.ok(Math.abs((panBefore.y-panAfter.y)-40)<=3,"dragging the map must pan it vertically: "+JSON.stringify({panBefore,panAfter}));
    const resetCallsAfterStart=await page.evaluate(()=>globalThis.__KAC_RESET_PROBE__?.calls??-1);
    assert.ok(resetCallsAfterStart>=1,"the reset probe must observe the normal realm reset before it is armed for the invalid import");
    const exactPreview=await page.evaluate(async()=>{
        const [{state},{getWorldData}]=await Promise.all([
            import("./js/core/state.js"),import("./js/world/terrain-model.js")
        ]);
        const data=getWorldData(state.worldSeed,state.worldOptions);
        return {
            heightIdentity:state.heightMap===data.heights,
            riverIdentity:state.rivers===data.rivers,
            width:state.worldW,height:state.worldH,
            resolution:state.terrainResolution,
            pixW:state.terrainPixW,pixH:state.terrainPixH,
        };
    });
    assert.equal(exactPreview.heightIdentity,true,"the started realm must reuse the exact preview terrain arrays");
    assert.equal(exactPreview.riverIdentity,true,"the started realm must reuse the exact preview rivers");
    assert.equal(exactPreview.pixW,exactPreview.width*exactPreview.resolution);
    assert.equal(exactPreview.pixH,exactPreview.height*exactPreview.resolution);
    await page.locator("#speed-0-5").click();
    assert.ok(await page.locator("#speed-0-5").evaluate(el=>el.classList.contains("is-active")),"half-speed control must become active");
    await page.locator("#speed-1").click();

    // A corrupt import must fail before resetForRun and leave the live realm untouched.
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async()=>{
        const {state}=await import("./js/core/state.js");
        return state.isPaused===true;
    },null,{timeout:3000});
    await page.evaluate(()=>{globalThis.__KAC_RESET_PROBE__.calls=0;});
    const beforeInvalidImport=await captureRealmState(page);
    for(const key of ["heightMap","moistureMap","temperatureMap","explored"]){
        assert.ok(beforeInvalidImport[key]&&beforeInvalidImport[key].hashA,"persistent terrain data must be included in the state comparison: "+key);
    }
    assert.ok(beforeInvalidImport.heightMap.length>0,"the height map hash must cover the complete map");
    assert.ok(beforeInvalidImport.explored.length>0,"the exploration map hash must cover the complete map");
    assert.equal(JSON.stringify(beforeInvalidImport).includes("[unserializable]"),false,"persistent state must never be replaced by an unverifiable placeholder");
    const terrainHashSnapshot=Object.fromEntries(["heightMap","moistureMap","temperatureMap","explored"].map(key=>[key,{
        kind:beforeInvalidImport[key].kind,length:beforeInvalidImport[key].length,
        hashA:beforeInvalidImport[key].hashA,hashB:beforeInvalidImport[key].hashB
    }]));
    console.log("Terrain hash snapshot:",JSON.stringify(terrainHashSnapshot));
    const expectedTerrainHashes=JSON.parse(await readFile(resolve(root,"tests/browser/terrain-hashes.golden.json"),"utf8"));
    assert.deepEqual(terrainHashSnapshot,expectedTerrainHashes.hashes,"terrain hashes must match the locally generated golden values");

    // Mutate each persistent terrain array via the live state and prove that the
    // complete-state hash detects it. Restore the exact original element before
    // continuing with the invalid-import test.
    for(const key of ["heightMap","moistureMap","temperatureMap","explored"]){
        const mutation=await page.evaluate(async key=>{
            const {state}=await import("./js/core/state.js");
            const findAndMutate=(value,path)=>{
                if(ArrayBuffer.isView(value)){
                    if(!value.length)return null;
                    const old=value[0];
                    const next=typeof old==="boolean"?!old:old===0?1:0;
                    if(Object.is(next,old))throw new Error("Could not mutate persistent value at "+path.join("."));
                    value[0]=next;
                    return {path:[...path,0],old};
                }
                if(Array.isArray(value)){
                    for(let index=0;index<value.length;index++){
                        const item=value[index];
                        if(typeof item==="number"||typeof item==="boolean"){
                            const next=typeof item==="boolean"?!item:item===0?1:0;
                            if(Object.is(next,item))throw new Error("Could not mutate persistent value at "+[...path,index].join("."));
                            value[index]=next;
                            return {path:[...path,index],old:item};
                        }
                        const nested=findAndMutate(item,[...path,index]);
                        if(nested)return nested;
                    }
                }
                return null;
            };
            const result=findAndMutate(state[key],[key]);
            if(!result)throw new Error("No mutable element found in persistent terrain array "+key);
            return result;
        },key);
        try{
            const mutated=await captureRealmState(page);
            assert.notDeepEqual(mutated,beforeInvalidImport,"a change to "+key+" must make the complete-state comparison fail");
        }finally{
            await page.evaluate(async ({path,old})=>{
                const {state}=await import("./js/core/state.js");
                let target=state;
                for(const segment of path.slice(0,-1))target=target[segment];
                target[path[path.length-1]]=old;
            },mutation);
        }
    }
    const restoredAfterTerrainProbe=await captureRealmState(page);
    assert.deepEqual(restoredAfterTerrainProbe,beforeInvalidImport,"the terrain mutation probe must restore the exact original state");
    const invalidSavePath=resolve(tmpdir(),"kac-invalid-resource-save-"+Date.now()+".json");
    await writeFile(invalidSavePath,JSON.stringify({
        saveSchemaVersion:4,
        worldSeed:20261104,
        entities:[],
        resources:{wood:-1,stone:5,gold:5,food:5}
    }));
    await page.locator("#import-save-input").setInputFiles(invalidSavePath);
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("negative wood"),null,{timeout:5000});
    const afterInvalidImport=await captureRealmState(page);
    assert.equal(await page.evaluate(()=>globalThis.__KAC_RESET_PROBE__?.calls),0,"a rejected import must not call resetForRun");
    assert.deepEqual(afterInvalidImport,beforeInvalidImport,"a rejected import must leave the entire active realm unchanged, including entities, positions, resources, income, world options, roads, city logistics, random streams, profile, selection and speed");
    assert.match(await page.locator("#status-message").innerText(),/current realm was not changed/i,"the rejected import must explain that the active realm is untouched");
    await page.locator("#pause-btn").click();

    // Primary navigation must be operable by keyboard and expose the current page semantically.
    const economyNav=page.locator('.realm-nav-button[data-kac-panel="economy"]');
    await economyNav.focus();
    assert.equal(await economyNav.evaluate(el=>document.activeElement===el),true,"administration navigation must be keyboard focusable");
    await page.keyboard.press("Enter");
    assert.equal(await economyNav.getAttribute("aria-current"),"page","the selected navigation item must expose aria-current=page");
    assert.equal(await economyNav.getAttribute("aria-pressed"),null,"navigation must not be announced as a toggle button");
    assert.ok(await page.locator("#command-modal").isVisible(),"keyboard activation must open the selected management screen");
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Realm economy"),"keyboard activation must open the requested screen, not only change decoration");
    await page.locator("#command-close").click();

    // Phase 2 quick actions must open real game screens, not decorative controls.
    assert.ok(await page.locator("#realm-action-dock").isVisible(),"contextual action dock must be visible during a campaign");
    const globalDock=await page.locator("#realm-action-dock").evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement.className,position:el.getBoundingClientRect().top}));
    assert.ok(globalDock.width>=1590,"the contextual action bar must span the complete game width, not just the side panel");
    assert.ok(globalDock.parent.includes("game-shell"),"the action bar must be a sibling of the game layout");

    await page.locator('[data-kac-dock-action="dynasty"]').click();
    assert.ok(await page.locator("#command-modal").isVisible(),"dynasty action must open the management dialog");
    assert.equal(await page.locator("#command-panel-content .command-panel-intro h3").innerText(),"Dynasty & lineage");
    assert.ok(await page.locator("#command-panel-content .dynasty-generation").count()>=1,"a new campaign must show its sovereign generation");
    await page.waitForFunction(()=>document.activeElement?.id==="command-close",null,{timeout:3000});
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.closest("#command-modal"))),"Shift+Tab must remain inside the open management dialog");

    await page.locator("#command-panel-content .dynasty-person").first().click();
    assert.ok(await page.locator("#people-modal").isVisible(),"selecting a dynasty member must open the real character dossier");
    assert.ok(await page.locator("#person-dossier .dossier-portrait").isVisible(),"character dossier must show an original heraldic portrait");
    assert.ok(await page.locator("#people-list .person-list-portrait").count()>=1,"people roster must show individual portrait art");
    const roleFilter=page.locator("#people-role-filter");
    assert.ok(await roleFilter.locator("option").count()>1,"role filters must be populated from real character records");
    const selectedRole=await roleFilter.locator("option").nth(1).getAttribute("value");
    await roleFilter.selectOption(selectedRole);
    const filteredRoles=await page.locator("#people-list .person-list-item").evaluateAll(nodes=>nodes.map(node=>node.dataset.personRole));
    assert.ok(filteredRoles.length>0&&filteredRoles.every(role=>role===selectedRole),"role filter must return only matching recorded characters");
    await roleFilter.selectOption("");
    await page.locator("#people-status-filter").selectOption("living");
    const livingStatuses=await page.locator("#people-list .person-list-item").evaluateAll(nodes=>nodes.map(node=>node.dataset.personStatus));
    assert.ok(livingStatuses.every(status=>status==="living"),"living filter must exclude archived people");
    await page.locator("#people-status-filter").selectOption("");

    const relatedLink=page.locator("#person-dossier .dossier-related-person").first();
    if(await relatedLink.count()){
        const relatedName=await relatedLink.locator("strong").innerText();
        await relatedLink.click();
        assert.equal((await page.locator("#person-dossier .dossier-identity h2").innerText()).trim(), relatedName.trim(), "relationship navigation must open the exact linked person");
    }
    await page.locator("#people-close").click();
    await page.waitForFunction(()=>document.activeElement?.id==="main-container",null,{timeout:3000});
    await page.locator('[data-kac-dock-action="save"]').click();
    await page.waitForFunction(()=>document.querySelector("#save-status")?.textContent.startsWith("LAST SAVED"),null,{timeout:5000});
    await page.locator('[data-kac-dock-action="events"]').click();
    assert.ok(await page.locator("#tab-0").evaluate(el=>el.classList.contains("is-active")),"chronicle action must open the event log tab");
    // Restore the management default so the existing management regression suite
    // continues to verify the expected kingdom landing screen.
    await page.locator("#command-open-btn").click();
    assert.ok((await page.locator("#command-modal .command-panel").getAttribute("class")).includes("ui-window--large"),"management must use the large shared window size");
    assert.ok((await page.locator("#command-panel-content").getAttribute("class")).includes("ui-window__body"),"management content must own its scroll region");

    assert.ok(await page.locator("#command-modal [data-command-tab].ui-button--tab").count()>=5,"management tabs must use the shared tab control");

    await page.locator('[data-command-tab="kingdom"]').click();
    await page.locator("#command-close").click();

    // The construction menu must place visible road tiles through normal map input.
    await page.locator("#build-open-btn").click();
    assert.ok(await page.locator("#build-modal").isVisible(),"construction dialog must open");
    assert.equal(await page.locator("[data-road-type]").count(),3,"all three road tiers must be available");
    await page.locator('[data-road-type="dirt"]').click();
    assert.ok(await page.locator("#build-modal").evaluate(el=>el.classList.contains("hidden")),"choosing a road must return to the map");
    assert.ok(await page.locator("#road-build-cancel").isVisible(),"road mode must expose a clear exit control");
    const roadFixture=await page.evaluate(async()=>{
        const [{state},{isWaterAt},{BUILDING_SIZE}]=await Promise.all([
            import("./js/core/state.js"),import("./js/world/world.js"),import("./js/core/config.js")
        ]);
        const rect=document.querySelector("#canvas").getBoundingClientRect();
        for(let radius=3;radius<18;radius++){
            for(let x=80-radius;x<=80+radius;x++){
                for(let y=80-radius;y<=80+radius;y++){
                    if(x<0||y<0||x>=160||y>=160||!state.explored?.[x]?.[y]||isWaterAt(x+.5,y+.5))continue;
                    const occupied=state.entities.some(entity=>{
                        if(entity.dead||!entity.isBuilding?.())return false;
                        const size=BUILDING_SIZE[entity.type]||{w:1,h:1};
                        const scale=Math.max(.25,Math.min(6,Number(entity.footprintScale)||1));
                        return Math.abs(x+.5-(entity.x+.5))<size.w*scale/2&&Math.abs(y+.5-(entity.y+.5))<size.h*scale/2;
                    });
                    if(occupied)continue;
                    const screenX=(x+.5)*48*state.zoom-state.camera.x+rect.left;
                    const screenY=(y+.5)*48*state.zoom-state.camera.y+rect.top;
                    if(screenX<rect.left+4||screenX>rect.right-4||screenY<rect.top+4||screenY>rect.bottom-4)continue;
                    return {x,y,screenX,screenY};
                }
            }
        }
        throw new Error("No explored, dry and unoccupied road test tile is visible");
    });
    await page.mouse.click(roadFixture.screenX,roadFixture.screenY);
    assert.equal(await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).getRoadAt(x,y)?.type,{x:roadFixture.x,y:roadFixture.y}),"dirt","map click must create a persistent road tile");
    const roadDragTarget=await page.evaluate(async({x,y})=>{
        const [{state},{isWaterAt},{BUILDING_SIZE},{getRoadAt}]=await Promise.all([
            import("./js/core/state.js"),import("./js/world/world.js"),import("./js/core/config.js"),import("./js/systems/roads.js")
        ]);
        const rect=document.querySelector("#canvas").getBoundingClientRect();
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const tx=x+dx,ty=y+dy;
            if(tx<0||ty<0||tx>=160||ty>=160||!state.explored?.[tx]?.[ty]||isWaterAt(tx+.5,ty+.5)||getRoadAt(tx,ty))continue;
            const occupied=state.entities.some(entity=>{
                if(entity.dead||!entity.isBuilding?.())return false;
                const size=BUILDING_SIZE[entity.type]||{w:1,h:1};
                const scale=Math.max(.25,Math.min(6,Number(entity.footprintScale)||1));
                return Math.abs(tx+.5-(entity.x+.5))<size.w*scale/2&&Math.abs(ty+.5-(entity.y+.5))<size.h*scale/2;
            });
            if(occupied)continue;
            const screenX=(tx+.5)*48*state.zoom-state.camera.x+rect.left;
            const screenY=(ty+.5)*48*state.zoom-state.camera.y+rect.top;
            if(screenX<rect.left+4||screenX>rect.right-4||screenY<rect.top+4||screenY>rect.bottom-4)continue;
            return {x:tx,y:ty,screenX,screenY};
        }
        throw new Error("No adjacent road drag target is available");
    },{x:roadFixture.x,y:roadFixture.y});
    await page.mouse.move(roadFixture.screenX,roadFixture.screenY);
    await page.mouse.down();
    await page.mouse.move(roadDragTarget.screenX,roadDragTarget.screenY,{steps:6});
    await page.mouse.up();
    assert.equal(await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).getRoadAt(x,y)?.type,{x:roadDragTarget.x,y:roadDragTarget.y}),"dirt","dragging across the map must place the next road tile");
    await page.keyboard.press("Escape");
    assert.ok(await page.locator("#road-build-cancel").evaluate(el=>el.classList.contains("hidden")),"Escape must leave road build mode");

    // Demolition is an explicit build mode and returns part of the materials.
    await page.locator("#build-open-btn").click();
    await page.locator("[data-road-remove]").click();
    assert.ok(await page.locator("#road-build-cancel").isVisible(),"bulldoze mode must expose the exit control");
    await page.mouse.click(roadDragTarget.screenX,roadDragTarget.screenY);
    assert.equal(await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).getRoadAt(x,y),{x:roadDragTarget.x,y:roadDragTarget.y}),null,"bulldozing must remove the selected road tile");
    await page.keyboard.press("Escape");

    // Strategy command deck: open the modal, then navigate its internal tab bar.
    await page.locator("#command-open-btn").click();
    assert.ok(await page.locator("#command-modal").isVisible(),"management dialog must open from the top bar");
    assert.equal(await page.locator("#command-modal .command-deck [data-command-tab]").count(),20,"all twenty management tabs, including the city charter, must live inside the dialog");
    assert.equal(await page.locator("#command-panel-content .command-panel-intro h3").innerText(),"Kingdom overview","management must open on the live kingdom overview");
    await page.locator('[data-command-tab="kingdom"]').click();
    assert.equal(await page.locator("body > .command-deck").count(),0,"there must be no obscured duplicate navigation outside the dialog");
    await page.locator('[data-command-tab="government"]').click();
    assert.equal(await page.locator("#command-modal").isVisible(),true);
    await page.locator('[data-command="government-form"][data-value="council"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Crowned council"));

    // The named garrison and the public-health chain are real management
    // screens. Grant a deterministic fixture, then execute the actual actions a
    // player uses: recruit, drill, set sanitary works, quarantine, appoint a
    // healer and brew medicine. These assertions inspect the live state, not
    // only rendered labels.
    await page.evaluate(async()=>{
        const [{state},{ensureForestGathering},{recordResourceMovement}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/forest-gathering.js"),import("./js/systems/goods-book.js")
        ]);
        state.resources.gold=Math.max(650,Number(state.resources.gold)||0);
        const foodGrant=Math.max(0,650-Number(state.resources.food||0));
        state.resources.food=650;
        if(foodGrant>0)recordResourceMovement("food",foodGrant,"test-fixture");
        state.resources.wood=Math.max(350,Number(state.resources.wood)||0);
        state.resources.stone=Math.max(300,Number(state.resources.stone)||0);
        const ledger=ensureForestGathering();
        ledger.stock.herbs=Math.max(12,Number(ledger.stock.herbs)||0);
        ledger.stock.lichen=Math.max(6,Number(ledger.stock.lichen)||0);
    });
    await page.locator('[data-command-tab="military"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Barracks & stables"));
    const militaryBefore=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {population:state.entities.filter(entity=>!entity.dead&&entity.type===20).length,soldiers:state.entities.filter(entity=>!entity.dead&&entity.military).length};
    });
    await page.locator("#military-recruit-select").selectOption({index:1});
    await page.locator('[data-command="military-recruit"]').click();
    const militaryAfterRecruit=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const soldiers=state.entities.filter(entity=>!entity.dead&&entity.military);
        return {population:state.entities.filter(entity=>!entity.dead&&entity.type===20).length,soldiers:soldiers.length,recruit:soldiers.find(entity=>entity.military.origin==="levy")?.person?.name||""};
    });
    assert.equal(militaryAfterRecruit.soldiers,militaryBefore.soldiers+1,"recruiting must add a real soldier");
    assert.equal(militaryAfterRecruit.population,militaryBefore.population-1,"a recruit must leave the civilian population");
    assert.ok(militaryAfterRecruit.recruit,"the new soldier must retain a named person record");
    await page.locator('[data-command="military-train"]').first().click();
    const drill=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const soldier=state.entities.find(entity=>!entity.dead&&entity.military?.trainingCompletesTick>state.tick);
        return soldier?{name:soldier.person.name,remaining:soldier.military.trainingCompletesTick-state.tick}:null;
    });
    assert.ok(drill&&drill.remaining>0,"training must start a real timed drill for a named soldier");
    await page.locator('[data-command-tab="health"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Sanitation, healers & medicine"));
    await page.locator('[data-command="health-sanitation"]').click();
    const sanitationAfter=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const {getHealthSnapshot}=await import("./js/systems/health.js");
        return {score:getHealthSnapshot().sanitation,latrines:state.health.sanitation.latrines};
    });
    assert.ok(sanitationAfter.score>0&&sanitationAfter.latrines>0,"sanitary works must change the real health state");
    await page.locator('[data-command="health-quarantine"][data-value="1"]').click();
    await page.locator("#health-healer-select").selectOption({index:1});
    await page.locator('[data-command="health-appoint"]').click();
    await page.locator('[data-command="health-brew"]').click();
    const publicHealthAfter=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const {getHealthSnapshot}=await import("./js/systems/health.js");
        const snapshot=getHealthSnapshot();
        return {quarantine:snapshot.quarantineLevel,healers:snapshot.healers.map(entry=>entry.name),medicine:snapshot.medicineStock,sanitation:snapshot.sanitation};
    });
    assert.equal(publicHealthAfter.quarantine,1,"quarantine must be ordered in the live state");
    assert.equal(publicHealthAfter.healers.length,1,"a named healer must be appointed");
    assert.ok(publicHealthAfter.medicine>=5,"brewing must add real medicine doses");
    console.log("Military/public-health E2E:",JSON.stringify({militaryAfterRecruit,drill,sanitationAfter,publicHealthAfter}));

    // Faith & justice: build one structure per system through the real
    // construction menu, appoint named office holders, execute a core annual
    // action and prove that people, records, cases and sentences survive a
    // save/load round trip.
    if(await page.locator("#command-modal").isVisible())await page.locator("#command-close").click();
    const clearRealmEvent=async()=>{
        if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-dismiss").click();
        await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");if(state.activeEvent&&!state.activeEvent.dismissed)state.activeEvent=null;});
    };
    await clearRealmEvent();
    await page.evaluate(async()=>{
        const [{state},{recordResourceMovement}]=await Promise.all([import("./js/core/state.js"),import("./js/systems/goods-book.js")]);
        const raise=(key,target)=>{
            const current=Number(state.resources[key])||0;
            if(current>=target)return;
            state.resources[key]=target;
            if(key==="food")recordResourceMovement("food",target-current,"test-fixture");
        };
        raise("gold",950);raise("wood",600);raise("stone",600);
        state.morale=Math.max(60,Number(state.morale)||0);
    });
    const buildStructure=async(type,category)=>{
        await page.locator("#build-open-btn").click();
        await page.locator('[data-build-category="'+category+'"]').click();
        const option=page.locator('[data-build-type="'+type+'"]');
        assert.equal(await option.count(),1,"build menu must offer structure "+type);
        await option.click();
        assert.equal(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return Number(state.directBuildType);}),type,"choosing a structure must enter real placement mode");
        const spot=await page.evaluate(async({type})=>{
            const [{state},{canPlaceBuilding}]=await Promise.all([import("./js/core/state.js"),import("./js/systems/construction.js")]);
            const rect=document.querySelector("#canvas").getBoundingClientRect();
            for(let radius=4;radius<30;radius++){
                for(let x=80-radius;x<=80+radius;x++){
                    for(let y=80-radius;y<=80+radius;y++){
                        if(x<0||y<0||x>=160||y>=160||!state.explored?.[x]?.[y])continue;
                        if(!canPlaceBuilding(type,x,y).ok)continue;
                        const screenX=(x+.5)*48*state.zoom-state.camera.x+rect.left;
                        const screenY=(y+.5)*48*state.zoom-state.camera.y+rect.top;
                        if(screenX<rect.left+4||screenX>rect.right-4||screenY<rect.top+4||screenY>rect.bottom-4)continue;
                        return {x,y,screenX,screenY};
                    }
                }
            }
            throw new Error("No visible legal site for structure "+type);
        },{type});
        await page.mouse.click(spot.screenX,spot.screenY);
        const site=await page.evaluate(async({type})=>{
            const {state}=await import("./js/core/state.js");
            const entity=state.entities.find(item=>!item.dead&&item.type===type&&item.construction&&Number(item.construction.stage)<3);
            return entity?{id:entity.id,stage:Number(entity.construction.stage)}:null;
        },{type});
        assert.ok(site,"placing structure "+type+" must create a real construction site");
        await page.keyboard.press("Escape");
        return {spot,site};
    };
    const shrineSite=await buildStructure(70,"faith");
    const courtSite=await buildStructure(71,"justice");
    // Freeze the realm only after placement: the canvas ignores build clicks
    // while paused, and a running tick can pop a realm event over the deck.
    await page.evaluate(()=>{const button=document.querySelector("#pause-btn");if(button&&!button.classList.contains("is-paused"))button.click();});
    await clearRealmEvent();

    await clearRealmEvent();
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="faith"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Faith & culture"),"faith panel must render its own introduction");
    await page.locator("#faith-clergy-select").selectOption({index:1});
    await page.locator('[data-command="faith-appoint"]').click();
    await page.locator('[data-command="faith-festival"][data-value="harvest"]').click();
    await clearRealmEvent();
    const faithBeforeSave=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const {getFaithSnapshot}=await import("./js/systems/faith.js");
        return {clergy:state.faith.clergy.map(entry=>({personId:entry.personId,name:entry.name,conviction:entry.conviction,competence:entry.competence})),history:state.faith.history.map(entry=>entry.summary),festival:state.faith.festival.lastKind,demand:getFaithSnapshot().modifiers.festivalDemand,shrineSites:state.entities.filter(entity=>!entity.dead&&entity.type===70&&entity.construction).length};
    });
    assert.equal(faithBeforeSave.clergy.length,1,"faith appointment must create a named cleric");
    assert.equal(faithBeforeSave.festival,"harvest","the harvest festival must be recorded");
    assert.ok(faithBeforeSave.demand>0,"the festival must create real market demand");

    await clearRealmEvent();
    await page.locator('[data-command-tab="justice"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Justice & order"),"justice panel must render its own introduction");
    await page.locator("#justice-judge-select").selectOption({index:1});
    await page.locator('[data-command="justice-appoint"]').click();
    const caseFixture=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const {updateJustice}=await import("./js/systems/justice.js");
        state.year+=1;
        state.economy.unemployed=14;
        state.economy.lastLedger={foodDemand:30,foodShortage:24,foodConsumed:6};
        updateJustice();
        return {cases:state.justice.cases.length};
    });
    assert.ok(caseFixture.cases>=1,"the annual justice audit must open at least one real case");
    await clearRealmEvent();
    await page.locator('[data-command-tab="justice"]').click();
    assert.ok(await page.locator("#command-panel-content .justice-case").count()>=1,"pending cases must render as individual records");
    await clearRealmEvent();
    const goldBeforeVerdict=await page.evaluate(async()=>Number((await import("./js/core/state.js")).state.resources.gold)||0);
    await page.locator("#command-panel-content .justice-case [data-command='justice-verdict']").first().click();
    const justiceAfterVerdict=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {fines:state.justice.sentenceTotals.fine,gold:state.resources.gold,judges:state.justice.judges.map(entry=>entry.name)};
    });
    assert.equal(justiceAfterVerdict.fines,1,"a fine verdict must be recorded in the sentence ledger");
    assert.ok(justiceAfterVerdict.gold>goldBeforeVerdict,"a fine must add real gold to the treasury");
    const justiceBeforeSave=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {judges:state.justice.judges.map(entry=>({personId:entry.personId,name:entry.name,competence:entry.competence,integrity:entry.integrity})),history:state.justice.history.map(entry=>entry.summary),cases:state.justice.cases.map(entry=>entry.id),fines:state.justice.sentenceTotals.fine,courtSites:state.entities.filter(entity=>!entity.dead&&entity.type===71&&entity.construction).length};
    });
    assert.equal(justiceBeforeSave.judges.length,1,"the appointed judge must hold a named seat");
    await clearRealmEvent();
    await page.locator('[data-command-tab="research"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Research & knowledge"),"research panel must render its own introduction");
    const researchStart=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const {startResearch,getResearchModifiers}=await import("./js/systems/research.js");
        state.research.reserve=120;
        const result=startResearch("written-law");
        return {ok:result.ok,completed:result.completed?result.completed.id:null,count:getResearchModifiers().completedCount};
    });
    assert.equal(researchStart.ok,true,"a reserved project must start from live research state");
    assert.equal(researchStart.completed,"written-law","a fully reserved project must complete immediately");
    assert.ok(researchStart.count>=1,"a completed technology must feed the shared modifier block");
    await clearRealmEvent();
    await page.locator('[data-command-tab="research"]').click();
    assert.equal(await page.locator("[data-research-tech]").count(),24,"all twenty-four technologies must render");
    assert.ok(await page.locator('[data-research-tech][data-research-status="complete"]').count()>=1,"the completed technology must render as complete");
    const civilizationBeforeSave=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {completed:Object.keys(state.research.completed).sort(),legacy:state.legacy.entries.length,kingdomName:state.identity?state.identity.kingdomName:null,heraldry:state.identity?state.identity.emblem+" on "+state.identity.banner:null};
    });
    assert.ok(civilizationBeforeSave.completed.includes("written-law"),"research completion must live in state");
    assert.ok(civilizationBeforeSave.legacy>=1,"the founding deed must be recorded in legacy");
    assert.ok(civilizationBeforeSave.kingdomName,"realm identity must be present in live state");
    if(await page.locator("#command-modal").isVisible())await page.locator("#command-close").click();
    await clearRealmEvent();
    await page.locator("#save-btn").click();
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Realm saved"),null,{timeout:5000});
    await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        state.faith.clergy=[];
        state.faith.history=[];
        state.justice.judges=[];
        state.justice.history=[];
        state.justice.cases=[];
        state.justice.sentenceTotals.fine=0;
    });
    await page.evaluate(()=>{
        document.querySelector("#load-btn").click();
        const pause=document.querySelector("#pause-btn");
        if(pause&&!pause.classList.contains("is-paused"))pause.click();
    });
    await page.waitForFunction(()=>{const message=document.querySelector("#status-message")?.textContent||"";return message.includes("Loaded realm")||message.includes("Load failed")||message.includes("No valid saved realm");},null,{timeout:5000});
    assert.ok((await page.locator("#status-message").innerText()).includes("Loaded realm"));
    const afterLoad=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {clergy:state.faith.clergy.map(entry=>({personId:entry.personId,name:entry.name,conviction:entry.conviction,competence:entry.competence})),faithHistory:state.faith.history.map(entry=>entry.summary),festival:state.faith.festival.lastKind,judges:state.justice.judges.map(entry=>({personId:entry.personId,name:entry.name,competence:entry.competence,integrity:entry.integrity})),justiceHistory:state.justice.history.map(entry=>entry.summary),cases:state.justice.cases.map(entry=>entry.id),fines:state.justice.sentenceTotals.fine,shrineSites:state.entities.filter(entity=>!entity.dead&&entity.type===70&&entity.construction).length,courtSites:state.entities.filter(entity=>!entity.dead&&entity.type===71&&entity.construction).length};
    });
    assert.deepEqual(afterLoad.clergy,faithBeforeSave.clergy,"save/load must restore named clergy exactly");
    assert.deepEqual(afterLoad.faithHistory,faithBeforeSave.history,"save/load must restore the faith record exactly");
    assert.equal(afterLoad.festival,faithBeforeSave.festival,"save/load must restore the last festival");
    assert.deepEqual(afterLoad.judges,justiceBeforeSave.judges,"save/load must restore named judges exactly");
    assert.deepEqual(afterLoad.justiceHistory,justiceBeforeSave.history,"save/load must restore the justice record exactly");
    assert.deepEqual(afterLoad.cases,justiceBeforeSave.cases,"save/load must restore the pending case roll exactly");
    assert.equal(afterLoad.fines,justiceBeforeSave.fines,"save/load must restore sentence totals");
    assert.ok(afterLoad.shrineSites>=1&&afterLoad.courtSites>=1,"both newly built sites must survive save/load");
    await clearRealmEvent();
    console.log("Faith/justice E2E:",JSON.stringify({shrineSite:shrineSite.site,courtSite:courtSite.site,faith:{clergy:afterLoad.clergy.length,history:afterLoad.faithHistory.length,festival:afterLoad.festival},justice:{judges:afterLoad.judges.length,history:afterLoad.justiceHistory.length,cases:afterLoad.cases.length,fines:afterLoad.fines}}));
    if(await page.evaluate(()=>document.querySelector("#pause-btn")?.classList.contains("is-paused")))await page.locator("#pause-btn").click();
    await clearRealmEvent();
    await page.locator("#command-open-btn").click();

    await page.locator('[data-command-tab="politics"]').click();
    await page.locator('[data-command="policy"][data-value="bread"]').click();
    await page.locator('[data-command-tab="diplomacy"]').click();
    assert.equal(await page.locator("#command-panel-content [data-diplomacy-realm]").count(),4,"the diplomatic court must render all four neighbouring realms");
    await page.locator('[data-command-tab="decisions"]').click();
    await page.locator("#royal-consort-select").selectOption({index:1});
    await page.locator('[data-command="consort"]').click();
    await page.locator('[data-command="royal-birth"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("LIVING ROYAL CHILDREN"));

    // The dynasty panel draws a connected network from persisted kinship edges.
    await page.locator('[data-command-tab="dynasty"]').click();
    const dynastyGraphFixture=await page.evaluate(async()=>{
        const {getRoyalHouse}=await import("./js/systems/royal-dynasty.js");
        const house=getRoyalHouse();
        return {heirId:String(house.heir?.personId||""),childCount:(house.children||[]).length};
    });
    assert.ok(dynastyGraphFixture.heirId,"royal birth should leave a designated heir for the graph test");
    assert.equal(await page.locator("#command-panel-content .dynasty-lineage-graph").count(),1);
    assert.ok(await page.locator("#command-panel-content .dynasty-lineage-graph [data-lineage-node-id]").count()>=3,"lineage graph must render the sovereign, consort and recorded child");
    await page.waitForFunction(()=>[...document.querySelectorAll(".dynasty-lineage-graph .dynasty-lineage-edge")].some(path=>path.getAttribute("d")?.length>0),null,{timeout:5000});
    const lineageNodeCount=await page.locator("#command-panel-content .dynasty-lineage-graph [data-lineage-node-id]").count();
    const lineageEdgeCount=await page.locator("#command-panel-content .dynasty-lineage-graph .dynasty-lineage-edge").count();
    assert.ok(lineageEdgeCount>=2,"recorded partnership and parent-child links must have connector paths");
    assert.ok(lineageNodeCount<=80&&lineageEdgeCount<=120,"lineage rendering must respect hard node and edge caps");
    await page.locator('#command-panel-content .dynasty-lineage-graph [data-lineage-node-id="'+dynastyGraphFixture.heirId+'"]').click();
    assert.equal(await page.locator("#people-modal").isVisible(),true,"selecting a graph node must open the canonical person dossier");
    assert.ok((await page.locator("#person-dossier").innerText()).includes("PERSONALITY"));
    await page.locator("#people-close").click();
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="dynasty"]').click();
    await page.locator('[data-command-tab="creatures"]').click();
    await page.evaluate(async()=>{
        const [{state},{recordResourceMovement}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/goods-book.js")
        ]);
        state.resources.gold=250;
        const foodDelta=250-Number(state.resources.food||0);
        state.resources.food=250;
        if(foodDelta!==0)recordResourceMovement("food",foodDelta,"test-fixture");
    });
    await page.locator('[data-command="summon-dragon"]').click();
    const creatureFixture=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {gold:state.resources.gold,food:state.resources.food,dragons:state.entities.filter(entity=>!entity.dead&&entity.isDragon).map(entity=>entity.creature?.name||entity.id)};
    });
    console.log("Creature dossier fixture:",JSON.stringify(creatureFixture));
    assert.ok(await page.locator("#command-panel-content .creature-record:not(.is-memorial)").count()>=1,"summoned dragon must have an individual dossier");
    const dragonPortrait=page.locator("#command-panel-content .creature-record:not(.is-memorial) .creature-portrait").first();
    const dragonStage=await dragonPortrait.getAttribute("data-life-stage");
    assert.ok(["hatchling","juvenile","adult","elder","ancient"].includes(dragonStage),"dragon portrait must reflect its actual life stage");
    assert.equal(await dragonPortrait.locator("use").getAttribute("href"),"assets/royal-dragon-atlas.svg#dragon-"+dragonStage);

    await page.locator("#command-panel-content .creature-record:not(.is-memorial) > summary").first().click();
    assert.ok((await page.locator("#command-panel-content .creature-dossier").innerText()).includes("PERSONAL MEMORIES"));

    await page.locator('[data-command-tab="economy"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("LATEST FINANCIAL SETTLEMENT"));
    assert.ok(await page.locator("#command-panel-content .ledger-grid").isVisible(),"economy must render the real ledger section");
    await page.locator('[data-command-tab="buildings"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Building register"));
    assert.ok(await page.locator("#command-panel-content .building-record").count()>=1,"starting realm structures must be listed");
    assert.ok(await page.locator("#command-panel-content .building-record-art").count()>=1,"building register must show original sprite artwork");
    const buildingArtSources=await page.locator("#command-panel-content .building-record-art use").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("href")));
    assert.ok(buildingArtSources.every(source=>source?.startsWith("assets/royal-building-atlas.svg#")),"every building must use the dedicated royal atlas");

    // The building register must expose the real forest-product action on a
    // reachable forest tile, not just descriptive site data. This follows the
    // same UI path a player takes: open the building record, then gather.
    const forestFixture=await page.evaluate(async()=>{
        const [{state},{TYPE},{findNearestResourceNode,getResourceNodeAt},{forestProductsAt}]=await Promise.all([
            import("./js/core/state.js"),import("./js/core/types.js"),
            import("./js/systems/resource-geography.js"),import("./js/systems/forest-gathering.js")
        ]);
        const buildings=state.entities.filter(entity=>!entity.dead&&entity.isBuilding?.()&&[TYPE.LUMBER,TYPE.FORESTER].includes(entity.type));
        if(!buildings.length)throw new Error("No lumber yard or forester exists in the starting realm");
        const initialDay=state.dayOfYear;
        const woodInRange=products=>products.goods.slice(0,5).some(good=>good.category==="wood");
        let chosen=null;
        for(const day of [state.dayOfYear,250,150,50]){
            for(const building of buildings){
                const node=findNearestResourceNode("forest",building.x,building.y,7);
                if(!node)continue;
                const products=forestProductsAt(node.x,node.y,day);
                if(!products?.goods?.length||!woodInRange(products))continue;
                chosen={buildingId:building.id,buildingType:building.type,original:{x:building.x,y:building.y},node:{x:node.x,y:node.y},day,goods:products.goods.map(good=>good.id),moved:false};
                break;
            }
            if(chosen)break;
        }
        if(!chosen){
            // If the seeded settlement is not already next to a forest, move one
            // lumber building temporarily instead of inventing a resource node.
            const building=buildings[0];
            let best=null;
            for(let radius=1;radius<=48&&!best;radius++){
                for(let dy=-radius;dy<=radius&&!best;dy++){
                    for(let dx=-radius;dx<=radius;dx++){
                        if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
                        const x=building.x+dx,y=building.y+dy;
                        if(x<0||y<0||x>=state.worldW||y>=state.worldH)continue;
                        const node=getResourceNodeAt(x,y);
                        if(!node?.forestCapacity||!node.forestStock)continue;
                        for(const day of [state.dayOfYear,250,150,50]){
                            const products=forestProductsAt(x,y,day);
                            if(products?.goods?.length&&woodInRange(products)){
                                best={x,y,day,goods:products.goods.map(good=>good.id)};
                                break;
                            }
                        }
                        if(best)break;
                    }
                }
            }
            if(!best)throw new Error("No forest tile with a gatherable wood product was found");
            chosen={buildingId:building.id,buildingType:building.type,original:{x:building.x,y:building.y},node:{x:best.x,y:best.y},day:best.day,goods:best.goods,moved:true};
            building.x=best.x;building.y=best.y;
        }
        state.dayOfYear=chosen.day;
        return {...chosen,initialDay,dayOfYear:chosen.day};
    });
    assert.ok(forestFixture.goods.some(id=>["timber","firewood","charcoal"].includes(id)),"the fixture must select a real wood product");
    const forestGatherButton=page.locator('#command-panel-content [data-gather-forest="'+forestFixture.buildingId+'"]');
    assert.equal(await forestGatherButton.count(),1,"the selected forest building must expose one gather action");
    await forestGatherButton.evaluate(element=>{const record=element.closest("details");if(record)record.open=true;});
    await forestGatherButton.scrollIntoViewIfNeeded();
    assert.equal((await forestGatherButton.innerText()).trim(),"GATHER FOREST PRODUCTS");
    const beforeGather=await page.evaluate(async({node})=>{
        const [{state},{getResourceNodeAt}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/resource-geography.js")
        ]);
        const ledger=state.forestGathering;
        return {
            stock:{...(ledger?.stock||{})},
            total:Object.values(ledger?.stock||{}).reduce((sum,value)=>sum+Number(value||0),0),
            history:ledger?.history?.length||0,
            nodeStock:getResourceNodeAt(node.x,node.y)?.forestStock
        };
    },forestFixture);
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-dismiss").click();
    await forestGatherButton.click();
    await page.waitForFunction(()=>document.querySelector("#action-toast")?.textContent.includes("GATHERED"),null,{timeout:5000});
    const gatherToast=(await page.locator("#action-toast").innerText()).trim();
    assert.match(gatherToast,/^GATHERED /,"the gather action must confirm the collected products");
    const afterGather=await page.evaluate(async({node})=>{
        const [{state},{getResourceNodeAt}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/resource-geography.js")
        ]);
        const ledger=state.forestGathering;
        return {
            stock:{...(ledger?.stock||{})},
            total:Object.values(ledger?.stock||{}).reduce((sum,value)=>sum+Number(value||0),0),
            history:ledger?.history?.length||0,
            nodeStock:getResourceNodeAt(node.x,node.y)?.forestStock
        };
    },forestFixture);
    assert.ok(afterGather.total>beforeGather.total,"the gather action must increase the persisted forest-product ledger");
    assert.ok(afterGather.history>beforeGather.history,"the gather action must append a history entry");
    assert.ok(afterGather.nodeStock<beforeGather.nodeStock,"gathering timber or firewood must reduce the real forest tile stock");
    console.log("Forest product button E2E:",JSON.stringify({...forestFixture,before:beforeGather,after:afterGather,toast:gatherToast}));

    // Herbs and lichen are medicine, not only food. The real delivery action
    // must sell them through the gold path and remove exactly what was sold.
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-dismiss").click();
    // The management dialog is open for the delivery control, so click the
    // real pause button programmatically instead of letting the overlay
    // intercept a pointer click. The button handler and state transition are
    // the same; only the synthetic pointer path is bypassed.
    await page.evaluate(()=>document.querySelector("#pause-btn").click());
    await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="RESUME",null,{timeout:3000});
    const goldDeliveryBefore=await page.evaluate(async()=>{
        const [{state},{ensureForestGathering},{renderUI}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/forest-gathering.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        ensureForestGathering();
        // Isolate the medicinal goods so the gold delta can only come from them.
        for(const good of Object.keys(state.forestGathering.stock))state.forestGathering.stock[good]=0;
        state.forestGathering.stock.herbs=4;
        state.forestGathering.stock.lichen=3;
        renderUI();
        return {gold:Number(state.resources.gold)||0,herbs:state.forestGathering.stock.herbs,lichen:state.forestGathering.stock.lichen};
    });
    const forestDeliverButton=page.locator('#command-panel-content [data-deliver-forest="'+forestFixture.buildingId+'"]');
    assert.equal(await forestDeliverButton.count(),1,"the selected forest building must expose the delivery action");
    await forestDeliverButton.evaluate(element=>{const record=element.closest("details");if(record)record.open=true;});
    await forestDeliverButton.scrollIntoViewIfNeeded();
    assert.equal(await forestDeliverButton.isEnabled(),true,"the delivery action must be enabled for stored herbs and lichen");
    await forestDeliverButton.click();
    await page.waitForFunction(()=>document.querySelector("#action-toast")?.textContent.includes("DELIVERED"),null,{timeout:5000});
    const goldDeliveryAfter=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {gold:Number(state.resources.gold)||0,herbs:Number(state.forestGathering.stock.herbs)||0,lichen:Number(state.forestGathering.stock.lichen)||0,toast:document.querySelector("#action-toast")?.textContent.trim()||""};
    });
    assert.equal(goldDeliveryAfter.gold-goldDeliveryBefore.gold,4,"4 herbs and 3 lichen must sell for 4 gold through the gold-delivery path");
    assert.equal(goldDeliveryAfter.herbs,0,"delivered herbs must leave the forest ledger");
    assert.equal(goldDeliveryAfter.lichen,0,"delivered lichen must leave the forest ledger");
    console.log("Herb and lichen gold delivery E2E:",JSON.stringify({before:goldDeliveryBefore,after:goldDeliveryAfter}));
    await page.evaluate(()=>document.querySelector("#pause-btn").click());
    await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="PAUSE",null,{timeout:3000});

    await page.evaluate(async({buildingId,original,initialDay})=>{
        const {state}=await import("./js/core/state.js");
        const building=state.entities.find(entity=>String(entity.id)===String(buildingId));
        if(building){building.x=original.x;building.y=original.y;}
        state.dayOfYear=initialDay;
    },forestFixture);

    // The formation reference proves occurrence; this proves the production
    // renderer draws each conifer onto its own pixels. Yew and dwarf pine must
    // not collapse into spruce, fir, pine, larch or juniper.
    const coniferSilhouettes=await page.evaluate(async()=>{
        const [{drawConifer},{FOREST_SPECIES}]=await Promise.all([
            import("./js/presentation/rendering/terrain.js"),
            import("./js/world/forest-ecology.js")
        ]);
        const hash=data=>{
            let value=2166136261>>>0;
            for(let index=0;index<data.length;index++){value^=data[index];value=Math.imul(value,16777619)>>>0;}
            return value.toString(16).padStart(8,"0");
        };
        const ids=Object.keys(FOREST_SPECIES).filter(id=>FOREST_SPECIES[id]?.conifer===true);
        const hashes={};
        for(const id of ids){
            const canvas=document.createElement("canvas");
            canvas.width=160;
            canvas.height=190;
            const ctx=canvas.getContext("2d",{willReadFrequently:true});
            drawConifer(ctx,80,160,2.4,0,0.5,150,"northern",1,id,null,null);
            hashes[id]=hash(ctx.getImageData(0,0,canvas.width,canvas.height).data);
        }
        return {ids,hashes};
    });
    assert.ok(coniferSilhouettes.ids.includes("yew")&&coniferSilhouettes.ids.includes("dwarf-pine"),"the production renderer must expose both new conifers");
    assert.equal(new Set(Object.values(coniferSilhouettes.hashes)).size,coniferSilhouettes.ids.length,"every conifer species must render distinct pixels: "+JSON.stringify(coniferSilhouettes));
    for(const id of ["yew","dwarf-pine"]){
        for(const other of coniferSilhouettes.ids.filter(candidate=>candidate!==id)){
            assert.notEqual(coniferSilhouettes.hashes[id],coniferSilhouettes.hashes[other],id+" must not render as "+other);
        }
    }
    console.log("Conifer renderer E2E:",JSON.stringify(coniferSilhouettes));

    await page.locator("#building-search").fill("farm");
    assert.ok(await page.locator("#command-panel-content .building-record:not(.is-filtered)").count()>=1,"building filter must retain matching structures");
    await page.locator("#building-search").fill("");

    // The movement ledger must show real production and transport records, not
    // a static explanation. Production runs every six ticks, so wait for it.
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-dismiss").click();
    await page.locator('[data-command-tab="buildings"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("MOVEMENT ARCHIVE"),"transport overview must expose the movement archive");
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("GOODS AUDIT"),"transport overview must expose the goods audit");
    assert.ok(await page.locator("#command-panel-content .warehouse-row").count()>=1,"the store overview must list every warehouse");
    assert.ok(await page.locator("#command-panel-content .logistics-audit").count()>=10,"the audit must expose every physical good and royal food");
    const blockedAudit=await page.locator("#command-panel-content .logistics-audit.is-blocked").evaluateAll(nodes=>nodes.map(node=>node.innerText));
    assert.equal(blockedAudit.length,0,"a fresh realm must reconcile every physical good and royal food: "+JSON.stringify(blockedAudit));
    await page.waitForFunction(()=>document.querySelectorAll("#command-panel-content .logistics-movement").length>0,null,{timeout:15000});
    const movementTypes=await page.locator("#command-panel-content .logistics-movement").evaluateAll(nodes=>nodes.map(node=>node.dataset.movementType));
    assert.ok(movementTypes.length>0&&movementTypes.length<=40,"the movement archive must stay bounded to the newest 40 records");
    assert.ok(movementTypes.every(type=>["produced","consumed","deposited","withdrawn","evacuated","reserved","picked","delivered"].includes(type)),"every ledger row must expose a known movement type: "+movementTypes.join(","));
    await page.waitForFunction(async()=>{
        const {state}=await import("./js/core/state.js");
        return state.city.logistics.ledger.some(entry=>entry.type==="produced");
    },null,{timeout:15000});
    const ledgerAudit=await page.evaluate(async()=>{
        const [{state},{GOOD_KEYS}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/city-config.js")
        ]);
        const ledger=state.city.logistics.ledger;
        return {
            length:ledger.length,
            types:ledger.map(entry=>entry.type),
            resourceEntries:ledger.filter(entry=>entry.scope==="resource"&&entry.good==="food").length,
            invalidScopes:ledger.filter(entry=>entry.scope!==undefined&&!["good","resource"].includes(entry.scope)).map(entry=>entry.scope),
            invalidGoods:ledger.filter(entry=>entry.good!==null&&!GOOD_KEYS.includes(entry.good)&&!(entry.scope==="resource"&&entry.good==="food")).map(entry=>entry.good)
        };
    });
    assert.ok(ledgerAudit.types.includes("produced"),"production output must reach the central ledger");
    assert.ok(ledgerAudit.types.some(type=>["reserved","picked","delivered"].includes(type)),"transport movements must share the same ledger");
    assert.deepEqual(ledgerAudit.invalidGoods,[],"the ledger must never record an unknown good");
    assert.deepEqual(ledgerAudit.invalidScopes,[],"every ledger entry must use a known stock scope");
    assert.ok(ledgerAudit.resourceEntries>=1,"royal food consumption must be booked in the same ledger with resource scope");
    assert.ok(ledgerAudit.length<=600,"the central movement ledger must stay bounded to 600 entries");

    // Pause while the deterministic warehouse fixture is inspected and the
    // demolition feedback is exercised; resume before the map action tests.
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-dismiss").click();
    await page.locator("#command-close").click();
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-dismiss").click();
    await page.locator("#pause-btn").click();
    await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="RESUME",null,{timeout:3000});

    // A fresh, empty warehouse makes the profile switch deterministic even when
    // the seeded stores already hold goods.
    const warehouseFixture=await page.evaluate(async()=>{
        const [{state},{TYPE},{spawnEntity},{ensureInventory},{WAREHOUSE_PROFILES},{isWaterAt},{BUILDING_SIZE}]=await Promise.all([
            import("./js/core/state.js"),import("./js/core/types.js"),import("./js/world/entities.js"),
            import("./js/systems/logistics.js"),import("./js/systems/city-config.js"),
            import("./js/world/world.js"),import("./js/core/config.js")
        ]);
        const occupied=(x,y)=>state.entities.some(entity=>{
            if(entity.dead||!entity.isBuilding?.())return false;
            const size=BUILDING_SIZE[entity.type]||{w:1,h:1};
            const scale=Math.max(.25,Math.min(6,Number(entity.footprintScale)||1));
            return Math.abs(x+.5-(entity.x+.5))<size.w*scale/2+1&&Math.abs(y+.5-(entity.y+.5))<size.h*scale/2+1;
        });
        const findSpot=()=>{
            const centerX=Math.round(state.worldW/2),centerY=Math.round(state.worldH/2);
            for(let radius=4;radius<=48;radius++){
                for(let oy=-radius;oy<=radius;oy++){
                    for(let ox=-radius;ox<=radius;ox++){
                        if(Math.max(Math.abs(ox),Math.abs(oy))!==radius)continue;
                        const x=centerX+ox,y=centerY+oy;
                        if(x<2||y<2||x>=state.worldW-2||y>=state.worldH-2)continue;
                        if(!state.explored?.[x]?.[y]||isWaterAt(x+.5,y+.5)||occupied(x,y))continue;
                        return {x,y};
                    }
                }
            }
            return null;
        };
        const createWarehouse=()=>{
            const spot=findSpot();
            if(!spot)throw new Error("No dry tile was available for the warehouse profile fixture");
            const entity=spawnEntity(spot.x,spot.y,TYPE.WAREHOUSE);
            if(!entity)throw new Error("The warehouse profile fixture could not be created");
            ensureInventory(entity);
            return entity;
        };
        // A second empty store guarantees that the evacuation has somewhere to
        // go, independent of how full the seeded stores are at this point.
        const warehouse=createWarehouse();
        const recipient=createWarehouse();
        const stored=Object.entries(warehouse.warehouse.stored).filter(([,quantity])=>quantity>0).map(([good])=>good);
        const target=Object.values(WAREHOUSE_PROFILES).find(profile=>profile.id!=="general"&&stored.every(good=>profile.filters.includes(good)));
        if(!target)throw new Error("No compatible warehouse profile was available for the fixture");
        return {id:warehouse.id,profile:warehouse.warehouse.profile,stored,targetId:target.id,targetCapacity:target.capacity,targetFilters:[...target.filters]};
    });
    await page.locator('.realm-nav-button[data-kac-panel="buildings"]').click();
    const warehouseSelect=page.locator('[data-warehouse-profile="'+warehouseFixture.id+'"]');
    assert.equal(await warehouseSelect.count(),1,"a warehouse must expose its profile selector");
    const warehouseRecord=page.locator(".building-record").filter({has:warehouseSelect});
    if(!(await warehouseRecord.evaluate(record=>record.open)))await warehouseRecord.locator("summary").click();
    assert.ok((await warehouseRecord.innerText()).includes("Warehouse profile"),"the expanded warehouse must label its profile control");
    await warehouseSelect.selectOption(warehouseFixture.targetId);
    await page.waitForFunction(({id,profile})=>document.querySelector('[data-warehouse-profile="'+id+'"]')?.value===profile,{id:warehouseFixture.id,profile:warehouseFixture.targetId},{timeout:3000});
    assert.match(await page.locator("#action-toast").innerText(),/WAREHOUSE PROFILE UPDATED/i,"profile changes must confirm through the shared toast");
    const appliedProfile=await page.evaluate(async({id})=>{
        const {state}=await import("./js/core/state.js");
        const warehouse=state.entities.find(entity=>entity.id===id);
        return {profile:warehouse.warehouse.profile,capacity:warehouse.warehouse.capacity,filters:[...warehouse.warehouse.filters]};
    },{id:warehouseFixture.id});
    assert.equal(appliedProfile.profile,warehouseFixture.targetId,"the UI must change the real warehouse profile");
    assert.equal(appliedProfile.capacity,warehouseFixture.targetCapacity,"the profile must apply its capacity");
    assert.deepEqual(appliedProfile.filters,warehouseFixture.targetFilters,"the profile must replace the accepted goods filter");

    await page.evaluate(async()=>{
        const [{state},{addLog,triggerRandomEvent}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/events.js")
        ]);
        state.activeEvent=null;
        addLog("E2E CHRONICLE ENTRY","#c5a66b","e2e");
        triggerRandomEvent();
        const {renderUI}=await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
    await page.locator("#realm-event-modal").waitFor({state:"visible",timeout:5000});
    await page.locator("#realm-event-dismiss").click();
    await page.locator("#realm-event-modal").waitFor({state:"hidden",timeout:3000});
    await page.locator('[data-command-tab="chronicle"]').click();
    assert.ok(await page.locator("#command-panel-content .chronicle-entry").count()>=1,"chronicle must render persisted event records");
    await page.locator("#chronicle-search").fill("E2E CHRONICLE ENTRY");
    assert.equal(await page.locator("#command-panel-content .chronicle-entry:not(.is-filtered)").count(),1,"chronicle search must filter actual event text");
    await page.locator("#chronicle-search").fill("");
    await page.locator('[data-command="show-active-event"]').click();
    assert.ok(await page.locator("#realm-event-modal").isVisible(),"chronicle must reopen a dismissed active issue");
    await page.locator("#realm-event-choices .event-choice").first().click();
    await page.locator('[data-command-tab="cards"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Card management"));
    await page.locator("#command-close").click();

    // Demolition must report a full store and keep it intact, then demolish the
    // same store once evacuation space is available without losing its goods.
    const demolitionFixture=await page.evaluate(async({warehouseId})=>{
        const {state}=await import("./js/core/state.js");
        const warehouse=state.entities.find(entity=>entity.id===warehouseId);
        if(!warehouse)throw new Error("The warehouse profile fixture disappeared before demolition");
        for(const key of Object.keys(warehouse.warehouse.stored))warehouse.warehouse.stored[key]=0;
        warehouse.warehouse.stored.logs=1;
        const backup=state.entities.filter(entity=>!entity.dead&&entity.warehouse&&entity.id!==warehouseId)
            .map(entity=>({id:entity.id,filters:[...entity.warehouse.filters]}));
        for(const entity of state.entities){
            if(!entity.dead&&entity.warehouse&&entity.id!==warehouseId)entity.warehouse.filters=[];
        }
        return {id:warehouseId,backup};
    },{warehouseId:warehouseFixture.id});
    await page.evaluate(async({id})=>{
        const [{state},{selectBuilding}]=await Promise.all([
            import("./js/core/state.js"),import("./js/presentation/build-mode.js")
        ]);
        selectBuilding(state.entities.find(entity=>entity.id===id));
    },{id:demolitionFixture.id});
    if(!(await page.locator("#workshop-panel").isVisible()))await page.locator("#workshop-open-btn").click();
    await page.locator("#workshop-panel").waitFor({state:"visible",timeout:3000});
    assert.equal(await page.locator('[data-build-action="demolish"]').isEnabled(),true,"a completed store must be demolishable");
    await page.locator('[data-build-action="demolish"]').click();
    await page.waitForFunction(()=>document.querySelector("#action-toast")?.textContent.includes("CANNOT DEMOLISH"),null,{timeout:3000});
    assert.match(await page.locator("#action-toast").innerText(),/CANNOT DEMOLISH · STORE FULL/i,"a store with nowhere to evacuate must refuse demolition");
    const refusedDemolition=await page.evaluate(async({id})=>{
        const {state}=await import("./js/core/state.js");
        const warehouse=state.entities.find(entity=>entity.id===id);
        return {alive:!warehouse.dead,storedLogs:warehouse.warehouse.stored.logs};
    },{id:demolitionFixture.id});
    assert.equal(refusedDemolition.alive,true,"a refused demolition must keep the store alive");
    assert.equal(refusedDemolition.storedLogs,1,"a refused demolition must keep its goods in the store");
    await page.evaluate(async({backup})=>{
        const {state}=await import("./js/core/state.js");
        for(const row of backup){
            const entity=state.entities.find(entity=>entity.id===row.id);
            if(entity?.warehouse)entity.warehouse.filters=row.filters;
        }
    },{backup:demolitionFixture.backup});
    const logsBeforeEvacuation=await page.evaluate(async({id})=>{
        const {state}=await import("./js/core/state.js");
        return state.entities.filter(entity=>!entity.dead&&entity.warehouse&&entity.id!==id)
            .reduce((sum,entity)=>sum+(entity.warehouse.stored.logs||0),0);
    },{id:demolitionFixture.id});
    await page.locator('[data-build-action="demolish"]').click();
    await page.waitForFunction(()=>document.querySelector("#action-toast")?.textContent.includes("DEMOLISHED"),null,{timeout:3000});
    const successfulDemolition=await page.evaluate(async({id,previousLogs})=>{
        const {state}=await import("./js/core/state.js");
        const warehouse=state.entities.find(entity=>entity.id===id);
        const logsNow=state.entities.filter(entity=>!entity.dead&&entity.warehouse&&entity.id!==id)
            .reduce((sum,entity)=>sum+(entity.warehouse.stored.logs||0),0);
        return {dead:Boolean(warehouse?.dead),logsNow,evacuated:logsNow>=previousLogs+1};
    },{id:demolitionFixture.id,previousLogs:logsBeforeEvacuation});
    assert.equal(successfulDemolition.dead,true,"a successful demolition must remove the structure");
    assert.equal(successfulDemolition.evacuated,true,"demolition must evacuate its stored goods instead of deleting them");
    const evacuationLedger=await page.evaluate(async({id})=>{
        const {state}=await import("./js/core/state.js");
        return state.city.logistics.ledger.filter(entry=>entry.type==="evacuated"&&entry.from==="building:"+id);
    },{id:demolitionFixture.id});
    assert.equal(evacuationLedger.length,1,"a demolition evacuation must be recorded in the central ledger exactly once");
    assert.equal(evacuationLedger[0].quantity,1,"the ledger must record the actually evacuated quantity");
    if(await page.locator("#workshop-panel").isVisible())await page.locator("#workshop-close").click();
    await page.locator("#pause-btn").click();
    await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="PAUSE",null,{timeout:3000});


    // Create deterministic guardian/ward records so the dossier UI can be tested
    // independently of random world population.
    const guardianshipFixture = await page.evaluate(async () => {
        const [{ state }, { Entity, TYPE }, { ensurePersonProfile }, { linkGuardianWard }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/systems/people.js"),
            import("./js/systems/families.js")
        ]);
        const guardian = new Entity(2, 2, TYPE.VILLAGER);
        guardian.id = "e2e-guardian";
        guardian.personId = guardian.id;
        ensurePersonProfile(guardian);
        Object.assign(guardian.person, { name: "E2E Guardian", species: "human", ageYears: 36, lifeStage: "adult" });
        const ward = new Entity(3, 2, TYPE.VILLAGER);
        ward.id = "e2e-ward";
        ward.personId = ward.id;
        ensurePersonProfile(ward);
        Object.assign(ward.person, { name: "E2E Ward", species: "human", ageYears: 9, lifeStage: "young" });
        state.entities.push(guardian, ward);
        const result = linkGuardianWard(guardian.personId, ward.personId, { sinceYear: state.year });
        if (!result.ok) throw new Error("Could not create guardian dossier fixture: " + result.reason);
        return { guardianId: guardian.personId, wardId: ward.personId };
    });

    // Character dossiers are read-only, searchable and expose stable person records.
    await page.locator("#people-btn").click();
    assert.equal(await page.locator("#people-modal").isVisible(),true);
    assert.ok(await page.locator("#people-list .person-list-item").count() >= 1);
    await page.locator("#people-list .person-list-item").first().click();
    assert.ok((await page.locator("#person-dossier").innerText()).includes("PERSONALITY"));
    assert.match(await page.locator("#person-dossier").innerText(), /\b(female|male)\b/i);
    assert.ok((await page.locator("#person-dossier").innerText()).includes("PERSONAL CHRONICLE"));
    await page.locator("#people-search").fill(guardianshipFixture.wardId);
    await page.locator("#people-list .person-list-item").first().click();
    const wardDossier = await page.locator("#person-dossier").innerText();
    assert.ok(wardDossier.includes("GUARDIANS"));
    assert.ok(wardDossier.includes("E2E Guardian"));
    await page.locator("#people-search").fill(guardianshipFixture.guardianId);
    await page.locator("#people-list .person-list-item").first().click();
    const guardianDossier = await page.locator("#person-dossier").innerText();
    assert.ok(guardianDossier.includes("WARDS"));
    assert.ok(guardianDossier.includes("E2E Ward"));
    await page.evaluate(async ({ guardianId, wardId }) => {
        const { state } = await import("./js/core/state.js");
        state.entities = state.entities.filter(entity =>
            entity.personId !== guardianId && entity.personId !== wardId
        );
    }, guardianshipFixture);
    await page.locator("#people-search").fill("no-such-person-should-match");
    assert.equal(await page.locator("#people-list .person-list-item").count(),0);
    await page.locator("#people-search").fill("");
    await page.locator("#people-close").click();
    assert.equal(await page.locator("#people-modal").isVisible(),false);

    // The living sovereign receives a dedicated royal dossier whose heir link
    // navigates to the canonical dossier for that same persisted person.
    const royalFixture=await page.evaluate(async()=>{
        const [{state},{Entity,TYPE},{ensurePersonProfile},{getRoyalHouse,appointRoyalConsort,createRoyalChild,designateHeir},{recordResourceMovement}]=await Promise.all([
            import("./js/core/state.js"),import("./js/core/types.js"),import("./js/systems/people.js"),import("./js/systems/royal-dynasty.js"),import("./js/systems/goods-book.js")
        ]);
        const king=state.entities.find(entity=>!entity.dead&&entity.isKing&&entity.personId);
        if(!king)throw new Error("A living sovereign is required for the royal dossier E2E");
        let house=getRoyalHouse();
        if(!house.consort){
            const consort=new Entity(0,0,TYPE.VILLAGER);consort.id="e2e-royal-consort";consort.personId=consort.id;
            const profile=ensurePersonProfile(consort,{role:"resident",species:"human"});profile.ageYears=30;profile.lifeStage="adult";
            state.entities.push(consort);
            const consortFoodGrant=Math.max(0,100-Number(state.resources.food||0));
            state.resources.food=Math.max(100,Number(state.resources.food)||0);state.resources.gold=Math.max(100,Number(state.resources.gold)||0);
            if(consortFoodGrant>0)recordResourceMovement("food",consortFoodGrant,"test-fixture");
            const marriage=appointRoyalConsort(consort.personId);if(!marriage.ok)throw new Error("Could not create royal dossier consort fixture: "+marriage.reason);
            house=getRoyalHouse();
        }
        if(!house.children.length){
            const birthFoodGrant=Math.max(0,100-Number(state.resources.food||0));
            state.resources.food=Math.max(100,Number(state.resources.food)||0);state.resources.gold=Math.max(100,Number(state.resources.gold)||0);
            if(birthFoodGrant>0)recordResourceMovement("food",birthFoodGrant,"test-fixture");
            const birth=createRoyalChild();if(!birth.ok)throw new Error("Could not create royal dossier heir fixture: "+birth.reason);
            house=getRoyalHouse();
        }
        const heir=house.heir||house.children[0];const designation=designateHeir(heir.personId);
        if(!designation.ok)throw new Error("Could not designate royal dossier heir: "+designation.reason);
        return {kingId:king.personId,heirId:heir.personId,heirName:heir.person.name};
    });
    await page.locator("#people-btn").click();
    await page.locator("#people-search").fill(royalFixture.kingId);
    await page.locator("#people-list .person-list-item").first().click();
    const sovereignDossier=page.locator("#person-dossier");
    assert.equal(await sovereignDossier.locator('[data-royal-dossier="current"]').count(),1);
    assert.ok((await sovereignDossier.innerText()).includes("SOVEREIGN DOSSIER"));
    assert.ok((await sovereignDossier.innerText()).includes("DESIGNATED SUCCESSOR"));
    const royalCrest=sovereignDossier.locator('[data-royal-dossier="current"] .royal-dossier__crest');
    assert.equal(await royalCrest.count(),1);
    assert.match(await royalCrest.locator("use").getAttribute("href"),/^assets\/royal-heraldry\.svg#crest-0[1-8]$/);
    assert.ok((await royalCrest.getAttribute("aria-label")).includes("Heraldic emblem"));
    await sovereignDossier.locator('[data-royal-dossier="current"] [data-person-id="'+royalFixture.heirId+'"]').first().click();
    assert.ok((await sovereignDossier.innerText()).includes(royalFixture.heirName));
    assert.equal(await sovereignDossier.locator('[data-royal-dossier="current"]').count(),0,"the heir dossier must not be mislabeled as the reigning sovereign");
    await page.locator("#people-close").click();

    // A deceased resident remains inspectable as a memorial, not as a live entity.
    const memorialId=await page.evaluate(async()=>{
        const [{state},{recordNaturalDeath},{ensurePersonProfile},{Entity,TYPE}]=await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/mortality.js"),
            import("./js/systems/people.js"),
            import("./js/core/types.js").then(module=>({Entity:module.Entity,TYPE:module.TYPE}))
        ]);
        // The memorial test must not depend on a random house/population spawn.
        // Create one deterministic, isolated villager fixture for this scenario.
        const resident=new Entity(0,0,TYPE.VILLAGER);
        resident.id="e2e-memorial-resident";
        resident.personId=resident.id;
        ensurePersonProfile(resident,{role:"resident",species:"human"});
        state.entities.push(resident);
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

    // Cards are only dealt when the player asks from the Cards panel.
    await page.locator("#speed-1").click();
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-choices button").first().click();
    assert.equal(await page.locator("#hand-dock").count(),0,"the permanent card hotbar must be gone");
    assert.equal(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.length;}),0,"cards must not arrive on a timer");
    await page.locator('[data-kac-dock-action="cards"]').click();
    await page.locator("#command-modal").waitFor({state:"visible",timeout:3000});
    const drawButton=page.locator('[data-command="draw-card"]');
    for(let i=0;i<5;i++)await drawButton.click();
    assert.equal(await page.locator("#command-panel-content .command-card").count(),5,"five explicit draws must fill the hand");
    assert.ok(await drawButton.isDisabled(),"a full hand must disable further draws");
    const drawnState=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {hand:state.hand.length,selected:state.selectedCardInstanceId,current:state.currentCard?state.currentCard.instanceId:null};
    });
    assert.deepEqual(drawnState,{hand:5,selected:null,current:null},"drawing must not select a card");
    assert.ok(await page.locator("#command-panel-content .command-card-art use").count()>=5,"every drawn card must display category artwork");
    assert.ok((await page.locator("#command-panel-content .command-card-art use").first().getAttribute("href")).startsWith("assets/royal-card-atlas.svg#"),"the deck panel must use the royal card atlas");
    const countBeforeClick=5;
    let chosen=false;
    for(let i=0;i<5;i++){
        await page.locator("#command-panel-content .command-card button").nth(i).click();
        await page.waitForFunction(()=>document.querySelector("#command-modal")?.classList.contains("hidden"),null,{timeout:3000});
        const affordable=await page.evaluate(async()=>{
            const {state}=await import("./js/core/state.js");
            const card=state.currentCard;
            return Boolean(card)&&Object.entries(card.cost||{}).every(([key,value])=>(state.resources[key]||0)>=value);
        });
        if(affordable){chosen=true;break;}
        await page.locator('[data-kac-dock-action="cards"]').click();
        await page.locator("#command-modal").waitFor({state:"visible",timeout:3000});
    }
    assert.ok(chosen,"at least one of five drawn cards should be affordable");
    assert.equal(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.length;}),countBeforeClick,"selecting a card must not remove it");
    assert.equal((await page.locator("#tab-content").innerText()).includes("PLAYED "),false,"selecting a card must not play it");
    const selectedName=(await page.locator("#card-name").innerText()).trim();
    assert.notEqual(selectedName,"NO CARD SELECTED","the selected card must be shown in the inspector");

    // A plain map click must not place anything; placement is drag-only now.
    const cardDragCanvasBox=await page.locator("#canvas").boundingBox();
    assert.ok(cardDragCanvasBox);
    await page.mouse.click(cardDragCanvasBox.x+cardDragCanvasBox.width*0.5,cardDragCanvasBox.y+cardDragCanvasBox.height*0.5);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.length;}),countBeforeClick,"clicking the map must not place a card");
    assert.equal((await page.locator("#tab-content").innerText()).includes("PLAYED "),false,"clicking the map must not play a card");

    // Drag the selected card from the inspector onto a legal map tile.
    const cardDragCardBox=await page.locator("#card-container").boundingBox();
    assert.ok(cardDragCardBox);
    await page.mouse.move(cardDragCardBox.x+cardDragCardBox.width/2,cardDragCardBox.y+cardDragCardBox.height/2);
    await page.mouse.down();
    let cardDragPlaced=false,lastTarget="none";
    for(const fy of [0.24,0.32,0.40,0.48,0.56,0.64,0.72]){
        for(const fx of [0.18,0.28,0.38,0.48,0.58,0.68,0.78,0.88]){
            const x=cardDragCanvasBox.x+cardDragCanvasBox.width*fx,y=cardDragCanvasBox.y+cardDragCanvasBox.height*fy;
            await page.mouse.move(x,y,{steps:3});
            await page.waitForTimeout(35);
            if(await page.locator("#placement-status").getAttribute("data-valid")==="true"){
                lastTarget=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id||document.elementFromPoint(x,y)?.tagName||"none",{x,y});
                if(lastTarget==="canvas"){await page.mouse.up();cardDragPlaced=true;break;}
            }
        }
        if(cardDragPlaced)break;
    }
    if(!cardDragPlaced){
        await page.mouse.up();
        throw new Error("no legal map canvas target was found; last target: "+lastTarget);
    }
    await page.waitForTimeout(150);
    const handAfterDrag=await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.length;});
    const selectionAfterDrag=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        return {selected:state.selectedCardInstanceId,current:state.currentCard?state.currentCard.instanceId:null};
    });
    console.log("Drag diagnostic:",JSON.stringify({
        lastTarget,
        selectedCard:selectedName,
        handBefore:countBeforeClick,
        handAfter:handAfterDrag,
        toast:await page.locator("#action-toast").innerText(),
        placement:await page.locator("#placement-status").innerText(),
        eventVisible:await page.locator("#realm-event-modal").isVisible()
    }));
    assert.equal(handAfterDrag,countBeforeClick-1,"a valid drag must consume exactly the selected card");
    assert.deepEqual(selectionAfterDrag,{selected:null,current:null},"placing a card must not auto-select the next one");
    await page.locator('[data-kac-dock-action="cards"]').click();
    assert.equal(await page.locator("#command-panel-content .command-card").count(),countBeforeClick-1,"successful placement must remove the consumed card from the hand");
    await page.locator("#command-close").click();

    // Event decisions can overlay the map during a long accelerated test.
    if(await page.locator("#realm-event-modal").isVisible())await page.locator("#realm-event-choices button").first().click();

    await page.locator("#settings-btn").click();
    assert.equal(await page.locator("#settings-modal").isVisible(),true);
    const htmlRoot=page.locator("html");
    const tooltipToggle=page.locator("#settings-tooltips-toggle");
    const tooltipLabel=page.locator("label.toggle").filter({has:tooltipToggle});
    assert.equal(await tooltipLabel.count(),1);
    await tooltipLabel.click();
    assert.equal(await tooltipToggle.isChecked(),false);
    assert.ok(await htmlRoot.evaluate(node=>node.classList.contains("ui-hide-tooltips")));
    await tooltipLabel.click();
    assert.equal(await tooltipToggle.isChecked(),true);
    assert.ok(!(await htmlRoot.evaluate(node=>node.classList.contains("ui-hide-tooltips"))));
    const motionToggle=page.locator("#settings-motion-toggle");
    const motionLabel=page.locator("label.toggle").filter({has:motionToggle});
    await motionLabel.click();
    assert.equal(await motionToggle.isChecked(),true);
    assert.ok(await htmlRoot.evaluate(node=>node.classList.contains("ui-reduced-motion")));
    await motionLabel.click();
    assert.equal(await motionToggle.isChecked(),false);
    assert.ok(!(await htmlRoot.evaluate(node=>node.classList.contains("ui-reduced-motion"))));
    const contrastToggle=page.locator("#settings-high-contrast-toggle");
    const contrastLabel=page.locator("label.toggle").filter({has:contrastToggle});
    await contrastLabel.click();
    assert.equal(await contrastToggle.isChecked(),true);
    assert.ok(await htmlRoot.evaluate(node=>node.classList.contains("ui-high-contrast")));
    await contrastLabel.click();
    assert.equal(await contrastToggle.isChecked(),false);
    assert.ok(!(await htmlRoot.evaluate(node=>node.classList.contains("ui-high-contrast"))));
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
    await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="RESUME",null,{timeout:3000});
    await page.locator("#speed-2").click();
    // Keep the realm paused while the ecology fixture and the save snapshot are
    // captured, so a tick cannot advance insect populations between the two.
    await page.waitForTimeout(120);
    const savedTick=await page.evaluate(async()=>(await import("./js/core/state.js")).state.tick);
    const savedHand=await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.map(card=>card.instanceId);});
    const savedRoadCount=await page.evaluate(()=>(import("./js/systems/roads.js")).then(module=>module.getRoadCount()));
    const ecologySetup=await page.evaluate(async()=>{
        const [{state},{ensureForestFauna},{ensureForestGathering},{startOutbreak,applyHerbalRemedy}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/forest-fauna.js"),
            import("./js/systems/forest-gathering.js"),import("./js/systems/health.js")
        ]);
        ensureForestFauna();
        const colony=state.forestFauna?.insects?.find(insect=>Number(insect.population)>0);
        if(!colony)throw new Error("The realm must expose a populated insect colony before the save test");
        ensureForestGathering();
        for(const good of Object.keys(state.forestGathering.stock))state.forestGathering.stock[good]=0;
        state.forestGathering.stock.herbs=4;
        state.forestGathering.stock.lichen=2;
        startOutbreak({severity:2,disease:"e2e-herbal-fever"});
        const remedy=applyHerbalRemedy(2);
        if(!remedy.ok||remedy.used.length===0)throw new Error("The herbal remedy path did not consume stored herbs: "+JSON.stringify(remedy));
        if(!(state.health.herbalDoses>0))throw new Error("The herbal remedy did not record a dose");
        return {colonyId:String(colony.id),colonyPopulation:Number(colony.population),used:remedy.used,treated:remedy.treated,herbalDoses:state.health.herbalDoses};
    });
    const resourceFixture=await page.evaluate(async()=>{
        const {getResourceNodeAt,harvestForest,extractStone}=await import("./js/systems/resource-geography.js");
        for(let y=0;y<160;y++)for(let x=0;x<160;x++){
            const node=getResourceNodeAt(x,y);
            if(node.forestStock>3){harvestForest(x,y,1);return {type:"forest",x,y,savedStock:node.forestStock-1};}
            if(node.stoneStock>3){extractStone(x,y,1);return {type:"stone",x,y,savedStock:node.stoneStock-1};}
        }
        throw new Error("No resource deposit was generated for the save/load test");
    });
    const ecologyBeforeSave=await captureEcology(page);
    assert.ok(ecologyBeforeSave.insects.length>0,"the save fixture must contain real insect colonies");
    assert.ok(ecologyBeforeSave.herbalDoses>0,"the save fixture must contain a real herbal dose counter");
    await page.locator("#save-btn").click();
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Realm saved"),null,{timeout:5000});
    await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).removeRoad(x,y),{x:roadFixture.x,y:roadFixture.y});
    assert.equal(await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).getRoadAt(x,y),{x:roadFixture.x,y:roadFixture.y}),null,"road mutation after save should be visible before loading");
    await page.evaluate(async({type,x,y})=>{
        const module=await import("./js/systems/resource-geography.js");
        if(type==="forest")module.harvestForest(x,y,1);else module.extractStone(x,y,1);
    },resourceFixture);
    const ecologyMutation=await page.evaluate(async({colonyId})=>{
        const {state}=await import("./js/core/state.js");
        const colony=state.forestFauna?.insects?.find(insect=>String(insect.id)===String(colonyId));
        if(!colony)throw new Error("The saved insect colony disappeared before the mutation step");
        colony.population=0;
        colony.density=0;
        state.health.herbalDoses=0;
        state.health.herbalTreated=0;
        return {colonyId:String(colony.id),population:Number(colony.population),herbalDoses:Number(state.health.herbalDoses)};
    },{colonyId:ecologySetup.colonyId});
    const ecologyAfterMutation=await captureEcology(page);
    assert.ok(ecologyAfterMutation.insects.some(insect=>insect.id===ecologyMutation.colonyId&&insect.population===0),"the post-save insect mutation must be visible before loading");
    assert.equal(ecologyAfterMutation.herbalDoses,0,"the post-save herbal dose mutation must be visible before loading");
    await page.locator("#speed-4").click();
    const loadedTick=await page.evaluate(()=>{
        document.querySelector("#load-btn").click();
        // Loading resets the pause flag and the restored realm keeps running, so
        // the next animation frame would advance the tick before it is read.
        // Pause inside the same synchronous task as the click: no frame can run
        // in between, and loading has just re-rendered #tick-count from the
        // restored tick, so this is the exact tick that was restored.
        const pauseButton=document.querySelector("#pause-btn");
        if(pauseButton&&!pauseButton.classList.contains("is-paused"))pauseButton.click();
        return Number((document.querySelector("#tick-count")?.textContent||"").replace(/,/g,""));
    });
    await page.waitForFunction(()=>{
        const message=document.querySelector("#status-message")?.textContent||"";
        return message.includes("Loaded realm")||message.includes("Load failed")||message.includes("No valid saved realm");
    },null,{timeout:5000});
    const loadStatus=(await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"),"load must succeed; actual status: "+loadStatus);
    assert.ok(await page.locator("#speed-2").evaluate(el=>el.classList.contains("is-active")),"save/load must restore the saved simulation speed");
    assert.equal(await page.locator("#speed-4").evaluate(el=>el.classList.contains("is-active")),false,"load must clear the previous speed selection");
    assert.equal(loadedTick,savedTick,"save/load must restore the exact simulation tick");
    const ecologyAfterLoad=await captureEcology(page);
    assert.deepEqual(ecologyAfterLoad.insects,ecologyBeforeSave.insects,"save/load must restore every stored insect colony exactly");
    assert.equal(ecologyAfterLoad.herbalDoses,ecologyBeforeSave.herbalDoses,"save/load must restore health.herbalDoses");
    assert.equal(ecologyAfterLoad.herbalTreated,ecologyBeforeSave.herbalTreated,"save/load must restore health.herbalTreated");
    assert.equal(ecologyAfterLoad.disease,ecologyBeforeSave.disease,"save/load must restore the treated disease");
    assert.deepEqual(ecologyAfterLoad.military,ecologyBeforeSave.military,"save/load must restore named soldiers, horses and drill totals");
    assert.deepEqual(ecologyAfterLoad.publicHealth,ecologyBeforeSave.publicHealth,"save/load must restore sanitation, healers, medicine history and mortality totals");
    assert.equal(ecologyAfterLoad.forestDay,ecologyBeforeSave.forestDay,"save/load must restore the forest-fauna day");
    console.log("Ecology save/load E2E:",JSON.stringify({
        colonies:ecologyAfterLoad.insects.length,
        colonyId:ecologySetup.colonyId,
        herbalDoses:ecologyAfterLoad.herbalDoses,
        herbalTreated:ecologyAfterLoad.herbalTreated,
        disease:ecologyAfterLoad.disease,
        soldiers:ecologyAfterLoad.military.soldiers.length,
        healers:ecologyAfterLoad.publicHealth.healers.length,
        medicineBrewed:ecologyAfterLoad.publicHealth.medicineBrewed,
        forestDay:ecologyAfterLoad.forestDay
    }));
    assert.deepEqual(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.hand.map(card=>card.instanceId);}),savedHand,"save/load must restore the card hand");
    assert.equal(await page.evaluate(async()=>(await import("./js/systems/roads.js")).getRoadCount()),savedRoadCount,"save/load must restore the road network");
    assert.equal(await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).getRoadAt(x,y)?.type,{x:roadFixture.x,y:roadFixture.y}),"dirt","save/load must restore the placed road tile");
    assert.equal(await page.evaluate(async({type,x,y})=>{
        const node=(await import("./js/systems/resource-geography.js")).getResourceNodeAt(x,y);
        return type==="forest"?node.forestStock:node.stoneStock;
    },resourceFixture),resourceFixture.savedStock,"save/load must restore depleted resource node stock");
    // The memorial archive must survive the same save/load round trip.
    await page.locator("#people-btn").click();
    await page.locator("#people-search").fill(memorialId);
    assert.equal(await page.locator("#people-list .person-list-item").count(),1);
    await page.locator("#people-list .person-list-item").first().click();
    assert.ok((await page.locator("#person-dossier").innerText()).includes("DECEASED"));
    await page.locator("#people-close").click();
    const pausedAfterLoad=await page.evaluate(async()=>(await import("./js/core/state.js")).state.isPaused);
    if(!pausedAfterLoad){
        await page.locator("#pause-btn").click();
        await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="RESUME",null,{timeout:3000});
    }

    // Legacy saves and very large logistics workloads must survive the real
    // localStorage save/load path without inventing or losing stock.
    const dismissRealmEvent=async()=>{
        const modal=page.locator("#realm-event-modal");
        if(!(await modal.isVisible()))return;
        await page.locator("#realm-event-dismiss").click({timeout:2000}).catch(async()=>{
            if(await modal.isVisible())throw new Error("Could not dismiss the realm event modal");
        });
        await modal.waitFor({state:"hidden",timeout:3000}).catch(()=>{});
    };
    const loadRealm=async()=>{
        await page.evaluate(()=>{const status=document.querySelector("#status-message");if(status)status.textContent="";});
        await dismissRealmEvent();
        // Loading resumes the simulation, so the restored realm would keep
        // advancing ticks while the test reads it back. Pause inside the same
        // synchronous task as the load click: no frame can run in between, so
        // the assertions see exactly the snapshot that was restored.
        await page.evaluate(()=>{
            document.querySelector("#load-btn").click();
            const pauseButton=document.querySelector("#pause-btn");
            if(pauseButton&&!pauseButton.classList.contains("is-paused"))pauseButton.click();
        });
        await page.waitForFunction(()=>{
            const message=document.querySelector("#status-message")?.textContent||"";
            return message.includes("Loaded realm")||message.includes("Load failed")||message.includes("No valid saved realm");
        },null,{timeout:10000});
        return (await page.locator("#status-message").textContent()||"").trim();
    };
    const ensurePaused=async()=>{
        let lastError=null;
        for(let attempt=0;attempt<8;attempt++){
            // Loading a save resumes the simulation. A random event can open
            // between this dismissal and the pause click, so retry the bounded
            // sequence instead of letting the overlay intercept the click.
            await dismissRealmEvent();
            if((await page.locator("#pause-text").textContent()||"").trim()==="RESUME")return;
            try{
                await page.locator("#pause-btn").click({timeout:1500});
                await page.waitForFunction(()=>document.querySelector("#pause-text")?.textContent.trim()==="RESUME",null,{timeout:2000});
                return;
            }catch(error){
                lastError=error;
                if(await page.locator("#realm-event-modal").isVisible()){
                    await dismissRealmEvent();
                    continue;
                }
                if(attempt<7)await page.waitForTimeout(50);
            }
        }
        throw new Error("Could not pause after dismissing repeated realm events"+(lastError?": "+lastError.message:""));
    };

    const warehouseId=await page.evaluate(async()=>{
        const [{state},{TYPE},{spawnEntity},{ensureInventory}]=await Promise.all([
            import("./js/core/state.js"),import("./js/core/types.js"),
            import("./js/world/entities.js"),import("./js/systems/logistics.js")
        ]);
        let warehouse=state.entities.find(entity=>!entity.dead&&entity.type===TYPE.WAREHOUSE);
        if(!warehouse){
            warehouse=spawnEntity(4,4,TYPE.WAREHOUSE);
            if(!warehouse)throw new Error("Could not create a warehouse fixture for the legacy save test");
            ensureInventory(warehouse);
        }
        return warehouse.id;
    });
    await dismissRealmEvent();
    await page.evaluate(()=>{const status=document.querySelector("#status-message");if(status)status.textContent="";});
    await page.locator("#save-btn").click();
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Realm saved"),null,{timeout:5000});
    const goodSave=await page.evaluate(async({warehouseId})=>{
        const {state}=await import("./js/core/state.js");
        const key=Object.keys(localStorage).find(candidate=>candidate.startsWith("kings-and-cards:save:v")&&candidate.endsWith(":"+state.activeProfileId));
        if(!key)throw new Error("The good save was not written to localStorage");
        const backupKey=key.replace("kings-and-cards:save:","kings-and-cards:save-backup:");
        const raw=localStorage.getItem(key);
        if(!raw)throw new Error("The good save was not written to localStorage");
        const envelope=JSON.parse(raw);
        return {profileId:state.activeProfileId,key,backupKey,raw,tick:Number(envelope.snapshot.tick)||0,warehouseId};
    },{warehouseId});

    const legacy=await page.evaluate(async({key,backupKey,raw,warehouseId})=>{
        const {GOOD_KEYS}=await import("./js/systems/city-config.js");
        const good=JSON.parse(raw);
        const snapshot=structuredClone(good.snapshot);
        snapshot.tick=(Number(snapshot.tick)||0)+777;
        snapshot.gameSpeed=2;
        const dto=snapshot.entities.find(entity=>entity.id===warehouseId&&entity.warehouse&&!entity.dead);
        if(!dto)throw new Error("Warehouse fixture is missing from the save snapshot");
        delete dto.warehouse.profile;
        dto.warehouse.filters=["grain","flour","bread"];
        dto.warehouse.capacity="legacy";
        const stored={};
        for(const good of GOOD_KEYS)stored[good]=0;
        stored.grain=12.9;stored.flour=-4;stored.bread=3;stored.mystery=5;
        dto.warehouse.stored=stored;
        dto.warehouse.reservedIn={grain:999,flour:-2,bread:1000000};
        dto.warehouse.reservedOut={grain:999,flour:2};
        snapshot.city=snapshot.city||{};
        snapshot.city.version=1;
        snapshot.city.logistics={
            version:1,nextJobId:1,
            jobs:[{
                id:"legacy-huge-job",kind:"haul",good:"grain",quantity:1000000000,
                from:{kind:"building",id:warehouseId},to:{kind:"warehouse",id:warehouseId},
                status:"pending",createdTick:0
            }],
            carriers:[]
        };
        localStorage.setItem(key,JSON.stringify({...good,savedAt:new Date().toISOString(),snapshot}));
        localStorage.removeItem(backupKey);
        return {tick:snapshot.tick};
    },goodSave);
    const legacyStatus=await loadRealm();
    assert.ok(legacyStatus.includes("Loaded realm"),"legacy save must load; actual status: "+legacyStatus);
    assert.ok(!legacyStatus.includes("backup"),"legacy primary save must load without falling back to a backup");
    await ensurePaused();

    const legacyState=await page.evaluate(async({warehouseId})=>{
        const {state}=await import("./js/core/state.js");
        const {GOOD_KEYS}=await import("./js/systems/city-config.js");
        const warehouse=state.entities.find(entity=>entity.id===warehouseId);
        const logistics=state.city.logistics;
        const values=[];
        for(const map of [warehouse.warehouse.stored,warehouse.warehouse.reservedIn,warehouse.warehouse.reservedOut,warehouse.inventory.input,warehouse.inventory.output,warehouse.inventory.reservedIn,warehouse.inventory.reservedOut]){
            for(const [good,value] of Object.entries(map||{}))values.push({good,value});
        }
        return {
            tick:Number(state.tick),
            profile:warehouse.warehouse.profile,
            capacity:Number(warehouse.warehouse.capacity),
            filters:[...warehouse.warehouse.filters],
            stored:{...warehouse.warehouse.stored},
            reservedIn:{...warehouse.warehouse.reservedIn},
            reservedOut:{...warehouse.warehouse.reservedOut},
            invalidValues:values.filter(entry=>!Number.isFinite(Number(entry.value))||Number(entry.value)<0),
            jobs:logistics.jobs.map(job=>({
                id:job.id,quantity:Number(job.quantity),reserved:Number(job.reserved),
                picked:Number(job.picked),delivered:Number(job.delivered),
                sourceReserved:Boolean(job.sourceReserved),targetReserved:Boolean(job.targetReserved),
                status:job.status
            })),
            ledgerLength:logistics.ledger.length,
            nextLedgerId:Number(logistics.nextLedgerId),
            goodKeys:GOOD_KEYS
        };
    },{warehouseId});
    assert.ok(Number.isSafeInteger(legacyState.tick)&&legacyState.tick>=legacy.tick,"legacy save must restore a valid tick at or beyond its saved tick");
    assert.equal(legacyState.profile,"food","legacy warehouse filters must be recognised as the food profile");
    assert.deepEqual(legacyState.filters,["grain","flour","bread"],"legacy warehouse filters must be preserved");
    assert.equal(legacyState.capacity,180,"an invalid legacy capacity must fall back to the warehouse default");
    assert.equal(legacyState.stored.grain,12,"fractional legacy stock must be floored");
    assert.equal(legacyState.stored.flour,0,"negative legacy stock must be clamped to zero");
    assert.equal(legacyState.stored.bread,3,"valid legacy stock must be preserved");
    assert.equal(legacyState.stored.logs,0,"missing goods must be initialised to zero");
    assert.deepEqual(legacyState.invalidValues,[],"legacy stock and reservations must be finite and non-negative");
    assert.equal(legacyState.jobs.length,1,"the legacy job must survive validation");
    assert.equal(legacyState.jobs[0].quantity,1000000000,"the huge legacy job quantity must be preserved");
    assert.ok(legacyState.jobs[0].targetReserved,"the huge legacy job must reserve only the real destination space");
    assert.equal(legacyState.reservedIn.grain,165,"the huge legacy job must be clamped to the free warehouse space");
    assert.equal(legacyState.reservedOut.grain,0,"stale warehouse outbound reservations must be rebuilt from active jobs");
    assert.equal(legacyState.ledgerLength,0,"a missing legacy ledger must restore as an empty bounded ledger");
    assert.ok(legacyState.nextLedgerId>=1,"a missing legacy ledger sequence must restart safely");

    const backup=await page.evaluate(({key,backupKey,raw})=>{
        const good=JSON.parse(raw);
        const backup=structuredClone(good);
        backup.savedAt=new Date(Date.now()-60000).toISOString();
        backup.snapshot.tick=(Number(good.snapshot.tick)||0)+321;
        localStorage.setItem(backupKey,JSON.stringify(backup));
        localStorage.setItem(key,"{corrupt-primary-save");
        return {tick:Number(backup.snapshot.tick)};
    },goodSave);
    const backupStatus=await loadRealm();
    assert.ok(backupStatus.includes("Loaded realm"),"backup recovery must load; actual status: "+backupStatus);
    assert.ok(backupStatus.includes("previous backup restored"),"a corrupt primary save must fall back to the valid backup");
    await ensurePaused();
    const backupTick=await page.evaluate(async()=>(await import("./js/core/state.js")).state.tick);
    assert.ok(Number(backupTick)>=backup.tick,"backup recovery must restore the backup tick");

    await page.evaluate(({key,backupKey,raw})=>{localStorage.setItem(key,raw);localStorage.removeItem(backupKey);},goodSave);
    const restoredStatus=await loadRealm();
    assert.ok(restoredStatus.includes("Loaded realm"),"the known-good save must load again; actual status: "+restoredStatus);
    assert.ok(!restoredStatus.includes("backup"),"the known-good primary save must not require backup recovery");
    await ensurePaused();
    const restoredTick=await page.evaluate(async()=>(await import("./js/core/state.js")).state.tick);
    assert.ok(Number(restoredTick)>=goodSave.tick,"the known-good save must restore its tick");

    // The outer save envelope must migrate instead of rejecting an older save.
    // Write the same snapshot under a version 1 envelope at the legacy key and
    // remove the current primary, so the real read path has to migrate it.
    const legacyEnvelopeKey=await page.evaluate(async({raw,key})=>{
        const {state}=await import("./js/core/state.js");
        const legacyKey="kings-and-cards:save:v1:"+state.activeProfileId;
        const envelope=JSON.parse(raw);
        envelope.version=1;
        envelope.savedAt=new Date(Date.now()-120000).toISOString();
        localStorage.setItem(legacyKey,JSON.stringify(envelope));
        localStorage.removeItem(key);
        return legacyKey;
    },goodSave);
    const migratedStatus=await loadRealm();
    assert.ok(migratedStatus.includes("Loaded realm"),"a version 1 envelope must load; actual status: "+migratedStatus);
    assert.ok(migratedStatus.includes("save migrated from schema 1"),"the load path must report the envelope migration; actual: "+migratedStatus);
    await ensurePaused();
    await page.evaluate(({key,raw,legacyKey})=>{
        localStorage.setItem(key,raw);
        localStorage.removeItem(legacyKey);
    },{key:goodSave.key,raw:goodSave.raw,legacyKey:legacyEnvelopeKey});

    const largeOrder=await page.evaluate(async()=>{
        const [
            {state},{TYPE},{spawnEntity},
            {ensureInventory,requestHaul,cancelJobsForEntity,serializeCity,restoreCity,rebuildLogisticsReservations},
            {GOOD_KEYS},{MAX_LOGISTICS_JOBS,MAX_CARRIERS}
        ]=await Promise.all([
            import("./js/core/state.js"),import("./js/core/types.js"),import("./js/world/entities.js"),
            import("./js/systems/logistics.js"),import("./js/systems/city-config.js"),import("./js/systems/logistics.js")
        ]);
        const stockTotal=()=>state.entities.filter(entity=>!entity.dead&&entity.warehouse)
            .reduce((sum,entity)=>sum+GOOD_KEYS.reduce((inner,good)=>inner+Number(entity.warehouse.stored[good]||0),0),0);
        state.city.logistics.jobs=[];
        state.city.logistics.carriers=[];
        rebuildLogisticsReservations();
        const stockBefore=stockTotal();
        const target=spawnEntity(2,2,TYPE.WAREHOUSE);
        if(!target)throw new Error("large-order target warehouse could not spawn");
        ensureInventory(target);
        target.warehouse.profile="general";
        target.warehouse.filters=[...GOOD_KEYS];
        target.warehouse.capacity=1000000000;
        for(const good of GOOD_KEYS){
            target.warehouse.stored[good]=0;
            target.warehouse.reservedIn[good]=0;
            target.warehouse.reservedOut[good]=0;
        }
        for(const warehouse of state.entities.filter(entity=>!entity.dead&&entity.warehouse&&entity.id!==target.id)){
            ensureInventory(warehouse);
            warehouse.warehouse.filters=warehouse.warehouse.filters.filter(good=>good!=="water");
        }
        const source=spawnEntity(3,2,TYPE.WELL);
        if(!source)throw new Error("large-order source could not spawn");
        ensureInventory(source);
        source.inventory.output.water=1000000000;
        const hugeJob=requestHaul(source,"water",1000000000);
        if(!hugeJob)throw new Error("the huge order was not created");
        const huge={
            quantity:Number(hugeJob.quantity),
            sourceReserved:Number(source.inventory.reservedOut.water),
            targetReserved:Number(target.warehouse.reservedIn.water),
            targetReservedFlag:Boolean(hugeJob.targetReserved)
        };
        cancelJobsForEntity(target.id);
        const afterCancel={
            status:hugeJob.status,
            sourceReserved:Number(source.inventory.reservedOut.water),
            targetReserved:Number(target.warehouse.reservedIn.water)
        };
        state.city.logistics.jobs=[];
        state.city.logistics.carriers=[];
        rebuildLogisticsReservations();
        target.warehouse.capacity=400;
        for(const good of GOOD_KEYS){
            target.warehouse.stored[good]=0;
            target.warehouse.reservedIn[good]=0;
            target.warehouse.reservedOut[good]=0;
        }
        // Reachability is now a real path check. The queue fixture must sit on
        // connected land, so flatten the terrain for the fixture and restore it
        // immediately afterwards; the jobs themselves stay in the queue.
        const savedHeights=Float32Array.from(state.heightMap);
        state.heightMap.fill(0.62);
        state.buildingCollisionVersion=(state.buildingCollisionVersion||0)+1;
        const wells=[];
        for(let index=0;index<80;index++){
            const well=spawnEntity(5+(index%10),5+Math.floor(index/10),TYPE.WELL);
            if(!well)throw new Error("queue fixture well could not spawn at "+index);
            ensureInventory(well);
            well.inventory.output.water=1;
            wells.push(well);
        }
        const created=wells.map(well=>requestHaul(well,"water",1)).filter(Boolean);
        state.heightMap.set(savedHeights);
        state.buildingCollisionVersion=(state.buildingCollisionVersion||0)+1;
        const active=()=>state.city.logistics.jobs.filter(job=>["pending","assigned","blocked"].includes(job.status));
        const queue={
            created:created.length,
            active:active().length,
            total:state.city.logistics.jobs.length,
            targetReserved:Number(target.warehouse.reservedIn.water),
            sourceReserved:wells.reduce((sum,well)=>sum+Number(well.inventory.reservedOut.water||0),0)
        };
        const roundTripSnapshot=serializeCity();
        restoreCity(roundTripSnapshot);
        const roundTrip={
            active:active().length,
            total:state.city.logistics.jobs.length,
            targetReserved:Number(target.warehouse.reservedIn.water),
            sourceReserved:wells.reduce((sum,well)=>sum+Number(well.inventory.reservedOut.water||0),0)
        };
        const issues=[];
        const invalid=value=>!Number.isFinite(Number(value))||Number(value)<0;
        for(const entity of state.entities){
            if(entity.dead||!entity.isBuilding())continue;
            for(const map of [entity.inventory?.input,entity.inventory?.output,entity.inventory?.reservedIn,entity.inventory?.reservedOut,entity.warehouse?.stored,entity.warehouse?.reservedIn,entity.warehouse?.reservedOut]){
                for(const [good,value] of Object.entries(map||{})){
                    if(invalid(value))issues.push(entity.id+" "+good+" has invalid quantity "+value);
                }
            }
            for(const good of GOOD_KEYS){
                if(entity.warehouse){
                    if(Number(entity.warehouse.reservedOut?.[good]||0)>Number(entity.warehouse.stored?.[good]||0))issues.push(entity.id+" "+good+" outbound reservation exceeds stock");
                }else if(Number(entity.inventory?.reservedOut?.[good]||0)>Number(entity.inventory?.output?.[good]||0)){
                    issues.push(entity.id+" "+good+" output reservation exceeds output");
                }
            }
        }
        for(const job of state.city.logistics.jobs){
            if(invalid(job.quantity)||invalid(job.reserved)||invalid(job.picked)||invalid(job.delivered))issues.push(job.id+" has invalid job amounts");
        }
        if(active().length>MAX_LOGISTICS_JOBS)issues.push("active jobs exceed the queue limit");
        if(state.city.logistics.carriers.length>MAX_CARRIERS)issues.push("carriers exceed the carrier limit");
        if(state.city.logistics.ledger.length>600)issues.push("movement ledger exceeds its limit");
        return {
            huge,afterCancel,queue,roundTrip,
            stockBefore,stockAfter:stockTotal(),
            limits:{MAX_LOGISTICS_JOBS,MAX_CARRIERS},
            issues
        };
    });
    assert.equal(largeOrder.huge.quantity,12,"a very large haul order must reserve only one cartload");
    assert.equal(largeOrder.huge.sourceReserved,12,"a very large haul order must reserve only one cartload of source stock");
    assert.equal(largeOrder.huge.targetReserved,12,"a very large haul order must reserve only one cartload of destination space");
    assert.equal(largeOrder.huge.targetReservedFlag,true,"a very large haul order must be marked as destination-reserved");
    assert.equal(largeOrder.afterCancel.status,"cancelled","cancelling a huge order must mark it cancelled");
    assert.equal(largeOrder.afterCancel.sourceReserved,0,"cancelling a huge order must release the source reservation");
    assert.equal(largeOrder.afterCancel.targetReserved,0,"cancelling a huge order must release the destination reservation");
    assert.equal(largeOrder.queue.created,72,"the order queue must accept exactly 72 active jobs");
    assert.equal(largeOrder.queue.active,72,"the order queue must stop at the active-job limit");
    assert.equal(largeOrder.queue.targetReserved,72,"the queue must reserve exactly the accepted destination space");
    assert.equal(largeOrder.queue.sourceReserved,72,"the queue must reserve exactly the accepted source stock");
    assert.equal(largeOrder.roundTrip.active,72,"serializing and restoring the city must preserve the active queue");
    assert.equal(largeOrder.roundTrip.total,72,"the restored queue must stay within the persisted job limit");
    assert.equal(largeOrder.roundTrip.targetReserved,72,"the restored queue must rebuild the destination reservations");
    assert.equal(largeOrder.roundTrip.sourceReserved,72,"the restored queue must rebuild the source reservations");
    assert.equal(largeOrder.stockAfter,largeOrder.stockBefore,"creating, cancelling and restoring orders must not change physical warehouse stock");
    assert.deepEqual(largeOrder.issues,[],"large orders and legacy recovery must not create negative or phantom reservations");

    await page.evaluate(({key,backupKey,raw})=>{localStorage.setItem(key,raw);localStorage.removeItem(backupKey);},goodSave);
    const finalStatus=await loadRealm();
    assert.ok(finalStatus.includes("Loaded realm"),"the known-good realm must be restored after the logistics load test; actual status: "+finalStatus);
    await ensurePaused();

    // A valid exported realm must take the reset path exactly once. This is the
    // positive counterpart to the rejected-import zero-reset assertion above.
    if(!(await page.locator("#settings-modal").isVisible()))await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({state:"visible",timeout:3000});
    const exportDownload=page.waitForEvent("download");
    await page.locator("#export-save-btn").click();
    const exportedFile=await exportDownload;
    const exportedPath=await exportedFile.path();
    assert.ok(exportedPath,"the exported realm file must be available to the import control");
    const importTransientEntityFields=new Set(["path","pathIndex","pathTargetX","pathTargetY","pathVersion","state"]);
    const canonicalImportState=snapshot=>{
        const stateKeys=[
            "playerName","kingdomName","worldSeed","worldOptions","randomStreams","nextEntityId",
            "nextCardDrawTick","nextIssueAtTick","issueSequence","hiddenRealm","health","camera","zoom",
            "explored","roads","resourceGeography","city","tick","year","dayOfYear","seasonIndex",
            "gameSpeed","morale","resources","incomeThisTick","kingHp","totalRaidsSurvived","raidActive",
            "gameOver","victory","lastRandomEvent","weather","weatherTimer","personArchive","creatureArchive",
            "hand","cardRewardQueue","selectedCardInstanceId","availableCards","activeEvent","statistics",
            "economy","politics","government","royal","market","totalPopulation","heightMap","moistureMap",
            "temperatureMap","activeProfileId","hasStarted"
        ];
        const selected={};
        for(const key of stateKeys)selected[key]=snapshot[key];
        // Navigation caches are deliberately not part of the save schema: the
        // exporter omits them and the importer rebuilds them on the next tick.
        // Event log/sequence are omitted too because a successful import appends
        // an IMPORTED REALM entry. Everything else is the complete persisted state.
        selected.entities=(snapshot.entities||[]).map(entity=>Object.fromEntries(
            Object.entries(entity).filter(([key])=>!importTransientEntityFields.has(key))
        ));
        selected.city=structuredClone(snapshot.city);
        // A load refreshes the current needs sample; the rolling chart is a
        // derived presentation history and is not part of the save schema.
        delete selected.city?.needs?.history;
        for(const carrier of selected.city?.logistics?.carriers||[]){
            delete carrier.path;
            delete carrier.pathIndex;
            delete carrier.pathVersion;
        }
        return selected;
    };
    const beforeSuccessfulImport=canonicalImportState(await captureRealmState(page));
    await page.evaluate(()=>{
        globalThis.__KAC_RESET_PROBE__.calls=0;
        globalThis.__KAC_AFTER_IMPORT__=state=>{state.isPaused=true;};
    });
    await page.locator("#import-save-input").setInputFiles(exportedPath);
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Realm imported"),null,{timeout:10000});
    assert.equal(await page.evaluate(()=>globalThis.__KAC_RESET_PROBE__?.calls),1,"a successful import must call resetForRun exactly once");
    assert.equal(await page.evaluate(async()=>{const {state}=await import("./js/core/state.js");return state.isPaused;}),true,"the successful-import continuity probe must freeze the restored realm before comparing it");
    const afterSuccessfulImport=canonicalImportState(await captureRealmState(page));
    for(const key of Object.keys(beforeSuccessfulImport)){
        assert.deepEqual(afterSuccessfulImport[key],beforeSuccessfulImport[key],"a successful import must preserve the complete persisted state: "+key);
    }
    assert.deepEqual(afterSuccessfulImport.city?.logistics?.jobs,beforeSuccessfulImport.city?.logistics?.jobs,"a successful import must preserve all logistics jobs and reservations");
    assert.deepEqual(afterSuccessfulImport.entities,beforeSuccessfulImport.entities,"a successful import must preserve every persisted entity field");
    if(await page.locator("#settings-modal").isVisible())await page.locator("#settings-close").click();

    assert.deepEqual(errors,[],"legacy save and large-order checks must not emit uncaught page errors: "+JSON.stringify(errors));
    assert.deepEqual(consoleErrors,[],"legacy save and large-order checks must not emit console errors: "+JSON.stringify(consoleErrors));
    console.log("Legacy-save and large-order E2E passed:",JSON.stringify({legacyTick:legacyState.tick,backupTick,queue:largeOrder.queue.active,roundTrip:largeOrder.roundTrip.active}));

    // Verify the global action bar and primary dialog fit the full requested viewport matrix.
    for(const [width,height] of [[390,844],[768,1024],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1440]]){
        await page.setViewportSize({width,height});
        await page.waitForTimeout(40);
        await page.screenshot({path:resolve(screenshotDir,"realm-"+width+"x"+height+".png"),animations:"disabled"});
        const layout=await page.evaluate(()=>{
            const dock=document.querySelector("#realm-action-dock").getBoundingClientRect();
            const topbar=document.querySelector(".topbar");
            const groups=[...topbar.children].filter(el=>el.getClientRects().length).map(el=>({name:el.className,rect:el.getBoundingClientRect().toJSON()}));
            const overlaps=[];
            for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
                const a=groups[i].rect,b=groups[j].rect;
                if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push([groups[i].name,groups[j].name]);
            }
            const clippedActions=[...topbar.querySelectorAll(".header-actions button")].filter(el=>el.getClientRects().length).map(el=>({label:el.innerText||el.getAttribute("aria-label"),rect:el.getBoundingClientRect().toJSON()})).filter(item=>item.rect.left< -1||item.rect.right>innerWidth+1);
            return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,dockWidth:dock.width,dockLeft:dock.left,dockRight:dock.right,topbarWidth:topbar.scrollWidth,topbarClientWidth:topbar.clientWidth,groups,overlaps,clippedActions};
        });
        assert.ok(layout.documentWidth<=width+1,"horizontal document overflow at "+width+"x"+height+": "+JSON.stringify(layout));
        assert.ok(layout.topbarWidth<=layout.topbarClientWidth+1,"topbar content must not overflow at "+width+"x"+height+": "+JSON.stringify(layout));
        assert.deepEqual(layout.overlaps,[],"header groups must not overlap at "+width+"x"+height+": "+JSON.stringify(layout));
        assert.deepEqual(layout.clippedActions,[],"all header actions must remain visible at "+width+"x"+height+": "+JSON.stringify(layout));
        assert.ok(layout.dockWidth>=width-2&&layout.dockLeft<=1&&layout.dockRight>=width-1,"global action bar must span viewport at "+width+"x"+height+": "+JSON.stringify(layout));
        if(width<=790){
            const panel=page.locator(".side-panel");
            const before=await panel.evaluate(el=>({
                clientHeight:el.clientHeight,
                scrollHeight:el.scrollHeight,
                scrollRange:Math.max(0,el.scrollHeight-el.clientHeight),
                overflowY:getComputedStyle(el).overflowY
            }));
            assert.ok(["auto","scroll"].includes(before.overflowY),"mobile management column must expose vertical scrolling when needed at "+width+"x"+height+": "+JSON.stringify(before));
            if(width<=480)assert.ok(before.scrollRange>2,"narrow mobile management column must retain scrollable content at "+width+"x"+height+": "+JSON.stringify(before));
            const reachability=await panel.evaluate(el=>{
                const card=el.querySelector("#card-container");
                const original=el.scrollTop;
                const panelRect=el.getBoundingClientRect();
                const cardRect=card.getBoundingClientRect();
                const cardTopInScroll=cardRect.top-panelRect.top+el.scrollTop;
                const dock=document.querySelector("#realm-action-dock").getBoundingClientRect();
                const visibleBottom=Math.min(panelRect.bottom,dock.top);
                const visibleHeight=Math.max(0,visibleBottom-panelRect.top);
                const maxScroll=Math.max(0,el.scrollHeight-el.clientHeight);
                const initiallyReachable=cardRect.top>=panelRect.top-1&&cardRect.bottom<=visibleBottom+1;
                const targetScroll=initiallyReachable?el.scrollTop:Math.max(0,cardTopInScroll+cardRect.height-visibleHeight);
                el.scrollTop=Math.min(maxScroll,targetScroll);
                const finalPanel=el.getBoundingClientRect();
                const finalCard=card.getBoundingClientRect();
                const result={
                    scrollTop:el.scrollTop,
                    scrollRange:maxScroll,
                    initiallyReachable,
                    cardTop:finalCard.top,
                    cardBottom:finalCard.bottom,
                    panelTop:finalPanel.top,
                    panelBottom:finalPanel.bottom,
                    visibleBottom,
                    cardReachable:finalCard.top>=finalPanel.top-1&&finalCard.bottom<=visibleBottom+1
                };
                el.scrollTop=original;
                return result;
            });
            if(!reachability.initiallyReachable&&before.scrollRange>2)assert.ok(reachability.scrollTop>0,"mobile management column must use its available scroll range when the selected card is initially obscured at "+width+"x"+height+": "+JSON.stringify(reachability));
            assert.ok(reachability.cardReachable,"selected card must be fully reachable without being covered by the action dock at "+width+"x"+height+": "+JSON.stringify(reachability));
            await panel.evaluate(el=>{
                const card=el.querySelector("#card-container");
                const panelRect=el.getBoundingClientRect();
                const cardRect=card.getBoundingClientRect();
                const dock=document.querySelector("#realm-action-dock").getBoundingClientRect();
                const visibleHeight=Math.max(0,Math.min(panelRect.bottom,dock.top)-panelRect.top);
                const target=cardRect.top-panelRect.top+el.scrollTop+cardRect.height-visibleHeight;
                el.scrollTop=Math.min(Math.max(0,el.scrollHeight-el.clientHeight),Math.max(0,target));
            });
            await page.screenshot({path:resolve(screenshotDir,"sidepanel-card-reachable-"+width+"x"+height+".png"),animations:"disabled"});
            await panel.evaluate(el=>{el.scrollTop=0});
        }
        const assertOverlayFits=async(selector,label,screenshotName)=>{
            const audit=await page.evaluate(selector=>{
                const overlay=document.querySelector(selector);
                const panel=overlay?.querySelector(".modal-panel,.command-panel,.ui-window");
                if(!overlay||!panel)return null;
                const rect=panel.getBoundingClientRect();
                const body=panel.querySelector(".ui-window__body")||panel;
                const style=getComputedStyle(body);
                return {
                    x:rect.x,y:rect.y,width:rect.width,height:rect.height,
                    right:rect.right,bottom:rect.bottom,
                    documentWidth:document.documentElement.scrollWidth,
                    bodyClientWidth:body.clientWidth,bodyScrollWidth:body.scrollWidth,
                    bodyClientHeight:body.clientHeight,bodyScrollHeight:body.scrollHeight,
                    overflowX:style.overflowX,overflowY:style.overflowY
                };
            },selector);
            assert.ok(audit,"overlay "+label+" must exist at "+width+"x"+height);
            assert.ok(audit.x>=-1&&audit.y>=-1&&audit.right<=width+1&&audit.bottom<=height+1,
                label+" panel must remain inside viewport "+width+"x"+height+": "+JSON.stringify(audit));
            assert.ok(audit.documentWidth<=width+1,label+" must not create document-level horizontal overflow at "+width+"x"+height+": "+JSON.stringify(audit));
            if(audit.bodyScrollHeight>audit.bodyClientHeight+2){
                assert.ok(["auto","scroll","overlay"].includes(audit.overflowY),
                    label+" must expose a scroll path when its body is taller than the viewport at "+width+"x"+height+": "+JSON.stringify(audit));
            }
            // Detailed overlays get three representative screenshots; geometry and scroll checks still run at all seven sizes.
            if([390,1366,1920].includes(width)){
                await page.screenshot({path:resolve(screenshotDir,screenshotName+"-"+width+"x"+height+".png"),animations:"disabled"});
            }
        };

        // Inspect all twelve management screens, not only the shell of the shared dialog.
        await page.locator("#command-open-btn").click();
        await assertOverlayFits("#command-modal","management shell","management-shell");
        for(const tab of ["kingdom","government","politics","diplomacy","decisions","cards","economy","resources","buildings","dynasty","creatures","chronicle"]){
            await page.locator('[data-command-tab="'+tab+'"]').click();
            await page.waitForTimeout(25);
            if(tab==="dynasty"&&width<=420){
                await page.waitForFunction(()=>[...document.querySelectorAll(".dynasty-lineage-edge--partner,.dynasty-lineage-edge--sibling")].some(path=>path.getAttribute("d")?.length>0),null,{timeout:5000});
                const mobileConnector=await page.evaluate(()=>{
                    const graph=document.querySelector("#command-panel-content .dynasty-lineage-graph");
                    const path=graph?.querySelector(".dynasty-lineage-edge--partner")||graph?.querySelector(".dynasty-lineage-edge--sibling");
                    if(!path)return null;
                    const d=path.getAttribute("d")||"";
                    const numbers=(d.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
                    return {d,startX:numbers[0],startY:numbers[1],endX:numbers.at(-2),endY:numbers.at(-1),stroke:getComputedStyle(path).stroke,opacity:getComputedStyle(path).opacity};
                });
                assert.ok(mobileConnector?.d?.includes("C"),"mobile dynasty must draw a curved partner/sibling connector");
                assert.ok(Math.abs(mobileConnector.startX-mobileConnector.endX)<2&&Math.abs(mobileConnector.endY-mobileConnector.startY)>1,"stacked mobile relationship connector must run vertically through the card gap: "+JSON.stringify(mobileConnector));
                assert.notEqual(mobileConnector.stroke,"none","mobile dynasty connector must remain visible");
                assert.ok(Number(mobileConnector.opacity)>0,"mobile dynasty connector must not be transparent");
            }
            await assertOverlayFits("#command-modal","management "+tab,"management-"+tab);
        }
        await page.locator("#command-close").click();

        // Character roster and dossier at every viewport.
        await page.locator("#people-btn").click();
        assert.ok(await page.locator("#people-list .person-list-item").count()>0,"people roster must have inspectable records");
        await page.locator("#people-list .person-list-item").first().click();
        await assertOverlayFits("#people-modal","character roster and dossier","people-dossier");
        await page.locator("#people-close").click();

        // Construction, settings and the event decision window share the same viewport contract.
        await page.locator("#build-open-btn").click();
        await assertOverlayFits("#build-modal","construction panel","construction");
        await page.locator("#build-close-btn").click();

        await page.locator("#settings-btn").click();
        await assertOverlayFits("#settings-modal","settings panel","settings");
        await page.locator("#settings-close").click();

        await page.evaluate(async()=>{
            const [{state},{triggerRandomEvent},{renderUI}]=await Promise.all([
                import("./js/core/state.js"),import("./js/systems/events.js"),import("./js/presentation/rendering/ui.js")
            ]);
            state.activeEvent=null;
            triggerRandomEvent();
            renderUI();
        });
        await page.locator("#realm-event-modal").waitFor({state:"visible",timeout:5000});
        await assertOverlayFits("#realm-event-modal","event decision panel","event");
        await page.locator("#realm-event-dismiss").click();
        await page.locator("#realm-event-modal").waitFor({state:"hidden",timeout:3000});
    }
    await page.setViewportSize({width:1600,height:1000});
    assert.deepEqual(errors,[],"browser runtime must not emit uncaught page errors");
    assert.deepEqual(consoleErrors,[],"browser runtime must not emit console errors");
    console.log("Browser E2E passed: world forge, seed, guardian/ward dossier links, memorial archive, on-demand card draw, safe card selection, real drag placement, settings, pause/resume, save/load; no page errors.");
    await context.close();
}finally{
    await browser.close();
    if(server)await new Promise(resolveClose=>server.close(resolveClose));
}
