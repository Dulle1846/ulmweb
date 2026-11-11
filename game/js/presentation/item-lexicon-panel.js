// Item lexicon: one searchable archive over base definitions and unique
// player-made records. The catalogue is cached; the panel never rescans the
// live simulation on every frame.
import { state } from "../core/state.js";
import { BASE_ITEMS, buildItemCatalog, ITEM_CATEGORIES, itemCategoryLabel } from "../systems/item-lexicon.js";

const BASE_LABELS = new Map(BASE_ITEMS.map(item => [item.id.replace(/^base:(?:resource|good|metal|furnishing|forest):/, ""), item.label]));
const PAGE_SIZE = 120;
const CATALOG_REFRESH_TICKS = 5;
let activeCategory = "all";
let query = "";
let visibleLimit = PAGE_SIZE;
let cachedCatalog = null;
let cachedTick = -1;
let cachedCraftedKey = "";
let boundContainer = null;

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function craftedKey() {
    const items = Array.isArray(state.craftedItems) ? state.craftedItems : [];
    const last = items.length ? items[items.length - 1] : null;
    return items.length + ":" + String(last?.id || "");
}

function getCatalog() {
    const key = craftedKey();
    const stale = !cachedCatalog
        || state.tick < cachedTick
        || state.tick - cachedTick >= CATALOG_REFRESH_TICKS
        || key !== cachedCraftedKey;
    if (stale) {
        cachedCatalog = buildItemCatalog(state.craftedItems || []);
        cachedCatalog.tick = Number(state.tick) || 0;
        cachedTick = Number(state.tick) || 0;
        cachedCraftedKey = key;
    }
    return cachedCatalog;
}

function matchingRows(catalog) {
    const needle = query.trim().toLowerCase();
    if (needle) return catalog.rows.filter(row => row.search.includes(needle));
    if (activeCategory === "all") return catalog.rows;
    if (activeCategory === "crafted") return catalog.rows.filter(row => row.origin === "crafted");
    return catalog.rows.filter(row => row.category === activeCategory);
}

function categoryLabel(id) {
    return ITEM_CATEGORIES.find(entry => entry.id === id)?.label || "Items";
}

function materialText(item) {
    const entries = item.recipe || item.materials || [];
    if (!entries.length) return "—";
    return entries.map(entry => {
        const label = entry.label || BASE_LABELS.get(entry.id) || itemCategoryLabel(entry.id);
        return (Number(entry.amount) || 0) + " × " + label;
    }).join(" · ");
}

function originLabel(item) {
    if (item.origin === "crafted") return "Player-made";
    if (item.origin === "tropical") return "Tropical ecology";
    if (item.origin === "forest") return "Temperate ecology";
    return "Base catalogue";
}

function renderEntry(item) {
    const crafted = item.origin === "crafted";
    const details = [
        '<span><small>ORIGIN</small><strong>' + esc(originLabel(item)) + '</strong></span>',
        '<span><small>CATEGORY</small><strong>' + esc(item.categoryLabel) + '</strong></span>',
        '<span><small>AVAILABILITY</small><strong>' + esc(item.availability || "—") + '</strong></span>',
    ];
    if (crafted) {
        details.push('<span><small>QUALITY</small><strong>' + esc(item.qualityBand) + ' · ' + esc(item.quality) + '/100</strong></span>');
        details.push('<span><small>MAKER</small><strong>' + esc(item.crafterName || "Not named") + '</strong></span>');
        details.push('<span><small>RECORDED</small><strong>YEAR ' + esc(item.year) + '</strong></span>');
    }
    if (item.recipe) {
        details.push('<span><small>WORKSHOP COST</small><strong>' + esc(materialText(item)) + '</strong></span>');
    }
    if (item.recipe?.length && item.upkeep) {
        details.push('<span><small>UPKEEP</small><strong>' + esc(item.upkeep) + ' gold / settlement</strong></span>');
    }
    if (crafted && item.materials?.length) {
        details.push('<span><small>MATERIALS</small><strong>' + esc(materialText(item)) + '</strong></span>');
    }
    const tags = (item.tags || []).slice(0, 10).map(tag => '<span>' + esc(tag) + '</span>').join("");
    return '<details class="item-lexicon__entry' + (crafted ? " is-crafted" : "") + '" data-item-id="' + esc(item.id) + '">' +
        '<summary>' +
            '<span class="item-lexicon__entry-copy"><strong>' + esc(item.label) + '</strong><small>' + esc(item.source) + '</small></span>' +
            '<span class="item-lexicon__badges"><b>' + (crafted ? "MADE" : "BASE") + '</b><em>' + esc(item.categoryLabel.toUpperCase()) + '</em></span>' +
        '</summary>' +
        '<div class="item-lexicon__detail">' +
            '<p class="item-lexicon__summary">' + esc(item.summary) + '</p>' +
            (item.detail ? '<p class="item-lexicon__prose">' + esc(item.detail) + '</p>' : "") +
            '<div class="item-lexicon__meta">' + details.join("") + '</div>' +
            (tags ? '<div class="item-lexicon__tags">' + tags + '</div>' : "") +
        '</div>' +
    '</details>';
}

function renderGroups(rows) {
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.category)) grouped.set(row.category, []);
        grouped.get(row.category).push(row);
    }
    const order = new Map(ITEM_CATEGORIES.map((entry, index) => [entry.id, index]));
    const groups = [...grouped.entries()].sort((left, right) =>
        (order.get(left[0]) ?? 999) - (order.get(right[0]) ?? 999)
    );
    return groups.map(([category, groupRows]) =>
        '<details class="item-lexicon__group" open>' +
            '<summary><span>' + esc(itemCategoryLabel(category).toUpperCase()) + '</span><b>' + groupRows.length + '</b></summary>' +
            '<div class="item-lexicon__rows">' + groupRows.map(renderEntry).join("") + '</div>' +
        '</details>'
    ).join("");
}

function signature(catalog) {
    return [
        catalog.tick, catalog.total, catalog.craftedCount, craftedKey(),
        activeCategory, query, visibleLimit,
    ].join("|");
}

function paint(container, { force = false } = {}) {
    const active = document.activeElement;
    const searchFocused = active?.id === "item-lexicon-query" && container.contains(active);
    const selectionStart = searchFocused ? active.selectionStart : null;
    const catalog = getCatalog();
    const nextSignature = signature(catalog);
    if (!force && container.dataset.itemLexiconSignature === nextSignature) return;
    const rows = matchingRows(catalog);
    const visible = rows.slice(0, visibleLimit);
    const searchActive = Boolean(query.trim());
    const categoryButtons = [
        '<button type="button" class="item-lexicon__category' + (!searchActive && activeCategory === "all" ? " is-active" : "") + '" data-item-category="all">ALL <b>' + catalog.total + '</b></button>',
        '<button type="button" class="item-lexicon__category' + (!searchActive && activeCategory === "crafted" ? " is-active" : "") + '" data-item-category="crafted">PLAYER-MADE <b>' + catalog.craftedCount + '</b></button>',
        ...catalog.categories
            .filter(entry => entry.id !== "all" && entry.id !== "crafted" && entry.count > 0)
            .map(entry => '<button type="button" class="item-lexicon__category' + (!searchActive && activeCategory === entry.id ? " is-active" : "") + '" data-item-category="' + esc(entry.id) + '">' + esc(entry.label.toUpperCase()) + ' <b>' + entry.count + '</b></button>')
    ].join("");
    const resultLabel = searchActive
        ? 'SEARCH · ' + esc(query.trim()) + ' · ' + rows.length.toLocaleString("en-US") + ' MATCHES'
        : (activeCategory === "all" ? 'ALL ITEMS' : 'CATEGORY · ' + esc(categoryLabel(activeCategory)).toUpperCase()) + ' · ' + rows.length.toLocaleString("en-US") + ' RECORDS';
    const empty = activeCategory === "crafted" && !searchActive
        ? '<div class="empty-state item-lexicon__empty"><strong>NO PLAYER-MADE ITEMS YET</strong><p>Forged weapons, armour, tools, jewellery and written books will be filed here as unique records once a workshop or scriptorium registers them.</p></div>'
        : '<div class="empty-state item-lexicon__empty"><strong>NO ITEM MATCHES</strong><p>Try a material, a forest product, a category, a maker or a workshop name.</p></div>';
    container.innerHTML =
        '<div class="item-lexicon">' +
            '<div class="item-lexicon__head">' +
                '<div><span class="item-lexicon__kicker">REALM MATERIAL ARCHIVE · TICK ' + catalog.tick.toLocaleString("en-US") + '</span>' +
                '<strong class="item-lexicon__total">' + catalog.total.toLocaleString("en-US") + ' ITEMS</strong></div>' +
                '<span class="item-lexicon__coverage">' + catalog.baseCount.toLocaleString("en-US") + ' BASE · ' + catalog.craftedCount.toLocaleString("en-US") + ' CRAFTED · ' + catalog.categories.filter(entry => entry.count > 0 && entry.id !== "all" && entry.id !== "crafted").length + ' CATEGORIES</span>' +
            '</div>' +
            '<label class="item-lexicon__search"><span>SEARCH THE WHOLE LEXICON</span><input id="item-lexicon-query" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Timber, physic, sword, book, maker, workshop…" value="' + esc(query) + '" aria-label="Search all items"></label>' +
            '<div class="item-lexicon__categories" role="group" aria-label="Item categories">' + categoryButtons + '</div>' +
            '<div class="item-lexicon__meta"><span>' + resultLabel + '</span><span>SHOWING ' + visible.length.toLocaleString("en-US") + ' / ' + rows.length.toLocaleString("en-US") + '</span></div>' +
            '<div class="item-lexicon__groups">' + (visible.length ? renderGroups(visible) : empty) + '</div>' +
            (rows.length > visible.length
                ? '<button type="button" class="item-lexicon__more" data-item-more>SHOW ' + Math.min(PAGE_SIZE, rows.length - visible.length).toLocaleString("en-US") + ' MORE</button>'
                : '') +
            '<p class="item-lexicon__footnote">Base entries describe real definitions in the simulation. Crafted entries exist only when a unique item record has actually been registered; no live stock is invented here.</p>' +
        '</div>';
    container.dataset.itemLexiconSignature = nextSignature;
    if (searchFocused) {
        const input = container.querySelector("#item-lexicon-query");
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
        const categoryButton = event.target.closest("[data-item-category]");
        if (categoryButton) {
            activeCategory = categoryButton.dataset.itemCategory || "all";
            query = "";
            visibleLimit = PAGE_SIZE;
            repaint(container);
            return;
        }
        if (event.target.closest("[data-item-more]")) {
            visibleLimit += PAGE_SIZE;
            repaint(container);
        }
    });
    container.addEventListener("input", event => {
        if (event.target.id !== "item-lexicon-query") return;
        query = event.target.value;
        visibleLimit = PAGE_SIZE;
        repaint(container);
    });
    container.addEventListener("change", event => {
        if (event.target.id !== "item-lexicon-query") return;
        query = event.target.value;
        visibleLimit = PAGE_SIZE;
        repaint(container);
    });
}

export function renderItemLexicon(container) {
    if (!container) return;
    bind(container);
    const catalog = getCatalog();
    if (activeCategory !== "all" && activeCategory !== "crafted" && !catalog.categoryCounts[activeCategory]) {
        activeCategory = "all";
    }
    paint(container);
}

export function resetItemLexicon() {
    activeCategory = "all";
    query = "";
    visibleLimit = PAGE_SIZE;
    cachedCatalog = null;
    cachedTick = -1;
    cachedCraftedKey = "";
}
