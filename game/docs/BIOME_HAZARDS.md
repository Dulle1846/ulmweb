# Biomes with special hazards and diseases (1.2.20)

**Status:** implemented, tested and deployed from `ulmweb-branch` on 2026-11-22.
**Spec:** 1.2.20.1–1.2.20.102, all 102 points implemented.
**Panel:** `HAZARDS` tab in the realm management deck.
**Code:** `js/world/hazard-data.js`, `js/world/hazard-expansion-data.js`,
`js/systems/environmental-hazards.js`, `js/systems/hazard-response.js`,
`js/systems/hazard-scars.js`, `js/systems/hazard-modifiers.js`,
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

The panel also carries the response layer: a seeded seasonal forecast with an
uncertainty band, four plans (stockpile, evacuate, relief crews, fortify), real
specialist crews, quarantine, neighbour aid, the emergency fund and loan,
resettlement, disease treatment, rare-event decisions and the hazard map
toggle. The original three actions remain: prepare the season (12 wood, 8 gold,
once per season), treat casualties (spends herbal doses) and cleanse corrupted
ground (10 stone, 12 gold).

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

- illness and injury on real villagers (`illnessUntilTick`, `hp`); most
  environmental casualties are drawn from exposed field, forest and mine crews,
  while the crown and noble households remain shielded,
- treatment paid from the real medicine store and gathered remedies
  (`health.medicineStock`, forest medicinal goods); the `herbalDoses` ledger
  records doses given and is never spent,
- disease pressure through the real sanitation score that `health.js`
  already reads before it declares an outbreak (`startOutbreak()`),
- food, wood, stone and gold through the resource ledger,
- field growth and fertility on real farm entities,
- roads and buildings (the keep, the wonder, the court and the prison are
  protected so a hazard cannot invalidate another system's save invariants),
- morale,
- trade partners from the live diplomacy state for plague spread.

### Derived modifiers

The saved `needs`, `work`, `movement`, `extraction`, `pasture`, `trade` and
`adaptation` values are converted once per season by
`js/systems/hazard-modifiers.js` and read by the systems the player already
uses. A penalty is `1 - value × coefficient × relief`, a cost is
`1 + value × coefficient × relief`, and `relief = 1 - adaptation × 0.60`.
Every factor is exactly `1` when no rolled hazard is active.

| Modifier | Live consumer | Full-severity effect before adaptation |
|---|---|---|
| `needs` | `calculateDailyLedger` household demand | food and water draw +45% |
| `work` | `getBuildingEfficiency`, `updateConstruction` | production and build progress −40% |
| `movement` | villager travel/flight, expedition departure | speed and expedition progress −45% |
| `extraction` | lumber, quarry and gold-mine yields | raw extraction −40% |
| `pasture` | forest-fauna carrying capacity | herd capacity −35% |
| `trade` | `executeTrade` caravan terms | buys +30%, sales −30% |
| `adaptation` | every factor above | takes back `adaptation × 60%` of the penalty |

The HAZARDS panel reads the same factors and prints them as a DERIVED
CONSEQUENCES block, so a player sees the food/water draw, work and building
loss, movement, extraction, pasture, caravan buy/sell and adaptation relief
next to the hazards causing them. With no rolled hazard the block reads
NEUTRAL and every value is `0%`.

Protection is measured from real objects: wells and bathhouses, mills and worked
farms, walls, foresters, sanitation, roads, warehouses, clinics, healers,
medicine, insulated homes, school and scriptorium, barracks and smithy, and the
keep. Nothing is granted by declaring a policy.

### Response layer

`js/systems/hazard-response.js` owns the parts that turn preparedness into a
choice instead of a number:

- **Forecast.** A pure hash of seed, season and year produces the coming
  season's risks and an uncertainty band. Confidence rises with real research
  and the protection survey; nothing is rolled when the panel is opened.
- **Plans.** Once per season the player pays for stockpiling (+2 protected
  food losses), evacuation (casualties and destruction), relief crews (field
  repair and reconstruction) or fortification (readiness). The plan expires at
  the next season change and is saved.
- **Disease model.** Every recorded disease has a route (`water`, `vector`,
  `air`, `contact`), contagion, lethality, duration and case/death/recovered
  counts. Progression is annual and bounded; treatment spends gold and food,
  quarantine slows spread and closes the border, and the health system still
  owns the actual outbreak declaration.
- **Neighbouring realms.** Up to four diplomacy realms carry an outbreak and
  animal-plague state. They can infect the realm along trade, request aid or
  receive it, with relation, morale and caravan consequences.
- **Rare chains.** Five rare events are multi-year rules with an annual effect
  and a decision; a 3.36 rare record is migrated into a chain on its next year.
- **Crews and equipment.** Fire, rescue, medical and equipment levels are
  trained with real stores, saved, and read as mitigation and casualty relief.
- **Rebuild economy.** The emergency fund, loan, resettlement and insurance
  payout are saved state; wrecks stay in the existing disaster-recovery queue
  and keep their 25% rebuild discount.

### Spatial scars

`js/systems/hazard-scars.js` keeps bounded lists (16 per kind) of burnt forest,
floodwater, lava, lost ground and corruption. Wildfire removes real forest
stock, flood scars cut roads, lava and lost ground are permanent impassable
tiles for villagers and caravans, and corruption blocks forage. `renderer.js`
draws the same lists when the HAZARDS panel's map overlay is enabled. No scar
list grows without a cap and none is scanned inside the frame loop.

### Protection works

Eight real buildings are available in the PROTECTION build menu: flood dam,
avalanche barrier, drainage ditch, firebreak, weatherproof house (also housing),
quarantine house (health and sanitation service), granary (warehouse), and
warding stone. They use the normal placement, material, construction and save
pipeline. Their counts feed dams, avalanche protection, drainage, firebreak
field relief, warehouses, medical care, adapted clothing and wards in the
protection survey.

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
change. A saved realm with no rolled hazard loads with an exactly neutral
modifier block, even if a build before the modifiers had consumers left values
from the standing regional bundle in the save.

The 3.37 response layer stores `response`, `partners` and `scars` inside the
same object, so no schema bump is needed. Old disease records load contained
(`active: false`) and old rare records are migrated into a chain rather than
remaining inert. The map overlay flag is presentation-only and intentionally
not saved.

### Verification for 3.37

- `node --test tests/world/hazard-expansion.test.js` — 9 tests for the
  catalogue, forecast, plans, disease progression, movement blockers, rare
  chains, crews/economy and partner aid.
- `node --test tests/systems/city-builder.test.js` — the eight protection works
  pass through the real construction and save pipeline.
- `npm run test:hazard-ui` — browser reference for forecast, plan, crew, scars,
  rebuild, partner rows, overlay and save/reload persistence.
- `npm run spec:audit` — 102 / 102 points implemented; source hash regenerated.
- `npm test` and the deterministic 25-year campaign remain the release gate.

## Verification

- `npm test` — full suite including `tests/world/environmental-hazards.test.js`
  (catalogue completeness, determinism, bounded passes, health/store/morale
  effects, field damage, destruction protection, the sanitation floor, shielded
  households, chronic processes, arcane burden, actions, save round trip and
  migration) and `tests/world/hazard-modifiers.test.js` (neutral baselines,
  household demand, production, construction, extraction, pasture, caravan
  terms and adaptation relief).
- `npm run test:hazard-ui` — real browser reference: panel render, prepare
  action, a settled hazard row, save/reload, the calm NEUTRAL consequences
  block, the hazard-on consequences and no console errors.
- `npm run spec:audit` — 102 / 102 points implemented.
- Deterministic 25-year campaign and the browser E2E reference run for the
  release that introduced the system.
