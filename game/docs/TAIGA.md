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
  finite coordinates and a bounded call count; every tree variant is safe.

```sh
cd game
node --test tests/world/taiga-ecology.test.js tests/world/taiga-resource.test.js tests/presentation/taiga-render.test.js
```
