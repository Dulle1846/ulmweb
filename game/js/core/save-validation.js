// Pure, DOM-free validation and normalization for imported realm snapshots.
// Validation never changes its input. Normalization returns a shallow copy
// with new resource maps and must run before the snapshot is loaded.
import { TYPE } from "./types.js";
import { ROAD_TYPES } from "../systems/roads.js";
import { validateCitySnapshot } from "../systems/logistics.js";
import { validateResourceGeographySnapshot } from "../systems/resource-geography.js";
import { validateForestFaunaSnapshot } from "../systems/forest-fauna.js";
import { validateForestGatheringSnapshot } from "../systems/forest-gathering.js";
import { validateForestSuccessionSnapshot } from "../systems/forest-succession.js";
import { validatePannage } from "../systems/forest-pannage.js";
import { validateMilitaryState } from "../systems/military.js";
import { validateNobilityState } from "../systems/nobility.js";
import { validateHealthState } from "../systems/health.js";
import { validateFaithState } from "../systems/faith.js";
import { validateJusticeState } from "../systems/justice.js";
import { validateIdentity } from "../systems/identity.js";
import { validateResearchState } from "../systems/research.js";
import { validateLegacyState } from "../systems/legacy.js";
import { validatePopulationState } from "../systems/population-register.js";
import { validateRealmCycleState } from "../systems/realm-cycle.js";
import { validateExpeditionsState } from "../systems/expeditions.js";
import { validateAiChronicleState } from "./ai-chronicle-state.js";
import { validateEventTimelineState } from "./event-timeline.js";
import { validateCraftedItems } from "../systems/item-lexicon.js";
import { resolveWorldDimensions } from "../world/terrain-model.js";

export const SAVE_SCHEMA_VERSION = 11;

const RESOURCE_KEYS = Object.freeze(["wood", "stone", "gold", "food"]);
const RESOURCE_KEY_SET = new Set(RESOURCE_KEYS);
const NUMERIC_STRING = /^-?(?:\d+)(?:\.\d+)?$/;
const MAX_SAFE_BALANCE = Number.MAX_SAFE_INTEGER;
const SAVE_MOBILE_TYPES = new Set([
    TYPE.VILLAGER, TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT, TYPE.PRIEST,
    TYPE.DRAGON, TYPE.DEER, TYPE.GOBLIN, TYPE.ORC, TYPE.TROLL
]);

export class SaveValidationError extends Error {
    constructor(message, { code = "SAVE_VALIDATION_FAILED", field = null, valueType = null, phase = "snapshot", saveVersion = null } = {}) {
        super(message);
        this.name = "SaveValidationError";
        this.code = code;
        this.field = field;
        this.valueType = valueType;
        this.phase = phase;
        this.saveVersion = saveVersion;
    }
}

function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}

function fail(message, details = {}) {
    throw new SaveValidationError(message, details);
}

function invalidResource(message, field, value, code = "INVALID_RESOURCE_VALUE") {
    fail(message + " Your current realm was not changed.", {
        code, field, valueType: typeOf(value), phase: "resources"
    });
}

function normalizeResourceValue(value, field, { allowNegative = false } = {}) {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) invalidResource("Save data contains an invalid " + field + " resource balance.", field, value);
        if (!allowNegative && value < 0) invalidResource("Save data contains a negative " + field + " resource balance.", field, value);
        if (Math.abs(value) > MAX_SAFE_BALANCE) invalidResource("Save data contains an out-of-range " + field + " resource balance.", field, value, "RESOURCE_OUT_OF_RANGE");
        return value;
    }
    if (typeof value === "string") {
        if (!NUMERIC_STRING.test(value)) invalidResource("Save data contains an invalid " + field + " resource balance.", field, value);
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) invalidResource("Save data contains an invalid " + field + " resource balance.", field, value);
        if (!allowNegative && numeric < 0) invalidResource("Save data contains a negative " + field + " resource balance.", field, value);
        if (Math.abs(numeric) > MAX_SAFE_BALANCE) invalidResource("Save data contains an out-of-range " + field + " resource balance.", field, value, "RESOURCE_OUT_OF_RANGE");
        return numeric;
    }
    invalidResource("Save data contains an invalid " + field + " resource balance.", field, value);
}

// Builds a new map. The input map is never written to, including when a later
// key turns out to be invalid.
function normalizeResourceMap(resources, label, { allowNegative = false } = {}) {
    if (resources === undefined) return undefined;
    if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
        fail("Save data contains an invalid " + label + " map.", { code: "INVALID_RESOURCE_MAP", field: label, valueType: typeOf(resources), phase: "resources" });
    }
    for (const key of Object.keys(resources)) {
        if (!RESOURCE_KEY_SET.has(key)) {
            fail("Save data contains an unknown " + label + " key: " + key + ".", { code: "UNKNOWN_RESOURCE_KEY", field: label + "." + key, valueType: "key", phase: "resources" });
        }
    }
    const normalized = { ...resources };
    for (const key of RESOURCE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(resources, key)) continue;
        normalized[key] = normalizeResourceValue(resources[key], allowNegative ? label + "." + key : key, { allowNegative });
    }
    return normalized;
}

function validateResourceMap(resources, label, options = {}) {
    normalizeResourceMap(resources, label, options);
}

// Returns a new snapshot object. Only the resource maps are copied because
// those are the only fields normalization changes. The input snapshot and the
// live game state are never used as normalization targets.
export function normalizeSaveSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return snapshot;
    const normalized = { ...snapshot };
    if (Object.prototype.hasOwnProperty.call(snapshot, "resources")) {
        normalized.resources = normalizeResourceMap(snapshot.resources, "resources");
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, "incomeThisTick")) {
        normalized.incomeThisTick = normalizeResourceMap(snapshot.incomeThisTick, "incomeThisTick", { allowNegative: true });
    }
    return normalized;
}

function validateDomainSnapshot(snapshot, phase, validator) {
    try {
        validator(snapshot);
    } catch (error) {
        if (error instanceof SaveValidationError) throw error;
        fail(error?.message || "Save data contains an invalid " + phase + " state.", {
            code: "SAVE_VALIDATION_FAILED", phase, valueType: typeof snapshot
        });
    }
}

export function validateSaveSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        fail("Save data is not a valid realm object.", { code: "INVALID_SNAPSHOT", phase: "structure", valueType: typeOf(snapshot) });
    }
    if (snapshot.saveSchemaVersion !== undefined) {
        const version = Number(snapshot.saveSchemaVersion);
        if (!Number.isSafeInteger(version) || version < 0) {
            fail("Save data has an invalid save schema version.", { code: "INVALID_SAVE_VERSION", field: "saveSchemaVersion", valueType: typeOf(snapshot.saveSchemaVersion), phase: "structure" });
        }
        if (version > SAVE_SCHEMA_VERSION) {
            fail("Save data was written by a newer game build (schema " + version + ").", { code: "NEWER_SAVE_VERSION", field: "saveSchemaVersion", valueType: typeOf(snapshot.saveSchemaVersion), phase: "structure", saveVersion: version });
        }
    }
    if (!Number.isSafeInteger(Number(snapshot.worldSeed)) || Number(snapshot.worldSeed) <= 0) {
        fail("Save data has an invalid world seed.", { code: "INVALID_WORLD_SEED", field: "worldSeed", valueType: typeOf(snapshot.worldSeed), phase: "structure" });
    }
    if (!Array.isArray(snapshot.entities) || snapshot.entities.length > 900) {
        fail("Save data has an invalid or oversized entity list.", { code: "INVALID_ENTITY_LIST", field: "entities", valueType: typeOf(snapshot.entities), phase: "entities" });
    }
    let mobile = 0;
    const validTypes = new Set(Object.values(TYPE));
    for (const [index, dto] of snapshot.entities.entries()) {
        if (!dto || typeof dto !== "object" || !validTypes.has(dto.type) || !Number.isFinite(dto.x) || !Number.isFinite(dto.y)) {
            fail("Save data contains an invalid entity at position " + index + ".", { code: "INVALID_ENTITY", field: "entities[" + index + "]", valueType: typeOf(dto), phase: "entities" });
        }
        if (!dto.dead && SAVE_MOBILE_TYPES.has(dto.type)) mobile++;
        if (dto.layout !== undefined && dto.layout !== null && (typeof dto.layout !== "object" || !Array.isArray(dto.layout.cells) || dto.layout.cells.length > 225)) {
            fail("Save data contains an invalid floor plan at position " + index + ".", { code: "INVALID_LAYOUT", field: "entities[" + index + "].layout", valueType: typeOf(dto.layout), phase: "entities" });
        }
        if (dto.roomFurniture !== undefined && dto.roomFurniture !== null && (typeof dto.roomFurniture !== "object" || Array.isArray(dto.roomFurniture) || Object.keys(dto.roomFurniture).length > 64)) {
            fail("Save data contains invalid room furniture at position " + index + ".", { code: "INVALID_FURNITURE", field: "entities[" + index + "].roomFurniture", valueType: typeOf(dto.roomFurniture), phase: "entities" });
        }
    }
    if (mobile > 420) {
        fail("Save data exceeds the supported mobile population limit.", { code: "MOBILE_LIMIT", field: "entities", phase: "entities" });
    }

    validateResourceMap(snapshot.resources, "resources");
    // incomeThisTick is a net value: expenses legitimately make it negative.
    validateResourceMap(snapshot.incomeThisTick, "incomeThisTick", { allowNegative: true });

    if (snapshot.roads !== undefined) {
        if (!snapshot.roads || typeof snapshot.roads !== "object" || snapshot.roads.version !== 1 || !snapshot.roads.tiles || typeof snapshot.roads.tiles !== "object" || Object.keys(snapshot.roads.tiles).length > 5000) {
            fail("Save data contains an invalid road network.", { code: "INVALID_ROADS", field: "roads", valueType: typeOf(snapshot.roads), phase: "roads" });
        }
        for (const [key, tile] of Object.entries(snapshot.roads.tiles)) {
            if (!/^\d+:\d+$/.test(key) || !tile || !ROAD_TYPES[tile.type]) {
                fail("Save data contains an invalid road tile.", { code: "INVALID_ROAD_TILE", field: "roads.tiles." + key, valueType: typeOf(tile), phase: "roads" });
            }
        }
    }
    if (snapshot.resourceGeography !== undefined) {
        // Validation runs before restoreSaveSnapshot calls initWorld. Derive the
        // cell count from the save's world options instead of the currently
        // loaded world, whose size can differ (or be the initial 160×160).
        let savedCellCount = null;
        try {
            const dimensions = resolveWorldDimensions(snapshot.worldOptions || {});
            const cells = Number(dimensions?.w) * Number(dimensions?.h);
            if (Number.isSafeInteger(cells) && cells > 0) savedCellCount = cells;
        } catch { /* fall back to the live world count */ }
        validateDomainSnapshot(snapshot.resourceGeography, "resourceGeography",
            value => validateResourceGeographySnapshot(value, { count: savedCellCount }));
    }
    if (snapshot.forestFauna !== undefined) validateDomainSnapshot(snapshot.forestFauna, "forestFauna", validateForestFaunaSnapshot);
    if (snapshot.forestGathering !== undefined) validateDomainSnapshot(snapshot.forestGathering, "forestGathering", validateForestGatheringSnapshot);
    if (snapshot.forestSuccession !== undefined) validateDomainSnapshot(snapshot.forestSuccession, "forestSuccession", validateForestSuccessionSnapshot);
    if (snapshot.city !== undefined) validateDomainSnapshot(snapshot.city, "city", validateCitySnapshot);
    if (snapshot.diplomacy !== undefined) {
        const diplomacy = snapshot.diplomacy;
        if (!diplomacy || typeof diplomacy !== "object" || Array.isArray(diplomacy) || !Array.isArray(diplomacy.realms) || diplomacy.realms.length > 8) {
            fail("Save data contains an invalid diplomacy state.", { code:"INVALID_DIPLOMACY", field:"diplomacy", valueType:typeOf(diplomacy), phase:"diplomacy" });
        }
    }
    if (snapshot.military !== undefined && snapshot.military !== null) {
        validateDomainSnapshot(snapshot.military, "military", validateMilitaryState);
    }
    if (snapshot.nobility !== undefined && snapshot.nobility !== null) {
        validateDomainSnapshot(snapshot.nobility, "nobility", validateNobilityState);
    }
    if (snapshot.expeditions !== undefined && snapshot.expeditions !== null) {
        validateDomainSnapshot(snapshot.expeditions, "expeditions", validateExpeditionsState);
    }
    if (snapshot.health !== undefined && snapshot.health !== null) {
        validateDomainSnapshot(snapshot.health, "health", validateHealthState);
    }
    if (snapshot.faith !== undefined && snapshot.faith !== null) {
        validateDomainSnapshot(snapshot.faith, "faith", validateFaithState);
    }
    if (snapshot.justice !== undefined && snapshot.justice !== null) {
        validateDomainSnapshot(snapshot.justice, "justice", validateJusticeState);
    }
    if (snapshot.identity !== undefined && snapshot.identity !== null) {
        validateDomainSnapshot(snapshot.identity, "identity", validateIdentity);
    }
    if (snapshot.research !== undefined && snapshot.research !== null) {
        validateDomainSnapshot(snapshot.research, "research", validateResearchState);
    }
    if (snapshot.legacy !== undefined && snapshot.legacy !== null) {
        validateDomainSnapshot(snapshot.legacy, "legacy", validateLegacyState);
    }
    if (snapshot.population !== undefined && snapshot.population !== null) {
        validateDomainSnapshot(snapshot.population, "population", validatePopulationState);
    }
    if (snapshot.realmCycle !== undefined) {
        validateDomainSnapshot(snapshot.realmCycle, "realmCycle", validateRealmCycleState);
    }
    if (snapshot.aiChronicle !== undefined && snapshot.aiChronicle !== null) {
        validateDomainSnapshot(snapshot.aiChronicle, "aiChronicle", validateAiChronicleState);
    }
    if (snapshot.eventTimeline !== undefined && snapshot.eventTimeline !== null) {
        validateDomainSnapshot(snapshot.eventTimeline, "eventTimeline", validateEventTimelineState);
    }
    if (snapshot.craftedItems !== undefined) {
        try {
            validateCraftedItems(snapshot.craftedItems);
        } catch (error) {
            fail("Save data contains an invalid crafted item archive: " + error.message,
                { code: "INVALID_CRAFTED_ITEMS", field: "craftedItems", valueType: typeOf(snapshot.craftedItems), phase: "items" });
        }
    }
    if (snapshot.court !== undefined && snapshot.court !== null) {
        const court = snapshot.court;
        if (!court || typeof court !== "object" || Array.isArray(court) || !court.offices || typeof court.offices !== "object" || Array.isArray(court.offices) || Object.keys(court.offices).length > 12) {
            fail("Save data contains an invalid court state.", { code:"INVALID_COURT", field:"court", valueType:typeOf(court), phase:"court" });
        }
        if (court.history !== undefined && (!Array.isArray(court.history) || court.history.length > 40)) {
            fail("Save data contains an invalid court history.", { code:"INVALID_COURT_HISTORY", field:"court.history", valueType:typeOf(court.history), phase:"court" });
        }
        if (court.demand !== undefined && court.demand !== null && (typeof court.demand !== "object" || Array.isArray(court.demand))) {
            fail("Save data contains an invalid court petition.", { code:"INVALID_COURT_DEMAND", field:"court.demand", valueType:typeOf(court.demand), phase:"court" });
        }
    }

    for (const [index, dto] of snapshot.entities.entries()) {
        if (dto.construction !== undefined && dto.construction !== null) {
            const construction = dto.construction;
            if (typeof construction !== "object" || !Number.isInteger(construction.stage) || construction.stage < 0 || construction.stage > 3 || !Number.isFinite(Number(construction.progress))) {
                fail("Save data contains an invalid construction site at position " + index + ".", { code: "INVALID_CONSTRUCTION", field: "entities[" + index + "].construction", valueType: typeOf(construction), phase: "entities" });
            }
        }
        if (dto.inventory !== undefined && dto.inventory !== null && (typeof dto.inventory !== "object" || Array.isArray(dto.inventory))) {
            fail("Save data contains invalid building inventory at position " + index + ".", { code: "INVALID_INVENTORY", field: "entities[" + index + "].inventory", valueType: typeOf(dto.inventory), phase: "entities" });
        }
        if (dto.warehouse !== undefined && dto.warehouse !== null && (typeof dto.warehouse !== "object" || Array.isArray(dto.warehouse))) {
            fail("Save data contains an invalid warehouse at position " + index + ".", { code: "INVALID_WAREHOUSE", field: "entities[" + index + "].warehouse", valueType: typeOf(dto.warehouse), phase: "entities" });
        }
        if (dto.field !== undefined && dto.field !== null && (typeof dto.field !== "object" || Array.isArray(dto.field))) {
            fail("Save data contains an invalid field at position " + index + ".", { code: "INVALID_FIELD", field: "entities[" + index + "].field", valueType: typeOf(dto.field), phase: "entities" });
        }
        if (dto.military !== undefined && dto.military !== null && (typeof dto.military !== "object" || Array.isArray(dto.military))) {
            fail("Save data contains invalid military service at position " + index + ".", { code: "INVALID_MILITARY_SERVICE", field: "entities[" + index + "].military", valueType: typeOf(dto.military), phase: "entities" });
        }
        if (dto.immunity !== undefined && (!Number.isFinite(Number(dto.immunity)) || Number(dto.immunity) < 0 || Number(dto.immunity) > 100)) {
            fail("Save data contains invalid immunity at position " + index + ".", { code: "INVALID_IMMUNITY", field: "entities[" + index + "].immunity", valueType: typeOf(dto.immunity), phase: "entities" });
        }
        if (dto.pannage !== undefined && dto.pannage !== null) {
            try {
                validatePannage(dto.pannage);
            } catch (error) {
                fail("Save data contains an invalid pannage reserve at position " + index + ".", { code: "INVALID_PANNAGE", field: "entities[" + index + "].pannage", valueType: typeOf(dto.pannage), phase: "entities" });
            }
        }
    }
    if (snapshot.hand !== undefined && (!Array.isArray(snapshot.hand) || snapshot.hand.length > 5)) {
        fail("Save data contains an invalid card hand.", { code: "INVALID_HAND", field: "hand", valueType: typeOf(snapshot.hand), phase: "cards" });
    }
    return true;
}
