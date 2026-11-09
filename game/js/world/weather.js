// ── Weather System ─────────────────────────────────────────────
//
// Weather follows the continuous season curves. Snow is only possible while
// there is snow cover, so a summer day can never start a snowfall. Spells are
// short (a few days), and a spell that outlives its season is reconciled on
// the next tick instead of lingering for a whole year.

import { state } from '../core/state.js';
import { randInt as seededRandInt } from '../core/random.js';
import { addLog } from '../systems/events.js';
import { seasonalState } from './season.js';

const randInt = (min, max) => seededRandInt(min, max, 'weather');

const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

// Relative weights for one day. Snow is gated by the actual snow-cover curve,
// not by an integer season, so late autumn can see the first snow and a warm
// early spring cannot.
export function weatherWeights(dayOfYear, climate = 'temperate') {
    const { season, snowCover } = seasonalState(dayOfYear, climate);
    const clear = season === 1 ? 0.58 : season === 3 ? 0.26 : 0.40;
    const rain = season === 1 ? 0.42 : season === 3 ? 0.12 : season === 2 ? 0.48 : 0.52;
    // Snow follows the climate's actual cover; arid and mediterranean winters
    // therefore snow far less often than a northern one.
    const snow = snowCover > 0.02 ? 0.60 * snowCover : 0;
    return { clear, rain, snow };
}

export function weatherOptionsForDay(dayOfYear, climate = 'temperate') {
    return Object.entries(weatherWeights(dayOfYear, climate))
        .filter(([, weight]) => weight > 0)
        .map(([kind, weight]) => ({ kind, weight }));
}

// Deterministic pick from a 0..1 roll. Exported so the seasonal table can be
// tested without touching mutable game state.
export function pickWeather(dayOfYear, roll, climate = 'temperate') {
    const options = weatherOptionsForDay(dayOfYear, climate);
    const total = options.reduce((sum, option) => sum + option.weight, 0) || 1;
    let cursor = Math.max(0, Math.min(1, Number(roll) || 0)) * total;
    for (const option of options) {
        cursor -= option.weight;
        if (cursor <= 0) return option.kind;
    }
    return options[options.length - 1]?.kind || 'clear';
}

export function weatherAllowed(kind, dayOfYear, climate = 'temperate') {
    if (kind === 'snow') return seasonalState(dayOfYear, climate).snowCover > 0.02;
    return kind === 'clear' || kind === 'rain';
}

export function weatherDurationDays(dayOfYear, roll, climate = 'temperate') {
    const { season } = seasonalState(dayOfYear, climate);
    const max = season === 3 ? 12 : 8;
    return 3 + Math.floor(Math.max(0, Math.min(1, Number(roll) || 0)) * (max - 3));
}

export function updateWeather() {
    const climate = state.worldOptions?.climate || 'temperate';
    // Old saves stored spells of several hundred days. Clamp them so a summer
    // day cannot keep a snowfall from a previous winter.
    if (!Number.isFinite(state.weatherTimer) || state.weatherTimer > 24) state.weatherTimer = 0;

    if (state.weather === 'snow' && !weatherAllowed('snow', state.dayOfYear, climate)) {
        state.weather = 'rain';
        state.weatherTimer = Math.min(Math.max(1, state.weatherTimer), 3);
        addLog('THE SNOW TURNS TO RAIN', '#7dd3fc');
        return;
    }

    state.weatherTimer--;
    if (state.weatherTimer > 0) return;

    const previousWeather = state.weather;
    state.weather = pickWeather(state.dayOfYear, randInt(0, 999) / 999, climate);
    state.weatherTimer = weatherDurationDays(state.dayOfYear, randInt(0, 999) / 999, climate);

    // Only a real transition belongs in the chronicle. Re-rolling the same
    // weather used to fill the bounded log with duplicate frost and rain rows.
    const seasonName = SEASON_NAMES[seasonalState(state.dayOfYear, climate).season];
    if (state.weather === previousWeather) return;
    if (state.weather === 'rain') addLog('IT BEGINS TO RAIN', '#22d3ee');
    if (state.weather === 'snow') addLog('SNOW FALLS OVER THE LAND', '#e0f2fe');
    if (state.weather === 'clear' && seasonName === 'winter') addLog('THE SKY CLEARS OVER THE FROST', '#dbeafe');
}
