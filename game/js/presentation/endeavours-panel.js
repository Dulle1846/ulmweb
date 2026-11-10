// Crown Endeavours management panel. Kept outside the main management file so
// the late-game screen stays readable and can be rendered by the shared command
// deck without adding another giant inline template.
import { state } from "../core/state.js";
import { getEndeavourSnapshot } from "../systems/endeavours.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const number = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const costLabel = cost => Object.entries(cost || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => Math.floor(Number(value)) + " " + key.toUpperCase()).join(" · ");
const intro = (kicker, title, text) => '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';

function effectGrid(m) {
    const rows = [
        ["TAX YIELD", m.tax * 100, "%"],
        ["TRADE TERMS", m.trade * 100, "%"],
        ["RESEARCH", m.research * 100, "%"],
        ["SOLDIER POWER", m.military * 100, "%"],
        ["SANITATION", m.health, ""],
        ["MORALE", m.morale, "/tick"],
        ["RELATION / YEAR", m.diplomacy, ""],
        ["LEGITIMACY / YEAR", m.legitimacy, ""],
        ["FOOD SAVED", m.food * 100, "%"]
    ].filter(([, value]) => Math.abs(Number(value)) > 0.0001);
    if (!rows.length) return '<p class="command-note">No crown work is complete yet. The first completed tier begins a permanent effect.</p>';
    return '<div class="court-effect-grid endeavour-effect-grid">' + rows.map(([label, value, suffix]) =>
        '<span>' + esc(label) + '<b>+' + (Math.round(Number(value) * 100) / 100) + suffix + '</b></span>'
    ).join("") + '</div>';
}

function activeCard(e) {
    if (!e.active) return '<div class="command-note"><strong>NO CROWN WORK IS UNDERWAY.</strong> Choose a path below, name an overseer and set a budget. The work advances once per year.</div>';
    const funding = e.fundingLevels.map(level =>
        `<button class="command-choice${level.id === e.active.funding ? " is-current" : ""}" data-command="endeavour-active-funding" data-value="${level.id}"><strong>${esc(level.label.toUpperCase())}</strong><small>${level.gold} gold / year · ×${level.multiplier}</small></button>`
    ).join("");
    const reassign = e.active.overseerPresent ? "" :
        `<div class="command-inline"><select id="endeavour-active-overseer" aria-label="Appoint a replacement overseer"><option value="">The post is vacant…</option>${e.candidates.map(c => `<option value="${esc(c.personId)}">${esc(c.name)} · skill ${c.skill}</option>`).join("")}</select><button data-command="endeavour-reassign">APPOINT OVERSEER</button></div>`;
    return `<div class="endeavour-active">
        <div class="command-ribbon">CROWN WORK UNDERWAY · TIER ${e.active.tier} / ${e.tierLimit}</div>
        <h3>${esc(e.active.project?.label || "Crown work")}</h3>
        <p>${esc(e.active.project?.description || "")}</p>
        <div class="command-summary">
            <div><small>OVERSEER</small><strong>${esc(e.active.overseerName)}</strong></div>
            <div><small>SKILL</small><strong>${e.active.overseerSkill}</strong></div>
            <div><small>BUDGET</small><strong>${esc(e.active.fundingDetails.label.toUpperCase())}</strong></div>
            <div><small>PAID LAST YEAR</small><strong>${e.active.fundingDetails.gold}G</strong></div>
        </div>
        <div class="endeavour-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e.active.percent}"><i style="width:${e.active.percent}%"></i></div>
        <p class="command-note">${e.active.progress} / ${e.active.required} work · last year ${e.active.lastWork} · started year ${e.active.startedYear} · ${esc(e.active.effectsText)}</p>
        <div class="command-actions">${funding}<button data-command="endeavour-abandon">SET ASIDE</button></div>
        ${reassign}
    </div>`;
}

function pathCards(e) {
    return e.paths.map(path => {
        const projects = path.projects.map(project => {
            const status = project.maxed ? "MASTERED" : project.locked ? "LOCKED" : e.active ? "WORK UNDERWAY" : !project.affordable ? "STORES TOO LOW" : "READY";
            return `<article class="command-policy endeavour-project" data-endeavour-project="${esc(project.id)}" data-endeavour-status="${esc(status.toLowerCase())}">
                <div><span class="command-ribbon">${esc(status)} · TIER ${project.tier} / ${e.tierLimit} · ${project.completed} COMPLETE</span>
                <strong>${esc(project.label)}</strong><p>${esc(project.description)}</p>
                <small>${costLabel(project.cost)} · ${project.required} work · ${esc(project.effectsText)}${project.requires ? " · requires " + esc(project.requires) : ""}</small></div>
                <button data-command="endeavour-start" data-value="${esc(project.id)}"${project.startable ? "" : " disabled"}>BEGIN · TIER ${project.tier}</button>
            </article>`;
        }).join("");
        return `<section class="endeavour-path" style="--endeavour-accent:${esc(path.accent)}" data-endeavour-path="${esc(path.id)}">
            <header class="endeavour-path-head"><div><span>${esc(path.label.toUpperCase())}</span><h4>${esc(path.focus)}</h4></div><b>${path.completed} / ${path.maximum}</b></header>
            <div class="endeavour-project-list">${projects}</div>
        </section>`;
    }).join("");
}

export function renderEndeavoursPanel(funding = 1) {
    const e = getEndeavourSnapshot();
    const gold = Number(state.resources?.gold) || 0;
    const overseerOptions = e.candidates.map(c => `<option value="${esc(c.personId)}">${esc(c.name)} · age ${c.ageYears} · skill ${c.skill}</option>`).join("");
    const fundingButtons = e.fundingLevels.map(level =>
        `<button class="command-choice${level.id === funding ? " is-current" : ""}" data-command="endeavour-funding" data-value="${level.id}"><strong>${esc(level.label.toUpperCase())}</strong><small>${level.gold} gold / year · ×${level.multiplier}</small></button>`
    ).join("");
    const history = e.history.length ? e.history.map(entry =>
        `<article class="command-history"><strong>YEAR ${entry.year} · ${esc(entry.kind.toUpperCase())} · ${esc(entry.label)}</strong><p>Tier ${entry.tier} · ${esc(entry.overseerName)}${entry.effectsText ? " · " + esc(entry.effectsText) : ""}</p></article>`
    ).join("") : '<p class="command-note">The crown has not yet completed a work. The first stone is still uncut.</p>';
    return intro("THE LONG WORK OF THE CROWN", "Crown endeavours", "The thirteen ambitions are told; this is what a mature realm does next. Choose a path, name a resident as overseer and commit real stores. Every completed tier permanently changes a live system, and every project can be renewed up to five times at rising cost.") +
        '<div class="command-summary"><div><small>WORKS COMPLETE</small><strong>' + e.totalCompleted + '</strong></div><div><small>ACTIVE WORK</small><strong>' + esc(e.active?.project?.label || "NONE") + '</strong></div><div><small>PATHS</small><strong>' + e.paths.length + '</strong></div><div><small>TREASURY</small><strong>' + number(gold) + 'G</strong></div></div>' +
        '<div class="command-section-title">LIVE CROWN EFFECTS</div>' + effectGrid(e.modifiers) +
        '<div class="command-section-title">THE WORK IN HAND</div>' + activeCard(e) +
        '<div class="command-section-title">APPOINT AN OVERSEER &amp; SET THE BUDGET</div><div class="command-inline"><select id="endeavour-overseer-select" aria-label="Choose an overseer for the next crown work"><option value="">Let the crown choose the best available resident…</option>' + overseerOptions + '</select></div><div class="command-choice-grid">' + fundingButtons + '</div><p class="command-note">The overseer adds their skill to the annual work. The budget is paid from the treasury each year; if the treasury cannot pay, progress slows but does not stop. A vacant post also slows the work.</p>' +
        '<div class="command-section-title">FIVE PATHS OF A MATURE REALM</div><div class="endeavour-paths">' + pathCards(e) + '</div>' +
        '<div class="command-section-title">CROWN WORK RECORD</div><div class="command-history-list">' + history + '</div>';
}
