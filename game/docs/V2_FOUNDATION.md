# Kings & Cards 2.0 — Foundation milestone

This milestone moves the game from a single-screen prototype toward a persistent, hand-driven realm simulator.

## Included in this milestone

- A start screen with a player display name and randomizable numeric world seed.
- Browser-local player profiles and versioned local save slots, tied to the active profile.
- Save/load actions and Ctrl+S / Ctrl+O shortcuts.
- One original procedural instrumental soundtrack, scheduled as a repeating loop, with a music toggle and volume setting.
- Keyboard controls: Space to pause, 1–4 for zoom levels, +/- for zoom, WASD/arrows to pan, M to toggle music, Escape to close a modal.
- A hand dock that begins empty and deals cards at random intervals until the five-card hand is full. Played or discarded cards leave a delayed opening for the next deal.
- A data-driven catalog with 400 categories and 400,000 theoretical combinations across scale, rarity and context. Variants are generated on demand; they are not preallocated or all individually hand-authored.
- A four-slider world forge (landmass, ruggedness, forest density and water level) that combines with the seed to shape the procedural landscape.
- Initial prototypes for buildings, a supply barrel, people, units, an animal, and immediate effect cards.
- Gold mine production, four-resource management, and a regional market with four fictional partners, limited stocks, treasury, seasonal price movement and price history.
- Twenty-four issue families compose more than 25,000 narrative combinations from event titles, situations, places and details. Choices alter resources, morale and hidden realm pressures that influence later events.
- A medieval parchment / illuminated-manuscript presentation layer and reusable vector sprite sheet for hand-card iconography.
- Performance safeguards: visible-entity caching, distance-based terrain decoration LOD, spatially indexed combat targeting, cached villager workplaces, capped entity/particle populations, and a guarded frame loop.
- Research is removed from the active gameplay UI and economy.

## Important boundaries

- Profiles and saves are browser-local. They are not secure accounts, cannot authenticate an administrator, and do not sync across devices. Real accounts and cloud saves require a server-side auth/database service and must be added before any public multiplayer or security-sensitive use.
- The card taxonomy and event library are combinatorial generators, not hundreds of bespoke quest scripts or 400,000 individually hand-authored card records. Generic category archetypes still require richer bespoke effects and balancing.
- The market is an initial playable barter economy for wood, stone, food and gold. It is not yet a full inter-realm simulation or a production-chain model.
- The procedural soundtrack is generated through Web Audio and starts after a user gesture because browsers restrict unsolicited audio playback.
- The simulation remains an early foundation: full pathfinding, faction politics, social relationships, production logistics, deep autonomous character memory and long-duration balance tests are not complete. The performance safeguards address identified hot paths and runaway growth, but device-wide frame-rate guarantees still require broader profiling.

## Save format

Saves are versioned JSON envelopes stored in localStorage under a profile-specific key. The snapshot stores scalar simulation state, entity DTOs, entity-to-workplace references by array index, the card hand and remaining card IDs, the event log, market state, and exploration map. Rendering contexts, canvases, event listeners and live object references are reconstructed on load.
