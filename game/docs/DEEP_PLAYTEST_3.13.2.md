# Deep playtest 3.13.2 — the visible growth gate

**Date:** 2026-11-10
**Build:** 3.13.2
**Scope:** population growth explanation, browser playability, 25-year and 100-year campaign stability

## What was played

The review did not treat the happy-path fiction as sufficient. It exercised the
realm the way different players actually approach it:

- a first-time player who lets the opening settlement run and watches the HUD;
- a deliberate 25-year builder who expands housing, food, water, safety, health,
  trade and the royal goals in sequence;
- a 100-year sandbox player who keeps the realm running after the campaign
  objectives are complete;
- alternate worlds with less forgiving water, health and terrain conditions.

The 25-year reference route remains the deterministic acceptance route. The
10-year browser audit began with no construction input, then measured the live
frame rate, layout and runtime errors. The 100-year route continued the same
deliberate construction policy through 40,040 ticks.

## Finding 1 — population growth failed silently

The opening realm starts with 21 residents and 22 beds, but after 4,000 ticks
(10 years) it had **18 residents with one free bed**. Food, morale and housing
were not the immediate limit. The yearly settlement check rejected newcomers
because local safety was **0.2**, below the existing 0.35 threshold.

The simulation was correct to protect a dangerous settlement. The presentation
was not: the PEOPLE panel showed the census and housing, but never explained
that the realm was in a growth gate or what would open it. A player could
reasonably conclude that a house with a free bed should attract a resident.

**Fix:** `getPopulationGrowthGate()` is now the single explanation path used by
the yearly growth update. The population panel renders the gate before its
effects list, names the blocking need and gives the recovery action. The start
state shows:

> GROWTH GATE · BLOCKED · Local safety is too low. Build a watchtower covering occupied homes. Free beds: 1.

The gate distinguishes housing capacity, water, safety, food reserve, low morale
and the ordinary open state. It does not change yields, growth speed or the
save schema.

## Finding 2 — alternate seeds are not campaign-robust

A three-seed 25-year audit was run against the same deliberate route:

| Seed | Result | Population | Ambitions |
|---|---:|---:|---:|
| 20261108 | pass | 59 | 13/13 |
| 7 | fail | 45 | 12/13 |
| 99 | fail | 44 | 12/13 |

Both failing worlds miss `eternal-realm` at the 55-resident threshold. Their
housing, food and satisfaction are not the limiting factor; low health and the
fixed two-resident annual growth cap leave too little time in a 25-year route.
A human player can react to the visible health number, but the scripted route
does not recover quickly enough.

**What was tried and rejected:** the audit player was changed to build up to
three clinics when health fell below 0.8. That diverted materials from the food
chain: seed 99 fell to 24 residents and 0 food, and the reference seed acquired
a stalled construction site. A two-clinic variant still failed the reference
seed. The experiment was reverted; 3.13.2 ships **no balance change** rather
than hiding the problem behind a broken green test.

This remains an open content/balance item: make the 25-year ambition robust on
low-health seeds without weakening housing, mortality or the campaign goal.

## Finding 3 — the long horizon has no new structural content

The 100-year route completes all 13 ambitions and three Eternal Deeds, reaches
70 residents and exits with no stalled sites. It is stable, but the last decades
repeat the same deed loop. There are no new world regions, eras, rival realms or
strategic victory layers after the first campaign. That is the largest gap
between the current game and a credible 1,000-hour game.

## Verification

| Check | Result |
|---|---|
| Full Node suite | **719/719 pass** |
| Syntax, relative imports and UI ids | **104 source files / 189 UI ids**, pass |
| Browser playability, 4,000 ticks | year 11, 60 FPS, no page/console errors, no horizontal overflow |
| Growth gate in browser | visible and blocked at safety 0.2 with one free bed |
| Reference 25-year campaign | **13/13**, 59 residents, no game over, 2.288 ms/tick |
| 100-year campaign | **13/13**, 70 residents, 3 Eternal Deeds, 40,040 ticks, 0 stalled sites, 2.563 ms/tick |
| Deterministic seed route | seed 20261108 passes; seeds 7 and 99 remain documented failures |

The 100-year run is a simulation-realm test, not a claim that a human has
played 1,000 hours. Ten years of browser time took roughly one minute at 4x in
this environment; the 100-year headless run is measured in simulation time and
tick cost, not entertainment time.

## What 1,000 hours would still require

- Campaign-robust population/health balance across low-water and low-health
  seeds.
- New strategic layers after the 13 ambitions: eras, regions, rival realms,
  exploration and changing diplomatic goals.
- More than the current finite family and Eternal Deed set; deeds must change
  the world rather than repeat as the same loop.
- Crisis and recovery variety that remains legible to a player over many hours.
- Long-duration browser soak tests on a low-end reference device, including
  memory and save/load stress.
- Human playtesting of pacing and discoverability; automated ticks cannot prove
  that a hundredth hour is still interesting.

This document is the honest boundary of the current evidence. It should be
updated with the next seed-robust campaign and the first new post-campaign
strategic layer, not with a claimed hour count.
