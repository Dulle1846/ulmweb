# Branch consolidation audit — Kings & Cards

Audit date: 2026-11-05

## Non-negotiable preservation rule

All playable game systems belong in the normal `game/` tree. Feature branches are temporary delivery mechanisms, not separate products. A branch or pull request must not be closed until its unique behavior, tests, documentation and original artwork have either been integrated or explicitly identified as redundant. No merge is authorized merely because two branches have similar titles. Keep Git history; do not delete branches as a cleanup shortcut.

## Current production truth

- Canonical production branch: `ulmweb-branch`.
- Latest confirmed production merge: PR #26, merge commit `6290bcbd4981a334c4f57443651d90c5be2eebe8`.
- PR #26 integrated the 3.2 strategy/dynasty/creature UI, slower 750 ms day clock, 0.5x/1x/2x/4x speed, deterministic combat/economy/market streams, save backup/recovery/validation, core art and city-builder specification.
- For PR #26's tested head, Game Quality, Kings & Cards 2.1 checks and Game Browser E2E all completed successfully. These are GitHub Actions results, not proof of a Cloudflare deployment.
- The public Pages URL `https://kings-and-cards.pages.dev/` was fetched successfully on 2026-11-05 and returned the current game page, including Save, Load, Pause and speed controls. A Cloudflare dashboard deployment record was not available in this audit.
- Canonical hosting is Cloudflare Pages. Vercel is not a production target. The legacy `workers.dev` Worker is separate from Pages and must be diagnosed independently.

## Current development candidate

PR #27 — `kac-3.3-lite-city-builder-roads` — is the current Draft candidate, based directly on `ulmweb-branch`.

It adds:
- Three road tiers with resource costs, upgrades, refunds and placement validation.
- Mouse/touch click-and-drag placement.
- Visible road rendering and intersections.
- Road movement-speed and A* route-cost modifiers.
- Road save/load serialization.
- Unit tests and browser E2E coverage.

Latest known CI on head `9a8ef0f4b6b00703fedac2f1df3c80d95dc094a9`: Game Quality and Kings & Cards 2.1 checks passed; Browser E2E is being debugged because the save/load round-trip after a road mutation does not yet reach the expected success state. Do not merge or deploy until this is resolved and all three workflows pass on the exact final head.

## Preservation matrix for open source branches

| PR / branch | Area | Current evidence and unique material | Required action before retirement |
|---|---|---|---|
| #8 `kac-2.3-living-chronicles` | Event-linked chronicles | `events.js` matches production exactly; `people.js` differs in size and content. | Compare people-profile behavior and tests. Retain only missing behavior; do not replace the production module wholesale. |
| #9 `kac-2.4-life-cycles` | Species-aware life cycles | Branch changes simulation, people/events and tests; branch is behind production history. | Compare current production behavior and tests; verify no unique migration/aging rule is lost. |
| #10 `kac-2.5-family-kinship` | Family graph | Production and branch `families.js` differ materially. | Compare invariants, caps, migrations and tests before closing. |
| #11 `kac-2.6-character-dossiers` | Society/lifecycles | Agency and social modules match production; births, mortality and families differ. PR head also has a small browser-test delta. | Compare exact behavioral differences; keep any missing edge-case tests. |
| #14 / #19 `kac-2.9-royal-court-strategy-ui` | Parallel royal-court strategy UI | Both PRs point to the same branch and same head. Includes `strategy-panels.js`, `royal-household.js`, richer politics and unique art. | Treat #19 as a duplicate PR of #14, not a second feature line. Preserve the branch and unique model/tests until their behavior is reconciled with the production management UI. |
| #16 `kac-2.9-royal-dynasty` | Royal dynasty | Branch `royal-dynasty.js` is materially larger than production and adds `royal-court.js`; succession laws include absolute primogeniture, male preference and council election. | Port missing succession-law behavior, household UI and regression tests into the single production dynasty model. |
| #17 `kac-3.0-government-and-management-ui` | Government/management | Adds alternate `realm-management.js`; its government module differs from production. | Compare all actions, tax/policy controls, workforce/economy details and tests; port missing controls into the one current management UI. |
| #18 `kac-3.1-living-fantasy-creatures` | Persistent fantasy creatures | Branch `creatures.js` is materially larger than production and contains species profiles, lifecycle, needs, memories, autonomy and memorials. | Port the full species/lifecycle behaviors and tests into the current creature system without breaking the existing summon/dragon API. |
| #20 `kac-3.1-dynasty-strategy-ui` | Parallel dynasty/strategy implementation | Contains unique `dynasty.js`, alternate `realm-management.js`, unique kingdom art and a second dynasty/government implementation. | Do not merge wholesale. Extract unique, validated behaviors into the canonical modules; preserve the artwork and tests until audited. |
| #26 | 3.2 production release | Merged to production; all three required CI workflows passed for its tested head. | Historical release baseline. |
| #27 | 3.3 road construction | New candidate; CI currently has a browser E2E save/load issue. | Fix, rerun all checks, review diff, then request release approval. |

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
3. Keep PR #27 Draft until all three workflows pass for the exact head.
4. Port missing PR #16/#17/#18/#19/#20 behaviors into the one canonical implementation in `game/`, with regression tests.
5. Do not close the source PRs until the preservation matrix is satisfied and the canonical tests cover their unique behaviors.
6. Preview deployment must be tested before production; production is complete only after Cloudflare confirms the Pages deployment and the public Pages URL serves the expected commit.

## Release truthfulness gate

A green unit workflow does not prove browser usability. A green browser workflow does not prove Cloudflare deployment. A public page fetch proves the site responds, not which commit Cloudflare is serving. Report these three facts independently.
