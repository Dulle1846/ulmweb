// Player-facing frontier biome register. Pure reader plus real action buttons;
// every annual consequence lives in the shared biome-frontier system module.
import { biomeFrontierSummary } from "../systems/biome-frontiers.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(?:\d{3})+(?!\d))/g, ",");
const pct = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const signed = value => {
    const rounded = Math.round((Number(value) || 0) * 100);
    return (rounded > 0 ? "+" : "") + rounded + "%";
};
const costLabel = cost => [cost.gold ? cost.gold + "G" : "", cost.wood ? cost.wood + "W" : "", cost.stone ? cost.stone + "S" : ""]
    .filter(Boolean).join(" · ") || "FREE";

function meter(label, value, tone = "") {
    return '<span class="biome-frontier__meter' + (tone ? " is-" + esc(tone) : "") + '"><small>' + esc(label) + '</small>'
        + '<i><b style="width:' + pct(value) + '%"></b></i><em>' + pct(value) + '</em></span>';
}

function chip(label, value) {
    return '<span class="biome-badge"><small>' + esc(label) + '</small> ' + esc(value) + '</span>';
}

function hazardRow(row) {
    const known = row.year > 0;
    return '<div class="biome-frontier__hazard" data-frontier-hazard="' + esc(row.id) + '" data-frontier-hazard-year="' + number(row.year) + '">'
        + '<b>' + esc(row.label) + '</b><small>' + esc(row.trigger) + '</small>'
        + '<em>' + (known ? "YEAR " + number(row.year) + " · SEVERITY " + Math.round(row.severity * 100) + "%" : "NO EVENT RECORDED") + '</em>'
        + '<p>' + esc(row.effect) + '</p></div>';
}

function speciesRow(row) {
    const vanished = row.status === "vanished";
    return '<div class="biome-frontier__species' + (vanished ? " is-vanished" : "") + '" data-frontier-species="' + esc(row.id) + '" data-frontier-species-status="' + esc(row.status) + '">'
        + '<span>' + esc(row.kind.toUpperCase()) + '</span><b>' + esc(row.label) + '</b>'
        + '<small>' + (vanished ? "VANISHED" : Math.round(row.cover) + "% cover") + (row.note ? " · " + esc(row.note) : "") + '</small></div>';
}

function specialistRow(row) {
    const vanished = row.status === "vanished";
    return '<div class="biome-frontier__specialist' + (vanished ? " is-vanished" : "") + '" data-frontier-specialist="' + esc(row.id) + '" data-frontier-specialist-status="' + esc(row.status) + '">'
        + '<span>' + (vanished ? "◇" : "✦") + '</span><b>' + esc(row.label) + '</b>'
        + '<small>' + (vanished ? "LOST FROM THE SITE" : "LIVING") + ' · ' + esc(row.note) + '</small></div>';
}

function rewardText(reward = {}) {
    return [
        reward.gold ? "+" + number(reward.gold) + "G" : "",
        reward.food ? "+" + number(reward.food) + " food" : "",
        reward.wood ? "+" + number(reward.wood) + " wood" : "",
        reward.stone ? "+" + number(reward.stone) + " stone" : "",
        reward.morale ? "+" + reward.morale + " morale" : "",
        reward.legitimacy ? "+" + reward.legitimacy + " legitimacy" : "",
        reward.relation ? "+" + reward.relation + " relations" : "",
        reward.military ? "+" + reward.military + " soldier morale" : "",
        reward.magic ? (reward.magic > 0 ? "+" : "") + reward.magic + " magic" : "",
        reward.corruption ? (reward.corruption > 0 ? "+" : "") + reward.corruption + " corruption" : "",
        reward.goods ? "+" + reward.goods + " goods" : "",
        reward.prestige ? "+" + reward.prestige + " prestige" : "",
        reward.charter ? "CROWN CHARTER" : "",
    ].filter(Boolean).join(" · ");
}

function journalRow(entry) {
    const gate = entry.tierAccessible ? "LOCKED · " + entry.goalLabel : "LOCKED · COMPLETE TIER " + (entry.tier - 1);
    return '<div class="biome-frontier__journal-entry' + (entry.unlocked ? " is-found" : "") + (entry.tierAccessible ? "" : " is-gated") + '" data-frontier-journal="' + esc(entry.id) + '" data-frontier-journal-unlocked="' + (entry.unlocked ? "1" : "0") + '" data-frontier-journal-tier="' + entry.tier + '">'
        + '<span>' + (entry.unlocked ? "✦" : "T" + entry.tier) + '</span><div><b>' + esc(entry.label) + '</b><small>'
        + (entry.unlocked ? esc(entry.detail) : gate) + '</small>'
        + '<em class="biome-frontier__journal-reward">' + esc(rewardText(entry.reward)) + '</em>'
        + '</div></div>';
}

const TIER_LABELS = ["SURVEY", "STEWARDSHIP", "CHARTER", "DEEP TIME", "LEGACY", "APEX"];

function journalTierBlock(site, group) {
    const rows = site.journal.filter(entry => entry.tier === group.tier);
    const state = group.complete ? "complete" : group.unlocked > 0 ? "active" : "locked";
    const gate = group.complete ? "COMPLETE" : group.unlocked > 0 ? "IN PROGRESS" : group.tier === 1 ? "OPEN FROM THE START" : "LOCKED UNTIL TIER " + (group.tier - 1) + " COMPLETES";
    return '<div class="biome-frontier__journal-tier" data-frontier-journal-tier-block="' + group.tier + '" data-frontier-journal-tier="' + group.tier + '" data-frontier-journal-tier-state="' + state + '" data-frontier-journal-tier-unlocked="' + group.unlocked + '" data-frontier-journal-tier-total="' + group.total + '">'
        + '<header><b>TIER ' + group.tier + ' · ' + (TIER_LABELS[group.tier - 1] || "CHARTER") + '</b><span>' + group.unlocked + ' / ' + group.total + ' · ' + gate + '</span></header>'
        + '<div class="biome-frontier__journal">' + rows.map(journalRow).join("") + '</div></div>';
}

function commissionCard(site) {
    const commission = site.commission;
    if (!commission) {
        return '<div class="biome-frontier__commission is-idle" data-frontier-commission="none"><b>NO FIELD COMMISSION OPEN</b><p>Survey this site to receive a six-year rotating commission. Commissions are issued only after the first survey, so a long campaign is never rebalanced before the crown can see the site.</p></div>';
    }
    const done = commission.paid || commission.progress >= commission.at;
    const width = Math.max(0, Math.min(100, Math.round(commission.progress / Math.max(1, commission.at) * 100)));
    return '<article class="biome-frontier__commission' + (done ? " is-paid" : "") + '" data-frontier-commission="' + esc(commission.id) + '" data-frontier-commission-period="' + commission.period + '" data-frontier-commission-progress="' + commission.progress + '" data-frontier-commission-paid="' + (commission.paid ? "1" : "0") + '">'
        + '<header><div><small>ROTATING FIELD COMMISSION · ' + commission.remainingYears + (commission.remainingYears === 1 ? " YEAR" : " YEARS") + ' LEFT</small><b>' + esc(commission.label) + '</b></div><span>' + (commission.paid ? "PAID" : commission.progress + " / " + commission.at) + '</span></header>'
        + '<p>' + esc(commission.detail) + '</p>'
        + '<div class="biome-frontier__commission-track"><i style="width:' + width + '%"></i></div>'
        + '<div class="biome-frontier__commission-meta"><span>' + esc(commission.goalLabel || "FIELD WORK") + '</span><span>REWARD · ' + esc(commission.rewardSummary) + '</span></div>'
        + '<small>' + (commission.paid ? "This commission has paid exactly once. A new one is issued next period." : "Progress counts only work completed after the commission was issued.") + '</small>'
        + '</article>';
}

function cycleRow(cycle) {
    const harvest = cycle.harvestOpen ? "OPEN NOW" : "IN " + cycle.yearsToHarvest + (cycle.yearsToHarvest === 1 ? " YEAR" : " YEARS");
    const regeneration = cycle.regenerationOpen ? "OPEN NOW" : "IN " + cycle.yearsToRegeneration + (cycle.yearsToRegeneration === 1 ? " YEAR" : " YEARS");
    return '<article class="biome-frontier__cycle" data-frontier-cycle="' + esc(cycle.id) + '" data-frontier-cycle-phase="' + cycle.phase + '" data-frontier-cycle-harvests="' + cycle.harvests + '" data-frontier-cycle-regenerations="' + cycle.regenerations + '" data-frontier-cycle-completions="' + cycle.completions + '">'
        + '<header><b>' + esc(cycle.label) + '</b><span>' + esc(cycle.phaseLabel.toUpperCase()) + ' · ' + cycle.period + 'Y</span></header>'
        + '<p>' + esc(cycle.detail) + '</p>'
        + '<div class="biome-frontier__cycle-track">' + cycle.phaseLabels.map((label, index) => '<span' + (index === cycle.phase ? ' class="is-now"' : '') + '>' + esc(label) + '</span>').join("") + '</div>'
        + '<div class="biome-frontier__cycle-meta"><span>HARVEST ' + harvest + '</span><span>REGENERATION ' + regeneration + '</span><span>ROTATIONS ' + cycle.completions + '</span><span>HARVESTS ' + cycle.harvests + '</span></div>'
        + '<small class="biome-frontier__cycle-reward">HARVEST PAYS · ' + esc(cycle.rewardSummary) + '</small>'
        + '</article>';
}

function goodRow(site, good) {
    return '<div class="biome-frontier__good" data-frontier-good-row="' + esc(good.id) + '">'
        + '<span><b>' + esc(good.label) + '</b><small>' + esc(good.note) + ' · ' + number(good.value) + 'G each · +' + number(good.annual) + ' a year</small></span>'
        + '<strong>' + number(good.stock) + '</strong>'
        + (good.stock > 0 ? '<button type="button" class="command-choice biome-frontier__button" data-command="frontier-sell" data-value="' + esc(site.id) + '" data-frontier-good="' + esc(good.id) + '">SELL · ' + number(good.stock) + '</button>' : '<em>NO STOCK</em>')
        + '</div>';
}

function actionRow(site, action) {
    return '<button type="button" class="command-choice biome-frontier__button" data-command="frontier-action" data-value="' + esc(site.id) + '" data-frontier-action="' + esc(action.id) + '"'
        + (action.enabled ? '' : ' disabled title="' + esc(action.reason) + '"') + '>'
        + esc(action.label) + ' · ' + esc(costLabel(action.cost)) + '</button>';
}

let openFrontierFamily = null;
let frontierOpenTracking = false;

function card(site, index) {
    const aspectBadge = site.aspect === "natural" ? "" : '<span class="biome-badge is-rare">' + esc(site.aspectLabel.toUpperCase()) + '</span>';
    const phaseBadge = '<span class="biome-frontier__phase is-' + esc(site.phase) + '">' + esc(site.phaseLabel.toUpperCase()) + ' · ' + Math.round(site.condition) + '%</span>';
    const actions = site.actions.length
        ? site.actions.map(action => actionRow(site, action)).join("")
        : '<span class="biome-badge">NO ACTION AVAILABLE THIS YEAR</span>';
    return '<details class="biome-frontier__card" data-frontier-site="' + esc(site.id) + '" data-frontier-family="' + esc(site.family) + '"'
        + ' data-frontier-phase="' + esc(site.phase) + '" data-frontier-aspect="' + esc(site.aspect) + '"'
        + ' data-frontier-condition="' + pct(site.condition) + '" data-frontier-extent="' + pct(site.extent) + '"'
        + ' data-frontier-magic="' + pct(site.magic) + '" data-frontier-corruption="' + pct(site.corruption) + '"'
        + ' data-frontier-surveyed="' + (site.surveyed ? "1" : "0") + '" data-frontier-deep-surveyed="' + (site.deepSurveyed ? "1" : "0") + '"'
        + ' data-frontier-species-count="' + number(site.livingSpecies) + '"'
        + ' data-frontier-specialist-count="' + number(site.livingSpecialists) + '" data-frontier-goods="' + number(site.goodsStock) + '"'
        + ' data-frontier-journal-count="' + number(site.journalUnlocked) + '" data-frontier-journal-total="' + number(site.journalTotal) + '"'
        + ' data-frontier-journal-tier="' + site.journalTier + '" data-frontier-charter="' + (site.charter ? "1" : "0") + '"'
        + ' data-frontier-cycle-harvests="' + site.cycleHarvests + '" data-frontier-cycle-completions="' + site.cycleCompletions + '"'
        + ' data-frontier-sold="' + number(site.sold) + '" data-frontier-commissions="' + number(site.commissions) + '"'
        + (site.protected ? ' data-frontier-protected="1"' : '')
        + ((openFrontierFamily ? site.family === openFrontierFamily : index === 0) ? ' open' : '') + '>'
        + '<summary><span class="biome-frontier__glyph" style="--frontier-accent:' + esc(site.palette[1] || "#9fc08e") + '">' + esc(site.glyph) + '</span>'
        + '<span class="biome-frontier__title"><b>' + esc(site.name) + '</b><small>' + esc(site.label) + ' · ' + esc(site.climateAnalog) + '</small></span>'
        + '<span class="biome-frontier__state">' + aspectBadge + (site.charter ? '<span class="biome-badge is-rare">CROWN CHARTER</span>' : '') + phaseBadge + '<small>' + (site.protected ? "CONSERVED" : "OPEN SITE") + ' · ' + number(site.goodsStock) + ' GOODS</small></span></summary>'
        + '<div class="biome-frontier__body">'
        + '<p class="biome-frontier__profile">' + esc(site.profile) + '</p>'
        + '<div class="biome-chip-line"><small>' + esc(site.requirementPoint) + '</small>'
        + chip("BAND", site.band) + chip("SOIL", site.soil) + chip("WATER", site.water) + chip("SEASON", site.seasonality)
        + (site.originBiome ? chip("ORIGINAL BIOME", site.originBiome) : "") + '</div>'
        + '<p class="command-note">' + esc(site.formation) + '</p>'
        + '<div class="biome-frontier__meters">'
        + meter("CONDITION", site.condition) + meter("EXTENT", site.extent)
        + meter("WILD MAGIC", site.magic, "magic") + meter("CORRUPTION", site.corruption, "curse") + '</div>'
        + '<div class="biome-chip-line"><small>CLIMATE</small>' + chip("ANALOGUE", site.climateAnalog)
        + chip("PRESSURE", site.climatePressure + " / 100") + chip("AGE", number(site.ageYears) + " years")
        + chip("PHASE", site.phaseLabel) + (site.vanishedYear ? chip("VANISHED", "year " + site.vanishedYear) : "")
        + (site.transfiguredYear ? chip("TRANSFIGURED", "year " + site.transfiguredYear) : "") + '</div>'
        + '<p class="command-note">' + esc(site.phaseDetail) + ' ' + esc(site.aspectDetail) + '</p>'
        + (site.history.length ? '<p class="command-note biome-frontier__last"><b>LAST DECISION · YEAR ' + number(site.history[site.history.length - 1].year) + ' · ' + esc(site.history[site.history.length - 1].kind.toUpperCase()) + '</b> ' + esc(site.history[site.history.length - 1].text) + '</p>' : '')
        + '<div class="biome-frontier__actions">' + actions + '</div>'
        + '<p class="command-note">' + (site.actedThisYear
            ? "One frontier action per site each year. The next annual pass reopens it."
            : site.protected
                ? "A warden's agreement is in force: annual decline is halved and the rare community has priority."
                : "Open site: harvest is cheaper now, but every take lowers condition and can cost a specialist.") + '</p>'
        + '<div class="biome-frontier__section">ROTATING FIELD COMMISSION · SIX-YEAR WORK ORDER</div>'
        + commissionCard(site)
        + '<div class="biome-frontier__section">RECURRING CYCLES · HARVEST AND REGENERATION WINDOWS</div>'
        + '<div class="biome-frontier__cycles">' + site.cycles.map(cycleRow).join("") + '</div>'
        + '<div class="biome-frontier__hazards">' + site.hazards.map(hazardRow).join("") + '</div>'
        + '<div class="biome-frontier__section">SPECIES COHORTS · ' + number(site.livingSpecies) + ' LIVING</div>'
        + '<div class="biome-frontier__species-list">' + site.species.map(speciesRow).join("") + '</div>'
        + '<div class="biome-frontier__section">RARE COMMUNITY · ' + number(site.livingSpecialists) + ' / ' + number(site.specialists.length) + ' LIVING</div>'
        + '<div class="biome-frontier__specialists">' + site.specialists.map(specialistRow).join("") + '</div>'
        + '<div class="biome-frontier__section">FIELD JOURNAL · ' + number(site.journalUnlocked) + ' / ' + number(site.journalTotal) + ' RECORDED · TIER ' + site.journalTier + ' OPEN</div>'
        + '<div class="biome-frontier__journal-tiers">' + site.journalTiers.map(group => journalTierBlock(site, group)).join("") + '</div>'
        + (site.layers.length ? '<div class="biome-frontier__section">RELICT &amp; HISTORICAL LAYERS</div><div class="biome-frontier__layers">'
            + site.layers.map(layer => '<span class="biome-badge">' + esc(layer) + '</span>').join("") + '</div>' : '')
        + (site.magicShift ? '<div class="biome-frontier__magic"><b>MAGICAL SHIFT · ' + esc(site.magicShift.label) + '</b><p>' + esc(site.magicShift.detail) + '</p></div>' : '')
        + '<div class="biome-frontier__section">RARE GOODS</div><div class="biome-frontier__goods">' + site.goods.map(good => goodRow(site, good)).join("") + '</div>'
        + (site.history.length ? '<div class="biome-frontier__section">SITE RECORD</div><div class="biome-frontier__history">'
            + site.history.slice().reverse().map(row => '<div><b>YEAR ' + number(row.year) + ' · ' + esc(row.kind.toUpperCase()) + '</b><span>' + esc(row.text) + '</span></div>').join("") + '</div>' : '')
        + '</div></details>';
}

function guide(summary) {
    const rows = summary.groups.map(group => {
        const entries = summary.requirements.filter(entry => group.ids.includes(entry.id));
        return '<div class="biome-frontier__guide-group"><h4>' + esc(group.label) + '</h4>'
            + entries.map(entry => '<article data-frontier-point="' + esc(entry.id) + '"><b>' + esc(entry.family) + ' ·</b>'
                + '<div><strong>' + esc(entry.title) + '</strong><small>' + esc(entry.point) + '</small>'
                + '<p>' + esc(entry.detail) + '</p><em>LIVE: ' + esc(entry.consumer) + '</em></div></article>').join("")
            + '</div>';
    }).join("");
    return '<details class="biome-frontier__details" data-frontier-guide="15"><summary><span>FIELD GUIDE · 15 POINTS</span><strong>1.2.23.2–16</strong><em>Every point names its live consumer</em></summary>'
        + '<div class="biome-frontier__guide">' + rows + '</div></details>';
}

export function biomeFrontierBlock() {
    // The panel is re-rendered after every action. Remember the card the player
    // opened last so the new DOM opens exactly that card and shows the result.
    if (!frontierOpenTracking && typeof document !== "undefined" && typeof document.addEventListener === "function") {
        frontierOpenTracking = true;
        document.addEventListener("toggle", event => {
            const card = event.target;
            if (card?.matches?.("[data-frontier-site]") && card.open) {
                openFrontierFamily = card.dataset.frontierFamily || null;
            }
        }, true);
    }
    const summary = biomeFrontierSummary();
    const sites = summary.sites;
    const stats = summary.stats;
    const cards = sites.map(card).join("");
    return '<section class="biome-frontier" data-biome-frontier="15" data-frontier-sites="' + number(sites.length) + '"'
        + ' data-frontier-vanished="' + number(stats.vanished) + '" data-frontier-conserved="' + number(stats.conserved) + '">'
        + '<div class="command-section-title">FRONTIER ECOSYSTEMS · SAVANNA, COAST, ICE, DEEP, MAGIC AND MEMORY</div>'
        + '<p class="command-note biome-frontier__intro">Fifteen extreme and changing ecosystems are bound to the ordinary province atlas: savanna and dry woodland, mangrove, coral coast, alpine grassland, subarctic shrubland, ice desert, underground lakes, magical primeval forest, cursed wasteland, fungal and crystal ground, magically transfigured biomes, rare endemic communities, historical landforms, climate-shifted ecotones and catastrophe belts. Each site now carries thirty cohorts, fifteen rare specialists, fifteen named disturbances, ten rare goods, fifteen relict layers, twenty-four field notes in six tiers, four recurring cycles and three rotating six-year field commissions. The short cycles open harvest windows every few years; the long cycles return across decades with trade, diplomacy, garrison morale and magic. A commission is issued only after survey, counts only work done after issue, pays exactly once and expires with its period. Nothing here runs per frame or replaces the 36-region atlas.</p>'
        + '<div class="command-summary biome-frontier__summary">'
        + '<div><small>SITES</small><strong>' + number(sites.length) + ' / 15</strong></div>'
        + '<div><small>SURVEYED</small><strong>' + number(stats.surveyed) + ' / ' + number(sites.length) + '</strong></div>'
        + '<div><small>CONSERVED</small><strong>' + number(stats.conserved) + '</strong></div>'
        + '<div><small>VANISHED</small><strong>' + number(stats.vanished) + '</strong></div>'
        + '<div><small>AVERAGE CONDITION</small><strong>' + number(stats.averageCondition) + ' / 100</strong></div>'
        + '<div><small>RARE GOODS</small><strong>' + number(stats.goods) + '</strong></div>'
        + '<div><small>FIELD NOTES</small><strong>' + number(stats.discoveries) + ' / ' + number(stats.journal) + '</strong></div>'
        + '<div><small>CHARTERS</small><strong>' + number(stats.charters) + ' / ' + number(sites.length) + '</strong></div>'
        + '<div><small>COMMISSIONS</small><strong>' + number(stats.commissions) + '</strong></div>'
        + '</div>'
        + '<div class="biome-frontier__climate"><div><small>SHARED CLIMATE SIGNAL</small><b>Warming ' + signed(summary.climate.warming) + ' · drift ' + number(summary.climate.drift) + '</b><p>The same drift that moves the province woods shifts these analogue labels. Cold sites lose condition; warm and dry sites may gain it until drought or fire takes the difference.</p></div>'
        + '<div><small>RARE COMMUNITIES</small><b>' + number(stats.livingSpecialists) + ' / ' + number(stats.specialists) + ' specialist species living</b><p>A specialist vanishes below 30 condition and returns at 65. Conservation halves annual decline; stabilisation holds wild magic and corruption at a workable level.</p></div></div>'
        + '<div class="biome-frontier__list">' + cards + '</div>'
        + guide(summary)
        + '<p class="command-note biome-frontier__guardrail">Guardrail: one bounded site per family, one yearly pass after the ordinary biome atlas, deterministic hashes instead of the shared RNG stream, an additive ledger under state.biomeFrontiers and save schema 15 unchanged.</p>'
        + '</section>';
}

export const __internals = Object.freeze({ card, guide, actionRow, goodRow, journalRow, meter, commissionCard, TIER_LABELS });
