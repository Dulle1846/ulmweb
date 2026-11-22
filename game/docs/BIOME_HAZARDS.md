# Biomes with special hazards and diseases (1.2.20)

**Status:** implemented, tested and deployed from `ulmweb-branch` on 2026-11-22 (3.42.0).
**Spec:** 1.2.20.1–1.2.20.102, all 102 points active with executable state-delta proofs.
**Panel:** `HAZARDS` tab in the realm management deck.
**Code:** `js/world/hazard-data.js`, `js/world/hazard-expansion-data.js`,
`js/world/hazard-evidence.js`, `js/systems/environmental-hazards.js`,
`js/systems/hazard-response.js`, `js/systems/hazard-scars.js`,
`js/systems/hazard-modifiers.js`, `js/presentation/hazard-panel.js`,
`css/hazard-panel.css`.

Every catalogue point now carries a three-part evidence record in
`js/world/hazard-evidence.js`: the simulation rule that consumes it, the
player-facing surface that reports it, and the focused test that pins it. The
static contract is enforced by `tests/world/hazard-coverage.test.js`. Since
3.42.0 it is backed by an executed proof in
`tests/world/hazard-effect-proofs.test.js`: the real `applyHazard`, annual,
modifier, work, scar and magic paths must move measurable state, and the same
proof must stop moving when that row is neutralized through
`js/systems/hazard-proof.js`. The production seam starts empty and is never
saved, so live determinism and save schema 13 are unchanged.

**Active/passive split:** **102 active, 0 passive.** No 1.2.20 row is a
flavour-only label. A row that is deliberately passive in a future release must
set `passive: true` with a reason and is excluded from the proof count; the
current audit found none, and every one of the 102 rows has a measured delta.

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

### 3.40 terrain-conversion pass

Lava, wildfire and flood now alter the playable map itself, not only their
ledger rows:

- **Conversion is spatial.** The bounded annual hazard pass writes real tile
  marks: lava and lost ground are permanent and impassable, wildfire leaves
  burnt woodland with reduced vegetation, and fresh floodwater raises moisture,
  blocks movement for the year and cuts crossed roads. The existing seed/year
  hash chooses the bounded area; no per-tick conversion work was added.
- **Nodes carry the damage.** `js/systems/resource-geography.js` lowers sparse
  `forestCapacity`/`stoneCapacity` baselines as well as stock. Lava and lost
  ground zero both resources, fire removes timber and most future capacity,
  flood washes out stock/capacity and marks the tile as water-accessible. A
  converted node cannot regrow back through normal forest regrowth.
- **Saves are exact and backward-compatible.** New saves store optional sparse
  capacity deltas in the existing version-1 resource snapshot; 3.39 snapshots
  have no such arrays and are migrated once from the saved marks during
  `restoreEnvironmentalHazardState()`. New snapshots skip re-damage on load.
  The terrain, node, road and blockade round-trip is covered by
  `tests/world/hazard-terrain.test.js`.
- **The map shows it.** `world.js` keeps a clean tinted terrain raster and
  repaints the hazard layer only when marks change. The renderer and minimap
  read the same saved marks; the map legend names all five terrain states and
the hazard panel lists converted tiles, lost nodes, cut roads, last scar
coordinates and the fire/flood/lava conversion shield.
- **Protection is measurable.** Firebreaks, dams, drainage, avalanche barriers
  and safe siting feed `getHazardTerrainShield()`; the annual pass skips a new
  tile mark when the deterministic roll is below the shield, and existing
  works also narrow the converted area. A zero-firebreak realm keeps the exact
  pre-3.40 readiness and hazard pressure.

### 3.42 executable proof pass

The 3.41 evidence contract could still be green while an effect did nothing,
because it compared strings, panel markers and test titles. This pass replaces
the declaration with a run:

- **One proof per row.** `tests/world/hazard-effect-proofs.test.js` registers
  exactly 102 proofs: 42 event applications, 9 bundle exposure checks, 19 effect
  modifier/relief/primitive checks, 12 work protection checks, 9 annual chronic
  processes and 11 magic burdens. Each captures state before and after the real
  call and requires a strictly positive delta.
- **Neutralization is exercised, not assumed.** The test sets one catalogue row
  at a time in `js/systems/hazard-proof.js` (both its spec and mechanic id),
  runs the same proof and requires the delta to collapse. The production set is
  empty, so this seam has no live effect.
- **Measured result:** `102/102` proofs pass normally; `102` single-row
  neutralization runs produce `0/102` survivors (all 102 proofs fail as
  required). The test prints `HAZARD PROOF PASS`, `HAZARD ACTIVE/PASSIVE` and
  `HAZARD NEUTRALIZATION FAILURES` so CI and release reports quote numbers, not
  a claim.
- **Events** go through `applyHazard` with the real field, herd, health,
  building, resource and terrain consumers. **Bundles** must change
  `getHazardProfile().exposure`; **effects** must reach the derived modifier or
  the event primitive; **works** must raise their own mitigation field;
  **chronic** rows must move annual state; **magic** rows must move their saved
  burden, disease or rare chain.
- **Visibility stays attached.** Every proof asserts that its catalogue row has
  a non-empty HAZARDS/EVENT LOG surface in the evidence record, and the existing
  browser reference still checks the rendered HAZARDS panel. No new UI marker
  was invented for the test seam.

### 3.41 evidence-contract pass

The 3.40 report said "102/102" while listing only 42 rollable hazards, 13
disease profiles and 9 regional bundles. That counted catalogue rows, not
proven effects. This pass makes the claim literal:

- **Animal plague reaches real herds.** `damageHazardHerds()` in
  `js/systems/forest-fauna.js` removes a bounded share from the saved herds the
  hunt and predator systems already use, marks them declining, records deaths
  and writes a plague history entry. The seasonal `hazard:epizootic` path and
  the annual plague pass both call it; `losses.herds` and the panel's `HERDS`
  row report the actual number. No per-frame or per-tick work was added.
- **`magic:rare` seeds a real chain.** A charged `magic.rareYears` now calls
  `selectRareChain()` in the annual pass, clears the pressure and publishes the
  rare decision. It is no longer a number that only waited in the panel.
- **Protection works change their own path.** `getHazardExposureRelief()`
  applies wells, irrigation, drainage, roads, warehouses, medical care and
  insulated clothing to water loss, field damage, outbreak pressure, movement,
  caravan terms and illness. The readiness score still exists, but a well or a
  drained lane now matters even when the general score is low.
- **`odd` is no longer a dead primitive.** Poisoned harvests and strange
  seasons lower work output and raise disease risk through the existing
  modifiers, with a real event-log line.
- **The player sees the evidence.** The HAZARDS panel now shows regional
  weights in percent, `HERDS` losses, `RARE PRESSURE`, and a `REALM RESILIENCE`
  block with disease pressure, injury resistance, medical care and adapted
  clothing. Protection notes state the actual path each work protects.

Evidence groups: **42 events** (every `HAZARD_EFFECTS` primitive has an
`applyHazard` branch and a focused behavioural test), **9 bundles** (exposure
multiplies the bundle's signature hazard weights), **19 effects** (each named
modifier/consumer pair), **12 works** (each has a named risk/loss path),
**9 chronic processes** (annual state, terrain scars or trade), **11 magic
burdens** (modifiers, creatures, disease, scars or rare chains) = **102**.

### 3.39 depth pass

The 102 rows are unchanged. The following formerly cosmetic or stored values now
have world consumers:

- **Climate drift** (`js/systems/climate-drift.js`) moves the per-tile
  temperature and moisture queries, tilts the live weather table and changes
  heat versus cold hazard pressure. It is still the same saved
  `chronic.climateDrift`; zero is exactly neutral.
- **Regional bundles** multiply the weight of their own signature hazards by
  the bundle's exposure, so a volcanic, desert, swamp or mountain realm has a
  real regional profile rather than a label.
- **Morale**: the saved hazard `morale` modifier is read by `updateMorale()`.
- **Refugees and resettlement**: `response.migrants` is a real waiting pool;
  housed arrivals spawn villagers through the normal population gate and are
  counted in `response.arrivals`. `response.resettled` remains the number of
  cleared plots, not people.
- **Partner realms**: each partner carries a bounded `crisis`, `refugees` and
  `tradePenalty`; crises raise caravan terms, can send refugees and are cleared
  by aid. Partner crises are displayed in the same panel.

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
| `needs` | `calculateDailyLedger` household demand and `updateSettlementNeeds` water draw | food demand +45%; extra stored water is drawn at the bounded settlement cadence |
| `work` | `getBuildingEfficiency`, `updateConstruction` | production and build progress −40% |
| `movement` | villager travel/flight, expedition departure and logistics caravan carriers | people and expeditions −45%; caravan haulage −23% (the same reading cushioned by carts) |
| `extraction` | lumber, quarry and gold-mine yields | raw extraction −40% |
| `pasture` | forest-fauna carrying capacity and `harvestForestGameAt` | herd capacity −35%; the same hunt takes fewer animals |
| `trade` | `executeTrade` caravan terms | buys +30%, sales −30% |
| `adaptation` | every factor above | takes back `adaptation × 60%` of the penalty |

The HAZARDS panel reads the same factors and prints them as a DERIVED
CONSEQUENCES block, so a player sees the food/water draw, work and building
loss, movement, extraction, pasture, caravan buy/sell and adaptation relief
next to the hazards causing them. With no rolled hazard the block reads
NEUTRAL and every value is `0%`.

The 3.38 pass closes the last silent gaps. Household water demand now consumes
stored water through the existing logistics booking (keyed per house and
tick-window, so a reload cannot double-charge it); movement slows villager
travel and expeditions at full strength, while the derived CARAVAN SPEED factor
cushions half of that penalty for pack animals and carts on the real logistics
route; and pasture stress lowers both carrying capacity and the animals a
successful hunt actually takes. Calm realms return before any of these
branches, so their stores, carrier timings and hunt yields remain exactly at
the pre-hazard baseline. A three-part save test restores a real hazard block and
re-reads every consumer factor, the food ledger, building efficiency and a live
caravan deal.

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
rule. `js/world/hazard-evidence.js` adds the per-point chain
`effect → surfaces → test`; `tests/world/hazard-coverage.test.js` checks all
102 entries against the real source, the shipped panel/index markers and the
exact test titles. `npm run spec:audit` reads `HAZARD_REQUIREMENTS` and reports
all 102 points as implemented with their consumers and tests.

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

- `node --test tests/world/hazard-coverage.test.js` — the 102-point evidence
  contract, real herd culls, `magic:rare` chains, targeted work relief,
  cursed/forbidden consumers and volcanic/economic annual consequences.
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
