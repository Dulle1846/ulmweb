// Item lexicon: one searchable archive over base definitions and unique
// player-made records. The catalogue is cached; the panel never rescans the
// live simulation on every frame.
import { state } from "../core/state.js";
import { BASE_ITEMS, buildItemCatalog, ITEM_CATEGORIES, itemCategoryLabel, craftedUseOptions } from "../systems/item-lexicon.js";
import { useCraftedItem } from "../systems/craft-production.js";
import { renderProgressive } from "./progressive-render.js";

const BASE_LABELS = new Map(BASE_ITEMS.map(item => [item.id.replace(/^base:(?:resource|good|metal|furnishing|forest):/, ""), item.label]));
// Imported workshop materials are not warehouse goods, so they do not all
// appear in the base catalogue. Keep their provenance readable instead of
// falling back to a generic category label.
const MATERIAL_LABELS = new Map([["parchment", "Parchment"], ["iron", "Iron"]]);
const PAGE_SIZE = 120;
// The lexicon is a reference archive, not a battle screen. At phone width it
// keeps the first screenful dense enough to browse while avoiding hundreds of
// closed <details> nodes in one click task.
const NARROW_PAGE_SIZE = 6;
let narrowGroupLimit = 2;
const CATALOG_REFRESH_TICKS = 5;
let activeCategory = "all";
let query = "";
let cachedCatalog = null;
let cachedTick = -1;
let cachedCraftedKey = "";
let useNotice = "";
let boundContainer = null;
const lazyGroupRows = new Map();
let visibleLimit = 0;

function isNarrowViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
}

function pageSize() {
    return isNarrowViewport() ? NARROW_PAGE_SIZE : PAGE_SIZE;
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
    return chunks;
}

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function craftedKey() {
    // Status changes do not change the archive length or the last id. Include
    // every bounded record's status so committing an item repaints the panel.
    const items = Array.isArray(state.craftedItems) ? state.craftedItems : [];
    return items.map(item => String(item?.id || "") + ":" + String(item?.status || "owned")).join(",");
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
        const label = entry.label || BASE_LABELS.get(entry.id) || MATERIAL_LABELS.get(entry.id) || itemCategoryLabel(entry.id);
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
    // Closed archive entries used to carry their full prose and metadata in
    // every row. Keep the row itself small; the dossier is filled only when
    // the reader opens that entry.
    return '<details class="item-lexicon__entry' + (crafted ? " is-crafted" : "") + '" data-item-id="' + esc(item.id) + '">' +
        '<summary>' +
            '<span class="item-lexicon__entry-copy"><strong>' + esc(item.label) + '</strong><small>' + esc(item.source) + '</small></span>' +
            '<span class="item-lexicon__badges"><b>' + (crafted ? "MADE" : "BASE") + '</b>' +
                (crafted ? '<i class="item-lexicon__status">' + esc(String(item.status || "owned").toUpperCase()) + '</i>' : "") +
                '<em>' + esc(item.categoryLabel.toUpperCase()) + '</em></span>' +
        '</summary>' +
        '<div class="item-lexicon__detail" data-item-detail></div>' +
    '</details>';
}

function detailMarkup(item) {
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
    if (crafted) {
        details.push('<span><small>STATUS</small><strong>' + esc(String(item.status || "owned").toUpperCase()) + '</strong></span>');
    }
    const tags = (item.tags || []).slice(0, 10).map(tag => '<span>' + esc(tag) + '</span>').join("");
    const uses = crafted && item.status === "owned" ? craftedUseOptions(item) : [];
    const actionBar = uses.length
        ? '<div class="item-lexicon__uses">' + uses.map(option =>
            '<button type="button" class="item-lexicon__use" data-crafted-use="' + esc(option.id) +
            '" data-crafted-id="' + esc(item.id) + '" title="' + esc(option.note) + '">' +
            esc(option.label) + ' · +' + option.amount + ' ' + esc(option.resource.toUpperCase()) + '</button>'
        ).join("") + '</div>'
        : "";
    return '<p class="item-lexicon__summary">' + esc(item.summary) + '</p>' +
        (item.detail ? '<p class="item-lexicon__prose">' + esc(item.detail) + '</p>' : "") +
        '<div class="item-lexicon__meta">' + details.join("") + '</div>' +
        (tags ? '<div class="item-lexicon__tags">' + tags + '</div>' : "") + actionBar;
}

function ensureItemDetail(details) {
    if (!details || details.dataset.itemDetailReady === "1") return;
    const row = cachedCatalog?.rows.find(entry => entry.id === details.dataset.itemId);
    if (!row) return;
    const detail = details.querySelector("[data-item-detail]");
    if (detail) detail.innerHTML = detailMarkup(row);
    details.dataset.itemDetailReady = "1";
}

function groupEntries(rows) {
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.category)) grouped.set(row.category, []);
        grouped.get(row.category).push(row);
    }
    const order = new Map(ITEM_CATEGORIES.map((entry, index) => [entry.id, index]));
    const groups = [...grouped.entries()].sort((left, right) =>
        (order.get(left[0]) ?? 999) - (order.get(right[0]) ?? 999)
    );
    const narrow = isNarrowViewport();
    const visibleGroups = narrow ? groups.slice(0, narrowGroupLimit) : groups;
    return { groups: visibleGroups, hiddenGroups: groups.length - visibleGroups.length };
}

function groupShell(groups) {
    const narrow = isNarrowViewport();
    return groups.map(([category, groupRows]) => {
        if (narrow) lazyGroupRows.set(category, groupRows);
        return '<details class="item-lexicon__group"' + (narrow ? ' data-item-group="' + esc(category) + '"' : ' open') + '>' +
            '<summary><span>' + esc(itemCategoryLabel(category).toUpperCase()) + '</span><b>' + groupRows.length + '</b></summary>' +
            '<div class="item-lexicon__rows"' + (narrow ? ' data-item-group-body' : ' data-item-rows="' + esc(category) + '"') + '>' +
            (narrow ? '' : groupRows.map(renderEntry).join("")) +
            '</div></details>';
    }).join("");
}

function renderGroups(rows) {
    const { groups, hiddenGroups } = groupEntries(rows);
    return groupShell(groups) + (hiddenGroups > 0
        ? '<button type="button" class="item-lexicon__more" data-item-more-groups>SHOW ' + Math.min(2, hiddenGroups) + ' MORE CATEGORIES · ' + hiddenGroups + ' HIDDEN</button>'
        : "");
}

function signature(catalog) {
    return [
        catalog.tick, catalog.total, catalog.craftedCount, craftedKey(),
        activeCategory, query, visibleLimit, narrowGroupLimit,
    ].join("|");
}

// The staged producer must stay cheap: catalog reads, shell generation and row
// descriptors are separate prepared parts instead of one click/hydration task.
// Adjacent entries share a bounded row part: twelve closed records mount fewer
// detached roots than the old four-entry slices, while the exact row and group
// order — and therefore the joined markup bytes — stay unchanged.
const STAGED_ROW_CHUNK = 12;

function stagedLexiconParts(container) {
    const late = { catalog: null, signature: "", rows: [], visible: [], groups: [], hiddenGroups: 0 };
    return [
        () => {
            if (!visibleLimit) visibleLimit = pageSize();
            late.catalog = getCatalog();
            if (activeCategory !== "all" && activeCategory !== "crafted" && !late.catalog.categoryCounts[activeCategory]) activeCategory = "all";
            late.signature = signature(late.catalog);
            return "";
        },
        () => {
            const catalog = late.catalog;
            const rows = matchingRows(catalog);
            late.rows = rows;
            late.visible = rows.slice(0, visibleLimit);
            const searchActive = Boolean(query.trim());
            const categoryEntries = [
                { id: "all", label: "All items", count: catalog.total },
                { id: "crafted", label: "Player-made", count: catalog.craftedCount },
                ...catalog.categories.filter(entry => entry.id !== "all" && entry.id !== "crafted" && entry.count > 0),
            ];
            const categoryButtons = categoryEntries.map(entry => '<button type="button" class="item-lexicon__category' + (!searchActive && activeCategory === entry.id ? " is-active" : "") + '" data-item-category="' + esc(entry.id) + '">' + esc(entry.label.toUpperCase()) + ' <b>' + entry.count + '</b></button>');
            const categoryParts = isNarrowViewport() ? [] : [
                { into: ".item-lexicon", html: '<div class="item-lexicon__categories" role="group" aria-label="Item categories"></div>' }
            ];
            for (let index = 0; index < categoryButtons.length; index += 4) {
                categoryParts.push({ into: ".item-lexicon__categories", html: categoryButtons.slice(index, index + 4).join("") });
            }
            const resultLabel = searchActive
                ? 'SEARCH · ' + esc(query.trim()) + ' · ' + rows.length.toLocaleString("en-US") + ' MATCHES'
                : (activeCategory === "all" ? 'ALL ITEMS' : 'CATEGORY · ' + esc(categoryLabel(activeCategory)).toUpperCase()) + ' · ' + rows.length.toLocaleString("en-US") + ' RECORDS';
            const grouped = groupEntries(late.visible);
            late.groups = grouped.groups;
            late.hiddenGroups = grouped.hiddenGroups;
            // Mount the archive shell in small insertions instead of one large
            // one. The joined DOM is identical, but Chromium no longer shapes
            // the header, search field, category rail and group shells in a
            // single 4x-throttled layout task.
            const head = '<div class="item-lexicon__head">' +
                    '<div><span class="item-lexicon__kicker">REALM MATERIAL ARCHIVE · TICK ' + catalog.tick.toLocaleString("en-US") + '</span>' +
                    '<strong class="item-lexicon__total">' + catalog.total.toLocaleString("en-US") + ' ITEMS</strong></div>' +
                    '<span class="item-lexicon__coverage">' + catalog.baseCount.toLocaleString("en-US") + ' BASE · ' + catalog.craftedCount.toLocaleString("en-US") + ' CRAFTED · ' + catalog.categories.filter(entry => entry.count > 0 && entry.id !== "all" && entry.id !== "crafted").length + ' CATEGORIES</span>' +
                '</div>';
            const search = '<label class="item-lexicon__search"><span>SEARCH THE WHOLE LEXICON</span><input id="item-lexicon-query" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Timber, sword, book, workshop…" value="' + esc(query) + '" aria-label="Search all items"></label>';
            const meta = '<div class="item-lexicon__meta"><span>' + resultLabel + '</span><span>SHOWING ' + late.visible.length.toLocaleString("en-US") + ' / ' + rows.length.toLocaleString("en-US") + '</span></div>';
            const groupParts = [
                { into: ".item-lexicon", html: '<div class="item-lexicon__groups"></div>' },
                ...late.groups.map(([category, groupRows]) => ({
                    into: ".item-lexicon__groups",
                    html: '<details class="item-lexicon__group" open><summary><span>' + esc(itemCategoryLabel(category).toUpperCase()) + '</span><b>' + groupRows.length + '</b></summary>' +
                        '<div class="item-lexicon__rows" data-item-rows="' + esc(category) + '"></div></details>'
                }))
            ];
            const rowParts = [];
            for (const [category, groupRows] of late.groups) {
                for (const slice of chunkRows(groupRows, STAGED_ROW_CHUNK)) {
                    rowParts.push({
                        into: '[data-item-rows="' + esc(category) + '"]',
                        html: () => slice.map(renderEntry).join("")
                    });
                }
            }
            const footer = (late.hiddenGroups > 0
                ? '<button type="button" class="item-lexicon__more" data-item-more-groups>SHOW ' + Math.min(2, late.hiddenGroups) + ' MORE CATEGORIES · ' + late.hiddenGroups + ' HIDDEN</button>'
                : '') +
                (rows.length > late.visible.length
                    ? '<button type="button" class="item-lexicon__more" data-item-more>SHOW ' + Math.min(pageSize(), rows.length - late.visible.length).toLocaleString("en-US") + ' MORE</button>'
                    : '') +
                '<p class="item-lexicon__footnote">Base entries describe real definitions in the simulation. Crafted entries exist only when a unique item record has actually been registered; no live stock is invented here.</p>' +
                (useNotice ? '<p class="item-lexicon__use-notice" role="status">' + esc(useNotice) + '</p>' : "");
            container.dataset.itemLexiconSignature = late.signature;
            return {
                html: '<div class="item-lexicon"></div>',
                more: [
                    { into: ".item-lexicon", html: head },
                    { into: ".item-lexicon", html: search },
                    ...categoryParts,
                    { into: ".item-lexicon", html: meta },
                    ...groupParts,
                    ...rowParts,
                    { into: ".item-lexicon", html: footer }
                ]
            };
        }
    ];
}

function paint(container, { force = false, staged = false } = {}) {
    if (staged) return stagedLexiconParts(container);
    const active = document.activeElement;
    const searchFocused = active?.id === "item-lexicon-query" && container.contains(active);
    const selectionStart = searchFocused ? active.selectionStart : null;
    const catalog = getCatalog();
    if (!visibleLimit) visibleLimit = pageSize();
    const nextSignature = signature(catalog);
    if (!force && container.dataset.itemLexiconSignature === nextSignature) return;
    const rows = matchingRows(catalog);
    const visible = rows.slice(0, visibleLimit);
    const searchActive = Boolean(query.trim());
    const categoryEntries = [
        { id: "all", label: "All items", count: catalog.total },
        { id: "crafted", label: "Player-made", count: catalog.craftedCount },
        ...catalog.categories.filter(entry => entry.id !== "all" && entry.id !== "crafted" && entry.count > 0),
    ];
    const categoryControl = isNarrowViewport()
        ? ''
        : '<div class="item-lexicon__categories" role="group" aria-label="Item categories">' +
            categoryEntries.map(entry => '<button type="button" class="item-lexicon__category' + (!searchActive && activeCategory === entry.id ? " is-active" : "") + '" data-item-category="' + esc(entry.id) + '">' + esc(entry.label.toUpperCase()) + ' <b>' + entry.count + '</b></button>').join("") +
            '</div>';
    const resultLabel = searchActive
        ? 'SEARCH · ' + esc(query.trim()) + ' · ' + rows.length.toLocaleString("en-US") + ' MATCHES'
        : (activeCategory === "all" ? 'ALL ITEMS' : 'CATEGORY · ' + esc(categoryLabel(activeCategory)).toUpperCase()) + ' · ' + rows.length.toLocaleString("en-US") + ' RECORDS';
    const empty = activeCategory === "crafted" && !searchActive
        ? '<div class="empty-state item-lexicon__empty"><strong>NO PLAYER-MADE ITEMS YET</strong><p>Forged weapons, armour, tools, jewellery and written books will be filed here as unique records once a workshop or scriptorium registers them.</p></div>'
        : '<div class="empty-state item-lexicon__empty"><strong>NO ITEM MATCHES</strong><p>Try a material, a forest product, a category, a maker or a workshop name.</p></div>';
    const markup =
        '<div class="item-lexicon">' +
            '<div class="item-lexicon__head">' +
                '<div><span class="item-lexicon__kicker">REALM MATERIAL ARCHIVE · TICK ' + catalog.tick.toLocaleString("en-US") + '</span>' +
                '<strong class="item-lexicon__total">' + catalog.total.toLocaleString("en-US") + ' ITEMS</strong></div>' +
                '<span class="item-lexicon__coverage">' + catalog.baseCount.toLocaleString("en-US") + ' BASE · ' + catalog.craftedCount.toLocaleString("en-US") + ' CRAFTED · ' + catalog.categories.filter(entry => entry.count > 0 && entry.id !== "all" && entry.id !== "crafted").length + ' CATEGORIES</span>' +
            '</div>' +
            '<label class="item-lexicon__search"><span>SEARCH THE WHOLE LEXICON</span><input id="item-lexicon-query" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Timber, sword, book, workshop…" value="' + esc(query) + '" aria-label="Search all items"></label>' +
            categoryControl +
            '<div class="item-lexicon__meta"><span>' + resultLabel + '</span><span>SHOWING ' + visible.length.toLocaleString("en-US") + ' / ' + rows.length.toLocaleString("en-US") + '</span></div>' +
            '<div class="item-lexicon__groups">' + (visible.length ? renderGroups(visible) : empty) + '</div>' +
            (rows.length > visible.length
                ? '<button type="button" class="item-lexicon__more" data-item-more>SHOW ' + Math.min(pageSize(), rows.length - visible.length).toLocaleString("en-US") + ' MORE</button>'
                : '') +
            '<p class="item-lexicon__footnote">Base entries describe real definitions in the simulation. Crafted entries exist only when a unique item record has actually been registered; no live stock is invented here.</p>' +
            (useNotice ? '<p class="item-lexicon__use-notice" role="status">' + esc(useNotice) + '</p>' : "") +
        '</div>';
    if (isNarrowViewport() && !force && !searchFocused) renderProgressive(container, markup);
    else container.innerHTML = markup;
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
        const groupSummary = event.target.closest(".item-lexicon__group > summary");
        if (groupSummary) {
            const details = groupSummary.parentElement;
            const body = details.querySelector("[data-item-group-body]");
            if (body && details.dataset.itemGroupReady !== "1") {
                const rows = lazyGroupRows.get(details.dataset.itemGroup) || [];
                body.innerHTML = rows.map(renderEntry).join("");
                details.dataset.itemGroupReady = "1";
            }
        }
        const summary = event.target.closest(".item-lexicon__entry > summary");
        if (summary) ensureItemDetail(summary.parentElement);
        const useButton = event.target.closest("[data-crafted-use]");
        if (useButton) {
            const result = useCraftedItem(useButton.dataset.craftedId, useButton.dataset.craftedUse);
            useNotice = result.ok
                ? result.text + " · " + String(result.status).toUpperCase()
                : String(result.reason || "USE REJECTED").toUpperCase();
            repaint(container);
            return;
        }
        const categoryButton = event.target.closest("[data-item-category]");
        if (categoryButton) {
            activeCategory = categoryButton.dataset.itemCategory || "all";
            query = "";
            visibleLimit = pageSize();
            repaint(container);
            return;
        }
        if (event.target.closest("[data-item-more]")) {
            visibleLimit += pageSize();
            repaint(container);
        }
    });
    container.addEventListener("input", event => {
        if (event.target.id !== "item-lexicon-query") return;
        query = event.target.value;
        visibleLimit = pageSize();
        repaint(container);
    });
    container.addEventListener("change", event => {
        if (event.target.id === "item-lexicon-category") {
            activeCategory = event.target.value || "all";
            query = "";
            visibleLimit = pageSize();
            repaint(container);
            return;
        }
        if (event.target.id !== "item-lexicon-query") return;
        query = event.target.value;
        visibleLimit = pageSize();
        repaint(container);
    });
}

export function renderItemLexiconParts(container) {
    if (!container) return [];
    bind(container);
    if (!container.querySelector(".item-lexicon")) delete container.dataset.itemLexiconSignature;
    // Category validation and catalog generation both belong to the first
    // generated part; the click task only hands over the lazy producer.
    return paint(container, { force: true, staged: true }) || [];
}

export function renderItemLexicon(container) {
    if (!container) return;
    bind(container);
    // Tab switches replace the panel without changing the catalog signature.
    // Drop the cached signature only when the Lexicon DOM is gone; automatic
    // tick/search repaints keep their early-out while a return to the tab
    // always renders live content again.
    if (!container.querySelector(".item-lexicon")) delete container.dataset.itemLexiconSignature;
    const catalog = getCatalog();
    if (activeCategory !== "all" && activeCategory !== "crafted" && !catalog.categoryCounts[activeCategory]) {
        activeCategory = "all";
    }
    paint(container);
}

export function resetItemLexicon() {
    activeCategory = "all";
    query = "";
    useNotice = "";
    visibleLimit = 0;
    cachedCatalog = null;
    cachedTick = -1;
    cachedCraftedKey = "";
}
