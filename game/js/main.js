// ── Bootstrap & Game Loop ──────────────────────────────────────

import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, BASE_TICK_INTERVAL } from './config.js';
import { TYPE } from './types.js';
import { state } from './state.js';
import { initWorld } from './world/world.js';
import { initStartingKingdom, spawnEntity } from './world/entities.js';
import { initTechTree } from './systems/tech.js';
import { drawNewCard } from './systems/cards.js';
import { addLog } from './systems/events.js';
import { updateSimulation } from './simulation/simulation.js';
import { drawWorld, drawVignette } from './rendering/renderer.js';
import { renderUI } from './rendering/ui.js';
import { centerCamera, resize } from './camera.js';
import { setupInput } from './input.js';
import { randInt } from './utils.js';

function init() {
    state.canvas      = document.getElementById("canvas");
    state.ctx          = state.canvas.getContext("2d", { alpha: true });
    state.minimapCanvas = document.getElementById("minimap");
    state.minimapCtx   = state.minimapCanvas.getContext("2d");

    resize();
    window.addEventListener("resize", resize);

    initWorld();
    initStartingKingdom();
    initTechTree();
    centerCamera();
    drawNewCard();

    // initial log entries
    addLog("KINGDOM FOUNDED", "#67e8f9");
    addLog("WELCOME TO ELDRIA", "#facc15");
    addLog("DRAW YOUR FIRST CARD", "#a3a3a3");

    setupInput();

    // demo enemy raid after some time
    setTimeout(() => {
        if (!state.gameOver) {
            const cx = Math.floor(WORLD_WIDTH / 2) + 30;
            const cy = Math.floor(WORLD_HEIGHT / 2) + 22;
            for (let i = 0; i < 7; i++) {
                spawnEntity(cx + randInt(-4, 8), cy + randInt(-6, 6), TYPE.GOBLIN);
            }
            state.totalRaidsSurvived++;
            addLog("FIRST RAID DETECTED", "#e11d48");
        }
    }, 6200);

    // demo hint
    setTimeout(() => {
        const hint = document.getElementById("hint-box");
        document.getElementById("hint-text").innerHTML =
            `Click anywhere on the map while holding a card to place buildings.<br><br>Drag to explore the wilderness.`;
        hint.classList.remove("hidden");
    }, 2100);

    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    if (state.lastFrameTime === 0) state.lastFrameTime = timestamp;
    const deltaTime = timestamp - state.lastFrameTime;
    state.lastFrameTime = timestamp;

    if (!state.isPaused && !state.gameOver && !state.victory) {
        state.tickAccumulator += deltaTime * state.gameSpeed;
        while (state.tickAccumulator >= BASE_TICK_INTERVAL) {
            state.tickAccumulator -= BASE_TICK_INTERVAL;
            updateSimulation();
        }
    }

    const { ctx, canvas } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a120a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawWorld();
    renderUI();
    drawVignette();

    requestAnimationFrame(gameLoop);
}

// start
init();
