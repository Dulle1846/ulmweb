# Next AI work package — Kings & Cards

This is a handoff brief for a separate AI session or contributor. It is intentionally written so work can be resumed without assuming that the next model has the full chat history.

## Repository rules

- Repository: `Dulle1846/ulmweb`
- Working branch: `ulmweb-branch`
- Current reviewed base: `496e7a0ed484d3527b6aaec6954a19fa7fad9cda` (verify the live branch head before editing).
- Game root: `game/`
- UI language and all player-facing game text: English.
- Conversation and explanations to the user: German.
- Keep saves browser-local. The user explicitly accepted that; do not add a fake cloud-save/account layer.
- Do not replace the existing card hand with map-generation cards. World generation remains procedural and is controlled by seed + four world-forge sliders.
- Do not claim that 400,000 cards or 25,920 events are individually hand-authored. Those are generated combination spaces.
- Preserve existing systems and save compatibility. Work in small commits, run `cd game && npm test`, inspect GitHub Actions, and browser-test UI/save/event changes.

## Current implemented baseline

- Parchment / illuminated-manuscript UI with oxblood, vellum, timber and brass palette.
- 36 reusable SVG symbols in `game/assets/realm-sprites.svg`.
- Four world-forge sliders (landmass, ruggedness, forests, water).
- Seeded procedural terrain, exploration and zoom bands.
- Hand starts empty; delayed randomized draws up to five; play/discard schedules replacement.
- 400 card categories, on-demand scale/rarity/context variants (400,000 theoretical combinations). There are 23 curated initial prototypes and generic archetypes for most categories.
- 24 event families, 25,920 generated narrative combinations, two choices each, resource/morale consequences and hidden tension/prosperity/mystery pressures.
- Four-resource economy and four regional market partners.
- Local profiles/saves; hand, deck, draw timer, forge settings, hidden issue state and world seed are serialized.
- Performance safeguards: render cache, terrain LOD, fog-image cache, building occupancy index, combat spatial buckets, workplace grouping, entity/particle caps and frame fail-stop.
- Latest verification at base commit: 53 tests pass; syntax/import/DOM/asset validator passes; live browser integration confirmed hand timing, save/load, discard/replacement and issue resolution.

## Best next substantive project: deep society simulation

Implement this as a modular simulation system, not one huge rewrite. Recommended first phase:

1. **Persistent character identity:** stable IDs, name, age/life stage, occupation, household membership and a small set of bounded traits (e.g. diligence, sociability, courage, piety, ambition). Do not store only array positions as identity.
2. **Relationships:** family, friendship, rivalry and mentorship links with bounded values and update cadence. Avoid O(n²) all-pairs updates; use household/neighbourhood candidates and infrequent social ticks.
3. **Needs and motives:** food, shelter, safety, belonging and ambition. Let needs influence routine choice and movement targets.
4. **Households and succession:** connect people to homes, partners and children; model births, ageing, migration and death with conservative probabilities and save/load support.
5. **Factions and local power:** guild, faith, noble household, military and commoners as possible affiliations. Track influence and grievances in compact faction state, not an unbounded per-frame simulation.
6. **Emergent narrative hooks:** event family weights and event text should draw from actual character IDs, households, factions, prior choices and locations. A character can recur in later issues; resolved events should leave persistent consequences.
7. **Deterministic debugging:** introduce explicit seeded RNG streams (world, simulation, events, cards) and serialize their state. Do not try to make unrelated changes reshuffle all existing random outcomes.

## Separate content task: authored cards and issues

- Expand the 23 curated card prototypes into a larger hand-authored set with category-specific effects, balanced costs, clear descriptions and appropriate SVG symbols.
- Give categories real gameplay roles; avoid mapping every industry group to the same farm or every monster to a deer.
- Add unique issue families, chains and callbacks. Keep generated text grammatically coherent and avoid pretending a combinatorial sentence generator is a bespoke quest library.
- Test each new effect and every choice branch, including unaffordable paths and entity-cap cases.

## Separate presentation task: richer art

- Add distinct, readable vector card illustrations and ornamental frames by category group, keeping consistent line weight and medieval manuscript style.
- Keep the actual card name, category, rarity and cost readable at common desktop and mobile widths.
- Test external SVG symbol references in the live browser and retain fallbacks.

## Performance acceptance criteria

- Profile real browser frame time at 50, 200 and near-cap mobile/entity populations.
- Include a global-zoom test, since fog and terrain draw costs are easy to overlook there.
- Keep movement/combat complexity bounded; do not add per-frame scans of every character for every other character.
- Preserve caps and cache invalidation on entity placement/removal, world regeneration and save/load.
- Verify no repeated animation-frame loop remains after a runtime fault.
- Report measured results and test hardware; do not promise universal FPS.

## Deliverable standard

Before proposing a feature, inspect the current branch and files. Then implement the smallest cohesive slice, write tests, run all checks, inspect the CI logs, and browser-test the relevant interaction. Commit on `ulmweb-branch` only after verification. Keep a short changelog of what was actually completed, what is simulated/approximated, and what still needs art, content or manual interaction testing.
