# Kings & Cards — night shift 2026-11-25

Owner instruction: keep improving the game from a player's perspective while the
owner sleeps, add new content on top of what already exists and the documented
plans, commit and deploy, and keep watching what `freebuff` commits.

## Operating rules for every batch

- Branch: `ulmweb-branch` (production). `main` is obsolete.
- Game root: `game/`. Cloudflare Pages deploys from the pushed branch with no build step.
- Preserve the static browser architecture, save compatibility and deterministic simulation.
- Keep per-frame and per-tick work bounded; new ecological change stays on bounded cadences.
- Extend shared data and existing render/simulation patterns; no parallel systems.
- Run affected tests while iterating, then one full `npm test` per batch. Never lower a gate,
  a year count, a tick count or an assertion to save time.
- Simulation/economy work includes the deterministic 25-year campaign; visual or render work
  includes the relevant browser reference.
- Commit with a descriptive message, push, then verify the live production URL serves the
  exact version and the touched files. Append each batch to the table below.
- Watch `origin/freebuff/747ba2e7ecbd7eb66d9fab99` and any commit whose author or subject
  mentions `freebuff`. Report new commits here; integrate only after tests, never by force.

## Planned slices for the night

1. Authored story content for existing event families (first batch, complete).
2. More long-form chronicles for the remaining families without a chain (complete: all 30 live families now have one).
3. Player-facing readability: clearer event outcome text and card-reward notices where needed.
4. Small deterministic simulation/content improvements from `ROADMAP_3.3-4.0.md` that do not
   change save schema or per-tick cost.
5. Final morning audit: full suite, production E2E, version and deployment receipt.

## Batch log

| Time (UTC) | Batch | Files / content | Verification | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-25T01:15Z | Eight new authored chronicles plus noble-house heir continuity | `js/systems/event-chains.js`, `js/systems/nobility.js`, `tests/event-chains.test.js`, `tests/systems/nobility.test.js`, version `3.55.0`, changelog, generated spec audit | Focused suites 15/15; eight-seed 25-year noble sweep green after heir fix (seed 20261106 restored to 4 living houses); full `npm test` 1426/1426 plus syntax check (218 sources, 253 UI ids); `spec:audit` 3/3; `test:chronicles`, `test:nobility-ui` and `test:e2e` green; live production verified at 2026-11-25T01:20Z (`v3.55.0`, new chains and heir logic present) | `2684f5d` |
| 2026-11-25T00:24Z | Four more everyday chronicles: caravan, illness, bandits, festival | `js/systems/event-chains.js`, `tests/event-chains.test.js`, `CHANGELOG.md`, generated spec audit, night log | Focused event/events suites 19/19; all four reward categories instantiate; `spec:audit` 3/3; eight isolated 25-year noble audits and targeted `nobility-balance` 2/2 green; full `npm test` 1427/1427 plus syntax check (218 sources, 253 UI ids) on the clean rerun after one transient load-related noble-sweep failure; `test:chronicles` green; live production verified at 2026-11-25T01:04Z (`v3.55.0`, all four new chains served) | `bab8278` |
| 2026-11-25T01:27Z | Last five chronicles: feud, craft, omens, winter, pilgrimage | `js/systems/event-chains.js`, `tests/event-chains.test.js`, `CHANGELOG.md`, generated spec audit, night log | Focused event/events suites 20/20; all five reward categories instantiate; all 30 live event families now have a three-stage chain; `spec:audit` 3/3; first full `npm test` hit a load-related 30 s campaign budget (35.5 s) with 1427/1428, isolated `long-campaign` 1/1 in 13 s with the unchanged gate; clean full `npm test` 1428/1428 plus syntax check (218 sources, 253 UI ids); `test:chronicles` green; live production verified at 2026-11-25T01:52Z (`v3.55.0`, all five new chains served) | `587f183` |
| 2026-11-25T01:58Z | Clearer event outcomes and card-reward notices | `js/systems/events.js`, `tests/systems/events.test.js`, `CHANGELOG.md`, generated spec audit, night log | Focused event/chronicle suites 22/22; `spec:audit` 3/3; full `npm test` 1430/1430 plus syntax check (218 sources, 253 UI ids); browser `test:e2e` green (toasts, resolution feedback, save/load, no page errors); live production verified at 2026-11-25T02:18Z (`v3.55.0`, new outcome and card notices served after a ~6 min deploy lag) | `b9a7784` |
| 2026-11-25T02:30Z | Sixth authored opening: The Hearth Census (population objective) | `js/systems/scenario.js`, `tests/systems/scenario.test.js`, `tests/browser/scenario-start.mjs`, `CHANGELOG.md`, generated spec audit, night log | Focused scenario/save suites 25/25; `spec:audit` 3/3; first full `npm test` hit a load-related 30 s campaign budget (31.1 s) with 1430/1431, isolated `long-campaign` 1/1 in 15 s with the unchanged gate; clean full `npm test` 1431/1431 plus syntax check (218 sources, 253 UI ids); browser `test:scenario-start` green after waiting for progressive panel hydration (pre-existing empty-shell flake also reproduced at the prior HEAD); live production verified at 2026-11-25T03:05Z (`v3.55.0`, Hearth Census preset served) | `2aed421` |
| 2026-11-25T03:12Z | Eternal deed: The Consent of the Realm | `js/systems/ambitions.js`, `tests/systems/ambitions.test.js`, `docs/ETERNAL_DEEDS.md`, `CHANGELOG.md`, generated spec audit, night log | Focused ambition/endless suites 33/33; `spec:audit` 3/3; full `npm test` 1432/1432 plus syntax check (218 sources, 253 UI ids); data-only system change, no render/UI code touched, so no separate browser reference; live production verified at 2026-11-25T03:23Z (`v3.55.0`, new deed served after a ~3 min deploy lag) | `7ea6465` |
| 2026-11-25T03:25Z | Eternal deed: The Atlas of the Realm | `js/systems/ambitions.js`, `tests/systems/ambitions.test.js`, `docs/ETERNAL_DEEDS.md`, `CHANGELOG.md`, generated spec audit, night log | Focused ambition/endless suites 34/34; `spec:audit` 3/3; first full `npm test` hit the 120 s noble-audit child timeout under parallel load (1432/1433), isolated seed 20261201 passed in 51 s with all four houses and unchanged gates; clean full `npm test` 1433/1433 plus syntax check (218 sources, 253 UI ids); data-only system change, no render/UI code touched, so no separate browser reference; live production verified at 2026-11-25T03:53Z (`v3.55.0`, new deed served after a ~4 min deploy lag) | `ac88cfc` |

## Freebuff watch

- Remote branch `origin/freebuff/747ba2e7ecbd7eb66d9fab99` exists; checked again at
  2026-11-25T00:25Z after `git fetch --all` (and at 01:04Z before closing batch 2). Head is
  still `6ec6f43` ("Save chat files from Freebuff", 2026-11-24); no new commits since batch 1. Other historical matches are `c176d36`
  (retire the Freebuff Sites origins) and `dd978c3` (old merge). The retired Freebuff Sites
  origins are intentionally HTTP 404 and are not deploy targets.
- Checked again at 2026-11-25T01:28Z and 01:58Z after `git fetch --all`: head still
  `6ec6f43`, no new `freebuff` commits in the last 100 commits across all refs.
- The first full run flagged the hard 16 ms grassland-overlay frame budget once under parallel
  load; the test passed 6/6 in isolation and the unchanged gate passed in the clean full rerun.
  No budget, assertion or gate was altered.
