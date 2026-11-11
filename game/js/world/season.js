// Continuous realm calendar shared by terrain colour, weather and foliage.
//
// A realm year is 400 days and every season lasts 100 days, but the visual
// seasons are deliberately not anchored to the first day of a season. Snow
// accumulates through late autumn, peaks in winter and melts through early
// spring; leaves turn through autumn and drop before midwinter. Using one set
// of curves keeps the ground, the trees and the weather in agreement instead
// of snapping on day 100, 200 and 300.
//
// Each climate shifts the same curves instead of forking the code: the north
// keeps snow longer, the mediterranean and arid climates lose it earlier, and
// arid autumns turn less of the canopy. The temperate profile is the baseline,
// so a temperate realm keeps the original timing exactly.

export const DAYS_PER_YEAR = 400;
export const DAYS_PER_SEASON = 100;

export const CLIMATE_SEASONS = Object.freeze({
    temperate: Object.freeze({
        snowStart: 255, snowFull: 310, meltStart: 370, meltEnd: 440,
        snowScale: 1, foliageShift: 0, foliageScale: 1, greenShift: 0, warmthShift: 0,
    }),
    northern: Object.freeze({
        snowStart: 238, snowFull: 300, meltStart: 395, meltEnd: 470,
        snowScale: 1.15, foliageShift: -8, foliageScale: 1, greenShift: 8, warmthShift: -10,
    }),
    mediterranean: Object.freeze({
        snowStart: 272, snowFull: 325, meltStart: 350, meltEnd: 410,
        snowScale: 0.55, foliageShift: 5, foliageScale: 0.9, greenShift: -6, warmthShift: 8,
    }),
    arid: Object.freeze({
        snowStart: 285, snowFull: 335, meltStart: 342, meltEnd: 400,
        snowScale: 0.12, foliageShift: 10, foliageScale: 0.55, greenShift: -8, warmthShift: 14,
    }),
    enchanted: Object.freeze({
        snowStart: 248, snowFull: 305, meltStart: 365, meltEnd: 438,
        snowScale: 1.05, foliageShift: -3, foliageScale: 1, greenShift: 3, warmthShift: 0,
    }),
    tropical: Object.freeze({
        snowStart: 400, snowFull: 401, meltStart: 401, meltEnd: 402,
        snowScale: 0, foliageShift: 0, foliageScale: 0, greenShift: -60, warmthShift: -20,
    }),
});

const clamp01 = value => Math.max(0, Math.min(1, value));

export function climateSeasonProfile(climate) {
    return CLIMATE_SEASONS[climate] || CLIMATE_SEASONS.temperate;
}

export function wrapDay(dayOfYear) {
    const day = Number(dayOfYear);
    if (!Number.isFinite(day)) return 0;
    return ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
}

export function smoothstep(edge0, edge1, value) {
    const span = edge1 - edge0;
    if (Math.abs(span) < 1e-9) return value < edge0 ? 0 : 1;
    const t = clamp01((value - edge0) / span);
    return t * t * (3 - 2 * t);
}

export function seasonPhase(dayOfYear) {
    return wrapDay(dayOfYear) / DAYS_PER_SEASON;
}

export function seasonIndexAt(dayOfYear) {
    return Math.floor(wrapDay(dayOfYear) / DAYS_PER_SEASON) % 4;
}

// A continuous axis that runs autumn -> winter -> spring without a seam at
// New Year. Spring days map to 400..500, so a melt window such as 370..440
// crosses the year boundary naturally.
function springAxis(phase) {
    return phase < 2 ? phase * DAYS_PER_SEASON + DAYS_PER_YEAR : phase * DAYS_PER_SEASON;
}

// The full seasonal profile for a day and climate. All values are 0..1 and
// continuous: no caller has to branch on an integer season index to get a
// smooth result.
export function seasonalState(dayOfYear, climate = 'temperate') {
    const profile = climateSeasonProfile(climate);
    const day = wrapDay(dayOfYear);
    const phase = day / DAYS_PER_SEASON;
    const spring = springAxis(phase);

    // Snow: starts in late autumn, is complete by early winter, stays through
    // deep winter and melts across the first weeks of spring. Both ends use the
    // extended axis, so the cover built up by day 399 is still there on day 0.
    const accumulation = smoothstep(profile.snowStart, profile.snowFull, spring);
    const melt = 1 - smoothstep(profile.meltStart, profile.meltEnd, spring);
    const snowCover = clamp01(Math.min(accumulation, melt) * profile.snowScale);

    // Leaves: turn through mid autumn, are mostly down by early winter and
    // have faded out completely before spring green-up. Arid autumns turn less
    // of the canopy; northern autumns start earlier.
    const turnStart = 205 + profile.foliageShift;
    const turnEnd = 268 + profile.foliageShift;
    const turnFadeStart = 310 + profile.foliageShift;
    const turnFadeEnd = 370 + profile.foliageShift;
    const foliageTurn = smoothstep(turnStart, turnEnd, day)
        * (1 - smoothstep(turnFadeStart, turnFadeEnd, day))
        * profile.foliageScale;

    // Fresh growth: starts in late winter, peaks in early spring and fades as
    // the canopy matures into summer. Northern springs arrive later.
    const greenStart = 370 + profile.greenShift;
    const greenPeak = 425 + profile.greenShift;
    const greenFadeStart = 455 + profile.greenShift;
    const greenFadeEnd = 510 + profile.greenShift;
    const greenUp = smoothstep(greenStart, greenPeak, spring) * (1 - smoothstep(greenFadeStart, greenFadeEnd, spring));

    // Heat: only the summer window drives parched grass and scorched patches.
    // Arid summers start earlier and last longer.
    const warmthStart = 85 + profile.warmthShift;
    const warmthPeak = 135 + profile.warmthShift;
    const warmthFadeStart = 190 + profile.warmthShift;
    const warmthFadeEnd = 235 + profile.warmthShift;
    const warmth = smoothstep(warmthStart, warmthPeak, day) * (1 - smoothstep(warmthFadeStart, warmthFadeEnd, day));

    return {
        day,
        phase,
        season: Math.floor(phase) % 4,
        climate: CLIMATE_SEASONS[climate] ? climate : 'temperate',
        snowCover,
        foliageTurn,
        greenUp,
        warmth,
        // Tropical broadleaves stay leafed and flowering all year. Keeping this
        // explicit prevents the temperate leaf-fall curve from thinning a
        // rainforest in the middle of the wet season.
        evergreenCanopy: climate === 'tropical',
    };
}
