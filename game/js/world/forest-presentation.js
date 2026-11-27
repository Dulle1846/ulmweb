// 1.2.23.1.241–270 — Presentation, audio, UI and accessibility for the
// regional forests.
//
// This module is data plus pure selectors. It does not run a second forest
// simulation and it writes no save state: every value is derived from the
// frozen regional forest catalogue, the climate and a deterministic hash of
// the type id. The renderer, the Forest Atlas, the procedural ambience and the
// accessibility settings all read the same profile, so a spruce wood looks,
// sounds and reads as one thing.
import { REGIONAL_FOREST_TYPES } from './regional-forests.js';
import { CLIMATE_SEASONS, DAYS_PER_SEASON, wrapDay } from './season.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function unit(id, salt) {
    return ((hashString(id + ':' + salt) >>> 0) % 100000) / 100000;
}

const SPECIES_LABELS = Object.freeze({
    spruce: 'Spruce', pine: 'Pine', larch: 'Larch', fir: 'Fir', birch: 'Birch',
    rowan: 'Rowan', aspen: 'Aspen', willow: 'Willow', alder: 'Alder', oak: 'Oak',
    beech: 'Beech', hornbeam: 'Hornbeam', ash: 'Ash', elm: 'Elm', maple: 'Maple',
    lime: 'Lime', linden: 'Linden', chestnut: 'Chestnut', hazel: 'Hazel',
    poplar: 'Poplar', tamarisk: 'Tamarisk', eucalyptus: 'Eucalyptus',
    'cork-oak': 'Cork oak', 'holm-oak': 'Holm oak', 'aleppo-pine': 'Aleppo pine',
    miombo: 'Miombo', teak: 'Teak', sal: 'Sal', dipterocarp: 'Dipterocarp',
    mangrove: 'Mangrove', laurel: 'Laurel', nothofagus: 'Southern beech',
    podocarpus: 'Podocarp', treefern: 'Tree fern', redwood: 'Redwood',
    sitka: 'Sitka spruce', hemlock: 'Hemlock', juniper: 'Juniper', yew: 'Yew',
    palm: 'Palm', bamboo: 'Bamboo', acacia: 'Acacia', baobab: 'Baobab',
    olive: 'Olive', cedar: 'Cedar', cypress: 'Cypress', 'date-palm': 'Date palm',
});

// Every regional silhouette in the catalogue maps to one presentation family.
// The family controls the crown geometry, the ground weave, the fog behaviour
// and the procedural bed; the per-type hash adds the regional variation.
const FAMILY_BY_SILHOUETTE = Object.freeze({
    spire: 'conifer',
    'fog-column': 'conifer',
    'north-slope': 'conifer',
    'dune-pine': 'conifer',
    'ash-cone': 'conifer',
    emergent: 'emergent',
    'emergent-giant': 'emergent',
    'cloud-layered': 'emergent',
    'large-leaf': 'emergent',
    'sediment-fan': 'emergent',
    'ash-elm': 'emergent',
    'wind-sheared': 'coastal',
    'salt-flat': 'coastal',
    'gravel-bar': 'riparian',
    'rain-shadow': 'dry',
    'parkland': 'dry',
    island: 'dry',
    'oasis-fan': 'dry',
    gnarled: 'broadleaf',
    dome: 'broadleaf',
    'loess-dome': 'broadleaf',
    'clay-oak': 'broadleaf',
    layered: 'broadleaf',
    airy: 'airy',
    'poplar-column': 'columnar',
    column: 'columnar',
    umbrella: 'umbrella',
    baobab: 'baobab',
    thorn: 'thorn',
    corridor: 'riparian',
    stilt: 'mangrove',
    'delta-stilt': 'mangrove',
    'lagoon-stilt': 'mangrove',
    blackwater: 'mangrove',
    bamboo: 'bamboo',
    krummholz: 'scrub',
    'stunted-bog': 'scrub',
    'bog-birch': 'scrub',
    'hazel-scrub': 'scrub',
    'alder-carr': 'riparian',
    'willow-grove': 'willow',
    serpentine: 'heath',
    karst: 'heath',
});

const FAMILY_PROFILE = Object.freeze({
    conifer: {
        icon: '▲', pattern: 'chevron', patternLabel: 'Chevron',
        crownAspect: 0.66, asymmetry: 0.06, tiers: 5, parallax: 0.042,
        leaves: ['#3f4f38', '#3d5a3c'], autumn: ['#5a4b30', '#7c633a'],
        ground: 'needle', fog: 'ground', windStiffness: 1.32, gust: 0.62,
        deadwood: 0.34, rootPlate: 0.3, understory: [0.24, 0.14, 0.14],
        bloom: 0.04, fruit: 0.32, snow: 1.18, bed: 'needle-wind',
        light: '#d9e3cf', shaft: 0.42, silence: 0.22,
    },
    emergent: {
        icon: '✦', pattern: 'diamond', patternLabel: 'Diamond',
        crownAspect: 0.82, asymmetry: 0.16, tiers: 3, parallax: 0.068,
        leaves: ['#2c5634', '#3f6c40'], autumn: ['#4c482d', '#6d6236'],
        ground: 'litter', fog: 'canopy', windStiffness: 0.86, gust: 0.54,
        deadwood: 0.42, rootPlate: 0.42, understory: [0.36, 0.18, 0.28],
        bloom: 0.22, fruit: 0.42, snow: 0.72, bed: 'emergent-hum',
        light: '#d8dfb7', shaft: 0.52, silence: 0.3,
    },
    broadleaf: {
        icon: '●', pattern: 'dots', patternLabel: 'Dots',
        crownAspect: 0.9, asymmetry: 0.12, tiers: 2, parallax: 0.055,
        leaves: ['#3d6136', '#557c42'], autumn: ['#8a5c2f', '#b47c3d'],
        ground: 'leaf', fog: 'valley', windStiffness: 0.92, gust: 0.72,
        deadwood: 0.36, rootPlate: 0.38, understory: [0.34, 0.2, 0.26],
        bloom: 0.26, fruit: 0.4, snow: 0.94, bed: 'broadleaf-rustle',
        light: '#e4d9a8', shaft: 0.56, silence: 0.26,
    },
    airy: {
        icon: '◇', pattern: 'rays', patternLabel: 'Rays',
        crownAspect: 0.76, asymmetry: 0.2, tiers: 2, parallax: 0.06,
        leaves: ['#4e7040', '#6f8d50'], autumn: ['#8d7436', '#b2954a'],
        ground: 'litter', fog: 'haze', windStiffness: 0.7, gust: 0.86,
        deadwood: 0.28, rootPlate: 0.28, understory: [0.3, 0.3, 0.2],
        bloom: 0.24, fruit: 0.3, snow: 0.78, bed: 'dry-leaves',
        light: '#efe2ad', shaft: 0.66, silence: 0.12,
    },
    coastal: {
        icon: '≈', pattern: 'waves', patternLabel: 'Waves',
        crownAspect: 0.68, asymmetry: 0.26, tiers: 3, parallax: 0.048,
        leaves: ['#3b5a46', '#52735a'], autumn: ['#59604a', '#78806a'],
        ground: 'moss', fog: 'coastal', windStiffness: 1.14, gust: 0.94,
        deadwood: 0.32, rootPlate: 0.44, understory: [0.22, 0.16, 0.18],
        bloom: 0.12, fruit: 0.22, snow: 0.62, bed: 'coastal-fog',
        light: '#c9d8cf', shaft: 0.3, silence: 0.34,
    },
    riparian: {
        icon: '≋', pattern: 'waves', patternLabel: 'Waves',
        crownAspect: 0.78, asymmetry: 0.18, tiers: 2, parallax: 0.058,
        leaves: ['#456b3a', '#648646'], autumn: ['#9a7a32', '#bd9c48'],
        ground: 'marsh', fog: 'river', windStiffness: 0.74, gust: 0.8,
        deadwood: 0.44, rootPlate: 0.5, understory: [0.3, 0.3, 0.24],
        bloom: 0.3, fruit: 0.34, snow: 0.82, bed: 'river-reed',
        light: '#dfe6bd', shaft: 0.44, silence: 0.2,
    },
    dry: {
        icon: '◆', pattern: 'cross', patternLabel: 'Cross',
        crownAspect: 0.7, asymmetry: 0.24, tiers: 2, parallax: 0.062,
        leaves: ['#64703f', '#85854e'], autumn: ['#9b7e42', '#bda25c'],
        ground: 'sand', fog: 'dust', windStiffness: 0.64, gust: 0.9,
        deadwood: 0.26, rootPlate: 0.2, understory: [0.16, 0.46, 0.2],
        bloom: 0.18, fruit: 0.36, snow: 0.16, bed: 'dry-grass',
        light: '#f2dfaa', shaft: 0.7, silence: 0.1,
    },
    columnar: {
        icon: '▮', pattern: 'bars', patternLabel: 'Bars',
        crownAspect: 1.24, asymmetry: 0.1, tiers: 2, parallax: 0.05,
        leaves: ['#446b37', '#628344'], autumn: ['#8f7332', '#b49143'],
        ground: 'leaf', fog: 'river', windStiffness: 1.22, gust: 0.6,
        deadwood: 0.3, rootPlate: 0.24, understory: [0.34, 0.24, 0.18],
        bloom: 0.2, fruit: 0.28, snow: 0.88, bed: 'broadleaf-rustle',
        light: '#e7ddb0', shaft: 0.48, silence: 0.16,
    },
    umbrella: {
        icon: '☂', pattern: 'rings', patternLabel: 'Rings',
        crownAspect: 0.56, asymmetry: 0.18, tiers: 2, parallax: 0.066,
        leaves: ['#5d6b3c', '#7e854a'], autumn: ['#8c7038', '#ab8d4e'],
        ground: 'sand', fog: 'dust', windStiffness: 0.62, gust: 0.82,
        deadwood: 0.3, rootPlate: 0.22, understory: [0.14, 0.48, 0.18],
        bloom: 0.16, fruit: 0.4, snow: 0.12, bed: 'savanna-hum',
        light: '#f4df9f', shaft: 0.74, silence: 0.1,
    },
    baobab: {
        icon: '⌂', pattern: 'rings', patternLabel: 'Rings',
        crownAspect: 0.64, asymmetry: 0.22, tiers: 2, parallax: 0.06,
        leaves: ['#5d6a3c', '#7d854b'], autumn: ['#8c7039', '#aa8b4b'],
        ground: 'sand', fog: 'dust', windStiffness: 1.42, gust: 0.42,
        deadwood: 0.38, rootPlate: 0.18, understory: [0.12, 0.5, 0.14],
        bloom: 0.14, fruit: 0.46, snow: 0.08, bed: 'savanna-hum',
        light: '#f2dc9a', shaft: 0.8, silence: 0.14,
    },
    thorn: {
        icon: '✶', pattern: 'cross', patternLabel: 'Cross',
        crownAspect: 0.6, asymmetry: 0.3, tiers: 2, parallax: 0.07,
        leaves: ['#6f7444', '#8b8b52'], autumn: ['#987b45', '#b39758'],
        ground: 'sand', fog: 'dust', windStiffness: 1.2, gust: 0.52,
        deadwood: 0.3, rootPlate: 0.18, understory: [0.12, 0.54, 0.16],
        bloom: 0.12, fruit: 0.42, snow: 0.06, bed: 'dry-grass',
        light: '#f4dfa2', shaft: 0.76, silence: 0.08,
    },
    mangrove: {
        icon: '≋', pattern: 'waves', patternLabel: 'Waves',
        crownAspect: 0.72, asymmetry: 0.16, tiers: 2, parallax: 0.064,
        leaves: ['#2f5d3d', '#47774d'], autumn: ['#3b5736', '#526d43'],
        ground: 'mud', fog: 'coastal', windStiffness: 1.06, gust: 0.66,
        deadwood: 0.5, rootPlate: 0.6, understory: [0.16, 0.22, 0.16],
        bloom: 0.14, fruit: 0.28, snow: 0.02, bed: 'mangrove-water',
        light: '#c8dbc0', shaft: 0.26, silence: 0.28,
    },
    bamboo: {
        icon: '≀', pattern: 'bars', patternLabel: 'Bars',
        crownAspect: 0.94, asymmetry: 0.12, tiers: 2, parallax: 0.056,
        leaves: ['#4f7a3e', '#6d9450'], autumn: ['#5f7138', '#7d8c4a'],
        ground: 'litter', fog: 'canopy', windStiffness: 0.58, gust: 0.98,
        deadwood: 0.4, rootPlate: 0.2, understory: [0.22, 0.3, 0.26],
        bloom: 0.2, fruit: 0.18, snow: 0.08, bed: 'bamboo-clatter',
        light: '#e4e6b4', shaft: 0.5, silence: 0.16,
    },
    scrub: {
        icon: '∴', pattern: 'dots', patternLabel: 'Dots',
        crownAspect: 0.66, asymmetry: 0.24, tiers: 2, parallax: 0.052,
        leaves: ['#566842', '#728253'], autumn: ['#7c6939', '#97824a'],
        ground: 'moss', fog: 'ground', windStiffness: 1.1, gust: 0.7,
        deadwood: 0.36, rootPlate: 0.4, understory: [0.32, 0.28, 0.36],
        bloom: 0.2, fruit: 0.3, snow: 1.02, bed: 'bog-wind',
        light: '#d9e0c1', shaft: 0.34, silence: 0.28,
    },
    willow: {
        icon: '❧', pattern: 'waves', patternLabel: 'Waves',
        crownAspect: 0.86, asymmetry: 0.2, tiers: 2, parallax: 0.054,
        leaves: ['#4a7040', '#6b8d4e'], autumn: ['#9a7b34', '#bb9c4b'],
        ground: 'marsh', fog: 'river', windStiffness: 0.62, gust: 0.9,
        deadwood: 0.42, rootPlate: 0.48, understory: [0.3, 0.32, 0.26],
        bloom: 0.26, fruit: 0.24, snow: 0.78, bed: 'river-reed',
        light: '#e2e4b6', shaft: 0.46, silence: 0.22,
    },
    heath: {
        icon: '⌁', pattern: 'chevron', patternLabel: 'Chevron',
        crownAspect: 0.72, asymmetry: 0.22, tiers: 2, parallax: 0.05,
        leaves: ['#5b654d', '#75805f'], autumn: ['#7a6a43', '#948057'],
        ground: 'moss', fog: 'haze', windStiffness: 1.02, gust: 0.74,
        deadwood: 0.34, rootPlate: 0.32, understory: [0.26, 0.34, 0.3],
        bloom: 0.22, fruit: 0.26, snow: 0.86, bed: 'heath-wind',
        light: '#ddd9ba', shaft: 0.4, silence: 0.24,
    },
});

const CLIMATE_PRESENTATION = Object.freeze({
    temperate: { fog: null, visibility: 0.82, snow: 1, ground: null, hue: '#e8dcb0', wind: 1, bed: null },
    northern: { fog: 'ground', visibility: 0.7, snow: 1.22, ground: 'needle', hue: '#dce4d6', wind: 1.12, bed: null },
    taiga: { fog: 'ground', visibility: 0.62, snow: 1.3, ground: 'needle', hue: '#d6e1d8', wind: 1.05, bed: null },
    tundra: { fog: 'haze', visibility: 0.66, snow: 1.3, ground: 'moss', hue: '#dfe6e2', wind: 1.28, bed: null },
    snow: { fog: 'haze', visibility: 0.58, snow: 1.55, ground: 'moss', hue: '#dbe7ef', wind: 1.2, bed: null },
    mediterranean: { fog: 'haze', visibility: 0.9, snow: 0.5, ground: 'dry', hue: '#f0dfaa', wind: 0.92, bed: null },
    arid: { fog: 'dust', visibility: 0.74, snow: 0.25, ground: 'sand', hue: '#f2dc9f', wind: 1.1, bed: null },
    savanna: { fog: 'dust', visibility: 0.8, snow: 0.08, ground: 'sand', hue: '#f1dd9d', wind: 1.02, bed: null },
    coastal: { fog: 'coastal', visibility: 0.62, snow: 0.8, ground: 'moss', hue: '#cbdad2', wind: 1.24, bed: null },
    mountain: { fog: 'valley', visibility: 0.7, snow: 1.16, ground: null, hue: '#d8e0d3', wind: 1.16, bed: null },
    swamp: { fog: 'ground', visibility: 0.6, snow: 0.82, ground: 'marsh', hue: '#cfdcc8', wind: 0.72, bed: null },
    tropical: { fog: 'canopy', visibility: 0.66, snow: 0, ground: 'litter', hue: '#d8e3ad', wind: 0.82, bed: null },
    enchanted: { fog: 'mist', visibility: 0.58, snow: 0.9, ground: null, hue: '#d6dcc6', wind: 0.88, bed: null },
    volcanic: { fog: 'ash', visibility: 0.66, snow: 0.4, ground: 'ash', hue: '#d9d0bd', wind: 1.06, bed: null },
});

// ── Seasonal and acoustic identity ─────────────────────────────────
// The phenology is data, not a second calendar: it reuses the climate curves
// in season.js and only adds the regional shift the renderer already applies.
// Every date is a day of the 400-day realm year, so the atlas can print it and
// a player can compare two woods without opening a simulation panel.
const SEASON_IDS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

const FAMILY_SEASON_NOTES = Object.freeze({
    conifer: Object.freeze({
        spring: 'New needles push from the leader while meltwater runs through the {species} litter.',
        summer: 'The tiers close into a dark, resinous roof and the floor stays cool all day.',
        autumn: 'Older needles yellow inside the stand; the crown keeps its spire.',
        winter: 'Snow loads the tiers and bends the lowest branches toward the ground.',
    }),
    emergent: Object.freeze({
        spring: 'A pale flush breaks through the {species} roof and the understorey answers at once.',
        summer: 'The high crown closes over the wood and only scattered shafts reach the floor.',
        autumn: 'The upper storey turns late while the understorey colours beneath it.',
        winter: 'The emergent crowns stay green above a floor of wet, heavy litter.',
    }),
    broadleaf: Object.freeze({
        spring: 'Budburst opens the {species} canopy and the floor warms before the leaves harden.',
        summer: 'A broad, layered roof filters the light into moving patches.',
        autumn: 'The crown turns from the outside in, tree by tree across the stand.',
        winter: 'Bare branches and marcescent leaves hold the shape of the wood.',
    }),
    airy: Object.freeze({
        spring: 'Light spring leaf breaks on open {species} branches and the floor greens early.',
        summer: 'The crown stays porous, so sun and wind reach the understorey.',
        autumn: 'Dry leaves colour quickly and rattle before they fall.',
        winter: 'A thin, open crown lets the low winter light through to the ground.',
    }),
    coastal: Object.freeze({
        spring: 'Salt wind prunes the {species} buds and the new leaves come in wind-shaped.',
        summer: 'The crown is clipped by the sea wind and never closes into a still roof.',
        autumn: 'Colours stay muted; salt and spray dull the turn.',
        winter: 'Cold fog and wind keep the wood moving even when the sap is down.',
    }),
    riparian: Object.freeze({
        spring: 'The {species} roots are in moving water and the first leaves follow the flood.',
        summer: 'Reeds and branches share the light above a wet, cool floor.',
        autumn: 'Yellow leaves drop into the current and collect along the bank.',
        winter: 'Bare stems stand in mist and the water keeps the wood audible.',
    }),
    dry: Object.freeze({
        spring: 'A short, bright flush covers the {species} twigs after the first rain.',
        summer: 'The canopy thins to save water and the floor cracks in the heat.',
        autumn: 'Warm days hold the colour late and the leaves fall dry.',
        winter: 'The wood stands open; bark, dust and thorn carry the silhouette.',
    }),
    columnar: Object.freeze({
        spring: 'Narrow {species} buds open close to the stem and the column greens from the base.',
        summer: 'The vertical crown casts a thin, striped shadow across the floor.',
        autumn: 'The column turns evenly and drops its leaves in a short window.',
        winter: 'Bare upright stems read as a fence of dark lines against the snow.',
    }),
    umbrella: Object.freeze({
        spring: 'Flat {species} buds open on the outer edge of the umbrella crown.',
        summer: 'The crown holds a level roof and the ground beneath stays open and hot.',
        autumn: 'Pods and small leaves colour together on the flat top.',
        winter: 'The umbrella stays legible as a crown of bare, level branches.',
    }),
    baobab: Object.freeze({
        spring: 'The {species} flushes late, after the first heavy rain.',
        summer: 'A sparse crown sits above a massive trunk and a dry, open floor.',
        autumn: 'Leaves and fruit colour together on the short branches.',
        winter: 'The bare trunk and stubby crown dominate a silent, dry wood.',
    }),
    thorn: Object.freeze({
        spring: 'Tiny {species} leaves and thorns appear together after the rain.',
        summer: 'The crown stays low and open, and the ground is bright between the stems.',
        autumn: 'Small leaves turn and drop quickly; thorns remain.',
        winter: 'The wood is a lattice of thorn and bare twig with no closed roof.',
    }),
    mangrove: Object.freeze({
        spring: 'New {species} leaves open above the breathing roots and the tide moves through.',
        summer: 'The low crown closes over black mud and the water stays warm beneath it.',
        autumn: 'The wood stays largely green; only the oldest leaves colour.',
        winter: 'Stilt roots and evergreen crowns stand in cold, quiet water.',
    }),
    bamboo: Object.freeze({
        spring: 'New {species} shoots rise through the litter and the grove thickens fast.',
        summer: 'The hollow stems knock together above a bright, shallow understorey.',
        autumn: 'The grove keeps its green while dry leaves gather below.',
        winter: 'Bare stems and dry leaf litter make the grove sound hollow in the wind.',
    }),
    scrub: Object.freeze({
        spring: 'Low {species} buds break close to the ground and the scrub greens early.',
        summer: 'The low wood stays open and the ground carries most of the colour.',
        autumn: 'Small leaves and berries colour together across the scrub.',
        winter: 'Twig, moss and snow carry the wood when the low canopy is bare.',
    }),
    willow: Object.freeze({
        spring: 'Pale {species} leaves open on flexible shoots above the wet ground.',
        summer: 'The crown hangs and moves even in a light breeze over the water.',
        autumn: 'Long yellow leaves drop steadily into the marsh.',
        winter: 'Bare, supple shoots stay coloured and readable against the grey.',
    }),
    heath: Object.freeze({
        spring: 'Low {species} growth and heather tips colour the open ground first.',
        summer: 'The wood stays wind-combed, with a low crown and a wide sky.',
        autumn: 'Heather, bracken and small leaves turn together across the heath.',
        winter: 'Bare stems and evergreen heath hold the shape under a thin snow load.',
    }),
});

const CLIMATE_FIELD_MARK = Object.freeze({
    temperate: 'oak and beech leaf litter under a four-season canopy',
    northern: 'a long snow pack and a late, sudden spring',
    taiga: 'deep needle litter and a short, intense growing season',
    tundra: 'stunted growth, exposed rock and a very short summer',
    snow: 'permanent cold, low crowns and a buried floor',
    mediterranean: 'dry summer scent, cork bark and a spring flush',
    arid: 'dust, thorn and a canopy that opens to the sun',
    savanna: 'fire-shaped grass, flat crowns and a dry-season drop',
    coastal: 'salt-pruned crowns and fog that hides the far stems',
    mountain: 'steep ground, wind-shaped crowns and a late snow line',
    swamp: 'standing water, buttressed roots and a green, humid floor',
    tropical: 'a closed multi-storey roof and constant leaf fall',
    enchanted: 'still air, pale light and a wood that holds its mist',
    volcanic: 'ash on the leaves and pioneer growth on old flows',
});

const FAMILY_FIELD_MARKS = Object.freeze({
    conifer: Object.freeze(['straight {species} spires', 'needle carpet and resin seams', 'snow-bent lower tiers']),
    emergent: Object.freeze(['emergent {species} crowns', 'buttress roots and lianas', 'a dark, layered understorey']),
    broadleaf: Object.freeze(['a rounded {species} dome', 'leaf litter and mast cups', 'epiphytes on old bark']),
    airy: Object.freeze(['an open, porous crown', 'dry leaf drift and sun flecks', 'low scrub between the stems']),
    coastal: Object.freeze(['wind-sheared {species} crowns', 'salt-burnt leaf edges', 'moss and fog on the windward side']),
    riparian: Object.freeze(['{species} roots in moving water', 'sedge and reed banks', 'flood-cut soil and gravel bars']),
    dry: Object.freeze(['a low, water-saving crown', 'cracked ground and dry grass', 'thorn and dust in the understorey']),
    columnar: Object.freeze(['upright {species} columns', 'narrow shadows on the floor', 'a thin, even leaf fall']),
    umbrella: Object.freeze(['a flat, level crown', 'open ground beneath the canopy', 'pods and fine leaf litter']),
    baobab: Object.freeze(['a massive {species} trunk', 'a short, stubby crown', 'dry, bare ground between the stems']),
    thorn: Object.freeze(['a low thorn lattice', 'bright ground between the stems', 'small leaves and hard seed']),
    mangrove: Object.freeze(['stilt and breathing roots', 'black tidal mud', 'salt crust and evergreen crowns']),
    bamboo: Object.freeze(['hollow {species} stems', 'dry leaf litter below', 'a bright, shallow understorey']),
    scrub: Object.freeze(['low, wind-combed growth', 'moss and lichen on the ground', 'berry and twig in the low layer']),
    willow: Object.freeze(['hanging {species} shoots', 'wet marsh soil', 'long leaves along the waterline']),
    heath: Object.freeze(['open, wind-combed crowns', 'heather and bracken below', 'thin soil over rock']),
});

const FAMILY_WINTER_TINT = Object.freeze({
    conifer: '#3a4a3a', emergent: '#3f4f3a', broadleaf: '#6b5540', airy: '#7a6b4a',
    coastal: '#4e5c50', riparian: '#6a5d42', dry: '#8a7a55', columnar: '#6b5a42',
    umbrella: '#7d6d4e', baobab: '#6f6048', thorn: '#7b7050', mangrove: '#3f5746',
    bamboo: '#6f7a48', scrub: '#5f5c48', willow: '#6b5d48', heath: '#6f6650',
});

// Wooden modes. The ambience engine reads the same degrees, so a spruce wood
// and an oak wood do not improvise in the same scale even when they share a
// root note.
const FAMILY_SCALE = Object.freeze({
    conifer: Object.freeze({ mode: 'Dorian', degrees: Object.freeze([0, 2, 3, 5, 7, 9, 10]), tempo: 54 }),
    emergent: Object.freeze({ mode: 'Pentatonic', degrees: Object.freeze([0, 2, 4, 7, 9]), tempo: 62 }),
    broadleaf: Object.freeze({ mode: 'Ionian', degrees: Object.freeze([0, 2, 4, 5, 7, 9, 11]), tempo: 58 }),
    airy: Object.freeze({ mode: 'Lydian', degrees: Object.freeze([0, 2, 4, 6, 7, 9, 11]), tempo: 66 }),
    coastal: Object.freeze({ mode: 'Aeolian', degrees: Object.freeze([0, 2, 3, 5, 7, 8, 10]), tempo: 50 }),
    riparian: Object.freeze({ mode: 'Mixolydian', degrees: Object.freeze([0, 2, 4, 5, 7, 9, 10]), tempo: 60 }),
    dry: Object.freeze({ mode: 'Phrygian', degrees: Object.freeze([0, 1, 3, 5, 7, 8, 10]), tempo: 68 }),
    columnar: Object.freeze({ mode: 'Ionian', degrees: Object.freeze([0, 2, 4, 5, 7, 9, 11]), tempo: 56 }),
    umbrella: Object.freeze({ mode: 'Pentatonic', degrees: Object.freeze([0, 2, 4, 7, 9]), tempo: 64 }),
    baobab: Object.freeze({ mode: 'Pentatonic', degrees: Object.freeze([0, 3, 5, 7, 10]), tempo: 48 }),
    thorn: Object.freeze({ mode: 'Phrygian', degrees: Object.freeze([0, 1, 3, 5, 7, 8, 10]), tempo: 70 }),
    mangrove: Object.freeze({ mode: 'Aeolian', degrees: Object.freeze([0, 2, 3, 5, 7, 8, 10]), tempo: 52 }),
    bamboo: Object.freeze({ mode: 'Pentatonic', degrees: Object.freeze([0, 2, 5, 7, 9]), tempo: 72 }),
    scrub: Object.freeze({ mode: 'Dorian', degrees: Object.freeze([0, 2, 3, 5, 7, 9, 10]), tempo: 52 }),
    willow: Object.freeze({ mode: 'Mixolydian', degrees: Object.freeze([0, 2, 4, 5, 7, 9, 10]), tempo: 50 }),
    heath: Object.freeze({ mode: 'Dorian', degrees: Object.freeze([0, 2, 3, 5, 7, 9, 10]), tempo: 56 }),
});

function phenologyFor(type, climateKey, leaves, snow, oldGrowth) {
    const climate = CLIMATE_SEASONS[climateKey] || CLIMATE_SEASONS.temperate;
    const shift = name => Math.round((unit(type.id, name) - 0.5) * 14);
    const leafOut = wrapDay(24 + (climate.greenShift || 0) + leaves.springShift + shift('leafout'));
    const blossom = wrapDay(leafOut + 18 + Math.round(unit(type.id, 'blossomday') * 28));
    const canopy = wrapDay(leafOut + 36 + Math.round(unit(type.id, 'canopyday') * 24));
    const fruit = wrapDay(142 + Math.round(unit(type.id, 'fruitday') * 74) + Math.round(oldGrowth * 12));
    const turn = wrapDay(205 + (climate.foliageShift || 0) + leaves.turnShift + shift('turnday'));
    const leafFall = wrapDay(turn + 22 + Math.round(unit(type.id, 'fall') * 26) + Math.round(snow.bareShare * 12));
    const deepWinter = wrapDay(330 + Math.round(unit(type.id, 'winterday') * 28));
    const snowHold = (climate.snowScale || 0) > 0.05
        ? wrapDay((climate.snowStart || 0) + 8 + Math.round(unit(type.id, 'snowday') * 18))
        : null;
    return Object.freeze({ leafOut, blossom, canopy, fruit, turn, leafFall, deepWinter, snowHold });
}

function seasonsFor(type, familyId, climateKey, leaves, snow, bloom, ground, phenology) {
    const notes = FAMILY_SEASON_NOTES[familyId] || FAMILY_SEASON_NOTES.broadleaf;
    const species = speciesLabel(dominantSpecies(type)).toLowerCase();
    const winter = FAMILY_WINTER_TINT[familyId] || FAMILY_WINTER_TINT.broadleaf;
    const climateMark = CLIMATE_FIELD_MARK[climateKey] || CLIMATE_FIELD_MARK.temperate;
    const keyDays = [
        phenology.leafOut,
        phenology.canopy,
        phenology.turn,
        phenology.deepWinter,
    ];
    const leaf = [leaves.spring, leaves.summer, leaves.autumn, winter];
    const accent = [leaves.summerLight, leaves.summer, leaves.autumnLight, '#d9e0d4'];
    return Object.freeze(SEASON_IDS.map((id, index) => Object.freeze({
        id,
        label: id[0].toUpperCase() + id.slice(1),
        startDay: index * DAYS_PER_SEASON,
        endDay: index * DAYS_PER_SEASON + DAYS_PER_SEASON - 1,
        keyDay: keyDays[index],
        leaf: leaf[index],
        accent: accent[index],
        ground: ground.label,
        blossom: id === 'spring' ? bloom.blossom : 0,
        fruit: id === 'autumn' ? bloom.fruit : id === 'summer' ? bloom.fruit * 0.55 : 0,
        snow: id === 'winter' ? clamp01(snow.retention / 1.8) : id === 'autumn' ? clamp01(snow.retention / 4) : 0,
        bare: id === 'winter' ? snow.bareShare : id === 'autumn' ? snow.bareShare * 0.35 : 0,
        note: String(notes[id] || '').replace(/\{species\}/g, species)
            + (id === 'summer' ? ' ' + climateMark + '.' : ''),
    })));
}

function canopyLayersFor(familyId, leaves, parallax) {
    return Object.freeze([
        Object.freeze({ id: 'floor', label: 'Understorey', parallax: Number((parallax * 0.34).toFixed(3)), opacity: 0.42, tint: leaves.spring }),
        Object.freeze({ id: 'trunk', label: 'Trunk layer', parallax: Number((parallax * 0.68).toFixed(3)), opacity: 0.66, tint: leaves.summerLight }),
        Object.freeze({ id: 'roof', label: 'Crown roof', parallax: Number(parallax.toFixed(3)), opacity: 0.92, tint: leaves.summer }),
    ]);
}

function fieldMarksFor(type, familyId, climateKey) {
    const family = FAMILY_FIELD_MARKS[familyId] || FAMILY_FIELD_MARKS.broadleaf;
    const species = speciesLabel(dominantSpecies(type)).toLowerCase();
    const climate = CLIMATE_FIELD_MARK[climateKey] || CLIMATE_FIELD_MARK.temperate;
    return Object.freeze([
        String(family[0] || '').replace(/\{species\}/g, species),
        family[1] || '',
        climate,
    ].filter(Boolean));
}

const GROUND_TEXTURES = Object.freeze({
    needle: Object.freeze({ id: 'needle', label: 'Needle carpet', detail: 'rust-brown needle fall, resin flecks, deep moss hollows' }),
    leaf: Object.freeze({ id: 'leaf', label: 'Broadleaf litter', detail: 'layered species leaves, mast cups, exposed humus' }),
    litter: Object.freeze({ id: 'litter', label: 'Deep litter', detail: 'thick tropical leaf litter, fungal threads, damp heartwood' }),
    moss: Object.freeze({ id: 'moss', label: 'Moss cushion', detail: 'sphagnum and feather moss, lichen crust, fern rhizomes' }),
    mud: Object.freeze({ id: 'mud', label: 'Tidal mud', detail: 'black anoxic mud, breathing roots, crusted salt' }),
    marsh: Object.freeze({ id: 'marsh', label: 'Marsh soil', detail: 'sedge peat, standing water, iron-stained silt' }),
    sand: Object.freeze({ id: 'sand', label: 'Dry sand', detail: 'wind-rippled grains, sun-cracked earth, sparse grass' }),
    ash: Object.freeze({ id: 'ash', label: 'Volcanic ash', detail: 'grey tephra, pumice grit, charred root casts' }),
});

export const FOREST_FOG_TYPES = Object.freeze({
    coastal: Object.freeze({ id: 'coastal', label: 'Coastal veil', detail: 'Salt fog rolls in horizontally and clings to the crowns.', color: '#d7e3e0', rise: 0.42, spread: 1.24 }),
    valley: Object.freeze({ id: 'valley', label: 'Valley mist', detail: 'Cold air pools low between the trunks until mid-morning.', color: '#dde6dc', rise: 0.18, spread: 1.1 }),
    ground: Object.freeze({ id: 'ground', label: 'Ground fog', detail: 'A thin layer over the needle bed, broken by roots and stones.', color: '#d9e2d8', rise: 0.1, spread: 1.18 }),
    river: Object.freeze({ id: 'river', label: 'River steam', detail: 'Water vapour drifts with the current and wets the near bank.', color: '#d7e4df', rise: 0.16, spread: 1.2 }),
    canopy: Object.freeze({ id: 'canopy', label: 'Canopy breath', detail: 'Humid air hangs under the closed roof and never reaches the floor.', color: '#cfe0cf', rise: 0.62, spread: 1.3 }),
    haze: Object.freeze({ id: 'haze', label: 'Dry haze', detail: 'Dust and pollen soften the far stems without hiding the near wood.', color: '#ebe0c4', rise: 0.5, spread: 1.36 }),
    dust: Object.freeze({ id: 'dust', label: 'Dust veil', detail: 'Wind-borne grit reddens the low sun and shortens sight.', color: '#e7d3a6', rise: 0.55, spread: 1.4 }),
    mist: Object.freeze({ id: 'mist', label: 'Wood mist', detail: 'A still, uncanny mist that holds its shape between the trees.', color: '#d8ddd2', rise: 0.34, spread: 1.22 }),
    ash: Object.freeze({ id: 'ash', label: 'Ash fall', detail: 'Fine tephra drifts like grey snow and dulls every leaf.', color: '#cec9bd', rise: 0.48, spread: 1.26 }),
});

function dominantSpecies(type) {
    return Object.entries(type.species || {})
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'oak';
}

function speciesLabel(id) {
    return SPECIES_LABELS[id] || String(id || 'oak').replace(/-/g, ' ').replace(/^./, character => character.toUpperCase());
}

const BIRD_IDS = new Set(['crossbill', 'capercaillie', 'owl', 'woodpecker', 'raptor', 'toucan', 'macaw', 'harpy-eagle', 'jay', 'nightingale', 'crane', 'heron', 'kingfisher', 'hornbill', 'lyrebird']);
const WATER_IDS = new Set(['fish', 'beaver', 'otter', 'crab', 'frog', 'toad', 'heron', 'kingfisher', 'mangrove-crab']);

function faunaFor(type) {
    const list = Array.isArray(type.fauna) ? type.fauna : [];
    const birds = list.filter(id => BIRD_IDS.has(id));
    const water = list.filter(id => WATER_IDS.has(id));
    const mammals = list.filter(id => !BIRD_IDS.has(id) && !WATER_IDS.has(id));
    return {
        bird: birds[0] || (type.climates?.includes('tropical') ? 'hornbill' : 'woodpecker'),
        birds: [...new Set([...birds, type.climates?.includes('tropical') ? 'toucan' : 'owl'])].slice(0, 3),
        mammal: mammals[0] || 'roe-deer',
        mammalGroup: mammals.slice(0, 4),
        insect: type.climates?.includes('tropical') ? 'butterfly' : 'bee',
        water: water[0] || null,
        richness: clamp(0.3 + (Number(type.effects?.fauna) || 1) * 0.4 + unit(type.id, 'fauna') * 0.2, 0.2, 1),
    };
}

const INSTRUMENT_FORMS = Object.freeze([
    Object.freeze({ id: 'fiddle', label: 'fiddle', timbre: 'bowed', brightness: 0.72, decay: 0.55, overtone: 0.5 }),
    Object.freeze({ id: 'flute', label: 'flute', timbre: 'hollow', brightness: 0.58, decay: 0.3, overtone: 0.36 }),
    Object.freeze({ id: 'harp', label: 'harp', timbre: 'plucked', brightness: 0.66, decay: 0.82, overtone: 0.64 }),
    Object.freeze({ id: 'drum', label: 'frame drum', timbre: 'struck', brightness: 0.2, decay: 0.42, overtone: 0.28 }),
    Object.freeze({ id: 'horn', label: 'bark horn', timbre: 'breathy', brightness: 0.44, decay: 0.6, overtone: 0.58 }),
    Object.freeze({ id: 'chime', label: 'wood chime', timbre: 'struck', brightness: 0.84, decay: 0.74, overtone: 0.7 }),
    Object.freeze({ id: 'lyre', label: 'lyre', timbre: 'plucked', brightness: 0.62, decay: 0.76, overtone: 0.6 }),
]);

function instrumentsFor(type, family) {
    const species = Object.keys(type.species || {}).sort((a, b) => (type.species[b] || 0) - (type.species[a] || 0));
    const woods = species.slice(0, 3).map(speciesLabel);
    const preferred = family === 'conifer'
        ? ['fiddle', 'flute', 'horn']
        : family === 'mangrove' || family === 'riparian'
            ? ['flute', 'drum', 'chime']
            : family === 'dry' || family === 'umbrella' || family === 'baobab' || family === 'thorn'
                ? ['drum', 'lyre', 'flute']
                : ['harp', 'flute', 'fiddle'];
    return preferred.map((id, index) => {
        const form = INSTRUMENT_FORMS.find(entry => entry.id === id) || INSTRUMENT_FORMS[0];
        const wood = woods[index % woods.length] || 'local';
        return Object.freeze({
            id: form.id,
            label: wood + ' ' + form.label,
            wood,
            timbre: form.timbre,
            brightness: form.brightness,
            decay: form.decay,
            overtone: form.overtone,
        });
    });
}

function profileFor(type) {
    const baseClimate = (type.climates || ['temperate'])[0] || 'temperate';
    const climate = CLIMATE_PRESENTATION[baseClimate] || CLIMATE_PRESENTATION.temperate;
    const silhouette = type.render?.silhouette || 'dome';
    const familyId = FAMILY_BY_SILHOUETTE[silhouette] || 'broadleaf';
    const family = FAMILY_PROFILE[familyId];
    const variation = unit(type.id, 'family');
    const dominant = dominantSpecies(type);
    const fogBase = climate.fog || family.fog;
    const fog = FOREST_FOG_TYPES[fogBase] || FOREST_FOG_TYPES.valley;
    const groundId = climate.ground || family.ground;
    const ground = GROUND_TEXTURES[groundId] || GROUND_TEXTURES.leaf;
    const effects = type.effects || {};
    const oldGrowth = clamp01((Number(type.priority) || 5) / 10) * 0.55
        + clamp01(1 - (Number(effects.regrowth) || 1) * 0.5) * 0.25
        + unit(type.id, 'old') * 0.2;
    const visibility = clamp(climate.visibility * (0.88 + unit(type.id, 'vis') * 0.24)
        * (0.82 + clamp01(Number(type.render?.mist) || 1) * 0.18), 0.34, 1);
    const density = clamp01((Number(type.render?.canopy) || 1) * 0.55 + unit(type.id, 'density') * 0.35);
    const wind = {
        stiffness: clamp(family.windStiffness * (0.9 + unit(type.id, 'stiff') * 0.22), 0.4, 1.7),
        gust: clamp(family.gust * (0.85 + unit(type.id, 'gust') * 0.3) * (climate.wind || 1), 0.3, 1.25),
        speed: 0.72 + unit(type.id, 'windSpeed') * 0.5,
    };
    const leaves = {
        summer: family.leaves[0],
        summerLight: family.leaves[1],
        autumn: family.autumn[0],
        autumnLight: family.autumn[1],
        spring: type.climates?.includes('mediterranean') ? '#6f8a45' : '#6f9b4a',
        turnShift: Math.round((unit(type.id, 'turn') - 0.5) * 16),
        springShift: Math.round((unit(type.id, 'spring') - 0.5) * 12),
    };
    const snow = {
        retention: clamp(family.snow * (climate.snow || 1) * (0.9 + unit(type.id, 'snow') * 0.2), 0, 1.8),
        bareShare: clamp01((1 - (family.snow / 1.5)) * 0.45 + unit(type.id, 'bare') * 0.3),
    };
    const scale = FAMILY_SCALE[familyId] || FAMILY_SCALE.broadleaf;
    const sound = {
        bed: family.bed,
        density: clamp01(density * 0.7 + unit(type.id, 'sound') * 0.3),
        bird: faunaFor(type).bird,
        birds: faunaFor(type).birds,
        insect: faunaFor(type).insect,
        water: faunaFor(type).water,
        silence: clamp01(family.silence + oldGrowth * 0.34),
        oldGrowth: clamp01(oldGrowth),
        mode: scale.mode,
        scale: Object.freeze({ mode: scale.mode, degrees: Object.freeze([...scale.degrees]) }),
        motif: Object.freeze([0, 1, 2].map(index => Math.floor(unit(type.id, 'motif' + index) * scale.degrees.length))),
        tempo: Math.round(scale.tempo + (unit(type.id, 'tempo') - 0.5) * 10),
    };
    const bloom = {
        blossom: clamp01(family.bloom * (0.6 + unit(type.id, 'blossom') * 0.8)),
        fruit: clamp01(family.fruit * (0.7 + unit(type.id, 'fruit') * 0.6)),
        color: type.climates?.includes('tropical') ? '#e7c7d0'
            : type.climates?.includes('mediterranean') ? '#ead9d0'
                : type.climates?.includes('arid') || type.climates?.includes('savanna') ? '#e6cf7a'
                    : '#e8e0c0',
        season: (Number(type.priority) || 5) >= 7 ? 0 : 1,
    };
    const deadwood = clamp01(family.deadwood + oldGrowth * 0.34);
    const useIcon = (effects.timber || 1) >= 1.05 ? 'axe' : (Number(effects.forage) || 1) >= 1.08 ? 'basket' : 'leaf';
    const danger = (Number(effects.fire) || 0) >= 0.16 ? 'fire'
        : (Number(effects.flood) || 0) >= 0.2 ? 'flood'
            : visibility < 0.5 ? 'lost' : 'none';
    const dangerLabel = danger === 'fire' ? 'Fire-prone'
        : danger === 'flood' ? 'Flood-prone'
            : danger === 'lost' ? 'Easy to lose the path' : 'No exceptional danger';
    const parallax = clamp(family.parallax * (0.86 + unit(type.id, 'parallax') * 0.32), 0.015, 0.095);
    const phenology = phenologyFor(type, baseClimate, leaves, snow, oldGrowth);
    const seasons = seasonsFor(type, familyId, baseClimate, leaves, snow, bloom, ground, phenology);
    const canopyLayers = canopyLayersFor(familyId, leaves, parallax);
    const fieldMarks = fieldMarksFor(type, familyId, baseClimate);
    const weatherReaction = Object.freeze({
        drip: clamp01((Number(effects.flood) || 0) * 0.7 + density * 0.25 + unit(type.id, 'drip') * 0.2),
        hush: clamp01((family.snow * (climate.snow || 1)) / 1.8),
        creak: clamp01((Number(effects.fire) || 0) * 0.2 + wind.gust * 0.4 + oldGrowth * 0.4),
    });
    return Object.freeze({
        id: type.id,
        key: type.key,
        label: type.label,
        short: type.short || type.label,
        climate: baseClimate,
        silhouette,
        family: familyId,
        dominantSpecies: dominant,
        dominantLabel: speciesLabel(dominant),
        icon: family.icon,
        pattern: family.pattern,
        patternLabel: family.patternLabel,
        parallax,
        phenology,
        seasons,
        canopyLayers,
        fieldMarks,
        weatherReaction,
        crown: Object.freeze({
            aspect: clamp(family.crownAspect * (0.9 + unit(type.id, 'aspect') * 0.2), 0.45, 1.45),
            asymmetry: clamp01(family.asymmetry * (0.7 + unit(type.id, 'asym') * 0.7)),
            tiers: Math.max(2, Math.round(family.tiers + (unit(type.id, 'tiers') - 0.5) * 2)),
            density,
        }),
        leaves: Object.freeze(leaves),
        light: Object.freeze({
            mood: climate.hue,
            familyMood: family.light,
            shaft: clamp01(family.shaft * (0.8 + unit(type.id, 'shaft') * 0.4) * (0.6 + visibility * 0.4)),
            dapple: clamp01(density * 0.5 + unit(type.id, 'dapple') * 0.3),
            contrast: clamp01((1 - visibility) * 0.6 + density * 0.4),
        }),
        snow: Object.freeze(snow),
        ground: Object.freeze({ ...ground, wetSheen: clamp01((Number(effects.flood) || 0) + unit(type.id, 'wet') * 0.28), litter: groundId }),
        fog: Object.freeze({
            ...fog,
            density: clamp((0.5 + (Number(type.render?.mist) || 1) * 0.42) * (climate.fog ? 1.1 : 0.85), 0.15, 1.6),
            visibility,
        }),
        wind: Object.freeze(wind),
        deadwood,
        rootPlate: clamp01(family.rootPlate + unit(type.id, 'root') * 0.24),
        understory: Object.freeze({
            fern: clamp01(family.understory[0] * (0.8 + unit(type.id, 'fern') * 0.4)),
            grass: clamp01(family.understory[1] * (0.8 + unit(type.id, 'grass') * 0.4)),
            shrub: clamp01(family.understory[2] * (0.8 + unit(type.id, 'shrub') * 0.4)),
        }),
        bloom: Object.freeze(bloom),
        fauna: Object.freeze(faunaFor(type)),
        sound: Object.freeze({ ...sound, instruments: instrumentsFor(type, familyId) }),
        seasonStrip: Object.freeze(seasons.map(season => season.id)),
        instruments: instrumentsFor(type, familyId),
        useIcon,
        danger,
        dangerLabel,
        legend: Object.freeze({
            type: family.patternLabel + ' ' + family.icon,
            use: useIcon === 'axe' ? 'Timber use' : useIcon === 'basket' ? 'Forage use' : 'Mixed use',
            danger: dangerLabel,
        }),
        effects: Object.freeze({ ...effects }),
        goods: Object.freeze([...(type.goods || [])]),
        resources: Object.freeze([
            ...((Number(effects.timber) || 1) >= 0.98 || (type.goods || []).some(id => /timber|log|charcoal/.test(String(id))) ? ['timber'] : []),
            ...((Number(effects.forage) || 1) >= 0.98 || (type.goods || []).some(id => /mushroom|herb|berr|honey|nut|mast|fruit|lichen/.test(String(id))) ? ['forage'] : []),
            ...((type.goods || []).includes('firewood') || (type.goods || []).some(id => /firewood|charcoal/.test(String(id))) ? ['firewood'] : []),
            ...(faunaFor(type).water ? ['water'] : []),
        ]),
        priority: Number(type.priority) || 5,
    });
}

export const FOREST_PRESENTATION_LIST = Object.freeze(REGIONAL_FOREST_TYPES.map(profileFor));
export const FOREST_PRESENTATION_PROFILES = Object.freeze(Object.fromEntries(
    FOREST_PRESENTATION_LIST.map(profile => [profile.id, profile]),
));

const PROFILES_BY_KEY = new Map(FOREST_PRESENTATION_LIST.map(profile => [profile.key, profile]));

export function forestPresentationProfile(idOrKey) {
    if (!idOrKey) return null;
    return FOREST_PRESENTATION_PROFILES[idOrKey] || PROFILES_BY_KEY.get(idOrKey) || null;
}

export function forestPresentationFamily(idOrKey) {
    return (forestPresentationProfile(idOrKey) || FOREST_PRESENTATION_LIST[0]).family;
}

// Species stiffness: how far a stem bends and how quickly it returns. Conifers
// are stiff and slow, birches and palms are supple and quick, mangroves brace
// against the wind. The renderer multiplies its own weather sway by this.
export const FOREST_SPECIES_STIFFNESS = Object.freeze({
    spruce: 1.34, fir: 1.38, pine: 1.22, larch: 0.98, cedar: 1.3, cypress: 1.26,
    juniper: 1.2, yew: 1.3, redwood: 1.42, sitka: 1.3, hemlock: 1.18,
    podocarpus: 1.12, 'dwarf-pine': 1.2,
    birch: 0.58, alder: 0.68, willow: 0.5, poplar: 0.66, aspen: 0.54,
    oak: 1.16, beech: 1.02, chestnut: 0.94, maple: 0.9, ash: 0.96,
    elm: 1.0, linden: 0.78, lime: 0.78, hornbeam: 1.12, hazel: 0.72,
    rowan: 0.7, tamarisk: 0.62, eucalyptus: 0.74, laurel: 0.92,
    'cork-oak': 1.08, 'holm-oak': 1.14, 'aleppo-pine': 0.96, miombo: 0.88,
    teak: 1.24, sal: 1.14, dipterocarp: 1.06, nothofagus: 1.04, treefern: 0.62,
    mangrove: 1.28, palm: 0.44, bamboo: 0.36, acacia: 0.86, baobab: 1.46,
    olive: 1.0,
});

export function forestSpeciesStiffness(species) {
    return FOREST_SPECIES_STIFFNESS[species] || 0.96;
}

// Canvas glyphs for the map icons and the atlas legend. Kept as plain text so
// the same symbol can be rendered in a canvas, an HTML chip and a table row.
export const FOREST_USE_ICONS = Object.freeze({
    axe: Object.freeze({ id: 'axe', glyph: '⚒', label: 'Timber use', detail: 'A working wood: saw timber, poles and firewood.' }),
    basket: Object.freeze({ id: 'basket', glyph: '⌘', label: 'Forage use', detail: 'A gathered wood: mushrooms, herbs, mast and fruit.' }),
    leaf: Object.freeze({ id: 'leaf', glyph: '❧', label: 'Mixed use', detail: 'Timber, forage and grazing share the stand.' }),
});

export const FOREST_DANGER_ICONS = Object.freeze({
    fire: Object.freeze({ id: 'fire', glyph: '🔥', label: 'Fire-prone', detail: 'Resin, needle litter and summer drought make fire a real risk.' }),
    flood: Object.freeze({ id: 'flood', glyph: '≈', label: 'Flood-prone', detail: 'Wet ground and a low bank put the stand at risk in a hard season.' }),
    lost: Object.freeze({ id: 'lost', glyph: '◌', label: 'Easy to lose the path', detail: 'Dense fog and a closed canopy hide the way out.' }),
    none: Object.freeze({ id: 'none', glyph: '·', label: 'No exceptional danger', detail: 'The stand has no exceptional hazard beyond ordinary woodcraft.' }),
});

export const FOREST_PROTECTION_STATES = Object.freeze([
    Object.freeze({ id: 'all', label: 'All stands' }),
    Object.freeze({ id: 'protected', label: 'Protected' }),
    Object.freeze({ id: 'managed', label: 'Managed' }),
    Object.freeze({ id: 'disturbed', label: 'Disturbed' }),
    Object.freeze({ id: 'unmanaged', label: 'Unmanaged' }),
]);

export const FOREST_FILTER_GROUPS = Object.freeze([
    Object.freeze({
        id: 'family', label: 'Forest type',
        options: Object.freeze([
            Object.freeze({ id: 'all', label: 'All types' }),
            Object.freeze({ id: 'conifer', label: 'Conifer' }),
            Object.freeze({ id: 'broadleaf', label: 'Broadleaf' }),
            Object.freeze({ id: 'emergent', label: 'Emergent' }),
            Object.freeze({ id: 'mangrove', label: 'Mangrove' }),
            Object.freeze({ id: 'riparian', label: 'Riparian' }),
            Object.freeze({ id: 'dry', label: 'Dry woodland' }),
            Object.freeze({ id: 'scrub', label: 'Scrub' }),
        ]),
    }),
    Object.freeze({
        id: 'resource', label: 'Resource',
        options: Object.freeze([
            Object.freeze({ id: 'all', label: 'All resources' }),
            Object.freeze({ id: 'timber', label: 'Timber' }),
            Object.freeze({ id: 'forage', label: 'Forage' }),
            Object.freeze({ id: 'firewood', label: 'Firewood' }),
            Object.freeze({ id: 'water', label: 'Water & fish' }),
        ]),
    }),
    Object.freeze({
        id: 'protection', label: 'Protection',
        options: FOREST_PROTECTION_STATES,
    }),
]);

// The thirty requested presentation, audio and accessibility points. Every row
// names the real consumer that makes it visible or audible in play; the atlas
// renders the same list with a live reading from the reference wood.
export const FOREST_PRESENTATION_POINTS = Object.freeze([
    Object.freeze({
        id: '1.2.23.1.241', group: 'render', title: 'Canopy parallax by forest type',
        point: 'The crown roof of each regional forest shifts at its own depth when the camera moves.',
        consumer: 'terrain.js · drawMassCanopy / forestPresentation profile.parallax',
        detail: 'Each of the sixty types carries a parallax factor derived from its silhouette and canopy depth. The landscape canopy layer is offset by that factor against the trunk and ground layers, so a tall emergent rainforest closes over the view at a different rate than a low thorn wood. Close LOD applies a fraction of the same offset so the roof still feels layered at roof distance. The atlas prints the same roof factor beside the understorey and trunk layers, so the readout and the map share one number.',
    }),
    Object.freeze({
        id: '1.2.23.1.242', group: 'render', title: 'Unmistakable tree silhouettes per region',
        point: 'A player can name the woodland from the crown outline alone.',
        consumer: 'terrain.js · drawBroadleaf / drawConifer / drawMassCanopy',
        detail: 'Every regional type maps to a silhouette family (spire, dome, emergent, umbrella, baobab, stilt, bamboo, column, scrub). The family sets crown aspect, asymmetry and tier count; the per-type hash adds a second, smaller variation. Conifer spires, flat acacia umbrellas, mangrove stilt crowns and poplar columns are now distinct shapes rather than one recoloured crown.',
    }),
    Object.freeze({
        id: '1.2.23.1.243', group: 'render', title: 'Regional leaf colours and light moods',
        point: 'Each woodland has its own leaf palette and its own quality of light.',
        consumer: 'terrain.js · drawBroadleaf / drawForestGround / drawCanopyLight',
        detail: 'The profile supplies a summer, autumn and spring tint plus a light mood. Crown fills are mixed toward the regional tint, the floor palette inherits the same family hue and the canopy shafts use the regional light colour. A blue-green coastal wood, a gold savanna and a dark spruce forest therefore read differently at the same hour and season.',
    }),
    Object.freeze({
        id: '1.2.23.1.244', group: 'render', title: 'Autumn foliage with staggered colouring',
        point: 'Autumn arrives tree by tree and region by region, not on one calendar day.',
        consumer: 'seasonal-foliage.js + presentation profile.leaves.turnShift',
        detail: 'The existing per-tree timing already jitters turn and drop. The regional profile adds a second shift of up to eight days and a spring shift of six, so a birch grove turns before the oakwood beside it and a southern beech wood colours later than a northern one. Neighbouring crowns within a stand keep their own species timing. The atlas calendar dates leaf-out, canopy closure, turn and leaf fall per type, so two woods can be compared by day instead of by colour alone.',
    }),
    Object.freeze({
        id: '1.2.23.1.245', group: 'render', title: 'Snow loads and bare crowns in winter',
        point: 'Snow sits differently on spruce, oak and mangrove, and bare crowns stay legible.',
        consumer: 'seasonal-foliage.js + terrain.js · drawBareCrown / foliage.snow',
        detail: 'Regional snow retention multiplies the foliage sampler: spruce and fir hold a deep load, pine sheds more, mangrove and palm hold almost none. The bare-crown pass already draws species-specific branch geometry; the profile also sets how much of the stand is bare in winter, so a marcescent oakwood keeps a brown crown while a larch stand reads as a clean winter skeleton.',
    }),
    Object.freeze({
        id: '1.2.23.1.246', group: 'render', title: 'Ground textures for needle, broadleaf and mangrove',
        point: 'The floor under the trees names the forest as clearly as the crowns do.',
        consumer: 'terrain.js · drawForestGround / drawRegionalGroundTexture',
        detail: 'Eight explicit ground weaves (needle, broadleaf litter, deep litter, moss, tidal mud, marsh, sand, volcanic ash) are selected by the regional profile. Each draws its own marks: parallel needle fall and resin flecks, layered species leaves and mast cups, pneumatophores in black mud, sedge peat and standing water, wind-rippled sand, or grey tephra. The generic litter pass still runs on top so the floor never becomes a flat swatch.',
    }),
    Object.freeze({
        id: '1.2.23.1.247', group: 'render', title: 'Light rays through fog and canopy gaps',
        point: 'Shafts of light break through crown gaps and are made visible by the mist.',
        consumer: 'terrain.js · drawCanopyLight + daylight.solarVector',
        detail: 'The canopy-light pass now draws two overlapping shafts per gap, angled by the live solar vector and softened by the regional fog density. A closed spruce wood gets a narrow cold beam, an open savanna a broad warm wash, and a foggy coastal wood a visible cone. Reduced motion freezes the pulse; performance mode keeps the static shaft but skips the second ray.',
    }),
    Object.freeze({
        id: '1.2.23.1.248', group: 'render', title: 'Regional fog types and visibility',
        point: 'Coastal veil, valley mist, ground fog, river steam, canopy breath, dry haze, dust, wood mist and ash fall.',
        consumer: 'terrain.js · drawForestMist + presentation profile.fog',
        detail: 'Nine fog behaviours are derived from climate and type: each has its own colour, vertical rise, horizontal spread and density. The stand visibility value feeds the same fog, the canopy-light pass and the line-of-sight helper, so a foggy wood is genuinely harder to read. Fog is drawn only on the detail lattice and never on the simulation tick.',
    }),
    Object.freeze({
        id: '1.2.23.1.249', group: 'render', title: 'Rain, dripping water and wet surfaces',
        point: 'A wet wood looks wet: dark soil, standing puddles, dripping crowns and glossy leaves.',
        consumer: 'terrain.js · drawForestWetness + weather-overlay.js',
        detail: 'Rain and storm weather darken the forest floor, add bounded puddle sheen and leaf glints, and draw drip lines from the crown at close zoom. The screen rain layer continues to fall above the map. The wet pass is tied to the same weather state the simulation uses, so it stops when the rain stops and never runs on a dry tile.',
    }),
    Object.freeze({
        id: '1.2.23.1.250', group: 'render', title: 'Wind movement with species stiffness',
        point: 'Spruce, birch, oak and palm do not bend the same way in the same gust.',
        consumer: 'terrain.js · drawTree / forestSpeciesStiffness',
        detail: 'A per-species stiffness table drives both the amplitude and the frequency of the sway. Stiff conifers move little and slowly, birch, willow and bamboo whip quickly, palms flutter, and mangroves brace. Weather still multiplies the result (storm 2.35×, rain 1.28×), and reduce-motion / performance mode scale it down without changing the direction.',
    }),
    Object.freeze({
        id: '1.2.23.1.251', group: 'render', title: 'Deadwood, root plates and fallen trunks',
        point: 'A living wood carries its own history on the floor.',
        consumer: 'terrain.js · drawFallenLog / drawRootPlate / drawStandingDeadwood',
        detail: 'The floor pass selects fallen trunks, torn root plates, standing snags and stumps from the regional deadwood and root-plate values. Windthrow tiles expose a full root plate; old-growth types carry more standing deadwood; mangrove and riparian woods show stilt roots and water-worn logs. Deadwood also remains the physical habitat the fauna model already reads.',
    }),
    Object.freeze({
        id: '1.2.23.1.252', group: 'render', title: 'Understory with ferns, grasses and shrubs',
        point: 'Each wood has its own low layer, not one generic fern stamp.',
        consumer: 'terrain.js · drawUnderstory / drawForestFloor',
        detail: 'The regional profile weights ferns, grasses and shrubs, and those weights are added to the stand’s own understorey values when the floor chooses a motif. A spruce wood leans on moss and berry shrubs, an oakwood on bramble and fern, a savanna on grass and thorn scrub, a mangrove on sedge and pneumatophores. The pass is still one bounded motif per visible tile.',
    }),
    Object.freeze({
        id: '1.2.23.1.253', group: 'render', title: 'Blossoms and fruit as seasonal details',
        point: 'Spring blossom and autumn mast appear on the species that actually carry them.',
        consumer: 'terrain.js · drawBlossoms / drawMast + type.goods',
        detail: 'Spring adds a bounded blossom pass to flowering types, tinted by the regional bloom colour. The existing mast pass is extended with the type’s real fruits and cones, and the profile sets blossom and fruit density. A beech wood drops beechnuts, an oakwood acorns, a spruce wood cones, a savanna acacia pods; a mangrove flowers in its own season. The atlas prints the regional blossom and fruit days beside the density, so the seasonal detail is readable before it appears on the map.',
    }),
    Object.freeze({
        id: '1.2.23.1.254', group: 'render', title: 'Visible animals and birds in matching forest types',
        point: 'The right animal appears in the right wood, and birds cross the canopy.',
        consumer: 'terrain.js · drawForestFaunaScene / drawRegionBirds + forestFaunaFor',
        detail: 'The regional fauna list selects the resident bird and mammal, and the renderer draws them from the same simulated herd data. A capercaillie belongs to the taiga, a toucan to the rainforest, a hawk to the savanna. A new high-canopy bird pass puts two or three silhouettes above the crowns at map and district distance, so a wood reads as alive even when the floor is hidden.',
    }),
    Object.freeze({
        id: '1.2.23.1.255', group: 'render', title: 'Insect clouds and butterflies as atmosphere',
        point: 'Warm, flowering woods carry a moving haze of insects.',
        consumer: 'terrain.js · drawInsectCloud / drawCloseInsects',
        detail: 'A bounded insect cloud drifts over sunlit gaps in spring and summer, with butterflies in flowering types and bees in forage-rich ones. The close-study pass still reads the saved ant and beetle colonies; the cloud is a presentation layer driven by the regional insect density and the season, never a new population model.',
    }),
    Object.freeze({
        id: '1.2.23.1.256', group: 'audio', title: 'Regional forest sounds and animal voices',
        point: 'Every woodland has its own bed, its own birds and its own weather.',
        consumer: 'core/forest-ambience.js · procedural WebAudio bed',
        detail: 'A procedural WebAudio bed is filtered per region: needle hiss for conifers, broadleaf rustle for oakwoods, reeds and water for riparian woods, bamboo clatter, dry grass, coastal fog and mangrove water. Bird and insect calls are scheduled from the regional fauna list with a deterministic clock. Rain and storm raise the wind bed; snow muffles it. No audio file is downloaded.',
    }),
    Object.freeze({
        id: '1.2.23.1.257', group: 'audio', title: 'Musical instruments from regional woods',
        point: 'The regional trees become the instruments the wood plays.',
        consumer: 'core/forest-ambience.js · profile.instruments timbre',
        detail: 'Each type names three instruments built from its dominant species (spruce fiddle, birch flute, oak harp, mangrove drum, savanna lyre). Their timbre, brightness, decay and overtone set a short procedural motif played at long intervals over the bed. The motif is deterministic for the type and season, so the same wood sounds like itself across sessions. Each family also has its own wooden mode and tempo, and the atlas can audition the instrument, bird, insect, weather, drip, creak, hush and silence cues on demand.',
    }),
    Object.freeze({
        id: '1.2.23.1.258', group: 'audio', title: 'Silence as an acoustic device in the old wood',
        point: 'The oldest stands go quiet, and the quiet is the point.',
        consumer: 'core/forest-ambience.js · profile.sound.silence',
        detail: 'Old-growth types carry a silence value. As it rises the bed is pulled down, bird and insect calls become rare and the instrument motif stretches out. A deep beech or redwood stand can hold several seconds of near-silence between a single creak and a distant owl. The silence respects the ambience volume and can be turned off with the ambience toggle.',
    }),
    Object.freeze({
        id: '1.2.23.1.259', group: 'ui', title: 'Map icons for forest type, use and danger',
        point: 'A small icon on the map names the wood, what it is used for and what can go wrong.',
        consumer: 'terrain.js · drawForestMapIcons + atlas legend',
        detail: 'At map and district distance one bounded icon per sampled forest tile shows the family glyph, the use glyph (timber, forage, mixed) and a danger mark (fire, flood, easy to lose the path). The same glyphs are used in the atlas legend and on the filter chips. Icons are drawn from the cached detail raster and never add per-frame work.',
    }),
    Object.freeze({
        id: '1.2.23.1.260', group: 'ui', title: 'Legends with ecological symbols',
        point: 'The map symbols are explained in one place, including the ones that are not trees.',
        consumer: 'forest-atlas-panel.js · presentationBlock legend + family filter',
        detail: 'The atlas carries a legend for all nine silhouette families, the three use icons and the four danger marks, plus the protection and disturbance symbols. Each entry states what the symbol means in ecological terms, not only what colour it has. The legend is generated from the same tables the renderer reads, so it cannot drift from the map.',
    }),
    Object.freeze({
        id: '1.2.23.1.261', group: 'ui', title: 'Tooltips for tree species and forest goods',
        point: 'Tapping or activating a species chip or a good explains its ecology and its use.',
        consumer: 'forest-atlas-panel.js · species chips / goods chips + shared touch tooltip',
        detail: 'Every species chip carries its Latin name, its form, its timber and firewood character and its understorey role. Every good chip carries its category, its use and its season. The same text opens in a shared tooltip on touch, remains available as the native title, and is generated from the shared species and goods tables, so a new regional species or good appears without a second catalogue.',
    }),
    Object.freeze({
        id: '1.2.23.1.262', group: 'ui', title: 'Filter by forest type, resource and protection',
        point: 'The player can narrow sixty types to the wood they actually need.',
        consumer: 'forest-atlas-panel.js · filter bar + management-ui handlers',
        detail: 'Three independent filter groups (family, resource, protection) combine to hide cards that do not match. The filter state lives in the presentation system, is applied when the atlas renders, and is updated in place when the player clicks a chip, so the panel does not need a full reload. A reset control returns to all sixty types.',
    }),
    Object.freeze({
        id: '1.2.23.1.263', group: 'accessibility', title: 'Colour-blind-safe forest type coding',
        point: 'Forest type is never carried by colour alone.',
        consumer: 'forest-atlas-panel.js + css/comic-strategy.css pattern classes',
        detail: 'Every family has a pattern (chevron, dots, diamond, rays, waves, cross, bars, rings) as well as a colour. The pattern appears on the palette swatch, the map icon and the filter chip when colour-blind mode is on. The type name and glyph are always present, so the encoding works even without the pattern layer.',
    }),
    Object.freeze({
        id: '1.2.23.1.264', group: 'accessibility', title: 'Contrast mode for dense canopy rendering',
        point: 'In a closed wood the crowns must not merge into one dark mass.',
        consumer: 'terrain.js · canopy shade / mass canopy outline + settings',
        detail: 'A separate canopy-contrast toggle lightens the ambient canopy shade, adds a dark ink outline to mass crowns and reduces the fog and shaft wash. The floor keeps its texture, but the crown silhouette stays readable. It is independent of the interface high-contrast mode, so a player can raise map legibility without changing the whole UI.',
    }),
    Object.freeze({
        id: '1.2.23.1.265', group: 'accessibility', title: 'Adjustable font size in forest dialogs',
        point: 'The atlas can be read comfortably without zooming the browser.',
        consumer: 'settings modal + css/comic-strategy.css forest font scale',
        detail: 'A three-step forest text scale (normal, large, extra large) is persisted with the other settings and applied to the Forest Atlas cards, notes, chips, guides and filter bar. The scale changes type only, not the map or the rest of the interface, and every step keeps the existing line-height and contrast rules.',
    }),
    Object.freeze({
        id: '1.2.23.1.266', group: 'accessibility', title: 'Reduced motion for wind and leaves',
        point: 'Players who ask for less motion get a still wood, not a broken one.',
        consumer: 'terrain.js · forest sway / canopy light pulse + reduceMotion',
        detail: 'The existing reduce-motion setting now reaches the map: tree sway is cut to a slow fraction, canopy-light pulses stop, insect clouds hold still and falling-leaf motes are suppressed. The forest keeps its shapes, colours and fog; only the movement is calmed. The setting is shared with the interface motion switch.',
    }),
    Object.freeze({
        id: '1.2.23.1.267', group: 'accessibility', title: 'Subtitles for animal voices and forest sounds',
        point: 'Every sound cue can be read as well as heard.',
        consumer: 'index.html #forest-subtitle + core/forest-ambience.js cue events',
        detail: 'When the subtitle option is on, each bird, insect, instrument or water cue writes a short line to a polite live region above the map (“A capercaillie calls”, “Rain on the spruce tops”, “A low wooden flute”). The line fades after a few seconds. The same cue text is available without audio, so the ambience remains usable with the sound off. The atlas preview prints the exact cue and keeps the last eight in a visible history.',
    }),
    Object.freeze({
        id: '1.2.23.1.268', group: 'performance', title: 'Performance mode with less tree movement',
        point: 'A weaker device keeps the forest readable with a quieter canopy.',
        consumer: 'settings modal + terrain.js forest performance tuning',
        detail: 'Performance mode halves canopy sway, skips the second light shaft and the insect cloud, simplifies the mass canopy highlight, and suppresses the close mist and fauna passes at far zoom. It does not lower the simulation, the save or the map resolution; it only removes presentation work that is not needed to read the wood.',
    }),
    Object.freeze({
        id: '1.2.23.1.269', group: 'performance', title: 'Reduced particles for rain and leaves',
        point: 'Weather stays visible without filling the screen with particles.',
        consumer: 'weather-overlay.js + terrain.js particle scale',
        detail: 'A reduced-particles toggle halves the rain and snow count in the weather overlay and removes falling-leaf motes and insect specks from the forest pass. The ground still darkens in rain and the snow cover still reads; the effect is a lighter screen, not a missing season.',
    }),
    Object.freeze({
        id: '1.2.23.1.270', group: 'performance', title: 'Alternative map view for weak devices',
        point: 'A cartographic woodland view replaces thousands of crowns on demand.',
        consumer: 'terrain.js · symbolic forest tile + settings map view',
        detail: 'The alternative view draws a flat regional canopy patch with the type glyph, use and danger icons instead of individual trees, understorey, fauna, mist and light shafts. It keeps the same tile colours, the same resource and protection state and the same click targets, so the player can keep playing on a weak device. Switching back restores the detailed wood without reloading or changing the save.',
    }),
]);

export const FOREST_PRESENTATION_REQUIREMENTS = FOREST_PRESENTATION_POINTS;

export function forestPresentationPointsByGroup(group) {
    return FOREST_PRESENTATION_POINTS.filter(entry => entry.group === group);
}
