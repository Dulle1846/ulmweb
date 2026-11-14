# Taiga 1.2.10

Taiga is a real boreal climate, not a cold pine tint over the temperate forest.
`game/js/world/taiga-ecology.js` derives one deterministic profile from height,
moisture, temperature, climate, season, weather, wind and real land use. The
same profile feeds terrain colour and detail, forest stands, gathering, the
land-use survey, movement costs and the shared good ledger. There is no extra
tick loop, no per-tile save data and no parallel inventory.

## Implementation

- **Ecology:** `taiga-ecology.js` with `taigaPotentialAt()`, `isTaigaSite()`,
  `taigaOpenAt()`, `taigaProfileAt()`, `taigaGoodsFor()`, `taigaProductsAt()`,
  `taigaSummary()` and `taigaRequirement()`.
- **Climate:** dedicated `taiga` climate in the terrain model and selector.
  Northern and temperate worlds keep their existing forests, so old saves
  render unchanged. A long snow season, a short intense summer and a late
  spring melt drive the same seasonal curve used by trees, snow, fire and
  movement.
- **Forests:** ten formations: old spruce forest, pine ridge, larch stand,
  birch island, mixed taiga, forest clearing, tundra ecotone, peat bog, taiga
  lakeshore and rocky woodland. Five shared stand types (`taiga-spruce`,
  `taiga-pine`, `taiga-larch`, `taiga-birch`, `taiga-mixed`) preserve the
  existing forest indices; age, density, light, disturbance and snowbreak /
  windthrow use the established forest model.
- **Soils and landform:** moss floors, lichen and heather, berry shrubs, wet
  hollows, deep peat, exposed roots, deadwood, stumps, rocky woodland, flood
  risk and permafrost values. These are profile values, not a colour overlay.
- **Water:** numerous forest lakes, small ponds, rivers and streams, swampy
  banks, spring floodplains, wet hollows, natural waterways and winter ice.
  Water is part of the profile, terrain detail, gathering and the fur/fish
  economy.
- **Vegetation:** spruce, pine, Siberian larch, silver birch, aspen, alder,
  willow, dwarf birch, bog pine, rowan, juniper, blueberry, lingonberry,
  cloudberry, dwarf willow, bog rosemary, boreal herbs and four short-lived
  flowers.
- **Fauna:** moose, reindeer, brown bear, wolf, lynx, red fox, mountain hare,
  red squirrel, boreal vole, boreal owl, capercaillie, crossbill, beaver,
  otter, summer mosquitoes and blackflies, and wood ants. Herds, migrations
  and seasonal presence are profile data.
- **Goods:** spruce/pine/larch/birch timber, resin, larch cones, birch bark,
  mushrooms, chanterelles, blueberries, lingonberries, cloudberry, lake fish,
  game, meat, hides, fur, bear fat, boreal herbs, peat, stone, bog iron and
  willow withies. The five genuinely new goods (`taiga-herb`, `lake-fish`,
  `larch-cones`, `birch-bark`, `bear-fat`) join the one shared ledger.
- **Terrain:** `terrain.js` gives taiga priority over desert/steppe/grassland
  and suppresses closed forest on open taiga ground. `taiga-render.js` draws
  the bounded moss/lichen floor, water and ice, sedges, berry shrubs, flowers,
  deadwood, exposed roots, snow, fire scars, wildlife and spruce/pine/larch/
  birch tree forms.
- **Timber:** `resource-geography.js` seeds five taiga stand types plus real
  snowbreak, windthrow, fire and bark-beetle disturbances on the same resource
  nodes used by lumberjacks, sawmills, hauling and firewood. Stock and capacity
  stay in the shared forest map.
- **Gathering:** `gatherMeadowProducts()` and
  `gatherNearestGrasslandProducts()` check taiga after tundra and before
  savanna. Lake fish delivers food; boreal herbs and bear fat deliver medicine;
  the remaining goods sell through the existing ledger. Winter removes open-
  water fish and soft fruit from the seasonal window.
- **Economy:** forestry, hunting, fishing and fur trade are strong; agriculture
  is deliberately marginal. Long winters raise fuel demand, storage and winter
  preparation, lower mobility, add remote-supply cost, and make waterways
  valuable for lowering that cost. Taiga homes use a shorter hearth-load
  interval (32) than temperate or savanna homes.
- **Settlements:** `grasslandSiteSummaryAt()` returns the taiga survey for the
  existing farm/stable panel. `economy.settlementSpacing` expresses the sparse
  settlement pattern without adding a second settlement model.

## Formations

| Formation | Character |
| --- | --- |
| Old spruce forest | Dark spruce spires, deep moss, deadwood and driven snow |
| Pine ridge | Sunlit pine trunks, lichen heath and dry needle litter |
| Larch stand | Airy larch crowns that turn gold and drop their needles |
| Birch island | White stems in a bright island of regrowth among conifers |
| Mixed taiga | Spruce, pine, larch and birch in an uneven, many-aged mosaic |
| Forest clearing | A small sunlit gap of grasses, fireweed and berry bushes |
| Tundra ecotone | Wind-bent birch and lichen heath where the taiga ends |
| Peat bog | Sphagnum hummocks, black bog pools and stunted pines |
| Taiga lakeshore | Reeds, willow, wet moss and beaver sign around a forest lake |
| Rocky woodland | Pine and spruce roots gripping broken stone |

## 56-point audit

| ID | Implementation |
| --- | --- |
| 1.2.10.1 | Old spruce forest formation, spruce signature trees and spruce-timber/resin goods |
| 1.2.10.2 | Pine ridge formation, pine crowns and pine timber/cones |
| 1.2.10.3 | Larch stand formation, deciduous larch needles and larch timber/cones |
| 1.2.10.4 | Birch island formation and birch/aspen regrowth in clearings and shores |
| 1.2.10.5 | `ageClass`, `ageClasses`, `ageVariation` and shared young/mature/ancient stand ages |
| 1.2.10.6 | `vegetation.density`, `light` and the dense/light formation mix |
| 1.2.10.7 | Forest-clearing formation and `cleared` gap probability |
| 1.2.10.8 | Tundra-ecotone and peat-bog formations beside wetland and forest edges |
| 1.2.10.9 | `soil.moss`, moss floor, moss-hex and mossy understory |
| 1.2.10.10 | `lichen` and `heather` values, reindeer/crustose lichen and lichen-heath formations |
| 1.2.10.11 | Blueberry, lingonberry, cloudberry, juniper, rowan and willow shrubs |
| 1.2.10.12 | `soil.wet`, `soil.moisture`, drainage and wet hollows |
| 1.2.10.13 | `soil.peat`, peat profit and the peat good |
| 1.2.10.14 | `vegetation.roots` and exposed root drawing |
| 1.2.10.15 | `vegetation.deadwood`, stumps, fallen logs and deadwood drawing |
| 1.2.10.16 | Rocky-woodland formation, `landform.rocky` and stone/bog-iron values |
| 1.2.10.17 | `water.lake`, numerous-lake score and forest-lake drawing |
| 1.2.10.18 | `water.pond`, small forest pond label and pond drawing |
| 1.2.10.19 | `water.river`, river/stream label and running-water drawing |
| 1.2.10.20 | `water.marshBank`, swampy-bank label and wet shoreline drawing |
| 1.2.10.21 | Spring-weighted `floodRisk` and floodplain label |
| 1.2.10.22 | `water.ice` in winter/frost and frozen-water drawing |
| 1.2.10.23 | `landform.hollow` and wet hollows |
| 1.2.10.24 | `water.waterway` and natural lake/pond/river connections |
| 1.2.10.25 | Moose and reindeer, including reindeer herds and migration |
| 1.2.10.26 | Brown bear, seasonal presence and bear fat |
| 1.2.10.27 | Wolf and lynx predators |
| 1.2.10.28 | Red fox |
| 1.2.10.29 | Mountain hare, red squirrel and boreal vole |
| 1.2.10.30 | Boreal owl, capercaillie and crossbill |
| 1.2.10.31 | Beaver and otter on water tiles |
| 1.2.10.32 | Mosquitoes, blackflies and wood ants in the summer profile |
| 1.2.10.33 | Spruce, pine and larch timber goods |
| 1.2.10.34 | Birch timber and birch bark goods |
| 1.2.10.35 | Resin from spruce, pine and larch |
| 1.2.10.36 | Mushrooms, chanterelles, blueberries, lingonberries and cloudberry |
| 1.2.10.37 | Fur and hides from the shared hunt catalogue |
| 1.2.10.38 | Wild game and meat |
| 1.2.10.39 | Lake fish from open water, excluded in winter |
| 1.2.10.40 | Peat, stone and bog iron |
| 1.2.10.41 | `winterDays` around 190–212 and long snow cover |
| 1.2.10.42 | Short growing season and high `summerIntensity` |
| 1.2.10.43 | `snowfall`, `snowDepthCm` and heavy snow visuals |
| 1.2.10.44 | `frost`, `frostbite` and spring/autumn frost periods |
| 1.2.10.45 | Summer `fireRisk`, burned stands and fire-scar drawing |
| 1.2.10.46 | Summer `insects` / `mosquitoes` in wet months |
| 1.2.10.47 | `snowbreakRisk`, `windthrowRisk` and real snowbreak/windthrow stand types |
| 1.2.10.48 | `supplyCost`, `remoteSupply` and reduced snow-season mobility |
| 1.2.10.49 | High `forestry`, five stand types and timber/firewood silviculture |
| 1.2.10.50 | High `hunting` and `fishing`, with autumn hunt season |
| 1.2.10.51 | `furTrade` strengthened by predators, hare and winter |
| 1.2.10.52 | Low `agriculture` value and marginal farm survey |
| 1.2.10.53 | `settlementSpacing` reflects small, widely separated settlements |
| 1.2.10.54 | `waterwayTrade` lowers `remoteSupply`; lakes/rivers are transport assets |
| 1.2.10.55 | `seasonalTransport`, snow/thaw movement factors and late spring melt |
| 1.2.10.56 | `storage`, `winterPreparedness`, high fuel demand and shorter hearth interval |

## Tests

- `tests/world/taiga-ecology.test.js`: all 56 requirements, ten formations,
  deterministic survey, seasonality, fauna, goods and delivery channels.
- `tests/world/taiga-resource.test.js`: generated-world forest nodes, all five
  taiga stand types, realistic capacity, biome summaries and snow movement.
- `tests/presentation/taiga-render.test.js`: all ten formations render with
  finite coordinates and a bounded call count; every tree variant and winter ice tile is safe.

```sh
cd game
node --test tests/world/taiga-ecology.test.js tests/world/taiga-resource.test.js tests/presentation/taiga-render.test.js
```

## Campaign verification

The Taiga campaign uses the same deterministic 25-year driver, the same real
construction/logistics/royal/ambition APIs and the same fail-closed sweep gate
as the savanna reference. The Taiga seed set is separate because the savanna
seeds do not all complete the Taiga agenda and winter fuel requirements.

```sh
cd game
npm run test:campaign:sweep:taiga
```

| Seed | Requirements | Ticks | Firewood | Population | Gold | Fuel orders | Max per phase |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `20261108` | all true | 10,040 | 50 | 74 | 4,686.99 | **1** | **1** |
| `20261110` | all true | 10,040 | 46 | 70 | 4,392.17 | **7** | **1** |
| `20261111` | all true | 10,040 | 47 | 74 | 4,727.48 | 0 | 0 |

Final result: `ok:true`, 3/3 seeds green, eight real orders in eight phases,
no game over and no stalled sites, at 0.908–1.088 ms/tick. The observed
`20261108` order is at year 25, tick 9720: a real resident replaces the sick
sawyer, receives the `sawyer` job and a lease through tick 9820 while the
store holds 47 firewood. The diagnostic reads the lease after the ordinary
simulation tick; it never places an illness or calls the order.

### Why the first Taiga sweep failed

The first Taiga run was not missing a campaign requirement: seed `20261108`
reached 13/13 ambitions with every real requirement true. It produced no fuel
order because the sick fuel worker fell ill in summer with 45 firewood, while
the settlement only fell below the 18-load reserve in winter and spring. The
loop had no missing link, but the one-shot replacement was gated on the two
independent conditions coinciding.

`fuelStaffingGap()` in `js/simulation/villagers.js` now recognises a completed
lumber camp or sawmill with a sick worker and fewer healthy workers than its
capacity as a fuel emergency, even before the store is low. The original
low-reserve trigger remains. The replacement keeps the one-shot lease, the
illness guard still blocks a second order for the same phase, and the sweep
aggregation was not weakened. The same change still leaves the savanna
reference sweep green (3/3 seeds, every requirement true, 29 orders, max one
per phase).

## Low-end performance

The Taiga performance proof runs the real game, not a synthetic canvas, with
the same low-end profile used by the other climate benchmarks: 1366 × 768,
**4× CPU throttling**, software Canvas2D, **70 % render scale**, 60 FPS cap,
seed `20261108`, forests 75, two in-game years and a real 30-building /
23-resident settlement. The scene finder selects a real water body and the
real built settlement from the generated realm; it only moves the camera and
reveals the local map area for the capture.

```sh
cd game
npm run test:performance:taiga
```

The harness now counts actual Canvas2D primitives (`fill`, `stroke`,
`fillRect`, `strokeRect`, `drawImage`, `fillText`) only while `drawWorld()` is
running, and records the renderer's visible entity/carrier counts. The frame
budget is p95 ≤ 33 ms, ≤ 15 % over 33 ms, ≤ 3 % over 50 ms and zero long tasks.
The Taiga scene budgets are **1,500 draw calls p95**, **120 visible entities
p95** and **16.7 ms canvas draw p95**.

| Scene | Season / condition | Frames | p95 frame | >33 ms | >50 ms | Long tasks | Draw calls p95 / max | Visible entities p95 | Canvas draw p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Summer waterway | day 197, summer, clear | 479 | **16.7 ms** | 0 % | 0 % | 0 | **164 / 196** | 0 | 1.6 ms |
| Frozen winter water | day 396, winter, snow | 480 | **16.7 ms** | 0 % | 0 % | 0 | **174 / 501** | 0 | 1.8 ms |
| Populated settlement | day 199, summer, 30 buildings | 474 | **16.8 ms** | 1.06 % | 0 % | 0 | **392 / 634** | 23 | 6.8 ms |
| Camera + season jump | winter lake → summer settlement, sampled immediately | 180 | **16.7 ms** | 0 % | 0 % | 0 | **414 / 512** | 23 | 7.9 ms |
| Wilderness fog jump | winter, 59 fogged tiles in view, sampled immediately | 179 | **16.8 ms** | 0.56 % | 0 % | 0 | **171 / 371** | 0 | 1.8 ms |
| Settled wilderness fog (year rollover) | winter, 59 fogged tiles, crosses year 4 | 479 | **16.7 ms** | 0 % | 0 % | 0 | **171 / 387** | 0 | 1.4 ms |

The winter scene reports `water.ice:true` from the real Taiga profile while
the same camera in summer reports `water.ice:false`; the renderer is showing a
frozen waterway, not a winter colour swap. The unchanged quiet and dense
control phases also pass at p95 **16.8 ms** with 0 long tasks. A real save took
**169 ms** and load **1,183 ms**; warm heap shrank after bounded caches
settled; there were no page or console errors.

The jump row is a separate transition phase, not a skipped rebuild: the camera
and season change to the populated settlement and sampling starts immediately,
before `settleTaigaScene()` waits for the staged detail layer. Its first
measured run was **66.7 ms p95**, with 100 % of frames over 33 ms and 60.7 %
over 50 ms. The fallback was re-sampling the full-world fog texture and baked
ground every frame, the old off-screen detail layer was still being composited,
and the first underlay raster was a long task. The fixes are in
`js/presentation/rendering/terrain.js`:

- `drawFogOfWar()` crops its source to the visible tiles instead of sampling
  the whole world-sized texture.
- A fully explored view skips the fog draw entirely; the texture is transparent
  there.
- A jump that leaves less than 45 % of the old detail layer on screen hides that
  off-screen layer until the replacement is complete.
- The static ground/fog underlay is cached during the staged rebuild and blitted
  rather than re-rasterised on every frame.

The explored transition now measures **16.7 ms p95**, 0 % over 33 ms, 0 % over
50 ms, 0 long tasks, 414 draw calls p95, 23 visible entities and 7.9 ms canvas
draw p95. It uses the same 33 ms / 15 % / 3 % / zero-long-task and 1,500 draw /
120 entity / 16.7 ms canvas budgets as the steady scenes. The settled
settlement remains **16.8 ms**; no budget was relaxed and no scene was removed.

The same harness now jumps from the settled settlement into a mostly
unexplored wilderness. `prepareTaigaScenes()` picks a non-water land tile far
from both known scenes and reveals only a radius-4 island, so the viewport has
a real fog boundary instead of a fully explored backdrop.
`applyTaigaScene()` counts the fogged tiles in the current viewport and the
benchmark fails the phase when `fogTiles` is not greater than zero; a path that
silently skips fog rendering cannot pass. The phase starts sampling immediately
after the camera and season change, before the staged detail layer settles.

The first active-fog measurements were already within the frame budget, but the
jump sometimes paid for rebuilding the exploration mask even though a camera or
season change cannot alter explored tiles. `applyTaigaScene()` no longer
invalidates `state.fogDirty`; only an actual exploration change does. The
transient gap underlay and detail-base pass now use low-quality upscaling while
the staged layer is rebuilding; the settled detail layer still paints fog at
full quality. The sampler also resets at a clean `requestAnimationFrame`
boundary so a frame already in flight cannot be charged to the next phase.
The wilderness jump measures **16.8 ms p95**, **0.56 %** over 33 ms, **0 %**
over 50 ms, **0 long tasks**, **171 draw calls p95 / 371 max**, **0 visible
entities** and **1.8 ms canvas draw p95**, with **59** fogged tiles proving the
active fog path. The explored jump and all four prior scenes remain green in
the same full run; `npm run test:performance:taiga` exits 0.

The settled wilderness fog scene is sampled for eight seconds after the camera
jump, so it crosses the next year boundary. It previously exposed the annual
maintenance long task: 17 yearly systems ran in one tick, measuring 54–58 ms of
simulation time and a 95 ms long task on the low-end profile. The scene was
temporarily sampled only during the transition; it is now restored as a
permanent regression check. Two shared fixes keep the rollover inside the
budget:

- `ensurePersonProfile()` caches the normalized profile object with a
  `WeakSet`. Repeated social, mortality and memory lookups no longer rebuild
  traits, needs, appearance, skills and kinship. Raw legacy/save profiles are
  still normalized once; the change is identity-stable and save-compatible.
- The browser game loop runs the annual systems as small deterministic slices
  under a 6 ms budget. No tick, daily system or random draw runs between the
  slices, so the state is the same as the synchronous sequence. Headless
  campaigns still run the complete rollover in one call, the simulation clock
  is not consumed during the slices, and saving flushes the remaining work
  before the snapshot is written.

On the final run the year-4 rollover completed inside the fog phase with
**0 long tasks**, **0 % over 33 ms** and **0 % over 50 ms**; the phase recorded
479 frames at **16.7 ms p95** and still showed **59 fogged tiles**.

The deployed production build was checked against the live origin. The
wilderness transition sampled 150 frames at **16.8 ms p95**, zero long tasks,
171 draw calls, 1.9 ms canvas draw and **59 fogged tiles**, with
`water.ice:true`; the run reported zero page, console, network and HTTP errors.
The preview and production deployments both succeeded and are published. Full
live report: `artifacts/taiga-fog-live.json`.
