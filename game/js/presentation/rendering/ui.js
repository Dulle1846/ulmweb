// UI presentation: player hand, realm events, trade market and statistics.
import { SEASONS } from "../../core/config.js";
import { state } from "../../core/state.js";
import { getTradePartners,MARKET_RESOURCES } from "../../systems/market.js";
import { getHousingSnapshot } from "../../systems/population.js";
import { getRoomBonusSnapshot, roomBonusSignature } from "../../systems/rooms.js";
import { getRoyalHouse } from "../../systems/royal-dynasty.js";
import { getAmbitionSnapshot } from "../../systems/ambitions.js";
import { getCoreCounsel } from "../core-counsel.js";
import { getFirstSessionSnapshot } from "../first-session.js";
import { renderStatisticsExplorer } from "../statistics-panel.js";

let messageTimeout=null,lastTabSignature="",lastRoomBonusSignature="",lastAmbitionSignature="",lastFirstSessionSignature="",lastRenderedIssueId=null,lastCardSprite="",lastTickTextAt=0;
function setText(id,value){const el=document.getElementById(id);const next=String(value);if(el&&el.textContent!==next)el.textContent=next;}
function setAttr(el,name,value){if(el&&el.getAttribute(name)!==String(value))el.setAttribute(name,String(value));}
function setHTML(el,markup){if(el&&el.innerHTML!==markup)el.innerHTML=markup;}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function income(v){
    const value=Number(v);
    if(!Number.isFinite(value)||value===0)return "";
    const rounded=Math.round(value*10)/10;
    return (rounded>0?"+":"")+rounded.toLocaleString("en-US",{maximumFractionDigits:1});
}
function rulerPortraitSymbol(entity){
    const person=entity?.person||{};
    const role=String(person.role||"").toLowerCase();
    const sex=String(person.sex||"").toLowerCase();
    const female=sex==="f"||sex.includes("female")||sex.includes("woman");
    if(entity?.isKing||/sovereign|monarch|ruler|king|queen/.test(role))return female?"portrait-queen":"portrait-king";
    if(/scholar|scribe|healer|cleric|priest|mage|teacher/.test(role))return "portrait-scholar";
    if(/knight|guard|soldier|marshal|captain|archer/.test(role))return "portrait-knight";
    if(/noble|lord|lady|court|consort/.test(role))return female?"portrait-noblewoman":"portrait-nobleman";
    return female?"portrait-noblewoman":"portrait-villager";
}
function personName(personId){
    const id=String(personId||"");
    const live=state.entities.find(entity=>!entity.dead&&String(entity.personId||entity.person?.id||"")===id);
    if(live?.person?.name)return live.person.name;
    const memorial=(state.personArchive||[]).find(entry=>String(entry.personId||"")===id);
    return memorial?.person?.name||("Recorded person "+id);
}
function renderTopStatus(){
    let house=null;
    try{house=getRoyalHouse();}catch{/* The realm has not appointed a sovereign yet. */}
    const ruler=house?.king||null,person=ruler?.person||null;
    const personId=String(ruler?.personId||person?.id||"");
    setText("ruler-name",person?.name||"THE CROWN VACANT");
    setText("ruler-title",person?String(person.role||"sovereign").toUpperCase()+" OF "+(state.kingdomName||"ELDRIA"):"AWAITING SUCCESSION");
    const portrait=document.getElementById("ruler-portrait-use");
    if(portrait)setAttr(portrait,"href","assets/royal-portraits.svg#"+rulerPortraitSymbol(ruler));
    const button=document.getElementById("ruler-dossier-btn");
    if(button){
        button.disabled=!personId;
        if(button.dataset.personId!==personId)button.dataset.personId=personId;
        const title=person?"Open the dossier of "+person.name:"No sovereign has been recorded";
        if(button.title!==title)button.title=title;
    }
    const history=Array.isArray(state.economy?.history)?state.economy.history:[];
    const latest=history[history.length-1],previous=history[history.length-2];
    const delta=latest&&previous?Number(latest.gold)-Number(previous.gold):null;
    const debt=Math.max(0,Number(state.economy?.debt)||0);
    const settlement=delta===null?"TREASURY · AWAITING LEDGER":"TREASURY "+(delta>=0?"+":"")+Math.round(delta)+" · LAST SETTLEMENT";
    setText("treasury-trend",debt>0?settlement+" · DEBT "+Math.round(debt)+"G":settlement);
    const warnings=(state.activeEvent&&!state.activeEvent.dismissed?1:0)+(state.health?.outbreakActive?1:0)+(state.raidActive?1:0);
    setText("warning-count",String(warnings));
    const warning=document.getElementById("warning-inbox-btn");
    if(warning){
        warning.classList.toggle("has-warning",warnings>0);
        setAttr(warning,"aria-label",warnings+" open warning"+(warnings===1?"":"s"));
        const warningTitle=warnings?warnings+" realm warning"+(warnings===1?"":"s")+" need attention":"No realm warnings are open";
        if(warning.title!==warningTitle)warning.title=warningTitle;
    }
}
function roomEffectValue(value){
    const rounded=Math.round(Number(value)*10)/10;
    if(!Number.isFinite(rounded)||rounded<=0)return "—";
    return "+"+(Number.isInteger(rounded)?String(rounded):rounded.toFixed(1));
}

function renderRoomBonuses(){
    const grid=document.getElementById("room-bonus-grid");
    if(!grid)return;
    const signature=roomBonusSignature();
    if(signature===lastRoomBonusSignature)return;
    lastRoomBonusSignature=signature;
    const snapshot=getRoomBonusSnapshot();
    const status=document.getElementById("room-bonus-status");
    if(status){
        status.textContent=snapshot.rooms
            ? snapshot.rooms+" ROOMS"+(snapshot.sealed?" · "+snapshot.sealed+" SEALED":" · ALL REACHABLE")
            : "NO ACCESSIBLE ROOMS";
    }
    const effects=[
        {key:"gold",label:"GOLD",icon:"◉",value:snapshot.totals.gold,unit:"/ 20 DAYS",title:"Accessible treasury rooms add this much gold every 20 days."},
        {key:"legitimacy",label:"LEGITIMACY",icon:"♛",value:snapshot.totals.legitimacy,unit:"/ 20 DAYS",title:"Throne rooms and places of faith add legitimacy every 20 days."},
        {key:"morale",label:"MORALE",icon:"✦",value:snapshot.totals.morale,unit:"/ 20 DAYS",title:"Comfortable, reachable rooms lift realm morale every 20 days."},
        {key:"growth",label:"GROWTH",icon:"↑",value:snapshot.totals.growth,unit:"LESS MORALE",title:"Population growth needs this much less morale; household rooms provide it."},
        {key:"defense",label:"DEFENSE",icon:"♜",value:snapshot.totals.defense,unit:"DMG REDUCTION",title:"Guards and watch posts reduce damage from raids."}
    ].filter(entry=>entry.value>0.0001).map(entry=>({...entry,capped:Boolean(snapshot.capped[entry.key])}));
    grid.innerHTML=effects.length?effects.map(entry=>{
        const value=entry.key==="defense"?Math.round(entry.value*100)+"%":roomEffectValue(entry.value);
        const title=entry.capped?entry.title+" Realm cap reached.":entry.title;
        return '<div class="room-bonus-stat'+(entry.capped?' is-capped':'')+'" title="'+esc(title)+'">'+
            '<span class="room-bonus-icon" aria-hidden="true">'+entry.icon+'</span>'+
            '<span class="room-bonus-copy"><small>'+entry.label+(entry.capped?' · CAP':'')+'</small><strong>'+value+'</strong><em>'+entry.unit+'</em></span>'+
            '</div>';
    }).join(""):'<div class="room-bonus-empty">Build and connect rooms to earn realm bonuses.</div>';
    const roomsEl=document.getElementById("room-bonus-rooms");
    if(roomsEl){
        const chips=snapshot.roles.filter(role=>role.roomCount>0).map(role=>
            '<span class="room-bonus-room" title="'+esc(role.description)+'">'+role.icon+' '+esc(role.short)+' ×'+role.roomCount+'</span>'
        );
        if(snapshot.sealed)chips.push('<span class="room-bonus-room is-warning" title="Sealed rooms grant no bonuses until a door connects them.">⚠ '+snapshot.sealed+' SEALED</span>');
        roomsEl.innerHTML=chips.join("");
    }
}

function renderAmbition(){
    const section=document.getElementById("ambition-section");
    if(!section)return;
    const snapshot=getAmbitionSnapshot();
    const counsel=getCoreCounsel(state);
    const signature=[snapshot.id,snapshot.completedCount,snapshot.total,Math.round(snapshot.progress*100),snapshot.progressLabel,snapshot.allComplete,snapshot.eternal,snapshot.eternalCount,snapshot.era,snapshot.agenda,snapshot.stageIndex,counsel.id,counsel.text].join("|");
    if(signature===lastAmbitionSignature)return;
    lastAmbitionSignature=signature;
    setText("ambition-count",snapshot.completedCount+" / "+snapshot.total);
    setText("ambition-kicker",snapshot.agenda?"ERA AGENDA · "+(snapshot.stageIndex+1)+" OF "+snapshot.stageTotal:snapshot.eternal?(snapshot.eternalLabel||"ETERNAL DEED"):snapshot.allComplete?"LEGEND COMPLETE":"NEXT CHAPTER · "+(snapshot.completedCount+1)+" OF "+snapshot.total);
    setText("ambition-title",snapshot.title);
    setText("ambition-description",snapshot.description);
    setText("ambition-progress-label",snapshot.progressLabel);
    setText("ambition-reward",snapshot.agenda?"STAGE REWARD · "+snapshot.rewardText:snapshot.eternal?"ETERNAL REWARD · "+snapshot.rewardText:snapshot.allComplete?"ALL AMBITIONS FULFILLED":"REWARD · "+snapshot.rewardText);
    const bar=document.getElementById("ambition-bar");
    if(bar)bar.style.width=Math.round(snapshot.progress*100)+"%";
    const progress=document.querySelector("#ambition-section .ambition-progress");
    if(progress)progress.setAttribute("aria-valuenow",String(Math.round(snapshot.progress*100)));
    setText("ambition-counsel-text",counsel.text);
    const counselAction=document.getElementById("ambition-counsel-action");
    if(counselAction){
        counselAction.textContent=counsel.actionLabel;
        counselAction.hidden=!counsel.panel;
        if(counsel.panel)counselAction.dataset.kacPanel=counsel.panel;
    }
    section.classList.toggle("is-complete",snapshot.allComplete&&!snapshot.eternal&&!snapshot.agenda);
    section.classList.toggle("is-eternal",Boolean(snapshot.eternal||snapshot.agenda));
}

function renderFirstSession(){
    const section=document.getElementById("first-session-section");
    if(!section)return;
    const snapshot=getFirstSessionSnapshot();
    const signature=snapshot.items.map(item=>item.done?1:0).join("")+"|"+snapshot.completed;
    if(signature===lastFirstSessionSignature)return;
    lastFirstSessionSignature=signature;
    setText("first-session-heading",snapshot.allComplete?"FIRST SESSION COMPLETE":"FIRST SESSION");
    setText("first-session-count",snapshot.completed+" / "+snapshot.total);
    section.classList.toggle("is-complete",snapshot.allComplete);
    const list=document.getElementById("first-session-list");
    const complete=document.getElementById("first-session-complete");
    if(complete)complete.hidden=!snapshot.allComplete;
    if(!list)return;
    list.hidden=snapshot.allComplete;
    if(snapshot.allComplete)return;
    const currentIndex=snapshot.items.findIndex(item=>!item.done);
    list.innerHTML=snapshot.items.map((item,index)=>{
        const done=item.done,current=!done&&index===currentIndex;
        return '<li class="first-session-step'+(done?' is-done':'')+(current?' is-current':'')+'"'+(current?' aria-current="step"':'')+'>'+
            '<span class="first-session-mark" aria-hidden="true">'+(done?'✓':index+1)+'</span>'+
            '<span class="first-session-label">'+esc(item.label)+'</span>'+
            '<span class="first-session-status">'+(done?'DONE':current?'NEXT':'OPEN')+'</span></li>';
    }).join("");
}

function updateCost(id,amount){
    const el=document.getElementById(id);if(!el)return;
    el.style.display=amount>0?"inline-flex":"none";
    const value=el.querySelector("span:nth-child(2)");if(value)value.textContent=String(amount||0);
}
export function showBigMessage(title,subtitle,timeout=1800){
    const overlay=document.getElementById("big-message");if(!overlay)return;
    document.getElementById("big-title").innerHTML=title;
    document.getElementById("big-subtitle").innerHTML=subtitle;
    overlay.classList.remove("hidden");
    if(messageTimeout!==null)clearTimeout(messageTimeout);
    if(timeout>0)messageTimeout=setTimeout(()=>overlay.classList.add("hidden"),timeout);
}

const GROUP_SPRITES={
 settlement:"icon-keep",agriculture:"icon-wheat",husbandry:"icon-horse",forestry:"icon-tree",industry:"icon-anvil",
 mining:"icon-pick",craft:"icon-hammer",civic:"icon-townhall",trade:"icon-coins",education:"icon-book",faith:"icon-chalice",
 defense:"icon-shield",military:"icon-sword",nature:"icon-leaf",animals:"icon-stag",people:"icon-bust",court:"icon-crown",
 travel:"icon-compass",magic:"icon-rune",mysteries:"icon-eye",events:"icon-scroll",law:"icon-scales",maritime:"icon-anchor",
 infrastructure:"icon-bridge",medicine:"icon-herb",diplomacy:"icon-dove",culture:"icon-lyre",engineering:"icon-gear",
 fishing:"icon-fish",alchemy:"icon-flask",cuisine:"icon-bowl",textiles:"icon-spool",architecture:"icon-arch",
 finance:"icon-coins",communication:"icon-raven",music:"icon-lyre",warfare:"icon-sword",politics:"icon-scroll",
 monsters:"icon-dragon",seasons:"icon-sun",weather:"icon-weather",underworld:"icon-underworld",
 spirits:"icon-spirit",relics:"icon-relic",botany:"icon-botany",geology:"icon-geology",
 administration:"icon-admin",frontier:"icon-frontier",urbanism:"icon-urban",scholarship:"icon-scholar"
};
export function cardSprite(group){return GROUP_SPRITES[group]||"icon-scroll";}
function tabSignature(){
    if(state.selectedTab===0)return "events:"+state.eventLog.slice(0,40).map(e=>e.id).join(",");
    if(state.selectedTab===1)return ["stats",state.tick,state.entities.length,state.totalRaidsSurvived,state.statistics.totalTrades,
        state.statistics.totalBuildingsBuilt,state.statistics.totalUnitsRecruited,Math.floor(state.morale),
        Math.round(Number(state.politics?.legitimacy)||0),state.buildingLayoutVersion||0,state.buildingInteriorVersion||0,state.buildingCollisionVersion||0,state.nextEntityId||0,
        state.economy?.daysElapsed,state.economy?.foodConsumed,state.economy?.taxesCollected,state.economy?.wagesPaid,state.economy?.upkeepPaid,state.economy?.furnitureUpkeepPaid,
        state.health?.cases,state.health?.recovered,state.health?.outbreakActive,
        JSON.stringify(state.hiddenRealm?.activeThreads||[]),state.hiddenRealm?.completedThreads?.length,
        ...Object.values(state.resources)].join("|");
    return "trade:"+state.tick+":"+JSON.stringify(state.market?.prices||{})+":"+
        (state.market?.partners||[]).map(p=>p.id+":"+JSON.stringify(p.stock)+":"+p.treasury).join("|");
}

function renderEvents(container){
    const rows=state.eventLog.slice(0,40).map(entry=>
        '<div class="event-row" style="--event-color:'+esc(entry.color||"#9c947e")+'">'+
        '<span class="event-tick">'+Number(entry.tick).toLocaleString("en-US")+'</span>'+
        '<span>'+esc(entry.text)+'</span></div>'
    ).join("");
    container.innerHTML=rows?'<div class="event-list">'+rows+'</div>':'<div class="empty-state">Your realm has not recorded an event yet.</div>';
}

function renderStatistics(container){
    renderStatisticsExplorer(container);
}

function renderTrade(container){
    const partners=getTradePartners(),prices=state.market?.prices||{wood:2,stone:3,food:2};
    const chart=MARKET_RESOURCES.map(resource=>{
        const values=state.market?.priceHistory?.[resource]||[prices[resource]];
        const max=Math.max(...values,1),min=Math.min(...values,0);
        const bars=values.map(value=>{
            const height=14+((value-min)/Math.max(0.01,max-min))*34;
            return '<span class="price-bar" style="height:'+height+'px" title="'+Number(value).toFixed(2)+' gold"></span>';
        }).join("");
        return '<div class="price-chart-row"><strong>'+resource.toUpperCase()+'</strong><div class="price-bars">'+bars+'</div><b>'+Number(prices[resource]).toFixed(2)+'</b></div>';
    }).join("");
    const markup=partners.map(partner=>{
        const rows=MARKET_RESOURCES.map(resource=>
            '<div class="trade-resource"><div><strong>'+resource.toUpperCase()+'</strong><small>'+
            Number(prices[resource]||1).toFixed(2)+' GOLD · STOCK '+(partner.stock[resource]||0)+'</small></div>'+
            '<div class="trade-actions"><button data-trade="buy" data-partner="'+partner.id+'" data-resource="'+resource+'" data-quantity="5">BUY 5</button>'+
            '<button data-trade="sell" data-partner="'+partner.id+'" data-resource="'+resource+'" data-quantity="5">SELL 5</button></div></div>'
        ).join("");
        return '<article class="trade-partner"><div class="trade-partner-head"><div><strong>'+esc(partner.name)+'</strong>'+
            '<small>'+esc(partner.region)+' · '+esc(partner.specialty)+'</small></div><span class="trade-treasury">✦ '+partner.treasury+' gold</span></div>'+rows+'</article>';
    }).join("");
    container.innerHTML='<div class="trade-summary"><span>REGIONAL EXCHANGE</span><strong>YOUR GOLD: '+Math.floor(state.resources.gold)+'</strong></div>'+
        '<div class="trade-note">Seasonal prices and regional stock fluctuate. Selling pays 82% of the listed price.</div>'+
        '<div class="price-chart">'+chart+'</div><div class="trade-partners">'+markup+'</div>';
}

function renderTabContent(){
    const container=document.getElementById("tab-content");if(!container)return;
    const signature=tabSignature();if(signature===lastTabSignature)return;
    lastTabSignature=signature;
    if(state.selectedTab===0)renderEvents(container);
    else if(state.selectedTab===1)renderStatistics(container);
    else renderTrade(container);
}

function renderRealmEvent(){
    const modal=document.getElementById("realm-event-modal");if(!modal)return;
    const issue=state.activeEvent;
    if(!issue){modal.classList.add("hidden");lastRenderedIssueId=null;return;}
    if(issue.dismissed){modal.classList.add("hidden");return;}
    if(lastRenderedIssueId===issue.id){modal.classList.remove("hidden");return;}
    lastRenderedIssueId=issue.id;
    const kind=String(issue.family||"realm");
    if(modal.dataset.eventKind!==kind)modal.dataset.eventKind=kind;
    setText("realm-event-kicker","REALM ISSUE · "+kind.toUpperCase()+" · YEAR "+state.year);
    setText("realm-event-title",issue.title);
    setText("realm-event-description",issue.description);
    const participants=Array.isArray(issue.participants)?issue.participants:[];
    const participantBox=document.getElementById("realm-event-participants");
    if(participantBox){
        participantBox.innerHTML=participants.length
            ? '<span>PEOPLE INVOLVED</span>'+participants.map(participant=>'<button type="button" data-event-person="'+esc(participant.personId)+'">'+esc(personName(participant.personId))+' · '+esc(participant.role||"participant")+'</button>').join("")
            : '<span>PEOPLE INVOLVED</span><em>No named participant is recorded for this issue.</em>';
    }
    const choices=document.getElementById("realm-event-choices");
    if(choices)choices.innerHTML=issue.choices.map((choice,index)=>
        '<button type="button" class="event-choice" data-event-choice="'+index+'"><strong>'+esc(choice.label)+'</strong><span>'+esc(choice.description)+'</span></button>'
    ).join("");
    modal.classList.remove("hidden");
}

function renderResourceValues(){
    setText("res-wood",Math.floor(state.resources.wood||0).toLocaleString("en-US"));
    setText("res-stone",Math.floor(state.resources.stone||0).toLocaleString("en-US"));
    setText("res-gold",Math.floor(state.resources.gold||0).toLocaleString("en-US"));
    setText("res-food",Math.floor(state.resources.food||0).toLocaleString("en-US"));
    document.querySelectorAll("[data-resource-value]").forEach(node=>{const key=node.dataset.resourceValue;if(key in state.resources){const next=Math.floor(state.resources[key]||0).toLocaleString("en-US");if(node.textContent!==next)node.textContent=next;}});
}
function renderResourceIncome(){
    setText("wood-income",income(state.incomeThisTick.wood));
    setText("stone-income",income(state.incomeThisTick.stone));
    setText("gold-income",income(state.incomeThisTick.gold));
    setText("food-income",income(state.incomeThisTick.food));
    document.querySelectorAll("[data-resource-income]").forEach(node=>{
        const value=Number(state.incomeThisTick?.[node.dataset.resourceIncome]||0);
        if(node.textContent!==income(value))node.textContent=income(value);
        node.classList.toggle("is-positive",value>0);
        node.classList.toggle("is-negative",value<0);
    });
}
let lastMoraleWidth="";
function renderMoraleHud(){
    const bar=document.getElementById("morale-bar");
    if(bar){
        const width=Math.max(0,Math.min(100,state.morale))+"%";
        if(width!==lastMoraleWidth){lastMoraleWidth=width;bar.style.width=width;}
        bar.classList.toggle("is-low",state.morale<30);
    }
    setText("morale-value",Math.floor(state.morale));
}
function renderWorldLabels(){
    setText("season",SEASONS[state.seasonIndex]||SEASONS[0]);setText("year","YEAR "+state.year);
    const now=performance.now();
    if(now-lastTickTextAt>=1000){lastTickTextAt=now;setText("tick-count",state.tick.toLocaleString("en-US"));}
    setText("kingdom-name","THE REALM OF "+state.kingdomName);
    setText("stage-realm",state.kingdomName||"ELDRIA");setText("minimap-realm",state.kingdomName||"ELDRIA");
    setText("player-name",state.playerName||"GUEST");
}
function renderHousingHud(){
    const housing=getHousingSnapshot();
    document.querySelectorAll("[data-population]").forEach(node=>{const next=String(housing.population);if(node.textContent!==next)node.textContent=next;});
    const pop=document.getElementById("population");if(pop)setHTML(pop,"POP <strong>"+housing.population+"</strong> / "+housing.capacity+" · "+housing.available+" FREE");
    setText("population-capacity",housing.capacity?" / "+housing.capacity:"");
}
function renderCardHud(){
    const card=state.currentCard,cardPanel=document.getElementById("card-container");
    if(card){
        cardPanel?.classList.remove("is-empty");
        const cardArt=document.getElementById("card-icon");
        if(cardArt){
            const sprite=cardSprite(card.group);
            if(sprite!==lastCardSprite){
                lastCardSprite=sprite;
                cardArt.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-card-atlas.svg#'+sprite+'"></use></svg>';
            }
        }
        setText("card-name",card.name);setText("card-desc",card.desc);
        ["wood","stone","gold","food"].forEach(key=>updateCost("card-cost-"+key,card.cost?.[key]||0));
        const affordable=Object.entries(card.cost||{}).every(([key,value])=>(state.resources[key]||0)>=value);
        cardPanel?.classList.toggle("is-unavailable",!affordable);
        if(cardPanel&&cardPanel.getAttribute("aria-label")!=="Drag "+card.name+" onto a valid map tile")cardPanel.setAttribute("aria-label","Drag "+card.name+" onto a valid map tile");
    }else{
        cardPanel?.classList.add("is-empty");
        cardPanel?.classList.remove("is-unavailable");
        if(cardPanel&&cardPanel.getAttribute("aria-label")!=="No card selected yet")cardPanel.setAttribute("aria-label","No card selected yet");
        lastCardSprite="";
        setText("card-icon","—");setText("card-name","NO CARD SELECTED");setText("card-desc","Open the Cards tab to draw a card when you want one.");
        ["wood","stone","gold","food"].forEach(key=>updateCost("card-cost-"+key,0));
    }
}
function renderViewHud(){
    const labels=["","LANDSCAPE","DISTRICTS","ROOFTOPS","INTERIORS"];
    setText("zoom-level-name",labels[state.zoomLevel]||"ROOFTOPS");setText("zoom-value","×"+(state.zoom/(Number(state.renderScale)||1)).toFixed(2));
    const layerSelect=document.getElementById("map-layer-select");
    if(layerSelect&&layerSelect.value!==state.mapLayer)layerSelect.value=state.mapLayer||"terrain";
    renderMapLayerLegend();
    document.querySelectorAll(".zoom-preset").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.zoomLevel)===state.zoomLevel));
    document.querySelectorAll(".speed-button").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.speed)===state.gameSpeed));
    document.getElementById("pause-btn")?.classList.toggle("is-paused",state.isPaused);
    setText("pause-text",state.isPaused?"RESUME":"PAUSE");
}
function renderDynamicPanels(){
    renderTabContent();
    renderRealmEvent();
}
const UI_HUD_CHUNKS=Object.freeze([renderResourceValues,renderResourceIncome,renderMoraleHud,renderWorldLabels,renderTopStatus,renderHousingHud,renderCardHud,renderRoomBonuses,renderAmbition,renderFirstSession,renderViewHud,renderDynamicPanels]);
let uiHudFrame=0,uiHudIndex=0,uiHudPending=false;
function runHudRefresh(){
    uiHudFrame=0;
    const chunk=UI_HUD_CHUNKS[uiHudIndex++];
    try{chunk();}catch(error){console.error(error);}
    if(uiHudIndex<UI_HUD_CHUNKS.length){uiHudFrame=requestAnimationFrame(runHudRefresh);return;}
    if(uiHudPending){uiHudPending=false;uiHudIndex=0;uiHudFrame=requestAnimationFrame(runHudRefresh);}
}
export function renderUI(){
    if(!state.hasStarted)return;
    if(uiHudFrame){uiHudPending=true;return;}
    uiHudIndex=0;
    uiHudFrame=requestAnimationFrame(runHudRefresh);
}
const MAP_LAYER_LEGENDS=Object.freeze({
    resources:{
        label:"RESOURCE SURVEY",
        items:[["map-swatch--forest","Forest stock"],["map-swatch--stone","Stone stock"],["map-swatch--fertile","Fertile land"]],
        note:"Sampled from explored map tiles. Squares show relative forest stock, diamonds show stone, and gold points mark fertile land."
    },
    fertility:{
        label:"FERTILITY SURVEY",
        items:[["map-swatch--low","Low"],["map-swatch--mid","Moderate"],["map-swatch--high","High"]],
        note:"Shading reads the generated fertility value of each explored map tile. It is not a crop forecast."
    },
    roads:{
        label:"ROAD NETWORK",
        items:[["map-swatch--dirt","Dirt road"],["map-swatch--gravel","Gravel road"],["map-swatch--stone-road","Stone road"]],
        note:"Highlights every explored road tile in the real road network. The same routes are used by resident pathfinding."
    },
    services:{
        label:"SERVICE COVERAGE",
        items:[["map-swatch--water","Water"],["map-swatch--social","Social life"],["map-swatch--safety","Safety"],["map-swatch--health","Health"]],
        note:"Circles are drawn from operating service buildings only. A building under construction, without staff or without supplies covers no households."
    },
    logistics:{
        label:"LOGISTICS ROUTES",
        items:[["map-swatch--carrier","Carrier"],["map-swatch--warehouse","Warehouse"],["map-swatch--job","Delivery job"]],
        note:"Routes are drawn from the current delivery jobs. Dashed segments are blocked or waiting; moving carriers show the goods they actually haul."
    },
    fields:{
        label:"FIELD SEASONS",
        items:[["map-swatch--fallow","Fallow"],["map-swatch--sown","Sown"],["map-swatch--growing","Growing"],["map-swatch--ripe","Ripe"]],
        note:"Field colours read the persisted field stage. Harvest depends on the current season and farm labour."
    }
});
let lastMapLayerLegend="";
function renderMapLayerLegend(){
    const legend=document.getElementById("map-layer-legend");
    if(!legend)return;
    if(lastMapLayerLegend===state.mapLayer)return;
    lastMapLayerLegend=state.mapLayer;
    const data=MAP_LAYER_LEGENDS[state.mapLayer];
    if(!data){legend.classList.add("hidden");legend.innerHTML="";return;}
    legend.classList.remove("hidden");
    legend.innerHTML='<strong>'+esc(data.label)+'</strong>'+data.items.map(([swatch,label])=>'<span class="map-legend-item"><i class="map-swatch '+swatch+'"></i>'+esc(label)+'</span>').join("")+'<small>'+esc(data.note)+'</small>';
}
export function setupMapViewControls(){
    const select=document.getElementById("map-layer-select");
    if(!select)return;
    if(!select.value)select.value=state.mapLayer||"terrain";
    state.mapLayer=select.value;
    select.addEventListener("change",()=>{
        state.mapLayer=select.value||"terrain";
        renderMapLayerLegend();
    });
    renderMapLayerLegend();
}
