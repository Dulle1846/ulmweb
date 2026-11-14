# Royal Expeditions and the Living Frontier

**Status:** implemented on `3.15.0-dev`, verified on the full test suite and a real browser campaign.
**System owner:** `js/systems/expeditions.js`
**Tick entry point:** `updateExpeditions()` in the normal simulation tick

## Why this layer exists

The realm already had fog of war, ruins events, named residents, skills, health,
memories, legacy, prestige and a chronicle. It had no persistent way for a
player to send a named person into the wild places those systems described.
Royal Expeditions connects those existing paths instead of adding a parallel
map, currency or progression track.

## Eight landmarks per world

Each realm seeds exactly eight landmarks from the world seed and the keep
position:

| Landmark | Danger | Principal cache |
| --- | --- | --- |
| Sunken Ruins | 2 | gold, stone |
| Whispering Cave | 3 | stone, gold |
| Forgotten Shrine | 1 | gold, food |
| Broken Watchtower | 2 | wood, stone |
| Starfall Crater | 3 | gold, stone |
| Old Grove | 1 | food, wood |
| Pale Barrow | 2 | gold, food |
| Lost Caravanserai | 1 | gold, food |

Generation uses a local FNV-style hash and a private linear-congruential
stream. It rejects water, the home marches and building footprints, and keeps
sites apart. No expedition path calls `Math.random`. The same seed produces the
same sites, names, regions and distances; the focused test regenerates the
whole world and compares them.

A landmark is `known` when its tile has already been explored or when a party
reaches it. Arrival calls the existing `revealArea(x, y, 6)`, so the map gains a
real surveyed clearing rather than an abstract counter.

## Leaders and supplies

A leader must be a living, named, non-sovereign adult villager. The leader's
existing skills determine the result:

- command 40 %
- learning 32 %
- care 16 %
- trade 12 %

The three supply levels are real costs paid from the existing food and gold
stores on departure:

| Supply | Food | Gold | Modifier | Loot scale |
| --- | --- | --- | --- | --- |
| Light pack | 12 | 5 | -8 | 0.78 |
| Royal pack | 24 | 12 | 0 | 1.00 |
| Grand equipage | 42 | 24 | +12 | 1.28 |

Distance adds `ceil(distance * 0.35)` food. A leader can only be away once, and
only one royal party can travel at a time. The chosen leader receives an
`expeditionId`, a departure memory and a real event-log entry.

## Travel, arrival and return

Travel is measured in simulation days. Outbound travel is
`6 + ceil(distance / 2.4)` days; the return is the same length.

1. **Outbound** — supplies are already paid, the map is still unchanged.
2. **Arrival** — a deterministic outcome is rolled, the site is revealed, the
   leader gains a memory, and the report is held until the party is home.
3. **Returning** — the panel shows the held outcome but no loot is credited.
4. **Return** — resources are credited, injury and morale are applied, legacy
   and the chronicle are updated, and the leader can work again.

Outcome tiers are `triumph`, `success`, `costly` and `disaster`. The score uses
the leader skill, supply modifier, site danger, an existing-cleared penalty and
a local stream seeded by the expedition, site, leader, departure tick and world
seed. Loot is credited only on the return tick. Costly and disaster results
wound the leader through the existing `illnessUntilTick` field; disaster also
removes two morale. The party does not invent a parallel health or morale
system.

A first success or triumph records one lore fragment, one legacy entry and a
person memory. A cleared site can be surveyed again for 55 % of the normal
cache, but its principal lore is recorded only once. The system caps itself at
8 sites, 24 history reports, 40 lore fragments and 24 offered leaders.

## Persistence

`state.expeditions` contains only plain data:

```
version, seed, sites[], active, history[], lore[],
completed, discoveries, nextId, lastUpdateTick
```

`createSaveSnapshot()` writes a normalized copy. `restoreSaveSnapshot()`
normalizes the saved block and `validateSaveSnapshot()` rejects malformed site
lists, history, lore and active records. Undefined blocks from older saves are
accepted and become an empty survey. The field lives inside the existing
schema 11, so there is no new save version and old saves remain valid.

The active record carries `departTick`, `arriveTick`, `returnTick`, `phase`,
`supplyId`, the site and leader ids, and the held outcome. A save made while a
party is travelling restores the same party; the leader link is reattached by
`ensureExpeditions()`.

## UI integration

- New `EXPLORE` command-deck tab and `explore` renderer.
- `js/presentation/expeditions-panel.js` exposes the survey summary, active
  party, leader and supply selects, eight landmark cards, returned reports and
  recovered lore.
- `data-command="expedition-start"` is handled by the existing management
  action dispatcher; no parallel event system.
- The panel refreshes on the normal `kac:expedition-change` event when a party
  arrives or returns, while the player may have the tab open.
- CSS lives in `css/diplomacy.css` beside the other strategic panels and uses
  the same parchment, danger, disabled and responsive patterns.

## Verification

- Focused domain/save/UI contract tests: **7/7**.
- Full `npm test`: **922/922**, syntax and relative imports for 141 source
  files, 203 referenced UI IDs.
- 25-year deterministic campaign: **10,040 ticks**, **13/13 ambitions**,
  `noStalls:true`, no game over, **0.861 ms/tick**.
- Real-browser audit (`tests/browser/expeditions-ui.mjs`, seed `20261114`):
  founded a realm, opened EXPLORE, counted 8 landmarks, picked a named leader
  and grand equipage, launched a party, verified the leader link and disabled
  launch buttons, advanced to arrival/return, verified history, lore, the
  completed counter and the save snapshot, and captured four reference frames
  in [docs/expeditions-reference/](expeditions-reference/).
- No page or console errors in the audit.

## Deliberate boundaries

- One active party and eight sites keep full-world pathfinding and save size
  out of the feature.
- Expeditions do not add a new render pass. They reveal the existing fog and
  use the existing map and chronicle.
- No follower simulation, tactical expedition combat, trade caravan inventory
  or procedurally generated landmark interiors are part of this slice.
- The first visit is the only one that can add principal lore; repeat surveys
  are a smaller resource route, not an infinite lore farm.
