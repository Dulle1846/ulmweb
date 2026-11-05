// Royal edicts: timed policy modifiers that shape the household economy.
// An edict is a small, save-safe record (id, years) — never a live function —
// so a reloaded realm keeps its laws without serialising behaviour.
import { state } from "../core/state.js";
import { addLog } from "./events.js";

export const EDICT_DEFINITIONS = Object.freeze({
    "harvest-law": {
        name: "HARVEST LAW",
        years: 3,
        description: "Granaries open early and the fields are worked in common.",
        modifiers: { food: 0.82, morale: 0.05 }
    },
    "guild-charter": {
        name: "GUILD CHARTER",
        years: 4,
        description: "The guilds gain privileges; their dues flow to the crown.",
        modifiers: { tax: 1.25, morale: -0.04 }
    },
    "scholar-patronage": {
        name: "SCHOLAR PATRONAGE",
        years: 3,
        description: "Scriptoria and schools are endowed by the crown.",
        modifiers: { tax: 1.06, morale: 0.09 }
    },
    "royal-mint": {
        name: "ROYAL MINT",
        years: 2,
        description: "New coin is struck; the treasury swells and purses tighten.",
        modifiers: { tax: 1.32, morale: -0.08 }
    },
    "merchant-charter": {
        name: "MERCHANT CHARTER",
        years: 4,
        description: "Foreign merchants receive safe passage and honest scales.",
        modifiers: { tax: 1.18, food: 0.94, morale: 0.03 }
    },
    "watch-fires": {
        name: "WATCH FIRES",
        years: 2,
        description: "Beacons burn along the roads through the night.",
        modifiers: { morale: 0.12, tax: 0.96 }
    },
    "poor-relief": {
        name: "POOR RELIEF",
        years: 3,
        description: "The crown feeds the destitute through the lean months.",
        modifiers: { tax: 1.05, morale: 0.14 }
    },
    "iron-levy": {
        name: "IRON LEVY",
        years: 2,
        description: "Every forge owes the crown a share of its iron.",
        modifiers: { tax: 1.22, morale: -0.06 }
    },
    "forest-law": {
        name: "FOREST LAW",
        years: 3,
        description: "Woodlands are managed for the common larder.",
        modifiers: { food: 0.9, tax: 0.97 }
    },
    "festival-season": {
        name: "FESTIVAL SEASON",
        years: 2,
        description: "A season of fairs, music and open tables.",
        modifiers: { morale: 0.18, tax: 0.95 }
    },
    "tithe-drive": {
        name: "TITHE DRIVE",
        years: 2,
        description: "The clergy collect the tithe with uncommon zeal.",
        modifiers: { tax: 1.28, morale: -0.07 }
    },
    "open-roads": {
        name: "OPEN ROADS",
        years: 4,
        description: "Tolls fall and every cart may pass unharmed.",
        modifiers: { tax: 1.12, food: 0.97, morale: 0.02 }
    }
});

const MAX_YEARS = 10;
const clampYear = value => Math.max(1, Math.floor(Number(value) || 1));

export function ensureEdicts() {
    const list = Array.isArray(state.edicts) ? state.edicts : (state.edicts = []);
    state.edicts = list.filter(edict =>
        edict && typeof edict === "object" &&
        typeof edict.id === "string" &&
        Number.isFinite(Number(edict.expiresYear)) &&
        Number(edict.expiresYear) > 0
    );
    return state.edicts;
}

export function activateEdict(id, { years } = {}) {
    const definition = EDICT_DEFINITIONS[id];
    if (!definition) return { ok: false, reason: "UNKNOWN EDICT" };
    const list = ensureEdicts();
    if (list.some(edict => edict.id === id)) return { ok: false, reason: "ALREADY IN FORCE" };
    const duration = Math.max(1, Math.min(MAX_YEARS, Math.floor(Number(years) || definition.years)));
    const startedYear = clampYear(state.year);
    const edict = {
        id,
        name: definition.name,
        startedYear,
        expiresYear: startedYear + duration,
        duration
    };
    list.push(edict);
    addLog("EDICT PROCLAIMED — " + definition.name, "#e8c77b", "politics");
    return { ok: true, edict: { ...edict }, name: definition.name };
}

export function updateEdicts() {
    const list = ensureEdicts();
    const year = clampYear(state.year);
    const expired = list.filter(edict => Number(edict.expiresYear) <= year);
    if (!expired.length) return [];
    for (const edict of expired) addLog("EDICT LAPSED — " + edict.name, "#b99a9a", "politics");
    state.edicts = list.filter(edict => Number(edict.expiresYear) > year);
    return expired;
}

export function getActiveEdicts() {
    return ensureEdicts().map(edict => ({ ...edict }));
}

export function getEdictModifiers() {
    const modifiers = { tax: 1, food: 1, morale: 0 };
    for (const edict of ensureEdicts()) {
        const definition = EDICT_DEFINITIONS[edict.id];
        if (!definition) continue;
        modifiers.tax *= definition.modifiers.tax ?? 1;
        modifiers.food *= definition.modifiers.food ?? 1;
        modifiers.morale += definition.modifiers.morale ?? 0;
    }
    return modifiers;
}
