# Terrain visual reference

![Terrain reference: spring, summer, autumn and winter at four zoom levels](terrain-reference/contact-sheet.png)

This contact sheet is the committed visual baseline for the terrain surface. It complements the numerical atlas tests and the terrain benchmark: the tests protect determinism, seams and detail data, while this sheet makes the actual seasonal and zoom-dependent appearance reviewable at a glance.

## What it shows

- **Four seasons** at their peak palette: spring (day 0), summer (day 100), autumn (day 200), winter (day 300).
- **Four zoom presets:** landscape (0.09×), districts (0.30×), rooftops (0.95×), interiors (2.40×).
- Fixed seed `20261104`, a paused simulation and a centred camera.
- HUD, entities, fog of war and weather are hidden so only the terrain surface remains.

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
3. Captures each season at each zoom preset.
4. Writes `docs/terrain-reference/contact-sheet.png` and `docs/terrain-reference/reference.json`.
5. Writes the sixteen individual frames to `$TMPDIR/kac-terrain-reference-frames` by default. Set `TERRAIN_REFERENCE_FRAMES` to keep them somewhere else; set `TERRAIN_REFERENCE_OUT` to redirect the reference artifacts.

The GitHub browser workflow runs the same command with `TERRAIN_REFERENCE_OUT` pointing at `$RUNNER_TEMP/terrain-reference` and uploads the contact sheet and metadata as the `kings-and-cards-terrain-reference` artifact. That step runs even when the gameplay E2E step fails, so the surface report remains available for review.

The Playwright environment variables described in [tests/browser/README.md](../tests/browser/README.md) apply.

## Limits

- The sheet is captured with Chromium's available WebGL renderer. In the cloud workspace that is software rendering, so colours and fine contrast can differ from a real GPU. The checked-in image is a human-review artifact, not a pixel-perfect assertion.
- Season days 0, 100, 200 and 300 are the peak of the continuous palette. Days near a boundary intentionally blend two seasons and are not represented here.
- The sheet does not record frame time. Use [TERRAIN_PERFORMANCE.md](TERRAIN_PERFORMANCE.md) for performance measurements.
