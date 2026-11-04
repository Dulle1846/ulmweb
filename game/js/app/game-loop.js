// Guarded presentation and fixed-step runtime loop.
import { BASE_TICK_INTERVAL } from "../core/config.js";
import { state } from "../core/state.js";
import { consumeSimulationTime } from "../core/simulation-clock.js";
import { updateSimulation } from "../simulation/simulation.js";
import { updateFriendlyMovement } from "../simulation/villagers.js";
import { drawWorld,drawVignette } from "../presentation/rendering/renderer.js";
import { renderUI } from "../presentation/rendering/ui.js";
import { updateCamera } from "../presentation/camera.js";
import { updateParticles,updateFloaters } from "../presentation/rendering/particles.js";
import { updateMinimap } from "../presentation/rendering/minimap.js";
import { flushPresentationEffects } from "../presentation/effects.js";

let loopStarted=false;
function resetFrameClock(){
 state.lastFrameTime=0;state.tickAccumulator=0;state.movementAccumulator=0;
 state.lastMinimapRender=0;state.lastUiRender=0;
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
 try{
  if(state.frameFaulted)return;
  if(document.hidden){resetFrameClock();return;}
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
    updateFriendlyMovement(movementStep*state.gameSpeed);
    state.movementAccumulator-=movementStep;movementSteps++;
   }
   if(movementSteps===3)state.movementAccumulator=Math.min(state.movementAccumulator,movementStep);
  }
  flushPresentationEffects();
  if(timestamp-state.lastMinimapRender>=400){updateMinimap();state.lastMinimapRender=timestamp;}
  const {ctx,canvas}=state;
  if(!ctx||!canvas)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#0a120a";ctx.fillRect(0,0,canvas.width,canvas.height);
  drawWorld();
  if(timestamp-state.lastUiRender>=160){renderUI();state.lastUiRender=timestamp;}
  drawVignette();
 }catch(error){showRuntimeFault(error);}
 finally{requestAnimationFrame(gameLoop);}
}
