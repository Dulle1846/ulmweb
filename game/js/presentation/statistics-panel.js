// Statistics explorer: one persistent panel over the complete live catalogue.
import { state } from "../core/state.js";
import { buildStatisticsCatalog, STATISTICS_CATEGORIES } from "../systems/statistics.js";

const PAGE_SIZE = 120;
const CATALOG_REFRESH_TICKS = 5;
let activeCategory = "overview";
let query = "";
let visibleLimit = PAGE_SIZE;
let cachedCatalog = null;
let cachedTick = -1;
let boundContainer = null;

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function getCatalog() {
    const stale = !cachedCatalog || state.tick < cachedTick || state.tick - cachedTick >= CATALOG_REFRESH_TICKS;
    if (stale) {
        cachedCatalog = buildStatisticsCatalog();
        cachedTick = state.tick;
    }
    return cachedCatalog;
}

function matchingRows(catalog) {
    const needle = query.trim().toLowerCase();
    if (needle) return catalog.rows.filter(row => row.search.includes(needle));
    if (activeCategory === "all") return catalog.rows;
    return catalog.rows.filter(row => row.category === activeCategory);
}

function categoryLabel(id) {
    return STATISTICS_CATEGORIES.find(entry => entry.id === id)?.label || "Statistics";
}

function renderRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.group)) grouped.set(row.group, []);
        grouped.get(row.group).push(row);
    }
    return [...grouped.entries()].map(([group, groupRows]) =>
        '<details class="stats-explorer__group" open>' +
            '<summary><span>' + esc(group) + '</span><b>' + groupRows.length + '</b></summary>' +
            '<div class="stats-explorer__rows">' +
                groupRows.map(row =>
                    '<div class="stats-explorer__row" data-stat-id="' + esc(row.id) + '">' +
                        '<span>' + esc(row.label) + '</span>' +
                        '<strong>' + esc(row.display) + '</strong>' +
                    '</div>'
                ).join("") +
            '</div>' +
        '</details>'
    ).join("");
}

function updateSignature(container, catalog) {
    container.dataset.statisticsSignature = [
        catalog.tick,
        state.entities.length,
        activeCategory,
        query,
        visibleLimit,
        state.statistics?.totalTrades,
        state.statistics?.totalEventsResolved,
        Math.floor(Number(state.morale) || 0)
    ].join("|");
}

function paint(container, { force = false } = {}) {
    const active = document.activeElement;
    const searchFocused = active?.id === "stats-query" && container.contains(active);
    const selectionStart = searchFocused ? active.selectionStart : null;
    const catalog = getCatalog();
    const signature = [
        catalog.tick,
        state.entities.length,
        activeCategory,
        query,
        visibleLimit,
        state.statistics?.totalTrades,
        state.statistics?.totalEventsResolved,
        Math.floor(Number(state.morale) || 0)
    ].join("|");
    if (!force && container.dataset.statisticsSignature === signature) return;
    const rows = matchingRows(catalog);
    const visible = rows.slice(0, visibleLimit);
    const searchActive = Boolean(query.trim());
    const categoryButtons = [
        '<button type="button" class="stats-explorer__category' + (!searchActive && activeCategory === "overview" ? " is-active" : "") + '" data-stats-category="overview">OVERVIEW <b>' + (catalog.categoryCounts.overview || 0) + '</b></button>',
        ...catalog.categories.filter(entry => entry.id !== "overview" && entry.count > 0).map(entry =>
            '<button type="button" class="stats-explorer__category' + (!searchActive && activeCategory === entry.id ? " is-active" : "") + '" data-stats-category="' + esc(entry.id) + '">' + esc(entry.label.toUpperCase()) + ' <b>' + entry.count + '</b></button>'
        ),
        '<button type="button" class="stats-explorer__category' + (!searchActive && activeCategory === "all" ? " is-active" : "") + '" data-stats-category="all">ALL <b>' + catalog.total + '</b></button>'
    ].join("");
    const resultLabel = searchActive
        ? 'SEARCH · ' + esc(query.trim()) + ' · ' + rows.length.toLocaleString("en-US") + ' MATCHES'
        : (activeCategory === "all" ? 'ALL DOMAINS' : 'DOMAIN · ' + esc(categoryLabel(activeCategory)).toUpperCase()) + ' · ' + rows.length.toLocaleString("en-US") + ' READINGS';
    const empty = '<div class="empty-state">No statistics match this search. Try a person, building, resource or domain name.</div>';
    container.innerHTML =
        '<div class="stats-explorer">' +
            '<div class="stats-explorer__head">' +
                '<div><span class="stats-explorer__kicker">LIVE ARCHIVE · TICK ' + catalog.tick.toLocaleString("en-US") + '</span>' +
                '<strong class="stats-explorer__total">' + catalog.total.toLocaleString("en-US") + ' STATISTICS</strong></div>' +
                '<span class="stats-explorer__coverage">' + catalog.peopleCount + ' PEOPLE · ' + catalog.buildingCount + ' BUILDINGS · ' + catalog.categories.filter(entry => entry.count > 0).length + ' DOMAINS</span>' +
            '</div>' +
            '<label class="stats-explorer__search"><span>SEARCH EVERY READING</span><input id="stats-query" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Name, skill, resource, building, domain…" value="' + esc(query) + '" aria-label="Search all statistics"></label>' +
            '<div class="stats-explorer__categories" role="group" aria-label="Statistics categories">' + categoryButtons + '</div>' +
            '<div class="stats-explorer__meta"><span>' + resultLabel + '</span><span>SHOWING ' + visible.length.toLocaleString("en-US") + ' / ' + rows.length.toLocaleString("en-US") + '</span></div>' +
            '<div class="stats-explorer__groups">' + (visible.length ? renderRows(visible) : empty) + '</div>' +
            (rows.length > visible.length
                ? '<button type="button" class="stats-explorer__more" data-stats-more>SHOW ' + Math.min(PAGE_SIZE, rows.length - visible.length).toLocaleString("en-US") + ' MORE</button>'
                : '') +
        '</div>';
    updateSignature(container, catalog);
    if (searchFocused) {
        const input = container.querySelector("#stats-query");
        if (input) {
            input.focus({ preventScroll: true });
            if (selectionStart !== null) input.setSelectionRange(selectionStart, selectionStart);
        }
    }
}

function repaint(container) {
    paint(container, { force: true });
}

function bind(container) {
    if (boundContainer === container) return;
    boundContainer = container;
    container.addEventListener("click", event => {
        const categoryButton = event.target.closest("[data-stats-category]");
        if (categoryButton) {
            activeCategory = categoryButton.dataset.statsCategory || "overview";
            query = "";
            visibleLimit = PAGE_SIZE;
            repaint(container);
            return;
        }
        if (event.target.closest("[data-stats-more]")) {
            visibleLimit += PAGE_SIZE;
            repaint(container);
        }
    });
    container.addEventListener("input", event => {
        if (event.target.id !== "stats-query") return;
        query = event.target.value;
        visibleLimit = PAGE_SIZE;
        repaint(container);
    });
    container.addEventListener("change", event => {
        if (event.target.id !== "stats-query") return;
        query = event.target.value;
        visibleLimit = PAGE_SIZE;
        repaint(container);
    });
}

export function renderStatisticsExplorer(container) {
    if (!container) return;
    bind(container);
    const catalog = getCatalog();
    if (activeCategory !== "all" && activeCategory !== "overview" && !catalog.categoryCounts[activeCategory]) {
        activeCategory = "overview";
    }
    paint(container);
}

export function resetStatisticsExplorer() {
    activeCategory = "overview";
    query = "";
    visibleLimit = PAGE_SIZE;
    cachedCatalog = null;
    cachedTick = -1;
}
