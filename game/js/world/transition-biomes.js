// Transition biomes / ecotones (spec 1.2.17.1–1.2.17.50).
//
// The world already has a continuous height/moisture/temperature field and
// continuous terrain colour. This module adds the named, playable edge between
// two habitats: a deterministic pair, width, stage, soil and vegetation mix.
// It is derived from the shared terrain and existing forest/land-use state, so
// it adds no second tile graph and no per-tick scan. The renderer samples it
// only on tiles it was already going to decorate; the baked preview reads the
// packed tint helper once per terrain pixel.
import { state } from "../core/state.js";

export const TRANSITION_VERSION = 1;

export const TRANSITION_REQUIREMENTS = Object.freeze([
    { id: "1.2.17.1", key: "wood-grassland", label: "Woodland-grassland transitions", labelDe: "Wald-Grasland-Übergänge", group: "pair" },
    { id: "1.2.17.2", key: "grassland-steppe", label: "Grassland-steppe transitions", labelDe: "Grasland-Steppen-Übergänge", group: "pair" },
    { id: "1.2.17.3", key: "steppe-semi-desert", label: "Steppe-semi-desert transitions", labelDe: "Steppen-Halbwüsten-Übergänge", group: "pair" },
    { id: "1.2.17.4", key: "semi-desert-desert", label: "Semi-desert-desert transitions", labelDe: "Halbwüsten-Wüsten-Übergänge", group: "pair" },
    { id: "1.2.17.5", key: "broadleaf-mixed", label: "Broadleaf-mixed woodland transitions", labelDe: "Laubwald-Mischwald-Übergänge", group: "pair" },
    { id: "1.2.17.6", key: "mixed-conifer", label: "Mixed-conifer woodland transitions", labelDe: "Mischwald-Nadelwald-Übergänge", group: "pair" },
    { id: "1.2.17.7", key: "conifer-taiga", label: "Conifer-taiga transitions", labelDe: "Nadelwald-Taiga-Übergänge", group: "pair" },
    { id: "1.2.17.8", key: "taiga-tundra", label: "Taiga-tundra transitions", labelDe: "Taiga-Tundra-Übergänge", group: "pair" },
    { id: "1.2.17.9", key: "forest-mountain", label: "Woodland-mountain transitions", labelDe: "Wald-Gebirge-Übergänge", group: "pair" },
    { id: "1.2.17.10", key: "mountain-snow", label: "Mountain-snow landscape transitions", labelDe: "Gebirge-Schneelandschaft-Übergänge", group: "pair" },
    { id: "1.2.17.11", key: "grassland-wetland", label: "Grassland-wetland transitions", labelDe: "Grasland-Feuchtgebiet-Übergänge", group: "pair" },
    { id: "1.2.17.12", key: "wetland-river", label: "Wetland-river landscape transitions", labelDe: "Feuchtgebiet-Flusslandschaft-Übergänge", group: "pair" },
    { id: "1.2.17.13", key: "coast-forest", label: "Coast-woodland transitions", labelDe: "Küstenregion-Wald-Übergänge", group: "pair" },
    { id: "1.2.17.14", key: "coast-dune", label: "Coast-dune transitions", labelDe: "Küstenregion-Dünenlandschaft-Übergänge", group: "pair" },
    { id: "1.2.17.15", key: "volcano-mountain", label: "Volcanic landscape-mountain transitions", labelDe: "Vulkanlandschaft-Gebirge-Übergänge", group: "pair" },
    { id: "1.2.17.16", key: "intermediate-stages", label: "Several intermediate stages between two biomes", labelDe: "Mehrere Zwischenstufen zwischen zwei Biomen", group: "shape" },
    { id: "1.2.17.17", key: "tree-density", label: "Slow change in tree density", labelDe: "Langsame Veränderung der Baumdichte", group: "vegetation" },
    { id: "1.2.17.18", key: "grass-height", label: "Change in grass height", labelDe: "Veränderung der Grashöhe", group: "vegetation" },
    { id: "1.2.17.19", key: "soil-colour", label: "Change in soil colour", labelDe: "Veränderung der Bodenfarbe", group: "soil" },
    { id: "1.2.17.20", key: "soil-moisture", label: "Change in soil moisture", labelDe: "Veränderung der Bodenfeuchtigkeit", group: "soil" },
    { id: "1.2.17.21", key: "shrub-tree-spread", label: "Changing distribution of shrubs and trees", labelDe: "Wechselnde Verteilung von Sträuchern und Bäumen", group: "vegetation" },
    { id: "1.2.17.22", key: "plant-species-mix", label: "Different plant species inside a transition zone", labelDe: "Unterschiedliche Pflanzenarten innerhalb einer Übergangszone", group: "vegetation" },
    { id: "1.2.17.23", key: "mixed-habitat", label: "Natural mixed areas with elements of both biomes", labelDe: "Natürliche Mischbereiche mit Elementen beider Biome", group: "vegetation" },
    { id: "1.2.17.24", key: "organic-boundary", label: "Irregular and organic boundaries", labelDe: "Unregelmäßige und organische Grenzen", group: "shape" },
    { id: "1.2.17.25", key: "woodland-steppe", label: "Woodland steppes", labelDe: "Waldsteppen", group: "landscape" },
    { id: "1.2.17.26", key: "humid-grassland", label: "Humid grasslands", labelDe: "Feuchte Graslandschaften", group: "landscape" },
    { id: "1.2.17.27", key: "dry-open-woodland", label: "Dry open woodlands", labelDe: "Trockene lichte Wälder", group: "landscape" },
    { id: "1.2.17.28", key: "bush-steppe", label: "Bush steppes", labelDe: "Buschsteppen", group: "landscape" },
    { id: "1.2.17.29", key: "woodland-tundra", label: "Woodland tundra", labelDe: "Waldtundra", group: "landscape" },
    { id: "1.2.17.30", key: "mountain-forest-line", label: "Mountain forest lines", labelDe: "Bergwaldgrenzen", group: "landscape" },
    { id: "1.2.17.31", key: "coastal-forest", label: "Coastal forests", labelDe: "Küstenwälder", group: "landscape" },
    { id: "1.2.17.32", key: "floodplain", label: "Floodplain landscapes", labelDe: "Auenlandschaften", group: "landscape" },
    { id: "1.2.17.33", key: "savanna-edge", label: "Savanna-like transition surfaces", labelDe: "Savannenartige Übergangsflächen", group: "landscape" },
    { id: "1.2.17.34", key: "bog-forest-mosaic", label: "Bog and woodland mosaics", labelDe: "Moor- und Waldmosaike", group: "landscape" },
    { id: "1.2.17.35", key: "no-straight-edges", label: "No visible straight biome borders", labelDe: "Keine sichtbaren geraden Biomgrenzen", group: "shape" },
    { id: "1.2.17.36", key: "varied-width", label: "Different transition widths", labelDe: "Unterschiedliche Übergangsbreiten", group: "shape" },
    { id: "1.2.17.37", key: "overlapping-vegetation", label: "Overlap of vegetation elements", labelDe: "Überlagerung von Vegetationselementen", group: "vegetation" },
    { id: "1.2.17.38", key: "natural-species-distribution", label: "Natural distribution of individual plant species", labelDe: "Natürliche Verteilung einzelner Pflanzenarten", group: "vegetation" },
    { id: "1.2.17.39", key: "biome-islands", label: "Small islands of the adjacent biome", labelDe: "Kleine Inseln des angrenzenden Bioms", group: "shape" },
    { id: "1.2.17.40", key: "soil-texture", label: "Different soil textures inside the transition zone", labelDe: "Unterschiedliche Bodentexturen innerhalb der Übergangszone", group: "soil" },
    { id: "1.2.17.41", key: "soft-gradients", label: "Soft colour gradients", labelDe: "Sanfte Farbverläufe", group: "visual" },
    { id: "1.2.17.42", key: "terrain-water-fit", label: "Adaptation to terrain forms and watercourses", labelDe: "Anpassung an Geländeformen und Wasserläufe", group: "shape" },
    { id: "1.2.17.43", key: "climate-change", label: "Change through long-term climate change", labelDe: "Veränderung durch langfristige Klimaveränderungen", group: "dynamic" },
    { id: "1.2.17.44", key: "forest-expansion", label: "Expansion of woodland areas", labelDe: "Ausbreitung von Waldflächen", group: "dynamic" },
    { id: "1.2.17.45", key: "steppeification", label: "Steppeification under sustained drought", labelDe: "Versteppung bei anhaltender Trockenheit", group: "dynamic" },
    { id: "1.2.17.46", key: "wetland-expansion", label: "Expansion of wetlands", labelDe: "Ausbreitung von Feuchtgebieten", group: "dynamic" },
    { id: "1.2.17.47", key: "post-fire", label: "Vegetation change after fires", labelDe: "Vegetationsveränderungen nach Bränden", group: "dynamic" },
    { id: "1.2.17.48", key: "logging-regrowth", label: "Regeneration after logging", labelDe: "Regeneration nach Rodung", group: "dynamic" },
    { id: "1.2.17.49", key: "grazing-change", label: "Change through overgrazing", labelDe: "Veränderungen durch Überweidung", group: "dynamic" },
    { id: "1.2.17.50", key: "magical-spread", label: "Expansion of fantastic or magical special biomes", labelDe: "Ausbreitung fantastischer oder magischer Sonderbiome", group: "dynamic" }
]);

export const TRANSITION_REQUIREMENT_IDS = Object.freeze(TRANSITION_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_KEY = Object.freeze(Object.fromEntries(TRANSITION_REQUIREMENTS.map(entry => [entry.key, entry])));

export const TRANSITION_PAIRS = Object.freeze([
    { id: "wood-grassland", requirement: 1, label: "Woodland–Grassland", labelDe: "Wald–Grasland", a: "woodland", b: "grassland", axis: "moisture", threshold: 0.44, width: 0.20, tint: [104, 139, 72], soil: [143, 137, 96], flora: ["oak", "birch", "hazel", "bramble", "fescue"] },
    { id: "grassland-steppe", requirement: 2, label: "Grassland–Steppe", labelDe: "Grasland–Steppe", a: "grassland", b: "steppe", axis: "moisture", threshold: 0.42, width: 0.18, tint: [159, 151, 91], soil: [171, 151, 103], flora: ["feather-grass", "fescue", "hawthorn", "juniper"] },
    { id: "steppe-semi-desert", requirement: 3, label: "Steppe–Semi-desert", labelDe: "Steppe–Halbwüste", a: "steppe", b: "semi-desert", axis: "moisture", threshold: 0.34, width: 0.14, tint: [184, 158, 101], soil: [190, 163, 113], flora: ["drought-grass", "sagebrush", "camelthorn"] },
    { id: "semi-desert-desert", requirement: 4, label: "Semi-desert–Desert", labelDe: "Halbwüste–Wüste", a: "semi-desert", b: "desert", axis: "moisture", threshold: 0.29, width: 0.10, tint: [205, 178, 126], soil: [211, 184, 135], flora: ["sand-grass", "succulent", "acacia"] },
    { id: "broadleaf-mixed", requirement: 5, label: "Broadleaf–Mixed Woodland", labelDe: "Laubwald–Mischwald", a: "broadleaf", b: "mixed", axis: "temperature", threshold: 0.55, width: 0.18, tint: [73, 108, 62], soil: [104, 99, 70], flora: ["oak", "beech", "hornbeam", "fern", "bluebell"] },
    { id: "mixed-conifer", requirement: 6, label: "Mixed–Conifer Woodland", labelDe: "Mischwald–Nadelwald", a: "mixed", b: "conifer", axis: "temperature", threshold: 0.42, width: 0.15, tint: [57, 90, 65], soil: [91, 88, 73], flora: ["pine", "spruce", "birch", "moss", "lichen"] },
    { id: "conifer-taiga", requirement: 7, label: "Conifer–Taiga", labelDe: "Nadelwald–Taiga", a: "conifer", b: "taiga", axis: "temperature", threshold: 0.40, width: 0.12, tint: [49, 78, 61], soil: [82, 84, 73], flora: ["spruce", "larch", "pine", "cowberry", "feather-moss"] },
    { id: "taiga-tundra", requirement: 8, label: "Taiga–Tundra", labelDe: "Taiga–Tundra", a: "taiga", b: "tundra", axis: "temperature", threshold: 0.27, width: 0.10, tint: [99, 113, 96], soil: [109, 112, 96], flora: ["dwarf-birch", "willow", "lichen", "cottongrass"] },
    { id: "forest-mountain", requirement: 9, label: "Woodland–Mountain", labelDe: "Wald–Gebirge", a: "woodland", b: "mountain", axis: "height", threshold: 0.68, width: 0.22, tint: [104, 113, 94], soil: [118, 110, 94], flora: ["pine", "mountain-ash", "juniper", "bluebell", "saxifrage"] },
    { id: "mountain-snow", requirement: 10, label: "Mountain–Snow", labelDe: "Gebirge–Schnee", a: "mountain", b: "snow", axis: "height", threshold: 0.88, width: 0.14, tint: [191, 204, 207], soil: [171, 177, 171], flora: ["saxifrage", "lichen", "alpine-grass"] },
    { id: "grassland-wetland", requirement: 11, label: "Grassland–Wetland", labelDe: "Grasland–Feuchtgebiet", a: "grassland", b: "wetland", axis: "moisture", threshold: 0.74, width: 0.15, tint: [89, 122, 86], soil: [88, 100, 73], flora: ["rush", "sedge", "marsh-marigold", "willow"] },
    { id: "wetland-river", requirement: 12, label: "Wetland–River", labelDe: "Feuchtgebiet–Flusslandschaft", a: "wetland", b: "river", axis: "height", threshold: 0.06, width: 0.06, tint: [76, 121, 105], soil: [91, 105, 82], flora: ["reed", "willow", "alder", "water-lily"] },
    { id: "coast-forest", requirement: 13, label: "Coast–Woodland", labelDe: "Küste–Wald", a: "coast", b: "woodland", axis: "height", threshold: 0.075, width: 0.09, tint: [78, 111, 77], soil: [153, 141, 106], flora: ["sea-buckthorn", "alder", "pine", "marram-grass"] },
    { id: "coast-dune", requirement: 14, label: "Coast–Dune", labelDe: "Küste–Düne", a: "coast", b: "dune", axis: "height", threshold: 0.035, width: 0.045, tint: [209, 190, 142], soil: [207, 190, 147], flora: ["marram-grass", "sea-holly", "sand-sedge"] },
    { id: "volcano-mountain", requirement: 15, label: "Volcanic–Mountain", labelDe: "Vulkan–Gebirge", a: "volcanic", b: "mountain", axis: "height", threshold: 0.52, width: 0.30, tint: [107, 92, 78], soil: [82, 78, 72], flora: ["pioneer-lichen", "moss", "volcanic-grass"] }
]);

export const TRANSITION_PAIR_IDS = Object.freeze(TRANSITION_PAIRS.map(pair => pair.id));
const PAIR_BY_ID = Object.freeze(Object.fromEntries(TRANSITION_PAIRS.map(pair => [pair.id, pair])));

export const TRANSITION_LANDSCAPES = Object.freeze({
    "woodland-steppe": { id: "woodland-steppe", requirement: 25, label: "Woodland Steppe", labelDe: "Waldsteppe" },
    "humid-grassland": { id: "humid-grassland", requirement: 26, label: "Humid Grassland", labelDe: "Feuchte Graslandschaft" },
    "dry-open-woodland": { id: "dry-open-woodland", requirement: 27, label: "Dry Open Woodland", labelDe: "Trockener lichter Wald" },
    "bush-steppe": { id: "bush-steppe", requirement: 28, label: "Bush Steppe", labelDe: "Buschsteppe" },
    "woodland-tundra": { id: "woodland-tundra", requirement: 29, label: "Woodland Tundra", labelDe: "Waldtundra" },
    "mountain-forest-line": { id: "mountain-forest-line", requirement: 30, label: "Mountain Forest Line", labelDe: "Bergwaldgrenze" },
    "coastal-forest": { id: "coastal-forest", requirement: 31, label: "Coastal Forest", labelDe: "Küstenwald" },
    "floodplain": { id: "floodplain", requirement: 32, label: "Floodplain", labelDe: "Auenlandschaft" },
    "savanna-edge": { id: "savanna-edge", requirement: 33, label: "Savanna Edge", labelDe: "Savannenrand" },
    "bog-forest-mosaic": { id: "bog-forest-mosaic", requirement: 34, label: "Bog–Forest Mosaic", labelDe: "Moor-Wald-Mosaik" }
});

export const TRANSITION_DYNAMICS = Object.freeze({
    "climate-change": { id: "climate-change", requirement: 43, label: "Long-term climate drift" },
    "forest-expansion": { id: "forest-expansion", requirement: 44, label: "Woodland expansion" },
    "steppeification": { id: "steppeification", requirement: 45, label: "Steppeification" },
    "wetland-expansion": { id: "wetland-expansion", requirement: 46, label: "Wetland expansion" },
    "post-fire": { id: "post-fire", requirement: 47, label: "Post-fire regeneration" },
    "logging-regrowth": { id: "logging-regrowth", requirement: 48, label: "Logging and regrowth" },
    "grazing-change": { id: "grazing-change", requirement: 49, label: "Grazing pressure" },
    "magical-spread": { id: "magical-spread", requirement: 50, label: "Magical atlas spread" }
});

// Gameplay reads the same named seam the renderer and survey use. Values are
// deliberately small multipliers/bonuses: an ecotone changes the margin, not
// the whole realm balance. `settlement` is a 0..1 suitability, `movement` is a
// speed factor (below 1 is slower), and the other numbers are additive yield
// modifiers. No value here is persisted; every caller derives it from terrain
// plus the existing forest/atlas state.
export const TRANSITION_GAMEPLAY = Object.freeze({
    "wood-grassland": Object.freeze({ farm: 0.05, forest: 0.03, forage: 0.10, pasture: 0.12, settlement: 0.68, movement: 1.00, tags: Object.freeze(["woodland", "grassland", "meadow", "edge"]), place: "the woodland edge" }),
    "grassland-steppe": Object.freeze({ farm: 0.02, forest: -0.02, forage: 0.06, pasture: 0.10, settlement: 0.58, movement: 1.02, tags: Object.freeze(["grassland", "steppe", "pasture", "dry"]), place: "the grassland steppe" }),
    "steppe-semi-desert": Object.freeze({ farm: -0.08, forest: -0.04, forage: 0.04, pasture: 0.04, settlement: 0.42, movement: 1.00, tags: Object.freeze(["steppe", "dry", "scrub"]), place: "the dry steppe margin" }),
    "semi-desert-desert": Object.freeze({ farm: -0.12, forest: -0.05, forage: 0.02, pasture: 0.01, settlement: 0.28, movement: 0.98, tags: Object.freeze(["arid", "desert", "scrub"]), place: "the desert margin" }),
    "broadleaf-mixed": Object.freeze({ farm: 0.02, forest: 0.04, forage: 0.08, pasture: 0.04, settlement: 0.62, movement: 0.96, tags: Object.freeze(["woodland", "forest", "temperate"]), place: "the mixed wood" }),
    "mixed-conifer": Object.freeze({ farm: -0.02, forest: 0.06, forage: 0.06, pasture: 0.02, settlement: 0.56, movement: 0.94, tags: Object.freeze(["forest", "conifer", "temperate"]), place: "the conifer edge" }),
    "conifer-taiga": Object.freeze({ farm: -0.06, forest: 0.08, forage: 0.05, pasture: 0.02, settlement: 0.48, movement: 0.92, tags: Object.freeze(["forest", "conifer", "taiga", "cold"]), place: "the taiga rim" }),
    "taiga-tundra": Object.freeze({ farm: -0.12, forest: 0.03, forage: 0.04, pasture: 0.04, settlement: 0.34, movement: 0.88, tags: Object.freeze(["taiga", "tundra", "cold"]), place: "the woodland tundra" }),
    "forest-mountain": Object.freeze({ farm: -0.08, forest: 0.10, forage: 0.03, pasture: 0.05, settlement: 0.32, movement: 0.82, tags: Object.freeze(["forest", "mountain", "upland"]), place: "the mountain tree line" }),
    "mountain-snow": Object.freeze({ farm: -0.15, forest: 0.02, forage: 0.01, pasture: 0.01, settlement: 0.16, movement: 0.78, tags: Object.freeze(["mountain", "snow", "cold", "upland"]), place: "the snow line" }),
    "grassland-wetland": Object.freeze({ farm: 0.04, forest: 0.02, forage: 0.14, pasture: 0.10, settlement: 0.38, movement: 0.86, tags: Object.freeze(["grassland", "wetland", "water", "meadow"]), place: "the wet meadow" }),
    "wetland-river": Object.freeze({ farm: 0.08, forest: 0.04, forage: 0.16, pasture: 0.06, settlement: 0.30, movement: 0.82, tags: Object.freeze(["wetland", "water", "river", "floodplain"]), place: "the river floodplain" }),
    "coast-forest": Object.freeze({ farm: 0.03, forest: 0.06, forage: 0.10, pasture: 0.04, settlement: 0.52, movement: 0.90, tags: Object.freeze(["coast", "forest", "water", "wind"]), place: "the coastal wood" }),
    "coast-dune": Object.freeze({ farm: -0.10, forest: 0.01, forage: 0.04, pasture: 0.02, settlement: 0.30, movement: 0.88, tags: Object.freeze(["coast", "dune", "dry", "wind"]), place: "the dune coast" }),
    "volcano-mountain": Object.freeze({ farm: -0.14, forest: 0.02, forage: 0.02, pasture: 0.01, settlement: 0.18, movement: 0.80, tags: Object.freeze(["volcanic", "mountain", "ash", "upland"]), place: "the volcanic slope" })
});

const LANDSCAPE_GAMEPLAY = Object.freeze({
    "woodland-steppe": Object.freeze({ farm: 0.06, forest: 0.00, forage: 0.06, pasture: 0.12, settlement: 0.04, movement: 0.02, tags: Object.freeze(["woodland", "steppe", "pasture"]), place: "the woodland steppe" }),
    "humid-grassland": Object.freeze({ farm: 0.09, forest: 0.00, forage: 0.12, pasture: 0.04, settlement: 0.06, movement: -0.05, tags: Object.freeze(["grassland", "wetland", "meadow"]), place: "the humid grassland" }),
    "dry-open-woodland": Object.freeze({ farm: -0.03, forest: 0.05, forage: 0.02, pasture: 0.00, settlement: 0.02, movement: 0.02, tags: Object.freeze(["woodland", "dry"]), place: "the open dry wood" }),
    "bush-steppe": Object.freeze({ farm: -0.06, forest: 0.02, forage: 0.04, pasture: 0.10, settlement: 0.00, movement: 0.02, tags: Object.freeze(["steppe", "scrub", "pasture"]), place: "the bush steppe" }),
    "woodland-tundra": Object.freeze({ farm: -0.05, forest: 0.02, forage: 0.00, pasture: 0.00, settlement: -0.02, movement: -0.04, tags: Object.freeze(["taiga", "tundra", "cold"]), place: "the woodland tundra" }),
    "mountain-forest-line": Object.freeze({ farm: -0.04, forest: 0.06, forage: 0.02, pasture: 0.02, settlement: -0.08, movement: -0.06, tags: Object.freeze(["mountain", "forest", "upland"]), place: "the mountain forest line" }),
    "coastal-forest": Object.freeze({ farm: 0.02, forest: 0.05, forage: 0.05, pasture: 0.02, settlement: 0.04, movement: -0.03, tags: Object.freeze(["coast", "forest"]), place: "the coastal forest" }),
    "floodplain": Object.freeze({ farm: 0.10, forest: 0.02, forage: 0.10, pasture: 0.02, settlement: -0.10, movement: -0.10, tags: Object.freeze(["river", "wetland", "floodplain", "water"]), place: "the floodplain" }),
    "savanna-edge": Object.freeze({ farm: 0.03, forest: 0.00, forage: 0.06, pasture: 0.12, settlement: 0.02, movement: 0.02, tags: Object.freeze(["savanna", "grassland", "pasture"]), place: "the savanna edge" }),
    "bog-forest-mosaic": Object.freeze({ farm: -0.06, forest: 0.05, forage: 0.06, pasture: 0.00, settlement: -0.18, movement: -0.16, tags: Object.freeze(["bog", "wetland", "forest", "water"]), place: "the bog woodland" })
});

const GAMEPLAY_NEUTRAL = Object.freeze({
    farm: 0, forest: 0, forage: 0, pasture: 0, settlement: 0.5, movement: 1,
    tags: Object.freeze([]), place: "the ordinary land", label: "No distinct ecotone"
});

function uniquifyTags(tags) {
    const seen = new Set();
    const result = [];
    for (const tag of tags) {
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        result.push(tag);
    }
    return result;
}

export function transitionGameplayFor(transition) {
    if (!transition) return null;
    const base = TRANSITION_GAMEPLAY[transition.pair?.id] || GAMEPLAY_NEUTRAL;
    const landscape = transition.landscape?.id ? LANDSCAPE_GAMEPLAY[transition.landscape.id] : null;
    const wet = clamp01(transition.wet);
    const drought = clamp01(transition.drought);
    const burned = transition.burned ? 1 : 0;
    const grazing = clamp01(transition.grazing);
    const magic = clamp01(transition.magic);
    const stageSwing = clamp01(transition.stage) - 0.5;
    const farm = clamp((Number(base.farm) || 0) + (Number(landscape?.farm) || 0)
        + stageSwing * 0.03 + wet * 0.05 - drought * 0.11 - burned * 0.08 - grazing * 0.05, -0.28, 0.30);
    const forest = clamp((Number(base.forest) || 0) + (Number(landscape?.forest) || 0)
        - drought * 0.08 - burned * 0.06 + magic * 0.04, -0.20, 0.24);
    const forage = clamp((Number(base.forage) || 0) + (Number(landscape?.forage) || 0)
        + wet * 0.06 - drought * 0.07 + magic * 0.03, -0.20, 0.30);
    const pasture = clamp((Number(base.pasture) || 0) + (Number(landscape?.pasture) || 0)
        + wet * 0.03 - drought * 0.08 - grazing * 0.12, -0.20, 0.28);
    const settlement = clamp01((Number(base.settlement) || 0) + (Number(landscape?.settlement) || 0)
        - wet * 0.10 - drought * 0.05 + stageSwing * 0.02);
    const movement = clamp((Number(base.movement) || 1) + (Number(landscape?.movement) || 0)
        - wet * 0.03 - clamp01(transition.treeDensity) * 0.03 - drought * 0.01, 0.68, 1.08);
    const tags = uniquifyTags([
        ...(base.tags || []), ...(landscape?.tags || []),
        ...(magic > 0.2 ? ["magic"] : []), ...(burned ? ["burned"] : []),
        ...(drought > 0.3 ? ["dry"] : []), ...(wet > 0.55 ? ["wet"] : [])
    ]);
    return Object.freeze({
        pair: transition.pair.id,
        landscape: transition.landscape?.id || null,
        label: transition.label + (transition.landscape ? " · " + transition.landscape.label : ""),
        labelDe: transition.labelDe + (transition.landscape ? " · " + transition.landscape.labelDe : ""),
        place: landscape?.place || base.place,
        stage: transition.stage,
        farm: round(farm),
        forest: round(forest),
        forage: round(forage),
        pasture: round(pasture),
        settlement: round(settlement),
        movement: round(movement),
        tags: Object.freeze(tags)
    });
}

export function transitionGameplayAt(x, y, context = {}) {
    return transitionGameplayFor(transitionAt(x, y, context));
}

// Low-frequency event bias. Both the realm chronicle and micro events pass
// their family/template id here, so the same wet, dry or magical seam shapes
// which stories are likely without a second event table.
export function transitionEventWeight(id, gameplay) {
    if (!gameplay) return 1;
    const key = String(id || "").toLowerCase();
    const tags = gameplay.tags || [];
    const has = tag => tags.includes(tag);
    let weight = 1;
    if (has("floodplain") || has("wetland") || has("bog") || has("river")) {
        if (/flood|fish|rain|storm|shortage|plague|illness/.test(key)) weight *= 1.35;
    }
    if (has("dry") || has("steppe") || has("arid")) {
        if (/fire|drought|shortage|storm|wildlife|bandit/.test(key)) weight *= 1.20;
    }
    if (has("forest") || has("woodland") || has("meadow")) {
        if (/harvest|herb|gather|wildlife|basket|forage|hunt/.test(key)) weight *= 1.18;
    }
    if (has("snow") || has("cold") || has("tundra")) {
        if (/winter|snow|frost|shortage|fire/.test(key)) weight *= 1.25;
    }
    if (has("mountain") || has("upland")) {
        if (/monster|border|stone|storm|avalanche/.test(key)) weight *= 1.15;
    }
    if (has("coast")) {
        if (/fish|trade|caravan|storm|flood/.test(key)) weight *= 1.20;
    }
    if (has("volcanic") || has("ash")) {
        if (/fire|monster|ruins|omen|ash/.test(key)) weight *= 1.15;
    }
    if (has("magic")) {
        if (/omen|ruin|mystic|magic|relic/.test(key)) weight *= 1.45;
    }
    return Math.max(0.65, Math.min(1.6, weight));
}

// Movement is queried on the villager/carrier step. Cache the result per tile
// and per input that can move the seam (year, forest stock/succession, atlas).
// A cache hit is one Map lookup; a miss builds one transition object, never a
// tile graph or a per-frame scan.
const MOVEMENT_CACHE_LIMIT = 2048;
const movementCache = new Map();
let movementCacheGeo = null;
let movementCacheSuccession = null;
let movementCacheAtlas = null;
let movementCacheSeed = 0;

export function transitionMovementFactorAt(x, y) {
    const tx = Math.floor(Number(x)), ty = Math.floor(Number(y));
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return 1;
    const geo = state.resourceGeography;
    if (movementCacheGeo !== geo || movementCacheSuccession !== state.forestSuccession
        || movementCacheAtlas !== state.specialBiomes || movementCacheSeed !== state.worldSeed) {
        movementCache.clear();
        movementCacheGeo = geo;
        movementCacheSuccession = state.forestSuccession;
        movementCacheAtlas = state.specialBiomes;
        movementCacheSeed = state.worldSeed;
    }
    const width = Math.max(1, Number(state.worldW) || 1);
    const index = ty * width + tx;
    const record = state.forestSuccession?.tiles?.[tx + ":" + ty] || null;
    const key = tx + ":" + ty + ":" + (Number(state.year) || 1)
        + ":" + (Number(geo?.forestStock?.[index]) || 0)
        + ":" + (Number(geo?.forestCapacity?.[index]) || 0)
        + ":" + (record?.kind || "") + ":" + (record?.age ?? "");
    const cached = movementCache.get(key);
    if (cached !== undefined) return cached;
    const gameplay = transitionGameplayAt(tx + 0.5, ty + 0.5);
    const factor = Math.max(0.68, Math.min(1.08, Number(gameplay?.movement) || 1));
    if (movementCache.size >= MOVEMENT_CACHE_LIMIT) movementCache.clear();
    movementCache.set(key, factor);
    return factor;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = value => Math.round((Number(value) || 0) * 1000) / 1000;

function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / (edge1 - edge0 || 1e-6));
    return t * t * (3 - 2 * t);
}

function hash32(seed, a, b, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, x, y, salt = 0) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

function band(value, center, width) {
    return clamp01(1 - Math.abs(value - center) / Math.max(0.0001, width));
}

function mix(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

function sampleTerrain(x, y, context = {}) {
    if (Number.isFinite(Number(context.height)) && Number.isFinite(Number(context.moisture)) && Number.isFinite(Number(context.temperature))) {
        return {
            height: Number(context.height),
            moisture: clamp01(context.moisture),
            temperature: clamp01(context.temperature)
        };
    }
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const width = Number(state.terrainPixW) || 0;
    const height = Number(state.terrainPixH) || 0;
    if (!width || !height) {
        return { height: number(context.height, 0.55), moisture: clamp01(number(context.moisture, 0.5)), temperature: clamp01(number(context.temperature, 0.55)) };
    }
    const px = Math.max(0, Math.min(width - 1, Math.floor(Number(x) * resolution)));
    const py = Math.max(0, Math.min(height - 1, Math.floor(Number(y) * resolution)));
    const index = py * width + px;
    return {
        height: number(state.heightMap?.[index], 0.55),
        moisture: clamp01(number(state.moistureMap?.[index], 0.5)),
        temperature: clamp01(number(state.temperatureMap?.[index], 0.55))
    };
}

function climateDrift(year, climate) {
    const age = clamp01((Math.max(1, Math.floor(number(year, 1))) - 1) / 160);
    const hot = ["arid", "savanna", "tropical", "mediterranean", "volcanic"].includes(climate);
    const cold = ["tundra", "taiga", "snow", "northern"].includes(climate);
    const warming = age * (hot ? 0.16 : cold ? 0.05 : 0.09);
    const cycle = Math.sin((Math.max(1, Math.floor(number(year, 1))) - 1) / 19) * 0.032;
    const wet = Math.sin((Math.max(1, Math.floor(number(year, 1))) - 1) / 13 + 1.2) * 0.035;
    return { warming, cycle, wet, age, dry: hot ? age * 0.10 : age * 0.035 };
}

function specialEdgeAt(x, y, year = 1) {
    const map = state.specialBiomeMap;
    const regions = state.specialBiomes?.regions;
    if (!map || !regions?.length) return null;
    // The atlas is bounded to twelve regions. Checking the region centres is
    // cheaper and more correct than a 3x3 map lookup: the magical influence
    // deliberately reaches a few tiles *beyond* the painted one-byte region,
    // where there is no map byte to find.
    let best = null;
    for (const region of regions) {
        if (!region) continue;
        const radius = Math.max(1, Number(region.radius) || 1);
        // Magical ground creeps outward across the decades instead of ending
        // at one fixed ring. The atlas itself is unchanged; the ecotone reads
        // the expanded influence, so an old realm shows a wider magical seam.
        const growth = 1 + clamp01((Math.max(1, Number(year) || 1) - 1) / 80) * 0.60;
        const reach = radius + Math.max(0.5, Number(region.transition) || 1.4) * growth;
        const distance = Math.hypot(x - region.x, y - region.y);
        if (distance > reach) continue;
        const edge = clamp01(1 - Math.abs(distance - radius) / Math.max(1, reach - radius));
        if (!best || edge > best.edge) best = { edge, region };
    }
    return best;
}

function forestStateAt(x, y) {
    const W = Math.max(1, Number(state.worldW) || 1);
    const tx = Math.floor(Number(x));
    const ty = Math.floor(Number(y));
    const geo = state.resourceGeography;
    const index = ty * W + tx;
    const capacity = Number(geo?.forestCapacity?.[index]) || 0;
    const stock = Number(geo?.forestStock?.[index]) || 0;
    const ratio = capacity > 0 ? clamp01(stock / capacity) : 1;
    const record = state.forestSuccession?.tiles?.[tx + ":" + ty] || null;
    const kind = String(record?.kind || "");
    const burned = kind === "burned" || kind === "drought-stressed";
    const cutover = kind === "cutover" || kind === "windthrow" || kind === "bark-beetle" || kind === "snowbreak";
    const age = Math.max(0, Number(record?.age) || 0);
    return {
        ratio,
        burned,
        cutover,
        age,
        logging: capacity > 0 ? clamp01(1 - ratio + (cutover ? 0.45 : 0)) : 0,
        regrowth: capacity > 0 ? clamp01((ratio - 0.82) / 0.18) : 0
    };
}

function landscapeFor(pairId, m, t, e, forest, wet) {
    if (pairId === "wood-grassland") {
        if (m < 0.48 && t > 0.56) return TRANSITION_LANDSCAPES["dry-open-woodland"];
        if (m > 0.60) return TRANSITION_LANDSCAPES["humid-grassland"];
        if (t > 0.54) return TRANSITION_LANDSCAPES["woodland-steppe"];
    }
    if (pairId === "grassland-steppe" && t > 0.60 && m < 0.40) return TRANSITION_LANDSCAPES["bush-steppe"];
    if (pairId === "taiga-tundra") return TRANSITION_LANDSCAPES["woodland-tundra"];
    if (pairId === "forest-mountain" && e > 0.52) return TRANSITION_LANDSCAPES["mountain-forest-line"];
    if (pairId === "coast-forest") return TRANSITION_LANDSCAPES["coastal-forest"];
    if (pairId === "grassland-wetland" && forest > 0.42) return TRANSITION_LANDSCAPES["bog-forest-mosaic"];
    if ((pairId === "wetland-river" || pairId === "grassland-wetland") && forest > 0.34) return TRANSITION_LANDSCAPES["floodplain"];
    if (pairId === "grassland-steppe" && t > 0.66) return TRANSITION_LANDSCAPES["savanna-edge"];
    if (pairId === "wetland-river" && wet > 0.62) return TRANSITION_LANDSCAPES["floodplain"];
    return null;
}

function pairScores(m, t, e, climate) {
    const lowland = 1 - smoothstep(0.74, 0.92, e);
    const forest = smoothstep(0.34, 0.50, m) * (1 - smoothstep(0.78, 0.94, e))
        * smoothstep(0.04, 0.15, e)
        * (1 - smoothstep(0.68, 0.84, m) * 0.60);
    const cold = 1 - smoothstep(0.30, 0.48, t);
    const warm = smoothstep(0.48, 0.68, t);
    const coast = 1 - smoothstep(0.02, 0.14, e);
    const volatile = climate === "volcanic" || climate === "mountain" ? 1 : 0.34;
    return {
        "wood-grassland": band(m, 0.44, 0.20) * lowland,
        "grassland-steppe": band(m, 0.40, 0.18) * smoothstep(0.44, 0.62, t) * lowland,
        "steppe-semi-desert": band(m, 0.34, 0.14) * warm,
        "semi-desert-desert": band(m, 0.28, 0.10) * smoothstep(0.64, 0.84, t),
        "broadleaf-mixed": forest * band(t, 0.55, 0.22) * (1 - cold * 0.35),
        "mixed-conifer": forest * band(t, 0.42, 0.18) * (0.75 + cold * 0.25),
        "conifer-taiga": forest * band(t, 0.40, 0.13) * (0.90 + cold * 0.10),
        "taiga-tundra": band(t, 0.27, 0.12) * smoothstep(0.28, 0.50, m),
        "forest-mountain": band(e, 0.68, 0.22) * smoothstep(0.38, 0.52, m),
        "mountain-snow": band(e, 0.88, 0.14),
        "grassland-wetland": band(m, 0.74, 0.15) * (1 - smoothstep(0.02, 0.16, e)),
        "wetland-river": band(m, 0.64, 0.20) * (1 - smoothstep(0.005, 0.10, e)),
        "coast-forest": coast * smoothstep(0.36, 0.56, m) * (1 - smoothstep(0.56, 0.70, m) * 0.90),
        "coast-dune": (1 - smoothstep(0.008, 0.05, e)) * (1 - smoothstep(0.28, 0.52, m)),
        "volcano-mountain": volatile * band(e, 0.50, 0.32) * (0.4 + warm * 0.6)
    };
}

function pickPair(m, t, e, climate, seed, px, py) {
    const scores = pairScores(m, t, e, climate);
    let winner = null;
    for (const pair of TRANSITION_PAIRS) {
        const score = scores[pair.id] || 0;
        if (!winner || score > winner.score) winner = { pair, score };
    }
    if (!winner || winner.score < 0.54) return null;
    const pair = winner.pair;
    const noise = unit(seed, px, py, 0x45434f54);
    const width = Math.round((pair.width + noise * 0.055) * 1000) / 1000;
    const axisValue = pair.axis === "moisture" ? m : pair.axis === "temperature" ? t : e;
    const stage = clamp01((axisValue - (pair.threshold - width * 0.5)) / Math.max(0.0001, width));
    const organic = Math.max(0, Math.min(1, 0.55 + noise * 0.45));
    const forest = smoothstep(0.34, 0.50, m) * (1 - smoothstep(0.76, 0.92, e));
    const wet = smoothstep(0.60, 0.80, m) * (1 - smoothstep(0.02, 0.14, e));
    const landscape = landscapeFor(pair.id, m, t, e, forest, wet);
    return {
        pair,
        score: winner.score,
        width,
        stage,
        organic,
        landscape,
        forest,
        wet,
        tint: pair.tint,
        soil: pair.soil,
        flora: pair.flora,
        texture: clamp01(0.32 + noise * 0.68),
        treeDensity: clamp01(0.16 + forest * 0.82 + (wet > 0.4 ? 0.06 : -0.06)),
        grassHeight: wet > 0.58 ? "tall" : m < 0.32 ? "short" : stage > 0.5 ? "medium" : "tall",
        grassDensity: clamp01(0.42 + (1 - forest) * 0.46 + wet * 0.08),
        shrubDensity: clamp01(0.22 + (1 - forest) * 0.26 + wet * 0.12),
        islandChance: clamp01(0.06 + (1 - Math.abs(stage - 0.5) * 2) * 0.26 + noise * 0.12)
    };
}

function transitionCore(height, moisture, temperature, px, py, climate, sea, seed, context = {}) {
    const h = number(height, 0.55);
    const m = clamp01(moisture);
    const t = clamp01(temperature);
    if (h < Number(sea ?? 0.33) + 0.006) return null;
    const warp = (unit(seed, px, py, 0x45434f54) - 0.5) * 0.075;
    const mWarped = clamp01(m + warp);
    const tWarped = clamp01(t + warp * 0.72);
    const e = clamp01((h - Number(sea ?? 0.33)) / Math.max(0.001, 1 - Number(sea ?? 0.33)));
    const picked = pickPair(mWarped, tWarped, e, climate, seed, px, py);
    if (!picked) return null;
    const year = Math.max(1, Math.floor(number(context.year, state.year || 1)));
    const drift = climateDrift(year, climate);
    const forest = forestStateAt(context.x ?? px, context.y ?? py);
    const edge = specialEdgeAt(context.x ?? px, context.y ?? py, year);
    const magic = edge ? clamp01(edge.edge * (0.85 + clamp01(year / 240) * 0.15) * 0.95) : 0;
    const use = context.use || {};
    const grazing = clamp01(use.overgrazed ? 1 : use.grazed ? 0.66 : use.intensive ? 0.42 : 0);
    const burned = forest.burned || Boolean(use.burned);
    const logging = clamp01(forest.logging + (use.logged ? 0.4 : 0));
    const wetGain = clamp01(drift.wet + (m > 0.7 ? 0.16 : 0) - drift.dry * 0.4);
    const drought = clamp01(drift.dry + (["arid", "savanna", "desert"].includes(climate) ? 0.12 : 0) + (m < 0.32 ? 0.12 : 0) - wetGain * 0.28);
    const stage = clamp01(picked.stage + drift.warming * 0.20 + drift.cycle - wetGain * 0.08 + grazing * 0.05);
    const treeDensity = clamp01(picked.treeDensity
        + forest.regrowth * 0.08 + (forest.ratio > 0.8 ? 0.03 : 0)
        - drought * 0.20 - logging * 0.32 - burned * 0.24 - grazing * 0.10
        + magic * 0.22 + wetGain * 0.06);
    const grassDensity = clamp01(picked.grassDensity + wetGain * 0.08 - drought * 0.12 - grazing * 0.16 + burned * 0.04);
    const grassHeight = grazing > 0.58 || drought > 0.44 ? "short" : wetGain > 0.42 ? "tall" : picked.grassHeight;
    const soil = burned ? mix(picked.soil, [73, 65, 58], 0.55)
        : logging > 0.45 ? mix(picked.soil, [130, 116, 88], 0.38)
            : grazing > 0.5 ? mix(picked.soil, [157, 143, 108], 0.30)
                : wetGain > 0.4 ? mix(picked.soil, [91, 104, 82], 0.26)
                    : picked.soil;
    const tint = burned ? mix(picked.tint, [105, 91, 70], 0.32)
        : magic > 0.25 ? mix(picked.tint, [137, 104, 165], 0.30)
            : picked.tint;
    const requirements = new Set([picked.pair.requirement, 16, 17, 18, 19, 20, 21, 22, 23, 24, 35, 36, 37, 38, 39, 40, 41, 42]);
    if (picked.landscape) requirements.add(picked.landscape.requirement);
    if (drift.age > 0.01) requirements.add(43);
    if (treeDensity > 0.56 || forest.regrowth > 0.1) requirements.add(44);
    if (drought > 0.2) requirements.add(45);
    if (wetGain > 0.24) requirements.add(46);
    if (burned || forestSuccessionKindIsFire(forest)) requirements.add(47);
    if (logging > 0.12) requirements.add(48);
    if (grazing > 0.12) requirements.add(49);
    if (magic > 0.12) requirements.add(50);
    const dynamics = [];
    if (drift.age > 0.01) dynamics.push("climate-change");
    if (treeDensity > 0.56 || forest.regrowth > 0.1) dynamics.push("forest-expansion");
    if (drought > 0.2) dynamics.push("steppeification");
    if (wetGain > 0.24) dynamics.push("wetland-expansion");
    if (burned) dynamics.push("post-fire");
    if (logging > 0.12) dynamics.push("logging-regrowth");
    if (grazing > 0.12) dynamics.push("grazing-change");
    if (magic > 0.12) dynamics.push("magical-spread");
    return {
        version: TRANSITION_VERSION,
        id: picked.pair.id + ":" + Math.round(stage * 100),
        pair: picked.pair,
        label: picked.pair.label,
        labelDe: picked.pair.labelDe,
        landscape: picked.landscape,
        stage: round(stage),
        stageBand: stage < 0.34 ? 0 : stage < 0.67 ? 1 : 2,
        width: picked.width,
        organic: picked.organic,
        strength: round(Math.min(1, picked.score * (0.72 + picked.stage * 0.28))),
        moisture: round(clamp01(m + wetGain * 0.06 - drought * 0.04)),
        temperature: round(tWarped),
        height: round(h),
        treeDensity: round(treeDensity),
        grassDensity: round(grassDensity),
        grassHeight,
        shrubDensity: round(clamp01(picked.shrubDensity + wetGain * 0.05 - grazing * 0.10)),
        islandChance: round(picked.islandChance),
        soil: roundColor(soil),
        tint: roundColor(tint),
        texture: picked.texture,
        flora: picked.flora,
        requirements: [...requirements].sort((a, b) => a - b),
        dynamics,
        magic: round(magic),
        drought: round(drought),
        wet: round(wetGain),
        burned: Boolean(burned),
        logging: round(logging),
        grazing: round(grazing),
        regrowth: round(forest.regrowth),
        ratio: round(forest.ratio)
    };
}

function forestSuccessionKindIsFire(forest) {
    return Boolean(forest?.burned);
}

function roundColor(color) {
    return color.map(value => Math.max(0, Math.min(255, Math.round(Number(value) || 0))));
}

export function transitionAt(x, y, context = {}) {
    const sample = sampleTerrain(x, y, context);
    const climate = String(context.climate || state.worldOptions?.climate || "temperate");
    const sea = number(context.sea, state.seaLevel ?? 0.33);
    const seed = Math.max(1, Math.floor(number(context.seed, state.worldSeed || 1)));
    return transitionCore(sample.height, sample.moisture, sample.temperature, Math.floor(x), Math.floor(y), climate, sea, seed, {
        ...context, x, y
    });
}

// Pack RGBA into one integer so the terrain bake can read a tint without
// allocating a transition object, a requirement set or a history array for
// every terrain pixel. 0 means no ecotone. This path is intentionally pure:
// generation has no resources, settlements or atlas yet.
export function transitionTint(height, moisture, temperature, px, py, climate, sea = 0.33, seed = 1) {
    const h = number(height, 0.55);
    const m = clamp01(moisture);
    const t = clamp01(temperature);
    if (h < Number(sea ?? 0.33) + 0.006) return 0;
    const warp = (unit(seed, px, py, 0x45434f54) - 0.5) * 0.075;
    const e = clamp01((h - Number(sea ?? 0.33)) / Math.max(0.001, 1 - Number(sea ?? 0.33)));
    const picked = pickPair(clamp01(m + warp), clamp01(t + warp * 0.72), e, climate, seed, px, py);
    if (!picked) return 0;
    const alpha = Math.max(0, Math.min(96, Math.round(picked.score * 64 + (picked.landscape ? 8 : 0))));
    if (!alpha) return 0;
    const tint = picked.tint;
    return (alpha << 24) | (tint[0] << 16) | (tint[1] << 8) | tint[2];
}

export function transitionGrassProfile(profile, transition = transitionAt(profile?.x ?? 0, profile?.y ?? 0)) {
    if (!profile || !transition) return profile;
    const next = {
        ...profile,
        sward: { ...(profile.sward || {}) },
        visual: { ...(profile.visual || {}) }
    };
    const density = clamp01((Number(next.sward.density) || 0) * (0.62 + transition.grassDensity * 0.56));
    next.sward.density = density;
    next.sward.height = transition.grassHeight;
    next.sward.short = transition.grassHeight === "short";
    next.sward.medium = transition.grassHeight === "medium";
    next.sward.tall = transition.grassHeight === "tall";
    next.treeChance = clamp01((Number(next.treeChance) || 0) + (transition.treeDensity - 0.45) * 0.18);
    next.shrubPatches = clamp01((Number(next.shrubPatches) || 0) + transition.shrubDensity * 0.16);
    next.grassHex = mixHex(next.grassHex || "#71854f", rgbHex(transition.tint), 0.22);
    next.transition = transition;
    if (density < 0.26) next.soilExposed = true;
    if (transition.burned) next.burned = true;
    if (transition.grazing > 0.5) next.grazed = true;
    if (transition.logging > 0.3) next.regrowth = true;
    if (Array.isArray(next.trees) && next.trees.length && transition.treeDensity > 0.58) {
        next.trees = [...next.trees, ...next.trees.slice(0, 1).map(tree => ({
            ...tree, scale: Math.max(0.55, (Number(tree.scale) || 1) * 0.72),
            offsetX: Math.max(-0.38, Math.min(0.38, (Number(tree.offsetX) || 0) + 0.22)),
            role: "ecotone-island"
        }))];
    }
    return next;
}

export function transitionForestStand(stand, transition = null) {
    if (!stand || !transition) return stand;
    const treeChance = clamp01((Number(stand.treeChance) || 0) + (transition.treeDensity - 0.5) * 0.22 - transition.logging * 0.10);
    const understory = { ...(stand.understory || {}) };
    understory.grass = clamp01((Number(understory.grass) || 0) + transition.grassDensity * 0.22);
    understory.shrub = clamp01((Number(understory.shrub) || 0) + transition.shrubDensity * 0.18);
    understory.herb = clamp01((Number(understory.herb) || 0) + transition.texture * 0.08);
    if (transition.burned) understory.fern = Math.max(0, (Number(understory.fern) || 0) - 0.08);
    return {
        ...stand,
        treeChance,
        density: clamp01((Number(stand.density) || 0) + (transition.treeDensity - 0.5) * 0.12),
        canopy: clamp01((Number(stand.canopy) || 0) + (transition.treeDensity - 0.5) * 0.08),
        clearing: clamp01((Number(stand.clearing) || 0) + (1 - transition.treeDensity) * 0.06),
        understory,
        ecotone: transition
    };
}

function rgbHex(color) {
    return "#" + color.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

export function mixHex(a, b, t) {
    const parse = value => {
        const text = String(value || "").replace("#", "");
        if (!/^[0-9a-f]{6}$/i.test(text)) return null;
        return [parseInt(text.slice(0, 2), 16), parseInt(text.slice(2, 4), 16), parseInt(text.slice(4, 6), 16)];
    };
    const ca = parse(a), cb = parse(b);
    if (!ca || !cb) return a;
    const color = mix(ca, cb, clamp01(t));
    return "#" + color.map(value => value.toString(16).padStart(2, "0")).join("");
}

export function getTransitionSurvey(x = null, y = null, options = {}) {
    const W = Math.max(1, Number(state.worldW) || 1);
    const H = Math.max(1, Number(state.worldH) || 1);
    const cx = Number.isFinite(Number(x)) ? Number(x) : W / 2;
    const cy = Number.isFinite(Number(y)) ? Number(y) : H / 2;
    // The old default searches a small ring around the requested point so a
    // survey at the heart still finds a nearby seam. The Explore tile cursor
    // uses exact mode: its chips must describe the tile the player selected,
    // not a nearby neighbour that happened to be stronger.
    const points = options.exact === true ? [[cx, cy]] : [
        [cx, cy], [cx + W * 0.08, cy], [cx - W * 0.08, cy],
        [cx, cy + H * 0.08], [cx, cy - H * 0.08]
    ];
    let best = null;
    let tile = null;
    for (const [sx, sy] of points) {
        const point = transitionAt(sx, sy);
        if (point && (!best || point.strength > best.strength)) {
            best = point;
            tile = { x: Math.floor(sx), y: Math.floor(sy) };
        }
    }
    return {
        version: TRANSITION_VERSION,
        manifestCount: TRANSITION_REQUIREMENTS.length,
        pairCount: TRANSITION_PAIRS.length,
        landscapeCount: Object.keys(TRANSITION_LANDSCAPES).length,
        active: Boolean(best),
        sample: best,
        tile,
        gameplay: best ? transitionGameplayFor(best) : null,
        label: best ? best.label + (best.landscape ? " · " + best.landscape.label : "") : "No distinct ecotone at this tile",
        labelDe: best ? best.labelDe + (best.landscape ? " · " + best.landscape.labelDe : "") : "Kein ausgeprägter Übergang an diesem Tile",
        requirements: best?.requirements || [],
        dynamics: best?.dynamics || [],
        pairs: TRANSITION_PAIRS.map(pair => ({ id: pair.id, label: pair.label, labelDe: pair.labelDe, requirement: "1.2.17." + pair.requirement }))
    };
}

export const __internals = {
    transitionCore, pairScores, pickPair, landscapeFor, climateDrift,
    specialEdgeAt, forestStateAt, sampleTerrain, band
};
