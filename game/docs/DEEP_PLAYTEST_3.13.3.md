# Deep playtest 3.13.3 — the seed-robust living realm

**Date:** 2026-11-10
**Build:** 3.13.3
**Scope:** four-seed × three-playstyle 25-year campaign, mature-realm immigration, crown relief, food and gold recovery, long-run performance

## What was played

The 3.13.2 audit left a real balance gap, not a missing explanation: seeds 7
and 99 ended the same deliberate 25-year route at 45 and 44 residents, short of
the unchanged 55-resident `eternal-realm` ambition. The only attempted fix,
adding clinics, starved seed 99's food chain and produced a construction stall
on the reference seed. That experiment was reverted.

This pass treats the gap as a game-design problem. It runs four different
worlds through three different player policies for the full 25 years:

| Profile | Behaviour |
|---|---|
| **Builder** | Reviews needs every year; food, housing and services first; expands production in a measured order. |
| **Settler** | Expands farms, cottages and the timber/firewood chain before civic buildings; reviews every year. |
| **Ignorer** | Reviews construction only every sixteen days and relief every second year; still reacts to a blocked visible gate. |

The four seeds are `20261108` (the reference), `7`, `99` and `42`. They differ
in terrain, water, health, forest and starting conditions. Every run uses the
shipped starting realm, real construction and road placement, real carrier
logistics, real events, real market trades and the real ambition system. It
does not write resource totals, population or ambitions directly. The only
non-game stub is the offscreen canvas used during world generation.

## Finding 1 — the final ambition was mathematically seed-dependent

The old yearly allowance was a flat two residents, shared by births and
immigration. A 20-resident opening therefore had a hard ceiling of 44 residents
by year 25 even when every gate was open. The reference realm escaped that
ceiling through its stronger starting health and earlier settlement growth;
seeds 7 and 99 did not. The ambition was not failing because players had
nowhere to live. It was failing because a healthy but slower realm could not
recover the lost years.

**Fix:** a realm that has survived ten years and still meets the existing
settlement conditions can now welcome a third resident in a year. The extra
arrival is not a resource grant and does not bypass any gate. It requires:

- year 10 or later;
- water coverage at least 0.40;
- safety coverage at least 0.35;
- household satisfaction at least 0.45;
- food at least four units per resident;
- a free bed, adequate morale, an allowed villager entity and the normal
  settlement check.

The allowance is re-evaluated every ten ticks rather than on every tick, so
the new route adds no measurable per-tick scan. Births still count against the
same yearly allowance. The `eternal-realm` target stays at **55 residents**;
no ambition, reward or victory condition was weakened.

## Finding 2 — blocked gates had no costed recovery path

The visible growth gate from 3.13.2 explained *why* growth stopped, but for
water, food and housing it offered no action. A player could see the dead end
without a way out.

**Fix:** `crown-relief.js` turns the visible gate into one deliberate, costed
offer through the existing crown-supply systems:

- **Water:** commission the next waterworks level, paying its real setup cost.
- **Food:** open a regional granary contract when no grain route is active, or
  provision the existing granary from held harvest and surplus goods.
- **Housing:** rebuild an existing timber cottage in stone, adding two places
  without a new footprint, for the real stone-house cost.
- **Safety and morale:** no purchased shortcut. The gate keeps naming the
  watchtower or policy the realm actually needs.

The PEOPLE panel exposes the action as `data-command="crown-relief"`. It is the
same action the campaign harness invokes. It creates no food, water, coin,
housing or residents.

The seed 99 settler also exposed a second dead end: a mature realm could hold
plenty of timber and stone but too little coin for the relief offers. The
harness now uses the real market UI path (`executeTrade`) to sell wood or stone
above a 1,200 construction reserve once the realm is twenty years old, keeping
a 2,400-gold planning reserve. This is a player trade, not a grant. Seed 99's
settler ended with 2,405 gold and 74 food, with two blocked sites recovered and
none left unresolved.

## Finding 3 — clinics were the wrong lever

The previous clinic experiment failed for a structural reason: clinics consume
labour and materials without producing food, and the low-health seeds were
already tight on both. More clinics therefore made the stated health problem
worse by starving the food chain.

This build adds no clinic to the scripted route and changes no clinic yield.
Health remains a real constraint that the player must solve with the existing
sanitation, water, housing and healer systems. The new mature allowance gives a
healthy realm time to use those systems instead of hiding their cost.

## Measured 25-year matrix

All twelve runs reached **13/13 ambitions**, at least **55 residents**, and had
**zero unresolved construction stalls**:

| Seed | Profile | Residents | Ambitions | Tick cost |
|---|---|---:|---:|---:|
| 20261108 | Builder | 75 | 13/13 | 2.575 ms |
| 20261108 | Settler | 75 | 13/13 | 2.641 ms |
| 20261108 | Ignorer | 75 | 13/13 | 2.402 ms |
| 7 | Builder | 63 | 13/13 | 3.832 ms |
| 7 | Settler | 63 | 13/13 | 4.626 ms |
| 7 | Ignorer | 64 | 13/13 | 4.433 ms |
| 99 | Builder | 71 | 13/13 | 4.448 ms |
| 99 | Settler | 66 | 13/13 | 3.803 ms |
| 99 | Ignorer | 73 | 13/13 | 3.999 ms |
| 42 | Builder | 70 | 13/13 | 3.405 ms |
| 42 | Settler | 70 | 13/13 | 3.192 ms |
| 42 | Ignorer | 71 | 13/13 | 3.316 ms |

The lowest result is 63 residents, eight above the unchanged target. No run
ended in a food collapse, a game over or a permanently blocked ambition.

**Harness recovery rule:** the driver keeps at most one active construction
site. A site that remains blocked for 420 days is cancelled through the real
`cancelConstruction` path so the route can continue. Only sites still blocked
at the end of the run count as stalls. The seed 99 settler recovered a house
foundation and a cut-stone tower this way; every other run recovered none. This
is a scripted-player recovery rule, not evidence that every human player will
diagnose every blocked footprint.

## Long-run and browser verification

| Check | Result |
|---|---|
| Full Node suite | **723/723 pass** |
| Syntax, relative imports and UI ids | **105 source files / 189 UI ids**, pass |
| 25-year reference | **13/13**, 75 residents, 2.363 ms/tick, 0 stalls |
| 100-year reference | **13/13**, 70 residents, 3 Eternal Deeds, 40,040 ticks, **2.423 ms/tick**, 0 stalls |
| Local browser playability | 4,000 ticks, 11 years, 18 residents, **60 FPS / 16.7 ms**, 2.07 ms simulated per tick, no page or console errors, no horizontal overflow |
| Browser growth gate | visible: local safety too low, watchtower required, one free bed |

The 4,000-tick browser run is a frame-rate and presentation check, not a second
25-year campaign. It exercises the real UI, starts from the shipped start
screen and reads the live population gate.

## Performance boundary

The reference 25-year route and the 100-year route stay inside the requested
2.3–2.6 ms/tick band: **2.363** and **2.423 ms/tick**. The alternate worlds are
slower at **3.19–4.63 ms/tick** over 25 years. That is terrain- and
entity-cost variation, not caused by the new ten-tick allowance check, but it
does exceed the nominal band on those seeds and is recorded here rather than
averaged away.

The browser run measured **2.07 ms** of simulation work per tick at 60 FPS.
The browser environment is a software-rendered Chromium instance, so the frame
rate is evidence for this VM, not a low-end phone guarantee.

## What remains

- **No 1,000-hour claim.** 40,040 deterministic ticks and 4,000 browser ticks
  do not establish a thousand hours of human entertainment.
- **The harness is not a human.** Three policies are broader than one happy
  path, but they still follow finite construction heuristics. A human can make
  different mistakes.
- **Alternative-seed tick cost** remains above the reference band. Further
  profiling should target the high-entity/low-health worlds without weakening
  their simulation.
- **Post-campaign content** still repeats Eternal Deeds. There are no new world
  regions, eras, rival realms or strategic objectives after the 13 ambitions.
- **Low-end device soak testing** and long save/load stress remain open.

This is the honest boundary of the current evidence: the campaign is now green
across four seeds and three playstyles, and the remaining performance and
content limits are measured rather than hidden.
