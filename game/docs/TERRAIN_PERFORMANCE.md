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
