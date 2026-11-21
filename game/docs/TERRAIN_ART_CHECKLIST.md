# Terrain art checklist 1.1

This is the current implementation audit for **1.1 Grundlegende Terrain-Grafik**. It maps each checklist item to the code and the evidence that protects it. The visual baseline is [TERRAIN_VISUAL_REFERENCE.md](TERRAIN_VISUAL_REFERENCE.md), generated with the production Canvas2D renderer; the optional WebGL atlas path is covered by its own contract and atlas tests.

| Item | Status | Implementation | Evidence / remaining limit |
|---|---|---|---|
| 1.1.1 Pixelige Terrain-Darstellung | **Implemented** | WebGL2 terrain reconstructs the compact height field with a Catmull-Rom patch and analytic derivatives; the Canvas2D fallback uses high-quality smoothing instead of nearest-neighbour scaling. | `terrain-webgl.js` `sampleBicubic` / `drawBakedGround`; terrain seam tests; visual reference at all four zoom levels. |
| 1.1.2 Hochwertige Terrain-Sprites und Texturen | **Implemented** | A deterministic 2048 × 1024 atlas contains four seamless 256 px variants for grass, forest, rock, sand, snow, earth and wetland. The shader uses relief, macro contrast and fine-crust channels. The sand material receives both the close-view coastal fringe and the previously unused arid weight. | `terrain-atlas.js`; five atlas tests; shader-path contract; visual reference. The atlas is procedural by design rather than a downloaded bitmap pack. |
| 1.1.3 Organische Übergänge | **Implemented** | Domain-warped elevation, moisture and temperature fields drive normalized material weights. Water uses a smoothed signed-distance field, and a noise-broken sand fringe covers low shores at close zoom. The shore-distance unit now follows each world's resolution instead of a hard-coded four samples per tile. | `terrain-webgl.js` material weights, `buildWaterDistance`; three shore-distance regression tests; visual reference. |
| 1.1.4 Keine sichtbaren Kachelgrenzen | **Implemented** | Atlas painters use periodic noise and seamless tilers; the shader cross-fades variants; height/moisture reconstruction is smooth rather than tile-quantized. | `terrain-atlas.test.js` checks every channel and seam; `terrainSeamSpikes` in `terrain-depth.test.js`; visual review. |
| 1.1.5 Mehrere Varianten derselben Terrainart | **Implemented** | Four contiguous atlas variants per material are selected by a slow region noise and cross-faded in a ring, including the wrap between variant 3 and 0. | `TERRAIN_ATLAS_TILES` and `groundDetail`; contiguity/distinctness tests. |
| 1.1.6 Unterschiedliche Texturen und Oberflächenstrukturen | **Implemented** | Each material has its own painter, scale and channel response: grass clumps/blades, forest canopy/litter, rock strata/cracks, sand ripples/grit, snow drifts/sparkle, earth clods/grain, wetland pools/reeds. | `terrain-atlas.js` painters; per-channel variance tests; visual reference. |
| 1.1.7 Licht- und Schatteneffekte | **Implemented** | Directional sun shading, soft cast-height shadows, baked ambient occlusion, seasonal sun elevation and close-view water-crest highlights. Trees and buildings carry their own grounded shadows on the overlay. | `sunState`, `uAO`, shader shadow march and crest path; `terrain-ao.test.js`; `terrain-shader-contract.test.js`; visual reference. Full screen-space shadows for every prop are not claimed. |
| 1.1.8 Höhenunterschiede sichtbar | **Implemented** | Hillshade, ambient occlusion, normal/diffuse lighting and slope hachures at map zoom make the smoothed height field legible. Shore stairs are explicitly flattened into banks. | Shader contour/hachure block; `terrain-ao.test.js`; visual reference. |
| 1.1.9 Abnutzung durch menschliche Aktivität | **Implemented** | A persistent wear field is stamped by roads and building footprints, builds up while they exist and recovers slowly. Roads, fields and buildings are drawn from the same world data. | `terrain-wear.js`; four wear tests; shader wear tint. |
| 1.1.10 Jahreszeitenabhängige Optik | **Implemented** | Continuous season curves drive palette, sun and effects: snow accumulates through late autumn, peaks in winter and melts through early spring; leaf litter and green-up follow their own ramps. Palette colours are anchored mid-season, trees turn and drop per tree and species (oaks hold brown leaves, conifers stay green), and weather is season-gated so summer cannot snow. Five climate profiles shift the same curves: northern snow arrives earlier and melts later, mediterranean and arid winters hold less snow, and per-species snow retention lets conifers keep their load while birches shed it early. Bare crowns use tapered limbs and snow-tipped twigs; conifers use four snow-bearing tiers. | `world/season.js`, `terrain-palette.js`, `seasonal-foliage.js`, `weather.js`; season, weather and foliage tests; `season-year.json`; `climate-reference.json`, `climate-live.json`; transition, grove and both climate sheets. |

## Canvas woodland close-up — 3.30.0

The 1.1 surface checklist is joined by a dedicated close-view woodland pass.
It affects the Canvas detail layer at rooftop/interior zoom, not the simulated
stand data or the WebGL ground.

| Item | Status | Implementation | Evidence / remaining limit |
|---|---|---|---|
| Colour pipeline validity | **Implemented** | `rgbTriplet` parses `rgb()`/`rgba()` as well as hex and returns black for malformed input. `mixHex` can therefore be chained on its own output; the previous NaN triplet kept the last Canvas `fillStyle` and produced ghost crowns. | `terrain.js` `rgbTriplet` / `mixHex`; terrain reference sheets and spec audit. |
| Broadleaf crowns and trunks | **Implemented** | Deterministic `crownSilhouette` / `traceCrown` build irregular, layered washes with internal lobes, leaf tips, darker under-washes, short pen hatching and a broken ink rim. At gameplay distance the crown gets a larger silhouette and a dark under-print; dense stands overlap crowns from `0.75×`. Limbs remain visible outside the wash. Trunks taper, with bark ridges, roots, hollows, broken limbs and separate lit/shadow faces. | `drawBroadleaf`; `player-view.png` (real `1.00×` player camera), `player-view-hero.png`, `tree-seasons.png` (2.40× inspection) and `forest-seasons.png`. Crowns remain procedural, not authored bitmaps. |
| Birch and conifer silhouettes | **Implemented** | Birch gets a slimmer curved bole, subtle dark fissures and an airy crown. Conifer tiers droop unevenly, carry needle clumps and have broken lower rims rather than geometric triangles. | `drawBirch`, `drawConifer`; forest and season sheets. |
| Winter snow | **Implemented** | Snow on bare twigs and marcescent leaf masses is a thin, broken ridge. It no longer forms round white caps that hide the branch silhouette. At gameplay distance bare crowns get a larger branch envelope and second-order twigs, so they read as trees rather than dots on snow. Conifers retain species-specific tier snow. | `drawBareCrown`, `drawSnowCaps`; `player-view.png`, `tree-seasons.png`, `forest-seasons.png`. |
| Forest floor and spacing | **Implemented** | A broad soil wash, layered humus and moss washes, larger leaf drifts, species leaves, twig strokes, moss cushions and a few short green blades replace the flat green carpet. A soft canopy shadow darkens the interior; winter keeps brown litter, and snowy stands show exposed leaf patches. From rooftop zoom the crowns come from a deterministic half-tile candidate lattice rather than a per-tile stamp, with skipped candidates and real gaps. | `drawForestGround`, `drawLeafCarpet`, `drawCanopyScatter`, `treeScatterChance`; `player-view.png`, `tree-lod.png`, `tree-seasons.png`, `forest-reference.png`, `contact-sheet.png`. The detail is cached, not rebuilt every frame. |

## Player zoom — 3.32.2

The final acceptance frame is the normal game at `state.zoom = 1`, not a 2.4×
inspection capture. `npm run test:player-reference` runs the production Canvas2D
path with the HUD visible, chooses the seeded woodland edge at `112,48`, and
captures default, `0.78×` and `1.35×` on all four seasons. The cached detail
layer is allowed to finish before each frame. At the default camera the broken
ink contours, overlapping crown silhouettes, brown leaf-litter floor and the
transition into grass all remain legible; the winter panel keeps readable bare
branches and snow-covered litter. The same script records a three-tile pan
rebuild. `PLAYER_VIEW_URL` reproduces the sheet against a deployed origin.

## Grove LOD — 3.33.0

- **Half-tile crown scatter.** At `0.95×` and `2.40×` the forest pass visits four
  candidate positions inside every tile, hashes each one independently and
  skips candidates according to the stand's `treeChance`, clearing and damage.
  The accepted crowns are jittered away from the candidate centre and sized
  independently, so a tile can show zero to three crowns and no crown is
  anchored to the tile centre. Interior zoom samples slightly more of the same
  lattice than rooftop zoom; neither shows every stem.
- **Canopy LOD.** Below `0.55×` the same world-anchored grove cells collapse to
  overlapping species-shaped canopy masses. District zoom therefore reads as
  woodland rather than a field of isolated dots, and landscape zoom remains a
  cheap canopy stipple.
- **Biome ownership.** The crown, floor, understorey and litter passes only run
  for a forest stand. Meadow, wetland, desert, taiga and tropical profiles keep
  their own trees and ground detail; no generic forest layer is painted over
  them. Clearing and disturbed stands thin the scatter instead of remaining as
  a dense wood.
- **Evidence.** `player-view.png`, `player-view-hero.png` and `tree-lod.png` are
  generated by `npm run test:player-reference` from the real 1.00× camera and
  the four player zoom presets. `player-view.json` records focus, camera,
  tree-draw and build-time samples and the three-tile pan rebuild.

## Biomes — 1.2.1 Laubwälder

The broader biome work is tracked in [FOREST_ECOLOGY.md](FOREST_ECOLOGY.md). It maps all sixty items of **1.2.1 Laubwälder** to the shared deterministic stand model, the renderer, resource geography, the management survey and the dedicated `forest-reference.png` / `forest-seasons.png` sheets. The 1.1 checklist above remains authoritative for the terrain surface itself.

## Remaining limits

- **Real-GPU validation of the optional WebGL path is still open.** The committed sheets use the production Canvas2D renderer and are deterministic at the fixed viewport and seed. They prove the production artwork and seasonal states, not a hardware-GPU colour response or frame time. The WebGL shader is covered by its contract and atlas tests; set `TERRAIN_REFERENCE_RENDERER=webgl` for a separate visual audit. See [TERRAIN_PERFORMANCE.md](TERRAIN_PERFORMANCE.md).
- The terrain is procedurally painted and textured. A future fully hand-painted bitmap/sprite pack could add authored landmarks, but it is not required for the current deterministic art direction.
- The height field is intentionally compact (2–5 samples per tile). The bicubic reconstruction, noise and wear layers are display-side enhancements; gameplay height and water remain authoritative.

## Checks

```sh
cd game
npm test
npm run test:terrain-reference
npm run test:player-reference
npm run test:season-year
npm run test:climate-reference
```

`npm test` covers atlas seams, channel variance, season curves and blending, weather season-gating, climate shifts, per-tree foliage timing, occlusion, wear, the resolution-independent shore-distance encoding and the sand/crest shader paths. The Playwright reference produces the 16-cell season sheet, the autumn-to-spring transition strip and the actual-woodland grove strip with the production Canvas2D renderer; `TERRAIN_REFERENCE_RENDERER=webgl` builds the optional shader audit instead. The full-year audit drives 400 real weather updates and writes `season-year.json`, then checks that summer stays snow-free, conifers never go bare, oaks hold leaves and the northern/arid climates differ from the temperate baseline. The climate run adds the 5 × 4 same-grove matrix, five live day-330 screenshots from separate 400-day weather audits, and assertions on summer snow, weather variability, oak marcescence, northern/arid snow timing and conifer-versus-birch snow retention.
