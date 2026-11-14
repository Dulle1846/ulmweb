// Per-tree seasonal foliage.
//
// The old decorations switched on `season === 2` and `season === 3`, so every
// broadleaf tree turned orange on the same day and every crown turned grey on
// the first day of winter. This module gives each tree its own timing offset,
// each species its own behaviour and each climate its own shift:
//
//   broadleaf / birch  deciduous, birch turns and drops about two weeks earlier
//   oak / beech        marcescent, hold a share of brown leaves into winter
//   conifer / palm     evergreen, only gain snow load
//   shrub              mostly deciduous, a few stay green
//
// Northern realms drop earlier, leaf out later and keep more snow; arid realms
// lose less canopy colour, hold fewer leaves and melt snow quickly. The
// temperate profile is the baseline, so a temperate realm is unchanged.

import { CLIMATE_SEASONS, smoothstep, seasonalState, wrapDay } from '../../world/season.js';

export const TREE_SPECIES = Object.freeze({
    broadleaf: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 67, dropSpan: 58, marcescent: 0,
        evergreen: false, snowRetention: 1, snowMeltShift: 0,
    }),
    birch: Object.freeze({
        turnOffset: -12, dropOffset: -14, leafOutOffset: -9, turnSpan: 54, dropSpan: 44, marcescent: 0,
        evergreen: false, snowRetention: 0.8, snowMeltShift: -5,
    }),
    oak: Object.freeze({
        turnOffset: 10, dropOffset: 20, leafOutOffset: 7, turnSpan: 78, dropSpan: 70, marcescent: 0.55,
        evergreen: false, snowRetention: 1.05, snowMeltShift: 4,
    }),
    beech: Object.freeze({
        turnOffset: 6, dropOffset: 12, leafOutOffset: 5, turnSpan: 64, dropSpan: 56, marcescent: 0.42,
        evergreen: false, snowRetention: 1, snowMeltShift: 3,
    }),
    maple: Object.freeze({
        turnOffset: -6, dropOffset: -2, leafOutOffset: 2, turnSpan: 62, dropSpan: 50, marcescent: 0.08,
        evergreen: false, snowRetention: 0.95, snowMeltShift: 0,
    }),
    chestnut: Object.freeze({
        turnOffset: 2, dropOffset: 4, leafOutOffset: 1, turnSpan: 58, dropSpan: 48, marcescent: 0.04,
        evergreen: false, snowRetention: 0.9, snowMeltShift: -1,
    }),
    linden: Object.freeze({
        turnOffset: 8, dropOffset: 10, leafOutOffset: 3, turnSpan: 58, dropSpan: 48, marcescent: 0.12,
        evergreen: false, snowRetention: 0.95, snowMeltShift: 2,
    }),
    elm: Object.freeze({
        turnOffset: -8, dropOffset: -5, leafOutOffset: -3, turnSpan: 50, dropSpan: 42, marcescent: 0.06,
        evergreen: false, snowRetention: 0.9, snowMeltShift: -3,
    }),
    alder: Object.freeze({
        turnOffset: -4, dropOffset: -2, leafOutOffset: -5, turnSpan: 54, dropSpan: 46, marcescent: 0.12,
        evergreen: false, snowRetention: 0.85, snowMeltShift: -2,
    }),
    ash: Object.freeze({
        turnOffset: 4, dropOffset: 6, leafOutOffset: 4, turnSpan: 56, dropSpan: 48, marcescent: 0.05,
        evergreen: false, snowRetention: 0.92, snowMeltShift: 0,
    }),
    hornbeam: Object.freeze({
        turnOffset: 8, dropOffset: 14, leafOutOffset: 4, turnSpan: 56, dropSpan: 46, marcescent: 0.3,
        evergreen: false, snowRetention: 1, snowMeltShift: 2,
    }),
    rowan: Object.freeze({
        turnOffset: -9, dropOffset: -6, leafOutOffset: -2, turnSpan: 50, dropSpan: 42, marcescent: 0.03,
        evergreen: false, snowRetention: 0.84, snowMeltShift: -4,
    }),
    hazel: Object.freeze({
        turnOffset: 2, dropOffset: 8, leafOutOffset: -6, turnSpan: 52, dropSpan: 44, marcescent: 0.08,
        evergreen: false, snowRetention: 0.88, snowMeltShift: -3,
    }),
    willow: Object.freeze({
        turnOffset: -11, dropOffset: -8, leafOutOffset: -7, turnSpan: 52, dropSpan: 42, marcescent: 0.02,
        evergreen: false, snowRetention: 0.78, snowMeltShift: -6,
    }),
    conifer: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 1.18, snowMeltShift: 8,
    }),
    spruce: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 1.28, snowMeltShift: 9,
    }),
    fir: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 1.32, snowMeltShift: 10,
    }),
    pine: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 1.04, snowMeltShift: 5,
    }),
    larch: Object.freeze({
        turnOffset: -5, dropOffset: 8, leafOutOffset: 5, turnSpan: 50, dropSpan: 42, marcescent: 0.02,
        evergreen: false, snowRetention: 0.92, snowMeltShift: -3,
    }),
    juniper: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 0.8, snowMeltShift: 3,
    }),
    yew: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 1.1, snowMeltShift: 6,
    }),
    'dwarf-pine': Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 0.72, snowMeltShift: 4,
    }),
    palm: Object.freeze({
        turnOffset: 0, dropOffset: 0, leafOutOffset: 0, turnSpan: 0, dropSpan: 0, marcescent: 0,
        evergreen: true, snowRetention: 0.18, snowMeltShift: -8,
    }),
    shrub: Object.freeze({
        turnOffset: 2, dropOffset: 6, leafOutOffset: 2, turnSpan: 56, dropSpan: 46, marcescent: 0.12,
        evergreen: false, snowRetention: 0.9, snowMeltShift: -2,
    }),
});

// Timing shifts per climate. Positive `dropShift` means a later drop; positive
// `leafOutShift` means a later leaf-out. `spanScale` stretches or compresses the
// species' own turn/drop duration, so a northern autumn falls slowly while an
// arid one sheds quickly. `snowMeltShift` on a species is the number of days its
// snow load lags the ground during the spring melt.
export const CLIMATE_FOLIAGE = Object.freeze({
    temperate: Object.freeze({ turnShift: 0, dropShift: 0, leafOutShift: 0, spanScale: 1, marcescentScale: 1, snowLoad: 1, turnScale: 1 }),
    northern: Object.freeze({ turnShift: -7, dropShift: -9, leafOutShift: 7, spanScale: 1.12, marcescentScale: 0.85, snowLoad: 1.15, turnScale: 1 }),
    tundra: Object.freeze({ turnShift: -13, dropShift: -15, leafOutShift: 13, spanScale: 0.82, marcescentScale: 0.4, snowLoad: 1.25, turnScale: 0.9 }),
    mediterranean: Object.freeze({ turnShift: 5, dropShift: 4, leafOutShift: -6, spanScale: 0.9, marcescentScale: 0.6, snowLoad: 0.7, turnScale: 0.9 }),
    arid: Object.freeze({ turnShift: 9, dropShift: 6, leafOutShift: -8, spanScale: 0.78, marcescentScale: 0.25, snowLoad: 0.35, turnScale: 0.55 }),
    enchanted: Object.freeze({ turnShift: -3, dropShift: -4, leafOutShift: 3, spanScale: 1.04, marcescentScale: 1, snowLoad: 1.08, turnScale: 1 }),
    tropical: Object.freeze({ turnShift: 0, dropShift: 0, leafOutShift: 0, spanScale: 1, marcescentScale: 0, snowLoad: 0, turnScale: 0 }),
});

const clamp01 = value => Math.max(0, Math.min(1, value));

export function climateFoliageProfile(climate) {
    return CLIMATE_FOLIAGE[climate] || CLIMATE_FOLIAGE.temperate;
}

export function treeTiming(seed, species = 'broadleaf', climate = 'temperate') {
    const definition = TREE_SPECIES[species] || TREE_SPECIES.broadleaf;
    const profile = climateFoliageProfile(climate);
    // +/- 9 days of natural variation: neighbouring trees never turn on the
    // same afternoon, and a grove changes over roughly a fortnight.
    const jitter = (clamp01(Number(seed) || 0) - 0.5) * 18;
    const turnStart = 215 + definition.turnOffset + jitter + profile.turnShift;
    const dropStart = 272 + definition.dropOffset + jitter + profile.dropShift;
    return {
        def: definition,
        turnStart,
        turnEnd: turnStart + definition.turnSpan * profile.spanScale,
        dropStart,
        dropEnd: dropStart + definition.dropSpan * profile.spanScale,
        leafStart: 395 + definition.leafOutOffset + jitter + profile.leafOutShift,
        leafEnd: 445 + definition.leafOutOffset + jitter + profile.leafOutShift,
    };
}

// A single tree's foliage for one day.
export function foliageState(dayOfYear, { seed = 0.5, species = 'broadleaf', climate = 'temperate' } = {}) {
    const climateKey = CLIMATE_SEASONS[climate] ? climate : 'temperate';
    const climateState = seasonalState(dayOfYear, climateKey);
    const profile = climateFoliageProfile(climateKey);
    const timing = treeTiming(seed, species, climateKey);
    // Tropical crowns are evergreen. Without this early return the shared
    // temperate leaf-fall window would thin the canopy and paint autumn colours
    // in a rainforest. Deciduous behaviour remains available in other climates.
    if (climateKey === 'tropical') {
        return {
            day: wrapDay(dayOfYear), leaf: 1, turn: 0, fresh: 0.08, snow: 0,
            snowCover: 0, bare: false, holding: false, evergreen: true,
            species, climate: climateKey,
        };
    }
    const def = timing.def;
    const day = wrapDay(dayOfYear);
    // Leaf-out crosses New Year, so spring days are measured on the extended
    // axis (400 = first day of spring).
    const springDay = climateState.phase < 2 ? climateState.phase * 100 + 400 : climateState.phase * 100;

    let leaf = 1;
    let turn = 0;
    let hold = 0;
    let fresh = 0;

    if (!def.evergreen) {
        const fallen = 1 - smoothstep(timing.dropStart, timing.dropEnd, day);
        const springLeaf = smoothstep(timing.leafStart, timing.leafEnd, springDay);
        hold = def.marcescent * profile.marcescentScale
            * (1 - smoothstep(timing.leafStart, timing.leafEnd, springDay));
        // The first 60 days belong to this year's leaf-out. Using `fallen`
        // there would count the previous autumn's canopy as still present and
        // make every tree fully leafy on the first day of spring.
        leaf = clamp01(day < 60 ? Math.max(springLeaf, hold) : Math.max(fallen, hold));
        turn = smoothstep(timing.turnStart, timing.turnEnd, day)
            * (1 - smoothstep(330, 390, day))
            * profile.turnScale;
        fresh = climateState.greenUp * (1 - turn) * leaf;
    } else {
        fresh = climateState.greenUp * 0.35;
    }

    // Snow load lags the ground during the spring melt. Conifers hold it about
    // a week longer; birches shed it early. Outside the melt window the current
    // cover is used, so accumulation is not shifted.
    const snowState = climateState.phase < 0.6
        ? seasonalState(day - def.snowMeltShift, climateKey)
        : climateState;
    const snow = clamp01(snowState.snowCover
        * (def.evergreen ? 0.85 : 0.55)
        * def.snowRetention
        * profile.snowLoad);

    return {
        day,
        leaf,
        turn,
        fresh,
        snow,
        snowCover: climateState.snowCover,
        bare: leaf < 0.22,
        holding: hold > 0.05,
        evergreen: Boolean(def.evergreen),
        species,
        climate: climateKey,
    };
}

// One shared bloom factor for meadow flowers: they fade with the leaves and
// disappear under snow instead of vanishing on day 300.
export function flowerBloom(dayOfYear, climate = 'temperate') {
    const state = seasonalState(dayOfYear, climate);
    if (climate === 'tropical') return 0.88;
    return clamp01((1 - state.snowCover) * (1 - state.foliageTurn) * (0.35 + 0.65 * (state.greenUp + state.warmth)));
}
