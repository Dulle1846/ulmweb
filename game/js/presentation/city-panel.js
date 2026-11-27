// City management panel. It presents the civic charter, the annual city event,
// live service coverage and the complete building codex. Actions delegate to
// the civic system, so this file never owns a second copy of the rules.
import { state } from "../core/state.js";
import { getCivicSnapshot, enactCivicPolicy, repealCivicPolicy, resolveCivicChoice } from "../systems/civic.js";
import { getSettlementSnapshot } from "../systems/settlement.js";
import { getCitySummary } from "../systems/logistics.js";
import { getWorkforceSnapshot } from "../systems/economy.js";
import { getDisasterRecoverySnapshot } from "../systems/disaster-recovery.js";
import { CITY_CODEX } from "../systems/city-codex.js";
import { TYPE } from "../core/types.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const percent = value => {
    const numeric = Number(value) || 0;
    return (numeric > 0 ? "+" : "") + Math.round(numeric * 100) + "%";
};
const effectText = (effects = {}) => {
    const labels = {
        tax: "tax", production: "work", foodDemand: "food demand", serviceRadius: "service reach",
        buildDiscount: "build cost", morale: "morale/year", legitimacy: "legitimacy/year",
        immigration: "newcomers", health: "health", trade: "trade"
    };
    return Object.entries(effects)
        .filter(([, value]) => Number(value))
        .map(([key, value]) => (labels[key] || key) + " " + percent(value))
        .join(" · ");
};
const intro = (kicker, title, copy) => '<div class="command-panel-intro"><span>' + esc(kicker) +
    '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div>';
const currency = value => number(value) + "G";

function serviceCard(label, value, note) {
    const numeric = Math.max(0, Math.min(1, Number(value) || 0));
    return '<article class="city-service-card"><span>' + esc(label) + '</span><strong>' +
        Math.round(numeric * 100) + '%</strong><i><b style="width:' + Math.round(numeric * 100) + '%"></b></i><small>' +
        esc(note) + '</small></article>';
}

function eventCard(event) {
    if (!event) {
        return '<div class="city-event city-event--quiet"><span class="command-ribbon">CIVIC CALENDAR</span>' +
            '<h4>No petition awaits the council</h4><p>The next annual city event will be drawn from the wards, markets and weather. ' +
            'Settlement life continues between events.</p></div>';
    }
    const choices = event.choices.map(choice =>
        '<button type="button" class="city-event-choice" data-civic-action="choice" data-value="' + choice.index + '"' +
        (choice.affordable ? '' : ' disabled') + '><strong>' + esc(choice.label) + '</strong><small>' +
        esc(choice.description) + '</small></button>').join("");
    return '<article class="city-event"><span class="command-ribbon">CITY EVENT · ' + esc(String(event.tags?.[0] || "WARD").toUpperCase()) +
        '</span><h4>' + esc(event.title) + '</h4><p>' + esc(event.description) + '</p><div class="city-event-choices">' +
        choices + '</div></article>';
}

function narrowViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
}

function codexCard(entry, seasonSlug) {
    return '<article class="city-codex-card" data-codex-type="' + entry.type + '">' +
        '<img loading="lazy" src="assets/city-codex/' + esc(entry.slug) + '-' + seasonSlug + '.svg" alt="' + esc(entry.name) + '" width="640" height="400">' +
        '<div><span>' + esc(entry.category) + '</span><h4>' + esc(entry.name) + '</h4><p>' + esc(entry.description) + '</p>' +
        '<small>' + esc(entry.effect) + '</small></div></article>';
}

function codexMarkup(seasonSlug) {
    return CITY_CODEX.map(entry => codexCard(entry, seasonSlug)).join("");
}

function seasonSlug() {
    return ["spring", "summer", "autumn", "winter"][Math.max(0, Math.min(3, Number(state.seasonIndex) || 0))];
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
    return chunks;
}

// Plain callers still receive one string; the management deck receives the
// ordered thunks. Resolving `more` here keeps both paths byte-identical.
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

function historyEntry(entry) {
    return '<div><span>' + esc(String(entry.kind).toUpperCase()) + ' · YEAR ' + entry.year + '</span><p>' + esc(entry.summary) + '</p></div>';
}

function ensureCodex(details) {
    if (!details || details.dataset.codexReady === "1") return;
    const body = details.querySelector("[data-city-codex-body]");
    if (!body) return;
    body.innerHTML = '<p class="command-note">Illustrated records of every structure in the current season. Portraits are loaded lazily, only as the codex is read.</p>' +
        '<div class="city-codex-grid">' + codexMarkup(details.dataset.season || "spring") + '</div>';
    details.dataset.codexReady = "1";
}

if (typeof document !== "undefined") {
    document.addEventListener("toggle", event => {
        const details = event.target;
        if (details?.matches?.("[data-city-codex]") && details.open) ensureCodex(details);
    }, true);
}

function policyCard(policy, civic, gold) {
    const active = policy.active;
    const affordable = gold >= policy.cost;
    const disabled = active ? false : (!civic.freeSlots || !affordable);
    return '<article class="city-policy' + (active ? ' is-active' : '') + '" data-civic-policy="' + esc(policy.id) + '">' +
        '<div class="city-policy__head"><div><span class="city-policy__category">' + esc(policy.categoryLabel) + '</span>' +
        '<h4>' + esc(policy.label) + '</h4><p>' + esc(policy.description) + '</p></div>' +
        '<span class="city-policy__state">' + (active ? "IN FORCE" : currency(policy.cost)) + '</span></div>' +
        '<div class="city-policy__meta"><span>UPKEEP ' + currency(policy.upkeep) + ' / YEAR</span><span>' +
        esc(effectText(policy.effects)) + '</span></div>' +
        '<button type="button" class="city-policy__button' + (active ? ' is-repeal' : '') + '" data-civic-action="' +
        (active ? "repeal" : "enact") + '" data-value="' + esc(policy.id) + '"' + (disabled ? ' disabled' : '') + '>' +
        (active ? "REPEAL" : civic.freeSlots ? "ENACT · " + currency(policy.cost) : "NO FREE SLOT") + '</button></article>';
}

// The city deck's codex, ordinances, services and record grow with the living
// world. Every snapshot read and record-card string is built inside a thunk;
// only a fixed sequence of bounded descriptors is created in the click task.
export function renderCityPanelParts() {
    if (!state.hasStarted) {
        return [() => intro("THE CITY CHARTER", "Awaiting its first ward",
            "Found a realm to open the civic ledger. Ordinances, city events and the building codex become active with the settlement.")];
    }
    const late = {
        civic: null, settlement: null, summary: null,
        workforce: null, recovery: null, gold: 0, historyOpen: false
    };
    const readyCivic = () => late.civic || (late.civic = getCivicSnapshot());
    const readySettlement = () => late.settlement || (late.settlement = getSettlementSnapshot());
    const readySummary = () => late.summary || (late.summary = getCitySummary());
    const readyWorkforce = () => late.workforce || (late.workforce = getWorkforceSnapshot());
    const readyRecovery = () => late.recovery || (late.recovery = getDisasterRecoverySnapshot());
    return [
        () => intro("THE CITY CHARTER", "A governed town",
            "The crown does not build a city with one decree. Paid ordinances change work, tax, food demand, service reach and construction; " +
            "the annual city event forces a real trade-off; the codex records every structure and its effect."),
        // Snapshot acquisition is its own bounded continuation. On a mature
        // realm reading all five ledgers in one part measured up to 86 ms at
        // 4x CPU; each read now lands in a separate prepared part while the
        // cached values keep every later markup part pure.
        () => { readyCivic(); return ""; },
        () => { readySettlement(); return ""; },
        () => { readySummary(); return ""; },
        () => { readyWorkforce(); return ""; },
        () => {
            const civic = late.civic;
            const settlement = late.settlement;
            const summary = late.summary;
            const workforce = late.workforce;
            const needs = settlement.needs || {};
            const active = civic.activePolicies.length;
            late.gold = Number(state.resources?.gold) || 0;
            return '<div class="command-summary">' +
                '<div><small>RESIDENTS</small><strong>' + number(workforce.population) + '</strong></div>' +
                '<div><small>HOUSEHOLDS</small><strong>' + number(needs.households) + '</strong></div>' +
                '<div><small>SATISFACTION</small><strong>' + Math.round((Number(needs.satisfaction) || 0) * 100) + '%</strong></div>' +
                '<div><small>ORDINANCES</small><strong>' + active + ' / ' + civic.slots + '</strong></div>' +
                '<div><small>CIVIC UPKEEP</small><strong>' + currency(civic.upkeep) + ' / YR</strong></div>' +
                '<div><small>BUILDINGS</small><strong>' + number(summary.buildings || state.entities.filter(entity => !entity.dead && entity.isBuilding()).length) + '</strong></div>' +
                '<div><small>TOWN HALLS</small><strong>' + civic.townHalls + '</strong></div>' +
                '<div><small>ACTIVE EVENTS</small><strong>' + (civic.pendingEvent ? "1" : "0") + '</strong></div></div>';
        },
        () => { readyRecovery(); return ""; },
        () => {
            const recovery = late.recovery;
            const lastWreck = recovery.lastWreck
                ? esc(String(recovery.lastWreck.label).toUpperCase()) + ' · ' + esc(recovery.lastWreck.causeLabel) + ' · YEAR ' + recovery.lastWreck.year
                : 'NO WRECK RECORDED';
            const lastSalvage = recovery.lastSalvage.wrecks
                ? 'YEAR ' + recovery.lastSalvage.year + ' · ' + number(recovery.lastSalvage.wood) + ' WOOD · ' + number(recovery.lastSalvage.stone) + ' STONE'
                : 'NONE RECORDED';
            return '<div class="command-section-title">DISASTER RECOVERY</div>' +
                '<div class="command-summary">' +
                '<div><small>WRECKS AWAITING REBUILD</small><strong>' + (recovery.pendingCount ? number(recovery.pendingCount) : 'NONE') + '</strong></div>' +
                '<div><small>LAST SALVAGE</small><strong>' + lastSalvage + '</strong></div>' +
                '<div><small>REBUILD DISCOUNT</small><strong>' + recovery.discountPercent + '% NEAR A WRECK</strong></div>' +
                '<div><small>LAST WRECK</small><strong>' + lastWreck + '</strong></div></div>';
        },
        () => {
            const recovery = late.recovery;
            return '<p class="command-note">Coastal surges, snowslides and eruptions record the wreck\'s cause, year and site. ' +
                'The next annual audit salvages a quarter of its timber and stone. Direct construction of the same structure within ' +
                recovery.radius + ' tiles of a wreck saves ' + recovery.discountPercent + '% of the material cost and clears that wreck from the register. ' +
                'A fresh realm has no wrecks; once one is recorded, this is where its recovery is decided.</p>';
        },
        () => '<div class="command-section-title">THE CITY EVENT</div>' + eventCard(late.civic.pendingEvent),
        () => {
            const modifiers = late.civic.modifiers;
            const audit = late.civic.lastAudit
                ? '<p class="command-note">Last civic audit · year ' + late.civic.lastAudit.year + ' · ' + late.civic.lastAudit.active +
                    ' ordinances · ' + late.civic.lastAudit.paid + '/' + late.civic.lastAudit.upkeep + ' gold upkeep' +
                    (late.civic.lastAudit.unpaid ? ' · ' + late.civic.lastAudit.unpaid + ' gold unpaid' : '') + '.</p>'
                : '<p class="command-note">The first civic audit occurs at the next year boundary.</p>';
            return '<div class="command-section-title">LIVE CIVIC EFFECTS</div><div class="court-effect-grid">' +
                '<span>TAX YIELD<b>' + percent(modifiers.tax) + '</b></span>' +
                '<span>WORK EFFICIENCY<b>' + percent(modifiers.production) + '</b></span>' +
                '<span>FOOD DEMAND<b>' + percent(modifiers.foodDemand) + '</b></span>' +
                '<span>SERVICE REACH<b>' + percent(modifiers.serviceRadius) + '</b></span>' +
                '<span>CONSTRUCTION<b>' + percent(-modifiers.buildDiscount) + '</b></span>' +
                '<span>NEWCOMER PULL<b>' + percent(modifiers.immigration) + '</b></span>' +
                '<span>PUBLIC HEALTH<b>' + percent(modifiers.health) + '</b></span>' +
                '<span>MARKET TERMS<b>' + percent(modifiers.trade) + '</b></span></div>' +
                audit;
        },
        () => {
            const settlement = late.settlement;
            const services = settlement.services || {};
            const needs = settlement.needs || {};
            const rows = [
                ["Water", services.water, "Wells and waterworks"],
                ["Food", needs.food, "Household stores"],
                ["Safety", services.safety, "Watch and walls"],
                ["Health", services.health, "Clinics and bathhouses"],
                ["Education", services.education, "Staffed schools"],
                ["Sanitation", services.sanitation, "Baths, wells and clinics"],
                ["Civic order", services.civic, "Town hall and courts"],
                ["Trade", services.trade, "Markets and guildhall"]
            ];
            return {
                html: '<div class="command-section-title">CIVIC SERVICES IN THE WARDS</div><div class="city-service-grid">',
                more: chunkRows(rows, 4).map(batch => ({
                    into: ".city-service-grid",
                    html: () => batch.map(([label, value, note]) => serviceCard(label, value, note)).join("")
                }))
            };
        },
        () => {
            const civic = late.civic;
            const active = civic.activePolicies.length;
            return {
                html: '</div><p class="command-note">Service percentages count occupied homes covered by an operational and staffed provider. ' +
                    'A bathhouse needs a nearby water store; a school and town hall need assigned workers. New service categories do not silently ' +
                    'raise household needs, but education and sanitation feed productivity.</p>' +
                    '<div class="command-section-title">THE CHARTER · ' + active + ' OF ' + civic.slots + ' ORDINANCES IN FORCE</div>' +
                    '<p class="command-note">Each enactment costs gold now and upkeep every year. A town hall adds two slots. ' +
                    'Unpaid upkeep does not delete a policy; it costs morale and is recorded in the next audit.</p>' +
                    '<div class="city-policy-grid">',
                more: chunkRows(civic.policies, 2).map(batch => ({
                    into: ".city-policy-grid",
                    html: () => batch.map(policy => policyCard(policy, civic, late.gold)).join("")
                }))
            };
        },
        () => {
            const civic = late.civic;
            late.historyOpen = civic.history.length > 0;
            if (!late.historyOpen) {
                return '</div><div class="command-section-title">CIVIC RECORD</div>' +
                    '<p class="command-note">No civic record has been written yet. Enact an ordinance or answer a city event.</p>';
            }
            return {
                html: '</div><div class="command-section-title">CIVIC RECORD</div><div class="court-history">',
                more: chunkRows(civic.history, 4).map(batch => ({
                    into: ".court-history",
                    html: () => batch.map(historyEntry).join("")
                }))
            };
        },
        () => {
            const slug = seasonSlug();
            const closeHistory = late.historyOpen ? '</div>' : '';
            if (narrowViewport()) {
                return closeHistory + '<details class="city-codex" data-city-codex data-season="' + esc(slug) + '">' +
                    '<summary><span>THE CITY CODEX · ' + CITY_CODEX.length + ' BUILDINGS</span><small>OPEN THE ILLUSTRATED REGISTER</small></summary>' +
                    '<div data-city-codex-body></div></details>';
            }
            // Adjacent codex cards share one bounded part, so a mature codex
            // mounts fewer distinct roots into its detached grid per frame.
            const chunks = CITY_CODEX.length
                ? chunkRows(CITY_CODEX, 4).map((batch, index, all) => ({
                    into: ".city-codex-grid",
                    html: () => batch.map(entry => codexCard(entry, slug)).join("") + (index === all.length - 1 ? '</div>' : '')
                }))
                : [{ into: ".city-codex-grid", html: () => '</div>' }];
            return {
                html: closeHistory + '<div class="command-section-title">THE CITY CODEX · ' + CITY_CODEX.length + ' BUILDINGS</div>' +
                    '<p class="command-note">Illustrated records of every structure in the current season. Portraits are loaded lazily, only as the codex is read.</p>' +
                    '<div class="city-codex-grid">',
                more: chunks
            };
        }
    ];
}

export function renderCityPanel() {
    return resolvePanelParts(renderCityPanelParts());
}

export function handleCityPanelClick(event, { onChanged, toast } = {}) {
    const button = event.target.closest("[data-civic-action]");
    if (!button || button.disabled) return false;
    const action = button.dataset.civicAction;
    const value = button.dataset.value;
    let result;
    if (action === "enact") result = enactCivicPolicy(value);
    else if (action === "repeal") result = repealCivicPolicy(value);
    else if (action === "choice") result = resolveCivicChoice(Number(value));
    else return false;
    if (result?.ok) {
        toast?.(action === "choice" ? "CITY DECISION RECORDED" :
            action === "enact" ? "ORDINANCE ENACTED" : "ORDINANCE REPEALED");
        onChanged?.();
    } else {
        toast?.(String(result?.reason || "CITY ACTION FAILED").replaceAll("-", " ").toUpperCase());
    }
    return true;
}
