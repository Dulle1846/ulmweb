# Snowlands 1.2.15

Snowlands is a real fourteenth climate, not a white filter painted over tundra.
One deterministic profile derived from seed, position, height, slope, aspect,
season, weather, wind and land use feeds the terrain bake, detail renderer,
survey, gathering, movement, supply, hazards and the spring thaw. There is no
second tick loop and no per-frame ecology simulation.

## Implementation

- **Ecology:** `game/js/world/snow-ecology.js` exports `snowProfileAt()`,
  `snowPotentialAt()`, `isSnowSite()`, `snowProductsAt()`,
  `snowRequirementAudit()`, `SNOW_REQUIREMENTS` (1.2.15.1–1.2.15.69), seventeen
  named formations and the shared snow flora, fauna, goods and weather fields.
- **Climate:** **Snowlands** is selectable in world creation. `terrain-model.js`
  raises broad high shoulders above an ice-scoured shore and bakes a pale
  snow surface; `season.js` keeps a permanent snow cover with a real spring
  melt curve; `weather.js` gives snow, snowstorms, clear cold breaks and wet
  spring snow their own weights; `terrain-palette.js` keeps the palette pale
  through the year.
- **Landforms (1.2.15.1–1.2.15.9):** snowy forest, open snowfield, snow-covered
  grassland, alpine snowfield, frozen plateau, frozen valley, wind-scoured
  snow, permanent snow, snowy coast. Passes, avalanche slopes, forests and
  coasts are continuous profile fields rather than one tile stamp.
- **Snow surfaces (1.2.15.10–1.2.15.19):** fresh powder, packed snow, ice
  crust, wet spring snow, wind drifts, hummocks, exposed ground, depth in
  metres, tracks and drifts against buildings and rocks. The ground renderer
  paints the same fields the survey reports.
- **Water and ice (1.2.15.20–1.2.15.28):** frozen lakes and rivers, icicles,
  ice sheets, small icefalls, icy rocks, frost patterns, ice edges, spring
  breakup and winter ice cover. Rivers are marked separately from lakes.
- **Flora (1.2.15.29–1.2.15.36):** snow-laden conifers, leafless deciduous
  trees, snow-covered shrubs, low winter grasses, exposed lichens and mosses,
  plants under the snow, wind-sheltered vegetation and per-plant snow loads.
- **Fauna (1.2.15.37–1.2.15.44):** winter coats, ptarmigan, foxes, wolves,
  winter-active deer and elk, subnivean rodents, seasonal migrations and
  hibernation/rest states. The renderer draws bounded fauna marks; the survey
  records the species.
- **Weather (1.2.15.45–1.2.15.53):** snowfall intensity, snowstorms, icy wind,
  fog, frost, hoarfrost, blizzards, visibility loss and the alternating clear
  and overcast winter sky. Weather is derived from the shared weather state and
  the same profile used by rendering.
- **Movement and supply (1.2.15.54–1.2.15.62):** deep snow raises movement
  cost, icy roads slow travel, supply is restricted, frostbite is a real
  health risk, blizzards cut visibility, avalanches threaten mountain ground,
  springs freeze, passes close seasonally and insulated/stable buildings have
  higher winter hardiness. `resource-geography.js` consumes the profile through
  a bounded per-tile movement cache; `snow-hazards.js` runs one annual pass over
  at most 96 occupied, road and wild candidates.
- **Spring thaw (1.2.15.63–1.2.15.69):** spring snowmelt, exposed ground, muddy
  roads, swollen rivers, temporary meltwater lakes, elevation/sun-driven snow
  retreat and different north/south aspect melt. These are fields on the same
  profile and drive the renderer's meltwater and breakup details.
- **Rendering:** `game/js/presentation/rendering/snow-render.js` draws only
  explored detail tiles: snow patches, powder, crust, exposed earth, drift
  bands, tracks, frost, icy rocks, snow banks, frozen water, ice edges,
  breakup, conifers, bare trees, shrubs, grasses, lichen, fauna, icefalls and
  meltwater. All loops are capped and the layer uses the existing detail
  lattice.
- **Gathering and economy:** snow products reuse the shared goods register and
  ledger. `snowProductsAt()` rejects open water and slices to nine goods;
  `forest-gathering.js` checks Snowlands before the other climate product
  paths. Snow woodland is a sparse timber belt in `resource-geography.js`.
- **Persistence:** no new save schema is required. The ecology is pure and
  derived; old saves load unchanged and a Snowlands realm stores only the
  existing world options.

## Verification

`node scripts/snow-audit.mjs` generates a real 176×176 Snowlands world,
surveys every tile through all four seasons and clear, snow, storm and fog
weather, gathers a real snow product and drives the annual avalanche pass
against a placed house. The checked audit is **69/69 working**, all seventeen
formations observed, gathering successful and a real building destroyed. It
writes [`../../artifacts/SNOW_1.2.15_AUDIT.md`](../../artifacts/SNOW_1.2.15_AUDIT.md)
and [`../../artifacts/snow-audit.json`](../../artifacts/snow-audit.json).

Focused test: `node --test tests/world/snow-ecology.test.js`.
Full suite: `npm test`.
Campaign: `npm run test:campaign:snow` (seed 20261215, Royal Ascendancy). It
reaches 10,040 ticks, year 26, 70 residents, 70+ gold, 38 firewood, all 13
ambitions, one era stage with material feedback, no stalls and no game over.
