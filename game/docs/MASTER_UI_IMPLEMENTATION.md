# Master UI — Implementation Register

**Specification:** `MASTER UI & VISUAL DESIGN CONCEPT v1.0` (uploaded project brief)  
**Production releases:** PR #36 (UI foundation), PR #37 (pre-campaign state guard), PR #40 (Phase 2 dynasty and action dock), PR #43 (Phase 3 economy, buildings, creatures and chronicle), PR #44 (Phase 4 portrait and illustrated-register increment)  
**Current UI branch:** `kac-release-3-6-0-ui-phase-3`  
**Baseline:** `6c4c3f0442ea18aa04fee5598e909ddfc6b4d900`  
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

## Current implementation status

| Concept work package | Status | Evidence / remaining work |
|---|---|---|
| UI-01 — inventory and architecture review | **Implemented** | Existing HTML shell, three legacy stylesheets, management modal, character dossier, card hand, canvas and existing management data modules reviewed. |
| UI-02 — design system | **First implementation** | New `css/ui-design-system.css`; canonical color, spacing, typography, radius, line and shadow tokens; parchment and timber component treatment; existing royal crest and SVG resource sprites replace several placeholder glyphs. Further component extraction remains. |
| UI-03 — button library | **Phase 2 increment** | Shared states for primary/secondary, speed, navigation, management tabs, build options and modal controls; Phase 2 adds reusable panel/card/section/icon-button primitives, tooltip surfaces and hover/focus/pressed states. Full component API and tooltip coverage remain. |
| UI-04 — main interface | **Phase 2 increment** | Adds a contextual sidebar action dock for people, dynasty, cards, chronicle and manual save; save status reflects confirmed save/load success or failure. This is not autosave. The final full-width lower action bar, clickable ruler portrait and dedicated event inbox remain. |
| UI-05 — administration screens | **Phase 3 increment** | Economy separates current stock, per-tick flow, latest 20-day settlement and cumulative totals. A searchable read-only building register exposes live structures, health, footprint, workforce, efficiency, catalogue costs and site-tile resource data. Historical charts, per-building output, storage and forecasts remain unavailable until the simulation retains those contracts. |
| UI-06 — character and dynasty | **Phase 4 increment** | Adds a seven-archetype original heraldic portrait sprite system to the roster, dossiers and dynasty cards; recorded relationship links navigate directly between dossiers; the sovereign view adds verified parent, sibling and cousin groups. Deeper network visualization, advanced filters and expanded character actions remain. |
| UI-07 — fantasy areas | **Partial** | Existing dragon/creature management and card rarity styles retained. Full creature dossiers, bestiary, magic screen and illustrated legendary card treatment remain. |
| UI-08 — menu and settings | **Partial** | Existing main menu and settings remain; visual override applied. Version/credits/save-slot management and graphics/accessibility controls remain. |
| UI-09 — art and animation | **Phase 4 increment** | Adds seven original, locally bundled heraldic portrait archetypes and reuses existing illustrated building sprites in the register. The complete building/creature/card illustration atlas, house-specific heraldry, asset audit and animation pass remain. |
| UI-10 — QA | **Phase 5 increment** | Adds centralized dialog naming, focus containment/restoration and compact-height overflow handling. Full viewport matrix, screen-reader review and visual screenshot audit remain. |

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
- Politics → existing faction/political screen.
- Economy → existing live economy screen.
- Cards → existing card hand/deck management.
- Beasts → existing creature/dragon screen.
- Build → existing road/build interface.
- Options → existing settings dialog.

The kingdom overview intentionally omits capital and territory because authoritative data is not currently exposed; it does not fabricate those values. Before a campaign starts, the overview displays an awaiting-founding state and the resource strip uses neutral placeholders instead of implying that starting values are live.

Top status resource chips mirror the simulation's wood, stone, gold, food and population values. Clicking resource chips opens the real economy screen; clicking population opens real character dossiers. They do not invent a resource-detail view.

## Work still required for full specification acceptance

### Layout and information hierarchy
- Full ruler identity/portrait, kingdom crest, population, treasury trend and warning inbox in the top status layer.
- A full-width lower contextual action bar with live save status and responsive wrapping (Phase 2 increment; PR #52).
- Resource chips open a dedicated resource detail panel with production, consumption, trends, storage and relevant buildings once those data contracts exist.
- Map layer selector and legend only when each overlay has real simulation data.

### Reusable components
- Extract shared button, icon button, tab, panel, modal, tooltip, notification, progress, resource and card-frame primitives.
- Normalize focus, disabled, selected, pressed, loading and notification states.
- Add tooltip descriptions, costs, prerequisites and keyboard hints where supported.

### Screens
- Kingdom overview, building dossier, resource details and economic charts.
- Character relationship and family views.
- A navigable multi-generation family tree.
- Full creature dossier and history.
- Event presentation with people/place links and event category treatment.
- Chronicle with chronology, filtering and search.
- Save-slot management, credits, version display and accessible settings.

### Art direction
- Complete asset inventory and usage/license record.
- Consistent SVG heraldry, icons and frames.
- Cohesive portrait, building, creature, event and card illustration sets.
- Optimize raster assets to WebP/AVIF only where the build/runtime supports it; do not add multi-gigabyte assets. Prefer compact, purpose-built SVG and optimized raster art.
- Do not use emoji as substitutes for finished game art.

### Responsive and performance validation
Test 1280×720, 1366×768, 1600×900, 1920×1080 and 2560×1440 plus narrow browser windows.
Check overlays, scroll containment, text legibility, focus, keyboard operation, canvas resize, long character lists, card-hand rendering and management-modal performance.
Respect `prefers-reduced-motion`.

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
