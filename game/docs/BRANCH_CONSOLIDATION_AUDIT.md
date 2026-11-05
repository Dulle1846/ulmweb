# Branch consolidation audit — Kings & Cards

## Rule

All playable game systems belong in the normal game/ tree. Feature branches are temporary delivery mechanisms, not separate products. A branch or pull request must not be closed until its unique behavior, tests, documentation and original artwork have either been integrated or explicitly identified as redundant. No merge is authorized merely because two branches have similar titles.

## Current integration spine

ulmweb-branch (production) ← PR #6 / kac-2.1-stability-performance ← PR #23 / kac-3.1-strategy-final ← PR #24 / kac-3.2-lite-city-builder.

PR #6 is the existing stability/performance foundation. PR #23 is the current strategy/dynasty/creature UI integration candidate. PR #24 adds slower pacing, deterministic economy/combat streams, safer local saves and the city-builder architecture. PR #24 is stacked on PR #23; neither is a production deployment yet.

## Pull-request preservation matrix

| PR | Area | Unique material found | Consolidation decision |
|---|---|---|---|
| #6 | Stability/performance | Simulation foundations, bounded entities, pathfinding, economy and CI baseline | Keep as first integration dependency; merge only after its current-head checks are confirmed |
| #16 | Royal dynasty | Royal court UI, succession-law variants (absolute primogeniture, male preference, council election), royal court illustration and dynasty tests | Royal court illustration copied into game/assets; succession-law behavior and tests must be ported into the current royal-dynasty.js before retiring the branch |
| #17 | Government | Alternate realm-management UI and government-specific tests | Compare behavior with current government/management panels; port any missing controls/tests, do not keep a second competing UI |
| #18 | Creatures | Broader species catalogue, lifecycle profiles, hunger/health, loyalty, memories, autonomous movement, death memorials, dragon companion art, comic card frame and creature tests | Artwork copied into game/assets; current integration is dragon-focused, so the broader creature lifecycle/catalogue must be ported and tested before this branch is retired |
| #19 | Royal court / strategy | Royal-household model, succession and regency presentation, crown authority, council influence, tax controls, decrees, royal crest and alternate kingdom banner | Royal crest and banner preserved in game/assets; compare and port the missing household/regency and government controls into the current single management UI |
| #20 | Dynasty / strategy UI | Alternative dynasty system and strategy interface; kingdom illustration and realm icon sheet | Kingdom illustration and realm icons copied into game/assets; retain useful art and behavior, but do not merge a second overlapping dynasty/management implementation |
| #22 | Deterministic combat | Seeded enemy retaliation and regression test | Combat fix and deterministic test integrated into PR #24 |
| #23 | Strategy integration | Current government, politics, cards, economy, dynasty and creature management panels | Main integration candidate; fixed royal state identity and moved tab navigation inside the dialog |
| #24 | City-builder foundations | Slower calendar, 0.5x speed, independent random streams, save backup/recovery/validation, city-builder specification and art integration | Current development branch; Draft until all current-head CI and browser checks pass |

## Assets already preserved in PR #24

- kingdom-illustration.svg — world-forge/start-screen art.
- realm-icons.svg — reusable strategy/build-mode icon symbols.
- royal-court-art.svg — royal decisions panel.
- royal-crest.svg — management header identity.
- dragon-companion.svg — creature panel.
- comic-card-frame.svg — card frame overlay.
- realm-banner.svg — alternate kingdom banner kept as an additional original illustration.
- city-builder-sprites.svg — new original comic-style symbols for woodcutter, sawmill, quarry, well, mill, bakery, warehouse, cottage, market, watchtower and road tiers.
- realm-sprites.svg and comic-realm-banner.svg were already present in the integration base and are reused.

## Known preservation gaps — do not close the source PRs yet

1. Succession laws: current game/js/systems/royal-dynasty.js has explicit heir designation but does not yet expose the three succession-law variants from PR #16.
2. Regency / household detail: PR #19 contains a richer household snapshot and succession-status presentation. Compare and port the missing behavior into the current dynasty model without adding a second competing household state.
3. Government depth: PR #19's crown-authority, council-influence and tax/decree controls are not all represented by the current management-ui.js. Reconcile the data model and UI before retirement.
4. Creature diversity: current PR #23 creature logic is dragon-centric. PR #18's broader species data, traits, memories and lifecycle behavior remain a required port for the full ecosystem.
5. Asset verification: confirm every copied asset is referenced by the UI or intentionally retained for the next city-builder phase. Remove only confirmed duplicate/unused copies after reviewing source history.

## Safe consolidation sequence

1. Keep all source PRs and branches open while comparing behavior and tests.
2. Integrate and verify PR #6 into ulmweb-branch first.
3. Retarget PR #23 to ulmweb-branch after PR #6 is merged; merge only after all three current-head workflows pass.
4. Integrate the missing PR #16/#18/#19 behavior into the single game/ implementation, with regression tests.
5. Retarget PR #24 to ulmweb-branch after its dependency is merged; run all tests and a preview deployment before production.
6. Close redundant PRs only after the preservation matrix is satisfied. Keep Git history; do not delete branches as a cleanup shortcut.
7. Production remains Cloudflare Pages. Never introduce Vercel. A Cloudflare Workers project is a separate deployment target and must not be changed until its actual build logs and dashboard configuration are inspected.

## Current truthfulness / release gate

A green unit workflow does not prove browser usability or Cloudflare deployment success. Report each independently. A deployment is complete only after Cloudflare confirms the new production deployment and the public Pages URL serves the expected build.