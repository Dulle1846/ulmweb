// Browser input: camera navigation, card drag-and-drop and interface commands.

import { WORLD_W, WORLD_H, CELL } from '../core/config.js';
import { state } from '../core/state.js';
import { clampCamera, applyZoomDelta, screenToWorld, setZoomLevel } from './camera.js';
import { placeCurrentCard, skipCard, getCardPlacementPreview } from '../systems/cards.js';
import { researchTech } from '../systems/tech.js';
import { createParticle } from './rendering/particles.js';
import { showBigMessage, renderUI } from './rendering/ui.js';
import { distance } from '../core/utils.js';

export function setupInput() {
    const canvas = state.canvas;
    const cardContainer = document.getElementById("card-container");
    const dragGhost = document.getElementById("card-drag-ghost");
    const placementStatus = document.getElementById("placement-status");

    let isPanning = false;
    let pointerMoved = false;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let cardPointerId = null;
    let lastPinchDistance = 0;

    // Mouse wheel: zoom to the pointer rather than to the world centre.
    canvas.addEventListener("wheel", event => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        applyZoomDelta(event.deltaY, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    // Mouse panning. A click without movement remains a world interaction.
    canvas.addEventListener("mousedown", event => {
        if (event.button !== 0) return;
        isPanning = true;
        pointerMoved = false;
        lastX = startX = event.clientX;
        lastY = startY = event.clientY;
    });

    window.addEventListener("mouseup", event => {
        if (isPanning && !pointerMoved && event.button === 0) {
            clickOnCanvas(event);
        }
        isPanning = false;
    });

    canvas.addEventListener("mousemove", event => {
        if (!isPanning) return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;

        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) {
            pointerMoved = true;
        }

        state.camera.x -= dx;
        state.camera.y -= dy;
        clampCamera();
        lastX = event.clientX;
        lastY = event.clientY;
    });

    canvas.addEventListener("contextmenu", event => {
        event.preventDefault();
        clickOnCanvas(event);
    });

    // Touch navigation and pinch zoom.
    canvas.addEventListener("touchstart", event => {
        event.preventDefault();
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            isPanning = true;
            pointerMoved = false;
            lastX = startX = touch.clientX;
            lastY = startY = touch.clientY;
            lastPinchDistance = 0;
        } else if (event.touches.length === 2) {
            const [a, b] = event.touches;
            lastPinchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            isPanning = false;
        }
    }, { passive: false });

    canvas.addEventListener("touchmove", event => {
        event.preventDefault();
        if (event.touches.length === 1 && isPanning) {
            const touch = event.touches[0];
            const dx = touch.clientX - lastX;
            const dy = touch.clientY - lastY;

            if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 5) {
                pointerMoved = true;
            }

            state.camera.x -= dx;
            state.camera.y -= dy;
            clampCamera();
            lastX = touch.clientX;
            lastY = touch.clientY;
        } else if (event.touches.length === 2) {
            const [a, b] = event.touches;
            const distanceNow = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

            if (lastPinchDistance > 0) {
                const rect = canvas.getBoundingClientRect();
                const centerX = (a.clientX + b.clientX) / 2 - rect.left;
                const centerY = (a.clientY + b.clientY) / 2 - rect.top;
                applyZoomDelta((lastPinchDistance - distanceNow) * 0.5, centerX, centerY);
            }
            lastPinchDistance = distanceNow;
        }
    }, { passive: false });

    canvas.addEventListener("touchend", event => {
        if (event.touches.length === 0) {
            if (isPanning && !pointerMoved) {
                clickOnCanvas({ clientX: lastX, clientY: lastY });
            }
            isPanning = false;
            lastPinchDistance = 0;
        } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            lastX = startX = touch.clientX;
            lastY = startY = touch.clientY;
            isPanning = true;
        }
    });

    // Drag a card out of the sidebar and drop it on the map.
    cardContainer.addEventListener("pointerdown", event => {
        if (event.button !== 0 || !state.currentCard || state.gameOver || state.isPaused) return;
        event.preventDefault();
        cardPointerId = event.pointerId;
        cardContainer.classList.add("is-dragging");
        document.body.classList.add("card-dragging");
        dragGhost.classList.add("is-visible");
        document.getElementById("drag-ghost-icon").textContent = state.currentCard.icon;
        document.getElementById("drag-ghost-name").textContent = state.currentCard.name;
        updateCardDrag(event);
    });

    window.addEventListener("pointermove", event => {
        if (cardPointerId !== event.pointerId) return;
        updateCardDrag(event);
    });

    window.addEventListener("pointerup", event => {
        if (cardPointerId !== event.pointerId) return;

        updateCardDrag(event);
        const rect = canvas.getBoundingClientRect();
        const insideCanvas = event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;

        if (insideCanvas && state.cardPreview) {
            placeCurrentCard(state.cardPreview.tx, state.cardPreview.ty);
        }
        endCardDrag();
    });

    window.addEventListener("pointercancel", event => {
        if (cardPointerId === event.pointerId) endCardDrag();
    });

    window.addEventListener("keydown", event => {
        if (event.key === "Escape" && cardPointerId !== null) {
            endCardDrag();
            return;
        }
        if (event.key === "/" && document.getElementById("big-message").classList.contains("hidden")) {
            showHelp();
            event.preventDefault();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            togglePause();
            event.preventDefault();
        }
        if (event.key === "+" || event.key === "=") {
            applyZoomDelta(-100, canvas.width / 2, canvas.height / 2);
        }
        if (event.key === "-") {
            applyZoomDelta(100, canvas.width / 2, canvas.height / 2);
        }
        if (event.key >= "1" && event.key <= "4" && !event.ctrlKey && !event.metaKey) {
            setZoomLevel(Number(event.key));
        }
    });

    // Header controls.
    document.getElementById("pause-btn").addEventListener("click", togglePause);
    document.getElementById("speed-1").addEventListener("click", () => setSpeed(1));
    document.getElementById("speed-2").addEventListener("click", () => setSpeed(2));
    document.getElementById("speed-4").addEventListener("click", () => setSpeed(4));
    document.getElementById("zoom-in").addEventListener("click", () => {
        applyZoomDelta(-100, canvas.width / 2, canvas.height / 2);
    });
    document.getElementById("zoom-out").addEventListener("click", () => {
        applyZoomDelta(100, canvas.width / 2, canvas.height / 2);
    });
    document.querySelectorAll(".zoom-preset").forEach(button => {
        button.addEventListener("click", () => setZoomLevel(Number(button.dataset.zoomLevel)));
    });

    document.getElementById("skip-card-btn").addEventListener("click", skipCard);
    document.getElementById("help-btn").addEventListener("click", showHelp);
    document.getElementById("hint-box").addEventListener("click", dismissHint);

    document.getElementById("tab-0").addEventListener("click", () => switchTab(0));
    document.getElementById("tab-1").addEventListener("click", () => switchTab(1));
    document.getElementById("tab-2").addEventListener("click", () => switchTab(2));

    document.getElementById("big-message").addEventListener("click", () => {
        document.getElementById("big-message").classList.add("hidden");
    });
    document.getElementById("big-message-close").addEventListener("click", event => {
        event.stopImmediatePropagation();
        document.getElementById("big-message").classList.add("hidden");
    });

    document.getElementById("tab-content").addEventListener("click", event => {
        const item = event.target.closest(".tech-item");
        if (item && item.dataset.unlocked === "false") {
            researchTech(item.dataset.techId);
            renderUI();
        }
    });

    function updateCardDrag(event) {
        const canvasRect = canvas.getBoundingClientRect();
        const insideCanvas = event.clientX >= canvasRect.left && event.clientX <= canvasRect.right &&
            event.clientY >= canvasRect.top && event.clientY <= canvasRect.bottom;

        dragGhost.style.left = `${event.clientX + 18}px`;
        dragGhost.style.top = `${event.clientY + 18}px`;

        if (insideCanvas) {
            const world = screenToWorld(
                event.clientX - canvasRect.left,
                event.clientY - canvasRect.top
            );
            state.cardPreview = getCardPlacementPreview(Math.floor(world.x), Math.floor(world.y));
        } else {
            state.cardPreview = null;
        }

        if (placementStatus) {
            placementStatus.textContent = state.cardPreview
                ? (state.cardPreview.valid ? "RELEASE TO BUILD" : state.cardPreview.reason)
                : "DROP ON THE WORLD MAP";
            if (state.cardPreview) {
                placementStatus.dataset.valid = String(state.cardPreview.valid);
            } else {
                delete placementStatus.dataset.valid;
            }
        }
    }

    function endCardDrag() {
        cardPointerId = null;
        state.cardPreview = null;
        cardContainer.classList.remove("is-dragging");
        document.body.classList.remove("card-dragging");
        dragGhost.classList.remove("is-visible");
        if (placementStatus) {
            placementStatus.textContent = "DRAG A CARD ONTO THE MAP";
            delete placementStatus.dataset.valid;
        }
    }
}

function clickOnCanvas(event) {
    if (state.gameOver || state.isPaused) return;

    const rect = state.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);
    const tx = Math.floor(world.x);
    const ty = Math.floor(world.y);

    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;

    const clickedEnemy = state.entities.find(entity =>
        !entity.dead && entity.isEnemy() &&
        distance(entity.x, entity.y, world.x, world.y) < 0.8
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

    if (state.currentCard) {
        placeCurrentCard(tx, ty);
    }
}

function togglePause() {
    state.isPaused = !state.isPaused;
    document.getElementById("pause-btn").classList.toggle("is-paused", state.isPaused);
    document.getElementById("pause-text").textContent = state.isPaused ? "RESUME" : "PAUSE";
}

function setSpeed(speed) {
    state.gameSpeed = speed;
    document.querySelectorAll(".speed-button").forEach(button => {
        button.classList.toggle("is-active", Number(button.dataset.speed) === speed);
    });
}

function switchTab(tab) {
    state.selectedTab = tab;
    document.querySelectorAll(".tab-button").forEach((button, index) => {
        button.classList.toggle("is-active", index === tab);
    });
    renderUI();
}

function showHelp() {
    showBigMessage(
        "HOW TO PLAY",
        `• Scroll to zoom through four detail levels<br>
         • Drag a card onto the map to preview and place it<br>
         • Drag the map to explore the realm<br>
         • Press 1–4 to jump between zoom levels<br>
         • Survive raids and keep morale high<br><br>
         <strong>Build. Protect. Prosper.</strong>`,
        6500
    );
}

function dismissHint() {
    document.getElementById("hint-box").classList.add("hidden");
}
