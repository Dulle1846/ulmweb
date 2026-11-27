// DOM-free realm snapshot and restore pipeline.
//
// The browser save/load path and the long-run audit both use these functions.
// Keeping the serializers and restore order here means a headless round-trip
// exercises the same schema migration, validation and domain normalizers as a
// real local save instead of a test-only copy.
import { state } from "./state.js";
import { TYPE } from "./types.js";
import { WORLD_W } from "./config.js";
import { getRandomStreamSnapshot, restoreRandomStreams } from "./random.js";
import { normalizeCraftedItems } from "../systems/item-lexicon.js";
import { normalizeAiChronicleState, serializeAiChronicleState } from "./ai-chronicle-state.js";
import { normalizeExpeditionsState } from "../systems/expeditions.js";
import { normalizeEventTimelineState, serializeEventTimelineState } from "./event-timeline.js";
import { normalizeLayout, serializeLayout } from "../presentation/building-layout.js";
import { restoreRoads, serializeRoads } from "../systems/roads.js";
import { restoreSettlementOwners, serializeSettlementOwners } from "../systems/settlement-owners.js";
import { restoreResourceGeography, serializeResourceGeography } from "../systems/resource-geography.js";
import { restoreForestFauna, serializeForestFauna } from "../systems/forest-fauna.js";
import { restoreForestGathering, serializeForestGathering } from "../systems/forest-gathering.js";
import { restoreForestSuccession, serializeForestSuccession } from "../systems/forest-succession.js";
import { restoreSwampWorks, serializeSwampWorks } from "../world/swamp-works.js";
import { restoreMountainWorks, serializeMountainWorks } from "../world/mountain-works.js";
import { restoreVolcanoWorks, serializeVolcanoWorks } from "../world/volcano-works.js";
import { restoreCoastWorks, serializeCoastWorks } from "../world/coast-works.js";
import { initializeCityForRealm, rebuildLogisticsReservations, restoreCity, serializeCity } from "../systems/logistics.js";
import {
    initializePopulationRegister, normalizePopulationState, serializePopulationState,
    synchronizePopulationRegister
} from "../systems/population-register.js";
import { normalizeHouseholdAssignments } from "../systems/population.js";
import { initializeSettlementForRealm } from "../systems/settlement.js";
import { createFaithState, normalizeFaithState } from "../systems/faith.js";
import { createJusticeState, normalizeJusticeState } from "../systems/justice.js";
import { createCourtState, normalizeCourtState } from "../systems/court.js";
import { createNobilityState, normalizeNobilityState } from "../systems/nobility.js";
import { createDiplomacyState, normalizeDiplomacySnapshot } from "../systems/diplomacy.js";
import { createCrownSupplyState, normalizeCrownSupplyState } from "../systems/crown-supply.js";
import { createMarketState } from "../systems/market.js";
import { createRealmCycleState, normalizeRealmCycleState } from "../systems/realm-cycle.js";
import { normalizeDisasterRecoveryState } from "../systems/disaster-recovery.js";
import { restoreEconomyCycleState } from "../systems/economy-cycle.js";
import { normalizeIdentity } from "../systems/identity.js";
import { normalizeResearchState } from "../systems/research.js";
import { normalizeLegacyState } from "../systems/legacy.js";
import { normalizeEndeavoursState } from "../systems/endeavours.js";
import { normalizeHealthState } from "../systems/health.js";
import { normalizeMilitaryState } from "../systems/military.js";
import { createCampaignState, createContractState, normalizeCampaignState, normalizeContractState } from "../systems/feudal-campaigns.js";
import { createEspionageState, normalizeEspionageState } from "../systems/espionage.js";
import { normalizeAmbitions } from "../systems/ambitions.js";
import { normalizePoliticalState } from "../systems/politics.js";
import { normalizeGovernment } from "../systems/government.js";
import { normalizeCouncilState } from "../systems/council-laws.js";
import { normalizeRoyalState } from "../systems/royal-dynasty.js";
import { restoreWinterState, serializeWinterState } from "../world/winter-economy.js";
import { normalizeEndlessState } from "../systems/endless.js";
import { normalizeScenarioState } from "../systems/scenario.js";
import { normalizeWorldMapSnapshot } from "../systems/world-map.js";
import { restoreSpecialBiomeState, serializeSpecialBiomeState } from "../systems/special-biome-state.js";
import { restoreEnvironmentalHazardState, serializeEnvironmentalHazardState } from "../systems/environmental-hazards.js";
import { restoreBiomeAtlasState, serializeBiomeAtlasState } from "../systems/biome-resource-state.js";
import { restoreForestLegacyState, serializeForestLegacyState } from "../systems/forest-legacy.js";
import { restoreHand } from "../systems/cards.js";
import { resolveSavedTerrainVersion } from "../world/terrain-model.js";
import { initWorld } from "../world/world.js";
import { canSpawnEntity, spawnEntity } from "../world/entities.js";
import { ensurePersonProfile, MAX_PERSON_ARCHIVE, normalizePersonMemorial } from "../systems/people.js";
import { normalizeFamilyLinks } from "../systems/families.js";
import { normalizeRoomFurniture } from "../systems/furniture.js";
import { migrateSaveSnapshot } from "./save-migrations.js";
import { SAVE_SCHEMA_VERSION, normalizeSaveSnapshot, validateSaveSnapshot } from "./save-validation.js";
import { finishAnnualMaintenanceForSave } from "../simulation/simulation.js";

// One-shot fuel-backfill ownership is transient simulation state, but it must
// survive a reload: otherwise the sick worker's guard and the temporary
// replacement disappear, allowing a second replacement to consume the seat.
// Only the guard on the absent worker and the lease on the replacement are
// authoritative; keeping any more would duplicate derived ownership. Only emit
// keys that are actually set so ordinary entities keep byte-identical
// snapshots and older saves without these fields keep loading unchanged.
const FUEL_BACKFILL_FIELDS = Object.freeze([
    "fuelBackfillGuardUntil",
    "fuelBackfillUntil"
]);

function pickFuelBackfillFields(source) {
    const fields = {};
    for (const key of FUEL_BACKFILL_FIELDS) {
        if (source?.[key] !== undefined) fields[key] = source[key];
    }
    return fields;
}

// Feudal campaigns live inside the existing military and nobility DTOs. The
// nested fields are optional: legacy saves simply receive bounded empty rows,
// and modern saves keep the same bounded campaign/contract records without a
// schema bump. Normalising here also caps hand-edited saves before validation.
function serializeCampaignDto(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        ...JSON.parse(JSON.stringify(source)),
        campaigns: normalizeCampaignState(source.campaigns || createCampaignState())
    };
}

function serializeContractDto(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        ...JSON.parse(JSON.stringify(source)),
        contracts: normalizeContractState(source.contracts || createContractState())
    };
}

function restoreCampaignDto(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const military = normalizeMilitaryState(source);
    military.campaigns = normalizeCampaignState(source.campaigns);
    return military;
}

function restoreContractDto(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const nobility = normalizeNobilityState(source);
    nobility.contracts = normalizeContractState(source.contracts);
    return nobility;
}

function serializeEntity(entity, indexByEntity) {
    return {
        id: entity.id || null,
        personId: entity.personId || null,
        person: entity.person ? JSON.parse(JSON.stringify(entity.person)) : null,
        x: entity.x,
        y: entity.y,
        type: entity.type,
        hp: entity.hp,
        maxHp: entity.maxHp,
        dead: entity.dead,
        age: entity.age,
        rotation: entity.rotation || 0,
        footprintScale: entity.footprintScale || 1,
        interior: entity.interior ? { ...entity.interior } : null,
        roomFurniture: entity.roomFurniture && typeof entity.roomFurniture === "object"
            ? JSON.parse(JSON.stringify(entity.roomFurniture)) : null,
        layout: entity.layout ? serializeLayout(entity.type, entity.layout, 1, 1) : null,
        construction: entity.construction ? JSON.parse(JSON.stringify(entity.construction)) : null,
        inventory: entity.inventory ? JSON.parse(JSON.stringify(entity.inventory)) : null,
        warehouse: entity.warehouse ? JSON.parse(JSON.stringify(entity.warehouse)) : null,
        field: entity.field ? { ...entity.field } : null,
        pannage: entity.pannage && typeof entity.pannage === "object" ? JSON.parse(JSON.stringify(entity.pannage)) : null,
        // Forest-industry choices belong to the individual works. Keeping them
        // on the entity means an old save gains defaults while a new save keeps
        // each sawmill and workshop exactly as the player left it.
        ...(entity.sawProfile ? { sawProfile: String(entity.sawProfile).slice(0, 24) } : {}),
        ...(entity.forestMode ? { forestMode: String(entity.forestMode).slice(0, 32) } : {}),
        ...(Number(entity.forestBatches) > 0 ? { forestBatches: Math.min(100000000, Math.floor(Number(entity.forestBatches))) } : {}),
        anim: entity.anim,
        facing: entity.facing,
        visualState: entity.visualState,
        anchor: entity.anchor,
        home: entity.home,
        illnessUntilTick: entity.illnessUntilTick,
        illnessStartedTick: entity.illnessStartedTick,
        illnessSeverity: entity.illnessSeverity,
        immunity: entity.immunity,
        isHealer: Boolean(entity.isHealer),
        healthRole: entity.healthRole || null,
        military: entity.military && typeof entity.military === "object" ? JSON.parse(JSON.stringify(entity.military)) : null,
        targetX: entity.targetX,
        targetY: entity.targetY,
        velocityX: entity.velocityX,
        velocityY: entity.velocityY,
        routinePhase: entity.routinePhase,
        routineTimer: entity.routineTimer,
        movePause: entity.movePause,
        job: entity.job,
        jobRefreshTimer: entity.jobRefreshTimer,
        workplaceIndex: entity.workplace ? indexByEntity.get(entity.workplace) ?? null : null,
        isKing: entity.isKing,
        isRoyalFamily: Boolean(entity.isRoyalFamily),
        isRoyalCreature: Boolean(entity.isRoyalCreature),
        isDragon: Boolean(entity.isDragon),
        creature: entity.creature ? JSON.parse(JSON.stringify(entity.creature)) : null,
        moraleMod: entity.moraleMod,
        winterHardiness: entity.winterHardiness,
        winterUpgrade: entity.winterUpgrade,
        winterKit: entity.winterKit,
        winterKitTier: entity.winterKitTier,
        snowDamagedYear: entity.snowDamagedYear,
        floodedYear: entity.floodedYear,
        tint: entity.tint,
        householdId: entity.householdId || null,
        civicOrigin: entity.civicOrigin || null,
        lastAgedYear: entity.lastAgedYear ?? null,
        ...pickFuelBackfillFields(entity)
    };
}

export function createSaveSnapshot() {
    // A save can arrive during the few frames of annual maintenance. Complete
    // that tick first so the snapshot never contains a half-applied year.
    finishAnnualMaintenanceForSave();
    // The civic register is derived from the authoritative entities only once
    // per year. A soldier recruited after that census would otherwise be saved
    // as a civilian and reclassified on load, breaking an exact round-trip.
    state.population = synchronizePopulationRegister(state.population, { preserveCivicScores: true });
    // Reservations are derived from the active job list and physical stock.
    // Canonicalize them before writing the snapshot so the restore pass, which
    // rebuilds the same derived values, reproduces the exact saved state.
    rebuildLogisticsReservations();
    const indexes = new Map(state.entities.map((entity, index) => [entity, index]));
    return {
        playerName: state.playerName,
        kingdomName: state.kingdomName,
        worldSeed: state.worldSeed,
        worldOptions: { ...state.worldOptions },
        terrainVersion: state.terrainVersion || 1,
        randomStreams: getRandomStreamSnapshot(),
        nextEntityId: state.nextEntityId,
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        nextCardDrawTick: state.nextCardDrawTick,
        nextIssueAtTick: state.nextIssueAtTick,
        issueSequence: state.issueSequence,
        hiddenRealm: JSON.parse(JSON.stringify(state.hiddenRealm || {})),
        health: JSON.parse(JSON.stringify(state.health || {})),
        military: serializeCampaignDto(state.military || {}),
        espionage: JSON.parse(JSON.stringify(state.espionage || createEspionageState())),
        faith: JSON.parse(JSON.stringify(state.faith || createFaithState())),
        justice: JSON.parse(JSON.stringify(state.justice || createJusticeState())),
        camera: {
            x: state.camera.x / (Number(state.renderScale) || 1),
            y: state.camera.y / (Number(state.renderScale) || 1)
        },
        zoom: state.zoom / (Number(state.renderScale) || 1),
        explored: state.explored.map(column => column.map(Boolean)),
        roads: serializeRoads(),
        resourceGeography: serializeResourceGeography(),
        forestFauna: serializeForestFauna(),
        forestGathering: serializeForestGathering(),
        forestSuccession: serializeForestSuccession(),
        swampWorks: serializeSwampWorks(),
        mountainWorks: serializeMountainWorks(),
        volcanoWorks: serializeVolcanoWorks(),
        coastWorks: serializeCoastWorks(),
        city: serializeCity(),
        settlements: serializeSettlementOwners(),
        tick: state.tick,
        year: state.year,
        dayOfYear: state.dayOfYear,
        timeOfDay: state.timeOfDay,
        seasonIndex: state.seasonIndex,
        gameSpeed: state.gameSpeed,
        morale: state.morale,
        resources: { ...state.resources },
        incomeThisTick: { ...state.incomeThisTick },
        kingHp: state.kingHp,
        totalRaidsSurvived: state.totalRaidsSurvived,
        raidActive: state.raidActive,
        gameOver: state.gameOver,
        victory: state.victory,
        lastRandomEvent: state.lastRandomEvent,
        weather: state.weather,
        weatherTimer: state.weatherTimer,
        entities: state.entities.map((entity, index) => serializeEntity(entity, indexes)),
        personArchive: (state.personArchive || []).map(entry => JSON.parse(JSON.stringify(entry))).slice(-MAX_PERSON_ARCHIVE),
        creatureArchive: (state.creatureArchive || []).map(entry => JSON.parse(JSON.stringify(entry))).slice(-100),
        craftedItems: normalizeCraftedItems(state.craftedItems || []),
        hand: state.hand.map(card => ({ ...card, cost: { ...card.cost } })),
        cardRewardQueue: (state.cardRewardQueue || []).map(card => ({ ...card, cost: { ...card.cost } })),
        selectedCardInstanceId: state.selectedCardInstanceId,
        availableCards: state.availableCards.map(card => ({ ...card, cost: { ...card.cost } })),
        activeEvent: state.activeEvent,
        eventLog: state.eventLog.slice(0, 100),
        eventSequence: state.eventSequence,
        statistics: { ...state.statistics },
        ambitions: JSON.parse(JSON.stringify(state.ambitions || {})),
        economy: JSON.parse(JSON.stringify(state.economy || {})),
        population: serializePopulationState(),
        aiChronicle: serializeAiChronicleState(state.aiChronicle),
        eventTimeline: serializeEventTimelineState(state.eventTimeline),
        politics: JSON.parse(JSON.stringify(state.politics || {})),
        government: JSON.parse(JSON.stringify(normalizeGovernment(state.government))),
        royal: JSON.parse(JSON.stringify(state.royal || {})),
        market: JSON.parse(JSON.stringify(state.market)),
        winter: serializeWinterState(),
        endless: JSON.parse(JSON.stringify(state.endless || {})),
        scenario: normalizeScenarioState(state.scenario),
        worldMap: normalizeWorldMapSnapshot(state.worldMap),
        specialBiomes: serializeSpecialBiomeState(),
        environmentalHazards: serializeEnvironmentalHazardState(),
        biomeAtlas: serializeBiomeAtlasState(),
        forestLegacy: serializeForestLegacyState(),
        realmCycle: JSON.parse(JSON.stringify(state.realmCycle || createRealmCycleState())),
        court: JSON.parse(JSON.stringify(state.court || createCourtState())),
        nobility: serializeContractDto(state.nobility || createNobilityState()),
        diplomacy: JSON.parse(JSON.stringify(state.diplomacy || createDiplomacyState())),
        expeditions: JSON.parse(JSON.stringify(normalizeExpeditionsState(state.expeditions))),
        disasterRecovery: JSON.parse(JSON.stringify(normalizeDisasterRecoveryState(state.disasterRecovery))),
        identity: JSON.parse(JSON.stringify(state.identity || {})),
        research: JSON.parse(JSON.stringify(state.research || {})),
        legacy: JSON.parse(JSON.stringify(state.legacy || {})),
        endeavours: JSON.parse(JSON.stringify(state.endeavours || {})),
        crownSupply: JSON.parse(JSON.stringify(state.crownSupply || createCrownSupplyState())),
        totalPopulation: state.entities.filter(entity => entity.type === TYPE.VILLAGER && !entity.dead).length
    };
}

// Runs the same preflight as a local load. The input may be a legacy schema;
// `migrateSaveSnapshot` mutates a copy supplied by the caller, so callers that
// need to keep the original must clone it first.
export function prepareSaveSnapshot(snapshot) {
    const prepared = normalizeSaveSnapshot(migrateSaveSnapshot(snapshot));
    validateSaveSnapshot(prepared);
    return prepared;
}

// Restores a prepared snapshot into the live state. The caller is responsible
// for resetting state and for presentation-only work such as canvas binding,
// camera clamping, renderUI and the game loop.
export function restoreSaveSnapshot(snapshot) {
    state.worldSeed = snapshot.worldSeed;
    state.worldOptions = snapshot.worldOptions || { landmass: 50, ruggedness: 55, forests: 52, water: 48 };
    // Terrain is rebuilt from the seed, so a save without a version marker was
    // created by the version-1 generator and must keep that exact landscape.
    state.terrainVersion = resolveSavedTerrainVersion(snapshot.terrainVersion);
    initWorld(state.worldSeed, state.worldOptions, state.terrainVersion);
    restoreRoads(snapshot.roads);
    restoreResourceGeography(snapshot.resourceGeography);
    restoreForestFauna(snapshot.forestFauna);
    restoreForestGathering(snapshot.forestGathering);
    restoreForestSuccession(snapshot.forestSuccession);
    restoreSwampWorks(snapshot.swampWorks);
    restoreMountainWorks(snapshot.mountainWorks);
    restoreVolcanoWorks(snapshot.volcanoWorks);
    restoreCoastWorks(snapshot.coastWorks);
    state.entities = [];
    // Household normalization below may move a resident to a different house.
    // The saved home/anchor is authoritative (for example a worker posted to a
    // site away from home), so remember it and put it back after normalization.
    const savedEntityLocations = new Map();
    for (const dto of snapshot.entities || []) {
        if (!dto || typeof dto.id !== "string") continue;
        const savedPoint = value => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
            ? { x: Number(value.x), y: Number(value.y) }
            : null;
        savedEntityLocations.set(dto.id, { home: savedPoint(dto.home), anchor: savedPoint(dto.anchor) });
    }
    const restored = [];
    for (const dto of snapshot.entities || []) {
        // Dead entities have already been archived where relevant and should
        // not consume live world capacity during restoration.
        if (dto.dead) { restored.push(null); continue; }
        if (!canSpawnEntity(dto.type)) throw new Error("Save exceeds the supported world entity capacity.");
        const entity = spawnEntity(dto.x, dto.y, dto.type);
        if (!entity) throw new Error("An entity could not be restored; the current realm will be recovered.");
        Object.assign(entity, {
            id: typeof dto.id === "string" ? dto.id : null,
            personId: typeof dto.personId === "string" ? dto.personId : null,
            person: dto.person && typeof dto.person === "object" ? dto.person : null,
            hp: dto.hp,
            maxHp: dto.maxHp,
            dead: dto.dead,
            age: dto.age,
            anim: dto.anim,
            facing: dto.facing,
            rotation: Number.isFinite(dto.rotation) ? dto.rotation : 0,
            footprintScale: Number.isFinite(dto.footprintScale) ? dto.footprintScale : 1,
            interior: dto.interior && typeof dto.interior === "object" ? { ...dto.interior } : null,
            roomFurniture: dto.roomFurniture && typeof dto.roomFurniture === "object" && !Array.isArray(dto.roomFurniture)
                ? normalizeRoomFurniture(dto.roomFurniture) : null,
            layout: dto.layout && typeof dto.layout === "object" ? normalizeLayout(dto.type, dto.layout, 1, 1) : null,
            construction: dto.construction && typeof dto.construction === "object" ? JSON.parse(JSON.stringify(dto.construction)) : null,
            inventory: dto.inventory && typeof dto.inventory === "object" ? JSON.parse(JSON.stringify(dto.inventory)) : null,
            warehouse: dto.warehouse && typeof dto.warehouse === "object" ? JSON.parse(JSON.stringify(dto.warehouse)) : null,
            field: dto.field && typeof dto.field === "object" ? { ...dto.field } : null,
            pannage: dto.pannage && typeof dto.pannage === "object" ? JSON.parse(JSON.stringify(dto.pannage)) : null,
            sawProfile: dto.sawProfile ? String(dto.sawProfile).slice(0, 24) : null,
            forestMode: dto.forestMode ? String(dto.forestMode).slice(0, 32) : null,
            forestBatches: Math.max(0, Math.min(100000000, Math.floor(Number(dto.forestBatches) || 0))),
            civicOrigin: dto.civicOrigin || null,
            visualState: dto.visualState,
            anchor: dto.anchor || { x: dto.x, y: dto.y },
            home: dto.home || { x: dto.x, y: dto.y },
            illnessUntilTick: dto.illnessUntilTick,
            illnessStartedTick: dto.illnessStartedTick,
            illnessSeverity: dto.illnessSeverity,
            immunity: dto.immunity === undefined ? undefined : (Number.isFinite(Number(dto.immunity)) ? Math.max(0, Math.min(100, Number(dto.immunity))) : 0),
            isHealer: Boolean(dto.isHealer),
            healthRole: dto.healthRole ? String(dto.healthRole).slice(0, 24) : null,
            military: dto.military && typeof dto.military === "object" && !Array.isArray(dto.military) ? JSON.parse(JSON.stringify(dto.military)) : null,
            targetX: dto.targetX ?? dto.x,
            targetY: dto.targetY ?? dto.y,
            velocityX: dto.velocityX || 0,
            velocityY: dto.velocityY || 0,
            routinePhase: dto.routinePhase ?? 4,
            routineTimer: dto.routineTimer ?? 30,
            movePause: dto.movePause || 0,
            job: dto.job,
            jobRefreshTimer: dto.jobRefreshTimer ?? 30,
            isKing: Boolean(dto.isKing),
            isRoyalFamily: Boolean(dto.isRoyalFamily),
            isRoyalCreature: Boolean(dto.isRoyalCreature),
            isDragon: Boolean(dto.isDragon),
            creature: dto.creature && typeof dto.creature === "object" ? dto.creature : null,
            moraleMod: dto.moraleMod || 0,
            winterHardiness: dto.winterHardiness === undefined ? undefined : Math.max(0, Math.min(1, Number(dto.winterHardiness) || 0)),
            winterUpgrade: dto.winterUpgrade === undefined ? undefined : Math.max(0, Math.min(1, Number(dto.winterUpgrade) || 0)),
            winterKit: dto.winterKit === undefined ? undefined : Math.max(0, Math.min(1, Number(dto.winterKit) || 0)),
            winterKitTier: dto.winterKitTier === undefined ? undefined : Math.max(0, Math.min(3, Math.floor(Number(dto.winterKitTier) || 0))),
            snowDamagedYear: dto.snowDamagedYear,
            floodedYear: dto.floodedYear,
            tint: dto.tint || 0,
            householdId: dto.householdId || null,
            lastAgedYear: dto.lastAgedYear === null ? null : (Number.isFinite(dto.lastAgedYear) ? dto.lastAgedYear : Math.max(1, Math.floor(Number(snapshot.year) || 1))),
            ...pickFuelBackfillFields(dto)
        });
        restored.push(entity);
    }
    (snapshot.entities || []).forEach((dto, index) => {
        if (Number.isInteger(dto.workplaceIndex) && restored[dto.workplaceIndex] && restored[index]) {
            restored[index].workplace = restored[dto.workplaceIndex];
        }
    });
    restoreCity(snapshot.city);
    restoreWinterState(snapshot.winter);
    // A modern save already contains the complete logistics/needs state. Only
    // a legacy save without a city block needs a fresh derived settlement.
    if (!snapshot.city) initializeCityForRealm({ seedWarehouse: true });
    state.tick = snapshot.tick || 0;
    state.year = snapshot.year || 1;
    state.dayOfYear = snapshot.dayOfYear || 0;
    const savedHour = Number(snapshot.timeOfDay);
    if (Number.isFinite(savedHour)) state.timeOfDay = Math.max(0, Math.min(23, Math.round(savedHour)));
    const savedSpeed = Number(snapshot.gameSpeed);
    state.gameSpeed = [0.5, 1, 2, 4].includes(savedSpeed) ? savedSpeed : 1;
    state.creatureArchive = Array.isArray(snapshot.creatureArchive) ? snapshot.creatureArchive.filter(entry => entry && typeof entry === "object").slice(-100) : [];
    state.craftedItems = normalizeCraftedItems(snapshot.craftedItems);
    state.personArchive = Array.isArray(snapshot.personArchive)
        ? snapshot.personArchive.map(normalizePersonMemorial).filter(Boolean).slice(-MAX_PERSON_ARCHIVE)
        : [];
    restoreRandomStreams(snapshot.randomStreams);
    state.nextEntityId = Math.max(1, Number.isSafeInteger(snapshot.nextEntityId) ? snapshot.nextEntityId : restored.length + 1);
    for (let index = 0; index < restored.length; index++) {
        const entity = restored[index];
        if (!entity) continue;
        if (typeof entity.id !== "string") entity.id = "e" + (Number(state.worldSeed) || 1).toString(36) + "-" + (index + 1).toString(36);
        if (entity.type === TYPE.VILLAGER && !entity.personId) entity.personId = entity.id;
        if (entity.type === TYPE.VILLAGER || entity.isKing) ensurePersonProfile(entity, { role: entity.isKing ? "king" : "resident" });
    }
    normalizeFamilyLinks();
    state.nextEntityId = Math.max(state.nextEntityId, restored.length + 1);
    state.seasonIndex = snapshot.seasonIndex || 0;
    state.morale = snapshot.morale ?? 72;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0, ...snapshot.resources };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0, ...snapshot.incomeThisTick };
    state.kingHp = snapshot.kingHp || 240;
    state.totalRaidsSurvived = snapshot.totalRaidsSurvived || 0;
    state.raidActive = Boolean(snapshot.raidActive);
    state.endless = normalizeEndlessState(snapshot.endless, state.year);
    // Schema 14 stores the authored start conditions and the objective's
    // progress. Older saves without the field become a free realm; no existing
    // realm is silently given a deadline it never had.
    state.scenario = normalizeScenarioState(snapshot.scenario);
    // Schema 15: routes, watch levels and frontier incident history survive a
    // reload. Legacy saves restore an empty world map and keep playing.
    state.worldMap = normalizeWorldMapSnapshot(snapshot.worldMap);
    state.gameOver = Boolean(snapshot.gameOver);
    // A realm saved at a terminal moment is resumed as a recoverable endless
    // realm. The next tick restores morale and the chronicle continues.
    if (state.endless.enabled) state.gameOver = false;
    state.victory = Boolean(snapshot.victory);
    state.lastRandomEvent = snapshot.lastRandomEvent || 0;
    state.weather = snapshot.weather || "clear";
    state.weatherTimer = Math.min(12, Math.max(0, Number(snapshot.weatherTimer) || 0));
    state.kingdomName = snapshot.kingdomName || "ELDRIA";
    state.eventLog = Array.isArray(snapshot.eventLog) ? snapshot.eventLog : [];
    state.identity = normalizeIdentity(snapshot.identity || {});
    state.research = normalizeResearchState(snapshot.research || {});
    state.legacy = normalizeLegacyState(snapshot.legacy || {});
    state.endeavours = normalizeEndeavoursState(snapshot.endeavours || {});
    state.crownSupply = normalizeCrownSupplyState(snapshot.crownSupply || {});
    state.eventSequence = snapshot.eventSequence || state.eventLog.reduce((max, event) => Math.max(max, event.id || 0), 0);
    state.activeEvent = snapshot.activeEvent || null;
    state.issueSequence = snapshot.issueSequence || 0;
    state.nextIssueAtTick = snapshot.nextIssueAtTick || 0;
    state.hiddenRealm = {
        tension: 0, prosperity: 0, mystery: 0, memories: [], activeThreads: [], completedThreads: [],
        ...(snapshot.hiddenRealm || {})
    };
    state.health = normalizeHealthState(snapshot.health || {});
    state.military = restoreCampaignDto(snapshot.military);
    state.espionage = normalizeEspionageState(snapshot.espionage || {});
    state.faith = normalizeFaithState(snapshot.faith || {});
    state.justice = normalizeJusticeState(snapshot.justice || {});
    state.hiddenRealm.memories = Array.isArray(state.hiddenRealm.memories) ? state.hiddenRealm.memories : [];
    state.hiddenRealm.activeThreads = Array.isArray(state.hiddenRealm.activeThreads) ? state.hiddenRealm.activeThreads : [];
    state.hiddenRealm.completedThreads = Array.isArray(state.hiddenRealm.completedThreads) ? state.hiddenRealm.completedThreads : [];
    state.ambitions = normalizeAmbitions(snapshot.ambitions);
    state.availableCards = Array.isArray(snapshot.availableCards)
        ? snapshot.availableCards.map(card => ({ ...card, cost: { ...(card.cost || {}) } }))
        : [];
    state.statistics = {
        totalTrades: 0, totalBuildingsBuilt: 0, totalUnitsRecruited: 0, totalEventsResolved: 0,
        totalRoadTilesBuilt: 0, totalHousesBuilt: 0, totalCardsDrawn: 0, ...snapshot.statistics
    };
    restoreEconomyCycleState(snapshot);
    normalizePoliticalState(snapshot.politics);
    normalizeGovernment(snapshot.government);
    // The hot-path government normalizer preserves the optional council DTO by
    // reference; import normalization happens once at the save boundary.
    state.government.council = normalizeCouncilState(snapshot.government?.council);
    normalizeRoyalState(snapshot.royal);
    state.royal.dynastyName = state.identity.dynastyName;
    normalizeHouseholdAssignments();
    // The settlement pass applies its daily morale delta. A restored realm must
    // keep the morale value that was persisted. Modern saves also persist the
    // complete services/needs block; recomputing it would advance lastTick and
    // mutate the history, breaking an exact round-trip. Only legacy saves need
    // the derived values rebuilt.
    const restoredMorale = state.morale;
    if (!snapshot.city?.services || !snapshot.city?.needs) initializeSettlementForRealm();
    state.morale = restoredMorale;
    // Older saves have no register: derive one from the restored households
    // and person profiles. New saves keep their origins, wealth and histories.
    state.population = normalizePopulationState(snapshot.population);
    initializePopulationRegister({ preserveCivicScores: true });
    state.aiChronicle = normalizeAiChronicleState(snapshot.aiChronicle);
    state.aiBusy = false;
    state.eventTimeline = normalizeEventTimelineState(snapshot.eventTimeline);
    // Reapply the persisted anchors after every household/population rebuild.
    for (const entity of state.entities) {
        const saved = savedEntityLocations.get(entity.id);
        if (!saved) continue;
        if (saved.home) entity.home = { ...saved.home };
        if (saved.anchor) entity.anchor = { ...saved.anchor };
    }
    state.market = snapshot.market || createMarketState();
    state.realmCycle = normalizeRealmCycleState(snapshot.realmCycle);
    state.court = normalizeCourtState(snapshot.court);
    state.nobility = restoreContractDto(snapshot.nobility);
    state.diplomacy = normalizeDiplomacySnapshot(snapshot.diplomacy);
    state.expeditions = normalizeExpeditionsState(snapshot.expeditions);
    state.disasterRecovery = normalizeDisasterRecoveryState(snapshot.disasterRecovery);
    // initWorld has already generated the atlas for this seed. A save may carry
    // the player's discoveries, rare goods and blight pressure; restore those
    // over the generated baseline so older saves still get a complete atlas.
    restoreSpecialBiomeState(snapshot.specialBiomes);
    // The hazard layer is normalised on load. Saves written before 1.2.20 have
    // no field and start with a clean, quiet state instead of a failed load.
    restoreEnvironmentalHazardState(snapshot.environmentalHazards);
    // initWorld has generated this seed's atlas. The save overlays the player's
    // discoveries, stocks, populations, policies and trade record. Old saves
    // without the field keep the deterministic generated baseline.
    restoreBiomeAtlasState(snapshot.biomeAtlas);
    // The forest legacy ledger is additive and optional. A save written before
    // 3.89.0 simply starts with a fresh deterministic ledger on the next tick.
    restoreForestLegacyState(snapshot.forestLegacy);
    // Seats are reconciled against the restored buildings. A legacy save gets
    // its existing keep as a zero-balance seat without moving any resources.
    restoreSettlementOwners(snapshot.settlements);
    if (Array.isArray(snapshot.explored) && snapshot.explored.length === (Number(state.worldW) || WORLD_W)) {
        state.explored = snapshot.explored;
    }
    const hasSavedCamera = snapshot.camera && Number.isFinite(snapshot.camera.x) && Number.isFinite(snapshot.camera.y);
    const savedScale = Number(state.renderScale) || 1;
    if (hasSavedCamera) state.camera = { x: snapshot.camera.x * savedScale, y: snapshot.camera.y * savedScale };
    if (Number.isFinite(snapshot.zoom)) {
        state.zoom = snapshot.zoom * savedScale;
        state.zoomTarget = snapshot.zoom * savedScale;
        state.zoomLevel = 3;
    }
    restoreHand(snapshot.hand, snapshot.selectedCardInstanceId, snapshot.availableCards, snapshot.nextCardDrawTick, snapshot.cardRewardQueue);
    return { hasSavedCamera: Boolean(hasSavedCamera) };
}
