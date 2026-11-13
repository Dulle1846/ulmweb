// Guarded presentation and fixed-step runtime loop.
import { BASE_TICK_INTERVAL,MOVEMENT_TICK_REFERENCE_MS } from "../core/config.js";
import { state } from "../core/state.js";
import { consumeSimulationTime } from "../core/simulation-clock.js";
import { updateSimulation } from "../simulation/simulation.js";
import { updateFriendlyMovement } from "../simulation/villagers.js";
import { updateLogisticsMovement } from "../systems/logistics.js";
import { drawWorld } from "../presentation/rendering/renderer.js";
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
   let simulationMs=0;
   if(!state.isPaused&&!state.gameOver){
    const simulationStarted=performance.now();
    const clock=consumeSimulationTime(state.tickAccumulator,deltaTime,state.gameSpeed,BASE_TICK_INTERVAL);
    // A delayed frame can accumulate several fixed steps. Running all of them
    // back-to-back creates a catch-up spike on exactly the frames that were
    // already late. Execute at most one step per presented frame and keep the
    // remaining time in the accumulator; every simulation tick still runs, in
    // the same order, and the deterministic campaign never goes through this
    // wall-clock pacing.
    const stepCount=Math.min(clock.steps,1);
    state.tickAccumulator=clock.remainderMs+(clock.steps-stepCount)*BASE_TICK_INTERVAL;
    for(let step=0;step<stepCount;step++){
     updateSimulation();updateParticles();updateFloaters();
     if(state.gameOver)break;
    }
    state.movementAccumulator+=deltaSeconds;
    const movementStep=1/30;
    let movementSteps=0;
    while(state.movementAccumulator>=movementStep&&movementSteps<3){
     // At 4x a whole movement step is ~0.30s, while both movers reject deltas
     // above 0.20s to keep collision resolution bounded. Subdivide instead of
     // dropping the update: otherwise retailers and carriers freeze at high
     // speed while the simulation clock keeps advancing.
     let movementDelta=movementStep*state.gameSpeed*(BASE_TICK_INTERVAL/MOVEMENT_TICK_REFERENCE_MS);
     while(movementDelta>0.0001){
      const stepDelta=Math.min(movementDelta,0.2);
      updateFriendlyMovement(stepDelta);
      updateLogisticsMovement(stepDelta);
      movementDelta-=stepDelta;
     }
     state.movementAccumulator-=movementStep;movementSteps++;
    }
    if(movementSteps===3)state.movementAccumulator=Math.min(state.movementAccumulator,movementStep);
    simulationMs=performance.now()-simulationStarted;
   }
   state.lastSimulationMs=simulationMs;
   flushPresentationEffects();
   // A modal covers the world and can itself contain large progressive panels.
   // Painting the hidden canvas on every frame competes with that DOM work on
   // low-end devices, so suspend world/minimap drawing until the dialog closes.
   // Simulation timing and state are untouched; the next visible frame resumes
   // world and HUD rendering.
   const worldOccluded=document.body.classList.contains("ui-modal-open");
   // The minimap does not need 2.5 updates per second on a low-end device.
   // A 1 Hz cadence keeps it useful without competing with the 30 FPS world
   // budget; the terrain half is cached separately inside updateMinimap().
   if(!worldOccluded&&timestamp-state.lastMinimapRender>=4000){updateMinimap();state.lastMinimapRender=timestamp;}
   // Simulation and camera updates stay smooth, while expensive world drawing
   // follows the selected 60/30 FPS cap. A sub-millisecond tolerance avoids
   // dropping every other frame on displays whose refresh interval is rounded.
   const interval=frameIntervalMs();
   if(!worldOccluded&&timestamp-lastRenderTimestamp>=interval-0.75){
    const {ctx,canvas}=state;
    if(ctx&&canvas){
     // The terrain now lives on its own surface behind this canvas. Keep the
     // gameplay/overlay canvas transparent so the surface shows through.
     const drawStarted=performance.now();
     ctx.clearRect(0,0,canvas.width,canvas.height);
     state.terrainBuildThisFrame=0;
     drawWorld();
     state.lastWorldDrawMs=Math.max(0,performance.now()-drawStarted);
     if(timestamp-state.lastUiRender>=1500){
      const uiStarted=performance.now();
      renderUI();
      state.lastUiRenderMs=Math.max(0,performance.now()-uiStarted);
      state.lastUiRender=timestamp;
     }
     // The vignette is a static CSS layer over the stage (stage-grain). A
     // second full-screen radial gradient in the gameplay canvas cost a
     // software rasteriser real milliseconds on every single frame.
     state.lastDrawMs=Math.max(0,performance.now()-drawStarted);
     state.renderedFrames=(Number(state.renderedFrames)||0)+1;
     // Optional bounded probe for browser performance audits. It is disabled
     // by default and never allocates unless the test explicitly enables it.
     const probe=state.performanceProbe;
     if(probe&&Array.isArray(probe.frames)&&probe.frames.length<(Number(probe.limit)||600)){
      // Measure time between rendered frames, not the raw rAF delta: at a
      // 30 FPS cap the browser may still call rAF at 60 Hz, which made the
      // old probe report 16.7 ms even though a frame was only presented every
      // 33.3 ms. Keep the raw cadence as a separate diagnostic.
      // A presented frame is timestamped twice: with the rAF clock for the
      // scheduler, and with performance.now() for the actual wall-clock gap.
      // The wall gap is the budget metric; the rAF gap is kept as a diagnostic
      // so an external browser pause can be separated from a slow draw.
      const presentedAt=performance.now();
      const renderedGap=probe.lastPresentedAt?Math.max(0,presentedAt-probe.lastPresentedAt):deltaTime;
      const rafGap=probe.lastRenderedAt?Math.max(0,timestamp-probe.lastRenderedAt):deltaTime;
      probe.lastPresentedAt=presentedAt;
      probe.lastRenderedAt=timestamp;
      probe.frames.push({
       timestamp:Math.round(timestamp),presentedAt:Math.round(presentedAt*1000)/1000,
       intervalMs:Math.round(renderedGap*1000)/1000,
       rafIntervalMs:Math.round(rafGap*1000)/1000,
       drawMs:Math.round((Number(state.lastDrawMs)||0)*1000)/1000,
       worldDrawMs:Math.round((Number(state.lastWorldDrawMs)||0)*1000)/1000,
       simMs:Math.round((Number(state.lastSimulationMs)||0)*1000)/1000,
       uiMs:Math.round((Number(state.lastUiRenderMs)||0)*1000)/1000,
       terrainBuildMs:Math.round((Number(state.terrainBuildThisFrame)||0)*1000)/1000,
       day:Number(state.dayOfYear)||0,season:Number(state.seasonIndex)||0,
       zoom:Math.round((Number(state.zoom)||0)*1000)/1000,
      });
     }
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
