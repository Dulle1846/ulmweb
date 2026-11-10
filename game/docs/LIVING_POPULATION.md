# Living population and households

**Status:** implemented on the `3.10.0-dev` line and verified on the hosted builds of 2026-11-10.
**Scope:** individual citizens, households, the annual lifecycle census, civic modifiers, save compatibility and the PEOPLE management tab.

## Purpose

The realm no longer tracks only an aggregate population number. Every living resident now has a persistent civic record, and every completed house has a household record. The existing `person` profiles remain the canonical identity; the population register is additive and is synchronized from the same entities the rest of the simulation already uses. It does not create a second, competing population model.

The register lives in `state.population` and is implemented in [`js/systems/population-register.js`](../js/systems/population-register.js).

## Citizen record

Each citizen stores:

| Field | Meaning |
|---|---|
| `id` | Canonical person id, shared with the entity and person profile |
| `name`, `species`, `sex`, `ageYears`, `role` | Identity copied from the person profile |
| `origin` | `Founding dynasty`, `Realm-born`, `Born in the realm` or `Settled from beyond the realm` |
| `householdId` | `house:<x>:<y>` for a completed house, `crown:household` for the royal household |
| `profession`, `status` | Human-readable profession and one of `royal`, `soldier`, `healer`, `clergy`, `scholar`, `child`, `elder`, `worker`, `unemployed` |
| `faithId`, `faith`, `traditionId`, `tradition` | The realm religion and tradition from the founding block |
| `healthStatus`, `healthScore`, `immunity` | `healthy`, `wounded` or `ill`, plus a bounded 0–100 score |
| `happiness`, `loyalty` | Bounded 0–100 civic values derived from needs, morale, legitimacy, status, health and household security |
| `talent` | `{ score, focus, traits }`, derived from the two traits that matter for the profession |
| `wealthShare`, `householdWealth` | The member's share of, and access to, household wealth |
| `joinedYear`, `lastUpdatedYear` | Census bookkeeping |
| `civilian`, `soldier`, `royal` | Classification flags. The crown is royal and civilian, never a soldier |
| `professionHistory`, `events` | Bounded records of profession, status and health transitions |

The first census uses the founding block for faith and tradition. A later religion change is reflected on the next annual census, because those values are read from the same realm identity state.

## Household record

A household stores its id, tile position, building type, capacity, member ids, head, wealth, average loyalty and happiness, formation year, last update year, recorded kinship relations and a bounded annual history. Household wealth is capped at 5,000 gold.

Wealth is accumulated from employed members and their vocational talent, then shared:

- income: `employed × (1.4 + talent / 100 × 0.8) + members × 0.15`
- upkeep: `members × 0.55`
- annual update: `wealth × 0.9 + income - upkeep`

Household security adds up to 6 points of happiness and loyalty to every member, so a solvent household is a real civic advantage rather than a display value. The crown household has a capacity of 12 and is never merged into a commoner house.

## Annual census

`updateCitizenRegister()` is called once per realm year from the simulation, immediately after the existing population update. It is not called per frame or per tick. A second call in the same year is a no-op and returns the live register before any normalization, so the per-tick call costs a single numeric comparison.

The census is deterministic:

- entities are ordered by person id, not by array position or random draw;
- no `Math.random` call exists in the register;
- the same state and year produce the same citizens, households and totals.

Lifecycle events are resolved from the authoritative systems and recorded by the register:

- **Birth** — the annual births system adds a real villager with `civicOrigin = "born-in-realm"`; the next census records the child, its household and its origin.
- **Childhood to adulthood** — profession and status are re-derived each year from species maturation, life stage, job, workplace and age; a change is written to `professionHistory`.
- **Work** — the profession follows the actual `job` or workplace building, and talent is scored from the traits that profession uses (for example Farmer: discipline and patience; Soldier: courage and discipline; Healer: compassion and curiosity).
- **Partnership and household formation** — married or partnered residents living in different houses are merged into one completed house when capacity allows. The kinship graph is read from the person profiles, and partner, parent/child and sibling links are stored on the household.
- **Illness** — the register reads `illnessUntilTick`, severity and current hit points, producing `ill`, `wounded` or `healthy`.
- **Ageing and death** — the existing mortality system removes entities; the next census drops their records and rebuilds the affected household. No dead resident remains in the list.
- **Migration** — one low-loyalty adult may leave only when morale is below 18 and food per civilian is below 0.45, or morale is below 12. The departure is recorded in `departures` and `economy.emigration`. Normal campaigns do not consume this path.
- **Settlement** — new settlers carry `civicOrigin = "settler"` and appear with their household on the next census.

The register is bounded so a large realm cannot turn the census into an unbounded scan:

- 420 registered citizens
- 900 registered households
- 8 citizen history entries and 12 household history entries
- 25 annual population snapshots and 12 departure records
- 12 members in the crown household

## Effects on the rest of the simulation

`getCitizenModifiers()` reads the stored totals and returns bounded modifiers. When the register is empty, every modifier is neutral, which keeps old saves and pure-function tests unchanged.

| Modifier | Range | Consumed by |
|---|---|---|
| `taxEfficiency` | 0.96–1.05 | `economy.js` tax income |
| `productivity` | 0.97–1.04 | `economy.js` building output |
| `legitimacyPressure` | −0.08–+0.08 | `politics.js` legitimacy |
| `militaryQuality` | 0.97–1.04 | `military.js` soldier power |

Loyalty and employment drive the tax modifier, average talent and health drive productivity, loyalty and happiness drive legitimacy pressure, and the talent of the actual named garrison drives military quality. The crown is deliberately excluded from the soldier pool: a royal `KNIGHT` entity is a court figure, so the sovereign's courtly traits cannot stand in for the garrison. A dedicated regression test locks this in.

Because the modifiers are read on the existing economy, politics and military paths rather than through a parallel loop, the same citizen data feeds population, workforce, tax base, recruitment and legitimacy.

## Save compatibility

Save schema 7 carries `population` additively as part of the snapshot. On save, `serializePopulationState()` produces a plain JSON record. On load:

1. `normalizePopulationState()` accepts an absent, partial or malformed register and clamps every value to its legal range.
2. `initializePopulationRegister()` synchronizes the register from the live entities and completed houses.
3. Old saves without a register therefore load without a crash and are plausibly populated from the existing aggregate: houses become households, villagers and named residents become citizens, and the current year becomes the first census year.

`save-validation.js` validates the population section. A malformed household or citizen record is repaired rather than rejected. Old saves are not forced to invent citizens when no entities exist: the register stays empty until a realm exists.

## PEOPLE panel

The 18th management tab, **PEOPLE**, is implemented in [`js/presentation/population-panel.js`](../js/presentation/population-panel.js) and wired through `management-ui.js`.

It shows:

- a live overview of citizens, households, average age, employed civilians, loyalty, happiness, births and deaths;
- the current tax, building-output, legitimacy-pressure, soldier-quality, household-wealth and average-talent modifiers;
- the annual census year, civilian/soldier split, unhoused count and departure count;
- filters for all, children, adults, elders, workers, soldiers, unemployed, royal and unhoused;
- a search field for name, profession, household, faith, tradition and origin;
- a citizen list with profession, status, age, household, origin, loyalty, happiness, talent, health, species and sex;
- household cards with residents, head, wealth, average loyalty and happiness, and recorded relationships.

The panel reads the persistent register and filters locally; it never mutates the simulation. Contract ids include `population-overview`, `population-filter-bar`, `population-search`, `population-citizen-list` and `population-household-list`.

## Verification on this head

- Focused population tests: **8/8 pass** in `tests/systems/population-register.test.js`.
- Full Node suite: **683/683 pass**.
- Syntax, relative imports and UI ids: **101 source files, 189 referenced UI ids**, no failures.
- Deterministic 25-year campaign: **10,040 ticks, 13/13 ambitions, no game over**, final year 26.
- Campaign tick cost, pre-fix: **3.132, 3.215 and 3.212 ms/tick** across three runs (40.24 s, 39.51 s, 39.97 s). The root cause was the census entry point: `updateCitizenRegister()` normalized every citizen and household on every tick before checking whether the year had already been censused.
- Campaign tick cost, post-fix: **2.980, 3.016, 3.023, 3.025 and 3.073 ms/tick** across five runs. Min **2.980**, median **3.023**, max **3.073**; spread **0.093 ms (3.1%)**. The median is **0.039 ms (1.3%) below** the 3.062 ms baseline, and the highest run is only **0.011 ms (0.4%) above** it. All five runs: 10,040 ticks, 13/13 ambitions, no game over.
- The no-op tick now returns the live register after a single numeric year comparison; a focused assertion checks that same-year calls return the identical register object.
- Runtime package: **131 files / 2.4 MB**.

## Hosted verification

**Preview** — https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page
Receipt `4d93041d-fc21-4ddf-8cd4-74ed48a242ca`, succeeded 05:37:11–05:37:13Z on 2026-11-10; `published:true`.

- HTTP 200 for the document, `js/systems/population-register.js`, `js/presentation/population-panel.js` and `css/hud-v3.css`.
- Deployed `population-register.js` SHA-256 `5fbc0c3ffbcd011aa070120bf46cb0fcd5aabe6a4e1db120b46a48565822e9b4` and `population-panel.js` SHA-256 `f301219473797f0fdc4531eda95aff10215c2f239ade4c94a6e35de34bff4bba` match the local build.
- Cloud-browser realm **Avalon / House Vere** (seed 392657241): **22 citizens, 6 households, 22 civilians + 0 soldiers**, average age 56, 13/22 employed, loyalty 73, happiness 70, household wealth 73 gold, average talent 49, one royal (Wren Goldleaf). The SOLDIERS filter returned `0 matching · showing 0` and its empty state. Console: four software-WebGL `ReadPixels` warnings, **no errors**; no resource request failed.

**Production** — https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page
Receipt `f1f68065-3d97-4ba1-af3b-a491f70e5c75`, succeeded 05:38:43–05:38:45Z on 2026-11-10; `published:true`.

- HTTP 200 for the same four URLs; the module and stylesheet hashes match the local build (`hud-v3.css` SHA-256 `2e044b4c82b016183afb33d115a2971b1afb8f10be79a9b0d4f0d382e2ddf64b`).
- Cloud-browser realm **Avalon / House Vere** (seed 1036501655): **22 citizens, 6 households, 22 civilians + 0 soldiers**, average age 49, 12/22 employed, loyalty 72, happiness 67, household wealth 73 gold, average talent 47, one royal (Kael Longstride). The SOLDIERS filter returned `0 matching · showing 0` and its empty state. Console: **0 messages**; no failed resource requests.

### Defect found and repaired during verification

The first preview browser check showed `21 civilians + 1 soldiers` and the SOLDIERS filter returned the sovereign, whose entity type is `KNIGHT`. The profession was already `Crown`, but the soldier flag was set from the entity type alone. The register now computes `royal` first, sets `soldier = SOLDIER_TYPES.has(entity.type) && !royal`, and treats every non-soldier as a civilian. A regression test asserts that a royal `KNIGHT` is `royal: true`, `soldier: false`, `civilian: true`, that the soldier total stays 0, and that military quality stays neutral without a garrison. The rebuild was redeployed to preview, re-checked in the browser, and only then deployed to production.

A second defect surfaced in the performance verification. The simulation calls `updateCitizenRegister()` on every tick, and the function normalized every citizen and household **before** its annual early return. That turned a once-a-year census into a per-tick deep copy of the register. The stored census year is now checked first; a same-year call returns the live register object without copying, and the determinism test asserts that object identity. The pre-fix campaigns measured 3.132–3.215 ms/tick; the five post-fix runs measured 2.980–3.073 ms/tick with a 3.023 ms median, below the 3.062 ms baseline. No cap, lifecycle event, UI contract or economy/military/politics coupling was removed.

## Known limits

- The register is a civic layer over the existing person/entity systems, not a separate genealogical simulator. Births, deaths and ageing remain owned by the existing annual systems.
- Migration is deliberately a collapse-only path; normal realms do not lose citizens.
- The 420/900 caps bound the census; records beyond the limits are dropped in stored key order rather than scanned without bound.
- Tick performance is measured on a shared cloud VM. The five-run spread is recorded above rather than presented as a laboratory benchmark guarantee.
- No commit or push was performed; the work remains in the working tree.
