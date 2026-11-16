// Explore tab: the wild places beyond the settlement and the one party
// currently travelling there. All numbers come from the expedition snapshot;
// this module never advances travel or pays loot itself.
import { state } from "../core/state.js";
import { getExpeditionSnapshot } from "../systems/expeditions.js";
import { getSpecialBiomeSnapshot } from "../systems/special-biome-state.js";
import { getTransitionSurvey, transitionAt, transitionGameplayFor } from "../world/transition-biomes.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const danger = value => "◆".repeat(Math.max(1, Math.min(3, Number(value) || 1)));
const tierLabel = tier => ({
    triumph: "TRIUMPH",
    success: "SUCCESS",
    costly: "COSTLY",
    disaster: "DISASTER"
}[tier] || "RETURN");

function intro(kicker, title, text) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';
}

function activeCard(active) {
    if (!active) {
        return '<div class="expedition-active expedition-active--idle"><span class="expedition-kicker">NO PARTY ON THE ROAD</span><h4>The wilds are waiting.</h4><p>Choose a landmark, a named leader and a supply level below. A party can only be away once at a time, and every journey costs food and gold before it leaves.</p></div>';
    }
    const outcome = active.outcome
        ? '<p class="expedition-active__outcome"><strong>' + esc(active.outcome.title.toUpperCase()) + '</strong> · returning with the party\'s report.</p>'
        : '<p class="expedition-active__outcome">The party is still outbound. A royal expedition resolves at the landmark, not in the settlement.</p>';
    return '<article class="expedition-active" data-expedition-active="' + esc(active.id) + '"><div class="expedition-active__head"><div><span class="expedition-kicker">ROYAL EXPEDITION · ' + esc(active.phase === "returning" ? "RETURNING" : "OUTBOUND") + '</span><h4>' + esc(active.siteGlyph) + ' ' + esc(active.siteName) + '</h4><p>' + esc(active.leaderName) + ' · ' + esc(active.supplyLabel) + ' · ' + esc(active.siteRegion) + '</p></div><strong class="expedition-active__days">' + number(active.remainingDays) + '<small>DAYS LEFT</small></strong></div><div class="expedition-progress" role="img" aria-label="Expedition progress ' + Math.round(active.progress) + ' percent"><span><i style="width:' + Math.max(0, Math.min(100, active.progress)).toFixed(1) + '%"></i></span><strong>' + Math.round(active.progress) + '%</strong></div>' + outcome + '</article>';
}

function siteCard(site, active, hasLeader) {
    const disabled = Boolean(active);
    const label = site.cleared ? "SURVEY AGAIN" : "CHARTER";
    const stateClass = site.cleared ? " is-cleared" : site.known ? " is-known" : " is-uncharted";
    return '<article class="expedition-site' + stateClass + '" data-expedition-site="' + esc(site.id) + '"><div class="expedition-site__head"><span class="expedition-glyph" aria-hidden="true">' + esc(site.glyph) + '</span><div><span class="expedition-kicker">' + esc(site.region) + ' · ' + esc(site.known ? site.typeLabel : "UNCHARTED") + '</span><h4>' + esc(site.name) + '</h4></div><span class="expedition-danger" aria-label="Danger ' + site.danger + ' of 3">' + danger(site.danger) + '</span></div><div class="expedition-site__meta"><span>DISTANCE<b>' + number(site.distance) + ' TILES</b></span><span>DANGER<b>' + site.danger + ' / 3</b></span><span>STATUS<b>' + esc(site.cleared ? "SURVEYED" : site.known ? "RUMOURED" : "UNCHARTED") + '</b></span></div><p class="expedition-site__note">' + esc(site.cleared ? "The principal find is already recorded. A second visit can still map the approaches and recover a smaller cache." : site.known ? "Tracks and old reports agree on this place. The party can be sent to recover what remains." : "Only a direction and a rumour. The first party to arrive will put the landmark on the royal map.") + '</p><button type="button" class="expedition-launch" data-command="expedition-start" data-value="' + esc(site.id) + '"' + (disabled ? " disabled" : "") + '>' + label + (active ? " · PARTY AWAY" : !hasLeader ? " · CHOOSE A LEADER" : "") + '</button></article>';
}

function rareGoodCard(good) {
    const count = Number(good.count) || 0;
    return '<article class="special-good' + (count ? " is-owned" : "") + '"><span class="special-good__glyph" aria-hidden="true">' + esc(good.glyph) + '</span><div><strong>' + esc(good.label) + '</strong><small>' + esc(good.where) + ' · ' + good.value + ' gold each</small></div><b>' + number(count) + '</b><button type="button" class="special-good__sell" data-command="special-good-sell" data-value="' + esc(good.id) + '"' + (count < 1 ? " disabled" : "") + '>SELL 1</button></article>';
}

function specialBiomeCard(region) {
    const canAttune = region.discovered && !region.attuned && region.rareGood.count >= region.attuneCost && (region.family !== "blighted-land" || region.cleansed);
    const canCleanse = region.family === "blighted-land" && region.discovered && !region.cleansed;
    const attuneLabel = region.attuned ? "ATTUNED" : (region.rareGood.count < region.attuneCost ? "NEED " + region.attuneCost + " " + region.rareGood.label.toUpperCase() : "ATTUNE · " + region.attuneCost + " " + region.rareGood.label.toUpperCase());
    const featureList = region.features.slice(0, 3).map(feature => feature.label).join(" · ");
    return '<article class="special-biome-card" data-special-biome="' + esc(region.id) + '" style="--biome-accent:' + esc(region.accent) + ';--biome-glow:' + esc(region.glow) + '"><div class="special-biome-card__head"><span class="special-biome-glyph" aria-hidden="true">' + esc(region.glyph) + '</span><div><span class="special-biome-kicker">' + esc(region.familyKicker) + ' · ' + esc(region.variantLabel) + '</span><h4>' + esc(region.name) + '</h4><p>' + esc(region.climate) + ' · ' + number(region.distance) + ' TILES FROM THE HEART · ' + esc(region.resourceLabel) + '</p></div><span class="special-biome-status">' + (region.attuned ? "ATTUNED" : region.cleansed ? "CLEANSED" : "CHARTED") + '</span></div><p class="special-biome-card__lore">' + esc(region.boon) + '</p><div class="special-biome-card__meta"><span>YIELD<b>' + (region.richness * (region.attuned ? 2 : 1)).toFixed(0) + ' / YEAR</b></span><span>FAMILY<b>' + esc(region.familyLabel) + '</b></span><span>ATLAS<b>' + esc(region.features.length + " FEATURES") + '</b></span></div>' + (featureList ? '<p class="special-biome-card__features">' + esc(featureList) + '</p>' : '') + '<div class="special-biome-card__actions"><button type="button" class="special-biome-action" data-command="special-biome-attune" data-value="' + esc(region.id) + '"' + (canAttune ? "" : " disabled") + '>' + esc(attuneLabel) + '</button>' + (canCleanse ? '<button type="button" class="special-biome-action special-biome-action--cleanse" data-command="special-biome-cleanse" data-value="' + esc(region.id) + '">CLEANSE · 3 RESIN + 12 GOLD</button>' : '') + '</div>' + (region.family === "blighted-land" && !region.cleansed ? '<p class="special-biome-warning">BLIGHT PRESSURE ' + region.spread + ' / 6 · ' + esc(region.hazard) + '</p>' : '') + '</article>';
}

const signed = (value, digits = 2) => (Number(value) >= 0 ? "+" : "") + Number(value).toFixed(digits);
const percent = value => signed(Number(value) * 100, 1) + "%";

function couplingInfluenceCard(snapshot) {
    const influence = snapshot.influence;
    const rows = [
        ["DIPLOMACY", signed(influence.diplomacy.relationDrift) + " relation / year", "Guilds " + signed(influence.diplomacy.guilds) + " · clergy " + signed(influence.diplomacy.clergy) + " · rare trade " + signed(influence.diplomacy.tradeValue)],
        ["WARFARE", "Defence +" + percent(influence.military.defenderPower - 1) + " · cover " + percent(influence.military.defenderCover), "Enemy attrition " + signed(influence.military.enemyAttrition, 1) + " · wounds prevented " + percent(influence.military.casualtyReduction)],
        ["CITY", "Harvest " + percent(influence.city.harvest) + " · production " + percent(influence.city.production), "Morale " + signed(influence.city.morale) + " / year · growth slots +" + influence.city.growthSlots],
        ["RPG / QUESTS", snapshot.quests.active + " active · " + influence.rites + " rites completed", "Omen bias " + signed(influence.quest.omenBias) + " · discoveries open survey and rite decisions"],
        ["ADMINISTRATION", "Blight unrest +" + percent(influence.administration.unrest) + " · legitimacy " + signed(influence.administration.legitimacy), "Blight pressure " + influence.blightPressure + " · " + influence.nearBlight + " near the heart"]
    ];
    return '<div class="special-couplings"><div class="special-couplings__head"><div><span class="special-biome-kicker">LIVING ATLAS · CROSS-SYSTEM COUPLINGS</span><h4>One charted world, five systems</h4></div><span class="special-couplings__count">' + influence.discovered + ' REGIONS · ' + influence.attuned + ' ATTUNED</span></div><div class="special-coupling-grid">' + rows.map(row => '<article class="special-coupling"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong><small>' + esc(row[2]) + '</small></article>').join("") + '</div></div>';
}

function paymentAvailable(snapshot, cost = {}, rareCost = 0, regionId = null) {
    if (rareCost > 0) {
        const region = regionId ? snapshot.regions.find(entry => entry.id === regionId) : null;
        const available = region
            ? (region.rareGood?.count || 0)
            : snapshot.regions.reduce((maximum, entry) => Math.max(maximum, entry.rareGood?.count || 0), 0);
        if (available < rareCost) return false;
    }
    for (const [key, value] of Object.entries(cost || {})) {
        if ((Number(state.resources?.[key]) || 0) < Number(value)) return false;
    }
    return true;
}

function questCard(quest, snapshot) {
    if (quest.status !== "active") {
        return '<article class="special-quest is-resolved"><div><span class="special-biome-kicker">' + esc(String(quest.kind).toUpperCase()) + ' · ' + esc(quest.regionName) + '</span><strong>' + esc(quest.status === "completed" ? "RESOLVED" : "EXPIRED") + '</strong><small>Year ' + quest.resolvedYear + ' · ' + esc(quest.choice || "unanswered") + '</small></div></article>';
    }
    const choices = (quest.choices || []).map(choice => {
        const available = paymentAvailable(snapshot, choice.cost, choice.rareCost, quest.regionId);
        return '<button type="button" class="special-quest__choice" data-command="special-biome-quest" data-value="' + esc(quest.id) + '" data-choice="' + esc(choice.id) + '"' + (available ? "" : " disabled") + '><strong>' + esc(choice.label) + '</strong><small>' + esc(choice.detail) + '</small></button>';
    }).join("");
    return '<article class="special-quest" data-special-quest="' + esc(quest.id) + '"><div class="special-quest__head"><div><span class="special-biome-kicker">' + esc(String(quest.kind).toUpperCase()) + ' QUEST · ' + esc(quest.regionName) + '</span><strong>' + (quest.kind === "rite" ? "A RITE IN THE WILD" : quest.kind === "omen" ? "AN OMEN TO READ" : "A SURVEY TO FINISH") + '</strong><small>Expires year ' + quest.expiresYear + ' · discoverer’s choice has a real cost</small></div></div><div class="special-quest__choices">' + choices + '</div></article>';
}

function blightDecisionCard(decision, snapshot) {
    if (!decision) {
        return '<div class="special-decree is-clear"><span class="special-biome-kicker">ROYAL BLIGHT DECREE</span><strong>No decree waits at the council table.</strong><small>Blight at pressure 2 or more forces a decision with a real treasury and food cost.</small></div>';
    }
    const choices = decision.choices.map(choice => {
        const available = paymentAvailable(snapshot, choice.cost);
        return '<button type="button" class="special-decree__choice" data-command="special-blight-choice" data-value="' + esc(choice.id) + '"' + (available ? "" : " disabled") + '><strong>' + esc(choice.label) + '</strong><small>' + esc(choice.detail) + '</small></button>';
    }).join("");
    return '<article class="special-decree" data-blight-decree="' + esc(decision.id) + '"><span class="special-biome-kicker">ROYAL BLIGHT DECREE · PRESSURE ' + decision.pressure + ' / 6</span><strong>' + esc(decision.title) + '</strong><p>' + esc(decision.demand) + '</p><div class="special-decree__choices">' + choices + '</div><small class="special-decree__deadline">Expires in year ' + decision.expiresYear + '. An unanswered decree spreads the rot.</small></article>';
}

// The Explore survey is a tile cursor, not a fixed world-centre card. It is
// transient UI state: nothing is written to the save. The candidate scan is
// bounded to one coarse grid and only runs when the panel is first painted or
// when the world/year changes, never in the render or simulation loop.
const SURVEY_TILE_LIMIT = 8;
let surveyTiles = null;
let surveyFocus = null;
let surveyCacheKey = "";

function surveyWorldKey() {
    return [state.worldSeed, state.worldW, state.worldH, state.year, state.worldOptions?.climate || ""].join(":");
}

function surveyCandidateStep(W, H) {
    return Math.max(8, Math.floor(Math.min(W, H) / 22));
}

function ensureSurveyTiles() {
    const key = surveyWorldKey();
    if (surveyTiles && surveyCacheKey === key) return surveyTiles;
    surveyCacheKey = key;
    surveyTiles = [];
    const W = Math.max(1, Math.floor(Number(state.worldW) || 1));
    const H = Math.max(1, Math.floor(Number(state.worldH) || 1));
    const step = surveyCandidateStep(W, H);
    const margin = Math.max(1, Math.floor(step / 2));
    const seen = new Set();
    const found = [];
    const centreX = W / 2;
    const centreY = H / 2;
    for (let y = margin; y < H; y += step) {
        for (let x = margin; x < W; x += step) {
            const transition = transitionAt(x + 0.5, y + 0.5);
            if (!transition) continue;
            const gameplay = transitionGameplayFor(transition);
            if (!gameplay) continue;
            // Different tiles can share a pair and still land on the same
            // displayed chip values. Collapse those duplicates so NEXT always
            // proves a real profile change.
            const signature = [
                transition.pair.id, transition.landscape?.id || "",
                Math.round(gameplay.farm * 100), Math.round(gameplay.forest * 100),
                Math.round(gameplay.forage * 100), Math.round(gameplay.settlement * 100),
                Math.round(gameplay.movement * 100)
            ].join("|");
            if (seen.has(signature)) continue;
            seen.add(signature);
            found.push({
                x, y,
                label: transition.label + (transition.landscape ? " · " + transition.landscape.label : ""),
                distance: Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY)
            });
        }
    }
    found.sort((a, b) => a.distance - b.distance);
    surveyTiles = found.slice(0, SURVEY_TILE_LIMIT);
    if (!surveyTiles.length) {
        surveyTiles.push({ x: Math.floor(centreX), y: Math.floor(centreY), label: "No distinct ecotone", distance: 0 });
    }
    if (!surveyFocus || !surveyTiles.some(tile => tile.x === surveyFocus.x && tile.y === surveyFocus.y)) {
        surveyFocus = { x: surveyTiles[0].x, y: surveyTiles[0].y };
    }
    return surveyTiles;
}

export function stepTransitionSurvey(direction = 1) {
    const tiles = ensureSurveyTiles();
    if (tiles.length < 2) return false;
    const delta = Number(direction) < 0 ? -1 : 1;
    const current = Math.max(0, tiles.findIndex(tile => tile.x === surveyFocus?.x && tile.y === surveyFocus?.y));
    const next = (current + delta + tiles.length) % tiles.length;
    surveyFocus = { x: tiles[next].x, y: tiles[next].y };
    return true;
}

function transitionBiomeSection() {
    const tiles = ensureSurveyTiles();
    const focus = surveyFocus || tiles[0];
    const survey = getTransitionSurvey(focus.x + 0.5, focus.y + 0.5, { exact: true });
    const sample = survey.sample;
    const requirements = sample ? sample.requirements.length : 0;
    const stageLabel = sample ? (sample.stageBand === 0 ? "FIRST STAGE" : sample.stageBand === 1 ? "MIDDLE STAGE" : "FAR STAGE") : "NO EDGE";
    const dynamics = sample?.dynamics?.length
        ? sample.dynamics.map(id => {
            const labels = {
                "climate-change": "CLIMATE DRIFT", "forest-expansion": "WOODLAND EXPANSION",
                "steppeification": "STEPPEIFICATION", "wetland-expansion": "WETLAND EXPANSION",
                "post-fire": "POST-FIRE", "logging-regrowth": "LOGGING REGROWTH",
                "grazing-change": "GRAZING", "magical-spread": "MAGICAL SPREAD"
            };
            return '<span>' + esc(labels[id] || id) + '</span>';
        }).join("")
        : '<span>NO ACTIVE PRESSURES</span>';
    const pairRows = survey.pairs.map(pair => '<div class="transition-pair-row"><span>' + esc(pair.label) + '</span><b>1.2.17.' + pair.requirement + '</b></div>').join("");
    const swatch = sample ? 'rgb(' + sample.tint.join(',') + ')' : '#8f8a69';
    const soil = sample ? 'rgb(' + sample.soil.join(',') + ')' : '#8f8a69';
    const title = sample ? sample.label + (sample.landscape ? ' · ' + sample.landscape.label : '') : survey.label;
    const play = survey.gameplay;
    const signedPercent = value => (value >= 0 ? '+' : '') + Math.round(value * 100) + '%';
    const gameplay = play ? '<div class="transition-gameplay" data-transition-farm="' + Math.round(play.farm * 100) + '" data-transition-forest="' + Math.round(play.forest * 100) + '" data-transition-forage="' + Math.round(play.forage * 100) + '" data-transition-settlement="' + Math.round(play.settlement * 100) + '" data-transition-movement="' + Math.round(play.movement * 100) + '" data-transition-harvest-factor="' + (1 + play.farm).toFixed(3) + '">' +
        '<span>FARM <b>' + signedPercent(play.farm) + '</b></span><span>FOREST <b>' + signedPercent(play.forest) + '</b></span><span>FORAGE <b>' + signedPercent(play.forage) + '</b></span><span>SETTLE <b>' + Math.round(play.settlement * 100) + '%</b></span><span>MOVE <b>' + Math.round(play.movement * 100) + '%</b></span></div>' : '';
    const focusIndex = Math.max(0, tiles.findIndex(tile => tile.x === focus.x && tile.y === focus.y));
    const stepperDisabled = tiles.length < 2 ? " disabled" : "";
    const focusControls = '<div class="transition-survey__target" data-transition-x="' + focus.x + '" data-transition-y="' + focus.y + '">' +
        '<div><small>SURVEY TILE</small><strong>' + focus.x + ' · ' + focus.y + '</strong></div>' +
        '<div class="transition-survey__steppers"><button type="button" class="transition-survey__step" data-transition-survey-step="-1"' + stepperDisabled + ' aria-label="Previous ecotone tile">◀ PREV</button><span class="transition-survey__count">' + (focusIndex + 1) + ' / ' + tiles.length + '</span><button type="button" class="transition-survey__step" data-transition-survey-step="1"' + stepperDisabled + ' aria-label="Next ecotone tile">NEXT ▶</button></div></div>';
    return '<div class="command-section-title">1.2.17 · TRANSITION BIOMES</div>' +
        '<div class="transition-summary"><div><small>MANIFEST POINTS</small><strong>' + survey.manifestCount + '</strong></div><div><small>BIOME EDGES</small><strong>' + survey.pairCount + '</strong></div><div><small>LANDSCAPE TYPES</small><strong>' + survey.landscapeCount + '</strong></div><div><small>ACTIVE AT TILE</small><strong>' + requirements + ' / 50</strong></div></div>' +
        '<article class="transition-survey" data-transition-pair="' + esc(sample?.pair.id || 'none') + '" data-transition-x="' + focus.x + '" data-transition-y="' + focus.y + '" data-transition-index="' + focusIndex + '" data-transition-total="' + tiles.length + '" style="--ecotone-tint:' + swatch + ';--ecotone-soil:' + soil + '">' +
        '<div class="transition-survey__swatches"><i style="background:' + swatch + '"></i><i style="background:' + soil + '"></i></div>' +
        '<div class="transition-survey__body"><span class="special-biome-kicker">ROYAL ECOTONE SURVEY · ' + stageLabel + '</span><h4>' + esc(title) + '</h4>' +
        '<p>' + (sample ? 'A ' + Math.round(sample.width * 100) + '-tile-wide organic seam. Tree cover ' + Math.round(sample.treeDensity * 100) + '%, grass ' + Math.round(sample.grassDensity * 100) + '%, shrubs ' + Math.round(sample.shrubDensity * 100) + '%.' : 'This tile sits inside a single stable habitat. Use NEXT to survey another seam.') + '</p>' +
        focusControls +
        gameplay +
        '<div class="transition-survey__dynamics">' + dynamics + '</div></div></article>' +
        '<details class="transition-atlas"><summary>THE FIFTEEN EDGES · 1.2.17.1–15</summary><div class="transition-pair-list">' + pairRows + '</div><p class="command-note">Each seam carries intermediate stages, a warped width, mixed flora, soil mottling and a dynamic response to climate, fire, logging, grazing and the rare atlas. Rendering samples the seam only on the detail lattice; it is not a per-frame map scan.</p></details>';
}

export function refreshTransitionSurvey(root = document) {
    const section = root?.querySelector?.("[data-transition-biome-section]");
    if (!section) return false;
    section.innerHTML = transitionBiomeSection();
    return true;
}

function specialBiomeSection() {
    const snapshot = getSpecialBiomeSnapshot();
    const regions = snapshot.regions.filter(region => region.discovered);
    const cards = regions.length
        ? regions.slice(0, 12).map(specialBiomeCard).join("")
        : '<p class="command-note">No rare biome has entered the royal survey. Explore farther from the heart: the atlas hides nine families and one hundred distinct wonders in total.</p>';
    const familyRows = Object.values(snapshot.regions.reduce((families, region) => {
        if (!families[region.family]) families[region.family] = { label: region.familyLabel, total: 0, found: 0 };
        families[region.family].total++;
        if (region.discovered) families[region.family].found++;
        return families;
    }, {})).map(family => '<div class="special-family-row"><span>' + esc(family.label) + '</span><b>' + family.found + ' / ' + family.total + '</b></div>').join("");
    const goods = snapshot.rareGoods.map(rareGoodCard).join("");
    const history = snapshot.history.length
        ? snapshot.history.slice(0, 6).map(entry => '<div class="special-history-row"><span>YEAR ' + entry.year + '</span><p>' + esc(entry.text) + '</p></div>').join("")
        : '<p class="command-note">No rare-good trade or attunement has been recorded yet.</p>';
    return '<div class="command-section-title">1.2.16 · FANTASTIC &amp; RARE BIOMES</div>' +
        '<div class="special-biome-summary"><div><small>ATLAS WONDERS</small><strong>' + snapshot.manifestCount + '</strong></div><div><small>FAMILIES CHARTED</small><strong>' + snapshot.knownFamilies.length + ' / 9</strong></div><div><small>REGIONS FOUND</small><strong>' + snapshot.summary.discovered + ' / ' + snapshot.summary.total + '</strong></div><div><small>ATTUNED</small><strong>' + snapshot.summary.attuned + '</strong></div><div><small>RARE GOODS YIELDED</small><strong>' + number(snapshot.totalYield) + '</strong></div></div>' +
        couplingInfluenceCard(snapshot) +
        '<div class="command-section-title">ROYAL ATLAS DECISIONS</div><div class="special-decisions"><div><div class="special-decisions__label">QUEST HOOKS</div>' + (snapshot.quests.quests.length ? snapshot.quests.quests.slice(0, 4).map(quest => questCard(quest, snapshot)).join("") : '<p class="command-note">A discovery opens a survey; attuning a region opens its rite.</p>') + '</div><div><div class="special-decisions__label">BLIGHT ADMINISTRATION</div>' + blightDecisionCard(snapshot.blightDecision, snapshot) + '</div></div>' +
        '<div class="special-biome-layout"><div><div class="command-section-title">RARE GOODS &amp; CROWN TRADE</div><div class="special-goods">' + goods + '</div><p class="command-note">Three units of a region\'s rare good permanently attune it. Goods can also be sold for gold; the price is real income, not a cosmetic counter.</p></div><div><div class="command-section-title">THE NINE FAMILIES</div><div class="special-family-list">' + familyRows + '</div><p class="command-note">Every family has its own terrain tint, landmarks, rare good, boon and hazard. Discovery is driven by exploring the map, not by a menu purchase.</p></div></div>' +
        '<div class="command-section-title">CHARTED WONDERS</div><div class="special-biome-grid">' + cards + '</div>' +
        '<div class="command-section-title">ROYAL ATLAS JOURNAL</div><div class="special-history">' + history + '</div>' +
        '<p class="command-note">The atlas is bounded to twelve regions, a one-byte tile map and at most ten landmark anchors per region. Yields and hazards settle once a year; discovery checks every two hundred ticks. Blighted regions must be cleansed before they can be attuned.</p>';
}


export function renderExpeditionsPanel() {
    if (!state.hasStarted) {
        return intro("THE WILDS BEYOND THE WALLS", "Awaiting the realm", "Landmarks, leaders and supplies become available when a campaign begins.") +
            '<div class="command-note">Found a realm and let its first day pass. The survey then seeds eight landmarks across the world.</div>';
    }
    const snapshot = getExpeditionSnapshot();
    const candidates = snapshot.candidates;
    const leaderOptions = candidates.map(candidate => '<option value="' + esc(candidate.personId) + '">' + esc(candidate.name) + ' · ' + esc(candidate.role) + ' · skill ' + candidate.skill + '</option>').join("");
    const supplyOptions = snapshot.supplies.map(supply => '<option value="' + esc(supply.id) + '">' + esc(supply.label) + ' · ' + supply.food + ' food + ' + supply.gold + ' gold</option>').join("");
    const sites = snapshot.sites.map(site => siteCard(site, snapshot.active, candidates.length > 0)).join("");
    const history = snapshot.history.length
        ? snapshot.history.slice(0, 10).map(entry => '<div class="expedition-history__row" data-expedition-history="' + esc(entry.id) + '"><span class="expedition-history__year">YEAR ' + entry.year + '</span><div><strong>' + esc(entry.title) + '</strong><small>' + esc(entry.leaderName) + ' · ' + esc(entry.siteName) + ' · ' + tierLabel(entry.tier) + (Object.keys(entry.loot).length ? ' · ' + esc(Object.entries(entry.loot).map(([key, value]) => value + " " + key).join(" · ")) : " · no recovered goods") + '</small></div></div>').join("")
        : '<p class="command-note">No expedition has returned yet. The first report will appear here.</p>';
    const lore = snapshot.lore.length
        ? snapshot.lore.slice(0, 5).map(entry => '<article class="expedition-lore" data-expedition-lore="' + esc(entry.id) + '"><span class="expedition-kicker">' + esc(entry.siteName) + ' · YEAR ' + entry.year + '</span><h4>' + esc(entry.title) + '</h4><p>' + esc(entry.text) + '</p></article>').join("")
        : '<p class="command-note">No written discovery has been recovered. Successful expeditions bring back a fragment for the royal archive.</p>';
    return intro("THE WILDS BEYOND THE WALLS", "Royal expeditions", "Eight seeded landmarks lie outside the settlement. A named resident leads one party at a time; their command, learning, care and trade skills, the supply level and the site's danger decide what returns. The party reveals the map when it arrives, can be wounded, and feeds real resources, prestige, memories and the chronicle.") +
        '<div class="command-summary"><div><small>LANDMARKS</small><strong>' + snapshot.stats.sites + '</strong></div><div><small>SURVEYED</small><strong>' + snapshot.stats.known + '</strong></div><div><small>PARTIES RETURNED</small><strong>' + snapshot.stats.completed + '</strong></div><div><small>FRAGMENTS RECOVERED</small><strong>' + snapshot.stats.discoveries + '</strong></div></div>' +
        '<div class="command-section-title">THE ROYAL SURVEY</div>' + activeCard(snapshot.active) +
        '<div class="command-section-title">EQUIP THE NEXT PARTY</div><div class="expedition-controls"><label>NAMED LEADER<select id="expedition-leader-select" aria-label="Choose the expedition leader"><option value="">Choose an adult resident…</option>' + leaderOptions + '</select></label><label>SUPPLY LEVEL<select id="expedition-supply-select" aria-label="Choose expedition supplies">' + supplyOptions + '</select></label><p>Food and gold are paid on departure; distance adds a small food surcharge. A light pack is cheaper but riskier. A grand equipage carries rope, medicine, mules and a surveyor.</p></div>' +
        (candidates.length ? "" : '<p class="command-note"><strong>NO LEADER AVAILABLE.</strong> Every named adult is already away, deceased or serving as the sovereign. A royal expedition needs a living resident, not an anonymous unit.</p>') +
        '<div class="command-section-title">THE EIGHT LANDMARKS</div><div class="expedition-grid">' + sites + '</div>' +
        '<div class="command-section-title">RETURNED REPORTS</div><div class="expedition-history">' + history + '</div>' +
        '<div class="command-section-title">FRAGMENTS & MAPS</div><div class="expedition-lore-list">' + lore + '</div>' +
        '<section class="transition-biome-section" data-transition-biome-section>' + transitionBiomeSection() + '</section>' +
        specialBiomeSection() +
        '<p class="command-note">Expeditions are deliberately bounded: eight sites per world, one active party, 24 reports and 40 fragments. A cleared site can be surveyed again for a smaller cache, but its principal discovery is recorded only once.</p>';
}
