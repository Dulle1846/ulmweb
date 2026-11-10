# Faith, culture and justice

**Status:** implemented, browser-verified and published on the Freebuff Sites development build on 2026-11-09.
**Production URL:** https://site-4652b62d6d624022a45a118e0782bcb1.freebuff.page
**Preview URL:** https://site-79c6673d168e4265a2d5609f9d77a1cb.freebuff.page
**Site ID:** `054512f6-1fcf-489c-8406-3ab4e49022e3`

Two annual simulations now run inside the living realm. **Faith & culture** owns named clergy, congregations, shrines and temples, festivals, pilgrimages, culture budgets and heresy. **Justice & order** owns named judges, courts and prisons, emergent crime, trials, five sentences, legal codes, charters and corruption.

Both systems run once per realm year, not per tick. Both operate on real named residents and real resources. Neither is a decorative meter: their modifiers are read by the existing tax, trade, morale, legitimacy, migration, mortality, military and desertion systems, and their spending is written into the central goods book.

The starting realm ships with one completed **shrine** and one completed **court of law**, so both systems are usable in year one without a hidden prerequisite. The **prison** is deliberately not pre-built: prison capacity remains a real construction decision.

## Why the systems belong together

A cleric and a judge are residents first. Appointing either removes that person from the candidate pool of every other office. A death removes the office holder's effect immediately: the next snapshot or annual audit prunes the seat and records a vacancy. A replacement can then be appointed.

The two systems also pull in opposite directions, which is the point:

- A funded congregation and a festival raise morale, legitimacy and tax reach; heresy lowers all three and pushes settlers away.
- A strong court lowers crime and desertion and raises trade; a corrupt or underpaid bench raises crime and loses gold.
- Courts and prisons compete with shrines and temples for the same stone, wood, gold and annual salaries.
- Hunger and unemployment create crime; crime depresses trade and morale; a poor realm cannot fund either system well.

## Faith & culture

### Named clergy

Every cleric is a real `TYPE.VILLAGER` with a person profile. The appointment refuses the dead, the underage, anyone already holding another office and anyone already serving the congregation.

| Property | Rule |
|---|---|
| Appointment cost | 10 gold |
| Clergy capacity | `min(8, temples × 2 + shrines × 1)` |
| Congregation | `min(population, temples × 10 + shrines × 4)` |
| Coverage | `sum(clergy competence) / max(12, population × 12)`, clamped to 0–1 |
| Candidate list | up to 12 adult residents, sorted by name |

**Competence** is derived from the person's traits and experience:

`piety × 0.44 + compassion × 0.20 + discipline × 0.18 + sociability × 0.10 + experience × 0.08`, clamped to 12–98.

**Conviction** is chosen from the person's strongest disposition and is stored on the office, not rerolled every year:

| Conviction | Emphasis | Effect |
|---|---|---|
| Orthodox | Rites and hierarchy | Legitimacy and military morale |
| Reformist | Temples serve the living | Tax reach and trade |
| Mystic | Comfort for the sick and dying | Lower mortality |
| Ascetic | Poverty and service | Morale and immigration |

A conviction's share of the total clergy competence determines its weight. A single cleric therefore matters, and a congregation of mixed convictions produces mixed effects.

### Buildings and capacity

| Structure | Type | Cost | Capacity |
|---|---:|---|---|
| Shrine | 70 | 6 wood, 18 stone, 4 gold | +1 clergy post, 4 congregation |
| Temple | existing | existing temple cost | +2 clergy posts, 10 congregation |
| Court of law | 71 | 30 wood, 24 stone, 10 gold | +2 judicial seats |
| Prison | 72 | 22 wood, 30 stone, 8 gold | +1 judicial seat, 8 prison places |

Only completed structures count. A construction site does not create a post, a congregation or a court.

### Culture budget

The culture budget is paid once per year from the treasury. An unpaid budget raises religious tension by 4 and lowers morale by 0.6 for that year.

| Level | Annual gold | Morale | Legitimacy | Heresy relief |
|---|---:|---:|---:|---:|
| None | 0 | 0 | 0 | 0 |
| Modest | 6 | +0.35 | +0.20 | 2 |
| Generous | 14 | +0.85 | +0.45 | 5 |
| Splendid | 24 | +1.40 | +0.75 | 9 |

### Festivals

A festival may be held once per year. It spends real food and gold, writes the expense into the goods book, raises morale and legitimacy, creates market demand for one year and relieves heresy.

| Festival | Cost | Morale | Legitimacy | Market demand | Heresy relief |
|---|---|---:|---:|---:|---:|
| Harvest festival | 24 food, 8 gold | 6 | 1.2 | 18% | 5 |
| Rite of reconciliation | 8 food, 14 gold | 3.5 | 1.6 | 8% | 14 |
| Founders' procession | 18 gold | 4.5 | 1.0 | 12% | 7 |

Morale and legitimacy scale with coverage: `0.7 + coverage × 0.5 + ascetic share × 0.3`. Attendance is recorded and displayed. Festival demand is read by the market for one year and then expires.

### Pilgrimage

A pilgrimage costs **14 gold and 12 food** and resolves in the following year. It is a real journey with real returns:

- pilgrims are calculated from population, coverage and congregation size,
- pilgrim spending adds gold directly to the treasury,
- the realm gains a trade bonus of `0.04 + coverage × 0.04` for one year,
- if a completed house has a free bed, food is above `population × 0.9` and morale is at least 40, one pilgrim stays as a new named resident,
- the result, pilgrim count, gold and settler are written into the faith history.

### Heresy and tension

Tension is recalculated annually from real pressure:

`(100 − legitimacy)/100 × 0.35 + hunger × 0.30 + war × 0.12 + (1 − coverage) × 0.28 + tax pressure × 0.15`

Relief comes from coverage, culture budget and a festival held this year. Tension changes by `(pressure − relief) × 18` points per year.

| Level | Tension | Consequence |
|---|---:|---|
| United | 0–24 | No penalty |
| Murmurs | 25–49 | Small morale, legitimacy, tax and trade penalties |
| Dissent | 50–74 | Stronger penalties, migration falls |
| Heresy | 75–100 | Maximum penalties and unrest |

The crown has two answers:

- **Reconcile** — 12 gold and 10 food; relieves `16 + coverage × 18 + orthodox share × 6` tension, raises morale slightly and improves legitimacy and clergy standing.
- **Suppress** — 10 gold; removes 30 tension but costs 4 morale and lowers legitimacy, clergy and commons standing.

Tension lowers morale by `penalty × 2.5`, legitimacy by `penalty × 1.2` and clergy standing by `penalty × 1.5` every year.

### Faith effects read by other systems

| Modifier | Formula |
|---|---|
| Tax efficiency | `max(0.72, 1 + coverage × 0.03 + budget level × 0.004 + reformist share × 0.02 − heresy × 0.12)` |
| Trade factor | `max(0.70, 1 + pilgrimage trade + festival demand × 0.06 + coverage × 0.012 + reformist share × 0.01 − heresy × 0.10)` |
| Mortality relief | `max(0.82, 1 − (coverage × 0.05 + mystic share × 0.04 + budget level × 0.005))` |
| Military morale | `coverage × 6 + orthodox share × 2` |
| Annual morale | `budget morale + coverage × 0.9 + ascetic share × 0.5 − heresy × 3` |
| Annual legitimacy | `coverage × 0.45 + orthodox share × 0.3 + budget legitimacy − heresy × 1.3` |
| Migration factor | `clamp(1 − heresy × 0.5 + coverage × 0.06 + ascetic share × 0.04, 0.35, 1.2)` |
| Unrest | `heresy tension` |

These feed economy taxes, market trade and festival demand, annual mortality, military morale and power, and the population migration gate.

## Justice & order

### Named judges

A judge is a real adult resident with a name, competence and integrity. Appointment costs 10 gold and refuses residents who already hold a court, military, health or clerical office.

| Property | Rule |
|---|---|
| Appointment cost | 10 gold |
| Annual salary | 6 gold per judge |
| Judicial capacity | `min(6, courts × 2 + prisons × 1)` |
| Prison capacity | `prisons × 8` |
| Candidate list | up to 12 adult residents, sorted by competence |

**Competence** drives verdict quality:

`discipline × 0.34 + curiosity × 0.24 + compassion × 0.20 + ambition × 0.12 + experience × 0.10`, clamped to 12–98.

**Integrity** drives corruption:

`(100 − greed) × 0.44 + compassion × 0.28 + discipline × 0.18 + piety × 0.10`, clamped to 5–100.

A judge with low integrity skims part of a harsh sentence and is more likely to be removed by an investigation. Salaries are paid annually. An unpaid bench loses integrity and morale, and can lose gold to corruption.

### Emergent crime

Crime is not scripted. It is calculated every year from the live realm:

- inequality, measured by the unemployed share of residents,
- hunger, measured by `foodShortage / foodDemand` in the latest ledger,
- war, from an active raid or a war treaty,
- quarantine level,
- unemployment count,
- judge coverage and granted charters, which reduce crime.

Base rate:

`0.03 + inequality × 0.30 + hunger × 0.34 + war × 0.10 + quarantine × 0.08 + unemployed × 0.002 − judgeCoverage × 0.22 − charters × 0.02`

The legal code multiplies this base. A persistent case offset from previous verdicts is added, then the result is clamped to 1–90%.

| Level | Rate |
|---|---:|
| Low | below 8% |
| Watchful | 8–17.9% |
| High | 18–31.9% |
| Lawless | 32% and above |

Each year the court generates up to three new cases, capped at six pending cases. The expected number is `crimeRate × 8`; the fractional part is resolved with the dedicated `justice` random stream. Defendants are real named adults, and the crime type follows the dominant cause:

| Cause | Crimes |
|---|---|
| Hunger | Grain riot, poaching |
| War | Desertion |
| Quarantine | Quarantine breach |
| Inequality | Theft |
| Unemployment | Market fraud |

### Trials and sentences

Only a completed court and at least one appointed judge can try a case. The best available judge presides. Verdict quality is `(competence × 0.7 + integrity × 0.3) / 100`.

| Sentence | Effect |
|---|---|
| Fine | Gold to the treasury, scales with severity and quality; lowers future crime |
| Forced labour | Wood and stone to the crown; lowers crime; morale −0.8 |
| Banishment | Removes the defendant from the realm; lowers crime; morale +0.4 |
| Galley service | Gold now, removes the defendant; lowers crime; morale −1.2 |
| Acquit | Raises morale and legitimacy; raises future crime |

Banishment and galley service create a real memorial and remove the person from the population, workforce, offices and households. A judge with integrity below 45 may skim part of a harsh sentence, recorded as corruption loss.

### Legal codes

Changing the code requires a completed court, an appointed judge, 20 gold and at most one change per year.

| Code | Tax | Trade | Morale | Migration | Desertion | Crime | Legitimacy |
|---|---:|---:|---:|---:|---:|---:|---:|
| Customary | 1.00 | 1.00 | 0 | 1.00 | 1.00 | 1.00 | 0 |
| Royal | 1.06 | 0.97 | −0.5 | 0.92 | 0.86 | 0.84 | +0.5 |
| Guild | 0.98 | 1.07 | −0.1 | 1.03 | 1.05 | 1.10 | −0.2 |
| Common | 0.95 | 1.00 | +0.7 | 1.10 | 0.95 | 0.90 | +0.3 |

### Charters

A realm can hold up to four charters and grant at most one per year. A completed court is required.

| Charter | Cost | Effect |
|---|---|---|
| Guild charter | 20 gold, 10 wood | Trade +5%, tax +2%, crime −4%, morale +0.4 |
| Town charter | 16 gold, 10 stone | Tax +4%, migration +6%, crime −2%, morale +0.25 |

### Corruption

Every year each judge's corruption risk is `(55 − integrity) / 55`. A judge with risk above zero can skim gold from the treasury; the loss is recorded, integrity falls and the bench's corruption level rises.

- **Investigate** costs 8 gold and can be used once per judge per year.
- A judge with integrity below 52 is removed, and `10 + (52 − integrity) × 0.8` gold is recovered.
- A judge at or above 52 is cleared, but the inquiry costs morale and legitimacy.

### Justice effects read by other systems

| Modifier | Formula |
|---|---|
| Tax efficiency | `max(0.70, law tax × (1 + charter tax) × (1 − corruption × 0.08))` |
| Trade factor | `max(0.70, law trade × (1 + charter trade) × (1 − crime × 0.15))` |
| Annual morale | `law morale + charter morale − crime × 4 − corruption × 0.5` |
| Annual legitimacy | `0.35 + judgeCoverage × 0.45 − crime × 0.8` |
| Migration factor | `clamp(law migration × (1 − crime × 0.35) + town charters × 0.06, 0.40, 1.25)` |
| Desertion factor | `clamp(law desertion × (0.85 + crime × 0.5), 0.50, 1.80)` |
| Prison capacity | `prisons × 8` |

These feed taxes, market trade, morale, legitimacy, population migration and military desertion. Crime itself reads health quarantine, war, food shortage and unemployment, so a plague, a war or a harvest failure visibly increases the court's workload.

## Integration points

| System | Connection |
|---|---|
| `simulation.js` | The yearly block calls `updateFaith()` and `updateJustice()` before edicts and mortality. |
| `economy.js` | Faith and justice tax multipliers are applied to the real ledger; festival and charter effects are included. |
| `market.js` | Festival demand, pilgrimage trade, crime and charters change buy/sell terms. |
| `mortality.js` | Mystic coverage and the faith mortality relief reduce annual death risk. |
| `military.js` | Orthodox coverage raises morale; justice desertion and crime affect retention and power. |
| `population.js` | Heresy and crime raise the morale gate for immigration; town charters and ascetic coverage lower it. |
| `health.js` | Quarantine raises crime; the faith audit reads the same health state. |
| `events.js` | The annual audit and heresy/crime history write into the shared event log. |
| `entities.js` | The starting realm contains a completed shrine and court; all three new structures are real buildings. |
| `main.js` / `save-validation.js` | Faith and justice state are serialized, normalized, validated and migrated. |

## Save schema 6

`SAVE_SCHEMA_VERSION` is **6**. A save now includes top-level `faith` and `justice` states, alongside the existing world, people, city, health and military records.

- `normalizeFaithState()` rebuilds missing clergy, festival, pilgrimage, heresy, budget and history fields with safe defaults.
- `normalizeJusticeState()` rebuilds judges, law code, charters, cases, crime, corruption, sentence totals and history.
- Clergy and judges are capped at 8 and 6; pending cases at 6; each history at 24 entries (the UI shows the newest 16).
- Invalid faith or justice payloads are rejected by `validateFaithState()` / `validateJusticeState()` before the live realm is touched.
- Saves from schema 4 and 5 are migrated additively: absent faith/justice blocks become normalized empty states, and existing entities, people, resources and offices are preserved.
- A save/load round trip restores named clergy, named judges, convictions, competences, integrity, charters, legal code, pending cases, sentence totals, festivals, pilgrimages, heresy and both histories exactly.

## Player-facing controls

The management window now has **16 tabs**, including:

- **FAITH** — appoint or dismiss clergy, inspect conviction/competence/coverage, choose one of three festivals, fund a pilgrimage, set the culture budget, reconcile or suppress heresy, and read the annual audit and history.
- **JUSTICE** — appoint or dismiss judges, inspect competence/integrity, amend the legal code, grant charters, try each pending case with one of five sentences, investigate corruption, and read crime causes, audit and history.

Every control is a normal button or select in the existing command deck. Refused actions return a visible reason and do not mutate state. Candidate names, costs, effects and current totals are shown before the action is taken.

## Performance

- `updateFaith()` and `updateJustice()` run once per realm year; the tick loop does no annual work.
- Modifier blocks are cached and only recomputed when their signature changes (tick, revision, buildings, population, laws, charters, crime context, health and war state).
- No per-tick entity scans, no per-frame allocations and no new render loop were added.
- The 25-year campaign completes **10,040 ticks** and **13/13 ambitions** at **4.545–4.546 ms/tick** across two consecutive runs (50.6–52.7 s). The earlier pre-slice reading was 4.093 ms/tick; the absolute cost remains under 5 ms and the campaign result is unchanged.

## Verification

| Check | Result |
|---|---|
| Focused faith/justice tests | **13/13 pass** (`tests/systems/faith-justice.test.js`) |
| Full Node suite | **657/657 pass** (47.5 s) |
| Syntax, imports and UI ids | **96 source files**, **185 referenced UI ids**, clean |
| Browser E2E | **pass** — builds a shrine (70) and court (71) through the real build menu, appoints a named cleric and judge, holds a festival, tries a real case, and round-trips save/load |
| 25-year campaign | **13/13 ambitions**, 10,040 ticks, 4.545–4.546 ms/tick |
| Live production | year 1, 21 residents, faith and justice states active, 1 shrine and 1 court, 16 tabs, FAITH (11 controls) and JUSTICE (7 controls) panels render; **0 console messages**, all requests 200/304 |
| Live preview | year 1, 21 residents, both states active, 1 shrine and 1 court, 16 tabs; only four software-WebGL `ReadPixels` warnings, **no errors** |

The browser E2E intermediate record from the passing run:

```json
{"shrineSite":{"id":"ec29kg-1g","stage":0},"courtSite":{"id":"ec29kg-1h","stage":0},"faith":{"clergy":1,"history":2,"festival":"harvest"},"justice":{"judges":1,"history":4,"cases":3,"fines":1}}
```

## Deployment

The runtime-only package is `artifacts/kings-and-cards-deploy/` with `worker.js`, `manifest.json` and `public/` containing only `index.html`, `css/`, `js/` and `assets/`. It contains **126 files / 2.3 MB**, with no Markdown, source maps, tests, JSON manifests or hidden files.

| Environment | Receipt | Completed (UTC) | Published |
|---|---|---|---|
| Preview | `94e3a656-e8af-415b-9a3a-2ff0931344cc` | 2026-11-09 22:17:04 | `true` |
| Production | `c17585d4-9b5e-4a89-a3b9-8fcd7544db49` | 2026-11-09 22:17:11 | `true` |

Both deployments used the same manifest and the same request hash. Deployed `js/systems/faith.js` and `js/systems/justice.js` SHA-256 hashes match the local files.

Live evidence: [faith and justice panel on production](../artifacts/faith-justice-live.png).

## Reproduction

```bash
cd game
node --test tests/systems/faith-justice.test.js
npm test
node scripts/long-campaign.mjs
LD_LIBRARY_PATH="$PWD/.browser-libs/root/usr/lib/x86_64-linux-gnu:$PWD/.browser-libs/root/lib/x86_64-linux-gnu" \
FONTCONFIG_FILE="$PWD/.browser-libs/fonts.conf" \
ALSA_CONFIG_PATH="$PWD/.browser-libs/root/usr/share/alsa/alsa.conf" \
E2E_SOFTWARE_GL=1 node tests/browser/run-e2e.mjs
```
