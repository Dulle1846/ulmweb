import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {tmpdir} from "node:os";
import {chromium} from "playwright";

const root=process.cwd();
const screenshotDir=resolve(tmpdir(),"kac-ui-viewport-review");
await mkdir(screenshotDir,{recursive:true});
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
    assert.equal(await page.locator("#start-screen .start-hero-art").getAttribute("src"),"assets/royal-title-illustration.svg","the founding screen must use the original muted royal title artwork");

    assert.equal(await page.locator("#start-screen").getAttribute("role"),"dialog","the founding screen must expose dialog semantics");
    await page.waitForFunction(()=>document.activeElement?.id==="player-name-input",null,{timeout:3000});


    for(const [id,value] of [["world-landmass","72"],["world-ruggedness","64"],["world-forests","81"],["world-water","43"]]){
        await page.locator("#"+id).evaluate((el,next)=>{
            el.value=next;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));
        },value);
    }
    await page.locator("#world-seed-input").fill("20261104");
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
    assert.equal((await page.locator("#hand-count").innerText()).trim(),"0 / 5","new realms must begin with an empty hand");
    await page.locator("#speed-0-5").click();
    assert.ok(await page.locator("#speed-0-5").evaluate(el=>el.classList.contains("is-active")),"half-speed control must become active");
    await page.locator("#speed-1").click();

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
    assert.equal(await page.locator("#command-modal .command-deck [data-command-tab]").count(),10,"all ten management tabs must live inside the dialog");
    assert.equal(await page.locator("#command-panel-content .command-panel-intro h3").innerText(),"Kingdom overview","management must open on the live kingdom overview");
    await page.locator('[data-command-tab="kingdom"]').click();
    assert.equal(await page.locator("body > .command-deck").count(),0,"there must be no obscured duplicate navigation outside the dialog");
    await page.locator('[data-command-tab="government"]').click();
    assert.equal(await page.locator("#command-modal").isVisible(),true);
    await page.locator('[data-command="government-form"][data-value="council"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("Crowned council"));
    await page.locator('[data-command-tab="politics"]').click();
    await page.locator('[data-command="policy"][data-value="bread"]').click();
    await page.locator('[data-command-tab="decisions"]').click();
    await page.locator("#royal-consort-select").selectOption({index:1});
    await page.locator('[data-command="consort"]').click();
    await page.locator('[data-command="royal-birth"]').click();
    assert.ok((await page.locator("#command-panel-content").innerText()).includes("LIVING ROYAL CHILDREN"));
    await page.locator('[data-command-tab="creatures"]').click();
    await page.evaluate(async()=>{
        const {state}=await import("./js/core/state.js");
        state.resources.gold=250;state.resources.food=250;
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

    await page.locator("#building-search").fill("farm");
    assert.ok(await page.locator("#command-panel-content .building-record:not(.is-filtered)").count()>=1,"building filter must retain matching structures");
    await page.locator("#building-search").fill("");
    await page.evaluate(async()=>{
        const [{state},{addLog,triggerRandomEvent}]=await Promise.all([
            import("./js/core/state.js"),import("./js/systems/events.js")
        ]);
        state.activeEvent=null;
        const {renderUI}=await import("./js/presentation/rendering/ui.js");
        renderUI();
        addLog("E2E CHRONICLE ENTRY","#c5a66b","e2e");
        triggerRandomEvent();
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

    await page.locator("#speed-4").click();
    await page.waitForFunction(()=>{
        const value=document.querySelector("#hand-count")?.textContent||"0 / 5";
        return Number.parseInt(value,10)>=3;
    },null,{timeout:45000});
    const countBeforeClick=Number.parseInt(await page.locator("#hand-count").innerText(),10);
    const cardButtons=page.locator("#card-hand .hand-card");
    assert.ok(await page.locator("#card-hand .hand-card-sprite use").count()>=1,"every card must display original category artwork");
    assert.ok((await page.locator("#card-hand .hand-card-sprite use").first().getAttribute("href")).startsWith("assets/royal-card-atlas.svg#"),"card hand must use the dedicated royal card atlas");

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
    await page.locator("#speed-2").click();
    const savedTick=(await page.locator("#tick-count").innerText()).trim();
    const savedHand=(await page.locator("#hand-count").innerText()).trim();
    const savedRoadCount=await page.evaluate(()=>(import("./js/systems/roads.js")).then(module=>module.getRoadCount()));
    const resourceFixture=await page.evaluate(async()=>{
        const {getResourceNodeAt,harvestForest,extractStone}=await import("./js/systems/resource-geography.js");
        for(let y=0;y<160;y++)for(let x=0;x<160;x++){
            const node=getResourceNodeAt(x,y);
            if(node.forestStock>3){harvestForest(x,y,1);return {type:"forest",x,y,savedStock:node.forestStock-1};}
            if(node.stoneStock>3){extractStone(x,y,1);return {type:"stone",x,y,savedStock:node.stoneStock-1};}
        }
        throw new Error("No resource deposit was generated for the save/load test");
    });
    await page.locator("#save-btn").click();
    await page.waitForFunction(()=>document.querySelector("#status-message")?.textContent.includes("Realm saved"),null,{timeout:5000});
    await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).removeRoad(x,y),{x:roadFixture.x,y:roadFixture.y});
    assert.equal(await page.evaluate(async({x,y})=>(await import("./js/systems/roads.js")).getRoadAt(x,y),{x:roadFixture.x,y:roadFixture.y}),null,"road mutation after save should be visible before loading");
    await page.evaluate(async({type,x,y})=>{
        const module=await import("./js/systems/resource-geography.js");
        if(type==="forest")module.harvestForest(x,y,1);else module.extractStone(x,y,1);
    },resourceFixture);
    await page.locator("#speed-4").click();
    await page.locator("#load-btn").click();
    await page.waitForFunction(()=>{
        const message=document.querySelector("#status-message")?.textContent||"";
        return message.includes("Loaded realm")||message.includes("Load failed")||message.includes("No valid saved realm");
    },null,{timeout:5000});
    const loadStatus=(await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"),"load must succeed; actual status: "+loadStatus);
    assert.ok(await page.locator("#speed-2").evaluate(el=>el.classList.contains("is-active")),"save/load must restore the saved simulation speed");
    assert.equal(await page.locator("#speed-4").evaluate(el=>el.classList.contains("is-active")),false,"load must clear the previous speed selection");
    assert.equal((await page.locator("#tick-count").innerText()).trim(),savedTick,"save/load must restore the exact simulation tick");
    assert.equal((await page.locator("#hand-count").innerText()).trim(),savedHand,"save/load must restore the card hand");
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
    await page.locator("#pause-btn").click();


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
            const before=await panel.evaluate(el=>({clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflowY:getComputedStyle(el).overflowY}));
            assert.ok(["auto","scroll"].includes(before.overflowY),"mobile management column must expose vertical scrolling at "+width+"x"+height+": "+JSON.stringify(before));
            assert.ok(before.scrollHeight>before.clientHeight,"mobile management column must retain content beyond its viewport at "+width+"x"+height+": "+JSON.stringify(before));
            const reachability=await panel.evaluate(el=>{
                const card=el.querySelector("#card-container");
                const original=el.scrollTop;
                const panelRect=el.getBoundingClientRect();
                const cardRect=card.getBoundingClientRect();
                const cardTopInScroll=cardRect.top-panelRect.top+el.scrollTop;
                el.scrollTop=Math.max(0,cardTopInScroll+cardRect.height-el.clientHeight);
                const finalPanel=el.getBoundingClientRect();
                const finalCard=card.getBoundingClientRect();
                return {
                    scrollTop:el.scrollTop,
                    cardTop:finalCard.top,
                    cardBottom:finalCard.bottom,
                    panelTop:finalPanel.top,
                    panelBottom:finalPanel.bottom,
                    cardReachable:finalCard.top>=finalPanel.top-1&&finalCard.bottom<=finalPanel.bottom+1
                };
            });
            assert.ok(reachability.scrollTop>0,"mobile management column must be scrollable at "+width+"x"+height);
            assert.ok(reachability.cardReachable,"selected card must be fully reachable inside the mobile management column at "+width+"x"+height+": "+JSON.stringify(reachability));
            await page.screenshot({path:resolve(screenshotDir,"sidepanel-card-reachable-"+width+"x"+height+".png"),animations:"disabled"});
            await panel.evaluate(el=>{el.scrollTop=0});
        }
        await page.locator("#command-open-btn").click();
        const dialog=await page.locator("#command-modal .command-panel").boundingBox();
        assert.ok(dialog&&dialog.x>=0&&dialog.y>=0&&dialog.x+dialog.width<=width+1&&dialog.y+dialog.height<=height+1,"management dialog must fit viewport "+width+"x"+height+": "+JSON.stringify(dialog));
        await page.screenshot({path:resolve(screenshotDir,"management-"+width+"x"+height+".png"),animations:"disabled"});
        await page.locator("#command-close").click();
    }
    await page.setViewportSize({width:1600,height:1000});
    assert.deepEqual(errors,[],"browser runtime must not emit uncaught page errors");
    assert.deepEqual(consoleErrors,[],"browser runtime must not emit console errors");
    console.log("Browser E2E passed: world forge, seed, guardian/ward dossier links, memorial archive, empty/timed hand, safe card selection, real drag placement, settings, pause/resume, save/load; no page errors.");
    await context.close();
}finally{
    await browser.close();
    await new Promise(resolveClose=>server.close(resolveClose));
}
