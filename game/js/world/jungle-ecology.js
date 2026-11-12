// Jungle understory and operations (1.2.5).
//
// The tropical rainforest pass (1.2.4) owns trees, formations and land use.
// This module adds the vertical jungle interior: thickets, walls, passages,
// ravines, hidden water, camouflage, ambush lanes and supply/defence pressure.
// It is a pure derived view over the same stand. No new saved map, population
// or second ecology is introduced; renderer, survey, movement and combat all
// read the same deterministic profile.

import { TROPICAL_GOODS, TROPICAL_FORMATIONS } from './tropical-ecology.js';

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

function coarse(seed, x, y, cell, salt) {
    const size = Math.max(1, Math.floor(cell));
    return unit(seed, Math.floor(x / size), Math.floor(y / size), salt);
}

function round(value) {
    return Math.round(clamp01(value) * 1000) / 1000;
}

const point = (id, key, label) => Object.freeze({ id, key, label });

// One entry per 1.2.5 requirement. The contract is data so documentation,
// tests, survey and the derived stand cannot drift apart.
export const JUNGLE_POINTS = Object.freeze([
    point('1.2.5.1', 'massiveThickets', 'Massive shrub and scrub stands'),
    point('1.2.5.2', 'denseVines', 'Dense lianas and intergrown plants'),
    point('1.2.5.3', 'largeLeafPlants', 'Large broadleaf plants'),
    point('1.2.5.4', 'bambooStands', 'Bamboo stands'),
    point('1.2.5.5', 'fernsClimbers', 'Dense ferns and climbing plants'),
    point('1.2.5.6', 'thornBushes', 'Thorn bushes and spiny vegetation'),
    point('1.2.5.7', 'vegetationHeightLayers', 'Different vegetation heights'),
    point('1.2.5.8', 'smallOpenPatches', 'Small open patches between dense plant walls'),
    point('1.2.5.9', 'sightRangeVariety', 'Different sight ranges'),
    point('1.2.5.10', 'impenetrableUndergrowth', 'Areas of nearly impenetrable undergrowth'),
    point('1.2.5.11', 'naturalPassages', 'Small natural passages'),
    point('1.2.5.12', 'hiddenGlades', 'Hidden clearings'),
    point('1.2.5.13', 'animalTrails', 'Narrow animal trails'),
    point('1.2.5.14', 'vegetationWalls', 'Dense vegetation walls'),
    point('1.2.5.15', 'hiddenStreamsHollows', 'Hidden watercourses and terrain hollows'),
    point('1.2.5.16', 'bambooForests', 'Bamboo forests'),
    point('1.2.5.17', 'giantFerns', 'Giant ferns'),
    point('1.2.5.18', 'climbingVines', 'Climbing plants and lianas'),
    point('1.2.5.19', 'thornPlants', 'Thorn plants'),
    point('1.2.5.20', 'broadLeavesShrubs', 'Large leaves and tropical shrubs'),
    point('1.2.5.21', 'poisonousIrritantPlants', 'Poisonous and irritant plants'),
    point('1.2.5.22', 'fruitingPlants', 'Fruit-bearing plants'),
    point('1.2.5.23', 'rareFantasticPlants', 'Rare and fantastic jungle plants'),
    point('1.2.5.24', 'hillsideDenseVegetation', 'Dense vegetation on hilly ground'),
    point('1.2.5.25', 'wetHollows', 'Humid hollows'),
    point('1.2.5.26', 'smallRavines', 'Small ravines'),
    point('1.2.5.27', 'rockOutcrops', 'Vegetated rock outcrops'),
    point('1.2.5.28', 'hiddenWaterfalls', 'Hidden waterfalls'),
    point('1.2.5.29', 'floodedJungle', 'Flooded jungle areas'),
    point('1.2.5.30', 'rockPlantPassages', 'Natural passages between rock and plants'),
    point('1.2.5.31', 'clearingsViewpoints', 'Clearings and elevated viewpoints'),
    point('1.2.5.32', 'largePredators', 'Large predators'),
    point('1.2.5.33', 'snakesLizards', 'Snakes and lizards'),
    point('1.2.5.34', 'monkeysArboreal', 'Monkeys and arboreal animals'),
    point('1.2.5.35', 'tropicalBirds', 'Tropical birds'),
    point('1.2.5.36', 'insectsSpiders', 'Insects and venomous spiders'),
    point('1.2.5.37', 'amphibians', 'Amphibians and moisture-loving animals'),
    point('1.2.5.38', 'camouflagedAnimals', 'Animals camouflaged in dense vegetation'),
    point('1.2.5.39', 'rareDangerousSpecies', 'Rare and especially dangerous species'),
    point('1.2.5.40', 'fruitsNuts', 'Fruits and nuts'),
    point('1.2.5.41', 'tropicalTimber', 'Tropical hardwoods'),
    point('1.2.5.42', 'fibresPlantMaterials', 'Fibres and plant materials'),
    point('1.2.5.43', 'medicinalPlants', 'Medicinal plants'),
    point('1.2.5.44', 'poisonsExtracts', 'Poisons and special plant extracts'),
    point('1.2.5.45', 'spicesRareProducts', 'Spices and rare natural products'),
    point('1.2.5.46', 'huntingGathering', 'Hunting and gathering products'),
    point('1.2.5.47', 'hiddenRareResources', 'Rare resources at hidden locations'),
    point('1.2.5.48', 'movementCost', 'Increased movement costs'),
    point('1.2.5.49', 'sightRestriction', 'Restricted sight range'),
    point('1.2.5.50', 'navigationDifficulty', 'Difficult navigation'),
    point('1.2.5.51', 'ambushesSurprise', 'Ambushes and surprise attacks'),
    point('1.2.5.52', 'diseaseParasites', 'Diseases and parasites'),
    point('1.2.5.53', 'supplyDifficulty', 'Harder supply of larger forces'),
    point('1.2.5.54', 'localAdvantage', 'Advantages for local units'),
    point('1.2.5.55', 'guerrillaDefence', 'Special suitability for guerrilla and defensive warfare'),
]);

const formationLook = Object.freeze({
    'tropical-emergent': { label: 'Emergent jungle', density: 0.92, floor: 0.52, water: 0.12 },
    'tropical-canopy': { label: 'Closed-canopy jungle', density: 0.88, floor: 0.54, water: 0.18 },
    'tropical-floodplain': { label: 'Flooded várzea jungle', density: 0.78, floor: 0.62, water: 0.82 },
    'tropical-palm-grove': { label: 'Palm-thicket jungle', density: 0.64, floor: 0.5, water: 0.24 },
    'tropical-swamp': { label: 'Black-water jungle', density: 0.84, floor: 0.7, water: 0.92 },
    'tropical-montane': { label: 'Cloud-forest jungle', density: 0.82, floor: 0.58, water: 0.4 },
    'tropical-bamboo': { label: 'Bamboo wall', density: 0.7, floor: 0.74, water: 0.14 },
    'tropical-gap': { label: 'Sunlit jungle gap', density: 0.48, floor: 0.44, water: 0.12 },
    'tropical-secondary': { label: 'Secondary jungle thicket', density: 0.56, floor: 0.5, water: 0.18 },
    'tropical-ancient': { label: 'Old-growth jungle', density: 0.95, floor: 0.56, water: 0.16 },
    'tropical-riverbank': { label: 'Riverbank jungle', density: 0.7, floor: 0.62, water: 0.68 },
    'tropical-plantation': { label: 'Overgrown plantation jungle', density: 0.6, floor: 0.54, water: 0.2 },
});

export const JUNGLE_RESOURCE_GROUPS = Object.freeze({
    fruitsNuts: Object.freeze(['brazil-nuts', 'cacao-pods', 'cocoa', 'mangoes', 'papayas', 'bananas', 'plantain', 'guavas', 'passionfruit', 'avocadoes', 'rambutan', 'durian', 'mangosteen', 'acai', 'figs']),
    tropicalTimber: Object.freeze(['kapok-timber', 'mahogany-timber', 'brazil-nut-timber', 'rubberwood-timber', 'balsa-timber', 'ironwood-timber', 'rosewood-timber', 'sandalwood-timber', 'cacao-wood', 'fig-wood', 'mangosteen-wood', 'palm-wood', 'bamboo']),
    fibresPlantMaterials: Object.freeze(['rattan', 'kapok-fibre', 'palm-fibre', 'natural-rubber', 'copal-resin', 'bamboo']),
    medicinalPlants: Object.freeze(['quinine-bark', 'ipecac', 'copaiba-oil', 'cat-claw', 'fever-bark', 'curare']),
    poisonsExtracts: Object.freeze(['curare', 'snake-venom', 'poison-dart-frog', 'strychnine', 'bullet-ant-venom']),
    spicesRareProducts: Object.freeze(['vanilla', 'cinnamon-bark', 'black-pepper', 'ginger', 'cardamom', 'nutmeg', 'cloves', 'allspice']),
    huntingGathering: Object.freeze(['game', 'hides', 'feathers', 'river-fish', 'palmito', 'bamboo-shoots', 'stingless-bee-honey']),
    hiddenRareResources: Object.freeze(['orchids', 'bromeliads', 'agarwood', 'tagua-nuts', 'rosewood-oil', 'sandalwood-oil', 'luminous-fungus', 'giant-waterlily']),
});

// All ids are checked against the shared tropical good register at module load
// in tests, so a typo cannot silently strand a resource.
export const JUNGLE_GOOD_IDS = Object.freeze([...new Set(Object.values(JUNGLE_RESOURCE_GROUPS).flat())]);

export const JUNGLE_FAUNA = Object.freeze([
    Object.freeze({ id: 'jaguar', label: 'Jaguar', group: 'predator', danger: 0.92, rare: 0.42, camouflage: 0.6 }),
    Object.freeze({ id: 'ocelot', label: 'Ocelot', group: 'predator', danger: 0.54, rare: 0.22, camouflage: 0.82 }),
    Object.freeze({ id: 'bushmaster', label: 'Bushmaster', group: 'reptile', danger: 0.88, rare: 0.72, camouflage: 0.94 }),
    Object.freeze({ id: 'anaconda', label: 'Anaconda', group: 'reptile', danger: 0.82, rare: 0.44, camouflage: 0.78 }),
    Object.freeze({ id: 'iguana', label: 'Green iguana', group: 'reptile', danger: 0.18, rare: 0.14, camouflage: 0.86 }),
    Object.freeze({ id: 'vine-snake', label: 'Vine snake', group: 'reptile', danger: 0.42, rare: 0.4, camouflage: 0.96 }),
    Object.freeze({ id: 'howler-monkey', label: 'Howler monkey', group: 'primate', danger: 0.08, rare: 0.12, camouflage: 0.32 }),
    Object.freeze({ id: 'spider-monkey', label: 'Spider monkey', group: 'primate', danger: 0.06, rare: 0.2, camouflage: 0.26 }),
    Object.freeze({ id: 'toucan', label: 'Toucan', group: 'bird', danger: 0.03, rare: 0.1, camouflage: 0.12 }),
    Object.freeze({ id: 'macaw', label: 'Macaw', group: 'bird', danger: 0.04, rare: 0.18, camouflage: 0.1 }),
    Object.freeze({ id: 'harpy-eagle', label: 'Harpy eagle', group: 'bird', danger: 0.66, rare: 0.84, camouflage: 0.36 }),
    Object.freeze({ id: 'bullet-ant', label: 'Bullet ant', group: 'insect', danger: 0.6, rare: 0.24, camouflage: 0.52 }),
    Object.freeze({ id: 'tarantula', label: 'Tarantula', group: 'insect', danger: 0.46, rare: 0.34, camouflage: 0.88 }),
    Object.freeze({ id: 'morpho-butterfly', label: 'Morpho butterfly', group: 'insect', danger: 0, rare: 0.12, camouflage: 0.08 }),
    Object.freeze({ id: 'poison-dart-frog', label: 'Poison-dart frog', group: 'amphibian', danger: 0.72, rare: 0.56, camouflage: 0.5 }),
    Object.freeze({ id: 'leaf-mimic-frog', label: 'Leaf-mimic frog', group: 'amphibian', danger: 0.08, rare: 0.34, camouflage: 0.98 }),
    Object.freeze({ id: 'tree-frog', label: 'Tree frog', group: 'amphibian', danger: 0.02, rare: 0.1, camouflage: 0.66 }),
    Object.freeze({ id: 'giant-otter', label: 'Giant otter', group: 'large', danger: 0.5, rare: 0.6, camouflage: 0.2 }),
    Object.freeze({ id: 'tapir', label: 'Tapir', group: 'large', danger: 0.24, rare: 0.28, camouflage: 0.38 }),
    Object.freeze({ id: 'agouti', label: 'Agouti', group: 'small', danger: 0.03, rare: 0.08, camouflage: 0.48 }),
]);

export const JUNGLE_FAUNA_GROUPS = Object.freeze([...new Set(JUNGLE_FAUNA.map(entry => entry.group))]);

function resourceGroupsFor(values) {
    const result = {};
    for (const [key, ids] of Object.entries(JUNGLE_RESOURCE_GROUPS)) {
        const threshold = key === 'hiddenRareResources' ? 0.38
            : key === 'poisonsExtracts' ? 0.4
                : key === 'spicesRareProducts' ? 0.36 : 0.2;
        const abundance = clamp01(values[key] - threshold) / Math.max(0.01, 1 - threshold);
        result[key] = abundance > 0.05
            ? ids.filter(id => TROPICAL_GOODS[id]).map(id => ({ id, abundance: round(abundance) }))
            : [];
    }
    return Object.freeze(result);
}

// Derive the whole 1.2.5 contract from the existing stand. Every branch is a
// pure function of seed, tile and stand inputs, so the same world always
// yields the same thicket, trail, ambush lane and hidden glade.
export function jungleProfileFor(input = {}) {
    const seed = Number(input.seed) || 1;
    const x = Number(input.x) || 0;
    const y = Number(input.y) || 0;
    const formationId = input.formationId || 'tropical-canopy';
    const look = formationLook[formationId] || formationLook['tropical-canopy'];
    const ageClass = input.ageClass || 'mature';
    const moisture = clamp01(input.moisture ?? 0.84);
    const temperature = clamp01(input.temperature ?? 0.84);
    const height = clamp01(input.height ?? 0.45);
    const canopy = clamp01(input.canopy ?? TROPICAL_FORMATIONS[formationId]?.density ?? 0.84);
    const density = clamp01(input.density ?? look.density);
    const clearing = clamp01(input.clearing ?? 0);
    const edge = Boolean(input.edge);
    const stockRatio = clamp01(input.stockRatio ?? 1);
    const ancient = ageClass === 'ancient' || formationId === 'tropical-ancient';
    const young = ageClass === 'young' || ['tropical-gap', 'tropical-secondary', 'tropical-plantation'].includes(formationId);
    const species = Array.isArray(input.species) ? input.species : [];
    const wet = clamp01((moisture - 0.5) / 0.45 + look.water * 0.3);
    const hillside = clamp01((height - 0.42) / 0.42);
    const open = clamp01(clearing * 1.25 + (formationId === 'tropical-gap' ? 0.5 : 0));
    const gapPatch = coarse(seed, x, y, 6, 0x4a474c47);
    const gladePatch = coarse(seed, x, y, 5, 0x474c4144);
    const ravinePatch = coarse(seed, x, y, 7, 0x52415649);
    const rockPatch = coarse(seed, x, y, 6, 0x524f434b);
    const trailPatch = coarse(seed, x, y, 8, 0x54524149);
    const streamPatch = coarse(seed, x, y, 9, 0x5354524d);
    const bambooShare = species.filter(id => id === 'bamboo').length / Math.max(1, species.length);
    const palmShare = species.filter(id => id === 'palm').length / Math.max(1, species.length);
    const giantFern = clamp01(0 + (formationId === 'tropical-montane' ? 0.72 : 0.16) + wet * 0.24);
    const ravine = Boolean(hillside > 0.42 && ravinePatch > 0.52);
    const rockOutcrop = Boolean((height > 0.68 && rockPatch > 0.48) || rockPatch > 0.9);
    const hiddenStream = Boolean(wet > 0.6 && streamPatch > 0.4);
    const waterfall = Boolean(hiddenStream && hillside > 0.46 && unit(seed, x, y, 0x46414c4c) > 0.52);
    const flooded = Boolean(look.water > 0.6 || (wet > 0.82 && gapPatch > 0.4));
    const clearingSpot = Boolean(open > 0.35 || (gapPatch > 0.86 && open > 0.12));
    const hiddenGlade = Boolean(!clearingSpot && gladePatch > 0.82 && (ancient || ravine || wet > 0.66));
    const animalTrail = Boolean(trailPatch > 0.67 || (edge && trailPatch > 0.52));
    const passage = Boolean(animalTrail || clearingSpot || (ravine && ravinePatch > 0.7));
    const viewpoint = Boolean(clearingSpot && hillside > 0.38 || (hiddenGlade && hillside > 0.6));
    const vegetationWall = Boolean(density > 0.72 && !passage && !clearingSpot);
    const impenetrable = clamp01(density * 0.52 + open * -0.26 + (vegetationWall ? 0.2 : 0)
        + (formationId === 'tropical-bamboo' ? 0.28 : 0) + (ravine ? 0.08 : 0));
    const sightRangeVariety = clamp01(0.38 + hillside * 0.2 + open * 0.3 + (1 - density) * 0.22
        + (viewpoint ? 0.12 : 0));
    const movementPenalty = clamp01(0.2 + impenetrable * 0.52 + (flooded ? 0.14 : 0)
        + (ravine ? 0.1 : 0) + (bambooShare + (formationId === 'tropical-bamboo' ? 0.55 : 0)) * 0.12);
    const sightRestriction = clamp01(0.28 + density * 0.38 + impenetrable * 0.24
        + (vegetationWall ? 0.12 : 0) - open * 0.34 + (wet ? 0.05 : 0));
    const navigationDifficulty = clamp01(movementPenalty * 0.62 + sightRestriction * 0.28
        + (impenetrable > 0.68 ? 0.12 : 0));
    const disease = clamp01(0.26 + wet * 0.38 + density * 0.12 + (flooded ? 0.12 : 0));
    const parasites = clamp01(0.34 + wet * 0.3 + density * 0.16 + (impenetrable > 0.6 ? 0.08 : 0));
    const predator = clamp01(0.26 + (ancient ? 0.24 : 0) + impenetrable * 0.16
        + (formationId === 'tropical-swamp' ? 0.12 : 0));
    const camouflage = clamp01(0.26 + impenetrable * 0.42 + density * 0.16 + (ancient ? 0.1 : 0));
    const poisonous = clamp01(0.4 + wet * 0.2 + (formationId === 'tropical-swamp' ? 0.16 : 0));
    const fruiting = clamp01(0.48 + wet * 0.2 + (young ? 0.12 : 0) + (formationId === 'tropical-floodplain' ? 0.12 : 0));
    const rarePlant = clamp01(0.08 + (ancient ? 0.3 : 0) + (formationId === 'tropical-montane' ? 0.2 : 0)
        + (hiddenGlade ? 0.18 : 0) + (ravine ? 0.1 : 0));
    const bambooFeature = clamp01((formationId === 'tropical-bamboo' ? 0.86 : 0.06) + bambooShare * 0.6
        + (gapPatch > 0.9 ? 0.12 : 0));
    const thicket = clamp01(0.42 + density * 0.38 + (young ? 0.12 : 0) - open * 0.2);
    const vine = clamp01(0.3 + canopy * 0.3 + wet * 0.22 + (ancient ? 0.08 : 0));
    const largeLeaf = clamp01(0.4 + wet * 0.22 + density * 0.18 + (formationId === 'tropical-gap' ? 0.16 : 0));
    const ferns = clamp01(0.42 + wet * 0.28 + (formationId === 'tropical-montane' ? 0.2 : 0));
    const thorn = clamp01(0.12 + open * 0.22 + (young ? 0.12 : 0) + (formationId === 'tropical-secondary' ? 0.2 : 0));
    const heightLayers = clamp01(0.52 + canopy * 0.22 + density * 0.18 + (ancient ? 0.08 : 0));
    const openPatches = clamp01(open * 0.8 + (gapPatch > 0.82 ? 0.18 : 0) + (clearingSpot ? 0.12 : 0));
    const passages = clamp01(passage ? 0.78 : 0.12 + open * 0.2 + (animalTrail ? 0.25 : 0));
    const glades = clamp01(hiddenGlade ? 0.92 : 0.06 + (ancient ? 0.12 : 0));
    const trails = clamp01(animalTrail ? 0.88 : 0.08 + (edge ? 0.12 : 0));
    const walls = clamp01(vegetationWall ? 0.86 : 0.2 + impenetrable * 0.32);
    const streamsHollows = clamp01(hiddenStream ? 0.9 : 0.08 + wet * 0.18 + (ravine ? 0.16 : 0));
    const bambooForests = clamp01(bambooFeature * 0.82 + (formationId === 'tropical-bamboo' ? 0.12 : 0));
    const giantFerns = giantFern;
    const climbingVines = clamp01(vine * 0.9 + (canopy > 0.8 ? 0.1 : 0));
    const thornPlants = clamp01(thorn * 0.88 + (open > 0.4 ? 0.12 : 0));
    const broadLeafShrubs = clamp01(largeLeaf * 0.7 + density * 0.2);
    const poisonousPlants = clamp01(poisonous * 0.86 + (formationId === 'tropical-swamp' ? 0.14 : 0));
    const fruitingPlants = clamp01(fruiting * 0.8 + (young ? 0.12 : 0));
    const rarePlants = clamp01(rarePlant * 0.82 + (hiddenGlade ? 0.12 : 0));
    const hillsideDense = clamp01(hillside * density * 1.12);
    const wetHollows = clamp01(wet * 0.5 + (hiddenStream ? 0.28 : 0) + (ravine ? 0.12 : 0));
    const ravines = clamp01(ravine ? 0.92 : 0.05 + hillside * 0.12);
    const rockOutcrops = clamp01(rockOutcrop ? 0.94 : 0.06 + hillside * 0.18);
    const waterfalls = clamp01(waterfall ? 0.98 : 0.03 + (hiddenStream ? 0.1 : 0));
    const floodedJungle = clamp01(flooded ? 0.94 : 0.04 + wet * 0.16);
    const rockPassages = clamp01((passage ? 0.5 : 0.12) + (rockOutcrop ? 0.28 : 0) + (ravine ? 0.12 : 0));
    const clearings = clamp01(clearingSpot ? 0.92 : 0.06 + open * 0.2);
    const predators = clamp01(predator * 0.86 + (ancient ? 0.12 : 0));
    const reptiles = clamp01(0.38 + wet * 0.3 + (ravine ? 0.12 : 0));
    const monkeys = clamp01(0.52 + canopy * 0.3);
    const birds = clamp01(0.55 + canopy * 0.24 + (edge ? 0.08 : 0));
    const insects = clamp01(0.64 + wet * 0.22 + (ancient ? 0.06 : 0));
    const amphibians = clamp01(0.38 + wet * 0.4 + (hiddenStream ? 0.08 : 0));
    const camouflaged = clamp01(0.28 + camouflage * 0.5 + (ancient ? 0.12 : 0));
    const rareDanger = clamp01(0.1 + (ancient ? 0.24 : 0) + (formationId === 'tropical-swamp' ? 0.2 : 0)
        + (hiddenGlade ? 0.16 : 0) + predators * 0.12);
    const fruits = clamp01(0.52 + fruiting * 0.26);
    const timber = clamp01(0.58 + (species.filter(id => ['mahogany', 'ironwood', 'rosewood', 'brazil-nut', 'sandalwood', 'kapok'].includes(id)).length / 6) * 0.32);
    const fibres = clamp01(0.48 + (species.includes('palm') ? 0.16 : 0) + (species.includes('bamboo') ? 0.2 : 0)
        + (species.includes('rubber') ? 0.12 : 0));
    const medicinal = clamp01(0.46 + wet * 0.2 + (formationId === 'tropical-montane' ? 0.18 : 0)
        + (ancient ? 0.08 : 0));
    const poisons = clamp01(poisonous * 0.78 + (formationId === 'tropical-swamp' ? 0.16 : 0));
    const spices = clamp01(0.24 + (species.includes('cacao') ? 0.2 : 0) + (formationId === 'tropical-plantation' ? 0.24 : 0)
        + (young ? 0.08 : 0));
    const hunting = clamp01(0.72 + predators * 0.12 + (animalTrail ? 0.1 : 0));
    const hiddenRare = clamp01(0.08 + (hiddenGlade ? 0.36 : 0) + (ancient ? 0.24 : 0)
        + (ravine ? 0.12 : 0) + (rockOutcrop ? 0.08 : 0));
    const movementCost = movementPenalty;
    const sightRestrictionValue = sightRestriction;
    const navigationDifficultyValue = navigationDifficulty;
    const ambush = clamp01(impenetrable * 0.42 + sightRestriction * 0.2 + (animalTrail ? 0.12 : 0)
        + (vegetationWall ? 0.14 : 0));
    const diseaseParasites = clamp01((disease + parasites) * 0.5 + (flooded ? 0.08 : 0));
    const supplyDifficulty = clamp01(movementPenalty * 0.34 + sightRestriction * 0.18
        + (1 - (passage ? 0.35 : 0)) * 0.2 + (flooded ? 0.12 : 0));
    const local = clamp01(0.18 + trails * 0.26 + passages * 0.2 + (animalTrail ? 0.1 : 0)
        + (1 - navigationDifficulty) * 0.12);
    const guerrilla = clamp01(0.22 + impenetrable * 0.28 + ambush * 0.26 + sightRestriction * 0.14
        + (vegetationWall ? 0.1 : 0));

    const values = {
        massiveThickets: thicket, denseVines: vine, largeLeafPlants: largeLeaf, bambooStands: bambooFeature,
        fernsClimbers: ferns, thornBushes: thorn, vegetationHeightLayers: heightLayers,
        smallOpenPatches: openPatches, sightRangeVariety, impenetrableUndergrowth: impenetrable,
        naturalPassages: passages, hiddenGlades: glades, animalTrails: trails, vegetationWalls: walls,
        hiddenStreamsHollows: streamsHollows, bambooForests, giantFerns, climbingVines,
        thornPlants, broadLeavesShrubs: broadLeafShrubs, poisonousIrritantPlants: poisonousPlants,
        fruitingPlants, rareFantasticPlants: rarePlants, hillsideDenseVegetation: hillsideDense,
        wetHollows, smallRavines: ravines, rockOutcrops, hiddenWaterfalls: waterfalls,
        floodedJungle, rockPlantPassages: rockPassages, clearingsViewpoints: clearings,
        largePredators: predators, snakesLizards: reptiles, monkeysArboreal: monkeys,
        tropicalBirds: birds, insectsSpiders: insects, amphibians, camouflagedAnimals: camouflaged,
        rareDangerousSpecies: rareDanger, fruitsNuts: fruits, tropicalTimber: timber,
        fibresPlantMaterials: fibres, medicinalPlants: medicinal, poisonsExtracts: poisons,
        spicesRareProducts: spices, huntingGathering: hunting, hiddenRareResources: hiddenRare,
        movementCost, sightRestriction: sightRestrictionValue, navigationDifficulty: navigationDifficultyValue,
        ambushesSurprise: ambush, diseaseParasites, supplyDifficulty, localAdvantage: local,
        guerrillaDefence: guerrilla,
    };

    const features = Object.fromEntries(JUNGLE_POINTS.map(entry => [entry.id, round(values[entry.key])]));
    const points = JUNGLE_POINTS.map(entry => ({
        id: entry.id, key: entry.key, label: entry.label, value: features[entry.id],
    }));
    const layer = (id, label, lowMeters, highMeters, densityValue) => Object.freeze({
        id, label, lowMeters, highMeters, heightMeters: Math.round(((lowMeters + highMeters) / 2) * 10) / 10,
        density: round(densityValue),
    });
    const layers = Object.freeze([
        layer('floor', 'Moss, litter and seedlings', 0, 0.4, 0.56 + wet * 0.2),
        layer('herb', 'Ferns, herbs and thorn scrub', 0.3, 1.4, thicket * 0.86),
        layer('shrub', 'Dense shrubs and broadleaf plants', 1, 3.4, largeLeaf * 0.96),
        layer('understorey', 'Saplings, vines and bamboo', 2.4, 8, heightLayers * 0.82),
        layer('lower', 'Lower tree crowns', 7, 16, canopy * 0.7),
        layer('canopy', 'Main canopy and lianas', 14, 32, canopy),
        layer('emergent', 'Emergent crowns and viewpoints', 28, 48, clamp01(ancient ? 0.62 : 0.32)),
    ]);
    const resources = resourceGroupsFor(values);
    const visibleFauna = JUNGLE_FAUNA.filter(entry => {
        if (entry.group === 'predator' && predators < 0.28) return false;
        if (entry.group === 'reptile' && reptiles < 0.34) return false;
        if (entry.group === 'amphibian' && amphibians < 0.32) return false;
        if (entry.rare > 0.7 && rareDanger < 0.32) return false;
        if (entry.camouflage > 0.9 && camouflaged < 0.38) return false;
        return true;
    }).map(entry => ({ ...entry, abundance: round(Math.max(0.05, predators * 0.5 + camouflaged * 0.2 + 0.1)) }));
    const landscape = Object.freeze({
        type: formationId,
        label: look.label,
        hillside: round(hillside),
        ravine, rockOutcrop, hiddenStream, waterfall, flooded,
        clearing: clearingSpot, hiddenGlade, animalTrail, passage, viewpoint, vegetationWall,
        denseWall: round(walls),
        openPatches: round(openPatches),
        sightRangeMeters: Math.round((4 + (1 - sightRestriction) * 44) * 10) / 10,
    });
    const navigation = Object.freeze({
        movementFactor: Math.round((1 + movementPenalty * 1.25) * 100) / 100,
        movementPenalty: round(movementPenalty),
        sightRadiusTiles: Math.max(2, Math.round(10 - sightRestriction * 7.5)),
        visibilityPenalty: round(sightRestriction),
        ambushChance: round(ambush),
        surpriseChance: round(clamp01(ambush * 0.72 + local * 0.12)),
        supplyFactor: Math.round((1 - supplyDifficulty * 0.58) * 100) / 100,
        localAdvantage: round(local),
        guerrillaBonus: round(guerrilla),
        defenceBonus: round(clamp01(guerrilla * 0.62 + coverValue(impenetrable, vegetationWall))),
        disease: round(disease),
        parasites: round(parasites),
    });
    const hazards = Object.freeze({
        disease: round(disease), parasites: round(parasites), poison: round(poisons),
        predators: round(predators), thorns: round(thorn), flood: round(floodedJungle),
        diseaseLabel: flooded ? 'flood fever and parasites' : 'jungle fever and parasites',
        workPenalty: round(0.16 + movementPenalty * 0.34 + diseaseParasites * 0.12),
    });
    const summary = [
        look.label,
        Math.round(navigation.movementPenalty * 100) + '% movement penalty',
        navigation.sightRadiusTiles + ' tile sight',
        Math.round(navigation.ambushChance * 100) + '% ambush',
        hiddenGlade ? 'hidden glade' : clearingSpot ? 'open clearing' : 'closed wall',
    ].join(' · ');
    return Object.freeze({
        climate: 'tropical',
        formation: formationId,
        features, points, layers, landscape, navigation, fauna: Object.freeze(visibleFauna),
        resources, hazards, summary,
        type: formationId === 'tropical-bamboo' ? 'bamboo wall'
            : flooded ? 'flooded jungle'
                : ravine ? 'ravine jungle'
                    : rockOutcrop ? 'rock outcrop jungle'
                        : hiddenGlade ? 'hidden glade'
                            : formationId === 'tropical-ancient' ? 'old-growth jungle' : 'closed jungle',
    });
}

function coverValue(impenetrable, wall) {
    return clamp01(impenetrable * 0.35 + (wall ? 0.24 : 0));
}

// Compact helper for combat and travel code. It intentionally accepts a stand
// rather than rebuilding one, so callers never pay for a second ecology pass.
export function jungleTacticsFromStand(stand) {
    return stand?.jungle?.navigation || null;
}

export const __internals = Object.freeze({ hash32, unit, coarse });
