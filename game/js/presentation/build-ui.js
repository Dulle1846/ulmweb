import { ROAD_TYPES,getRoadCount,setRoadBuildMode,clearRoadBuildMode,getRoadBuildMode } from "../systems/roads.js";

function formatCost(cost){
    return Object.entries(cost).filter(([,amount])=>amount>0).map(([resource,amount])=>amount+" "+resource).join(" · ")||"No material cost";
}
function renderBuildOptions(){
    const container=document.getElementById("build-options");
    if(!container)return;
    const symbols={dirt:"dirt-road",gravel:"gravel-road",paved:"paved-road"};
    container.innerHTML=Object.values(ROAD_TYPES).map(road=>(
        '<button class="build-option" type="button" data-road-type="'+road.id+'">'+
            '<span class="build-option-art"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="assets/city-builder-sprites.svg#'+symbols[road.id]+'"></use></svg></span>'+
            '<span class="build-option-copy"><strong>'+road.label+'</strong><small>'+road.speed.toFixed(2)+'× travel speed</small><small>Cost: '+formatCost(road.cost)+'</small><small>Daily upkeep: '+road.upkeep.toFixed(4)+' gold</small></span>'+
        '</button>'
    )).join("")+
        '<button class="build-option bulldoze-option" type="button" data-road-remove="true">'+
            '<span class="build-option-art" aria-hidden="true">🛠️</span>'+
            '<span class="build-option-copy"><strong>Bulldoze road</strong><small>Remove a road tile and recover 25% of its materials</small><small>No demolition cost</small></span>'+
        '</button>';
    container.querySelectorAll("[data-road-type]").forEach(button=>{
        button.addEventListener("click",()=>{
            const type=button.dataset.roadType;
            if(!setRoadBuildMode(type))return;
            const modal=document.getElementById("build-modal");
            modal?.classList.add("hidden");
            const status=document.getElementById("placement-status");
            const cancelButton=document.getElementById("road-build-cancel");
            cancelButton?.classList.remove("hidden");
            if(status){
                status.dataset.roadMode=type;
                status.textContent=ROAD_TYPES[type].label.toUpperCase()+" SELECTED · CLICK OR DRAG ON THE MAP · ESC TO CANCEL";
            }
        });
    });
    container.querySelector("[data-road-remove]")?.addEventListener("click",()=>{
        if(!setRoadBuildMode("remove"))return;
        document.getElementById("build-modal")?.classList.add("hidden");
        const status=document.getElementById("placement-status");
        document.getElementById("road-build-cancel")?.classList.remove("hidden");
        if(status){status.dataset.roadMode="remove";status.textContent="BULLDOZE SELECTED · CLICK OR DRAG OVER ROADS · ESC TO CANCEL";}
    });
    const count=document.getElementById("road-count");
    if(count)count.textContent=String(getRoadCount());
    const selected=getRoadBuildMode();
    document.querySelectorAll("[data-road-type]").forEach(button=>button.classList.toggle("is-selected",button.dataset.roadType===selected));
    container.querySelector("[data-road-remove]")?.classList.toggle("is-selected",selected==="remove");
}

export function setupBuildUI(){
    const modal=document.getElementById("build-modal");
    const open=document.getElementById("build-open-btn");
    const close=document.getElementById("build-close-btn");
    const cancel=document.getElementById("road-build-cancel");
    if(!modal||!open||modal.dataset.initialized==="true")return;
    modal.dataset.initialized="true";
    open.addEventListener("click",()=>{
        renderBuildOptions();
        modal.classList.remove("hidden");
    });
    close?.addEventListener("click",()=>modal.classList.add("hidden"));
    modal.addEventListener("click",event=>{if(event.target===modal)modal.classList.add("hidden");});
    cancel?.addEventListener("click",()=>{
        clearRoadBuildMode();
        cancel?.classList.add("hidden");
        const status=document.getElementById("placement-status");
        if(status){delete status.dataset.roadMode;status.textContent="ROAD PLACEMENT CANCELLED";}
        renderBuildOptions();
    });
    document.addEventListener("keydown",event=>{
        if(event.key!=="Escape")return;
        if(!modal.classList.contains("hidden")){modal.classList.add("hidden");return;}
        if(getRoadBuildMode()){
            clearRoadBuildMode();
            cancel?.classList.add("hidden");
            const status=document.getElementById("placement-status");
            if(status){delete status.dataset.roadMode;status.textContent="BUILD MODE CANCELLED";}
            renderBuildOptions();
        }
    });
    renderBuildOptions();
}
