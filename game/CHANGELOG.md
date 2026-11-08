# Kings & Cards — Version and Development History

**Current production version:** `3.9.0`
**Next development line:** `3.10.0-dev`
**Production branch:** `ulmweb-branch`  
**Game root:** `game/`  
**Production URL:** https://kings-and-cards.pages.dev/  
**Last repository verification:** 2026-11-08 (UTC)

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

## Production release history

### 3.10.0-dev — Pointer steering, on-demand cards and portable terrain reports
**Status:** development branch only; not a production release.

- Seasonal overhaul: fixed snow in summer. Weather now follows a season-aware table and spells last 3–12 days instead of 280–1100; a snowfall is reconciled to rain as soon as the snow-cover curve reaches zero, and old saves are clamped on load. The ground uses one continuous calendar with asymmetric snow (accumulates through late autumn, peaks in winter, melts through early spring) and leaf-litter/green-up curves; palette colours and sun elevation are anchored mid-season so a season reaches full colour in its middle instead of on its first day. Trees and shrubs now turn and drop per tree and species: birch is early, oaks and beeches keep brown leaves into winter, conifers stay green under snow, and bare crowns draw real branches instead of a grey ball. Added `season-transition.png` and `tree-seasons.png` reference sheets and season/weather/foliage tests; the suite is now 497 tests.

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
