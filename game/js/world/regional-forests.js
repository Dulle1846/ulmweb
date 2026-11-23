// 1.2.23.1 — 30 regional forest types over the shared forest-stand contract.
//
// This module is data plus one O(1) selector. It does not own a second forest
// simulation: `forestStandAt()` calls the selector once per stand, then uses the
// returned species/effects inside the existing formation, resource, gathering
// and renderer paths. The catalog is deliberately frozen and save-neutral.

// Species appended after every existing temperate, tropical and savanna
// species. New ids therefore cannot shift an older species index.
// Each regional species names its own timber so the shared wood ledger can
// tell a redwood beam from a mangrove pole without a second goods system.
export const REGIONAL_GOODS = Object.freeze({
    'nothofagus-timber': Object.freeze({ id: 'nothofagus-timber', label: 'Southern Beech Timber', category: 'wood' }),
    'podocarpus-timber': Object.freeze({ id: 'podocarpus-timber', label: 'Podocarp Timber', category: 'wood' }),
    'treefern-timber': Object.freeze({ id: 'treefern-timber', label: 'Tree Fern Trunks', category: 'wood' }),
    'redwood-timber': Object.freeze({ id: 'redwood-timber', label: 'Redwood Timber', category: 'wood' }),
    'sitka-timber': Object.freeze({ id: 'sitka-timber', label: 'Sitka Spruce Timber', category: 'wood' }),
    'hemlock-timber': Object.freeze({ id: 'hemlock-timber', label: 'Hemlock Timber', category: 'wood' }),
    'eucalyptus-timber': Object.freeze({ id: 'eucalyptus-timber', label: 'Eucalyptus Timber', category: 'wood' }),
    'cork-timber': Object.freeze({ id: 'cork-timber', label: 'Cork Oak Timber', category: 'wood' }),
    'holm-timber': Object.freeze({ id: 'holm-timber', label: 'Holm Oak Timber', category: 'wood' }),
    'aleppo-timber': Object.freeze({ id: 'aleppo-timber', label: 'Aleppo Pine Timber', category: 'wood' }),
    'miombo-timber': Object.freeze({ id: 'miombo-timber', label: 'Miombo Timber', category: 'wood' }),
    'teak-timber': Object.freeze({ id: 'teak-timber', label: 'Teak Timber', category: 'wood' }),
    'sal-timber': Object.freeze({ id: 'sal-timber', label: 'Sal Timber', category: 'wood' }),
    'dipterocarp-timber': Object.freeze({ id: 'dipterocarp-timber', label: 'Dipterocarp Timber', category: 'wood' }),
    'mangrove-timber': Object.freeze({ id: 'mangrove-timber', label: 'Mangrove Timber', category: 'wood' }),
    'laurel-timber': Object.freeze({ id: 'laurel-timber', label: 'Laurel Timber', category: 'wood' }),
});

export const REGIONAL_SPECIES = Object.freeze({
    nothofagus: Object.freeze({
        id: 'nothofagus', label: 'Southern Beech', latin: 'Nothofagus',
        bark: '#6f6755', barkLight: '#9b9075',
        summer: ['#315b38', '#507b49'], autumn: ['#a45d2d', '#c8893e'],
        form: 'dome', leafShape: 'oval', height: 1.18, crown: 1.08, trunk: 1.0, lobes: 2,
        timber: 0.98, firewood: 1.02, charcoal: 0.94, wood: 'nothofagus-timber',
        goods: ['mushrooms', 'herbs', 'lichen'], understory: ['fern', 'moss'],
    }),
    podocarpus: Object.freeze({
        id: 'podocarpus', label: 'Podocarp', latin: 'Podocarpus',
        bark: '#5d4c3d', barkLight: '#826b52',
        summer: ['#204b35', '#376b49'], autumn: ['#1e4432', '#345f42'],
        form: 'conifer', leafShape: 'needle', height: 1.12, crown: 0.9, trunk: 0.9, lobes: 2,
        conifer: true, crownShape: 'dense', tiers: 4, branchDrop: 0.05, snowRetention: 0.8,
        timber: 0.92, firewood: 0.96, charcoal: 0.9, wood: 'podocarpus-timber',
        goods: ['resin', 'mushrooms', 'herbs'], understory: ['fern', 'moss'],
    }),
    treefern: Object.freeze({
        id: 'treefern', label: 'Tree Fern', latin: 'Dicksonia',
        bark: '#4b3c2f', barkLight: '#6d5844',
        summer: ['#2f6d3d', '#4b8c50'], autumn: ['#356f40', '#578d4e'],
        form: 'palm', leafShape: 'frond', height: 0.72, crown: 1.0, trunk: 0.42, lobes: 5,
        timber: 0.28, firewood: 0.36, charcoal: 0.3, wood: 'treefern-timber',
        goods: ['mushrooms', 'herbs'], understory: ['fern', 'moss'],
    }),
    redwood: Object.freeze({
        id: 'redwood', label: 'Coast Redwood', latin: 'Sequoia sempervirens',
        bark: '#7f3f2a', barkLight: '#a75d3b',
        summer: ['#1f5036', '#367047'], autumn: ['#204b34', '#356545'],
        form: 'conifer', leafShape: 'needle', height: 1.75, crown: 0.96, trunk: 1.55, lobes: 2,
        conifer: true, crownShape: 'dense', tiers: 7, branchDrop: 0.03, snowRetention: 0.55,
        timber: 1.35, firewood: 1.05, charcoal: 1.0, wood: 'redwood-timber',
        goods: ['resin', 'mushrooms', 'lichen'], understory: ['fern', 'moss'],
    }),
    sitka: Object.freeze({
        id: 'sitka', label: 'Sitka Spruce', latin: 'Picea sitchensis',
        bark: '#5a5044', barkLight: '#83755f',
        summer: ['#24553b', '#3d7250'], autumn: ['#234f38', '#386749'],
        form: 'conifer', leafShape: 'needle', height: 1.5, crown: 0.98, trunk: 1.2, lobes: 2,
        conifer: true, crownShape: 'dense', tiers: 6, branchDrop: 0.06, snowRetention: 0.9,
        timber: 1.18, firewood: 1.0, charcoal: 0.96, wood: 'sitka-timber',
        goods: ['resin', 'mushrooms', 'lichen'], understory: ['fern', 'moss'],
    }),
    hemlock: Object.freeze({
        id: 'hemlock', label: 'Western Hemlock', latin: 'Tsuga heterophylla',
        bark: '#55483b', barkLight: '#7d6a54',
        summer: ['#214b38', '#386b4c'], autumn: ['#204633', '#345f45'],
        form: 'conifer', leafShape: 'needle', height: 1.38, crown: 0.88, trunk: 1.05, lobes: 2,
        conifer: true, crownShape: 'airy', tiers: 5, branchDrop: 0.13, snowRetention: 0.82,
        timber: 1.06, firewood: 0.98, charcoal: 0.92, wood: 'hemlock-timber',
        goods: ['resin', 'mushrooms', 'herbs'], understory: ['fern', 'moss'],
    }),
    eucalyptus: Object.freeze({
        id: 'eucalyptus', label: 'Eucalyptus', latin: 'Eucalyptus',
        bark: '#b7ae96', barkLight: '#d8d0b9',
        summer: ['#6b8b58', '#91aa72'], autumn: ['#6f8754', '#94a877'],
        form: 'airy', leafShape: 'lance', height: 1.42, crown: 0.82, trunk: 1.12, lobes: 2,
        timber: 1.04, firewood: 1.12, charcoal: 1.08, wood: 'eucalyptus-timber',
        goods: ['resin', 'herbs', 'honey'], understory: ['grass', 'herb'],
    }),
    'cork-oak': Object.freeze({
        id: 'cork-oak', label: 'Cork Oak', latin: 'Quercus suber',
        bark: '#8b6a4b', barkLight: '#b18a61',
        summer: ['#3f6138', '#617e4c'], autumn: ['#4a6136', '#6e7c49'],
        form: 'spreading', leafShape: 'oval', height: 0.86, crown: 1.06, trunk: 1.18, lobes: 3,
        timber: 0.9, firewood: 1.04, charcoal: 0.96, wood: 'cork-timber',
        goods: ['acorns', 'bark', 'honey', 'herbs'], understory: ['herb', 'grass'],
    }),
    'holm-oak': Object.freeze({
        id: 'holm-oak', label: 'Holm Oak', latin: 'Quercus ilex',
        bark: '#57483b', barkLight: '#796552',
        summer: ['#2f5335', '#4c7046'], autumn: ['#315035', '#4a6643'],
        form: 'spreading', leafShape: 'oval', height: 0.8, crown: 1.0, trunk: 0.92, lobes: 3,
        timber: 0.84, firewood: 1.0, charcoal: 0.94, wood: 'holm-timber',
        goods: ['acorns', 'honey', 'herbs'], understory: ['herb', 'grass'],
    }),
    'aleppo-pine': Object.freeze({
        id: 'aleppo-pine', label: 'Aleppo Pine', latin: 'Pinus halepensis',
        bark: '#76563a', barkLight: '#9c764e',
        summer: ['#3b6040', '#597c4d'], autumn: ['#36583a', '#527147'],
        form: 'conifer', leafShape: 'needle', height: 0.96, crown: 0.78, trunk: 0.82, lobes: 2,
        conifer: true, crownShape: 'crown', tiers: 4, branchDrop: 0.04, snowRetention: 0.35,
        timber: 0.7, firewood: 0.94, charcoal: 0.86, wood: 'aleppo-timber',
        goods: ['pine-cones', 'resin', 'herbs'], understory: ['herb', 'grass'],
    }),
    miombo: Object.freeze({
        id: 'miombo', label: 'Miombo', latin: 'Brachystegia',
        bark: '#6a5743', barkLight: '#92785a',
        summer: ['#4b7a3d', '#72a04f'], autumn: ['#7c6b36', '#a18a45'],
        form: 'spreading', leafShape: 'oval', height: 0.92, crown: 0.86, trunk: 0.72, lobes: 3,
        timber: 0.82, firewood: 1.08, charcoal: 0.94, wood: 'miombo-timber',
        goods: ['honey', 'mushrooms', 'game'], understory: ['grass', 'herb'],
    }),
    teak: Object.freeze({
        id: 'teak', label: 'Teak', latin: 'Tectona grandis',
        bark: '#79634a', barkLight: '#a08664',
        summer: ['#3f7038', '#5f9448'], autumn: ['#9a7434', '#bb9646'],
        form: 'oval', leafShape: 'large', height: 1.22, crown: 1.0, trunk: 1.08, lobes: 3,
        tropical: true, timber: 1.24, firewood: 1.04, charcoal: 1.0, wood: 'teak-timber',
        goods: ['honey', 'mushrooms', 'herbs'], understory: ['grass', 'herb'],
    }),
    sal: Object.freeze({
        id: 'sal', label: 'Sal', latin: 'Shorea robusta',
        bark: '#66533d', barkLight: '#8e7352',
        summer: ['#3b6b36', '#5b8e45'], autumn: ['#8a6732', '#aa8341'],
        form: 'oval', leafShape: 'large', height: 1.08, crown: 0.94, trunk: 0.98, lobes: 3,
        tropical: true, timber: 1.12, firewood: 1.0, charcoal: 0.96, wood: 'sal-timber',
        goods: ['resin', 'honey', 'herbs'], understory: ['grass', 'herb'],
    }),
    dipterocarp: Object.freeze({
        id: 'dipterocarp', label: 'Dipterocarp', latin: 'Dipterocarpus',
        bark: '#6f5b45', barkLight: '#98805f',
        summer: ['#285a35', '#427b47'], autumn: ['#2b5633', '#416f43'],
        form: 'emergent', leafShape: 'oval', height: 1.55, crown: 1.02, trunk: 1.12, lobes: 2,
        tropical: true, timber: 1.15, firewood: 0.96, charcoal: 0.9, wood: 'dipterocarp-timber',
        goods: ['resin', 'mushrooms', 'herbs'], understory: ['fern', 'herb'],
    }),
    mangrove: Object.freeze({
        id: 'mangrove', label: 'Mangrove', latin: 'Rhizophora',
        bark: '#5b4a3a', barkLight: '#7f6a50',
        summer: ['#2f6240', '#4b8550'], autumn: ['#315d3d', '#4a7849'],
        form: 'spreading', leafShape: 'oval', height: 0.62, crown: 0.9, trunk: 0.52, lobes: 2,
        tropical: true, timber: 0.74, firewood: 0.82, charcoal: 0.72, wood: 'mangrove-timber',
        goods: ['mangrove-timber', 'shellfish', 'salt', 'fish'], understory: ['grass', 'moss'],
    }),
    laurel: Object.freeze({
        id: 'laurel', label: 'Laurel', latin: 'Laurus',
        bark: '#5b5343', barkLight: '#81775f',
        summer: ['#315c38', '#4f7d48'], autumn: ['#365c36', '#527549'],
        form: 'round', leafShape: 'lance', height: 0.92, crown: 0.96, trunk: 0.78, lobes: 3,
        timber: 0.78, firewood: 0.94, charcoal: 0.86, wood: 'laurel-timber',
        goods: ['herbs', 'honey', 'mushrooms'], understory: ['fern', 'moss'],
    }),
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function regionalType(def) {
    return Object.freeze({
        ...def,
        effects: Object.freeze({
            timber: 1, regrowth: 1, fire: 0, fauna: 1, forage: 1, work: 1, flood: 0,
            ...(def.effects || {}),
        }),
        render: Object.freeze({
            canopy: 1, height: 1, trunk: 1, mist: 1, palette: null,
            ...(def.render || {}),
        }),
    });
}

export const REGIONAL_FOREST_TYPES = Object.freeze([
    regionalType({
        id: '1.2.23.1.001', key: 'boreal-taiga', label: 'Borealer Nadelwald / Taiga',
        short: 'Borealer Nadelwald',
        profile: 'Dunkle Fichten, Kiefern und Lärchen über Moos und Nadelstreu; langer Schnee, Torfinseln und sehr langsame Regeneration.',
        climates: ['taiga', 'snow', 'mountain'], formations: ['taiga-spruce', 'taiga-pine', 'taiga-larch', 'taiga-birch', 'taiga-mixed', 'sprucewood', 'pinewood'],
        temp: [0.10, 0.46], moisture: [0.34, 0.82], height: [0, 0.86], priority: 6,
        timber: 1.06, effects: { timber: 1.06, regrowth: 0.68, fire: 0.02, fauna: 0.92, forage: 0.96, work: 0.9 },
        species: { spruce: 0.46, pine: 0.22, larch: 0.12, birch: 0.14, rowan: 0.06 },
        goods: ['spruce-cones', 'pine-cones', 'resin', 'blueberries', 'lingonberries', 'mushrooms', 'lichen', 'game', 'timber', 'firewood'],
        fauna: ['moose', 'bear', 'wolf', 'lynx', 'crossbill', 'capercaillie', 'owl', 'fox', 'hare'],
        render: { canopy: 1.05, height: 1.12, trunk: 1.02, mist: 0.8, palette: ['#4b3e2b', '#635036', '#78613f', '#3d4a35', '#8a744b'], silhouette: 'spire' },
        probe: { climate: 'taiga', temperature: 0.28, moisture: 0.60, height: 0.45, baseFormation: 'taiga-spruce' },
    }),
    regionalType({
        id: '1.2.23.1.002', key: 'temperate-rainforest', label: 'Gemäßigter Regenwald',
        short: 'Gemäßigter Regenwald',
        profile: 'Ganzjährig nasser, mehrschichtiger Wald mit riesigen Kronen, Baumfarnen, Moospolstern und hoher Biomasse.',
        climates: ['temperate', 'mountain'], formations: ['beechwood', 'mixed', 'alluvial', 'mixed-alluvial', 'sprucewood', 'firwood'],
        temp: [0.40, 0.58], moisture: [0.72, 1], height: [0, 0.72], priority: 8,
        timber: 1.12, effects: { timber: 1.12, regrowth: 1.12, fire: -0.04, fauna: 1.18, forage: 1.14, work: 0.86, flood: 0.2 },
        species: { nothofagus: 0.34, podocarpus: 0.16, beech: 0.18, oak: 0.1, birch: 0.1, treefern: 0.12 },
        goods: ['mushrooms', 'herbs', 'lichen', 'moss', 'timber', 'firewood', 'game'],
        fauna: ['deer', 'boar', 'fox', 'owl', 'woodpecker', 'songbird', 'beetle', 'frog'],
        render: { canopy: 1.18, height: 1.22, trunk: 1.12, mist: 1.6, palette: ['#33452d', '#425b34', '#566b3d', '#293b28', '#66744b'], silhouette: 'emergent' },
        probe: { climate: 'temperate', temperature: 0.48, moisture: 0.86, height: 0.40, baseFormation: 'beechwood' },
    }),
    regionalType({
        id: '1.2.23.1.003', key: 'atlantic-cloud-forest', label: 'Atlantischer Nebelwald',
        short: 'Atlantischer Nebelwald',
        profile: 'Kühler, küstennaher Wald mit windgescherter Krone, dichten Moosen und Flechten; Nebel ersetzt einen Teil des Regens.',
        climates: ['coastal', 'mountain'], formations: ['beechwood', 'oakwood', 'birchwood', 'pinewood', 'hillside', 'mixed'],
        temp: [0.34, 0.54], moisture: [0.60, 0.83], height: [0.04, 0.85], priority: 5,
        timber: 0.92, effects: { timber: 0.92, regrowth: 0.9, fire: -0.02, fauna: 1.08, forage: 1.08, work: 0.9, flood: 0.12 },
        species: { beech: 0.34, oak: 0.2, birch: 0.16, pine: 0.12, rowan: 0.1, hazel: 0.08 },
        goods: ['mushrooms', 'lichen', 'moss', 'herbs', 'honey', 'timber', 'firewood'],
        fauna: ['deer', 'roe-deer', 'boar', 'fox', 'owl', 'songbird', 'frog', 'beetle'],
        render: { canopy: 0.96, height: 0.92, trunk: 0.94, mist: 1.8, palette: ['#40503b', '#53654a', '#68735a', '#354434', '#747d64'], silhouette: 'wind-sheared' },
        probe: { climate: 'coastal', temperature: 0.44, moisture: 0.72, height: 0.50, baseFormation: 'beechwood' },
    }),
    regionalType({
        id: '1.2.23.1.004', key: 'mediterranean-hardleaf', label: 'Mediterraner Hartlaubwald',
        short: 'Mediterraner Hartlaubwald',
        profile: 'Immergrüne, ledrige Stein- und Korkeichen über steinigem Kalk; sommertrocken, winterfeucht und feuerangepasst.',
        climates: ['coastal', 'temperate'], formations: ['oakwood', 'pinewood', 'chestnut-grove', 'hillside'],
        temp: [0.60, 0.82], moisture: [0.20, 0.54], height: [0, 0.66], priority: 7,
        timber: 0.84, effects: { timber: 0.84, regrowth: 0.72, fire: 0.16, fauna: 0.94, forage: 1.08, work: 0.96 },
        species: { 'cork-oak': 0.3, 'holm-oak': 0.28, 'aleppo-pine': 0.18, juniper: 0.1, oak: 0.14 },
        goods: ['acorns', 'bark', 'pine-cones', 'resin', 'honey', 'herbs', 'timber', 'firewood'],
        fauna: ['boar', 'roe-deer', 'hare', 'fox', 'raptor', 'butterfly', 'bee'],
        render: { canopy: 0.9, height: 0.86, trunk: 1.04, mist: 0.5, palette: ['#7a6546', '#93764e', '#a88b5e', '#66543d', '#b59b6e'], silhouette: 'gnarled' },
        probe: { climate: 'coastal', temperature: 0.70, moisture: 0.36, height: 0.40, baseFormation: 'oakwood' },
    }),
    regionalType({
        id: '1.2.23.1.005', key: 'temperate-broadleaf', label: 'Sommergrüner Laubmischwald',
        short: 'Sommergrüner Laubmischwald',
        profile: 'Der klassische gemäßigte Laubwald: Eiche, Buche, Esche und Ahorn über tiefgründiger Braunerde mit vollem Jahreszeitenwechsel.',
        climates: ['temperate', 'mountain'], formations: ['oakwood', 'beechwood', 'mixed', 'maplewood', 'linden-elm', 'chestnut-grove', 'mixed-open', 'mixed-ecotone'],
        temp: [0.44, 0.66], moisture: [0.46, 0.76], height: [0, 0.63], priority: 2,
        timber: 1.0, effects: { timber: 1.0, regrowth: 1.0, fire: 0.0, fauna: 1.05, forage: 1.08, work: 1.0 },
        species: { oak: 0.26, beech: 0.22, ash: 0.12, maple: 0.12, linden: 0.12, elm: 0.08, hornbeam: 0.08 },
        goods: ['acorns', 'beechnuts', 'mushrooms', 'honey', 'herbs', 'game', 'timber', 'firewood'],
        fauna: ['deer', 'roe-deer', 'boar', 'fox', 'squirrel', 'owl', 'woodpecker', 'songbird', 'butterfly'],
        render: { canopy: 1.0, height: 1.0, trunk: 1.0, mist: 0.8, palette: ['#4d6338', '#6f763d', '#57452e', '#7a5b36', '#647b40'], silhouette: 'dome' },
        probe: { climate: 'temperate', temperature: 0.55, moisture: 0.60, height: 0.35, baseFormation: 'oakwood' },
    }),
    regionalType({
        id: '1.2.23.1.006', key: 'pure-beech', label: 'Reiner Buchenwald',
        short: 'Reiner Buchenwald',
        profile: 'Geschlossenes Buchenhochdach mit glatten, hellen Stämmen und tiefer Kupferstreu; im Winter auffallend offen.',
        climates: ['temperate', 'mountain'], formations: ['beechwood', 'mixed', 'hillside'],
        temp: [0.38, 0.60], moisture: [0.48, 0.76], height: [0, 0.70], priority: 4,
        timber: 1.08, effects: { timber: 1.08, regrowth: 0.96, fire: -0.01, fauna: 0.92, forage: 0.94, work: 1.02 },
        species: { beech: 0.74, oak: 0.08, ash: 0.06, maple: 0.06, hornbeam: 0.06 },
        goods: ['beechnuts', 'mushrooms', 'porcini', 'game', 'timber', 'firewood'],
        fauna: ['roe-deer', 'deer', 'boar', 'squirrel', 'owl', 'woodpecker', 'beetle'],
        render: { canopy: 1.12, height: 1.08, trunk: 1.0, mist: 0.7, palette: ['#5a5338', '#756a42', '#8b7b4c', '#48432f', '#9a8958'], silhouette: 'dome' },
        probe: { climate: 'temperate', temperature: 0.50, moisture: 0.64, height: 0.40, baseFormation: 'beechwood' },
    }),
    regionalType({
        id: '1.2.23.1.007', key: 'oak-hornbeam', label: 'Eichen-Hainbuchenwald',
        short: 'Eichen-Hainbuchenwald',
        profile: 'Breite Eichen über dichtem Hainbuchen-Unterbau auf nährstoffreichem Lehm; klassischer Nieder- und Mittelwald.',
        climates: ['temperate', 'coastal'], formations: ['linden-elm', 'mixed', 'coppice-with-standards', 'mixed-open'],
        temp: [0.46, 0.65], moisture: [0.54, 0.78], height: [0, 0.52], priority: 5,
        timber: 1.02, effects: { timber: 1.02, regrowth: 1.08, fire: 0.0, fauna: 1.06, forage: 1.1, work: 1.04 },
        species: { oak: 0.38, hornbeam: 0.26, linden: 0.12, hazel: 0.1, maple: 0.08, elm: 0.06 },
        goods: ['acorns', 'hazelnuts', 'mushrooms', 'herbs', 'game', 'timber', 'firewood'],
        fauna: ['deer', 'roe-deer', 'boar', 'squirrel', 'owl', 'woodpecker', 'butterfly'],
        render: { canopy: 1.0, height: 0.96, trunk: 0.94, mist: 0.8, palette: ['#4d6337', '#6c743c', '#594a2f', '#7b5f39', '#657b41'], silhouette: 'dome' },
        probe: { climate: 'temperate', temperature: 0.56, moisture: 0.66, height: 0.30, baseFormation: 'linden-elm' },
    }),
    regionalType({
        id: '1.2.23.1.008', key: 'floodplain', label: 'Auenwald',
        short: 'Auenwald',
        profile: 'Weiden, Pappeln, Eschen und Eichen auf jungen Flussterrassen; jährliche Überflutung, Altwasser und frische Sedimente.',
        climates: ['temperate', 'coastal', 'swamp'], formations: ['alluvial', 'mixed-alluvial', 'swamp-carr', 'tropical-floodplain'],
        temp: [0.40, 0.70], moisture: [0.72, 0.97], height: [0, 0.52], priority: 9,
        timber: 0.94, effects: { timber: 0.94, regrowth: 0.96, fire: -0.03, fauna: 1.14, forage: 1.12, work: 0.88, flood: 0.7 },
        species: { willow: 0.28, alder: 0.2, ash: 0.18, oak: 0.16, elm: 0.1, birch: 0.08 },
        goods: ['willow-withies', 'herbs', 'mushrooms', 'honey', 'game', 'river-fish', 'timber', 'firewood'],
        fauna: ['beaver', 'otter', 'heron', 'frog', 'mallard', 'deer', 'boar', 'river-fish'],
        render: { canopy: 0.86, height: 0.94, trunk: 0.9, mist: 1.4, palette: ['#3f5236', '#587042', '#6a6a3d', '#30432f', '#7b7b4b'], silhouette: 'airy' },
        probe: { climate: 'temperate', temperature: 0.52, moisture: 0.82, height: 0.25, baseFormation: 'alluvial' },
    }),
    regionalType({
        id: '1.2.23.1.009', key: 'carr-woodland', label: 'Bruchwald',
        short: 'Bruchwald',
        profile: 'Erlen und Weiden auf dauerhaft nassem Gley und Niedermoor; Bulten, Schlenken, schwarzer Schlamm und offenes Wasser.',
        climates: ['swamp', 'temperate'], formations: ['swamp-carr'],
        temp: [0.36, 0.60], moisture: [0.78, 1], height: [0, 0.48], priority: 10,
        timber: 0.86, effects: { timber: 0.86, regrowth: 0.82, fire: -0.05, fauna: 1.16, forage: 1.0, work: 0.82, flood: 0.85 },
        species: { alder: 0.42, willow: 0.24, birch: 0.14, ash: 0.1, oak: 0.1 },
        goods: ['alder-timber', 'willow-withies', 'sphagnum', 'bog-herb', 'game', 'firewood', 'timber'],
        fauna: ['beaver', 'otter', 'heron', 'frog', 'mallard', 'boar', 'deer'],
        render: { canopy: 0.82, height: 0.84, trunk: 0.86, mist: 1.5, palette: ['#35452f', '#4a5d39', '#5d6040', '#29382b', '#6b6b4a'], silhouette: 'airy' },
        probe: { climate: 'swamp', temperature: 0.46, moisture: 0.88, height: 0.20, baseFormation: 'swamp-carr' },
    }),
    regionalType({
        id: '1.2.23.1.010', key: 'bog-woodland', label: 'Moorwald',
        short: 'Moorwald',
        profile: 'Krumme Kiefern und Birken auf tiefem Torf, zwischen offenen Schlenken, Wollgras und Torfmoos; extrem langsam.',
        climates: ['taiga', 'snow', 'temperate', 'mountain'], formations: ['wet-conifer', 'pine-heath', 'taiga-spruce', 'taiga-mixed', 'taiga-pine', 'taiga-birch', 'pinewood', 'subalpine-scrub'],
        temp: [0.18, 0.55], moisture: [0.72, 1], height: [0, 0.82], priority: 9,
        timber: 0.62, effects: { timber: 0.62, regrowth: 0.42, fire: 0.06, fauna: 1.12, forage: 1.06, work: 0.74, flood: 0.9 },
        species: { pine: 0.38, birch: 0.3, spruce: 0.16, 'dwarf-pine': 0.1, juniper: 0.06 },
        goods: ['pine-cones', 'blueberries', 'lingonberries', 'cloudberry', 'sphagnum', 'peat', 'timber', 'firewood'],
        fauna: ['moose', 'crane', 'frog', 'beetle', 'hare', 'fox'],
        render: { canopy: 0.62, height: 0.68, trunk: 0.7, mist: 1.7, palette: ['#3e4432', '#54583b', '#676746', '#31362a', '#757652'], silhouette: 'gnarled' },
        probe: { climate: 'taiga', temperature: 0.36, moisture: 0.86, height: 0.40, baseFormation: 'wet-conifer' },
    }),
    regionalType({
        id: '1.2.23.1.011', key: 'pine-birch', label: 'Kiefern-Birkenwald',
        short: 'Kiefern-Birkenwald',
        profile: 'Lichte Kiefern und Birken auf armen Sandböden, mit Heidekraut, Flechten und offenen Rohböden.',
        climates: ['temperate', 'taiga', 'snow'], formations: ['pine-heath', 'pinewood', 'birchwood', 'mixed-open', 'taiga-pine'],
        temp: [0.30, 0.60], moisture: [0.28, 0.58], height: [0, 0.72], priority: 4,
        timber: 0.86, effects: { timber: 0.86, regrowth: 1.16, fire: 0.08, fauna: 1.0, forage: 1.12, work: 1.06 },
        species: { pine: 0.5, birch: 0.24, juniper: 0.1, oak: 0.06, rowan: 0.1 },
        goods: ['pine-cones', 'birch-sap', 'blueberries', 'lingonberries', 'lichen', 'mushrooms', 'timber', 'firewood'],
        fauna: ['capercaillie', 'hare', 'fox', 'squirrel', 'ant', 'bark-beetle', 'butterfly'],
        render: { canopy: 0.82, height: 1.08, trunk: 0.96, mist: 0.5, palette: ['#6a5a3e', '#84704b', '#9a8459', '#564932', '#aa9468'], silhouette: 'airy' },
        probe: { climate: 'temperate', temperature: 0.44, moisture: 0.42, height: 0.40, baseFormation: 'pine-heath' },
    }),
    regionalType({
        id: '1.2.23.1.012', key: 'spruce-fir', label: 'Fichten-Tannenwald',
        short: 'Fichten-Tannenwald',
        profile: 'Dunkler, feuchter Nadelwald der Mittelgebirge aus Fichte und Tanne, mit Moos, Farnen und reichlich Moderholz.',
        climates: ['mountain', 'taiga', 'temperate'], formations: ['sprucewood', 'firwood', 'mixed-conifer', 'mountain-conifer'],
        temp: [0.26, 0.56], moisture: [0.55, 0.84], height: [0.18, 0.86], priority: 6,
        timber: 1.18, effects: { timber: 1.18, regrowth: 0.78, fire: -0.01, fauna: 0.98, forage: 0.94, work: 0.88 },
        species: { spruce: 0.42, fir: 0.3, beech: 0.1, maple: 0.06, rowan: 0.06, birch: 0.06 },
        goods: ['spruce-cones', 'fir-cones', 'resin', 'mushrooms', 'lichen', 'game', 'timber', 'firewood'],
        fauna: ['deer', 'roe-deer', 'fox', 'owl', 'crossbill', 'woodpecker', 'bark-beetle', 'capercaillie'],
        render: { canopy: 1.16, height: 1.16, trunk: 1.04, mist: 1.1, palette: ['#3f3c2d', '#55503a', '#6a6043', '#343529', '#776b4d'], silhouette: 'spire' },
        probe: { climate: 'mountain', temperature: 0.40, moisture: 0.68, height: 0.60, baseFormation: 'sprucewood' },
    }),
    regionalType({
        id: '1.2.23.1.013', key: 'larch-wood', label: 'Lärchenwald',
        short: 'Lärchenwald',
        profile: 'Luftiger, lichtdurchfluteter Lärchenwald, der im Herbst goldgelb wird und im Winter seine Nadeln verliert.',
        climates: ['taiga', 'snow', 'mountain'], formations: ['larchwood', 'taiga-larch', 'mountain-conifer', 'mixed-conifer'],
        temp: [0.22, 0.54], moisture: [0.32, 0.68], height: [0.18, 0.86], priority: 6,
        timber: 0.98, effects: { timber: 0.98, regrowth: 1.04, fire: 0.04, fauna: 0.98, forage: 1.08, work: 1.04 },
        species: { larch: 0.58, pine: 0.16, spruce: 0.1, birch: 0.1, juniper: 0.06 },
        goods: ['larch-timber', 'larch-cones', 'resin', 'mushrooms', 'blueberries', 'herbs', 'timber', 'firewood'],
        fauna: ['roe-deer', 'deer', 'hare', 'fox', 'crossbill', 'songbird', 'capercaillie'],
        render: { canopy: 0.76, height: 1.14, trunk: 0.92, mist: 0.6, palette: ['#5d5136', '#756641', '#8c794c', '#4a432f', '#a18c5b'], silhouette: 'airy' },
        probe: { climate: 'taiga', temperature: 0.38, moisture: 0.52, height: 0.55, baseFormation: 'larchwood' },
    }),
    regionalType({
        id: '1.2.23.1.014', key: 'montane-mixed', label: 'Bergmischwald',
        short: 'Bergmischwald',
        profile: 'Buche, Tanne, Fichte und Bergahorn in gestaffelten Höhenstufen; frische Hänge, Blocklehm und wechselnde Kronen.',
        climates: ['mountain', 'temperate'], formations: ['mixed-montane', 'mixed-conifer', 'mixed-fir-beech-maple', 'hillside', 'selection-forest'],
        temp: [0.28, 0.62], moisture: [0.44, 0.80], height: [0.42, 0.90], priority: 5,
        timber: 1.1, effects: { timber: 1.1, regrowth: 0.92, fire: -0.02, fauna: 1.1, forage: 1.04, work: 0.94 },
        species: { beech: 0.24, fir: 0.22, spruce: 0.18, maple: 0.16, rowan: 0.1, birch: 0.1 },
        goods: ['mushrooms', 'herbs', 'game', 'rowan-berries', 'resin', 'timber', 'firewood'],
        fauna: ['deer', 'roe-deer', 'fox', 'owl', 'raptor', 'woodpecker', 'crossbill', 'capercaillie'],
        render: { canopy: 1.06, height: 1.1, trunk: 0.98, mist: 1.0, palette: ['#435032', '#5b6740', '#6f754d', '#35432e', '#7e855c'], silhouette: 'layered' },
        probe: { climate: 'mountain', temperature: 0.42, moisture: 0.60, height: 0.70, baseFormation: 'mixed-montane' },
    }),
    regionalType({
        id: '1.2.23.1.015', key: 'subalpine', label: 'Subalpiner Wald',
        short: 'Subalpiner Wald',
        profile: 'Windgebogene Zirben, Lärchen und Krummholz nahe der Baumgrenze; kurze Sommer, Schneelast und offene Felsinseln.',
        climates: ['mountain', 'snow', 'taiga'], formations: ['subalpine-scrub', 'mountain-conifer', 'taiga-larch', 'larchwood'],
        temp: [0.08, 0.48], moisture: [0.28, 0.82], height: [0.72, 1], priority: 8,
        timber: 0.6, effects: { timber: 0.6, regrowth: 0.58, fire: 0.0, fauna: 0.9, forage: 0.92, work: 0.78 },
        species: { juniper: 0.26, pine: 0.2, larch: 0.18, spruce: 0.1, 'dwarf-pine': 0.18, birch: 0.08 },
        goods: ['juniper-berries', 'pine-cones', 'larch-cones', 'lichen', 'herbs', 'resin', 'timber', 'firewood'],
        fauna: ['roe-deer', 'hare', 'fox', 'raptor', 'crossbill', 'capercaillie'],
        render: { canopy: 0.58, height: 0.7, trunk: 0.72, mist: 1.2, palette: ['#5c5c45', '#747251', '#89855d', '#484b39', '#9a9469'], silhouette: 'krummholz' },
        probe: { climate: 'mountain', temperature: 0.30, moisture: 0.60, height: 0.86, baseFormation: 'subalpine-scrub' },
    }),
    regionalType({
        id: '1.2.23.1.016', key: 'coast-redwood', label: 'Küstenmammutbaumwald',
        short: 'Küstenmammutbaumwald',
        profile: 'Monumentale rote Stämme in der küstennahen Nebelzone, mit hohem Farn-Unterwuchs und enormer Biomasse.',
        climates: ['coastal'], formations: ['sprucewood', 'firwood', 'mixed-conifer', 'mixed-fir-beech-maple', 'beechwood', 'oakwood', 'mixed', 'pinewood'],
        temp: [0.47, 0.62], moisture: [0.66, 0.80], height: [0.22, 0.55], priority: 8,
        timber: 1.34, effects: { timber: 1.34, regrowth: 0.82, fire: -0.02, fauna: 1.12, forage: 0.98, work: 0.9, flood: 0.1 },
        species: { redwood: 0.46, sitka: 0.2, hemlock: 0.14, nothofagus: 0.1, treefern: 0.1 },
        goods: ['resin', 'mushrooms', 'lichen', 'herbs', 'timber', 'firewood'],
        fauna: ['deer', 'fox', 'owl', 'woodpecker', 'songbird', 'beetle', 'frog'],
        render: { canopy: 1.22, height: 1.5, trunk: 1.42, mist: 1.7, palette: ['#4a3a2b', '#624d36', '#786044', '#352d24', '#8a7051'], silhouette: 'column' },
        probe: { climate: 'coastal', temperature: 0.54, moisture: 0.74, height: 0.45, baseFormation: 'sprucewood' },
    }),
    regionalType({
        id: '1.2.23.1.017', key: 'pacific-rainforest', label: 'Pazifischer Regenwald',
        short: 'Pazifischer Regenwald',
        profile: 'Sitka-Fichte, Hemlocktanne und Moos in einem ganzjährig nassen Küstenwald mit gewaltiger Biomasse.',
        climates: ['coastal'], formations: ['sprucewood', 'firwood', 'mixed-conifer', 'wet-conifer'],
        temp: [0.38, 0.54], moisture: [0.64, 0.84], height: [0, 0.66], priority: 7,
        timber: 1.2, effects: { timber: 1.2, regrowth: 1.0, fire: -0.04, fauna: 1.16, forage: 1.08, work: 0.86, flood: 0.16 },
        species: { sitka: 0.36, hemlock: 0.28, redwood: 0.14, nothofagus: 0.12, treefern: 0.1 },
        goods: ['resin', 'mushrooms', 'lichen', 'herbs', 'game', 'timber', 'firewood'],
        fauna: ['deer', 'boar', 'fox', 'owl', 'woodpecker', 'songbird', 'beetle', 'frog'],
        render: { canopy: 1.18, height: 1.34, trunk: 1.24, mist: 1.9, palette: ['#33432e', '#465a37', '#596a41', '#283628', '#6b7650'], silhouette: 'emergent' },
        probe: { climate: 'coastal', temperature: 0.46, moisture: 0.70, height: 0.40, baseFormation: 'firwood' },
    }),
    regionalType({
        id: '1.2.23.1.018', key: 'eucalyptus', label: 'Eukalyptuswald',
        short: 'Eukalyptuswald',
        profile: 'Hohe, lichte Eukalypten mit glatten Stämmen und feuerangepasstem Unterwuchs; sommertrocken und schnell regenerierend.',
        climates: ['savanna', 'coastal'], formations: ['savanna-woodland', 'oakwood', 'pinewood'],
        temp: [0.62, 0.86], moisture: [0.26, 0.41], height: [0, 0.72], priority: 6,
        timber: 1.06, effects: { timber: 1.06, regrowth: 1.24, fire: 0.18, fauna: 0.92, forage: 1.06, work: 1.02 },
        species: { eucalyptus: 0.58, 'aleppo-pine': 0.14, acacia: 0.12, ironwood: 0.1, juniper: 0.06 },
        goods: ['resin', 'honey', 'herbs', 'timber', 'firewood', 'charcoal'],
        fauna: ['hare', 'fox', 'raptor', 'butterfly', 'bee', 'ant'],
        render: { canopy: 0.78, height: 1.3, trunk: 1.12, mist: 0.4, palette: ['#8a7452', '#a58a61', '#b89d73', '#725f44', '#c5ad84'], silhouette: 'airy' },
        probe: { climate: 'savanna', temperature: 0.72, moisture: 0.41, height: 0.35, baseFormation: 'savanna-woodland' },
    }),
    regionalType({
        id: '1.2.23.1.019', key: 'acacia-woodland', label: 'Akazien-Waldland',
        short: 'Akazien-Waldland',
        profile: 'Schirmakazien und Kameldorn über sonnigem Gras; halbtrocken, mit Regen- und Trockenzeit.',
        climates: ['savanna'], formations: ['savanna-woodland', 'mixed-open'],
        temp: [0.55, 0.86], moisture: [0.30, 0.56], height: [0, 0.76], priority: 4,
        timber: 0.78, effects: { timber: 0.78, regrowth: 1.0, fire: 0.1, fauna: 1.12, forage: 1.14, work: 0.98 },
        species: { acacia: 0.42, camelthorn: 0.2, marula: 0.16, 'fever-tree': 0.12, baobab: 0.1 },
        goods: ['gum-arabic', 'marula-fruit', 'honey', 'game', 'timber', 'firewood'],
        fauna: ['giraffe', 'elephant', 'impala', 'guinea-fowl', 'lion', 'vulture', 'ant'],
        render: { canopy: 0.66, height: 0.96, trunk: 0.84, mist: 0.35, palette: ['#8a7444', '#a38a52', '#b89c61', '#705e3a', '#c4aa70'], silhouette: 'umbrella' },
        probe: { climate: 'savanna', temperature: 0.66, moisture: 0.42, height: 0.35, baseFormation: 'savanna-woodland' },
    }),
    regionalType({
        id: '1.2.23.1.020', key: 'miombo', label: 'Miombo-Wald',
        short: 'Miombo-Wald',
        profile: 'Lichte Brachystegia-Kronen über Gras und Kraut; tropisch-saisonal mit trockenem Winter und Feuerökologie.',
        climates: ['savanna'], formations: ['savanna-woodland', 'mixed-open'],
        temp: [0.52, 0.82], moisture: [0.48, 0.64], height: [0, 0.72], priority: 5,
        timber: 0.82, effects: { timber: 0.82, regrowth: 1.08, fire: 0.12, fauna: 1.08, forage: 1.16, work: 0.96 },
        species: { miombo: 0.5, acacia: 0.16, marula: 0.12, baobab: 0.1, 'fever-tree': 0.12 },
        goods: ['honey', 'mushrooms', 'game', 'marula-fruit', 'timber', 'firewood'],
        fauna: ['elephant', 'giraffe', 'impala', 'guinea-fowl', 'vulture', 'ant'],
        render: { canopy: 0.7, height: 0.9, trunk: 0.78, mist: 0.3, palette: ['#7d6d45', '#957e51', '#aa9160', '#655838', '#b9a06d'], silhouette: 'umbrella' },
        probe: { climate: 'savanna', temperature: 0.64, moisture: 0.54, height: 0.45, baseFormation: 'savanna-woodland' },
    }),
    regionalType({
        id: '1.2.23.1.021', key: 'baobab-woodland', label: 'Baobab-Waldland',
        short: 'Baobab-Waldland',
        profile: 'Fassförmige Baobabs, Marula und Dorngehölz in heißer, stark saisonaler Trockensavanne.',
        climates: ['savanna'], formations: ['savanna-woodland'],
        temp: [0.55, 0.92], moisture: [0.24, 0.46], height: [0.40, 0.78], priority: 6,
        timber: 0.72, effects: { timber: 0.72, regrowth: 0.72, fire: 0.08, fauna: 1.14, forage: 1.1, work: 0.92 },
        species: { baobab: 0.42, marula: 0.24, camelthorn: 0.18, acacia: 0.1, 'fever-tree': 0.06 },
        goods: ['baobab-fruit', 'baobab-fibre', 'marula-fruit', 'game', 'timber', 'firewood'],
        fauna: ['elephant', 'giraffe', 'impala', 'vulture', 'guinea-fowl', 'ant'],
        render: { canopy: 0.6, height: 1.0, trunk: 1.7, mist: 0.25, palette: ['#92784a', '#a88d58', '#bd9f66', '#77603c', '#c9ae78'], silhouette: 'baobab' },
        probe: { climate: 'savanna', temperature: 0.74, moisture: 0.28, height: 0.55, baseFormation: 'savanna-woodland' },
    }),
    regionalType({
        id: '1.2.23.1.022', key: 'thornscrub', label: 'Dornwald / Thornscrub',
        short: 'Dornwald',
        profile: 'Niedrige, dornige Akazien und Commiphora über heißem, steinigem Boden; der trockenste Waldtyp des Spiels.',
        climates: ['savanna'], formations: ['savanna-woodland'],
        temp: [0.55, 0.96], moisture: [0.06, 0.40], height: [0, 0.46], priority: 7,
        timber: 0.56, effects: { timber: 0.56, regrowth: 0.66, fire: 0.06, fauna: 0.84, forage: 1.0, work: 0.9 },
        species: { acacia: 0.38, camelthorn: 0.3, baobab: 0.1, marula: 0.1, juniper: 0.12 },
        goods: ['thorn-branches', 'gum-arabic', 'game', 'firewood', 'timber'],
        fauna: ['hare', 'fox', 'raptor', 'vulture', 'ant', 'beetle'],
        render: { canopy: 0.5, height: 0.64, trunk: 0.66, mist: 0.2, palette: ['#9a7d4d', '#af9159', '#c2a466', '#7d653f', '#cdb37a'], silhouette: 'thorn' },
        probe: { climate: 'savanna', temperature: 0.80, moisture: 0.16, height: 0.30, baseFormation: 'savanna-woodland' },
    }),
    regionalType({
        id: '1.2.23.1.023', key: 'gallery-forest', label: 'Galeriewald',
        short: 'Galeriewald',
        profile: 'Ein grüner Korridor aus Weiden, Feigen und Fever Trees entlang von Flüssen im Trockenland.',
        climates: ['savanna'], formations: ['savanna-woodland', 'alluvial', 'mixed-alluvial', 'tropical-riverbank'],
        temp: [0.48, 0.88], moisture: [0.62, 0.92], height: [0, 0.50], priority: 9,
        timber: 0.92, effects: { timber: 0.92, regrowth: 1.22, fire: -0.05, fauna: 1.2, forage: 1.16, work: 0.94, flood: 0.6 },
        species: { willow: 0.22, alder: 0.16, 'fever-tree': 0.18, acacia: 0.16, fig: 0.14, ash: 0.14 },
        goods: ['willow-withies', 'river-fish', 'honey', 'game', 'herbs', 'timber', 'firewood'],
        fauna: ['beaver', 'otter', 'heron', 'frog', 'river-fish', 'impala', 'guinea-fowl'],
        render: { canopy: 0.9, height: 0.98, trunk: 0.9, mist: 1.0, palette: ['#435c35', '#5c7442', '#6f7d4a', '#32452f', '#81905b'], silhouette: 'corridor' },
        probe: { climate: 'savanna', temperature: 0.62, moisture: 0.72, height: 0.20, baseFormation: 'savanna-woodland' },
    }),
    regionalType({
        id: '1.2.23.1.024', key: 'mangrove', label: 'Mangrovenwald',
        short: 'Mangrovenwald',
        profile: 'Stelzwurzeln, Gezeiten und Brackwasser an tropischen Küsten und Deltas; Holz, Fisch und Küstenschutz.',
        climates: ['tropical'], formations: ['tropical-swamp', 'tropical-floodplain', 'tropical-riverbank', 'tropical-palm-grove'],
        temp: [0.62, 0.92], moisture: [0.58, 1], height: [0, 0.44], priority: 10,
        timber: 0.78, effects: { timber: 0.78, regrowth: 0.94, fire: -0.06, fauna: 1.24, forage: 1.2, work: 0.78, flood: 1.0 },
        species: { mangrove: 0.58, palm: 0.14, fig: 0.12, balsa: 0.08, bamboo: 0.08 },
        goods: ['mangrove-timber', 'shellfish', 'salt', 'fish', 'reed', 'timber', 'firewood'],
        fauna: ['caiman', 'giant-otter', 'heron', 'frog', 'river-fish', 'mosquito', 'crab'],
        render: { canopy: 0.82, height: 0.6, trunk: 0.62, mist: 1.5, palette: ['#34543a', '#456b45', '#587b4d', '#294530', '#6b8a59'], silhouette: 'stilt' },
        probe: { climate: 'tropical', temperature: 0.72, moisture: 0.90, height: 0.15, baseFormation: 'tropical-swamp' },
    }),
    regionalType({
        id: '1.2.23.1.025', key: 'bamboo-forest', label: 'Bambuswald',
        short: 'Bambuswald',
        profile: 'Dichte, hohle Bambushalme mit schneller Rhizomregeneration; nach der Blüte großflächiges Absterben.',
        climates: ['tropical'], formations: ['tropical-bamboo', 'tropical-secondary', 'tropical-gap', 'tropical-plantation'],
        temp: [0.58, 0.88], moisture: [0.68, 0.96], height: [0.05, 0.66], priority: 8,
        timber: 0.9, effects: { timber: 0.9, regrowth: 1.32, fire: 0.02, fauna: 0.96, forage: 1.18, work: 0.9 },
        species: { bamboo: 0.7, balsa: 0.1, fig: 0.08, palm: 0.06, teak: 0.06 },
        goods: ['bamboo', 'bamboo-shoots', 'rattan', 'herbs', 'timber', 'firewood'],
        fauna: ['spider-monkey', 'toucan', 'morpho-butterfly', 'bullet-ant', 'mosquito', 'iguana'],
        render: { canopy: 1.18, height: 1.22, trunk: 0.46, mist: 1.2, palette: ['#3c5d33', '#517545', '#657f4d', '#2e4a2c', '#788f5e'], silhouette: 'bamboo' },
        probe: { climate: 'tropical', temperature: 0.72, moisture: 0.80, height: 0.35, baseFormation: 'tropical-bamboo' },
    }),
    regionalType({
        id: '1.2.23.1.026', key: 'teak-forest', label: 'Teakwald',
        short: 'Teakwald',
        profile: 'Großblättriger Teakwald mit wertvollem Holz, sommergrüner Krone und ausgeprägter Trockenzeit.',
        climates: ['tropical'], formations: ['tropical-monsoon', 'tropical-canopy', 'tropical-secondary'],
        temp: [0.60, 0.88], moisture: [0.56, 0.66], height: [0.05, 0.66], priority: 6,
        timber: 1.26, effects: { timber: 1.26, regrowth: 0.9, fire: 0.06, fauna: 0.98, forage: 1.0, work: 1.0 },
        species: { teak: 0.5, sal: 0.14, bamboo: 0.12, fig: 0.1, ironwood: 0.14 },
        goods: ['honey', 'mushrooms', 'herbs', 'timber', 'firewood', 'charcoal'],
        fauna: ['elephant', 'tiger', 'spider-monkey', 'toucan', 'bullet-ant', 'mosquito'],
        render: { canopy: 0.92, height: 1.24, trunk: 1.16, mist: 0.9, palette: ['#4b6234', '#627548', '#777c4f', '#3a4c2d', '#8a8b5d'], silhouette: 'large-leaf' },
        probe: { climate: 'tropical', temperature: 0.70, moisture: 0.62, height: 0.35, baseFormation: 'tropical-monsoon' },
    }),
    regionalType({
        id: '1.2.23.1.027', key: 'sal-forest', label: 'Salwald',
        short: 'Salwald',
        profile: 'Sal-Bäume mit laubwerfendem Kronendach und Feuerökologie; trockener und lichter als Teakwald.',
        climates: ['tropical'], formations: ['tropical-monsoon', 'tropical-secondary', 'tropical-gap'],
        temp: [0.60, 0.90], moisture: [0.46, 0.58], height: [0.05, 0.70], priority: 7,
        timber: 1.12, effects: { timber: 1.12, regrowth: 0.98, fire: 0.12, fauna: 1.06, forage: 1.08, work: 1.02 },
        species: { sal: 0.52, teak: 0.12, bamboo: 0.1, acacia: 0.12, ironwood: 0.14 },
        goods: ['resin', 'honey', 'herbs', 'game', 'timber', 'firewood'],
        fauna: ['elephant', 'tiger', 'spider-monkey', 'toucan', 'bullet-ant', 'iguana'],
        render: { canopy: 0.78, height: 1.06, trunk: 1.0, mist: 0.7, palette: ['#5c6536', '#747b45', '#888a50', '#48502e', '#9a9b60'], silhouette: 'large-leaf' },
        probe: { climate: 'tropical', temperature: 0.72, moisture: 0.52, height: 0.40, baseFormation: 'tropical-monsoon' },
    }),
    regionalType({
        id: '1.2.23.1.028', key: 'dipterocarp', label: 'Dipterocarpaceenwald',
        short: 'Dipterocarpaceenwald',
        profile: 'Artenreicher tropischer Tieflandsregenwald mit hohen Emergenten, Brettwurzeln und Mastjahren.',
        climates: ['tropical'], formations: ['tropical-emergent', 'tropical-canopy', 'tropical-ancient', 'tropical-montane'],
        temp: [0.64, 0.92], moisture: [0.76, 1], height: [0, 0.72], priority: 9,
        timber: 1.16, effects: { timber: 1.16, regrowth: 1.04, fire: -0.04, fauna: 1.26, forage: 1.14, work: 0.84, flood: 0.1 },
        species: { dipterocarp: 0.42, ironwood: 0.14, rosewood: 0.12, fig: 0.12, bamboo: 0.08, palm: 0.12 },
        goods: ['resin', 'rattan', 'mushrooms', 'herbs', 'timber', 'firewood'],
        fauna: ['tiger', 'spider-monkey', 'howler-monkey', 'toucan', 'macaw', 'morpho-butterfly', 'mosquito'],
        render: { canopy: 1.2, height: 1.36, trunk: 1.2, mist: 1.4, palette: ['#2f4f30', '#42653b', '#557546', '#263f28', '#687f55'], silhouette: 'emergent' },
        probe: { climate: 'tropical', temperature: 0.75, moisture: 0.88, height: 0.35, baseFormation: 'tropical-emergent' },
    }),
    regionalType({
        id: '1.2.23.1.029', key: 'laurel-forest', label: 'Lorbeerwald',
        short: 'Lorbeerwald',
        profile: 'Immergrüne Lorbeerbäume in feuchten, milden Bergregionen; ledrige Blätter, Nebel und moosige Stämme.',
        climates: ['coastal', 'mountain', 'tropical'], formations: ['beechwood', 'mixed-montane', 'tropical-montane', 'hillside', 'mixed-fir-beech-maple'],
        temp: [0.46, 0.68], moisture: [0.64, 0.88], height: [0.55, 0.88], priority: 6,
        timber: 0.9, effects: { timber: 0.9, regrowth: 1.02, fire: -0.02, fauna: 1.14, forage: 1.12, work: 0.92, flood: 0.1 },
        species: { laurel: 0.42, nothofagus: 0.16, beech: 0.14, oak: 0.1, podocarpus: 0.1, treefern: 0.08 },
        goods: ['herbs', 'honey', 'mushrooms', 'lichen', 'timber', 'firewood'],
        fauna: ['deer', 'boar', 'fox', 'owl', 'songbird', 'beetle', 'frog'],
        render: { canopy: 1.0, height: 1.0, trunk: 0.92, mist: 1.5, palette: ['#3b5335', '#506b3e', '#647a49', '#2e452d', '#778c5b'], silhouette: 'dome' },
        probe: { climate: 'coastal', temperature: 0.55, moisture: 0.72, height: 0.65, baseFormation: 'beechwood' },
    }),
    regionalType({
        id: '1.2.23.1.030', key: 'monsoon-forest', label: 'Monsunwald',
        short: 'Monsunwald',
        profile: 'Teak, Sal und Bambus in einem sommergrünen Monsunwald mit ausgeprägter Regen- und Trockenzeit.',
        climates: ['tropical'], formations: ['tropical-monsoon', 'tropical-secondary', 'tropical-canopy'],
        temp: [0.60, 0.90], moisture: [0.64, 0.78], height: [0.05, 0.72], priority: 5,
        timber: 1.04, effects: { timber: 1.04, regrowth: 1.12, fire: 0.06, fauna: 1.08, forage: 1.08, work: 0.96 },
        species: { teak: 0.26, sal: 0.18, bamboo: 0.2, fig: 0.12, ironwood: 0.12, dipterocarp: 0.12 },
        goods: ['bamboo', 'bamboo-shoots', 'honey', 'mushrooms', 'herbs', 'timber', 'firewood'],
        fauna: ['elephant', 'tiger', 'spider-monkey', 'toucan', 'bullet-ant', 'mosquito'],
        render: { canopy: 1.02, height: 1.16, trunk: 1.04, mist: 1.1, palette: ['#3f6136', '#557844', '#6b824d', '#304b2e', '#7d905b'], silhouette: 'layered' },
        probe: { climate: 'tropical', temperature: 0.70, moisture: 0.70, height: 0.35, baseFormation: 'tropical-monsoon' },
    }),
]);

// Every regional species names one physical timber good. The economy uses the
// same record for its warehouse label, its sawmill batch and its market quote,
// so a redwood beam cannot drift into a different price on another screen.
// Prices are base silver per unit; the market module applies season and stock
// pressure on top and never writes the base back into the save.
export const REGIONAL_TIMBERS = Object.freeze(Object.values(REGIONAL_SPECIES)
    .filter(species => species.wood)
    .map(species => {
        const tropical = Boolean(species.tropical);
        const basePrice = Math.round((2.2 + species.timber * 1.9 + (tropical ? 0.7 : 0)) * 10) / 10;
        return Object.freeze({
            id: species.wood,
            label: REGIONAL_GOODS[species.wood]?.label || species.wood,
            species: species.id,
            speciesLabel: species.label,
            tropical,
            timber: species.timber,
            firewood: species.firewood,
            basePrice,
            // Two units of timber go on the saw bench. Dense hardwoods give a
            // third plank; soft regional woods still give firewood. The old
            // logs recipe (2 logs -> 2 planks + 1 firewood) is unchanged.
            planks: Math.max(1, Math.round(2 * species.timber)),
            firewoodYield: Math.max(1, Math.round(species.firewood)),
        });
    }));

export const REGIONAL_TIMBER_KEYS = Object.freeze(REGIONAL_TIMBERS.map(timber => timber.id));
export const REGIONAL_TIMBER_BY_GOOD = Object.freeze(Object.fromEntries(REGIONAL_TIMBERS.map(timber => [timber.id, timber])));

export function regionalTimberGood(id) {
    return REGIONAL_TIMBER_BY_GOOD[id] || null;
}

// A forest type's signature timber is the heaviest species that actually names
// a timber. Types built from generic spruce/pine/acacia keep returning null and
// fall back to the ordinary log chain instead of inventing a new good.
export function signatureTimberForRegionalType(type) {
    if (!type?.species) return null;
    let best = null, bestWeight = -1;
    for (const [speciesId, weight] of Object.entries(type.species)) {
        const species = REGIONAL_SPECIES[speciesId];
        if (!species?.wood || !(weight > bestWeight)) continue;
        best = REGIONAL_TIMBER_BY_GOOD[species.wood] || null;
        bestWeight = Number(weight) || 0;
    }
    return best;
}

export const REGIONAL_FOREST_TYPE_IDS = Object.freeze(REGIONAL_FOREST_TYPES.map(type => type.id));
export const REGIONAL_FOREST_TYPE_BY_ID = Object.freeze(Object.fromEntries(REGIONAL_FOREST_TYPES.map(type => [type.id, type])));
export const REGIONAL_FOREST_TYPE_BY_KEY = Object.freeze(Object.fromEntries(REGIONAL_FOREST_TYPES.map(type => [type.key, type])));
const REGIONAL_TYPE_INDEX = Object.freeze(Object.fromEntries(REGIONAL_FOREST_TYPE_IDS.map((id, index) => [id, index + 1])));

export function regionalForestTypeIndex(id) {
    return REGIONAL_TYPE_INDEX[id] || 0;
}

export function regionalForestTypeFromIndex(index) {
    const slot = Math.max(0, Math.floor(Number(index) || 0));
    return slot > 0 ? REGIONAL_FOREST_TYPE_BY_ID[REGIONAL_FOREST_TYPE_IDS[slot - 1]] || null : null;
}

function hash32(seed, x, y, salt) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Math.floor(Number(x) || 0) + 1) >>> 0, 0x9e3779b1)
        ^ Math.imul((Math.floor(Number(y) || 0) + 1) >>> 0, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unitHash(seed, x, y, salt) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

function coarseUnit(seed, x, y, cell, salt) {
    const size = Math.max(1, Math.floor(Number(cell) || 7));
    return unitHash(seed, Math.floor((Number(x) || 0) / size), Math.floor((Number(y) || 0) / size), salt);
}

function within(value, range) {
    return value >= range[0] && value <= range[1];
}

function isTropicalContext(climate) {
    return climate === 'tropical' || climate === 'jungle';
}

function riverContext(baseFormation) {
    return baseFormation === 'alluvial' || baseFormation === 'mixed-alluvial'
        || baseFormation === 'tropical-floodplain' || baseFormation === 'tropical-riverbank'
        || baseFormation === 'tropical-swamp' || baseFormation === 'swamp-carr';
}

// A candidate is a real site match, not a random type draw. The ordered gates
// keep the regional identity spatially coherent; the coarse patch only decides
// between genuinely overlapping communities inside the same belt.
function matchesSite(type, ctx) {
    if (!type.climates.includes(ctx.climate) && !(isTropicalContext(ctx.climate) && type.climates.includes('tropical'))) return false;
    if (Array.isArray(type.formations) && type.formations.length && !type.formations.includes(ctx.baseFormation)) return false;
    if (!within(ctx.temperature, type.temp)) return false;
    if (!within(ctx.moisture, type.moisture)) return false;
    if (!within(ctx.height, type.height)) return false;
    return true;
}

function fallbackType(ctx) {
    if (isTropicalContext(ctx.climate)) {
        if (ctx.height <= 0.36 && ctx.moisture >= 0.78) return REGIONAL_FOREST_TYPE_BY_KEY.mangrove;
        if (ctx.baseFormation === 'tropical-bamboo') return REGIONAL_FOREST_TYPE_BY_KEY['bamboo-forest'];
        if (ctx.moisture >= 0.76) return REGIONAL_FOREST_TYPE_BY_KEY.dipterocarp;
        if (ctx.moisture < 0.40) return REGIONAL_FOREST_TYPE_BY_KEY['sal-forest'];
        if (ctx.moisture < 0.56) return REGIONAL_FOREST_TYPE_BY_KEY['teak-forest'];
        return REGIONAL_FOREST_TYPE_BY_KEY['monsoon-forest'];
    }
    if (ctx.climate === 'savanna') {
        if (ctx.moisture >= 0.62) return REGIONAL_FOREST_TYPE_BY_KEY['gallery-forest'];
        if (ctx.moisture < 0.26) return REGIONAL_FOREST_TYPE_BY_KEY.thornscrub;
        if (ctx.moisture < 0.36) return REGIONAL_FOREST_TYPE_BY_KEY['baobab-woodland'];
        if (ctx.moisture < 0.56) return REGIONAL_FOREST_TYPE_BY_KEY['acacia-woodland'];
        return REGIONAL_FOREST_TYPE_BY_KEY.miombo;
    }
    if (ctx.climate === 'swamp') return REGIONAL_FOREST_TYPE_BY_KEY['carr-woodland'];
    if (ctx.climate === 'tundra') return REGIONAL_FOREST_TYPE_BY_KEY.subalpine;
    if (ctx.climate === 'taiga' || ctx.climate === 'snow') return REGIONAL_FOREST_TYPE_BY_KEY['boreal-taiga'];
    if (ctx.climate === 'mountain') return ctx.height > 0.78
        ? REGIONAL_FOREST_TYPE_BY_KEY.subalpine
        : ctx.moisture > 0.6 ? REGIONAL_FOREST_TYPE_BY_KEY['montane-mixed'] : REGIONAL_FOREST_TYPE_BY_KEY['spruce-fir'];
    if (ctx.climate === 'coastal') return ctx.moisture > 0.74
        ? REGIONAL_FOREST_TYPE_BY_KEY['pacific-rainforest']
        : ctx.temperature > 0.6 ? REGIONAL_FOREST_TYPE_BY_KEY['mediterranean-hardleaf'] : REGIONAL_FOREST_TYPE_BY_KEY['atlantic-cloud-forest'];
    if (ctx.moisture > 0.78) return REGIONAL_FOREST_TYPE_BY_KEY['floodplain'];
    if (ctx.baseFormation === 'beechwood') return REGIONAL_FOREST_TYPE_BY_KEY['pure-beech'];
    if (ctx.baseFormation === 'pinewood' || ctx.baseFormation === 'pine-heath') return REGIONAL_FOREST_TYPE_BY_KEY['pine-birch'];
    if (ctx.baseFormation === 'sprucewood' || ctx.baseFormation === 'firwood') return REGIONAL_FOREST_TYPE_BY_KEY['spruce-fir'];
    if (ctx.baseFormation === 'larchwood') return REGIONAL_FOREST_TYPE_BY_KEY['larch-wood'];
    return REGIONAL_FOREST_TYPE_BY_KEY['temperate-broadleaf'];
}

// O(1) selector over the frozen catalogue. No neighbour scan, no allocation
// beyond the small context object, and no random state outside the seed.
export function regionalForestTypeFor({ x = 0, y = 0, seed = 1, moisture = 0.55, temperature = 0.55,
    height = 0.45, climate = 'temperate', baseFormation = null, stockRatio = 1 } = {}) {
    if (!baseFormation) return null;
    const ctx = {
        x: Number(x) || 0, y: Number(y) || 0, seed: Number(seed) || 1,
        moisture: clamp01(moisture), temperature: clamp01(temperature), height: clamp01(height),
        climate: String(climate || 'temperate'), baseFormation, stockRatio: clamp01(stockRatio),
    };
    let best = null, bestScore = -Infinity;
    for (const type of REGIONAL_FOREST_TYPES) {
        if (!matchesSite(type, ctx)) continue;
        // The priority encodes the hard ecological ordering (mangrove before
        // rainforest, bog before taiga, gallery before acacia). The patch term
        // only breaks ties inside the same priority band, and a 7x7 cell makes
        // the result read as a region rather than per-tile noise.
        const patch = coarseUnit(ctx.seed, ctx.x, ctx.y, 7, type.key.length * 37 + type.id.charCodeAt(type.id.length - 1));
        const score = (Number(type.priority) || 0) * 100 + patch;
        if (score > bestScore) { best = type; bestScore = score; }
    }
    return best || fallbackType(ctx);
}

export const REGIONAL_FORESTS_TEST_SITES = Object.freeze(REGIONAL_FOREST_TYPES.map(type => Object.freeze({
    id: type.id,
    key: type.key,
    ...type.probe,
})));

export const REGIONAL_FOREST_FALLBACKS = Object.freeze({
    temperate: '1.2.23.1.005', taiga: '1.2.23.1.001', snow: '1.2.23.1.001',
    mountain: '1.2.23.1.014', swamp: '1.2.23.1.009', savanna: '1.2.23.1.019',
    coastal: '1.2.23.1.003', tundra: '1.2.23.1.015', tropical: '1.2.23.1.028',
});
