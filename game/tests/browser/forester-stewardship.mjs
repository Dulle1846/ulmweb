import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {chromium} from "playwright";

const root=process.cwd();
const port=Number(process.env.E2E_PORT)||4174;
const remoteOrigin=process.env.E2E_BASE_URL?new URL(process.env.E2E_BASE_URL).origin:null;
const outDir=resolve(root,process.env.FORESTER_AUDIT_OUT||"docs/forester-stewardship");
await mkdir(outDir,{recursive:true});

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
    headless:true,
    executablePath:process.env.E2E_CHROMIUM_EXECUTABLE||undefined,
    args:["--no-sandbox","--disable-dev-shm-usage"]
});
const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:"reduce"});
const pageErrors=[];
const consoleErrors=[];
page.on("pageerror",error=>pageErrors.push(error.message));
page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});

async function dismissBlockingMessage(){
    const eventDismiss=page.locator("#realm-event-dismiss");
    if(await eventDismiss.isVisible().catch(()=>false)){
        await eventDismiss.click();
        await page.waitForTimeout(120);
    }
    const button=page.locator("#big-message-close");
    if(await button.isVisible().catch(()=>false))await button.click();
}

async function advanceTicks(count){
    await page.evaluate(async ticks=>{
        const [{state},{updateSimulation}]=await Promise.all([
            import("./js/core/state.js"),
            import("./js/simulation/simulation.js")
        ]);
        state.isPaused=false;
        for(let index=0;index<ticks;index++){
            updateSimulation();
            if(state.gameOver)break;
        }
        state.isPaused=true;
    },count);
    await page.waitForTimeout(180);
    await dismissBlockingMessage();
}

async function canvasDigests(){
    return page.evaluate(()=>{
        const digest=(canvas)=>{
            const context=canvas?.getContext?.("2d");
            if(!context)return null;
            try{
                const {width,height}=canvas;
                const pixels=context.getImageData(0,0,width,height).data;
                let hash=2166136261>>>0;
                let samples=0;
                const stride=Math.max(4,Math.floor((width*height)/18000)*4);
                for(let index=0;index<pixels.length;index+=stride){
                    hash^=pixels[index];hash=Math.imul(hash,16777619)>>>0;
                    hash^=pixels[index+1]||0;hash=Math.imul(hash,16777619)>>>0;
                    hash^=pixels[index+2]||0;hash=Math.imul(hash,16777619)>>>0;
                    samples++;
                }
                return {hash:hash.toString(16).padStart(8,"0"),samples,width,height};
            }catch{return null;}
        };
        return {
            terrain:digest(document.getElementById("terrain-canvas")),
            interactive:digest(document.getElementById("canvas"))
        };
    });
}

async function refreshBuildingRegister(){
    await dismissBlockingMessage();
    if(await page.locator("#command-modal").evaluate(element=>element.classList.contains("hidden"))){
        await page.locator("#command-open-btn").click();
    }
    await page.locator('[data-command-tab="buildings"]').click();
    await page.locator("#command-panel-content .building-register").waitFor({timeout:10000});
}

async function readForesterRecord(foresterId){
    await refreshBuildingRegister();
    const record=page.locator("#command-panel-content .building-record").filter({hasText:foresterId});
    assert.equal(await record.count(),1,"the Forester must have exactly one building-register row");
    await record.scrollIntoViewIfNeeded();
    if(!await record.evaluate(element=>element.open))await record.locator("summary").click();
    await page.waitForTimeout(80);
    const recordText=(await record.innerText()).replace(/\s+/g," ").trim();
    const block=record.locator("[data-forester-stewardship]");
    assert.equal(await block.count(),1,"the Forester record must contain a dedicated stewardship block");
    const values=await block.evaluate(element=>({
        stock:Number(element.dataset.forestStock),
        capacity:Number(element.dataset.forestCapacity),
        restorable:Number(element.dataset.forestRestorable),
        status:String(element.dataset.forestStatus||"")
    }));
    const blockText=(await block.innerText()).replace(/\s+/g," ").trim();
    assert.ok(blockText.includes("FOREST STEWARDSHIP"),"the stewardship block must identify itself to a player");
    assert.ok(["Planting saplings","Waiting for planting space","Forest is fully grown"].includes(values.status),"the block must expose a real live stewardship status");
    const percent=Number((blockText.match(/(\d+)%/)||[])[1]);
    assert.ok(Number.isFinite(percent),"the stewardship block must expose a visible percentage");
    return {element:record,block,recordText,blockText,percent,...values};
}

async function stageForCapture(){
    const previous=await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        const before={
            dayOfYear:state.dayOfYear,
            seasonIndex:state.seasonIndex,
            timeOfDay:state.timeOfDay,
            weather:state.weather,
            weatherTimer:state.weatherTimer
        };
        // Fixed daylight and season make the before/after screenshots about the
        // planted stand, not about foliage turning green a few months later.
        state.dayOfYear=150;
        state.seasonIndex=1;
        state.timeOfDay=12;
        state.weather="clear";
        state.weatherTimer=0;
        state.terrainCacheRevision=(Number(state.terrainCacheRevision)||0)+1;
        return before;
    });
    await page.waitForTimeout(1100);
    return previous;
}

async function restoreAfterCapture(previous){
    await page.evaluate(async before=>{
        const {state}=await import("./js/core/state.js");
        state.dayOfYear=before.dayOfYear;
        state.seasonIndex=before.seasonIndex;
        state.timeOfDay=before.timeOfDay;
        state.weather=before.weather;
        state.weatherTimer=before.weatherTimer;
        state.terrainCacheRevision=(Number(state.terrainCacheRevision)||0)+1;
    },previous);
    await page.waitForTimeout(180);
}

async function captureMapCloseup(path,site){
    const box=await page.locator("#canvas-wrapper").boundingBox();
    if(!box)throw new Error("The map stage has no bounding box");
    const point=await page.evaluate(async({site,coords})=>{
        const [{state},{CELL}]=await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/config.js")
        ]);
        return {
            x:(coords.x+0.5)*CELL*state.zoom-state.camera.x,
            y:(coords.y+0.5)*CELL*state.zoom-state.camera.y
        };
    },{site,coords:site});
    const width=Math.min(720,box.width-30);
    const height=Math.min(570,box.height-30);
    const x=Math.min(Math.max(box.x+point.x-width/2,box.x),box.x+box.width-width);
    const y=Math.min(Math.max(box.y+point.y-height/2,box.y),box.y+box.height-height);
    await page.screenshot({path,clip:{x,y,width,height}});
}

async function stateSample(foresterId,targets){
    return page.evaluate(async({id,coords})=>{
        const [{state},{foresterRangeSummary},{getResourceNodeAt}]=await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/fields.js"),
            import("./js/systems/resource-geography.js")
        ]);
        const forester=state.entities.find(entity=>!entity.dead&&String(entity.id)===String(id));
        if(!forester)throw new Error("Forester disappeared from the live realm");
        const range=foresterRangeSummary(forester);
        return {
            tick:state.tick,
            dayOfYear:state.dayOfYear,
            year:state.year,
            isPaused:state.isPaused,
            mode:state.terrainMode,
            workerCount:Number(forester.workerCount)||0,
            planted:Number(forester.foresterPlanted)||0,
            reason:forester.foresterReason||"",
            productionReason:forester.productionReason||"",
            range,
            visualRevision:Number(state.forestVisualRevision)||0,
            cacheMisses:Number(state.terrainCacheMisses)||0,
            targets:coords.map(tile=>{
                const node=getResourceNodeAt(tile.x,tile.y);
                return {x:tile.x,y:tile.y,stock:node.forestStock,capacity:node.forestCapacity};
            })
        };
    },{id:foresterId,coords:targets});
}

function parseDomValues(record){
    return {
        stock:record.stock,
        capacity:record.capacity,
        percent:record.percent,
        restorable:record.restorable,
        status:record.status
    };
}

try{
    await page.goto(baseUrl+"/",{waitUntil:"networkidle",timeout:60000});
    assert.equal(await page.title(),"KINGS & CARDS • Eternal Realm");
    await page.locator("#start-screen").waitFor({state:"visible",timeout:30000});
    await page.locator("#world-seed-input").fill("20261108");
    await page.waitForFunction(()=>document.querySelector("#world-preview-status")?.textContent.includes("SEED 20261108"),null,{timeout:20000}).catch(()=>{});
    await page.locator("#player-name-input").fill("Forester Browser Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({state:"hidden",timeout:30000});
    await page.waitForTimeout(1600);
    await dismissBlockingMessage();
    await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        state.isPaused=true;
    });

    const setup=await page.evaluate(async()=>{
        const [{state},{TYPE},{CELL},{spawnEntity,buildingAt},{getResourceNodeAt,harvestForest,plantForestAt},{foresterRangeSummary}]=await Promise.all([
            import("./js/core/state.js"),import("./js/core/types.js"),import("./js/core/config.js"),
            import("./js/world/entities.js"),import("./js/systems/resource-geography.js"),
            import("./js/systems/fields.js")
        ]);
        const canvas=state.canvas;
        const centerX=(state.camera.x+canvas.width/2)/(CELL*state.zoom);
        const centerY=(state.camera.y+canvas.height/2)/(CELL*state.zoom);
        const occupied=(x,y)=>Boolean(buildingAt(x,y));
        const clearOfBuildings=(x,y,radius)=>{
            for(let oy=-radius;oy<=radius;oy++){
                for(let ox=-radius;ox<=radius;ox++){
                    if(occupied(x+ox,y+oy))return false;
                }
            }
            return true;
        };
        const candidates=[];
        for(let y=8;y<state.worldH-8;y++){
            for(let x=8;x<state.worldW-8;x++){
                if(!state.explored?.[x]?.[y]||!clearOfBuildings(x,y,2))continue;
                const siteNode=getResourceNodeAt(x,y);
                if(!siteNode||siteNode.forestCapacity<=0)continue;
                const distance=Math.hypot(x-centerX,y-centerY);
                if(distance<5||distance>20)continue;
                const forest=[];
                const low=[];
                for(let oy=-5;oy<=5;oy++){
                    for(let ox=-5;ox<=5;ox++){
                        if(Math.max(Math.abs(ox),Math.abs(oy))>5)continue;
                        const tx=x+ox,ty=y+oy;
                        const node=getResourceNodeAt(tx,ty);
                        if(!node||node.forestCapacity<=0||occupied(tx,ty)||!state.explored?.[tx]?.[ty])continue;
                        forest.push({x:tx,y:ty,capacity:node.forestCapacity,stock:node.forestStock});
                        if(Math.max(Math.abs(ox),Math.abs(oy))<=3&&node.forestCapacity<=110&&clearOfBuildings(tx,ty,1))low.push({x:tx,y:ty,capacity:node.forestCapacity});
                    }
                }
                if(forest.length<10||low.length<3)continue;
                candidates.push({x,y,distance,forest,lowCount:low.length});
            }
        }
        const siteScore=site=>site.forest.length+site.lowCount*3-site.distance*0.2;
        candidates.sort((a,b)=>siteScore(b)-siteScore(a));
        const site=candidates[0];
        if(!site)throw new Error("Could not find an explored forest site near the camera");
        const range=[];
        for(let oy=-5;oy<=5;oy++){
            for(let ox=-5;ox<=5;ox++){
                if(Math.max(Math.abs(ox),Math.abs(oy))>5)continue;
                const node=getResourceNodeAt(site.x+ox,site.y+oy);
                if(!node||node.forestCapacity<=0||occupied(site.x+ox,site.y+oy))continue;
                range.push({x:site.x+ox,y:site.y+oy,capacity:node.forestCapacity});
            }
        }
        const targetCandidates=range
            .filter(tile=>Math.max(Math.abs(tile.x-site.x),Math.abs(tile.y-site.y))<=2&&(tile.x!==site.x||tile.y!==site.y)&&clearOfBuildings(tile.x,tile.y,1))
            .sort((a,b)=>a.capacity-b.capacity||Math.hypot(a.x-site.x,a.y-site.y)-Math.hypot(b.x-site.x,b.y-site.y));
        if(targetCandidates.length<3)throw new Error("The forest site needs at least three low-capacity neighbour stands");
        const targets=[];
        let targetCapacity=0;
        for(const tile of targetCandidates){
            if(targets.length>=4||(targets.length>=2&&targetCapacity+tile.capacity>360))break;
            targets.push({x:tile.x,y:tile.y,capacity:tile.capacity});
            targetCapacity+=tile.capacity;
        }
        if(targets.length<3)throw new Error("Could not select three cut-over stands");
        for(const tile of range)plantForestAt(tile.x,tile.y,tile.capacity);
        for(const tile of targets)harvestForest(tile.x,tile.y,tile.capacity);
        const forester=spawnEntity(site.x,site.y,TYPE.FORESTER);
        if(!forester)throw new Error("Could not place the Forester");
        forester.construction=null;
        for(let index=0;index<2;index++){
            const worker=spawnEntity(site.x+(index?2:-2),site.y+3,TYPE.VILLAGER);
            if(!worker)throw new Error("Could not place a Forester worker");
            worker.workplace=forester;
            worker.job="forester";
            worker.anchor={x:site.x,y:site.y};
            worker.jobRefreshTimer=1_000_000;
        }
        const zoom=2.45;
        state.zoom=zoom;
        state.zoomTarget=zoom;
        state.zoomLevel=3;
        state.camera.x=(site.x+0.5)*CELL*zoom-canvas.width/2;
        state.camera.y=(site.y+0.5)*CELL*zoom-canvas.height/2;
        state.selectedBuildingId=forester.id;
        return {
            seed:state.worldSeed,
            world:[state.worldW,state.worldH],
            site:{x:site.x,y:site.y},
            foresterId:forester.id,
            targets,
            targetCapacity,
            rangeBefore:foresterRangeSummary(forester),
            camera:{...state.camera},
            zoom
        };
    });

    const cutoverStage=await stageForCapture();
    const cutoverDigest=await canvasDigests();
    await captureMapCloseup(resolve(outDir,"map-cutover.png"),setup.site);
    await restoreAfterCapture(cutoverStage);

    await advanceTicks(1);
    let planting=await stateSample(setup.foresterId,setup.targets);
    assert.equal(planting.reason,"Planting saplings","the staffed Forester must start planting immediately");
    assert.equal(planting.workerCount,2,"both assigned Foresters must be counted by the workforce");
    assert.ok(planting.targets.some(tile=>tile.stock>0),"the first tick must add saplings to the cut-over stands");
    const plantingRecord=await readForesterRecord(setup.foresterId);
    assert.ok(!plantingRecord.recordText.includes("Forest stand is depleted"),"a planting Forester must never show the false depletion status");
    assert.deepEqual(parseDomValues(plantingRecord),{
        stock:planting.range.stock,
        capacity:planting.range.capacity,
        percent:Math.round(planting.range.fill*100),
        restorable:planting.range.restorable,
        status:planting.reason
    },"the rendered stewardship row must match the live simulation values");
    await plantingRecord.element.screenshot({path:resolve(outDir,"panel-planting.png")});
    await plantingRecord.block.screenshot({path:resolve(outDir,"stewardship-planting.png")});
    const plantingText=plantingRecord.recordText;

    await advanceTicks(8);
    const progress=await stateSample(setup.foresterId,setup.targets);
    assert.ok(progress.targets.reduce((sum,tile)=>sum+tile.stock,0)>planting.targets.reduce((sum,tile)=>sum+tile.stock,0),"forest stock must rise over multiple ticks");
    assert.equal(progress.reason,"Planting saplings");
    const progressRecord=await readForesterRecord(setup.foresterId);
    assert.deepEqual(parseDomValues(progressRecord),{
        stock:progress.range.stock,
        capacity:progress.range.capacity,
        percent:Math.round(progress.range.fill*100),
        restorable:progress.range.restorable,
        status:progress.reason
    },"the stewardship row must refresh after ticks");
    await page.locator("#command-close").click();
    const progressStage=await stageForCapture();
    const progressDigest=await canvasDigests();
    await captureMapCloseup(resolve(outDir,"map-progress.png"),setup.site);
    await restoreAfterCapture(progressStage);

    const plantedInTargets=progress.targets.reduce((sum,tile)=>sum+tile.stock,0);
    const remaining=Math.max(0,setup.targetCapacity-plantedInTargets);
    const ticksToFill=Math.min(420,Math.ceil(remaining/2)+8);
    await advanceTicks(ticksToFill);
    let grown=await stateSample(setup.foresterId,setup.targets);
    for(let attempt=0;attempt<3&&grown.range.restorable>0;attempt++){
        await advanceTicks(50);
        grown=await stateSample(setup.foresterId,setup.targets);
    }
    assert.equal(grown.range.restorable,0,"the Forester must eventually restore every cut-over stand in its range");
    assert.equal(grown.reason,"Forest is fully grown","the fully restored range must report the complete status");
    assert.ok(!grown.productionReason.includes("Forest stand is depleted"),"the catalogue must not override the live stewardship reason");
    const grownRecord=await readForesterRecord(setup.foresterId);
    assert.ok(!grownRecord.recordText.includes("Forest stand is depleted"));
    assert.deepEqual(parseDomValues(grownRecord),{
        stock:grown.range.stock,
        capacity:grown.range.capacity,
        percent:Math.round(grown.range.fill*100),
        restorable:grown.range.restorable,
        status:grown.reason
    },"the final stewardship row must match the fully restored range");
    await grownRecord.element.screenshot({path:resolve(outDir,"panel-grown.png")});
    await grownRecord.block.screenshot({path:resolve(outDir,"stewardship-grown.png")});
    await page.screenshot({path:resolve(outDir,"forester-stewardship.png")});
    await page.locator("#command-close").click();
    await stageForCapture();
    const grownDigest=await canvasDigests();
    await captureMapCloseup(resolve(outDir,"map-grown.png"),setup.site);

    const totalPlanted=grown.planted-planting.planted;
    assert.ok(totalPlanted>0,"the Forester must have planted during the run");
    assert.ok(grown.range.stock>planting.range.stock,"the visible range stock must increase");
    const changedHashes=[
        cutoverDigest.terrain&&grownDigest.terrain&&cutoverDigest.terrain.hash!==grownDigest.terrain.hash,
        cutoverDigest.interactive&&grownDigest.interactive&&cutoverDigest.interactive.hash!==grownDigest.interactive.hash
    ];
    const visualChanged=changedHashes.some(Boolean);
    assert.ok(visualChanged,"the woodland raster must change when the planted stands grow");

    const report={
        generatedAt:new Date().toISOString(),
        baseUrl,
        seed:setup.seed,
        world:setup.world,
        site:setup.site,
        foresterId:setup.foresterId,
        targets:setup.targets,
        targetCapacity:setup.targetCapacity,
        planting:{
            tick:planting.tick,
            workerCount:planting.workerCount,
            reason:planting.reason,
            range:planting.range,
            targets:planting.targets,
            dom:parseDomValues(plantingRecord),
            text:plantingText,
            blockText:plantingRecord.blockText
        },
        progress:{
            tick:progress.tick,
            reason:progress.reason,
            range:progress.range,
            targets:progress.targets,
            dom:parseDomValues(progressRecord),
            visualRevision:progress.visualRevision,
            cacheMisses:progress.cacheMisses
        },
        grown:{
            tick:grown.tick,
            year:grown.year,
            dayOfYear:grown.dayOfYear,
            reason:grown.reason,
            productionReason:grown.productionReason,
            range:grown.range,
            targets:grown.targets,
            dom:parseDomValues(grownRecord),
            blockText:grownRecord.blockText,
            visualRevision:grown.visualRevision,
            cacheMisses:grown.cacheMisses,
            totalPlanted
        },
        renderer:grown.mode,
        hashes:{cutover:cutoverDigest,progress:progressDigest,grown:grownDigest},
        screenshots:[
            "map-cutover.png","panel-planting.png","stewardship-planting.png","map-progress.png",
            "panel-grown.png","stewardship-grown.png","forester-stewardship.png","map-grown.png"
        ],
        pageErrors,
        consoleErrors
    };
    await writeFile(resolve(outDir,"forester-stewardship.json"),JSON.stringify(report,null,2));
    assert.deepEqual(pageErrors,[],"the browser run must not raise page errors");
    console.log(JSON.stringify({
        ok:true,
        url:baseUrl,
        foresterId:setup.foresterId,
        tick:grown.tick,
        status:grown.reason,
        range:grown.range,
        dom:parseDomValues(grownRecord),
        visualChanged,
        renderer:grown.mode,
        screenshots:report.screenshots,
        outDir
    },null,2));
}finally{
    await browser.close();
    if(server)await new Promise(resolveClose=>server.close(resolveClose));
}
