# Feudal war bands and theatre campaigns

Kings & Cards 3.74.0 adds one bounded strategic layer over the existing garrison,
noble houses and world map. It answers a short question the older panels could
not: what is the crown's army actually for after the first payroll?

## The three stages

1. **Aim.** In Military, choose one of `WAR_AIMS` — `BORDER WATCH`, `RELIEF MARCH`
   or `TRIBUTE RAID` — a real neighbouring kingdom from the world map, and
   optionally one living noble house. This only opens a row; no resource is
   spent and no RNG is drawn.
2. **Commit.** The button pays the declared `FEUDAL_CONTRACTS` cost from the same
   treasury and granary as every other crown action, records the movement in the
   goods book, then signs a matching feudal contract in Nobility. A power gate
   reserves the raid for a real muster. Committing twice is rejected.
3. **Settle.** Progress advances one bounded scalar per day from supply, control
   and the recorded power. The annual campaign audit settles any full war band,
   and any committed band that has spent two years in the field. A player can
   also settle a full band early in Military. Settlement books gold or food,
   changes the bound house's loyalty and standing, and archives the campaign and
   contract. It never creates a unit or walks one across the map.

## Bounds and determinism

- At most two active campaigns and six active contracts.
- At most twelve archived rows of each kind are kept.
- `updateCampaignProgress()` touches at most two rows, uses no random number and
  performs no per-entity scan.
- `settleAnnualCampaigns()` runs once per year after the world-map survey. It
  uses `rand(0, 1, "campaign")` only. The combat stream and all older streams keep
  their exact draw order.
- Given the same seed, year, power, supply and risk, the outcome is identical.

## Saves

`state.military.campaigns` and `state.nobility.contracts` are optional nested
fields. There is no schema bump. `save-runtime.js` normalises them on write and
on restore; a legacy save receives empty bounded defaults and keeps playing.
The military and nobility validators reject oversized arrays before a save is
accepted.

## Player guidance

NEXT MOVE and the completed five-step first-session checklist read the same
bounded campaign rows. A complete opening continues with an open aim or a ready
war band and opens Military; it does not add a duplicate milestone. The World Map
panel shows which theatres are under a contract, their stage, power, risk and
days to settlement.

## Tests

- `tests/systems/feudal-campaigns.test.js` — registries, stage guards, resource
  and power gates, tick bounds, annual reconciliation, determinism, RNG
  isolation, legacy saves, DTO preflight and UI wiring.
- `tests/simulation/combat-determinism.test.js` — combat draws are unchanged.
- `tests/presentation/core-counsel.test.js`,
  `tests/presentation/first-session.test.js` — extended player guidance.
- `tests/browser/feudal-campaigns-ui.mjs` — real browser Aim → Commit → Settle
  proof through Military, Nobility, World Map and a save/load round trip.
