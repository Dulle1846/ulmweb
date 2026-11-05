// Accessible strategy-management windows. Every action delegates to a validated game system.
import { state } from "../core/state.js";
import { getPoliticalSnapshot } from "../systems/politics.js";
import {
    GOVERNMENT_FORMS, TAX_POLICIES, LAW_CODES, ROYAL_DECISIONS,
    getGovernmentSnapshot, setGovernmentForm, setTaxPolicy, setLawCode, resolveRoyalDecision
} from "../systems/government.js";
import { getDynastySnapshot, appointRoyalConsort, createRoyalHeir } from "../systems/dynasty.js";
import { getWorkforceSnapshot } from "../systems/economy.js";
import { getHousingSnapshot } from "../systems/population.js";
import { MARKET_RESOURCES, getTradePartners, executeTrade } from "../systems/market.js";
import { drawNewCard, selectCard, skipCard } from "../systems/cards.js";

let activePanel = "government";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const number = value => Math.round(Number(value) || 0).toLocaleString("en-US");
const percent = value => Math.max(0, Math.min(100, Number(value) || 0));

function optionList(items, selected) {
    return Object.entries(items).map(([id, item]) =>
        '<option value="' + esc(id) + '"' + (id === selected ? " selected" : "") + ">" + esc(item.label) + "</option>"
    ).join("");
}
function factionBar(label, value) {
    const safe = percent(value);
    return '<div class="realm-meter"><div><strong>' + esc(label) + '</strong><b>' + safe + '%</b></div><i><span style="width:' + safe + '%"></span></i></div>';
}
function panelTabs() {
    const tabs = [
        ["government", "👑", "Government"], ["politics", "📜", "Politics"],
        ["economy", "🪙", "Economy"], ["cards", "🃏", "Cards"], ["dynasty", "🌳", "Dynasty"]
    ];
    return tabs.map(([id, icon, label]) =>
        '<button type="button" class="realm-window-tab' + (activePanel === id ? " is-active" : "") +
        '" data-panel-tab="' + id + '">' + icon + " " + label + "</button>"
    ).join("");
}
function renderGovernment() {
    const government = getGovernmentSnapshot();
    const last = state.government?.lastDecisionYear || 1;
    return '<div class="realm-panel-intro"><span class="realm-kicker">THE CROWN & ITS INSTITUTIONS</span><h3>Government</h3><p>Constitutional choices affect legitimacy, faction support and the royal treasury.</p></div>' +
        '<div class="realm-form-grid">' +
        '<label>Form of government<select id="realm-government-form">' + optionList(GOVERNMENT_FORMS, government.form) + '</select></label>' +
        '<label>Tax policy<select id="realm-tax-policy">' + optionList(TAX_POLICIES, government.taxPolicy) + '</select></label>' +
        '<label>Law code<select id="realm-law-code">' + optionList(LAW_CODES, government.lawCode) + '</select></label>' +
        '</div><div class="realm-stat-strip"><div><small>Tax multiplier</small><strong>' + number(government.taxRate * 100) + '%</strong></div><div><small>Decrees issued</small><strong>' + number(government.decisionsMade) + '</strong></div><div><small>Last decree</small><strong>Year ' + number(last) + '</strong></div></div>' +
        '<div class="realm-choice-list">' +
        Object.entries(GOVERNMENT_FORMS).map(([id, form]) => '<article><strong>' + esc(form.label) + '</strong><p>' + esc(form.description) + '</p></article>').join("") +
        '</div>';
}
function renderPolitics() {
    const politics = getPoliticalSnapshot();
    return '<div class="realm-panel-intro"><span class="realm-kicker">ESTATES & PUBLIC CONSENT</span><h3>Politics & Royal Decisions</h3><p>Every decree changes the balance of support. Resource costs are paid immediately.</p></div>' +
        '<div class="realm-stat-strip"><div><small>Legitimacy</small><strong>' + number(politics.legitimacy) + '%</strong></div><div><small>Average support</small><strong>' + number(politics.averageSupport) + '%</strong></div><div><small>Political settlements</small><strong>' + number(politics.settlements) + '</strong></div></div>' +
        '<div class="realm-meter-list">' + factionBar("Commons", politics.factions.commons) +
        factionBar("Nobility", politics.factions.nobility) + factionBar("Guilds", politics.factions.guilds) +
        factionBar("Clergy", politics.factions.clergy) + '</div><h4>Available royal decrees</h4><div class="realm-decision-grid">' +
        Object.entries(ROYAL_DECISIONS).map(([id, decision]) => '<article><strong>' + esc(decision.label) + '</strong><p>' + esc(decision.description) + '</p><small>Cost: ' +
            (Object.entries(decision.cost).map(([key, value]) => number(value) + " " + esc(key)).join(" · ") || "No direct resource cost") +
            '</small><button type="button" data-decision="' + id + '">Issue decree</button></article>').join("") +
        '</div>';
}
function renderEconomy() {
    const workforce = getWorkforceSnapshot(), housing = getHousingSnapshot();
    const ledger = state.economy?.lastLedger || {};
    const resources = ["gold", "wood", "stone", "food"];
    const prices = state.market?.prices || {};
    return '<div class="realm-panel-intro"><span class="realm-kicker">TREASURY, PRODUCTION & TRADE</span><h3>Economy</h3><p>Trade with regional partners, inspect your workforce and review the latest ledger.</p></div>' +
        '<div class="realm-resource-grid">' + resources.map(key => '<div><small>' + esc(key) + '</small><strong>' + number(state.resources?.[key]) + '</strong></div>').join("") + '</div>' +
        '<div class="realm-stat-strip"><div><small>Residents</small><strong>' + number(workforce.population) + '</strong></div><div><small>Employed</small><strong>' + number(workforce.employed) + '</strong></div><div><small>Housing</small><strong>' + number(housing.population) + ' / ' + number(housing.capacity) + '</strong></div></div>' +
        '<div class="realm-ledger"><h4>Last 20-day ledger</h4><p>Food consumed: <b>' + number(ledger.foodConsumed) + '</b></p><p>Taxes collected: <b>' + number(ledger.taxesCollected) + '</b></p><p>Wages paid: <b>' + number(ledger.wagesPaid) + '</b></p><p>Building upkeep: <b>' + number(ledger.upkeepPaid) + '</b></p></div>' +
        '<h4>Trade partners</h4><div class="realm-trade-list">' + getTradePartners().map(partner =>
            '<article><div><strong>' + esc(partner.name) + '</strong><small>' + esc(partner.region) + ' · Treasury ' + number(partner.treasury) + '</small></div>' +
            MARKET_RESOURCES.map(resource => '<div class="realm-trade-row"><span>' + esc(resource) + ' · stock ' + number(partner.stock?.[resource]) + ' · price ' + number(prices[resource]) + '</span>' +
                '<span><button type="button" data-trade="buy" data-partner="' + esc(partner.id) + '" data-resource="' + esc(resource) + '">Buy 5</button>' +
                '<button type="button" data-trade="sell" data-partner="' + esc(partner.id) + '" data-resource="' + esc(resource) + '">Sell 5</button></span></div>').join("") +
            '</article>').join("") + '</div>';
}
function renderCards() {
    const hand = Array.isArray(state.hand) ? state.hand : [];
    return '<div class="realm-panel-intro"><span class="realm-kicker">ROYAL DECK & CARD RESERVE</span><h3>Card management</h3><p>Inspect your hand, select a card, draw when space is available or discard a card you do not need.</p></div>' +
        '<div class="realm-stat-strip"><div><small>Cards in hand</small><strong>' + hand.length + ' / 5</strong></div><div><small>Deck reserve</small><strong>' + number(state.availableCards?.length) + '</strong></div><div><small>Queued rewards</small><strong>' + number(state.cardRewardQueue?.length) + '</strong></div></div>' +
        '<div class="realm-card-grid">' + (hand.length ? hand.map(card =>
            '<article class="' + (card.instanceId === state.selectedCardInstanceId ? "is-selected" : "") + '"><div class="realm-card-icon">' + esc(card.icon || "🃏") + '</div><strong>' + esc(card.name) + '</strong><small>' + esc(card.categoryName || card.group || "Card") + ' · ' + esc(card.rarity || "common") + '</small><p>' + esc(card.desc || "") + '</p>' +
            '<button type="button" data-card-select="' + esc(card.instanceId) + '">Select</button><button type="button" data-card-discard="' + esc(card.instanceId) + '">Discard</button></article>'
        ).join("") : '<p class="realm-empty">Your hand is empty.</p>') + '</div><button type="button" class="realm-primary-action" data-card-draw ' + (hand.length >= 5 ? "disabled" : "") + '>Draw a card</button>';
}
function renderDynasty() {
    const dynasty = getDynastySnapshot();
    if (!dynasty.king) return '<div class="realm-panel-intro"><span class="realm-kicker">ROYAL HOUSE</span><h3>Dynasty</h3><p>No living monarch currently occupies the throne.</p></div>';
    const consortOptions = dynasty.eligibleConsorts.map(entity =>
        '<option value="' + esc(entity.personId) + '">' + esc(entity.person.name) + ' · ' + esc(entity.person.species) + ' · age ' + number(entity.person.ageYears) + '</option>'
    ).join("");
    const children = dynasty.heirs.map(({ person }) =>
        '<article class="realm-heir"><strong>' + esc(person.name) + '</strong><span>' + esc(person.role) + ' · ' + number(person.ageYears) + ' years · ' + esc(person.lifeStage) + '</span></article>'
    ).join("");
    const canCreate = Boolean(dynasty.consort && Number(state.resources.food) >= 12 && Number(state.resources.gold) >= 8);
    return '<div class="realm-panel-intro"><span class="realm-kicker">THE ROYAL HOUSE</span><h3>Dynasty & Succession</h3><p>Royal marriages and heirs are persistent people in the family graph, not temporary event bonuses.</p></div>' +
        '<div class="realm-ruler-card"><div class="realm-crown">♛</div><div><small>Reigning monarch</small><strong>' + esc(dynasty.person.name) + '</strong><span>' + esc(dynasty.person.species) + ' · age ' + number(dynasty.person.ageYears) + ' · ' + esc(dynasty.person.lifeStage) + '</span></div></div>' +
        (dynasty.consort ? '<div class="realm-ruler-card"><div class="realm-crown">♥</div><div><small>Royal consort</small><strong>' + esc(dynasty.consort.person.name) + '</strong><span>' + esc(dynasty.consort.person.species) + ' · age ' + number(dynasty.consort.person.ageYears) + '</span></div></div>' :
            '<div class="realm-form-grid"><label>Choose a royal consort<select id="realm-consort-select"><option value="">Select an eligible adult</option>' + consortOptions + '</select></label><button type="button" data-appoint-consort>Arrange royal marriage</button></div>') +
        '<div class="realm-stat-strip"><div><small>Living heirs</small><strong>' + dynasty.heirs.length + '</strong></div><div><small>Royal birth cooldown</small><strong>' + (state.dynasty?.lastRoyalBirthYear ? Math.max(0, 3 - (state.year - state.dynasty.lastRoyalBirthYear)) + ' years' : "Ready") + '</strong></div><div><small>Succession</small><strong>' + (state.dynasty?.lastSuccession ? "Recorded" : "Hereditary") + '</strong></div></div>' +
        '<h4>Direct heirs</h4><div class="realm-heir-list">' + (children || '<p class="realm-empty">No royal children are recorded yet.</p>') + '</div>' +
        (dynasty.regent ? '<p class="realm-regency">Regent: ' + esc(dynasty.regent.person.name) + ' · the current heir is a minor.</p>' : "") +
        '<button type="button" class="realm-primary-action" data-create-heir ' + (!canCreate ? "disabled" : "") + '>Create royal heir · 12 food + 8 gold</button>' +
        '<p class="realm-footnote">An heir is selected from living direct descendants by age; a minor heir records a regent candidate. Full regency powers and contested succession are separate future systems.</p>';
}
function renderContent() {
    const content = $("realm-window-content");
    if (!content) return;
    const renderers = { government: renderGovernment, politics: renderPolitics, economy: renderEconomy, cards: renderCards, dynasty: renderDynasty };
    content.innerHTML = (renderers[activePanel] || renderGovernment)();
    document.querySelectorAll("[data-panel-tab]").forEach(button =>
        button.classList.toggle("is-active", button.dataset.panelTab === activePanel)
    );
}
function open(panel = "government") {
    activePanel = panel;
    renderContent();
    $("realm-management-modal")?.classList.remove("hidden");
}
function close() { $("realm-management-modal")?.classList.add("hidden"); }

export function setupRealmManagement() {
    const modal = $("realm-management-modal");
    if (!modal) return;
    document.querySelectorAll("[data-open-panel]").forEach(button =>
        button.addEventListener("click", () => open(button.dataset.openPanel))
    );
    $("realm-management-close")?.addEventListener("click", close);
    modal.addEventListener("click", event => {
        if (event.target === modal) close();
        const tab = event.target.closest("[data-panel-tab]");
        if (tab) { activePanel = tab.dataset.panelTab; renderContent(); return; }
        const decision = event.target.closest("[data-decision]");
        if (decision) {
            const result = resolveRoyalDecision(decision.dataset.decision);
            if (!result.ok) window.alert("Decision not available: " + result.reason.replaceAll("-", " "));
            renderContent(); return;
        }
        const trade = event.target.closest("[data-trade]");
        if (trade) {
            const result = executeTrade(trade.dataset.partner, trade.dataset.resource, trade.dataset.trade, 5);
            if (!result.ok) window.alert("Trade not completed: " + result.reason.replaceAll("-", " "));
            renderContent(); return;
        }
        const select = event.target.closest("[data-card-select]");
        if (select) { selectCard(select.dataset.cardSelect); renderContent(); return; }
        const discard = event.target.closest("[data-card-discard]");
        if (discard) {
            if (state.selectedCardInstanceId !== discard.dataset.cardDiscard) selectCard(discard.dataset.cardDiscard);
            skipCard(); renderContent(); return;
        }
        if (event.target.closest("[data-card-draw]")) { drawNewCard(); renderContent(); return; }
        if (event.target.closest("[data-appoint-consort]")) {
            const id = $("realm-consort-select")?.value;
            const result = appointRoyalConsort(id);
            if (!result.ok) window.alert("Marriage not completed: " + result.reason.replaceAll("-", " "));
            renderContent(); return;
        }
        if (event.target.closest("[data-create-heir]")) {
            const result = createRoyalHeir();
            if (!result.ok) window.alert("Royal birth not completed: " + result.reason.replaceAll("-", " "));
            renderContent(); return;
        }
    });
    modal.addEventListener("change", event => {
        const target = event.target;
        let result = null;
        if (target.id === "realm-government-form") result = setGovernmentForm(target.value);
        else if (target.id === "realm-tax-policy") result = setTaxPolicy(target.value);
        else if (target.id === "realm-law-code") result = setLawCode(target.value);
        if (result && !result.ok && result.reason !== "already-selected") window.alert("Change not applied: " + result.reason);
        if (result) renderContent();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) close();
    });
}
