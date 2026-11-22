// 1.2.20.91 — climate drift is not only a hazard weight.
//
// The hazard chronicle already records a slow drift after real drought and
// volcanic years. This module exposes that one saved number to the world
// queries, weather table and hazard profile. A zero drift returns the exact
// shipped baseline; no second climate simulation is introduced.
import { state } from "../core/state.js";

export const CLIMATE_DRIFT_LIMIT = 20;
export const CLIMATE_TEMPERATURE_OFFSET = 0.045;
export const CLIMATE_MOISTURE_OFFSET = 0.06;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

let cachedSource = null;
let cachedRaw = NaN;
let cachedValue = 0;

/** Bounded saved drift, -20 (cold/wet) .. +20 (hot/dry). */
export function getClimateDrift() {
    // The world queries call this per rendered tile. The chronicle object is
    // often mutated in place, so both identity and the raw number are checked;
    // a real annual drift change still invalidates immediately.
    const source = state.environmentalHazards?.chronic || null;
    const raw = Number(source?.climateDrift) || 0;
    if (source === cachedSource && raw === cachedRaw) return cachedValue;
    cachedSource = source;
    cachedRaw = raw;
    cachedValue = clamp(Math.trunc(raw), -CLIMATE_DRIFT_LIMIT, CLIMATE_DRIFT_LIMIT);
    return cachedValue;
}

/** Applied to the per-tile temperature query; positive drift is warmer. */
export function getClimateTemperatureOffset() {
    return getClimateDrift() / CLIMATE_DRIFT_LIMIT * CLIMATE_TEMPERATURE_OFFSET;
}

/** Applied to the per-tile moisture query; positive drift is drier. */
export function getClimateMoistureOffset() {
    return -getClimateDrift() / CLIMATE_DRIFT_LIMIT * CLIMATE_MOISTURE_OFFSET;
}

/** -1 (cold/wet) .. +1 (hot/dry), used by the weather weight table. */
export function getClimateDriftWeatherBias() {
    return getClimateDrift() / CLIMATE_DRIFT_LIMIT;
}
