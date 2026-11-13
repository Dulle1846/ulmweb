// Pointer camera, card placement and modal interaction bindings.
import { WORLD_W,WORLD_H,CELL } from "../core/config.js";
import { state } from "../core/state.js";
import { clampCamera,applyZoomDelta,screenToWorld,setZoomLevel,setZoomTarget } from "./camera.js";
import { placeCurrentCard,skipCard,getCardPlacementPreview,selectCard } from "../systems/cards.js";
import { resolveEventChoice } from "../systems/events.js";
import { executeTrade } from "../systems/market.js";
import { createParticle } from "./rendering/particles.js";
import { showBigMessage,renderUI } from "./rendering/ui.js";
import { distance } from "../core/utils.js";
import { getRoadBuildMode,placeRoad,removeRoad } from "../systems/roads.js";
import { isWorkshopOpen,handleWorkshopClick,cancelWorkshopTool,closeWorkshop } from "./build-mode.js";
import { placeDirectBuilding,constructionStatus } from "../systems/construction.js";
import { cancelBuildPlacement } from "./build-ui.js";

export function setupInput(){
    const canvas=state.canvas;
    const cardContainer=document.getElementById("card-container");
    const dragGhost=document.getElementById("card-drag-ghost");
    const placementStatus=document.getElementById("placement-status");
    let isPanning=false,pointerMoved=false,lastX=0,lastY=0,startX=0,startY=0;
    let cardPointerId=null,lastPinchDistance=0,cardPreviewFrame=0,pendingCardPointer=null,lastRoadTileKey=null;

    canvas.addEventListener("wheel",event=>{
        event.preventDefault();
        const rect=canvas.getBoundingClientRect();
        applyZoomDelta(event.deltaY,event.clientX-rect.left,event.clientY-rect.top);
    },{passive:false});

    // Pointer capture keeps a drag alive when the cursor leaves the canvas or
    // passes over a HUD plaque, which plain mousemove listeners did not.
    canvas.addEventListener("pointerdown",event=>{
        if(event.pointerType==="touch"||event.button!==0)return;
        isPanning=true;pointerMoved=false;lastRoadTileKey=null;
        lastX=startX=event.clientX;lastY=startY=event.clientY;
        try{canvas.setPointerCapture(event.pointerId);}catch{}
        if(getRoadBuildMode())paintRoadAtScreen(event);
    });
    canvas.addEventListener("pointermove",event=>{
        if(!isPanning||event.pointerType==="touch")return;
        const dx=event.clientX-lastX,dy=event.clientY-lastY;
        if(Math.hypot(event.clientX-startX,event.clientY-startY)>4)pointerMoved=true;
        if(getRoadBuildMode()){
            if(pointerMoved)paintRoadAtScreen(event);
            lastX=event.clientX;lastY=event.clientY;
            return;
        }
        if(dx||dy){const scale=state.renderScale||1;state.zoomAnchor=null;state.camera.x-=dx*scale;state.camera.y-=dy*scale;clampCamera();}
        lastX=event.clientX;lastY=event.clientY;
    });
    const endPointerPan=event=>{
        if(event.pointerType==="touch")return;
        if(isPanning&&!pointerMoved&&event.button===0)clickOnCanvas(event);
        isPanning=false;lastRoadTileKey=null;
        try{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}catch{}
    };
    canvas.addEventListener("pointerup",endPointerPan);
    canvas.addEventListener("pointercancel",event=>{
        isPanning=false;lastRoadTileKey=null;
        try{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}catch{}
    });
    canvas.addEventListener("contextmenu",event=>{event.preventDefault();clickOnCanvas(event);});

    canvas.addEventListener("touchstart",event=>{
        event.preventDefault();
        if(event.touches.length===1){
            const touch=event.touches[0];isPanning=true;pointerMoved=false;lastRoadTileKey=null;
            lastX=startX=touch.clientX;lastY=startY=touch.clientY;lastPinchDistance=0;
            if(getRoadBuildMode())paintRoadAtScreen(touch);
        }else if(event.touches.length===2){
            const [a,b]=event.touches;
            lastPinchDistance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);isPanning=false;
            // A pinch is a gesture, never a tap. Without this the final
            // touchend would click the map and could start a direct build.
            pointerMoved=true;
        }
    },{passive:false});
    canvas.addEventListener("touchmove",event=>{
        event.preventDefault();
        if(event.touches.length===1&&isPanning){
            const touch=event.touches[0],dx=touch.clientX-lastX,dy=touch.clientY-lastY;
            if(Math.hypot(touch.clientX-startX,touch.clientY-startY)>5)pointerMoved=true;
            if(getRoadBuildMode()){
                if(pointerMoved)paintRoadAtScreen(touch);
                lastX=touch.clientX;lastY=touch.clientY;
                return;
            }
            const scale=state.renderScale||1;
            state.zoomAnchor=null;state.camera.x-=dx*scale;state.camera.y-=dy*scale;clampCamera();
            lastX=touch.clientX;lastY=touch.clientY;
        }else if(event.touches.length===2){
            const [a,b]=event.touches;
            const distanceNow=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
            if(lastPinchDistance>0&&distanceNow>0){
                const rect=canvas.getBoundingClientRect();
                // Scale with the gesture, not with wheel delta: doubling the
                // finger distance doubles the zoom target.
                const scale=state.renderScale||1;
                setZoomTarget((state.zoomTarget/scale)*(distanceNow/lastPinchDistance),(a.clientX+b.clientX)/2-rect.left,(a.clientY+b.clientY)/2-rect.top);
            }
            lastPinchDistance=distanceNow;
        }
    },{passive:false});
    canvas.addEventListener("touchend",event=>{
        if(event.touches.length===0){
            if(isPanning&&!pointerMoved)clickOnCanvas({clientX:lastX,clientY:lastY});
            isPanning=false;lastPinchDistance=0;lastRoadTileKey=null;
        }else if(event.touches.length===1){
            const touch=event.touches[0];lastX=startX=touch.clientX;lastY=startY=touch.clientY;isPanning=true;lastPinchDistance=0;
        }
    });
    canvas.addEventListener("touchcancel",()=>{
        // A cancelled gesture must not keep a stale pan or pinch anchor.
        isPanning=false;lastPinchDistance=0;lastRoadTileKey=null;
    });

    function beginCardDrag(event,cardId){
        if(event.button!==0||!cardId||state.gameOver||state.isPaused||isWorkshopOpen()||state.directBuildType)return;
        if(!selectCard(cardId))return;
        event.preventDefault();
        cardPointerId=event.pointerId;
        cardContainer?.classList.add("is-dragging");
        document.body.classList.add("card-dragging");
        dragGhost?.classList.add("is-visible");
        const card=state.currentCard;
        document.getElementById("drag-ghost-icon").textContent=card.icon;
        document.getElementById("drag-ghost-name").textContent=card.name;
        updateCardDrag(event);
        renderUI();
    }
    cardContainer?.addEventListener("pointerdown",event=>beginCardDrag(event,state.selectedCardInstanceId));

    window.addEventListener("pointermove",event=>{
        if(cardPointerId!==event.pointerId)return;
        pendingCardPointer={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY};
        if(!cardPreviewFrame){
            cardPreviewFrame=requestAnimationFrame(()=>{
                cardPreviewFrame=0;
                const latest=pendingCardPointer;pendingCardPointer=null;
                if(latest&&cardPointerId===latest.pointerId)updateCardDrag(latest);
            });
        }
    });
    window.addEventListener("pointerup",event=>{
        if(cardPointerId!==event.pointerId)return;
        if(cardPreviewFrame)cancelAnimationFrame(cardPreviewFrame);
        cardPreviewFrame=0;pendingCardPointer=null;
        updateCardDrag(event);
        const rect=canvas.getBoundingClientRect();
        const inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
        // The hand dock and zoom/minimap controls overlay the canvas rectangle.
        // Releasing on one of those controls must never place the selected card.
        const releasedOnMap=document.elementFromPoint(event.clientX,event.clientY)===canvas;
        if(inside&&releasedOnMap&&state.cardPreview?.valid&&!isWorkshopOpen())placeCurrentCard(state.cardPreview.tx,state.cardPreview.ty);
        endCardDrag();
        renderUI();
    });
    window.addEventListener("pointercancel",event=>{if(cardPointerId===event.pointerId)endCardDrag();});

    function updateCardDrag(event){
        if(!canvas)return;
        const rect=canvas.getBoundingClientRect();
        const inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
        if(dragGhost){dragGhost.style.left=(event.clientX+18)+"px";dragGhost.style.top=(event.clientY+18)+"px";}
        if(inside){
            const world=screenToWorld(event.clientX-rect.left,event.clientY-rect.top);
            state.cardPreview=getCardPlacementPreview(Math.floor(world.x),Math.floor(world.y));
        }else state.cardPreview=null;
        if(placementStatus){
            placementStatus.textContent=state.cardPreview?(state.cardPreview.valid?"RELEASE TO BUILD":state.cardPreview.reason):"DROP ON THE WORLD MAP";
            if(state.cardPreview)placementStatus.dataset.valid=String(state.cardPreview.valid);
            else delete placementStatus.dataset.valid;
        }
    }
    function endCardDrag(){
        if(cardPreviewFrame)cancelAnimationFrame(cardPreviewFrame);
        cardPreviewFrame=0;pendingCardPointer=null;
        cardPointerId=null;state.cardPreview=null;
        cardContainer?.classList.remove("is-dragging");
        document.body.classList.remove("card-dragging");
        dragGhost?.classList.remove("is-visible");
        if(placementStatus){placementStatus.textContent="DRAG THE SELECTED CARD ONTO THE MAP";delete placementStatus.dataset.valid;}
    }

    // Escape is the only gameplay-independent key the page still listens for:
    // it cancels a drag or closes the topmost dialog. Panning and every other
    // control are pointer- or button-driven.
    window.addEventListener("keydown",event=>{
        if(event.key!=="Escape")return;
        if(cardPointerId!==null)endCardDrag();
        if(state.buildTool){cancelWorkshopTool();return;}
        if(isWorkshopOpen()){closeWorkshop();return;}
        if(state.directBuildType||getRoadBuildMode()){cancelBuildPlacement();return;}
        closeTopModal();
    });

    document.getElementById("pause-btn")?.addEventListener("click",togglePause);
    document.getElementById("speed-0-5")?.addEventListener("click",()=>setSpeed(0.5));
    document.getElementById("speed-1")?.addEventListener("click",()=>setSpeed(1));
    document.getElementById("speed-2")?.addEventListener("click",()=>setSpeed(2));
    document.getElementById("speed-4")?.addEventListener("click",()=>setSpeed(4));
    const zoomCenterX=()=>canvas.clientWidth/2||canvas.width/((state.renderScale||1)*2);
    const zoomCenterY=()=>canvas.clientHeight/2||canvas.height/((state.renderScale||1)*2);
    document.getElementById("zoom-in")?.addEventListener("click",()=>applyZoomDelta(-100,zoomCenterX(),zoomCenterY()));
    document.getElementById("zoom-out")?.addEventListener("click",()=>applyZoomDelta(100,zoomCenterX(),zoomCenterY()));
    document.querySelectorAll(".zoom-preset").forEach(button=>button.addEventListener("click",()=>setZoomLevel(Number(button.dataset.zoomLevel))));
    document.getElementById("skip-card-btn")?.addEventListener("click",()=>{skipCard();renderUI();});
    document.getElementById("help-btn")?.addEventListener("click",showHelp);
    document.getElementById("tab-0")?.addEventListener("click",()=>switchTab(0));
    document.getElementById("tab-1")?.addEventListener("click",()=>switchTab(1));
    document.getElementById("tab-2")?.addEventListener("click",()=>switchTab(2));
    document.getElementById("big-message")?.addEventListener("click",()=>document.getElementById("big-message").classList.add("hidden"));
    document.getElementById("big-message-close")?.addEventListener("click",event=>{event.stopImmediatePropagation();document.getElementById("big-message").classList.add("hidden");});

    document.getElementById("tab-content")?.addEventListener("click",event=>{
        const trade=event.target.closest("[data-trade]");
        if(trade){
            const result=executeTrade(trade.dataset.partner,trade.dataset.resource,trade.dataset.trade,Number(trade.dataset.quantity));
            showToast(result.ok?"TRADE COMPLETED":result.reason);
            renderUI();
        }
    });
    document.getElementById("realm-event-choices")?.addEventListener("click",event=>{
        const button=event.target.closest("[data-event-choice]");
        if(!button)return;
        const resolved=resolveEventChoice(Number(button.dataset.eventChoice));
        if(resolved){
            // Resolving clears the blocking event immediately. Do not wait for
            // the chunked HUD queue to reach renderRealmEvent: on a slow frame
            // the stale modal would otherwise stay over the realm for several
            // frames after the decision has already been applied.
            document.getElementById("realm-event-modal")?.classList.add("hidden");
            showToast("REALM ISSUE RESOLVED");
        }
        renderUI();
    });

    function roadTileFromScreen(event){
        const rect=canvas.getBoundingClientRect();
        const world=screenToWorld(event.clientX-rect.left,event.clientY-rect.top);
        return {x:Math.floor(world.x),y:Math.floor(world.y)};
    }
    function paintRoadAtScreen(event){
        const type=getRoadBuildMode();
        if(!type||state.gameOver||state.isPaused||!state.hasStarted)return;
        const {x,y}=roadTileFromScreen(event),key=x+":"+y;
        if(key===lastRoadTileKey)return;
        lastRoadTileKey=key;
        const result=type==="remove"?removeRoad(x,y):placeRoad(x,y,type);
        if(result.ok){
            const count=document.getElementById("road-count");
            if(count&&!result.upgraded)count.textContent=String(Math.max(0,Number(count.textContent||0)+(type==="remove"?-1:1)));
            if(placementStatus)placementStatus.textContent=type==="remove"?"ROAD REMOVED · "+x+", "+y:type.toUpperCase()+" ROAD PLACED · "+x+", "+y;
            renderUI();
        }else if(result.reason!=="Road already exists here"){
            if(placementStatus)placementStatus.textContent=result.reason.toUpperCase();
        }
    }
    function clickOnCanvas(event){
        if(state.gameOver||state.isPaused||!state.hasStarted)return;
        const rect=canvas.getBoundingClientRect();
        const world=screenToWorld(event.clientX-rect.left,event.clientY-rect.top);
        const tx=Math.floor(world.x),ty=Math.floor(world.y);
        const boundsW=Number(state.worldW)||WORLD_W,boundsH=Number(state.worldH)||WORLD_H;
        if(tx<0||ty<0||tx>=boundsW||ty>=boundsH)return;
        if(isWorkshopOpen()){handleWorkshopClick(tx,ty);return;}
        if(state.directBuildType){
            const result=placeDirectBuilding(state.directBuildType,tx,ty);
            if(placementStatus){
                placementStatus.textContent=result.ok
                    ?constructionStatus(result.entity)+" · SITE AT "+tx+", "+ty+" · CLICK ANOTHER DRY SITE"
                    :String(result.reason||"SITE REJECTED").toUpperCase();
                placementStatus.dataset.valid=String(Boolean(result.ok));
            }
            if(result.ok){addBuildFeedback(result.entity);renderUI();}
            return;
        }
        const roadType=getRoadBuildMode();
        if(roadType){paintRoadAtScreen(event);return;}
        const enemy=state.entities.find(entity=>!entity.dead&&entity.isEnemy()&&distance(entity.x,entity.y,world.x,world.y)<0.8);
        if(enemy){
            enemy.hp-=60;
            createParticle(enemy.x*CELL+24,enemy.y*CELL+12,"#ec4899",30);
            if(enemy.hp<=0){enemy.dead=true;}
            return;
        }
    }
    function addBuildFeedback(entity){
        if(!entity)return;
        createParticle(entity.x*CELL+CELL/2,entity.y*CELL+CELL/2,"#e4bd72",18);
        showToast("CONSTRUCTION SITE OPENED · "+entity.x+", "+entity.y);
    }
}

function togglePause(){
    state.isPaused=!state.isPaused;
    document.getElementById("pause-btn")?.classList.toggle("is-paused",state.isPaused);
    const text=document.getElementById("pause-text");if(text)text.textContent=state.isPaused?"RESUME":"PAUSE";
}
function setSpeed(speed){state.gameSpeed=speed;document.querySelectorAll(".speed-button").forEach(button=>button.classList.toggle("is-active",Number(button.dataset.speed)===speed));}
function switchTab(tab){state.selectedTab=tab;document.querySelectorAll(".tab-button").forEach((button,index)=>button.classList.toggle("is-active",index===tab));renderUI();}
function showHelp(){
    showBigMessage("HOW TO PLAY",
        "• Drag anywhere on the map to pan; scroll to change detail level<br>• Open the Cards tab and draw a card when you want one<br>• Select it, then drag it from the Selected Card panel onto the map<br>• Use the zoom presets and the pause button; no keyboard is needed<br><br><strong>Build. Protect. Prosper.</strong>",0);
}
function showToast(message){
    const el=document.getElementById("action-toast");if(!el)return;
    el.textContent=message;el.classList.add("is-visible");
    window.clearTimeout(showToast.timer);showToast.timer=window.setTimeout(()=>el.classList.remove("is-visible"),1800);
}
function closeTopModal(){
    for(const id of ["settings-modal","people-modal","big-message"]){
        const el=document.getElementById(id);if(el&&!el.classList.contains("hidden")){el.classList.add("hidden");return;}
    }
}
