// Forest fauna, ecology and food webs — 1.2.23.1.091–120.
//
// This is a pure, derived view over the stand that `forestStandAt()` already
// owns. It does not create a second map, a per-frame animal solver or a new
// save schema. One call turns composition, age, deadwood, water, edge, soil,
// management and season into the thirty requested guild records, their food
// web, their pressures and their products.
//
// The compact `forestFaunaSignalsFor()` is what the stand and the existing herd
// model read. The detailed `forestFaunaEcologyFor()` is read by the forest
// atlas, the inspector, gathering and the focused tests. Both share the same
// formulas, so a panel can never disagree with the simulation.
//
// Only seasonalState() is imported. That keeps the module usable from world
// generation, where no game state exists yet.

import { seasonalState } from './season.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round(number(value) * factor) / factor;
};
const pct = value => Math.round(clamp01(value) * 100);

function hash32(seed, a, b, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, a, b, salt = 0) {
    return hash32(seed, a, b, salt) / 0x100000000;
}

export const FAUNA_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

export function faunaSeasonAt(dayOfYear, climate = 'temperate') {
    const day = ((Math.floor(number(dayOfYear, 150)) % 400) + 400) % 400;
    const index = seasonalState(day, climate)?.season ?? 0;
    return { index, name: FAUNA_SEASONS[index] || 'spring', day };
}

// Regional deer and deer-like browsers (091). Europe and North America have
// true cervids; Africa and parts of Asia have bovid browsers that fill the same
// ecological role. The record says which is which instead of pretending that
// every wood carries red deer.
const REGIONAL_DEER = Object.freeze([
    { match: /taiga|boreal|spruce-fir|pine-birch|larch|subalpine/i, species: [
        ['moose', 'Moose', 'Alces alces', 0.62, 'browser'],
        ['roe-deer', 'Roe deer', 'Capreolus capreolus', 0.38, 'browser'],
    ] },
    { match: /tundra|snow|arctic/i, species: [
        ['reindeer', 'Reindeer', 'Rangifer tarandus', 0.78, 'grazer'],
        ['moose', 'Moose', 'Alces alces', 0.22, 'browser'],
    ] },
    { match: /mediterranean|hardleaf|cork-oak|holm-oak|aleppo/i, species: [
        ['fallow-deer', 'Fallow deer', 'Dama dama', 0.52, 'grazer'],
        ['red-deer', 'Red deer', 'Cervus elaphus', 0.34, 'mixed'],
        ['roe-deer', 'Roe deer', 'Capreolus capreolus', 0.14, 'browser'],
    ] },
    { match: /coast-redwood|pacific-rainforest|atlantic-cloud|temperate-rainforest/i, species: [
        ['black-tailed-deer', 'Black-tailed deer', 'Odocoileus hemionus', 0.58, 'browser'],
        ['roe-deer', 'Roe deer', 'Capreolus capreolus', 0.24, 'browser'],
        ['red-deer', 'Red deer', 'Cervus elaphus', 0.18, 'mixed'],
    ] },
    { match: /mangrove|floodplain|carr|bog|gallery|delta|lagoon/i, species: [
        ['red-deer', 'Red deer', 'Cervus elaphus', 0.44, 'mixed'],
        ['roe-deer', 'Roe deer', 'Capreolus capreolus', 0.34, 'browser'],
        ['sika-deer', 'Sika deer', 'Cervus nippon', 0.22, 'grazer'],
    ] },
    { match: /miombo|acacia|baobab|thornscrub|savanna|steppe/i, species: [
        ['greater-kudu', 'Greater kudu', 'Tragelaphus strepsiceros', 0.5, 'browser'],
        ['impala', 'Impala', 'Aepyceros melampus', 0.34, 'grazer'],
        ['saiga', 'Saiga antelope', 'Saiga tatarica', 0.16, 'grazer'],
    ] },
    { match: /teak|sal|dipterocarp|bamboo|monsoon|laurel/i, species: [
        ['sambar', 'Sambar', 'Rusa unicolor', 0.46, 'mixed'],
        ['chital', 'Chital', 'Axis axis', 0.34, 'grazer'],
        ['muntjac', 'Muntjac', 'Muntiacus muntjak', 0.2, 'browser'],
    ] },
    { match: /tropical|rainforest|jungle|kapok|mahogany/i, species: [
        ['red-brocket', 'Red brocket', 'Mazama americana', 0.52, 'browser'],
        ['sambar', 'Sambar', 'Rusa unicolor', 0.28, 'mixed'],
        ['muntjac', 'Muntjac', 'Muntiacus muntjak', 0.2, 'browser'],
    ] },
]);

const TEMPERATE_DEER = Object.freeze([
    ['red-deer', 'Red deer', 'Cervus elaphus', 0.46, 'mixed'],
    ['roe-deer', 'Roe deer', 'Capreolus capreolus', 0.38, 'browser'],
    ['fallow-deer', 'Fallow deer', 'Dama dama', 0.16, 'grazer'],
]);

function deerSpeciesFor(stand, climate) {
    const key = String(stand?.regionalType?.key || stand?.type || '');
    for (const entry of REGIONAL_DEER) {
        if (entry.match.test(key)) return entry.species;
    }
    if (stand?.tropical) return REGIONAL_DEER[7].species;
    if (/taiga|tundra|snow/i.test(climate)) return REGIONAL_DEER[0].species;
    if (/savanna|desert/i.test(climate)) return REGIONAL_DEER[5].species;
    return TEMPERATE_DEER;
}

export const FOREST_FAUNA_POINTS = Object.freeze({
    '1.2.23.1.091': Object.freeze({ key: 'deer', title: 'Regionale Hirscharten', group: 'herbivore' }),
    '1.2.23.1.092': Object.freeze({ key: 'boar', title: 'Wildschweine und Bodenschäden', group: 'herbivore' }),
    '1.2.23.1.093': Object.freeze({ key: 'bear', title: 'Bären als Spitzenprädatoren', group: 'predator' }),
    '1.2.23.1.094': Object.freeze({ key: 'wolf', title: 'Wölfe mit Rudelverhalten', group: 'predator' }),
    '1.2.23.1.095': Object.freeze({ key: 'lynx', title: 'Luchse als Einzeljäger', group: 'predator' }),
    '1.2.23.1.096': Object.freeze({ key: 'raptors', title: 'Greifvögel als Indikatoren', group: 'bird' }),
    '1.2.23.1.097': Object.freeze({ key: 'owls', title: 'Eulen in alten Bäumen', group: 'bird' }),
    '1.2.23.1.098': Object.freeze({ key: 'woodpeckers', title: 'Spechte als Totholz-Spezialisten', group: 'bird' }),
    '1.2.23.1.099': Object.freeze({ key: 'songbirds', title: 'Singvögel und Tageszeit', group: 'bird' }),
    '1.2.23.1.100': Object.freeze({ key: 'beavers', title: 'Biber als Landschaftsbaumeister', group: 'engineer' }),
    '1.2.23.1.101': Object.freeze({ key: 'otters', title: 'Fischotter an sauberen Gewässern', group: 'predator' }),
    '1.2.23.1.102': Object.freeze({ key: 'smallPredators', title: 'Marder und Wiesel', group: 'predator' }),
    '1.2.23.1.103': Object.freeze({ key: 'lagomorphs', title: 'Hasen und Kaninchen', group: 'prey' }),
    '1.2.23.1.104': Object.freeze({ key: 'rodents', title: 'Nagetiere und Samenverbreitung', group: 'prey' }),
    '1.2.23.1.105': Object.freeze({ key: 'bats', title: 'Fledermäuse in Höhlen und Kronen', group: 'aerial' }),
    '1.2.23.1.106': Object.freeze({ key: 'insects', title: 'Insekten als Bestäuber und Nahrung', group: 'insect' }),
    '1.2.23.1.107': Object.freeze({ key: 'ants', title: 'Ameisen als Bodenwender', group: 'insect' }),
    '1.2.23.1.108': Object.freeze({ key: 'wildBees', title: 'Wildbienen mit Nistplätzen', group: 'insect' }),
    '1.2.23.1.109': Object.freeze({ key: 'butterflies', title: 'Schmetterlinge im Jahreslauf', group: 'insect' }),
    '1.2.23.1.110': Object.freeze({ key: 'deadwoodBeetles', title: 'Totholzkäfer als Urwaldzeiger', group: 'insect' }),
    '1.2.23.1.111': Object.freeze({ key: 'amphibians', title: 'Amphibien in feuchten Mulden', group: 'aquatic' }),
    '1.2.23.1.112': Object.freeze({ key: 'reptiles', title: 'Reptilien auf Sonnenplätzen', group: 'reptile' }),
    '1.2.23.1.113': Object.freeze({ key: 'fish', title: 'Fische in klaren Waldbächen', group: 'aquatic' }),
    '1.2.23.1.114': Object.freeze({ key: 'waterFilters', title: 'Krebse und Muscheln als Wasseranzeiger', group: 'aquatic' }),
    '1.2.23.1.115': Object.freeze({ key: 'fungi', title: 'Pilze als Nahrung und Zersetzer', group: 'fungus' }),
    '1.2.23.1.116': Object.freeze({ key: 'mossLichen', title: 'Moose und Flechten als Feuchtezeiger', group: 'plant' }),
    '1.2.23.1.117': Object.freeze({ key: 'parasites', title: 'Parasiten mit Wirtsbindung', group: 'parasite' }),
    '1.2.23.1.118': Object.freeze({ key: 'scavengers', title: 'Aasfresser im Stoffkreislauf', group: 'scavenger' }),
    '1.2.23.1.119': Object.freeze({ key: 'cycles', title: 'Räuber-Beute-Zyklen', group: 'dynamic' }),
    '1.2.23.1.120': Object.freeze({ key: 'corridors', title: 'Wanderkorridore', group: 'dynamic' }),
});

export const FOREST_FAUNA_POINT_IDS = Object.freeze(Object.keys(FOREST_FAUNA_POINTS));

// A compact signal record. The stand, the herd model and the renderer read
// these numbers; they are cheap enough to calculate for every visible stand
// without allocating thirty guild objects.
//
// `forestFaunaQuickSignalsFor()` is the bounded projection used by the daily
// herd model. It repeats only the formulas that decide habitat and predation,
// so a 400-day soak does not allocate tens of thousands of guild records. The
// detailed `forestFaunaEcologyFor()` remains the authoritative expansion for
// the atlas, inspector and tests; both read the same stand inputs.
export function forestFaunaQuickSignalsFor(stand, options = {}) {
    if (!stand || typeof stand !== "object") return null;
    const season = faunaSeasonAt(options.day ?? options.dayOfYear ?? stand.dayOfYear ?? 150,
        options.climate || stand.climate || "temperate");
    const structure = stand.dynamics?.structure || stand.structure || {};
    const dead = structure.deadwoodProfile || {};
    const edgeProfile = structure.edgeProfile || {};
    const gapProfile = structure.gapProfile || {};
    const herbProfile = structure.herbProfile || {};
    const underProfile = structure.understoryProfile || {};
    const soil = stand.dynamics?.soil || {};
    const forage = stand.dynamics?.working?.forage || {};
    const health = stand.dynamics?.health || {};
    const canopy = clamp01(stand.canopy ?? 0.6);
    const open = 1 - canopy;
    const moisture = clamp01(stand.moisture ?? 0.55);
    const wetness = clamp01(stand.wetness ?? moisture);
    const ancient = stand.ageClass === "ancient" ? 1 : stand.ageClass === "mature" ? 0.45 : 0.12;
    const youngStand = stand.ageClass === "young" ? 1 : 0.15;
    const conifer = clamp01(stand.coniferShare);
    const broadleaf = clamp01(stand.broadleafShare ?? (1 - conifer));
    const deadwood = clamp01(stand.deadwood ?? dead.total);
    const edge = Boolean(stand.edge || edgeProfile.active);
    const edgeMantle = clamp01(edgeProfile.mantleCover ?? (edge ? 0.45 : 0));
    const gap = clamp01(structure.canopyGap ?? stand.clearing);
    const herbFood = clamp01(herbProfile.food ?? 0.4);
    const flowering = clamp01(herbProfile.flowering ?? stand.ground?.flowers ?? 0.2);
    const shrub = clamp01(underProfile.shrub ?? stand.understory?.shrub ?? 0.2);
    const mast = clamp01(forage.mast ?? 0.25);
    const berries = clamp01(forage.berries ?? stand.understory?.berry ?? 0.1);
    const hunting = clamp01(stand.ground?.huntingPressure);
    const human = clamp01(Math.max(hunting * 0.8, edge ? 0.28 : 0.18));
    const regionalFauna = clamp01(stand.regionalEffects?.fauna ?? 1);
    const transition = clamp01(stand.regionalTransitionShare);
    const pools = clamp01(stand.tropical?.water?.pools ?? stand.ground?.pools ?? 0);
    const moss = clamp01(stand.ground?.moss ?? structure.epiphyteCover ?? 0.1);
    const mycorrhiza = clamp01(soil.mycorrhiza ?? 0.15);
    const compaction = clamp01(stand.ground?.compaction);
    const willowShare = (stand.species || []).reduce((sum, entry) =>
        sum + (/willow|alder|poplar|aspen|birch/i.test(String(entry?.id || "")) ? number(entry.weight, 0.1) : 0), 0);
    const waterBody = wetness > 0.62 || pools > 0.08
        || /floodplain|carr|mangrove|gallery|bog|swamp/i.test(String(stand.type || ""))
        || Boolean(stand.tropical?.water?.floodplain || stand.jungle?.landscape?.hiddenStream);
    const preyBase = clamp01(0.2 + edgeMantle * 0.16 + open * 0.12 + mast * 0.14
        + herbFood * 0.14 + gap * 0.1 + clamp01(underProfile.sapling ?? 0.2) * 0.08);
    const remoteness = clamp01(1 - human * 1.15);
    const winterFactor = season.name === "winter" ? 0.78 : season.name === "spring" ? 0.95 : 1;
    const deer = clamp01((0.16 + edgeMantle * 0.16 + gap * 0.14 + herbFood * 0.18
        + mast * 0.14 + open * 0.12 + shrub * 0.08 + youngStand * 0.05)
        * winterFactor * (1 - human * 0.35) * regionalFauna);
    const boar = clamp01(0.12 + mast * 0.28 + clamp01(stand.ground?.litter ?? 0.3) * 0.18
        + moisture * 0.12 + shrub * 0.08 + (season.name === "autumn" ? 0.1 : 0));
    const bear = clamp01((ancient * 0.22 + mast * 0.24 + berries * 0.16
        + deadwood * 0.14 + remoteness * 0.18 + (season.name === "autumn" ? 0.08 : 0)) * 0.62 * regionalFauna);
    const wolf = clamp01((0.06 + conifer * 0.08 + ancient * 0.12 + remoteness * 0.28
        + preyBase * 0.28 + transition * 0.06 - human * 0.22) * regionalFauna);
    const lynx = clamp01((youngStand * 0.16 + edgeMantle * 0.16 + deadwood * 0.12
        + remoteness * 0.26 + preyBase * 0.24 + transition * 0.06) * 0.72 * regionalFauna);
    const raccoon = clamp01(0.12 + ancient * 0.16 + deadwood * 0.2 + preyBase * 0.2 + shrub * 0.12);
    const rabbit = clamp01(0.08 + edgeMantle * 0.18 + open * 0.16 + (1 - moisture) * 0.18
        + herbFood * 0.16 + human * 0.1 + (1 - conifer) * 0.08);
    const waterQuality = clamp01(wetness * 0.32 + moss * 0.2 + (1 - compaction) * 0.16
        + clamp01(1 - (stand.light ?? open)) * 0.14 + mycorrhiza * 0.1 + (1 - human) * 0.08);
    const fish = clamp01(waterQuality * 0.34 + clamp01(1 - (stand.light ?? open)) * 0.18 + pools * 0.18
        + wetness * 0.18 + (waterBody ? 0.12 : 0) - compaction * 0.2);
    const beaver = clamp01(wetness * 0.38 + willowShare * 0.22 + broadleaf * 0.1
        + (1 - clamp01(stand.height ?? 0.5)) * 0.08 + (waterBody ? 0.12 : 0) - human * 0.22);
    const otter = clamp01(waterQuality * 0.4 + fish * 0.26 + edgeMantle * 0.12
        + (1 - human) * 0.1 + (waterBody ? 0.12 : 0));
    const pest = clamp01(conifer * 0.2 + (1 - moisture) * 0.22 + clamp01(stand.density ?? 0.6) * 0.18
        + clamp01(health.droughtStress) * 0.16 + (stand.disturbance === "bark-beetle" ? 0.24 : 0)
        - clamp01(health.diseaseResistance) * 0.16);
    return {
        browsing: round(deer),
        rooting: round(boar),
        predation: round(clamp01(wolf * 0.35 + lynx * 0.25 + bear * 0.15 + raccoon * 0.15)),
        waterQuality: round(waterQuality),
        pollination: round(clamp01(flowering * 0.34 + herbFood * 0.2 + edgeMantle * 0.14
            + moisture * 0.1 + broadleaf * 0.08 + (1 - pest) * 0.08)),
        pestControl: round(clamp01(preyBase * 0.4 + (1 - pest) * 0.3 + ancient * 0.1)),
        seedDispersal: round(clamp01(mast * 0.5 + 0.1)),
        fishYield: round(fish * 0.8),
        mushroomYield: round(clamp01(mycorrhiza * 0.3 + (soil.decomposition ?? 0.4) * 0.3 + deadwood * 0.2)),
        honeyYield: round(clamp01(flowering * 0.5 + edgeMantle * 0.2 + 0.08)),
        gameYield: round(clamp01(deer * 0.7 + boar * 0.2)),
        corridor: round(clamp01(edgeMantle * 0.18 + canopy * 0.12 + deadwood * 0.12
            + moisture * 0.1 + transition * 0.24 + (1 - human) * 0.14 + gap * 0.1)),
        cyclePhase: 0.5,
        parasiteLoad: round(clamp01(deer * 0.6 + shrub * 0.15 + moisture * 0.1)),
        scavenging: round(clamp01(0.2 + open * 0.18 + edgeMantle * 0.14 + human * 0.1)),
        biodiversity: round(clamp01(0.2 + edgeMantle * 0.18 + flowering * 0.14
            + deadwood * 0.18 + ancient * 0.12 + (1 - pest) * 0.1 + preyBase * 0.08)),
        beaver: round(beaver),
        fish: round(fish),
        boar: round(boar),
        deer: round(deer),
        wolf: round(wolf),
        bear: round(bear),
        lynx: round(lynx),
        raptor: round(clamp01(0.12 + open * 0.16 + edgeMantle * 0.12 + preyBase * 0.18 + remoteness * 0.16)),
        rabbit: round(rabbit),
    };
}

export function forestFaunaSignalsFor(stand, options = {}) {
    const record = forestFaunaEcologyFor(stand, options);
    if (!record) return null;
    return record.signals;
}

export function forestFaunaCommunityFor(stand, options = {}) {
    const record = forestFaunaEcologyFor(stand, options);
    return record ? record.community.slice() : [];
}

// The public, detailed record. Every one of the thirty points owns a named
// section with its own bounded values and a stable id, so the atlas, tests and
// documentation can point at exactly one implementation.
export function forestFaunaEcologyFor(stand, options = {}) {
    if (!stand || typeof stand !== 'object') return null;
    const climate = options.climate || stand.climate || 'temperate';
    const season = faunaSeasonAt(options.day ?? options.dayOfYear ?? stand.dayOfYear ?? 150, climate);
    const seed = Number(options.seed ?? stand.seed ?? 1) >>> 0;
    const tx = Math.floor(number(options.x ?? stand.x, 0));
    const ty = Math.floor(number(options.y ?? stand.y, 0));
    const dynamics = stand.dynamics || {};
    const structure = dynamics.structure || stand.structure || {};
    const dead = structure.deadwoodProfile || {};
    const edgeProfile = structure.edgeProfile || {};
    const gapProfile = structure.gapProfile || {};
    const herbProfile = structure.herbProfile || {};
    const underProfile = structure.understoryProfile || {};
    const litterProfile = structure.litterProfile || {};
    const soil = dynamics.soil || {};
    const working = dynamics.working || {};
    const forage = working.forage || {};
    const habitat = working.habitat || {};
    const health = dynamics.health || {};

    const forest = Boolean(stand.forest);
    const canopy = clamp01(stand.canopy ?? 0.6);
    const density = clamp01(stand.density ?? 0.6);
    const moisture = clamp01(stand.moisture ?? 0.55);
    const wetness = clamp01(stand.wetness ?? moisture);
    const open = 1 - canopy;
    const ancient = stand.ageClass === 'ancient' ? 1 : stand.ageClass === 'mature' ? 0.45 : 0.12;
    const youngStand = stand.ageClass === 'young' ? 1 : 0.15;
    const conifer = clamp01(stand.coniferShare);
    const broadleaf = clamp01(stand.broadleafShare ?? (1 - conifer));
    const deadwood = clamp01(stand.deadwood ?? dead.total);
    const standing = clamp01(dead.standing);
    const fallen = clamp01(dead.fallen);
    const decay = clamp01(dead.decay);
    const cavities = Math.max(0, number(dead.cavityTreesPerHa));
    const edge = Boolean(stand.edge || edgeProfile.active);
    const edgeMantle = clamp01(edgeProfile.mantleCover ?? (edge ? 0.45 : 0));
    const gap = clamp01(structure.canopyGap ?? stand.clearing);
    const clearing = clamp01(stand.clearing ?? gap);
    const herbFood = clamp01(herbProfile.food ?? 0.4);
    const flowering = clamp01(herbProfile.flowering ?? stand.ground?.flowers ?? 0.2);
    const shrub = clamp01(underProfile.shrub ?? stand.understory?.shrub ?? 0.2);
    const sapling = clamp01(underProfile.sapling ?? structure.saplingLayer ?? 0.2);
    const litterDepth = clamp01(number(litterProfile.depthCm, number(stand.ground?.litter, 0.3) * 10) / 12);
    const mycorrhiza = clamp01(soil.mycorrhiza ?? 0.15);
    const decomposition = clamp01(soil.decomposition ?? 0.4);
    const epiphytes = clamp01(structure.epiphyteCover ?? 0.1);
    const moss = clamp01(stand.ground?.moss ?? epiphytes);
    const mast = clamp01(forage.mast ?? 0.25);
    const berries = clamp01(forage.berries ?? stand.understory?.berry ?? 0.1);
    const honey = clamp01(forage.honey ?? 0.2);
    const mushrooms = clamp01(forage.mushrooms ?? stand.ground?.mushrooms ?? 0.1);
    const huntingPressure = clamp01(stand.ground?.huntingPressure);
    const human = clamp01(Math.max(huntingPressure * 0.8, edge ? 0.28 : 0.18,
        (stand.regionalEffects?.work ?? 1) > 1.04 ? 0.35 : 0.15));
    const regionalFauna = clamp01(stand.regionalEffects?.fauna ?? 1);
    const transition = clamp01(stand.regionalTransitionShare);
    const pools = clamp01(stand.tropical?.water?.pools ?? stand.ground?.pools ?? 0);
    const shade = clamp01(1 - (stand.light ?? open));
    const siteFitness = clamp01(health.siteFitness ?? 0.6);
    const pestFactor = clamp01(health.pestFactor ?? 0.5);
    const layers = Math.max(0, number(structure.layers, 2));
    const willowShare = (stand.species || []).reduce((sum, entry) =>
        sum + (/willow|alder|poplar|aspen|birch/i.test(String(entry?.id || '')) ? number(entry.weight, 0.1) : 0), 0);
    const waterBody = wetness > 0.62 || pools > 0.08
        || /floodplain|carr|mangrove|gallery|bog|swamp/i.test(String(stand.type || ''))
        || Boolean(stand.tropical?.water?.floodplain || stand.jungle?.landscape?.hiddenStream);

    // 091 — regional deer. Density is per 100 ha of woodland, not a count on
    // the tile; the herd model converts it into a local carrying capacity.
    const deerSpecies = deerSpeciesFor(stand, climate);
    const deerBase = clamp01(0.16 + edgeMantle * 0.16 + gap * 0.14 + herbFood * 0.18
        + mast * 0.14 + open * 0.12 + shrub * 0.08 + youngStand * 0.05);
    const winterFactor = season.name === 'winter' ? 0.78 : season.name === 'spring' ? 0.95 : 1;
    const deerPreyBase = clamp01(deerBase * winterFactor * (1 - human * 0.35) * regionalFauna);
    const rut = season.name === 'autumn';
    const deerDensity = Math.round((1.5 + deerPreyBase * 24) * 10) / 10;
    const deerHarvest = Math.round(deerDensity * (0.08 + huntingPressure * 0.22) * 10) / 10;
    const browse = clamp01(deerDensity / 26 * 0.5 + deerPreyBase * 0.2 + youngStand * 0.08);
    const winterYard = season.name === 'winter' && deerDensity > 9;

    // Predator guilds are resolved before the final prey pressure so their
    // suppression is a real feedback term rather than a second display value.
    const preyBase = clamp01(0.2 + edgeMantle * 0.16 + open * 0.12 + mast * 0.14
        + herbFood * 0.14 + gap * 0.1 + sapling * 0.08);
    const remoteness = clamp01(1 - human * 1.15);
    const wolfHabitat = clamp01((0.06 + conifer * 0.08 + ancient * 0.12 + remoteness * 0.28
        + preyBase * 0.28 + transition * 0.06 - human * 0.22) * regionalFauna);
    const wolfPresent = forest && wolfHabitat > 0.2;
    const packSize = wolfPresent ? 2 + Math.round(wolfHabitat * 7) : 0;
    const wolf = {
        id: '1.2.23.1.094',
        present: wolfPresent,
        packSize,
        packs: wolfPresent ? 1 : 0,
        territoryKm2: Math.round(70 + (1 - wolfHabitat) * 190),
        huntSuccess: round(clamp01(0.16 + preyBase * 0.42 + wolfHabitat * 0.12)),
        prey: ['deer', 'roe-deer', 'boar', 'moose', 'reindeer'],
        corridorUse: round(clamp01(wolfHabitat * 0.7 + transition * 0.3)),
        livestockRisk: round(clamp01(wolfHabitat * 0.55 * (1 - conifer * 0.2))),
        howlSeason: season.name === 'winter' || season.name === 'spring',
    };
    const bearHabitat = clamp01((ancient * 0.22 + mast * 0.24 + berries * 0.16
        + deadwood * 0.14 + remoteness * 0.18 + (season.name === 'autumn' ? 0.08 : 0)) * 0.62 * regionalFauna);
    const bearPresent = forest && bearHabitat > 0.11;
    const bear = {
        id: '1.2.23.1.093',
        present: bearPresent,
        densityPer100Km2: round(bearPresent ? 0.4 + bearHabitat * 5 : 0, 1),
        denSites: bearPresent ? Math.max(1, Math.round(bearHabitat * 3)) : 0,
        prey: ['deer', 'boar', 'moose'],
        berrySeason: season.name === 'autumn',
        salmonRun: waterBody && season.name === 'autumn',
        danger: round(clamp01(bearHabitat * 0.7 + (season.name === 'autumn' ? 0.15 : 0))),
        cubs: bearPresent && season.name === 'spring',
    };
    const lynxHabitat = clamp01((youngStand * 0.16 + edgeMantle * 0.16 + deadwood * 0.12
        + remoteness * 0.26 + preyBase * 0.24 + transition * 0.06) * 0.72 * regionalFauna);
    const lynxPresent = forest && lynxHabitat > 0.14;
    const lynx = {
        id: '1.2.23.1.095',
        present: lynxPresent,
        densityPer100Km2: round(lynxPresent ? 0.3 + lynxHabitat * 2.6 : 0, 1),
        territoryKm2: Math.round(12 + (1 - lynxHabitat) * 38),
        solitary: true,
        stealth: round(clamp01(0.45 + shade * 0.25 + deadwood * 0.15)),
        prey: ['roe-deer', 'hare', 'squirrel'],
        ambushCover: round(clamp01(deadwood * 0.4 + shrub * 0.3 + youngStand * 0.2)),
    };

    // 096 — raptors are the public indicator of the whole wood. Their pairs
    // follow canopy nest sites, rodents, edge hunting lanes and disturbance.
    const raptorScore = clamp01(0.12 + open * 0.16 + edgeMantle * 0.12
        + Math.min(0.2, cavities / 30 * 0.2) + preyBase * 0.18
        + remoteness * 0.16 + canopy * 0.08);
    const raptors = {
        id: '1.2.23.1.096',
        species: conifer > 0.5 ? ['Goshawk', 'Buzzard', 'Osprey'] : ['Buzzard', 'Kestrel', 'Sparrowhawk'],
        pairs: round(0.4 + raptorScore * 4, 1),
        canopyNesting: round(clamp01(canopy * 0.6 + ancient * 0.2)),
        huntingLanes: round(edgeMantle),
        prey: ['mouse', 'squirrel', 'hare', 'songbird'],
        indicator: pct(clamp01(raptorScore * 0.6 + siteFitness * 0.25 + (1 - pestFactor) * 0.15)),
        forestHealth: pct(clamp01(raptorScore * 0.5 + siteFitness * 0.3 + (1 - human) * 0.2)),
        nestingSeason: season.name === 'spring',
    };

    // 097–099 — cavity nesters, deadwood drummers and the dawn chorus.
    const owlScore = clamp01(0.08 + Math.min(0.35, cavities / 25 * 0.35) + ancient * 0.18
        + deadwood * 0.14 + shade * 0.1 + moisture * 0.06);
    const owls = {
        id: '1.2.23.1.097',
        species: conifer > 0.45 ? ['Tengmalm’s owl', 'Ural owl'] : ['Tawny owl', 'Little owl'],
        pairs: round(0.2 + owlScore * 3, 1),
        hollows: Math.max(0, Math.round(cavities * 0.6)),
        oldTrees: Math.round(ancient * 18 + cavities * 0.4),
        prey: ['mouse', 'squirrel', 'songbird'],
        nightActivity: pct(clamp01(0.5 + owlScore * 0.45)),
        fledgingSeason: season.name === 'spring' || season.name === 'summer',
    };
    const woodpeckerScore = clamp01(0.08 + standing * 0.3 + deadwood * 0.24
        + ancient * 0.2 + Math.min(0.15, cavities / 25 * 0.15));
    const woodpeckers = {
        id: '1.2.23.1.098',
        species: conifer > 0.5 ? ['Three-toed woodpecker', 'Black woodpecker'] : ['Great spotted woodpecker', 'Green woodpecker'],
        pairs: round(0.2 + woodpeckerScore * 3.4, 1),
        standingDeadwoodUse: pct(standing),
        cavitiesExcavated: Math.max(0, Math.round(woodpeckerScore * 9)),
        drumming: pct(clamp01(woodpeckerScore * 0.8 + (season.name === 'spring' ? 0.2 : 0))),
        indicator: pct(woodpeckerScore),
    };
    const songbirdRichness = Math.max(3, Math.min(34, Math.round(3 + layers * 2.2
        + edgeMantle * 6 + flowering * 4 + berries * 3 + ancient * 2 + deadwood * 2
        + (season.name === 'winter' ? -4 : season.name === 'spring' ? 3 : 0))));
    const chorusBase = clamp01(0.18 + flowering * 0.34 + herbFood * 0.18
        + Math.min(0.15, cavities / 40) + edgeMantle * 0.1);
    const chorusSeason = season.name === 'winter' ? 0.06 : season.name === 'spring' ? 1 : season.name === 'summer' ? 0.72 : 0.4;
    const songbirds = {
        id: '1.2.23.1.099',
        speciesRichness: songbirdRichness,
        migrants: Math.round(songbirdRichness * 0.3),
        residents: songbirdRichness - Math.round(songbirdRichness * 0.3),
        chorus: {
            dawn: round(clamp01(chorusBase * chorusSeason * 1.15)),
            midday: round(clamp01(chorusBase * chorusSeason * 0.34)),
            dusk: round(clamp01(chorusBase * chorusSeason * 0.68)),
        },
        chorusWindow: season.name === 'winter' ? 'sparse contact calls'
            : 'dawn 05:00–07:30 · dusk 17:30–19:30',
        seedsEaten: round(clamp01(mast * 0.35 + berries * 0.3)),
        insectsEaten: round(clamp01(0.2 + flowering * 0.3 + deadwood * 0.2)),
    };

    // Water quality is shared by 100, 101, 111, 113 and 114. It is derived from
    // shade, moss, compaction and soil, so a clean shaded brook and a trampled
    // muddy ford cannot report the same value.
    const waterQuality = clamp01(wetness * 0.32 + moss * 0.2 + (1 - clamp01(stand.ground?.compaction)) * 0.16
        + shade * 0.14 + mycorrhiza * 0.1 + (1 - human) * 0.08);
    const beaverScore = clamp01(wetness * 0.38 + willowShare * 0.22 + broadleaf * 0.1
        + (1 - clamp01(stand.height ?? 0.5)) * 0.08 + (waterBody ? 0.12 : 0)
        - human * 0.22);
    const beaverPresent = waterBody && beaverScore > 0.28;
    const beaverColonies = beaverPresent ? 1 + Math.round(beaverScore * 3) : 0;
    const beaverPondsHa = round(beaverColonies * (0.25 + beaverScore * 0.85), 1);
    const beavers = {
        id: '1.2.23.1.100',
        present: beaverPresent,
        colonies: beaverColonies,
        dams: beaverColonies,
        pondsHa: beaverPondsHa,
        waterStorageM3: Math.round(beaverPondsHa * 1100),
        coppiceUse: round(clamp01(willowShare * 0.7 + broadleaf * 0.2)),
        floodRisk: round(clamp01(beaverScore * 0.45 + wetness * 0.2)),
        fishNursery: pct(clamp01(beaverPondsHa > 0 ? 0.4 + waterQuality * 0.4 : 0)),
        willowRegrowth: round(clamp01(willowShare * 0.8 + moisture * 0.2)),
        peltValue: beaverPresent ? 6 : 0,
    };
    const fishScore = clamp01(waterQuality * 0.34 + shade * 0.18 + pools * 0.18
        + wetness * 0.18 + (waterBody ? 0.12 : 0) - clamp01(stand.ground?.compaction) * 0.2);
    const fish = {
        id: '1.2.23.1.113',
        present: waterBody && fishScore > 0.3,
        species: climate === 'tropical' ? ['Characin', 'Cichlid', 'Catfish'] : ['Brown trout', 'Bullhead', 'Minnow'],
        biomassKgHa: round(waterBody ? 4 + fishScore * 46 : 0, 1),
        waterQuality: pct(waterQuality),
        shadeNeed: pct(clamp01(shade * 0.7 + canopy * 0.3)),
        spawning: season.name === 'autumn' || season.name === 'spring',
        pools: Math.round(pools * 6),
    };
    const otterScore = clamp01(waterQuality * 0.4 + fishScore * 0.26 + edgeMantle * 0.12
        + (1 - human) * 0.1 + (waterBody ? 0.12 : 0));
    const otterPresent = waterBody && otterScore > 0.33;
    const otters = {
        id: '1.2.23.1.101',
        present: otterPresent,
        individuals: otterPresent ? round(0.4 + otterScore * 3.6, 1) : 0,
        territoryKm: round(8 + (1 - otterScore) * 22, 1),
        fishShare: pct(clamp01(0.55 + fishScore * 0.3)),
        cleanWaterNeed: pct(clamp01(0.5 + waterQuality * 0.4)),
        spraintSites: otterPresent ? 1 + Math.round(otterScore * 4) : 0,
        waterQuality: pct(waterQuality),
        furValue: otterPresent ? 5 : 0,
    };
    const crayfish = clamp01(waterQuality * 0.45 + shade * 0.15 + fallen * 0.15
        + (1 - clamp01(stand.ground?.compaction)) * 0.15 + (waterBody ? 0.1 : 0));
    const mussels = clamp01(waterQuality * 0.5 + fishScore * 0.2 + moisture * 0.15
        + (waterBody ? 0.15 : 0));
    const waterFilters = {
        id: '1.2.23.1.114',
        crayfish: {
            present: waterBody && crayfish > 0.34,
            populationPerM2: round(waterBody ? crayfish * 4 : 0, 1),
            species: climate === 'tropical' ? 'Freshwater prawn' : 'Noble crayfish',
        },
        mussels: {
            present: waterBody && mussels > 0.36,
            populationPerM2: round(waterBody ? mussels * 6 : 0, 1),
            species: climate === 'tropical' ? 'Freshwater mussel' : 'Freshwater pearl mussel',
            filteredLitresDay: Math.round(waterBody ? mussels * 55 : 0),
        },
        waterQuality: pct(waterQuality),
        indicator: pct(clamp01(waterQuality * 0.6 + fishScore * 0.2 + moss * 0.2)),
        sensitive: crayfish > 0.6 || mussels > 0.6,
    };

    // 092 — boar. Rooting is a real soil disturbance that feeds back into
    // regeneration; mast and earthworms decide how much of the floor is turned.
    const boarScore = clamp01(0.12 + mast * 0.28 + litterDepth * 0.18 + earthworm() * 0.16
        + moisture * 0.12 + shrub * 0.08 + (season.name === 'autumn' ? 0.1 : 0));
    const boarPresent = boarScore > 0.24;
    const boar = {
        id: '1.2.23.1.092',
        present: boarPresent,
        sounderSize: boarPresent ? 3 + Math.round(boarScore * 9) : 0,
        rooting: pct(clamp01(boarScore * 0.6 + litterDepth * 0.2)),
        soilDamage: pct(clamp01(boarScore * 0.55 + wetness * 0.15)),
        mastUse: pct(clamp01(mast * 0.7 + boarScore * 0.2)),
        cropRisk: pct(clamp01(boarScore * 0.45 + edgeMantle * 0.2)),
        farrowingSeason: season.name === 'spring',
        earthworms: pct(earthworm()),
        wallowSites: boarPresent && wetness > 0.5 ? 1 + Math.round(boarScore * 2) : 0,
    };
    function earthworm() {
        return clamp01(0.2 + moisture * 0.3 + litterDepth * 0.25 + (1 - conifer) * 0.15 + mycorrhiza * 0.1);
    }

    // 102–105 — small predators, lagomorphs, rodents and bats.
    const smallPredatorBase = clamp01(0.12 + ancient * 0.16 + deadwood * 0.2
        + Math.min(0.2, cavities / 30 * 0.2) + preyBase * 0.2 + shrub * 0.12);
    const smallPredators = {
        id: '1.2.23.1.102',
        marten: {
            present: forest && smallPredatorBase > 0.28,
            densityPer100Km2: round(smallPredatorBase > 0.28 ? 0.5 + smallPredatorBase * 3 : 0, 1),
            prey: ['mouse', 'squirrel', 'songbird'],
            caching: pct(clamp01(smallPredatorBase * 0.7)),
            furValue: smallPredatorBase > 0.28 ? 3 : 0,
            territoryKm2: Math.round(2 + (1 - smallPredatorBase) * 8),
        },
        weasel: {
            present: forest && (shrub > 0.2 || edgeMantle > 0.3),
            densityPer100Km2: round(0.8 + shrub * 2 + edgeMantle * 2, 1),
            prey: ['mouse', 'rabbit', 'songbird'],
            rodentControl: pct(clamp01(0.3 + shrub * 0.4 + preyBase * 0.2)),
            burrows: Math.max(1, Math.round(1 + shrub * 4)),
        },
        smallPreyRelief: pct(clamp01(smallPredatorBase * 0.5)),
    };
    const hareScore = clamp01(0.18 + open * 0.2 + edgeMantle * 0.18 + herbFood * 0.2
        + (1 - wolfHabitat * 0.3) * 0.1 + gap * 0.08);
    const rabbitScore = clamp01(0.08 + edgeMantle * 0.18 + open * 0.16 + (1 - moisture) * 0.18
        + herbFood * 0.16 + human * 0.1 + (1 - conifer) * 0.08);
    const lagomorphs = {
        id: '1.2.23.1.103',
        hare: {
            densityPer100Ha: round(1 + hareScore * 12, 1),
            leverets: season.name === 'spring' || season.name === 'summer' ? 2 : 0,
            openEdge: pct(edgeMantle),
            prey: ['wolf', 'lynx', 'raptor', 'fox'],
        },
        rabbit: {
            present: rabbitScore > 0.3 && (edge || gap > 0.2),
            warrens: rabbitScore > 0.3 ? 1 + Math.round(rabbitScore * 7) : 0,
            culturalFollower: pct(clamp01(rabbitScore * 0.7 + human * 0.3)),
            cropDamage: pct(clamp01(rabbitScore * 0.4 + edgeMantle * 0.2)),
            prey: ['fox', 'raptor', 'weasel'],
        },
    };
    const rodentScore = clamp01(0.16 + mast * 0.28 + litterDepth * 0.22 + fallen * 0.12
        + shrub * 0.12 + mycorrhiza * 0.06);
    const seedCacheKgHa = round(1.5 + rodentScore * 38, 1);
    const rodents = {
        id: '1.2.23.1.104',
        species: ['Wood mouse', 'Bank vole', 'Red squirrel', 'Hazel dormouse'],
        abundance: pct(rodentScore),
        seedCacheKgHa,
        cachedSpecies: mast > 0.35 ? ['acorns', 'beechnuts', 'hazelnuts'] : ['seeds', 'berries'],
        seedDispersal: pct(clamp01(seedCacheKgHa / 40 * 0.55 + (season.name === 'winter' ? 0.1 : 0.3))),
        mastYearResponse: pct(clamp01(mast * 0.8 + boarScore * 0.2)),
        owlPrey: pct(clamp01(rodentScore * 0.7 + 0.2)),
        hoards: Math.max(1, Math.round(rodentScore * 9)),
    };
    const batScore = clamp01(0.08 + Math.min(0.3, cavities / 30 * 0.3) + ancient * 0.18
        + deadwood * 0.18 + clamp01(0.2 + flowering * 0.3 + deadwood * 0.2) * 0.2 + waterBody * 0.06);
    const bats = {
        id: '1.2.23.1.105',
        species: ['Daubenton’s bat', 'Brown long-eared bat', 'Noctule'],
        colony: forest && batScore > 0.26,
        roosts: Math.max(0, Math.round(cavities * 0.5 + ancient * 4)),
        nurseryRoosts: Math.max(0, Math.round(cavities * 0.2 + ancient * 2)),
        nightlyInsectKg: round(batScore * 0.8, 2),
        hibernacula: Math.max(0, Math.round(ancient * 3 + deadwood * 2)),
        activity: season.name === 'winter' ? 'hibernating' : season.name === 'summer' ? 'nursery' : 'foraging',
        waterTrapline: waterBody,
    };

    // 106–110 — the insect community. Pollination, pest pressure and insect
    // biomass are three separate values; a flower-rich wood can feed birds
    // without becoming a bark-beetle outbreak.
    const pollinatorIndex = clamp01(flowering * 0.34 + herbFood * 0.2 + edgeMantle * 0.14
        + moisture * 0.1 + broadleaf * 0.08 + (1 - pestFactor) * 0.08);
    const pestIndex = clamp01(conifer * 0.2 + (1 - moisture) * 0.22 + density * 0.18
        + clamp01(health.droughtStress) * 0.16 + (stand.disturbance === 'bark-beetle' ? 0.24 : 0)
        - clamp01(health.diseaseResistance) * 0.16);
    const insectBiomass = clamp01(0.16 + deadwood * 0.24 + flowering * 0.2
        + litterDepth * 0.16 + moisture * 0.1 + broadleaf * 0.08);
    const insects = {
        id: '1.2.23.1.106',
        speciesRichness: Math.round(40 + pollinatorIndex * 180 + deadwood * 120 + moisture * 60),
        pollinators: pct(pollinatorIndex),
        pests: pct(pestIndex),
        foodForBirdsKgHa: round(1 + insectBiomass * 18, 1),
        decomposers: pct(clamp01(decomposition * 0.6 + deadwood * 0.4)),
        aquaticInsects: pct(clamp01(wetness * 0.4 + waterBody * 0.3 + shade * 0.2)),
        flowerVisitors: pct(clamp01(flowering * 0.6 + edgeMantle * 0.2)),
    };
    const antScore = clamp01(0.14 + litterDepth * 0.28 + canopy * 0.18 + moisture * 0.14
        + broadleaf * 0.1 + (1 - pestIndex) * 0.08);
    const ants = {
        id: '1.2.23.1.107',
        moundsPerHa: Math.round(3 + antScore * 26),
        soilTurnoverKgHaYear: Math.round(80 + antScore * 720),
        pestDefence: pct(clamp01(antScore * 0.55 + predatorRelief() * 0.2)),
        aphidTending: pct(clamp01(antScore * 0.4 + flowering * 0.2)),
        protected: antScore > 0.62,
        swarming: season.name === 'summer' && antScore > 0.45,
        prey: ['insect larvae', 'beetle grubs'],
    };
    function predatorRelief() {
        return clamp01(1 - pestIndex * 0.6);
    }
    const wildBeeScore = clamp01(0.1 + deadwood * 0.24 + standing * 0.14 + flowering * 0.22
        + edgeMantle * 0.12 + (1 - human) * 0.1 + (1 - conifer) * 0.08);
    const wildBees = {
        id: '1.2.23.1.108',
        speciesRichness: Math.round(6 + wildBeeScore * 44),
        deadwoodNesters: pct(clamp01(standing * 0.5 + deadwood * 0.3)),
        groundNesters: pct(clamp01((1 - litterDepth) * 0.4 + gap * 0.2 + edgeMantle * 0.2)),
        cavityNesters: pct(clamp01(Math.min(0.4, cavities / 30) + ancient * 0.2)),
        pollinationShare: pct(clamp01(wildBeeScore * 0.65 + pollinatorIndex * 0.2)),
        nestingSites: Math.max(1, Math.round(wildBeeScore * 14)),
        honeyPotential: pct(clamp01(wildBeeScore * 0.5 + honey * 0.3)),
    };
    const butterflyScore = clamp01(flowering * 0.32 + edgeMantle * 0.2 + gap * 0.16
        + (1 - canopy) * 0.12 + herbFood * 0.12 + moisture * 0.08);
    const butterflies = {
        id: '1.2.23.1.109',
        speciesRichness: Math.round(3 + butterflyScore * 26),
        flightWeeks: season.name === 'winter' ? 0 : Math.round(6 + butterflyScore * 12),
        nectarSources: Math.round(2 + flowering * 9),
        brood: season.name === 'spring' ? 'first brood' : season.name === 'summer' ? 'second brood' : season.name === 'autumn' ? 'overwintering larvae' : 'hibernating',
        seasonalColour: season.name === 'winter' ? 0 : Math.round(20 + butterflyScore * 70),
        migrants: Math.round(butterflyScore * 6),
        caterpillars: pct(clamp01(butterflyScore * 0.5 + herbFood * 0.3)),
    };
    const deadwoodBeetleScore = clamp01(0.06 + deadwood * 0.3 + decay * 0.3 + ancient * 0.2
        + Math.min(0.14, cavities / 40 * 0.14));
    const deadwoodBeetles = {
        id: '1.2.23.1.110',
        speciesRichness: Math.round(4 + deadwoodBeetleScore * 38),
        oldGrowthIndicator: pct(deadwoodBeetleScore),
        deadwoodNeed: pct(clamp01(deadwood * 0.7 + decay * 0.3)),
        saproxylicShare: pct(clamp01(0.2 + deadwoodBeetleScore * 0.65)),
        redListed: Math.round(deadwoodBeetleScore * 7),
        flightSeason: season.name === 'winter' ? 'larvae in deadwood' : 'spring to autumn',
    };

    // 111–114 — wet hollows, sunny basking sites and clean water.
    const amphibianScore = clamp01(wetness * 0.32 + pools * 0.28 + moisture * 0.14
        + shade * 0.08 + gap * 0.06 - fishScore * 0.12);
    const amphibians = {
        id: '1.2.23.1.111',
        present: waterBody && amphibianScore > 0.3,
        species: ['Common frog', 'Moor frog', 'Smooth newt', 'Fire salamander'],
        pools: Math.max(0, Math.round(pools * 8 + (wetness > 0.7 ? 2 : 0))),
        chorusSeason: season.name === 'spring' ? 'spawning chorus' : season.name === 'winter' ? 'hibernating' : 'quiet',
        moistureNeed: pct(clamp01(0.55 + moisture * 0.35)),
        juvenileSurvival: pct(clamp01(0.3 + moisture * 0.4 - fishScore * 0.2)),
        fishPredation: pct(clamp01(fishScore * 0.5)),
    };
    const reptileScore = clamp01(gap * 0.26 + edgeMantle * 0.2 + open * 0.18
        + (1 - moisture) * 0.2 + (1 - canopy) * 0.12);
    const reptiles = {
        id: '1.2.23.1.112',
        species: climate === 'tropical' ? ['Anole', 'Forest skink', 'Boa'] : ['Common lizard', 'Slow worm', 'Grass snake'],
        abundance: pct(reptileScore),
        baskingSites: Math.max(0, Math.round(clearing * 6 + edgeMantle * 3 + open * 2)),
        sunnyClearings: Math.max(0, Math.round(clearing * 5 + (edge ? 1 : 0))),
        winterRefuge: 'leaf litter and root voids',
        eggLaying: season.name === 'spring' || season.name === 'summer',
    };

    // 115–116 — fungi and cryptogams.
    const fungiScore = clamp01(mycorrhiza * 0.28 + decomposition * 0.3 + deadwood * 0.18
        + moisture * 0.14 + (season.name === 'autumn' ? 0.12 : 0));
    const fungi = {
        id: '1.2.23.1.115',
        speciesRichness: Math.round(12 + fungiScore * 160),
        edible: pct(clamp01(fungiScore * 0.55 + mycorrhiza * 0.2)),
        medicinal: pct(clamp01(fungiScore * 0.3 + ancient * 0.2)),
        decomposers: pct(clamp01(decomposition * 0.6 + deadwood * 0.3)),
        mycorrhizal: pct(clamp01(mycorrhiza * 0.7 + siteFitness * 0.2)),
        fruiting: season.name === 'autumn' ? 'main flush' : season.name === 'winter' ? 'dormant' : 'scattered',
        yieldKgHa: round(season.name === 'winter' ? 0.2 : 0.6 + fungiScore * 7, 1),
    };
    const mossScore = clamp01(moisture * 0.3 + epiphytes * 0.26 + ancient * 0.18
        + shade * 0.14 + (1 - human) * 0.08);
    const mossLichen = {
        id: '1.2.23.1.116',
        mossCover: pct(mossScore),
        lichenCover: pct(clamp01(epiphytes * 0.7 + open * 0.1 + ancient * 0.1)),
        humidityIndicator: pct(clamp01(moisture * 0.45 + mossScore * 0.4 + shade * 0.15)),
        oldGrowthIndicator: pct(clamp01(ancient * 0.4 + epiphytes * 0.35 + mossScore * 0.25)),
        speciesRichness: Math.round(8 + mossScore * 42),
        airQuality: pct(clamp01(0.35 + (1 - human) * 0.4 + epiphytes * 0.25)),
        desiccationRisk: pct(clamp01((1 - moisture) * 0.6 + (1 - shade) * 0.25)),
    };

    // 117 — parasites are host-specific. A dense deer herd carries ticks; wet
    // ground carries liver fluke; a crowded fox population carries mange.
    const tickLoad = clamp01(deerDensity / 26 * 0.6 + shrub * 0.15 + moisture * 0.1);
    const parasites = {
        id: '1.2.23.1.117',
        load: pct(tickLoad),
        hosts: [
            { host: 'deer', parasite: 'Deer tick', load: pct(clamp01(tickLoad * 0.85)) },
            { host: 'boar', parasite: 'Liver fluke', load: pct(clamp01(wetness * 0.5 + boarScore * 0.25)) },
            { host: 'fox', parasite: 'Sarcoptic mange', load: pct(clamp01(smallPredatorBase * 0.4 + density * 0.2)) },
            { host: 'songbird', parasite: 'Feather mite', load: pct(clamp01(0.2 + songbirdRichness / 34 * 0.4)) },
        ],
        ticksPerDeer: Math.round(tickLoad * 18),
        liverFlukeRisk: pct(clamp01(wetness * 0.55 + pools * 0.2)),
        mangeRisk: pct(clamp01(smallPredatorBase * 0.5 + (1 - siteFitness) * 0.2)),
        herdCondition: pct(clamp01(1 - tickLoad * 0.35 - (1 - siteFitness) * 0.2)),
        biodiversityBrake: pct(clamp01((1 - tickLoad) * 0.5 + preyBase * 0.3)),
    };

    // 118 — scavengers. Carcass removal is a real nutrient path, faster in
    // warm, open woods and slower in cold, closed ones.
    const scavengerScore = clamp01(0.2 + open * 0.18 + edgeMantle * 0.14 + human * 0.1
        + (season.name === 'winter' ? -0.08 : 0.06));
    const scavengers = {
        id: '1.2.23.1.118',
        species: ['Red fox', 'Raven', 'Carrion beetle', 'Wild boar'],
        abundance: pct(scavengerScore),
        carcassRemovalDays: Math.max(2, Math.round(16 - moisture * 5 - (season.name === 'summer' ? 4 : 0) + (1 - scavengerScore) * 6)),
        nutrientReturnKgHaYear: round(0.4 + scavengerScore * 4.6, 1),
        carcassSites: Math.max(0, Math.round(huntingPressure * 5)),
        diseaseCleanup: pct(clamp01(scavengerScore * 0.7)),
        winterReliance: season.name === 'winter' ? pct(clamp01(scavengerScore * 0.6 + 0.2)) : 0,
    };

    // 119 — deterministic predator-prey cycles. The phase comes from the
    // stand's own coordinates and the simulation year, so two visits to the
    // same wood in the same year always agree, and a save reload cannot shift
    // the cycle.
    const year = Math.floor(number(options.day ?? stand.dayOfYear ?? 150) / 400);
    const lynxCycle = cycleAt(seed, tx, ty, year, 9, 0x4c594e58);
    const voleCycle = cycleAt(seed, tx, ty, year, 4, 0x564f4c45);
    const mastCycle = cycleAt(seed, tx, ty, year, 5 + hash32(seed, tx, ty, 0x4d415354) % 3, 0x4d415354);
    const cycles = {
        id: '1.2.23.1.119',
        hareLynx: {
            phase: lynxCycle.phase,
            label: lynxCycle.label,
            periodYears: 9,
            amplitude: round(0.25 + lynxCycle.value * 0.3, 2),
            hareIndex: pct(clamp01(0.3 + lynxCycle.value * 0.6)),
            lynxIndex: pct(clamp01(0.2 + (1 - Math.abs(lynxCycle.value - 0.55) * 2) * 0.6)),
        },
        voleOwl: {
            phase: voleCycle.phase,
            label: voleCycle.label,
            periodYears: 4,
            amplitude: round(0.2 + voleCycle.value * 0.35, 2),
            voleIndex: pct(clamp01(0.25 + voleCycle.value * 0.65)),
            owlIndex: pct(clamp01(0.25 + (1 - Math.abs(voleCycle.value - 0.6) * 2) * 0.6)),
        },
        mast: {
            phase: mastCycle.phase,
            label: mastCycle.label,
            periodYears: 5 + hash32(seed, tx, ty, 0x4d415354) % 3,
            amplitude: round(0.3 + mastCycle.value * 0.4, 2),
            cropIndex: pct(clamp01(mast * 0.5 + mastCycle.value * 0.5)),
        },
        predationPressure: pct(clamp01(wolfHabitat * 0.3 + lynxHabitat * 0.2 + bearHabitat * 0.14 + raptorScore * 0.1)),
        herbivorePressure: pct(clamp01(browse * 0.7 + boar.rooting / 100 * 0.3)),
    };

    // 120 — corridors. A wood is connected through its edge, its canopy, its
    // water and its regional transition belt, not through a separate graph.
    const corridorQuality = clamp01(edgeMantle * 0.18 + canopy * 0.12 + deadwood * 0.12
        + moisture * 0.1 + transition * 0.24 + (1 - human) * 0.14 + gap * 0.1);
    const corridors = {
        id: '1.2.23.1.120',
        quality: pct(corridorQuality),
        connectivity: pct(clamp01(corridorQuality * 0.7 + transition * 0.3)),
        nearestWoodKm: round(0.3 + (1 - corridorQuality) * 4.2, 1),
        links: Math.max(0, Math.round(corridorQuality * 4 + transition * 2)),
        pinchPoints: [
            ...(human > 0.4 ? ['settlement edge'] : []),
            ...(gap > 0.4 ? ['canopy gap'] : []),
            ...(waterBody ? ['stream crossing'] : []),
        ],
        direction: ['north', 'east', 'south', 'west'][hash32(seed, tx, ty, 0x434f5252) % 4],
        targetRegionalType: stand.regionalTransitionLabel || stand.regionalLabel || null,
        migration: pct(clamp01(corridorQuality * 0.6 + season.name === 'spring' ? 0.15 : season.name === 'autumn' ? 0.12 : 0)),
        roadBarrier: human > 0.5 ? 'fragmented' : human > 0.3 ? 'filtered' : 'permeable',
    };

    // The shared food web is a bounded list of guilds, not an agent list. It
    // gives the player one readable map of who eats whom in this wood.
    const foodWeb = buildFoodWeb({
        plants: clamp01(herbFood * 0.6 + canopy * 0.4),
        seeds: clamp01(mast * 0.6 + berries * 0.2 + 0.1),
        insects: insectBiomass,
        rodents: rodentScore,
        lagomorphs: clamp01(hareScore * 0.6 + rabbitScore * 0.4),
        deer: clamp01(deerDensity / 26),
        boar: boarScore,
        fish: fishScore,
        amphibians: amphibianScore,
        birds: clamp01(songbirdRichness / 34),
        raptors: raptorScore,
        owls: owlScore,
        wolves: wolfHabitat,
        lynx: lynxHabitat,
        bears: bearHabitat,
        otters: otterScore,
        carrion: clamp01(huntingPressure * 0.8 + 0.1),
    });

    const indicators = {
        forestHealth: pct(clamp01(siteFitness * 0.3 + (1 - pestIndex) * 0.25 + canopy * 0.15
            + deadwood * 0.15 + biodiversityIndex() * 0.15)),
        waterQuality: pct(waterQuality),
        deadwoodContinuity: pct(deadwoodBeetleScore),
        oldGrowth: pct(clamp01(ancient * 0.5 + cavities / 30 * 0.2 + deadwood * 0.2 + epiphytes * 0.1)),
        biodiversity: pct(biodiversityIndex()),
        raptorIndex: raptors.indicator,
        mossHumidity: mossLichen.humidityIndicator,
        connectivity: corridors.connectivity,
    };
    function biodiversityIndex() {
        return clamp01(0.2 + songbirdRichness / 34 * 0.2 + pollinatorIndex * 0.12
            + deadwoodBeetleScore * 0.14 + amphibianScore * 0.08 + fungiScore * 0.08
            + raptorScore * 0.08 + (1 - pestIndex) * 0.1);
    }

    const signals = {
        browsing: round(browse),
        rooting: round(boar.rooting / 100),
        predation: round(clamp01(wolfHabitat * 0.35 + lynxHabitat * 0.25
            + bearHabitat * 0.15 + raptorScore * 0.1 + smallPredatorBase * 0.15)),
        waterQuality: round(waterQuality),
        pollination: round(pollinatorIndex),
        pestControl: round(clamp01(antScore * 0.4 + raptorScore * 0.3 + rodentScore * 0.1)),
        seedDispersal: round(clamp01(seedCacheKgHa / 40 * 0.6 + 0.1)),
        fishYield: round(fishScore * 0.8),
        mushroomYield: round(fungiScore),
        honeyYield: round(clamp01(wildBeeScore * 0.5 + pollinatorIndex * 0.3 + honey * 0.2)),
        gameYield: round(clamp01(deerPreyBase * 0.7 + boarScore * 0.2)),
        corridor: round(corridorQuality),
        cyclePhase: round(lynxCycle.value),
        parasiteLoad: round(tickLoad),
        scavenging: round(scavengerScore),
        biodiversity: round(biodiversityIndex()),
        beaver: round(beaverScore),
        fish: round(fishScore),
        boar: round(boarScore),
        deer: round(deerPreyBase),
        wolf: round(wolfHabitat),
        bear: round(bearHabitat),
        lynx: round(lynxHabitat),
        raptor: round(raptorScore),
    };

    const products = {
        venisonKgHa: round(deerDensity * (rut ? 1.25 : 1) * 0.32, 1),
        boarKgHa: round(boarScore * 3.4, 1),
        fishKgHa: round(fish.biomassKgHa * 0.08, 1),
        honeyKgHa: round(clamp01(wildBeeScore * 0.5 + pollinatorIndex * 0.3) * 2.4, 1),
        mushroomsKgHa: fungi.yieldKgHa,
        antlerKgHa: round(deerDensity * 0.015, 2),
        furValue: Math.round((smallPredators.marten.furValue || 0) + (otters.furValue || 0) + (beavers.peltValue || 0)),
        crayfishKgHa: round(waterBody ? crayfish * 0.9 : 0, 1),
        musselIndicator: waterFilters.indicator,
        beaverWaterM3: beavers.waterStorageM3,
        seedDispersal: rodents.seedDispersal,
    };

    const pressures = {
        browsing: pct(browse),
        rooting: boar.rooting,
        barkBeetle: pct(pestIndex),
        beaverFlood: beavers.floodRisk,
        predation: signals.predation * 100,
        parasites: parasites.load,
        humanDisturbance: pct(human),
        rabbitDamage: lagomorphs.rabbit.cropDamage,
        livestockRisk: wolf.livestockRisk,
    };

    const community = buildCommunity({
        deerSpecies, deerPresent: deerDensity > 2,
        bear, wolf, lynx, raptors, owls, woodpeckers, songbirds,
        beavers, otters, lagomorphs, rodents, bats, insects,
        boar, season,
    });

    const record = {
        id: '1.2.23.1.091–120',
        season: season.name,
        day: season.day,
        forest,
        deer: {
            id: '1.2.23.1.091',
            species: deerSpecies.map(([id, label, latin, share, diet]) => ({
                id, label, latin, share, diet,
                weightKg: id === 'moose' ? 380 : id === 'reindeer' ? 120 : id === 'red-deer' ? 180
                    : id === 'fallow-deer' ? 85 : id === 'greater-kudu' ? 210 : id === 'impala' ? 55
                        : id === 'sambar' ? 230 : id === 'chital' ? 75 : id === 'black-tailed-deer' ? 90 : 28,
            })),
            primary: deerSpecies[0]?.[1] || 'Red deer',
            densityPer100Ha: deerDensity,
            browsePressure: pct(browse),
            rutSeason: rut,
            antlerGrowth: season.name === 'spring' || season.name === 'summer',
            winterYard,
            winterMortality: pct(clamp01(0.08 + (1 - siteFitness) * 0.1 + (season.name === 'winter' ? 0.08 : 0))),
            hunting: {
                quotaPer100Ha: deerHarvest,
                trophyQuality: pct(clamp01(0.4 + siteFitness * 0.3 + ancient * 0.2)),
                pressure: pct(huntingPressure),
            },
            predators: wolfPresent ? 'wolf' : lynxPresent ? 'lynx' : bearPresent ? 'bear' : 'none',
        },
        boar,
        bear,
        wolf,
        lynx,
        raptors,
        owls,
        woodpeckers,
        songbirds,
        beavers,
        otters,
        smallPredators,
        lagomorphs,
        rodents,
        bats,
        insects,
        ants,
        wildBees,
        butterflies,
        deadwoodBeetles,
        amphibians,
        reptiles,
        fish,
        waterFilters,
        fungi,
        mossLichen,
        parasites,
        scavengers,
        cycles,
        corridors,
        foodWeb,
        indicators,
        pressures,
        products,
        signals,
        community,
    };
    record.headline = buildHeadline(record);
    record.summary = buildSummary(record);
    return record;
}

function cycleAt(seed, x, y, year, period, salt) {
    const offset = hash32(seed, x, y, salt) % 1000 / 1000;
    const phase = (((Number(year) || 0) + offset * period) % period + period) % period / period;
    const value = 0.5 + 0.5 * Math.sin((phase - 0.25) * Math.PI * 2);
    const label = value < 0.2 ? 'trough' : value < 0.45 ? 'building' : value < 0.72 ? 'peak' : 'decline';
    return { phase: round(phase, 3), value: round(value, 3), label };
}

function buildFoodWeb(biomass) {
    const nodes = [
        ['plants', 'Plant layer', 1, 0.9],
        ['seeds', 'Seeds and mast', 1, 0.5],
        ['insects', 'Insects', 2, 0.7],
        ['rodents', 'Rodents', 3, 0.6],
        ['lagomorphs', 'Hares and rabbits', 3, 0.5],
        ['deer', 'Deer', 3, 0.8],
        ['boar', 'Wild boar', 3, 0.7],
        ['fish', 'Fish', 3, 0.5],
        ['amphibians', 'Amphibians', 3, 0.4],
        ['birds', 'Songbirds', 3, 0.5],
        ['raptors', 'Raptors', 4, 0.35],
        ['owls', 'Owls', 4, 0.3],
        ['wolves', 'Wolves', 5, 0.3],
        ['lynx', 'Lynx', 5, 0.25],
        ['bears', 'Bears', 5, 0.2],
        ['otters', 'Otters', 4, 0.3],
        ['carrion', 'Carrion', 2, 0.2],
    ].map(([id, label, level, fallback]) => ({
        id, label, level, biomass: pct(biomass[id] ?? fallback),
    })).filter(node => node.biomass > 0);
    const links = [
        ['plants', 'deer', 'browse'], ['plants', 'boar', 'rooting'],
        ['seeds', 'rodents', 'cache'], ['seeds', 'boar', 'mast'],
        ['plants', 'lagomorphs', 'graze'], ['plants', 'insects', 'nectar'],
        ['insects', 'birds', 'prey'], ['insects', 'bats', 'prey'],
        ['insects', 'amphibians', 'prey'], ['insects', 'fish', 'drift'],
        ['rodents', 'owls', 'prey'], ['rodents', 'raptors', 'prey'],
        ['lagomorphs', 'lynx', 'prey'], ['lagomorphs', 'raptors', 'prey'],
        ['deer', 'wolves', 'prey'], ['deer', 'bears', 'prey'],
        ['deer', 'lynx', 'prey'], ['boar', 'wolves', 'prey'],
        ['boar', 'bears', 'prey'], ['fish', 'otters', 'prey'],
        ['amphibians', 'otters', 'prey'], ['birds', 'raptors', 'prey'],
        ['carrion', 'bears', 'scavenge'], ['carrion', 'raptors', 'scavenge'],
        ['carrion', 'insects', 'decompose'],
    ];
    const present = new Set(nodes.map(node => node.id));
    return {
        nodes,
        links: links.filter(([from, to]) => present.has(from) && present.has(to))
            .map(([from, to, type]) => ({ from, to, type })),
        keystone: nodes.some(node => node.id === 'wolves') ? 'Wolves and lynx'
            : nodes.some(node => node.id === 'raptors') ? 'Raptors and owls'
                : 'Insectivorous birds',
        levels: nodes.reduce((counts, node) => {
            counts[node.level] = (counts[node.level] || 0) + 1;
            return counts;
        }, {}),
        richness: nodes.length,
    };
}

function buildCommunity({ deerSpecies, deerPresent, bear, wolf, lynx, raptors, owls, woodpeckers,
    songbirds, beavers, otters, lagomorphs, rodents, bats, insects, boar, season }) {
    const community = [];
    if (deerPresent) {
        for (const entry of deerSpecies) {
            // The renderer has shapes for the shared deer/roe-deer/moose/
            // reindeer markers. A sambar still uses the deer silhouette; the
            // survey names the exact regional species.
            const marker = entry[0] === 'roe-deer' ? 'roe-deer'
                : entry[0] === 'moose' ? 'moose'
                    : entry[0] === 'reindeer' ? 'reindeer' : 'deer';
            community.push(marker);
        }
    }
    if (boar.present) community.push('boar');
    if (bear.present) community.push('bear');
    if (wolf.present) community.push('wolf');
    if (lynx.present) community.push('lynx');
    if (raptors.pairs >= 1) community.push('raptor');
    if (owls.pairs >= 1) community.push('owl');
    if (woodpeckers.pairs >= 1) community.push('woodpecker');
    if (songbirds.speciesRichness >= 6 && season.name !== 'winter') community.push('songbird');
    if (beavers.present) community.push('beaver');
    if (otters.present) community.push('otter');
    if (lagomorphs.hare.densityPer100Ha >= 4) community.push('hare');
    if (lagomorphs.rabbit.present) community.push('rabbit');
    if (rodents.abundance >= 40) community.push('squirrel');
    if (rodents.abundance >= 55) community.push('mouse');
    if (bats.colony && season.name !== 'winter') community.push('bat');
    if (insects.pollinators >= 40 && season.name !== 'winter') community.push('butterfly');
    if (insects.pollinators >= 45 && season.name !== 'winter') community.push('bee');
    if (insects.foodForBirdsKgHa >= 6 && season.name !== 'winter') community.push('ant');
    if (insects.decomposers >= 35) community.push('beetle');
    return [...new Set(community)];
}

function buildHeadline(record) {
    const deer = record.deer;
    const bits = [deer.primary + ' ' + Math.round(deer.densityPer100Ha) + '/100ha'];
    if (record.boar.present) bits.push('boar ' + record.boar.sounderSize);
    if (record.wolf.present) bits.push('wolf pack ' + record.wolf.packSize);
    if (record.bear.present) bits.push('bear');
    if (record.beavers.present) bits.push('beaver ' + record.beavers.colonies);
    if (record.otters.present) bits.push('otter ' + record.otters.individuals);
    bits.push(record.indicators.forestHealth + '% health');
    return bits.join(' · ');
}

function buildSummary(record) {
    const bits = [record.headline];
    bits.push('raptors ' + record.raptors.pairs + ' pairs · owls ' + record.owls.pairs
        + ' · woodpeckers ' + record.woodpeckers.pairs);
    bits.push('insects ' + record.insects.speciesRichness + ' species · pollinators '
        + record.insects.pollinators + '% · pests ' + record.insects.pests + '%');
    bits.push('water ' + record.indicators.waterQuality + '% · fish '
        + record.fish.biomassKgHa + ' kg/ha · mussels ' + record.waterFilters.mussels.populationPerM2 + '/m²');
    bits.push('cycle ' + record.cycles.hareLynx.label + ' · corridor '
        + record.corridors.quality + '%');
    return bits.join(' · ');
}

// A compact, human-readable line for the inspector. It names the values that
// change a decision: game, water, pollinators, pests, cycle and corridor.
export function forestFaunaEcologySummary(record) {
    if (!record) return '';
    return [
        record.deer.primary + ' ' + record.deer.densityPer100Ha + '/100 ha',
        'browse ' + record.deer.browsePressure + '%',
        'boar rooting ' + record.boar.rooting + '%',
        (record.wolf.present ? 'wolf pack ' + record.wolf.packSize : 'no wolf pack'),
        (record.bear.present ? 'bear ' + record.bear.densityPer100Km2 + '/100 km²' : 'no bear'),
        'beaver ' + record.beavers.colonies,
        'otter ' + record.otters.individuals,
        'fish ' + record.fish.biomassKgHa + ' kg/ha',
        'pollinators ' + record.insects.pollinators + '%',
        'pests ' + record.insects.pests + '%',
        'water ' + record.indicators.waterQuality + '%',
        'cycle ' + record.cycles.hareLynx.phase + ' ' + record.cycles.hareLynx.label,
        'corridor ' + record.corridors.quality + '%',
    ].join(' · ');
}
