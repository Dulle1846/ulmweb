# Next AI work package — Kings & Cards

This is a handoff brief for another contributor or AI session. It is written to be usable without the full conversation history. It describes the current development work, not permission to merge or deploy.

## Repository and safety rules

- Repository: `Dulle1846/ulmweb`
- Current development branch: `kac-2.1-stability-performance`
- Production branch: `ulmweb-branch`
- Current work is tracked in Draft PR #6: https://github.com/Dulle1846/ulmweb/pull/6
- Game root: `game/`
- Player-facing game text: English. Conversation and explanations to the user: German.
- Do not merge PR #6 or deploy to production without explicit user approval.
- Cloudflare Pages is the intended production host. Do not use Vercel builds, previews or deployments.
- The Vercel GitHub App access was not removed because GitHub required a fresh sudo-mode confirmation. Do not attempt to bypass this. The user can re-authenticate and remove only the repository's Vercel app access.
- Keep saves browser-local. Do not invent a cloud account or cloud-save layer.
- World generation remains procedural and controlled by the seed and world-forge settings. Do not replace the player's existing card hand with world-generation cards.
- Make small, coherent commits. Run `cd game && npm test`, inspect GitHub Actions and browser-test affected interactions.
- Distinguish hand-authored content from generated combinations. Variant counts are not counts of individually authored cards or quests.

## Current implemented foundations on the development branch

- Parchment / illuminated-manuscript UI, four zoom bands, procedural terrain, exploration and world-forge controls.
- Hand-based cards: empty starting hand, delayed randomized draw, hand limit five, placement preview and validated placement.
- Card catalogue: 50 thematic groups × 10 categories = 500 categories; 10 scales × 10 rarities × 10 contexts = 500,000 possible on-demand variants. These are not 500,000 hand-authored cards.
- Event generator: 30 families × 10 places × 10 scene openings × 10 details × 5 text variants = 150,000 generated combinations. These are not individually authored quests.
- Eleven hand-authored three-stage chronicle arcs: migration, crime, ruins, diplomacy, plague, rebellion, guild, succession, shortage, flood and fire.
- Event choices can change resources, morale, long-term realm pressures, politics and future card rewards. Chronicles persist in local saves.
- Four-resource economy, workforce capacities, household food demand, taxes, wages, upkeep, unpaid obligations and production-chain accounting.
- Regional trade partners, inventory scarcity and price pressure.
- Housing capacity, households of up to four residents, annual population growth and annual ageing.
- Political state with legitimacy and commoners, nobility, guilds and clergy.
- Public-health slice: household-level illness transmission, recovery timers, temporary workforce loss, treatment/containment choices, morale effects and saved health state. Mortality, sanitation infrastructure, immunity and a full medicine economy are not implemented yet.
- A* fallback pathfinding with route caching, rendering and presentation-effect caps, entity caps and performance safeguards.
- Browser-local profiles and saves with migration/default handling.

## Current development slice: public health

The first public-health implementation lives in `game/js/systems/health.js`.

It is connected to:
- `simulation/simulation.js` for periodic updates.
- `systems/events.js` for illness/plague issue decisions.
- `systems/economy.js` so sick residents do not count as available workers.
- `app/main.js` for save/restore of illness and public-health state.
- `presentation/rendering/ui.js` for population health statistics.
- `systems/population.js` and `systems/cards.js` for household assignment consistency.

Tests are in `game/tests/health.test.js`. Check the latest GitHub Actions runs for the exact current branch head before assuming the work is verified.

Important limitations:
- Disease spread is household-scoped and interval-based, not a medical epidemiology model.
- Recovery is timer-based; there is no mortality yet.
- Care buildings currently use the existing temple building type as a coarse protective proxy.
- The illness model does not yet include sanitation, clean water, immunity, named physicians or medicine production.
- Health and event systems still use the existing global state conventions; avoid adding circular imports.

## Core next project: deepen the simulation

Read `game/docs/SIMULATION_DESIGN_AND_STORY_ENGINE.md` first. It defines the intended breadth, causal links, story lifecycle, card roles, performance cadence and implementation phases.

Recommended next slices:
1. Stable person IDs and versioned save migration.
2. Seeded random streams for world, simulation, cards and events.
3. Household needs and quality-of-life indicators.
4. Family links, life stages and a limited set of persistent named characters.
5. Relationship/faction interactions with bounded update cadence.
6. Soil, harvest variability, food storage and spoilage.
7. A small complete production chain (grain → flour → bread).
8. Condition-based issue hooks and a bounded story queue.
9. Roads, transport capacity and trade-route disruptions.
10. Sanitation, infirmaries, treatment and health-policy cards.

Do not attempt to implement all of these in one commit. Each vertical slice needs tests, save compatibility, UI feedback, performance checks and explicit acceptance criteria.

## Architecture and performance rules

- Keep the game a modular monolith; do not introduce services or a third-party plugin runtime prematurely.
- Domain/simulation modules must not import presentation modules or manipulate DOM/Canvas.
- Avoid circular imports. The composition root is the place to wire modules.
- Use stable IDs, validated DTOs and bounded state. Do not use array positions as long-lived identities.
- Do not perform all-pairs relationship checks every tick. Group by household, workplace, neighbourhood or region.
- Use explicit simulation intervals; avoid expensive scans every animation frame.
- Keep event logs, memories, active chronicles, pending effects and queues bounded.
- Profile before introducing Web Workers, spatial indexes or additional caching.
- Treat CI benchmark values as runner-specific measurements, not device FPS guarantees.

## Agent handoff protocol

If another AI or human contributor is used:
1. Give them this file and `SIMULATION_DESIGN_AND_STORY_ENGINE.md`.
2. Ask them to work only on a named feature slice and a separate branch or patch.
3. Require a file list, design assumptions, tests, known limitations and exact commit/patch.
4. Do not let an external agent merge, deploy or modify the production branch.
5. Review and run all changes on the current development branch before integration.

## Deliverable standard

Before editing, inspect the live branch and relevant files. Implement the smallest coherent slice, add unit and integration tests, run the full test suite, inspect the CI logs, and browser-test relevant interactions. Report exactly what is implemented, what is approximated, what remains open, and the exact tested commit. Never claim work or tests that have not happened.


## Phase 2.2 — deterministic identity foundation

Current incremental branch: `kac-2.2-seeded-simulation`; draft PR #7 targets the 2.1 development branch, not production.

Implemented in this slice:
- Named deterministic RNG streams and saved stream counters.
- Stable seed-scoped entity IDs and resident/king person IDs.
- Legacy save migration for missing IDs and random-stream counters.
- Tests for RNG replay, stream isolation, save restoration and entity identity.

The current CI must be checked on the exact latest PR head before treating the slice as verified. Do not merge or deploy. Cloudflare Pages remains production; do not use Vercel.


## Current implementation status (2026-11-05)

Branch: `kac-2.2-seeded-simulation`; draft PR #7 against `kac-2.1-stability-performance`.

Implemented and CI-verified on the previous code head:
- Named deterministic RNG streams with local save/restore.
- Stable entity IDs and person IDs.
- Persistent person profiles for villagers and the king: name, fantasy species, life stage, traits, needs, goal, memories and relationship collection.
- Legacy-save normalization for missing person data and RNG counters.
- Tests for RNG replay/isolation, ID allocation, person profile normalization and bounded memories.

Next tasks for an independent agent:
1. Connect `addPersonMemory` to consequential events with participant/observer relevance, avoiding a memory for every trivial tick.
2. Implement relationships with stable target person IDs, relationship type, strength, trust, history and bounded updates.
3. Implement households/families, kinship, birth/death and succession as data-driven systems; never infer family solely from same-household membership.
4. Add a character inspection panel with biography, needs, traits, memories and relationships; preserve the comic-medieval UI direction.
5. Add deterministic tests for save/load, multi-year aging, memory relevance, relationship decay and bounded storage.
6. Profile population scaling before increasing resident counts; maintain the hybrid detail model and explicit entity/memory caps.

Do not claim autonomous character behavior until goals are evaluated against world state and actors can select/execute actions. Do not merge or deploy this draft. Cloudflare Pages is the production host; do not use Vercel.

## Phase 2.3 — event-linked personal chronicle slice

Branch: `kac-2.3-living-chronicles`, based on merged development head `ff80b644e4c9c3bb207de41866bbf977ecccb347`. Production branch `ulmweb-branch` is not the target.

Implemented:
- Generated events select a bounded cast of affected resident(s), witness(es) and the king decision-maker using stable person IDs.
- Resolved event choices add distinct, event-scoped personal memories to participants.
- Residents' directed relationship toward the king changes modestly according to the public impact of the chosen response; a weaker reciprocal record is stored on the king.
- Multi-stage story threads carry the same participant IDs forward and completed threads retain their cast.
- Memory/relationship lists remain bounded and normalized on load; duplicate outcome replay is idempotent for memories and relationship changes.

New/expanded tests:
- People receive durable event memories and directed relationships.
- Participant selection uses existing stable person IDs and remains bounded.
- Resolving a generated issue writes memories to the named cast.

Limitations:
- No full autonomous decision-making, family graph, relationship decay, local incident-radius simulation, long-term memory summarization or character UI.
- This slice uses up to three actors per issue and bounded personal memory (24) / relationship (32) lists. It is not a simulation of every citizen's complete biography.
- UI browser coverage is still required if/when a character-inspection panel is introduced.

Agent follow-up:
1. Build a read-only character dossier panel from `getPersonSnapshot`, including biography, memories and relationships.
2. Add household/family identity as explicit stable data; do not infer kinship from shared housing.
3. Add life-year aging and species-specific maturation/lifespan with deterministic tests.
4. Add named-location provenance to events, then choose affected residents by household/workplace/region rather than a global resident pool.
5. Implement a bounded goal evaluator and autonomous action selection as a separate slice; the king remains autonomous by default but player-overridable.
6. Preserve the comic-medieval/tower-defence visual direction; do not re-theme the current UI in this backend slice.

Do not merge or deploy without review of exact-head CI and user authorization. Cloudflare Pages remains the production target; never configure Vercel.


## Phase 2.4 — species-aware annual aging

Branch: `kac-2.4-life-cycles`; stacked on the event-linked chronicle slice. The pull request is targeted at `kac-2.1-stability-performance` so the normal PR CI filters apply; it currently includes the 2.3 dependency until PR #8 is merged.

Implemented:
- Person profiles now store `lastAgedYear`, an explicit cursor preventing duplicate aging.
- The simulation advances age only when the 400-day realm calendar rolls into a new year.
- Species-specific maturation thresholds update young/adult/elder life stages.
- Crossing a life-stage boundary adds one bounded personal memory with a stable ID.
- Legacy profiles without an aging cursor begin aging at their restored current year; they do not receive an accidental catch-up of unknown elapsed years.
- Multi-year catch-up is capped at 1,000 years and memory remains bounded.

Not implemented: mortality, births, kinship, inheritance, succession, family-name transmission or autonomous life plans. These require the next explicit family/lineage and succession model. Do not derive parenthood from a shared household.
