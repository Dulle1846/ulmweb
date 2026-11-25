// Forest stand dynamics — 1.2.23.1.061–090.
//
// This module is a pure extension of the shared forest-stand contract. It does
// not own a second map, save schema or renderer. `forestDynamicsFor()` turns the
// species actually present on a tile into age phase, seed source, genetic
// breadth, site fitness, disturbance regime, silvicultural system, stand
// structure and soil/mycorrhiza values. The same record is read by the stand,
// the resource node, gathering, the atlas and the inspector.
//
// Trait order:
// pioneer, shade, drought, wet, disease, fire, wind, root, litter,
// mycorrhiza, coppice, graze, longevity, cold

const TRAIT_KEYS = Object.freeze([
    'pioneer', 'shade', 'drought', 'wet', 'disease', 'fire', 'wind', 'root',
    'litter', 'mycorrhiza', 'coppice', 'graze', 'longevity', 'cold',
]);

const DEFAULT_TRAITS = Object.freeze({
    pioneer: 0.4, shade: 0.5, drought: 0.5, wet: 0.5, disease: 0.5, fire: 0.4,
    wind: 0.5, root: 0.5, litter: 0.5, mycorrhiza: 0.8, coppice: 0.3,
    graze: 0.3, longevity: 0.6, cold: 0.5,
});

const RAW_TRAITS = Object.freeze({
    oak: [0.22, 0.58, 0.72, 0.42, 0.76, 0.78, 0.82, 0.90, 0.72, 0.92, 0.55, 0.62, 0.95, 0.55],
    beech: [0.08, 0.94, 0.38, 0.38, 0.55, 0.32, 0.55, 0.62, 0.80, 0.90, 0.35, 0.25, 0.90, 0.50],
    birch: [0.96, 0.15, 0.62, 0.52, 0.55, 0.55, 0.62, 0.50, 0.68, 0.70, 0.70, 0.45, 0.35, 0.88],
    maple: [0.30, 0.74, 0.38, 0.52, 0.60, 0.38, 0.55, 0.65, 0.75, 0.88, 0.60, 0.30, 0.70, 0.55],
    chestnut: [0.35, 0.50, 0.58, 0.35, 0.45, 0.48, 0.60, 0.75, 0.66, 0.85, 0.80, 0.50, 0.80, 0.35],
    linden: [0.30, 0.62, 0.45, 0.52, 0.58, 0.38, 0.60, 0.70, 0.78, 0.88, 0.55, 0.55, 0.85, 0.55],
    elm: [0.35, 0.55, 0.40, 0.70, 0.22, 0.32, 0.55, 0.72, 0.78, 0.86, 0.60, 0.50, 0.80, 0.55],
    alder: [0.72, 0.35, 0.15, 0.96, 0.60, 0.18, 0.45, 0.75, 0.55, 0.78, 0.85, 0.40, 0.55, 0.75],
    ash: [0.45, 0.42, 0.45, 0.80, 0.30, 0.32, 0.55, 0.80, 0.70, 0.85, 0.70, 0.55, 0.75, 0.55],
    hornbeam: [0.30, 0.86, 0.50, 0.55, 0.60, 0.42, 0.60, 0.65, 0.72, 0.90, 0.96, 0.40, 0.80, 0.55],
    rowan: [0.82, 0.30, 0.60, 0.45, 0.55, 0.38, 0.50, 0.50, 0.65, 0.80, 0.60, 0.60, 0.40, 0.88],
    hazel: [0.78, 0.50, 0.50, 0.45, 0.55, 0.48, 0.50, 0.45, 0.70, 0.90, 0.98, 0.55, 0.45, 0.70],
    willow: [0.92, 0.25, 0.20, 0.96, 0.55, 0.22, 0.35, 0.60, 0.55, 0.70, 0.95, 0.60, 0.45, 0.70],
    spruce: [0.30, 0.75, 0.25, 0.45, 0.35, 0.32, 0.25, 0.45, 0.25, 0.85, 0.15, 0.20, 0.80, 0.90],
    fir: [0.20, 0.86, 0.30, 0.40, 0.40, 0.28, 0.30, 0.55, 0.30, 0.85, 0.15, 0.20, 0.90, 0.85],
    pine: [0.70, 0.25, 0.88, 0.30, 0.40, 0.82, 0.70, 0.80, 0.30, 0.80, 0.20, 0.35, 0.85, 0.80],
    larch: [0.80, 0.35, 0.65, 0.45, 0.45, 0.55, 0.65, 0.70, 0.50, 0.75, 0.20, 0.35, 0.70, 0.95],
    juniper: [0.80, 0.20, 0.88, 0.35, 0.65, 0.55, 0.75, 0.75, 0.35, 0.65, 0.30, 0.55, 0.80, 0.95],
    yew: [0.25, 0.96, 0.55, 0.45, 0.75, 0.50, 0.60, 0.65, 0.40, 0.90, 0.35, 0.25, 0.95, 0.70],
    'dwarf-pine': [0.85, 0.20, 0.70, 0.55, 0.60, 0.50, 0.82, 0.50, 0.25, 0.70, 0.25, 0.40, 0.50, 0.98],
    kapok: [0.60, 0.30, 0.50, 0.55, 0.55, 0.28, 0.35, 0.55, 0.60, 0.95, 0.30, 0.20, 0.70, 0.20],
    mahogany: [0.20, 0.76, 0.50, 0.50, 0.60, 0.32, 0.60, 0.70, 0.65, 0.90, 0.30, 0.15, 0.90, 0.20],
    'brazil-nut': [0.10, 0.86, 0.40, 0.60, 0.55, 0.22, 0.45, 0.75, 0.70, 0.95, 0.20, 0.10, 0.95, 0.15],
    rubber: [0.50, 0.50, 0.35, 0.65, 0.50, 0.22, 0.45, 0.60, 0.65, 0.90, 0.50, 0.20, 0.60, 0.15],
    cacao: [0.40, 0.90, 0.20, 0.70, 0.35, 0.18, 0.30, 0.40, 0.70, 0.95, 0.50, 0.10, 0.50, 0.10],
    balsa: [0.96, 0.20, 0.30, 0.78, 0.40, 0.18, 0.25, 0.35, 0.65, 0.80, 0.70, 0.20, 0.30, 0.15],
    fig: [0.50, 0.60, 0.50, 0.55, 0.55, 0.28, 0.45, 0.70, 0.70, 0.95, 0.40, 0.20, 0.80, 0.20],
    palm: [0.55, 0.40, 0.50, 0.60, 0.50, 0.32, 0.35, 0.50, 0.60, 0.80, 0.40, 0.20, 0.60, 0.15],
    ironwood: [0.20, 0.70, 0.70, 0.45, 0.70, 0.50, 0.70, 0.80, 0.55, 0.85, 0.30, 0.20, 0.90, 0.25],
    rosewood: [0.25, 0.75, 0.45, 0.55, 0.55, 0.28, 0.50, 0.65, 0.65, 0.90, 0.30, 0.15, 0.85, 0.20],
    bamboo: [0.92, 0.30, 0.40, 0.62, 0.45, 0.38, 0.40, 0.35, 0.50, 0.70, 0.95, 0.30, 0.25, 0.20],
    mangosteen: [0.35, 0.86, 0.25, 0.70, 0.45, 0.18, 0.35, 0.45, 0.65, 0.90, 0.40, 0.15, 0.55, 0.15],
    sandalwood: [0.30, 0.60, 0.55, 0.40, 0.55, 0.32, 0.50, 0.60, 0.60, 0.85, 0.40, 0.20, 0.70, 0.25],
    acacia: [0.75, 0.30, 0.95, 0.25, 0.60, 0.65, 0.65, 0.90, 0.45, 0.80, 0.60, 0.70, 0.70, 0.35],
    camelthorn: [0.70, 0.35, 0.98, 0.20, 0.65, 0.55, 0.70, 0.95, 0.40, 0.75, 0.55, 0.65, 0.80, 0.40],
    marula: [0.55, 0.45, 0.85, 0.30, 0.55, 0.55, 0.60, 0.75, 0.55, 0.85, 0.50, 0.70, 0.80, 0.45],
    'fever-tree': [0.65, 0.35, 0.75, 0.55, 0.50, 0.35, 0.50, 0.75, 0.50, 0.80, 0.55, 0.50, 0.60, 0.50],
    baobab: [0.45, 0.25, 0.98, 0.30, 0.70, 0.60, 0.55, 0.90, 0.35, 0.75, 0.30, 0.60, 0.98, 0.55],
    nothofagus: [0.35, 0.70, 0.40, 0.65, 0.55, 0.28, 0.55, 0.60, 0.70, 0.90, 0.40, 0.30, 0.85, 0.55],
    podocarpus: [0.40, 0.76, 0.40, 0.60, 0.60, 0.28, 0.50, 0.60, 0.35, 0.85, 0.20, 0.25, 0.85, 0.45],
    treefern: [0.80, 0.60, 0.20, 0.85, 0.50, 0.12, 0.30, 0.40, 0.70, 0.80, 0.30, 0.15, 0.50, 0.25],
    redwood: [0.20, 0.62, 0.35, 0.70, 0.65, 0.32, 0.55, 0.70, 0.45, 0.85, 0.10, 0.10, 0.99, 0.45],
    sitka: [0.35, 0.66, 0.25, 0.65, 0.40, 0.28, 0.30, 0.50, 0.30, 0.80, 0.15, 0.15, 0.80, 0.85],
    hemlock: [0.30, 0.92, 0.30, 0.60, 0.40, 0.22, 0.35, 0.50, 0.35, 0.85, 0.15, 0.15, 0.80, 0.75],
    eucalyptus: [0.65, 0.35, 0.80, 0.45, 0.55, 0.90, 0.70, 0.90, 0.55, 0.80, 0.85, 0.30, 0.70, 0.35],
    'cork-oak': [0.30, 0.50, 0.85, 0.30, 0.78, 0.78, 0.70, 0.85, 0.65, 0.85, 0.70, 0.55, 0.90, 0.55],
    'holm-oak': [0.35, 0.60, 0.90, 0.30, 0.74, 0.70, 0.70, 0.85, 0.60, 0.85, 0.65, 0.55, 0.90, 0.50],
    'aleppo-pine': [0.80, 0.25, 0.95, 0.25, 0.50, 0.85, 0.70, 0.80, 0.30, 0.75, 0.25, 0.40, 0.70, 0.55],
    miombo: [0.50, 0.45, 0.75, 0.35, 0.55, 0.72, 0.55, 0.70, 0.55, 0.85, 0.80, 0.45, 0.60, 0.50],
    teak: [0.45, 0.55, 0.70, 0.45, 0.60, 0.50, 0.55, 0.75, 0.60, 0.85, 0.60, 0.35, 0.80, 0.30],
    sal: [0.40, 0.55, 0.65, 0.50, 0.55, 0.55, 0.55, 0.70, 0.60, 0.85, 0.70, 0.45, 0.80, 0.40],
    dipterocarp: [0.25, 0.70, 0.45, 0.60, 0.55, 0.28, 0.45, 0.65, 0.65, 0.95, 0.25, 0.15, 0.90, 0.20],
    mangrove: [0.55, 0.50, 0.25, 0.98, 0.65, 0.12, 0.70, 0.80, 0.60, 0.70, 0.40, 0.10, 0.70, 0.25],
    laurel: [0.30, 0.86, 0.35, 0.70, 0.60, 0.22, 0.50, 0.55, 0.70, 0.90, 0.45, 0.20, 0.80, 0.40],
    poplar: [0.92, 0.20, 0.35, 0.78, 0.40, 0.28, 0.35, 0.60, 0.60, 0.85, 0.90, 0.40, 0.45, 0.70],
    tamarisk: [0.70, 0.30, 0.90, 0.70, 0.65, 0.35, 0.65, 0.85, 0.45, 0.70, 0.65, 0.50, 0.60, 0.60],
});

const TRAITS = new Map(Object.entries(RAW_TRAITS).map(([id, values]) => [
    id, Object.freeze(Object.fromEntries(TRAIT_KEYS.map((key, index) => [key, values[index]]))),
]));

export const FOREST_DYNAMICS_SPECIES_IDS = Object.freeze(Object.keys(RAW_TRAITS));

export function speciesDynamicsTraits(id) {
    return TRAITS.get(String(id || '')) || DEFAULT_TRAITS;
}

export const FOREST_PHASES = Object.freeze(['pioneer', 'thicket', 'pole', 'mature', 'old-growth', 'climax']);
export const FOREST_MANAGEMENT_SYSTEMS = Object.freeze({
    coppice: Object.freeze({ label: 'Niederwald', rotation: 18, timber: 0.90, regeneration: 1.12, note: 'short coppice rotation' }),
    'coppice-with-standards': Object.freeze({ label: 'Mittelwald', rotation: 30, timber: 0.96, regeneration: 1.06, note: 'underwood and standards' }),
    'high-forest': Object.freeze({ label: 'Hochwald', rotation: 120, timber: 1.04, regeneration: 0.94, note: 'long timber rotation' }),
    selection: Object.freeze({ label: 'Plenterwald', rotation: 80, timber: 0.94, regeneration: 1.02, note: 'single-stem selection' }),
    'continuous-cover': Object.freeze({ label: 'Dauerwald', rotation: 110, timber: 0.98, regeneration: 1.08, note: 'permanent uneven cover' }),
    'wood-pasture': Object.freeze({ label: 'Waldweide', rotation: 140, timber: 0.82, regeneration: 0.80, note: 'grazed open woodland' }),
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value, min)));

function weighted(entries, total, key) {
    let sum = 0;
    for (const entry of entries) sum += entry.share * number(entry.traits[key], DEFAULT_TRAITS[key]);
    return total > 0 ? sum : number(DEFAULT_TRAITS[key], 0);
}

function largestEntry(entries) {
    let best = null;
    for (const entry of entries) if (!best || entry.share > best.share) best = entry;
    return best;
}

function systemFor(formationId, uses, canopy, ageClass, speciesDiversity) {
    if (formationId === 'coppice-with-standards') return 'coppice-with-standards';
    if (formationId === 'selection-forest' || uses.has('selection-felling')) return 'selection';
    if (formationId === 'mixed-open' || (uses.has('grazing') && canopy < 0.55)) return 'wood-pasture';
    if (uses.has('coppice')) return 'coppice';
    if ((formationId.startsWith('mixed') || formationId === 'alluvial') && speciesDiversity > 0.55
        && (ageClass === 'mature' || ageClass === 'ancient')) return 'continuous-cover';
    return 'high-forest';
}

export function forestDynamicsFor(context = {}) {
    const source = Array.isArray(context.species) ? context.species : [];
    const entries = source.map(entry => {
        const id = String(entry?.id || '');
        return {
            id,
            weight: Math.max(0, number(entry?.weight, 0)),
            traits: speciesDynamicsTraits(id),
        };
    }).filter(entry => entry.id && entry.weight > 0);
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    for (const entry of entries) entry.share = entry.weight / total;
    const speciesCount = entries.length;
    // A pure island is a real monodominant patch inside a mixed matrix. For the
    // ecology of that patch the island species owns 84% of the canopy; the
    // surrounding species remain as the matrix edge. This is how the atlas and
    // the player can see a genuine "pure stand" next to a mixed wood.
    const pureIsland = context.pureIsland && context.pureIsland.active ? context.pureIsland : null;
    const pureSpecies = pureIsland?.species && speciesDynamicsTraits(pureIsland.species)
        ? pureIsland.species : null;
    let effective = entries;
    if (pureSpecies) {
        const found = entries.some(entry => entry.id === pureSpecies);
        effective = entries.map(entry => ({
            ...entry,
            share: entry.id === pureSpecies ? 0.84 : entry.share * 0.16,
        }));
        if (!found) {
            effective.push({
                id: pureSpecies,
                weight: 0,
                traits: speciesDynamicsTraits(pureSpecies),
                share: 0.84,
            });
        }
    }
    const dominant = pureSpecies ? { id: pureSpecies } : largestEntry(entries);
    const dominantShare = pureSpecies ? 0.84
        : speciesCount <= 1 ? 1
            : clamp01(context.dominantShare ?? (dominant?.share || 0));
    const speciesDiversity = clamp01(context.speciesDiversity);
    const evenness = clamp01(context.evenness);
    const ageClass = String(context.ageClass || 'mature');
    const canopy = clamp01(context.canopy ?? 0.6);
    const density = clamp01(context.density ?? 0.6);
    const edge = Boolean(context.edge);
    const clearing = clamp01(context.clearing);
    const moisture = clamp01(context.moisture ?? 0.55);
    const temperature = clamp01(context.temperature ?? 0.55);
    const height = clamp01(context.height ?? 0.45);
    const coniferShare = clamp01(context.coniferShare);
    const broadleafShare = clamp01(context.broadleafShare ?? 1);
    const deadwood = clamp01(context.deadwood);
    const litter = clamp01(context.litter);
    const humus = clamp01(context.humus);
    const moss = clamp01(context.moss);
    const shrub = clamp01(context.shrub);
    const bramble = clamp01(context.bramble);
    const berry = clamp01(context.berry);
    const sapling = clamp01(context.sapling);
    const herb = clamp01(context.herb);
    const grass = clamp01(context.grass);
    const flowers = clamp01(context.flowers);
    const disturbance = context.disturbance || null;
    const succession = context.succession || null;
    const regionalType = context.regionalType || null;
    const tropical = context.tropical || null;
    const silviculture = Array.isArray(context.silviculture) ? context.silviculture : [];
    const formationId = String(context.formationId || '');
    const uses = new Set(silviculture);

    const pioneerRaw = weighted(effective, total, 'pioneer');
    const climaxRaw = weighted(effective, total, 'shade') * 0.45
        + (1 - pioneerRaw) * 0.55;
    const phaseTotal = pioneerRaw + climaxRaw || 1;
    const pioneerShare = clamp01(pioneerRaw / phaseTotal);
    const climaxShare = clamp01(climaxRaw / phaseTotal);
    const purity = dominantShare;
    const mixtureClass = pureSpecies || speciesCount <= 1 || purity >= 0.78 ? 'pure'
        : purity >= 0.58 ? 'dominant'
            : evenness >= 0.58 && speciesDiversity >= 0.55 ? 'even'
                : 'mixed';
    const pioneerSpecies = effective
        .filter(entry => entry.traits.pioneer >= 0.6)
        .sort((a, b) => b.share - a.share).slice(0, 3).map(entry => entry.id);
    const climaxSpecies = effective
        .filter(entry => entry.traits.pioneer <= 0.35 && entry.traits.shade >= 0.55)
        .sort((a, b) => b.share - a.share).slice(0, 3).map(entry => entry.id);
    const regionalIds = new Set(Object.keys(regionalType?.species || {}));
    const regionalShare = clamp01(entries.reduce((sum, entry) => sum + (regionalIds.has(entry.id) ? entry.share : 0), 0));
    const regionalSpecies = entries
        .filter(entry => regionalIds.has(entry.id))
        .sort((a, b) => b.share - a.share).slice(0, 4).map(entry => entry.id);

    const droughtTolerance = weighted(effective, total, 'drought');
    const wetTolerance = weighted(effective, total, 'wet');
    const coldTolerance = weighted(effective, total, 'cold');
    const rootDepth = weighted(effective, total, 'root');
    const litterQuality = weighted(effective, total, 'litter');
    const diseaseTolerance = weighted(effective, total, 'disease');
    const windFirmness = weighted(effective, total, 'wind');
    const grazeTolerance = weighted(effective, total, 'graze');
    const longevity = weighted(effective, total, 'longevity');
    const mycorrhizaAffinity = weighted(effective, total, 'mycorrhiza');

    const droughtStress = clamp01((1 - moisture) * 1.12 - droughtTolerance * 0.72 - rootDepth * 0.10);
    const wetStress = clamp01(moisture * 1.04 - wetTolerance * 0.78);
    const coldStress = clamp01(0.48 - temperature + Math.max(0, height - 0.5) * 0.42 - coldTolerance * 0.55);
    const siteFitness = clamp01(1 - (droughtStress * 0.55 + wetStress * 0.50 + coldStress * 0.55));

    const ageMother = ageClass === 'ancient' ? 0.78 : ageClass === 'mature' ? 0.45 : 0.14;
    const motherTrees = clamp01(ageMother + dominantShare * 0.14
        + (stockRatioValue(context.stockRatio) > 0.5 ? 0.04 : -0.08) - (disturbance ? 0.14 : 0));
    const geneticDiversity = clamp01(speciesDiversity * 0.50 + evenness * 0.22
        + (1 - purity) * 0.12 + (edge ? 0.05 : 0) + (ageClass === 'ancient' ? 0.06 : 0)
        - (pureSpecies ? 0.18 : 0));
    const serotiny = effective.reduce((sum, entry) => sum
        + (['pine', 'aleppo-pine', 'eucalyptus', 'acacia', 'birch', 'poplar', 'willow', 'bamboo'].includes(entry.id)
            ? entry.share : 0), 0);
    const seedBank = clamp01(0.18 + pioneerShare * 0.35 + serotiny * 0.20 + litter * 0.12
        + (disturbance === 'burned' ? 0.18 : disturbance ? 0.08 : 0) + (1 - canopy) * 0.08);
    const seedQuality = clamp01(motherTrees * 0.45 + geneticDiversity * 0.35 + siteFitness * 0.20);
    const mycorrhiza = clamp01(mycorrhizaAffinity * 0.55 + humus * 0.20 + moss * 0.05
        + (ageClass === 'ancient' ? 0.12 : 0) + geneticDiversity * 0.08 - (disturbance ? 0.08 : 0));
    const naturalRegeneration = clamp01(seedBank * 0.32 + seedQuality * 0.30
        + mycorrhiza * 0.18 + siteFitness * 0.20);
    const decomposition = clamp01(litterQuality * 0.45 + moisture * 0.22
        + Math.max(0, temperature - 0.38) * 0.20 + 0.18 - coniferShare * 0.08);
    const humusForm = litterQuality >= 0.66 && moisture >= 0.45 ? 'Mull'
        : litterQuality <= 0.38 || coniferShare > 0.62 ? 'Mor' : 'Moder';
    const diseaseResistance = clamp01((diseaseTolerance * 0.55 + geneticDiversity * 0.20
        + mycorrhiza * 0.15 + siteFitness * 0.10) * (0.78 + canopy * 0.22));
    const pestFactor = clamp(1.34 - diseaseResistance * 0.56, 0.74, 1.30);

    const system = systemFor(formationId, uses, canopy, ageClass, speciesDiversity);
    const management = FOREST_MANAGEMENT_SYSTEMS[system];
    const rotationYears = Math.round(management.rotation * (0.78 + longevity * 0.44));
    const browsePressure = clamp01(grazeTolerance * 0.16 + (system === 'wood-pasture' ? 0.22 : 0)
        + (edge ? 0.03 : 0));
    const regenerationFactor = clamp(
        (0.70 + naturalRegeneration * 0.65) * management.regeneration,
        0.64, 1.40,
    );

    let phase = 'mature';
    const stage = succession?.stage || null;
    if (disturbance === 'burned' || disturbance === 'cutover' || disturbance === 'windthrow') phase = 'pioneer';
    else if (stage === 'fresh' || stage === 'regrowth') phase = 'pioneer';
    else if (stage === 'young') phase = 'thicket';
    else if (stage === 'recovering') phase = 'pole';
    else if (ageClass === 'young') phase = canopy < 0.46 ? 'thicket' : 'pole';
    else if (ageClass === 'ancient' && climaxShare >= 0.54) phase = 'climax';
    else if (ageClass === 'ancient' || (ageClass === 'mature' && deadwood >= 0.48 && climaxShare >= 0.48)) phase = 'old-growth';
    const phaseIndex = Math.max(0, FOREST_PHASES.indexOf(phase));

    const fuel = clamp01(litter * 0.5 + deadwood * 0.35 + coniferShare * 0.2);
    const fireWeight = clamp01((number(regionalType?.effects?.fire, 0) * 0.55)
        + (1 - moisture) * 0.25 + fuel * 0.20 + coniferShare * 0.10);
    const windWeight = clamp01((1 - windFirmness) * 0.55
        + Math.max(0, height - 0.5) * 0.25 + (1 - canopy) * 0.10);
    const iceWeight = clamp01((1 - temperature) * 0.55
        + Math.max(0, height - 0.5) * 0.30 + coniferShare * 0.10);
    const waterWeight = clamp01(number(regionalType?.effects?.flood, 0) * 0.60 + moisture * 0.25);
    const regimeWeights = [
        ['fire', fireWeight], ['wind', windWeight], ['ice', iceWeight], ['water', waterWeight],
    ];
    const regimeDominant = regimeWeights.slice().sort((a, b) => b[1] - a[1])[0];
    const regimeLabel = regimeDominant[1] < 0.28 ? 'Mixed regime'
        : regimeDominant[0] === 'fire' ? 'Fire-driven'
            : regimeDominant[0] === 'wind' ? 'Wind-driven'
                : regimeDominant[0] === 'ice' ? 'Ice and snow'
                    : 'Flood-driven';
    const fireRiskDelta = clamp(fuel * 0.10 + (1 - siteFitness) * 0.08 - rootDepth * 0.04, -0.04, 0.14);
    const windFactor = clamp(1.18 - windFirmness * 0.45, 0.78, 1.20);

    const shrubLayer = clamp01(shrub * 0.55 + bramble * 0.25 + berry * 0.30 + sapling * 0.20);
    const herbLayer = clamp01(herb * 0.50 + grass * 0.30 + flowers * 0.20
        + (edge ? 0.08 : 0) - canopy * 0.10);
    const tropicalLiana = number(tropical?.features?.['1.2.4.13'], 0);
    const tropicalEpiphyte = number(tropical?.features?.['1.2.4.14'], 0);
    const temperateLiana = clamp01((moisture - 0.45) * 0.50 + (ageClass === 'ancient' ? 0.18 : 0)
        + (edge ? 0.10 : 0) + broadleafShare * 0.12);
    const lianaCover = clamp01(tropical ? tropicalLiana * 0.70 + 0.08 : temperateLiana * 0.65);
    const epiphyteCover = clamp01(tropical ? tropicalEpiphyte * 0.75
        : ((moisture - 0.5) * 0.55 + moss * 0.20 + canopy * 0.15
            + (ageClass === 'ancient' ? 0.15 : 0)) * 0.70);
    const canopyGap = clamp01(clearing * 0.80 + (disturbance ? 0.12 : 0)
        + (ageClass === 'ancient' ? 0.05 : 0));
    const gapAge = Math.max(0, number(succession?.age, 0));
    const lightWoodland = canopy < 0.52 && herbLayer > 0.35;
    const edgeDiversity = edge
        ? clamp01(0.34 + speciesDiversity * 0.25 + shrubLayer * 0.15 + herbLayer * 0.15 + lianaCover * 0.10)
        : clamp01(speciesDiversity * 0.35 + herbLayer * 0.20 + lianaCover * 0.10);
    const layers = [canopy > 0.25, shrubLayer > 0.20, herbLayer > 0.20,
        lianaCover > 0.15, epiphyteCover > 0.15, deadwood > 0.20].filter(Boolean).length;
    const understoryLabel = context.understoryType
        || (grass > 0.34 ? 'Grass and herb layer'
            : bramble > 0.30 ? 'Bramble thicket'
                : shrub > 0.26 ? 'Shrub layer'
                    : 'Moss and litter floor');

    const goodsBoost = {
        herbs: clamp(0.82 + herbLayer * 0.38, 0.80, 1.25),
        mushrooms: clamp(0.82 + mycorrhiza * 0.38, 0.80, 1.25),
        lichen: clamp(0.85 + epiphyteCover * 0.30, 0.80, 1.20),
        moss: clamp(0.85 + epiphyteCover * 0.30, 0.80, 1.20),
        'willow-withies': clamp(0.85 + lianaCover * 0.30, 0.80, 1.20),
        rattan: clamp(0.85 + lianaCover * 0.35, 0.80, 1.25),
        orchids: clamp(0.80 + epiphyteCover * 0.40, 0.80, 1.25),
        game: clamp(0.90 + edgeDiversity * 0.18, 0.85, 1.15),
    };
    const extraGoods = [];
    if (herbLayer > 0.35) extraGoods.push('herbs');
    if (mycorrhiza > 0.52) extraGoods.push('mushrooms');
    if (epiphyteCover > 0.30) extraGoods.push('moss', 'lichen');
    if (lianaCover > 0.28) extraGoods.push(tropical ? 'rattan' : 'willow-withies');
    if (tropical && epiphyteCover > 0.45) extraGoods.push('orchids');

    return {
        composition: {
            speciesCount,
            purity,
            mixtureClass,
            pureIsland: pureSpecies,
            dominant: dominant?.id || null,
            dominantShare,
            evenness,
            speciesDiversity,
            pioneerShare,
            climaxShare,
            pioneerSpecies,
            climaxSpecies,
            regionalShare,
            regionalSpecies,
        },
        age: {
            class: ageClass,
            phase,
            phaseIndex,
            phases: FOREST_PHASES,
            rotationYears,
        },
        regeneration: {
            seedBank,
            motherTrees,
            motherTreesPerHa: Math.round(2 + motherTrees * 38),
            seedQuality,
            geneticDiversity,
            naturalRegeneration,
            factor: regenerationFactor,
            inbreedingRisk: clamp01(1 - geneticDiversity),
        },
        health: {
            diseaseResistance,
            siteFitness,
            droughtStress,
            wetStress,
            coldStress,
            pestFactor,
        },
        hazard: {
            fireRiskDelta,
            windFactor,
            regime: {
                fire: fireWeight,
                wind: windWeight,
                ice: iceWeight,
                water: waterWeight,
                dominant: regimeDominant[0],
                label: regimeLabel,
                rotationYears: Math.round(60 + (1 - regimeDominant[1]) * 160),
            },
        },
        silviculture: {
            system,
            label: management.label,
            rotationYears,
            timberFactor: management.timber,
            regenerationFactor: management.regeneration,
            browsePressure,
            woodPasture: system === 'wood-pasture',
            coppice: system === 'coppice' || system === 'coppice-with-standards',
            selection: system === 'selection',
            continuousCover: system === 'continuous-cover' || system === 'selection',
        },
        structure: {
            shrubLayer,
            saplingLayer: clamp01(sapling),
            herbLayer,
            medicinalHerbs: clamp01(herbLayer * 0.70 + moss * 0.10 + moisture * 0.10),
            lianaCover,
            epiphyteCover,
            canopyGap,
            gapAge,
            lightWoodland,
            edgeDiversity,
            layers,
            understoryLabel,
        },
        soil: {
            rootDepth,
            waterUptake: clamp01(rootDepth * 0.60 + (1 - droughtTolerance) * 0.15 + moisture * 0.15),
            litterQuality,
            humusForm,
            decomposition,
            mycorrhiza,
            mycorrhizaLabel: mycorrhiza >= 0.70 ? 'Old-growth network'
                : mycorrhiza >= 0.50 ? 'Well connected'
                    : mycorrhiza >= 0.32 ? 'Patchy' : 'Broken',
        },
        goods: { boost: goodsBoost, extra: [...new Set(extraGoods)] },
    };
}

function stockRatioValue(value) {
    return clamp01(value ?? 1);
}
