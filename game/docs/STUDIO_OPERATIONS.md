# Kings & Cards — Studio Operations Handbook

Last updated: 2026-11-05

## 1. Project identity and source of truth

- Repository: `Dulle1846/ulmweb`
- Production branch: `ulmweb-branch`
- Game source root: `game/`
- Production URL: https://kings-and-cards.pages.dev/
- Hosting: Cloudflare Pages (static site)
- Current production release: 3.3 road construction foundation, PR #27, merge commit `fe248e694b50477136f3cdb3a182466788fe1c32`.
- No Vercel production deployment is intended.
- The legacy `workers.dev` endpoint, if still active, is a separate Worker and must not be confused with Pages.

The production branch is the only canonical game. Feature branches are temporary work areas. Every system that ships belongs in the normal `game/` folder, in its existing module boundaries. Never create a second parallel implementation of an already canonical system merely to make a feature work.

## 2. Release baseline

PR #27 is merged. It adds:
- Dirt, gravel and paved roads.
- Material costs, upgrades and partial demolition refunds.
- Mouse/touch click and drag placement, plus Escape/exit control.
- Road rendering, junctions and intersections.
- Road-aware movement speed and A* pathfinding.
- Road maintenance in the 20-day treasury ledger.
- Versioned road save/load data and validation.
- Unit tests and browser E2E for placement, drag, demolition, persistence and economy.

The exact pre-merge head `5dba0ab974826fab3fd515639bc66ffa800928ba` passed all three workflows:
1. Game Quality
2. Game Browser E2E
3. Kings & Cards 2.1 checks

The production site was fetched after merge. Its live header exposed BUILD and EXIT BUILD, and the build modal contained the roads interface. This confirms the new interface is being served by the public Pages site. It does not by itself prove the Cloudflare dashboard's build settings are correct; that requires the Pages deployment record.

## 3. Studio roles and decision rights

These are project responsibilities. They do not imply separate external AI agents are already running.

| Role | Owns | Must not do |
|---|---|---|
| Game Director / Product Owner | Player experience, scope, release acceptance, roadmap | Approve untested systems |
| Lead Architect | Module boundaries, data schemas, save migrations, compatibility | Add duplicate state models |
| Simulation Engineer | Tick pacing, deterministic randomness, economy, needs, AI | Use unseeded randomness in gameplay |
| World / City Builder Engineer | Terrain, nodes, roads, buildings, storage, hauling | Store every tile as a heavy JS object |
| UI / Art Engineer | Comic-art direction, management panels, accessibility, responsive layout | Ship decorative controls without behavior |
| QA / Balance Engineer | Unit, integration, browser, save migration, long-run and performance tests | Treat unit tests as proof of browser behavior |
| DevOps / Release Engineer | GitHub Actions, Cloudflare Pages, previews, deployment verification, rollback | Claim deployment from a green GitHub workflow alone |
| Narrative / Systems Designer | Advisor, noble families, events, creatures, diplomacy | Let narrative state contradict canonical game state |

One change has one directly responsible owner. Other roles review it.

## 4. Branch and pull-request rules

### Branch names

Use:
- `kac-3.4-resource-nodes`
- `kac-3.5-production-logistics`
- `kac-3.6-housing-needs-seasons`
- `kac-3.7-court-and-society`
- `kac-3.8-dynasty-diplomacy-creatures`

Do not use version numbers for unrelated parallel implementations.

### Required PR description

Every PR must state:
1. Player-visible result.
2. Modules changed and why.
3. Save schema changes and migration behavior.
4. Tests added and exact commands/workflows run.
5. Known limitations.
6. Performance implications.
7. Deployment/rollback impact.
8. Which existing PRs/branches it supersedes or depends on.

### Merge gates

A PR cannot merge unless:
- It targets `ulmweb-branch`, unless a documented stacked-PR dependency requires another base.
- The diff is reviewed for accidental deletes, duplicate systems, debug code and asset references.
- Game Quality passes on the exact head.
- Game Browser E2E passes on the exact head.
- Kings & Cards 2.1 checks pass on the exact head.
- Save/load round-trip and backward-compatibility tests pass when state schema changes.
- The PR is mergeable and no unresolved conflict is hidden by a stale comparison.

Do not mark a PR ready merely because it is old or because another PR has a similar title.

### Preservation rule

Before closing or deleting any source branch, compare its changed files and unique behavior against production. Keep unique art, data migrations, tests, documentation and gameplay rules. A file with the same name is not necessarily duplicate functionality. The detailed matrix lives in `BRANCH_CONSOLIDATION_AUDIT.md`.

## 5. Test and quality policy

From `game/`:
- `npm test` — all Node tests and static syntax checks.
- Browser E2E — run by GitHub Actions using Playwright/Chromium.

Test layers:
1. Pure deterministic unit tests for rules and math.
2. Integration tests for system-to-system effects.
3. Save/load round-trip tests including old schema fixtures.
4. Browser E2E for real clicks, drags, dialogs, pause/resume and state persistence.
5. Long-run simulation tests across several in-game years and multiple seeds.
6. Performance checks for map size, entity counts, pathfinding, rendering and memory.

For simulation features, test at least:
- normal conditions;
- scarcity and oversupply;
- zero workers / maximum workers;
- boundary map positions;
- pause and all speed settings;
- save/reload at the transition boundary;
- two or more fixed seeds;
- deterministic replay.

## 6. Simulation pacing and determinism

Current baseline: 750 ms simulation day at 1x, plus 0.5x / 2x / 4x controls. Do not accelerate core economic systems independently of the game clock.

Rules:
- Gameplay randomness must use named seeded random streams.
- Visual-only randomness may use a presentation stream.
- A pause must stop world mutation, not merely freeze the UI.
- Speed changes affect tick scheduling, not the number of logical events per day.
- Long processes should be expressed in in-game days/ticks, not arbitrary wall-clock timeouts.
- Random events should be weighted by context, cooldown, severity and recovery options.
- Every major negative event needs warning signals and at least one plausible recovery path.

## 7. Save data and migrations

- Save snapshots are versioned.
- Validate before mutating the live realm.
- Load failures must restore the previous active realm when one exists.
- Unknown optional fields should be safely ignored.
- New fields must have defaults.
- Never serialize DOM objects, Canvas contexts, class prototypes or pathfinding caches.
- Compact arrays/maps or sparse records should be used for world state.
- Keep fixtures for each supported save schema.
- Add a test that loads an old save and verifies it can be saved again using the current schema.

Roads now use versioned compact save data. New city-builder systems must follow the same approach.

## 8. Cloudflare Pages release runbook

Canonical configuration:
- Production branch: `ulmweb-branch`
- Root directory: `game`
- Framework preset: None
- Build command: blank (or `exit 0` only if the UI insists on a command)
- Build output directory: `.`
- Required build variables for the static game: none

Why: the game is a static browser application. `game/package.json` has a test script but no frontend build script. There is no need to invoke Wrangler or deploy a Worker to publish this Pages site.

Release procedure:
1. Confirm the merged commit is on `ulmweb-branch`.
2. Open Cloudflare Dashboard → Workers & Pages → Pages project → Deployments.
3. Verify the deployment is tied to the expected commit and is marked successful/production.
4. If it fails, read the first failing Build log step before changing configuration.
5. Check root directory, build command, output directory, production branch and GitHub app permissions.
6. Fetch the public site and inspect a distinctive new feature, not just the page title.
7. If deployment is broken, use Cloudflare's previous successful production deployment rollback; do not rewrite Git history.
8. Treat Worker alerts separately. Open the exact Worker project and logs; do not infer Pages failure from a workers.dev email.

Important: GitHub Actions passing proves source checks only. It does not prove Pages deployment. A successful URL fetch proves the site responds, but only a matching deployment record proves which commit Cloudflare published.

## 9. Incident response for build and alert emails

When a GitHub Actions email arrives:
1. Identify repository, workflow, run number and commit SHA.
2. Open the failed job, not only the summary.
3. Find the first real test/build error; later cleanup warnings are often secondary.
4. Reproduce with the exact command and Node version.
5. Fix on a feature branch, add a regression test and rerun all three workflows.

When a Cloudflare email arrives:
1. Determine whether it is Pages or a Worker.
2. Record project name, deployment ID, commit, stage and first failing log line.
3. Compare the deployment settings with Section 8.
4. Never add a build command, environment variable or Worker config speculatively.
5. Confirm the public site after recovery.

Do not disable notifications wholesale. Reduce noisy alerts only after the failure source is understood.

## 10. Performance and memory budgets

The world is 160×160 logical cells. Use compact typed arrays or sparse maps for per-tile state. Avoid one DOM node per tile or per resident.

Guidelines:
- Reuse pathfinding buffers and cache results with a revision key.
- Invalidate route caches when roads/buildings change.
- Limit active path searches per simulation tick.
- Render only visible tiles and use zoom-dependent level of detail.
- Keep historical archives bounded.
- Avoid deep-cloning the entire world on every tick.
- Save only durable state; rebuild derived caches after load.
- Add a repeatable stress test with high population, many roads and buildings.

## 11. Release checklist

- [ ] Exact PR head and merge SHA recorded.
- [ ] All three required GitHub workflows green.
- [ ] Save schema migration tested.
- [ ] Browser E2E tested at 1x and paused state.
- [ ] Production branch contains the intended merge.
- [ ] Cloudflare Pages production deployment succeeded for the merge SHA.
- [ ] Public URL shows a distinctive feature from the release.
- [ ] No accidental source branch deletion.
- [ ] Release notes and branch audit updated.
