# Kings & Cards — Version and Development History

**Current production version:** `3.14.2`
**Next development line:** `3.15.0-dev`
**Production branch:** `ulmweb-branch`  
**Game root:** `game/`  
**Production URL:** https://kings-and-cards.pages.dev/  
**Last repository verification:** 2026-11-14 (UTC)

This is the canonical release and change record for the game. It is intentionally stored at the root of `game/`, not buried in the technical documentation folder.

## Versioning policy

Kings & Cards uses a practical semantic version format:

- **MAJOR**: incompatible save schema, core simulation redesign, or a major game-generation milestone.
- **MINOR**: a player-visible feature phase such as roads, resource geography, logistics or dynastic systems.
- **PATCH**: compatible bug fixes, balance adjustments, UI fixes and save migration corrections.
- Development branches may use a `-dev` suffix. A branch name or draft PR is not a release.
- A version becomes **production-released** only after merge into `ulmweb-branch`, successful required CI, and confirmation that Cloudflare Pages serves that commit.
- GitHub Actions, Cloudflare Pages, and browser availability are separate release facts. One does not prove the others.

The version in `game/package.json` is the machine-readable game version. Update this file and this changelog together for every release.

## Separate hosted development builds

- **Kings & Cards — campaign sweep and eight-climate low-end proof (current hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. The runtime package is 322 files / 7.65 MiB and its runtime deployment's `version.json` identified commit `89ad0cac6118a9ecbfc7644441948c008ce4e627`; the later documentation build adds only this record and keeps the same runtime package. Preview deploy receipt `4dda27c7-f04f-41db-8349-90b4f2c82f70` (15:35:23–15:35:27Z) and production receipt `97ac77cd-16f2-433c-a9a8-3eb213214d32` (15:35:37–15:35:40Z) both succeeded; both environments report `published:true`. Both origins return HTTP 200 and serve matching SHA-256 hashes for `terrain.js` `3c375ab3c99b1387822abe8ad63b39319c4e0660a630b5df9e1b3c3c96f5c888`, `savanna-ecology.js` `7f675f510d46fe15265369bea555cfec99cc91c2d3d02e831dac328e39c56446`, `savanna-render.js` `8755b029b237ec64058c77e9f2e12b6bbab2612b07ba42cbec79b7e34134a0ec` and `terrain-model.js` `c8ba932d22c1a0532dd67cb8a20fa0706180dec77af3341c17bcf5de03b4a1dd`. A live production load and a live preview load each exposed all eight climate options (Temperate, Northern, Tundra, Savanna, Mediterranean, Arid, Enchanted, Tropical rainforest), returned HTTP 200 for every requested script and stylesheet, and reported no page or console errors; only the expected software-WebGL `ReadPixels` warning appeared. Verified on this head: focused savanna render 6/6, campaign aggregation 4/4, `npm test` 950/950, syntax/imports 145 files / 203 ids, complete browser E2E green, the three-seed savanna sweep exit 0 with 2 real fuel-backfill orders, and the eight-climate low-end proof exit 0 at p95 16.8 ms. Full record: [docs/SAVANNA.md](docs/SAVANNA.md).

- **Kings & Cards — tundra (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-14. Preview receipt `8c735389-98ad-4cb5-9032-0a06873b6686` (13:02:56–13:02:59Z) and production receipt `ca2f623c-bfe4-4898-8907-f96051c5a81d` (13:03:07–13:03:11Z) both succeeded; both environments remain `published:true`. The runtime package is 320 files / 7.57 MiB and its `version.json` identifies the deployed commit. Both origins return HTTP 200 and carry matching SHA-256 hashes for `tundra-ecology.js` `b35e169c39f55cf5d0acc9500300501941335398877ad23828e409798b606814`, `tundra-render.js` `ceec5f76b7b76882fcf98b111ad4a0cea4956501e4ff0d83b44750a8aaaa831f` and `terrain-model.js` `bb22b227f4fbf2a09123fe54f741657e1bb0ee3c86e3b1c442a0dbbea68dbd2e`. A live production load exposed the Tundra climate option, returned HTTP 200 for the document and every requested script and stylesheet, and reported no page or console errors; only the expected software-WebGL `ReadPixels` warning appeared. Verified on this head: focused tundra tests green; `npm test` 933/933; syntax/imports 143 files / 203 ids; complete browser E2E green; 25-year temperate campaign 10,040 ticks / 13/13 / 0.833 ms per tick / no stalls / no game over; 25-year tundra campaign 10,040 ticks / 13/13 / 0.553 ms per tick / no game over, with its firewood-stock flag still false (real fuel scarcity). Full record: [docs/TUNDRA.md](docs/TUNDRA.md).

These builds are published from the current development worktree to Freebuff Sites. They are **not** the Cloudflare Pages production branch and do not change the `3.10.0` Pages release status.

- **Kings & Cards — living population (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-10. Preview receipt `4d93041d-fc21-4ddf-8cd4-74ed48a242ca` (05:37:11–05:37:13Z) and production receipt `f1f68065-3d97-4ba1-af3b-a491f70e5c75` (05:38:43–05:38:45Z) both succeeded; both environments remain `published:true`. The runtime package is 131 files / 2.4 MB and serves the same `population-register.js` SHA-256 `5fbc0c3ffbcd011aa070120bf46cb0fcd5aabe6a4e1db120b46a48565822e9b4` and `population-panel.js` SHA-256 `f301219473797f0fdc4531eda95aff10215c2f239ade4c94a6e35de34bff4bba` on both origins. A Cloud-browser check founded Avalon / House Vere on both environments and opened the 18th PEOPLE tab: preview showed 22 citizens / 6 households / 22 civilians + 0 soldiers with Wren Goldleaf as the only royal; production showed 22 / 6 / 22 + 0 with Kael Longstride as the only royal. The SOLDIERS filter returned `0 matching · showing 0` with its empty state on both; production reported 0 console messages and no failed resources, preview only four software-WebGL `ReadPixels` warnings and no errors. The first preview check exposed that the sovereign's royal `KNIGHT` entity was counted as a soldier; the register now classifies royals as civilians and a regression test covers it. The performance pass then found the census entry point normalizing the whole register on every tick before its annual early return; it now checks the stored census year first, and same-year calls return the live register. Five post-fix campaigns measured 2.980–3.073 ms/tick (median 3.023, spread 0.093 ms), with the median below the 3.062 ms baseline and every run at 10,040 ticks / 13/13 / no game over. Verified on this head: focused population 8/8; `npm test` 683/683; syntax/UI 101 files / 189 ids. Full record: [docs/LIVING_POPULATION.md](docs/LIVING_POPULATION.md).

- **Kings & Cards — realm founding (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-10. Preview receipt `3047608e-096f-4c0c-b723-c7ec43047368` (04:56:06–04:56:09Z) and production receipt `0dd6ffcc-79b6-4369-92f2-716549ef2fb0` (04:56:11–04:56:15Z) both succeeded; both environments remain `published:true`. The runtime package is 129 files / 2.3 MB. A Cloud-browser check on the deployed preview rendered all new founding controls and the live summary, founded Avalon / House Vere with the harvest rite, guild custom, common law, consent doctrine, mercantile compact and mixed constitution, and opened the GOVERNMENT panel with the FOUNDING CHARTER block and chronicle; no console errors appeared, only software-WebGL `ReadPixels` warnings. The run exposed a duplicated “House House” chronicle prefix; it was fixed, the final build passed 675/675 tests, was rebuilt and redeployed to both environments, and production returned HTTP 200 with the fix confirmed. The 25-year campaign still reaches 10,040 ticks / 13/13 ambitions / 37.6 s / 3.062 ms per tick. Full record: [docs/REALM_FOUNDING.md](docs/REALM_FOUNDING.md).

- **Kings & Cards — faith, culture and justice (previous hosted build):** production https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page · preview https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page · site 054512f6-1fcf-489c-8406-3ab4e49022e3 · published 2026-11-09. Preview receipt 94e3a656-e8af-415b-9a3a-2ff0931344cc (22:16:59–22:17:04Z) and production receipt c17585d4-9b5e-4a89-a3b9-8fcd7544db49 (22:17:06–22:17:11Z) both succeeded; both environments remain published:true. The runtime-only package is 126 files / 2.3 MB with no Markdown, maps, tests or JSON. Live Cloud-browser checks: both environments founded a year-1 realm with 21 residents, active faith and justice state, one shrine, one court and 16 tabs; the FAITH panel exposed 11 action controls and JUSTICE 7; production reported 0 console messages and all requests 200/304, preview only four software-WebGL ReadPixels warnings and no errors. Verified on this head: focused faith/justice 13/13; npm test 657/657; syntax and UI ids clean for 96 files / 185 ids; browser E2E green including shrine/court construction, clergy and judge appointments, a festival, a verdict and save/load; 25-year campaign 10,040 ticks / 13/13 / 4.545–4.546 ms per tick. Full record: [docs/FAITH_AND_JUSTICE.md](docs/FAITH_AND_JUSTICE.md).

- **Kings & Cards — named garrison and public health:** production `https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page` · preview `https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page` · site `054512f6-1fcf-489c-8406-3ab4e49022e3` · published 2026-11-09. Preview receipt `a3be04bf-8291-4fa3-bb8d-7d90dcedebbd` (21:31:20Z) and production receipt `5e312fca-97b9-441e-9ee1-b8b3b03b707b` (21:34:10Z) succeeded; both environments are `published:true`. HTTP checks returned 200 for the document, military, health, main module, stylesheet and an asset; deployed military/health SHA-256 hashes match the local files. Cloud-browser runs on both environments executed recruit, drill, sanitation, quarantine, healer and medicine actions with no page or console errors (only software-WebGL `ReadPixels` warnings). Production ended with 3 named soldiers, an active drill, sanitation 39, quarantine 1, a named healer, 7 doses and a balanced goods audit. Verified on this head: `npm test` 644/644, browser E2E green, 25-year campaign 10,040 ticks / 13/13 ambitions / 4.093 ms per tick (49.4 s). Full record: [docs/MILITARY_AND_PUBLIC_HEALTH.md](docs/MILITARY_AND_PUBLIC_HEALTH.md).

- **Kings & Cards — crown, court and living diplomacy:** production `https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page` · preview `https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page` · site `054512f6-1fcf-489c-8406-3ab4e49022e3` · published 2026-11-09. This was the previous hosted build. Deployment and publish receipts succeeded; production returned HTTP 200 and loaded in the Cloud browser without page errors. Verified on that head: `npm test` 636/636, browser E2E passed in 78.7 s, 25-year campaign 13/13 in 50.9 s.

## Production release history

### 3.15.0-dev — Campaign seed sweep and eight-climate low-end proof (1.2.11)

**Released:** 2026-11-14

**Scope:** Close the campaign fuel-backfill diagnostic honestly on the
eight-climate world, remove the stale limitation note, and re-prove the
low-end frame, save/load and memory budget on the heaviest savanna scene. No
campaign requirement was weakened and no event, illness or worker was
hand-placed.

**Campaign verification:** the reference runner now supports a documented
seed sweep (`npm run test:campaign:sweep`). All three savanna seeds
`20261106`, `20261143` and `20261152` reach 10,040 ticks with every real
requirement true, 13/13 ambitions, no stalled sites and no game over
(0.605–0.619 ms/tick). Across the sweep the ordinary annual health simulation
produces **two real illness-to-fuel-backfill orders in two phases** on seed
`20261152`: a sawyer falls ill in years 7–8, the normal workforce logic
replaces them and the replacement receives the one-shot fuel lease. The other
two seeds remain fully green with zero orders. Aggregation is fail-closed:
every seed must pass every requirement, no worker phase may receive more than
one order, and the whole sweep must contain at least one real order. The
extracted `tests/campaign/sweep-results.mjs` is covered by
`tests/campaign/sweep-results.test.js` (4/4). Requirements and evidence:
[docs/CAMPAIGN_VERIFICATION.md](docs/CAMPAIGN_VERIFICATION.md). The old
"harness coverage limit" note is removed from this changelog and
`docs/SAVANNA.md`.

**Savanna wind cache:** the animated tall-grass overlay previously rebuilt the
complete savanna ecology profile (grasses, trees, fauna, goods, soils and
hazards) for up to 260 scanned tiles on every rendered frame. It now caches the
four values it actually draws (tall-tuft flag, sway, grass colour and alpha)
in a hard-bounded 8,192-tile map. Invalidation keys cover the world seed,
terrain version and sampled terrain maps, climate/forest/aridity options,
explored/terrain/road/building revisions, season, year, day bucket, weather,
wind and land-use bucket; the cache never holds full profiles and a change in
any input clears it. In the accelerated-canvas diagnostic on the same host,
wind-path draw p95 fell from 25.4 ms to 13.7 ms quiet and 14.1 ms to 8.5 ms
dense; app work p95 fell from 32.9/19.7 ms to 19.4/14.7 ms in that diagnostic. A focused test
proves reuse, zero misses on an unchanged frame and weather invalidation
(`tests/presentation/grassland-render.test.js`, 6/6).

**Low-end proof:** the shipped low-end profile is 1366×768, 4× CPU throttle,
Auto terrain on Canvas2D, 70 % render scale, 60 FPS cap, two in-game years, and
the software Canvas2D/compositor path used when a device has no usable GPU
(`PERF_SOFTWARE_CANVAS=1`). The harness preloads the settings before founding,
so the quiet phase measures play rather than a post-start terrain rebuild. The
eight-climate scene is savanna, forests 85 (woodland and forest clearings) and
a real settlement on seed `20261152`. Final run (`npm run
test:performance:eight-climate`, exit 0):

| Phase | Frames | Median | p95 | >33 ms | >50 ms | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quiet realm | 479 | 16.7 ms | **16.8 ms** | **0.63 %** | **0 %** | **0** |
| Dense mature realm | 601 | 16.7 ms | **16.8 ms** | **0 %** | **0 %** | **0** |
| Population panel | 476 | 16.7 ms | 16.7 ms | 0.42 % | 0.21 % | 0 |
| War/diplomacy panel | 472 | 16.7 ms | 16.8 ms | 0.64 % | 0 % | 0 |

Quiet/dense draw p95 is **7.8 / 7.6 ms** and simulation p95 is **4.9 /
3.3 ms**; app work p95 is **11.5 / 10.4 ms**. A real production save took
**170.1 ms** and load **1048.8 ms** (906,134-byte save), both under the new
1000/2500 ms budgets, with no page or console errors. Warm retained heap grew
**2.12 %** after bounded caches filled; the cold-start report still records
+34.56 % and is kept for visibility. The harness now samples the real
`state.performanceProbe` work per presented frame, preloads settings, drives
the production save/load controls directly, and gates heap growth only after
the one-time cache warm-up.

**Verification:** focused savanna render 6/6, campaign aggregation 4/4, full
`npm test` **950/950** with syntax/relative imports clean for 145 source files
and 203 UI ids. Complete browser E2E is green across world forge, drag
placement, save/load, gathering, production, ecology legacy save and large
orders. The three-seed sweep exits 0, and the eight-climate low-end proof exits
0 with the numbers above.

### 3.15.0-dev — Savanna and the living grassland (1.2.10)

**Released:** 2026-11-14

**Scope:** Savanna becomes the eighth dedicated climate instead of a warmer
variant of `arid` or `grassland`. A deterministic ecology module derives ten
formations (open grass plains, acacia savanna, baobab grove, riparian corridor,
dry riverbed, thorn scrub, termite-mound field, seasonal pan, burned grassland
and rocky kopje) from height, moisture, temperature, season, weather, wind and
real land use. The profile carries the wet/dry pulse, laterite soil, seasonal
pans and waterholes, dry riverbeds, grazing and fire pressure, drought, heat,
predator, water-scarcity, flood and livestock-disease risk, and the full
48-point vocabulary.

**Integration:** `terrain.js` gives savanna priority over desert, steppe and
grassland and suppresses closed forest; `savanna-render.js` draws a bounded
ground and detail layer. Sparse savanna woodland is seeded on the grassy belt
below the old forest line as well as above it, so a lowland start has logs,
lumberjacks and firewood without a closed canopy. Gathering, the shared good
ledger, farm/stable surveys, movement costs, harvest yield, spoilage, the
climate selector and savanna's milder hearth-load interval all read the same
climate profile. Existing worlds and saves keep their settlements and terrain
unchanged.

**Verification:** focused savanna ecology, rendering and resource tests 12/12;
full `npm test` 945/945 with syntax and relative imports clean for 145 source
files / 203 UI ids; complete browser E2E green; 25-year temperate campaign
10,040 ticks, 13/13 ambitions, 0.830 ms/tick, no stalls and no game over; a
25-year savanna campaign on seed 20261106 reaches the same 10,040 ticks and
13/13 ambitions with every campaign requirement true, 46 firewood in store,
no stalls and no game over at 0.585 ms/tick. This seed records no
fuel-backfill order; the later 1.2.11 documented seed sweep adds seed
`20261152`, where ordinary sawyer illness produces two real orders while all
requirements remain true. The deterministic browser reference captures all ten
formations and one seasonal pan through four seasons.

### 3.15.0-dev — Tundra and the living permafrost (1.2.9)

**Released:** 2026-11-14

**Scope:** Tundra becomes the seventh climate instead of a colder variant of
`northern`. A dedicated, deterministic ecology module derives moss, lichen,
dwarf-shrub, willow-thicket, berry-heath, sedge-wetland, frost-polygon, rocky,
coastal and snowfield formations from height, moisture, temperature, season,
weather, wind and real land use. The profile carries permafrost and a summer
active layer, thaw depth, polygons, cracks, hummocks, bearing strength, pools,
peat, ten formations, cold-adapted fauna and the full 48-point vocabulary.

**Integration:** `terrain.js` gives tundra priority over the other biomes and
suppresses tall forest; `tundra-render.js` draws a bounded detail layer. The
shared forest, gathering, goods, hauling and farm/stable survey systems carry
the new products. Rare low subalpine-scrub stands give the lumber chain a small
renewable timber and fuel source without painting a forest over the tundra.
Harvest yield, spoilage, winter/spring movement, farm and stable summaries and
the climate selector all read the same climate profile. Existing worlds and
saves keep their settlements and terrain unchanged.

**Verification:** focused tundra ecology and rendering 10/10; full `npm test`
933/933 with syntax and relative imports clean for 143 source files / 203 UI
ids; complete browser E2E green; 25-year temperate campaign 10,040 ticks,
13/13 ambitions, no stalls and no game over; a 25-year tundra campaign reaches
the same 10,040 ticks and 13/13 ambitions. The deterministic browser reference
`npm run test:tundra-reference` captures all ten formations and one wetland
through four seasons.

### 3.15.0-dev — Loaded realms keep their HUD and realm issues

**Released:** 2026-11-14

**Cause:** Loading a saved realm calls `resetForRun()`, which clears
`state.hasStarted`, and then restores the snapshot. The load path hid the start
screen and resumed the simulation, but never marked the restored realm as
started. `renderUI()` therefore returned at its first guard on every call: the
loaded realm stayed visible but its HUD stopped refreshing, and the chronicle
could not reopen an active realm issue because the modal was never painted. The
browser E2E caught this at the issue-reopen fixture, several minutes after the
real save/load action that caused it.

**Fix:** `loadSnapshotIntoGame()` now sets `state.hasStarted = true` after a
successful restore and before its first render. The browser E2E asserts the
readiness flag immediately after the existing real load, next to the action that
regresses it.

**Verification:** `npm test` 922/922 with syntax and relative imports clean for
141 source files / 203 UI ids; complete browser E2E green with no page or console
errors, including dismissing and reopening the chronicle issue; Royal
Expeditions browser audit green; 25-year campaign 10,040 ticks, 13/13
ambitions, no stalls, no game over, 0.835 ms/tick (previous baseline 0.861).

### 3.15.0-dev — Royal expeditions and the living frontier

**Released:** 2026-11-14

**Scope:** A persistent exploration layer built from the systems the realm
already owns. Every world seeds eight deterministic landmarks (sunken ruins,
cave, shrine, watchtower, crater, grove, barrow and caravanserai) from its seed
and keep position. A named, living adult resident can lead one party at a time;
their command, learning, care and trade skills, the chosen supply level and the
site's danger decide a triumph, success, costly return or disaster. Supplies
are paid from real food and gold, distance extends the journey, arrival calls
the existing fog reveal, and loot is credited only when the party is home.
Injury uses the existing illness field, disaster touches morale, and first
discoveries feed person memories, legacy, the event log and a bounded lore
archive. A cleared site can be surveyed again for a smaller cache without
duplicating its principal lore.

**Integration:** The normal simulation tick calls `updateExpeditions()` once;
there is no new loop, renderer or resource. The save snapshot persists a
normalized `expeditions` block inside schema 11, loading repairs old or missing
blocks, and the validator rejects malformed records. The command deck gains an
EXPLORE tab backed by a dedicated panel, with leader/supply selection, eight
landmark cards, live travel progress, returned reports and recovered fragments.
The panel refreshes on a real `kac:expedition-change` event when travel
resolves.

**Verification:** Focused domain, save and UI-contract tests pass 7/7. Full
`npm test` passes 922/922 with syntax and relative imports for 141 source
files and 203 referenced UI IDs. The 25-year campaign completes 10,040 ticks,
13/13 ambitions, `noStalls:true`, no game over and 0.861 ms/tick. The real
browser audit (seed `20261114`) founded a realm, opened EXPLORE, counted eight
landmarks, chose a named leader and grand equipage, launched and resolved a
triumph, verified the completed/surveyed/fragment counters, the history row,
the lore card and the save snapshot, and produced no page or console errors.
Reference frames are in
[docs/expeditions-reference/](docs/expeditions-reference/); the full design and
save contract are in [docs/EXPEDITIONS.md](docs/EXPEDITIONS.md).

**Deployment:** Hosted preview and production are published from this commit;
the Freebuff Sites receipts and origin checks are reported with the release
hand-off.

### 3.15.0-dev — Deserts and semi-deserts (spec 1.2.8)

**Released:** 2026-11-13

**Scope:** All 75 requirements `1.2.8.1`–`1.2.8.75` are implemented and
covered by an explicit ID audit. Deserts are a deterministic ecology layer,
not a recoloured grassland. The new `desert-ecology.js` derives ten formations
(sand sea, dune field, rock, gravel, pebble, salt, semi-desert, cold, mountain
and dry-basin desert) from height, moisture, temperature, climate, season,
weather, wind and land use. Four sand colours and five dune types feed the new
`desert-render.js` detail layer: crests and lee slopes, wind scour, gravel,
salt crust, boulders, cliffs, mesas, canyons, caves, thorn scrub, succulents,
rain flowers, palms, oasis water and fields, caravans and desert wildlife.
Cold desert is reachable in an arid world through high, dry mountains rather
than a special-case tile.

**Integration:** The existing terrain priority now chooses desert before
steppe and grassland, palms use the shared tree lattice, and the wind pass
accepts the desert profile. Forest ecology registers the desert goods; the
gathering paths check desert before steppe and grassland and deliver dates as
food, desert herbs as medicine and the remaining goods through the shared
ledger. `grasslandSiteSummaryAt()` exposes the desert profile and oasis
water/fields to the existing farm and pasture overview. There is no new tick
loop and no new save field; every per-frame loop is bounded and every profile
is deterministic.

**Verification:** Focused desert tests pass 10/10, including the exact 75-ID
set, complete vocabulary, determinism, bounded values, a ten-tile survey that
reaches every requirement, all ten formations, four sand colours, five dune
types, oasis services, hazards and goods delivery. Full `npm test` passes
915/915 with syntax and relative imports for 139 source files and 203
referenced UI IDs. The 25-year campaign completes 10,040 ticks / 13 of 13
ambitions with `noStalls:true`, no game over and 0.842 ms per tick. The browser
reference generated all ten formations as real tiles at 2.4× interior zoom
(seed `20261100`, 176×176 arid world, aridity 100, WebKit WebGL 800×800); the
formation sheet and four-season oasis strip are in
[docs/terrain-reference/desert-reference.png](docs/terrain-reference/desert-reference.png)
and [docs/terrain-reference/desert-seasons.png](docs/terrain-reference/desert-seasons.png).
The full implementation and 75-row audit are in [docs/DESERTS.md](docs/DESERTS.md).

**Deployment:** Hosted preview and production are published from this commit;
the Freebuff Sites operation receipts and final origin checks are reported with
the release hand-off.

### 3.15.0-dev — Visual delivery audit and command-emblem repair

**Released:** 2026-11-13

**Scope:** Post-release visual acceptance of the hosted build (`32bf99c`) at the
real Production origin, plus the one defect that audit exposed. No simulation
rule, save schema, terrain colour or camera behaviour was changed.

**Visual evidence:** A fresh realm (seed `20261108`, 23 residents, 30 buildings,
56 entities) was captured after normalising the clock to Year 1, day 50, noon,
clear weather so the Production and `5cbf350` frames can be compared directly.
The set contains the overview at Landscape ×0.09, Rooftops ×0.95 and Interiors
×2.40, plus the POPULATION, ECONOMY, BUILDINGS and CREATURES panels. Terrain
coverage is complete: the landscape reference has 0 % black pixels and 83,499
colours; the overview contains only 0.3 % dark fog-of-war area, and the two
close views contain none. Buildings, residents, trees, resource icons, HUD
rings and panel icons are all present. No page errors, console errors or failed
requests occurred while opening the panels, zooming and panning; the only
browser messages were the known SwiftShader `ReadPixels` warnings.

Against `5cbf350`, the roof-level terrain below the fixed top bar is
pixel-identical (mean absolute difference 0.011, 0 % of pixels above 3). The
landscape differs by a mean of 0.85 levels, with 99.99 % of pixels within 10
levels; every difference above 50 is confined to the top bar's live morale and
treasury text, not the world. Zooming, panning and starting the realm left the
population, building and resource numbers unchanged.

**Root-cause fix:** The static asset audit found 18 external SVG references, of
which 17 resolved. The CREATURES tab referenced
`assets/command-emblems.svg#dragon`, but that atlas contained only crown,
scales, seal, cards, coins, book and people. The panel therefore had no dragon
emblem. A matching heraldic dragon symbol was added; the audit now resolves
18/18, and the deployed CREATURES panel shows the emblem and its illustration.

**Performance attribution:** The old shipped build mixed two effects. Applying
the low-end settings after the realm was already running measured 7.522 % of
quiet frames above 33 ms; preloading the same settings measured 1.891 %. The
latest post-start-settings run measured 3.457 % above 33 ms, 16.8 ms p95,
0.247 % above 50 ms and one Long Task; the dense phase measured 0 % above
33 ms, 0 % above 50 ms and no long tasks. Timestamp probes still show occasional
single heavy simulation ticks (31.5 ms at the day-90 fauna/services pass) and
terrain-cache rebuild slices, so the residual is not claimed to be exclusively
a harness artefact. Two guards are now in place. A delayed frame executes at
most one fixed simulation step and keeps the rest in the accumulator, so a
catch-up frame can no longer run several settlement ticks back-to-back; every
tick still runs in the original order and the deterministic campaign does not
use wall-clock pacing. The forest-habitat cache ceiling rose from 12,000 to
20,000 entries so a full 160×160 default forest map stays resident: the
day-90 tick probe fell from 41.2 ms to 31.5 ms, quiet tick p95 from 16.0 to
13.1 ms, and the dense phase reached 0 % over 33 ms. The cache remains bounded
and is still invalidated by geography, succession, climate and forest-option
changes.

**Verification:** `npm test` 905/905 with the syntax, relative-import and UI-id
check passing for 137 source files and 203 referenced UI ids. The 25-year
campaign ends at 10,040 ticks with `allComplete:true`, all intermediate, era and
agenda requirements true, and `noStalls:true` (0.841 ms/tick). Visual proof:
[artifacts/visual-proof](artifacts/visual-proof/).

### 3.15.0-dev — Cold-start frame budget (realm start pass)

**Released:** 2026-11-13

**Scope:** The cold start of the hosted build on the low-end profile
(1366×768, 4× CPU throttle, 8 s quiet / 6 s dense). Rendering, map detail,
save schema and the deterministic campaign are unchanged.

**Changes:** The opening realm is now assembled before the start screen lifts:
terrain detail is settled, room/modifier/herd/chronicle caches are warmed, the
opening routes and resident paths are memoized, and the first production cycle
runs behind the overlay. `state.hasStarted` is only set when that work is done,
so neither the runtime nor the save path can observe a half-founded realm.
Large settlements spread their six-tick production batches over three stable
entity-id phases instead of booking every building in one block; small
settlements keep the old single batch so the production contract in isolated
tests is unchanged. The settlement fields scan entities once and reuse the
stable list, the economy modifier caches are precomputed, and the recycling
goods ledger keeps an exact idempotency-key index. The A* cache is keyed by
tile, resident search trees are typed arrays with generation stamps and a
bounded per-movement expansion budget, and only one resident search runs per
movement call. The HUD refreshes at 1.5 s and the minimap at 4 s, while the
first full HUD and world paint happen behind the overlay. The carrier render
path no longer builds the complete logistics snapshot, and top status reads the
cached sovereign instead of rebuilding the royal house.

**Before (5cbf350) / before this pass (2ab825a) / now (same host, clean runs):**

| Phase | p95 frame | >33 ms | >50 ms | Long tasks |
| --- | --- | --- | --- | --- |
| Quiet cold start | 83.4 / 33.5 / **16.8 ms** | 88.4 / 27.7 / **2.56–4.83 %** | 31.4 / 1.94 / **0–0.44 %** | 12 / 3 / **0–1** |
| Dense mature | 66.7 / 33.3 / **16.8 ms** | 49.3 / 8.2 / **0–0.56 %** | 8.45 / 0.61 / **0 %** | 10 / 0 / **0** |

Median frame time is 16.7 ms in both phases. Quiet tick p95 is 10.6–13.5 ms;
dense tick p95 is 11.3–13.8 ms. The two clean final runs had no
quiet long tasks and no frame over 50 ms. A control run with the low-end
settings preloaded cut quiet frames over 33 ms from 7.522 % to 1.891 %, which
isolates most of the residual as harness settings application and terrain-cache
settling; timestamp probes still show a few single heavy settlement ticks and
cache-rebuild slices, so not every residual frame is a harness artefact. One
host-contended repeat measured 0.44 % over 50 ms and one Long Task; the other
final runs measured zero in both. The 2ab825a build still had three quiet long tasks
(largest 82 ms) and 1.94 % over 50 ms; those are gone.

**Verification:** `npm test` 905/905 and the syntax/relative-import/UI-id check
passes for 137 source files and 203 UI ids. The deterministic 25-year campaign
still ends at 10,040 ticks with `allComplete:true`, all intermediate/era/agenda
requirements true and `noStalls:true`. The terrain browser reference renders on
WebKit WebGL and exits 0; its generated reference files are left untouched when
the pixels are unchanged.

### 3.15.0-dev — Low-end render budget (performance pass)

**Released:** 2026-11-13

**Scope:** Frame-time work for the shipped hosted build on the low-end profile
(1366×768, 4× CPU throttle, 8 s quiet / 6 s dense). No gameplay, save-schema or
simulation change.

**Changes:** The first terrain detail raster is now built in 3 ms slices while
the start screen still covers the realm; the game loop starts only after the
layer is settled, so the first playable frames do not carry the cold build. A
cold build paints directly on the visible terrain surface instead of waiting
for a full offscreen staging pass. Building artwork is painted once per tick
into a reusable per-building sprite and blitted between ticks, with a 1 ms
per-frame refresh budget and a bounded cache. The district person badge (ring,
status colour, emoji, crown) is a cached glyph sprite; bob, lean, feet and draw
order remain per entity. HUD chunks run one per task between animation frames
instead of sharing the world frame. Furniture upkeep reuses the existing room
snapshot instead of walking every building twice.

The measured gains come from the building sprite cache and the visible cold
start; a terrain prewarm loop, entity-sprite prewarm and banded ground blit
were each reverted after they failed to improve the same harness.

**Before (5cbf350) / after (same host):**

| Phase | p95 frame | >33 ms | >50 ms | Long tasks |
| --- | --- | --- | --- | --- |
| Quiet cold start | 83.4 → **33.5 ms** | 88.4 → **27.7 %** | 31.4 → **1.94 %** | 12 → **3** |
| Dense mature | 66.7 → **33.3 ms** (best run 16.8) | 49.3 → **8.2 %** | 8.45 → **0.61 %** | 10 → **0** |

Median frame time is 16.7 ms in both final phases; dense tick p95 is 15.8 ms
and draw p95 4.2 ms. Three quiet-phase long tasks remain (largest 82 ms); the
realm start itself is no longer one of them.

**Verification:** `npm test` 905/905 and the syntax/relative-import/UI-id check
pass for 137 source files and 203 UI ids. The deterministic 25-year campaign
still ends at 10,040 ticks with `allComplete:true` and `noStalls:true`. The
terrain browser reference renders on WebKit WebGL and exits 0.

### 3.15.0-dev — The Second Crown and its Era Agenda

**Scope:** A one-time post-ambition fork. After the thirteenth royal ambition,
the realm receives **The Second Crown**: three authored directions for the next
age. The choice awards a bounded resource, morale, faction and hidden-realm
package, permanently biases existing event weights, and opens a three-stage era
agenda that reshapes ordinary simulation.

**Content:** **The Common Weal** favours harvests, festivals and migration;
**The Guild Compact** favours caravans, guilds and craft; **The Royal
Ascendancy** favours succession, taxation and the border. Each path records a
legacy entry and persists in `state.ambitions.era` without a save-schema bump.
The choice is delivered through the existing realm-event modal and scheduler.

**Reachable agenda:** Common Weal now asks for food, housing capacity and then
population. Guild Compact asks for treasury, collected taxes and more treasury.
Royal Ascendancy asks for legitimacy, a war chest and collected taxes. The
Guild/Crown stages previously depended on manual trades, soldiers and prestige
that the deterministic campaign never produced; they now use the already-running
treasury and tax flows. The campaign builder responds to the Common Weal housing
objective by building the next cottage through the normal construction and
logistics paths. The final ambition gate now opens at year 20 instead of year 25;
its population, treasury and morale requirements are unchanged. The 25-year
audit therefore has five years for the post-ambition era and reaches all three
Common Weal stages in years 21–23 without changing a target or a test check.
The campaign player may add real farms while the granary stage is open, and the
four-seed/three-profile audit may buy grain through the existing market; both
are ordinary actions, not grants.

**Persistent consumers:** Common Weal changes `foodDemandFactor` in the economy
and `migrationFactor` in population growth. Guild Compact changes
`taxEfficiency` in the economy and `tradeFactor` in the market. Royal Ascendancy
changes annual `legitimacyYear` drift in politics and `unrestFactor` on rebellion
event weights. Old era saves without an agenda normalize to a clean first stage.

**Verification:** focused ambition tests **20/20**; full `npm test` **787/787**;
50-year reruns after the gate are `ok:true` with **3/3 agenda stages** for Guild
Compact (years 22, 23, 25) and Royal Ascendancy (years 20, 22, 23). The
12-run player-profile matrix is 12/12 green, including `agendaStage` and
`agendaFeedback`, with no stalls or game over. Pre-gate Common Weal 50-year
reference: **0.902 ms/tick**; Guild **0.927 ms/tick**; Royal **0.904 ms/tick**. Observed transcript changes
include Common Weal population 73 → 74, legitimacy 98.28 → 100, morale 93.35 →
96.33, treasury 6,493.96 → 6,595.86, food demand 0.97 → 0.9506 and migration
1.0 → 1.12; Guild treasury 5,361.44 → 5,538.20, taxes 8,969.85 → 9,321.34, tax
efficiency 1.03 → 1.0609 and trade 1.05 → 1.0815; Royal Ascendancy legitimacy
98.32 → 98.34, nobility 68 → 70, treasury 5,005.88 → 5,211.11, and rebellion
weight 1.0 → 0.9. The 25-year campaign now finishes with **3/3 Common Weal stages** and all
campaign requirements green; the 50-year Guild Compact and Royal Ascendancy
reruns also finish 3/3. The Chromium chronicle audit still completes both
chronicles, chooses Guild Compact, shows `ERA AGENDA · 1 OF 3` with `167 / 517
gold`, and reports **0 page and 0 console errors**.

**Not covered yet:** the three campaigns use one seed and the builder profile;
they do not cover every build order or player strategy. The browser audit checks
the stage-one agenda HUD but does not complete an agenda stage in the browser.
There is no separate scalar stability statistic; legitimacy, morale and faction
support represent stability. No deployment was performed.

### 3.15.0-dev — Tropische Regenwälder (1.2.4)

**Status:** released on `ulmweb-branch`; production https://kings-and-cards.pages.dev/ is verified after each release build.

**Scope:** The tropical rainforest extends the one shared forest model instead
of adding a second ecosystem. A sixth climate profile carries humid heat, a
wet/dry rhythm, an evergreen canopy and only rare highland snow. Thirteen tree
species and twelve formations are appended after the existing thirty-nine, so
every numeric save index stays stable; the vocabulary now holds thirty-three
species and fifty-one formations. The derived stand exposes all sixty-five
required rainforest points individually through `TROPICAL_POINTS` and
`stand.tropical.features`: giant emergents, buttresses, lianas, epiphytes,
palms, bamboo, giant ferns, big-leaf plants, orchids, bromeliads, pitcher
plants, pools, flood pulses, swidden plots, plantations, river trade, hazards
and medicinal bark.

**Presentation:** The renderer now separates emergent, spreading, vase, banyan,
airy and understorey silhouettes, adds a denser closed tropical canopy, hanging
lianas, epiphytes and bromeliads, and gives each formation its own ground wash,
understorey mix and land-use marks. Floodplain, swamp and riverbank keep a
lighter crown cover so their wet ground and alluvial gaps stay readable. A
separate tropical floor pass prevents the temperate leaf/moss/fern pass from
painting over the tropical water, fields and tracks. Tropical ground keeps its
green wet/dry palette through the calendar year instead of turning autumn
copper or winter grey; the seasonal sheet shows wet-season flush, main
fruiting, dry-season peak and the warm rainy season under an evergreen canopy.
Fauna, gathered goods, spoilage, work penalties and quinine/fever-bark medicine
all flow through the existing simulation, survey and economy paths.

**Chronicles:** two new three-stage authored arcs extend the event library:
**wildlife** follows a herd from the field boundary to a royal warden charter,
and **fishing** follows a silver run through a shared-weir dispute to a river
compact. Both link choices to resources, morale, hidden prosperity/tension and
political factions, and can award `deer` or `river-weirs` cards. They reuse the
existing chronicle queue, participant memories and save format.

**Verification:** `npm test` 771/771; syntax and relative imports clean for 107
source files / 189 UI ids; focused tropical suite 8/8, tropical integration
7/7 and event-chain suite 5/5; browser reference 12/12 formations and four
seasonal frames on WebKit WebGL at 800 × 800; playability audit 1,200 ticks at
60 FPS with no page/console errors; full browser E2E passed (world forge, cards,
drag placement, save/load, military, health, faith/justice and forestry);
chronicle browser audit completed wildlife and fishing through all six stages,
drew all four queued rewards and verified every faction delta;
25-year campaign 10,040 ticks / 13/13 / 0.821 ms per tick; 100-year campaign
40,040 ticks / 13/13 / 0.823 ms per tick. The refreshed reference was checked
visually for the twelve formation silhouettes, dense canopy and readable
understorey.

**Audit pass:** The 65-point audit closed the remaining presentation gaps:
native primate, reptile, fish and amphibian silhouettes; jaguar/ocelot rosettes
and toucan/macaw colour; mid-storey trees; ancient hollows and beard moss;
medicinal, rare and toxic understorey plants; exposed roots, rotting logs and
rotting logs with fungus; streams, broad rivers, waterfalls, temporary flood water,
fish traps and mosquito vectors. Watercourses are limited to floodplain,
riverbank and montane formations so ordinary rainforest tiles never acquire
artificial blue stripes. The simulation pass then connected the remaining audit
paths: tropical goods deliver through real food, medicine, gold and timber
channels; gathered food spoils daily and on delivery; disease, parasites, poison,
predators and storms feed the existing health system; undergrowth slows villagers
and carriers through a cached movement factor; land-use crops and plantation goods
enter the economy with a river-trade bonus; and clearance/regrowth now modulate
forest succession. Full status and the explicit non-visual risk paths are
documented in `docs/TROPICAL_RAINFORESTS.md`.

### 3.15.0-dev — Mischwälder (1.2.3)

**Status:** development branch only; not a production release.

**Scope:** Completes the mixed-forest phase without a second woodland model. The
shared stand generator now returns a first-class mixture with ratios, dominant
species, group/mosaic pattern, age structure, canopy layers, understorey,
ecotone, seasonal light, autumn palette, food plants, habitat value, wood
grades, phenology and silvicultural uses. The numeric indices of the fifteen
broadleaf and twelve conifer formations are unchanged; the twelve mixed
formations are appended after them.

**Species and formations:** five new trees (ash, hornbeam, rowan, hazel,
willow) bring the forest vocabulary to twenty species; twelve new formations
cover oak–beech–birch–spruce, fir–beech–maple, pine with broadleaves, alluvial,
montane, open, dense, ancient, young, ecotone, coppice-with-standards and
selection forest. Grouped stands draw mostly from a tile's own species group;
even stands bypass the bias. A 5×5 coarse island hash reserves a minority of
grouped/mosaic tiles for a single broadleaf or conifer species, so small pure
islands occur inside the mixed matrix. The mixed share now weights conifer
pests, snowbreak and drought, so a spruce minority no longer receives a
pure-spruce disturbance rate. Control parties are priced for every disturbance
kind.

**Products and presentation:** new timber and gathered goods (ash keys,
hornbeam seeds, rowan berries, hazelnuts, willow withies, woodruff, valerian,
tinder fungus, elderberries) flow through the existing delivery ledger. The
forester survey exposes the mixture; the terrain renderer draws grass and herb
understorey; seasonal foliage covers the new species. The mixed visual
reference captures all twelve formations plus one stand through four seasons.

**Long-term gate:** A new century test runs 100 years / 40,000 daily
succession and regrowth steps with a real resource + succession save/reload
every ten years. It starts with 65 pure islands (49 broadleaf, 16 conifer),
keeps 63 through the century and reports 0 stand or succession fingerprint
mismatches across all ten reloads. Pure islands are derived from the saved
world and stock ratio; even stands still receive none.

**Verification:** focused mixed/forest suite 42/42; full `npm test` 751/751;
syntax and relative imports clean for 105 files / 189 UI ids; deterministic
25-year campaign `ok:true`, 10,040 ticks, 13/13 ambitions, no game over, 0.807
ms/tick; mixed reference 12/12 formations and four seasons on WebKit WebGL with
artifact hashes. A fresh Chromium/Playwright browser rerun matched the tracked
mixed reference 12/12 with 0 mismatches across 372 field comparisons (31 per
formation). The browser harness now waits for the decoration overlay to rebuild
before capturing, so a slow software renderer cannot save a ground-only panel.
No save schema bump; old saves keep every numeric formation index.

**Full record:** [docs/MIXED_FORESTS.md](docs/MIXED_FORESTS.md).

### 3.14.2 — Crown Legacy Roundtrip Fidelity

**Released:** 2026-11-10

**Scope:** Extends the save/load audit from the Merchant to all five Crown
Legacy paths and fixes the state changes found by those longer runs. No save
schema bump is required.

**Fixes:** Loading a realm no longer replaces a saved household treasury of
zero with the default starting wealth. Saved citizen roles, professions,
statuses, profession history and household assignments are authoritative
during load;
the loader no longer recalculates a job, moves a resident into another house or
writes a synthetic status/health change. Homes are reserved from the saved
population register before any unhoused entity is assigned. The journey harness
now selects the Grand funding tier, sells a bounded surplus through the shipped
market for the builder, and asserts the path-specific legacy instead of the
Merchant's Crown Treasury for every run.

**Verification:** focused Population/Crown Supply/Diplomacy/Justice tests
**49/49**; full `npm test` and the final five-path measurements are recorded
below with the release receipt.

### 3.14.1 — Save/Load Fidelity

**Released:** 2026-11-10

**Scope:** Closes the first full save/load roundtrip audit after 120 years, including the Crown Legacies. The audit found and fixed three persistence defects without a save-schema bump.

**Fixes:** Crown Supply history now preserves each settlement tick. Loading a realm preserves saved civic happiness, loyalty, health, immunity and census ticks instead of recalculating them from a partially rebuilt settlement. Entity restoration preserves a saved `null` aged-year and a missing immunity value instead of inventing year 1 or zero. Trade-history records now carry their realm id, and legacy null justice/optional history fields normalize without synthetic values.

**Verification:** `npm test` **736/736**; focused Crown Supply, Diplomacy, Justice and Population tests **47/47**. The Merchant journey over 120 years reached **48,008 ticks**, 42 residents, **16/16 Crown works**, **1/5 Crown Legacies** including The Crown Treasury, and 33 legacy entries. A UI save, full page reload and Continue load restored an exact semantic save snapshot: all 65 compared top-level fields, every live entity, homes and the authoritative population register matched, with no page or console errors. The loaded Endeavours panel showed 5 paths, 20 projects, 1 legacy per path, and scroll position 0. The comparison canonicalizes only documented derived caches (carrier paths, needs history/timestamps, visual anchors and warehouse stock summaries).

### 3.14.0 — Crown Legacies

**Released:** 2026-11-10

**Scope:** Closes the first post-100-year completion gap in Crown Endeavours. Each of the five paths now ends in one large, one-time Crown Legacy after its three works reach tier 5; completing all five records the Eternal Crown. The release also fixes a management-panel scroll bug found in the final browser screenshots.

**Content:** The builder's **The Living City**, warlord's **The Unbroken Watch**, diplomat's **The Concord of Crowns**, merchant's **The Crown Treasury** and scholar's **The Eternal Library** join the existing fifteen repeatable works. A legacy has its own reserve cost, annual work requirement and permanent modifier, uses the existing named overseer and funding controls, can be completed only once, and adds a legacy chronicle entry plus morale and legitimacy. The five legacies take the panel from 75 to 80 possible completions. Completing all five records **The Eternal Crown**, with an additional morale and legitimacy award and a visible panel banner. Old saves receive no legacy progress and remain loadable; no save-schema bump was needed.

**Interface fix:** the v3.14.0 screenshots showed the Endeavours intro clipped under the tab deck when the previous management panel had been scrolled. Selecting a tab now resets the command-content scroll to the top; action re-renders deliberately keep the player's position.

**Verification:** focused Endeavour tests **10/10**; full `npm test` **734/734**; deterministic 25-year campaign **`ok:true`**, 10,040 ticks, **0.728 ms/tick**, 13/13 ambitions; syntax and relative imports for **105 source files** / **189 UI ids**. The post-change browser run is the Merchant over 120 years: **48,008 ticks**, **0.622 ms/tick**, 42 residents, **16/16 works**, **1/5 Crown Legacies**, 288 trades, no game over, no page or console errors, and no overflow at 1600 px or 864 px. Five 100-year journeys were already green before this additive change (builder 13 works / 66 residents; warlord 14 / 50 / 2 battles; diplomat 14 / 54 / 4 alliances; merchant 15 / 42 / 240 trades; scholar 10 / 86 / 17 technologies). The legacies are a completion layer, not a claim that the game has been proven for 1,000 hours.

### 3.13.4 — Shared-Simulation Performance

**Released:** 2026-11-10

**Scope:** Closes the open 3.13.3 performance requirement without weakening simulation depth, ambitions, yields or save compatibility. Profiling and the measured 100-year/matrix record are in [docs/DEEP_PLAYTEST_3.13.4.md](docs/DEEP_PLAYTEST_3.13.4.md).

**The measured problem:** on one 8-vCPU Node 26 host the reference seed ran at **2.745 ms/tick** and seed 7 at **9.534 ms/tick** over 40,040 ticks. The profile named forest-fauna stand reconstruction (≈44 %), carrier pathfinding including a duplicate route after pickup (≈26 %), repeated building placement work (≈16 %), succession's per-tick `Object.entries` allocation (≈8 %), service workforce rebuilds (≈7 %) and repeated inventory normalisation in stock checks (≈6 %).

**Root fixes:** an exact fauna habitat cache keyed by stock, capacity, succession kind/age, climate and forest setting; one herd-occupancy map per simulated day; a route cache invalidated by world, building-collision and road revisions plus removal of the duplicate post-pickup carrier route; raw geography queries for placement/forester/survey instead of full stand construction; a cached static building list for overlap checks; allocation-free succession iteration with cached profiles and an exact live tile count; one workforce/active-service snapshot per settlement pass; and inventory checks that only initialise a missing store instead of re-normalising every store per product.

**100-year evidence:** every seed is green, at 70 residents, 13/13 ambitions, 0 unresolved stalls, 0 food shortage and no game over:

| Seed | Tick cost | Ticks | Eternal Deeds |
|---|---:|---:|---:|
| 20261108 | **0.995 ms** | 40,040 | 3 |
| 7 | **1.780 ms** | 40,040 | 2 |
| 99 | **0.847 ms** | 40,040 | 2 |
| 42 | **0.798 ms** | 40,040 | 1 |

Seed 7 repeated at **1.819 ms/tick**, so its observed range is 1.78–1.82 ms. The reference seed fell from 2.745 to 0.995 ms; seed 7 fell from 9.534 to 1.78–1.82 ms (5.2–5.4×). All four runs are faster than the requested 2.3–2.6 ms band; the 2.6 ms ceiling is met with margin and no artificial load was added to reach the lower bound.

**25-year matrix:** 4 seeds × 3 playstyles, **12/12 green**, all **13/13 ambitions**, **63–75 residents**, **0 unresolved stalls**, no food collapse and no game over. Tick costs are **0.758–1.137 ms/tick**. Every crown-relief attempt succeeded (1–3 per run, 0 failed).

**Verification:** `npm test` **724/724**; syntax, relative imports and UI ids **105 files / 189 ids**; habitat-cache regression covers immediate harvest and succession invalidation. The production URL is verified separately after Cloudflare Pages serves the exact release commit.

### 3.13.3 — Seed-Robust Living Realm

**Released:** 2026-11-10

**Scope:** Makes the unchanged 25-year `eternal-realm` ambition reachable through real population, relief and trade mechanics on four seeds and three playstyles. No ambition target, housing rule, mortality rate or resource yield was weakened.

**The dead end:** 3.13.2 documented seeds 7 and 99 finishing the deliberate 25-year route at 45 and 44 residents (12/13). The flat two-resident annual allowance shared by births and immigration put a hard ceiling on slower worlds. The previous clinic expansion was not a repair: clinics consumed labour and materials without producing food, starving seed 99 and stalling the reference seed.

**Mature immigration:** a realm that has survived ten years and still has water coverage ≥ 0.40, safety ≥ 0.35, household satisfaction ≥ 0.45, food ≥ 4 per resident, adequate morale, a free bed and an allowed villager can welcome **three residents per year** instead of two. Births still share the allowance. The allowance is re-evaluated every ten ticks, not every tick, and cannot bypass the normal settlement gate. The mature route is an immigration incentive, not a resource grant.

**Crown relief:** `crown-relief.js` turns a blocked visible growth gate into one costed action through the existing crown supply systems: the next waterworks level, a regional granary contract or emergency provision from held harvest and surplus goods, and a stone rebuild of an existing cottage for two extra places. The PEOPLE panel exposes it as `data-command="crown-relief"`. Safety and morale keep their real building/policy requirements; there is no purchased shortcut. A mature realm can sell surplus wood or stone above a 1,200 construction reserve through the real market path to cover relief costs, keeping a 2,400-gold reserve. No resources are created.

**Measured 25-year matrix:** 4 seeds × 3 policies (builder, settler, ignorer), all **12/12 green**, every run **13/13 ambitions**, **63–75 residents**, **zero unresolved stalls**. Seed 99's settler recovered two blocked sites and ended with 2,405 gold / 74 food. Reference 25 years: 13/13, 75 residents, 2.363 ms/tick. The seed 99 settler previously finished at 44 residents; it now reaches 66. No clinic was added and no ambition was lowered.

**Performance:** the reference 25-year route measured **2.363 ms/tick** and the deterministic 100-year route **2.423 ms/tick** over 40,040 ticks, both inside the requested 2.3–2.6 ms band. Alternate seeds measured 3.19–4.63 ms/tick; that terrain/entity-cost gap is documented, not averaged away. The 4,000-tick browser check held 60 FPS / 16.7 ms with 2.07 ms simulated work per tick, no page or console errors and no horizontal overflow.

**Verification:** `npm test` **723/723**; syntax, relative imports and UI ids **105 files / 189 ids**; full 12-run matrix; 100-year campaign 13/13 with 3 Eternal Deeds and 0 stalls; browser growth gate visible. Full record: [docs/DEEP_PLAYTEST_3.13.3.md](docs/DEEP_PLAYTEST_3.13.3.md).

### 3.13.2 — Visible Growth Gate

**Released:** 2026-11-10

**Scope:** A stalled population gate is now explained in the PEOPLE panel instead of appearing as unexplained stagnation. This is a presentation and diagnostics patch; yields, growth speed, save data and campaign balance are unchanged.

**The dead end:** the reference realm opened with 21 residents and 22 beds, then reached 18 residents after ten years with a free bed. The yearly settlement check was correctly rejecting newcomers because local safety was 0.2, below the 0.35 threshold, but the panel showed no reason and no recovery action. A player could only guess why housing was not attracting anyone.

**The fix:** `getPopulationGrowthGate()` is now the shared explanation path for the yearly growth update. The PEOPLE panel renders a `GROWTH GATE` block before its effects, naming housing, water, safety, food reserve or morale, with the concrete next step. The start state explains that a watchtower covering occupied homes is needed; an open realm says growth is open. The gate is read-only and uses the same settlement rules as the simulation.

**Verification:** `npm test` **719/719**; syntax, relative imports and UI ids **104 files / 189 ids**; browser playability 4,000 ticks at 60 FPS with the gate visible and no page/console errors; reference 25-year campaign **13/13, 59 residents, 2.288 ms/tick**; 100-year campaign **13/13, 70 residents, 3 Eternal Deeds, 40,040 ticks, 0 stalled sites, 2.563 ms/tick**. The three-seed audit still exposes low-health seeds 7 and 99 at 45/44 residents (12/13); the attempted clinic expansion was reverted because it starved the food chain and stalled the reference seed. That balance gap is documented, not hidden. Full record: [docs/DEEP_PLAYTEST_3.13.2.md](docs/DEEP_PLAYTEST_3.13.2.md).

### 3.13.1 — War Granary
**Released:** 2026-11-10
**Scope:** The last unmet v3.13.0 requirement: a warlord ending with a standing garrison and at least two years of food demand in reserve. A fourth grain-contract tier, four seasonal deliveries, harvest call-in, commissary barter and an emergency draw; the other four journeys keep their existing targets and improve.

**The remaining dead end:** v3.13.0 ended the warlord at 46 residents, 11 soldiers and 55 food. Annual demand was 298 (46 × 6 + 11 × 2), so the reserve covered 0.18 years; two years required 596, a 541-food gap. The last pre-release run reached 239 food but only 0.66 years of its 360 demand, 481 short of 720. Raising farm yields globally or moving the annual settlement would have changed the other four journeys and added per-tick cost.

**War granary:** Grain level IV targets `max(420, population × 4 + 60, ceil(annual demand × 2.5))`, where annual demand is residents × 6 + soldiers × 2 + mounted soldiers × 2 extra. It pays 1.10 gold per food and is the only tier delivered in four seasonal shipments; levels I–III keep their annual target and annual delivery. The economy panel labels level IV **WAR GRANARY · 2.5Y RATIONS** and shows annual demand and reserve coverage in years. The final warlord has 47 residents and 11 soldiers (including one mounted), demand 306, target 765, and 749.9 food — **2.45 years** — with **11 soldiers**.

**Commissary:** `PROVISION THE GRANARY` calls in grain already held by farms and warehouses (a transfer, not a new harvest), sells stone then wood above a 600/600 construction reserve through `executeTrade`, buys food at the contract rate, and barters directly at 2 wood or 3 stone per food when coin or market grain is exhausted. Level IV may use the last goods when below one year of rations. Grain purchases always preserve the `60 + 8 × soldiers` garrison payroll. The direct barter is available at every active grain level, with the 600/600 reserve; levels I–III keep annual delivery.

**Journey results (year 101, real UI):** builder **60 residents / 300.6 food** (0.82 years, was 140); warlord **47 / 749.9 / 11 soldiers / 2.45 years** (was 46 / 55 / 11 / 0.18); diplomat **60 / 420.1** (1.15 years, was 143); merchant **42 / 71% water / 7,045 gold** (1.11 years, was 6,552 gold); scholar **89 / 416.6** (0.77 years, was 76 / 107). All five kept water and safety above zero and produced no page or console error. The last pre-release gaps were 19 food (builder), 24 (diplomat), 445 gold (merchant), 12 residents (scholar) and 481 food (warlord); each is closed by the commissary, the final surplus sale or the war granary, not by global yield changes.

**Performance:** deterministic 100-year campaign `ok:true`, 40,040 ticks, final year 101, 13/13 ambitions, 3 eternal deeds, no game over, **2.556 ms/tick** against the pre-change **3.299** baseline (v3.12.0: 3.261; v3.13.0 sample: 2.534). The five browser journeys measured **2.226–2.485 ms/tick**. The only added cadence is one bounded `settleCrownSupply()` call per 100-day boundary while level IV is active.

**Compatibility:** `state.crownSupply` is now schema version 2; `lastGrainSeason` is additive and normalized to zero for older saves. Levels clamp to 0–4 and history to 24 entries. Saves without the field receive the zeroed structure and keep their existing well, farm, market and housing behaviour. The thirteen royal ambitions, their order and rewards, `allComplete` semantics and the eternal-deed state machine are unchanged.

**Verification:** focused crown-supply **11/11**; `npm test` **716/716**; syntax and relative imports for **104** source files / **189** UI ids; five independent 100-year browser journeys through the real start screen, management tabs, build menu, trade, diplomacy, military and research, each with desktop and narrow screenshots; campaign 40,040 ticks / 13/13 / 3 eternal deeds / **2.556 ms per tick**. Full record: [docs/CROWN_SUPPLY.md](docs/CROWN_SUPPLY.md).

### 3.13.0 — Crown Supply
**Released:** 2026-11-10
**Scope:** Three player decisions that break the late-game resource dead ends, plus the supply links that make them work: standing grain contracts, paid waterworks, stone housing, farm subsistence, garrison pay in kind and bounded partner restock.

**The three dead ends:** The five v3.12.0 journeys ended in the same self-reinforcing spiral from five directions. The warlord ended year 101 with 0 food and 1 soldier after white peace in year 71, because the garrison ate the granary and desertion ate the garrison. The merchant ended with 20 residents and 0 water coverage despite 7,646 gold, because wells need a staffed building and a legal tile, not coin. The builder and diplomat ended with 15–20 food. A shortage lowered immigration and morale, which lowered the labour that produced food, and a timber cottage's four places capped growth before the realm could grow out of it.

**Crown supply:** The economy panel now exposes three annual commitments. A grain contract (levels I–III: 120/240/420 food, raised by population) buys from open, non-war trade partners at 1.25/1.20/1.15 gold per food and always keeps `60 + 8 × soldiers` gold back for the garrison payroll. Paid waterworks (water carts, cistern network, aqueduct service) cover 40/65/90% of occupied homes for 18/36/58 gold a year, count exactly like a well in `updateServices`, and stop immediately when the payroll fails. A completed timber cottage can be rebuilt in stone for 55 gold (42 with a mason), raising capacity from 4 to 6 without a new footprint. Farms now book a direct subsistence share of their crop, so a farmed realm is not dependent on a spare carrier; a full granary settles 40% of the coin payroll in kind; and trade partners restock a bounded share of their starting stock so repeated purchases cannot drain every route forever.

**Journey results (year 101, through the real UI):** builder 43 → 60 residents and 15–20 → 140 food; warlord 28 → 46 residents, 0 → 55 food and 1 → 11 soldiers; diplomat 43 → 60 and 15–20 → 143 food, with four alliances; merchant 20 → 42, 0 → 71% water coverage, 7,646 → 6,552 gold and 200 trades; scholar 46 → 76 and 15–20 → 107 food with all 17 technologies. Every realm kept water and safety coverage above zero, finished with no game over, no page or console error and no horizontal overflow at 1600 px and 864 px. The five runs measured 2.412–2.504 ms/tick over roughly 40,000 ticks each.

**Performance:** The deterministic 100-year campaign is `ok:true`: 40,040 ticks, 13/13 ambitions, 3 eternal deeds, final year 101, no game over, **2.534 ms/tick** (baseline 3.261; the pre-change tree re-measured 3.299 on this host). Two hot paths were removed rather than measured around: `updateLogistics` rebuilt the full presentation snapshot (job/carrier/ledger copies plus ten physical-stock scans) every second tick although only the UI reads it, and the goods book re-filtered and re-sliced its 600-row ledger on every single booking.

**Compatibility:** `state.crownSupply` is additive and normalized on load; saves without it receive zeroed levels and keep the old well, farm and housing behaviour. Levels clamp to 0–3 and history to 24 entries. The thirteen royal ambitions, their order, rewards and `allComplete` semantics, and the eternal-deed state machine are unchanged.

**Verification:** focused crown-supply 6/6 including defaults, annual purchase, payroll reserve, partner restock, waterworks suspension and stone capacity; `npm test` 711/711; syntax and relative imports for 104 source files / 189 UI ids; five independent 100-year browser journeys with desktop and narrow screenshots; campaign 40,040 ticks / 13/13 / 3 eternal deeds / 2.534 ms per tick. Full record: [docs/CROWN_SUPPLY.md](docs/CROWN_SUPPLY.md).

### 3.12.0 — Crown Endeavours
**Released:** 2026-11-10
**Scope:** Five replayable post-ambition player paths, fifteen projects, twenty-four technologies and a new management tab.

**Content:** The five 100-year player journeys exposed the same late-game dead end from five directions: after the thirteenth ambition the realm had eternal deeds but no long-term project that joined the court, economy, army, diplomacy and research. Crown Endeavours adds the builder, warlord, diplomat, merchant and scholar paths. Each path has three named projects and five repeatable tiers (seventy-five completions in total), real resource costs, a named resident as overseer, Thrifty/Steady/Grand funding, annual progress and permanent modifiers to housing, health, morale, taxes, trade, research, military power, diplomacy, legitimacy and food demand. Projects unlock in sequence; a higher tier never invalidates an earlier one.

**Late research:** Eight late technologies (deep plough, seed banks, blast furnace, printing press, hospitals, vaccination, standing bureaucracy, great charter) extend the research tree from sixteen to twenty-four entries, so the scholar path still has discoveries after the old tree is complete. The late tree feeds the same research modifiers and save schema.

**War front and white peace:** The warlord journey exposed a hard late-war dead end: war was a treaty flag with no battle, food collapsed under the muster, and `SUE FOR PEACE` demanded food the realm no longer had, so a 70-year war produced 0 battles and 20 desertions. While a realm is at war, the annual military update now opens a bounded border front: at most one raid per year while no raid is active, two troll raiders near the keep, resolved by the existing named-garrison combat, wounds, losses and battle records. War exhaustion at 35 unlocks a white peace that costs no gold or food, so a losing war can always end; paid peace remains below the threshold. `lastWarRaidYear` is normalized for old saves. Warlord result: war declared year 31, 3 battles on the surviving roster (23–33 cumulative battle marks during the war), 9 losses, 15 desertions, white peace year 71, 28 residents, 44 buildings, 15 works, 2.909 ms/tick. Full record: [docs/WAR_FRONT_AND_WHITE_PEACE.md](docs/WAR_FRONT_AND_WHITE_PEACE.md).

**Compatibility:** `state.endeavours` is additive and normalized on load; saves without it receive empty paths, and malformed projects, funding or overseer ids are discarded. The thirteen royal ambitions, their ids, order, rewards and `allComplete` semantics are unchanged, as is the eternal-deed state machine. The management deck gains a nineteenth tab; the old eighteen tabs and all build, trade, faith, justice, military and diplomacy controls remain.

**Verification:** `npm test` 705/705; focused diplomacy/military/Endeavour/research 32/32 including the white-peace regression; syntax and relative imports for 103 source files / 189 UI ids; five independent 100-year browser journeys through the real start screen, management tabs, build menu, roads, trade, diplomacy, military and research, each with desktop 1600 px and narrow 864 px screenshots, no page or console errors and no horizontal overflow. Final realms: builder 43 residents / 37 buildings / 16 roads / 15 works; warlord 28 / 44 / 15 works / 3 battles / 9 losses / 15 desertions / white peace year 71; diplomat 43 / 36 / 15 works / 4 alliances at relation 100; merchant 20 / 34 / 15 works / 52 trades / 1,543 food / 7,646 gold; scholar 46 / 36 / 15 works / 17 technologies. Browser journeys measured 2.763–2.909 ms/tick. The deterministic 100-year campaign is `ok:true`, 40,040 ticks, 13/13 ambitions, 3.261 ms/tick (baseline 3.276), final year 101, 3 eternal deeds, no game over. Full record: [docs/CROWN_ENDEAVOURS.md](docs/CROWN_ENDEAVOURS.md) and [docs/WAR_FRONT_AND_WHITE_PEACE.md](docs/WAR_FRONT_AND_WHITE_PEACE.md).

### 3.11.0 — The Eternal Chronicle
**Released:** 2026-11-10
**Scope:** Repeatable eternal deeds after the thirteen royal ambitions, drawn from the live realm.

**Content:** The 50-year deterministic audit found the real long-term gap: after the thirteenth ambition the realm had no further goal and froze at 70/70 residents and 50 buildings. Fifteen eternal deed families now continue the same HUD card from live systems — population, housing, completed buildings, roads, treasury, granary, morale, household satisfaction, resolved issues, technology, alliances, prestige, garrison, places of faith and trade. Each deed fixes its target when issued, pays its resource reward and prestige exactly once, and immediately issues the next. A deed that makes no progress for three years is set aside without reward instead of blocking the chronicle, and extreme targets are withheld before the hard entity and map limits.

**Compatibility:** The thirteen royal ambitions, their ids, order, rewards and `allComplete` semantics are unchanged. `state.ambitions.eternal` is additive and normalized; saves without it load with defaults, and malformed deeds are discarded. The HUD keeps `13 / 13` and shows `ETERNAL DEED · N`, existing progress and `ETERNAL REWARD`.

**Verification:** focused ambitions 12/12; `npm test` 696/696; syntax/relative imports 101 source files / 189 UI ids; 50-year campaign 20,040 ticks, 13/13 ambitions, `ok:true`, 3.037 ms/tick, with two eternal deeds completed and three stalled deeds set aside across the run; browser 25-year campaign shows the eternal HUD at 1600/1024/864 px with no page or console errors. Full record: [docs/ETERNAL_DEEDS.md](docs/ETERNAL_DEEDS.md).

### 3.10.0 — The Living Realm
**Released:** 2026-11-10
**Scope:** Integrates the named population and households, realm founding, court and diplomacy, faith and justice, named military and public health, research and legacy, the PEOPLE panel, and the conifer/terrain reference updates.

**Fix:** The crown household now stays anchored to the keep, and pre-fix v3.10.0 saves with fractional royal coordinates normalize on load instead of being rejected.

**Verification:** `npm test` 687/687; syntax/relative imports 101 source files / 189 UI ids; Chromium E2E passed; conifer reference 12 formations + 4 seasons; 25-year campaign 10,040 ticks / 13/13 ambitions / 3.142 ms per tick.

### 3.10.0-dev — Living population, households and civic effects
**Status:** development branch only; not a production release.

- Added a persistent citizen register with name, age, sex, origin, household, profession/status, vocational talent, health, happiness, loyalty, faith, tradition, wealth share, profession history and civic events. Households store their residence, capacity, members, head, wealth, relations and annual history. The existing person profiles and entities remain the canonical identity; the register is an additive layer synchronized once per year.
- The annual census is deterministic (stable person-id order, no `Math.random`) and bounded to 420 citizens / 900 households. It records status, profession and health transitions, forms households for married partners when capacity allows, records births, maturation, ageing, illness and death from the existing annual systems, and allows one low-loyalty departure only in a starving, collapsing realm.
- The census entry point checks the stored census year before normalizing, so the annual event cannot become a per-tick deep copy; a focused assertion locks the no-op path to the live register object.
- Loyalty, employment, talent and health now feed bounded tax, building-output, legitimacy-pressure and soldier-quality modifiers through the existing economy, politics and military paths. The named garrison's talent drives military quality; the crown is classified as royal, never as a soldier.
- Save schema 7 carries the register additively. Absent, partial and malformed records are normalized and clamped, and an old save is populated from its live houses and residents on load without a crash.
- Added the 18th management tab, **PEOPLE**, with a population overview, eight filters, search, citizen cards, household details and recorded relationships. All tab-count contracts were updated from 17 to 18.
- Eight focused tests cover citizen persistence, deterministic annual census, partner household formation, talent-driven modifiers, royal/soldier classification, save/load round-trips, legacy-save normalization and removal of dead residents.

**Verification:** focused population 8/8; `npm test` 683/683; syntax/UI 101 files / 189 ids; 25-year campaign 10,040 ticks / 13/13 ambitions / no game over, with post-fix runs at **2.980, 3.016, 3.023, 3.025 and 3.073 ms/tick** (min 2.980, median 3.023, max 3.073; spread 0.093 ms). The median is **0.039 ms (1.3%) below** the 3.062 ms baseline, and the highest run is 0.011 ms (0.4%) above it, inside the observed spread. The pre-fix runs measured 3.132–3.215 ms/tick because the census entry point deep-normalized the register on every tick before its annual early return; the check now happens before normalization and a same-year no-op returns the live register. Preview and production both return HTTP 200 and serve byte-identical population modules; both environments are `published:true`. Full record: [docs/LIVING_POPULATION.md](docs/LIVING_POPULATION.md).

### 3.10.0-dev — Pointer steering, on-demand cards and portable terrain reports
**Status:** development branch only; not a production release.

- **Realm founding charter:** the start screen now defines a realm through its name, house, culture, religion, tradition, legal order, legitimacy doctrine, founding chronicle and starting charter. Five religions, five traditions, five legal orders and five legitimacy doctrines aggregate real tax, trade, research, military, food-demand, legitimacy and mortality modifiers through the existing culture path; the neutral defaults preserve old saves and deterministic balance. Six starting charters grant real wood, stone, gold, food, morale, legitimacy or research, and **oligarchy** plus **mixed constitution** join the government forms. The management GOVERNMENT panel exposes the charter. Old identities normalize additively without a save-schema bump, and the research cache now invalidates on every founding choice. Eight focused tests; full suite **675/675**; syntax/UI checks **99 files / 189 ids**; 25-year campaign **10,040 ticks / 13/13 / 37.6 s / 3.062 ms per tick**. See [docs/REALM_FOUNDING.md](docs/REALM_FOUNDING.md).

- **Faith, culture and justice:** two annual simulations now run from the live realm. Named clergy hold real convictions and competence; shrines and temples create congregation and clergy capacity; the culture budget, three festivals, funded pilgrimages and heresy tension spend real resources and change morale, legitimacy, tax reach, trade, mortality, military morale and migration. Named judges hold real competence and integrity; courts and prisons create judicial and prison capacity; crime emerges from inequality, hunger, war, quarantine and unemployment; five sentences, four legal codes, guild and town charters, and corrupt judges change the treasury, population, trade, migration and desertion. New building types 70 shrine, 71 court and 72 prison are fully buildable; the starting realm includes a completed shrine and court, while the prison remains a real decision. Both systems are annual, cache their modifiers and add no per-tick scans. Save schema 6 serializes, normalizes, validates and safely migrates both states; a loaded realm restores named office holders, charters, cases, sentences, festivals, pilgrimages, heresy and histories exactly. Two new FAITH and JUSTICE tabs expose every action, cost, person, statistic and history. Thirteen focused tests cover the systems; the full suite is 657/657, syntax/UI checks cover 96 files and 185 ids, the browser E2E builds both structures, appoints a cleric and judge, holds a festival, tries a case and round-trips save/load, and the 25-year campaign still completes 13/13 ambitions at 4.545–4.546 ms/tick.

- **Named garrison and public health:** barracks and stables now hold a named, trainable garrison rather than counters. Adult residents can be recruited into real guard entities, removed from the civilian workforce and drilled over 10–90 days under a named instructor; duration and success respond to season, marshal competence, food, morale, equipment, rank and war. Soldiers can be equipped, mounted on paid warhorses and demobilised; annual musters pay gold and food, consume stable pannage, record morale and desertion and keep a bounded history. Combat reads rank, equipment, morale, mount and wounds, and writes victories, wounds and permanent casualties back to the individual record. Health now connects sanitation, water, household and community transmission, per-resident immunity, named healers, medicine brewing/treatment/sale, 240-day quarantine with real market penalties, and annual mortality by age and occupation. The new **MILITARY** and **HEALTH** panels expose every action and the underlying people, costs, coverage, medicine and audit records. Save schema 5 adds and normalizes both domains. Eight focused tests cover recruitment, drill timing, equipment and horses, sanitation, healer coverage, medicine, quarantine market effects, mortality and save normalization. Full implementation and deployment record: [docs/MILITARY_AND_PUBLIC_HEALTH.md](docs/MILITARY_AND_PUBLIC_HEALTH.md).

- **Royal court and living diplomacy:** six named court offices with competence, loyalty and integrity derived from real resident traits, needs and the crown relationship; annual salaries, corruption, estate savings, resignations and vacancies; one faction petition per year with grant/ignore consequences; appointed envoys with skill, annual relation, trade-term and war-exhaustion effects. The court feeds economy taxes, health containment, combat readiness, market terms and diplomacy. The diplomacy panel shows envoys, war exhaustion and the new actions. Additive save fields are normalized; malformed court saves are rejected. Nine new tests cover appointments, audit, corruption, petitions, vacancies, envoys and save normalization.

- Completed the 1.2.2.29 forest sight-filter audit and production proof. One generation-scoped tile cache now serves every renderer sight query: buildings, figures, selection rings, construction and Forester overlays, all field layers, service/resource/fertility markers, logistics-route endpoints, the placement preview, particles, floaters and cached terrain fauna. The existing 100 ms entity/carrier caches remain; there is no per-frame DDA or per-item allocation for these gates. Roads, ground and the full-screen weather/daylight/vignette layers are terrain/atmosphere, not entity markers. `tests/browser/forest-occlusion.mjs` now proves a behind building, carrier, particle and floater are all absent while equal-distance open controls are present. Forcing the renderer filter to always-true fails the run on the behind entity; restoring the exact file passes again. Final checks: `npm test` 617/617, `npm run test:campaign` 25 years / 10,040 ticks / 13/13, conifer reference 12 formations + 4 seasons, occlusion green. Code commit `2b743e6c3dc5a2ffa4a48953e6eba2e2a07128de` was pushed to `ulmweb-branch` and Cloudflare Pages served it at https://kings-and-cards.pages.dev/; the live `renderer.js`, `terrain.js`, `CONIFER_FORESTS.md` and browser-test SHA-256 hashes match the commit. Live Chromium smoke: fresh realm seed `1547552200`, 21/22 population, 0/13 ambitions, 0 console errors.

- Closed the last two documented accessibility gates. A keyboard-first **Skip to game content** link is now the first focusable element; it is off-screen until focused, shows a 3 px ring, and Enter moves focus to `#main-container`. The dialog manager now applies `inert` plus `aria-hidden="true"` to every non-top body region, including nested settings, and restores each element's exact previous state on Escape or close. Production Chromium verification: the start dialog, settings cycle, focus trap, skip activation, 0 controls below 24 px, no horizontal overflow and 0 console errors all pass. The full Node suite is 612 tests.
- Added a living soil cycle to every farm. A completed harvest removes fertility (larger crops cost more), fallow and harvested ground recover slowly, an operational stable within six tiles adds manure recovery, and exhausted fields take a full fallow year instead of sowing. The building register shows soil percentage and resting state; legacy saves default the new values safely. Four focused tests cover depletion, rest years, manure and save round-trips; the full Node suite is 612 tests and the deterministic 25-year campaign still completes all 13 ambitions without a food collapse.

- Completed the conifer 1.2.2 audit pass. Every tree now derives its own height, trunk, crown and lean from a stable per-tree roll, so a stand is no longer one repeated silhouette. Wolves and lynx are real herds with local prey biomass, condition, predation pressure, migration and saves; crossbill, capercaillie, mouse and songbird joined the simulated community. Windthrow is now a live, weather- and exposure-weighted conifer disturbance alongside fire, bark beetle, snowbreak and drought. The renderer adds local snowdrifts, wet hollows and bog pools, wet-bark resin glints, spring needle tips, roots and shrubs on the conifer floor, treeline krummholz and weather-driven crown motion. The survey exposes species diversity (Simpson dominance), sight radius, wind exposure, wetness, deadwood and treeline; the same values feed the Lumber Yard/Forester site report. Focused coverage adds per-tree form, derived survey fields, real predator/prey herds and storm windthrow. The full Node suite is 605 tests.
- Added eight original local SVG house emblems. The sovereign dossier derives a stable crest from the dynasty name and uses the same emblem for current and former sovereigns, without external image requests.
- Added persistent contextual-tooltip, reduced-motion and high-contrast preferences. They are applied as presentation-only document modes, keep the existing local settings store, and do not change simulation state or save data.

- Proved the full 25-year Royal Ambition campaign with a deterministic scripted player in Node and Chromium. The run starts the shipped realm, builds through the real construction and road APIs, staffs and supplies the city through real carrier jobs, appoints an heir, resolves realm events and reaches all 13 ambitions at year 26 with 65 residents, 46 operational buildings, 3 mills, 3 bakeries, 4 farms, 2 towers and stable food/wood/gold/firewood. Headless: 10,040 ticks in 34.7 s, 3.53 ms/tick. Browser: 32.2 s, 2.729 ms/tick, 58 FPS / 17.3 ms frame at 1600×1000, no page or console errors. The fixes: hauls reserve at most one cartload and release the unpicked remainder, the starting lumber yard keeps its woodcutter, service coverage ignores empty cottages so expansion no longer silently closes the immigration gate, and the scripted player extends tower coverage as housing grows. `npm run test:campaign` and `npm run test:campaign:browser` keep the audit reproducible; the suite is 578/578.
- Added an in-game device benchmark in **Settings → Performance**. It measures the live realm through all three terrain renderer choices at 100, 85, 70 and 50 % render scale (12 configurations), samples only actually rendered frames (at least twenty per configuration), and reports FPS plus average main-thread draw time. The settings panel is hidden during the run so the result measures the game rather than the overlay; a compact progress bar stays visible and can be cancelled. The run temporarily uses a 60 FPS target and disables adaptive fallback for a fair comparison, and always restores the player's renderer, scale, frame limit, adaptive quality and overlay setting without saving changes.
- Performance and renderer options: automatic terrain detection now probes on a detached canvas, keeps software WebGL off the first frame, and otherwise uses WebGL on real GPUs. The Canvas path keeps the complete ground, grain, fog, shore detail and vegetation on a cached static terrain surface instead of re-rasterising them every frame; the surface is rebuilt only after camera, zoom, season, exploration or renderer changes. Added **Terrain renderer** (Auto/WebGL/Canvas 2D), a **60/30 FPS** cap, optional **Render scale** (100% default, 85/70/50% for weak devices), **Adaptive quality** and an optional **FPS / frame-time overlay**. While the Canvas view is being dragged, the cached detail layer follows the camera and only newly exposed strips use baked ground; the full layer is rebuilt when the view settles. No artwork, decorations or resolution levels were removed at the 100% default.
- Added the shared Laubwald ecology for 1.2.1: eight broadleaf species (oak, beech, birch, maple, chestnut, linden, elm, alder), fifteen formations including old-growth, alluvial, hillside, regenerating, fire, windthrow, disease and cut-over states, age classes from saplings to ancient giants, understorey/soil/deadwood layers, seasonal goods and deterministic wildlife herds with populations, carrying capacity, hunting pressure, migration and dispersal. Forest resource nodes, the Lumber Yard/Forester survey and the terrain renderer now read the same `forestStandAt()` model, so a displayed oakwood is the same wood the economy harvests. Added `forest-reference.png` (all fifteen formations) and `forest-seasons.png` (one ancient wood through four seasons), their JSON metadata, CI generation and the 60-point implementation audit in `docs/FOREST_ECOLOGY.md`. Fixed the signed per-tile tree roll that had made every forest stand render conifer silhouettes, so the broadleaf palette now actually renders as broadleaf in every season. A four-year, three-seed wildlife audit then calibrated winter mortality and reproduction, fixed the 400-day migration-period wrap and reserved split targets against same-day migration. The measured result is 132–148 herds at year end, 0.370–0.382 capacity fill, 41–76 migrations per year after settling, one herd per tile and no duplicate IDs; harvesting forest stock to 30 % lowers the stable population by 28.3 % without collapsing it. The new `forest-fauna-longrun.test.js` locks these invariants in.
- Simulated 100 years (40,000 days) of lumber harvest, player gathering and the real sliced regrowth together. Eight Lumber Yards plus four gathering sites every five days kept 85.1 % forest fill (lowest 85.0 %); yards alone held 91.8 %. A 40-yard/eight-site stress run ended at 60.1 % with 499 depleted tiles while regrowing more than it removed (917,977 vs 769,440), so the loss is local concentration rather than stock exhaustion. No balance change was required; the managed-plus-gathering century is now a regression test.
- Foresters now prioritise the most depleted stands in their five-tile range, scale planting with actual staffing efficiency and expose range stock, restorable tiles and their current stewardship action in the building register. The record now has a dedicated **Forest Stewardship** block with a live fill meter and status; selecting the lodge marks the restorable stands on the map (red bare, amber recovering, green nearly full) so regrowth is visible without developer tools. Player-driven planting and felling invalidate the cached woodland raster at visible stock stages instead of leaving an old canopy on screen. A dedicated Playwright audit (`npm run test:forester-stewardship`) starts a real realm, verifies the rendered values over multiple ticks and captures before/progress/after screenshots and JSON evidence. The catalogue's zero-batch forest recipe no longer runs a fake harvest that could overwrite the Forester's status.
- Extended the Forester stewardship audit to ten game years across three seeds and rotating harvest pressure. The browser run now covers seeds `20261108`, `7` and `99` for 30 years (12,000 days): a fresh cut of one to three stands each year, two to four stands thinned every twenty days, and an annual clear-cut on a rotating day between 80 and 140. Across the run 14,256 stock was removed against 13,473 saplings planted; every year ended at full stock (6,975/6,975, 9,857/9,857 and 11,969/11,969), 0 restorable stands and `Forest is fully grown`. The range never fell below 95.8 % and never showed `Forest stand is depleted` or `Waiting for planting space`. Each cut frame carried exactly its scheduled one to three red markers, all recovered frames carried none, and the yearly stewardship DOM matched the live simulation. The three-seed browser run completes in 162.7 s against an explicit 240 s budget. The deterministic `tests/systems/forester-stewardship-longrun.test.js` locks in three seeds × ten years (12,000 days) with variable clear-cut sizes and days, annual harvest variation and visual-revision checks (`npm test` **572/572**); `npm run test:forester-stewardship-longrun` writes the production-style browser evidence to `docs/forester-stewardship-longrun/`. The browser CI workflow now runs the same audit after a successful Chromium E2E step, enforces the 240 s budget, and uploads the JSON report, screenshots and log as the `kings-and-cards-forester-stewardship-longrun` artifact. The report is written before the budget assertion, so a run that overshoots still uploads its measured duration and per-seed evidence.
- Extended the intensive 40-yard/eight-site case to 200 years. The original seed went from 60.06 % forest fill at year 100 to 59.93 % at year 200; two further seeds ended at 62.32 % and 60.59 %. All three stayed in a 60–62 % band with no failed harvesting actions, so the pressure thins the wood to a stable working range instead of triggering a long-term collapse.
- Deepened the Laubwald ecology with coupled soil, moisture, morning mist and one shared solar vector, grouped herds with movement and visible tracks, browse, carcasses, nests and territory marks, eight species-specific timbers plus new seasonal understory goods and leaf silhouettes, and fire/windthrow/disease spread every 12 days with a paid 90-day containment action. A 40-year, two-seed audit found the active disturbance share stable at 6.6–9.9 % (peak in year one) with 96 % forest fill, so the spread rates stay unchanged. The audit also exposed that `regrowForests` was never called by the simulation: regrowth now runs as a 400-day cycle in 400 daily slices, preserving the one-stock-per-25-days average while a half-depleted 576 × 576 realm costs ~2.3 ms median per slice instead of ~800 ms for a full pass. Without regrowth the same audit lost 35 % of forest stock by year 40.
- Seasonal overhaul: fixed snow in summer. Weather now follows a season-aware table and spells last 3–12 days instead of 280–1100; a snowfall is reconciled to rain as soon as the snow-cover curve reaches zero, and old saves are clamped on load. The ground uses one continuous calendar with asymmetric snow (accumulates through late autumn, peaks in winter, melts through early spring) and leaf-litter/green-up curves; palette colours and sun elevation are anchored mid-season so a season reaches full colour in its middle instead of on its first day. Trees and shrubs now turn and drop per tree and species: birch is early, oaks and beeches keep brown leaves into winter, conifers stay green under snow, and bare crowns draw real branches instead of a grey ball.
- Added five climate profiles (`temperate`, `northern`, `mediterranean`, `arid`, `enchanted`) that shift the same continuous snow and foliage curves instead of forking them: northern snow arrives earlier and melts later, mediterranean and arid winters hold less snow, and per-species snow retention keeps conifer loads while birches shed early. The temperate profile remains the baseline. A full-year browser audit now simulates 400 days with the real seeded weather stream, records each day's weather and six species' foliage in `docs/terrain-reference/season-year.json`, and fails on summer snow, bare conifers or missing oak marcescence. The contact sheet, `season-transition.png`, `tree-seasons.png` and that log are uploaded together as the CI terrain artifact; the suite is now 512 tests.
- Added a climate reference that holds the same generated world, seed, grove tile and 2.40× camera while switching only the climate profile: `docs/terrain-reference/climate-reference.png` shows all five climates at days 250, 280, 310 and 50, and `climate-reference.json` records the measured ground and per-species state. A live check runs five separate realms through 400 real `updateWeather()` days each, writes five 1280 × 800 day-330 screenshots plus `climate-live.png` and `climate-live.json`, and fails on summer snow, too few weather changes, missing oak marcescence, a northern realm that is not snowier than an arid one, or conifers that do not retain more snow than birches at day 30. Bare crowns now use a tapered trunk, five to seven primary limbs, twigs and snow on the branch tips; marcescent crowns also draw the branch silhouette over the remaining leaves. Conifers use four needle tiers with snow accumulated and shed per tier plus clumps on the outer tips. The unit-test count remains 501 because this round adds visual and integration coverage, not new unit tests.

- Map panning uses pointer capture, so a drag continues across the canvas edge and over HUD plaques instead of stopping at the first overlay. Gameplay keyboard bindings were removed; Escape still cancels drags and closes dialog panels.
- Removed the permanent five-slot card hotbar. Cards are drawn one at a time from the Cards panel, only when the player presses **Draw random card**; nothing is dealt on a timer and no card is selected automatically.
- A map click no longer places a card. Placement is drag-only, from the Selected Card inspector onto a validated tile. After placing or discarding a card, no replacement is armed.
- The obsolete **Card draw pace** setting was removed with the automatic draw loop.
- Added **Download JSON** to the terrain benchmark page (and `?json=1` for an automatic download). The report contains renderer, WebGL version, viewport, user agent, device pixel ratio, capture time and draw/frame medians and p95 for all four zoom levels.
- Touch gestures no longer leak a map click: a two-finger pinch is marked as a gesture, so lifting the fingers cannot open a construction site or attack. Pinch zoom now follows the finger-distance ratio instead of the wheel-delta factor, and `touchcancel` clears stale pan and pinch anchors.
- Terrain detail art pass: the deterministic atlas now ships 256 px tiles with four seamless variants for grass, forest, rock, sand, snow, earth and wetland (8 MiB, uploaded once per context). The shader cross-fades neighbouring variants and uses the red, green and blue channels for relief, macro contrast and fine crust instead of sampling only red. A 1440×900 Chromium run compiled the shader without warnings, uploaded the 2048×1024 atlas and rendered zoom 1 and 2.4 views without page or console errors; the software renderer cannot stand in for a real-GPU quality check.
- Added a committed terrain visual reference: a reproducible Playwright capture of all four seasons at all four zoom presets, written to `docs/terrain-reference/contact-sheet.png` with metadata and a regeneration guide. The browser CI workflow generates the same reference into a temporary directory and uploads the contact sheet and metadata as an artifact, including when the gameplay E2E step fails.
- Completed the terrain checklist 1.1 audit: fixed shoreline distances to scale with each world's 2–5 samples per tile, wired the previously computed arid weight into the sand material, added a noise-broken coastal sand fringe and close-view water-crest highlights. Added three shore-distance regression tests and two shader-path contracts; the full suite is now 476 tests.
- Updated unit and browser contracts for the new flow: `npm test` passes 471 tests; a focused Chromium run verified a 90/40 px pointer drag, five on-demand draws, no auto-selection, drag placement, blocked map-click placement and the JSON download with four measured levels. A touch-emulated 412×915 Chromium run verified a 60/30 px one-finger pan, a 2.5× pinch from an 80 px finger spread, no click after a pinch, and a still-working deliberate tap.

### 3.9.0 — The Living City: construction, logistics and production
**Released:** 2026-11-06
**Scope:** City-builder foundation. New structures are construction sites; physical carriers move goods between producers, consumers and warehouses; seasonal farms and managed forests supply the realm.

- Added construction sites with staged material deliveries, staffing and cancellation.
- Added local inventories, bounded warehouses, haul and supply reservations, and visible carriers.
- Added grain → flour → bread, logs → planks and firewood, stone → cut stone, and well-water chains. Bread becomes royal food only after warehouse arrival.
- Added seasonal field states, forest stewardship, housing tiers, settlement needs and service coverage.
- Added city HUD and construction panels plus save schema 4 with backward-compatible normalization.
- Added a five-year full-city test with 26 buildings, 43 workers and three parallel material chains, plus a focused grain-to-bread chain test.

**Verification:** `cd game && npm test` — 363 tests pass; the syntax/import check passes for 69 source files and 159 referenced UI ids. Chromium browser E2E was not completed in this cloud session because the Playwright headless-shell package could not be installed within the command limit; the production push triggers the repository Game Quality workflow.

### 3.8.0 — HUD 3.8: The Throne Room
**Released:** 2026-11-05  
**Scope:** Presentation only. No simulation rules, save schema, card values or economy balance were changed.

- Replaced the mixed prototype header with a two-row royal banner: identity plate, realm calendar, morale, player seal, a five-resource ledger with live per-tick deltas and a full-width command bar.
- Widened the administration rail to 96 px so every label is fully readable, added a DOMAIN divider and allowed the rail to scroll on short screens.
- Framed the world stage with a grain/vignette layer and a compass ornament, removed the duplicated canvas zoom chip and kept the real HTML zoom controls.
- Rebuilt the hand as five explicit slots with numbered empty states. The 820 px dock no longer collides with the minimap, which is now anchored above it.
- The card inspector has an honest empty state instead of a PLAY ribbon over an empty frame, and the selected card uses the royal card atlas rather than an emoji.
- Resource chips and store cards show rounded live income deltas; raw floating-point values no longer leak into the HUD.
- `.hidden` is now a global contract, so the EXIT BUILD control no longer remains visible outside construction mode.
- The founding screen becomes a two-column illuminated plate at desktop sizes, so the World Forge and every action fit without inner scrolling.
- Terrain prerendering gains north-west hillshade, coastal lightening, water depth tone and broad mottling. Grass tufts and flowers are jittered and translucent instead of repeated glyphs.
- Every building type has a distinguishable rooftop silhouette, with a dedicated castle plan for the keep, a stone cross plan for the temple and animated mill sails.
- Added `tests/ui/hud-v3.test.js` with twelve static contracts and repaired the resource-flow formatter that produced raw floating-point strings.

**Verification:** `cd game && npm test` — 279 tests pass; the syntax/import check passes for 56 source files and 99 referenced UI ids. Browser geometry checked at 390×844, 900×1000, 1440×900 and 1920×1080: no horizontal overflow, no topbar group overlap, no clipped hand cards, no minimap/hand collision, five hand slots in every state, and no console errors during a live simulation run.

**Scope limit:** This is a presentation layer. It does not add management screens, cloud accounts, autosave or new simulation systems. The legacy stylesheets remain loaded beneath the HUD layer for backward compatibility.

### 3.7.0 — Master UI Phase 2 completion: sovereign dossier and connected lineage
**Released:** 2026-11-05  
**PRs:** [#80 — Sovereign dossier](https://github.com/Dulle1846/ulmweb/pull/80), [#84 — Connected lineage network](https://github.com/Dulle1846/ulmweb/pull/84)  
**Production merge commit:** `5f980cc656a0308db0b5ba6d664a615d4bca1bef`  
**Sovereign feature head:** `edf49e7fc7feda632410941859fb447941055301`  
**Lineage feature head:** `cedf972fdc95e55011bf169ec019156d15d4633a`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium gameplay E2E passed on the exact feature heads. The separate Workers build check failed; it is not the Cloudflare Pages deployment and was not used as Pages release evidence.  
**Cloudflare Pages smoke verification:** The official `kings-and-cards.pages.dev` homepage loaded, and the newly released `css/sovereign-dossier.css`, `js/presentation/character-dossier.js` and `css/dynasty-network.css` assets were fetched successfully from that Pages domain. The exact Pages deployment ID was not available in the GitHub evidence inspected here.

- Added a dedicated current-sovereign dossier backed by the royal-house model: consort, designated heir, living royal children and bounded royal-house chronicle.
- Former sovereign memorials are separated from the current ruler's live succession information.
- Added direct navigation from royal relatives into the canonical character dossier.
- Replaced disconnected dynasty relative groups with a connected, multi-lane graph for recorded grandparents, parents, sovereign, siblings, consort, aunts/uncles, cousins and children.
- Added SVG relationship connectors with distinct parent, guardian, partnership and sibling styles.
- Added hard rendering bounds of 80 lineage nodes and 120 edges, while retaining the existing descendant depth and per-generation limits.
- Added responsive styling, reduced-motion behavior, static UI contracts and deterministic Chromium coverage for the sovereign dossier and graph-to-dossier hand-off.
- No simulation rules or save schema were changed.

**Scope limit:** The lineage graph only displays recorded kinship links; it does not invent unknown relatives. This completes the current Phase 2 sovereign dossier and connected lineage increments, not the entire Master UI concept. Remaining work includes broader family graph interaction, complete character action workflows, screen-by-screen responsive/contrast/screen-reader audits, and the full art/animation pass.

## Production release history

### 3.6.0 — Master UI Phase 3: Economy, buildings, creatures and chronicle
**Released:** 2026-11-05  
**PR:** [#43](https://github.com/Dulle1846/ulmweb/pull/43)  
**Merge commit:** `ad4d3c9978779aa7cc4921ec43a934d1b8338b38`  
**Tested feature head:** `63ec3957697f4513ddeefd9ad5c5889689a0ceb7`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact feature head.  
**Cloudflare Pages:** Successful deployment check for production-branch commit `09c2d747f08216199154af480735eeae064d0e9b`; deployment ID `35e2a522-431d-4558-8195-06a24bb4dc2d`; [deployment preview](https://35e2a522.kings-and-cards.pages.dev/).

- Added a data-backed economy view separating resource stock, current-tick flows, the latest 20-day settlement and cumulative totals.
- Added a searchable building register with actual entity health, footprint, staff, workforce efficiency, catalogue cost and centre-tile resource data.
- Added individual living-dragon dossiers and memorial records with needs, bond, life stage, abilities, goals and memories.
- Added a searchable event inbox and chronicle with category filters, stored tick references and a dismiss/reopen flow for unresolved issues.
- Added browser coverage for the new panels, creature dossier, chronicle search and active-issue dismissal/reopening.

**Scope limit:** The simulation currently retains only the latest completed financial ledger, not a historical time series. Per-building production, storage and upkeep are not exposed. No trend charts or forecasts are fabricated. Chronicle history remains limited to the stored event log (up to 100 recent records); unread tracking and permanent external archives are not claimed. The initial seven-viewport screenshot matrix for the realm shell and management dialog was completed in Phase 5 (PR #66); full overlay-by-overlay responsive QA and the remaining original art atlas work remain outstanding. No simulation rules or save schema were changed.

**Release status:** Production branch `ulmweb-branch` contains version `3.6.0`; the Cloudflare Pages deployment check for the latest production-branch commit `09c2d74` completed successfully on 2026-11-05. The check exposes the deployment preview URL above. The canonical user-facing address remains https://kings-and-cards.pages.dev/.

## Production release history

### 3.5.0 — Master UI Phase 2: Dynasty and contextual actions
**Released:** 2026-11-05  
**PR:** [#40](https://github.com/Dulle1846/ulmweb/pull/40)  
**Merge commit:** `f47da8ecfd564ecf3edcd5913607407348e4aad6`  
**Tested feature head:** `e7f59bb3df9ae5961a2be65872f43e04978dd10a`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact feature head.

- Added the contextual management action dock for people, dynasty, cards, chronicle and manual save.
- Added a bounded multi-generation descendant tree sourced from saved kinship relationships, with direct links into the existing character dossier.
- Added save/load status feedback that only reports confirmed operation outcomes; no autosave is claimed.
- Added reusable parchment cards, dark panels, section headings, icon-button styles, tooltip surfaces and dynasty person cards.
- Added static contract tests and browser coverage for dynasty navigation, dossier hand-off, manual save and chronicle navigation.

**Scope limit:** The dynasty tree currently presents the sovereign's descendants with a depth and node cap; it is not yet a complete ancestor/sibling graph. The action dock is a contextual sidebar dock, not the final full-width lower action bar. The dedicated event inbox, autosave, full responsive viewport matrix and remaining UI concept screens are still outstanding. No simulation rules or save schema were changed.

### 3.4.1 — Master UI foundation
**Released:** 2026-11-05  
**PRs:** [#36](https://github.com/Dulle1846/ulmweb/pull/36), [#37](https://github.com/Dulle1846/ulmweb/pull/37)  
**Merge commits:** `b040adf7870678132f699a7a7889b3b556aa1307`, `e9efbcf60950e3b596b7b8670fccb2f4b47eee8b`  
**Pages deployment check:** successful on `e9efbcf`; [deployment preview](https://68e0b527.kings-and-cards.pages.dev/)

- Added the royal parchment/dark timber design-token system and shared component styling.
- Added the left royal administration rail and functional links to kingdom, government, people, dynasty, politics, economy, cards, creatures, building and settings screens.
- Added live top status indicators for resources and population.
- Added a data-backed kingdom overview for sovereign, year, population, morale, treasury, housing, workforce, legitimacy, resource stores and recent records.
- Reused the existing heraldic crest and SVG resource artwork in place of several placeholder glyphs.
- Added accessible selected navigation states and UI contract/browser tests.
- Follow-up guard now shows neutral values before a campaign starts and an explicit awaiting-founding state rather than misleading placeholder metrics.

**Scope limit:** This is the first UI foundation, not completion of the full Master UI concept. The remaining screens, asset suite, lower action dock, dynasty tree, building/resource dossiers, chronicle, event inbox and viewport matrix remain in development.


### 3.4.0 — Resource geography foundation
**Released:** 2026-11-05  
**PR:** [#34](https://github.com/Dulle1846/ulmweb/pull/34)  
**Merge commit:** `bffeb1afb82da9c51c622a0a6a0ed8006560c74b`  
**Feature head:** `b374d77dd565e2cfeab0a421d55f10940e43b00e`

- Deterministic resource geography generated from the world seed and terrain.
- Compact typed arrays for forest stock/capacity, stone stock/capacity, fertility and water access.
- Bounded forest and stone extraction primitives; stock cannot become negative.
- Capacity-limited forest regrowth.
- Sparse save deltas for depleted nodes, validation and legacy-save fallback.
- Unit coverage for determinism, deposits, water, fertility, search, extraction, regrowth and save round-trip.
- Browser E2E coverage for resource depletion across save/load.

**Explicitly not included in 3.4.0:** resource overlays, building-to-node extraction integration, warehouses, physical hauling and complete production chains. The resource model is a foundation, not yet a fully connected economy.

**Verification recorded:** Game Quality and Kings & Cards 2.1 checks succeeded on merge commit `bffeb1a`. Game Browser E2E succeeded on the exact PR feature head `b374d77`; it was not re-run on the merge commit in the recorded workflow set.

### 3.3.0 — Roads and settlement infrastructure
**Released:** 2026-11-05  
**PR:** [#27](https://github.com/Dulle1846/ulmweb/pull/27)  
**Merge commit:** `fe248e694b50477136f3cdb3a182466788fe1c32`  
**Tested feature head:** `5dba0ab974826fab3fd515639bc66ffa800928ba`

- Dirt, gravel and paved roads, with costs, upgrades and demolition refunds.
- Click/drag placement, explicit build-mode exit, rendering and intersections.
- Road-quality-aware movement and A* route costs.
- Road upkeep included in the economy ledger.
- Save/load and browser E2E coverage for road placement and persistence.

**Verification recorded:** Game Quality, Game Browser E2E and Kings & Cards 2.1 checks succeeded on the exact tested feature head.

### 3.3 documentation and release operations
**Merged:** 2026-11-05  
- PR #28 added studio operations, AI review guidance and roadmap documentation through 4.0.
- PR #33 updated the post-release audit and handed off the next phase to resource geography.
- These were documentation/operations merges, not separate player-facing game versions.

## Historical development lines and PR disposition

The following entries preserve the recorded development history. **They are not all production releases.** Their status is shown explicitly so that a feature branch is never mistaken for shipped content.

| Version line | Recorded work | GitHub record | Status at 2026-11-05 |
|---|---|---|---|
| 2.1 | Stability, performance, economy and living-world foundations | [PR #6](https://github.com/Dulle1846/ulmweb/pull/6) | Merged into `ulmweb-branch` |
| 2.2 | Seeded/deterministic simulation foundation | [PR #7](https://github.com/Dulle1846/ulmweb/pull/7) | Merged into 2.1 development branch; not a direct production merge |
| 2.3 | Event-linked personal chronicles | [PR #8](https://github.com/Dulle1846/ulmweb/pull/8) | Open |
| 2.4 | Species-aware life cycles | [PR #9](https://github.com/Dulle1846/ulmweb/pull/9) | Open |
| 2.5 | Explicit family and kinship graph | [PR #10](https://github.com/Dulle1846/ulmweb/pull/10) | Open, draft |
| 2.6 | Character dossiers and lifecycle aggregation | [PR #11](https://github.com/Dulle1846/ulmweb/pull/11) | Open, draft |
| 2.7 | Birth cooldown and family-save normalization | [PR #12](https://github.com/Dulle1846/ulmweb/pull/12) | Closed without merge |
| 2.8 | Explicit orphan guardianship | [PR #13](https://github.com/Dulle1846/ulmweb/pull/13) | Closed without merge |
| 2.9 | Royal dynasty / court / strategy UI | [PR #14](https://github.com/Dulle1846/ulmweb/pull/14), [#16](https://github.com/Dulle1846/ulmweb/pull/16), [#19](https://github.com/Dulle1846/ulmweb/pull/19) | Open drafts; overlapping lines |
| 3.0 | Government, politics, economy and card management UI | [PR #17](https://github.com/Dulle1846/ulmweb/pull/17) | Open draft |
| 3.1 | Persistent creatures / dragon lifecycle and dynasty strategy UI | [PR #18](https://github.com/Dulle1846/ulmweb/pull/18), [#20](https://github.com/Dulle1846/ulmweb/pull/20) | Open drafts |
| 3.2 | Deterministic combat retaliation | [PR #22](https://github.com/Dulle1846/ulmweb/pull/22) | Closed without merge |
| 3.3 | Roads and settlement infrastructure | [PR #27](https://github.com/Dulle1846/ulmweb/pull/27) | Production release |
| 3.4 | Deterministic resource geography | [PR #34](https://github.com/Dulle1846/ulmweb/pull/34) | Production release |

### Important branch-consolidation warning

Open, closed-unmerged and stacked PRs must not be merged mechanically. Several are based on other feature branches rather than the production branch, and some overlap. Their unique code, assets, tests and save migrations must be compared against the current production tree before selective porting. Keep source branches until a preservation matrix proves that no unique work is lost.

## 3.5.0-dev — Long-run playability and economic integration
**Development branch:** `kac-3.5-long-run-audit-and-ledger`

Planned scope:
- Reproducible multi-year campaign tests, including a 25-year simulation run.
- Long-run invariants for resources, population, entity counts, positions, morale and deterministic outcomes.
- Connect finite resource geography to actual lumber and quarry production.
- Add resource overlays and clear site-suitability feedback.
- Design and test storage reservations and physical hauling before adding more production chains.
- Review victory/game-over pacing and ensure sandbox play remains meaningful after the first milestone.
- Audit save/load compatibility and bounded memory/log/archive growth.
- Add a measured browser soak-test and performance budgets.

This line is not a production release until all release gates pass.

## Release checklist

Every release entry must record:
1. Version and date.
2. Production branch and exact merge commit.
3. PR and exact tested head.
4. Unit/integration and browser E2E results.
5. Save migration and backward-compatibility results.
6. Performance and long-run simulation results.
7. Cloudflare Pages deployment ID/status and the deployed commit.
8. Known limitations and explicit non-goals.

Never describe an unverified feature as implemented or a successful CI run as a successful deployment.


## Development line 3.7.0-dev — Master UI Phase 4 art production

### Portrait and illustrated-register increment
- Added a seven-archetype original heraldic portrait sprite library in `game/assets/royal-portraits.svg`.
- Integrated portraits into the people roster, character dossiers and dynasty cards.
- Added direct navigation through recorded family/relationship links, plus verified sovereign parents, siblings and cousins in the dynasty view.
- Added existing local building illustrations to each building-register entry.
- Added static UI contracts and Chromium E2E assertions for portrait assets, relationship navigation and building artwork.

**Scope limit:** This is the first portrait/art integration slice. It does not complete the requested building, creature, card, heraldry or animation atlas. No simulation logic or save schema is changed.


## Development line 3.7.0-dev — Master UI Phase 5 accessibility increment

- Centralized dialog focus handling with topmost-modal tracking, Tab/Shift+Tab containment and focus restoration/fallback.
- Added accessible dialog semantics and labels to the founding and settings screens.
- Added modal scroll containment and narrow/short viewport overflow rules.
- Added static modal-contract tests and Chromium E2E assertions for focus behavior.

**Scope limit:** This is not a full accessibility certification. Screen-reader testing, keyboard audit of every control, color-contrast audit and the complete viewport matrix remain open.


## Development line 3.7.0-dev — Phase 2 full-width action bar

- Promoted the contextual action dock from the right sidebar to a full-width lower bar beneath the game layout.
- Preserved the existing live action handlers and save-status semantics.
- Added responsive wrapping and E2E viewport checks at 390×844, 768×1024, 1280×720, 1366×768, 1600×900, 1920×1080 and 2560×1440.


## Development line 3.7.0-dev — Phase 4 building and title art

- Added 15 dedicated original SVG building symbols mapped to the current building type enum.
- Replaced the bright storybook title image with an original muted royal dusk panorama aligned to the parchment, timber and antique-gold direction.
- Added asset-contract and browser assertions for the title artwork and building atlas mapping.


## Development line 3.7.0-dev — Phase 4 card illustration

- Added original category artwork for the current card-group families and mapped the existing card group sprite identifiers to the new atlas.
- Replaced emoji duplication with a single scalable category illustration per card.
- Added an original parchment / antique-gold card frame and rarity treatments.
- Added static asset contracts and browser assertions; card rules, generation and save schema are unchanged.


## Development line 3.7.0-dev — Phase 4 dragon life-stage art

- Added five original dragon SVG illustrations for the simulation's persisted hatchling, juvenile, adult, elder and ancient life stages.
- Integrated stage-matched portraits into living dragon dossiers and memorial records.
- Added static asset contracts and browser assertions. No creature simulation or save data changed.


## Development line 3.7.0-dev — Phase 2 reusable control primitives

- Added shared primary, secondary, tab and icon button variants with consistent focus, hover, pressed, selected, disabled and reduced-motion states.
- Added reusable panel/header primitives and keyboard-accessible tooltip styling.
- Applied the primitives to founding actions, modal close controls, management tabs, panels and the full-width action bar.
- Added static and Chromium E2E contracts. Full legacy-control migration and a complete windowing API remain open.


## Development line 3.7.0-dev — Phase 2 reusable window primitives

- Added compact founding, small, medium and large reusable window presets.
- Added shared header/body/footer regions with controlled scrolling and short/narrow viewport bounds.
- Applied the primitives to settings, people dossiers, management, construction, event dialogs and the founding screen.
- Added static and Chromium E2E contracts. Drag/resize and final overlay stacking remain outstanding.


## Development line 3.7.0-dev — Phase 2 character roster filters

- Added living/deceased, role and species filters to the character roster.
- Role/species options are generated from actual persisted character records.
- Added responsive filter styling and static/browser regression coverage.


## Development line 3.7.0-dev — Phase 5 navigation accessibility correction

- Replaced misleading toggle semantics on the active administration navigation item with `aria-current="page"`.
- Added static contracts for all twelve navigation destinations and a browser test for keyboard activation of the live Economy screen.
- Full keyboard, screen-reader, contrast and visual viewport audits remain open.


## Development line 3.7.0-dev — Phase 5 viewport screenshot evidence

- Chromium now captures the realm and management dialog at all seven required responsive viewports.
- GitHub Actions uploads the screenshot set as a seven-day review artifact, including on failed runs where screenshots exist.
- This enables visual QA but does not itself certify the layout or complete the remaining accessibility audit.


## Development line 3.7.0-dev — Phase 5 responsive header correction

- Wrapped the global action controls onto a dedicated row at intermediate desktop widths and below the resource strip on narrow screens.
- Added Chromium checks for header overflow, overlap between header groups and clipped action buttons at all seven responsive viewports.
- Visual review also logged remaining art-direction work: world map/building presentation still contains simple placeholder-like shapes; this fix does not claim to complete world art.


## Development line 3.7.0-dev — Phase 5 mobile panel scroll

- Added contained vertical scrolling to the mobile management column so the card panel and lower tabs remain reachable on short screens.
- Added Chromium regression checks for actual scroll range and scroll movement at 390×844 and 768×1024.


## Development line 3.7.0-dev — Phase 5 merged responsive corrections

- PR #69 merged as `e4d343041ec6960502c471aa5efd2ca0994f85f5`; all three required workflows passed and the seven-viewport screenshot artifact was reviewed.
- PR #70 merged as `09c2d747f08216199154af480735eeae064d0e9b`; all three required workflows passed, including real mobile side-panel scroll checks at 390×844 and 768×1024.
- These are code merges to the production branch, not an assertion that Cloudflare Pages has already finished publishing them. Pages delivery remains a separate release gate.


## Development line 3.7.0-dev — Phase 5 mobile dock clearance

- Reserved 44px of bottom scroll space on narrow phone layouts to compensate for the action dock overlapping the side-panel's lower edge.
- Added a viewport-aware E2E assertion that the selected card is fully visible above the dock, with a real scroll only when the card starts obscured.
- Added scrolled-state screenshot evidence at 390×844 and 768×1024; no simulation or save data changed.


## Development line 3.7.0-dev — Phase 5 selected-card reachability evidence

- Added an end-to-end proof that the selected card can be brought fully into view within the mobile management panel at 390×844 and 768×1024. The test requires a scroll only when the card is initially obscured and a meaningful scroll range exists; if the card already fits, no artificial scroll is demanded. It also checks that the card is not covered by the bottom action dock.
- Browser CI also uploads dedicated scrolled-state screenshots for visual review; no game state or save data is changed.


### Mobile viewport follow-up

- Added 44px bottom scroll clearance at narrow phone widths because the bottom action dock covers part of the side-panel's theoretical lower edge.
- The browser assertion now positions the selected card above the dock's top edge, preventing a false pass where the card was inside the panel but still visually obscured.


## Development line 3.7.0-dev — sovereign dossier increment

- Added a dedicated royal-house section to the living sovereign's existing character dossier, backed by the authoritative royal-house model.
- Displays the currently recorded consort, designated heir, living royal children and bounded royal-house chronicle; related people reuse the existing dossier navigation.
- Former sovereign memorials are explicitly separated from the current monarch's live succession state.
- Added local responsive parchment/timber styling and static contracts for data provenance, navigation and bounded rendering.
- No simulation rules, entity records or save schema changed. Browser E2E for sovereign-to-heir navigation remains a merge gate.


## Development line 3.7.0-dev — connected royal lineage network

- Added a multi-lane family graph using verified kinship records for grandparents, parents, sovereign, siblings, consort, collateral relatives, cousins and royal children.
- Added live SVG connector paths with distinct parent, guardian, partnership and sibling styles, plus canonical person dossier navigation.
- Enforced 80-node and 120-edge limits; retained the existing descendant depth and per-generation caps.
- Added deterministic Chromium coverage for relationship paths and heir dossier navigation, with reduced-motion and responsive styling.
