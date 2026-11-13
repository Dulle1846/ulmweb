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
npm run test:forester-stewardship
npm run test:forester-stewardship-longrun
npm run test:forest-stewardship-ui
npm run test:jungle-raid
```

`test:jungle-raid` starts a real tropical realm, recruits local levies, launches the
production war front and plays the complete raid through `updateSimulation()`. It
verifies ambush, supply attrition, cover and the local guerrilla bonus against the
actual browser combat values, and writes `artifacts/jungle-raid/jungle-raid.json`.

`test:jungle-proof` is the broader jungle interior proof. The visual reference,
dense-forest occlusion proof and full-year audit are separate, explicit runs:

```sh
npm run test:terrain-reference
npm run test:season-year
npm run test:climate-reference
npm run test:desert-reference
npm run test:forest-reference
npm run test:conifer-reference
npm run test:mixed-reference
npm run test:forest-occlusion
npm run test:forest-detail
npm run test:terrain-stability
npm run test:device-benchmark
npm run test:atmosphere-reference
```

## Long campaign audit

The 25-year scripted campaign is separate from the legacy E2E suite:

```sh
cd game
npm run test:campaign                 # headless, real simulation + player APIs
python3 -m http.server 3000 --bind 127.0.0.1   # in another shell, from game/
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:campaign:browser
```

Both use seed `20261108` and 25 years by default. Set `CAMPAIGN_YEARS` to
shorten a run and `CAMPAIGN_SEED` to change the realm. The browser audit starts
through the real start screen, verifies all 13 ambitions and the mature-realm
frame sample, and writes `artifacts/long-campaign-audit.json` plus three
responsive screenshots. It fails on a missed requirement, a stalled site, a
page/console error, horizontal overflow, a missing 13 / 13 ambition panel, FPS
below 50 or frame time above 20 ms.

`test:terrain-reference` writes the four-season, transition and grove sheets.
`test:season-year` writes `docs/terrain-reference/season-year.json` with a daily
weather and foliage log for a complete 400-day year plus a five-climate
comparison. `test:climate-reference` writes the same-grove 5 × 4 climate
matrix, five live 1280 × 800 climate screenshots and their JSON logs.
`test:forest-reference` writes `forest-reference.png` with all fifteen broadleaf
formations and `forest-seasons.png` with one ancient wood on days 50, 150, 250
and 350, plus `forest-reference.json`. `test:conifer-reference` and
`test:mixed-reference` reuse the same harness for the twelve conifer and twelve
mixed formations; they write `conifer-reference.png` / `conifer-seasons.png` /
`conifer-reference.json` and `mixed-reference.png` / `mixed-seasons.png` /
`mixed-reference.json`. `test:forest-detail` writes
`forest-detail-reference.png` with the thirteen native close-ups for the
formerly open checklist items, plus `forest-detail-reference.json`. Small
motifs carry a review ring; every frame is a real terrain render, and the
script waits for the decoration cache to rebuild before each capture.
`test:terrain-stability` drives the live
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
formation, captures each at the same 0.95× camera, and fails on a missing
formation, a runtime page error or a fatal terrain/WebGL diagnostic. It also
captures an ancient wood through all four seasons. Set `FOREST_REFERENCE_OUT`
to write the forest artifacts somewhere other than `docs/terrain-reference/`.
`test:forest-occlusion` drives a real dense conifer wall and verifies that a
selected building behind it is absent from the `drawWorld()` entity set while
the same building at the same distance in open ground is present. It repeats
the contrast for a logistics carrier, a particle and a floating text marker,
and records the wall strength, anchor and equal-distance geometry.

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
- `E2E_BASE_URL` - run the same suite against a deployed origin instead of
  the local static server, for example `https://kings-and-cards.pages.dev`.
  The test-only `main.js` instrumentation is applied in flight; no local files
  are served for the page.
- `E2E_SCREENSHOT_DIR` - screenshot directory, default
  `$TMPDIR/kac-ui-viewport-review`.
- `E2E_CHROMIUM_EXECUTABLE` - explicit Chromium executable path.
- `E2E_HEADED=1` - run headed (requires a display server).
- `E2E_SOFTWARE_GL=1` - launch Chromium with SwiftShader so WebGL2 references
  can run on a rootless container or CI runner without a GPU.
- `FORESTER_AUDIT_OUT` - directory for the Forester browser evidence, default
  `docs/forester-stewardship`. The audit writes `forester-stewardship.json`
  plus cut-over/progress/grown map and management screenshots.
- `FORESTER_LONGTERM_OUT` - directory for the ten-year Forester evidence,
  default `docs/forester-stewardship-longrun`. Three seeds write one
  `forester-stewardship-longrun.json` with a `seeds` array plus cut/grown map
  pairs for years 1, 5 and 10 and the stewardship panel captures. Set
  `FORESTER_SEED` to `20261108`, `7` or `99` to run one seed separately,
  `FORESTER_REPORT` to change the report filename, and
  `FORESTER_TIME_BUDGET_MS` to override the 240,000 ms runtime budget.
- `CLIMATE_REFERENCE_OUT` - climate artifact directory, default
  `docs/terrain-reference`.
- `FOREST_DETAIL_OUT` - detail-sheet artifact directory, default
  `docs/terrain-reference`.
- `FOREST_DETAIL_FRAMES` - optional directory for the individual uncropped
  detail frames; useful when reviewing a single motif.
- `DEVICE_BENCHMARK_OUT` - benchmark artifact directory, default
  `docs/terrain-reference`.

## What the suite covers

- Realm founding, world forge, save/load, roads, resource depletion and the
  memorial archive.
- The forest-product action in a real Lumber Yard/Forester: opening the
  building record, gathering from a reachable forest tile, the confirmation
  toast, the persisted product ledger and the reduced forest-tile stock.
- Forester stewardship in a real realm: a staffed lodge in three cut-over
  stands, the dedicated range block and live DOM values across ticks, the
  red/amber/green map markers, the 6,512 → 6,866 stock rise, and the
  `Planting saplings` → `Forest is fully grown` transition without a false
  depletion status.
- Ten-year Forester stewardship across three seeds: 30 real years and 12,000
  days, with a rotating one-to-three freshly cut stands at the start of every
  year, two-to-four stands thinned every twenty days and one annual clear-cut
  on a variable day. The audit removed 14,256 stock against 13,473 saplings
  planted, with a 95.8 % low point and a 100 % end point in all 30 years. It
  samples the canvas to count the real red markers (one to three per cut, none
  after recovery), hashes the terrain raster on every cut/grown pair, and reads
  the stewardship DOM every year. The three-seed run completes in 162.7 s under
  its explicit 240 s budget. Images and JSON are written under
  `docs/forester-stewardship-longrun/`.
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

After a successful E2E run, the job runs the three-seed Forester stewardship
audit with an explicit `FORESTER_TIME_BUDGET_MS=240000`. The audit writes its
JSON report and PNG captures into
`$RUNNER_TEMP/forester-stewardship-longrun`, and the job uploads them with the
run log as `kings-and-cards-forester-stewardship-longrun`. Exceeding the budget
fails the audit and therefore the job; the JSON is written before that check,
so the artifact still contains the over-budget measurements.

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
