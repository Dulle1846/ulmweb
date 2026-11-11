// Tropical rainforest ecology (1.2.4).
//
// This module owns the tropical vocabulary only: species, formations, goods,
// phenology and the derived stand profile. It has no game-state import and no
// renderer import, so the terrain, survey, gathering and tests all read the
// same deterministic data. The existing forest system stays authoritative; a
// tropical stand is an extension of it, never a second forest simulation.

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, x, y, salt) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

function round(value) {
    return Math.round(clamp01(value) * 1000) / 1000;
}

export const TROPICAL_CLIMATE = 'tropical';
export const isTropicalClimate = climate => climate === TROPICAL_CLIMATE;

const good = (id, label, category, extra = {}) => Object.freeze({ id, label, category, ...extra });
const species = (id, definition) => Object.freeze({ id, tropical: true, ...definition });

// ── species ───────────────────────────────────────────────────
// Each tree has a different bole, bark, leaf size and useful product. The
// renderer reads `form`, `buttress`, `emergent`, `palm` and `flowering`; the
// survey and economy read timber, goods and phenology.
export const TROPICAL_SPECIES = Object.freeze({
    kapok: species('kapok', {
        label: 'Kapok tree', latin: 'Ceiba pentandra',
        bark: '#8b8577', barkLight: '#b6ad9a',
        summer: ['#2d6b3b', '#4e9450'], autumn: ['#397548', '#64a45a'],
        form: 'emergent', leafShape: 'palmate', height: 1.52, crown: 1.34, trunk: 1.5, lobes: 4,
        buttress: 1, emergent: 1, flowering: 'cream', fruit: 'kapok-fibre',
        wood: 'kapok-timber', timber: 0.64, firewood: 0.72, charcoal: 0.62,
        goods: ['kapok-fibre', 'stingless-bee-honey', 'herbs', 'orchids'],
        understory: ['fern', 'moss', 'shrub'], leafSize: 'large',
    }),
    mahogany: species('mahogany', {
        label: 'Mahogany', latin: 'Swietenia macrophylla',
        bark: '#61452f', barkLight: '#956d4c',
        summer: ['#245a35', '#438345'], autumn: ['#2c623b', '#508d4d'],
        form: 'spreading', leafShape: 'pinnate', height: 1.3, crown: 1.24, trunk: 1.26, lobes: 4,
        buttress: 0.62, emergent: 0.42, flowering: 'pale-yellow', fruit: 'winged-seeds',
        wood: 'mahogany-timber', timber: 1.42, firewood: 1.04, charcoal: 1.12,
        goods: ['mahogany-timber', 'honey', 'herbs', 'tagua-nuts'],
        understory: ['fern', 'shrub', 'moss'], leafSize: 'medium',
    }),
    'brazil-nut': species('brazil-nut', {
        label: 'Brazil nut', latin: 'Bertholletia excelsa',
        bark: '#76624a', barkLight: '#a18a68',
        summer: ['#2a6139', '#4d8e49'], autumn: ['#316a40', '#57974e'],
        form: 'emergent', leafShape: 'oval', height: 1.44, crown: 1.12, trunk: 1.34, lobes: 3,
        buttress: 0.88, emergent: 1, flowering: 'white', fruit: 'brazil-nuts',
        wood: 'brazil-nut-timber', timber: 1.18, firewood: 1.14, charcoal: 1.08,
        goods: ['brazil-nuts', 'copal-resin', 'tagua-nuts', 'herbs'],
        understory: ['fern', 'moss', 'shrub'], leafSize: 'large',
    }),
    rubber: species('rubber', {
        label: 'Rubber tree', latin: 'Hevea brasiliensis',
        bark: '#8c8272', barkLight: '#b7ab96',
        summer: ['#2f6c3d', '#57994e'], autumn: ['#377647', '#63a55a'],
        form: 'vase', leafShape: 'trifoliate', height: 1.16, crown: 1.02, trunk: 1.04, lobes: 3,
        buttress: 0.34, flowering: 'green-white', fruit: 'rubber-seeds',
        wood: 'rubberwood-timber', timber: 0.92, firewood: 0.94, charcoal: 0.86,
        goods: ['natural-rubber', 'rubberwood-timber', 'cacao-pods', 'herbs'],
        understory: ['fern', 'shrub', 'moss'], leafSize: 'medium',
    }),
    cacao: species('cacao', {
        label: 'Cacao', latin: 'Theobroma cacao',
        bark: '#6e5138', barkLight: '#9c7958',
        summer: ['#376b38', '#5d9844'], autumn: ['#3e733c', '#6aa24c'],
        form: 'understorey', leafShape: 'lance', height: 0.52, crown: 0.78, trunk: 0.42, lobes: 3,
        buttress: 0, flowering: 'pink', fruit: 'cacao-pods', understorey: 1,
        wood: 'cacao-wood', timber: 0.3, firewood: 0.4, charcoal: 0.35,
        goods: ['cacao-pods', 'cocoa', 'vanilla', 'stingless-bee-honey'],
        understory: ['fern', 'shrub', 'moss'], leafSize: 'large',
    }),
    balsa: species('balsa', {
        label: 'Balsa', latin: 'Ochroma pyramidale',
        bark: '#9a907a', barkLight: '#c4b8a0',
        summer: ['#4d8546', '#7eb15c'], autumn: ['#568f4d', '#88b967'],
        form: 'airy', leafShape: 'palmate', height: 1.17, crown: 1.04, trunk: 0.78, lobes: 3,
        buttress: 0.12, flowering: 'white', fruit: 'pioneer-seeds',
        wood: 'balsa-timber', timber: 0.46, firewood: 0.56, charcoal: 0.5,
        goods: ['balsa-timber', 'kapok-fibre', 'passionfruit', 'stingless-bee-honey'],
        understory: ['fern', 'grass', 'shrub'], leafSize: 'giant',
    }),
    fig: species('fig', {
        label: 'Strangler fig', latin: 'Ficus aurea',
        bark: '#716450', barkLight: '#9e8d73',
        summer: ['#245c35', '#438447'], autumn: ['#2c653c', '#4c8e50'],
        form: 'banyan', leafShape: 'oval', height: 1.32, crown: 1.3, trunk: 1.2, lobes: 4,
        buttress: 0.82, aerialRoots: true, flowering: 'hidden', fruit: 'figs',
        wood: 'fig-wood', timber: 0.74, firewood: 0.88, charcoal: 0.78,
        goods: ['figs', 'natural-rubber', 'stingless-bee-honey', 'bromeliads'],
        understory: ['fern', 'moss', 'shrub'], leafSize: 'medium',
    }),
    palm: species('palm', {
        label: 'Rainforest palm', latin: 'Euterpe precatoria',
        bark: '#7f6a4b', barkLight: '#ad9369',
        summer: ['#2e703b', '#5b9c47'], autumn: ['#357b43', '#67a951'],
        form: 'palm', palm: true, leafShape: 'frond', height: 1.12, crown: 0.76, trunk: 0.7, lobes: 2,
        buttress: 0.05, flowering: 'yellow', fruit: 'acai',
        wood: 'palm-wood', timber: 0.38, firewood: 0.52, charcoal: 0.42,
        goods: ['acai', 'palm-fibre', 'palm-oil', 'palmito', 'stingless-bee-honey'],
        understory: ['fern', 'moss', 'shrub'], leafSize: 'giant',
    }),
    ironwood: species('ironwood', {
        label: 'Ironwood', latin: 'Dinizia excelsa',
        bark: '#544737', barkLight: '#806b50',
        summer: ['#225b36', '#407f46'], autumn: ['#29633c', '#49894d'],
        form: 'emergent', leafShape: 'bipinnate', height: 1.48, crown: 1.0, trunk: 1.42, lobes: 3,
        buttress: 1, emergent: 0.88, flowering: 'green', fruit: 'ironwood-pods',
        wood: 'ironwood-timber', timber: 1.66, firewood: 1.24, charcoal: 1.4,
        goods: ['ironwood-timber', 'copal-resin', 'tagua-nuts', 'herbs'],
        understory: ['fern', 'moss', 'shrub'], leafSize: 'small',
    }),
    rosewood: species('rosewood', {
        label: 'Rosewood', latin: 'Dalbergia nigra',
        bark: '#5b412f', barkLight: '#8d6747',
        summer: ['#2c6137', '#4c8d47'], autumn: ['#356b40', '#57964f'],
        form: 'spreading', leafShape: 'pinnate', height: 1.3, crown: 1.12, trunk: 1.16, lobes: 4,
        buttress: 0.48, flowering: 'violet', fruit: 'rosewood-pods',
        wood: 'rosewood-timber', timber: 1.5, firewood: 1.12, charcoal: 1.2,
        goods: ['rosewood-timber', 'rosewood-oil', 'honey', 'orchids'],
        understory: ['fern', 'shrub', 'moss'], leafSize: 'small',
    }),
    bamboo: species('bamboo', {
        label: 'Giant bamboo', latin: 'Guadua angustifolia',
        bark: '#7d8a4d', barkLight: '#a6b168',
        summer: ['#5a8d42', '#8eb65b'], autumn: ['#628f48', '#94bc64'],
        form: 'bamboo', leafShape: 'lance', height: 0.62, crown: 0.74, trunk: 0.32, lobes: 2,
        buttress: 0, grass: true, flowering: 'rare', fruit: 'bamboo-seed',
        wood: 'bamboo', timber: 0.3, firewood: 0.42, charcoal: 0.34,
        goods: ['bamboo', 'bamboo-shoots', 'rattan', 'palm-fibre'],
        understory: ['fern', 'grass', 'shrub'], leafSize: 'small',
    }),
    mangosteen: species('mangosteen', {
        label: 'Mangosteen', latin: 'Garcinia mangostana',
        bark: '#594433', barkLight: '#896d54',
        summer: ['#2c683b', '#4e934a'], autumn: ['#347244', '#5a9d51'],
        form: 'understorey', leafShape: 'oval', height: 0.68, crown: 0.92, trunk: 0.5, lobes: 3,
        buttress: 0.04, flowering: 'rose', fruit: 'mangosteen', understorey: 1,
        wood: 'mangosteen-wood', timber: 0.42, firewood: 0.5, charcoal: 0.44,
        goods: ['mangosteen', 'rambutan', 'durian', 'herbs'],
        understory: ['fern', 'shrub', 'moss'], leafSize: 'large',
    }),
    'sandalwood': species('sandalwood', {
        label: 'Sandalwood', latin: 'Santalum album',
        bark: '#857156', barkLight: '#b19975',
        summer: ['#3d7141', '#679d51'], autumn: ['#477b48', '#73a85a'],
        form: 'round', leafShape: 'oval', height: 0.92, crown: 0.84, trunk: 0.68, lobes: 3,
        buttress: 0.08, flowering: 'red', fruit: 'sandalwood-nuts',
        wood: 'sandalwood-timber', timber: 0.76, firewood: 0.72, charcoal: 0.64,
        goods: ['sandalwood-timber', 'sandalwood-oil', 'agarwood', 'orchids'],
        understory: ['fern', 'shrub', 'moss'], leafSize: 'small',
    }),
});

export const TROPICAL_SPECIES_IDS = Object.freeze(Object.keys(TROPICAL_SPECIES));

// ── forest products ───────────────────────────────────────────
export const TROPICAL_GOODS = Object.freeze({
    'kapok-timber': good('kapok-timber', 'Kapok timber', 'wood'),
    'mahogany-timber': good('mahogany-timber', 'Mahogany', 'wood'),
    'brazil-nut-timber': good('brazil-nut-timber', 'Brazil-nut timber', 'wood'),
    'rubberwood-timber': good('rubberwood-timber', 'Rubberwood', 'wood'),
    'balsa-timber': good('balsa-timber', 'Balsa', 'wood'),
    'ironwood-timber': good('ironwood-timber', 'Ironwood', 'wood'),
    'rosewood-timber': good('rosewood-timber', 'Rosewood', 'wood'),
    'sandalwood-timber': good('sandalwood-timber', 'Sandalwood', 'wood'),
    'cacao-wood': good('cacao-wood', 'Cacao wood', 'wood'),
    'fig-wood': good('fig-wood', 'Fig wood', 'wood'),
    'mangosteen-wood': good('mangosteen-wood', 'Mangosteen wood', 'wood'),
    'palm-wood': good('palm-wood', 'Palm wood', 'wood'),
    bamboo: good('bamboo', 'Giant bamboo', 'wood'),
    'brazil-nuts': good('brazil-nuts', 'Brazil nuts', 'gather'),
    cocoa: good('cocoa', 'Cocoa', 'gather'),
    'cacao-pods': good('cacao-pods', 'Cacao pods', 'gather'),
    mangoes: good('mangoes', 'Mangoes', 'gather'),
    papayas: good('papayas', 'Papayas', 'gather'),
    bananas: good('bananas', 'Bananas', 'gather'),
    plantain: good('plantain', 'Plantain', 'gather'),
    guavas: good('guavas', 'Guavas', 'gather'),
    passionfruit: good('passionfruit', 'Passionfruit', 'gather'),
    avocadoes: good('avocadoes', 'Avocadoes', 'gather'),
    rambutan: good('rambutan', 'Rambutan', 'gather'),
    durian: good('durian', 'Durian', 'gather'),
    mangosteen: good('mangosteen', 'Mangosteen', 'gather'),
    acai: good('acai', 'Açaí', 'gather'),
    figs: good('figs', 'Wild figs', 'gather'),
    vanilla: good('vanilla', 'Vanilla', 'gather'),
    'cinnamon-bark': good('cinnamon-bark', 'Cinnamon bark', 'gather'),
    'black-pepper': good('black-pepper', 'Black pepper', 'gather'),
    ginger: good('ginger', 'Wild ginger', 'gather'),
    cardamom: good('cardamom', 'Cardamom', 'gather'),
    nutmeg: good('nutmeg', 'Nutmeg', 'gather'),
    cloves: good('cloves', 'Cloves', 'gather'),
    allspice: good('allspice', 'Allspice', 'gather'),
    'quinine-bark': good('quinine-bark', 'Quinine bark', 'medicine', { potency: 1.25 }),
    curare: good('curare', 'Curare', 'medicine', { potency: 0.55 }),
    ipecac: good('ipecac', 'Ipecac', 'medicine', { potency: 0.9 }),
    'copaiba-oil': good('copaiba-oil', 'Copaiba oil', 'medicine', { potency: 1.1 }),
    'cat-claw': good('cat-claw', "Cat's claw", 'medicine', { potency: 1.05 }),
    'fever-bark': good('fever-bark', 'Fever bark', 'medicine', { potency: 1.2 }),
    rattan: good('rattan', 'Rattan', 'fibre'),
    'kapok-fibre': good('kapok-fibre', 'Kapok fibre', 'fibre'),
    'natural-rubber': good('natural-rubber', 'Natural rubber', 'resin'),
    'copal-resin': good('copal-resin', 'Copal resin', 'resin'),
    'palm-fibre': good('palm-fibre', 'Palm fibre', 'fibre'),
    'palm-oil': good('palm-oil', 'Palm oil', 'gather'),
    palmito: good('palmito', 'Heart of palm', 'gather'),
    'bamboo-shoots': good('bamboo-shoots', 'Bamboo shoots', 'gather'),
    orchids: good('orchids', 'Orchids', 'luxury'),
    bromeliads: good('bromeliads', 'Bromeliads', 'luxury'),
    agarwood: good('agarwood', 'Agarwood', 'luxury'),
    'tagua-nuts': good('tagua-nuts', 'Tagua nuts', 'luxury'),
    'rosewood-oil': good('rosewood-oil', 'Rosewood oil', 'luxury'),
    'sandalwood-oil': good('sandalwood-oil', 'Sandalwood oil', 'luxury'),
    'luminous-fungus': good('luminous-fungus', 'Luminous fungus', 'luxury'),
    'giant-waterlily': good('giant-waterlily', 'Giant waterlily', 'luxury'),
    'stingless-bee-honey': good('stingless-bee-honey', 'Stingless-bee honey', 'gather'),
    feathers: good('feathers', 'Feathers', 'hunt'),
    'river-fish': good('river-fish', 'River fish', 'hunt'),
    game: good('game', 'Wild game', 'hunt'),
    hides: good('hides', 'Hides', 'hunt'),
    'snake-venom': good('snake-venom', 'Snake venom', 'poison'),
    'poison-dart-frog': good('poison-dart-frog', 'Poison-dart frog toxin', 'poison'),
    strychnine: good('strychnine', 'Strychnine', 'poison'),
    'bullet-ant-venom': good('bullet-ant-venom', 'Bullet-ant venom', 'poison'),
});

const TROPICAL_SEASON_BASE = Object.freeze(Object.fromEntries(
    Object.values(TROPICAL_GOODS)
        .filter(entry => entry.category !== 'wood')
        .map(entry => [entry.id, entry.category === 'luxury' ? 0.14
            : entry.category === 'poison' ? 0.16
                : entry.category === 'hunt' ? 0.28 : 0.42])
));

// Tropical forests fruit and flower in overlapping waves. The table keeps the
// dry-season peak, the main fruiting pulse and the wet-season leaf flush, while
// every product stays at least minimally available rather than disappearing for
// a quarter of the year as temperate products do.
export const TROPICAL_SEASON_GOODS = Object.freeze({
    spring: Object.freeze({ ...TROPICAL_SEASON_BASE, mangoes: 0.9, guavas: 0.72, passionfruit: 0.76, vanilla: 0.82, orchids: 0.86, bromeliads: 0.78, 'stingless-bee-honey': 0.86, 'cacao-pods': 0.8, 'brazil-nuts': 0.58, 'river-fish': 0.72 }),
    summer: Object.freeze({ ...TROPICAL_SEASON_BASE, bananas: 0.92, plantain: 0.88, papayas: 0.9, avocadoes: 0.78, durian: 0.86, rambutan: 0.88, mangosteen: 0.84, acai: 0.9, figs: 0.82, 'black-pepper': 0.8, cinnamon: 0.65, ginger: 0.72, 'palm-oil': 0.72, palmito: 0.68, 'river-fish': 0.84, feathers: 0.4 }),
    autumn: Object.freeze({ ...TROPICAL_SEASON_BASE, 'brazil-nuts': 0.96, cocoa: 0.9, 'cacao-pods': 0.92, nutmeg: 0.8, cloves: 0.78, cardamom: 0.72, allspice: 0.76, 'cinnamon-bark': 0.8, 'tagua-nuts': 0.82, agarwood: 0.24, 'copal-resin': 0.74, game: 0.7, hides: 0.52, 'river-fish': 0.76 }),
    winter: Object.freeze({ ...TROPICAL_SEASON_BASE, bananas: 0.72, papayas: 0.66, guavas: 0.58, acai: 0.78, figs: 0.62, 'cat-claw': 0.64, 'copaiba-oil': 0.58, 'fever-bark': 0.62, 'quinine-bark': 0.6, orchids: 0.7, bromeliads: 0.62, 'giant-waterlily': 0.7, 'river-fish': 0.9 }),
});

// ── formations ────────────────────────────────────────────────
const formation = (id, label, note, mix, options = {}) => Object.freeze({
    id, label, note,
    species: Object.freeze(mix),
    density: options.density ?? 0.78,
    openness: options.openness ?? 0.18,
    understory: Object.freeze({
        fern: 0.34, bramble: 0.08, shrub: 0.3, moss: 0.38,
        heather: 0, lichen: 0.04, berry: 0.3, grass: 0.1, herb: 0.24,
        ...(options.understory || {}),
    }),
    goods: Object.freeze(options.goods || []),
    fauna: Object.freeze(options.fauna || []),
    ageBias: options.ageBias ?? 'mature',
    disturbance: options.disturbance || null,
    productivity: options.productivity ?? 1,
    conifer: false,
    needleLitter: 0,
    mixed: options.mixed !== false,
    canopyLayers: options.canopyLayers ?? 3,
    mixturePattern: options.mixturePattern || 'mosaic',
    silviculture: Object.freeze(options.silviculture || []),
    tropical: true,
    formationGroup: options.formationGroup || 'tropical',
});

export const TROPICAL_FORMATIONS = Object.freeze({
    'tropical-emergent': formation('tropical-emergent', 'Emergent Rainforest',
        'Giant kapok, ironwood and Brazil-nut crowns above a closed lower canopy',
        { kapok: 0.3, 'brazil-nut': 0.22, ironwood: 0.18, mahogany: 0.16, fig: 0.08, palm: 0.06 },
        { density: 0.9, openness: 0.12, understory: { fern: 0.4, shrub: 0.36, moss: 0.42 }, goods: ['brazil-nuts', 'kapok-fibre', 'orchids', 'copal-resin', 'game'], fauna: ['howler-monkey', 'spider-monkey', 'toucan', 'macaw', 'jaguar', 'agouti', 'anaconda', 'morpho-butterfly'], ageBias: 'ancient', silviculture: ['timber', 'veneer', 'gathering', 'medicine', 'protection'] }),
    'tropical-canopy': formation('tropical-canopy', 'Lowland Rainforest',
        'A layered broadleaf canopy of mahogany, rubber, palms and shade-tolerant saplings',
        { mahogany: 0.23, rubber: 0.19, cacao: 0.15, fig: 0.13, palm: 0.1, balsa: 0.08, mangosteen: 0.07, rosewood: 0.05 },
        { density: 0.86, understory: { fern: 0.38, shrub: 0.42, moss: 0.34, herb: 0.3 }, goods: ['natural-rubber', 'cacao-pods', 'mangoes', 'rattan', 'vanilla', 'orchids'], fauna: ['howler-monkey', 'spider-monkey', 'toucan', 'macaw', 'agouti', 'ocelot', 'anaconda', 'morpho-butterfly', 'bullet-ant'], silviculture: ['timber', 'gathering', 'medicine', 'honey', 'protection'] }),
    'tropical-floodplain': formation('tropical-floodplain', 'Floodplain Rainforest',
        'Várzea forest on rich alluvium, with palms, figs and a seasonal high-water line',
        { fig: 0.25, rubber: 0.21, palm: 0.2, balsa: 0.13, bamboo: 0.11, cacao: 0.1 },
        { density: 0.74, openness: 0.24, understory: { fern: 0.42, shrub: 0.34, moss: 0.44, grass: 0.26, herb: 0.34 }, goods: ['river-fish', 'acai', 'natural-rubber', 'cacao-pods', 'giant-waterlily', 'palmito'], fauna: ['river-fish', 'piranha', 'anaconda', 'capybara', 'toucan', 'macaw', 'caiman', 'agouti'], productivity: 1.08, silviculture: ['fishing', 'gathering', 'timber', 'river-trade'] }),
    'tropical-palm-grove': formation('tropical-palm-grove', 'Palm Grove',
        'A bright palm-dominated grove with açaí, rattan and a wet herb floor',
        { palm: 0.52, fig: 0.13, rubber: 0.1, bamboo: 0.1, cacao: 0.08, balsa: 0.07 },
        { density: 0.62, openness: 0.34, understory: { fern: 0.44, shrub: 0.26, moss: 0.42, grass: 0.34, herb: 0.3 }, goods: ['acai', 'palm-fibre', 'palm-oil', 'palmito', 'rattan', 'stingless-bee-honey'], fauna: ['macaw', 'toucan', 'howler-monkey', 'agouti', 'morpho-butterfly', 'anaconda'], silviculture: ['gathering', 'thatch', 'honey', 'river-trade'] }),
    'tropical-swamp': formation('tropical-swamp', 'Swamp Forest',
        'Dark igapó woodland standing in black water, with stilt roots and floating plants',
        { palm: 0.3, fig: 0.24, rubber: 0.18, bamboo: 0.14, balsa: 0.09, cacao: 0.05 },
        { density: 0.8, understory: { fern: 0.5, shrub: 0.3, moss: 0.58, grass: 0.24, herb: 0.28 }, goods: ['giant-waterlily', 'river-fish', 'acai', 'natural-rubber', 'copal-resin'], fauna: ['caiman', 'anaconda', 'piranha', 'river-fish', 'toucan', 'morpho-butterfly'], productivity: 0.92, silviculture: ['fishing', 'gathering', 'protection'] }),
    'tropical-montane': formation('tropical-montane', 'Cloud Forest',
        'Mossy montane rainforest in cool mist, with ironwood, tree ferns and hanging gardens',
        { ironwood: 0.24, mahogany: 0.2, fig: 0.15, bamboo: 0.12, sandalwood: 0.1, cacao: 0.1, palm: 0.09 },
        { density: 0.82, understory: { fern: 0.62, shrub: 0.3, moss: 0.72, herb: 0.38, lichen: 0.24 }, goods: ['quinine-bark', 'orchids', 'bromeliads', 'copal-resin', 'fever-bark', 'cinnamon-bark'], fauna: ['harpy-eagle', 'toucan', 'howler-monkey', 'ocelot', 'anaconda', 'morpho-butterfly'], ageBias: 'ancient', silviculture: ['medicine', 'gathering', 'protection', 'timber'] }),
    'tropical-bamboo': formation('tropical-bamboo', 'Bamboo Brake',
        'A dense giant-bamboo thicket in a canopy gap, almost impassable without a cut path',
        { bamboo: 0.6, balsa: 0.12, palm: 0.1, fig: 0.08, cacao: 0.06, rubber: 0.04 },
        { density: 0.66, openness: 0.32, understory: { fern: 0.4, shrub: 0.52, moss: 0.34, grass: 0.44, herb: 0.28, bramble: 0.24 }, goods: ['bamboo', 'bamboo-shoots', 'rattan', 'palm-fibre'], fauna: ['agouti', 'paca', 'toucan', 'anaconda', 'bullet-ant', 'morpho-butterfly'], ageBias: 'young', productivity: 0.82, silviculture: ['poles', 'gathering', 'coppice'] }),
    'tropical-gap': formation('tropical-gap', 'Treefall Gap',
        'A sunlit hole in the canopy where balsa, bamboo and fast pioneer growth race upward',
        { balsa: 0.3, bamboo: 0.24, cacao: 0.15, rubber: 0.11, fig: 0.1, palm: 0.1 },
        { density: 0.46, openness: 0.58, understory: { fern: 0.32, shrub: 0.5, moss: 0.22, grass: 0.38, herb: 0.34, berry: 0.34 }, goods: ['passionfruit', 'bananas', 'papayas', 'bamboo-shoots', 'cacao-pods'], fauna: ['agouti', 'paca', 'toucan', 'morpho-butterfly', 'bullet-ant', 'ocelot'], ageBias: 'young', productivity: 0.76, silviculture: ['gathering', 'poles'] }),
    'tropical-secondary': formation('tropical-secondary', 'Secondary Regrowth',
        'Young balsa, bamboo and cacao closing over an abandoned clearing',
        { balsa: 0.27, bamboo: 0.22, cacao: 0.18, rubber: 0.14, palm: 0.1, fig: 0.09 },
        { density: 0.52, openness: 0.46, understory: { fern: 0.32, shrub: 0.5, moss: 0.2, grass: 0.42, herb: 0.3, berry: 0.38 }, goods: ['bananas', 'papayas', 'passionfruit', 'bamboo', 'cacao-pods', 'palm-oil'], fauna: ['agouti', 'paca', 'toucan', 'morpho-butterfly', 'bullet-ant', 'ocelot'], ageBias: 'young', productivity: 0.82, silviculture: ['gathering', 'poles', 'regrowth'] }),
    'tropical-ancient': formation('tropical-ancient', 'Old-growth Rainforest',
        'Cathedral-like ancient trees, enormous buttresses, hollows and a deep undisturbed floor',
        { ironwood: 0.24, mahogany: 0.2, 'brazil-nut': 0.17, kapok: 0.14, fig: 0.11, rosewood: 0.08, sandalwood: 0.06 },
        { density: 0.94, openness: 0.08, understory: { fern: 0.48, shrub: 0.28, moss: 0.56, herb: 0.34 }, goods: ['ironwood-timber', 'mahogany-timber', 'brazil-nuts', 'rosewood-oil', 'orchids', 'agarwood', 'tagua-nuts'], fauna: ['howler-monkey', 'spider-monkey', 'jaguar', 'harpy-eagle', 'toucan', 'macaw', 'anaconda', 'agouti', 'morpho-butterfly'], ageBias: 'ancient', silviculture: ['protection', 'veneer', 'gathering', 'medicine'] }),
    'tropical-riverbank': formation('tropical-riverbank', 'Riverbank Forest',
        'A ribbon of figs, palms and bamboo along a river, with a canoe landing and rich alluvium',
        { fig: 0.22, palm: 0.23, rubber: 0.19, balsa: 0.15, bamboo: 0.11, cacao: 0.1 },
        { density: 0.68, openness: 0.3, understory: { fern: 0.4, shrub: 0.34, moss: 0.46, grass: 0.32, herb: 0.34 }, goods: ['river-fish', 'acai', 'natural-rubber', 'figs', 'giant-waterlily', 'rattan'], fauna: ['river-fish', 'caiman', 'piranha', 'anaconda', 'toucan', 'macaw', 'capybara'], productivity: 1.02, silviculture: ['fishing', 'river-trade', 'gathering', 'timber'] }),
    'tropical-plantation': formation('tropical-plantation', 'Abandoned Plantation',
        'Cacao, rubber and palm rows escaping into a young rainforest understorey',
        { cacao: 0.28, rubber: 0.24, palm: 0.2, balsa: 0.12, bamboo: 0.1, mangosteen: 0.06 },
        { density: 0.6, openness: 0.4, understory: { fern: 0.3, shrub: 0.46, moss: 0.22, grass: 0.4, herb: 0.36, berry: 0.3 }, goods: ['cacao-pods', 'natural-rubber', 'palm-oil', 'bananas', 'mangosteen', 'vanilla'], fauna: ['agouti', 'paca', 'toucan', 'morpho-butterfly', 'ocelot'], ageBias: 'young', productivity: 0.98, mixturePattern: 'even', silviculture: ['plantation', 'gathering', 'regrowth', 'timber'] }),
});

export const TROPICAL_FORMATION_IDS = Object.freeze(Object.keys(TROPICAL_FORMATIONS));

export function tropicalFormationFor(x, y, seed, moisture, temperature, height) {
    const m = clamp01(moisture);
    const h = clamp01(height);
    const wet = m > 0.78 || h < 0.38;
    const patch = (cell, salt) => unit(seed, Math.floor(x / cell), Math.floor(y / cell), salt);
    if (h > 0.84) return 'tropical-montane';
    if (h > 0.75) return 'tropical-montane';
    if (wet && patch(9, 0x54524f50) > 0.35) return patch(7, 0x53574150) > 0.5 ? 'tropical-swamp' : 'tropical-floodplain';
    if (m > 0.7 && patch(8, 0x52495645) > 0.4) return 'tropical-riverbank';
    if (patch(7, 0x42414d42) > 0.84) return 'tropical-bamboo';
    if (patch(9, 0x50414c4d) > 0.78) return 'tropical-palm-grove';
    if (patch(5, 0x5345434f) > 0.9) return 'tropical-secondary';
    if (patch(5, 0x504c414e) > 0.86) return 'tropical-plantation';
    if (patch(6, 0x474150) > 0.88) return 'tropical-gap';
    if (patch(8, 0x414e4349) > 0.84) return 'tropical-ancient';
    if (patch(6, 0x454d4552) > 0.58) return 'tropical-emergent';
    return 'tropical-canopy';
}

// ── phenology ─────────────────────────────────────────────────
export const TROPICAL_PHENOLOGY = Object.freeze({
    kapok: Object.freeze({ flowering: [20, 75], fruiting: [130, 210] }),
    mahogany: Object.freeze({ flowering: [145, 190], fruiting: [230, 300] }),
    'brazil-nut': Object.freeze({ flowering: [170, 225], fruiting: [270, 350] }),
    rubber: Object.freeze({ flowering: [30, 70], fruiting: [180, 245] }),
    cacao: Object.freeze({ flowering: [1, 400], fruiting: [1, 400] }),
    balsa: Object.freeze({ flowering: [100, 155], fruiting: [190, 260] }),
    fig: Object.freeze({ flowering: [1, 400], fruiting: [200, 320] }),
    palm: Object.freeze({ flowering: [40, 110], fruiting: [210, 330] }),
    ironwood: Object.freeze({ flowering: [150, 200], fruiting: [280, 360] }),
    rosewood: Object.freeze({ flowering: [120, 170], fruiting: [240, 320] }),
    bamboo: Object.freeze({ flowering: [180, 200], fruiting: [200, 230] }),
    mangosteen: Object.freeze({ flowering: [60, 120], fruiting: [170, 260] }),
    sandalwood: Object.freeze({ flowering: [70, 125], fruiting: [210, 290] }),
});

// ── 65-point contract ─────────────────────────────────────────
// One entry per requirement. `key` indexes the derived profile. Keeping the
// list as data means the documentation, tests and stand cannot drift apart.
export const TROPICAL_POINTS = Object.freeze([
    { id: '1.2.4.1', key: 'largeBroadleafCanopy', label: 'Riesige tropische Laubbäume mit breiten Kronen' },
    { id: '1.2.4.2', key: 'buttressRoots', label: 'Bäume mit gewaltigen Brettwurzeln' },
    { id: '1.2.4.3', key: 'trunkBarkVariety', label: 'Unterschiedliche Stammformen und Rindenstrukturen' },
    { id: '1.2.4.4', key: 'emergentGiants', label: 'Hohe Baumriesen über dem Kronendach' },
    { id: '1.2.4.5', key: 'lowerTrees', label: 'Kleinere Bäume in unteren Vegetationsschichten' },
    { id: '1.2.4.6', key: 'leafSizeVariety', label: 'Baumarten mit unterschiedlichen Blattgrößen' },
    { id: '1.2.4.7', key: 'floweringFruitingTrees', label: 'Blühende und fruchttragende Baumarten' },
    { id: '1.2.4.8', key: 'rareAncientTrees', label: 'Seltene und besonders alte Urwaldbäume' },
    { id: '1.2.4.9', key: 'groundFernsMosses', label: 'Bodenschicht mit Farnen, Moosen und kleinen Pflanzen' },
    { id: '1.2.4.10', key: 'denseShrubSaplings', label: 'Dichte Strauch- und Jungbaumschicht' },
    { id: '1.2.4.11', key: 'layeredCanopy', label: 'Unteres und oberes Kronendach' },
    { id: '1.2.4.12', key: 'scatteredEmergents', label: 'Einzelne Baumriesen über dem Kronendach' },
    { id: '1.2.4.13', key: 'lianas', label: 'Lianen und Kletterpflanzen' },
    { id: '1.2.4.14', key: 'epiphytes', label: 'Epiphyten und Aufsitzerpflanzen' },
    { id: '1.2.4.15', key: 'giantFerns', label: 'Riesige Farne' },
    { id: '1.2.4.16', key: 'orchidsBromeliads', label: 'Orchideen und Bromelien' },
    { id: '1.2.4.17', key: 'largeLeafPlants', label: 'Große Blattpflanzen' },
    { id: '1.2.4.18', key: 'palms', label: 'Tropische Palmen' },
    { id: '1.2.4.19', key: 'fruitingShrubs', label: 'Fruchttragende Sträucher' },
    { id: '1.2.4.20', key: 'carnivorousPlants', label: 'Fleischfressende Pflanzen' },
    { id: '1.2.4.21', key: 'poisonousMedicinalPlants', label: 'Giftige und medizinisch nutzbare Pflanzen' },
    { id: '1.2.4.22', key: 'rareSpecialistPlants', label: 'Seltene Pflanzenarten mit besonderen Eigenschaften' },
    { id: '1.2.4.23', key: 'weatheredLeachedSoil', label: 'Stark verwitterte und ausgewaschene Böden' },
    { id: '1.2.4.24', key: 'darkWetSoil', label: 'Feuchte, dunkle Waldböden' },
    { id: '1.2.4.25', key: 'surfaceRoots', label: 'Oberflächliche Wurzelsysteme' },
    { id: '1.2.4.26', key: 'decayingMatter', label: 'Verrottende Pflanzenmasse' },
    { id: '1.2.4.27', key: 'pools', label: 'Wasseransammlungen und kleine Tümpel' },
    { id: '1.2.4.28', key: 'soilMoistureVariety', label: 'Unterschiedliche Bodenfeuchtigkeit' },
    { id: '1.2.4.29', key: 'floodplain', label: 'Flussnahe Überschwemmungsgebiete' },
    { id: '1.2.4.30', key: 'heavyRain', label: 'Häufige starke Regenfälle' },
    { id: '1.2.4.31', key: 'highHumidity', label: 'Dauerhaft hohe Luftfeuchtigkeit' },
    { id: '1.2.4.32', key: 'streams', label: 'Kleine Wasserläufe und Bäche' },
    { id: '1.2.4.33', key: 'largeRivers', label: 'Große Flüsse und Nebenarme' },
    { id: '1.2.4.34', key: 'temporaryFloods', label: 'Temporäre Überschwemmungen' },
    { id: '1.2.4.35', key: 'waterfallsPools', label: 'Wasserfälle und natürliche Wasserbecken' },
    { id: '1.2.4.36', key: 'canopyMist', label: 'Nebel und Dunst zwischen Baumkronen' },
    { id: '1.2.4.37', key: 'monkeys', label: 'Affen und baumbewohnende Säugetiere' },
    { id: '1.2.4.38', key: 'bigCats', label: 'Große Raubkatzen' },
    { id: '1.2.4.39', key: 'tropicalBirds', label: 'Tropische Vögel mit auffälligem Gefieder' },
    { id: '1.2.4.40', key: 'reptilesAmphibians', label: 'Schlangen, Echsen und Amphibien' },
    { id: '1.2.4.41', key: 'insects', label: 'Zahlreiche Insektenarten' },
    { id: '1.2.4.42', key: 'frugivores', label: 'Fruchtfressende Tiere' },
    { id: '1.2.4.43', key: 'restrictedSpecies', label: 'Spezialisierte Arten mit begrenzten Verbreitungsgebieten' },
    { id: '1.2.4.44', key: 'tropicalHardwoods', label: 'Tropische Edelhölzer' },
    { id: '1.2.4.45', key: 'fruitsNuts', label: 'Früchte und Nüsse' },
    { id: '1.2.4.46', key: 'spices', label: 'Gewürze und aromatische Pflanzen' },
    { id: '1.2.4.47', key: 'medicinalPlants', label: 'Medizinische Pflanzen' },
    { id: '1.2.4.48', key: 'fibresResins', label: 'Naturfasern und Harze' },
    { id: '1.2.4.49', key: 'honeyAnimalProducts', label: 'Honig und tierische Erzeugnisse' },
    { id: '1.2.4.50', key: 'rareMaterials', label: 'Seltene Naturmaterialien' },
    { id: '1.2.4.51', key: 'poisonousOrganisms', label: 'Giftige Pflanzen und Tiere' },
    { id: '1.2.4.52', key: 'tropicalDiseases', label: 'Tropische Krankheiten' },
    { id: '1.2.4.53', key: 'parasitesVectors', label: 'Parasiten und Insektenübertragung' },
    { id: '1.2.4.54', key: 'spoilage', label: 'Hohe Luftfeuchtigkeit und schnelle Verderbnis von Vorräten' },
    { id: '1.2.4.55', key: 'difficultMovement', label: 'Schwierige Fortbewegung durch dichtes Unterholz' },
    { id: '1.2.4.56', key: 'floodStormHazard', label: 'Überschwemmungen und Starkregen' },
    { id: '1.2.4.57', key: 'predatorHazard', label: 'Gefahren durch große Raubtiere' },
    { id: '1.2.4.58', key: 'visibilityOrientation', label: 'Schlechte Sicht und Orientierung' },
    { id: '1.2.4.59', key: 'settlements', label: 'Kleine Siedlungen an Flüssen und Lichtungen' },
    { id: '1.2.4.60', key: 'agriculture', label: 'Landwirtschaft in geeigneten Gebieten' },
    { id: '1.2.4.61', key: 'plantations', label: 'Plantagen und spezielle Nutzpflanzen' },
    { id: '1.2.4.62', key: 'huntingFishingGathering', label: 'Jagd, Fischfang und Sammelwirtschaft' },
    { id: '1.2.4.63', key: 'riverTrade', label: 'Flussbasierte Handelsrouten' },
    { id: '1.2.4.64', key: 'clearance', label: 'Rodung und langfristige ökologische Folgen' },
    { id: '1.2.4.65', key: 'regrowth', label: 'Wiederbewaldung aufgegebener Nutzflächen' },
]);

const PLANT_LAYERS = Object.freeze([
    { id: 'ground-fern', label: 'Ground ferns', layer: 'ground', feature: 'groundFernsMosses' },
    { id: 'moss', label: 'Moss cushions', layer: 'ground', feature: 'groundFernsMosses' },
    { id: 'giant-fern', label: 'Tree ferns', layer: 'understorey', feature: 'giantFerns' },
    { id: 'large-leaf', label: 'Elephant-ear plants', layer: 'understorey', feature: 'largeLeafPlants' },
    { id: 'orchid', label: 'Orchids', layer: 'epiphyte', feature: 'orchidsBromeliads' },
    { id: 'bromeliad', label: 'Bromeliads', layer: 'epiphyte', feature: 'orchidsBromeliads' },
    { id: 'pitcher', label: 'Pitcher plants', layer: 'ground', feature: 'carnivorousPlants' },
    { id: 'liana', label: 'Lianas', layer: 'canopy', feature: 'lianas' },
    { id: 'palm-seedling', label: 'Palm seedlings', layer: 'understorey', feature: 'palms' },
    { id: 'fruiting-shrub', label: 'Fruiting shrubs', layer: 'shrub', feature: 'fruitingShrubs' },
    { id: 'medicinal-vine', label: 'Medicinal vines', layer: 'understorey', feature: 'poisonousMedicinalPlants' },
    { id: 'rare-ghost-orchid', label: 'Ghost orchid', layer: 'epiphyte', feature: 'rareSpecialistPlants' },
]);

export function tropicalProfileFor(input = {}) {
    const seed = Number(input.seed) || 1;
    const x = Number(input.x) || 0;
    const y = Number(input.y) || 0;
    const formationId = input.formationId || 'tropical-canopy';
    const ageClass = input.ageClass || 'mature';
    const moisture = clamp01(input.moisture ?? 0.8);
    const temperature = clamp01(input.temperature ?? 0.82);
    const height = clamp01(input.height ?? 0.4);
    const canopy = clamp01(input.canopy ?? 0.8);
    const density = clamp01(input.density ?? 0.8);
    const clearing = clamp01(input.clearing ?? 0);
    const edge = Boolean(input.edge);
    const stockRatio = clamp01(input.stockRatio ?? 1);
    const speciesIds = Array.isArray(input.species) ? input.species : [];
    const floodplainFormation = ['tropical-floodplain', 'tropical-swamp', 'tropical-riverbank'].includes(formationId);
    const ancient = ageClass === 'ancient' || formationId === 'tropical-ancient';
    const young = ageClass === 'young' || formationId === 'tropical-secondary' || formationId === 'tropical-gap' || formationId === 'tropical-plantation';
    const wet = clamp01((moisture - 0.58) / 0.4 + (floodplainFormation ? 0.27 : 0));
    const humidity = clamp01(0.7 + moisture * 0.27 + (formationId === 'tropical-montane' ? 0.05 : 0));
    const shade = clamp01(canopy * 0.72 + density * 0.3);
    const undergrowth = clamp01(0.55 + shade * 0.25 + wet * 0.18 - clearing * 0.3);
    const water = wet > 0.5 || floodplainFormation;
    const waterfall = formationId === 'tropical-montane' && height > 0.62 && unit(seed, x, y, 0x46414c4c) > 0.62;
    const settlementRoll = unit(seed, x, y, 0x53455454);
    const settlement = (floodplainFormation || formationId === 'tropical-riverbank')
        ? settlementRoll > 0.72
        : settlementRoll > 0.94 && edge;
    const agriculture = settlement || ((formationId === 'tropical-gap' || formationId === 'tropical-secondary') && settlementRoll > 0.55);
    const plantation = formationId === 'tropical-plantation' || (agriculture && unit(seed, x, y, 0x504c414e) > 0.55);
    const clearance = clamp01((1 - stockRatio) * 1.15 + (young ? 0.4 : 0) + clearing * 0.8 + (edge ? 0.18 : 0));
    const regrowth = clamp01((formationId === 'tropical-secondary' || formationId === 'tropical-plantation' ? 0.94 : 0)
        + (young ? 0.2 : 0) + (clearance > 0.5 ? 0.35 : 0));
    const disease = clamp01(0.24 + humidity * 0.34 + wet * 0.18 + (settlement ? 0.1 : 0));
    const parasites = clamp01(0.3 + humidity * 0.34 + wet * 0.14 + undergrowth * 0.1);
    const spoilage = clamp01(0.4 + humidity * 0.4 + temperature * 0.16);
    const movement = clamp01(0.34 + undergrowth * 0.38 + (formationId === 'tropical-bamboo' ? 0.2 : 0) + (water ? 0.1 : 0));
    const flood = clamp01((floodplainFormation ? 0.62 : 0.08) + wet * 0.28 + (waterfall ? 0.12 : 0));
    const predators = clamp01(0.24 + (ancient ? 0.22 : 0) + (formationId === 'tropical-swamp' ? 0.12 : 0) + undergrowth * 0.16);
    const visibility = clamp01(0.24 + humidity * 0.2 + undergrowth * 0.22 + (formationId === 'tropical-bamboo' ? 0.16 : 0));
    const flowering = speciesIds.filter(id => TROPICAL_PHENOLOGY[id] && id !== 'fig' && id !== 'cacao').length / Math.max(1, speciesIds.length);
    const palms = speciesIds.filter(id => TROPICAL_SPECIES[id]?.palm).length / Math.max(1, speciesIds.length);
    const buttressShare = speciesIds.reduce((sum, id) => sum + (Number(TROPICAL_SPECIES[id]?.buttress) || 0), 0) / Math.max(1, speciesIds.length);

    const values = {
        largeBroadleafCanopy: clamp01(0.76 + canopy * 0.2),
        buttressRoots: clamp01(0.34 + buttressShare * 0.64),
        trunkBarkVariety: clamp01(0.64 + speciesIds.length / 12 * 0.3),
        emergentGiants: clamp01((formationId === 'tropical-emergent' || formationId === 'tropical-ancient' ? 0.8 : 0.48) + canopy * 0.18),
        lowerTrees: clamp01(0.62 + undergrowth * 0.24),
        leafSizeVariety: clamp01(0.72 + speciesIds.length / 13 * 0.24),
        floweringFruitingTrees: clamp01(0.56 + flowering * 0.36),
        rareAncientTrees: clamp01((ancient ? 0.82 : 0.18) + (formationId === 'tropical-ancient' ? 0.15 : 0)),
        groundFernsMosses: clamp01(0.55 + humidity * 0.28 + shade * 0.1),
        denseShrubSaplings: clamp01(0.48 + undergrowth * 0.36),
        layeredCanopy: clamp01(0.82 + (ancient ? 0.12 : 0)),
        scatteredEmergents: clamp01(0.42 + canopy * 0.38 + (ancient ? 0.14 : 0)),
        lianas: clamp01(0.5 + shade * 0.26 + humidity * 0.16),
        epiphytes: clamp01(0.54 + humidity * 0.3),
        giantFerns: clamp01(0.42 + humidity * 0.26 + (formationId === 'tropical-montane' ? 0.24 : 0)),
        orchidsBromeliads: clamp01(0.48 + humidity * 0.3 + (formationId === 'tropical-montane' ? 0.18 : 0)),
        largeLeafPlants: clamp01(0.5 + undergrowth * 0.28),
        palms: clamp01(0.3 + palms * 0.56 + (formationId === 'tropical-palm-grove' ? 0.24 : 0)),
        fruitingShrubs: clamp01(0.46 + undergrowth * 0.3 + (young ? 0.1 : 0)),
        carnivorousPlants: clamp01(0.12 + wet * 0.42 + (formationId === 'tropical-swamp' ? 0.22 : 0)),
        poisonousMedicinalPlants: clamp01(0.52 + humidity * 0.2 + (ancient ? 0.12 : 0)),
        rareSpecialistPlants: clamp01(0.12 + (ancient ? 0.3 : 0) + (formationId === 'tropical-montane' ? 0.22 : 0) + humidity * 0.12),
        weatheredLeachedSoil: clamp01(0.64 + moisture * 0.16 + (floodplainFormation ? -0.2 : 0)),
        darkWetSoil: clamp01(0.56 + moisture * 0.3),
        surfaceRoots: clamp01(0.62 + wet * 0.2 + shade * 0.12),
        decayingMatter: clamp01(0.56 + humidity * 0.28 + shade * 0.12),
        pools: clamp01(0.14 + wet * 0.48 + (formationId === 'tropical-swamp' ? 0.28 : 0)),
        soilMoistureVariety: clamp01(0.48 + wet * 0.3 + (formationId === 'tropical-montane' ? 0.16 : 0)),
        floodplain: floodplainFormation ? 0.94 : clamp01(0.1 + wet * 0.2),
        heavyRain: clamp01(0.72 + humidity * 0.24),
        highHumidity: humidity,
        streams: clamp01(0.4 + wet * 0.3 + (formationId === 'tropical-montane' ? 0.2 : 0)),
        largeRivers: floodplainFormation ? 0.92 : clamp01(0.16 + wet * 0.24),
        temporaryFloods: clamp01((floodplainFormation ? 0.72 : 0.1) + wet * 0.25),
        waterfallsPools: waterfall ? 0.96 : clamp01(0.05 + (formationId === 'tropical-montane' ? 0.18 : 0) + wet * 0.1),
        canopyMist: clamp01(0.28 + humidity * 0.3 + (formationId === 'tropical-montane' ? 0.32 : 0)),
        monkeys: clamp01(0.66 + canopy * 0.24),
        bigCats: clamp01(0.26 + (ancient ? 0.28 : 0) + undergrowth * 0.14),
        tropicalBirds: clamp01(0.7 + canopy * 0.2),
        reptilesAmphibians: clamp01(0.56 + wet * 0.3),
        insects: clamp01(0.78 + humidity * 0.2),
        frugivores: clamp01(0.58 + flowering * 0.26),
        restrictedSpecies: clamp01(0.14 + (formationId === 'tropical-montane' || formationId === 'tropical-swamp' ? 0.28 : 0) + (ancient ? 0.18 : 0)),
        tropicalHardwoods: clamp01(0.66 + (speciesIds.filter(id => ['mahogany', 'ironwood', 'rosewood', 'brazil-nut', 'sandalwood'].includes(id)).length / 5) * 0.3),
        fruitsNuts: clamp01(0.58 + flowering * 0.3),
        spices: clamp01(0.28 + (speciesIds.includes('cacao') ? 0.24 : 0) + (formationId === 'tropical-plantation' ? 0.26 : 0)),
        medicinalPlants: clamp01(0.48 + humidity * 0.22 + (formationId === 'tropical-montane' ? 0.2 : 0)),
        fibresResins: clamp01(0.5 + (speciesIds.includes('rubber') || speciesIds.includes('palm') ? 0.3 : 0)),
        honeyAnimalProducts: clamp01(0.46 + flowering * 0.26 + (floodplainFormation ? 0.14 : 0)),
        rareMaterials: clamp01(0.14 + (ancient ? 0.28 : 0) + (formationId === 'tropical-montane' ? 0.2 : 0)),
        poisonousOrganisms: clamp01(0.5 + wet * 0.2 + (formationId === 'tropical-swamp' ? 0.16 : 0)),
        tropicalDiseases: disease,
        parasitesVectors: parasites,
        spoilage,
        difficultMovement: movement,
        floodStormHazard: flood,
        predatorHazard: predators,
        visibilityOrientation: visibility,
        settlements: settlement ? 0.9 : clamp01(0.08 + (floodplainFormation ? 0.12 : 0)),
        agriculture: agriculture ? 0.84 : 0.08,
        plantations: plantation ? 0.9 : 0.06,
        huntingFishingGathering: 0.92,
        riverTrade: floodplainFormation || formationId === 'tropical-riverbank' ? 0.88 : 0.12,
        clearance,
        regrowth,
    };

    const features = Object.fromEntries(TROPICAL_POINTS.map(point => [point.id, round(values[point.key])]));
    const points = TROPICAL_POINTS.map(point => ({
        id: point.id, key: point.key, label: point.label, value: features[point.id],
    }));
    const plants = Object.freeze(PLANT_LAYERS.map(entry => ({
        ...entry,
        abundance: round(values[entry.feature] * (0.7 + unit(seed, x, y, 0x504c414e + entry.id.length) * 0.3)),
    })));
    const goods = [...new Set([
        ...(input.goods || []),
        ...speciesIds.flatMap(id => TROPICAL_SPECIES[id]?.goods || []),
    ])].filter(id => TROPICAL_GOODS[id]);
    const hazard = Object.freeze({
        disease: round(disease),
        parasites: round(parasites),
        spoilage: round(spoilage),
        movement: round(movement),
        flood: round(flood),
        predators: round(predators),
        visibility: round(visibility),
        workPenalty: round(0.18 + movement * 0.38 + flood * 0.12 + predators * 0.05),
        diseaseLabel: settlement || wet > 0.7 ? 'malaria and waterborne fever' : 'forest fever',
    });
    const waterProfile = Object.freeze({
        heavyRain: round(values.heavyRain),
        humidity: round(humidity),
        streams: round(values.streams),
        largeRivers: round(values.largeRivers),
        temporaryFloods: round(values.temporaryFloods),
        waterfalls: Boolean(waterfall),
        mist: round(values.canopyMist),
        pools: round(values.pools),
        floodplain: floodplainFormation,
    });
    const landUse = Object.freeze({
        settlement,
        houses: settlement ? 2 + (unit(seed, x, y, 0x484f5553) > 0.5 ? 2 : 0) : 0,
        agriculture: Boolean(agriculture),
        plantation: Boolean(plantation),
        hunting: true,
        fishing: Boolean(water || floodplainFormation),
        gathering: true,
        riverTrade: Boolean(floodplainFormation || formationId === 'tropical-riverbank'),
        clearance: round(clearance),
        regrowth: round(regrowth),
        kind: settlement ? 'riverside hamlet' : plantation ? 'plantation' : agriculture ? 'swidden plot'
            : (formationId === 'tropical-secondary' || formationId === 'tropical-plantation') ? 'regrowing fallow' : 'managed forest',
    });
    const soil = Object.freeze({
        weathered: round(values.weatheredLeachedSoil),
        leached: round(clamp01(values.weatheredLeachedSoil * 0.9 + wet * 0.08)),
        dark: round(values.darkWetSoil),
        surfaceRoots: round(values.surfaceRoots),
        decayingMatter: round(values.decayingMatter),
        pools: round(values.pools),
        moistureVariety: round(values.soilMoistureVariety),
        floodplain: floodplainFormation,
        type: floodplainFormation ? 'young alluvium' : height > 0.62 ? 'leached upland oxisol' : 'deep weathered latosol',
    });
    return Object.freeze({
        climate: TROPICAL_CLIMATE,
        formation: formationId,
        features,
        points,
        plants,
        goods,
        hazard,
        water: waterProfile,
        landUse,
        soil,
        canopyStrata: Object.freeze({ emergent: round(values.emergentGiants), upper: round(canopy), lower: round(values.lowerTrees), floor: round(values.groundFernsMosses) }),
        buttress: Object.freeze({ share: round(buttressShare), maxFlare: 0.55 + buttressShare * 0.65 }),
        barkTypes: Object.freeze([...new Set(speciesIds.map(id => TROPICAL_SPECIES[id]?.bark).filter(Boolean))]),
        leafSizes: Object.freeze([...new Set(speciesIds.map(id => TROPICAL_SPECIES[id]?.leafSize).filter(Boolean))]),
        floweringShare: round(flowering),
        palms: round(palms),
        ancient,
        regrowth: round(regrowth),
        clearance: round(clearance),
        species: Object.freeze([...speciesIds]),
        summary: [formationId.replace('tropical-', 'Tropical '), Math.round(humidity * 100) + '% humidity',
            settlement ? 'hamlet' : plantation ? 'plantation' : agriculture ? 'swidden' : 'wild forest'].join(' · '),
    });
}

// ── seasonal fauna and ecosystem helpers ─────────────────────
export const TROPICAL_SEASONS = Object.freeze({
    spring: 'Wet-season flush', summer: 'Main fruiting pulse',
    autumn: 'Dry-season peak', winter: 'Warm rainy season',
});

export function tropicalFeature(id, profile) {
    return profile?.features?.[id] ?? 0;
}
