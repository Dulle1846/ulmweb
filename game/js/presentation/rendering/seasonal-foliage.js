// Per-tree seasonal foliage.
//
// The old decorations switched on `season === 2` and `season === 3`, so every
// broadleaf tree turned orange on the same day and every crown turned grey on
// the first day of winter. This module gives each tree its own timing offset
// and each species its own behaviour:
//
//   broadleaf / birch  deciduous, birch turns and drops about a week earlier
//   oak / beech        marcescent, hold a share of brown leaves into winter
//   conifer / palm     evergreen, only gain snow load
//   shrub              mostly deciduous, a few stay green
//
// Everything is a pure function so the timing can be tested in Node.

import { smoothstep, seasonalState, wrapDay } from '../../world/season.js';

export const TREE_SPECIES = Object.freeze({
    broadleaf: Object.freeze({ turnOffset: 0, dropOffset: 0, leafOutOffset: 0, marcescent: 0, evergreen: false }),
    birch: Object.freeze({ turnOffset: -10, dropOffset: -12, leafOutOffset: -8, marcescent: 0, evergreen: false }),
    oak: Object.freeze({ turnOffset: 8, dropOffset: 18, leafOutOffset: 6, marcescent: 0.55, evergreen: false }),
    beech: Object.freeze({ turnOffset: 4, dropOffset: 10, leafOutOffset: 4, marcescent: 0.42, evergreen: false }),
    conifer: Object.freeze({ turnOffset: 0, dropOffset: 0, leafOutOffset: 0, marcescent: 0, evergreen: true }),
    palm: Object.freeze({ turnOffset: 0, dropOffset: 0, leafOutOffset: 0, marcescent: 0, evergreen: true }),
    shrub: Object.freeze({ turnOffset: 2, dropOffset: 6, leafOutOffset: 2, marcescent: 0.12, evergreen: false }),
});

const clamp01 = value => Math.max(0, Math.min(1, value));

export function treeTiming(seed, species = 'broadleaf') {
    const definition = TREE_SPECIES[species] || TREE_SPECIES.broadleaf;
    // +/- 9 days of natural variation: neighbouring trees never turn on the
    // same afternoon, and a grove changes over roughly a fortnight.
    const jitter = (clamp01(Number(seed) || 0) - 0.5) * 18;
    return {
        def: definition,
        turnStart: 215 + definition.turnOffset + jitter,
        turnEnd: 282 + definition.turnOffset + jitter,
        dropStart: 272 + definition.dropOffset + jitter,
        dropEnd: 330 + definition.dropOffset + jitter,
        leafStart: 395 + definition.leafOutOffset + jitter,
        leafEnd: 445 + definition.leafOutOffset + jitter,
    };
}

// A single tree's foliage for one day.
export function foliageState(dayOfYear, { seed = 0.5, species = 'broadleaf' } = {}) {
    const climate = seasonalState(dayOfYear);
    const timing = treeTiming(seed, species);
    const def = timing.def;
    const day = wrapDay(dayOfYear);
    // Leaf-out crosses New Year, so spring days are measured on the extended
    // axis (400 = first day of spring).
    const springDay = climate.phase < 2 ? climate.phase * 100 + 400 : climate.phase * 100;

    let leaf = 1;
    let turn = 0;
    let hold = 0;
    let fresh = 0;

    if (!def.evergreen) {
        const fallen = 1 - smoothstep(timing.dropStart, timing.dropEnd, day);
        const springLeaf = smoothstep(timing.leafStart, timing.leafEnd, springDay);
        hold = def.marcescent * (1 - smoothstep(timing.leafStart, timing.leafEnd, springDay));
        // The first 60 days belong to this year's leaf-out. Using `fallen`
        // there would count the previous autumn's canopy as still present and
        // make every tree fully leafy on the first day of spring.
        leaf = clamp01(day < 60 ? Math.max(springLeaf, hold) : Math.max(fallen, hold));
        turn = smoothstep(timing.turnStart, timing.turnEnd, day)
            * (1 - smoothstep(330, 390, day));
        fresh = climate.greenUp * (1 - turn) * leaf;
    } else {
        fresh = climate.greenUp * 0.35;
    }

    const snow = climate.snowCover * (def.evergreen ? 0.85 : 0.55);
    return {
        day,
        leaf,
        turn,
        fresh,
        snow,
        snowCover: climate.snowCover,
        bare: leaf < 0.22,
        holding: hold > 0.05,
        evergreen: Boolean(def.evergreen),
        species,
    };
}

// One shared bloom factor for meadow flowers: they fade with the leaves and
// disappear under snow instead of vanishing on day 300.
export function flowerBloom(dayOfYear) {
    const climate = seasonalState(dayOfYear);
    return clamp01((1 - climate.snowCover) * (1 - climate.foliageTurn) * (0.35 + 0.65 * (climate.greenUp + climate.warmth)));
}
