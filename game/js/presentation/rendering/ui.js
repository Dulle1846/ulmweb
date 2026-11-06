// UI presentation: player hand, realm events, trade market and statistics.
import { SEASONS } from "../../core/config.js";
import { TYPE } from "../../core/types.js";
import { state } from "../../core/state.js";
import { getTradePartners,MARKET_RESOURCES } from "../../systems/market.js";
import { getWorkforceSnapshot } from "../../systems/economy.js";
import { EVENT_CHAINS } from "../../systems/event-chains.js";
import { getHousingSnapshot,getHouseholdSnapshot } from "../../systems/population.js";
import { getPoliticalSnapshot } from "../../systems/politics.js";
import { getHealthSnapshot } from "../../systems/health.js";
import { getRoomBonusSnapshot, roomBonusSignature, ROOM_BONUS_CAPS } from "../../systems/rooms.js";

let messageTimeout=null,lastTabSignature="",lastHandSignature="",lastRoomBonusSignature="",lastRenderedIssueId=null;
function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value;}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function income(v){
    const value=Number(v);
    if(!Number.isFinite(value)||value===0)return "";
    const rounded=Math.round(value*10)/10;
    return (rounded>0?"+":"")+rounded.toLocaleString("en-US",{maximumFractionDigits:1});
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
const HAND_SLOTS=5,SLOT_NUMERALS=["I","II","III","IV","V"];
function handCardMarkup(card){
 const sprite=GROUP_SPRITES[card.group]||"icon-scroll";
 return '<button type="button" class="hand-card rarity-'+esc(card.rarity||"common")+(card.instanceId===state.selectedCardInstanceId?" is-selected":"")+'" data-card-group="'+esc(card.group||"general")+'" data-card-id="'+esc(card.instanceId)+'" title="'+esc(card.desc||card.name)+'" aria-label="Select '+esc(card.name)+': '+esc(card.desc||"")+'">'+
  '<span class="hand-card-banner"><svg class="hand-card-sprite" aria-hidden="true"><use href="assets/royal-card-atlas.svg#'+sprite+'"></use></svg></span>'+
  '<span class="hand-card-name">'+esc(card.name)+'</span><span class="hand-card-category">'+esc(card.categoryName||card.group||card.kind||"CARD")+'</span>'+
  '<span class="hand-card-rarity">'+esc(card.rarity||"common")+'</span></button>';
}
function emptySlotMarkup(index){
 return '<span class="hand-slot" data-hand-slot="'+(index+1)+'" aria-hidden="true"><span class="hand-slot-numeral">'+SLOT_NUMERALS[index]+'</span><span class="hand-slot-label">EMPTY</span></span>';
}
function renderHand(){
 const container=document.getElementById("card-hand");if(!container)return;
 const signature=state.hand.map(c=>c.instanceId+":"+c.name+":"+c.rarity).join("|")+":"+state.selectedCardInstanceId+":"+HAND_SLOTS;
 if(signature===lastHandSignature)return;
 lastHandSignature=signature;
 const slots=[];
 for(let index=0;index<HAND_SLOTS;index++){
  const card=state.hand[index];
  slots.push(card?handCardMarkup(card):emptySlotMarkup(index));
 }
 container.innerHTML=slots.join("");
 container.dataset.slotCount=String(HAND_SLOTS);
 container.dataset.handCount=String(state.hand.length);
 document.getElementById("hand-dock")?.classList.toggle("is-empty",state.hand.length===0);
 setText("hand-count",state.hand.length+" / "+HAND_SLOTS);
}

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
    const buildings=state.entities.filter(e=>!e.dead&&e.isBuilding()).length;
    const military=state.entities.filter(e=>!e.dead&&[TYPE.GUARD,TYPE.KNIGHT,TYPE.ARCHER].includes(e.type)).length;
    const workforce=getWorkforceSnapshot(),housing=getHousingSnapshot(),households=getHouseholdSnapshot(),economy=state.economy||{},politics=getPoliticalSnapshot(),health=getHealthSnapshot();
    const roomSnapshot=getRoomBonusSnapshot();
    const stats=[
        ["POPULATION",workforce.population],["EMPLOYED",workforce.employed],
        ["UNEMPLOYED",workforce.unemployed],["HOUSING",housing.population+" / "+housing.capacity],
        ["NATURAL GROWTH",Math.max(0,Number(economy.populationGrowth)||0)],
        ["HOUSEHOLDS",households.households],["UNHOUSED",households.unhoused],
        ["VACANT HOMES",housing.available],["BUILDINGS",buildings],
        ["MILITARY",military],["SICK RESIDENTS",health.sick],["HEALTH STATUS",health.active?"OUTBREAK · "+health.severity:"STABLE"],["RECOVERED",health.recovered],["MORALE",Math.floor(state.morale)],
        ["RAIDS SURVIVED",state.totalRaidsSurvived],["TRADES",state.statistics.totalTrades],
        ["BUILDINGS BUILT",state.statistics.totalBuildingsBuilt],["UNITS RECRUITED",state.statistics.totalUnitsRecruited],
        ["ISSUES RESOLVED",state.statistics.totalEventsResolved]
    ];
    const cells=stats.map(([label,value])=>'<div class="stat-cell"><div class="stat-label">'+label+'</div><div class="stat-value">'+esc(value)+'</div></div>').join("");
    const resources=["wood","stone","gold","food"].map(key=>
        '<div class="stat-cell"><div class="stat-label">'+key.toUpperCase()+'</div><div class="stat-value">'+Math.floor(state.resources[key]||0).toLocaleString("en-US")+'</div></div>'
    ).join("");
    const ledger=economy.lastLedger||{},production=economy.productionChains||{};
    const economyCells=[
        ["DAYS SIMULATED",economy.daysElapsed||0],
        ["FOOD CONSUMED",Number(ledger.foodConsumed||0).toFixed(1)],
        ["TAXES COLLECTED",Number(ledger.taxesCollected||0).toFixed(2)+" gold"],
        ["WAGES PAID",Number(ledger.wagesPaid||0).toFixed(2)+" gold"],
        ["BUILDING UPKEEP",Number(ledger.upkeepPaid||0).toFixed(2)+" gold"],
        ["FURNITURE UPKEEP",Number(ledger.furnitureUpkeepPaid||0).toFixed(2)+" gold"],
        ["UNPAID COSTS",(Number(ledger.unpaidWages||0)+Number(ledger.unpaidUpkeep||0)+Number(ledger.unpaidFurniture||0)).toFixed(2)+" gold"],
        ["MILL TIMBER USED",Number(production.millWoodConsumed||0).toFixed(1)+" wood"],
        ["MILL BONUS FOOD",Number(production.millBonusFood||0).toFixed(1)+" food"],
        ["TAVERN PROVISIONS",Number(production.tavernFoodConsumed||0).toFixed(1)+" food"],
        ["TAVERN GOLD EARNED",Number(production.tavernGoldProduced||0).toFixed(1)+" gold"]
    ].map(([label,value])=>'<div class="stat-cell"><div class="stat-label">'+label+'</div><div class="stat-value">'+esc(value)+'</div></div>').join("");
    const politicalRows=[["ROYAL LEGITIMACY",politics.legitimacy],["COMMONERS",politics.factions.commons],["NOBILITY",politics.factions.nobility],["GUILDS",politics.factions.guilds],["CLERGY",politics.factions.clergy]];
    const politicalMarkup='<div class="stat-heading" style="margin-top:14px">THE ROYAL COUNCIL</div><div class="stat-grid">'+politicalRows.map(([label,value])=>'<div class="stat-cell political-stat"><div class="stat-label">'+label+'</div><div class="stat-value">'+Number(value).toFixed(0)+'%</div><div class="faction-meter"><i style="width:'+Math.max(0,Math.min(100,Number(value)))+'%"></i></div></div>').join("")+'</div>';
    const roomCells=roomSnapshot.roles.filter(role=>role.roomCount>0).map(role=>{
        const effects=Object.entries(role.effects)
            .filter(([,value])=>value>0.0001)
            .map(([key,value])=>key==="defense"
                ?Math.round(value*100)+"% defense"
                :key==="growth"
                    ?roomEffectValue(value)+" growth"
                    :roomEffectValue(value)+" "+key);
        return '<div class="stat-cell room-bonus-stat-cell"><div class="stat-label">'+role.icon+' '+role.label+' · '+role.roomCount+' ROOM'+(role.roomCount===1?'':'S')+'</div><div class="stat-value">'+esc(effects.join(' · ')||'—')+'</div></div>';
    }).join('');
    const roomSealed=roomSnapshot.sealed
        ?'<div class="stat-cell room-bonus-stat-cell"><div class="stat-label">SEALED ROOMS</div><div class="stat-value" style="color:#b23b2e">'+roomSnapshot.sealed+' · NO BONUS</div></div>'
        :'';
    const roomCapNote='<div class="room-bonus-cap-note">Role values include furnishings and are contributions before realm caps: '+ROOM_BONUS_CAPS.gold+' gold · '+ROOM_BONUS_CAPS.legitimacy+' legitimacy · '+ROOM_BONUS_CAPS.morale+' morale per 20 days; growth '+ROOM_BONUS_CAPS.growth+', defense '+Math.round(ROOM_BONUS_CAPS.defense*100)+'%. Furnishings add their own bounded bonus on top and cost upkeep every settlement. Growth lowers the yearly morale threshold; defense is passive.</div>';
    const roomMarkup='<div class="stat-heading" style="margin-top:14px">ROOM BONUSES · EVERY 20 DAYS</div><div class="stat-grid">'+
        (roomCells||'<div class="empty-state">No reachable rooms yet. Add doors and interior rooms.</div>')+roomSealed+roomCapNote+'</div>';
    const activeThreads=state.hiddenRealm?.activeThreads||[];
    const chronicles=activeThreads.length?activeThreads.map(thread=>{
        const stages=EVENT_CHAINS[thread.id]||[],stage=stages[thread.stage];
        return '<div class="stat-cell"><div class="stat-label">'+esc(thread.id.toUpperCase())+' · '+(thread.stage+1)+' / '+stages.length+'</div><div class="stat-value">'+esc(stage?.title||"Unrecorded chronicle")+'</div></div>';
    }).join(""):'<div class="empty-state">No long-running stories are unfolding. The realm is quiet — for now.</div>';
    container.innerHTML='<div class="stat-heading">KINGDOM OVERVIEW</div><div class="stat-grid">'+cells+'</div>'+
        '<div class="stat-heading" style="margin-top:14px">ROYAL STORES</div><div class="stat-grid">'+resources+'</div>'+
        roomMarkup+
        '<div class="stat-heading" style="margin-top:14px">THE ROYAL LEDGER</div><div class="stat-grid">'+economyCells+'</div>'+
        politicalMarkup+'<div class="stat-heading" style="margin-top:14px">THE CHRONICLES</div><div class="stat-grid">'+chronicles+'</div>';
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
    setText("realm-event-kicker","REALM ISSUE · YEAR "+state.year);
    setText("realm-event-title",issue.title);
    setText("realm-event-description",issue.description);
    const choices=document.getElementById("realm-event-choices");
    if(choices)choices.innerHTML=issue.choices.map((choice,index)=>
        '<button type="button" class="event-choice" data-event-choice="'+index+'"><strong>'+esc(choice.label)+'</strong><span>'+esc(choice.description)+'</span></button>'
    ).join("");
    modal.classList.remove("hidden");
}

export function renderUI(){
    if(!state.hasStarted)return;
    setText("res-wood",Math.floor(state.resources.wood||0).toLocaleString("en-US"));
    setText("res-stone",Math.floor(state.resources.stone||0).toLocaleString("en-US"));
    setText("res-gold",Math.floor(state.resources.gold||0).toLocaleString("en-US"));
    setText("res-food",Math.floor(state.resources.food||0).toLocaleString("en-US"));
    setText("wood-income",income(state.incomeThisTick.wood));
    setText("stone-income",income(state.incomeThisTick.stone));
    setText("gold-income",income(state.incomeThisTick.gold));
    setText("food-income",income(state.incomeThisTick.food));
    document.querySelectorAll("[data-resource-value]").forEach(node=>{const key=node.dataset.resourceValue;if(key in state.resources)node.textContent=Math.floor(state.resources[key]||0).toLocaleString("en-US");});
    document.querySelectorAll("[data-resource-income]").forEach(node=>{
        const value=Number(state.incomeThisTick?.[node.dataset.resourceIncome]||0);
        node.textContent=income(value);
        node.classList.toggle("is-positive",value>0);
        node.classList.toggle("is-negative",value<0);
    });
    const bar=document.getElementById("morale-bar");
    if(bar){bar.style.width=Math.max(0,Math.min(100,state.morale))+"%";bar.classList.toggle("is-low",state.morale<30);}
    setText("morale-value",Math.floor(state.morale));
    renderRoomBonuses();
    setText("season",SEASONS[state.seasonIndex]||SEASONS[0]);setText("year","YEAR "+state.year);
    setText("tick-count",state.tick.toLocaleString("en-US"));setText("kingdom-name","THE REALM OF "+state.kingdomName);
    setText("player-name",state.playerName||"GUEST");
    const housing=getHousingSnapshot();
    document.querySelectorAll("[data-population]").forEach(node=>{node.textContent=String(housing.population);});
    const pop=document.getElementById("population");if(pop)pop.innerHTML="POP <strong>"+housing.population+"</strong> / "+housing.capacity+" · "+housing.available+" FREE";
    setText("population-capacity",housing.capacity?" / "+housing.capacity:"");
    const card=state.currentCard,cardPanel=document.getElementById("card-container");
    if(card){
        cardPanel?.classList.remove("is-empty");
        const cardArt=document.getElementById("card-icon");
        if(cardArt){
            const sprite=GROUP_SPRITES[card.group]||"icon-scroll";
            cardArt.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-card-atlas.svg#'+sprite+'"></use></svg>';
        }
        setText("card-name",card.name);setText("card-desc",card.desc);
        ["wood","stone","gold","food"].forEach(key=>updateCost("card-cost-"+key,card.cost?.[key]||0));
        const affordable=Object.entries(card.cost||{}).every(([key,value])=>(state.resources[key]||0)>=value);
        cardPanel?.classList.toggle("is-unavailable",!affordable);
        cardPanel?.setAttribute("aria-label","Drag "+card.name+" onto a valid map tile");
    }else{
        cardPanel?.classList.add("is-empty");
        cardPanel?.classList.remove("is-unavailable");
        cardPanel?.setAttribute("aria-label","No card selected yet");
        setText("card-icon","—");setText("card-name","NO CARD SELECTED");setText("card-desc","The hand fills as the realm advances.");
        ["wood","stone","gold","food"].forEach(key=>updateCost("card-cost-"+key,0));
    }
    const labels=["","LANDSCAPE","DISTRICTS","ROOFTOPS","INTERIORS"];
    setText("zoom-level-name",labels[state.zoomLevel]||"ROOFTOPS");setText("zoom-value","×"+state.zoom.toFixed(2));
    document.querySelectorAll(".zoom-preset").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.zoomLevel)===state.zoomLevel));
    document.querySelectorAll(".speed-button").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.speed)===state.gameSpeed));
    document.getElementById("pause-btn")?.classList.toggle("is-paused",state.isPaused);
    setText("pause-text",state.isPaused?"RESUME":"PAUSE");
    renderHand();renderTabContent();renderRealmEvent();
}
