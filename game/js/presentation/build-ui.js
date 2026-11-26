// Construction panel: roads and every direct building category share one
// honest placement flow. Selecting a building creates a real construction
// site; its first material share is charged only when the site is placed.
import { state } from "../core/state.js";
import { ROAD_TYPES,getRoadCount,setRoadBuildMode,clearRoadBuildMode,getRoadBuildMode,getRoadConditionSnapshot,repairWornRoads } from "../systems/roads.js";
import { BUILD_MENU, BUILDING_LABELS, HOUSING_TIERS, RECIPES, SERVICE_DEFINITIONS, CONSTRUCTION_SHARE, costShare, isHousingType } from "../systems/city-config.js";
import { getBuildingCost } from "../systems/construction.js";
import { getCitySummary, getLogisticsSnapshot } from "../systems/logistics.js";
import { getSettlementSnapshot } from "../systems/settlement.js";

let activeCategory="roads";
let recommendedBuild=null;
function recommendMarkup(recommended){
    return recommended?'<em class="build-option-recommend">NEXT MOVE</em>':'';
}
function esc(value){
    return String(value).replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}
function formatHeld(held){
    const cost=formatCost(held);
    return cost==="No material cost"?"empty stores":cost;
}
function ownerRowMarkup(row){
    const short=!row.affordable;
    const lastRepair=row.lastRepair?'<small>Last fixed year '+row.lastRepair.year+' · '+row.lastRepair.tiles+' tile'+(row.lastRepair.tiles===1?'':'s')+'</small>':'';
    return '<div class="road-owner'+(short?' is-short':'')+'" data-road-owner="'+esc(row.id)+'">'+
        '<div class="road-owner-head"><strong>'+esc(row.name)+'</strong><span>'+row.worn+' WORN</span></div>'+
        '<div class="road-owner-bill"><small>Needs '+formatCost(row.cost)+'</small><small>Holds '+formatHeld(row.held)+'</small>'+
        '<b>'+(short?'SHORT '+formatCost(row.shortfall):'COVERED')+'</b></div>'+
        lastRepair+
    '</div>';
}
function roadConditionMarkup(){
    const condition=getRoadConditionSnapshot();
    if(!condition.tiles){
        return '<section class="road-condition is-empty" aria-label="Road condition">'+
            '<div class="road-condition-head"><span>ROAD CONDITION</span><strong>NO ROADS</strong><em>UNSURVEYED</em></div>'+
            '<p class="road-condition-reason">No road network yet. Lay a dirt path; the next annual survey will measure wear.</p>'+
        '</section>';
    }
    const status=condition.average>=95?"SOUND":condition.average>=80?"WORN":"BADLY WORN";
    const kind=status==="SOUND"?"is-sound":status==="WORN"?"is-worn":"is-bad";
    const last=condition.lastWear;
    const survey=last
        ? "Year "+last.year+" survey: "+last.carriers+" active carrier"+(last.carriers===1?"":"s")+" on "+esc(last.climate)+" roads "+(last.changed?"wore "+last.changed+" tile"+(last.changed===1?"":"s")+" by "+last.loss+" condition points":"recorded no measurable wear")+"."
        : "No annual survey has run yet; roads begin at 100%.";
    const types=Object.values(ROAD_TYPES).filter(road=>condition.byType[road.id]).map(road=>'<span>'+esc(road.label.toUpperCase())+' <b>'+condition.byType[road.id].average.toFixed(1)+'%</b></span>').join("");
    const lastRepair=condition.lastRepair?'<p class="road-condition-last">Last repair: year '+condition.lastRepair.year+' · '+condition.lastRepair.tiles+' tile'+(condition.lastRepair.tiles===1?'':'s')+' · '+formatCost(condition.lastRepair.cost)+'</p>':'';
    const ownerRows=[...condition.settlements, ...(condition.wilderness?[condition.wilderness]:[])];
    const ownerBlock=ownerRows.length
        ? '<div class="road-owners" aria-label="Maintenance by owner"><div class="road-owners-title"><span>MAINTENANCE BY OWNER</span><small>'+condition.obligation.tiles+' WORN · '+formatCost(condition.obligation.owed)+' OWED</small></div>'+ownerRows.map(ownerRowMarkup).join("")+'</div>'
        : '<p class="road-owners-none">Every owner is square; no settlement owes road repairs this year.</p>';
    const affordableTiles=condition.affordableTiles;
    const canRepair=condition.worn>0&&affordableTiles>0;
    const button=condition.worn===0?"ALL ROADS SOUND":affordableTiles===0?"STORES SHORT":affordableTiles>=condition.worn?"REPAIR "+condition.worn+" WORN TILE"+(condition.worn===1?"":"S"):"REPAIR AFFORDABLE ("+affordableTiles+")";
    const actionNote=condition.worn===0?"No repair needed.":"Owed "+formatCost(condition.obligation.owed)+(condition.obligation.shortSeats.length?" · "+condition.obligation.shortSeats.length+" OWNER SHORT":" · ALL OWNERS COVERED");
    return '<section class="road-condition '+kind+'" aria-label="Road condition">'+
        '<div class="road-condition-head"><span>ROAD CONDITION</span><strong>'+condition.average.toFixed(1)+'%</strong><em>'+status+'</em></div>'+
        '<div class="road-condition-meter" role="meter" aria-label="Average road condition" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+condition.average+'"><i style="width:'+condition.average+'%"></i></div>'+
        '<p class="road-condition-reason"><b>'+survey+'</b> Dirt paths wear fastest. Worn roads slow every carrier and raise emergency upkeep; repair restores full speed.</p>'+
        '<div class="road-condition-types">'+types+'<span>WORST <b>'+condition.worst.toFixed(1)+'%</b></span></div>'+
        ownerBlock+
        lastRepair+
        '<div class="road-condition-action"><small>'+actionNote+'</small><button type="button" data-repair-roads'+(canRepair?'':' disabled')+'>'+button+'</button></div>'+
    '</section>';
}

const ROAD_SYMBOLS={dirt:"dirt-road",gravel:"gravel-road",paved:"paved-road"};
const BUILDING_SYMBOLS={
    1:"keep",2:"cottage",3:"farm",4:"lumber-yard",5:"quarry",6:"watchtower",7:"wall",
    8:"tavern",9:"temple",10:"barracks",11:"windmill",12:"stable",13:"wonder",14:"goldmine",
    15:"storehouse",60:"cottage",61:"cottage",62:"storehouse",63:"lumber-yard",64:"windmill",
    65:"windmill",66:"quarry",67:"lumber-yard",68:"temple",69:"tavern",
    70:"temple",71:"keep",72:"storehouse",
    73:"keep",74:"temple",75:"temple",76:"tavern",77:"keep",78:"watchtower",
    79:"windmill",80:"temple",89:"lumber-yard",90:"lumber-yard",91:"windmill"
};
function formatCost(cost){
    return Object.entries(cost||{}).filter(([,amount])=>amount>0).map(([resource,amount])=>amount+" "+resource).join(" · ")||"No material cost";
}
function affordable(cost){
    return Object.entries(cost||{}).every(([resource,amount])=>(Number(state.resources?.[resource])||0)>=Number(amount));
}
function setStatus(text,kind=""){
    const status=document.getElementById("placement-status");
    if(!status)return;
    status.textContent=text;
    if(kind)status.dataset.buildKind=kind; else delete status.dataset.buildKind;
}
function showCancel(show){
    document.getElementById("road-build-cancel")?.classList.toggle("hidden",!show);
}
function closeModal(){document.getElementById("build-modal")?.classList.add("hidden");}
function buildingDetail(type){
    if(isHousingType(type))return HOUSING_TIERS[type].capacity+" residents · comfort "+Math.round(HOUSING_TIERS[type].comfort*100)+"% · warmth "+Math.round(HOUSING_TIERS[type].warmth*100)+"%";
    if(type===89)return "2 workers · 17 regional industries · resin, cork, tannin, charcoal, furniture, paper, silk and more · must stand near a working forest";
    if(type===90)return "3 workers · consumes ship timber, pitch, tar, charcoal and potash · launches hulls for the crown fleet and sea-lane trade";
    if(type===91)return "3 workers · consumes paper, potash and charcoal · feeds the research reserve and the chancery";
    const recipe=RECIPES[type];
    if(recipe){
        const input=recipe.input?Object.entries(recipe.input).map(([good,amount])=>amount+" "+good).join(" + ")+" → ":"";
        if(recipe.unique)return recipe.workers+" worker · "+input+"unique player-made item · needs imported stock and gold";
        const output=Object.entries(recipe.output||{}).map(([good,amount])=>amount+" "+good).join(" + ")||"forest planting";
        return recipe.workers+" workers · "+input+output;
    }
    const services=Object.entries(SERVICE_DEFINITIONS).filter(([,definition])=>definition.types.includes(type)).map(([,definition])=>definition.label);
    if(services.length)return "Service: "+services.join(" / ")+" · needs staff and supplies";
    if(type===62)return "Physical storage for hauled goods · carriers reserve and deliver from here";
    return "Direct construction · real materials and builder labour";
}
function renderBuildOptions(){
    const container=document.getElementById("build-options");
    if(!container)return;
    document.querySelectorAll("[data-build-category]").forEach(button=>{
        const active=button.dataset.buildCategory===activeCategory;
        button.classList.toggle("is-active",active);
        button.setAttribute("aria-pressed",String(active));
    });
    if(activeCategory==="roads"){
        container.innerHTML=roadConditionMarkup()+Object.values(ROAD_TYPES).map(road=>{
            const recommended=recommendedBuild?.category==="roads"&&recommendedBuild?.type===road.id;
            return '<button class="build-option'+(recommended?' is-recommended':'')+'" type="button" data-road-type="'+road.id+'">'+
                '<span class="build-option-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/city-builder-sprites.svg#'+ROAD_SYMBOLS[road.id]+'"></use></svg></span>'+
                '<span class="build-option-copy">'+recommendMarkup(recommended)+'<strong>'+road.label+'</strong><small>'+road.speed.toFixed(2)+'× when new</small><small>Cost: '+formatCost(road.cost)+'</small><small>Base upkeep '+road.upkeep.toFixed(4)+' gold/day</small></span>'+
            '</button>';
        }).join("")+
            '<button class="build-option bulldoze-option" type="button" data-road-remove="true">'+
                '<span class="build-option-art" aria-hidden="true">🛠️</span>'+
                '<span class="build-option-copy"><strong>Bulldoze road</strong><small>Remove a road tile and recover 25% of its materials</small><small>No demolition cost</small></span>'+
            '</button>';
        container.querySelectorAll("[data-road-type]").forEach(button=>{
            button.addEventListener("click",()=>startRoad(button.dataset.roadType));
        });
        container.querySelector("[data-road-remove]")?.addEventListener("click",()=>startRoad("remove"));
        container.querySelector("[data-repair-roads]")?.addEventListener("click",()=>{
            const result=repairWornRoads();
            if(result.ok){
                const owners=result.groups.map(group=>group.name+" "+formatCost(group.cost)).join(" · ");
                const short=result.shortfalls.length?" · "+result.shortfalls.length+" OWNER"+(result.shortfalls.length===1?"":"S")+" SHORT":"";
                setStatus("REPAIRED "+result.repaired+" ROAD TILE"+(result.repaired===1?"":"S")+" · "+owners+short);
            }else setStatus(String(result.reason).toUpperCase(),"error");
            renderBuildOptions();
        });
    }else{
        const category=BUILD_MENU.find(entry=>entry.id===activeCategory);
        const types=category?.types||[];
        container.innerHTML=types.map(type=>{
            const cost=getBuildingCost(type);
            const canPay=affordable(costShare(cost,CONSTRUCTION_SHARE));
            const name=BUILDING_LABELS[type]||("Building "+type);
            const recommended=recommendedBuild?.category===activeCategory&&Number(recommendedBuild?.type)===Number(type);
            return '<button class="build-option building-build-option'+(recommended?' is-recommended':'')+'" type="button" data-build-type="'+type+'"'+(canPay?'':' aria-disabled="true"')+'>'+
                '<span class="build-option-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-building-atlas.svg#'+(BUILDING_SYMBOLS[type]||"cottage")+'"></use></svg></span>'+
                '<span class="build-option-copy">'+recommendMarkup(recommended)+'<strong>'+name+'</strong><small>'+buildingDetail(type)+'</small><small>Cost: '+formatCost(cost)+'</small><small>Starts a site · first 25% charged now · rest delivered by carriers</small></span>'+
            '</button>';
        }).join("");
        container.querySelectorAll("[data-build-type]").forEach(button=>{
            button.addEventListener("click",()=>startBuilding(Number(button.dataset.buildType)));
        });
    }
    const count=document.getElementById("road-count");
    if(count)count.textContent=String(getRoadCount());
    const selectedRoad=getRoadBuildMode();
    container.querySelectorAll("[data-road-type]").forEach(button=>button.classList.toggle("is-selected",Number(state.directBuildType)==null&&button.dataset.roadType===selectedRoad));
    container.querySelector("[data-road-remove]")?.classList.toggle("is-selected",Number(state.directBuildType)==null&&selectedRoad==="remove");
    container.querySelectorAll("[data-build-type]").forEach(button=>button.classList.toggle("is-selected",Number(button.dataset.buildType)===Number(state.directBuildType)));
    renderBuildSummary();
}
function renderBuildSummary(){
    const summary=getCitySummary(),logistics=getLogisticsSnapshot(),settlement=getSettlementSnapshot();
    const set=(id,value)=>{const element=document.getElementById(id);if(element)element.textContent=String(value);};
    set("city-site-count",summary.construction);
    set("city-carrier-count",summary.carriers);
    set("city-job-count",summary.activeJobs);
    set("city-water-need",settlement.needs?Math.round(settlement.needs.water*100)+"%":"—");
    const warehouse=summary.warehouses?.rows?.[0];
    set("city-warehouse-count",summary.warehouses?.rows?.length||0);
    const stock=document.getElementById("city-warehouse-stock");
    if(stock)stock.textContent=warehouse?summary.warehouses.used+" / "+summary.warehouses.capacity+" storage used · "+summary.warehouses.reservedIn+" reserved in · "+summary.warehouses.reservedOut+" reserved out":"No supplied warehouse";
    const blocked=logistics.jobs.filter(job=>job.status==="blocked"||job.reason).length;
    const fleet=document.getElementById("city-logistics-note");
    const rejected=logistics.lastRejection?" · last order rejected: "+logistics.lastRejection.reason:"";
    if(fleet)fleet.textContent=(blocked?blocked+" delivery job"+(blocked===1?"":"s")+" blocked · inspect the building register":summary.activeJobs+" active delivery job"+(summary.activeJobs===1?"":"s")+" · "+summary.carriers+" carrier"+(summary.carriers===1?"":"s"))+rejected;
}
function startRoad(type){
    if(!setRoadBuildMode(type))return;
    state.directBuildType=null;
    closeModal();showCancel(true);
    const status=document.getElementById("placement-status");
    if(status){
        status.dataset.roadMode=type;
        status.textContent=type==="remove"?"BULLDOZE SELECTED · CLICK OR DRAG OVER ROADS · ESC TO CANCEL":ROAD_TYPES[type].label.toUpperCase()+" SELECTED · CLICK OR DRAG ON THE MAP · ESC TO CANCEL";
    }
    renderBuildOptions();
}
function startBuilding(type){
    const cost=getBuildingCost(type);
    if(!affordable(costShare(cost,CONSTRUCTION_SHARE))){
        setStatus("CANNOT AFFORD "+BUILDING_LABELS[type].toUpperCase()+" · NEED "+formatCost(cost),"error");
        return;
    }
    state.directBuildType=type;
    clearRoadBuildMode();
    closeModal();showCancel(true);
    const status=document.getElementById("placement-status");
    if(status){
        delete status.dataset.roadMode;
        status.dataset.buildKind="direct";
        status.textContent="PLACE "+BUILDING_LABELS[type].toUpperCase()+" · CLICK A DRY SITE · FULL COST "+formatCost(cost)+" · ESC TO CANCEL";
    }
    renderBuildOptions();
}
export function cancelBuildPlacement(message="BUILD MODE CANCELLED"){
    const active=Boolean(getRoadBuildMode()||state.directBuildType);
    state.directBuildType=null;
    clearRoadBuildMode();
    showCancel(false);
    setStatus(message);
    renderBuildOptions();
    return active;
}
export function openBuildPanel(category,type=null){
    const modal=document.getElementById("build-modal");
    if(!modal)return;
    if(category&&BUILD_MENU.some(entry=>entry.id===category))activeCategory=category;
    recommendedBuild=category&&type!=null?{category,type}:null;
    renderBuildOptions();
    modal.classList.remove("hidden");
}
export function setupBuildUI(){
    const modal=document.getElementById("build-modal");
    const open=document.getElementById("build-open-btn");
    if(!modal||!open||modal.dataset.initialized==="true")return;
    modal.dataset.initialized="true";
    open.addEventListener("click",()=>{recommendedBuild=null;renderBuildOptions();modal.classList.remove("hidden");});
    document.getElementById("build-close-btn")?.addEventListener("click",closeModal);
    modal.addEventListener("click",event=>{if(event.target===modal)closeModal();});
    modal.addEventListener("click",event=>{
        const category=event.target.closest("[data-build-category]");
        if(!category)return;
        activeCategory=category.dataset.buildCategory;
        recommendedBuild=null;
        renderBuildOptions();
    });
    const refreshRoadPanel=()=>{
        if(activeCategory==="roads"&&!modal.classList.contains("hidden"))renderBuildOptions();
    };
    window.addEventListener("kac:road-survey",refreshRoadPanel);
    window.addEventListener("kac:settlement-maintenance",refreshRoadPanel);
    document.getElementById("road-build-cancel")?.addEventListener("click",()=>cancelBuildPlacement());
    document.addEventListener("keydown",event=>{
        if(event.key!=="Escape")return;
        if(!modal.classList.contains("hidden")){closeModal();return;}
        if(getRoadBuildMode()||state.directBuildType)cancelBuildPlacement();
    });
    renderBuildOptions();
}
export function renderBuildPanel(){renderBuildOptions();}
export function currentBuildCategory(){return activeCategory;}
