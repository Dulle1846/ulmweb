// DOM presentation for kingdom resources, cards, statistics and research.

import { SEASONS } from '../../core/config.js';
import { TYPE } from '../../core/types.js';
import { state } from '../../core/state.js';
import { getEntitiesOfType } from '../../world/entities.js';

let messageTimeout = null;
let lastTabSignature = null;

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function formatIncome(value) {
    if (!Number.isFinite(value) || value === 0) return "";
    return value > 0 ? "+" + value : String(value);
}

function updateCostElement(id, amount) {
    const element = document.getElementById(id);
    if (!element) return;
    element.style.display = amount > 0 ? "inline-flex" : "none";
    const value = element.querySelector("span:nth-child(2)");
    if (value) value.textContent = String(amount || 0);
}

export function showBigMessage(title, subtitle, timeout = 1800) {
    const overlay = document.getElementById("big-message");
    document.getElementById("big-title").innerHTML = title;
    document.getElementById("big-subtitle").innerHTML = subtitle;
    overlay.classList.remove("hidden");
    clearTimeout(messageTimeout);

    if (timeout > 0) {
        messageTimeout = setTimeout(() => overlay.classList.add("hidden"), timeout);
    }
}

export function renderUI() {
    setText("res-wood", Math.floor(state.resources.wood).toLocaleString("en-US"));
    setText("res-stone", Math.floor(state.resources.stone).toLocaleString("en-US"));
    setText("res-gold", Math.floor(state.resources.gold).toLocaleString("en-US"));
    setText("res-food", Math.floor(state.resources.food).toLocaleString("en-US"));

    setText("wood-income", formatIncome(state.incomeThisTick.wood));
    setText("stone-income", formatIncome(state.incomeThisTick.stone));
    setText("gold-income", formatIncome(state.incomeThisTick.gold));
    setText("food-income", formatIncome(state.incomeThisTick.food));

    const moraleBar = document.getElementById("morale-bar");
    moraleBar.style.width = Math.max(0, Math.min(100, state.morale)) + "%";
    moraleBar.classList.toggle("is-low", state.morale < 30);
    setText("morale-value", Math.floor(state.morale));

    setText("season", SEASONS[state.seasonIndex] || SEASONS[0]);
    setText("year", "YEAR " + state.year);
    setText("tick-count", state.tick.toLocaleString("en-US"));

    const villagers = getEntitiesOfType(TYPE.VILLAGER).length;
    const houses = getEntitiesOfType(TYPE.HOUSE).length;
    document.getElementById("population").innerHTML =
        "POP <strong>" + villagers + "</strong> / " + (houses * 4);

    const card = state.currentCard;
    const cardContainer = document.getElementById("card-container");
    if (card) {
        setText("card-icon", card.icon);
        setText("card-name", card.name);
        setText("card-desc", card.desc);
        updateCostElement("card-cost-wood", card.cost.wood || 0);
        updateCostElement("card-cost-stone", card.cost.stone || 0);
        updateCostElement("card-cost-gold", card.cost.gold || 0);
        const affordable = Object.entries(card.cost).every(([resource, amount]) =>
            (state.resources[resource] || 0) >= amount
        );
        cardContainer.classList.toggle("is-unavailable", !affordable);
        cardContainer.setAttribute("aria-label", "Drag " + card.name + " onto a valid map tile to build");
    } else {
        setText("card-icon", "—");
        setText("card-name", "NO CARD");
        setText("card-desc", "Your deck is empty.");
        updateCostElement("card-cost-wood", 0);
        updateCostElement("card-cost-stone", 0);
        updateCostElement("card-cost-gold", 0);
    }

    const zoomLabels = ["", "LANDSCAPE", "DISTRICTS", "ROOFTOPS", "INTERIORS"];
    setText("zoom-level-name", zoomLabels[state.zoomLevel] || "ROOFTOPS");
    setText("zoom-value", "×" + state.zoom.toFixed(2));
    document.querySelectorAll(".zoom-preset").forEach(button => {
        button.classList.toggle("is-active", Number(button.dataset.zoomLevel) === state.zoomLevel);
    });

    document.querySelectorAll(".speed-button").forEach(button => {
        button.classList.toggle("is-active", Number(button.dataset.speed) === state.gameSpeed);
    });
    document.getElementById("pause-btn").classList.toggle("is-paused", state.isPaused);
    setText("pause-text", state.isPaused ? "RESUME" : "PAUSE");

    renderTabContent();
}

function getTabSignature() {
    if (state.selectedTab === 0) {
        return "events|" + state.eventLog.map(entry =>
            [entry.tick, entry.color, entry.text].join(":")
        ).join("|");
    }

    if (state.selectedTab === 1) {
        const buildings = state.entities.filter(entity => entity.isBuilding() && !entity.dead).length;
        const military = state.entities.filter(entity =>
            [TYPE.GUARD, TYPE.KNIGHT, TYPE.ARCHER].includes(entity.type) && !entity.dead
        ).length;
        return [
            "stats", buildings, military, state.totalRaidsSurvived,
            Math.floor(state.resources.research), Math.floor(state.morale),
            state.weather, state.incomeThisTick.wood, state.incomeThisTick.stone,
            state.incomeThisTick.gold, state.incomeThisTick.food
        ].join("|");
    }

    return "tech|" + state.techs.map(tech =>
        [tech.id, tech.cost, tech.effect, state.unlockedTechs.has(tech.id)].join(":")
    ).join("|");
}

function renderTabContent() {
    const container = document.getElementById("tab-content");
    const signature = getTabSignature();
    if (signature === lastTabSignature) return;
    lastTabSignature = signature;

    if (state.selectedTab === 0) {
        const rows = state.eventLog.map(entry =>
            '<div class="event-row" style="--event-color:' + escapeHtml(entry.color || "#9c947e") + '">' +
                '<span class="event-tick">' + Number(entry.tick).toLocaleString("en-US") + '</span>' +
                '<span>' + escapeHtml(entry.text) + '</span>' +
            '</div>'
        ).join("");
        container.innerHTML = rows
            ? '<div class="event-list">' + rows + '</div>'
            : '<div class="empty-state">No events recorded yet.</div>';
        return;
    }

    if (state.selectedTab === 1) {
        const buildings = state.entities.filter(entity => entity.isBuilding() && !entity.dead).length;
        const military = state.entities.filter(entity =>
            [TYPE.GUARD, TYPE.KNIGHT, TYPE.ARCHER].includes(entity.type) && !entity.dead
        ).length;
        const stats = [
            ["BUILDINGS", buildings],
            ["MILITARY", military],
            ["RAIDS SURVIVED", state.totalRaidsSurvived],
            ["RESEARCH", Math.floor(state.resources.research)],
            ["MORALE", Math.floor(state.morale)],
            ["WEATHER", String(state.weather).toUpperCase()]
        ];
        const cells = stats.map(item =>
            '<div class="stat-cell"><div class="stat-label">' + item[0] + '</div>' +
            '<div class="stat-value">' + escapeHtml(item[1]) + '</div></div>'
        ).join("");
        const production = [
            ["WOOD", state.incomeThisTick.wood],
            ["STONE", state.incomeThisTick.stone],
            ["GOLD", state.incomeThisTick.gold],
            ["FOOD", state.incomeThisTick.food]
        ].map(item =>
            '<div class="stat-cell"><div class="stat-label">' + item[0] + '</div>' +
            '<div class="stat-value">' + (formatIncome(item[1]) || "—") + '</div></div>'
        ).join("");

        container.innerHTML =
            '<div class="stat-heading">KINGDOM OVERVIEW</div><div class="stat-grid">' + cells + '</div>' +
            '<div class="stat-heading" style="margin-top:16px">CURRENT PRODUCTION</div>' +
            '<div class="stat-grid">' + production + '</div>';
        return;
    }

    const technologies = state.techs.map(tech => {
        const unlocked = state.unlockedTechs.has(tech.id);
        return '<div class="tech-item ' + (unlocked ? "is-unlocked" : "") + '"' +
            ' data-tech-id="' + escapeHtml(tech.id) + '" data-unlocked="' + String(unlocked) + '">' +
            '<div class="tech-icon">' + escapeHtml(tech.icon) + '</div>' +
            '<div class="tech-copy"><div class="tech-name-row">' +
            '<span class="tech-name">' + escapeHtml(tech.name) + '</span>' +
            (unlocked
                ? '<span class="tech-unlocked">RESEARCHED</span>'
                : '<span class="tech-cost">' + tech.cost + ' RP</span>') +
            '</div><div class="tech-description">' + escapeHtml(tech.effect) + '</div></div></div>';
    }).join("");

    container.innerHTML = '<div class="tech-list">' + (technologies || '<div class="empty-state">No research available.</div>') + '</div>';
}
