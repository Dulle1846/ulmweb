# Terrain performance

The terrain layer is measured on its own page, so a result is not mixed with
UI rendering or simulation ticks:

```sh
cd game
python3 -m http.server 3000 --bind 0.0.0.0
```

Open <http://localhost:3000/tests/browser/terrain-perf.html>. Add
`?w=1600&h=900` to measure another viewport. The page:

1. forges a fixed standard realm (seed `20261104`, the same options the browser
   E2E uses),
2. warms the shader and texture uploads,
3. draws 60 frames per zoom level and calls `gl.finish()` after each draw so the
   measurement includes rasterisation,
4. records 60 `requestAnimationFrame` intervals while drawing every frame,
5. prints median, p95 and mean per level and exposes the same object as
   `window.__terrainPerf`.

| Level | Zoom | What the camera sees |
| --- | --- | --- |
| Landscape | 0.30 | Whole realm, material branches dominate |
| District | 0.95 | Regional detail, bicubic reconstruction |
| Rooftop | 2.40 | Full detail and close-detail noise |
| Interior | 4.20 | Maximum shader work per screen pixel |

## Shading pass costs

The surface shader carries four passes that are not free. Each one is bounded,
and most of the expensive work is amortised instead of running per pixel.

| Pass | Where it runs | Cost | Frequency |
| --- | --- | --- | --- |
| Detail atlas | fragment | up to 2 texture fetches for the variant cross-fade | every frame |
| Baked ambient occlusion | world upload | 16 height samples per output texel, half resolution | once per realm |
| Directional shadow | fragment | 3 bilinear height taps, land fragments only | every frame |
| Contours and hachures | fragment | `fwidth` and two noise fetches, no texture taps | every frame below zoom 1.15 |
| Wear field | frame | two typed-array passes and one encode | every frame, upload throttled to about 8 Hz |

Measured on the workspace CPU (Node 26, calling the same modules the browser
calls) for a standard realm with 704 × 704 height texels:

| Operation | Time |
| --- | --- |
| Ambient-occlusion bake, stride 2 (352 × 352 bytes) | 6.6 ms |
| Ambient-occlusion bake, stride 1 (704 × 704 bytes) | 30.8 ms |
| Wear advance, 352 × 352 cells | 0.28 ms per frame |
| Wear encode, 352 × 352 cells | 0.54 ms per upload |

The occlusion bake is the only visible hitch, and it runs once per realm load
inside `uploadWorldData`, never per frame. Half resolution is deliberate: the
term is low frequency and the shader samples it with `LINEAR`. The shadow march
sits inside the land branch, so deep water never pays for it.

Memory: the wear field and its targets are two `Float32Array`s of
`ceil(width × 2) × ceil(height × 2)` cells, about 1 MB together for a standard
realm, plus a 0.5 MB RGBA byte buffer for the upload. The occlusion texture is a
single `R8` at half resolution.

## Measured values

### Cloud sandbox browser (no GPU access)

The benchmark page runs in the cloud browser, but that browser reports only the
generic renderer string `WebKit WebGL`. `gl.finish()` returns without waiting
for rasterisation, and `EXT_disjoint_timer_query_webgl2` never returned a
result. The values below are therefore **command submission time only**; they
decrease with zoom instead of increasing, which is the opposite of real shader
cost. They prove the page and the draw path work, not how fast the terrain is.

| Level | Zoom | Draw median (submission) | Draw p95 | Frame median | Frame p95 |
| --- | --- | --- | --- | --- | --- |
| Landscape | 0.30 | _not captured_ | — | — | — |
| District | 0.95 | 0.08 ms | — | — | — |
| Rooftop | 2.40 | 0.05 ms | — | — | — |
| Interior | 4.20 | 0.02 ms | — | — | — |

Viewport: 1200 × 700. Renderer: `WebKit WebGL`. The tab was not visible, so
`requestAnimationFrame` was suspended and frame intervals were unavailable.
These rows must not be quoted as GPU performance.

### Hardware GPU

**Still to measure.** No real GPU is reachable from the cloud workspace, so
this table is intentionally empty until the page is opened on the target
machine. Run the page there (keep it in the foreground) and add a row with the
renderer string it reports. A browser at 60 Hz caps the frame median at about
16.7 ms; use the draw median and p95 to compare zoom levels, and the frame p95
to spot missed frames.

| Level | Draw median | Draw p95 | Frame median | Frame p95 |
| --- | --- | --- | --- | --- |
| Landscape | _pending_ | _pending_ | _pending_ | _pending_ |
| District | _pending_ | _pending_ | _pending_ | _pending_ |
| Rooftop | _pending_ | _pending_ | _pending_ | _pending_ |
| Interior | _pending_ | _pending_ | _pending_ | _pending_ |

#### Recording a hardware row

The cloud workspace has no GPU. Its browser reports only the generic software
renderer string and `gl.finish()` does not wait for rasterisation, so no
hardware numbers can be produced there. To record a row:

1. Open the page on the target machine in the foreground, at the resolution you
   want to document.
2. Save the report with the **Download JSON** button, or open the page with
   `?json=1`; the file contains the renderer string, viewport, WebGL version and
   the draw median/p95 for each level (`window.__terrainPerf` has the same
   object).
3. Add one row per level under a heading named after that renderer string and
   keep the viewport size in the caption.
4. Never compare software rows with hardware rows; they measure different
   things.

### Weather overlay

The snowfall and rain are drawn in screen space after the terrain pass, so
they cost a flat amount per frame independent of zoom:

| Effect | Particles | Cost per frame |
| --- | --- | --- |
| Snow | 170 flakes | 0.40 ms |
| Rain | 160 streaks | 0.15 ms |
| Clear | — | 0 ms (early return) |

Viewport: 1440 × 900, software rendering (`WebKit WebGL`). The overlay only
touches a 2D canvas and is capped by the particle counts above, so it scales
with the frame area rather than with the terrain detail.
