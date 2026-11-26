# World map, trade routes and frontiers

**Status:** implemented in 3.50.0 (roadmap 4.0.2); provinces added in 3.68.0
(roadmap 4.0.1)
**System:** `js/systems/world-map.js`
**Province catalog:** `js/world/world-regions.js`
**Panel:** `js/presentation/world-map-panel.js` (WORLD tab in Realm Management)
**Save schema:** 15 (`worldMap` internally version 2)

## What the player gets

A WORLD tab sits beside DIPLOMACY in the normal management deck. It opens a
schematic compass map of the four neighbouring regions (Northern Marches,
Eastern Highlands, Southern Coast, Western Frontier), the real settlement seats
the realm already owns, and every standing caravan between them. Since 3.68.0
the same map also carries **ten provinces held by five crowns** (the player's
crown and the four diplomatic realms), with ownership, control, loyalty,
garrison and a yearly resource yield. See [WORLD_KINGDOMS.md](WORLD_KINGDOMS.md).

Each region card reads the existing diplomatic realm: treaty, relation, trust,
specialty and ruler. It also shows a frontier pressure band, the number of
settlement seats within reach, the current watch and the recorded incidents.
From the card the player can:

- open a standing trade route from a named settlement depot to that region,
  choosing goods (wood, stone or food) and flow (import or export);
- raise or lower a three-step frontier watch at 12 gold per step;
- close a standing route;
- press a claim on a border province for 24 gold and 8 food once a year, when
  the border is not protected by an alliance or trade pact and relation is
  below 55 or the owner is at war.

## How it touches the existing simulation

The layer deliberately has no second map, market or diplomacy record.

- **Seats** are `getSettlementSeats()` from `settlement-owners.js`. Timber and
  stone imports unload into that seat's own stores, which are the same stores
  its annual road-repair obligation spends. Food uses the royal granary.
- **Prices, partner stock and partner treasury** are the live records from
  `market.js`. An import pays the partner and removes its stock; an export adds
  to its stock and draws its treasury.
- **Diplomacy** is the existing realm record. Every caravan calls
  `recordTradeInfluence` (relation, trust, fear, trade volume, realm history),
  so the DIPLOMACY panel and the market's treaty terms read the same movement.
- **War** closes the route without moving goods. Peace reopens it on the next
  annual survey.
- **Provinces** are saved rows in the same `worldMap` block. Their owners are
  the existing crown id or a real diplomatic realm id; they never create a
  second kingdom record. Crown-held provinces pay their yearly food, wood,
  stone or gold yield through `addResource`.
- **Frontiers** read treaty (+42 at war, +18 neutral, +7 trade, +1 alliance),
  relation, trust, nearby seats, watch, active caravans, the standing army's
  existing dread reading, the existing crown border levy and the new province
  pressure. Pressure is recomputed and saved once a year.
- **Raids** are deterministic (a hash of region and year, never the shared
  random streams). Above 58 pressure a raid may cross; above 75 it is certain.
  A raid takes at most one wood, one stone and one gold from the nearest seat,
  or two food from the crown when no seat is in reach, lowers relation/trust,
  raises fear, writes the year into `realm.lastIncidentYear` (which the existing
  diplomacy border levy already reads) and spends 12 pressure for the next year.

## Cadence and determinism

`updateWorldMap()` is one annual task in `simulation.js`, after diplomacy, the
settlement grant and the road survey. It is a single bounded pass over ten
provinces, four regions, at most six routes and the existing seat list. It
performs no per-tick or per-frame work, adds no random-stream draws and no
second ecological pass. Province ownership changes use a local hash of province
id and year and are tried at most once per province per year. Calling the task
twice in the same year is a no-op.

Control, loyalty, contested state and ownership move through one bounded annual
pass; crown yields are paid in that same pass. The province claim action is a
player command, not a tick task, and is locked to one press per year.

## Save compatibility

Schema 15 adds the `worldMap` block: routes, four frontier entries (pressure,
watch, relief, incidents, last incident year, updated year), ten province rows
(owner, control, loyalty, garrison, contested owner, last change year, change
count), the yearly claim lock, a bounded 24-entry history and totals. Schema-14
and older saves migrate to `worldMap: null`, which normalizes to a quiet map on
load; the existing realm, diplomacy and settlements are untouched. A version-1
world map without provinces is normalized to the default ten-province map
without losing routes, frontiers, history or totals. Routes, watch levels,
province ownership and the claim lock survive an exact save/load round-trip.

## Verification

- `tests/systems/world-map.test.js` covers route validation, import/export
  movement through partner stock and seat stores, war closure, watch cost and
  pressure effect, a certain raid and its real consequences, malformed data,
  schema-14 migration and normalized round-trips. It also covers the ten
  provinces, the five crowns, v1-to-v2 migration, claim cost and ownership,
  the yearly claim lock, alliance/trade guards and the annual crown yield.
- `tests/core/data-packs.test.js` proves that a pack can rename a known
  province only through the validated label consumer and that pack scenarios
  are namespaced into the existing picker.
- `tests/browser/world-map.mjs` founds a real realm, opens WORLD through the
  normal deck, charters a route with the real controls, raises a watch, runs the
  annual survey, checks the moved goods in the live market and seat stores, saves
  and reloads, and repeats the panel at 390 × 844 with no horizontal overflow and
  no page or console errors.
- The deterministic 25-year campaign remains green and keeps its bounded tick
  cost: 10,040 ticks at 1.365 ms/tick, no stalled sites, 3,507 forest tiles and
  0 untyped tiles. The generated audit is 1,648/1,648 with no open points.
