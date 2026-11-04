// ═══════════════════════════════════════════════════════════════
//  INPUT — Maus, Tastatur, Zoom-Mausrad
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, CELL } from './config.js';
import { state } from './state.js';
import { clampCamera, applyZoomDelta, screenToWorld } from './camera.js';
import { placeCurrentCard, skipCard } from './systems/cards.js';
import { researchTech } from './systems/tech.js';
import { createParticle } from './rendering/particles.js';
import { showBigMessage, renderUI } from './rendering/ui.js';
import { distance } from './utils.js';

export function setupInput() {
    const canvas = state.canvas;

    // ── Drag-State ───────────────────────────────────────────
    let isDragging = false;
    let pointerMoved = false;
    let lastMX = 0, lastMY = 0;
    let startMX = 0, startMY = 0;

    // ── Mausrad → Zoom ───────────────────────────────────────
    canvas.addEventListener("wheel", e => {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        applyZoomDelta(e.deltaY, mx, my);
    }, { passive: false });

    // ── Drag-Start ───────────────────────────────────────────
    canvas.addEventListener("mousedown", e => {
        if (e.button === 0) {
            isDragging = true;
            pointerMoved = false;
            lastMX = e.clientX;
            lastMY = e.clientY;
            startMX = e.clientX;
            startMY = e.clientY;
        }
    });

    // ── Drag-Ende ────────────────────────────────────────────
    window.addEventListener("mouseup", e => {
        if (isDragging && !pointerMoved && e.button === 0) {
            clickOnCanvas(e);
        }
        isDragging = false;
    });

    // ── Drag-Bewegung ────────────────────────────────────────
    canvas.addEventListener("mousemove", e => {
        if (!isDragging) return;

        const dx = e.clientX - lastMX;
        const dy = e.clientY - lastMY;

        if (Math.hypot(e.clientX - startMX, e.clientY - startMY) > 6) {
            pointerMoved = true;
        }

        // Drag-Geschwindigkeit ist unabhängig vom Zoom
        state.camera.x -= dx;
        state.camera.y -= dy;
        clampCamera();

        lastMX = e.clientX;
        lastMY = e.clientY;
    });

    // ── Rechtsklick ──────────────────────────────────────────
    canvas.addEventListener("contextmenu", e => {
        e.preventDefault();
        clickOnCanvas(e);
    });

    // ── Touch-Support (Pinch-Zoom + Drag) ────────────────────
    let touches = [];
    let lastPinchDist = 0;

    canvas.addEventListener("touchstart", e => {
        e.preventDefault();
        touches = [...e.touches];
        if (touches.length === 1) {
            isDragging = true;
            pointerMoved = false;
            lastMX = touches[0].clientX;
            lastMY = touches[0].clientY;
            startMX = lastMX;
            startMY = lastMY;
        } else if (touches.length === 2) {
            lastPinchDist = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
        }
    }, { passive: false });

    canvas.addEventListener("touchmove", e => {
        e.preventDefault();
        const ts = [...e.touches];

        if (ts.length === 1 && isDragging) {
            const dx = ts[0].clientX - lastMX;
            const dy = ts[0].clientY - lastMY;
            if (Math.hypot(ts[0].clientX - startMX, ts[0].clientY - startMY) > 6) {
                pointerMoved = true;
            }
            state.camera.x -= dx;
            state.camera.y -= dy;
            clampCamera();
            lastMX = ts[0].clientX;
            lastMY = ts[0].clientY;
        } else if (ts.length === 2) {
            const dist = Math.hypot(
                ts[0].clientX - ts[1].clientX,
                ts[0].clientY - ts[1].clientY
            );
            if (lastPinchDist > 0) {
                const rect = canvas.getBoundingClientRect();
                const cx = (ts[0].clientX + ts[1].clientX) / 2 - rect.left;
                const cy = (ts[0].clientY + ts[1].clientY) / 2 - rect.top;
                const delta = (lastPinchDist - dist) * 3;
                applyZoomDelta(delta, cx, cy);
            }
            lastPinchDist = dist;
        }
    }, { passive: false });

    canvas.addEventListener("touchend", e => {
        if (e.touches.length === 0) {
            if (isDragging && !pointerMoved) {
                const fakeEvent = { clientX: lastMX, clientY: lastMY };
                clickOnCanvas(fakeEvent);
            }
            isDragging = false;
            lastPinchDist = 0;
        }
        touches = [...e.touches];
    });

    // ── Tastatur ─────────────────────────────────────────────
    window.addEventListener("keydown", e => {
        if (e.key === "/" && document.getElementById("big-message").classList.contains("hidden")) {
            showHelp();
            e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            togglePause();
            e.preventDefault();
        }
        // +/- zum Zoomen
        if (e.key === "+" || e.key === "=") {
            applyZoomDelta(-120, state.canvas.width / 2, state.canvas.height / 2);
        }
        if (e.key === "-") {
            applyZoomDelta(120, state.canvas.width / 2, state.canvas.height / 2);
        }
    });

    // ── UI-Buttons ───────────────────────────────────────────
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

    document.getElementById("tab-content").addEventListener("click", e => {
        const item = e.target.closest(".tech-item");
        if (item && item.dataset.unlocked === "false") {
            researchTech(item.dataset.techId);
            renderUI();
        }
    });
}

// ═══════════════════════════════════════════════════════════════
//  KLICK-VERARBEITUNG
// ═══════════════════════════════════════════════════════════════

function clickOnCanvas(e) {
    if (state.gameOver || state.isPaused) return;

    const rect = state.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const world = screenToWorld(mx, my);
    const tx = Math.floor(world.x);
    const ty = Math.floor(world.y);

    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;

    // Feind angreifen
    const clickedEnemy = state.entities.find(ent =>
        !ent.dead && ent.isEnemy() && distance(ent.x, ent.y, world.x, world.y) < 0.8
    );

    if (clickedEnemy) {
        clickedEnemy.hp -= 60;
        createParticle(
            clickedEnemy.x * CELL + 24,
            clickedEnemy.y * CELL + 12,
            "#ec4899", 30
        );
        if (clickedEnemy.hp <= 0) clickedEnemy.dead = true;
        return;
    }

    // Karte platzieren
    if (state.currentCard) {
        placeCurrentCard(tx, ty);
    }
}

// ═══════════════════════════════════════════════════════════════
//  UI-STEUERUNG
// ═══════════════════════════════════════════════════════════════

function togglePause() {
    state.isPaused = !state.isPaused;
    document.getElementById("pause-btn").style.backgroundColor = state.isPaused ? "#450a0a" : "";
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
        `• Scroll to zoom in/out (3 visual levels)<br>
         • Click to place buildings from your card<br>
         • Drag to explore the wilderness<br>
         • Survive raids and keep morale high<br><br>
         <span class="text-amber-400">Build. Protect. Prosper.</span>`,
        6500
    );
}

function dismissHint() {
    document.getElementById("hint-box").classList.add("hidden");
}
