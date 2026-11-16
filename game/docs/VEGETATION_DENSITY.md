# Vegetation Density — 1.2.18

**Feature:** `1.2.18.1–1.2.18.70` plus **18 structure measurements**
**Module:** `game/js/world/vegetation-density.js`
**Renderer:** `game/js/presentation/rendering/terrain.js`, `swamp-render.js`, `desert-render.js`
**Survey:** Explore → `1.2.18 · VEGETATIONSDICHTE IM BIOM`
**Persistence:** none; every value is derived from existing world state

## Coverage at a glance

All **70/70** official points are implemented in the runtime profile and exposed
through the survey. The active count for one tile is smaller because a tile can
only satisfy a subset at once (a dense forest core is not also a bare mudflat).
The 70 are backed by these existing consumers:

| Group | IDs | Runtime evidence |
| --- | --- | --- |
| Density bands | 1–5 | `VEGETATION_DENSITY_BANDS`, tree/shrub/sward counts and colours |
| Pattern | 6–10 | three coherent noise scales, gap field, clearing and edge values |
| Woodland | 11–18 | `stand.canopy`, age class, clearing, understory, deadwood, tree and LOD renderer |
| Grassland | 19–26 | `sward` density/height, bloom, shrub patches, grazing use and wet/dry tint |
| Arid | 27–33 | desert `vegetation.density`, shrub cover, oasis, local hollow/arroyo and rock/sand contrast |
| Wetland | 34–41 | swamp water, reeds, plant islands, bank, channel, swamp forest and mud |
| Drivers | 42–53 | soil, water, light, competition, age, season, browsing, grazing, logging, fire, disease, regrowth |
| Gameplay | 54–62 | sight/movement/cover/hiding/hunting/yield/fire/farm/habitat values and consumers |
| Visual | 63–70 | irregular placement, island groups, height/colour variation, layer overlap and camera LOD |

No official point is only a manifest label. Points **54–57** are exported to the
survey and the forest-gathering result, but they do not rewrite every villager
step; resident errands deliberately keep their historical timing. Point **59**
keeps timber outside the density yield contract, while plant/food gathering does
use the local factor.

## What the layer does

A biome is not a uniform field. The density layer adds a local structure inside
the existing forest, grassland, steppe, desert, tundra, taiga, swamp, coast,
mountain, volcano and snow profiles:

- five readable density bands: very sparse, loose, moderate, dense, extremely
  dense;
- coherent groups, irregular single plants, natural gaps and clearings;
- woodland cores, open edges, young regrowth, old open woods, thick understory,
  high canopy, tree groups and dead/missing trees;
- short turf, tall grass, flower meadows, barren pasture, shrub islands, grazed
  ground, wet meadows and dry patchy grass;
- bare sand/rock, isolated shrubs, plant islands, depression vegetation, oases,
  seasonal watercourses and sand/rock contrast;
- open water, loose and dense reeds, wetland plant islands, vegetated banks,
  free channels, swamp forest and bare mud;
- drivers: soil, water, light, competition, age, season, browsing, grazing,
  logging, fire, disease/pests and natural regeneration;
- gameplay: sight, movement cost, cover, concealment, hunting, wood/plant
  resources, fire risk, agricultural usability and animal habitat;
- visual: no repeated stamp, no even distribution, organic clusters, height and
  colour variation, natural gaps, layer overlap and camera-distance LOD;
- 18 additional structure facets: canopy closure, understory, shrub and herb
  layers, litter, deadwood, standing deadwood, seedlings, canopy gap, edge,
  interior core, relief, slope, rock, water, reed, mud and site wetness;
- named microhabitats (dense canopy core, canopy gap, woodland edge,
  regeneration island, deadwood pocket, flower aspect, shrub island, damp
  hollow, slope thicket, open water, free channel, reed bed/fringe, plant
  island, mudflat, oasis, arroyo and rock desert) shown in the survey.

## Deterministic construction

`vegetationDensityAt(x, y, context)` combines three world-anchored coherent
noise scales with the already derived stand/sward and land-use state. A warped
coarse field makes vegetation groups; a middle field breaks them into islands;
a fine field roughens the edge. A separate gap field removes small openings.

The function is pure for a fixed seed, tile and context. It does not scan the
map, mutate state or add a tick loop. The existing `forestStandAt`,
`grasslandProfileAt`, desert/swamp profiles and succession records remain the
source of species, landform and disturbance information.

A bounded local relief sample adds four neighbouring height reads. Their
relative difference gives slope, relief, ridge and depression values, while a
north/south comparison supplies a warm/cool aspect. The centre height is
baseline-corrected, so a test or consumer that passes a climate-test height
does not manufacture a fake crater. Depressions hold more vegetation, ridges
and steep faces hold less; a genuine hollow can open an arroyo in desert or a
free channel in wetland.

## Rendering

The terrain decoration loop calls the density layer only on tiles it was already
going to sample. `vegetationForestStand()` and `vegetationGrassProfile()` then
adjust the existing profile values:

- forest tree chance, canopy, clearing, visibility, understory, deadwood, fire
  risk, browsing pressure and tree height;
- grass sward density, height band, bloom, shrub patches, tree groups, colour
  tint and blade gap;
- desert `vegetation.density`, shrub cover, cover and tree chance;
- swamp `vegetation.density`, cover and reed count; open water and free channels
  now become real standing-water surfaces, suppress reeds, and expose bare mud;
- desert local hollows and arroyos draw a dry wash; damp depressions get a
  darker, greener soil patch before the existing tufts and shrubs.

`vegetationDetailForZoom()` is the shared LOD contract. At landscape distance
the existing coarse lattice and single-tree impostor remain in charge. Closer
camera levels add understory, overlapping crowns, height variation and the
bounded grass layers. The extra copies are capped at three per tile.

## Gameplay coupling

- `forestProductsAt()` exposes the same profile as the renderer and applies its
  plant/food yield factor to player-triggered visits; hunting goods also receive
  the local hunting factor. Timber deliberately keeps its established stock
  contract so a century of forestry remains balanced.
- `getRouteMovementFactorAt()` multiplies the existing terrain and ecotone route
  cost by the local density movement factor. Resident errands intentionally keep
  their historical timing so the long demographic campaign stays stable.
- `ecotoneHarvestFactor()` applies a small agricultural multiplier derived from
  the local density profile. It stays within `0.995–1.005`, is bounded, and is
  never stored on the field.
- Sight, cover, concealment, hunting, fire risk, habitat quality, wood and
  forage are exported for the survey and future consumers. No combat or save
  field is fabricated to carry them.

## Survey

The Explore tab shows the active tile's band, density, canopy, understory,
light, habitat, drivers and effects. It now also shows 18 structure facets and
the recognised microhabitat labels. The five-band strip is sampled from a
bounded 17×17 window, so the player can see that the same landscape contains
different densities. The summary reads **UMGESETZT 70 / 70**; the active count
still reports the subset true at the selected tile. The complete manifest is
available in the collapsible list and active points are highlighted.

## Verification

- Focused density suite: `11/11` in `game/tests/world/vegetation-density.test.js`.
  The renderer branches are exercised by the desert and wetland suites as well.
- Full suite: `1114/1114` (`npm test`), including syntax, relative imports and
  referenced UI ids over 174 source files.
- 25-year campaign: `npm run test:campaign` completed **10,040 ticks** at
  **0.649 ms/tick** with every requirement met.
- 60-year biome endurance: `npm run test:endurance:60` completed **24,040 ticks**
  at **0.713 ms/tick**, with save round-trips including and excluding the biome
  block.
- Browser reference: `npm run test:terrain-reference` rebuilt all **34 frames**
  on seed `20261104` (four seasons × four zoom levels, ten transition days and
  the eight-day tree-year grove) and passed the Chromium/WebGL preflight.
- Browser survey check on seed `20261104`: tile `84:84`, `70 / 70` implemented,
  **18** structure facets, **21 / 70** active points, **2** microhabitats, all
  **70** manifest rows and **14** drivers present, with no console errors.

The density layer adds no save schema changes. Existing saves load unchanged;
the rendered field and survey are rebuilt from the seed and current ecology.
