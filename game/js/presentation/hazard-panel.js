// Management panel for the 1.2.20 hazard and disease layer.
//
// The panel is a reader over getHazardSnapshot(); every number comes from the
// saved state or the live protection survey. Buttons are real actions: prepare
// the season, treat casualties, cleanse corruption.
import { state } from "../core/state.js";
import { getHazardSnapshot } from "../systems/environmental-hazards.js";
import { HAZARD_CATEGORIES, HAZARD_CLIMATES } from "../world/hazard-data.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const pct = value => Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
const num = value => String(Math.max(0, Math.round(Number(value) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function intro(kicker, title, copy) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div>';
}
function meter(label, value, note = "") {
    const amount = pct(value);
    return '<div class="command-meter"><span>' + esc(label) + '</span><i><b style="width:' + amount + '%"></b></i><strong>' + amount + (note ? " " + esc(note) : "") + '</strong></div>';
}
function badge(text, tone = "") {
    return '<span class="biome-badge' + (tone ? " " + tone : "") + '">' + esc(text) + '</span>';
}
function categoryLabel(id) {
    return HAZARD_CATEGORIES[id]?.label || id;
}

function activeRow(hazard) {
    const severity = pct(hazard.severity);
    const tone = severity >= 66 ? "is-danger" : severity >= 33 ? "is-mid" : "";
    return '<div class="hazard-row" data-hazard-active="' + esc(hazard.mechanic) + '">' +
        '<div class="hazard-row-name"><strong>' + esc(hazard.label) + '</strong><small>' +
        esc(categoryLabel(hazard.category)) + ' · ' + esc(hazard.spec) + '</small></div>' +
        '<div class="hazard-row-meter"><span><i class="' + tone + '" style="width:' + severity + '%"></i></span><small>SEVERITY ' + severity + '%</small></div>' +
        '<div class="hazard-row-actions">' + badge(hazard.category === "disease" ? "DISEASE" : hazard.category === "geology" ? "GEOLOGICAL" : hazard.category === "magic" ? "ARCANE" : "ENVIRONMENT", tone) + '</div>' +
        '</div>';
}

function workRow(label, value, needs) {
    return '<div class="hazard-work-row"><div><strong>' + esc(label) + '</strong><small>' + esc(needs) + '</small></div>' +
        '<div class="hazard-row-meter"><span><i class="' + (pct(value) >= 60 ? "" : "is-mid") + '" style="width:' + pct(value) + '%"></i></span><small>' + pct(value) + '%</small></div></div>';
}

function chronicRow(label, value, note) {
    return '<div class="command-history"><strong>' + esc(label) + '</strong><p>' + esc(value) + (note ? ' · ' + esc(note) : '') + '</p></div>';
}

export function renderHazardPanel() {
    const snapshot = getHazardSnapshot();
    const profile = snapshot.profile;
    const mitigation = snapshot.mitigation;
    const chronic = snapshot.chronic;
    const magic = snapshot.magic;
    const active = snapshot.active.slice().sort((a, b) => b.severity - a.severity);
    const climate = state.worldOptions?.climate || "temperate";
    const rare = snapshot.rare;

    const activeRows = active.map(activeRow).join("");
    const diseases = snapshot.diseases.length
        ? snapshot.diseases.map(disease => '<div class="command-history"><strong>' + esc(disease.label.toUpperCase()) +
            ' · YEAR ' + num(disease.year) + '</strong><p>' + num(disease.cases) + ' cases recorded · source ' +
            esc(disease.source) + '</p></div>').join("")
        : '<p class="command-note">No regional disease has been recorded. Contaminated water, insects and crowded housing can still start an outbreak.</p>';

    const history = snapshot.history.length
        ? snapshot.history.slice().reverse().map(entry => '<article class="command-history"><strong>YEAR ' + num(entry.year) +
            ' · ' + esc(String(entry.kind || "hazard").toUpperCase()) + '</strong><p>' + esc(entry.text) + '</p></article>').join("")
        : '<p class="command-note">No hazard has struck this realm yet. The first season is being watched.</p>';

    const regionalCatalog = snapshot.profile.hazards.length
        ? snapshot.profile.hazards.map(row => badge(row.label.toUpperCase(), row.weight > 0.5 ? "is-danger" : "")).join("")
        : '<span class="command-note">No hazard is currently favoured by this climate.</span>';

    const magicRows = [
        ["Corruption", magic.corruption], ["Toxic fog", magic.fog], ["Cursed life", magic.cursed],
        ["Unnatural weather", magic.unnaturalWeather], ["Magical disease", magic.magicDisease],
        ["Animal shift", magic.animalShift], ["Forbidden growth", magic.forbidden], ["Wards", magic.wards]
    ].map(([label, value]) => meter(label.toUpperCase(), value)).join("");

    const chronicRows = [
        chronicRow("DROUGHT", chronic.droughtYears > 0 ? chronic.droughtYears + " consecutive year" + (chronic.droughtYears === 1 ? "" : "s") : "None", "level " + pct(chronic.droughtLevel) + "%"),
        chronicRow("PLAGUE SPREAD", chronic.plagueSpread.length ? chronic.plagueSpread.join(", ") : "Contained", "along trade routes"),
        chronicRow("ANIMAL PLAGUE", chronic.epizooticRegions.length ? chronic.epizooticRegions.join(", ") : "None", "herds affected"),
        chronicRow("WILDFIRE", chronic.wildfireZones.length ? chronic.wildfireZones.length + " burnt zones" : "None", chronic.burntTiles + " tiles"),
        chronicRow("FLOOD SCARS", chronic.floodScars > 0 ? chronic.floodScars + " unrecovered" : "None", "fields and channels"),
        chronicRow("VOLCANIC ASH", chronic.volcanicYears > 0 ? chronic.volcanicYears + " years remaining" : "None", "regional fallout"),
        chronicRow("CLIMATE DRIFT", (chronic.climateDrift >= 0 ? "+" : "") + chronic.climateDrift, "baseline hazard pressure"),
        chronicRow("DISASTER DEBT", pct(chronic.economicDrag) + "%", "drag on the treasury"),
        chronicRow("LOST GROUND", chronic.lostGround > 0 ? chronic.lostGround + " tiles" : "None", "permanent")
    ].join("");

    const preparedThisSeason = snapshot.preparedness.season === state.seasonIndex && snapshot.preparedness.year === state.year;
    const casualties = (state.entities || []).filter(entity => !entity.dead && entity.type === 20
        && Number(entity.illnessUntilTick) > state.tick).length;

    return intro("WEATHER, DISEASE & DISASTER", "Hazards of the realm",
        "Every climate carries its own dangers: heat, frost, storm, rock, poison, parasites, plague and — where the land is old — magic. They change with the season, cost stores, health and morale, and answer to the works you build.") +
        '<div class="command-summary"><div><small>SEASON</small><strong>' + esc(snapshot.seasonName.toUpperCase()) + ' · Y ' + num(snapshot.year) + '</strong></div>' +
        '<div><small>CLIMATE</small><strong>' + esc(String(climate).toUpperCase()) + '</strong></div>' +
        '<div><small>WEATHER</small><strong>' + esc(String(snapshot.weather).toUpperCase()) + '</strong></div>' +
        '<div><small>HAZARDS ACTIVE</small><strong>' + active.length + '</strong></div>' +
        '<div><small>READINESS</small><strong>' + pct(mitigation.score) + '%</strong></div>' +
        '<div><small>CASUALTIES</small><strong>' + casualties + '</strong></div></div>' +
        '<div class="hazard-actions"><button type="button" data-command="hazard-prepare"' + (preparedThisSeason ? " disabled" : "") + '>PREPARE FOR THE SEASON · 12 WOOD · 8G</button>' +
        '<button type="button" data-command="hazard-treat"' + (casualties && (state.health?.herbalDoses || 0) > 0 ? "" : " disabled") + '>TREAT CASUALTIES · ' + num(state.health?.herbalDoses || 0) + ' DOSES</button>' +
        '<button type="button" data-command="hazard-cleanse"' + (magic.corruption >= 0.05 ? "" : " disabled") + '>CLEANSE CORRUPTION · 10 STONE · 12G</button></div>' +
        (rare ? '<p class="command-note"><strong>RARE EVENT</strong> · ' + esc(rare.label) + ' · year ' + num(rare.year) + ' · ' + num(rare.years) + ' years of consequences.</p>' : "") +
        '<div class="command-section-title">ACTIVE HAZARDS · ' + active.length + '</div><div class="hazard-table">' +
        (activeRows || '<p class="command-note">The season is quiet. No hazard is currently pressing on the realm.</p>') + '</div>' +
        '<p class="command-note">The chronicle names every hazard that hurt a resident, a field, a road or the stores. Weather, season and the local climate decide which ones can appear; your works decide how hard they land.</p>' +
        '<div class="command-section-title">PROTECTION · READINESS ' + pct(mitigation.score) + '%</div><div class="hazard-work-grid">' +
        workRow("Wells & reservoirs", mitigation.well, "Wells and bathhouses keep water clean") +
        workRow("Irrigation", mitigation.irrigation, "Mills and worked farmland carry water to the fields") +
        workRow("Walls & dams", mitigation.dam, "Walls hold floodwater and slides") +
        workRow("Avalanche protection", mitigation.avalanche, "Foresters stabilise slopes, walls stop the run") +
        workRow("Drainage", mitigation.drainage, "Sanitation drains the wet ground") +
        workRow("Roads & bridges", mitigation.roads, "Built roads keep caravans moving") +
        workRow("Warehouses", mitigation.warehouse, "Stores keep grain dry and safe") +
        workRow("Medical care", mitigation.medical, "Clinic, healers and medicine treat the sick") +
        workRow("Adapted clothing", mitigation.clothing, "Bathhouse and insulated homes") +
        workRow("Regional research", mitigation.research, "School and scriptorium record local danger") +
        workRow("Specialised units", mitigation.units, "Barracks and smithy equip relief crews") +
        workRow("Settlement siting", mitigation.siting, "The keep anchors the settlement on safe ground") +
        '</div>' +
        '<p class="command-note">Readiness is the average of these works plus this season\'s preparation. A high readiness lowers severity, injuries and destruction; it cannot remove a hazard.</p>' +
        '<div class="command-section-title">REGIONAL DANGERS · ' + esc(String(climate).toUpperCase()) + '</div><div class="biome-chip-line">' + regionalCatalog + '</div>' +
        '<p class="command-note">' + esc(String(snapshot.catalog.total)) + ' hazards are modelled across ' + esc(String(HAZARD_CLIMATES.length)) + ' climates and ' +
        esc(String(snapshot.catalog.mechanics)) + ' rules; ' + esc(String(snapshot.catalog.climates)) + ' can occur in this climate.</p>' +
        '<div class="command-section-title">DISEASES & OUTBREAKS</div><div class="hazard-table">' + diseases + '</div>' +
        '<div class="command-section-title">LONG-TERM CONSEQUENCES</div><div class="command-history-list">' + chronicRows + '</div>' +
        '<div class="command-section-title">ARCANE BURDEN</div><div class="hazard-work-grid">' + magicRows + '</div>' +
        (magic.corruption > 0.2 ? '<p class="command-note is-danger">Corruption is spreading. Cleanse the ground before it reaches the fields and the herd.</p>' : '<p class="command-note">The arcane burden is held back by wards and by cleansing. It grows where corrupted ground is left alone.</p>') +
        '<div class="command-section-title">LOSSES</div><div class="command-summary">' +
        '<div><small>FOOD</small><strong>' + num(snapshot.losses.food) + '</strong></div>' +
        '<div><small>WOOD</small><strong>' + num(snapshot.losses.wood) + '</strong></div>' +
        '<div><small>STONE</small><strong>' + num(snapshot.losses.stone) + '</strong></div>' +
        '<div><small>GOLD</small><strong>' + num(snapshot.losses.gold) + '</strong></div>' +
        '<div><small>STRUCTURES</small><strong>' + num(snapshot.losses.buildings) + '</strong></div>' +
        '<div><small>ROADS</small><strong>' + num(snapshot.losses.roads) + '</strong></div>' +
        '<div><small>ILL</small><strong>' + num(snapshot.losses.ill) + '</strong></div>' +
        '<div><small>INJURED</small><strong>' + num(snapshot.losses.injured) + '</strong></div></div>' +
        '<div class="command-section-title">HAZARD RECORD</div><div class="command-history-list">' + history + '</div>' +
        '<p class="command-note">Hazards settle at the change of season and at the year boundary. The panel and the save hold the same state, so a reload in the middle of a drought keeps the drought.</p>';
}
