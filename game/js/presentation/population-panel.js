// Population management panel. Reads only the persistent citizen register;
// filtering is local to the rendered list and never mutates simulation state.
import { state } from "../core/state.js";
import { getPopulationSnapshot, filterPopulationCitizens, CROWN_HOUSEHOLD_ID } from "../systems/population-register.js";
import { getPopulationGrowthGate, getPopulationGrowthAllowance } from "../systems/population.js";
import { getCrownReliefOffer } from "../systems/crown-relief.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const amount = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const intro = (kicker, title, body) => '<div class="command-panel-intro"><span>' + esc(kicker) + "</span><h3>" + esc(title) + "</h3><p>" + esc(body) + "</p></div>";

let populationFilter = "all";
let populationQuery = "";

export function setPopulationFilter(value) {
    populationFilter = ["all", "children", "adults", "elders", "workers", "soldiers", "unemployed", "royal", "unhoused"].includes(value) ? value : "all";
}

export function setPopulationQuery(value) {
    populationQuery = String(value || "").slice(0, 80);
}

export function applyPopulationSearch() {
    const query = populationQuery.trim().toLowerCase();
    document.querySelectorAll(".population-citizen").forEach(record => {
        record.classList.toggle("is-filtered", Boolean(query) && !String(record.dataset.populationSearch || "").includes(query));
    });
}

function reliefAction() {
    const offer = getCrownReliefOffer();
    if (!offer) return "";
    const cost = offer.cost > 0 ? " · " + number(offer.cost) + " GOLD" : "";
    return '<div class="command-actions"><button type="button" class="command-choice" data-command="crown-relief"' + (offer.available ? "" : " disabled") + '>' + esc(offer.label) + cost + '</button><small class="command-note">' + esc(offer.detail) + (offer.available ? "" : " · not enough gold") + '</small></div>';
}

function growthGateNote() {
    const gate = getPopulationGrowthGate();
    const allowance = getPopulationGrowthAllowance();
    const used = Math.max(0, Number(state.economy?.growthThisYear) || 0);
    const remaining = Math.max(0, allowance - used);
    const hints = {
        "No free housing": "Build a cottage or rebuild a timber house in stone.",
        "Household morale is too low": "Raise morale or furnish a household room.",
        "The food reserve is below the growth floor": "Secure grain or raise the crown granary reserve.",
        "No reliable water coverage": "Build a well or fund the crown waterworks.",
        "Local safety is too low": "Build a watchtower covering occupied homes.",
        "Food reserves are too low": "Buy grain or expand the farms.",
        "Household needs are not being met": "Open Settlement needs and fix the lowest service.",
        "The world population cap is reached": "The world entity cap is full; no further resident can spawn."
    };
    if (!gate.ok) {
        const hint = hints[gate.reason] || "Inspect the settlement needs, housing and workforce.";
        return '<p id="population-growth-gate" class="command-note"><strong>GROWTH GATE · BLOCKED</strong> · ' + esc(gate.reason) + '. ' + esc(hint) + ' Free beds: ' + number(gate.housing.available) + '.</p>' + reliefAction();
    }
    if (remaining <= 0) {
        return '<p id="population-growth-gate" class="command-note"><strong>GROWTH GATE · THIS YEAR FILLED</strong> · ' + used + ' of ' + allowance + ' growth events already recorded. The next newcomers can arrive in the new year.</p>';
    }
    return '<p id="population-growth-gate" class="command-note"><strong>GROWTH GATE · OPEN</strong> · ' + remaining + ' of ' + allowance + ' growth events remain this year · ' + number(gate.housing.available) + ' free beds · morale threshold ' + Math.round(gate.moraleGate) + '.</p>';
}

function citizenRow(citizen) {
    const search = [citizen.name, citizen.profession, citizen.status, citizen.householdId, citizen.faith, citizen.tradition, citizen.origin]
        .filter(Boolean).join(" ").toLowerCase();
    const household = citizen.householdId
        ? (citizen.householdId === CROWN_HOUSEHOLD_ID ? "Crown household" : citizen.householdId.replace("house:", ""))
        : "Unhoused";
    return '<button type="button" class="population-citizen" data-open-person="' + esc(citizen.id) + '" data-population-status="' + esc(citizen.status) + '" data-population-soldier="' + (citizen.soldier ? 1 : 0) + '" data-population-royal="' + (citizen.royal ? 1 : 0) + '" data-population-unhoused="' + (citizen.householdId ? 0 : 1) + '" data-population-search="' + esc(search) + '" aria-label="Open the dossier of ' + esc(citizen.name) + '">' +
        '<span class="population-citizen__identity"><strong>' + esc(citizen.name) + '</strong><small>' + esc(citizen.profession.toUpperCase()) + ' · ' + esc(String(citizen.status).toUpperCase()) + ' · AGE ' + citizen.ageYears + '</small></span>' +
        '<span class="population-citizen__household"><small>HOUSEHOLD</small><strong>' + esc(household) + '</strong><em>' + esc(citizen.origin) + '</em></span>' +
        '<span class="population-citizen__civic"><small>LOYALTY ' + citizen.loyalty + ' · HAPPINESS ' + citizen.happiness + '</small><strong>TALENT ' + citizen.talent.score + ' · ' + esc(citizen.talent.focus) + '</strong><em>' + esc(citizen.faith) + ' · ' + esc(citizen.tradition) + '</em></span>' +
        '<span class="population-citizen__health"><small>HEALTH</small><strong>' + esc(citizen.healthStatus.toUpperCase()) + ' ' + citizen.healthScore + '</strong><em>' + esc(citizen.species) + ' · ' + esc(citizen.sex) + '</em></span></button>';
}

function householdRow(household, byId) {
    const members = household.memberIds.map(id => byId.get(id)).filter(Boolean);
    const head = byId.get(household.headId);
    const relationLabel = kind => ({ partners: "PARTNERS", "parent-child": "PARENT / CHILD", siblings: "SIBLINGS", kin: "KIN" }[kind] || String(kind).toUpperCase());
    const relations = household.relations.slice(0, 8).map(relation =>
        '<span>' + esc(relationLabel(relation.kind)) + ' · ' + esc(byId.get(relation.a)?.name || relation.a) + ' & ' + esc(byId.get(relation.b)?.name || relation.b) + '</span>'
    ).join("");
    const memberRows = members.map(member =>
        '<button type="button" class="population-household__member" data-open-person="' + esc(member.id) + '"><span>' + esc(member.name) + '</span><small>' + esc(member.profession) + ' · ' + member.ageYears + '</small></button>'
    ).join("");
    const title = household.id === CROWN_HOUSEHOLD_ID ? "CROWN HOUSEHOLD" : "HOUSEHOLD " + household.x + ", " + household.y;
    const formedYear = Math.max(1, Math.floor(Number(household.formedYear) || 1));
    return '<details class="population-household" data-population-household="' + esc(household.id) + '"><summary><span><strong>' + esc(title) + '</strong><small>' + members.length + ' / ' + household.capacity + ' RESIDENTS · HEAD ' + esc(head?.name || "VACANT") + ' · FOUNDED YEAR ' + formedYear + '</small></span><span class="population-household__stats"><b>' + number(household.wealth) + '</b> GOLD<em>LOYALTY ' + household.loyalty + ' · HAPPINESS ' + household.happiness + '</em></span></summary><div class="population-household__body"><div class="population-household__members">' + memberRows + '</div><div class="population-household__relations"><small>RELATIONSHIPS</small>' + (relations || '<span>No kinship ties recorded inside this household.</span>') + '</div></div></details>';
}

export function renderPopulationPanel() {
    if (!state.hasStarted) {
        return intro("THE LIVING REALM", "Awaiting its people", "Found a realm to create its first households and citizen records. No population is invented before a campaign begins.");
    }
    const snapshot = getPopulationSnapshot();
    const visible = filterPopulationCitizens(snapshot.citizens, populationFilter, populationQuery);
    const shown = visible.slice(0, 160);
    const byId = new Map(snapshot.citizens.map(citizen => [citizen.id, citizen]));
    const filters = [
        ["all", "ALL"], ["children", "CHILDREN"], ["adults", "ADULTS"], ["elders", "ELDERS"],
        ["workers", "WORKERS"], ["soldiers", "SOLDIERS"], ["unemployed", "UNEMPLOYED"],
        ["royal", "ROYAL"], ["unhoused", "UNHOUSED"]
    ];
    const filterBar = filters.map(([id, label]) =>
        '<button type="button" class="population-filter' + (id === populationFilter ? " is-active" : "") + '" data-population-filter="' + esc(id) + '" aria-pressed="' + (id === populationFilter) + '">' + esc(label) + '</button>'
    ).join("");
    const citizens = shown.map(citizenRow).join("");
    const households = snapshot.households.slice(0, 120).map(household => householdRow(household, byId)).join("");
    const effects = snapshot.modifiers;
    return intro("THE LIVING REALM", "People, households & livelihoods", "Every named resident has a household, a profession, a faith, a talent and a civic life. Births, maturation, work, partnership, illness, ageing, death and migration are resolved once per year from these same records; the economy, politics and garrison read the result.") +
        '<div id="population-overview" class="command-summary"><div><small>CITIZENS</small><strong>' + number(snapshot.population) + '</strong></div><div><small>HOUSEHOLDS</small><strong>' + number(snapshot.households.length) + '</strong></div><div><small>AVERAGE AGE</small><strong>' + snapshot.avgAge + '</strong></div><div><small>EMPLOYED</small><strong>' + number(snapshot.employed) + ' / ' + number(snapshot.civilians) + '</strong></div><div><small>LOYALTY</small><strong>' + snapshot.avgLoyalty + '</strong></div><div><small>HAPPINESS</small><strong>' + snapshot.avgHappiness + '</strong></div><div><small>BIRTHS</small><strong>' + number(snapshot.births) + '</strong></div><div><small>DEATHS</small><strong>' + number(snapshot.deaths) + '</strong></div></div>' +
        growthGateNote() + '<div class="population-effects"><span>TAX YIELD<b>×' + amount(effects.taxEfficiency) + '</b></span><span>BUILDING OUTPUT<b>×' + amount(effects.productivity) + '</b></span><span>LEGITIMACY PRESSURE<b>' + (effects.legitimacyPressure >= 0 ? "+" : "") + amount(effects.legitimacyPressure) + '</b></span><span>SOLDIER QUALITY<b>×' + amount(effects.militaryQuality) + '</b></span><span>HOUSEHOLD WEALTH<b>' + amount(snapshot.wealth) + ' GOLD</b></span><span>AVG TALENT<b>' + snapshot.avgTalent + '</b></span></div>' +
        '<p class="command-note">Annual census year ' + (snapshot.lastCensusYear || "—") + ' · ' + (snapshot.civilians || 0) + ' civilians + ' + (snapshot.soldiers || 0) + ' soldiers · ' + number(snapshot.unhoused) + ' unhoused · ' + number(snapshot.emigration) + ' departures recorded. The panel updates as the simulation advances; no value is forecast or synthesized.</p>' +
        '<div class="command-section-title">CITIZEN REGISTER · ' + number(snapshot.population) + ' RECORDED</div><div id="population-filter-bar" class="population-filter-bar">' + filterBar + '</div><div class="command-inline"><input id="population-search" type="search" value="' + esc(populationQuery) + '" placeholder="Search name, profession, household, faith…" aria-label="Search the citizen register"><span class="command-note">' + visible.length + ' matching · showing ' + shown.length + '</span></div><div id="population-citizen-list" class="population-citizen-list">' + (citizens || '<p class="command-note">No citizen matches this filter.</p>') + '</div>' +
        '<div class="command-section-title">HOUSEHOLDS · ' + number(snapshot.households.length) + ' RECORDED</div><div id="population-household-list" class="population-household-list">' + (households || '<p class="command-note">No household has been established yet. A campaign starts with its founding cottages.</p>') + '</div>' +
        '<p class="command-note">Household wealth accumulates from employed members and their vocational talent, then is shared by the household. Loyalty and happiness feed the tax yield, political legitimacy and garrison quality. Departures happen only in a collapsing, hungry realm.</p>';
}
