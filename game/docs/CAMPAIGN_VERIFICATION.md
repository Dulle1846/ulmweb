# Campaign verification

The reference campaign is a headless, deterministic 25-year run of the real
simulation and the real player APIs. It is not a scripted fixture and it does
not hand-place buildings, events, illness or workers.

## Commands

```sh
cd game
npm run test:campaign              # one seed (20261108 by default)
npm run test:campaign:sweep        # documented three-seed savanna sweep
npm run test:campaign:sweep:taiga  # documented three-seed taiga sweep
```

The single-seed runner accepts:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAMPAIGN_SEED` | `20261108` | One realm seed. |
| `CAMPAIGN_SEEDS` | empty | Comma-separated seed sweep; overrides `CAMPAIGN_SEED`. |
| `CAMPAIGN_CLIMATE` | `temperate` | Climate passed to the real world generator. |
| `CAMPAIGN_YEARS` | `25` | Campaign length. |
| `CAMPAIGN_ERA` | `common-weal` | Starting era. |
| `CAMPAIGN_MIN_AGENDA_STAGES` | `1` | Minimum completed era-agenda stages. |

`test:campaign:sweep` is the documented reference gate:

```sh
CAMPAIGN_CLIMATE=savanna \
CAMPAIGN_SEEDS=20261106,20261143,20261152 \
node scripts/long-campaign.mjs
```

It exits zero only when **all** of the following hold:

1. Every seed's complete `requirements` object is true.
2. No seed ends in game over or leaves a stalled construction site.
3. No worker/building phase receives more than one fuel-backfill order.
4. Across the whole sweep, at least one real illness-to-fuel-backfill order
   appears in the ordinary simulation diagnostics.

A single seed can therefore be honest about a rare random illness: the sweep
does not demand a rare event on every seed, but it does demand that every seed
still passes every real campaign requirement. The gate is deliberately
climate-agnostic. The Taiga sweep uses the same fail-closed checks; it does not
substitute a different, weaker order requirement.

## Real campaign requirements

The campaign driver builds through the real construction, logistics, royal,
court, diplomacy and ambition APIs. At the end of year 25 it requires:

- all 13 ambitions complete, including every intermediate ambition;
- an era chosen, at least one era-agenda stage complete, and a real agenda
  modifier applied to the economy;
- at least 55 living residents;
- at least 2,000 gold and morale at least 80;
- food positive and no food shortage in each of the last four years;
- firewood positive in each of the last four years;
- at least one tower, 16 houses, four farms, three bakeries and three mills;
- no active construction site, at least 12 buildings built and at least 12
  events resolved;
- no game over and no stalled construction site.

These requirements are never relaxed for a sweep. `scripts/long-campaign.mjs`
uses `tests/campaign/sweep-results.mjs`; a focused test covers the fail-closed
aggregation (`tests/campaign/sweep-results.test.js`).

## Fuel-backfill evidence

The diagnostic observes, after every real simulation tick, workers with an
active `fuelBackfillUntil` lease at a lumber camp or sawmill. The harness never
calls the order function, sets a lease, or moves a sick worker. An order is
counted only when a qualifying lease first appears; a changed lease on the same
worker/building is an illness extension, not a new order. `maxOrdersPerPhase`
must stay at one.

The illness originates in the ordinary annual health audit. Sanitation,
crowding, food shortage and household/community spread determine outbreaks;
healthy settlements therefore see this chain only occasionally. It is real,
not impossible:

### 1.2.11 savanna reference sweep (2026-11-14, current)

| Seed | Requirements | Ticks | Firewood | Population | Gold | Fuel orders | Max per phase |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `20261106` | all true | 10,040 | 46 | 63 | 4,282.95 | **12** | **1** |
| `20261143` | all true | 10,040 | 42 | 74 | 4,369.28 | **6** | **1** |
| `20261152` | all true | 10,040 | 48 | 63 | 4,333.91 | **11** | **1** |

Sweep result: `ok:true`, 3/3 seeds green, **29** real orders in 29 phases, no
game over, no stalled sites. Every order is produced by the ordinary annual
health audit and the ordinary workforce tick; no illness or lease is placed by
the harness. Tick cost across the sweep was 0.634–0.892 ms/tick.

### 1.2.10 taiga sweep (2026-11-14)

The Taiga failure was not a missing campaign requirement. Seed `20261108`
reached all 13 ambitions with every requirement true, but produced no fuel
order: its sick fuel worker fell ill during summer with 45 firewood in store,
while the store only fell below the 18-load reserve during winter and spring.
The two conditions never overlapped. The settlement was working, but the
one-shot replacement was gated on a coincidence rather than on the real
staffing gap.

`fuelStaffingGap()` in `js/simulation/villagers.js` now treats a completed
lumber camp or sawmill with a sick worker and fewer healthy workers than its
capacity as a fuel emergency, even while the current store is healthy. The
low-reserve path remains in place. The replacement still receives the same
one-shot lease, the same illness guard prevents a second order for the same
phase, and the sweep gate itself was not changed.

| Seed | Requirements | Ticks | Firewood | Population | Gold | Fuel orders | Max per phase |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `20261108` | all true | 10,040 | 50 | 74 | 4,686.99 | **1** | **1** |
| `20261110` | all true | 10,040 | 46 | 70 | 4,392.17 | **7** | **1** |
| `20261111` | all true | 10,040 | 47 | 74 | 4,727.48 | 0 | 0 |

Sweep result: `ok:true`, 3/3 seeds green, **8** real orders in 8 phases, no
game over, no stalled sites, 0.908–1.088 ms/tick. The accepted seed
`20261108` order is logged at **year 25, tick 9720**: the sawmill's sick
sawyer is replaced by a real resident, the replacement becomes `sawyer`, the
lease lasts to tick 9820, and the store holds **47 firewood** at the moment of
the order. The harness observed the lease after the real simulation tick; it
did not call the order or move the worker.

## Performance and determinism

The campaign is fixed-step and independent of wall-clock pacing. It runs the
real world generator with a canvas stub only for the one-off terrain prerender;
no simulation system is stubbed. Use the browser E2E and the low-end
performance profile for presentation budgets.

See [tests/browser/README.md](../tests/browser/README.md) for the browser
campaign and low-end performance commands.

Verified on 2026-11-14: `npm run test:campaign:sweep` exits 0 with the three
documented savanna seeds, and `npm run test:campaign:sweep:taiga` exits 0 with
seeds `20261108`, `20261110` and `20261111`. Both sweeps have every campaign
requirement true, no game over, no stalled sites and no worker phase with more
than one order.
