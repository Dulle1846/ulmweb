// Regional building forms: the visible construction tradition of a settlement,
// derived from the climate and terrain around each structure. A timber cottage
// in the taiga is a log house, a tropical home stands on stilts, a savanna home
// carries thatch and a mountain yard sits on a stone foot.
//
// The form is derived, never saved: the same building, seed and site always
// produce the same form after a load. It adds no per-tick simulation; the
// renderer reads it from a small cache and the settlement uses its insulation
// factor when a hearth draws firewood.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";

export const BUILDING_FORM_VERSION = 1;

export const BUILDING_FORMS = Object.freeze({
    "timber-frame": Object.freeze({
        id: "timber-frame", label: "Timber frame", accent: "frame",
        description: "Oak posts and a braced frame with infill panels; the temperate carpenter's standard.",
        insulation: 1.02, wallShift: 5, roofShift: 3,
    }),
    "log-house": Object.freeze({
        id: "log-house", label: "Log house", accent: "logs",
        description: "Stacked spruce and pine logs with mossed joints; slow-grown northern timber holds the heat.",
        insulation: 1.05, wallShift: -9, roofShift: -9,
    }),
    "plank-house": Object.freeze({
        id: "plank-house", label: "Plank house", accent: "planks",
        description: "Sawn boards over a light frame; quick to raise where the sawmill runs dry and true.",
        insulation: 0.99, wallShift: 3, roofShift: -2,
    }),
    "stilt-house": Object.freeze({
        id: "stilt-house", label: "Stilt house", accent: "stilts",
        description: "Raised on mangrove and bamboo piles above wet ground, with a steep rain roof.",
        insulation: 0.94, wallShift: 7, roofShift: 2,
    }),
    "stone-foot": Object.freeze({
        id: "stone-foot", label: "Stone-footed house", accent: "stone",
        description: "A masonry base and a timber upper floor; the Mediterranean and mountain answer to weather.",
        insulation: 1.07, wallShift: -4, roofShift: -5,
    }),
    "thatch-house": Object.freeze({
        id: "thatch-house", label: "Thatched house", accent: "thatch",
        description: "A round thatched roof over a light wall; dry-season building with grass and thorn.",
        insulation: 0.97, wallShift: 5, roofShift: 9,
    }),
    "turf-house": Object.freeze({
        id: "turf-house", label: "Turf house", accent: "turf",
        description: "Turf sods over a low timber shell; the deepest insulation the treeless edge can offer.",
        insulation: 1.09, wallShift: -7, roofShift: -12,
    }),
});

const FORM_TYPES = new Set([
    TYPE.HOUSE, TYPE.STONE_HOUSE, TYPE.WEATHER_HOUSE,
    TYPE.WAREHOUSE, TYPE.SAWMILL, TYPE.LUMBER, TYPE.FORESTER, TYPE.FOREST_WORKS,
    TYPE.SHIPYARD, TYPE.PAPER_MILL,
    TYPE.FARM, TYPE.STABLE, TYPE.TAVERN, TYPE.BAKERY, TYPE.BREWERY,
    TYPE.MASON, TYPE.SMITHY, TYPE.BARREL,
]);

const cache = new Map();
const CACHE_LIMIT = 900;
let cacheSeed = null;

function terrainAt(x, y) {
    const res = Number(state.terrainResolution) || 1;
    const width = Number(state.terrainPixW) || 0, height = Number(state.terrainPixH) || 0;
    const px = Math.floor((Number(x) + 0.5) * res), py = Math.floor((Number(y) + 0.5) * res);
    if (!width || !height || px < 0 || py < 0 || px >= width || py >= height) {
        return { height: 0.4, moisture: 0.5, temperature: 0.55 };
    }
    const index = py * width + px;
    return {
        height: Number(state.heightMap?.[index]) || 0,
        moisture: Number(state.moistureMap?.[index]) || 0.5,
        temperature: Number(state.temperatureMap?.[index] ?? 0.55) || 0,
    };
}

function hashFor(entity) {
    const text = String(entity.id ?? "") + ":" + Math.floor(Number(entity.x) || 0) + ":" + Math.floor(Number(entity.y) || 0);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function chooseForm(entity, climate, terrain, roll) {
    const tropical = climate === "tropical" || climate === "jungle";
    if (tropical) return terrain.moisture > 0.52 || terrain.height < 0.3 ? "stilt-house" : "plank-house";
    if (climate === "swamp") return "stilt-house";
    if (climate === "savanna") return "thatch-house";
    if (climate === "taiga" || climate === "snow") return "log-house";
    if (climate === "tundra") return "turf-house";
    if (climate === "mountain") return terrain.height > 0.64 ? "stone-foot" : "log-house";
    if (climate === "volcanic") return "stone-foot";
    if (climate === "coastal") return terrain.temperature > 0.62 ? "stone-foot" : "timber-frame";
    if (entity.type === TYPE.STONE_HOUSE) return "stone-foot";
    if (terrain.height > 0.72) return "stone-foot";
    if (roll < 56) return "timber-frame";
    if (roll < 82) return "plank-house";
    return "log-house";
}

// Returns null for monument types whose authored silhouette should not be
// overridden by a regional dwelling form.
export function buildingFormFor(entity) {
    if (!entity || !FORM_TYPES.has(entity.type)) return null;
    const seed = Number(state.worldSeed) || 1;
    if (cacheSeed !== seed) {
        cache.clear();
        cacheSeed = seed;
    }
    const key = String(entity.id ?? "") + ":" + entity.type + ":" + Math.floor(Number(entity.x) || 0) + ":" + Math.floor(Number(entity.y) || 0);
    const cached = cache.get(key);
    if (cached) return cached;
    const climate = String(state.worldOptions?.climate || "temperate");
    const terrain = terrainAt(entity.x, entity.y);
    const hash = hashFor(entity);
    const form = BUILDING_FORMS[chooseForm(entity, climate, terrain, hash % 100)] || BUILDING_FORMS["timber-frame"];
    const value = Object.freeze({
        ...form,
        climate,
        warmthPercent: Math.round((form.insulation - 1) * 100),
    });
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, value);
    return value;
}

export function clearBuildingFormCache() {
    cache.clear();
    cacheSeed = null;
}
