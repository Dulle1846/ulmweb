// Strategy management panels for government, politics, economy and card inventory.
import { state } from "../core/state.js";
import { TAX_POLICIES, setTaxPolicy, holdRoyalAudience, getGovernmentSnapshot } from "../systems/government.js";
import { getPoliticalSnapshot } from "../systems/politics.js";
import { getWorkforceSnapshot } from "../systems/economy.js";
import { getHousingSnapshot, getHouseholdSnapshot } from "../systems/population.js";
import { CARD_DECK, selectCard, skipCard } from "../systems/cards.js";
import { addLog } from "../systems/events.js";
import { renderUI } from "./rendering/ui.js";

let activeTab = "government";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[char]);
const number = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });

function setFeedback(text) {
    const target = document.getElementById("management-feedback");
    if (target) target.textContent = text;
}

function renderGovernment() {
    const government = getGovernmentSnapshot();
    return '<section class="management-hero"><span>THE ROYAL CHANCERY</span><h3>Government &amp; Treasury</h3><p>Tax policy changes the actual gold collected from employed residents every ledger cycle. The policy is saved with this realm.</p></section>' +
        '<div class="management-policy-grid">' + Object.entries(TAX_POLICIES).map(([id, policy]) =>
            '<button type="button" class="management-policy' + (government.taxPolicy === id ? ' is-active' : '') +
            '" data-tax-policy="' + id + '"><strong>' + esc(policy.label) + '</strong><span>' +
            Math.round(policy.multiplier * 100) + '% of standard tax</span><small>' +
            (id === "light" ? "Less treasury income; better support among commoners and guilds." :
             id === "heavy" ? "More treasury income; public and guild support may fall." :
             "Balanced default policy.") + '</small></button>'
        ).join("") + '</div><div class="management-note">Current policy: <strong>' + esc(government.taxLabel) +
        '</strong>. Issued policy decrees: ' + government.decreesIssued + '.</div>';
}

function renderPolitics() {
    const politics = getPoliticalSnapshot();
    const government = getGovernmentSnapshot();
    const rows = Object.entries(politics.factions).map(([name, value]) =>
        '<div class="management-faction"><div><strong>' + esc(name) + '</strong><b>' + Math.round(value) + '%</b></div><i><b style="width:' +
        Math.max(0, Math.min(100, value)) + '%"></b></i></div>'
    ).join("");
    return '<section class="management-hero"><span>THE REALM&#39;S BALANCE OF POWER</span><h3>Politics &amp; Factions</h3><p>Legitimacy ' +
        Math.round(politics.legitimacy) + '% · average faction support ' + Math.round(politics.averageSupport) +
        '% · recorded decisions ' + politics.settlements + '</p></section><div class="management-factions">' + rows +
        '</div><section class="management-decision"><div><strong>Hold a royal audience</strong><p>Spend ' +
        government.audienceCost + ' gold to improve legitimacy and strengthen the currently weakest faction. Available every two realm years.</p></div>' +
        '<button type="button" data-political-action="audience"' + (!government.audienceAvailable || state.resources.gold < government.audienceCost ? ' disabled' : '') +
        '>' + (government.audienceAvailable ? 'HOLD AUDIENCE · ' + government.audienceCost + ' GOLD' : 'AUDIENCE ON COOLDOWN') + '</button></section>';
}

function renderEconomy() {
    const workforce = getWorkforceSnapshot(), housing = getHousingSnapshot(), households = getHouseholdSnapshot();
    const ledger = state.economy?.lastLedger || {};
    const resources = ["gold", "food", "wood", "stone"].map(key =>
        '<div class="management-stat"><span>' + key.toUpperCase() + '</span><strong>' + number(state.resources[key]) + '</strong></div>'
    ).join("");
    const metrics = [
        ["Population", workforce.population], ["Employed", workforce.employed], ["Unemployed", workforce.unemployed],
        ["Housing", housing.population + " / " + housing.capacity], ["Vacant beds", housing.available],
        ["Households", households.households], ["Food consumed / cycle", number(ledger.foodConsumed)],
        ["Taxes / cycle", number(ledger.taxesCollected)], ["Wages paid", number(ledger.wagesPaid)],
        ["Building upkeep", number(ledger.upkeepPaid)], ["Unpaid wages", number(ledger.unpaidWages)],
        ["Food shortage", number(ledger.foodShortage)]
    ];
    return '<section class="management-hero"><span>THE ROYAL LEDGER</span><h3>Economy &amp; Workforce</h3><p>Settlement finances are reconciled every ' +
        20 + ' simulation ticks. Tax income reflects the active government policy.</p></section><div class="management-resource-grid">' + resources +
        '</div><div class="management-metric-grid">' + metrics.map(([label,value]) =>
            '<div class="management-stat"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'
        ).join("") + '</div>';
}

function renderCards() {
    const hand = state.hand || [];
    const handMarkup = hand.length ? hand.map(card =>
        '<div class="management-card-row"><span class="management-card-icon">' + esc(card.icon || "✦") + '</span><span><strong>' +
        esc(card.name) + '</strong><small>' + esc(card.categoryName || card.group || "Card") + ' · ' + esc(card.rarity || "common") +
        '</small></span><button type="button" data-card-select="' + esc(card.instanceId) + '"' +
        (card.instanceId === state.selectedCardInstanceId ? ' disabled' : '') + '>' +
        (card.instanceId === state.selectedCardInstanceId ? 'SELECTED' : 'SELECT') + '</button></div>'
    ).join("") : '<p class="management-muted">Your hand is empty. Cards will be drawn as the realm develops.</p>';
    const creatures = state.entities.filter(entity => !entity.dead && entity.creature);
    const creatureMarkup = creatures.length ? creatures.map(entity => {
        const creature = entity.creature;
        const icon = creature.species === "dragons"
            ? '<img src="assets/dragon-companion.svg" alt="Young dragon" loading="lazy">'
            : "🐾";
        return '<div class="management-creature-row"><span class="management-creature-icon">' +
            icon + '</span><span><strong>' + esc(creature.name) +
            '</strong><small>' + esc(creature.species) + ' · ' + esc(creature.lifeStage) + ' · age ' +
            Math.floor(creature.ageYears) + ' / ' + creature.lifespanYears + '</small><small>Health ' +
            Math.round(creature.health) + '% · hunger ' + Math.round(creature.hunger) + '% · loyalty ' +
            Math.round(creature.loyalty) + '%</small></span></div>';
    }).join("") : '<p class="management-muted">No living creatures yet. A Dragon card creates a persistent creature with its own lifecycle.</p>';
    const groups = new Map();
    for (const card of CARD_DECK) groups.set(card.group || "general", (groups.get(card.group || "general") || 0) + 1);
    const catalog = [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,count]) =>
        '<span class="management-tag">' + esc(name) + ' · ' + count + '</span>'
    ).join("");
    return '<section class="management-hero"><span>THE CARD VAULT</span><h3>Cards &amp; Deck</h3><p>' +
        hand.length + ' / 5 in hand · ' + (state.availableCards?.length || 0) + ' in draw pile · ' +
        (state.cardRewardQueue?.length || 0) + ' queued rewards · ' + CARD_DECK.length + ' card archetypes.</p></section>' +
        '<div class="management-card-list">' + handMarkup + '</div>' +
        '<div class="management-card-actions"><button type="button" data-card-discard' +
        (!state.currentCard ? ' disabled' : '') + '>DISCARD SELECTED CARD</button></div>' +
        '<h4 class="management-subheading">LIVING CREATURES · ' + creatures.length + '</h4><div class="management-creature-list">' + creatureMarkup + '</div>' +
        '<div class="management-note">Creature memorial archive: ' + (state.creatureArchive?.length || 0) + ' · bounded historical records.</div>' +
        '<h4 class="management-subheading">ARCHETYPES IN THE REALM DECK</h4><div class="management-tags">' + catalog + '</div>';
}

function renderManagement() {
    const root = document.getElementById("management-content");
    if (!root) return;
    const renderers = { government: renderGovernment, politics: renderPolitics, economy: renderEconomy, cards: renderCards };
    root.innerHTML = renderers[activeTab]();
    document.querySelectorAll("[data-management-tab]").forEach(button =>
        button.classList.toggle("is-active", button.dataset.managementTab === activeTab)
    );
}

function openManagement(tab) {
    activeTab = tab;
    setFeedback("");
    renderManagement();
    document.getElementById("realm-management-modal")?.classList.remove("hidden");
}

export function setupRealmManagement() {
    const modal = document.getElementById("realm-management-modal");
    for (const tab of ["government", "politics", "economy", "cards"]) {
        document.getElementById(tab + "-btn")?.addEventListener("click", () => openManagement(tab));
    }
    document.getElementById("management-close")?.addEventListener("click", () => modal?.classList.add("hidden"));
    modal?.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
        const tab = event.target.closest("[data-management-tab]");
        if (tab) { openManagement(tab.dataset.managementTab); return; }
        const tax = event.target.closest("[data-tax-policy]");
        if (tax) {
            const result = setTaxPolicy(tax.dataset.taxPolicy);
            if (!result.ok) setFeedback("That tax policy is not available.");
            else {
                addLog("GOVERNMENT POLICY: " + result.policy.label, "#d9b878", "government");
                setFeedback(result.changed ? "The new tax policy is now in force." : "That policy is already active.");
                renderManagement(); renderUI();
            }
            return;
        }
        if (event.target.closest('[data-political-action="audience"]')) {
            const result = holdRoyalAudience();
            if (!result.ok) {
                setFeedback(result.reason === "insufficient-gold" ? "The treasury cannot afford the audience." : "The court must wait before holding another audience.");
                renderManagement();
                return;
            }
            addLog("ROYAL AUDIENCE: THE " + result.weakestFaction.toUpperCase() + " GAINED THE CROWN'S ATTENTION", "#d9b878", "politics");
            setFeedback("Audience held. Treasury spent " + result.cost + " gold; legitimacy and " + result.weakestFaction + " support increased.");
            renderManagement(); renderUI();
            return;
        }
        const card = event.target.closest("[data-card-select]");
        if (card) {
            if (selectCard(card.dataset.cardSelect)) {
                modal?.classList.add("hidden");
                renderUI();
            }
            return;
        }
        if (event.target.closest("[data-card-discard]")) {
            if (skipCard()) { addLog("THE COURT DISCARDED A CARD", "#d8a1a1", "card"); renderManagement(); renderUI(); }
        }
    });
}
