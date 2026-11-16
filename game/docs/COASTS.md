# Coastlands 1.2.14

Coastlands is a real thirteenth climate, not a blue overlay painted on the
temperate map. One deterministic profile derived from seed, position, height,
moisture, temperature, season, tide, weather and land use feeds the terrain
bake, the detail renderer, survey, gathering, works and the annual hazard pass.
There is no second tick loop, no per-frame ecology simulation and no parallel
resource ledger.

## Implementation

- **Ecology:** `game/js/world/coast-ecology.js` exports `coastProfileAt()`,
  `coastPotentialAt()`, `isCoastSite()`, `coastProductsAt()`,
  `coastRequirementAudit()`, `COAST_REQUIREMENTS`, seventeen named formations
  and the shared coastal flora, fauna and goods. The profile carries beach
  material, sand, shingle, rock, cliff, dune, marsh, tidal flat, lagoon, reef,
  harbour, bay, fjord, delta, island, sandbank, outcrop, tide level and range,
  wave height, storm surge, erosion, flood, sand shift, salinisation, spray,
  fog, ice, coastline change, seasonal water, succession and work potential.
- **Climate:** **Coastlands** is selectable in world creation.
  `terrain-model.js` supplies its palette and height, moisture and temperature
  curves; `season.js` supplies the maritime seasonal profile; `weather.js`
  gives rain and coastal snow their own maritime weights; `world.js` adds
  coastal relief. Existing saves without the climate keep their terrain.
- **Coastal landforms (1.2.14.1–1.2.14.28):** sand beach, shingle beach,
  rocky shore, sea cliff, salt marsh, dune field, lagoon, tidal flat, fjord,
  river delta, sheltered bay, natural harbour, island shore, coastal forest,
  sandbank, reef and shallow water. Sheltered bays, natural harbours, river
  mouths, intertidal ground, coastal lagoons, rock outcrops, island groups,
  sandbanks, reefs and shallow nearshore water are continuous profile fields,
  so a coast changes gradually instead of switching a whole map to one stamp.
- **Coastal ecology (1.2.14.11–1.2.14.18):** beach grasses, dune plants,
  coastal shrubs, salt-tolerant plants, coastal forest, reeds and wetland
  plants, salt-meadow vegetation, algae and seagrass. Succession is a stage on
  the same profile: pioneer beach, meadow, shrub, forest and marsh.
- **Wildlife (1.2.14.29–1.2.14.36):** gulls, terns and sea eagles; seals,
  otters and other marine mammals; oystercatchers, redshanks and waders; fish,
  crabs, mussels and shellfish; sea turtles in warm waters; coastal foxes and
  predators; seasonal geese and migratory resting places. Seasonal species are
  filtered by the same `season` value the renderer reads.
- **Goods (1.2.14.37–1.2.14.44):** fish, shellfish and mussels, sea salt,
  seaweed, driftwood, coastal minerals, sea trade goods, pearls and amber.
  They enter `FOREST_GOODS`, the item lexicon, the shared gathering ledger and
  the existing delivery channels. `coastProductsAt()` slices the list to nine
  entries so the inventory stays bounded.
- **Weather and water (1.2.14.45–1.2.14.53):** strong coastal winds, fog,
  storm surges, high swell, tides, coastal rain, salt spray, seasonal water
  levels, and ice or frozen shores in cold seasons. Tide is deterministic from
  day and seed; storm and wave fields rise with the shared weather state.
- **Works (1.2.14.54–1.2.14.63):** `game/js/world/coast-works.js` adds nine
  player-built works on completed buildings: fishing village, harbour town,
  trading post, coastal fortress, lighthouse, shipyard, salt-making works,
  coastal market and naval base. Each spends real goods, marks a bounded work
  tile, repaints the terrain, feeds the shared ledger, respects a per-tile
  recovery cooldown and is gated by the same ecology the renderer shows. A
  fishing village needs a productive shore; a harbour needs a sheltered
  anchorage; a saltworks needs brine and tidal ground. Strategic control of a
  natural harbour (1.2.14.63) is the same profile field consumed by the works
  and survey, not a separate checklist flag. The management panel reuses the
  existing works UI.
- **Hazards (1.2.14.64–1.2.14.69):** `coast-hazards.js` runs one bounded annual
  pass over at most 96 candidates: occupied buildings, coastal works, sampled
  roads and wild ground. Storm surge, erosion, flood, sand shift and
  salinisation can mark a real building dead or remove a real road, after which
  the normal construction path can rebuild it. Occupied ground is preferred
  over a more dramatic but empty wild-water sample, so an annual event cannot
  report a loss that never happened. Keeps and wonders are protected. The scan
  runs only at the year boundary, never in the frame loop.
- **Long-term change (1.2.14.70–1.2.14.71):** tide change, coastline change,
  dune stability, marsh accretion, erosion scars, salt pans and long-term
  shoreline shift are derived from the same seed, year and hazard profile.
  A worked or protected shore modifies erosion, flood and salinisation without
  creating a second map.
- **Rendering:** `game/js/presentation/rendering/coast-render.js` draws the
  baked ground as-is and adds visible-tile-only detail: wet sand, shingle,
  rock shelves, cliff faces, dune ridges, tidal channels, lagoon water, reefs,
  sandbanks, foam, salt crust, beach grass, reeds, coastal trees, birds,
  marine mammals, works and hazard scars. Capped loops keep low-end frames
  inside budget.
- **Persistence:** save schema gains an optional bounded `coastWorks` block.
  `state.js`, `save-validation.js` and `save-runtime.js` serialize, validate
  and restore it; old saves without the block load unchanged.
- **UI and survey:** `grassland-use.js` recognizes coastal work flags, the
  management panel exposes the nine works where the terrain supports them, and
  `scripts/coast-audit.mjs` generates a reproducible evidence table.

## Verification

```bash
npm test
npm run test:campaign:coast
npm run test:coast-audit
```

The 25-year campaign uses the ordinary fixed-step simulation and reports ticks,
ambitions and milliseconds per tick. The audit generates a real coastal world,
surveys every tile through four seasons, builds all nine works through
`performCoastWork()`, gathers a sea harvest through
`gatherNearestGrasslandProducts()` and forces the real annual surge against a
placed house. It writes [`../../artifacts/COAST_1.2.14_AUDIT.md`](../../artifacts/COAST_1.2.14_AUDIT.md)
and `coast-audit.json`; the checked run reports **71/71 working**, nine works,
a successful gather and a destroyed real building. The checked 25-year
campaign reaches **10,040 ticks / 72 residents / 3 agenda stages / 0.937 ms per
tick** with stable firewood and no game over. The full suite is **1033/1033**,
with syntax/imports clean for 162 source files and 201 UI ids.
