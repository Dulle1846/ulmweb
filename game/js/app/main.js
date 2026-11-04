// Application composition root: initializes the game and connects its modules.

import { WORLD_W, WORLD_H } from '../config.js';
import { TYPE } from '../types.js';
import { state } from '../state.js';
import { initWorld } from '../world/world.js';
import { initStartingKingdom, spawnEntity } from '../world/entities.js';
import { initTechTree } from '../systems/tech.js';
import { drawNewCard } from '../systems/cards.js';
import { addLog } from '../systems/events.js';
import { startGameLoop } from './game-loop.js';
import { centerCamera, resize } from '../camera.js';
import { setupInput } from '../input.js';
import { randInt } from '../utils.js';

function init() {
    state.canvas = document.getElementById("canvas");
    state.ctx = state.canvas.getContext("2d", { alpha: true });
    state.minimapCanvas = document.getElementById("minimap");
    state.minimapCtx = state.minimapCanvas.getContext("2d");

    resize();
    window.addEventListener("resize", resize);

    state.ctx.fillStyle = "#0a120a";
    state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
    state.ctx.fillStyle = "#fcd34d";
    state.ctx.font = "600 16px monospace";
    state.ctx.textAlign = "center";
    state.ctx.fillText("GENERATING WORLD...", state.canvas.width / 2, state.canvas.height / 2);

    requestAnimationFrame(() => {
        initWorld();
        initStartingKingdom();
        initTechTree();

        state.zoom = 1.0;
        state.zoomTarget = 1.0;
        centerCamera();

        drawNewCard();

        addLog("KINGDOM FOUNDED", "#67e8f9");
        addLog("WELCOME TO ELDRIA", "#facc15");
        addLog("SCROLL TO ZOOM — 3 DETAIL LEVELS", "#a3a3a3");

        setupInput();

        // First scripted raid.
        setTimeout(() => {
            if (!state.gameOver) {
                const cx = Math.floor(WORLD_W / 2) + 30;
                const cy = Math.floor(WORLD_H / 2) + 22;
                state.raidActive = true;

                for (let i = 0; i < 7; i++) {
                    const enemy = spawnEntity(
                        cx + randInt(-4, 8),
                        cy + randInt(-6, 6),
                        TYPE.GOBLIN
                    );
                    enemy.anchor = { x: cx, y: cy };
                }

                addLog("FIRST RAID DETECTED", "#e11d48");
            }
        }, 6200);

        setTimeout(() => {
            const hint = document.getElementById("hint-box");
            document.getElementById("hint-text").innerHTML =
                `Scroll to zoom between 3 detail levels.<br>` +
                `Click to place buildings. Drag to explore.`;
            hint.classList.remove("hidden");
        }, 2100);

        startGameLoop();
    });
}

init();
