// Guarded presentation and fixed-step runtime loop.
import { BASE_TICK_INTERVAL,MOVEMENT_TICK_REFERENCE_MS } from "../core/config.js";
import { state } from "../core/state.js";
import { consumeSimulationTime } from "../core/simulation-clock.js";
import { updateSimulation } from "../simulation/simulation.js";
import { updateFriendlyMovement } from "../simulation/villagers.js";
import { updateLogisticsMovement } from "../systems/logistics.js";
import { drawWorld,drawVignette } from "../presentation/rendering/renderer.js";
import { renderUI } from "../presentation/rendering/ui.js";
import { updateCamera } from "../presentation/camera.js";
import { updateParticles,updateFloaters } from "../presentation/rendering/particles.js";
import { updateMinimap } from "../presentation/rendering/minimap.js";
import { flushPresentationEffects } from "../presentation/effects.js";

let loopStarted=false;
let lastRenderTimestamp=0;
let perfWindowStarted=0;
let perfRenderedFrames=0;
let perfIntervalTotal=0;
let perfLastFrameAt=0;
let slowRenderFrames=0;

function resetFrameClock(){
 state.lastFrameTime=0;lastRenderTimestamp=0;state.tickAccumulator=0;state.movementAccumulator=0;
 state.lastMinimapRender=0;state.lastUiRender=0;
 perfWindowStarted=0;perfRenderedFrames=0;perfIntervalTotal=0;perfLastFrameAt=0;slowRenderFrames=0;
}

function frameIntervalMs(){
 return state.frameLimit===30?1000/30:1000/60;
}

function performanceLabel(){
 const renderer=state.terrainRenderer==="auto"
  ?(state.terrainFallback?"AUTO → CANVAS":"AUTO")  :String(state.terrainRenderer||"auto").toUpperCase();
 const scale=Math.round((Number(state.renderScale)||1)*100);
 return renderer+" · "+(state.terrainMode==="webgl"?"WEBGL":"CANVAS")+" · "+scale+"%";
}

function updatePerformanceHud(){
 const hud=document.getElementById("performance-hud");
 if(!hud)return;
 const show=state.showFps===true;
 hud.classList.toggle("hidden",!show);
 if(!show)return;
 const stats=state.renderStats||{};
 const fps=Math.max(0,Math.round(Number(stats.fps)||0));
 const frameMs=Math.max(0,Number(stats.frameMs)||0);
 hud.textContent=fps+" FPS · "+frameMs.toFixed(1)+" MS · "+performanceLabel();
}

function samplePerformance(timestamp,deltaTime){
 if(!perfWindowStarted){
  perfWindowStarted=timestamp;perfRenderedFrames=0;perfIntervalTotal=0;perfLastFrameAt=0;
 }
 perfRenderedFrames++;
 if(perfLastFrameAt)perfIntervalTotal+=Math.max(0,timestamp-perfLastFrameAt);
 perfLastFrameAt=timestamp;
 const elapsed=timestamp-perfWindowStarted;
 if(elapsed<500)return;
 const fps=Math.round(perfRenderedFrames*1000/Math.max(1,elapsed));
 const interval=perfRenderedFrames>1?perfIntervalTotal/(perfRenderedFrames-1):deltaTime;
 state.renderStats={
  fps,
  frameMs:Math.round(interval*10)/10,
  mode:state.terrainMode,
  fallback:state.terrainFallback===true,
 };
 updatePerformanceHud();
 perfWindowStarted=timestamp;perfRenderedFrames=0;perfIntervalTotal=0;perfLastFrameAt=0;
}

// WebGL is normally the faster path, but software WebGL (SwiftShader/llvmpipe)
// can be far slower than Canvas 2D. If frames remain slow after startup even
// though the automatic choice picked WebGL, fall back without losing detail;
// Canvas 2D keeps the full artwork and the terrain cache.
function considerAdaptiveFallback(deltaTime){
 if(!state.adaptiveQuality||state.terrainRenderer!=="auto"||state.terrainMode!=="webgl"||state.terrainFallback){
  slowRenderFrames=0;
  return;
 }
 if(deltaTime>48)slowRenderFrames++;
 else slowRenderFrames=Math.max(0,slowRenderFrames-1);
 if(slowRenderFrames<5)return;
 state.terrainAutoMode="canvas";
 state.terrainFallback=true;
 state.terrainCacheRevision=(Number(state.terrainCacheRevision)||0)+1;
 state.terrainCacheHits=0;state.terrainCacheMisses=0;
 slowRenderFrames=0;
 updatePerformanceHud();
}

export function startGameLoop(){
 if(loopStarted)return;
 loopStarted=true;resetFrameClock();
 document.addEventListener("visibilitychange",()=>{
  resetFrameClock();
  if(!document.hidden)state.lastFrameTime=0;
 });
 requestAnimationFrame(gameLoop);
}
function showRuntimeFault(error){
 state.frameFaulted=true;state.isPaused=true;state.frameErrorCount=(state.frameErrorCount||0)+1;
 console.error("Kings & Cards runtime paused after an error:",error);
 const toast=document.getElementById("action-toast");
 if(toast){
  toast.textContent="THE REALM PAUSED AFTER AN INTERNAL ERROR · RELOAD TO CONTINUE";
  toast.classList.add("is-visible");
 }
 const pauseText=document.getElementById("pause-text");
 if(pauseText)pauseText.textContent="PAUSED";
}
function gameLoop(timestamp){
 if(state.frameFaulted)return;
 try{
  if(document.hidden){
   resetFrameClock();
  }else{
   if(state.lastFrameTime===0)state.lastFrameTime=timestamp;
   const deltaTime=Math.max(0,Math.min(100,timestamp-state.lastFrameTime));
   state.lastFrameTime=timestamp;
   const deltaSeconds=Math.min(deltaTime,50)/1000;
   updateCamera(deltaSeconds);
   if(!state.isPaused&&!state.gameOver&&!state.victory){
    const clock=consumeSimulationTime(state.tickAccumulator,deltaTime,state.gameSpeed,BASE_TICK_INTERVAL);
    state.tickAccumulator=clock.remainderMs;
    for(let step=0;step<clock.steps;step++){
     updateSimulation();updateParticles();updateFloaters();
     if(state.gameOver||state.victory)break;
    }
    state.movementAccumulator+=deltaSeconds;
    const movementStep=1/30;
    let movementSteps=0;
    while(state.movementAccumulator>=movementStep&&movementSteps<3){
     updateFriendlyMovement(movementStep*state.gameSpeed*(BASE_TICK_INTERVAL/MOVEMENT_TICK_REFERENCE_MS));
     updateLogisticsMovement(movementStep*state.gameSpeed*(BASE_TICK_INTERVAL/MOVEMENT_TICK_REFERENCE_MS));
     state.movementAccumulator-=movementStep;movementSteps++;
    }
    if(movementSteps===3)state.movementAccumulator=Math.min(state.movementAccumulator,movementStep);
   }
   flushPresentationEffects();
   if(timestamp-state.lastMinimapRender>=400){updateMinimap();state.lastMinimapRender=timestamp;}
   // Simulation and camera updates stay smooth, while expensive world drawing
   // follows the selected 60/30 FPS cap. A sub-millisecond tolerance avoids
   // dropping every other frame on displays whose refresh interval is rounded.
   const interval=frameIntervalMs();
   if(timestamp-lastRenderTimestamp>=interval-0.75){
    const {ctx,canvas}=state;
    if(ctx&&canvas){
     // The terrain now lives on its own surface behind this canvas. Keep the
     // gameplay/overlay canvas transparent so the surface shows through.
     const drawStarted=performance.now();
     ctx.clearRect(0,0,canvas.width,canvas.height);
     drawWorld();
     if(timestamp-state.lastUiRender>=160){renderUI();state.lastUiRender=timestamp;}
     drawVignette();
     state.lastDrawMs=Math.max(0,performance.now()-drawStarted);
     state.renderedFrames=(Number(state.renderedFrames)||0)+1;
     samplePerformance(timestamp,deltaTime);
     considerAdaptiveFallback(deltaTime);
    }
    lastRenderTimestamp=timestamp;
   }
  }
 }catch(error){
  showRuntimeFault(error);
  return;
 }
 requestAnimationFrame(gameLoop);
}
