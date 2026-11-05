// Read-only character dossiers for persistent named people.
import { state } from "../core/state.js";
import { getFamilySnapshot } from "../systems/families.js";
import { getRoyalHouse } from "../systems/royal-dynasty.js";

let selectedPersonId = null;
let dossierStylesRequested = false;

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function people() {
    const living = state.entities.filter(entity => !entity.dead && entity.personId && entity.person);
    const deceased = (state.personArchive || []).map(entry => ({
        personId: entry.personId, person: entry.person, dead: true, isArchived: true,
        deathYear: entry.deathYear, deathCause: entry.cause, isKing: entry.isKing
    }));
    return [...living, ...deceased].sort((a, b) => Number(Boolean(b.isKing)) - Number(Boolean(a.isKing)) ||
        Number(Boolean(a.isArchived)) - Number(Boolean(b.isArchived)) ||
        String(a.person.name).localeCompare(String(b.person.name)) ||
        String(a.personId).localeCompare(String(b.personId)));
}

function portraitSymbol(entity) {
    const person = entity?.person || {};
    const role = String(person.role || "").toLowerCase();
    const sex = String(person.sex || "").toLowerCase();
    const female = sex === "f" || sex.includes("female") || sex.includes("woman");
    if (entity?.isKing || /sovereign|monarch|ruler|king|queen/.test(role)) {
        return female ? "portrait-queen" : "portrait-king";
    }
    if (/scholar|scribe|healer|cleric|priest|mage|teacher/.test(role)) return "portrait-scholar";
    if (/knight|guard|soldier|marshal|captain|archer/.test(role)) return "portrait-knight";
    if (/noble|lord|lady|court|consort/.test(role)) return female ? "portrait-noblewoman" : "portrait-nobleman";
    return female ? "portrait-noblewoman" : "portrait-villager";
}

function personName(personId) {
    const entity = state.entities.find(item => String(item.personId || "") === String(personId));
    if (entity?.person?.name) return entity.person.name;
    const memorial = (state.personArchive || []).find(item => item.personId === String(personId));
    return memorial?.person?.name || "Formerly recorded · " + String(personId || "unknown");
}

function ensureDossierStyles() {
    if (dossierStylesRequested) return;
    dossierStylesRequested = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/sovereign-dossier.css";
    document.head.append(link);
}

function syncPeopleFilterOptions(all) {
    const update = (id, field, label) => {
        const select = document.getElementById(id);
        if (!select) return;
        const current = select.value;
        const values = [...new Set(all.map(entity => String(entity.person?.[field] || "").trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        select.innerHTML = '<option value="">All ' + esc(label) + '</option>' +
            values.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join("");
        if (values.includes(current)) select.value = current;
    };
    update("people-role-filter", "role", "roles");
    update("people-species-filter", "species", "species");
}

function renderPeopleList(query = "") {
    const list = document.getElementById("people-list");
    const count = document.getElementById("people-count");
    if (!list) return;
    const all = people();
    syncPeopleFilterOptions(all);
    const needle = String(query).trim().toLowerCase();
    const statusFilter = document.getElementById("people-status-filter")?.value || "";
    const roleFilter = document.getElementById("people-role-filter")?.value || "";
    const speciesFilter = document.getElementById("people-species-filter")?.value || "";
    const filtered = all.filter(entity => {
        const person = entity.person;
        if (statusFilter === "living" && entity.isArchived) return false;
        if (statusFilter === "deceased" && !entity.isArchived) return false;
        if (roleFilter && String(person.role || "") !== roleFilter) return false;
        if (speciesFilter && String(person.species || "") !== speciesFilter) return false;
        return !needle || [person.name, person.species, person.sex, person.role, person.familyName, entity.deathCause, entity.personId]
            .some(value => String(value || "").toLowerCase().includes(needle));
    }).slice(0, 100);
    if (!filtered.some(entity => entity.personId === selectedPersonId)) {
        selectedPersonId = filtered[0]?.personId || null;
    }
    if (count) count.textContent = needle || statusFilter || roleFilter || speciesFilter
        ? filtered.length + " MATCHES" : all.length + " PEOPLE";
    list.innerHTML = filtered.length ? filtered.map(entity => {
        const person = entity.person;
        return '<button type="button" class="person-list-item' +
            (entity.personId === selectedPersonId ? ' is-selected' : '') +
            '" data-person-id="' + esc(entity.personId) + '" data-person-role="' + esc(person.role || '') +
            '" data-person-species="' + esc(person.species || '') + '" data-person-status="' + (entity.isArchived ? 'deceased' : 'living') +
            '" aria-pressed="' + String(entity.personId === selectedPersonId) + '">' +
            '<svg class="person-list-portrait" viewBox="0 0 256 320" aria-hidden="true"><use href="assets/royal-portraits.svg#' + portraitSymbol(entity) + '"></use></svg>' +
            '<span class="person-list-copy"><span class="person-list-name">' + esc(person.name) + (entity.isKing ? ' <b>♛</b>' : '') + '</span>' +
            '<span class="person-list-meta">' + esc(person.species) + ' · ' + esc(person.sex || 'unknown') + ' · ' + esc(person.role) + ' · ' +
            Math.floor(Number(person.ageYears) || 0) + (entity.isArchived ? ' · DECEASED' : '') + '</span></span></button>';
    }).join("") : '<div class="empty-state">No matching people were found.</div>';
}

function renderLinks(title, entries, labelFor) {
    const rows = entries.map(entry => {
        const id = typeof entry === "string" ? entry : entry.personId;
        return '<li><button type="button" class="dossier-related-person" data-person-id="' + esc(id) + '"><strong>' + esc(personName(id)) + '</strong><span>' + esc(labelFor(entry)) + '</span></button></li>';
    }).join("");
    return '<section class="dossier-section"><h3>' + esc(title) + '</h3>' +
        (rows ? '<ul class="dossier-link-list">' + rows + '</ul>' : '<p class="dossier-empty">No recorded ties.</p>') +
        '</section>';
}

function renderSovereignDossier(entity, family) {
    if (!entity?.isKing) return "";
    const currentHouse = !entity.isArchived ? getRoyalHouse() : null;
    const isReigningSovereign = Boolean(currentHouse?.king &&
        String(currentHouse.king.personId || currentHouse.king.id || "") === String(entity.personId));
    const dynastyName = String(state.royal?.dynastyName || state.kingdomName || "Royal house");
    if (!isReigningSovereign) {
        return '<section class="royal-dossier" data-royal-dossier="former">' +
            '<div class="royal-dossier__masthead"><img src="assets/royal-crest.svg" alt="" aria-hidden="true">' +
            '<div><span class="royal-dossier__eyebrow">ROYAL ARCHIVE</span><h3>Former sovereign</h3>' +
            '<p>This person is recorded as a monarch. Current succession details are shown only on the living sovereign\'s dossier.</p></div></div>' +
            '<div class="royal-dossier__facts"><div><span>ROYAL HOUSE</span><strong>' + esc(dynastyName) + '</strong></div>' +
            '<div><span>RECORDED CHILDREN</span><strong>' + family.children.length + '</strong></div>' +
            '<div><span>RECORDED PARENTS</span><strong>' + family.parents.length + '</strong></div></div></section>';
    }
    const consort = currentHouse.consort ? [{ personId: currentHouse.consort.personId, label: "Royal consort" }] : [];
    const heir = currentHouse.heir ? [{ personId: currentHouse.heir.personId, label: "Designated living heir" }] : [];
    const children = currentHouse.children || [];
    const history = (currentHouse.history || []).slice(-8).reverse().map(entry =>
        '<article class="royal-dossier__chronicle"><span>YEAR ' + Math.max(1, Math.floor(Number(entry.year) || 1)) +
        '</span><strong>' + esc(String(entry.kind || "royal event").replaceAll("-", " ")) + '</strong><p>' +
        esc(entry.detail || "A royal event was recorded.") + '</p></article>'
    ).join("");
    return '<section class="royal-dossier" data-royal-dossier="current" aria-labelledby="royal-dossier-title">' +
        '<div class="royal-dossier__masthead"><img src="assets/royal-crest.svg" alt="" aria-hidden="true">' +
        '<div><span class="royal-dossier__eyebrow">THE CROWN &amp; THE ROYAL HOUSE</span><h3 id="royal-dossier-title">SOVEREIGN DOSSIER</h3>' +
        '<p>' + esc(state.kingdomName || "The realm") + ' · House ' + esc(dynastyName) + ' · Reigning sovereign</p></div></div>' +
        '<div class="royal-dossier__facts"><div><span>ROYAL CHILDREN</span><strong>' + children.length + '</strong></div>' +
        '<div><span>DESIGNATED HEIR</span><strong>' + (currentHouse.heir ? esc(currentHouse.heir.person?.name || personName(currentHouse.heir.personId)) : 'Not designated') + '</strong></div>' +
        '<div><span>CONSORT</span><strong>' + (currentHouse.consort ? esc(currentHouse.consort.person?.name || personName(currentHouse.consort.personId)) : 'Not recorded') + '</strong></div></div>' +
        '<div class="royal-dossier__links">' +
        renderLinks("ROYAL CONSORT", consort, entry => entry.label) +
        renderLinks("DESIGNATED SUCCESSOR", heir, entry => entry.label) +
        renderLinks("ROYAL CHILDREN", children, entry => "Royal child · born year " + Math.max(1, Number(entry.person?.bornAtYear) || 1)) +
        '</div><section class="royal-dossier__history"><h4>ROYAL HOUSE CHRONICLE</h4>' +
        (history || '<p class="dossier-empty">No royal-house events have been recorded yet.</p>') +
        '</section><p class="royal-dossier__succession-note">Succession follows the designated living heir. If no eligible designated heir is available, the succession system checks the late sovereign\'s recorded living children. It does not silently promote an unrelated resident.</p>' +
        '</section>';
}

function renderDossier(personId) {
    const detail = document.getElementById("person-dossier");
    if (!detail) return;
    const liveEntity = state.entities.find(item => !item.dead && String(item.personId || "") === String(personId));
    const memorial = (state.personArchive || []).find(item => item.personId === String(personId));
    const entity = liveEntity || (memorial ? { ...memorial, isArchived: true, deathCause: memorial.cause } : null);
    if (!entity?.person) {
        detail.innerHTML = '<div class="empty-state">Select a person to inspect their chronicle.</div>';
        return;
    }
    const person = entity.person;
    const family = getFamilySnapshot(personId) || { parents: [], children: [], siblings: [], partners: [], guardians: [], wards: [] };
    const traits = Object.entries(person.traits || {}).map(([key, value]) =>
        '<div class="dossier-meter"><span>' + esc(key) + '</span><i><b style="width:' +
        Math.max(0, Math.min(100, Number(value) || 0)) + '%"></b></i><strong>' +
        Math.round(Number(value) || 0) + '</strong></div>').join("");
    const needs = Object.entries(person.needs || {}).map(([key, value]) =>
        '<div class="dossier-meter need-meter"><span>' + esc(key) + '</span><i><b style="width:' +
        Math.max(0, Math.min(100, Number(value) || 0)) + '%"></b></i><strong>' +
        Math.round(Number(value) || 0) + '</strong></div>').join("");
    const memories = (person.memories || []).slice(0, 24).sort((a, b) => Number(b.tick) - Number(a.tick)).map(memory =>
        '<article class="dossier-memory"><div><strong>' + esc(memory.type || "event") +
        '</strong><span>YEAR ' + (Math.floor(Math.max(0, Number(memory.tick) || 0) / 400) + 1) +
        ' · TICK ' + Math.max(0, Math.floor(Number(memory.tick) || 0)) + '</span></div><p>' +
        esc(memory.text) + '</p></article>').join("");
    const relationships = (person.relationships || []).slice(0, 32).map(relation =>
        '<li><strong>' + esc(relation.targetName || personName(relation.targetId)) +
        '</strong><span>' + esc(relation.kind || "known") + ' · TRUST ' +
        Math.round(Number(relation.trust) || 0) + ' · RESPECT ' +
        Math.round(Number(relation.respect) || 0) + ' · AFFINITY ' +
        Math.round(Number(relation.affinity) || 0) + '</span></li>').join("");
    const activeGoal = person.activeGoal
        ? '<p><strong>' + esc(person.activeGoal.id.replaceAll("_", " ")) + '</strong> · priority ' + Math.round(Number(person.activeGoal.priority) || 0) + ' · since year ' + Math.max(1, Number(person.activeGoal.sinceYear) || 1) + '</p><p>' + esc(person.activeGoal.reason || "") + '</p>'
        : '<p class="dossier-empty">No active personal goal recorded yet.</p>';
    const goalHistory = (person.goalHistory || []).map(goal =>
        '<li><strong>' + esc(goal.id.replaceAll("_", " ")) + '</strong><span>' +
        'YEAR ' + Math.max(1, Number(goal.startedYear) || 1) + '–' + Math.max(1, Number(goal.endedYear) || 1) +
        ' · ' + (goal.completed ? "completed" : "superseded") + '</span></li>'
    ).join("");
    const partners = family.partners.map(link => ({
        personId: link.personId, label: link.status + " · since year " + link.sinceYear +
            (link.endedYear == null ? "" : " · ended year " + link.endedYear)
    }));
    detail.innerHTML =
        '<header class="dossier-identity"><svg class="dossier-portrait" viewBox="0 0 256 320" role="img" aria-label="Portrait of ' + esc(person.name) + '"><use href="assets/royal-portraits.svg#' + portraitSymbol(entity) + '"></use></svg>' +
        '<div class="dossier-identity-copy"><div class="dossier-kicker">' + (entity.isArchived ? "DECEASED · " : "") + esc(person.species) + ' · ' + esc(person.sex || 'unknown') + ' · ' + esc(person.role) +
        '</div><h2>' + esc(person.name) + '</h2><p>Age ' + Math.floor(Number(person.ageYears) || 0) +
        ' · ' + esc(person.lifeStage) + ' · Born in year ' + Math.max(1, Number(person.bornAtYear) || 1) +
        (entity.isArchived ? ' · Died in year ' + Math.max(1, Number(entity.deathYear) || 1) + ' · ' + esc(entity.deathCause || 'unknown') : '') +
        '</p></div></header>' +
        renderSovereignDossier(entity, family) +
        '<div class="dossier-columns">' +
        '<div class="dossier-column">' +
        '<section class="dossier-section"><h3>PERSONALITY</h3>' + (traits || '<p class="dossier-empty">No traits recorded.</p>') + '</section>' +
        '<section class="dossier-section"><h3>NEEDS</h3>' + (needs || '<p class="dossier-empty">No needs recorded.</p>') + '</section>' +
        '<section class="dossier-section"><h3>ACTIVE PERSONAL GOAL</h3>' + activeGoal + '</section>' +
        '<section class="dossier-section"><h3>LONG-TERM ASPIRATIONS</h3><p>' + esc((person.goals || []).join(" · ") || "No long-term goals recorded.") + '</p></section>' +
        '<section class="dossier-section"><h3>GOAL HISTORY</h3>' + (goalHistory ? '<ul class="dossier-link-list">' + goalHistory + '</ul>' : '<p class="dossier-empty">No previous goal changes recorded.</p>') + '</section>' +
        renderLinks("PARENTS", family.parents, entry => entry.kind + " · since year " + entry.sinceYear) +
        renderLinks("CHILDREN", family.children, entry => entry.kind + " · since year " + entry.sinceYear) +
        renderLinks("SIBLINGS", family.siblings, entry => entry.relation + " sibling") +
        renderLinks("PARTNERSHIPS", partners, entry => entry.label) +
        renderLinks("GUARDIANS", family.guardians || [], entry => "guardian since year " + entry.sinceYear) +
        renderLinks("WARDS", family.wards || [], entry => "ward since year " + entry.sinceYear) +
        '</div><div class="dossier-column">' +
        '<section class="dossier-section"><h3>PERSONAL CHRONICLE</h3>' +
        (memories ? '<div class="dossier-memories">' + memories + '</div>' : '<p class="dossier-empty">No notable memories have been recorded yet.</p>') +
        '</section><section class="dossier-section"><h3>RELATIONSHIPS</h3>' +
        (relationships ? '<ul class="dossier-link-list">' + relationships + '</ul>' : '<p class="dossier-empty">No personal relationships have been recorded yet.</p>') +
        '</section><section class="dossier-section"><h3>RECORD</h3><p>Stable person ID: <code>' +
        esc(person.id) + '</code></p><p>Household: ' + esc(entity.householdId || "Not assigned") +
        '</p><p>Created at tick ' + Math.max(0, Number(person.createdAtTick) || 0) + '</p>' +
        (entity.isArchived ? '<p>Death cause: ' + esc(entity.cause || entity.deathCause || 'unknown') + '</p>' : '') + '</section>' +
        '</div></div>';
}

function refreshDossier() {
    const search = document.getElementById("people-search");
    renderPeopleList(search?.value || "");
    renderDossier(selectedPersonId);
}

export function setupCharacterDossier() {
    ensureDossierStyles();
    const modal = document.getElementById("people-modal");
    const open = document.getElementById("people-btn");
    const sovereignOpen = document.getElementById("sovereign-dossier-open");
    const close = document.getElementById("people-close");
    const list = document.getElementById("people-list");
    const search = document.getElementById("people-search");
    if (!modal || !open || !close || !list || !search) return;

    const show = () => {
        refreshDossier();
        modal.classList.remove("hidden");
        search.focus();
    };
    open.addEventListener("click", show);
    sovereignOpen?.addEventListener("click", () => {
        const houseKing = getRoyalHouse()?.king;
        const sovereignId = String(houseKing?.personId || houseKing?.id || "");
        const sovereign = people().find(entity => !entity.isArchived &&
            String(entity.personId || "") === sovereignId) ||
            people().find(entity => !entity.isArchived && entity.isKing);
        if (!sovereign) {
            show();
            return;
        }
        selectedPersonId = String(sovereign.personId);
        if (search) search.value = "";
        ["people-status-filter","people-role-filter","people-species-filter"].forEach(id => {
            const filter = document.getElementById(id);
            if (filter) filter.value = "";
        });
        refreshDossier();
        modal.classList.remove("hidden");
        close.focus();
    });
    close.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
    search.addEventListener("input", refreshDossier);
    ["people-status-filter","people-role-filter","people-species-filter"].forEach(id=>{
        document.getElementById(id)?.addEventListener("change",refreshDossier);
    });
    document.getElementById("person-dossier")?.addEventListener("click", event => {
        const related = event.target.closest("[data-person-id]");
        if (!related) return;
        const personId = String(related.dataset.personId || "");
        if (!people().some(entity => String(entity.personId) === personId)) return;
        selectedPersonId = personId;
        if (search) search.value = "";
        refreshDossier();
        list.querySelector('[data-person-id="' + CSS.escape(personId) + '"]')?.scrollIntoView({ block: "nearest" });
    });
    list.addEventListener("click", event => {
        const button = event.target.closest("[data-person-id]");
        if (!button) return;
        selectedPersonId = button.dataset.personId;
        refreshDossier();
    });
    window.addEventListener("kac:people-refresh", () => {
        if (!modal.classList.contains("hidden")) refreshDossier();
    });
    window.addEventListener("kac:open-person", event => {
        const personId = String(event.detail?.personId || "");
        if (!personId || !people().some(entity => String(entity.personId) === personId)) return;
        selectedPersonId = personId;
        if (search) search.value = "";
        refreshDossier();
        modal.classList.remove("hidden");
        search.focus();
    });
}
