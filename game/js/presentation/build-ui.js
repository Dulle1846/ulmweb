// Construction panel: roads and every direct building category share one
// honest placement flow. Selecting a building creates a real construction
// site; its first material share is charged only when the site is placed.
import { state } from "../core/state.js";
import { ROAD_TYPES,getRoadCount,setRoadBuildMode,clearRoadBuildMode,getRoadBuildMode } from "../systems/roads.js";
import { BUILD_MENU, BUILDING_LABELS, HOUSING_TIERS, RECIPES, SERVICE_DEFINITIONS, CONSTRUCTION_SHARE, costShare, isHousingType } from "../systems/city-config.js";
import { getBuildingCost } from "../systems/construction.js";
import { getCitySummary, getLogisticsSnapshot } from "../systems/logistics.js";
import { getSettlementSnapshot } from "../systems/settlement.js";

let activeCategory="roads";

const ROAD_SYMBOLS={dirt:"dirt-road",gravel:"gravel-road",paved:"paved-road"};
const BUILDING_SYMBOLS={
    1:"keep",2:"cottage",3:"farm",4:"lumber-yard",5:"quarry",6:"watchtower",7:"wall",
    8:"tavern",9:"temple",10:"barracks",11:"windmill",12:"stable",13:"wonder",14:"goldmine",
    15:"storehouse",60:"cottage",61:"cottage",62:"storehouse",63:"lumber-yard",64:"windmill",
    65:"windmill",66:"quarry",67:"lumber-yard",68:"temple",69:"tavern"
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
    const recipe=RECIPES[type];
    if(recipe){
        const input=recipe.input?Object.entries(recipe.input).map(([good,amount])=>amount+" "+good).join(" + ")+" → ":"";
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
        container.innerHTML=Object.values(ROAD_TYPES).map(road=>(
            '<button class="build-option" type="button" data-road-type="'+road.id+'">'+
                '<span class="build-option-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/city-builder-sprites.svg#'+ROAD_SYMBOLS[road.id]+'"></use></svg></span>'+
                '<span class="build-option-copy"><strong>'+road.label+'</strong><small>'+road.speed.toFixed(2)+'× travel speed</small><small>Cost: '+formatCost(road.cost)+'</small><small>Daily upkeep: '+road.upkeep.toFixed(4)+' gold</small></span>'+
            '</button>'
        )).join("")+
            '<button class="build-option bulldoze-option" type="button" data-road-remove="true">'+
                '<span class="build-option-art" aria-hidden="true">🛠️</span>'+
                '<span class="build-option-copy"><strong>Bulldoze road</strong><small>Remove a road tile and recover 25% of its materials</small><small>No demolition cost</small></span>'+
            '</button>';
        container.querySelectorAll("[data-road-type]").forEach(button=>{
            button.addEventListener("click",()=>startRoad(button.dataset.roadType));
        });
        container.querySelector("[data-road-remove]")?.addEventListener("click",()=>startRoad("remove"));
    }else{
        const category=BUILD_MENU.find(entry=>entry.id===activeCategory);
        const types=category?.types||[];
        container.innerHTML=types.map(type=>{
            const cost=getBuildingCost(type);
            const canPay=affordable(costShare(cost,CONSTRUCTION_SHARE));
            const name=BUILDING_LABELS[type]||("Building "+type);
            return '<button class="build-option building-build-option" type="button" data-build-type="'+type+'"'+(canPay?'':' aria-disabled="true"')+'>'+
                '<span class="build-option-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/royal-building-atlas.svg#'+(BUILDING_SYMBOLS[type]||"cottage")+'"></use></svg></span>'+
                '<span class="build-option-copy"><strong>'+name+'</strong><small>'+buildingDetail(type)+'</small><small>Cost: '+formatCost(cost)+'</small><small>Starts a site · first 25% charged now · rest delivered by carriers</small></span>'+
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
export function setupBuildUI(){
    const modal=document.getElementById("build-modal");
    const open=document.getElementById("build-open-btn");
    if(!modal||!open||modal.dataset.initialized==="true")return;
    modal.dataset.initialized="true";
    open.addEventListener("click",()=>{renderBuildOptions();modal.classList.remove("hidden");});
    document.getElementById("build-close-btn")?.addEventListener("click",closeModal);
    modal.addEventListener("click",event=>{if(event.target===modal)closeModal();});
    modal.addEventListener("click",event=>{
        const category=event.target.closest("[data-build-category]");
        if(!category)return;
        activeCategory=category.dataset.buildCategory;
        renderBuildOptions();
    });
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
