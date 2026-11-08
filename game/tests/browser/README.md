# Browser E2E

The browser suite drives the real game with Playwright and Chromium. It is not
part of `npm test`; the reproduction path is explicit so a missing browser can
never be mistaken for a game failure.

## Quick start

From `game/`:

```sh
npm install
npm run test:e2e:setup
npm run test:e2e
```

The visual reference and the full-year audit are separate, explicit runs:

```sh
npm run test:terrain-reference
npm run test:season-year
npm run test:climate-reference
npm run test:forest-reference
npm run test:terrain-stability
npm run test:device-benchmark
npm run test:atmosphere-reference
```

`test:terrain-reference` writes the four-season, transition and grove sheets.
`test:season-year` writes `docs/terrain-reference/season-year.json` with a daily
weather and foliage log for a complete 400-day year plus a five-climate
comparison. `test:climate-reference` writes the same-grove 5 × 4 climate
matrix, five live 1280 × 800 climate screenshots and their JSON logs.
`test:forest-reference` writes `forest-reference.png` with all fifteen Laubwald
formations and `forest-seasons.png` with one ancient wood on days 50, 150, 250
and 350, plus `forest-reference.json`. `test:terrain-stability` drives the live
Canvas2D cache through all four zoom levels, a long pan and a zoom, and asserts
that the decoration layer stays visible and rebuilds only after the view has
settled. `test:device-benchmark` opens the in-game Settings benchmark, runs it
on the landscape view and writes `device-benchmark.json` plus a screenshot.
`test:atmosphere-reference` writes the eight-frame dawn/noon/dusk/night
sheet and a 500 × 500 dawn mist close-up. The 60-point Laubwald audit is
documented in `docs/terrain-reference/laubwald-checklist.md`, with screenshot
references and an explicit status for every point. None of these commands is part of
`npm test`.

The forest run scans the fixed realm for a real forest resource node of every
formation, captures each at the same 2.40× camera, and fails on a missing
formation, a runtime page error or a fatal terrain/WebGL diagnostic. It also
captures an ancient wood through all four seasons. Set `FOREST_REFERENCE_OUT`
to write the forest artifacts somewhere other than `docs/terrain-reference/`.

The climate run starts five separate realms and drives 400 real
`updateWeather()` days in each. It writes `climate-reference.png`,
`climate-reference.json`, `climate-live.png`, `climate-live.json` and
`climate-live/<climate>.png`. The assertions cover summer snow, weather
variability, oak marcescence at day 330, northern versus arid snow days and
conifer-versus-birch snow retention at day 30. Set `CLIMATE_REFERENCE_OUT` to
write the climate artifacts somewhere other than `docs/terrain-reference/`.

`test:e2e:setup` installs Chromium for the pinned Playwright version. It then
opens a page containing a native text input, fills it, and verifies the value.
That preflight matters: Chromium can launch without fontconfig or fonts and
still crash as soon as an `<input>`, `<select>` or `<textarea>` is rendered.

On CI or any machine with root, install the shared libraries and fonts as well:

```sh
npx playwright install --with-deps chromium
```

The GitHub workflow does this through `npm run test:e2e:setup -- --with-deps`.

## Environment

- `E2E_PORT` - local static-server port, default `4173`.
- `E2E_SCREENSHOT_DIR` - screenshot directory, default
  `$TMPDIR/kac-ui-viewport-review`.
- `E2E_CHROMIUM_EXECUTABLE` - explicit Chromium executable path.
- `E2E_HEADED=1` - run headed (requires a display server).
- `E2E_SOFTWARE_GL=1` - launch Chromium with SwiftShader so WebGL2 references
  can run on a rootless container or CI runner without a GPU.
- `CLIMATE_REFERENCE_OUT` - climate artifact directory, default
  `docs/terrain-reference`.
- `DEVICE_BENCHMARK_OUT` - benchmark artifact directory, default
  `docs/terrain-reference`.

## What the suite covers

- Realm founding, world forge, save/load, roads, resource depletion and the
  memorial archive.
- Legacy saves with missing logistics fields, legacy warehouse filters,
  fractional/negative stock, stale reservations and an oversized legacy job.
- Recovery from a corrupt primary save through the device-local backup.
- Very large haul orders and the 72-job queue limit, including source and
  destination reservations, cancellation and a serialize/restore round trip.
- Responsive layout and primary-dialog reachability across the viewport matrix.

## Rootless Linux containers

`playwright install --with-deps` needs root. In a locked-down container, install
Chromium's shared libraries and a font package into a local prefix, then point
the runtime at them. A minimal setup has these parts:

1. A directory containing the extracted Debian/Ubuntu libraries, for example
   `~/.local/playwright-libs`.
2. Fonts such as DejaVu, for example `~/.local/playwright-fonts`.
3. A fontconfig file whose `<dir>` entry points at that font directory. Export
   `FONTCONFIG_FILE=/path/to/fonts.conf`.
4. `LD_LIBRARY_PATH` containing the extracted `usr/lib/x86_64-linux-gnu` and
   `lib/x86_64-linux-gnu` directories.

Example shape (adapt the paths to the packages available on the host):

```sh
export LD_LIBRARY_PATH="$HOME/.local/playwright-libs/usr/lib/x86_64-linux-gnu:$HOME/.local/playwright-libs/lib/x86_64-linux-gnu"
export FONTCONFIG_FILE="$HOME/.local/playwright-fonts/fonts.conf"
npm run test:e2e
```

If Chromium starts but the preflight crashes, inspect the launch error first;
missing `libnss3`, `libatk`, `libgbm`, `libasound` or fontconfig are the common
causes. `E2E_CHROMIUM_EXECUTABLE` can select a browser that is already present
in the environment.

## Responsive status

The former `390x844` card/dock blocker is resolved. The full suite now asserts
that the side panel scrolls where needed and that the selected card is fully
reachable above the action dock at every tested viewport. There is no known
viewport blocker in the current suite; screenshots are still written to the
configured directory for review.

## CI

`.github/workflows/game-browser-e2e.yml` runs on pull requests and on pushes to
`ulmweb-branch`, installs the pinned dependency, caches Chromium, runs the setup
with `--with-deps`, and then runs `npm run test:e2e`. Screenshots from the
responsive review are uploaded even when the test fails.

After the E2E step, the same job generates the four-season, four-zoom terrain
reference, the 400-day season audit, the climate matrix/live check and the
forest formation/season reference into `$RUNNER_TEMP/terrain-reference`. It
uploads `contact-sheet.png`, `season-transition.png`, `tree-seasons.png`,
`reference.json`, `season-year.json`, `climate-reference.png`,
`climate-reference.json`, `climate-live.png`, `climate-live.json`,
`climate-live/*.png`, `forest-reference.png`, `forest-seasons.png` and
`forest-reference.json` as the `kings-and-cards-terrain-reference` artifact.
All four generation steps also run when the E2E step fails, so a failed
gameplay run still produces the visual surface report and the weather/foliage
records.
