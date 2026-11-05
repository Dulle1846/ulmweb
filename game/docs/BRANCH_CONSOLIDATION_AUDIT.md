# Branch consolidation audit — Kings & Cards

Audit date: 2026-11-05

## Non-negotiable preservation rule

All playable game systems belong in the normal `game/` tree. Feature branches are temporary delivery mechanisms, not separate products. A branch or pull request must not be closed until its unique behavior, tests, documentation and original artwork have either been integrated or explicitly identified as redundant. No merge is authorized merely because two branches have similar titles. Keep Git history; do not delete branches as a cleanup shortcut.

## Current production truth

- Canonical production branch: `ulmweb-branch`.
- Latest confirmed production release: PR #27, merge commit `fe248e694b50477136f3cdb3a182466788fe1c32` (3.3 road construction). The prior 3.2 baseline was PR #24/#26, merge commit `6290bcbd4981a334c4f57443651d90c5be2eebe8`.
- PR #26 integrated the 3.2 strategy/dynasty/creature UI, slower 750 ms day clock, 0.5x/1x/2x/4x speed, deterministic combat/economy/market streams, save backup/recovery/validation, core art and city-builder specification.
- For PR #26's tested head, Game Quality, Kings & Cards 2.1 checks and Game Browser E2E all completed successfully. These are GitHub Actions results, not proof of a Cloudflare deployment.
- The public Pages URL `https://kings-and-cards.pages.dev/` was fetched after PR #27. The live header includes BUILD and EXIT BUILD; the construction modal includes the road categories and the deployed app bootstrap imports the road/build modules. This verifies the new release UI is served. The Cloudflare dashboard's deployment ID/settings still need a signed-in dashboard check.
- Canonical hosting is Cloudflare Pages. Vercel is not a production target. The legacy `workers.dev` Worker is separate from Pages and must be diagnosed independently.

## Current production release: 3.3 road construction

PR #27 — `kac-3.3-lite-city-builder-roads` — was merged into `ulmweb-branch` on 2026-11-05. Merge commit: `fe248e694b50477136f3cdb3a182466788fe1c32`. The exact tested head was `5dba0ab974826fab3fd515639bc66ffa800928ba`.

It adds:
- Three road tiers with resource costs, upgrades, refunds and placement validation.
- Mouse/touch click-and-drag placement and explicit build-mode cancellation.
- Visible road rendering, junctions and intersections.
- Road movement-speed and A* route-cost modifiers.
- Road maintenance charged through the 20-day economy ledger.
- Road save/load serialization, validation and restoration.
- Unit tests and browser E2E for placement, drag, demolition, upkeep, routing and persistence.

All three required workflows passed on the exact tested head: Game Quality, Kings & Cards 2.1 checks and Game Browser E2E. The public Pages HTML was then fetched with a cache-busting query and its header/build modal were inspected; BUILD and the roads panel were present. The Cloudflare dashboard deployment record is still not verified.

## Preservation matrix for open source branches

| PR / branch | Area | Current evidence and unique material | Required action before retirement |
|---|---|---|---|
| #8 `kac-2.3-living-chronicles` | Event-linked chronicles | `events.js` matches production exactly; `people.js` differs in size and content. | Compare people-profile behavior and tests. Retain only missing behavior; do not replace the production module wholesale. |
| #9 `kac-2.4-life-cycles` | Species-aware life cycles | Branch changes simulation, people/events and tests; branch is behind production history. | Compare current production behavior and tests; verify no unique migration/aging rule is lost. |
| #10 `kac-2.5-family-kinship` | Family graph | Production and branch `families.js` differ materially. | Compare invariants, caps, migrations and tests before closing. |
| #11 `kac-2.6-character-dossiers` | Society/lifecycles | Agency and social modules match production; births, mortality and families differ. PR head also has a small browser-test delta. | Compare exact behavioral differences; keep any missing edge-case tests. |
| #14 / #19 `kac-2.9-royal-court-strategy-ui` | Royal-court strategy UI | Both PRs point to the same source branch/head, but #14 is stacked on `kac-2.8-orphan-guardianship` while #19 targets production directly. Includes `strategy-panels.js`, `royal-household.js`, richer politics and unique art. | Do not call them exact duplicates: compare the #14 base's guardianship delta separately. Keep #19 Draft as the production-target safety copy; preserve the source branch and model/tests until reconciled with the canonical management UI. |
| #16 `kac-2.9-royal-dynasty` | Royal dynasty | Branch `royal-dynasty.js` is materially larger than production and adds `royal-court.js`; succession laws include absolute primogeniture, male preference and council election. | Port missing succession-law behavior, household UI and regression tests into the single production dynasty model. |
| #17 `kac-3.0-government-and-management-ui` | Government/management | Adds alternate `realm-management.js`; its government module differs from production. | Compare all actions, tax/policy controls, workforce/economy details and tests; port missing controls into the one current management UI. |
| #18 `kac-3.1-living-fantasy-creatures` | Persistent fantasy creatures | Branch `creatures.js` is materially larger than production and contains species profiles, lifecycle, needs, memories, autonomy and memorials. | Port the full species/lifecycle behaviors and tests into the current creature system without breaking the existing summon/dragon API. |
| #20 `kac-3.1-dynasty-strategy-ui` | Parallel dynasty/strategy implementation | Contains unique `dynasty.js`, alternate `realm-management.js`, unique kingdom art and a second dynasty/government implementation. | Do not merge wholesale. Extract unique, validated behaviors into the canonical modules; preserve the artwork and tests until audited. |
| #24 / #26 | 3.2 production release | Both closed as merged against the same 3.2 release head; all three required CI workflows passed for the tested release candidate. | Historical release baseline. |
| #27 | 3.3 road construction | Merged into production; exact tested head passed all three workflows and the public Pages UI was verified. | Shipped baseline. Keep its regression tests and road-save schema stable. |

## Important preservation gaps

1. **Succession laws:** production `game/js/systems/royal-dynasty.js` exposes heir designation but does not yet expose all three succession-law variants from PR #16.
2. **Regency / household detail:** PR #14/#19 and #16 contain richer household, marriage and succession presentation. Port into the current royal state without creating competing royal state objects.
3. **Government depth:** PR #19/#17 contain alternate crown-authority, council-influence, tax, decree and realm-management controls. Reconcile the data model and UI before retiring their source branch.
4. **Creature diversity:** production is currently dragon-focused. PR #18 contains a broader species catalogue and persistent creature lifecycle behavior; this is a required port for the full ecosystem.
5. **Parallel dynasty implementation:** PR #20's `dynasty.js` is not in production. Its behavior must be compared against the production `royal-dynasty.js`; do not simply add both systems.
6. **Society branch differences:** the family, birth and mortality modules from PR #8–11 differ from production. Compare function-by-function and preserve any additional migration, validation or regression coverage.
7. **Asset verification:** confirm every copied asset is referenced by the UI or intentionally retained for the next art phase. Remove only confirmed duplicates after reviewing source history.

## Lite City Builder roadmap

The road system is the first playable infrastructure slice, not a complete city builder. Subsequent phases should be delivered in this order:

1. **Roads and build mode:** finish placement, rendering, save/load and road-aware pathfinding.
2. **Resource nodes:** seed-generated forests, stone deposits, wells and farmland; compact tile data, not one object per tile.
3. **Construction and housing:** site reservation, foundation/frame/completion stages; tent → timber cottage → stone house.
4. **Storage and physical hauling:** bounded inventories, source reservations, destination capacity and deterministic carrier jobs; no global resource teleportation.
5. **Production chains:** logs → planks; grain → flour → bread; stone → cut stone; water access.
6. **Workforce and needs:** workers, food, water, winter warmth, safety, belonging and staged shortage effects.
7. **Service radii:** market, well, tavern, temple, clinic and watchtower coverage, with UI overlays.
8. **Seasons and environment:** crop stages, winter shutdown/heating, forest regrowth and bounded random events.
9. **Long-run balance:** migration gates, upkeep, recoverable mistakes, deterministic economy and multi-year simulation tests.

Each phase must have a playable browser test, a unit test suite, a save/load migration test and performance limits.

## Studio workflow

- **Product / Game Director:** owns player experience, scope and release acceptance.
- **Lead Architect:** owns module boundaries, data schemas, migrations and compatibility.
- **Simulation Engineer:** owns game clock, determinism, economy, AI and balance.
- **UI / Art Engineer:** owns comic-art direction, responsive management UI, SVG/sprite performance and accessibility.
- **QA Engineer:** owns unit, integration, browser E2E, long-run and save/load tests.
- **DevOps / Release Engineer:** owns GitHub Actions, Cloudflare Pages configuration, preview/production verification and rollback plan.

These are project roles, not claims that separate external AI agents are running. External AI reviews are advisory; every code suggestion must be checked in this repository and pass the same tests.

## Safe consolidation sequence

1. Keep all source branches available while their unique code/tests/art are audited.
2. Use `ulmweb-branch` as the only production target.
3. Treat PR #27 as the shipped 3.3 baseline; do not re-open or duplicate its road implementation without a concrete bug or extension.
4. Port missing PR #16/#17/#18/#19/#20 behaviors into the one canonical implementation in `game/`, with regression tests.
5. Do not close the source PRs until the preservation matrix is satisfied and the canonical tests cover their unique behaviors.
6. For future releases, preview deployment must be tested before production; production is complete only after Cloudflare confirms the Pages deployment and the public Pages URL serves the expected commit.

## Release truthfulness gate

A green unit workflow does not prove browser usability. A green browser workflow does not prove Cloudflare deployment. A public page fetch proves the site responds, not which commit Cloudflare is serving. Report these three facts independently.
