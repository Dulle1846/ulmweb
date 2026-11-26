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
import { FOREST_MANAGEMENT_SYSTEMS } from "../world/forest-dynamics.js";
import { forestFaunaEcologyFor, forestFaunaFieldGuide } from "../world/forest-fauna-ecology.js";
import {
    forestBiodiversityFor, forestErosionFor, forestFloodPressureFor,
    forestModelCacheStats, forestModelFor, forestModelTelemetrySnapshot,
    forestRegenerationFor, forestWaterFlowFor, precomputeForestChunk,
} from "../world/forest-model.js";
import { timberQuote } from "../systems/regional-timber-market.js";
import { forestGoodUseLabel } from "../systems/forest-gathering.js";
import {
    forestStewardshipAt, forestSuccessionAt, forestSuccessionChronicle,
    forestSuccessionStats,
} from "../systems/forest-succession.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const number = value => String(Math.floor(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pct = value => Math.round((Number(value) || 0) * 100);
const percent = value => Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
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
    const key = [geo.seed, width, height, state.year,
        Math.floor((Number(state.tick) || 0) / 30),
        Number(state.forestSuccession?.day) || 0,
        Number(state.forestSuccession?.revision) || 0,
        Number(state.forestSuccession?.stewardshipActions) || 0].join(":");
    if (surveyCache.key === key) return surveyCache.value;
    const total = Math.min(geo.forestStock.length, width * height);
    const indices = [];
    for (let index = 0; index < total; index++) if (geo.forestStock[index] > 0) indices.push(index);
    const stride = Math.max(1, Math.ceil(indices.length / Math.max(1, limit)));
    const counts = {}, transitions = {}, samples = {}, faunaSamples = {}, modelSamples = {}, systemCounts = {};
    const regionSamples = {};
    let sampled = 0, transitionSamples = 0;
    const climate = state.worldOptions?.climate || "temperate";
    const zoom = Number(state.zoom) || 1;
    const season = Math.max(0, Math.min(3, Number(state.seasonIndex) || 0));
    const sampleStandAt = (sx, sy) => {
        const x = Math.floor(sx), y = Math.floor(sy);
        if (x < 0 || y < 0 || x >= width || y >= height) return null;
        const terrain = terrainAt(x, y);
        const stewardship = forestStewardshipAt(x, y);
        return forestStandAt(sx, sy, {
            seed: Number(geo.seed) || 1,
            moisture: terrain.moisture,
            temperature: terrain.temperature,
            height: terrain.height,
            climate,
            forests: state.worldOptions?.forests ?? 52,
            stockRatio: geo.forestCapacity[y * width + x]
                ? geo.forestStock[y * width + x] / geo.forestCapacity[y * width + x] : 1,
            rockLine: 0.92,
            succession: forestSuccessionAt(x, y),
            drainage: stewardship.drainage,
        });
    };
    for (let slot = 0; slot < indices.length; slot += stride) {
        const index = indices[slot];
        const x = index % width, y = Math.floor(index / width);
        const stand = sampleStandAt(x + 0.5, y + 0.5);
        const id = stand?.regionalTypeId;
        if (!id) continue;
        counts[id] = (counts[id] || 0) + 1;
        if (!samples[id] && stand.dynamics) samples[id] = stand.dynamics;
        if (!regionSamples[id]) {
            const biodiversity = forestBiodiversityFor(stand);
            const erosion = forestErosionFor(stand);
            const flood = forestFloodPressureFor(stand, { season, weather: state.weather });
            const regeneration = forestRegenerationFor(stand);
            const water = forestWaterFlowFor(stand);
            const stewardship = forestStewardshipAt(x, y);
            regionSamples[id] = {
                x, y,
                typeId: id, typeLabel: stand.regionalLabel || null,
                ageClass: stand.ageClass || null,
                biodiversity: biodiversity.index,
                biodiversityClass: biodiversity.class,
                erosion: erosion.risk, erosionClass: erosion.class,
                flood: flood.pressure, wetness: Number(stand.wetness) || 0,
                regeneration: regeneration.factor, yearsToCanopy: regeneration.yearsToCanopy,
                flow: water.flow, drained: stewardship.drained,
                firebreak: stewardship.firebreak, firebreakUntil: stewardship.firebreakUntil,
                succession: forestSuccessionAt(x, y),
            };
        }
        if (!modelSamples[id] && stand.dynamics) {
            modelSamples[id] = forestModelFor(stand, {
                day: state.dayOfYear, climate, zoom, seed: geo.seed,
                weather: state.weather, season: state.seasonIndex,
            });
        }
        if (!faunaSamples[id] && stand.dynamics) {
            faunaSamples[id] = forestFaunaEcologyFor(stand, {
                day: state.dayOfYear, climate, seed: geo.seed, x, y,
            });
        }
        const system = stand.dynamics?.silviculture?.system;
        if (system) systemCounts[system] = (systemCounts[system] || 0) + 1;
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
        fauna: faunaSamples[type.id] || null,
        model: modelSamples[type.id] || null,
    }));
    // One bounded 16×16 chunk is precomputed for the atlas so the player can
    // see the same chunk budget and LOD tier the renderer uses. It is one
    // sample, not a per-chunk scan of the realm.
    let chunk = null;
    if (indices.length) {
        const index = indices[0];
        const cx = Math.floor((index % width) / 16);
        const cy = Math.floor(Math.floor(index / width) / 16);
        chunk = precomputeForestChunk({
            chunkX: cx, chunkY: cy, seed: Number(geo.seed) || 1,
            climate, day: state.dayOfYear, zoom,
            standAt: sampleStandAt,
        });
    }
    const successionStats = forestSuccessionStats();
    const chronicle = forestSuccessionChronicle(60);
    // A region with active history must stay visible even when this window's
    // stride does not happen to sample one of its tiles. Use the catalog id as
    // the label source and keep the live sample optional.
    const regionIds = new Set([
        ...types.filter(type => type.count > 0).map(type => type.id),
        ...Object.keys(successionStats.regions || {}),
        ...Object.keys(chronicle.byRegion || {}),
    ]);
    const regions = [...regionIds].filter(id => id !== "legacy")
        .map(id => {
            const type = REGIONAL_FOREST_TYPES.find(entry => entry.id === id);
            const sampled = types.find(entry => entry.id === id);
            return {
                id, key: type?.key || null, label: type?.label || id,
                count: sampled?.count || 0,
                sample: regionSamples[id] || null,
                disturbances: successionStats.regions?.[id] || null,
                history: chronicle.byRegion?.[id] || [],
            };
        });
    const value = {
        available: true,
        forestTiles: indices.length,
        sampled,
        counts,
        transitions,
        transitionSamples,
        present: types.filter(type => type.count > 0).length,
        types,
        regions,
        chronicle,
        chunk,
        succession: successionStats,
        telemetry: forestModelTelemetrySnapshot(),
        cache: forestModelCacheStats(),
        // The card sample keeps one dynamics record per regional type. A type
        // can carry several real management forms across its formation windows,
        // so this bounded count is the player's view of every system observed
        // in the same sample. It is not a second forest survey.
        systems: Object.entries(FOREST_MANAGEMENT_SYSTEMS).map(([id, meta]) => ({
            id, label: meta.label, count: systemCounts[id] || 0,
        })),
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
        + esc(FOREST_GOODS[id]?.label || String(id).replace(/-/g, " "))
        + ' <small>' + esc(forestGoodUseLabel(id) || "market") + '</small></span>').join("");
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

function dynamicsBlock(dynamics, fauna = null) {
    if (!dynamics) return '';
    const composition = dynamics.composition || {};
    const regeneration = dynamics.regeneration || {};
    const health = dynamics.health || {};
    const age = dynamics.age || {};
    const system = dynamics.silviculture || {};
    const working = dynamics.working || {};
    const hazard = dynamics.hazard || {};
    const regime = hazard.regime || {};
    const soil = dynamics.soil || {};
    const structure = dynamics.structure || {};
    const ageCohorts = age.cohorts || {};
    const deadwood = structure.deadwoodProfile || {};
    const gap = structure.gapProfile || {};
    const edge = structure.edgeProfile || {};
    const herb = structure.herbProfile || {};
    const liana = structure.lianaProfile || {};
    const epiphyte = structure.epiphyteProfile || {};
    const litter = soil.litterProfile || {};
    const facts = [
        ['MIX', MIX_LABELS[composition.mixtureClass] || composition.mixtureClass || '—', pct(composition.purity) + '% dominant · ' + number(composition.speciesCount) + ' species'],
        ['COHORTS', pct(ageCohorts.young) + '/' + pct(ageCohorts.mature) + '/' + pct(ageCohorts.ancient), 'young/mature/ancient · spread ' + number(age.spreadYears) + 'y'],
        ['PHASE', PHASE_LABELS[age.phase] || age.phase || '—', 'rotation ' + number(age.rotationYears) + 'y · ' + (age.uneven ? 'uneven' : 'even') + ' age'],
        ['PIONEER / CLIMAX', pct(composition.pioneerShare) + '% / ' + pct(composition.climaxShare) + '%', (composition.pioneerSpecies || []).slice(0, 2).join(' · ') || '—'],
        ['SEED BANK', pct(regeneration.seedBank) + '%', 'mother trees ' + number(regeneration.motherTreesPerHa) + '/ha · viable ' + pct(regeneration.seedBankViability) + '%'],
        ['REGEN', 'seedling ' + pct(regeneration.seedlingBank) + '%', 'rain ' + pct(regeneration.seedRain) + '% · germ ' + pct(regeneration.germination) + '% · recruit ' + pct(regeneration.saplingRecruitment) + '%'],
        ['GENETICS', pct(regeneration.geneticDiversity) + '%', 'quality ' + pct(regeneration.seedQuality) + '% · ' + (regeneration.provenance?.regional >= 0.5 ? 'regional provenance' : 'local provenance')],
        ['SITE FIT', pct(health.siteFitness) + '%', 'disease resistance ' + pct(health.diseaseResistance) + '%'],
        ['SYSTEM', system.label || '—', number(system.rotationYears) + 'y · timber ' + pct(system.timberFactor) + '% · retention ' + number(system.retentionTreesPerHa) + '/ha'],
        ['WORKING', 'sawlogs ' + pct(working.timber?.sawlog) + '% · firewood ' + pct(working.timber?.firewood) + '%', 'specialty ' + pct(working.timber?.specialty) + '% · quality ' + pct(working.timber?.quality) + '% · log share ' + pct(working.timber?.logShare) + '% · volume ' + pct(working.timber?.volume) + '%'],
        ['REGIME', regime.label || '—', 'fire ' + pct(regime.fire) + '% · wind ' + pct(regime.wind) + '% · return ' + number(regime.returnIntervalYears) + 'y'],
        ['DEADWOOD', pct(deadwood.total) + '%', 'standing ' + pct(deadwood.standing) + '% · fallen ' + pct(deadwood.fallen) + '% · decay ' + pct(deadwood.decay) + '%'],
        ['SOIL', soil.humusForm || '—', (soil.rootingType || 'roots') + ' · uptake ' + pct(soil.waterUptake) + '% · ' + number(soil.humusDepthCm) + 'cm humus · ' + pct(litter.broadleaf) + '/' + pct(litter.needle) + ' leaf/needle'],
        ['MYCORRHIZA', soil.mycorrhizaLabel || '—', (soil.mycorrhizaType || 'mixed network') + ' · decomposition ' + pct(soil.decomposition) + '% · ' + number(soil.networkReachM) + 'm reach'],
        ['STRUCTURE', structure.understoryLabel || '—', 'liana ' + pct(structure.lianaCover) + '% (' + ((liana.types || []).join(', ') || 'none') + ') · epiphyte ' + pct(structure.epiphyteCover) + '%'],
        ['EDGE', edge.active ? number(edge.widthM) + 'm mantle' : 'interior', 'diversity ' + pct(structure.edgeDiversity) + '% · cover ' + pct(edge.mantleCover) + '%'],
        ['LIGHT', structure.lightWoodland ? 'Open woodland' : 'Closed canopy', 'gap age ' + number(structure.gapAge) + 'd · edge diversity ' + pct(structure.edgeDiversity) + '%'],
        ['GAPS', pct(structure.canopyGap) + '%', (gap.origin || 'none') + ' · ' + (gap.sizeClass || 'none') + ' · ' + number(structure.layers) + ' layers'],
        ['HERB', 'food ' + pct(herb.food) + '%', 'medicine ' + pct(herb.medicine) + '% · flowering ' + pct(herb.flowering) + '%'],
    ];
    if (fauna) {
        facts.push(
            ['WILDLIFE', fauna.deer.primary + ' ' + number(fauna.deer.densityPer100Ha) + '/100ha', 'browse ' + percent(fauna.deer.browsePressure) + ' · boar ' + number(fauna.boar.sounderSize) + ' · health ' + percent(fauna.indicators.forestHealth) + '%'],
            ['PREDATORS', fauna.wolf.present ? 'wolf pack ' + number(fauna.wolf.packSize) : 'no wolf pack', (fauna.bear.present ? 'bear ' + number(fauna.bear.densityPer100Km2) + '/100km²' : 'no bear') + ' · lynx ' + (fauna.lynx.present ? 'present' : 'absent') + ' · raptors ' + number(fauna.raptors.pairs) + ' pairs'],
            ['WATER FAUNA', fauna.beavers.present ? 'beaver ' + number(fauna.beavers.colonies) : 'no beaver', 'otter ' + number(fauna.otters.individuals) + ' · fish ' + number(fauna.fish.biomassKgHa) + ' kg/ha · water ' + percent(fauna.indicators.waterQuality) + '%'],
            ['INSECTS', 'pollinators ' + percent(fauna.insects.pollinators) + '%', 'pests ' + percent(fauna.insects.pests) + '% · bees ' + number(fauna.wildBees.speciesRichness) + ' · butterflies ' + number(fauna.butterflies.speciesRichness)],
            ['DEADWOOD LIFE', 'ants ' + number(fauna.ants.moundsPerHa) + '/ha', 'woodpeckers ' + number(fauna.woodpeckers.pairs) + ' · beetles ' + number(fauna.deadwoodBeetles.speciesRichness) + ' · owls ' + number(fauna.owls.pairs)],
            ['CYCLE', fauna.cycles.hareLynx.label, 'hare ' + percent(fauna.cycles.hareLynx.hareIndex) + '% · lynx ' + percent(fauna.cycles.hareLynx.lynxIndex) + '% · parasites ' + percent(fauna.parasites.load) + '% · cleanup ' + percent(fauna.scavengers.diseaseCleanup) + '%'],
            ['CORRIDOR', percent(fauna.corridors.quality) + '%', 'migration ' + percent(fauna.corridors.migration) + '% · ' + number(fauna.corridors.links) + ' links · ' + number(fauna.corridors.nearestWoodKm) + 'km · ' + (fauna.corridors.targetRegionalType || 'local matrix')],
            ['HARVEST', 'game ' + number(fauna.products.venisonKgHa) + ' kg/ha', 'fish ' + number(fauna.products.fishKgHa) + ' · honey ' + number(fauna.products.honeyKgHa) + ' · mushrooms ' + number(fauna.products.mushroomsKgHa) + ' kg/ha'],
        );
    }
    return '<div class="forest-atlas__dynamics">' + facts.map(([label, value, detail]) =>
        '<span><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong><em>' + esc(detail) + '</em></span>').join('')
        + '</div>';
}

function modelBlock(model) {
    if (!model) return '';
    const limits = model.limits || {};
    const temperature = limits.temperature || [0, 0];
    const moisture = limits.moisture || [0, 0];
    const height = limits.height || [0, 0];
    const disturbance = model.disturbance || {};
    const succession = model.succession || {};
    const lod = model.lod || {};
    const water = model.water || {};
    const flood = model.floodPressure || {};
    const erosion = model.erosion || {};
    const regeneration = model.regeneration || {};
    const biodiversity = model.biodiversity || {};
    const facts = [
        ['MODEL', 'ID ' + model.typeId.slice(-3) + ' · ' + pct(model.distribution.share) + '% region',
            'temp ' + Number(temperature[0]).toFixed(2) + '–' + Number(temperature[1]).toFixed(2)
            + ' · moisture ' + Number(moisture[0]).toFixed(2) + '–' + Number(moisture[1]).toFixed(2)
            + ' · height ' + Number(height[0]).toFixed(2) + '–' + Number(height[1]).toFixed(2)],
        ['SOIL / WATER', esc(model.soil.label) + ' · pH ' + model.soil.pH,
            'N ' + pct(model.soil.nutrients) + '% · water ' + pct(model.soil.waterCapacity)
            + '% · ' + model.moisture.class + ' / ' + model.moisture.habitat],
        ['DISTURBANCE', 'fire ' + pct(disturbance.fire) + '% · wind ' + pct(disturbance.wind) + '%',
            'ice ' + pct(disturbance.ice) + '% · flood ' + pct(disturbance.flood)
            + '% · ' + (succession.stageLabel || succession.stage || 'undisturbed')
            + ' · return ' + number(disturbance.returnYears) + 'y'],
        ['PERFORMANCE', 'LOD ' + lod.tier + ' · ' + number(lod.maxTrees) + ' trees/chunk',
            'chunk ' + (model.chunk?.key || '—') + ' · ' + number(model.chunk?.budget?.maxStands)
            + ' stands · ' + number(model.chunk?.budget?.maxTypes) + ' types · '
            + (model.rng.streams?.vegetation || 'forest-vegetation')],
        ['WATER', (water.floodplain ? 'Floodplain' : water.mire ? 'Mire' : 'Upland')
            + ' · flow ' + pct(water.flow) + '%', 'flood pressure ' + pct(flood.pressure)
            + '% · retention ' + pct(water.retention) + '% · ' + (flood.wetWeather ? 'wet weather' : 'dry weather')],
        ['EROSION', esc(erosion.class || 'low') + ' · ' + number(erosion.sedimentTonsPerHaYear) + ' t/ha/y',
            'risk ' + pct(erosion.risk) + '% · mitigation ' + pct(erosion.mitigation) + '% · ' + esc(erosion.soil || 'soil')],
        ['RECOVERY', number(regeneration.yearsToCanopy) + 'y to canopy',
            esc(regeneration.trajectory || 'steady') + ' · seed bank ' + pct(regeneration.seedBank)
            + '% · mother trees ' + pct(regeneration.motherTrees) + '% · erosion penalty ' + pct(regeneration.erosionPenalty) + '%'],
        ['HABITAT', 'biodiversity ' + number(biodiversity.percent) + '%',
            esc(biodiversity.class || 'moderate') + ' · ' + number(biodiversity.layers) + ' layers · fauna '
            + number(biodiversity.faunaRichness) + ' · deadwood ' + pct(biodiversity.deadwood) + '%'],
    ];
    return '<div class="forest-atlas__dynamics" data-forest-model="' + esc(model.typeId) + '">'
        + facts.map(([label, value, detail]) => '<span><small>' + esc(label) + '</small><strong>'
            + esc(value) + '</strong><em>' + esc(detail) + '</em></span>').join('')
        + '</div>';
}

function card(type, count, sampled, transitionCount, currentSeason, dynamics = null, fauna = null, model = null) {
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
        + dynamicsBlock(dynamics, fauna)
        + modelBlock(model)
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

// The atlas cards carry eight decision cells per forest type. This guide opens
// the complete requested set once, against the richest sampled wood, so every
// point has a visible live reading and a plain-language field note. It is one
// bounded block of thirty rows and adds no survey or simulation work.
function faunaFieldGuide(survey) {
    const reference = survey.types
        .filter(entry => entry.count > 0 && entry.fauna)
        .sort((a, b) => (b.fauna.indicators?.biodiversity || 0) - (a.fauna.indicators?.biodiversity || 0))[0];
    if (!reference) return "";
    const points = forestFaunaFieldGuide(reference.fauna);
    if (!points.length) return "";
    const type = REGIONAL_FOREST_TYPES.find(entry => entry.id === reference.id);
    const label = type ? (type.short || type.label) : reference.id;
    const rows = points.map(point => {
        const facts = point.facts.map(fact => '<span>' + esc(fact) + '</span>').join("");
        return '<article class="forest-atlas__guide-point" data-fauna-point="' + esc(point.id) + '">'
            + '<div class="forest-atlas__guide-head"><b>' + esc(point.id.slice(-3)) + '</b><span>' + esc(point.group.toUpperCase()) + '</span></div>'
            + '<h4>' + esc(point.title) + '</h4>'
            + '<p>' + facts + '</p>'
            + '<small>' + esc(point.note) + '</small>'
            + '</article>';
    }).join("");
    return '<details class="forest-atlas__field-guide" data-fauna-guide="' + number(points.length) + '">'
        + '<summary><span>FIELD GUIDE · ' + number(points.length) + ' POINTS</span>'
        + '<strong>Fauna, ecology and food webs</strong>'
        + '<em>Reference wood: ' + esc(reference.id.slice(-3)) + ' · ' + esc(label) + ' · ' + esc(survey.season) + '</em></summary>'
        + '<p class="forest-atlas__guide-intro">All thirty requested fauna and ecology points, read live from the reference wood. '
        + 'Each value follows the same stand, season and management record that feeds hunting, gathering, herd growth and regeneration. '
        + 'Open a forest type above to compare its own fauna summary.</p>'
        + '<div class="forest-atlas__guide-grid">' + rows + '</div>'
        + '</details>';
}

function stewardshipEventLine(entry) {
    const year = entry.year ? 'Year ' + number(entry.year) : 'Day ' + number(entry.day);
    const area = number(entry.area) + (entry.area === 1 ? ' tile' : ' tiles');
    const progress = entry.progress !== null && entry.progress !== undefined
        ? ' · ' + pct(entry.progress) + '% recovered' : '';
    const stock = entry.stockBefore !== null && entry.stockAfter !== null
        ? ' · stock ' + number(entry.stockBefore) + ' → ' + number(entry.stockAfter) : '';
    const amount = entry.amount ? ' · +' + number(entry.amount) + ' stand units' : '';
    const escaped = entry.escaped ? ' · ESCAPED' : '';
    const flood = entry.beforeFlood !== null && entry.afterFlood !== null
        ? ' · flood ' + pct(entry.beforeFlood) + '% → ' + pct(entry.afterFlood) + '%' : '';
    return '<li data-forest-chronicle="' + esc(entry.kind) + '"><b>' + esc(year) + '</b> · '
        + esc(entry.label) + ' · ' + area + progress + stock + amount + flood + escaped + '</li>';
}

function regionHistoryBlock(survey) {
    const pulse = survey.succession || {};
    const regions = Array.isArray(survey.regions) ? survey.regions : [];
    const countLabel = (count, one, many) => {
        const value = Number(count) || 0;
        return number(value) + ' ' + (value === 1 ? one : many);
    };
    const rows = regions.map(region => {
        const sample = region.sample || {};
        const disturbances = region.disturbances || {};
        const kinds = Object.entries(disturbances.byKind || {})
            .map(([kind, count]) => String(kind).replace(/-/g, ' ') + ' ' + number(count)).join(' · ');
        // Player orders must not be crowded out by later natural events. Show
        // the latest orders first, then the latest disturbance/spread records.
        const allHistory = region.history || [];
        const history = [
            ...allHistory.filter(entry => entry.source === "stewardship").slice(0, 4),
            ...allHistory.filter(entry => entry.source !== "stewardship").slice(0, 3),
        ];
        const status = sample.biodiversity !== undefined
            ? 'Biodiversity ' + pct(sample.biodiversity) + '% · Erosion '
                + pct(sample.erosion) + '% · Flood ' + pct(sample.flood)
                + '% · Wetness ' + pct(sample.wetness) + '% · Regrowth '
                + pct(sample.regeneration) + '%'
            : 'No live ecology sample at this survey window';
        return '<details class="forest-atlas__region" data-forest-region="' + esc(region.id)
            + '" data-forest-region-biodiversity="' + pct(sample.biodiversity)
            + '" data-forest-region-flood="' + pct(sample.flood) + '">'
            + '<summary><span>' + esc(region.label) + '</span><small>' + countLabel(region.count, 'sampled stand', 'sampled stands')
            + ' · ' + esc(status) + '</small></summary>'
            + '<div class="command-note"><b>CURRENT</b> ' + esc(status)
            + (sample.erosionClass ? ' · erosion ' + esc(sample.erosionClass) : '')
            + (sample.biodiversityClass ? ' · habitat ' + esc(sample.biodiversityClass) : '')
            + (sample.drained ? ' · DRAINED WETLAND' : '')
            + (sample.firebreak ? ' · FIREBREAK ACTIVE TO DAY ' + number(sample.firebreakUntil) : '')
            + ' · ' + countLabel(disturbances.active || 0, 'active disturbance tile', 'active disturbance tiles')
            + (kinds ? ' (' + esc(kinds) + ')' : '') + '.</div>'
            + '<ul class="forest-atlas__chronicle">'
            + (history.length ? history.map(stewardshipEventLine).join('')
                : '<li data-forest-chronicle="none">No disturbance event or stewardship order is recorded in this region yet.</li>')
            + '</ul></details>';
    }).join('');
    return '<div class="command-section-title">FOREST STEWARDSHIP &amp; REGION HISTORY</div>'
        + '<div class="command-summary" data-forest-stewardship="' + number(pulse.stewardshipActions) + '" data-forest-firebreaks="'
        + number(pulse.firebreaks) + '" data-forest-drained="' + number(pulse.drained) + '">'
        + '<div><small>PLAYER ORDERS</small><strong>' + number(pulse.stewardshipActions) + '</strong></div>'
        + '<div><small>FIREBREAKS</small><strong>' + countLabel(pulse.firebreaks, 'TILE', 'TILES') + '</strong></div>'
        + '<div><small>DRAINED SITES</small><strong>' + number(pulse.drained) + '</strong></div>'
        + '<div><small>REPLANTED</small><strong>' + countLabel(pulse.planted, 'UNIT', 'UNITS') + '</strong></div>'
        + '<div><small>REGIONS CHRONICLED</small><strong>' + number(regions.length) + '</strong></div></div>'
        + '<p class="command-note">Orders are issued from a Lumber Yard or Forester\'s Lodge: reforest a clearing, clear a firebreak belt, set a controlled burn, or drain/restore a wet stand. Every order costs real stores, is saved with the realm and writes into the region history below; disturbance area, recovery and current biodiversity, erosion, flood and wetness are read from the same stand model the simulation uses.</p>'
        + '<div class="forest-atlas__regions">' + rows + '</div>';
}

export function renderForestAtlasPanel() {
    const survey = forestAtlasSurvey();
    if (!survey.available) {
        return intro("THE FOREST ATLAS", "Regional woodland", "The atlas is charted with the realm. Start or load a campaign to classify its forest tiles.")
            + '<p class="command-note">No resource geography is available in this session.</p>';
    }
    const present = survey.types.filter(type => type.count > 0).length;
    const currentSeason = Math.max(0, Math.min(3, Number(state.seasonIndex) || 0));
    const pulse = survey.succession || {};
    const byKind = pulse.byKind || {};
    const chunk = survey.chunk;
    const processBlock = '<div class="command-section-title">LIVE ECOLOGY PULSE</div>'
        + '<div class="command-summary" data-forest-process="' + number(pulse.active) + '" data-forest-flood="'
        + number(byKind.flooded) + '" data-forest-chunk="' + esc(chunk?.key || 'none') + '">'
        + '<div><small>ACTIVE DISTURBANCES</small><strong>' + number(pulse.active) + '</strong></div>'
        + '<div><small>CONTAINED</small><strong>' + number(pulse.contained) + '</strong></div>'
        + '<div><small>SPREADS</small><strong>' + number(pulse.spreadings) + '</strong></div>'
        + '<div><small>ACTIVE FLOODS</small><strong>' + number(byKind.flooded) + '</strong></div>'
        + '<div><small>CHUNK / LOD</small><strong>' + esc(chunk ? chunk.budget.lod.toUpperCase() : 'WAITING')
        + ' · ' + number(chunk?.sampled) + ' SAMPLES</strong></div>'
        + '<div><small>MODEL CACHE</small><strong>' + number(survey.cache?.chunks) + ' / '
        + number(survey.cache?.limit) + '</strong></div></div>'
        + '<p class="command-note" data-forest-model-telemetry="' + number(survey.telemetry?.chunksBuilt) + '">'
        + 'The pulse is read from the real succession tiles, the shared chunk budget and the bounded model cache. '
        + 'Chunk builds: ' + number(survey.telemetry?.chunksBuilt) + ' · max ' + number(survey.telemetry?.maxMs)
        + ' ms · types seen: ' + number(survey.telemetry?.typesSeen) + '. No per-tile work is added to the simulation tick.</p>';
    const cards = REGIONAL_FOREST_TYPES.map(type => {
        const row = survey.types.find(entry => entry.id === type.id);
        return card(type, row?.count || 0, survey.sampled, row?.transitionCount || 0, currentSeason, row?.dynamics || null, row?.fauna || null, row?.model || null);
    }).join("");
    return intro("THE FOREST ATLAS", "Sixty regional woodlands",
        "Every forest tile belongs to exactly one regional type, and boundary tiles name the woodland they blend into. Open a type to read its field marks, its signature good, its timber, its ecological effects, its soil/water envelope, its disturbance and succession matrix, its biodiversity index and its bounded LOD budget.")
        + '<div class="command-summary"><div><small>CATALOGUED</small><strong>' + number(REGIONAL_FOREST_TYPES.length) + ' TYPES</strong></div>'
        + '<div><small>IN THIS REALM</small><strong>' + number(present) + ' TYPES</strong></div>'
        + '<div><small>SILVICULTURE</small><strong>' + survey.systems.filter(row => row.count > 0).length + ' / 6 SYSTEMS</strong></div>'
        + '<div><small>ECOLOGY SAMPLE</small><strong>' + number(survey.sampled) + ' STANDS</strong></div>'
        + '</div>'
        + '<div class="command-section-title">SILVICULTURE IN SAMPLE</div>'
        + '<div class="command-summary forest-atlas__systems">' + survey.systems.map(row =>
            '<div data-forest-system="' + esc(row.id) + '"><small>' + esc(row.label) + '</small><strong>'
            + number(row.count) + '</strong></div>').join('')
        + '</div>'
        + '<div class="command-summary">'
        + '<div><small>FOREST TILES</small><strong>' + number(survey.forestTiles) + '</strong></div>'
        + '<div><small>SURVEYED</small><strong>' + number(survey.sampled) + ' SAMPLES</strong></div>'
        + '<div><small>TRANSITION EDGES</small><strong>' + number(survey.transitionSamples) + '</strong></div>'
        + '<div><small>SEASON</small><strong>' + esc(survey.season.toUpperCase()) + '</strong></div></div>'
        + processBlock
        + regionHistoryBlock(survey)
        + faunaFieldGuide(survey)
        + '<div class="forest-atlas">' + cards + '</div>'
        + '<p class="command-note">The realm count comes from a bounded deterministic sample of up to ' + number(SURVEY_LIMIT)
        + ' forest tiles; it is a survey, not a per-frame scan. Timber, regrowth, wildlife, forage and work are live simulation inputs: they price lumber batches, gathering yields, regrowth and habitat. Flood raises the spoilage of a perishable harvest, and a signature good pays a bonus in its own season. The ecology block is taken from the first surveyed tile of each type: it reports the actual mixture class, succession phase, seed bank, mother trees, genetic breadth, site fitness, disease resistance, silvicultural system, roots, humus, mycorrhiza, understorey, lianas, epiphytes and canopy gaps. Timber prices are the current seasonal base quote of the regional timber market in the Royal Stores.</p>';
}
