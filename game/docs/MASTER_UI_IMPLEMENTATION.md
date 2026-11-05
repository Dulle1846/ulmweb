# Master UI — Implementation Register

**Specification:** `MASTER UI & VISUAL DESIGN CONCEPT v1.0` (uploaded project brief)  
**Implementation branch:** `kac-ui-01-03-master-design-system`  
**Baseline:** `6c4c3f0442ea18aa04fee5598e909ddfc6b4d900`  
**Rule:** This register distinguishes implemented and tested work from the remaining concept. A styled shell is not a completed screen.

## Design decisions

- The reference is the information hierarchy and strategic clarity of a premium medieval grand-strategy game. Kings & Cards retains its own heraldry, fantasy creatures, card system and illustration language.
- The canonical palette follows the concept: royal dark `#24221F`, dark wood `#403326`, parchment `#D8C6A0`, light parchment `#EFE3C8`, antique gold `#B99A59`, bronze `#80633F`, royal red `#762F35`, deep blue `#344B65`.
- UI text and controls remain real HTML/CSS/JavaScript. Generated screenshots are never used as UI.
- Existing gameplay systems are preserved. Navigation only exposes screens that already have real data and working interactions.
- Fonts currently use local system serif/sans-serif stacks. No external font download or runtime dependency was introduced. Bundled Cinzel/Cormorant/Spectral and Source Sans 3 can be evaluated after license, weight and asset-size review.
- Existing legacy stylesheets remain loaded for backward compatibility; the new master stylesheet loads last and centralizes the design tokens and override layer.

## Current implementation status

| Concept work package | Status | Evidence / remaining work |
|---|---|---|
| UI-01 — inventory and architecture review | **Implemented** | Existing HTML shell, three legacy stylesheets, management modal, character dossier, card hand, canvas and existing management data modules reviewed. |
| UI-02 — design system | **First implementation** | New `css/ui-design-system.css`; canonical color, spacing, typography, radius, line and shadow tokens; parchment and timber component treatment. Further component extraction remains. |
| UI-03 — button library | **First implementation** | Shared states for primary/secondary, speed, navigation, management tabs, build options and modal controls. Full standalone reusable component API and tooltip coverage remain. |
| UI-04 — main interface | **First implementation** | Royal navigation rail, live resource/population strip, existing map and right-side card/management panel retained. A live kingdom overview now reads sovereign, year, population, morale, treasury, housing, workforce, legitimacy, resources and recent records. Lower action bar, clickable ruler portrait, autosave status and event inbox remain. |
| UI-05 — administration screens | **Partial** | Existing government, politics and economy screens are reachable from the rail. Kingdom overview, resource drill-down, production, storage, finance forecasts and building dossier are not yet complete. |
| UI-06 — character and dynasty | **Partial** | Existing character dossiers and royal dynasty management remain available. Tree visualization, family filters, relationship navigation and full character actions remain. |
| UI-07 — fantasy areas | **Partial** | Existing dragon/creature management and card rarity styles retained. Full creature dossiers, bestiary, magic screen and illustrated legendary card treatment remain. |
| UI-08 — menu and settings | **Partial** | Existing main menu and settings remain; visual override applied. Version/credits/save-slot management and graphics/accessibility controls remain. |
| UI-09 — art and animation | **Partial** | Existing SVG illustrations and iconography reused. Asset audit, coherent portrait/building/creature set and construction/event animation pass remain. |
| UI-10 — QA | **In progress** | Added static UI contract tests. Browser E2E and viewport matrix must pass on the exact PR head before release. |

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

The kingdom overview intentionally omits capital and territory because authoritative data is not currently exposed; it does not fabricate those values.

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
