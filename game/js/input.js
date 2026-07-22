// ── Mouse / Keyboard Handlers ──────────────────────────────────

import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from './config.js';
import { state } from './state.js';
import { clampCamera } from './camera.js';
import { placeCurrentCard, skipCard } from './systems/cards.js';
import { researchTech } from './systems/tech.js';
import { createParticle } from './rendering/particles.js';
import { showBigMessage, renderUI } from './rendering/ui.js';
import { distance } from './utils.js';

export function setupInput() {
    const canvas = state.canvas;

    let isDragging = false;
    let pointerMoved = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;

    canvas.addEventListener("mousedown", e => {
        if (e.button === 0) {
            isDragging = true;
            pointerMoved = false;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            pointerStartX = e.clientX;
            pointerStartY = e.clientY;
        }
    });

    window.addEventListener("mouseup", e => {
        if (isDragging && !pointerMoved && e.button === 0) {
            clickOnCanvas(e);
        }
        isDragging = false;
    });

    canvas.addEventListener("mousemove", e => {
        if (!isDragging) return;

        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        if (Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY) > 6) {
            pointerMoved = true;
        }

        state.camera.x -= dx * 1.6;
        state.camera.y -= dy * 1.6;
        clampCamera();

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener("contextmenu", e => {
        e.preventDefault();
        clickOnCanvas(e);
    });

    // keyboard
    window.addEventListener("keydown", e => {
        if (e.key === "/" && document.getElementById("big-message").classList.contains("hidden")) {
            showHelp();
            e.preventDefault();
        }
        if (e.metaKey && e.key === "k") {
            togglePause();
            e.preventDefault();
        }
    });

    // UI buttons
    document.getElementById("pause-btn").addEventListener("click", togglePause);
    document.getElementById("speed-1").addEventListener("click", () => setSpeed(1));
    document.getElementById("speed-2").addEventListener("click", () => setSpeed(2));
    document.getElementById("speed-4").addEventListener("click", () => setSpeed(4));
    document.getElementById("skip-card-btn").addEventListener("click", skipCard);
    document.getElementById("help-btn").addEventListener("click", showHelp);
    document.getElementById("hint-box").addEventListener("click", dismissHint);

    document.getElementById("card-container").addEventListener("click", () => {
        if (state.currentCard) placeCurrentCard();
    });

    document.getElementById("tab-0").addEventListener("click", () => switchTab(0));
    document.getElementById("tab-1").addEventListener("click", () => switchTab(1));
    document.getElementById("tab-2").addEventListener("click", () => switchTab(2));

    document.getElementById("big-message").addEventListener("click", () => {
        document.getElementById("big-message").classList.add("hidden");
    });
    document.getElementById("big-message-close").addEventListener("click", e => {
        e.stopImmediatePropagation();
        document.getElementById("big-message").classList.add("hidden");
    });

    // tech tree clicks (event delegation)
    document.getElementById("tab-content").addEventListener("click", e => {
        const item = e.target.closest(".tech-item");
        if (item && item.dataset.unlocked === "false") {
            researchTech(item.dataset.techId);
            renderUI();
        }
    });
}

function clickOnCanvas(e) {
    if (state.gameOver || state.isPaused) return;

    const rect = state.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldX = (mx + state.camera.x) / TILE_SIZE;
    const worldY = (my + state.camera.y) / TILE_SIZE;

    const tx = Math.floor(worldX);
    const ty = Math.floor(worldY);

    if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return;

    const clickedEntity = state.entities.find(ent =>
        !ent.dead && ent.isEnemy() && distance(ent.x, ent.y, worldX, worldY) < 0.8
    );

    if (clickedEntity && clickedEntity.isEnemy()) {
        clickedEntity.hp -= 60;
        createParticle(clickedEntity.x * TILE_SIZE + 24, clickedEntity.y * TILE_SIZE + 12, "#ec4899", 30);
        if (clickedEntity.hp < 0) clickedEntity.dead = true;
        return;
    }

    if (state.currentCard) {
        placeCurrentCard(tx, ty);
    }
}

function togglePause() {
    state.isPaused = !state.isPaused;
    const pauseBtn = document.getElementById("pause-btn");
    pauseBtn.style.backgroundColor = state.isPaused ? "#450a0a" : "";
    document.getElementById("pause-text").textContent = state.isPaused ? "PLAY" : "PAUSE";
}

function setSpeed(n) {
    state.gameSpeed = n;
    document.querySelectorAll(".speed-btn").forEach(el => {
        if (parseFloat(el.textContent) === n) {
            el.classList.add("bg-amber-400", "text-black");
        } else {
            el.classList.remove("bg-amber-400", "text-black");
        }
    });
}

function switchTab(n) {
    state.selectedTab = n;
    document.querySelectorAll(".tab-button").forEach((el, i) => {
        if (i === n) {
            el.classList.add("border-b-2", "border-amber-400", "text-amber-400");
        } else {
            el.classList.remove("border-b-2", "border-amber-400", "text-amber-400");
        }
    });
    renderUI();
}

function showHelp() {
    showBigMessage(
        "HOW TO PLAY",
        `• Click the CARD to place buildings<br>
         • Drag the map to explore<br>
         • Survive raids and keep morale high<br>
         • Research technologies to improve your kingdom<br><br>
         <span class="text-amber-400">Build. Protect. Prosper.</span>`,
        6500
    );
}

function dismissHint() {
    document.getElementById("hint-box").classList.add("hidden");
}
