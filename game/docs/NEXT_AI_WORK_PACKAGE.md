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
- Eight hand-authored three-stage chronicle arcs: migration, crime, ruins, diplomacy, plague, rebellion, guild and succession.
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
