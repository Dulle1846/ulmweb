# Settlement logistics and the central goods book

This document describes the physical goods chain of the city builder: who owns
stock, how a movement is booked, how a store is chosen and what a carrier is.

## 1. Two kinds of stock

| Scope | Examples | Stored in | Consumed by |
| --- | --- | --- | --- |
| `good` | logs, planks, stone blocks, cut stone, grain, flour, bread, water, firewood | `entity.warehouse.stored`, `entity.inventory.input/output`, `carrier.cargo` | recipes, household heating, tavern and bread conversion |
| `resource` | royal food | `state.resources.food` | population food, tavern provisions, dragons, dynasty, events |

Bread is physical until a carrier delivers it to a store; the delivery converts
it into royal food. That conversion is booked as `consumed` bread plus
`produced` food, so both books stay balanced.

`GOOD_KEYS` is the authoritative list of physical goods (`city-config.js`). The
royal food is deliberately not a warehouse good and can never be reserved for a
haul.

## 2. The book: ledger plus audit

`js/systems/goods-book.js` owns both structures inside
`state.city.logistics`:

- `ledger` is a bounded ring buffer of **every booked movement**
  (`GOODS_LEDGER_LIMIT = 600`). Entries carry `id`, `tick`, `type`, `good`,
  `scope`, `quantity`, `from`, `to`, `cause`, `jobId`, `houseId`, `key` and
  `status`.
- `audit` keeps cumulative `opening`, `produced` and `consumed` totals per good.
  It is never trimmed, so the physical stock can be reconciled even after the
  ledger ring buffer has rotated.

The invariant is:

```
physical stock (stores + local inventories + carrier cargo)
  = opening + produced - consumed
```

`getGoodsAudit()` (logistics) computes this for every good and exposes
`balanced` per row. Resource amounts are rounded to 0.01, physical goods are
integers.

Types that create stock: `produced`, `deposited`.
Types that destroy stock: `consumed`, `withdrawn`, `lost`.
Internal transfers (`reserved`, `picked`, `delivered`, `evacuated`) never change
the total.

`opening` is the stock that existed when the books were opened — normally a
legacy save without an audit. It is set once during restore. A new realm starts
at zero and books its seeded keep stock as `produced` (`realm-seed`).

### Idempotency

Every consumption call may pass a `key`. If the ledger already contains that
key, the call returns the original quantity and moves no stock. Household
heating uses `heat:<house>:<year>:<season>:<tick>`, population food uses
`food:population:<tick>`, tavern food uses `food:tavern:<building>:<tick>`.
This makes repeated settlement passes harmless.

## 3. Stores, reachability and routing

A warehouse is a `TYPE.WAREHOUSE` or the royal keep. Each has one profile
(`general`, `timber`, `stone`, `food`, `water`), a capacity, a filter list and
four stock maps: `stored`, `reservedIn`, `reservedOut` plus the local building
inventory.

- `getWarehouseSpace()` = capacity − stored − reservedIn.
- `reservedIn`/`reservedOut` are **claims**, never extra goods.
- An overfull legacy store keeps every good: its capacity is raised during
  migration instead of deleting stock.

Warehouse selection no longer uses straight-line distance alone:

1. `pickWarehouse()` filters by good, free space or available stock.
2. Candidates are ranked by euclidean distance only as a preference.
3. `hasOverlandRoute()` verifies an actual `findPath` route (cached per
   building-collision/road revision). The first **reachable** candidate wins.
4. If the current destination becomes unreachable, `spawnCarrier()` retargets
   to a reachable store instead of blocking a carrier on a dead route.
5. If no candidate is reachable, no job is created. The reason is stored in
   `lastRejection` and counted in `stats.queueRejected` so the UI can show it.

`depositGood`/`withdrawGood` remain debug/manual entry points. They book
`deposited`/`withdrawn`, which the audit treats as stock creation/removal.

## 4. Local household supply

Water and heating are local services:

- A well is supplied by its own `output.water` or by water in a store inside the
  water service radius (8 tiles). A cistern on the other side of the map no
  longer makes a dry well count as supplied.
- Firewood heating consumes two units per occupied house from a reachable store
  within `HOUSEHOLD_SUPPLY_RADIUS = 12`. Each unit is booked as `consumed`
  (`household-heating`) with the house id.
- Empty houses consume nothing.
- The summary reports the average household warmth, not a realm-wide scalar.

Population food is booked as `consumed` with resource scope. Tavern provisions
and the other royal-food sinks do the same, and the food sources (cards,
bread deliveries) are booked as `produced`. Direct `state.resources.food`
mutations are therefore limited to the small number of explicitly booked sinks.

## 5. Jobs

`makeJob()` creates a job only if fewer than `MAX_LOGISTICS_JOBS = 72` jobs are
active. A rejected order sets `lastRejection` (`reason`, `kind`, `good`, `tick`)
and increments `stats.queueRejected` — the queue no longer fails silently.

Job lifecycle: `pending` → `assigned` → `done`, with `blocked` for retryable
failures and `cancelled` for permanent ones. Source and destination
reservations are released on cancel; picked cargo is returned to a store instead
of being deleted. Reservations are rebuilt from the surviving jobs after load.

## 6. Carriers are abstract transport slots

A carrier is **not** a villager. It is a record with `id`, `jobId`, position,
path, speed and cargo (`logistics.js`, `spawnCarrier`). It has no household, no
wage, no hunger and no workplace. `MAX_CARRIERS = 6` bounds the fleet.

Consequences, deliberately accepted and documented rather than hidden:

- A carrier cannot die, eat, strike or be recruited; only the job can expire.
- Losing a carrier record is recovered by `recoverVirtualCargo()`, which
  returns the picked cargo to a store.
- Employment, wages and population do not interact with transport capacity.

Turning carriers into real workers would require a new workforce category, path
and schedule integration plus save migration. It is out of scope for this
module, and the abstraction is now explicit here.

## 7. UI

The building register shows every store with profile, capacity, all stored
goods and both reservations. The transport section shows:

- all active jobs and the retained completed jobs with id, endpoints, amounts,
  carrier, attempts and reason,
- the last rejection and the queue limit,
- the goods audit per good (opening, produced, consumed, expected, physical,
  difference),
- the newest 40 ledger entries with scope, cause, job and idempotency key, plus
  the current ledger size and limit.

The ledger and the job list are intentionally bounded; the audit totals are the
unbounded record.

## 8. Save format and migration

- `city.logistics.version` is `3`.
- `serializeCity()` writes the ledger (up to 600 entries), the audit, the last
  rejection, all jobs (up to 72) and all carriers (up to 6).
- `validateCitySnapshot()` validates ledger scope/quantities and audit buckets.
- `restoreCity()` rebuilds reservations, raises the capacity of overfull legacy
  stores and, when the save has no audit, sets the opening balance from the
  current physical stock.
- `js/core/persistence.js` migrates the outer envelope: version 1 and envelopes
  without a version are accepted and normalised to `SAVE_VERSION = 2`; saves
  from a newer build are refused.
- `js/app/main.js` migrates the snapshot itself through
  `SAVE_SCHEMA_MIGRATIONS` to `SAVE_SCHEMA_VERSION = 4`.

## 9. Limits

| Bound | Value |
| --- | --- |
| active jobs | 72 |
| retained jobs in save | 72 |
| carriers | 6 |
| ledger entries | 600 |
| reachability path nodes | 2400 |
| route cache | 600 keys |
| save entities | 900 |

`tests/systems/logistics-integrity.test.js` contains a maximum-load test (12
stores, 72 orders, 240 simulated ticks) that asserts the queue bound, the
carrier bound, the absence of negative stock and a balanced audit. The test
prints its measured duration; it is a regression guard, not a throughput
benchmark of the renderer.
