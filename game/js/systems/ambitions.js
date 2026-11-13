// Long-term royal ambitions. Each ambition reads authoritative live state,
// advances in a fixed order, and pays its reward exactly once. The ladder is
// deliberately broader than the year-12 victory so a realm can keep playing.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";
import { isHousingType, housingCapacityFor } from "./city-config.js";
import { addResource } from "./resources.js";
import { TECHNOLOGIES } from "./research.js";
import { createLegacyState, PRESTIGE_LIMIT, recordLegacy } from "./legacy.js";
import { DIPLOMATIC_REALMS } from "./diplomacy-config.js";
import { applyPoliticalEffects } from "./politics.js";

// `toLocaleString` builds a formatter on every call. Ambition labels are
// refreshed with each simulation snapshot, so reuse one en-US formatter.
const INTEGER_FORMAT = new Intl.NumberFormat("en-US");
const formatInteger = value => INTEGER_FORMAT.format(Math.floor(Number(value) || 0));
const RESOURCE_ORDER = ["wood", "stone", "gold", "food"];
const RESOURCE_LABELS = Object.freeze({ wood: "wood", stone: "stone", gold: "gold", food: "food" });

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function countBuildings(type) {
    return state.entities.filter(entity => !entity.dead && entity.type === type).length;
}
function population() {
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
}
function housingCapacity() {
    return state.entities
        .filter(entity => !entity.dead && isHousingType(entity.type))
        .reduce((sum, entity) => sum + housingCapacityFor(entity.type), 0);
}
function satisfaction() {
    return number(state.city?.needs?.summary?.satisfaction, 0);
}
function food() {
    return number(state.resources?.food);
}
function gold() {
    return number(state.resources?.gold);
}
function morale() {
    return number(state.morale);
}
function year() {
    return Math.max(1, number(state.year, 1));
}
function roads() {
    return Math.max(0, number(state.statistics?.totalRoadTilesBuilt));
}
function built() {
    return Math.max(0, number(state.statistics?.totalBuildingsBuilt));
}
function resolvedIssues() {
    return Math.max(0, number(state.statistics?.totalEventsResolved));
}
function technologiesCompleted() {
    const completed = state.research?.completed;
    if (!completed || typeof completed !== "object") return 0;
    return TECHNOLOGIES.reduce((total, tech) => total + (completed[tech.id] ? 1 : 0), 0);
}
function soldiers() {
    return state.entities.filter(entity => !entity.dead && (entity.type === TYPE.GUARD || entity.type === TYPE.ARCHER || entity.type === TYPE.KNIGHT)).length;
}
function temples() {
    return countBuildings(TYPE.TEMPLE) + countBuildings(TYPE.SHRINE);
}
function trades() {
    return Math.max(0, number(state.statistics?.totalTrades));
}
function alliances() {
    const realms = state.diplomacy?.realms;
    return Array.isArray(realms) ? realms.filter(realm => realm && realm.treaty === "alliance").length : 0;
}
function prestige() {
    return Math.max(0, number(state.legacy?.prestige));
}
function legitimacy() {
    return number(state.politics?.legitimacy);
}
function faction(name) {
    return number(state.politics?.factions?.[name]);
}
function taxes() {
    return Math.max(0, number(state.economy?.taxesCollected));
}

export const AMBITIONS = Object.freeze([
    Object.freeze({
        id: "full-larder",
        title: "Fill the Royal Granary",
        description: "Keep 220 food in the royal stores while the settlement grows.",
        reward: Object.freeze({ gold: 25 }),
        check: () => food() >= 220,
        progress: () => Math.min(1, food() / 220),
        progressLabel: () => Math.floor(food()) + " / 220 food"
    }),
    Object.freeze({
        id: "room-to-grow",
        title: "Make Room for the Living",
        description: "Reach 20 residents and 24 housing capacity.",
        reward: Object.freeze({ wood: 35, stone: 20 }),
        check: () => population() >= 20 && housingCapacity() >= 24,
        progress: () => Math.min(1, population() / 20, housingCapacity() / 24),
        progressLabel: () => population() + " residents · " + housingCapacity() + " / 24 housing"
    }),
    Object.freeze({
        id: "royal-road",
        title: "Connect the Realm",
        description: "Lay at least 12 road tiles between the crown's settlements.",
        reward: Object.freeze({ gold: 30 }),
        check: () => roads() >= 12,
        progress: () => Math.min(1, roads() / 12),
        progressLabel: () => roads() + " / 12 road tiles"
    }),
    Object.freeze({
        id: "four-fields",
        title: "A Full Harvest",
        description: "Operate four farmsteads, a mill and a bakery together.",
        reward: Object.freeze({ food: 50 }),
        check: () => countBuildings(TYPE.FARM) >= 4 && countBuildings(TYPE.MILL) >= 1 && countBuildings(TYPE.BAKERY) >= 1,
        progress: () => Math.min(1, countBuildings(TYPE.FARM) / 4),
        progressLabel: () => countBuildings(TYPE.FARM) + " / 4 farmsteads · " + countBuildings(TYPE.MILL) + " mill · " + countBuildings(TYPE.BAKERY) + " bakery"
    }),
    Object.freeze({
        id: "crown-wealth",
        title: "A Treasury Worth Guarding",
        description: "Hold 500 gold in the royal treasury.",
        reward: Object.freeze({ stone: 60 }),
        check: () => gold() >= 500,
        progress: () => Math.min(1, gold() / 500),
        progressLabel: () => Math.floor(gold()) + " / 500 gold"
    }),
    Object.freeze({
        id: "civic-heart",
        title: "The Civic Heart",
        description: "Support two wells, a market and a temple.",
        reward: Object.freeze({ food: 40 }),
        check: () => countBuildings(TYPE.WELL) >= 2 && countBuildings(TYPE.MARKET) >= 1 && countBuildings(TYPE.TEMPLE) >= 1,
        progress: () => Math.min(1, (countBuildings(TYPE.WELL) / 2 + Math.min(1, countBuildings(TYPE.MARKET)) + Math.min(1, countBuildings(TYPE.TEMPLE))) / 3),
        progressLabel: () => countBuildings(TYPE.WELL) + " wells · " + countBuildings(TYPE.MARKET) + " market · " + countBuildings(TYPE.TEMPLE) + " temple"
    }),
    Object.freeze({
        id: "steadfast-realm",
        title: "A Steadfast Realm",
        description: "Reach 25 residents and 85 morale.",
        reward: Object.freeze({ gold: 50 }),
        check: () => population() >= 25 && morale() >= 85,
        progress: () => Math.min(1, population() / 25, morale() / 85),
        progressLabel: () => population() + " residents · " + Math.round(morale()) + " morale"
    }),
    Object.freeze({
        id: "royal-line",
        title: "Secure the Royal Line",
        description: "Designate an heir in the royal house.",
        reward: Object.freeze({ food: 60, gold: 20 }),
        check: () => Boolean(state.royal?.heirId),
        progress: () => state.royal?.heirId ? 1 : 0,
        progressLabel: () => state.royal?.heirId ? "An heir is designated" : "No heir designated"
    }),
    Object.freeze({
        id: "master-builders",
        title: "A Realm of Stone and Timber",
        description: "Complete 12 new buildings in this campaign.",
        reward: Object.freeze({ wood: 80, stone: 40 }),
        check: () => built() >= 12,
        progress: () => Math.min(1, built() / 12),
        progressLabel: () => built() + " / 12 buildings completed"
    }),
    Object.freeze({
        id: "seasoned-crown",
        title: "The Crown Hears Every Petition",
        description: "Resolve 12 realm issues through the royal council.",
        reward: Object.freeze({ gold: 60 }),
        check: () => resolvedIssues() >= 12,
        progress: () => Math.min(1, resolvedIssues() / 12),
        progressLabel: () => resolvedIssues() + " / 12 issues resolved"
    }),
    Object.freeze({
        id: "enduring-realm",
        title: "The Kingdom Endures",
        description: "Reach year 12 with at least 80 morale.",
        reward: Object.freeze({ gold: 120 }),
        check: () => year() >= 12 && morale() >= 80,
        progress: () => Math.min(1, year() / 12, morale() / 80),
        progressLabel: () => "Year " + year() + " / 12 · " + Math.round(morale()) + " morale"
    }),
    Object.freeze({
        id: "great-realm",
        title: "A Great and Populous Realm",
        description: "Reach year 16 with 40 residents and satisfied households.",
        reward: Object.freeze({ food: 100, stone: 60 }),
        check: () => year() >= 16 && population() >= 40 && satisfaction() >= 0.6,
        progress: () => Math.min(1, year() / 16, population() / 40, satisfaction() / 0.6),
        progressLabel: () => "Year " + year() + " / 16 · " + population() + " / 40 residents · " + Math.round(satisfaction() * 100) + "% satisfaction"
    }),
    Object.freeze({
        id: "eternal-realm",
        title: "The Eternal Realm",
        description: "Reach year 20 with 55 residents, 2,000 gold and 80 morale.",
        reward: Object.freeze({ gold: 250, food: 150 }),
        check: () => year() >= 20 && population() >= 55 && gold() >= 2000 && morale() >= 80,
        progress: () => Math.min(1, year() / 20, population() / 55, gold() / 2000, morale() / 80),
        progressLabel: () => "Year " + year() + " / 20 · " + population() + " / 55 residents · " + Math.floor(gold()) + " / 2,000 gold"
    })
]);

const AMBITION_IDS = new Set(AMBITIONS.map(ambition => ambition.id));

// ── The Second Crown ──────────────────────────────────────────────────────
// The royal ladder ends with a deliberate fork instead of another generated
// reward. The chosen era is permanent for the realm, changes the long-run
// event mix through the existing event family weights, and uses the same
// completed-thread/event UI rather than a parallel story system.

export const CROWN_ERAS = Object.freeze([
    Object.freeze({
        id: "common-weal",
        title: "The Common Weal",
        description: "The commons take the lead. Harvests and festivals become more common; shortages lose their hold on the realm.",
        rewardText: "+120 food · +40 gold · commons +6 · guilds +2 · legitimacy +2 · morale +4",
        effects: Object.freeze({
            resources: Object.freeze({ food: 120, gold: 40 }),
            morale: 4,
            politics: Object.freeze({ commons: 6, guilds: 2, legitimacy: 2 }),
            hidden: Object.freeze({ prosperity: 4, tension: -3 })
        }),
        eventBias: Object.freeze({ harvest: 1.6, shortage: 0.55, festival: 1.3, migration: 1.2 }),
        agenda: Object.freeze([
            Object.freeze({
                id: "common-granary",
                title: "The Common Granary",
                description: "Hold 180 more food than when the age began, so no household faces an empty shelf.",
                value: food,
                target: current => current + 180,
                progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " food",
                rewardText: "+2 morale · commons +3 · legitimacy +1 · food demand -3%",
                effects: Object.freeze({
                    morale: 2,
                    politics: Object.freeze({ commons: 3, legitimacy: 1 }),
                    hidden: Object.freeze({ tension: -2 }),
                    modifiers: Object.freeze({ foodDemandFactor: 0.97 })
                })
            }),
            Object.freeze({
                id: "common-hearths",
                title: "A Hearth for Every Hand",
                description: "Raise housing capacity by four so new households have a hearth.",
                value: housingCapacity,
                target: current => current + 4,
                progressLabel: (value, target) => value + " / " + target + " housing",
                rewardText: "+3 morale · commons +4 · guilds +1 · migration +12%",
                effects: Object.freeze({
                    morale: 3,
                    politics: Object.freeze({ commons: 4, guilds: 1 }),
                    hidden: Object.freeze({ prosperity: 2 }),
                    modifiers: Object.freeze({ migrationFactor: 1.12 })
                })
            }),
            Object.freeze({
                id: "common-hearths-filled",
                title: "Every Hearth Filled",
                description: "Grow the population by four now that the new hearths stand.",
                value: population,
                target: current => current + 4,
                progressLabel: (value, target) => value + " / " + target + " residents",
                rewardText: "+4 legitimacy · +3 morale · guilds +2 · food demand -2%",
                effects: Object.freeze({
                    morale: 3,
                    politics: Object.freeze({ commons: 4, guilds: 2, legitimacy: 4 }),
                    hidden: Object.freeze({ tension: -2 }),
                    modifiers: Object.freeze({ foodDemandFactor: 0.98, legitimacyYear: 0.005 })
                })
            })
        ])
    }),
    Object.freeze({
        id: "guild-compact",
        title: "The Guild Compact",
        description: "The guilds set the tempo. Caravans, craft and negotiated charters shape the years; the old tax quarrels fade.",
        rewardText: "+120 gold · +30 stone · guilds +6 · nobility +2 · legitimacy +1 · morale +2",
        effects: Object.freeze({
            resources: Object.freeze({ gold: 120, stone: 30 }),
            morale: 2,
            politics: Object.freeze({ guilds: 6, nobility: 2, legitimacy: 1 }),
            hidden: Object.freeze({ prosperity: 5, tension: -1 })
        }),
        eventBias: Object.freeze({ caravan: 1.55, guild: 1.45, craft: 1.35, taxation: 0.7 }),
        agenda: Object.freeze([
            Object.freeze({
                id: "guild-treasury",
                title: "A Treasury of Contracts",
                description: "Hold 350 more gold than when the age began, underwritten by chartered trade.",
                value: gold,
                target: current => current + 350,
                progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " gold",
                rewardText: "+1 legitimacy · guilds +3 · tax yield +3%",
                effects: Object.freeze({
                    politics: Object.freeze({ guilds: 3, legitimacy: 1 }),
                    hidden: Object.freeze({ prosperity: 2 }),
                    modifiers: Object.freeze({ taxEfficiency: 1.03 })
                })
            }),
            Object.freeze({
                id: "guild-ledger",
                title: "The Long Ledger",
                description: "Collect 300 more gold in taxes for the chartered towns.",
                value: taxes,
                target: current => current + 300,
                progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " taxes",
                rewardText: "+2 prosperity · guilds +3 · trade terms +5%",
                effects: Object.freeze({
                    politics: Object.freeze({ guilds: 3, nobility: 1 }),
                    hidden: Object.freeze({ prosperity: 3 }),
                    modifiers: Object.freeze({ tradeFactor: 1.05 })
                })
            }),
            Object.freeze({
                id: "guild-charter",
                title: "The Guildhall Compact",
                description: "Hold 500 more gold and bind the guildhall to the crown's accounts.",
                value: gold,
                target: current => current + 500,
                progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " gold",
                rewardText: "+4 guilds · +1 nobility · tax yield +3% · trade terms +3%",
                effects: Object.freeze({
                    politics: Object.freeze({ guilds: 4, nobility: 1 }),
                    hidden: Object.freeze({ prosperity: 3 }),
                    modifiers: Object.freeze({ taxEfficiency: 1.03, tradeFactor: 1.03 })
                })
            })
        ])
    }),
    Object.freeze({
        id: "royal-ascendancy",
        title: "The Royal Ascendancy",
        description: "The crown gathers the offices of state. Succession, taxation and the border dominate the chronicle, at the cost of a more watchful nobility.",
        rewardText: "+150 gold · +40 stone · nobility +6 · clergy +2 · legitimacy +4 · tension +1",
        effects: Object.freeze({
            resources: Object.freeze({ gold: 150, stone: 40 }),
            morale: 2,
            politics: Object.freeze({ nobility: 6, clergy: 2, legitimacy: 4 }),
            hidden: Object.freeze({ prosperity: 2, tension: 1 })
        }),
        eventBias: Object.freeze({ succession: 1.4, taxation: 1.25, border: 1.3, rebellion: 0.8 }),
        agenda: Object.freeze([
            Object.freeze({
                id: "crown-peace",
                title: "The Crown's Peace",
                description: "Raise legitimacy to at least 80 and make the crown's justice ordinary.",
                value: legitimacy,
                target: current => Math.min(100, Math.max(current + 8, 80)),
                progressLabel: (value, target) => Math.round(value) + " / " + Math.round(target) + " legitimacy",
                rewardText: "+4 legitimacy · nobility +3 · clergy +1 · annual legitimacy +0.01",
                effects: Object.freeze({
                    politics: Object.freeze({ nobility: 3, clergy: 1, legitimacy: 4 }),
                    hidden: Object.freeze({ tension: -1 }),
                    modifiers: Object.freeze({ legitimacyYear: 0.01 })
                })
            }),
            Object.freeze({
                id: "crown-watch",
                title: "The Watch on the Border",
                description: "Hold 400 more gold for the frontier watch and its war chest.",
                value: gold,
                target: current => current + 400,
                progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " gold",
                rewardText: "+3 legitimacy · nobility +3 · rebellion pressure -10%",
                effects: Object.freeze({
                    politics: Object.freeze({ nobility: 3, legitimacy: 3 }),
                    hidden: Object.freeze({ tension: -2 }),
                    modifiers: Object.freeze({ unrestFactor: 0.9 })
                })
            }),
            Object.freeze({
                id: "crown-succession",
                title: "The Second Succession",
                description: "Collect 400 more gold in taxes to settle the next succession.",
                value: taxes,
                target: current => current + 400,
                progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " taxes",
                rewardText: "+4 legitimacy · nobility +2 · clergy +2 · trade terms +2%",
                effects: Object.freeze({
                    politics: Object.freeze({ nobility: 2, clergy: 2, legitimacy: 4 }),
                    hidden: Object.freeze({ prosperity: 2 }),
                    modifiers: Object.freeze({ tradeFactor: 1.02, legitimacyYear: 0.005 })
                })
            })
        ])
    })
]);
const CROWN_ERA_BY_ID = new Map(CROWN_ERAS.map(era => [era.id, era]));

const AGENDA_MODIFIER_LIMITS = Object.freeze({
    foodDemandFactor: [0.70, 1.10],
    taxEfficiency: [1.00, 1.15],
    tradeFactor: [1.00, 1.20],
    migrationFactor: [1.00, 1.30],
    unrestFactor: [0.75, 1.20],
    legitimacyYear: [-0.02, 0.05]
});
const DEFAULT_AGENDA_MODIFIERS = Object.freeze({
    foodDemandFactor: 1,
    taxEfficiency: 1,
    tradeFactor: 1,
    migrationFactor: 1,
    unrestFactor: 1,
    legitimacyYear: 0
});
const clampAgendaModifier = (key, value) => {
    const [min, max] = AGENDA_MODIFIER_LIMITS[key] || [-Infinity, Infinity];
    return Math.max(min, Math.min(max, value));
};

function normalizeAgendaModifiers(input) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return Object.fromEntries(Object.entries(DEFAULT_AGENDA_MODIFIERS).map(([key, fallback]) => [
        key,
        clampAgendaModifier(key, number(source[key], fallback))
    ]));
}

function normalizeCrownAgenda(input, definition) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const baseline = number(input.baseline, NaN);
    const target = number(input.target, NaN);
    if (!Number.isFinite(baseline) || !Number.isFinite(target)) return null;
    const stage = Math.max(0, Math.min(definition.agenda.length, Math.floor(number(input.stage))));
    const completed = Array.isArray(input.completed)
        ? input.completed.map(entry => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
            const id = String(entry.id || "");
            if (!definition.agenda.some(item => item.id === id)) return null;
            return {
                id,
                title: String(entry.title || definition.agenda.find(item => item.id === id)?.title || id).slice(0, 96),
                tick: Math.max(0, Math.floor(number(entry.tick))),
                year: Math.max(1, Math.floor(number(entry.year, 1)))
            };
        }).filter(Boolean).slice(0, definition.agenda.length)
        : [];
    return {
        stage,
        baseline,
        target,
        bestValue: Math.max(baseline, number(input.bestValue, baseline)),
        startedTick: Math.max(0, Math.floor(number(input.startedTick))),
        startedYear: Math.max(1, Math.floor(number(input.startedYear, state.year))),
        completed,
        modifiers: normalizeAgendaModifiers(input.modifiers),
        complete: Boolean(input.complete) || stage >= definition.agenda.length
    };
}

function createCrownAgenda(definition) {
    const stage = definition.agenda[0];
    const baseline = number(stage.value());
    return {
        stage: 0,
        baseline,
        target: number(stage.target(baseline)),
        bestValue: baseline,
        startedTick: state.tick,
        startedYear: year(),
        completed: [],
        modifiers: { ...DEFAULT_AGENDA_MODIFIERS },
        complete: false
    };
}

function ensureCrownAgenda(era) {
    const definition = CROWN_ERA_BY_ID.get(era.id);
    if (!definition) return null;
    const normalized = normalizeCrownAgenda(era.agenda, definition);
    if (normalized) {
        era.agenda = normalized;
        return normalized;
    }
    era.agenda = createCrownAgenda(definition);
    return era.agenda;
}

function normalizeCrownEra(era) {
    if (!era || typeof era !== "object" || Array.isArray(era)) return null;
    const id = String(era.id || "");
    const definition = CROWN_ERA_BY_ID.get(id);
    if (!definition) return null;
    return {
        id,
        chosenTick: Math.max(0, Math.floor(number(era.chosenTick, state.tick))),
        chosenYear: Math.max(1, Math.floor(number(era.chosenYear, state.year))),
        agenda: normalizeCrownAgenda(era.agenda, definition) || createCrownAgenda(definition)
    };
}

export function getCrownEraSnapshot() {
    const data = ensureAmbitions();
    const era = normalizeCrownEra(data.era);
    if (!era) return null;
    data.era = era;
    const definition = CROWN_ERA_BY_ID.get(era.id);
    const agenda = ensureCrownAgenda(era);
    const stageIndex = Math.min(agenda.stage, definition.agenda.length - 1);
    const stage = definition.agenda[stageIndex] || null;
    const value = stage ? number(stage.value()) : 0;
    const span = number(agenda.target) - number(agenda.baseline);
    const progress = agenda.complete ? 1 : span > 0 ? Math.max(0, Math.min(1, (value - agenda.baseline) / span)) : 1;
    return {
        ...era,
        title: definition.title,
        description: definition.description,
        rewardText: definition.rewardText,
        eventBias: { ...definition.eventBias },
        agenda: {
            id: agenda.complete ? null : stage?.id || null,
            stage: agenda.stage,
            stageNumber: Math.min(definition.agenda.length, agenda.stage + 1),
            total: definition.agenda.length,
            complete: agenda.complete,
            title: agenda.complete ? "Agenda Complete" : stage?.title || "Agenda Complete",
            description: agenda.complete ? definition.description : stage?.description || "",
            rewardText: agenda.complete ? "" : stage?.rewardText || "",
            progress: agenda.complete ? 1 : progress,
            progressLabel: agenda.complete ? "All three era objectives are complete" : stage?.progressLabel(value, agenda.target) || "",
            value,
            target: agenda.target,
            completed: agenda.completed.map(entry => ({ ...entry })),
            modifiers: { ...agenda.modifiers }
        }
    };
}

export function canChooseCrownEra(id) {
    const data = ensureAmbitions();
    if (data.era) return false;
    if (Object.keys(data.completed).length < AMBITIONS.length) return false;
    return CROWN_ERA_BY_ID.has(String(id));
}

export function chooseCrownEra(id) {
    if (!canChooseCrownEra(id)) return null;
    const definition = CROWN_ERA_BY_ID.get(String(id));
    const data = ensureAmbitions();
    const effects = definition.effects || {};
    for (const [key, value] of Object.entries(effects.resources || {})) {
        if (Number(value) > 0) addResource(key, Number(value));
    }
    if (Number.isFinite(effects.morale)) {
        state.morale = Math.max(0, Math.min(100, number(state.morale) + Number(effects.morale)));
    }
    if (effects.politics && typeof effects.politics === "object") applyPoliticalEffects(effects.politics);
    const hidden = state.hiddenRealm || (state.hiddenRealm = { tension: 0, prosperity: 0, mystery: 0, memories: [] });
    for (const key of ["tension", "prosperity", "mystery"]) {
        hidden[key] = Math.max(-30, Math.min(100, number(hidden[key]) + number(effects.hidden?.[key])));
    }
    data.era = { id: definition.id, chosenTick: state.tick, chosenYear: year(), agenda: createCrownAgenda(definition) };
    try {
        recordLegacy("crown-era", "The Second Crown — " + definition.title, definition.description, { importance: 4 });
    } catch {
        // The choice remains valid even if a bounded chronicle write fails.
    }
    return getCrownEraSnapshot();
}

function applyCrownAgendaEffects(agenda, stage) {
    const effects = stage.effects || {};
    for (const [key, value] of Object.entries(effects.resources || {})) {
        if (Number.isFinite(Number(value)) && Number(value) !== 0) addResource(key, Number(value));
    }
    if (Number.isFinite(effects.morale)) {
        state.morale = Math.max(0, Math.min(100, number(state.morale) + Number(effects.morale)));
    }
    if (effects.politics && typeof effects.politics === "object") applyPoliticalEffects(effects.politics);
    const hidden = state.hiddenRealm || (state.hiddenRealm = { tension: 0, prosperity: 0, mystery: 0, memories: [] });
    for (const key of ["tension", "prosperity", "mystery"]) {
        hidden[key] = Math.max(-30, Math.min(100, number(hidden[key]) + number(effects.hidden?.[key])));
    }
    for (const [key, value] of Object.entries(effects.modifiers || {})) {
        if (!Number.isFinite(Number(value))) continue;
        if (key === "legitimacyYear") agenda.modifiers[key] = clampAgendaModifier(key, number(agenda.modifiers[key]) + Number(value));
        else agenda.modifiers[key] = clampAgendaModifier(key, number(agenda.modifiers[key], 1) * Number(value));
    }
}

function updateCrownAgenda(data) {
    const era = data.era;
    if (!era) return [];
    const definition = CROWN_ERA_BY_ID.get(era.id);
    if (!definition) return [];
    const agenda = ensureCrownAgenda(era);
    if (!agenda || agenda.complete) return [];
    const stage = definition.agenda[agenda.stage];
    if (!stage) {
        agenda.complete = true;
        return [];
    }
    const value = number(stage.value());
    agenda.bestValue = Math.max(agenda.bestValue, value);
    if (value < agenda.target) return [];
    applyCrownAgendaEffects(agenda, stage);
    agenda.completed.unshift({ id: stage.id, title: stage.title, tick: state.tick, year: year() });
    if (agenda.completed.length > definition.agenda.length) agenda.completed.length = definition.agenda.length;
    agenda.stage++;
    try {
        recordLegacy("crown-agenda", "Era Agenda Fulfilled — " + stage.title, stage.description, { importance: 3 });
    } catch {
        // Stage completion remains valid even if a bounded chronicle write fails.
    }
    if (agenda.stage >= definition.agenda.length) {
        agenda.complete = true;
        try {
            recordLegacy("crown-agenda", "The " + definition.title + " Agenda Complete", "All three era objectives are fulfilled.", { importance: 5 });
        } catch {
            // The agenda is already complete; a failed legacy write must not throw.
        }
    } else {
        const next = definition.agenda[agenda.stage];
        const nextBaseline = number(next.value());
        agenda.baseline = nextBaseline;
        agenda.target = number(next.target(nextBaseline));
        agenda.bestValue = nextBaseline;
        agenda.startedTick = state.tick;
        agenda.startedYear = year();
    }
    return ["era-agenda:" + stage.id];
}

// ── Eternal deeds ────────────────────────────────────────────────────────
// The thirteen royal ambitions are a finished story. Eternal deeds continue
// the same panel with goals drawn from live systems, one at a time, forever.
// Each target is fixed when the deed is issued and saved with the realm.

const ETERNAL_HISTORY_LIMIT = 12;
const ETERNAL_COUNT_LIMIT = 100000;
const ETERNAL_STALL_YEARS = 3;

export const ETERNAL_DEEDS = Object.freeze([
    Object.freeze({
        id: "more-hearths",
        title: "The Realm Still Grows",
        description: "Welcome more residents into the living realm.",
        value: population,
        target: (current, count) => current + Math.min(12, 4 + Math.floor(count / 4)),
        available: () => population() < 380,
        progressLabel: (value, target) => value + " / " + target + " residents",
        reward: Object.freeze({ food: 45 })
    }),
    Object.freeze({
        id: "raise-roofs",
        title: "A Roof for Every Soul",
        description: "Raise the housing capacity of the realm.",
        value: housingCapacity,
        target: (current, count) => current + Math.min(10, 3 + Math.floor(count / 5)),
        available: () => housingCapacity() < 500,
        progressLabel: (value, target) => value + " / " + target + " housing",
        reward: Object.freeze({ wood: 50 })
    }),
    Object.freeze({
        id: "stone-and-timber",
        title: "The Builders' Century",
        description: "Complete new buildings for the crown.",
        value: built,
        target: (current, count) => current + Math.min(8, 3 + Math.floor(count / 5)),
        available: () => built() < 400,
        progressLabel: (value, target) => value + " / " + target + " buildings completed",
        reward: Object.freeze({ stone: 55 })
    }),
    Object.freeze({
        id: "royal-roads",
        title: "Roads That Outlive the King",
        description: "Lay new road tiles between the settlements.",
        value: roads,
        target: (current, count) => current + Math.min(20, 6 + Math.floor(count / 2)),
        available: () => roads() < 3000,
        progressLabel: (value, target) => value + " / " + target + " road tiles",
        reward: Object.freeze({ gold: 60 })
    }),
    Object.freeze({
        id: "crown-chest",
        title: "A Treasury for the Ages",
        description: "Hold a larger reserve of gold in the royal treasury.",
        value: gold,
        target: current => Math.ceil(Math.max(current + 400, current * 1.35)),
        progressLabel: (value, target) => formatInteger(value) + " / " + formatInteger(target) + " gold",
        reward: Object.freeze({ stone: 40, food: 40 })
    }),
    Object.freeze({
        id: "eternal-larder",
        title: "A Granary That Never Empties",
        description: "Keep a deeper reserve of food in store.",
        value: food,
        target: current => Math.ceil(Math.max(current + 300, current * 1.3)),
        progressLabel: (value, target) => formatInteger(value) + " / " + formatInteger(target) + " food",
        reward: Object.freeze({ wood: 40, gold: 40 })
    }),
    Object.freeze({
        id: "contented-crown",
        title: "The Contented Crown",
        description: "Lift the morale of the realm still higher.",
        value: morale,
        target: current => Math.min(99, Math.max(current + 3, 88)),
        available: () => morale() < 97,
        progressLabel: (value, target) => Math.round(value) + " / " + Math.round(target) + " morale",
        reward: Object.freeze({ gold: 70 })
    }),
    Object.freeze({
        id: "every-hearth-content",
        title: "Every Hearth Content",
        description: "Raise the satisfaction of the households.",
        value: satisfaction,
        target: current => Math.min(0.98, Math.max(current + 0.05, 0.75)),
        available: () => satisfaction() < 0.95,
        progressLabel: (value, target) => Math.round(value * 100) + "% / " + Math.round(target * 100) + "% satisfaction",
        reward: Object.freeze({ food: 40, gold: 30 })
    }),
    Object.freeze({
        id: "listening-throne",
        title: "The Listening Throne",
        description: "Resolve more petitions and realm issues.",
        value: resolvedIssues,
        target: (current, count) => current + Math.min(24, 6 + Math.floor(count / 2)),
        progressLabel: (value, target) => value + " / " + target + " issues resolved",
        reward: Object.freeze({ gold: 65 })
    }),
    Object.freeze({
        id: "unending-archive",
        title: "The Unending Archive",
        description: "Complete another technology in the royal archive.",
        value: technologiesCompleted,
        target: current => current + 1,
        available: () => technologiesCompleted() < TECHNOLOGIES.length,
        progressLabel: (value, target) => value + " / " + target + " technologies",
        reward: Object.freeze({ gold: 80, stone: 30 })
    }),
    Object.freeze({
        id: "crown-among-crowns",
        title: "A Crown Among Crowns",
        description: "Conclude an alliance with a neighbouring realm.",
        value: alliances,
        target: current => current + 1,
        available: () => alliances() < DIPLOMATIC_REALMS.length,
        progressLabel: (value, target) => value + " / " + target + " alliances",
        reward: Object.freeze({ gold: 90 })
    }),
    Object.freeze({
        id: "name-that-endures",
        title: "The Name That Endures",
        description: "Earn more prestige for the chronicle.",
        value: prestige,
        target: (current, count) => Math.min(PRESTIGE_LIMIT, current + Math.min(120, 25 + Math.floor(count / 2) * 5)),
        available: () => prestige() < PRESTIGE_LIMIT - 10,
        progressLabel: (value, target) => Math.floor(value) + " / " + Math.floor(target) + " prestige",
        reward: Object.freeze({ gold: 50, food: 40 })
    }),
    Object.freeze({
        id: "watch-that-never-sleeps",
        title: "The Watch That Never Sleeps",
        description: "Muster more soldiers for the royal garrison.",
        value: soldiers,
        target: current => current + 2,
        available: () => soldiers() < 120,
        progressLabel: (value, target) => value + " / " + target + " soldiers",
        reward: Object.freeze({ gold: 55, food: 30 })
    }),
    Object.freeze({
        id: "bells-across-centuries",
        title: "Bells Across the Centuries",
        description: "Raise another shrine or temple for the faithful.",
        value: temples,
        target: current => current + 1,
        available: () => temples() < 60,
        progressLabel: (value, target) => value + " / " + target + " places of faith",
        reward: Object.freeze({ stone: 60, gold: 20 })
    }),
    Object.freeze({
        id: "long-ledger",
        title: "The Long Ledger",
        description: "Complete more trades with the neighbouring markets.",
        value: trades,
        target: (current, count) => current + Math.min(24, 8 + Math.floor(count / 3)),
        progressLabel: (value, target) => value + " / " + target + " trades",
        reward: Object.freeze({ gold: 60 })
    })
]);

const ETERNAL_DEED_BY_ID = new Map(ETERNAL_DEEDS.map(deed => [deed.id, deed]));

function normalizeEternalHistory(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const deedId = String(entry.deedId || "");
    const deed = ETERNAL_DEED_BY_ID.get(deedId);
    if (!deed) return null;
    return {
        deedId,
        title: String(entry.title || deed.title).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 96) || deed.title,
        year: Math.max(1, Math.floor(number(entry.year, 1))),
        tick: Math.max(0, Math.floor(number(entry.tick))),
        count: Math.max(1, Math.floor(number(entry.count, 1)))
    };
}

function normalizeEternalActive(active) {
    if (!active || typeof active !== "object" || Array.isArray(active)) return null;
    const deedId = String(active.deedId || "");
    if (!ETERNAL_DEED_BY_ID.has(deedId)) return null;
    const baseline = number(active.baseline, NaN);
    const target = number(active.target, NaN);
    if (!Number.isFinite(baseline) || !Number.isFinite(target) || target <= baseline) return null;
    return {
        deedId,
        baseline,
        target,
        startedTick: Math.max(0, Math.floor(number(active.startedTick))),
        startedYear: Math.max(1, Math.floor(number(active.startedYear, number(state.year, 1)))),
        lastProgressYear: Math.max(1, Math.floor(number(active.lastProgressYear, number(active.startedYear, number(state.year, 1))))),
        bestValue: Math.max(baseline, number(active.bestValue, baseline)),
        generation: Math.max(0, Math.floor(number(active.generation)))
    };
}

function normalizeEternal(source) {
    const input = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const count = Math.min(ETERNAL_COUNT_LIMIT, Math.max(0, Math.floor(number(input.count))));
    const history = Array.isArray(input.history)
        ? input.history.map(normalizeEternalHistory).filter(Boolean).slice(0, ETERNAL_HISTORY_LIMIT)
        : [];
    const active = normalizeEternalActive(input.active);
    const lastCompleted = normalizeEternalHistory(input.lastCompleted);
    const serial = Math.max(count, history.length, active ? active.generation + 1 : 0, Math.floor(number(input.serial)));
    return { count, serial, active, lastCompleted, history };
}

function isValidEternalActive(active) {
    return Boolean(active && typeof active === "object" && !Array.isArray(active) &&
        ETERNAL_DEED_BY_ID.has(String(active.deedId)) &&
        Number.isFinite(Number(active.baseline)) &&
        Number.isFinite(Number(active.target)) &&
        Number(active.target) > Number(active.baseline));
}

function isValidEternalHistory(entry) {
    return Boolean(entry && typeof entry === "object" && !Array.isArray(entry) &&
        ETERNAL_DEED_BY_ID.has(String(entry.deedId)) &&
        Number.isFinite(Number(entry.count)));
}

function ensureEternal(data) {
    // The runtime object is trusted once created. Only repair the fields a
    // hand-edited or legacy save can realistically corrupt, and never rebuild
    // it on every lookup: the active goal is what pays the player.
    let eternal = data.eternal;
    if (!eternal || typeof eternal !== "object" || Array.isArray(eternal)) {
        eternal = normalizeEternal(null);
        data.eternal = eternal;
        return eternal;
    }
    const count = Math.max(0, Math.min(ETERNAL_COUNT_LIMIT, Math.floor(number(eternal.count))));
    if (eternal.count !== count) eternal.count = count;
    if (!Number.isFinite(Number(eternal.serial)) || Number(eternal.serial) < count) eternal.serial = count;
    if (!Array.isArray(eternal.history)) eternal.history = [];
    else if (eternal.history.length > ETERNAL_HISTORY_LIMIT) eternal.history.length = ETERNAL_HISTORY_LIMIT;
    if (eternal.active !== null && eternal.active !== undefined && !isValidEternalActive(eternal.active)) eternal.active = null;
    else if (eternal.active === undefined) eternal.active = null;
    if (eternal.active) {
        if (!Number.isFinite(Number(eternal.active.startedYear))) eternal.active.startedYear = year();
        if (!Number.isFinite(Number(eternal.active.lastProgressYear))) eternal.active.lastProgressYear = Number(eternal.active.startedYear);
        if (!Number.isFinite(Number(eternal.active.bestValue))) eternal.active.bestValue = Number(eternal.active.baseline);
        if (Number(eternal.active.bestValue) < Number(eternal.active.baseline)) eternal.active.bestValue = Number(eternal.active.baseline);
    }
    if (eternal.lastCompleted !== null && eternal.lastCompleted !== undefined && !isValidEternalHistory(eternal.lastCompleted)) eternal.lastCompleted = null;
    return eternal;
}

function deedValue(deed) {
    try {
        const value = Number(deed.value());
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch {
        return 0;
    }
}

function isDeedAvailable(deed) {
    try {
        return deed.available ? Boolean(deed.available()) : true;
    } catch {
        return false;
    }
}

function createEternalActive(eternal) {
    const available = ETERNAL_DEEDS.filter(isDeedAvailable);
    const lastId = eternal.lastCompleted?.deedId;
    const rotated = available.length > 1 ? available.filter(deed => deed.id !== lastId) : available;
    const pool = rotated.length ? rotated : available;
    if (!pool.length) return null;
    const offset = Math.abs(Math.floor(number(state.worldSeed))) % pool.length;
    const deed = pool[(Math.max(0, Math.floor(number(eternal.serial))) + offset) % pool.length];
    const current = deedValue(deed);
    let target = Number(deed.target(current, eternal.count));
    if (!Number.isFinite(target) || target <= current) target = current + 1;
    eternal.active = {
        deedId: deed.id,
        baseline: current,
        target,
        startedTick: Math.max(0, Math.floor(number(state.tick))),
        startedYear: year(),
        lastProgressYear: year(),
        bestValue: current,
        generation: Math.max(0, Math.floor(number(eternal.serial)))
    };
    eternal.serial = Math.max(eternal.count, infinityGuard(eternal.serial + 1));
    return eternal.active;
}

function infinityGuard(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function eternalReward(definition, count) {
    const bonus = Math.min(240, Math.floor(Math.max(0, number(count)) / 2) * 10);
    const reward = {};
    for (const key of RESOURCE_ORDER) {
        const base = Math.max(0, number(definition?.reward?.[key]));
        if (base > 0 || (key === "gold" && bonus > 0)) reward[key] = base + (key === "gold" ? bonus : 0);
    }
    return reward;
}

function eternalPrestige(count) {
    return 2 + Math.min(20, Math.floor(Math.max(0, number(count)) / 3));
}

function awardPrestige(amount) {
    const value = Math.max(0, Math.floor(number(amount)));
    if (!value) return;
    if (!state.legacy || typeof state.legacy !== "object" || Array.isArray(state.legacy)) state.legacy = createLegacyState();
    state.legacy.prestige = Math.min(PRESTIGE_LIMIT, Math.max(0, number(state.legacy.prestige)) + value);
}

function completeEternal(eternal, deed) {
    const ordinal = eternal.count + 1;
    applyReward(eternalReward(deed, eternal.count));
    awardPrestige(eternalPrestige(eternal.count));
    const completed = {
        deedId: deed.id,
        title: deed.title,
        year: year(),
        tick: Math.max(0, Math.floor(number(state.tick))),
        count: ordinal
    };
    eternal.count = ordinal;
    eternal.lastCompleted = completed;
    eternal.history.unshift(completed);
    if (eternal.history.length > ETERNAL_HISTORY_LIMIT) eternal.history.length = ETERNAL_HISTORY_LIMIT;
    eternal.active = null;
    try {
        recordLegacy("eternal-deed", "Eternal Deed Fulfilled — " + deed.title,
            "Eternal deed " + ordinal + " of the living chronicle is fulfilled.", { importance: 0 });
    } catch {
        // The chronicle must never block the deed or its reward.
    }
    createEternalActive(eternal);
}

function updateEternal(data) {
    const eternal = ensureEternal(data);
    if (!eternal.active) {
        createEternalActive(eternal);
        return [];
    }
    const deed = ETERNAL_DEED_BY_ID.get(eternal.active.deedId);
    if (!deed) {
        eternal.active = null;
        return [];
    }
    const value = deedValue(deed);
    if (value > Number(eternal.active.bestValue)) {
        eternal.active.bestValue = value;
        eternal.active.lastProgressYear = year();
    }
    if (value >= Number(eternal.active.target)) {
        completeEternal(eternal, deed);
        return ["eternal:" + deed.id];
    }
    // A realm can reach a hard world limit (mobile capacity, map space) where
    // an issued target can no longer advance. Never let that stall the
    // chronicle forever: after three years without progress the crown sets the
    // deed aside and issues another. No reward is paid for an abandoned deed.
    if (year() - Number(eternal.active.lastProgressYear) >= ETERNAL_STALL_YEARS) {
        try {
            recordLegacy("eternal-deed", "Eternal Deed Set Aside — " + deed.title,
                "The crown turns to a new chapter after " + ETERNAL_STALL_YEARS + " years without progress.", { importance: 0 });
        } catch {
            // A failed chronicle entry must not block the next deed.
        }
        eternal.active = null;
        createEternalActive(eternal);
        return ["eternal-set-aside:" + deed.id];
    }
    return [];
}

function eternalSnapshot(data) {
    const eternal = ensureEternal(data);
    if (!eternal.active) createEternalActive(eternal);
    const active = eternal.active;
    const deed = active ? ETERNAL_DEED_BY_ID.get(active.deedId) : null;
    if (!active || !deed) return null;
    const era = getCrownEraSnapshot();
    const value = deedValue(deed);
    const span = Number(active.target) - Number(active.baseline);
    const progress = span > 0 ? Math.max(0, Math.min(1, (value - Number(active.baseline)) / span)) : 0;
    return {
        allComplete: true,
        eternal: true,
        id: "eternal:" + deed.id,
        title: deed.title,
        description: (era ? era.title + " endures. " : "") + (era?.agenda?.complete ? "Its agenda is complete. " : "") + "The royal ambitions are fulfilled; the chronicle continues. " + deed.description,
        era: era ? era.id : null,
        eraTitle: era ? era.title : null,
        rewardText: rewardText(eternalReward(deed, eternal.count)) + " · +" + eternalPrestige(eternal.count) + " prestige",
        progress,
        progressLabel: String(deed.progressLabel(value, Number(active.target)) || ""),
        completedCount: AMBITIONS.length,
        total: AMBITIONS.length,
        eternalCount: eternal.count,
        eternalLabel: "ETERNAL DEED · " + (eternal.count + 1),
        eternalValue: value,
        eternalTarget: Number(active.target)
    };
}

function crownAgendaSnapshot(era) {
    const agenda = era.agenda;
    const definition = CROWN_ERA_BY_ID.get(era.id);
    if (!agenda || !definition || agenda.complete) return null;
    const stage = definition.agenda[agenda.stage];
    if (!stage) return null;
    return {
        allComplete: true,
        eternal: false,
        agenda: true,
        id: "agenda:" + stage.id,
        title: stage.title,
        description: era.title + " · Era Agenda " + (agenda.stage + 1) + " of " + definition.agenda.length + ". " + stage.description,
        rewardText: stage.rewardText,
        progress: agenda.progress,
        progressLabel: stage.progressLabel(agenda.value, agenda.target),
        completedCount: AMBITIONS.length,
        total: AMBITIONS.length,
        era: era.id,
        eraTitle: era.title,
        stageIndex: agenda.stage,
        stageTotal: definition.agenda.length,
        stageLabel: "ERA AGENDA · " + (agenda.stage + 1) + " OF " + definition.agenda.length,
        agendaValue: agenda.value,
        agendaTarget: agenda.target
    };
}

export function normalizeAmbitions(snapshot) {
    const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
    const completed = {};
    if (source.completed && typeof source.completed === "object" && !Array.isArray(source.completed)) {
        for (const [id, tick] of Object.entries(source.completed)) {
            if (!AMBITION_IDS.has(id)) continue;
            const value = Number(tick);
            completed[id] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        }
    }
    return {
        completed,
        lastEvaluatedTick: Math.max(0, Math.floor(number(source.lastEvaluatedTick))),
        era: normalizeCrownEra(source.era),
        eternal: normalizeEternal(source.eternal)
    };
}

function ensureAmbitions() {
    // Normalize only malformed or missing data. Rebuilding this object on every
    // lookup would detach updateAmbitions() from the object it is mutating and
    // could pay the same reward repeatedly.
    const current = state.ambitions;
    if (!current || typeof current !== "object" || !current.completed || typeof current.completed !== "object" || Array.isArray(current.completed)) {
        state.ambitions = normalizeAmbitions(current);
    } else {
        current.lastEvaluatedTick = Math.max(0, Math.floor(number(current.lastEvaluatedTick)));
        if (!Object.prototype.hasOwnProperty.call(current, "era")) current.era = null;
        else if (current.era !== null && current.era !== undefined &&
            (typeof current.era !== "object" || Array.isArray(current.era) || !CROWN_ERA_BY_ID.has(String(current.era.id)))) {
            current.era = normalizeCrownEra(current.era);
        }
    }
    return state.ambitions;
}

function currentAmbition() {
    const data = ensureAmbitions();
    return AMBITIONS.find(ambition => !Object.prototype.hasOwnProperty.call(data.completed, ambition.id)) || null;
}

function rewardText(reward) {
    return RESOURCE_ORDER
        .filter(key => Number(reward?.[key]) > 0)
        .map(key => "+" + Math.floor(Number(reward[key])) + " " + RESOURCE_LABELS[key])
        .join(" · ");
}

function applyReward(reward) {
    for (const key of RESOURCE_ORDER) {
        const value = Number(reward?.[key]);
        if (Number.isFinite(value) && value > 0) addResource(key, value);
    }
}

function recordCompletion(ambition) {
    state.eventLog.unshift({
        id: ++state.eventSequence,
        text: "AMBITION FULFILLED — " + ambition.title.toUpperCase(),
        color: "#e4bd72",
        tick: state.tick,
        kind: "milestone"
    });
    if (state.eventLog.length > 100) state.eventLog.length = 100;
}

export function updateAmbitions() {
    if (!state.hasStarted || state.isPaused || state.gameOver) return [];
    const data = ensureAmbitions();
    const lastTick = Math.max(0, Math.floor(number(data.lastEvaluatedTick)));
    if (state.tick > 0 && state.tick - lastTick < 20) return [];
    data.lastEvaluatedTick = state.tick;
    const completedNow = [];
    for (let guard = 0; guard < AMBITIONS.length; guard++) {
        const ambition = currentAmbition();
        if (!ambition) break;
        let completed = false;
        try {
            completed = Boolean(ambition.check(state));
        } catch {
            completed = false;
        }
        if (!completed) break;
        data.completed[ambition.id] = state.tick;
        applyReward(ambition.reward);
        recordCompletion(ambition);
        completedNow.push(ambition.id);
    }
    if (Object.keys(data.completed).length >= AMBITIONS.length) {
        for (const tag of updateCrownAgenda(data)) completedNow.push(tag);
        for (const tag of updateEternal(data)) completedNow.push(tag);
    }
    return completedNow;
}

export function getAmbitionSnapshot() {
    const data = ensureAmbitions();
    const current = AMBITIONS.find(ambition => !Object.prototype.hasOwnProperty.call(data.completed, ambition.id)) || null;
    const completedCount = Object.keys(data.completed).length;
    if (!current) {
        const era = getCrownEraSnapshot();
        if (era?.agenda && !era.agenda.complete) {
            const agenda = crownAgendaSnapshot(era);
            if (agenda) return agenda;
        }
        const eternal = eternalSnapshot(data);
        if (eternal) return eternal;
        return {
            allComplete: true,
            eternal: false,
            eternalCount: ensureEternal(data).count,
            id: "eternal-realm",
            title: "The Eternal Realm",
            description: (era ? era.title + " endures. " : "") + "Every royal ambition has been fulfilled. The chronicle is yours to continue.",
            era: era ? era.id : null,
            eraTitle: era ? era.title : null,
            rewardText: "",
            progress: 1,
            progressLabel: "Every royal ambition fulfilled",
            completedCount,
            total: AMBITIONS.length
        };
    }
    let progress = 0;
    let progressLabel = "";
    try {
        progress = Math.max(0, Math.min(1, number(current.progress?.(state))));
        progressLabel = String(current.progressLabel?.(state) || "");
    } catch {
        progress = 0;
        progressLabel = "Progress is awaiting a completed settlement.";
    }
    return {
        allComplete: false,
        id: current.id,
        title: current.title,
        description: current.description,
        rewardText: rewardText(current.reward),
        progress,
        progressLabel,
        completedCount,
        total: AMBITIONS.length
    };
}
