# Kings & Cards — Version and Development History

**Current production version:** `3.5.0`  
**Next development line:** `3.6.0-rc`  
**Production branch:** `ulmweb-branch`  
**Game root:** `game/`  
**Production URL:** https://kings-and-cards.pages.dev/  
**Last repository verification:** 2026-11-05 (UTC)

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

## Release candidate (not production yet)

### 3.6.0 — Master UI Phase 3: Economy, buildings, creatures and chronicle
**Released:** 2026-11-05  
**PR:** [#43](https://github.com/Dulle1846/ulmweb/pull/43)  
**Merge commit:** `ad4d3c9978779aa7cc4921ec43a934d1b8338b38`  
**Tested feature head:** `63ec3957697f4513ddeefd9ad5c5889689a0ceb7`  
**CI:** Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact feature head.

- Added a data-backed economy view separating resource stock, current-tick flows, the latest 20-day settlement and cumulative totals.
- Added a searchable building register with actual entity health, footprint, staff, workforce efficiency, catalogue cost and centre-tile resource data.
- Added individual living-dragon dossiers and memorial records with needs, bond, life stage, abilities, goals and memories.
- Added a searchable event inbox and chronicle with category filters, stored tick references and a dismiss/reopen flow for unresolved issues.
- Added browser coverage for the new panels, creature dossier, chronicle search and active-issue dismissal/reopening.

**Scope limit:** The simulation currently retains only the latest completed financial ledger, not a historical time series. Per-building production, storage and upkeep are not exposed. No trend charts or forecasts are fabricated. Chronicle history remains limited to the stored event log (up to 100 recent records); unread tracking and permanent external archives are not claimed. The full responsive viewport matrix and original art atlas remain outstanding. No simulation rules or save schema were changed.

**Release gate:** This candidate is not production-released until its metadata PR is merged, required CI passes on the exact head, and Cloudflare Pages confirms the production deployment.

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
