# Cross-Biome Systems (1.2.21)

**Status:** implemented in 3.44.0. The layer is a reader and a slow annual
writer over the existing 6×6 biome atlas from 1.2.19; it is not a second world
simulation.

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
- four seasonal appearances per biome (48 faces total) and four season
  behaviour records;
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

1. 66 ids, 8 zones, 12 envelopes, 14 soils, 48 variants and 48 seasonal faces;
2. live profiles expose all 66 values and ten readouts;
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
