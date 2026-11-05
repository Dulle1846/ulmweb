# Kings & Cards 3.2 — Lite City Builder Specification

## Product goal

Evolve the existing card-driven realm simulator into a readable, small-scale medieval settlement builder. The player should shape a village through placement, roads, production, storage, housing, services and seasonal planning. The scope is deliberately smaller than Foundation, Manor Lords or Cities: Skylines, but the simulation should feel systemic rather than decorative.

The current 160 × 160 tile world, entity model, card economy, seeded random streams, people/family records and browser canvas renderer remain the foundation. This update must not replace those systems wholesale or discard existing save data.

## Design pillars

1. **Visible cause and effect.** A lumber camp near a forest should produce timber; a distant mill should be less effective until connected by roads and transport.
2. **People do the work.** Production is limited by assigned workers, travel time, input stock and storage capacity. Do not teleport goods between buildings.
3. **Readable constraints.** Show why a building is idle: no worker, no input, full output store, missing road access, depleted resource node or seasonal shutdown.
4. **Mistakes are recoverable but consequential.** Bad placement, overbuilding, shortages and expensive upkeep should matter without creating an unwinnable spiral from one early mistake.
5. **Slow strategic time.** A day is a simulation tick. Seasons and years should be long enough for players to see the settlement change.
6. **Deterministic simulation.** A world seed plus saved random-stream counters must reproduce economic, market, combat, population and event outcomes.
7. **Performance before spectacle.** Bound entity counts, inventories, routes, event histories and visual effects. No multi-gigabyte runtime assets.

## Time and simulation cadence

- Baseline: 750 ms per in-game day at 1x (was 333 ms).
- Year: 400 days; season: 100 days.
- Approximate year duration: 5 minutes at 1x, 10 minutes at 0.5x, 2.5 minutes at 2x, 1.25 minutes at 4x.
- Pause remains immediate. Speed options: 0.5x, 1x, 2x and 4x.
- Movement delta must scale with the calendar interval so residents do not cover the same in-game distance during a much longer day.
- All simulation subsystems remain fixed-step. Rendering remains frame-capped and independent of simulation ticks.
- Long background-tab gaps must not trigger thousands of catch-up ticks.

## Core domain model

### Terrain and resource nodes

Add explicit, seed-generated resource nodes rather than inferring unlimited resources from building type:
- Forest stands: species, density, harvestable timber, regrowth, fertility and last-harvest day.
- Stone deposits: remaining reserve, extraction rate and depletion state.
- Water sources: well/river/lake access, sustainable draw and service coverage.
- Farmland: soil fertility, crop type, fallow state, growth stage and harvest readiness.

Resource nodes must be deterministic from world seed and persisted only when modified, or stored in compact typed arrays when appropriate. Avoid one heavyweight JavaScript object per terrain tile.

### Roads and logistics

Road tiers:
- Dirt path: cheap, slow, low maintenance.
- Gravel road: moderate cost and speed.
- Paved road: expensive, faster, higher upkeep.

Requirements:
- Roads occupy tile edges or a compact road-tile grid; they must not be normal building entities.
- Placement validates terrain, water crossings, occupied footprints and map bounds.
- Road connectivity is represented as a graph/chunk cache, invalidated only when roads change.
- Residents and carriers use deterministic pathfinding with road-weighted movement costs.
- A route is not considered connected merely because two buildings are close in Euclidean distance.
- Road upgrades preserve existing road connectivity and save compatibility.

### Warehouses and physical goods

Introduce storage buildings with bounded inventories by resource and reserved capacity.
- Producers create goods in their local output inventory.
- Workers/carriers collect goods, move along a route and deposit them in a warehouse or a consuming building.
- Consumers draw only from reachable stock; no global resource teleportation.
- A delivery job reserves its source quantity and destination capacity to prevent two carriers claiming the same goods.
- If a route is blocked, the job waits, retries with a bounded backoff and exposes a readable reason.
- Start with small, explicit carrier counts and simple hauling jobs. Add carts later; do not simulate every crate as an entity.

### Production chains

Initial recipes:
- Forest → logs → sawmill → planks.
- Stone deposit → stone quarry → cut stone.
- Grain field → grain → mill → flour → bakery → bread.
- Well/river → water supply.
- Tavern consumes food and basic goods to create social value and trade income.

Each recipe defines:
- input quantities,
- output quantities,
- work duration in simulation days,
- worker requirement,
- building level/efficiency,
- season restrictions,
- storage requirements,
- upkeep.

The first playable slice should use logs/planks and grain/flour/bread. Keep the existing direct resource ledger available during migration; switch one chain at a time after parity tests.

### Housing and population

Housing tiers:
1. Tent/camp: temporary, low capacity, low comfort.
2. Timber cottage: basic family housing.
3. Stone house: larger capacity and better winter protection.

Residents need:
- food,
- water,
- warmth (firewood in winter),
- safety,
- belonging/social contact,
- a meaningful job or household role.

Immigration is permitted only when:
- there is suitable vacant housing,
- food reserves cover a configurable safety buffer,
- the realm has available work or a credible support role,
- local safety and health are acceptable.

Shortages cause staged effects: reduced satisfaction → lower productivity → illness/unrest → migration. Do not jump straight from one shortage to mass death.

### Service influence

Markets, wells, taverns, temples, clinics and watchtowers provide local coverage radii.
- Coverage uses distance/road access, not a global boolean.
- UI overlays show coverage and the reason a home is underserved.
- A service contributes only while staffed, supplied and operational.
- Watchtowers/palisades improve local safety; they do not grant map-wide protection.

### Construction and building evolution

Construction stages:
1. Site preparation.
2. Foundation.
3. Timber frame/scaffolding.
4. Completed building.

Construction consumes materials in stages and occupies the site from the beginning. Workers deliver materials physically. The player can cancel or pause construction with a partial refund policy displayed before confirmation. Building damage, repairs and upgrades are separate future systems.

### Seasons and environment

Four seasons, each 100 days:
- Spring: sowing, forest regrowth, moderate food production.
- Summer: crop growth, high labor demand, drought risk.
- Autumn: harvest, storage pressure, trade surplus.
- Winter: no normal field harvest, high firewood/warmth demand, slower forest growth.

Visual changes:
- Fields visibly move through fallow → sown → growing → ripe → harvested.
- Forest density falls when harvested and slowly regrows if soil/fertility permit.
- Weather and events can modify yields without bypassing the underlying crop model.

### Events and randomness

Use independent saved streams, at minimum:
- world-generation,
- production,
- logistics,
- market,
- weather,
- combat,
- population,
- social,
- events,
- presentation.

Gameplay randomness must never use Math.random(). Presentation-only randomness may use a separate presentation stream. Event frequency should be tuned in in-game days, not by render frames.

Initial events:
- drought, blight, harsh winter, forest fire,
- merchant caravan, new deposit discovery,
- road damage, worker shortage,
- local festival, sickness, bandit activity.

Each event should have a warning/choice window where appropriate, a clear probability basis and bounded effects.

## UI and visual language

- Keep the comic/hand-painted medieval strategy style already established.
- Add a build mode with categories: Roads, Housing, Production, Storage, Services, Military and Nature.
- Add inspect panels for every building: workers, inventory, input/output, upkeep, efficiency, road connection, service coverage and current idle reason.
- Add map overlays for roads, service radii, resource nodes, fertility and delivery routes.
- Keep top-level navigation concise; detailed controls belong inside a management/build panel.
- Use SVG and optimized sprite sheets with shared palettes. Load large atlases lazily. No giant uncompressed art dumps.

## Save/load and migrations

- Save data is local to the browser profile today; it is not cloud sync or cross-device account storage.
- Keep a versioned save envelope and add explicit migrations for each schema change.
- Save world seed, tick/calendar, random stream counters, entity DTOs, household/family records, building inventories, road tiles, construction state, service state, resource-node deltas, hand/deck and economic ledgers.
- Never serialize live object references or DOM/canvas objects.
- Validate the entire save before resetting the live realm. A failed load must leave the current realm intact.
- Keep a previous valid save backup before replacing the active slot.
- Add export/import JSON as a player-controlled backup path before any cloud-save backend exists.
- Test round-trip parity for resources, people, relationships, roads, inventories, construction, calendar, random streams and card hand.

## Performance budgets

- Preserve the existing 900 total entity / 420 mobile-entity caps until profiling proves a safe increase.
- Roads use compact tile data and cached connected components.
- Route search is bounded by max nodes, retries and route length; cache paths by origin/destination and road graph version.
- Run logistics and needs on scheduled simulation intervals, not every animation frame.
- Avoid all-pairs building/worker scans; use spatial buckets or indexed work queues.
- Target the existing 1,200-tick / large-population benchmark with no material regression; add a separate logistics benchmark before increasing population caps.

## Delivery phases and acceptance gates

### 3.2 — Pacing and deterministic foundation (shipped)
- 750 ms day clock and 0.5x / 1x / 2x / 4x speed.
- Movement pace follows calendar pace.
- Seeded combat retaliation, production yields and market price drift.
- Regression tests prove identical seeded outcomes.
- Save/load preserves selected speed.

### 3.3 — Road network and build-mode foundation (shipped in PR #27)
- Dirt, gravel and paved road tiers with material costs, upgrades and partial demolition refunds.
- Map click/drag placement, explicit cancel, road rendering and intersections.
- Road-aware movement and A* routing.
- Recurring road upkeep in the economy ledger.
- Versioned road save/load, unit tests and browser E2E.

### 3.4 — Resource geography (current implementation phase)
- Deterministic forest stands, stone deposits, water access and soil fertility derived from seed and terrain.
- Compact typed arrays for the 160 × 160 world; sparse save deltas for depleted nodes.
- Harvesting, extraction, forest regrowth and nearest-node lookup.
- Save/load migration keeps older saves valid and reproduces untouched nodes from their seed.
- Next increment: visible resource overlays, site suitability and connect lumber camps/quarries to finite node stock.

### 3.5 — Storage and physical hauling
- Warehouse inventories, carrier jobs, reservations and delivery routes.
- One complete logs → planks chain with visible carriers.
- Idle reasons and route failure handling.

### 3.6 — Food production and seasonal farming
- Grain → flour → bread chain.
- Crop stages, harvest windows and storage capacity.
- Winter food/warmth buffer and shortage warnings.

### 3.7 — Housing, immigration and household needs
- Tent/cottage/stone-house tiers.
- Food/water/warmth/safety/social needs.
- Immigration gate and staged shortage consequences.

### 3.8 — Services, construction and forest stewardship
- Market/well/watchtower coverage.
- Visible construction stages and staffing/material delivery.
- Forest harvest/regrowth and forester planting.

### 3.9 — Balance, events and visual polish
- Event probabilities and consequence tuning.
- Route/service overlays, building inspection and seasonal art.
- Long simulation, browser, save migration and memory/performance checks.

## Release gates

A city-builder phase is ready for preview only when:
1. All Node tests and syntax checks pass.
2. Browser E2E exercises the new user flow.
3. Save/load round-trip tests preserve new state.
4. A seeded long simulation has no NaN/Infinity, unbounded queues or entity leaks.
5. The feature has a clear UI explanation and does not break existing card placement.
6. The production branch is not modified until the release candidate is verified.
