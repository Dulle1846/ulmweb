# Campaign verification

The reference campaign is a headless, deterministic 25-year run of the real
simulation and the real player APIs. It is not a scripted fixture and it does
not hand-place buildings, events, illness or workers.

## Commands

```sh
cd game
npm run test:campaign        # one seed (20261108 by default)
npm run test:campaign:sweep  # documented three-seed savanna sweep
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
still passes every real campaign requirement.

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

### 1.2.11 documented sweep (2026-11-14)

| Seed | Requirements | Ticks | Firewood | Population | Gold | Fuel orders | Max per phase |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `20261106` | all true | 10,040 | 46 | 63 | 4,274.93 | 0 | 0 |
| `20261143` | all true | 10,040 | 42 | 74 | 4,362.88 | 0 | 0 |
| `20261152` | all true | 10,040 | 50 | 67 | 4,437.10 | **2** | **1** |

Sweep result: `ok:true`, 3/3 seeds green, 2 real orders in 2 phases, no game
over, no stalled sites. Seed `20261152` records the illness in years 7–8 of
ordinary play; the sawmill's sick sawyer is replaced by the normal workforce
logic and the replacement receives the one-shot fuel-backfill lease. Every
campaign requirement remains true on that seed. Tick cost across the sweep was
0.605–0.619 ms/tick.

## Performance and determinism

The campaign is fixed-step and independent of wall-clock pacing. It runs the
real world generator with a canvas stub only for the one-off terrain prerender;
no simulation system is stubbed. Use the browser E2E and the low-end
performance profile for presentation budgets.

See [tests/browser/README.md](../tests/browser/README.md) for the browser
campaign and low-end performance commands.

Verified on 2026-11-14 against runtime commit `89ad0ca`: `npm run
test:campaign:sweep` exits 0 with the three documented seeds, every campaign
requirement true on every seed, and the real illness-to-fuel-backfill chain
present on seed `20261152`.
