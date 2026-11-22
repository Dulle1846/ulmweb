// Management panel for the 1.2.20 hazard and disease layer.
//
// The panel is a reader over getHazardSnapshot(); every number comes from the
// saved state or the live protection survey. Buttons are real actions: prepare
// the season, treat casualties, cleanse corruption.
import { state } from "../core/state.js";
import { getHazardSnapshot, getHazardTerrainShield } from "../systems/environmental-hazards.js";
import { isHazardSurfaceHidden } from "../systems/hazard-proof.js";
import { HAZARD_CATALOG, HAZARD_CATEGORIES, HAZARD_CLIMATES, HAZARD_EFFECTS } from "../world/hazard-data.js";
import { getHazardSimulationEffects } from "../systems/hazard-modifiers.js";
import { getDisasterRecoverySnapshot } from "../systems/disaster-recovery.js";
import { HAZARD_CREWS, HAZARD_CREW_ORDER, RARE_CHAIN_BY_ID, RESPONSE_PLANS, RESPONSE_PLAN_ORDER } from "../world/hazard-expansion-data.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const pct = value => Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
const num = value => String(Math.max(0, Math.round(Number(value) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function intro(kicker, title, copy) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div>';
}
function meter(label, value, spec = "") {
    if (spec && isHazardSurfaceHidden(spec)) return "";
    const amount = pct(value);
    return '<div class="command-meter"' + (spec ? ' data-hazard-surface="' + esc(spec) + '" data-hazard-value="' + amount + '"' : "") + '><span>' + esc(label) + '</span><i><b style="width:' + amount + '%"></b></i><strong>' + amount + '</strong></div>';
}
function badge(text, tone = "") {
    return '<span class="biome-badge' + (tone ? " " + tone : "") + '">' + esc(text) + '</span>';
}
function categoryLabel(id) {
    return HAZARD_CATEGORIES[id]?.label || id;
}

// The concrete drag of one hazard, printed directly under its name so the
// player can connect the season's danger with the numbers the realm feels.
function impactLine(hazard) {
    const effects = HAZARD_EFFECTS[hazard.mechanic];
    if (!effects) {
        return hazard.category === "magic" ? "ARCANE BURDEN"
            : hazard.category === "regional" ? "STANDING REGIONAL DANGER" : "";
    }
    const severity = Math.max(0, Math.min(1, Number(hazard.severity) || 0));
    const parts = [];
    if (effects.work) parts.push("WORK −" + Math.round(effects.work * severity * 100) + "%");
    if (effects.field) parts.push("FIELDS −" + Math.round(effects.field * severity * 100) + "%");
    if (effects.food) parts.push("FOOD −" + Math.max(1, Math.round(effects.food * severity)));
    else if (effects.water) parts.push("WATER −" + Math.max(1, Math.round(effects.water * severity)));
    if (effects.illness) parts.push("ILLNESS " + Math.round(effects.illness * severity * 100) + "%");
    else if (effects.injury) parts.push("INJURY " + Math.round(effects.injury * severity * 100) + "%");
    if (effects.outbreak) parts.push("OUTBREAK " + Math.round(effects.outbreak * severity * 100) + "%");
    if (effects.trade) parts.push("TRADE −" + Math.round(effects.trade * severity * 100) + "%");
    if (effects.pasture) parts.push("PASTURE −" + Math.round(effects.pasture * severity * 100) + "%");
    if (effects.morale) parts.push("MORALE −" + Math.max(1, Math.round(effects.morale * severity * 0.5)));
    if (effects.herd) parts.push("HERDS AFFECTED");
    if (effects.ash) parts.push("ASH");
    if (effects.permanent) parts.push("PERMANENT LOSS");
    if (effects.destroy) parts.push("DAMAGE " + Math.round(effects.destroy * severity * 100) + "%");
    return parts.slice(0, 6).join(" · ");
}

const gain = value => {
    const percent = Math.round((Number(value) - 1) * 100);
    if (!percent) return "0%";
    return (percent > 0 ? "+" : "−") + Math.abs(percent) + "%";
};
const loss = value => {
    const percent = Math.round((1 - Number(value)) * 100);
    return percent > 0 ? "−" + percent + "%" : "0%";
};

function activeRow(hazard) {
    if (isHazardSurfaceHidden(hazard.spec)) return "";
    const severity = pct(hazard.severity);
    const tone = severity >= 66 ? "is-danger" : severity >= 33 ? "is-mid" : "";
    return '<div class="hazard-row" data-hazard-active="' + esc(hazard.mechanic) + '" data-hazard-surface="' + esc(hazard.spec) + '" data-hazard-value="' + severity + '">' +
        '<div class="hazard-row-name"><strong>' + esc(hazard.label) + '</strong><small>' +
        esc(categoryLabel(hazard.category)) + ' · ' + esc(hazard.spec) +
        (impactLine(hazard) ? ' · ' + esc(impactLine(hazard)) : '') + '</small></div>' +
        '<div class="hazard-row-meter"><span><i class="' + tone + '" style="width:' + severity + '%"></i></span><small>SEVERITY ' + severity + '%</small></div>' +
        '<div class="hazard-row-actions">' + badge(hazard.category === "disease" ? "DISEASE" : hazard.category === "geology" ? "GEOLOGICAL" : hazard.category === "magic" ? "ARCANE" : "ENVIRONMENT", tone) + '</div>' +
        '</div>';
}

function workRow(label, value, needs, spec = "") {
    if (spec && isHazardSurfaceHidden(spec)) return "";
    return '<div class="hazard-work-row"' + (spec ? ' data-hazard-surface="' + esc(spec) + '" data-hazard-value="' + pct(value) + '"' : "") + '><div><strong>' + esc(label) + '</strong><small>' + esc(needs) + '</small></div>' +
        '<div class="hazard-row-meter"><span><i class="' + (pct(value) >= 60 ? "" : "is-mid") + '" style="width:' + pct(value) + '%"></i></span><small>' + pct(value) + '%</small></div></div>';
}

function chronicRow(label, value, note, spec = "") {
    if (spec && isHazardSurfaceHidden(spec)) return "";
    return '<div class="command-history"' + (spec ? ' data-hazard-surface="' + esc(spec) + '" data-hazard-value="' + esc(value) + '"' : "") + '><strong>' + esc(label) + '</strong><p>' + esc(value) + (note ? ' · ' + esc(note) : '') + '</p></div>';
}

function effectRow(spec, label, value, note, percent = true) {
    if (!(Number(value) > 0) || isHazardSurfaceHidden(spec)) return "";
    const shown = percent ? pct(value) + "%" : num(value);
    const amount = Math.max(0, Math.min(100, percent ? pct(value) : Math.min(100, Number(value) || 0)));
    return '<div class="hazard-work-row" data-hazard-surface="' + esc(spec) + '" data-hazard-value="' + esc(value) + '">' +
        '<div><strong>' + esc(label) + '</strong><small>' + esc(note) + '</small></div>' +
        '<div class="hazard-row-meter"><span><i class="' + (amount >= 60 ? "" : "is-mid") + '" style="width:' + amount + '%"></i></span><small>' + esc(shown) + '</small></div></div>';
}

function bundleRow(bundle, spec) {
    if (!bundle || isHazardSurfaceHidden(spec)) return "";
    const exposure = Math.max(0, Number(bundle.exposure) || 1);
    return '<div class="hazard-work-row" data-hazard-surface="' + esc(spec) + '" data-hazard-value="' + exposure + '">' +
        '<div><strong>REGIONAL BUNDLE · ' + esc(String(bundle.climate || "region").toUpperCase()) + '</strong><small>' +
        esc((bundle.hazards || []).join(" · ")) + '</small></div>' +
        '<div class="hazard-row-meter"><span><i style="width:' + Math.min(100, Math.round(exposure * 50)) + '%"></i></span><small>EXPOSURE ×' + exposure.toFixed(2) + '</small></div></div>';
}

const costText = cost => {
    const entries = Object.entries(cost || {}).filter(([, amount]) => Number(amount) > 0);
    return entries.length ? entries.map(([resource, amount]) => num(amount) + " " + resource.toUpperCase()).join(" · ") : "NO COST";
};
const actionButton = (command, label, { value = "", disabled = false, tone = "" } = {}) =>
    '<button type="button" class="' + (tone || "") + '" data-command="' + esc(command) + '"' +
    (value ? ' data-value="' + esc(value) + '"' : "") + (disabled ? " disabled" : "") + '>' + esc(label) + '</button>';
const riskPercent = value => Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
const INSURANCE_CAP = 120;
const LOAN_PAYMENT = 24;

export function renderHazardPanel() {
    const snapshot = getHazardSnapshot();
    const profile = snapshot.profile;
    const mitigation = snapshot.mitigation;
    const chronic = snapshot.chronic;
    const magic = snapshot.magic;
    const active = snapshot.active.slice().sort((a, b) => b.severity - a.severity);
    const climate = state.worldOptions?.climate || "temperate";
    const rare = snapshot.rare;
    const simulation = getHazardSimulationEffects();
    const pressure = active.filter(hazard => hazard.category !== "regional");
    const response = snapshot.response;
    const forecast = snapshot.forecast;
    const scars = snapshot.scars;
    const recovery = getDisasterRecoverySnapshot();
    const planLocked = Boolean(response.plan && response.planSeason === state.seasonIndex && response.planYear === state.year);
    const bundleSpec = HAZARD_CATALOG.find(row => row.mechanic.startsWith("bundle:") && row.climates.includes(climate))?.spec;
    const activeByMechanic = new Map(active.map(hazard => [hazard.mechanic, hazard]));
    const fieldPressure = mechanic => {
        const hazard = activeByMechanic.get(mechanic);
        return hazard ? Math.max(0.01, Number(hazard.severity) || 0) : 0;
    };
    const totalLosses = Object.values(snapshot.losses || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const effectRows = [
        ["1.2.20.53", "DISEASE PRESSURE", snapshot.modifiers.diseaseRisk, "higher disease chance", true],
        ["1.2.20.54", "INJURY RESISTANCE", snapshot.modifiers.resistance, "equipment and experience", true],
        ["1.2.20.55", "FOOD & WATER DEMAND", snapshot.modifiers.needs, "household draw", true],
        ["1.2.20.56", "RESTRICTED MOVEMENT", snapshot.modifiers.movement, "villagers and expeditions", true],
        ["1.2.20.57", "HAZARD LOSSES", totalLosses, "real stores, fields and herds", false],
        ["1.2.20.58", "LOWER WORK OUTPUT", snapshot.modifiers.work, "production and building", true],
        ["1.2.20.59", "CLOTHING & SHELTER", mitigation.clothing, "cold and heat protection", true],
        ["1.2.20.60", "REGIONAL ADAPTATION", snapshot.modifiers.adaptation, "relief in derived multipliers", true],
        ["1.2.20.61", "MORALE PRESSURE", snapshot.modifiers.morale, "contentment of the realm", true],
        ["1.2.20.62", "MEDICAL CARE", mitigation.medical, "outbreak and illness relief", true],
        ["1.2.20.63", "CROP FAILURE", fieldPressure("hazard:drought"), "drought field pressure", true],
        ["1.2.20.64", "FROST DAMAGE", fieldPressure("hazard:frost"), "frost field pressure", true],
        ["1.2.20.65", "FLOOD DAMAGE", fieldPressure("hazard:flood"), "flood field pressure", true],
        ["1.2.20.66", "CROP DISEASE", fieldPressure("hazard:plant-disease"), "plant disease pressure", true],
        ["1.2.20.67", "CROP PESTS", fieldPressure("hazard:pest"), "pest field pressure", true],
        ["1.2.20.68", "PASTURE LOSS", snapshot.modifiers.pasture, "herd carrying capacity", true],
        ["1.2.20.69", "HERD PLAGUE", (Number(snapshot.losses?.herds) || 0) || Math.round(fieldPressure("hazard:epizootic") * 100), "animals lost", false],
        ["1.2.20.70", "TRADE DAMAGE", snapshot.modifiers.trade, "caravan terms", true],
        ["1.2.20.71", "HARDER EXTRACTION", snapshot.modifiers.extraction, "lumber, quarry and mine", true]
    ].map(([spec, label, value, note, percent]) => effectRow(spec, label, value, note, percent)).join("");
    const rareChain = rare?.chainId ? RARE_CHAIN_BY_ID[rare.chainId] : null;
    const forecastSeasonLabel = ["spring", "summer", "autumn", "winter"][forecast?.season] || "spring";
    const planButtons = RESPONSE_PLAN_ORDER.map(id => {
        const plan = RESPONSE_PLANS[id];
        const chosen = response.plan === id && planLocked;
        return actionButton("hazard-plan-" + id,
            (chosen ? "PLANNED · " : "") + plan.label.toUpperCase() + " · " + costText(plan.cost),
            { disabled: planLocked });
    }).join("");
    const forecastRows = forecast?.risks?.length
        ? forecast.risks.map(risk => '<div class="hazard-work-row"><div><strong>' + esc(risk.label) + '</strong><small>' +
            esc(risk.spec) + ' · ' + riskPercent(risk.low) + '–' + riskPercent(risk.high) + '% band</small></div>' +
            '<div class="hazard-row-meter"><span><i class="' + (riskPercent(risk.risk) >= 45 ? "is-mid" : "") +
            '" style="width:' + riskPercent(risk.risk) + '%"></i></span><small>' + riskPercent(risk.risk) + '%</small></div></div>').join("")
        : '<p class="command-note">The scriptorium has no clear signal for the coming season.</p>';
    const partnerRows = snapshot.partners.length
        ? snapshot.partners.map(partner => '<div class="command-history"><strong>' + esc(partner.name.toUpperCase()) +
            ' · RELATION ' + num(partner.relation) + '</strong><p>' +
            (partner.crisis && partner.crisis !== "none" ? esc(String(partner.crisis).toUpperCase()) + " · " : "no crisis · ") +
            (partner.refugees ? num(partner.refugees) + " refugee households · " : "") +
            (partner.tradePenalty ? "trade " + pct(partner.tradePenalty) + " dearer · " : "") +
            (partner.request ? "asks for aid" : "trade is open") + '</p>' +
            (partner.crisis && partner.crisis !== "none" ? '<div class="hazard-actions">' + actionButton("hazard-aid", "SEND AID · 10 FOOD · 8G", { value: partner.id }) + '</div>' : '') +
            '</div>').join("")
        : '<p class="command-note">No neighbouring realm is currently in the hazard ledger.</p>';
    const diseaseRows = snapshot.diseases.length
        ? snapshot.diseases.map(disease => '<div class="command-history"><strong>' + esc(disease.label.toUpperCase()) +
            ' · YEAR ' + num(disease.year) + (disease.active ? " · ACTIVE" : " · CONTAINED") + '</strong><p>' +
            num(disease.cases) + ' cases · ' + num(disease.deaths) + ' deaths · ' + num(disease.recovered) + ' recovered · ' +
            esc(disease.vector || "exposure") + (disease.water ? " · water-borne" : "") + '</p>' +
            (disease.active && disease.cases > 0 ? '<div class="hazard-actions">' +
                actionButton("hazard-treat-disease", "TREAT · 10G · 4 FOOD", { value: disease.id }) + '</div>' : '') +
            '</div>').join("")
        : '<p class="command-note">No regional disease has been recorded. Contaminated water, insects and crowded housing can still start an outbreak.</p>';

    const activeRows = active.map(activeRow).join("");
    const diseases = diseaseRows;

    const crewRows = HAZARD_CREW_ORDER.map(id => {
        const crew = HAZARD_CREWS[id];
        const level = Number(response.crews?.[id]) || 0;
        return '<div class="hazard-work-row"><div><strong>' + esc(crew.label.toUpperCase()) + ' · ' + level + '/' + crew.max +
            '</strong><small>' + esc(crew.note) + '</small></div>' +
            '<div class="hazard-actions">' + actionButton("hazard-crew-" + id, "TRAIN · " + costText(crew.cost), { disabled: level >= crew.max }) + '</div></div>';
    }).join("");
    const lastScarAt = kind => {
        const marks = Array.isArray(scars[kind]) ? scars[kind] : [];
        const last = marks[marks.length - 1];
        return last ? " · last at " + num(last.x) + "," + num(last.y) : "";
    };
    const scarRows = [
        ["BURNT WOODLAND", scars.counts.burnt, "charred vegetation, timber capacity cut"],
        ["FLOODED GROUND", scars.counts.flooded, "moisture raised, roads and nodes washed out"],
        ["LAVA", scars.counts.lava, "permanent basalt, impassable"],
        ["LOST GROUND", scars.counts.lost, "permanent broken ground, impassable"],
        ["CORRUPTION", scars.counts.corruption, "forage blocked, taint spreads"]
    ].map(([label, count, note], index) => chronicRow(label, num(count), note + lastScarAt(["burnt", "flooded", "lava", "lost", "corruption"][index]))).join("");
    const changedTerrain = '<div class="command-summary">' +
        '<div><small>CONVERTED TILES</small><strong>' + num(chronic.terrainTiles) + '</strong></div>' +
        '<div><small>RESOURCE NODES LOST</small><strong>' + num(chronic.nodesLost) + '</strong></div>' +
        '<div><small>ROADS CUT</small><strong>' + num(chronic.roadsCut) + '</strong></div>' +
        '<div><small>VISIBLE SCAR TILES</small><strong>' + num(scars.terrainTiles) + '</strong></div></div>' +
        '<p class="command-note">Conversion shield — fire ' + pct(getHazardTerrainShield("wildfire")) +
        ' · flood ' + pct(getHazardTerrainShield("flood")) + ' · lava ' + pct(getHazardTerrainShield("lava")) +
        '. Firebreaks, dams and drainage, avalanche barriers and safe siting turn aside new tile conversions; the same works narrow the seasonal forecast.</p>';
    const rareChoices = rareChain && rare && !rare.resolved
        ? '<div class="hazard-actions">' + rareChain.choices.map(choice =>
            actionButton("hazard-rare-" + choice.id, choice.label.toUpperCase() + " · " + costText(choice.cost), { value: choice.id })).join("") + '</div>'
        : '';
    const rebuildRows = recovery.pending.length
        ? recovery.pending.slice(0, 4).map(wreck => '<div class="command-history"><strong>' + esc(wreck.label.toUpperCase()) +
            ' · ' + num(wreck.x) + ',' + num(wreck.y) + '</strong><p>' + esc(wreck.causeLabel) + ' · rebuild on site for ' +
            num(recovery.discountPercent) + '% fewer materials</p></div>').join("")
        : '<p class="command-note">No wreck is waiting for rebuilding. Insurance pays out when a hazard destroys a structure.</p>';

    const history = snapshot.history.length
        ? snapshot.history.slice().reverse().map(entry => '<article class="command-history"><strong>YEAR ' + num(entry.year) +
            ' · ' + esc(String(entry.kind || "hazard").toUpperCase()) + '</strong><p>' + esc(entry.text) + '</p></article>').join("")
        : '<p class="command-note">No hazard has struck this realm yet. The first season is being watched.</p>';

    const regionalCatalog = snapshot.profile.hazards.length
        ? snapshot.profile.hazards.map(row => badge(row.label.toUpperCase() + " " + pct(row.weight) + "%", row.weight > 0.5 ? "is-danger" : "")).join("")
        : '<span class="command-note">No hazard is currently favoured by this climate.</span>';

    const magicRows = [
        ["Magic burden", Math.min(1, magic.fog + magic.cursed), "1.2.20.52"],
        ["Corruption", magic.corruption, "1.2.20.93"],
        ["Cursed life", magic.cursed, "1.2.20.94"],
        ["Toxic fog", magic.fog, "1.2.20.95"],
        ["Unnatural weather", magic.unnaturalWeather, "1.2.20.96"],
        ["Magical disease", Math.max(magic.magicDisease, state.health?.outbreakActive ? 1 : 0), "1.2.20.97"],
        ["Animal shift", magic.animalShift, "1.2.20.98"],
        ["Corruption spread", Math.max(magic.corruption, Math.min(1, (scars.counts.corruption || 0) / 8)), "1.2.20.99"],
        ["Forbidden growth", magic.forbidden, "1.2.20.100"],
        ["Wards", magic.wards, "1.2.20.101"],
        ["Rare pressure", rare?.chainId ? Math.max(0.05, Math.min(1, (Number(rare.years) || 1) / 20)) : Math.min(1, magic.rareYears / 20), "1.2.20.102"]
    ].map(([label, value, spec]) => meter(label.toUpperCase(), value, spec)).join("");

    const chronicRows = [
        chronicRow("SEASON & WEATHER", snapshot.seasonName + " · " + snapshot.weather, "which dangers can roll", "1.2.20.84"),
        chronicRow("DROUGHT", chronic.droughtYears > 0 ? chronic.droughtYears + " consecutive year" + (chronic.droughtYears === 1 ? "" : "s") : "None", "level " + pct(chronic.droughtLevel) + "%", "1.2.20.85"),
        chronicRow("PLAGUE SPREAD", chronic.plagueSpread.length ? chronic.plagueSpread.join(", ") : "Contained", "along trade routes", "1.2.20.86"),
        chronicRow("ANIMAL PLAGUE", chronic.epizooticRegions.length ? chronic.epizooticRegions.join(", ") : "None", "herds affected", "1.2.20.87"),
        chronicRow("WILDFIRE", chronic.wildfireZones.length ? chronic.wildfireZones.length + " burnt zones" : "None", chronic.burntTiles + " tiles", "1.2.20.88"),
        chronicRow("FLOOD SCARS", chronic.floodScars > 0 ? chronic.floodScars + " unrecovered" : "None", "fields and channels", "1.2.20.89"),
        chronicRow("VOLCANIC ASH", chronic.volcanicYears > 0 ? chronic.volcanicYears + " years remaining" : "None", "regional fallout", "1.2.20.90"),
        chronicRow("CLIMATE DRIFT", (chronic.climateDrift >= 0 ? "+" : "") + chronic.climateDrift, "baseline hazard pressure", "1.2.20.91"),
        chronicRow("RARE PRESSURE", rare?.chainId ? rare.label + " · " + (rare.years || 0) + " years" : (magic.rareYears > 0 ? magic.rareYears + " arcane years" : "None"), "drawn rare events"),
        chronicRow("DISASTER DEBT", pct(chronic.economicDrag) + "%", "drag on the treasury", "1.2.20.92"),
        chronicRow("LOST GROUND", chronic.lostGround > 0 ? chronic.lostGround + " tiles" : "None", "permanent")
    ].join("");

    const preparedThisSeason = snapshot.preparedness.season === state.seasonIndex && snapshot.preparedness.year === state.year;
    const casualties = (state.entities || []).filter(entity => !entity.dead && entity.type === 20
        && Number(entity.illnessUntilTick) > state.tick).length;
    const medicine = Math.max(0, Math.floor(Number(snapshot.medicine?.available) || 0));

    return intro("WEATHER, DISEASE & DISASTER", "Hazards of the realm",
        "Every climate carries its own dangers: heat, frost, storm, rock, poison, parasites, plague and — where the land is old — magic. They change with the season, cost stores, health and morale, and answer to the works you build.") +
        '<div class="command-summary"><div><small>SEASON</small><strong>' + esc(snapshot.seasonName.toUpperCase()) + ' · Y ' + num(snapshot.year) + '</strong></div>' +
        '<div><small>CLIMATE</small><strong>' + esc(String(climate).toUpperCase()) + '</strong></div>' +
        '<div><small>WEATHER</small><strong>' + esc(String(snapshot.weather).toUpperCase()) + '</strong></div>' +
        '<div><small>HAZARDS ACTIVE</small><strong>' + active.length + '</strong></div>' +
        '<div><small>READINESS</small><strong>' + pct(mitigation.score) + '%</strong></div>' +
        '<div><small>CASUALTIES</small><strong>' + casualties + '</strong></div></div>' +
        '<div class="hazard-actions"><button type="button" data-command="hazard-prepare"' + (preparedThisSeason ? " disabled" : "") + '>PREPARE FOR THE SEASON · 12 WOOD · 8G</button>' +
        '<button type="button" data-command="hazard-treat"' + (casualties && medicine > 0 ? "" : " disabled") + '>TREAT CASUALTIES · ' + num(medicine) + ' DOSES</button>' +
        '<button type="button" data-command="hazard-cleanse"' + (magic.corruption >= 0.05 ? "" : " disabled") + '>CLEANSE CORRUPTION · 10 STONE · 12G</button>' +
        actionButton("hazard-overlay", state.hazardOverlay ? "HIDE HAZARD MAP" : "SHOW HAZARD MAP") + '</div>' +
        '<div class="command-section-title">SEASONAL FORECAST · CONFIDENCE ' + pct(forecast?.confidence || 0) + '%</div>' +
        '<p class="command-note">The scriptorium reads the coming ' + esc(forecastSeasonLabel) +
        ' of year ' + num(forecast?.year) + '. The band is uncertainty, not a promise; protection works narrow it.</p>' +
        '<div class="hazard-work-grid">' + forecastRows + '</div>' +
        '<div class="command-section-title">CHOOSE A PLAN · ' + (planLocked ? esc((RESPONSE_PLANS[response.plan]?.label || "PLAN").toUpperCase()) : "ONE PER SEASON") + '</div>' +
        '<div class="hazard-actions">' + planButtons + '</div>' +
        '<div class="hazard-actions">' +
        actionButton("hazard-quarantine", response.quarantine?.active ? "QUARANTINE ACTIVE" : "QUARANTINE · 14G · 6 FOOD", { disabled: Boolean(response.quarantine?.active) }) +
        actionButton("hazard-quarantine-lift", "LIFT QUARANTINE", { disabled: !response.quarantine?.active }) +
        actionButton("hazard-request-aid", "REQUEST NEIGHBOUR AID") + '</div>' +
        (rare ? '<div class="command-section-title">RARE EVENT · ' + esc(rare.label.toUpperCase()) + '</div>' +
            '<p class="command-note">Year ' + num(rare.year) + ' · ' + num(rare.years) + ' year' + (rare.years === 1 ? "" : "s") +
            ' of consequences' + (rare.resolved ? " · SETTLED: " + esc(rare.outcome || rare.choice || "") : " · A DECISION IS OPEN") + '.</p>' +
            (rareChain ? '<p class="command-note">' + esc(rareChain.summary) + '</p>' : "") + rareChoices : "") +
        '<div class="command-section-title">ACTIVE HAZARDS · ' + active.length + '</div><div class="hazard-table">' +
        (activeRows || '<p class="command-note">The season is quiet. No hazard is currently pressing on the realm.</p>') + '</div>' +
        '<p class="command-note">The chronicle names every hazard that hurt a resident, a field, a road or the stores. Weather, season and the local climate decide which ones can appear; your works decide how hard they land.</p>' +
        '<div class="command-section-title">DERIVED CONSEQUENCES · ' + (pressure.length ? "APPLIED TO THE REALM" : "NEUTRAL") + '</div>' +
        '<div class="command-summary">' +
        '<div><small>FOOD & WATER DRAW</small><strong>' + gain(simulation.foodDemand) + '</strong></div>' +
        '<div><small>WORK & BUILDING</small><strong>' + loss(simulation.work) + '</strong></div>' +
        '<div><small>MOVEMENT & EXPEDITIONS</small><strong>' + loss(simulation.movement) + '</strong></div>' +
        '<div><small>CARAVAN SPEED</small><strong>' + loss(simulation.caravanMovement) + '</strong></div>' +
        '<div><small>EXTRACTION</small><strong>' + loss(simulation.extraction) + '</strong></div>' +
        '<div><small>PASTURE & HERDS</small><strong>' + loss(simulation.pasture) + '</strong></div>' +
        '<div><small>CARAVAN BUY</small><strong>' + gain(simulation.tradeBuy) + '</strong></div>' +
        '<div><small>CARAVAN SELL</small><strong>' + loss(simulation.tradeSell) + '</strong></div>' +
        '<div><small>ADAPTATION RELIEF</small><strong>' + Math.round(simulation.adaptationRelief * 100) + '%</strong></div></div>' +
        '<div class="command-section-title">VISIBLE EFFECTS · LIVE</div><div class="hazard-work-grid">' +
        (effectRows || '<p class="command-note">No named effect is currently carried by the realm. A rolled hazard or an active work will appear here with its live value.</p>') + '</div>' +
        '<p class="command-note">Only effects currently carried by the realm appear. Each row reads the same saved modifier, mitigation or loss value the simulation uses; a neutralized row disappears without changing the underlying effect.</p>' +
        '<div class="command-section-title">REALM RESILIENCE</div><div class="command-summary">' +
        '<div><small>DISEASE PRESSURE</small><strong>' + pct(snapshot.modifiers.diseaseRisk) + '%</strong></div>' +
        '<div><small>INJURY RESISTANCE</small><strong>' + pct(snapshot.modifiers.resistance) + '%</strong></div>' +
        '<div><small>MEDICAL CARE</small><strong>' + pct(mitigation.medical) + '%</strong></div>' +
        '<div><small>ADAPTED CLOTHING</small><strong>' + pct(mitigation.clothing) + '%</strong></div></div>' +
        '<p class="command-note">Medical care and clean wells lower illness and outbreak pressure; insulated clothing specifically lowers cold and heat illness; irrigation and drainage protect fields; roads cushion the movement and caravan penalty of the same hazard season.</p>' +
        '<p class="command-note">' + (pressure.length
            ? 'These multipliers are live in household demand, production and building, movement and expeditions, caravan haulage, extraction, herds and market terms. Regional adaptation takes back ' + Math.round(simulation.adaptationRelief * 100) + '% of every penalty.'
            : 'No rolled hazard is pressing. Demand, work, movement, extraction, pasture and caravan terms are at their baseline; the climate\'s regional character is standing, not a modifier.') + '</p>' +
        '<div class="command-section-title">PROTECTION · READINESS ' + pct(mitigation.score) + '%</div><div class="hazard-work-grid">' +
        workRow("Wells & reservoirs", mitigation.well, "Lower water loss and water-borne outbreak pressure", "1.2.20.74") +
        workRow("Irrigation", mitigation.irrigation, "Mills and worked farmland cut drought field damage", "1.2.20.75") +
        workRow("Walls & dams", mitigation.dam, "Walls hold floodwater and slides", "1.2.20.76") +
        workRow("Avalanche protection", mitigation.avalanche, "Foresters stabilise slopes, walls stop the run", "1.2.20.77") +
        workRow("Firebreaks", mitigation.firebreak, "Cleared belts stop a wildfire converting new tiles") +
        workRow("Drainage", mitigation.drainage, "Cuts flood field damage and water-borne outbreak pressure", "1.2.20.78") +
        workRow("Roads & bridges", mitigation.roads, "Cuts the movement and caravan penalty of a bad season", "1.2.20.79") +
        workRow("Warehouses", mitigation.warehouse, "Stores keep grain dry and safe", "1.2.20.80") +
        workRow("Medical care", mitigation.medical, "Cuts illness and outbreak pressure; treats the sick", "1.2.20.73") +
        workRow("Adapted clothing", mitigation.clothing, "Insulated homes cut cold and heat illness", "1.2.20.72") +
        workRow("Regional research", mitigation.research, "School and scriptorium record local danger", "1.2.20.81") +
        workRow("Specialised units", mitigation.units, "Barracks and smithy equip relief crews", "1.2.20.82") +
        workRow("Settlement siting", mitigation.siting, "The keep anchors the settlement on safe ground", "1.2.20.83") +
        '</div>' +
        '<p class="command-note">Readiness is the average of these works plus this season\'s plan. A high readiness lowers severity, injuries and destruction; it cannot remove a hazard. Dams, avalanche barriers, drainage, firebreaks, weatherproof houses, quarantine houses, granaries and warding stones are real buildings in the PROTECTION build menu.</p>' +
        '<div class="command-section-title">SPECIALIST CREWS & EQUIPMENT</div><div class="hazard-work-grid">' + crewRows + '</div>' +
        '<div class="command-section-title">HAZARD SCARS ON THE MAP</div><div class="command-history-list">' + scarRows + '</div>' +
        changedTerrain +
        '<p class="command-note">Lava and lost ground are permanent. Burnt ground keeps its reduced timber capacity. Flooded ground blocks movement for the year, raises the tile moisture, and cuts the roads actually crossed by the flood. The same saved marks paint the terrain canvas and drive movement, gathering and the resource survey.</p>' +
        actionButton("hazard-overlay", state.hazardOverlay ? "HIDE HAZARD MAP" : "SHOW HAZARD MAP") +
        '<div class="command-section-title">REBUILD ECONOMY</div><div class="command-summary">' +
        '<div><small>EMERGENCY FUND</small><strong>' + num(response.insurance) + ' / ' + num(INSURANCE_CAP) + 'G</strong></div>' +
        '<div><small>LOAN</small><strong>' + (response.loan?.principal ? num(response.loan.principal) + 'G LEFT' : 'NONE') + '</strong></div>' +
        '<div><small>RESETTLED PLOTS</small><strong>' + num(response.resettled) + '</strong></div>' +
        '<div><small>NEW RESIDENTS</small><strong>' + num(response.arrivals) + '</strong></div>' +
        '<div><small>WAITING HOUSEHOLDS</small><strong>' + num(response.migrants) + '</strong></div>' +
        '<div><small>REBUILD QUEUE</small><strong>' + num(recovery.pendingCount) + '</strong></div></div>' +
        '<div class="hazard-actions">' +
        actionButton("hazard-insure", "FUND REPAIRS · 20G", { disabled: response.insurance >= INSURANCE_CAP }) +
        actionButton("hazard-loan", response.loan?.principal ? "LOAN OPEN · " + num(LOAN_PAYMENT) + "G/YEAR" : "TAKE LOAN · +60G", { disabled: Boolean(response.loan?.principal) }) +
        actionButton("hazard-resettle", "RESETTLE LOST GROUND · 12 WOOD · 10G", { disabled: scars.counts.lost <= 0 }) + '</div>' +
        '<div class="hazard-table">' + rebuildRows + '</div>' +
        '<p class="command-note">Insurance pays 12 gold toward a destroyed structure. A loan adds 60 gold now and costs 24 gold a year for three years. Rebuilding a wreck within three tiles earns the existing 25% material discount.</p>' +
        '<div class="command-section-title">REGIONAL DANGERS · ' + esc(String(climate).toUpperCase()) + '</div><div class="biome-chip-line">' + regionalCatalog + '</div>' +
        bundleRow(profile.bundle, bundleSpec) +
        '<p class="command-note">' + esc(String(snapshot.catalog.total)) + ' hazards are modelled across ' + esc(String(HAZARD_CLIMATES.length)) + ' climates and ' +
        esc(String(snapshot.catalog.mechanics)) + ' rules; ' + esc(String(snapshot.catalog.climates)) + ' can occur in this climate.</p>' +
        '<div class="command-section-title">DISEASES & OUTBREAKS</div><div class="hazard-table">' + diseases + '</div>' +
        '<div class="command-section-title">NEIGHBOURING REALMS · TRADE & OUTBREAKS</div><div class="hazard-table">' + partnerRows + '</div>' +
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
        '<div><small>INJURED</small><strong>' + num(snapshot.losses.injured) + '</strong></div>' +
        '<div><small>HERDS</small><strong>' + num(snapshot.losses.herds) + '</strong></div></div>' +
        '<div class="command-section-title">HAZARD RECORD</div><div class="command-history-list">' + history + '</div>' +
        '<p class="command-note">Hazards settle at the change of season and at the year boundary. The panel and the save hold the same state, so a reload in the middle of a drought keeps the drought.</p>';
}
