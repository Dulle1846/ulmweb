# Deep playtest 3.13.4 — shared-simulation performance

**Date:** 2026-11-10
**Build:** 3.13.4
**Predecessor:** [Deep playtest 3.13.3](DEEP_PLAYTEST_3.13.3.md)
**Scope:** four-seed 100-year performance, 4 × 3 seed/playstyle matrix, shared simulation caches, long-run behaviour and remaining limits

## What was wrong

3.13.3 made the 25-year route green on every seed, but the 100-year cost was
still seed-dependent. On the same 8-vCPU Node 26 host, the reference seed
measured **2.745 ms/tick**, while seed 7 measured **9.534 ms/tick**. The 3.13.3
documented 25-year alternate-seed range was 3.19–4.63 ms/tick. The requirement
was not satisfied by averaging the reference result against slower worlds.

A CPU profile of the 100-year seed-7 run named the real costs:

- `updateForestFauna` **44 %**, almost all of it rebuilding the same forest
  stand through `getResourceNodeAt`/`forestStandAt` for herds, migrations and
  insect colonies;
- logistics pathfinding **26 %**, including a second full carrier route
  computed immediately after cargo pickup;
- repeated building placement work **≈16 %** on this harness route;
- succession iterating and allocating an `Object.entries` array over all
  disturbance records **≈8 %**;
- service staffing rebuilding the workforce snapshot for every house ×
  service pair **≈7 %**;
- production stock checks normalising every building inventory on every
  `getPhysicalStock` call **≈6 %**.

## What changed

No ambition target, yield, population rule, save schema or simulation system
was removed. The work is caching, exact invalidation and hot-loop reduction:

- **Fauna habitat cache:** `getForestHabitatAt()` stores the exact forest stock,
  capacity, stand and succession inputs used by wildlife. The cache key includes
  the stock value, capacity, succession kind/age, climate and forest setting, so
  a harvest, fire, storm or regrowth is visible on the next call. Herd occupancy
  is built once per simulated day instead of once per migrating herd.
- **Carrier route cache:** routes are reused within a world/road/building
  collision epoch; world, size, building and road changes invalidate them. The
  duplicate route after `takeFromSource()` was removed because taking cargo
  changes inventory, not walkability.
- **Lean geography queries:** placement, forester range and field surveys ask
  for the raw stock/stone/water/fertility columns instead of constructing a full
  stand. Building overlap checks reuse the static building list between
  collision-version bumps.
- **Succession:** the daily pass no longer allocates an `Object.entries` array,
  caches disturbance profiles by kind and skips already-recovered records. The
  spread pass keeps an exact live tile count instead of repeatedly counting the
  whole key set.
- **Settlement services:** one workforce snapshot and one active-building list
  are computed per service pass instead of per house and category.
- **Production stock:** `getPhysicalStock()` and `getPhysicalStockMap()` no
  longer re-normalise every inventory for every product check; missing stores
  are still initialised once.

## 100-year results

Method: `CAMPAIGN_SEED=<seed> CAMPAIGN_YEARS=100 node scripts/long-campaign.mjs`
on the same host and with the same 40,040-tick harness as 3.13.3. Every run
finished with `ok:true`, final year 101, 13/13 ambitions, 70 residents, zero
unresolved construction sites, zero food shortage and no game over.

| Seed | Tick cost | Ticks | Residents | Ambitions | Eternal Deeds | Stalls | Food shortage | Game over |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 20261108 | **0.995 ms** | 40,040 | 70 | 13/13 | 3 | 0 | 0 | no |
| 7 | **1.780 ms** | 40,040 | 70 | 13/13 | 2 | 0 | 0 | no |
| 99 | **0.847 ms** | 40,040 | 70 | 13/13 | 2 | 0 | 0 | no |
| 42 | **0.798 ms** | 40,040 | 70 | 13/13 | 1 | 0 | 0 | no |

Seed 7 was repeated at **1.819 ms/tick** before the final run; the observed
spread is 1.78–1.82 ms. The previous seed-7 measurement fell from 9.534 to
1.78–1.82 ms, a **5.2–5.4×** reduction. The reference seed fell from 2.745 to
0.995 ms on the same host.

All four runs are **faster than the requested 2.3–2.6 ms band**; the 2.6 ms
ceiling is met with substantial margin on every seed. No artificial load was
added merely to land on the lower bound. The measurement command, tick count and
sampling method are unchanged.

## 25-year 4 × 3 matrix

The complete player-profile matrix remains green after the performance changes:

| Seed | Profile | Residents | Ambitions | Tick cost | Stalls | Game over |
|---|---|---:|---:|---:|---:|---|
| 20261108 | builder | 75 | 13/13 | 0.772 ms | 0 | no |
| 20261108 | settler | 75 | 13/13 | 0.787 ms | 0 | no |
| 20261108 | ignorer | 75 | 13/13 | 0.854 ms | 0 | no |
| 7 | builder | 63 | 13/13 | 0.842 ms | 0 | no |
| 7 | settler | 63 | 13/13 | 0.798 ms | 0 | no |
| 7 | ignorer | 64 | 13/13 | 0.818 ms | 0 | no |
| 99 | builder | 71 | 13/13 | 1.137 ms | 0 | no |
| 99 | settler | 66 | 13/13 | 0.763 ms | 0 | no |
| 99 | ignorer | 73 | 13/13 | 0.758 ms | 0 | no |
| 42 | builder | 70 | 13/13 | 0.864 ms | 0 | no |
| 42 | settler | 70 | 13/13 | 0.838 ms | 0 | no |
| 42 | ignorer | 71 | 13/13 | 0.841 ms | 0 | no |

All twelve runs reached **13/13 ambitions**, at least **55 residents**, **zero
unresolved construction stalls**, no food collapse and no game over. Every
crown-relief attempt in the matrix succeeded (1–3 attempts per run, 0 failed).
The lowest population is 63, eight above the unchanged target.

## Verification

| Check | Result |
|---|---|
| Full Node suite | **724/724 pass** |
| Syntax, relative imports and UI ids | **105 source files / 189 UI ids**, pass |
| 100-year runs | **4/4 green**, 40,040 ticks each, 13/13, 0 stalls, 0 food shortages, no game over |
| 100-year tick cost | **0.798–1.820 ms** on the same host/method |
| 25-year matrix | **12/12 green**, 13/13, 63–75 residents, 0 stalls |
| Habitat-cache regression | harvest and new succession are visible immediately |
| Path-cache regression | existing world/collision/size invalidation tests remain green |

The local browser check is performed against the production URL after the
Pages deployment of the release commit. A green Node run is not evidence of a
Pages deployment; the live version and module hashes are checked separately.

## What remains

- **No 1,000-hour claim.** 160,160 deterministic ticks across four 100-year
  runs plus the 12 × 10,040-tick matrix do not prove a thousand hours of human
  entertainment.
- **The harness is not a human.** Three policies are broader than one happy
  path, but they still follow finite construction heuristics. A human can make
  different mistakes.
- **The lower bound is not a target.** The game is now faster than the requested
  band. This is reported as measured, not hidden behind a different metric.
- **Post-campaign content** still repeats Eternal Deeds. There are no new world
  regions, eras, rival realms or strategic objectives after the 13 ambitions.
- **Low-end device soak testing** and long save/load stress remain open. The
  browser environment used for verification is a software-rendered Chromium
  instance, not a low-end phone guarantee.

This is the honest boundary of the current evidence: the shared simulation now
passes four 100-year seeds, the full 4 × 3 matrix, the complete Node suite and
the syntax/UI contract, while the remaining content and device limits are
recorded rather than hidden.
