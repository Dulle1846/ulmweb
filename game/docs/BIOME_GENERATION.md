# Biome generation and visual quality (1.2.22)

**Status:** implemented in 3.48.0.

1.2.22 turns the continuous terrain field into a stable biome identity and a
vegetation layer that a player can read from the normal camera. It is a reader
over the shared height, moisture, temperature and river arrays: one coarse
identity map per realm, one compact profile per atlas region, and no per-tile
object graph or second simulation loop.

## What the player sees

- The **Biome resources & wildlife** tab now opens each discovered region with a
  **BIOME GENERATION · 1.2.22** block: dominant biome, patch structure, organic
  boundary share, plant mix, habitat and the LOD contract.
- A collapsible **FULL GENERATION LEDGER · 54 PARAMETERS** prints one live value
  and one evidence line for every point in the table below.
- The baked ground is a **bilinear blend of the four surrounding biome
  palettes**, not four-tile colour blocks. Each biome also carries its own water
  tint, deterministic surface grain and a hillshade baked once per realm, so
  sand, peat, scree, leaf litter and open water keep different surfaces at the
  closest camera.
- The seasonal overlay takes the **seasonal face of each biome cell** instead of
  one global seasonal sheet. Spring blossom, summer deep shade, autumn copper
  and winter frost therefore meet in soft ecotones; the panel prints all four
  faces as colour swatches beside the live values.
- `biome-identity-render.js` draws one **landmark silhouette per discovered
  atlas region** — drowned tower, salt spit, ice cairn, standing stone, frost
  mound, great spruce, sunken shrine, wind arch, kurgan, great oak, hollow tree
  and giant fig — plus a bounded plant vignette and up to 140 atmosphere motes.
  Anchors are deterministic, prefer explored land and are cached until discovery
  changes.
- The panel prints the **plant palette** with real species, colours, form and
  variant count, so the registry is readable in play rather than only in tests.
- The existing seasonal foliage, per-biome renderers, special-biome atlas,
  ecotone renderer and forest LOD remain the drawing paths. 1.2.22 gives them a
  central definition and a measurable quality contract instead of a second
  visual language.

## Generation model

`js/world/biome-generation.js` samples nine environmental fields: height,
moisture, temperature, slope, distance to water, elevation above sea level,
light, soil and a low-frequency regional climate bias. Each biome has a niche
centre in that space; two scales of coherent noise warp the climate values and
a low-frequency preference makes one formation dominate a district. Boundaries
follow the contour of the real field, so a biome edge is organic by
construction. Beaches are a geometric ribbon along the actual carved shore.

`analyzeBiomeGrid` measures the result instead of asserting it: biome counts,
connected patches, patch size distribution, bounding-box fill (rectangularity),
boundary complexity, chequerboard blocks, isolated cells and transition share.
The panel prints the same numbers the tests assert.

Vegetation is chosen by biome first, then by soil, moisture, light, elevation,
season and human pressure. Each species carries several crown forms, age
stages, orientations and a cluster bias; a low-frequency grove field produces
groves and clearings, and settlement, farming, mining and clearing thin the
layer without changing species identity.

## Point table

| Point | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1.2.22.1 | Biomes generated from several environmental parameters | implemented | biome-generation.js#biomeEnvironmentAt uses height, moisture, temperature, slope, water distance, elevation, light, soil and regional bias |
| 1.2.22.2 | No simple rectangular biome areas | implemented | biome-generation.js#analyzeBiomeGrid measures bounding-box fill; profiles keep max fill below a rectangle |
| 1.2.22.3 | No artificial chequerboard patterns | implemented | biome-generation.js#classifyBiome uses coherent noise only; analyzeBiomeGrid#checkerRatio is audited |
| 1.2.22.4 | Organic borders and intermediate zones | implemented | biome-generation.js#classifyBiome two-scale warp; transition-biomes.js#transitionAt provides the ecotone band |
| 1.2.22.5 | Different patch sizes and shapes | implemented | biome-generation.js#analyzeBiomeGrid patch size/deviation and boundary complexity |
| 1.2.22.6 | Regional coherence and plausible distribution | implemented | biome-generation.js low-frequency region bias and preference; biome-resource-state.js#generateBiomeAtlas |
| 1.2.22.7 | Elevation and water bodies considered | implemented | biome-generation.js#biomeEnvironmentAt elevation, slope, waterDistance; beach shore ribbon |
| 1.2.22.8 | Cooperation with terrain generation | implemented | world.js#initWorld reads the shared height/moisture/temperature arrays and river carve |
| 1.2.22.9 | Plants chosen according to biome | implemented | biome-generation-data.js#PLANTS_BY_BIOME and biome-generation.js#vegetationAt |
| 1.2.22.10 | Spatially plausible plant distribution | implemented | biome-generation.js#vegetationAt grove field, suitability and clearings |
| 1.2.22.11 | Several plant variants | implemented | biome-generation-data.js#BIOME_PLANTS every species carries at least three variants |
| 1.2.22.12 | Different sizes, orientations and age stages | implemented | biome-generation-data.js#BIOME_PLANTS size, ages, orientations; vegetationAt stage scale |
| 1.2.22.13 | No conspicuous repetition | implemented | biome-generation.js#vegetationAt position/seed rolls; analyzeBiomeGrid repetition metrics |
| 1.2.22.14 | Natural grouping into clumps and groves | implemented | biome-generation.js#vegetationAt low-frequency grove field and cluster classification |
| 1.2.22.15 | Dependence on soil, moisture and light | implemented | biome-generation-data.js#BIOME_PLANTS tolerance bands; vegetationAt#speciesSuitability |
| 1.2.22.16 | Seasonal plant variants | implemented | biome-generation-data.js#BIOME_PLANTS seasons; vegetationAt filters active species |
| 1.2.22.17 | Different vegetation densities | implemented | biome-generation.js#vegetationAt density from moisture, soil, grove and land use |
| 1.2.22.18 | Buildings and human intervention respected | implemented | vegetationAt humanPressure from settlement, farming, mining, clearing |
| 1.2.22.19 | Every biome recognisable from the normal camera | implemented | biome-generation-data.js#BIOME_IDENTITY palette, silhouette and landmark per biome; biome-identity-render.js#drawBiomeIdentityOverlay |
| 1.2.22.20 | Own colour palette per biome | implemented | biome-generation-data.js#BIOME_IDENTITY twelve distinct palettes; world.js#prerenderTerrain bilinear blend; palette distance audited |
| 1.2.22.21 | Own vegetation silhouettes | implemented | biome-generation-data.js#BIOME_IDENTITY silhouettes and BIOME_PLANTS silhouette rows; biome-identity-render.js plant glyph forms |
| 1.2.22.22 | Own ground and surface textures | implemented | biome-generation-data.js#BIOME_GROUND_GRAIN; world.js#prerenderTerrain per-biome grain |
| 1.2.22.23 | Own atmospheric effects | implemented | biome-generation-data.js#BIOME_ATMOSPHERE; biome-identity-render.js#drawBiomeIdentityOverlay bounded motes and screen haze |
| 1.2.22.24 | Own water and moisture presentation | implemented | biome-generation-data.js#BIOME_IDENTITY waterLook rows; biome-generation.js#BIOME_WATER_TINT_COLORS bilinear water palette |
| 1.2.22.25 | Own seasonal appearance | implemented | biome-generation-data.js#BIOME_IDENTITY seasons; terrain.js#seasonalTintOverlay per-biome faces; panel season swatches |
| 1.2.22.26 | Distinct landmarks for important biomes | implemented | biome-generation-data.js#BIOME_IDENTITY landmark row per biome; biome-identity-render.js twelve landmark silhouettes and anchors |
| 1.2.22.27 | Visually independent fantastic biomes | implemented | biome-generation-data.js#SPECIAL_BIOME_LOOKS and special-biomes.js families |
| 1.2.22.28 | Vegetation detail depends on camera distance | implemented | biome-generation-data.js#BIOME_LOD tiers; terrain.js forest sprite/crown LOD |
| 1.2.22.29 | LOD system for trees and larger plants | implemented | BIOME_LOD detail/simplified/impostor thresholds; forest-detail-reference.mjs |
| 1.2.22.30 | Simplified representation of distant vegetation | implemented | BIOME_LOD impostor tier; terrain.js canopy marks beyond the impostor zoom |
| 1.2.22.31 | Instancing and efficient reuse | implemented | shared crown/trunk sprite cache and per-biome palette reuse in terrain.js; cached landmark anchors |
| 1.2.22.32 | Bounded particle effects | implemented | BIOME_LOD.maxParticles and a 140-mote budget across all visible biome anchors |
| 1.2.22.33 | Efficient shadow calculation | implemented | baked ground hillshade plus contact crown and landmark shadow cadence in BIOME_LOD |
| 1.2.22.34 | No unnecessary simulation of single grass blades | implemented | grass is a density/texture field; no blade entity exists |
| 1.2.22.35 | Ecological simulation on a suitable abstraction level | implemented | 36 compact atlas regions and one annual pass; no per-tile ecology loop |
| 1.2.22.36 | Detail without hurting large maps | implemented | coarse biome identity map and terrain resolution scaling to 576×576 |
| 1.2.22.37 | Unique internal identifier for every biome | implemented | biome-generation-data.js#BIOME_IDENTITY uses stable biome.<key> ids |
| 1.2.22.38 | Central management of biome definitions | implemented | biome-generation-data.js owns palette, texture, plants, habitat, hazard and LOD |
| 1.2.22.39 | Plants assigned to biomes and conditions | implemented | BIOME_PLANTS biomes and tolerance rows; plantsForBiome |
| 1.2.22.40 | Own habitat definitions for animal species | implemented | biome-generation-data.js#BIOME_HABITATS links to the existing wildlife catalog |
| 1.2.22.41 | Resources linked to biome and site requirements | implemented | biome-generation-data.js#BIOME_RESOURCE_REQUIREMENTS derived from BIOME_RESOURCES |
| 1.2.22.42 | Hazards triggered by traceable conditions | implemented | biome-generation-data.js#BIOME_HAZARD_TRIGGERS conditions and hazard catalogue mechanics |
| 1.2.22.43 | Central definition of seasonal variants | implemented | BIOME_IDENTITY seasons plus cross-biome-data.js#BIOME_SEASONS |
| 1.2.22.44 | New biomes without extensive changes | implemented | one registry entry covers identity, plants, habitat, hazards and LOD |
| 1.2.22.45 | Every biome tested individually | implemented | tests/world/biome-generation.test.js classifies all twelve biomes |
| 1.2.22.46 | Every biome checked in several seasons | implemented | tests/world/biome-generation.test.js seasons; biome-seasonal-visual.mjs |
| 1.2.22.47 | Transitions between relevant biome pairs checked | implemented | transition-biomes.js pair matrix and tests/world/transition-biomes.test.js |
| 1.2.22.48 | Vegetation distribution examined for repetition | implemented | tests/world/biome-generation.test.js species/variant distribution and field metrics |
| 1.2.22.49 | Resources checked for plausible distribution | implemented | BIOME_RESOURCE_REQUIREMENTS audit and region resource match |
| 1.2.22.50 | Animal species checked against habitats | implemented | tests/world/biome-generation.test.js every wildlife species has a habitat |
| 1.2.22.51 | Hazards checked for traceable triggering | implemented | tests/world/biome-generation.test.js every trigger names a catalogue mechanic |
| 1.2.22.52 | Performance checked on large maps | implemented | tests/world/biome-generation.test.js budget and anchor timing; low-end-performance.mjs; browser frame probe |
| 1.2.22.53 | No visible biome borders or rendering errors | implemented | continuous bilinear ground blend, per-biome ecotone wash, cached anchors; browser references with zero page errors |
| 1.2.22.54 | No regression of terrain, building or economy systems | implemented | shared arrays and atlas records untouched; full npm test and campaign gate |
