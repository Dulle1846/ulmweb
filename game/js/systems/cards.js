// ── Card Deck & Placement ──────────────────────────────────────

import { TYPE } from '../types.js';
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, BUILDING_SIZE } from '../config.js';
import { state } from '../state.js';
import { spawnEntity, buildingOverlaps } from '../world/entities.js';
import { revealArea, isWaterAt } from '../world/world.js';
import { canAfford, payForCard } from './resources.js';
import { createParticle, createFloater } from '../rendering/particles.js';
import { renderUI } from '../rendering/ui.js';
import { rand, randInt } from '../utils.js';

export const CARD_DECK = [
    { type: TYPE.HOUSE,    name: "COTTAGE",        desc: "Houses 3 villagers. +1 morale",       cost: { wood: 30, stone: 10 },              icon: "🏠" },
    { type: TYPE.FARM,     name: "FARMSTEAD",      desc: "Generates food every season",         cost: { wood: 25, food: 5 },                icon: "🌾" },
    { type: TYPE.LUMBER,   name: "LUMBERYARD",     desc: "Steady wood production",              cost: { gold: 15 },                         icon: "🪵" },
    { type: TYPE.QUARRY,   name: "STONE QUARRY",   desc: "Stone & occasional gold",             cost: { wood: 35, food: 15 },               icon: "⛰️" },
    { type: TYPE.TOWER,    name: "WATCHTOWER",     desc: "Long range defense",                  cost: { wood: 40, stone: 30 },              icon: "🏰" },
    { type: TYPE.WALL,     name: "FORTIFIED WALL", desc: "Strong barrier vs raiders",            cost: { stone: 45 },                        icon: "🧱" },
    { type: TYPE.TAVERN,   name: "THE TAVERN",     desc: "Boosts morale and gold",              cost: { wood: 55, gold: 25, food: 15 },     icon: "🍺" },
    { type: TYPE.TEMPLE,   name: "HOLY TEMPLE",    desc: "Increases morale & heals",            cost: { stone: 60, gold: 35 },              icon: "⛪" },
    { type: TYPE.BARRACKS, name: "BARRACKS",       desc: "Trains guards & knights",             cost: { wood: 45, stone: 35 },              icon: "🛡️" },
    { type: TYPE.MILL,     name: "WATER MILL",     desc: "Boosts nearby farms",                 cost: { wood: 65, stone: 20 },              icon: "⚙️" },
    { type: TYPE.STABLE,   name: "STABLES",        desc: "Breeds war horses for knights",       cost: { wood: 50, food: 40 },               icon: "🐎" },
    { type: TYPE.KNIGHT,   name: "ROYAL KNIGHT",   desc: "Powerful mounted warrior",            cost: { gold: 45, food: 25 },               icon: "🗡️", unit: true },
    { type: TYPE.PRIEST,   name: "SHRINE PRIEST",  desc: "Heals allies, boosts morale",         cost: { gold: 30, food: 20 },               icon: "🙏", unit: true },
];

export function drawNewCard() {
    if (state.availableCards.length === 0) {
        state.availableCards = [...CARD_DECK];
    }

    const idx = randInt(0, state.availableCards.length);
    state.currentCard = state.availableCards[idx];
    state.availableCards.splice(idx, 1);

    // occasionally give a free unit card
    if (Math.random() < 0.2 && state.currentCard.unit !== true) {
        state.currentCard = CARD_DECK.find(c => c.unit) || state.currentCard;
    }

    renderUI();
}

export function skipCard() {
    if (state.resources.gold < 3) {
        createFloater(280, 180, "NEED 3 GOLD", "#fda4af");
        return;
    }
    state.resources.gold -= 3;
    drawNewCard();
    createFloater(280, 180, "CARD SKIPPED", "#a5b4fc");
}

function hasBuildableTerrain(tx, ty, type) {
    const size = BUILDING_SIZE[type] || { w: 1, h: 1 };
    const left = tx + 0.5 - size.w / 2;
    const right = tx + 0.5 + size.w / 2;
    const top = ty + 0.5 - size.h / 2;
    const bottom = ty + 0.5 + size.h / 2;

    if (left < 0 || top < 0 || right > WORLD_WIDTH || bottom > WORLD_HEIGHT) return false;

    for (let x = Math.floor(left); x < right; x++) {
        for (let y = Math.floor(top); y < bottom; y++) {
            const sampleX = (Math.max(left, x) + Math.min(right, x + 1)) / 2;
            const sampleY = (Math.max(top, y) + Math.min(bottom, y + 1)) / 2;
            if (isWaterAt(sampleX, sampleY)) return false;
        }
    }

    return true;
}

function findNearestBuildableTile(centerX, centerY) {
    for (let radius = 0; radius <= 12; radius++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
            for (let offsetY = -radius; offsetY <= radius; offsetY++) {
                if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue;

                const tx = centerX + offsetX;
                const ty = centerY + offsetY;
                if (!hasBuildableTerrain(tx, ty, state.currentCard.type)) continue;
                if (buildingOverlaps(tx, ty, state.currentCard.type)) continue;
                return { tx, ty };
            }
        }
    }
    return null;
}

export function placeCurrentCard(targetX, targetY) {
    if (!state.currentCard || state.gameOver) return;

    const canvas = state.canvas;
    const camera = state.camera;

    const fallbackX = Math.floor((camera.x + canvas.width / 2) / (TILE_SIZE * state.zoom));
    const fallbackY = Math.floor((camera.y + canvas.height / 2) / (TILE_SIZE * state.zoom));

    const requestedTile = Number.isInteger(targetX) && Number.isInteger(targetY)
        ? { tx: targetX, ty: targetY }
        : findNearestBuildableTile(fallbackX, fallbackY);

    if (!requestedTile) {
        createFloater(fallbackX * TILE_SIZE, fallbackY * TILE_SIZE, "NO SPACE NEARBY", "#f59e0b");
        return;
    }

    const { tx, ty } = requestedTile;

    if (!hasBuildableTerrain(tx, ty, state.currentCard.type)) {
        createFloater(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE, "CANNOT BUILD HERE", "#f59e0b");
        return;
    }

    if (buildingOverlaps(tx, ty, state.currentCard.type)) {
        createFloater(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE, "SPACE OCCUPIED", "#f59e0b");
        return;
    }

    if (!canAfford(state.currentCard)) {
        createFloater(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE, "CANNOT AFFORD", "#f43f5e");
        return;
    }

    payForCard(state.currentCard);
    spawnEntity(tx, ty, state.currentCard.type);

    // Cottages bring new residents
    if (state.currentCard.type === TYPE.HOUSE) {
        for (let k = 0; k < 3; k++) {
            const v = spawnEntity(tx + randInt(-2, 2), ty + randInt(-2, 2), TYPE.VILLAGER);
            v.home = { x: tx, y: ty };
        }
    }

    for (let k = 0; k < 18; k++) {
        createParticle(
            tx * TILE_SIZE + rand(0, TILE_SIZE),
            ty * TILE_SIZE + rand(0, TILE_SIZE),
            "#fde047", 32, rand(-2.5, 2.5), rand(-4, -0.6), 5
        );
    }

    createFloater(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + 10, "BUILT!", "#a3e635");
    revealArea(tx, ty, 9);
    drawNewCard();
    renderUI();
}
