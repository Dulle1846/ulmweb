// Player-facing scenario card. The panel reads the shared snapshot and never
// changes the objective; settlement belongs to the daily simulation pass.
import { getScenarioSnapshot } from "../systems/scenario.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

function storeLabel(stores) {
    return ["food", "wood", "stone", "gold"]
        .filter(key => Number(stores?.[key]) > 0)
        .map(key => Number(stores[key]) + " " + key)
        .join(" · ");
}

export function renderScenarioPanel() {
    const scenario = getScenarioSnapshot();
    if (!scenario.visible) return "";
    const progress = Math.max(0, Math.min(1, Number(scenario.progress) || 0));
    const statusClass = scenario.status === "won" ? "is-won" : scenario.status === "failed" ? "is-failed" : "is-active";
    const history = (scenario.history || []).map(entry =>
        '<li><strong>' + esc(String(entry.status).toUpperCase()) + ' · YEAR ' + esc(entry.year) + ' · DAY ' + esc(entry.day + 1) + '</strong><span>' + esc(entry.text) + '</span></li>'
    ).join("");
    return '<section class="scenario-objective ' + statusClass + '" data-scenario-panel="' + esc(scenario.id) + '" aria-label="Scenario objective for ' + esc(scenario.name) + '">' +
        '<header class="scenario-objective__head"><div><span class="scenario-objective__kicker">SCENARIO · ' + esc(scenario.difficulty) + '</span><h4>' + esc(scenario.name) + '</h4></div><span class="scenario-objective__status">' + esc(scenario.statusLabel) + '</span></header>' +
        '<p class="scenario-objective__briefing">' + esc(scenario.description) + '</p>' +
        '<div class="scenario-objective__goal"><span>OBJECTIVE</span><strong>' + esc(scenario.objectiveLabel) + '</strong></div>' +
        '<div class="scenario-progress" role="progressbar" aria-label="' + esc(scenario.name) + ' progress" aria-valuemin="0" aria-valuemax="' + esc(scenario.target) + '" aria-valuenow="' + esc(Math.min(scenario.current, scenario.target)) + '"><div class="scenario-progress__track"><i style="width:' + Math.round(progress * 100) + '%"></i></div><div class="scenario-progress__label"><strong>' + esc(scenario.progressLabel) + '</strong><span>DEADLINE · ' + esc(scenario.deadlineLabel) + '</span></div></div>' +
        '<div class="scenario-objective__meta"><span><small>OPENING</small><strong>' + esc(scenario.startLabel) + '</strong></span><span><small>STARTING STORES</small><strong>' + esc(storeLabel(scenario.startStores)) + '</strong></span><span><small>MORALE / LEGITIMACY</small><strong>' + esc(scenario.startMorale) + ' / ' + esc(scenario.startLegitimacy) + '</strong></span><span><small>REWARD</small><strong>' + esc(scenario.rewardText) + '</strong></span><span><small>IF MISSED</small><strong>' + esc(scenario.failureText) + '</strong></span></div>' +
        (history ? '<details class="scenario-objective__history"><summary>SCENARIO RECORD</summary><ul>' + history + '</ul></details>' : "") +
        '<p class="scenario-objective__note">Starting stores replace the default opening stores; the chosen founding charter still adds its own bonus afterwards. The objective reads the live realm, not a scripted counter.</p>' +
        '</section>';
}
