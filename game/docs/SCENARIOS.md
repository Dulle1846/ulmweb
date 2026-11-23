# Chronicle Scenarios — authored openings and start conditions

**Status:** implemented in 3.49.0 (roadmap 4.0.4).

A scenario is an optional opening contract for a new realm. It changes the date,
starting stores, morale and legitimacy before the world is founded, then gives
the running realm one objective that reads the same live systems the player
already manages. It does not create a parallel simulation, a second economy or a
scripted counter.

## Player surface

The founding screen offers five choices:

| Opening | Start | Objective | Difficulty |
|---|---|---|---|
| Free Realm | Spring, year 1, default stores | none | FREE |
| The First Winter | Autumn, northern climate, 70 food | 150 food by spring, year 2 | HARD |
| The Empty Granary | Summer, 20 food and 240 gold | 180 food by winter, year 1 | SEVERE |
| The Broken Crown | Autumn, 26 legitimacy | 60 legitimacy by spring, year 2 | HARD |
| The Green Frontier | Spring, forest-rich start | survey 6 biome regions by spring, year 2 | NORMAL |

Selecting a preset writes its recommended climate into the existing World Forge,
so terrain generation, resources and climate hazards still come from the normal
world options. The player may change that climate before founding; the scenario
keeps its own start date and stores.

**Custom editor.** The player can author a local scenario: name, briefing,
climate, opening season, food/wood/stone/gold, morale, legitimacy, objective
(food, population, legitimacy or surveyed regions), target and deadline year.
Custom scenarios are validated, normalized again on read and stored in
`localStorage` under `kings-and-cards:scenarios:v1`, capped at six. The envelope
is versioned; a malformed row is ignored rather than reaching world generation.

**In play.** A scenario realm gets a compact HUD beside the calendar and a full
objective card at the top of Kingdom Overview. Both read
`js/systems/scenario.js#getScenarioSnapshot`: current value, target, deadline,
starting stores, reward, failure consequence and the last four recorded
outcomes. A completed or failed scenario stays visible as a record; the realm
continues.

## Simulation contract

`applyScenarioStart` runs in `js/app/main.js#startNewRealm` after the identity,
endless state and starting charter exist, but before `initWorld` and the fixed
60-step warm-up. It sets the opening date, seasonal index, stores, morale and
political legitimacy. The world, settlement, population register, charter bonus,
biome atlas and every other system then initialize normally around those values.

`updateScenario` is called once from `finishDailyRealm` in
`js/simulation/simulation.js`. It evaluates at most once per calendar day
(`evaluatedYear`/`evaluatedDay`) and reads:

- food: `state.resources.food`
- population: the population register total, with an entity fallback
- legitimacy: `state.politics.legitimacy`
- regions: discovered entries in `state.biomeAtlas.regions`

The objective is checked before the deadline. Reward or failure effects are
applied exactly once, then `status` becomes `won` or `failed`. The outcome is
written to the realm legacy/chronicle and queued as a player message, so the
connected history, morale, treasury and politics surfaces change together. No
ecological, terrain or per-tick pass is added.

## Save compatibility

Save schema **14** adds `state.scenario`. Schema-13 saves migrate to
`scenario: null`, which normalizes to Free Realm; old realms load unchanged and
never receive a retroactive objective. The live scenario stores the full
normalized definition plus status, progress, evaluation day and a bounded
history (12 entries). `save-runtime.js` normalizes it on both save and restore;
`save-validation.js` validates it against hostile input.

## Files

- `js/systems/scenario.js` — presets, validation, start application, daily
  objective, effects, snapshot.
- `js/core/scenario-library.js` — versioned local custom-scenario library.
- `js/presentation/scenario-panel.js` — Kingdom Overview objective card.
- `js/presentation/rendering/ui.js` — calendar HUD.
- `js/app/main.js` — start-screen picker, editor and start path consumer.
- `js/core/save-runtime.js`, `js/core/save-validation.js`,
  `js/core/save-migrations.js` — schema 14 persistence.

## Verification

- `tests/systems/scenario.test.js` — catalog, bounds, start path, one-shot
  completion and failure, schema migration and custom-library limits.
- `tests/browser/scenario-start.mjs` — selects a preset, authors and saves a
  custom opening, founds it through the real start screen, checks live
  stores/legitimacy and the HUD/panel, saves and reloads, then repeats the
  reading at 390 × 844. Zero page or console errors are required.
