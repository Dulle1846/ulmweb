# Terrain visual reference

![Terrain reference: spring, summer, autumn and winter at four zoom levels](terrain-reference/contact-sheet.png)

![Autumn to spring transition at district zoom](terrain-reference/season-transition.png)

![The same grove through the year](terrain-reference/tree-seasons.png)

These sheets are the committed visual baseline for the terrain surface. They complement the numerical atlas tests and the terrain benchmark: the tests protect determinism, seams and detail data, while the sheets make the actual seasonal, zoom-dependent and per-tree appearance reviewable at a glance.

## What it shows

- **Four seasons at their peak:** spring (day 50), summer (day 150), autumn (day 250) and winter (day 350). Days 0, 100, 200 and 300 are transition days between two anchored season palettes, so the old 0/100/200/300 captures were no longer the peak.
- **Four zoom presets:** landscape (0.09×), districts (0.30×), rooftops (0.95×), interiors (2.40×).
- **Autumn → winter → spring strip:** district zoom, days 210, 240, 270, 300, 330, 360, 0, 15, 30 and 50. It shows the ground browning through autumn, whitening as snow accumulates, and melting back to green through early spring.
- **The same grove through the year:** rooftops zoom (2.40×) on a wooded tile, days 220, 250, 280, 310, 340, 0, 30 and 60. Neighbouring trees turn at different times, deciduous crowns go bare, marcescent oaks hold brown leaves into winter and conifers stay green under snow.
- Fixed seed `20261104`, a paused simulation and a centred camera.
- HUD, entities, fog of war and weather are hidden so only the terrain surface and its decorations remain.

The reference intentionally uses a fixed camera and a square 800 × 800 terrain surface. It is not a gameplay screenshot and does not assert a particular composition; it is a repeatable surface reference.

## Regenerate

From `game/`:

```sh
npm run test:e2e:setup   # once, installs the pinned Chromium
npm run test:terrain-reference
```

The script:

1. Starts the game with seed `20261104` and an 800 × 800 viewport.
2. Pauses the simulation, reveals the full map and hides the HUD, entities, weather and fog.
3. Captures each season at each zoom preset, the transition strip at district zoom and the grove strip at rooftops zoom.
4. Writes `contact-sheet.png`, `season-transition.png`, `tree-seasons.png` and `reference.json` into `docs/terrain-reference/`.
5. Writes the sixteen individual season frames to `$TMPDIR/kac-terrain-reference-frames` by default. The transition and grove frames are composited directly into their sheets. Set `TERRAIN_REFERENCE_FRAMES` to keep frames somewhere else; set `TERRAIN_REFERENCE_OUT` to redirect the reference artifacts.

The GitHub browser workflow runs the same command with `TERRAIN_REFERENCE_OUT` pointing at `$RUNNER_TEMP/terrain-reference` and uploads the contact sheet and metadata as the `kings-and-cards-terrain-reference` artifact. That step runs even when the gameplay E2E step fails, so the surface report remains available for review.

The Playwright environment variables described in [tests/browser/README.md](../tests/browser/README.md) apply.

## Limits

- The sheets are captured with Chromium's available WebGL renderer. In the cloud workspace that is software rendering, so colours and fine contrast can differ from a real GPU. The checked-in images are human-review artifacts, not pixel-perfect assertions.
- The grove strip is one wooded tile, chosen by moisture and temperature. It shows the species mix present there, not every tree in the realm.
- The reference does not record frame time. Use [TERRAIN_PERFORMANCE.md](TERRAIN_PERFORMANCE.md) for performance measurements.
