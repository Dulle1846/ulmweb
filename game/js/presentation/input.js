// Keyboard, camera, card-hand and modal interaction bindings.
import { WORLD_W,WORLD_H,CELL } from "../core/config.js";
import { state } from "../core/state.js";
import { clampCamera,applyZoomDelta,screenToWorld,setZoomLevel } from "./camera.js";
import { placeCurrentCard,skipCard,getCardPlacementPreview,selectCard } from "../systems/cards.js";
import { resolveEventChoice } from "../systems/events.js";
import { executeTrade } from "../systems/market.js";
import { createParticle } from "./rendering/particles.js";
import { showBigMessage,renderUI } from "./rendering/ui.js";
import { distance } from "../core/utils.js";
import { toggleSoundtrack } from "../core/soundtrack.js";
import { loadSettings,saveSettings } from "../core/persistence.js";

export function setupInput(){
    const canvas=state.canvas;
    const cardContainer=document.getElementById("card-container");
    const handContainer=document.getElementById("card-hand");
    const dragGhost=document.getElementById("card-drag-ghost");
    const placementStatus=document.getElementById("placement-status");
    let isPanning=false,pointerMoved=false,lastX=0,lastY=0,startX=0,startY=0;
    let cardPointerId=null,lastPinchDistance=0,cardPreviewFrame=0,pendingCardPointer=null;

    canvas.addEventListener("wheel",event=>{
        event.preventDefault();
        const rect=canvas.getBoundingClientRect();
        applyZoomDelta(event.deltaY,event.clientX-rect.left,event.clientY-rect.top);
    },{passive:false});

    canvas.addEventListener("mousedown",event=>{
        if(event.button!==0)return;
        isPanning=true;pointerMoved=false;
        lastX=startX=event.clientX;lastY=startY=event.clientY;
    });
    window.addEventListener("mouseup",event=>{
        if(isPanning&&!pointerMoved&&event.button===0)clickOnCanvas(event);
        isPanning=false;
    });
    canvas.addEventListener("mousemove",event=>{
        if(!isPanning)return;
        const dx=event.clientX-lastX,dy=event.clientY-lastY;
        if(Math.hypot(event.clientX-startX,event.clientY-startY)>5)pointerMoved=true;
        state.zoomAnchor=null;state.camera.x-=dx;state.camera.y-=dy;clampCamera();
        lastX=event.clientX;lastY=event.clientY;
    });
    canvas.addEventListener("contextmenu",event=>{event.preventDefault();clickOnCanvas(event);});

    canvas.addEventListener("touchstart",event=>{
        event.preventDefault();
        if(event.touches.length===1){
            const touch=event.touches[0];isPanning=true;pointerMoved=false;
            lastX=startX=touch.clientX;lastY=startY=touch.clientY;lastPinchDistance=0;
        }else if(event.touches.length===2){
            const [a,b]=event.touches;
            lastPinchDistance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);isPanning=false;
        }
    },{passive:false});
    canvas.addEventListener("touchmove",event=>{
        event.preventDefault();
        if(event.touches.length===1&&isPanning){
            const touch=event.touches[0],dx=touch.clientX-lastX,dy=touch.clientY-lastY;
            if(Math.hypot(touch.clientX-startX,touch.clientY-startY)>5)pointerMoved=true;
            state.zoomAnchor=null;state.camera.x-=dx;state.camera.y-=dy;clampCamera();
            lastX=touch.clientX;lastY=touch.clientY;
        }else if(event.touches.length===2){
            const [a,b]=event.touches;
            const distanceNow=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
            if(lastPinchDistance>0){
                const rect=canvas.getBoundingClientRect();
                applyZoomDelta((lastPinchDistance-distanceNow)*0.5,(a.clientX+b.clientX)/2-rect.left,(a.clientY+b.clientY)/2-rect.top);
            }
            lastPinchDistance=distanceNow;
        }
    },{passive:false});
    canvas.addEventListener("touchend",event=>{
        if(event.touches.length===0){
            if(isPanning&&!pointerMoved)clickOnCanvas({clientX:lastX,clientY:lastY});
            isPanning=false;lastPinchDistance=0;
        }else if(event.touches.length===1){
            const touch=event.touches[0];lastX=startX=touch.clientX;lastY=startY=touch.clientY;isPanning=true;
        }
    });

    function beginCardDrag(event,cardId){
        if(event.button!==0||!cardId||state.gameOver||state.isPaused)return;
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
    handContainer?.addEventListener("pointerdown",event=>{
        const cardButton=event.target.closest(".hand-card");
        if(cardButton)beginCardDrag(event,cardButton.dataset.cardId);
    });

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
        if(inside&&state.cardPreview)placeCurrentCard(state.cardPreview.tx,state.cardPreview.ty);
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
        if(placementStatus){placementStatus.textContent="DRAG A CARD ONTO THE MAP";delete placementStatus.dataset.valid;}
    }

    window.addEventListener("keydown",event=>{
        const target=event.target;
        const typing=target instanceof HTMLElement&&(["INPUT","TEXTAREA","SELECT"].includes(target.tagName)||target.isContentEditable);
        if(event.key==="Escape"){
            if(cardPointerId!==null)endCardDrag();
            closeTopModal();
            return;
        }
        if(typing)return;
        if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){
            event.preventDefault();window.dispatchEvent(new Event("kac:save-request"));return;
        }
        if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="o"){
            event.preventDefault();window.dispatchEvent(new Event("kac:load-request"));return;
        }
        if(event.code==="Space"){event.preventDefault();togglePause();return;}
        if(event.key.toLowerCase()==="m"){
            const settings=loadSettings();
            settings.musicEnabled=toggleSoundtrack();
            saveSettings(settings);
            return;
        }
        if(event.key==="?"||event.key==="/"){showHelp();return;}
        if(event.key==="+"||event.key==="=")applyZoomDelta(-100,canvas.width/2,canvas.height/2);
        if(event.key==="-")applyZoomDelta(100,canvas.width/2,canvas.height/2);
        if(event.key>="1"&&event.key<="4")setZoomLevel(Number(event.key));
        const pan=24;
        if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a")state.camera.x-=pan;
        else if(event.key==="ArrowRight"||event.key.toLowerCase()==="d")state.camera.x+=pan;
        else if(event.key==="ArrowUp"||event.key.toLowerCase()==="w")state.camera.y-=pan;
        else if(event.key==="ArrowDown"||event.key.toLowerCase()==="s")state.camera.y+=pan;
        else return;
        event.preventDefault();state.zoomAnchor=null;clampCamera();
    });

    document.getElementById("pause-btn")?.addEventListener("click",togglePause);
    document.getElementById("speed-1")?.addEventListener("click",()=>setSpeed(1));
    document.getElementById("speed-2")?.addEventListener("click",()=>setSpeed(2));
    document.getElementById("speed-4")?.addEventListener("click",()=>setSpeed(4));
    document.getElementById("zoom-in")?.addEventListener("click",()=>applyZoomDelta(-100,canvas.width/2,canvas.height/2));
    document.getElementById("zoom-out")?.addEventListener("click",()=>applyZoomDelta(100,canvas.width/2,canvas.height/2));
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
        if(resolved)showToast("REALM ISSUE RESOLVED");
        renderUI();
    });

    function clickOnCanvas(event){
        if(state.gameOver||state.isPaused||!state.hasStarted)return;
        const rect=canvas.getBoundingClientRect();
        const world=screenToWorld(event.clientX-rect.left,event.clientY-rect.top);
        const tx=Math.floor(world.x),ty=Math.floor(world.y);
        if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H)return;
        const enemy=state.entities.find(entity=>!entity.dead&&entity.isEnemy()&&distance(entity.x,entity.y,world.x,world.y)<0.8);
        if(enemy){
            enemy.hp-=60;
            createParticle(enemy.x*CELL+24,enemy.y*CELL+12,"#ec4899",30);
            if(enemy.hp<=0){enemy.dead=true;}
            return;
        }
        if(state.currentCard)placeCurrentCard(tx,ty);
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
        "• Drag one of the five cards in your hand onto the map<br>• Scroll to move through four detail levels<br>• Use WASD or arrow keys to pan<br>• Space pauses; 1–4 selects zoom; M toggles music<br>• Ctrl+S saves; Ctrl+O loads your local save<br><br><strong>Build. Protect. Prosper.</strong>",0);
}
function showToast(message){
    const el=document.getElementById("action-toast");if(!el)return;
    el.textContent=message;el.classList.add("is-visible");
    window.clearTimeout(showToast.timer);showToast.timer=window.setTimeout(()=>el.classList.remove("is-visible"),1800);
}
function closeTopModal(){
    for(const id of ["settings-modal","big-message"]){
        const el=document.getElementById(id);if(el&&!el.classList.contains("hidden")){el.classList.add("hidden");return;}
    }
}
