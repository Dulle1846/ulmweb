// Explore tab: the wild places beyond the settlement and the one party
// currently travelling there. All numbers come from the expedition snapshot;
// this module never advances travel or pays loot itself.
import { state } from "../core/state.js";
import { getExpeditionSnapshot } from "../systems/expeditions.js";

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
        '<p class="command-note">Expeditions are deliberately bounded: eight sites per world, one active party, 24 reports and 40 fragments. A cleared site can be surveyed again for a smaller cache, but its principal discovery is recorded only once.</p>';
}
