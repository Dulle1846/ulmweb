// Continuous realm calendar shared by terrain colour, weather and foliage.
//
// A realm year is 400 days and every season lasts 100 days, but the visual
// seasons are deliberately not anchored to the first day of a season. Snow
// accumulates through late autumn, peaks in winter and melts through early
// spring; leaves turn through autumn and drop before midwinter. Using one set
// of curves keeps the ground, the trees and the weather in agreement instead
// of snapping on day 100, 200 and 300.

export const DAYS_PER_YEAR = 400;
export const DAYS_PER_SEASON = 100;

const clamp01 = value => Math.max(0, Math.min(1, value));

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

// The full seasonal profile for a day. All values are 0..1 and continuous:
// no caller has to branch on an integer season index to get a smooth result.
export function seasonalState(dayOfYear) {
    const day = wrapDay(dayOfYear);
    const phase = day / DAYS_PER_SEASON;
    const spring = springAxis(phase);

    // Snow: starts in late autumn, is complete by early winter, stays through
    // deep winter and melts across the first weeks of spring.
    // Both ends of the snow curve use the extended axis, so the cover that has
    // built up by day 399 is still there on day 0 instead of resetting.
    const accumulation = smoothstep(255, 310, spring);
    const melt = 1 - smoothstep(370, 440, spring);
    const snowCover = clamp01(Math.min(accumulation, melt));

    // Leaves: turn through mid autumn, are mostly down by early winter and
    // have faded out completely before spring green-up.
    const foliageTurn = smoothstep(205, 268, day) * (1 - smoothstep(310, 370, day));

    // Fresh growth: starts in late winter, peaks in early spring and fades as
    // the canopy matures into summer.
    const greenUp = smoothstep(370, 425, spring) * (1 - smoothstep(455, 510, spring));

    // Heat: only the summer window drives parched grass and scorched patches.
    const warmth = smoothstep(85, 135, day) * (1 - smoothstep(190, 235, day));

    return {
        day,
        phase,
        season: Math.floor(phase) % 4,
        snowCover,
        foliageTurn,
        greenUp,
        warmth,
    };
}
