// Population management panel. Reads only the persistent citizen register;
// filtering is local to the rendered list and never mutates simulation state.
import { state } from "../core/state.js";
import { getPopulationSnapshot, filterPopulationCitizens, CROWN_HOUSEHOLD_ID } from "../systems/population-register.js";
import { getPopulationGrowthGate, getPopulationGrowthAllowance } from "../systems/population.js";
import { getCrownReliefOffer } from "../systems/crown-relief.js";
import { renderAiContactSummary } from "./ai-chronicle-panel.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const amount = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const intro = (kicker, title, body) => '<div class="command-panel-intro"><span>' + esc(kicker) + "</span><h3>" + esc(title) + "</h3><p>" + esc(body) + "</p></div>";

let populationFilter = "all";
let populationQuery = "";
let populationCitizenPage = 0;
let populationHouseholdPage = 0;

export function setPopulationFilter(value) {
    populationFilter = ["all", "children", "adults", "elders", "workers", "soldiers", "unemployed", "royal", "unhoused"].includes(value) ? value : "all";
    populationCitizenPage = 0;
    populationHouseholdPage = 0;
}

export function setPopulationQuery(value) {
    populationQuery = String(value || "").slice(0, 80);
    populationCitizenPage = 0;
    populationHouseholdPage = 0;
}

export function stepPopulationPage(kind, step) {
    const delta = Math.trunc(Number(step) || 0);
    if (kind === "citizens") populationCitizenPage = Math.max(0, populationCitizenPage + delta);
    else if (kind === "households") populationHouseholdPage = Math.max(0, populationHouseholdPage + delta);
}

function pageWindow(total, size, requested) {
    const pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(Math.max(0, Math.trunc(requested) || 0), pages - 1);
    const start = current * size;
    return { pages, current, start, end: Math.min(total, start + size) };
}

function pagerMarkup(kind, page) {
    if (page.pages <= 1) return "";
    const previous = page.current <= 0 ? " disabled" : "";
    const next = page.current >= page.pages - 1 ? " disabled" : "";
    return '<div class="command-actions population-pager" data-population-pager="' + kind + '">' +
        '<button type="button" class="command-choice" data-population-page="' + kind + '" data-population-page-step="-1"' + previous + '>PREVIOUS</button>' +
        '<span class="command-note">PAGE ' + (page.current + 1) + ' / ' + page.pages + '</span>' +
        '<button type="button" class="command-choice" data-population-page="' + kind + '" data-population-page-step="1"' + next + '>NEXT</button></div>';
}

function reliefAction(offer) {
    if (!offer) return "";
    const cost = offer.cost > 0 ? " · " + number(offer.cost) + " GOLD" : "";
    return '<div class="command-actions"><button type="button" class="command-choice" data-command="crown-relief"' + (offer.available ? "" : " disabled") + '>' + esc(offer.label) + cost + '</button><small class="command-note">' + esc(offer.detail) + (offer.available ? "" : " · not enough gold") + '</small></div>';
}

// `late` is a per-render cache. The staged path fills it in separate prepared
// parts; the plain path fills it synchronously. Both produce the same note.
function growthGateNote(late = {}) {
    const gate = late.gate || (late.gate = getPopulationGrowthGate());
    const allowance = late.allowance ?? (late.allowance = getPopulationGrowthAllowance());
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
        const offer = "offer" in late ? late.offer : (late.offer = getCrownReliefOffer());
        return '<p id="population-growth-gate" class="command-note"><strong>GROWTH GATE · BLOCKED</strong> · ' + esc(gate.reason) + '. ' + esc(hint) + ' Free beds: ' + number(gate.housing.available) + '.</p>' + reliefAction(offer);
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

// The register itself is bounded by paging, but a mature realm still built
// every visible citizen and household card in the click task. The producer now
// only opens a chain of parts: the register snapshot, the growth gate, each
// record and the footer are generated and parsed in separate bounded frames.
// Plain callers still receive one identical string.
const CITIZEN_STREAM = "[data-population-citizen-stream]";
const HOUSEHOLD_STREAM = "[data-population-household-stream]";

function populationIntro() {
    return intro("THE LIVING REALM", "People, households & livelihoods", "Every named resident has a household, a profession, a faith, a talent and a civic life. Births, maturation, work, partnership, illness, ageing, death and migration are resolved once per year from these same records; the economy, politics and garrison read the result.");
}

function overviewMarkup(snapshot) {
    return '<div id="population-overview" class="command-summary"><div><small>CITIZENS</small><strong>' + number(snapshot.population) + '</strong></div><div><small>HOUSEHOLDS</small><strong>' + number(snapshot.households.length) + '</strong></div><div><small>AVERAGE AGE</small><strong>' + snapshot.avgAge + '</strong></div><div><small>EMPLOYED</small><strong>' + number(snapshot.employed) + ' / ' + number(snapshot.civilians) + '</strong></div><div><small>LOYALTY</small><strong>' + snapshot.avgLoyalty + '</strong></div><div><small>HAPPINESS</small><strong>' + snapshot.avgHappiness + '</strong></div><div><small>BIRTHS</small><strong>' + number(snapshot.births) + '</strong></div><div><small>DEATHS</small><strong>' + number(snapshot.deaths) + '</strong></div></div>';
}

function populationView(snapshot) {
    const visible = filterPopulationCitizens(snapshot.citizens, populationFilter, populationQuery);
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    const citizenPage = pageWindow(visible.length, narrow ? 3 : 10, populationCitizenPage);
    populationCitizenPage = citizenPage.current;
    const shown = visible.slice(citizenPage.start, citizenPage.end);
    const byId = new Map(snapshot.citizens.map(citizen => [citizen.id, citizen]));
    const filters = [
        ["all", "ALL"], ["children", "CHILDREN"], ["adults", "ADULTS"], ["elders", "ELDERS"],
        ["workers", "WORKERS"], ["soldiers", "SOLDIERS"], ["unemployed", "UNEMPLOYED"],
        ["royal", "ROYAL"], ["unhoused", "UNHOUSED"]
    ];
    const filterBar = filters.map(([id, label]) =>
        '<button type="button" class="population-filter' + (id === populationFilter ? " is-active" : "") + '" data-population-filter="' + esc(id) + '" aria-pressed="' + (id === populationFilter) + '">' + esc(label) + '</button>'
    ).join("");
    const householdPage = pageWindow(snapshot.households.length, narrow ? 2 : 5, populationHouseholdPage);
    populationHouseholdPage = householdPage.current;
    const householdRows = snapshot.households.slice(householdPage.start, householdPage.end);
    return { visible, citizenPage, shown, byId, filterBar, householdPage, householdRows };
}

function registerOpenMarkup(snapshot, view, staged) {
    const effects = snapshot.modifiers;
    return '<div class="population-effects"><span>TAX YIELD<b>×' + amount(effects.taxEfficiency) + '</b></span><span>BUILDING OUTPUT<b>×' + amount(effects.productivity) + '</b></span><span>LEGITIMACY PRESSURE<b>' + (effects.legitimacyPressure >= 0 ? "+" : "") + amount(effects.legitimacyPressure) + '</b></span><span>SOLDIER QUALITY<b>×' + amount(effects.militaryQuality) + '</b></span><span>HOUSEHOLD WEALTH<b>' + amount(snapshot.wealth) + ' GOLD</b></span><span>AVG TALENT<b>' + snapshot.avgTalent + '</b></span></div>' +
        '<p class="command-note">Annual census year ' + (snapshot.lastCensusYear || "—") + ' · ' + (snapshot.civilians || 0) + ' civilians + ' + (snapshot.soldiers || 0) + ' soldiers · ' + number(snapshot.unhoused) + ' unhoused · ' + number(snapshot.emigration) + ' departures recorded. The panel updates as the simulation advances; no value is forecast or synthesized.</p>' +
        '<div class="command-section-title">CITIZEN REGISTER · ' + number(snapshot.population) + ' RECORDED</div><div id="population-filter-bar" class="population-filter-bar">' + view.filterBar + '</div><div class="command-inline"><input id="population-search" type="search" value="' + esc(populationQuery) + '" placeholder="Search name, trade or household" aria-label="Search the citizen register"><span class="command-note">' + view.visible.length + ' matching · showing ' + (view.shown.length ? (view.citizenPage.start + 1) + '–' + view.citizenPage.end : '0') + ' of ' + view.visible.length + '</span></div>' +
        '<div id="population-citizen-list" class="population-citizen-list"' + (staged ? " data-population-citizen-stream" : "") + '>';
}

function householdOpenMarkup(snapshot, view, staged) {
    return '<div class="command-section-title">HOUSEHOLDS · ' + number(snapshot.households.length) + ' RECORDED</div><div class="command-inline"><span class="command-note">SHOWING ' + (view.householdRows.length ? (view.householdPage.start + 1) + '–' + view.householdPage.end : '0') + ' of ' + snapshot.households.length + '</span></div>' +
        '<div id="population-household-list" class="population-household-list"' + (staged ? " data-population-household-stream" : "") + '>';
}

function populationFooter() {
    return '<p class="command-note">Household wealth accumulates from employed members and their vocational talent, then is shared by the household. Loyalty and happiness feed the tax yield, political legitimacy and garrison quality. Departures happen only in a collapsing, hungry realm.</p>' + renderAiContactSummary();
}

// A staged section keeps its shell and pager in the same part so the hydrator
// mounts them before the one-row parts that follow. The plain string path keeps
// the original split: rows sit between the open and close of each list.
function citizenSectionMarkup(snapshot, view, staged, late = {}) {
    return growthGateNote(late) + registerOpenMarkup(snapshot, view, staged) + '</div>' + pagerMarkup("citizens", view.citizenPage);
}

function householdSectionMarkup(snapshot, view, staged) {
    return householdOpenMarkup(snapshot, view, staged) + '</div>' + pagerMarkup("households", view.householdPage);
}

// Every visible record is its own part; a household card keeps its member and
// relation buttons inside one coherent record rather than splitting its markup.
// The gate, its optional relief offer, each section shell and each pager tail
// are separate continuations so the expensive housing/supply reads never share
// a task with register markup.
function populationViewParts(snapshot, view, staged, late = {}) {
    const parts = [];
    if (staged) {
        parts.push(() => {
            late.gate = getPopulationGrowthGate();
            late.allowance = getPopulationGrowthAllowance();
            return { html: "", more: late.gate.ok ? [] : [() => { late.offer = getCrownReliefOffer(); return ""; }] };
        });
        parts.push(() => growthGateNote(late));
        parts.push(() => registerOpenMarkup(snapshot, view, staged));
        for (const citizen of view.shown) {
            parts.push({ into: CITIZEN_STREAM, html: () => citizenRow(citizen) });
        }
        if (!view.shown.length) parts.push({ into: CITIZEN_STREAM, html: () => '<p class="command-note">No citizen matches this filter.</p>' });
        parts.push(() => '</div>' + pagerMarkup("citizens", view.citizenPage));
        parts.push(() => householdOpenMarkup(snapshot, view, staged));
        for (const household of view.householdRows) {
            parts.push({ into: HOUSEHOLD_STREAM, html: () => householdRow(household, view.byId) });
        }
        if (!view.householdRows.length) parts.push({ into: HOUSEHOLD_STREAM, html: () => '<p class="command-note">No household has been established yet. A campaign starts with its founding cottages.</p>' });
        parts.push(() => '</div>' + pagerMarkup("households", view.householdPage));
    } else {
        parts.push(growthGateNote, () => registerOpenMarkup(snapshot, view, staged));
        for (const citizen of view.shown) parts.push(() => citizenRow(citizen));
        if (!view.shown.length) parts.push(() => '<p class="command-note">No citizen matches this filter.</p>');
        parts.push(() => '</div>' + pagerMarkup("citizens", view.citizenPage));
        parts.push(() => householdOpenMarkup(snapshot, view, staged));
        for (const household of view.householdRows) parts.push(() => householdRow(household, view.byId));
        if (!view.householdRows.length) parts.push(() => '<p class="command-note">No household has been established yet. A campaign starts with its founding cottages.</p>');
        parts.push(() => '</div>' + pagerMarkup("households", view.householdPage));
    }
    parts.push(populationFooter);
    return parts;
}

export function renderPopulationPanelParts(staged = false) {
    if (!state.hasStarted) {
        return [() => intro("THE LIVING REALM", "Awaiting its people", "Found a realm to create its first households and citizen records. No population is invented before a campaign begins.")];
    }
    const late = { snapshot: null, view: null };
    return [
        populationIntro,
        // The register snapshot, the filtered view and the overview strip each
        // get their own prepared part. A mature census used to build all three
        // in one 38 ms task on the throttled renderer.
        () => { late.snapshot = getPopulationSnapshot(); return ""; },
        () => { late.view = populationView(late.snapshot); return ""; },
        () => ({
            html: overviewMarkup(late.snapshot),
            more: populationViewParts(late.snapshot, late.view, staged, late)
        })
    ];
}

function resolvePopulationPart(part) {
    const value = typeof part === "function" ? part() : part;
    const html = typeof value === "string" ? value
        : typeof value?.html === "function" ? value.html() : value?.html;
    return {
        html: typeof html === "string" ? html : "",
        more: Array.isArray(value?.more) ? value.more : null
    };
}

export function renderPopulationPanel() {
    const parts = renderPopulationPanelParts();
    let html = "";
    for (let index = 0; index < parts.length; index++) {
        const part = resolvePopulationPart(parts[index]);
        html += part.html;
        if (part.more) parts.splice(index + 1, 0, ...part.more);
    }
    return html;
}
