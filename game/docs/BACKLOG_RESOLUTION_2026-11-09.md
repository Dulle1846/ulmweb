# Backlog resolution — 2026-11-09

**Repository:** `Dulle1846/ulmweb`
**Production branch:** `ulmweb-branch`
**Verified commit:** `28bb5e8` (bog-pool legibility fix on top of `930ee26`)
**Production URL:** https://kings-and-cards.pages.dev/
**Game version:** `3.9.0` (`3.10.0-dev` development line)

This document closes the open backlog by recording, for every open pull request and
issue, what is actually implemented, what was verified, and what remains a manual or
future product task. Nothing here declares unfinished work as finished: deferred items
are named explicitly.

## Verification baseline

- `npm test` in `game/`: **605/605 tests pass**; syntax and relative-import check passes
  for **91 source files**, **184 referenced UI ids** and local HTML assets.
- Production serves the verified renderer: the deployed `terrain.js` contains the
  `drawBogPool` water-surface fix (`#15323a`, sphagnum rim) and the live realm renders it.
- Live Chromium session on the production URL: no JavaScript or page errors; no missing
  assets (**250 resource requests, all HTTP 200**). Only the known WebGL
  `GPU stall due to ReadPixels` driver warnings and Canvas2D readback performance warnings
  from inspection appeared.
- Live wet-conifer verification: seed `44`, Standard 176 × 176, temperate, tile
  **(77, 148)**, formation `wet-conifer`, wetness `0.493`, species diversity `0.669`
  (spruce, alder, fir, birch, pine). Screenshots:
  `artifacts/live-wet-conifer-final-close.png`,
  `artifacts/live-wet-conifer-final-context.png`.
- Working-tree payload (uncompressed, before HTTP compression):
  **assets 96,190 B**, **JavaScript 1,422,486 B**, **CSS 171,357 B**, 20 local asset files.
  No runtime CDN, external image host or paid asset API is used.

## Pull request #95 — `feat(ui): add royal heraldry and accessibility preferences`

**Resolution: already integrated on `ulmweb-branch`; closed as superseded.**

- `game/assets/royal-heraldry.svg` was added on `ulmweb-branch` by `930ee26`. It contains
  eight original shield symbols with a deterministic dynasty-name mapping.
- `game/js/presentation/character-dossier.js` uses
  `assets/royal-heraldry.svg#crest-0N` for current and former sovereigns.
- The persistent accessibility preferences (`showTooltips`, `reduceMotion`,
  `highContrast`) exist in `game/js/core/persistence.js`, are applied in
  `game/js/app/main.js` and styled in `game/css/ui-design-system.css`.
- The PR's regression coverage exists on the branch:
  `tests/ui/sovereign-dossier.test.js`, `tests/ui/master-ui-contract.test.js`,
  `tests/core/persistence.test.js` and the Chromium E2E heraldry/toggle assertions.
- The PR branch is based on an older base and is therefore reported as `CONFLICTING`.
  Merging it would re-add identical content. No merge commit was created; the branch is
  left in place for audit history.

The only failing check on the PR is **Workers Builds: kings-and-cards**, a Cloudflare
Workers service build. It is not the Pages deployment and is not used as Pages evidence.

## Issue resolution

| Issue | Title | Resolution | Evidence |
|---|---|---|---|
| #4 | F0: Run baseline browser smoke tests | **Completed — baseline superseded** | The old baseline checklist targeted `dae4edd` before the runtime fixes. Current Chromium smoke coverage runs in CI and passed on the latest PR (16m43s); the live production session recorded below shows no page errors and no failed assets. |
| #32 | DevOps — Cloudflare Pages project settings and Worker alert audit | **Diagnosed; code scope complete** | The recurring alert is the `kings-and-cards` Workers build, not Pages. The repo intentionally has no Wrangler/Worker config (`docs/CLOUDFLARE_PAGES_RELEASE.md`), and Pages deployment for `28bb5e8` is verified. Dashboard-only settings and notification routing remain an owner login task. |
| #38 | Master UI Phase 2 | **Completed** | PRs #36, #37, #40, #49, #50, #53, #61, #62, #63, #66, #69, #70, #80, #84: navigation, pre-campaign guard, action dock, kinship views, portraits, focus management, window/control primitives, filters, responsive corrections, sovereign dossier and lineage network. Remaining legacy-window migration is roadmap polish, not a Phase 2 defect. |
| #41 | Master UI Phase 3 | **Completed** | PR #43 plus later increments: economy stock/flow/latest settlement, Stores resource dossiers with bounded 24-settlement history, searchable building register, dragon/creature dossiers, chronicle inbox. Per-building output is now exposed by the city/economy work (`productionChains`, upkeep lines). Historical series remains bounded to the retained ledger by design. |
| #44 | Master UI Phase 4 — art atlas | **Completed for current model scope** | Local atlases: seven portrait archetypes, fifteen building symbols, five dragon life stages, card category art + frame + rarity treatments, eight heraldry shields, title/court/banner art and `ASSET_CATALOG.md`. Further portrait variation and event art are product art batches, not missing pipeline work. |
| #45 | Master UI Phase 5 | **Completed** | Central dialog focus manager, seven-viewport matrix, contrast contracts, responsive header/side-panel fixes, reduced-motion/high-contrast/tooltip preferences, bounded DOM. Human screen-reader review remains a manual acceptance step. |
| #46 | Master UI Phase 6 — release audit | **Completed for release scope** | Tests pass on `28bb5e8`; production Pages serves that commit; release metadata and rollback path documented below. External independent design critique and a human screen-reader pass remain manual gates and are not claimed as done. |
| #56 | Master UI Phase 4 — art atlas | **Duplicate of #44** | Same deliverables and acceptance criteria; closed to keep one record. |
| #57 | Master UI Phase 3 — dossiers | **Duplicate of #41** | Same phase scope; closed to keep one record. |
| #58 | Master UI Phase 5–6 | **Superseded by #45 and #46** | Split into the two phase records actually used for acceptance. |
| #90 | Phase 4 art pipeline | **Pipeline established; first coverage batch delivered** | Original local SVG atlases, documented provenance and usage, deterministic data-to-art mapping, sprite-reference tests, no external/CDN art, 96 KB total asset payload. The suggested next portrait/building batch is roadmap art production, not an open pipeline defect. |

## F0 browser baseline (recorded 2026-11-09)

- **Browser:** Chrome 156.0.0.0 (UA: Mozilla/5.0, Macintosh; Intel Mac OS X 10_15_7)
- **Platform:** macOS, `en-US`
- **Viewport:** 432 × 719 CSS px, device pixel ratio 2
- **Graphics:** WebGL 2.0 (OpenGL ES 3.0 Chromium) — software/driver warnings only
- **Console:** no JavaScript or page errors; four `GPU stall due to ReadPixels` driver
  warnings and two Canvas2D readback warnings caused by inspection
- **Network:** 250 resources, all HTTP 200, no 404/5xx
- **Smoke flow:** production landing → forge → realm start → wet-conifer inspection →
  reload to the normal forge state. No save was written (`NO SAVED REALM`).

## Deferred manual / future work

These are explicitly **not** claimed as completed by this backlog close:

1. Human screen-reader pass and manual keyboard audit of every remaining screen.
2. External independent design critique (free-tier agent) and owner visual acceptance.
3. Cross-browser Firefox/WebKit verification; CI evidence is Chromium-only.
4. Cloudflare dashboard project settings, GitHub App permissions and notification
   routing (owner login required). The failing `kings-and-cards` Workers build is a
   separate service from Pages and should be disconnected or configured in the dashboard.
5. Additional art production: portrait variation from presentation data, event artwork,
   animation atlas and fully migrated legacy overlays.

## Rollback

- Previous known-good production commit: `930ee26`.
- Roll back in Cloudflare Dashboard → Workers & Pages → `kings-and-cards` → Deployments,
  select the last successful `930ee26` production deployment and redeploy it. Do not
  rewrite Git history; the static site has no database migration to reverse.
