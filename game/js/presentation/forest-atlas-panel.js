// Forest type atlas: the player-facing catalogue of the 60 regional forest
// formations. It is a pure reader over the frozen catalogue plus one bounded
// sample of the realm's own forest tiles; it never runs a per-tile survey at
// render time and adds no per-tick simulation.
import { state } from "../core/state.js";
import {
    REGIONAL_FOREST_TYPES, REGIONAL_SPECIES, REGIONAL_BOUNTY_SEASONS,
    regionalCharacterFor, signatureTimberForRegionalType,
} from "../world/regional-forests.js";
import { FOREST_GOODS, forestStandAt } from "../world/forest-ecology.js";
import { timberQuote } from "../systems/regional-timber-market.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pct = value => Math.round((Number(value) || 0) * 100);
const signed = value => {
    const rounded = Math.round((Number(value) || 0) * 100);
    return (rounded > 0 ? "+" : "") + rounded + "%";
};
const seasonNames = ["Spring", "Summer", "Autumn", "Winter"];
const SURVEY_LIMIT = 240;

let surveyCache = { key: null, value: null };

function intro(kicker, title, copy) {
    return '<div class="command-panel-intro"><span>' + esc(kicker) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div>';
}

function terrainAt(tx, ty) {
    const res = Number(state.terrainResolution) || 1;
    const width = Number(state.terrainPixW) || 0, height = Number(state.terrainPixH) || 0;
    const px = Math.floor((tx + 0.5) * res), py = Math.floor((ty + 0.5) * res);
    if (!width || !height || px < 0 || py < 0 || px >= width || py >= height) {
        return { height: 0, moisture: 0.5, temperature: 0.55 };
    }
    const index = py * width + px;
    return {
        height: Number(state.heightMap?.[index]) || 0,
        moisture: Math.max(0, Math.min(1, Number(state.moistureMap?.[index]) || 0)),
        temperature: Math.max(0, Math.min(1, Number(state.temperatureMap?.[index] ?? 0.55) || 0)),
    };
}

// A bounded, deterministic sample of the realm's own forest tiles. Sampling
// every stride-th forest tile keeps a panel open cheap on a large map while
// still reporting the regional mix the player actually owns. Transition tiles
// are counted separately so an edge reads as an edge, not as a second type.
export function forestAtlasSurvey(limit = SURVEY_LIMIT) {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0, height = Number(state.worldH) || 0;
    if (!geo?.forestStock || !width || !height) {
        return {
            available: false, forestTiles: 0, sampled: 0, counts: {}, transitions: {},
            transitionSamples: 0, present: 0, types: [],
        };
    }
    const key = [geo.seed, width, height, state.year, Math.floor((Number(state.tick) || 0) / 30)].join(":");
    if (surveyCache.key === key) return surveyCache.value;
    const total = Math.min(geo.forestStock.length, width * height);
    const indices = [];
    for (let index = 0; index < total; index++) if (geo.forestStock[index] > 0) indices.push(index);
    const stride = Math.max(1, Math.ceil(indices.length / Math.max(1, limit)));
    const counts = {}, transitions = {}, samples = {};
    let sampled = 0, transitionSamples = 0;
    const climate = state.worldOptions?.climate || "temperate";
    for (let slot = 0; slot < indices.length; slot += stride) {
        const index = indices[slot];
        const x = index % width, y = Math.floor(index / width);
        const terrain = terrainAt(x, y);
        const stand = forestStandAt(x + 0.5, y + 0.5, {
            seed: Number(geo.seed) || 1,
            moisture: terrain.moisture,
            temperature: terrain.temperature,
            height: terrain.height,
            climate,
            forests: state.worldOptions?.forests ?? 52,
            stockRatio: geo.forestCapacity[index] ? geo.forestStock[index] / geo.forestCapacity[index] : 1,
            rockLine: 0.92,
        });
        const id = stand?.regionalTypeId;
        if (!id) continue;
        counts[id] = (counts[id] || 0) + 1;
        if (!samples[id] && stand.dynamics) samples[id] = stand.dynamics;
        sampled++;
        if (stand.regionalTransitionId) {
            transitionSamples++;
            transitions[stand.regionalTransitionId] = (transitions[stand.regionalTransitionId] || 0) + 1;
        }
    }
    const types = REGIONAL_FOREST_TYPES.map(type => ({
        id: type.id, key: type.key, count: counts[type.id] || 0,
        transitionCount: transitions[type.id] || 0,
        dynamics: samples[type.id] || null,
    }));
    const value = {
        available: true,
        forestTiles: indices.length,
        sampled,
        counts,
        transitions,
        transitionSamples,
        present: types.filter(type => type.count > 0).length,
        types,
        climate,
        season: seasonNames[Math.max(0, Math.min(3, Number(state.seasonIndex) || 0))],
    };
    surveyCache = { key, value };
    return value;
}

export function invalidateForestAtlasSurvey() {
    surveyCache = { key: null, value: null };
}

function swatches(type) {
    const palette = type.render?.palette || [];
    return palette.map(color => '<i style="background:' + esc(color) + '"></i>').join("");
}

function meter(label, value, detail = "") {
    const width = Math.max(0, Math.min(100, pct(value)));
    return '<span class="forest-atlas__meter"><small>' + esc(label) + '</small>'
        + '<i><b style="width:' + width + '%"></b></i><em>' + esc(detail || signed(value - 1)) + '</em></span>';
}

function speciesList(type) {
    const entries = Object.entries(type.species || {}).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 5).map(([id, weight]) => {
        const label = REGIONAL_SPECIES[id]?.label || id.replace(/-/g, " ");
        return '<span class="forest-atlas__chip">' + esc(label) + ' <b>' + Math.round(weight * 100) + '%</b></span>';
    }).join("");
}

function goodsList(type) {
    const goods = (type.goods || []).slice(0, 10);
    return goods.map(id => '<span class="forest-atlas__good">'
        + esc(FOREST_GOODS[id]?.label || String(id).replace(/-/g, " ")) + '</span>').join("");
}

function characterLine(type, currentSeason) {
    const character = regionalCharacterFor(type);
    if (!character) return "";
    const traits = character.traits.map(trait =>
        '<span class="forest-atlas__trait">' + esc(trait) + '</span>').join("");
    const good = character.signature ? FOREST_GOODS[character.signature] : null;
    const active = Boolean(good) && character.season === currentSeason;
    const signature = good
        ? '<div class="forest-atlas__signature' + (active ? ' is-active' : '') + '"><span>SIGNATURE</span><strong>'
            + esc(good.label) + '</strong><em>' + esc(REGIONAL_BOUNTY_SEASONS[character.season] || "Autumn")
            + ' bounty' + (active ? ' · IN SEASON' : '') + '</em></div>'
        : "";
    return '<div class="forest-atlas__character">' + traits + '</div>' + signature;
}

const MIX_LABELS = {
    pure: 'Pure stand', dominant: 'Dominant species', mixed: 'Mixed stand', even: 'Even mixture',
};
const PHASE_LABELS = {
    pioneer: 'Pioneer', thicket: 'Thicket', pole: 'Pole stage', mature: 'Mature',
    'old-growth': 'Old growth', climax: 'Climax',
};

function dynamicsBlock(dynamics) {
    if (!dynamics) return '';
    const composition = dynamics.composition || {};
    const regeneration = dynamics.regeneration || {};
    const health = dynamics.health || {};
    const age = dynamics.age || {};
    const system = dynamics.silviculture || {};
    const soil = dynamics.soil || {};
    const structure = dynamics.structure || {};
    const facts = [
        ['MIX', MIX_LABELS[composition.mixtureClass] || composition.mixtureClass || '—', pct(composition.purity) + '% dominant'],
        ['PHASE', PHASE_LABELS[age.phase] || age.phase || '—', 'rotation ' + number(age.rotationYears) + 'y'],
        ['PIONEER / CLIMAX', pct(composition.pioneerShare) + '% / ' + pct(composition.climaxShare) + '%', (composition.pioneerSpecies || []).slice(0, 2).join(' · ') || '—'],
        ['SEED BANK', pct(regeneration.seedBank) + '%', 'mother trees ' + number(regeneration.motherTreesPerHa) + '/ha'],
        ['GENETICS', pct(regeneration.geneticDiversity) + '%', 'quality ' + pct(regeneration.seedQuality) + '%'],
        ['SITE FIT', pct(health.siteFitness) + '%', 'disease resistance ' + pct(health.diseaseResistance) + '%'],
        ['SYSTEM', system.label || '—', number(system.rotationYears) + 'y · timber ' + pct(system.timberFactor) + '%'],
        ['SOIL', soil.humusForm || '—', 'roots ' + pct(soil.rootDepth) + '% · ' + (soil.mycorrhizaLabel || 'mycorrhiza —')],
        ['STRUCTURE', structure.understoryLabel || '—', 'herb ' + pct(structure.herbLayer) + '% · liana ' + pct(structure.lianaCover) + '% · epiphyte ' + pct(structure.epiphyteCover) + '%'],
        ['GAPS', pct(structure.canopyGap) + '%', 'edge diversity ' + pct(structure.edgeDiversity) + '% · ' + number(structure.layers) + ' layers'],
    ];
    return '<div class="forest-atlas__dynamics">' + facts.map(([label, value, detail]) =>
        '<span><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong><em>' + esc(detail) + '</em></span>').join('')
        + '</div>';
}

function card(type, count, sampled, transitionCount, currentSeason, dynamics = null) {
    const timber = signatureTimberForRegionalType(type);
    const quote = timber ? timberQuote(timber.id) : null;
    const share = sampled > 0 ? Math.round(count / sampled * 100) : 0;
    const effects = type.effects || {};
    const timberLine = quote
        ? '<div class="forest-atlas__timber"><strong>' + esc(quote.label) + '</strong><span>' + esc(quote.speciesLabel)
            + ' · ' + quote.planks + ' planks per 2 · ' + quote.price.toFixed(1) + 'G quote</span></div>'
        : '<div class="forest-atlas__timber"><strong>Ordinary log chain</strong><span>No named regional timber for this type.</span></div>';
    const presence = count > 0
        ? number(count) + ' SAMPLED · ' + share + '%' + (transitionCount > 0 ? ' · ' + number(transitionCount) + ' EDGE' : '')
        : 'NOT SURVEYED';
    return '<details class="forest-atlas__card' + (count > 0 ? ' is-present' : '') + '" data-forest-type="' + esc(type.id) + '">'
        + '<summary><span class="forest-atlas__palette">' + swatches(type) + '</span>'
        + '<span class="forest-atlas__title"><strong>' + esc(type.id.slice(-3)) + ' · ' + esc(type.short || type.label) + '</strong>'
        + '<small>' + esc(type.climates.join(", ")) + ' · priority ' + number(type.priority) + '</small></span>'
        + '<span class="forest-atlas__presence">' + presence + '</span></summary>'
        + '<p class="forest-atlas__profile">' + esc(type.profile) + '</p>'
        + characterLine(type, currentSeason)
        + dynamicsBlock(dynamics)
        + '<div class="forest-atlas__stats">'
        + meter("Timber", effects.timber, signed((effects.timber ?? 1) - 1))
        + meter("Regrowth", effects.regrowth, signed((effects.regrowth ?? 1) - 1))
        + meter("Fire", Math.max(0, effects.fire), signed(effects.fire))
        + meter("Wildlife", effects.fauna, signed((effects.fauna ?? 1) - 1))
        + meter("Forage", effects.forage, signed((effects.forage ?? 1) - 1))
        + meter("Work", effects.work, signed((effects.work ?? 1) - 1))
        + '</div>'
        + timberLine
        + '<div class="forest-atlas__chips">' + speciesList(type) + '</div>'
        + '<div class="forest-atlas__goods">' + goodsList(type) + '</div>'
        + '</details>';
}

export function renderForestAtlasPanel() {
    const survey = forestAtlasSurvey();
    if (!survey.available) {
        return intro("THE FOREST ATLAS", "Regional woodland", "The atlas is charted with the realm. Start or load a campaign to classify its forest tiles.")
            + '<p class="command-note">No resource geography is available in this session.</p>';
    }
    const present = survey.types.filter(type => type.count > 0).length;
    const currentSeason = Math.max(0, Math.min(3, Number(state.seasonIndex) || 0));
    const cards = REGIONAL_FOREST_TYPES.map(type => {
        const row = survey.types.find(entry => entry.id === type.id);
        return card(type, row?.count || 0, survey.sampled, row?.transitionCount || 0, currentSeason, row?.dynamics || null);
    }).join("");
    return intro("THE FOREST ATLAS", "Sixty regional woodlands",
        "Every forest tile belongs to exactly one regional type, and boundary tiles name the woodland they blend into. Open a type to read its field marks, its signature good, its timber, its ecological effects and the named wood its sawmill can produce.")
        + '<div class="command-summary"><div><small>CATALOGUED</small><strong>' + number(REGIONAL_FOREST_TYPES.length) + ' TYPES</strong></div>'
        + '<div><small>IN THIS REALM</small><strong>' + number(present) + ' TYPES</strong></div>'
        + '<div><small>FOREST TILES</small><strong>' + number(survey.forestTiles) + '</strong></div>'
        + '<div><small>SURVEYED</small><strong>' + number(survey.sampled) + ' SAMPLES</strong></div>'
        + '<div><small>TRANSITION EDGES</small><strong>' + number(survey.transitionSamples) + '</strong></div>'
        + '<div><small>SEASON</small><strong>' + esc(survey.season.toUpperCase()) + '</strong></div></div>'
        + '<div class="forest-atlas">' + cards + '</div>'
        + '<p class="command-note">The realm count comes from a bounded deterministic sample of up to ' + number(SURVEY_LIMIT)
        + ' forest tiles; it is a survey, not a per-frame scan. Timber, regrowth, wildlife, forage and work are live simulation inputs: they price lumber batches, gathering yields, regrowth and habitat. Flood raises the spoilage of a perishable harvest, and a signature good pays a bonus in its own season. The ecology block is taken from the first surveyed tile of each type: it reports the actual mixture class, succession phase, seed bank, mother trees, genetic breadth, site fitness, disease resistance, silvicultural system, roots, humus, mycorrhiza, understorey, lianas, epiphytes and canopy gaps. Timber prices are the current seasonal base quote of the regional timber market in the Royal Stores.</p>';
}
