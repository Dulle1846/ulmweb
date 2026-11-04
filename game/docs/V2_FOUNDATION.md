# Kings & Cards — Current playable foundation

**Current verified commit:** `f7a85b10d7e3bef81eb3fefcf4f4931af30bf14a`  
**Development branch:** `ulmweb-branch`  
**Public build:** https://kings-and-cards.pages.dev/

This document describes the current implementation, not a promise that every future simulation system is complete.

## Player-facing systems

- A medieval-fantasy parchment interface with timber, oxblood, brass and vellum styling, plus a reusable SVG sprite sheet containing 36 symbols.
- A start screen with player display name, numeric world seed and four world-forge sliders: landmass, ruggedness, forests and water level.
- A procedural landscape. The same seed and same slider settings produce the same terrain; the sliders alter the height and moisture fields before the terrain is prerendered.
- A card hand that starts empty. The first card arrives after a random delay of 28–72 simulation ticks. Further cards arrive at randomized intervals while the hand has fewer than five cards. Playing or discarding a card schedules a delayed replacement. Discarding is free.
- Four visual zoom bands, keyboard and pointer input, and pointer-based drag/drop placement. Placement validation checks terrain, world bounds, occupied building footprints and affordability.
- Browser-local profiles, versioned localStorage save slots, save/load controls and Ctrl+S / Ctrl+O.
- One original procedural instrumental loop generated through Web Audio, with a music toggle and volume control.

## Cards

The playable catalogue currently contains **400 distinct category IDs** across settlement, agriculture, industry, civic life, defence, military, nature, animals, people, trade, faith, medicine, crafts, culture, magic and other groups.

Each category has a prototype/archetype. The variant generator combines ten scales, ten rarity levels and ten contexts, giving a theoretical space of **400,000 combinations**. Variants are generated on demand; the game does not allocate 400,000 card objects and the catalogue is not 400,000 hand-written unique designs. There are 23 more curated initial prototypes; most categories currently use reusable group archetypes. Richer bespoke card rules, illustrations and balancing remain content work.

The hand holds at most five cards. Cards cover buildings, people, units, animals and immediate effects. The card-deck and draw timer are included in local saves.

## Realm issues and emergent outcomes

There are 24 event families. Five titles per family combine with six places, six situation openings and six details, producing **25,920 combinatorial narrative variants**. This is a procedural narrative generator, not 25,920 individually authored Crusader-Kings-style quest scripts.

Each issue offers two choices. Outcomes can change resources, morale and three hidden realm pressures: tension, prosperity and mystery. Those pressures affect later event-family weighting. A bounded memory of recent decisions is kept, and the event log is limited to 100 entries. Events are scheduled through simulation ticks rather than real-world timers.

## Economy and settlement

- Core resources: wood, stone, gold and food.
- Production from farms, lumber buildings, quarries and gold mines; civic buildings affect gold and morale.
- Four fictional regional trade partners, finite stock and treasury, seasonal price changes and a price-history view.
- Autonomous villagers with basic workplace assignment, daily routine phases, movement and threat avoidance.
- Combat uses spatial buckets for local targeting.

This is an initial playable barter economy, not yet a complete economy with wages, taxes, supply chains, transport, inter-realm trade or full demographic modelling.

## Stability and performance safeguards

The latest pass addresses specific hot paths and runaway growth:

- The renderer filters and sorts visible entities on a short-lived cache rather than rebuilding the list every frame.
- Terrain decorations use distance/zoom levels of detail.
- Fog of war is rendered from a cached 160×160 offscreen image. The image is rebuilt only when exploration changes; it is drawn as one canvas operation per frame instead of thousands of individual rectangles.
- Villager movement uses a prebuilt building-footprint occupancy index, so collision checks are constant-time lookups rather than scanning every building for each movement test.
- Villager workplace lists are assembled in one pass over entities.
- Combat target lookup uses spatial buckets.
- World entity count is capped at 900, with at most 420 mobile entities. Particles and floaters are also bounded (350 and 100).
- Movement updates are capped at 30 Hz and limited to three catch-up movement steps per frame. The minimap updates every 400 ms and UI refresh is throttled to 160 ms.
- A runtime rendering/simulation exception pauses the realm and stops scheduling further frames, instead of repeatedly invoking a broken frame.

These are safeguards, not a measured FPS guarantee on every device. Broad hardware profiling and long-duration stress testing remain necessary.

## Persistence boundary

Profiles and saves are browser-local in localStorage. The user confirmed this is acceptable for the current stage. These are not secure server accounts, do not authenticate an administrator, and do not sync between devices. A server-side account/cloud-save feature is deliberately not represented as implemented.

The save snapshot includes the world seed and forge settings, simulation clock, entities and workplace references, hand/deck and next draw tick, active issue and scheduling state, hidden realm pressures and memories, event log, market, camera and exploration. Canvas contexts and other transient rendering caches are reconstructed.

## Verification completed

On the current commit:

- GitHub Actions: **54 tests passed, 0 failed**.
- Syntax/import/HTML validation: 34 JavaScript source files, 77 referenced UI IDs and local HTML assets passed.
- Browser smoke test: parchment start screen, all four sliders, empty starting hand, first delayed card and its sprite were verified.
- Browser integration test: changed world-forge values survived save/reload; saved hand state survived; discarding spent no gold and resulted in a replacement card; a random realm issue appeared, accepted a choice and recorded the resolution.

The browser automation did not simulate a continuous physical mouse press-and-drag sequence. The pointer-based drag handlers are present, but the final interaction still deserves a manual mouse test.

## Important work still outstanding

The simulation is not yet the fully deep, mysterious society simulator described in the design direction. In particular, it still needs richer individually authored card effects, longer event chains and historical callbacks, persistent character identities and traits, households and relationships, factions and politics, deeper pathfinding, production/logistics chains, and long-run balance tests. The current hidden realm pressures are a foundation for those systems, not a substitute for them.
