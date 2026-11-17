// Management panel for the 1.2.19 biome atlas.
//
// The panel is a pure reader over getBiomeAtlasSnapshot(). Every button names
// one real action; no label is a decorative promise. Region cards stay
// collapsed by default so a late-game atlas remains a bounded DOM cost.
import { state } from "../core/state.js";
import { getBiomeEconomySnapshot } from "../systems/biome-resource-state.js";
import { BIOME_FOCUSES, BIOME_POLICIES, BIOME_RESOURCE_CATEGORIES } from "../world/biome-resource-data.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pct = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const seasonNames = ["Spring", "Summer", "Autumn", "Winter"];

function intro(kicker, title, copy) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div>';
}
function meter(label, value, note = "") {
    const amount = pct(value);
    return '<div class="command-meter"><span>' + esc(label) + '</span><i><b style="width:' + amount + '%"></b></i><strong>' + amount + (note ? " " + esc(note) : "") + '</strong></div>';
}
function sizeClass(value) {
    return pct(value) >= 66 ? "is-high" : pct(value) >= 30 ? "is-mid" : "is-low";
}
function resourceRow(region, row) {
    const season = row.seasonal ? "IN SEASON" : "DORMANT";
    const rare = row.rare ? '<span class="biome-badge is-rare">' + (row.strategic ? "STRATEGIC" : "RARE") + '</span>' : "";
    const focus = row.focusMatch ? '<span class="biome-badge">FOCUS</span>' : "";
    const stored = row.stored > 0 ? '<b class="biome-store">' + number(row.stored) + ' stored</b>' : "";
    const disabled = row.locallyExtinct || row.stock <= 0 || !row.seasonal ? " disabled" : "";
    return '<div class="biome-resource-row" data-biome-resource-row="' + esc(row.id) + '">' +
        '<div class="biome-resource-name"><strong>' + esc(row.label) + '</strong><small>' + esc(row.categoryLabel) + ' · quality ' + row.quality + '/100 ' + rare + focus + '</small></div>' +
        '<div class="biome-stock"><span><i class="' + sizeClass(row.capacity ? row.stock / row.capacity * 100 : 0) + '" style="width:' + pct(row.capacity ? row.stock / row.capacity * 100 : 0) + '%"></i></span><small>' + number(row.stock) + ' / ' + number(row.capacity) + ' stock · ' + season + ' ' + stored + '</small></div>' +
        '<div class="biome-row-actions">' +
        '<button type="button" data-command="biome-harvest" data-value="' + esc(region.id) + '" data-biome-resource="' + esc(row.id) + '"' + disabled + '>HARVEST · ' + number(row.actionCost || 3) + 'G</button>' +
        (row.stored > 0 ? '<button type="button" data-command="biome-sell" data-value="' + esc(region.id) + '" data-biome-resource="' + esc(row.id) + '">SELL · ' + number(row.stored) + '</button>' : "") +
        '</div></div>';
}
function faunaRow(region, row) {
    const share = row.capacity ? row.population / row.capacity * 100 : 0;
    const badges = [
        row.rare ? "RARE" : "", row.fantastic ? "FANTASTIC" : "",
        row.endangered ? "ENDANGERED" : "", row.breeding ? "BREEDING" : "",
        row.migrating ? "MIGRATING" : "", row.focusMatch ? "FOCUS" : ""
    ].filter(Boolean).map(value => '<span class="biome-badge' + (value === "ENDANGERED" ? " is-danger" : value === "RARE" || value === "FANTASTIC" ? " is-rare" : "") + '">' + value + '</span>').join("");
    return '<div class="biome-fauna-row" data-biome-fauna-row="' + esc(row.id) + '">' +
        '<div class="biome-fauna-name"><strong>' + esc(row.label) + '</strong><small>' + esc(row.role) + ' · ' + esc(row.refuge) + '</small><div class="biome-badges">' + badges + '</div></div>' +
        '<div class="biome-stock"><span><i class="' + sizeClass(share) + '" style="width:' + pct(share) + '%"></i></span><small>' + number(row.population) + ' / ' + number(row.capacity) + ' population · health ' + row.health + '/100</small></div>' +
        '<div class="biome-row-actions"><button type="button" data-command="biome-hunt" data-value="' + esc(region.id) + '" data-biome-species="' + esc(row.id) + '"' + (row.population <= 0 ? " disabled" : "") + '>HUNT · ' + number(row.actionCost || 4) + 'G</button></div></div>';
}
function regionCard(region, index) {
    const resourceRows = region.resources.filter(row => row.discovered).map(row => resourceRow(region, row)).join("");
    const faunaRows = region.fauna.filter(row => row.discovered).map(row => faunaRow(region, row)).join("");
    const rareCount = region.resources.filter(row => row.discovered && row.rare).length;
    const policyButtons = Object.values(BIOME_POLICIES).map(policy =>
        '<button type="button" class="biome-choice' + (region.policy === policy.id ? " is-current" : "") + '" data-command="biome-policy" data-value="' + esc(region.id) + '" data-biome-policy="' + esc(policy.id) + '"><strong>' + esc(policy.short) + '</strong><small>' + esc(policy.label) + '</small></button>'
    ).join("");
    const craftRows = (region.recipes || []).map(recipe => {
        const inputText = recipe.inputs.map(input => input.amount + ' ' + input.label).join(' · ');
        const missing = recipe.missing.length ? '<small class="is-low">Missing: ' + recipe.missing.map(value => esc(value)).join(', ') + '</small>' : '';
        return '<div class="biome-resource-row biome-craft-row">' +
            '<div class="biome-resource-name"><strong>' + esc(recipe.label) + '</strong><small>' + esc(inputText) + ' → ' + esc(recipe.label) + (recipe.focusMatch ? ' · FOCUS' : '') + '</small>' + missing + '</div>' +
            '<div class="biome-store">' + (recipe.stored > 0 ? number(recipe.stored) + ' stored' : '') + '</div>' +
            '<div class="biome-row-actions"><button type="button" data-command="biome-craft" data-value="' + esc(region.id) + '" data-biome-recipe="' + esc(recipe.id) + '"' + (recipe.available ? '' : ' disabled') + '>CRAFT · ' + number(recipe.cost) + 'G</button>' +
            (recipe.stored > 0 ? '<button type="button" data-command="biome-sell-craft" data-value="' + esc(region.id) + '" data-biome-recipe="' + esc(recipe.id) + '">SELL · ' + number(recipe.stored) + '</button>' : '') +
            '</div></div>';
    }).join('');
    const focusButtons = Object.entries(BIOME_FOCUSES).map(([id, focus]) =>
        '<button type="button" class="biome-choice' + (region.focus === id ? " is-current" : "") + '" data-command="biome-focus" data-value="' + esc(region.id) + '" data-biome-focus="' + esc(id) + '"><strong>' + esc(focus.label.toUpperCase()) + '</strong><small>' + esc(focus.description) + '</small></button>'
    ).join("");
    return '<details class="biome-region" data-biome-region="' + esc(region.id) + '"' + (index === 0 ? " open" : "") + '>' +
        '<summary><span class="biome-region-mark" style="background:' + esc(region.color) + '"></span><span class="biome-region-title"><strong>' + esc(region.name) + '</strong><small>' + esc(region.biomeLabel) + ' · quality ' + region.quality + '/100' + (region.engineered ? " · engineered wetland" : "") + '</small></span><span class="biome-region-stats"><b>' + region.economy.health + '</b><small>ECOLOGY</small></span><span class="biome-region-stats"><b>' + rareCount + '</b><small>RARE</small></span><span class="biome-region-stats"><b>' + region.economy.importDependency + '%</b><small>IMPORTS</small></span></summary>' +
        '<div class="biome-region-body">' +
        '<div class="biome-region-summary"><span><small>PRODUCTION</small><strong>' + esc(region.productionLabel) + '</strong></span><span><small>SPECIALISATION</small><strong>' + esc(region.focusLabel) + '</strong></span><span><small>POLICY</small><strong>' + esc(region.policyLabel) + '</strong></span><span><small>PRODUCTION COST</small><strong>×' + region.economy.productionCost.toFixed(2) + '</strong></span><span><small>SUPPLY BONUS</small><strong>+' + region.economy.supplyBonus + '</strong></span></div>' +
        meter("VEGETATION", region.vegetation) + meter("SOIL HEALTH", region.soilHealth) + meter("FRESH WATER", region.water) +
        '<div class="biome-chip-line"><small>LOCAL CRAFTS</small>' + region.crafts.map(craft => '<span class="biome-badge">' + esc(String(craft).toUpperCase()) + '</span>').join("") + '</div>' +
        '<div class="command-section-title">LOCAL CRAFT RECIPES</div><div class="biome-table">' + (craftRows || '<p class="command-note">No local recipe is available in this region.</p>') + '</div>' +
        '<p class="command-note">' + esc(region.policyDescription) + ' ' + esc(region.focusDescription) + '</p>' +
        '<div class="biome-actions"><button type="button" data-command="biome-restore" data-value="' + esc(region.id) + '">RESTORE HABITAT · 12G / 8 WOOD</button>' + (region.surveyLevel < 2 ? '<button type="button" data-command="biome-survey" data-value="' + esc(region.id) + '">' + (region.surveyLevel > 0 ? 'SURVEY RARE SITES' : 'SURVEY REGION') + ' · 10G</button>' : '<span class="biome-badge">FULLY SURVEYED</span>') + '</div>' +
        '<div class="command-section-title">LAND-USE POLICY</div><div class="biome-choice-grid">' + policyButtons + '</div>' +
        '<div class="command-section-title">PRODUCTION FOCUS</div><div class="biome-choice-grid">' + focusButtons + '</div>' +
        '<div class="command-section-title">KNOWN RESOURCES · ' + region.resources.filter(row => row.discovered).length + '</div><div class="biome-table">' + (resourceRows || '<p class="command-note">No resource has been recorded here. Survey the region to reveal its wealth.</p>') + '</div>' +
        '<div class="command-section-title">WILDLIFE · ' + region.fauna.filter(row => row.discovered).length + '</div><div class="biome-table">' + (faunaRows || '<p class="command-note">No species has been recorded here yet.</p>') + '</div>' +
        '<p class="command-note">Rare deposits remain hidden until a survey. Extraction raises pressure and can exhaust a stock; non-renewable minerals never return. Hunting and logging change vegetation, soil and the predator–prey balance in later years.</p>' +
        '</div></details>';
}
function historyEntry(entry) {
    return '<article class="command-history"><strong>YEAR ' + number(entry.year) + ' · ' + esc(String(entry.kind || "note").toUpperCase()) + '</strong><p>' + esc(entry.text) + '</p></article>';
}

export function renderBiomePanel() {
    const atlas = getBiomeEconomySnapshot();
    if (!atlas.available) {
        return intro("THE LIVING LAND", "Biome atlas", "The atlas is generated with the realm. Start or load a realm to survey its resources and wildlife.") +
            '<p class="command-note">No biome data is available in this session.</p>';
    }
    const season = seasonNames[state.seasonIndex] || "Spring";
    const regions = atlas.regions.slice().sort((a, b) => a.index - b.index);
    const importList = atlas.imports.length ? atlas.imports.map(value => '<span class="biome-badge is-danger">' + esc(value.toUpperCase()) + '</span>').join("") : '<span class="biome-badge">SELF-SUFFICIENT</span>';
    const exportList = atlas.exports.length ? atlas.exports.slice(0, 10).map(value => '<span class="biome-badge is-rare">' + esc(value.toUpperCase()) + '</span>').join("") : '<span class="command-note">No export good is known yet.</span>';
    const specialisations = atlas.specialisations.length ? atlas.specialisations.map(value => '<span class="biome-badge">' + esc(value.toUpperCase()) + '</span>').join("") : '<span class="command-note">No regional specialisation has emerged.</span>';
    const stats = atlas.stats || {};
    return intro("THE LIVING LAND", "Biome resources & wildlife", "Every discovered region has its own soil, climate, timber, minerals, plants and animal populations. Production, hunting, rare deposits and ecological recovery are simulated together; the map overlay draws the same saved atlas.") +
        '<div class="command-summary"><div><small>REGIONS SURVEYED</small><strong>' + atlas.surveyed + ' / ' + atlas.total + '</strong></div><div><small>RARE SITES KNOWN</small><strong>' + atlas.rareKnown + '</strong></div><div><small>SPECIES RECORDED</small><strong>' + atlas.speciesKnown + '</strong></div><div><small>RARE SPECIES</small><strong>' + atlas.rareSpecies + '</strong></div><div><small>STORED GOODS</small><strong>' + number(atlas.stores) + '</strong></div><div><small>ECOLOGICAL HEALTH</small><strong>' + atlas.health + ' / 100</strong></div></div>' +
        '<div class="biome-season"><span class="command-ribbon">' + esc(season.toUpperCase()) + ' SURVEY · YEAR ' + number(state.year) + '</span><p>Seasonal resources are marked in season or dormant. Annual regeneration, breeding, migration, predation, pollination and erosion settle at the year boundary; player actions affect the following year.</p></div>' +
        '<div class="command-section-title">REGIONAL ECONOMY</div><div class="biome-economy-grid"><div><small>PRODUCTION COST</small><strong>×' + Number(atlas.productionCost || 1).toFixed(2) + '</strong><span>Average of surveyed policies</span></div><div><small>TRADE REVENUE</small><strong>' + number(atlas.trade?.gold || 0) + ' G</strong><span>Goods actually sold</span></div><div><small>IMPORT DEPENDENCE</small><strong>' + (100 - Number(atlas.supplySecurity || 0)) + '%</strong><span>Core categories not found locally</span></div><div><small>POTENTIAL OUTPUT</small><strong>' + number(stats.potentialYield || 0) + '</strong><span>Raw goods available per year</span></div></div>' +
        '<div class="biome-chip-line"><small>IMPORTED RAW MATERIALS</small>' + importList + '</div><div class="biome-chip-line"><small>REGIONAL EXPORTS</small>' + exportList + '</div><div class="biome-chip-line"><small>SPECIALISATIONS</small>' + specialisations + '</div>' +
        '<div class="command-section-title">DISCOVERED REGIONS · ' + regions.length + '</div><div class="biome-region-list">' + (regions.map(regionCard).join("") || '<p class="command-note">No region has been explored yet. Send expeditions or reveal the map to discover the first biome.</p>') + '</div>' +
        '<div class="command-section-title">ECOLOGICAL RECORD</div><div class="command-history-list">' + ((atlas.history || []).map(historyEntry).join("") || '<p class="command-note">No ecological event has been recorded yet.</p>') + '</div>' +
        '<p class="command-note">The atlas is bounded to 36 regions and is saved with the realm. Rare deposits are not shown until explored and surveyed; every stock, population and policy survives a save and reload.</p>';
}
