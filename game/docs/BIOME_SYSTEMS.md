# Cross-Biome Systems (1.2.21)

**Status:** implemented in 3.44.0, visually accepted in 3.44.1, coupled to the
world in 3.45.0 and given seasonal consequences in 3.46.0. The layer is a reader
and a slow annual writer over the existing 6×6 biome atlas from 1.2.19; it is
not a second world simulation.

## What the player sees

The **Biome resources & wildlife** tab now opens with a compact system summary:
climate zones, soil types, local variants, water-stressed regions, irreversible
scars and regions that are actively regenerating. Every discovered region card
contains:

- its climate envelope, elevation, humidity, insolation and wind;
- its real soil type, nutrients, water capacity, compaction, erosion, humus,
  soil organisms and salinity;
- surface water, groundwater, river tiles, lake share, floodplain, seasonal
  water level and water quality;
- the current seasonal face, plant and animal reaction, snow/frost line, farm
  use and seasonal hazard;
- land-use pressure from clearing, reforestation, grazing, farming, irrigation,
  drainage, mining, roads/settlements, pollution and slash-and-burn;
- recovery readings for vegetation, forest, colonisation, fauna, soil, water
  and irreversible loss;
- the ten explicit player readouts: prevailing biome, variants, vegetation
  density, typical resources, key animals, climate, special hazards,
  agricultural suitability, movement modifiers and ecological change;
- a collapsible **FULL ECOLOGY LEDGER** with one live row for each of the 66
  points below.

The ledger is deliberately an ordinary `<details>` element. It is present in the
real panel DOM, so keyboard and screen-reader users get the same evidence as a
player who opens it with a click.

On the **biome map layer**, every discovered region receives a seasonal tint
from its 48-face palette: fresh green in spring, straw in summer, rust in
autumn and blue-white in winter. The wash is strong enough to read at landscape
zoom (30–35%, winter 26–31%) but stays below every survey mark: density bars,
resource deposits, refuges, units, buildings and selection rings are painted
after it. The atlas legend names the current season and states this paint order.

The tint is one fill per discovered region, not a per-tile pass. Changing the
season changes only the lookup and the next frame's 36 region fills.

## World coupling (3.46.0)

The ten readouts are not a separate dashboard. The three values that a player
can feel are consumed by the existing simulation:

- **Movement.** `getCrossBiomeMovementFactorAt(x, y)` returns the same bounded
  multiplier the panel prints, normalised to 0.80–1.06. It is multiplied into
  `getRouteMovementFactorAt` (expeditions) and into the carrier speed in
  `updateLogisticsMovement` (physical goods hauling). The raw terrain burden is
  kept as a diagnostic, but the route/caravan value is capped so a wet mountain
  pass is difficult, not impassable.
- **Agriculture.** `getCrossBiomeFarmYieldFactorAt(x, y)` returns 0.84–1.14 from
  temperature, rainfall, nutrients, water capacity, salinity, compaction,
  insolation, slope, legacy and frost. In 3.46.0 a derived seasonal water/frost
  pressure factor (0.80–1.06) multiplies that base. `ecotoneHarvestFactor`
  multiplies the result into the real `pendingHarvest`/`harvestTotal` of every
  existing farm. The panel badge, readout detail and harvested grain therefore
  come from one value.
- **Seasonal pressure (3.46.0).** `getCrossBiomeProfile` derives one record from
  floodplain, seasonal water level, water scarcity, snow cover and the frost
  line. `pressure.yieldFactor` lowers the actual harvest; `pressure.floodRisk`
  and `pressure.droughtRisk` raise the displayed severities; and
  `pressure.hazard` names the strongest regional pressure when it clears 55%.
  The pressure is cached by year, season and the same saved fields the rest of
  the atlas reads, so it never becomes a per-frame scan.
- **Seasonal danger.** A region's listed hazards use the existing 1.2.15
  catalogue, not a parallel system. `triggerBiomeHazard` selects the catalogue
  row, calls the same `applyHazard` path and filters field damage and building
  destruction to that region. The seasonal hazard pass matures at most one
  displayed regional danger per season (35% chance), and only if the region is
  discovered and the danger is currently in its profile. From 3.46.0 it
  prefers `pressure.hazard`, so a floodplain can send a real flood rather than
  the generic top hazard.
- **Winter frost (3.46.0).** In winter, a region above 55% frost risk cuts a
  proportional share of `field.growth` for sown and growing fields before the
  next harvest. It is applied once per field and year (the daily field pass
  checks the optional `lastFrostYear`), so frost is a seasonal event rather
  than a daily drain. This is the non-display consequence of the snow/frost
  line; the existing field stage and the event log expose it to the player.

| Regional danger | Existing 1.2.15 mechanic | Coupled regional state |
| --- | --- | --- |
| Flood | `hazard:flood` | surface water +, groundwater +, erosion +, water quality − |
| Wildfire | `hazard:heatwave` | vegetation −, erosion +, soil life −, legacy/pollution + |
| Frost | `hazard:frost` | vegetation −, soil life −, humus − |
| Disease | `hazard:water-disease` | disease pressure +, water quality − |
| Erosion | `hazard:landslide` | erosion +, nutrients −, soil life − |
| Drought | `hazard:drought` | surface/groundwater −, salinity + |
| Salinity | `hazard:drought` | salinity +, nutrients − |

The active hazard keeps `source: "biome"`, `regionId` and `regionName`, so the
hazard panel can distinguish a regional survey event from a realm-wide one. A
last-struck record (`lastHazard`) is serialized with the region system; older
saves normalise it to `null` without a schema bump. All factor reads are cached
by year, season and the saved regional fields, and the hazard bridge runs only
on the existing seasonal pass. No per-frame or per-tile scan was added.

## Player-view visual acceptance

`npm run test:biome-seasonal` is the real-Chromium reference. It found and now
measures the issues fixed in 3.44.1:

- four full-map captures at the same camera for spring, summer, autumn and
  winter, plus a labelled contact sheet in `artifacts/biome-seasonal/`;
- coast, true desert, forest and mountain/snow close-ups, a selected city inside
  the tint and separate autumn/winter mountain frames;
- all 66 ledger rows present with no empty values or clipped details;
- no horizontal overflow or clipped labels at 1600 px and 390 px;
- after a paid action the same region, open ledger, scroll position and action
  focus are restored, and the new irrigation value is visible immediately;
- the live seasonal legend and a 36/36 tinted-region count;
- zero page errors and zero console errors;
- the WORLD EFFECT badges are read back against the live module profile: route
  multiplier, harvest multiplier and the named hazard must match the simulation,
  and the movement readout must print the same multiplier.

The companion `npm run test:biome-ui` still proves save/reload continuity for
stocks, fauna, crafted goods, market quotes and the whole serialized ecology
record. Winter intentionally uses a slightly lower alpha because its pale blue
already lifts the ground more than the other three seasons.

## Real actions, real costs

The following buttons are in the region card and go through the normal
management action dispatcher. Each one charges the realm and writes an atlas
history entry:

| Action | Cost | Immediate effect | Long-term effect |
| --- | ---: | --- | --- |
| Irrigate | 8 G | raises regional water and irrigation footprint; lowers groundwater | salt accumulates slowly, especially in dry biomes |
| Drain | 8 G | lowers the water table, improves quality slightly | salinity and wet-ground pressure fall |
| Reforest | 10 G + 6 wood | raises vegetation, lowers erosion, starts a reforestation footprint | canopy, humus and erosion cover improve over later years |
| Clean water | 10 G | lowers pollution and raises water quality | disease pressure falls, water recovery improves |
| Burn & sow | 4 G | +10 food, +5 wood, nutrients pulse, canopy/soil life/water quality fall | legacy damage and erosion persist; once per year |
| Restore habitat | 12 G + 8 wood | existing restoration plus humus, soil life, water quality and legacy relief | recovery is slower than the damage |

Slash-and-burn uses the same `state.year` cooldown that is serialized with the
region. Repeating it in the same year is refused before gold is spent.

## State model

`js/world/cross-biome-data.js` is static data:

- 8 `BIOME_CLIMATE_ZONES`, each with several related biomes;
- 12 climate envelopes with temperature, precipitation, humidity, insolation,
  wind, parent soils and local variants;
- 14 `BIOME_SOIL_TYPES` with nutrients, water capacity, drainage, erosion,
  organic matter, compaction, salt tolerance, frost risk and acidity;
- 48 local variants (four per biome);
- four seasonal appearance labels per biome (48 faces total), four matching
  map tints per biome and four season behaviour records;
- `BIOME_SYSTEM_REQUIREMENTS`, the 66-row manifest used by the UI, tests and
  spec audit.

`js/systems/cross-biome-state.js` owns one small record per region:

```text
version, seed, variantId, variantLabel, soilType,
nutrients, waterCapacity, compaction, humus, soilLife, salinity,
groundwater, waterQuality, pollution, legacy,
hydrology { riverTiles, lakeShare },
landUse { grazing, farming, irrigation, drainage, reforestation,
          restoration, slashBurn, mining, settlement, roads, fields },
lastActionYear { slashBurn }
```

The record is created with `generateBiomeAtlas()` and attached as
`region.systems`. The 1.2.19 fields (`vegetation`, `soilHealth`, `water`,
`erosion`, `clearCut`, `extractionPressure`, resources and fauna) remain the
single source of truth for the rest of the game. The system record only adds
slow ecological memory and land-use pressure.

### Annual step

`advanceCrossBiomeAnnual(region, { year, season })` runs once inside the existing
`updateBiomeAtlasAnnual()` year boundary, after the region's existing annual
fields are updated and before resource regeneration. It performs one bounded
pass over buildings, roads, fauna and resource rows per region; it never loops
over tiles from the render loop.

The step moves:

- groundwater from rainfall, irrigation, mining and restoration;
- pollution from mining, settlement and burning, flushed by rain and restoration;
- water quality from rain, restoration, pollution and mining;
- nutrients and humus from vegetation and soil life, consumed by farming,
  grazing, erosion and burning;
- soil life from humus, water balance, pollution, compaction and salinity;
- compaction from grazing, farming, settlement, mining and restoration;
- salinity from irrigation, evaporation, drainage and rain;
- legacy from erosion, salinity, pollution, burning, mining and restoration;
- the existing `soilHealth`, `water`, `vegetation`, `erosion` and
  `diseasePressure` fields, so the rest of the atlas sees the same change.

Land-use footprints fade when not repeated. Reforestation and restoration leave
their benefit in vegetation and soil rather than a permanent free modifier.
Protected areas and conservation/fallow policy soften pressure. Nothing here is
random per frame; all values come from the saved seed, region sample and state.

## Save compatibility

`serializeBiomeAtlasState()` writes `systems` on each region. Validation rejects
an unsupported version, unknown soil type, out-of-range scalar, malformed
hydrology, malformed land use and malformed action ledger. Loading calls
`normalizeCrossBiomeState()`; old 1.2.19 saves without `systems` get a
deterministic default record derived from their existing region sample, seed
and climate. No save envelope version bump is required.

## Verification

Focused coverage lives in `tests/systems/cross-biome-systems.test.js`:

1. 66 ids, 8 zones, 12 envelopes, 14 soils, 48 variants, 48 seasonal faces and
   48 map tints;
2. live profiles expose all 66 values and ten readouts, and the overlay tint
   changes with the season;
3. elevation, humidity, wind and local deviation change regional form;
4. annual soil/water movement and bounds;
5. all four seasons change look, activity, water level and farm use;
6. every paid action changes real region state and resists same-year burn;
7. recovery and irreversible legacy;
8. real snapshot + panel DOM contain all 66 rows and actions;
9. save round-trip, invalid-save rejection and old-save defaults.

The browser reference `tests/browser/biome-atlas-ui.mjs` opens the real panel,
checks all 66 unique point ids and non-empty values, clicks irrigation,
reforestation, water cleanup and slash-and-burn, saves/reloads and compares the
serialized ecological record. It also keeps the 1.2.19 harvest/hunt/craft and
frontier checks.
