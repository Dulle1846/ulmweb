# Vegetation Density — 1.2.18

**Feature:** `1.2.18.1–1.2.18.70`
**Module:** `game/js/world/vegetation-density.js`
**Renderer:** `game/js/presentation/rendering/terrain.js`
**Survey:** Explore → `1.2.18 · VEGETATIONSDICHTE IM BIOM`
**Persistence:** none; every value is derived from existing world state

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
  colour variation, natural gaps, layer overlap and camera-distance LOD.

## Deterministic construction

`vegetationDensityAt(x, y, context)` combines three world-anchored coherent
noise scales with the already derived stand/sward and land-use state. A warped
coarse field makes vegetation groups; a middle field breaks them into islands;
a fine field roughens the edge. A separate gap field removes small openings.

The function is pure for a fixed seed, tile and context. It does not scan the
map, mutate state or add a tick loop. The existing `forestStandAt`,
`grasslandProfileAt`, desert/swamp profiles and succession records remain the
source of species, landform and disturbance information.

## Rendering

The terrain decoration loop calls the density layer only on tiles it was already
going to sample. `vegetationForestStand()` and `vegetationGrassProfile()` then
adjust the existing profile values:

- forest tree chance, canopy, clearing, visibility, understory, deadwood, fire
  risk, browsing pressure and tree height;
- grass sward density, height band, bloom, shrub patches, tree groups, colour
  tint and blade gap;
- desert `vegetation.density`, shrub cover, cover and tree chance;
- swamp `vegetation.density`, cover and reed count; open water is a real gap in
  the reeds.

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
light, habitat, drivers and effects. The five-band strip is sampled from a
bounded 17×17 window, so the player can see that the same landscape contains
different densities. The complete 70-point manifest is available in the
collapsible list; active points are highlighted for the selected tile.

## Verification

- Focused density suite: `9/9` in `game/tests/world/vegetation-density.test.js`.
- Full suite: `1111/1111` (`npm test`), including syntax, relative imports and
  referenced UI ids over 174 source files.
- 25-year campaign: `npm run test:campaign` completed **10,040 ticks** at
  **0.754 ms/tick** with every requirement met.
- 60-year endurance: `npm run test:endurance:60` completed **24,040 ticks** at
  **0.796 ms/tick**, with save round-trips including and excluding the biome
  block.
- Browser reference: `npm run test:terrain-reference` rebuilt all **34 frames**
  on seed `20261104` (four seasons × four zoom levels, ten transition days and
  the eight-day tree-year grove) and passed the Chromium/WebGL preflight.

The density layer adds no save schema changes. Existing saves load unchanged;
the rendered field and survey are rebuilt from the seed and current ecology.
