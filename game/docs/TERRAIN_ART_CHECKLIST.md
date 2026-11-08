# Terrain art checklist 1.1

This is the current implementation audit for **1.1 Grundlegende Terrain-Grafik**. It maps each checklist item to the code and the evidence that protects it. The visual baseline is [TERRAIN_VISUAL_REFERENCE.md](TERRAIN_VISUAL_REFERENCE.md).

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
| 1.1.10 Jahreszeitenabhängige Optik | **Implemented** | Continuous season curves drive palette, sun and effects: snow accumulates through late autumn, peaks in winter and melts through early spring; leaf litter and green-up follow their own ramps. Palette colours are anchored mid-season, trees turn and drop per tree and species (oaks hold brown leaves, conifers stay green), and weather is season-gated so summer cannot snow. | `world/season.js`, `terrain-palette.js`, `seasonal-foliage.js`, `weather.js`; season, weather and foliage tests; transition and grove sheets. |

## Remaining limits

- **Real-GPU validation is still open.** The cloud workspace renders with software WebGL. The contact sheet proves the shader paths, seasonal states and zoom bands, but not the final colour response or frame time on target hardware. See [TERRAIN_PERFORMANCE.md](TERRAIN_PERFORMANCE.md).
- The terrain is procedurally painted and textured. A future fully hand-painted bitmap/sprite pack could add authored landmarks, but it is not required for the current deterministic art direction.
- The height field is intentionally compact (2–5 samples per tile). The bicubic reconstruction, noise and wear layers are display-side enhancements; gameplay height and water remain authoritative.

## Checks

```sh
cd game
npm test
npm run test:terrain-reference
```

`npm test` covers atlas seams, channel variance, season curves and blending, weather season-gating, per-tree foliage timing, occlusion, wear, the resolution-independent shore-distance encoding and the sand/crest shader paths. The Playwright reference produces the 16-cell season sheet, the autumn-to-spring transition strip and the grove strip.
