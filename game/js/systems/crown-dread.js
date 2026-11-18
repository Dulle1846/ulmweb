// Crown dread: the standing army and the neighbouring courts are one system.
//
// The garrison already tracks every soldier's power, and every realm already
// tracks a fear value. Before this link fear was written by gifts, wars and
// treaties but never read by anything, so a large army changed nothing in the
// world. This module turns the army's measured power into one bounded dread
// reading, and the diplomatic situation into one bounded border levy.
//
// No entity scan happens here. military.js writes the muster's total power once
// per year; this module only reads that saved scalar and the four realm records.
// The levy is cached by a cheap signature so the HUD can read it every frame.
import { state } from "../core/state.js";

export const CROWN_DREAD_VERSION = 1;
export const DREAD_POWER_BASE = 60;
export const DREAD_LEVY_LIMIT = 0.45;

export const DREAD_BANDS = Object.freeze([
    Object.freeze({ id: "quiet", label: "QUIET", min: 0 }),
    Object.freeze({ id: "watchful", label: "WATCHFUL", min: 25 }),
    Object.freeze({ id: "respected", label: "RESPECTED", min: 45 }),
    Object.freeze({ id: "dreaded", label: "DREADED", min: 65 })
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const round = (value, places = 3) => {
    const scale = 10 ** places;
    return Math.round((Number(value) || 0) * scale) / scale;
};

let pressureCache = { signature: null, value: null };

function bandFor(dread) {
    let band = DREAD_BANDS[0];
    for (const entry of DREAD_BANDS) if (dread >= entry.min) band = entry;
    return band;
}

// Reads the muster's saved power. A realm that has never mustered (legacy save,
// fresh realm) reads zero until military.js writes the first reading.
export function getCrownDread() {
    const military = state.military || {};
    const power = Math.max(0, Math.min(1_000_000, Number(military.strengthPower) || 0));
    const soldiers = Math.max(0, Math.min(10_000, Math.floor(Number(military.strengthSoldiers) || 0)));
    const dread = Math.round(clamp(100 * power / (power + DREAD_POWER_BASE), 0, 100));
    const band = bandFor(dread);
    return {
        version: CROWN_DREAD_VERSION,
        power: round(power, 1),
        soldiers,
        dread,
        band: band.label,
        bandId: band.id,
        year: Math.max(0, Math.floor(Number(military.strengthYear) || 0))
    };
}

export function getFrontierPressure() {
    const realms = Array.isArray(state.diplomacy?.realms) ? state.diplomacy.realms : [];
    const year = Math.max(0, Math.floor(Number(state.year) || 0));
    const dread = getCrownDread();
    // Without neighbours there is no border to price. This keeps early realms,
    // legacy saves and unit fixtures on their existing payroll.
    if (!realms.length) return neutralPressure(dread, year);

    const wars = realms.filter(realm => realm?.treaty === "war").length;
    const hostile = realms.filter(realm => realm && realm.treaty !== "war" && Number(realm.relation) < 30).length;
    const incidents = realms.filter(realm => realm && Number(realm.lastIncidentYear) === year).length;
    // A thin garrison invites pressure; a feared one deters it.
    const weakness = Math.max(0, 50 - dread.dread) / 50;
    const signature = [year, wars, hostile, incidents, dread.dread].join("|");
    if (pressureCache.signature === signature && pressureCache.value) return pressureCache.value;

    const raw = Math.min(0.30, wars * 0.10)
        + Math.min(0.16, hostile * 0.04)
        + weakness * 0.08
        + Math.min(0.09, incidents * 0.03);
    const factor = round(1 + clamp(raw, 0, DREAD_LEVY_LIMIT), 3);
    const value = {
        version: CROWN_DREAD_VERSION,
        year,
        factor,
        percent: Math.round((factor - 1) * 100),
        wars,
        hostile,
        incidents,
        weakness: round(weakness, 3),
        dread: dread.dread,
        band: factor >= 1.30 ? "PRESSED" : factor >= 1.15 ? "STRAINED" : factor > 1.001 ? "WATCH" : "CALM"
    };
    pressureCache = { signature, value };
    return value;
}

function neutralPressure(dread, year) {
    return {
        version: CROWN_DREAD_VERSION,
        year,
        factor: 1,
        percent: 0,
        wars: 0,
        hostile: 0,
        incidents: 0,
        weakness: round(Math.max(0, 50 - dread.dread) / 50, 3),
        dread: dread.dread,
        band: "CALM"
    };
}

export function invalidateCrownDread() {
    pressureCache = { signature: null, value: null };
}

// Military normalization uses this so a legacy save without a muster reading
// loads as "not yet measured" instead of inventing a standing army.
export function normalizeCrownDreadReading(source) {
    const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    return {
        strengthPower: clamp(value.strengthPower, 0, 1_000_000),
        strengthSoldiers: Math.floor(clamp(value.strengthSoldiers, 0, 10_000)),
        strengthYear: Math.floor(clamp(value.strengthYear, 0, 1_000_000))
    };
}
