// Deterministic forest ecology shared by the terrain renderer, resource
// geography and the forest survey. It deliberately has no game-state import:
// the same tile inputs always produce the same stand, whether it is drawn,
// harvested or audited in a test.
//
// A stand is more than a tree chance. It names a formation (oakwood, beechwood,
// birch grove, ...), a species mix, an age structure, a disturbance history and
// the understorey/ground layers that make a forest floor readable. Patches are
// coarse enough to form real stands, while the per-tile hash keeps neighbouring
// trees from sharing one silhouette.

import { seasonalState } from './season.js';

const clamp01 = value => Math.max(0, Math.min(1, value));

function mix(a, b, amount) {
    const t = clamp01(amount);
    return a + (b - a) * t;
}

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unitHash(seed, x, y, salt = 0) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

function coarseUnit(seed, x, y, cell, salt) {
    const size = Math.max(1, Math.floor(cell));
    return unitHash(seed, Math.floor(x / size), Math.floor(y / size), salt);
}

function wave(x, y, seed, scale, salt) {
    const phase = (Number(seed) % 10000) / 10000 * Math.PI * 2;
    const a = Math.sin((x * 0.73 + y * 0.41) * scale + phase + (salt % 17) * 0.37);
    const b = Math.cos((x * 0.29 - y * 0.61) * scale * 1.17 - phase * 0.7 + (salt % 11) * 0.61);
    return clamp01((a * 0.58 + b * 0.42 + 1) / 2);
}

function weightedPick(weights, roll) {
    const entries = Object.entries(weights || {});
    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    if (!total) return entries[0]?.[0] || 'oak';
    let cursor = clamp01(Number(roll) || 0) * total;
    for (const [id, weight] of entries) {
        cursor -= Math.max(0, weight);
        if (cursor <= 0) return id;
    }
    return entries[entries.length - 1][0];
}

// Visual and ecological species definitions. The renderer only needs the bark,
// crown palette and form; gameplay needs the wood/goods weighting.
export const FOREST_SPECIES = Object.freeze({
    oak: Object.freeze({
        id: 'oak', label: 'Oak', latin: 'Quercus',
        bark: '#5b432d', barkLight: '#80613e',
        summer: ['#2d5c31', '#4c8b42'], autumn: ['#9a5f2c', '#c08444'],
        form: 'spreading', height: 1.12, crown: 1.08, trunk: 1.2, lobes: 3,
        timber: 1.28, firewood: 1.18, charcoal: 1.32,
        goods: ['acorns', 'truffles', 'bark'], understory: ['fern', 'bramble'],
    }),
    beech: Object.freeze({
        id: 'beech', label: 'Beech', latin: 'Fagus',
        bark: '#8e8a7d', barkLight: '#b2ad9b',
        summer: ['#2b6134', '#4c8f42'], autumn: ['#a86f2f', '#c79a4b'],
        form: 'dome', height: 1.1, crown: 1.02, trunk: 0.96, lobes: 2,
        timber: 1.1, firewood: 1.24, charcoal: 1.14,
        goods: ['beechnuts', 'mushrooms'], understory: ['fern', 'moss'],
    }),
    birch: Object.freeze({
        id: 'birch', label: 'Birch', latin: 'Betula',
        bark: '#e8e2d3', barkLight: '#f6f1e5',
        summer: ['#5d963f', '#86ba5b'], autumn: ['#c9a83a', '#e0c25a'],
        form: 'airy', height: 1.02, crown: 0.78, trunk: 0.62, lobes: 2,
        timber: 0.78, firewood: 1.1, charcoal: 0.9,
        goods: ['birch-sap', 'mushrooms'], understory: ['heather', 'fern'],
    }),
    maple: Object.freeze({
        id: 'maple', label: 'Maple', latin: 'Acer',
        bark: '#68655a', barkLight: '#8f8b7a',
        summer: ['#346a33', '#5b9b47'], autumn: ['#b65a2e', '#d89a3d'],
        form: 'round', height: 1.04, crown: 0.94, trunk: 0.86, lobes: 4,
        timber: 0.96, firewood: 1.04, charcoal: 1.02,
        goods: ['maple-syrup', 'mushrooms'], understory: ['fern', 'bramble'],
    }),
    chestnut: Object.freeze({
        id: 'chestnut', label: 'Chestnut', latin: 'Castanea',
        bark: '#6e5138', barkLight: '#9a7550',
        summer: ['#2f6335', '#4f9444'], autumn: ['#a85d2d', '#cf8f3d'],
        form: 'spreading', height: 1.08, crown: 1.0, trunk: 1.04, lobes: 3,
        timber: 0.92, firewood: 1.12, charcoal: 1.0,
        goods: ['chestnuts', 'mushrooms'], understory: ['bramble', 'fern'],
    }),
    linden: Object.freeze({
        id: 'linden', label: 'Linden', latin: 'Tilia',
        bark: '#716d5d', barkLight: '#98927c',
        summer: ['#326b35', '#579a45'], autumn: ['#9d7b31', '#c6a64b'],
        form: 'oval', height: 1.16, crown: 1.06, trunk: 0.98, lobes: 3,
        timber: 0.84, firewood: 1.0, charcoal: 0.92,
        goods: ['linden-flower', 'honey'], understory: ['shrub', 'fern'],
    }),
    elm: Object.freeze({
        id: 'elm', label: 'Elm', latin: 'Ulmus',
        bark: '#5f5645', barkLight: '#827761',
        summer: ['#356b35', '#5a9b48'], autumn: ['#9a7534', '#c5a24a'],
        form: 'vase', height: 1.22, crown: 1.1, trunk: 1.08, lobes: 3,
        timber: 1.02, firewood: 1.06, charcoal: 0.98,
        goods: ['elm-seeds', 'herbs'], understory: ['fern', 'moss'],
    }),
    alder: Object.freeze({
        id: 'alder', label: 'Alder', latin: 'Alnus',
        bark: '#554f42', barkLight: '#766d59',
        summer: ['#2c5f3b', '#4b854f'], autumn: ['#8d6934', '#b08b45'],
        form: 'airy', height: 0.96, crown: 0.86, trunk: 0.72, lobes: 2,
        timber: 0.7, firewood: 0.9, charcoal: 0.82,
        goods: ['alder-cones', 'herbs'], understory: ['moss', 'heather'],
    }),
});

export const FOREST_SPECIES_IDS = Object.freeze(Object.keys(FOREST_SPECIES));

const type = (id, label, note, species, options = {}) => Object.freeze({
    id, label, note, species: Object.freeze(species),
    density: options.density ?? 0.66,
    openness: options.openness ?? 0.24,
    understory: Object.freeze(options.understory || { fern: 0.2, bramble: 0.1, shrub: 0.1, moss: 0.2 }),
    goods: Object.freeze(options.goods || []),
    fauna: Object.freeze(options.fauna || []),
    ageBias: options.ageBias ?? 'mature',
    disturbance: options.disturbance || null,
    productivity: options.productivity ?? 1,
});

// Formations are the ecological vocabulary; individual tiles then vary the
// mix, age and density without turning a formation into a single repeated tile.
export const FOREST_TYPES = Object.freeze({
    oakwood: type('oakwood', 'Oakwood', 'Dark, broad-crowned old oaks with open understorey',
        { oak: 0.56, beech: 0.16, elm: 0.1, linden: 0.1, maple: 0.08 },
        { density: 0.78, openness: 0.18, understory: { fern: 0.16, bramble: 0.14, shrub: 0.1, moss: 0.24 }, goods: ['acorns', 'truffles', 'game'], fauna: ['deer', 'boar', 'squirrel', 'woodpecker', 'owl', 'beetle'], ageBias: 'ancient' }),
    beechwood: type('beechwood', 'Beechwood', 'Bright, smooth-barked beeches with a deep leaf carpet',
        { beech: 0.64, oak: 0.12, maple: 0.1, birch: 0.08, linden: 0.06 },
        { density: 0.72, openness: 0.22, understory: { fern: 0.24, bramble: 0.08, shrub: 0.08, moss: 0.3 }, goods: ['beechnuts', 'mushrooms', 'game'], fauna: ['deer', 'squirrel', 'owl', 'songbird', 'beetle'], ageBias: 'mature' }),
    birchwood: type('birchwood', 'Birch Grove', 'Airy white trunks, heather and a thin canopy',
        { birch: 0.7, maple: 0.12, oak: 0.06, beech: 0.06, alder: 0.06 },
        { density: 0.48, openness: 0.42, understory: { fern: 0.12, bramble: 0.1, shrub: 0.16, moss: 0.16, heather: 0.36 }, goods: ['birch-sap', 'mushrooms', 'berries'], fauna: ['roe-deer', 'hare', 'songbird', 'woodpecker', 'butterfly'], ageBias: 'young' }),
    maplewood: type('maplewood', 'Maplewood', 'Mixed maple and beech with brilliant autumn colour',
        { maple: 0.56, beech: 0.2, oak: 0.1, elm: 0.08, birch: 0.06 },
        { density: 0.7, openness: 0.26, understory: { fern: 0.2, bramble: 0.18, shrub: 0.12, moss: 0.22 }, goods: ['maple-syrup', 'mushrooms', 'herbs'], fauna: ['squirrel', 'songbird', 'fox', 'butterfly', 'deer'], ageBias: 'mature' }),
    'chestnut-grove': type('chestnut-grove', 'Chestnut Grove', 'Warm, generous chestnut stands with a bramble edge',
        { chestnut: 0.54, linden: 0.18, oak: 0.12, maple: 0.1, elm: 0.06 },
        { density: 0.66, openness: 0.3, understory: { fern: 0.14, bramble: 0.26, shrub: 0.14, moss: 0.16 }, goods: ['chestnuts', 'mushrooms', 'game'], fauna: ['boar', 'squirrel', 'mouse', 'woodpecker', 'songbird'], ageBias: 'mature' }),
    'linden-elm': type('linden-elm', 'Linden and Elm Stand', 'Tall, vase-shaped crowns and a rich herb layer',
        { linden: 0.34, elm: 0.3, oak: 0.14, maple: 0.1, chestnut: 0.12 },
        { density: 0.68, openness: 0.28, understory: { fern: 0.18, bramble: 0.12, shrub: 0.18, moss: 0.2 }, goods: ['linden-flower', 'honey', 'herbs', 'game'], fauna: ['songbird', 'squirrel', 'owl', 'ant', 'deer'], ageBias: 'mature' }),
    mixed: type('mixed', 'Mixed Woodland', 'Several broadleaf species share the canopy and the gaps',
        { oak: 0.24, beech: 0.22, birch: 0.16, maple: 0.16, linden: 0.12, elm: 0.1 },
        { density: 0.68, openness: 0.3, understory: { fern: 0.22, bramble: 0.16, shrub: 0.16, moss: 0.2 }, goods: ['mushrooms', 'berries', 'game', 'herbs'], fauna: ['deer', 'roe-deer', 'fox', 'squirrel', 'songbird', 'woodpecker', 'owl', 'beetle'], ageBias: 'mature' }),
    alluvial: type('alluvial', 'Alluvial Woodland', 'Damp alder, elm and willow-like growth near low water',
        { alder: 0.34, elm: 0.26, birch: 0.16, maple: 0.12, oak: 0.12 },
        { density: 0.74, openness: 0.2, understory: { fern: 0.28, bramble: 0.08, shrub: 0.24, moss: 0.36 }, goods: ['herbs', 'mushrooms', 'honey', 'game'], fauna: ['hare', 'fox', 'owl', 'songbird', 'butterfly', 'deer'], ageBias: 'mature' }),
    hillside: type('hillside', 'Hillside Forest', 'Steep beech and maple woods with mossy stone',
        { beech: 0.38, oak: 0.26, maple: 0.2, linden: 0.1, elm: 0.06 },
        { density: 0.64, openness: 0.26, understory: { fern: 0.26, bramble: 0.06, shrub: 0.1, moss: 0.38 }, goods: ['mushrooms', 'herbs', 'game'], fauna: ['roe-deer', 'fox', 'raptor', 'hare', 'woodpecker'], ageBias: 'mature' }),
    ancient: type('ancient', 'Ancient Woodland', 'Hollow trunks, deep humus and a closed old-growth canopy',
        { oak: 0.34, linden: 0.22, elm: 0.18, beech: 0.16, maple: 0.1 },
        { density: 0.86, openness: 0.12, understory: { fern: 0.3, bramble: 0.08, shrub: 0.06, moss: 0.44 }, goods: ['acorns', 'truffles', 'mushrooms', 'game'], fauna: ['owl', 'woodpecker', 'beetle', 'deer', 'squirrel', 'raptor'], ageBias: 'ancient' }),
    regenerating: type('regenerating', 'Regenerating Wood', 'Dense saplings and pioneer birches after a gap',
        { birch: 0.32, maple: 0.24, oak: 0.14, beech: 0.16, linden: 0.14 },
        { density: 0.46, openness: 0.48, understory: { fern: 0.12, bramble: 0.22, shrub: 0.24, moss: 0.14, heather: 0.16 }, goods: ['berries', 'herbs', 'mushrooms'], fauna: ['hare', 'roe-deer', 'butterfly', 'ant', 'songbird'], ageBias: 'young', productivity: 0.72 }),
    burned: type('burned', 'Burn Scar', 'Charred snags, ash and pioneer growth returning in patches',
        { birch: 0.3, maple: 0.2, oak: 0.14, beech: 0.2, linden: 0.16 },
        { density: 0.32, openness: 0.6, understory: { fern: 0.06, bramble: 0.14, shrub: 0.12, moss: 0.08, heather: 0.18 }, goods: ['charcoal', 'berries', 'mushrooms'], fauna: ['woodpecker', 'beetle', 'fox', 'hare'], ageBias: 'young', disturbance: 'burned', productivity: 0.5 }),
    windthrow: type('windthrow', 'Windthrow', 'Toppled giants, shattered crowns and a tangle of deadwood',
        { beech: 0.3, oak: 0.22, maple: 0.18, birch: 0.16, elm: 0.14 },
        { density: 0.58, openness: 0.34, understory: { fern: 0.22, bramble: 0.2, shrub: 0.14, moss: 0.24 }, goods: ['firewood', 'timber', 'mushrooms'], fauna: ['beetle', 'woodpecker', 'fox', 'owl'], ageBias: 'mature', disturbance: 'windthrow', productivity: 0.74 }),
    diseased: type('diseased', 'Diseased Stand', 'Bare crowns, bleeding bark and deadwood in the canopy',
        { oak: 0.3, beech: 0.24, elm: 0.22, maple: 0.14, birch: 0.1 },
        { density: 0.58, openness: 0.32, understory: { fern: 0.18, bramble: 0.12, shrub: 0.12, moss: 0.26 }, goods: ['firewood', 'mushrooms', 'herbs'], fauna: ['beetle', 'woodpecker', 'owl', 'fox'], ageBias: 'mature', disturbance: 'diseased', productivity: 0.66 }),
    cutover: type('cutover', 'Cut-over Wood', 'Stumps, brush piles and a bright flush of regrowth',
        { birch: 0.34, maple: 0.22, oak: 0.14, beech: 0.16, linden: 0.14 },
        { density: 0.24, openness: 0.62, understory: { fern: 0.08, bramble: 0.28, shrub: 0.2, moss: 0.08, heather: 0.2 }, goods: ['berries', 'mushrooms', 'firewood'], fauna: ['hare', 'fox', 'ant', 'butterfly'], ageBias: 'young', disturbance: 'cutover', productivity: 0.4 }),
});

export const FOREST_TYPE_IDS = Object.freeze(Object.keys(FOREST_TYPES));

const TYPE_INDEX = Object.freeze(Object.fromEntries(FOREST_TYPE_IDS.map((id, index) => [id, index + 1])));

export function forestTypeIndex(id) {
    return TYPE_INDEX[id] || 0;
}

export function forestTypeFromIndex(index) {
    const slot = Math.max(0, Math.floor(Number(index) || 0));
    return slot > 0 ? FOREST_TYPE_IDS[slot - 1] || null : null;
}

// Seasonal goods are ecological availability, not a second resource economy.
// The existing wood/food ledger stays authoritative; these descriptors let the
// survey and the forester/lumber panels explain what a particular wood offers.
export const FOREST_GOODS = Object.freeze({
    timber: Object.freeze({ id: 'timber', label: 'Timber', category: 'wood' }),
    firewood: Object.freeze({ id: 'firewood', label: 'Firewood', category: 'wood' }),
    charcoal: Object.freeze({ id: 'charcoal', label: 'Charcoal', category: 'wood' }),
    mushrooms: Object.freeze({ id: 'mushrooms', label: 'Mushrooms', category: 'gather' }),
    berries: Object.freeze({ id: 'berries', label: 'Berries', category: 'gather' }),
    acorns: Object.freeze({ id: 'acorns', label: 'Acorns', category: 'mast' }),
    beechnuts: Object.freeze({ id: 'beechnuts', label: 'Beechnuts', category: 'mast' }),
    chestnuts: Object.freeze({ id: 'chestnuts', label: 'Chestnuts', category: 'mast' }),
    truffles: Object.freeze({ id: 'truffles', label: 'Truffles', category: 'gather' }),
    herbs: Object.freeze({ id: 'herbs', label: 'Herbs', category: 'gather' }),
    honey: Object.freeze({ id: 'honey', label: 'Honey', category: 'gather' }),
    beeswax: Object.freeze({ id: 'beeswax', label: 'Beeswax', category: 'gather' }),
    'linden-flower': Object.freeze({ id: 'linden-flower', label: 'Linden flower', category: 'gather' }),
    'birch-sap': Object.freeze({ id: 'birch-sap', label: 'Birch sap', category: 'gather' }),
    'maple-syrup': Object.freeze({ id: 'maple-syrup', label: 'Maple syrup', category: 'gather' }),
    'elm-seeds': Object.freeze({ id: 'elm-seeds', label: 'Elm seeds', category: 'gather' }),
    'alder-cones': Object.freeze({ id: 'alder-cones', label: 'Alder cones', category: 'gather' }),
    bark: Object.freeze({ id: 'bark', label: 'Bark', category: 'gather' }),
    game: Object.freeze({ id: 'game', label: 'Wild game', category: 'hunt' }),
    fur: Object.freeze({ id: 'fur', label: 'Furs', category: 'hunt' }),
    hides: Object.freeze({ id: 'hides', label: 'Hides', category: 'hunt' }),
});

const SEASON_GOODS = Object.freeze({
    spring: { herbs: 0.9, 'birch-sap': 0.9, 'maple-syrup': 0.75, 'linden-flower': 0.45, honey: 0.55, beeswax: 0.25, mushrooms: 0.18, berries: 0.12, game: 0.3, fur: 0.25, hides: 0.2 },
    summer: { herbs: 0.65, 'linden-flower': 0.95, honey: 0.95, beeswax: 0.55, berries: 0.9, mushrooms: 0.3, game: 0.35, fur: 0.2, hides: 0.16, 'maple-syrup': 0.3 },
    autumn: { mushrooms: 0.95, berries: 0.55, acorns: 0.95, beechnuts: 0.9, chestnuts: 0.95, truffles: 0.7, game: 0.9, fur: 0.5, hides: 0.45, herbs: 0.25, honey: 0.2, beeswax: 0.18 },
    winter: { game: 0.55, fur: 0.85, hides: 0.65, mushrooms: 0.08, berries: 0.04, charcoal: 0.5 },
});

const FAUNA = Object.freeze({
    deer: Object.freeze({ label: 'Red deer', group: 'large', note: 'browsing the young growth' }),
    'roe-deer': Object.freeze({ label: 'Roe deer', group: 'large', note: 'moving along the woodland edge' }),
    boar: Object.freeze({ label: 'Wild boar', group: 'large', note: 'rooting through the leaf litter' }),
    fox: Object.freeze({ label: 'Fox', group: 'predator', note: 'following a scent trail' }),
    hare: Object.freeze({ label: 'Hare', group: 'small', note: 'crossing the open gap' }),
    squirrel: Object.freeze({ label: 'Squirrel', group: 'small', note: 'caching nuts in the canopy' }),
    mouse: Object.freeze({ label: 'Wood mouse', group: 'small', note: 'rustling under the brambles' }),
    owl: Object.freeze({ label: 'Owl', group: 'bird', note: 'watching from a hollow' }),
    woodpecker: Object.freeze({ label: 'Woodpecker', group: 'bird', note: 'drumming on a dead trunk' }),
    songbird: Object.freeze({ label: 'Songbird', group: 'bird', note: 'singing in the understorey' }),
    raptor: Object.freeze({ label: 'Buzzard', group: 'bird', note: 'circling above the canopy gap' }),
    beetle: Object.freeze({ label: 'Stag beetle', group: 'insect', note: 'working through deadwood' }),
    butterfly: Object.freeze({ label: 'Woodland butterfly', group: 'insect', note: 'drifting through the light' }),
    ant: Object.freeze({ label: 'Wood ant', group: 'insect', note: 'following a foraging column' }),
    bee: Object.freeze({ label: 'Wild bee', group: 'insect', note: 'visiting the flowering edge' }),
});

export const FOREST_FAUNA = Object.freeze(FAUNA);

const WINTER_BIRDS = new Set(['owl', 'woodpecker', 'raptor']);
const WINTER_INSECTS = new Set([]);

function seasonKeyFor(dayOfYear, climate) {
    const season = seasonalState(dayOfYear, climate).season;
    return ['spring', 'summer', 'autumn', 'winter'][season] || 'spring';
}

export function seasonGoods(dayOfYear, climate = 'temperate') {
    return SEASON_GOODS[seasonKeyFor(dayOfYear, climate)] || SEASON_GOODS.spring;
}

function formationFor(x, y, ctx) {
    const { moisture, temperature, height, seed, climate } = ctx;
    // Chestnut groves belong to the warm, sheltered lowlands. The generated
    // temperate map rarely exceeds .62 on land, so .58 is the playable warm
    // band rather than an unreachable threshold.
    const warm = temperature > 0.58;
    const cold = temperature < 0.42;
    const wet = moisture > 0.7;
    const dry = moisture < 0.44;
    // Forest resources begin at the grass/forest transition, so "hillside"
    // must mean the upper woodland belt, not every tile above the old 0.78
    // resource line. Otherwise every resource-bearing wood becomes hillside.
    const high = height > 0.82;

    if (wet && height < 0.76) return 'alluvial';
    if (high) return 'hillside';
    if (cold) return 'birchwood';
    if (warm && moisture > 0.48) return 'chestnut-grove';
    if (dry) return 'oakwood';
    if (moisture > 0.62) return 'beechwood';
    if (moisture > 0.54) return 'maplewood';
    if (moisture > 0.48) return 'linden-elm';

    // The remaining mid-range is a real mixture, varied by a coarse patch so a
    // realm contains several woodland characters rather than one default.
    const patch = coarseUnit(seed, x, y, 9, 0x4d495853);
    if (patch > 0.82) return 'oakwood';
    if (patch > 0.64) return 'beechwood';
    if (patch > 0.46) return 'maplewood';
    if (patch > 0.28) return 'linden-elm';
    if (patch > 0.14) return 'birchwood';
    return 'mixed';
}

function ageClassFor(formation, x, y, seed) {
    if (formation.id === 'ancient') return 'ancient';
    if (formation.id === 'regenerating' || formation.id === 'cutover') return 'young';
    const roll = unitHash(seed, x, y, 0x41474531);
    if (formation.id === 'burned') return roll > 0.38 ? 'mature' : 'young';
    if (formation.ageBias === 'ancient') return roll < 0.58 ? 'ancient' : 'mature';
    if (formation.ageBias === 'young') return roll < 0.72 ? 'young' : 'mature';
    if (roll < 0.17) return 'young';
    if (roll > 0.87) return 'ancient';
    return 'mature';
}

const AGE_SCALE = Object.freeze({ young: 0.6, mature: 0.92, ancient: 1.26 });

// Cheap land test used before generating a full stand. It mirrors the forest
// gate in forestStandAt exactly; rendering can then skip the expensive wave,
// species and goods work on open ground while still visiting every tile for
// tree placement.
export function forestPotentialAt({ moisture = 0.55, height = 0.55, forests = 52, rockLine = 0.92 } = {}) {
    const m = clamp01(Number(moisture));
    const h = clamp01(Number(height));
    const f = Number.isFinite(Number(forests)) ? Number(forests) : 52;
    const line = Number.isFinite(Number(rockLine)) ? Number(rockLine) : 0.92;
    const pressure = clamp01((m - 0.34) / 0.46 + (f - 50) * 0.0018 - 0.04);
    return pressure > 0.1 && h < line;
}

export function forestStandAt(x, y, context = {}) {
    const seed = Number.isSafeInteger(Number(context.seed)) && Number(context.seed) > 0
        ? Number(context.seed) >>> 0 : 1;
    const tx = Number(x) || 0;
    const ty = Number(y) || 0;
    const moisture = clamp01(Number(context.moisture ?? 0.55));
    const temperature = clamp01(Number(context.temperature ?? 0.55));
    const height = clamp01(Number(context.height ?? 0.55));
    const climate = context.climate || 'temperate';
    const forests = Number.isFinite(Number(context.forests)) ? Number(context.forests) : 52;
    const stockRatio = clamp01(Number(context.stockRatio ?? 1));
    const rockLine = Number.isFinite(Number(context.rockLine)) ? Number(context.rockLine) : 0.92;

    const forestPressure = clamp01((moisture - 0.34) / 0.46 + (forests - 50) * 0.0018 - 0.04);
    const forest = forestPressure > 0.1 && height < rockLine;
    const gapPatch = coarseUnit(seed, tx, ty, 5, 0x47415031);
    const gapEdge = wave(tx, ty, seed, 0.045, 0x47415032);
    const clearing = forest && (gapPatch > 0.86 || gapEdge > 0.86)
        ? clamp01(0.32 + (gapPatch - 0.8) * 3.4 + (gapEdge - 0.7) * 0.8)
        : 0;
    const edge = forest && (forestPressure < 0.28 || clearing > 0.22);

    let formation = FOREST_TYPES[formationFor(tx, ty, { moisture, temperature, height, seed, climate })];
    let disturbance = formation.disturbance;

    const damage = coarseUnit(seed, tx, ty, 7, 0x44414d47);
    if (stockRatio < 0.18 && forest) {
        formation = FOREST_TYPES.cutover;
        disturbance = 'cutover';
    } else if (forest && damage > 0.982) {
        formation = FOREST_TYPES.burned;
        disturbance = 'burned';
    } else if (forest && damage > 0.96) {
        formation = FOREST_TYPES.windthrow;
        disturbance = 'windthrow';
    } else if (forest && damage > 0.942) {
        formation = FOREST_TYPES.diseased;
        disturbance = 'diseased';
    } else if (forest && coarseUnit(seed, tx, ty, 9, 0x4f4c4457) > 0.955) {
        formation = FOREST_TYPES.ancient;
    } else if (forest && coarseUnit(seed, tx, ty, 6, 0x52454745) > 0.91) {
        formation = FOREST_TYPES.regenerating;
    }

    const ageClass = ageClassFor(formation, tx, ty, seed);
    const ageScale = AGE_SCALE[ageClass];
    const density = clamp01(formation.density * (0.58 + forestPressure * 0.42) * (0.72 + stockRatio * 0.28));
    const canopy = clamp01(density * (1 - clearing * 0.74) * (ageClass === 'young' ? 0.82 : 1));
    const light = clamp01(0.22 + (1 - canopy) * 0.78 + (edge ? 0.12 : 0));
    let treeChance = clamp01(0.08 + density * 0.78 + (edge ? 0.06 : 0) - clearing * 0.56);
    if (formation.id === 'regenerating') treeChance = clamp01(0.32 + density * 0.4);
    if (formation.id === 'cutover') treeChance = clamp01(0.12 + density * 0.62);
    if (!forest) treeChance = 0;

    const fern = clamp01(0.12 + moisture * 0.38 + formation.understory.fern * 0.8 + (ageClass === 'ancient' ? 0.14 : 0) + light * 0.08);
    const bramble = clamp01(0.06 + formation.understory.bramble * 0.9 + (edge ? 0.18 : 0) + light * 0.1);
    const shrub = clamp01(0.08 + formation.understory.shrub * 0.8 + (edge ? 0.2 : 0));
    const moss = clamp01(0.08 + moisture * 0.34 + formation.understory.moss * 0.9 + (ageClass === 'ancient' ? 0.16 : 0));
    const heather = clamp01((formation.understory.heather || 0) * 0.9 + (temperature < 0.48 ? 0.12 : 0));
    const litter = clamp01(0.16 + (1 - canopy) * 0.34 + moisture * 0.12 + (ageClass === 'ancient' ? 0.18 : 0));

    const dominantSpecies = weightedPick(formation.species, unitHash(seed, tx, ty, 0x53504543));
    const speciesList = Object.entries(formation.species)
        .sort((a, b) => b[1] - a[1])
        .map(([id, weight]) => ({ id, label: FOREST_SPECIES[id]?.label || id, weight }));

    const baseGoods = new Set([...formation.goods]);
    for (const entry of speciesList) {
        for (const good of FOREST_SPECIES[entry.id]?.goods || []) baseGoods.add(good);
    }
    // Every wood can be worked for timber and firewood; charcoal belongs to
    // the older, denser stands and to burn scars.
    baseGoods.add('timber');
    baseGoods.add('firewood');
    if (ageClass === 'ancient' || disturbance === 'burned') baseGoods.add('charcoal');
    if (baseGoods.has('honey')) baseGoods.add('beeswax');
    if (baseGoods.has('game')) baseGoods.add('hides');

    const trail = coarseUnit(seed, tx, ty, 6, 0x54524149) > 0.78 || edge;
    const stumps = clamp01((formation.id === 'cutover' ? 0.42 : 0) + (stockRatio < 0.65 ? (0.65 - stockRatio) * 0.8 : 0) + (disturbance === 'windthrow' ? 0.22 : 0));
    const logs = clamp01((formation.id === 'windthrow' ? 0.5 : 0) + (disturbance === 'burned' ? 0.12 : 0) + (ageClass === 'ancient' ? 0.14 : 0));
    const mushrooms = clamp01(0.08 + moisture * 0.3 + (formation.id === 'beechwood' ? 0.12 : 0) + (disturbance === 'burned' ? 0.2 : 0) + (stumps > 0.2 ? 0.12 : 0));
    const stones = clamp01((height > 0.56 ? (height - 0.56) * 1.4 : 0) + (formation.id === 'hillside' ? 0.18 : 0));
    const roots = clamp01((ageClass === 'ancient' ? 0.3 : 0.08) + (height > 0.56 ? 0.1 : 0));
    const flowers = clamp01((edge ? 0.35 : 0.06) + (clearing > 0.2 ? 0.3 : 0) + (formation.id === 'regenerating' ? 0.12 : 0));
    const humus = clamp01(litter * 0.62 + moss * 0.24 + (ageClass === 'ancient' ? 0.16 : 0));
    const soil = moisture > 0.72 ? 'alluvial' : moisture < 0.4 ? 'dry' : humus > 0.52 ? 'humus' : 'loam';
    // These are deterministic pressure proxies, not a second population or soil
    // simulation: harvest lowers the stand, trails compact the ground, and
    // repeated extraction reduces the available game cover.
    const compaction = clamp01((1 - stockRatio) * 0.5 + (trail ? 0.12 : 0) + (formation.id === 'cutover' ? 0.25 : 0));
    const huntingPressure = clamp01((1 - stockRatio) * 0.38 + (edge ? 0.1 : 0) + (formation.id === 'cutover' ? 0.14 : 0));

    return {
        x: tx, y: ty, seed,
        forest,
        type: formation.id,
        label: formation.label,
        note: formation.note,
        dominantSpecies,
        species: speciesList,
        ageClass,
        ageScale,
        density,
        canopy,
        light,
        clearing,
        edge,
        disturbance,
        treeChance,
        understory: { fern, bramble, shrub, moss, heather },
        ground: { litter, moss, roots, stones, mushrooms, stumps, logs, trail, flowers, humus, soil, compaction, huntingPressure },
        goods: [...baseGoods].sort(),
        fauna: [...formation.fauna],
        productivity: formation.productivity * (ageClass === 'ancient' ? 1.18 : ageClass === 'young' ? 0.72 : 1) * (0.68 + stockRatio * 0.32),
        formation: formation.id,
    };
}

// A dense wood is drawn as overlapping crowns, not as one lonely tree per
// tile. The count is a deterministic property of the stand; the renderer caps
// it to one at landscape distance, where the extra copies would be invisible
// but would still cost draw time.
export function forestTreeCopies(stand) {
    if (!stand?.forest) return 0;
    const clearing = Number(stand.clearing) || 0;
    const canopy = Number(stand.canopy) || 0;
    if (clearing > 0.28) return 1;
    if (stand.ageClass === 'ancient' && canopy > 0.62) return 3;
    if (canopy > 0.52) return 2;
    return 1;
}

export function pickSpecies(stand, roll = 0.5) {
    if (!stand?.species?.length) return 'oak';
    const total = stand.species.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    let cursor = clamp01(roll) * total;
    for (const entry of stand.species) {
        cursor -= entry.weight;
        if (cursor <= 0) return entry.id;
    }
    return stand.species[stand.species.length - 1].id;
}

export function pickAgeClass(stand, roll = 0.5) {
    if (stand?.ageClass === 'ancient') return roll < 0.72 ? 'ancient' : 'mature';
    if (stand?.ageClass === 'young') return roll < 0.72 ? 'young' : 'mature';
    if (roll < 0.18) return 'young';
    if (roll > 0.88) return 'ancient';
    return 'mature';
}

export function forestGoodsFor(stand, dayOfYear, climate = 'temperate') {
    if (!stand) return [];
    const seasonal = seasonGoods(dayOfYear, climate);
    const goods = [];
    for (const id of stand.goods) {
        // A seasonal good is absent when its season has no entry. Falling back
        // to a generic number here would put linden blossom and berries on a
        // snowbound winter survey.
        if (seasonal[id] === undefined && !['timber', 'firewood', 'charcoal'].includes(id)) continue;
        const base = id === 'timber' ? 0.9 : id === 'firewood' ? 0.82 : id === 'charcoal' ? 0.55 : 0.2;
        const abundance = clamp01((seasonal[id] ?? base) * (0.7 + stand.productivity * 0.3));
        if (abundance > 0.08) goods.push({ ...FOREST_GOODS[id], abundance });
    }
    return goods.sort((a, b) => b.abundance - a.abundance);
}

export function forestFaunaFor(stand, dayOfYear, climate = 'temperate', roll = 0.5) {
    if (!stand?.forest) return [];
    const season = seasonKeyFor(dayOfYear, climate);
    const base = stand.fauna.length ? stand.fauna : ['deer', 'squirrel', 'songbird'];
    const active = base.filter(id => {
        if (season === 'winter' && (id === 'songbird' || id === 'butterfly' || id === 'ant' || id === 'bee')) return false;
        if (season === 'winter' && id === 'beetle' && stand.ageClass !== 'ancient') return false;
        if (season === 'spring' && id === 'boar' && stand.type !== 'chestnut-grove') return roll > 0.65;
        if (season === 'summer' && id === 'owl') return roll > 0.72;
        return true;
    });
    const extra = [];
    if (season === 'spring' || season === 'summer') extra.push('songbird', 'butterfly', 'bee');
    if (season === 'autumn') extra.push('squirrel', 'boar', 'hare');
    if (season === 'winter') extra.push('hare', 'fox', 'owl', 'woodpecker');
    if (stand.edge && season !== 'winter') extra.push('butterfly', 'songbird');
    if (stand.clearing > 0.35) extra.push('roe-deer', 'hare');
    if (stand.ground.mushrooms > 0.35 && season !== 'winter') extra.push('boar', 'mouse');
    const unique = [...new Set([...active, ...extra])]
        .filter(id => FAUNA[id])
        .filter(id => !(season === 'winter' && ['songbird', 'butterfly', 'ant', 'bee'].includes(id)));
    if (!unique.length) return [];
    const first = Math.floor(clamp01(roll) * unique.length) % unique.length;
    const count = season === 'winter' ? 1 : 2;
    const picked = [];
    for (let index = 0; index < count && index < unique.length; index++) {
        const id = unique[(first + index * 2) % unique.length];
        if (picked.some(entry => entry.id === id)) continue;
        picked.push({ id, ...FAUNA[id], activity: FAUNA[id].note, season });
    }
    return picked;
}

export function forestSurveyAt(x, y, context = {}) {
    const stand = forestStandAt(x, y, context);
    if (!stand.forest) return null;
    const day = Number.isFinite(Number(context.dayOfYear)) ? Number(context.dayOfYear) : 150;
    return {
        ...stand,
        goods: forestGoodsFor(stand, day, context.climate || 'temperate'),
        fauna: forestFaunaFor(stand, day, context.climate || 'temperate', Number(context.roll ?? 0.5)),
    };
}

// Helper for tests and the survey UI: a stable, human-readable mix string.
export function forestMixLabel(stand) {
    if (!stand?.species?.length) return 'Open ground';
    return stand.species.slice(0, 3).map(entry => entry.label).join(' · ');
}

export const __internals = { hash32, unitHash, coarseUnit, weightedPick };
