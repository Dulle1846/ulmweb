// Management panel for the 1.2.19 biome atlas.
//
// The panel is a pure reader over getBiomeAtlasSnapshot(). Every button names
// one real action; no label is a decorative promise. Region cards stay
// collapsed by default so a late-game atlas remains a bounded DOM cost.
import { state } from "../core/state.js";
import {
    ensureBiomeAtlas, getBiomeRegionSnapshot, syncBiomeDiscovery
} from "../systems/biome-resource-state.js";
import { getBiomeFrontierSupply } from "../systems/biome-market-link.js";
import {
    BIOME_FOCUSES, BIOME_MARKET_CATEGORIES, BIOME_POLICIES, BIOME_PROFILES,
    BIOME_REGION_MAX, BIOME_RESOURCE_CATEGORIES, BIOME_RESOURCE_VERSION
} from "../world/biome-resource-data.js";
import { BIOME_PLANTS } from "../world/biome-generation-data.js";

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
        '<div class="biome-row-actions"><button type="button" data-command="biome-hunt" data-value="' + esc(region.id) + '" data-biome-species="' + esc(row.id) + '"' + (row.population <= 0 ? " disabled" : "") + '>HUNT · ' + number(row.actionCost || 4) + 'G</button>' + (row.population <= 0 && (row.rare || row.endangered) ? '<button type="button" data-command="biome-reintroduce" data-value="' + esc(region.id) + '" data-biome-species="' + esc(row.id) + '">REINTRODUCE · 20G</button>' : '') + '</div></div>';
}
const SYSTEM_GROUPS = [
    ["climate", "CLIMATE & LOCAL FORM"],
    ["soil", "SOIL"],
    ["water", "WATER"],
    ["season", "SEASONS"],
    ["land-use", "LAND USE"],
    ["recovery", "RECOVERY"],
    ["display", "PLAYER READOUT"]
];
const READOUT = [
    ["57", "PREVAILING BIOME"], ["58", "BIOME VARIANTS"],
    ["59", "VEGETATION DENSITY"], ["60", "TYPICAL RESOURCES"],
    ["61", "KEY ANIMALS"], ["62", "CLIMATE"],
    ["63", "SPECIAL HAZARDS"], ["64", "FARM SUITABILITY"],
    ["65", "MOVEMENT"], ["66", "ECOLOGICAL CHANGE"]
];

function systemMeter(label, value, requirements, note = "") {
    const amount = pct(value);
    return '<div class="command-meter" data-biome-requirements="' + esc(requirements) + '"><span>' + esc(label) + '</span><i><b style="width:' + amount + '%"></b></i><strong>' + amount + (note ? ' ' + esc(note) : '') + '</strong></div>';
}

// The ecology and generation ledgers are the two largest blocks in a mature
// card. Their rows are collected once and emitted in bounded slices; the plain
// renderer joins the slices back into the original single string.
function systemLedgerThunks(region) {
    const systems = region.systems;
    if (!systems?.requirements?.length) return [];
    const rows = [];
    for (const [group, label] of SYSTEM_GROUPS) {
        rows.push('<div class="biome-system-group">' + esc(label) + '</div>');
        for (const row of systems.requirements) {
            if (row.group !== group) continue;
            rows.push('<div class="biome-system-row" data-biome-requirement="' + esc(row.id) + '" data-biome-value="' + esc(row.value) + '"><span><b>' + esc(row.label) + '</b><small>' + esc(row.detail) + '</small></span><strong>' + esc(row.value) + '</strong></div>');
        }
    }
    const thunks = [() => '<details class="biome-system-ledger"><summary>FULL ECOLOGY LEDGER · 66 PARAMETERS</summary><div class="biome-system-grid">'];
    for (const chunk of chunkRows(rows, 20)) thunks.push(() => chunk.join(""));
    thunks.push(() => '</div></details>');
    return thunks;
}

function systemsSectionThunks(region) {
    const systems = region.systems;
    if (!systems) return [];
    // The pressure hazard is the one the seasonal bridge can actually mature;
    // the badge must name that hazard, not merely the first sorted severity.
    const pressure = systems.ecology.pressure || {};
    const topHazard = systems.ecology.hazards.find(row => row.id === pressure.hazard)
        || systems.ecology.hazards[0];
    const lastHazard = systems.ecology.lastHazard;
    return [
        () => '<div class="command-section-title">BIOME SYSTEM · ' + esc(systems.zone.toUpperCase()) + ' · ' + esc(systems.variant.toUpperCase()) + '</div>' +
            '<div class="biome-chip-line"><small>CLIMATE ENVELOPE</small><span class="biome-badge">' + esc(systems.climate.tempC + ' °C · ' + systems.climate.precipitation + ' mm') + '</span><span class="biome-badge">' + esc(systems.climate.label.toUpperCase()) + '</span><span class="biome-badge">HUMIDITY ' + systems.climate.humidity + '%</span><span class="biome-badge">SUN ' + systems.climate.insolation + '%</span><span class="biome-badge">WIND ' + systems.climate.wind + '%</span><span class="biome-badge">' + systems.climate.elevationM + ' M</span></div>',
        () => '<div class="biome-chip-line" data-biome-coupling="1.2.21"><small>WORLD EFFECT</small>' +
            '<span class="biome-badge" data-biome-world-effect="movement" data-biome-world-value="' + esc(systems.ecology.movement.toFixed(2)) + '">ROUTE ×' + esc(systems.ecology.movement.toFixed(2)) + '</span>' +
            '<span class="biome-badge" data-biome-world-effect="agriculture" data-biome-world-value="' + esc(systems.ecology.agricultureFactor.toFixed(2)) + '">HARVEST ×' + esc(systems.ecology.agricultureFactor.toFixed(2)) + '</span>' +
            '<span class="biome-badge" data-biome-world-effect="water" data-biome-world-value="' + esc(pressure.waterLevel ?? 0) + '">WATER ' + esc(pressure.waterLevel ?? 0) + '%</span>' +
            '<span class="biome-badge" data-biome-world-effect="scarcity" data-biome-world-value="' + esc(pressure.waterScarcity ?? 0) + '">SCARCITY ' + esc(pressure.waterScarcity ?? 0) + '%</span>' +
            '<span class="biome-badge" data-biome-world-effect="floodplain" data-biome-world-value="' + esc(pressure.floodplain ?? 0) + '">FLOODPLAIN ' + esc(pressure.floodplain ?? 0) + '%</span>' +
            '<span class="biome-badge" data-biome-world-effect="frost" data-biome-world-value="' + esc(pressure.frostRisk ?? 0) + '">FROST ' + esc(pressure.frostRisk ?? 0) + '%</span>' +
            '<span class="biome-badge" data-biome-world-effect="hazard" data-biome-world-value="' + esc(topHazard?.id || "none") + '">HAZARD ' + esc(topHazard?.label?.toUpperCase() || "NONE PRESSING") + '</span>' +
            (lastHazard ? '<span class="biome-badge" data-biome-world-effect="last-hazard" data-biome-world-value="' + esc(lastHazard.id) + '">LAST ' + esc(lastHazard.label.toUpperCase()) + ' · ' + esc(lastHazard.year) + '</span>' : '') +
            '</div>',
        () => '<div class="biome-system-readout">' + READOUT.map(([id, label]) => {
            const key = id === "57" ? "biome" : id === "58" ? "variants" : id === "59" ? "density"
                : id === "60" ? "resources" : id === "61" ? "fauna" : id === "62" ? "climate"
                : id === "63" ? "hazards" : id === "64" ? "agriculture" : id === "65" ? "movement" : "changes";
            return '<span data-biome-requirement="1.2.21.' + id + '"><small>' + label + '</small><strong>' + esc(systems.display[key]) + '</strong></span>';
        }).join("") + '</div>',
        () => '<div class="hazard-work-grid">' +
            systemMeter("SOIL NUTRIENTS", systems.soil.nutrients, "1.2.21.10") +
            systemMeter("SOIL WATER CAPACITY", systems.soil.waterCapacity, "1.2.21.11") +
            systemMeter("COMPACTION", systems.soil.compaction, "1.2.21.12") +
            systemMeter("EROSION", systems.soil.erosion, "1.2.21.13") +
            systemMeter("HUMUS", systems.soil.humus, "1.2.21.14") +
            systemMeter("SOIL ORGANISMS", systems.soil.organisms, "1.2.21.15") +
            systemMeter("SALINITY", systems.soil.salinity, "1.2.21.16") +
            systemMeter("SOIL REGENERATION", systems.soil.regeneration, "1.2.21.18"),
        () => systemMeter("GROUNDWATER", systems.water.groundwater, "1.2.21.21") +
            systemMeter("WATER QUALITY", systems.water.quality, "1.2.21.25") +
            systemMeter("WATER SCARCITY", systems.water.scarcity, "1.2.21.26") +
            systemMeter("FLOODPLAIN", systems.water.floodplain, "1.2.21.23"),
        () => systemMeter("VEGETATION RECOVERY", systems.recovery.vegetation, "1.2.21.49") +
            systemMeter("FOREST REGROWTH", systems.recovery.forest, "1.2.21.50") +
            systemMeter("FAUNA RETURN", systems.recovery.fauna, "1.2.21.52") +
            systemMeter("IRREVERSIBLE LOSS", systems.recovery.irreversible, "1.2.21.56") +
            '</div>',
        () => '<div class="biome-chip-line"><small>SEASON</small><span class="biome-badge">' + esc(systems.season.look.toUpperCase()) + '</span><span class="biome-badge">SNOW ' + systems.season.snowLineM + ' M</span><span class="biome-badge">WATER ' + systems.season.waterLevel + '%</span><span class="biome-badge">FARM ' + systems.season.farmUse + '%</span><span class="biome-badge">ANIMAL ACTIVITY ' + systems.season.animalActivity + '%</span></div>',
        () => '<div class="biome-actions">' +
            '<button type="button" data-command="biome-irrigate" data-value="' + esc(region.id) + '">IRRIGATE · 8G</button>' +
            '<button type="button" data-command="biome-drain" data-value="' + esc(region.id) + '">DRAIN · 8G</button>' +
            '<button type="button" data-command="biome-reforest" data-value="' + esc(region.id) + '">REFOREST · 10G · 6 WOOD</button>' +
            '<button type="button" data-command="biome-clean-water" data-value="' + esc(region.id) + '">CLEAN WATER · 10G</button>' +
            '<button type="button" data-command="biome-slash-burn" data-value="' + esc(region.id) + '">BURN & SOW · 4G</button></div>',
        ...systemLedgerThunks(region)
    ];
}

function generationRequirementRow(row) {
    return '<div class="biome-system-row biome-generation-row" data-biome-generation-requirement="' + esc(row.id) + '" data-biome-generation-value="' + esc(row.value) + '"><span><b>' + esc(row.label) + '</b><small>' + esc(row.detail) + '</small></span><strong>' + esc(row.value) + '</strong></div>';
}

function generationSectionThunks(region) {
    const generation = region.generation;
    if (!generation?.requirements?.length) return [];
    const thunks = [() => {
        const palette = generation.palette;
        return '<div class="command-section-title">BIOME GENERATION · 1.2.22</div>' +
            '<div class="biome-chip-line" data-biome-generation="catalog"><small>IDENTITY</small>' +
            '<span class="biome-badge" data-biome-generation-id="' + esc(generation.biomeId) + '">' + esc(generation.label.toUpperCase()) + '</span>' +
            '<span class="biome-badge">' + esc(palette.base.toUpperCase()) + ' / ' + esc(palette.accent.toUpperCase()) + ' / ' + esc(palette.water.toUpperCase()) + '</span>' +
            '<span class="biome-badge">' + esc(generation.identity.texture.toUpperCase()) + '</span>' +
            '<span class="biome-badge">' + esc(generation.identity.atmosphere.toUpperCase()) + '</span>' +
            '<span class="biome-badge">LANDMARK · ' + esc(generation.identity.landmark.label.toUpperCase()) + '</span></div>';
    }, () => {
        const seasonFaces = generation.identity.seasons.map((face, index) =>
            '<span class="biome-season-swatch" data-biome-season-swatch="' + esc(face.id) + '" data-biome-season-index="' + index + '" style="--season-base:' + esc(face.base) + ';--season-accent:' + esc(face.accent) + '"><i></i><small>' + esc(face.label.toUpperCase()) + '</small><b>' + esc(face.note) + '</b></span>').join("");
        return '<div class="biome-season-strip" data-biome-season-strip="' + esc(generation.biomeId) + '">' + seasonFaces + '</div>';
    }, () => {
        const plantChips = generation.vegetation.speciesIds.slice(0, 8).map(id => {
            const plant = BIOME_PLANTS[id];
            if (!plant) return "";
            return '<span class="biome-plant-chip" data-biome-plant-chip="' + esc(id) + '" style="--plant-color:' + esc(plant.color) + '"><i></i>' + esc(plant.label) + ' <small>' + plant.variants.length + ' var · ' + esc(plant.form) + '</small></span>';
        }).join("");
        return '<div class="biome-chip-line" data-biome-plant-palette><small>PLANT PALETTE</small>' + plantChips + '</div>';
    }, () => {
        const readout = [
            ["DOMINANT BIOME", generation.label + " · " + generation.family],
            ["PATCH STRUCTURE", generation.field.patches + " patches · " + generation.field.minPatch + "–" + generation.field.maxPatch + " cells"],
            ["BOUNDARY", Math.round((1 - generation.field.straightness) * 100) + "% organic · " + (generation.field.checkerRatio * 100).toFixed(2) + "% chequer"],
            ["PLANT MIX", generation.vegetation.species.length + " species · " + generation.vegetation.variants.length + " variants seen"],
            ["HABITAT", generation.habitat.label + " · " + generation.habitat.match + "% fauna match"],
            ["LOD CONTRACT", "≥" + generation.lod.detail + "× detail · ≥" + generation.lod.simplified + "× simple · ≤" + generation.lod.maxParticles + " particles"]
        ].map(([label, value]) => '<span><small>' + label + '</small><strong>' + esc(value) + '</strong></span>').join("");
        return '<div class="biome-system-readout" data-biome-generation-readout> ' + readout + '</div>';
    }, () => '<details class="biome-system-ledger"><summary>FULL GENERATION LEDGER · 54 PARAMETERS</summary><div class="biome-system-grid">'];
    for (const chunk of chunkRows(generation.requirements, 20)) thunks.push(() => chunk.map(generationRequirementRow).join(""));
    thunks.push(() => '</div></details>');
    return thunks;
}

// One mature card is ~58 KB and measured 63 ms to generate in a single part at
// 4x CPU. Every subsection below is a thunk, so the staged scheduler can give
// the head, ledgers, policy grids and table rows their own bounded parts. The
// plain renderer flattens the continuations and joins them into the exact same
// card the old single-string builder produced.
function regionCardSegmentThunks(region, index) {
    const resources = region.resources.filter(row => row.discovered);
    const fauna = region.fauna.filter(row => row.discovered);
    const rareCount = resources.filter(row => row.rare).length;
    const thunks = [() => '<details class="biome-region" data-biome-region="' + esc(region.id) + '"' + (index === 0 ? " open" : "") + '>' +
        '<summary><span class="biome-region-mark" style="background:' + esc(region.color) + '"></span><span class="biome-region-title"><strong>' + esc(region.name) + '</strong><small>' + esc(region.biomeLabel) + ' · quality ' + region.quality + '/100' + (region.engineered ? " · engineered wetland" : "") + (region.protectedArea ? " · PROTECTED" : "") + '</small></span><span class="biome-region-stats"><b>' + region.economy.health + '</b><small>ECOLOGY</small></span><span class="biome-region-stats"><b>' + rareCount + '</b><small>RARE</small></span><span class="biome-region-stats"><b>' + region.economy.importDependency + '%</b><small>IMPORTS</small></span></summary>' +
        '<div class="biome-region-body">' +
        '<div class="biome-region-summary"><span><small>PRODUCTION</small><strong>' + esc(region.productionLabel) + '</strong></span><span><small>SPECIALISATION</small><strong>' + esc(region.focusLabel) + '</strong></span><span><small>POLICY</small><strong>' + esc(region.policyLabel) + '</strong></span><span><small>PRODUCTION COST</small><strong>×' + region.economy.productionCost.toFixed(2) + '</strong></span><span><small>SUPPLY BONUS</small><strong>+' + region.economy.supplyBonus + '</strong></span><span><small>IMPORT COVERAGE</small><strong>' + (region.economy.importCoverage.length ? region.economy.importCoverage.join(", ").toUpperCase() : "NONE") + '</strong></span></div>',
    () => meter("VEGETATION", region.vegetation) + meter("SOIL HEALTH", region.soilHealth) + meter("FRESH WATER", region.water)];
    if (region.discovered) {
        thunks.push(...systemsSectionThunks(region));
        thunks.push(...generationSectionThunks(region));
    }
    thunks.push(() => '<div class="biome-chip-line"><small>LOCAL CRAFTS</small>' + region.crafts.map(craft => '<span class="biome-badge">' + esc(String(craft).toUpperCase()) + '</span>').join("") + '</div>');
    thunks.push(() => {
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
        return '<div class="command-section-title">LOCAL CRAFT RECIPES</div><div class="biome-table">' + (craftRows || '<p class="command-note">No local recipe is available in this region.</p>') + '</div>';
    });
    thunks.push(() => '<p class="command-note">' + esc(region.policyDescription) + ' ' + esc(region.focusDescription) + '</p>');
    thunks.push(() => '<div class="biome-chip-line"><small>LANDSCAPE</small><span class="biome-badge">DISEASE ' + region.economy.diseasePressure + '%</span><span class="biome-badge">CLEAR-CUT ' + region.economy.clearCut + '%</span><span class="biome-badge">EROSION ' + region.economy.erosion + '%</span><span class="biome-badge">CARAVAN ' + region.economy.caravanImports + '</span><span class="biome-badge">' + (region.protectedArea ? 'PROTECTED HABITAT' : 'OPEN TO HARVEST') + '</span></div>');
    thunks.push(() => '<div class="biome-actions"><button type="button" data-command="biome-restore" data-value="' + esc(region.id) + '">RESTORE HABITAT · 12G / 8 WOOD</button><button type="button" data-command="biome-protect" data-value="' + esc(region.id) + '" data-biome-protected="' + (region.protectedArea ? '0' : '1') + '">' + (region.protectedArea ? 'LIFT PROTECTION' : 'PROTECT HABITAT') + '</button>' + (region.surveyLevel < 2 ? '<button type="button" data-command="biome-survey" data-value="' + esc(region.id) + '">' + (region.surveyLevel > 0 ? 'SURVEY RARE SITES' : 'SURVEY REGION') + ' · 10G</button>' : '<span class="biome-badge">FULLY SURVEYED</span>') + '</div>');
    thunks.push(() => {
        const policyButtons = Object.values(BIOME_POLICIES).map(policy =>
            '<button type="button" class="biome-choice' + (region.policy === policy.id ? " is-current" : "") + '" data-command="biome-policy" data-value="' + esc(region.id) + '" data-biome-policy="' + esc(policy.id) + '"><strong>' + esc(policy.short) + '</strong><small>' + esc(policy.label) + '</small></button>'
        ).join("");
        return '<div class="command-section-title">LAND-USE POLICY</div><div class="biome-choice-grid">' + policyButtons + '</div>';
    });
    thunks.push(() => {
        const focusButtons = Object.entries(BIOME_FOCUSES).map(([id, focus]) =>
            '<button type="button" class="biome-choice' + (region.focus === id ? " is-current" : "") + '" data-command="biome-focus" data-value="' + esc(region.id) + '" data-biome-focus="' + esc(id) + '"><strong>' + esc(focus.label.toUpperCase()) + '</strong><small>' + esc(focus.description) + '</small></button>'
        ).join("");
        return '<div class="command-section-title">PRODUCTION FOCUS</div><div class="biome-choice-grid">' + focusButtons + '</div>';
    });
    thunks.push(() => '<div class="command-section-title">KNOWN RESOURCES · ' + resources.length + '</div><div class="biome-table">');
    for (const chunk of chunkRows(resources, 10)) thunks.push(() => chunk.map(row => resourceRow(region, row)).join(""));
    if (!resources.length) thunks.push(() => '<p class="command-note">No resource has been recorded here. Survey the region to reveal its wealth.</p>');
    thunks.push(() => '</div>');
    thunks.push(() => '<div class="command-section-title">WILDLIFE · ' + fauna.length + '</div><div class="biome-table">');
    for (const chunk of chunkRows(fauna, 10)) thunks.push(() => chunk.map(row => faunaRow(region, row)).join(""));
    if (!fauna.length) thunks.push(() => '<p class="command-note">No species has been recorded here yet.</p>');
    thunks.push(() => '</div>');
    thunks.push(() => '<p class="command-note">Rare deposits remain hidden until a survey. Extraction raises pressure and can exhaust a stock; non-renewable minerals never return. Hunting and logging change vegetation, soil and the predator–prey balance in later years.</p>' +
        '</div></details>');
    return thunks;
}
function historyEntry(entry) {
    return '<article class="command-history"><strong>YEAR ' + number(entry.year) + ' · ' + esc(String(entry.kind || "note").toUpperCase()) + '</strong><p>' + esc(entry.text) + '</p></article>';
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
    return chunks;
}

// getBiomeEconomySnapshot() rebuilds all thirty-six region snapshots (and the
// discovered ones twice) in one call, which measured over 250 ms at 4x CPU.
// The panel needs the same derived values, so it takes the same exported region
// snapshots a few at a time and assembles the identical aggregate itself. No
// saved field, discovery rule or economy calculation is changed here.
const BIOME_CORE_CATEGORIES = ["wood", "stone", "food", "ore", "fiber", "herb", "salt"];
const BIOME_FOOD_CATEGORIES = ["fruit", "fish", "meat", "dairy", "egg", "honey", "fungus"];
const BIOME_REGION_CHUNK = 1;

function unavailableBiomeSnapshot() {
    return {
        available: false, version: BIOME_RESOURCE_VERSION, total: BIOME_REGION_MAX, discovered: 0,
        regions: [], surveyed: 0, rareKnown: 0, speciesKnown: 0, rareSpecies: 0,
        history: [], stats: {}, trade: {}, imports: [], exports: [], specialisations: [], health: 0
    };
}

function createBiomeAtlasProducer() {
    return {
        atlas: null, ids: [], index: 0, snapshots: [],
        preparedAtlas: false, preparedDiscovery: false,
        prepareAtlas() {
            if (this.preparedAtlas) return !this.atlas;
            this.preparedAtlas = true;
            this.atlas = ensureBiomeAtlas();
            if (!this.atlas) return true;
            this.ids = this.atlas.regions.map(region => region.id);
            return false;
        },
        prepareDiscovery() {
            if (this.preparedDiscovery || !this.atlas) return !this.atlas;
            this.preparedDiscovery = true;
            syncBiomeDiscovery({ silent: true });
            return false;
        },
        step(limit = BIOME_REGION_CHUNK) {
            const end = Math.min(this.ids.length, this.index + limit);
            while (this.index < end) {
                const snapshot = getBiomeRegionSnapshot(this.ids[this.index++]);
                if (snapshot) this.snapshots.push(snapshot);
            }
            return this.index >= this.ids.length;
        },
        result() {
            const all = this.snapshots;
            const regions = all.filter(region => region.discovered);
            const surveyed = all.filter(region => region.surveyLevel > 0).length;
            const rareKnown = all.reduce((sum, region) => sum + region.resources.filter(row => row.discovered && row.rare).length, 0);
            const speciesKnown = new Set();
            let rareSpecies = 0;
            for (const region of all) {
                for (const row of region.fauna) {
                    if (!row.discovered) continue;
                    speciesKnown.add(row.id);
                    if (row.rare) rareSpecies++;
                }
            }
            const categories = new Set();
            for (const region of regions) {
                for (const row of region.resources) {
                    if (row.discovered && !row.locallyExtinct) categories.add(row.category);
                }
            }
            const imports = BIOME_CORE_CATEGORIES.filter(category => category === "food"
                ? !BIOME_FOOD_CATEGORIES.some(food => categories.has(food))
                : !categories.has(category));
            const exports = [...new Set(regions.flatMap(region => region.economy.exports))].slice(0, 16);
            const specialisations = [...new Set(regions.map(region => region.focusLabel))].slice(0, 8);
            const health = regions.length
                ? Math.round(regions.reduce((sum, region) => sum + region.economy.health, 0) / regions.length)
                : 0;
            const stores = regions.reduce((sum, region) => sum + region.resources.reduce((inner, row) => inner + (row.stored || 0), 0), 0);
            const focusCounts = {};
            for (const region of regions) focusCounts[region.focusLabel] = (focusCounts[region.focusLabel] || 0) + 1;
            const defaultFocus = region => {
                const production = (BIOME_PROFILES[region.biome] || BIOME_PROFILES.meadow).production;
                return production === "pastoralism" ? "pastoralism" : production;
            };
            return {
                available: true,
                version: this.atlas.version,
                seed: this.atlas.seed,
                total: BIOME_REGION_MAX,
                discovered: regions.length,
                surveyed,
                regions,
                rareKnown,
                speciesKnown: speciesKnown.size,
                rareSpecies,
                history: [...(this.atlas.history || [])].reverse().slice(0, 12),
                migration: [...(this.atlas.migration || [])].slice(-8),
                caravans: [...(this.atlas.caravans || [])].slice(-8),
                stats: { ...this.atlas.stats },
                trade: { ...this.atlas.trade },
                imports,
                exports,
                specialisations,
                health,
                stores,
                focusCounts,
                tradeValue: this.atlas.trade.gold || 0,
                supplySecurity: Math.max(0, 100 - imports.length * 11),
                productionCost: regions.length
                    ? Math.round(regions.reduce((sum, region) => sum + region.economy.productionCost, 0) / regions.length * 100) / 100
                    : 1,
                specialisedRegions: regions.filter(region => region.focus !== defaultFocus(region)).length
            };
        }
    };
}

// A mature atlas carries up to thirty-six openable region cards plus five long
// reference blocks. Building all of that in the click task measured too long on
// a low-end phone, so the same content is exposed as bounded parts: one snapshot
// step, one reference block, or one bounded section of a card per part. The
// plain renderer flattens continuations and joins them for callers that still
// expect one string; the management deck hands the functions to the staged
// hydrator instead.
export function renderBiomePanelParts() {
    const late = { atlas: null, regions: null, producer: null, producerStarted: false };
    // Region snapshots are taken a few at a time by prepared parts below; every
    // section then reads one assembled snapshot and the same sorted region list.
    const startProducer = () => {
        if (!late.producerStarted) {
            late.producerStarted = true;
            late.producer = createBiomeAtlasProducer();
        }
        return late.producer;
    };
    const ready = () => {
        if (!late.atlas) {
            const producer = startProducer();
            if (producer) {
                producer.prepareAtlas();
                producer.prepareDiscovery();
                while (!producer.step(36)) { /* finish the atlas */ }
                late.atlas = producer.result();
            } else late.atlas = unavailableBiomeSnapshot();
        }
        return late.atlas;
    };
    const regionsOf = () => {
        const atlas = ready();
        if (!atlas.available) return [];
        if (!late.regions) late.regions = atlas.regions.slice().sort((a, b) => a.index - b.index);
        return late.regions;
    };
    return [
        () => {
            if (!ensureBiomeAtlas()) {
                return intro("THE LIVING LAND", "Biome atlas", "The atlas is generated with the realm. Start or load a realm to survey its resources and wildlife.") +
                    '<p class="command-note">No biome data is available in this session.</p>';
            }
            return intro("THE LIVING LAND", "Biome resources & wildlife", "Every discovered region has its own soil, climate, timber, minerals, plants and animal populations. Production, hunting, rare deposits and ecological recovery are simulated together; the map overlay draws the same saved atlas.");
        },
        // Atlas creation, discovery sync and each exported region snapshot used
        // to share one or two empty continuations. They now get separate parts:
        // the cold atlas/discovery work cannot be charged to the first snapshot,
        // and the staged hydrator still gives each snapshot its own bounded step.
        () => {
            startProducer();
            return "";
        },
        () => {
            startProducer().prepareAtlas();
            return "";
        },
        () => {
            startProducer().prepareDiscovery();
            return "";
        },
        ...Array.from({ length: BIOME_REGION_MAX }, () => () => {
            const producer = startProducer();
            if (producer) producer.step();
            return "";
        }),
        () => {
            ready();
            return "";
        },
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            const season = seasonNames[state.seasonIndex] || "Spring";
            return '<div class="command-summary"><div><small>REGIONS SURVEYED</small><strong>' + atlas.surveyed + ' / ' + atlas.total + '</strong></div><div><small>RARE SITES KNOWN</small><strong>' + atlas.rareKnown + '</strong></div><div><small>SPECIES RECORDED</small><strong>' + atlas.speciesKnown + '</strong></div><div><small>RARE SPECIES</small><strong>' + atlas.rareSpecies + '</strong></div><div><small>STORED GOODS</small><strong>' + number(atlas.stores) + '</strong></div><div><small>ECOLOGICAL HEALTH</small><strong>' + atlas.health + ' / 100</strong></div></div>' +
                '<div class="biome-season"><span class="command-ribbon">' + esc(season.toUpperCase()) + ' SURVEY · YEAR ' + number(state.year) + '</span><p>Seasonal resources are marked in season or dormant. Annual regeneration, breeding, migration, predation, pollination and erosion settle at the year boundary; player actions affect the following year.</p></div>';
        },
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            const regions = regionsOf();
            const systemRegions = regions.filter(region => region.systems);
            const systemZones = new Set(systemRegions.map(region => region.systems.zone));
            const systemSoils = new Set(systemRegions.map(region => region.systems.soil.id));
            const systemVariants = new Set(systemRegions.map(region => region.systems.variant));
            const waterStressed = systemRegions.filter(region => region.systems.water.scarcity >= 55).length;
            const legacyScarred = systemRegions.filter(region => region.systems.recovery.irreversible >= 40).length;
            const regenerating = systemRegions.filter(region => region.systems.recovery.vegetation >= 50 && (region.clearCut > 0.08 || region.systems.legacy > 0.12)).length;
            return '<div class="command-section-title">BIOME SYSTEMS · 1.2.21</div><div class="command-summary biome-system-summary"><div><small>CLIMATE ZONES</small><strong>' + systemZones.size + ' / 8</strong></div><div><small>SOIL TYPES</small><strong>' + systemSoils.size + ' / 14</strong></div><div><small>LOCAL VARIANTS</small><strong>' + systemVariants.size + '</strong></div><div><small>WATER-STRESSED</small><strong>' + waterStressed + '</strong></div><div><small>IRREVERSIBLE SCARS</small><strong>' + legacyScarred + '</strong></div><div><small>REGENERATING</small><strong>' + regenerating + '</strong></div></div>';
        },
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            const stats = atlas.stats || {};
            return '<div class="command-section-title">REGIONAL ECONOMY</div><div class="biome-economy-grid"><div><small>PRODUCTION COST</small><strong>×' + Number(atlas.productionCost || 1).toFixed(2) + '</strong><span>Average of surveyed policies</span></div><div><small>TRADE REVENUE</small><strong>' + number(atlas.trade?.gold || 0) + ' G</strong><span>Goods actually sold</span></div><div><small>IMPORT DEPENDENCE</small><strong>' + (100 - Number(atlas.supplySecurity || 0)) + '%</strong><span>Core categories not found locally</span></div><div><small>POTENTIAL OUTPUT</small><strong>' + number(stats.potentialYield || 0) + '</strong><span>Raw goods available per year</span></div><div><small>CARAVAN SPEND</small><strong>' + number(atlas.trade?.caravanSpend || 0) + ' G</strong><span>Import substitution paid for</span></div></div>';
        },
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            const importList = atlas.imports.length ? atlas.imports.map(value => '<span class="biome-badge is-danger">' + esc(value.toUpperCase()) + '</span>').join("") : '<span class="biome-badge">SELF-SUFFICIENT</span>';
            const exportList = atlas.exports.length ? atlas.exports.slice(0, 10).map(value => '<span class="biome-badge is-rare">' + esc(value.toUpperCase()) + '</span>').join("") : '<span class="command-note">No export good is known yet.</span>';
            const specialisations = atlas.specialisations.length ? atlas.specialisations.map(value => '<span class="biome-badge">' + esc(value.toUpperCase()) + '</span>').join("") : '<span class="command-note">No regional specialisation has emerged.</span>';
            return '<div class="biome-chip-line"><small>IMPORTED RAW MATERIALS</small>' + importList + '</div><div class="biome-chip-line"><small>REGIONAL EXPORTS</small>' + exportList + '</div><div class="biome-chip-line"><small>SPECIALISATIONS</small>' + specialisations + '</div>';
        },
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            const frontier = getBiomeFrontierSupply();
            const frontierList = BIOME_MARKET_CATEGORIES.map(category => {
                const row = frontier.categories?.[category];
                if (!row?.known) return '<span class="biome-badge">' + category.toUpperCase() + ' · UNCHARTED</span>';
                const effect = Math.round((Number(row.priceFactor || 1) - 1) * 100);
                return '<span class="biome-badge' + (effect > 0 ? ' is-rare' : '') + '">' + category.toUpperCase() + ' '
                    + Math.round(Number(row.cover || 0) * 100) + '% STOCK · ' + (effect > 0 ? '+' : '') + effect + '% QUOTE</span>';
            }).join("");
            return '<div class="biome-chip-line"><small>FRONTIER MARKET</small>' + frontierList + '</div>' +
                '<p class="command-note">The Regional Exchange reads these surveyed stocks on its next 90-day quote. Harvesting lowers stock and raises the quote; protection, fallow years and annual regrowth ease it. Stored frontier goods sell at the current market quote.</p>';
        },
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            const regions = regionsOf();
            return '<div class="command-section-title">DISCOVERED REGIONS · ' + regions.length + '</div><div class="biome-region-list">' +
                (regions.length ? "" : '<p class="command-note">No region has been explored yet. Send expeditions or reveal the map to discover the first biome.</p>');
        },
        // A card is generated into a private buffer by bounded segment thunks,
        // then mounted as one intact <details> so its ledger and table rows stay
        // descendants of the card. Undiscovered regions produce no card and no
        // continuations at all.
        ...Array.from({ length: BIOME_REGION_MAX }, (_, index) => () => {
            const regions = regionsOf();
            if (index >= regions.length) return "";
            const buffer = [];
            const thunks = regionCardSegmentThunks(regions[index], index);
            return {
                html: "",
                more: [
                    ...thunks.map(thunk => () => {
                        buffer.push(thunk());
                        return "";
                    }),
                    () => ({ into: ".biome-region-list", html: buffer.join("") })
                ]
            };
        }),
        () => {
            const atlas = ready();
            if (!atlas.available) return "";
            return '</div><div class="command-section-title">ECOLOGICAL RECORD</div><div class="command-history-list">' +
                ((atlas.history || []).map(historyEntry).join("") || '<p class="command-note">No ecological event has been recorded yet.</p>') + '</div>';
        },
        () => ready().available ? '<p class="command-note">The atlas is bounded to 36 regions and is saved with the realm. Rare deposits are not shown until explored and surveyed; every stock, population and policy survives a save and reload.</p>' : ""
    ];
}

// Plain callers still receive one string. Flattening `more` here keeps the
// joined parts byte-identical to the staged path, including every card segment.
function resolvePanelParts(parts) {
    let html = "";
    for (let index = 0; index < parts.length; index++) {
        const value = typeof parts[index] === "function" ? parts[index]() : parts[index];
        const raw = typeof value === "string" ? value
            : typeof value?.html === "function" ? value.html() : value?.html;
        if (Array.isArray(value?.more) && value.more.length) parts.splice(index + 1, 0, ...value.more);
        html += typeof raw === "string" ? raw : "";
    }
    return html;
}

export function renderBiomePanel() {
    return resolvePanelParts(renderBiomePanelParts());
}
