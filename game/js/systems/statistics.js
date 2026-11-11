// Live statistics catalogue. Every row is derived from the current simulation
// state or from a read-only domain snapshot; nothing here is a forecast.
import { state } from "../core/state.js";
import { BUILDING_LABELS } from "./city-config.js";
import { BUILDING_WORKFORCE, getBuildingEfficiency, getWorkforceSnapshot } from "./economy.js";
import { getHealthSnapshot } from "./health.js";
import { getHousingSnapshot, getHouseholdSnapshot } from "./population.js";
import { getPoliticalSnapshot } from "./politics.js";
import { getRoomBonusSnapshot, ROOM_BONUS_CAPS } from "./rooms.js";
import { getMilitarySnapshot } from "./military.js";
import { getDiplomacySnapshot } from "./diplomacy.js";
import { getResearchSnapshot } from "./research.js";
import { getFaithSnapshot } from "./faith.js";
import { getJusticeSnapshot } from "./justice.js";
import { getCourtSnapshot } from "./court.js";
import { getJobSkill } from "./skills.js";
import { getPathCacheStats } from "../simulation/villagers.js";

export const STATISTICS_CATEGORIES = Object.freeze([
    { id: "overview", label: "Overview" },
    { id: "realm", label: "Realm" },
    { id: "population", label: "Population" },
    { id: "people", label: "People" },
    { id: "economy", label: "Economy" },
    { id: "resources", label: "Resources" },
    { id: "buildings", label: "Buildings" },
    { id: "city", label: "City" },
    { id: "politics", label: "Politics" },
    { id: "court", label: "Court" },
    { id: "diplomacy", label: "Diplomacy" },
    { id: "military", label: "Military" },
    { id: "research", label: "Research" },
    { id: "faith", label: "Faith" },
    { id: "health", label: "Health" },
    { id: "justice", label: "Justice" },
    { id: "dynasty", label: "Dynasty" },
    { id: "ecology", label: "Ecology" },
    { id: "logistics", label: "Logistics" },
    { id: "cards", label: "Cards" },
    { id: "chronicle", label: "Chronicle" },
    { id: "performance", label: "Performance" }
]);

export const STATISTICS_ARCHIVE_LIMIT = 120;
const SKIPPED_KEYS = new Set([
    "id", "personid", "targetid", "seed", "worldseed", "version", "revision",
    "lasttick", "nextjobid", "nextcarrierid", "ctx", "canvas", "terraincanvas",
    "fogcanvas", "terrainCanvasEl", "minimapCanvas", "minimapCtx", "heightMap",
    "moistureMap", "temperatureMap", "terrainCanvas", "fogCanvas"
].map(key => key.toLowerCase()));
const PRIMITIVE = value => value === null || ["string", "number", "boolean"].includes(typeof value);
const categoryOrder = new Map(STATISTICS_CATEGORIES.map((entry, index) => [entry.id, index]));

function humanizeKey(value) {
    return String(value || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, character => character.toUpperCase());
}

function humanizePath(path) {
    return String(path || "").split(".").filter(Boolean).map(segment =>
        /^\d+$/.test(segment) ? "#" + (Number(segment) + 1) : humanizeKey(segment)
    ).join(" · ");
}

export function formatStatisticValue(value, unit = "") {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "YES" : "NO";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return "—";
        const absolute = Math.abs(value);
        const digits = absolute >= 1000 ? 0 : absolute >= 100 ? 1 : absolute >= 10 ? 1 : 2;
        let formatted = Number(value).toFixed(digits);
        if (formatted.includes(".")) formatted = formatted.replace(/\.?0+$/, "");
        formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return unit ? formatted + " " + unit : formatted;
    }
    const text = String(value);
    return text.length > 180 ? text.slice(0, 177) + "…" : text;
}

function safeSnapshot(getter, fallback = null) {
    try {
        const value = getter();
        return value && typeof value === "object" ? value : fallback;
    } catch {
        return fallback;
    }
}

function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 1) {
    if (!Number.isFinite(Number(value))) return 0;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
}

function average(values) {
    const finite = values.map(Number).filter(Number.isFinite);
    return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function personEntity(entity) {
    return Boolean(entity && !entity.dead && entity.person && typeof entity.person === "object" && entity.person.name);
}

function entityBuilding(entity) {
    return Boolean(entity && !entity.dead && typeof entity.isBuilding === "function" && entity.isBuilding());
}

function countBy(items, key) {
    const counts = new Map();
    for (const item of items) {
        const value = typeof key === "function" ? key(item) : item?.[key];
        const label = String(value || "unrecorded");
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function addSnapshotRows(add, category, snapshot, group, maxRows = 55) {
    if (!snapshot) return;
    let added = 0;
    for (const [key, value] of Object.entries(snapshot)) {
        if (added >= maxRows || SKIPPED_KEYS.has(key.toLowerCase())) continue;
        if (!PRIMITIVE(value)) continue;
        add(category, humanizeKey(key), value, { group });
        added++;
    }
}

export function buildStatisticsCatalog() {
    const rows = [];
    const add = (category, label, value, options = {}) => {
        const definition = STATISTICS_CATEGORIES.find(entry => entry.id === category) || STATISTICS_CATEGORIES[0];
        const display = options.display !== undefined ? String(options.display) : formatStatisticValue(value, options.unit || "");
        const group = String(options.group || definition.label);
        rows.push({
            category: definition.id,
            categoryLabel: definition.label,
            label: String(label || "Unnamed reading"),
            group,
            value,
            display,
            unit: options.unit || "",
            search: (definition.label + " " + group + " " + label + " " + display).toLowerCase()
        });
    };

    const addTree = (category, source, options = {}) => {
        if (source === null || source === undefined) return;
        const maxDepth = options.maxDepth ?? 3;
        const maxRows = options.maxRows ?? 100;
        const arrayLimit = options.arrayLimit ?? 5;
        const group = options.group || (STATISTICS_CATEGORIES.find(entry => entry.id === category)?.label || "Statistics");
        const seen = new WeakSet();
        let localRows = 0;
        const walk = (node, path, depth) => {
            if (node === null || node === undefined || localRows >= maxRows) return;
            if (Array.isArray(node)) {
                if (path) {
                    add(category, humanizePath(path) + " · Count", node.length, { group });
                    localRows++;
                }
                if (depth >= maxDepth) return;
                for (let index = 0; index < node.length && index < arrayLimit && localRows < maxRows; index++) {
                    walk(node[index], path ? path + "." + index : String(index), depth + 1);
                }
                return;
            }
            if (typeof node === "object") {
                if (seen.has(node)) return;
                seen.add(node);
                if (depth > maxDepth) return;
                const entries = Object.entries(node).slice(0, 80);
                for (const [key, value] of entries) {
                    if (localRows >= maxRows) break;
                    if (SKIPPED_KEYS.has(key.toLowerCase())) continue;
                    const nextPath = path ? path + "." + key : key;
                    if (PRIMITIVE(value)) {
                        add(category, humanizePath(nextPath), value, { group });
                        localRows++;
                    } else if (Array.isArray(value)) {
                        add(category, humanizePath(nextPath) + " · Count", value.length, { group });
                        localRows++;
                        if (depth < maxDepth && value.length) {
                            for (let index = 0; index < value.length && index < arrayLimit && localRows < maxRows; index++) {
                                walk(value[index], nextPath + "." + index, depth + 1);
                            }
                        }
                    } else if (typeof value === "object") {
                        walk(value, nextPath, depth + 1);
                    }
                }
                return;
            }
            if (path) add(category, humanizePath(path), node, { group });
            localRows++;
        };
        walk(source, "", 0);
    };

    const workforce = safeSnapshot(getWorkforceSnapshot, { population: 0, employed: 0, unemployed: 0, workersByBuilding: new Map(), skillByBuilding: new Map(), experienceByBuilding: new Map(), buildings: 0 });
    const housing = safeSnapshot(getHousingSnapshot, { population: 0, houses: 0, capacity: 0, available: 0, overcrowded: false });
    const households = safeSnapshot(getHouseholdSnapshot, { households: 0, housed: 0, unhoused: 0, homes: [] });
    const politics = safeSnapshot(getPoliticalSnapshot, null);
    const roomBonuses = safeSnapshot(getRoomBonusSnapshot, null);
    const health = safeSnapshot(getHealthSnapshot, null);
    const military = safeSnapshot(getMilitarySnapshot, null);
    const diplomacy = safeSnapshot(getDiplomacySnapshot, null);
    const research = safeSnapshot(getResearchSnapshot, null);
    const faith = safeSnapshot(getFaithSnapshot, null);
    const justice = safeSnapshot(getJusticeSnapshot, null);
    const court = safeSnapshot(getCourtSnapshot, null);
    const pathCache = safeSnapshot(getPathCacheStats, {});
    const economy = state.economy && typeof state.economy === "object" ? state.economy : {};
    const statistics = state.statistics && typeof state.statistics === "object" ? state.statistics : {};
    const entities = Array.isArray(state.entities) ? state.entities.filter(Boolean) : [];
    const livePeople = entities.filter(personEntity);
    const buildings = entities.filter(entityBuilding);
    const archives = Array.isArray(state.personArchive) ? state.personArchive.filter(entry => entry?.person?.name) : [];
    const resources = state.resources && typeof state.resources === "object" ? state.resources : {};
    const income = state.incomeThisTick && typeof state.incomeThisTick === "object" ? state.incomeThisTick : {};
    const market = state.market && typeof state.market === "object" ? state.market : null;
    const buildingTypes = new Map();
    for (const building of buildings) {
        const type = String(building.type || "unknown");
        const list = buildingTypes.get(type) || [];
        list.push(building);
        buildingTypes.set(type, list);
    }

    // The overview is deliberately curated: it answers the questions a new
    // player has before they dig into a named person or a single building.
    add("overview", "Realm", state.kingdomName || "Unnamed realm", { group: "REALM AT A GLANCE" });
    add("overview", "Year", state.year, { group: "REALM AT A GLANCE" });
    add("overview", "Day of year", state.dayOfYear, { group: "REALM AT A GLANCE" });
    add("overview", "Simulation tick", state.tick, { group: "REALM AT A GLANCE" });
    add("overview", "Population", housing.population, { group: "REALM AT A GLANCE", unit: "people" });
    add("overview", "Housing capacity", housing.capacity, { group: "REALM AT A GLANCE", unit: "beds" });
    add("overview", "Vacant beds", housing.available, { group: "REALM AT A GLANCE" });
    add("overview", "Households", households.households, { group: "REALM AT A GLANCE" });
    add("overview", "Unhoused residents", households.unhoused, { group: "REALM AT A GLANCE" });
    add("overview", "Employed residents", workforce.employed, { group: "REALM AT A GLANCE" });
    add("overview", "Unemployed residents", workforce.unemployed, { group: "REALM AT A GLANCE" });
    add("overview", "Buildings", workforce.buildings || buildings.length, { group: "REALM AT A GLANCE" });
    add("overview", "Morale", Math.floor(safeNumber(state.morale)), { group: "REALM AT A GLANCE", unit: "/ 100" });
    add("overview", "Treasury", Math.floor(safeNumber(resources.gold)), { group: "REALM AT A GLANCE", unit: "gold" });
    add("overview", "Food stores", Math.floor(safeNumber(resources.food)), { group: "REALM AT A GLANCE", unit: "food" });
    add("overview", "Weather", state.weather || "clear", { group: "REALM AT A GLANCE" });
    add("overview", "Active event", state.activeEvent?.title || "None", { group: "REALM AT A GLANCE" });
    add("overview", "Raids survived", state.totalRaidsSurvived || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Trades completed", statistics.totalTrades || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Buildings completed", statistics.totalBuildingsBuilt || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Units recruited", statistics.totalUnitsRecruited || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Events resolved", statistics.totalEventsResolved || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Cards drawn", statistics.totalCardsDrawn || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Road tiles built", statistics.totalRoadTilesBuilt || 0, { group: "REALM AT A GLANCE" });
    add("overview", "Frame rate", safeNumber(state.renderStats?.fps), { group: "RUNTIME", unit: "fps" });
    add("overview", "Frame time", safeNumber(state.renderStats?.frameMs), { group: "RUNTIME", unit: "ms" });
    add("overview", "Path cache entries", pathCache.size || 0, { group: "RUNTIME" });
    add("overview", "Terrain cache hits", state.terrainCacheHits || 0, { group: "RUNTIME" });
    add("overview", "Terrain cache misses", state.terrainCacheMisses || 0, { group: "RUNTIME" });

    add("realm", "Kingdom name", state.kingdomName || "New Realm", { group: "IDENTITY" });
    add("realm", "Player name", state.playerName || "Guest", { group: "IDENTITY" });
    add("realm", "World seed", state.worldSeed || 0, { group: "WORLD" });
    add("realm", "World width", state.worldW || 0, { group: "WORLD", unit: "tiles" });
    add("realm", "World height", state.worldH || 0, { group: "WORLD", unit: "tiles" });
    add("realm", "World size", state.worldSizeId || "standard", { group: "WORLD" });
    add("realm", "Season", state.seasonIndex, { group: "TIME" });
    add("realm", "Time of day", state.timeOfDay, { group: "TIME" });
    add("realm", "Game speed", state.gameSpeed, { group: "TIME" });
    add("realm", "Paused", Boolean(state.isPaused), { group: "TIME" });
    add("realm", "Game over", Boolean(state.gameOver), { group: "TIME" });
    add("realm", "Victory", Boolean(state.victory), { group: "TIME" });
    addTree("realm", state.worldOptions, { group: "WORLD OPTIONS", maxDepth: 2, maxRows: 30 });
    addTree("realm", state.government, { group: "GOVERNMENT", maxDepth: 2, maxRows: 50 });
    addTree("realm", state.identity, { group: "IDENTITY RECORD", maxDepth: 2, maxRows: 40 });
    addTree("realm", state.legacy, { group: "LEGACY", maxDepth: 2, maxRows: 40 });
    addTree("realm", state.endeavours, { group: "ENDEAVOURS", maxDepth: 2, maxRows: 50 });
    addTree("realm", state.crownSupply, { group: "CROWN SUPPLY", maxDepth: 2, maxRows: 40 });
    addTree("realm", state.roads, { group: "ROAD NETWORK", maxDepth: 2, maxRows: 30, arrayLimit: 3 });
    if (roomBonuses) {
        const roomGroup = "ROOM BONUSES · EVERY 20 DAYS";
        add("realm", "Accessible rooms", roomBonuses.rooms || 0, { group: roomGroup });
        add("realm", "Sealed rooms", roomBonuses.sealed || 0, { group: roomGroup });
        add("realm", "Buildings with interiors", roomBonuses.buildings || 0, { group: roomGroup });
        add("realm", "Bonus interval", roomBonuses.interval || 20, { group: roomGroup, unit: "days" });
        add("realm", "Furniture upkeep", roomBonuses.furnitureUpkeep || 0, { group: roomGroup, unit: "gold" });
        for (const [effect, value] of Object.entries(roomBonuses.totals || {})) {
            add("realm", "Effective bonus · " + humanizeKey(effect), value, { group: roomGroup });
            add("realm", "Cap · " + humanizeKey(effect), ROOM_BONUS_CAPS[effect] || 0, { group: "ROOM BONUS CAPS" });
        }
        for (const role of roomBonuses.roles || []) {
            if (!role.roomCount) continue;
            const roleGroup = "ROOM BONUSES · " + role.label;
            add("realm", "Rooms", role.roomCount, { group: roleGroup });
            add("realm", "Weight", round(role.weight), { group: roleGroup });
            for (const [effect, value] of Object.entries(role.baseEffects || {})) {
                add("realm", "Base " + humanizeKey(effect), value, { group: roleGroup });
                add("realm", "Furnished " + humanizeKey(effect), value + safeNumber(role.furnitureEffects?.[effect]), { group: roleGroup });
            }
        }
    }

    add("population", "Residents", housing.population, { group: "COUNTS" });
    add("population", "Housing capacity", housing.capacity, { group: "COUNTS" });
    add("population", "Vacant beds", housing.available, { group: "COUNTS" });
    add("population", "Overcrowded", Boolean(housing.overcrowded), { group: "COUNTS" });
    add("population", "Households", households.households, { group: "COUNTS" });
    add("population", "Housed residents", households.housed, { group: "COUNTS" });
    add("population", "Unhoused residents", households.unhoused, { group: "COUNTS" });
    add("population", "Employed", workforce.employed, { group: "COUNTS" });
    add("population", "Unemployed", workforce.unemployed, { group: "COUNTS" });
    add("population", "Living people records", livePeople.length, { group: "COUNTS" });
    add("population", "Archived people records", archives.length, { group: "COUNTS" });
    add("population", "Average age", round(average(livePeople.map(entity => entity.person.ageYears))), { group: "AVERAGES", unit: "years" });
    add("population", "Average morale need", round(average(livePeople.map(entity => entity.person.needs?.belonging))), { group: "AVERAGES", unit: "/ 100" });
    add("population", "Average safety need", round(average(livePeople.map(entity => entity.person.needs?.safety))), { group: "AVERAGES", unit: "/ 100" });
    add("population", "Average purpose need", round(average(livePeople.map(entity => entity.person.needs?.purpose))), { group: "AVERAGES", unit: "/ 100" });
    for (const [species, count] of countBy(livePeople, entity => entity.person.species)) {
        add("population", "Residents", count, { group: "SPECIES · " + humanizeKey(species) });
        add("population", "Average age", round(average(livePeople.filter(entity => String(entity.person.species) === species).map(entity => entity.person.ageYears))), { group: "SPECIES · " + humanizeKey(species), unit: "years" });
    }
    for (const [lifeStage, count] of countBy(livePeople, entity => entity.person.lifeStage)) {
        add("population", "Residents", count, { group: "LIFE STAGE · " + humanizeKey(lifeStage) });
    }
    for (const [sex, count] of countBy(livePeople, entity => entity.person.sex)) {
        add("population", "Residents", count, { group: "SEX · " + humanizeKey(sex) });
    }
    for (const [role, count] of countBy(livePeople, entity => entity.person.role)) {
        add("population", "Residents", count, { group: "ROLE · " + humanizeKey(role) });
    }
    for (const [job, count] of countBy(livePeople, entity => entity.job || entity.person.role)) {
        add("population", "Residents", count, { group: "OCCUPATION · " + humanizeKey(job) });
    }
    for (const [trait, value] of Object.entries(livePeople[0]?.person?.traits || {})) {
        add("population", "Average " + humanizeKey(trait), round(average(livePeople.map(entity => entity.person.traits?.[trait]))), { group: "TRAIT AVERAGES", unit: "/ 100" });
    }
    for (const [skill, value] of Object.entries(livePeople[0]?.person?.skills || {})) {
        add("population", "Average " + humanizeKey(skill), round(average(livePeople.map(entity => entity.person.skills?.[skill]))), { group: "SKILL AVERAGES", unit: "/ 100" });
    }
    for (const [need, value] of Object.entries(livePeople[0]?.person?.needs || {})) {
        add("population", "Average " + humanizeKey(need), round(average(livePeople.map(entity => entity.person.needs?.[need]))), { group: "NEED AVERAGES", unit: "/ 100" });
    }
    for (const home of households.homes || []) {
        const group = "HOUSEHOLD · " + humanizeKey(BUILDING_LABELS[home.type] || home.type) + " · " + home.x + "," + home.y;
        add("population", "Residents", home.residents, { group });
        add("population", "Capacity", home.capacity, { group });
        add("population", "Occupancy", home.capacity ? Math.round(home.residents / home.capacity * 100) : 0, { group, unit: "%" });
    }
    addTree("population", state.population, { group: "POPULATION REGISTER", maxDepth: 3, maxRows: 80 });

    add("people", "Living people", livePeople.length, { group: "ROSTER" });
    add("people", "Archived people", archives.length, { group: "ROSTER" });
    add("people", "Skills tracked per person", Object.keys(livePeople[0]?.person?.skills || {}).length, { group: "ROSTER" });
    add("people", "Traits tracked per person", Object.keys(livePeople[0]?.person?.traits || {}).length, { group: "ROSTER" });
    add("people", "Memories retained per person", 24, { group: "ROSTER" });
    const peopleForCatalog = [
        ...livePeople.map(entity => ({ entity, person: entity.person, archived: false })),
        ...archives.slice(-STATISTICS_ARCHIVE_LIMIT).map(entry => ({
            entity: entry,
            person: entry.person,
            archived: true
        }))
    ];
    for (const entry of peopleForCatalog) {
        const person = entry.person;
        const name = String(person.name || "Unrecorded person");
        const role = String(person.role || entry.entity?.role || "resident");
        const group = name + " · " + humanizeKey(role) + (entry.archived ? " · ARCHIVED" : "");
        const addPerson = (label, value, options = {}) => add("people", label, value, { group, ...options });
        addPerson("Species", humanizeKey(person.species || "human"));
        addPerson("Sex", humanizeKey(person.sex || "unrecorded"));
        addPerson("Age", person.ageYears, { unit: "years" });
        addPerson("Life stage", humanizeKey(person.lifeStage || "unknown"));
        addPerson("Role", role);
        addPerson("Born in year", person.bornAtYear || "unknown");
        addPerson("Last aged in year", person.lastAgedYear || "unknown");
        addPerson("Job", entry.entity?.job || entry.entity?.person?.job || "none");
        addPerson("Job experience", person.jobExperience || 0, { unit: "/ 100" });
        if (!entry.archived && entry.entity) {
            addPerson("Current job skill", round(getJobSkill(entry.entity)), { unit: "/ 100" });
            addPerson("Workplace", entry.entity.workplace ? (BUILDING_LABELS[entry.entity.workplace.type] || entry.entity.workplace.type) : "none");
            addPerson("Home", entry.entity.home ? entry.entity.home.x + "," + entry.entity.home.y : "none");
            addPerson("Illness active", Boolean((entry.entity.illnessUntilTick || 0) > state.tick));
        }
        addPerson("Goals", Array.isArray(person.goals) ? person.goals.length : 0);
        addPerson("Active goal", person.activeGoal?.id || "none");
        addPerson("Memory count", Array.isArray(person.memories) ? person.memories.length : 0);
        addPerson("Relationship count", Array.isArray(person.relationships) ? person.relationships.length : 0);
        addPerson("Secret count", Array.isArray(person.secrets) ? person.secrets.length : 0);
        addPerson("Parents", Array.isArray(person.kinship?.parents) ? person.kinship.parents.length : 0);
        addPerson("Children", Array.isArray(person.kinship?.children) ? person.kinship.children.length : 0);
        addPerson("Partners", Array.isArray(person.kinship?.partners) ? person.kinship.partners.length : 0);
        addPerson("Guardians", Array.isArray(person.kinship?.guardians) ? person.kinship.guardians.length : 0);
        addPerson("Wards", Array.isArray(person.kinship?.wards) ? person.kinship.wards.length : 0);
        addPerson("Average relationship trust", round(average((person.relationships || []).map(item => item.trust))), { unit: "/ 100" });
        addPerson("Average relationship respect", round(average((person.relationships || []).map(item => item.respect))), { unit: "/ 100" });
        addPerson("Average relationship affinity", round(average((person.relationships || []).map(item => item.affinity))), { unit: "/ 100" });
        for (const [trait, value] of Object.entries(person.traits || {})) {
            addPerson("Trait · " + humanizeKey(trait), value, { unit: "/ 100" });
        }
        for (const [need, value] of Object.entries(person.needs || {})) {
            addPerson("Need · " + humanizeKey(need), value, { unit: "/ 100" });
        }
        for (const [skill, value] of Object.entries(person.skills || {})) {
            addPerson("Skill · " + humanizeKey(skill), value, { unit: "/ 100" });
        }
        for (const [key, value] of Object.entries(person.appearance || {})) {
            if (PRIMITIVE(value)) addPerson("Appearance · " + humanizeKey(key), value);
        }
        if (Array.isArray(person.goals) && person.goals.length) addPerson("Goal list", person.goals.join(", "));
        if (entry.archived && entry.entity?.diedAtYear) addPerson("Died in year", entry.entity.diedAtYear);
    }

    for (const [type, list] of [...buildingTypes.entries()].sort((a, b) => String(BUILDING_LABELS[a[0]] || a[0]).localeCompare(String(BUILDING_LABELS[b[0]] || b[0])))) {
        const label = BUILDING_LABELS[type] || humanizeKey(type);
        const operational = list.filter(building => !(building.construction && building.construction.stage < 3));
        const workers = list.reduce((sum, building) => sum + (workforce.workersByBuilding.get(building) || 0), 0);
        const capacity = BUILDING_WORKFORCE[type] || 0;
        const efficiency = average(list.map(building => {
            try { return getBuildingEfficiency(building, workforce); } catch { return 0; }
        }));
        const group = "TYPE · " + label;
        add("buildings", "Structures", list.length, { group });
        add("buildings", "Operational", operational.length, { group });
        add("buildings", "Under construction", list.length - operational.length, { group });
        add("buildings", "Assigned workers", workers, { group });
        add("buildings", "Workforce capacity", capacity * list.length, { group });
        add("buildings", "Average efficiency", round(efficiency * 100), { group, unit: "%" });
    }
    add("buildings", "Total structures", buildings.length, { group: "ALL BUILDINGS" });
    add("buildings", "Operational structures", buildings.filter(building => !(building.construction && building.construction.stage < 3)).length, { group: "ALL BUILDINGS" });
    add("buildings", "Under construction", buildings.filter(building => building.construction && building.construction.stage < 3).length, { group: "ALL BUILDINGS" });
    add("buildings", "Assigned workers", workforce.employed, { group: "ALL BUILDINGS" });
    add("buildings", "Average efficiency", round(average(buildings.map(building => {
        try { return getBuildingEfficiency(building, workforce); } catch { return 0; }
    })) * 100), { group: "ALL BUILDINGS", unit: "%" });
    for (const building of buildings) {
        const label = BUILDING_LABELS[building.type] || humanizeKey(building.type);
        const group = "#" + String(building.id || building.type) + " · " + label;
        const workers = workforce.workersByBuilding.get(building) || 0;
        const capacity = BUILDING_WORKFORCE[building.type] || 0;
        add("buildings", "Type", label, { group });
        add("buildings", "Construction stage", building.construction?.stage ?? 3, { group });
        add("buildings", "State", building.construction?.stage < 3 ? "UNDER CONSTRUCTION" : "OPERATIONAL", { group });
        add("buildings", "Assigned workers", workers, { group });
        add("buildings", "Workforce capacity", capacity, { group });
        add("buildings", "Efficiency", round((() => { try { return getBuildingEfficiency(building, workforce); } catch { return 0; } })() * 100), { group, unit: "%" });
        add("buildings", "Position X", building.x, { group });
        add("buildings", "Position Y", building.y, { group });
        add("buildings", "Hit points", building.hp ?? building.health ?? "unknown", { group });
        add("buildings", "Furnished", Boolean(building.furnished), { group });
        addTree("buildings", building.inventory, { group: group + " · INVENTORY", maxDepth: 2, maxRows: 16, arrayLimit: 3 });
        addTree("buildings", building.production, { group: group + " · PRODUCTION", maxDepth: 2, maxRows: 12, arrayLimit: 3 });
    }
    addTree("buildings", state.city?.fields, { group: "FIELDS", maxDepth: 2, maxRows: 60, arrayLimit: 3 });

    addTree("economy", economy, { group: "ROYAL LEDGER", maxDepth: 3, maxRows: 150 });
    addTree("economy", market, { group: "MARKET", maxDepth: 2, maxRows: 90, arrayLimit: 3 });
    add("economy", "Ledger days elapsed", economy.daysElapsed || 0, { group: "TOTALS" });
    add("economy", "Food consumed", round(economy.foodConsumed), { group: "TOTALS", unit: "food" });
    add("economy", "Taxes collected", round(economy.taxesCollected), { group: "TOTALS", unit: "gold" });
    add("economy", "Wages paid", round(economy.wagesPaid), { group: "TOTALS", unit: "gold" });
    add("economy", "Upkeep paid", round(economy.upkeepPaid), { group: "TOTALS", unit: "gold" });
    add("economy", "Furniture upkeep", round(economy.furnitureUpkeepPaid), { group: "TOTALS", unit: "gold" });
    add("economy", "Unpaid wages", round(economy.unpaidWages), { group: "TOTALS", unit: "gold" });
    add("economy", "Unpaid upkeep", round(economy.unpaidUpkeep), { group: "TOTALS", unit: "gold" });
    add("economy", "Unpaid furniture", round(economy.unpaidFurniture), { group: "TOTALS", unit: "gold" });
    add("economy", "Net gold last ledger", round(economy.lastLedger?.netGold), { group: "LAST LEDGER", unit: "gold" });
    add("economy", "Food shortage last ledger", round(economy.lastLedger?.foodShortage), { group: "LAST LEDGER", unit: "food" });
    add("economy", "Market partners", Array.isArray(market?.partners) ? market.partners.length : 0, { group: "MARKET" });
    add("economy", "Price history points", Array.isArray(market?.priceHistory?.wood) ? market.priceHistory.wood.length : 0, { group: "MARKET" });
    for (const [resource, value] of Object.entries(market?.prices || {})) {
        add("economy", "Market price · " + humanizeKey(resource), value, { group: "CURRENT PRICES", unit: "gold" });
    }

    for (const [resource, value] of Object.entries(resources)) {
        add("resources", "Stock · " + humanizeKey(resource), value, { group: "ROYAL STORES" });
        add("resources", "Income per tick · " + humanizeKey(resource), income[resource] || 0, { group: "FLOW" });
    }
    add("resources", "Total stored goods", Object.values(resources).reduce((sum, value) => sum + safeNumber(value), 0), { group: "ROYAL STORES" });
    add("resources", "Positive income streams", Object.values(income).filter(value => safeNumber(value) > 0).length, { group: "FLOW" });
    add("resources", "Negative income streams", Object.values(income).filter(value => safeNumber(value) < 0).length, { group: "FLOW" });
    addTree("resources", state.resourceGeography, { group: "RESOURCE GEOGRAPHY", maxDepth: 2, maxRows: 30, arrayLimit: 3 });
    addTree("resources", state.crownSupply, { group: "CROWN SUPPLY", maxDepth: 2, maxRows: 40 });

    addTree("city", state.city, { group: "SETTLEMENT", maxDepth: 3, maxRows: 140, arrayLimit: 3 });
    addTree("city", state.city?.logistics, { group: "LOGISTICS", maxDepth: 2, maxRows: 80, arrayLimit: 3 });
    addTree("city", state.city?.services, { group: "SERVICES", maxDepth: 2, maxRows: 80, arrayLimit: 3 });
    addTree("city", state.city?.needs, { group: "NEEDS", maxDepth: 3, maxRows: 80, arrayLimit: 3 });

    addTree("politics", state.politics, { group: "FACTIONS", maxDepth: 2, maxRows: 40 });
    addTree("politics", state.government, { group: "GOVERNMENT", maxDepth: 3, maxRows: 60 });
    addTree("politics", state.identity, { group: "IDENTITY", maxDepth: 2, maxRows: 30 });
    addTree("politics", state.endeavours, { group: "ENDEAVOURS", maxDepth: 2, maxRows: 50 });
    addSnapshotRows(add, "politics", politics, "POLITICAL SNAPSHOT", 20);

    addTree("court", state.court, { group: "ROYAL COURT", maxDepth: 3, maxRows: 100, arrayLimit: 3 });
    addSnapshotRows(add, "court", court, "COURT SNAPSHOT", 35);

    addTree("diplomacy", state.diplomacy, { group: "FOREIGN REALMS", maxDepth: 3, maxRows: 110, arrayLimit: 3 });
    addSnapshotRows(add, "diplomacy", diplomacy, "DIPLOMATIC SNAPSHOT", 30);

    addTree("military", state.military, { group: "GARRISON", maxDepth: 3, maxRows: 110, arrayLimit: 3 });
    addSnapshotRows(add, "military", military, "MILITARY SNAPSHOT", 40);

    addTree("research", state.research, { group: "SCHOLARSHIP", maxDepth: 3, maxRows: 110, arrayLimit: 3 });
    addSnapshotRows(add, "research", research, "RESEARCH SNAPSHOT", 45);

    addTree("faith", state.faith, { group: "FAITH", maxDepth: 3, maxRows: 110, arrayLimit: 3 });
    addSnapshotRows(add, "faith", faith, "FAITH SNAPSHOT", 45);

    addTree("health", state.health, { group: "HEALTH", maxDepth: 3, maxRows: 110, arrayLimit: 3 });
    addSnapshotRows(add, "health", health, "HEALTH SNAPSHOT", 40);

    addTree("justice", state.justice, { group: "JUSTICE", maxDepth: 3, maxRows: 110, arrayLimit: 3 });
    addSnapshotRows(add, "justice", justice, "JUSTICE SNAPSHOT", 40);

    addTree("dynasty", state.royal, { group: "ROYAL HOUSE", maxDepth: 3, maxRows: 90, arrayLimit: 3 });
    addTree("dynasty", state.legacy, { group: "LEGACY", maxDepth: 3, maxRows: 60, arrayLimit: 3 });
    addTree("dynasty", state.hiddenRealm, { group: "HIDDEN REALM", maxDepth: 2, maxRows: 60, arrayLimit: 3 });
    add("dynasty", "Royal house", state.royal?.dynastyName || "Royal House", { group: "ROYAL HOUSE" });
    add("dynasty", "Consort recorded", state.royal?.consortId ? "YES" : "NO", { group: "ROYAL HOUSE" });
    add("dynasty", "Heir recorded", state.royal?.heirId ? "YES" : "NO", { group: "ROYAL HOUSE" });
    add("dynasty", "Dynastic events", Array.isArray(state.royal?.history) ? state.royal.history.length : 0, { group: "ROYAL HOUSE" });

    addTree("ecology", state.weather, { group: "WEATHER", maxDepth: 2, maxRows: 20 });
    addTree("ecology", state.forestFauna, { group: "FOREST FAUNA", maxDepth: 3, maxRows: 90, arrayLimit: 3 });
    addTree("ecology", state.forestGathering, { group: "FOREST GATHERING", maxDepth: 3, maxRows: 70, arrayLimit: 3 });
    addTree("ecology", state.forestSuccession, { group: "FOREST SUCCESSION", maxDepth: 3, maxRows: 70, arrayLimit: 3 });
    addTree("ecology", state.resourceGeography, { group: "RESOURCE GEOGRAPHY", maxDepth: 2, maxRows: 50, arrayLimit: 3 });
    add("ecology", "World climate", state.worldOptions?.climate || "unknown", { group: "WORLD" });
    add("ecology", "Forest coverage setting", state.worldOptions?.forests ?? "unknown", { group: "WORLD", unit: "%" });
    add("ecology", "Water setting", state.worldOptions?.water ?? "unknown", { group: "WORLD", unit: "%" });
    add("ecology", "Fertility setting", state.worldOptions?.fertility ?? "unknown", { group: "WORLD", unit: "%" });
    add("ecology", "Ruggedness setting", state.worldOptions?.ruggedness ?? "unknown", { group: "WORLD", unit: "%" });
    add("ecology", "Creature archive", Array.isArray(state.creatureArchive) ? state.creatureArchive.length : 0, { group: "WILDLIFE" });
    add("ecology", "Weather timer", state.weatherTimer || 0, { group: "WEATHER" });

    add("logistics", "Carriers", state.city?.logistics?.carriers?.length || 0, { group: "DELIVERY NETWORK" });
    add("logistics", "Delivery jobs", state.city?.logistics?.jobs?.length || 0, { group: "DELIVERY NETWORK" });
    add("logistics", "Road tiles", Object.keys(state.roads?.tiles || {}).length, { group: "ROAD NETWORK" });
    add("logistics", "Road version", state.roads?.version || 0, { group: "ROAD NETWORK" });
    add("logistics", "Road revision", state.roads?.revision || 0, { group: "ROAD NETWORK" });
    addTree("logistics", state.city?.logistics, { group: "DELIVERY NETWORK", maxDepth: 2, maxRows: 80, arrayLimit: 3 });
    addTree("logistics", state.roads, { group: "ROAD NETWORK", maxDepth: 2, maxRows: 35, arrayLimit: 3 });

    add("cards", "Cards in hand", Array.isArray(state.hand) ? state.hand.length : 0, { group: "CARD TABLE" });
    add("cards", "Available cards", Array.isArray(state.availableCards) ? state.availableCards.length : 0, { group: "CARD TABLE" });
    add("cards", "Reward queue", Array.isArray(state.cardRewardQueue) ? state.cardRewardQueue.length : 0, { group: "CARD TABLE" });
    add("cards", "Current card", state.currentCard?.name || "None", { group: "CARD TABLE" });
    add("cards", "Selected card", state.selectedCardInstanceId || "None", { group: "CARD TABLE" });
    add("cards", "Cards drawn", statistics.totalCardsDrawn || 0, { group: "CARD TABLE" });
    addTree("cards", state.hand, { group: "HAND", maxDepth: 2, maxRows: 80, arrayLimit: 4 });
    addTree("cards", state.availableCards, { group: "DRAW PILE", maxDepth: 2, maxRows: 100, arrayLimit: 2 });

    add("chronicle", "Event log entries", Array.isArray(state.eventLog) ? state.eventLog.length : 0, { group: "REALM HISTORY" });
    add("chronicle", "Resolved events", statistics.totalEventsResolved || 0, { group: "REALM HISTORY" });
    add("chronicle", "Hidden realm tension", state.hiddenRealm?.tension || 0, { group: "HIDDEN REALM", unit: "/ 100" });
    add("chronicle", "Hidden realm prosperity", state.hiddenRealm?.prosperity || 0, { group: "HIDDEN REALM", unit: "/ 100" });
    add("chronicle", "Hidden realm mystery", state.hiddenRealm?.mystery || 0, { group: "HIDDEN REALM", unit: "/ 100" });
    add("chronicle", "Active chronicle threads", state.hiddenRealm?.activeThreads?.length || 0, { group: "HIDDEN REALM" });
    add("chronicle", "Completed chronicle threads", state.hiddenRealm?.completedThreads?.length || 0, { group: "HIDDEN REALM" });
    add("chronicle", "Archived people", archives.length, { group: "ARCHIVE" });
    add("chronicle", "Creature archive", Array.isArray(state.creatureArchive) ? state.creatureArchive.length : 0, { group: "ARCHIVE" });
    addTree("chronicle", statistics, { group: "LIFETIME COUNTERS", maxDepth: 2, maxRows: 30 });
    addTree("chronicle", state.hiddenRealm, { group: "HIDDEN REALM", maxDepth: 2, maxRows: 55, arrayLimit: 3 });
    addTree("chronicle", state.ambitions, { group: "AMBITIONS", maxDepth: 2, maxRows: 60, arrayLimit: 3 });
    for (const [index, event] of (Array.isArray(state.eventLog) ? state.eventLog.slice(0, 12) : []).entries()) {
        add("chronicle", "Event " + (index + 1), event?.text || "Unrecorded event", { group: "RECENT EVENTS" });
    }

    add("performance", "FPS", safeNumber(state.renderStats?.fps), { group: "FRAME", unit: "fps" });
    add("performance", "Frame time", safeNumber(state.renderStats?.frameMs), { group: "FRAME", unit: "ms" });
    add("performance", "Last draw", safeNumber(state.lastDrawMs), { group: "FRAME", unit: "ms" });
    add("performance", "Rendered frames", state.renderedFrames || 0, { group: "FRAME" });
    add("performance", "Frame limit", state.frameLimit || 0, { group: "FRAME", unit: "fps" });
    add("performance", "Renderer", state.terrainRendererName || state.renderStats?.mode || "unknown", { group: "TERRAIN" });
    add("performance", "Renderer mode", state.terrainMode || "unknown", { group: "TERRAIN" });
    add("performance", "Fallback active", Boolean(state.terrainFallback), { group: "TERRAIN" });
    add("performance", "Terrain cache revision", state.terrainCacheRevision || 0, { group: "CACHES" });
    add("performance", "Forest visual revision", state.forestVisualRevision || 0, { group: "CACHES" });
    add("performance", "Terrain cache hits", state.terrainCacheHits || 0, { group: "CACHES" });
    add("performance", "Terrain cache misses", state.terrainCacheMisses || 0, { group: "CACHES" });
    add("performance", "Path cache size", pathCache.size || 0, { group: "CACHES" });
    add("performance", "Path cache limit", pathCache.limit || 0, { group: "CACHES" });
    add("performance", "Path cache bytes", pathCache.estimatedBytes || 0, { group: "CACHES", unit: "bytes" });
    add("performance", "Path cache hits", pathCache.hits || 0, { group: "PATHFINDING" });
    add("performance", "Path cache misses", pathCache.misses || 0, { group: "PATHFINDING" });
    add("performance", "Path cache evictions", pathCache.evictions || 0, { group: "PATHFINDING" });
    add("performance", "Path cache invalidations", pathCache.invalidations || 0, { group: "PATHFINDING" });
    add("performance", "Frame errors", state.frameErrorCount || 0, { group: "HEALTH" });
    add("performance", "Frame faulted", Boolean(state.frameFaulted), { group: "HEALTH" });
    add("performance", "Entities", entities.length, { group: "HEALTH" });
    add("performance", "Particles", Array.isArray(state.particles) ? state.particles.length : 0, { group: "HEALTH" });
    add("performance", "Floaters", Array.isArray(state.floaters) ? state.floaters.length : 0, { group: "HEALTH" });

    const categoryCounts = Object.fromEntries(STATISTICS_CATEGORIES.map(entry => [entry.id, 0]));
    for (const row of rows) categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
    rows.sort((a, b) =>
        (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99) ||
        a.group.localeCompare(b.group) ||
        a.label.localeCompare(b.label)
    );
    rows.forEach((row, index) => { row.id = "stat-" + index; });
    return {
        tick: state.tick,
        year: state.year,
        rows,
        total: rows.length,
        categories: STATISTICS_CATEGORIES.map(entry => ({ ...entry, count: categoryCounts[entry.id] || 0 })),
        categoryCounts,
        peopleCount: livePeople.length,
        archivedPeopleCount: archives.length,
        buildingCount: buildings.length
    };
}
