// Management panel for the 1.2.20 hazard and disease layer.
//
// The panel is a reader over getHazardSnapshot(); every number comes from the
// saved state or the live protection survey. Buttons are real actions: prepare
// the season, treat casualties, cleanse corruption.
import { state } from "../core/state.js";
import { getHazardSnapshot, getHazardTerrainShield } from "../systems/environmental-hazards.js";
import { HAZARD_CATEGORIES, HAZARD_CLIMATES, HAZARD_EFFECTS } from "../world/hazard-data.js";
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
    if (effects.destroy) parts.push("DAMAGE " + Math.round(effects.destroy * severity * 100) + "%");
    return parts.slice(0, 3).join(" · ");
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
    const severity = pct(hazard.severity);
    const tone = severity >= 66 ? "is-danger" : severity >= 33 ? "is-mid" : "";
    return '<div class="hazard-row" data-hazard-active="' + esc(hazard.mechanic) + '">' +
        '<div class="hazard-row-name"><strong>' + esc(hazard.label) + '</strong><small>' +
        esc(categoryLabel(hazard.category)) + ' · ' + esc(hazard.spec) +
        (impactLine(hazard) ? ' · ' + esc(impactLine(hazard)) : '') + '</small></div>' +
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
        '<p class="command-note">' + (pressure.length
            ? 'These multipliers are live in household demand, production and building, movement and expeditions, caravan haulage, extraction, herds and market terms. Regional adaptation takes back ' + Math.round(simulation.adaptationRelief * 100) + '% of every penalty.'
            : 'No rolled hazard is pressing. Demand, work, movement, extraction, pasture and caravan terms are at their baseline; the climate\'s regional character is standing, not a modifier.') + '</p>' +
        '<div class="command-section-title">PROTECTION · READINESS ' + pct(mitigation.score) + '%</div><div class="hazard-work-grid">' +
        workRow("Wells & reservoirs", mitigation.well, "Wells and bathhouses keep water clean") +
        workRow("Irrigation", mitigation.irrigation, "Mills and worked farmland carry water to the fields") +
        workRow("Walls & dams", mitigation.dam, "Walls hold floodwater and slides") +
        workRow("Avalanche protection", mitigation.avalanche, "Foresters stabilise slopes, walls stop the run") +
        workRow("Firebreaks", mitigation.firebreak, "Cleared belts stop a wildfire converting new tiles") +
        workRow("Drainage", mitigation.drainage, "Sanitation drains the wet ground") +
        workRow("Roads & bridges", mitigation.roads, "Built roads keep caravans moving") +
        workRow("Warehouses", mitigation.warehouse, "Stores keep grain dry and safe") +
        workRow("Medical care", mitigation.medical, "Clinic, healers and medicine treat the sick") +
        workRow("Adapted clothing", mitigation.clothing, "Bathhouse and insulated homes") +
        workRow("Regional research", mitigation.research, "School and scriptorium record local danger") +
        workRow("Specialised units", mitigation.units, "Barracks and smithy equip relief crews") +
        workRow("Settlement siting", mitigation.siting, "The keep anchors the settlement on safe ground") +
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
        '<div><small>INJURED</small><strong>' + num(snapshot.losses.injured) + '</strong></div></div>' +
        '<div class="command-section-title">HAZARD RECORD</div><div class="command-history-list">' + history + '</div>' +
        '<p class="command-note">Hazards settle at the change of season and at the year boundary. The panel and the save hold the same state, so a reload in the middle of a drought keeps the drought.</p>';
}
