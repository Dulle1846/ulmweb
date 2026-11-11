import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [ui, panel, statistics, css] = await Promise.all([
    readFile(new URL("js/presentation/rendering/ui.js", root), "utf8"),
    readFile(new URL("js/presentation/statistics-panel.js", root), "utf8"),
    readFile(new URL("js/systems/statistics.js", root), "utf8"),
    readFile(new URL("css/game.css", root), "utf8")
]);

test("statistics tab delegates to the dedicated explorer", () => {
    assert.ok(ui.includes('import { renderStatisticsExplorer } from "../statistics-panel.js"'));
    assert.ok(ui.includes("renderStatisticsExplorer(container)"));
    assert.ok(statistics.includes("export function buildStatisticsCatalog()"));
    assert.ok(statistics.includes("STATISTICS_CATEGORIES"));
});

test("statistics explorer exposes search, domains, paging and a bounded first paint", () => {
    assert.ok(panel.includes("SEARCH EVERY READING"));
    assert.ok(panel.includes("data-stats-category"));
    assert.ok(panel.includes("data-stats-more"));
    assert.ok(panel.includes("const PAGE_SIZE = 120"));
    assert.ok(panel.includes("CATALOG_REFRESH_TICKS"));
    assert.ok(panel.includes("input.addEventListener") === false, "input events belong to the persistent container");
    assert.ok(panel.includes('container.addEventListener("input"'));
    assert.ok(panel.includes("query = event.target.value"));
    assert.ok(panel.includes("visibleLimit += PAGE_SIZE"));
    assert.ok(panel.includes("searchFocused"), "periodic refreshes must preserve the search caret");
    assert.ok(panel.includes('focus({ preventScroll: true })'));
});

test("explorer styles stay compact and mobile aware", () => {
    for (const token of [".stats-explorer", ".stats-explorer__search", ".stats-explorer__category", ".stats-explorer__group", ".stats-explorer__row", ".stats-explorer__more"]) {
        assert.ok(css.includes(token), "missing " + token);
    }
    assert.ok(css.includes("@media(max-width:790px)"));
    assert.ok(css.includes("grid-template-columns:minmax(0,1fr) minmax(48px,auto)"));
});
