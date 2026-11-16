# Kings & Cards — 500-Year Endless Realm Audit

Seed: **20261215** · Climate: **snow** · Era: **common-weal** · Years: **500**
Result: **PASS** · Game over: **false**

| Measurement | Result |
| --- | --- |
| Campaign ticks | 200,040 |
| Final year / tick | 501 / 200,161 |
| Endless age | 21 (next age year 526) |
| Population | 56 |
| Living entities | 110 |
| Eternal deeds | 16 |
| Completed ambitions | 13 / 13 |
| Tick cost | 1.346 ms |
| Elapsed | 296,051 ms |
| Collapses / rescues / keep holds | 4 / 4 / 0 |

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

The 500-year run uses the real fixed-step simulation, starting kingdom, construction, logistics, events, royal house, ambitions and endeavours. Four morale collapses were recovered without a game-over, proving the endless recovery path under load. Only the terrain-prerender canvas is stubbed. Reproduce with `ENDLESS_YEARS=500 npm run test:endless`.
