// Player-facing forest legacy ledger. Pure reader plus action buttons; the
// annual consequences live in the shared system module.
import { state } from "../core/state.js";
import {
    ensureForestLegacy, forestLegacySummary, FOREST_LEGACY_AFFOREST_COST,
    FOREST_LEGACY_CITIZEN_COSTS, FOREST_LEGACY_MONUMENT_COST,
    FOREST_LEGACY_PROTECTION_COST, FOREST_LEGACY_REINTRODUCTION_COST,
} from "../systems/forest-legacy.js";
import { FOREST_CONSERVATION_LAWS, FOREST_CONSERVATION_LAW_IDS } from "../world/forest-legacy-data.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(?:\d{3})+(?!\d))/g, ",");
const amount = value => String(Math.round((Number(value) || 0) * 100) / 100).replace(/\B(?=(?:\d{3})+(?!\d))/g, ",");
const pct = value => Math.round((Number(value) || 0) * 100);
const clampPct = value => Math.max(0, Math.min(100, pct(value)));
const signed = value => {
    const rounded = Math.round((Number(value) || 0) * 100);
    return (rounded > 0 ? "+" : "") + rounded + "%";
};
const resources = () => state.resources || { gold: 0, wood: 0, stone: 0 };
const canPay = cost => (Number(resources().gold) || 0) >= Number(cost.gold || 0)
    && (Number(resources().wood) || 0) >= Number(cost.wood || 0)
    && (Number(resources().stone) || 0) >= Number(cost.stone || 0);
const costLabel = cost => [cost.gold ? cost.gold + "G" : "", cost.wood ? cost.wood + "W" : "", cost.stone ? cost.stone + "S" : ""].filter(Boolean).join(" · ");

function meter(label, value, detail = "") {
    return '<span class="forest-legacy__meter"><small>' + esc(label) + '</small>'
        + '<i><b style="width:' + clampPct(value) + '%"></b></i><em>' + esc(detail) + '</em></span>';
}

function dash(value, suffix = "") {
    return number(value) + suffix;
}

function institutionCard(entry, stocks) {
    const atMax = entry.level >= 3;
    const cost = entry.nextCost;
    const disabled = atMax || !cost || !canPay(cost);
    const reason = atMax ? "Highest level reached." : !cost ? "Unavailable." : !canPay(cost) ? "Not enough " + ["gold", "wood", "stone"].filter(key => Number(resources()[key]) < Number(cost[key] || 0)).join(", ") + "." : "";
    const stock = entry.id === "seed-bank" ? stocks.seed + " seed" : entry.id === "gene-bank" ? stocks.gene + " lines" : entry.id === "nursery" ? stocks.seedlings + " seedlings" : stocks.museum + " specimens";
    return '<article class="forest-legacy__institution" data-legacy-institution="' + esc(entry.id) + '" data-legacy-level="' + number(entry.level) + '">'
        + '<header><span>' + esc(entry.icon) + '</span><div><b>' + esc(entry.label) + '</b><small>LEVEL ' + number(entry.level) + ' / 3 · ' + esc(stock) + '</small></div></header>'
        + '<p>' + esc(entry.description) + '</p>'
        + '<div class="forest-legacy__levels">' + [1, 2, 3].map(level => '<i class="' + (level <= entry.level ? 'is-filled' : '') + '"></i>').join("") + '</div>'
        + '<button type="button" class="command-choice forest-legacy__button" data-legacy-build="' + esc(entry.id) + '"' + (disabled ? ' disabled title="' + esc(reason) + '"' : '') + '>'
        + (atMax ? 'COMPLETE' : 'RAISE · ' + esc(costLabel(cost || {}))) + '</button></article>';
}

function ringChart(rings) {
    if (!rings.length) return '<span class="forest-legacy__empty">No ring recorded yet.</span>';
    return '<div class="forest-legacy__rings" role="img" aria-label="Tree-ring climate archive, newest first">'
        + rings.slice(0, 10).map(ring => '<span title="Year ' + esc(ring.year) + ' · growth ' + esc(ring.growth) + ' · stress ' + esc(ring.stress) + (ring.event ? ' · ' + esc(ring.event) : '') + '">'
            + '<i style="height:' + Math.max(8, Math.round(Math.min(1.4, Number(ring.growth) || 0.1) / 1.4 * 34)) + 'px;opacity:' + (0.45 + (1 - Math.min(1, Number(ring.stress) || 0)) * 0.55) + '"></i>'
            + '<b>' + esc(String(ring.year).slice(-2)) + '</b></span>').join("")
        + '</div>';
}

function speciesRow(species) {
    const extinct = species.status === "extinct";
    const label = species.kind === "tree" ? "TREE" : "ANIMAL";
    const detail = species.kind === "tree"
        ? Math.round(species.share) + "% canopy · stress " + Math.round(species.stress)
        : number(species.population) + " head · stress " + Math.round(species.stress);
    return '<div class="forest-legacy__species' + (extinct ? ' is-extinct' : '') + '" data-legacy-species="' + esc(species.id) + '" data-species-status="' + esc(species.status) + '">'
        + '<span>' + esc(label) + '</span><b>' + esc(species.label) + '</b>'
        + '<small>' + esc(detail) + ' · ' + esc(species.elevationM) + ' m · gene ' + Math.round(species.geneticDiversity * 100) + '%'
        + (species.seedBackup || species.geneBackup ? ' · backed up' : '') + '</small></div>';
}

function hazardChips(region) {
    return region.hazards.map(hazard => '<span class="forest-legacy__hazard' + (hazard.year > 0 ? ' has-event' : '') + '" title="' + esc(hazard.description) + '">'
        + '<b>' + esc(hazard.icon) + ' ' + esc(hazard.label) + '</b><small>' + (hazard.year > 0 ? 'year ' + number(hazard.year) + ' · severity ' + Math.round(hazard.severity * 100) + '%' : 'no event recorded') + '</small></span>').join("");
}

function regionCard(region, summary, index) {
    const instant = summary.actions.some(action => action.regionId === region.id);
    const rules = region.protection === "reserve" ? "NO SALVAGE" : region.protection === "community" ? "COMMUNITY USE" : region.protection === "monument" ? "MONUMENT GUARD" : "OPEN WOOD";
    const nursery = summary.institutions.find(entry => entry.id === "nursery")?.level || 0;
    const hasExtinct = region.extinct > 0;
    const actedThisYear = Boolean(region.actedThisYear);
    const protectDisabled = region.protection !== "none" || !canPay(FOREST_LEGACY_PROTECTION_COST);
    const afforestDisabled = actedThisYear || nursery < 1 || summary.stocks.seedlings < FOREST_LEGACY_AFFOREST_COST.seedlings || !canPay(FOREST_LEGACY_AFFOREST_COST);
    const reintroDisabled = actedThisYear || !hasExtinct || (summary.stocks.gene < 1 && summary.stocks.seed < 1) || !canPay(FOREST_LEGACY_REINTRODUCTION_COST);
    const monumentDisabled = actedThisYear || region.ageYears < 100 || !canPay(FOREST_LEGACY_MONUMENT_COST);
    const protectReason = region.protection !== "none" ? "Already protected." : !canPay(FOREST_LEGACY_PROTECTION_COST) ? "Needs 18 gold." : "";
    const afforestReason = actedThisYear ? "One wood action per year. The next annual pass reopens it." : nursery < 1 ? "Build a tree nursery first." : summary.stocks.seedlings < FOREST_LEGACY_AFFOREST_COST.seedlings ? "Needs 8 nursery seedlings." : !canPay(FOREST_LEGACY_AFFOREST_COST) ? "Needs 10 gold and 8 wood." : "";
    const reintroReason = actedThisYear ? "One wood action per year. The next annual pass reopens it." : !hasExtinct ? "No locally extinct species." : summary.stocks.gene < 1 && summary.stocks.seed < 1 ? "Needs seed or gene material." : !canPay(FOREST_LEGACY_REINTRODUCTION_COST) ? "Needs 14 gold." : "";
    const monumentReason = actedThisYear ? "One wood action per year. The next annual pass reopens it." : region.ageYears < 100 ? "The stand is younger than 100 years." : !canPay(FOREST_LEGACY_MONUMENT_COST) ? "Needs 16 gold and 6 wood." : "";
    return '<details class="forest-legacy__region" data-legacy-region="' + esc(region.id) + '" data-legacy-phase="' + esc(region.phase) + '" data-legacy-protection="' + esc(region.protection) + '" data-legacy-species-count="' + number(region.living) + '"' + (index === 0 ? ' open' : '') + '>'
        + '<summary><span class="forest-legacy__region-icon">' + (region.rare ? '✦' : '◆') + '</span>'
        + '<span class="forest-legacy__region-title"><b>' + esc(region.name) + '</b><small>' + esc(region.typeLabel) + ' · ' + esc(region.phaseLabel) + ' · ' + number(region.ageYears) + ' years</small></span>'
        + '<span class="forest-legacy__region-state">' + esc(region.protectionLabel) + '<b>' + Math.round(region.canopy * 100) + '% canopy</b></span></summary>'
        + '<div class="forest-legacy__region-body">'
        + '<div class="forest-legacy__factgrid">'
        + '<span><small>CLIMATE</small><b>' + esc(region.climatePressure) + ' / 100</b><em>' + esc(region.climate) + ' · ' + esc(region.elevationM) + ' m</em></span>'
        + '<span><small>LIVING / LOST</small><b>' + number(region.living) + ' / ' + number(region.extinct) + '</b><em>' + number(region.treeShare) + '% tree canopy</em></span>'
        + '<span><small>OBSERVATIONS</small><b>' + number(region.observations) + '</b><em>' + number(region.rings) + ' annual rings</em></span>'
        + '<span><small>RULES</small><b>' + esc(rules) + '</b><em>' + esc(region.monuments ? region.monuments + ' monument(s)' : 'no monument') + '</em></span></div>'
        + '<div class="forest-legacy__hazards">' + hazardChips(region) + '</div>'
        + '<div class="forest-legacy__section-label">SPECIES COHORTS</div>'
        + '<div class="forest-legacy__species-list">' + (region.species.length ? region.species.map(row => '<div class="forest-legacy__species' + (row.status === "extinct" ? " is-extinct" : "") + '"><span>' + (row.kind === "tree" ? "TREE" : "ANIMAL") + '</span><b>' + esc(row.label) + '</b><small>' + (row.kind === "tree" ? Math.round(row.share) + "% canopy" : number(row.population) + " head") + " · stress " + Math.round(row.stress) + " · " + esc(row.elevationM) + " m" + (row.status === "extinct" ? " · EXTINCT" : "") + '</small></div>').join("") : '<p class="command-note">No species cohort survives in this register.</p>') + '</div>'
        + (region.monumentList.length ? '<div class="forest-legacy__section-label">ANCIENT TREES &amp; MEMORY</div><div class="forest-legacy__monuments">'
            + region.monumentList.map(monument => '<article class="forest-legacy__monument" data-legacy-monument="' + esc(monument.id) + '"><b>' + esc(monument.label) + '</b><small>' + esc(monument.ageYears) + ' years · named year ' + esc(monument.year) + '</small><p>' + esc(monument.story) + '</p></article>').join("")
            + '</div>' : '')
        + '<div class="forest-legacy__section-label">TREE-RING ARCHIVE</div>' + ringChart(region.ringArchive)
        + '<div class="forest-legacy__section-label">CENTURY PROJECTION</div><div class="forest-legacy__century">'
        + (region.century || []).map(entry => '<span><b>+' + number(entry.horizon) + ' Y</b><small>' + esc(entry.phaseLabel) + ' · ' + Math.round(entry.canopy * 100) + '% crown</small><em>' + esc(entry.note) + '</em></span>').join("")
        + '</div>'
        + '<div class="forest-legacy__actions">'
        + '<button type="button" class="command-choice forest-legacy__button" data-legacy-region-action="protect" data-legacy-region="' + esc(region.id) + '"' + (protectDisabled ? ' disabled title="' + esc(protectReason) + '"' : '') + '>PROTECT · 18G</button>'
        + '<button type="button" class="command-choice forest-legacy__button" data-legacy-region-action="afforest" data-legacy-region="' + esc(region.id) + '"' + (afforestDisabled ? ' disabled title="' + esc(afforestReason) + '"' : '') + '>AFFOREST · 10G · 8W · 8 SEEDLINGS</button>'
        + '<button type="button" class="command-choice forest-legacy__button" data-legacy-region-action="reintroduce" data-legacy-region="' + esc(region.id) + '"' + (reintroDisabled ? ' disabled title="' + esc(reintroReason) + '"' : '') + '>REINTRODUCE LOST SPECIES</button>'
        + '<button type="button" class="command-choice forest-legacy__button" data-legacy-region-action="monument" data-legacy-region="' + esc(region.id) + '"' + (monumentDisabled ? ' disabled title="' + esc(monumentReason) + '"' : '') + '>NAME OLD TREE · 16G · 6W</button>'
        + '</div>'
        + '<p class="command-note">' + esc(region.protection === "reserve" ? "The reserve forbids salvage logging; its seed, gene and observation work has priority." : region.protection === "community" ? "Community wood: local use continues and volunteer observation is cheaper." : region.protection === "monument" ? "The named tree is untouchable; the surrounding stand remains worked." : "Open wood: ordinary salvage and extraction apply. Protection changes the next annual hazard.") + '</p>'
        + '</div></details>';
}

function achievementGrid(summary) {
    return summary.achievements.map(entry => '<article class="forest-legacy__achievement' + (entry.earned ? ' is-earned' : '') + '" data-legacy-achievement="' + esc(entry.id) + '" data-earned="' + (entry.earned ? '1' : '0') + '">'
        + '<span>' + (entry.earned ? '✦' : '◇') + '</span><div><b>' + esc(entry.label) + '</b><small>' + esc(entry.detail) + '</small></div>'
        + '<em>' + (entry.earned ? 'YEAR ' + number(entry.year) : 'LOCKED') + '</em></article>').join("");
}

function codexBlock(summary) {
    const known = summary.codex.known;
    const rows = known.length ? known.slice(0, 24).map(entry => '<div class="forest-legacy__codex-row" data-legacy-codex="' + esc(entry.kind) + '"><span>' + esc(entry.kind.toUpperCase()) + '</span><b>' + esc(entry.label) + '</b><small>' + esc(entry.regionName || "Realm") + ' · year ' + number(entry.year) + '</small><p>' + esc(entry.detail) + '</p></div>').join("") : '<p class="command-note">No observation has been recorded. Build a museum or fund citizen science.</p>';
    return '<details class="forest-legacy__details" data-legacy-codex-known="' + number(summary.codex.knownCount) + '"><summary><span>CODEX · ' + number(summary.codex.knownCount) + ' / ' + number(summary.codex.total) + ' ENTRIES</span><strong>Trees, animals and forest cultures</strong><em>Museum and volunteer observations reveal more</em></summary><div class="forest-legacy__codex">' + rows + '</div></details>';
}

function referenceBlock(summary) {
    const mods = summary.moddedTypes.length
        ? summary.moddedTypes.map(entry => '<div data-legacy-mod="' + esc(entry.id) + '"><b>' + esc(entry.label) + '</b><small>' + esc(entry.packName || "local data pack") + ' · ' + esc((entry.climates || []).join(", ")) + ' · ' + entry.species.length + ' species</small></div>').join("")
        : '<p class="command-note">No custom forest type is installed. A validated data pack can add one, its species and a community scenario without executable code.</p>';
    return '<details class="forest-legacy__details" data-legacy-reference="' + summary.referenceCases.length + '"><summary><span>REFERENCE SEEDS · ' + summary.referenceCases.length + '</span><strong>Same seed, same wood</strong><em>Visual and ecological tests share these ten cases</em></summary><div class="forest-legacy__reference">'
        + summary.referenceCases.map(entry => '<span data-legacy-reference-region="' + esc(entry.regionId) + '"><b>' + esc(entry.regionId) + '</b><small>seed ' + number(entry.seed) + ' · ' + esc(entry.climate) + '</small></span>').join("")
        + '</div><div class="forest-legacy__mods">' + mods + '</div></details>';
}

function fieldGuide(summary) {
    const rows = summary.groups.map(group => {
        const entries = summary.requirements.filter(entry => group.ids.includes(entry.id));
        return '<div class="forest-legacy__guide-group"><h4>' + esc(group.label) + '</h4>'
            + entries.map(entry => '<article data-legacy-point="' + esc(entry.id) + '"><b>' + esc(entry.id.slice(-3)) + '</b><div><strong>' + esc(entry.title) + '</strong><p>' + esc(entry.detail) + '</p><small>LIVE: ' + esc(entry.consumer) + '</small></div></article>').join("")
            + '</div>';
    }).join("");
    return '<details class="forest-legacy__details" data-legacy-guide="30"><summary><span>FIELD GUIDE · 30 POINTS</span><strong>1.2.23.1.271–300</strong><em>Every point names its live consumer</em></summary><div class="forest-legacy__guide">' + rows + '</div></details>';
}

export function legacyBlock() {
    ensureForestLegacy();
    const summary = forestLegacySummary();
    const stocks = summary.stocks;
    const institutionCards = summary.institutions.map(entry => institutionCard(entry, stocks)).join("");
    const laws = FOREST_CONSERVATION_LAW_IDS.map(id => {
        const law = FOREST_CONSERVATION_LAWS[id];
        const active = summary.lawId === id;
        const disabled = active || !canPay({ gold: law.gold || 0 });
        return '<button type="button" class="forest-legacy__law' + (active ? ' is-active' : '') + '" data-legacy-law="' + esc(id) + '"' + (disabled ? ' disabled title="' + esc(active ? "Already in force." : "Needs " + (law.gold || 0) + " gold.") + '"' : '') + '>'
            + '<b>' + esc(law.short) + '</b><small>' + esc(law.description) + '</small></button>';
    }).join("");
    const citizenCost = FOREST_LEGACY_CITIZEN_COSTS[summary.citizenScience.level];
    const citizenDisabled = !citizenCost || !canPay(citizenCost);
    const protectedCount = summary.regions.filter(region => region.protection !== "none").length;
    const regionCards = summary.regions.map((region, index) => regionCard(region, summary, index)).join("");
    return '<section class="forest-legacy" data-forest-legacy="30" data-legacy-regions="' + number(summary.regions.length) + '" data-legacy-protected="' + number(protectedCount) + '" data-legacy-law="' + esc(summary.lawId) + '">'
        + '<div class="command-section-title">FOREST LEGACY · LONG-TERM SYSTEMS, EVENTS, MODDING AND QA</div>'
        + '<p class="command-note forest-legacy__intro">Ten province woods, one shared yearly pass. This register does not replace the stand model: it records the slow consequences — succession, climate migration, extinction and return, protection, seed and gene work, hazards, rings and the memory of old trees — and feeds real gold, wood, food, legitimacy and the living biome atlas.</p>'
        + '<div class="command-summary forest-legacy__summary">'
        + '<div><small>LIVING WOODS</small><strong>' + number(summary.regions.length) + ' REGIONS</strong></div>'
        + '<div><small>PROTECTED</small><strong>' + number(protectedCount) + ' / ' + number(summary.regions.length) + '</strong></div>'
        + '<div><small>LOCAL EXTINCTIONS</small><strong>' + number(summary.stats.extinctions) + '</strong></div>'
        + '<div><small>RINGS KEPT</small><strong>' + number(summary.stats.rings) + '</strong></div>'
        + '<div><small>ACHIEVEMENTS</small><strong>' + number(summary.achievements.filter(entry => entry.earned).length) + ' / ' + number(summary.achievements.length) + '</strong></div>'
        + '</div>'
        + '<div class="forest-legacy__climate"><div><small>CLIMATE ARCHIVE</small><b>Warming ' + signed(summary.climate.warming) + ' · drift ' + number(summary.climate.drift) + ' · shift years ' + number(summary.climate.shiftYears) + '</b><p>' + (summary.climate.warming > 0.08 ? "The dry/warm signal is now strong enough to move the region's forest analogue." : "The long climate signal is still within the historical envelope; the annual rings record every step.") + '</p></div>'
        + '<div><small>CONSERVATION LAW</small><b>' + esc(summary.law.label) + '</b><p>' + esc(summary.law.description) + '</p><small class="forest-legacy__stamp">' + (summary.lawYear ? "IN FORCE SINCE YEAR " + number(summary.lawYear) : "NO STANDING LAW") + '</small></div></div>'
        + '<div class="forest-legacy__law-grid">' + laws + '</div>'
        + '<div class="command-section-title">INSTITUTIONS · SEED, GENE, NURSERY AND MUSEUM</div>'
        + '<div class="forest-legacy__institutions">' + institutionCards + '</div>'
        + '<div class="forest-legacy__stocks"><span><small>SEED STOCK</small><b>' + number(stocks.seed) + '</b></span><span><small>GENE LINES</small><b>' + number(stocks.gene) + '</b></span><span><small>SEEDLINGS</small><b>' + number(stocks.seedlings) + '</b></span><span><small>SPECIMENS</small><b>' + number(stocks.museum) + '</b></span>'
        + '<button type="button" class="command-choice forest-legacy__button" data-legacy-citizen="1"' + (citizenDisabled ? ' disabled title="' + esc(summary.citizenScience.level >= 3 ? "Highest level reached." : "Not enough gold.") + '"' : '') + '>CITIZEN SCIENCE · ' + number(summary.citizenScience.level) + ' / 3' + (citizenCost ? ' · ' + esc(costLabel(citizenCost)) : '') + '</button></div>'
        + '<p class="command-note">Seed and gene stock back up the most stressed cohort each year. The nursery produces seedlings; afforestation spends them. A reserve gives up salvage timber but sharply reduces hazard and extinction pressure. The conservation law is one political decision per year.</p>'
        + '<div class="command-section-title">PROVINCE WOODS · OPEN A REGION</div>'
        + '<div class="forest-legacy__regions">' + regionCards + '</div>'
        + '<div class="command-section-title">ACHIEVEMENTS</div><div class="forest-legacy__achievements">' + achievementGrid(summary) + '</div>'
        + codexBlock(summary)
        + referenceBlock(summary)
        + fieldGuide(summary)
        + '<p class="command-note forest-legacy__guardrail">Guardrail: the ledger advances once per year on the existing annual chain. It adds no per-frame, per-tick or per-tile work; every stored array is bounded; old saves without the field start from a deterministic fresh ledger.</p>'
        + '</section>';
}

export const __internals = Object.freeze({ institutionCard, regionCard, ringChart, codexBlock });
