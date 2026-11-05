# Master UI — Implementation Register

**Specification:** `MASTER UI & VISUAL DESIGN CONCEPT v1.0` (uploaded project brief)  
**Production releases:** PR #36 (UI foundation), PR #37 (pre-campaign state guard)  
**Current UI branch:** `kac-ui-phase-2-dynasty-action-dock`  
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
| UI-03 — button library | **First implementation** | Shared states for primary/secondary, speed, navigation, management tabs, build options and modal controls; active navigation and tabs expose accessible pressed state. Phase 2 adds reusable panel/card/section/icon-button primitives and opt-in accessible CSS tooltips. Full component API and tooltip coverage remain. |
| UI-04 — main interface | **Phase 2 increment** | Adds a contextual action dock for people, dynasty, cards, chronicle and manual save; save status reflects confirmed save/load success or failure. This is not autosave. The existing map and right-side management panel remain. Clickable ruler portrait and a dedicated event inbox remain. |
| UI-05 — administration screens | **Partial** | Existing government, politics and economy screens are reachable from the rail. Kingdom overview, resource drill-down, production, storage, finance forecasts and building dossier are not yet complete. |
| UI-06 — character and dynasty | **Phase 2 increment** | Adds a bounded, multi-generation descendant tree sourced only from the explicit kinship graph, with living/deceased family records and direct dossier navigation. Broader family filters, ancestor/sibling network layout and expanded character actions remain. |
| UI-07 — fantasy areas | **Partial** | Existing dragon/creature management and card rarity styles retained. Full creature dossiers, bestiary, magic screen and illustrated legendary card treatment remain. |
| UI-08 — menu and settings | **Partial** | Existing main menu and settings remain; visual override applied. Version/credits/save-slot management and graphics/accessibility controls remain. |
| UI-09 — art and animation | **Partial** | Existing SVG illustrations and iconography reused. Asset audit, coherent portrait/building/creature set and construction/event animation pass remain. |
| UI-10 — QA | **In progress** | Added static UI contract tests. Browser E2E and viewport matrix must pass on the exact PR head before release. |

## Phase 2 implementation increment (PR in review)

- Added a compact contextual action dock to the management sidebar: character dossiers, dynasty, cards, chronicle and manual save.
- Added a save-status line that changes only after a save or load operation reports success/failure. No automatic-save behavior is implied or claimed.
- Replaced the dynasty history-only panel with a multi-generation descendant view built from `getFamilySnapshot` and the persisted royal house. The view is depth-limited and caps each generation to keep DOM growth predictable.
- Family members open their existing character dossier through a dedicated event bridge. This reuses the canonical people browser rather than creating a second source of truth.
- Added shared CSS primitives for dark panels, parchment cards, section headers, icon buttons, tooltip surfaces, dynasty person cards and focus/hover/pressed states.
- Added static contract tests for dock actions, kinship graph use, bounded rendering, dossier navigation and honest save-state messaging; the Chromium browser suite now exercises dynasty opening, dossier hand-off, manual save feedback and chronicle navigation.
- These changes are pending CI and browser review on the exact pull-request head. They are not production-released until the release rule below is met.

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
- A genuine lower quick-action bar with contextual actions and keyboard support.
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
