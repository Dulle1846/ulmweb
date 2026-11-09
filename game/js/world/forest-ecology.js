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
const fract = value => value - Math.floor(value);

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
        form: 'spreading', leafShape: 'lobed', height: 1.12, crown: 1.08, trunk: 1.2, lobes: 3,
        timber: 1.28, firewood: 1.18, charcoal: 1.32, wood: 'oak-timber',
        goods: ['acorns', 'truffles', 'bark', 'crab-apples'], understory: ['fern', 'bramble'],
    }),
    beech: Object.freeze({
        id: 'beech', label: 'Beech', latin: 'Fagus',
        bark: '#8e8a7d', barkLight: '#b2ad9b',
        summer: ['#2b6134', '#4c8f42'], autumn: ['#a86f2f', '#c79a4b'],
        form: 'dome', leafShape: 'oval', height: 1.1, crown: 1.02, trunk: 0.96, lobes: 2,
        timber: 1.1, firewood: 1.24, charcoal: 1.14, wood: 'beech-timber',
        goods: ['beechnuts', 'mushrooms', 'wood-sorrel', 'porcini'], understory: ['fern', 'moss'],
    }),
    birch: Object.freeze({
        id: 'birch', label: 'Birch', latin: 'Betula',
        bark: '#e8e2d3', barkLight: '#f6f1e5',
        summer: ['#5d963f', '#86ba5b'], autumn: ['#c9a83a', '#e0c25a'],
        form: 'airy', leafShape: 'triangular', height: 1.02, crown: 0.78, trunk: 0.62, lobes: 2,
        timber: 0.78, firewood: 1.1, charcoal: 0.9, wood: 'birch-timber',
        goods: ['birch-sap', 'mushrooms', 'chanterelle'], understory: ['heather', 'fern'],
    }),
    maple: Object.freeze({
        id: 'maple', label: 'Maple', latin: 'Acer',
        bark: '#68655a', barkLight: '#8f8b7a',
        summer: ['#346a33', '#5b9b47'], autumn: ['#b65a2e', '#d89a3d'],
        form: 'round', leafShape: 'palmate', height: 1.04, crown: 0.94, trunk: 0.86, lobes: 4,
        timber: 0.96, firewood: 1.04, charcoal: 1.02, wood: 'maple-timber',
        goods: ['maple-syrup', 'mushrooms', 'wood-sorrel'], understory: ['fern', 'bramble'],
    }),
    chestnut: Object.freeze({
        id: 'chestnut', label: 'Chestnut', latin: 'Castanea',
        bark: '#6e5138', barkLight: '#9a7550',
        summer: ['#2f6335', '#4f9444'], autumn: ['#a85d2d', '#cf8f3d'],
        form: 'spreading', leafShape: 'lance', height: 1.08, crown: 1.0, trunk: 1.04, lobes: 3,
        timber: 0.92, firewood: 1.12, charcoal: 1.0, wood: 'chestnut-timber',
        goods: ['chestnuts', 'mushrooms', 'chanterelle'], understory: ['bramble', 'fern'],
    }),
    linden: Object.freeze({
        id: 'linden', label: 'Linden', latin: 'Tilia',
        bark: '#716d5d', barkLight: '#98927c',
        summer: ['#326b35', '#579a45'], autumn: ['#9d7b31', '#c6a64b'],
        form: 'oval', leafShape: 'heart', height: 1.16, crown: 1.06, trunk: 0.98, lobes: 3,
        timber: 0.84, firewood: 1.0, charcoal: 0.92, wood: 'linden-timber',
        goods: ['linden-flower', 'honey', 'wild-garlic'], understory: ['shrub', 'fern'],
    }),
    elm: Object.freeze({
        id: 'elm', label: 'Elm', latin: 'Ulmus',
        bark: '#5f5645', barkLight: '#827761',
        summer: ['#356b35', '#5a9b48'], autumn: ['#9a7534', '#c5a24a'],
        form: 'vase', leafShape: 'serrated', height: 1.22, crown: 1.1, trunk: 1.08, lobes: 3,
        timber: 1.02, firewood: 1.06, charcoal: 0.98, wood: 'elm-timber',
        goods: ['elm-seeds', 'herbs', 'wood-sorrel'], understory: ['fern', 'moss'],
    }),
    alder: Object.freeze({
        id: 'alder', label: 'Alder', latin: 'Alnus',
        bark: '#554f42', barkLight: '#766d59',
        summer: ['#2c5f3b', '#4b854f'], autumn: ['#8d6934', '#b08b45'],
        form: 'airy', leafShape: 'round', height: 0.96, crown: 0.86, trunk: 0.72, lobes: 2,
        timber: 0.7, firewood: 0.9, charcoal: 0.82, wood: 'alder-timber',
        goods: ['alder-cones', 'herbs', 'sloes'], understory: ['moss', 'heather'],
    }),
    // Conifers are not a single cosmetic cone. Each species has its own
    // silhouette, timber, forest-floor litter and useful products. Larch is
    // the exception that proves the rule: it is a conifer that sheds its
    // needles every autumn, while spruce, fir, pine and juniper stay green.
    spruce: Object.freeze({
        id: 'spruce', label: 'Spruce', latin: 'Picea',
        bark: '#4b3828', barkLight: '#70543a',
        summer: ['#1f4232', '#356348'], autumn: ['#1b392c', '#2e5740'],
        form: 'conifer', leafShape: 'needle', height: 1.28, crown: 0.78, trunk: 0.78, lobes: 3,
        conifer: true, crownShape: 'spire', tiers: 7, branchDrop: 0.16, snowRetention: 1.25,
        timber: 0.9, firewood: 1.35, charcoal: 1.2, wood: 'spruce-timber',
        goods: ['spruce-cones', 'resin', 'mushrooms', 'lichen'], understory: ['moss', 'fern'],
    }),
    fir: Object.freeze({
        id: 'fir', label: 'Fir', latin: 'Abies',
        bark: '#4a4036', barkLight: '#6b5a48',
        summer: ['#1c3a2e', '#2e5540'], autumn: ['#19342a', '#294c39'],
        form: 'conifer', leafShape: 'needle', height: 1.35, crown: 0.94, trunk: 0.9, lobes: 3,
        conifer: true, crownShape: 'dense', tiers: 6, branchDrop: 0.08, snowRetention: 1.3,
        timber: 1.02, firewood: 1.2, charcoal: 1.12, wood: 'fir-timber',
        goods: ['fir-cones', 'resin', 'mushrooms', 'lichen'], understory: ['moss', 'fern'],
    }),
    pine: Object.freeze({
        id: 'pine', label: 'Pine', latin: 'Pinus',
        bark: '#775230', barkLight: '#a06d42',
        summer: ['#315b3b', '#537d4b'], autumn: ['#2b5138', '#4a7247'],
        form: 'conifer', leafShape: 'needle', height: 1.22, crown: 0.86, trunk: 1.02, lobes: 3,
        conifer: true, crownShape: 'crown', tiers: 4, branchDrop: 0.04, snowRetention: 1.05,
        timber: 1.0, firewood: 1.12, charcoal: 1.05, wood: 'pine-timber',
        goods: ['pine-cones', 'resin', 'blueberries', 'lingonberries', 'mushrooms'], understory: ['heather', 'lichen', 'moss'],
    }),
    larch: Object.freeze({
        id: 'larch', label: 'Larch', latin: 'Larix',
        bark: '#6b4d38', barkLight: '#946b4a',
        summer: ['#4c7a3d', '#79a24f'], autumn: ['#b8842b', '#d6ad45'],
        form: 'conifer', leafShape: 'needle', height: 1.2, crown: 0.74, trunk: 0.82, lobes: 3,
        conifer: true, deciduousNeedles: true, crownShape: 'airy', tiers: 5, branchDrop: 0.12, snowRetention: 0.9,
        timber: 0.88, firewood: 1.04, charcoal: 0.94, wood: 'larch-timber',
        goods: ['larch-timber', 'resin', 'mushrooms', 'blueberries', 'herbs'], understory: ['heather', 'fern'],
    }),
    juniper: Object.freeze({
        id: 'juniper', label: 'Juniper', latin: 'Juniperus',
        bark: '#5c4a39', barkLight: '#80674e',
        summer: ['#365d3d', '#547747'], autumn: ['#31543a', '#4b6d45'],
        form: 'scrub', leafShape: 'needle', height: 0.46, crown: 0.55, trunk: 0.35, lobes: 2,
        conifer: true, crownShape: 'scrub', tiers: 3, branchDrop: 0.02, snowRetention: 0.82,
        timber: 0.38, firewood: 0.58, charcoal: 0.5, wood: 'juniper-timber',
        goods: ['juniper-berries', 'resin', 'lichen'], understory: ['heather', 'moss'],
    }),
});

export const FOREST_SPECIES_IDS = Object.freeze(Object.keys(FOREST_SPECIES));

const type = (id, label, note, species, options = {}) => Object.freeze({
    id, label, note, species: Object.freeze(species),
    density: options.density ?? 0.66,
    openness: options.openness ?? 0.24,
    understory: Object.freeze({
        fern: 0.2, bramble: 0.1, shrub: 0.1, moss: 0.2,
        heather: 0, lichen: 0, berry: 0,
        ...(options.understory || {}),
    }),
    goods: Object.freeze(options.goods || []),
    fauna: Object.freeze(options.fauna || []),
    ageBias: options.ageBias ?? 'mature',
    disturbance: options.disturbance || null,
    productivity: options.productivity ?? 1,
    conifer: Boolean(options.conifer),
    needleLitter: Math.max(0, Math.min(1, Number(options.needleLitter) || 0)),
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

    // Conifer formations are appended so every existing numeric type index in
    // old resource saves keeps pointing at the same broadleaf formation.
    sprucewood: type('sprucewood', 'Sprucewood', 'Dense, dark spires with a deep needle floor and little sky',
        { spruce: 0.6, fir: 0.18, pine: 0.1, birch: 0.07, alder: 0.05 },
        { density: 0.88, openness: 0.13, conifer: true, needleLitter: 0.95, understory: { fern: 0.12, bramble: 0, shrub: 0.08, moss: 0.38, heather: 0, lichen: 0.22, berry: 0.12 }, goods: ['spruce-cones', 'resin', 'mushrooms', 'lichen', 'game'], fauna: ['deer', 'roe-deer', 'fox', 'squirrel', 'crossbill', 'woodpecker', 'bark-beetle', 'owl', 'wolf'], ageBias: 'mature' }),
    firwood: type('firwood', 'Firwood', 'Tall, shadowed firs with tiered branches and mossy trunks',
        { fir: 0.58, spruce: 0.2, beech: 0.1, pine: 0.07, birch: 0.05 },
        { density: 0.9, openness: 0.12, conifer: true, needleLitter: 0.95, understory: { fern: 0.16, bramble: 0, shrub: 0.04, moss: 0.44, heather: 0, lichen: 0.26, berry: 0.08 }, goods: ['fir-cones', 'resin', 'mushrooms', 'herbs', 'game'], fauna: ['deer', 'boar', 'fox', 'owl', 'crossbill', 'woodpecker', 'bark-beetle', 'wolf'], ageBias: 'mature' }),
    pinewood: type('pinewood', 'Pinewood', 'Open, sunlit pines over heather, lichen and berry bushes',
        { pine: 0.62, spruce: 0.12, larch: 0.1, birch: 0.1, juniper: 0.06 },
        { density: 0.58, openness: 0.38, conifer: true, needleLitter: 0.8, understory: { fern: 0.06, bramble: 0, shrub: 0.08, moss: 0.22, heather: 0.3, lichen: 0.42, berry: 0.26 }, goods: ['pine-cones', 'resin', 'blueberries', 'lingonberries', 'mushrooms', 'game'], fauna: ['deer', 'roe-deer', 'hare', 'fox', 'crossbill', 'woodpecker', 'ant', 'bark-beetle'], ageBias: 'mature' }),
    larchwood: type('larchwood', 'Larchwood', 'Bright larches that turn gold and drop their needles in autumn',
        { larch: 0.56, pine: 0.18, spruce: 0.1, birch: 0.1, juniper: 0.06 },
        { density: 0.62, openness: 0.34, conifer: true, needleLitter: 0.7, understory: { fern: 0.12, bramble: 0, shrub: 0.16, moss: 0.2, heather: 0.16, lichen: 0.2, berry: 0.22 }, goods: ['larch-timber', 'resin', 'mushrooms', 'blueberries', 'herbs'], fauna: ['roe-deer', 'deer', 'hare', 'fox', 'crossbill', 'songbird'], ageBias: 'mature' }),
    'pine-heath': type('pine-heath', 'Pine Heath', 'Dry, nutrient-poor pine and juniper over open heather',
        { pine: 0.54, juniper: 0.18, larch: 0.1, birch: 0.1, spruce: 0.08 },
        { density: 0.4, openness: 0.5, conifer: true, needleLitter: 0.55, understory: { fern: 0.04, bramble: 0, shrub: 0.12, moss: 0.12, heather: 0.65, lichen: 0.46, berry: 0.3 }, goods: ['pine-cones', 'juniper-berries', 'lingonberries', 'lichen', 'resin'], fauna: ['roe-deer', 'hare', 'ant', 'bark-beetle', 'crossbill'], ageBias: 'mature' }),
    'wet-conifer': type('wet-conifer', 'Wet Conifer Wood', 'Damp spruce, fir and alder with moss, ferns and standing water',
        { spruce: 0.5, alder: 0.22, fir: 0.16, birch: 0.07, pine: 0.05 },
        { density: 0.8, openness: 0.2, conifer: true, needleLitter: 0.8, understory: { fern: 0.28, bramble: 0.04, shrub: 0.2, moss: 0.52, heather: 0, lichen: 0.2, berry: 0.3 }, goods: ['spruce-cones', 'resin', 'mushrooms', 'herbs', 'game'], fauna: ['deer', 'boar', 'fox', 'owl', 'crossbill', 'mouse'], ageBias: 'mature' }),
    'mountain-conifer': type('mountain-conifer', 'Mountain Conifer Wood', 'High-elevation spruce and fir, bent by wind and deep snow',
        { spruce: 0.42, fir: 0.28, pine: 0.16, larch: 0.1, juniper: 0.04 },
        { density: 0.68, openness: 0.22, conifer: true, needleLitter: 0.9, understory: { fern: 0.18, bramble: 0, shrub: 0.08, moss: 0.36, heather: 0.2, lichen: 0.4, berry: 0.18 }, goods: ['spruce-cones', 'fir-cones', 'resin', 'lichen', 'mushrooms', 'game'], fauna: ['deer', 'roe-deer', 'fox', 'owl', 'raptor', 'crossbill', 'capercaillie', 'lynx', 'wolf'], ageBias: 'ancient' }),
    'subalpine-scrub': type('subalpine-scrub', 'Subalpine Scrub', 'Gnarled juniper and young conifers at the wind-bent tree line',
        { juniper: 0.38, pine: 0.24, larch: 0.16, spruce: 0.12, birch: 0.1 },
        { density: 0.36, openness: 0.52, conifer: true, needleLitter: 0.5, understory: { fern: 0.04, bramble: 0, shrub: 0.28, moss: 0.2, heather: 0.44, lichen: 0.4, berry: 0.26 }, goods: ['juniper-berries', 'pine-cones', 'lichen', 'herbs', 'resin'], fauna: ['roe-deer', 'hare', 'fox', 'raptor', 'crossbill', 'capercaillie'], ageBias: 'young' }),
    'mixed-conifer': type('mixed-conifer', 'Mixed Conifer Wood', 'Spruce, fir, pine and larch sharing a layered canopy',
        { spruce: 0.3, fir: 0.24, pine: 0.22, larch: 0.16, juniper: 0.08 },
        { density: 0.72, openness: 0.26, conifer: true, needleLitter: 0.85, understory: { fern: 0.16, bramble: 0, shrub: 0.12, moss: 0.3, heather: 0.12, lichen: 0.28, berry: 0.2 }, goods: ['spruce-cones', 'fir-cones', 'pine-cones', 'resin', 'blueberries', 'mushrooms', 'game'], fauna: ['deer', 'roe-deer', 'fox', 'owl', 'crossbill', 'woodpecker', 'capercaillie', 'songbird'], ageBias: 'mature' }),
    'bark-beetle': type('bark-beetle', 'Bark-beetle Wood', 'Grey dead spires, red needles and woodpecker holes in a beetle outbreak',
        { spruce: 0.55, pine: 0.18, fir: 0.12, birch: 0.1, larch: 0.05 },
        { density: 0.5, openness: 0.42, conifer: true, needleLitter: 0.8, understory: { fern: 0.06, bramble: 0, shrub: 0.04, moss: 0.18, heather: 0, lichen: 0.12, berry: 0.04 }, goods: ['spruce-timber', 'firewood', 'charcoal', 'mushrooms', 'resin'], fauna: ['woodpecker', 'bark-beetle', 'beetle', 'owl', 'fox'], ageBias: 'mature', disturbance: 'bark-beetle', productivity: 0.46 }),
    snowbreak: type('snowbreak', 'Snowbreak Wood', 'Broken leaders and bent crowns under heavy winter snow',
        { spruce: 0.44, fir: 0.2, pine: 0.18, larch: 0.1, birch: 0.08 },
        { density: 0.54, openness: 0.38, conifer: true, needleLitter: 0.85, understory: { fern: 0.1, bramble: 0, shrub: 0.06, moss: 0.3, heather: 0.08, lichen: 0.2, berry: 0.08 }, goods: ['firewood', 'timber', 'resin', 'mushrooms'], fauna: ['deer', 'hare', 'fox', 'owl', 'woodpecker'], ageBias: 'mature', disturbance: 'snowbreak', productivity: 0.6 }),
    'drought-stressed': type('drought-stressed', 'Drought-stressed Pine', 'Thin, resinous pines on parched ground with bark-beetle pressure',
        { pine: 0.58, larch: 0.14, juniper: 0.12, spruce: 0.1, birch: 0.06 },
        { density: 0.44, openness: 0.46, conifer: true, needleLitter: 0.65, understory: { fern: 0.03, bramble: 0, shrub: 0.1, moss: 0.1, heather: 0.34, lichen: 0.3, berry: 0.1 }, goods: ['resin', 'pine-cones', 'firewood', 'lichen'], fauna: ['bark-beetle', 'woodpecker', 'fox', 'hare', 'ant'], ageBias: 'mature', disturbance: 'drought-stressed', productivity: 0.52 }),
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
    'oak-timber': Object.freeze({ id: 'oak-timber', label: 'Oak timber', category: 'wood' }),
    'beech-timber': Object.freeze({ id: 'beech-timber', label: 'Beech timber', category: 'wood' }),
    'birch-timber': Object.freeze({ id: 'birch-timber', label: 'Birch timber', category: 'wood' }),
    'maple-timber': Object.freeze({ id: 'maple-timber', label: 'Maple timber', category: 'wood' }),
    'chestnut-timber': Object.freeze({ id: 'chestnut-timber', label: 'Chestnut timber', category: 'wood' }),
    'linden-timber': Object.freeze({ id: 'linden-timber', label: 'Linden timber', category: 'wood' }),
    'elm-timber': Object.freeze({ id: 'elm-timber', label: 'Elm timber', category: 'wood' }),
    'alder-timber': Object.freeze({ id: 'alder-timber', label: 'Alder timber', category: 'wood' }),
    'spruce-timber': Object.freeze({ id: 'spruce-timber', label: 'Spruce timber', category: 'wood' }),
    'fir-timber': Object.freeze({ id: 'fir-timber', label: 'Fir timber', category: 'wood' }),
    'pine-timber': Object.freeze({ id: 'pine-timber', label: 'Pine timber', category: 'wood' }),
    'larch-timber': Object.freeze({ id: 'larch-timber', label: 'Larch timber', category: 'wood' }),
    'juniper-timber': Object.freeze({ id: 'juniper-timber', label: 'Juniper wood', category: 'wood' }),
    firewood: Object.freeze({ id: 'firewood', label: 'Firewood', category: 'wood' }),
    charcoal: Object.freeze({ id: 'charcoal', label: 'Charcoal', category: 'wood' }),
    mushrooms: Object.freeze({ id: 'mushrooms', label: 'Mushrooms', category: 'gather' }),
    chanterelle: Object.freeze({ id: 'chanterelle', label: 'Chanterelles', category: 'gather' }),
    porcini: Object.freeze({ id: 'porcini', label: 'Porcini', category: 'gather' }),
    'wild-garlic': Object.freeze({ id: 'wild-garlic', label: 'Wild garlic', category: 'gather' }),
    'wood-sorrel': Object.freeze({ id: 'wood-sorrel', label: 'Wood sorrel', category: 'gather' }),
    'wild-strawberry': Object.freeze({ id: 'wild-strawberry', label: 'Wild strawberries', category: 'gather' }),
    sloes: Object.freeze({ id: 'sloes', label: 'Sloes', category: 'gather' }),
    'crab-apples': Object.freeze({ id: 'crab-apples', label: 'Crab apples', category: 'gather' }),
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
    'spruce-cones': Object.freeze({ id: 'spruce-cones', label: 'Spruce cones', category: 'mast' }),
    'fir-cones': Object.freeze({ id: 'fir-cones', label: 'Fir cones', category: 'mast' }),
    'pine-cones': Object.freeze({ id: 'pine-cones', label: 'Pine cones', category: 'mast' }),
    resin: Object.freeze({ id: 'resin', label: 'Resin', category: 'gather' }),
    'juniper-berries': Object.freeze({ id: 'juniper-berries', label: 'Juniper berries', category: 'gather' }),
    blueberries: Object.freeze({ id: 'blueberries', label: 'Blueberries', category: 'gather' }),
    lingonberries: Object.freeze({ id: 'lingonberries', label: 'Lingonberries', category: 'gather' }),
    lichen: Object.freeze({ id: 'lichen', label: 'Lichen', category: 'gather' }),
    bark: Object.freeze({ id: 'bark', label: 'Bark', category: 'gather' }),
    game: Object.freeze({ id: 'game', label: 'Wild game', category: 'hunt' }),
    fur: Object.freeze({ id: 'fur', label: 'Furs', category: 'hunt' }),
    hides: Object.freeze({ id: 'hides', label: 'Hides', category: 'hunt' }),
    'cured-game': Object.freeze({ id: 'cured-game', label: 'Cured game', category: 'hunt', processed: true }),
    'tanned-fur': Object.freeze({ id: 'tanned-fur', label: 'Tanned furs', category: 'hunt', processed: true }),
    'cured-hides': Object.freeze({ id: 'cured-hides', label: 'Cured hides', category: 'hunt', processed: true }),
});

const SEASON_GOODS = Object.freeze({
    spring: { herbs: 0.9, 'wild-garlic': 0.88, 'wood-sorrel': 0.72, 'wild-strawberry': 0.3, 'birch-sap': 0.9, 'maple-syrup': 0.75, 'linden-flower': 0.45, honey: 0.55, beeswax: 0.25, mushrooms: 0.18, berries: 0.12, game: 0.3, fur: 0.25, hides: 0.2, resin: 0.22, lichen: 0.2 },
    summer: { herbs: 0.65, 'wild-garlic': 0.38, 'wood-sorrel': 0.55, 'wild-strawberry': 0.9, chanterelle: 0.18, 'linden-flower': 0.95, honey: 0.95, beeswax: 0.55, berries: 0.9, mushrooms: 0.3, game: 0.35, fur: 0.2, hides: 0.16, 'maple-syrup': 0.3, resin: 0.75, blueberries: 0.9, lingonberries: 0.45, lichen: 0.25 },
    autumn: { mushrooms: 0.95, chanterelle: 0.9, porcini: 0.82, sloes: 0.76, 'crab-apples': 0.7, 'wood-sorrel': 0.3, 'wild-strawberry': 0.15, berries: 0.55, acorns: 0.95, beechnuts: 0.9, chestnuts: 0.95, truffles: 0.7, game: 0.9, fur: 0.5, hides: 0.45, herbs: 0.25, honey: 0.2, beeswax: 0.18, resin: 0.5, 'spruce-cones': 0.8, 'fir-cones': 0.8, 'pine-cones': 0.9, 'juniper-berries': 0.85, blueberries: 0.35, lingonberries: 0.9 },
    winter: { game: 0.55, fur: 0.85, hides: 0.65, mushrooms: 0.08, berries: 0.04, charcoal: 0.5, resin: 0.05, 'spruce-cones': 0.35, 'fir-cones': 0.32, 'pine-cones': 0.45, 'juniper-berries': 0.5, lichen: 0.3 },
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
    crossbill: Object.freeze({ label: 'Crossbill', group: 'bird', note: 'working a cone crop in the crown' }),
    capercaillie: Object.freeze({ label: 'Capercaillie', group: 'bird', note: 'moving heavily through the conifer understorey' }),
    wolf: Object.freeze({ label: 'Wolf', group: 'predator', note: 'following the deer trails' }),
    lynx: Object.freeze({ label: 'Lynx', group: 'predator', note: 'watching from a windthrow thicket' }),
    'bark-beetle': Object.freeze({ label: 'Bark beetle', group: 'insect', note: 'boring beneath the bark' }),
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
    const { moisture, temperature, height, seed } = ctx;
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
    const high = height > 0.8;
    const coniferPatch = coarseUnit(seed, x, y, 7, 0x434f4e49);
    const pinePatch = coarseUnit(seed, x, y, 8, 0x50494e45);
    const larchPatch = coarseUnit(seed, x, y, 9, 0x4c4152);
    const relief = coarseUnit(seed, x, y, 6, 0x52454c49);

    // The high country is a mosaic: warm, sheltered slopes keep broadleaf
    // hillside woods; exposed and cold slopes turn to spruce, fir and finally
    // wind-bent subalpine scrub.
    if (height > 0.9) {
        if (temperature > 0.5 && relief > 0.45) return 'hillside';
        return coniferPatch > 0.24 ? 'subalpine-scrub' : 'mountain-conifer';
    }
    if (high) {
        // Cool high ground is not automatically conifer: a sheltered slope
        // above the lowland woods still carries beech and maple. Exposed or
        // genuinely cold high ground remains part of the conifer belt.
        if (!cold && relief > 0.55) return 'hillside';
        if (cold) {
            // Sheltered cold slopes still carry a layered spruce/fir/pine/larch
            // canopy. Without this transition belt, a northern realm's entire
            // high country collapsed into mountain-conifer or subalpine-scrub.
            if (coniferPatch > 0.62) return 'subalpine-scrub';
            if (coniferPatch < 0.38) return 'mixed-conifer';
            return 'mountain-conifer';
        }
        return coniferPatch > 0.5 ? 'mountain-conifer' : 'mixed-conifer';
    }
    if (wet && cold && coniferPatch > 0.3) return 'wet-conifer';
    if (wet) return 'alluvial';
    if (cold) {
        // A minority of cold, low sites remain open birch; the rest become the
        // dark spruce/fir core, with larch on the drier margins and pine on
        // thin, dry ground.
        if (coniferPatch < 0.26) return 'birchwood';
        if (moisture > 0.62 && pinePatch < 0.55) return 'wet-conifer';
        if (moisture < 0.46) return pinePatch > 0.45 ? 'pine-heath' : 'pinewood';
        if (larchPatch > 0.72) return 'larchwood';
        if (pinePatch > 0.68) return 'pinewood';
        return coniferPatch > 0.58 ? 'firwood' : 'sprucewood';
    }
    if (warm && moisture > 0.48) return 'chestnut-grove';
    if (dry) {
        if (temperature < 0.5 && coniferPatch > 0.45) return pinePatch > 0.55 ? 'pine-heath' : 'pinewood';
        return 'oakwood';
    }
    if (moisture > 0.62) return 'beechwood';
    if (moisture > 0.54) return 'maplewood';
    if (moisture > 0.48) return 'linden-elm';

    // Temperate transition woods carry conifer patches rather than one
    // repeated spruce stamp. The old broadleaf patch logic remains underneath.
    if (temperature < 0.55 && coniferPatch > 0.84) return 'mixed-conifer';
    if (temperature < 0.53 && larchPatch > 0.82) return 'larchwood';
    if (coniferPatch > 0.94) return 'pinewood';
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

// Succession is deliberately expressed as ages, not as a second formation
// taxonomy. The renderer and the resource layer keep using the shared
// formations; a disturbance progresses from its fresh formation to
// regenerating regrowth and finally back to the site's original woodland.
export const FOREST_SUCCESSION_PROFILES = Object.freeze({
    burned: Object.freeze({
        freshDays: 80, regrowthDays: 180, youngDays: 360, recoveredDays: 520,
        freshLabel: 'Burn Scar', regrowthLabel: 'Post-fire Regrowth', youngLabel: 'Young Post-fire Wood',
        recoveryLabel: 'Recovering Burn Site', severity: 0.35, spreadChance: 0.16,
    }),
    windthrow: Object.freeze({
        freshDays: 60, regrowthDays: 150, youngDays: 300, recoveredDays: 440,
        freshLabel: 'Windthrow', regrowthLabel: 'Post-storm Regrowth', youngLabel: 'Young Storm Gap Wood',
        recoveryLabel: 'Recovering Windthrow', severity: 0.55, spreadChance: 0.11,
    }),
    diseased: Object.freeze({
        freshDays: 100, regrowthDays: 220, youngDays: 420, recoveredDays: 600,
        freshLabel: 'Diseased Stand', regrowthLabel: 'Disease Recovery', youngLabel: 'Young Recovery Wood',
        recoveryLabel: 'Recovering Diseased Stand', severity: 0.7, spreadChance: 0.09,
    }),
    'bark-beetle': Object.freeze({
        freshDays: 80, regrowthDays: 190, youngDays: 380, recoveredDays: 540,
        freshLabel: 'Bark-beetle Outbreak', regrowthLabel: 'Beetle-killed Snags', youngLabel: 'Young Beetle Gap Wood',
        recoveryLabel: 'Recovering Beetle Wood', severity: 0.48, spreadChance: 0.12,
    }),
    snowbreak: Object.freeze({
        freshDays: 60, regrowthDays: 150, youngDays: 320, recoveredDays: 460,
        freshLabel: 'Snowbreak', regrowthLabel: 'Snow-bent Regrowth', youngLabel: 'Young Snow Gap Wood',
        recoveryLabel: 'Recovering Snowbreak', severity: 0.66, spreadChance: 0.04,
    }),
    'drought-stressed': Object.freeze({
        freshDays: 90, regrowthDays: 210, youngDays: 400, recoveredDays: 580,
        freshLabel: 'Drought-stressed Pine', regrowthLabel: 'Drought Recovery', youngLabel: 'Young Dry Wood',
        recoveryLabel: 'Recovering Drought Wood', severity: 0.72, spreadChance: 0.06,
    }),
});

export const FOREST_DISTURBANCE_KINDS = Object.freeze(Object.keys(FOREST_SUCCESSION_PROFILES));

export function forestSuccessionProfile(kind) {
    return FOREST_SUCCESSION_PROFILES[kind] || null;
}

// Return the current ecological stage for one disturbance age. The stage names
// are used by the renderer, the survey and the save layer; no caller needs to
// duplicate the day thresholds.
export function forestSuccessionStage(kind, age) {
    const profile = forestSuccessionProfile(kind);
    if (!profile) return null;
    const days = Math.max(0, Math.floor(Number(age) || 0));
    if (days < profile.freshDays) {
        return { id: 'fresh', formation: kind, disturbance: kind, label: profile.freshLabel, ageClass: 'mature' };
    }
    if (days < profile.regrowthDays) {
        return { id: 'regrowth', formation: 'regenerating', disturbance: kind, label: profile.regrowthLabel, ageClass: 'young' };
    }
    if (days < profile.youngDays) {
        return { id: 'young', formation: 'regenerating', disturbance: kind, label: profile.youngLabel, ageClass: 'young' };
    }
    if (days < profile.recoveredDays) {
        return { id: 'recovering', formation: null, disturbance: null, label: profile.recoveryLabel, ageClass: 'young' };
    }
    return { id: 'recovered', formation: null, disturbance: null, label: null, ageClass: null };
}

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
    const baseFormation = formation;
    let disturbance = formation.disturbance;

    const damage = coarseUnit(seed, tx, ty, 7, 0x44414d47);
    // Distinct hazards use independent patches. One shared damage hash made
    // bark beetle, snowbreak and drought overlap in the same narrow tail, so a
    // whole conifer type could be unreachable even though the pressure existed.
    const barkDamage = coarseUnit(seed, tx, ty, 7, 0x42454154);
    const snowDamage = coarseUnit(seed, tx, ty, 7, 0x534e4f57);
    const droughtDamage = coarseUnit(seed, tx, ty, 7, 0x44524f55);
    const coniferBase = Boolean(baseFormation.conifer);
    if (stockRatio < 0.18 && forest) {
        formation = FOREST_TYPES.cutover;
        disturbance = 'cutover';
    } else if (forest && damage > 0.982) {
        formation = FOREST_TYPES.burned;
        disturbance = 'burned';
    } else if (forest && coniferBase && barkDamage > 0.93) {
        formation = FOREST_TYPES['bark-beetle'];
        disturbance = 'bark-beetle';
    } else if (forest && coniferBase && snowDamage > 0.93) {
        formation = FOREST_TYPES.snowbreak;
        disturbance = 'snowbreak';
    } else if (forest && coniferBase && moisture < 0.58 && droughtDamage > 0.9) {
        formation = FOREST_TYPES['drought-stressed'];
        disturbance = 'drought-stressed';
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

    // A live disturbance overrides the deterministic base state. This is the
    // bridge between the seeded landscape and the persistent succession model:
    // a young burn is still a burn, a recovering burn is a regenerating wood,
    // and a recovered site returns to the woodland that existed before it.
    let succession = null;
    let forcedAgeClass = null;
    const activeSuccession = context.succession;
    if (forest && activeSuccession && activeSuccession.kind) {
        const stage = forestSuccessionStage(activeSuccession.kind, activeSuccession.age);
        if (stage) {
            succession = {
                kind: activeSuccession.kind,
                age: Math.max(0, Math.floor(Number(activeSuccession.age) || 0)),
                stage: stage.id,
                label: stage.label,
            };
            if (stage.formation) {
                formation = FOREST_TYPES[stage.formation] || formation;
                disturbance = stage.disturbance || null;
            } else {
                // A recovered site must not fall back to the base hash's
                // disturbance; it returns to the undisturbed formation.
                formation = baseFormation;
                disturbance = null;
            }
            forcedAgeClass = stage.ageClass;
        }
    }

    const ageClass = forcedAgeClass || ageClassFor(formation, tx, ty, seed);
    const ageScale = AGE_SCALE[ageClass];
    const density = clamp01(formation.density * (0.58 + forestPressure * 0.42) * (0.72 + stockRatio * 0.28));
    const canopy = clamp01(density * (1 - clearing * 0.74) * (ageClass === 'young' ? 0.82 : 1));
    const light = clamp01(0.22 + (1 - canopy) * 0.78 + (edge ? 0.12 : 0));
    const speciesWeightTotal = Object.values(formation.species).reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0) || 1;
    const coniferShare = clamp01(Object.entries(formation.species).reduce((sum, [id, weight]) =>
        sum + (FOREST_SPECIES[id]?.conifer ? Math.max(0, Number(weight) || 0) : 0), 0) / speciesWeightTotal);
    let treeChance = clamp01(0.08 + density * 0.78 + (edge ? 0.06 : 0) - clearing * 0.56);
    if (formation.id === 'regenerating') treeChance = clamp01(0.32 + density * 0.4);
    if (formation.id === 'cutover') treeChance = clamp01(0.12 + density * 0.62);
    if (!forest) treeChance = 0;

    const fern = clamp01(0.12 + moisture * 0.38 + formation.understory.fern * 0.8 + (ageClass === 'ancient' ? 0.14 : 0) + light * 0.08);
    const bramble = clamp01(0.06 + formation.understory.bramble * 0.9 + (edge ? 0.18 : 0) + light * 0.1);
    const shrub = clamp01(0.08 + formation.understory.shrub * 0.8 + (edge ? 0.2 : 0));
    const moss = clamp01(0.08 + moisture * 0.34 + formation.understory.moss * 0.9 + (ageClass === 'ancient' ? 0.16 : 0));
    const heather = clamp01((formation.understory.heather || 0) * 0.9 + (temperature < 0.48 ? 0.12 : 0));
    const lichen = clamp01((formation.understory.lichen || 0) * 0.9 + (coniferShare * 0.18) + (height > 0.66 ? 0.06 : 0) + (temperature < 0.5 ? 0.1 : 0));
    const berry = clamp01((formation.understory.berry || 0) * 0.9 + (coniferShare * 0.12) + (moisture > 0.55 ? 0.08 : 0));
    const litter = clamp01(0.16 + (1 - canopy) * 0.34 + moisture * 0.12 + (ageClass === 'ancient' ? 0.18 : 0));
    // Needle litter is a separate material from broadleaf litter: it is slower
    // to break down, acidifies the topsoil and gives the conifer floor its
    // characteristic rust-brown carpet. It is derived, never saved separately.
    const needles = clamp01(coniferShare * (0.55 + litter * 0.22) + (formation.needleLitter || 0) * 0.3);

    const dominantSpecies = weightedPick(formation.species, unitHash(seed, tx, ty, 0x53504543));
    // Linden and elm share one ecological formation but the survey names the
    // stand after the linden/elm share that actually dominates the local
    // canopy; another species may still be the single most common tree.
    const lindenElm = formation.id === 'linden-elm'
        ? (dominantSpecies === 'elm' ? 'elm' : dominantSpecies === 'linden' ? 'linden'
            : (Number(formation.species.elm) || 0) > (Number(formation.species.linden) || 0) ? 'elm' : 'linden')
        : null;
    const standLabel = lindenElm === 'elm' ? 'Elm Stand' : lindenElm === 'linden' ? 'Linden Stand' : formation.label;
    const speciesList = Object.entries(formation.species)
        .sort((a, b) => b[1] - a[1])
        .map(([id, weight]) => ({ id, label: FOREST_SPECIES[id]?.label || id, weight }));
    // Diversity is measured from the actual species weights, not from a broad
    // "conifer share". A five-species mixed conifer wood is not a monoculture.
    const speciesSimpson = speciesList.reduce((sum, entry) =>
        sum + Math.pow(Math.max(0, entry.weight) / speciesWeightTotal, 2), 0);
    const speciesDiversity = clamp01(1 - speciesSimpson);

    const baseGoods = new Set([...formation.goods]);
    for (const entry of speciesList) {
        for (const good of FOREST_SPECIES[entry.id]?.goods || []) baseGoods.add(good);
        // Species-specific timber keeps an oak beam distinguishable from beech,
        // birch, maple, chestnut, linden, elm or alder in the forest ledger.
        const wood = FOREST_SPECIES[entry.id]?.wood;
        if (wood) baseGoods.add(wood);
    }
    // Every wood can be worked for timber and firewood; charcoal belongs to
    // the older, denser stands and to burn scars.
    baseGoods.add('timber');
    baseGoods.add('firewood');
    if (ageClass === 'ancient' || disturbance === 'burned') baseGoods.add('charcoal');
    if (baseGoods.has('honey')) baseGoods.add('beeswax');
    if (baseGoods.has('game')) { baseGoods.add('fur'); baseGoods.add('hides'); }

    const trail = coarseUnit(seed, tx, ty, 6, 0x54524149) > 0.78 || edge;
    const successionProfile = succession ? forestSuccessionProfile(succession.kind) : null;
    const successionProgress = succession && successionProfile
        ? clamp01(succession.age / Math.max(1, successionProfile.recoveredDays)) : 0;
    const successionStumps = succession
        ? (succession.kind === 'windthrow' ? 0.3 * (1 - successionProgress)
            : succession.kind === 'burned' ? 0.2 * (1 - successionProgress) : 0)
        : 0;
    const successionLogs = succession
        ? (succession.kind === 'windthrow' ? 0.42 * (1 - successionProgress)
            : succession.kind === 'burned' ? 0.12 * (1 - successionProgress) : 0)
        : 0;
    const stumps = clamp01((formation.id === 'cutover' ? 0.42 : 0) + (stockRatio < 0.65 ? (0.65 - stockRatio) * 0.8 : 0) + (disturbance === 'windthrow' ? 0.22 : 0) + successionStumps);
    const logs = clamp01((formation.id === 'windthrow' ? 0.5 : 0) + (disturbance === 'burned' ? 0.12 : 0) + (ageClass === 'ancient' ? 0.14 : 0) + successionLogs);
    const mushrooms = clamp01(0.08 + moisture * 0.3 + (formation.id === 'beechwood' ? 0.12 : 0) + (disturbance === 'burned' ? 0.2 : 0) + (stumps > 0.2 ? 0.12 : 0));
    const stones = clamp01((height > 0.56 ? (height - 0.56) * 1.4 : 0) + (formation.id === 'hillside' ? 0.18 : 0));
    const roots = clamp01((ageClass === 'ancient' ? 0.3 : 0.08) + (height > 0.56 ? 0.1 : 0));
    const flowers = clamp01((edge ? 0.35 : 0.06) + (clearing > 0.2 ? 0.3 : 0) + (formation.id === 'regenerating' ? 0.12 : 0));
    const humus = clamp01(litter * 0.62 + moss * 0.24 + (ageClass === 'ancient' ? 0.16 : 0));
    const sourSoil = clamp01((coniferShare - 0.25) * 1.4 + (moisture < 0.5 ? 0.18 : 0));
    const soil = coniferShare > 0.45 ? (moisture > 0.72 ? 'alluvial' : 'podzol') : moisture > 0.72 ? 'alluvial' : moisture < 0.4 ? 'dry' : humus > 0.52 ? 'humus' : 'loam';
    // These are deterministic pressure proxies, not a second population or soil
    // simulation: harvest lowers the stand, trails compact the ground, and
    // repeated extraction reduces the available game cover.
    const compaction = clamp01((1 - stockRatio) * 0.5 + (trail ? 0.12 : 0) + (formation.id === 'cutover' ? 0.25 : 0));
    const huntingPressure = clamp01((1 - stockRatio) * 0.38 + (edge ? 0.1 : 0) + (formation.id === 'cutover' ? 0.14 : 0));

    // Snow settles deeper on high, exposed ground and persists under a dense
    // conifer canopy. This is a compact derived property, not a second snow
    // simulation: the renderer still uses the weather-driven snow cover, while
    // the survey exposes the resulting local depth in centimetres.
    const exposure = clamp01((edge ? 0.28 : 0) + (1 - canopy) * 0.34 + Math.max(0, height - 0.52) * 0.9);
    const snowPotential = clamp01(0.08 + height * 0.46 + exposure * 0.24 + coniferShare * 0.08 - Math.max(0, temperature - 0.5) * 0.3);
    // Wet stands hold standing water in hollows and show glossy bark after
    // rain. This is derived from site moisture and formation, not a second
    // hydrology grid.
    const wetness = clamp01((moisture - 0.48) * 1.35 + (formation.id === 'wet-conifer' ? 0.2 : 0) + (formation.id === 'alluvial' ? 0.12 : 0));
    const windExposure = clamp01(exposure * 0.72 + (height > 0.76 ? 0.16 : 0) + (formation.id === 'subalpine-scrub' ? 0.12 : 0));
    const treeline = formation.id === 'subalpine-scrub' || (height > 0.88 && temperature < 0.48);
    // Fire and pest pressure are likewise diagnostics derived from the same
    // moisture, heat, litter and stocking inputs. They add no per-tick state.
    const fireRisk = clamp01((1 - moisture) * 0.46 + Math.max(0, temperature - 0.48) * 0.48
        + coniferShare * 0.14 + needles * 0.12
        + (disturbance === 'drought-stressed' ? 0.18 : 0)
        + (disturbance === 'bark-beetle' ? 0.1 : 0));
    const pestRisk = clamp01(coniferShare * 0.34 + (1 - stockRatio) * 0.2
        + Math.max(0, temperature - 0.58) * 0.38
        + (disturbance === 'bark-beetle' ? 0.38 : 0)
        + (disturbance === 'drought-stressed' ? 0.12 : 0));
    const monoculture = clamp01((speciesSimpson - 0.22) / 0.58);
    // Large herbivores and predators are habitat-derived pressures, not new
    // saved populations. They let browsing slow regrowth and predation shape
    // herd growth without adding a second trophic simulation.
    const browsingPressure = clamp01(
        (formation.fauna.includes('deer') ? 0.34 : 0)
        + (formation.fauna.includes('roe-deer') ? 0.24 : 0)
        + (ageClass === 'young' ? 0.1 : 0) + (edge ? 0.08 : 0));
    const predatorPressure = clamp01(
        (formation.fauna.includes('wolf') ? 0.48 : 0)
        + (formation.fauna.includes('lynx') ? 0.3 : 0)
        + (formation.fauna.includes('fox') ? 0.08 : 0));
    const deadwood = clamp01(logs * 0.72 + stumps * 0.32
        + (ageClass === 'ancient' ? 0.12 : 0) + (disturbance === 'diseased' ? 0.12 : 0));
    const structure = {
        herb: clamp01((fern + flowers + heather) / 3),
        shrub: clamp01(shrub * 0.55 + bramble * 0.3 + berry * 0.45),
        sapling: clamp01((formation.id === 'regenerating' ? 0.55 : 0.16) + (1 - canopy) * 0.28 + (stockRatio < 0.7 ? 0.12 : 0)),
        canopy,
        deadwood,
    };
    // Ground shade is the share of direct sky blocked by the stand. It combines
    // the three physical inputs the renderer needs (crown cover, stem density
    // and conifer share) instead of reusing one canopy number for every wood.
    // Clearings and edges are real gaps, so they subtract from the shade.
    const groundShade = clamp01(canopy * 0.56 + density * 0.34 + coniferShare * 0.24
        - clearing * 0.62 - (edge ? 0.2 : 0));
    // Visibility is a sight-line property, not an arbitrary fog switch. Dense
    // crowns and tightly packed conifer stems close the view; an edge or a
    // clearing opens it again. The radius is derived from the same value so the
    // renderer and the gathering work factor cannot drift apart.
    const visibility = clamp01(1 - canopy * 0.62 - coniferShare * 0.2 - density * 0.16
        + (edge ? 0.18 : 0) + clearing * 0.15);
    const sightRadius = 2 + Math.round(visibility * 8);

    return {
        x: tx, y: ty, seed,
        forest,
        type: formation.id,
        label: succession?.label || standLabel,
        subtype: lindenElm,
        note: formation.note,
        succession,
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
        ground: { litter, needles, lichen, berry, moss, roots, stones, mushrooms, stumps, logs, trail, flowers, humus, soil, sourSoil, compaction, huntingPressure },
        goods: [...baseGoods].sort(),
        fauna: [...formation.fauna],
        coniferShare,
        speciesDiversity,
        monoculture,
        moisture,
        temperature,
        height,
        wetness,
        windExposure,
        treeline,
        conifer: coniferShare >= 0.4,
        coniferLabel: [...speciesList].filter(entry => FOREST_SPECIES[entry.id]?.conifer).map(entry => entry.label).join(' · '),
        visibility,
        groundShade,
        lightShaft: clamp01(light * (1 - canopy * 0.46)),
        exposure,
        snowPotential,
        fireRisk,
        pestRisk,
        sightRadius,
        deadwood,
        structure,
        browsingPressure,
        predatorPressure,
        productivity: formation.productivity * (ageClass === 'ancient' ? 1.18 : ageClass === 'young' ? 0.72 : 1) * (0.68 + stockRatio * 0.32),
        formation: formation.id,
    };
}

// Ambient shade cast by the local canopy. This is a pure render profile: the
// renderer supplies the current sun and snow, so no shadow state enters the
// save and the same stand always yields the same result at the same hour.
// Only closed, conifer-dominated stands earn a visible floor pass; open pine
// and heath keep their bright ground.
export function forestCanopyShade(stand, { sun = null, snowCover = 0 } = {}) {
    if (!stand?.forest) return { alpha: 0, shade: 0, reach: 0, offsetX: 0, offsetY: 0, color: '#07110b' };
    const density = clamp01(Number(stand.density) || 0);
    const conifer = clamp01(Number(stand.coniferShare) || 0);
    const shade = clamp01(Number(stand.groundShade) || 0);
    if (conifer < 0.4 || density < 0.55 || shade < 0.75) {
        return { alpha: 0, shade, reach: 0, offsetX: 0, offsetY: 0, color: '#07110b' };
    }
    const snow = clamp01(snowCover);
    const elevation = clamp01(Number(sun?.elevation ?? 0.75));
    const lowSun = 1 - elevation;
    // Low sun reaches further into the stand and makes the cool floor shade
    // stronger. Snow reflects light back up, so the same canopy casts a lighter
    // blue-grey shade instead of a soot-black patch.
    const alpha = clamp01(shade * (0.2 + lowSun * 0.16) * (1 - snow * 0.32));
    const reach = (0.7 + shade * 0.65) * (1 + lowSun * 0.9);
    return {
        alpha,
        shade,
        reach,
        offsetX: (Number(sun?.shadowX) || 0) * reach * 0.55,
        offsetY: (Number(sun?.shadowY) || 0) * reach * 0.4,
        color: snow > 0.45 ? '#13232a' : '#07110b',
    };
}

// A single data-driven sight block shared by the atmospheric wall and the
// per-entity line-of-sight test. It deliberately uses the same closed-canopy
// gate as `forestCanopyShade`: open pine and larch stay below the threshold and
// remain transparent, while dense spruce/fir/mixed stands close the view.
export function forestSightBlock(stand) {
    if (!stand?.forest) return 0;
    const density = clamp01(Number(stand.density) || 0);
    const canopy = clamp01(Number(stand.canopy) || 0);
    const conifer = clamp01(Number(stand.coniferShare) || 0);
    const clearing = clamp01(Number(stand.clearing) || 0);
    const shade = clamp01(Number(stand.groundShade) || 0);
    // `groundShade` is the shared closed-canopy gate. Open pine (around .69)
    // and larch (around .73) stay below it, so their view is never cut off even
    // though both are conifer-dominated. Spruce, fir, wet and mixed closed
    // stands clear the threshold and receive the block.
    if (conifer < 0.45 || density < 0.55 || canopy < 0.55 || shade < 0.74 || clearing > 0.24) return 0;
    const visibility = clamp01(Number(stand.visibility) || 0);
    return Math.min(0.48, clamp01(0.1 + (1 - visibility) * 0.5
        + (density - 0.55) * 0.4 + (canopy - 0.5) * 0.2));
}

// Stand-dependent sight profile used by the screen-space forest wall. The
// renderer still draws one cached overlay, never a per-tile gradient. Actual
// per-entity occlusion is handled by `forestLineOfSightBlocked()`; this profile
// only describes how dark the atmospheric wall should be.
export function forestSightProfile(stand, { tileSize = 48, viewportWidth = 800, viewportHeight = 800 } = {}) {
    const none = {
        limited: false, strength: 0, radiusPx: 0, innerPx: 0, radiusTiles: 0,
        visibility: clamp01(Number(stand?.visibility) || 0), sightRadius: Number(stand?.sightRadius) || 0,
        color: '9,18,15',
    };
    const strength = forestSightBlock(stand);
    if (strength <= 0) return none;
    const visibility = clamp01(Number(stand.visibility) || 0);
    const radiusTiles = Math.max(2.2, (Number(stand.sightRadius) || 3) * (0.9 + strength * 0.8));
    const cell = Math.max(8, Number(tileSize) || 48);
    const radiusPx = Math.min(Math.max(2.4 * cell, radiusTiles * cell),
        Math.hypot(Number(viewportWidth) || 800, Number(viewportHeight) || 800) * 0.72);
    return {
        limited: true,
        strength,
        radiusPx,
        innerPx: radiusPx * 0.52,
        radiusTiles,
        visibility,
        sightRadius: Number(stand.sightRadius) || 0,
        color: '9,18,15',
    };
}

// Scalar DDA from a viewer to a target tile. It walks tile boundaries without
// allocating an array, skips the viewer's and target's own tiles, and reports
// the first sufficiently dense stand on the line. The renderer calls this only
// when its visible-entity cache is rebuilt, never once per pixel.
export function forestLineOfSightBlocked(ax, ay, bx, by, blockAt, minDistance = 2.1, sampleStep = 0.55) {
    if (typeof blockAt !== 'function') return false;
    const dx = Number(bx) - Number(ax);
    const dy = Number(by) - Number(ay);
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= minDistance) return false;
    const targetTx = Math.floor(Number(bx));
    const targetTy = Math.floor(Number(by));
    let lastTx = Math.floor(Number(ax));
    let lastTy = Math.floor(Number(ay));
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.2, Number(sampleStep) || 0.55)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const tx = Math.floor(Number(ax) + dx * t);
        const ty = Math.floor(Number(ay) + dy * t);
        if (tx === lastTx && ty === lastTy) continue;
        lastTx = tx;
        lastTy = ty;
        if (tx === targetTx && ty === targetTy) continue;
        if (blockAt(tx, ty) > 0) return true;
    }
    return false;
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

// Compaction is a real regeneration brake, not only a floor tint. A stand
// with heavy trail/cut-over pressure restores less stock per elapsed period;
// the caller still guarantees at least one unit once a period has elapsed.
export function forestRegrowthFactor(stand) {
    if (!stand) return 1;
    const compaction = clamp01(Number(stand.ground?.compaction) || 0);
    const browsing = clamp01(Number(stand.browsingPressure) || 0);
    // Browsing removes young shoots before they can close the canopy. It is a
    // derived habitat pressure, so no new per-tile state or save field is
    // needed; a stand without a browser remains at the old compaction curve.
    return Math.max(0.3, (1 - compaction * 0.65) * (1 - browsing * 0.22));
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

// Per-tree form. A stand supplies the ecological age class, but every tree
// inside it still gets its own height, trunk, crown width and lean. This is
// deliberately derived from a caller-provided roll: the renderer can use the
// same tree seed for every frame, and no per-tree state enters the save.
export function forestAgeScale(ageClass) {
    return AGE_SCALE[ageClass] || AGE_SCALE.mature;
}

export function forestTreeForm(stand, roll = 0.5) {
    if (!stand?.forest) {
        return { ageClass: 'mature', ageScale: 1, heightScale: 1, trunkScale: 1, crownScale: 1, lean: 0 };
    }
    const seed = clamp01(Number(roll) || 0);
    const ageClass = pickAgeClass(stand, seed);
    const ageScale = forestAgeScale(ageClass);
    return {
        ageClass,
        ageScale,
        heightScale: 0.82 + fract(seed * 13.17) * 0.34,
        trunkScale: 0.84 + fract(seed * 7.73) * 0.34,
        crownScale: 0.84 + fract(seed * 9.41) * 0.34,
        lean: (fract(seed * 5.37) - 0.5) * 2.6,
    };
}

export function forestGoodsFor(stand, dayOfYear, climate = 'temperate') {
    if (!stand) return [];
    const seasonal = seasonGoods(dayOfYear, climate);
    const goods = [];
    for (const id of stand.goods) {
        // A seasonal good is absent when its season has no entry. Falling back
        // to a generic number here would put linden blossom and berries on a
        // snowbound winter survey. Wood is the exception: every species timber
        // stays workable all year and must reach the gather ledger.
        const category = FOREST_GOODS[id]?.category;
        if (seasonal[id] === undefined && category !== 'wood') continue;
        const base = category === 'wood'
            ? (id === 'timber' ? 0.9 : id === 'firewood' ? 0.82 : id === 'charcoal' ? 0.55 : 0.68)
            : 0.2;
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
    // Conifer woods carry a different observed community: crossbills work the
    // cones, capercaillie shelter in the understorey, and lynx/wolf sign appears
    // in the deeper stands. These are habitat observations, not extra herds.
    if (stand.coniferShare > 0.35) extra.push('crossbill');
    if (stand.coniferShare > 0.5 && stand.ageClass === 'ancient') extra.push('capercaillie');
    if (stand.coniferShare > 0.5 && season === 'winter') extra.push('wolf');
    if (stand.coniferShare > 0.58 && stand.ageClass === 'ancient') extra.push('lynx');
    if (stand.disturbance === 'bark-beetle') extra.push('bark-beetle');
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

// Small mammals and insects are a local, deterministic population layer rather
// than one decorative marker per tile. Counts respond to deadwood, flowers,
// moisture, season and stand age; they are intentionally not a second herd
// save because they are short-lived and habitat-bound.
export function forestMicrofaunaAt(stand, dayOfYear = 150, climate = 'temperate', roll = 0.5) {
    if (!stand?.forest) return [];
    const season = seasonKeyFor(dayOfYear, climate);
    const winter = season === 'winter';
    const shade = clamp01(1 - (stand.light || 0.4));
    const counts = [
        ['beetle', 'Stag beetle', Math.max(0, Math.round((stand.ground?.logs || 0) * 5 + (stand.ageClass === 'ancient' ? 2 : 0) + roll * 1.4))],
        ['bark-beetle', 'Bark beetle', Math.max(0, Math.round((stand.coniferShare || 0) * 4 + (stand.disturbance === 'bark-beetle' ? 4 : 0)))],
        ['ant', 'Wood ant', winter ? 0 : Math.max(0, Math.round((stand.ground?.litter || 0) * 4 + (stand.edge ? 1 : 0) + roll))],
        ['butterfly', 'Woodland butterfly', winter ? 0 : Math.max(0, Math.round((stand.ground?.flowers || 0) * 5 + (stand.clearing || 0) * 3 + roll * 0.8))],
        ['bee', 'Wild bee', winter ? 0 : Math.max(0, Math.round((stand.ground?.flowers || 0) * 3 + (stand.edge ? 1 : 0)))],
        ['mouse', 'Wood mouse', winter ? Math.max(0, Math.round(shade * 2 + (stand.ground?.litter || 0) * 2)) : Math.max(0, Math.round(shade * 3 + (stand.ground?.litter || 0) * 2 + roll))],
    ];
    return counts
        .filter(([, , count]) => count > 0)
        .slice(0, 5)
        .map(([id, label, count]) => ({ id, label, group: id === 'mouse' ? 'small' : 'insect', count: Math.min(6, count) }));
}

export function forestSnowDepthAt(stand, dayOfYear = 150, climate = 'temperate') {
    if (!stand?.forest) return { depth: 0, cm: 0 };
    const cover = seasonalState(dayOfYear, climate).snowCover;
    // No snow on the ground means no local snow depth, regardless of how
    // exposed the site is. During accumulation, exposure and elevation decide
    // how much of the stand's potential is realised.
    const depth = cover > 0 ? clamp01((Number(stand.snowPotential) || 0) * (0.45 + cover * 0.55)) : 0;
    return { depth, cm: Math.round(depth * 140) };
}

export function forestSurveyAt(x, y, context = {}) {
    const stand = forestStandAt(x, y, context);
    if (!stand.forest) return null;
    const day = Number.isFinite(Number(context.dayOfYear)) ? Number(context.dayOfYear) : 150;
    const climate = context.climate || 'temperate';
    const snow = forestSnowDepthAt(stand, day, climate);
    return {
        ...stand,
        snowDepth: snow.depth,
        snowDepthCm: snow.cm,
        goods: forestGoodsFor(stand, day, climate),
        fauna: forestFaunaFor(stand, day, climate, Number(context.roll ?? 0.5)),
    };
}

// Helper for tests and the survey UI: a stable, human-readable mix string.
export function forestMixLabel(stand) {
    if (!stand?.species?.length) return 'Open ground';
    return stand.species.slice(0, 3).map(entry => entry.label).join(' · ');
}

export const __internals = { hash32, unitHash, coarseUnit, weightedPick };
