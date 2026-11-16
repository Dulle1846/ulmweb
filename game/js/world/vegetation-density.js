// Vegetation density inside one biome (spec 1.2.18.1–1.2.18.70).
//
// The world already samples one deterministic terrain field per tile. This
// module derives the local vegetation structure from that field plus the
// existing forest/grassland/desert/wetland state. It is intentionally
// stateless: no per-tile array, no tick loop and no save migration are added.
//
// Three coherent noise scales produce groups, gaps and plant islands. The
// result then feeds the already rendered stand/sward profiles, so a dense
// group is dense for the eye, the survey, forest work and route travel. Every
// value is a pure function of seed, tile and the current ecological inputs.

import { state } from "../core/state.js";
import { seasonalState } from "./season.js";

export const VEGETATION_DENSITY_VERSION = 1;

export const VEGETATION_REQUIREMENTS = Object.freeze([
    { id: "1.2.18.1", key: "very-sparse", label: "Very low vegetation density", labelDe: "Sehr geringe Vegetationsdichte", group: "density" },
    { id: "1.2.18.2", key: "open", label: "Loose vegetation", labelDe: "Lockere Vegetation", group: "density" },
    { id: "1.2.18.3", key: "moderate", label: "Medium vegetation density", labelDe: "Mittlere Vegetationsdichte", group: "density" },
    { id: "1.2.18.4", key: "dense", label: "Dense vegetation", labelDe: "Dichte Vegetation", group: "density" },
    { id: "1.2.18.5", key: "very-dense", label: "Extremely dense vegetation", labelDe: "Extrem dichte Vegetation", group: "density" },
    { id: "1.2.18.6", key: "same-landscape-contrast", label: "Different density inside the same landscape", labelDe: "Unterschiedliche Dichte innerhalb derselben Landschaft", group: "pattern" },
    { id: "1.2.18.7", key: "coherent-groups", label: "Spatially connected vegetation groups", labelDe: "Räumlich zusammenhängende Vegetationsgruppen", group: "pattern" },
    { id: "1.2.18.8", key: "natural-openings", label: "Small natural open spaces", labelDe: "Kleine natürliche Freiflächen", group: "pattern" },
    { id: "1.2.18.9", key: "irregular-single-plants", label: "Irregular distribution of individual plants", labelDe: "Unregelmäßige Verteilung einzelner Pflanzen", group: "pattern" },
    { id: "1.2.18.10", key: "clearings", label: "Clearings", labelDe: "Lichtungen", group: "pattern" },
    { id: "1.2.18.11", key: "dense-woodland-core", label: "Dense woodland core areas", labelDe: "Dichte Waldkernbereiche", group: "woodland" },
    { id: "1.2.18.12", key: "open-woodland-edge", label: "Loosely grown woodland edges", labelDe: "Locker bewachsene Waldränder", group: "woodland" },
    { id: "1.2.18.13", key: "young-regrowth", label: "Young forest regeneration", labelDe: "Junge Waldregeneration", group: "woodland" },
    { id: "1.2.18.14", key: "old-open-wood", label: "Old, open woodlands", labelDe: "Alte, offene Wälder", group: "woodland" },
    { id: "1.2.18.15", key: "thick-understory", label: "Dense undergrowth", labelDe: "Dichtes Unterholz", group: "woodland" },
    { id: "1.2.18.16", key: "high-canopy", label: "High tree-crown density", labelDe: "Hohe Baumkronendichte", group: "woodland" },
    { id: "1.2.18.17", key: "tree-clusters", label: "Scattered tree groups", labelDe: "Vereinzelte Baumgruppen", group: "woodland" },
    { id: "1.2.18.18", key: "dead-woodland", label: "Woodland with dead or missing trees", labelDe: "Waldflächen mit abgestorbenen oder fehlenden Bäumen", group: "woodland" },
    { id: "1.2.18.19", key: "short-grass", label: "Short grass surfaces", labelDe: "Kurze Grasflächen", group: "grassland" },
    { id: "1.2.18.20", key: "tall-grass", label: "Tall grass stands", labelDe: "Hohe Grasbestände", group: "grassland" },
    { id: "1.2.18.21", key: "flower-meadow", label: "Dense flower meadows", labelDe: "Dichte Blumenwiesen", group: "grassland" },
    { id: "1.2.18.22", key: "barren-pasture", label: "Barren pasture surfaces", labelDe: "Karge Weideflächen", group: "grassland" },
    { id: "1.2.18.23", key: "shrub-islands", label: "Shrub islands", labelDe: "Buschinseln", group: "grassland" },
    { id: "1.2.18.24", key: "grazed-ground", label: "Grazed surfaces", labelDe: "Abgeweidete Flächen", group: "grassland" },
    { id: "1.2.18.25", key: "wet-meadow", label: "Moist meadows with dense vegetation", labelDe: "Feuchte Wiesen mit dichter Vegetation", group: "grassland" },
    { id: "1.2.18.26", key: "dry-loose-grass", label: "Dry, patchy grass surfaces", labelDe: "Trockene, lückige Grasflächen", group: "grassland" },
    { id: "1.2.18.27", key: "bare-desert", label: "Almost vegetation-free desert surfaces", labelDe: "Nahezu vegetationslose Wüstenflächen", group: "arid" },
    { id: "1.2.18.28", key: "single-shrubs", label: "Individual shrubs", labelDe: "Einzelne Sträucher", group: "arid" },
    { id: "1.2.18.29", key: "plant-islands", label: "Small plant islands", labelDe: "Kleine Pflanzeninseln", group: "arid" },
    { id: "1.2.18.30", key: "depression-vegetation", label: "Vegetation in depressions", labelDe: "Vegetation in Senken", group: "arid" },
    { id: "1.2.18.31", key: "oasis", label: "Dense oasis vegetation", labelDe: "Dichte Oasenvegetation", group: "arid" },
    { id: "1.2.18.32", key: "seasonal-channel", label: "Plants along seasonal watercourses", labelDe: "Pflanzen entlang saisonaler Wasserläufe", group: "arid" },
    { id: "1.2.18.33", key: "sand-rock-contrast", label: "Different density between sand and rock deserts", labelDe: "Unterschiedliche Vegetationsdichte zwischen Sand- und Felswüsten", group: "arid" },
    { id: "1.2.18.34", key: "open-water", label: "Open water surfaces", labelDe: "Offene Wasserflächen", group: "wetland" },
    { id: "1.2.18.35", key: "loose-reed", label: "Loose reeds", labelDe: "Lockeres Schilf", group: "wetland" },
    { id: "1.2.18.36", key: "dense-reed", label: "Dense reed stands", labelDe: "Dichte Schilfbestände", group: "wetland" },
    { id: "1.2.18.37", key: "wetland-islands", label: "Small plant islands in water", labelDe: "Kleine Pflanzeninseln im Wasser", group: "wetland" },
    { id: "1.2.18.38", key: "vegetated-bank", label: "Vegetated banks", labelDe: "Bewachsene Ufer", group: "wetland" },
    { id: "1.2.18.39", key: "free-channel", label: "Free water channels", labelDe: "Freie Wasserkanäle", group: "wetland" },
    { id: "1.2.18.40", key: "swamp-forest", label: "Dense swamp forests", labelDe: "Dichte Sumpfwälder", group: "wetland" },
    { id: "1.2.18.41", key: "bare-mud", label: "Vegetation-free mud surfaces", labelDe: "Vegetationsfreie Schlammflächen", group: "wetland" },
    { id: "1.2.18.42", key: "soil-quality", label: "Soil quality", labelDe: "Bodenqualität", group: "driver" },
    { id: "1.2.18.43", key: "water-availability", label: "Water availability", labelDe: "Wasserverfügbarkeit", group: "driver" },
    { id: "1.2.18.44", key: "sunlight", label: "Sunlight", labelDe: "Sonneneinstrahlung", group: "driver" },
    { id: "1.2.18.45", key: "competition", label: "Competition between plants", labelDe: "Konkurrenz zwischen Pflanzen", group: "driver" },
    { id: "1.2.18.46", key: "plant-age", label: "Plant age", labelDe: "Pflanzenalter", group: "driver" },
    { id: "1.2.18.47", key: "season", label: "Season", labelDe: "Jahreszeit", group: "driver" },
    { id: "1.2.18.48", key: "browsing", label: "Animal browsing", labelDe: "Tierfraß", group: "driver" },
    { id: "1.2.18.49", key: "grazing", label: "Grazing", labelDe: "Beweidung", group: "driver" },
    { id: "1.2.18.50", key: "logging", label: "Logging and clearing", labelDe: "Abholzung und Rodung", group: "driver" },
    { id: "1.2.18.51", key: "fire", label: "Fires", labelDe: "Brände", group: "driver" },
    { id: "1.2.18.52", key: "disease", label: "Diseases and pests", labelDe: "Krankheiten und Schädlinge", group: "driver" },
    { id: "1.2.18.53", key: "regeneration", label: "Natural regeneration", labelDe: "Natürliche Regeneration", group: "driver" },
    { id: "1.2.18.54", key: "sight", label: "Different sight ranges", labelDe: "Unterschiedliche Sichtweite", group: "gameplay" },
    { id: "1.2.18.55", key: "movement", label: "Different movement costs", labelDe: "Unterschiedliche Bewegungskosten", group: "gameplay" },
    { id: "1.2.18.56", key: "cover", label: "Different cover", labelDe: "Unterschiedliche Deckung", group: "gameplay" },
    { id: "1.2.18.57", key: "concealment", label: "Different hiding opportunities", labelDe: "Unterschiedliche Versteckmöglichkeiten", group: "gameplay" },
    { id: "1.2.18.58", key: "hunting", label: "Different hunting conditions", labelDe: "Unterschiedliche Jagdbedingungen", group: "gameplay" },
    { id: "1.2.18.59", key: "plant-resources", label: "Different wood and plant resources", labelDe: "Unterschiedliche Holz- und Pflanzenressourcen", group: "gameplay" },
    { id: "1.2.18.60", key: "fire-risk", label: "Different fire risk", labelDe: "Unterschiedliche Brandgefahr", group: "gameplay" },
    { id: "1.2.18.61", key: "agriculture", label: "Different agricultural usability", labelDe: "Unterschiedliche landwirtschaftliche Nutzbarkeit", group: "gameplay" },
    { id: "1.2.18.62", key: "habitat", label: "Different habitats for animals", labelDe: "Unterschiedliche Lebensräume für Tiere", group: "gameplay" },
    { id: "1.2.18.63", key: "no-repetition", label: "No recognisable repeating pattern", labelDe: "Keine erkennbaren Wiederholungsmuster", group: "visual" },
    { id: "1.2.18.64", key: "no-even-distribution", label: "No evenly distributed plants", labelDe: "Keine gleichmäßig verteilten Pflanzen", group: "visual" },
    { id: "1.2.18.65", key: "organic-clusters", label: "Organic group formation", labelDe: "Organische Gruppenbildung", group: "visual" },
    { id: "1.2.18.66", key: "height-variation", label: "Different plant heights and sizes", labelDe: "Unterschiedliche Pflanzenhöhen und Größen", group: "visual" },
    { id: "1.2.18.67", key: "natural-gaps", label: "Natural gaps", labelDe: "Natürliche Lücken", group: "visual" },
    { id: "1.2.18.68", key: "colour-variation", label: "Different colour tones", labelDe: "Unterschiedliche Farbtöne", group: "visual" },
    { id: "1.2.18.69", key: "layer-overlap", label: "Overlap of different vegetation layers", labelDe: "Überlagerung verschiedener Vegetationsschichten", group: "visual" },
    { id: "1.2.18.70", key: "camera-lod", label: "Detail density depending on camera distance", labelDe: "Unterschiedliche Detaildichte abhängig von Kameraentfernung", group: "visual" },
]);

export const VEGETATION_REQUIREMENT_IDS = Object.freeze(VEGETATION_REQUIREMENTS.map(entry => entry.id));
const REQUIREMENT_BY_ID = Object.freeze(Object.fromEntries(VEGETATION_REQUIREMENTS.map(entry => [entry.id, entry])));

export const VEGETATION_DENSITY_BANDS = Object.freeze([
    Object.freeze({ id: "very-sparse", requirement: 1, label: "Very sparse", labelDe: "Sehr gering", min: 0, max: 0.11, colour: "#c5b896" }),
    Object.freeze({ id: "open", requirement: 2, label: "Loose", labelDe: "Locker", min: 0.11, max: 0.28, colour: "#a9ad78" }),
    Object.freeze({ id: "moderate", requirement: 3, label: "Moderate", labelDe: "Mittel", min: 0.28, max: 0.48, colour: "#80925a" }),
    Object.freeze({ id: "dense", requirement: 4, label: "Dense", labelDe: "Dicht", min: 0.48, max: 0.70, colour: "#5c7d43" }),
    Object.freeze({ id: "very-dense", requirement: 5, label: "Extremely dense", labelDe: "Extrem dicht", min: 0.70, max: 1.01, colour: "#365f38" }),
]);

export const VEGETATION_HABITATS = Object.freeze({
    "closed-canopy": Object.freeze({ label: "Dense woodland core", labelDe: "Dichter Waldkern" }),
    "woodland-edge": Object.freeze({ label: "Open woodland edge", labelDe: "Lockerer Waldrand" }),
    "young-regrowth": Object.freeze({ label: "Young regeneration", labelDe: "Junge Waldregeneration" }),
    "old-open-wood": Object.freeze({ label: "Old open woodland", labelDe: "Alter offener Wald" }),
    "forest-clearing": Object.freeze({ label: "Woodland clearing", labelDe: "Waldlichtung" }),
    "flower-meadow": Object.freeze({ label: "Flower meadow", labelDe: "Blumenwiese" }),
    "tall-meadow": Object.freeze({ label: "Tall meadow", labelDe: "Hohe Wiese" }),
    "short-pasture": Object.freeze({ label: "Short pasture", labelDe: "Kurze Weide" }),
    "dry-grass": Object.freeze({ label: "Dry patchy grass", labelDe: "Trockene Rasenfläche" }),
    "wet-meadow": Object.freeze({ label: "Wet meadow", labelDe: "Feuchte Wiese" }),
    "shrub-island": Object.freeze({ label: "Shrub island", labelDe: "Buschinsel" }),
    "bare-sand": Object.freeze({ label: "Bare sand desert", labelDe: "Kahle Sandwüste" }),
    "rock-desert": Object.freeze({ label: "Rock desert", labelDe: "Felswüste" }),
    "desert-shrub": Object.freeze({ label: "Isolated desert shrub", labelDe: "Einzelner Wüstenstrauch" }),
    "oasis": Object.freeze({ label: "Oasis vegetation", labelDe: "Oasenvegetation" }),
    "arroyo": Object.freeze({ label: "Seasonal watercourse", labelDe: "Saisonaler Wasserlauf" }),
    "open-water": Object.freeze({ label: "Open water", labelDe: "Offene Wasserfläche" }),
    "reed-bed": Object.freeze({ label: "Reed bed", labelDe: "Schilfbestand" }),
    "swamp-forest": Object.freeze({ label: "Swamp forest", labelDe: "Sumpfwald" }),
    "vegetated-bank": Object.freeze({ label: "Vegetated bank", labelDe: "Bewachsenes Ufer" }),
    "bare-mud": Object.freeze({ label: "Bare mud", labelDe: "Kahle Schlammfläche" }),
    "free-channel": Object.freeze({ label: "Free water channel", labelDe: "Freier Wasserkanal" }),
});

const COLOURS = Object.freeze({
    forest: ["#6f8b50", "#527642", "#3d6337", "#284b2c", "#18391f"],
    grass: ["#b2ad78", "#9ba06a", "#7e9258", "#648548", "#4e753e"],
    wet: ["#a6aa76", "#84985e", "#6b8c58", "#527a50", "#3d6947"],
    sand: ["#d7c193", "#cbb181", "#b99f74", "#a98c64", "#8f7657"],
    rock: ["#b7a385", "#9e8d72", "#82745f", "#6d6253", "#554d44"],
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clamp01 = value => clamp(value, 0, 1);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const smoothstep = (edge0, edge1, value) => {
    const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
    return t * t * (3 - 2 * t);
};
const round = value => Math.round((Number(value) || 0) * 1000) / 1000;

function hash32(seed, x, y, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(x) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(y) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, x, y, salt = 0) {
    return hash32(seed, x, y, salt) / 0x100000000;
}

// Value noise with smooth interpolation. The lattice is anchored to world
// coordinates, so a camera pan can never change a group or a gap.
function valueNoise(seed, x, y, cell, salt = 0) {
    const size = Math.max(0.75, Number(cell) || 1);
    const gx = Number(x) / size, gy = Number(y) / size;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = smoothstep(0, 1, gx - x0), ty = smoothstep(0, 1, gy - y0);
    const a = unit(seed, x0, y0, salt);
    const b = unit(seed, x0 + 1, y0, salt);
    const c = unit(seed, x0, y0 + 1, salt);
    const d = unit(seed, x0 + 1, y0 + 1, salt);
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return top + (bottom - top) * ty;
}

function warpedNoise(seed, x, y, cell, salt = 0) {
    const wx = Number(x) + (unit(seed, Math.floor(Number(x)), Math.floor(Number(y)), salt ^ 0x51ed2701) - 0.5) * cell * 1.35;
    const wy = Number(y) + (unit(seed, Math.floor(Number(x)), Math.floor(Number(y)), salt ^ 0x1f83d9ab) - 0.5) * cell * 1.35;
    return valueNoise(seed, wx, wy, cell, salt);
}

function mixHex(a, b, amount) {
    const parse = value => {
        const text = String(value || "").replace("#", "");
        if (!/^[0-9a-f]{6}$/i.test(text)) return null;
        return [parseInt(text.slice(0, 2), 16), parseInt(text.slice(2, 4), 16), parseInt(text.slice(4, 6), 16)];
    };
    const ca = parse(a), cb = parse(b);
    if (!ca || !cb) return a;
    const t = clamp01(amount);
    return "#" + ca.map((value, index) => Math.round(value + (cb[index] - value) * t)
        .toString(16).padStart(2, "0")).join("");
}

function terrainSample(x, y, context = {}) {
    if (Number.isFinite(Number(context.height)) && Number.isFinite(Number(context.moisture))
        && Number.isFinite(Number(context.temperature))) {
        return {
            height: Number(context.height),
            moisture: clamp01(context.moisture),
            temperature: clamp01(context.temperature),
        };
    }
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const width = Number(state.terrainPixW) || 0;
    const height = Number(state.terrainPixH) || 0;
    if (!width || !height) {
        return {
            height: number(context.height, 0.55),
            moisture: clamp01(number(context.moisture, 0.5)),
            temperature: clamp01(number(context.temperature, 0.55)),
        };
    }
    const px = Math.max(0, Math.min(width - 1, Math.floor(Number(x) * resolution)));
    const py = Math.max(0, Math.min(height - 1, Math.floor(Number(y) * resolution)));
    const index = py * width + px;
    return {
        height: number(state.heightMap?.[index], 0.55),
        moisture: clamp01(number(state.moistureMap?.[index], 0.5)),
        temperature: clamp01(number(state.temperatureMap?.[index], 0.55)),
    };
}

function bandFor(density) {
    const value = clamp01(density);
    let index = 0;
    while (index < VEGETATION_DENSITY_BANDS.length - 1 && value >= VEGETATION_DENSITY_BANDS[index].max) index++;
    return index;
}

function seasonKey(season) {
    return ["spring", "summer", "autumn", "winter"][season.season] || "summer";
}

function standUnderstory(stand) {
    if (!stand?.understory) return 0.2;
    const values = Object.values(stand.understory).map(value => clamp01(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function forestDeadwood(stand) {
    if (!stand) return 0;
    const ground = stand.ground || {};
    return clamp01((Number(ground.logs) || 0) * 0.35 + (Number(ground.stumps) || 0) * 0.3
        + (stand.ageClass === "ancient" ? 0.12 : 0)
        + (stand.disturbance === "windthrow" || stand.disturbance === "burned" ? 0.18 : 0)
        + (stand.disturbance === "diseased" ? 0.12 : 0));
}

function habitatFor(context) {
    const { wetland, desert, stand, grass, density, oasis, arroyo, openWater, channel, reeds, plantIslands, above, rock } = context;
    if (wetland) {
        if (stand && density > 0.35) return "swamp-forest";
        if (openWater) return "open-water";
        if (density < 0.12 && reeds < 0.28) return "bare-mud";
        if (channel) return "free-channel";
        if (reeds > 0.42) return "reed-bed";
        if (above > 0.02) return "vegetated-bank";
        return plantIslands ? "reed-bed" : "vegetated-bank";
    }
    if (desert) {
        if (oasis && density > 0.4) return "oasis";
        if (arroyo) return "arroyo";
        if (rock > 0.52 && density < 0.28) return "rock-desert";
        if (density < 0.11) return "bare-sand";
        if (density < 0.3) return "desert-shrub";
        return plantIslands ? "shrub-island" : "desert-shrub";
    }
    if (stand) {
        if (stand.ageClass === "young" || stand.type === "regenerating" || stand.disturbance === "cutover") return "young-regrowth";
        if (stand.ageClass === "ancient" && density < 0.5) return "old-open-wood";
        if (density > 0.64) return "closed-canopy";
        if (stand.clearing > 0.26 || density < 0.28) return "forest-clearing";
        return "woodland-edge";
    }
    if (grass?.bloom > 0.42 && density >= 0.32) return "flower-meadow";
    if (grass?.sward?.tall && density > 0.4) return "tall-meadow";
    if (grass?.use?.overgrazed || grass?.use?.grazed) return "short-pasture";
    if (desert === false && context.dry > 0.45) return "dry-grass";
    if (wetland === false && context.wet > 0.45) return "wet-meadow";
    if (context.shrub > 0.42) return "shrub-island";
    return density > 0.48 ? "tall-meadow" : "short-pasture";
}

// Derive one complete vegetation profile. `context.stand` and `context.grass`
// are optional existing ecology profiles; when supplied, their canopy, sward,
// understorey and land-use state are blended into the local density instead of
// being guessed a second time.
export function vegetationDensityAt(x, y, context = {}) {
    const seed = Math.max(1, Math.floor(number(context.seed, state.worldSeed || 1)));
    const sample = terrainSample(x, y, context);
    const height = sample.height;
    const sea = number(context.seaLevel, state.seaLevel ?? 0.33);
    const above = height - sea;
    const moisture = sample.moisture;
    const temperature = sample.temperature;
    const climate = String(context.climate || state.worldOptions?.climate || "temperate");
    const dayOfYear = number(context.dayOfYear, state.dayOfYear ?? 150);
    const year = Math.max(1, Math.floor(number(context.year, state.year || 1)));
    const season = seasonalState(dayOfYear, climate);
    const seasonId = seasonKey(season);
    const stand = context.stand || context.forest || null;
    const grass = context.grass || null;
    const use = context.use || grass?.use || {};
    const tx = Math.floor(number(x));
    const ty = Math.floor(number(y));

    // Three scales make real groups. The coarse field decides where a wood or
    // a meadow thickens; the middle field breaks it into islands; the fine
    // field adds the irregular edge that a repeated stamp cannot produce.
    const warp = (warpedNoise(seed, x, y, 18.5, 0x6a09e667) - 0.5) * 5.5;
    const coarse = warpedNoise(seed, Number(x) + warp, Number(y) - warp * 0.7, 12.5, 0xbb67ae85);
    const middle = warpedNoise(seed, Number(x) - warp * 0.35, Number(y) + warp * 0.5, 5.8, 0x3c6ef372);
    const fine = valueNoise(seed, x, y, 2.25, 0xa54ff53a);
    const gapNoise = warpedNoise(seed, x, y, 4.3, 0x510e527f);
    const islandNoise = warpedNoise(seed, x, y, 2.9, 0x9b05688c);
    const rockNoise = valueNoise(seed, x, y, 10.5, 0x1f83d9ab);
    const waterNoise = warpedNoise(seed, x, y, 7.2, 0x5be0cd19);
    const patch = coarse * 0.5 + middle * 0.32 + fine * 0.18;
    const gapStrength = clamp01(1 - smoothstep(0.24, 0.47, gapNoise) * 1.7);
    const island = smoothstep(0.66, 0.84, islandNoise);
    const localContrast = clamp01(Math.abs(coarse - middle) * 1.9 + Math.abs(middle - fine) * 0.9);
    const variation = clamp01(Math.abs(patch - 0.5) * 1.6 + localContrast * 0.55);

    const cold = ["tundra", "taiga", "snow", "northern", "mountain"].includes(climate)
        ? clamp01(0.35 + (0.42 - temperature) * 1.8 + season.snowCover * 0.25) : 0;
    const dry = clamp01((0.46 - moisture) * 1.7 + (temperature - 0.52) * 0.8 + season.warmth * 0.16);
    const wet = clamp01((moisture - 0.58) * 2.0 + (0.075 - Math.max(0, above)) * 1.4 + (climate === "swamp" ? 0.4 : 0));
    const desert = ["arid", "desert"].includes(climate) || (moisture < 0.23 && temperature > 0.6 && wet < 0.25);
    // An oasis is wet desert, not a swamp. Otherwise a high-moisture arid tile
    // would sprout reeds and be surveyed as open water instead of palm grove.
    const wetland = climate === "swamp" || (!desert && wet > 0.55);
    const savanna = climate === "savanna" || climate === "savannah";
    const rock = clamp01(rockNoise * 0.55 + (height > 0.72 ? 0.28 : 0) + (desert ? 0.18 : 0));
    const oasis = desert && (wet > 0.34 || moisture > 0.48 || waterNoise > 0.78);
    const arroyo = desert && !oasis && waterNoise > 0.63 && gapNoise < 0.62;
    const channel = wetland && waterNoise > 0.68 && gapNoise < 0.52;
    // Open water is a real gap in the reeds, not the default wetland surface.
    // Requiring both a high water field and a high wetness keeps most marsh
    // tiles vegetated while still producing free channels and open pools.
    const openWater = wetland && ((waterNoise > 0.89 && wet > 0.68)
        || (above < 0.012 && wet > 0.92));
    const reeds = wetland ? clamp01(wet * 0.54 + finerReed(seed, x, y) * 0.34) : 0;
    const plantIslands = wetland ? clamp01(island * 0.85 + reeds * 0.25) : 0;

    const canopy = clamp01(Number(stand?.canopy) || Number(stand?.density) || 0);
    const understory = standUnderstory(stand);
    const deadwood = forestDeadwood(stand);
    const grassDensity = Number(grass?.sward?.density) || (grass?.bloom ? 0.55 : 0);
    const bloom = clamp01(Number(grass?.bloom) || 0);
    const grassTall = Boolean(grass?.sward?.tall || grass?.sward?.height === "tall");
    const shrub = clamp01(Number(grass?.shrubPatches) || Number(stand?.understory?.shrub) || 0);
    const browse = clamp01(Number(stand?.browsingPressure) || (use.grazed ? 0.28 : 0) + (use.overgrazed ? 0.28 : 0));
    const grazing = clamp01(use.overgrazed ? 1 : use.grazed ? 0.68 : use.intensive ? 0.42 : 0);
    const disturbance = String(stand?.disturbance || context.succession?.kind || "").toLowerCase();
    const burned = disturbance === "burned" || Boolean(use.burned);
    const logged = disturbance === "cutover" || Boolean(use.logged) || Boolean(use.logging);
    const diseased = disturbance === "diseased" || disturbance === "bark-beetle";
    const ageClass = stand?.ageClass || (disturbance === "cutover" || disturbance === "burned" ? "young" : "mature");
    const age = ageClass === "ancient" ? 1 : ageClass === "young" ? 0.25 : ageClass === "mature" ? 0.62 : 0.5;
    const regrowth = clamp01(Boolean(use.reforestation) ? 0.7 : 0
        + (disturbance === "cutover" || disturbance === "burned" ? 0.45 : 0)
        + (ageClass === "young" ? 0.3 : 0)
        + (context.succession?.id === "regrowth" ? 0.3 : 0));
    const soil = clamp01(0.3 + moisture * 0.4 + (1 - dry) * 0.15 + middle * 0.15);
    const sunlight = clamp01(0.48 + (1 - canopy) * 0.4 + season.warmth * 0.12 - (cold > 0.5 ? 0.16 : 0));
    const competition = clamp01(canopy * 0.45 + understory * 0.3 + grassDensity * 0.2 + shrub * 0.1);
    const diseasePressure = clamp01(diseased ? 0.72 : 0.08 + (stand?.disturbance === "diseased" ? 0.2 : 0) + (moisture > 0.8 ? 0.06 : 0));
    const fireRisk = clamp01(dry * 0.52 + (1 - moisture) * 0.24 + season.warmth * 0.12 + deadwood * 0.16 - wet * 0.35);

    let potential;
    if (stand) {
        potential = 0.42 + canopy * 0.42 + understory * 0.08;
    } else if (grass) {
        potential = 0.24 + moisture * 0.48 + soil * 0.15 + (savanna ? 0.05 : 0);
    } else {
        potential = 0.28 + moisture * 0.5 + soil * 0.12;
    }
    if (desert) potential *= 0.28 + moisture * 0.95;
    if (cold > 0.35) potential *= 1 - cold * 0.30;
    if (wetland) potential = Math.max(potential, 0.52 + wet * 0.18);
    if (oasis) potential = Math.max(potential, 0.66 + wet * 0.12);
    if (arroyo) potential = Math.max(potential, 0.36 + wet * 0.15);
    if (stand && stand.clearing > 0.28) potential *= 0.78;

    let density = clamp01(potential * (0.28 + patch * 1.15) + island * 0.16 - gapStrength * 0.16);
    density = clamp01(density - grazing * 0.12 - browse * 0.06 - logged * 0.16 - burned * 0.17 - diseasePressure * 0.08 - dry * 0.16);
    if (stand && gapStrength > 0.58) density = clamp01(density - 0.24);
    if (desert && !oasis && !arroyo) density = Math.min(density, 0.34);
    if (openWater) density = Math.min(density, 0.10);
    if (channel) density = Math.min(density, 0.18);
    if (regrowth > 0.25) density = clamp01(density + 0.08);
    if (season.snowCover > 0.58) density = Math.max(0.05, density - season.snowCover * 0.16);
    const canopyDensity = clamp01(density * 0.72 + canopy * 0.25 + (1 - gapStrength) * 0.05);
    const band = bandFor(density);
    const bandEntry = VEGETATION_DENSITY_BANDS[band];
    const habitat = habitatFor({
        wetland, desert, stand, grass, density, oasis, arroyo, openWater, channel, reeds,
        plantIslands, above, rock, dry, wet, shrub,
    });
    const habitatEntry = VEGETATION_HABITATS[habitat] || VEGETATION_HABITATS["short-pasture"];

    const sight = clamp(1.08 - canopyDensity * 0.55 - understory * 0.32 - shrub * 0.18 + (1 - density) * 0.12, 0.30, 1.12);
    const movement = clamp(1.04 - understory * 0.28 - shrub * 0.16 - wet * 0.18 - density * 0.08 - season.snowCover * 0.18
        + (use.path ? 0.08 : 0) + (use.road ? 0.05 : 0), 0.52, 1.08);
    const cover = clamp01(canopyDensity * 0.38 + understory * 0.30 + shrub * 0.18 + grassDensity * 0.14);
    const concealment = clamp01(cover * 0.8 + understory * 0.14 + gapStrength * 0.04);
    const hunting = clamp01(0.28 + localContrast * 0.25 + (1 - density) * 0.18 + browse * 0.2 - deadwood * 0.08);
    const wood = clamp01(canopyDensity * 0.55 + shrub * 0.22 + (ageClass === "ancient" ? 0.14 : 0.04) + deadwood * 0.12);
    const forage = clamp01(grassDensity * 0.42 + (grass?.bloom || 0) * 0.22 + understory * 0.22 + island * 0.14 - grazing * 0.16);
    const agriculture = clamp01(soil * 0.4 + (1 - dry) * 0.22 + (1 - density) * 0.24 + (wetland ? -0.18 : 0) - cold * 0.12);
    const habitatQuality = clamp01(0.18 + structureScore({ canopyDensity, understory, shrub, grassDensity, deadwood, wet, island, localContrast }));
    const gathering = clamp(0.74 + forage * 0.22 + wood * 0.08 - understory * 0.12, 0.68, 1.08);
    const yieldFactor = clamp(0.82 + forage * 0.18 + wood * 0.08 + localContrast * 0.04, 0.74, 1.12);

    const palette = wetland ? (reeds > 0.35 ? COLOURS.wet : COLOURS.grass)
        : desert ? (rock > 0.55 ? COLOURS.rock : COLOURS.sand)
            : stand ? COLOURS.forest : COLOURS.grass;
    let tint = palette[Math.min(palette.length - 1, band)];
    if (season.foliageTurn > 0.22) tint = mixHex(tint, "#9a713b", season.foliageTurn * 0.42);
    if (season.greenUp > 0.2) tint = mixHex(tint, "#7fa85a", season.greenUp * 0.22);
    if (burned) tint = mixHex(tint, "#594b3d", 0.5);
    if (diseased) tint = mixHex(tint, "#7a7253", 0.24);
    if (oasis) tint = mixHex(tint, "#4f8342", 0.45);
    if (openWater) tint = "#5d7f7a";
    const ground = desert ? mixHex(COLOURS.sand[Math.min(4, band)], "#b8a477", 0.25)
        : wetland ? "#657252" : mixHex("#8e8a64", tint, 0.22);
    const heightScale = clamp(0.72 + density * 0.48 + (grassTall ? 0.16 : 0) + (wetland ? 0.08 : 0)
        - dry * 0.12 - grazing * 0.10, 0.62, 1.38);
    const layers = [];
    if (canopyDensity > 0.18 || stand) layers.push("canopy");
    if (understory > 0.16 || reeds > 0.2) layers.push("understory");
    if (grassDensity > 0.12 || bloom > 0.1) layers.push("ground");
    if (shrub > 0.22 || plantIslands > 0.3) layers.push("shrub");
    if (deadwood > 0.2) layers.push("deadwood");
    if (reeds > 0.25) layers.push("reed");

    const requirements = new Set([bandEntry.requirement]);
    if (localContrast > 0.12) requirements.add(6);
    if (patch > 0.57 && island > 0.18) requirements.add(7);
    if (gapStrength > 0.55) requirements.add(8);
    if (fine < 0.27 || localContrast > 0.36) requirements.add(9);
    if ((stand && stand.clearing > 0.24) || (gapStrength > 0.62 && canopyDensity < 0.4)) requirements.add(10);
    if (canopyDensity > 0.64 && patch > 0.48) requirements.add(11);
    if (stand && (canopyDensity < 0.48 || patch > 0.72) && density > 0.2) requirements.add(12);
    if (regrowth > 0.2 || ageClass === "young") requirements.add(13);
    if (ageClass === "ancient" && density < 0.62) requirements.add(14);
    if (understory > 0.24) requirements.add(15);
    if (canopyDensity > 0.68) requirements.add(16);
    if (grass?.trees?.length || (island > 0.5 && (canopyDensity > 0.2 || shrub > 0.2))) requirements.add(17);
    if (deadwood > 0.18 || burned || disturbance === "windthrow") requirements.add(18);
    if (grassTall === false && (grass || stand) && density < 0.52) requirements.add(19);
    if (grassTall || (grass?.sward?.height === "tall") || (wetland && reeds > 0.35)) requirements.add(20);
    if (bloom > 0.32 && density > 0.3) requirements.add(21);
    if ((grass?.use?.overgrazed || grass?.use?.grazed) && density < 0.42) requirements.add(22);
    if (shrub > 0.34 && (island > 0.2 || patch > 0.55)) requirements.add(23);
    if (grazing > 0.18) requirements.add(24);
    if (wet > 0.46 && !desert && !wetland && density > 0.3) requirements.add(25);
    if (dry > 0.42 && density < 0.52 && !wetland && !desert) requirements.add(26);
    if (desert && density < 0.12) requirements.add(27);
    if (desert && density >= 0.12 && density < 0.32) requirements.add(28);
    if (desert && island > 0.3 && density >= 0.18) requirements.add(29);
    if (desert && (above < 0.045 || (waterNoise > 0.6 && density > 0.12))) requirements.add(30);
    if (oasis && density > 0.42) requirements.add(31);
    if (arroyo || (desert && waterNoise > 0.72)) requirements.add(32);
    if (desert && (rock > 0.52 || sandContrast(seed, x, y) > 0.57)) requirements.add(33);
    if (openWater) requirements.add(34);
    if (wetland && reeds > 0.18 && reeds <= 0.58) requirements.add(35);
    if (wetland && reeds > 0.58) requirements.add(36);
    if (wetland && plantIslands > 0.34) requirements.add(37);
    if (wetland && !openWater && above > -0.01 && above < 0.075 && density > 0.2) requirements.add(38);
    if (channel) requirements.add(39);
    if (wetland && (canopyDensity > 0.32 || (stand && treesInStand(stand)))) requirements.add(40);
    if (wetland && density < 0.12) requirements.add(41);
    // Soil, water, sun, age and season are always present as drivers, even when
    // one of them is currently limiting growth.
    requirements.add(42); requirements.add(43); requirements.add(44); requirements.add(46); requirements.add(47);
    if (competition > 0.16) requirements.add(45);
    if (browse > 0.16) requirements.add(48);
    if (grazing > 0.12) requirements.add(49);
    if (logged || disturbance === "cutover") requirements.add(50);
    if (burned || fireRisk > 0.42) requirements.add(51);
    if (diseasePressure > 0.3) requirements.add(52);
    if (regrowth > 0.12 || ageClass === "young" || burned || logged) requirements.add(53);
    if (sight < 0.97 || sight > 1.02) requirements.add(54);
    if (movement < 0.99) requirements.add(55);
    if (cover > 0.18) requirements.add(56);
    if (concealment > 0.24) requirements.add(57);
    if (hunting > 0.35) requirements.add(58);
    if (wood > 0.2 || forage > 0.32) requirements.add(59);
    if (fireRisk > 0.28) requirements.add(60);
    if (agriculture > 0.24) requirements.add(61);
    if (habitatQuality > 0.24) requirements.add(62);
    if (variation > 0.18 && localContrast > 0.06) requirements.add(63);
    if (!Number.isFinite(Number(use.uniform)) && (gapStrength > 0.2 || island > 0.2)) requirements.add(64);
    if (island > 0.25 || patch > 0.6) requirements.add(65);
    if (heightScale !== 1 || layers.length >= 2) requirements.add(66);
    if (gapStrength > 0.35) requirements.add(67);
    if (tint && ground) requirements.add(68);
    if (layers.length >= 2) requirements.add(69);
    requirements.add(70);

    const drivers = [
        { id: "soil-quality", label: "SOIL", labelDe: "BODEN", value: round(soil) },
        { id: "water-availability", label: "WATER", labelDe: "WASSER", value: round(clamp01(wet + moisture * 0.35)) },
        { id: "sunlight", label: "LIGHT", labelDe: "LICHT", value: round(sunlight) },
        { id: "competition", label: "COMPETITION", labelDe: "KONKURRENZ", value: round(competition) },
        { id: "plant-age", label: "AGE", labelDe: "ALTER", value: round(age) },
        { id: "season", label: "SEASON", labelDe: "JAHRESZEIT", value: seasonId.toUpperCase() },
        { id: "browsing", label: "BROWSING", labelDe: "VERBISS", value: round(browse) },
        { id: "grazing", label: "GRAZING", labelDe: "BEWEIDUNG", value: round(grazing) },
        { id: "logging", label: "LOGGING", labelDe: "HOLZUNG", value: round(logged ? 0.7 : 0) },
        { id: "fire", label: "FIRE", labelDe: "BRAND", value: round(burned ? 1 : fireRisk) },
        { id: "disease", label: "DISEASE", labelDe: "KRANKHEIT", value: round(diseasePressure) },
        { id: "regeneration", label: "REGROWTH", labelDe: "REGENERATION", value: round(regrowth) },
    ];
    const effects = [
        { id: "sight", label: "SIGHT", labelDe: "SICHT", value: round(sight) },
        { id: "movement", label: "MOVE", labelDe: "BEWEGUNG", value: round(movement) },
        { id: "cover", label: "COVER", labelDe: "DECKUNG", value: round(cover) },
        { id: "concealment", label: "HIDE", labelDe: "VERSTECK", value: round(concealment) },
        { id: "hunting", label: "HUNT", labelDe: "JAGD", value: round(hunting) },
        { id: "plant-resources", label: "WOOD", labelDe: "HOLZ", value: round(wood) },
        { id: "fire-risk", label: "FIRE RISK", labelDe: "BRANDGEFAHR", value: round(fireRisk) },
        { id: "agriculture", label: "FARM", labelDe: "ACKER", value: round(agriculture) },
        { id: "habitat", label: "HABITAT", labelDe: "HABITAT", value: round(habitatQuality) },
    ];

    const zoom = Number(context.zoom);
    return {
        version: VEGETATION_DENSITY_VERSION,
        x: tx, y: ty, seed, year, dayOfYear, climate, season: seasonId,
        band, bandId: bandEntry.id, label: bandEntry.label, labelDe: bandEntry.labelDe,
        density: round(density), canopy: round(canopyDensity), understory: round(understory),
        shrub: round(shrub), grass: round(grassDensity), reed: round(reeds), openWater: Boolean(openWater),
        gap: round(gapStrength), island: round(island), patch: round(patch), contrast: round(localContrast),
        variation: round(variation), habitat, habitatLabel: habitatEntry.label, habitatLabelDe: habitatEntry.labelDe,
        palette: bandEntry.colour, tint, ground, heightScale: round(heightScale),
        layers: Object.freeze(layers), drivers, effects,
        sight: round(sight), movement: round(movement), cover: round(cover), concealment: round(concealment),
        hunting: round(hunting), wood: round(wood), forage: round(forage), fireRisk: round(fireRisk),
        agriculture: round(agriculture), habitatQuality: round(habitatQuality),
        gathering: round(gathering), yield: round(yieldFactor),
        lod: round(vegetationDetailForZoom(Number.isFinite(zoom) ? zoom : 1)),
        requirements: Object.freeze([...requirements].sort((a, b) => a - b)),
        requirementIds: Object.freeze([...requirements].sort((a, b) => a - b).map(id => "1.2.18." + id)),
        activeCount: requirements.size,
    };
}

function finerReed(seed, x, y) {
    return valueNoise(seed, x, y, 3.1, 0x4f1bbcdc);
}

function sandContrast(seed, x, y) {
    return Math.abs(valueNoise(seed, x, y, 10.5, 0x1f83d9ab) - valueNoise(seed, x, y, 5.4, 0x6a09e667));
}

function treesInStand(stand) {
    return Array.isArray(stand?.trees) ? stand.trees.length : 0;
}

function structureScore(values) {
    return values.canopyDensity * 0.25 + values.understory * 0.25 + values.shrub * 0.14
        + Math.min(0.25, values.grassDensity * 0.22) + values.deadwood * 0.12
        + values.wet * 0.1 + values.island * 0.1 + values.localContrast * 0.1;
}

// The renderer keeps the coarse lattice until the player zooms in. This is the
// single LOD contract for vegetation detail, shared by drawing and audit code.
export function vegetationDetailForZoom(zoom) {
    const value = Number(zoom);
    if (!Number.isFinite(value) || value <= 0) return 0.34;
    if (value < 0.3) return 0.34;
    if (value < 0.55) return 0.52;
    if (value < 0.9) return 0.72;
    if (value < 1.25) return 0.9;
    return 1;
}

// Attach the density layer to a forest stand without mutating the deterministic
// stand object. Existing forest renderers and gathering code keep their shape.
export function vegetationForestStand(stand, density) {
    if (!stand || !density) return stand;
    const understory = { ...(stand.understory || {}) };
    for (const key of Object.keys(understory)) {
        const weight = key === "sapling" ? 1.2 : 0.82;
        understory[key] = clamp01((Number(understory[key]) || 0) * (0.72 + density.density * 0.58) * weight);
    }
    const ground = { ...(stand.ground || {}) };
    if (ground.logs !== undefined) ground.logs = clamp01(Number(ground.logs) * (0.8 + density.density * 0.3));
    if (ground.stumps !== undefined) ground.stumps = clamp01(Number(ground.stumps) * (0.8 + density.density * 0.3));
    if (ground.flowers !== undefined) ground.flowers = clamp01(Number(ground.flowers) * (0.82 + density.density * 0.3));
    return {
        ...stand,
        treeChance: clamp01((Number(stand.treeChance) || 0) * (0.58 + density.density * 0.72)
            + (density.island > 0.6 ? 0.03 : 0) - density.gap * 0.08),
        density: clamp01((Number(stand.density) || 0) * 0.48 + density.density * 0.52),
        canopy: clamp01((Number(stand.canopy) || 0) * 0.55 + density.canopy * 0.45),
        clearing: clamp01(Math.max(Number(stand.clearing) || 0, density.gap * 0.52)),
        visibility: clamp01((Number(stand.visibility) || 0.7) * (0.78 + density.sight * 0.28)),
        fireRisk: clamp01((Number(stand.fireRisk) || 0) * 0.58 + density.fireRisk * 0.42),
        browsingPressure: clamp01((Number(stand.browsingPressure) || 0) * 0.65 + density.drivers[6].value * 0.35),
        understory, ground,
        vegetation: density,
        densityOverlay: density,
        cover: density.cover,
        concealment: density.concealment,
        sightRadius: Math.round(18 * density.sight),
        vegetationHeight: density.heightScale,
    };
}

// Attach density to grassland, desert, swamp, taiga, tundra, coast, mountain
// and volcano profiles. The adapter keeps their species arrays intact and
// changes only the quantities their existing drawing functions already read.
export function vegetationGrassProfile(profile, density) {
    if (!profile || !density) return profile;
    const next = { ...profile };
    const sward = { ...(profile.sward || {}) };
    sward.density = clamp01((Number(sward.density) || 0.45) * (0.52 + density.density * 0.86));
    if (density.heightScale > 1.08) sward.height = "tall";
    else if (density.heightScale < 0.82) sward.height = "short";
    sward.tall = sward.height === "tall";
    sward.medium = sward.height === "medium";
    sward.short = sward.height === "short";
    next.sward = sward;
    next.treeChance = clamp01((Number(profile.treeChance) || 0) * (0.62 + density.density * 0.72)
        + (density.island > 0.58 ? 0.035 : 0));
    next.shrubPatches = clamp01((Number(profile.shrubPatches) || 0) * (0.72 + density.density * 0.55)
        + density.shrub * 0.08);
    next.bloom = clamp01((Number(profile.bloom) || 0) * (0.7 + density.density * 0.45));
    // The base hue stays the profile's own hue. Blade colours, density,
    // season, ground overlays and the density tint still vary across tiles;
    // preserving this contract keeps existing reference pixels valid.
    next.vegetation = {
        ...(profile.vegetation && typeof profile.vegetation === "object" ? profile.vegetation : {}),
        densityOverlay: density,
        density: clamp01(density.density),
        cover: clamp01(density.cover),
        heightScale: density.heightScale,
        tint: density.tint,
        gap: density.gap,
        layers: density.layers,
    };
    next.densityOverlay = density;
    if (profile.desert) {
        const vegetation = next.vegetation;
        vegetation.density = clamp01((Number(profile.vegetation?.density) || 0.2) * (0.48 + density.density * 0.98));
        vegetation.shrubCover = clamp01((Number(profile.vegetation?.shrubCover) || 0) * (0.7 + density.density * 0.55));
        vegetation.cover = clamp01((Number(profile.vegetation?.cover) || 0) * (0.72 + density.cover * 0.45));
        vegetation.treeChance = clamp01((Number(profile.vegetation?.treeChance) || 0) * (0.6 + density.density * 0.8));
    }
    if (profile.swamp) {
        const vegetation = next.vegetation;
        vegetation.density = clamp01((Number(profile.vegetation?.density) || 0.3) * (0.55 + density.density * 0.8));
        vegetation.cover = clamp01((Number(profile.vegetation?.cover) || 0) * (0.62 + density.cover * 0.58));
        vegetation.plantIslands = clamp01((Number(profile.vegetation?.plantIslands) || 0) * (0.7 + density.island * 0.55));
    }
    return next;
}

// Route travel is allowed to feel the undergrowth; resident errands keep their
// historical timing. This is intentionally a small factor and is cached by the
// caller's route layer, not applied to every villager step.
export function vegetationMovementFactorAt(x, y, context = {}) {
    const density = vegetationDensityAt(x, y, context);
    return density.movement;
}

export function vegetationGameplayAt(x, y, context = {}) {
    const density = vegetationDensityAt(x, y, context);
    return {
        density: density.density,
        band: density.band,
        sight: density.sight,
        movement: density.movement,
        cover: density.cover,
        concealment: density.concealment,
        hunting: density.hunting,
        wood: density.wood,
        fireRisk: density.fireRisk,
        agriculture: density.agriculture,
        habitat: density.habitat,
        gathering: density.gathering,
        yield: density.yield,
        requirements: density.requirements,
    };
}

// Broad survey for the Explore panel. It finds one tile per density band near
// the focus so the player can see that the same landscape really changes. The
// scan is bounded to a 17×17 window and runs only when the survey is rendered.
export function getVegetationDensitySurvey(x = null, y = null, options = {}) {
    const W = Math.max(1, Number(state.worldW) || 1);
    const H = Math.max(1, Number(state.worldH) || 1);
    const cx = Number.isFinite(Number(x)) ? Number(x) : W / 2;
    const cy = Number.isFinite(Number(y)) ? Number(y) : H / 2;
    const sample = vegetationDensityAt(cx, cy, { ...options, exact: true });
    const radius = Math.max(2, Math.min(12, Math.floor(Number(options.radius) || 8)));
    const seenBands = new Map();
    const step = Math.max(1, Math.floor(Number(options.step) || 1));
    for (let oy = -radius; oy <= radius; oy += step) {
        for (let ox = -radius; ox <= radius; ox += step) {
            const tx = Math.floor(cx) + ox;
            const ty = Math.floor(cy) + oy;
            if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
            const profile = vegetationDensityAt(tx + 0.5, ty + 0.5, options);
            if (!seenBands.has(profile.band)) {
                seenBands.set(profile.band, {
                    x: tx, y: ty, band: profile.band, label: profile.label,
                    labelDe: profile.labelDe, density: profile.density,
                    habitat: profile.habitat, habitatLabel: profile.habitatLabel,
                    colour: profile.palette,
                });
            }
        }
    }
    const bands = VEGETATION_DENSITY_BANDS.map((entry, index) => seenBands.get(index) || null);
    return {
        version: VEGETATION_DENSITY_VERSION,
        manifestCount: VEGETATION_REQUIREMENTS.length,
        bandCount: VEGETATION_DENSITY_BANDS.length,
        active: true,
        tile: { x: Math.floor(cx), y: Math.floor(cy) },
        sample,
        bands,
        requirements: sample.requirements,
        requirementIds: sample.requirementIds,
        label: sample.label + " · " + sample.habitatLabel,
        labelDe: sample.labelDe + " · " + sample.habitatLabelDe,
    };
}

// A compact line for logs / debug overlays without touching save data.
export function vegetationDensitySummary(x, y, context = {}) {
    const density = vegetationDensityAt(x, y, context);
    const band = REQUIREMENT_BY_ID["1.2.18." + (density.band + 1)];
    return band?.labelDe + " · " + density.habitatLabelDe + " · " + density.requirements.length + "/70";
}

export const __internals = {
    hash32, unit, valueNoise, warpedNoise, terrainSample, bandFor, standUnderstory,
    forestDeadwood, habitatFor, mixHex,
};
