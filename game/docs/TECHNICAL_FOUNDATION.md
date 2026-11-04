# Technical Foundation

**Status:** Initial working baseline  
**Reviewed commit:** `dae4edd7fcb1204d794f68dc4475ac149beb5cbc`

This document records what exists today and the engineering rules toward which the codebase should evolve. It is not a specification of future gameplay features.

## 1. Current runtime

- Browser-based application using native JavaScript ES modules.
- Entry point: `game/index.html`, which loads `game/js/main.js`.
- Rendering: HTML Canvas 2D.
- UI shell: HTML elements styled with Tailwind's browser CDN build.
- Main animation loop: `requestAnimationFrame`.
- No build system, package manifest or automated test runner is present in the reviewed repository tree.

## 2. Current module layout

| Area | Current responsibility |
|---|---|
| `config.js` | World dimensions, cell size, timing, terrain thresholds, movement and building constants |
| `types.js` | Numeric entity type constants, entity defaults and the `Entity` class |
| `state.js` | Shared mutable runtime state |
| `world/world.js` | Procedural height/moisture maps, biome lookup, exploration and terrain prerendering |
| `world/entities.js` | Entity creation, queries and starting settlement placement |
| `world/weather.js` | Weather state updates |
| `systems/*` | Resources, morale, technology, cards and random events |
| `simulation/*` | Tick-level building income, villager behaviour and combat |
| `rendering/*` | Terrain/entities drawing, UI, minimap and particles/floaters |
| `camera.js` | View transform, zoom, bounds and coordinate conversion |
| `input.js` | Pointer, touch, keyboard and UI event handlers |
| `main.js` | Initialization and orchestration of simulation, movement and rendering |
| `utils.js` | Small shared math/random helpers |

## 3. Current world and entity data

The current terrain representation is not a grid of tile objects.

- World dimensions are `WORLD_W = 160` and `WORLD_H = 160`.
- `CELL = 48` is the logical cell size at zoom 1.
- Terrain generation stores `heightMap` and `moistureMap` in typed arrays at four samples per logical world unit.
- `terrainCanvas` is a prerendered visual cache.
- `explored` stores exploration visibility.
- Dynamic objects are stored in `state.entities` as `Entity` instances.
- Building occupancy is currently inferred from entities through queries such as `buildingAt()`; there is no declared `state.world` grid in the reviewed `state.js`.

The terrain data, visual cache, exploration data and dynamic entities should remain conceptually distinct. A future occupancy/spatial index may be introduced, but it must have one documented source of truth and must not duplicate terrain state accidentally.

## 4. Current execution model

- `main.js` runs a frame loop with `requestAnimationFrame`.
- Simulation updates are driven by an accumulator using `BASE_TICK_INTERVAL = 333` ms.
- The accumulator adds elapsed frame time multiplied by `state.gameSpeed`.
- Friendly unit movement is updated separately per rendered frame.
- Rendering is performed per frame.
- The current simulation also increments `state.tick` by `state.gameSpeed` inside each simulation update. This conflicts with the accelerated accumulator and is recorded as a defect in the codebase audit.

### Target time-system invariants

1. One simulation update advances exactly one logical simulation tick.
2. Game speed changes how frequently logical ticks are processed, not the size of an individual tick.
3. Pausing stops simulation time while allowing rendering and interface updates to continue.
4. Frame-based visual effects must not change authoritative simulation outcomes.
5. Tick, day, season and year conversions must be explicit and tested.
6. Large frame delays must be handled without unbounded catch-up work.

## 5. Target architectural boundaries

These are engineering rules to introduce progressively; they are not all satisfied by the current implementation.

### Core data and configuration
- Configuration contains constants and static definitions, not runtime behaviour.
- Entity/type definitions describe serializable domain data.
- Runtime state has a documented schema and clear ownership.
- State mutations occur through explicit system operations rather than arbitrary UI/rendering code.

### World and simulation
- World data owns terrain, regions, exploration and spatial queries.
- Simulation systems consume and update authoritative game data.
- Simulation code must not depend on DOM elements or Canvas contexts.
- Randomness must be injected through an explicit random source, not called directly through `Math.random()` throughout gameplay systems.

### Presentation and input
- Rendering reads authoritative state and draws it; it does not decide game rules.
- UI displays state and sends commands/actions to the application layer.
- Input translates user actions into commands; it should not implement game rules itself.
- DOM and Canvas objects remain outside serializable game data.

### Orchestration and dependencies
- `main.js` composes modules and starts the runtime; it should not become the home for gameplay rules.
- Lower-level domain modules should not import rendering or UI modules.
- Avoid circular module dependencies. Shared contracts should live in small lower-level modules.
- Each module should have a narrow, documented responsibility.

## 6. Determinism and identity

The current terrain generator initializes its Perlin permutation table from a randomly chosen seed, but the seed is not stored in game state. Other systems call `Math.random()` directly. The current project therefore does not provide reproducible whole-world generation or deterministic simulation.

Target requirements:

- Store a world seed as part of the authoritative game state.
- Provide a seeded random-number generator through an explicit API.
- Keep random streams separate where useful (for example, world generation and simulation) so unrelated changes do not reshuffle every outcome.
- Give persistent entities stable unique IDs.
- Do not use array positions as long-term entity identity.
- Make random-generator state serializable for save/load and reproducible debugging.

## 7. Persistence

No save/load implementation or save schema is present in the reviewed game files.

Persistence should be designed before the simulation becomes much larger. The saved representation should contain authoritative data only, not DOM nodes, Canvas contexts, prerendered canvases or other disposable runtime caches.

Target requirements:

- A versioned save format.
- Explicit serialization and deserialization boundaries.
- Stable entity IDs and valid reference restoration.
- Schema migration strategy.
- Validation of loaded data and graceful handling of incompatible saves.

## 8. Quality and performance

The reviewed repository has no visible automated test suite or test runner.

The foundation should add:

- Unit tests for pure calculations and individual system rules.
- Integration tests for interactions between systems.
- Deterministic simulation tests using fixed seeds.
- Browser smoke tests for initialization, input and rendering.
- A repeatable way to detect runtime errors.
- Performance measurements before introducing optimization complexity.

Performance work should be evidence-driven. Keep authoritative simulation data separate from visual caches, and introduce spatial partitioning, simulation levels of detail or worker execution only when measurements justify them.

## 9. Technical completion standard

A foundation change is complete only when:

- The implementation matches its documented responsibility.
- The relevant automated test or reproducible manual verification passes.
- No new runtime errors are introduced.
- The save format remains valid or is migrated where necessary.
- Documentation and dependency notes are updated.
- The change is isolated enough to review and revert safely.
