// Atelier panel: player-invoked AI books, artifacts and living contacts.
// The panel is intentionally built from the existing command-deck classes so
// it fits the static game without a second design system.
import {state} from "../core/state.js";
import {
    AI_ACTION_COSTS,
    AI_CHRONICLE_LIMITS,
    createAiChronicleState,
    normalizeAiChronicleState
} from "../core/ai-chronicle-state.js";
import {canAffordAiAction} from "../systems/ai-chronicle.js";
import {getPopulationSnapshot} from "../systems/population-register.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const sourceLabel = source => source === "ai" ? "LIVE AI" : source === "offline" ? "OFFLINE CHRONICLER" : "NOT YET USED";
const costLabel = cost => Object.entries(cost).map(([key, value]) => number(value) + " " + key.toUpperCase()).join(" · ");

function intro(kicker, title, body) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) +
        '</h3><p>' + esc(body) + '</p></div>';
}

function citizensForSelect() {
    if (!state.hasStarted) return [];
    try {
        return getPopulationSnapshot().citizens
            .filter(citizen => !citizen.royal)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .slice(0, 9);
    } catch {
        return [];
    }
}

function bookCard(entry) {
    return '<article class="command-history"><div class="command-note"><strong>' + esc(entry.title) + '</strong><br>' +
        esc(entry.author) + ' · ' + esc(entry.genre) + ' · year ' + number(entry.createdYear) +
        ' · ' + sourceLabel(entry.source) + '</div><p>' + esc(entry.summary) + '</p>' +
        '<details><summary>READ AN EXCERPT</summary><p>' + esc(entry.excerpt) + '</p></details></article>';
}

function artifactCard(entry) {
    return '<article class="command-history"><div class="command-note"><strong>' + esc(entry.name) + '</strong><br>' +
        esc(entry.material) + ' · ' + esc(entry.era) + ' · value ' + number(entry.value) + 'G · ' +
        sourceLabel(entry.source) + '</div><p>' + esc(entry.description) + '</p>' +
        (entry.inscription ? '<p class="command-note"><strong>INSCRIPTION</strong> ' + esc(entry.inscription) + '</p>' : '') +
        (entry.provenance ? '<p class="command-note"><strong>PROVENANCE</strong> ' + esc(entry.provenance) + '</p>' : '') + '</article>';
}

function conversationCard(entry) {
    const lines = entry.lines.map(line =>
        '<p class="command-note"><strong>' + (line.speaker === "ruler" ? "THE CROWN" : esc(entry.personName).toUpperCase()) +
        '</strong><br>' + esc(line.text) + '</p>').join("");
    return '<article class="command-history"><div class="command-note"><strong>' + esc(entry.personName) + '</strong> · ' +
        esc(entry.sentiment) + ' · bond +' + number(entry.bondDelta) + ' · year ' + number(entry.createdYear) +
        ' · ' + sourceLabel(entry.source) + '</div><p>' + esc(entry.summary) + '</p>' + lines +
        (entry.memory ? '<p class="command-note"><strong>MEMORY</strong> ' + esc(entry.memory) + '</p>' : '') +
        (entry.rumor ? '<p class="command-note"><strong>RUMOUR</strong> ' + esc(entry.rumor) + '</p>' : '') + '</article>';
}

function contactCard(contact) {
    return '<article class="command-history" data-ai-contact="' + esc(contact.personId) + '"><div class="command-note"><strong>' + esc(contact.name) + '</strong> · ' +
        'BOND ' + Math.round(contact.bond) + ' / 100 · TRUST ' + Math.round(contact.trust) + ' / 100</div>' +
        (contact.lastTopic ? '<p>' + esc(contact.lastTopic) + '</p>' : '') +
        (contact.memories?.length ? '<p class="command-note"><strong>MEMORIES</strong> ' +
            contact.memories.map(esc).join(' · ') + '</p>' : '') +
        '<div class="command-actions"><button type="button" class="command-choice" data-open-person="' +
        esc(contact.personId) + '">OPEN PERSON DOSSIER</button></div></article>';
}

function lastEffectSummary(ai) {
    const effect = ai.lastEffect;
    if (!effect) return '<p class="command-note">No commission has changed the realm yet. The declared effect appears here after the first one.</p>';
    const parts = [];
    if (effect.legitimacy) parts.push("+" + effect.legitimacy + " LEGITIMACY");
    if (effect.morale) parts.push("+" + effect.morale + " MORALE");
    if (effect.bond) parts.push("+" + effect.bond + " BOND");
    if (effect.trust) parts.push("+" + effect.trust + " TRUST");
    return '<div class="command-summary"><div><small>LAST DECLARED EFFECT</small><strong>' +
        (parts.length ? esc(parts.join(" · ")) : "NO STAT CHANGE") + '</strong></div>' +
        '<div><small>LEGITIMACY NOW</small><strong>' + Math.round(Number(state.politics?.legitimacy) || 0) + ' / 100</strong></div>' +
        '<div><small>MORALE NOW</small><strong>' + Math.round(Number(state.morale) || 0) + ' / 100</strong></div>' +
        '<div><small>EFFECT SOURCE</small><strong>' + sourceLabel(ai.lastSource) + '</strong></div></div>';
}

export function renderAiChroniclePanel() {
    if (!state.hasStarted) {
        return intro("THE ATELIER", "Awaiting its first commission",
            "The Atelier opens when a realm has a ruler, people and a history worth recording.") +
            '<p class="command-note">It creates in-world books, historical artifacts and deeper conversations. Every commission is stored in the realm save.</p>';
    }
    state.aiChronicle = normalizeAiChronicleState(state.aiChronicle || createAiChronicleState());
    const ai = state.aiChronicle;
    const people = citizensForSelect();
    const busy = Boolean(state.aiBusy);
    const canBook = !busy && canAffordAiAction("book");
    const canArtifact = !busy && canAffordAiAction("artifact");
    const canTalk = !busy && people.length > 0;
    const status = ai.lastSource === "ai"
        ? "LIVE AI · the same-origin chronicler answered the last commission."
        : ai.lastSource === "offline"
            ? "OFFLINE CHRONICLER · the deterministic court writer filled the last commission. Add a server-side API key to enable the live model."
            : "READY · the court writer is available. Live AI is optional; the deterministic chronicler works offline.";
    const statusNote = ai.lastError
        ? '<p class="command-note"><strong>LAST ATTEMPT</strong> ' + esc(ai.lastError) + '</p>' : "";
    const options = people.map(person =>
        '<option value="' + esc(person.id) + '">' + esc(person.name) + ' · ' + esc(person.profession) +
        ' · loyalty ' + Math.round(Number(person.loyalty) || 0) + '</option>').join("");
    const books = ai.books.length
        ? ai.books.map(bookCard).join("")
        : '<p class="command-note">No book has been commissioned. The first volume will enter the court library.</p>';
    const artifacts = ai.artifacts.length
        ? ai.artifacts.map(artifactCard).join("")
        : '<p class="command-note">No artifact has been recovered. The reliquary is waiting for a commission.</p>';
    const conversations = ai.conversations.length
        ? ai.conversations.map(conversationCard).join("")
        : '<p class="command-note">No audience has been recorded. A conversation creates a named contact with a durable memory.</p>';
    const contacts = Object.values(ai.contacts);
    const contactList = contacts.length
        ? contacts.sort((a, b) => (b.lastTick || 0) - (a.lastTick || 0)).map(contactCard).join("")
        : '<p class="command-note">No living contacts yet. Speak with a resident to begin a relationship.</p>';
    return intro("THE ATELIER · LIVING CHRONICLE",
        "Books, relics and the people who remember them",
        "The court writer turns the realm's actual names, years, stores and recent events into persistent culture. The simulation remains authoritative; AI prose is optional, validated and bounded.") +
        '<div class="command-summary"><div><small>BOOKS</small><strong>' + number(ai.books.length) + ' / ' + AI_CHRONICLE_LIMITS.books + '</strong></div>' +
        '<div><small>ARTIFACTS</small><strong>' + number(ai.artifacts.length) + ' / ' + AI_CHRONICLE_LIMITS.artifacts + '</strong></div>' +
        '<div><small>CONTACTS</small><strong>' + number(contacts.length) + ' / ' + AI_CHRONICLE_LIMITS.contacts + '</strong></div>' +
        '<div><small>LAST SOURCE</small><strong>' + sourceLabel(ai.lastSource) + '</strong></div></div>' +
        '<p class="command-note"><strong>' + status + '</strong></p>' + statusNote + lastEffectSummary(ai) +
        '<div class="command-section-title">THE SCRIPTORIUM · COMMISSION A BOOK</div>' +
        '<p class="command-note">A named author in the realm writes a short, readable volume tied to the current year and a recorded event. Cost: ' +
        costLabel(AI_ACTION_COSTS.book) + '. The court gains legitimacy and morale.</p>' +
        '<div class="command-actions"><button type="button" class="command-choice" data-ai-command="book"' +
        (canBook ? "" : " disabled") + '>COMMISSION A BOOK · ' + costLabel(AI_ACTION_COSTS.book) + '</button></div>' +
        '<div class="command-section-title">THE RELIQUARY · RECOVER AN ARTIFACT</div>' +
        '<p class="command-note">An artifact is given a material, era, inscription and provenance from the realm record. Cost: ' +
        costLabel(AI_ACTION_COSTS.artifact) + '. The crown gains legitimacy.</p>' +
        '<div class="command-actions"><button type="button" class="command-choice" data-ai-command="artifact"' +
        (canArtifact ? "" : " disabled") + '>RECOVER AN ARTIFACT · ' + costLabel(AI_ACTION_COSTS.artifact) + '</button></div>' +
        '<div class="command-section-title">THE SALON · OPEN A CONVERSATION</div>' +
        '<p class="command-note">Choose a named resident. The court writer writes a short audience, records a durable memory and deepens the contact bond and trust. Conversation is free.</p>' +
        '<div class="command-inline"><select id="ai-person-select" aria-label="Choose a resident for the audience"' +
        (people.length ? "" : " disabled") + '><option value="">Choose a resident…</option>' + options + '</select>' +
        '<button type="button" class="command-choice" data-ai-command="conversation"' +
        (canTalk ? "" : " disabled") + '>OPEN A CONVERSATION</button></div>' +
        '<div class="command-section-title">COURT LIBRARY · ' + number(ai.books.length) + ' VOLUMES</div>' + books +
        '<div class="command-section-title">THE RELIQUARY · ' + number(ai.artifacts.length) + ' OBJECTS</div>' + artifacts +
        '<div class="command-section-title">LIVING CONTACTS · ' + number(contacts.length) + ' RELATIONSHIPS</div>' + contactList +
        '<div class="command-section-title">RECORDED AUDIENCES · ' + number(ai.conversations.length) + '</div>' + conversations +
        '<p class="command-note">The optional live model is called through a same-origin Pages Function. The API key never enters this page. Without a proxy, the offline chronicler still produces complete, saveable content.</p>';
}

/** A compact Atelier record block for the existing CHRONICLE tab. */
export function renderAiArchiveSection() {
    if (!state.hasStarted) return "";
    const ai = normalizeAiChronicleState(state.aiChronicle || createAiChronicleState());
    const items = [
        ...ai.books.map(entry => ({kind: "book", title: entry.title, text: entry.summary, year: entry.createdYear, tick: entry.createdTick, source: entry.source})),
        ...ai.artifacts.map(entry => ({kind: "artifact", title: entry.name, text: entry.description, year: entry.createdYear, tick: entry.createdTick, source: entry.source})),
        ...ai.conversations.map(entry => ({kind: "conversation", title: entry.personName, text: entry.summary, year: entry.createdYear, tick: entry.createdTick, source: entry.source}))
    ].sort((a, b) => (Number(b.tick) || 0) - (Number(a.tick) || 0)).slice(0, 8);
    if (!items.length) return "";
    const rows = items.map(item => '<article class="command-history" data-ai-archive-entry="' + esc(item.kind) + '"><div class="command-note"><strong>' +
        esc(String(item.kind).toUpperCase()) + ' · YEAR ' + number(item.year) + ' · ' + sourceLabel(item.source) + '</strong></div><p><strong>' +
        esc(item.title) + '</strong> — ' + esc(item.text) + '</p></article>').join("");
    return '<div class="command-section-title">COURT CHRONICLE · ATELIER RECORDS · ' + number(ai.books.length + ai.artifacts.length + ai.conversations.length) + '</div>' +
        '<div class="command-history-list">' + rows + '</div>' +
        '<div class="command-actions"><button type="button" class="command-choice" data-command="open-atelier">OPEN THE ATELIER</button></div>';
}

/** Contact records shown inside the existing PEOPLE panel. */
export function renderAiContactSummary() {
    if (!state.hasStarted) return "";
    const ai = normalizeAiChronicleState(state.aiChronicle || createAiChronicleState());
    const contacts = Object.values(ai.contacts).sort((a, b) => (b.lastTick || 0) - (a.lastTick || 0));
    if (!contacts.length) return "";
    return '<div class="command-section-title">COURT CONTACTS · ' + number(contacts.length) + ' NAMED RELATIONSHIPS</div>' +
        '<p class="command-note">These are living relationships created in the Atelier. Bond, trust and durable memories persist in the realm save and are also reachable from the CHRONICLE tab archive.</p>' +
        '<div class="command-history-list">' + contacts.map(contactCard).join("") + '</div>';
}
