# Master UI — Implementation Register

**Specification:** `MASTER UI & VISUAL DESIGN CONCEPT v1.0` (uploaded project brief)  
**Production releases:** PR #36 (UI foundation), PR #37 (pre-campaign state guard), PR #40 (Phase 2 action dock and descendant tree), PR #43 (Phase 3 economy/buildings/creatures/chronicle), PR #44 (Phase 4 portrait/art increment), PR #80 (sovereign dossier), PR #84 (connected lineage network)  
**Current UI branch:** `ulmweb-branch` (latest merged UI work: PRs #80 and #84)  
**Baseline:** `5f980cc656a0308db0b5ba6d664a615d4bca1bef`  
**Rule:** This register distinguishes implemented and tested work from the remaining concept. A styled shell is not a completed screen.

## Design decisions

- The reference is the information hierarchy and strategic clarity of a premium medieval grand-strategy game. Kings & Cards retains its own heraldry, fantasy creatures, card system and illustration language.
- The canonical palette follows the concept: royal dark `#24221F`, dark wood `#403326`, parchment `#D8C6A0`, light parchment `#EFE3C8`, antique gold `#B99A59`, bronze `#80633F`, royal red `#762F35`, deep blue `#344B65`.
- UI text and controls remain real HTML/CSS/JavaScript. Generated screenshots are never used as UI.
- Existing gameplay systems are preserved. Navigation only exposes screens that already have real data and working interactions.
- Fonts currently use local system serif/sans-serif stacks. No external font download or runtime dependency was introduced. Bundled Cinzel/Cormorant/Spectral and Source Sans 3 can be evaluated after license, weight and asset-size review.
- Existing legacy stylesheets remain loaded for backward compatibility; the new master stylesheet loads last and centralizes the design tokens and override layer.

## Merged release record

- PR #43 merged as `ad4d3c9978779aa7cc4921ec43a934d1b8338b38`; tested feature head `63ec3957697f4513ddeefd9ad5c5889689a0ceb7`.
- Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact PR #43 feature head.

- PR #40 merged as `f47da8ecfd564ecf3edcd5913607407348e4aad6`; tested feature head `e7f59bb3df9ae5961a2be65872f43e04978dd10a`.
- Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E all passed on the exact PR #40 feature head.

- PR #36 merged as `b040adf7870678132f699a7a7889b3b556aa1307`.
- PR #37 merged as `e9efbcf60950e3b596b7b8670fccb2f4b47eee8b`.
- Cloudflare Pages deployment check for `e9efbcf` succeeded; preview: https://68e0b527.kings-and-cards.pages.dev/.
- Game Quality, Kings & Cards checks and Chromium gameplay E2E passed on the relevant PR heads.
- The Pages smoke test verified the administration rail, resource strip, kingdom overview, government, economy, people and build screens. The pre-campaign guard was added after that live smoke test and then re-tested through CI.


## Phase 2 production completion increment (PR #80 and PR #84; release 3.7.0)

- The current sovereign's existing character dossier now includes the live royal-house consort, designated heir, living royal children and the latest eight recorded royal-house events.
- Former sovereign memorials are explicitly separated from the living monarch's current succession state.
- Royal-family entries reuse the existing canonical dossier navigation and stable person IDs.
- The dynasty view now presents a connected, multi-lane graph for recorded grandparents, parents, sovereign, siblings, consort, aunts/uncles, cousins and royal children. SVG connectors are positioned from live card bounds and distinguish parent, guardian, partnership and sibling links.
- The graph is bounded to 80 nodes and 120 edges; the existing descendant view retains its depth/per-generation caps. Unknown relationships are never inferred.
- Added responsive local styling, reduced-motion handling, static contracts and Chromium E2E for sovereign dossier and graph-to-dossier navigation.
- PR #80 merged as `6bab68d01dc4489a9cb018d91727ae9eb318b338`; PR #84 merged as `5f980cc656a0308db0b5ba6d664a615d4bca1bef`.
- Game Quality, Kings & Cards 2.1 checks and Chromium gameplay E2E passed on the exact PR feature heads. The independent Workers build check is not a Pages release check.
- A live Pages smoke check confirmed the official homepage and the new sovereign-dossier and lineage stylesheet/JavaScript assets are served from `kings-and-cards.pages.dev`. The exact Pages deployment ID was not available in the inspected evidence.
- No simulation rules or save schema changed. The remaining Master UI concept is not complete: broader responsive and accessibility audits, remaining character actions, and full art/animation production remain open.

## Current implementation status

| Concept work package | Status | Evidence / remaining work |
|---|---|---|
| UI-01 — inventory and architecture review | **Implemented** | Existing HTML shell, three legacy stylesheets, management modal, character dossier, card hand, canvas and existing management data modules reviewed. |
| UI-02 — design system | **First implementation** | New `css/ui-design-system.css`; canonical color, spacing, typography, radius, line and shadow tokens; parchment and timber component treatment; existing royal crest and SVG resource sprites replace several placeholder glyphs. Further component extraction remains. |
| UI-03 — button library | **Phase 2 increment** | Shared states for primary/secondary, speed, navigation, management tabs, build options and modal controls; Phase 2 adds reusable panel/card/section/icon-button primitives, tooltip surfaces and hover/focus/pressed states. Full component API and tooltip coverage remain. |
| UI-04 — main interface | **Phase 6 implemented** | Sovereign portrait/identity, kingdom crest, population, treasury trend and a live warning inbox now occupy the top status layer. The full-width action bar retains real save status. The ruler portrait opens the sovereign dossier; the warning inbox opens the chronicle. |
| UI-05 — administration screens | **Phase 6 implemented** | Economy separates stock, per-tick flow, latest settlement and cumulative totals, with two real treasury charts. The new Stores screen exposes each resource's stock, current flow, related recorded structures and a bounded 24-settlement history; the building register remains live and read-only. Per-building output, storage and upkeep are still not exposed by the simulation. |
| UI-06 — character and dynasty | **Phase 6 implemented for current data** | Sovereign/royal-house dossier, connected lineage graph, relationship navigation and dossier actions for locating a recorded home and opening the royal dynasty are wired. Deeper network exploration remains a future data feature. |
| UI-07 — fantasy areas | **Implemented for current dragon species** | Live dragon dossiers, life-stage artwork, memories and memorials are present. Other species, a full bestiary and a magic screen are not modeled by the current simulation. |
| UI-08 — menu and settings | **Phase 6 implemented** | Local save slots, export/import, version/credits metadata, named accessibility controls and the existing settings remain. |
| UI-09 — art and animation | **Phase 6 increment** | Card management, portraits, buildings, dragons and the sovereign banner use the local illustrated atlases; the asset catalogue now records the full current inventory and provenance status. House-specific heraldry and a complete animation pass remain. |
| UI-10 — QA | **Phase 6 increment** | Eleven-panel viewport matrix, dialog focus containment, runtime Chromium geometry and a 356-test full suite are present. Visual review covered 390×844, 1366×768 and 2560×1440; the remaining four viewports, full screen-reader review and animation acceptance remain. |

## Phase 2 implementation increment (released in 3.5.0)

- Added a compact contextual action dock to the management sidebar: character dossiers, dynasty, cards, chronicle and manual save.
- Added a save-status line that changes only after a save or load operation reports success/failure. No automatic-save behavior is implied or claimed.
- Replaced the dynasty history-only panel with a multi-generation descendant view built from `getFamilySnapshot` and the persisted royal house. The view is depth-limited and caps each generation to keep DOM growth predictable.
- Family members open their existing character dossier through a dedicated event bridge. This reuses the canonical people browser rather than creating a second source of truth.
- Added shared CSS primitives for dark panels, parchment cards, section headers, icon buttons, tooltip surfaces, dynasty person cards and focus/hover/pressed states.
- Added static contract tests for dock actions, kinship graph use, bounded rendering, dossier navigation and honest save-state messaging; the Chromium browser suite now exercises dynasty opening, dossier hand-off, manual save feedback and chronicle navigation.
- PR #40 merged after all three required workflows passed on the exact feature head. Cloudflare Pages delivery is tracked separately from CI and is not inferred from GitHub merge status.

## Phase 3 implementation increment (merged; 3.6.0 release candidate pending Pages)

- Added an economy view that clearly separates resource stock, current simulation-tick flow, the latest completed 20-day financial settlement and cumulative totals.
- The ledger panel uses `state.economy.lastLedger` and explicitly states that only the latest settlement is retained. It does not fabricate historical trend lines or forecasts.
- Added a read-only building register from surviving simulation entities. Each record shows the catalogue description/cost, actual health, footprint, assigned staff, workforce efficiency and centre-tile resource geography where applicable.
- Added a searchable building register and a new Buildings navigation/tab entry. Construction and demolition remain in the existing build interface.
- Per-building output, storage and upkeep are not currently represented by the simulation contract; the screen says so rather than displaying invented figures.
- Added individual creature dossiers for living dragons and memorial records, including actual life stage, needs, bond, temperament, abilities, goals and memories.
- Added a searchable chronicle/event inbox based on the saved event log, with category filtering and a dismiss/reopen flow for the existing active issue dialog. Dismissing leaves the issue pending; it does not invent unread tracking or dates.
- Added static UI contract tests and Chromium browser coverage for economy, building, creature and chronicle views. PR #43 merged after Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E passed on the exact feature head.

## Actual navigation contract

Visible left-rail actions:
- Realm → new live kingdom overview.
- Rule → existing government screen.
- People → existing character dossier browser.
- Dynasty → existing royal dynasty screen.
- Chronicle → event inbox and stored chronicle.
- Politics → existing faction/political screen.
- Economy → existing live economy screen.
- Stores → resource dossiers and bounded settlement charts.
- Buildings → live read-only building register.
- Cards → existing card hand/deck management.
- Beasts → existing creature/dragon screen.
- Build → existing road/build interface.
- Options → existing settings dialog.

The kingdom overview intentionally omits capital and territory because authoritative data is not currently exposed; it does not fabricate those values. Before a campaign starts, the overview displays an awaiting-founding state and the resource strip uses neutral placeholders instead of implying that starting values are live.

Top status resource chips mirror the simulation's wood, stone, gold, food and population values. Clicking a resource opens its Stores dossier with current stock, current-tick flow, related recorded structures and the bounded settlement history; clicking population opens real character dossiers. The sovereign portrait opens the actual royal dossier, the warning badge counts open issues/outbreaks/raids, and the warning button opens the chronicle.

## Remaining acceptance after the Phase 6 pass

- Visual review completed at 390×844, 1366×768 and 2560×1440; fixed low-contrast Stores copy, clipped mobile management tabs, overlapping modal corner ornaments, map legend/drag-status collisions and the clipped 1366 px administration rail. The remaining four viewports and a human screen-reader pass still need review.
- A complete animation pass and additional house-specific heraldry. The current art inventory is documented in `assets/ASSET_CATALOG.md`.
- Per-building production, storage and upkeep values, plus wood/stone settlement lines, remain unavailable because the simulation does not expose those contracts. The UI states this instead of inventing numbers.
- Additional character simulation actions beyond the implemented locate-home and open-dynasty navigation.
- Other creature species and a full bestiary/magic screen are future simulation features, not hidden current content.

### Verified in the Phase 6 pass
- Top status: ruler portrait/identity, crest, population, treasury trend and warning inbox.
- Resource chips open a dedicated Stores panel with stock, flow, related structures and real bounded history; economy charts read the same series.
- Map layer selector and legend for real resource, fertility and road overlays, sampled from explored geography only.
- Event category kicker, recorded participant links, chronicle hand-off and existing active-issue dismissal/reopen flow.
- Character dossier locate-home and royal-dynasty actions, local save slots, JSON export/import, version/credits and named settings controls.
- Full suite 356/356 passed; Chromium visual review at 390×844, 1366×768 and 2560×1440 passed with no page errors. The seven-viewport geometry checks remain part of the browser E2E matrix.

## Release rule

This branch is not production-ready merely because the design tokens exist. Merge/deploy only after:
1. all current unit and syntax tests pass;
2. browser E2E passes on the exact PR head;
3. all visible navigation buttons are exercised;
4. no console errors or missing assets are observed;
5. viewport checks pass;
6. map, cards, save/load, simulation speed and existing management actions regress cleanly.

Do not mark the remaining work complete by replacing it with a static mockup.


## Phase 4 art-production increment (portrait and building-register slice)

- Added `assets/royal-portraits.svg`, a locally bundled sprite library with seven original portrait archetypes: sovereign, consort, nobleman, noblewoman, scholar, knight and villager.
- Character portrait selection is deterministic from the actual sovereign flag, recorded role and recorded sex; it does not infer hidden identity or alter simulation records.
- The people roster, full character dossier and dynasty cards now use the same portrait sprite library.
- Character dossier relationship lists are now real navigation controls that open another recorded dossier; missing or archived IDs are not fabricated.
- The dynasty view now includes verified sovereign parents and siblings, plus cousins only when the persisted parent-sibling-child links establish them. Every relationship is bounded and deduplicated.
- The building register now shows the existing local SVG building sprite that best matches each actual building type.
- All art is bundled locally as SVG; no runtime font, image CDN, paid API or external request is introduced.
- This is an initial coherent portrait suite, not the complete art atlas. Dedicated original building scenes, additional creature artwork, card illustrations, house heraldry and animated construction/event assets remain open.


## Phase 5 accessibility and responsive increment (merged in PR #50)

- Added a central dialog focus manager for the founding screen, settings, character dossiers, realm events, management, construction and message dialogs.
- Modal focus is moved into the topmost visible dialog, Tab/Shift+Tab remain inside it, and closing restores focus to the invoking control where it remains visible.
- If the invoking control belongs to a dialog that was closed underneath a nested dialog, focus falls back to the main game region rather than a hidden element.
- Added accessible dialog names to the founding and settings screens; all dialog overlays now have explicit modal semantics and labels.
- Added scroll containment and short-viewport handling so tall dialogs remain reachable on narrow phones and short displays.
- Static tests and Chromium E2E cover initial focus, tab containment and focus fallback. Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E passed on the exact PR #50 feature head `2a8f0df5ef5a32c010bf3f24a0c71fd0980df72f` before merge. Full 390×844, 768×1024 and desktop viewport screenshot review remains a separate acceptance gate.


## Phase 2 full-width action bar increment

- Moved the contextual action dock out of the right-hand management column and made it a full-width sibling of the game layout.
- The same wired actions remain: people, dynasty, cards, chronicle and manual save. The save status remains tied to actual save outcomes.
- Added compact flex wrapping for phone widths; the dock remains full-width and its controls keep visible keyboard focus.
- Added Chromium E2E checks for all seven specified viewport sizes, horizontal overflow, full-width dock geometry and management-dialog containment.


## Phase 4 — dedicated building art and royal title illustration

- Added `assets/royal-building-atlas.svg` with 15 original symbols covering every building type in the current entity model: keep, cottage, farm, lumber yard, quarry, watchtower, wall, tavern, temple, barracks, windmill, stable, wonder, gold mine and storehouse.
- The building register selects a dedicated illustration by the actual building type rather than reusing approximate icons for unrelated structures.
- Added `assets/royal-title-illustration.svg`, a muted dusk castle panorama, and replaced the bright storybook-style main-menu illustration.
- Both assets are compact, local SVG; no external image request, paid API or large raster download is added.
- Dedicated creature variants, card-face illustrations, house heraldry, event artwork and portrait variation remain open.


## Phase 4 — card illustration and frame increment

- Added `assets/royal-card-atlas.svg` with original category illustrations for the current card groups. Existing group-to-symbol mapping is preserved through aliases, so no card model or save data changes are needed.
- Replaced the emoji duplicate in each card banner with a single scalable SVG illustration.
- Added `assets/royal-card-frame.svg`, a restrained parchment-and-antique-gold card frame.
- Added differentiated rarity border treatments for common, uncommon, fine, rare, epic and higher rarities.
- Static contracts and Chromium E2E verify that cards use the new local atlas and frame. Unique hand-painted art for individual procedural card variants remains a later art pass.


## Phase 4 — dragon life-stage artwork

- Added `assets/royal-dragon-atlas.svg` with five original dragon illustrations mapped to the simulation's actual life stages: hatchling, juvenile, adult, elder and ancient.
- Living dragon dossiers and memorials now choose the matching artwork from the persisted `lifeStage` value. The art does not infer or change creature species, age, temperament or abilities.
- Memorial portraits receive a restrained desaturated treatment.
- Static contracts and Chromium E2E verify the five stage assets and exact stage-to-symbol mapping.
- Dragons are currently the only modeled royal creature species. No griffin, wyvern or other unsupported species have been invented.


## Phase 2 — reusable control primitives

- Added `css/ui-components.css` as a shared control layer for primary, secondary, tab and icon buttons; shared panel and panel-header primitives; tooltip styling; focus, hover, pressed, selected and disabled states; and reduced-motion behavior.
- Applied the shared classes to founding/settings actions, modal close controls, management tabs, panels and the full-width action bar.
- Replaced native-only action-dock title tooltips with styled, keyboard-focusable tooltips while retaining accessible visible button labels.
- Added static contracts and Chromium assertions for the shared primary/tab controls.
- This is the shared control foundation, not yet a complete windowing API or a full migration of every legacy game button.


## Phase 2 — reusable window primitives

- Added a shared window sizing system with compact founding, small, medium and large presets.
- Added consistent header, body and footer regions with bounded height, scroll ownership and overscroll containment.
- Applied the window system to settings, people dossiers, management, construction, event dialogs and the founding screen.
- Added narrow- and short-viewport rules so windows remain reachable without scrolling the page behind them.
- Static contracts and Chromium E2E verify shared window sizes and scroll regions. Dragging/resizing, window stacking beyond the existing modal focus manager and a full legacy overlay migration remain open.


## Phase 2 — data-driven character filters

- Added roster filters for living/deceased status, recorded role and recorded species.
- Role and species options are derived from the actual living/archive records; no fictional categories or placeholder counts are introduced.
- Each roster item exposes its actual role, species and archive status as data attributes for accessible filtering and testability.
- Added compact responsive filter styling, static contracts and Chromium E2E checks for role and living-person filtering.
- Portrait variation beyond the existing seven archetypes and the full sovereign dossier remain open.


## Phase 5 — administration navigation semantics (quality increment)

- Changed the active royal administration item from toggle-button semantics (`aria-pressed`) to current-page semantics (`aria-current="page"`). The control remains a native button so it is still keyboard-operable.
- Inactive navigation items remove the current-page attribute; only the currently selected section is announced as current.
- Added a static contract covering all twelve navigation destinations at that time; the current rail has thirteen after the Stores destination was added in Phase 6.
- Added a Chromium E2E check that focuses the Economy navigation item, activates it with Enter, verifies the real Economy screen opens, and checks the accessible current-page state.
- This is a targeted accessibility correction, not a complete keyboard or screen-reader audit. The broader Phase 5 checklist remains open.


## Phase 5 — repeatable visual viewport evidence

- Extended the Chromium viewport matrix to capture both the live realm layout and the open management window at all seven required viewport sizes: 390×844, 768×1024, 1280×720, 1366×768, 1600×900, 1920×1080 and 2560×1440.
- Screenshots are written to the runner's temporary directory, not committed to the game repository.
- The browser workflow uploads the screenshot set as the kings-and-cards-ui-viewport-review artifact for seven days, including on failed test runs when files were produced.
- These screenshots create review evidence; they do not replace a human visual inspection. Other overlays, map layers, contrast and screen-reader review remain outstanding.


## HUD 3.8 — The Throne Room (presentation increment, release 3.8.0)

- Replaces the mixed prototype shell with a two-row banner header, a 96 px administration rail, a framed world stage and a full-width command bar.
- The hand is now five explicit numbered slots with dashed empty states. The dock and the minimap have disjoint geometry at 390×844, 900×1000, 1440×900 and 1920×1080.
- The card inspector has a real empty state instead of a PLAY ribbon over an empty frame, and the selected card uses the original card atlas rather than an emoji.
- Resource income deltas are rounded and colour-coded; raw floating-point values can no longer reach the HUD.
- `.hidden` is now a global display contract, which fixes the build-cancel control that previously stayed visible outside construction mode.
- Terrain gains north-west hillshade, coastal lightening, water-depth tone and jittered translucent ground detail; every building type has a dedicated rooftop silhouette and the keep has a full castle plan.
- The founding screen becomes a two-column plate on desktop, removing the inner scroll from the World Forge and action stack.
- Static contracts live in `tests/ui/hud-v3.test.js`; browser geometry was audited at four viewport sizes with no horizontal overflow, no overlapping header groups, no clipped cards and no minimap/dock collision.
- Remaining: complete screen-reader audit, animated transition pass, building interior detail at zoom 4, and per-screen responsive polish for the management windows.

## Phase 5 — global header responsive correction

- Visual inspection of the seven-viewport screenshot artifact found that the top status/actions row was clipped or crowded at 390×844, 1280×720 and 1600×900 even though the document itself did not horizontally overflow.
- Added responsive header wrapping: at intermediate desktop widths the action controls move to a dedicated second row; at narrow widths they wrap below the resource strip rather than being clipped off-screen.
- Extended Chromium E2E to assert topbar intrinsic width, pairwise non-overlap of header groups and visibility of every rendered header action at all seven viewport sizes.
- This corrects the header only. The screenshot review still shows placeholder-like map/building shapes and a relatively sparse world stage; those belong to the separate world-art production backlog, not this layout fix.


## Phase 5 — mobile management-column scroll containment

- The post-header-fix screenshot review showed that the narrow-screen layout could cut off the selected card and lower management content because the side panel had a fixed responsive height without its own vertical scroll owner.
- Added a contained vertical scroll region to the mobile side panel while keeping resource, card, tab and footer sections at their natural minimum sizes.
- Chromium E2E now verifies that the side panel has overflow content and that scrolling reaches it at both 390×844 and 768×1024.
- This preserves the fixed game shell and bottom action bar; it does not introduce document-level scrolling or alter simulation behavior.


## Phase 5 merged responsive corrections

- PR #69 merged as `e4d343041ec6960502c471aa5efd2ca0994f85f5`: the global action controls now wrap at intermediate desktop and narrow mobile widths. Its exact feature head passed Game Quality, Kings & Cards 2.1 checks and Chromium Browser E2E; the 14-image viewport artifact was visually reviewed.
- PR #70 merged as `09c2d747f08216199154af480735eeae064d0e9b`: the mobile side panel now owns a contained vertical scroll region so the card, resource, tabs and footer content remain reachable. Its exact feature head passed all three required workflows, including actual scroll-range checks at 390×844 and 768×1024.
- The separate Workers build check is not a Cloudflare Pages result and is not treated as proof of Pages production delivery. The production Pages URL remains `https://kings-and-cards.pages.dev/`; its currently served commit must be verified independently before changing the production-version declaration.


## 3.6.0 Pages release verification

- Machine-readable game version in `game/package.json`: `3.6.0`.
- Production branch: `ulmweb-branch`; latest verified production-branch commit at this check: `09c2d747f08216199154af480735eeae064d0e9b`.
- Cloudflare Pages check run `127533959060`: `success`, summary `Deployed successfully`, deployment ID `35e2a522-431d-4558-8195-06a24bb4dc2d`.
- Deployment preview: https://35e2a522.kings-and-cards.pages.dev/ . The canonical user-facing address remains https://kings-and-cards.pages.dev/.
- This is Pages evidence. The separate Workers build check is not used as deployment evidence for the game.


## Phase 5 — selected-card visibility above the mobile action dock

- Visual/browser geometry exposed a 37px overlap between the side-panel lower edge and the bottom action dock at 390×844.
- Added 44px of mobile-only bottom scroll clearance so the selected card can be brought fully above the dock.
- Chromium now checks the actual visible boundary (minimum of side-panel bottom and action-dock top) at 390×844 and 768×1024. It requires scrolling only when the card is initially obscured; if the tablet layout already shows it, no artificial scroll is demanded.
- Captures scrolled-state screenshots for review and restores the original scroll position.


## Phase 5 — selected-card reachability proof

- Strengthened the mobile side-panel test beyond merely checking that a scrollbar exists: Chromium now scrolls the selected card into the visible region and verifies that the entire card fits inside the panel viewport at 390×844 and 768×1024.
- Captures a separate scrolled-state screenshot for both mobile/tablet sizes as review evidence, then restores the original scroll position before continuing the test.


### Follow-up correction — mobile dock overlap

- The first full-visibility assertion exposed a real 37px overlap between the side-panel's lower edge and the fixed-height action dock at 390×844.
- Added 44px of mobile-only bottom scroll space and changed the browser check to align the selected card above the actual visible boundary (the earlier of the side-panel bottom and dock top).
- The check now validates the visible region, not just the side-panel's theoretical bounding box.


## Phase 2 — dedicated sovereign dossier increment (3.7.0-dev)

- Added a royal-house section to the current sovereign's dossier, reading the live consort, designated heir, living children and recorded royal-house history from `getRoyalHouse()`.
- Royal-family entries use the existing person dossier navigation bridge and canonical person IDs.
- Former sovereign memorials are labeled separately and do not display the living monarch's succession state.
- Royal-house history rendering is bounded to the latest eight records; the simulation's own history remains capped at 48.
- Added responsive local styling and static contracts for current/former sovereign separation, source-backed fields and navigation.
- No simulation or save-schema changes. The sovereign-to-heir browser hand-off remains an explicit E2E acceptance item.


## Phase 2 — connected royal lineage network

- Added a multi-lane graph built exclusively from explicit saved parent, child, sibling, partnership and guardian links.
- Shows verified grandparents, parents, sovereign and siblings, consort, aunts/uncles, cousins and royal children where records exist.
- SVG connectors are calculated from live card bounds; partnership, sibling, guardian and parent edges use distinct treatments. The existing dossier navigation is reused.
- Added hard limits of 80 nodes and 120 connector edges, alongside the existing four-generation/24-person descendant limits, to prevent runaway DOM growth.
- Added deterministic Chromium coverage for royal consort/child links, connector paths and heir dossier navigation; reduced-motion and narrow-screen styling included.
- No simulation or save-schema changes. Missing kinship links are never inferred.
