// Presentation/runtime loop. It schedules frames and advances the simulation clock.

import { BASE_TICK_INTERVAL } from '../core/config.js';
import { state } from '../core/state.js';
import { consumeSimulationTime } from '../core/simulation-clock.js';
import { updateSimulation } from '../simulation/simulation.js';
import { updateFriendlyMovement } from '../simulation/villagers.js';
import { drawWorld, drawVignette } from '../presentation/rendering/renderer.js';
import { renderUI } from '../presentation/rendering/ui.js';
import { updateCamera } from '../presentation/camera.js';

export function startGameLoop() {
    state.lastFrameTime = 0;
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    if (state.lastFrameTime === 0) state.lastFrameTime = timestamp;

    const deltaTime = Math.max(0, timestamp - state.lastFrameTime);
    state.lastFrameTime = timestamp;
    const deltaSeconds = Math.min(deltaTime, 50) / 1000;

    updateCamera(deltaSeconds);

    if (!state.isPaused && !state.gameOver && !state.victory) {
        const clock = consumeSimulationTime(
            state.tickAccumulator,
            deltaTime,
            state.gameSpeed,
            BASE_TICK_INTERVAL
        );

        state.tickAccumulator = clock.remainderMs;
        for (let step = 0; step < clock.steps; step++) {
            updateSimulation();
        }
    }

    if (!state.isPaused && !state.gameOver && !state.victory) {
        updateFriendlyMovement(deltaSeconds * state.gameSpeed);
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
