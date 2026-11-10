# Crown Endeavours — v3.12.0

**Status:** implemented on the `3.12.0` line and verified on 2026-11-10.
**Entry point:** `ENDEAVOURS`, the nineteenth management tab.
**Core:** `js/systems/endeavours.js`; **panel:** `js/presentation/endeavours-panel.js`.

## Why it exists

The v3.11.0 100-year audit and five player journeys all ended in the same place: the thirteen royal ambitions were complete, the eternal-deed card continued to tick, but there was no long-term project that made the court, economy, army, diplomacy and research feed one another. The realm could keep growing, yet the player had no reason to choose one direction over another. Crown Endeavours is the post-ambition layer that turns those systems into five competing, repeatable building programmes.

It is deliberately additive. It does not replace ambitions, eternal deeds, research, trade, faith, justice or the construction menu.

## The five paths

| Path | Fantasy | Projects (in unlock order) | Main realm effects |
| --- | --- | --- | --- |
| Builder | Leave a city that outlives the crown | Aqueduct, Bathhouse, Garden | Housing, health, morale, food demand |
| Warlord | Make the realm feared and secure | Arsenal, Drill Yard, Victory Column | Military power, legitimacy, morale |
| Diplomat | Bind the world with words | Chancery, Embassy, Concordat | Diplomacy, trade, legitimacy |
| Merchant | Turn every road into a ledger | Exchange, Caravan Road, Treasury | Taxes, trade, gold, food demand |
| Scholar | Carry the light past the old tree | University, Observatory, Archive | Research, health, legitimacy |

Each project has five tiers. A tier can be repeated only after the previous tier completes, and a path's later projects unlock when the earlier project reaches its first tier. In total there are fifteen projects and seventy-five possible completions, enough to keep a century busy without turning the panel into a counter.

## How a project works

- **Real cost.** Starting a project spends wood, stone, gold and sometimes food. The cost scales with the tier.
- **Named overseer.** A living resident must be appointed. The panel lists candidates with competence and conviction; the chosen resident is recorded in the project and in the realm chronicle.
- **Funding.** Thrifty, Steady or Grand changes the annual gold cost and the yearly progress. Funding can be changed while a project is active, but the cost is charged at the next annual audit.
- **Annual progress.** Progress is applied once per year from the simulation, not per frame. A project therefore has a real duration measured in years.
- **Completion.** The project pays its completion reward, applies a permanent modifier, records a chronicle entry and unlocks the next tier or project.
- **Abandonment.** A project can be abandoned; the invested resources are not refunded. The overseer returns to the civilian pool.
- **Reassignment.** An active project can swap overseer without losing progress, at the cost of a small morale hit.

## Permanent modifiers

Every completed project contributes to a cached modifier snapshot consumed by the existing systems:

- `health.js` — sanitation and health pressure
- `morale.js` — realm morale
- `economy.js` — taxes and food demand
- `military.js` — soldier power
- `diplomacy.js` — annual relation drift
- `research.js` — research rate (the cache signature includes the modifier total)
- `market.js` — trade factor
- `simulation.js` — annual `updateEndeavours()` cadence

Modifiers are capped so a long run cannot produce runaway values. The panel shows the live totals, including the source project for each effect.

## Late research

The original sixteen technologies were exhausted before the end of a scholar journey. Eight late technologies now extend the same tree:

`deep-plough`, `seed-banks`, `blast-furnace`, `printing-press`, `hospitals`, `vaccination`, `standing-bureaucracy`, `great-charter`.

They use the existing research points, scholar appointments, funding and save schema. The total is now twenty-four technologies. The scholar journey completed seventeen of them in 100 years while also finishing fifteen Endeavours, which leaves the rest of the tree as a real long-term target.

## Interface

The nineteenth management tab renders:

- the active project card with progress, years remaining, overseer, funding and abandon/reassign controls;
- five path cards with the next available project and its cost;
- the modifier summary;
- the completion history.

The panel is keyboard-reachable, uses the existing command-modal focus handling and has narrow-width rules. Browser checks at 1600×1000 and 864×1000 reported no horizontal overflow, five path cards, fifteen project cards and no console or page errors.

## Save compatibility

`state.endeavours` stores `paths`, `active`, `history` and `modifiers`. On load, `normalizeEndeavours()` accepts saves without the block, fills defaults, rejects unknown paths/projects/funding/overseer ids and rebuilds the modifier cache. Old v3.11.0 saves load with empty Endeavours; the thirteen ambitions and eternal deeds are untouched.

## Verification

- `npm test`: **705/705** passing; syntax and relative imports for 103 source files and 189 UI ids.
- Focused diplomacy/military/Endeavour/research tests: **32/32**, including the white-peace regression at 0 gold and 0 food.
- Deterministic 100-year campaign: **`ok:true`**, 40,040 ticks, final year 101, 13/13 ambitions, 3 eternal deeds, **3.261 ms/tick** (v3.11.0 baseline 3.276 ms/tick), no game over.
- Five browser journeys, each 100 years, using the real start screen, management tabs, build menu, roads, trade, diplomacy, military and research. Each wrote JSON and 1600/864 screenshots to `artifacts/journeys/`; all had zero page/console errors and no overflow.

| Journey | Final population | Buildings | Endeavours | Signature result | ms/tick |
| --- | ---: | ---: | ---: | --- | ---: |
| Builder | 43 | 37 | 15 | 16 road tiles, 12 trades | 2.789 |
| Warlord | 28 | 44 | 15 | 3 battles, 9 losses, 15 desertions, white peace year 71 | 2.909 |
| Diplomat | 43 | 36 | 15 | 4 alliances, relation 100 | 2.802 |
| Merchant | 20 | 34 | 15 | 52 trades, 1,543 food, 7,646 gold | 2.791 |
| Scholar | 46 | 36 | 15 | 17 technologies | 2.763 |

### What the journeys exposed

1. **No post-ambition direction.** All five paths now provide a multi-decade project queue, with tiers and later projects still available after the first century.
2. **A hard research ceiling.** The eight late technologies keep the scholar path meaningful after the original tree.
3. **Water and safety silently close immigration.** A realm with food and gold but no wells or garrison can lose population for decades without a clear cause. The journeys now build water, a garrison and housing before expanding; the panel's modifier summary and the existing settlement needs remain the player-facing diagnostics. This is a strategy trap, not a hidden free win.
4. **Trade alone is not an economy.** The merchant run initially exhausted its food market and collapsed to four residents. Preserving wood for farms, buying grain before the reserve empties and building water, housing and a garrison fixed the run (20 residents, 52 trades, 1,543 food, 7,646 gold) without removing the trade focus.
5. **Roads and housing are real.** The builder's 16 road tiles and 37 buildings are visible in the final realm; the narrow layout still fits.
6. **A war without battles is a dead end.** The warlord run could declare war but never fight it, and a food shortage made `SUE FOR PEACE` impossible, so the war ran for 70 years with 0 battles and 20 desertions. The annual war front now spawns a bounded border raid while a war is active, the existing named garrison fights it, and war exhaustion 35 unlocks a white peace that costs no gold or food. The rerun produced 3 battles, 9 losses, 15 desertions and a white peace in year 71. See [WAR_FRONT_AND_WHITE_PEACE.md](WAR_FRONT_AND_WHITE_PEACE.md).

## Known limits

- The browser journeys accelerate the clock internally (400 ticks per year) but perform every realm-changing action through visible controls. They are evidence of UI reachability, not a claim that a human would make the same choices.
- The campaign's 3.261 ms/tick is a Node measurement on this host; lower-end devices should be measured separately.
- Crown Endeavours is a management layer, not a new map or a new faction. Its depth comes from the existing systems it modifies.
