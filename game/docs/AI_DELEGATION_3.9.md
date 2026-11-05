# 3.9 work package and free-AI delegation plan

**Baseline:** 3.8.0 “Throne Room” HUD (presentation layer `css/hud-v3.css`, five-slot hand, framed stage, castle/roof art, rounded income deltas).
**Purpose:** give the owner a concrete, copy-paste plan for the next increment and a short list of free tools that can help without spending money.
**Rule for every contributor, human or AI:** presentation and content only unless a package says otherwise. `cd game && npm test` must pass before a patch is proposed, and no external dependency, CDN request or paid service may be added.

---

## 1. Verified state (facts, not intentions)

- `cd game && npm test` → 279 tests pass, 0 fail; the syntax/import check covers 56 source files and 99 referenced UI ids.
- Browser audit at 390×844, 900×1000, 1440×900 and 1920×1080: no horizontal document overflow, no overlapping topbar groups, no clipped hand cards, minimap never intersects the hand dock.
- Live simulation run to tick 127 at 4× with zero console or page errors; a card was drawn, selected and rendered from `assets/royal-card-atlas.svg`.
- Save writes a per-profile key (`kings-and-cards:save:v1:<profileId>`), LOAD restores it and reports `LOADED · <time>` in the panel footer.
- Known visual weak points (deliberately left for 3.9):
  - The management overlay is a fixed ~1160×876 plate; on a 1366×768 laptop it is cramped and on a phone it is unusable.
  - The world is still mostly one green biome; fields, roads, river banks and biome edges have no art.
  - Terrain detail is procedural per tile with no prerender budget for very large viewports.
  - No screen-reader pass has been done on the new header, rail or hand.

## 2. Free tools that are actually usable (no payment)

Check each vendor page before relying on a limit; free quotas change often.

| Tool | Free access | Best job for this project |
| --- | --- | --- |
| Claude (claude.ai) | Free plan: chat, file upload, code execution, Artifacts; usage limits per 5 h and per week | Careful refactors, design critique, writing the next release note |
| ChatGPT | Free plan: chat, file uploads; flagship model capped per 5 h window | Debugging a single error, explaining a diff |
| Google AI Studio / Gemini | Free tier, long context | Paste the whole `game/js` tree and ask for a cross-file review |
| DeepSeek (chat.deepseek.com) | Free chat, large context, no paywall on file uploads | Cheap second opinion on layout/JS logic |
| Qwen Chat | Free web chat, strong on code | Alternative when another quota is exhausted |
| Kimi | Free chat, long context | Whole-file rewrites when a file must be produced in one shot |
| GitHub Copilot Free (VS Code) | Free tier with monthly completions and chat quota | In-editor autocomplete while hand-editing CSS |
| Perplexity | Free tier | Research only (font licensing, CSS support, accessibility rules) |

Arena-style model comparison sites are fine for A/B critique of one snippet, but not for multi-file work: they cannot hold the repository state.
Never paste secrets, the `kings-and-cards:save:*` keys of other players, or personal data into any external tool.

## 3. Work packages

### WP-1 — Responsive management overlay
**Problem:** `#command` overlay renders a fixed 1160 px plate with a 10-tab rail; below 1100 px the tab labels collide, on phones the plate overflows.
**Do:** clamp the plate to `min(1160px, 96vw)` and `max-height: calc(100dvh - 32px)`, make the tab rail horizontally scrollable with `scroll-snap`, stack the summary cards 2×2 below 720 px and 1×1 below 480 px, and keep the close button pinned.
**Accept:** at 1366×768, 1024×768 and 390×844 the overlay has no horizontal scroll, the close button stays reachable, the tab strip never truncates a label, and `npm test` passes.
**Files:** `game/css/sovereign-dossier.css`, `game/index.html` (only if a wrapper is needed).

### WP-2 — Card content expansion (40 cards)
**Problem:** the catalogue is broad but the early hand repeats the same five effects.
**Do:** add 40 definitions across `court`, `economy`, `nature`, `military`, `underworld` with real costs, two-stage outcomes and a distinct description; every card must be reachable from the existing draw pools and must not break the economy.
**Accept:** `tests/simulation/cards.test.js` (or a sibling) asserts unique ids, positive costs, valid effect keys, draw-pool membership and a documented balance band (±20 % of the median cost per rarity); `npm test` passes.
**Files:** `game/js/systems/card-catalog.js`, `game/js/content/*`, `game/tests/**`.

### WP-3 — World art: fields, roads, river banks
**Problem:** the valley reads as one green field with isolated buildings.
**Do:** draw crop furrow patches around farms, a packed-earth strip under roads, a lighter sand/pebble band on water edges, and biome transition dithering between grass/forest/rock. All detail must be deterministic from the tile seed and must fade with zoom.
**Accept:** no new image request, prerender cost stays under 80 ms at 1920×1080 on the dev machine, and screenshots at zoom 1 and 3 show visible variety without speckle.
**Files:** `game/js/presentation/rendering/terrain.js`, `game/js/presentation/rendering/entities.js`.

### WP-4 — Accessibility pass on the new HUD
**Do:** give the header rail `aria-current`, make the five hand slots a labelled list, ensure every icon-only button has an accessible name, add a visible `:focus-visible` ring to all HUD controls, and verify contrast of the 7–8 px labels against their panels (aim ≥ 4.5:1 for text, ≥ 3:1 for large text).
**Accept:** keyboard-only run through header → rail → hand → inspector without a focus trap; axe-core or manual contrast table attached to the PR; no visual regression at 1440×900.
**Files:** `game/index.html`, `game/css/hud-v3.css`, `game/js/presentation/rendering/ui.js`.

### WP-5 — Phone “field mode”
**Problem:** at 390 px the header is two action rows plus resources (~213 px) and the side panel is a squeezed column.
**Do:** collapse secondary actions (`SAVE`, `LOAD`, `MANAGEMENT`, settings) into a single overflow button that opens the existing command panel, keep `PAUSE` + speed + resources visible, and turn the side panel into a bottom sheet with a drag handle above the fixed action bar.
**Accept:** header ≤ 150 px tall at 390×844, all four speed presets reachable without scrolling, side panel opens to ≥ 55 % viewport height and closes with a swipe or the handle, no overlap with the hand dock.
**Files:** `game/css/hud-v3.css`, `game/js/presentation/input.js`, `game/index.html`.

### WP-6 — Rendering budget
**Do:** measure `requestAnimationFrame` frame time at zoom 3 with 40 entities at 1920×1080, cache the prerendered terrain per zoom level, and stop redrawing the full terrain layer when only entities change.
**Accept:** p95 frame time ≤ 12 ms, memory delta after 60 s of 4× simulation ≤ 15 MB, before/after numbers in the PR description.
**Files:** `game/js/presentation/rendering/renderer.js`, `game/js/presentation/rendering/world.js`.

## 4. Copy-paste prompts

Use one prompt per tool and one work package per conversation. Attach only the files named in the package.

### Claude — WP-4 (accessibility)
```
You are reviewing a vanilla HTML/CSS/JS browser game (no framework, no build step).
Repository subset: index.html, css/hud-v3.css, css/medieval.css, js/presentation/rendering/ui.js (attached).
Context: the in-game HUD was just rebuilt. It has a two-row header, a left administration rail with 12 icon+label buttons, a five-slot card hand and a right-hand panel with tabs.
Task: produce a concrete accessibility patch for this HUD only.
Requirements:
- every icon-only control gets an accessible name;
- the hand becomes a labelled list with slot numbers exposed to screen readers;
- focus-visible rings on all interactive HUD elements, never removed without a replacement;
- aria-current on the active rail section;
- do not change gameplay logic, ids used by tests, or the visual language.
- contrast: flag any text below 4.5:1 on its actual background and propose the exact colour replacement.
Output: unified diff per file, then a short table of every contrast pair you changed with old/new ratio.
Do not add dependencies. Do not rewrite unrelated CSS.
```

### DeepSeek or Qwen — WP-1 (responsive overlay)
```
Vanilla CSS task. Attached: css/sovereign-dossier.css and the overlay markup from index.html.
The overlay is a fixed 1160 px wide plate with a 10-tab strip and a summary row of four cards.
Make it responsive:
- width min(1160px, 96vw), max-height calc(100dvh - 32px), internal scroll for the content area only;
- the tab strip becomes horizontally scrollable with scroll-snap below 1100 px, labels never truncate;
- summary cards 4 columns > 1000 px, 2 columns 720-1000 px, 1 column < 720 px;
- the close button stays pinned and reachable at every size.
Constraints: no new dependency, no CSS preprocessor, keep existing class names, do not touch JS.
Output: the complete replacement CSS block plus a list of selectors you added.
```

### Kimi — WP-2 (card content)
```
Write 40 new card definitions for a medieval realm simulator.
Attached: js/systems/card-catalog.js and one existing card object for shape reference.
Rules:
- groups: court (8), economy (8), nature (8), military (8), underworld (8);
- rarity distribution: common 16, uncommon 12, rare 8, epic 4;
- cost band: common 4-9 gold-equivalent, uncommon 8-16, rare 14-26, epic 22-40;
- each card: id (kebab-case, unique), name (title case, ≤ 34 chars), group, rarity, cost object, description (≤ 90 chars, concrete, no purple prose), two-stage outcome text;
- effects must reference existing effect keys only; list any key you wanted but could not find instead of inventing it;
- no duplicated names, no historical anachronisms after 1500.
Output: a single JS array literal that can be appended to the catalogue, plus a table of id → cost → rarity.
```

### Gemini / AI Studio — whole-tree review
```
Attached: a zip of game/js (ES modules, no build step).
Task: a read-only architectural review, not a rewrite.
Report:
1. every place where UI rendering reads mutable simulation state without a guard;
2. duplicated calculation between simulation and presentation (name both files and lines);
3. listeners or intervals that are registered but never removed;
4. any function that can throw during a normal render pass and would blank the HUD.
Prioritise by user-visible risk. For each finding give file, line, one-sentence impact and a minimal fix. Do not propose new libraries or file reorganisations.
```

### ChatGPT — debugging helper
```
Here is the exact console error, the stack trace and the 40 lines of code around it (attached).
Explain the root cause in two sentences, then give the smallest patch that fixes it without changing behaviour elsewhere. If the cause is ambiguous, list the two most likely causes and the one-line check that distinguishes them.
```

## 5. Review protocol for anything an outside model returns

1. Apply the patch to a scratch branch, never to `ulmweb-branch` directly.
2. Run `cd game && npm test`; a patch that lowers the passing count is rejected.
3. Diff the touched files; reject any change outside the work package.
4. Open the game at 1440×900 and 390×844 and compare against the previous screenshot.
5. Only then commit, and describe the measured effect (frame time, contrast ratio, viewport) — not the intention.

## 6. What not to delegate

- Save-format and migration work: a mistake silently destroys player realms.
- Economy rebalancing without simulation tests.
- Anything involving accounts, keys, deployment or the Cloudflare project.
- Final copy in the game’s voice: outside models default to generic fantasy prose.
