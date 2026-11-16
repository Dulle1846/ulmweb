# Kings & Cards — 250-Year Endless Realm Audit

Seed: **20261215** · Climate: **snow** · Era: **common-weal** · Years: **250**
Result: **PASS** · Game over: **false**

| Measurement | Result |
| --- | --- |
| Campaign ticks | 100,040 |
| Final year / tick | 251 / 100,161 |
| Endless age | 11 (next age year 276) |
| Population | 63 |
| Living entities | 117 |
| Eternal deeds | 12 |
| Completed ambitions | 13 / 13 |
| Tick cost | 1.941 ms |
| Elapsed | 148,467 ms |
| Collapses / rescues / keep holds | 0 / 0 / 0 |

## Invariants

| Check | Result |
| --- | --- |
| horizon | PASS |
| noGameOver | PASS |
| endlessEnabled | PASS |
| ageMatchesCalendar | PASS |
| ageProgress | PASS |
| bestYear | PASS |
| historyBounded | PASS |
| entityCap | PASS |
| uniqueIds | PASS |
| finiteCoordinates | PASS |
| resourcesFinite | PASS |
| moraleRange | PASS |
| campaignNotTerminal | PASS |

The 250-year run uses the real fixed-step simulation, starting kingdom, construction, logistics, events, royal house, ambitions and endeavours. Only the terrain-prerender canvas is stubbed. Reproduce with `ENDLESS_YEARS=250 npm run test:endless`.
