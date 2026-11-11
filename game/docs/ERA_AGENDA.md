# Second Crown Era Agendas

The Second Crown is the post-ambition choice in `state.ambitions.era`. Each era
runs three staged objectives through existing simulation state; there is no
parallel quest or economy system. The agenda is stored at
`state.ambitions.era.agenda`.

## Stage model

A stage stores its own `baseline`, `target`, `stage`, `completed` records and
persistent `modifiers`. Each stage target is measured from the metric that owns
it, so a mature realm gets a new relative goal instead of an already-capped
absolute threshold.

| Era | Stage 1 | Stage 2 | Stage 3 |
| --- | --- | --- | --- |
| Common Weal | Hold 180 more food | Raise housing capacity by 4 | Grow population by 4 |
| Guild Compact | Hold 350 more gold | Collect 300 more gold in taxes | Hold 500 more gold |
| Royal Ascendancy | Legitimacy at least 80 | Hold 400 more gold for the war chest | Collect 400 more gold in taxes |

The final royal ambition now opens at year 20 instead of year 25. Its population,
treasury and morale requirements are unchanged; the earlier gate simply gives
the era agenda real playable time in the deterministic 25-year audit.

The original Common Weal population stage was blocked at the 70-resident housing
cap. It now asks for one existing cottage's worth of capacity, and the following
stage fills those new homes. The campaign builder responds to that live objective
by placing the next cottage through the normal construction and logistics path.
This is harness behaviour mirroring a player decision, not a new simulation
system. The Guild and Crown stages previously used manual trades, soldiers and
prestige, which the deterministic campaign never generated; they now use the
already-running tax and treasury flows while keeping their original rewards.

## Persistent consumers

The modifiers are written by `ambitions.js` and read by the systems that already
own the relevant behaviour:

- `foodDemandFactor` — `economy.js` multiplies household food demand.
- `taxEfficiency` — `economy.js` multiplies collected taxes before net gold.
- `tradeFactor` — `market.js` multiplies the existing trade terms.
- `migrationFactor` — `population.js` multiplies the growth gate's migration
  factor.
- `legitimacyYear` — `politics.js` adds bounded annual legitimacy drift.
- `unrestFactor` — `events.js` multiplies only the rebellion event family.

The values are bounded and flow through the existing paths; there is no second
economy, population model, market or event engine.

## Save compatibility

`normalizeCrownEra()` and `normalizeCrownAgenda()` accept older saves with only
`{id, chosenTick, chosenYear}` and create a clean first agenda stage. Unknown era
ids are discarded, malformed modifiers fall back to neutral values, completed
stage records are filtered against the era definition, and `complete` is derived
from the stage count as well as the stored flag. No save-schema version bump is
required.

## Presentation

`getCrownEraSnapshot()` exposes `agenda.id`, `stage`, `stageNumber`, `total`,
title, description, reward, progress, progress label, completed records and
modifiers. `getAmbitionSnapshot()` returns that agenda as the current HUD card
until all three stages are complete; the existing `ui.js` card then shows the
Eternal Deed again. The agenda card uses:

- kicker: `ERA AGENDA · N OF 3`
- current objective and relative progress
- reward: `STAGE REWARD · ...`

## Campaign evidence

The 25-year run is the current acceptance path. The longer 50-year reference
sections below were recorded before the year-20 gate and therefore show later
stage years; they remain historical evidence for the same targets and rewards.

### 25-year Common Weal

- Final: `ok:true`, 10,040 ticks, **13/13 ambitions**, **3/3 agenda stages**.
- The final ambition now completes in year 20; Common Granary completes in year
  21, followed by the housing and population stages in years 21 and 23.
- All campaign requirements are green, including `agendaStage` and
  `agendaFeedback`; the agenda ends with `foodDemandFactor: 0.9506` and
  `migrationFactor: 1.12`.

### Common Weal (50-year, pre-gate reference)

- Final: `ok:true`, **3/3 stages**, 0.902 ms/tick.
- Stage 2 at year 35: housing capacity **70 → 74**, population **70 → 71**,
  food-demand factor **1.0 → 0.97**, migration factor **1.0 → 1.12**.
- Stage 3 at year 39: population **73 → 74**, legitimacy **98.28 → 100**,
  morale **93.35 → 96.33**, treasury **6,493.96 → 6,595.86**, collected taxes
  **11,547.38 → 11,848.31**, guilds **0 → 2**, and food-demand factor
  **0.97 → 0.9506** with annual legitimacy drift **0 → 0.005**.

### Guild Compact (pre-gate reward detail)

- Final: `ok:true`, **3/3 stages**, 0.927 ms/tick.
- Stage 1 completed in year 28; stage 2 in year 29; stage 3 in year 31.
- Stage 2 completion: collected taxes **8,295.93 → 8,629.88**, treasury
  **4,984.36 → 5,191.32**, trade factor **1.0 → 1.05**, guilds **0 → 0.02**.
- Stage 3 completion: treasury **5,361.44 → 5,538.20**, collected taxes
  **8,969.85 → 9,321.34**, guilds **0 → 0.28**, tax efficiency
  **1.03 → 1.0609**, trade factor **1.05 → 1.0815**, morale
  **94.04 → 95.26**.

### Royal Ascendancy (pre-gate reward detail)

- Final: `ok:true`, **3/3 stages**, 0.904 ms/tick.
- Stage 1 completed in year 26; stage 2 in year 28; stage 3 in year 29.
- Stage 2 completion: treasury **4,845.25 → 5,005.88**, legitimacy
  **98.31 → 98.32**, nobility **65 → 68**, and the rebellion weight multiplier
  **1.0 → 0.9**.
- Stage 3 completion: collected taxes **8,288.45 → 8,612.68**, treasury
  **5,005.88 → 5,211.11**, legitimacy **98.32 → 98.34**, nobility
  **68 → 70**, trade factor **1.0 → 1.02**, annual legitimacy drift
  **0.01 → 0.015**, with the rebellion weight still **0.9**.

## Verification recorded for this change

- Focused ambition tests: **20/20**.
- Full node suite: **787/787**; syntax/imports and 196 UI ids clean.
- 50-year reruns after the year-20 gate: Guild Compact stages land in years
  22, 23 and 25; Royal Ascendancy in years 20, 22 and 23. Both are `ok:true`,
  **3/3 agenda stages**, and all campaign requirements green.
- 12/12 player-profile runs (seed 20261108, 7, 99, 42 × builder, settler,
  ignorer) are green, including `agendaStage` and `agendaFeedback`; no stalls
  and no game over. The market bought food only while Common Granary was open.
- Chromium chronicle audit: both chronicles completed, Guild Compact chosen,
  HUD `ERA AGENDA · 1 OF 3`, `167 / 517 gold`, stage reward shown, **0** page
  and **0** console errors.

The 25-year and 50-year campaign evidence uses one deterministic seed and the
builder profile; the player-profile matrix adds four seeds and three build
orders. They prove the Common, Guild and Crown paths in those scenarios, not
every possible player build order. The browser audit checks the stage-one
agenda HUD; the First Session audit checks save/load/import persistence, not a
completed stage. There is no separate scalar named `stability` in the game:
legitimacy, morale and faction support are the stability signals used here. This
work was not committed or deployed.
