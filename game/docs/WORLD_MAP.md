# World map, trade routes and frontiers

**Status:** implemented in 3.50.0 (roadmap 4.0.2)
**System:** `js/systems/world-map.js`
**Panel:** `js/presentation/world-map-panel.js` (WORLD tab in Realm Management)
**Save schema:** 15

## What the player gets

A WORLD tab sits beside DIPLOMACY in the normal management deck. It opens a
schematic compass map of the four neighbouring regions (Northern Marches,
Eastern Highlands, Southern Coast, Western Frontier), the real settlement seats
the realm already owns, and every standing caravan between them.

Each region card reads the existing diplomatic realm: treaty, relation, trust,
specialty and ruler. It also shows a frontier pressure band, the number of
settlement seats within reach, the current watch and the recorded incidents.
From the card the player can:

- open a standing trade route from a named settlement depot to that region,
  choosing goods (wood, stone or food) and flow (import or export);
- raise or lower a three-step frontier watch at 12 gold per step;
- close a standing route.

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
- **Frontiers** read treaty (+42 at war, +18 neutral, +7 trade, +1 alliance),
  relation, trust, nearby seats, watch, active caravans, the standing army's
  existing dread reading and the existing crown border levy. Pressure is
  recomputed and saved once a year.
- **Raids** are deterministic (a hash of region and year, never the shared
  random streams). Above 58 pressure a raid may cross; above 75 it is certain.
  A raid takes at most one wood, one stone and one gold from the nearest seat,
  or two food from the crown when no seat is in reach, lowers relation/trust,
  raises fear, writes the year into `realm.lastIncidentYear` (which the existing
  diplomacy border levy already reads) and spends 12 pressure for the next year.

## Cadence and determinism

`updateWorldMap()` is one annual task in `simulation.js`, after diplomacy, the
settlement grant and the road survey. It is a single bounded pass over four
regions, at most six routes and the existing seat list. It performs no per-tick
or per-frame work, adds no random-stream draws and no second ecological pass.
Calling it twice in the same year is a no-op.

## Save compatibility

Schema 15 adds the `worldMap` block: routes, four frontier entries (pressure,
watch, relief, incidents, last incident year, updated year), a bounded 24-entry
history and totals. Schema-14 and older saves migrate to `worldMap: null`, which
normalizes to a quiet map on load; the existing realm, diplomacy and settlements
are untouched. Routes and watch levels survive an exact save/load round-trip.

## Verification

- `tests/systems/world-map.test.js` covers route validation, import/export
  movement through partner stock and seat stores, war closure, watch cost and
  pressure effect, a certain raid and its real consequences, malformed data,
  schema-14 migration and normalized round-trips.
- `tests/browser/world-map.mjs` founds a real realm, opens WORLD through the
  normal deck, charters a route with the real controls, raises a watch, runs the
  annual survey, checks the moved goods in the live market and seat stores, saves
  and reloads, and repeats the panel at 390 × 844 with no horizontal overflow and
  no page or console errors.
- The deterministic 25-year campaign remains green and keeps its bounded tick
  cost; the audit moves from 1615/1618 to 1616/1618.
