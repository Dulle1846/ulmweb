# Baseline Code Review and Fix Record

**Review date:** 2026-11-04  
**Code baseline:** `ulmweb-branch` at `dae4edd7fcb1204d794f68dc4475ac149beb5cbc`  
**Repair branch:** `foundation/technical-baseline`

## Scope and validation boundary

The full game source under `game/js/` and the game entry page were reviewed statically. The user's Chrome screenshot from the baseline run confirmed the card-placement failure recorded below. The updated code has not yet been run in the user's browser, and no automated test runner or build command was found in the reviewed game directory. Therefore, these changes are **implemented but not runtime-verified**.

## Repairs made

1. **Card placement used a non-existent world grid.** The placement code read `state.world[x][y]`, but the game stores terrain in height/moisture maps. Placement now uses the existing terrain query (`isWaterAt`), rejects world-boundary violations, and checks occupancy.
2. **Building overlap was checked only at entity centre tiles.** Placement now compares complete rectangular building footprints, using the configured building sizes. The same footprint-aware tile query is used by villager walkability.
3. **Fallback card placement ignored zoom.** The centre-of-view world coordinate is now calculated using the current zoom factor.
4. **Simulation speed was applied twice to the tick counter.** The main loop already scales the tick accumulator by game speed; each logical simulation update now advances the tick by exactly one. Calendar progression follows logical ticks, with a consistent 400-day year boundary.
5. **Long frame stalls could trigger excessive catch-up work.** The accumulator input is capped to 100 ms per rendered frame before applying the selected game speed.
6. **The raid-survived statistic incremented when the first raid spawned.** A wave is now counted only after all active enemies are defeated. Scripted and random ambush waves both activate the tracking flag.
7. **Combat could continue selecting entities already killed during the same update.** Dead attackers and defenders are skipped, and zero HP consistently means defeated. Destroying the keep now displays the defeat message.
8. **Technology descriptions had effects that were not applied.** Irrigation now boosts farm yield; Steel Forging adds 25 HP to existing and newly spawned guards, archers and knights; Scholarship adds research income; Feudalism adds its house morale bonus; Alchemy increases quarry gold probability.
9. **A festival could reduce food below zero.** Its food cost is now clamped at zero.
10. **Explicit zero particle velocity was treated as “missing”.** Particle creation now preserves zero horizontal or vertical velocity instead of replacing it with a random value.
11. **The morale bar could remain red after morale recovered.** Its inline color is reset when morale rises above the warning threshold.
12. **The camera smoothing constant was duplicated.** The camera now uses the configured `ZOOM_LERP` value.
13. **The pause keyboard shortcut only recognized Command.** It now recognizes Ctrl on Windows/Linux and Command on macOS.

## Files changed

- `game/js/camera.js`
- `game/js/input.js`
- `game/js/main.js`
- `game/js/rendering/particles.js`
- `game/js/rendering/ui.js`
- `game/js/simulation/buildings.js`
- `game/js/simulation/combat.js`
- `game/js/simulation/simulation.js`
- `game/js/state.js`
- `game/js/systems/cards.js`
- `game/js/systems/events.js`
- `game/js/systems/morale.js`
- `game/js/systems/tech.js`
- `game/js/world/entities.js`

## Findings deliberately not redesigned

These are visible feature/architecture gaps, but changing them safely requires gameplay decisions or a broader technical task, so they are left for the owner's upcoming list:

- Barracks and stables currently advertise training/breeding behaviour that is not implemented.
- Walls are not yet treated as obstacles or combat targets by the raid movement/targeting rules.
- Temple and priest descriptions mention healing, but no healing system is implemented.
- Randomness is not yet centrally seeded, so complete simulation replay is not reproducible.
- There is no save/load schema or persistence flow.
- Authoritative state is still globally mutable, and some simulation/domain modules still import rendering/UI modules.
- The current project has no identified automated test suite or package/build setup for the game.

## Remaining verification

The pre-fix Chrome screenshot showed:

```text
Uncaught TypeError: Cannot read properties of undefined (reading '77')
findNearestBuildableTile (cards.js:64:41)
placeCurrentCard (cards.js:85:11)
```

That exact code path has been changed. Please hard-reload the game from this branch and repeat the F0 checklist, especially valid land placement, water rejection, occupied-footprint rejection, out-of-bounds rejection, and 1x/2x/4x timing. Also check the browser Console for new errors.

The screenshot also showed a DevTools Issues warning that the site's Content Security Policy blocks `eval`. The game still rendered in that session. The cause and impact were not established from the available source, so this warning remains recorded rather than being “fixed” speculatively.
