# Kings & Cards 2.0 — Foundation milestone

This milestone moves the game from a single-screen prototype toward a persistent, hand-driven realm simulator.

## Included in this milestone

- A start screen with a player display name and randomizable numeric world seed.
- Browser-local player profiles and versioned local save slots, tied to the active profile.
- Save/load actions and Ctrl+S / Ctrl+O shortcuts.
- One original procedural instrumental soundtrack, scheduled as a repeating loop, with a music toggle and volume setting.
- Keyboard controls: Space to pause, 1–4 for zoom levels, +/- for zoom, WASD/arrows to pan, M to toggle music, Escape to close a modal.
- A five-card hand dock, selectable and draggable onto the world.
- A data-driven catalog with 100 categories and 100,000 theoretical combinations across scale, rarity and context. Variants are generated on demand; they are not preallocated.
- Initial prototypes for buildings, a supply barrel, people, units, an animal, and immediate effect cards.
- Gold mine production, four-resource management, and a regional market with four fictional partners, limited stocks, treasury, seasonal price movement and price history.
- Choice-based realm issues, a persistent event log and a Statistics tab.
- Research is removed from the active gameplay UI and economy.
- First performance pass: entity frustum filtering, 30 Hz capped movement updates, 4 Hz minimap refresh and throttled DOM refreshes.

## Important boundaries

- Profiles and saves are browser-local. They are not secure accounts, cannot authenticate an administrator, and do not sync across devices. Real accounts and cloud saves require a server-side auth/database service and must be added before any public multiplayer or security-sensitive use.
- The catalog defines a large potential space, not hundreds of fully authored, uniquely balanced cards. New categories, prototypes, effects and balance data still need content design and validation.
- The market is an initial playable barter economy for wood, stone, food and gold. It is not yet a full inter-realm simulation or a production-chain model.
- The procedural soundtrack is generated through Web Audio and starts after a user gesture because browsers restrict unsolicited audio playback.
- Large-scale AI/pathfinding and long-duration balance testing remain future work. The current movement pass reduces known bottlenecks but is not a guarantee of constant frame rate on every device.

## Save format

Saves are versioned JSON envelopes stored in localStorage under a profile-specific key. The snapshot stores scalar simulation state, entity DTOs, entity-to-workplace references by array index, the card hand and remaining card IDs, the event log, market state, and exploration map. Rendering contexts, canvases, event listeners and live object references are reconstructed on load.
