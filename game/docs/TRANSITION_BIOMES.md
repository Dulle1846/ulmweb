# Transition Biomes — 1.2.17

**Feature:** `1.2.17.1–1.2.17.50`  
**Implementation:** `js/world/transition-biomes.js`  
**Rendering:** `js/world/terrain-model.js`, `js/presentation/rendering/terrain.js`  
**Survey UI:** `js/presentation/expeditions-panel.js`  
**Tests:** `tests/world/transition-biomes.test.js`

## What this layer is

A biome border in Kings & Cards is not a painted line or a second tile graph. It
is a deterministic, continuous **ecotone** derived from the same height,
moisture, temperature, water, forest and land-use fields that already drive the
world. Each ecotone has:

- a named pair of neighbouring habitats;
- a warped width, so the seam is never a straight edge;
- a three-band intermediate stage (first / middle / far);
- a soil and tint mix from both sides;
- a tree, grass and shrub density that shifts gradually;
- a landscape name such as woodland steppe, floodplain or woodland tundra;
- dynamic pressure from climate drift, forest growth, drought, fire, logging,
  grazing and the rare-biome atlas.

The layer is **render-, survey- and gameplay-derived**: it adds no tile objects
and no save fields. Existing worlds therefore load unchanged. Forest stock,
forest succession, grassland use and the special-biome map already contain the
state needed for the dynamic behaviour. Farms, forest and meadow gathering,
expedition routes, placement surveys and both event engines read a compact
`transitionGameplayAt()` profile derived from the same seam.

## Integration points

| Module | Role |
| --- | --- |
| `js/world/transition-biomes.js` | 50-point manifest, 15 pairs, 10 landscape types, 8 dynamics, pure tint packer, profile modifiers and the Explore survey. |
| `js/world/terrain-model.js` | `terrainColor()` adds the packed ecotone wash underneath the existing micro-relief. Water and beaches keep their old path. |
| `js/world/world.js` | Passes the world seed into the baked terrain colour; no extra canvas or pass. |
| `js/presentation/rendering/terrain.js` | Samples the ecotone only on the existing detail/tree lattice. Applies tree density, grass height, shrub spread, soil colour and clearing changes to the shared profiles. |
| `js/presentation/expeditions-panel.js` | A tile-bound Explore survey with PREV/NEXT seam controls shows the exact tile coordinates, active seam, stage, width, tree/grass/shrub percentages, active pressures, farm/forest/forage/settlement/movement values and all fifteen edges. |
| `js/systems/fields.js` | Every harvest multiplies the existing weather/season/soil yield by the farm tile's ecotone farm value. |
| `js/systems/forest-gathering.js` | Woodland and meadow gathering multiply their existing work factor by the tile's forest/forage value. |
| `js/systems/construction.js` | Site surveys read the farm soil threshold, household settlement suitability and the wet-bog house-footing refusal. |
| `js/systems/events.js` | Major issue families and places are weighted by the capital's ecotone tags. |
| `js/systems/micro-events.js` | The daily chronicle's template weights and place pool read the same capital profile. |
| `js/systems/expeditions.js` | Travel days use the shared route-speed helper at the destination. |
| `css/diplomacy.css` | Styles the survey and its gameplay chips without adding global layout work. |

### Why this is bounded

- The terrain bake reads one packed integer per pixel. The packer is pure and
  does not allocate a transition object, a requirement set or a history array.
- The detail renderer samples an ecotone only where it was already computing a
  forest stand or grass profile. There is no per-frame world scan.
- The ecotone reads `forestStock`, `forestSuccession.tiles["x:y"]`,
  `grasslandUseAt()` and the bounded special-biome region list. No new O(n²)
  structure exists.
- The detail cache already keys on `year`, so slow annual changes appear on the
  next settled raster instead of forcing every frame to rebuild.

## Gameplay coupling

`transitionGameplayFor(transition)` turns the visual seam into a small set of
bounded values: `farm`, `forest`, `forage`, `pasture` (additive yield bonuses),
`settlement` (0–1 suitability) and `movement` (route-speed factor), plus tagged
identities. The values are read only at existing decision boundaries:

- **Harvest:** `fields.js` multiplies the existing harvest factor by
  `1 + farm` at the field tile. A floodplain or humid meadow yields more; a dry
  bush-steppe or mountain-snow margin yields less. The multiplier is not stored.
- **Gathering:** woodland and meadow gathering use `1 + forest` / `1 + forage`
  on the visited tile. The returned `ecotoneFactor` is presentation data, not a
  save field.
- **Settlement:** `siteSuitability()` uses the ecotone farm value to relax or
  tighten the field-soil threshold, exposes the settlement value to the caller,
  and refuses a permanent household only on an extreme bog/flood seam. Ordinary
  wet margins and swamp hummocks remain buildable.
- **Movement:** expedition routes use the shared `getRouteMovementFactorAt()`
  helper at the destination. Resident errands keep the established timing so
  the 25- and 60-year demographic contract stays stable; the same helper is
  available for a caravan/route consumer without adding a per-step world scan.
- **Events:** `events.js` weights issue families such as flood, fishing, harvest,
  fire, winter, monster and omens; `micro-events.js` does the same for its
  templates and adds the ecotone place to the location pool. Both resolve the
  profile only when an event is actually due.

The movement helper caches one scalar per tile and per input that can move the
seam (year, forest stock/capacity, succession kind/age, atlas and seed). A
normal route step is a Map hit; a cache miss builds one transition profile, never
a map scan. The event, harvest, gather and placement paths run at their existing
seasonal, click or event cadence.

### Survey tile cursor

The Explore survey is a real tile inspector, not a fixed centre card. On first
paint it scans a bounded coarse grid once and keeps up to eight profiles that
differ in pair, landscape and **displayed** chip values. It starts at the seam
nearest the world centre; `◀ PREV` and `NEXT ▶` cycle the cursor. The card
exposes `data-transition-x`, `data-transition-y`, `data-transition-index`,
`data-transition-total` and the five chip attributes, plus
`data-transition-harvest-factor`. `getTransitionSurvey(x, y, { exact: true })`
returns the exact selected tile rather than a nearby stronger sample.

The candidate scan is not a simulation loop: it runs once per panel/world/year
and the tile cursor is transient UI state, never a save field. The grid is
capped at eight profiles, and the scan is bounded by the map's coarse step
(eight tiles on a standard map).

## The fifteen requested pairs (1.2.17.1–15)

| Point | Pair | Axis | Width driver | Typical landscape |
| --- | --- | --- | --- | --- |
| 1.2.17.1 | Woodland–Grassland | moisture | noise-warped moisture seam | woodland steppe / humid grassland |
| 1.2.17.2 | Grassland–Steppe | moisture + warmth | dry pasture edge | bush steppe / savanna edge |
| 1.2.17.3 | Steppe–Semi-desert | moisture + warmth | arid transition | dry open ground |
| 1.2.17.4 | Semi-desert–Desert | moisture + heat | sand margin | desert edge |
| 1.2.17.5 | Broadleaf–Mixed Woodland | temperature | temperate canopy mix | mixed woodland |
| 1.2.17.6 | Mixed–Conifer Woodland | temperature | cold canopy mix | mixed conifer |
| 1.2.17.7 | Conifer–Taiga | temperature | boreal edge | taiga edge |
| 1.2.17.8 | Taiga–Tundra | temperature | cold tree line | woodland tundra |
| 1.2.17.9 | Woodland–Mountain | elevation | rising rock line | mountain forest line |
| 1.2.17.10 | Mountain–Snow | elevation | nival belt | snow margin |
| 1.2.17.11 | Grassland–Wetland | moisture | low, wet ground | humid grassland / bog–forest mosaic |
| 1.2.17.12 | Wetland–River | elevation / water | riparian strip | floodplain |
| 1.2.17.13 | Coast–Woodland | elevation | coastal tree belt | coastal forest |
| 1.2.17.14 | Coast–Dune | elevation | dry beach margin | dune |
| 1.2.17.15 | Volcanic–Mountain | elevation + climate | volcanic slope | ash and rock margin |

## Intermediate stages and mixed structure (1.2.17.16–24)

- **1.2.17.16** Three stage bands (first, middle, far) are returned for every
  seam. `stage` is a continuous 0–1 value and `stageBand` is its survey label.
- **1.2.17.17** `treeDensity` blends from open ground to closed stand. It is
  modified by forest regrowth, logging, fire, grazing, drought and magic. Magical
  influence grows with realm age, from a narrow atlas fringe to a broad seam.
- **1.2.17.18** `grassHeight` selects short, medium or tall sward; grazing and
  drought shorten it, wet years lengthen it.
- **1.2.17.19** `soil` is a real RGB mix of the two sides, changed again by
  fire (char), logging (bare mineral soil), grazing (trampled) and wetness.
- **1.2.17.20** `moisture` carries the edge's own value; the dynamic wet/dry
  pressure is reported separately and adjusts stage and vegetation.
- **1.2.17.21** Tree and shrub densities are independent, so an open wood can
  gain shrubs without becoming a forest, and a meadow can gain small tree
  islands without closing its canopy.
- **1.2.17.22** Every pair carries a mixed flora vocabulary (for example oak,
  birch, hazel, bramble and fescue on the wood–grass edge).
- **1.2.17.23** The forest profile receives both understorey elements and the
  grass profile receives an extra small tree island when the tree density is
  high enough.
- **1.2.17.24** Boundaries are warped by deterministic value noise and by the
  continuous terrain fields. There is no straight polygon to draw.

## The ten named landscapes (1.2.17.25–34)

| Point | Landscape | Where it appears |
| --- | --- | --- |
| 1.2.17.25 | Woodland steppe | Wood–grass edge with warm, moderately dry conditions. |
| 1.2.17.26 | Humid grassland | Wood–grass edge on the wet side. |
| 1.2.17.27 | Dry open woodland | Wood–grass edge with low moisture and high warmth. |
| 1.2.17.28 | Bush steppe | Grass–steppe edge in warm, dry conditions. |
| 1.2.17.29 | Woodland tundra | Taiga–tundra seam. |
| 1.2.17.30 | Mountain forest line | Woodland–mountain seam above the lower slope. |
| 1.2.17.31 | Coastal forest | Coast–woodland seam. |
| 1.2.17.32 | Floodplain | Wetland–river or wet grass edge with woodland nearby. |
| 1.2.17.33 | Savanna edge | Warm grass–steppe seam. |
| 1.2.17.34 | Bog–forest mosaic | Wet grass edge with a real forest component. |

## Organic shape, texture and water fit (1.2.17.35–42)

- **1.2.17.35** No straight border: width and position use per-coordinate
  noise, and the underlying moisture/temperature/elevation fields are already
  continuous.
- **1.2.17.36** Widths differ per pair and per sample; the survey reports the
  actual width in tiles.
- **1.2.17.37** Trees, shrubs, grass and understorey are modified independently,
  so vegetation overlaps rather than switching at one threshold.
- **1.2.17.38** Each pair owns a flora list and deterministic local variation;
  one species does not cover the whole seam.
- **1.2.17.39** `islandChance` plus the extra grass-profile tree copy creates
  small islands of the neighbouring habitat.
- **1.2.17.40** The forest floor receives one low-alpha mineral wash from the
  ecotone soil, under the existing humus, litter and moss layers.
- **1.2.17.41** The baked colour is a soft tint mixed through the existing
  micro-relief, not a flat overlay.
- **1.2.17.42** Elevation and water gate the pairs; coast, river, wetland,
  mountain and snow edges use the real height/sea fields.

## Dynamics (1.2.17.43–50)

| Point | Dynamic | Data read | Visible effect |
| --- | --- | --- | --- |
| 1.2.17.43 | Long-term climate change | `year`, climate | Slow warming shifts stage and tree density over decades. |
| 1.2.17.44 | Woodland expansion | forest stock ratio, succession | Regrowth raises tree density and adds islands. |
| 1.2.17.45 | Steppeification | climate drift, dry site | Drought lowers tree density and shortens grass. |
| 1.2.17.46 | Wetland expansion | wet drift, site moisture | Wet years raise grass/shrub density and favour wet landscapes. |
| 1.2.17.47 | Post-fire change | `forestSuccession.tiles` burn state | Charcoal soil, fewer trees, post-fire grass. |
| 1.2.17.48 | Logging regeneration | forest stock, cutover/windthrow state | Bare mineral soil, lower canopy, regrowth flag. |
| 1.2.17.49 | Overgrazing | `grasslandUseAt()` | Short grazed sward, trampled soil, fewer shrubs. |
| 1.2.17.50 | Magical spread | `specialBiomeMap`, `specialBiomes.regions`, realm year | A purple-leaning tint and higher tree density at the atlas edge; the influence reaches about 1.6× farther by year 80, so old realms show visibly wider magical seams without rewriting the atlas. |

## Save compatibility

The feature is intentionally **save-neutral**:

- no new `state` field;
- no new terrain array;
- no change to `TERRAIN_GENERATION_VERSION`;
- no change to the height/moisture/temperature goldens;
- the 60-year save roundtrip with and without the special-biome block remains
  byte-identical to the existing contract.

An old save restores its terrain, forest stock, succession, grassland use and
rare atlas, and the ecotone is derived immediately from those values.

## Verification

| Check | Result |
| --- | --- |
| Focused 1.2.17 suite | **11/11** |
| Full Node suite | **1102/1102** |
| Syntax/UI audit | **173 source files**, **220 referenced UI ids**, local HTML assets |
| 25-year campaign | seed `20261108`, **10,040 ticks**, year 26, **0.730 ms/tick**, all requirements true, 74 residents |
| 60-year endurance | **24,040 ticks**, year 61, **0.823 ms/tick**, budget met, 74 residents, all requirements true |
| Save roundtrip | with and without the special-biome block: exact |
| Terrain data goldens | height, moisture and temperature unchanged |
| Terrain preview golden | updated for the intentional ecotone wash; seam test passes |
| Browser reference | A live Cloud-browser run founded a standard realm, rendered landscape and district terrain, loaded `transition-biomes.js` with HTTP 200 and produced **0 console errors**. The local Chromium binary is present but the VM lacks its shared libraries; the browser gate remains CI-owned. Reference screenshots are in `artifacts/transition-biomes-terrain-reference.png` and `artifacts/transition-biomes-live-detail.png`. |

The terrain preview hash changed intentionally because the ecotone wash is a
new visual layer. The separate height, moisture and temperature hashes did not
change, which is the important compatibility check for saves and gameplay.
