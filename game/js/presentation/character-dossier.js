// Read-only character dossiers for persistent named people.
import { state } from "../core/state.js";
import { getFamilySnapshot } from "../systems/families.js";

let selectedPersonId = null;

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

function personName(personId) {
    const entity = state.entities.find(item => String(item.personId || "") === String(personId));
    if (entity?.person?.name) return entity.person.name;
    const memorial = (state.personArchive || []).find(item => item.personId === String(personId));
    return memorial?.person?.name || "Formerly recorded · " + String(personId || "unknown");
}

function renderPeopleList(query = "") {
    const list = document.getElementById("people-list");
    const count = document.getElementById("people-count");
    if (!list) return;
    const all = people();
    const needle = String(query).trim().toLowerCase();
    const filtered = all.filter(entity => {
        const person = entity.person;
        return !needle || [person.name, person.species, person.sex, person.role, person.familyName, entity.deathCause, entity.personId]
            .some(value => String(value || "").toLowerCase().includes(needle));
    }).slice(0, 100);
    if (!filtered.some(entity => entity.personId === selectedPersonId)) {
        selectedPersonId = filtered[0]?.personId || null;
    }
    if (count) count.textContent = needle ? filtered.length + " MATCHES" : all.length + " PEOPLE";
    list.innerHTML = filtered.length ? filtered.map(entity => {
        const person = entity.person;
        return '<button type="button" class="person-list-item' +
            (entity.personId === selectedPersonId ? ' is-selected' : '') +
            '" data-person-id="' + esc(entity.personId) + '">' +
            '<span class="person-list-name">' + esc(person.name) + (entity.isKing ? ' <b>♛</b>' : '') + '</span>' +
            '<span class="person-list-meta">' + esc(person.species) + ' · ' + esc(person.sex || 'unknown') + ' · ' + esc(person.role) + ' · ' +
            Math.floor(Number(person.ageYears) || 0) + (entity.isArchived ? ' · DECEASED' : '') + '</span></button>';
    }).join("") : '<div class="empty-state">No matching people were found.</div>';
}

function renderLinks(title, entries, labelFor) {
    const rows = entries.map(entry => {
        const id = typeof entry === "string" ? entry : entry.personId;
        return '<li><strong>' + esc(personName(id)) + '</strong><span>' + esc(labelFor(entry)) + '</span></li>';
    }).join("");
    return '<section class="dossier-section"><h3>' + esc(title) + '</h3>' +
        (rows ? '<ul class="dossier-link-list">' + rows + '</ul>' : '<p class="dossier-empty">No recorded ties.</p>') +
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
    const family = getFamilySnapshot(personId) || { parents: [], children: [], siblings: [], partners: [] };
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
        '<header class="dossier-identity"><div class="dossier-seal">' + (entity.isArchived ? '†' : entity.isKing ? '♛' : '✦') +
        '</div><div><div class="dossier-kicker">' + (entity.isArchived ? "DECEASED · " : "") + esc(person.species) + ' · ' + esc(person.sex || 'unknown') + ' · ' + esc(person.role) +
        '</div><h2>' + esc(person.name) + '</h2><p>Age ' + Math.floor(Number(person.ageYears) || 0) +
        ' · ' + esc(person.lifeStage) + ' · Born in year ' + Math.max(1, Number(person.bornAtYear) || 1) +
        (entity.isArchived ? ' · Died in year ' + Math.max(1, Number(entity.deathYear) || 1) + ' · ' + esc(entity.deathCause || 'unknown') : '') +
        '</p></div></header>' +
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
    const modal = document.getElementById("people-modal");
    const open = document.getElementById("people-btn");
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
    close.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
    search.addEventListener("input", refreshDossier);
    list.addEventListener("click", event => {
        const button = event.target.closest("[data-person-id]");
        if (!button) return;
        selectedPersonId = button.dataset.personId;
        refreshDossier();
    });
    window.addEventListener("kac:people-refresh", () => {
        if (!modal.classList.contains("hidden")) refreshDossier();
    });
}
