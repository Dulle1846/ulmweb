# Kings & Cards — Technical foundation (current implementation)

**Current reviewed commit:** `f7a85b10d7e3bef81eb3fefcf4f4931af30bf14a`  
**Development branch:** `ulmweb-branch`

This document separates verified current behaviour from future architectural goals.

## 1. Runtime and entry points

- Browser application using native JavaScript ES modules.
- Entry point: `game/index.html`; composition root: `game/js/app/main.js`.
- Rendering: Canvas 2D, plus semantic HTML controls and CSS.
- Current art direction: `game/css/medieval.css`, with reusable vector symbols in `game/assets/realm-sprites.svg`.
- Main loop: `game/js/app/game-loop.js`, driven by `requestAnimationFrame`.
- No bundler is required. The test command is `cd game && npm test`, using Node's built-in test runner.

## 2. Current module responsibilities

| Module | Responsibility |
|---|---|
| `app/main.js` | Browser composition, profile selection, realm startup, save DTO serialization/deserialization |
| `app/game-loop.js` | Fixed-step clock, movement cadence, presentation updates, render scheduling and runtime fail-stop |
| `core/*` | Shared state/config/types/utilities, persistence helpers, simulation clock, presentation-effect contract, soundtrack |
| `world/world.js` | Seeded Perlin terrain, world-forge settings, height/moisture maps, terrain prerender, exploration and biome queries |
| `world/entities.js` | Entity spawn/cap checks, entity queries and building footprint overlap |
| `systems/cards.js` | Card deck/hand, timed draws, selection, placement preview, play/discard consumption |
| `systems/card-catalog.js` | 400 category records, archetypes, card variant dimensions and on-demand variant generation |
| `systems/events.js` | Issue families, issue scheduling, choice resolution, bounded event history and hidden realm pressures |
| `systems/resources.js`, `morale.js`, `market.js` | Resource accounting, morale, production/economy support and regional trade |
| `simulation/simulation.js` | One authoritative logical simulation tick and coordination of systems |
| `simulation/villagers.js` | Workplace assignment, daily routine phases, movement, threat avoidance and building collision index |
| `simulation/combat.js` | Enemy/defender target selection through spatial buckets |
| `simulation/buildings.js` | Scheduled production and civic building effects |
| `presentation/*` | Camera, pointer/keyboard input, HTML UI, canvas rendering, minimap, particles and effect adapters |

The application is a modular monolith, not yet an isolated ECS or worker-based simulation. `state.js` remains a globally mutable state object. This is an acknowledged limitation and a future refactoring target.

## 3. World representation and generation

- Logical world dimensions: 160×160.
- `CELL = 48` pixels at zoom 1.
- Terrain stores height and moisture in typed arrays at three samples per logical world unit (480×480 samples per map).
- A prerendered terrain canvas is a disposable visual cache.
- Exploration is a column-major boolean map.
- Dynamic objects are `Entity` instances in `state.entities`.
- The numeric seed initializes the Perlin permutation. Four world-forge values (landmass, ruggedness, forest density, water level) alter generated height/moisture fields.

The terrain module currently uses browser canvas APIs for prerendering; a future worker/offscreen-canvas boundary would need an explicit browser compatibility contract.

## 4. Card and issue data models

### Cards

The deck contains one archetype per category. Cards are drawn by randomly selecting from the remaining category deck and applying scale, rarity and context dimensions. Variants are created on demand, not eagerly preallocated. The theoretical variant space is 400 categories × 10 scales × 10 rarities × 10 contexts = 400,000.

The hand is capped at five. A new realm starts with an empty hand; the first draw is scheduled 28–72 ticks later. Later draws and replacement draws use randomized tick intervals. Playing or discarding removes the current card and schedules its replacement. The card hand, remaining deck, selection and next-draw tick are persisted.

### Realm issues

There are 24 event families, with a current combinatorial narrative space of 25,920. Event issue scheduling uses simulation ticks. Each issue currently exposes two choices whose effects can change resources, morale, villagers and hidden realm values. The values tension, prosperity and mystery influence later family weighting. The event log is bounded to 100 entries and hidden decision memories to 24 entries.

The event system is currently data-driven procedural narrative. It is not yet a large library of individually authored branching quest chains.

## 5. Save/load and identity

Profiles are browser-local display-name profiles. Saves are versioned JSON envelopes stored in localStorage with profile-specific keys.

The snapshot serializes authoritative state: seed/world options, clock, entities, workplace references by entity-array index, resources, hand/deck/draw schedule, active issue/schedule/hidden pressures, log, market, camera and exploration. It does not store Canvas contexts, DOM nodes or event listeners.

There is no server authentication, admin authorization, cloud database or cross-device sync. The current product stage explicitly accepts browser-local saves. Any future online identity/cloud save feature must introduce real server-side authentication and authorization rather than treating a client-side profile name as identity.

## 6. Runtime timing

- Authoritative simulation tick interval: 333 ms at 1×.
- Each logical simulation update increments `state.tick` exactly once.
- `core/simulation-clock.js` converts elapsed time and game speed into fixed simulation steps.
- Friendly unit movement has a separate 30 Hz accumulator, with at most three movement substeps per rendered frame.
- Minimap refresh is throttled to 400 ms; HTML UI refresh is throttled to 160 ms.
- Frame delta and simulation catch-up are bounded to avoid unbounded work after stalls.
- If an uncaught frame error occurs, the loop pauses the realm, displays a fault message and stops scheduling more frames. Reload is currently the recovery path.

## 7. Performance safeguards

These optimizations are implemented and covered by targeted tests where possible:

1. **Visible entity cache:** the renderer filters/sorts the visible entity set on a short-lived cache instead of every frame.
2. **Terrain decoration LOD:** decoration sampling density changes with zoom.
3. **Fog cache:** a 160×160 offscreen fog image is rebuilt only after exploration changes, then drawn with one image operation.
4. **Building occupancy index:** a tile-key set is rebuilt from building footprints; movement collision is a constant-time lookup rather than scanning the entity list for every unit step.
5. **Workplace grouping:** villager workplace lists are assembled in one entity pass.
6. **Combat spatial buckets:** local target searches inspect nearby buckets rather than all entity pairs.
7. **Population/effect caps:** 900 total entities, 420 mobile entities, 350 particles and 100 floaters.
8. **Cadence control:** movement 30 Hz, minimap 2.5 Hz, UI 6.25 Hz.

These guards address identified structural costs and runaway growth. They do not yet constitute a reproducible FPS benchmark across hardware. Profiling at high population, on integrated graphics and on low-end mobile devices remains a required follow-up.

## 8. Quality and verified checks

Latest GitHub Actions run for the reviewed commit:

- 53 automated tests passed; zero failed.
- JavaScript syntax and relative imports passed for 34 source files.
- 77 referenced UI IDs, duplicate IDs and local HTML assets passed validation.

Live browser checks verified the parchment start screen, four world-forge sliders, empty starting hand, timed first card, SVG symbol rendering, changed forge settings surviving save/reload, card discard/replacement, and issue popup/choice resolution.

The browser automation could not perform a true continuous mouse drag gesture. Pointer-based handlers are implemented; manual mouse validation remains outstanding.

## 9. Known limitations and next engineering steps

- Many of the 400 card categories currently use generic group archetypes. Only the initial prototype set is individually curated. Add specific card effects and balance in a data-driven manner.
- The 24 issue families generate many text variants, but bespoke multi-stage story chains, named characters and callback events remain future content.
- Character AI uses simple job assignment, routine phases and movement. It does not yet model family, friendship/rivalry, personality traits, political allegiance or persistent autobiographical memory.
- Pathfinding is local collision avoidance, not robust route planning.
- The economy is a first barter model, not a full chain of labour, wages, transport, taxation and regional markets.
- Whole-simulation determinism is incomplete: terrain uses the world seed, while many gameplay systems still call `Math.random()`. Seeded random streams and serializable RNG state are future work.
- The global mutable state should gradually be split behind clear domain contracts.
- Browser-local profiles are acceptable now; cloud saves/admin identity require a real backend and explicit security design.

## 10. Technical completion standard

Every substantive change should:
- have a focused module responsibility and explicit state contract;
- add or update unit/integration tests;
- preserve save compatibility or migrate it;
- be reviewed against the current branch head before committing;
- pass `npm test` and the repository's syntax/DOM/asset validator;
- receive a browser smoke test when it affects UI, pointer interaction, saving or live simulation;
- document what was actually verified and what remains untested.
