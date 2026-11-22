# Biomes with special hazards and diseases (1.2.20)

**Status:** implemented, tested and deployed from `ulmweb-branch` on 2026-11-22.
**Spec:** 1.2.20.1–1.2.20.102, all 102 points implemented.
**Panel:** `HAZARDS` tab in the realm management deck.
**Code:** `js/world/hazard-data.js`, `js/systems/environmental-hazards.js`,
`js/presentation/hazard-panel.js`, `css/hazard-panel.css`.

## What the player sees

The realm now has a standing hazard layer on top of the per-climate modules
(snow, volcano, coast). Each climate carries its own combination of dangers:
heat and drought in arid and savanna realms, frost and avalanche in snow,
mountain and tundra realms, parasites and fever in rainforest and swamp,
erosion and storm surge on the coast, ash, gas and lava in volcanic realms, and
corruption, fog and magical disease in the Enchanted realms.

The `HAZARDS` panel reads the same saved state the simulation writes. It shows

- the active hazards of the current season with their severity,
- readiness, built protection and what each work still needs,
- regional diseases and outbreaks,
- the long-term consequences (drought years, plague spread, animal plague,
  wildfire zones, flood scars, volcanic ash, climate drift, disaster debt),
- the arcane burden with a cleanse action,
- losses caused by hazards and a chronicle of every season that hurt the realm.

Three real actions are available: prepare the season (12 wood, 8 gold, once per
season), treat casualties (spends herbal doses) and cleanse corrupted ground
(10 stone, 12 gold).

## Simulation model

| Layer | Cadence | Budget |
|---|---|---|
| Seasonal hazard pass | once per season change (4/year) | ≤ 6 active hazards, ≤ 24 damaged fields |
| Annual hazard pass | year boundary inside `ANNUAL_TASKS` | counters and caps only |
| Panel | on demand | one snapshot read |

Every roll is a pure hash of world seed, year, season and hazard id, so a replay
reaches the same hazards and the shared random streams are untouched. The passes
never scan the tile grid and never run inside the frame loop.

Hazards act on systems that already exist:

- illness and injury on real villagers (`illnessUntilTick`, `hp`),
- disease pressure through the real sanitation score that `health.js`
  already reads before it declares an outbreak (`startOutbreak()`),
- food, wood, stone and gold through the resource ledger,
- field growth and fertility on real farm entities,
- roads and buildings (the keep, the wonder, the court and the prison are
  protected so a hazard cannot invalidate another system's save invariants),
- morale,
- trade partners from the live diplomacy state for plague spread.

Protection is measured from real objects: wells and bathhouses, mills and worked
farms, walls, foresters, sanitation, roads, warehouses, clinics, healers,
medicine, insulated homes, school and scriptorium, barracks and smithy, and the
keep. Nothing is granted by declaring a policy.

## Spec coverage

`js/world/hazard-data.js` holds the 102-row catalogue. Every row names the
mechanic that implements it, and the test suite compares the catalogue against
the engine's mechanic list so a requirement cannot exist as a label without a
rule. `npm run spec:audit` reads `HAZARD_REQUIREMENTS` and reports all 102
points as implemented with their consumers and tests.

## Pacing and balance

A climate's list is a list of possibilities, not a schedule. Every season each
danger rolls its own occurrence against its weight, so quiet seasons exist and
a climate's signature danger is the one most likely to arrive. At most three
hazards act per season.

The season budgets exist so a hazard costs the realm something real without
emptying it: at most one casualty and one structure per season, six food and one
morale point, and food losses only touch the surplus above a 30-unit reserve.
Hazard-borne disease lowers the sanitation score but stops at a floor of 46;
the health system's own outbreak threshold (40) therefore stays reachable only
through accumulated neglect, not through a single bad harvest.

The crown and noble households are never drawn as hazard casualties: they have
shelter, stores and care, and their extinction belongs to mortality, war and
feud, not to a flooded field. Hazards can still ruin their dues and their
lordship's mood, and their people still fall ill.

## Save compatibility

The state is stored under `environmentalHazards`, normalised on load and clamped
against hostile input. Save schema 13 adds the field; a schema-12 realm loads
with a quiet hazard state and receives its first season pass on the next season
change.

## Verification

- `npm test` — full suite including `tests/world/environmental-hazards.test.js`
  (catalogue completeness, determinism, bounded passes, health/store/morale
  effects, field damage, destruction protection, the sanitation floor, shielded
  households, chronic processes, arcane burden, actions, save round trip and
  migration).
- `npm run test:hazard-ui` — real browser reference: panel render, prepare
  action, a settled hazard row, save/reload and no console errors.
- `npm run spec:audit` — 102 / 102 points implemented.
- Deterministic 25-year campaign and the browser E2E reference run for the
  release that introduced the system.
