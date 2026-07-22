// ═══════════════════════════════════════════════════════════════
//  MAIN — Bootstrap & Game Loop
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H, CELL, BASE_TICK_INTERVAL,
} from './config.js';
import { TYPE } from './types.js';
import { state } from './state.js';
import { initWorld } from './world/world.js';
import { initStartingKingdom, spawnEntity } from './world/entities.js';
import { initTechTree } from './systems/tech.js';
import { drawNewCard } from './systems/cards.js';
import { addLog } from './systems/events.js';
import { updateSimulation } from './simulation/simulation.js';
import { updateFriendlyMovement } from './simulation/villagers.js';
import { drawWorld, drawVignette } from './rendering/renderer.js';
import { renderUI } from './rendering/ui.js';
import { updateCamera, centerCamera, resize } from './camera.js';
import { setupInput } from './input.js';
import { randInt } from './utils.js';

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

function init() {
    state.canvas = document.getElementById("canvas");
    state.ctx = state.canvas.getContext("2d", { alpha: true });
    state.minimapCanvas = document.getElementById("minimap");
    state.minimapCtx = state.minimapCanvas.getContext("2d");

    resize();
    window.addEventListener("resize", resize);

    // Loading-Anzeige
    state.ctx.fillStyle = "#0a120a";
    state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
    state.ctx.fillStyle = "#fcd34d";
    state.ctx.font = "600 16px monospace";
    state.ctx.textAlign = "center";
    state.ctx.fillText("GENERATING WORLD...", state.canvas.width / 2, state.canvas.height / 2);

    // Terrain-Generierung in nächstem Frame (UI bleibt flüssig)
    requestAnimationFrame(() => {
        initWorld();
        initStartingKingdom();
        initTechTree();

        // Start-Zoom auf Level 2
        state.zoom = 1.0;
        state.zoomTarget = 1.0;
        centerCamera();

        drawNewCard();

        addLog("KINGDOM FOUNDED", "#67e8f9");
        addLog("WELCOME TO ELDRIA", "#facc15");
        addLog("SCROLL TO ZOOM — 3 DETAIL LEVELS", "#a3a3a3");

        setupInput();

        // Erster Raid
        setTimeout(() => {
            if (!state.gameOver) {
                const cx = Math.floor(WORLD_W / 2) + 30;
                const cy = Math.floor(WORLD_H / 2) + 22;
                for (let i = 0; i < 7; i++) {
                    const e = spawnEntity(cx + randInt(-4, 8), cy + randInt(-6, 6), TYPE.GOBLIN);
                    e.anchor = { x: cx, y: cy };
                }
                state.totalRaidsSurvived++;
                addLog("FIRST RAID DETECTED", "#e11d48");
            }
        }, 6200);

        // Hint
        setTimeout(() => {
            const hint = document.getElementById("hint-box");
            document.getElementById("hint-text").innerHTML =
                `Scroll to zoom between 3 detail levels.<br>` +
                `Click to place buildings. Drag to explore.`;
            hint.classList.remove("hidden");
        }, 2100);

        requestAnimationFrame(gameLoop);
    });
}

// ═══════════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════════

function gameLoop(timestamp) {
    if (state.lastFrameTime === 0) state.lastFrameTime = timestamp;

    const deltaTime = timestamp - state.lastFrameTime;
    state.lastFrameTime = timestamp;
    const deltaSeconds = Math.min(deltaTime, 50) / 1000;

    // ── Kamera-Update (Zoom-Smoothing) ───────────────────────
    updateCamera(deltaSeconds);

    // ── Simulationstick ──────────────────────────────────────
    if (!state.isPaused && !state.gameOver && !state.victory) {
        state.tickAccumulator += deltaTime * state.gameSpeed;
        while (state.tickAccumulator >= BASE_TICK_INTERVAL) {
            state.tickAccumulator -= BASE_TICK_INTERVAL;
            updateSimulation();
        }
    }

    // ── Frame-basierte Bewegung ──────────────────────────────
    if (!state.isPaused && !state.gameOver && !state.victory) {
        updateFriendlyMovement(deltaSeconds * state.gameSpeed);
    }

    // ── Rendering ────────────────────────────────────────────
    const { ctx, canvas } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a120a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawWorld();
    renderUI();
    drawVignette();

    requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════

init();
