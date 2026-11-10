# Named garrison and public health

**Status:** implemented, browser-verified and published on the Freebuff Sites development build on 2026-11-09.
**Production URL:** https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page
**Preview URL:** https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page
**Site ID:** `054512f6-1fcf-489c-8406-3ab4e49022e3`

This slice replaces two label-only areas with simulations that own real people, real resources and real consequences. Barracks and stables now produce and maintain a named garrison. Health now connects water, waste, immunity, outbreaks, healers, medicine, trade and mortality instead of exposing a single disease meter.

## Why the two systems belong together

A soldier is a resident first: recruiting removes that person from the civilian workforce and the population count. A healer is also a resident, with a name, age, traits and competence. Soldiers and healers therefore compete with farms, workshops and households for the same people. Food and gold spent on drill, equipment, horses or medicine are not available for construction or diplomacy.

The two systems also feed each other:

- A garrison consumes food and can lose morale when the realm is short of it.
- Sick and wounded soldiers cannot train and fight below full power.
- Sanitation, healers and medicine reduce annual mortality and outbreak severity.
- Quarantine protects health but applies a real penalty to market purchases and sales.
- Death removes a soldier from active readiness, stops a healer's coverage immediately and writes a memorial; the healer entry is pruned at the next appointment or annual audit.
- Combat records wounds and casualties back into the individual service record.

## Barracks, stables and the named garrison

The opening realm includes one completed barracks and one completed stable, so the system is playable in year one without a hidden construction prerequisite. The starting garrison contains two named guards. Warhorses remain a paid decision.

### Recruitment

- Adult residents appear in the recruitment list with name, age and occupation.
- Recruitment costs **18 gold and 12 food**.
- The chosen person becomes a real `TYPE.GUARD` entity; the person is retained, not replaced by a generic counter.
- The new guard leaves the civilian population and workforce.
- A full barracks or an invalid, dead or underage candidate is refused without spending anything.
- The action writes a chronicle entry and a personal memory.

### Drill over time

Training is a timed order, not an instant stat purchase. A drill lasts 10–90 days and records its instructor, start tick, duration, completion tick and success chance on that soldier.

Duration and success depend on:

- the marshal's competence (the appointed Marshal, or the garrison drillmaster when the office is vacant),
- the season: spring and especially winter are slower than summer,
- food availability,
- the soldier's morale,
- current equipment,
- rank,
- whether the realm is at war.

A successful drill raises sessions, equipment and morale and can promote the soldier through `recruit → soldier → veteran → elite`. A failed drill lowers morale. A soldier already in training, ill or wounded refuses a new order.

### Equipment, horses and service

- Equipment costs wood and gold and adds 14 equipment points up to the cap.
- Equipment raises combat power and armour.
- A warhorse costs **22 gold and 10 food** and requires stable capacity.
- Mounting requires a trained soldier and adds 18% power plus armour, but increases annual food and gold upkeep.
- Demobilising returns the person to civilian life; it does not delete their service history.

### Annual muster

Once per realm year the garrison settles a real payroll:

- every soldier needs gold and food; mounted soldiers and unassigned horses need more,
- stable pannage can cover part of the feed before royal food is spent,
- unpaid need lowers morale; severe hardship can cause desertion,
- service years, last paid year, morale and deserters are recorded,
- the bounded history keeps the latest 24 musters,
- the current payroll exposes need, paid amount, pannage days, morale and desertions.

Combat uses the live record: `getSoldierPower()` combines base type, rank, equipment, morale, mount and wounds. Victories add battles and kills; wounds remove the soldier from full readiness for 90 days; a fatal result calls `recordMilitaryCasualty()` and writes the loss into the garrison history.

### Garrison limits

| Limit | Value |
|---|---:|
| Garrison capacity per barracks | 8 |
| Stable capacity | 4 horses |
| Drill interval | 10 simulation ticks |
| Muster history | 24 records |

## Public health as a chain

Health state now carries sanitation, water coverage, per-resident immunity, outbreak severity and containment, named healers, medicine stock and price, quarantine, annual audit history and mortality statistics.

### Sanitation and water

- Wells raise water coverage automatically.
- Sanitary works cost **18 wood, 12 stone and 6 gold**, once per year.
- A completed programme raises sanitation by 18, adds latrines and water points and lowers stored waste.
- Waste and crowding erode sanitation over time.
- Low sanitation raises transmission risk; high sanitation lowers it.
- Sanitation is displayed as a live score and is used by the annual mortality audit.

### Outbreaks and immunity

An outbreak can seed one resident and then spread through two bounded paths:

1. **Household transmission** checks susceptible people who share a roof with an infectious person.
2. **Community transmission** checks at most one additional resident per health interval, reduced by sanitation, quarantine and healer coverage.

Recovery raises personal immunity. Higher immunity reduces the chance of reinfection. Quarantine lasts 240 days and is available at three levels:

| Level | Trade penalty |
|---|---:|
| 1 | 9% |
| 2 | 18% |
| 3 | 27% |

The market applies this penalty to real buy and sell prices. Quarantine also lowers morale and reduces household and community transmission.

Health processing runs every 20 ticks. When no outbreak is active, `updateHealth()` returns after the quarantine-expiry check and does no household or community pass. There is no per-frame work and no per-tile scan.

### Named healers

A completed temple or clinic creates two healer posts. A healer is a real adult resident, not a generic bonus.

- Appointment costs 12 gold.
- The candidate must be alive, adult and not currently ill.
- Competence is derived from compassion, discipline, curiosity and age.
- The panel shows the healer's name, competence, appointment year and patients treated.
- Healer coverage reduces community transmission and improves treatment relief.
- Dismissal removes the office but keeps the person and their history.
- A dead healer stops counting toward coverage immediately and is pruned from the active list at the next appointment or annual audit.

### Medicine economy

- Brewing consumes **3 herbs**, up to 2 lichen and **4 gold** and produces 5–8 doses, capped at 60.
- Herbs and lichen come from the shared forest-gathering ledger, so forest work, foraging and medicine are one economy.
- Medicine is consumed automatically during an outbreak, up to two doses per health interval.
- Manual treatment uses up to four doses, shortens illness and raises immunity.
- Selling doses earns gold at the current medicine price but leaves less protection for the next outbreak.
- Brewing lowers the price; scarcity and outbreak pressure raise it.
- The market exposes a real medicine price rather than a decorative number.

### Mortality and annual audit

Mortality is resolved once per realm year, not per frame. Risk responds to age, occupation, current illness, immunity, sanitation, healer coverage and medicine stock. The audit records:

- deaths by age group: child, adult, elder,
- deaths by occupation,
- the latest named deaths with age, group, occupation and cause,
- a bounded annual audit history.

A death removes the person from households, workforce, garrison and healer posts, creates the existing memorial record and notifies surviving family. The health ledger and the existing mortality system share the same event path, so a death cannot be counted twice.

## Player-facing controls

The management window now has two additional tabs:

- **MILITARY** — recruit a named resident, train a soldier, equip, buy a horse, mount, demobilise, inspect readiness, payroll, casualties and desertions.
- **HEALTH** — improve sanitation, inspect water and immunity, order or lift quarantine, appoint or dismiss a healer, brew/treat/sell medicine, inspect mortality and the annual audit.

All controls are ordinary buttons or selects in the existing management panel. Refused actions return a visible reason and do not mutate state.

## Integration points

| System | Connection |
|---|---|
| `economy.js` | Population food consumption, military payroll accounting and health-driven labour loss share the daily ledger. |
| `combat.js` | Soldier power, armour, wounds, victories and casualties come from the named military record. |
| `mortality.js` | Sanitation, immunity, healers and occupation feed annual risk; `recordHealthMortality()` writes age and occupation statistics. |
| `market.js` | Quarantine applies a real trade penalty; medicine has a live price and sale value. |
| `forest-gathering.js` | Herbs and lichen feed brewing, connecting forest stewardship to public health. |
| `entities.js` | The opening realm contains a barracks and stable; recruitment creates real guard entities. |
| `simulation.js` | Military runs before combat; health runs on its own 20-tick cadence. |
| `court.js` | The Marshal improves drill and the Chaplain improves containment through the existing court modifiers. |
| `main.js` / `save-validation.js` | Military and health state are serialized, normalized and validated on load. |

## Save compatibility

The save schema is **5**. Military and health are additive domains:

- `state.military` stores horses, trained/loss/desertion totals, last muster year, bounded history and casualties.
- Each guard stores a `military` record: rank, sessions, morale, equipment, training timestamps, instructor, wound state, battles, kills and mounted state.
- `state.health` stores sanitation, immunity, outbreak state, named healers, medicine counters and price, quarantine, mortality and bounded audit history.
- `normalizeMilitaryState()` and `normalizeHealthState()` repair missing or legacy values before use.
- `save-validation.js` rejects structurally invalid military or health snapshots instead of partially applying them.
- Old saves without these fields load with safe defaults; the opening-world barracks/stable remain ordinary entities rather than save-version assumptions.

## Verification on this head

- `npm test`: **644/644 tests passed**, 0 failed; syntax and relative-import checks passed for **94 source files** and **185 referenced UI ids**.
- Focused military/health tests: **8/8 passed**.
- Browser E2E: passed; the real controls recruited a named resident, started a timed drill, built sanitary works, ordered quarantine, appointed a named healer and brewed medicine. Save/load restored 4 named soldiers, the healer, sanitation, medicine history and mortality totals.
- Deterministic campaign: **25 years**, **10,040 ticks**, **13/13 ambitions**, **4.093 ms/tick** (**49.4 s** total).
- `git diff --check`: clean.

## Hosted deployment

- Preview deployment receipt `a3be04bf-8291-4fa3-bb8d-7d90dcedebbd` succeeded; deployed 2026-11-09T21:31:20.058Z; `published:true`.
- Production deployment receipt `5e312fca-97b9-441e-9ee1-b8b3b03b707b` succeeded; deployed 2026-11-09T21:34:10.718Z; `published:true`.
- Production and preview returned HTTP **200** for the document, `military.js`, `health.js`, `main.js`, the stylesheet and a representative SVG.
- The deployed `military.js` and `health.js` SHA-256 values match the local files exactly.
- Cloud-browser checks executed the new actions on both environments. Production result: 3 soldiers, one active drill, sanitation 39, quarantine level 1, a named healer and 7 medicine doses; the goods audit remained balanced. No page or console errors were recorded. Only the browser's software-WebGL `ReadPixels` performance warnings appeared.

## Deliberate limits

This is not a full unit-manoeuvre wargame or an epidemiological contact network. Soldiers do not receive individual pathfinding orders on the world map, and battles still resolve through the existing combat model. Equipment is an abstract condition score, not an item-by-item inventory. Medicine treats illness but does not simulate pharmacology. The health model is household- and community-bounded rather than a full agent contact graph. These limits are intentional and keep the annual and per-interval loops bounded on low-end devices.
